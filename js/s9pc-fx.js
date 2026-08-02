/* ripmaster3030studios — Section 9 / PlayCanvas: world-space combat FX (S9PCFx).
 *
 * `section9.html` draws tracers, muzzle flashes, sparks, debris, supply drops and bullet holes on
 * a transparent 2D canvas ABOVE the GL scene. That is a real limitation and it is visible: a
 * tracer painted on the overlay is not depth-tested, so it draws over the wall it went into, it
 * cannot be occluded by an operative it passes behind, and — the one that matters most for this
 * build — it never reaches the bloom pass, because the bloom pass already ran.
 *
 * Here they are geometry in the scene. Depth-tested, occluded correctly, and bright enough to be
 * picked up by `pc.CameraFrame`'s bright pass, which is what makes a muzzle flash actually light
 * up the frame instead of being a sticker on it.
 *
 * TWO MESHES, TWO BLEND MODES, TWO DRAW CALLS TOTAL:
 *   · additive — tracers, flashes, sparks, supply-drop glow. Rebuilt every frame.
 *   · alpha    — bullet holes / laser scorch and debris chunks. Rebuilt every frame.
 * Both are FIXED-SIZE buffers filled with degenerate triangles beyond the live count, so the
 * vertex format and byte length never change and PlayCanvas reuses the same VBO instead of
 * reallocating one per frame.
 *
 * ⚑ Everything here reads `G` and writes nothing. The simulation is `js/s9pc-game.js`; if an
 *   effect looks wrong the question is which of the two is wrong, and it is answerable.
 *
 * ═══ SPEED AND TIME IN THE WORLD — the brief, before the code (DESIGN-SYSTEM §8) ═══════════════
 *
 * `js/gfx-post.js` owns the GLASS: exposure, registration, the flare on the lens. This file owns
 * the WORLD: things that are actually out there, depth-tested, occluded, and lit by the bloom
 * pass. Three additions, one per verb the mobility tokens introduced.
 *
 * ── ⓐ THE PICKUP BURST — "more acid like effects when taking power ups" ─────────────────────
 * 1 MADE OF   FOIL, in the world. A hot-stamped card catching a light that is not there any more.
 *             ⚑ FOUR PLATES, NOT A RAINBOW — `GfxPost.INKS`, the same wheel the screen flare
 *             walks, so the world burst and the lens flare are the same event seen two ways.
 *             §6: hand-drawn, flat saturated ink, crude registration. A smooth spectrum is the
 *             default and the default has been rejected twice in this project.
 * 2 LIT BY    itself — additive, emissiveIntensity 3.2, i.e. above the bright-pass threshold, so
 *             it is LIGHT in the frame and not a sticker on it. That is the whole reason these
 *             effects are geometry.
 * 3 MOVES     ⚑ §1's rule, in three dimensions: a shell leaves the pickup and DECELERATES
 *             (r ∝ age^0.62, energy spreading into a bigger surface), and every piece's ink is
 *             keyed to HOW FAR IT HAS TRAVELLED — so the hue walks because the shard moved, not
 *             because a gradient scrolled. Measured as degrees of hue travel per shard.
 *             Three parts, because a ring alone is a UI animation: a camera-facing CORONA (the
 *             flare), fourteen SHARDS on ballistic paths (the die-cut confetti a pack rip throws),
 *             and a flat GROUND RING that expands where the drop was standing.
 * 4 SITS ON   the floor the drop sat on — §5, "everything sits on something". The ground ring is
 *             oriented flat at the pickup's own y, so the burst has a footprint and is not a
 *             sprite hanging in air.
 * 5 MEASURED  hue travel in degrees per shard over its life; peak saturation (a white burst is
 *             the failure); and that the burst fires on a REAL pickup in a driven match.
 *
 * ── ⓑ SPEED STREAKS — "extremely fast speed" ────────────────────────────────────────────────
 * 1 MADE OF   the air. Dust and haze in the arena lights, which exists at every speed and is only
 *             VISIBLE when it crosses the frame fast enough to leave a line in one exposure.
 * 2 LIT BY    the same cool key the player's own tracers use — YOURS COOL, the game's colour law.
 * 3 MOVES     it does not move; YOU do. The field is a wrapped world-space lattice, so the motes
 *             are anchored to the arena and you fly through them; each is drawn as a ribbon from
 *             where it is to where it was one exposure ago, which is a streak whose LENGTH IS
 *             YOUR SPEED. ⚑ Below a floor speed the length is under a pixel and the whole layer
 *             is skipped — ordinary movement does not streak, which is what makes RUSH read.
 * 4 SITS ON   nothing, and that is correct: it is suspended in the air between you and the wall.
 * 5 MEASURED  quad count is 0 at walking pace and rises monotonically with speed; streak length
 *             in metres is linear in measured speed.
 *
 * ── ⓒ THE DILATION GHOST — what SLIP looks like from inside it ──────────────────────────────
 * 1 MADE OF   a plate out of register. `G.timeScale` is 0.42 while a SLIP is live; the world's
 *             fast things are then crossing the frame at 2.38× relative to you.
 * 2 LIT BY    SLIP's own ink — magenta `[255,42,217]`, which is DESIGN-SYSTEM §2's FILL exactly.
 * 3 MOVES     each fast thing gets ONE ghost, displaced BACKWARDS along its own motion. That is
 *             where it was, and a frame that cannot resolve it draws both. ⚑ It is per-object
 *             and it is in the world, which is what distinguishes it from a screen filter: a
 *             tracer going away from you ghosts along ITS axis, not along the screen's.
 * 4 SITS ON   the object it is a ghost of.
 * 5 MEASURED  0 quads at timeScale 1 (asserted — at rest this file is byte-identical), rising
 *             with (1 − timeScale).
 */
window.S9PCFx = (function () {
  /* 700 → 860. The three new layers are bounded: a burst is 31 quads and at most 3 run at once
   * (93), the streak field is capped at 30, the ghost layer at 60. Ordinary combat peaks near
   * 150, so the headroom was already there — but `push` silently drops what does not fit, and the
   * new layers push LAST precisely so that if anything is ever dropped it is decoration and never
   * a tracer. The cap is raised so that stays true even in the worst frame. */
  const MAXA = 860;                                  // additive quads
  const MAXB = 300;                                  // alpha quads
  const BURSTS = 3;                                  // concurrent pickup bursts
  const SHARDS = 14, CORONA = 16;                    // per burst
  const MOTES = 30;                                  // the speed-streak lattice
  /* ⛔ THE TELEPORT THRESHOLD IS A SPEED, NOT A DISPLACEMENT, AND THAT CORRECTION CAME OUT OF A
   * DRIVEN MATCH. It was first written as "more than 1.2 m in one frame is a teleport", which is
   * 72 m/s at 60 Hz and looked like enormous headroom over FLIGHT's 11.5. But metres-per-FRAME is
   * frame-rate dependent: this container runs Section 9 at ~3 fps, where one legitimate frame of
   * FLIGHT covers 3.8 m — so the guard fired on every frame of a real RUSH run and the streak
   * layer measured as permanently dead. 30 m/s is 2.6× the fastest verb in the game and a tiny
   * fraction of any teleport (a respawn across the arena reads 160–450 m/s), and it means the
   * same thing at every frame rate.
   * ⚑ Worth keeping straight against the SMEAR, which is deliberately per-FRAME: an exposure is
   *   one frame, so displacement-per-frame is the physical quantity there. Here the question is
   *   "could a body have done that", which is a speed. Same measurement, different question. */
  const TELEPORT_MPS = 30;
  /* The four house inks, from GfxPost so there is ONE wheel in the project — with a local copy
   * only for the case where this file is loaded without it, because an FX layer must never be
   * the reason a game fails to start. */
  const INKS = (window.GfxPost && GfxPost.INKS) || [[255, 210, 59], [43, 255, 128], [39, 247, 228], [255, 42, 217]];
  const inkAt = x => { x -= Math.floor(x); return INKS[Math.min(3, Math.floor(x * 4))]; };

  /* One soft radial sprite serves every additive effect. Generated, never sampled — and a single
   * texture keeps the whole additive pass to one draw call. */
  function sprite(N, pow) {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
      const r = Math.min(1, Math.hypot(u, v));
      const a = Math.pow(Math.max(0, 1 - r), pow);
      const o = (y * N + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0); return c;
  }
  /* The bullet hole. A dark ring with a black core: a flat black disc reads as a hole punched in
   * the texture, and a ring is what a real impact leaves — crushed material around a cavity. */
  function holeSprite(N) {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
      const r = Math.hypot(u, v);
      let a = 0, l = 0;
      if (r < 0.34) { a = 1; l = 0.04; }                                   // cavity
      else if (r < 1) { a = Math.pow(1 - (r - 0.34) / 0.66, 1.6) * 0.72; l = 0.30; }   // crush ring
      const o = (y * N + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = Math.round(l * 255); d[o + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0); return c;
  }
  function texOf(app, canvas) {
    const t = new pc.Texture(app.graphicsDevice, { name: 'fx', width: canvas.width, height: canvas.height,
      format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR });
    t.setSource(canvas); return t;
  }

  function quadMesh(app, max) {
    const pos = new Float32Array(max * 4 * 3), uv = new Float32Array(max * 4 * 2), col = new Uint8Array(max * 4 * 4);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) {
      const v = i * 4, o = i * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
      const u = i * 8; uv[u] = 0; uv[u + 1] = 0; uv[u + 2] = 1; uv[u + 3] = 0; uv[u + 4] = 1; uv[u + 5] = 1; uv[u + 6] = 0; uv[u + 7] = 1;
    }
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(pos); mesh.setUvs(0, uv); mesh.setColors32(col); mesh.setIndices(idx);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return { mesh, pos, uv, col, idx, max };
  }

  function create(app, opts) {
    opts = opts || {};
    const A = quadMesh(app, MAXA), B = quadMesh(app, MAXB);

    const addMat = new pc.StandardMaterial();
    addMat.name = 's9pc-fx-add';
    addMat.useLighting = false;
    addMat.useFog = false;
    addMat.diffuse = new pc.Color(0, 0, 0);
    addMat.emissive = new pc.Color(1, 1, 1);
    addMat.emissiveMap = texOf(app, sprite(64, 1.9));
    // ⚑ Both are set. An unlit StandardMaterial routes vertex colour through whichever of the two
    //   the build wires up, and guessing wrong is a silently black effect layer rather than an
    //   error. Setting both costs nothing — the diffuse term is zero anyway.
    addMat.emissiveVertexColor = true;
    addMat.diffuseVertexColor = true;
    /* ⚑ HDR ON PURPOSE. A vertex colour is 8-bit, so the brightest additive contribution it can
     * make is 1.0 — and 1.0 is exactly the value the tonemapper is about to compress. A tracer
     * that tops out at "as bright as a lit wall" reads as a grey scratch. Pushing emissive past
     * 1.0 puts gunfire above the bloom threshold, which is the whole reason these effects are
     * geometry in the scene rather than stickers on the overlay: they get to be LIGHT. */
    addMat.emissiveIntensity = 3.2;
    /* ⚑ ON THIS MATERIAL, VERTEX ALPHA DOES NOTHING — AND EVERY CALLER ALREADY KNOWS THAT.
     * BLEND_ADDITIVE is ONE/ONE, so the fragment's alpha is never a blend factor: a quad pushed
     * at a=128 draws exactly as bright as one at a=255. Fading an additive effect therefore has
     * to be done by scaling RGB, and it is — all 11 pushes into the additive buffer pass alpha
     * 255 and premultiply their fade into the colour (`255 * fade * 0.7, …`).
     * Recorded because this is a trap that has already cost time elsewhere in the repo: the Rip
     * Rocketer port hit exactly this and spent two tuning rounds moving numbers that could not
     * move anything, then flagged this file as having "the same construction". It does — but not
     * the same defect, checked caller by caller before changing anything.
     * ⚠ So: if you add an additive effect here, fade it in RGB. Passing a fade in the alpha slot
     * will silently draw at full brightness, and you will tune the wrong knob looking for it. */
    addMat.blendType = pc.BLEND_ADDITIVE;
    addMat.depthWrite = false;
    addMat.cull = pc.CULLFACE_NONE;
    addMat.update();

    const alphaMat = new pc.StandardMaterial();
    alphaMat.name = 's9pc-fx-alpha';
    alphaMat.useLighting = false;
    alphaMat.useFog = true;
    alphaMat.diffuse = new pc.Color(0, 0, 0);
    alphaMat.emissive = new pc.Color(1, 1, 1);
    alphaMat.emissiveMap = texOf(app, holeSprite(64));
    alphaMat.opacityMap = alphaMat.emissiveMap;
    alphaMat.opacityMapChannel = 'a';
    alphaMat.emissiveVertexColor = true;
    alphaMat.diffuseVertexColor = true;
    alphaMat.blendType = pc.BLEND_NORMAL;
    alphaMat.depthWrite = false;
    alphaMat.cull = pc.CULLFACE_NONE;
    alphaMat.update();

    const root = new pc.Entity('fx');
    const miA = new pc.MeshInstance(A.mesh, addMat, root);
    const miB = new pc.MeshInstance(B.mesh, alphaMat, root);
    // FX are everywhere in the arena and are all camera-facing; culling them against a stale
    // bounding box is how a muzzle flash disappears when you look slightly away from the shooter.
    const huge = new pc.BoundingBox(new pc.Vec3(0, 0, 0), new pc.Vec3(500, 500, 500));
    miA.setCustomAabb(huge); miB.setCustomAabb(huge);
    miA.castShadow = false; miB.castShadow = false;
    root.addComponent('render', { meshInstances: [miB, miA], castShadows: false, receiveShadows: false });
    (app.__worldMirror || app.root).addChild(root);   // under the world mirror — see s9pc-app.js

    const R = new pc.Vec3(), U = new pc.Vec3(), F = new pc.Vec3(), tmp = new pc.Vec3();
    let nA = 0, nB = 0;

    function push(buf, n, max, p0, p1, p2, p3, r, g, b, a) {
      if (n >= max) return n;
      const o = n * 12, c = n * 16;
      const P = buf.pos, C = buf.col;
      P[o] = p0.x; P[o + 1] = p0.y; P[o + 2] = p0.z;
      P[o + 3] = p1.x; P[o + 4] = p1.y; P[o + 5] = p1.z;
      P[o + 6] = p2.x; P[o + 7] = p2.y; P[o + 8] = p2.z;
      P[o + 9] = p3.x; P[o + 10] = p3.y; P[o + 11] = p3.z;
      const rr = Math.max(0, Math.min(255, r | 0)), gg = Math.max(0, Math.min(255, g | 0)), bb = Math.max(0, Math.min(255, b | 0)), aa = Math.max(0, Math.min(255, a | 0));
      for (let k = 0; k < 4; k++) { C[c + k * 4] = rr; C[c + k * 4 + 1] = gg; C[c + k * 4 + 2] = bb; C[c + k * 4 + 3] = aa; }
      return n + 1;
    }
    const _a = new pc.Vec3(), _b = new pc.Vec3(), _c = new pc.Vec3(), _d = new pc.Vec3();
    function billboard(buf, n, max, x, y, z, rad, r, g, b, a) {
      _a.set(x - (R.x + U.x) * rad, y - (R.y + U.y) * rad, z - (R.z + U.z) * rad);
      _b.set(x + (R.x - U.x) * rad, y + (R.y - U.y) * rad, z + (R.z - U.z) * rad);
      _c.set(x + (R.x + U.x) * rad, y + (R.y + U.y) * rad, z + (R.z + U.z) * rad);
      _d.set(x - (R.x - U.x) * rad, y - (R.y - U.y) * rad, z - (R.z - U.z) * rad);
      return push(buf, n, max, _a, _b, _c, _d, r, g, b, a);
    }
    /* A tracer is a RIBBON between two world points, widened along the axis perpendicular to both
     * the round's direction and the view — i.e. it always faces you but keeps its own length. A
     * camera-facing square cannot express a bullet; a screen-aligned quad along the flight path can. */
    function ribbon(buf, n, max, ax, ay, az, bx, by, bz, w, r, g, b, a) {
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      const L = Math.hypot(dx, dy, dz) || 1e-4; dx /= L; dy /= L; dz /= L;
      let sx = dy * F.z - dz * F.y, sy = dz * F.x - dx * F.z, sz = dx * F.y - dy * F.x;
      const sl = Math.hypot(sx, sy, sz); if (sl < 1e-5) { sx = R.x; sy = R.y; sz = R.z; }
      else { sx /= sl; sy /= sl; sz /= sl; }
      _a.set(ax - sx * w, ay - sy * w, az - sz * w);
      _b.set(bx - sx * w, by - sy * w, bz - sz * w);
      _c.set(bx + sx * w, by + sy * w, bz + sz * w);
      _d.set(ax + sx * w, ay + sy * w, az + sz * w);
      return push(buf, n, max, _a, _b, _c, _d, r, g, b, a);
    }
    /* A decal lies ON its surface, oriented by the hit normal, not at the camera. */
    function oriented(buf, n, max, x, y, z, nrm, rad, r, g, b, a) {
      const t1 = (Math.abs(nrm[1]) > 0.9) ? [1, 0, 0] : [0, 1, 0];
      let ax = t1[1] * nrm[2] - t1[2] * nrm[1], ay = t1[2] * nrm[0] - t1[0] * nrm[2], az = t1[0] * nrm[1] - t1[1] * nrm[0];
      const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
      const bx = nrm[1] * az - nrm[2] * ay, by = nrm[2] * ax - nrm[0] * az, bz = nrm[0] * ay - nrm[1] * ax;
      _a.set(x - (ax + bx) * rad, y - (ay + by) * rad, z - (az + bz) * rad);
      _b.set(x + (ax - bx) * rad, y + (ay - by) * rad, z + (az - bz) * rad);
      _c.set(x + (ax + bx) * rad, y + (ay + by) * rad, z + (az + bz) * rad);
      _d.set(x - (ax - bx) * rad, y - (ay - by) * rad, z - (az - bz) * rad);
      return push(buf, n, max, _a, _b, _c, _d, r, g, b, a);
    }

    /* The FIRST-PERSON muzzle flash. The simulation's flash sits at `muzzleOrigin`, 0.4 m in
     * front of the eye — correct in the world, and completely hidden inside the viewmodel when
     * it is your own gun. So the viewmodel gets its own, placed off the rendered barrel. */
    let vmFlash = null;
    function setViewFlash(x, y, z, k, big) { vmFlash = k > 0 ? { x, y, z, k, big } : null; }

    /* ── ⓐ THE PICKUP BURST ───────────────────────────────────────────────────────────────────
     * ⚑ IT NEEDS NO COOPERATION FROM THE SIMULATION, AND THAT IS DELIBERATE. The obvious design
     *   is an event list the game pushes into — but `s9pc-game.js` sets `pw.got = 1` and filters
     *   the drop out of `G.pows` in the SAME step, so by the time this file runs the drop is
     *   already gone from the array. The object itself is not: a retained reference still carries
     *   the `got` flag the filter did not erase. So the detector diffs last frame's list against
     *   this frame's and asks the vanished ones whether they were TAKEN or merely expired.
     *   Two consequences worth having: the burst is reachable today with no other file changed
     *   (ROADMAP §5.3 — built ≠ reachable is this project's most common defect), and it cannot
     *   fire on a drop that timed out, which would be a burst for nothing happening.
     * ⚠ ONE BLIND SPOT, STATED RATHER THAN HIDDEN: a drop SPAWNED AND TAKEN IN THE SAME `step()`
     *   never exists at an update boundary, so this cannot see it and no burst fires. Found by
     *   driving the real game — the first reachability probe dropped a token at the player's feet
     *   and read zero bursts, which looked like the feature not working. It needs a player to be
     *   standing within 0.95 m of a spawn point at the instant one spawns there; the cost is one
     *   missing effect, never a wrong one. `burst()` is exported, so the game can close it with
     *   one call if it ever matters.
     * `burst()` is exported anyway, so the game can fire one deliberately for anything else. */
    const bursts = [];
    let powPrev = [];
    function burst(x, y, z, col, k) {
      const b = { x, y, z, t: 0, life: 0.72, k: k || 1,
                  hue: (Math.floor((x + z) * 3.1) & 3) * 0.25, sh: [] };
      /* Seeded off the position, not off Math.random at draw time: the same drop bursting the
       * same way twice is a bug you cannot reproduce otherwise. */
      let s = ((x * 73856093) ^ (z * 19349663) ^ (y * 83492791)) >>> 0;
      const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < SHARDS; i++) {
        const th = (i / SHARDS) * Math.PI * 2 + rnd() * 0.4;
        const ph = (rnd() - 0.22) * 1.5;
        const sp = 5.2 + rnd() * 5.6;
        b.sh.push({ dx: Math.cos(th) * Math.cos(ph), dy: Math.sin(ph) + 0.35, dz: Math.sin(th) * Math.cos(ph),
                    sp, spin: rnd() * 0.5 });
      }
      b.col = col || [255, 255, 255];
      bursts.push(b);
      while (bursts.length > BURSTS) bursts.shift();
      return b;
    }
    /* Fires the screen half at the same instant, if the shared chain is present. ⚠ The world
     * burst and the lens flare are ONE event: a pickup that lights the room without touching the
     * glass reads as two unrelated effects. Guarded and swallowed — the FX layer must not be able
     * to break a frame on account of a post chain that failed to come up. */
    function lensFlash(x, y, z, camEnt, k) {
      try {
        if (!window.GfxPost || !GfxPost.flash || !camEnt || !camEnt.camera) return;
        const p = camEnt.camera.worldToScreen(new pc.Vec3(x, y, z));
        const cw = app.graphicsDevice.canvas.clientWidth || app.graphicsDevice.width;
        const ch = app.graphicsDevice.canvas.clientHeight || app.graphicsDevice.height;
        // behind the eye ⇒ centre-weighted rather than mirrored to the wrong side of the frame
        const behind = p.z <= 0;
        GfxPost.flash({ x: behind ? 0.5 : p.x / Math.max(1, cw), y: behind ? 0.5 : p.y / Math.max(1, ch),
                        strength: (behind ? 0.55 : 1) * (k || 1) });
      } catch (e) {}
    }

    /* ── ⓑ THE SPEED-STREAK LATTICE ──────────────────────────────────────────────────────────
     * A fixed seeded cloud in a BOX AROUND THE CAMERA, wrapped modulo the box — so every mote is
     * anchored in the arena and you fly through them, rather than a particle system that follows
     * you and therefore never reads as speed at all. Same wrap-safe lattice the dogfight clouds
     * use, for the same reason: no seam, no allocation, no state. */
    const MOTE = [];
    (function () { let s = 0x9e3779b9;
      const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < MOTES; i++) MOTE.push([r(), r(), r()]);
    })();
    const SPAN = 9.0;                      // m — the box edge the lattice wraps on
    let pvx = 0, pvy = 0, pvz = 0, pvt = 0, spd = 0;
    let dirX = 0, dirY = 0, dirZ = 1;      // last non-zero travel direction, for the streak axis
    let nStreak = 0, nGhost = 0;           // counted per frame so `counts` can report them

    function update(G, camEnt, t) {
      const wt = camEnt.getWorldTransform();
      R.set(wt.data[0], wt.data[1], wt.data[2]);
      U.set(wt.data[4], wt.data[5], wt.data[6]);
      F.set(-wt.data[8], -wt.data[9], -wt.data[10]);
      nA = 0; nB = 0;

      /* ── the pickup detector, and the player's own measured speed ──────────────────────────
       * ⚑ Speed from the POSITION DELTA, never from an intended velocity — the same rule the
       *   smear is built on, and for the same reason: a sprint into a wall must not streak,
       *   because nothing moved. Real milliseconds, because the streak is an exposure. */
      const me = G.me;
      const dtR = pvt ? Math.min(0.25, Math.max(1e-4, (t - pvt) / 1000)) : 0; pvt = t;
      if (me && dtR > 0) {
        const ddx = me.x - pvx, ddy = me.y - pvy, ddz = me.z - pvz;
        const d = Math.hypot(ddx, ddy, ddz);
        /* ⛔ A TELEPORT IS NOT A SPEED, AND IT TOOK A DRIVEN MATCH TO SEE IT. Every respawn moves
         * the operative across the arena between two frames; fed to the estimator that reads as
         * ~32 m/s and the streak layer flashes on the instant you come back alive, which is the
         * one moment it must not. The one-pole below does not save it either — at this
         * container's ~8 fps its coefficient saturates at 1 and there is no smoothing left at all.
         * So a step larger than anything the game can produce RESETS the estimate instead of
         * feeding it: 1.2 m is 72 m/s at 60 Hz against FLIGHT's 11.5, so no real movement can
         * reach it and no teleport can miss it. Measured, not reasoned: `_place()` in a real
         * match read 31.68 m/s before this line and 0 after. */
        if (d / dtR > TELEPORT_MPS) { spd = 0; }
        else {
          // one-pole smoothing: a single stuttered frame must not flash the whole streak layer on
          spd = spd + (Math.min(40, d / dtR) - spd) * Math.min(1, dtR * 12);
          if (d > 1e-5) { dirX = ddx / d; dirY = ddy / d; dirZ = ddz / d; }
        }
      }
      if (me) { pvx = me.x; pvy = me.y; pvz = me.z; }

      const pows = G.pows || [];
      for (let i = 0; i < powPrev.length; i++) {
        const p = powPrev[i];
        if (p && p.got && pows.indexOf(p) < 0) {
          burst(p.x, p.y + 0.25, p.z, p.col, p.type === 'amp' || p.mob ? 1.25 : 1);
          lensFlash(p.x, p.y + 0.25, p.z, camEnt, p.type === 'amp' ? 1.2 : 0.95);
        }
      }
      powPrev = pows.slice();

      /* The world's clock. 1 at rest; SLIP_K (0.42) while the player holds a SLIP. Read
       * defensively — an older core has no such field and must keep working. */
      const ts = (typeof G.timeScale === 'number' && G.timeScale > 0) ? G.timeScale : 1;
      const dil = Math.max(0, Math.min(1, 1 - ts));
      // bursts age on the WORLD clock, so one taken in slow motion stretches with everything else
      for (let i = bursts.length - 1; i >= 0; i--) {
        bursts[i].t += dtR * ts;
        if (bursts[i].t >= bursts[i].life) bursts.splice(i, 1);
      }

      // ── tracers: head + fading tail, travelling at 340 m/s (the sim owns `p`) ──
      for (const tr of G.tracers) {
        const head = Math.min(tr.len, tr.p), tail = Math.max(0, head - tr.tail);
        if (head <= 0.02) continue;
        const fade = tr.p >= tr.len ? Math.max(0, Math.min(1, tr.t * 10)) : 1;
        const hx = tr.x0 + tr.dx * head, hy = tr.y0 + tr.dy * head, hz = tr.z0 + tr.dz * head;
        const tx = tr.x0 + tr.dx * tail, ty = tr.y0 + tr.dy * tail, tz = tr.z0 + tr.dz * tail;
        const k = fade * (tr.me ? 1 : 0.82);
        // ⚑ Yours are cool-white, theirs warm-orange. That is not decoration: the only way to read
        //   a firefight is to know at a glance which rounds are yours.
        if (tr.me) nA = ribbon(A, nA, MAXA, tx, ty, tz, hx, hy, hz, 0.042, 220 * k, 208 * k, 150 * k, 255);
        else nA = ribbon(A, nA, MAXA, tx, ty, tz, hx, hy, hz, 0.046, 240 * k, 118 * k, 48 * k, 255);
        // the round itself, a bright short core so a near miss reads as an OBJECT going past
        const cx = tr.x0 + tr.dx * Math.max(0, head - 0.5), cy = tr.y0 + tr.dy * Math.max(0, head - 0.5), cz = tr.z0 + tr.dz * Math.max(0, head - 0.5);
        nA = ribbon(A, nA, MAXA, cx, cy, cz, hx, hy, hz, 0.072, 255 * k, 248 * k, 225 * k, 255);
      }
      // ── muzzle flashes + impact pops ──
      for (const f of G.flashes) {
        const k = Math.max(0, Math.min(1, f.t / (f.max || 0.06)));
        const rad = (f.big ? 0.85 : 0.42) * (0.55 + 0.45 * k);
        const c = f.col || [255, 236, 176];
        nA = billboard(A, nA, MAXA, f.x, f.y, f.z, rad, c[0] * k, c[1] * k, c[2] * k, 255);
        nA = billboard(A, nA, MAXA, f.x, f.y, f.z, rad * 2.4, c[0] * k * 0.22, c[1] * k * 0.18, c[2] * k * 0.12, 255);
      }
      if (vmFlash) {
        const k = vmFlash.k, c = [255, 236, 176];
        /* ⚠ SIZE IS IN METRES AT ~1.1 m FROM THE EYE. At fov 0.97 the half-height of the frame at
         * that distance is 0.61 m, so a "0.6 m" halo is a full-screen white disc — which is
         * exactly what the first attempt drew. Kept deliberately small: the LIGHT does the work,
         * the billboard is only the hot core at the barrel. */
        nA = billboard(A, nA, MAXA, vmFlash.x, vmFlash.y, vmFlash.z, (vmFlash.big ? 0.058 : 0.034) * (0.6 + 0.4 * k), c[0] * k, c[1] * k, c[2] * k, 255);
        nA = billboard(A, nA, MAXA, vmFlash.x, vmFlash.y, vmFlash.z, (vmFlash.big ? 0.15 : 0.098) * (0.6 + 0.4 * k), c[0] * k * 0.22, c[1] * k * 0.18, c[2] * k * 0.12, 255);
      }
      /* ── ⓐ the pickup burst: corona · shards · ground ring ──────────────────────────────────
       * ⚠ FADE IN RGB, NOT IN ALPHA. BLEND_ADDITIVE is ONE/ONE so vertex alpha is never a blend
       *   factor here — see the note on `addMat` above. Every push below premultiplies its fade
       *   into the colour and passes alpha 255, like the eleven that came before it. */
      for (const b of bursts) {
        const uu = b.t / b.life;                            // 0..1 through its life
        /* THE FRONT DECELERATES: r ∝ u^0.62. A shell spends its energy into an ever-bigger
         * surface, so it is fast at the pickup and slow at the edge — which is also what makes
         * the ink walk quickly at the moment you take the drop and settle as it dies. */
        const rr = Math.pow(uu, 0.62) * 3.1;
        const fd = Math.pow(1 - uu, 1.7) * b.k;
        // the corona — camera-facing, the flare of the stamped surface
        for (let i = 0; i < CORONA; i++) {
          const a = (i / CORONA) * Math.PI * 2;
          /* ⚑ THE §1 ACCEPTANCE TEST, EXPRESSED AS ARITHMETIC: the ink index carries `rr`, so
           *   the colour of any one corona segment is a function of HOW FAR THE FRONT HAS GOT.
           *   Nothing is painted on — the plate changes because the geometry moved. */
          const c = inkAt(b.hue + rr * 0.42 + i * 0.031);
          const px = b.x + Math.cos(a) * rr, pz = b.z + Math.sin(a) * rr;
          const py = b.y + Math.sin(a * 2.0) * 0.14 * rr;
          nA = billboard(A, nA, MAXA, px, py, pz, 0.10 + 0.16 * uu,
            c[0] * fd * 0.9, c[1] * fd * 0.9, c[2] * fd * 0.9, 255);
        }
        // the shards — ballistic, each one's ink keyed to the distance IT has travelled
        for (let i = 0; i < b.sh.length; i++) {
          const s = b.sh[i];
          const d = s.sp * b.t, drop = 5.0 * b.t * b.t;
          const hx = b.x + s.dx * d, hy = b.y + s.dy * d - drop, hz = b.z + s.dz * d;
          const back = Math.min(d, 0.30 + 1.1 * uu);
          const c = inkAt(b.hue + d * 0.30 + s.spin);
          nA = ribbon(A, nA, MAXA, hx - s.dx * back, hy - s.dy * back, hz - s.dz * back, hx, hy, hz,
            0.032, c[0] * fd, c[1] * fd, c[2] * fd, 255);
        }
        // the ground ring — §5, the burst has a footprint. Flat, at the drop's own floor.
        nA = oriented(A, nA, MAXA, b.x, b.y - 0.22, b.z, [0, 1, 0], rr * 1.15,
          b.col[0] * fd * 0.32, b.col[1] * fd * 0.32, b.col[2] * fd * 0.32, 255);
      }
      // ── sparks ──
      for (const s of G.sparks) {
        const k = Math.max(0, Math.min(1, s.t * 3));
        nA = billboard(A, nA, MAXA, s.x, s.y, s.z, 0.045 + 0.03 * k, s.col[0] * k, s.col[1] * k, s.col[2] * k, 255);
      }
      // ── supply drops: a bobbing core plus a wide halo, so they read across the arena ──
      for (const pw of G.pows) {
        if (pw.got) continue;
        const fy = pw.y + 0.25 + Math.sin((G.t + pw.t) * 3) * 0.12;
        const c = pw.col, amp = pw.type === 'amp';
        const pul = 0.72 + 0.28 * Math.sin((G.t + pw.t) * (amp ? 7 : 4));
        nA = billboard(A, nA, MAXA, pw.x, fy, pw.z, 0.22 * pul, c[0], c[1], c[2], 255);
        nA = billboard(A, nA, MAXA, pw.x, fy, pw.z, (amp ? 1.5 : 0.95) * pul, c[0] * 0.20, c[1] * 0.20, c[2] * 0.20, 255);
      }
      // ── debris chunks (alpha, in the victim's tint) ──
      for (const c of G.chunks) {
        const k = Math.max(0, Math.min(1, c.t * 1.4));
        nB = billboard(B, nB, MAXB, c.x, c.y, c.z, c.s * 0.9, c.col[0], c.col[1], c.col[2], 255 * k);
      }
      // ── decals: bullet holes stay alpha, laser scorch goes additive (it is a glow, not a hole) ──
      for (const dc of G.decals) {
        const fade = Math.max(0, Math.min(1, dc.life / dc.max));
        if (dc.type === 'laser') nA = oriented(A, nA, MAXA, dc.x, dc.y, dc.z, dc.n, dc.r * 2.0, 255 * fade * 0.7, 150 * fade * 0.7, 50 * fade * 0.7, 255);
        else nB = oriented(B, nB, MAXB, dc.x, dc.y, dc.z, dc.n, dc.r * 1.6, 255, 255, 255, 235 * fade);
      }

      /* ── ⓑ SPEED STREAKS ────────────────────────────────────────────────────────────────────
       * ⛔ ZERO AT WALKING PACE, and that is the assertion that matters. `V0` is Section 9's walk
       *   (4.3 m/s), so ordinary movement contributes exactly nothing and the loop is not entered
       *   — an effect that is always on is wallpaper and stops meaning speed. It opens between
       *   sprint (7.0) and boots (9.6) and is full by RUSH (4.3 × 2.2 = 9.5) and FLIGHT (11.5).
       * ⚑ The streak's LENGTH IS THE DISTANCE COVERED IN ONE EXPOSURE. Not a tuned constant: the
       *   mote is drawn from where it is to where it was `dtR` ago, which is what a real exposure
       *   of a passing mote records. Faster ⇒ longer, by construction rather than by a curve. */
      const V0 = 4.3, V1 = 11.5;
      nStreak = 0; nGhost = 0;
      if (me && spd > V0 && dtR > 0) {
        const k = Math.min(1, (spd - V0) / (V1 - V0));
        // direction of travel, from the same delta the speed was measured from
        const dx = dirX, dy = dirY, dz = dirZ;
        /* metres of streak = speed × exposure. ⚠ The exposure is capped at 0.05 s, which is the
         * same clamp `game.step` uses on its own dt — so on a machine dropping to 3 fps the motes
         * stretch to the length the SIMULATION actually advanced, not to the length the wall
         * clock did. Without it a stutter draws 1.6 m streaks through a room you did not cross. */
        const len = Math.max(0.20, spd * Math.min(0.05, dtR) * 3.4);
        for (let i = 0; i < MOTES; i++) {
          const m = MOTE[i];
          /* Wrapped to a box centred on the camera: the mote is a fixed point in the arena and
           * `wrap` only chooses WHICH copy of the lattice you are near, so nothing follows you. */
          const wrap = (v, c) => { const s = SPAN, a = ((v * s + c + s * 0.5) % s + s) % s; return c + a - s * 0.5; };
          const mx = wrap(m[0], me.x), my = wrap(m[1], me.y + 0.4), mz = wrap(m[2], me.z);
          const dd = Math.hypot(mx - me.x, my - (me.y + 1.5), mz - me.z);
          if (dd < 0.9 || dd > SPAN * 0.5) continue;      // not inside your own head, not miles off
          const near = 1 - Math.min(1, dd / (SPAN * 0.5));
          const a = k * near * 0.85;
          // YOURS COOL — the game's colour law, the same one the tracers obey
          const before = nA;
          nA = ribbon(A, nA, MAXA, mx - dx * len, my - dy * len, mz - dz * len, mx, my, mz,
            0.012 + 0.010 * k, 150 * a, 205 * a, 235 * a, 255);
          if (nA > before) nStreak++;
        }
      }

      /* ── ⓒ THE DILATION GHOST ───────────────────────────────────────────────────────────────
       * One magenta copy of each fast thing, displaced BACKWARDS along its own motion. At
       * `timeScale` 1 the guard is false and this file draws exactly what it drew before the
       * slow-mo work existed — which is the acceptance measurement, not a hope. */
      if (dil > 0.02) {
        /* ⚠ 0.85, not the 0.55 it was first written at. The additive material multiplies by
         * emissiveIntensity 3.2, but so does everything else in this file — so the number to
         * judge against is the TRACER's own 240, not 255. At 0.55 a SLIP ghost came out at
         * rgb(27,4,23), about a tenth of the thing it is a ghost of, which is not a plate out of
         * register, it is a rounding error. Measured against the tracer it ghosts, not in the
         * abstract. */
        const gk = dil * 0.85, M = INKS[3];
        let gn = 0; const g0 = nA;
        for (const tr of G.tracers) {
          if (gn++ > 28) break;
          const head = Math.min(tr.len, tr.p); if (head <= 0.02) continue;
          const back = Math.min(head, 1.6 + 4.0 * dil);
          const hx = tr.x0 + tr.dx * head, hy = tr.y0 + tr.dy * head, hz = tr.z0 + tr.dz * head;
          nA = ribbon(A, nA, MAXA, hx - tr.dx * back, hy - tr.dy * back, hz - tr.dz * back, hx, hy, hz,
            0.030, M[0] * gk * 0.30, M[1] * gk * 0.30, M[2] * gk * 0.30, 255);
        }
        for (const s of G.sparks) {
          if (gn++ > 60) break;
          const b2 = 0.10 + 0.22 * dil;
          nA = billboard(A, nA, MAXA, s.x - (s.vx || 0) * b2, s.y - (s.vy || 0) * b2, s.z - (s.vz || 0) * b2,
            0.038, M[0] * gk * 0.34, M[1] * gk * 0.34, M[2] * gk * 0.34, 255);
        }
        nGhost = nA - g0;
      }

      // collapse the unused tail to a degenerate point so the buffer length never changes
      for (const [buf, n, max] of [[A, nA, MAXA], [B, nB, MAXB]]) {
        for (let i = n; i < max; i++) { const o = i * 12; for (let k = 0; k < 12; k++) buf.pos[o + k] = 0;
          const c = i * 16; for (let k = 0; k < 16; k++) buf.col[c + k] = 0; }
        buf.mesh.setPositions(buf.pos); buf.mesh.setColors32(buf.col);
        buf.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
      }
      return { add: nA, alpha: nB };
    }

    return { update, setViewFlash, burst, root, addMat, alphaMat,
      /* ⚑ THE NEW LAYERS RIDE IN `counts`, and that is deliberate rather than lazy: `counts` is
       * already surfaced by `__s9pc.s.fx` and printed in the F8 engine readout, so the burst, the
       * streaks and the ghost are observable from the hooks that exist instead of needing new
       * ones in a file this agent does not own. Built ≠ reachable is this project's most common
       * defect (ROADMAP §5.3), and a counter nobody can read is the same defect one level down. */
      get counts() { return { add: nA, alpha: nB, maxAdd: MAXA, maxAlpha: MAXB,
                              bursts: bursts.length, streaks: nStreak, ghosts: nGhost,
                              speed: +spd.toFixed(2) }; },
      /* Read-backs for the harness. `speed` and `bursts` are the two numbers the speed/time work
       * is asserted on, and neither is visible from outside otherwise. */
      get speed() { return spd; },
      get bursts() { return bursts.length; },
      dispose() { try { root.destroy(); } catch (e) {} } };
  }

  return { create, MAXA, MAXB, BURSTS, SHARDS, CORONA, MOTES, INKS };
})();

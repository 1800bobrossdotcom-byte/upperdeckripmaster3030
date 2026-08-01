/* upperdeckripmaster3030 — Section 9 / PlayCanvas: world-space combat FX (S9PCFx).
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
 */
window.S9PCFx = (function () {
  const MAXA = 700;                                  // additive quads
  const MAXB = 300;                                  // alpha quads

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

    function update(G, camEnt, t) {
      const wt = camEnt.getWorldTransform();
      R.set(wt.data[0], wt.data[1], wt.data[2]);
      U.set(wt.data[4], wt.data[5], wt.data[6]);
      F.set(-wt.data[8], -wt.data[9], -wt.data[10]);
      nA = 0; nB = 0;

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

      // collapse the unused tail to a degenerate point so the buffer length never changes
      for (const [buf, n, max] of [[A, nA, MAXA], [B, nB, MAXB]]) {
        for (let i = n; i < max; i++) { const o = i * 12; for (let k = 0; k < 12; k++) buf.pos[o + k] = 0;
          const c = i * 16; for (let k = 0; k < 16; k++) buf.col[c + k] = 0; }
        buf.mesh.setPositions(buf.pos); buf.mesh.setColors32(buf.col);
        buf.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
      }
      return { add: nA, alpha: nB };
    }

    return { update, setViewFlash, root, addMat, alphaMat, get counts() { return { add: nA, alpha: nB, maxAdd: MAXA, maxAlpha: MAXB }; },
      dispose() { try { root.destroy(); } catch (e) {} } };
  }

  return { create, MAXA, MAXB };
})();

/* ripmaster3030studios — THE CITY (working title) · step 1: the bird.
 *
 * Brief: docs/CITY-GAME.md. This answers ONE question — acceptance test 1, "does the place read
 * from the air" — and deliberately answers nothing else.
 *
 * ⚑ ALMOST NONE OF THIS IS NEW, WHICH IS THE POINT. The pieces were already in the repo and the
 *   only reason they were not a game is that nobody had put them in one room:
 *     · `RoninWorld`      the .wld parser, the collider, and a flight model with a FUEL BUDGET
 *     · `S9PCWorld`       .wld triangle soup -> PlayCanvas meshes with procedural albedo/normal/
 *                         gloss, material class picked from the collision box a triangle sits in
 *     · `S9World.kindOf`  what names a surface
 *     · `GfxPost`         the measured post chain (0.94 knee et al) — its numbers, not new ones
 *
 * ⚠ THE MIRROR IS NOT OPTIONAL. RoninWorld's basis is (x right, y up, z FORWARD) — LEFT-handed —
 *   and a PlayCanvas camera's is right-handed. s9pc-app.js records the whole diagnosis: a yaw
 *   offset can make FORWARD agree and can never make RIGHT agree, because a rotation preserves
 *   handedness, and the symptom is three separate-looking bug reports ("mouse inverted", "strafe
 *   backwards", "aim off") from one defect. The fix is a SCALE. Everything in game coordinates
 *   hangs under `worldMirror` at (-1,1,1); the camera stays OUTSIDE it at (-x, y, z) with yaw
 *   PI - gameYaw. `S9PCWorld.buildFor` already parents into `app.__worldMirror`, so that name is
 *   part of the contract rather than a local convenience.
 */
window.CityApp = (function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  const cv = $('cv');
  if (!cv) return null;

  /* ── the hard requirement, stated rather than crashed into ─────────────────────────────────── */
  const gl2 = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); }
                       catch (e) { return false; } })();
  if (!gl2 || !window.pc) {
    const n = $('nogl'); if (n) { n.classList.add('show');
      const w = $('noglWhy'); if (w) w.textContent = !window.pc ? 'the engine bundle did not load'
                                                                : 'this browser reports no WebGL 2 context'; }
    return null;
  }

  const app = new pc.Application(cv, { graphicsDeviceOptions: { antialias: true, alpha: false } });
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);

  /* ⚑ ONE definition of "weak device" for the whole site — GfxPost.dprCap(). Backing-store
   * resolution is the dominant mobile cost and it is the same answer every other game here uses.
   * ⚠ Never under 1: the recorded failure was a multiplier that pushed the effective ratio to
   *   0.63, i.e. below one CSS pixel, which is visibly soft. */
  const dprCap = (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2;
  app.graphicsDevice.maxPixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, dprCap));
  const resize = () => { const b = cv.getBoundingClientRect();
    app.resizeCanvas(Math.max(2, b.width | 0), Math.max(2, b.height | 0)); };
  window.addEventListener('resize', resize);

  // ── the mirror. See the header. ─────────────────────────────────────────────────────────────
  const world = new pc.Entity('worldMirror');
  world.setLocalScale(-1, 1, 1);
  app.root.addChild(world);
  app.__worldMirror = world;

  /* ── LIGHT — brief §2. "One low sun and a lot of sky", because in a mellow game the light does
   * the emotional work and nothing else has to. Warm key, cool sky fill, and the ratio kept wide
   * enough that a north wall is genuinely a different colour from a south one. */
  const sun = new pc.Entity('sun');
  sun.addComponent('light', {
    type: 'directional', color: new pc.Color(1.00, 0.89, 0.72), intensity: 2.9,
    castShadows: true, shadowBias: 0.04, normalOffsetBias: 0.05,
    shadowDistance: 140, shadowResolution: 2048, numCascades: 3, shadowType: pc.SHADOW_PCF3,
  });
  sun.setLocalEulerAngles(-24, 38, 0);            // LOW — long shadows are the whole mood
  world.addChild(sun);

  app.scene.ambientLight = new pc.Color(0.38, 0.46, 0.58);   // cool sky fill
  /* ⚠ `app.scene.fog` IS GETTER-ONLY in PlayCanvas 2.0 — assigning to it throws
     "Cannot set property fog of #<$i> which has only a getter", and because this runs at module
     scope that took the whole app down before it existed (the probe read "NO APP" rather than a
     broken scene). Set the sub-properties, exactly as s9pc-app.js does. */
  app.scene.fog.type = pc.FOG_LINEAR;
  app.scene.fog.color = new pc.Color(0.56, 0.76, 0.91);
  /* ⚠ THE HAZE GOES LIGHTER WITH DISTANCE IN DAYLIGHT, not darker — s9pc-app.js's recorded note.
   * Range is set from the level's measured bounds once it loads, not picked by eye: the same
   * "geometry outside the visible range" correctness fix the duel stages needed. */
  app.scene.fog.start = 40; app.scene.fog.end = 260;
  app.scene.skyboxIntensity = 1.0;

  // ── camera. Outside the mirror; see the header for why. ─────────────────────────────────────
  const cam = new pc.Entity('camera');
  cam.addComponent('camera', {
    clearColor: new pc.Color(0.56, 0.76, 0.91),
    /* ⚠ nearClip IS A DEPTH-PRECISION DIAL, not just a clipping one. At 0.12 m against a far clip
     * measured in kilometres, almost the entire depth buffer is spent inside the first metre and
     * coplanar ground surfaces a few hundred metres out z-fight into moiré. A bird's camera has no
     * use for 12 cm. farClip is set from the streamer's own reach in loadWorld(). */
    fov: 62, nearClip: 0.4, farClip: 400,
  });
  app.root.addChild(cam);

  // ═══ THE BIRD ═══════════════════════════════════════════════════════════════════════════════
  /* ⚠ PLACEHOLDER BODY, ON PURPOSE. Step 1 asks whether the CITY reads from the air; a beautiful
   * bird over a place that does not read would answer the wrong question, and DESIGN-SYSTEM §1
   * gets its turn when the body is its own step. What IS real here is how it MOVES. */
  const bird = new pc.Entity('bird');
  const wings = [];
  {
    const mat = new pc.StandardMaterial();
    mat.diffuse = new pc.Color(0.10, 0.11, 0.14);
    mat.gloss = 0.30; mat.useMetalness = true; mat.metalness = 0.0;
    mat.update();
    const body = new pc.Entity('body');
    body.addComponent('render', { type: 'capsule' });
    body.setLocalScale(0.20, 0.34, 0.20);
    body.setLocalEulerAngles(90, 0, 0);                       // lying along travel
    body.render.meshInstances.forEach(mi => { mi.material = mat; });
    bird.addChild(body);
    /* Two wings on their own pivots at the shoulder, so a beat is a ROTATION about the body rather
     * than a scale or a bob. Placeholder shapes, real hinge — the hinge is what step() drives. */
    for (const s of [-1, 1]) {
      const piv = new pc.Entity('shoulder' + s);
      piv.setLocalPosition(s * 0.06, 0.02, -0.02);
      const w = new pc.Entity('wing' + s);
      w.addComponent('render', { type: 'box' });
      w.setLocalScale(0.62, 0.03, 0.22);
      w.setLocalPosition(s * 0.33, 0, 0);
      w.render.meshInstances.forEach(mi => { mi.material = mat; });
      piv.addChild(w); bird.addChild(piv);
      wings.push({ e: piv, s });
    }
  }
  world.addChild(bird);

  /* ── FLIGHT ─────────────────────────────────────────────────────────────────────────────────
   * `RoninWorld.MOVE` is tuned for a ninja on foot; a bird is a different animal and gets its own
   * numbers. What is KEPT is the one idea worth keeping — ⚑ WING ENERGY DRAINS IN THE AIR AND
   * REFILLS ON THE GROUND, i.e. a bird that MUST LAND, which is what makes a perch a decision
   * rather than a pause.
   *
   * ⛔ THE FIRST VERSION WAS A HELICOPTER, AND THE ARC SAID SO. Held SPACE was a sustained
   *   +15 m/s² and held W a sustained +26, so 70 driven frames took the bird from y 2.5 to
   *   **y 48.5 over a level whose highest roof is 17.5**, and then straight out through the side
   *   at (41, 36) against bounds of ±27 × ±23. Everything about that reads as flying a drone.
   *
   * ⚑ THE MODEL THAT IS ACTUALLY A BIRD, and every term is a force with a state variable:
   *     · a WINGBEAT IS DISCRETE. `flapEvery` is a refractory period, so SPACE is a beat you
   *       spend, not a button you lean on. Holding it gives you beats at a wing's rate.
   *     · GLIDING IS FREE AND IS THE DEFAULT. Speed² buys lift; at `glideSpd` it exactly cancels
   *       gravity, so a fast bird sinks slowly and a slow one drops. Height and speed are one
   *       currency — the same trade DOGFIGHT's flight model already proves works.
   *     · LIFT IS CAPPED. Uncapped, spd² at the speed cap produced +34 m/s² of climb and the bird
   *       became a rocket. 1.35× gravity leaves ~5 m/s² of climb, which is a bird.
   *     · DIVING IS FREE, AND IT TUCKS. SHIFT cuts drag as well as adding descent, so a dive is
   *       genuinely how you buy speed back — the swoop.
   *     · ONLY THE WINGS COST. W (beat forward) and SPACE (beat up) drain; glide and dive do not.
   *       So the loop is climb hard → glide far → perch, and it is the fuel that makes it mellow.
   * ⚠ Nothing here reads absolute time, so a bird sitting on a ledge is genuinely still — the
   *   DESIGN-SYSTEM §4 rule this project keeps having to re-learn. */
  const FLY = {
    thrust: 14,          // held W — a beat forward, not an engine
    dragK: 0.0125,       // QUADRATIC. v halves in ~4 s from 20 m/s, so a glide carries.
    tuckDrag: 0.45,      // × dragK while diving — a tucked bird is cleaner
    gravity: 14,
    lift: 0.062,         // spd² × this = lift. glideSpd = sqrt(gravity/lift) ≈ 15 m/s.
    liftCap: 1.35,       // × gravity. THE ROCKET GUARD — see above.
    flapV: 6.2,          // one beat, straight into vy. An impulse, not an acceleration.
    flapFwd: 2.6,        //   …and a little forward: a bird beats down AND back
    flapEvery: 0.32,     // s. The refractory period IS what makes it a wingbeat.
    flapCost: 0.050,     // wing energy per beat
    thrustCost: 0.16,    //   …and per second of held forward beating
    dive: 16,            // SHIFT
    turn: 2.2,           // rad/s at speed; scaled down when slow — no rudder without airflow
    maxSpd: 28,
    vDamp: 0.35,         // gentle, or a dive can never build speed
    refill: 0.62,        // per second perched
    minLaunch: 0.12,     // cannot beat below this
  };

  const me = { x: 0, y: 6, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, fuel: 1, onGround: false,
               speed: 0, flapT: 0, beat: 0, alt: 0 };
  const keys = Object.create(null);
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys[k] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault(); });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  /* ── THE WORLD ──────────────────────────────────────────────────────────────────────────────
   * ⛔ THE CITY IS STREAMED, BECAUSE IT IS 3.84 km ACROSS. Artist, 2026-08-03: *"that is too small
   *   of a world, maybe that is a place in it, but we are talking mmorpg size or aspiring to that
   *   size."* `lido.wld` is 54 x 46 m — it is now ONE CHUNK of `CityWorld`, a landmark you can fly
   *   to, and the world around it is generated. See `js/city-world.js` for why generated.
   *
   * ⚑ TWO TIERS, AND THE SECOND ONE IS A DRAW-CALL DECISION RATHER THAN A TRIANGLE ONE. Near
   *   chunks are built individually at full detail and are the only ones that collide, because
   *   they are the only ones you can touch. The horizon is built from 4 x 4 REGIONS at LOD 1 —
   *   merged, so a kilometre of city costs a couple of dozen draw calls instead of several
   *   hundred. `S9PCWorld.buildFor` merges per material class within one map, so merging the map
   *   is the whole trick.
   *
   * ⚠ LOD 1 MUST EMIT THE SAME MASSES AS LOD 0. `city-world.js` draws every building's height and
   *   footprint before any detail, so the random sequence lines up and a tower does not change
   *   height as you fly toward it. That is a contract between the two tiers, not an optimisation.
   *
   * ⚠ NOTHING IS CACHED, AND THAT IS THE POINT: `genChunk` is pure, so a chunk that leaves range
   *   is destroyed outright and rebuilt identically when you turn round. A cache here would be a
   *   second source of truth for the shape of the world. */
  let ready = false, bounds = null, collide = null, LEVEL = null;
  const NEAR_R = 2;                    // chunks: 5 x 5 full-detail = 600 m of city you can land on
  const REGION = 4;                    // chunks per side of a horizon region
  const FAR_R = 2;                     // regions: 5 x 5 = 20 x 20 chunks = 2.4 km of visible city
  const BUILD_BUDGET = 2;              // chunk builds per frame — a hitch is worse than a pop-in

  const near = new Map();              // "cx,cz"      -> { ent, solids }
  const far = new Map();               // "rx,rz"      -> { ent }
  const pending = [];                  // work queue, nearest first
  let landmarkCache = null;            // authored .wld files, fetched once

  const CW = window.CityWorld;
  const key = (a, b) => a + ',' + b;

  function destroyEntry(e) {
    if (!e || !e.ent) return;
    /* ⚠ Meshes are GPU buffers and PlayCanvas does not free them with the entity — a streamer
     * that only calls destroy() on the entity leaks a vertex buffer per chunk, which over a few
     * minutes of flying is the whole GPU. Free the meshes we made, and only those. */
    if (e.parts) for (const p of e.parts) { try { if (p.mesh && p.mesh.destroy) p.mesh.destroy(); } catch (err) {} }
    e.ent.destroy();
  }

  function buildChunk(cx, cz) {
    const c = CW.genChunk(cx, cz, 0);
    let built = null;
    if (c.landmark && landmarkCache && landmarkCache[c.landmark.file]) {
      built = buildLandmark(c.landmark, c);      // the authored place, in its chunk
    }
    const map = { name: 'c' + cx + '_' + cz, solids: c.solids, open: true,
                  x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1 };
    const lvl = c.solids.length ? S9PCWorld.buildFor(app, map) : null;
    near.set(key(cx, cz), { ent: lvl ? lvl.root : null, parts: lvl ? lvl.parts : null,
                            stats: lvl ? lvl.stats : null,
                            solids: c.solids, extra: built, district: c.district });
    if (!LEVEL) LEVEL = lvl;                     // first built chunk backs the dev-hook stats
  }

  /* An authored `.wld` keeps its own geometry and its own 170 collision boxes; all this does is
   * translate it into its chunk. ⚠ Same box-shape translation as everywhere else — see the note
   * on the silent classification failure below. */
  function buildLandmark(lm, c) {
    const w = landmarkCache[lm.file];
    if (!w) return null;
    const ox = c.x0 + CW.CHUNK / 2, oz = c.z0 + CW.CHUNK / 2;
    const v = new Float32Array(w.verts.length);
    for (let i = 0; i + 6 <= v.length; i += 6) {
      v[i] = w.verts[i] + ox; v[i + 1] = w.verts[i + 1]; v[i + 2] = w.verts[i + 2] + oz;
      v[i + 3] = w.verts[i + 3]; v[i + 4] = w.verts[i + 4]; v[i + 5] = w.verts[i + 5];
    }
    const solids = [];
    for (const b of (w.boxes || [])) {
      if (!b || !b.lo || !b.hi) continue;
      solids.push({ x0: b.lo[0] + ox, y0: b.lo[1], z0: b.lo[2] + oz,
                    x1: b.hi[0] + ox, y1: b.hi[1], z1: b.hi[2] + oz,
                    kind: window.S9World ? S9World.kindOf(b.name) : 'wall', name: b.name || '' });
    }
    const lvl = S9PCWorld.buildFor(app, { name: lm.name, mesh: { verts: v }, solids, open: true });
    for (const b of solids) c.solids.push(b);     // authored boxes collide like generated ones
    return lvl;
  }

  function buildRegion(rx, rz) {
    const g = CW.genRegion(rx * REGION, rz * REGION, REGION);
    if (!g.solids.length) { far.set(key(rx, rz), { ent: null }); return; }
    const lvl = S9PCWorld.buildFor(app, { name: 'r' + rx + '_' + rz, solids: g.solids, open: true,
                                          x0: g.x0, z0: g.z0, x1: g.x1, z1: g.z1 });
    /* The horizon never receives shadows and never casts them — it is past the shadow distance
     * anyway, and asking for 80 chunks of shadow casters is how a streamer eats a frame. */
    if (lvl && lvl.root && lvl.root.render) { lvl.root.render.castShadows = false; lvl.root.render.receiveShadows = false; }
    far.set(key(rx, rz), { ent: lvl ? lvl.root : null, parts: lvl ? lvl.parts : null });
  }

  /* Decide what should exist, queue what does not, drop what should not. Called every frame; the
   * queue is what keeps it off the frame budget. */
  function streamAround(x, z) {
    const c = CW.chunkAt(x, z);
    pending.length = 0;
    for (let i = -NEAR_R; i <= NEAR_R; i++) for (let j = -NEAR_R; j <= NEAR_R; j++) {
      const cx = c.cx + i, cz = c.cz + j;
      if (!near.has(key(cx, cz))) pending.push({ d: i * i + j * j, fn: () => buildChunk(cx, cz), k: key(cx, cz), near: 1 });
    }
    const rc = { rx: Math.floor(c.cx / REGION), rz: Math.floor(c.cz / REGION) };
    for (let i = -FAR_R; i <= FAR_R; i++) for (let j = -FAR_R; j <= FAR_R; j++) {
      const rx = rc.rx + i, rz = rc.rz + j;
      if (!far.has(key(rx, rz))) pending.push({ d: 40 + i * i + j * j, fn: () => buildRegion(rx, rz), k: key(rx, rz), near: 0 });
    }
    pending.sort((a, b) => a.d - b.d);
    for (let n = 0; n < BUILD_BUDGET && pending.length; n++) { const job = pending.shift(); job.fn(); }

    for (const [k, v] of near) { const p = k.split(',');
      if (Math.abs(+p[0] - c.cx) > NEAR_R + 1 || Math.abs(+p[1] - c.cz) > NEAR_R + 1) {
        destroyEntry(v); if (v.extra) destroyEntry({ ent: v.extra.root, parts: v.extra.parts }); near.delete(k); } }
    for (const [k, v] of far) { const p = k.split(',');
      if (Math.abs(+p[0] - rc.rx) > FAR_R + 1 || Math.abs(+p[1] - rc.rz) > FAR_R + 1) { destroyEntry(v); far.delete(k); } }
  }

  /* Collision over the LOADED near chunks only. ⚠ `groundBelow` returns NULL over empty space
   * rather than 0 — see the note in step(); a 0 default is an invisible plane to land on. */
  function makeCollide() {
    return {
      hits(x, y, z) {
        const c = CW.chunkAt(x, z);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const e = near.get(key(c.cx + i, c.cz + j)); if (!e) continue;
          const S = e.solids, r = 0.45, h = 0.9;
          for (let n = 0; n < S.length; n++) { const b = S[n];
            if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && y + h > b.y0 && y < b.y1) return b; }
        }
        return null;
      },
      groundBelow(x, z, y) {
        const c = CW.chunkAt(x, z); let best = null, r = 0.45;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const e = near.get(key(c.cx + i, c.cz + j)); if (!e) continue;
          const S = e.solids;
          for (let n = 0; n < S.length; n++) { const b = S[n];
            if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 &&
                b.y1 <= y + 0.9 && (best == null || b.y1 > best)) best = b.y1; }
        }
        return best;
      },
    };
  }

  function loadWorld() {
    if (!window.CityWorld || !window.S9PCWorld || !window.RoninWorld) {
      console.warn('[city] modules missing'); return Promise.resolve();
    }
    /* ⚑ THE WORLD DOES NOT WAIT FOR THE LANDMARKS. They are two fetches over the network and the
     * generated city needs neither; a landmark simply appears in its chunk when its file lands
     * (and if it never lands, that chunk stays an empty lot with kerbs). Fail-open at every step,
     * the standing principle here. */
    const want = CW.LANDMARKS.slice(0, 8);
    landmarkCache = {};
    const jobs = want.map(L => RoninWorld.load(L.file)
      .then(w => { landmarkCache[L.file] = { verts: w.verts.slice(), boxes: (w.boxes || []).slice() }; })
      .catch(e => { console.warn('[city] landmark', L.file, e && e.message); }));

    /* THE WORLD'S BOUNDS ARE THE WORLD'S, not one level's — the streamer means there is no single
     * level to measure. `max[1]` is the tallest thing the generator can build, and the bird's
     * ceiling is 90 m above it. */
    bounds = { min: [-CW.EXTENT, -4, -CW.EXTENT], max: [CW.EXTENT, 120, CW.EXTENT] };
    collide = makeCollide();
    /* Haze is set from the FAR TIER's reach, so the horizon fades into it instead of ending at a
     * hard edge — the same "geometry outside the visible range" correctness fix the duel stages
     * needed, only here the range is the streamer's and is known exactly. */
    const reach = REGION * CW.CHUNK * (FAR_R + 0.5);
    app.scene.fog.start = reach * 0.30; app.scene.fog.end = reach * 0.95;
    cam.camera.farClip = reach * 1.25;

    // start on the street beside the lido, so the first thing in shot is an authored place
    const lm = CW.LANDMARKS[0];
    me.x = lm.cx * CW.CHUNK + 22; me.z = lm.cz * CW.CHUNK + CW.CHUNK / 2; me.y = 1.4;
    streamAround(me.x, me.z);
    ready = true;
    return Promise.all(jobs).then(() => {
      /* the landmark chunks were built before their file arrived — drop them so the next stream
       * pass rebuilds them WITH the authored geometry. Rebuilding is free; genChunk is pure. */
      for (const L of CW.LANDMARKS) { const k = key(L.cx, L.cz); const e = near.get(k);
        if (e) { destroyEntry(e); if (e.extra) destroyEntry({ ent: e.extra.root, parts: e.extra.parts }); near.delete(k); } }
      streamAround(me.x, me.z);
    });
  }

  // ── step ────────────────────────────────────────────────────────────────────────────────────
  function step(dt) {
    if (!ready) return;
    const fwdIn = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0);
    const turnIn = (keys['d'] || keys['e'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['q'] || keys['arrowleft'] ? 1 : 0);
    const diving = !!keys['shift'];
    const wantFlap = !!keys[' '] && me.fuel > FLY.minLaunch;

    const spd0 = Math.hypot(me.vx, me.vz);
    // no rudder without airflow — a bird turns by banking, and banking needs air over the wing
    me.yaw += turnIn * FLY.turn * (0.35 + 0.65 * Math.min(1, spd0 / 12)) * dt;

    // heading in the game's own basis: x = sin(yaw), z = cos(yaw)
    const hx = Math.sin(me.yaw), hz = Math.cos(me.yaw);

    /* ⚑ THE WINGBEAT. Discrete, with a refractory period — that is the whole difference between a
     * bird and a helicopter, and it is a state variable rather than a function of the clock. */
    me.flapT = Math.max(0, me.flapT - dt);
    me.beat = Math.max(0, me.beat - dt * 3.4);          // the visual settle after a beat
    if (wantFlap && me.flapT <= 0 && !me.onGround) {
      me.flapT = FLY.flapEvery; me.beat = 1;
      me.vy += FLY.flapV;
      me.vx += hx * FLY.flapFwd; me.vz += hz * FLY.flapFwd;
      me.fuel = Math.max(0, me.fuel - FLY.flapCost);
    } else if (wantFlap && me.onGround) {               // launch: the first beat off the ground
      me.flapT = FLY.flapEvery; me.beat = 1;
      me.vy += FLY.flapV * 1.25; me.onGround = false;
      me.fuel = Math.max(0, me.fuel - FLY.flapCost);
    }

    // held W is a beat FORWARD, and like every beat it spends wing energy
    let thrust = 0;
    if (fwdIn > 0 && me.fuel > FLY.minLaunch) { thrust = FLY.thrust;
      me.fuel = Math.max(0, me.fuel - FLY.thrustCost * dt); }
    else if (fwdIn < 0) { me.vx *= (1 - 1.6 * dt); me.vz *= (1 - 1.6 * dt); }

    /* ── the boundary, applied to the THRUST rather than only to the velocity. ⛔ The first version
     * pushed back with a spring the thrust could simply out-muscle: at 8 m outside the pad the two
     * balanced, so the bird hung there stalled, outside the world, and then sank onto the y=0
     * plane — the exact "stood on a water plane with the city floating in the distance" failure
     * `docs/CITY-GAME.md` records from the shelved city. A wall you can lean against is not a
     * boundary. Cancelling the outward COMPONENT of thrust means it can never be out-muscled. */
    const edge = edgePush(me.x, me.z);
    if (edge.out > 0) {
      const outward = hx * -edge.nx + hz * -edge.nz;    // how much of the heading points outward
      if (outward > 0) thrust *= Math.max(0, 1 - outward * Math.min(1, edge.out / 2.5));
      const k = Math.min(60, 10 + edge.out * 8);
      me.vx += edge.nx * k * dt; me.vz += edge.nz * k * dt;
    }
    if (thrust) { me.vx += hx * thrust * dt; me.vz += hz * thrust * dt; }

    const spd = Math.hypot(me.vx, me.vz);
    /* ⚑ THE GLIDE, and it is the whole feel: horizontal speed BUYS lift, so flying faster means
     * sinking slower and a dive can be traded back into distance. Height and speed are one
     * currency. ⚠ The cap is the rocket guard — uncapped, spd² at the speed cap is +34 m/s². */
    const lift = Math.min(spd * spd * FLY.lift, FLY.gravity * FLY.liftCap);
    me.vy += (lift - FLY.gravity) * dt;
    if (diving) me.vy -= FLY.dive * dt;

    // quadratic drag, because that is what makes a glide carry and a dive build
    const kDrag = FLY.dragK * (diving ? FLY.tuckDrag : 1);
    if (spd > 0.001) { const d = kDrag * spd * dt;
      me.vx -= me.vx * Math.min(1, d); me.vz -= me.vz * Math.min(1, d); }
    me.vy -= me.vy * FLY.vDamp * dt;
    const s2 = Math.hypot(me.vx, me.vz);
    if (s2 > FLY.maxSpd) { const k = FLY.maxSpd / s2; me.vx *= k; me.vz *= k; }

    let nx = me.x + me.vx * dt, nz = me.z + me.vz * dt, ny = me.y + me.vy * dt;
    // a wall stops you: try each axis, keep what is clear. Cheap, and enough for a bird.
    if (collide) {
      if (collide.hits(nx, ny, me.z)) { nx = me.x; me.vx *= -0.15; }
      if (collide.hits(nx, ny, nz))   { nz = me.z; me.vz *= -0.15; }
      /* ⚠ GROUND MUST BE REAL GEOMETRY, NOT A DEFAULT. `RoninWorld.groundAt` returns 0 when no box
       * is under you, so beyond the level the bird landed on an invisible plane at y=0 — which is
       * word for word the failure `docs/CITY-GAME.md` records from the shelved city ("the player
       * stood on a water plane with the city floating in the distance"). `groundBelow` returns
       * null instead, so nothing lands on nothing. */
      const g = collide.groundBelow(nx, nz, ny);
      if (g != null && ny <= g + 0.30) { ny = g + 0.30; me.vy = 0; me.onGround = true; }
      else me.onGround = false;
    }
    /* ⛔ THE SKY NEEDS A CEILING. Driven without one, 70 frames put the bird at y 48.5 over a level
     * whose highest roof is 17.5 — and running out of wing energy does NOT stop a climb, it stops
     * the beating and the bird coasts on up. A game where you can accidentally leave the world is
     * not mellow, it is broken.
     * ⚑ SOFT, NOT GLASS: the higher past it you go the harder the air is, so it reads as thin air
     *   rather than as a lid. The horizontal edge is handled ABOVE, on the thrust — see there. */
    if (bounds) {
      /* ⚠ THE CEILING IS AN ABSOLUTE ALTITUDE, NOT A FRACTION OF THE WORLD. Derived from the span
       * it was right for a 54 m courtyard and became 1,848 m the moment the world became a 3.84 km
       * city — measured: the bird climbed past 163 m and was still going. A bird's ceiling is a
       * property of the bird and of what it can see, not of how wide the map is. */
      const ceil = bounds.max[1] + 90;
      if (ny > ceil) { const over = ny - ceil; me.vy -= (6 + over * 5) * dt; me.vy *= (1 - 2.4 * dt); }
      // the floor of last resort: nothing may fall out of the world, even if it gets somewhere odd
      if (ny < bounds.min[1] - 2) { ny = bounds.min[1] - 2; me.vy = Math.max(0, me.vy); }
    }
    me.x = nx; me.z = nz; me.y = ny; me.speed = s2;
    { const g = collide ? collide.groundBelow(me.x, me.z, me.y) : null;
      me.alt = g == null ? me.y - (bounds ? bounds.min[1] : 0) : me.y - g; }

    // ⚑ perched: the wing energy comes back. A bird that must land.
    if (me.onGround) me.fuel = Math.min(1, me.fuel + FLY.refill * dt);

    /* ── the body: bank into the turn, pitch with climb rate, and the WINGS BEAT. Attitude comes
     * from MOTION and the beat from the impulse that caused it — never from a clock. */
    bird.setLocalPosition(me.x, me.y, me.z);
    const bank = clamp(-turnIn * 34 * Math.min(1, me.speed / 12), -38, 38);
    const pitch = clamp(-me.vy * 2.4, -42, 42);
    bird.setLocalEulerAngles(pitch, me.yaw * 180 / Math.PI, bank);
    for (const w of wings) w.e.setLocalEulerAngles(0, 0, w.s * (me.beat * 46 - 8));

    /* ── the camera SETTLES, it does not follow. A perfect track reads as a drone. ──────────────
     * ⚑ AND IT LOOKS DOWN THE HIGHER YOU ARE. Framed level, a bird at 40 m fills the screen with
     *   sky and the city is off the bottom of the frame — which is exactly what the first flight
     *   screenshot showed, and it is a framing bug rather than a flight one. The look-ahead point
     *   drops with altitude, so height turns into a view of the place instead of a view of nothing. */
    const back = 4.2 + Math.min(3.5, me.speed * 0.10), up = 1.5 + Math.min(3.0, me.alt * 0.06);
    const tx = me.x - hx * back, tz = me.z - hz * back, ty = me.y + up;
    camPos.x += (tx - camPos.x) * Math.min(1, dt * 4.2);
    camPos.y += (ty - camPos.y) * Math.min(1, dt * 3.4);
    camPos.z += (tz - camPos.z) * Math.min(1, dt * 4.2);
    const ahead = 7 + me.speed * 0.35, droop = Math.min(0.62, me.alt / 55) * ahead;
    /* the mirror: game (x,y,z) -> camera (-x,y,z), and yaw PI - gameYaw. See the header. */
    cam.setPosition(-camPos.x, camPos.y, camPos.z);
    cam.lookAt(-(me.x + hx * ahead), me.y + 0.35 - droop, me.z + hz * ahead);

    const f = $('fuelIn'); if (f) f.style.width = (me.fuel * 100).toFixed(0) + '%';
  }
  const camPos = { x: 0, y: 8, z: -6 };
  /* The world edge as an inward normal + how far past it you are. Kept separate from `step` because
   * it is asked twice (once to trim thrust, once to push) and because a world that is a generated
   * region rather than one baked level will want to answer it differently. */
  function edgePush(x, z) {
    if (!bounds) return { out: 0, nx: 0, nz: 0 };
    const pad = 6;
    const lox = bounds.min[0] - pad, hix = bounds.max[0] + pad;
    const loz = bounds.min[2] - pad, hiz = bounds.max[2] + pad;
    let dx = x < lox ? lox - x : x > hix ? hix - x : 0;
    let dz = z < loz ? loz - z : z > hiz ? hiz - z : 0;
    const out = Math.hypot(dx, dz);
    if (out < 1e-4) return { out: 0, nx: 0, nz: 0 };
    return { out, nx: dx / out, nz: dz / out };
  }

  app.on('update', dt => {
    step(Math.min(dt, 0.05));
    if (ready) streamAround(me.x, me.z);
  });

  resize();
  app.start();
  loadWorld();

  /* ── the dev hook. Everything a headless run needs and nothing it could fake with — the same
   * arrangement as `__rn` and `__s9pc`, and the reason the acceptance tests can be MEASUREMENTS
   * rather than opinions. */
  const api = {
    app, get level() { return LEVEL; }, get bounds() { return bounds; }, get ready() { return ready; },
    get near() { return near; },
    get s() {
      let tris = 0, solids = 0;
      const cls = new Set(), byClass = {};
      /* ⚑ PER-CLASS TRIANGLE COUNTS, because "the roads look sand to me" is not a measurement and
       * this container's screenshot path is not colour-faithful anyway (CLAUDE.md's standing rule).
       * If `metal` carries thousands of triangles the asphalt IS being built; if it carries a
       * handful, they are bollards and the roads are being repainted somewhere downstream. */
      for (const v of near.values()) { solids += v.solids.length;
        if (v.stats) for (const k in v.stats) { if (typeof v.stats[k] === 'number' && k !== 'tris' &&
          k !== 'boxes' && k !== 'parts' && k !== 'buildMs') byClass[k] = (byClass[k] || 0) + v.stats[k]; }
        if (v.parts) for (const p of v.parts) { cls.add(p.key); tris += (p.mesh && p.mesh.primitive && p.mesh.primitive[0] ? p.mesh.primitive[0].count / 3 : 0) | 0; } }
      const c = CW ? CW.chunkAt(me.x, me.z) : { cx: 0, cz: 0 };
      return { ready, x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2),
        yaw: +me.yaw.toFixed(3), speed: +me.speed.toFixed(2), fuel: +me.fuel.toFixed(3),
        alt: +me.alt.toFixed(2), onGround: me.onGround,
        chunk: c.cx + ',' + c.cz, district: CW ? CW.districtAt(c.cx, c.cz) : '?',
        nearChunks: near.size, farRegions: far.size, solids, tris,
        /* ⚑ THE ASSERTION THAT BITES on the silent-material bug: which material classes the world
         * actually built. Two classes across a whole city means the box translation is broken
         * again and everything is one colour, with nothing else to tell you so. */
        classes: [...cls].sort(), byClass: byClass };
    },
    _step(n, dt) { for (let i = 0; i < (n || 1); i++) { step(dt == null ? 1 / 60 : dt);
      if (ready) streamAround(me.x, me.z); } },
    _place(x, y, z, yaw) { me.x = x; me.y = y; me.z = z; if (yaw != null) me.yaw = yaw;
      me.vx = me.vy = me.vz = 0; camPos.x = x; camPos.y = y; camPos.z = z;
      streamAround(x, z); step(1 / 60); },
    /* Build everything the streamer wants RIGHT NOW rather than over the next several seconds.
     * The budget exists to protect the frame; a headless capture has no frame to protect, and a
     * screenshot of a half-streamed city would be a measurement of the queue, not of the city. */
    _settle(max) { for (let i = 0; i < (max || 400); i++) { const before = near.size + far.size;
      streamAround(me.x, me.z); if (near.size + far.size === before) break; } return { near: near.size, far: far.size }; },
    /* ⚑ ACCEPTANCE TEST 1 — "the place reads from the air." The camera goes up over the bird and
     * looks down at the district it is in, so the framing comes from where the player actually is
     * rather than from wherever a driver happened to leave them. `h` in metres. */
    _perch(h) {
      const up = h || 150;
      camPos.x = me.x - up * 0.55; camPos.y = me.y + up; camPos.z = me.z - up * 0.55;
      cam.setPosition(-camPos.x, camPos.y, camPos.z);
      cam.lookAt(-me.x, 6, me.z);
      const c = CW.chunkAt(me.x, me.z);
      return { from: [+camPos.x.toFixed(1), +camPos.y.toFixed(1), +camPos.z.toFixed(1)],
               at: [+me.x.toFixed(1), +me.z.toFixed(1)], district: CW.districtAt(c.cx, c.cz),
               near: near.size, far: far.size };
    },
  };
  window.__city = api;
  return api;
})();

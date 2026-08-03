/* ripmaster3030studios — THE CITY · the bird.
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

  /* ⚠ `?readback=1` turns on `preserveDrawingBuffer` SO THAT COLOUR CAN BE MEASURED. The standing
   * rule here is that this container's screenshot path rotates hue on canvas content, so colour is
   * judged from pixels and never from a PNG — and `readPixels` on a live WebGL canvas returns
   * zeros without this flag. It is off by default because it costs a frame copy. */
  const READBACK = Q.get('readback') === '1';
  const app = new pc.Application(cv, { graphicsDeviceOptions: {
    antialias: true, alpha: false, preserveDrawingBuffer: READBACK } });
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

  /* ⛔ THE PRINT PASS — docs/CITY-GAME.md §2, "what it is MADE OF". Until now the city shipped in
   * Section 9's PBR palette: correct, competent, and the DEFAULT, which is the DESIGN-SYSTEM §1
   * failure this project has recorded three times already. `js/city-ink.js` posterises the value
   * into flat fields, draws a dark line where forms meet, and misregisters the plates by a pixel —
   * painted card stock rather than a render of a city.
   * ⚠ It FAILS OPEN: a shader that will not compile, or an engine whose post queue is elsewhere,
   *   returns false and the city draws exactly as before. `?noink=1` is the off switch and is also
   *   how the before/after is measured. */
  let ink = false;      // attached AFTER the first resize — see the note at app.start()

  /* ⛔ THIS BLOCK LIVES ABOVE THE BODIES ON PURPOSE — `const` HOISTS INTO THE TEMPORAL DEAD ZONE.
   * It was first written next to the flight tables, below the jet's geometry, and the jet's
   * `bird.enabled = !isJet()` then read `isJet` before its declaration: "Cannot access 'isJet'
   * before initialization", which at module scope kills EVERY LINE AFTER IT and takes the whole
   * app down before `window.__city` exists. The probe reads "undefined", not "broken mode swap".
   * ⚠ Third sighting of this exact defect in this repo. Declarations that other top-level code
   *   calls belong above it, not near the thing they describe. */
  /* ⛔ THE ANIMAL IS AN OBSERVER AND CANNOT DIE — artist, 2026-08-03, and it is not a difficulty
   * setting. It is the ONLY reason a mellow game and a tactical shooter can share one world: if
   * the animal is a witness rather than a peer, a firefight two streets away becomes *weather* —
   * something to fly over, watch and photograph. The mellow game keeps its promise ("nothing
   * chases you") inside a world that contains people shooting at each other.
   * ⚠ AND IT HAS TO BE ENFORCED, NOT TRUE BY OMISSION. `targetable:false` is what other systems
   *   must read; "we never gave the bird any health" is not a design, and a bot that aims at a
   *   squirrel and does no damage has already ruined the tone. */
  /* ⚑ THREE MODES, ONE WORLD — artist, 2026-08-03: *"there are 3 modes, animal mode, dogfight
   * mode, section 9 mode."* They share the streamer, the collision set, the edge and the light;
   * what differs is the BODY, the CAMERA, and whether you can be hurt. */
  const MODES = {
    animal:    { name: 'ANIMAL',    mortal: false, targetable: false, armed: false, view: 'chase' },
    jet:       { name: 'DOGFIGHT',  mortal: true,  targetable: true,  armed: true,  view: 'chase' },
    operative: { name: 'SECTION 9', mortal: true,  targetable: true,  armed: true,  view: 'first' },
  };
  const ORDER = ['animal', 'jet', 'operative'];

  /* ⚑ THE ANIMALS ARE LAYERS, NOT SKINS (docs/CITY-GAME.md §1) — each reaches a different part of
   * the same city, which is what stops "pick your character" being a costume menu. The bird owns
   * the air; the squirrel owns the VERTICAL. Cat and dog are named here so the shape of the table
   * is honest about what is missing rather than pretending the roster is two. */
  const CREATURES = {
    bird:     { name: 'BIRD',     fly: true,  r: 0.45, h: 0.9,  step: 0.4, climb: false },
    squirrel: { name: 'SQUIRREL', fly: false, r: 0.26, h: 0.42, step: 0.55, climb: true,
                run: 9.5, jump: 7.2, grav: 26 },
    // cat, dog — not built. See docs/CITY-GAME.md order of work, step 5.
  };
  let CREATURE = (() => { try { const c = localStorage.getItem('urm_city_creature');
    return CREATURES[c] ? c : 'bird'; } catch (e) { return 'bird'; } })();
  if (Q.get('creature') && CREATURES[Q.get('creature')]) CREATURE = Q.get('creature');

  let MODE = (() => { try { const m = localStorage.getItem('urm_city_mode');
    return MODES[m] ? m : 'animal'; } catch (e) { return 'animal'; } })();
  if (Q.get('mode') && MODES[Q.get('mode')]) MODE = Q.get('mode');
  const isJet = () => MODE === 'jet';
  const isOp  = () => MODE === 'operative';
  const isBird = () => MODE === 'animal' && CREATURE === 'bird';
  const modeLabel = () => MODE === 'animal' ? CREATURES[CREATURE].name : MODES[MODE].name;


  // ═══ THE BIRD ═══════════════════════════════════════════════════════════════════════════════
  /* Artist, 2026-08-03: *"we need it looking more like a birb please."* The first pass was a
   * capsule with two boxes for wings and was labelled a placeholder; a placeholder you can see is
   * still the thing on screen, so it is a bird now.
   *
   * ⚑ IT IS GENERATED GEOMETRY, NOT PRIMITIVES, because DESIGN-SYSTEM §1 is exactly about this:
   *   a capsule and two boxes IS the default an engine hands you, and the recorded diagnosis of
   *   the rejected hero wordmark was that "an agent handed a mood reaches for the default". A bird
   *   is a lofted taper, a swept wing and a fanned tail — none of which is a primitive.
   * ⚑ WHAT IT IS MADE OF (§1): painted card stock. Flat saturated ink, near-black where forms
   *   meet, countershaded the way a real bird is — dark above, cream below — which here is done
   *   with VERTEX COLOUR keyed on height, so it costs one attribute and no texture.
   * ⚑ WHAT MOVES AND WHY (§4): the wing has a SHOULDER AND AN ELBOW, and the elbow lags the
   *   shoulder. That lag is the whole reason a wingbeat reads as a wingbeat rather than as a
   *   rotating plank — the outer hand is still coming down as the inner arm starts back up. The
   *   tail fans when it is doing work (turning, braking) and sits closed when it is not.
   * ⚠ Nothing here is driven by a clock. Beat phase comes from the impulse that caused it and the
   *   tail from the turn input, so a perched bird is genuinely still. */

  /* Loft a series of cross-section rings into a closed solid. Rings are arrays of [x,y,z] with the
   * same point count; consecutive rings are stitched, and the ends are capped with fans.
   * Normals are accumulated per face and normalised — the honest way, since a lofted taper has no
   * analytic normal worth writing out. */
  function loft(rings, cols) {
    const n = rings[0].length, m = rings.length;
    const pos = [], col = [], idx = [];
    for (let r = 0; r < m; r++) for (let i = 0; i < n; i++) {
      pos.push(rings[r][i][0], rings[r][i][1], rings[r][i][2]);
      const c = cols ? cols(rings[r][i], r / (m - 1)) : [1, 1, 1];
      col.push(c[0], c[1], c[2], 1);
    }
    for (let r = 0; r + 1 < m; r++) for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + (i + 1) % n, c = (r + 1) * n + i, d = (r + 1) * n + (i + 1) % n;
      idx.push(a, c, b, b, c, d);
    }
    // caps — a fan around each end ring's centroid, so the solid is closed and lights correctly
    for (const [r, flip] of [[0, true], [m - 1, false]]) {
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += rings[r][i][0]; cy += rings[r][i][1]; cz += rings[r][i][2]; }
      const ci = pos.length / 3;
      pos.push(cx / n, cy / n, cz / n);
      const c = cols ? cols([cx / n, cy / n, cz / n], r / (m - 1)) : [1, 1, 1];
      col.push(c[0], c[1], c[2], 1);
      for (let i = 0; i < n; i++) { const a = r * n + i, b = r * n + (i + 1) % n;
        if (flip) idx.push(ci, a, b); else idx.push(ci, b, a); }
    }
    const P = new Float32Array(pos), I = new Uint16Array(idx), N = new Float32Array(P.length);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
    }
    for (let i = 0; i < N.length; i += 3) {
      const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
      N[i] /= l; N[i + 1] /= l; N[i + 2] /= l;
    }
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(P); mesh.setNormals(N); mesh.setColors(new Float32Array(col));
    mesh.setIndices(I); mesh.update(pc.PRIMITIVE_TRIANGLES);
    return mesh;
  }

  /* An ellipse ring in the xy plane at z, squashed and offset — the body's cross-section. */
  function ring(z, rx, ry, oy, seg) {
    const out = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2;
      out.push([Math.cos(a) * rx, Math.sin(a) * ry + oy, z]); }
    return out;
  }

  const INK = [0.13, 0.17, 0.24];        // near-black slate: the back, the wing, the tail
  const CREAM = [0.94, 0.88, 0.74];      // the belly. Countershading is what makes a bird a bird.
  const BEAK = [0.98, 0.55, 0.16];       // one warm accent, spent only on beak and feet

  function birdMat(vertexColour) {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(1, 1, 1);
    m.useMetalness = true; m.metalness = 0.0; m.gloss = 0.22;
    if (vertexColour) m.diffuseVertexColor = true;
    m.update();
    return m;
  }
  function flatMat(rgb) {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(rgb[0], rgb[1], rgb[2]);
    m.useMetalness = true; m.metalness = 0.0; m.gloss = 0.22;
    m.update();
    return m;
  }

  const bird = new pc.Entity('bird');
  const wings = [];
  let tailE = null;
  {
    const matBody = birdMat(true), matBeak = flatMat(BEAK), matInk = flatMat(INK);
    /* countershading: ink above the waterline, cream below, with a short blend so it reads as
     * printed rather than as two halves bolted together */
    const shade = (p) => { const t = clamp((p[1] + 0.045) / 0.11, 0, 1);
      return [lerp3(CREAM[0], INK[0], t), lerp3(CREAM[1], INK[1], t), lerp3(CREAM[2], INK[2], t)]; };

    // ── the body: a lofted taper, nose at +z, tail at −z ──────────────────────────────────────
    const SEG = 12;
    /* ⚠ THE FIRST BODY WAS 5.8 : 1 AND READ AS A DART, not a bird — long, narrow, tapering to a
     * point. A pigeon is nearer 2 : 1 with the mass forward of centre and a blunt end where the
     * tail takes over. Shorter and fatter, and the taper stops rather than running to a spike. */
    const prof = [[0.36, 0.034, 0.032, 0.014], [0.30, 0.082, 0.076, 0.008], [0.22, 0.134, 0.126, 0.000],
                  [0.10, 0.172, 0.160, -0.008], [-0.02, 0.185, 0.170, -0.012], [-0.16, 0.156, 0.142, -0.006],
                  [-0.28, 0.104, 0.094, 0.006], [-0.37, 0.048, 0.044, 0.018]];
    bodyPart(bird, loft(prof.map(q => ring(q[0], q[1], q[2], q[3], SEG)), shade), matBody);

    // ── the head, set forward and a little high, and a BEAK — the read at any distance ────────
    const headP = [[0.34, 0.062, 0.058, 0.052], [0.41, 0.094, 0.090, 0.062], [0.49, 0.098, 0.094, 0.064],
                   [0.56, 0.078, 0.074, 0.060], [0.60, 0.044, 0.042, 0.054]];
    bodyPart(bird, loft(headP.map(q => ring(q[0], q[1], q[2], q[3], SEG)), shade), matBody);
    const beakP = [[0.58, 0.038, 0.032, 0.052], [0.66, 0.026, 0.019, 0.049], [0.74, 0.006, 0.005, 0.046]];
    bodyPart(bird, loft(beakP.map(q => ring(q[0], q[1], q[2], q[3], 8)), null), matBeak);
    for (const s of [-1, 1]) {                                    // eyes: two ink dots, no more
      const e = new pc.Entity('eye' + s);
      e.addComponent('render', { type: 'sphere' });
      e.setLocalScale(0.028, 0.028, 0.028);
      e.setLocalPosition(s * 0.072, 0.086, 0.512);
      e.render.meshInstances.forEach(mi => { mi.material = matInk; });
      bird.addChild(e);
    }

    /* ── the wings. TWO JOINTS: shoulder then elbow, and the elbow is a CHILD of the shoulder so
     * it inherits the beat and adds its own lag. A single-pivot wing is a plank. */
    for (const s of [-1, 1]) {
      const sh = new pc.Entity('shoulder' + s);
      sh.setLocalPosition(s * 0.105, 0.055, 0.06);
      /* ⚠ CHORD 0.15 ON A 0.86 SPAN IS A BLADE. A bird's inner wing is nearly as deep as its body
       * and that depth is most of what the silhouette is; the outer hand is what tapers. */
      const inner = [[0.00, 0.290, 0.034], [0.13, 0.300, 0.028], [0.26, 0.272, 0.022]];
      bodyPart(sh, wingLoft(inner, s), matBody, shade);
      const el = new pc.Entity('elbow' + s);
      el.setLocalPosition(s * 0.26, 0, 0);
      // outer hand: long, swept back, tapering to a point — the primaries
      const outer = [[0.00, 0.268, 0.022], [0.16, 0.238, 0.016], [0.32, 0.186, 0.011],
                     [0.46, 0.112, 0.007], [0.58, 0.026, 0.004]];
      bodyPart(el, wingLoft(outer, s, 0.30), matBody, shade);
      sh.addChild(el); bird.addChild(sh);
      wings.push({ sh, el, s });
    }

    // ── the tail: a flat fan behind the body, and it FANS when the bird is working ────────────
    tailE = new pc.Entity('tail');
    tailE.setLocalPosition(0, 0.014, -0.36);
    const tailP = [[0.00, 0.052, 0.014], [-0.14, 0.104, 0.010], [-0.30, 0.152, 0.007], [-0.42, 0.168, 0.005]];
    bodyPart(tailE, tailLoft(tailP), matBody, shade);
    bird.addChild(tailE);
  }
  world.addChild(bird);

  function lerp3(a, b, t) { return a + (b - a) * t; }
  function bodyPart(parent, mesh, mat) {
    const e = new pc.Entity('part');
    const mi = new pc.MeshInstance(mesh, mat, e);
    e.addComponent('render', { meshInstances: [mi], castShadows: true });
    parent.addChild(e);
    return e;
  }
  /* A wing is a solid, not a plane: a single-sided sheet vanishes from below under back-face
   * culling, and turning culling off for it would light both faces the same and kill the form.
   * Stations are [spanOffset, chord, thickness]; `sweep` rakes the trailing edge back. */
  function wingLoft(st, s, sweep) {
    const sw = sweep || 0.10;
    const rings = st.map((q, i) => {
      const t = i / (st.length - 1), x = s * q[0], c = q[1], th = q[2], back = -sw * t * t;
      const out = [];
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2;
        out.push([x, Math.sin(a) * th, back + Math.cos(a) * c * 0.5 - c * 0.10]); }
      return out;
    });
    return loft(rings, () => INK);
  }
  function tailLoft(st) {
    const rings = st.map(q => {
      const out = [];
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2;
        out.push([Math.cos(a) * q[1], Math.sin(a) * q[2], q[0]]); }
      return out;
    });
    return loft(rings, () => INK);
  }

  /* ── THE SQUIRREL ───────────────────────────────────────────────────────────────────────────
   * ⚑ IT OWNS THE VERTICAL, and that is the whole reason it exists as a separate animal rather
   *   than as a re-skin. The bird sees the map and cannot get INTO it; the squirrel can go up
   *   anything, which makes the same city a different set of places. `docs/CITY-GAME.md` §1.
   * ⚠ Generated, like everything else here: a rodent is a hunched spine, a heavy tail carried
   *   higher than the back, and a head that is mostly cheek. None of those is a primitive. */
  const squirrel = new pc.Entity('squirrel');
  let sqTail = null;
  {
    const SEG = 10;
    const mFur = birdMat(true), mDark = flatMat([0.10, 0.09, 0.11]), mWarm = flatMat([0.72, 0.40, 0.17]);
    /* countershading again, and it is the same rule as the bird: dark along the back, cream on
     * the belly, because that is what makes a small mammal read as an animal and not a lump. */
    const RUST = [0.55, 0.30, 0.13], CREAM2 = [0.93, 0.88, 0.79];
    const shade2 = (p) => { const t = clamp((p[1] + 0.06) / 0.14, 0, 1);
      return [lerp3(CREAM2[0], RUST[0], t), lerp3(CREAM2[1], RUST[1], t), lerp3(CREAM2[2], RUST[2], t)]; };

    // the body: a hunched arch, deepest over the hips — a squirrel sits up on its haunches
    const bodyP = [[0.20, 0.045, 0.042, 0.010], [0.13, 0.082, 0.076, 0.020], [0.04, 0.108, 0.100, 0.024],
                   [-0.07, 0.115, 0.106, 0.018], [-0.16, 0.090, 0.082, 0.006], [-0.22, 0.050, 0.046, -0.004]];
    bodyPart(squirrel, loft(bodyP.map(q => ring(q[0], q[1], q[2], q[3], SEG)), shade2), mFur);
    // head + muzzle, set high and forward
    const headP = [[0.19, 0.048, 0.046, 0.048], [0.25, 0.072, 0.068, 0.055], [0.31, 0.066, 0.062, 0.053],
                   [0.35, 0.036, 0.034, 0.048]];
    bodyPart(squirrel, loft(headP.map(q => ring(q[0], q[1], q[2], q[3], SEG)), shade2), mFur);
    for (const sd of [-1, 1]) {                              // ears — the whole silhouette read
      const e = new pc.Entity('ear' + sd);
      e.addComponent('render', { type: 'cone' });
      e.setLocalScale(0.038, 0.075, 0.022);
      e.setLocalPosition(sd * 0.040, 0.108, 0.245);
      e.render.meshInstances.forEach(mi => { mi.material = mFur; });
      squirrel.addChild(e);
      const y = new pc.Entity('eye' + sd);                   // eyes: big and dark, set wide
      y.addComponent('render', { type: 'sphere' });
      y.setLocalScale(0.024, 0.024, 0.024);
      y.setLocalPosition(sd * 0.050, 0.062, 0.283);
      y.render.meshInstances.forEach(mi => { mi.material = mDark; });
      squirrel.addChild(y);
    }
    /* ⚑ THE TAIL IS ITS OWN PIVOT because it is the thing that MOVES — it counterweights a leap
     * and flicks on landing, which is the §4 answer for this body. A tail welded to the spine is
     * a decoration; one on a hinge is an animal. */
    sqTail = new pc.Entity('tail');
    sqTail.setLocalPosition(0, 0.02, -0.21);
    /* ⚠ THE TAIL CURLS. A straight taper trailing on the ground reads as a rat; the S-curve
     * carried HIGHER THAN THE BACK is the whole squirrel silhouette, and it is the fourth item on
     * the ring — a rising y offset per station — rather than a rotation of a straight tail. */
    const tailP = [[0.00, 0.030, 0.026, 0.00], [-0.11, 0.078, 0.040, 0.05], [-0.24, 0.104, 0.048, 0.15],
                   [-0.34, 0.092, 0.042, 0.28], [-0.40, 0.048, 0.024, 0.39]];
    bodyPart(sqTail, loft(tailP.map(q => ring(q[0], q[1], q[2], q[3], 8)), () => RUST), mFur);
    squirrel.addChild(sqTail);
    for (const sd of [-1, 1]) for (const [nm, z, len] of [['fore', 0.10, 0.09], ['hind', -0.12, 0.13]]) {
      const l = new pc.Entity(nm + sd);
      l.addComponent('render', { type: 'capsule' });
      l.setLocalScale(0.036, len, 0.036);
      l.setLocalPosition(sd * 0.072, -0.055, z);
      l.render.meshInstances.forEach(mi => { mi.material = mWarm; });
      squirrel.addChild(l);
    }
  }
  world.addChild(squirrel);

  /* ── THE JET, and it is generated for the same reason the bird is: a box with two triangles is
   * the DEFAULT, and DESIGN-SYSTEM §1 exists to refuse it. A jet is a lifting body, a delta and
   * two canted fins. ⚠ It is ~9 m long against the bird's 0.9 — the city has to read as the same
   * place at both scales, which is exactly what a shared world has to prove. */
  const jet = new pc.Entity('jet');
  {
    const SEG = 10;
    const mSkin = flatMat([0.30, 0.34, 0.40]);      // cold grey — it is the one cool body in a warm city
    const mDark = flatMat([0.09, 0.10, 0.13]);
    const mGlow = (() => { const m = new pc.StandardMaterial();
      m.diffuse = new pc.Color(0.05, 0.06, 0.08);
      m.emissive = new pc.Color(0.28, 0.86, 1.00); m.emissiveIntensity = 3.2;   // the one light source it carries
      m.useMetalness = true; m.metalness = 0; m.gloss = 0.6; m.update(); return m; })();

    // fuselage: a long lifting body, widest a third back, flattened
    const fus = [[5.2, 0.10, 0.09, 0.00], [4.2, 0.42, 0.30, -0.02], [2.6, 0.86, 0.52, -0.06],
                 [0.8, 1.02, 0.62, -0.08], [-1.2, 0.92, 0.58, -0.06], [-3.2, 0.70, 0.50, -0.02],
                 [-4.6, 0.52, 0.44, 0.00]];
    bodyPart(jet, loft(fus.map(q => ring(q[0], q[1], q[2], q[3], SEG)), () => [1, 1, 1]), mSkin);
    // canopy — a small dark blister, the thing that says "there is a person in there"
    const can = [[3.2, 0.30, 0.16, 0.44], [2.4, 0.42, 0.28, 0.48], [1.2, 0.40, 0.26, 0.46], [0.3, 0.24, 0.14, 0.40]];
    bodyPart(jet, loft(can.map(q => ring(q[0], q[1], q[2], q[3], SEG)), () => [1, 1, 1]), mDark);
    // delta wings — heavy sweep, sharp tip
    for (const sd of [-1, 1]) {
      const w = [[0.00, 5.6, 0.30], [1.4, 4.6, 0.24], [2.8, 3.2, 0.16], [3.9, 1.6, 0.09], [4.6, 0.30, 0.05]];
      const e = new pc.Entity('wing' + sd);
      e.setLocalPosition(0, -0.10, 0.4);
      bodyPart(e, wingLoft(w, sd, 3.4), mSkin);
      jet.addChild(e);
    }
    /* ⚠ TWO `setLocalEulerAngles` CALLS ON ONE ENTITY IS NOT TWO ROTATIONS — the second REPLACES
     * the first, so the cant silently vanished and the fins came out as one big forward-swept
     * blade. One call, and the cant is folded into it: the wing loft extends along +x, so 90° about
     * z stands it upright and the remainder tips it outboard. */
    for (const sd of [-1, 1]) {
      const f = new pc.Entity('fin' + sd);
      f.setLocalPosition(sd * 0.62, 0.30, -2.9);
      const fp = [[0.0, 1.05, 0.13], [0.55, 0.78, 0.09], [1.05, 0.26, 0.05]];
      bodyPart(f, wingLoft(fp, 1, 0.85), mDark);
      f.setLocalEulerAngles(0, 0, sd * 68);                      // upright (90) minus 22 of cant
      jet.addChild(f);
    }
    for (const sd of [-1, 1]) {                                  // exhaust
      const n = new pc.Entity('noz' + sd);
      const np = [[-4.2, 0.30, 0.30, 0.00], [-4.9, 0.26, 0.26, 0.00]];
      bodyPart(n, loft(np.map(q => ring(q[0], q[1], q[2], q[3], 8)), () => [1, 1, 1]), mGlow);
      n.setLocalPosition(sd * 0.34, -0.04, 0);
      jet.addChild(n);
    }
  }
  world.addChild(jet);
  function showBody() {
    bird.enabled = isBird();
    squirrel.enabled = MODE === 'animal' && CREATURE === 'squirrel';
    jet.enabled = isJet();
    // the operative is FIRST PERSON: there is no third-person body to show, and pretending
    // otherwise would put a mannequin in front of the camera.
  }
  showBody();

  /* ── FLIGHT ─────────────────────────────────────────────────────────────────────────────────
   * ⛔ **THE FUEL IS GONE. Artist, 2026-08-03: *"the bird needs to be able to just fly… no having
   *   to land to keep flying."*** The brief had argued for wing energy that only refills on the
   *   ground — "a bird that must land" — on the grounds that it makes a perch a decision. It also
   *   makes a mellow game about looking at things into a game about a meter, and in a city 3.84 km
   *   across it means running out over the middle of the river. Overruled, and rightly.
   *   ⚑ What SURVIVES the removal is everything that made it feel like a bird rather than a drone,
   *     because none of it was ever the fuel: the beat is still discrete, the glide is still free
   *     and still the default, and height and speed are still one currency. The meter was a
   *     constraint bolted onto a good model, not the model.
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
   *       gravity, so a fast bird sinks slowly and a slow one drops.
   *     · LIFT IS CAPPED. Uncapped, spd² at the speed cap produced +34 m/s² of climb and the bird
   *       became a rocket. 1.35× gravity leaves ~5 m/s² of climb, which is a bird.
   *     · DIVING IS FREE, AND IT TUCKS. SHIFT cuts drag as well as adding descent, so a dive is
   *       genuinely how you buy speed back — the swoop.
   * ⚠ Nothing here reads absolute time, so a bird sitting on a ledge is genuinely still — the
   *   DESIGN-SYSTEM §4 rule this project keeps having to re-learn. */
  const FLY = {
    thrust: 14,          // held W — a beat forward, not an engine
    dragK: 0.0080,       // QUADRATIC, and LOW — a glide has to carry hundreds of metres, not tens.
    tuckDrag: 0.45,      // × dragK while diving — a tucked bird is cleaner
    gravity: 14,
    lift: 0.062,         // spd² × this = lift. glideSpd = sqrt(gravity/lift) ≈ 15 m/s.
    liftCap: 1.35,       // × gravity. THE ROCKET GUARD — see above.
    flapV: 6.2,          // one beat, straight into vy. An impulse, not an acceleration.
    flapFwd: 2.6,        //   …and a little forward: a bird beats down AND back
    flapEvery: 0.32,     // s. The refractory period IS what makes it a wingbeat.
    dive: 16,            // SHIFT
    turn: 2.2,           // rad/s at speed; scaled down when slow — no rudder without airflow
    maxSpd: 28,
    vDamp: 0.35,         // gentle, or a dive can never build speed
  };

  /* ═══ THE JET ═══════════════════════════════════════════════════════════════════════════════
   * Artist, 2026-08-03: *"we can actually have dogfight AND the section 9 game both play here and
   * compress them all into the City. so play as a jet fighter or an animal."*
   *
   * ⛔ **DOGFIGHT IS NOT AUTHORED IN METRES, and this is the trap that would have failed
   *   plausibly.** Its world is `WS = 150` units with `ALT_MIN 0.35 / ALT_MAX 9.0`, `STALL 2.9`,
   *   `VREF 7.2`, `VIEW_FAR 34`. The city is 3,840 m across with 150 m towers — roughly a 25 : 1
   *   mismatch. Copy the table over and the aircraft still flies; it just crosses the whole city in
   *   about a second. A wrong number that crashes is cheap. A wrong number that FLIES is not.
   *
   * ⚑ **THE UNIT-FREE HALF PORTS EXACTLY, AND IT IS THE HALF THAT IS THE FEEL.** `rollK/rollD` are
   *   a second-order spring in rad/s (ω = 9.0, ζ = 0.644 — measured in DOGFIGHT, not guessed), and
   *   the turn law `heading rate = turnG · sin(roll) · pull · auth / spd^0.6` is radians per second.
   *   Those come over untouched. Only speeds, altitudes and distances are re-derived here.
   * ⚠ `spd^0.6` is what makes a fast jet turn WIDE — the same input at 160 m/s buys about half the
   *   heading rate it buys at 60. That is the whole reason energy matters in a dogfight. */
  const JET = {
    thrust: 46,          // m/s² on the throttle
    dragK: 0.00055,      // quadratic; balances thrust near the cap rather than at it
    stall: 48,           // below this the wing quits — a jet cannot hover, and must not be able to
    vref: 95,            // authority reaches 1 here
    authMin: 0.30,       // never zero: unresponsive is a feeling, uncontrollable is a bug report
    idle: 14,            // ⚠ thrust with NO input, so the nose never simply stops in mid-air
    maxSpd: 168,
    rollMax: 1.16,       // 66° commanded bank
    rollK: 81, rollD: 11.6,          // ← DOGFIGHT's own measured spring, unit-free, unchanged
    turnG: 10.4,                     // ← and its turn law
    pull: 0.62,          // nose-up while banked buys the hard turn
    pitchMax: 0.58, pitchK: 6.2,
    climbEff: 0.62,      // climb rate = spd · sin(pitch) · this — a slow jet cannot climb
    sink: 1.55,          // a banked wing stops holding you up
    trade: 0.09,         // speed paid per metre of height, and refunded on the way down
    ceil: 430,
  };

  const me = { x: 0, y: 6, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, onGround: false,
               speed: 0, flapT: 0, beat: 0, alt: 0,
               roll: 0, rollV: 0, pitch: 0, spd: 70 };   // jet state: a spring, not a lerp
  const keys = Object.create(null);
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys[k] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault(); });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  /* ═══ TOUCH ═══════════════════════════════════════════════════════════════════════════════════
   * ⛔ ARTIST, 2026-08-03: "still can't fly bird on mobile" — AND THE REASON IS THAT THERE WAS NO
   *   TOUCH INPUT AT ALL. Every control in this game was a `keydown`. On a phone there is no
   *   keyboard, so the bird could not be flown, turned, or launched: the city loaded, drew
   *   perfectly, and did nothing. ⚑ That is this project's own recorded failure shape one more
   *   time — built ≠ reachable — except the unreachable thing was the entire game, on the device
   *   most people will open it on, and nothing errored to say so.
   *
   * ⚑ THE SCHEME IS BUILT FOR THE GAME THIS IS, not copied off a shooter:
   *     · FORWARD IS AUTOMATIC. A mellow game about looking at things should not ask you to hold a
   *       throttle with one thumb for its entire length. The bird always beats forward gently; you
   *       steer. That removes a whole control rather than shrinking it.
   *     · DRAG ANYWHERE TO STEER — left/right turns, up/down pitches. No stick to find and no
   *       fixed zone to miss: wherever the thumb lands becomes the centre.
   *     · TAP TO FLAP. A tap is a beat, which is exactly what SPACE is on a keyboard — the input
   *       and the mechanic are the same shape.
   *     · A MODE BUTTON, because TAB does not exist on a phone and the jet would otherwise be
   *       unreachable there — the same defect, one level down.
   * ⚠ Touch targets are 56px, above the 44px floor `mobile.css` sets for the rest of the site.
   * ⚠ `touch-action: none` on the canvas, or the browser eats the drag as a scroll gesture and the
   *   bird twitches once per swipe. */
  const TOUCH = (() => { try { return matchMedia('(pointer: coarse)').matches ||
    ('ontouchstart' in window) || navigator.maxTouchPoints > 0; } catch (e) { return false; } })();
  const touch = { on: false, dx: 0, dy: 0, auto: 0 };

  if (TOUCH) {
    cv.style.touchAction = 'none';
    const ui = document.createElement('div');
    ui.id = 'touchUI';
    ui.innerHTML = '<button id="tCreature" type="button" aria-label="switch animal">◔</button>' +
                   '<button id="tFlap" type="button" aria-label="flap or jump">✦</button>' +
                   '<button id="tMode" type="button" aria-label="switch game mode">⇄</button>';
    document.body.appendChild(ui);

    let id = null, ox = 0, oy = 0;
    const REACH = 90;                       // px of drag for full deflection
    cv.addEventListener('pointerdown', e => {
      if (id !== null) return;
      id = e.pointerId; ox = e.clientX; oy = e.clientY; touch.on = true;
      try { cv.setPointerCapture(id); } catch (err) {}
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      touch.dx = clamp((e.clientX - ox) / REACH, -1, 1);
      touch.dy = clamp((e.clientY - oy) / REACH, -1, 1);
      e.preventDefault();
    });
    const release = e => { if (e.pointerId !== id) return;
      id = null; touch.on = false; touch.dx = 0; touch.dy = 0; };
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);

    /* ⚠ A TAP IS A POINTERUP THAT DID NOT DRAG. Firing the flap on every pointerup would beat the
     * wings at the end of every steering swipe, which reads as the bird lurching whenever you turn. */
    cv.addEventListener('pointerup', e => {
      if (Math.abs(e.clientX - ox) < 12 && Math.abs(e.clientY - oy) < 12) tapFlap = 2;
    });
    const flapBtn = $('tFlap'), modeBtn = $('tMode');
    if (flapBtn) { const hold = v => e => { e.preventDefault(); holdFlap = v; };
      flapBtn.addEventListener('pointerdown', hold(true));
      flapBtn.addEventListener('pointerup', hold(false));
      flapBtn.addEventListener('pointercancel', hold(false)); }
    if (modeBtn) modeBtn.addEventListener('click', e => { e.preventDefault(); cycleMode(1); });
    const crBtn = $('tCreature');
    if (crBtn) crBtn.addEventListener('click', e => { e.preventDefault();
      if (MODE !== 'animal') setMode('animal');
      else setCreature(CREATURE === 'bird' ? 'squirrel' : 'bird'); });
  }
  let tapFlap = 0, holdFlap = false;

  /* One place where touch and keys become the same three numbers, so `step()` never asks which
   * device it is on — the recorded lesson from the arena chips is that a mode branch deep in a
   * step function is how a control scheme quietly stops applying. */
  /* ⚑ LOOK. The bird and the jet steer with the body, so `turn` was enough; an operative aims
   * with the HEAD, which is a second axis the other two never needed. Pointer-lock on desktop,
   * the same drag on touch — one value, `me.pitch`, read by stepGround. */
  addEventListener('mousemove', e => {
    if (!isOp() || document.pointerLockElement !== cv) return;
    me.yaw += e.movementX * 0.0022;
    me.pitch = clamp(me.pitch - e.movementY * 0.0022, -1.2, 1.2);
  });
  cv.addEventListener('click', () => { if (isOp() && cv.requestPointerLock) cv.requestPointerLock(); });

  function readInput() {
    let fwd = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0);
    let turn = (keys['d'] || keys['e'] || keys['arrowright'] ? 1 : 0) -
               (keys['a'] || keys['q'] || keys['arrowleft'] ? 1 : 0);
    let dive = !!keys['shift'];
    let flap = !!keys[' '];
    if (TOUCH) {
      if (!fwd) fwd = 1;                       // forward is automatic — see the note above
      if (touch.on) {
        turn = touch.dx;
        /* on foot the vertical drag is LOOK, in the air it is dive — the same thumb, the axis
         * that mode actually has. */
        if (isOp()) me.pitch = clamp(-touch.dy * 1.1, -1.2, 1.2);
        else if (touch.dy > 0.45) dive = true;
      }
      if (holdFlap) flap = true;
      if (tapFlap > 0) { flap = true; tapFlap--; }
    }
    return { fwd, turn, dive, flap };
  }


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
      /* ⚠ THE BODY SIZE IS AN ARGUMENT, not a constant. A bird, a squirrel and an operative are
       * three different volumes — 0.45/0.9 was the bird's, and reusing it for a 1.72 m operative
       * lets them stand with their head inside a ceiling and walk through a rail at knee height.
       * Section 9's own capsule is r 0.42 / h 1.72, which is where the operative's numbers come
       * from; the squirrel is small enough to use gaps the others cannot. */
      hits(x, y, z, r, h) {
        r = r || 0.45; h = h || 0.9;
        const c = CW.chunkAt(x, z);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const e = near.get(key(c.cx + i, c.cz + j)); if (!e) continue;
          const S = e.solids;
          for (let n = 0; n < S.length; n++) { const b = S[n];
            if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && y + h > b.y0 && y < b.y1) return b; }
        }
        return null;
      },
      groundBelow(x, z, y, r, step) {
        r = r || 0.45; step = step == null ? 0.9 : step;
        const c = CW.chunkAt(x, z); let best = null;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const e = near.get(key(c.cx + i, c.cz + j)); if (!e) continue;
          const S = e.solids;
          for (let n = 0; n < S.length; n++) { const b = S[n];
            if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 &&
                b.y1 <= y + step && (best == null || b.y1 > best)) best = b.y1; }
        }
        return best;
      },
      /* ⚑ A WALL WITHIN REACH — what a squirrel needs and nothing else does. Returns the surface
       * normal of the nearest solid the body is pressed against, so climbing is a property of the
       * WORLD rather than a list of authored ladders. Every box in this city is climbable by
       * construction, which is the same 1:1 guarantee the generator already makes about landing. */
      wallAt(x, y, z, r) {
        r = r || 0.5;
        const c = CW.chunkAt(x, z);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const e = near.get(key(c.cx + i, c.cz + j)); if (!e) continue;
          const S = e.solids;
          for (let n = 0; n < S.length; n++) { const b = S[n];
            if (b.y1 - b.y0 < 1.2) continue;                    // a kerb is not a climb
            if (y + 0.4 < b.y0 || y > b.y1) continue;
            if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) {
              const dx0 = Math.abs(x - b.x0), dx1 = Math.abs(x - b.x1);
              const dz0 = Math.abs(z - b.z0), dz1 = Math.abs(z - b.z1);
              const m = Math.min(dx0, dx1, dz0, dz1);
              return { box: b, nx: m === dx0 ? -1 : m === dx1 ? 1 : 0,
                              nz: m === dz0 ? -1 : m === dz1 ? 1 : 0, top: b.y1 };
            }
          }
        }
        return null;
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

    /* Start on the street beside the lido, so the first thing in shot is an authored place.
     * ⚠ AND ON THE GROUND THAT IS ACTUALLY THERE — the spawn height is read from the collider
     * rather than assumed, because a hand-written 1.4 was how the bird ended up under the road. */
    const lm = CW.LANDMARKS[0];
    me.x = lm.cx * CW.CHUNK + 22; me.z = lm.cz * CW.CHUNK + CW.CHUNK / 2;
    streamAround(me.x, me.z);
    const g0 = collide.groundBelow(me.x, me.z, 60);
    me.y = (g0 == null ? 0 : g0) + 0.45;
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
    const IN = readInput();
    const fwdIn = IN.fwd, turnIn = IN.turn, diving = IN.dive;
    if (isJet()) { stepJet(dt, fwdIn, turnIn, diving); return; }
    if (isOp()) { stepGround(dt, IN, OP); return; }
    if (CREATURE === 'squirrel') { stepGround(dt, IN, CREATURES.squirrel); return; }
    const wantFlap = IN.flap;          // no meter: a bird can always beat its wings

    const spd0 = Math.hypot(me.vx, me.vz);
    // no rudder without airflow — a bird turns by banking, and banking needs air over the wing
    me.yaw += turnIn * FLY.turn * (0.35 + 0.65 * Math.min(1, spd0 / 12)) * dt;

    // heading in the game's own basis: x = sin(yaw), z = cos(yaw)
    const hx = Math.sin(me.yaw), hz = Math.cos(me.yaw);

    /* ⚑ THE WINGBEAT. Discrete, with a refractory period — that is the whole difference between a
     * bird and a helicopter, and it is a state variable rather than a function of the clock. */
    me.flapT = Math.max(0, me.flapT - dt);
    me.beat = Math.max(0, me.beat - dt * 3.4);          // the visual settle after a beat
    if (wantFlap && me.flapT <= 0) {
      me.flapT = FLY.flapEvery; me.beat = 1;
      me.vy += me.onGround ? FLY.flapV * 1.25 : FLY.flapV;   // the launch beat is the bigger one
      if (!me.onGround) { me.vx += hx * FLY.flapFwd; me.vz += hz * FLY.flapFwd; }
      me.onGround = false;
    }

    // held W is a beat FORWARD, and like every beat it spends wing energy
    let thrust = 0;
    if (fwdIn > 0) thrust = FLY.thrust;
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

    /* ⛔ THE TERM THAT MAKES "HEIGHT AND SPEED ARE ONE CURRENCY" LITERALLY TRUE, and without it the
     * sentence was only a comment. Conservation of energy is `v·dv = −g·dh`: descending BUYS
     * airspeed and climbing SPENDS it. Measured before it existed — released at 111 m with wing
     * energy gone, the bird carried **15 m in 15 seconds** and arrived at the ground almost
     * vertically. That is a parachute. Lift was being computed from a speed that nothing was
     * feeding, so the glide bled to nothing and then simply fell.
     * ⚠ It is the same trade DOGFIGHT already proves works (`spd -= dAlt * 3.4` there); the
     *   difference is only that this side derives it rather than picking a constant.
     * ⚠ Divide by a FLOORED speed. At v → 0 the true dv → ∞, and a bird hovering at zero would be
     *   flung forward by its own sink rate. */
    /* ⛔ ONLY THE DESCENT HALF, AND THE SYMMETRIC VERSION IS A MEASURED FAILURE, not a shortcut.
     * Taxing the climb by the same rule divides by the HORIZONTAL speed, which during a powered
     * climb is small while `vy` is large — so the factor collapses, and it collapses again next
     * frame. Driven: speed went 19.6 → 0.1 in two seconds and the bird sank vertically out of the
     * world. Physically that is even correct (a bird climbing at 20 m/s with 1 m/s forward really
     * has put everything into the climb) and it is still useless as a game.
     * ⚑ The climb is ALREADY paid for, twice: lift is capped at 1.35 g so climb rate is bounded,
     *   and beating costs wing energy. The asymmetry buys the swoop without the spiral. */
    if (me.vy < 0 && spd > 0.2) {
      const dv = Math.min(FLY.gravity * -me.vy * dt / Math.max(spd, 6), 1.2);
      me.vx *= 1 + dv / spd; me.vz *= 1 + dv / spd;
    }

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


    /* ── the body: bank into the turn, pitch with climb rate, and the WINGS BEAT. Attitude comes
     * from MOTION and the beat from the impulse that caused it — never from a clock. */
    bird.setLocalPosition(me.x, me.y, me.z);
    const bank = clamp(-turnIn * 34 * Math.min(1, me.speed / 12), -38, 38);
    const pitch = clamp(-me.vy * 2.4, -42, 42);
    bird.setLocalEulerAngles(pitch, me.yaw * 180 / Math.PI, bank);
    /* ⚑ THE ELBOW LAGS THE SHOULDER, and that lag IS the wingbeat. Driven together they are a
     * rotating plank; ~90 ms apart the outer hand is still coming down while the inner arm has
     * started back up, which is the shape every bird makes. `beat` decays from the IMPULSE that
     * caused it, so this is a spring settling, not a loop playing. */
    const beatOut = Math.max(0, me.beat - 0.28);
    for (const w of wings) {
      w.sh.setLocalEulerAngles(0, 0, w.s * (me.beat * 52 - 6));
      w.el.setLocalEulerAngles(0, 0, w.s * (beatOut * 64 - 4 + Math.min(0, -me.speed * 0.2)));
    }
    /* the tail fans when the bird is WORKING — turning hard, or slow and about to stall — and
     * closes when it is not. A tail that is always fanned is a decoration. */
    if (tailE) { const work = Math.min(1, Math.abs(turnIn) * 0.7 + Math.max(0, 1 - me.speed / 9));
      tailE.setLocalScale(1 + work * 0.85, 1, 1);
      tailE.setLocalEulerAngles(-work * 16, 0, clamp(-turnIn * 12, -12, 12)); }

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
    /* ⚠ THE DROOP IS SCALED BY ASPECT. `fov` is VERTICAL, so a portrait phone already sees far
     * more sky and ground than a desktop does; applying the same look-down on top of that put the
     * bird at the very top of the frame, nearly out of shot. Measured at 390x844. */
    const aspect = Math.max(0.4, (cv.clientWidth || 16) / (cv.clientHeight || 9));
    const tall = Math.min(1, aspect / 1.35);
    const ahead = 7 + me.speed * 0.35, droop = Math.min(0.62, me.alt / 55) * ahead * tall;
    /* the mirror: game (x,y,z) -> camera (-x,y,z), and yaw PI - gameYaw. See the header. */
    cam.setPosition(-camPos.x, camPos.y, camPos.z);
    cam.lookAt(-(me.x + hx * ahead), me.y + 0.35 - droop, me.z + hz * ahead);


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

  /* ── OPERATIVE — SECTION 9's mode, in the city ──────────────────────────────────────────────
   * ⚑ THE MAP FORMAT IS ALREADY SHARED, AND THAT IS THE WHOLE POINT OF THE COMPRESSION. A Section
   *   9 map is `MAP.solids`, a list of AABBs with a kind; `CityWorld.genChunk` emits exactly that,
   *   so collision, raycast, line-of-sight and cover baking all run on a city chunk unmodified.
   *   The capsule below is Section 9's own — r 0.42, h 1.72, step 0.62 — not a new invention.
   * ⚠ WHAT IS HERE IS TRAVERSAL, AND SAYING SO IS THE POINT. Walking, looking, gravity, jumping
   *   and standing on the city are real; weapons, bots and the firefight are the next step, and
   *   `docs/CITY-GAME.md` lists them as such. A mode that half-exists and is described as finished
   *   is how "built ≠ reachable" becomes "built ≠ true". */
  const OP = { r: 0.42, h: 1.72, step: 0.62, eye: 1.58,
               run: 6.4, sprint: 9.6, accel: 46, friction: 11, airAccel: 9,
               jump: 6.6, grav: 26, climb: false };

  /* ONE ground-movement integrator for the squirrel AND the operative, because they differ in
   * SIZE and REACH, not in physics. Two copies would drift, and the one that drifts is always the
   * one nobody is currently looking at. */
  function stepGround(dt, IN, B) {
    me.yaw += IN.turn * 2.6 * dt;
    const hx = Math.sin(me.yaw), hz = Math.cos(me.yaw);
    const want = IN.fwd;
    const sprint = IN.dive && !B.climb;                       // SHIFT sprints on foot, dives in air
    const top = sprint ? (B.sprint || B.run * 1.5) : (B.run || 6);
    const onG = me.onGround;

    /* ── THE CLIMB, and it is the squirrel's entire reason to exist. A wall within reach IS a
     * route: hold forward against anything tall and you go up it. Every box in this city is
     * climbable by construction — the same 1:1 guarantee the generator makes about landing, which
     * is only true because the geometry and the collision set are one thing. */
    let climbing = false;
    if (B.climb && want > 0) {
      const w = collide && collide.wallAt(me.x, me.y, me.z, B.r + 0.22);
      if (w) {
        climbing = true;
        me.vy = (B.run || 9) * 0.62;
        me.vx *= 0.5; me.vz *= 0.5;
        if (me.y > w.top - 0.05) {                            // crest it and step onto the roof
          me.vy = Math.max(me.vy, 2.0);
          me.vx += hx * 3.2; me.vz += hz * 3.2;
        }
      }
    }

    if (!climbing) {
      const a = (onG ? B.accel || 40 : B.airAccel || 8) * dt;
      if (want > 0) { me.vx += hx * a; me.vz += hz * a; }
      else if (want < 0) { me.vx -= hx * a * 0.6; me.vz -= hz * a * 0.6; }
      else if (onG) { const f = Math.max(0, 1 - (B.friction || 10) * dt); me.vx *= f; me.vz *= f; }
      const sp = Math.hypot(me.vx, me.vz);
      if (sp > top) { const k = top / sp; me.vx *= k; me.vz *= k; }
      me.vy -= (B.grav || 26) * dt;
      if (IN.flap && onG) { me.vy = B.jump || 6.5; me.onGround = false; me.beat = 1; }
    }

    /* ── MOVE. ⛔ VERTICAL FIRST, THEN HORIZONTAL PROBED FROM ABOVE THE FEET, and both halves of
     * that order are load-bearing.
     *   Driven before this fix: the squirrel and the operative both LANDED correctly on the street
     *   and then neither could move a single metre — `walked: 0`, `moved: 0`. Gravity is applied
     *   every frame, so the feet dip ~7 mm below the slab before the ground resolve catches them;
     *   the HORIZONTAL test then ran at that dipped height, found `y < groundSlab.y1`, and treated
     *   the floor itself as a wall. A body standing perfectly still on a surface it cannot walk
     *   along looks like broken input and is a collision-order mistake.
     * ⚑ Probing from `y + step` also gives STEP-UP for free: anything shorter than the step height
     *   is simply not in the way, which is why a kerb is a kerb and not a fence. */
    let ny = me.y + me.vy * dt;
    if (collide) {
      const g = collide.groundBelow(me.x, me.z, ny, B.r, B.step);
      if (g != null && ny <= g + 0.02 && me.vy <= 0) { ny = g; me.vy = 0; me.onGround = true; }
      else if (!climbing) me.onGround = false;
    }
    let nx = me.x + me.vx * dt, nz = me.z + me.vz * dt;
    if (collide) {
      const probe = ny + B.step, hh = Math.max(0.2, B.h - B.step);
      if (collide.hits(nx, probe, me.z, B.r, hh)) { nx = me.x; me.vx = 0; }
      if (collide.hits(nx, probe, nz, B.r, hh)) { nz = me.z; me.vz = 0; }
      // having moved, step UP onto whatever is now under us (a kerb, a stoop, a step)
      const g2 = collide.groundBelow(nx, nz, ny + B.step, B.r, B.step);
      if (g2 != null && g2 > ny && g2 - ny <= B.step && me.vy <= 0) { ny = g2; me.vy = 0; me.onGround = true; }
      /* ⚠ A CEILING IS NOT A FLOOR. Without this you jump THROUGH the underside of a bridge and
       * pop out on top of it, which reads as the city being made of paper. */
      if (me.vy > 0 && collide.hits(nx, ny + B.h, nz, B.r, 0.1)) { ny = me.y; me.vy = 0; }
    }
    const edge = edgePush(nx, nz);
    if (edge.out > 0) { nx += edge.nx * edge.out; nz += edge.nz * edge.out; }
    me.x = nx; me.z = nz; me.y = ny;
    me.speed = Math.hypot(me.vx, me.vz);
    { const g = collide ? collide.groundBelow(me.x, me.z, me.y, B.r, B.step) : null;
      me.alt = me.y - (g == null ? 0 : g); }
    me.beat = Math.max(0, me.beat - dt * 2.4);

    if (isOp()) {
      /* FIRST PERSON: the camera IS the head. No lag and no spring — a settling camera on a body
       * you are inside reads as motion sickness rather than as weight. */
      camPos.x = me.x; camPos.y = me.y + OP.eye; camPos.z = me.z;
      cam.setPosition(-camPos.x, camPos.y, camPos.z);
      cam.lookAt(-(me.x + hx * 10), me.y + OP.eye + me.pitch * 10, me.z + hz * 10);
      return;
    }

    // ── the squirrel: face the way it is going, and the TAIL counterweights
    squirrel.setLocalPosition(me.x, me.y, me.z);
    const lean = climbing ? -62 : clamp(-me.vy * 1.4, -22, 22);
    squirrel.setLocalEulerAngles(lean, me.yaw * 180 / Math.PI, 0);
    if (sqTail) sqTail.setLocalEulerAngles(clamp(-14 - me.vy * 3.4 + me.beat * 24, -70, 34), 0, 0);

    const back = 2.6 + Math.min(1.6, me.speed * 0.12), up = 1.15 + Math.min(1.2, me.alt * 0.05);
    const tx = me.x - hx * back, tz = me.z - hz * back, ty = me.y + up;
    camPos.x += (tx - camPos.x) * Math.min(1, dt * 6.0);
    camPos.y += (ty - camPos.y) * Math.min(1, dt * 5.0);
    camPos.z += (tz - camPos.z) * Math.min(1, dt * 6.0);
    cam.setPosition(-camPos.x, camPos.y, camPos.z);
    cam.lookAt(-(me.x + hx * 3.5), me.y + 0.5, me.z + hz * 3.5);
  }

  /* ── THE JET'S STEP ─────────────────────────────────────────────────────────────────────────
   * Same integrator shape as the bird — forces and springs, nothing on a clock — but a completely
   * different animal: it cannot hover, it turns by BANKING rather than by yawing, and its heading
   * rate falls off with speed so a fast jet turns wide. That last one is DOGFIGHT's law, unit-free
   * and ported unchanged; every SPEED here is re-derived for a city measured in metres.
   * ⚠ `pull` only helps while BANKED. A wings-level jet holding W does not corner, which is what
   *   stops the aircraft handling like a car. */
  function stepJet(dt, fwdIn, turnIn, brake) {
    const auth = clamp((me.spd - JET.stall) / (JET.vref - JET.stall), JET.authMin, 1);

    // roll: a second-order spring toward the commanded bank. ⚠ NOT a lerp — the overshoot is the snap.
    const want = -turnIn * JET.rollMax;
    me.rollV += (JET.rollK * (want - me.roll) - JET.rollD * me.rollV) * dt;
    me.roll = clamp(me.roll + me.rollV * dt, -1.40, 1.40);

    // pitch attitude follows the throttle/brake, and the CLIMB follows the pitch AND the speed
    const wantP = (fwdIn > 0 ? 0.28 : 0) + (brake ? -0.5 : 0);
    me.pitch += (clamp(wantP, -JET.pitchMax, JET.pitchMax) - me.pitch) * Math.min(1, JET.pitchK * dt);

    // heading rate = turnG · sin(roll) · pull · auth / spd^0.6 — DOGFIGHT's own, unchanged
    const pull = 1 + (fwdIn > 0 ? JET.pull : 0);
    me.yaw += JET.turnG * Math.sin(me.roll) * pull * auth / Math.pow(Math.max(20, me.spd), 0.6) * dt;

    const hx = Math.sin(me.yaw), hz = Math.cos(me.yaw);
    let thrust = fwdIn > 0 ? JET.thrust : (fwdIn < 0 ? -JET.thrust * 0.55 : JET.idle);
    if (brake) thrust -= JET.thrust * 0.75;

    /* ── THE WORLD EDGE, AND A JET NEEDS A COMPLETELY DIFFERENT ONE FROM A BIRD ────────────────
     * ⛔ MEASURED FAILURE FIRST: the bird's edge — cancel the outward component of thrust — was
     *   reused here and the jet went **386 m past the wall** (max |x| 2,305.9 against ±1,920) over
     *   60 s of throttle aimed at the corner. ⚠ And the END POSITION HID IT: the jet was turned
     *   round and finished well inside, so a check that only read where it stopped said "fine".
     *   The excursion is the measurement; the final position is not.
     * ⚑ WHY the bird's fix cannot work here: it relies on being able to bring the animal to a
     *   stop against the wall. A jet has `idle` thrust that never reaches zero and cannot fly
     *   below `stall` — being stopped is not a state it has. So the boundary cannot be a wall to
     *   push against; it has to be a TURN, and a turn has to begin BEFORE the edge, because the
     *   aircraft needs a radius to do it in (measured: 239 m at cruise, 8.9 s for 360°).
     * ⚠ Hence a wide APPROACH BAND rather than a penetration depth. `EDGE_R` is about two turn
     *   radii; inside it the nose is walked toward the world, hardest nearest the wall. A pilot
     *   reads that as the aircraft not wanting to go out there, which is the intent. */
    const EDGE_R = 520;
    if (bounds) {
      let ex = 0, ez = 0;
      if (bounds.max[0] - me.x < EDGE_R) ex -= 1;
      if (me.x - bounds.min[0] < EDGE_R) ex += 1;
      if (bounds.max[2] - me.z < EDGE_R) ez -= 1;
      if (me.z - bounds.min[2] < EDGE_R) ez += 1;
      if (ex || ez) {
        const d = Math.min(bounds.max[0] - me.x, me.x - bounds.min[0],
                           bounds.max[2] - me.z, me.z - bounds.min[2]);
        const near = clamp(1 - d / EDGE_R, 0, 1);
        const L = Math.hypot(ex, ez) || 1;
        const inward = Math.atan2(ex / L, ez / L);
        /* ⛔ NOT `sin(inward - yaw)`. SINE VANISHES AT π AS WELL AS AT 0, and π is exactly the case
         * a boundary exists for — flying straight at the wall. Driven with the sine version: the
         * +x wall held at 1,911.7 and the +z wall did not, **max |z| 2,164.4**, because a heading
         * of 45° into the corner sits at the antipode of the inward normal and the correction was
         * multiplied by sin(π) ≈ 0. A dead spot dead ahead. It looked like an asymmetry bug and
         * was a trigonometry one.
         * ⚑ Wrap the difference into (−π, π] and command on the ANGLE, which is largest exactly
         *   where the sine was smallest. The tie at ±π resolves deterministically (atan2 returns
         *   +π), so a jet aimed perfectly at the corner always breaks the same way rather than
         *   sitting balanced on the fence.
         * ⚠ Capped at 0.95 rad/s — above the ~0.72 rad/s the stick itself can command at cruise,
         *   so the boundary always out-turns the pilot. */
        const da = Math.atan2(Math.sin(inward - me.yaw), Math.cos(inward - me.yaw));
        /* ⚑ THE RATE COMES FROM THE GEOMETRY, NOT FROM A CURVE THAT LOOKED RIGHT. To turn the
         * velocity vector before covering the remaining distance `d` at speed `v`, the required
         * rate is about v/d — so that is what is commanded. A fixed cap behind a quadratic ramp
         * was measured leaking 121 m past the wall (max |z| 2,041) because at 220 m out it asked
         * for 0.32 rad/s when the geometry needed 0.76. A boundary tuned by eye is a boundary that
         * holds at the speed you happened to test. */
        const rate = clamp(me.spd / Math.max(55, d), 0.3, 1.7);
        me.yaw += clamp(da * 2.5, -1, 1) * rate * dt;
        // and it BANKS into it, or the aircraft skids sideways like a mouse cursor
        me.roll += clamp(da * 2.5, -1, 1) * -Math.min(1, rate) * 1.5 * near * dt;
        me.roll = clamp(me.roll, -1.40, 1.40);
        const outward = hx * -(ex / L) + hz * -(ez / L);
        if (outward > 0) thrust -= JET.thrust * outward * near * 0.8;
      }
    }

    me.spd += thrust * dt;
    me.spd -= JET.dragK * me.spd * me.spd * dt;
    // height costs speed and refunds it — the same one-currency rule the bird got, at jet scale
    const climb = me.spd * Math.sin(me.pitch) * JET.climbEff - JET.sink * Math.abs(Math.sin(me.roll)) * 6;
    me.spd -= climb * JET.trade * dt;
    me.spd = clamp(me.spd, 18, JET.maxSpd);

    me.vx = hx * me.spd; me.vz = hz * me.spd; me.vy = climb;
    let nx = me.x + me.vx * dt, nz = me.z + me.vz * dt, ny = me.y + me.vy * dt;

    /* ⚠ A JET DOES NOT LAND HERE, AND IT MUST NOT SINK INTO THE STREET EITHER. Ground contact is a
     * CRASH, and crashes are step 2 of the compression (docs/CITY-GAME.md) — until then the floor
     * is a hard deck that pushes the nose up, which is honest about being unfinished rather than
     * pretending the aircraft is fine while it is inside a building. */
    const g = collide ? collide.groundBelow(nx, nz, ny) : null;
    const deck = (g == null ? 0 : g) + 12;
    if (ny < deck) { ny = deck; me.pitch = Math.max(me.pitch, 0.12); }
    if (ny > JET.ceil) { ny = JET.ceil; me.pitch = Math.min(me.pitch, -0.05); }
    me.x = nx; me.z = nz; me.y = ny; me.speed = me.spd; me.onGround = false;
    me.alt = ny - (g == null ? 0 : g);

    jet.setLocalPosition(me.x, me.y, me.z);
    jet.setLocalEulerAngles(me.pitch * 180 / Math.PI, me.yaw * 180 / Math.PI, -me.roll * 180 / Math.PI);

    /* the chase camera sits back and ABOVE, and looks along the nose — at 160 m/s a bird's 4 m
     * lag frames nothing but tailplane. It also banks with the aircraft, which is most of why a
     * jet feels like a jet rather than like a camera following a jet. */
    const M = MODES.jet;
    const tx = me.x - hx * M.camBack, tz = me.z - hz * M.camBack, ty = me.y + M.camUp;
    camPos.x += (tx - camPos.x) * Math.min(1, dt * 5.0);
    camPos.y += (ty - camPos.y) * Math.min(1, dt * 4.0);
    camPos.z += (tz - camPos.z) * Math.min(1, dt * 5.0);
    cam.setPosition(-camPos.x, camPos.y, camPos.z);
    cam.lookAt(-(me.x + hx * 40), me.y + me.pitch * 30, me.z + hz * 40);
    cam.setLocalEulerAngles(cam.getLocalEulerAngles().x, cam.getLocalEulerAngles().y,
                            cam.getLocalEulerAngles().z + me.roll * 34);
  }

  /* ── the mode swap. ⚑ It changes the BODY and the CAMERA and nothing else: one world, one
   * streamer, one edge, one collision set. That is the whole claim the compression rests on, and
   * making the swap live (rather than a reload) is what proves it. */
  function setMode(m) {
    if (!MODES[m] || m === MODE) return MODE;
    MODE = m;
    try { localStorage.setItem('urm_city_mode', m); } catch (e) {}
    showBody();
    /* ⚠ EACH BODY HAS TO ARRIVE SOMEWHERE IT CAN EXIST. A jet at street level is inside a
     * building; an operative at 200 m is falling. The swap places you, rather than leaving the
     * previous mode's position to mean something it does not. */
    if (isJet()) { me.spd = Math.max(70, me.speed); me.y = Math.max(me.y, 90);
                   me.roll = me.rollV = me.pitch = 0; }
    else if (isOp()) { const g = collide ? collide.groundBelow(me.x, me.z, me.y + 4, OP.r, 400) : null;
                       me.y = (g == null ? 0 : g); me.vx = me.vy = me.vz = 0; me.pitch = 0;
                       me.onGround = true; }
    else if (CREATURE === 'squirrel') { const g = collide ? collide.groundBelow(me.x, me.z, me.y + 4, 0.26, 400) : null;
                       me.y = (g == null ? 0 : g); me.vx = me.vy = me.vz = 0; me.onGround = true; }
    else { me.vx = Math.sin(me.yaw) * 16; me.vz = Math.cos(me.yaw) * 16; me.vy = 0; }
    syncHud();
    return MODE;
  }

  /* ⚑ THE CREATURE SWAP IS SEPARATE FROM THE MODE SWAP, because they are different questions.
   * "Which game am I playing" and "which animal am I" are not the same axis, and folding them
   * into one cycle is how a four-animal roster would end up buried three presses deep. */
  function setCreature(c) {
    if (!CREATURES[c]) return CREATURE;
    CREATURE = c;
    try { localStorage.setItem('urm_city_creature', c); } catch (e) {}
    if (MODE !== 'animal') return CREATURE;
    showBody();
    if (c === 'squirrel') { const g = collide ? collide.groundBelow(me.x, me.z, me.y + 4, 0.26, 400) : null;
      me.y = (g == null ? 0 : g); me.vx = me.vy = me.vz = 0; me.onGround = true; }
    else { me.y = Math.max(me.y, 6); me.vx = Math.sin(me.yaw) * 16; me.vz = Math.cos(me.yaw) * 16; }
    syncHud();
    return CREATURE;
  }
  function cycleMode(d) { const i = ORDER.indexOf(MODE);
    return setMode(ORDER[(i + (d || 1) + ORDER.length) % ORDER.length]); }
  function syncHud() {
    const b = $('modeName'); if (b) b.textContent = modeLabel();
    const g = $('modeGame'); if (g) g.textContent = MODES[MODE].name;
    const w = $('hudBL'); if (w) w.dataset.mode = MODE;
    document.body.dataset.mode = MODE;
  }

  addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); cycleMode(e.shiftKey ? -1 : 1); }
    else if (e.key.toLowerCase() === 'c' && MODE === 'animal') {
      setCreature(CREATURE === 'bird' ? 'squirrel' : 'bird'); }
  });

  app.on('update', dt => {
    step(Math.min(dt, 0.05));
    if (ready) streamAround(me.x, me.z);
  });

  resize();
  /* ⛔ THE PRINT PASS IS ATTACHED AFTER THE FIRST RESIZE, and that ordering is the whole fix for a
   * defect that looked like a shader bug. `PostEffectQueue.addEffect` allocates its offscreen
   * target from the canvas size AT THAT MOMENT. Attaching at module scope allocated it against the
   * canvas's pre-layout size; `resize()` then grew the canvas, the scene rendered into part of the
   * (now undersized, reallocated-or-not) target, and a rectangular block of the frame showed STALE
   * CONTENT from an older frame with a hard straight edge down the middle of the sky.
   * ⚠ It reads as a rendering fault in the effect and is a lifecycle mistake in the caller. */
  ink = window.CityInk ? CityInk.attach(app, cam) : false;
  syncHud();
  /* …and the targets have to keep up with the window, or rotating a phone reproduces it exactly. */
  window.addEventListener('resize', () => {
    try { if (cam.camera.postEffects) cam.camera.postEffects.resizeRenderTargets(); } catch (e) {}
  });
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
        yaw: +me.yaw.toFixed(3), speed: +me.speed.toFixed(2),
        alt: +me.alt.toFixed(2), onGround: me.onGround,
        chunk: c.cx + ',' + c.cz, district: CW ? CW.districtAt(c.cx, c.cz) : '?',
        /* ⚑ THE OBSERVER RULE, EXPOSED SO IT CAN BE ASSERTED. "we never gave the bird any health"
         * is not a design — other systems must be able to READ that an animal is not a target. */
        mode: MODE, creature: CREATURE, label: modeLabel(),
        mortal: MODES[MODE].mortal, targetable: MODES[MODE].targetable,
        armed: MODES[MODE].armed, roll: +me.roll.toFixed(3),
        onGround: me.onGround, pitch: +me.pitch.toFixed(3),
        nearChunks: near.size, farRegions: far.size, solids, tris,
        /* ⚑ THE ASSERTION THAT BITES on the silent-material bug: which material classes the world
         * actually built. Two classes across a whole city means the box translation is broken
         * again and everything is one colour, with nothing else to tell you so. */
        classes: [...cls].sort(), byClass: byClass };
    },
    setMode, setCreature, cycleMode, get mode() { return MODE; },
    get creature() { return CREATURE; }, MODES, CREATURES, ORDER, get ink() { return ink; },
    /* ⚑ COLOUR IS MEASURED, NOT LOOKED AT. This container's screenshot path rotates hue on canvas
     * content — a recorded false conclusion — so the print pass is judged on a histogram read
     * straight off the drawing buffer. Needs `?readback=1`; returns null otherwise rather than
     * quietly handing back a frame of zeros, which is what an unflagged readPixels does. */
    _pixels() {
      const gl = app.graphicsDevice.gl;
      if (!READBACK || !gl) return null;
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      /* ⚠ BIND THE DEFAULT FRAMEBUFFER FIRST. The engine leaves its own render target bound at the
       * end of a frame, so an unqualified readPixels samples THAT — and the first run of this probe
       * came back 100% black with one luma level, which reads exactly like a broken renderer and
       * was a bound-target mistake. */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const hist = new Uint32Array(256);
      let sat = 0, dark = 0, n = 0;
      for (let i = 0; i < px.length; i += 4 * 7) {              // every 7th pixel: plenty, and fast
        const r = px[i], g = px[i + 1], b = px[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        hist[(0.299 * r + 0.587 * g + 0.114 * b) | 0]++;
        sat += mx ? (mx - mn) / mx : 0;
        if (mx < 46) dark++;
        n++;
      }
      /* "distinct levels" is the posterise measurement: a smooth render fills most of the 256
       * buckets, a print fills a handful. The 0.2% floor keeps stray dither out of the count. */
      let levels = 0; const floor = n * 0.002;
      for (let i = 0; i < 256; i++) if (hist[i] > floor) levels++;
      return { levels, sat: +(sat / n * 100).toFixed(1), darkPct: +(dark / n * 100).toFixed(2), sampled: n };
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

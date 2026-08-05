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
  /* ⛔ `camBack` / `camUp` ARE LOAD-BEARING AND WERE DROPPED IN A REWRITE — DOGFIGHT RENDERED AN
   * EMPTY SKY FOR TWO COMMITS. `e19fa30` defined them here; `c17d1f7` replaced this table with the
   * mortal/targetable/armed one and did not carry them over, while `stepJet` went on reading
   * `M.camBack`. `x - hx * undefined` is **NaN**, NaN propagates into `camPos` and then into
   * `cam.setPosition`, and a camera at NaN draws NOTHING — so the frame is the clear colour and
   * the whole city is still there behind it.
   * ⚑ THE FAILURE IS SILENT IN BOTH DIRECTIONS, which is why it survived: nothing throws, and the
   *   PHYSICS is untouched, so every driven measurement of the jet (cruise 168 m/s, 360° in 8.9 s,
   *   the world-edge excursions) kept passing — they read `__city.s`, which never looks at the
   *   camera. **A number nobody reads is a surface nobody looks at.**
   * ⚠ ONLY THE JET CARRIES THEM, ON PURPOSE. The bird and the squirrel derive their own chase
   *   distance from speed and altitude every frame, so a constant here would be dead data — and
   *   dead data is not harmless: the first version of the guard below put `camBack` on all three
   *   entries "for completeness", which made the check pass on the broken build, because it only
   *   asked whether the NAME appeared anywhere in the table. A check that passes for the wrong
   *   reason is worse than no check. */
  const MODES = {
    animal:    { name: 'ANIMAL',    mortal: false, targetable: false, armed: false, view: 'chase' },
    jet:       { name: 'DOGFIGHT',  mortal: true,  targetable: true,  armed: true,  view: 'chase',
                 camBack: 15, camUp: 4.2 },
    operative: { name: 'SECTION 9', mortal: true,  targetable: true,  armed: true,  view: 'first' },
  };
  const ORDER = ['animal', 'jet', 'operative'];

  /* ⚑ THE ANIMALS ARE LAYERS, NOT SKINS (docs/CITY-GAME.md §1) — each reaches a different part of
   * the same city, which is what stops "pick your character" being a costume menu. The bird owns
   * the air; the squirrel owns the VERTICAL. Cat and dog are named here so the shape of the table
   * is honest about what is missing rather than pretending the roster is two. */
  const CREATURES = {
    bird:     { name: 'BIRD',     fly: true,  r: 0.45, h: 0.9,  step: 0.4, climb: false },
    /* ⚑ THE SQUIRREL IS THE SPEED-RUN BODY (artist, 2026-08-05: "snappy squirrel racing game …
     * like sonic … but very fast"). `sprint` is explicit rather than the 1.5x default, because
     * the gap between cruise and sprint IS the game: 11.5 -> 23 m/s is 83 km/h and it is what
     * makes the vault reachable and the miss painful. ⚠ `accel` is raised WITH it — a high top
     * speed you take eight seconds to reach reads as sluggish, not fast, and the recorded
     * boundary lesson applies here too: the number that feels like a lot is usually low. */
    squirrel: { name: 'SQUIRREL', fly: false, r: 0.26, h: 0.42, step: 0.55, climb: true,
                run: 11.5, sprint: 23, accel: 62, friction: 7, jump: 7.4, grav: 26 },
    // cat, dog — not built. See docs/CITY-GAME.md order of work, step 5.
  };
  /* ── THE DASH ────────────────────────────────────────────────────────────────────────────
   * ⚠ DECLARED HERE, ABOVE EVERY READER. `const`/`let` hoist into the temporal dead zone, and
   *   this file has already been taken down three times by a constant defined below the function
   *   that reads it — the whole app throws at module scope and the probe reports "undefined"
   *   rather than "the mode is broken". VAULT_SPD is read inside stepGround, far below.
   * ⚑ VAULT_SPD sits between cruise (11.5) and sprint (23): you cannot vault at a walk and you
   *   cannot fail to vault at a sprint, so the threshold is a decision you make with the sprint
   *   key rather than a lottery. VAULT_LIFT 0.5 turns 16 m/s into 8 m/s of climb — about 2.4 m of
   *   rise, which clears a one-storey wall and not a tower. */
  const VAULT_SPD = 15.5;
  const VAULT_LIFT = 0.50;
  let dash = null;

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
  /* ⚑ A FACTORY, NOT AN INLINE BODY, because `js/city-drops.js` needs rival squirrels and two
   * squirrel definitions would drift — and the one that drifts is always the one nobody is
   * currently looking at. `scale` exists so a rival can be slightly smaller than you without a
   * second mesh. Returns the entity; `.tail` is the pivot the caller may animate. */
  function buildSquirrel(scale) {
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
    squirrel.setLocalScale(scale || 1, scale || 1, scale || 1);
    squirrel.tail = sqTail;
    return squirrel;
  }
  const squirrel = buildSquirrel(1);
  const sqTail = squirrel.tail;
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
  /* ⛔ DOGFIGHT's FLIGHT MODEL, PORTED — artist, 2026-08-04: *"the jet flight physics and controls
   *   need to be ported from dogfight."* The previous table borrowed four of its numbers and
   *   re-invented the rest, which is how you get an aircraft that reads as *nearly* right: it had
   *   no boost, no airbrake, no thrust lapse with height, no G-bleed, no stall nose-drop, no
   *   descending turn, and its terminal speed was a `maxSpd` clamp rather than a thrust/drag
   *   balance. The whole feel of `dogfight.html` lives in exactly those.
   *
   * ⚑ THE PORT IS A SCALE CHANGE AND NOTHING ELSE, which is the only way to keep the feel while
   *   moving to a world 25.6× bigger (DOGFIGHT is 150 units across, this city is 3,840 m).
   *   Under a uniform spatial scale S:
   *     · lengths, speeds and accelerations  × S      (STALL, VREF, SINK, BLEED, THRUST, BOOST)
   *     · quadratic drag                     ÷ S      (so terminal √(T/D) scales by S — correct)
   *     · anything in radians or seconds     unchanged (ROLL_K/D, PITCH_K, ROLL_MAX, AUTH_MIN…)
   *     · dimensionless ratios               unchanged (CLIMB_EFF, PULL, LAPSE, TRADE, BRAKE_DRAG)
   *   ⛔ **TURN_G IS THE ONE THAT IS NOT OBVIOUS AND THE ONE THAT WAS WRONG.** The heading law is
   *     ω = TURN_G·sin(roll)·pull·auth / spd^0.6, and that 0.6 exponent means it does NOT scale
   *     like a speed. To hold the turn RATE (and therefore make the radius scale with the world,
   *     which is what "the same aircraft in a bigger city" means) TURN_G must go up by S^0.6 =
   *     6.97, not by S and not by 1. It was being used RAW at 10.4 against speeds 25× larger, so
   *     every turn was ~7× too wide — the single biggest reason the jet did not feel like
   *     DOGFIGHT's. 10.4 × 6.97 = 72.5.
   * ⚠ Terminal speeds that fall out of this: √(191.7/0.003613) = **230 m/s** dry and **563 m/s**
   *   on boost — the same 6.8 s to cross the world DOGFIGHT has, because the ratio is preserved.
   */
  const S_JET = 3840 / 150;                    // this city ÷ DOGFIGHT's world
  const JET = {
    stall: 2.9 * S_JET,          // 74.2 — below this the wing quits and the nose drops
    vref: 7.2 * S_JET,           // 184.3 — authority reaches 1 here
    authMin: 0.34,               // never zero: unresponsive is a feeling, uncontrollable is a bug
    rollMax: 1.16,               // 66° commanded bank
    rollLim: 1.40,               // 80° — the overshoot a snap roll may reach
    rollK: 81, rollD: 11.6,      // ω 9.0, ζ 0.644: 95% of bank in 0.25 s with ~7% overshoot
    turnG: 10.4 * Math.pow(S_JET, 0.6),        // 72.5 — see the note above
    pull: 0.62,                  // nose-up while banked buys the hard turn
    pitchMax: 0.58, pitchK: 6.2, // 33° of attitude
    climbEff: 0.62,              // climb = spd · sin(pitch) · this — a slow jet cannot climb
    sink: 1.55 * S_JET,          // 39.7 — a banked wing stops holding you up
    lapse: 0.45,                 // thrust lost at the ceiling: thin air
    trade: 3.0,                  // speed paid per unit of height, refunded coming down
    bleed: 2.2 * S_JET,          // 56.3 — energy scrubbed by pulling G
    drag: 0.0925 / S_JET,        // 0.003613
    thrust: 7.49 * S_JET,        // 191.7
    boost: 44.8 * S_JET,         // 1146.9
    brakeDrag: 3.2,
    altMin: 0.35 * S_JET,        // 9.0 m — the deck
    ceil: 9.0 * S_JET,           // 230.4 m — and the towers reach ~150, so it clears them
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
  /* ⛔ AND THE ONE-PAD SCHEME DOES NOT SURVIVE CONTACT WITH A BODY ON FOOT. Everything above is
   *   right for a bird: it cannot stop, so forward is free and a single drag is the whole
   *   instrument. An operative can stop, must aim independently of where it is walking, and has a
   *   trigger — three things a single pad cannot express at once. Left over on a phone, auto-
   *   forward meant an operative that walked into a wall while you tried to look at something.
   * ⚑ ON FOOT IT IS TWO PADS, and the split is by SCREEN HALF rather than by a drawn stick: left
   *   thumb moves, right thumb looks, wherever each lands becomes its own centre. Same principle
   *   as the flight pad — no zone to miss — applied to a body that needs two axes of intent. */
  const TOUCH = (() => { try { return matchMedia('(pointer: coarse)').matches ||
    ('ontouchstart' in window) || navigator.maxTouchPoints > 0; } catch (e) { return false; } })();
  const touch = { on: false, dx: 0, dy: 0, auto: 0,
                  move: { on: false, x: 0, y: 0 }, look: { on: false, x: 0, y: 0 } };
  const onFoot = () => isOp() || (MODE === 'animal' && CREATURE === 'squirrel');

  if (TOUCH) {
    cv.style.touchAction = 'none';
    const ui = document.createElement('div');
    ui.id = 'touchUI';
    ui.innerHTML = '<button id="tAct" type="button" aria-label="drop a card">✱</button>' +
                   '<button id="tCreature" type="button" aria-label="switch animal">◔</button>' +
                   '<button id="tAds" type="button" aria-label="aim">◎</button>' +
                   '<button id="tFire" type="button" aria-label="fire">◉</button>' +
                   '<button id="tFlap" type="button" aria-label="flap or jump">✦</button>' +
                   '<button id="tMode" type="button" aria-label="switch game mode">⇄</button>';
    document.body.appendChild(ui);

    const REACH = 90;                       // px of drag for full deflection
    const pads = new Map();                 // pointerId -> { kind, ox, oy }
    cv.addEventListener('pointerdown', e => {
      /* ⚠ THE KIND IS DECIDED AT TOUCH-DOWN AND HELD. Re-reading the half on every move would
       * flip a thumb from move to look the moment it dragged across the middle of the screen. */
      const kind = !onFoot() ? 'steer'
        : (e.clientX < (cv.clientWidth || innerWidth) / 2 ? 'move' : 'look');
      if (kind === 'steer' && pads.size) return;
      for (const p of pads.values()) if (p.kind === kind) return;
      pads.set(e.pointerId, { kind, ox: e.clientX, oy: e.clientY });
      if (kind === 'steer') touch.on = true;
      else touch[kind].on = true;
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    cv.addEventListener('pointermove', e => {
      const p = pads.get(e.pointerId); if (!p) return;
      const dx = clamp((e.clientX - p.ox) / REACH, -1, 1);
      const dy = clamp((e.clientY - p.oy) / REACH, -1, 1);
      if (p.kind === 'steer') { touch.dx = dx; touch.dy = dy; }
      else { touch[p.kind].x = dx; touch[p.kind].y = dy; }
      e.preventDefault();
    });
    const release = e => {
      const p = pads.get(e.pointerId); if (!p) return;
      pads.delete(e.pointerId);
      if (p.kind === 'steer') { touch.on = false; touch.dx = 0; touch.dy = 0; }
      else { touch[p.kind].on = false; touch[p.kind].x = 0; touch[p.kind].y = 0; }
      /* ⚠ A TAP IS A POINTERUP THAT DID NOT DRAG. Firing the flap on every pointerup would beat
       * the wings at the end of every steering swipe, which reads as the bird lurching whenever
       * you turn. On foot the same gesture on the LOOK half is the trigger — a tap where you are
       * aiming is the one place a shot could mean anything else. */
      if (Math.abs(e.clientX - p.ox) < 12 && Math.abs(e.clientY - p.oy) < 12) {
        if (p.kind === 'look' && isOp()) tapFire = 2; else if (p.kind !== 'look') tapFlap = 2;
      }
    };
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);

    const flapBtn = $('tFlap'), modeBtn = $('tMode'), fireBtn = $('tFire');
    if (flapBtn) { const hold = v => e => { e.preventDefault(); holdFlap = v; };
      flapBtn.addEventListener('pointerdown', hold(true));
      flapBtn.addEventListener('pointerup', hold(false));
      flapBtn.addEventListener('pointercancel', hold(false)); }
    /* ⚠ HELD, NOT TAPPED. FULL TILT is an automatic weapon; a click-per-round trigger would make
     * the only auto in the game the slowest thing in it on the device most people are holding. */
    /* ⚠ AIM IS A HOLD ON A PHONE TOO, and it sits beside the trigger rather than replacing a
     * tap gesture — the right thumb is already the look pad, so a gesture would have fought it. */
    const adsBtn = $('tAds');
    if (adsBtn) { const hold = v => e => { e.preventDefault(); holdAds = v; };
      adsBtn.addEventListener('pointerdown', hold(true));
      adsBtn.addEventListener('pointerup', hold(false));
      adsBtn.addEventListener('pointercancel', hold(false)); }
    if (fireBtn) { const hold = v => e => { e.preventDefault(); holdFire = v; };
      fireBtn.addEventListener('pointerdown', hold(true));
      fireBtn.addEventListener('pointerup', hold(false));
      fireBtn.addEventListener('pointercancel', hold(false)); }
    if (modeBtn) modeBtn.addEventListener('click', e => { e.preventDefault(); cycleMode(1); });
    const actBtn = $('tAct');
    if (actBtn) actBtn.addEventListener('click', e => { e.preventDefault(); actTap = 1; });
    const crBtn = $('tCreature');
    if (crBtn) crBtn.addEventListener('click', e => { e.preventDefault();
      if (MODE !== 'animal') setMode('animal');
      else setCreature(CREATURE === 'bird' ? 'squirrel' : 'bird'); });
  }
  /* ⚠ ALL THE INPUT LATCHES IN ONE PLACE, ABOVE EVERY READER. `const`/`let` hoist into the
   * temporal dead zone, and a top-level read above the declaration takes the whole app down
   * silently — three sightings in this repo, one of them in this very file. */
  let tapFlap = 0, holdFlap = false, tapFire = 0, holdFire = false, mouseDown = false,
      adsDown = false, holdAds = false;

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
  /* ── ⛔ THE POINTER LOCK IS THE "FREEZES AND LOCKS" REPORT, AND IT IS THREE DEFECTS ─────────
   * Artist, 2026-08-05: *"when moving from jet to on the ground with gun, the game freezes and
   * locks."* Every number stayed healthy through it — mode swaps, ground contact, `camBad` 0, no
   * throw — because the simulation was never the problem. The INPUT was:
   *
   *  (a) ⛔ ENTERING THE OPERATIVE, THE VIEW WOULD NOT TURN AND NOTHING SAID WHY. `mousemove`
   *      returns early unless `document.pointerLockElement === cv`, and the lock is only ever
   *      requested by a canvas click. Come from the jet — where the mouse does nothing and you
   *      have no reason to have clicked — and you land in a first-person body whose camera
   *      ignores the mouse. **That is exactly what "frozen" looks like from the chair.**
   *  (b) ⛔ LEAVING THE OPERATIVE NEVER RELEASED IT. Lock the pointer, press TAB, and you are in
   *      a chase-camera game with the cursor still captured and invisible: the mode chips, the
   *      cabinet links and the arcade are all unclickable. **That is "locks", literally.**
   *  (c) ⚠ A REFUSED LOCK WAS SILENT. Chrome rejects `requestPointerLock` for about a second
   *      after an Escape exit, and it rejects it entirely on a call with no user gesture. The
   *      click then does nothing, forever, with no error anyone sees.
   *
   * ⚑ The prompt is the fix for all three, because it makes the state VISIBLE: it is shown
   *   whenever the operative is unlocked, hidden the moment the lock takes, and it comes back on
   *   `pointerlockerror` instead of the click vanishing. A missing affordance cannot be found by
   *   any assertion about the simulation, which is why nothing here caught it. */
  function syncLock() {
    const el = $('lockHint');
    if (!el) return;
    el.hidden = !(isOp() && document.pointerLockElement !== cv);
  }
  cv.addEventListener('click', () => {
    if (!isOp() || !cv.requestPointerLock) return;
    try {
      const p = cv.requestPointerLock();
      if (p && p.catch) p.catch(() => syncLock());     // newer Chrome returns a promise
    } catch (e) { syncLock(); }
  });
  document.addEventListener('pointerlockchange', syncLock);
  document.addEventListener('pointerlockerror', syncLock);

  /* ── the trigger, and the weapon selector. ⚠ THE FIRST CLICK IS THE POINTER LOCK, NOT A SHOT.
   * Firing on it too would spend a round every time you clicked back into the window, and on
   * COLD CALL that is a fifth of the magazine for tabbing away. */
  cv.addEventListener('mousedown', e => {
    if (!isOp() || document.pointerLockElement !== cv) return;
    if (e.button === 0) mouseDown = true;
    /* ⛔ RIGHT MOUSE AIMS — Section 9's own binding, and the one missing control that changes how
     * the weapon BEHAVES rather than only how it looks. `contextmenu` must be suppressed or the
     * browser eats the press. */
    else if (e.button === 2) { adsDown = true; e.preventDefault(); }
  });
  cv.addEventListener('contextmenu', e => { if (isOp()) e.preventDefault(); });
  addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false;
    else if (e.button === 2) adsDown = false; });
  addEventListener('blur', () => { mouseDown = false; adsDown = false; });
  addEventListener('wheel', e => { if (!isOp() || !ops) return;
    ops.cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });
  addEventListener('keydown', e => {
    if (!isOp() || !ops) return;
    const k = e.key.toLowerCase();
    if (k === 'r') ops.reload();
    else if (k >= '1' && k <= '4') ops.switchWeapon(+k - 1);
  });

  /* ⚑ ONE ACTION KEY FOR BOTH ANIMALS, and it means the same thing in both: LET GO OF SOMETHING.
   * The bird lets go of a card into the air; the squirrel lets go of the one in its mouth. One
   * verb, two bodies — which is how a control scheme stays learnable as the roster grows. */
  let actTap = 0;
  /* ⚠ ONE PRESS IS ONE DROP. This latched 2 and `readInput` spends one per call, so every press
   *   dropped TWICE — invisible while the supply was infinite, and immediately wrong once the
   *   pouch is five deep. A latch exists to survive a frame where input is not read; a latch of
   *   two is a repeat. */
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 'f') actTap = 1; });

  /* ⛔ ONE KEY, BOTH DIRECTIONS. `E` gets in and `E` gets out — a separate exit key is a key you
   * have to be told about, and the prompt already says E. ⚠ It is deliberately NOT the action key
   * `F`: the squirrel drops a card with F while standing next to a car, and one key doing two
   * unrelated things depending on proximity is how a control scheme starts lying. */
  addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'e' || !rides) return;
    if (rides.driving) {
      const spot = rides.exit(OP.r, OP.h);
      if (spot) { me.x = spot.x; me.y = spot.y; me.z = spot.z;
                  me.vx = me.vy = me.vz = 0; me.speed = 0; me.onGround = true; showBody(); }
    } else if (rides.enter({ x: me.x, z: me.z, mode: MODE === 'animal' ? CREATURE : MODE })) {
      showBody();
    }
    syncHud();
  });

  /* the last thing the drop key did, shown for a beat — see the note on the carry HUD */
  let dropSay = 0, dropMsg = '';
  function says(m) { dropMsg = m; dropSay = 1.6; }
  function doAction() {
    if (!drops || MODE !== 'animal') return null;
    if (CREATURE === 'bird') {
      /* ⚠ Inherits the bird's velocity and is tossed BACKWARD. A card that left forward would
       * out-run the bird and land ahead of it, which is neither funny nor useful — and the joke
       * IS the mechanic: you cannot place it precisely, you have to fly over the spot. */
      const d = drops.drop(me.x, me.y, me.z, me.vx, me.vz);
      says(d ? ('DROPPED ' + d.kind.name) : 'POUCH EMPTY — fly low over a card to pick one up');
      return d;
    }
    const d = drops.dropCarried(me);
    says(d ? ('DROPPED ' + d.kind.name) : 'NOTHING TO DROP — take one off the ground or off a rival');
    return d;
  }

  function readInput() {
    let fwd = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0);
    let turn = (keys['d'] || keys['e'] || keys['arrowright'] ? 1 : 0) -
               (keys['a'] || keys['q'] || keys['arrowleft'] ? 1 : 0);
    /* ⚑ A/D STRAFES ONCE THERE IS A MOUSE DOING THE TURNING. In every other body A/D is the only
     * way to change heading, so it turns; in an FPS the mouse turns and A/D sidesteps, and a
     * shooter where A/D spins the camera is a shooter nobody can play. Q/E keep turning in both,
     * which is what makes the mode usable before the first click grabs the pointer lock. */
    let strafe = 0;
    if (isOp()) {
      strafe = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
      turn = (keys['e'] ? 1 : 0) - (keys['q'] ? 1 : 0);
    }
    let dive = !!keys['shift'];
    let flap = !!keys[' '];
    let fire = mouseDown && isOp();
    if (TOUCH) {
      if (!onFoot()) {
        if (!fwd) fwd = 1;                     // forward is automatic — see the note above
        if (touch.on) { turn = touch.dx; if (touch.dy > 0.45) dive = true; }
      } else {
        /* two pads: left is where you are going, right is where you are looking. ⚠ The look pad
         * drives RATES, not absolutes — an absolute pitch means letting go re-centres your aim,
         * which is exactly the thing a thumb must not do mid-firefight. */
        if (touch.move.on) { fwd = -touch.move.y;
          if (isOp()) strafe = touch.move.x; else turn = touch.move.x; }
        if (touch.look.on) {
          turn += touch.look.x * 1.35;
          me.pitch = clamp(me.pitch - touch.look.y * 1.9 * (1 / 60), -1.2, 1.2);
        }
        if (touch.move.on && Math.abs(touch.move.y) > 0.82) dive = true;   // push the stick to run
      }
      if (holdFlap) flap = true;
      if (tapFlap > 0) { flap = true; tapFlap--; }
      if (holdFire) fire = true;
      if (tapFire > 0) { fire = true; tapFire--; }
    }
    let act = false;
    if (actTap > 0) { act = true; actTap--; }
    /* ⚑ CROUCH is Section 9's CTRL, and it is a real state rather than a camera offset: it
     * lowers the eye, slows the walk and steadies the aim, which is why anyone crouches. */
    return { fwd, turn, strafe, dive, flap, act, fire, hand: !!keys[' '],
             ads: (adsDown || holdAds) && isOp(), crouch: !!keys['control'] && isOp() };
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
  let ready = false, bounds = null, collide = null, LEVEL = null, drops = null, ops = null, rides = null;
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

  /* Which of a region's chunks the near tier is currently drawing at full detail. That set IS the
   * hole the horizon copy must leave, and it is also the region's cache key: when it changes, the
   * region is stale and has to be rebuilt. */
  function holeOf(rx, rz) {
    let sig = '';
    for (let i = 0; i < REGION; i++) for (let j = 0; j < REGION; j++) {
      const k = key(rx * REGION + i, rz * REGION + j);
      if (near.has(k)) sig += k + ';';
    }
    return sig;
  }

  function buildRegion(rx, rz) {
    const hole = holeOf(rx, rz);
    const g = CW.genRegion(rx * REGION, rz * REGION, REGION,
      (cx, cz) => near.has(key(cx, cz)));
    if (!g.solids.length) { far.set(key(rx, rz), { ent: null, hole }); return; }
    const lvl = S9PCWorld.buildFor(app, { name: 'r' + rx + '_' + rz, solids: g.solids, open: true,
                                          x0: g.x0, z0: g.z0, x1: g.x1, z1: g.z1 });
    /* The horizon never receives shadows and never casts them — it is past the shadow distance
     * anyway, and asking for 80 chunks of shadow casters is how a streamer eats a frame. */
    if (lvl && lvl.root && lvl.root.render) { lvl.root.render.castShadows = false; lvl.root.render.receiveShadows = false; }
    far.set(key(rx, rz), { ent: lvl ? lvl.root : null, parts: lvl ? lvl.parts : null, hole });
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
      const rx = rc.rx + i, rz = rc.rz + j, rk = key(rx, rz);
      const have = far.get(rk);
      /* ⚑ STALE IF ITS HOLE MOVED. A region is not just "built or not" any more — it is built
       * AROUND a particular set of near chunks, and when that set changes the copy underneath is
       * wrong in one of two ways: geometry drawn twice, or a gap. Rebuilding on the signature
       * makes the tier self-correcting without any special cases for which way it drifted. */
      if (!have) pending.push({ d: 40 + i * i + j * j, fn: () => buildRegion(rx, rz), k: rk, near: 0 });
      /* ⛔ A STALE REGION OUTRANKS A NEW HORIZON REGION AND EVERY NEAR CHUNK BUT THE CLOSEST, and
       * that priority is load-bearing rather than tidy. A stale region is what BLOCKS the near
       * tier from shedding chunks (see the destroy pass below), so starving it leaks geometry:
       * measured at jet speed with these jobs behind the new-chunk queue, the near tier grew to
       * **111 chunks against a working set of 25** — four times the geometry, silently, because
       * nothing was ever destroyed. Near chunks span d 0–8; 10 puts a refill immediately after
       * them and well ahead of the 40+ band. */
      else if (have.hole !== holeOf(rx, rz))
        pending.push({ d: 10 + i * i + j * j, fn: () => { destroyEntry(have); buildRegion(rx, rz); }, k: rk, near: 0 });
    }
    pending.sort((a, b) => a.d - b.d);
    for (let n = 0; n < BUILD_BUDGET && pending.length; n++) { const job = pending.shift(); job.fn(); }

    /* ⛔ A NEAR CHUNK MAY NOT BE DESTROYED WHILE A REGION IS STILL LEAVING A HOLE FOR IT, or the
     * ground opens up and you see straight through the world for as long as the rebuild queue
     * takes. That is strictly worse than the double-draw this whole scheme exists to remove, so
     * the ordering is: region refills first, chunk goes second. It resolves on the next frame
     * because dropping out of `wantNear` is what marks the region stale in the first place. */
    for (const [k, v] of near) { const p = k.split(',');
      if (Math.abs(+p[0] - c.cx) > NEAR_R + 1 || Math.abs(+p[1] - c.cz) > NEAR_R + 1) {
        const rk = key(Math.floor(+p[0] / REGION), Math.floor(+p[1] / REGION));
        const reg = far.get(rk);
        /* ⚠ AND THE WAIT IS BOUNDED. An unbounded "wait for the refill" is a pin, and a pin whose
         * release depends on a queue is a leak the moment that queue is busy — which is exactly
         * what 111 chunks was. After the grace period the chunk goes regardless: a momentary gap
         * 360 m away, at the far edge of the near tier, costs far less than unbounded growth, and
         * with the priority above it should never actually be reached. */
        if (reg && reg.hole && reg.hole.indexOf(k + ';') >= 0) {
          v.pinned = (v.pinned || 0) + 1;
          if (v.pinned < 90) continue;
        }
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
      /* ⚑ RAY vs the city — the slab method over the near chunks' AABBs. Section 9 needs exactly
       * three things from a world and this is the third: collide, stand on, and SEE THROUGH or
       * not. ⚠ It is the same box list the geometry was built from, so a shot cannot pass through
       * something you can see — the 1:1 guarantee again, now doing work for line of sight and for
       * every bullet. Returns the hit distance, or null. */
      rayHit(ox, oy, oz, dx, dy, dz, maxT) {
        const c = CW.chunkAt(ox, oz);
        let best = maxT == null ? 400 : maxT, hit = null;
        const rng = Math.ceil(Math.min(best, 240) / CW.CHUNK) + 1;
        for (let i = -rng; i <= rng; i++) for (let j = -rng; j <= rng; j++) {
          const e = near.get(key(c.cx + i, c.cz + j)); if (!e) continue;
          const S = e.solids;
          for (let n = 0; n < S.length; n++) { const b = S[n];
            let t0 = 0, t1 = best, ok = true;
            for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]]) {
              if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) { ok = false; break; } continue; }
              let a = (lo - o) / d, bb = (hi - o) / d;
              if (a > bb) { const t = a; a = bb; bb = t; }
              if (a > t0) t0 = a; if (bb < t1) t1 = bb;
              if (t0 > t1) { ok = false; break; }
            }
            if (ok && t0 >= 0 && t0 < best) { best = t0; hit = b; }
          }
        }
        return hit ? { t: best, box: hit } : null;
      },
      /* ⚑ THE BOXES AROUND A POINT — what `js/city-ops.js` bakes cover out of. Section 9 bakes
       * cover once per map from `MAP.solids`; a generated city has no bake step and no fixed map,
       * so the same list has to be answerable as a query. Same boxes, same 1:1 guarantee: a bot
       * cannot hide behind something that is not there to see. */
      solidsNear(x, z) {
        const c = CW.chunkAt(x, z); const out = [];
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const e = near.get(key(c.cx + i, c.cz + j)); if (!e) continue;
          const S = e.solids;
          for (let n = 0; n < S.length; n++) out.push(S[n]);
        }
        return out;
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
    /* ⛔ THE BIRD PLANTS, THE SQUIRREL TAKES — artist, 2026-08-03. This is the first time the
     * animal LAYERS touch each other rather than merely seeing different things, which is the
     * difference between a roster and a game. See js/city-drops.js. */
    drops = window.CityDrops
      ? CityDrops.create(app, world, { collide, makeSquirrel: buildSquirrel })
      : null;
    /* ⚑ SECTION 9 ON THE GROUND — artist, 2026-08-03. `moveBody` is handed over rather than
     * reimplemented, so a bot walks this city by exactly the rule the player does; `onKill` is the
     * line that keeps the firefight in the SAME game as the bird and the squirrel, because what
     * falls out of an operative is a card and cards go in the binder. */
    /* ⚑ CARS — artist, 2026-08-04. Same shape as the drops and the firefight: its own module,
     * handed the one collider, failing open to a city with no cars in it. */
    rides = window.CityRides ? CityRides.create(app, world, { collide }) : null;
    ops = window.CityOps
      ? CityOps.create(app, world, { collide, moveBody, camera: cam,
          onKill: (x, y, z) => { if (drops) drops.drop(x, y, z, 0, 0); } })
      : null;
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
    /* ⚑ THE RIVALS EXIST FROM THE FIRST FRAME, not after a walk. A steal needs somebody to steal
     * FROM, so seeding them at the spawn is what makes the mechanic present rather than
     * theoretical — and they are placed on ground read from the collider, the same rule the
     * player's own spawn had to learn the hard way. */
    if (drops) drops.seed(me.x, me.z, 4);
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
    stepDrops(dt);
    /* ⚠ INPUT FIRST, THEN THE FIREFIGHT. `step()` returns early for the jet and for every body on
     * foot, so anything that must run in EVERY mode has to happen above those branches — that is
     * how a bot would otherwise freeze mid-reload the moment you became a bird. */
    const IN = readInput();
    if (ops) { ops.setTrigger(IN.fire); ops.setAds(IN.ads); }
    stepOps(dt);
    stepDash(dt);          // ⛔ inside step(), so `_step(n)` advances it too
    /* ⛔ DRIVING REPLACES THE BODY'S STEP, NOT THE MODE. You are still an animal or an operative —
     * `targetable` and `armed` are untouched — you are simply in a car, so the car integrates and
     * the body rides along at its seat. Making this a fourth MODE would have put a loophole in the
     * observer rule shaped like a car door. */
    if (rides && rides.driving) { stepDrive(dt, IN); return; }
    if (IN.act) doAction();
    const fwdIn = IN.fwd, turnIn = IN.turn, diving = IN.dive;
    /* ⚑ DOGFIGHT's OWN BINDINGS: ◀▶ / A-D ROLL (there is no rudder — the heading follows the bank),
     * ▲▼ / W-S PITCH with UP being nose-up, SHIFT boost, Q airbrake. ⚠ `-IN.fwd` because W reads as
     * +1 everywhere else in this game and nose-up is NEGATIVE pitch in the model being ported. */
    if (isJet()) { stepJet(dt, -fwdIn, turnIn, !!keys['q'], diving); return; }
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
  /* counts frames the camera had to be rescued from a non-finite position — exposed on `__city.s`
   * so a headless run can assert ZERO rather than trusting that a screenshot looked fine. */
  let camBad = 0;
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
   * ✅ THE FIREFIGHT IS REAL NOW — `js/city-ops.js`, artist 2026-08-03. This file still owns the
   *   BODY (walking, looking, gravity, the camera); that one owns what happens to it (the weapon,
   *   the bots, damage, the observer rule). The split is deliberate: movement is shared with the
   *   squirrel and combat is not, so folding them together would put a weapon on an animal.
   * ⚑ THE CAPSULE COMES FROM CityOps, NOT FROM A SECOND OPINION ABOUT IT. Section 9's own numbers
   *   are r 0.42 / h 1.72 / step 0.62; the literal below is only what this file falls back to when
   *   the combat module is absent, and `npm run test:reach` asserts the two agree. */
  const OP = (window.CityOps && CityOps.BODY) ||
             { r: 0.42, h: 1.72, step: 0.62, eye: 1.58,
               run: 6.4, sprint: 9.6, accel: 46, friction: 11, airAccel: 9,
               jump: 6.6, grav: 26, climb: false };

  /* ⚑ THE COLLISION RESOLVE, FOR ANY BODY ON FOOT — the player's squirrel, the player's operative,
   * and every bot `js/city-ops.js` puts in the street. `b` is any `{x,y,z,vx,vy,vz,onGround}`.
   * Exported through the dev hook and handed to CityOps, so there is exactly one answer in this
   * game to "what happens when a body meets the city". */
  function moveBody(b, dt, B, climbing) {
    let ny = b.y + b.vy * dt;
    if (collide) {
      const g = collide.groundBelow(b.x, b.z, ny, B.r, B.step);
      if (g != null && ny <= g + 0.02 && b.vy <= 0) { ny = g; b.vy = 0; b.onGround = true; }
      else if (!climbing) b.onGround = false;
    }
    let nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
    if (collide) {
      const probe = ny + B.step, hh = Math.max(0.2, B.h - B.step);
      if (collide.hits(nx, probe, b.z, B.r, hh)) { nx = b.x; b.vx = 0; }
      if (collide.hits(nx, probe, nz, B.r, hh)) { nz = b.z; b.vz = 0; }
      // having moved, step UP onto whatever is now under us (a kerb, a stoop, a step)
      const g2 = collide.groundBelow(nx, nz, ny + B.step, B.r, B.step);
      if (g2 != null && g2 > ny && g2 - ny <= B.step && b.vy <= 0) { ny = g2; b.vy = 0; b.onGround = true; }
      /* ⚠ A CEILING IS NOT A FLOOR. Without this you jump THROUGH the underside of a bridge and
       * pop out on top of it, which reads as the city being made of paper.
       * ⛔ AND IT CANNOT APPLY TO A BODY THAT IS CLIMBING — THIS IS THE "STUCK ON WALL LEDGES"
       *   REPORT, AND IT IS NOT THE LIP. A climbing squirrel is BY DEFINITION pressed into the
       *   wall it is climbing: `wallAt` reaches `r + 0.22`, so the body's own footprint overlaps
       *   the box, and its head at `y + h` is INSIDE it. The ceiling test then fires on the very
       *   wall being climbed and pins `ny` back to where it started, every frame, forever.
       *   ⚑ Measured: a squirrel against a wall spanning z 37..38 · y 0..8.9, holding forward for
       *     seven seconds — `vy` set to +5.58 every frame and **y constant at 0.99 for all 420
       *     ticks**, `onGround` false, nothing thrown. It reads exactly like being glued to the
       *     wall, which is what was reported.
       *   ⚠ It looks like a floor bug and it is a CEILING bug; the give-away is `onGround:false`
       *     with a body that is neither rising nor falling. Gravity is not being skipped — the
       *     climb is being cancelled after the fact.
       * ⚑ Skipping it while climbing is safe because the climb has its own ceiling: `mantle()`
       *   ends the ascent at the wall's top and puts the body on the roof. An overhang above a
       *   climbable wall stops you when you arrive on it, not by freezing you halfway up. */
      if (!climbing && b.vy > 0 && collide.hits(nx, ny + B.h, nz, B.r, 0.1)) { ny = b.y; b.vy = 0; }
    }
    const edge = edgePush(nx, nz);
    if (edge.out > 0) { nx += edge.nx * edge.out; nz += edge.nz * edge.out; }
    b.x = nx; b.z = nz; b.y = ny;
    b.speed = Math.hypot(b.vx, b.vz);
    { const g = collide ? collide.groundBelow(b.x, b.z, b.y, B.r, B.step) : null;
      b.alt = b.y - (g == null ? 0 : g); }
    return b;
  }

  /* ONE ground-movement integrator for the squirrel AND the operative, because they differ in
   * SIZE and REACH, not in physics. Two copies would drift, and the one that drifts is always the
   * one nobody is currently looking at. */
  function stepGround(dt, IN, B) {
    me.yaw += IN.turn * 2.6 * dt;
    const hx = Math.sin(me.yaw), hz = Math.cos(me.yaw);
    const want = IN.fwd;
    const crouch = !!IN.crouch;
    /* ⛔ `!B.climb` LOCKED THE SPRINT OFF THE ONE BODY THAT NEEDS IT. The clause was there to stop
     * SHIFT double-booking as a dive, but it keys on the wrong property: the SQUIRREL climbs, so
     * the squirrel could never sprint — measured, 11.5 m/s flat out with SHIFT held, against a
     * 23 m/s cap that was simply unreachable. And it is not a cosmetic cap: VAULT_SPD sits above
     * cruise, so the entire speed-is-the-lift mechanic was unreachable too, on a body that looked
     * like it was working. ⚑ Ask whether the body HAS a sprint gear, not whether it can climb. */
    const sprint = IN.dive && !crouch && (B.sprint ? true : !B.climb);
    const top = crouch ? (B.run || 6) * 0.45 : sprint ? (B.sprint || B.run * 1.5) : (B.run || 6);
    /* ⚠ THE EYE FOLLOWS AS A SPRING, not as a snap. A crouch that teleports the camera down 40 cm
     * reads as a glitch; the same settle every other camera here uses reads as ducking. */
    me.crouchT = (me.crouchT || 0) + ((crouch ? 1 : 0) - (me.crouchT || 0)) * Math.min(1, dt * 9);
    const onG = me.onGround;

    /* ── THE CLIMB, and it is the squirrel's entire reason to exist. A wall within reach IS a
     * route: hold forward against anything tall and you go up it. Every box in this city is
     * climbable by construction — the same 1:1 guarantee the generator makes about landing, which
     * is only true because the geometry and the collision set are one thing. */
    /* ── ⛔ THE LIP IS A LIMIT CYCLE, AND THAT IS THE "STUCK ON WALL LEDGES" REPORT ───────────
     * Artist, 2026-08-05: *"the squirell gets stuck on wall ledges and that shouldn't happen."*
     *
     * ⛔ THE CLIMB ENDS BY LOSING ITS OWN WALL. `wallAt` only returns a box while `y <= b.y1`, so
     *   the instant the squirrel's feet clear the top the wall stops existing: `climbing` goes
     *   false, gravity resumes, the body drops back into reach, `wallAt` finds it again and it
     *   climbs again. **A stable oscillation at the lip** — it reads as being stuck to the wall,
     *   and nothing errors because every individual frame is doing exactly what it was told.
     * ⛔ AND THE OLD CREST WAS A NUDGE, WHICH CANNOT WIN THE RACE IT IS IN. It added `hx * 3.2`
     *   to velocity for the frame or two the body was inside the crest band — while the same
     *   branch multiplied horizontal speed by 0.5 EVERY frame. The push decayed faster than it
     *   could carry the body the `r + 0.22` it needs to clear the footprint.
     * ⚑ SO CRESTING IS A PLACEMENT, NOT AN IMPULSE. Reaching the top puts the body ON the roof,
     *   past the edge, standing — which is what the old comment already claimed ("crest it and
     *   step onto the roof") and what a nudge could only sometimes achieve. It cannot oscillate,
     *   because it ends the climb by ending the reason to climb.
     * ⚠ REFUSED IF THE LANDING IS NOT CLEAR. A wall with something standing on it would otherwise
     *   teleport the squirrel inside it — and the body keeps grinding instead, which is the
     *   honest outcome: there is genuinely nowhere to go. */
    function mantle(w, carry) {
      if (me.y + B.h < w.top) return false;              // head still below the lip
      const nx = hx, nz = hz;
      const reach = (B.r || 0.26) + 0.34;
      const tx = me.x + nx * reach, tz = me.z + nz * reach, ty = w.top + 0.02;
      if (collide && collide.hits(tx, ty, tz, B.r, B.h)) return false;
      me.x = tx; me.z = tz; me.y = ty;
      me.vy = 0; me.onGround = true;
      me.vx = nx * carry; me.vz = nz * carry;            // step off carrying what you arrived with
      me.vaulting = 0;
      return true;
    }

    let climbing = false;
    if (B.climb && want > 0) {
      const w = collide && collide.wallAt(me.x, me.y, me.z, B.r + 0.22);
      if (w) {
        climbing = true;
        /* ⚑ SPEED IS THE LIFT — the whole of THE DASH, in one branch, and it is DESIGN-SYSTEM §4
         * answered with physics rather than a feature. Sonic is not "a fast character"; it is a
         * game where SPEED IS THE ROUTE. This city already had a high line (the roofs) and only a
         * slow way onto it (this crawl, 0.62 of run). So the fast line is the SAME geometry taken
         * at speed: arrive above VAULT_SPD and you convert horizontal momentum into height and go
         * OVER, arrive below it and you grind. Nothing is authored and no ramps are placed —
         * every box in the city is a vault by construction, the same 1:1 guarantee the generator
         * already makes about landing and climbing, and true only because the geometry and the
         * collision set are one thing.
         * ⚑ Losing speed is not a fail state, it DROPS YOU TO THE SLOW ROUTE. You lose time and
         *   never a thing you own — Sonic's own punishment, and the studio's anti-casino line. */
        const approach = Math.hypot(me.vx, me.vz);
        if (approach >= VAULT_SPD) {
          /* A vault TRADES speed for height and keeps most of it: 0.86 rather than 0.5, so
           * arriving fast still leaves you fast on the roof. ⚠ The lift is proportional to the
           * approach — a constant would make 12 m/s and 23 m/s climb identically and delete the
           * reason to go fast, which is the whole mechanic. */
          me.vy = Math.max(me.vy, approach * VAULT_LIFT);
          me.vx *= 0.86; me.vz *= 0.86;
          if (mantle(w, 5.5)) climbing = false;               // fly off the lip, still carrying it
          if (!me.vaulting) { me.vaulting = 1; if (dash) dash.countVault(); }
        } else {
          me.vaulting = 0;
          me.vy = (B.run || 9) * 0.62;
          me.vx *= 0.5; me.vz *= 0.5;
          if (mantle(w, 3.2)) climbing = false;               // crest it and step onto the roof
        }
      } else me.vaulting = 0;
    }

    if (!climbing) {
      const a = (onG ? B.accel || 40 : B.airAccel || 8) * dt;
      /* ⚑ STRAFE IS A SECOND WISH AXIS, NOT A SECOND MOVEMENT SYSTEM: the right vector of the same
       * heading, added to the same accumulator. An operative sidesteps out of a doorway; a bird
       * and a squirrel never ask for it and pass 0, so nothing else in the game changes. */
      const sx = IN.strafe || 0;
      const rx = hz, rz = -hx;                              // right = heading rotated -90°
      if (want > 0) { me.vx += hx * a; me.vz += hz * a; }
      else if (want < 0) { me.vx -= hx * a * 0.6; me.vz -= hz * a * 0.6; }
      if (sx) { me.vx += rx * a * sx * 0.85; me.vz += rz * a * sx * 0.85; }
      if (!want && !sx && onG) { const f = Math.max(0, 1 - (B.friction || 10) * dt); me.vx *= f; me.vz *= f; }
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
     *   is simply not in the way, which is why a kerb is a kerb and not a fence.
     * ⚑ IT LIVES IN `moveBody` NOW, because `js/city-ops.js`'s bots have to walk this city the same
     *   way the player does, and the comment three lines above says why: two copies drift, and the
     *   one that drifts is the one nobody is currently looking at. A bot that sinks through a kerb
     *   the player steps over is that bug with an audience. */
    moveBody(me, dt, B, climbing);
    me.beat = Math.max(0, me.beat - dt * 2.4);

    if (isOp()) {
      /* FIRST PERSON: the camera IS the head. No lag and no spring — a settling camera on a body
       * you are inside reads as motion sickness rather than as weight. */
      camPos.x = me.x; camPos.y = me.y + OP.eye - (me.crouchT || 0) * 0.55; camPos.z = me.z;
      cam.setPosition(-camPos.x, camPos.y, camPos.z);
      /* ⛔ PITCH IS AN ANGLE, AND THE CAMERA HAD BEEN READING IT AS A SLOPE. `y + pitch * 10` is
       * tan-like; `js/city-ops.js` fires along `(sin(yaw)cos(pitch), sin(pitch), cos(yaw)cos(pitch))`,
       * i.e. radians. They agree exactly at 0 and diverge with elevation — at 0.5 the view is
       * 26.6° and the round left at 28.6°. That is the reticle lying about where the shot goes,
       * which is the same defect class as the mirrored scene ("aim off" and "mouse inverted" were
       * one bug), and it is invisible until somebody shoots at something above them. */
      const cp = Math.cos(me.pitch);
      cam.lookAt(-(me.x + hx * 10 * cp),
                 me.y + OP.eye - (me.crouchT || 0) * 0.55 + Math.sin(me.pitch) * 10,
                 me.z + hz * 10 * cp);
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

  /* ── DRIVING. The car owns the physics; this owns where you and the camera are while it does.
   * ⚠ The body is parked AT THE SEAT rather than hidden, so everything that reads `me.x/y/z` —
   * the streamer, the drops, the bots' line of sight — keeps working with no special case for
   * "in a vehicle". One position, as everywhere else in this game. */
  function stepDrive(dt, IN) {
    const c = rides.driving;
    rides.step(dt, { x: me.x, z: me.z, mode: MODE === 'animal' ? CREATURE : MODE }, IN);
    me.x = c.x; me.y = c.y; me.z = c.z; me.yaw = c.yaw;
    me.vx = c.vx; me.vz = c.vz; me.vy = c.vy;
    me.speed = c.spd; me.onGround = c.onGround; me.alt = 0;
    showBody();                                   // whatever body you are stays out of sight
    /* the chase camera sits back and above and BANKS WITH THE CAR, which is most of why a slide
     * reads as a slide rather than as the road turning underneath you. */
    const hx = Math.sin(c.yaw), hz = Math.cos(c.yaw);
    const back = 7.4 + Math.min(4.5, c.spd * 0.16), up = 3.0 + Math.min(1.4, c.spd * 0.04);
    const tx = c.x - hx * back, tz = c.z - hz * back, ty = c.y + up;
    camPos.x += (tx - camPos.x) * Math.min(1, dt * 5.2);
    camPos.y += (ty - camPos.y) * Math.min(1, dt * 4.4);
    camPos.z += (tz - camPos.z) * Math.min(1, dt * 5.2);
    if (!isFinite(camPos.x) || !isFinite(camPos.y) || !isFinite(camPos.z)) {
      camPos.x = c.x - hx * 7.4; camPos.y = c.y + 3.0; camPos.z = c.z - hz * 7.4; camBad++;
    }
    cam.setPosition(-camPos.x, camPos.y, camPos.z);
    cam.lookAt(-(c.x + hx * 14), c.y + 1.2, c.z + hz * 14);
    const roll = -c.roll * 26;
    cam.setLocalEulerAngles(cam.getLocalEulerAngles().x, cam.getLocalEulerAngles().y,
                            cam.getLocalEulerAngles().z + roll);
  }

  /* ── THE JET'S STEP ─────────────────────────────────────────────────────────────────────────
   * Same integrator shape as the bird — forces and springs, nothing on a clock — but a completely
   * different animal: it cannot hover, it turns by BANKING rather than by yawing, and its heading
   * rate falls off with speed so a fast jet turns wide. That last one is DOGFIGHT's law, unit-free
   * and ported unchanged; every SPEED here is re-derived for a city measured in metres.
   * ⚠ `pull` only helps while BANKED. A wings-level jet holding W does not corner, which is what
   *   stops the aircraft handling like a car. */
  /* ⛔ THIS IS `flyShip` FROM `dogfight.html`, PORTED WHOLE — not paraphrased. Each block below is
   * that function's, in its order, with only the constants scaled (see JET above). Where its own
   * comments record a measured failure, the failure is real and the shape that avoids it is kept.
   * ⚠ `roll` is COMMANDED BY A STICK, not by a turn key: `rollIn` is left/right deflection and the
   *   heading follows the bank. That is the control scheme it asked for, and it is why the
   *   aircraft always lags its own input — which is the weight. */
  function stepJet(dt, pitchIn, rollIn, brake, boost) {
    const auth = clamp((me.spd - JET.stall) / (JET.vref - JET.stall), JET.authMin, 1);

    // ── roll: a spring-damper toward the commanded bank. Second order ON PURPOSE — a first-order
    //    lerp arrives asymptotically and can never overshoot, so a snap and a slow input feel the
    //    same. The overshoot is the snap.
    const want = clamp(rollIn, -1, 1) * JET.rollMax;
    me.rollV += ((want - me.roll) * JET.rollK * auth - me.rollV * JET.rollD) * dt;
    me.roll = clamp(me.roll + me.rollV * dt, -JET.rollLim, JET.rollLim);

    // ── pitch attitude. ⚠ NEGATIVE pitchIn is NOSE UP, as in DOGFIGHT: `vs = -sin(pitch)·spd`.
    const wp = clamp(pitchIn, -1, 1) * JET.pitchMax;
    me.pitch += (wp - me.pitch) * Math.min(1, dt * JET.pitchK * (0.45 + 0.55 * auth));

    /* ── heading FROM the bank. ω ∝ sin(roll)/spd^0.6 rather than /spd: a true coordinated turn is
     *    ω = g·tanφ/V, which at boost speed would leave the aircraft barely able to steer. The 0.6
     *    keeps the shape of the trade — fast is wide — without making the afterburner a
     *    punishment. `pull` is the nose-up input: bank alone is the sustainable turn, bank + pull
     *    is the hard turn, and the difference between them is the whole fight. */
    const pull = 1 + JET.pull * Math.max(0, -clamp(pitchIn, -1, 1));
    me.yaw += JET.turnG * Math.sin(me.roll) * pull * auth / Math.pow(Math.max(20, me.spd), 0.6) * dt;

    const hx = Math.sin(me.yaw), hz = Math.cos(me.yaw);
    /* ⚑ THRUST LAPSES WITH HEIGHT and that is what stops the ceiling being a free perch. TRADE is
     * the reversible cost of CHANGING height; LAPSE is the standing cost of BEING high. Together
     * they make altitude a bank account you must eventually spend. */
    const rho = 1 - JET.lapse * clamp((me.y - JET.altMin) / (JET.ceil - JET.altMin), 0, 1);
    let thrust = (boost ? JET.boost : (brake ? JET.thrust * 0.12 : JET.thrust)) * rho;

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
    /* ⛔ AND THE BAND HAS TO BE DERIVED FROM THE TURN, NOT FIXED — the ported model made a fixed
     * 520 m obsolete the moment boost arrived. Turn radius is v/ω with ω = turnG·sin(rollMax)/v^0.6,
     * i.e. **radius grows as v^1.6**: 74 m at cruise but 310 m on the afterburner. Measured with
     * the old constant: straight at the corner under boost leaked to |x| 2,068 against ±1,920.
     * ⚠ Same lesson as the original edge work, one rung up — a boundary tuned by eye holds at the
     *   speed you happened to test, and the port changed the speed by 3×. Two radii of warning,
     *   floored so a slow jet still gets a sane band. */
    const turnR = Math.pow(Math.max(20, me.spd), 1.6) / (JET.turnG * Math.sin(JET.rollMax));
    const EDGE_R = clamp(2.2 * turnR, 420, 1100);
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
        /* ⚠ …AND IT NEEDS MARGIN OVER THAT MINIMUM. `v/d` is the rate that turns the velocity
         * vector in EXACTLY the distance remaining, i.e. the aircraft grazes the wall with nothing
         * to spare — and at a corner the true distance is shorter than the per-axis `d`, so the
         * exact answer leaks. Measured at boost with the bare v/d: |x| 2,065 against ±1,920. 1.8×
         * turns it inside the band with room, and the cap rises with it or the multiplier is a
         * multiplier of nothing. */
        const rate = clamp(1.8 * me.spd / Math.max(55, d), 0.3, 3.0);
        me.yaw += clamp(da * 2.5, -1, 1) * rate * dt;
        // and it BANKS into it, or the aircraft skids sideways like a mouse cursor
        me.roll += clamp(da * 2.5, -1, 1) * -Math.min(1, rate) * 1.5 * near * dt;
        me.roll = clamp(me.roll, -1.40, 1.40);
        const outward = hx * -(ex / L) + hz * -(ez / L);
        if (outward > 0) thrust -= JET.thrust * outward * near * 0.8;
      }
    }

    /* ── thrust vs drag. TERMINAL SPEED EMERGES FROM THE BALANCE instead of being clamped to a
     *    `maxSpd`, and that is where the coasting comes from: let off at 500 and you sail, you do
     *    not snap back. The clamp it replaces was the single most un-DOGFIGHT thing here. */
    const D = JET.drag * (brake ? JET.brakeDrag : 1);
    me.spd += (thrust - D * me.spd * me.spd) * dt;

    /* ── vertical. Climb rate is SPEED × attitude, so height is bought with energy by construction
     *    and a jet that has spent its energy simply cannot go up.
     * ⛔ THE LIFT COMPONENT IS `cos(roll)` WITH NO FLOOR UNDER IT. DOGFIGHT records measuring the
     *   old propped-up version: at a 66° bank it still passed 62% of the nose-up through as
     *   ascent, so a hard turn was a CLIMB — the opposite of what a hard turn is. Pulling in a
     *   bank points the lift vector sideways; that is the entire mechanism by which banking turns
     *   you, so the vertical share is cos(roll), full stop. At 66° that is 0.41 and at the 80°
     *   limit 0.17: you cannot climb inside a hard turn, which is what makes committing cost.
     * ⚑ AND IT SINKS — a wing on its side is not holding the aircraft up, so a hard turn descends.
     *   This is the only place in the model where something happens that you did not command, and
     *   that is exactly what "weight" means. */
    const cr = Math.max(0, Math.cos(clamp(me.roll, -1.5, 1.5)));
    let vs = -Math.sin(me.pitch) * me.spd * JET.climbEff * cr * auth
             - JET.sink * (1 - cr) * Math.min(1, me.spd / JET.vref);
    if (me.spd < JET.stall) vs -= (JET.stall - me.spd) * 1.35;   // the nose drops, like it or not

    me.vx = hx * me.spd; me.vz = hz * me.spd; me.vy = vs;
    let nx = me.x + me.vx * dt, nz = me.z + me.vz * dt;

    /* ⚠ A JET DOES NOT LAND HERE, AND IT MUST NOT SINK INTO THE STREET EITHER. Ground contact is a
     * CRASH, and crashes are step 2 of the compression (docs/CITY-GAME.md) — until then the floor
     * is a hard deck that pushes the nose up, which is honest about being unfinished rather than
     * pretending the aircraft is fine while it is inside a building. */
    const g = collide ? collide.groundBelow(nx, nz, me.y) : null;
    const deck = Math.max((g == null ? 0 : g) + 12, JET.altMin);
    const a0 = me.y, aWant = me.y + vs * dt;
    let ny = clamp(aWant, deck, JET.ceil);
    if (ny <= deck && vs < 0) me.pitch = Math.max(me.pitch, 0.12);
    if (ny >= JET.ceil && vs > 0) me.pitch = Math.min(me.pitch, -0.05);

    // energy exchange, billed against the CLAMPED altitude so grinding the ceiling is not charged
    me.spd -= (ny - a0) * JET.trade;
    /* ⚑ …BUT THE DECK IS NOT A FREE TURN, and a plain clamp made it one. With the sink above, a
     * hard bank on the floor wants to descend and cannot, dAlt comes out 0, and the turn costs
     * nothing at maximum thrust in the thickest air — the ceiling exploit upside down. The
     * asymmetry is PHYSICAL: a blocked CLIMB means the nose is up and you are flying level, one g,
     * nothing to pay for; a blocked SINK means the wing is banked hard and something is still
     * holding the aircraft up, and that something is induced drag. So the floor bills. */
    if (aWant < ny) me.spd -= (ny - aWant) * JET.trade * 0.55;
    // ── G-bleed. Squared in `pull`, so the hard turn costs disproportionately more than the flat one
    me.spd -= JET.bleed * Math.abs(Math.sin(me.roll)) * pull * pull * auth * dt;
    me.spd = Math.max(JET.stall * 0.55, me.spd);
    me.gLoad = 1 / Math.max(0.15, Math.cos(clamp(me.roll, -1.4, 1.4))) * pull;

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
    /* ⛔ A NaN CAMERA DRAWS NOTHING, AND NOTHING TELLS YOU. One undefined constant upstream is
     * enough (see the note on MODES), and the result is a full-screen clear colour that looks like
     * a world that failed to load rather than a view matrix that failed to compute. Snapping back
     * to the aircraft is not a fix for the arithmetic — it is a refusal to render a blank frame,
     * so the mistake shows up as a camera in the wrong place instead of as an empty sky. */
    if (!isFinite(camPos.x) || !isFinite(camPos.y) || !isFinite(camPos.z)) {
      camPos.x = me.x - hx * 15; camPos.y = me.y + 4.2; camPos.z = me.z - hz * 15;
      camBad++;
    }
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
    /* ⚠ ARRIVE ABOVE STALL, not at some remembered walking pace. The ported model has a real stall
     * below which the nose drops and authority collapses, so entering the jet at a squirrel's
     * 9 m/s would hand you an aircraft already falling out of the sky. */
    if (isJet()) { me.spd = Math.max(JET.vref, me.speed); me.y = Math.max(me.y, 90);
                   me.roll = me.rollV = me.pitch = 0; }
    else if (isOp()) { const g = collide ? collide.groundBelow(me.x, me.z, me.y + 4, OP.r, 400) : null;
                       me.y = (g == null ? 0 : g); me.vx = me.vy = me.vz = 0; me.pitch = 0;
                       me.onGround = true; }
    else if (CREATURE === 'squirrel') { const g = collide ? collide.groundBelow(me.x, me.z, me.y + 4, 0.26, 400) : null;
                       me.y = (g == null ? 0 : g); me.vx = me.vy = me.vz = 0; me.onGround = true; }
    else { me.vx = Math.sin(me.yaw) * 16; me.vz = Math.cos(me.yaw) * 16; me.vy = 0; }
    /* ⛔ HAND THE POINTER BACK ON THE WAY OUT. Only the operative reads the mouse; every other
     *   mode is a chase camera where a captured, invisible cursor is pure loss — the mode chips,
     *   the cabinet links and the arcade all become unclickable and the only escape is a key the
     *   player has no reason to guess. `syncLock` then shows or clears the prompt for the mode
     *   actually being entered, so the two can never disagree. */
    if (!isOp() && document.pointerLockElement === cv) { try { document.exitPointerLock(); } catch (e) {} }
    syncLock();
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
    /* ⚠ LEAVING THE MODE HAS TO LEAVE THE FIGHT. The reticle and the health bar are the two things
     * that would otherwise sit over a bird, and a HUD element that survives its own mode is the
     * same class of defect as the launch countdown that kept ticking under "THE PACK IS OPEN". */
    /* ⚑ THE MODE BAR IS DRIVEN FROM HERE, so the lit chip cannot disagree with the mode — it is
     * the same `syncHud` every other path already calls. A second place that decides which chip is
     * on is a second place that can be wrong. */
    for (const el of document.querySelectorAll('.mchip'))
      el.dataset.on = el.dataset.mode === MODE ? '1' : '';
    const c = $('combat'); if (c && !isOp()) { c.dataset.on = ''; hudCache = ''; }
    const r = $('reticle'); if (r) r.dataset.on = isOp() ? '1' : '';
    if (ops && !isOp()) ops.setTrigger(false);
  }

  /* ⚠ Wired here rather than in the page, so the buttons and TAB go through ONE `setMode`. */
  for (const el of document.querySelectorAll('.mchip'))
    el.addEventListener('click', e => { e.preventDefault(); setMode(el.dataset.mode); });

  addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); cycleMode(e.shiftKey ? -1 : 1); }
    else if (e.key.toLowerCase() === 'c' && MODE === 'animal') {
      setCreature(CREATURE === 'bird' ? 'squirrel' : 'bird'); }
  });

  app.on('update', dt => {
    step(Math.min(dt, 0.05));
    if (ready) streamAround(me.x, me.z);
  });

  /* ── THE DASH ────────────────────────────────────────────────────────────────────────────
   * ⚠ ON THE SAME TICK AS EVERYTHING ELSE, for the reason recorded above about the drops and the
   *   firefight: a headless run that drives `_step` must advance the world, not only the player.
   * ⚑ THE RUSH IS THE SPEEDOMETER, NOT A MOOD. Blur strength is a pure function of how fast the
   *   body is actually moving — it starts at cruise and reaches full at the sprint cap — so it can
   *   never say "fast" while you are walking. That is the difference between motion blur and a
   *   filter, and it is also why it is free when you stand still: at rest the shader takes an
   *   early-out and the pass is byte for byte the resting city. */
  function stepDash(dt) {
    if (!window.CityInk || !CityInk.rush) return;
    const fast = (MODE === 'animal' && CREATURE === 'squirrel');
    if (!fast) { CityInk.rush(0); return; }
    const sp = Math.hypot(me.vx || 0, me.vz || 0);
    const B = CREATURES.squirrel;
    const k = Math.max(0, Math.min(1, (sp - B.run * 0.75) / (B.sprint - B.run * 0.75)));
    /* ⚑ THE FOCUS IS WHERE YOU ARE GOING, and on a chase camera that is not screen centre: the
     * camera trails and looks slightly down, so the heading projects a little above middle. A
     * radial blur focused at 0.5,0.5 streaks the world past a point you are not running at, which
     * reads as a wobble rather than as speed. */
    CityInk.rush(k * 0.85, 0.5, 0.46);
    if (dash) {
      const ev = dash.step(dt, me);
      if (ev) onDashEvent(ev);
      syncDashHud();
    }
  }

  function onDashEvent(ev) {
    const el = document.getElementById('dashMsg');
    if (!el) return;
    if (ev.kind === 'gate') {
      el.textContent = 'GATE ' + ev.n + '/' + ev.of + '  ·  ' + ev.split.toFixed(2) + 's';
    } else {
      el.textContent = ev.improved
        ? '\u25c6 ' + ev.time.toFixed(2) + 's  ·  NEW BEST  ·  top ' + ev.topSpeed.toFixed(1) + ' m/s'
        : ev.time.toFixed(2) + 's  ·  best ' + (ev.best || 0).toFixed(2) + 's';
    }
  }

  function syncDashHud() {
    const el = document.getElementById('dashHud');
    if (!el || !dash) return;
    const h = dash.hud();
    if (!h.running && !h.done) { el.textContent = 'THE DASH \u00b7 RUN TO START'; return; }
    const d = h.next ? Math.round(Math.hypot(me.x - h.next.x, me.z - h.next.z)) : 0;
    el.textContent = h.t.toFixed(2) + 's  \u00b7  GATE ' + (h.gate + 1) + '/' + h.of +
      '  \u00b7  ' + d + 'm' + (h.best ? '  \u00b7  best ' + h.best.toFixed(2) + 's' : '');
  }

  /* Open the course when the page asks for it. ⚠ It does NOT force the creature: arriving as a
   * bird with a squirrel course laid under you is a legible state (you can see the gates from the
   * air, which is the bird's whole job), and silently swapping the player's body on a query
   * parameter is the kind of surprise this project has already recorded as a bug. */
  if (Q.has('dash') && window.CityDash) {
    dash = CityDash.create({ world: window.CityWorld,
                             seed: parseInt(Q.get('dash'), 10) || 3030 });
    /* ⚠ The readouts are `hidden` in the markup and only unhidden when a course actually exists —
     * an empty timer on a city nobody is racing is a HUD element that means nothing, and this
     * page has already been through one round of four things claiming the same altitude. */
    if (dash) ['dashHud', 'dashMsg'].forEach(id => {
      const el = document.getElementById(id); if (el) el.hidden = false;
    });
  }

  /* ⚠ The drops advance inside `step()` rather than on their own tick, or a headless run that
   * drives `_step` would move the player and freeze the world around them — the same trap as a
   * probe that measures this container's rAF instead of the game. */
  /* ⚑ THE FIREFIGHT ADVANCES ON THE SAME TICK AS EVERYTHING ELSE, for the reason recorded just
   * below about the drops: a headless run that drives `_step` must move the world, not only the
   * player. ⚠ AND IT RUNS IN EVERY MODE. A bot mid-reload when you swap to the bird would
   * otherwise be frozen mid-reload when you swap back — and more importantly the bots have to be
   * able to STOP: `step` reads `targetable` off the player, so switching to an animal is what
   * makes them lose you, and that only happens if they are still thinking. */
  /* ⛔ THE DASH ADVANCES INSIDE `step()`, NOT ON THE UPDATE HANDLER — and the first cut of this
   * got it wrong in exactly the way this file already warns about two comments below. `_step(n)`
   * is what every headless probe drives, and it calls `step()` directly; a system hung off
   * `app.on('update')` is therefore FROZEN for the entire measurement while the player moves
   * normally around it. The clock would have read 0.00 s after a four-second sprint and it would
   * have looked like a broken timer rather than a probe that never ticked it. */
  function stepOps(dt) {
    /* \u26a0 The cars tick even when you are on foot, or none would ever be parked near you — the
     * population lives in the same step as the operatives' for the same reason. */
    if (rides && !rides.driving) rides.step(dt, { x: me.x, z: me.z,
      mode: MODE === 'animal' ? CREATURE : MODE }, null);
    syncRideHud();
    if (!ops) return;
    ops.step(dt, { x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch,
                   mode: MODE, armed: MODES[MODE].armed, targetable: MODES[MODE].targetable,
                   driving: !!(rides && rides.driving),
                   onGround: me.onGround, speed: me.speed });
    if (isOp()) syncCombatHud();
  }

  /* ⚠ A HUD THAT ONLY UPDATES WHEN IT CHANGES IS A HUD THAT LIES AFTER A MODE SWAP. This is
   * written every frame in operative mode and CLEARED by `syncHud` on the way out, rather than
   * left showing the health you had when you stopped being mortal. */
  let hudCache = '';
  function syncCombatHud() {
    const el = $('combat'); if (!el || !ops) return;
    const h = ops.hud;
    const bar = n => { const k = Math.round(clamp(n, 0, 1) * 10);
      return '█'.repeat(k) + '·'.repeat(10 - k); };
    const s = h.alive
      ? ('HP ' + bar(h.hp / h.maxHp) + ' ' + h.hp + (h.armor > 0 ? '  ▣ ' + h.armor : '') +
         '\n' + h.weapon + '  ' + (h.reloading ? 'RELOADING' : h.mag + '/' + h.magSize) +
         '   ◈ ' + h.bots + '   ' + h.kills + '–' + h.deaths)
      : ('DOWN — back up in ' + h.down + 's\n' + h.kills + '–' + h.deaths);
    if (s !== hudCache) { hudCache = s; el.textContent = s; }
    el.dataset.on = '1';
    el.dataset.hurt = h.hp / h.maxHp < 0.34 ? '1' : '';
  }

  /* ⚠ A PROMPT YOU ONLY SEE WHEN IT APPLIES. A permanent "E to drive" is furniture; one that
   * appears when a car is actually in reach is information. The same element carries the speedo
   * while driving, because the two are never both true. */
  function syncRideHud() {
    const el = $('ride'); if (!el) return;
    if (!rides) { el.dataset.on = ''; return; }
    if (rides.driving) { const h = rides.hud;
      el.textContent = h.kph + ' KM/H   \u00b7   E to get out   \u00b7   SPACE handbrake';
      el.dataset.on = '1'; return; }
    const near = (MODE !== 'jet' && !isBird()) ? rides.near(me.x, me.z) : null;
    el.textContent = near ? 'E \u2014 drive' : '';
    el.dataset.on = near ? '1' : '';
  }

  function stepDrops(dt) {
    if (!drops) return;
    if (dropSay > 0) dropSay -= dt;      // the report fades; the pouch count under it does not
    /* ⚠ carryY 0.30 put the card INSIDE the squirrel — the body is ~0.19 deep and the card is
     * 0.48 tall, so it needs to clear the back or the whole point (that you can SEE who has it)
     * is lost. Held high, like a squirrel with something in its mouth. */
    drops.step(dt, { x: me.x, y: me.y, z: me.z, yaw: me.yaw,
                     mode: MODE === 'animal' ? CREATURE : MODE, carryY: 0.48 });
    /* ⛔ THE PRESS HAS TO REPORT SOMETHING, ALWAYS. Half the "cannot drop power ups" report was
     *   silence: a squirrel with empty hands and a bird with an empty pouch both did exactly
     *   nothing, and the bird's successful drop goes BACKWARD and DOWN — behind the chase camera,
     *   where you cannot see it either. So the only three states a player can be in are printed:
     *   what you are carrying, how full the pouch is, and — for a moment — that the last press
     *   found nothing to drop. */
    const el = $('carry');
    if (el) { const c = drops.counts;
      let txt = '';
      if (c.carried) txt = 'CARRYING ' + c.carried;
      else if (CREATURE === 'bird' && MODE === 'animal') txt = 'POUCH ' + c.pouch + '/' + c.pouchMax;
      if (dropSay > 0) txt = dropMsg;
      el.textContent = txt;
      el.dataset.on = txt ? '1' : ''; }
  }

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
  /* ⚠ AND AT BOOT, because the mode is restored from localStorage — reload while in SECTION 9
   *   and `setMode` never runs, so the prompt would never be shown on the one entry path where
   *   the player has not touched anything yet. */
  syncLock();
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
    /* the horizon tier, exposed for the same reason `near` is: a flicker report can only be
     * diagnosed by turning one tier off and measuring the other. */
    get __far() { return far; },
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
        /* ⛔ THE ONE NUMBER THAT WOULD HAVE CAUGHT THE EMPTY DOGFIGHT SKY. Everything else in this
         * object comes from the physics, which was perfectly healthy while the view matrix was
         * NaN — so every measurement passed and the game rendered nothing. `camBad > 0` means a
         * frame was drawn from a camera that had to be rescued; it must be 0. */
        camBad, cam: [+camPos.x.toFixed(1), +camPos.y.toFixed(1), +camPos.z.toFixed(1)],
        /* ⚑ THE ASSERTION THAT BITES on the silent-material bug: which material classes the world
         * actually built. Two classes across a whole city means the box translation is broken
         * again and everything is one colour, with nothing else to tell you so. */
        classes: [...cls].sort(), byClass: byClass };
    },
    setMode, setCreature, cycleMode, get mode() { return MODE; },
    get drops() { return drops; }, _act() { return doAction(); },
    /* ⛔ THE FIREFIGHT, EXPOSED SO THE OBSERVER RULE IS A MEASUREMENT. `ops.targets(player)` is the
     * only place a target list is built, so a driver can put a bird next to four operatives and
     * assert it never appears in one — which is the difference between an ethos and a comment. */
    get ops() { return ops; },
    get rides() { return rides; },
    _fire() { return ops ? ops.fire({ x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch,
      mode: MODE, armed: MODES[MODE].armed, targetable: MODES[MODE].targetable }) : false; },
    _targets() { return ops ? ops.targets({ x: me.x, y: me.y, z: me.z,
      targetable: MODES[MODE].targetable }) : []; },
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
    /* ⚑ THE COLLIDER ITSELF, so a harness can ask the world the same questions the physics asks
     * rather than inferring them from where a body ended up. Reasoning backwards from a frozen
     * position cost several rounds on the squirrel's ledge; `hits`/`groundBelow`/`wallAt` answer
     * in one call each. */
    get _collide() { return collide; },
    get _me() { return me; },
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

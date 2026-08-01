/* ripmaster3030studios — DOGFIGHT on the PlayCanvas engine: the driver (window.DFPC).
 *
 * `dogfight.html` owns the rules, the flight model, the wager and the HUD, and knows no engine.
 * This file owns the engine and knows no rules: it builds the scene, points the camera, hangs the
 * craft off the simulation's ships and runs the post stack. The seam is exactly the one the
 * hand-rolled renderer already had —
 *
 *     DFPC.init(canvas, opt)              → true if the engine path is live
 *     DFPC.start(onUpdate)                PlayCanvas owns the loop; onUpdate(dt) is your frame
 *     DFPC.sync(G, cam, world, o)         push one frame of simulation state into the scene
 *     DFPC.project(x, alt, y)             world → overlay pixels, for nameplates and the lead pip
 *     DFPC.basis(h)                       headless handedness check (see below)
 *
 * — the flight model stays in dogfight.html and this file only reads it. ⚠ Its numbers have MOVED
 * since the port: altitude now lapses thrust and a banked wing sinks, so cruise is 8.99 on the
 * deck and 6.71 at the ceiling rather than a single 9.00, and boost peaks at 21.6 for the ~2.5 s
 * the gauge lasts. See the FLY block in dogfight.html; do not re-quote the old set.
 *
 * ⚑ HANDEDNESS — AND THE ANSWER IS NOT SECTION 9'S ANSWER. Section 9's PlayCanvas port shipped a
 *   mirrored scene that produced three separate bug reports ("mouse inverted", "strafe backwards",
 *   "aim off"), because its basis (x right, y up, z FORWARD) is left-handed against a PlayCanvas
 *   camera's (x right, y up, −z forward), and it needed a SCALE of (−1,1,1) to fix. Dogfight was
 *   checked for the same defect first, numerically, at five headings, using the shipping
 *   renderer's own matrices:
 *
 *       h      game fwd → camera            game right → camera
 *         0°   (1,0,0)     → (0,0,-1) ✓     (0,0,1)      → (1,0,0) ✓
 *        45°   (.707,0,.707)→(0,0,-1) ✓     (-.707,0,.707)→(1,0,0) ✓
 *        90°   (0,0,1)     → (0,0,-1) ✓     (-1,0,0)     → (1,0,0) ✓
 *       135°   (-.707,0,.707)→(0,0,-1) ✓    (-.707,0,-.707)→(1,0,0) ✓
 *       200°   (-.940,0,-.342)→(0,0,-1) ✓   (.342,0,-.940)→(1,0,0) ✓
 *
 *   A PURE ROTATION maps forward AND right correctly at every heading, which it could not do if
 *   the handedness disagreed — a rotation preserves handedness, which is the whole reason Section
 *   9 needed a scale. Checked directly too: the game's right × up = −forward, and a GL camera's
 *   right × up = −forward. SAME handedness. The difference is that dogfight's second horizontal
 *   axis is `y` and its screen-right at heading 0 is +y (which lands on GL +Z), whereas Section
 *   9's screen-right is +x. So there is NO worldMirror here, and adding one "to be consistent
 *   with section9" would have introduced the very bug it was copied to avoid.
 *
 *   The one formula, used by the camera AND by every craft: yaw θ = −(gameHeading + π/2). An
 *   entity's forward is its −Z, and −Z under Ry(θ) is (−sin θ, 0, −cos θ) = (cos h, 0, sin h),
 *   which is the game's own `fwd = dx·cos h + dy·sin h`. `DFPC.basis(h)` returns the engine's
 *   ACTUAL forward/right against the game's at any heading so this stays checkable, not asserted.
 *
 * ⛔ AND THE PITCH IN THE OLD RENDERER WAS INVERTED. `cam.ph` tracks `me.pitchIn`, and pitchIn > 0
 *   is ArrowDown (`s.alt -= pitch*2.4*dt`), i.e. DESCENDING. The 2D renderer does
 *   `HORIZON = H*0.46 − ph*H*0.10`, so at ph > 0 the horizon rises up the screen — you look DOWN.
 *   The GL view matrix composes `Rx(-ph)`, whose camera-space inverse gives a world forward of
 *   (cos h·cos ph, +sin ph, sin h·cos ph): at ph = +0.8 that is y = +0.717, i.e. looking UP by
 *   45.8°. Dive and the camera tilted skyward, by up to ±57° at full deflection. Same family as
 *   Section 9's mirror — a sign that is invisible dead-level and wrong the moment you move.
 *   Here the pitch is NEGATED, and `DFPC.basis` reports it so it cannot silently come back.
 */
window.DFPC = (function () {
  /* ⚠ THE STUB COMES FIRST. Several module-scope constants below are `new pc.Quat()`, so if the
   * engine bundle did not load this whole file throws while parsing and `window.DFPC` never
   * exists. The no-WebGL-2 route still worked — dogfight.html guards with `window.DFPC ?` — but it
   * worked while logging "pc is not defined", which is exactly the kind of error that trains you
   * to ignore the console. Fail open QUIETLY and say why. */
  if (typeof pc === 'undefined' || !pc) {
    return { init: () => false, supported: () => false, why: () => 'the engine bundle did not load',
             start: () => {}, sync: () => false, project: () => null, basis: () => null,
             pitchProbe: () => null, resize: () => {}, stats: () => ({ ok: false, why: 'no engine' }),
             app: () => null, camera: () => null, tier: () => 'none', setQuality: () => {} };
  }
  const DEG = 180 / Math.PI;
  const Q = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
  const num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  const flag = (k, d) => (Q.has(k) ? Q.get(k) !== '0' : d);

  let app = null, cam = null, rig = null, sun = null, world = null, fx = null;
  let ok = false, frame = null, ditherOn = false;
  let ships = new Map(), craftProto = null, podProto = null, trimProto = null;
  let TIER = 'high', QCFG = null, why = '';
  const marks = { boot: 0, first: 0 };
  const times = [];

  /* ── quality tiers ──────────────────────────────────────────────────────────────────────
   * ONE definition of "weak device" for the whole site: GfxPost.dprCap(). It already folds in
   * touch + small screen + low cores/memory + save-data, and every shipping WebGL game here uses
   * it as its resolution cap. A second opinion about what a weak device is is how two games drift
   * apart. */
  const TIERS = {
    /* ⚑ DITHER IS ON AT EVERY TIER, including low, and that is a deliberate exception to "low tier
     * turns things off". It is ONE add inside a fullscreen pass that is already running, and this
     * game is mostly sky — a big smooth gradient is exactly where an 8-bit write bands, and a weak
     * device gets a SMALLER environment cubemap (64 vs 128), so it bands WORSE. Measured by
     * screenshot: at tier low the sky came out in visible horizontal steps. Turning the cheapest
     * fix off on the device that needs it most is the wrong saving. */
    high: { shadowRes: 2048, cascades: 3, shadows: true, ssao: true, ssaoSamples: 8, dither: true,
            envSize: 128, atlas: 256, rtScale: 1.0 },
    mid:  { shadowRes: 1024, cascades: 2, shadows: true, ssao: false, ssaoSamples: 4, dither: true,
            envSize: 96, atlas: 128, rtScale: 0.85 },
    low:  { shadowRes: 512, cascades: 1, shadows: false, ssao: false, ssaoSamples: 4, dither: true,
            envSize: 64, atlas: 128, rtScale: 0.7 },
  };

  /* ── POST: GfxPost's calibration, ported rather than defaulted ──────────────────────────
   * `js/gfx-post.js` carries numbers that were MEASURED against pixel counts, and an engine
   * replaces the FUNCTION, not the TUNING. Dogfight is handed `PRESET.neon` with `blur: 0.45`:
   *
   *   intensity 1.15  bloom amount        → bloom.intensity, RE-MEASURED (below); the two are not
   *                                         the same quantity — GfxPost's is an additive multiplier
   *                                         over its own bright pass at threshold 0.62, PlayCanvas's
   *                                         is a mip-chain mix
   *   threshold 0.62  bright-pass knee    → PlayCanvas has no threshold; its bloom is a mip chain
   *   knee      0.92  HIGHLIGHT ROLLOFF   → rendering.toneMapping. THE PORT OF "knee" IS "the
   *                                         tonemapper must be a rolloff curve, never LINEAR/NONE".
   *                                         GfxPost is an LDR chain, so bloom pushes pixels past
   *                                         1.0 and the GPU clips them flat white; PlayCanvas
   *                                         renders HDR and tone-maps AFTER bloom, so the
   *                                         tonemapper IS the rolloff, done in the right space.
   *   ca        0.0022 chromatic aberration → fringing 4.51, DERIVED: GfxPost samples at
   *                                         uv + (uv−0.5)·ca, i.e. 0.0022 × 0.5 = 1.1e-3 uv at the
   *                                         corner; PlayCanvas's applyFringing is (I/1024)·d²,
   *                                         which at the corner is I/4096 per axis. Equal at
   *                                         I = 4096 × 1.1e-3 = 4.51.
   *   vignette  0.36                      → {inner 0.68, outer 2.24, curvature 1}, DERIVED:
   *                                         GfxPost is 1 − 0.36·smoothstep(0.34, 1.12, r) with
   *                                         r = |uv−0.5|; PlayCanvas is 1 − I·smoothstep(inner,
   *                                         outer, edge) with edge = 2r at curvature 1, so
   *                                         inner = 0.68, outer = 2.24 at the same intensity.
   *   sat       1.00                      → grading.saturation. RAISED here on purpose, see below.
   *   dither    0.0045 8×8 Bayer          → injected as a composeMainEndPS chunk
   *   sharpen   0.18  unsharp             → rendering.sharpness. ⚠ NOT DERIVED AND NOT MEASURED
   *                                         HERE: GfxPost does a plain unsharp against four
   *                                         neighbours, PlayCanvas runs AMD CAS, which is
   *                                         contrast-adaptive and whose `sharpness` maps to
   *                                         lerp(−0.125, −0.2, s). Different function, so the
   *                                         numbers below are carried over from s9pc-app.js, where
   *                                         they WERE swept against mean |Laplacian| (0 → 5.58 ·
   *                                         0.42 → 7.06 · 0.70 → 7.57 · 1.0 → 8.76, and 1.0 also
   *                                         jumps RMS, i.e. a different effect appearing). Sweeping
   *                                         it again on this game's own frames is outstanding.
   *   blur      0.45  motion smear CEILING→ NOT PORTED. PlayCanvas's CameraFrame has no feedback
   *                                         pass to hang it on. Recorded as a known regression
   *                                         rather than quietly dropped; it is the one thing the
   *                                         classic build still does that this one does not.
   *
   * ⚑ GRIT IS OFF BY DEFAULT, and that is the artist's direction rather than a preference. Against
   *   a bright stylised look every high-frequency effect works backwards: chromatic aberration and
   *   grain ADD the noise the style needs removed, unsharp then sharpens that noise, and a heavy
   *   vignette darkens exactly the screen edges a dogfight needs to see. `?grit=1` restores them.
   *   Saturation goes UP because a flat-albedo world has no texture detail to carry interest —
   *   colour is doing all of it. Same call `js/s9pc-app.js` makes, same reasoning.
   */
  const GRIT = Q.get('grit') === '1';
  const POST = {
    bloom: num('bloom', GRIT ? 0.030 : 0.026),
    tone: null,                                       // set at init: pc.TONEMAP_ACES
    fringing: GRIT ? 4.51 : 0,
    vignette: GRIT ? { inner: 0.68, outer: 2.24, curvature: 1.0, intensity: 0.36 }
                   : { inner: 0.94, outer: 3.3, curvature: 1.0, intensity: 0.09 },
    saturation: GRIT ? 1.00 : 1.22,
    contrast: 1.0,                                    // ⚠ PlayCanvas grades in LINEAR, BEFORE the
                                                      // tonemapper, so a >1 "contrast" copied from
                                                      // any LDR chain black-crushes the frame.
                                                      // Contrast here is bought with exposure and
                                                      // light placement.
    sharpness: num('sharp', GRIT ? 0.62 : 0.34),
    dither: num('dither', 0.0030),
    grain: num('grain', GRIT ? 0.014 : 0),
  };

  /* ── dither + grain, injected ───────────────────────────────────────────────────────────
   * PlayCanvas's compose pass has neither, and GfxPost's 8×8 Bayer is not decoration: it is what
   * kills the banding an 8-bit write leaves in a big smooth gradient — and this game is ALL big
   * smooth gradient, because the sky fills most of the frame. `composeMainEndPS` runs after the
   * vignette and BEFORE gammaCorrectOutput, so the value there is still linear; dithering it
   * directly would put the noise in the wrong space, hence the round trip through an approximate
   * display curve (two pow() in one fullscreen pass). */
  const DITHER_CHUNK = [
    'float df_h(vec2 p){ return fract(sin(dot(p, vec2(41.0, 289.0))) * 43758.5453); }',
    'float df_bayer(vec2 p){ vec2 t = floor(mod(p, 8.0)); float b = 0.0, s = 1.0;',
    '  for (int i = 0; i < 3; i++) { vec2 f = floor(mod(t, 2.0)); b += s * (f.x + 2.0 * mod(f.x + f.y, 2.0)); s *= 4.0; t = floor(t * 0.5); }',
    '  return b / 64.0; }',
    'uniform float dfDither; uniform float dfGrain; uniform float dfGrainT;',
  ].join('\n');
  const DITHER_MAIN = [
    '{ vec3 d0 = pow(max(result, vec3(0.0)), vec3(1.0 / 2.2));',
    '  d0 += (df_bayer(gl_FragCoord.xy) - 0.5) * dfDither;',
    '  d0 += (df_h(uv * vec2(1023.0, 791.0) + dfGrainT) - 0.5) * dfGrain;',
    '  result = pow(max(d0, vec3(0.0)), vec3(2.2)); }',
  ].join('\n');

  // ── init ────────────────────────────────────────────────────────────────────────────────
  let T_BOOT = 0;
  function init(cv, opt) {
    opt = opt || {};
    const T0 = T_BOOT = performance.now();
    try {
      if (!window.pc) { why = 'the engine bundle did not load'; return false; }
      const probe = document.createElement('canvas');
      if (!probe.getContext('webgl2')) { why = 'this browser reports no WebGL 2 context'; return false; }

      const DPRCAP = (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2;
      const AUTO = DPRCAP >= 2 ? 'high' : (DPRCAP >= 1.5 ? 'mid' : 'low');
      TIER = Q.get('q') || (() => { try { return localStorage.getItem('dfpc_q'); } catch (e) { return null; } })() || AUTO;
      if (['low', 'mid', 'high'].indexOf(TIER) < 0) TIER = AUTO;
      QCFG = TIERS[TIER];
      POST.tone = pc.TONEMAP_ACES;

      app = new pc.Application(cv, {
        graphicsDeviceOptions: { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance',
          /* ?grab=1 keeps the drawing buffer so a headless run can readPixels the REAL pixels.
           * CLAUDE.md: this container's screenshot path rotates hue on canvas content, so colour
           * has to be judged from a readback — and a WebGL canvas without this reads back BLACK.
           * The shipping renderer's first "after" measurement came out luma 0 / blacks 100% on a
           * frame that was rendering perfectly, which is exactly that trap. */
          preserveDrawingBuffer: flag('grab', false) },
      });
      window.__dfpcapp = app;
      app.setCanvasFillMode(pc.FILLMODE_NONE);
      app.setCanvasResolution(pc.RESOLUTION_AUTO);
      app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, DPRCAP);

      /* ── camera rig ────────────────────────────────────────────────────────────────────
       * ⚠ THE CHASE PULL-BACK MUST BE APPLIED IN CAMERA SPACE, after the rotation. Doing it in
       * world space looks correct dead ahead and drifts wrong the moment you turn — CLAUDE.md
       * records that trap against the old renderer's hand-written view matrix, where it had to be
       * got right by matrix ordering. Under a scene graph it cannot be got wrong: the rig carries
       * the position and orientation, the camera is its CHILD at local +Z (a camera looks down
       * −Z, so +Z is behind it), and "behind, in the craft's own frame" is what a child offset
       * means by construction. */
      rig = new pc.Entity('rig');
      cam = new pc.Entity('cam');
      const FOV = opt.fov || 1.05;                    // radians, vertical — the old renderer's own
      cam.addComponent('camera', { fov: FOV * DEG, nearClip: 0.1, farClip: (opt.VIEW_FAR || 34) * 1.9,
        clearColor: new pc.Color(0.02, 0.02, 0.03), toneMapping: POST.tone });
      rig.addChild(cam);
      app.root.addChild(rig);

      /* ── key light ─────────────────────────────────────────────────────────────────────
       * One hard sun plus a sky-coloured hemisphere fill from the IBL. The sun is what makes a
       * silhouette crisp — a hull lit from one side has a lit face and a shadow face, and that
       * edge IS the silhouette. Shadow bias is normal-offset-led for the same reason s9pc records:
       * raising depth bias alone peels contact shadows off their objects. */
      sun = new pc.Entity('sun');
      /* ⚑ SUN INTENSITY WAS SWEPT, not chosen. The deck albedo is deliberately bright (that is the
       * whole silhouette mechanism) so the sun does not also have to be — and the SKY does not
       * scale with the sun at all, so a dimmer sun widens the value gap between an object and the
       * field it is read against, which IS the silhouette. Measured on a held ghost-nebula frame,
       * 960×600 (luma / RMS contrast / saturation / mean |Laplacian|):
       *     1.4  →  115.2 · 36.2 · 59.7% · 5.17     ← chosen
       *     2.0  →  126.4 · 29.5 · 55.4% · 6.41
       *     2.6  →  134.0 · 29.3 · 52.0% · 6.97
       * Brighter buys luma and local detail and SPENDS contrast and chroma, which is the same
       * shape of trade CLAUDE.md records for the GfxPost highlight knee: the darker option is not
       * automatically safer, but here it is the one that serves the brief. 1.4 is still 2.25× the
       * mean luma of the build it replaces, so "bright" is not at risk. */
      sun.addComponent('light', { type: 'directional', color: new pc.Color(1, 1, 1), intensity: num('sun', 1.4),
        castShadows: QCFG.shadows && flag('shadows', true), shadowType: pc.SHADOW_PCF3,
        numCascades: QCFG.cascades, cascadeDistribution: 0.5, shadowDistance: (opt.VIEW_FAR || 34) * 1.2,
        shadowResolution: QCFG.shadowRes, shadowBias: num('sbias', 0.02), normalOffsetBias: num('nbias', 0.06),
        shadowIntensity: num('sint', 0.72) });
      app.root.addChild(sun);

      app.scene.fog.type = pc.FOG_LINEAR;
      /* ⚑ EXPOSURE. High-key is not "turn everything up": ACES desaturates as it compresses
       * toward white, so an over-exposed bright palette comes back PALE, which is the failure
       * s9pc's MATS_DAY note records the expensive way. 1.0 keeps the saturated fields saturated
       * and leaves the tonemapper working on genuine highlights only. */
      app.scene.exposure = num('exposure', 1.0);
      app.scene.skyboxIntensity = 1.0;

      world = DFPCWorld.create(app, { envSize: QCFG.envSize, atlas: QCFG.atlas, VIEW_FAR: opt.VIEW_FAR || 34 });
      fx = window.DFPCFx ? DFPCFx.create(app, {}) : null;

      buildPost();
      loadArt(opt.art);
      ok = true;
      marks.boot = +(performance.now() - T0).toFixed(1);
      return true;
    } catch (e) {
      why = 'engine init threw: ' + (e && e.message);
      ok = false; app = null;
      return false;
    }
  }

  function buildPost() {
    if (!flag('post', true)) return;
    try {
      frame = new pc.CameraFrame(app, cam.camera);
      frame.rendering.samples = 1;                    // TAA/MSAA off: both cost more than they buy
      /* The biggest single mobile lever and it is one number. GfxPost.dprCap() already caps the
       * BACKING STORE; this scales the SCENE target inside it, so the 3D render and every
       * fullscreen post pass get cheaper while the HUD, the radar and the reticle stay at full
       * resolution on the 2D overlay above. That split is the point — text going soft is what
       * makes a resolution drop feel like a broken build rather than a quality setting. */
      frame.rendering.renderTargetScale = QCFG.rtScale;
      frame.rendering.toneMapping = POST.tone;
      frame.rendering.sharpness = POST.sharpness;
      frame.bloom.intensity = POST.bloom;
      frame.bloom.blurLevel = 12;
      frame.ssao.type = (QCFG.ssao && flag('ssao', true)) ? pc.SSAOTYPE_LIGHTING : pc.SSAOTYPE_NONE;
      frame.ssao.intensity = 0.4; frame.ssao.radius = 2.0; frame.ssao.samples = QCFG.ssaoSamples;
      frame.ssao.power = 3.0; frame.ssao.minAngle = 12; frame.ssao.blurEnabled = true;
      frame.vignette.inner = POST.vignette.inner; frame.vignette.outer = POST.vignette.outer;
      frame.vignette.curvature = POST.vignette.curvature; frame.vignette.intensity = POST.vignette.intensity;
      frame.grading.enabled = true;
      frame.grading.saturation = POST.saturation; frame.grading.contrast = POST.contrast; frame.grading.brightness = 1.0;
      frame.fringing.intensity = POST.fringing;
      frame.update();
    } catch (e) { frame = null; console.warn('[dfpc] post stack failed:', e && e.message); }
    if (!QCFG.dither || !(POST.dither > 0 || POST.grain > 0)) return;
    try {
      const chunks = pc.ShaderChunks.get(app.graphicsDevice, pc.SHADERLANGUAGE_GLSL);
      chunks.set('composeDeclarationsPS', DITHER_CHUNK);
      chunks.set('composeMainEndPS', DITHER_MAIN);
      const sc = app.graphicsDevice.scope;
      sc.resolve('dfDither').setValue(POST.dither);
      sc.resolve('dfGrain').setValue(POST.grain);
      sc.resolve('dfGrainT').setValue(0);
      ditherOn = true;
    } catch (e) { ditherOn = false; console.warn('[dfpc] dither chunk not installed:', e && e.message); }
  }

  /* ── the authored geometry ──────────────────────────────────────────────────────────────
   * `models/dogfight.glb` (built by `npm run craft` from scripts/blender/build-craft.py) carries
   * craft · pod · gate · prop_{pylon,ring,spire,tower,crystal}, loaded by NAME. Fits are computed
   * from MEASURED bounds exactly as the old renderer computes them, so a replacement model still
   * drops in without retuning a constant:
   *   craft/pod  longest axis → CRAFT   (pod shares the CRAFT fit: the exhausts are authored
   *                                      bolted to the tail, and fitting the pod to its own
   *                                      bounds would centre it and hang the glow off the nose)
   *   gate       horizontal radius → 1.4, which is the pass-through radius the game tests
   *   props      height → 1, origin on the BASE, so `alt` lifts a prop off the deck by the amount
   *              the game means rather than by half a prop
   * Fails open at every step: the fetch is async and can fail, and until/unless it lands the
   * procedural shapes fly. */
  const CRAFT = 0.9, GATE_R = 1.4;
  let artState = 'pending';
  /* ⛔ THE CRAFT FLEW 90° ACROSS ITS OWN FLIGHT PATH, AND THIS IS WHY. A glTF node carries a
   * transform, and Blender's exporter writes the craft's nose alignment as exactly that — a −90°
   * node rotation about Y (verified on the shipping file: `craft` and `pod` both read
   * lrEuler [0,−90,0], while their VERTEX data still has the nose on +X where build-craft.py
   * authored it). The old code did
   *
   *     inst.forEach(e => { … parts[e.name] = e.render.meshInstances[0].mesh; })
   *
   * which takes the MESH and throws the NODE away, so the nose stayed on the mesh's +X, the 180°
   * `flip` turned that into −X, and yaw −(h+90°) put it on world −Z: the aircraft rendered
   * broadside, tail to the right of frame, exactly the "stuck flying in one direction" signature
   * CLAUDE.md records against the classic renderer's camera yaw. Same family of defect, different
   * transform. `js/ronin-glb.js` — the CLASSIC build's loader — walks the scene graph and applies
   * `nodeMatrix`, which is why `dogfight-classic.html` was right the whole time and this was not.
   * A port regression, not a modelling error.
   *
   * ⚑ THE FIX MEASURES AND PLACES IN THE SAME FRAME. `meshInstance.aabb` is already the
   * NODE-TRANSFORMED bound (checked: craft centre [0,0.86,0.94] half [4.13,1.48,5.26] — that is
   * the tail at −4.32 and the nose at +6.20 on Z, i.e. post-rotation), so the fit is computed
   * where the part actually is, and the same node rotation is then put back on the entity that
   * draws it. Fits stay MEASURED, so a replacement model still drops in without retuning — and
   * now it drops in whether its authoring tool bakes the orientation into vertices or leaves it
   * on the node, which is the property that was silently missing.
   *
   * One placement formula for every part, derived once:
   *     worldOf(part) = T(off) · R(A·q) · S(s·sc) · mesh
   *   with q,t,sc the part's own node transform, `s` the fit scale, `A` an extra canonical
   *   rotation (identity except for the gate) and `anchor` the point of the measured bound that
   *   must land on the origin. Working through it (uniform scale commutes past rotation):
   *     off = s · A · (t − anchor),  rotation = A·q,  scale = s·sc
   */
  const _q0 = new pc.Quat(), _v0 = new pc.Vec3(), _v1 = new pc.Vec3();
  const _mA = new pc.Mat4(), _mB = new pc.Mat4();
  /** snapshot a part: mesh + its node transform + its node-space bound, all relative to `inst` */
  function readPart(e, inst) {
    const mi = e.render.meshInstances[0];
    _mA.copy(inst.getWorldTransform()).invert();
    const m = _mB.mul2(_mA, e.getWorldTransform());
    const q = new pc.Quat().setFromMat4(m);
    const t = m.getTranslation(new pc.Vec3());
    const sc = m.getScale(new pc.Vec3());
    const ab = mi.aabb;                                               // ALREADY node-transformed
    const c = ab.center, h = ab.halfExtents;
    return { mesh: mi.mesh, q, t, sc,
      lo: [c.x - h.x, c.y - h.y, c.z - h.z], hi: [c.x + h.x, c.y + h.y, c.z + h.z],
      ext: [h.x * 2, h.y * 2, h.z * 2] };
  }
  /** place: entity ← the one formula above. `A` may be null (identity). */
  function fitPart(ent, part, s, anchor, A) {
    _v0.set(part.t.x - anchor[0], part.t.y - anchor[1], part.t.z - anchor[2]);
    if (A) A.transformVector(_v0, _v0);
    ent.setLocalPosition(_v0.x * s, _v0.y * s, _v0.z * s);
    if (A) { _q0.mul2(A, part.q); ent.setLocalRotation(_q0); } else ent.setLocalRotation(part.q);
    ent.setLocalScale(part.sc.x * s, part.sc.y * s, part.sc.z * s);
  }
  function loadArt(url) {
    try {
      app.assets.loadFromUrl(url || 'models/dogfight.glb', 'container', (err, asset) => {
        if (err || !asset) { artState = 'procedural (' + (err || 'no asset') + ')'; return; }
        try {
          const inst = asset.resource.instantiateRenderEntity();
          const parts = {};
          inst.forEach(e => { if (e.render && e.render.meshInstances.length) parts[e.name] = readPart(e, inst); });
          if (!parts.craft) { artState = 'procedural (no craft part)'; inst.destroy(); return; }
          const C = parts.craft;
          const cs = CRAFT / (Math.max(C.ext[0], C.ext[1], C.ext[2]) || 1);
          const cc = [(C.lo[0] + C.hi[0]) / 2, (C.lo[1] + C.hi[1]) / 2, (C.lo[2] + C.hi[2]) / 2];
          craftProto = { part: C, s: cs, c: cc };
          // the pod shares the CRAFT's fit — the exhausts are authored bolted to the tail, and
          // fitting the pod to its own bound would centre it and hang the glow off the nose
          if (parts.pod) podProto = { part: parts.pod, s: cs, c: cc };
          if (parts.trim) trimProto = { part: parts.trim, s: cs, c: cc };
          for (const s of ships.values()) rebuildShip(s);
          if (parts.gate) {
            /* ⚠ A RING HAS AN AXIS AND THE TWO PATHS DISAGREED ABOUT IT. The procedural fallback is
             * a pc.TorusGeometry, which lies in XZ with its axis on +Y, and dfpc-world stands it up
             * with a fixed 90° X rotation before facing it at the eye. The AUTHORED ring is already
             * upright (built with rx=π/2, so its axis is +Z) — so that same 90° laid it FLAT and a
             * boost gate you fly through became a horizontal hoop seen edge-on as a line. Normalise
             * at load instead of at draw: whichever axis is THINNEST is the ring's axis, and it is
             * turned onto +Y so both paths hand dfpc-world the same object. Measured, so a
             * replacement ring authored either way still lands right. */
            const G0 = parts.gate;
            const thin = G0.ext.indexOf(Math.min(G0.ext[0], G0.ext[1], G0.ext[2]));
            const A = new pc.Quat();
            if (thin === 0) A.setFromEulerAngles(0, 0, 90);            // +X → +Y
            else if (thin === 2) A.setFromEulerAngles(-90, 0, 0);      // +Z → +Y
            // the two REMAINING extents are the ring's diameter, and 1.4 is the radius the game tests
            const big = G0.ext.filter((_, i) => i !== thin);
            const gs = GATE_R / ((Math.max(big[0], big[1]) / 2) || 1);
            const gc = [(G0.lo[0] + G0.hi[0]) / 2, (G0.lo[1] + G0.hi[1]) / 2, (G0.lo[2] + G0.hi[2]) / 2];
            _v1.set(G0.t.x - gc[0], G0.t.y - gc[1], G0.t.z - gc[2]);
            A.transformVector(_v1, _v1);
            world.setGateMesh(G0.mesh, new pc.Vec3(_v1.x * gs, _v1.y * gs, _v1.z * gs), gs,
              new pc.Quat().mul2(A, G0.q), G0.sc);
          }
          /* ⚠ ALL FIVE PROP SHAPES, not the first one found. `WORLDS[].prop` names a silhouette
           * per theme — pylon · ring · spire · tower · crystal — and taking whichever part the GLB
           * yielded first planted the same pylon in all five worlds, which a screenshot caught and
           * the code did not. Each is fitted STANDING: height → 1, origin on the BASE, so `alt`
           * lifts a prop off the deck by the amount the game means. */
          const set = {};
          for (const k of ['pylon', 'ring', 'spire', 'tower', 'crystal']) {
            const P0 = parts['prop_' + k]; if (!P0) continue;
            const s = 1 / (P0.ext[1] || 1);
            const anchor = [(P0.lo[0] + P0.hi[0]) / 2, P0.lo[1], (P0.lo[2] + P0.hi[2]) / 2];
            set[k] = { mesh: P0.mesh, scale: s, rot: P0.q, nscale: P0.sc,
              off: new pc.Vec3((P0.t.x - anchor[0]) * s, (P0.t.y - anchor[1]) * s, (P0.t.z - anchor[2]) * s) };
          }
          if (Object.keys(set).length) world.setPropSet(set);
          artState = 'authored (' + Object.keys(parts).length + ' parts)';
          inst.destroy();
        } catch (e) { artState = 'procedural (' + (e && e.message) + ')'; }
      });
    } catch (e) { artState = 'procedural (' + (e && e.message) + ')'; }
  }

  // ── craft ───────────────────────────────────────────────────────────────────────────────
  const hex = h => { const s = String(h || '#2bff80').replace('#', '');
    return [(parseInt(s.slice(0, 2), 16) || 0) / 255, (parseInt(s.slice(2, 4), 16) || 0) / 255, (parseInt(s.slice(4, 6), 16) || 0) / 255]; };
  const hullMats = new Map(), glowMats = new Map();
  /* ⚑ HULLS ARE DARK BODIES WITH BRIGHT TRIM, not tinted lights. Against the old near-black sky a
   * saturated hull was the only bright thing in frame and read fine; against a high-key sky a
   * saturated hull is the SAME VALUE as its background and dissolves. So the albedo is the team
   * tint at ×0.24 — a dark, coloured body that silhouettes hard — and the tint is spent at full
   * strength on the engine pod, which is emissive and therefore reads at any range and any
   * exposure. Value carries the shape, chroma carries the identity. This is also what the game's
   * own 2D renderer already does (`s._pal` darkens the tint to 0.52/0.34/0.24).
   *
   * ⚑ AND THE "BRIGHT TRIM" HALF OF THAT SENTENCE WAS NEVER BUILT — see trimMat below. The hull
   *   was the whole aircraft, which is why it read as one dark smear.
   *
   * ⚠ THE FACE IS PRINTED INK, SO IT DOES NOT REFLECT THE SKY. docs/DESIGN-SYSTEM.md §1: "Metal
   *   may reflect the environment. A flat face must not" — and CLAUDE.md's THE WASH records what
   *   happens when it does, because a StandardMaterial samples the environment for AMBIENT
   *   SPECULAR too and that lands as a milky sheen which lifts blacks and eats saturation. It was
   *   metalness 0.42 / gloss 0.66 here, i.e. half a mirror pointed at a bright sky.
   *   ⛔ The fix is NOT `useSkybox = false`: that would also cut the IBL's ambient DIFFUSE, which
   *   is this scene's fill light, and drop the shadow side of every hull to black. Killing the
   *   dielectric specular specifically (`useSpecularityFactor`) removes the sheen and keeps the
   *   fill — the sky may LIGHT the card, it may not be MIRRORED in it. */
  function hullMat(tint) {
    let m = hullMats.get(tint);
    if (m) return m;
    const c = hex(tint);
    m = new pc.StandardMaterial(); m.name = 'hull' + tint;
    m.useMetalness = true; m.metalness = 0.0; m.gloss = 0.34;
    m.useSpecularityFactor = true; m.specularityFactor = 0.10;
    m.diffuse = new pc.Color(c[0] * 0.24, c[1] * 0.24, c[2] * 0.24);
    m.update(); hullMats.set(tint, m); return m;
  }
  /* ── FOIL, and it is the studio's material rather than the team's ───────────────────────
   * docs/DESIGN-SYSTEM.md §1 names foil as the one layer that exists NOWHERE in this project yet,
   * and states the rule that decides whether a thing is foil at all: **it is defined by movement,
   * not by colour** — the hue must walk as the viewer moves, and the acceptance test is to
   * measure the hue shift across view angles. A gradient, a hue-rotate or a tinted metal all fail
   * that test by construction.
   *
   * So this is genuine thin-film interference (`useIridescence`), which is the physical effect a
   * hot stamp actually has: the shift comes out of the half-angle, so it walks because the craft
   * ROLLED, not because a timer advanced. That also satisfies §4 — motion is a physical property
   * or it does not exist.
   *
   * ⚑ ONE MATERIAL FOR EVERY TEAM, not one per tint. The pod already carries the team colour at
   *   full emissive strength; if the foil were tinted too, the tint would swamp the interference
   *   and the acceptance measurement would be measuring the tint. Silver-warm base, team identity
   *   left to the light that is actually doing that job. Metal is also the ONE surface §1 permits
   *   to reflect the environment, which is why the skybox is left on here and cut on the hull. */
  let trimM = null;
  function trimMat() {
    if (trimM) return trimM;
    const m = new pc.StandardMaterial(); m.name = 'foil';
    m.useMetalness = true; m.metalness = 1.0; m.gloss = num('foilgloss', 0.88);
    m.diffuse = new pc.Color(0.86, 0.84, 0.78);          // F0 for a metal: warm silver stamp
    m.useIridescence = true;
    m.iridescence = num('irid', 1.0);
    m.iridescenceRefractionIndex = num('iridior', 1.9);
    // the film's thickness range IS the width of the hue sweep — too narrow and it reads as one
    // tinted metal, too wide and the bands alias into noise on a 250-triangle part
    m.iridescenceThicknessMin = num('iridmin', 210);
    m.iridescenceThicknessMax = num('iridmax', 760);
    m.update(); trimM = m; return m;
  }
  function glowMat(tint) {
    let m = glowMats.get(tint);
    if (m) return m;
    const c = hex(tint);
    m = new pc.StandardMaterial(); m.name = 'glow' + tint;
    m.useLighting = false; m.diffuse = new pc.Color(0, 0, 0);
    m.emissive = new pc.Color(c[0], c[1], c[2]); m.emissiveIntensity = 3.4;
    m.update(); glowMats.set(tint, m); return m;
  }
  function rebuildShip(rec) {
    const body = rec.body, pod = rec.pod, trim = rec.trim;
    if (body.render) body.removeComponent('render');
    if (pod.render) pod.removeComponent('render');
    if (trim.render) trim.removeComponent('render');
    const P = craftProto;
    if (P) {
      const mi = new pc.MeshInstance(P.part.mesh, hullMat(rec.tint), body); mi.castShadow = true;
      body.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
      fitPart(body, P.part, P.s, P.c, null);
      /* the trim shares the CRAFT's fit for the same reason the pod does: it is authored in the
       * craft's own frame and bolted to its edges, so fitting it to its own (slightly smaller)
       * bound would shrink it a few percent and float every strip off the edge it dresses */
      if (trimProto) {
        const mt = new pc.MeshInstance(trimProto.part.mesh, trimMat(), trim); mt.castShadow = true;
        trim.addComponent('render', { meshInstances: [mt], castShadows: true, receiveShadows: true });
        fitPart(trim, trimProto.part, trimProto.s, trimProto.c, null);
      }
      if (podProto) {
        const mp = new pc.MeshInstance(podProto.part.mesh, glowMat(rec.tint), pod); mp.castShadow = false;
        pod.addComponent('render', { meshInstances: [mp], castShadows: false, receiveShadows: false });
        fitPart(pod, podProto.part, podProto.s, podProto.c, null);
      }
    } else {
      // procedural delta wing: a flattened box is a poor plane, but it is a plane, and it flies
      // from the very first frame rather than waiting on a network round trip
      const g = pc.Mesh.fromGeometry(app.graphicsDevice, new pc.ConeGeometry({ baseRadius: CRAFT * 0.36, peakRadius: 0.01, height: CRAFT, heightSegments: 1, capSegments: 6 }));
      const mi = new pc.MeshInstance(g, hullMat(rec.tint), body); mi.castShadow = true;
      body.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
      // the cone's axis is +Y and its point is +Y; lay it along the nose (−Z after the flip below)
      body.setLocalEulerAngles(90, 0, 0);
      body.setLocalScale(1, 1, 1);
    }
  }
  function ensureShip(s) {
    let rec = ships.get(s);
    if (rec && rec.tint === s.tint) return rec;
    if (rec) { try { rec.root.destroy(); } catch (e) {} ships.delete(s); }
    const root = new pc.Entity('ship');
    /* ⚑ THE MODEL'S NOSE IS +Z AND AN ENTITY'S FORWARD IS −Z. glTF's own convention is +Z-forward
     * and a camera's is −Z-forward, so the two disagree by 180° for everyone, always; one pivot
     * resolves it ONCE, here, and every other place in this file uses the single yaw formula
     * θ = −(h + π/2) with no per-object offset to remember. The old renderer carried two
     * independent +π/2 offsets (one for the eye, one for the hull) and CLAUDE.md records the cost
     * of confusing them.
     * ⚠ This only holds once the part's own NODE rotation is applied — see loadArt. With the node
     * dropped the nose sat on the mesh's +X and this pivot dutifully turned it to −X, which is how
     * a 180° correction produced a 90° error. */
    const flip = new pc.Entity('nose'); flip.setLocalEulerAngles(0, 180, 0);
    const body = new pc.Entity('body'), pod = new pc.Entity('pod'), trim = new pc.Entity('trim');
    flip.addChild(body); flip.addChild(trim); flip.addChild(pod); root.addChild(flip);
    app.root.addChild(root);
    rec = { root, flip, body, pod, trim, tint: s.tint };
    ships.set(s, rec);
    rebuildShip(rec);
    return rec;
  }

  // ── the loop ────────────────────────────────────────────────────────────────────────────
  let grainT = 0, frames = 0, tPrev = 0;
  function start(onUpdate) {
    app.on('update', dt => {
      frames++;
      const now = performance.now();
      if (!marks.first) marks.first = +(now - T_BOOT).toFixed(1);
      if (tPrev) { times.push(now - tPrev); if (times.length > 240) times.shift(); }
      tPrev = now;
      if (ditherOn) { grainT = (grainT + 0.017) % 1000; app.graphicsDevice.scope.resolve('dfGrainT').setValue(grainT); }
      try { onUpdate(dt); } catch (e) { console.warn('[dfpc] update threw:', e && e.message); }
    });
    app.start();
  }

  const _qy = new pc.Quat(), _qx = new pc.Quat(), _qz = new pc.Quat(), _qr = new pc.Quat();
  let shove = 0, gK = 0;                            // smoothed boost/brake + G camera response
  /** the ONE conversion: game heading → entity yaw. Used by the camera and by every craft. */
  const yawDeg = h => -(h * DEG + 90);

  function sync(G, camS, wld, o) {
    if (!ok) return false;
    /* The sun rides the match's own azimuth, so turning sweeps it across the sky and two matches
     * on the same map are lit differently. Elevation is high and fixed: a low sun throws long
     * raking shadows across the deck that a player has to read past, and near the top shadows sit
     * UNDER things, which is where a contact cue belongs.
     * ⚠ setSun BEFORE apply — the sun's glow is BAKED INTO the sky cubemap, so applying the theme
     * first bakes it around whatever azimuth was left over from the previous match. A glow in the
     * sky that disagrees with the directional light reads as two suns. */
    const az = G.sunAz || 0;
    const sd = [Math.cos(az) * 0.52, 0.85, Math.sin(az) * 0.52];
    const sl = Math.hypot(sd[0], sd[1], sd[2]); sd[0] /= sl; sd[1] /= sl; sd[2] /= sl;
    world.setSun(sd);
    world.apply(wld, o);
    sun.setPosition(sd[0] * 60, sd[1] * 60, sd[2] * 60);
    sun.lookAt(0, 0, 0);
    const sc = world.sunColour();
    sun.light.color = new pc.Color(sc[0], sc[1], sc[2]);

    /* ── the camera ────────────────────────────────────────────────────────────────────
     * yaw θ = −(h + π/2); pitch NEGATED (see the header — the old renderer's sign made the view
     * tilt up when you dived); roll straight through so the horizon banks with the craft. Screen
     * shake jitters the RIG only, so the reticle on the 2D overlay — which never moves — stays
     * the thing you aim with. */
    _qy.setFromAxisAngle(pc.Vec3.UP, yawDeg(camS.h || 0));
    _qx.setFromAxisAngle(pc.Vec3.RIGHT, -(camS.ph || 0) * DEG);
    _qz.setFromAxisAngle(pc.Vec3.BACK, (camS.roll || 0) * DEG);
    _qr.copy(_qy).mul(_qx).mul(_qz);
    rig.setRotation(_qr);
    const me = G.me;
    /* ── G ──────────────────────────────────────────────────────────────────────────────
     * ⛔ `s.gLoad` WAS COMPUTED EVERY FRAME AND READ BY NOTHING. Its own comment in
     * dogfight.html says "HUD + camera shove"; grep says otherwise. It reaches 4.14 in a hard
     * banked pull and 2.50 in a flat one (measured), and none of it reached the eye — so the
     * difference between the sustainable turn and the one that is costing you everything was
     * invisible from the seat. That is the whole fight, unreadable.
     *
     * Three cues, all of them things a body or an airframe physically does, per the house rule
     * that motion is a physical property or it does not exist:
     *   sink   the eye drops in the seat under load — the single most legible G cue there is
     *   widen  the lens opens, so the world rushes past faster at the edges. Applied INSIDE the
     *          zoom divide with the boost widening, so precision zoom still wins the sight picture
     *   buffet a fast, small airframe judder — distinct in FREQUENCY from the impact shake below,
     *          which is a big slow thump. Two different events must not read as one effect
     * `gK` has its own lag (≈0.28 s): a body loads up and unloads over time, and a step change
     * would read as a glitch rather than as strain. */
    const gRaw = me ? Math.min(1, Math.max(0, ((me.gLoad || 1) - 1) / 3.2)) : 0;
    gK += (gRaw - gK) * Math.min(1, (o.dt || 0.016) * 3.6);
    const CAM_LIFT = 0.42 - 0.13 * gK;
    let jx = 0, jy = 0, jz = 0;
    const sh = Math.min(G.shake || 0, 14) * 0.006;
    if (sh > 0.0001) { jx = (Math.random() * 2 - 1) * sh; jy = (Math.random() * 2 - 1) * sh * 0.8; jz = (Math.random() * 2 - 1) * sh * 0.4; }
    if (gK > 0.02 && !o.reduce) {
      const t = G.t || 0, a = gK * gK * 0.019;         // squared: nothing at 1.5 g, real at 4
      jx += Math.sin(t * 47.3) * a; jy += Math.sin(t * 61.7) * a * 0.8;
    }
    // the whole world is drawn camera-relative, so the eye is at x/z 0 by construction
    rig.setPosition(jx, (camS.alt || 0) + CAM_LIFT + jy, jz);
    /* ⚑ THRUST HAS TO BE VISIBLE OR IT IS NOT FELT. Speed on a gauge is a number; speed in the
     * FRAME is the camera falling back and the lens widening, which is the oldest arcade trick
     * there is and the only one that works when the world is an open sky with nothing close to
     * parallax against. `shove` is smoothed here rather than in the simulation on purpose — it is
     * presentation, and a camera lag baked into the flight model would be a physics change nobody
     * asked for. Braking does the opposite: the eye crowds the tail, which is what makes an
     * airbrake read as "stopping" rather than as "the number went down".
     * ⚠ FOV is multiplied AFTER the zoom divide, so precision zoom still wins — a 12% widening
     * inside a 2.4× narrowing is a wobble on the sight picture, and the sight picture is aim. */
    const want = me ? ((me.boost ? 1 : 0) - (me.brake ? 0.85 : 0)) : 0;
    shove += (want - shove) * Math.min(1, (o.dt || 0.016) * 4.5);
    cam.setLocalPosition(0, 0, (o.CAM_BACK || 2.4) * (1 + 0.22 * shove + 0.09 * gK));   // +Z is BEHIND a camera
    /* Precision zoom is a real optical change, so it is a real FOV change — the old renderer did
     * it by multiplying a fake focal length, which the engine has no equivalent of. */
    cam.camera.fov = ((o.fov || 1.05) / (me && me.zoom ? 2.4 : 1)) * (1 + 0.13 * shove + 0.10 * gK) * DEG;

    // aerial haze + the white-out when the eye is inside the cloud deck (a gameplay mechanic)
    world.weather((o.CAM_H || 1.2) + (camS.alt || 0), o);

    // ── craft ──
    const WS = o.WS, FAR = o.VIEW_FAR || 34;
    const wdel = v => { v -= Math.round(v / WS) * WS; return v; };
    const live = new Set();
    for (const s of (G.ships || [])) {
      if (!s.alive) continue;
      // you do not see your own hull from inside your own cockpit
      if (s.isMe && G.view === 'cockpit') continue;
      const dx = wdel(s.x - camS.x), dz = wdel(s.y - camS.y);
      if (Math.hypot(dx, dz) > FAR * 1.1) continue;
      const rec = ensureShip(s);
      live.add(rec);
      rec.root.enabled = true;
      rec.root.setPosition(dx, s.alt || 0, dz);
      /* ⚑ ROLL AND PITCH ARE THE AIRFRAME'S OWN ANGLES NOW. Before the flight-model rewrite the
       * only attitude a craft had was `bank`, a smoothed copy of the stick, and PITCH WAS NEVER
       * APPLIED AT ALL — a ship diving at 5 units a second flew perfectly nose-level through the
       * whole descent, which reads as a hovering cut-out rather than an aircraft. `s.roll` /
       * `s.pitch` are real state (see flyShip in dogfight.html); `bank` remains as the fallback so
       * a net peer on an older build still banks. Order is yaw → pitch → roll: roll is innermost
       * because a rolled aircraft's pitch axis rolls WITH it, which is the whole reason banking
       * turns you. */
      const rollA = (s.roll != null ? s.roll : (s.bank || 0));
      _qy.setFromAxisAngle(pc.Vec3.UP, yawDeg(s.h || 0));
      _qx.setFromAxisAngle(pc.Vec3.RIGHT, -(s.pitch || 0) * DEG);
      _qz.setFromAxisAngle(pc.Vec3.BACK, -rollA * DEG
        + (s.rollT > 0 ? (1 - s.rollT / 0.55) * 360 * (s.rollDir || 1) : 0));
      _qr.copy(_qy).mul(_qx).mul(_qz);
      rec.root.setRotation(_qr);
      if (rec.pod.render) rec.pod.enabled = !!(s.thrust || s.boost);
      // the spawn blink is the game's own "I am not shootable yet" tell; keep it
      rec.root.enabled = !(s.spawnT > 0 && Math.sin((G.t || 0) * 26) <= 0);
    }
    /* ⚠ A ship entity is DESTROYED when its ship leaves G.ships, not merely hidden. `startMatch`
     * builds a fresh array of ship objects every match, so hiding-only would leak a hull, a pod
     * and two materials per craft per rematch — invisible in one sitting and a real leak in an
     * arcade cabinet that runs all day. `fleet` is rebuilt each frame from the live set, which is
     * at most six entries. */
    fleet.clear();
    for (const s of (G.ships || [])) fleet.add(s);
    for (const [s, rec] of ships) {
      if (!fleet.has(s)) { try { rec.root.destroy(); } catch (e) {} ships.delete(s); continue; }
      if (!live.has(rec)) rec.root.enabled = false;
    }

    world.update(G, camS, cam, o);
    if (fx) {
      // one object, refreshed in place — this runs every frame and a fresh literal per frame is
      // garbage the collector has to chase during a fight
      const sk = world.skin();
      FXSKIN.sunDir = sd; FXSKIN.grid = sk.grid; FXSKIN.hor = sk.hor; FXSKIN.gnd = sk.gnd;
      fx.update(G, camS, cam, o, FXSKIN);
    }
    return true;
  }
  const fleet = new Set();
  const FXSKIN = { sunDir: [0, 1, 0], grid: '#2bff80', hor: '#ffffff', gnd: '#888888' };

  /* ── world → overlay pixels ─────────────────────────────────────────────────────────────
   * ⛔ THE OLD 3D PATH DREW NO NAMEPLATES, NO ENEMY HEALTH BARS, NO LOCK BRACKET AND NO LEAD PIP.
   * All four live in `drawEntities`/`drawEnemy`/`drawLead`, which `draw()` calls only in the
   * `else` branch of `if (glReady)` — so the whole target-information layer existed on the ugly
   * fallback and not on the shipping renderer. `G.lock` was computed every frame and shown
   * nowhere. Putting it back needs a REAL projection (the game's `project()` is the fake-3D one
   * and does not agree with an engine camera by even a little), which is what this is. */
  const _wp = new pc.Vec3(), _sp = new pc.Vec3();
  function project(x, alt, z) {
    if (!ok) return null;
    _wp.set(x, alt, z);
    const r = cam.camera.worldToScreen(_wp, _sp);
    // worldToScreen returns z = view-space distance; behind the eye is not on screen
    if (r.z <= 0.05) return null;
    return { x: r.x, y: r.y, d: r.z };
  }

  /* ── headless handedness probe ──────────────────────────────────────────────────────────
   * Returns the ENGINE's actual forward/right at a heading next to the GAME's own, so the claim
   * in the header stays a measurement. `err` is the largest component-wise disagreement; a mirror
   * shows up as ~2.0 on the right vector and 0 on forward, which is exactly the signature Section
   * 9's bug had. */
  function basis(h) {
    if (!ok) return null;
    const keep = rig.getLocalRotation().clone();
    _qy.setFromAxisAngle(pc.Vec3.UP, yawDeg(h));
    rig.setRotation(_qy);
    rig.getWorldTransform();                          // force the transform to resolve before reading
    const f = cam.forward, r = cam.right;
    const gF = [Math.cos(h), 0, Math.sin(h)], gR = [-Math.sin(h), 0, Math.cos(h)];
    rig.setLocalRotation(keep);
    const df = Math.max(Math.abs(f.x - gF[0]), Math.abs(f.y - gF[1]), Math.abs(f.z - gF[2]));
    const dr = Math.max(Math.abs(r.x - gR[0]), Math.abs(r.y - gR[1]), Math.abs(r.z - gR[2]));
    return { h: +h.toFixed(4),
      gameFwd: gF.map(v => +v.toFixed(4)), camFwd: [+f.x.toFixed(4), +f.y.toFixed(4), +f.z.toFixed(4)],
      gameRgt: gR.map(v => +v.toFixed(4)), camRgt: [+r.x.toFixed(4), +r.y.toFixed(4), +r.z.toFixed(4)],
      errFwd: +df.toFixed(5), errRgt: +dr.toFixed(5) };
  }
  /** pitch sign: game ph > 0 means DESCENDING, so the camera's forward y must go NEGATIVE */
  function pitchProbe(ph) {
    if (!ok) return null;
    const keep = rig.getLocalRotation().clone();
    _qy.setFromAxisAngle(pc.Vec3.UP, yawDeg(0));
    _qx.setFromAxisAngle(pc.Vec3.RIGHT, -ph * DEG);
    rig.setRotation(_qr.copy(_qy).mul(_qx));
    rig.getWorldTransform();
    const f = cam.forward;
    rig.setLocalRotation(keep);
    return { ph: +ph.toFixed(3), fwdY: +f.y.toFixed(4), looking: f.y < -1e-4 ? 'down' : (f.y > 1e-4 ? 'up' : 'level') };
  }

  /* ⚠ SIZES ARE PASSED IN, and they must come from a box the ENGINE does not own.
   * `app.resizeCanvas(w, h)` writes `style.width`/`style.height` in px on its canvas — so after
   * the first call the stylesheet's `calc(100vw - …)` is dead on that element and calling it with
   * no arguments would then re-measure the inline size it wrote last time and never grow again.
   * dogfight.html measures the 2D OVERLAY canvas, which is CSS-sized and which the engine never
   * touches, and hands the numbers over. Writing canvas.width/height directly is the other wrong
   * answer: it leaves the engine's render targets and projection sized for the previous frame,
   * which reads as a stretched view after one window drag. */
  function resize(w, h) { if (ok && w > 0 && h > 0) app.resizeCanvas(w, h); }
  function stats() {
    if (!ok) return { ok: false, why };
    const s = times.slice().sort((a, b) => a - b);
    const med = s.length ? s[s.length >> 1] : 0;
    const w = world.stats();
    return { ok: true, engine: 'PlayCanvas ' + pc.version, tier: TIER, art: artState,
      post: !!frame, dither: ditherOn, frames,
      median: +med.toFixed(1), p95: s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))].toFixed(1) : 0,
      worst: s.length ? +s[s.length - 1].toFixed(1) : 0,
      props: w.props, gates: w.gates, puffs: w.puffs, theme: w.theme, night: w.night,
      ships: ships.size, fx: fx ? fx.stats() : null, boot: marks.boot, firstFrame: marks.first };
  }

  return { init, start, sync, project, basis, pitchProbe, resize, stats,
           supported: () => ok, why: () => why, app: () => app, camera: () => cam,
           tier: () => TIER, setQuality: q => { try { localStorage.setItem('dfpc_q', q); } catch (e) {} } };
})();

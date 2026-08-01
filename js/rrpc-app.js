/* upperdeckripmaster3030 — RIP ROCKETER on PlayCanvas: the driver (RRPC).
 *
 * `js/rrpc-game.js` owns the rules and knows no engine. This file owns the engine and knows no
 * rules: it builds the scene, drives the batched quad layers from G, runs the post stack, reads
 * input and paints the HUD. Same split as `js/s9pc-app.js`, for the same reason — the pacing has
 * to be measurable off the simulation and the picture has to be measurable off the frame, and
 * neither measurement is allowed to depend on the other.
 *
 * ── HANDEDNESS, CHECKED RATHER THAN ASSUMED ────────────────────────────────────────────────────
 * CLAUDE.md records that Section 9's PlayCanvas port rendered MIRRORED and that it produced three
 * separate bug reports from one defect. That happened because Section 9's basis (x right, y up,
 * z FORWARD) is LEFT-handed while a PlayCanvas camera's (x right, y up, −z forward) is RIGHT-
 * handed, and no rotation can convert between them.
 *
 * This game does NOT inherit that bug, and the reason is worth stating rather than assuming: it
 * was authored in the ENGINE's own basis from the start. +x is right, +y is up, and −z goes INTO
 * the screen — the formation sits at z ≈ −1.2, a diver swings out to z ≈ +2.6 (past the camera
 * plane, filling the frame), the camera sits at +z looking down its own −z with identity
 * rotation. There is no conversion boundary, so there is nothing to get backwards and no
 * `worldMirror` node.
 *
 * That is an argument, not a measurement, so it is ALSO measured. `__rrpc._basis()` projects three
 * known world points through the live camera and asserts the screen result:
 *     world (+1,0,0)  must land RIGHT of centre        world (0,+1,0)  must land ABOVE centre
 *     world (0,0,+1)  must be NEARER (larger on screen) than (0,0,−1)
 * It is run in the headless check. If left/right input ever disagrees with the picture, run it
 * first — that is the same defect, and this is how it is caught in one step instead of three.
 *
 * ── NO SOFTWARE PATH ──────────────────────────────────────────────────────────────────────────
 * PlayCanvas has no software fallback, so this build genuinely requires WebGL 2. Fail-open is a
 * standing principle in this repo, so it is preserved as a ROUTE rather than as a renderer:
 * `riprocketer-classic.html` is the previous hand-rolled 2D-canvas build, kept verbatim, and a
 * browser without WebGL 2 is sent there. Exactly what `section9.html` does.
 */
(function () {
  const Q = new URLSearchParams(location.search);
  const num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  const on = (k, d) => (Q.has(k) ? Q.get(k) !== '0' : d);
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const canvas = $('rrpc'), ov = $('rrov');

  const gl2 = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; } })();
  if (!gl2 || !window.pc || !window.RRGame || !window.RRFx) {
    const n = $('nogl');
    if (n) { n.classList.add('show');
      $('noglWhy').textContent = !window.pc ? 'the engine bundle did not load'
        : !gl2 ? 'this browser reports no WebGL 2 context' : 'a game module did not load'; }
    const s = $('ovStart'); if (s) s.classList.remove('show');
    return;
  }

  // ── quality ─────────────────────────────────────────────────────────────────────────────────
  /* ONE definition of "weak device" for the whole site: GfxPost.dprCap(). It already folds in
   * touch + small screen + low cores/memory + save-data. ⚑ It returns an ABSOLUTE cap with a floor
   * of 1, never a multiplier — CLAUDE.md records that the multiplier version pushed the effective
   * ratio to 0.63, i.e. below one CSS pixel, which is visibly soft. */
  const DPRCAP = (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2;
  const AUTO_TIER = DPRCAP >= 2 ? 'high' : (DPRCAP >= 1.5 ? 'mid' : 'low');
  let TIER = Q.get('q') || AUTO_TIER;
  if (['low', 'mid', 'high'].indexOf(TIER) < 0) TIER = AUTO_TIER;
  const TIERS = {
    high: { rtScale: 1.0, stars: 420, bloom: true, fringing: true, dither: true, bg: 48 },
    mid: { rtScale: 0.85, stars: 260, bloom: true, fringing: true, dither: true, bg: 32 },
    low: { rtScale: 0.7, stars: 140, bloom: true, fringing: false, dither: false, bg: 18 },
  };
  const QCFG = TIERS[TIER];

  /* ── POST: GfxPost.PRESET.neon, PORTED, and the two numbers that cannot be derived are MEASURED.
   *
   *   neon: intensity 1.15, threshold 0.62, ca 0.0022, vignette 0.36, sat 1.00,
   *         knee 0.92, dither 0.0045, sharpen 0.18, passes 2, blur 0
   *
   * ⚑ THE KNEE (0.92) → the TONEMAPPER. GfxPost is an LDR chain, so bloom pushes pixels past 1.0
   *   and the GPU clips them to flat white; the knee rolls them off instead. PlayCanvas renders
   *   HDR and tone-maps AFTER bloom, so the tonemapper IS the rolloff, done in the right space.
   *   The port of "knee 0.92" is therefore "the tonemapper must be a rolloff curve, never
   *   LINEAR/NONE" — and it is verified the way the 0.94 sweep was derived: by COUNTING CLIPPED
   *   PIXELS. `__rrpc._sweepTone()` does that measurement in-browser and it was run; numbers in
   *   the report. Lower is not safer here either, only darker.
   *
   * ⚑ CHROMATIC ABERRATION, DERIVED. GfxPost samples at `uv + (uv−0.5)*ca`, a displacement linear
   *   in distance from centre: at the corner |uv−0.5| = 0.5, so the offset is ca × 0.5. PlayCanvas's
   *   applyFringing uses `offset = (I/1024)·d²`, i.e. I/4096 per axis at the corner. Equal at
   *   I = 4096 × ca × 0.5 = 2048·ca. For neon's ca 0.0022 that is 4.51. (s9pc-app.js derives the
   *   same relation and lands 2.46 for tactical's 0.0012 — the two agree, which is the check.)
   *   ⚑ This game is the one place in the repo where the brief ASKS for heavy CA. "On acid" is a
   *     register, and colour fringing is most of it. So `neon` is taken at full strength here
   *     rather than being quietly softened the way `clean` mode softens Section 9's.
   *
   * ⚑ VIGNETTE, DERIVED. GfxPost: `1 − 0.36·smoothstep(0.34, 1.12, r)` with r = |uv−0.5|.
   *   PlayCanvas: `1 − intensity·smoothstep(inner, outer, edge)` with edge = 2r at curvature 1.
   *   Substituting: inner = 0.68, outer = 2.24, intensity = 0.36. Identical curve.
   *
   * ⚠ BLOOM CANNOT BE COPIED ACROSS. GfxPost's 1.15 is an additive multiplier over its own bright
   *   pass at threshold 0.62; PlayCanvas's is a mip-chain mix. Different quantity. SWEPT — numbers
   *   in the report and in `__rrpc._sweepBloom()`.
   * ⚠ SHARPEN CANNOT BE PORTED ANALYTICALLY either: unsharp vs AMD CAS. Measured against mean
   *   |Laplacian|, same method s9pc used.
   * ⚠ MOTION SMEAR: `neon`'s blur is 0, so there is nothing to lose. Noted so nobody adds one.
   */
  const POST = {
    /* ⚑ BLOOM, SWEPT — and re-swept, because the first sweep ran against the additive-alpha bug in
     * js/rrpc-fx.js and was therefore measuring a much brighter frame than this code produces.
     * Held wave-1 frame, blur 3, after the fix (clipped% / luma / RMS / blacks% / sat% / edge):
     *     0    → 0.006 · 52.4 · 55.6 · 10.92 · 91.9 · 29.43
     *     0.04 → 0.009 · 58.3 · 55.0 ·  5.10 · 86.0 · 27.75   ← chosen
     *     0.08 → 0.004 · 56.4 · 48.2 ·  5.58 · 86.6 · 19.14
     *     0.14 → 0.015 · 60.0 · 48.3 ·  4.17 · 84.2 · 16.41
     *     0.22 → 0.011 · 71.5 · 53.1 ·  2.05 · 72.6 · 16.82
     *     0.35 → 0.007 · 71.8 · 53.1 ·  1.53 · 73.5 · 12.67
     * Bloom buys luma and SPENDS local detail and saturation — the same shape s9pc-app.js
     * measured. 0.04 is the last value that keeps 94% of the unbloomed frame's detail while still
     * lifting the picture; 0.08 drops it to 65% for two luma. The brief wants this game to GLOW,
     * and the answer to that is not a bigger global lever — it is brighter FX (additive intensity
     * 1.9, above), which is where glow is supposed to come from. A bloom wide and strong enough to
     * make a bolt shine makes the backdrop shine too, and then nothing shines. */
    bloom: num('bloom', 0.04),
    /* ⚑ THE TONEMAPPER IS THE HIGHLIGHT-KNEE PORT, AND WHAT IS MEASURABLE IS *THAT IT MUST BE A
     * ROLLOFF CURVE* — not which rolloff curve. Measured at the shipping settings, each tonemapper
     * twice, interleaved, on a frame with both the simulation AND the render clock frozen:
     *
     *     tone      clipped% (#1 / #2)   luma (#1/#2)   RMS (#1/#2)
     *     ACES        0.002 / 0.074      63.3 / 55.4    53.8 / 48.4
     *     NEUTRAL     0.003 / 0.003      51.2 / 59.4    36.6 / 49.1   ← chosen
     *     FILMIC      0.000 / 0.000      35.0 / 43.4    26.6 / 38.1
     *     LINEAR      7.438 / 3.061      75.8 / 63.0    65.3 / 51.5
     *     NONE        0.790 / 3.407      54.0 / 65.9    39.0 / 53.6
     *
     * ⚠ READ THE TWO PASSES, NOT THE FIRST ONE. They disagree by more than the difference between
     *   ACES and NEUTRAL — RMS moves 12 points for the SAME setting. SwiftShader in this container
     *   is not a stable readback (CLAUDE.md already records that its screenshots rotate hue and
     *   that a number off one frame means nothing), and interleaving the passes is what made that
     *   visible instead of letting the first table look authoritative. An earlier version of this
     *   comment asserted a clean "NEUTRAL beats ACES by 1.7 RMS" table from a single pass. It was
     *   noise, and it is exactly the mistake CLAUDE.md warns about for the 3D card.
     *
     * WHAT IS REPEATABLE, across every run: LINEAR and NONE clip (0.46-7.4%), ACES / NEUTRAL /
     * FILMIC do not (≤0.074%), and FILMIC crushes — lowest luma in every pass. That settles the
     * port: the tonemapper must be a rolloff curve and must not be FILMIC. The independent
     * confirmation is stronger than any of the above and it IS repeatable — with the stack off
     * (`?post=0`) the same frame clips 2.19-2.24% of its pixels, and with it on, 0.002-0.003%.
     * That is the "count the clipped pixels" verification GfxPost's 0.92 knee was derived by.
     *
     * BETWEEN ACES AND NEUTRAL the difference is below the noise floor here, so it was decided on
     * the curves' documented behaviour rather than on a number this container cannot hold still:
     * ACES carries a contrast S-curve with a DESATURATING shoulder, Khronos PBR Neutral is built
     * to preserve hue and saturation into the highlights. This game is saturated neon on purpose
     * and its brightest pixels are its most colourful ones, so a shoulder that drains them is
     * working against the brief. Section 9 chose ACES for the opposite frame — a dim tactical
     * interior where the midtone lift is a gift. ⚑ What ports is the METHOD, not the answer.
     */
    tone: pc.TONEMAP_NEUTRAL,
    fringing: 4.51,
    vignette: { inner: 0.68, outer: 2.24, curvature: 1.0, intensity: 0.36 },
    /* ⚑ SATURATION 1.30 against `neon`'s 1.00, for exactly the reason s9pc-app.js gives for its
     * own 1.26 in clean mode: a flat-albedo world has no texture detail to carry interest, so
     * colour has to do all of it. Measured 1.0 → 1.45: mean saturation 78.8 → 88.2 while RMS falls
     * 58.9 → 55.6 and clipping climbs 0.023% → 0.102%. 1.30 takes most of the colour (87.6) before
     * either cost turns over. */
    saturation: num('sat', 1.30),
    contrast: 1.0,                 // see s9pc-app.js: PlayCanvas grades in LINEAR, before the
                                   // tonemapper, so >1 here black-crushes rather than adding punch
    /* ⚑ SHARPNESS 0.50, agreed two ways. DERIVED: s9pc measured tactical's unsharp 0.26 → CAS 0.70,
     * and neon's unsharp is 0.18, so 0.18/0.26 × 0.70 = 0.48. MEASURED: mean |Laplacian| runs
     * 0 → 6.05 · 0.15 → 6.46 · 0.3 → 6.67 · 0.5 → 6.97 · 0.7 → 9.71 · 1.0 → 11.15, and 0.7 is
     * where a different effect appears rather than more of the same one. The two agree at ~0.5,
     * which is the only reason to trust either. */
    sharpness: num('sharp', 0.50),
    dither: num('dither', 0.0045),
    grain: num('grain', 0.006),
  };

  // ── application ─────────────────────────────────────────────────────────────────────────────
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: {
      antialias: false, alpha: false, depth: true, powerPreference: 'high-performance',
      // ?grab=1 keeps the drawing buffer so a headless run can read real pixels. CLAUDE.md: this
      // container's screenshot path rotates hue on canvas content, so colour is judged from a
      // readback — and a WebGL canvas without this reads back black.
      preserveDrawingBuffer: on('grab', false),
    },
  });
  window.__pcapp = app;
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  const DPR_BASE = Math.min(window.devicePixelRatio || 1, DPRCAP);
  app.graphicsDevice.maxPixelRatio = DPR_BASE;
  app.scene.ambientLight = new pc.Color(0, 0, 0);   // everything here is unlit/emissive on purpose

  // ── camera ──────────────────────────────────────────────────────────────────────────────────
  /* Identity rotation at +z, looking down its own −z. See the handedness note at the top: this is
   * the engine's own basis and there is no conversion. fov is VERTICAL and 42° frames the field's
   * 9.4-unit height at z=0 with a little air; the camera pulls back on wave entry so the formation
   * arrives from further away, which is free drama and costs one lerp. */
  const CAM = { z: 11.4, y: -0.15, fov: 42 };
  const cam = new pc.Entity('cam');
  cam.addComponent('camera', { fov: CAM.fov, nearClip: 0.1, farClip: 220,
    clearColor: new pc.Color(0.005, 0.004, 0.014), toneMapping: POST.tone });
  cam.setPosition(0, CAM.y, CAM.z);
  app.root.addChild(cam);

  // ── post stack ──────────────────────────────────────────────────────────────────────────────
  let frame = null;
  function buildPost() {
    if (!on('post', true)) return;
    try {
      frame = new pc.CameraFrame(app, cam.camera);
      frame.rendering.samples = 1;
      frame.rendering.renderTargetScale = QCFG.rtScale;
      frame.rendering.toneMapping = POST.tone;
      frame.rendering.sharpness = POST.sharpness;
      frame.bloom.intensity = QCFG.bloom ? POST.bloom : 0;
      /* ⚑ BLUR LEVEL 3, NOT THE DEFAULT. GfxPost's neon preset does `passes: 2` at half res — a
       * TIGHT halo, which is what "neon glows" actually looks like. PlayCanvas's blurLevel is a
       * mip-chain depth and the first version used 14, which spread the glow across the whole
       * frame as a fog. Measured at bloom 0.06 (luma / RMS / sat% / edge):
       *     3 → 76.8 · 50.2 · 84.2 · 10.84   ← chosen
       *     5 → 85.7 · 47.5 · 71.5 ·  8.63
       *     8 → 97.4 · 43.2 · 58.8 ·  7.50
       *    11 → 100.0 · 44.5 · 55.6 ·  9.32
       *    14 →  94.5 · 43.6 · 58.4 ·  7.40
       * Every step wider costs saturation and detail and buys only brightness; past 8 the chain
       * has nothing left to add. A wide bloom is how a colourful game becomes a grey one. */
      frame.bloom.blurLevel = num('blur', 3);
      frame.ssao.type = pc.SSAOTYPE_NONE;    // nothing here is lit; SSAO would shade nothing
      frame.vignette.inner = POST.vignette.inner; frame.vignette.outer = POST.vignette.outer;
      frame.vignette.curvature = POST.vignette.curvature; frame.vignette.intensity = POST.vignette.intensity;
      frame.grading.enabled = true;
      frame.grading.saturation = POST.saturation;
      frame.grading.contrast = POST.contrast; frame.grading.brightness = 1.0;
      frame.fringing.intensity = QCFG.fringing ? POST.fringing : 0;
      frame.update();
    } catch (e) { frame = null; console.warn('[rrpc] post stack failed:', e && e.message); }
    installDither();
  }
  /* Dither + grain, injected exactly as s9pc-app.js does: PlayCanvas's compose pass has neither,
   * and GfxPost's 8×8 Bayer at 0.0045 (≈1.1/255) is what kills banding in a dark gradient — which
   * this game is almost entirely made of. `composeMainEndPS` runs after the vignette and BEFORE
   * gammaCorrectOutput, so the value is still linear and has to be round-tripped through an
   * approximate display curve to put the ±½ LSB where the banding actually is. */
  const DITHER_CHUNK = [
    'float rr_h(vec2 p){ return fract(sin(dot(p, vec2(41.0, 289.0))) * 43758.5453); }',
    'float rr_bayer(vec2 p){ vec2 t = floor(mod(p, 8.0)); float b = 0.0, s = 1.0;',
    '  for (int i = 0; i < 3; i++) { vec2 f = floor(mod(t, 2.0)); b += s * (f.x + 2.0 * mod(f.x + f.y, 2.0)); s *= 4.0; t = floor(t * 0.5); }',
    '  return b / 64.0; }',
    'uniform float rrDither; uniform float rrGrain; uniform float rrGrainT;',
  ].join('\n');
  const DITHER_MAIN = [
    '{ vec3 rrd = pow(max(result, vec3(0.0)), vec3(1.0 / 2.2));',
    '  rrd += (rr_bayer(gl_FragCoord.xy) - 0.5) * rrDither;',
    '  rrd += (rr_h(uv * vec2(1023.0, 791.0) + rrGrainT) - 0.5) * rrGrain;',
    '  result = pow(max(rrd, vec3(0.0)), vec3(2.2)); }',
  ].join('\n');
  let ditherOn = false;
  function installDither() {
    if (!QCFG.dither || !(POST.dither > 0 || POST.grain > 0)) return;
    try {
      const chunks = pc.ShaderChunks.get(app.graphicsDevice, pc.SHADERLANGUAGE_GLSL);
      chunks.set('composeDeclarationsPS', DITHER_CHUNK);
      chunks.set('composeMainEndPS', DITHER_MAIN);
      const sc = app.graphicsDevice.scope;
      sc.resolve('rrDither').setValue(POST.dither);
      sc.resolve('rrGrain').setValue(POST.grain);
      sc.resolve('rrGrainT').setValue(0);
      ditherOn = true;
    } catch (e) { ditherOn = false; console.warn('[rrpc] dither chunk not installed:', e && e.message); }
  }
  buildPost();

  // ── layers ──────────────────────────────────────────────────────────────────────────────────
  /* ?bg= scales the backdrop's brightness. It exists because the FIRST version of this field was
   * measured at mean luma 177.8 with 1.05% of pixels CLIPPED — a bright flat wash that the
   * enemies had to compete with rather than sit on. CLAUDE.md's standard from the GfxPost sweeps
   * is that clipping stays at zero, so this became a knob and then got swept. See the report. */
  /* ⚑ 0.20, SWEPT — and the metric that decided it is `blacks%`, not brightness. CLAUDE.md records
   * that Section 9's engine build lost its black point (7.3% → 0.4% of frame under 12/255) and
   * that this, not the lighting taste, was the defect. Measured here (blacks% / RMS / sat%):
   *     0.12 → 26.03 · 61.7 · 76.6      0.45 →  4.70 · 58.1 · 86.7
   *     0.20 → 12.55 · 66.3 · 74.5  ←   0.70 →  0.47 · 60.0 · 85.2
   *     0.30 → 14.47 · 60.3 · 84.9      1.00 →  0.35 · 59.1 · 89.0
   * 0.20 has the best global contrast in the sweep AND keeps a real black point. Above 0.45 the
   * backdrop has eaten the blacks entirely, which is exactly the failure mode above: a screen
   * full of colour that the enemies then have to compete with instead of sit on. */
  let BG_K = num('bg', 0.20);
  const M = { bg: 1, stars: 1, enemies: 1, aura: 1, card: 1, pops: 1, beams: 1, bullets: 1, pows: 1, ship: 1, flash: 1 };
  const fx = RRFx.create(app);
  const G = RRGame.create();
  const F = RRGame.F;

  // ── the player's craft: a real mesh, and the only lit-looking thing on screen ────────────────
  /* Baked flat shading rather than a light. Everything else in this build is unlit and additive,
   * and adding a directional light for one object would put the whole scene on the lit shader
   * path for a single mesh. So the lambert term against a fixed key is computed at BUILD time and
   * written into the vertex colours: the same picture, on the cheap shader, and it can never
   * disagree with the rest of the frame about what "lit" means. */
  function buildCraft() {
    const V = {
      nose: [0, 0.00, 1.30], spine: [0, 0.20, -0.15], belly: [0, -0.16, -0.05],
      wl: [-1.02, -0.02, -0.62], wr: [1.02, -0.02, -0.62],
      hl: [-0.30, 0.06, 0.30], hr: [0.30, 0.06, 0.30],
      tl: [-0.26, 0.02, -0.98], tr: [0.26, 0.02, -0.98],
      fin: [0, 0.62, -0.86], engL: [-0.34, 0.00, -0.98], engR: [0.34, 0.00, -0.98],
    };
    // [a,b,c, r,g,b] — a cyan-steel hull with magenta/amber trim, the cabinet palette
    const HULL = [22, 132, 158], DARK = [10, 62, 82], WING = [16, 74, 96], TRIM = [255, 42, 217];
    const faces = [
      ['nose', 'hl', 'spine', HULL], ['nose', 'spine', 'hr', HULL],
      ['nose', 'belly', 'hl', DARK], ['nose', 'hr', 'belly', DARK],
      ['hl', 'wl', 'spine', WING], ['hr', 'spine', 'wr', WING],
      ['wl', 'tl', 'spine', WING], ['wr', 'spine', 'tr', WING],
      ['hl', 'belly', 'wl', DARK], ['hr', 'wr', 'belly', DARK],
      ['belly', 'tl', 'wl', DARK], ['belly', 'wr', 'tr', DARK],
      ['spine', 'tl', 'fin', TRIM], ['spine', 'fin', 'tr', TRIM],
      ['tl', 'engL', 'fin', DARK], ['tr', 'fin', 'engR', DARK],
    ];
    const L = [-0.30, 0.83, 0.47];       // key direction, normalised; over the left shoulder
    const pos = [], col = [], idx = [];
    let n = 0;
    for (const f of faces) {
      const a = V[f[0]], b = V[f[1]], c = V[f[2]], base = f[3];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m;
      // wrapped diffuse: (N·L + 1)/2 rather than max(N·L,0). A hard terminator on a 16-face model
      // reads as a modelling error; a wrapped one reads as a curved hull.
      const k = 0.34 + 0.86 * ((nx * L[0] + ny * L[1] + nz * L[2]) * 0.5 + 0.5);
      for (const p of [a, b, c]) {
        pos.push(p[0], p[1], p[2]);
        col.push(clamp(base[0] * k, 0, 255) | 0, clamp(base[1] * k, 0, 255) | 0, clamp(base[2] * k, 0, 255) | 0, 255);
        idx.push(n++);
      }
    }
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(pos); mesh.setColors32(col); mesh.setIndices(idx);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const m = new pc.StandardMaterial();
    m.name = 'rr-craft'; m.useLighting = false; m.useFog = false;
    m.diffuse = new pc.Color(0, 0, 0); m.emissive = new pc.Color(1, 1, 1);
    m.emissiveVertexColor = true; m.diffuseVertexColor = true;
    m.emissiveIntensity = 1.25; m.cull = pc.CULLFACE_NONE; m.update();
    const ent = new pc.Entity('craft');
    const mi = new pc.MeshInstance(mesh, m, ent);
    mi.setCustomAabb(new pc.BoundingBox(new pc.Vec3(0, 0, 0), new pc.Vec3(3, 3, 3)));
    ent.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
    app.root.addChild(ent);
    return ent;
  }
  const craft = buildCraft();
  const craft2 = buildCraft();       // the DOUBLE RIG's second ship; hidden until earned
  craft2.enabled = false;

  // ── card art into the atlas ─────────────────────────────────────────────────────────────────
  /* The enemies ARE the deck. Your own vault first, the placeholder set as the fallback, and if
   * neither arrives the generated cells already in the atlas stand in — the formation is never
   * blank. Each decode re-uploads the atlas once; twelve uploads, then never again. */
  let deckNames = [];
  function loadDeck() {
    fetch('cards/manifest.json').then(r => r.json()).then(m => {
      const deck = m.cards || [], bySlug = new Map(deck.map(c => [c.slug, c]));
      let owned = [];
      try { owned = JSON.parse(localStorage.getItem('urm_vault') || '[]').map(e => bySlug.get(e.slug)).filter(Boolean); } catch (e) {}
      const pick = (owned.length >= 4 ? owned.slice(-12) : deck.slice(0, 12));
      deckNames = pick.map(c => c.title || c.slug);
      // the staked deck also ARMS you — see js/card-powers.js. This game never used it before.
      if (window.RipPowers && owned.length) {
        try {
          const L = RipPowers.loadout(owned.slice(-6));
          G.loadout = L;
          const el = $('startNote2'); if (el) el.textContent = L.summary;
        } catch (e) {}
      }
      pick.forEach((c, i) => {
        const im = new Image();
        im.onload = () => fx.setCell(i, im);
        im.src = 'cards/' + c.art;
      });
    }).catch(() => {});
  }
  loadDeck();
  if (window.RipPowers) { try { RipPowers.pollMarket(); } catch (e) {} }

  // ── the live chain: FLAVOUR, never the clock ────────────────────────────────────────────────
  /* ⛔ THIS IS THE ONE STRUCTURAL FIX THE OLD BUILD NEEDED MOST. It set `market.pendingWave` from
   *    the block poller, so the only formation-shaped content in the game arrived at Sepolia block
   *    rate — about every 12 s, or never when the RPC was unreachable. An arcade game's tempo
   *    cannot be a network's tempo. Here the chain moves the PALETTE, names the weather and nudges
   *    aggression; the wave clock belongs to `rrpc-game.js` and to nothing else. */
  const CFG = window.RIPMASTER_CHAIN || {};
  const RPCS = CFG.rpcs || ['https://ethereum-sepolia-rpc.publicnode.com'];
  const WX = ['GAS STORM', 'STILL AIR', 'BURN WAVE', 'MOON CANDLE', 'RUG WIND', 'DEEP WATER', 'BLOCK OMEN', 'WHALE SONG'];
  async function pollChain() {
    try {
      for (const u of RPCS) {
        const c = new AbortController(), t = setTimeout(() => c.abort(), 4200);
        const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] }), signal: c.signal });
        clearTimeout(t);
        const j = await r.json(), blk = j && j.result;
        if (blk && blk.number) {
          const n = parseInt(blk.number, 16);
          const gu = parseInt(blk.gasUsed || '0x0', 16), gl = parseInt(blk.gasLimit || '0x1', 16) || 1;
          G.market.block = n; G.market.hue = (n * 7) % 360;
          G.market.weather = WX[Math.floor(n / 25) % 8];
          G.market.heat = clamp(0.7 + clamp(gu / gl, 0.05, 1) * 1.8, 0.7, 2.6);
          break;
        }
      }
    } catch (e) {}
    setTimeout(pollChain, 6000);
  }
  pollChain();

  // ── input ───────────────────────────────────────────────────────────────────────────────────
  const keys = Object.create(null);
  const input = { left: false, right: false, up: false, down: false, fire: false, stick: false, sx: 0, sy: 0,
    dash: false, dashDir: 0, roll: false, rollDir: 0 };
  /* ── THE TWO NEW VERBS, EDGE-TRIGGERED ──────────────────────────────────────────────────────
   * ⚑ They MUST be edges, not held states, and the reason is the fixed 1/120 s tick: `RRGame.step`
   *   burns up to 16 sub-ticks against the SAME input object, so a held flag would fire the move
   *   sixteen times in one frame. The cooldowns in rrpc-game.js would swallow the repeats, but
   *   relying on that is relying on a rule in another file to cover a bug in this one. A pending
   *   flag consumed once per frame is the honest version.
   * ⚑ DOUBLE-TAP ◀/▶ dashes, which is the same idiom NEON RONIN already uses (CLAUDE.md: "Shift or
   *   dbl-tap A/D dash"), so a player who has been in the arcade already knows it. Q/E are the
   *   explicit version for anyone who does not want to rely on tap timing — also ronin's keys.
   * ⚠ Shift is the ROLL here. It is a game key: a headless probe must not use it to wake rAF. */
  /* ⚠ A DOUBLE-TAP TEST OF "two presses inside 260 ms" IS TOO LOOSE, and it showed up immediately:
   * a headless probe that merely pumped ◀/▶ to keep rAF alive accumulated three dashes and lit
   * OVERDRIVE without asking for either. A player nudging the ship with two quick taps would do
   * the same and read it as the ship running away from them. So the gesture is a real TAP-TAP: the
   * gap is measured from the RELEASE of the first press, and that first press must itself have
   * been short. Holding ◀, letting go, and pressing again is now steering, not a dash. */
  const DTAP = 0.22, TAP_MAX = 0.20;
  const tapT = { left: -9, right: -9 }, relT = { left: -9, right: -9 };
  let pend = { dash: 0, dashDir: 0, roll: 0, rollDir: 0 };
  const heldDir = () => (keys.ArrowRight || keys.d ? 1 : keys.ArrowLeft || keys.a ? -1 : 0);
  function wantDash(dir) { pend.dash = 1; pend.dashDir = dir || heldDir() || (G.ship.vx >= 0 ? 1 : -1); }
  function wantRoll() { pend.roll = 1; pend.rollDir = heldDir(); }
  addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].indexOf(e.key) >= 0) e.preventDefault();
    const k = e.key, lk = k.toLowerCase ? k.toLowerCase() : k;
    if (!e.repeat) {
      // double-tap detection, before the key is recorded as held
      const now = performance.now() * 0.001;
      const tap = (side, dir) => {
        if (now - relT[side] < DTAP && relT[side] - tapT[side] < TAP_MAX) wantDash(dir);
        tapT[side] = now;
      };
      if (k === 'ArrowLeft' || lk === 'a') tap('left', -1);
      else if (k === 'ArrowRight' || lk === 'd') tap('right', 1);
      if (lk === 'q') wantDash(-1);
      if (lk === 'e') wantDash(1);
      if (k === 'Shift' || lk === 'k' || lk === 'z') wantRoll();
    }
    keys[k] = true; if (k.toLowerCase) keys[lk] = true;
    if (lk === 'p') togglePause();
    if (lk === 'm') toggleSfx();
    if (lk === 'b') useBomb();
  });
  addEventListener('keyup', e => {
    const k = e.key, lk = k.toLowerCase ? k.toLowerCase() : k;
    const now = performance.now() * 0.001;
    if (k === 'ArrowLeft' || lk === 'a') relT.left = now;
    else if (k === 'ArrowRight' || lk === 'd') relT.right = now;
    keys[k] = false; if (k.toLowerCase) keys[lk] = false;
  });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  let touchFire = false, dragging = false;
  const stick = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
  const sB = $('stickBase'), sN = $('stickNub');
  function stickShow(x, y) { sB.style.display = 'block'; sN.style.display = 'block';
    sB.style.left = x + 'px'; sB.style.top = y + 'px'; sN.style.left = x + 'px'; sN.style.top = y + 'px'; }
  function stickHide() { sB.style.display = 'none'; sN.style.display = 'none'; stick.id = null; stick.x = 0; stick.y = 0; }
  ov.style.pointerEvents = 'auto';
  ov.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') { dragging = true; mouseSteer(e); return; }
    e.preventDefault();
    if (stick.id === null) { stick.id = e.pointerId; stick.cx = e.clientX; stick.cy = e.clientY; stick.x = 0; stick.y = 0; stickShow(e.clientX, e.clientY); }
  });
  ov.addEventListener('pointermove', e => { if (dragging && e.pointerType === 'mouse') mouseSteer(e); });
  addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' || e.pointerId !== stick.id) return;
    const R = 56, dz = 10; let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
    const m = Math.hypot(dx, dy); if (m > R) { const s = R / m; dx *= s; dy *= s; }
    stick.x = m < dz ? 0 : clamp(dx / R, -1, 1); stick.y = m < dz ? 0 : clamp(dy / R, -1, 1);
    sN.style.left = (stick.cx + dx) + 'px'; sN.style.top = (stick.cy + dy) + 'px';
  });
  function ptrEnd(e) { if (e.pointerType === 'mouse') { dragging = false; return; } if (e.pointerId === stick.id) stickHide(); }
  addEventListener('pointerup', ptrEnd); addEventListener('pointercancel', ptrEnd);
  /* Mouse steer is ABSOLUTE and it is why the handedness note above matters in practice: the x of
   * the cursor maps straight to the x of the ship with no sign flip anywhere. If that ever needs a
   * minus, the scene is mirrored — run `__rrpc._basis()` before changing this line. */
  let mouseX = null;
  function mouseSteer(e) { const r = ov.getBoundingClientRect(); mouseX = ((e.clientX - r.left) / r.width * 2 - 1) * F.X * 1.06; }
  function bindPad(el, dn, up) {
    if (!el) return;
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('on'); dn(); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => { el.classList.remove('on'); up(); }));
  }
  bindPad($('tFire'), () => { touchFire = true; }, () => { touchFire = false; });
  bindPad($('tBomb'), () => { useBomb(); }, () => {});
  /* ROLL on touch. The stick already owns the left thumb and FIRE the right, so the roll gets its
   * own pad rather than a gesture — a defensive move you have to discover is a defensive move
   * nobody uses. Direction comes from wherever the stick is pushed. */
  bindPad($('tRoll'), () => { pend.roll = 1; pend.rollDir = stick.x > 0.25 ? 1 : stick.x < -0.25 ? -1 : 0; }, () => {});

  function readInput() {
    input.left = !!(keys.ArrowLeft || keys.a); input.right = !!(keys.ArrowRight || keys.d);
    input.up = !!(keys.ArrowUp || keys.w); input.down = !!(keys.ArrowDown || keys.s);
    /* AUTOFIRE. Galaga is a hold-to-fire game and the rate limiter is in the simulation; making
     * the player mash for it just converts a pacing decision into a wrist injury. Space/click/pad
     * all hold, and the default is ON — you are always shooting unless you say otherwise. */
    input.fire = AUTOFIRE || !!keys[' '] || touchFire || dragging;
    if (stick.id !== null) { input.stick = true; input.sx = stick.x; input.sy = stick.y; }
    else if (mouseX !== null && dragging) { input.stick = true; input.sx = clamp((mouseX - G.ship.x) * 0.5, -1, 1); input.sy = 0; }
    else input.stick = false;
    // consume the pending edges exactly once per frame — see the note on wantDash/wantRoll
    input.dash = !!pend.dash; input.dashDir = pend.dashDir;
    input.roll = !!pend.roll; input.rollDir = pend.rollDir;
    pend.dash = 0; pend.roll = 0;
  }
  let AUTOFIRE = true;

  function useBomb() { if (RRGame.burn(G)) blip(180, 1400, 0.35, 'sawtooth', 0.2); }

  // ── SFX (the existing oscillator kit, unchanged in character) ───────────────────────────────
  let AC = null, sfxOn = true;
  const ac = () => AC || (AC = new (window.AudioContext || window.webkitAudioContext)());
  function blip(f0, f1, dur, type, vol) {
    if (!sfxOn) return;
    try { const a = ac(), o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(f0, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), a.currentTime + dur);
      g.gain.setValueAtTime(vol == null ? 0.14 : vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur); } catch (e) {}
  }
  function noise(dur, vol) {
    if (!sfxOn) return;
    try { const a = ac(), n = a.createBufferSource(), b = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const g = a.createGain(); g.gain.value = vol; n.buffer = b; n.connect(g).connect(a.destination); n.start(); } catch (e) {}
  }
  /* The old build's oscillator kit, kept in character — this cabinet's voice is the artist's, not
   * a sample pack. Driven off `G.ev`, which the simulation appends to and this drains once per
   * frame. ⚠ COALESCED: at 120 Hz the sim can queue a dozen 'fire' events between two frames, and
   * playing all of them is a buzz rather than a shot. One of each kind per frame, and the loudest
   * events win the frame. */
  function playEvents() {
    if (!G.ev.length) return;
    const seen = Object.create(null);
    for (const k of G.ev) seen[k] = (seen[k] || 0) + 1;
    G.ev.length = 0;
    if (seen.die) { noise(0.45, 0.4); blip(140, 38, 0.42, 'sawtooth', 0.22); blip(66, 30, 0.5, 'sine', 0.2); }
    else if (seen.rip) { blip(180, 1500, 0.5, 'sine', 0.16); blip(90, 40, 0.5, 'sawtooth', 0.14); }
    else if (seen.hurt) { noise(0.15, 0.26); blip(240, 60, 0.2, 'sawtooth', 0.16); }
    if (seen.dual) { blip(420, 1400, 0.22, 'triangle', 0.16); setTimeout(() => blip(700, 1900, 0.2, 'triangle', 0.14), 110); }
    if (seen.perfect) { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => blip(600 + i * 220, 1400 + i * 260, 0.16, 'square', 0.13), d)); }
    else if (seen.clear) { blip(520, 1400, 0.22, 'triangle', 0.12); setTimeout(() => blip(770, 1650, 0.14, 'triangle', 0.1), 90); }
    if (seen.wave) blip(280, 900, 0.26, 'sine', 0.11);
    if (seen.burn) { noise(0.4, 0.34); blip(180, 60, 0.35, 'sawtooth', 0.18); }
    if (seen.bigkill) { noise(0.3, 0.3); blip(300, 70, 0.28, 'sawtooth', 0.18); }
    else if (seen.divekill) { blip(1320, 380, 0.08, 'square', 0.12); noise(0.05, 0.14); }
    else if (seen.kill) { blip(1080, 340, 0.07, 'square', 0.10); noise(0.045, 0.11); }
    if (seen.ping) { blip(320, 120, 0.05, 'square', 0.07); }
    if (seen.pow) { blip(520, 900, 0.08, 'square', 0.14); setTimeout(() => blip(900, 1500, 0.1, 'square', 0.14), 70); }
    /* the movement kit. The ROLL is the loudest of the three on purpose — it is the defensive
     * read, and a defence you cannot hear is a defence you cannot time. */
    if (seen.overdrive) { [0,90,180].forEach((d,i)=>setTimeout(()=>blip(340+i*260, 1500+i*300, 0.18,'sawtooth',0.15), d)); }
    if (seen.roll) { blip(760, 210, 0.20, 'triangle', 0.15); noise(0.14, 0.16); }
    else if (seen.dash) { blip(520, 1180, 0.09, 'triangle', 0.10); }
    if (seen.regen) { blip(600, 1100, 0.12, 'sine', 0.09); }
    if (seen.bump) { blip(150, 70, 0.07, 'square', 0.07); }
    /* the shot is quieter than everything it might hit, on purpose: with autofire on it is the
     * most frequent sound in the game and it must not become the loudest thing in the mix. */
    if (seen.fire) { blip(940 + (Math.random() * 110 - 55), 190, 0.05, 'square', 0.055); }
    if (seen.efire) { blip(420, 150, 0.06, 'sawtooth', 0.05); }
  }

  const music = $('rrMusic'); let musicOn = true;
  function playMusic() { if (!musicOn) return; try { music.volume = 0.5; const p = music.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }

  // ── HUD overlay ─────────────────────────────────────────────────────────────────────────────
  const ovx = ov.getContext('2d');
  let OW = 0, OH = 0, ODPR = 1;
  function fit() {
    app.resizeCanvas();
    const r = canvas.getBoundingClientRect();
    ODPR = Math.min(window.devicePixelRatio || 1, DPRCAP);
    OW = Math.max(1, Math.round(r.width)); OH = Math.max(1, Math.round(r.height));
    ov.width = Math.round(OW * ODPR); ov.height = Math.round(OH * ODPR);
    ovx.setTransform(ODPR, 0, 0, ODPR, 0, 0);
  }
  addEventListener('resize', fit);
  fit();

  const _sp = new pc.Vec3();
  function toScreen(x, y, z) { _sp.set(x, y, z); return cam.camera.worldToScreen(_sp, _sp); }

  // ── drawing the simulation ──────────────────────────────────────────────────────────────────
  const stars = [];
  function seedStars() {
    stars.length = 0;
    for (let i = 0; i < QCFG.stars; i++) {
      stars.push({ x: (Math.random() * 2 - 1) * 17, y: (Math.random() * 2 - 1) * 12,
        z: -Math.random() * 90 - 2, pz: 0, v: 46 + Math.random() * 74, k: Math.random() });
    }
  }
  seedStars();

  /* The hue field, sampled at a grid VERTEX rather than at a cell centre — that is what lets the
   * quads share corner colours and interpolate into a continuous field instead of a tiled wall. */
  const _bgc = [0, 0, 0, 255];
  /* ⛔ THE BACKDROP WAS A WASH ACROSS THE WHOLE FRAME, AND IT ATE THE PLAYFIELD.
   *
   * It is a screen-filling colour field, which is what the brief asked for — but it was applied
   * FLAT, so the middle of the screen, where the ship and the divers and every bullet live, sat on
   * mid-tone saturated colour with nothing dark to read against. Measured at wave 7: blacks were
   * 21.4% of frame. Sprites in this game are thin bright streaks; they need a black field or they
   * read as confetti on a soup, which is exactly what the artist's screenshot shows.
   *
   * ⚑ The fix is a SURROUND, not a lower number. Colour belongs at the rim and the play column
   *   belongs dark — `DESIGN-SYSTEM.md` §5, "dark field, lit object" and "vignette inward". The
   *   field keeps its full chroma and its travelling lobes at the edges, where they are still the
   *   whole peripheral read, and falls to CFLOOR of that toward the centre.
   * ⚠ The ellipse is WIDER VERTICALLY (the 0.62 on v) because this is a vertical shooter: the
   *   action is a tall column, not a circle. A round falloff dimmed the top and bottom of the
   *   screen — where the formation enters and where the ship sits — while leaving the sides lit. */
  const CFLOOR = 0.20;
  function bgColour(u, v, t, hue0, boost, out) {
    const w = Math.sin(u * 5.1 + t * 0.7) * Math.cos(v * 4.3 - t * 0.53) * 0.5 + 0.5;
    const w2 = Math.sin((u + v) * 7.7 - t * 1.1) * 0.5 + 0.5;
    const ru = u * 2, rv = v * 2 * 0.62;
    const r2 = Math.min(1, ru * ru + rv * rv);
    const keep = CFLOOR + (1 - CFLOOR) * r2 * r2;      // r^4: holds the centre dark, lifts late
    const c = fx.hsl((hue0 + w * 150 + w2 * 60) % 360, 0.95,
      (0.045 + w * 0.075 + w2 * 0.035) * boost * keep);
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = 255;
    return out;
  }
  const _c0 = [0, 0, 0, 255], _c1 = [0, 0, 0, 255], _c2 = [0, 0, 0, 255], _c3 = [0, 0, 0, 255];
  function drawBackdrop(t) {
    /* A vertex-coloured field far behind everything: two travelling sine lobes over a hue that
     * drifts with the chain block and the wave. This is the "screen-filling colour" half of the
     * brief and it costs one opaque draw call. Deliberately generated rather than a texture — a
     * generated field can be moved by the game state, and this studio does not ship sampled art it
     * does not own anyway. */
    const CX = 19, CY = 14, Zb = -46, EX = 66, EY = 48;
    const hue0 = (G.market.hue + t * 8 + G.wave * 37) % 360;
    const boost = (G.phase === 'clear' ? 1.5 : 1) * BG_K;
    const du = 1 / (CX - 1), dv = 1 / (CY - 1);
    const hw = EX / (CX - 1) * 0.5, hh = EY / (CY - 1) * 0.5;
    for (let j = 0; j < CY - 1; j++) {
      for (let i = 0; i < CX - 1; i++) {
        const u0 = i * du - 0.5, v0 = j * dv - 0.5, u1 = u0 + du, v1 = v0 + dv;
        bgColour(u0, v0, t, hue0, boost, _c0);
        bgColour(u1, v0, t, hue0, boost, _c1);
        bgColour(u1, v1, t, hue0, boost, _c2);
        bgColour(u0, v1, t, hue0, boost, _c3);
        fx.gouraud(fx.B, fx.C_FLAT, (u0 + u1) * 0.5 * EX, (v0 + v1) * 0.5 * EY, Zb,
          hw, 0, 0, 0, hh, 0, _c0, _c1, _c2, _c3);
      }
    }
  }

  /* ⚑ THE WORLD HAS TO COME AT YOU. "Metal Slug on acid" is a statement about the SCREEN moving,
   * not just the ship, and the old scroll ran at 22–68 u/s with a wave multiplier that topped out
   * at 1.6 — a drift. The base rate is now roughly double, the wave ramp goes further, and — the
   * part that actually sells it — the rate SURGES with what the ship is doing: climbing, dashing
   * and overdrive all pull the field past you faster. That is speed you caused, which reads as
   * speed; a constant scroll is wallpaper however fast it goes.
   * `SURGE` is smoothed, because a starfield that steps rate discontinuously reads as a stutter. */
  let surge = 0;
  function scrollRate(dt) {
    const s = G.ship;
    const want = (G.mode === 'play' && s.alive)
      ? clamp(Math.abs(s.vy) * 0.05 + (s.dash > 0 ? 1.5 : 0) + (s.od > 0 ? 0.85 : 0) + (s.rollT > 0 ? 0.5 : 0), 0, 3.0)
      : 0;
    surge += (want - surge) * Math.min(1, dt * 7);
    return 1 + (G.mode === 'play' ? Math.min(2.4, G.wave * 0.12) : 0) + surge;
  }
  function drawStars(dt, t) {
    /* Streaks, not dots. The old build did the same thing in 2D and it was the best-looking part
     * of it; here the streak is a real ribbon in world space, so it foreshortens correctly as it
     * passes the camera instead of being stretched by a screen-space hack. */
    const sp = scrollRate(dt);
    /* ⛔ THE STREAK LENGTH MUST NOT BE THE FRAME DELTA, AND IT WAS. Drawing the ribbon from where
     *    the star was to where it is looks correct at 60 fps and is a bug everywhere else: the
     *    length is `v · dt · sp`, so at 5 fps (this container, SwiftShader) a 120 u/s star drew a
     *    **22-unit** white line across the entire frame. It was clearly visible in the first
     *    screenshot and it is exactly the class of defect CLAUDE.md keeps flagging — a renderer
     *    quantity that silently depends on frame rate. Doubling the base scroll rate made it worse,
     *    which is how it got found.
     *    The streak is now a fixed 0.055 s of travel, clamped, so it is the same length on a phone
     *    at 20 fps as on a desktop at 144 — and `stretch` is a deliberate multiplier on top of that
     *    rather than an accident of how long the last frame took. */
    const stretch = 1 + surge * (REDUCE ? 0.35 : 0.9);
    for (const s of stars) {
      s.z += s.v * dt * sp;
      if (s.z > CAM.z + 4) { s.z = -95; s.x = (Math.random() * 2 - 1) * 17; s.y = (Math.random() * 2 - 1) * 12; }
      const near = clamp((s.z + 95) / 95, 0, 1);
      const len = Math.min(3.4, s.v * 0.055 * sp * stretch);
      const c = fx.hsl(G.market.hue + s.k * 120, 0.6, 0.55 + near * 0.4);
      const a = (30 + near * 190) | 0;
      fx.ribbon(fx.A, fx.C_DOT, s.x, s.y, s.z - len, s.x, s.y, s.z,
        0.028 + near * 0.06, c[0], c[1], c[2], a);
    }
  }

  // rotation basis for a tumbling card: yaw (tumble) → pitch → roll, applied to right/up
  function cardBasis(yaw, pitch, roll, sz, out) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp2 = Math.sin(pitch),
      cr = Math.cos(roll), sr = Math.sin(roll);
    // right = Ry * Rx * Rz applied to (1,0,0); up likewise to (0,1,0)
    let rx = cr, ry = sr, rz = 0;
    let ux = -sr, uy = cr, uz = 0;
    // Rx (pitch)
    let t1 = ry * cp - rz * sp2, t2 = ry * sp2 + rz * cp; ry = t1; rz = t2;
    t1 = uy * cp - uz * sp2; t2 = uy * sp2 + uz * cp; uy = t1; uz = t2;
    // Ry (yaw / tumble)
    t1 = rx * cy + rz * sy; t2 = -rx * sy + rz * cy; rx = t1; rz = t2;
    t1 = ux * cy + uz * sy; t2 = -ux * sy + uz * cy; ux = t1; uz = t2;
    // cards are 2:3 — the half-width is 0.68 of the half-height, or they read as tiles
    out[0] = rx * sz * 0.68; out[1] = ry * sz * 0.68; out[2] = rz * sz * 0.68;
    out[3] = ux * sz; out[4] = uy * sz; out[5] = uz * sz;
    // face normal = right × up, used to decide which side you are looking at
    out[6] = out[1] * out[5] - out[2] * out[4];
    out[7] = out[2] * out[3] - out[0] * out[5];
    out[8] = out[0] * out[4] - out[1] * out[3];
    return out;
  }

  const _cb = new Array(9);
  function drawEnemies(t) {
    for (const e of G.enemies) {
      if (e.state === 'dead') continue;
      const K = RRGame.KIND[e.kind];
      const sz = K.sz * (e.kind === 2 ? 1.5 : 1.15);
      cardBasis(e.tumble, e.pitch, e.roll, sz, _cb);
      /* WHICH FACE IS TOWARD YOU. The card's normal against the view direction picks art or back.
       * Without this the back of a card shows its front mirrored, which reads as the texture being
       * wrong rather than as a card turning over — and a turning card is the entire visual idea. */
      const toCam = _cb[6] * (0 - e.x) + _cb[7] * (CAM.y - e.y) + _cb[8] * (CAM.z - e.z);
      const cell = toCam >= 0 ? (e.art % 12) : fx.C_BACK;
      /* ⚠ `e.hurt` is decayed in rrpc-game.js's tick, NOT here. It was decremented by 1/60 in this
       * draw loop first, which made the flash length a function of the frame rate and quietly put
       * a write to simulation state inside the renderer. */
      const hurt = e.hurt > 0 ? 1 : 0;
      const bright = e.state === 'dive' || e.state === 'beam' ? 255 : 205;
      const r = hurt ? 255 : bright, g = hurt ? 255 : bright, b = hurt ? 255 : bright;
      if (M.card) fx.oriented(fx.C, cell, e.x, e.y, e.z, _cb[0], _cb[1], _cb[2], _cb[3], _cb[4], _cb[5], r, g, b, 255);
      // aura — a diver's is much hotter, because the diver is what you are supposed to look at
      const diving = e.state === 'dive' || e.state === 'beam';
      /* ⚠ THE AURAS WERE EATING THE ARTWORK. At radius 1.5-2.4× the card and alpha 46/118 they
       * rendered as soft blobs with a card somewhere inside — visible immediately in the first
       * clean screenshot. These are trading cards; the art is the point. The aura is now a HALO
       * that sits just outside the silhouette, and only a DIVER gets a hot one, which also makes
       * "which of these is about to kill me" readable at a glance. */
      const c = fx.hsl(e.hue + (diving ? 0 : 40), 0.95, diving ? 0.62 : 0.42);
      const ar = sz * (diving ? 1.3 : 0.92) * (1 + 0.10 * Math.sin(t * 7 + e.id));
      if (M.aura) fx.billboard(fx.A, fx.C_DOT, e.x, e.y, e.z, ar, c[0], c[1], c[2], diving ? 58 : 20);
      if (e.kind === 2) {
        const rc = fx.hsl(310, 1, 0.6);
        fx.billboard(fx.A, fx.C_RING, e.x, e.y, e.z, sz * (2.2 + 0.3 * Math.sin(t * 5)), rc[0], rc[1], rc[2], 150);
      }
    }
  }

  function drawBullets(t) {
    for (const b of G.bullets) {
      if (!b.live) continue;
      const c = b.laser ? [255, 90, 220] : [255, 214, 90];
      /* a bolt is a ribbon along its own velocity. ⚠ 0.055 s was tuned at BOLT_V 16; at 30 u/s the
       * same coefficient draws a 1.65-unit capsule — three card-widths long — and a screen of them
       * reads as a solid wall rather than as bolts. 0.032 keeps the same apparent length as before. */
      fx.ribbon(fx.A, fx.C_DOT, b.x - b.vx * 0.032, b.y - b.vy * 0.032, b.z, b.x, b.y, b.z, 0.075, c[0], c[1], c[2], 255);
      fx.billboard(fx.A, fx.C_DOT, b.x, b.y, b.z, 0.20, c[0], c[1], c[2], 210);
    }
    for (const b of G.ebullets) {
      if (!b.live) continue;
      const c = fx.hsl(b.hue, 1, 0.62);
      fx.ribbon(fx.A, fx.C_DOT, b.x - b.vx * 0.05, b.y - b.vy * 0.05, b.z - b.vz * 0.05, b.x, b.y, b.z, 0.085, 255, 90, 110, 255);
      fx.billboard(fx.A, fx.C_DOT, b.x, b.y, b.z, 0.26, c[0], c[1], c[2], 235);
    }
  }

  function drawBeams(t) {
    /* THE RIP, drawn as a widening stack of rings rather than a solid cone. A solid cone hides
     * whatever is inside it, and the one thing the player must be able to see while being ripped
     * is their own ship. */
    for (const b of G.beams) {
      const e = b.e, k = clamp(b.t / 0.25, 0, 1), grab = clamp(b.hold / 0.55, 0, 1);
      for (let i = 0; i < 9; i++) {
        const u = i / 8, y = e.y - u * (e.y - F.SHIPY - 0.2);
        const w = (0.42 + u * 2.0) * k;
        const c = fx.hsl(300 + grab * 50 + i * 6 + t * 90, 1, 0.55 + grab * 0.25);
        fx.billboard(fx.A, fx.C_RING, e.x + (G.ship.x - e.x) * u * 0.25, y, e.z * (1 - u), w,
          c[0], c[1], c[2], (60 + grab * 130) | 0);
      }
    }
  }

  function drawPops(t) {
    for (const p of G.pops) {
      /* THE ROLL SHOCK. Drawn as a hard, fast-expanding ring that reaches exactly ROLL_SHOCK units
       * — the radius it actually clears — because a defensive effect whose drawn size disagrees
       * with its real size teaches the player the wrong distance and then punishes them for it. */
      if (p.shock) {
        const u = clamp(p.t / p.life, 0, 1), r = p.r * (0.25 + u * 0.95);
        const c = fx.hsl(168 + u * 60, 1, 0.72);
        fx.billboard(fx.A, fx.C_RING, p.x, p.y, p.z, r, c[0], c[1], c[2], ((1 - u) * 255) | 0);
        fx.billboard(fx.A, fx.C_RING, p.x, p.y, p.z, r * 0.72, 255, 255, 255, ((1 - u) * 150) | 0);
        continue;
      }
      if (!p.boom) continue;
      /* An explosion is a ring plus a scatter of embers. Both are one quad each; the whole point
       * of the batcher is that a 30-kill bomb costs 30× nothing. */
      const u = p.t / p.life, big = p.big ? 1.5 : 1;
      const c = fx.hsl(p.hue, 1, 0.62);
      fx.billboard(fx.A, fx.C_RING, p.x, p.y, p.z, (0.3 + u * 3.2) * big, c[0], c[1], c[2], ((1 - u) * 255) | 0);
      const n = p.big ? 14 : 7;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + p.t * 3, r = u * 2.4 * big;
        const cc = fx.hsl(p.hue + i * 24, 1, 0.66);
        fx.billboard(fx.A, fx.C_DOT, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.8, p.z + Math.sin(a * 2) * r * 0.5,
          0.22 * (1 - u) * big + 0.05, cc[0], cc[1], cc[2], ((1 - u) * 235) | 0);
      }
    }
  }

  function drawPows(t) {
    for (const p of G.pows) {
      if (!p.live) continue;
      const hue = p.type === 'gun' ? 48 : p.type === 'rapid' ? 174 : p.type === 'shield' ? 140 : 310;
      const c = fx.hsl(hue, 1, 0.62);
      fx.billboard(fx.A, fx.C_RING, p.x, p.y, p.z, 0.44 + 0.08 * Math.sin(t * 9), c[0], c[1], c[2], 235);
      fx.billboard(fx.A, fx.C_DOT, p.x, p.y, p.z, 0.30, c[0], c[1], c[2], 200);
    }
  }

  /* ── THE AFTERIMAGE ─────────────────────────────────────────────────────────────────────────
   * A ring buffer of recent ship positions, drawn as a fading additive ribbon whenever the ship is
   * doing something violent. This is PRESENTATION and it lives here, not in the simulation — the
   * split this file's header describes. ⚑ It is also the only way a 0.17 s dash is legible at all:
   * an impulse that moves you 4 units in a sixth of a second is, without a trail, a teleport. */
  const TRAIL_N = 14;
  const trail = []; let trailI = 0;
  for (let i = 0; i < TRAIL_N; i++) trail.push({ x: 0, y: 0, on: 0 });
  function pushTrail(s) {
    const hot = (s.dash > 0 ? 1 : 0) + (s.rollT > 0 ? 0.9 : 0) + (s.od > 0 ? 0.55 : 0)
      + clamp((Math.abs(s.vx) - 6) / 12, 0, 0.7);
    const p = trail[trailI = (trailI + 1) % TRAIL_N];
    p.x = s.x; p.y = s.y; p.on = clamp(hot, 0, 1);
  }
  function drawTrail(s) {
    for (let i = 1; i < TRAIL_N; i++) {
      const a = trail[(trailI + i) % TRAIL_N], b = trail[(trailI + i + 1) % TRAIL_N];
      const k = i / TRAIL_N;
      const on = Math.min(a.on, b.on);
      if (on <= 0.02) continue;
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 0.01) continue;
      const c = s.od > 0 ? fx.hsl(48 + k * 40, 1, 0.62) : fx.hsl(172 + k * 40, 1, 0.6);
      fx.ribbon(fx.A, fx.C_DOT, a.x, a.y, 0, b.x, b.y, 0, 0.10 + k * 0.16,
        c[0], c[1], c[2], (on * k * 190) | 0);
    }
  }

  function drawShip(t) {
    const s = G.ship;
    const rigs = s.dual ? [[craft, -0.62], [craft2, 0.62]] : [[craft, 0]];
    craft2.enabled = !!s.dual && s.alive;
    craft.enabled = s.alive;
    if (s.alive) { pushTrail(s); drawTrail(s); }
    if (!s.alive) {
      // the captive, parked in the ripper's slot: your ship, held, visibly waiting to be fetched
      if (G.captive && G.ripper) {
        const e = G.ripper;
        const c = fx.hsl(180, 0.9, 0.6);
        fx.billboard(fx.A, fx.C_DOT, e.x, e.y + 0.9, e.z, 0.5 + 0.1 * Math.sin(t * 6), c[0], c[1], c[2], 200);
      }
      return;
    }
    /* ⚠ ONLY THE RESPAWN BLINK BLINKS. `s.iframe` (dash/roll) deliberately does not: the roll is a
     * 0.42 s read the player has to be able to SEE, and strobing the ship through it would hide
     * the exact frames it exists for. The two invulnerabilities are two things — see rrpc-game.js. */
    const blink = s.inv > 0 && (((t * 12) | 0) % 2 === 0);
    const spinDeg = s.spin * 180 / Math.PI;
    for (const [ent, off] of rigs) {
      ent.setPosition(s.x + off, s.y, 0);
      /* the BARREL ROLL is a rotation about the craft's own nose axis, which is world +z here —
       * the same axis the bank already uses, so the two simply add and a roll begun mid-turn
       * carries the turn through it instead of snapping upright first. */
      ent.setEulerAngles(s.pitch * 26, 0, s.roll * 40 + spinDeg);
      ent.setLocalScale(0.62, 0.62, 0.62);
      ent.enabled = !blink;
      // thruster — it flares with thrust, and goes amber in overdrive
      const boost = (s.dash > 0 ? 1.7 : 1) * (s.od > 0 ? 1.35 : 1) * (input.up ? 1.2 : 1);
      const th = (0.34 + 0.16 * Math.random() + (input.fire ? 0.06 : 0)) * boost;
      const c = s.od > 0 ? fx.hsl(46 + Math.sin(t * 26) * 16, 1, 0.68) : fx.hsl(168 + Math.sin(t * 20) * 30, 1, 0.66);
      fx.billboard(fx.A, fx.C_DOT, s.x + off, s.y - 0.62, 0, th, c[0], c[1], c[2], 235);
      fx.billboard(fx.A, fx.C_DOT, s.x + off, s.y - 1.05, 0, th * 1.5, 90, 250, 255, 96);
      /* i-frame shell. The one piece of UI that has to be unmistakable: "that would have hit you
       * and it did not". A ring, not a fill — it must not hide the ship inside it. */
      if (s.iframe > 0) {
        const k = clamp(s.iframe / RRGame.SHIP.ROLL_I, 0, 1);
        const ic = fx.hsl(172, 1, 0.7);
        fx.billboard(fx.A, fx.C_RING, s.x + off, s.y, 0, 0.72 + (1 - k) * 0.5, ic[0], ic[1], ic[2], (210 * k) | 0);
      }
      if (s.od > 0) {
        const oc = fx.hsl(46, 1, 0.62);
        fx.billboard(fx.A, fx.C_RING, s.x + off, s.y, 0, 0.95 + 0.09 * Math.sin(t * 13), oc[0], oc[1], oc[2], 130);
      }
    }
    // the staked card, plated flat on the dorsal deck — the deck you brought, visibly aboard
    const cardCell = 0;
    fx.oriented(fx.C, cardCell, s.x, s.y + 0.02, 0.16, 0.20, 0, 0, 0, 0.30, -0.06, 235, 235, 235, 235);
    if (G.muzzle > 0) {
      const m = G.muzzle;
      for (const [, off] of rigs) fx.billboard(fx.A, fx.C_DOT, s.x + off, s.y + 0.62, 0, 0.32 * m, 255, 250, 210, (220 * m) | 0);
    }
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────────────────────
  function hud(t) {
    ovx.clearRect(0, 0, OW, OH);
    if (G.mode === 'gate') return;
    ovx.save();
    ovx.textBaseline = 'middle';
    // score pops, projected from world space
    for (const p of G.pops) {
      if (!p.txt) continue;
      const sp = toScreen(p.x, p.y, p.z);
      if (sp.z < 0) continue;
      const u = p.t / p.life, a = clamp(1 - u, 0, 1);
      ovx.globalAlpha = a;
      ovx.font = '900 ' + (p.big ? 22 : 15) + 'px Arial Black, Arial, sans-serif';
      ovx.textAlign = 'center';
      ovx.fillStyle = p.big ? '#ffd23b' : '#eafff2';
      ovx.strokeStyle = 'rgba(0,0,0,.85)'; ovx.lineWidth = 3.5;
      ovx.strokeText(p.txt, sp.x, sp.y - u * 24);
      ovx.fillText(p.txt, sp.x, sp.y - u * 24);
    }
    ovx.globalAlpha = 1;
    ovx.restore();
  }

  // ── the frame ───────────────────────────────────────────────────────────────────────────────
  /* ⚠ A "HELD" FRAME WAS NOT HELD. Pausing the simulation freezes the enemies but the RENDER clock
   * kept running — the starfield still flowed, the backdrop hue still drifted — so two consecutive
   * measurements of the same settings differed by more than the effect being measured, and a
   * tonemapper A/B swung by 15 RMS between runs. CLAUDE.md's rule for the 3D card applies exactly:
   * A/B through the same path, and do not believe an absolute number off one frame. `_freezeT`
   * pins the render clock and stops the starfield so a sweep varies ONE thing. */
  let FROZEN = null;
  let camFov = CAM.fov;
  /* ⚠ NEITHER OF THESE EXISTED IN THE ENGINE BUILD, and the new movement system is what made the
   * first one matter: a dash now punches the FOV and a roll spins the ship, which are exactly the
   * two things a vestibular-sensitive player asked not to be given.
   * CLAUDE.md's rule is "still lit, not switched off" — the game plays identically, keeps its
   * colour and keeps its speed lines; what goes is the CAMERA moving (shake and lens punch), which
   * is decoration the simulation never reads. */
  const REDUCE = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  /* pause when the tab goes away: the clamp on dt already stops the world teleporting, but an
   * arcade cabinet you cannot see should not be taking your lives while you read your email. */
  addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'play') togglePause();
  });
  let fpsWin = [], lastT = performance.now();
  const HOLD = on('hold', false);
  app.on('update', dtRaw => {
    const now = performance.now();
    const raw = now - lastT;
    const dt = Math.min(0.25, raw / 1000); lastT = now;
    /* ⚠ RECORD THE TRUE FRAME TIME, NOT THE CLAMPED ONE. `dt` is clamped to 0.25 s so a
     * background tab cannot teleport the simulation; pushing the CLAMPED value into the fps
     * window meant every frame slower than 250 ms reported as exactly 250.0 ms. A quality-tier
     * sweep in this container returned 250.0 for six of nine readings and looked like data. */
    fpsWin.push(raw); if (fpsWin.length > 120) fpsWin.shift();
    const t = FROZEN != null ? FROZEN : now * 0.001;

    readInput();
    if (!HOLD) RRGame.step(G, FROZEN != null ? 0 : dt, input);
    playEvents();
    if (G.mode === 'over' && !overShown) showOver();

    // camera: a shake and a gentle push toward the action. Never a roll — this is a fixed cabinet
    // and rolling the world in a game where left means left is how you lose the player.
    const sh = G.shake * (REDUCE ? 0 : 0.006);
    const drift = clamp(G.ship.x * 0.055, -0.5, 0.5);
    cam.setPosition(drift + (Math.random() - 0.5) * sh, CAM.y + (Math.random() - 0.5) * sh,
      CAM.z + (G.phase === 'entry' ? 1.4 : 0) * clamp(1 - G.phaseT, 0, 1));
    /* ⚑ FOV PUNCH. Widening the lens during a dash or overdrive is the oldest speed trick there is
     * and it costs one lerp: the periphery accelerates outward faster than the centre, so the same
     * scroll rate reads as more. Kept small (42° → ~46°) and SMOOTHED — an fov that steps is a
     * visible pop, and a big one is nausea. It is a lens change, never a roll or a shake. */
    const wantFov = CAM.fov + (!REDUCE && G.mode === 'play' && G.ship.alive
      ? (G.ship.dash > 0 ? 4.2 : 0) + (G.ship.od > 0 ? 1.8 : 0) + clamp((Math.abs(G.ship.vx) - 7) * 0.22, 0, 1.6) : 0);
    camFov += (wantFov - camFov) * Math.min(1, dt * 9);
    cam.camera.fov = camFov;

    fx.begin();
    fx.setCamBasis(cam);
    /* ⚑ LAYER MASKS. CLAUDE.md's standing rule is ISOLATE BEFORE TUNING — switching one thing off
     * at a time is what proved the 3D card's wash was not the lighting. `__rrpc._mask('aura',0)`
     * and friends exist so a headless check can answer "which of these is the bright blob" in one
     * step instead of by argument. Everything defaults on; this costs one boolean per layer. */
    if (M.bg) drawBackdrop(t);
    if (M.stars) drawStars(dt, t);
    if (M.enemies) drawEnemies(t);
    if (M.pops) drawPops(t);
    if (M.beams) drawBeams(t);
    if (M.bullets) drawBullets(t);
    if (M.pows) drawPows(t);
    if (M.ship) drawShip(t);
    /* the hit/burn flash. A quad just in front of the camera in the ADDITIVE layer, so it lifts the
     * frame rather than veiling it — a dark alpha overlay would hide the thing that just hit you,
     * which is the one moment you need to see. */
    if (M.flash && G.flash > 0.01) {
      const k = G.flash, c = fx.hsl(G.market.hue + 300, 1, 0.5);
      const cz = CAM.z - 0.6, hh = Math.tan(CAM.fov * Math.PI / 360) * 0.6, hw = hh * (OW / Math.max(1, OH));
      fx.oriented(fx.A, fx.C_FLAT, 0, CAM.y, cz, hw * 1.3, 0, 0, 0, hh * 1.3, 0,
        c[0], c[1], c[2], (k * 90) | 0);
    }
    fx.end();

    if (ditherOn) { try { app.graphicsDevice.scope.resolve('rrGrainT').setValue(t); } catch (e) {} }
    hud(t);
    paintDom();
  });

  // ── DOM HUD (text is sharper on the DOM than in a texture, same split section9 uses) ─────────
  const dom = { score: $('hScore'), wave: $('hWave'), chain: $('hChain'), lives: $('hLives'),
    wx: $('hWx'), msg: $('powMsg'), big: $('flashBlk'), gun: $('hGun'),
    shield: $('hShield'), flow: $('hFlow') };
  let lastMsg = '', lastBig = '';
  function paintDom() {
    if (!dom.score) return;
    /* ⚑ SHIELDS AND FLOW ARE ON THE HUD BECAUSE A MECHANIC YOU CANNOT SEE DOES NOT EXIST. The
     * whole survivability fix is "a hit costs a pip, not a life" — if the pips are invisible the
     * player still reads every hit as a near-death and the game still FEELS like the one that was
     * killing them. Same argument the chain display already carries in the HUD CSS. */
    if (dom.shield) {
      const s = G.ship;
      dom.shield.innerHTML = '◈'.repeat(Math.max(0, s.shield)) + '<span style="opacity:.28">'
        + '◈'.repeat(Math.max(0, s.shieldMax - s.shield)) + '</span>'
        + (s.iframe > 0 ? ' <span style="color:#27f7e4">⟡</span>' : '');
      dom.shield.style.color = s.shield > 1 ? '#27f7e4' : s.shield === 1 ? '#ffd23b' : '#ff6b57';
    }
    if (dom.flow) {
      const s = G.ship;
      if (s.od > 0) { dom.flow.innerHTML = '⚡ OVERDRIVE <small>' + s.od.toFixed(1) + 's</small>'; dom.flow.style.color = '#ffd23b'; }
      else if (s.flow > 0) { dom.flow.innerHTML = '» flow <b>' + s.flow + '</b>/' + RRGame.SHIP.FLOW_OD; dom.flow.style.color = '#2bff80'; }
      else if (s.odCd > 0) { dom.flow.innerHTML = '<small>overdrive charging ' + s.odCd.toFixed(0) + 's</small>'; dom.flow.style.color = '#6fdca0'; }
      else { dom.flow.innerHTML = '<small>dash·roll to build flow</small>'; dom.flow.style.color = '#4f9a72'; }
    }
    dom.score.textContent = Math.floor(G.score).toLocaleString('en-US');
    dom.wave.innerHTML = 'wave <b>' + G.wave + '</b> · ' + (G.alive || 0) + ' up · ' + (G.diving || 0) + ' diving';
    dom.chain.innerHTML = '×' + G.mult + ' <small>chain ' + G.chain + '</small>';
    dom.chain.style.color = G.mult >= 4 ? '#ff2ad9' : G.mult >= 2 ? '#ffd23b' : '#2bff80';
    dom.lives.textContent = '◆'.repeat(Math.max(0, Math.min(6, G.lives)))
      + (G.ship.dual ? ' ⧉⧉' : '') + (G.bombs > 0 ? '  ✸' + G.bombs : '');
    dom.gun.innerHTML = '⚙ ' + RRGame.GUNS[clamp(G.ship.gun - 1, 0, RRGame.GUNS.length - 1)].name
      + (G.ship.rapid > 0 ? ' <span style="color:#27f7e4">»rapid</span>' : '');
    dom.wx.innerHTML = '◉ <span class="blk">block ' + (G.market.block ? G.market.block.toLocaleString('en-US') : '—') + '</span> · <b>' + G.market.weather + '</b>';
    if (G.msgT > 0 && G.msg !== lastMsg) { lastMsg = G.msg; dom.msg.textContent = G.msg;
      dom.msg.classList.remove('go'); void dom.msg.offsetWidth; dom.msg.classList.add('go'); }
    if (G.bigMsgT > 0 && G.bigMsg !== lastBig) { lastBig = G.bigMsg; dom.big.textContent = G.bigMsg;
      dom.big.classList.remove('go'); void dom.big.offsetWidth; dom.big.classList.add('go'); }
  }

  // ── start / over / leaderboard ──────────────────────────────────────────────────────────────
  let overShown = false;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function lbLoad() { try { return JSON.parse(localStorage.getItem('urm_rr_scores') || '[]'); } catch (e) { return []; } }
  function lbSave(a) { try { localStorage.setItem('urm_rr_scores', JSON.stringify(a.slice(0, 10))); } catch (e) {} }
  function getName() { try { return (localStorage.getItem('urm_net_handle') || 'RIPPER').slice(0, 14) || 'RIPPER'; } catch (e) { return 'RIPPER'; } }
  function lbRender(el, hi) {
    if (!el) return;
    const a = lbLoad();
    if (!a.length) { el.innerHTML = '<div class="lb-hd">top rippers</div><div class="lb-row"><span class="lb-rank">—</span><span class="lb-nm">be the first to sign</span><span class="lb-sc"></span></div>'; return; }
    el.innerHTML = '<div class="lb-hd">top rippers</div>' + a.map((e, i) =>
      '<div class="lb-row' + (i === hi ? ' me' : '') + '"><span class="lb-rank">' + (i + 1) + '</span><span class="lb-nm">'
      + esc(e.name) + '</span><span class="lb-sc">' + (e.score || 0).toLocaleString('en-US') + '</span></div>').join('');
  }
  lbRender($('lbGate'), -1);

  function startGame(staked) {
    overShown = false;
    RRGame.start(G, staked);
    seedStars();
    $('ovStart').classList.remove('show'); $('ovOver').classList.remove('show');
    $('hudTR').style.display = 'block'; $('toggles').style.display = 'flex'; $('controls').style.display = 'flex';
    playMusic(); blip(280, 1200, 0.3, 'sine', 0.1);
  }
  function showOver() {
    overShown = true;
    try { music.pause(); } catch (e) {}
    const e = { name: getName(), score: Math.floor(G.score), wave: G.wave, chain: G.bestChain, ts: Date.now() };
    const list = lbLoad(); list.push(e); list.sort((x, y) => y.score - x.score);
    const top = list.slice(0, 10); lbSave(top);
    const idx = top.indexOf(e);
    const best = top.length ? top[0].score : e.score;
    $('overScore').textContent = e.score.toLocaleString('en-US');
    $('overBest').textContent = best.toLocaleString('en-US');
    const acc = G.shots ? Math.round(G.hits / G.shots * 100) : 0;
    $('overTag').textContent = idx === 0 ? '★ NEW HIGH SCORE ★' : idx >= 0 ? ('you made #' + (idx + 1) + ' on the board') : 'the formation got you';
    $('overStats').innerHTML = 'wave <b>' + G.wave + '</b> · best chain <b>' + G.bestChain + '</b> · accuracy <b>' + acc + '%</b>';
    lbRender($('lbOver'), idx); lbRender($('lbGate'), -1);
    const ni = $('lbName');
    if (ni) { ni.value = getName();
      ni.oninput = () => { const v = (ni.value || '').trim().slice(0, 14) || 'RIPPER';
        if (idx >= 0) { top[idx].name = v; lbSave(top); }
        try { localStorage.setItem('urm_net_handle', v); } catch (er) {}
        lbRender($('lbOver'), idx); lbRender($('lbGate'), -1); }; }
    $('hudTR').style.display = 'none'; $('toggles').style.display = 'none'; $('controls').style.display = 'none';
    $('ovOver').classList.add('show');
    noise(0.45, 0.4); blip(140, 38, 0.4, 'sawtooth', 0.2);
  }

  const ANTE = 25;
  function refreshGate() {
    const note = $('startNote'), Wt = window.RipWallet;
    if (!note) return;
    if (!(Wt && Wt.isLive())) { note.innerHTML = '$3030 isn’t live here yet — launches run in <b>practice</b>.'; const b = $('btnBurn'); if (b) b.style.display = 'none'; }
    else if (Wt && !Wt.hasWallet()) note.innerHTML = 'No wallet found — <b>practice</b> only. Install MetaMask to pay the fee.';
    // ⚠ NOT a burn — the launch fee funds the studio in full (artist directive). Saying "burn"
    //   here would be the one thing the whole treasury change exists to avoid: a claim about
    //   where a collector's tokens went that isn't true.
    else note.innerHTML = 'Launch fee: <b>25 $3030</b> to the studio — this one funds the shop, it doesn’t burn.';
  }
  async function launch(paid) {
    if (!paid) { startGame(false); return; }
    const Wt = window.RipWallet;
    if (!(Wt && Wt.isLive() && Wt.hasWallet())) { startGame(false); return; }
    const r = await Wt.payTreasury(ANTE);          // 100% to the studio — a fee, not a burn
    if (!r.ok) { toast(Wt.explain(r.reason)); return; }
    startGame(true);
  }
  function toast(msg) {
    let t = $('rrToast');
    if (!t) { t = document.createElement('div'); t.id = 'rrToast';
      t.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:20;background:rgba(2,10,6,.95);border:1px solid #0f5c33;border-radius:10px;padding:10px 16px;font-size:12px;color:#d9ffe9';
      document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.style.opacity = '0'; }, 3000);
  }
  ['btnBurn', 'btnAgain'].forEach(id => { const b = $(id); if (b) b.onclick = () => launch(true); });
  ['btnPractice', 'btnAgainP'].forEach(id => { const b = $(id); if (b) b.onclick = () => launch(false); });
  if (window.RipWallet) window.RipWallet.on(refreshGate);
  refreshGate();

  function togglePause() {
    if (G.mode === 'play') { G.mode = 'pause'; try { music.pause(); } catch (e) {} $('tgPause').textContent = '▶ resume'; }
    else if (G.mode === 'pause') { G.mode = 'play'; playMusic(); $('tgPause').textContent = '⏸ pause'; }
  }
  function toggleSfx() { sfxOn = !sfxOn; $('tgSfx').classList.toggle('off', !sfxOn); }
  function toggleMusic() { musicOn = !musicOn; $('tgMusic').classList.toggle('off', !musicOn); if (musicOn && G.mode === 'play') playMusic(); else try { music.pause(); } catch (e) {} }
  function toggleAuto() { AUTOFIRE = !AUTOFIRE; $('tgAuto').classList.toggle('off', !AUTOFIRE); }
  if ($('tgPause')) $('tgPause').onclick = togglePause;
  if ($('tgSfx')) $('tgSfx').onclick = toggleSfx;
  if ($('tgMusic')) $('tgMusic').onclick = toggleMusic;
  if ($('tgAuto')) $('tgAuto').onclick = toggleAuto;

  app.start();

  // ── verification hooks ──────────────────────────────────────────────────────────────────────
  /* `window.__rr` is a COMPATIBILITY VIEW deliberately shaped like the classic build's internals,
   * so the same pacing probe measures both builds and a before/after is an actual comparison
   * rather than two different measurements put side by side. */
  window.__rr = {
    get G() {
      return { t: G.t, mode: G.mode, score: G.score, dist: G.dist, shields: G.lives,
        obs: G.enemies.filter(e => e.state !== 'dead'), shots: G.bullets.filter(b => b.live),
        eshots: G.ebullets.filter(b => b.live), pows: G.pows,
        boss: G.ripper && G.ripper.state !== 'dead' ? G.ripper : null };
    },
    market: G.market, raw: G,
  };
  window.__rrpc = {
    app, cam, fx, G, POST, TIER,
    counts: () => fx.counts(),
    fps: () => { const s = fpsWin.slice().sort((a, b) => a - b); return { med: s[s.length >> 1], mean: fpsWin.reduce((x, y) => x + y, 0) / (fpsWin.length || 1), n: fpsWin.length }; },
    start: staked => startGame(staked),
    /* ⚑ THE HANDEDNESS CHECK. Three known world points through the live camera. This is the test
     * that Section 9's port did not have, and CLAUDE.md records that its absence cost three
     * separate bug reports for one defect. Run it first if input ever disagrees with the picture. */
    _basis() {
      const p = new pc.Vec3();
      const c = cam.camera.worldToScreen(p.set(0, 0, 0), new pc.Vec3());
      const rgt = cam.camera.worldToScreen(p.set(1, 0, 0), new pc.Vec3());
      const up = cam.camera.worldToScreen(p.set(0, 1, 0), new pc.Vec3());
      const near = cam.camera.worldToScreen(p.set(1, 0, 1), new pc.Vec3());
      const far = cam.camera.worldToScreen(p.set(1, 0, -1), new pc.Vec3());
      return {
        rightIsRight: rgt.x > c.x, upIsUp: up.y < c.y,     // screen y grows downward
        nearIsBigger: Math.abs(near.x - c.x) > Math.abs(far.x - c.x),
        centre: { x: +c.x.toFixed(1), y: +c.y.toFixed(1) },
        right: { x: +rgt.x.toFixed(1), y: +rgt.y.toFixed(1) },
        up: { x: +up.x.toFixed(1), y: +up.y.toFixed(1) },
        nearDx: +(near.x - c.x).toFixed(1), farDx: +(far.x - c.x).toFixed(1),
      };
    },
    _post(k, v) { if (!frame) return null; try { const parts = k.split('.'); let o = frame; while (parts.length > 1) o = o[parts.shift()]; o[parts[0]] = v; frame.update(); return true; } catch (e) { return e.message; } },
    _tone(v) { if (!frame) return null; frame.rendering.toneMapping = v; frame.update(); return v; },
    _bloom(v) { if (!frame) return null; frame.bloom.intensity = v; frame.update(); return v; },
    _sharp(v) { if (!frame) return null; frame.rendering.sharpness = v; frame.update(); return v; },
    _bg(v) { BG_K = v; return v; },
    _mask(k, v) { if (k in M) M[k] = v ? 1 : 0; return Object.assign({}, M); },
    /* pin the render clock (and stop the starfield) so a post sweep varies exactly one thing.
     * `_freezeT(null)` resumes. */
    _freezeT(v) { FROZEN = (v == null ? null : (v === true ? performance.now() * 0.001 : v)); return FROZEN; },
    _addi(v) { fx.addMat.emissiveIntensity = v; fx.addMat.update(); return v; },
    _cardi(v) { fx.cardMat.emissiveIntensity = v; fx.cardMat.update(); return v; },
    _blur(v) { if (!frame) return null; frame.bloom.blurLevel = v; frame.update(); return v; },
    _sat(v) { if (!frame) return null; frame.grading.saturation = v; frame.update(); return v; },
    /* read the real frame. CLAUDE.md: judge COLOUR from a readback, never from a screenshot in
     * this container — the screenshot path rotates hue on canvas content. Needs ?grab=1. */
    _px() {
      const gl = app.graphicsDevice.gl, W = canvas.width, H = canvas.height;
      const px = new Uint8Array(W * H * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let n = 0, sum = 0, sq = 0, blk = 0, clip = 0, sat = 0;
      const lum = new Float64Array(W * H);
      for (let i = 0; i < W * H; i++) {
        const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        lum[i] = L; sum += L; sq += L * L; n++;
        if (L < 12) blk++;
        if (r > 250 && g > 250 && b > 250) clip++;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx > 0 ? (mx - mn) / mx : 0;
      }
      const mean = sum / n, rms = Math.sqrt(Math.max(0, sq / n - mean * mean));
      let edge = 0, en = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        edge += Math.abs(4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - W] - lum[i + W]); en++;
      }
      return { luma: +mean.toFixed(1), rms: +rms.toFixed(1), blacks: +(blk / n * 100).toFixed(2),
        clipped: +(clip / n * 100).toFixed(3), sat: +(sat / n * 100).toFixed(1), edge: +(edge / en).toFixed(2) };
    },
  };
})();

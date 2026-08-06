/* ripmaster3030studios — RIP ROCKETER on PlayCanvas: the driver (RRPC).
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
 * (`riprocketer-classic.html` was the previous hand-rolled 2D-canvas build; REMOVED 2026-08-02,
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
  /* ⛔ THE TIER IS NOT THE PIXEL RATIO. `dprCap()` ends in `Math.max(1, Math.min(dpr, cap))`, so
   *    on ANY 1× display it returns exactly 1 however strong the machine is, and the old line
   *        const AUTO_TIER = DPRCAP >= 2 ? 'high' : (DPRCAP >= 1.5 ? 'mid' : 'low');
   *    therefore hard-selected `low` on every ordinary desktop monitor — `mid` and `high` were
   *    unreachable without `?q=`. Measured on an emulated 1×/8-core/8 GB desktop: that formula →
   *    'low', deviceTier() → 'high'. This is failure #1 in scripts/test-s9cast.mjs, fixed for
   *    Section 9 and left standing here. DPRCAP stays: it is still right for the BACKING STORE. */
  const AUTO_TIER = (window.GfxPost && GfxPost.deviceTier) ? GfxPost.deviceTier() : 'mid';
  let TIER = Q.get('q') || AUTO_TIER;
  if (['low', 'mid', 'high'].indexOf(TIER) < 0) TIER = AUTO_TIER;
  const TIERS = {
    /* ⚑ `far` AND `lamps` ARE ON THE QUALITY LADDER, NOT ON THE RESOLUTION ONE. CLAUDE.md records
     * Section 9's finding that `ADAPT` "could not reach any of it" because it only scaled the
     * backing store while the frame was bound by passes it could not shrink — the fix was to make
     * quality a LADDER (features first, resolution last). The facade is the game's structure and it
     * stays at every tier; the far silhouette is a second screen-filling opaque layer and the wall
     * lamps are dozens of additive quads, and both are the first things a weak device should not
     * pay for. Dropping them costs the picture a parallax layer, not the level. */
    high: { rtScale: 1.0, stars: 420, bloom: true, fringing: true, dither: true, bg: 48, far: true, lamps: true, smear: 9 },
    mid: { rtScale: 0.85, stars: 260, bloom: true, fringing: true, dither: true, bg: 32, far: true, lamps: true, smear: 5 },
    low: { rtScale: 0.7, stars: 140, bloom: true, fringing: false, dither: false, bg: 18, far: false, lamps: false, smear: 0 },
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
    /* ⚑ SHUTTER ANGLE, and it is a real photographic quantity rather than a blur "amount": the
     * fraction of each frame the shutter is open. Film's standard is 180°, i.e. 0.5, which is
     * why cinema motion looks the way it does — and it is the value that makes the smear the
     * TRUE exposure integral instead of a number picked to taste. Above ~0.7 the frame reads as
     * dragging (the shutter is open nearly the whole frame and nothing is ever sharp); at 0 the
     * smear is off entirely and the compose chunk skips the taps. `?shutter=N` to sweep it. */
    shutter: num('shutter', 0.5),
    /* the mix ceiling. Even at full smear a little of the sharp frame is kept: a completely
     * smeared frame during OVERDRIVE is one you cannot read, and this game asks you to read
     * bullets while moving fastest. Swept against nothing — this is a legibility floor, not a
     * measurement, and it is stated as such. */
    smearMax: num('smearmax', 0.82),
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
    installCompose();
  }
  /* Dither + grain, injected exactly as s9pc-app.js does: PlayCanvas's compose pass has neither,
   * and GfxPost's 8×8 Bayer at 0.0045 (≈1.1/255) is what kills banding in a dark gradient — which
   * this game is almost entirely made of. `composeMainEndPS` runs after the vignette and BEFORE
   * gammaCorrectOutput, so the value is still linear and has to be round-tripped through an
   * approximate display curve to put the ±½ LSB where the banding actually is. */
  /* ── ⚑ CAMERA MOTION BLUR RIDES IN THE SAME CHUNK, AND IT HAS TO ────────────────────────────
   * `composeMainEndPS` is ONE slot. `chunks.set` REPLACES, so installing a smear chunk and a
   * dither chunk separately means the second one silently deletes the first — no error, no
   * warning, and the symptom is "the feature I just wrote does nothing", which is this repo's
   * single most-repeated failure. One chunk, both effects, each gated by its own uniform.
   *
   * ⚑ WHY THE SMEAR IS EXACT RATHER THAN A STYLE FILTER. Motion blur is not a look, it is the
   *   exposure integral: the shutter is open for a fraction of the frame and whatever moved
   *   across the sensor in that time is summed. So the offset is not tuned — it is literally
   *   HOW FAR THE CAMERA MOVED THIS FRAME, in UV, times the shutter angle. No divide by dt, no
   *   velocity buffer, and it is **exactly zero when the camera is still** rather than
   *   approximately zero, which is what makes it assertable.
   * ⛔ IT IS CAMERA BLUR, NOT OBJECT BLUR, AND THAT LINE IS DELIBERATE. Per-object smear needs a
   *   velocity buffer, and a velocity buffer means `prepassEnabled = true` — the scene renders
   *   TWICE. CLAUDE.md records that exact flag as the whole of Section 9's frame-rate cliff
   *   (low→mid +88%). Camera blur needs no prepass and is EXACT for every pixel, because a
   *   camera that translates or zooms smears the entire frame uniformly whatever is in it. The
   *   honest cost: the scrolling facade does not smear on its own. Stated, not hidden.
   * ⚑ THE RADIAL TERM IS THE FOV PUNCH'S OWN DERIVATIVE. The dash already widens the lens
   *   42° → 46.2°; a widening lens pushes every point outward from the centre, so its rate IS a
   *   radial screen velocity. The dash gets a zoom-smear for free, derived from a number that
   *   was already there rather than from a second knob invented to look fast.
   * ⚠ Bloom is NOT smeared — it is applied to `result` before this chunk runs. Physically the
   *   glow should come off the blurred image, but bloom is a wide isotropic blur and is very
   *   nearly invariant under a short directional one, so the error is small and one-directional.
   *   Sampling order here matches main(): grade, then tonemap, so the taps land in the same
   *   colour space as `result` and a zero-length smear cannot tint the frame. */
  const SMEAR_TAPS = QCFG.smear | 0;
  const COMPOSE_CHUNK = [
    'float rr_h(vec2 p){ return fract(sin(dot(p, vec2(41.0, 289.0))) * 43758.5453); }',
    'float rr_bayer(vec2 p){ vec2 t = floor(mod(p, 8.0)); float b = 0.0, s = 1.0;',
    '  for (int i = 0; i < 3; i++) { vec2 f = floor(mod(t, 2.0)); b += s * (f.x + 2.0 * mod(f.x + f.y, 2.0)); s *= 4.0; t = floor(t * 0.5); }',
    '  return b / 64.0; }',
    'uniform float rrDither; uniform float rrGrain; uniform float rrGrainT;',
    'uniform vec2 rrSmear; uniform float rrSmearR; uniform float rrSmearK;',
  ].join('\n');
  /* The length (in UV) at which the smear fully takes over. ⚑ MEASURED, and the first value was
   * wrong for a reason worth keeping: I set it to 0.010 sized against "how much blur can the
   * player tolerate", which is the wrong question. Driven through a real FLOW chain the exposure
   * length runs 0.0006 (idle) → 0.0026 (overdrive) — i.e. **about 2.3 px at 900 wide**. The
   * LENGTH is what costs legibility and it is tiny by construction, because the camera itself
   * barely travels; the MIX only decides how much of the sharp frame is kept at that length. So
   * 0.010 meant the effect never rose above a 26% mix even at full overdrive — invisible work.
   * 0.004 puts the chain at 0.15 → 0.22 → 0.37 → 0.65 with the same 2 px smear. */
  const SMEAR_FULL = 0.004;
  const COMPOSE_MAIN = [
    SMEAR_TAPS > 1 ? [
      '{ vec2 rrd = rrSmear + (uv - 0.5) * rrSmearR;',
      '  float rrl = length(rrd);',
      /* ⚠ the >0 test is what makes "at rest the frame is byte-identical" true rather than
       * nearly true: with no camera motion this block is not entered at all. */
      '  if (rrSmearK > 0.0 && rrl > 0.0) {',
      '    vec3 rracc = vec3(0.0);',
      '    for (int i = 0; i < ' + SMEAR_TAPS + '; i++) {',
      /* symmetric about the pixel: the shutter opens before and closes after this instant */
      '      float rrt = (float(i) / float(' + (SMEAR_TAPS - 1) + ')) - 0.5;',
      '      vec3 rrs = texture2DLod(sceneTexture, clamp(uv + rrd * rrt, 0.0, 1.0), 0.0).rgb;',
      '      #ifdef GRADING',
      '        rrs = applyGrading(rrs);',
      '      #endif',
      '      rracc += toneMap(max(vec3(0.0), rrs));',
      '    }',
      '    rracc /= float(' + SMEAR_TAPS + ');',
      '    result = mix(result, rracc, min(rrSmearK, rrl / ' + SMEAR_FULL.toFixed(4) + '));',
      '  } }',
    ].join('\n') : '',
    '{ vec3 rrg = pow(max(result, vec3(0.0)), vec3(1.0 / 2.2));',
    '  rrg += (rr_bayer(gl_FragCoord.xy) - 0.5) * rrDither;',
    '  rrg += (rr_h(uv * vec2(1023.0, 791.0) + rrGrainT) - 0.5) * rrGrain;',
    '  result = pow(max(rrg, vec3(0.0)), vec3(2.2)); }',
  ].join('\n');
  let ditherOn = false, smearOn = false;
  function installCompose() {
    const wantDither = QCFG.dither && (POST.dither > 0 || POST.grain > 0);
    const wantSmear = SMEAR_TAPS > 1 && POST.shutter > 0;
    if (!wantDither && !wantSmear) return;
    try {
      const chunks = pc.ShaderChunks.get(app.graphicsDevice, pc.SHADERLANGUAGE_GLSL);
      chunks.set('composeDeclarationsPS', COMPOSE_CHUNK);
      chunks.set('composeMainEndPS', COMPOSE_MAIN);
      const sc = app.graphicsDevice.scope;
      sc.resolve('rrDither').setValue(wantDither ? POST.dither : 0);
      sc.resolve('rrGrain').setValue(wantDither ? POST.grain : 0);
      sc.resolve('rrGrainT').setValue(0);
      sc.resolve('rrSmear').setValue([0, 0]);
      sc.resolve('rrSmearR').setValue(0);
      sc.resolve('rrSmearK').setValue(0);
      ditherOn = wantDither; smearOn = wantSmear;
    } catch (e) {
      ditherOn = false; smearOn = false;
      console.warn('[rrpc] compose chunk not installed:', e && e.message);
    }
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
  const M = { bg: 1, far: QCFG.far ? 1 : 0, facade: 1, lamps: QCFG.lamps ? 1 : 0, emps: 1,
    stars: 1, enemies: 1, aura: 1, card: 1,
    pops: 1, beams: 1, bullets: 1, pows: 1, ship: 1, flash: 1 };
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
    dash: false, dashDir: 0, roll: false, rollDir: 0, draw: false, dx: 0, dy: 0 };
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

  /* ══ ⛔ THE TOUCH SCHEME: ONE FINGER FLIES, THE TAPS ARE THE VERBS ══════════════════════════════
   * Artist, 2026-08-06: *"double tap on either side to go fast side to side. take the gun button
   * off and have it always shooting. take off unnessary buttons. let finger draw fast paths with
   * double tap. lets get wild cool on mobile controls for this game."*
   *
   * ⛔ THE DASH DID NOT EXIST ON A PHONE AT ALL, AND IT IS HALF THE GAME. rrpc-game.js's SHIP
   *   block answers a brief that asked for "fast combos for movement" with DASH → ROLL → FLOW →
   *   OVERDRIVE, and the start screen tells the player that *"moving well is shooting well"*. On
   *   a keyboard the dash is double-tap ◀◀/▶▶ or Q/E. On touch there was **no input bound to it
   *   in any form** — so the FLOW chain needed two verbs and a thumb could reach one, and
   *   OVERDRIVE (the whole reward loop) was unreachable on the device most people open this on.
   *   Nothing errored and nothing looked wrong; the mode was simply absent. That is this repo's
   *   own `built ≠ reachable`, and the same shape as THE CITY having no touch input at all.
   *
   * ⚑ SO TAPPING IS THE WHOLE VOCABULARY, AND IT IS *ONE* THING TO LEARN: **tap more, go harder.**
   *     tap             → ROLL, toward the side you tapped. i-frames, and the shock clears bullets.
   *     tap tap         → that roll, and the ship comes OUT of it DASHING.
   *     tap tap + hold  → …and then draws a path at ~1.9× top speed to wherever your finger goes.
   *   One motion, three verbs, and they arrive in the order the game already rewards.
   * ⛔ THE ROLL LOST ITS PAD ON THE ARTIST'S CALL (2026-08-06: *"I don't believe we need the roll
   *   button either"*), and I had argued in this very block that it could not: the only tap-shaped
   *   gesture left is the FIRST HALF of the double tap, so a tap-roll must fire a roll before every
   *   dash, and `doDash` refuses while a roll is live. That was true and the conclusion was wrong.
   *   ⚑ **The collision is the FLOW combo.** DASH → ROLL chained inside FLOW_WIN is what lights
   *   OVERDRIVE; a gesture that produces a roll and then a dash is not a conflict to design around,
   *   it is two of the three links you need, from one motion. All it needed was for the refused
   *   dash to survive the roll — `SHIP.DASH_BUF` in rrpc-game.js, which is a better simulation
   *   anyway and fixes the same swallowed input on a keyboard.
   *   ⚑ And it is BETTER ERGONOMICS than the pad it replaces: the roll used to be a 92 px circle
   *   in one corner; it is now the entire right or left half of the glass, under whichever thumb
   *   is free, and it carries a DIRECTION the pad never had.
   * ⚑ AND THE DASH FIRES ON THE SECOND *PRESS*, NOT THE SECOND RELEASE. Waiting for the release
   *   would put the tap-vs-hold decision in front of the most time-critical move in the game —
   *   up to TAP_T of latency on a dodge. Pressing is unambiguous: the gesture is already a double
   *   tap by then, and whether the finger lifts only decides if a drawn path follows it.
   *
   * ⚠ A TAP IS A PRESS THAT NEITHER TRAVELLED NOR LINGERED, and it needs BOTH halves. Steering is
   *   a continuous drag on this same glass: with only a time limit, every quick flick of the stick
   *   ends in a "tap" and the ship dashes whenever you steer briskly; with only a distance limit,
   *   parking your thumb still and lifting it does the same. This is the keyboard's own recorded
   *   lesson (`DTAP`/`TAP_MAX` above: *"a double-tap test of two presses inside 260 ms is too
   *   loose"*) restated for a surface where the held-and-dragging case is the DEFAULT, not the
   *   exception.
   * ⚠ The first tap of a pair still spawns the stick for its ~150 ms, and that is harmless BY
   *   CONSTRUCTION rather than by luck: a tap mid-glass is zero deflection, and a tap inside the
   *   edge margin deflects toward that edge — which is the same direction as the dash that tap is
   *   about to produce. The nudge can only ever agree with the gesture.
   */
  let dragging = false;
  /* ⛔ THE FIRE PAD IS GONE AND `⌁ auto` GOES WITH IT ON A THUMB. Autofire has always defaulted on
   *   and the rate limiter lives in the simulation, so the pad was a 92 px button whose entire job
   *   was to duplicate the default — while eating the bottom-right corner and one of two thumbs.
   * ⚠ But the TOGGLE cannot survive its button: with FIRE removed, switching autofire off on a
   *   phone leaves a ship with no way to shoot at all and no way to find out why. A control that
   *   can silently disarm the player is worse than no control (theme.js's rule, other way up), so
   *   on a coarse pointer it is not offered and `toggleAuto` refuses. */
  const COARSE = (() => { try { return matchMedia('(hover:none)').matches; } catch (e) { return false; } })();
  const TAP_T = 0.20, TAP_SLOP = 18, DTAP_T = 0.30, DTAP_R = 120;
  /* ⚠ THE MOMENT THE FINGER TOUCHED, NOT THE MOMENT THE HANDLER RAN — AND IT WAS MEASURED, not
   * assumed. `performance.now()` read inside a pointer handler is when the main thread got round
   * to the event, and this cabinet is a full 3D scene with a post stack on it. Driven live at
   * ~60 fps, 80 taps: `performance.now() − e.timeStamp` ran **45 ms min · 77 p50 · 148 max**, a
   * **103 ms spread against a 300 ms window**. A constant lag would cancel in a difference; that
   * VARIANCE does not — it can inflate or deflate a measured gap by a third of the window, which
   * makes the dash unreliable exactly when there is most on screen, i.e. the moments it exists
   * for. ⚠ Those numbers are SwiftShader, so read them as an existence proof and a direction
   * rather than as a phone's; the mechanism (pointer events queueing behind a heavy frame) is not
   * software-GL-specific. `e.timeStamp` shares performance.now()'s time origin, so it is the same
   * clock read at the right instant. (The KEYBOARD double-tap above still reads the handler clock;
   * same argument applies, but changing desktop timing is not this pass.) */
  const evT = e => (e.timeStamp > 0 ? e.timeStamp * 0.001 : performance.now() * 0.001);
  const ptrs = new Map();
  const lastTap = { t: -9, x: 0, y: 0 };
  const stick = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
  const draw = { id: null, x: 0, y: 0, px: 0, py: 0, t: 0 };
  const sB = $('stickBase'), sN = $('stickNub'), dR = $('drawRing');
  let dashes = 0, draws = 0, rolls = 0;            // for __rrpc._touch(), i.e. so a probe can see
                                                   // the gesture fire rather than infer it
  function stickShow(x, y) { sB.style.display = 'block'; sN.style.display = 'block';
    sB.style.left = x + 'px'; sB.style.top = y + 'px'; sN.style.left = x + 'px'; sN.style.top = y + 'px'; }
  function stickHide() { sB.style.display = 'none'; sN.style.display = 'none'; stick.id = null; stick.x = 0; stick.y = 0; }

  /* ── ⛔ SCREEN → FIELD, THROUGH THE NOMINAL CAMERA AND NEVER THE LIVE ONE ────────────────────
   * The live camera drifts with the ship (`drift = ship.x * 0.055`), shakes, and punches its fov
   * during a dash. Reading the drawn target off it would close a loop — ship moves ⇒ camera
   * drifts ⇒ the fingertip maps somewhere else ⇒ ship moves — with a positive gain and the
   * player's finger held still. So the projection is the CABINET's, computed from CAM's own
   * constants: exact for a perspective camera (fov is vertical here), stable by definition, and
   * it agrees with the recorded framing — CAM.y ± tan(21°)·11.4 is the y ∈ [−4.53, +4.23] band
   * written down in rrpc-game.js's F block.
   * ⚠ `Math.max(…, F.X)` is the portrait guard. At 844×390 the visible half-width is 9.5 units
   *   against a 6.3-unit field, so the map is direct and your finger is literally on the ship. At
   *   390×844 it is 2.0 — two thirds of the field would be unreachable — so there it stretches to
   *   the field instead of lying about being direct. (js/orient.js veils portrait on this page,
   *   so that branch is a belt, not the design.) */
  function fieldAt(px, py) {
    const r = ov.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    const hy = Math.tan(CAM.fov * 0.5 * Math.PI / 180) * CAM.z;
    return { x: (((px - r.left) / w) * 2 - 1) * Math.max(hy * (w / h), F.X),
             y: CAM.y + (1 - ((py - r.top) / h) * 2) * hy };
  }
  /* fieldAt's inverse, so the ring can be put back exactly where the clamped target really is.
   * Same nominal camera, so the round trip is exact for any point the ship can actually reach. */
  function screenAt(fx_, fy_) {
    const r = ov.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    const hy = Math.tan(CAM.fov * 0.5 * Math.PI / 180) * CAM.z;
    return { x: r.left + (fx_ / Math.max(hy * (w / h), F.X) * 0.5 + 0.5) * w,
             y: r.top + (0.5 - (fy_ - CAM.y) / hy * 0.5) * h };
  }
  /* THE INK. The path the finger draws is drawn, in the field, as a ribbon the ship then flies
   * along — the one piece of this that is purely "wild cool" and it is also the only feedback
   * that says the mode is on while your fingertip is covering the ship. Presentation only; it
   * lives here beside the input that produces it and the renderer just consumes the buffer. */
  /* ⛔ THE INK HAS TO OUTLIVE THE TRAVERSE OR IT IS A DOT, NOT A PATH. At 0.55 s the oldest points
   * were already gone by the time the ship reached the newest: a drawn path spans up to the field's
   * full 12.6 units and the ship crosses that at ~18.5 u/s, i.e. **0.68 s**, so the line was always
   * shorter than the journey it described. Found by looking at a frame with the ship at the ring
   * and no line behind it — `fx.counts()` said geometry was being emitted the whole time, which is
   * exactly the measurement that can be true while the picture is wrong. PATH_T is now longer than
   * a full-width traverse, so you can always see the whole line you drew. */
  const PATH_T = 0.95;
  let inkSegs = 0;                         // ribbon segments emitted last frame — see __rrpc._touch
  const PATH_N = 26, path = [];
  for (let i = 0; i < PATH_N; i++) path.push({ x: 0, y: 0, t: -9 });
  let pathI = 0;
  /* ⚠ THE DEDUPE COMPARES AGAINST THE PREVIOUS POINT, WHICH IS `path[pathI]` BEFORE THE ADVANCE.
   * The first version advanced first and then compared the incoming point against the slot it was
   * about to overwrite — a 26-frame-old entry — so it collapsed the wrong pairs and let genuine
   * duplicates through. A held finger must not keep stamping the same place, or the head of the
   * line never ages out and sits there as a permanent bright dot. */
  function pushPath(x, y, t) {
    const prev = path[pathI];
    if (Math.abs(prev.x - x) + Math.abs(prev.y - y) < 0.02 && t - prev.t < PATH_T) { prev.t = t; return; }
    const p = path[pathI = (pathI + 1) % PATH_N];
    p.x = x; p.y = y; p.t = t;
  }
  function drawStart(e, now) {
    if (draw.id !== null) return;
    draw.id = e.pointerId; draw.t = now; draws++;
    /* ⚠ the stick is DIMMED, not hidden. Hiding it means `stickHide()` drops `stick.id`, and the
     * other thumb — which may well still be down and steering — would be ignored for the rest of
     * its press. Priority belongs in readInput, where it is one line, not in the teardown. */
    sB.style.opacity = sN.style.opacity = '.22';
    if (dR) dR.style.display = 'block';
    drawMove(e, now);
  }
  /* ⛔ THE RING IS CLAMPED TO THE SHIP'S OWN BOX, AND IT WAS FOUND BY LOOKING RATHER THAN BY ANY
   *   ASSERTION. The ship's lane is F.YBOT…F.YTOP — the lower third, deliberately, so you can
   *   never stand inside the formation — and the simulation clamps the drawn target to it. The
   *   cursor did not: drawn to the top of the glass it sat at field y 2.07 with the ship stopped
   *   dead at 0.30, a ring hanging in the formation with the ship nowhere near it. Every number
   *   was correct and the picture said the control was broken. ⚑ A leash is a PROMISE; a promise
   *   the ship cannot keep is worse than no leash, and clamping it teaches the ceiling instead. */
  function drawMove(e, now) {
    const p = fieldAt(e.clientX, e.clientY);
    draw.x = clamp(p.x, -F.X, F.X); draw.y = clamp(p.y, F.YBOT, F.YTOP);
    const sc = screenAt(draw.x, draw.y);
    draw.px = sc.x; draw.py = sc.y;
    if (dR) { dR.style.left = sc.x + 'px'; dR.style.top = sc.y + 'px'; }
    pushPath(draw.x, draw.y, now);
  }
  /* Direction comes from the SIDE you tapped, exactly as the dash's does — one rule for both, and
   * it gives the roll a direction the pad never had (the pad read it off the stick, so a roll while
   * flying straight was always the directionless pop-up). */
  function rollAt(px, id) {
    const p = ptrs.get(id);
    if (p) { if (p.rolled) return; p.rolled = true; }
    pend.roll = 1; pend.rollDir = px < innerWidth * 0.5 ? -1 : 1;
    rolls++;
  }
  function drawEnd() {
    draw.id = null;
    sB.style.opacity = sN.style.opacity = '1';
    if (dR) dR.style.display = 'none';
  }

  ov.style.pointerEvents = 'auto';
  ov.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') { dragging = true; mouseSteer(e); return; }
    e.preventDefault();
    const now = evT(e);
    const others = ptrs.size;                     // fingers already on the glass, before this one
    ptrs.set(e.pointerId, { t: now, x: e.clientX, y: e.clientY, moved: 0, rolled: false, dbl: false });
    if (now - lastTap.t < DTAP_T && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DTAP_R) {
      /* ── THE DOUBLE TAP. Direction is the half of the screen it landed in, which is the artist's
       * words exactly — "either side" — and it is the only mapping that works with either thumb
       * and with the ship anywhere on the field. */
      lastTap.t = -9;
      ptrs.get(e.pointerId).dbl = true;
      wantDash(e.clientX < innerWidth * 0.5 ? -1 : 1);
      dashes++;
      drawStart(e, now);
      return;
    }
    /* ── THE ROLL, ON THE PRESS, WHEN ANOTHER FINGER IS ALREADY FLYING ────────────────────────
     * ⚑ A press that lands while a thumb is already down cannot be "starting to steer" — the
     *   stick is taken. So it is unambiguous, and the roll gets what a panic button needs: zero
     *   latency, on the press, anywhere on the free half of the glass.
     * ⚠ The lone-thumb case CANNOT fire here — the first press of all is exactly how steering
     *   begins, and rolling every time you put your thumb down would be unusable. There it fires
     *   on the release of a qualified tap instead (see ptrEnd), which costs the length of your own
     *   tap rather than a fixed window. Two paths because they are two genuinely different
     *   situations, and both are asserted. */
    if (others > 0) rollAt(e.clientX, e.pointerId);
    /* ⛔ THE ANCHOR IS INSET FROM THE EDGES, AND THAT IS THE HALF THAT ACTUALLY FIXED IT.
     *   Measured: a thumb landing 20 px from the left edge and dragging to the edge reached
     *   **sx −0.29** — 29% of top speed — against −1.00 for the same drag mid-screen. The
     *   anchor-follow below cannot help there, because it only engages once you PASS the rim and
     *   the thumb runs out of glass 36 px short of it. Placing the centre at least R from every
     *   edge means the full 56 px of travel always physically exists.
     * ⚠ A touch inside that margin therefore starts already deflected — which is right, not a
     *   side effect: you put your thumb on the far left of the screen, you are asking to go left. */
    if (stick.id === null && draw.id === null) {
      const R = 56;
      const cx = clamp(e.clientX, R, innerWidth - R), cy = clamp(e.clientY, R, innerHeight - R);
      stick.id = e.pointerId; stick.cx = cx; stick.cy = cy;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      stick.x = clamp(dx / R, -1, 1); stick.y = clamp(dy / R, -1, 1);
      stickShow(cx, cy);
      sN.style.left = (cx + dx) + 'px'; sN.style.top = (cy + dy) + 'px';
    }
  });
  /* ── ⛔ THE ANCHOR FOLLOWS, SO FULL SPEED IS ALWAYS REACHABLE ─────────────────────────────
   * Artist, 2026-08-05: *"on mobile we cannot move fast like we can on desktop."*
   *
   * ⚑ IT IS NOT THE TOP SPEED, AND THE ARITHMETIC SAYS SO. The stick drives a target velocity of
   *   `sx * shipTop(spdK)`, and `shipTop` is DERIVED as `ACC / -ln(DRAG)` — which is exactly the
   *   terminal velocity the keyboard's `v += ACC*h` reaches under the same drag. The two controls
   *   agree on the ceiling by construction. What differed was whether you can ever ASK for it.
   * ⛔ THE STICK SPAWNS WHERE YOUR THUMB LANDS AND ITS RIM IS 56 px AWAY. Land 20 px from the
   *   left edge — which is precisely where a left thumb rests on a phone — and there is nowhere
   *   left to drag: deflection clamps at 20/56, i.e. **36% of top speed, in that direction only**.
   *   The ship is not slow, it is being asked to go slowly, and the asymmetry is invisible from a
   *   desktop because a mouse has no edge to run out of.
   * ⚑ SO PUSHING PAST THE RIM WALKS THE ANCHOR INSTEAD OF CLAMPING. Deflection still saturates at
   *   R, the nub still sits on its rim, and full travel is available from anywhere on the glass —
   *   including hard against an edge. It also makes the control self-correcting: the stick drifts
   *   under the thumb rather than the thumb having to find the stick.
   * ⚠ It must NOT re-centre when you come back inside the rim, or the stick would follow you home
   *   and neutral would move every time you eased off. Only the saturating case moves it. */
  addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') { if (dragging) mouseSteer(e); return; }
    const now = evT(e);
    /* how far this press has travelled from where it landed — half of what makes a tap a tap.
     * MAX, not current distance: a flick out and back is a drag, not a press that stayed put. */
    const p = ptrs.get(e.pointerId);
    if (p) p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x, e.clientY - p.y));
    if (e.pointerId === draw.id) { drawMove(e, now); return; }
    if (e.pointerId !== stick.id) return;
    const R = 56, dz = 10;
    let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
    const m = Math.hypot(dx, dy);
    if (m > R) {
      const s = R / m;
      stick.cx = e.clientX - dx * s;          // drag the anchor along behind the thumb
      stick.cy = e.clientY - dy * s;
      dx *= s; dy *= s;
      stickShow(stick.cx, stick.cy);
    }
    stick.x = m < dz ? 0 : clamp(dx / R, -1, 1); stick.y = m < dz ? 0 : clamp(dy / R, -1, 1);
    sN.style.left = (stick.cx + dx) + 'px'; sN.style.top = (stick.cy + dy) + 'px';
  });
  function ptrEnd(e) {
    if (e.pointerType === 'mouse') { dragging = false; return; }
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (p) {
      const now = evT(e);
      const tap = now - p.t < TAP_T && p.moved < TAP_SLOP;
      lastTap.t = tap ? now : -9;              // a drag CLEARS the window rather than merely
      lastTap.x = p.x; lastTap.y = p.y;        // failing to open one — see the TAP note above
      /* the lone thumb's roll. ⚠ NOT on a press that was already the second half of a double tap:
       * that one has just asked for a dash, and rolling on its release would put a fresh 0.42 s
       * roll on top of the dash it exists to produce. */
      if (tap && !p.dbl) rollAt(p.x, e.pointerId);
    }
    if (e.pointerId === draw.id) drawEnd();
    if (e.pointerId === stick.id) stickHide();
  }
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
  bindPad($('tBomb'), () => { useBomb(); }, () => {});
  /* ⛔ #tRoll IS DELETED — see the vocabulary block above. BURN is the last pad standing and it is
   *   deliberately NOT a gesture: it is a CONSUMABLE (you carry at most three and they come from
   *   power-ups), and spending a scarce resource by accident is a different kind of mistake from
   *   an accidental roll. A stray tap costs you a 0.7 s cooldown on a defensive move; a stray
   *   swipe would cost you a screen-clear you had been saving. */

  function readInput() {
    input.left = !!(keys.ArrowLeft || keys.a); input.right = !!(keys.ArrowRight || keys.d);
    input.up = !!(keys.ArrowUp || keys.w); input.down = !!(keys.ArrowDown || keys.s);
    /* AUTOFIRE. Galaga is a hold-to-fire game and the rate limiter is in the simulation; making
     * the player mash for it just converts a pacing decision into a wrist injury. Space/click all
     * hold, and the default is ON — you are always shooting unless you say otherwise, and on a
     * thumb you cannot say otherwise at all (the FIRE pad and the `⌁ auto` toggle are both gone). */
    input.fire = AUTOFIRE || !!keys[' '] || dragging;
    /* THE DRAWN PATH OUTRANKS THE STICK, and it has to be a priority rather than a teardown: the
     * other thumb may still be holding the stick down, and it must get its steering back intact
     * the instant the drawing finger lifts. */
    if (draw.id !== null) { input.draw = true; input.dx = draw.x; input.dy = draw.y; input.stick = false; }
    else if (stick.id !== null) { input.draw = false; input.stick = true; input.sx = stick.x; input.sy = stick.y; }
    else if (mouseX !== null && dragging) { input.draw = false; input.stick = true; input.sx = clamp((mouseX - G.ship.x) * 0.5, -1, 1); input.sy = 0; }
    else { input.draw = false; input.stick = false; }
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
    /* THE WALL. A turret's shot is a flat heavy thud rather than the fleet's thin zap — it is a
     * different thing shooting at you and it should not be mistakable for a diver. And the WIND-UP
     * gets the quietest sound in the game on purpose: it fires before every single dive, so it has
     * to be a tick you feel rather than a cue you hear, or at wave 20 it is a drone. */
    if (seen.tfire) { blip(150, 58, 0.16, 'square', 0.10); noise(0.09, 0.10); }
    if (seen.wind) { blip(210, 430, 0.05, 'triangle', 0.035); }
    if (seen.bump) { blip(150, 70, 0.07, 'square', 0.07); }
    /* the shot is quieter than everything it might hit, on purpose: with autofire on it is the
     * most frequent sound in the game and it must not become the loudest thing in the mix. */
    if (seen.fire) { blip(940 + (Math.random() * 110 - 55), 190, 0.05, 'square', 0.055); }
    if (seen.efire) { blip(420, 150, 0.06, 'sawtooth', 0.05); }
  }


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
    /* ⚠ THE FIELD IS SHALLOWER AND WIDER THAN IT WAS, and it had to become both when the motes
     *   started falling instead of flying at the camera. The old field ran to z −95, where the
     *   visible half-height is 40 units against a y spread of ±12 — so 71% of the frame had no
     *   motes in it at all. That is invisible while everything is streaming radially out of the
     *   centre and glaring the moment they fall in straight lines. */
    for (let i = 0; i < QCFG.stars; i++) {
      stars.push({ x: (Math.random() * 2 - 1) * 26, y: (Math.random() * 2 - 1) * 19,
        z: -Math.random() * 46 + 4, pz: 0, v: 46 + Math.random() * 74, k: Math.random() });
    }
  }
  seedStars();

  /* ══ THE FACILITY — THE BRIEF, WRITTEN BEFORE THE CODE ════════════════════════════════════════
   *
   * Artist: "have the game scrolling up, like we are slowly flying through levels and like metal
   * slug, have bases and turrets, and different types of plane ships … lets make the gfx even
   * cooler." `docs/DESIGN-SYSTEM.md` §8 says a brief that does not decide the material, the light
   * and above all the MOTION produces the default, and the default has been rejected twice in this
   * project. So, all five, before any of the code below:
   *
   * 1 · WHAT IT IS MADE OF — §1's four layers, and the one this repo has never built.
   *   The facility is **die-cut card stock**: flat dark ink on pressed board, cut into plates and
   *   stacked, with a bright CUT EDGE where a plate ends. Not concrete, not sci-fi panelling — the
   *   same material as everything else this studio makes, because everything this studio makes is
   *   a printed object. `DESIGN-SYSTEM.md` §1 lists **die — the cut edge — ⛔ nowhere yet**, and
   *   this is where it gets built. It is also, not by coincidence, the cheapest way to keep the
   *   frame dark: a one-quad edge line costs almost no pixels and reads as an entire structure,
   *   where a filled panel costs the whole area and reads as a wash.
   *   ⚑ AND THE EDGE IS FOIL, WHICH MEANS IT MOVES. §1: "foil is defined by movement, not by
   *     colour — a rainbow painted on a surface is a sticker of foil." A diffraction edge's hue is
   *     a function of the angle between the eye and the edge, and here that angle genuinely
   *     changes: the camera is fixed and the wall is sliding past it, so a plate seen at the top of
   *     the frame is at a different angle from the same plate at the bottom. `foilHue()` keys the
   *     cut edge on exactly that angle. Acceptance number below.
   *
   * 2 · HOW IT IS LIT — §2's three keys, baked, because nothing in this renderer is lit at runtime.
   *   KEY phosphor green `#2bff80`, raking from above: every plate's TOP corners are lifted toward
   *   it, which is what makes a flat quad read as a raised plate rather than a rectangle.
   *   FILL acid magenta `#ff2ad9`, weak, from below: the bottom corners, so recesses are not dead.
   *   RIM cyan `#27f7e4`, grazing: the cut edge, walking through the foil range.
   *   GOLD `#ffd23b` is not a light — it is THE ACCENT, and it is spent on exactly one thing: a
   *   gun that has decided to shoot at you. Nothing else in the facility is gold.
   *
   * 3 · WHAT MOVES, AND WHY IT PHYSICALLY MOVED — §9: this is the half that gets skipped, and a
   *   brief that names the material and the light and waves at motion produces a beautiful object
   *   that is dead to the touch. Every moving thing here, and its cause:
   *     · the wall slides DOWN because the ship is climbing it. `G.scrollV` is the ship's own
   *       vertical velocity, signed — pull up and the facility runs, push down and it eases.
   *     · the far layer moves LESS because it is further away. Not a parallax coefficient: all
   *       layers translate at the same world speed and the perspective camera does the rest, which
   *       is both free and impossible to get wrong.
   *     · a plate's cut edge changes hue because the plate's view angle changed. See 1.
   *     · a turret's barrel swings because a servo is slewing it, and it OVERSHOOTS and settles
   *       because a servo slewing a mass does. Then it stops — and a barrel that has stopped
   *       following you is the whole telegraph.
   *     · a barrel kicks back into its mount when it fires, and returns. A gun that does not recoil
   *       is a light switch.
   *     · a card REARS BACK before it dives — the wind-up. It is the studio's own subject: the pull
   *       before the snap.
   *     · motes fall past you because you are going up.
   *   ⛔ Nothing here pulses, breathes or drifts on its own. Stop the ship climbing and the only
   *     thing still moving is what the enemies are doing.
   *
   * 4 · WHAT IT SITS ON — the depth stack, and every layer is behind the play plane so the game
   *   still reads first:
   *     z −46  the sky field (unchanged: hue lobes, dark centre, the measured `bg` surround)
   *     z −26  the far silhouette — the far side of the shaft, the city under you at the top
   *     z −12  THE FACADE, and the guns bolted to it. Emplacements are at the wall's own depth.
   *     z −1.2 … +2.6  the formation, the divers, the ship, the bolts. Untouched.
   *   ⛔ There is NO terrain collision. You fly in front of the wall, never into it. The artist's
   *     note was "good otherwise in fluidity" — the movement is the one thing that must not move,
   *     and bolting geometry onto a ship that was tuned for open air is the fastest way to lose it.
   *
   * 5 · THE ACCEPTANCE MEASUREMENT
   *     (a) BLACKS DO NOT COLLAPSE. `__rrpc._px().blacks` at the shipping settings, measured in
   *         play. This is the metric that caught Section 9's engine build losing its black point
   *         and it is the one a screen-filling new layer is most likely to break.
   *     (b) CLIPPING STAYS AT ZERO — GfxPost's standing rule, `_px().clipped`.
   *     (c) THE TIERS ARE MEASURABLY DIFFERENT. `__rrpc._tierScan()` reports the facade's own quad
   *         count per tier; the ascent is DENSITY FALLING AWAY, so tier I must build several times
   *         what tier IV does. A palette swap would pass a "do they look different" eyeball and
   *         fail this.
   *     (d) THE FOIL TEST, §1's own: `__rrpc._foilTest()` samples the cut-edge colour as a plate
   *         travels from the top of the frame to the bottom and reports the median hue travel.
   *         No shift, no foil.
   *     (e) THE TELEGRAPH IS REAL: the shot's bearing equals the LOCKED bearing, not the ship's
   *         current position — measured in the simulation as turret hits against a still target
   *         versus a moving one.
   * ═══════════════════════════════════════════════════════════════════════════════════════════ */

  /* the visible half-extent of a plane at depth z. Vertical fov is fixed, so halfH does not depend
   * on the window's aspect and halfW does — which is why the facade's column count is computed and
   * clamped rather than assumed. */
  const TAN_H = Math.tan(CAM.fov * Math.PI / 360);
  function halfAt(z) { return TAN_H * (CAM.z - z); }

  const LZ_FAR = -26, LZ_WALL = RRGame.EZ;      // the wall's depth is the simulation's own EZ
  const PH = 2.4, PW = 2.6;                      // plate pitch on the facade
  const ATIER = RRGame.TIERS;      // the ASCENT's tiers. `TIERS` above is the quality ladder.

  /* one integer hash, so the facility is the SAME building every run for a given tier — the
   * graffiti system's rule (seeded off the map name) applied to architecture. A wall that
   * reshuffles every time you die is a wall you cannot learn. */
  function hash3(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ⚑ THE FOIL. Hue keyed on the angle between the camera axis and the edge — the one quantity
   * that genuinely changes as a fixed camera watches a plate slide past. `_foilTest()` measures the
   * travel this produces; the acceptance rule is §1's, and it is a number, not an opinion. */
  const FOIL_K = 420, FOIL_X = 9;
  function foilHue(x, y, z, base) {
    const theta = Math.atan2(y - CAM.y, CAM.z - z);
    return base + theta * FOIL_K + x * FOIL_X;
  }

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
  let TS = ATIER[0];                                   // the live tier's spec, refreshed per frame
  function bgColour(u, v, t, hue0, boost, out) {
    const w = Math.sin(u * 5.1 + t * 0.7) * Math.cos(v * 4.3 - t * 0.53) * 0.5 + 0.5;
    const w2 = Math.sin((u + v) * 7.7 - t * 1.1) * 0.5 + 0.5;
    const ru = u * 2, rv = v * 2 * 0.62;
    const r2 = Math.min(1, ru * ru + rv * rv);
    const keep = CFLOOR + (1 - CFLOOR) * r2 * r2;      // r^4: holds the centre dark, lifts late
    /* ⚑ THE SKY OPENS AS YOU CLIMB, and it is the one place the tier is allowed to change the
     * overall level of the frame — by a little. `v` is 0 at the top of the field, so `up` is the
     * height in the frame: in the sub-level the ceiling is the dark end and the glow is below you;
     * by OPEN AIR it has inverted and the light is above. That is the ascent stated in the one
     * quantity a player reads without looking — where the frame is brightest.
     * ⚠ It is a ±25% modulation on a term the `bg` sweep already pinned. The sweep's finding was
     *   that this field's job is to hold the CENTRE dark (blacks 12.55% at 0.20, 0.35% at 1.00),
     *   and nothing here touches `keep`. */
    /* ⚠ CENTRED ON 1, so no tier is globally brighter than another — the gradient TILTS, it does
     *   not lift. The first version ran 1.00→1.55 for the upper tiers and 0.55→1.00 for the lower
     *   ones, which is a 55% brightness rise disguised as a gradient and would have made the
     *   ascent's payoff "the screen got brighter" rather than "the sky opened". */
    const up = 0.5 - v;
    const grad = 1 + (TS.n >= 3 ? 0.70 : -0.70) * (up - 0.5);
    const c = fx.hsl((hue0 + w * 150 + w2 * 60) % 360, 0.95,
      (0.045 + w * 0.075 + w2 * 0.035) * boost * keep * clamp(grad, 0.55, 1.55));
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
    const hue0 = (G.market.hue * 0.45 + TS.hue * 0.55 + t * 8 + G.wave * 37) % 360;
    /* ⚑ `sky` IS THE TIER'S OWN LEVEL, AND THE SWEPT `bg` IS ITS CEILING — normalised against the
     * TOP of the range, not the middle, so 0.20 is what OPEN AIR gets and every floor below it is
     * darker. That ordering was chosen by measurement, not by taste: with both clocks frozen and
     * one layer switched off at a time (CLAUDE.md's isolate-before-tuning rule), the black point at
     * tier III came apart like this —
     *     all on          blacks 17.4%
     *     sky field off   blacks 41.0%   ← +23.6, and it is the pre-existing layer, not the new one
     *     far layer off   blacks 25.8%   ← +8.3
     *     facade off      blacks 20.8%   ← +3.4
     *     everything else       17.4%    ← no effect at all
     * — repeatable across two interleaved passes. The facade is the cheapest thing on the screen;
     * the field behind it was the expensive one, and tilting the field UP for the upper tiers was
     * spending the very thing the `bg` sweep exists to protect. So the tilt only goes down.
     * ⚑ And that is the right answer for the picture as well as for the number: the light has moved
     *   off a flat field and onto actual objects, which is DESIGN-SYSTEM §5's "dark field, lit
     *   object" arriving by measurement rather than by assertion. */
    const skyK = TS.sky / 0.135;
    const boost = (G.phase === 'clear' ? 1.5 : 1) * BG_K * skyK;
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

  // ── THE FAR LAYER ───────────────────────────────────────────────────────────────────────────
  /* The far side of the shaft in the sub-levels; the city you have left, once you are above it.
   * It is nearly black on purpose — its whole job is to be a SILHOUETTE, which is a shape you read
   * off its edge rather than off its fill, and a shape read off its edge costs no brightness.
   * ⚑ It moves less than the facade because it IS further away. Same world velocity, one perspective
   *   divide. A parallax coefficient would be a number to get wrong; this cannot be wrong. */
  const _fc = [0, 0, 0, 255], _fc2 = [0, 0, 0, 255];
  function drawFar(t) {
    const hh = halfAt(LZ_FAR), hw = hh * (OW / Math.max(1, OH));
    const climb = G.scroll * ((CAM.z - LZ_FAR) / (CAM.z - LZ_WALL));  // same world speed, read far
    const CW = 3.6;
    const n = Math.min(18, Math.ceil((hw * 2) / CW) + 1);
    const base = TS.hue + 200;
    for (let i = -1; i <= n; i++) {
      const x = -hw + i * CW + CW * 0.5;
      const col = Math.round((x + climb * 0) / CW);
      /* towers are a stack of blocks; which blocks exist comes off the hash, so the skyline is the
       * same skyline every run and it slides rather than reshuffling. */
      const seg = Math.floor((climb - hh) / 6) - 1;
      for (let k = 0; k < Math.ceil(hh * 2 / 6) + 2; k++) {
        const s = seg + k;
        /* ⚑ THE FAR LAYER THINS WITH THE ASCENT TOO. In the shaft it is the wall opposite you and
         * it is nearly solid; above the roof it is the city you left, and there should be almost
         * nothing between you and the sky. Same loop, one threshold. */
        const r = hash3(col, s, TS.n * 97);
        if (r > (TS.n >= 4 ? 0.20 : TS.n === 3 ? 0.46 : 0.62)) continue;
        const y = s * 6 - climb + 3;
        const w = CW * (0.32 + r * 0.5), h = 3 * (0.5 + hash3(col, s, 7) * 0.9);
        /* ⚠ 0.0075+0.011 COST 8.3 POINTS OF BLACK ON ITS OWN — measured with the layer switched
         * off, and far too much for something whose entire job is to be a shape you read off its
         * edge. A silhouette is allowed to be almost invisible; that is what makes it a silhouette. */
        const v = 0.0038 + r * 0.0058;
        const c = fx.hsl(base + r * 40, 0.7, v);
        const c2 = fx.hsl(base + r * 40, 0.7, v * 0.35);
        _fc[0] = c2[0]; _fc[1] = c2[1]; _fc[2] = c2[2];
        _fc2[0] = c[0]; _fc2[1] = c[1]; _fc2[2] = c[2];
        fx.gouraud(fx.B, fx.C_FLAT, x, y, LZ_FAR, w, 0, 0, 0, h, 0, _fc, _fc, _fc2, _fc2);
      }
    }
  }

  // ── THE FACADE ──────────────────────────────────────────────────────────────────────────────
  /* Plates of dark printed board, stacked, each with a bright DIE EDGE along its top. The edge is
   * the whole read — see the brief: fill costs area and buys a wash, an edge costs a line and buys
   * a building. `open` marks a plate whose neighbour above is missing: that is a real cut against
   * the sky and it gets the bright edge, while a seam between two stacked plates gets a dim one. */
  const _p0 = [0, 0, 0, 255], _p1 = [0, 0, 0, 255], _p2 = [0, 0, 0, 255], _p3 = [0, 0, 0, 255];
  let facadeQuads = 0;
  function cellAt(r, c) {
    /* one rule for "is there a plate here", per tier, and it is the tier's whole character:
     *   fill      how much of the wall is solid — the ascent, as density falling away
     *   ribbed    the assembly deck's column rhythm
     *   glass     the tower's window grid: many cells, most of them dark, a few lit */
    const h = hash3(r, c, TS.n * 31 + 11);
    if (h > TS.fill) return 0;
    return 1 + (h * 997 % 3 | 0);        // 1..3, a plate variant
  }
  /* the die's own proportions, per floor. `wide` says whether two cells may be cut as one plate. */
  const CUTS = {
    wide:   { w: 0.97, h: 0.44, wide: 1 },     // SUB-LEVEL — long low runs: plant, ducting
    ribbed: { w: 0.78, h: 0.80, wide: 1 },     // ASSEMBLY  — chunky racks on a column rhythm
    glass:  { w: 0.44, h: 0.92, wide: 0 },     // TOWER     — tall narrow bays, a curtain wall
    mast:   { w: 0.20, h: 1.10, wide: 0 },     // OPEN AIR  — thin masts against nothing
  };
  let CUT = CUTS.wide;
  function drawFacade(t) {
    facadeQuads = 0;
    CUT = CUTS[TS.rows] || CUTS.ribbed;
    const hh = halfAt(LZ_WALL), hw = hh * (OW / Math.max(1, OH));
    const climb = G.scroll;
    const cols = Math.min(17, Math.ceil((hw * 2) / PW) + 2);
    const c0 = -Math.floor(cols / 2);
    const r0 = Math.floor((climb - hh - CAM.y) / PH) - 1;
    const rows = Math.min(13, Math.ceil((hh * 2) / PH) + 3);
    const KEY = [43, 255, 128], FILLC = [255, 42, 217];     // §2: key phosphor green, fill magenta
    for (let ri = 0; ri < rows; ri++) {
      const r = r0 + ri;
      const py = r * PH - climb + CAM.y;
      let skip = 0;
      for (let ci = 0; ci < cols; ci++) {
        const c = c0 + ci;
        if (skip) { skip = 0; continue; }
        const v = cellAt(r, c);
        if (!v) continue;
        const hsel = hash3(r, c, 5), hsel2 = hash3(r, c, 23);
        /* ⚑ THE PLATES ARE CUT, NOT TILED, AND THAT IS WHAT STOPS THIS BEING A BRICK WALL. Every
         * cell drawn at full pitch produces a seamless grid of identical rectangles, which is the
         * exact defect js/rrpc-fx.js already records for the sky field ("nine by seven flat tiles
         * read as masonry"). A plate is INSET inside its cell and some plates span two, so the
         * ground between them stays black and the wall reads as pieces of board laid on a dark
         * surface — which is what card stock cut and stacked actually looks like. It is also free
         * black: every gutter is a pixel the facade does not light. */
        let wCells = 1;
        if (v === 3 && cellAt(r, c + 1) && CUT.wide) { wCells = 2; skip = 1; }
        /* ⚑ AND THE TIER CHANGES THE *SHAPE* OF THE CUT, NOT ONLY HOW MUCH OF IT THERE IS. Density
         * alone is one axis and it can read as "the same wall with holes in it"; the plate's
         * proportion is what makes a floor recognisable at a glance. The sub-level is long low
         * runs of plate (plant, ducting, horizontal); the tower is tall narrow bays (a curtain
         * wall); OPEN AIR is a few thin masts against nothing. Same loop, same cost, four
         * buildings. */
        const pw = PW * wCells * CUT.w * (0.86 + hsel * 0.14) * 0.5;
        const ph = PH * CUT.h * (0.80 + hsel2 * 0.22) * 0.5;
        const px = c * PW + PW * wCells * 0.5;
        /* the ink. ⛔ DARK BY CONSTRUCTION, AND THE FIRST BUILD OF THIS WAS NOT. At 0.042–0.080
         * lightness the plates measured out at mean luma 68.0 with blacks down to 11.98% — against
         * a sky field whose own effective lightness is 0.006 at the centre and 0.031 at the rim,
         * because `bg` multiplies it by the swept 0.20. The facade was four to twenty times
         * brighter than the sky it stands in, i.e. the game was sitting ON a lit wall. This is the
         * wash, for the third recorded time in this project (the backdrop, the 3D card's env map,
         * and now this), and the fix is the same one every time: the STRUCTURE carries the read,
         * not the FILL. */
        let val = 0.0085 + hsel * 0.0125 + v * 0.0016;
        if (TS.rows === 'ribbed') val *= (c & 1) ? 1.0 : 0.62;      // the assembly deck's rhythm
        if (TS.rows === 'glass') val *= 0.74;
        const hue = TS.hue + hsel * 46 - 23;
        const bodyLo = fx.hsl(hue, 0.72, val * 0.62);
        _p0[0] = bodyLo[0] + FILLC[0] * 0.012; _p0[1] = bodyLo[1] + FILLC[1] * 0.012; _p0[2] = bodyLo[2] + FILLC[2] * 0.012;
        _p1[0] = _p0[0]; _p1[1] = _p0[1]; _p1[2] = _p0[2];
        const bodyHi = fx.hsl(hue, 0.72, val);
        /* §2: the KEY rakes from above, so the plate's top corners catch it. That is the entire
         * reason a flat quad reads as a raised plate instead of a rectangle. */
        _p2[0] = bodyHi[0] + KEY[0] * 0.016; _p2[1] = bodyHi[1] + KEY[1] * 0.016; _p2[2] = bodyHi[2] + KEY[2] * 0.016;
        _p3[0] = _p2[0]; _p3[1] = _p2[1]; _p3[2] = _p2[2];
        fx.gouraud(fx.B, fx.C_FLAT, px, py, LZ_WALL, pw, 0, 0, 0, ph, 0, _p0, _p1, _p2, _p3);
        facadeQuads++;
        /* ── the DIE EDGE. Foil: hue keyed on this edge's own view angle. See foilHue().
         * ⚑ This is the layer §1 lists as "⛔ nowhere yet" and it is doing the actual work here:
         * a 0.07-unit line at 0.30 lightness costs about 3% of the plate's area and is the entire
         * reason the plate has a shape. `open` — nothing stacked above — is a real cut against the
         * sky and gets the bright edge; everything else is a seam between boards. */
        const open = !cellAt(r + 1, c);
        const ey = py + ph;
        const eh = open ? 0.075 : 0.040;
        const el = open ? 0.30 : 0.085;
        const fh = foilHue(px, ey, LZ_WALL, TS.hue + 150);
        const ec = fx.hsl(fh, 0.92, el * 0.45);
        const ec2 = fx.hsl(fh + 34, 1.0, el);
        _fc[0] = ec[0]; _fc[1] = ec[1]; _fc[2] = ec[2];
        _fc2[0] = ec2[0]; _fc2[1] = ec2[1]; _fc2[2] = ec2[2];
        fx.gouraud(fx.B, fx.C_FLAT, px, ey - eh * 0.5, LZ_WALL, pw, 0, 0, 0, eh, 0, _fc, _fc, _fc2, _fc2);
        facadeQuads++;
        // ── a lit window / lamp. GOLD is reserved for guns, so these are the tier's own colour.
        if (M.lamps && hash3(r, c, 61) < TS.lamp) {
          /* ⚑ IT BRIGHTENS BECAUSE IT IS AIMED OUT OF THE WALL AT YOU. A downlight's cone is
           * strongest along its axis, so the lamp peaks as it passes the camera's centreline — a
           * real reason for a change in brightness, rather than a sine on the clock. */
          const th = Math.atan2(ey - CAM.y, CAM.z - LZ_WALL);
          const k = clamp(1 - Math.abs(th) / 0.40, 0, 1);
          const lc = fx.hsl(TS.hue + 30, 0.85, 0.50);
          fx.billboard(fx.A, fx.C_DOT, px + (hash3(r, c, 3) - 0.5) * pw, py, LZ_WALL,
            0.22 + k * 0.20, lc[0], lc[1], lc[2], (14 + k * 62) | 0);
        }
      }
    }
  }

  // ── THE GUNS BOLTED TO IT ───────────────────────────────────────────────────────────────────
  /* Mount plate, barrel, charge, muzzle flash. All of the structure goes in the opaque buffer with
   * the wall it is bolted to, so a turret can never be drawn over the sky it should be in front of;
   * only the glow is additive. */
  const _seen = new Set();
  function drawEmps(t) {
    const EMPK = RRGame.EMPK;
    /* ── PASS 1: THE BASE ITSELF. ⚑ A "base" that is three guns near each other is three guns near
     * each other. What makes it a base is that they are all standing on ONE thing: a platform cut
     * from the same board as the wall, spanning them, with its own die edge. It is drawn first so
     * the mounts sit on top of it — which is the whole point of them being in a single opaque
     * buffer where the index order IS the draw order. A lone gun gets no platform; it is bolted
     * straight to the facade, which is the visible difference between an outpost and an
     * installation. */
    _seen.clear();
    for (const e of G.emps) {
      if (e.dead || e.n < 2 || _seen.has(e.id)) continue;
      _seen.add(e.id);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, live = 0;
      for (const o of G.emps) {
        if (o.id !== e.id || o.dead) continue;
        const K = EMPK[o.kind];
        x0 = Math.min(x0, o.x - K.w * 0.7); x1 = Math.max(x1, o.x + K.w * 0.7);
        y0 = Math.min(y0, o.y - K.h * 0.8); y1 = Math.max(y1, o.y + K.h * 0.6);
        live++;
      }
      if (live < 2 || y1 < -10.5 || y0 > 10.5) continue;
      const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5, hw = (x1 - x0) * 0.5, hh = (y1 - y0) * 0.5;
      const pl = fx.hsl(TS.hue + 12, 0.6, 0.013), ph2 = fx.hsl(TS.hue + 12, 0.6, 0.026);
      _p0[0] = _p1[0] = pl[0]; _p0[1] = _p1[1] = pl[1]; _p0[2] = _p1[2] = pl[2];
      _p2[0] = _p3[0] = ph2[0]; _p2[1] = _p3[1] = ph2[1]; _p2[2] = _p3[2] = ph2[2];
      fx.gouraud(fx.B, fx.C_FLAT, cx, cy, LZ_WALL, hw, 0, 0, 0, hh, 0, _p0, _p1, _p2, _p3);
      const ec = fx.hsl(foilHue(cx, cy + hh, LZ_WALL, TS.hue + 190), 0.95, 0.24);
      _fc[0] = _fc2[0] = ec[0]; _fc[1] = _fc2[1] = ec[1]; _fc[2] = _fc2[2] = ec[2];
      fx.gouraud(fx.B, fx.C_FLAT, cx, cy + hh - 0.05, LZ_WALL, hw, 0, 0, 0, 0.1, 0, _fc, _fc, _fc2, _fc2);
    }
    for (const e of G.emps) {
      if (e.dead) continue;
      if (e.y > 10.5 || e.y < -10.5) continue;
      const K = EMPK[e.kind];
      const hurt = e.hurt > 0 ? 1 : 0;
      const dmg = 1 - (e.hp / e.hpMax);
      // the mount: dark board, key on top, and a bright die edge — the same plate as the wall
      const bv = 0.020 + 0.016 * (1 - dmg);
      const b1 = fx.hsl(K.hue, 0.55, bv * 0.6), b2 = fx.hsl(K.hue, 0.6, bv * (hurt ? 6 : 1.35));
      _p0[0] = b1[0]; _p0[1] = b1[1]; _p0[2] = b1[2];
      _p1[0] = b1[0]; _p1[1] = b1[1]; _p1[2] = b1[2];
      _p2[0] = b2[0]; _p2[1] = b2[1]; _p2[2] = b2[2];
      _p3[0] = b2[0]; _p3[1] = b2[1]; _p3[2] = b2[2];
      fx.gouraud(fx.B, fx.C_FLAT, e.x, e.y, e.z, K.w * 0.5, 0, 0, 0, K.h * 0.5, 0, _p0, _p1, _p2, _p3);
      const ey = e.y + K.h * 0.5;
      const ec = fx.hsl(foilHue(e.x, ey, e.z, K.hue + 120), 0.95, hurt ? 0.85 : 0.26);
      _fc[0] = _fc2[0] = ec[0]; _fc[1] = _fc2[1] = ec[1]; _fc[2] = _fc2[2] = ec[2];
      fx.gouraud(fx.B, fx.C_FLAT, e.x, ey - 0.045, e.z, K.w * 0.5, 0, 0, 0, 0.09, 0, _fc, _fc, _fc2, _fc2);
      if (!K.len) {                                     // the core: no gun, one steady eye
        const cc = fx.hsl(K.hue, 1, 0.5 + 0.2 * (1 - dmg));
        fx.billboard(fx.A, fx.C_RING, e.x, e.y, e.z, K.w * 0.42, cc[0], cc[1], cc[2], 150);
        continue;
      }
      /* THE BARREL. `e.ang` is a spring, so it overshoots the bearing and settles — a servo
       * slewing a mass, not a lerp. `e.recoil` shortens it on the shot and lets it push back out. */
      const len = K.len * (1 - e.recoil * 0.28);
      const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
      const bc = hurt ? [255, 255, 255] : fx.hsl(K.hue, 0.5, 0.16);
      fx.ribbon(fx.B, fx.C_FLAT, e.x, e.y, e.z, e.x + ca * len, e.y + sa * len, e.z, 0.105, bc[0], bc[1], bc[2], 255);
      const mx = e.x + ca * len, my = e.y + sa * len;
      /* ⚑ THE LOCK IS THE ONLY GOLD ON THE WALL. §2 reserves `#ffd23b` as the accent, "the one warm
       * thing", and it is spent here: a gun that has stopped tracking and is about to fire. The
       * charge grows, and a short dashed ray says WHICH WAY — direction, never the endpoint, so
       * the player still has to read the geometry rather than being handed the answer. */
      if (e.state === 'lock') {
        const k = clamp(e.t / Math.max(0.001, K.warn), 0, 1);
        fx.billboard(fx.A, fx.C_DOT, mx, my, e.z, 0.10 + k * 0.34, 255, 210, 59, (90 + k * 165) | 0);
        for (let i = 1; i <= 4; i++) {
          const d = i * 0.85 + k * 0.5;
          fx.billboard(fx.A, fx.C_DOT, mx + ca * d, my + sa * d, e.z + 0.4 * i,
            0.075 + k * 0.05, 255, 210, 59, ((1 - i / 5) * k * 110) | 0);
        }
      } else if (e.state === 'track') {
        const tc = fx.hsl(K.hue, 1, 0.5);
        fx.billboard(fx.A, fx.C_DOT, mx, my, e.z, 0.11, tc[0], tc[1], tc[2], 120);
      }
      if (e.flash > 0) {
        fx.billboard(fx.A, fx.C_DOT, mx, my, e.z, 0.30 + e.flash * 0.55, 255, 244, 200, (e.flash * 235) | 0);
        fx.billboard(fx.A, fx.C_RING, mx, my, e.z, 0.5 + (1 - e.flash) * 1.5, 255, 190, 90, (e.flash * 120) | 0);
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
  /* ⛔ `scrollRate` IS GONE FROM THIS FILE. It was a render quantity computed at frame rate, and
   *    an emplacement is a gameplay object that arrives on the scroll — a gameplay object cannot be
   *    positioned by something that steps at whatever rate the browser felt like. It now lives in
   *    `rrpc-game.js` on the fixed 1/120 s tick as `G.scrollK` / `G.scrollV` / `G.surge`, and the
   *    wall, the guns and the motes all read the same number. ⚑ It is also SIGNED now: climbing
   *    runs the world and diving eases it, where `Math.abs(s.vy)` used to speed the world up for
   *    both, which is exactly backwards for an ascent. */
  function drawStars(dt, t) {
    /* Streaks, not dots. The old build did the same thing in 2D and it was the best-looking part
     * of it; here the streak is a real ribbon in world space, so it foreshortens correctly as it
     * passes the camera instead of being stretched by a screen-space hack.
     * ⚑ AND THEY FALL NOW, BECAUSE YOU ARE GOING UP. They used to fly straight at the camera,
     *   which is the cue for forward flight and is what a wall climb must not say. Mostly −y with
     *   a little +z: debris shed off the facility, dropping past you and drifting out of the
     *   screen. The dominant speed cue is the wall; these are the air between you and it. */
    const sp = G.scrollK, surge = G.surge;
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
    const stretch = 1 + Math.max(0, surge) * (REDUCE ? 0.35 : 0.9);
    for (const s of stars) {
      s.y -= s.v * dt * sp * 0.88;
      s.z += s.v * dt * sp * 0.26;
      if (s.y < -19 || s.z > CAM.z + 4) {
        s.y = 19; s.x = (Math.random() * 2 - 1) * 26; s.z = -40 - Math.random() * 8;
      }
      const near = clamp((s.z + 40) / 48, 0, 1);
      const len = Math.min(3.4, s.v * 0.055 * sp * stretch);
      const c = fx.hsl(TS.hue + 40 + s.k * 110, 0.6, 0.5 + near * 0.42);
      const a = (24 + near * 180) | 0;
      /* the streak runs along the direction of travel, so it tilts as the mote's downward fall
       * mixes with its drift toward you — the same ribbon, told the truth about where it came from. */
      fx.ribbon(fx.A, fx.C_DOT, s.x, s.y + len * 0.88, s.z - len * 0.26, s.x, s.y, s.z,
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
      /* ⚠ `dsz` COMES OFF THE KIND TABLE NOW. The drawn size and the simulation's hit box shared a
       *   literal `1.5` in two files, which is exactly the coupling that lets a new enemy type
       *   arrive with a hit box that does not match its picture. */
      const sz = K.sz * K.dsz;
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
      const wind = e.state === 'wind' ? e.wind : 0;
      const bright = e.state === 'dive' || e.state === 'beam' ? 255 : 205;
      const wb = wind ? 205 + wind * 50 : bright;
      const r = hurt ? 255 : wb, g = hurt ? 255 : wb, b = hurt ? 255 : wb;
      if (M.card) fx.oriented(fx.C, cell, e.x, e.y, e.z, _cb[0], _cb[1], _cb[2], _cb[3], _cb[4], _cb[5], r, g, b, 255);
      /* ⚑ THE SILHOUETTE IS THE PROMISE OF THE PATH. Each type carries one extra piece of geometry
       * cut from the same card, and the piece says what the card is going to DO: swept fins arc,
       * a lance goes straight, a halo hangs about and shoots, a slung pod is heavy and crosses.
       * They are drawn in the card's own basis, so they tumble with it and vanish edge-on with it —
       * a billboarded badge would sit flat while its card turned, which is the sticker failure
       * DESIGN-SYSTEM §1 names. */
      if (M.card) {
        const rx = _cb[0], ry = _cb[1], rz = _cb[2], ux = _cb[3], uy = _cb[4], uz = _cb[5];
        if (e.kind === 1) {                     // FLANKER — swept trailing fins
          for (const sgn of [-1, 1]) {
            fx.oriented(fx.C, fx.C_FLAT, e.x + rx * sgn * 1.16 - ux * 0.62, e.y + ry * sgn * 1.16 - uy * 0.62,
              e.z + rz * sgn * 1.16 - uz * 0.62,
              rx * 0.34 * sgn, ry * 0.34 * sgn, rz * 0.34 * sgn, ux * 0.20, uy * 0.20, uz * 0.20,
              255, 90, 190, 190);
          }
        } else if (e.kind === 3) {              // LANCER — the spike, out past the nose
          fx.oriented(fx.C, fx.C_FLAT, e.x + ux * 1.28, e.y + uy * 1.28, e.z + uz * 1.28,
            rx * 0.085, ry * 0.085, rz * 0.085, ux * 0.55, uy * 0.55, uz * 0.55, 255, 245, 210, 235);
        } else if (e.kind === 5) {              // HAULER — the slung pod
          fx.oriented(fx.C, fx.C_FLAT, e.x - ux * 1.02, e.y - uy * 1.02, e.z - uz * 1.02,
            rx * 0.62, ry * 0.62, rz * 0.62, ux * 0.26, uy * 0.26, uz * 0.26, 120, 240, 255, 215);
        }
      }
      // aura — a diver's is much hotter, because the diver is what you are supposed to look at
      const diving = e.state === 'dive' || e.state === 'beam';
      /* ⚠ THE AURAS WERE EATING THE ARTWORK. At radius 1.5-2.4× the card and alpha 46/118 they
       * rendered as soft blobs with a card somewhere inside — visible immediately in the first
       * clean screenshot. These are trading cards; the art is the point. The aura is now a HALO
       * that sits just outside the silhouette, and only a DIVER gets a hot one, which also makes
       * "which of these is about to kill me" readable at a glance. */
      const c = fx.hsl(e.hue + (diving ? 0 : 40), 0.95, diving || wind ? 0.62 : 0.42);
      const ar = sz * (diving ? 1.3 : 0.92) * (1 + 0.10 * Math.sin(t * 7 + e.id));
      if (M.aura) fx.billboard(fx.A, fx.C_DOT, e.x, e.y, e.z, ar, c[0], c[1], c[2],
        wind ? (20 + wind * 130) | 0 : (diving ? 58 : 20));
      /* ⚑ THE WIND-UP, DRAWN AS AN IRIS CLOSING. The ring CONTRACTS onto the card over the third of
       * a second before it commits — inward reads as loading, outward reads as discharge, and the
       * game already spends outward rings on explosions and the roll shock. Paired with the card
       * pulling AWAY from you (the simulation moves it along −z), the whole event is "it got
       * smaller and hotter, then it came", which is a change you catch in the corner of your eye. */
      if (wind) {
        const wc = fx.hsl(e.hue + 20, 1, 0.72);
        fx.billboard(fx.A, fx.C_RING, e.x, e.y, e.z, sz * (2.4 - wind * 1.32),
          wc[0], wc[1], wc[2], (60 + wind * 175) | 0);
      }
      if (e.kind === 2) {
        const rc = fx.hsl(310, 1, 0.6);
        fx.billboard(fx.A, fx.C_RING, e.x, e.y, e.z, sz * (2.2 + 0.3 * Math.sin(t * 5)), rc[0], rc[1], rc[2], 150);
      } else if (e.kind === 4) {                // WEAVER — the halo it never takes off
        const hc = fx.hsl(e.hue + 180, 1, 0.58);
        fx.billboard(fx.A, fx.C_RING, e.x, e.y, e.z, sz * 1.55, hc[0], hc[1], hc[2], 120);
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
      + (s.drawT > 0 ? 1 : 0)
      + clamp((Math.abs(s.vx) - 6) / 12, 0, 0.7);
    const p = trail[trailI = (trailI + 1) % TRAIL_N];
    p.x = s.x; p.y = s.y; p.on = clamp(hot, 0, 1);
  }
  /* ── THE DRAWN PATH, AS INK ──────────────────────────────────────────────────────────────────
   * The line your finger is making, in the field, ahead of the ship that is flying it. It is the
   * only feedback the drawn-path mode gets — during it your own fingertip is sitting on top of
   * the ship, which is the mode's honest cost (see SHIP.DRAW_* in rrpc-game.js) — so without this
   * the screen says nothing at all about why the ship suddenly moves differently.
   * ⚠ It fades on WALL-CLOCK age, not on buffer position: a finger held still emits no new points
   * (pushPath collapses them), so an index-based fade would leave a permanent bright dot. */
  function drawPath(t) {
    inkSegs = 0;
    if (G.ship.drawT <= 0) return;
    for (let i = 1; i < PATH_N; i++) {
      const a = path[(pathI + i) % PATH_N], b = path[(pathI + i + 1) % PATH_N];
      const age = t - Math.max(a.t, b.t);
      if (a.t < 0 || b.t < 0 || age > PATH_T) continue;
      const k = 1 - age / PATH_T;
      const c = fx.hsl(292 + k * 46, 1, 0.62);
      fx.ribbon(fx.A, fx.C_DOT, a.x, a.y, 0, b.x, b.y, 0, 0.05 + k * 0.09,
        c[0], c[1], c[2], (k * k * 170) | 0);
      inkSegs++;
    }
    // the head of the line: where the ship is being led, so the leash reads as a destination
    const h = path[pathI];
    if (h.t >= 0 && t - h.t < PATH_T) {
      const c = fx.hsl(300, 1, 0.7);
      fx.billboard(fx.A, fx.C_RING, h.x, h.y, 0, 0.42 + 0.08 * Math.sin(t * 14), c[0], c[1], c[2], 150);
    }
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
    if (s.alive) { pushTrail(s); drawTrail(s); drawPath(t); }
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
  /* the combo camera's own smoothed state, and the previous frame's camera — the smear is a
   * DIFFERENCE, so it needs somewhere to remember where the camera was. `h` is the world
   * half-height at z=0, which is what carries the fov and the dolly in one number. */
  let comboK = 0, comboLead = 0, smearLen = 0;
  const camPrev = { x: 0, y: CAM.y, h: Math.tan(CAM.fov * Math.PI / 360) * CAM.z };
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
  function stepCamera(dt) {
  // camera: a shake and a gentle push toward the action. Never a roll — this is a fixed cabinet
  // and rolling the world in a game where left means left is how you lose the player.
  const sh = G.shake * (REDUCE ? 0 : 0.006);
  /* ── ⚑ THE COMBO CAMERA — DOLLY AND CRANE, NEVER A ROTATION ────────────────────────────────
   * Artist: *"camera angles for dynamic combo sequences."* The combo here is FLOW: chain a dash
   * into a roll into a dash and three links light OVERDRIVE. So the camera is driven by
   * `ship.flow` / `ship.od` — by the STATE MACHINE, not by a timer and not by a cut. It tightens
   * as you chain and commits when overdrive lights, which is the sequence made visible.
   *
   * ⛔ IT CANNOT ROTATE, AND THAT IS A HARD CONSTRAINT WITH TWO INDEPENDENT REASONS.
   *   (a) The line already in this file: rolling the world in a game where left means left is
   *       how you lose the player.
   *   (b) ⚑ THE ONE THAT WOULD HAVE BITTEN SILENTLY: `_field()` / `_screen()` map the touch
   *       DRAW-PATH gesture between finger and world, and they use NOMINAL camera constants on
   *       purpose — reading the live camera closes a feedback loop (ship moves ⇒ camera moves ⇒
   *       the target the ship is chasing moves). A yaw would desync the fingertip from the ship
   *       by the whole rotation, on the control that shipped last week. A dolly along z and a
   *       crane along y keep the optical axis where the mapping assumes it is.
   * ⚠ The dolly is therefore BOUNDED, not free: `COMBO.z` is small enough that the draw-path
   *   landing error stays inside what the existing `drift` already spends. `test:rr` asserts the
   *   bound rather than trusting this comment.
   * ⚑ AND IT IS A DOLLY *ZOOM*: the fov punch below widens while this pushes in, which is the
   *   Vertigo shot — the framing barely changes while the perspective stretches. That is why it
   *   reads as the camera getting excited rather than as the game zooming. */
  const COMBO = { z: 0.78, y: 0.20, lead: 0.030 };
  const flowK = REDUCE || G.mode !== 'play' || !G.ship.alive ? 0
    : clamp(G.ship.flow / Math.max(1, RRGame.SHIP.FLOW_OD), 0, 1);
  const odK = REDUCE || !G.ship.alive ? 0 : (G.ship.od > 0 ? 1 : 0);
  /* the chase-camera LEAD: during overdrive the camera sits slightly ahead of where the ship is
   * going, the way a chase car leads a bike. It is velocity, not position — so it points where
   * you are ABOUT to be, which is the whole reason a lead reads as speed. */
  const leadX = odK * clamp(G.ship.vx * COMBO.lead, -0.42, 0.42);
  comboK += ((flowK * 0.45 + odK * 0.55) - comboK) * Math.min(1, dt * 6);
  comboLead += (leadX - comboLead) * Math.min(1, dt * 5);
  const drift = clamp(G.ship.x * 0.055, -0.5, 0.5);
  /* ⛔ THE JITTER IS DRAWN ONCE AND REUSED. Calling Math.random() again below to "remove" it
   * subtracts a DIFFERENT number than was added, which does not cancel the shake — it adds a
   * second independent one. The smear would then be driven by noise on every frame the screen
   * shook, i.e. exactly the frames it most needs to be honest on. */
  const jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh;
  const camX = drift + comboLead + jx;
  const camY = CAM.y - comboK * COMBO.y + jy;
  const camZ = CAM.z - comboK * COMBO.z + (G.phase === 'entry' ? 1.4 : 0) * clamp(1 - G.phaseT, 0, 1);
  cam.setPosition(camX, camY, camZ);
  /* ⚑ FOV PUNCH. Widening the lens during a dash or overdrive is the oldest speed trick there is
   * and it costs one lerp: the periphery accelerates outward faster than the centre, so the same
   * scroll rate reads as more. Kept small (42° → ~46°) and SMOOTHED — an fov that steps is a
   * visible pop, and a big one is nausea. It is a lens change, never a roll or a shake. */
  const wantFov = CAM.fov + (!REDUCE && G.mode === 'play' && G.ship.alive
    ? (G.ship.dash > 0 ? 4.2 : 0) + (G.ship.od > 0 ? 1.8 : 0) + clamp((Math.abs(G.ship.vx) - 7) * 0.22, 0, 1.6) : 0);
  camFov += (wantFov - camFov) * Math.min(1, dt * 9);
  cam.camera.fov = camFov;

  /* ── ⚑ THE SMEAR IS MEASURED OFF THE CAMERA, AFTER IT HAS MOVED ─────────────────────────────
   * Everything above decided where the camera is THIS frame. The exposure integral is simply how
   * far it travelled since the last one, in UV, times the shutter angle — so this must run after
   * the move and before the draw, and it needs no velocity, no dt and no tuning.
   * ⚠ SHAKE IS EXCLUDED. It is `Math.random()` per frame, so including it would inject a
   *   full-strength smear in a random direction on every single frame — a permanent blur that
   *   looks like a broken shader and never reads as motion. The camera the smear measures is the
   *   camera without its jitter: shake is sensor rattle, not travel. */
  if (smearOn) {
    const halfH = Math.tan(camFov * Math.PI / 360) * camZ;      // world half-height at z=0
    const halfW = halfH * Math.max(0.05, OW / Math.max(1, OH));
    const sx = camX - jx, sy = camY - jy;
    /* a camera moving +x slides the world −x across the sensor, hence the sign. UV is 0..1, so a
     * world displacement is divided by the FULL extent, which is twice the half-extent. */
    let ux = -(sx - camPrev.x) / (2 * halfW);
    let uy = (sy - camPrev.y) / (2 * halfH);
    /* the radial term: a widening lens pushes every point outward from the centre, so the frame
     * slides inward across the sensor at a rate equal to the FRACTIONAL change in half-height. */
    let ur = (halfH - camPrev.h) / Math.max(1e-6, halfH);
    const k = POST.shutter * (REDUCE ? 0 : 1);
    camPrev.x = sx; camPrev.y = sy; camPrev.h = halfH;
    /* ⚠ CLAMPED, because a teleport is not a motion. Respawn, wave entry and the first frame
     * after a resize all move the camera a long way in one step, and an unclamped exposure
     * integral turns that into one frame of full-frame streaking — which reads as a glitch,
     * not as speed. The clamp is generous enough that nothing the ship can do reaches it. */
    const LIM = 0.035;
    ux = clamp(ux, -LIM, LIM) * k; uy = clamp(uy, -LIM, LIM) * k; ur = clamp(ur, -LIM, LIM) * k;
    try {
      const sc = app.graphicsDevice.scope;
      sc.resolve('rrSmear').setValue([ux, uy]);
      sc.resolve('rrSmearR').setValue(ur);
      sc.resolve('rrSmearK').setValue(POST.smearMax);
    } catch (e) {}
    smearLen = Math.hypot(ux, uy) + Math.abs(ur) * 0.5;
  }
  }

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

    /* ⛔ `readInput()` USED TO RUN EVEN WHILE HELD, AND IT ATE THE EDGES. The dash and the roll are
     * edge-triggered — `pend.*` is consumed exactly once and then cleared — so draining them into
     * a simulation that is not going to step DESTROYS them. Under `?hold=1` that made every
     * gesture a race between the player's finger and the next animation frame: found by a probe
     * that tapped, stepped once, and read zero rolls. A frozen simulation must not consume input
     * it will never act on. */
    if (!HOLD) { readInput(); RRGame.step(G, FROZEN != null ? 0 : dt, input); }
    TS = ATIER[clamp((G.tier || 1) - 1, 0, ATIER.length - 1)];
    playEvents();
    if (G.mode === 'over' && !overShown) showOver();

    stepCamera(dt);

    fx.begin();
    fx.setCamBasis(cam);
    /* ⚑ LAYER MASKS. CLAUDE.md's standing rule is ISOLATE BEFORE TUNING — switching one thing off
     * at a time is what proved the 3D card's wash was not the lighting. `__rrpc._mask('aura',0)`
     * and friends exist so a headless check can answer "which of these is the bright blob" in one
     * step instead of by argument. Everything defaults on; this costs one boolean per layer. */
    /* ⚑ ORDER IS PAINTER'S ORDER INSIDE THE OPAQUE BUFFER — sky, then the far silhouette, then the
     * facade, then the guns bolted to it. See js/rrpc-fx.js: they share one mesh instance, so this
     * ordering is a property of these four lines rather than of the engine's opaque sort. */
    if (M.bg) drawBackdrop(t);
    if (M.far) drawFar(t);
    if (M.facade) drawFacade(t);
    if (M.emps) drawEmps(t);
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
    /* ⚑ THE FLOOR YOU ARE ON, ON THE HUD. The ascent is the reason the screen scrolls, and a reason
     * the player cannot name is a reason they do not have. It also lands on the right side of
     * `docs/DELTRON-3030.md` §2's split: the HUD is the CORPORATION talking, so it labels its own
     * building in its own house voice. */
    dom.wave.innerHTML = '<i>' + ['I', 'II', 'III', 'IV'][clamp((G.tier || 1) - 1, 0, 3)] + ' · ' + TS.name
      + '</i> · wave <b>' + G.wave + '</b> · ' + (G.alive || 0) + ' up · ' + (G.diving || 0) + ' diving';
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
    blip(280, 1200, 0.3, 'sine', 0.1);
  }
  function showOver() {
    overShown = true;
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
    if (G.mode === 'play') { G.mode = 'pause'; $('tgPause').textContent = '▶ resume'; }
    else if (G.mode === 'pause') { G.mode = 'play'; $('tgPause').textContent = '⏸ pause'; }
  }
  function toggleSfx() { sfxOn = !sfxOn; $('tgSfx').classList.toggle('off', !sfxOn); }
  /* ⚠ THE ONE CONTROL THAT CAN DISARM YOU. With the FIRE pad gone there is no manual trigger on a
   * thumb, so switching autofire off there leaves a ship that cannot shoot and no way to work out
   * why. It is removed from the row rather than left as a trap — and refused here as well, because
   * the row is also reachable by keyboard. */
  function toggleAuto() { if (COARSE) return; AUTOFIRE = !AUTOFIRE; $('tgAuto').classList.toggle('off', !AUTOFIRE); }
  if ($('tgPause')) $('tgPause').onclick = togglePause;
  if ($('tgSfx')) $('tgSfx').onclick = toggleSfx;
  if ($('tgAuto')) { $('tgAuto').onclick = toggleAuto; if (COARSE) $('tgAuto').remove(); }

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
    /* ⚑ THE GESTURE STATE, READ BACK. `test:reach` can prove the handlers EXIST and CLAUDE.md's
     * own record is that this is not the same question — THE CITY registered every pointer
     * handler while the controls were unusable, and the ledge bug had `test:reach` green while
     * the squirrel could not move. A gesture recogniser is exactly that shape: it either fired or
     * it did not, and only a driven probe can tell. `dashes`/`draws` count the gesture, not the
     * simulation, so a probe can tell "the double tap was not recognised" from "it was recognised
     * and the sim refused it on cooldown" — two different bugs that look identical from outside. */
    /* ⚑ `ink` is the number of ribbon segments the last frame actually EMITTED, and it is here
     * because `fx.counts()` cannot answer the question: the ship's own afterimage brightens during
     * a draw too, so a rise in the additive quad count is consistent with the ink drawing nothing
     * at all. A confounded measurement that agrees with you is the expensive kind. */
    _touch: () => ({ dashes, draws, rolls, ink: inkSegs,
      inkPts: path.filter(q => q.t >= 0).length, inkAge: +(performance.now() * 0.001 - path[pathI].t).toFixed(2),
      drawing: draw.id !== null, stick: stick.id !== null,
      dx: +draw.x.toFixed(2), dy: +draw.y.toFixed(2), autofire: AUTOFIRE, coarse: COARSE,
      pads: ['tBomb', 'tRoll', 'tFire'].map(id => id + ':' + (document.getElementById(id) ? 'y' : 'n')).join(' ') }),
    /* ⚑ THE CAMERA AND THE SMEAR, READ BACK, for the same reason `_touch` exists: "the blur is on"
     * is not a question a screenshot can answer in this container, because SwiftShader rotates hue
     * on canvas content and a smeared frame and a soft one look alike. These are the numbers the
     * shader is actually being handed. `len` is the exposure length in UV — the thing that must be
     * EXACTLY 0 when the camera is still, which is an assertion a threshold could never be. */
    _cam: () => ({ x: +cam.getPosition().x.toFixed(4), y: +cam.getPosition().y.toFixed(4),
      z: +cam.getPosition().z.toFixed(4), fov: +camFov.toFixed(3),
      combo: +comboK.toFixed(4), lead: +comboLead.toFixed(4),
      /* the rotation is asserted, not assumed: the draw-path mapping depends on it being identity
       * and a future "just a little yaw" would break the control silently. */
      rot: cam.getEulerAngles().data ? Array.from(cam.getEulerAngles().data).map(v => +v.toFixed(3))
        : [+cam.getEulerAngles().x.toFixed(3), +cam.getEulerAngles().y.toFixed(3), +cam.getEulerAngles().z.toFixed(3)],
      smear: smearOn, taps: SMEAR_TAPS, shutter: POST.shutter, len: +smearLen.toFixed(6),
      dither: ditherOn, reduce: REDUCE }),
    _field: (x, y) => fieldAt(x, y),
    /* ⚠ THE CLOCK A PROBE CAN TRUST, and it is `__city._step`'s twin for the same recorded
     * reason: this container stalls rAF (6-8 real frames in 10.5 s measured), so a wall-clock
     * drive of a gesture reports a ship that never moved and reads as a dead control. Load the
     * page with `?hold=1` first — that stops the rAF path stepping the simulation, so this is the
     * ONLY clock and a measurement is repeatable rather than a race with the container. */
    _step(n, dt) {
      const h = dt || 1 / 120;
      for (let i = 0; i < (n || 1); i++) { readInput(); RRGame.step(G, h, input); }
      const s = G.ship;
      return { x: +s.x.toFixed(3), y: +s.y.toFixed(3), vx: +s.vx.toFixed(3), vy: +s.vy.toFixed(3),
        dash: +s.dash.toFixed(3), rollT: +s.rollT.toFixed(3), drawT: +s.drawT.toFixed(3),
        flow: s.flow, od: +s.od.toFixed(2), dashes: G.stat.dashes, rolls: G.stat.rolls,
        bolts: G.bullets.filter(b => b.live).length, shots: G.shots, held: !!HOLD };
    },
    /* ⚑ THE CAMERA'S OWN CLOCK, and it exists for a reason `_step` cannot cover: `_step` advances
     * the SIMULATION only, while the camera and the smear live in the render frame. So a probe
     * that drove `_step` a thousand times and then read `_cam()` would be reading a camera that
     * had never moved — every combo assertion would measure the rig at rest and pass or fail for
     * the wrong reason. `_camStep` advances the camera the same deterministic way, and rAF being
     * stalled in this container is then irrelevant to both halves. */
    _camStep(n, dt) {
      const h = dt || 1 / 60;
      for (let i = 0; i < (n || 1); i++) stepCamera(h);
      return this._cam();
    },
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
    /* ⚑ THE FOIL ACCEPTANCE TEST — `docs/DESIGN-SYSTEM.md` §1's own, applied to the die edge.
     * Walk one plate from the top of the frame to the bottom (which is what the scroll does to it)
     * and measure how far its hue travels. It samples the SAME `foilHue` the renderer draws with,
     * so it cannot pass while the picture fails. No shift, no foil. */
    _foilTest(n) {
      const N = n || 24, hh = halfAt(LZ_WALL), hues = [];
      for (let i = 0; i < N; i++) {
        const y = hh - (i / (N - 1)) * hh * 2;
        hues.push(((foilHue(0, y, LZ_WALL, TS.hue + 150) % 360) + 360) % 360);
      }
      let total = 0; const steps = [];
      for (let i = 1; i < N; i++) {
        let d = hues[i] - hues[i - 1];
        while (d > 180) d -= 360; while (d < -180) d += 360;
        total += Math.abs(d); steps.push(Math.abs(d));
      }
      steps.sort((a, b) => a - b);
      return { totalTravelDeg: +total.toFixed(1), medianStepDeg: +steps[steps.length >> 1].toFixed(2),
        topHue: +hues[0].toFixed(1), bottomHue: +hues[N - 1].toFixed(1), samples: N };
    },
    /* ⚑ THE ASCENT, AS A NUMBER. The tiers must differ in DENSITY, not only in palette — count the
     * plates each one actually builds for the current window. A reskin passes the eye and fails
     * this. Restores the live tier when it is done. */
    _tierScan() {
      const was = TS, out = [];
      for (const T of ATIER) {
        TS = T;
        let n = 0;
        const hh = halfAt(LZ_WALL), hw = hh * (OW / Math.max(1, OH));
        const cols = Math.min(17, Math.ceil((hw * 2) / PW) + 2), c0 = -Math.floor(cols / 2);
        const r0 = Math.floor((G.scroll - hh - CAM.y) / PH) - 1;
        const rows = Math.min(13, Math.ceil((hh * 2) / PH) + 3);
        for (let ri = 0; ri < rows; ri++) for (let ci = 0; ci < cols; ci++) if (cellAt(r0 + ri, c0 + ci)) n++;
        out.push({ tier: T.n, name: T.name, plates: n, quads: n * 2, fill: T.fill });
      }
      TS = was;
      return out;
    },
    _world() { return { tier: G.tier, name: TS.name, scroll: +G.scroll.toFixed(1),
      scrollV: +G.scrollV.toFixed(2), scrollK: +G.scrollK.toFixed(3), surge: +G.surge.toFixed(3),
      facadeQuads, emps: G.emps.filter(e => !e.dead).length }; },
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

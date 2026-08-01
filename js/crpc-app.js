/* CLOUD RACER — the PlayCanvas driver (CRPC).
 *
 * `js/crpc-game.js` owns the racing and knows no engine. This file owns the engine and knows no
 * rules: it builds the circuit, the sky, the pods and the weather, drives the chase camera off the
 * simulation's pose, runs the post stack and hands the HUD its numbers. Same split as Section 9,
 * and it is what let the pacing be measured in node before a single triangle was drawn.
 *
 * ══ THE LOOK TARGET, and why it is not the same one Section 9 arrived at.
 *    Section 9 is neon on near-black — a sign lit against a dark street. CLOUD RACER is the
 *    opposite brief: bright, high-key, saturated, flat colour fields, crisp silhouettes, ALMOST NO
 *    BLACK IN FRAME. The shipping build failed that badly and measurably: 8.41% of the frame was
 *    under 12/255, almost all of it the track itself, which was #0b1030 — a near-black asphalt
 *    ribbon occupying the middle third of every shot. So the circuit here is a WHITE ribbon with
 *    saturated rails, and the dark values in frame are the pods, which is where you want them:
 *    a dark silhouette against a bright field is the cheapest legibility there is.
 *
 * ══ WHY IT USED TO FEEL SLOW, in render terms. Optical flow, not speed. The old scene had a smooth
 *    ribbon, a texture repeating every ~43 world units, and clouds 60–320 units away — so at
 *    40 u/s essentially nothing passed close to the camera and the eye had nothing to integrate.
 *    Speed is sold by NEAR-FIELD objects going past. Hence: pylons every 21 u, gantries every 112,
 *    surface chevrons repeating every 7.75, and wisps that fly through the camera. The pace change
 *    (40.3 → 64 u/s cruise, 91 boosting) is only half of it; the furniture is the other half.
 */
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  const onq = (k, d) => (Q.has(k) ? Q.get(k) !== '0' : d);
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TAU = Math.PI * 2;

  /* ── the no-fallback decision, made in the open ────────────────────────────────────────────
   * PlayCanvas has no software path, so this build genuinely requires WebGL2. Fail-open is a
   * standing principle here, so the fallback is not a worse renderer — it is the previous build,
   * kept whole at `cloudracer-classic.html`, which runs on WebGL1 and falls open further to a
   * static page. Same shape as section9 / section9-classic. */
  const gl2 = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; } })();
  if (!gl2 || !window.pc || !window.CRGame) {
    const n = $('nogl');
    if (n) { n.classList.add('show');
      $('noglWhy').textContent = !window.pc ? 'the engine bundle did not load'
        : !window.CRGame ? 'the rules module did not load' : 'this browser reports no WebGL 2 context'; }
    const lob = $('ovLobby'); if (lob) lob.classList.remove('show');
    return;
  }

  const canvas = $('pcv');
  const CR = window.CRGame, PACE = CR.PACE;

  /* ONE definition of "weak device" for the whole site — GfxPost.dprCap(). It returns an ABSOLUTE
   * cap with a floor of 1, never a multiplier: CLAUDE.md records that the multiplier version
   * multiplied against callers' own min(dpr,2) and pushed the effective ratio to 0.63, i.e. below
   * one CSS pixel, which is visibly soft. */
  const DPRCAP = (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2;
  const AUTO_TIER = DPRCAP >= 2 ? 'high' : (DPRCAP >= 1.5 ? 'mid' : 'low');
  let TIER = Q.get('q') || AUTO_TIER;
  if (['low', 'mid', 'high'].indexOf(TIER) < 0) TIER = AUTO_TIER;
  const TIERS = {
    high: { puffs: 110, wisps: 30, shadows: true, shadowRes: 1024, rtScale: 1.0, envSize: 128, atlas: 256, skyN: 160, blur: 9, bloom: true },
    mid:  { puffs: 74,  wisps: 20, shadows: true, shadowRes: 512,  rtScale: 0.85, envSize: 64, atlas: 128, skyN: 128, blur: 7, bloom: true },
    low:  { puffs: 40,  wisps: 12, shadows: false, shadowRes: 512, rtScale: 0.72, envSize: 64, atlas: 128, skyN: 96, blur: 5, bloom: true },
  };
  const QC = TIERS[TIER];

  /* ══ POST — GfxPost's MEASURED calibration, ported into the engine's terms ═══════════════════
   * CLAUDE.md is explicit that an engine replaces the FUNCTION, not the TUNING, and that
   * Cloudracer's own numbers are the ones the whole site's rolloff was swept against. Carrying
   * them across means re-deriving, not copying:
   *
   *   GfxPost PRESET.sky        where it goes in PlayCanvas
   *   ─────────────────────     ────────────────────────────────────────────────────────────────
   *   threshold 0.86 (HIGH)     PlayCanvas bloom is a mip chain with NO threshold, so the "high
   *                             threshold, or the white cloudscape blooms to a flat wash" constraint
   *                             cannot be expressed as a threshold at all. It has to be expressed as
   *                             a much LOWER intensity, and it was re-measured here — see below.
   *   knee 0.94 (rolloff)       rendering.toneMapping = ACES. The 0.94 knee exists because GfxPost
   *                             is an LDR chain and additive bloom clips to flat white. PlayCanvas
   *                             renders HDR and tone-maps AFTER bloom, so the tonemapper IS the
   *                             rolloff, in the right space. Verified the way the knee was derived:
   *                             by counting clipped pixels, with `__crpc._clip()`.
   *   ca 0.0012                 fringing.intensity 2.46 — DERIVED, same algebra Section 9 recorded:
   *                             GfxPost offsets by ca·|uv−0.5| (6.0e-4 at the corner); PlayCanvas
   *                             uses (I/1024)·d², I/4096 at the corner; equal at I = 2.46.
   *                             ⚠ SET TO 0 HERE ON PURPOSE — see CLEAN below.
   *   vignette 0.42             {inner .68, outer 2.24} — DERIVED by substituting edge = 2r into
   *                             PlayCanvas's smoothstep. ⚠ also cut back — see CLEAN.
   *   sat 1.06                  grading.saturation
   *   dither 0.0045             injected as a composeMainEndPS chunk (PlayCanvas compose has none)
   *   sharpen 0.26              rendering.sharpness — different maths (CAS), so MEASURED not copied
   *   blur 0                    sky preset has no motion smear; nothing to lose
   */
  /* ⚑ THE TONEMAPPER IS **FILMIC**, NOT ACES — AND THAT DIFFERS FROM SECTION 9 ON PURPOSE.
   * Section 9 picked ACES because on ITS frame ACES removed 100% of clipping for free while every
   * alternative cost brightness. That is a measurement of a dark interior, and the rule CLAUDE.md
   * states is that the tuning must be RE-DERIVED in the engine's terms — not that the answer
   * transfers. Re-derived here, on a deterministic frame (mid-circuit, racing line, cruise —
   * `__crpc._pose(300,0,64)`, reproducible to ±0.4 luma across runs), at bloom 0.010 / sharp 0.70 /
   * saturation 1.35:
   *
   *     tone      exp    luma    rms   clipped%   sat%   edge
   *     ACES     0.75   203.5   34.7    0.0005    18.4   5.62
   *     ACES     1.15   219.6   31.1    0.0151    13.2   4.84
   *     FILMIC   0.75   159.2   34.9    0.0002    31.4   6.34
   *     FILMIC   1.15   181.0   36.6    0.0009    27.9   6.56    ← chosen
   *     FILMIC   1.55   195.0   37.3    0.0266    25.4   6.64
   *     NEUTRAL  any    222.1   43.0   14.1437    26.3   7.28
   *     LINEAR   1.15   147.2   31.5    0.0002    30.8   5.84
   *
   * Reading it:
   *   · NEUTRAL is disqualified outright — 14.1% of the frame clipped, and it does not respond to
   *     exposure at all. That IS the failure GfxPost's `sky` preset existed to prevent, which is
   *     recorded in CLAUDE.md as "a HIGH threshold, or the already-white cloudscape blooms into a
   *     flat wash". The same failure, in a different engine, found the same way: by counting.
   *   · ACES is BRIGHTER and much less colourful, and the gap widens with exposure (18.4% → 10.4%
   *     saturation from 0.75 to 1.55). That is the recorded ACES behaviour — it desaturates on the
   *     way to white — and on a scene that is mostly bright sky it dominates everything else.
   *   · LINEAR is the most saturated and clips least HERE, but only because this exposure is not
   *     pushing much past 1.0. It has no rolloff at all, so the first bright highlight clips hard;
   *     it is the option the 0.94 knee existed to replace.
   *   · FILMIC is the only one that is bright, saturated, high in local contrast AND rolling off.
   * Exposure 1.15 rather than higher for the reason the sweep shows: past it, saturation falls and
   * clipping starts climbing, and the picture is already at 181 luma with zero blacks. */
  const POST = {
    tone: pc.TONEMAP_FILMIC,
    bloom: num('bloom', 0.010),
    /* Bloom BUYS luma and SPENDS colour and detail — swept on the same frame: 0 → sat 30.3 / edge
     * 5.77, 0.012 → 28.3 / 5.23, 0.05 → 22.3 / 3.87, 0.10 → 17.8 / 2.64. GfxPost's `sky` preset
     * expresses "don't let the cloudscape wash out" as a high THRESHOLD; PlayCanvas's bloom is a
     * mip chain with no threshold, so the only way to say the same thing is a low intensity. */
    sharpness: num('sharp', 0.70),
    /* CAS is not GfxPost's unsharp, so this was matched on measured local contrast rather than
     * copied: mean |Laplacian| 0 → 3.89, 0.2 → 5.43, 0.4 → 5.71, 0.7 → 6.25, 1.0 → 7.01. 0.70 is
     * +61% over unsharpened — the same order as GfxPost's 0.26 unsharp — and keeps clipping at
     * 0.005%, where 1.0 takes it to 0.031%. */
    saturation: num('sat', 1.35),
    contrast: 1.0,
    /* ⚠ CONTRAST STAYS AT 1 for the reason Section 9 recorded: PlayCanvas grades in LINEAR space
     * BEFORE the tonemapper, so it is not the display-space knob an LDR chain's "contrast" is, and
     * copying a >1 value across black-crushes everything. Contrast here is bought with exposure and
     * with the value gap between a white track and a dark pod. */
    /* ⚑ A BRIGHT GAME SUBTRACTS FROM THE GRIT STACK. Chromatic aberration and grain add exactly
     * the high-frequency noise a flat-colour look needs removed, and a heavy vignette darkens the
     * corners of a frame whose whole premise is that there is no black in it. Kept: the tonemapper
     * (without it the cloudscape clips to a white slab) and a whisper of dither, because big flat
     * skies are where 8-bit banding actually shows. */
    fringing: num('ca', 0),
    grain: num('grain', 0),
    dither: num('dither', 0.0035),
    vignette: { inner: 0.95, outer: 3.4, curvature: 1.0, intensity: num('vig', 0.08) },
  };

  // ══ APPLICATION ═════════════════════════════════════════════════════════════════════════════
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance',
      // ?grab=1 keeps the drawing buffer so a headless run can read the REAL pixels. CLAUDE.md:
      // this container's screenshot path rotates hue on canvas content, so colour is judged from a
      // readback — and a WebGL canvas without this reads back black.
      preserveDrawingBuffer: onq('grab', false) },
  });
  window.__pcapp = app;
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  const DPR_BASE = Math.min(window.devicePixelRatio || 1, DPRCAP);
  app.graphicsDevice.maxPixelRatio = DPR_BASE;
  function fit() { app.resizeCanvas(); }
  addEventListener('resize', fit); fit();

  /* Adaptive resolution, the same one-knob lever Section 9 uses: a rolling MEDIAN (not a mean —
   * one 300 ms texture-upload hitch must not drag the estimate for four seconds) against a 16.7 ms
   * target, with hysteresis so the renderer cannot visibly breathe. Floor 0.7 of the base, never
   * below one CSS pixel. */
  const ADAPT = { on: Q.get('adapt') !== '0', hi: 21, lo: 13, scale: 1, min: 0.7 / Math.max(0.7, DPR_BASE), max: 1, win: [], cool: 0, changes: 0 };
  function adapt(ms, nowT) {
    if (!ADAPT.on) return;
    ADAPT.win.push(ms); if (ADAPT.win.length > 90) ADAPT.win.shift();
    if (ADAPT.win.length < 60 || nowT < ADAPT.cool) return;
    const s = ADAPT.win.slice().sort((a, b) => a - b), med = s[s.length >> 1];
    let next = ADAPT.scale;
    if (med > ADAPT.hi) next = Math.max(ADAPT.min, ADAPT.scale - 0.12);
    else if (med < ADAPT.lo) next = Math.min(ADAPT.max, ADAPT.scale + 0.08);
    if (Math.abs(next - ADAPT.scale) < 0.01) return;
    ADAPT.scale = next; ADAPT.changes++;
    app.graphicsDevice.maxPixelRatio = Math.max(0.7, DPR_BASE * ADAPT.scale);
    ADAPT.cool = nowT + 1500; ADAPT.win.length = 0;
  }

  // ══ SKY ═════════════════════════════════════════════════════════════════════════════════════
  /* High-key noon: a near-white horizon under a saturated zenith, which is the single biggest
   * legibility win available — every silhouette in the game reads dark against it and it costs
   * nothing to render. ⚑ THE FAR CLOUDSCAPE IS PAINTED INTO THE CUBEMAP, not billboarded. The old
   * build drew 220 alpha puffs, most of them 200+ units away and each covering a big slice of
   * screen; that overdraw was measured at a 333 ms median frame under SwiftShader. Distant clouds
   * do not parallax at 90 u/s in any way the eye can use, so they belong in the sky texture, where
   * they cost one lookup instead of forty overlapping blends. */
  const SKY = { top: [0.07, 0.33, 0.95], mid: [0.33, 0.63, 0.99], hor: [0.86, 0.94, 1.00], grd: [0.50, 0.68, 0.86] };
  const SUN = (() => { const v = [0.36, 0.80, -0.48], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
  const SUN_TINT = [1.0, 0.98, 0.93];
  /* ⚑ AN INTEGER HASH, NOT `Math.sin`. MEASURED: the first version generated the sky with a
   * sin-based hash over 3 octaves at 192² × 6 faces — 5.3 million Math.sin calls — and the page
   * took 8.96 s to reach its first frame, of which the sky was almost all. A permutation table is
   * the same noise for a table lookup, and the whole boot drops to well under a second. A loading
   * screen would have hidden this; it would not have fixed it. */
  const PERM = (() => { const p = new Uint8Array(512); const r = CR.rng(9137);
    const t = new Uint8Array(256); for (let i = 0; i < 256; i++) t[i] = i;
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const v = t[i]; t[i] = t[j]; t[j] = v; }
    for (let i = 0; i < 512; i++) p[i] = t[i & 255]; return p; })();
  function hash3(x, y, z) { return PERM[(PERM[(PERM[x & 255] + (y & 255)) & 255] + (z & 255)) & 255] / 255; }
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    let r = 0;
    for (let i = 0; i < 8; i++) {
      const dx = i & 1, dy = (i >> 1) & 1, dz = (i >> 2) & 1;
      const wgt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
      r += hash3(xi + dx, yi + dy, zi + dz) * wgt;
    }
    return r;
  }
  function skyColour(dx, dy, dz) {
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    let c;
    if (dy >= 0) { const t = Math.pow(Math.min(1, dy), 0.62);
      c = t < 0.5 ? SKY.hor.map((h, i) => h + (SKY.mid[i] - h) * (t / 0.5))
                  : SKY.mid.map((m, i) => m + (SKY.top[i] - m) * ((t - 0.5) / 0.5)); }
    else { const t = Math.min(1, -dy * 2.0); c = SKY.hor.map((h, i) => h + (SKY.grd[i] - h) * t); }
    const d = dx * SUN[0] + dy * SUN[1] + dz * SUN[2];
    if (d > 0) { const glow = Math.pow(d, 26) * 3.6 + Math.pow(d, 4) * 0.20; c = c.map((v, i) => v + glow * SUN_TINT[i]); }
    /* painted cumulus: a banded fBm keyed on the direction, densest a little above the horizon and
     * fading out at the zenith. Lit from the sun side, blue-grey underneath — the same read a
     * billboard puff gives, for none of the fill rate. */
    if (dy > -0.10 && dy < 0.72) {
      const sc = 2.7, px = dx / (Math.abs(dy) + 0.30), pz = dz / (Math.abs(dy) + 0.30);
      let n = vnoise(px * sc, dy * 5.2, pz * sc) * 0.68 + vnoise(px * sc * 2.4, dy * 9.4, pz * sc * 2.4) * 0.32;
      const band = Math.min(1, Math.max(0, (dy + 0.06) / 0.16)) * Math.min(1, Math.max(0, (0.72 - dy) / 0.34));
      const a = Math.max(0, Math.min(1, (n - 0.50) * 4.2)) * band;
      if (a > 0) {
        const lit = 0.5 + 0.5 * Math.max(0, dx * SUN[0] + dz * SUN[2]);
        const cc = [0.99 * lit + 0.72 * (1 - lit), 0.99 * lit + 0.78 * (1 - lit), 1.0 * lit + 0.90 * (1 - lit)];
        c = c.map((v, i) => v + (cc[i] - v) * a);
      }
    }
    return c;
  }
  const CUBE_DIRS = [(s, t) => [1, -t, -s], (s, t) => [-1, -t, s], (s, t) => [s, 1, t], (s, t) => [s, -1, -t], (s, t) => [s, -t, 1], (s, t) => [-s, -t, -1]];
  function skyCubemap(N, boost) {
    const faces = []; boost = boost || 1;
    for (let f = 0; f < 6; f++) {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const s = 2 * (x + 0.5) / N - 1, t = 2 * (y + 0.5) / N - 1;
        const v = CUBE_DIRS[f](s, t), col = skyColour(v[0], v[1], v[2]);
        const o = (y * N + x) * 4;
        for (let k = 0; k < 3; k++) d[o + k] = Math.min(255, Math.pow(Math.max(0, col[k] * boost), 1 / 2.2) * 255);
        d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0); faces.push(c);
    }
    const tex = new pc.Texture(app.graphicsDevice, { name: 'crpc-sky', cubemap: true, width: N, height: N,
      format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
    tex.setSource(faces); return tex;
  }
  const MARKS = { t0: performance.now() };
  try {
    const tSky = performance.now();
    const cube = skyCubemap(QC.skyN, 1);
    MARKS.skyMs = +(performance.now() - tSky).toFixed(0);
    const src = pc.EnvLighting.generateLightingSource(skyCubemap(32, 1.15), { size: QC.envSize });
    app.scene.envAtlas = pc.EnvLighting.generateAtlas(src, { size: QC.atlas });
    app.scene.skybox = cube;
    app.scene.skyboxMip = 0;
    app.scene.skyboxIntensity = 1.0;
    MARKS.envMs = +(performance.now() - MARKS.t0).toFixed(0);
  } catch (e) { /* fails open: a flat clear colour is ugly but playable */ }
  /* Open sky IS the fill, and it is blue. The reference frame has almost no black in it because
   * shadows are light, soft and coloured, and depth is carried by aerial perspective going lighter
   * and cooler rather than by anything getting darker. */
  app.scene.ambientLight = new pc.Color(0.34, 0.42, 0.55);
  /* ⚑ EXPOSURE GOES DOWN, NOT UP, and this is the recorded reason: ACES desaturates on the way to
   * white, so every stop of extra exposure is paid for in colour. Swept in-browser — see the
   * report; `?exp=` re-runs it. */
  app.scene.exposure = num('exp', 1.35);
  app.scene.fog.type = pc.FOG_LINEAR;
  app.scene.fog.color = new pc.Color(0.86, 0.92, 0.99);   // haze is the SKY colour: aerial perspective
  app.scene.fog.start = 190;
  app.scene.fog.end = 760;

  const sun = new pc.Entity('sun');
  sun.addComponent('light', { type: 'directional', color: new pc.Color(1, 0.99, 0.95), intensity: 2.2,
    castShadows: QC.shadows && onq('shadows', true), shadowType: pc.SHADOW_PCF3,
    numCascades: 2, cascadeDistribution: 0.5, shadowDistance: 150, shadowResolution: QC.shadowRes,
    shadowBias: 0.014, normalOffsetBias: 0.3, shadowIntensity: 0.55 });
  sun.setPosition(SUN[0] * 300, SUN[1] * 300, SUN[2] * 300); sun.lookAt(0, 0, 0);
  app.root.addChild(sun);

  // ══ CAMERA ══════════════════════════════════════════════════════════════════════════════════
  /* ⚑ NO `worldMirror` NODE HERE, AND THAT IS A CHECKED CLAIM, NOT AN ASSUMPTION.
   * Section 9's port rendered its whole scene mirrored and produced three separate bug reports
   * ("mouse inverted", "strafe backwards", "aim off") from one cause: its game basis defined
   * right = cross(up, forward), while a PlayCanvas entity's +x axis is cross(forward, up) — the
   * opposite sign. A yaw offset makes FORWARD agree and can never make RIGHT agree, because a
   * rotation preserves handedness; the fix had to be a SCALE of (−1,1,1).
   * CLOUD RACER's track frames use right = cross(fwd, up) — the SAME relation PlayCanvas uses — so
   * game coordinates and engine coordinates are already the same handedness and content can be
   * built directly in world space. `__crpc._hand()` proves it two ways at five headings: it
   * compares the camera entity's forward/right against the game frame's, AND it projects a point
   * offset along the game's +right through worldToScreen and checks it lands to the RIGHT of
   * centre. The second test is the one that would have caught Section 9's bug immediately, because
   * a mirrored scene passes the forward test and fails this one. */
  const FOV = 1.06;                                   // rad, vertical
  const cam = new pc.Entity('cam');
  cam.addComponent('camera', { fov: FOV * 180 / Math.PI, nearClip: 0.25, farClip: 900,
    clearColor: new pc.Color(0.86, 0.92, 0.99), toneMapping: POST.tone });
  app.root.addChild(cam);

  let frame = null;
  function buildPost() {
    if (!onq('post', true)) return;
    try {
      frame = new pc.CameraFrame(app, cam.camera);
      frame.rendering.samples = 1;
      frame.rendering.renderTargetScale = QC.rtScale;
      frame.rendering.toneMapping = POST.tone;         // ← the highlight rolloff, in the right space
      frame.rendering.sharpness = POST.sharpness;
      frame.bloom.intensity = QC.bloom ? POST.bloom : 0;
      /* ⚑ blurLevel is a MIP DEPTH, i.e. a pass count — 12 levels is 24 fullscreen passes for a
       * bloom whose intensity is 0.012. Section 9 can afford 12; a game that is one enormous
       * bright sky cannot, and cannot see the difference either. Tiered. */
      frame.bloom.blurLevel = QC.blur;
      frame.ssao.type = pc.SSAOTYPE_NONE;              // a floating ribbon in open sky has no creases
      frame.vignette.inner = POST.vignette.inner; frame.vignette.outer = POST.vignette.outer;
      frame.vignette.curvature = POST.vignette.curvature; frame.vignette.intensity = POST.vignette.intensity;
      frame.grading.enabled = true;
      frame.grading.saturation = POST.saturation; frame.grading.contrast = POST.contrast; frame.grading.brightness = 1.0;
      frame.fringing.intensity = POST.fringing;
      frame.update();
    } catch (e) { frame = null; }
    installDither();
  }
  /* ⚑ DITHER, injected. PlayCanvas's compose pass has none, and an 8×8 Bayer at ~1/255 is not
   * decoration on this game: the frame is mostly one enormous smooth sky gradient, which is the
   * single worst case for 8-bit banding. `composeMainEndPS` runs after the vignette and BEFORE
   * gammaCorrectOutput, so the value there is still linear — dithering it directly would put the
   * noise in the wrong space, hence the round trip through an approximate display curve. */
  const DITHER_CHUNK = [
    'float cr_bayer(vec2 p){ vec2 t = floor(mod(p, 8.0)); float b = 0.0, s = 1.0;',
    '  for (int i = 0; i < 3; i++) { vec2 f = floor(mod(t, 2.0)); b += s * (f.x + 2.0 * mod(f.x + f.y, 2.0)); s *= 4.0; t = floor(t * 0.5); }',
    '  return b / 64.0; }',
    'uniform float crDither;',
  ].join('\n');
  const DITHER_MAIN = [
    '{ vec3 cd = pow(max(result, vec3(0.0)), vec3(1.0 / 2.2));',
    '  cd += (cr_bayer(gl_FragCoord.xy) - 0.5) * crDither;',
    '  result = pow(max(cd, vec3(0.0)), vec3(2.2)); }',
  ].join('\n');
  function installDither() {
    if (!frame || POST.dither <= 0) return;
    try {
      const sh = frame.rendering.shaderChunks || (frame.rendering.shaderChunks = new Map());
      sh.set('composeMainEndPS', DITHER_CHUNK + '\n' + DITHER_MAIN);
      app.graphicsDevice.scope.resolve('crDither').setValue(POST.dither);
      frame.update();
    } catch (e) { /* the frame just ships without dither */ }
  }
  buildPost();

  // ══ TEXTURES ════════════════════════════════════════════════════════════════════════════════
  function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
  function texOf(c, srgb, wrap) {
    const t = new pc.Texture(app.graphicsDevice, { width: c.width, height: c.height, format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8,
      mipmaps: true, addressU: wrap ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE, addressV: wrap ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, anisotropy: 8 });
    t.setSource(c); return t;
  }
  /* ⚑ THE SURFACE IS THE SPEEDOMETER. v repeats every 7.75 world units, so at cruise the pattern
   * flows past 8.3 times a second and at full boost 11.7 — that beat IS the sense of speed, and it
   * is why the markings are hard-edged rather than a soft wash. The old track texture repeated
   * every ~43 units (24 repeats over a 1038-unit lap): about 1 beat per second, i.e. invisible. */
  function trackTex() {
    const S = 512, c = cvs(S), x = c.getContext('2d');
    /* ⚑ THE DECK IS NOT WHITE, AND THE FIRST VERSION'S WAS — a mistake the measurement caught
     * immediately. "High-key, almost no black" got read as "make the track white", and a white
     * surface filling a third of the frame is by definition a ZERO-saturation surface: blacks hit
     * the 0.00% target and mean saturation collapsed to 10.4% against the old build's 36.4%. A
     * bright picture is not a colourless one. So: a pale CYAN deck, alternating panel tones for
     * value rhythm, wide saturated rails, and a deep-navy kerb — the kerb is the only dark thing
     * out here, and it is what gives the ribbon a hard edge against the sky. */
    x.fillStyle = '#3f96b4'; x.fillRect(0, 0, S, S);
    x.fillStyle = '#59aec9'; for (let i = 0; i < 8; i++) x.fillRect(0, i * S / 8, S, S / 16);   // panel rhythm
    x.fillStyle = 'rgba(10,50,72,0.30)'; for (let i = 0; i < 8; i++) x.fillRect(0, i * S / 8, S, 4);
    // rails: navy kerb, then magenta, then cyan. Wide enough to hold their colour at 200 units out.
    x.fillStyle = '#12284a'; x.fillRect(0, 0, S * 0.030, S); x.fillRect(S * 0.970, 0, S * 0.030, S);
    x.fillStyle = '#ff2ad9'; x.fillRect(S * 0.030, 0, S * 0.062, S); x.fillRect(S * 0.908, 0, S * 0.062, S);
    x.fillStyle = '#00e8d4'; x.fillRect(S * 0.092, 0, S * 0.030, S); x.fillRect(S * 0.878, 0, S * 0.030, S);
    x.fillStyle = 'rgba(255,255,255,0.92)';
    for (let i = 0; i < 8; i++) { x.fillRect(S * 0.034, i * S / 8, S * 0.054, S / 18); x.fillRect(S * 0.912, i * S / 8, S * 0.054, S / 18); }
    // forward chevrons — direction of travel, and the strongest flow cue in the frame
    x.strokeStyle = '#f2fbff'; x.lineWidth = 14; x.lineCap = 'butt';
    for (let i = 0; i < 4; i++) { const y = i * S / 4 + S * 0.10;
      x.beginPath(); x.moveTo(S * 0.31, y + S * 0.078); x.lineTo(S * 0.5, y); x.lineTo(S * 0.69, y + S * 0.078); x.stroke(); }
    x.strokeStyle = '#ffd23b'; x.lineWidth = 4;
    for (let i = 0; i < 4; i++) { const y = i * S / 4 + S * 0.10;
      x.beginPath(); x.moveTo(S * 0.31, y + S * 0.100); x.lineTo(S * 0.5, y + S * 0.022); x.lineTo(S * 0.69, y + S * 0.100); x.stroke(); }
    // lane hints at the racing-line offsets, so the fast line is legible from inside the pod
    x.fillStyle = 'rgba(255,138,26,0.55)';
    for (let i = 0; i < 16; i++) { x.fillRect(S * 0.245, i * S / 16, 6, S / 30); x.fillRect(S * 0.749, i * S / 16, 6, S / 30); }
    return texOf(c, true, true);
  }
  function padTex() {
    const S = 256, c = cvs(S), x = c.getContext('2d');
    x.fillStyle = '#0c2f1c'; x.fillRect(0, 0, S, S);
    x.strokeStyle = '#7dffb0'; x.lineWidth = 16; x.lineJoin = 'miter';
    for (let i = 0; i < 5; i++) { const y = i * S / 5 + S * 0.06;
      x.beginPath(); x.moveTo(0, y + S * 0.10); x.lineTo(S / 2, y); x.lineTo(S, y + S * 0.10); x.stroke(); }
    x.fillStyle = 'rgba(190,255,220,0.35)'; x.fillRect(0, 0, S, S * 0.03); x.fillRect(0, S * 0.97, S, S * 0.03);
    return texOf(c, true, true);
  }
  function puffTex() {
    const S = 128, c = cvs(S), x = c.getContext('2d');
    for (let i = 0; i < 11; i++) {
      const a = Math.random() * TAU, r = Math.random() * S * 0.20;
      const px = S / 2 + Math.cos(a) * r, py = S / 2 + Math.sin(a) * r * 0.72, rad = S * (0.17 + Math.random() * 0.16);
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.98)'); g.addColorStop(0.5, 'rgba(255,255,255,0.62)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, TAU); x.fill();
    }
    // a cool underside so a puff reads as volume rather than a sticker
    const gg = x.createLinearGradient(0, S * 0.34, 0, S);
    gg.addColorStop(0, 'rgba(150,180,225,0)'); gg.addColorStop(1, 'rgba(126,158,210,0.34)');
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = gg; x.fillRect(0, 0, S, S);
    return texOf(c, true, false);
  }
  function liveryTex(num, tint) {
    const S = 256, c = cvs(S), x = c.getContext('2d');
    const col = `rgb(${tint[0] * 255 | 0},${tint[1] * 255 | 0},${tint[2] * 255 | 0})`;
    x.fillStyle = col; x.fillRect(0, 0, S, S);
    x.fillStyle = 'rgba(8,14,26,0.30)'; x.fillRect(0, 0, S, S);          // hold the hue, drop the value
    x.fillStyle = 'rgba(235,246,255,0.42)'; x.save(); x.translate(S / 2, S / 2); x.rotate(-0.40);
    x.fillRect(-S, -S * 0.07, S * 2, S * 0.14); x.restore();
    x.fillStyle = 'rgba(12,16,26,0.92)'; x.save(); x.translate(S / 2, S / 2); x.rotate(-0.40);
    x.fillRect(-S, S * 0.12, S * 2, S * 0.07); x.restore();
    x.fillStyle = '#0c1018'; x.font = 'bold ' + (S * 0.52) + 'px "Arial Black",Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(num), S / 2, S * 0.52);
    x.fillStyle = 'rgba(12,16,26,0.75)'; x.font = 'bold ' + (S * 0.062) + 'px "Courier New",monospace';
    x.fillText('RIPMASTER3030STUDIOS', S / 2, S * 0.13);
    return texOf(c, true, false);
  }
  const TEX = { track: trackTex(), pad: padTex(), puff: puffTex() };

  // ══ MESH HELPERS ════════════════════════════════════════════════════════════════════════════
  function meshFrom(pos, nor, uv, idx) {
    const m = new pc.Mesh(app.graphicsDevice);
    m.setPositions(pos); if (nor) m.setNormals(nor); if (uv) m.setUvs(0, uv); m.setIndices(idx);
    m.update(pc.PRIMITIVE_TRIANGLES);
    return m;
  }
  function Builder() {
    const pos = [], nor = [], uv = [], idx = [];
    return {
      pos, nor, uv, idx,
      quad(a, b, c, d, ua, ub, uc, ud) {
        const i = pos.length / 3;
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
        let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const L = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / L, n[1] / L, n[2] / L];
        [a, b, c, d].forEach(p => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); });
        [ua, ub, uc, ud].forEach(t => uv.push(t[0], t[1]));
        idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
      },
      box(cx, cy, cz, hx, hy, hz, basis) {
        // basis = [right, up, fwd] so furniture can lean with the banked track
        const R = basis ? basis[0] : [1, 0, 0], U = basis ? basis[1] : [0, 1, 0], F = basis ? basis[2] : [0, 0, 1];
        const P = (sx, sy, sz) => [cx + R[0] * sx * hx + U[0] * sy * hy + F[0] * sz * hz,
                                   cy + R[1] * sx * hx + U[1] * sy * hy + F[1] * sz * hz,
                                   cz + R[2] * sx * hx + U[2] * sy * hy + F[2] * sz * hz];
        const v = [P(-1,-1,-1), P(1,-1,-1), P(1,1,-1), P(-1,1,-1), P(-1,-1,1), P(1,-1,1), P(1,1,1), P(-1,1,1)];
        const U0 = [0, 0], U1 = [1, 0], U2 = [1, 1], U3 = [0, 1];
        this.quad(v[4], v[5], v[6], v[7], U0, U1, U2, U3);
        this.quad(v[1], v[0], v[3], v[2], U0, U1, U2, U3);
        this.quad(v[0], v[4], v[7], v[3], U0, U1, U2, U3);
        this.quad(v[5], v[1], v[2], v[6], U0, U1, U2, U3);
        this.quad(v[3], v[7], v[6], v[2], U0, U1, U2, U3);
        this.quad(v[0], v[1], v[5], v[4], U0, U1, U2, U3);
      },
      mesh() { return meshFrom(pos, nor, uv, idx); },
      empty() { return idx.length === 0; },
    };
  }
  function flatMat(name, r, g, b, o) {
    o = o || {};
    const m = new pc.StandardMaterial(); m.name = name;
    m.diffuse = new pc.Color(r, g, b);
    /* Flat colour fields: almost no specular, no metalness, so a surface's colour is its colour
     * from every angle. Realistic shading would put a gradient across every panel and the whole
     * point of this look is that it does not. */
    m.useMetalness = false; m.gloss = o.gloss == null ? 0.16 : o.gloss; m.specular = new pc.Color(0.05, 0.05, 0.05);
    if (o.map) { m.diffuseMap = o.map; m.diffuseMapTint = true; }
    if (o.tiling) m.diffuseMapTiling = new pc.Vec2(o.tiling[0], o.tiling[1]);
    if (o.emissive) { m.emissive = new pc.Color(o.emissive[0], o.emissive[1], o.emissive[2]); m.emissiveIntensity = o.emissiveIntensity || 1; }
    if (o.emissiveMap) { m.emissiveMap = o.emissiveMap; m.emissive = new pc.Color(1, 1, 1); m.emissiveIntensity = o.emissiveIntensity || 1; }
    if (o.unlit) m.useLighting = false;
    if (o.blend) { m.blendType = o.blend; m.depthWrite = false; }
    if (o.opacityMap) { m.opacityMap = o.opacityMap; m.opacityMapChannel = 'a'; m.blendType = pc.BLEND_NORMAL; m.depthWrite = false; }
    if (o.cull != null) m.cull = o.cull;
    if (o.fog === false) m.useFog = false;
    m.update(); return m;
  }

  // ══ THE CIRCUIT ═════════════════════════════════════════════════════════════════════════════
  let T = null, worldRoot = null;
  const V_REPEAT = 7.75;              // world units per texture repeat — see trackTex()
  const THICK = 1.05;                 // ribbon thickness; gives the track a silhouette from the side

  function buildCircuit(track) {
    if (worldRoot) { try { worldRoot.destroy(); } catch (e) {} }
    worldRoot = new pc.Entity('circuit'); app.root.addChild(worldRoot);
    const N = track.N, nodes = track.nodes, HW = track.halfW;
    const deck = Builder(), under = Builder(), rail = Builder(), post = Builder(), pad = Builder();

    const eL = (n, o) => [n.p[0] - n.right[0] * HW + n.up[0] * (o || 0), n.p[1] - n.right[1] * HW + n.up[1] * (o || 0), n.p[2] - n.right[2] * HW + n.up[2] * (o || 0)];
    const eR = (n, o) => [n.p[0] + n.right[0] * HW + n.up[0] * (o || 0), n.p[1] + n.right[1] * HW + n.up[1] * (o || 0), n.p[2] + n.right[2] * HW + n.up[2] * (o || 0)];

    for (let i = 0; i < N; i++) {
      const a = nodes[i], b = nodes[(i + 1) % N];
      const va = a.s / V_REPEAT, vb = (i === N - 1 ? track.len : b.s) / V_REPEAT;
      const aL = eL(a), aR = eR(a), bL = eL(b), bR = eR(b);
      deck.quad(aL, aR, bR, bL, [0, va], [1, va], [1, vb], [0, vb]);
      // underside + sides, so the ribbon is an object rather than a decal on nothing
      const aLd = eL(a, -THICK), aRd = eR(a, -THICK), bLd = eL(b, -THICK), bRd = eR(b, -THICK);
      under.quad(aRd, aLd, bLd, bRd, [0, va], [1, va], [1, vb], [0, vb]);
      under.quad(aL, aLd, bLd, bL, [0, va], [1, va], [1, vb], [0, vb]);
      under.quad(aRd, aR, bR, bRd, [0, va], [1, va], [1, vb], [0, vb]);
    }
    /* ── FURNITURE. This is the near-field optical flow, and it is the render half of "too slow".
     * Pylons every 21 u pass the camera 3.0 times a second at cruise and 4.3 at full boost; the
     * gantries every 112 u are the landmark that tells you WHERE on the lap you are, which is what
     * makes a circuit learnable. All of it goes into two meshes, so the whole circuit is 5 draws. */
    const seg = track.len / N;
    if (WANT_FURN) for (let d = 0; d < track.len; d += 21) {
      const i = CR.nodeAt(nodes, track.len, d), n = nodes[i];
      for (const sgn of [-1, 1]) {
        const base = [n.p[0] + n.right[0] * (HW + 1.5) * sgn, n.p[1] + n.right[1] * (HW + 1.5) * sgn, n.p[2] + n.right[2] * (HW + 1.5) * sgn];
        const B = [n.right, n.up, n.fwd];
        post.box(base[0] + n.up[0] * 1.4, base[1] + n.up[1] * 1.4, base[2] + n.up[2] * 1.4, 0.34, 1.5, 0.34, B);
        rail.box(base[0] + n.up[0] * 3.1, base[1] + n.up[1] * 3.1, base[2] + n.up[2] * 3.1, 0.62, 0.30, 0.30, B);
      }
    }
    if (WANT_FURN) for (let d = 0; d < track.len; d += 112) {
      const i = CR.nodeAt(nodes, track.len, d), n = nodes[i], B = [n.right, n.up, n.fwd];
      const top = 7.4;
      for (const sgn of [-1, 1]) {
        const px = n.p[0] + n.right[0] * (HW + 2.2) * sgn, py = n.p[1] + n.right[1] * (HW + 2.2) * sgn, pz = n.p[2] + n.right[2] * (HW + 2.2) * sgn;
        post.box(px + n.up[0] * top / 2, py + n.up[1] * top / 2, pz + n.up[2] * top / 2, 0.55, top / 2, 0.55, B);
      }
      rail.box(n.p[0] + n.up[0] * top, n.p[1] + n.up[1] * top, n.p[2] + n.up[2] * top, HW + 2.6, 0.62, 0.5, B);
    }
    // boost strips, floated a hair above the deck so they never z-fight
    for (const p of track.pads) {
      const i0 = CR.nodeAt(nodes, track.len, p.s0), i1 = CR.nodeAt(nodes, track.len, p.s1);
      const steps = Math.max(2, ((i1 - i0 + N) % N));
      for (let k = 0; k < steps; k++) {
        const a = nodes[(i0 + k) % N], b = nodes[(i0 + k + 1) % N];
        const pt = (n, l, o) => [n.p[0] + n.right[0] * l + n.up[0] * o, n.p[1] + n.right[1] * l + n.up[1] * o, n.p[2] + n.right[2] * l + n.up[2] * o];
        const va = k * seg / 5, vb = (k + 1) * seg / 5;
        pad.quad(pt(a, p.l0, 0.05), pt(a, p.l1, 0.05), pt(b, p.l1, 0.05), pt(b, p.l0, 0.05), [0, va], [1, va], [1, vb], [0, vb]);
      }
    }

    const matDeck = flatMat('cr-deck', 1, 1, 1, { map: TEX.track, tiling: [1, 1], gloss: 0.30 });
    const matUnder = flatMat('cr-under', 0.03, 0.42, 0.66, { gloss: 0.2 });
    const matRail = flatMat('cr-rail', 0.9, 0.05, 0.55, { emissive: [0.95, 0.05, 0.62], emissiveIntensity: 1.1, gloss: 0.4 });
    const matPost = flatMat('cr-post', 0.09, 0.14, 0.34, { gloss: 0.35 });
    const matPad = flatMat('cr-pad', 1, 1, 1, { map: TEX.pad, emissiveMap: TEX.pad, emissiveIntensity: 1.9, gloss: 0.5 });
    const parts = [[deck, matDeck], [under, matUnder], [rail, matRail], [post, matPost], [pad, matPad]];
    const mis = [];
    for (const [b, m] of parts) {
      if (b.empty()) continue;
      const mi = new pc.MeshInstance(b.mesh(), m, worldRoot);
      mi.castShadow = QC.shadows; mis.push(mi);
    }
    worldRoot.addComponent('render', { meshInstances: mis, castShadows: QC.shadows, receiveShadows: QC.shadows });
    return worldRoot;
  }

  // ══ PODS ════════════════════════════════════════════════════════════════════════════════════
  /* ⚑ AUTHORED NOSE-FIRST DOWN −Z. A PlayCanvas entity's forward is its −z axis, so a mesh built
   * nose-toward-+z would fly backwards and someone would "fix" it with a 180° yaw that then makes
   * every offset in the file read wrong. Build it the way the engine reads it. */
  function podMesh() {
    /* ⚑ LOFTED FROM CROSS-SECTIONS, because the first pod was a fan of degenerate quads and read as
     * a paper dart — flat, no volume, no silhouette. "Crisp silhouettes" is half the look brief and
     * a triangle does not have one. Six-point rings swept down the body give a low-poly hull that
     * is still flat-shaded (which is the style) but has an actual outline from every angle. */
    const b = Builder();
    const RING = [[0, 0.52], [0.80, 0.30], [0.92, -0.12], [0, -0.50], [-0.92, -0.12], [-0.80, 0.30]];
    const SEC = [                      // z, half-width, half-height, y offset
      [-1.90, 0.09, 0.09, 0.10], [-1.40, 0.40, 0.30, 0.10], [-0.60, 0.74, 0.48, 0.15],
      [ 0.15, 0.82, 0.52, 0.17], [ 0.85, 0.72, 0.44, 0.17], [ 1.40, 0.54, 0.32, 0.15],
    ];
    const ring = i => RING.map(([rx, ry]) => [rx * SEC[i][1], SEC[i][3] + ry * SEC[i][2], SEC[i][0]]);
    const U = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < SEC.length - 1; i++) {
      const a = ring(i), c = ring(i + 1);
      for (let k = 0; k < RING.length; k++) {
        const k2 = (k + 1) % RING.length;
        b.quad(a[k], a[k2], c[k2], c[k], U[0], U[1], U[2], U[3]);
      }
    }
    // caps, so the hull is closed and never shows an interior face against the sky
    const nose = ring(0), tail = ring(SEC.length - 1);
    for (let k = 1; k < RING.length - 1; k++) {
      b.quad(nose[0], nose[k + 1], nose[k], nose[k], U[0], U[1], U[2], U[3]);
      b.quad(tail[0], tail[k], tail[k + 1], tail[k + 1], U[0], U[1], U[2], U[3]);
    }
    // swept wings: solid plates with thickness, so they hold an edge against a bright sky
    for (const sgn of [-1, 1]) {
      const iy = 0.10, oy = 0.16, t = 0.07;
      const i0 = [sgn * 0.80, iy, 0.10], i1 = [sgn * 0.74, iy, 1.05];
      const o0 = [sgn * 1.62, oy, 0.95], o1 = [sgn * 1.48, oy, 1.52];
      const up = d => [d[0], d[1] + t, d[2]], dn = d => [d[0], d[1] - t, d[2]];
      b.quad(up(i0), up(o0), up(o1), up(i1), U[0], U[1], U[2], U[3]);
      b.quad(dn(i1), dn(o1), dn(o0), dn(i0), U[0], U[1], U[2], U[3]);
      b.quad(up(o0), dn(o0), dn(o1), up(o1), U[0], U[1], U[2], U[3]);
      b.quad(up(i1), up(o1), dn(o1), dn(i1), U[0], U[1], U[2], U[3]);
      // winglet
      b.quad(up(o0), up(o1), [sgn * 1.58, 0.74, 1.44], [sgn * 1.66, 0.74, 1.02], U[0], U[1], U[2], U[3]);
      // nacelle
      b.box(sgn * 0.50, 0.20, 1.05, 0.20, 0.20, 0.42, null);
    }
    // tail fin — the one vertical the eye can read the pod's roll from
    b.quad([0, 0.42, 1.05], [0, 0.42, 1.50], [0.03, 1.00, 1.44], [0.03, 1.00, 1.16], U[0], U[1], U[2], U[3]);
    b.quad([0, 0.42, 1.50], [0, 0.42, 1.05], [-0.03, 1.00, 1.16], [-0.03, 1.00, 1.44], U[0], U[1], U[2], U[3]);
    return b.mesh();
  }
  function canopyMesh() {
    const b = Builder();
    const tri = (a, c, d) => b.quad(a, c, d, d, [0.5, 1], [0, 0], [1, 0], [1, 0]);
    tri([0, 0.46, -1.02], [-0.30, 0.70, -0.24], [0.30, 0.70, -0.24]);
    tri([0, 0.46, -1.02], [0.30, 0.70, -0.24], [0, 0.64, 0.34]);
    tri([0, 0.46, -1.02], [0, 0.64, 0.34], [-0.30, 0.70, -0.24]);
    tri([0.30, 0.70, -0.24], [0, 0.64, 0.34], [0, 0.70, -0.24]);
    tri([-0.30, 0.70, -0.24], [0, 0.70, -0.24], [0, 0.64, 0.34]);
    return b.mesh();
  }
  function deckMesh() {                                       // the livery panel, uv 0..1
    const b = Builder();
    /* ⚠ SIT IT ON THE HULL. The first plate was a flat quad at y 0.58–0.66 while the lofted hull's
     * ridge tops out at 0.44 — so it floated a fifth of a unit above the pod and read as a white
     * slab pasted over the craft, which is exactly how it looked in the capture. Corner heights
     * follow the ridge: 0.445 at the cockpit, 0.415 by the tail. */
    b.quad([-0.36, 0.447, -0.55], [0.36, 0.447, -0.55], [0.34, 0.417, 0.92], [-0.34, 0.417, 0.92], [0, 1], [1, 1], [1, 0], [0, 0]);
    return b.mesh();
  }
  function glowMesh() {
    /* ⚠ TWO SMALL EXHAUSTS, NOT ONE BIG PLATE. A chase camera looks straight down the back of the
     * pod for the entire race, so this quad is the single most persistent thing in frame — and at
     * 1.48 × 0.42 units, additive, it covered the craft it was supposed to be attached to. Sized to
     * the nacelles it now belongs to, at ±0.50, which is also where an engine would actually be. */
    const b = Builder();
    for (const sgn of [-1, 1]) {
      const x0 = sgn * 0.50 - 0.19, x1 = sgn * 0.50 + 0.19;
      b.quad([x0, 0.04, 1.47], [x1, 0.04, 1.47], [x1, 0.36, 1.47], [x0, 0.36, 1.47], [0, 0], [1, 0], [1, 1], [0, 1]);
    }
    return b.mesh();
  }
  const POD = { hull: podMesh(), canopy: canopyMesh(), deck: deckMesh(), glow: glowMesh() };
  /* Flat, saturated, MID-TO-DARK. Every hue here sits well under the sky's value, so a pod is a
   * hard silhouette against it from any angle — that is the whole legibility budget, spent once. */
  const LIVERY = [
    [0.96, 0.16, 0.42], [0.14, 0.86, 0.52], [0.20, 0.55, 0.98], [0.99, 0.72, 0.10],
    [0.62, 0.28, 0.95], [0.99, 0.42, 0.14], [0.10, 0.82, 0.80], [0.92, 0.24, 0.82],
  ];
  const podEnts = [];
  function buildPods(n, pilots) {
    podEnts.forEach(e => { try { e.destroy(); } catch (err) {} }); podEnts.length = 0;
    for (let i = 0; i < n; i++) {
      const c = LIVERY[i % LIVERY.length];
      const e = new pc.Entity('pod' + i);
      const mHull = flatMat('pod-h' + i, c[0] * 0.85, c[1] * 0.85, c[2] * 0.85, { gloss: 0.42 });
      const mCan = flatMat('pod-c' + i, 0.05, 0.09, 0.14, { gloss: 0.9, emissive: [0.10, 0.34, 0.45], emissiveIntensity: 0.6 });
      /* ⚠ THE WHITE SLAB ON THE POD WAS NOT THIS PANEL, AND I CHASED IT HERE TWICE BEFORE LOOKING
       * PROPERLY. The capture showed a bright rectangle across the middle of the craft and the
       * obvious suspect was the livery panel — it is the one surface whose normal points straight
       * up at the sun, so "it is blowing out" was a plausible story. Dropping its diffuse 1.0 →
       * 0.74 → 0.42 and darkening its texture by 30% changed the picture by nothing, which is the
       * tell: if a fix moves the number zero, the object is not the object. It was the ENGINE GLOW
       * plate at the tail, 1.48 units wide and additive at intensity 3.4 — and a chase camera sits
       * directly behind the pod, so the one quad the player looks straight into all race is the one
       * I had sized like a wall. Fixed where the bug is, below. This panel is fine at 0.62.
       * (CLAUDE.md's card-35 lesson again: measure before believing the eye, then stop.) */
      const mDeck = flatMat('pod-d' + i, 0.62, 0.62, 0.62, { map: liveryTex(i + 1, c), gloss: 0.10 });
      const mGlow = flatMat('pod-g' + i, 1, 1, 1, { unlit: true, fog: false, emissive: [0.42, 0.86, 1.0], emissiveIntensity: 1.0,
        blend: pc.BLEND_ADDITIVE, cull: pc.CULLFACE_NONE });
      const mis = [new pc.MeshInstance(POD.hull, mHull, e), new pc.MeshInstance(POD.canopy, mCan, e),
        new pc.MeshInstance(POD.deck, mDeck, e), new pc.MeshInstance(POD.glow, mGlow, e)];
      mis.forEach(m => { m.castShadow = QC.shadows; });
      e.addComponent('render', { meshInstances: mis, castShadows: QC.shadows, receiveShadows: false });
      e.__glow = mGlow;
      app.root.addChild(e); podEnts.push(e);
    }
  }

  // ══ CLOUDS: mid-field puffs + near-field wisps ══════════════════════════════════════════════
  /* One dynamic quad mesh, camera-facing, rewritten each frame and sorted back-to-front — alpha
   * blending inside a single mesh cannot be sorted by the engine, so it is sorted here. Kept small
   * on purpose: the far cloudscape is painted into the skybox, so these are only the ones close
   * enough to parallax, which is the only reason to pay for a billboard at all. */
  function puffLayer(max) {
    const pos = new Float32Array(max * 4 * 3), uv = new Float32Array(max * 4 * 2), col = new Uint8Array(max * 4 * 4);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) {
      const v = i * 4, o = i * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
      const u = i * 8; uv[u] = 0; uv[u + 1] = 0; uv[u + 2] = 1; uv[u + 3] = 0; uv[u + 4] = 1; uv[u + 5] = 1; uv[u + 6] = 0; uv[u + 7] = 1;
    }
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(pos); mesh.setUvs(0, uv); mesh.setColors32(col); mesh.setIndices(idx);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return { mesh, pos, col, max };
  }
  const CLOUD = puffLayer(Math.max(QC.puffs + QC.wisps + 40, 64));
  const cloudMat = flatMat('cr-cloud', 1, 1, 1, { unlit: true, opacityMap: TEX.puff, cull: pc.CULLFACE_NONE });
  cloudMat.emissiveMap = TEX.puff; cloudMat.emissive = new pc.Color(1, 1, 1); cloudMat.emissiveIntensity = 1.0;
  cloudMat.emissiveVertexColor = true; cloudMat.diffuseVertexColor = true; cloudMat.useFog = true; cloudMat.update();
  const cloudRoot = new pc.Entity('clouds');
  {
    const mi = new pc.MeshInstance(CLOUD.mesh, cloudMat, cloudRoot);
    mi.setCustomAabb(new pc.BoundingBox(new pc.Vec3(0, 0, 0), new pc.Vec3(4000, 4000, 4000)));
    mi.castShadow = false;
    cloudRoot.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
    app.root.addChild(cloudRoot);
  }
  let puffs = [], wisps = [];
  const WANT_CLOUDS = onq('clouds', true), WANT_FURN = onq('furn', true);
  function seedClouds(track) {
    puffs = []; wisps = [];
    if (!WANT_CLOUDS) return;
    const R = CR.rng(4242);
    // mid-field: hung around the circuit so they parallax against it as you go round
    for (let i = 0; i < QC.puffs; i++) {
      const n = track.nodes[(R() * track.N) | 0];
      const off = (R() * 2 - 1), side = off > 0 ? 1 : -1;
      const dist = 26 + R() * 150;
      puffs.push({ p: [n.p[0] + n.right[0] * dist * side + (R() - 0.5) * 60, n.p[1] + (R() - 0.5) * 90 - 18, n.p[2] + n.right[2] * dist * side + (R() - 0.5) * 60],
        r: 14 + R() * 34, tint: 0.82 + R() * 0.18, a: 0.72 + R() * 0.26 });
    }
    // storm cells sit ON the track: dark, low, and they are a hazard the sim already knows about
    for (const b of track.banks) {
      const i = CR.nodeAt(track.nodes, track.len, (b.s0 + b.s1) / 2), n = track.nodes[i];
      const c = (b.l0 + b.l1) / 2;
      for (let k = 0; k < 7; k++) {
        const l = c + (R() - 0.5) * (b.l1 - b.l0) * 1.1;
        puffs.push({ p: [n.p[0] + n.right[0] * l + n.fwd[0] * (R() - 0.5) * 30 + n.up[0] * (1 + R() * 4),
                         n.p[1] + n.right[1] * l + n.fwd[1] * (R() - 0.5) * 30 + n.up[1] * (1 + R() * 4),
                         n.p[2] + n.right[2] * l + n.fwd[2] * (R() - 0.5) * 30 + n.up[2] * (1 + R() * 4)],
          r: 5 + R() * 5.5, tint: 0.36 + R() * 0.14, a: 0.92, storm: 1 });
      }
    }
    for (let i = 0; i < QC.wisps; i++) wisps.push({ s: R() * track.len, l: (R() * 2 - 1) * 42, h: (R() * 2 - 1) * 16, r: 2.2 + R() * 4.5, a: 0.5 + R() * 0.4 });
  }
  const _R = new pc.Vec3(), _U = new pc.Vec3();
  function writeClouds(camPos, meS) {
    const wt = cam.getWorldTransform();
    _R.set(wt.data[0], wt.data[1], wt.data[2]); _U.set(wt.data[4], wt.data[5], wt.data[6]);
    const list = [];
    for (const p of puffs) {
      const dx = p.p[0] - camPos[0], dy = p.p[1] - camPos[1], dz = p.p[2] - camPos[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 460 * 460) continue;
      list.push({ x: p.p[0], y: p.p[1], z: p.p[2], r: p.r, t: p.tint, a: p.a, d: d2 });
    }
    /* ⚑ NEAR-FIELD WISPS ARE THE POINT. They are recycled just ahead of the pod and fly THROUGH the
     * camera, which is the only cloud in the scene the eye can actually use to judge speed. The old
     * build's nearest cloud was 26 units off the track and 60+ from the camera, so nothing ever
     * passed you and 40 u/s read as a hover. */
    if (T) for (const w of wisps) {
      let rel = w.s - meS; rel = ((rel % T.len) + T.len) % T.len;
      if (rel > 190) { w.s = meS + 175 + Math.random() * 30; w.l = (Math.random() * 2 - 1) * 42; w.h = (Math.random() * 2 - 1) * 16; continue; }
      const f = CR.frameAt(T, w.s);
      const x = f.p[0] + f.right[0] * w.l + f.up[0] * w.h, y = f.p[1] + f.right[1] * w.l + f.up[1] * w.h, z = f.p[2] + f.right[2] * w.l + f.up[2] * w.h;
      const dx = x - camPos[0], dy = y - camPos[1], dz = z - camPos[2];
      list.push({ x, y, z, r: w.r, t: 1, a: w.a, d: dx * dx + dy * dy + dz * dz });
    }
    list.sort((a, b) => b.d - a.d);
    const P = CLOUD.pos, C = CLOUD.col;
    const n = Math.min(list.length, CLOUD.max);
    for (let i = 0; i < n; i++) {
      const b = list[i], o = i * 12, c = i * 16, rr = b.r;
      const rx = _R.x * rr, ry = _R.y * rr, rz = _R.z * rr, ux = _U.x * rr, uy = _U.y * rr, uz = _U.z * rr;
      P[o] = b.x - rx - ux; P[o + 1] = b.y - ry - uy; P[o + 2] = b.z - rz - uz;
      P[o + 3] = b.x + rx - ux; P[o + 4] = b.y + ry - uy; P[o + 5] = b.z + rz - uz;
      P[o + 6] = b.x + rx + ux; P[o + 7] = b.y + ry + uy; P[o + 8] = b.z + rz + uz;
      P[o + 9] = b.x - rx + ux; P[o + 10] = b.y - ry + uy; P[o + 11] = b.z - rz + uz;
      const R8 = Math.min(255, b.t * 255) | 0, G8 = Math.min(255, b.t * 252) | 0, B8 = Math.min(255, (b.t * 0.88 + 0.12) * 255) | 0, A8 = (b.a * 255) | 0;
      for (let k = 0; k < 4; k++) { C[c + k * 4] = R8; C[c + k * 4 + 1] = G8; C[c + k * 4 + 2] = B8; C[c + k * 4 + 3] = A8; }
    }
    for (let i = n; i < CLOUD.max; i++) { const o = i * 12; for (let k = 0; k < 12; k++) P[o + k] = 0; }
    CLOUD.mesh.setPositions(CLOUD.pos); CLOUD.mesh.setColors32(CLOUD.col);
    CLOUD.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }

  // ══ SPEED LINES ═════════════════════════════════════════════════════════════════════════════
  /* Parented to the camera, so they need no per-frame transform maths and they go through the
   * bloom like everything else — which a DOM overlay would not. Alpha rides on the material, so a
   * still pod is pin sharp and only real speed streaks. */
  const streakEnt = new pc.Entity('streaks');
  const streakMat = flatMat('cr-streak', 1, 1, 1, { unlit: true, fog: false, emissive: [1, 1, 1], emissiveIntensity: 2.2,
    blend: pc.BLEND_ADDITIVE, cull: pc.CULLFACE_NONE });
  {
    const b = Builder();
    for (let i = 0; i < 56; i++) {
      const a = i * 2.3999632, r0 = 0.42 + (i % 5) * 0.05, len = 0.34 + ((i * 13) % 7) / 7 * 0.5;
      const ca = Math.cos(a), sa = Math.sin(a), w = 0.006;
      const x0 = ca * r0, y0 = sa * r0, x1 = ca * (r0 + len), y1 = sa * (r0 + len);
      b.quad([x0 - sa * w, y0 + ca * w, -1], [x0 + sa * w, y0 - ca * w, -1], [x1 + sa * w * 2.4, y1 - ca * w * 2.4, -1], [x1 - sa * w * 2.4, y1 + ca * w * 2.4, -1],
        [0, 0], [1, 0], [1, 1], [0, 1]);
    }
    const mi = new pc.MeshInstance(b.mesh(), streakMat, streakEnt);
    mi.castShadow = false;
    mi.setCustomAabb(new pc.BoundingBox(new pc.Vec3(0, 0, -1), new pc.Vec3(4, 4, 0.1)));
    streakEnt.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
    cam.addChild(streakEnt);
    streakEnt.enabled = false;
  }

  // ══ THE RACE ════════════════════════════════════════════════════════════════════════════════
  let G = null, HOLD = onq('hold', false), realRace = false;
  const keys = {}, touch = { steer: 0, boost: false, brake: false };
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault(); });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  function readInput() {
    const steer = clamp((keys.arrowleft || keys.a ? -1 : 0) + (keys.arrowright || keys.d ? 1 : 0) + touch.steer, -1, 1);
    return { steer, boost: !!(keys.w || keys.arrowup || keys.shift || touch.boost), brake: !!(keys[' '] || keys.s || keys.arrowdown || touch.brake) };
  }

  function startRace(cfg) {
    T = CR.buildTrack({});
    buildCircuit(T);
    seedClouds(T);
    buildPods(cfg.players);
    G = CR.create({ track: T, players: cfg.players, laps: cfg.laps, cardEdge: cfg.cardEdge || 1 });
    realRace = !!cfg.real;
    if (window.CRUI) CRUI.raceStarted(G, cfg);
    applyCamera(0);
    return G;
  }

  // ── camera ──
  let camState = null;
  function applyCamera(dt) {
    if (!G) return;
    const me = G.me, P = CR.pose(G, me);
    const spd = me.v / PACE.CRUISE;
    /* The chase pulls IN as you go faster, not out. Pulling out is the intuitive move and it is
     * wrong: it shrinks everything in frame, which reduces optical flow at exactly the moment the
     * player is supposed to feel it. Coming closer to the deck while the fov opens does the
     * opposite — the track fills more of the screen and the edges move faster. */
    const back = 6.6 - clamp(spd - 1, 0, 0.5) * 1.6, lift = 2.35;
    const shake = me.slide * 0.10 + (me.bump > 0 ? me.bump * 0.16 : 0);
    const jx = shake ? (Math.random() * 2 - 1) * shake : 0, jy = shake ? (Math.random() * 2 - 1) * shake : 0;
    const px = P.p[0] - P.fwd[0] * back + P.up[0] * lift + P.right[0] * jx + P.up[0] * jy;
    const py = P.p[1] - P.fwd[1] * back + P.up[1] * lift + P.right[1] * jx + P.up[1] * jy;
    const pz = P.p[2] - P.fwd[2] * back + P.up[2] * lift + P.right[2] * jx + P.up[2] * jy;
    // a little lag, so the camera reads as a chase rather than a rigid boom
    if (!camState) camState = { x: px, y: py, z: pz };
    const k = dt ? Math.min(1, dt * 13) : 1;
    camState.x += (px - camState.x) * k; camState.y += (py - camState.y) * k; camState.z += (pz - camState.z) * k;
    cam.setPosition(camState.x, camState.y, camState.z);
    const tx = P.p[0] + P.fwd[0] * 15 + P.up[0] * 1.3, ty = P.p[1] + P.fwd[1] * 15 + P.up[1] * 1.3, tz = P.p[2] + P.fwd[2] * 15 + P.up[2] * 1.3;
    cam.lookAt(tx, ty, tz, P.up[0], P.up[1], P.up[2]);
    cam.camera.fov = (FOV * (1 + clamp(spd - 0.85, 0, 0.6) * 0.30)) * 180 / Math.PI;
    // speed streaks: only above cruise, and hard above it
    const st = clamp((spd - 1.0) * 2.4, 0, 1) * (me.boosting ? 1.15 : 0.75);
    streakEnt.enabled = st > 0.03;
    if (streakEnt.enabled) { streakMat.opacity = st * 0.5; streakMat.emissiveIntensity = 1.4 + st * 2.2; streakMat.update(); }
    return P;
  }

  function syncPods() {
    for (let i = 0; i < G.racers.length; i++) {
      const r = G.racers[i], e = podEnts[i]; if (!e) continue;
      const P = CR.pose(G, r);
      e.setPosition(P.p[0], P.p[1], P.p[2]);
      /* ⚑ A PlayCanvas entity's z axis is BACKWARD, so the rotation columns are (right, up, −fwd).
       * With right = cross(fwd, up), det[right, up, −fwd] = +1, i.e. it is a proper rotation —
       * which is the same algebra that says this game needs no mirror node. */
      const m = new pc.Mat4();
      m.data[0] = P.right[0]; m.data[1] = P.right[1]; m.data[2] = P.right[2]; m.data[3] = 0;
      m.data[4] = P.up[0]; m.data[5] = P.up[1]; m.data[6] = P.up[2]; m.data[7] = 0;
      m.data[8] = -P.fwd[0]; m.data[9] = -P.fwd[1]; m.data[10] = -P.fwd[2]; m.data[11] = 0;
      m.data[12] = 0; m.data[13] = 0; m.data[14] = 0; m.data[15] = 1;
      const q = new pc.Quat().setFromMat4(m);
      e.setRotation(q);
      // idle 0.35, boosting 1.85 — the exhaust is a TELL that boost is live, so the gap matters
      if (e.__glow) { const k = 0.35 + (r.boosting ? 1.3 : 0) + r.v / PACE.CRUISE * 0.20;
        if (Math.abs(e.__glow.emissiveIntensity - k) > 0.05) { e.__glow.emissiveIntensity = k; e.__glow.update(); } }
    }
  }

  let lastT = 0, ftWin = [];
  app.on('update', dtRaw => {
    const now = performance.now();
    if (lastT) { const ms = now - lastT; ftWin.push(ms); if (ftWin.length > 240) ftWin.shift(); adapt(ms, now); }
    lastT = now;
    if (!G || G.over) return;
    const dt = Math.min(0.05, dtRaw);
    if (!HOLD) CR.step(G, dt, readInput());
    syncPods();
    const P = applyCamera(dt);
    writeClouds([cam.getPosition().x, cam.getPosition().y, cam.getPosition().z], G.me.s);
    if (window.CRUI) CRUI.hud(G);
    if (G.over && window.CRUI) CRUI.finish(G, realRace);
  });
  app.start();

  // ══ DEV / VERIFICATION HOOKS ════════════════════════════════════════════════════════════════
  window.__crpc = {
    app, get G() { return G; }, get T() { return T; }, marks: MARKS,
    startRace, hold: v => { HOLD = !!v; },
    /* ⚠ A SWEEP MUST HOLD THE SAME FRAME, AND `hold()` ALONE DOES NOT. Freezing the sim stops it
     * wherever the pod happened to get to, which depends on how many frames rendered — so two runs
     * of the same sweep measured two different viewpoints and disagreed by 32 luma and 18 points of
     * saturation. Rows inside one run were still comparable; rows across runs were not, and that is
     * exactly the kind of number that gets published by mistake. Park the pod at a fixed place. */
    _pose(s, lx, v) { if (!G) return null; G.me.s = s == null ? 300 : s; G.me.lx = lx == null ? 0 : lx;
      G.me.v = v == null ? PACE.CRUISE : v; G.me.lean = 0; G.me.slip = 0; G.started = true; G.countdown = 0;
      camState = null; syncPods(); applyCamera(0);
      writeClouds([cam.getPosition().x, cam.getPosition().y, cam.getPosition().z], G.me.s);
      HOLD = true; return { s: G.me.s, lx: G.me.lx, v: G.me.v }; },
    s() { return G ? { t: +G.t.toFixed(2), lap: G.me.lap, place: G.me.place, v: Math.round(G.me.v),
      boostE: +G.me.boostE.toFixed(2), boosting: G.me.boosting, slip: +(G.me.slip || 0).toFixed(3),
      over: G.over, started: G.started, tier: TIER } : { lobby: true, tier: TIER }; },
    frames() { const a = ftWin.slice().sort((x, y) => x - y); if (!a.length) return null;
      return { n: a.length, med: +a[a.length >> 1].toFixed(1), p95: +a[Math.floor(a.length * 0.95)].toFixed(1),
        worst: +a[a.length - 1].toFixed(1), fps: +(1000 / a[a.length >> 1]).toFixed(1), rtScale: QC.rtScale, adapt: ADAPT.scale, changes: ADAPT.changes }; },
    post(o) { if (!frame) return null;
      if (o) { if (o.exposure != null) app.scene.exposure = o.exposure;
        if (o.bloom != null) frame.bloom.intensity = o.bloom;
        if (o.sat != null) frame.grading.saturation = o.sat;
        if (o.sharp != null) frame.rendering.sharpness = o.sharp;
        if (o.tone != null) frame.rendering.toneMapping = o.tone;
        frame.update(); }
      return { exposure: app.scene.exposure, bloom: frame.bloom.intensity, sat: frame.grading.saturation,
        sharp: frame.rendering.sharpness, tone: frame.rendering.toneMapping }; },
    /* ⚑ THE HANDEDNESS PROOF. Two independent tests at five headings round the lap:
     *   (a) VECTOR: the camera entity's forward/right against the game frame's fwd/right.
     *   (b) SCREEN: project a point 10 units along the game's +right through worldToScreen and
     *       check it lands to the RIGHT of screen centre.
     * (b) is the one that matters. A mirrored scene passes (a)'s forward test and fails (b), which
     * is exactly how Section 9's port shipped mirrored and produced three separate bug reports. */
    _hand() {
      if (!G || !T) return { err: 'start a race first' };
      const out = [];
      const save = G.me.s;
      for (const frac of [0, 0.2, 0.4, 0.6, 0.8]) {
        G.me.s = T.len * frac; G.me.lx = 0; G.me.lean = 0;
        camState = null; const P = applyCamera(0);
        /* ⚠ `worldToScreen` uses the camera's cached view-projection, which is only refreshed when
         * the camera actually renders. Moving the camera and projecting in the same tick reads the
         * PREVIOUS frame's matrices — which is why the first run of this test reported screenDx
         * −10998 at one heading while the vector test said everything matched. Render, then ask. */
        app.root.syncHierarchy(); app.render();
        const f = cam.forward, r = cam.right;
        const dotF = f.x * P.fwd[0] + f.y * P.fwd[1] + f.z * P.fwd[2];
        const dotR = r.x * P.right[0] + r.y * P.right[1] + r.z * P.right[2];
        /* ⚠ THE PROBE POINT HAS TO BE INSIDE THE FRUSTUM. First version sampled 10 units straight
         * out to the side of the pod, which at 6.6 units of depth is well OUTSIDE an 85° horizontal
         * fov — the projection blew up (screenDx −3792 at one heading) and the test reported a
         * failure that was entirely its own. Sample 30 ahead and 6 across, which is comfortably in
         * frame, and reject any sample that lands behind the camera instead of trusting it. */
        const wp = new pc.Vec3(P.p[0] + P.fwd[0] * 30 + P.right[0] * 6, P.p[1] + P.fwd[1] * 30 + P.right[1] * 6, P.p[2] + P.fwd[2] * 30 + P.right[2] * 6);
        const wq = new pc.Vec3(P.p[0] + P.fwd[0] * 30 - P.right[0] * 6, P.p[1] + P.fwd[1] * 30 - P.right[1] * 6, P.p[2] + P.fwd[2] * 30 - P.right[2] * 6);
        const sp = new pc.Vec3(), sq = new pc.Vec3();
        cam.camera.worldToScreen(wp, sp); cam.camera.worldToScreen(wq, sq);
        const cx = (canvas.clientWidth || canvas.width) / 2;
        out.push({ at: frac, fwdDot: +dotF.toFixed(4), rightDot: +dotR.toFixed(4),
          inFront: sp.z > 0 && sq.z > 0,
          screenR: +(sp.x - cx).toFixed(1), screenL: +(sq.x - cx).toFixed(1),
          rightIsRight: sp.z > 0 && sq.z > 0 && sp.x > cx && sq.x < cx });
      }
      G.me.s = save; camState = null; applyCamera(0);
      return { ok: out.every(o => o.fwdDot > 0.9 && o.rightDot > 0.999 && o.rightIsRight), rows: out };
    },
    /* Counts clipped pixels — the SAME measurement the 0.94 knee was derived from, so the port of
     * that number can be checked the way it was made rather than by looking at it. Needs ?grab=1. */
    _clip() {
      const g = canvas.getContext('webgl2'); if (!g) return null;
      const W = canvas.width, H = canvas.height, px = new Uint8Array(W * H * 4);
      g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, px);
      let clip = 0, sum = 0, sq = 0, blk = 0, sat = 0;
      const n = W * H;
      for (let i = 0; i < n; i++) {
        const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
        const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        sum += L; sq += L * L;
        if (r > 250 && gg > 250 && b > 250) clip++;
        if (L < 12) blk++;
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); sat += mx > 0 ? (mx - mn) / mx : 0;
      }
      const mean = sum / n;
      return { clipped: +(clip / n * 100).toFixed(4), luma: +mean.toFixed(1), rms: +Math.sqrt(sq / n - mean * mean).toFixed(1),
        blacks: +(blk / n * 100).toFixed(2), sat: +(sat / n * 100).toFixed(1) };
    },
  };
  window.CRPC = { startRace, app, cam, get G() { return G; }, touch, keys };
  if (window.CRUI) CRUI.ready();
})();

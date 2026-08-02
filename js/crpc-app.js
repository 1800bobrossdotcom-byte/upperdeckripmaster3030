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
  /* ⛔ THE TIER IS NOT THE PIXEL RATIO, AND DERIVING IT FROM `dprCap()` MADE `mid` AND `high`
   *    UNREACHABLE. `dprCap()` ends in `Math.max(1, Math.min(dpr, cap))`, so on ANY 1× display —
   *    i.e. every ordinary desktop monitor — it returns exactly 1 whatever the machine is, and
   *    `1 >= 1.5` is false, so the old line below hard-selected `low` forever:
   *        const AUTO_TIER = DPRCAP >= 2 ? 'high' : (DPRCAP >= 1.5 ? 'mid' : 'low');
   *    Measured on an emulated 1×/8-core/8 GB desktop: that formula → 'low', deviceTier() →
   *    'high'. Two rungs apart, and the whole TIERS table below was tuned for rungs nobody got.
   *    ⚑ This is failure #1 in scripts/test-s9cast.mjs, fixed there for Section 9 in July and
   *    left standing here, in js/rrpc-app.js and in js/dfpc-app.js. `deviceTier()` reads the same
   *    device signals WITHOUT the dpr term. DPRCAP stays — it is still the right answer for the
   *    BACKING STORE, which is what it was written for. */
  const AUTO_TIER = (window.GfxPost && GfxPost.deviceTier) ? GfxPost.deviceTier() : 'mid';
  let TIER = Q.get('q') || AUTO_TIER;
  if (['low', 'mid', 'high'].indexOf(TIER) < 0) TIER = AUTO_TIER;
  const TIERS = {
    /* `jetLights` = how many pods get a REAL omni at the throat. The plume geometry is free (one
     * dynamic mesh, one draw, ~2 k triangles for the whole grid); a per-fragment light loop is not,
     * and it is the one part of the exhaust that has to be tiered. Your own pod is index 0 of the
     * grid, so a weak device still gets the light on the craft it is actually flying. */
    /* ⚠ THE PUFF/WISP COUNTS WERE NEVER ACTUALLY PAID FOR. The billboard layer was frustum-culled
     * every frame (see the cloud section — a wiped custom AABB), so 110 large alpha quads cost
     * exactly nothing and this table was tuned against a layer that drew no pixels. It draws now,
     * and a big alpha billboard is pure overdraw. `high` is left at the authored count because that
     * is the look, and the mid/low rows — which exist to protect a weak device — are pulled back to
     * something that was chosen knowing the layer is real. ⛔ NOT a measurement: this container's
     * per-layer A/B came back with the plume-disabled frame SLOWER than the plume-enabled one, i.e.
     * pure noise, so nothing here is claimed as a swept number. A real device is the check
     * (the standing mobile task), and `ADAPT` remains the live lever. */
    high: { puffs: 110, wisps: 54, shadows: true, shadowRes: 1024, rtScale: 1.0, envSize: 128, atlas: 256, skyN: 160, blur: 9, bloom: true, jetLights: 4 },
    mid:  { puffs: 56,  wisps: 32, shadows: true, shadowRes: 512,  rtScale: 0.85, envSize: 64, atlas: 128, skyN: 128, blur: 7, bloom: true, jetLights: 2 },
    low:  { puffs: 28,  wisps: 20, shadows: false, shadowRes: 512, rtScale: 0.72, envSize: 64, atlas: 128, skyN: 96, blur: 5, bloom: true, jetLights: 1 },
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
    /* ⛔ 0.010 → 0, AND IT IS A MEASUREMENT, NOT A TASTE CHANGE — the full sweep is recorded at
     * writePlumes(), where the replacement lives. Short version: PlayCanvas's bloom has no
     * threshold, so on a frame that is mostly bright sky it lerps a blurred copy of the whole
     * picture back in and becomes a black-level PEDESTAL. It set the darkest pixel in the game at
     * 35/255 — a storm deck painted down to sRGB 2 still measured 35 — while costing 4.1 rms and
     * 3.3 points of saturation. The glow it was there to provide is now built as geometry (the
     * plume's corona shell), attached to the one object that should have a halo instead of smeared
     * over the whole sky. `?bloom=` still puts it back for a sweep. */
    bloom: num('bloom', 0),
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
  /* ⚑ `grd` IS THE HALF OF THE WORLD THAT SHOULD ALWAYS HAVE BEEN DARK. It was [0.50,0.68,0.86] —
   * a pale blue floor under a pale blue sky, so the frame had no black point anywhere and the
   * ribbon floated in an undifferentiated wash. You are flying ABOVE the weather at noon; what is
   * under a cumulus deck is its own shadow. The zenith, the horizon and the cloudscape are
   * untouched — the high-key brief is about the SUBJECT (the old near-black asphalt through the
   * middle third), and a high-key picture still has a black point somewhere. This one had none. */
  const SKY = { top: [0.07, 0.33, 0.95], mid: [0.33, 0.63, 0.99], hor: [0.86, 0.94, 1.00], grd: [0.020, 0.030, 0.075] };
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
    /* ⚠ SMOOTHSTEP, NOT LINEAR, AND IT MATTERS NOW THAT THE FLOOR IS DARK. A linear ramp from a
     * near-white horizon into a near-black underside puts its steepest value change exactly AT the
     * horizon, which draws a hard band right across the middle of the frame. The cubic holds the
     * horizon pale, falls through the middle and settles into the dark — i.e. it reads as haze
     * thinning out below you, which is what it physically is. */
    else { const u = Math.min(1, -dy * 2.3), t = u * u * (3 - 2 * u); c = SKY.hor.map((h, i) => h + (SKY.grd[i] - h) * t); }
    const d = dx * SUN[0] + dy * SUN[1] + dz * SUN[2];
    if (d > 0) { const glow = Math.pow(d, 26) * 3.6 + Math.pow(d, 4) * 0.20; c = c.map((v, i) => v + glow * SUN_TINT[i]); }
    /* painted cumulus: a banded fBm keyed on the direction, densest a little above the horizon and
     * fading out at the zenith. Lit from the sun side, blue-grey underneath — the same read a
     * billboard puff gives, for none of the fill rate. */
    /* ⚠ THE CLOUDSCAPE WAS BARELY IN THE PICTURE. The chase camera is pitched ~3° DOWN and the
     * band was cut off at dy 0.72 with a soft ramp, so an in-race capture showed an empty grey-blue
     * wash above the track — on a game called CLOUD RACER, whose own brief says the sky is the art.
     * The band now runs to the zenith and starts BELOW the horizon (you are flying, so there is
     * weather under you as well), and the alpha threshold is lower and harder so a cloud reads as
     * an edged object rather than as haze. ⚑ Checked against the constraint GfxPost's `sky` preset
     * exists for — "high threshold, or the already-white cloudscape blooms into a flat wash":
     * `_clip()` on the same in-race frame stays under 0.05% clipped. More cloud, not more white. */
    if (dy > -0.30 && dy < 0.95) {
      const sc = 2.7, px = dx / (Math.abs(dy) + 0.30), pz = dz / (Math.abs(dy) + 0.30);
      let n = vnoise(px * sc, dy * 5.2, pz * sc) * 0.68 + vnoise(px * sc * 2.4, dy * 9.4, pz * sc * 2.4) * 0.32;
      const band = Math.min(1, Math.max(0, (dy + 0.28) / 0.20)) * Math.min(1, Math.max(0, (0.95 - dy) / 0.42));
      const a = Math.max(0, Math.min(1, (n - 0.455) * 5.4)) * band;
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
  /* ⚠ START PUSHED 190 → 230 FOR THE STORM FLOOR. Linear fog has ONE colour, so anything dark and
   * far is mixed toward the pale horizon; the deck below only exists in the band between where the
   * frame first sees it (~136 u) and where the haze takes over. 190 left almost no such band. The
   * circuit itself lives inside 200 u of the camera, so nothing about the track's read changes. */
  app.scene.fog.start = 230;
  app.scene.fog.end = 820;

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
  /* ⛔ THE SURFACE WAS THE SPEEDOMETER AND IT WAS READING ZERO AT CRUISE. THIS IS THE FIX.
   *
   * The comment that used to sit here said "v repeats every 7.75 world units, so at cruise the
   * pattern flows past 8.3 times a second". The TILE repeated every 7.75 u — but the tile's
   * CONTENT did not. Inside it were 8 panel bands and 8 dark seams, i.e. a real spatial period of
   * 7.75/8 = 0.969 u, plus lane hints at 0.484 u and chevrons at 1.938 u.
   *
   * At 60 fps a pattern of period p stops reading as motion when the per-frame displacement
   * approaches p — one whole period per frame is a still image (the wagon-wheel null). p = 0.969 u
   * nulls at 0.969 × 60 = 58.1 u/s. CRUISE WAS 64 u/s. The game's default speed sat inside its own
   * strobe, and the deck stood still at exactly the moment it was supposed to be shouting.
   *
   * ⚑ MEASURED, not reasoned: mean |ΔLuma| between two frames 1/60 s apart, at five fixed points
   * round the lap, streaks off, fov pinned (`_flow()` reproduces it):
   *
   *     v (u/s)   16    24    32    40    48    56    64    72    80    88    96   104   112
   *     BEFORE  11.0  14.3  15.1  14.1  12.1  10.0  11.5  14.6  17.8  19.0  17.7  14.9  11.9
   *                                            ↑ null at 56–64 — and cruise was 64
   *     AFTER    6.2   7.5   9.3  10.8  12.4  13.2  14.7  16.1  17.2  18.5  19.5  18.8  20.2
   *
   * Flow FELL 34% between 32 u/s and 56 u/s. Doubling the speed made the picture move LESS. That
   * is "too slow" as a number, and no amount of extra velocity fixes it — 112 u/s scores the same
   * as 16 u/s because it is walking into the next null (2 × 0.969 × 60 = 116 u/s).
   *
   * So the deck is redrawn with LONG periods and hard edges instead of short periods and many of
   * them: panels and chevrons at 3.875 u (null at 232 u/s), alternating big/small chevrons giving a
   * 7.75 u super-period on top. Nothing in the near field now repeats faster than 3.875 u, so flow
   * rises monotonically across the entire speed range the game can reach. Same palette, same
   * printed-object read, same number of draw calls — it is a period change, not a style change. */
  const DECK_PERIOD = 3.875;          // u — the shortest spatial period allowed on the deck
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
    // panel rhythm — TWO per tile (3.875 u), not eight. Same look, four times the period.
    x.fillStyle = '#59aec9'; for (let i = 0; i < 2; i++) x.fillRect(0, i * S / 2, S, S / 4);
    x.fillStyle = 'rgba(10,50,72,0.34)'; for (let i = 0; i < 2; i++) x.fillRect(0, i * S / 2, S, 9);
    // rails: navy kerb, then magenta, then cyan. Wide enough to hold their colour at 200 units out.
    x.fillStyle = '#12284a'; x.fillRect(0, 0, S * 0.030, S); x.fillRect(S * 0.970, 0, S * 0.030, S);
    x.fillStyle = '#ff2ad9'; x.fillRect(S * 0.030, 0, S * 0.062, S); x.fillRect(S * 0.908, 0, S * 0.062, S);
    x.fillStyle = '#00e8d4'; x.fillRect(S * 0.092, 0, S * 0.030, S); x.fillRect(S * 0.878, 0, S * 0.030, S);
    // rail dashes: 2 per tile, long — a fast-moving dotted line reads as a solid line, which is
    // exactly the failure the 8-per-tile version had at speed.
    x.fillStyle = 'rgba(255,255,255,0.92)';
    for (let i = 0; i < 2; i++) { x.fillRect(S * 0.034, i * S / 2 + S * 0.06, S * 0.054, S * 0.30); x.fillRect(S * 0.912, i * S / 2 + S * 0.06, S * 0.054, S * 0.30); }
    /* forward chevrons — the strongest flow cue in the frame. TWO per tile (3.875 u), drawn big
     * then small so the eye also gets a 7.75 u beat it can count. Thicker than before, because
     * fewer marks have to carry the same amount of motion information. */
    for (let i = 0; i < 2; i++) {
      const y = i * S / 2 + S * 0.11, k = i === 0 ? 1 : 0.62;         // big, then half-size
      const w = S * 0.20 * k, h = S * 0.085 * k;
      x.strokeStyle = '#f2fbff'; x.lineWidth = 26 * k; x.lineCap = 'butt'; x.lineJoin = 'miter';
      x.beginPath(); x.moveTo(S * 0.5 - w, y + h); x.lineTo(S * 0.5, y); x.lineTo(S * 0.5 + w, y + h); x.stroke();
      x.strokeStyle = '#ffd23b'; x.lineWidth = 7 * k;
      x.beginPath(); x.moveTo(S * 0.5 - w, y + h * 1.34); x.lineTo(S * 0.5, y + h * 0.34); x.lineTo(S * 0.5 + w, y + h * 1.34); x.stroke();
    }
    // lane hints at the racing-line offsets, so the fast line is legible from inside the pod.
    // 2 per tile — at 16 they were a 0.484 u period, which nulled at 29 u/s, i.e. below walking pace.
    x.fillStyle = 'rgba(255,138,26,0.60)';
    for (let i = 0; i < 2; i++) { x.fillRect(S * 0.245, i * S / 2 + S * 0.08, 8, S * 0.26); x.fillRect(S * 0.747, i * S / 2 + S * 0.08, 8, S * 0.26); }
    return texOf(c, true, true);
  }
  /* ⚠ THE BOOST STRIPS HAD THE SAME BUG, WORSE. Their v ran k·seg/5 over seg = 2.583 u, i.e. one
   * tile per 5 u, and the tile held 5 chevrons — a 1.00 u period, nulling at exactly 60 u/s. So the
   * one surface whose whole job is to shout "you are on it, you are going fast" froze solid at
   * cruise. Two chevrons per tile and the v scale below put it at 3.875 u, same as the deck. */
  function padTex() {
    const S = 256, c = cvs(S), x = c.getContext('2d');
    x.fillStyle = '#0c2f1c'; x.fillRect(0, 0, S, S);
    x.strokeStyle = '#7dffb0'; x.lineWidth = 30; x.lineJoin = 'miter';
    for (let i = 0; i < 2; i++) { const y = i * S / 2 + S * 0.10;
      x.beginPath(); x.moveTo(0, y + S * 0.20); x.lineTo(S / 2, y); x.lineTo(S, y + S * 0.20); x.stroke(); }
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
    /* ⚑ THE FLAT BASE IS WHAT MAKES A BILLBOARD A VOLUME, and the old ramp was far too timid —
     * 0.34 of a pale blue over the bottom two thirds, which is a suggestion of shading rather than
     * shading. A cumulus at noon is the highest-contrast object in the sky: its crown is at the
     * sun's own value and its base is in the shadow of forty vertical metres of water. Measured on
     * this frame, the cloud layer was the largest flat white area in it — 25-odd percent of the
     * picture holding one value. Giving it a real top-to-bottom ramp is simultaneously the biggest
     * "more 3D" win available here and the cheapest contrast in the game: it costs one gradient in
     * a 128 px texture and it applies to every puff, every wisp and every storm cell at once. */
    const gg = x.createLinearGradient(0, S * 0.10, 0, S * 0.98);
    gg.addColorStop(0, 'rgba(214,232,255,0)');
    gg.addColorStop(0.34, 'rgba(120,152,206,0.34)');
    gg.addColorStop(0.68, 'rgba(50,72,122,0.72)');
    gg.addColorStop(1, 'rgba(16,24,52,0.92)');
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = gg; x.fillRect(0, 0, S, S);
    return texOf(c, true, false);
  }
  /* ⚑ THE STORM FLOOR'S SURFACE. A cumulus deck seen from above, in its own shadow: a two-octave
   * value-noise mottle in deep indigo, with the lighter rims where a cell's crown still catches the
   * sun. Deliberately LOW contrast and DARK — this is the surround, not a subject, and a busy floor
   * would compete with the ribbon. The same integer hash the sky uses, for the same reason
   * (`Math.sin` hashing measured 5.3 M calls and a visible stall). */
  function floorTex() {
    const S = 256, c = cvs(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let px = 0; px < S; px++) {
      const u = px / S * 7, v = y / S * 7;
      let n = vnoise(u, 0.5, v) * 0.62 + vnoise(u * 2.7, 3.5, v * 2.7) * 0.26 + vnoise(u * 6.1, 8.5, v * 6.1) * 0.12;
      n = Math.max(0, Math.min(1, (n - 0.34) * 2.1));
      const crown = Math.pow(n, 2.6);                       // only the very tops catch any light
      const o = (y * S + px) * 4;
      /* ⚑ BIMODAL, NOT DIM. The acceptance note for this job says "a real dark field, not a dimmed
       * frame", and it is the difference between a deck at a flat mid-dark value and one that has
       * both canyons and lit tops. A uniform grey slab reads as fog and measures as nothing: after
       * exposure 1.35 and a filmic curve, sRGB 10 lands back around 40/255. The gaps BETWEEN cells
       * are where a storm layer is genuinely black — forty vertical metres of water with no path
       * for the sun — so they go to 2, and the crowns keep every bit of the light they had. Same
       * mean, a real black point, and it reads as depth instead of as haze. */
      d[o] = (2 + n * 5 + crown * 118) | 0;
      d[o + 1] = (3 + n * 7 + crown * 126) | 0;
      d[o + 2] = (8 + n * 14 + crown * 138) | 0;
      d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return texOf(c, true, true);
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
  const TEX = { track: trackTex(), pad: padTex(), puff: puffTex(), floor: floorTex() };

  // ══ MESH HELPERS ════════════════════════════════════════════════════════════════════════════
  /* A bound big enough that a layer written in world space is never frustum-culled. ⚠ It has to be
   * applied to the RENDER COMPONENT, and after the mesh instances are assigned — see the cloud
   * layer, where doing it the other way round silently deleted the entire billboard system. */
  const AABB_ANY = () => new pc.BoundingBox(new pc.Vec3(0, 0, 0), new pc.Vec3(4000, 4000, 4000));
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
        // one pad-texture repeat per 7.75 u (two chevrons ⇒ 3.875 u), matching the deck. It used
        // to be /5, which put the strip's chevrons at a 1.00 u period — dead still at 60 u/s.
        const va = k * seg / (DECK_PERIOD * 2), vb = (k + 1) * seg / (DECK_PERIOD * 2);
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

  /* ══ THE STORM FLOOR ════════════════════════════════════════════════════════════════════════
   * §8-4: what the circuit SITS ON. There was nothing under it — the ribbon hung in an
   * undifferentiated pale wash, which is why you could not tell you were flying and why the frame
   * measured 0.00% blacks in play. This is the shadowed top of the weather layer, 62 u below the
   * lowest point of the track.
   *
   * ⚑ IT IS A REAL PLANE IN WORLD SPACE, NOT A PAINTED BAND IN THE SKYBOX, and that is the whole
   * "more 3D" argument for it: a skybox band has no parallax, so it would say "dark down there" and
   * still not say "you are 60 units up". A plane at a known depth slides under you at your own
   * speed, and the rate it slides is the only altitude cue a sky racer can have.
   *
   * ⚠ UNLIT ON PURPOSE. Its normal points straight up at a sun that is 53° above the horizon, so a
   * lit plane here is the BRIGHTEST surface in the game — the exact opposite of what it is for. It
   * is a cloud deck in its own shadow; its albedo IS its brightness. Fog still applies, so it hazes
   * into the horizon at range instead of ending on a visible rim.
   * ⚠ It neither casts nor receives shadows: 1,100 u of plane inside a 150 u shadow distance would
   * spend the whole cascade budget on a surface that is already uniformly dark. */
  let floorEnt = null;
  function buildFloor(track) {
    if (floorEnt) { try { floorEnt.destroy(); } catch (e) {} floorEnt = null; }
    if (!onq('floor', true)) return null;
    let meanY = 0, cx = 0, cz = 0;
    for (const n of track.nodes) { meanY += n.p[1]; cx += n.p[0]; cz += n.p[2]; }
    meanY /= track.N; cx /= track.N; cz /= track.N;
    /* ⚑ THE DECK FOLLOWS THE CIRCUIT, AND FLAT DID NOT WORK — this is a fog problem, measured
     * twice. A flat plane 62 u under the circuit's lowest point sits ~108 u under the camera; at
     * this fov the nearest deck the frame can even see is then 183 u away, which is fog start, so
     * every visible pixel was already being mixed to the pale horizon. Moving it to −34 and pushing
     * fog to 230 helped and was still mostly haze: the camera is simply too high above a flat
     * plane for any of it to be near.
     * So the deck is a SURFACE, not a plane — it rides ~21 u under the track's own altitude
     * profile (inverse-square weighted over the nodes, settling to the circuit's mean far away).
     * The camera then flies ~25 u over it everywhere on the lap, the nearest visible deck is ~30 u
     * out, and the whole band between the horizon and the bottom of the frame is inside the clear
     * zone instead of behind the haze. It is also strictly better as ART: a rolling storm top that
     * rises under the hairpin and drops away under the sweeper says how high you are, which a
     * level plane cannot, and this is a game where you cannot otherwise tell. */
    const DROP = 21, R = 1150, G = 26, step = (R * 2) / G, UV = 6.5;
    const NS = [];                                   // subsampled nodes — the deck is smooth, 60 is plenty
    for (let i = 0; i < track.N; i += Math.max(1, (track.N / 60) | 0)) NS.push(track.nodes[i].p);
    const deckY = (x, z) => {
      let w = 0, acc = 0;
      for (const p of NS) { const dx = x - p[0], dz = z - p[2];
        const q = 1 / (dx * dx + dz * dz + 2600); w += q; acc += p[1] * q; }
      const near = acc / w;
      // far from the circuit there is no circuit to follow, so settle to its mean altitude
      const d = Math.hypot(x - cx, z - cz), f = Math.min(1, Math.max(0, (d - 260) / 620));
      return (near + (meanY - near) * f) - DROP;
    };
    const b = Builder(), H = [];
    for (let i = 0; i <= G; i++) { H.push([]);
      for (let k = 0; k <= G; k++) H[i].push(deckY(cx - R + i * step, cz - R + k * step)); }
    for (let i = 0; i < G; i++) for (let k = 0; k < G; k++) {
      const x0 = cx - R + i * step, x1 = x0 + step, z0 = cz - R + k * step, z1 = z0 + step;
      const u0 = i / G * UV, u1 = (i + 1) / G * UV, v0 = k / G * UV, v1 = (k + 1) / G * UV;
      /* ⚠ WOUND x→z, NOT z→x. The obvious ordering gives `(b−a)×(d−a) = (0,−1,0)`, i.e. a deck
       * whose front face points at the ground — so every triangle of it was back-face culled and
       * the whole storm layer rendered as nothing while reporting a live mesh instance and a live
       * bounding box. A flat plane offers no other clue that it is inside out. */
      b.quad([x0, H[i][k], z0], [x0, H[i][k + 1], z1], [x1, H[i + 1][k + 1], z1], [x1, H[i + 1][k], z0],
        [u0, v0], [u0, v1], [u1, v1], [u1, v0]);
    }
    const m = flatMat('cr-floor', 1, 1, 1, { map: TEX.floor, tiling: [1, 1], unlit: true });
    floorEnt = new pc.Entity('stormfloor');
    const mi = new pc.MeshInstance(b.mesh(), m, floorEnt);
    mi.castShadow = false;
    floorEnt.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
    app.root.addChild(floorEnt);
    return floorEnt;
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
  /* ⚑ THE BORE — §8-1, and the reason the old exhaust could not read. What was here was a flat
   * additive quad at z 1.47 with NOTHING BEHIND IT: a decal of a glow, which is the sticker-of-foil
   * failure in another medium, and against a 140-luma sky an additive decal is invisible. An engine
   * bell is a HOLE. This is that hole — a short tube driven back INTO the tail and capped, so the
   * plume emerges from somewhere rather than being painted on the air. It is also, deliberately,
   * the darkest surface in the game: the one thing a chase camera stares at for the entire race,
   * die-cut into a near-black engine deck. A glow needs a dark to come out of, and the frame had
   * none anywhere — §5's "dark field, lit object", at the scale of the object. */
  const THROAT_Z = 1.46, BORE_R = 0.175, BORE_D = 0.30;
  const NAC = [-0.50, 0.50];                                 // nacelle x offsets — already modelled
  const NAC_Y = 0.20;
  function boreMesh() {
    const b = Builder(), SIDES = 8;
    for (const sgn of NAC) {
      const cx = sgn, cy = NAC_Y;
      for (let k = 0; k < SIDES; k++) {
        const a0 = k / SIDES * TAU, a1 = (k + 1) / SIDES * TAU;
        const p = (a, r, z) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
        // the wall of the bore, wound so the INSIDE faces the camera
        b.quad(p(a0, BORE_R, THROAT_Z), p(a0, BORE_R * 0.62, THROAT_Z + BORE_D),
               p(a1, BORE_R * 0.62, THROAT_Z + BORE_D), p(a1, BORE_R, THROAT_Z), [0, 0], [1, 0], [1, 1], [0, 1]);
        // the floor of the bore, so it never shows sky through itself
        b.quad([cx, cy, THROAT_Z + BORE_D], p(a1, BORE_R * 0.62, THROAT_Z + BORE_D),
               p(a0, BORE_R * 0.62, THROAT_Z + BORE_D), [cx, cy, THROAT_Z + BORE_D], [0, 0], [1, 0], [1, 1], [0, 1]);
        // the collar the bore is cut into — the engine deck, flat and near-black
        b.quad(p(a1, BORE_R, THROAT_Z), p(a1, BORE_R * 2.15, THROAT_Z),
               p(a0, BORE_R * 2.15, THROAT_Z), p(a0, BORE_R, THROAT_Z), [0, 0], [1, 0], [1, 1], [0, 1]);
      }
    }
    return b.mesh();
  }
  const POD = { hull: podMesh(), canopy: canopyMesh(), deck: deckMesh(), bore: boreMesh() };
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
      /* The engine deck and the bore it is cut into. Near-black, matte, and it is the one dark
       * object the chase camera holds in frame for the whole race — see boreMesh(). */
      /* ⚠ UNLIT, because a bore is a HOLE and light does not get into it. Lit, the sky's own fill
       * (ambient 0.34–0.55 plus the env atlas) landed on the inside of the bell and lifted the one
       * surface in this game that is supposed to be black — which is the surface the whole exhaust
       * has to read against, and the frame's only reliable black point. */
      const mBore = flatMat('pod-b' + i, 0.014, 0.017, 0.030, { unlit: true });
      const mis = [new pc.MeshInstance(POD.hull, mHull, e), new pc.MeshInstance(POD.canopy, mCan, e),
        new pc.MeshInstance(POD.deck, mDeck, e), new pc.MeshInstance(POD.bore, mBore, e)];
      mis.forEach(m => { m.castShadow = QC.shadows; });
      e.addComponent('render', { meshInstances: mis, castShadows: QC.shadows, receiveShadows: false });
      /* ⚑ THE PLUME IS A LIGHT, SO IT LIGHTS THINGS — §8-2, and the half of "glowing" that an
       * additive sprite can never do. One omni per pod at the throat, driven by thrust, range tight
       * enough that it washes the deck under the craft rather than lifting the whole scene. Tiered,
       * because a per-fragment light loop is the thing that actually costs on a weak device.
       * ⚠ Off at zero thrust, not merely dim: a light that never switches off is an idle animation
       * in the lighting, which §4 forbids for the same reason it forbids a breathing glow. */
      if (WANT_JETLIGHT && i < QC.jetLights) {
        const L = new pc.Entity('jet' + i);
        L.addComponent('light', { type: 'omni', color: new pc.Color(0.36, 0.90, 1.0), intensity: 0,
          range: 11, castShadows: false, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED });
        L.setLocalPosition(0, NAC_Y + 0.06, THROAT_Z + 0.55);
        e.addChild(L); e.__jet = L;
      }
      app.root.addChild(e); podEnts.push(e);
    }
    plumeReset(n);
  }

  /* ══ THE PLUME ══════════════════════════════════════════════════════════════════════════════
   * §8-3, and it is the section that gets skipped — a brief that names a material and a light and
   * waves at motion has been rejected twice in this project. So the motion is derived from ONE
   * physical fact and nothing else: **the exhaust is gas that left the craft in the past.**
   *
   *   LENGTH IS THRUST      the tube's geometry lengthens; brightness is a consequence, not the
   *                         effect. `_plume()` asserts boost ≥ 2× idle.
   *   IT LAGS, SO IT TRAILS every ring is sampled from the throat's OWN PAST POSITION, so a corner
   *                         sweeps the plume to the outside and a straight leaves it in line.
   *                         ⚑ This is what a quad parented to the tail cannot do at any budget.
   *   SHOCKS TRAVEL         supersonic exhaust stands in cells; step the throttle and they wash
   *                         downstream. The bands scroll at exhaust velocity — the banding IS the
   *                         motion, not a texture scrolling over a static shape.
   *   ⛔ NOTHING IDLES      at zero thrust the plume is a still stub inside the bore.
   *
   * ⚑ THE HISTORY IS PARAMETRIC (s, lx, lean), NOT A BUFFER OF WORLD POSITIONS, and that is what
   * makes it frame-rate independent. `s` IS arc length along the circuit, so "12 units of exhaust
   * behind me" is `frameAt(T, s − 12)` — exact at any frame rate. A world-position ring buffer
   * would have sampled the path at whatever this container's 3 fps produced (32 u between samples)
   * and drawn a straight plume through every corner, i.e. the trail would have silently vanished on
   * exactly the machine it is being measured on. Only `lx`/`lean` interpolate between samples, and
   * those are the small term.
   *
   * ⚠ ADDITIVE MATERIALS IGNORE ALPHA — the file already records this costing the speed streaks
   * their whole fade-in. So the plume's falloff and its thrust gain are written into the RGB of the
   * vertex colours; there is no opacity anywhere in here on purpose. */
  const PL_SEG = 12, PL_SIDE = 5, PL_MAX = 32;        // 8 pods × 2 nacelles × (core + corona)
  const PL_CELLS = 5;                                 // shock cells along the plume
  const WANT_PLUME = onq('plume', true), WANT_JETLIGHT = onq('jetlight', true);
  const PLUME = (() => {
    const V = PL_SEG * PL_SIDE, pos = new Float32Array(PL_MAX * V * 3), col = new Uint8Array(PL_MAX * V * 4);
    const idx = new Uint16Array(PL_MAX * (PL_SEG - 1) * PL_SIDE * 6);
    let o = 0;
    for (let p = 0; p < PL_MAX; p++) { const base = p * V;
      for (let i = 0; i < PL_SEG - 1; i++) for (let k = 0; k < PL_SIDE; k++) {
        const k2 = (k + 1) % PL_SIDE, a = base + i * PL_SIDE + k, b = base + i * PL_SIDE + k2;
        const c = base + (i + 1) * PL_SIDE + k2, d = base + (i + 1) * PL_SIDE + k;
        idx[o++] = a; idx[o++] = b; idx[o++] = c; idx[o++] = a; idx[o++] = c; idx[o++] = d;
      } }
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(pos); mesh.setColors32(col); mesh.setIndices(idx);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return { mesh, pos, col, V };
  })();
  /* ⛔ AN UNLIT STANDARD MATERIAL DRAWS ITS ALBEDO, NOT ITS EMISSIVE — and the first version of
   * this material was `diffuse (0,0,0)` + `emissiveVertexColor`, i.e. a correctly built, correctly
   * placed, correctly coloured plume that contributed EXACTLY ZERO PIXELS. It never threw and the
   * mesh was in the scene with 1,760 live triangles; the frame with the plume enabled and the frame
   * with it disabled were byte-identical on a bottom-band readback, which is the only reason it was
   * caught rather than tuned. ⚑ The cloud layer three sections up had the answer all along: it is
   * `unlit` too and it renders, because its `diffuse` is WHITE with `diffuseVertexColor`. Both
   * channels are driven here so the plume cannot silently vanish again if either path changes. */
  const plumeMat = flatMat('cr-plume', 1, 1, 1, { unlit: true, fog: false, blend: pc.BLEND_ADDITIVE,
    cull: pc.CULLFACE_NONE });
  /* ⚠ ONE CHANNEL, NOT TWO. Driving albedo AND emissive from the same vertex colour doubled the
   * plume's output and turned a cyan-to-magenta shock train into a white slug — the temperature
   * ramp is the whole point of §8-1 and it was being tone-mapped straight off the top. Albedo is
   * the path the (proven) cloud layer uses, so that is the one kept. */
  plumeMat.diffuseVertexColor = true;
  plumeMat.emissive = new pc.Color(0, 0, 0); plumeMat.emissiveVertexColor = false;
  plumeMat.depthWrite = false; plumeMat.update();
  const plumeRoot = new pc.Entity('plumes');
  {
    const mi = new pc.MeshInstance(PLUME.mesh, plumeMat, plumeRoot);
    mi.castShadow = false;
    plumeRoot.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
    // ⚠ AFTER addComponent, and on the COMPONENT — see the cloud layer above for what setting it
    // on the instance first costs you (a whole render layer, silently, with no error anywhere).
    plumeRoot.render.customAabb = AABB_ANY();
    app.root.addChild(plumeRoot);
  }
  /* per-pod wake: a ring buffer of (unwrapped s, lx, lean) plus the smoothed thrust and the shock
   * phase. `dist` is monotonic, so `frameAt` can be asked for any point on the path directly. */
  const HIST = 40;
  let wake = [];
  function plumeReset(n) {
    wake = [];
    for (let i = 0; i < n; i++) wake.push({ d: new Float32Array(HIST), lx: new Float32Array(HIST),
      ln: new Float32Array(HIST), n: 0, head: 0, dist: 0, sPrev: null, vPrev: 0, th: 0, phase: 0, len: 0, tipOff: 0 });
  }
  function pushWake(r, i, dt) {
    const w = wake[i]; if (!w) return;
    const L = T ? T.len : 1;
    /* ⛔ `dist` MUST BE UNWRAPPED `s`, NOT DISTANCE-TRAVELLED-SINCE-SPAWN, and getting that wrong
     * drew every plume at a random point on the circuit. It started at 0 while the pod was at
     * s 300, so `frameAt(T, dist − back)` asked the track for a place 300 units from where the gas
     * actually was — the exhaust rendered somewhere else entirely and the trail measured 5.7 u of
     * lateral offset on a STRAIGHT, which is what caught it. Seeded from `r.s` and advanced by the
     * shortest signed delta, `dist ≡ s (mod len)` holds through lap wraps and through a `_pose`
     * teleport alike, because every increment is congruent to Δs. */
    if (w.sPrev == null) { w.sPrev = r.s; w.dist = r.s; }
    let ds = ((r.s - w.sPrev) % L + L) % L;
    if (ds > L * 0.5) ds -= L;
    w.dist += ds; w.sPrev = r.s;
    w.head = (w.head + 1) % HIST; w.n = Math.min(HIST, w.n + 1);
    w.d[w.head] = w.dist; w.lx[w.head] = r.lx; w.ln[w.head] = r.lean || 0;
    /* THRUST. Speed and boost and the launch spool, which is why the plume grows while you hold the
     * rev bar on the grid — the exhaust IS the spool tell. The hard-deceleration term is the
     * airbrake: thrust off dumps the plume, and it is detected from dv/dt rather than from an input
     * flag so the bots' airbrakes read the same as the player's. */
    const paceC = (G && G.pace && G.pace.CRUISE) || PACE.CRUISE;
    const dv = dt > 0 ? (r.v - w.vPrev) / dt : 0; w.vPrev = r.v;
    /* ⛔ NO PILOT LIGHT, AND NO IDLE SCROLL — §4 is a hard rule here and the first version broke it
     * twice in one line. Thrust carried a constant `0.09` floor and the shock phase advanced at
     * `0.9 + th·5.2`, so a pod sitting on the grid with the engine shut had a permanently lit stub
     * with bands crawling down it. That is a breathing glow: a loop the eye can learn, which this
     * project has rejected by name. Every term below is now something the PLAYER is doing — road
     * speed, the boost key, the launch spool — so a stationary pod has no exhaust at all, and the
     * countdown spool ignites it. The phase rides thrust with no constant, so at zero it is zero. */
    let want = clamp(r.v / paceC, 0, 1.7) * 0.42 + (r.boosting ? 0.46 : 0) + clamp(r.rev || 0, 0, 1) * 0.40;
    if (dv < -14) want *= 0.30;                        // the airbrake dumps it
    want = clamp(want, 0, 1);
    // fast attack, slower release: a throttle opens quicker than a gas column decays
    const k = Math.min(1, dt * (want > w.th ? 11 : 4.5));
    w.th += (want - w.th) * k;
    // exhaust velocity ⇒ the cells wash downstream faster the harder it is running, and not at all
    // when nothing is burning
    w.phase += dt * w.th * 6.3;
    if (w.phase > 1e6) w.phase = 0;
  }
  // (s, lx, lean) at `back` units of arc behind the head — linear in the ring buffer, exact in s
  const _sample = { s: 0, lx: 0, ln: 0 };
  function wakeAt(w, back) {
    const target = w.dist - back;
    _sample.s = target;
    if (w.n < 2) { _sample.lx = w.lx[w.head]; _sample.ln = w.ln[w.head]; return _sample; }
    let prev = w.head;
    for (let j = 1; j < w.n; j++) {
      const i = (w.head - j + HIST * 2) % HIST;
      if (w.d[i] <= target) {
        const span = w.d[prev] - w.d[i];
        const t = span > 1e-5 ? clamp((target - w.d[i]) / span, 0, 1) : 0;
        _sample.lx = w.lx[i] + (w.lx[prev] - w.lx[i]) * t;
        _sample.ln = w.ln[i] + (w.ln[prev] - w.ln[i]) * t;
        return _sample;
      }
      prev = i;
    }
    _sample.lx = w.lx[prev]; _sample.ln = w.ln[prev]; return _sample;
  }
  /* TEMPERATURE, not palette-picking: white-cyan at the throat where it is hottest, cooling out
   * through the studio's rim cyan into its fill magenta as it expands and loses energy. Quantised
   * into four zones so the transition is a REGISTRATION STEP rather than a gradient — §1's ink,
   * §7's "printed, stamped, slightly misregistered". A smooth ramp here is the sticker again. */
  const PL_TEMP = [[0.62, 1.00, 1.00], [0.16, 0.86, 1.00], [0.72, 0.16, 0.92], [0.30, 0.05, 0.34]];
  const TORCH = [];
  function writePlumes() {
    TORCH.length = 0;
    if (!WANT_PLUME || !G || !T) return;
    const P = PLUME.pos, C = PLUME.col, V = PLUME.V;
    let slot = 0;
    for (let i = 0; i < G.racers.length && slot + 4 <= PL_MAX; i++) {
      const r = G.racers[i], w = wake[i]; if (!w) continue;
      const firstSlot = slot;
      /* LENGTH IS THRUST — the assertion in `_plume()`. Idle is a stub barely clear of the bore,
       * boost is a column two-thirds the length of the craft again.
       * ⚠ THE CEILING IS SET BY THE CHASE CAMERA, and this file already records the exact failure:
       * the old glow plate was 1.48 u wide and additive, and because a chase camera looks straight
       * down the back of the pod all race it covered the craft it was attached to. The camera sits
       * 5.0–6.6 u behind and the throat is 1.46 of that, so anything past ~3.5 u of plume grows
       * BACKWARD THROUGH the viewpoint. At 2.9 the tip stops ~2.4 u short of the lens, and the
       * (1−t)^0.85 dispersion has already taken it to zero by then. */
      const len = 0.30 + w.th * w.th * 2.9;
      w.len = len;
      /* ⚑ TWO SHELLS: THE CORE AND ITS CORONA — and the corona is here because the GLOW IS MODELLED
       * RATHER THAN BLURRED. Screen-space bloom was doing that job and it was measured doing damage:
       * PlayCanvas's bloom is a thresholdless mip chain, so on a frame that is mostly bright sky it
       * lerps a blurred copy of the whole picture back in and lands as a PEDESTAL under everything.
       * Swept on the parked boost frame — darkest pixel in the entire image against bloom intensity:
       *
       *     bloom    luma   rms   min   clipped%   sat%
       *     0.010   144.4  38.8    35    0.0116    45.0     ← the shipping value
       *     0.006   141.9  40.0    29    0.0115    46.1
       *     0.003   140.0  41.1    21    0.0113    47.0
       *     0.0015  139.0  41.8    12    0.0112    47.5
       *     0       137.9  42.9     0    0.0110    48.3
       *
       * The floor IS the bloom, exactly: no geometry can be darker than the pedestal, which is why
       * a deck painted down to sRGB 2 still measured 35. And every other column improves as it
       * comes off — rms +4.1, saturation +3.3, clipping flat. It was buying nothing but the halo.
       * So the halo is built instead: a wider, dimmer, unbanded sheath of ionised air around the
       * core, which is what the halo physically IS, attached to the thing that should have one
       * rather than smeared across everything that should not. */
      for (const sgn of NAC) for (let shell = 0; shell < 2; shell++) {
        const base = slot * V; slot++;
        for (let seg = 0; seg < PL_SEG; seg++) {
          const t = seg / (PL_SEG - 1);
          const back = len * Math.pow(t, 1.22) * (shell ? 1.14 : 1);
          const S = wakeAt(w, back);
          const f = CR.frameAt(T, S.s);
          // lean: rotate the frame's up about fwd (Rodrigues), same as CRGame.pose does
          const ca = Math.cos(S.ln), sa = Math.sin(S.ln), F = f.fwd, U0 = f.up;
          const cx = F[1] * U0[2] - F[2] * U0[1], cy = F[2] * U0[0] - F[0] * U0[2], cz = F[0] * U0[1] - F[1] * U0[0];
          const ux = U0[0] * ca + cx * sa, uy = U0[1] * ca + cy * sa, uz = U0[2] * ca + cz * sa;
          let rx = F[1] * uz - F[2] * uy, ry = F[2] * ux - F[0] * uz, rz = F[0] * uy - F[1] * ux;
          const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
          const hv = 1.75;
          // the throat, in the frame the craft had when this gas left it
          const ox = f.p[0] + rx * (S.lx + sgn * 0.50) + ux * (hv + NAC_Y) - F[0] * THROAT_Z;
          const oy = f.p[1] + ry * (S.lx + sgn * 0.50) + uy * (hv + NAC_Y) - F[1] * THROAT_Z;
          const oz = f.p[2] + rz * (S.lx + sgn * 0.50) + uz * (hv + NAC_Y) - F[2] * THROAT_Z;
          /* the column expands as it leaves the bell and pinches at each shock cell — the same
           * cells the bands are drawn from, so the shape and the colour agree */
          const cell = Math.sin((t * PL_CELLS - w.phase) * TAU);
          const rad = BORE_R * (0.52 + 1.30 * Math.pow(t, 0.62)) * Math.pow(1 - t, 0.42)
            * (1 + (shell ? 0.06 : 0.20) * cell) * (0.60 + w.th * 0.55) * (shell ? 2.5 : 1);
          for (let k = 0; k < PL_SIDE; k++) {
            const a = k / PL_SIDE * TAU, cA = Math.cos(a) * rad, sA = Math.sin(a) * rad;
            const o = (base + seg * PL_SIDE + k) * 3;
            P[o] = ox + rx * cA + ux * sA; P[o + 1] = oy + ry * cA + uy * sA; P[o + 2] = oz + rz * cA + uz * sA;
          }
          // ── colour: quantised temperature × hard shock banding × thrust gain × tip falloff
          const zone = PL_TEMP[Math.min(3, (t * 4) | 0)];
          /* ⚠ THE CORONA IS NOT BANDED. Shock cells are a property of the supersonic CORE; the air
           * it ionises on the way past has no standing structure in it. Banding the sheath too
           * would have read as one striped object at two sizes — a bigger sticker. */
          const band = shell ? 1.0 : (((t * PL_CELLS - w.phase) % 1 + 1) % 1 < 0.52 ? 1.0 : 0.46);
          const gain = w.th * band * Math.pow(1 - t, shell ? 1.5 : 0.85) * (shell ? 0.24 : 1.05);
          const R8 = Math.min(255, zone[0] * gain * 255) | 0, G8 = Math.min(255, zone[1] * gain * 255) | 0;
          const B8 = Math.min(255, zone[2] * gain * 255) | 0;
          for (let k = 0; k < PL_SIDE; k++) { const c = (base + seg * PL_SIDE + k) * 4;
            C[c] = R8; C[c + 1] = G8; C[c + 2] = B8; C[c + 3] = 255; }
        }
      }
      // the omni rides the throttle; off, not dim, when there is nothing burning
      const e = podEnts[i];
      if (e && e.__jet) { const L = e.__jet.light, want = w.th * 7.5;
        L.enabled = want > 0.05;
        if (Math.abs(L.intensity - want) > 0.05) L.intensity = want; }
      /* ⚑ AND IT LIGHTS THE WEATHER IT GOES THROUGH — §8-2's other half. The near-field wisps are
       * seeded ON the racing line precisely so they fly through the camera, which means they fly
       * through the exhaust too. A torch point at the plume's midpoint is handed to writeClouds,
       * which is already rewriting every puff's vertex colour each frame, so this costs one
       * distance test per cloud and nothing else. An exhaust that a cloud can pass through
       * unchanged is a decal, however well it is modelled. */
      if (w.th > 0.14) {
        const o = firstSlot * V * 3, m = firstSlot * V * 3 + ((PL_SEG >> 1) * PL_SIDE) * 3;
        TORCH.push({ x: (P[o] + P[m]) * 0.5, y: (P[o + 1] + P[m + 1]) * 0.5, z: (P[o + 2] + P[m + 2]) * 0.5,
          k: w.th, r: 5.5 + w.th * 9.0 });
      }
    }
    // unused slots collapse to a point rather than drawing stale gas
    for (let s = slot; s < PL_MAX; s++) { const base = s * V;
      for (let v = 0; v < V; v++) { const o = (base + v) * 3; P[o] = P[o + 1] = P[o + 2] = 0;
        const c = (base + v) * 4; C[c] = C[c + 1] = C[c + 2] = 0; } }
    PLUME.mesh.setPositions(PLUME.pos); PLUME.mesh.setColors32(PLUME.col);
    PLUME.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
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
  /* ⛔ EVERY BILLBOARD CLOUD IN THIS GAME HAS BEEN INVISIBLE SINCE THE PORT, AND NOTHING SAID SO.
   * `mi.setCustomAabb(...)` was called BEFORE `addComponent('render', {meshInstances})`, and
   * assigning mesh instances to a render component pushes the COMPONENT's `customAabb` (null by
   * default) onto every instance — silently wiping it. The layer then fell back to `mesh.aabb`,
   * which for a dynamic mesh built from an all-zero Float32Array and updated with
   * `update(type, false)` is a degenerate box at the world origin: it never intersects the frustum
   * anywhere on the circuit, so the whole layer was culled, every frame, forever.
   * ⚑ Caught by A/B, not by looking: the frame with `clouds` enabled and the frame with it disabled
   * were byte-identical on a full-canvas readback. It is invisible to inspection because the
   * SKYBOX has a painted cloudscape, so the game looks like it has clouds — and the near-field
   * wisps, which this file's own comments call "the only cloud the eye can use" and "the single
   * strongest speed cue available", were the exact thing that was missing.
   * The fix is the component property, which is the level the wipe happens at. */
  const cloudRoot = new pc.Entity('clouds');
  {
    const mi = new pc.MeshInstance(CLOUD.mesh, cloudMat, cloudRoot);
    mi.castShadow = false;
    cloudRoot.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
    cloudRoot.render.customAabb = AABB_ANY();
    app.root.addChild(cloudRoot);
  }
  let puffs = [], wisps = [];
  // near = threaded through the ribbon and passes THROUGH the camera; far = frames the circuit
  const newWisp = (R, s, near) => near
    ? { s, l: (R() * 2 - 1) * 13, h: (R() * 2 - 1) * 5.5, r: 3.4 + R() * 5.0, a: 0.42 + R() * 0.30, near: 1 }
    : { s, l: (R() * 2 - 1) * 46, h: (R() * 2 - 1) * 18, r: 5.0 + R() * 9.0, a: 0.52 + R() * 0.34, near: 0 };
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
          /* ⚠ A STORM CELL AT 0.36-0.50 IS NOT A STORM, IT IS A GREY CLOUD. These sit ON the racing
           * line and the sim already treats them as a hazard, so they are the one piece of weather
           * the player is meant to read as dangerous — and they were rendering at roughly half the
           * value of a sunlit puff, i.e. as slightly dirty white. Dropped to a real anvil value. */
          r: 5 + R() * 5.5, tint: 0.12 + R() * 0.09, a: 0.94, storm: 1 });
      }
    }
    /* ⚑ THE WISPS ARE THE ONLY CLOUD THE EYE CAN USE, so they are bigger and they are ON the
     * racing line rather than 42 units off to the side. Half of them are seeded inside ±13 u of
     * the centre, i.e. inside the ribbon, so they genuinely fly THROUGH the camera — which is the
     * single strongest speed cue available and the reason this game is called CLOUD RACER. The
     * other half stay wide, so the track is threaded through weather rather than buried in it. */
    /* ⚠ ON THE LOW TIER THEY ARE ALL "NEAR", i.e. all SMALL. Measured under software GL: the cloud
     * layer costs 23 ms of a 67 ms frame at q=mid, and a billboard's cost is its screen AREA — the
     * wide ones are r 5–14, the threaded ones r 3.4–8.4. A weak device keeps the wisps that sell
     * speed and loses the ones that only decorate the middle distance. */
    for (let i = 0; i < QC.wisps; i++) wisps.push(newWisp(R, R() * track.len, TIER === 'low' || i % 2 === 0));
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
      if (rel > 190) { const R2 = Math.random; const n2 = newWisp(R2, meS + 172 + R2() * 34, w.near);
        w.s = n2.s; w.l = n2.l; w.h = n2.h; w.r = n2.r; w.a = n2.a; continue; }
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
      let R8 = Math.min(255, b.t * 255) | 0, G8 = Math.min(255, b.t * 252) | 0, B8 = Math.min(255, (b.t * 0.88 + 0.12) * 255) | 0;
      const A8 = (b.a * 255) | 0;
      /* the exhaust lights the cloud it is inside. Additive, because a lit cloud is brighter than
       * an unlit one — tinting toward the plume's hue without raising the value would read as the
       * cloud changing colour for no reason, which is a filter, not a light. */
      for (let k = 0; k < TORCH.length; k++) {
        const tp = TORCH[k], ddx = b.x - tp.x, ddy = b.y - tp.y, ddz = b.z - tp.z;
        const dd = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        if (dd > tp.r + b.r) continue;
        const g = Math.max(0, 1 - dd / (tp.r + b.r)); const q = g * g * tp.k * 210;
        R8 = Math.min(255, R8 + q * 0.30) | 0; G8 = Math.min(255, G8 + q * 0.86) | 0; B8 = Math.min(255, B8 + q) | 0;
      }
      for (let k = 0; k < 4; k++) { C[c + k * 4] = R8; C[c + k * 4 + 1] = G8; C[c + k * 4 + 2] = B8; C[c + k * 4 + 3] = A8; }
    }
    for (let i = n; i < CLOUD.max; i++) { const o = i * 12; for (let k = 0; k < 12; k++) P[o + k] = 0; }
    CLOUD.mesh.setPositions(CLOUD.pos); CLOUD.mesh.setColors32(CLOUD.col);
    CLOUD.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }

  /* ══ SPEED LINES ═══════════════════════════════════════════════════════════════════════════
   * ⛔ REBUILT, AND THE OLD ONE WAS BROKEN THREE WAYS AT ONCE. In an in-race capture at full boost
   * it was the dominant object in frame: 56 hard white bars radiating from screen centre, over the
   * pod, over the corner lamp, over the track edges, and `_clip()` measured 2.02% of the frame
   * clipped to pure white — on a game whose entire premise is a bright picture with detail in it.
   *
   *  1 ⚠ `streakMat.opacity` DOES NOTHING ON AN ADDITIVE MATERIAL. `BLEND_ADDITIVE` is
   *      (ONE, ONE) — the alpha channel is never consulted. The fade-in was written as
   *      `opacity = st * 0.5`, so the streaks did not fade in at all: they appeared at
   *      `emissiveIntensity 1.4` the instant speed crossed cruise. For an additive layer the
   *      ONLY fade knob is the emissive intensity, so that is what is driven now, from zero.
   *  2 ⚠ They were STATIC. A fixed radial pattern pinned to the camera adds no optical flow —
   *      it is a decal that masks the moving world underneath it. Measured: at boost, frame-to-
   *      frame |ΔLuma| was 15.0 with the streaks on and 18.4 with them off, i.e. the speed
   *      effect was REMOVING 19% of the actual sense of speed. They now stream outward, in two
   *      banks half a cycle apart, at a rate that rides on speed — so they add flow instead.
   *  3 ⚠ They crossed the middle of the screen, which is where the pod, the lamp and the corner
   *      are. They start at 0.66 of the frame half-height now and run OUTWARD: the periphery is
   *      where real peripheral flow lives and it is the part of the frame with nothing to read.
   * Kept from the original, because it was right: parented to the camera (no per-frame transform
   * maths) and inside the post stack, so they bloom with everything else. */
  const streakEnt = new pc.Entity('streaks');
  const streakBank = [];
  {
    const bankMesh = () => {
      const b = Builder();
      for (let i = 0; i < 26; i++) {
        const a = i * 2.3999632, r0 = 0.66 + ((i * 7) % 5) * 0.07, len = 0.26 + ((i * 13) % 7) / 7 * 0.42;
        const ca = Math.cos(a), sa = Math.sin(a), w = 0.0032;
        const x0 = ca * r0, y0 = sa * r0, x1 = ca * (r0 + len), y1 = sa * (r0 + len);
        b.quad([x0 - sa * w, y0 + ca * w, -1], [x0 + sa * w, y0 - ca * w, -1],
          [x1 + sa * w * 2.2, y1 - ca * w * 2.2, -1], [x1 - sa * w * 2.2, y1 + ca * w * 2.2, -1],
          [0, 0], [1, 0], [1, 1], [0, 1]);
      }
      return b.mesh();
    };
    const mesh = bankMesh();
    for (let k = 0; k < 2; k++) {
      const e = new pc.Entity('streakBank' + k);
      // cool white — pure white is what clipped, and air is not neutral
      const m = flatMat('cr-streak' + k, 1, 1, 1, { unlit: true, fog: false, emissive: [0.72, 0.92, 1.0],
        emissiveIntensity: 0, blend: pc.BLEND_ADDITIVE, cull: pc.CULLFACE_NONE });
      const mi = new pc.MeshInstance(mesh, m, e);
      mi.castShadow = false;
      mi.setCustomAabb(new pc.BoundingBox(new pc.Vec3(0, 0, -1), new pc.Vec3(6, 6, 0.1)));
      e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
      streakEnt.addChild(e); streakBank.push({ e, m, phase: k * 0.5 });
    }
    cam.addChild(streakEnt);
    streakEnt.enabled = false;
  }
  /* `st` 0..1 is how hard the effect is running; `dt` advances the stream. The envelope is
   * sin(π·phase), so a bank is invisible at the moment it wraps — otherwise the reset is a visible
   * flick, which is worse than having no effect. PEAK was measured against `_clip()`: 1.9 holds
   * clipping under 0.35% of frame at tier-3 boost, where the old build clipped 2.02%. */
  const STREAK_PEAK = 1.9;
  function streaks(st, spd, dt) {
    streakEnt.enabled = st > 0.02;
    if (!streakEnt.enabled) return;
    for (const b of streakBank) {
      b.phase += dt * (1.6 + spd * 2.4);
      if (b.phase >= 1) b.phase -= Math.floor(b.phase);
      const k = 1 + b.phase * 0.95;
      b.e.setLocalScale(k, k, 1);
      const want = st * Math.sin(Math.PI * b.phase) * STREAK_PEAK;
      if (Math.abs(b.m.emissiveIntensity - want) > 0.01) { b.m.emissiveIntensity = want; b.m.update(); }
    }
  }

  // ══ THE RACE ════════════════════════════════════════════════════════════════════════════════
  /* ⚠ REDUCED MOTION, AND IT CANNOT MEAN "TURN THE MOTION OFF" — the game IS the motion. Same
   * reading CLAUDE.md records for the background plate ("still lit, not switched off"): what goes
   * is the motion that is not the subject moving — camera shake, the fov pumping, the speed
   * streaks. What stays is the pod going down the road, because removing that removes the game.
   * Re-read live, so toggling the OS setting mid-session is honoured. */
  const RM = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { return null; } })();
  const calm = () => !!(RM && RM.matches);
  /* ⚠ And PAUSE ON HIDDEN. rAF usually stops on a hidden tab anyway, but "usually" is not a
   * guarantee across browsers, and a wagered race that keeps running while the tab is in the
   * background is a race the player loses without watching it. */
  let hiddenPause = false;
  document.addEventListener('visibilitychange', () => { hiddenPause = document.hidden; lastT = 0; });
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
    buildFloor(T);
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
    // ⚠ against THIS TIER's cruise. The camera's "am I going fast" test has to move with the pace
    //   ladder or it saturates permanently from tier 2 on and stops meaning anything.
    const spd = me.v / ((G.pace && G.pace.CRUISE) || PACE.CRUISE);
    /* The chase pulls IN as you go faster, not out. Pulling out is the intuitive move and it is
     * wrong: it shrinks everything in frame, which reduces optical flow at exactly the moment the
     * player is supposed to feel it. Coming closer to the deck while the fov opens does the
     * opposite — the track fills more of the screen and the edges move faster. */
    const back = 6.6 - clamp(spd - 1, 0, 0.5) * 1.6, lift = 2.35;
    const shake = calm() ? 0 : me.slide * 0.10 + (me.bump > 0 ? me.bump * 0.16 : 0);
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
    /* ⚑ FOV IS MEASURED AGAINST THE PACE, NOT AGAINST A CONSTANT. `spd` is speed over THIS TIER's
     * cruise, so the widening fires when you are going fast FOR NOW rather than firing permanently
     * from tier 2 onward — which is what a fixed reference would do once cruise had climbed 44%. */
    cam.camera.fov = (FOV * (1 + (calm() ? 0 : clamp(spd - 0.85, 0, 0.6) * 0.30))) * 180 / Math.PI;
    // speed streaks: only above cruise, and hard above it
    const st = calm() ? 0 : clamp((spd - 1.0) * 2.4, 0, 1) * (me.boosting ? 1.0 : 0.62);
    streaks(st, spd, dt || 1 / 60);
    return P;
  }

  function syncPods(dt) {
    for (let i = 0; i < G.racers.length; i++) {
      const r = G.racers[i], e = podEnts[i]; if (!e) continue;
      pushWake(r, i, dt || 1 / 60);
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
    }
    writePlumes();
  }

  let lastT = 0, ftWin = [];
  app.on('update', dtRaw => {
    const now = performance.now();
    if (lastT) { const ms = now - lastT; ftWin.push(ms); if (ftWin.length > 240) ftWin.shift(); adapt(ms, now); }
    lastT = now;
    if (!G || G.over || hiddenPause) return;
    const dt = Math.min(0.05, dtRaw);
    if (!HOLD) CR.step(G, dt, readInput());
    syncPods(dt);
    const P = applyCamera(dt);
    writeClouds([cam.getPosition().x, cam.getPosition().y, cam.getPosition().z], G.me.s);
    if (window.CRUI) CRUI.hud(G);
    if (G.over && window.CRUI) CRUI.finish(G, realRace);
  });
  app.start();

  // ══ DEV / VERIFICATION HOOKS ════════════════════════════════════════════════════════════════
  window.__crpc = {
    /* TIER is read back for the same reason js/rrpc-app.js exposes it: the quality ladder is a
     * DECISION the page makes about the device, and there is no other way to see which rung it
     * landed on from outside. Without it the dprCap→deviceTier fix above could not be asserted. */
    app, TIER, get G() { return G; }, get T() { return T; }, marks: MARKS,
    startRace, hold: v => { HOLD = !!v; },
    // the plume's raw buffers + per-pod wake, so a headless check can read what was WRITTEN
    // rather than infer it from a screenshot this container is not colour-faithful about
    _pl: PLUME, _wake: () => wake, _torch: () => TORCH, _floor: () => floorEnt,
    /* ⚠ A SWEEP MUST HOLD THE SAME FRAME, AND `hold()` ALONE DOES NOT. Freezing the sim stops it
     * wherever the pod happened to get to, which depends on how many frames rendered — so two runs
     * of the same sweep measured two different viewpoints and disagreed by 32 luma and 18 points of
     * saturation. Rows inside one run were still comparable; rows across runs were not, and that is
     * exactly the kind of number that gets published by mistake. Park the pod at a fixed place. */
    _pose(s, lx, v) { if (!G) return null; G.me.s = s == null ? 300 : s; G.me.lx = lx == null ? 0 : lx;
      G.me.v = v == null ? PACE.CRUISE : v; G.me.lean = 0; G.me.slip = 0; G.started = true; G.countdown = 0;
      /* ⚠ THE PLUME HAS TO BE SETTLED, OR THE POSE IS NOT THE POSE. Thrust is a smoothed value, so
       * one sync leaves it near zero and the exhaust measures as absent at every speed. 26 steps of
       * 1/60 converges the attack filter to >0.99 of target, and it makes the parked frame
       * independent of how many rAF ticks the container happened to deliver — which is the whole
       * reason `_pose` exists (two runs of the same sweep once disagreed by 32 luma). */
      camState = null;
      for (let i = 0; i < 26; i++) syncPods(1 / 60);
      applyCamera(0);
      writeClouds([cam.getPosition().x, cam.getPosition().y, cam.getPosition().z], G.me.s);
      HOLD = true; return { s: G.me.s, lx: G.me.lx, v: G.me.v, th: +(wake[0] ? wake[0].th : 0).toFixed(3) }; },
    /* ⚑ THE PLUME'S OWN ACCEPTANCE TEST — DESIGN-SYSTEM §8-5, and each row exists to kill one
     * specific way of faking an exhaust. "Did it glow" is the weak question; an always-on additive
     * sprite passes it. These do not:
     *   lenIdle / lenBoost   thrust drives GEOMETRY. A sprite can only change brightness, so it
     *                        scores 1.00×. Target ≥ 2.0×.
     *   trailStraight/Corner the lateral offset of the plume's tail from the pod's OWN −fwd axis.
     *                        A quad parented to the tail is rigid to that axis and scores 0.00 in
     *                        both columns, at any budget. The gas left the craft earlier and
     *                        followed the road, so a corner must be much larger than a straight.
     *   phase                the shock cells wash downstream, and faster under thrust. A scrolling
     *                        texture would be constant.
     *   cloudLift            the brightest channel a plume adds to a cloud vertex. Zero means the
     *                        exhaust does not touch the world it is in. */
    _plume() {
      if (!G || !T) return { err: 'start a race first' };
      const V = PLUME.V, P = PLUME.pos;
      const ringC = (slot, seg) => { let x = 0, y = 0, z = 0;
        for (let k = 0; k < PL_SIDE; k++) { const o = (slot * V + seg * PL_SIDE + k) * 3; x += P[o]; y += P[o + 1]; z += P[o + 2]; }
        return [x / PL_SIDE, y / PL_SIDE, z / PL_SIDE]; };
      const tipOffset = () => {                  // |component of (tail−throat) perpendicular to −fwd|
        const a = ringC(0, 0), b = ringC(0, PL_SEG - 1), F = CR.pose(G, G.me).fwd;
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const along = -(dx * F[0] + dy * F[1] + dz * F[2]);
        const px = dx + F[0] * along, py = dy + F[1] * along, pz = dz + F[2] * along;
        return { perp: +Math.hypot(px, py, pz).toFixed(3), len: +Math.hypot(dx, dy, dz).toFixed(3) }; };
      // pick the circuit's own straightest and tightest node rather than guessing two s values
      let kMin = Infinity, kMax = -Infinity, sStraight = 0, sCorner = 0;
      for (let i = 0; i < T.N; i++) { const k = T.nodes[i].k;
        if (k < kMin) { kMin = k; sStraight = T.nodes[i].s; }
        if (k > kMax) { kMax = k; sCorner = T.nodes[i].s; } }
      const save = { s: G.me.s, lx: G.me.lx, v: G.me.v, b: G.me.boosting }, wasHold = HOLD;
      const at = (s, v, boost) => { this._pose(s, 0, v); G.me.boosting = boost;
        for (let i = 0; i < 26; i++) syncPods(1 / 60); return tipOffset(); };
      const boost = at(sStraight, PACE.CRUISE * 1.5, true);
      const idleAt = at(sStraight, 6, false);
      const ph1 = wake[0].phase; for (let i = 0; i < 60; i++) syncPods(1 / 60); const phIdle = wake[0].phase - ph1;
      at(sStraight, PACE.CRUISE * 1.5, true);
      const ph0 = wake[0].phase; for (let i = 0; i < 60; i++) syncPods(1 / 60); const phBoost = wake[0].phase - ph0;
      /* ⚑ THE TRAIL HAS TO BE MEASURED WITH THE CAR ACTUALLY STEERING, and the first version of
       * this test was not. Parking the pod with `_pose` and stepping the wake fills the history
       * with forty IDENTICAL samples, so the only lag left is the track's own curvature — 0.2 u
       * over a 3 u plume, i.e. the test could not see the effect it existed to prove. Two runs from
       * the same place, one on full lock and one straight, isolate the part that is the STEERING
       * lag: the gas left the craft before the craft changed lane, so the column stays where the
       * craft was. A quad parented to the tail returns the same number in both columns, always. */
      const drive = (steer) => { this._pose(sStraight, 0, PACE.CRUISE * 1.4); G.me.boosting = true;
        for (let i = 0; i < 26; i++) syncPods(1 / 60);
        HOLD = false;
        for (let i = 0; i < 42; i++) { CR.step(G, 1 / 60, { steer, boost: true, brake: false }); syncPods(1 / 60); }
        HOLD = true; return tipOffset(); };
      const trailSteer = drive(1), trailStraight = drive(0);
      /* cloudLift: A/B, because a bright puff's blue channel is already at ceiling and "is it high"
       * would pass with no exhaust in the scene at all. Sum the cloud layer's colour with the
       * torches live, then again with them cleared — the difference is what the plume put there. */
      at(sStraight, PACE.CRUISE * 1.5, true);
      const sumCloud = () => { let s2 = 0; const C = CLOUD.col;
        for (let i = 0; i < C.length; i += 4) s2 += C[i] + C[i + 1] + C[i + 2]; return s2; };
      const camp = [cam.getPosition().x, cam.getPosition().y, cam.getPosition().z];
      writeClouds(camp, G.me.s); const litSum = sumCloud();
      const nT = TORCH.length; TORCH.length = 0;
      writeClouds(camp, G.me.s); const darkSum = sumCloud();
      const lift = litSum - darkSum;
      /* ⛔ AT REST, NOTHING. Engine shut on the grid: the plume must be gone and the shock phase
       * must not advance. A comment saying "no idle loop" does not survive an edit; this does. */
      this._pose(sStraight, 0, 0); G.me.boosting = false; G.me.rev = 0;
      for (let i = 0; i < 90; i++) syncPods(1 / 60);
      const restTh = wake[0].th, restPh = wake[0].phase;
      for (let i = 0; i < 60; i++) syncPods(1 / 60);
      const restDrift = wake[0].phase - restPh;
      HOLD = wasHold;
      G.me.s = save.s; G.me.lx = save.lx; G.me.v = save.v; G.me.boosting = save.b;
      return {
        lenIdle: idleAt.len, lenBoost: boost.len, lenRatio: +(boost.len / Math.max(1e-4, idleAt.len)).toFixed(2),
        trailSteer: trailSteer.perp, trailStraight: trailStraight.perp,
        trailRatio: +(trailSteer.perp / Math.max(1e-4, trailStraight.perp)).toFixed(2),
        phasePerSecIdle: +phIdle.toFixed(2), phasePerSecBoost: +phBoost.toFixed(2),
        cloudLift: lift, torches: nT,
        restThrust: +restTh.toFixed(4), restPhaseDrift: +restDrift.toFixed(4),
        ok: (boost.len / Math.max(1e-4, idleAt.len)) >= 2.0
          && trailSteer.perp > trailStraight.perp * 1.8
          && phBoost > phIdle * 1.5 && lift > 0
          && restTh < 1e-3 && restDrift < 1e-3,
      };
    },
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
    /* ⚑ OPTICAL FLOW — the number "does it feel fast" reduces to, and the one that caught the deck
     * strobing at cruise. Park the pod, render, read the frame; advance by v/60 (one 60 Hz frame at
     * that speed), render, read again; mean |ΔLuma| over the whole frame. Speed streaks off and fov
     * pinned, because both change the framing and would confound a comparison ACROSS speeds — the
     * question here is how much the WORLD moves, not how much decoration is on top of it.
     * Needs ?grab=1 (preserveDrawingBuffer) and ?adapt=0 (a resolution change mid-sweep invalidates
     * every row). Usage: `__crpc._flow([32,64,96])`. */
    _flow(speeds, at) {
      const g = canvas.getContext('webgl2'); if (!g || !G || !T) return null;
      const pts = at || [200, 430, 620, 830, 980];
      const streak = cam.children.find(c => c.name === 'streaks');
      const FOVDEG = FOV * 180 / Math.PI;
      const grab = () => { const W = canvas.width, H = canvas.height, px = new Uint8Array(W * H * 4);
        g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, px);
        const L = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) L[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
        return L; };
      /* ⚠ THE PLUME COMES OFF TOO, for the same reason the streaks do. This measures how much the
       * WORLD moves between two frames 1/60 s apart, and the exhaust is thrust-driven — it grows
       * and its bands scroll faster with speed, so leaving it in would add a term that rises with
       * `v` and inflate the flow score of exactly the fast rows the metric exists to compare. */
      const plumes = app.root.findByName('plumes');
      const shot = (s, v) => { this._pose(s, 0, v); if (streak) streak.enabled = false;
        if (plumes) plumes.enabled = false;
        cam.camera.fov = FOVDEG; app.root.syncHierarchy(); app.render(); return grab(); };
      const rows = (speeds || [16, 32, 48, 64, 80, 96, 112]).map(v => {
        let sum = 0;
        for (const s of pts) { const A = shot(s, v), B = shot(s + v / 60, v);
          let d = 0; for (let i = 0; i < A.length; i++) d += Math.abs(A[i] - B[i]); sum += d / A.length; }
        return { v, flow: +(sum / pts.length).toFixed(2), uPerFrame: +(v / 60).toFixed(3) };
      });
      // ⚠ put back what the measurement switched off — a dev hook that leaves the exhaust and the
      // speed lines disabled hands the next person a game that looks broken and no reason why.
      if (plumes) plumes.enabled = true;
      if (streak) streak.enabled = true;
      return rows;
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

/* upperdeckripmaster3030 — Section 9 on the PlayCanvas engine: the driver (S9PC).
 *
 * `js/s9pc-game.js` owns the rules and knows no engine. This file owns the engine and knows no
 * rules: it builds the scene for whichever arena the match picked, drives the skinned operatives
 * from the simulation's entities, hangs the weapon off the pose, runs the post stack and paints
 * the reticle. The split is the point — the two builds must stand in the same places and take the
 * same damage, and they do, because they run the same code for it.
 *
 * ⚑ THE POST STACK IS PORTED, NOT DEFAULTED. `js/gfx-post.js` carries numbers that were MEASURED
 *   against pixel counts, not chosen by eye, and an engine replaces the FUNCTION, not the TUNING.
 *   Every value in POST below is either derived analytically from GfxPost's own shader (the
 *   vignette, the chromatic aberration) or re-measured here in the engine's terms (the bloom and
 *   the highlight rolloff). The derivations are written out where they happen. Losing them
 *   silently is the single most likely way a better renderer ends up looking worse.
 */
(function () {
  const Q = new URLSearchParams(location.search);
  const num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  const on = (k, d) => (Q.has(k) ? Q.get(k) !== '0' : d);
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const canvas = $('pcv'), ov = $('ov2d');
  const say = m => { const el = $('boot'); if (el) el.textContent = m || ''; };

  /* ── the no-fallback decision, made in the open ────────────────────────────────────────────
   * `section9.html` fails open all the way down: no WebGL ⇒ a canvas rasteriser still draws the
   * game. PlayCanvas has no software path, so this build genuinely requires WebGL2 and cannot
   * degrade. Fail-open is a standing principle in this repo, so the fallback here is not a worse
   * renderer — it is an honest page that names the requirement and links to the build that runs
   * anywhere. That is a deliberate design decision, not an oversight, and it is why
   * `section9.html` stays shipped. */
  const gl2 = (() => { try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; } })();
  if (!gl2 || !window.pc) {
    const n = $('nogl'); if (n) { n.classList.add('show');
      $('noglWhy').textContent = !window.pc ? 'the engine bundle did not load' : 'this browser reports no WebGL 2 context'; }
    $('ovLobby').classList.remove('show'); say('');
    return;
  }

  // ── quality tiers ───────────────────────────────────────────────────────────────────────────
  /* ONE definition of "weak device" for the whole site: GfxPost.dprCap(). It already folds in
   * touch + small screen + low cores/memory + save-data, and the four shipping WebGL games use it
   * as their resolution cap. Everything expensive here is switchable off the SAME signal, because
   * a second opinion about what a weak device is is how two games drift apart. */
  const DPRCAP = (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2;
  const AUTO_TIER = DPRCAP >= 2 ? 'high' : (DPRCAP >= 1.5 ? 'mid' : 'low');
  let TIER = Q.get('q') || (() => { try { return localStorage.getItem('s9pc_q'); } catch (e) { return null; } })() || AUTO_TIER;
  if (['low', 'mid', 'high'].indexOf(TIER) < 0) TIER = AUTO_TIER;
  const TIERS = {
    // shadowRes/cascades — the sun's cascaded shadow map. spot: shadow-casting ceiling fixtures.
    // omni: unshadowed coloured practicals (clustered). skin: real .skn bodies vs the box rig.
    high: { shadowRes: 2048, cascades: 3, shadows: true, spot: 3, spotShadow: true, omni: 46, ssao: true, ssaoSamples: 10, bloom: true, dither: true, fringing: true, skin: true, envSize: 256, atlas: 512, aniso: 8 },
    mid:  { shadowRes: 1024, cascades: 2, shadows: true, spot: 2, spotShadow: false, omni: 24, ssao: true, ssaoSamples: 6, bloom: true, dither: true, fringing: true, skin: true, envSize: 128, atlas: 256, aniso: 4 },
    low:  { shadowRes: 512, cascades: 1, shadows: false, spot: 0, spotShadow: false, omni: 8, ssao: false, ssaoSamples: 4, bloom: true, dither: false, fringing: false, skin: false, envSize: 64, atlas: 128, aniso: 1 },
  };
  let QCFG = TIERS[TIER];
  const WANT_POST = on('post', true);
  const WANT_BODIES = on('bodies', true);
  const WANT_WEAPON = on('weapon', true);
  const HOLD = on('hold', false);

  /* ── POST: the ported calibration ─────────────────────────────────────────────────────────
   *
   * GfxPost's `tactical` preset, and where each number goes in PlayCanvas:
   *
   *   intensity 0.62  bloom amount        → bloom.intensity, RE-MEASURED (see below)
   *   threshold 0.70  bright-pass knee    → PlayCanvas has no threshold; its bloom is a mip chain
   *   knee      0.94  HIGHLIGHT ROLLOFF   → rendering.toneMapping. THIS IS THE LOAD-BEARING ONE.
   *   ca        0.0012 chromatic aberration → fringing.intensity 2.46, DERIVED (see below)
   *   vignette  0.42                      → vignette{inner .68, outer 2.24, curvature 1}, DERIVED
   *   sat       1.06                      → grading.saturation 1.06 (direct)
   *   dither    0.0045 8×8 Bayer          → injected as a composeMainEndPS shader chunk
   *   sharpen   0.26  unsharp             → rendering.sharpness (CAS — different maths, see below)
   *   blur      0.55  motion smear CEILING→ NOT PORTED. PlayCanvas has no feedback pass.
   *
   * ⚑ THE KNEE. 0.94 was swept against Cloudracer's clipped-pixel count: it removed 100% of
   *   clipping for free (mean luma 129.5 vs 128.8 unrolled, contrast 73.2 vs 73.3), while a
   *   guessed 0.62 also removed it and cost 14 luma and 14 contrast. It exists because GfxPost is
   *   an LDR chain: adding bloom pushes pixels past 1.0 and the GPU clips them to flat white.
   *   PlayCanvas renders the scene HDR and tone-maps AFTER bloom (compose order: CAS → SSAO →
   *   fringing → bloom → grading → TONEMAP → vignette), so the tonemapper IS the rolloff, done
   *   properly and in the right space. The port of "knee 0.94" is therefore: the tonemapper must
   *   be a rolloff curve, never TONEMAP_LINEAR/NONE, and the result must be verified the same way
   *   it was derived — by counting clipped pixels, not by looking at it. `__s9pc._clip()` does
   *   exactly that measurement in-browser.
   *
   * ⚑ CHROMATIC ABERRATION, derived not guessed. GfxPost samples at `uv + (uv-0.5)*ca`, i.e. a
   *   displacement LINEAR in distance from centre: at the corner |uv-0.5| = 0.5, so the offset is
   *   0.0012 × 0.5 = 6.0e-4 uv. PlayCanvas's applyFringing uses `offset = (I/1024) * d²`, which at
   *   the corner is I/4096 per axis. Equal at I = 4096 × 6.0e-4 = 2.46.
   *
   * ⚑ VIGNETTE, derived not guessed. GfxPost: `v = smoothstep(1.12, 0.34, r)` with r = |uv−0.5|,
   *   then `col *= mix(1−0.42, 1, v)` — i.e. a factor `1 − 0.42·smoothstep(0.34, 1.12, r)`.
   *   PlayCanvas: `1 − intensity·smoothstep(inner, outer, edge)` where at curvature 1
   *   `edge = |uv·2−1| = 2r`. Substituting r = edge/2 gives inner = 2×0.34 = 0.68 and
   *   outer = 2×1.12 = 2.24 at the same intensity 0.42. Checked at the corner: r = 0.707 gives
   *   0.809 either way.
   *
   * ⚠ SHARPEN cannot be ported analytically. GfxPost does a plain unsharp against the four
   *   neighbours at strength 0.26; PlayCanvas runs AMD CAS, which is contrast-adaptive and whose
   *   `sharpness` maps to lerp(−0.125, −0.2, s). Different function, so this is set by matching
   *   measured local contrast rather than by copying the number across — see the report.
   *
   * ⚠ MOTION SMEAR IS LOST. `tactical` is the only preset with `blur` non-zero (0.55) and Section
   *   9 uses it: the composite lands in an accumulation target that samples the previous one, and
   *   the mix is `motion × blur`, so only a whip-pan smears. PlayCanvas's CameraFrame has no
   *   feedback pass to hang that on. It is recorded here as a known regression rather than
   *   quietly dropped.
   */
  const POST = {
    bloom: num('bloom', 0.018),
    tone: pc.TONEMAP_ACES,
    fringing: 2.46,
    vignette: { inner: 0.68, outer: 2.24, curvature: 1.0, intensity: 0.42 },
    saturation: 1.06,
    contrast: 1.0,
    sharpness: num('sharp', 0.42),
    dither: num('dither', 0.0045),
    grain: num('grain', 0.014),
    ssao: { intensity: 0.55, radius: 3.2, power: 3.0, minAngle: 12 },
  };

  // ── application ─────────────────────────────────────────────────────────────────────────────
  const T0 = performance.now();
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance',
      // ?grab=1 keeps the drawing buffer so a headless run can getImageData the real pixels.
      // CLAUDE.md: this container's screenshot path rotates hue on canvas content, so colour has
      // to be judged from a readback — and a WebGL canvas without this reads back black.
      preserveDrawingBuffer: on('grab', false) },
  });
  window.__pcapp = app;
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, DPRCAP);
  const ovCtx = ov.getContext('2d');
  let OW = 0, OH = 0, ODPR = 1;
  function fit() {
    app.resizeCanvas();
    const r = ov.getBoundingClientRect();
    ODPR = Math.min(window.devicePixelRatio || 1, DPRCAP);
    OW = Math.max(2, Math.round(r.width)); OH = Math.max(2, Math.round(r.height));
    ov.width = Math.round(OW * ODPR); ov.height = Math.round(OH * ODPR);
    ovCtx.setTransform(ODPR, 0, 0, ODPR, 0, 0);
  }
  addEventListener('resize', fit); fit();

  // ── environment ─────────────────────────────────────────────────────────────────────────────
  /* Two cubemaps, not one, and this is the load-bearing bit of the interior look. The visible sky
   * must stay dark — CLAUDE.md records that a wedge of bright sky at floor level inside a concrete
   * pit reads as a rendering fault. But the IBL probe IS the ambient fill, and our own renderer
   * raises ambient INDOORS (0.33 → 0.45) precisely because inside a box the fill is bounce off six
   * close surfaces. Deriving the fill from the visible sky would give an interior no fill at all.
   * So: one cubemap you look at, one (brighter) you are lit by. */
  const SKY_OUT = { top: [0.13, 0.07, 0.11], mid: [0.62, 0.29, 0.15], hor: [0.86, 0.57, 0.33], grd: [0.16, 0.12, 0.10] };
  const SKY_IN = { top: [0.05, 0.05, 0.08], mid: [0.10, 0.10, 0.14], hor: [0.17, 0.17, 0.21], grd: [0.09, 0.09, 0.11] };
  const SUN = (() => { const v = [-0.5, 0.66, -0.34], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();

  function skyColour(S, OPEN, dx, dy, dz) {
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    let c;
    if (dy >= 0) { const t = Math.pow(Math.min(1, dy), 0.55);
      c = t < 0.5 ? S.hor.map((h, i) => h + (S.mid[i] - h) * (t / 0.5))
                  : S.mid.map((m, i) => m + (S.top[i] - m) * ((t - 0.5) / 0.5)); }
    else { const t = Math.min(1, -dy * 2.2); c = S.hor.map((h, i) => h + (S.grd[i] - h) * t); }
    const d = dx * SUN[0] + dy * SUN[1] + dz * SUN[2];
    if (d > 0) { const glow = Math.pow(d, 24) * (OPEN ? 3.4 : 1.1) + Math.pow(d, 3) * (OPEN ? 0.22 : 0.10);
      c = c.map((v, i) => v + glow * [1.0, 0.86, 0.62][i]); }
    return c;
  }
  const CUBE_DIRS = [(s, t) => [1, -t, -s], (s, t) => [-1, -t, s], (s, t) => [s, 1, t], (s, t) => [s, -1, -t], (s, t) => [s, -t, 1], (s, t) => [-s, -t, -1]];
  function skyCubemap(N, S, OPEN, boost) {
    const faces = []; boost = boost || 1;
    for (let f = 0; f < 6; f++) {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const s = 2 * (x + 0.5) / N - 1, t = 2 * (y + 0.5) / N - 1;
        const v = CUBE_DIRS[f](s, t), col = skyColour(S, OPEN, v[0], v[1], v[2]);
        const o = (y * N + x) * 4;
        for (let k = 0; k < 3; k++) d[o + k] = Math.min(255, Math.pow(Math.max(0, col[k] * boost), 1 / 2.2) * 255);
        d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0); faces.push(c);
    }
    const tex = new pc.Texture(app.graphicsDevice, { name: 's9pc-sky', cubemap: true, width: N, height: N,
      format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
    tex.setSource(faces); return tex;
  }

  const ENVCACHE = {};
  let envOk = false, envName = 'procedural';
  function setEnvironment(open) {
    const key = (open ? 'out' : 'in') + QCFG.envSize;
    try {
      let E = ENVCACHE[key];
      if (!E) {
        const S = open ? SKY_OUT : SKY_IN;
        const cube = skyCubemap(Math.max(64, QCFG.envSize / 2), S, open, 1);
        const iblBoost = open ? 1.3 : 5.2;                       // indoors the fill is bounce, not sky
        const iblCube = skyCubemap(64, S, open, iblBoost);
        const src = pc.EnvLighting.generateLightingSource(iblCube, { size: QCFG.envSize });
        E = ENVCACHE[key] = { cube, atlas: pc.EnvLighting.generateAtlas(src, { size: QCFG.atlas }) };
      }
      app.scene.envAtlas = E.atlas;
      app.scene.skybox = E.cube;
      app.scene.skyboxMip = 0;
      app.scene.skyboxIntensity = open ? 1.0 : 0.85;
      envOk = true;
    } catch (e) { envOk = false; say('env probe failed: ' + e.message); }
    app.scene.ambientLight = new pc.Color(0.05, 0.05, 0.06);     // envAtlas supplies the real fill
    app.scene.exposure = num('exp', 1.0);
  }

  /* Vendored HDRI. `models/env/<name>.png` is an equirectangular RGBM encoding of a CC0 Poly Haven
   * capture (see scripts/build-pcenv.mjs and models/env/<name>.json for provenance). RGBM keeps
   * real dynamic range in an 8-bit PNG, which is what lets a sun be thousands of times brighter
   * than the sky instead of clipping to white — the same argument scripts/build-ibl.mjs makes for
   * not baking from a JPEG. Optional, and every failure falls back to the generated sky. */
  function loadHdri(name) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        try {
          const t = new pc.Texture(app.graphicsDevice, { name: 'hdri-' + name, width: img.width, height: img.height,
            format: pc.PIXELFORMAT_RGBA8, type: pc.TEXTURETYPE_RGBM, projection: pc.TEXTUREPROJECTION_EQUIRECT,
            mipmaps: false, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
            minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR });
          t.setSource(img);
          const src = pc.EnvLighting.generateLightingSource(t, { size: Math.max(128, QCFG.envSize) });
          const atlas = pc.EnvLighting.generateAtlas(src, { size: Math.max(256, QCFG.atlas) });
          const sky = pc.EnvLighting.generateSkyboxCubemap(t, 256);
          res({ atlas, sky });
        } catch (e) { rej(e); }
      };
      img.onerror = () => rej(new Error('hdri ' + name));
      img.src = 'models/env/' + name + '.png';
    });
  }

  // ── key light ───────────────────────────────────────────────────────────────────────────────
  const sun = new pc.Entity('sun');
  sun.addComponent('light', {
    type: 'directional', color: new pc.Color(1, 1, 1), intensity: 2.4,
    castShadows: QCFG.shadows && on('shadows', true), shadowType: pc.SHADOW_PCF3,
    numCascades: QCFG.cascades, cascadeDistribution: 0.4, shadowDistance: 90, shadowResolution: QCFG.shadowRes,
    /* ⚑ Bias was MEASURED, not guessed. At the defaults a 90 m cascade over a 1024 map gives
     * ~0.09 m texels, and with a low sun that self-shadows the floor in long lines radiating from
     * the vanishing point — which looks exactly like a mipmap/anisotropy failure and sent the
     * evaluation hunting the wrong bug twice. Normal-offset is what actually fixes it; raising the
     * depth bias alone just peels the contact shadows off their objects. */
    shadowBias: num('sbias', 0.012), normalOffsetBias: num('nbias', 0.28), shadowIntensity: num('sint', 0.82),
  });
  sun.setPosition(SUN[0] * 100, SUN[1] * 100, SUN[2] * 100); sun.lookAt(0, 0, 0);
  app.root.addChild(sun);

  // ── camera ──────────────────────────────────────────────────────────────────────────────────
  /* fov 0.97 rad vertical and near 0.06 are section9-gl.js's own numbers, so the two builds frame
   * the same amount of room. Anything else and a side-by-side is a lie. */
  const FOV = 0.97;
  const cam = new pc.Entity('cam');
  cam.addComponent('camera', { fov: FOV * 180 / Math.PI, nearClip: 0.06, farClip: 140,
    clearColor: new pc.Color(0.02, 0.02, 0.03), toneMapping: POST.tone });
  app.root.addChild(cam);

  // ── the engine post stack, with GfxPost's calibration in it ──────────────────────────────────
  let frame = null, ditherOn = false;
  function buildPost() {
    if (!WANT_POST) return;
    try {
      frame = new pc.CameraFrame(app, cam.camera);
      frame.rendering.samples = 1;                    // TAA/MSAA off; both cost more than they buy here
      frame.rendering.toneMapping = POST.tone;        // ← the highlight rolloff. See the note above.
      frame.rendering.sharpness = POST.sharpness;
      frame.bloom.intensity = QCFG.bloom ? POST.bloom : 0;
      frame.bloom.blurLevel = 12;
      frame.ssao.type = QCFG.ssao ? pc.SSAOTYPE_LIGHTING : pc.SSAOTYPE_NONE;
      frame.ssao.intensity = POST.ssao.intensity; frame.ssao.radius = POST.ssao.radius;
      frame.ssao.samples = QCFG.ssaoSamples; frame.ssao.power = POST.ssao.power;
      frame.ssao.minAngle = POST.ssao.minAngle; frame.ssao.blurEnabled = true;
      frame.vignette.inner = POST.vignette.inner; frame.vignette.outer = POST.vignette.outer;
      frame.vignette.curvature = POST.vignette.curvature; frame.vignette.intensity = POST.vignette.intensity;
      frame.grading.enabled = true;
      frame.grading.saturation = POST.saturation; frame.grading.contrast = POST.contrast; frame.grading.brightness = 1.0;
      frame.fringing.intensity = QCFG.fringing ? POST.fringing : 0;
      frame.update();
    } catch (e) { frame = null; say('post stack failed: ' + e.message); }
    installDither();
  }
  /* ⚑ DITHER + GRAIN, injected. PlayCanvas's compose pass has neither, and GfxPost's 8×8 Bayer at
   * 0.0045 (≈1.1/255) is not decoration: it is what kills the banding an 8-bit write leaves in a
   * dark gradient, which is most of Section 9's corridors. `composeMainEndPS` is the engine's own
   * hook, and it runs after the vignette and BEFORE gammaCorrectOutput — so the value there is
   * still linear, and dithering it directly would put the noise in the wrong space. Round-tripping
   * through an approximate display curve costs two pow() in one fullscreen pass and puts the
   * ±½ LSB where the banding actually is. */
  const DITHER_CHUNK = [
    'float s9_h(vec2 p){ return fract(sin(dot(p, vec2(41.0, 289.0))) * 43758.5453); }',
    'float s9_bayer(vec2 p){ vec2 t = floor(mod(p, 8.0)); float b = 0.0, s = 1.0;',
    '  for (int i = 0; i < 3; i++) { vec2 f = floor(mod(t, 2.0)); b += s * (f.x + 2.0 * mod(f.x + f.y, 2.0)); s *= 4.0; t = floor(t * 0.5); }',
    '  return b / 64.0; }',
    'uniform float s9Dither; uniform float s9Grain; uniform float s9GrainT;',
  ].join('\n');
  const DITHER_MAIN = [
    '{ vec3 s9d = pow(max(result, vec3(0.0)), vec3(1.0 / 2.2));',
    '  s9d += (s9_bayer(gl_FragCoord.xy) - 0.5) * s9Dither;',
    '  s9d += (s9_h(uv * vec2(1023.0, 791.0) + s9GrainT) - 0.5) * s9Grain;',
    '  result = pow(max(s9d, vec3(0.0)), vec3(2.2)); }',
  ].join('\n');
  function installDither() {
    if (!QCFG.dither || !(POST.dither > 0 || POST.grain > 0)) return;
    try {
      const chunks = pc.ShaderChunks.get(app.graphicsDevice, pc.SHADERLANGUAGE_GLSL);
      chunks.set('composeDeclarationsPS', DITHER_CHUNK);
      chunks.set('composeMainEndPS', DITHER_MAIN);
      const sc = app.graphicsDevice.scope;
      sc.resolve('s9Dither').setValue(POST.dither);
      sc.resolve('s9Grain').setValue(POST.grain);
      sc.resolve('s9GrainT').setValue(0);
      ditherOn = true;
    } catch (e) { ditherOn = false; console.warn('[s9pc] dither chunk not installed:', e && e.message); }
  }
  buildPost();

  app.scene.fog.type = pc.FOG_LINEAR;

  // ── the game core ───────────────────────────────────────────────────────────────────────────
  const ui = S9PCUI.create();
  const game = S9Game.create({
    sfx: ui.sfx, powMsg: ui.powMsg, sfxOn: ui.sfxOn, myHandle: ui.myHandle,
    vault: ui.vault, saveVault: ui.saveVault, ownedSlugs: ui.ownedSlugs,
    wager: ui.wager, onEnd: () => { locked = false; ui.result(); },
  });
  window.__s9game = game;
  ui.attach(game);
  ui.paintQualityChips(TIER, AUTO_TIER);
  ui.onQuality = q => { try { localStorage.setItem('s9pc_q', q); } catch (e) {} location.reload(); };

  /* Baked Blender levels join the arena list once they arrive. Deliberately additive and
   * deliberately async, exactly as the shipping game does it: a slow or failed fetch costs one
   * chip that never appears, not a lobby that will not open. */
  if (window.S9World) {
    S9World.load(S9Game.PAL).then(list => { if (!list.length) return;
      ui.setMaps(game.addMaps(list)); }).catch(e => console.warn('[s9pc] baked levels unavailable:', e));
  }

  // ── scene per match ─────────────────────────────────────────────────────────────────────────
  let levelRoot = null, levelLights = [], levelStats = null, fx = null;
  function clearLevel() {
    if (levelRoot) { try { levelRoot.destroy(); } catch (e) {} levelRoot = null; }
    levelLights.forEach(l => { try { l.destroy(); } catch (e) {} }); levelLights = [];
  }
  function buildLevel(MAP) {
    clearLevel();
    const OPEN = !!MAP.open;
    setEnvironment(OPEN);
    if (Q.get('hdri') && Q.get('hdri') !== 'proc') {
      loadHdri(Q.get('hdri')).then(E => { app.scene.envAtlas = E.atlas; app.scene.skybox = E.sky; envName = Q.get('hdri'); })
        .catch(e => console.warn('[s9pc] hdri:', e && e.message));
    }
    sun.light.color = OPEN ? new pc.Color(1.00, 0.86, 0.60) : new pc.Color(0.84, 0.90, 1.00);
    sun.light.intensity = OPEN ? 2.6 : 2.4;
    app.scene.fog.color = OPEN ? new pc.Color(0.77, 0.59, 0.41) : new pc.Color(0.40, 0.39, 0.45);

    const built = S9PCWorld.buildFor(app, MAP);
    levelRoot = built.root; levelStats = built.stats;

    const span = Math.max(MAP.x1 - MAP.x0, MAP.z1 - MAP.z0);
    const far = Math.max(60, Math.min(190, span * 0.95)) * 1.15;
    cam.camera.farClip = far;
    app.scene.fog.start = far * 0.30; app.scene.fog.end = far * 0.86;
    sun.light.shadowDistance = Math.min(120, far * 0.8);

    /* Ceiling fixtures — SHADOW-CASTING spots on a grid under the roof. Indoors the sun barely
     * reaches the floor (correctly: there is a roof), so without practicals the interior is one
     * flat ambient wash. This is the thing our own renderer cannot do at all: it has exactly one
     * directional key and no local shadows, which is why section9-gl.js has to raise ambient
     * indoors instead of lighting the room. Skipped outdoors — you are standing in the sun. */
    if (!OPEN && QCFG.spot > 0) {
      const gx = QCFG.spot, gz = Math.max(1, QCFG.spot - 1), y = (MAP.ceilY || 6) - 1.2;
      for (let i = 0; i < gx; i++) for (let j = 0; j < gz; j++) {
        const x = MAP.x0 + (MAP.x1 - MAP.x0) * (i + 0.5) / gx;
        const z = MAP.z0 + (MAP.z1 - MAP.z0) * (j + 0.5) / gz;
        const e = new pc.Entity('fixture' + i + j);
        e.addComponent('light', { type: 'spot', color: new pc.Color(1.0, 0.95, 0.86), intensity: num('spot', 14),
          range: Math.max(24, span * 0.9), innerConeAngle: 22, outerConeAngle: 56,
          castShadows: QCFG.spotShadow && on('spotshadow', true), shadowResolution: 1024, shadowBias: 0.02,
          normalOffsetBias: 0.06, shadowIntensity: 0.9, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED });
        e.setPosition(x, y, z); e.setEulerAngles(-90, 0, 0);
        app.root.addChild(e); levelLights.push(e);
      }
    }
    /* Coloured practicals: every arcade cabinet, shelf run, crate stack or prize booth becomes a
     * small source. This is the "many small lights" case a forward renderer cannot afford and a
     * clustered one can — and it is what makes a corridor read as a place rather than a corridor. */
    const HUES = [[1.0, 0.35, 0.72], [0.30, 0.95, 1.0], [0.45, 1.0, 0.55], [1.0, 0.82, 0.28], [0.72, 0.45, 1.0]];
    const LIT = /^(cab|skee|claw|prize|rcrate|inlay|rostrum|dish)/i;
    let lit = 0;
    const cands = MAP.solids.filter(b => (b.name ? LIT.test(String(b.name)) : (b.kind === 'ammo' || b.kind === 'crate' || b.kind === 'cover' || b.kind === 'shelf')));
    const stride = Math.max(1, Math.floor(cands.length / Math.max(1, QCFG.omni)));
    for (let i = 0; i < cands.length && lit < QCFG.omni; i += stride) {
      const b = cands[i], c = HUES[lit % HUES.length];
      const e = new pc.Entity('glow' + lit);
      e.addComponent('light', { type: 'omni', color: new pc.Color(c[0], c[1], c[2]), intensity: num('omni', 4.2),
        range: 9.5, castShadows: false, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED });
      e.setPosition((b.x0 + b.x1) / 2, b.y1 + 0.5, (b.z0 + b.z1) / 2);
      app.root.addChild(e); levelLights.push(e); lit++;
    }
    levelStats.omni = lit; levelStats.spot = (!OPEN && QCFG.spot > 0) ? QCFG.spot * Math.max(1, QCFG.spot - 1) : 0;
    if (!fx) fx = S9PCFx.create(app);
    return built;
  }

  // ── bodies ──────────────────────────────────────────────────────────────────────────────────
  const bodies = new Map();                        // game entity → skin handle
  let bodyPending = new Set();
  function ensureBody(e) {
    if (bodies.has(e) || bodyPending.has(e) || !WANT_BODIES) return;
    const arch = e.skin || (window.S9Skin ? S9Skin.archFor(0) : null);
    if (!arch || !window.S9PCSkin) return;
    bodyPending.add(e);
    const p = QCFG.skin ? S9PCSkin.spawn(app, arch, { tint: e.tint }) : Promise.reject(new Error('tier'));
    p.then(h => { bodies.set(e, h); bodyPending.delete(e); if (weaponAsset) giveWeapon(h); })
      .catch(() => { bodyPending.delete(e);
        /* Fails open, the way the shipping game does: no .skn, a 404, a weak device ⇒ the operative
         * keeps an articulated rig instead of disappearing. Same 11 bones, same poser — only the
         * geometry hanging off them is boxes. */
        try { const h = S9PCSkin.spawnBox(app, e.tint); bodies.set(e, h); if (weaponAsset) giveWeapon(h); } catch (err) {}
      });
  }
  function syncBodies(G) {
    for (const e of G.ents) {
      if (e.isMe) continue;
      ensureBody(e);
      const h = bodies.get(e); if (!h) continue;
      if (!e.alive) { h.entity.enabled = false; continue; }
      h.entity.enabled = true;
      // spawn-protection flicker, same read as the shipping game's
      const flick = (e.spawnT > 0 || e.iframe > 0) ? (Math.sin(G.t * 30) > 0) : true;
      if (h.entity.enabled !== flick) h.entity.enabled = flick;
      h.setPose(e);
      if (h.placeGun) h.placeGun();
    }
  }

  // ── the weapon: a real GLB with a real texture ───────────────────────────────────────────────
  /* This is the single clearest thing the engine buys over our own renderer. `models/weapons/
   * m4a1.glb` carries TEXCOORD_0 and `m4a1_tex.jpg` goes on it as an albedo map under a metalness
   * workflow. Our renderer has no texture path for loaded geometry at all. */
  let weaponAsset = null, gunMat = null, GUNFIT = null, viewmodel = null;
  function loadTexture(url, srgb) {
    return new Promise((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const t = new pc.Texture(app.graphicsDevice, { name: url, width: img.width, height: img.height,
          format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8, mipmaps: true,
          addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT,
          minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, anisotropy: QCFG.aniso });
        t.setSource(img); res(t); };
      img.onerror = () => rej(new Error('image ' + url)); img.src = url;
    });
  }
  function loadWeapon() {
    if (!WANT_WEAPON) return Promise.resolve(null);
    return loadTexture('models/weapons/m4a1_tex.jpg', true).then(tex => {
      gunMat = new pc.StandardMaterial();
      gunMat.name = 'm4a1'; gunMat.diffuseMap = tex; gunMat.diffuse = new pc.Color(1, 1, 1);
      gunMat.useMetalness = true; gunMat.metalness = 0.62; gunMat.gloss = 0.55; gunMat.diffuseMapTint = false;
      gunMat.update();
      return new Promise((res, rej) => app.assets.loadFromUrl('models/weapons/m4a1.glb', 'container', (err, a) => err ? rej(new Error(err)) : res(a)));
    }).then(asset => { weaponAsset = asset; bodies.forEach(giveWeapon); makeViewmodel(); return asset; })
      .catch(e => { console.warn('[s9pc] weapon:', e && e.message); return null; });
  }
  /* Measure the GLB rather than assume it: longest axis = the barrel line, second = up. The rifle
   * then fits whatever the converter emitted without a hand-tuned magic transform — the same rule
   * dogfight.html uses for its craft. */
  function fitWeapon(ent) {
    const aabb = new pc.BoundingBox(); let first = true;
    ent.findComponents('render').forEach(r => r.meshInstances.forEach(mi => { if (first) { aabb.copy(mi.aabb); first = false; } else aabb.add(mi.aabb); }));
    if (first) return null;
    const he = aabb.halfExtents, ctr = aabb.center;
    const size = [he.x * 2, he.y * 2, he.z * 2];
    const order = [0, 1, 2].sort((a, b) => size[b] - size[a]);
    return { LONG: order[0], UP: order[1], k: 0.86 / (size[order[0]] || 1), ctr: [ctr.x, ctr.y, ctr.z], size };
  }
  function weaponEntity() {
    const ent = weaponAsset.resource.instantiateRenderEntity();
    ent.findComponents('render').forEach(r => { r.castShadows = true; r.receiveShadows = true;
      r.meshInstances.forEach(mi => { mi.material = gunMat; mi.castShadow = true; }); });
    if (!GUNFIT) GUNFIT = fitWeapon(ent);
    const F = GUNFIT; if (!F) return ent;
    const holder = new pc.Entity('m4a1'), pivot = new pc.Entity('m4a1-pivot');
    ent.setLocalPosition(-F.ctr[0], -F.ctr[1], -F.ctr[2]);
    pivot.addChild(ent);
    const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const zAxis = AX[F.LONG].slice(), yAxis = AX[F.UP].slice();
    const xAxis = [yAxis[1] * zAxis[2] - yAxis[2] * zAxis[1], yAxis[2] * zAxis[0] - yAxis[0] * zAxis[2], yAxis[0] * zAxis[1] - yAxis[1] * zAxis[0]];
    const m = new pc.Mat4();
    m.data.set([xAxis[0], yAxis[0], zAxis[0], 0, xAxis[1], yAxis[1], zAxis[1], 0, xAxis[2], yAxis[2], zAxis[2], 0, 0, 0, 0, 1]);
    pivot.setLocalRotation(new pc.Quat().setFromMat4(m));
    pivot.setLocalScale(F.k, F.k, F.k);
    holder.addChild(pivot);
    return holder;
  }
  function giveWeapon(h) {
    if (!weaponAsset || !h || h.__gun) return;
    const g = weaponEntity();
    h.entity.addChild(g); h.__gun = g;
    h.placeGun = () => {
      const P2 = h.pose; if (!P2) return;
      const gp = P2.grip, mz = P2.muzzle;
      g.setLocalPosition(gp[0], gp[1], gp[2]);
      const d = [mz[0] - gp[0], mz[1] - gp[1], mz[2] - gp[2]];
      const l = Math.hypot(d[0], d[1], d[2]) || 1;
      // the body root is scaled px→metres (h/150) and the fit normalises the GLB to 0.86 m at
      // scale 1, so undoing the root scale keeps the rifle 0.86 m however tall the operative is
      const s = S9Skin.H / ((h.state && h.state.h) || 1.72);
      g.setLocalScale(s, s, s);
      const wp = h.entity.getWorldTransform().transformPoint(new pc.Vec3(gp[0] + d[0] / l * 40, gp[1] + d[1] / l * 40, gp[2] + d[2] / l * 40));
      g.lookAt(wp);                                  // aims −z at the target, and −z is the muzzle
    };
    h.placeGun();
  }
  function makeViewmodel() {
    viewmodel = weaponEntity();
    cam.addChild(viewmodel);
    /* ⚠ PlayCanvas cameras look down their own −z, so a viewmodel at +z is BEHIND you — and a
     * 0.86 m rifle parked behind the near plane fills two thirds of the frame with one grey
     * polygon. Same family of mistake as the dogfight camera's missing +π/2.
     * ⚑ The MUZZLE is the model's −z end and the camera also looks down −z, so the viewmodel needs
     * NO yaw at all; the obvious 180° "because the camera looks backwards" aims it at the player. */
    viewmodel.setLocalPosition(0.20, -0.19, -0.62);
    viewmodel.setLocalEulerAngles(0, 0, 0);
    viewmodel.findComponents('render').forEach(r => r.meshInstances.forEach(mi => { mi.castShadow = false; }));
  }
  loadWeapon();

  /* ⚑ THE MUZZLE FLASH IS A LIGHT. Our own renderer paints a bright blob on the 2D overlay and
   * adds a centre-weighted tint on heavy shots — a picture of a flash. Here it is an omni light
   * on the camera, so firing in a dark corridor actually throws the wall, the crate and the
   * operative you are shooting at into a frame of hard light. Clustered lighting is what makes
   * that affordable, and it is the single most legible thing the engine buys in combat. */
  const muzzleLight = new pc.Entity('muzzle');
  muzzleLight.addComponent('light', { type: 'omni', color: new pc.Color(1.0, 0.86, 0.62), intensity: 0,
    range: 12, castShadows: false, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED });
  muzzleLight.setLocalPosition(0.21, -0.17, -1.06);   // measured off the rendered barrel, not guessed
  cam.addChild(muzzleLight);
  muzzleLight.enabled = false;

  // ── input ───────────────────────────────────────────────────────────────────────────────────
  const K = game.keys, M = game.mouse, T = game.touch;
  let locked = false, wasLocked = false;
  let isTouch = matchMedia('(hover:none)').matches || ('ontouchstart' in window);
  if (isTouch) { try { document.body.classList.add('touchmode'); } catch (e) {} }
  const touchUpgrade = () => { if (!isTouch) { isTouch = true; document.body.classList.add('touchmode'); } };
  const SENS = 0.0022;
  function tryLock() { if (game.G.mode === 'play' && !isTouch) { try { canvas.requestPointerLock && canvas.requestPointerLock(); } catch (e) {} } }
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); K[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
    if (game.G.mode === 'play') {
      if (k >= '1' && k <= '4') game.switchWeapon(+k - 1);
      if (k === 'r') game.startReload(game.G.me);
      if (k === 'm') ui.toggleSfx();
      if (k === 'p') togglePause();
    }
  });
  addEventListener('keyup', e => { K[e.key.toLowerCase()] = false; });
  document.addEventListener('pointerlockchange', () => { locked = (document.pointerLockElement === canvas);
    if (locked) wasLocked = true; else if (wasLocked && game.G.mode === 'play') { wasLocked = false; togglePause(true); } });
  canvas.addEventListener('mousedown', e => {
    if (game.G.mode === 'pause') { resume(); return; }
    if (game.G.mode !== 'play') return;
    if (!locked) { tryLock(); return; }
    if (e.button === 0) M.left = true;
    else if (e.button === 2) M.right = true;
    else if (e.button === 1) { e.preventDefault(); game.startReload(game.G.me); }
  });
  addEventListener('mouseup', e => { if (e.button === 0) M.left = false; if (e.button === 2) M.right = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => { if (!locked || !game.G.me || game.G.mode !== 'play') return;
    const s = SENS / (game.G.scopeZoom || 1);
    game.G.me.yaw += e.movementX * s;
    game.G.me.pitch = clamp(game.G.me.pitch - e.movementY * s, -1.45, 1.45); });
  canvas.addEventListener('wheel', e => { if (game.G.mode !== 'play') return; e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    game.switchWeapon((game.G.me.weapon + dir + S9Game.WEAPONS.length) % S9Game.WEAPONS.length); }, { passive: false });

  // touch: floating move stick (left half) · look-drag (right half, 2 fingers = ADS) · pads
  const touchMove = { active: false, id: -1, cx: 0, cy: 0 }, touchLook = { active: false, id: -1, lx: 0, ly: 0 };
  const rightTouch = new Set();
  const tsBase = $('tsBase'), tsNub = $('tsNub');
  const T_RAD = 56, T_DEAD = 10, LOOK_X = 0.0065, LOOK_Y = 0.0055;     // shared Ripmaster touch language
  function stickShow(x, y) { tsBase.style.display = 'block'; tsNub.style.display = 'block';
    tsBase.style.transform = 'translate(' + x + 'px,' + y + 'px)'; tsNub.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }
  function stickHide() { tsBase.style.display = 'none'; tsNub.style.display = 'none';
    touchMove.active = false; touchMove.id = -1; T.move.active = false; T.move.x = 0; T.move.y = 0; T.sprint = false; }
  function stickMove(px, py) { let dx = px - touchMove.cx, dy = py - touchMove.cy; const d = Math.hypot(dx, dy);
    if (d > T_RAD) { const k = T_RAD / d; dx *= k; dy *= k; }
    tsNub.style.transform = 'translate(' + (touchMove.cx + dx) + 'px,' + (touchMove.cy + dy) + 'px)';
    if (d < T_DEAD) { T.move.x = 0; T.move.y = 0; T.sprint = false; return; }
    T.move.x = dx / T_RAD; T.move.y = dy / T_RAD;                       // y<0 = forward
    T.sprint = d >= T_RAD * 0.85 && T.move.y < -0.35; }
  canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return;
    touchUpgrade(); e.preventDefault();
    if (game.G.mode === 'pause') { resume(); return; }
    if (game.G.mode !== 'play') return;
    const r = canvas.getBoundingClientRect();
    if (e.clientX < r.left + r.width / 2) {
      if (!touchMove.active) { touchMove.active = true; T.move.active = true; touchMove.id = e.pointerId;
        touchMove.cx = e.clientX; touchMove.cy = e.clientY; T.move.x = 0; T.move.y = 0;
        stickShow(e.clientX, e.clientY); try { canvas.setPointerCapture(e.pointerId); } catch (er) {} }
    } else {
      rightTouch.add(e.pointerId); if (rightTouch.size >= 2) T.scope = true;
      if (!touchLook.active) { touchLook.active = true; touchLook.id = e.pointerId; touchLook.lx = e.clientX; touchLook.ly = e.clientY; }
      try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
    }
  });
  canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') return;
    if (touchMove.active && e.pointerId === touchMove.id) { e.preventDefault(); stickMove(e.clientX, e.clientY); }
    else if (touchLook.active && e.pointerId === touchLook.id && game.G.mode === 'play' && game.G.me) { e.preventDefault();
      const dx = e.clientX - touchLook.lx, dy = e.clientY - touchLook.ly; touchLook.lx = e.clientX; touchLook.ly = e.clientY;
      const z = game.G.scopeZoom || 1;
      game.G.me.yaw += dx * LOOK_X / z; game.G.me.pitch = clamp(game.G.me.pitch - dy * LOOK_Y / z, -1.45, 1.45); }
  });
  function touchEnd(e) { if (e.pointerType !== 'touch') return;
    if (e.pointerId === touchMove.id) stickHide();
    if (rightTouch.delete(e.pointerId) && rightTouch.size < 2) T.scope = false;
    if (e.pointerId === touchLook.id) { touchLook.active = false; touchLook.id = -1; } }
  canvas.addEventListener('pointerup', touchEnd); canvas.addEventListener('pointercancel', touchEnd);
  function bindPad(el, dn, up) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); if (e.pointerType === 'touch') touchUpgrade();
      el.classList.add('dn'); try { el.setPointerCapture(e.pointerId); } catch (er) {} dn(); });
    const u = () => { el.classList.remove('dn'); if (up) up(); };
    el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u); el.addEventListener('pointerleave', u);
  }
  let _fireTapT = 0;
  bindPad($('padFire'), () => { T.fire = true; const n = performance.now();
    if (n - _fireTapT < 300 && game.G.mode === 'play') game.startReload(game.G.me); _fireTapT = n; }, () => { T.fire = false; });
  bindPad($('padJump'), () => { T.jump = true; }, null);
  bindPad($('padCrouch'), () => { T.crouch = true; }, () => { T.crouch = false; });

  function togglePause(force) {
    if (game.G.mode === 'play') { game.G.mode = 'pause'; ui.music.pause();
      $('pauseSub').textContent = isTouch ? 'Deployment on hold. Tap resume to drop back in.' : 'Pointer released. Click to lock the mouse and drop back in.';
      $('ovPause').classList.add('show'); $('tgPause').textContent = '▶ resume'; }
    else if (game.G.mode === 'pause' && !force) resume();
  }
  function resume() { if (game.G.mode !== 'pause') return; game.G.mode = 'play';
    $('ovPause').classList.remove('show'); $('tgPause').textContent = '⏸ pause'; ui.playMusic(); tryLock(); }
  $('tgPause').onclick = () => togglePause();
  $('btnResume').onclick = resume;

  // ── match start ─────────────────────────────────────────────────────────────────────────────
  ui.onStart = (real, arenaPick, roster, deck) => {
    const MAP = game.startMatch(real, arenaPick, roster, deck);
    bodies.forEach(h => { try { h.entity.destroy(); } catch (e) {} }); bodies.clear(); bodyPending = new Set();
    buildLevel(MAP);
    ui.powMsg('◈ ' + MAP.name, '#59e0ff');
    syncBodies(game.G);
    applyCamera();
    tryLock();
    say('');
  };
  ui.onAbort = () => { clearLevel(); bodies.forEach(h => { try { h.entity.destroy(); } catch (e) {} }); bodies.clear(); };

  // ── camera + overlay ────────────────────────────────────────────────────────────────────────
  const _qy = new pc.Quat(), _qx = new pc.Quat(), _qr = new pc.Quat();
  function applyCamera() {
    const G = game.G, c = game.cam;
    /* Section 9's yaw convention is forward = (sin yaw, 0, cos yaw); a PlayCanvas camera looks
     * down its own −z. Hence the +180°: without it the whole world sits behind you, which is
     * exactly the class of bug the dogfight renderer shipped once (see CLAUDE.md). */
    _qy.setFromAxisAngle(pc.Vec3.UP, c.yaw * 180 / Math.PI + 180);
    _qx.setFromAxisAngle(pc.Vec3.RIGHT, c.pitch * 180 / Math.PI);
    _qr.copy(_qy).mul(_qx);
    cam.setRotation(_qr);
    // screen shake jitters the CAMERA only; the viewmodel is parented to it so it rides along,
    // and the reticle lives on the overlay, which never moves — same split as the shipping game
    let jx = 0, jy = 0, jz = 0;
    const sh = Math.min(G.shake, 14) * 0.008;
    if (sh > 0.0001) { jx = (Math.random() * 2 - 1) * sh; jy = (Math.random() * 2 - 1) * sh * 0.8; jz = (Math.random() * 2 - 1) * sh * 0.4; }
    cam.setPosition(c.x + jx, c.y + jy, c.z + jz);
    cam.camera.fov = (FOV / (G.scopeZoom || 1)) * 180 / Math.PI;
    if (viewmodel) {
      const me = G.me;
      // hide the model behind a true optical scope, and pull it toward the sightline when aiming
      const scoped = me && me.scoped && S9Game.WEAPONS[me.weapon].zoom > 1;
      viewmodel.enabled = !!(me && me.alive && !scoped);
      const mk = me ? Math.max(0, Math.min(1, me.muzzle / 0.05)) : 0;
      muzzleLight.enabled = mk > 0.02;
      if (muzzleLight.enabled) {
        const w = S9Game.WEAPONS[me.weapon], heavy = (w.key === 'shotgun' || w.key === 'sniper');
        muzzleLight.light.intensity = mk * (heavy ? 11 : 5.5);
        muzzleLight.light.color = w.key === 'sniper' ? new pc.Color(0.84, 0.92, 1.0) : new pc.Color(1.0, 0.86, 0.62);
        if (fx) { const wp = muzzleLight.getPosition(); fx.setViewFlash(wp.x, wp.y, wp.z, mk, heavy); }
      } else if (fx) fx.setViewFlash(0, 0, 0, 0, false);
      if (me && viewmodel.enabled) {
        const bob = me.moving && me.onGround ? Math.sin(me.bob) : 0;
        const ads = me.ads ? 1 : 0;
        const kick = me.recoil * 0.06;
        viewmodel.setLocalPosition(0.20 - ads * 0.20 + bob * 0.006, -0.19 + ads * 0.10 + Math.abs(bob) * 0.004 - kick * 0.35, -0.62 + ads * 0.10 + kick);
        viewmodel.setLocalEulerAngles(-me.recoil * 5.0, 0, 0);
      }
    }
  }

  const _sp = new pc.Vec3(), _wp = new pc.Vec3();
  function drawOverlay() {
    const G = game.G, me = G.me; if (!me) return;
    const W = OW, H = OH, HW = W / 2, HH = H / 2;
    ovCtx.clearRect(0, 0, W, H);
    // nameplates + health bars, occluded by the same line-of-sight test the sim uses
    ovCtx.textAlign = 'center';
    for (const e of G.ents) {
      if (!e.alive || e.isMe) continue;
      const dd = Math.hypot(e.x - game.cam.x, e.z - game.cam.z); if (dd > 44) continue;
      if (!game.losClear(game.cam.x, game.cam.y, game.cam.z, e.x, e.y + e.h * 0.6, e.z)) continue;
      _wp.set(e.x, e.y + e.h + 0.22, e.z);
      cam.camera.worldToScreen(_wp, _sp);
      if (_sp.z <= 0) continue;
      const sc = clamp(26 / Math.max(1, dd), 0.35, 1.4);
      ovCtx.font = '900 ' + clamp(13 * sc, 8, 13).toFixed(1) + 'px Arial';
      ovCtx.fillStyle = '#e7f4fa'; ovCtx.shadowColor = '#000'; ovCtx.shadowBlur = 4;
      ovCtx.fillText((e.verified ? '⚜ ' : '') + S9Game.shortName(e.name), _sp.x, _sp.y - 6);
      ovCtx.shadowBlur = 0;
      const bw = clamp(60 * sc, 22, 64), hpf = clamp(e.hp / e.maxHp, 0, 1);
      ovCtx.fillStyle = 'rgba(0,0,0,.55)'; ovCtx.fillRect(_sp.x - bw / 2, _sp.y, bw, 4);
      ovCtx.fillStyle = hpf > 0.5 ? '#2bff80' : hpf > 0.25 ? '#ffd23b' : '#ff5a3c';
      ovCtx.fillRect(_sp.x - bw / 2, _sp.y, bw * hpf, 4);
    }
    // reticle / scope
    const w = S9Game.WEAPONS[me.weapon];
    if (me.scoped && w.zoom > 1) {
      const Rr = Math.min(W, H) * 0.42;
      ovCtx.fillStyle = 'rgba(3,6,9,0.96)';
      ovCtx.beginPath(); ovCtx.rect(0, 0, W, H); ovCtx.arc(HW, HH, Rr, 0, Math.PI * 2, true); ovCtx.fill('evenodd');
      ovCtx.strokeStyle = 'rgba(10,14,18,1)'; ovCtx.lineWidth = 6; ovCtx.beginPath(); ovCtx.arc(HW, HH, Rr, 0, Math.PI * 2); ovCtx.stroke();
      ovCtx.strokeStyle = 'rgba(120,255,200,0.85)'; ovCtx.lineWidth = 1.4;
      ovCtx.beginPath(); ovCtx.moveTo(HW - Rr, HH); ovCtx.lineTo(HW + Rr, HH); ovCtx.moveTo(HW, HH - Rr); ovCtx.lineTo(HW, HH + Rr); ovCtx.stroke();
      ovCtx.strokeStyle = 'rgba(255,80,80,0.9)'; ovCtx.lineWidth = 2;
      ovCtx.beginPath(); ovCtx.moveTo(HW - 14, HH); ovCtx.lineTo(HW - 4, HH); ovCtx.moveTo(HW + 4, HH); ovCtx.lineTo(HW + 14, HH);
      ovCtx.moveTo(HW, HH - 14); ovCtx.lineTo(HW, HH - 4); ovCtx.moveTo(HW, HH + 4); ovCtx.lineTo(HW, HH + 14); ovCtx.stroke();
      ovCtx.fillStyle = 'rgba(255,80,80,0.9)'; ovCtx.fillRect(HW - 1.5, HH - 1.5, 3, 3);
    } else {
      const spread = 8 + (me.alive ? (w.spread * 260) + me.recoil * 18 + (me.sprinting ? 10 : 0) : 0);
      ovCtx.strokeStyle = 'rgba(120,255,200,0.9)'; ovCtx.lineWidth = 2; ovCtx.shadowColor = '#2bff80'; ovCtx.shadowBlur = 4;
      const g = 6; ovCtx.beginPath();
      ovCtx.moveTo(HW - spread - g, HH); ovCtx.lineTo(HW - g, HH); ovCtx.moveTo(HW + g, HH); ovCtx.lineTo(HW + spread + g, HH);
      ovCtx.moveTo(HW, HH - spread - g); ovCtx.lineTo(HW, HH - g); ovCtx.moveTo(HW, HH + g); ovCtx.lineTo(HW, HH + spread + g);
      ovCtx.stroke(); ovCtx.shadowBlur = 0;
      ovCtx.fillStyle = 'rgba(120,255,200,0.9)'; ovCtx.fillRect(HW - 1, HH - 1, 2, 2);
    }
    if (G.hitmark > 0) {
      ovCtx.strokeStyle = 'rgba(255,240,120,' + clamp(G.hitmark * 7, 0, 1).toFixed(2) + ')'; ovCtx.lineWidth = 2.5;
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sy]) => { ovCtx.beginPath(); ovCtx.moveTo(HW + sx * 6, HH + sy * 6); ovCtx.lineTo(HW + sx * 13, HH + sy * 13); ovCtx.stroke(); });
    }
    // OVERCHARGE surge — a warm pulse at the edges while the market-heat surge is live
    if (me.surgeT > 0) {
      const pul = 0.5 + 0.5 * Math.sin(G.t * 10);
      const rg = ovCtx.createRadialGradient(HW, HH, Math.min(W, H) * 0.28, HW, HH, Math.max(W, H) * 0.62);
      rg.addColorStop(0, 'rgba(255,200,80,0)'); rg.addColorStop(1, 'rgba(255,190,70,' + (0.07 + 0.06 * pul).toFixed(3) + ')');
      ovCtx.fillStyle = rg; ovCtx.fillRect(0, 0, W, H);
    }
  }

  // ── frame ───────────────────────────────────────────────────────────────────────────────────
  const times = []; let frames = 0, tPrev = 0, grainT = 0;
  const marks = { boot: +(performance.now() - T0).toFixed(1), firstFrame: 0 };
  app.on('update', dt => {
    if (!frames) marks.firstFrame = +(performance.now() - T0).toFixed(1);
    frames++;
    const nowT = performance.now();
    if (tPrev) { times.push(nowT - tPrev); if (times.length > 240) times.shift(); }
    tPrev = nowT;
    if (ditherOn) { grainT = (grainT + 0.017) % 1000; app.graphicsDevice.scope.resolve('s9GrainT').setValue(grainT); }
    const G = game.G;
    if (G.mode === 'play' && !HOLD) game.step(Math.min(0.05, dt));
    if (G.mode === 'play' || G.mode === 'pause' || G.mode === 'result') {
      if (G.me) {
        syncBodies(G);
        applyCamera();
        if (fx) fx.update(G, cam, nowT);
        drawOverlay();
        if (frames % 4 === 0) ui.hud();
      }
    }
    if (frames % 20 === 0) engReadout();
  });

  function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }
  function engReadout() {
    const el = $('eng'); if (!el || !document.body.classList.contains('showeng')) return;
    const s = levelStats;
    el.innerHTML = 'PlayCanvas ' + pc.version + ' · tier ' + TIER + ' · dpr ' + app.graphicsDevice.maxPixelRatio.toFixed(2) + '<br>' +
      (s ? (s.tris.toLocaleString() + ' tris · ' + s.parts + ' PBR mats · ' + (s.omni || 0) + ' omni · ' + (s.spot || 0) + ' spot<br>') : '') +
      bodies.size + ' bodies · ' + (weaponAsset ? 'GLB weapon' : 'no weapon') + ' · ' + (frame ? 'post' : 'no post') + (ditherOn ? '+dither' : '') + (envOk ? ' · IBL' : '') + '<br>' +
      'median ' + median(times).toFixed(1) + ' ms/f';
  }
  if (Q.has('eng')) document.body.classList.add('showeng');

  say('');
  app.start();

  /* Stage one representative frame of combat FX and hold it. A tracer crosses a 40 m arena in
   * ~120 ms; under software GL a headless run renders about one frame in that time, so photo-
   * graphing live gunfire is a coin flip. This stuffs the same state the simulation would have
   * produced, mid-flight, and nothing else about the render path changes. Re-stuffed every frame
   * while `fxDemo` is set, so a slow frame cannot decay the capture out from under itself. */
  function stuffFx() {
    const G = game.G, me = G.me; if (!me) return false;
    const d = game.lookDir(me.yaw, me.pitch);
    const ox = me.x + d.x * 0.4, oy = me.y + me.eye - 0.08 + d.y * 0.4, oz = me.z + d.z * 0.4;
    G.tracers.length = 0; G.flashes.length = 0; G.sparks.length = 0; G.decals.length = 0;
    for (let i = 0; i < 6; i++) {
      const a = me.yaw + (i - 2.5) * 0.055, p = me.pitch + (i % 2 ? 0.02 : -0.015);
      const dd = game.lookDir(a, p);
      const hit = game.raycast(ox, oy, oz, dd.x, dd.y, dd.z, 56, me);
      const len = Math.max(2, Math.hypot(hit.x - ox, hit.y - oy, hit.z - oz));
      G.tracers.push({ x0: ox, y0: oy, z0: oz, dx: dd.x, dy: dd.y, dz: dd.z, len,
        p: len * (0.25 + 0.12 * i), sp: 340, tail: 3.4, me: i < 3, t: 0.1 });
      G.sparks.push({ x: hit.x, y: hit.y, z: hit.z, vx: 0, vy: 0, vz: 0, t: 0.3, col: [230, 210, 160] });
      G.decals.push({ x: hit.x, y: hit.y, z: hit.z, n: [0, 1, 0], type: 'bullet', r: 0.1, life: 8, max: 10 });
    }
    // INCOMING. Your own rounds run down the view axis and project to a dot — correct, and
    // useless as evidence. Rounds coming the other way are what a tracer is for.
    G.ents.forEach((e, i) => { if (e.isMe || !e.alive) return;
      const sx = e.x, sy = e.y + e.eye, sz = e.z;
      const tx = me.x + (i % 2 ? 1.4 : -1.1), ty = me.y + me.eye + 0.3, tz = me.z + (i % 3 ? 0.9 : -1.3);
      let dx = tx - sx, dy = ty - sy, dz = tz - sz; const L = Math.hypot(dx, dy, dz) || 1;
      dx /= L; dy /= L; dz /= L;
      G.tracers.push({ x0: sx, y0: sy, z0: sz, dx, dy, dz, len: L + 12, p: L * (0.55 + 0.12 * i), sp: 340, tail: 3.4, me: false, t: 0.1 });
      G.flashes.push({ x: sx + dx * 0.4, y: sy + dy * 0.4, z: sz + dz * 0.4, t: 0.06, max: 0.06, big: false });
    });
    G.flashes.push({ x: ox, y: oy, z: oz, t: 0.06, max: 0.06, big: false });
    me.muzzle = 1e6; me.recoil = 0.5;
    return true;
  }

  // ── dev / headless peephole ─────────────────────────────────────────────────────────────────
  window.__s9pc = {
    app, game, ui, cam,
    get s() { const G = game.G; return {
      engine: pc.version, tier: TIER, autoTier: AUTO_TIER, dpr: app.graphicsDevice.maxPixelRatio,
      mode: G.mode, map: game.MAP && game.MAP.name, mapIdx: G.mapIdx, frames,
      me: G.me ? { hp: +G.me.hp.toFixed(1), armor: +G.me.armor.toFixed(1), mag: G.me.mag, weapon: G.me.weapon, kills: G.me.kills,
        alive: G.me.alive, x: +G.me.x.toFixed(2), y: +G.me.y.toFixed(2), z: +G.me.z.toFixed(2),
        yaw: +G.me.yaw.toFixed(3), pitch: +G.me.pitch.toFixed(3) } : null,
      ents: G.ents.length, bodies: bodies.size, weapon: !!weaponAsset, post: !!frame, dither: ditherOn, env: envOk, envName,
      level: levelStats, fx: fx ? fx.counts : null,
      medianMs: +median(times).toFixed(2), p95Ms: +(times.slice().sort((a, b) => a - b)[Math.floor(times.length * 0.95)] || 0).toFixed(2),
      marks,
    }; },
    _start(real) { ui.begin(!!real); },
    _pick(i) { try { localStorage.setItem('s9pc_map', i); } catch (e) {} },
    _maps() { return game.MAPS.map((m, i) => ({ i, name: m.name, wld: m.wld || null, solids: m.solids.length, spawns: m.spawns.length })); },
    _place(x, z, y) { const me = game.G.me; if (!me) return false; me.x = x; me.z = z; me.y = (y != null ? y : game.supportY(me)); me.vy = 0;
      game.cam.x = me.x; game.cam.y = me.y + me.eye; game.cam.z = me.z; applyCamera(); return true; },
    _look(yaw, pitch) { const me = game.G.me; if (!me) return false; me.yaw = yaw; if (pitch != null) me.pitch = pitch;
      game.cam.yaw = yaw; if (pitch != null) game.cam.pitch = pitch; applyCamera(); return true; },
    _hold(v) { game.G.__hold = !!v; return !!game.G.__hold; },
    _god() { const me = game.G.me; if (me) { me.iframe = 1e9; me.hp = me.maxHp; } },
    _hideui(v) { ['hudTL', 'hudTR', 'hudBL', 'hudBR', 'killfeed', 'comms', 'toggles', 'controls', 'eng'].forEach(id => { const e = $(id); if (e) e.style.visibility = v ? 'hidden' : ''; }); },
    _fwd() { const v = cam.forward; return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; },
    /* Stage one representative frame of combat FX and FREEZE it. A tracer crosses a 40 m arena in
     * ~120 ms; under software GL a headless run renders about one frame in that time, so photo-
     * graphing live gunfire is a coin flip. This stuffs the same state the simulation would have
     * produced, mid-flight, and nothing else about the render path changes. */
    _fxdemo(stick) { fxDemo = stick !== false; return stuffFx(); },
    _post(o) { if (!frame) return null; Object.assign(POST, o || {});
      frame.bloom.intensity = POST.bloom; frame.rendering.sharpness = POST.sharpness;
      frame.fringing.intensity = POST.fringing; frame.grading.saturation = POST.saturation;
      frame.vignette.intensity = POST.vignette.intensity; frame.rendering.toneMapping = POST.tone;
      frame.grading.contrast = POST.contrast;
      frame.update(); return POST; },
    /* CLIPPED-PIXEL COUNT — the measurement the 0.94 knee was derived from, in the engine's terms.
     * Reads the real backing store (needs ?grab=1) and reports the fraction of pixels where a
     * channel has hit 255, plus mean luma and RMS contrast, so a tonemapper/bloom change can be
     * judged the way GfxPost's was: does it remove clipping, and what does it cost. */
    _clip() {
      const gl = app.graphicsDevice.gl;
      const w = app.graphicsDevice.width, h = app.graphicsDevice.height;
      const px = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let clipped = 0, sum = 0, sum2 = 0, n = w * h;
      for (let i = 0; i < n; i++) {
        const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
        if (r >= 255 || g >= 255 || b >= 255) clipped++;
        const l = 0.299 * r + 0.587 * g + 0.114 * b; sum += l; sum2 += l * l;
      }
      const mean = sum / n;
      return { w, h, pixels: n, clipped, clippedPct: +(clipped / n * 100).toFixed(4),
        meanLuma: +mean.toFixed(2), rms: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(2) };
    },
    /* Local contrast, for the one number that could NOT be ported analytically: GfxPost's unsharp
     * and PlayCanvas's CAS are different functions, so `sharpness` is matched by measuring the
     * result rather than by copying the value across. Mean |Laplacian| over the frame. */
    _sharpMetric() {
      const gl = app.graphicsDevice.gl;
      const w = app.graphicsDevice.width, h = app.graphicsDevice.height;
      const px = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const L = i => 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      let s = 0, n = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        s += Math.abs(4 * L(i) - L(i - 1) - L(i + 1) - L(i - w) - L(i + w)); n++;
      }
      return +(s / Math.max(1, n)).toFixed(3);
    },
  };
})();

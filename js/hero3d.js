/* ripmaster3030studios — the hero wordmark as HOT-STAMPED HOLOGRAPHIC FOIL, lit and diffracted
 * live in the browser.
 *
 *   RipHeroType.mount()    idempotent; called automatically
 *   RipHeroType.stop()     tear down; the page returns to exactly how it looks without this file
 *   RipHeroType.state()    { phase, why, … } — what the headless check reads
 *   RipHeroType.pose(x,y)  dev hook: hold a view angle, so a check can shoot a chosen pose
 *
 * ⛔ V1 SHIPPED AND WAS REJECTED — "basic bitch geometry and fx". Two failures, and everything
 *   here is one of the two fixes:
 *     1. IT WAS NOT FOIL. This studio's whole material language is foil trading cards. A foil
 *        stamp's defining property is that THE HUE MOVES WHEN YOU MOVE — diffraction, thin film,
 *        an anisotropic streak that smears down the grain, prism break-up at the die edge. V1
 *        baked the CSS gradient onto the face as flat paint and lit it with three lamps. Paint
 *        does not do any of that. It was static, painted-on, and dead.
 *     2. THE FX WERE ABSENT. No travelling reflection, no edge catch, no dispersion, no
 *        specular breakup, and the two torches that flank the wordmark in the layout did not
 *        light it at all.
 *
 * ⚑ THE SHADER IS OURS, and that is the decision the rest follows from. A StandardMaterial
 *   cannot express a diffraction grating or an anisotropic lobe, and every route to faking one
 *   runs into a measured trap this repo has already paid for: an environment map on a Standard
 *   material also feeds AMBIENT specular and lands on a flat face as a milky sheen that lifts
 *   blacks (CLAUDE.md, "THE WASH, SECOND EDITION"), and `material.diffuse` never reaches a
 *   mapped surface in PlayCanvas 2.21 at all. So this file compiles its own program and owns
 *   its lighting outright — five lights, all hand-written, no scene ambient, no env map, no
 *   ambient specular anywhere. Nothing can wash the face because nothing is sampling a
 *   hemisphere.
 *
 * ⚑ THE PALETTE IS A LOOP OF THE SITE'S OWN GRADIENT. `media/hero/type-spectrum.png` is the six
 *   CSS stops wrapped end to end. The grating phase indexes THAT, so however far the hue walks,
 *   every colour it lands on is a colour the wordmark already had. At rest the phase is just the
 *   vertical position and the word reads as the gradient it has always been; tilt it and the
 *   gradient slides through the letters. This is what makes "the hue moves" survivable as an
 *   identity: a generic rainbow would have stopped being this studio's wordmark on the first
 *   frame anybody moved their head.
 *
 * ⚑ NOTHING VIEW-DEPENDENT IS BAKED. Blender ships the SURFACE — brush direction, grating phase,
 *   flake mask, ink, relief (scripts/blender/build-hero-type.py) — and the half-angle work is
 *   done here, per pixel, per frame. A bake is a fixed viewpoint by definition, which is exactly
 *   what killed v1.
 *
 * ⚑ NO TANGENT ATTRIBUTE, ON PURPOSE. The face and bevel share ONE planar UV projection onto the
 *   wordmark's own XY plane, so the surface tangent frame is the object basis rotated by the
 *   baked brush angle and projected onto the geometric normal. That is three lines of GLSL
 *   instead of a MikkTSpace bake, and it is only true because of how the UV is made — if that
 *   projection ever changes, this breaks silently (a normal map lit off the wrong axis still
 *   looks like a texture). The .py header carries the matching warning.
 *
 * ⚑ THE CSS WORDMARK IS NOT REPLACED — IT IS COVERED, AND ONLY AFTER A FRAME HAS ACTUALLY DRAWN.
 *   That is not politeness, it is the whole failure model. This page's wordmark is TYPE on
 *   purpose (see the long comment in index.html: the rebrand shipped and was invisible because
 *   the name was baked into a bitmap). Swapping it back for a picture of type would re-open that
 *   hole. So the real string stays in the DOM — selectable, searchable, read by a screen reader,
 *   and rendered normally on any browser that does not get all the way here. The element is only
 *   faded to `opacity:0` — never `display:none`, never `visibility:hidden`, both of which would
 *   take it out of the accessibility tree — at the moment the 3D layer is proven to be painting.
 *
 * ⚑ FAILS OPEN AT EVERY STEP, and there are a lot of steps: no WebGL2, an engine that never
 *   loads, a 404 on the GLB or any of the four textures, a mesh missing a named part, a shader
 *   that will not compile, a lost context, a throw anywhere in build(). Every one of them lands
 *   in the same place — the CSS wordmark, untouched. PlayCanvas has no software fallback, so
 *   WebGL2 is a hard requirement and this file checks for it BEFORE spending 2.4 MB on the
 *   engine.
 */
(() => {
  'use strict';

  const SEL = '.marquee-art.wordmark';       // the masthead only — the intro splash keeps CSS type
  const GLB = 'media/hero/type.glb';
  const TEX = {
    albedo: 'media/hero/type-albedo.webp',   // sRGB — the site gradient as base ink
    normal: 'media/hero/type-normal.webp',   // linear — pressed + brushed relief
    foil: 'media/hero/type-foil.webp',       // linear DATA — r brush angle, g phase, b flake
    spectrum: 'media/hero/type-spectrum.png', // sRGB — the cyclic site palette
  };

  /* ⚑ THE CAMERA IS PLACED BY DISTANCE AND THE FOV IS SOLVED FOR — never the other way round,
   *   and this cost a render. Fixing fov and solving for distance is the obvious form and it is
   *   wrong here, because the canvas is a ~5:1 STRIP: a 19° vertical fov on it is a ~76°
   *   HORIZONTAL fov, which puts the camera 0.6 units from a wordmark 1.0 unit wide. At that
   *   range a few degrees of yaw swings the far end of the word right out of frame — the first
   *   render read "RIPMASTER3030STUDIO", the exact failure index.html already records for the
   *   CSS wordmark, arrived at from a completely different direction. Pinning the distance in
   *   units of the type's own width fixes the strength of the perspective, and the fov then
   *   falls out of the box it has to fill. `maxYaw()` below is asserted against the frame.
   * ⚑ 2.35 rather than v1's 3.2 — a deliberate ~36% stronger perspective. V1 read flat partly
   *   because it was nearly orthographic: at 3.2 widths the near and far ends of the word differ
   *   in scale by 8%, at 2.35 by 12%, and the far end's letters visibly turn away. The clearance
   *   this costs at maximum yaw is measured in scripts/build-hero-type.mjs, not assumed. */
  const CAM_D = 2.35;           // camera distance, in wordmark widths
  const OVER_X = 1.16;          // canvas overscan, so a turned letter never clips at the ends
  const OVER_Y = 1.95;          // vertical room for the tilt and the specular bloom
  /* ⚑ THE SWAY IS CENTRED OFF-AXIS, and that is the difference between 3D type and a picture of
   *   type. Dead-on, an extrusion shows NO side wall and no bevel highlight — the first build
   *   swayed through 0° and for the fraction of a second it passed through square it was
   *   indistinguishable from the CSS wordmark it had just replaced. Holding a small permanent
   *   turn means an edge is always lit and the letters always have a thickness. */
  const BASE_Y = -6.0;          // permanent yaw, degrees
  const BASE_X = -3.0;          // permanent pitch — top tipped toward the viewer, so the key
                                //   light lands on the TOP wall of every stroke
  const SWAY_Y = 5.5;           // idle yaw amplitude, degrees
  const SWAY_X = 2.4;           // idle pitch amplitude
  const POINT_Y = 7.5;          // extra yaw from the pointer
  const POINT_X = 4.5;
  const SCROLL_X = 3.2;         // extra pitch from page scroll — on touch there is no pointer,
                                //   and a foil that only moves for a mouse is dead on a phone
  const FPS = 32;               // a wordmark does not need 60; this halves the cost of the layer
  const REST = { x: BASE_X - 1.6, y: BASE_Y - 4.0 };   // still pose, under prefers-reduced-motion
  const maxYaw = () => Math.abs(BASE_Y) + SWAY_Y + POINT_Y;
  const maxPitch = () => Math.abs(BASE_X) + SWAY_X + POINT_X + SCROLL_X;

  /* ⚠ Resolve against THIS SCRIPT's URL, not document.baseURI — the same trap bg-foil.js records.
   *   The assets live at the site root; a page in a subdirectory would resolve `media/hero/...`
   *   against its own path and silently 404 into the fallback. */
  const SELF = (document.currentScript && document.currentScript.src) || '';
  const BASE = SELF ? SELF.replace(/js\/hero3d\.js.*$/, '') : document.baseURI;
  const url = p => new URL(p, BASE).href;

  const S = { phase: 'idle', why: '', frames: 0, w: 0, h: 0, dpr: 1, aspect: 0, fov: 0,
    parts: '', shader: '', torches: 0, ink: 0 };
  let app = null, canvas = null, el = null, prevOpacity = null, stopped = false, io = null, ro = null;
  /* Dev hook, in the manner of ronin's `__rn._brawl`: force a pose so a headless run can shoot
   * the WORST case, or a chosen pair of view angles, rather than whatever the sway happened to
   * be doing. The frame check in scripts/build-hero-type.mjs drives it to the clipping extremes
   * AND across a fan of yaws, to measure that the hue really does move. */
  let poseFn = null;

  const q = k => { try { return new URLSearchParams(location.search).get(k); } catch { return null; } };
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const thrifty = () => {
    try {
      const c = navigator.connection;
      return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
    } catch { return false; }
  };
  const dprCap = () => { try { return (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2; } catch { return 2; } };

  /* Probe for WebGL2 on a throwaway canvas and hand the context straight back. PlayCanvas 2.x has
   * no WebGL1 path, so without this the only way to discover an old browser is to download the
   * engine first and watch it fail. */
  function hasWebGL2() {
    try {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
      if (!g) return false;
      const lose = g.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch { return false; }
  }

  /* The engine is 2.4 MB raw / ~598 KB gzipped and is the same file every 3D surface here uses,
   * so it loads exactly once. Card3D owns the canonical loader; defer to it when the page has it
   * rather than racing a second <script> for the same URL. */
  let _engine = null;
  function engine() {
    if (window.pc) return Promise.resolve(window.pc);
    if (window.Card3D && Card3D.engine) return Card3D.engine(BASE);
    if (_engine) return _engine;
    _engine = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url('vendor/playcanvas/playcanvas.min.js');
      s.onload = () => window.pc ? res(window.pc) : rej(new Error('engine loaded but no pc'));
      s.onerror = () => rej(new Error('engine blocked'));
      document.head.appendChild(s);
    });
    return _engine;
  }

  const idle = fn => (window.requestIdleCallback
    ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 900));

  /* ⚠ Measure the box AFTER the webfont lands. The wordmark is set in Anton (vendored, see
   *   index.html); measured mid-swap the box is the fallback face's width and the canvas is
   *   built to the wrong size. `fonts.ready` is the only honest signal, and it resolves
   *   immediately on browsers that do not have the API. */
  const fontsReady = () => {
    try { return document.fonts ? document.fonts.ready : Promise.resolve(); }
    catch { return Promise.resolve(); }
  };

  /* ⚠ A pc.Texture built without explicit width/height/format/filters and handed its source
   *   afterwards samples BLACK. Everything below is spelled out for that reason.
   * ⚠ `mip` is off for the SPECTRUM and only for it: it is a 256-entry palette, and the first
   *   mip level of a palette is the average of the whole palette, i.e. grey. A LUT that fades to
   *   grey with distance would drain the colour out of the wordmark on a phone. */
  function texFor(pc, device, img, opts) {
    const srgb = !!(opts && opts.srgb), mip = !(opts && opts.mip === false);
    const wrap = (opts && opts.wrap) ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE;
    const cfg = {
      width: img.naturalWidth || img.width, height: img.naturalHeight || img.height,
      format: (srgb && pc.PIXELFORMAT_SRGBA8 !== undefined) ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8,
      mipmaps: mip, addressU: wrap, addressV: wrap,
      minFilter: mip ? pc.FILTER_LINEAR_MIPMAP_LINEAR : pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      anisotropy: mip ? 8 : 1,      // the plate is 9:1 and always seen at a slant; 1 is mush
    };
    let t;
    try { t = new pc.Texture(device, cfg); }
    catch { t = new pc.Texture(device, { mipmaps: mip }); }
    /* A colour map is sRGB data; a NORMAL MAP and the FOIL DATA map are not — their bytes are a
     * vector and a set of scalars, and pushing them through a transfer function bends both. */
    if ('srgb' in t) t.srgb = srgb;
    t.setSource(img);
    return t;
  }

  const loadImage = src => new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('img ' + src));
    i.decoding = 'async';
    i.src = url(src);
  });

  const loadGlb = (pc, src) => new Promise((res, rej) => {
    try {
      app.assets.loadFromUrl(url(src), 'container', (err, asset) =>
        (err || !asset) ? rej(new Error('glb ' + (err || 'missing'))) : res(asset));
    } catch (e) { rej(e); }
  });

  function fail(why) {
    S.phase = 'fallback'; S.why = why;
    teardown();
    return null;
  }

  function teardown() {
    poseFn = null;
    if (io) { try { io.disconnect(); } catch {} io = null; }
    if (ro) { try { ro.disconnect(); } catch {} ro = null; }
    if (app) { try { app.destroy(); } catch {} app = null; }
    if (canvas) { try { canvas.remove(); } catch {} canvas = null; }
    if (el && prevOpacity !== null) { el.style.opacity = prevOpacity; prevOpacity = null; }
    try { delete window.__heroType; } catch {}
  }

  // ── the foil program ─────────────────────────────────────────────────────────────────────────
  /* ⚠ `uniqueName` is the engine's shader CACHE KEY. Bump the version tag whenever the source
   *   below changes or a page that already compiled the old one will silently keep using it.
   * ⚠ NO BACKTICKS ANYWHERE IN THE GLSL BELOW, not even inside a comment — the shader lives in a
   *   JS template literal, so one backtick in prose ends the string and the file stops parsing.
   *   Cost a run: the error surfaces as a bare `Unexpected identifier` on the comment line. */
  const SHADER_VER = 'v2.1';

  const VS = `
attribute vec3 vertex_position;
attribute vec3 vertex_normal;
#ifdef HAS_UV
attribute vec2 vertex_texCoord0;
varying vec2 vUv;
#endif
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec3 vWorld;
varying vec3 vObjN;
varying vec3 vObjP;
void main(void) {
  vec4 wp = matrix_model * vec4(vertex_position, 1.0);
  vWorld = wp.xyz;
  vObjN = vertex_normal;
  vObjP = vertex_position;
#ifdef HAS_UV
  vUv = vertex_texCoord0;
#endif
  gl_Position = matrix_viewProjection * wp;
}`;

  const FS = `
precision highp float;

varying vec3 vWorld;
varying vec3 vObjN;
varying vec3 vObjP;
#ifdef HAS_UV
varying vec2 vUv;
uniform sampler2D uAlbedo;
uniform sampler2D uNormalMap;
uniform sampler2D uFoil;
#endif
uniform sampler2D uSpectrum;

uniform mat3 matrix_normal;
uniform vec3 view_position;

uniform vec3 uKeyDir;  uniform vec3 uKeyCol;
uniform vec3 uFillDir; uniform vec3 uFillCol;
uniform vec3 uRimDir;  uniform vec3 uRimCol;
uniform vec3 uTorchA;  uniform vec3 uTorchB;   // world-space positions of the two torches
uniform vec3 uTorchCol;
uniform vec2 uTorchAmp;                        // per-torch flicker
uniform vec3 uAmbient;
uniform vec3 uInk;         // flat ink for the untextured wall
uniform vec4 uFoilP;       // x grating cycles · y film · z sheen · w patch cycles
uniform vec4 uSurf;        // x bump · y spread ALONG brush · z spread ACROSS · w flake bite
uniform vec4 uMix;         // x FOIL AMOUNT · y grating gain · z emissive · w fresnel power
uniform vec2 uRamp;        // x cycles down the plate · y global phase drift
uniform float uGamma;

// the site's own gradient, made cyclic — see the header
vec3 pal(float p) { return texture2D(uSpectrum, vec2(fract(p), 0.5)).rgb; }
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

/* One light. Returns:
 *   x  wrapped diffuse — foil is thin metal on paper, it does not terminate like a sphere
 *   y  anisotropic specular — a Ward-style lobe stretched ALONG the brush
 *   z  the LIGHT's half of the grating path difference (the view half is in the base phase)
 * ⚑ uSurf.y (the spread ALONG the grain) is the LARGE one. That is what turns the highlight
 *   from a blob into a line, and it is the single cheapest thing that reads as "brushed". */
vec3 lightTerm(vec3 N, vec3 T, vec3 Bt, vec3 V, vec3 L) {
  float ndl = dot(N, L);
  float diff = clamp((ndl + 0.14) / 1.14, 0.0, 1.0);
  vec3 H = L + V;
  float hl = length(H);
  H = (hl > 1e-5) ? H / hl : N;
  float ndh = max(dot(N, H), 0.0);
  float tdh = dot(T, H) / max(uSurf.y, 1e-3);
  float bdh = dot(Bt, H) / max(uSurf.z, 1e-3);
  float an = exp(-2.0 * (tdh * tdh + bdh * bdh) / max(1.0 + ndh, 1e-4));
  an *= smoothstep(-0.12, 0.10, ndl);
  /* The grating's path difference is (L + V) projected onto the surface axes, so it splits
   * cleanly into a light half and a view half. Only the light half is here; the view half is
   * computed once in main() because the BROAD tint needs it on its own. Weighted toward the
   * word's long axis, because a YAW is the motion this wordmark actually makes. */
  return vec3(diff, an, dot(T, L) + 0.62 * dot(Bt, L));
}

void main(void) {
  vec3 Ng = normalize(vObjN);
  /* ⚑ Everything is done in OBJECT space, and the trick that makes that free is that
   *   matrix_normal is the model rotation (up to a uniform scale), so (v * matrix_normal) is
   *   its transpose applied to v — i.e. world -> object. One mat3, no inverse uploaded, and the
   *   baked brush direction never has to leave the space it was authored in. */
  vec3 V = normalize((view_position - vWorld) * matrix_normal);

  vec3 nT = vec3(0.0, 0.0, 1.0);
  vec3 ink = uInk;
  float brushA = 0.0, gphase = 0.0, flake = 0.55, vpos = 0.5;
  vec3 Traw;

#ifdef HAS_UV
  vec3 f = texture2D(uFoil, vUv).rgb;
  brushA = (f.r - 0.5) * 3.14159265;
  gphase = f.g;
  flake = f.b;
  ink = texture2D(uAlbedo, vUv).rgb;
  nT = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
  vpos = 1.0 - vUv.y;
  Traw = vec3(cos(brushA), sin(brushA), 0.0);
#else
  /* The wall has no UVs (its planar projection is degenerate — see the .py header). Its brush
   * runs AROUND the letterform, which is what a die-cut edge looks like, and its grating phase
   * comes from where it sits along the word so the edge flashes rather than glowing evenly. */
  Traw = cross(Ng, vec3(0.0, 0.0, 1.0));
  if (dot(Traw, Traw) < 1e-6) Traw = vec3(1.0, 0.0, 0.0);
  gphase = vObjP.x * 3.1 + vObjP.y * 1.7;
  vpos = 0.5 - vObjP.y * 4.0;
#endif

  /* TWO FRAMES, and the second one is not a refinement — it is the difference between a brushed
   * metal and a smooth one.
   *   T0/B0  the DECODE frame, built on the GEOMETRIC normal. This is the basis the normal map
   *          was baked in (a planar UV projection, rotated by the brush angle), so it is the
   *          only frame in which those bytes mean anything.
   *   T/Bt   the SHADING frame, rebuilt on the PERTURBED normal.
   * ⚑ The first cut skipped the second frame and ran the anisotropic lobe off T0. Measured, that
   *   made the streaks run the WRONG WAY — the specular-only frame varied 1.7x faster across the
   *   word than down it, i.e. the highlights were elongated vertically, perpendicular to the
   *   brush. The reason is that with a directional light and a distant view the half-vector is
   *   near-constant, so a lobe built on the geometric normal has nothing left to vary with except
   *   the low-frequency brush-ANGLE map. It was ignoring the micro-relief entirely, which is the
   *   one thing that carries the grain. Rebuilding the frame on N puts the baked brush back into
   *   the highlight, and because the relief is stretched ~22x along the brush, the bright band
   *   lands as a line running down the grain. */
  vec3 T0 = Traw - Ng * dot(Ng, Traw);
  float t0l = length(T0);
  T0 = (t0l > 1e-5) ? T0 / t0l : normalize(cross(Ng, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
  vec3 B0 = cross(Ng, T0);
  vec3 N = normalize(T0 * (nT.x * uSurf.x) + B0 * (nT.y * uSurf.x) + Ng * nT.z);
  vec3 T = T0 - N * dot(N, T0);
  float tl = length(T);
  T = (tl > 1e-5) ? T / tl : T0;
  vec3 Bt = cross(N, T);

  float ndv = clamp(dot(N, V), 0.0, 1.0);
  /* Thin film: the optical path through a coating goes as 1/cos(theta), so the hue cycles with
   * view angle alone, with no light moving. Small compared with the grating, but it is the term
   * that keeps the colour alive where the geometry is flat-on and the grating term is stationary. */
  float film = uFoilP.y / max(ndv, 0.22);
  float axV = dot(T, V) + 0.62 * dot(Bt, V);
  float base = uRamp.x * vpos + uFoilP.w * gphase + film + uRamp.y + uFoilP.x * axV;
  // flake: specular breakup, so the foil glints in grains instead of as one mirror sheet
  float bite = mix(1.0 - uSurf.w, 1.0 + uSurf.w, flake);

  /* ⚑ THIS IS THE LINE THAT MAKES IT FOIL, AND IT IS WHY V2 EXISTS.
   *   The surface colour is not the baked ink. It is the DIFFRACTED HUE carried at the ink's own
   *   LUMINANCE: pal(base) says what colour this patch is bending light into at this view
   *   angle, and the ratio below rescales it to whatever brightness the baked plate had there.
   *   So the relief, the brush, the pressed cells and the letterform's own shading all survive
   *   the recolour — the thing that moves is hue, not light, which is exactly what a foil stamp
   *   does and exactly what a rainbow decal does not.
   *   At rest base is essentially the vertical position, so pal returns the CSS gradient's
   *   own colour at that height and the word reads as the wordmark it has always been. Turn it
   *   and the whole ramp slides through the letters.
   * ⚠ The rescale is CLAMPED. The palette runs from near-white to saturated magenta, a ~6x
   *   luminance range, and an unclamped lum/tl blows a dark stop up to a white smear. */
  vec3 tint = pal(base);
  float inkL = dot(ink, LUMA);
  float tintL = max(dot(tint, LUMA), 0.04);
  vec3 shade = mix(ink, tint * clamp(inkL / tintL, 0.35, 1.65), uMix.x);

  vec3 col = shade * (uAmbient + uMix.z);

  vec3 t;
  t = lightTerm(N, T, Bt, V, uKeyDir);
  col += shade * uKeyCol * t.x;
  col += pal(base + uFoilP.x * t.z) * uKeyCol * (t.y * bite * uMix.y);
  t = lightTerm(N, T, Bt, V, uFillDir);
  col += shade * uFillCol * t.x;
  col += pal(base + uFoilP.x * t.z) * uFillCol * (t.y * bite * uMix.y);
  t = lightTerm(N, T, Bt, V, uRimDir);
  col += shade * uRimCol * t.x;
  col += pal(base + uFoilP.x * t.z) * uRimCol * (t.y * bite * uMix.y);

  /* THE TORCHES. They are right there in the layout at both ends of the sign, and in v1 they lit
   * nothing. Two warm point lights at their measured DOM positions is what ties the 3D object to
   * the page it is sitting on: the letters nearest each torch are warmer and brighter, and the
   * flicker travels.
   * ⚑ THE FALLOFF WAS MEASURED, AND THE FIRST GUESS WAS THE BUG. At 1/(1+3r^2) a torch 0.65 units
   *   away still delivered 44% of its light, so the two of them lit the whole word almost evenly
   *   — a second ambient wearing a flame costume. Switching them off one at a time (the isolation
   *   the dev hook exists for) showed them lifting the median VALUE from 0.61 to 0.76 while
   *   costing saturation: they were the single biggest cause of the pale, washed first cut. At
   *   1/(1+14r^2) they fall to 14% at that range, so the ends of the word are visibly warmer than
   *   the middle — which is the entire point of lighting the type with the page's own props. */
  vec3 dA = uTorchA - vWorld;
  float rA = length(dA);
  t = lightTerm(N, T, Bt, V, normalize(dA * matrix_normal));
  float aA = uTorchAmp.x / (1.0 + 14.0 * rA * rA);
  col += shade * uTorchCol * (t.x * aA);
  col += pal(base + uFoilP.x * t.z) * uTorchCol * (t.y * bite * aA * uMix.y * 1.6);

  vec3 dB = uTorchB - vWorld;
  float rB = length(dB);
  t = lightTerm(N, T, Bt, V, normalize(dB * matrix_normal));
  float aB = uTorchAmp.y / (1.0 + 14.0 * rB * rB);
  col += shade * uTorchCol * (t.x * aB);
  col += pal(base + uFoilP.x * t.z) * uTorchCol * (t.y * bite * aB * uMix.y * 1.6);

  /* The fresnel sheen — the same interference, concentrated where the surface turns away. On
   * wm_bevel that is the die edge, which is exactly where a real foil stamp breaks light into
   * colour. It needs no light at all: it is a property of the coating and the view, which is why
   * it survives where the lamps do not reach. Phase pushed off base so the edge does not merely
   * repeat the face's colour — a die edge that matches its own face is a fillet, not a prism. */
  float fres = pow(1.0 - ndv, uMix.w);
  col += pal(base + uFoilP.x * axV * 0.9 + 0.28) * (fres * uFoilP.z * bite);

  /* ⚠ A SOFT KNEE, NOT A CLAMP, and this is measured elsewhere in the repo: GfxPost's highlight
   *   rolloff exists because additive terms push LDR pixels past 1.0 and the GPU clips them to
   *   flat white — which destroys hue exactly where the foil is most interesting. The first cut
   *   of this shader came back at mean 250,251,250 across every view angle: fully saturated, and
   *   therefore literally colourless. Same disease, same cure. */
  col = col / (1.0 + max(col - 0.70, vec3(0.0)));

  /* ⚠ Encoded here, by hand. A ShaderMaterial writes straight to the framebuffer — it does not
   *   pass through the standard material's gamma chunk, and gammaCorrection lives on the CAMERA
   *   COMPONENT in 2.x, not the scene, so a guard on app.scene is a silent no-op. uGamma is
   *   set from a measurement, not a belief: build-hero-type.mjs pushes a known palette entry
   *   through and compares the byte that comes out. */
  gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(uGamma)), 1.0);
}`;

  function makeShader(pc, hasUv) {
    const defs = new Map();
    if (hasUv) defs.set('HAS_UV', '');
    return {
      uniqueName: 'heroFoil-' + SHADER_VER + (hasUv ? '-uv' : '-flat'),
      attributes: hasUv
        ? { vertex_position: pc.SEMANTIC_POSITION, vertex_normal: pc.SEMANTIC_NORMAL,
          vertex_texCoord0: pc.SEMANTIC_TEXCOORD0 }
        : { vertex_position: pc.SEMANTIC_POSITION, vertex_normal: pc.SEMANTIC_NORMAL },
      vertexGLSL: VS,
      fragmentGLSL: FS,
      vertexDefines: defs,
      fragmentDefines: defs,
    };
  }

  async function mount() {
    if (stopped || S.phase !== 'idle') return;
    if (!document.body) { addEventListener('DOMContentLoaded', mount, { once: true }); return; }

    el = document.querySelector(SEL);
    if (!el) return fail('no wordmark');
    if (q('no3d') !== null) return fail('opt-out');
    if (thrifty()) return fail('save-data');
    if (!hasWebGL2()) return fail('no webgl2');

    S.phase = 'loading';
    await fontsReady();
    await new Promise(r => idle(r));
    if (stopped) return;

    let pc;
    try { pc = await engine(); } catch (e) { return fail(String(e && e.message || e)); }
    if (stopped) return;
    try { return build(pc); } catch (e) { return fail('build: ' + (e && e.message || e)); }
  }

  function build(pc) {
    if (!pc.ShaderMaterial) return fail('no ShaderMaterial');
    const stage = el.parentNode;
    if (!stage) return fail('no stage');
    // the canvas is absolutely positioned over the wordmark; the row has to be a containing block
    try { if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative'; } catch {}

    canvas = document.createElement('canvas');
    canvas.id = 'heroType';
    canvas.setAttribute('aria-hidden', 'true');
    /* The halo the CSS wordmark wears comes from two drop-shadows; keep them, on the canvas, or
     * the type loses the glow that separates it from the foil background behind it. */
    canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;opacity:0;' +
      'transition:opacity .45s ease;display:block;' +
      'filter:drop-shadow(0 0 18px rgba(43,255,128,.34)) drop-shadow(0 0 36px rgba(255,42,217,.20));';
    stage.appendChild(canvas);

    try {
      app = new pc.Application(canvas, {
        graphicsDeviceOptions: {
          alpha: true, antialias: true, depth: true, powerPreference: 'low-power',
          // ?grab=1 keeps the drawing buffer so a headless run can read the REAL pixels.
          // CLAUDE.md: this container's screenshot path rotates hue on canvas content.
          preserveDrawingBuffer: q('grab') !== null,
        },
      });
    } catch (e) { return fail('app: ' + (e && e.message || e)); }
    if (!app || !app.graphicsDevice) return fail('no device');

    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);

    const cam = new pc.Entity('cam');
    cam.addComponent('camera', { clearColor: new pc.Color(0, 0, 0, 0), fov: 8, nearClip: 0.05, farClip: 60 });
    /* ⚠ These live on the CAMERA COMPONENT in 2.x, not on the scene. They do not affect this
     *   file's own program — which encodes its output itself — but leaving the camera on a tone
     *   map would change what any future standard material here looked like, so they are pinned. */
    if ('gammaCorrection' in cam.camera) cam.camera.gammaCorrection = pc.GAMMA_NONE;
    if ('toneMapping' in cam.camera) cam.camera.toneMapping = pc.TONEMAP_NONE;
    app.root.addChild(cam);
    // no scene lights and no env: this file's program owns every photon (see the header)
    app.scene.ambientLight = new pc.Color(0, 0, 0);

    const root = new pc.Entity('wordmark');
    app.root.addChild(root);

    // ── materials ─────────────────────────────────────────────────────────────────────────────
    let mats;
    try {
      const uvDesc = makeShader(pc, true), flatDesc = makeShader(pc, false);
      mats = {
        face: new pc.ShaderMaterial(uvDesc),
        bevel: new pc.ShaderMaterial(uvDesc),
        rim: new pc.ShaderMaterial(flatDesc),
      };
    } catch (e) { return fail('shader: ' + (e && e.message || e)); }
    S.shader = SHADER_VER;

    /* THE THREE SURFACES OF A FOIL STAMP, and they are genuinely different materials rather than
     * three tints of one.
     *   face   the printed field. The ink carries the identity, the grating rides over it.
     *   bevel  the die's chamfer. Grating frequency and fresnel sheen pushed hard — this is
     *          where a real stamp breaks light into colour, and it is a thin band, so it can
     *          take an intensity the face could never wear without becoming a rainbow.
     *   rim    the wall: bare metal, no ink, no UVs. Dark body, bright anisotropic edge, so it
     *          reads as a thickness against the near-black page instead of fattening the letters.
     */
    const V4 = (a, b, c, d) => new Float32Array([a, b, c, d]);
    const CFG = {
      /* ⚑ THE GRATING FREQUENCY IS THE ONE NUMBER THAT DECIDES WHETHER THIS READS AS FOIL OR AS
       *   NOISE, and it was MEASURED, not chosen. The phase moves by `grating x sin(yaw)`, so at
       *   the first cut (2.9) a +/-19 degree fan walked 1.9 full palette cycles — 174 degrees of
       *   hue swing per patch and 92 degrees for every 6 degrees of turn. That is not a foil, it
       *   is a strobe: the colour at any instant is uncorrelated with the colour a moment before,
       *   and the eye reads uncorrelated colour as static. At 1.15 the same fan walks ~0.75 of a
       *   cycle: the palette visibly SLIDES through the letters, which is what a refractor does.
       *   The bevel runs richer because it is a thin band seen at a steeper angle — the same
       *   frequency there would barely move at all. */
      //          grating   film  sheen  patch |  bump  along across flake | foil  grat  emis  fres
      face: { foilP: V4(1.15, 0.26, 0.42, 0.55), surf: V4(1.05, 0.44, 0.075, 0.55), mix: V4(0.98, 0.75, 0.030, 3.2) },
      bevel: { foilP: V4(2.40, 0.44, 1.15, 0.95), surf: V4(0.85, 0.50, 0.100, 0.45), mix: V4(0.96, 1.10, 0.015, 2.0) },
      rim: { foilP: V4(3.00, 0.52, 0.95, 1.00), surf: V4(0.00, 0.58, 0.115, 0.00), mix: V4(0.85, 1.40, 0.004, 2.3) },
    };
    const RAMP = { face: [1.0, 0], bevel: [1.0, 0.06], rim: [0.0, 0.13] };
    for (const k of Object.keys(mats)) {
      const m = mats[k];
      m.setParameter('uFoilP', CFG[k].foilP);
      m.setParameter('uSurf', CFG[k].surf);
      m.setParameter('uMix', CFG[k].mix);
      m.setParameter('uRamp', new Float32Array(RAMP[k]));
      m.setParameter('uAmbient', new Float32Array([0.030, 0.040, 0.036]));
      m.setParameter('uGamma', 1 / 2.2);
      m.cull = pc.CULLFACE_BACK;
      m.update();
    }
    // the wall's own ink: dark, faintly green, so an unlit edge does not collapse into the
    // drop-shadow behind it and take the thickness with it
    mats.rim.setParameter('uInk', new Float32Array([0.020, 0.032, 0.026]));
    mats.face.setParameter('uInk', new Float32Array([1, 1, 1]));
    mats.bevel.setParameter('uInk', new Float32Array([1, 1, 1]));

    /* Three keys, the same cast bg-foil.js runs over the background so the wordmark belongs to
     * the same room: a warm-white KEY, an acid magenta fill from below-opposite so the walls are
     * never dead black, and a near-grazing cyan rim that picks the top edge out of the dark.
     * ⚑ The ink is multiplied by these, so they stay near-white in LUMINANCE and carry their hue
     *   lightly — a saturated green key over magenta ink is brown, which is card3d.js's lesson. */
    const LIGHTS = {
      key: { dir: [-0.40, 0.58, 0.71], col: [0.42, 0.40, 0.37] },
      fill: { dir: [0.66, -0.42, 0.62], col: [0.10, 0.046, 0.090] },
      rim: { dir: [0.52, 0.60, -0.61], col: [0.055, 0.120, 0.112] },
    };
    const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const setAll = (name, val) => { for (const k of Object.keys(mats)) mats[k].setParameter(name, val); };
    for (const k of Object.keys(LIGHTS)) {
      setAll('u' + k[0].toUpperCase() + k.slice(1) + 'Dir', new Float32Array(norm(LIGHTS[k].dir)));
      setAll('u' + k[0].toUpperCase() + k.slice(1) + 'Col', new Float32Array(LIGHTS[k].col));
    }
    setAll('uTorchCol', new Float32Array([0.92, 0.39, 0.12]));
    setAll('uTorchA', new Float32Array([-0.62, 0, 0.26]));
    setAll('uTorchB', new Float32Array([0.62, 0, 0.26]));
    setAll('uTorchAmp', new Float32Array([1, 1]));

    let ready = 0;
    Promise.all(['albedo', 'normal', 'foil', 'spectrum'].map(k => loadImage(TEX[k]))).then(imgs => {
      if (!app) return;
      const d = app.graphicsDevice;
      const t = {
        albedo: texFor(pc, d, imgs[0], { srgb: true }),
        normal: texFor(pc, d, imgs[1], { srgb: false }),
        foil: texFor(pc, d, imgs[2], { srgb: false }),
        // wrap: fract() in the shader lands on the seam, and CLAMP there would flatten the loop
        spectrum: texFor(pc, d, imgs[3], { srgb: true, mip: false, wrap: true }),
      };
      setAll('uSpectrum', t.spectrum);
      for (const k of ['face', 'bevel']) {
        mats[k].setParameter('uAlbedo', t.albedo);
        mats[k].setParameter('uNormalMap', t.normal);
        mats[k].setParameter('uFoil', t.foil);
      }
      for (const k of Object.keys(mats)) mats[k].update();
      ready |= 1;
    }).catch(e => { return fail('tex: ' + (e && e.message || e)); });

    // ── the mesh ──────────────────────────────────────────────────────────────────────────────
    loadGlb(pc, GLB).then(asset => {
      if (!app) return;
      const inst = asset.resource.instantiateRenderEntity();
      const named = {};
      inst.forEach(e => { if (e.render && e.render.meshInstances.length) named[e.name] = e; });
      S.parts = Object.keys(named).sort().join(',');
      /* Named parts are the contract with build-hero-type.py, the same way dogfight's GLB parts
       * are. A GLB that loads but carries the wrong names must not half-render. */
      if (!named.wm_face || !named.wm_bevel || !named.wm_rim) {
        inst.destroy(); return fail('glb parts: ' + S.parts);
      }
      named.wm_face.render.meshInstances.forEach(m => { m.material = mats.face; });
      named.wm_bevel.render.meshInstances.forEach(m => { m.material = mats.bevel; });
      named.wm_rim.render.meshInstances.forEach(m => { m.material = mats.rim; });
      root.addChild(inst);

      // fit from MEASURED bounds, never from a number typed twice
      app.root.syncHierarchy();
      let lo = null, hi = null;
      inst.forEach(e => {
        if (!e.render) return;
        e.render.meshInstances.forEach(m => {
          const b = m.aabb, c = b.center, h = b.halfExtents;
          const a = [c.x - h.x, c.y - h.y, c.z - h.z], z = [c.x + h.x, c.y + h.y, c.z + h.z];
          if (!lo) { lo = a.slice(); hi = z.slice(); return; }
          for (let i = 0; i < 3; i++) { if (a[i] < lo[i]) lo[i] = a[i]; if (z[i] > hi[i]) hi[i] = z[i]; }
        });
      });
      if (!lo || !(hi[0] - lo[0])) return fail('empty bounds');
      const w = hi[0] - lo[0], h = hi[1] - lo[1];
      S.aspect = w / h;
      inst.setLocalPosition(-(lo[0] + hi[0]) / 2 / w, -(lo[1] + hi[1]) / 2 / w, -(lo[2] + hi[2]) / 2 / w);
      inst.setLocalScale(1 / w, 1 / w, 1 / w);         // uniform: the type is now exactly 1 wide
      ready |= 2;
      fit();
    }).catch(e => fail(String(e && e.message || e)));

    // ── layout ────────────────────────────────────────────────────────────────────────────────
    /* The canvas is sized from the CSS wordmark's own box every time it changes, so the 3D type
     * lands exactly where the type it replaces was. Width is the wordmark's width; height is
     * whatever the mesh's aspect needs plus room to turn. */
    function fit() {
      if (!app || !el || !canvas) return false;
      const wr = el.getBoundingClientRect(), sr = el.parentNode.getBoundingClientRect();
      if (!wr.width) return false;
      const cw = Math.round(wr.width * OVER_X);
      const ch = Math.round(Math.max(wr.height, S.aspect ? wr.width / S.aspect : wr.height) * OVER_Y);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      canvas.style.left = Math.round(wr.left - sr.left - (cw - wr.width) / 2) + 'px';
      canvas.style.top = Math.round(wr.top - sr.top + wr.height / 2 - ch / 2) + 'px';
      S.dpr = Math.min(window.devicePixelRatio || 1, dprCap());
      app.graphicsDevice.maxPixelRatio = S.dpr;
      app.resizeCanvas(cw, ch);
      S.w = cw; S.h = ch;

      /* The fov is DERIVED, not tuned: at the fixed distance CAM_D, what vertical angle puts the
       * type's 1.0 width across `wr.width` of a canvas `cw` wide with this canvas aspect? Change
       * the box, the overscan or the device pixel ratio and the type still lands exactly on the
       * type it is covering. */
      const halfW = cw / (2 * Math.max(1, wr.width));       // half-width to frame, in model units
      const hh = halfW / (cw / ch);                         // ... as a half-HEIGHT
      const fov = Math.max(1, Math.min(40, 2 * Math.atan(hh / CAM_D) * 180 / Math.PI));
      cam.camera.fov = fov;
      S.fov = +fov.toFixed(3);
      cam.setPosition(0, 0, CAM_D);
      cam.lookAt(0, 0, 0);
      placeTorches(wr, sr);
      return true;
    }

    /* ⚑ THE TORCHES ARE PLACED FROM THE DOM, not from a guess. `.torch` is a sibling of the
     *   wordmark inside `.marquee-sign` and its size is a clamp() of the viewport, so its
     *   distance from the letters changes with every breakpoint. Measuring it means the light
     *   arrives from where the flame actually is at THIS width — which is the entire point of
     *   lighting the type with the page's own props rather than with two more studio lamps. */
    function placeTorches(wr, sr) {
      let cxs = [];
      try {
        const sign = el.parentNode;
        const found = sign ? sign.querySelectorAll('.torch') : [];
        for (const t of found) {
          const r = t.getBoundingClientRect();
          if (r.width) cxs.push([(r.left + r.width / 2 - (wr.left + wr.width / 2)) / wr.width,
            -(r.top + r.height * 0.30 - (wr.top + wr.height / 2)) / wr.width]);
        }
      } catch {}
      cxs.sort((a, b) => a[0] - b[0]);
      S.torches = cxs.length;
      const A = cxs[0] || [-0.62, 0.05], B = cxs[cxs.length - 1] || [0.62, 0.05];
      setAll('uTorchA', new Float32Array([A[0], A[1], 0.30]));
      setAll('uTorchB', new Float32Array([B[0], B[1], 0.30]));
    }

    // ── motion ────────────────────────────────────────────────────────────────────────────────
    const still = reduced();
    let tx = 0, ty = 0, cx = BASE_X, cy = BASE_Y, t0 = 0, last = -1e9, live = true;
    let px = 0, py = 0;                                   // pointer, normalised -1..1
    if (!still) {
      addEventListener('pointermove', e => {
        const r = canvas && canvas.getBoundingClientRect();
        if (!r || !r.height) return;
        px = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / Math.max(1, innerWidth / 2)));
        py = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / Math.max(1, innerHeight / 2)));
        tx = py * POINT_X;
        ty = px * POINT_Y;
      }, { passive: true });
    }

    /* ⚠ `autoRender = false` and ask for frames by hand: at ~32 fps this is about half the GPU
     *   cost of a decorative layer, and it lets the layer go completely quiet when it is off
     *   screen, backgrounded, or under prefers-reduced-motion. */
    app.autoRender = false;
    let held = null, pending = false;
    const draw = () => { app.renderNextFrame = true; pending = true; };
    poseFn = (pitch, yaw) => {
      held = (pitch === null) ? null : { x: pitch, y: yaw };
      if (held) { root.setLocalEulerAngles(held.x, held.y, 0); light(0); draw(); }
      return true;
    };

    /* The key light swings with the pointer and the torches flicker. This is half of what makes
     * foil read as foil: the grating phase depends on the HALF vector, so moving the light walks
     * the palette exactly as moving the eye does — and a page where only the object moves reads
     * as a turntable, not as a lit thing. */
    function light(s) {
      const k = LIGHTS.key.dir;
      setAll('uKeyDir', new Float32Array(norm([k[0] + px * 0.30, k[1] - py * 0.26, k[2]])));
      let a = 1, b = 1;
      if (!still) {
        // two incommensurate wobbles per torch — a single sine reads as a pulse, not a flame
        a = 0.80 + 0.16 * Math.sin(s * 7.3) + 0.10 * Math.sin(s * 17.9 + 1.7);
        b = 0.80 + 0.16 * Math.sin(s * 6.1 + 2.3) + 0.10 * Math.sin(s * 15.1);
      }
      setAll('uTorchAmp', new Float32Array([a, b]));
    }

    const scrollPitch = () => {
      try {
        const r = canvas.getBoundingClientRect();
        return Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / (innerHeight / 2))) * SCROLL_X;
      } catch { return 0; }
    };

    app.on('update', () => {
      if (ready !== 3) return;
      if (held) { draw(); return; }
      const now = performance.now();
      if (!t0) t0 = now;
      if (still) {
        if (S.frames) return;                       // reduced motion: lit and 3D, simply not moving
        root.setLocalEulerAngles(REST.x, REST.y, 0);
        light(0);
        draw();
        return;
      }
      if (!live || document.hidden) return;
      if (now - last < 1000 / FPS) return;
      last = now;
      const s = (now - t0) / 1000;
      // two periods that do not divide into each other, so the sway never returns to a pose
      const sy = BASE_Y + Math.sin(s * 0.37) * SWAY_Y + ty;
      const sx = BASE_X + Math.sin(s * 0.23 + 1.1) * SWAY_X + tx + scrollPitch();
      cy += (sy - cy) * 0.06;
      cx += (sx - cx) * 0.06;
      root.setLocalEulerAngles(cx, cy, Math.sin(s * 0.17) * 0.8);
      /* A slow drift on the global grating phase. Real foil under a moving flame shimmers even
       * when nothing else moves; without it a completely still page shows a completely still
       * wordmark, which is the one thing v1 got right by accident and would be a shame to lose.
       * ⚠ Small — the brief is view-dependent, not time-dependent, and a fast drift would let a
       *   still screenshot at two different moments "prove" a hue shift that is not there. */
      for (const k of Object.keys(mats)) {
        mats[k].setParameter('uRamp', new Float32Array([RAMP[k][0], RAMP[k][1] + s * 0.012]));
      }
      light(s);
      draw();
    });

    /* Reveal only once a frame has really been DRAWN — this is the moment the CSS wordmark may
     * safely be faded out, and not one moment earlier.
     * ⚑ `frameend` IS NOT "a frame was rendered". The engine fires it on every tick, render or
     *   no render: `update() -> fire('framerender') -> (autoRender||renderNextFrame) && render()
     *   -> fire('frameend')`. Counting frameends therefore reveals an EMPTY canvas and hides the
     *   real wordmark during the whole window between app.start() and the GLB arriving — the
     *   precise failure this file exists to avoid, and invisible on a fast connection because the
     *   window is a few frames wide. So the request is tracked instead: `pending` is set where we
     *   ask for the render and can only be observed here AFTER that render has actually run.
     * ⚑ AND `ready === 3` is part of the same condition, because "a frame was rendered" is still
     *   not the claim being made — "a frame WITH THE TYPE IN IT was rendered" is. `onResize`
     *   draws too, and the ResizeObserver fires once the moment it starts observing, which is
     *   before any texture or the mesh has arrived. That one empty frame was enough to fade the
     *   real wordmark out, and it is what the slow-mesh check in build-hero-type.mjs pins.
     * ⚑ AND IT IS STILL NOT ENOUGH — `hasInk()` below is the third condition, added after this
     *   file shipped a wordmark that VANISHED. A one-character GLSL slip (a redeclared local)
     *   made the material fail to link; PlayCanvas logs that through a debug channel the minified
     *   build strips, so nothing threw, nothing appeared in the console, the mesh silently drew
     *   nothing — and every condition above was still satisfied, so the real wordmark was faded
     *   out over an empty canvas. Every other guard in this file asks "did we get far enough?".
     *   This one asks the only question that actually matters: IS THERE ANYTHING ON THE CANVAS. */
    app.on('frameend', () => {
      if (!pending) return;
      pending = false;
      if (ready !== 3) return;
      S.frames++;
      if (S.frames !== 1) return;
      if (!hasInk()) return fail('blank canvas');
      S.phase = 'live';
      canvas.style.opacity = '1';
      if (prevOpacity === null) prevOpacity = el.style.opacity || '';
      el.style.transition = 'opacity .45s ease';
      el.style.opacity = '0';
    });

    /* ⚑ THE READBACK IS ONLY LEGAL INSIDE THE FRAME THAT DREW IT, and this runs from `frameend`,
     *   which the engine fires synchronously inside that same rAF callback. The drawing buffer is
     *   discarded at the next composite, so one tick later this reads back nothing — CLAUDE.md's
     *   already-recorded trap, arrived at from the other direction ("drawImage(glCanvas) reads
     *   back BLACK outside its own frame"). Inside the frame it is exact, with no
     *   `preserveDrawingBuffer` and therefore no cost to every other frame.
     * ⚠ NOT `gl.readPixels`. The context is requested with `antialias:true`, so the default
     *   framebuffer is MULTISAMPLED, and ANGLE rejects a read from it outright
     *   (GL_INVALID_OPERATION, glReadPixelsRobustANGLE). That failure is silent to JS — it raises
     *   a GL error, returns zeros, and would therefore have reported "blank" for every healthy
     *   render on earth, which is a far worse bug than the one being guarded against. The 2D
     *   canvas path goes through the browser's own resolve and has no such restriction.
     * ⚠ ONCE, on the first frame, on a band rather than the whole canvas: this is a decoration.
     *   The band is the vertical middle, which is where the letters are — the overscan above and
     *   below is deliberately empty. */
    function hasInk() {
      try {
        const w = canvas.width | 0, h = canvas.height | 0;
        if (w < 4 || h < 4) return true;            // nothing sized yet: not evidence of a bug
        const rows = Math.min(14, h), y0 = Math.max(0, (h >> 1) - (rows >> 1));
        const g = document.createElement('canvas');
        g.width = w; g.height = rows;
        const cx = g.getContext('2d', { willReadFrequently: true });
        if (!cx) return true;
        cx.drawImage(canvas, 0, y0, w, rows, 0, 0, w, rows);
        const d = cx.getImageData(0, 0, w, rows).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 24) n++;
        S.ink = +(n / (w * rows) * 100).toFixed(2);
        return n > w * rows * 0.02;                 // 2% of the band; a word covers ~35%
      } catch { return true; }                      // an unreadable buffer is not evidence of a bug
    }

    /* Named parts, in the manner of Card3D.build's return and ronin's `window.__rn` — a headless
     * check can turn one term off at a time instead of guessing which one it is looking at.
     * CLAUDE.md, "Isolate before tuning": switching the foil, the specular, the rim and the key
     * off ONE AT A TIME is what proved the card wash was not lighting. */
    window.__heroType = { app, mats, root, cam, CFG, LIGHTS, draw };

    app.start();
    fit();

    // resize / reflow
    // ⚠ guarded: a lost context tears the app down, and a window resize afterwards must not throw
    const onResize = () => { if (!app) return; fit(); if (!still) last = -1e9; draw(); };
    addEventListener('resize', onResize, { passive: true });
    if (!still) addEventListener('scroll', () => { last = -1e9; }, { passive: true });
    try { ro = new ResizeObserver(onResize); ro.observe(el); } catch { ro = null; }
    // a webfont landing after mount changes the box under us
    try { if (document.fonts) document.fonts.ready.then(onResize); } catch {}

    // don't animate a wordmark nobody is looking at
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = -1e9; } });
    try {
      io = new IntersectionObserver(es => { live = es.some(e => e.isIntersecting); }, { threshold: 0 });
      io.observe(el);
    } catch { io = null; }

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      fail('context lost');                 // fail() restores the CSS wordmark
    });

    return true;
  }

  function stop() { stopped = true; S.phase = 'stopped'; teardown(); }

  window.RipHeroType = {
    mount, stop,
    state: () => Object.assign({}, S),
    limits: () => ({ yaw: maxYaw(), pitch: maxPitch(), overX: OVER_X, overY: OVER_Y }),
    pose: (x, y) => !!(poseFn && poseFn(x, y)),
  };
  try { mount(); } catch (e) { fail('mount: ' + (e && e.message || e)); }
})();

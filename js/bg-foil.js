/* ripmaster3030studios — the site's background: Blender-baked foil card stock, lit live.
 *
 *   RipBg.mount()   idempotent; called automatically on load
 *   RipBg.stop()    tear down (returns the page to exactly how it looks without this file)
 *
 * WHAT IT IS. `media/bg/foil-*.webp` is a seamlessly tiling albedo + tangent normal map baked in
 * Blender from a procedural foil-card-stock material (scripts/blender/build-bg.py). This file
 * tiles it across the viewport and runs three coloured lights over the relief, one of them slowly
 * orbiting. The texture is Blender's; the ANIMATION is real per-frame lighting.
 *
 * ⚑ WHY LIT-IN-BROWSER RATHER THAN A RENDERED VIDEO LOOP. Measured, not assumed: Cycles on this
 *   box takes 133 s for one 640×360 frame and EEVEE cannot run at all, so a 720p loop is ~35
 *   hours of render. But even given free render time this is the better artifact — a video loop
 *   is megabytes on every page load, repeats on a fixed period the eye learns, and cannot react
 *   to anything. Lighting a baked map is ~600 KB, never repeats (the light's orbit and the
 *   drift are different periods), and costs one fullscreen quad.
 *
 * ⚑ IT SITS AT z-index -4, UNDER EVERYTHING THAT WAS ALREADY THERE. The page's existing layers
 *   (#rain -3, .lm -2, .crt -1) are untouched, so this is additive: if the fetch 404s, WebGL is
 *   missing, the context is lost, or this file never loads, the site renders exactly as it did
 *   before it existed. That is the whole reason it is a separate layer instead of a rewrite of
 *   the page background.
 */
(() => {
  const SRC_ALBEDO = 'media/bg/foil-albedo.webp';
  const SRC_NORMAL = 'media/bg/foil-normal.webp';

  /* One tile across ~660 CSS px. Bigger reads as wallpaper (you see the repeat), smaller turns
   * the relief into noise at arm's length. */
  const TILE_PX = 660;
  const DRIFT = 0.0065;      // tiles/second — slow enough to be felt, not watched
  const ORBIT = 74;          // seconds for the key light to come back round
  /* Overall output gain. Swept against the composited plate (see scripts/build-bg.mjs): the
   * texture has to be felt under a paragraph without competing with it. */
  const STRENGTH = 0.62;

  let canvas = null, gl = null, raf = 0, stopped = false, t0 = 0;

  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const saveData = () => { try { return !!(navigator.connection && navigator.connection.saveData); } catch { return false; } };

  /* Reuse the ONE definition of "weak device" the games already agreed on, rather than inventing
   * a second one that can drift from it. Absent (this page didn't load GfxPost) ⇒ cap at 2. */
  const dprCap = () => { try { return (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2; } catch { return 2; } };

  /* ⚠ Resolve against THIS SCRIPT's URL, not document.baseURI. The maps live at the site root,
   *   but this file is also loaded from /cards/*.html — where baseURI would resolve
   *   `media/bg/...` to `/cards/media/bg/...` and silently 404 into the fallback. Taking the
   *   base off the script tag is the one form that is right from any depth. */
  const SELF = (document.currentScript && document.currentScript.src) || '';
  const BASE = SELF ? SELF.replace(/js\/bg-foil\.js.*$/, '') : document.baseURI;
  const url = p => new URL(p, BASE).href;

  const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

  const FS = `
  precision mediump float;
  uniform vec2  uRes;
  uniform float uT;
  uniform float uTile;      // CSS px per tile, in device pixels
  uniform sampler2D uAlb;
  uniform sampler2D uNrm;
  uniform float uMotion;    // 0 = frozen (reduced motion): still lit, just not moving

  void main(){
    vec2 px = gl_FragCoord.xy;
    // a very slow diagonal drift; the two axes use different rates so the pattern never
    // returns to a previous state the way a single translation would
    vec2 uv = px / uTile + vec2(uT * ${DRIFT.toFixed(5)}, uT * ${(DRIFT * 0.62).toFixed(5)}) * uMotion;

    vec3 alb = texture2D(uAlb, uv).rgb;
    // tangent-space normal, z up
    vec3 n = normalize(texture2D(uNrm, uv).xyz * 2.0 - 1.0);
    vec3 v = vec3(0.0, 0.0, 1.0);

    // how much foil is here — the bake tints the raised cell tops, so albedo brightness IS the
    // foil mask. One texture doing two jobs, which is why there is no third map to download.
    float foil = smoothstep(0.10, 0.42, dot(alb, vec3(0.2126, 0.7152, 0.0722)) * 6.0);

    float a = uT * ${(Math.PI * 2 / ORBIT).toFixed(6)} * uMotion;
    vec3 lights[3];
    vec3 cols[3];
    // key — phosphor green, orbiting. A RAKING angle (low z) is what makes an emboss read as
    // an emboss; light it head-on and it flattens to a swatch.
    lights[0] = normalize(vec3(cos(a) * 0.92, sin(a) * 0.92, 0.42));
    cols[0]   = vec3(0.169, 1.000, 0.502);
    // fill — magenta, opposite and lower, so recesses are not dead black
    lights[1] = normalize(vec3(-cos(a) * 0.7, -sin(a) * 0.7, 0.30));
    cols[1]   = vec3(1.000, 0.165, 0.851);
    // rim — cyan, fixed, near-grazing: picks cell edges out of the dark
    lights[2] = normalize(vec3(0.80, -0.34, 0.24));
    cols[2]   = vec3(0.153, 0.969, 0.894);

    float gain[3];
    gain[0] = 0.55; gain[1] = 0.22; gain[2] = 0.30;

    vec3 c = alb * 0.55;                                  // ambient: keep the stock visible
    for (int i = 0; i < 3; i++){
      vec3 l = lights[i];
      float d = max(dot(n, l), 0.0);
      vec3 h = normalize(l + v);
      float s = pow(max(dot(n, h), 0.0), 42.0) * foil;    // specular only on the foil
      c += cols[i] * gain[i] * (alb * d * 1.6 + s * 0.30);
    }

    // vignette — pull the corners down so the centre column of the page stays the readable part
    vec2 q = (px / uRes - 0.5) * 2.0;
    c *= 1.0 - 0.42 * dot(q, q);

    /* ⚑ STRENGTH IS MEASURED ON THE LIT COMPOSITE, NOT ON THE ALBEDO — the first pass tuned the
     *   bake to a mean luma of 33 and called it legible, then the three lights and the specular
     *   put the p99 up at 80 with a lot of high-frequency structure, and the small dim print on
     *   tokenomics.html visibly fought it. What text sits on is the LIT result, so that is the
     *   thing with a number on it: scripts/build-bg.mjs' headless pass shoots the plate in
     *   isolation and holds p99 and sd to a band. Contrast under small text is a spatial
     *   property; a mean alone will happily pass a background you cannot read on. */
    c *= ${STRENGTH.toFixed(3)};

    gl_FragColor = vec4(c, 1.0);
  }`;

  function compile(g, type, src) {
    const s = g.createShader(type);
    g.shaderSource(s, src); g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) { g.deleteShader(s); return null; }
    return s;
  }

  function texture(g, img) {
    const t = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, t);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, img);
    // REPEAT is the whole point — the bake is seamless so the tile can wrap forever
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.REPEAT);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.generateMipmap(g.TEXTURE_2D);
    return t;
  }

  const load = src => new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('img ' + src));
    i.decoding = 'async';
    i.src = url(src);
  });

  /* ── the fallback: the albedo as a plain tiled CSS background. ──────────────────────────────
   * No WebGL means no relief lighting, but the material still shows and the page still has a
   * textured backdrop instead of flat black. Deliberately NOT animated here — a CSS
   * background-position animation on a full-page layer repaints the whole viewport every frame
   * on exactly the machines that failed to give us a GL context. */
  function cssFallback() {
    const d = document.createElement('div');
    d.id = 'bgFoil';
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:fixed;inset:0;z-index:-4;pointer-events:none;' +
      'background:#010604 url("' + url(SRC_ALBEDO) + '") repeat;background-size:' + TILE_PX + 'px;';
    document.body.appendChild(d);
    return d;
  }

  async function mount() {
    if (stopped || document.getElementById('bgFoil') || document.getElementById('bgFoilC')) return;
    if (!document.body) { addEventListener('DOMContentLoaded', mount, { once: true }); return; }

    let alb, nrm;
    try { [alb, nrm] = await Promise.all([load(SRC_ALBEDO), load(SRC_NORMAL)]); }
    catch { return; }                       // 404 / decode failure ⇒ the page is exactly as before

    canvas = document.createElement('canvas');
    canvas.id = 'bgFoilC';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:-4;pointer-events:none;width:100%;height:100%;display:block;';

    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false,
                                        powerPreference: 'low-power', failIfMajorPerformanceCaveat: false });
    } catch { gl = null; }
    if (!gl) { cssFallback(); return; }

    const vs = compile(gl, gl.VERTEX_SHADER, VS), fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { cssFallback(); return; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { cssFallback(); return; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0); const tA = texture(gl, alb);
    gl.activeTexture(gl.TEXTURE1); const tN = texture(gl, nrm);
    gl.uniform1i(gl.getUniformLocation(prog, 'uAlb'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'uNrm'), 1);
    void tA; void tN;

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uT = gl.getUniformLocation(prog, 'uT');
    const uTile = gl.getUniformLocation(prog, 'uTile');
    const uMotion = gl.getUniformLocation(prog, 'uMotion');

    document.body.appendChild(canvas);

    /* ⚠ Backing-store resolution is the dominant cost of any fullscreen pass on mobile, so this
     *   goes through the same dprCap() the games use. It is an ABSOLUTE cap with a floor of 1 —
     *   never go under one CSS pixel, that is visibly soft. */
    let W = 0, H = 0;
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap());
      const w = Math.max(1, Math.round(innerWidth * dpr)), h = Math.max(1, Math.round(innerHeight * dpr));
      if (w === W && h === H) return;
      W = w; H = h; canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTile, TILE_PX * dpr);
    }

    // still lit, just not moving — the relief is the point, the motion is the garnish
    const motion = (reduced() || saveData()) ? 0 : 1;
    gl.uniform1f(uMotion, motion);

    let last = 0;
    function frame(now) {
      if (stopped) return;
      raf = requestAnimationFrame(frame);
      if (!t0) t0 = now;
      // ~30fps is plenty for something this slow, and halves the GPU cost of a decorative layer
      if (now - last < 33) return;
      last = now;
      size();
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    size();
    gl.uniform1f(uT, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);       // paint once immediately, before any rAF

    if (motion) {
      raf = requestAnimationFrame(frame);
      // don't animate a background nobody is looking at
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
        else if (!raf && !stopped) { last = 0; raf = requestAnimationFrame(frame); }
      });
    } else {
      addEventListener('resize', () => { size(); gl.drawArrays(gl.TRIANGLES, 0, 3); }, { passive: true });
    }

    // a lost context must not leave a black rectangle over the page
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault(); cancelAnimationFrame(raf); raf = 0;
      canvas.remove(); cssFallback();
    });
  }

  function stop() {
    stopped = true;
    cancelAnimationFrame(raf); raf = 0;
    const c = document.getElementById('bgFoilC'); if (c) c.remove();
    const d = document.getElementById('bgFoil'); if (d) d.remove();
  }

  window.RipBg = { mount, stop };
  // never let a background take the page down with it
  try { mount(); } catch {}
})();

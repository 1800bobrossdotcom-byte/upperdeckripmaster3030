/* upperdeckripmaster3030 — GfxPost: one shared post-process chain for every WebGL game.
 *
 * NEON RONIN grew a bloom compositor inline; the other games (Section 9, Cloudracer) render
 * straight to the default framebuffer and look flat next to it. This lifts that chain out into a
 * renderer-agnostic module so any game can wrap its existing draw in two calls:
 *
 *     const P = GfxPost.create(gl, canvas, GfxPost.PRESET.tactical);
 *     ...
 *     P.begin();          // scene now renders into an offscreen colour+depth target
 *     drawEverything();   // unchanged game code
 *     P.end();            // bright-pass → separable gaussian → composite to the screen
 *
 * The chain is scene → bright-pass → half-res ping-pong blur ×N → composite with additive bloom,
 * chromatic aberration, vignette and film grain.
 *
 * FAIL-OPEN BY DESIGN. If shader compilation, the FBO chain, or anything else fails, `on` goes
 * false and begin()/end() become no-ops — the game draws exactly as it did before, uncomposited.
 * A pretty frame is never worth a black screen.
 */
window.GfxPost = (function () {
  const PVS = 'attribute vec2 p; varying vec2 uv; void main(){ uv=p*0.5+0.5; gl_Position=vec4(p,0.0,1.0); }';

  const P_BRIGHT = 'precision mediump float; varying vec2 uv; uniform sampler2D t; uniform float thr;' +
    'void main(){ vec3 c=texture2D(t,uv).rgb; float l=dot(c,vec3(0.299,0.587,0.114));' +
    ' float k=max(0.0,l-thr)/max(l,0.001); gl_FragColor=vec4(c*k*c*1.25,1.0); }';

  const P_BLUR = 'precision mediump float; varying vec2 uv; uniform sampler2D t; uniform vec2 dir;' +
    'void main(){ vec3 s=vec3(0.0);' +
    's+=texture2D(t,uv+dir*-4.0).rgb*0.05; s+=texture2D(t,uv+dir*-3.0).rgb*0.09;' +
    's+=texture2D(t,uv+dir*-2.0).rgb*0.12; s+=texture2D(t,uv+dir*-1.0).rgb*0.15;' +
    's+=texture2D(t,uv).rgb*0.18;' +
    's+=texture2D(t,uv+dir*1.0).rgb*0.15; s+=texture2D(t,uv+dir*2.0).rgb*0.12;' +
    's+=texture2D(t,uv+dir*3.0).rgb*0.09; s+=texture2D(t,uv+dir*4.0).rgb*0.05;' +
    'gl_FragColor=vec4(s,1.0); }';

  const P_COMP = 'precision mediump float; varying vec2 uv;' +
    'uniform sampler2D base; uniform sampler2D bloom;' +
    'uniform float intensity; uniform float ca; uniform float grain; uniform float vig; uniform float sat;' +
    'float h(vec2 p){ return fract(sin(dot(p,vec2(41.0,289.0)))*43758.5453); }' +
    'void main(){ vec2 dd=uv-0.5;' +
    'vec3 col; col.r=texture2D(base,uv+dd*ca).r; col.g=texture2D(base,uv).g; col.b=texture2D(base,uv-dd*ca).b;' +
    'col += texture2D(bloom,uv).rgb*intensity;' +
    'float lum=dot(col,vec3(0.299,0.587,0.114)); col=mix(vec3(lum),col,sat);' +
    'float v=smoothstep(1.12,0.34,length(dd)); col*=mix(1.0-vig,1.0,v);' +
    'col += (h(uv*vec2(1023.0,791.0)+grain)-0.5)*0.02;' +
    'gl_FragColor=vec4(col,1.0); }';

  /* Per-game looks. `tactical` is deliberately restrained — Section 9 is a gritty FPS, not a
   * neon duel, so the bloom reads as bounced light rather than a glow filter. */
  const PRESET = {
    neon:     { intensity: 1.15, threshold: 0.62, ca: 0.0022, vignette: 0.36, sat: 1.00, passes: 2 },
    tactical: { intensity: 0.62, threshold: 0.70, ca: 0.0012, vignette: 0.42, sat: 1.06, passes: 2 },
    // Cloudracer flies through an already near-white sky: a low threshold blooms the whole
    // cloudscape into a flat wash, so only genuine highlights (engines, neon trim) get to glow.
    sky:      { intensity: 0.34, threshold: 0.90, ca: 0.0010, vignette: 0.22, sat: 1.05, passes: 2 },
  };

  function create(gl, cv, opts) {
    const O = Object.assign({}, PRESET.neon, opts || {});
    const S = { on: false, w: 0, h: 0, sceneTex: null, depth: null, sceneFbo: null,
                bA: null, bB: null, fA: null, fB: null, bright: null, blur: null, comp: null, tri: null };
    let grainT = 0, maxAttr = 4, bound = false;

    function sh(t, src) { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
    function progFor(fs) { const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, PVS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
    const u = (p, n) => gl.getUniformLocation(p, n);

    function tex2d(w, h) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); return t; }
    function fboFor(t) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; }

    // Re-allocating on resize without freeing leaks a full-screen RGBA target per resize event —
    // a maximise/restore loop would climb into hundreds of MB. Drop the old set first.
    function freeTargets() {
      [S.sceneTex, S.bA, S.bB].forEach(t => t && gl.deleteTexture(t));
      [S.sceneFbo, S.fA, S.fB].forEach(f => f && gl.deleteFramebuffer(f));
      if (S.depth) gl.deleteRenderbuffer(S.depth);
      S.sceneTex = S.bA = S.bB = S.sceneFbo = S.fA = S.fB = S.depth = null;
    }

    function size(w, h) {
      if (S.w === w && S.h === h) return true;
      freeTargets();
      S.w = w; S.h = h;
      const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
      S.sceneTex = tex2d(w, h); S.sceneFbo = fboFor(S.sceneTex);
      S.depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, S.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, S.depth);
      const okFbo = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      S.bA = tex2d(bw, bh); S.fA = fboFor(S.bA); S.bB = tex2d(bw, bh); S.fB = fboFor(S.bB);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!okFbo) { freeTargets(); S.w = S.h = 0; S.on = false; }
      return okFbo;
    }

    try {
      S.bright = progFor(P_BRIGHT); S.blur = progFor(P_BLUR); S.comp = progFor(P_COMP);
      S.tri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, S.tri);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      maxAttr = Math.min(8, gl.getParameter(gl.MAX_VERTEX_ATTRIBS) || 4);
      S.on = size(Math.max(2, cv.width | 0), Math.max(2, cv.height | 0));
    } catch (e) { S.on = false; }

    /* The host game leaves its own vertex attributes enabled and pointed at buffers sized for its
     * geometry. A 3-vertex fullscreen triangle bound against those would read past the end, and
     * some drivers silently drop the whole draw. Enable 0, hard-disable the rest. */
    function drawTri() {
      gl.bindBuffer(gl.ARRAY_BUFFER, S.tri);
      for (let i = 1; i < maxAttr; i++) gl.disableVertexAttribArray(i);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function begin() {
      if (!S.on) return false;
      const w = Math.max(2, cv.width | 0), h = Math.max(2, cv.height | 0);
      if ((w !== S.w || h !== S.h) && !size(w, h)) return false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.sceneFbo);
      gl.viewport(0, 0, S.w, S.h);
      bound = true;
      return true;
    }

    function end() {
      if (!S.on || !bound) return false;
      bound = false;
      const w = S.w, h = S.h, bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
      const hadDepth = gl.isEnabled(gl.DEPTH_TEST), hadBlend = gl.isEnabled(gl.BLEND);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);

      gl.bindFramebuffer(gl.FRAMEBUFFER, S.fB); gl.viewport(0, 0, bw, bh);
      gl.useProgram(S.bright); gl.uniform1i(u(S.bright, 't'), 0); gl.uniform1f(u(S.bright, 'thr'), O.threshold);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.sceneTex); drawTri();

      gl.useProgram(S.blur); gl.uniform1i(u(S.blur, 't'), 0);
      for (let i = 0; i < O.passes; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, S.fA); gl.viewport(0, 0, bw, bh);
        gl.uniform2f(u(S.blur, 'dir'), 1.4 / bw, 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.bB); drawTri();
        gl.bindFramebuffer(gl.FRAMEBUFFER, S.fB); gl.viewport(0, 0, bw, bh);
        gl.uniform2f(u(S.blur, 'dir'), 0, 1.4 / bh);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.bA); drawTri();
      }

      grainT = (grainT + 0.017) % 1000;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
      gl.useProgram(S.comp);
      gl.uniform1i(u(S.comp, 'base'), 0); gl.uniform1i(u(S.comp, 'bloom'), 1);
      gl.uniform1f(u(S.comp, 'intensity'), O.intensity); gl.uniform1f(u(S.comp, 'ca'), O.ca);
      gl.uniform1f(u(S.comp, 'grain'), grainT); gl.uniform1f(u(S.comp, 'vig'), O.vignette);
      gl.uniform1f(u(S.comp, 'sat'), O.sat);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.sceneTex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S.bB);
      drawTri();
      gl.activeTexture(gl.TEXTURE0);

      if (hadDepth) gl.enable(gl.DEPTH_TEST);
      if (hadBlend) gl.enable(gl.BLEND);
      return true;
    }

    function set(o) { Object.assign(O, o || {}); }
    function dispose() { freeTargets(); S.on = false; }

    return { begin, end, set, dispose, get on() { return S.on; }, set on(v) { S.on = !!v && !!S.comp; },
             get opts() { return O; } };
  }

  return { create, PRESET };
})();

/* upperdeckripmaster3030 — NEON RONIN GPU compositor (RoninGL).
 *
 * Brings the Section-9 "GPU look" to the 2D fighter: the game keeps drawing the scene to
 * a 2D canvas, then this uploads it as a texture and runs a WebGL post-processing chain —
 * a bright-pass + separable Gaussian bloom (ping-pong FBOs) on the neon + blades, then a
 * composite pass with vignette, film grain and a touch of chromatic aberration. Falls back
 * cleanly to the raw 2D canvas if WebGL isn't available.
 *
 *   RoninGL.init(glCanvas)   → true if the GPU path is live
 *   RoninGL.present(srcCanvas)   upload + bloom + composite to glCanvas; returns true on success
 */
window.RoninGL = (function () {
  let gl = null, ok = false, cv = null;
  let W = 0, H = 0, bw = 0, bh = 0;
  let progBright, progBlur, progComp, quadBuf;
  let texSrc, texA, texB, fboA, fboB;

  const VS = 'attribute vec2 p; varying vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }';
  const F_BRIGHT =
    'precision mediump float; varying vec2 uv; uniform sampler2D t; uniform float thr;' +
    'void main(){ vec3 c=texture2D(t,uv).rgb; float l=dot(c,vec3(0.299,0.587,0.114));' +
    'float k=max(0.0,l-thr)/max(l,0.001); gl_FragColor=vec4(c*k*c*1.3,1.0); }';   // emphasise the hottest emissive
  const F_BLUR =
    'precision mediump float; varying vec2 uv; uniform sampler2D t; uniform vec2 dir;' +
    'void main(){ vec3 s=vec3(0.0);' +
    's+=texture2D(t,uv+dir*-4.0).rgb*0.05; s+=texture2D(t,uv+dir*-3.0).rgb*0.09; s+=texture2D(t,uv+dir*-2.0).rgb*0.12; s+=texture2D(t,uv+dir*-1.0).rgb*0.15;' +
    's+=texture2D(t,uv).rgb*0.18;' +
    's+=texture2D(t,uv+dir*1.0).rgb*0.15; s+=texture2D(t,uv+dir*2.0).rgb*0.12; s+=texture2D(t,uv+dir*3.0).rgb*0.09; s+=texture2D(t,uv+dir*4.0).rgb*0.05;' +
    'gl_FragColor=vec4(s,1.0); }';
  const F_COMP =
    'precision mediump float; varying vec2 uv; uniform sampler2D base; uniform sampler2D bloom; uniform float intensity; uniform float ca; uniform float grain;' +
    'float h(vec2 p){ return fract(sin(dot(p,vec2(41.0,289.0)))*43758.5453); }' +
    'void main(){ vec2 d=uv-0.5;' +
    'vec3 col; col.r=texture2D(base,uv+d*ca).r; col.g=texture2D(base,uv).g; col.b=texture2D(base,uv-d*ca).b;' +   // chromatic aberration
    'col += texture2D(bloom,uv).rgb*intensity;' +                                                                 // additive bloom
    'float v=smoothstep(1.05,0.35,length(d)); col*=mix(0.62,1.0,v);' +                                            // vignette
    'col += (h(uv*vec2(1023.0,791.0)+grain)-0.5)*0.028;' +                                                        // film grain
    'gl_FragColor=vec4(col,1.0); }';

  function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; }
  function program(fs) { const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p)); return p; }
  function mkTex(w, h) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); return t; }
  function mkFbo(tex) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); return f; }

  function sizeTo(w, h) {
    W = w; H = h; bw = Math.max(1, w >> 1); bh = Math.max(1, h >> 1);
    cv.width = W; cv.height = H;
    texA = mkTex(bw, bh); fboA = mkFbo(texA);
    texB = mkTex(bw, bh); fboB = mkFbo(texB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function init(glCanvas) {
    try {
      cv = glCanvas;
      gl = cv.getContext('webgl', { premultipliedAlpha: false, alpha: false, antialias: false })
        || cv.getContext('experimental-webgl');
      if (!gl) return false;
      progBright = program(F_BRIGHT); progBlur = program(F_BLUR); progComp = program(F_COMP);
      quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // fullscreen triangle
      texSrc = mkTex(0, 0);
      sizeTo(glCanvas.width || 2, glCanvas.height || 2);
      ok = true; return true;
    } catch (e) { ok = false; gl = null; return false; }
  }

  function drawQuad() { gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  function bind(fbo, w, h) { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h); }
  const u = (p, n) => gl.getUniformLocation(p, n);

  let grainT = 0;
  function present(src) {
    if (!ok) return false;
    try {
      if (src.width !== W || src.height !== H) sizeTo(src.width, src.height);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      // upload the 2D scene (flip Y so canvas-top maps to GL-top)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texSrc);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      // bright-pass → B
      bind(fboB, bw, bh); gl.useProgram(progBright); gl.uniform1i(u(progBright, 't'), 0); gl.uniform1f(u(progBright, 'thr'), 0.62);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texSrc); drawQuad();
      // separable blur ping-pong (B→A horizontal, A→B vertical) ×2
      gl.useProgram(progBlur); gl.uniform1i(u(progBlur, 't'), 0);
      for (let i = 0; i < 2; i++) {
        bind(fboA, bw, bh); gl.uniform2f(u(progBlur, 'dir'), 1.4 / bw, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texB); drawQuad();
        bind(fboB, bw, bh); gl.uniform2f(u(progBlur, 'dir'), 0, 1.4 / bh); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texA); drawQuad();
      }
      // composite → screen
      grainT = (grainT + 0.017) % 1000;
      bind(null, W, H); gl.useProgram(progComp);
      gl.uniform1i(u(progComp, 'base'), 0); gl.uniform1i(u(progComp, 'bloom'), 1);
      gl.uniform1f(u(progComp, 'intensity'), 1.15); gl.uniform1f(u(progComp, 'ca'), 0.0022); gl.uniform1f(u(progComp, 'grain'), grainT);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texSrc);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texB);
      drawQuad();
      return true;
    } catch (e) { ok = false; return false; }
  }

  return { init, present, get ok() { return ok; } };
})();

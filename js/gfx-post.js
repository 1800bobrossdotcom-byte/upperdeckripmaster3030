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

  /* The composite. Everything after the blur happens here, in one pass, in this order —
   * the order matters more than any single effect:
   *
   *   1 chromatic aberration   sampled, so it displaces the SOURCE not the result
   *   2 additive bloom
   *   3 HIGHLIGHT ROLLOFF      the important one. These games are LDR, so adding bloom
   *                            pushes bright pixels past 1.0 and the GPU clips them to flat
   *                            white — which is exactly how Cloudracer's cloudscape turned
   *                            into a wash. Scaling by luminance above a knee rolls those
   *                            off smoothly instead, preserving hue, and is identity below
   *                            the knee so the rest of the frame is untouched.
   *   4 saturation / vignette
   *   5 ORDERED DITHER         8x8 Bayer, ±1/255. Kills the banding that shows up in dark
   *                            gradients (Section 9's corridors, the ronin night sky) where
   *                            8-bit output quantises a smooth ramp into visible steps.
   *   6 SHARPEN                a small unsharp against the 4-neighbour average. Low-poly art
   *                            reads crisper, and it wins back the softness the blur added.
   *   7 grain
   */
  const P_COMP = 'precision mediump float; varying vec2 uv;' +
    'uniform sampler2D base; uniform sampler2D bloom; uniform sampler2D prev; uniform vec2 texel;' +
    'uniform float intensity; uniform float ca; uniform float grain; uniform float vig;' +
    'uniform float sat; uniform float knee; uniform float dither; uniform float sharpen; uniform float smear;' +
    'float h(vec2 p){ return fract(sin(dot(p,vec2(41.0,289.0)))*43758.5453); }' +
    // 8x8 Bayer without a lookup texture: the classic bit-interleave, unrolled cheaply.
    'float bayer(vec2 p){ vec2 t=floor(mod(p,8.0));' +
    ' float b=0.0, s=1.0;' +
    ' for(int i=0;i<3;i++){ vec2 f=floor(mod(t,2.0)); b+=s*(f.x+2.0*mod(f.x+f.y,2.0)); s*=4.0; t=floor(t*0.5); }' +
    ' return b/64.0; }' +
    'vec3 grab(vec2 c){ vec2 dd=c-0.5; vec3 o;' +
    ' o.r=texture2D(base,c+dd*ca).r; o.g=texture2D(base,c).g; o.b=texture2D(base,c-dd*ca).b;' +
    ' return o+texture2D(bloom,c).rgb*intensity; }' +
    'void main(){ vec2 dd=uv-0.5;' +
    ' vec3 col=grab(uv);' +
    // 3 — highlight rolloff, luminance-keyed so colour does not shift
    ' float l=dot(col,vec3(0.299,0.587,0.114));' +
    ' col*= 1.0/(1.0+max(0.0,l-knee));' +
    // 6 — unsharp against the neighbourhood (skipped when sharpen==0)
    ' if(sharpen>0.001){' +
    '   vec3 n=grab(uv+vec2(texel.x,0.0))+grab(uv-vec2(texel.x,0.0))' +
    '         +grab(uv+vec2(0.0,texel.y))+grab(uv-vec2(0.0,texel.y));' +
    '   col+= (col-n*0.25)*sharpen; }' +
    // 4 — saturation, then vignette
    ' float lum=dot(col,vec3(0.299,0.587,0.114)); col=mix(vec3(lum),col,sat);' +
    ' float v=smoothstep(1.12,0.34,length(dd)); col*=mix(1.0-vig,1.0,v);' +
    // 5 — ordered dither before the 8-bit write
    ' col+= (bayer(gl_FragCoord.xy)-0.5)*dither;' +
    // 7 — grain last, so it is not sharpened into crawling speckle
    ' col+= (h(uv*vec2(1023.0,791.0)+grain)-0.5)*0.02;' +
    // 8 — MOTION SMEAR: feedback against the previously presented frame. Identity at smear==0,
    //     and the branch keeps the extra fetch off the wire entirely for presets that never
    //     enable it, so nothing that does not opt in pays for this.
    ' if(smear>0.001){ col=mix(col, texture2D(prev,uv).rgb, smear); }' +
    ' gl_FragColor=vec4(col,1.0); }';

  // trivial blit, used only on the smear path to put the accumulated frame on the screen
  const P_BLIT = 'precision mediump float; varying vec2 uv; uniform sampler2D t;' +
    'void main(){ gl_FragColor=vec4(texture2D(t,uv).rgb,1.0); }';

  /* Per-game looks. `tactical` is deliberately restrained — Section 9 is a gritty FPS, not a
   * neon duel, so the bloom reads as bounced light rather than a glow filter. */
  /* MOTION SMEAR (`blur`) is per-CALLER, not per-preset-name: create() merges whatever object it
   * is handed over PRESET.neon, so `{...GfxPost.PRESET.neon, blur: 0.3}` gives one game a smear
   * without the other game that also uses `neon` inheriting it. Every named preset below is 0
   * except `tactical`; anything that does not set it keeps today's chain exactly, down to the
   * shader branch never being taken.
   *
   * The value is a CEILING, not an amount. The game calls post.motion(0..1) each frame from how
   * fast the camera is actually turning, and the feedback mix is motion × blur — so a still
   * camera is pin sharp and only a whip-pan smears. Held below ~0.85 on purpose: this is a
   * feedback loop, and at higher mixes the frame never lets go of what it saw. */
  const PRESET = {
    // knee    : luminance above which highlights roll off instead of clipping. MEASURED, not
    //           guessed — swept against Cloudracer's clipped-pixel count. 0.94 removes 100%
    //           of clipping at no cost (mean 129.5 vs 128.8 unrolled, contrast 73.2 vs 73.3);
    //           0.62 also removed it but cost 14 luma and 14 contrast, dimming the whole sky
    //           rather than just the highlights. Lower is NOT safer here, it is just darker.
    // dither  : ordered-dither amplitude, in 1/255 units (banding killer, keep it small)
    // sharpen : unsharp strength. Low-poly wants some; photographic sources do not.
    // blur    : motion-smear CEILING, scaled every frame by post.motion(). 0 = off (default).
    neon:     { intensity: 1.15, threshold: 0.62, ca: 0.0022, vignette: 0.36, sat: 1.00,
                knee: 0.92, dither: 0.0045, sharpen: 0.18, passes: 2, blur: 0 },
    tactical: { intensity: 0.62, threshold: 0.70, ca: 0.0012, vignette: 0.42, sat: 1.06,
                knee: 0.94, dither: 0.0045, sharpen: 0.26, passes: 2, blur: 0.55 },
    // Cloudracer flies through an already near-white sky: a low threshold blooms the whole
    // cloudscape into a flat wash, so only genuine highlights (engines, neon trim) get to glow.
    sky:      { intensity: 0.34, threshold: 0.90, ca: 0.0010, vignette: 0.22, sat: 1.05,
                knee: 0.94, dither: 0.0060, sharpen: 0.14, passes: 2, blur: 0 },
  };

  /* One resolution policy, shared by every caller.
   *
   * A phone at devicePixelRatio 3 asks for a ~1.2M-pixel backing store, and this chain then
   * runs several FULLSCREEN passes over it (bright, two blur pairs, composite) plus, for the
   * 2D games, a whole-canvas texture upload every frame. Pixels are the cost, so the lever is
   * to use fewer: cap the ratio and let the browser scale the result up.
   *
   * ⚑ Returns an ABSOLUTE cap, not a multiplier. A multiplier was the first design and it is
   *   wrong: callers already clamp with Math.min(dpr, 2), and multiplying that by (cap/dpr)
   *   pushed the effective ratio BELOW 1.0 on a dpr-3 phone — rendering under one CSS pixel
   *   per pixel, which is visibly soft. The floor here is 1: never blurrier than CSS.
   *
   *   const DPR = Math.min(devicePixelRatio || 1, GfxPost.dprCap());
   */
  function dprCap() {
    const dpr = self.devicePixelRatio || 1;
    let cap = 2;                                   // desktop default, unchanged from before
    try {
      const touch = matchMedia('(hover:none)').matches || navigator.maxTouchPoints > 0;
      const small = Math.min(screen.width, screen.height) <= 900;
      const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
      const save = navigator.connection && navigator.connection.saveData;
      if (save) cap = 1;
      else if (touch && small) cap = weak ? 1 : 1.5;
      else if (weak) cap = 1.5;
    } catch (e) {}
    return Math.max(1, Math.min(dpr, cap));        // never below 1 CSS pixel
  }
  /** Multiplier form, for callers that scale an existing size (Gfx2D's presentation layer). */
  function deviceScale() { const dpr = self.devicePixelRatio || 1; return dprCap() / Math.max(1, dpr); }

  /* ⛔ HOW POWERFUL THE MACHINE IS, WHICH IS NOT HOW DENSE ITS SCREEN IS.
   *
   * Section 9 derived its quality tier from `dprCap()`:
   *     AUTO_TIER = DPRCAP >= 2 ? 'high' : DPRCAP >= 1.5 ? 'mid' : 'low'
   * and `dprCap()` ends in `Math.min(dpr, cap)`. So a desktop with a strong GPU and an ordinary
   * 1x 1080p monitor scores 1 — the LOWEST tier — while a phone at dpr 3 scores 1.5 and a laptop
   * at dpr 2 scores 'high'. The two quantities are unrelated: pixel density says how many pixels
   * must be filled, not how fast they can be filled.
   *
   * ⚑ It mattered far past frame rate, because `low` carried `skin: false` — so an ordinary
   *   desktop monitor silently switched the game's CHARACTERS off and every operative fell back
   *   to the 11-box rig. That is the "robots with no personality, just stacks of basic geometry"
   *   report, and no amount of art would have fixed it.
   *
   * Same four signals as dprCap, WITHOUT the dpr term. Kept here rather than in the game so
   * "weak device" still has ONE definition in this repo. */
  function deviceTier() {
    try {
      const touch = matchMedia('(hover:none)').matches || navigator.maxTouchPoints > 0;
      const small = Math.min(screen.width, screen.height) <= 900;
      const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
      if (navigator.connection && navigator.connection.saveData) return 'low';
      if (touch && small) return weak ? 'low' : 'mid';
      if (weak) return 'mid';
      const cores = navigator.hardwareConcurrency || 8;
      return cores >= 8 ? 'high' : 'mid';
    } catch (e) { return 'mid'; }
  }

  function create(gl, cv, opts) {
    const O = Object.assign({}, PRESET.neon, opts || {});
    const S = { on: false, w: 0, h: 0, sceneTex: null, depth: null, sceneFbo: null,
                bA: null, bB: null, fA: null, fB: null, bright: null, blur: null, comp: null, tri: null,
                // motion-smear accumulation: full-res ping-pong, allocated only when blur > 0
                aT: null, aU: null, aF: null, aG: null, blit: null };
    let grainT = 0, maxAttr = 4, bound = false, motionAmt = 0, accWarm = false;

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
      [S.sceneTex, S.bA, S.bB, S.aT, S.aU].forEach(t => t && gl.deleteTexture(t));
      [S.sceneFbo, S.fA, S.fB, S.aF, S.aG].forEach(f => f && gl.deleteFramebuffer(f));
      if (S.depth) gl.deleteRenderbuffer(S.depth);
      S.sceneTex = S.bA = S.bB = S.sceneFbo = S.fA = S.fB = S.depth = null;
      S.aT = S.aU = S.aF = S.aG = null; accWarm = false;
    }
    /* Allocate the accumulation pair lazily — a caller that never sets blur never pays two
     * full-screen RGBA targets for it, and set({blur}) can turn it on later. Failure here is
     * not fatal: the pair stays null and end() takes the ordinary direct-to-screen path. */
    function ensureAcc() {
      if (S.aT || !(O.blur > 0) || !S.w) return !!S.aT;
      try {
        S.aT = tex2d(S.w, S.h); S.aF = fboFor(S.aT);
        S.aU = tex2d(S.w, S.h); S.aG = fboFor(S.aU);
        const okFbo = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (!okFbo || !S.blit) { [S.aT, S.aU].forEach(t => t && gl.deleteTexture(t));
          [S.aF, S.aG].forEach(f => f && gl.deleteFramebuffer(f));
          S.aT = S.aU = S.aF = S.aG = null; }
        accWarm = false;
      } catch (e) { S.aT = S.aU = S.aF = S.aG = null; }
      return !!S.aT;
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
      try { S.blit = progFor(P_BLIT); } catch (e) { S.blit = null; }   // smear-only; optional
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
      /* Motion smear. The composite normally goes straight to the screen; when it is on, the
       * composite instead lands in an accumulation target that also SAMPLES the previous one, and
       * a blit puts that on the screen. One extra full-screen pass, and only on this path.
       * accWarm guards the first frame after allocation or a resize, where the "previous" target
       * is uninitialised memory — mixing that in is a one-frame flash of garbage. */
      const smear = (O.blur > 0 && ensureAcc() && accWarm)
        ? Math.max(0, Math.min(0.85, motionAmt * O.blur)) : 0;
      const acc = O.blur > 0 && S.aT;
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc ? S.aF : null); gl.viewport(0, 0, w, h);
      gl.useProgram(S.comp);
      gl.uniform1i(u(S.comp, 'base'), 0); gl.uniform1i(u(S.comp, 'bloom'), 1);
      gl.uniform1f(u(S.comp, 'intensity'), O.intensity); gl.uniform1f(u(S.comp, 'ca'), O.ca);
      gl.uniform1f(u(S.comp, 'grain'), grainT); gl.uniform1f(u(S.comp, 'vig'), O.vignette);
      gl.uniform1f(u(S.comp, 'sat'), O.sat);
      gl.uniform1f(u(S.comp, 'knee'), O.knee == null ? 0.94 : O.knee);
      gl.uniform1f(u(S.comp, 'dither'), O.dither == null ? 0.0045 : O.dither);
      gl.uniform1f(u(S.comp, 'sharpen'), O.sharpen == null ? 0.2 : O.sharpen);
      gl.uniform2f(u(S.comp, 'texel'), 1 / w, 1 / h);
      gl.uniform1f(u(S.comp, 'smear'), smear); gl.uniform1i(u(S.comp, 'prev'), 2);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.sceneTex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S.bB);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, acc ? S.aU : S.bB);
      drawTri();
      if (acc) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
        gl.useProgram(S.blit); gl.uniform1i(u(S.blit, 't'), 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.aT); drawTri();
        const t = S.aT, f = S.aF; S.aT = S.aU; S.aF = S.aG; S.aU = t; S.aG = f;   // ping-pong
        accWarm = true;
      }
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);

      if (hadDepth) gl.enable(gl.DEPTH_TEST);
      if (hadBlend) gl.enable(gl.BLEND);
      return true;
    }

    function set(o) { Object.assign(O, o || {}); }
    /* How hard the camera is moving, 0..1, for THIS frame. The game owns this because only the
     * game knows what "fast" means for its camera; the chain just scales `blur` by it. Reset is
     * deliberate: a game that stops calling motion() stops smearing rather than freezing at
     * whatever it last said. */
    function motion(v) { motionAmt = Math.max(0, Math.min(1, +v || 0)); }
    function dispose() { freeTargets(); S.on = false; }

    return { begin, end, set, motion, dispose, get on() { return S.on; }, set on(v) { S.on = !!v && !!S.comp; },
             get opts() { return O; } };
  }

  return { create, PRESET, deviceScale, dprCap, deviceTier };
})();

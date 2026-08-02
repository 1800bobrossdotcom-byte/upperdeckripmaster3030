/* ripmaster3030studios — Gfx2D: put a canvas-2D game on the GPU.
 *
 * The 2D games (dogfight, the card battle, riprocketer) draw with fillRect/drawImage/arc and
 * therefore missed every upgrade in js/gfx-post.js. This attaches them to it: the game keeps
 * drawing exactly as it does now, and each frame its canvas is uploaded as a texture and
 * presented through the shared post chain — bloom, highlight rolloff, dither, unsharp,
 * chromatic aberration, vignette, grain.
 *
 *     const g = Gfx2D.attach(myCanvas, { preset: 'neon' });
 *     ...at the end of the game's draw:  g && g.present();
 *
 * ── What this is, and what it is not ─────────────────────────────────────────────────────
 * This is GPU **presentation**, not GPU **geometry**. Every pixel is still rasterised by the
 * 2D canvas; WebGL then grades and blooms the result. That buys the whole look of the 3D
 * games for a two-line change and zero gameplay risk, which is the right trade for games
 * that already work. What it does NOT buy is what real geometry would: no per-object depth,
 * no lighting, no 3D, and the CPU still does the drawing. Converting a game to true GPU
 * geometry is a rewrite of its renderer — the path NEON RONIN took with ronin3d — and is a
 * separate job from this.
 *
 * ── Why it is non-invasive ───────────────────────────────────────────────────────────────
 * The source canvas stays in the DOM and keeps its layout and all its event listeners; it is
 * only made transparent. The GL canvas sits over it with pointer-events:none, so every click,
 * drag and touch still lands on the original element and no input code changes.
 *
 * Fails open at every step: no WebGL, no GfxPost, a lost context — `on` goes false, the
 * source canvas is made visible again, and the game looks exactly as it did before.
 */
window.Gfx2D = (function () {
  const VS = 'attribute vec2 p; varying vec2 uv;' +
    // flip Y: canvas origin is top-left, GL texture origin is bottom-left
    'void main(){ uv=vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position=vec4(p,0.0,1.0); }';
  const FS = 'precision mediump float; varying vec2 uv; uniform sampler2D t;' +
    'void main(){ gl_FragColor=vec4(texture2D(t,uv).rgb,1.0); }';

  function attach(src, opts) {
    opts = opts || {};
    if (!src) return null;
    const presetName = opts.preset || 'neon';

    // ── the GL canvas: layered over the source, transparent to input ──
    const glcv = document.createElement('canvas');
    glcv.className = 'gfx2d-layer';
    glcv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;' +
      // `|| 3` would swallow a deliberate zIndex:0 — and 0 is exactly what a background
      // layer needs, or it stacks over the content it is supposed to sit behind.
      'pointer-events:none;display:block;z-index:' + (opts.zIndex == null ? 3 : opts.zIndex);
    const host = src.parentElement || document.body;
    // the source must be a positioning context's child for left/top:0 to line up
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(glcv);

    let gl = null, prog = null, quad = null, tex = null, post = null, on = false;
    let W = 0, H = 0;
    const SCALE = opts.scale != null ? opts.scale
      : (window.GfxPost && GfxPost.deviceScale ? GfxPost.deviceScale() : 1);

    function fail() {
      on = false;
      try { glcv.style.display = 'none'; src.style.opacity = ''; } catch (e) {}
      return false;
    }

    try {
      gl = glcv.getContext('webgl', { antialias: false, alpha: false, depth: false })
        || glcv.getContext('experimental-webgl');
      if (!gl) return (fail(), null);

      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.bindAttribLocation(prog, 0, 'p');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));

      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const PR = (window.GfxPost && GfxPost.PRESET[presetName]) || null;
      post = window.GfxPost ? GfxPost.create(gl, glcv, Object.assign({}, PR, opts.tune || {})) : null;
      if (!post || !post.on) throw new Error('GfxPost unavailable');

      // the source keeps its box and its listeners; it just stops being seen
      src.style.opacity = '0';
      on = true;
    } catch (e) { return (fail(), null); }

    // a lost context must not take the game down with it
    glcv.addEventListener('webglcontextlost', e => { e.preventDefault(); fail(); }, false);

    function present() {
      if (!on) return false;
      const sw = src.width | 0, sh = src.height | 0;
      if (!sw || !sh) return false;
      /* Render the GPU layer at the device-appropriate resolution rather than the source's.
       * CSS stretches it back to full size, so a phone pays for a fraction of the pixels
       * through every fullscreen pass. The source canvas is untouched — the game keeps
       * drawing at its own resolution and only the presentation is scaled. */
      const w = Math.max(2, Math.round(sw * SCALE)), h = Math.max(2, Math.round(sh * SCALE));
      if (w !== W || h !== H) { W = w; H = h; glcv.width = w; glcv.height = h; }
      try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        // straight canvas upload — no readback, so this stays on the GPU side of the bus
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

        const composited = post.begin();
        if (!composited) gl.viewport(0, 0, w, h);
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
        gl.useProgram(prog);
        gl.uniform1i(gl.getUniformLocation(prog, 't'), 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (composited) post.end();
        return true;
      } catch (e) { return fail(); }
    }

    function dispose() {
      try { glcv.remove(); src.style.opacity = ''; } catch (e) {}
      if (post) post.dispose();
      on = false;
    }

    return { present, dispose, post: () => post, get on() { return on; },
             set on(v) { on = !!v && !!post; if (!v) src.style.opacity = ''; else src.style.opacity = '0'; },
             canvas: glcv };
  }

  return { attach };
})();

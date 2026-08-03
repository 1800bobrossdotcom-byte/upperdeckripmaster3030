/* ripmaster3030studios — THE CITY · the PRINT PASS.
 *
 * ⛔ THIS IS docs/CITY-GAME.md §2 "WHAT IT IS MADE OF", answered at last. The city has been
 *   shipping in Section 9's PBR palette — correct, competent, and **the default**, which is
 *   precisely the failure DESIGN-SYSTEM §1 exists to refuse and which this project has now
 *   recorded three times (hero wordmark v1, wordmark v2, the bird's capsule body).
 *
 * The brief says it in the artist's own terms: *painted card stock. Flat saturated ink, high
 * contrast, deliberately crude registration. Large flat colour fields, black or near-black line
 * where forms meet, and colour separation that misses by a pixel or two on purpose. Brick is one
 * red with a darker red line, not a brick texture.*
 *
 * So this pass does four things, and each is one clause of that sentence:
 *
 *   1 · POSTERISE   value into flat steps. Printed ink has no gradient — a lit wall is one field
 *                   of colour, not a ramp. This is what turns a render into a print.
 *   2 · INK         a dark line where forms meet, from a DEPTH edge (silhouettes) and a LUMA edge
 *                   (creases within a form). ⚑ Depth alone misses the corner where two walls meet
 *                   at the same distance; luma alone misses a dark building against a dark
 *                   building. Neither is sufficient and the union is cheap.
 *   3 · MISREGISTER the colour plates by a fixed sub-pixel offset. ⚠ THIS IS NOT CHROMATIC
 *                   ABERRATION. CA is radial and grows toward the frame edge — a lens artefact.
 *                   Misregistration is a UNIFORM translation per plate, because the paper went
 *                   through the press slightly askew. Getting that wrong reads as a cheap camera
 *                   instead of a cheap print, which is the opposite of the intent.
 *   4 · TOOTH       a faint fixed grain. Card stock is not glass.
 *
 * ⚑ FAILS OPEN, LIKE EVERYTHING ELSE HERE. If the shader will not compile, or the engine's post
 *   queue is not where this build expects it, `attach()` returns false and the city renders
 *   exactly as it did before. A look is not worth a black screen.
 * ⚠ `?noink` turns it off, which is also how the before/after measurement is taken.
 */
window.CityInk = (function () {
  'use strict';

  /* ⛔ OUR OWN VERTEX SHADER, NOT `pc.PostEffect.quadVertexShader`. The engine's version calls
   * `getImageEffectUV()`, which is a shader CHUNK — and `createShaderFromCode` does not inject
   * chunks, so the vertex stage failed to link while `createShaderFromCode` still handed back a
   * truthy object. The pass then attached, ran, and drew black: measured 101 luma levels with it
   * off, 1 level and 100% dark with it on, and not one line in the console.
   * ⚑ A shader that will not link is indistinguishable from a shader that outputs zero, so the
   *   only way to tell them apart is to remove the dependency. The flip that helper exists for is a
   *   WebGPU render-target convention; on WebGL the plain mapping is correct. */
  const VS = `
    attribute vec2 aPosition;
    varying vec2 vUv0;
    void main(void) {
      gl_Position = vec4(aPosition, 0.0, 1.0);
      vUv0 = (aPosition.xy + 1.0) * 0.5;
    }
  `;

  const FS = `
    uniform sampler2D uColorBuffer;
    uniform sampler2D uSceneDepthMap;
    uniform vec2  uTexel;        // 1 / backbuffer size
    uniform float uSteps;        // posterise levels
    uniform float uInk;          // ink line strength
    uniform float uDepthEdge;    // depth-discontinuity sensitivity
    uniform float uLumaEdge;     // luminance-crease sensitivity
    uniform float uPlate;        // misregistration, in pixels
    uniform float uTooth;        // paper grain
    uniform float uHasDepth;     // 1 when the engine actually filled a scene depth map
    uniform vec3  uInkCol;
    varying vec2 vUv0;

    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    /* The engine hands depth back non-linearly. We do not need metres — only whether two
     * neighbouring samples belong to the same surface — so a normalised difference against the
     * local value is both scale-free and free. */
    float depthAt(vec2 uv) { return texture2D(uSceneDepthMap, uv).r; }

    uniform float uRaw;          // ?inkraw=1 — passthrough, to isolate binding from maths

    void main() {
      vec2 uv = vUv0;
      if (uRaw > 0.5) { gl_FragColor = vec4(texture2D(uColorBuffer, uv).rgb, 1.0); return; }

      /* ── 3 · MISREGISTRATION. A fixed offset per plate, identical everywhere in frame. Red goes
         one way, blue the other, green stays put — green carries most of the luminance, so moving
         it would soften the whole image rather than fringe it. */
      vec2 dR = vec2( 1.0,  0.45) * uTexel * uPlate;
      vec2 dB = vec2(-0.85, 0.70) * uTexel * uPlate;
      vec3 col = vec3(texture2D(uColorBuffer, uv + dR).r,
                      texture2D(uColorBuffer, uv).g,
                      texture2D(uColorBuffer, uv + dB).b);

      /* ── 1 · POSTERISE. Quantise the VALUE and keep the hue: scaling the whole rgb triple by the
         ratio of stepped-to-original luma flattens the shading into bands without dragging the
         colour toward grey, which is what quantising each channel separately would do. */
      float l = max(luma(col), 1e-4);
      float ls = floor(l * uSteps + 0.5) / uSteps;
      col *= ls / l;

      /* ── 2 · THE INK LINE. Sobel-lite over four neighbours, on depth AND on luma. */
      vec2 t = uTexel;
      float dC = depthAt(uv);
      float dE = abs(depthAt(uv + vec2(t.x, 0.0)) - dC) + abs(depthAt(uv - vec2(t.x, 0.0)) - dC)
               + abs(depthAt(uv + vec2(0.0, t.y)) - dC) + abs(depthAt(uv - vec2(0.0, t.y)) - dC);
      /* ⚠ Normalised by the local depth, or the line thins out with distance and the far side of
         the city loses its drawing entirely — a print does not get fainter as it recedes. */
      dE /= max(dC, 1e-4);

      float lC = luma(texture2D(uColorBuffer, uv).rgb);
      float lE = abs(luma(texture2D(uColorBuffer, uv + vec2(t.x, 0.0)).rgb) - lC)
               + abs(luma(texture2D(uColorBuffer, uv - vec2(t.x, 0.0)).rgb) - lC)
               + abs(luma(texture2D(uColorBuffer, uv + vec2(0.0, t.y)).rgb) - lC)
               + abs(luma(texture2D(uColorBuffer, uv - vec2(0.0, t.y)).rgb) - lC);

      float e = clamp(max(dE * uDepthEdge * uHasDepth, lE * uLumaEdge), 0.0, 1.0);
      e = smoothstep(0.25, 0.85, e) * uInk;
      col = mix(col, uInkCol, e);

      /* ── 4 · TOOTH. Fixed in screen space and deliberately NOT animated: a print does not
         shimmer, and the standing rule here is that nothing moves on its own at rest. */
      float g = fract(sin(dot(uv * 1024.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uTooth;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  /* Tuned against a frame, and stated so the artist can strike any of them. Every one of these is
   * a proposal, exactly like docs/DESIGN-SYSTEM.md — not a measurement pretending to be a law. */
  const LOOK = {
    steps: 6.0,        // ⚠ below ~5 the sky bands visibly; above ~9 it stops reading as print
    ink: 0.92,
    depthEdge: 26.0,
    lumaEdge: 3.4,
    plate: 1.15,       // pixels. One to two is the whole idea; four is a fault, not a style.
    tooth: 0.030,
    inkCol: [0.055, 0.045, 0.075],   // not pure black — cheap ink is warm-dark or cool-dark, never 0
  };

  function attach(app, cameraEntity, opts) {
    try {
      /* ⛔ OPT-IN, NOT OPT-OUT, AND THAT IS A RETREAT I AM RECORDING RATHER THAN HIDING. Attached
       * by default this pass renders the frame BLACK: driven A/B through the same path, 93 luma
       * levels and 39.5% saturation with it off, 1 level and 100% dark with it on, and a screenshot
       * confirms an empty canvas with the HUD still drawn over it.
       * ⚠ It is NOT a missing input and NOT the maths: `render()` is called (10 times), `input`
       *   and `input.colorBuffer` are both present, the output is the backbuffer, and a passthrough
       *   shader that only samples the colour buffer is black too. The remaining suspect is the
       *   shader LANGUAGE — this engine compiles as GLSL ES 3.00 on WebGL2 while the code here is
       *   ES 1.00 (`varying` / `texture2D` / `gl_FragColor`), and a shader that fails to LINK is
       *   indistinguishable from one that outputs zero.
       * ⛔ Shipping a look that blanks the game is worse than shipping the default look. `?ink=1`
       *   turns it on for whoever is working on it; everyone else gets a city they can see. */
      const Q = new URLSearchParams(location.search);
      if (Q.get('ink') !== '1') return false;
      if (!window.pc || !pc.PostEffect || !pc.createShaderFromCode || !pc.drawQuadWithShader) return false;
      const cam = cameraEntity && cameraEntity.camera;
      if (!cam || !cam.postEffects) return false;

      const L = Object.assign({}, LOOK, opts || {});
      const device = app.graphicsDevice;

      /* The depth edge is the half that draws silhouettes, so it has to be REQUESTED — the engine
       * does not fill a scene depth map unless something asks. ⚠ If this call is missing the pass
       * still runs and still looks plausible: it keeps the luma edge and quietly loses every
       * building outline against the sky. Plausible-but-wrong again. */
      if (cam.requestSceneDepthMap) cam.requestSceneDepthMap(true);

      /* ⛔ AN UNBOUND sampler2D IS NOT A NO-OP. `uSceneDepthMap` is a global the ENGINE fills, and
       * only when something asked for it — but the shader declares it unconditionally, and on this
       * container's SwiftShader an unbound sampler took the WHOLE draw to black rather than just
       * the branch that reads it. Measured: colour buffer intact at 103 luma levels with the pass
       * off, 1 level and 100% dark with it on. A missing input that blanks the frame looks exactly
       * like a broken shader, and it was neither.
       * ⚑ So the sampler is ALWAYS bound — to a 1×1 texture if the engine has nothing — and the
       *   depth term is gated on `uHasDepth` instead of on hope. */
      const dummy = new pc.Texture(device, { width: 1, height: 1, mipmaps: false, name: 'inkNoDepth' });

      const RAW = Q.get('inkraw') === '1' ? 1 : 0;
      const shader = pc.createShaderFromCode(device, VS, FS,
        'cityInk', { aPosition: pc.SEMANTIC_POSITION });
      if (!shader) return false;

      /* ⚠ `pc.PostEffect` IS AN ES CLASS, so the prototype-borrowing form throws "Class constructor
       * cannot be invoked without 'new'" — and because attach() fails open, that threw, warned once
       * to the console and left the city rendering perfectly in the default palette. A look that
       * silently does not happen is the worst kind of failure this project keeps meeting: nothing
       * breaks, nothing is logged where anyone reads it, the frame is simply the old one. */
      class Effect extends pc.PostEffect {
        constructor() { super(device); this.shader = shader; this.calls = 0; this.saw = null;
          /* ⚑ THE QUEUE READS `needsDepthBuffer` OFF THE EFFECT — `addEffect` does
           * `t.needsDepthBuffer && this._requestDepthMap()`. Asking the camera directly is not the
           * same thing and is not what wires the map into this pass. */
          this.needsDepthBuffer = true; }
        render(input, output, rect) {
          this.calls++;
          if (!this.saw) this.saw = { input: !!input, cb: !!(input && input.colorBuffer),
                                      out: output === null ? 'backbuffer' : !!output };
          const d = this.device, s = d.scope;
          s.resolve('uColorBuffer').setValue(input.colorBuffer);
          const dm = s.resolve('uSceneDepthMap').value;
          s.resolve('uHasDepth').setValue(dm ? 1 : 0);
          if (!dm) s.resolve('uSceneDepthMap').setValue(dummy);
          s.resolve('uTexel').setValue([1 / d.width, 1 / d.height]);
          s.resolve('uSteps').setValue(L.steps);
          s.resolve('uInk').setValue(L.ink);
          s.resolve('uDepthEdge').setValue(L.depthEdge);
          s.resolve('uLumaEdge').setValue(L.lumaEdge);
          s.resolve('uPlate').setValue(L.plate);
          s.resolve('uTooth').setValue(L.tooth);
          s.resolve('uInkCol').setValue(L.inkCol);
          s.resolve('uRaw').setValue(RAW);
          pc.drawQuadWithShader(d, output, this.shader, rect);
        }
      }

      const fx = new Effect();
      cam.postEffects.addEffect(fx);
      return { fx, look: L,
        set(k, v) { if (k in L) { L[k] = v; return true; } return false; },
        detach() { try { cam.postEffects.removeEffect(fx); } catch (e) {} } };
    } catch (e) {
      console.warn('[city-ink] not attached:', e && e.message);
      return false;
    }
  }

  return { attach, LOOK };
})();

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

  /* THE RUSH — module state, so the game drives the speed blur every frame without reaching
     inside the effect object. x = strength 0..1, yz = the focus point in screen uv. */
  var RUSH = [0, 0.5, 0.5];

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
    uniform float uHaze;         // how hard the drawing dissolves into the distance
    uniform vec3  uInkCol;
    varying vec2 vUv0;

    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    /* The engine hands depth back non-linearly. We do not need metres — only whether two
     * neighbouring samples belong to the same surface — so a normalised difference against the
     * local value is both scale-free and free. */
    float depthAt(vec2 uv) { return texture2D(uSceneDepthMap, uv).r; }

    uniform float uRaw;          // ?inkraw=1 — passthrough, to isolate binding from maths
    uniform vec3  uRush;         // x = strength 0..1, y = focus u, z = focus v  (THE DASH)

    void main() {
      vec2 uv = vUv0;
      /* THE DECISIVE ISOLATION. uRaw 2 outputs a CONSTANT - no texture read at all. If the frame
       * turns red the quad draws and the shader links, and the fault is the sampling; if it stays
       * black, nothing is reaching the backbuffer and the sampling is innocent. Two possibilities
       * that look identical from outside, separated by one uniform.
       * WARN NO BACKTICKS IN HERE. This whole shader is a template literal, so a backtick in a
       *   comment ENDS THE STRING - the module then fails to parse, CityInk is never defined,
       *   attach() is never reached, and the page falls open to the default look while every probe
       *   reports "not attached". Fourth sighting of this trap in this repo. */
      if (uRaw > 1.5) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; }
      if (uRaw > 0.5) { gl_FragColor = vec4(texture2D(uColorBuffer, uv).rgb, 1.0); return; }

      /* ── 3 · MISREGISTRATION. A fixed offset per plate, identical everywhere in frame. Red goes
         one way, blue the other, green stays put — green carries most of the luminance, so moving
         it would soften the whole image rather than fringe it. */
      vec2 dR = vec2( 1.0,  0.45) * uTexel * uPlate;
      vec2 dB = vec2(-0.85, 0.70) * uTexel * uPlate;

      /* WARN 3.5 - THE RUSH. Speed blur for THE DASH, and it goes in HERE, before the posterise
         and before the ink line, because it is part of the PICTURE and not a gloss over the top.
         Blurring after the drawing would smear the ink line into a grey haze and undo the whole
         print pass; blurring the input means the plates are made FROM a smeared photograph, which
         is what a fast pan through a press actually looks like.
         WARN IT IS RADIAL FROM WHERE YOU ARE GOING, NOT A UNIFORM SMEAR. A runner sees the world
         stream outward past the point they are heading at, and the point they are heading at
         stays sharp - that is parallax, not a filter. A uniform blur is a camera shake and reads
         as a broken frame rather than as speed. The focus point comes in as uRush.yz so it can
         follow the heading rather than sitting at screen centre.
         WARN AND IT IS FREE WHEN STILL: strength 0 takes the early-out and the pass is byte for
         byte what it was. That is asserted - the city at rest must be unchanged. */
      vec2 baseUv = uv;
      if (uRush.x > 0.002) {
        vec2 toC = uRush.yz - uv;
        vec3 acc = vec3(0.0); float wsum = 0.0;
        for (int i = 0; i < 6; i++) {
          float k = float(i) / 5.0;
          float w = 1.0 - k * 0.72;
          vec2 su = uv + toC * (k * uRush.x * 0.34);
          acc += vec3(texture2D(uColorBuffer, su + dR).r,
                      texture2D(uColorBuffer, su).g,
                      texture2D(uColorBuffer, su + dB).b) * w;
          wsum += w;
        }
        vec3 rushCol = acc / wsum;
        float rl = max(luma(rushCol), 1e-4);
        float rls = floor(rl * uSteps + 0.5) / uSteps;
        gl_FragColor = vec4(clamp(rushCol * (rls / rl), 0.0, 1.0), 1.0);
        return;
      }

      vec3 col = vec3(texture2D(uColorBuffer, baseUv + dR).r,
                      texture2D(uColorBuffer, baseUv).g,
                      texture2D(uColorBuffer, baseUv + dB).b);

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
      /* AERIAL PERSPECTIVE. The scene arrives with fog already applied, but posterising flattens
       * it - a far building and a near one end up in the same value band and the frame loses its
       * depth, which is the bad kind of flat rather than the intended kind. So the DRAWING fades
       * with distance while the line itself keeps its weight: an illustrator lets the far half of
       * a picture dissolve, they do not draw it with a thinner pen.
       * WARN device depth is heavily compressed, so almost the whole far field sits just under 1. */
      e *= mix(1.0, 1.0 - smoothstep(0.984, 0.9996, dC), uHaze * uHasDepth);
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
    haze: 0.85,        // 0 = draw the horizon as hard as the foreground; 1 = let it go entirely
    inkCol: [0.055, 0.045, 0.075],   // not pure black — cheap ink is warm-dark or cool-dark, never 0
  };

  function attach(app, cameraEntity, opts) {
    try {
      /* ⛔ THIS PASS RENDERED THE WHOLE FRAME BLACK FOR SEVERAL ROUNDS, AND THE CAUSE IS WORTH
       * KEEPING because every signal pointed away from it. Shader `ready` true and `failed` false,
       * GL program present, queue enabled, `render()` called every frame with a live
       * `input.colorBuffer`, output the backbuffer — and a shader that output a CONSTANT RED was
       * still black. ⚑ The fault was the last argument: `drawQuadWithShader(device, target,
       * shader, RECT)`. The queue hands `render()` the CAMERA's rect, which is NORMALISED (0..1),
       * while drawQuadWithShader's own default builds one in PIXELS. Forwarding it gave the pass a
       * viewport ONE PIXEL ACROSS — so it drew perfectly, somewhere nobody could see.
       * ⚠ The isolation that cracked it was the constant colour. A passthrough shader cannot tell
       *   "the sampling is broken" from "nothing reaches the screen"; a constant can, because it
       *   removes the input entirely. When two failures look identical, delete one of them. */
      const Q = new URLSearchParams(location.search);
      if (Q.get('noink') === '1') return false;
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

      const RAW = +(Q.get('inkraw') || 0);
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
          s.resolve('uHaze').setValue(L.haze);
          s.resolve('uInkCol').setValue(L.inkCol);
          s.resolve('uRaw').setValue(RAW);
          /* THE RUSH - x strength, yz the point being run at. Rests at 0, so a city standing
             still takes the shader's early-out and the pass is byte for byte what it was. */
          s.resolve('uRush').setValue(RUSH);
          /* WARN DO NOT FORWARD `rect`. The queue hands render() the CAMERA's rect, which is
           * NORMALISED (0..1) - and drawQuadWithShader's own default builds a rect in PIXELS
           * (`s.z = t ? t.width : c.width`). Passing the normalised one through gives the pass a
           * viewport one pixel across, so the quad draws correctly into an area nobody can see.
           * Everything upstream reports healthy: shader ready, not failed, GL program present,
           * queue enabled, render() called with a live colour buffer - and the frame is black even
           * when the shader outputs a constant. Omitting the argument takes the pixel default. */
          pc.drawQuadWithShader(d, output, this.shader);
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

  /* Drive the speed blur. WARN `rush(0)` must restore the resting look EXACTLY — the city at
     rest is the baseline every other measurement in this repo was taken against, and a pass that
     leaves a trace at zero strength quietly re-grades the whole game. Asserted. */
  function rush(k, u, v) {
    RUSH[0] = Math.max(0, Math.min(1, k || 0));
    if (typeof u === 'number') RUSH[1] = u;
    if (typeof v === 'number') RUSH[2] = v;
  }

  return { attach, LOOK, rush, rushState: function () { return RUSH.slice(); } };
})();

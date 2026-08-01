/* upperdeckripmaster3030 — ONE dynamic 3D card, shared by every page that shows one.
 *
 *   Card3D.engine(base)            -> Promise<pc>      load the shared engine once
 *   Card3D.build({canvas, box, …}) -> ctrl | null      build a lit 3D card into that canvas
 *   ctrl.setArt(url)                                   the flat card — one plate, unchanged
 *   ctrl.setLayers(spec | null)                        a LAYERED card (js/card-layers.js)
 *   ctrl.setState(drivers | null)                      drive the look from the live market
 *
 * WHY A MODULE. This started life inside cards/lens3d.html. The moment the binder folder wanted
 * the same card in its pop-out viewer there were two copies, and the copy that mattered was the
 * one carrying the COLOUR MANAGEMENT fix — the sRGB tagging and the emissive-art decision that
 * took two passes to find. A second copy of that is a second chance to lose it. One file.
 *
 * FAILS OPEN, everywhere. No WebGL2, no engine, a blocked request, a texture that never
 * decodes — `build` returns null or the card simply renders flatter, and the calling page keeps
 * whatever CSS card it was already showing. A collector never sees a broken frame.
 *
 * ── LAYERS AND LIVE STATE, added together on purpose ────────────────────────────────────────
 * `setLayers` stacks authored plates through the card's thickness; `setState` lets the $3030
 * market move the card. They arrived in the same pass because they are the two halves of the
 * same sentence — a lens has depth, and a lens is over something.
 *
 * ⚑ THE FLAT PATH IS UNTOUCHED, AND THAT IS LOAD-BEARING. Every card in the repo today is flat
 *   (196 placeholders + the hero scans), so `setLayers(null)` / never calling it must render the
 *   card that shipped, and `setState` at rest must too: its neutral dial values were CHOSEN so
 *   the arithmetic lands back on exactly today's constants — key 1.5, rim 2.4, parallax ×1.0,
 *   one foil band. A "live" card that looks different when the network is blocked is a card
 *   whose baseline nobody can trust.
 * ⚑ AND THE COLOUR PATH IS UNTOUCHED. Layers are lit the same way the single plate is: emissive
 *   at full strength, `useSkybox:false`, metalness 0. The market drives LIGHT and MOTION — the
 *   key, the rim, the parallax gain, the foil — and never the artwork's own values, because the
 *   colour pipeline here is measured, explained, and not to be re-graded by a price.
 */
(function (global) {
  'use strict';

  var RARITY = {
    common: '#9fb2c4', uncommon: '#2bff80', rare: '#27f7e4', epic: '#b070ff',
    legendary: '#ffd23b', mythic: '#ff2ad9', prizm: '#27f7e4', marquee: '#c7d0ff'
  };

  /* The engine is 2.26 MB raw / ~598 KB gzipped and it is the same file for every card on the
   * page, so it loads exactly once no matter how many cards ask. */
  var _engine = null;
  function engine(base) {
    if (global.pc) return Promise.resolve(global.pc);
    if (_engine) return _engine;
    _engine = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = new URL((base || '') + 'vendor/playcanvas/playcanvas.min.js', location.href).href;
      s.onload = function () { global.pc ? res(global.pc) : rej(new Error('engine loaded but no pc')); };
      s.onerror = function () { rej(new Error('engine blocked')); };
      document.head.appendChild(s);
    });
    return _engine;
  }

  /* ── the relief map ───────────────────────────────────────────────────────────────────────
   * A flat PNG on a tilting plane is still flat. Sobel the artwork's own luminance into a
   * tangent-space normal and the ink sits proud: the key light travels across the drawing as the
   * card turns, which is what the eye reads as an object rather than a picture.
   *
   * ⚑ LOW-PASS BEFORE THE GRADIENT, and this is the whole lesson from card 35. Built off raw
   *   luminance it embosses every INK STROKE, so on detailed line art the relief competes with
   *   the drawing and wins — the card turns into hammered pewter. Auto-calibrating the gain did
   *   not fix it, because the problem was never the amount; it was the FREQUENCY. Blurring first
   *   keeps only the big forms — a face, a hat, a torso — so the card gains the gentle relief of
   *   thick ink on stock while the drawing stays legible.
   * ⚑ SELF-CALIBRATE the gain, because one fixed strength cannot serve both a soft painterly
   *   card and one full of fine line work. Measure the image's own mean gradient, then set the
   *   gain so every card lands at the same relief. `strength` is a target, not a multiplier. */
  function normalFromImage(pc, device, img, strength) {
    var W = 512, H = Math.round(W * img.height / img.width) || 512;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
    var d = x.getImageData(0, 0, W, H).data;
    var lum = new Float32Array(W * H);
    for (var i = 0, p = 0; i < d.length; i += 4, p++)
      lum[p] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;

    function blur(src, radius) {                       // separable box, twice ≈ gaussian at this size
      var tmp = new Float32Array(W * H), out = new Float32Array(W * H);
      function run(from, to, horiz) {
        for (var y = 0; y < H; y++) for (var x2 = 0; x2 < W; x2++) {
          var a = 0, n = 0;
          for (var k = -radius; k <= radius; k++) {
            var xx = horiz ? Math.min(W - 1, Math.max(0, x2 + k)) : x2;
            var yy = horiz ? y : Math.min(H - 1, Math.max(0, y + k));
            a += from[yy * W + xx]; n++;
          }
          to[y * W + x2] = a / n;
        }
      }
      run(src, tmp, true); run(tmp, out, false);
      return out;
    }
    lum = blur(blur(lum, 4), 4);

    var out = x.createImageData(W, H), o = out.data;
    function at(px, py) { return lum[Math.min(H - 1, Math.max(0, py)) * W + Math.min(W - 1, Math.max(0, px))]; }
    function sob(px, y) {
      return [(at(px + 1, y - 1) + 2 * at(px + 1, y) + at(px + 1, y + 1)) - (at(px - 1, y - 1) + 2 * at(px - 1, y) + at(px - 1, y + 1)),
              (at(px - 1, y + 1) + 2 * at(px, y + 1) + at(px + 1, y + 1)) - (at(px - 1, y - 1) + 2 * at(px, y - 1) + at(px + 1, y - 1))];
    }
    var acc = 0, n2 = 0;
    for (var y1 = 1; y1 < H - 1; y1 += 3) for (var px1 = 1; px1 < W - 1; px1 += 3) {
      var g = sob(px1, y1); acc += Math.hypot(g[0], g[1]); n2++;
    }
    var gain = Math.min(9, (strength || 1) * 0.10 / ((acc / Math.max(1, n2)) || 0.001));
    for (var y = 0; y < H; y++) for (var px = 0; px < W; px++) {
      var gg = sob(px, y);
      var grain = (Math.sin(px * 12.9898 + y * 78.233) * 43758.5453 % 1) * 0.035;   // paper tooth, deterministic
      var nx = -gg[0] * gain + grain, ny = -gg[1] * gain + grain, L = Math.hypot(nx, ny, 1) || 1;
      var k2 = (y * W + px) * 4;
      o[k2] = (nx / L * 0.5 + 0.5) * 255; o[k2 + 1] = (ny / L * 0.5 + 0.5) * 255;
      o[k2 + 2] = (1 / L * 0.5 + 0.5) * 255; o[k2 + 3] = 255;
    }
    x.putImageData(out, 0, 0);
    var t = new pc.Texture(device, { mipmaps: true });
    t.setSource(c); return t;
  }

  /* ── environment lighting ────────────────────────────────────────────────────────────────
   * `models/env/<name>.png` is an equirectangular RGBM encoding of a CC0 Poly Haven capture
   * (scripts/build-pcenv.mjs; provenance in the sidecar .json). RGBM keeps real dynamic range in
   * an ordinary 8-bit PNG, so a sky can be thousands of times brighter than the ground instead
   * of clipping to white. It is what gives the raised metal bevel something to REFLECT — a
   * metal edge with no environment is just a grey edge, which is how the first pass looked.
   * Entirely optional: any failure leaves the card lit by its own key and rim. */
  function loadEnv(pc, app, url) {
    return new Promise(function (res, rej) {
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var t = new pc.Texture(app.graphicsDevice, {
            name: 'cardenv', width: img.width, height: img.height,
            format: pc.PIXELFORMAT_RGBA8, type: pc.TEXTURETYPE_RGBM,
            projection: pc.TEXTUREPROJECTION_EQUIRECT, mipmaps: false,
            addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
            minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR
          });
          t.setSource(img);
          var src = pc.EnvLighting.generateLightingSource(t, { size: 128 });
          res(pc.EnvLighting.generateAtlas(src, { size: 256 }));
        } catch (e) { rej(e); }
      };
      img.onerror = function () { rej(new Error('env ' + url)); };
      img.src = url;
    });
  }

  /**
   * @param {object} o
   *   canvas  — a <canvas> already in the DOM and sized by CSS
   *   box     — the element whose box the canvas fills (for resize); defaults to canvas.parentNode
   *   env     — URL of an RGBM equirect PNG, or null for key+rim only
   *   tilt    — () => ({x,y}) in −1..1, read every frame
   * @returns ctrl | null
   */
  function build(o) {
    var pc = global.pc;
    if (!pc || !o || !o.canvas) return null;
    var canvas = o.canvas, box = o.box || canvas.parentNode;
    var app;
    try { app = new pc.Application(canvas, { graphicsDeviceOptions: { alpha: true, antialias: true } }); }
    catch (e) { return null; }
    if (!app.graphicsDevice) return null;

    /* ⚑ COLOUR MANAGEMENT — this was the bug behind "diminished in colour with flatness".
     * Card art is sRGB data. Uploaded without saying so, the engine treats the bytes as LINEAR,
     * which lifts the mid-tones, crushes contrast and desaturates everything: precisely the
     * washed-grey look. Declaring the swap chain sRGB and tagging the textures fixes it at
     * source; no amount of saturation-pushing afterwards would have, because the transfer
     * function was wrong rather than the values.
     * Tonemapping stays NONE on purpose: these are finished artworks, not HDR renders — ACES
     * would re-grade the artist's own colour. */
    if ('gammaCorrection' in app.scene) app.scene.gammaCorrection = pc.GAMMA_SRGB;
    if ('toneMapping' in app.scene) app.scene.toneMapping = pc.TONEMAP_NONE;
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);

    /* ⚑ SIZE IT WHEN IT HAS A SIZE, not once and hope. If the card is built while its box is
     * still laying out — mid-animation, or a frame before the viewer finishes opening — the box
     * measures 0×0, the old code returned early and nothing ever asked again except a window
     * resize. The card then renders into a zero canvas and reads as "not showing correctly".
     * So: retry on animation frames until it measures, and watch the box afterwards. */
    var sized = false;
    function fit() {
      var r = box.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      app.graphicsDevice.maxPixelRatio = Math.min(global.devicePixelRatio || 1,
        (global.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2);
      app.resizeCanvas(r.width, r.height);
      sized = true; return true;
    }
    if (!fit()) {
      var tries = 0;
      (function retry() { if (sized || tries++ > 120) return; if (!fit()) requestAnimationFrame(retry); })();
    }
    var onResize = function () { fit(); };
    addEventListener('resize', onResize);
    var ro = null;
    if (global.ResizeObserver) { try { ro = new ResizeObserver(function () { fit(); }); ro.observe(box); } catch (e) { ro = null; } }

    var cam = new pc.Entity('cam');
    cam.addComponent('camera', { clearColor: new pc.Color(0, 0, 0, 0), fov: 28 });
    cam.setPosition(0, 0, 3.4); app.root.addChild(cam);

    var key = new pc.Entity('key');
    key.addComponent('light', {
      type: 'directional', color: new pc.Color(1, .96, .9), intensity: 1.5,
      castShadows: true, shadowBias: 0.2, shadowResolution: 1024
    });
    key.setEulerAngles(52, 158, 0); app.root.addChild(key);   // raking, so the relief has something to catch
    var rim = new pc.Entity('rim');
    rim.addComponent('light', { type: 'omni', color: new pc.Color(.25, .9, 1), intensity: 2.4, range: 9 });
    rim.setPosition(-1.8, 1.2, 1.6); app.root.addChild(rim);
    /* ambient stays low even with an env atlas: the atlas supplies real directional fill, and a
     * flat ambient on top of it is just a wash — the same wash we spent a pass removing. */
    app.scene.ambientLight = new pc.Color(0.05, 0.05, 0.07);

    var root = new pc.Entity('card'); app.root.addChild(root);
    var W = 1.0, H = 1.5;
    function mkMat(props) { var m = new pc.StandardMaterial(); Object.assign(m, props); m.update(); return m; }

    var body = new pc.Entity('body');
    body.addComponent('render', { type: 'box', castShadows: true, receiveShadows: true });
    body.setLocalScale(W * 1.02, H * 1.02, 0.035);
    body.render.material = mkMat({ diffuse: new pc.Color(.06, .06, .08), metalness: .35, gloss: .34, useMetalness: true });
    root.addChild(body);

    function plate(z, sx, sy) {
      var e = new pc.Entity();
      e.addComponent('render', { type: 'plane', castShadows: false, receiveShadows: true });
      e.setLocalEulerAngles(90, 0, 0); e.setLocalScale(sx, 1, sy); e.setLocalPosition(0, 0, z);
      root.addChild(e); return e;
    }
    /* raised bevel — four thin boxes standing proud of the face. A drawn border is a picture of
     * an edge; this one occludes, shadows, and with the env atlas actually reflects. */
    function bev(x0, y0, sx, sy) {
      var e = new pc.Entity();
      e.addComponent('render', { type: 'box', castShadows: true, receiveShadows: true });
      e.setLocalScale(sx, sy, 0.030); e.setLocalPosition(x0, y0, 0.038);
      e.render.material = mkMat({ diffuse: new pc.Color(.14, .14, .17), metalness: .85, gloss: .62, useMetalness: true });
      root.addChild(e); return e;
    }
    var bw = 0.035, iw = W * 0.955, ih = H * 0.955;
    bev(0, ih / 2, iw + bw, bw); bev(0, -ih / 2, iw + bw, bw);
    bev(-iw / 2, 0, bw, ih + bw); bev(iw / 2, 0, bw, ih + bw);

    var back = plate(0.019, W * 0.99, H * 0.99);
    var art  = plate(0.030, W * 0.90, H * 0.90);
    var fx   = plate(0.045, W * 0.99, H * 0.99);

    /* @param o.linear  do NOT tag as sRGB. Colour art is sRGB data; a NORMAL MAP is not — its
     *                  bytes are a vector, and pushing them through a transfer function bends
     *                  the surface. Same function, two jobs, one flag.
     * @param o.repeat  wrap instead of clamp (the travelling foil band needs it). */
    function texFor(url, cb, o) {
      o = o || {};
      var wrap = o.repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE;
      var opts = { mipmaps: true, addressU: wrap, addressV: wrap };
      if (!o.linear && pc.PIXELFORMAT_SRGBA8 !== undefined) opts.format = pc.PIXELFORMAT_SRGBA8;
      var t;
      try { t = new pc.Texture(app.graphicsDevice, opts); }
      catch (e) { t = new pc.Texture(app.graphicsDevice, { mipmaps: true }); }
      if (!o.linear && 'srgb' in t) t.srgb = true;
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () { t.setSource(img); cb(t, img); };
      img.onerror = function () { if (o.onerror) o.onerror(); };
      img.src = url;
    }

    var artUrl = null;
    function setArt(url) {
      if (!url || url === artUrl) return; artUrl = url;
      texFor(url, function (t, img) {
        var nrm = null;
        try { nrm = normalFromImage(pc, app.graphicsDevice, img, 1.0); } catch (e) { nrm = null; }
        /* The art is lit by an EMISSIVE map at full strength rather than a diffuse map under
         * lights. That sounds odd for a 3D object and it is the right call: a finished artwork
         * should reach the viewer the way the artist left it, not re-graded by whatever key
         * light is in the scene. Relief comes from the normal map; the COLOUR is untouched.
         * metalness 0 too: a metalness workflow tints diffuse toward the base colour and was
         * quietly desaturating the art.
         *
         * ⚑ `useSkybox:false` IS THE WASH FIX, SECOND EDITION. Adding an environment map gave
         *   the metal bevel something real to reflect — which was the whole point — but a
         *   StandardMaterial samples that environment for AMBIENT SPECULAR too, and on the art
         *   plate that lands as a broad milky sheen across the entire face. Measured against the
         *   flat artwork it lifted the blacks and pulled the saturation down: the same
         *   "diminished in colour with flatness" the CSS `.glare` caused the first time, from a
         *   completely different direction.
         *   So the environment is scoped: metal reflects it, the ARTWORK never does. The
         *   travelling highlight that sells the relief comes from the KEY LIGHT, which is
         *   directional and moves as the card turns — a flat ambient sheen never did that job
         *   anyway, it just sat there greying the picture. */
        art.render.material = mkMat({
          emissiveMap: t, emissive: new pc.Color(1, 1, 1), diffuse: new pc.Color(0, 0, 0),
          normalMap: nrm, bumpiness: .42, gloss: .62, metalness: 0, useMetalness: false,
          specular: new pc.Color(.05, .05, .05), useSkybox: false
        });
        back.render.material = mkMat({
          diffuseMap: t, normalMap: nrm, bumpiness: .5,
          diffuse: new pc.Color(.16, .16, .2), gloss: .25, useSkybox: false
        });
      });
    }

    /* ── holographic sweep ───────────────────────────────────────────────────────────────────
     * ⚑ With BLEND_ADDITIVE, `opacity` does NOT attenuate — additive adds src to dst regardless,
     *   so the strength has to live in the emissive COLOUR. The first version was uniformly
     *   magenta for exactly this reason.
     * ⚑ And it is a travelling BAND, not a tint. A flat plate lit all at once just looks like
     *   the card is the wrong colour; real foil is a narrow stripe that crosses the face. */
    var bandTex = (function () {
      var S = 256, c = document.createElement('canvas'); c.width = c.height = S;
      var x = c.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
      var g = x.createLinearGradient(0, 0, S, S);
      g.addColorStop(0.00, 'rgba(0,0,0,0)'); g.addColorStop(0.40, 'rgba(0,0,0,0)');
      g.addColorStop(0.47, 'rgba(120,190,255,1)');
      g.addColorStop(0.50, 'rgba(255,255,255,1)');
      g.addColorStop(0.53, 'rgba(255,140,230,1)');
      g.addColorStop(0.60, 'rgba(0,0,0,0)'); g.addColorStop(1.00, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      var t = new pc.Texture(app.graphicsDevice, { mipmaps: true, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT });
      t.setSource(c); return t;
    })();
    var holo = mkMat({
      diffuse: new pc.Color(0, 0, 0), emissiveMap: bandTex, emissive: new pc.Color(.10, .10, .10),
      blendType: pc.BLEND_ADDITIVE, depthWrite: false
    });
    fx.render.material = holo;

    /* ── LAYERED CARDS ────────────────────────────────────────────────────────────────────────
     * A stack of authored plates through the card's thickness, described by js/card-layers.js.
     * The flat plates (`art`, `back`) are switched OFF while a stack is mounted and switched
     * back on when it is cleared, so a page can move between the two without rebuilding.
     *
     * ⚑ Z_MAX STOPS SHORT OF THE BEVEL'S FRONT FACE (0.053). A plate at 0.048 sits INSIDE the
     *   bevel bars' volume but behind their front face, so the depth test hides its border under
     *   the frame — which is what you want, a layer sliding under the rim rather than through
     *   it. Push it past 0.053 and the artwork pokes out over the metal.
     * ⚑ Every plate is transparent with depthWrite OFF and sorted back-to-front by the engine.
     *   Writing depth from a stack of alpha plates is how you get a subject that punches a black
     *   hole in the background behind its own soft edges. */
    var Z_MIN = 0.020, Z_MAX = 0.046;
    var layerList = [], layerSpec = null;

    function clearLayers() {
      for (var i = 0; i < layerList.length; i++) {
        var L = layerList[i];
        try { L.ent.destroy(); } catch (e) {}
        try { if (L.tex) L.tex.destroy(); } catch (e) {}
        try { if (L.nrm) L.nrm.destroy(); } catch (e) {}
      }
      layerList = [];
    }

    function buildLayer(spec) {
      var sz = (spec.fit === 'full' ? 0.99 : 0.90) * spec.scale;
      var z = Z_MIN + spec.z * (Z_MAX - Z_MIN);
      var e = plate(z, W * sz, H * sz);
      e.enabled = false;                      // nothing is shown until its image actually decodes
      var rec = { spec: spec, ent: e, z: z, mat: null, tex: null, nrm: null, gain: 1, off: null };
      layerList.push(rec);

      function finish() {
        var add = spec.blend === 'add';
        rec.mat = mkMat({
          /* Same recipe as the single plate, decision for decision — see setArt's note. The one
           * thing that MUST NOT drift is `useSkybox:false`: a StandardMaterial samples the
           * environment for ambient specular, and on artwork that is the milky wash that lifts
           * blacks and eats saturation. Metal reflects the env; artwork never does. */
          emissiveMap: rec.tex, emissive: new pc.Color(1, 1, 1), diffuse: new pc.Color(0, 0, 0),
          normalMap: rec.nrm, bumpiness: rec.nrm ? 0.42 : 0,
          gloss: 0.62, metalness: 0, useMetalness: false,
          specular: new pc.Color(0.05, 0.05, 0.05), useSkybox: false,
          blendType: add ? pc.BLEND_ADDITIVE : pc.BLEND_NORMAL,
          /* ⚑ ADDITIVE IGNORES `opacity` — it adds src to dst whatever you set. The same trap the
           * holo band fell into: on an additive layer the strength has to live in the emissive
           * COLOUR, which is exactly what `drive` writes to. */
          opacityMap: add ? null : rec.tex, opacityMapChannel: 'a',
          opacity: add ? 1 : spec.opacity,
          depthWrite: false
        });
        e.render.material = rec.mat;
        e.enabled = true;
        applyGain(rec);
      }

      texFor(spec.src, function (t, img) {
        rec.tex = t;
        if (spec.normal) {
          /* An AUTHORED normal beats a derived one every time — deriving it is a guess about
           * which parts of a drawing are raised. Linear, never sRGB. */
          texFor(spec.normal, function (nt) { rec.nrm = nt; finish(); },
                 { linear: true, onerror: finish });
        } else if (spec.relief > 0) {
          try { rec.nrm = normalFromImage(pc, app.graphicsDevice, img, spec.relief); }
          catch (e2) { rec.nrm = null; }
          finish();
        } else finish();
      }, { repeat: !!spec.foil });
    }

    /** @param spec a normalised CardLayers spec, or null to go back to the flat card. */
    function setLayers(spec) {
      clearLayers();
      layerSpec = (spec && spec.layers && spec.layers.length) ? spec : null;
      var flat = !layerSpec;
      art.enabled = flat; back.enabled = flat;
      if (flat) { fx.enabled = true; return true; }
      var hasFoil = false;
      for (var i = 0; i < layerSpec.layers.length; i++) {
        if (layerSpec.layers[i].foil) hasFoil = true;
        buildLayer(layerSpec.layers[i]);
      }
      /* An authored foil layer REPLACES the generated sweep rather than stacking with it — two
       * travelling bands on one card reads as a rendering bug, not as more foil. */
      fx.enabled = !hasFoil;
      return true;
    }

    /* ── live market state ────────────────────────────────────────────────────────────────────
     * `drivers` are the 0..1 dials from js/lens-state.js: { live, burn, price, depth }.
     *
     * ⚑ THE RESTING VALUES ARE THE POINT. price 0.5 / depth 0.5 / burn 0 put the key back at
     *   1.5, the rim at 2.4, the parallax gain at 1.0 and the foil at one band — i.e. exactly
     *   the card that shipped. A blocked frame, a dead RPC, `?nostate` and a card nobody has
     *   wired up all render the same thing, and that thing is the one we already tuned.
     * ⚑ WHAT THE MARKET IS ALLOWED TO TOUCH: light and motion. Not the artwork's colour. The
     *   art plate is emissive with a black diffuse, so lights cannot re-grade it by
     *   construction — which is why raising the key on a hot market is safe here and would not
     *   be on a diffuse-lit card. */
    var drivers = { live: false, burn: 0, price: 0.5, depth: 0.5 };
    var parGain = 1, bands = 1;
    var _tile = new pc.Vec2(1, 1);

    function driveValue(name) {
      var v = name === 'burn' ? drivers.burn : name === 'price' ? drivers.price
            : name === 'depth' ? drivers.depth : null;
      return (v === null || !drivers.live) ? null : v;
    }
    function applyGain(rec) {
      var d = rec.spec.drive; if (!d || !rec.mat) return;
      var v = driveValue(d.gain);
      /* No live read ⇒ sit at the TOP of the authored range, not the bottom. A layer the artist
       * drew is part of the card; the market may push it further, it may not delete it because
       * a fetch failed. */
      var g = (v === null) ? d.max : d.min + (d.max - d.min) * v;
      if (Math.abs(g - rec.gain) < 0.004) return;
      rec.gain = g; rec.mat.emissive.set(g, g, g); rec.mat.update();
    }

    function setState(d) {
      drivers = d && typeof d === 'object'
        ? { live: !!d.live, burn: +d.burn || 0, price: isFinite(d.price) ? d.price : 0.5,
            depth: isFinite(d.depth) ? d.depth : 0.5 }
        : { live: false, burn: 0, price: 0.5, depth: 0.5 };
      var price = drivers.live ? drivers.price : 0.5;
      var depth = drivers.live ? drivers.depth : 0.5;
      var burn  = drivers.live ? drivers.burn  : 0;

      key.light.intensity = 1.5 * (0.88 + 0.24 * price);     // 1.5 at rest
      rim.light.intensity = 2.4 * (0.85 + 0.30 * price);     // 2.4 at rest
      /* MARKET DEPTH BECOMES VISUAL DEPTH — the layers separate as the book does, and a market
       * with zero liquidity flattens the card onto its own plate. Not a metaphor we invented to
       * be clever: it is the one mapping where the failure mode states something true. */
      parGain = 0.70 + 0.60 * depth;                          // 1.0 at rest
      /* The burn adds BANDS to the foil. A number nobody can read becomes a thing you can count,
       * and it only ever goes one way, because burns are permanent. */
      var b = 1 + Math.round(3 * burn);
      if (b !== bands) { bands = b; _tile.set(b, b); holo.emissiveMapTiling = _tile; holo.update(); }
      for (var i = 0; i < layerList.length; i++) applyGain(layerList[i]);
      return drivers;
    }

    if (o.env) loadEnv(pc, app, o.env).then(function (atlas) {
      app.scene.envAtlas = atlas;
      app.scene.skyboxIntensity = 0.55;   // fill and reflection only — the key light still keys
    }).catch(function () {});

    var getTilt = o.tilt || function () { return { x: 0, y: 0 }; };
    /* ⚠ prefers-reduced-motion is a request about AUTONOMOUS motion. The tilt is direct
     * manipulation — the collector's own pointer — so it stays; the foil's travelling band and
     * the idle shimmer are the card moving on its own, so they stop. Live, because a viewer can
     * change the setting while the card is on screen and the whole point is that it is respected
     * when they do. */
    var reduce = false;
    try {
      var mq = matchMedia('(prefers-reduced-motion: reduce)');
      reduce = !!mq.matches;
      var onMQ = function (e) { reduce = !!e.matches; };
      if (mq.addEventListener) mq.addEventListener('change', onMQ); else if (mq.addListener) mq.addListener(onMQ);
    } catch (e) { reduce = false; }

    var t = 0, lastHeat = -1;
    /* ⚑ DO NOT CALL material.update() EVERY FRAME. It rebuilds the material's shader parameters,
     * and doing it 60 times a second for a value that barely moved is most of what made the card
     * viewer feel choppy. The offset and the heat are mutated IN PLACE on the existing objects —
     * allocating a fresh Vec2 and Color per frame also handed the GC 120 objects a second for
     * nothing — and `update()` only fires when the heat has actually changed enough to see. */
    var _off = new pc.Vec2(0, 0);
    app.on('update', function (dt) {
      if (!reduce) t += dt;
      var q = getTilt() || { x: 0, y: 0 };
      root.setLocalEulerAngles(-q.y * 13, q.x * 16, q.x * -2);
      // the layers slide against each other by depth — the parallax that sells it
      if (layerList.length) {
        for (var i = 0; i < layerList.length; i++) {
          var L = layerList[i], p = L.spec.par * parGain;
          L.ent.setLocalPosition(q.x * -0.022 * p, q.y * 0.022 * p, L.z);
          if (L.spec.foil && L.mat) {
            if (!L.off) L.off = new pc.Vec2(0, 0);
            L.off.x = -((t * 0.16) % 1); L.mat.emissiveMapOffset = L.off;
          }
        }
      } else {
        art.setLocalPosition(q.x * -0.022 * parGain, q.y * 0.022 * parGain, 0.030);
        back.setLocalPosition(q.x * 0.016 * parGain, q.y * -0.016 * parGain, 0.019);
      }
      _off.x = -((t * 0.16) % 1); holo.emissiveMapOffset = _off;
      // additive lifts blacks and this art has real blacks, so idle is nearly nothing
      /* Tilt still brightens the foil under reduced-motion — that is the collector's own hand,
       * not the card animating at them. Only the BAND'S TRAVEL is frozen (t stops advancing). */
      var heat = 0.012 + 0.115 * Math.min(1, Math.hypot(q.x, q.y))
               + 0.05 * (drivers.live ? drivers.burn : 0);
      if (Math.abs(heat - lastHeat) > 0.004) {
        lastHeat = heat;
        holo.emissive.set(heat, heat, heat);
        holo.update();
      }
    });
    app.start();

    /* The parts are handed back by name so a headless check can switch ONE of them off and
     * re-measure. Every tonal question on this card ("is the foil lifting the blacks or is it
     * the specular?") is otherwise a guess, and guessing is how the wash survived two passes. */
    var ctrl = {
      app: app, root: root, art: art, back: back, fx: fx, holo: holo, key: key, rim: rim, body: body,
      setArt: setArt,
      setLayers: setLayers,
      setState: setState,
      /* Read-only views for a headless check — "is the stack actually mounted, and what is the
       * market doing to it right now" has to be answerable without screenshotting a guess. */
      layers: function () { return layerList; },
      layerSpec: function () { return layerSpec; },
      state: function () {
        return { drivers: drivers, parGain: parGain, bands: bands, reduced: reduce,
                 key: key.light.intensity, rim: rim.light.intensity, layers: layerList.length };
      },
      setRarity: function (r) {
        var hex = RARITY[r] || RARITY.common, c = new pc.Color().fromString(hex);
        rim.light.color = new pc.Color(c.r, c.g, c.b);
      },
      resize: fit,
      destroy: function () {
        removeEventListener('resize', onResize);
        if (ro) { try { ro.disconnect(); } catch (e) {} }
        clearLayers();
        try { app.destroy(); } catch (e) {}
      }
    };
    global.__card3d = ctrl;
    return ctrl;
  }

  global.Card3D = { engine: engine, build: build, RARITY: RARITY };
})(window);

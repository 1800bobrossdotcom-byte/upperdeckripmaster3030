/* upperdeckripmaster3030 — THE ARENA's card fight in real 3D (CBFight3D).
 *
 * `js/card-fight.js` still owns the FIGHT: the scripted HP curve, which card fires when, the
 * callouts, the skip. This file owns the picture. It is the same split as `js/s9pc-game.js` vs
 * `js/s9pc-app.js` — the thing that knows the rules must not also know the shader — and it is what
 * makes the two paths interchangeable: hand `card-fight.js` a null here and it draws the original
 * 2D fight, unchanged, with nothing to switch off.
 *
 * ── WHY THE CARDS ARE THE FIGHTERS ────────────────────────────────────────────────────────────
 * CLAUDE.md's artist ethos: "the trading card is the FORM — a size before it's anything". The 2D
 * fight had two invisible anchors lobbing coloured dots at each other; nothing on screen was the
 * thing being wagered. So each staked card walks into the ring AS ITSELF: a real 3D card, with its
 * own art on it, standing on the floor of a sunburst arena, throwing its own signature ability. You
 * can see which card did what because the card is right there doing it.
 *
 * ── WHY NOT `Card3D.build()` FOR THOSE CARDS ──────────────────────────────────────────────────
 * ⚑ Because `Card3D.build` constructs its own `pc.Application` around its own canvas — one WebGL
 *   context per card. A full-slam face-off stakes 7 a side; that is fourteen contexts on top of the
 *   arena's own, and browsers cap contexts at around sixteen (the binder's own comment says so).
 *   They also could not share a depth buffer, so the ranks could not overlap, which is most of what
 *   makes the shot read as depth.
 *   What IS reused is everything that can be: `Card3D.engine()` loads the one vendored engine (so
 *   the arena and the binder never load it twice), `Card3D.RARITY` supplies the rim colours, and
 *   the card material recipe below is Card3D's, decision for decision, with the reasons carried
 *   across — including the one that cost two passes to find:
 * ⚠ `useSkybox:false` ON THE ARTWORK. A StandardMaterial samples the environment for AMBIENT
 *   SPECULAR as well as reflection, and on an art plate that lands as a broad milky sheen that
 *   measures as lifted blacks and lost saturation. Metal reflects the room; the ARTWORK never does.
 *
 * ── FAILS OPEN ────────────────────────────────────────────────────────────────────────────────
 * PlayCanvas has no software path, so this build genuinely needs WebGL 2. `create()` returns null —
 * never throws — for no WebGL2, no engine, a blocked bundle, a thrown constructor or `?cb3d=0`, and
 * `card-fight.js` then runs its original canvas fight. Fail-open is a standing principle here and
 * this is the cheapest possible version of it: the fallback is the code that was already shipping.
 */
(function (global) {
  'use strict';

  var Q = (function () { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
  var num = function (k, d) { return (Q.has(k) && isFinite(+Q.get(k))) ? +Q.get(k) : d; };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ── POST, tuned for a flat bright stage rather than a gritty one ──────────────────────────
   * `js/s9pc-app.js` documents where each of GfxPost's MEASURED numbers goes in engine terms; the
   * derivations live there and are not repeated. What changes here is the direction, and it is the
   * `CLEAN` argument in that file taken all the way: chromatic aberration and grain ADD the exact
   * high-frequency noise a flat colour field must not have, and unsharp then sharpens that noise.
   * So they are zero. The rolloff stays, because it is the only thing standing between additive
   * bloom and flat white paper.
   *
   * ⚠ EVERY NUMBER BELOW WAS SWEPT ON A **FROZEN** FRAME (`_hold(true)`), and that matters. The
   *   first pass swept a live fight and the readings bounced 15 levels of luma between settings for
   *   no reason but a different population of projectiles being in the air. A sweep that is really
   *   comparing two different exchanges is not a sweep. Frozen, all four curves came out clean.
   *
   * ⚑ THE TONEMAPPER IS **NEUTRAL**, NOT ACES, AND IT WAS MEASURED. Section 9 chose ACES by
   *   counting clipped pixels; the same measurement on this stage says something different, because
   *   the stage is different — flat saturated fields instead of concrete:
   *
   *       tonemapper   clipped %   mean luma   RMS contrast   mean |Lap|   saturation
   *       NEUTRAL       0.0164       77.0         54.94         12.78        58.3   ← chosen
   *       ACES          0.0034       87.8         54.75         11.95        53.4
   *       FILMIC        0.8323       61.9         35.74          7.13        40.8
   *       LINEAR        2.9874      100.4         51.15         10.40        39.7
   *       NONE          2.9748      100.8         51.29         10.49        39.6
   *
   *   Unrolled (NONE) the additive FX blow 2.97% of the frame to flat white — the exact failure
   *   GfxPost's measured `knee 0.94` exists to prevent, so a rolloff is non-negotiable. ACES and
   *   NEUTRAL both remove ~99.5% of it. ACES then costs 4.9 points of SATURATION and 0.8 of local
   *   detail against NEUTRAL, because ACES desaturates highlights by design — a virtue in a
   *   photographic look and a defect when the whole subject IS flat saturated colour. NEUTRAL costs
   *   11 luma and returns saturation well ABOVE the unrolled image (39.6 → 58.3). It is also the
   *   closest thing in the engine to `js/card3d.js`'s reason for TONEMAP_NONE: do not re-grade the
   *   artist's colour. Same method as Section 9, opposite answer, because it is not the same picture. */
  var POST = {
    /* the NAME, not the constant — `pc` does not exist yet when this file parses, and resolving it
     * into POST at boot would mean a second fight re-resolving an already-resolved number */
    toneName: Q.get('tone') || 'neutral',
    /* ⚑ BLOOM, swept on the frozen frame at tone NEUTRAL. Perfectly monotone:
     *     0      luma  63.4 · rms 62.61 · |Lap| 15.45 · sat 75.5 · blacks 6.38%
     *     0.012  luma  72.8 · rms 61.34 · |Lap| 13.96 · sat 62.1
     *     0.030  luma  86.5 · rms 58.07 · |Lap| 12.00 · sat 54.8   ← chosen
     *     0.055  luma 104.2 · rms 54.52 · |Lap|  9.91 · sat 46.7
     *     0.090  luma 132.4 · rms 48.17 · |Lap|  7.28 · sat 40.3 · clipped 0.87%
     *     0.160  luma 161.5 · rms 39.03 · |Lap|  4.87 · sat 35.7
     *   Bloom BUYS LUMA AND SPENDS EVERYTHING ELSE — contrast, local detail and saturation all fall
     *   monotonically, which is the same shape s9pc-app.js measured on a completely different scene.
     *   Not zero (this is neon; s9pc's own CLEAN note is that neon has to actually glow, and at 0 the
     *   frame keeps 6.4% dead black) and not past 0.03, where it starts buying luma alone — and luma
     *   is the one thing a bright stage already has. */
    bloom: num('bloom', 0.030),
    /* ⚑ SHARPNESS HAS A KNEE AT 0.2, and this contradicts the value first guessed (0.30) as well as
     * Section 9's 0.70. Mean |Laplacian|: 0 → 10.61 · 0.2 → 11.97 · 0.3 → 11.99 · 0.5 → 12.02 ·
     * 0.8 → 12.35. Nearly all of the local contrast arrives by 0.2 and everything past it costs
     * saturation (54.2 → 52.1) and re-introduces clipping (0 → 0.059%) for +3% detail.
     * The reason it saturates so early is the look itself: Section 9's CAS has grime, tiling and
     * grain to bite on, and this stage has flat colour fields and one hard ink keyline per card.
     * There is very little high frequency here to sharpen, which is the whole point of the style. */
    sharpness: num('sharp', 0.20),
    /* ⚑ SATURATION STAYS AT 1.0 — measured, and the opposite of what the CLEAN preset in
     * s9pc-app.js does (1.26). Swept: 1.00 → sat 63.7, clipped 0 · 1.12 → 54.7 · 1.22 → 58.1 ·
     * 1.35 → 58.2 · 1.50 → 62.8, clipped 0.333%. Pushing it does not measure as more saturation and
     * does measure as more clipping, and the reason is where the knob sits: `grading.saturation` is
     * applied in LINEAR space BEFORE the tonemapper, so it drives bright channels further up the
     * rolloff, where they compress back together. The NEUTRAL tonemapper has already done the job a
     * saturation push was there to do (39.6 → 58.3 on its own). Adding more is paying twice and
     * getting less. Kept as a live knob via `?sat=` rather than removed. */
    saturation: num('sat', 1.0),
    fringing: num('ca', 0),
    vignette: { inner: 0.95, outer: 3.4, curvature: 1.0, intensity: num('vig', 0.14) },
    rtScale: num('rt', 1),
    off: Q.get('post') === '0',
  };
  function toneConst(pc, name) {
    var M = { aces: pc.TONEMAP_ACES, neutral: pc.TONEMAP_NEUTRAL, filmic: pc.TONEMAP_FILMIC,
      linear: pc.TONEMAP_LINEAR, none: pc.TONEMAP_NONE, hejl: pc.TONEMAP_HEJL };
    var v = M[String(name).toLowerCase()];
    return v === undefined ? pc.TONEMAP_ACES : v;
  }

  function webgl2() {
    try { var c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; }
  }

  /* ── comic pops ─────────────────────────────────────────────────────────────────────────────
   * ronin3d fires billboarded manga glyphs on hits, and CLAUDE.md is explicit that they are fired
   * game-wide because an impact that is only a particle is an impact you do not read. Here they are
   * MAD-magazine burst panels instead of manga glyphs — same mechanism, this studio's lineage. */
  var POP_WORDS = ['POW!', 'BAM!', 'ZOK!', 'WHAM!', 'KRAK!', 'THWIP!', 'SPLAT!', 'BOFF!'];
  function popCanvas(word, fill, ink) {
    var S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d');
    x.translate(S / 2, S / 2);
    var spikes = 13, R = S * 0.46, r = S * 0.30;
    x.beginPath();
    for (var i = 0; i < spikes * 2; i++) {
      var a = i * Math.PI / spikes - Math.PI / 2, rr = (i % 2 ? r : R) * (0.88 + ((i * 37) % 11) / 44);
      var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath();
    x.fillStyle = fill; x.fill();
    x.lineWidth = S * 0.035; x.strokeStyle = ink; x.stroke();
    x.font = '900 ' + Math.round(S * (word.length > 5 ? 0.15 : 0.19)) + 'px "Arial Black",Arial,sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.save(); x.rotate(-0.12);
    x.fillStyle = ink; x.fillText(word, 0, S * 0.02);
    x.restore();
    return c;
  }

  function create(o) {
    o = o || {};
    if (Q.get('cb3d') === '0') return Promise.resolve(null);
    if (!webgl2()) return Promise.resolve(null);
    if (!global.Card3D || !global.CBArena) return Promise.resolve(null);
    return global.Card3D.engine(o.base || '')
      .then(function () { try { return boot(global.pc, o); } catch (e) { warn(e); return null; } })
      .catch(function (e) { warn(e); return null; });
  }
  function warn(e) { try { console.warn('[cbfight] falling back to the 2D fight:', e && e.message || e); } catch (x) {} }

  function boot(pc, o) {
    var host = o.host, arena = o.arena;
    if (!pc || !host) return null;
    var dead = false;                       // set by dispose(); every deferred callback checks it

    var canvas = document.createElement('canvas');
    canvas.className = 'cb3d';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    var app;
    try {
      app = new pc.Application(canvas, {
        graphicsDeviceOptions: {
          antialias: false, alpha: true, depth: true,
          /* ⚠ `?grab=1` keeps the drawing buffer so a headless run can read the real pixels.
           * CLAUDE.md: this container's screenshot path rotates hue on canvas content, so colour
           * must be judged from a readback — and a WebGL canvas without this reads back BLACK. */
          preserveDrawingBuffer: Q.get('grab') === '1',
        },
      });
    } catch (e) { canvas.remove(); throw e; }
    if (!app.graphicsDevice) { canvas.remove(); return null; }

    /* Colour management, same as js/card3d.js and for the same reason: card art and hand-mixed
     * flat fields are sRGB data, and uploading them untagged makes the engine read them as linear —
     * lifted mid-tones, crushed contrast, washed colour. Fixed at source, not with saturation. */
    if ('gammaCorrection' in app.scene) app.scene.gammaCorrection = pc.GAMMA_SRGB;
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    var DPRCAP = (global.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2;
    app.graphicsDevice.maxPixelRatio = Math.min(global.devicePixelRatio || 1, DPRCAP);

    var TONE = toneConst(pc, POST.toneName);
    var A = CBArena.build(pc, app, { tone: TONE, reduce: !!o.reduce });
    var cam = A.cam;
    var mkTex = A._tex.tex;

    /* ⚑ MEASURE THE CANVAS, NOT THE HOST. `.faceoff` has padding and a backdrop-filter, so a fixed
     * child at inset:0 lays out against its PADDING box — the canvas is a few px inside the host on
     * every edge. Sizing the backing store from the host would stretch the render by that margin
     * and, worse, would put every screenToWorld handoff coordinate off by the padding, which is the
     * one number the DOM→3D card handoff cannot be wrong about. */
    function fit() {
      /* ⚠ CLEAR THE INLINE SIZE BEFORE MEASURING. `app.resizeCanvas()` pins `style.width/height` in
       * px; measure without clearing and the canvas reads back the size IT set last time, so it can
       * shrink on a rotate but never grow again. Cleared, the CSS `width/height:100%` re-asserts and
       * the measurement is the layout's answer rather than an echo of our own. */
      canvas.style.width = ''; canvas.style.height = '';
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      app.resizeCanvas(r.width, r.height);
      try { app.graphicsDevice.updateClientRect(); } catch (e) {}
      A.refit(r.width, r.height);
      return true;
    }
    if (!fit()) { var tries = 0; (function retry() { if (tries++ > 90) return; if (!fit()) requestAnimationFrame(retry); })(); }
    var onResize = function () { fit(); };
    addEventListener('resize', onResize);

    A.buildPost({ tone: TONE, bloom: POST.bloom, sharpness: POST.sharpness, saturation: POST.saturation,
      fringing: POST.fringing, vignette: POST.vignette, rtScale: POST.rtScale, off: POST.off });

    // ── shared materials & meshes ─────────────────────────────────────────────────────────────
    var matCache = {};
    function glowMat(hex, gain) {
      var k = hex + '|' + (gain || 1);
      if (matCache[k]) return matCache[k];
      var c = new pc.Color().fromString(hex);
      var m = new pc.StandardMaterial();
      m.diffuse = new pc.Color(0, 0, 0);
      m.emissive = new pc.Color(c.r * (gain || 1), c.g * (gain || 1), c.b * (gain || 1));
      m.useLighting = false; m.useSkybox = false;
      m.blendType = pc.BLEND_ADDITIVE; m.depthWrite = false;
      m.update();
      return (matCache[k] = m);
    }
    function solid(props) { var m = new pc.StandardMaterial(); Object.assign(m, props); m.update(); return m; }

    var fxRoot = new pc.Entity('fx'); A.root.addChild(fxRoot);

    // ── the fighters ──────────────────────────────────────────────────────────────────────────
    var CW = 1.0, CH = 1.5;                                   // card size in world units (Card3D's ratio)
    var RAR = (global.Card3D && Card3D.RARITY) || {};

    function texFor(url, cb) {
      var opts = { mipmaps: true, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE };
      if (pc.PIXELFORMAT_SRGBA8 !== undefined) opts.format = pc.PIXELFORMAT_SRGBA8;
      var t;
      try { t = new pc.Texture(app.graphicsDevice, opts); }
      catch (e) { t = new pc.Texture(app.graphicsDevice, { mipmaps: true }); }
      if ('srgb' in t) t.srgb = true;
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () { try { t.setSource(img); cb(t); } catch (e) {} };
      img.onerror = function () {};                            // a missing thumb costs the plate its art, nothing else
      img.src = url;
    }

    /* Slot layout. The champion (highest Σ) takes the front slot nearest the centre line; the rest
     * recede in x AND z, which is the only reason a seven-card rank reads as a gang rather than a
     * row. The scale taper does the same job the DOM stack's negative margin does — see
     * `.fo-cw:not(:first-child)` in cards/battle.html. */
    function slotOf(sign, i) {
      return { x: sign * (2.05 + i * 0.80), y: 1.42 + (i & 1 ? 0.10 : 0), z: 0.95 - i * 0.72,
        sc: Math.max(0.72, 1.22 - i * 0.055), ry: sign * -17 };
    }

    function makeCard(card, sign, slot, rarityHex) {
      var e = new pc.Entity('card');
      A.root.addChild(e);

      var body = new pc.Entity('body');
      body.addComponent('render', { type: 'box', castShadows: false, receiveShadows: false });
      body.setLocalScale(CW * 1.02, CH * 1.02, 0.05);
      body.render.material = solid({ diffuse: new pc.Color(0.05, 0.05, 0.07), metalness: 0.45,
        gloss: 0.45, useMetalness: true, useSkybox: false });
      e.addChild(body);

      // the rarity frame — four thin bars standing proud, lit by the rims. A drawn border is a
      // picture of an edge; this one occludes and catches light as the card turns.
      var frameCol = new pc.Color().fromString(rarityHex);
      var frameMat = solid({ diffuse: new pc.Color(frameCol.r * 0.25, frameCol.g * 0.25, frameCol.b * 0.25),
        emissive: new pc.Color(frameCol.r * 0.55, frameCol.g * 0.55, frameCol.b * 0.55),
        metalness: 0.8, gloss: 0.6, useMetalness: true, useSkybox: false });
      var bw = 0.055, iw = CW * 0.955, ih = CH * 0.955;
      [[0, ih / 2, iw + bw, bw], [0, -ih / 2, iw + bw, bw], [-iw / 2, 0, bw, ih + bw], [iw / 2, 0, bw, ih + bw]]
        .forEach(function (b) {
          var f = new pc.Entity('bev');
          f.addComponent('render', { type: 'box', castShadows: false });
          f.setLocalScale(b[2], b[3], 0.045);
          f.setLocalPosition(b[0], b[1], 0.035);
          f.render.material = frameMat;
          e.addChild(f);
        });

      function plate(z, sx, sy) {
        var p = new pc.Entity('plate');
        p.addComponent('render', { type: 'plane', castShadows: false, receiveShadows: false });
        p.setLocalEulerAngles(90, 0, 0);
        p.setLocalScale(sx, 1, sy);
        p.setLocalPosition(0, 0, z);
        e.addChild(p); return p;
      }
      /* ⚑ THE ART IS EMISSIVE, NOT DIFFUSE, and `useSkybox:false`. Both decisions are lifted whole
       * from js/card3d.js, with the reasons: a finished artwork should reach the viewer the way the
       * artist left it rather than re-graded by whatever key light is in the room, and an
       * environment sampled for ambient specular puts a milky sheen across the whole face.
       * The difference from the collector's card is deliberate and small: no relief normal map
       * here. Card3D Sobels the artwork's own luminance to emboss it, which costs a 512² CPU blur
       * per card — fine for one card in a viewer, not for fourteen appearing at once in a modal
       * that is already open. At fight distance a card is ~120 px tall and the relief would not
       * survive the resample anyway. */
      var art = plate(0.032, CW * 0.90, CH * 0.90);
      var artMat = solid({ emissive: new pc.Color(1, 1, 1), diffuse: new pc.Color(0, 0, 0),
        metalness: 0, useMetalness: false, specular: new pc.Color(0.05, 0.05, 0.05),
        gloss: 0.5, useSkybox: false });
      art.render.material = artMat;
      if (card && card.art) texFor(card.art, function (t) { artMat.emissiveMap = t; artMat.update(); });

      /* ⚑ THE INK KEYLINE. A comic panel outlines its subject in black, and there is a rendering
       * reason as well as a stylistic one: against a bright saturated backdrop a bright card has no
       * silhouette at all — the two just meet. An opaque black plate a little larger than the card,
       * sitting behind it, draws a hard 0.05-unit line all the way round and gives the additive halo
       * something to glow OUT of rather than through. It is opaque on purpose so it writes depth. */
      var ink = plate(-0.035, CW * 1.12, CH * 1.08);
      ink.render.material = solid({ diffuse: new pc.Color(0, 0, 0), emissive: new pc.Color(0.015, 0.005, 0.03),
        useLighting: false, useSkybox: false });

      // the halo: a slightly larger additive plate BEHIND the card. This is what gives every card a
      // hard rarity-coloured silhouette against a bright backdrop instead of dissolving into it.
      var halo = plate(-0.065, CW * 1.34, CH * 1.28);
      var haloMat = solid({ diffuse: new pc.Color(0, 0, 0),
        emissive: new pc.Color(frameCol.r * 0.22, frameCol.g * 0.22, frameCol.b * 0.22),
        useLighting: false, useSkybox: false, blendType: pc.BLEND_ADDITIVE, depthWrite: false });
      halo.render.material = haloMat;

      // a flat cartoon contact shadow. Deliberately NOT a shadow map: a hard drawn ellipse is both
      // free and more on-style than a soft real one, and it survives every quality tier.
      var sh = new pc.Entity('shadow');
      sh.addComponent('render', { type: 'plane', castShadows: false });
      sh.setLocalScale(CW * 1.3, 1, CW * 0.7);
      sh.render.material = solid({ diffuse: new pc.Color(0, 0, 0), emissive: new pc.Color(0, 0, 0),
        useLighting: false, useSkybox: false, blendType: pc.BLEND_NORMAL, opacity: 0.42, depthWrite: false });
      A.root.addChild(sh);

      return { e: e, art: artMat, halo: haloMat, frame: frameMat, shadow: sh, slot: slot, sign: sign,
        rar: frameCol, haloG: -1, lunge: 0, hit: 0, spin: 0, dead: 0, rise: 0, bob: Math.random() * 6.28, warp: 1, from: null };
    }

    var sides = { you: [], house: [] };
    function buildSide(cards, key) {
      var sign = key === 'you' ? -1 : 1;
      // slot 0 goes to the biggest card, so the champion is the one you actually look at
      var order = cards.map(function (c, i) { return { i: i, v: (+c.atk || 0) + (+c.def || 0) }; })
        .sort(function (a, b) { return b.v - a.v; });
      var out = new Array(cards.length);
      order.forEach(function (rec, slotIdx) {
        var c = cards[rec.i];
        var hex = RAR[c.rarity] || RAR.common || '#9fb2c4';
        out[rec.i] = makeCard(c, sign, slotOf(sign, slotIdx), hex);
      });
      sides[key] = out;
    }
    buildSide((o.you || []).slice(), 'you');
    buildSide((o.house || []).slice(), 'house');

    /* ── THE HANDOFF: the staked DOM cards become the fighters ─────────────────────────────────
     * The binder's folder does this in 2D — "measure pocket → measure destination → move a plain
     * <img> between them" — and it is the same move here, one dimension up. Each 3D card is placed
     * so that its PROJECTED rectangle matches the DOM card it came from, then flown to its slot
     * while the DOM card fades to an empty sleeve. Both are on screen at the same position for one
     * frame, which is the whole trick: the eye reads it as the same object, not a cut.
     *
     * The scale solve: a card is CH world units tall, and at distance d from the camera one world
     * unit covers `(H/2) / (tan(fov/2) · d)` CSS pixels. Invert for the scale that makes CH cover
     * the DOM card's measured height. */
    var seedErr = { seeded: 0, maxErrPx: -1 };
    function seedFromDom() {
      if (!arena) return;
      /* ⚑ PUT THE CAMERA WHERE IT WILL BE, FIRST. This was a real bug and the handoff check caught
       * it: `A.update()` is what positions the camera, and it does not run until the first engine
       * frame — so seeding before it meant every `screenToWorld` was solved against a camera still
       * sitting at the origin. Measured 292 px of error, i.e. the cards flew in from the wrong place
       * entirely. One synthetic zero-dt update fixes it, and the error drops to single pixels. */
      A.update(0);
      var cr = canvas.getBoundingClientRect();
      var H = Math.max(1, cr.height);
      var tanH = Math.tan(cam.camera.fov * Math.PI / 360);
      var back = new pc.Vec3();
      seedErr = { seeded: 0, maxErrPx: 0 };
      ['you', 'house'].forEach(function (key) {
        var sideEl = arena.querySelector('.fo-side.' + key); if (!sideEl) return;
        var els = sideEl.querySelectorAll('.fo-cw');
        sides[key].forEach(function (f, i) {
          var el = els[i]; if (!el) return;
          var r = el.getBoundingClientRect(); if (!r.height) return;
          var slot = f.slot;
          var camPos = cam.getPosition();
          var d = Math.hypot(slot.x - camPos.x, slot.y - camPos.y, slot.z - camPos.z);
          var cx = r.left - cr.left + r.width / 2, cy = r.top - cr.top + r.height / 2;
          var w = new pc.Vec3();
          cam.camera.screenToWorld(cx, cy, d, w);
          f.from = { x: w.x, y: w.y, z: w.z, sc: clamp((r.height * tanH * d * 2) / (H * CH), 0.15, 3) };
          f.warp = 0;                                          // 0 = at the DOM card, 1 = in its slot
          el.classList.add('cb-handed');                       // CSS in battle.html fades it to a sleeve
          // round-trip the seed back to the screen and keep the worst error. Measured AT SEED TIME:
          // afterwards the camera drifts and punches, so a later projection is not the same question.
          cam.camera.worldToScreen(w, back);
          seedErr.seeded++;
          seedErr.maxErrPx = Math.max(seedErr.maxErrPx, Math.hypot(back.x - cx, back.y - cy));
        });
      });
      seedErr.maxErrPx = +seedErr.maxErrPx.toFixed(3);
    }

    function releaseDom() {
      if (!arena) return;
      arena.querySelectorAll('.cb-handed').forEach(function (el) { el.classList.remove('cb-handed'); });
    }

    // ── projectiles & FX ──────────────────────────────────────────────────────────────────────
    /* Pools are PER PRIMITIVE TYPE. Reassigning `render.type` on a recycled entity rebuilds its
     * mesh instance, which is exactly the allocation the pool exists to avoid — and a fight can
     * throw 60 sparks in one frame. Five small pools cost five arrays. */
    var shots = [], puffs = [], pops = [], pool = {};
    function grab(type, matr) {
      var bag = pool[type] || (pool[type] = []);
      var e = bag.pop();
      if (!e) { e = new pc.Entity('p'); e.addComponent('render', { type: type, castShadows: false }); fxRoot.addChild(e); e._cbType = type; }
      e.render.material = matr;
      e.enabled = true;
      return e;
    }
    function drop(e) {
      e.enabled = false;
      var bag = pool[e._cbType] || (pool[e._cbType] = []);
      if (bag.length < 90) bag.push(e); else { try { e.destroy(); } catch (x) {} }
    }
    // lookAt on a zero-length direction produces a NaN rotation that never recovers — one dead
    // frame of a projectile is a projectile that is gone for the rest of the fight.
    function aim(e, x, y, z) {
      var p = e.getPosition();
      if (Math.abs(x - p.x) < 1e-5 && Math.abs(y - p.y) < 1e-5 && Math.abs(z - p.z) < 1e-5) return;
      e.lookAt(x, y, z);
    }

    function anchorOf(key) {
      var f = sides[key] && sides[key][0];
      var sign = key === 'you' ? -1 : 1;
      var s = f ? f.slot : slotOf(sign, 0);
      return { x: s.x, y: s.y, z: s.z };
    }

    function spawnShot(cfg) {
      var type = cfg.type || 'box';
      var e = grab(type, glowMat(cfg.col, cfg.gain || 1.0));
      var s = { e: e, type: type, x: cfg.x, y: cfg.y, z: cfg.z, vx: cfg.vx, vy: cfg.vy || 0, vz: cfg.vz || 0,
        r: cfg.r || 0.14, life: cfg.life || 2.0, col: cfg.col, side: cfg.side, kind: cfg.kind || 'bolt',
        grav: cfg.grav || 0, homing: cfg.homing || 0, power: cfg.power || 1, tgt: cfg.tgt, stretch: cfg.stretch || 1 };
      shots.push(s);
      return s;
    }

    /* ⚑ A RING, NOT AN ORB. ronin3d's FX note in CLAUDE.md is explicit that every 3D impact there is
     * "deliberately NOT spheres/orbs" — an expanding sphere reads as a ball of light sitting in the
     * scene, an expanding ring reads as a shockwave leaving the point it started from. Same call. */
    function ringBurst(x, y, z, col, n, big) {
      var e = grab('torus', glowMat(col, 1.25));
      puffs.push({ e: e, kind: 'ring', x: x, y: y, z: z, t: 0, life: big ? 0.5 : 0.34, r0: 0.35, r1: big ? 3.6 : 2.0 });
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.283, b = (Math.random() - 0.5) * 1.4, sp = 2.4 + Math.random() * (big ? 9 : 5);
        var se = grab('box', glowMat(i % 4 === 0 ? '#ffffff' : col, 1.4));
        puffs.push({ e: se, kind: 'spark', x: x, y: y, z: z, t: 0, life: 0.30 + Math.random() * 0.42,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.9 + 1.4, vz: b * sp * 0.5, r: 0.05 + Math.random() * 0.07 });
      }
    }

    var popMats = {};
    function popBurst(x, y, z, word, fill, big) {
      var key = word + fill;
      if (!popMats[key]) {
        var t;
        try { t = mkTex(pc, app.graphicsDevice, popCanvas(word, fill, '#12021f')); } catch (e) { return; }
        var m = new pc.StandardMaterial();
        m.emissiveMap = t; m.emissive = new pc.Color(1, 1, 1); m.diffuse = new pc.Color(0, 0, 0);
        m.opacityMap = t; m.opacityMapChannel = 'a'; m.blendType = pc.BLEND_NORMAL;
        m.useLighting = false; m.useSkybox = false; m.depthWrite = false; m.opacity = 1;
        m.update();
        popMats[key] = m;
      }
      var e2 = grab('plane', popMats[key]);
      pops.push({ e: e2, x: x, y: y, z: z, t: 0, life: big ? 0.75 : 0.5, s0: big ? 1.4 : 0.8, s1: big ? 4.2 : 2.1,
        spin: (Math.random() * 2 - 1) * 16 });
    }

    // ── the public fire() — one case per ability, matching js/card-fight.js's ABIL map ─────────
    function fire(sideKey, cardIdx, ab, opt2) {
      opt2 = opt2 || {};
      var f = sides[sideKey] && sides[sideKey][cardIdx];
      var sign = sideKey === 'you' ? -1 : 1;
      var from = f ? { x: f.slot.x, y: f.slot.y, z: f.slot.z } : anchorOf(sideKey);
      var tgt = anchorOf(sideKey === 'you' ? 'house' : 'you');
      var col = (ab && ab.col) || '#dfe7ff';
      var big = !!opt2.matched;
      var sc = clamp(opt2.scale || 1, 0.6, 2.6);
      var k = (ab && ab.key) || 'strike';
      if (f) { f.lunge = 1; f.spin = big ? 1 : 0.35; }

      var base = 13.5 * (big ? 1.18 : 1);
      function bolt(dy, dz, spd, r, kind, extra) {
        var cfg = { x: from.x + sign * 0.7, y: from.y + dy, z: from.z + dz,
          vx: sign * spd, vy: 0, vz: 0, r: r * sc, col: col, side: sideKey, kind: kind || 'bolt',
          power: big ? 2 : 1, tgt: tgt, type: 'box', stretch: 4.5 };
        Object.assign(cfg, extra || {});
        return spawnShot(cfg);
      }
      if (k === 'rapid') { for (var i = 0; i < 3; i++) (function (n) {
          setTimeout(function () { if (!dead) bolt((n - 1) * 0.22, (n - 1) * 0.10, base * 1.35, 0.10); }, n * 70); })(i); }
      else if (k === 'twin') { bolt(0.30, 0.16, base * 1.2, 0.12); bolt(-0.30, -0.16, base * 1.2, 0.12); }
      else if (k === 'spread') { for (var j = -2; j <= 2; j++) bolt(j * 0.30, j * 0.22, base, 0.10, 'bolt', { vy: j * 1.1, vz: j * 0.7 }); }
      else if (k === 'laser') {
        var d = Math.abs(tgt.x - from.x);
        var e = grab('box', glowMat(col, 0.95));
        puffs.push({ e: e, kind: 'beam', x: (from.x + tgt.x) / 2, y: from.y, z: from.z * 0.4 + tgt.z * 0.6,
          t: 0, life: big ? 0.42 : 0.30, len: d, r: 0.062 * sc });
        A.punch(0.75); A.shake(1.0);
        setTimeout(function () { if (!dead) landed(sideKey, tgt, col, 2.2, big); }, 90);
      }
      else if (k === 'bomb') { bolt(0.55, 0, base * 0.58, 0.30, 'bomb', { vy: 6.4, grav: -12, type: 'sphere', stretch: 1 }); }
      else if (k === 'shield') {
        var se = grab('torus', glowMat(col, 1.2));
        puffs.push({ e: se, kind: 'ring', x: from.x, y: from.y, z: from.z, t: 0, life: 0.7, r0: 0.4, r1: 2.3 });
        if (f) f.hit = -0.6;                                   // a brace, not a flinch
      }
      else if (k === 'pierce') { bolt(0, 0, base * 0.8, 0.20, 'slug', { stretch: 8, power: 2 }); }
      else if (k === 'homing') { bolt((Math.random() * 2 - 1) * 0.5, (Math.random() * 2 - 1) * 0.5, base * 0.62, 0.16,
        'missile', { type: 'cone', homing: 1, vy: (Math.random() * 2 - 1) * 2.4, stretch: 2.4 }); }
      else bolt(0, 0, base, 0.11);

      if (big) { A.punch(0.5); A.shake(0.55); A.focus(sign * 0.55); }
    }

    function landed(sideKey, at, col, power, big) {
      ringBurst(at.x - (sideKey === 'you' ? 0.6 : -0.6), at.y, at.z, col, big ? 16 : 9, big);
      if (power >= 1.8 || big) popBurst(at.x, at.y + 0.75, at.z + 0.6,
        POP_WORDS[(Math.random() * POP_WORDS.length) | 0], big ? '#ffd23b' : '#ffffff', big);
      A.shake(0.5 + power * 0.35);
      var foe = sides[sideKey === 'you' ? 'house' : 'you'];
      foe.forEach(function (g, i) { g.hit = Math.max(g.hit, i === 0 ? 1 : 0.45); });
      if (o.onImpact) { try { o.onImpact(sideKey, power); } catch (e) {} }
    }

    // ── K.O. ──────────────────────────────────────────────────────────────────────────────────
    var koSide = null;
    function ko(winner) {
      var loser = winner === 'you' ? 'house' : winner === 'house' ? 'you' : null;
      koSide = loser;
      A.punch(2.2); A.shake(3.0); A.zoom(0.5);
      if (loser) {
        var at = anchorOf(loser);
        A.focus(loser === 'you' ? -0.9 : 0.9);
        ringBurst(at.x, at.y, at.z, loser === 'you' ? '#ff5a3c' : '#2bff80', 26, true);
        popBurst(at.x, at.y + 1.0, at.z + 0.8, 'K.O.!', '#ff2ad9', true);
        sides[loser].forEach(function (g, i) { g.dead = 0.0001 + i * 0.02; });
        sides[winner].forEach(function (g) { g.rise = 1; });
      } else {
        popBurst(0, 2.4, 1.2, 'DRAW!', '#ffd23b', true);
        A.zoom(0.25);
      }
    }

    // ── frame ─────────────────────────────────────────────────────────────────────────────────
    var frames = 0, times = [], t0 = performance.now(), firstFrame = 0;
    /* ⚑ HOLD. Under software GL a headless run renders a handful of frames a second, so a sweep that
     * re-measures between changes is comparing DIFFERENT exchanges, not different settings — the
     * first bloom sweep had luma bouncing 15 levels for that reason alone. `_hold(true)` freezes dt
     * for the fight (the camera and every FX stay exactly where they are) while the renderer keeps
     * drawing, so a post sweep changes one thing. Same idea as s9pc-app.js's `stuffFx` + `?hold`. */
    var held = false;
    var _v = new pc.Vec3();
    app.on('update', function (dtRaw) {
      if (dead) return;
      var wall = performance.now();
      if (held) { A.update(0); var msH = performance.now() - wall; times.push(msH); if (times.length > 240) times.shift(); return; }
      if (!frames) firstFrame = +(wall - t0).toFixed(1);
      frames++;
      var dt = Math.min(0.05, dtRaw);

      // fighters
      ['you', 'house'].forEach(function (key) {
        sides[key].forEach(function (f) {
          f.bob += dt * 1.7;
          f.lunge = Math.max(0, f.lunge - dt * 4.2);
          f.hit = f.hit > 0 ? Math.max(0, f.hit - dt * 4.0) : Math.min(0, f.hit + dt * 2.0);
          f.spin = Math.max(0, f.spin - dt * 2.2);
          if (f.warp < 1) f.warp = Math.min(1, f.warp + dt * (o.reduce ? 4 : 1.9));
          if (f.rise) f.rise = Math.min(1, f.rise + dt * 1.6);
          if (f.dead) f.dead = Math.min(1, f.dead + dt * 1.15);

          var s = f.slot;
          // ease-out on the fly-in, so the card arrives settling rather than braking
          var w = f.from ? 1 - Math.pow(1 - f.warp, 3) : 1;
          var bx = f.from ? f.from.x + (s.x - f.from.x) * w : s.x;
          var by = f.from ? f.from.y + (s.y - f.from.y) * w : s.y;
          var bz = f.from ? f.from.z + (s.z - f.from.z) * w : s.z;
          var bs = f.from ? f.from.sc + (s.sc - f.from.sc) * w : s.sc;

          var lift = Math.sin(f.bob) * 0.055 + f.rise * 0.55;
          var push = f.sign * (f.lunge * 0.55 - Math.max(0, f.hit) * 0.42);
          var kx = 0, ky = 0, roll = 0, sc = bs;
          if (f.dead) { // tumble out of the ring
            var p = f.dead;
            kx = f.sign * p * 3.2; ky = -p * p * 4.2 + p * 1.6; roll = p * 220 * f.sign; sc = bs * (1 - p * 0.35);
            f.art.emissive.set(0.9 - p * 0.85, 0.9 - p * 0.85, 0.9 - p * 0.85); f.art.update();
          }
          f.e.setLocalPosition(bx + push + kx, by + lift + ky, bz);
          f.e.setLocalScale(sc, sc, sc);
          f.e.setLocalEulerAngles(
            Math.sin(f.bob * 0.7) * 3 - f.rise * 5,
            s.ry + (1 - w) * f.sign * 65 + f.spin * f.sign * 42,
            roll + Math.sin(f.bob * 0.5) * 2 + f.lunge * f.sign * -7);
          /* ⚑ Only re-`update()` the halo when the glow actually MOVED. js/card3d.js pays for this
           * lesson in its own comment: material.update() rebuilds the shader parameters, and doing
           * it 60×/s per card for a value that barely changed is most of what makes a card viewer
           * feel choppy. Fourteen cards makes it fourteen times worse. */
          var g = 0.22 + Math.max(0, f.hit) * 0.95 + f.rise * 0.55 - f.dead * 0.20;
          if (Math.abs(g - f.haloG) > 0.006) {
            f.haloG = g;
            f.halo.emissive.set(f.rar.r * g, f.rar.g * g, f.rar.b * g);
            f.halo.update();
          }
          f.shadow.enabled = !f.dead || f.dead < 0.4;
          f.shadow.setLocalPosition(bx + push + kx, 0.03, bz);
          f.shadow.setLocalScale(CW * 1.3 * sc, 1, CW * 0.72 * sc);
        });
      });

      // projectiles
      for (var i = shots.length - 1; i >= 0; i--) {
        var s2 = shots[i];
        s2.life -= dt;
        if (s2.homing && s2.tgt) {
          var dx = s2.tgt.x - s2.x, dy = s2.tgt.y - s2.y, dz = s2.tgt.z - s2.z;
          var d2 = Math.hypot(dx, dy, dz) || 1;
          s2.vx += (dx / d2) * 26 * dt; s2.vy += (dy / d2) * 26 * dt; s2.vz += (dz / d2) * 26 * dt;
          var sp = Math.hypot(s2.vx, s2.vy, s2.vz), mx = 17;
          if (sp > mx) { s2.vx *= mx / sp; s2.vy *= mx / sp; s2.vz *= mx / sp; }
        }
        if (s2.grav) s2.vy += s2.grav * dt;
        s2.x += s2.vx * dt; s2.y += s2.vy * dt; s2.z += s2.vz * dt;
        s2.e.setPosition(s2.x, s2.y, s2.z);
        /* Stretch along velocity: a bolt is a streak, not a pill — a sphere reads as an orb sitting
         * still, which is the same call ronin3d's velocity-aligned streak sparks make.
         * ⚑ ORIENT WITH lookAt, NOT setEulerAngles. Euler order is a thing you have to be right
         *   about; `lookAt` aims local −Z at a point and is unambiguous. So the long axis is put on
         *   local Z and pointed at (pos + velocity). A cone's own axis is +Y, so it takes one extra
         *   local −90° about X to bring +Y onto −Z. */
        aim(s2.e, s2.x + s2.vx, s2.y + s2.vy, s2.z + s2.vz);
        if (s2.type === 'cone') { s2.e.rotateLocal(-90, 0, 0); s2.e.setLocalScale(s2.r * 2, s2.r * s2.stretch * 2, s2.r * 2); }
        else s2.e.setLocalScale(s2.r * 2, s2.r * 2, s2.r * s2.stretch * 2);
        var arrived = s2.side === 'you' ? s2.x >= s2.tgt.x - 0.85 : s2.x <= s2.tgt.x + 0.85;
        if (arrived || s2.life <= 0 || s2.y < 0.05) {
          if (arrived || s2.y < 0.05) landed(s2.side, { x: s2.x, y: Math.max(0.4, s2.y), z: s2.z }, s2.col, s2.power, s2.power > 1.5);
          drop(s2.e); shots.splice(i, 1);
        }
      }

      // rings / sparks / beams
      for (var j = puffs.length - 1; j >= 0; j--) {
        var p2 = puffs[j]; p2.t += dt;
        var q = Math.min(1, p2.t / p2.life);
        if (p2.kind === 'ring') {
          var rr = p2.r0 + (p2.r1 - p2.r0) * (1 - Math.pow(1 - q, 2));
          p2.e.setPosition(p2.x, p2.y, p2.z);
          // a pc torus lies in XZ (ring around +Y), so standing it up on X puts it in the XY plane,
          // i.e. facing the camera. The tube THINS as the ring grows, or it reads as a doughnut.
          p2.e.setLocalScale(rr, Math.max(0.06, 0.30 * (1 - q)), rr);
          p2.e.setEulerAngles(90, 0, 0);
        } else if (p2.kind === 'spark') {
          p2.vy -= 16 * dt;
          p2.x += p2.vx * dt; p2.y += p2.vy * dt; p2.z += p2.vz * dt;
          p2.e.setPosition(p2.x, p2.y, p2.z);
          var k2 = p2.r * (1 - q);
          aim(p2.e, p2.x + p2.vx, p2.y + p2.vy, p2.z + p2.vz);
          p2.e.setLocalScale(k2, k2, k2 * 3.4);
        } else if (p2.kind === 'beam') {
          var a2 = Math.sin(q * Math.PI);
          p2.e.setPosition(p2.x, p2.y, p2.z);
          p2.e.setLocalScale(p2.len, p2.r * (0.4 + a2 * 1.1), p2.r * (0.4 + a2 * 1.1));
        }
        if (q >= 1) { drop(p2.e); puffs.splice(j, 1); }
      }

      // comic pops — billboarded, because a panel seen edge-on is not a panel
      var cp = cam.getPosition();
      for (var m2 = pops.length - 1; m2 >= 0; m2--) {
        var P = pops[m2]; P.t += dt;
        var qq = Math.min(1, P.t / P.life);
        var ss = P.s0 + (P.s1 - P.s0) * (1 - Math.pow(1 - qq, 3));
        P.e.setPosition(P.x, P.y + qq * 0.5, P.z);
        P.e.setLocalScale(ss, 1, ss);
        /* ⚑ NOT A lookAt BILLBOARD, AND THE REASON IS MEASURED: the first version aimed each panel
         * at the camera with lookAt, and "KRAK!" came out BACKWARDS. From the +Z side lookAt yaws the
         * entity 180° off identity, which mirrors its U axis — invisible on a symmetric burst,
         * fatal on lettering. The camera here only drifts ±3° in yaw, so a plane simply stood up
         * facing +Z is billboarded to within the width of the panel's own outline, reads the right
         * way round, and is the same (90,0,0) the card art plates already use.
         * The Z term is the in-plane spin: PlayCanvas composes euler as Rz·Ry·Rx, so the X rotation
         * stands the panel up FIRST and the Z rotation then turns it about its own normal. */
        P.e.setLocalEulerAngles(90, 0, P.spin * qq);
        if (qq >= 1) { drop(P.e); pops.splice(m2, 1); }
      }

      A.update(dt);
      var ms = performance.now() - wall;
      times.push(ms); if (times.length > 240) times.shift();
    });

    app.start();
    seedFromDom();

    function median(a) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }); return s[s.length >> 1]; }

    var ctrl = {
      ready: true,
      canvas: canvas,
      app: app,
      arena3d: A,
      fire: fire,
      ko: ko,
      /* the DOM sleeves come back before the spoils panel opens, so the winner's stack is a normal
       * CSS stack again by the time the fly-across animation in battle.html runs on it */
      release: releaseDom,
      fadeOut: function (ms) {
        try { canvas.style.transition = 'opacity ' + (ms || 320) + 'ms ease'; canvas.style.opacity = '0'; } catch (e) {}
      },
      dispose: function () {
        if (dead) return; dead = true;
        removeEventListener('resize', onResize);
        releaseDom();
        try { app.destroy(); } catch (e) {}
        try { canvas.remove(); } catch (e) {}
        if (global.__cbfight === ctrl) global.__cbfight = null;
      },
      /* headless verification hook. `sides` is the handedness check: the scene is authored natively
       * in engine coordinates so there is no worldMirror, but the ONE external convention — you on
       * the left, the house on the right, straight off the DOM grid — still has to hold, and this
       * measures it rather than assuming it. See the long note in js/cbpc-arena.js. */
      probe: function () {
        var sc = new pc.Vec3(), a = anchorOf('you'), b = anchorOf('house');
        var out = { cards: sides.you.length + sides.house.length, shots: shots.length,
          puffs: puffs.length, pops: pops.length, frames: frames, firstFrame: firstFrame,
          msMedian: +median(times).toFixed(2), post: !!A.frame,
          tone: TONE, bloom: POST.bloom, sat: POST.saturation, sharp: POST.sharpness,
          dpr: app.graphicsDevice.maxPixelRatio, warp: +(sides.you[0] ? sides.you[0].warp : 1).toFixed(3),
          size: [app.graphicsDevice.width, app.graphicsDevice.height] };
        /* HANDOFF ERROR, in CSS pixels, recorded when the seed was taken — see seedFromDom. If the
         * seed and the DOM card disagree, the dissolve stops reading as one object moving and starts
         * reading as a cut. This is the number that caught the uninitialised-camera bug. */
        out.handoff = seedErr;
        cam.camera.worldToScreen(new pc.Vec3(a.x, a.y, a.z), sc); out.youX = +sc.x.toFixed(1);
        cam.camera.worldToScreen(new pc.Vec3(b.x, b.y, b.z), sc); out.houseX = +sc.x.toFixed(1);
        cam.camera.worldToScreen(new pc.Vec3(1, 0, 0), sc); var rx = sc.x;
        cam.camera.worldToScreen(new pc.Vec3(-1, 0, 0), sc);
        out.mirrored = !(out.youX < out.houseX && rx > sc.x);
        return out;
      },
      _hold: function (v) { held = !!v; return held; },
      _post: function (k, v) {
        var f = A.frame; if (!f) return null;
        if (k === 'tone') { f.rendering.toneMapping = v; cam.camera.toneMapping = v; }
        else if (k === 'bloom') f.bloom.intensity = v;
        else if (k === 'sat') f.grading.saturation = v;
        else if (k === 'sharp') f.rendering.sharpness = v;
        else if (k === 'vig') f.vignette.intensity = v;
        f.update();
        return true;
      },
    };
    global.__cbfight = ctrl;
    return ctrl;
  }

  global.CBFight3D = { create: create, webgl2: webgl2, POST: POST };
})(window);

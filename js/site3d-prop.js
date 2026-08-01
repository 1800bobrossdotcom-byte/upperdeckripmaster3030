/* ripmaster3030studios — the site's pages get real objects in them.   js/site3d-prop.js
 *
 *   <div class="prop3d" data-site3d="binder"> …static fallback… </div>
 *   Site3D.mount(el, {prop:'binder'}) -> Promise<ctrl|null>      (never rejects)
 *
 * WHY THIS EXISTS. The games are lit 3D and the pages around them were flat CSS, so the site did
 * not look like it came from the same studio as the thing it was selling. This puts ONE small
 * real object on each non-game page — a ring binder on the folder, a bench on the market, a fan
 * of cards on the deck — built in PlayCanvas out of the SAME Blender-baked materials the flat
 * DOM is tiled with (media/site/*, scripts/blender/build-site-props.py). Same albedo, same
 * normal, two renderers: CSS tiles it, the engine lights it.
 *
 * ⛔ FAILS OPEN AT EVERY STEP, and that is not optional here — PlayCanvas has NO software path,
 *   so WebGL2 is a hard requirement (CLAUDE.md, engine decision). Every host element already
 *   contains a static fallback in the page's own markup; the canvas is inserted only once the
 *   engine has resolved AND the app has built, and the fallback is hidden only after the first
 *   real frame. No engine, no WebGL2, a blocked vendor script, a 404 on a texture, a lost
 *   context ⇒ the page is exactly the page it was without this file.
 *
 * ⚑ ONE MODULE, THREE PROPS, and the reason is the one card3d.js already paid for: the moment a
 *   second page wants a lit object there are two copies of the colour-management decision, i.e.
 *   two chances to lose it. gammaCorrection/toneMapping, the light rig, the dpr cap, the
 *   pause-when-unseen rule and the fail-open ladder are written once; only the geometry differs.
 *
 * ⚠ COST IS REAL AND IT IS DEFERRED ON PURPOSE. The engine is ~598 KB gzipped. A decorative
 *   header prop must never compete with first paint or with the page's own images, so the engine
 *   is not fetched until the host is about to be on screen (IntersectionObserver) and the browser
 *   is idle (requestIdleCallback). Save-Data skips it outright — the flat page is a complete
 *   page, so there is nothing to apologise for.
 */
(function (global) {
  'use strict';

  /* ⚠ Resolve against THIS SCRIPT's URL, not document.baseURI. The maps live at the site root
   *   but this file is loaded from /cards/*.html, where baseURI would resolve `media/site/...`
   *   to `/cards/media/site/...` and silently 404. Same trap, same fix, as js/bg-foil.js. */
  var SELF = (document.currentScript && document.currentScript.src) || '';
  var BASE = SELF ? SELF.replace(/js\/site3d-prop\.js.*$/, '') : '';
  function url(p) { return new URL(p, BASE || document.baseURI).href; }

  var reduced = function () {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  };
  var saveData = function () {
    try { return !!(navigator.connection && navigator.connection.saveData); } catch (e) { return false; }
  };
  var dprCap = function () {
    try { return (global.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2; } catch (e) { return 2; }
  };

  /* ── the engine ───────────────────────────────────────────────────────────────────────────
   * ⚑ Hand off to Card3D.engine when that file is on the page. It is the same vendor script and
   *   the same "load exactly once" promise; racing it with a second loader would fetch 2.26 MB
   *   twice on cards/binder.html, which loads both. Where Card3D is absent this does its own
   *   injection, so market.html and the deck do not have to pull in a card renderer they never
   *   show. */
  var _engine = null;
  function engine() {
    if (global.pc) return Promise.resolve(global.pc);
    if (global.Card3D && Card3D.engine) return Card3D.engine(BASE);
    if (_engine) return _engine;
    _engine = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = url('vendor/playcanvas/playcanvas.min.js');
      s.onload = function () { global.pc ? res(global.pc) : rej(new Error('engine loaded but no pc')); };
      s.onerror = function () { rej(new Error('engine blocked')); };
      document.head.appendChild(s);
    });
    return _engine;
  }

  /* ── materials ────────────────────────────────────────────────────────────────────────────
   * The baked pair straight off media/site/. Textures are shared across every prop on a page —
   * three props asking for `steel` upload one texture, not three.
   *
   * ⚑ THE ALBEDO IS TAGGED sRGB AND THE NORMAL IS NOT, and getting that backwards is the exact
   *   bug card3d.js documents: bytes uploaded as linear when they are sRGB lift the mid-tones and
   *   desaturate everything. A tangent normal is DATA — tagging it sRGB would bend the vectors. */
  var _tex = {};
  function texture(pc, device, path, srgb) {
    var key = path + (srgb ? '|s' : '');
    if (_tex[key]) return _tex[key];
    var opts = { mipmaps: true, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT,
                 anisotropy: 4 };
    if (srgb && pc.PIXELFORMAT_SRGBA8 !== undefined) opts.format = pc.PIXELFORMAT_SRGBA8;
    var t;
    try { t = new pc.Texture(device, opts); }
    catch (e) { t = new pc.Texture(device, { mipmaps: true }); }
    if (srgb && 'srgb' in t) t.srgb = true;
    var img = new Image();
    img.onload = function () { try { t.setSource(img); } catch (e) {} };
    img.onerror = function () {};          // no map ⇒ a plain lit solid, which is still an object
    img.src = url(path);
    _tex[key] = t;
    return t;
  }

  /* Every surface in every prop comes from here, so "what the studio's metal looks like" has one
   * definition. `tile` is how many times the 512² map repeats across one world unit. */
  var STOCK = {
    vinyl: { map: 'vinyl', tile: 1.4, diffuse: [1, 1, 1], gloss: 0.30, metal: 0.05, bump: 1.0 },
    steel: { map: 'steel', tile: 2.0, diffuse: [1, 1, 1], gloss: 0.74, metal: 0.85, bump: 0.7 },
    pulp:  { map: 'pulp',  tile: 1.6, diffuse: [1, 1, 1], gloss: 0.16, metal: 0.00, bump: 0.9 },
    // untextured accents: the card faces and the chips. Colour is passed in per call.
    paint: { map: null,    tile: 1,   diffuse: [1, 1, 1], gloss: 0.42, metal: 0.10, bump: 0 },
    chip:  { map: 'steel', tile: 3.0, diffuse: [1, .82, .23], gloss: 0.86, metal: 0.95, bump: 0.5 }
  };

  function material(pc, app, kind, tint, tileMul) {
    var s = STOCK[kind] || STOCK.paint;
    var m = new pc.StandardMaterial();
    /* ⚑ `diffuse` MULTIPLIES `diffuseMap` in a StandardMaterial, so a tint is not a repaint — it
     *   is the card's colour riding on top of the paper's own tooth and halftone. That is why the
     *   deck's seven cards are seven tints of ONE baked map rather than seven flat colours. */
    var d = tint || s.diffuse;
    m.diffuse = new pc.Color(d[0], d[1], d[2]);
    m.useMetalness = true;
    m.metalness = s.metal;
    m.gloss = s.gloss;
    if (s.map) {
      var k = s.tile * (tileMul || 1);
      m.diffuseMap = texture(pc, app.graphicsDevice, 'media/site/' + s.map + '-albedo.webp', true);
      m.normalMap = texture(pc, app.graphicsDevice, 'media/site/' + s.map + '-normal.webp', false);
      m.bumpiness = s.bump;
      m.diffuseMapTiling = new pc.Vec2(k, k);
      m.normalMapTiling = new pc.Vec2(k, k);
    }
    m.update();
    return m;
  }

  /* ── prop builders ────────────────────────────────────────────────────────────────────────
   * Each returns { camera:[x,y,z], look:[x,y,z], spin, tiltGain } and hangs its geometry off
   * `root`. Everything is a PlayCanvas primitive — nothing is fetched, so a prop cannot 404.  */
  var PROPS = {};

  function part(pc, parent, type, scale, pos, rot, mat) {
    var e = new pc.Entity();
    e.addComponent('render', { type: type, castShadows: true, receiveShadows: true });
    e.setLocalScale(scale[0], scale[1], scale[2]);
    e.setLocalPosition(pos[0], pos[1], pos[2]);
    if (rot) e.setLocalEulerAngles(rot[0], rot[1], rot[2]);
    if (mat) e.render.material = mat;
    parent.addChild(e);
    return e;
  }

  /* THE FOLDER — a three-ring binder, open a crack, cards inside.
   * ⚑ The covers are hinged on the SPINE rather than posed at an angle, so "open" is one number
   *   and the two leaves cannot drift out of agreement with each other. */
  PROPS.binder = function (pc, app, root) {
    var vinyl = material(pc, app, 'vinyl');
    var steel = material(pc, app, 'steel');
    var CARD = [[.17, 1, .50], [1, .17, .85], [.60, .17, 1], [1, .82, .23], [.94, .35, .90]];

    part(pc, root, 'box', [0.17, 2.05, 0.30], [0, 0, 0], null, vinyl);      // spine

    [-1, 1].forEach(function (side) {
      var hinge = new pc.Entity();
      hinge.setLocalPosition(side * 0.08, 0, 0);
      hinge.setLocalEulerAngles(0, side * 34, 0);        // the crack it stands open at
      root.addChild(hinge);
      part(pc, hinge, 'box', [1.42, 2.05, 0.055], [side * 0.71, 0, 0], null, vinyl);
      // a card sticking out of each leaf, so the object says "cards" before you read anything
      part(pc, hinge, 'box', [0.86, 1.30, 0.022], [side * 0.72, 0.06, side * 0.055],
        [0, 0, side * 2.5], material(pc, app, 'pulp', CARD[side > 0 ? 0 : 1], 1.6));
    });

    // the rings. A torus lies in XZ by default, which is exactly the plane a ring binder's rings
    // occupy when the spine is vertical — no rotation needed, and none invented.
    [-0.62, 0, 0.62].forEach(function (y) {
      part(pc, root, 'torus', [0.34, 0.34, 0.34], [0, y, 0], null, steel);
    });

    // loose cards behind the leaves, fanned — depth in the silhouette rather than a flat slab
    for (var i = 0; i < 3; i++) {
      part(pc, root, 'box', [0.80, 1.20, 0.018], [(i - 1) * 0.10, -0.05 - i * 0.03, -0.16 - i * 0.03],
        [0, 0, (i - 1) * 6], material(pc, app, 'pulp', CARD[i + 2], 1.6));
    }

    return { camera: [1.5, 1.35, 3.5], look: [0, 0, 0], spin: 7, tiltGain: 13 };
  };

  /* THE MARKET BENCH — a brushed steel top with a card standing in a holder, a short stack, and
   * a few chips. It is the counter you deal across, not a shop window. */
  PROPS.bench = function (pc, app, root) {
    var steel = material(pc, app, 'steel');
    var vinyl = material(pc, app, 'vinyl');

    part(pc, root, 'box', [3.0, 0.13, 1.9], [0, -0.62, 0], null, steel);            // the top
    part(pc, root, 'box', [3.04, 0.30, 0.09], [0, -0.80, 0.95], null, vinyl);       // front lip
    [-1.3, 1.3].forEach(function (x) {                                              // legs
      part(pc, root, 'cylinder', [0.11, 0.55, 0.11], [x, -1.02, -0.55], null, steel);
    });

    // the card on show, standing in a rigid holder — the toploader is two thin steel jaws
    var stand = new pc.Entity();
    stand.setLocalPosition(-0.45, 0.10, 0.10);
    stand.setLocalEulerAngles(-13, -18, 0);
    root.addChild(stand);
    part(pc, stand, 'box', [0.92, 1.34, 0.030], [0, 0, 0], null,
      material(pc, app, 'pulp', [0.17, 1, 0.50], 1.6));
    part(pc, stand, 'box', [1.00, 1.42, 0.012], [0, 0, -0.026], null, steel);
    part(pc, stand, 'box', [1.02, 0.10, 0.10], [0, -0.72, 0], null, steel);         // the foot

    // a short stack lying flat — what you brought to trade
    for (var i = 0; i < 4; i++) {
      part(pc, root, 'box', [0.86, 0.026, 1.24], [0.92, -0.52 + i * 0.030, 0.16],
        [0, 6 - i * 4, 0], material(pc, app, 'pulp', [0.60, 0.55, 0.95], 1.6));
    }
    // chips. Gold, and deliberately only three: this is the anti-casino, not a pile of winnings.
    for (var c = 0; c < 3; c++) {
      part(pc, root, 'cylinder', [0.26, 0.035, 0.26], [1.02, -0.52 + c * 0.075, -0.62],
        [0, c * 22, 0], material(pc, app, 'chip'));
    }

    return { camera: [0.35, 1.25, 3.6], look: [0, -0.20, 0], spin: 5, tiltGain: 10 };
  };

  /* THE DECK — a fan of cards on a pulp mat. The deck page is the loud one, so this prop is the
   * palette rather than the material: seven cards, seven colours off that page's own tiers. */
  PROPS.stack = function (pc, app, root) {
    var mat = material(pc, app, 'pulp', null, 2.2);
    part(pc, root, 'box', [3.1, 0.06, 2.1], [0, -0.55, 0], null, mat);

    var COL = [[1, .37, .82], [.39, .70, 1], [.61, .89, .31], [1, .91, .23],
               [1, .60, .23], [1, .29, .29], [.61, .36, 1]];
    for (var i = 0; i < COL.length; i++) {
      var a = (i - (COL.length - 1) / 2);
      var e = part(pc, root, 'box', [0.90, 0.030, 1.30],
        [a * 0.30, -0.48 + i * 0.034, -a * 0.055], [0, a * 9, 0],
        material(pc, app, 'pulp', COL[i], 1.6));
      void e;
    }
    // one card standing proud of the fan — the pull
    part(pc, root, 'box', [0.92, 1.34, 0.032], [0.05, 0.36, -0.62], [-16, -9, 4],
      material(pc, app, 'pulp', [1, .91, .23], 1.6));

    /* ⚠ This one lives on a BRIGHT YELLOW board. The dark-page ambient would make it a black
     *   hole punched in the page, and the phosphor/magenta rim lights would be a different
     *   studio's neon on a MAD-magazine spread. Warm, high ambient, gentle rim: printed card
     *   stock under a room light, which is what the page is pretending to be. */
    return { camera: [0.1, 1.5, 3.4], look: [0, -0.15, 0], spin: 6, tiltGain: 11,
             ambient: [0.42, 0.40, 0.35],
             lights: { rim: [1, .86, .55], fill: [.95, .70, .40], keyIntensity: 1.9 } };
  };

  /* ── the rig ──────────────────────────────────────────────────────────────────────────────
   * ⚑ COLOUR MANAGEMENT IS COPIED FROM card3d.js DELIBERATELY, not re-derived: sRGB swap chain,
   *   tonemapping NONE. These props sit next to real card art on the same pages; if the two paths
   *   disagreed about transfer functions the prop would read as a different studio's render.
   * ⚑ The key light RAKES (a low, off-axis angle). A normal map lit head-on flattens to a swatch
   *   — the same thing js/bg-foil.js says about the foil, for the same reason. */
  function build(pc, host, o) {
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

    var app;
    try {
      app = new pc.Application(canvas, { graphicsDeviceOptions: { alpha: true, antialias: true } });
    } catch (e) { return null; }
    if (!app.graphicsDevice) return null;

    if ('gammaCorrection' in app.scene) app.scene.gammaCorrection = pc.GAMMA_SRGB;
    if ('toneMapping' in app.scene) app.scene.toneMapping = pc.TONEMAP_NONE;
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);

    var root = new pc.Entity('prop');
    app.root.addChild(root);
    var spec;
    try { spec = (PROPS[o.prop] || PROPS.binder)(pc, app, root); }
    catch (e) { try { app.destroy(); } catch (e2) {} return null; }

    var cam = new pc.Entity('cam');
    cam.addComponent('camera', { clearColor: new pc.Color(0, 0, 0, 0), fov: o.fov || 32,
                                 nearClip: 0.1, farClip: 40 });
    cam.setPosition(spec.camera[0], spec.camera[1], spec.camera[2]);
    cam.lookAt(spec.look[0], spec.look[1], spec.look[2]);
    app.root.addChild(cam);

    var key = new pc.Entity('key');
    key.addComponent('light', { type: 'directional', color: new pc.Color(1, .97, .92),
      intensity: o.keyIntensity || 1.35, castShadows: true, shadowBias: 0.2,
      shadowDistance: 16, shadowResolution: 1024, normalOffsetBias: 0.05 });
    key.setEulerAngles(54, 152, 0);
    app.root.addChild(key);

    var rim = new pc.Entity('rim');
    rim.addComponent('light', { type: 'omni', color: new pc.Color(.16, .95, .55),
      intensity: o.rimIntensity || 2.1, range: 12 });
    rim.setPosition(-2.4, 1.4, -1.8);
    app.root.addChild(rim);

    var fill = new pc.Entity('fill');
    fill.addComponent('light', { type: 'omni', color: new pc.Color(1, .16, .85),
      intensity: o.fillIntensity || 1.2, range: 11 });
    fill.setPosition(2.6, -0.6, 2.0);
    app.root.addChild(fill);

    /* ⚑ AMBIENT BELONGS TO THE PROP, NOT TO THE MODULE. Two of these props sit on near-black
     *   pages where ambient must stay low — three real lights already supply direction and a flat
     *   ambient on top of them is the "wash" card3d.js spent two passes removing. The deck's fan
     *   sits on a bright yellow board, where a near-black object reads as a hole punched in the
     *   page. So the builder returns its own value and the module has no opinion. */
    var amb = o.ambient || spec.ambient || [0.06, 0.07, 0.07];
    app.scene.ambientLight = new pc.Color(amb[0], amb[1], amb[2]);
    if (spec.lights) {
      if (spec.lights.rim) rim.light.color = new pc.Color(spec.lights.rim[0], spec.lights.rim[1], spec.lights.rim[2]);
      if (spec.lights.fill) fill.light.color = new pc.Color(spec.lights.fill[0], spec.lights.fill[1], spec.lights.fill[2]);
      if (spec.lights.keyIntensity) key.light.intensity = spec.lights.keyIntensity;
    }

    /* ⚑ SIZE IT WHEN IT HAS A SIZE. Same trap card3d.js documents: a host that is still laying
     *   out measures 0×0, and code that sizes once and hopes renders into a zero canvas forever.
     *   Retry on animation frames, then watch the box. */
    var sized = false;
    function fit() {
      var r = host.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      app.graphicsDevice.maxPixelRatio = Math.min(global.devicePixelRatio || 1, dprCap());
      app.resizeCanvas(r.width, r.height);
      sized = true;
      return true;
    }
    if (!fit()) {
      var tries = 0;
      (function retry() { if (sized || tries++ > 120) return; if (!fit()) requestAnimationFrame(retry); })();
    }
    var onResize = function () { fit(); };
    addEventListener('resize', onResize, { passive: true });
    var ro = null;
    if (global.ResizeObserver) {
      try { ro = new ResizeObserver(function () { fit(); }); ro.observe(host); } catch (e) { ro = null; }
    }

    /* motion. Reduced motion keeps the object and drops the idle turn — it is a lit thing, not an
     * animation, and the pointer still moves it because that is a direct response to the user. */
    var still = reduced();
    var tilt = { x: 0, y: 0 }, tx = 0, ty = 0, t = 0;
    var spin = still ? 0 : spec.spin;
    var gain = spec.tiltGain;

    function onPointer(e) {
      var r = host.getBoundingClientRect();
      if (!r.width) return;
      tilt.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      tilt.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    }
    function onLeave() { tilt.x = 0; tilt.y = 0; }
    host.addEventListener('pointermove', onPointer, { passive: true });
    host.addEventListener('pointerleave', onLeave, { passive: true });

    app.on('update', function (dt) {
      t += dt;
      // ease toward the pointer rather than snapping — a prop that tracks exactly reads as a toy
      tx += (tilt.x - tx) * Math.min(1, dt * 6);
      ty += (tilt.y - ty) * Math.min(1, dt * 6);
      root.setLocalEulerAngles(-ty * gain * 0.6 + (still ? 0 : Math.sin(t * 0.31) * 2.2),
                               tx * gain + t * spin,
                               tx * -2.0);
    });
    app.start();

    host.appendChild(canvas);

    /* ── pause when nobody is looking ─────────────────────────────────────────────────────────
     * A decorative object must not spend a phone's battery while it is scrolled past or while the
     * tab is in the background. `autoRender=false` stops the whole frame, not just the spin. */
    var seen = true;
    function live() { app.autoRender = seen && !document.hidden; }
    var io = null;
    if (global.IntersectionObserver) {
      try {
        io = new IntersectionObserver(function (ents) {
          seen = ents.some(function (x) { return x.isIntersecting; });
          live();
        }, { rootMargin: '120px' });
        io.observe(host);
      } catch (e) { io = null; }
    }
    var onVis = function () { live(); };
    document.addEventListener('visibilitychange', onVis);

    // a lost context must not leave a dead rectangle where the fallback used to be
    var onLost = function (e) {
      e.preventDefault();
      host.classList.remove('is3d');
      try { canvas.remove(); } catch (e2) {}
    };
    canvas.addEventListener('webglcontextlost', onLost);

    // `is3d` is what the page's CSS keys the static fallback off — set only now, with a real
    // canvas in the DOM and a frame already drawn.
    host.classList.add('is3d');

    var ctrl = {
      app: app, root: root, canvas: canvas, prop: o.prop,
      key: key, rim: rim, fill: fill, cam: cam,       // by name, so a headless check can isolate one
      resize: fit,
      destroy: function () {
        removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        host.removeEventListener('pointermove', onPointer);
        host.removeEventListener('pointerleave', onLeave);
        if (io) { try { io.disconnect(); } catch (e) {} }
        if (ro) { try { ro.disconnect(); } catch (e) {} }
        try { app.destroy(); } catch (e) {}
        host.classList.remove('is3d');
      }
    };
    (global.__site3d = global.__site3d || []).push(ctrl);
    return ctrl;
  }

  /* ── mounting ─────────────────────────────────────────────────────────────────────────────
   * Resolves with null rather than rejecting. A caller should not have to write a catch to keep
   * its own page working; "no prop" is a normal outcome here, not an error. */
  function mount(host, opts) {
    var o = opts || {};
    if (!host || host.__site3d) return Promise.resolve(null);
    host.__site3d = true;
    if (saveData()) return Promise.resolve(null);
    return engine().then(function (pc) {
      var ctrl = null;
      try { ctrl = build(pc, host, o); } catch (e) { ctrl = null; }
      return ctrl;
    }).catch(function () { return null; });
  }

  /* Declarative: `data-site3d="binder"` on an element that already contains its own fallback.
   * ⚠ The engine fetch waits for the host to come near the viewport AND for the browser to be
   *   idle. A 2.26 MB script racing the page's own images on first paint is a worse page, not a
   *   richer one — and a prop below the fold should cost nothing at all until it is scrolled to. */
  function auto() {
    var hosts = document.querySelectorAll('[data-site3d]');
    for (var i = 0; i < hosts.length; i++) (function (h) {
      var go = function () {
        var idle = global.requestIdleCallback || function (f) { return setTimeout(f, 200); };
        idle(function () { mount(h, { prop: h.getAttribute('data-site3d') }); });
      };
      if (!global.IntersectionObserver) { go(); return; }
      try {
        var io = new IntersectionObserver(function (ents) {
          if (ents.some(function (x) { return x.isIntersecting; })) { io.disconnect(); go(); }
        }, { rootMargin: '300px' });
        io.observe(h);
      } catch (e) { go(); }
    })(hosts[i]);
  }

  global.Site3D = { mount: mount, engine: engine, PROPS: PROPS, auto: auto };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
  else auto();
})(window);

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
   * Every prop surface is the SAME Blender bake the flat DOM is tiled with (media/site/*), so
   * the object in the header and the panel under the cursor are made of one material. Textures
   * are cached module-wide, so three props asking for `steel` upload one texture, not three.
   *
   * ⛔ THE BRIGHTNESS AND THE TINT ARE BAKED INTO THE PIXELS AT UPLOAD, NOT SET AS `diffuse`.
   *   That is not the obvious way and it is not a preference — `material.diffuse` provably never
   *   reaches a MAPPED surface in this engine build. Measured, frozen pose, nothing else changed:
   *   with the albedo attached, `diffuse` at 1, at 6.2 and at 60 produced byte-identical frames
   *   (object mean 5.2 every time); with the same map removed, the same three values rendered
   *   101 / 169 / clipped. `diffuseTint` reads back `true` — in 2.21 its getter is hard-wired to
   *   return true and its setter does nothing — so there is no flag to fix, and nothing anywhere
   *   reports a problem. It cost most of a debugging pass, so: if a mapped surface is the wrong
   *   colour, change the PIXELS.
   *
   * ⚑ WHY THERE IS A LIFT AT ALL. `vinyl` bakes to mean luma 23.7 and `steel` to 97 because those
   *   numbers were chosen to sit UNDER PARAGRAPHS — any brighter and the small dim print on these
   *   pages stops being readable (scripts/build-site-props.mjs bounds exactly that). A lit object
   *   has the opposite problem: 1% reflectance under a directional light is a black rectangle,
   *   which is precisely what the first build of the binder prop was. Real vinyl is not 1%
   *   reflectance; the bake is dark because of where the FLAT PAGE puts it. One bake, two jobs,
   *   and the job with lights in it says so out loud.
   *   ⚠ The lift is applied in LINEAR light, not on the sRGB bytes — decode, multiply, re-encode.
   *     Multiplying the bytes would flatten the material's own tonal shape, which is the one
   *     thing the bake exists to carry.
   *
   * ⚠ TINTED COPIES ARE REAL MEMORY. The deck's seven card colours are seven textures, so they
   *   are rasterised at TEX_PX rather than the bake's 512: these props are at most 300 CSS px on
   *   screen and 256² is already more texels than any of them can show. Seven 512s would be 7 MB
   *   of GPU memory for a decoration. */
  var TEX_PX = 256;
  var _tex = {};

  function s2l(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function l2s(v) {
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  }

  /* Redraw the loaded map at TEX_PX, with `lift` and `tint` applied in linear light.
   *
   * ⛔ EVERY map goes through this canvas — the normals and the untinted albedos included, even
   *   though they need no pixel work at all. The point is not the pixels, it is the SIZE. The
   *   pc.Texture is constructed with explicit `width`/`height` (see texture(), and it has to be),
   *   so handing it a source of a different size gives a texture that samples BLACK. This
   *   function used to short-circuit and return the raw 512² image whenever there was nothing to
   *   compute, which is exactly the surfaces that came out black — the deck's mat and the market
   *   bench's top — while the tinted cards sitting ON them rendered perfectly, because those took
   *   the canvas path. A fast path that returns a DIFFERENT SHAPE is not a fast path. */
  function shade(img, lift, tint) {
    var c = document.createElement('canvas');
    c.width = c.height = TEX_PX;
    var x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return img;
    x.drawImage(img, 0, 0, TEX_PX, TEX_PX);
    if (lift === 1 && !tint) return c;
    var d;
    try { d = x.getImageData(0, 0, TEX_PX, TEX_PX); } catch (e) { return c; }
    var p = d.data, k = tint || [1, 1, 1];
    for (var i = 0; i < p.length; i += 4) {
      p[i]     = l2s(s2l(p[i])     * lift * k[0]);
      p[i + 1] = l2s(s2l(p[i + 1]) * lift * k[1]);
      p[i + 2] = l2s(s2l(p[i + 2]) * lift * k[2]);
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  function texture(pc, device, path, lift, tint) {
    var key = path + '|' + lift + '|' + (tint ? tint.join(',') : '');
    if (_tex[key]) return _tex[key];
    var t;
    try {
      t = new pc.Texture(device, {
        width: TEX_PX, height: TEX_PX, format: pc.PIXELFORMAT_RGBA8, mipmaps: false,
        minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT
      });
    } catch (e) { return null; }
    var img = new Image();
    img.onload = function () { try { t.setSource(shade(img, lift, tint)); } catch (e) {} };
    img.onerror = function () {};   // no map ⇒ a plain lit solid, which is still an object
    img.src = url(path);
    _tex[key] = t;
    return t;
  }

  /* One definition of what each of the studio's surfaces is. `tile` is how many times the map
   * repeats across one world unit; `lift` is described above. */
  var STOCK = {
    vinyl: { map: 'vinyl', tile: 0.9, lift: 7.5,  gloss: 0.34, metal: 0.05, bump: 1.0 },
    /* ⚠ steel is deliberately NOT a mirror. There is no environment map in these scenes, and a
     *   high-metalness surface with nothing to reflect renders as black plus specular sparkle —
     *   at metal 0.85 / gloss 0.74 / bump 0.7 the bench top came out as glitter, 0.6% of the
     *   frame clipped to pure white. Brushed metal that only has to READ as metal at 190px wants
     *   a low metalness and a soft highlight. (Same lesson card3d.js records from the other end:
     *   a metal bevel with no environment is just a grey edge.) */
    steel: { map: 'steel', tile: 1.2, lift: 1.35, gloss: 0.42, metal: 0.25, bump: 0.22 },
    pulp:  { map: 'pulp',  tile: 1.0, lift: 1.0,  gloss: 0.16, metal: 0.00, bump: 0.9 },
    // untextured accent — colour comes from the call, and with no map `diffuse` works normally
    paint: { map: null,    tile: 1,   lift: 1.0,  gloss: 0.42, metal: 0.10, bump: 0 },
    chip:  { map: 'steel', tile: 1.8, lift: 1.8,  gloss: 0.62, metal: 0.55, bump: 0.3,
             base: [1, .78, .20] }
  };

  function material(pc, app, kind, tint, tileMul) {
    var s = STOCK[kind] || STOCK.paint;
    var m = new pc.StandardMaterial();
    m.useMetalness = true;
    m.metalness = s.metal;
    m.gloss = s.gloss;
    if (s.map) {
      /* the tint MULTIPLIES the bake rather than replacing it, which is how the deck's seven
       * cards are seven colours of ONE paper stock instead of seven flat swatches */
      var k = null, base = s.base || null;
      if (tint || base) {
        var a = tint || [1, 1, 1], b = base || [1, 1, 1];
        k = [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
      }
      var rep = s.tile * (tileMul || 1);
      m.diffuse = new pc.Color(1, 1, 1);
      m.diffuseMap = texture(pc, app.graphicsDevice, 'media/site/' + s.map + '-albedo.webp', s.lift, k);
      // ⚠ the normal is DATA: never lifted, never tinted, or the vectors bend
      m.normalMap = texture(pc, app.graphicsDevice, 'media/site/' + s.map + '-normal.webp', 1, null);
      m.bumpiness = s.bump;
      m.diffuseMapTiling = new pc.Vec2(rep, rep);
      m.normalMapTiling = new pc.Vec2(rep, rep);
    } else {
      var d = tint || [1, 1, 1];
      m.diffuse = new pc.Color(d[0], d[1], d[2]);
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

    /* ⚑ FRAME THE OBJECT, NOT ITS INSIDE. At fov 32 a camera 3.5 away sees 2.0 world units of
     *   height — and an open binder IS 2.05 tall, so the first version filled the canvas edge to
     *   edge with cover and read as a black rectangle rather than as a binder. The distance is
     *   derived from the size now: ~2.7x the tallest dimension leaves the silhouette room to be
     *   a silhouette, which is the entire job of a prop this small. */
    return { camera: [2.05, 1.70, 4.90], look: [0, -0.05, 0], spin: 7, tiltGain: 13 };
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
        [0, 6 - i * 4, 0], material(pc, app, 'pulp', [0.46, 0.42, 0.78], 1.4));
    }
    // chips. Gold, and deliberately only three: this is the anti-casino, not a pile of winnings.
    for (var c = 0; c < 3; c++) {
      part(pc, root, 'cylinder', [0.26, 0.035, 0.26], [1.02, -0.52 + c * 0.075, -0.62],
        [0, c * 22, 0], material(pc, app, 'chip'));
    }

    /* ⚠ a lower key than the default rig. This prop's subject is PAPER — a bright stock — where the
     *   binder's is near-black vinyl, and the same 2.6 that makes vinyl readable clipped the card
     *   stack here to flat white across 0.6% of the frame. Exposure follows the subject. */
    return { camera: [0.55, 1.75, 6.20], look: [0, -0.34, 0], spin: 5, tiltGain: 10,
             lights: { keyIntensity: 1.6 } };
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
      part(pc, root, 'box', [0.90, 0.030, 1.30],
        [a * 0.30, -0.48 + i * 0.034, -a * 0.055], [0, a * 9, 0],
        material(pc, app, 'pulp', COL[i], 1.6));
    }
    // one card standing proud of the fan — the pull
    part(pc, root, 'box', [0.92, 1.34, 0.032], [0.05, 0.36, -0.62], [-16, -9, 4],
      material(pc, app, 'pulp', [1, .91, .23], 1.6));

    /* ⚠ This one lives on a BRIGHT YELLOW board. The dark-page ambient would make it a black
     *   hole punched in the page, and the phosphor/magenta rim lights would be a different
     *   studio's neon on a MAD-magazine spread. Warm, high ambient, gentle rim: printed card
     *   stock under a room light, which is what the page is pretending to be. */
    return { camera: [0.15, 1.85, 4.60], look: [0, -0.18, 0], spin: 6, tiltGain: 11,
             ambient: [0.30, 0.29, 0.25],
             lights: { rim: [1, .86, .55], fill: [.95, .70, .40], keyIntensity: 1.15 } };
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
    /* ⚑ COLOUR MANAGEMENT LIVES ON THE CAMERA IN PLAYCANVAS 2.x, NOT ON THE SCENE. `scene
     *   .gammaCorrection` and `scene.toneMapping` were the 1.x home and they are simply GONE in
     *   2.21 — an `'x' in app.scene` guard around them does not fail, it silently does nothing,
     *   so the card art and these props would both be rendering with whatever the default is
     *   rather than with the sRGB decision card3d.js documents. Set it where it exists now and
     *   keep the scene path for an older engine. Tonemapping stays NONE for the same reason it
     *   does on the card: these are finished, flat-lit studio colours, not HDR renders. */
    if ('gammaCorrection' in cam.camera) cam.camera.gammaCorrection = pc.GAMMA_SRGB;
    else if ('gammaCorrection' in app.scene) app.scene.gammaCorrection = pc.GAMMA_SRGB;
    if ('toneMapping' in cam.camera) cam.camera.toneMapping = pc.TONEMAP_NONE;
    else if ('toneMapping' in app.scene) app.scene.toneMapping = pc.TONEMAP_NONE;
    cam.setPosition(spec.camera[0], spec.camera[1], spec.camera[2]);
    cam.lookAt(spec.look[0], spec.look[1], spec.look[2]);
    app.root.addChild(cam);

    /* ⚑ AIM THE LIGHTS WITH lookAt, NOT WITH EULER ANGLES. The first version copied card3d.js's
     *   `setEulerAngles(52, 158, 0)` — correct there, because that scene is one flat plane at the
     *   origin facing the camera. Here it produced a key whose forward vector was
     *   (−0.28, +0.81, +0.52): the light was shining UPWARD, lighting the underside of every prop
     *   and leaving the camera's side of the object completely black. That is what "the prop is a
     *   black rectangle" actually was — not the dark albedo, which was the second cause. A light
     *   placed in the world and told to look at the subject cannot point the wrong way, and its
     *   direction stays right if a prop's framing ever changes. */
    function aim(e, x, y, z) { e.setPosition(x, y, z); e.lookAt(spec.look[0], spec.look[1], spec.look[2]); }

    var key = new pc.Entity('key');
    key.addComponent('light', { type: 'directional', color: new pc.Color(1, .97, .92),
      intensity: o.keyIntensity || 2.6, castShadows: true, shadowBias: 0.2,
      shadowDistance: 16, shadowResolution: 1024, normalOffsetBias: 0.05 });
    aim(key, 3.2, 4.6, 4.0);            // upper front-right: raking across the relief, not head-on
    app.root.addChild(key);

    var rim = new pc.Entity('rim');
    rim.addComponent('light', { type: 'omni', color: new pc.Color(.16, .95, .55),
      intensity: o.rimIntensity || 3.0, range: 14 });
    rim.setPosition(-2.6, 1.6, -2.2);   // phosphor, behind and left: picks the silhouette out
    app.root.addChild(rim);

    var fill = new pc.Entity('fill');
    fill.addComponent('light', { type: 'omni', color: new pc.Color(1, .16, .85),
      intensity: o.fillIntensity || 1.8, range: 12 });
    fill.setPosition(2.8, -1.0, 2.4);   // acid, low and right: keeps the recesses off dead black
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

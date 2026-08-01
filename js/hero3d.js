/* ripmaster3030studios — the hero wordmark as real 3D type, lit live.
 *
 *   RipHeroType.mount()    idempotent; called automatically
 *   RipHeroType.stop()     tear down; the page returns to exactly how it looks without this file
 *   RipHeroType.state()    { phase, why, … } — what the headless check reads
 *
 * WHAT IT IS. `media/hero/type.glb` is RIPMASTER3030STUDIOS cut from the repo's own Anton
 * outlines, extruded and bevelled in Blender (scripts/blender/build-hero-type.py), with a baked
 * foil plate for its face. This file hangs a transparent canvas over the CSS wordmark, renders
 * that mesh into it, and turns it under a warm key.
 *
 * ⚑ THE CSS WORDMARK IS NOT REPLACED — IT IS COVERED, AND ONLY AFTER A FRAME HAS ACTUALLY DRAWN.
 *   That is not politeness, it is the whole failure model. This page's wordmark is TYPE on
 *   purpose (see the long comment in index.html: the rebrand shipped and was invisible because
 *   the name was baked into a bitmap). Swapping it back for a picture of type would re-open that
 *   hole. So the real string stays in the DOM — selectable, searchable, read by a screen reader,
 *   and rendered normally on any browser that does not get all the way here. The element is only
 *   faded to `opacity:0` — never `display:none`, never `visibility:hidden`, both of which would
 *   take it out of the accessibility tree — at the moment the 3D layer is proven to be painting.
 *
 * ⚑ FAILS OPEN AT EVERY STEP, and there are a lot of steps: no WebGL2, an engine that never
 *   loads, a 404 on the GLB or either texture, a mesh missing a named part, a lost context, a
 *   throw anywhere in build(). Every one of them lands in the same place — the CSS wordmark,
 *   untouched. PlayCanvas has no software fallback, so WebGL2 is a hard requirement and this
 *   file checks for it BEFORE spending 2.4 MB on the engine.
 *
 * ⚑ THE FACE IS EMISSIVE, THE EDGES ARE LIT. This is card3d.js's lesson applied to type: a
 *   wordmark is a finished piece of colour, and three coloured lights multiplied over it would
 *   re-grade the palette into mud (green key x magenta paint = brown). So the FACE carries the
 *   baked gradient as an emissive map — it arrives exactly as the CSS gradient always did — and
 *   the three-dimensionality comes from specular highlights travelling over the baked relief plus
 *   the extrusion WALLS, which are a separate object with a real metal material and are where the
 *   site's green/magenta/cyan lights do their work. Face keeps the identity, edges do the depth.
 *
 * ⚠ NO ENVIRONMENT MAP, deliberately — "THE WASH, SECOND EDITION" in CLAUDE.md. A StandardMaterial
 *   samples an env for ambient specular too, and on a flat face that lands as a milky sheen that
 *   lifts blacks and drops saturation. The travelling highlight comes from the key light, which
 *   is directional and moves as the type turns; a flat ambient sheen never did that job.
 */
(() => {
  'use strict';

  const SEL = '.marquee-art.wordmark';       // the masthead only — the intro splash keeps CSS type
  const GLB = 'media/hero/type.glb';
  const ALB = 'media/hero/type-albedo.webp';
  const NRM = 'media/hero/type-normal.webp';

  /* ⚑ THE CAMERA IS PLACED BY DISTANCE AND THE FOV IS SOLVED FOR — never the other way round,
   *   and this cost a render. Fixing fov and solving for distance is the obvious form and it is
   *   wrong here, because the canvas is a ~5:1 STRIP: a 19° vertical fov on it is a ~76°
   *   HORIZONTAL fov, which puts the camera 0.6 units from a wordmark 1.0 unit wide. At that
   *   range a few degrees of yaw swings the far end of the word right out of frame — the first
   *   render read "RIPMASTER3030STUDIO", the exact failure index.html already records for the
   *   CSS wordmark, arrived at from a completely different direction. Pinning the distance in
   *   units of the type's own width fixes the strength of the perspective, and the fov then
   *   falls out of the box it has to fill. `maxYaw()` below is asserted against the frame. */
  const CAM_D = 3.2;            // camera distance, in wordmark widths
  const OVER_X = 1.12;          // canvas overscan, so a turned letter never clips at the ends
  const OVER_Y = 1.85;          // vertical room for the tilt and the specular bloom
  /* ⚑ THE SWAY IS CENTRED OFF-AXIS, and that is the difference between 3D type and a picture of
   *   type. Dead-on, an extrusion shows NO side wall and no bevel highlight — the first build
   *   swayed through 0° and for the fraction of a second it passed through square it was
   *   indistinguishable from the CSS wordmark it had just replaced. Holding a small permanent
   *   turn means an edge is always lit and the letters always have a thickness. */
  const BASE_Y = -5.0;          // permanent yaw, degrees
  const BASE_X = -2.5;          // permanent pitch — top tipped toward the viewer, so the key
                                //   light lands on the TOP wall of every stroke
  const SWAY_Y = 4.5;           // idle yaw amplitude, degrees
  const SWAY_X = 2.0;           // idle pitch amplitude
  const POINT_Y = 6.0;          // extra yaw from the pointer
  const POINT_X = 4.0;
  const FPS = 30;               // a wordmark does not need 60; this halves the cost of the layer
  const REST = { x: BASE_X - 1.5, y: BASE_Y - 3.5 };   // still pose, under prefers-reduced-motion
  const maxYaw = () => Math.abs(BASE_Y) + SWAY_Y + POINT_Y;
  const maxPitch = () => Math.abs(BASE_X) + SWAY_X + POINT_X;

  /* ⚠ Resolve against THIS SCRIPT's URL, not document.baseURI — the same trap bg-foil.js records.
   *   The assets live at the site root; a page in a subdirectory would resolve `media/hero/...`
   *   against its own path and silently 404 into the fallback. */
  const SELF = (document.currentScript && document.currentScript.src) || '';
  const BASE = SELF ? SELF.replace(/js\/hero3d\.js.*$/, '') : document.baseURI;
  const url = p => new URL(p, BASE).href;

  const S = { phase: 'idle', why: '', frames: 0, w: 0, h: 0, dpr: 1, aspect: 0, fov: 0, parts: '' };
  let app = null, canvas = null, el = null, prevOpacity = null, stopped = false, io = null, ro = null;
  /* Dev hook, in the manner of ronin's `__rn._brawl`: force a pose so a headless run can shoot
   * the WORST case rather than whatever the sway happened to be doing. The frame check in
   * scripts/build-hero-type.mjs drives it to RipHeroType.pose(maxPitch, ±maxYaw). */
  let poseFn = null;

  const q = k => { try { return new URLSearchParams(location.search).get(k); } catch { return null; } };
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const thrifty = () => {
    try {
      const c = navigator.connection;
      return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
    } catch { return false; }
  };
  const dprCap = () => { try { return (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2; } catch { return 2; } };

  /* Probe for WebGL2 on a throwaway canvas and hand the context straight back. PlayCanvas 2.x has
   * no WebGL1 path, so without this the only way to discover an old browser is to download the
   * engine first and watch it fail. */
  function hasWebGL2() {
    try {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
      if (!g) return false;
      const lose = g.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch { return false; }
  }

  /* The engine is 2.4 MB raw / ~598 KB gzipped and is the same file every 3D surface here uses,
   * so it loads exactly once. Card3D owns the canonical loader; defer to it when the page has it
   * rather than racing a second <script> for the same URL. */
  let _engine = null;
  function engine() {
    if (window.pc) return Promise.resolve(window.pc);
    if (window.Card3D && Card3D.engine) return Card3D.engine(BASE);
    if (_engine) return _engine;
    _engine = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url('vendor/playcanvas/playcanvas.min.js');
      s.onload = () => window.pc ? res(window.pc) : rej(new Error('engine loaded but no pc'));
      s.onerror = () => rej(new Error('engine blocked'));
      document.head.appendChild(s);
    });
    return _engine;
  }

  const idle = fn => (window.requestIdleCallback
    ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 900));

  /* ⚠ Measure the box AFTER the webfont lands. The wordmark is set in Anton (vendored, see
   *   index.html); measured mid-swap the box is the fallback face's width and the canvas is
   *   built to the wrong size. `fonts.ready` is the only honest signal, and it resolves
   *   immediately on browsers that do not have the API. */
  const fontsReady = () => {
    try { return document.fonts ? document.fonts.ready : Promise.resolve(); }
    catch { return Promise.resolve(); }
  };

  function texFor(pc, device, img, linear) {
    const opts = { mipmaps: true, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE };
    /* A colour map is sRGB data; a NORMAL MAP is not — its bytes are a vector, and pushing them
     * through a transfer function bends the surface. Same call, two jobs, one flag. */
    if (!linear && pc.PIXELFORMAT_SRGBA8 !== undefined) opts.format = pc.PIXELFORMAT_SRGBA8;
    let t;
    try { t = new pc.Texture(device, opts); }
    catch { t = new pc.Texture(device, { mipmaps: true }); }
    if (!linear && 'srgb' in t) t.srgb = true;
    t.setSource(img);
    return t;
  }

  const loadImage = src => new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('img ' + src));
    i.decoding = 'async';
    i.src = url(src);
  });

  const loadGlb = (pc, src) => new Promise((res, rej) => {
    try {
      app.assets.loadFromUrl(url(src), 'container', (err, asset) =>
        (err || !asset) ? rej(new Error('glb ' + (err || 'missing'))) : res(asset));
    } catch (e) { rej(e); }
  });

  function fail(why) {
    S.phase = 'fallback'; S.why = why;
    teardown();
    return null;
  }

  function teardown() {
    poseFn = null;
    if (io) { try { io.disconnect(); } catch {} io = null; }
    if (ro) { try { ro.disconnect(); } catch {} ro = null; }
    if (app) { try { app.destroy(); } catch {} app = null; }
    if (canvas) { try { canvas.remove(); } catch {} canvas = null; }
    if (el && prevOpacity !== null) { el.style.opacity = prevOpacity; prevOpacity = null; }
  }

  async function mount() {
    if (stopped || S.phase !== 'idle') return;
    if (!document.body) { addEventListener('DOMContentLoaded', mount, { once: true }); return; }

    el = document.querySelector(SEL);
    if (!el) return fail('no wordmark');
    if (q('no3d') !== null) return fail('opt-out');
    if (thrifty()) return fail('save-data');
    if (!hasWebGL2()) return fail('no webgl2');

    S.phase = 'loading';
    await fontsReady();
    await new Promise(r => idle(r));
    if (stopped) return;

    let pc;
    try { pc = await engine(); } catch (e) { return fail(String(e && e.message || e)); }
    if (stopped) return;
    try { return build(pc); } catch (e) { return fail('build: ' + (e && e.message || e)); }
  }

  function build(pc) {
    const stage = el.parentNode;
    if (!stage) return fail('no stage');
    // the canvas is absolutely positioned over the wordmark; the row has to be a containing block
    try { if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative'; } catch {}

    canvas = document.createElement('canvas');
    canvas.id = 'heroType';
    canvas.setAttribute('aria-hidden', 'true');
    /* The halo the CSS wordmark wears comes from two drop-shadows; keep them, on the canvas, or
     * the type loses the glow that separates it from the foil background behind it. */
    canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;opacity:0;' +
      'transition:opacity .45s ease;display:block;' +
      'filter:drop-shadow(0 0 18px rgba(43,255,128,.34)) drop-shadow(0 0 36px rgba(255,42,217,.20));';
    stage.appendChild(canvas);

    try {
      app = new pc.Application(canvas, {
        graphicsDeviceOptions: {
          alpha: true, antialias: true, depth: true, powerPreference: 'low-power',
          // ?grab=1 keeps the drawing buffer so a headless run can read the REAL pixels.
          // CLAUDE.md: this container's screenshot path rotates hue on canvas content.
          preserveDrawingBuffer: q('grab') !== null,
        },
      });
    } catch (e) { return fail('app: ' + (e && e.message || e)); }
    if (!app || !app.graphicsDevice) return fail('no device');

    if ('gammaCorrection' in app.scene) app.scene.gammaCorrection = pc.GAMMA_SRGB;
    if ('toneMapping' in app.scene) app.scene.toneMapping = pc.TONEMAP_NONE;
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);

    const cam = new pc.Entity('cam');
    cam.addComponent('camera', { clearColor: new pc.Color(0, 0, 0, 0), fov: 8, nearClip: 0.05, farClip: 60 });
    if ('gammaCorrection' in cam.camera) cam.camera.gammaCorrection = pc.GAMMA_SRGB;
    if ('toneMapping' in cam.camera) cam.camera.toneMapping = pc.TONEMAP_NONE;
    app.root.addChild(cam);

    /* Three lights, the same cast bg-foil.js runs over the background so the wordmark belongs to
     * the same room: a warm-white KEY (warm, not green — see the header: a coloured key would
     * re-grade the palette), an acid fill from below-opposite so the walls are never dead black,
     * and a near-grazing cyan rim that picks the top edge of every letter out of the dark. */
    const lamp = (name, col, intensity, angles) => {
      const e = new pc.Entity(name);
      e.addComponent('light', { type: 'directional', color: new pc.Color(...col), intensity, castShadows: false });
      e.setEulerAngles(...angles);
      app.root.addChild(e);
      return e;
    };
    const key = lamp('key', [1, .97, .93], 2.2, [-24, 34, 0]);
    lamp('fill', [1, .165, .851], 1.15, [26, -140, 0]);
    lamp('rim', [.153, .969, .894], 1.35, [8, 200, 0]);
    app.scene.ambientLight = new pc.Color(0.06, 0.10, 0.08);

    const root = new pc.Entity('wordmark');
    app.root.addChild(root);

    // ── materials ─────────────────────────────────────────────────────────────────────────────
    const face = new pc.StandardMaterial();
    /* The extrusion walls. Dark body, bright specular: a foil stamp's edge is bare metal, and
     * against the near-black page a dark body with a travelling highlight reads as an edge where
     * a bright one would just fatten the letters. ⚠ Not FULLY black — the small emissive floor
     * is what stops an unlit wall from collapsing into the drop-shadow behind it and taking the
     * thickness with it. */
    const rim = new pc.StandardMaterial();
    rim.diffuse = new pc.Color(0.085, 0.135, 0.105);
    rim.emissive = new pc.Color(0.016, 0.045, 0.028);
    rim.specular = new pc.Color(0.80, 0.92, 0.85);
    rim.gloss = 0.76;
    rim.useMetalness = false;
    rim.update();

    let ready = 0;
    Promise.all([loadImage(ALB), loadImage(NRM)]).then(([a, n]) => {
      if (!app) return;
      const d = app.graphicsDevice;
      face.emissiveMap = texFor(pc, d, a, false);
      face.emissive = new pc.Color(1, 1, 1);
      face.emissiveIntensity = 0.82;
      /* A little diffuse under the emissive so the bevel and the tilt still MEAN something —
       * a purely emissive face is a flat sticker no matter how good the geometry is. Neutral
       * grey rather than the albedo, so the lights add value without adding hue. */
      face.diffuse = new pc.Color(0.20, 0.21, 0.20);
      face.normalMap = texFor(pc, d, n, true);
      face.bumpiness = 0.85;
      face.specular = new pc.Color(0.92, 0.98, 0.95);
      face.gloss = 0.86;
      face.useMetalness = false;
      face.update();
      ready |= 1;
    }).catch(e => { S.why = 'tex: ' + (e && e.message || e); ready |= 1; });   // untextured, still 3D

    // ── the mesh ──────────────────────────────────────────────────────────────────────────────
    loadGlb(pc, GLB).then(asset => {
      if (!app) return;
      const inst = asset.resource.instantiateRenderEntity();
      const named = {};
      inst.forEach(e => { if (e.render && e.render.meshInstances.length) named[e.name] = e; });
      S.parts = Object.keys(named).join(',');
      /* Named parts are the contract with build-hero-type.py, the same way dogfight's GLB parts
       * are. A GLB that loads but carries the wrong names must not half-render. */
      if (!named.wm_face || !named.wm_rim) { inst.destroy(); return fail('glb parts: ' + S.parts); }
      named.wm_face.render.meshInstances.forEach(m => { m.material = face; });
      named.wm_rim.render.meshInstances.forEach(m => { m.material = rim; });
      root.addChild(inst);

      // fit from MEASURED bounds, never from a number typed twice
      app.root.syncHierarchy();
      let lo = null, hi = null;
      inst.forEach(e => {
        if (!e.render) return;
        e.render.meshInstances.forEach(m => {
          const b = m.aabb, c = b.center, h = b.halfExtents;
          const a = [c.x - h.x, c.y - h.y, c.z - h.z], z = [c.x + h.x, c.y + h.y, c.z + h.z];
          if (!lo) { lo = a.slice(); hi = z.slice(); return; }
          for (let i = 0; i < 3; i++) { if (a[i] < lo[i]) lo[i] = a[i]; if (z[i] > hi[i]) hi[i] = z[i]; }
        });
      });
      if (!lo || !(hi[0] - lo[0])) return fail('empty bounds');
      const w = hi[0] - lo[0], h = hi[1] - lo[1];
      S.aspect = w / h;
      inst.setLocalPosition(-(lo[0] + hi[0]) / 2 / w, -(lo[1] + hi[1]) / 2 / w, -(lo[2] + hi[2]) / 2 / w);
      inst.setLocalScale(1 / w, 1 / w, 1 / w);         // uniform: the type is now exactly 1 wide
      ready |= 2;
      fit();
    }).catch(e => fail(String(e && e.message || e)));

    // ── layout ────────────────────────────────────────────────────────────────────────────────
    /* The canvas is sized from the CSS wordmark's own box every time it changes, so the 3D type
     * lands exactly where the type it replaces was. Width is the wordmark's width; height is
     * whatever the mesh's aspect needs plus room to turn. */
    function fit() {
      if (!app || !el || !canvas) return false;
      const wr = el.getBoundingClientRect(), sr = el.parentNode.getBoundingClientRect();
      if (!wr.width) return false;
      const cw = Math.round(wr.width * OVER_X);
      const ch = Math.round(Math.max(wr.height, S.aspect ? wr.width / S.aspect : wr.height) * OVER_Y);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      canvas.style.left = Math.round(wr.left - sr.left - (cw - wr.width) / 2) + 'px';
      canvas.style.top = Math.round(wr.top - sr.top + wr.height / 2 - ch / 2) + 'px';
      S.dpr = Math.min(window.devicePixelRatio || 1, dprCap());
      app.graphicsDevice.maxPixelRatio = S.dpr;
      app.resizeCanvas(cw, ch);
      S.w = cw; S.h = ch;

      /* The fov is DERIVED, not tuned: at the fixed distance CAM_D, what vertical angle puts the
       * type's 1.0 width across `wr.width` of a canvas `cw` wide with this canvas aspect? Change
       * the box, the overscan or the device pixel ratio and the type still lands exactly on the
       * type it is covering. */
      const halfW = cw / (2 * Math.max(1, wr.width));       // half-width to frame, in model units
      const hh = halfW / (cw / ch);                         // ... as a half-HEIGHT
      const fov = Math.max(1, Math.min(40, 2 * Math.atan(hh / CAM_D) * 180 / Math.PI));
      cam.camera.fov = fov;
      S.fov = +fov.toFixed(3);
      cam.setPosition(0, 0, CAM_D);
      cam.lookAt(0, 0, 0);
      key.setEulerAngles(-24, 34, 0);
      return true;
    }

    // ── motion ────────────────────────────────────────────────────────────────────────────────
    const still = reduced();
    let tx = 0, ty = 0, cx = BASE_X, cy = BASE_Y, t0 = 0, last = -1e9, live = true;
    if (!still) {
      addEventListener('pointermove', e => {
        const r = canvas && canvas.getBoundingClientRect();
        if (!r || !r.height) return;
        const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(1, innerWidth / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / Math.max(1, innerHeight / 2);
        tx = Math.max(-1, Math.min(1, dy)) * POINT_X;
        ty = Math.max(-1, Math.min(1, dx)) * POINT_Y;
      }, { passive: true });
    }

    app.autoRender = false;
    let held = null;
    poseFn = (px, py) => {
      held = (px === null) ? null : { x: px, y: py };
      if (held) { root.setLocalEulerAngles(held.x, held.y, 0); app.renderNextFrame = true; }
      return true;
    };
    app.on('update', () => {
      if (ready !== 3) return;
      if (held) { app.renderNextFrame = true; return; }
      const now = performance.now();
      if (!t0) t0 = now;
      if (still) {
        if (S.frames) return;                       // reduced motion: lit and 3D, simply not moving
        root.setLocalEulerAngles(REST.x, REST.y, 0);
        app.renderNextFrame = true;
        return;
      }
      if (!live || document.hidden) return;
      if (now - last < 1000 / FPS) return;
      last = now;
      const s = (now - t0) / 1000;
      // two periods that do not divide into each other, so the sway never returns to a pose
      const sy = BASE_Y + Math.sin(s * 0.37) * SWAY_Y + ty;
      const sx = BASE_X + Math.sin(s * 0.23 + 1.1) * SWAY_X + tx;
      cy += (sy - cy) * 0.06;
      cx += (sx - cx) * 0.06;
      root.setLocalEulerAngles(cx, cy, Math.sin(s * 0.17) * 0.7);
      app.renderNextFrame = true;
    });

    /* Reveal only once a frame has really been drawn — this is the moment the CSS wordmark may
     * safely be faded out, and not one moment earlier. */
    app.on('frameend', () => {
      S.frames++;
      if (S.frames !== 1) return;
      S.phase = 'live';
      canvas.style.opacity = '1';
      if (prevOpacity === null) prevOpacity = el.style.opacity || '';
      el.style.transition = 'opacity .45s ease';
      el.style.opacity = '0';
    });

    app.start();
    fit();

    // resize / reflow
    const onResize = () => { fit(); if (!still) last = -1e9; app.renderNextFrame = true; };
    addEventListener('resize', onResize, { passive: true });
    try { ro = new ResizeObserver(onResize); ro.observe(el); } catch { ro = null; }
    // a webfont landing after mount changes the box under us
    try { if (document.fonts) document.fonts.ready.then(onResize); } catch {}

    // don't animate a wordmark nobody is looking at
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = -1e9; } });
    try {
      io = new IntersectionObserver(es => { live = es.some(e => e.isIntersecting); }, { threshold: 0 });
      io.observe(el);
    } catch { io = null; }

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      fail('context lost');                 // fail() restores the CSS wordmark
    });

    return true;
  }

  function stop() { stopped = true; S.phase = 'stopped'; teardown(); }

  window.RipHeroType = {
    mount, stop,
    state: () => Object.assign({}, S),
    limits: () => ({ yaw: maxYaw(), pitch: maxPitch(), overX: OVER_X, overY: OVER_Y }),
    pose: (x, y) => !!(poseFn && poseFn(x, y)),
  };
  try { mount(); } catch (e) { fail('mount: ' + (e && e.message || e)); }
})();

/* upperdeckripmaster3030 — THE ARENA, on the PlayCanvas engine: the STAGE (CBArena).
 *
 * `js/cbpc-fight.js` owns the fighters, the projectiles and the public API. This file owns the
 * room they fight in: the sunburst backdrop, the floor, the pylons, the lights, the camera rig and
 * the post stack. The split is the same one Section 9 uses (`js/s9pc-app.js` vs `js/s9pc-fx.js`) —
 * the thing that knows the rules must not also know the shader.
 *
 * ── THE LOOK, and why it is not the other games' look ─────────────────────────────────────────
 * Section 9 is a gritty tactical shooter and its post stack was tuned for that: chromatic
 * aberration, grain, a heavy vignette, a restrained bloom. Every one of those works BACKWARDS here.
 * The arena is MAD magazine and a cereal box and a casino floor — bright, high-key, saturated, flat
 * colour fields with hard silhouettes on top of them. Noise is the enemy of a flat colour field.
 * So this stack SUBTRACTS (fringing 0, grain 0, a whisper of vignette) and pushes saturation and
 * bloom instead, which is `s9pc-app.js`'s own `CLEAN` argument taken all the way.
 *
 * ⚑ NO `worldMirror` NODE HERE, AND THAT IS DELIBERATE — see the note on the camera below. Section
 *   9 needed one because it has a pre-existing LEFT-handed game basis to reconcile. This scene is
 *   authored directly in engine coordinates, so there is nothing to reconcile; the only external
 *   convention is "you on the left, the house on the right", which comes from the DOM grid. That
 *   is verified numerically rather than assumed (`probe().sides`).
 */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;

  /* ── procedural textures ────────────────────────────────────────────────────────────────────
   * Everything the stage is made of is generated here. Nothing is fetched: the fight opens inside
   * a modal that is already up, and a texture that arrives late is a stage that pops in halfway
   * through the first exchange. Canvas is also the only way to get genuinely FLAT colour fields —
   * a photographic texture would drag the whole frame toward the muddy realism the brief rules out.
   */
  function tex(pc, device, canvas, opts) {
    opts = opts || {};
    var o = { mipmaps: opts.mipmaps !== false,
      addressU: opts.repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: opts.repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE };
    /* sRGB tagging, exactly as js/card3d.js does it. CLAUDE.md records what happens without it:
     * the engine reads sRGB bytes as linear, which lifts the mid-tones and desaturates everything.
     * These are hand-drawn colour fields, so they suffer from it the same way card art does. */
    if (pc.PIXELFORMAT_SRGBA8 !== undefined && opts.srgb !== false) o.format = pc.PIXELFORMAT_SRGBA8;
    var t;
    try { t = new pc.Texture(device, o); }
    catch (e) { t = new pc.Texture(device, { mipmaps: true }); }
    if ('srgb' in t && opts.srgb !== false) t.srgb = true;
    t.setSource(canvas);
    return t;
  }
  function cv(size) { var c = document.createElement('canvas'); c.width = c.height = size; return c; }

  /* The backdrop: a carnival sunburst. Wedges, not a gradient — a gradient is a lighting effect
   * and reads as depth, which is the opposite of what a flat field is for. */
  function sunburstCanvas(S, wedges, colA, colB, ringCol) {
    var c = cv(S), x = c.getContext('2d'), R = S * 0.78;
    x.fillStyle = colA; x.fillRect(0, 0, S, S);
    x.save(); x.translate(S / 2, S / 2);
    x.fillStyle = colB;
    for (var i = 0; i < wedges; i++) {
      var a0 = (i * 2) * TAU / (wedges * 2), a1 = a0 + TAU / (wedges * 2);
      x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R * 1.6, a0, a1); x.closePath(); x.fill();
    }
    // concentric rings pull the eye to the centre of the fight line, where the clash happens
    x.globalAlpha = 0.5; x.strokeStyle = ringCol;
    for (var r = 0.10; r < 1.0; r += 0.135) { x.lineWidth = S * 0.012; x.beginPath(); x.arc(0, 0, R * r, 0, TAU); x.stroke(); }
    x.globalAlpha = 1;
    var g = x.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
    g.addColorStop(0, 'rgba(255,255,255,.92)'); g.addColorStop(0.55, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, R * 0.42, 0, TAU); x.fill();
    x.restore();
    return c;
  }

  /* The floor: a bold grid over a saturated field, with the lines getting a bright core so they
   * read as neon tube rather than as a drawn line. Tiles, so one 512 texture covers 40 units. */
  function floorCanvas(S, base, line, hot) {
    var c = cv(S), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    var step = S / 4;
    for (var i = 0; i <= 4; i++) {
      x.strokeStyle = line; x.lineWidth = S * 0.020;
      x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, S); x.moveTo(0, i * step); x.lineTo(S, i * step); x.stroke();
      x.strokeStyle = hot; x.lineWidth = S * 0.007;
      x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, S); x.moveTo(0, i * step); x.lineTo(S, i * step); x.stroke();
    }
    // a scatter of confetti dots — enough to stop the tile reading as a repeat at a glance
    for (var k = 0; k < 26; k++) {
      x.globalAlpha = 0.22 + Math.random() * 0.3;
      x.fillStyle = k % 3 === 0 ? hot : line;
      x.beginPath(); x.arc(Math.random() * S, Math.random() * S, S * (0.004 + Math.random() * 0.008), 0, TAU); x.fill();
    }
    return c;
  }

  /* A stripe strip for the pylons — arcade cabinet marquee, straight off a cereal box. */
  function stripeCanvas(S, a, b) {
    var c = cv(S), x = c.getContext('2d');
    x.fillStyle = a; x.fillRect(0, 0, S, S);
    x.fillStyle = b; x.save(); x.translate(S / 2, S / 2); x.rotate(-0.45); x.translate(-S, -S);
    for (var i = 0; i < 16; i++) x.fillRect(i * S / 8, 0, S / 16, S * 2);
    x.restore();
    return c;
  }

  /* ── the room ───────────────────────────────────────────────────────────────────────────────
   * PALETTE is the page's own (`cards/battle.html` :root): acid lime, cyan, hot magenta, amber on
   * near-black. Taking a bright direction does NOT mean taking somebody else's colours — the
   * arena has to still look like this studio's arena when the modal around it is acid green.
   */
  var PAL = {
    you:   '#2bff80',   // --lime
    house: '#ff2ad9',   // --magenta
    amber: '#ffd23b',
    cyan:  '#27f7e4',
    deep:  '#12002a',
  };

  function build(pc, app, opt) {
    opt = opt || {};
    var dev = app.graphicsDevice;
    var root = new pc.Entity('cb-arena'); app.root.addChild(root);
    var mats = [];
    function mat(props) { var m = new pc.StandardMaterial(); Object.assign(m, props); m.update(); mats.push(m); return m; }
    function quad(name, w, h) {
      var e = new pc.Entity(name);
      e.addComponent('render', { type: 'plane', castShadows: false, receiveShadows: false });
      e.setLocalEulerAngles(90, 0, 0);              // a pc 'plane' lies in XZ; stand it up (as js/card3d.js does)
      e.setLocalScale(w, 1, h);
      return e;
    }

    // ── backdrop ────────────────────────────────────────────────────────────────────────────
    var burst = quad('backdrop', 84, 50);
    var burstTex = tex(pc, dev, sunburstCanvas(512, 18, '#46106b', '#ff2ad9', '#ffd23b'));
    /* Emissive at full, diffuse black: the backdrop is a printed field, not a lit surface. If it
     * took the key light it would gain a gradient, the gradient would read as depth, and the
     * silhouettes in front of it would stop being silhouettes. */
    burst.render.material = mat({ emissiveMap: burstTex, emissive: new pc.Color(0.46, 0.46, 0.46),
      diffuse: new pc.Color(0, 0, 0), useSkybox: false, useLighting: false });
    burst.setLocalPosition(0, 3.2, -19);
    root.addChild(burst);

    // a darker curtain behind everything so the backdrop's edges never show the clear colour
    var curtain = quad('curtain', 160, 90);
    curtain.render.material = mat({ diffuse: new pc.Color(0, 0, 0), emissive: new pc.Color(0.05, 0.01, 0.09),
      useSkybox: false, useLighting: false });
    curtain.setLocalPosition(0, 12, -34);
    root.addChild(curtain);

    // ── floor ───────────────────────────────────────────────────────────────────────────────
    var floor = new pc.Entity('floor');
    floor.addComponent('render', { type: 'plane', castShadows: false, receiveShadows: true });
    floor.setLocalScale(56, 1, 40);
    var floorTex = tex(pc, dev, floorCanvas(512, '#08301e', '#17a85c', '#2bff80'), { repeat: true });
    /* Half lit, half printed. Pure emissive would kill the contact between a card and the ground;
     * pure diffuse would let the floor fall dark at the edges and lose the flat field. */
    floor.render.material = mat({ diffuseMap: floorTex, diffuse: new pc.Color(0.50, 0.56, 0.52),
      emissiveMap: floorTex, emissive: new pc.Color(0.10, 0.115, 0.105),
      diffuseMapTiling: new pc.Vec2(7, 5), emissiveMapTiling: new pc.Vec2(7, 5),
      gloss: 0.42, metalness: 0.12, useMetalness: true, useSkybox: false });
    floor.setLocalPosition(0, 0, -2);
    root.addChild(floor);

    // ── side pylons: the cabinet marquee, and the only vertical in the frame ─────────────────
    var stripeTex = tex(pc, dev, stripeCanvas(256, '#ffd23b', '#ff2ad9'), { repeat: true });
    var pylonMat = mat({ emissiveMap: stripeTex, emissive: new pc.Color(0.42, 0.42, 0.42),
      diffuse: new pc.Color(0.02, 0.02, 0.02), emissiveMapTiling: new pc.Vec2(1, 5), useSkybox: false, useLighting: false });
    [-1, 1].forEach(function (s) {
      [0, 1].forEach(function (k) {
        var p = new pc.Entity('pylon');
        p.addComponent('render', { type: 'box', castShadows: false });
        p.setLocalScale(0.5, 8.5, 0.5);
        p.setLocalPosition(s * (8.6 + k * 3.1), 4.25, -6 - k * 4.2);
        p.render.material = pylonMat;
        root.addChild(p);
      });
    });

    // ── the ropes: two glowing bars along the fight line, so depth has something to read against
    var ropeYou = mat({ diffuse: new pc.Color(0, 0, 0), emissive: new pc.Color().fromString(PAL.you), useSkybox: false, useLighting: false });
    var ropeHouse = mat({ diffuse: new pc.Color(0, 0, 0), emissive: new pc.Color().fromString(PAL.house), useSkybox: false, useLighting: false });
    [[-1, ropeYou], [1, ropeHouse]].forEach(function (r) {
      [3.6, -5.2].forEach(function (z, i) {
        var e = new pc.Entity('rope');
        e.addComponent('render', { type: 'box', castShadows: false });
        e.setLocalScale(9.5, 0.10, 0.10);
        e.setLocalPosition(r[0] * 5.2, 0.10 + i * 0.02, z);
        e.render.material = r[1];
        root.addChild(e);
      });
    });

    // ── lights ──────────────────────────────────────────────────────────────────────────────
    /* HIGH-KEY MEANS AMBIENT GOES UP, not that the key goes up. A hot key over a dark ambient is
     * exactly the muddy-realism look the brief rules out: it produces deep falloff and a lot of
     * near-black. A bright ambient plus a modest key gives flat, evenly lit colour with just
     * enough shaping to keep the card bevels from disappearing. */
    app.scene.ambientLight = new pc.Color(0.36, 0.37, 0.44);
    var key = new pc.Entity('key');
    key.addComponent('light', { type: 'directional', color: new pc.Color(1, 0.99, 0.96), intensity: 1.35,
      castShadows: false });
    key.setEulerAngles(46, 24, 0);
    root.addChild(key);
    /* Two coloured rims, one per corner, in the side colours. They do the silhouette work: a card
     * on the YOU side picks up lime down its left edge and the house's magenta down its right, so
     * the two ranks separate even where they overlap in depth. */
    var rimYou = new pc.Entity('rimYou');
    rimYou.addComponent('light', { type: 'omni', color: new pc.Color().fromString(PAL.you), intensity: 3.4, range: 22 });
    rimYou.setLocalPosition(-9, 4.2, 3.2); root.addChild(rimYou);
    var rimHouse = new pc.Entity('rimHouse');
    rimHouse.addComponent('light', { type: 'omni', color: new pc.Color().fromString(PAL.house), intensity: 3.4, range: 22 });
    rimHouse.setLocalPosition(9, 4.2, 3.2); root.addChild(rimHouse);
    // a warm centre practical over the clash point — the thing the camera pushes into on a K.O.
    var centre = new pc.Entity('centre');
    centre.addComponent('light', { type: 'omni', color: new pc.Color().fromString(PAL.amber), intensity: 0, range: 12 });
    centre.setLocalPosition(0, 3.8, 1.0); root.addChild(centre);

    // ── camera ──────────────────────────────────────────────────────────────────────────────
    /* ⚑ HANDEDNESS, CHECKED RATHER THAN ASSUMED. CLAUDE.md records that Section 9's port rendered
     * MIRRORED and that it produced three separate bug reports from one cause; the fix there was a
     * `worldMirror` node at (−1,1,1), because a rotation can never repair handedness.
     *
     * There is no such conflict here, and the reason is worth writing down: Section 9 had an
     * existing game world in a LEFT-handed basis (x right, y up, z FORWARD) that had to be
     * reconciled with a right-handed camera. This fight has no prior basis — the 2D version worked
     * in screen pixels, which have no third axis at all — so the scene is authored natively in
     * PlayCanvas coordinates and the question does not arise.
     *
     * What DOES have to hold is the one external convention: `.fo-side.you` is grid column 1 and
     * therefore on the LEFT of the screen, `.fo-side.house` is on the right. So YOU is −x and the
     * house is +x, and with the camera at +z looking toward the origin that must land YOU on the
     * left of the frame. That is not assumed either — `probe().sides` projects both anchors through
     * `worldToScreen` and reports their screen x, which is the same measurement that would have
     * caught the Section 9 bug, expressed in this scene's terms. */
    var camRig = new pc.Entity('camRig');   // orbit/shake live on the rig so the camera keeps a clean local transform
    app.root.addChild(camRig);
    var cam = new pc.Entity('cam');
    cam.addComponent('camera', {
      fov: 32, nearClip: 0.5, farClip: 220,
      clearColor: new pc.Color(0.02, 0.005, 0.05),
      toneMapping: opt.tone != null ? opt.tone : pc.TONEMAP_ACES,
    });
    camRig.addChild(cam);

    var LOOK = new pc.Vec3(0, 1.55, 0);
    var camState = { dist: 11.4, yaw: 0, pitch: 0, shake: 0, punch: 0, bias: 0, t: 0, zoom: 0 };

    /* ⚑ FRAME THE RANK, DO NOT ASSUME A DESKTOP ASPECT — and SOLVE THE FOV, NOT THE DISTANCE.
     * The fight canvas covers the whole face-off overlay, which on a phone is a tall portrait box.
     * The first version held the fov at 32° and solved for distance; measured at 390×844 (aspect
     * 0.462) that asks for a camera 53 units back, the clamp cut it at 30, and the YOU champion
     * projected to screen x = −18.8 — off the left edge of its own arena. Receding is also the wrong
     * cure: at 53 units the cards are specks and the backdrop no longer covers the frame.
     * So the distance is held near 13.5 and the VERTICAL FOV is solved instead, from whichever
     * half-extent is binding, with the fov capped and the distance only pushed out if the cap binds.
     * Same family as the hero-lens `aspect-ratio` trap in CLAUDE.md: correct at one aspect, silently
     * wrong at another, and only a measurement at the second aspect finds it.
     * ⚠ The half-extents are NOT constants — `setExtents` is called with the real bounding box of
     *   the slots that were actually built, so a 1-card stake and a 7-card full slam frame
     *   themselves rather than sharing a guess. */
    var FIT_W = 7.0, FIT_H = 3.1;
    var D0 = 13.5, FOV_MAX = 60, FOV_MIN = 26;
    function setExtents(halfW, halfH) { FIT_W = Math.max(2.4, halfW); FIT_H = Math.max(2.0, halfH); }
    function refit(w, h) {
      var r = (w && h) ? { width: w, height: h } : (dev.clientRect || { width: dev.width, height: dev.height });
      var aspect = Math.max(0.3, (r.width || 1) / (r.height || 1));
      var need = Math.max(FIT_H, FIT_W / aspect);          // half-height that has to fit vertically
      var dist = D0;
      var fov = 2 * Math.atan(need / dist) * 180 / Math.PI;
      if (fov > FOV_MAX) { fov = FOV_MAX; dist = need / Math.tan(FOV_MAX * Math.PI / 360); }
      else if (fov < FOV_MIN) { fov = FOV_MIN; dist = need / Math.tan(FOV_MIN * Math.PI / 360); }
      cam.camera.fov = fov;
      camState.dist = dist + 1.2;
      camState.aspect = aspect;
    }

    var _p = new pc.Vec3();
    function updateCamera(dt) {
      camState.t += dt;
      camState.punch = Math.max(0, camState.punch - dt * 2.6);
      camState.shake = Math.max(0, camState.shake - dt * 3.2);
      camState.bias += ((camState.biasTo || 0) - camState.bias) * Math.min(1, dt * 3);
      /* focus() is a NUDGE, not a state: the camera leans toward whoever just did something and
       * then comes back. Without the decay the first surge would leave the frame permanently
       * off-centre, which reads as the camera being broken rather than as emphasis. */
      camState.biasTo = (camState.biasTo || 0) * Math.max(0, 1 - dt * 1.3);
      camState.zoom += ((camState.zoomTo || 0) - camState.zoom) * Math.min(1, dt * 4.5);
      // a slow figure-of-eight drift: enough that the frame is never dead, small enough that
      // nobody watching notices it happening
      var dr = opt.reduce ? 0 : 1;
      /* ⚠ THE FOCUS LEAN IS SMALL ON PURPOSE. At the first value (0.18 rad of yaw plus 1.5 units of
       * look offset) a K.O. swung the frame far enough that the winning rank projected to screen x
       * 1008 of 1000 — the camera leaned so hard toward the loser that it pushed the winner out of
       * its own victory shot. Measured, then cut to a third. */
      var yaw = Math.sin(camState.t * 0.36) * 0.055 * dr + camState.bias * 0.065;
      var pit = 0.115 + Math.sin(camState.t * 0.27 + 1.1) * 0.022 * dr;
      /* ⚠ The punch dolly is a KICK, not a zoom: at 1.4 units per unit of punch, a busy exchange kept
       * the camera permanently 3.4 units closer than the framing solve assumed and pushed the far
       * rank off the edge (measured: house champion at screen x 960 of 1000). 0.8 with a lower cap
       * keeps the hit landing without renegotiating the composition. */
      var d = camState.dist * (1 - camState.zoom * 0.30) - camState.punch * 0.8;
      var sh = camState.shake;
      var jx = sh ? (Math.random() * 2 - 1) * sh * 0.10 : 0;
      var jy = sh ? (Math.random() * 2 - 1) * sh * 0.07 : 0;
      _p.set(Math.sin(yaw) * Math.cos(pit) * d + jx,
             LOOK.y + Math.sin(pit) * d + 0.55 + jy,
             Math.cos(yaw) * Math.cos(pit) * d);
      cam.setPosition(_p);
      cam.lookAt(LOOK.x + camState.bias * 0.65, LOOK.y + camState.zoom * 0.25, LOOK.z);
      // roll the horizon a hair on a big hit — a fighting game tell, and it costs one number
      if (sh > 0.02) cam.rotateLocal(0, 0, (Math.random() * 2 - 1) * sh * 1.6);
      centre.light.intensity = camState.punch * 3.5;
    }

    // ── post ────────────────────────────────────────────────────────────────────────────────
    var frame = null;
    function buildPost(POST) {
      if (!POST || POST.off) return null;
      try {
        frame = new pc.CameraFrame(app, cam.camera);
        frame.rendering.samples = 1;
        frame.rendering.renderTargetScale = POST.rtScale != null ? POST.rtScale : 1;
        /* ⚑ THE TONEMAPPER IS THE HIGHLIGHT ROLLOFF — GfxPost's measured `knee 0.94`, ported the
         * way `js/s9pc-app.js` ports it. Without a rolloff, additive bloom over a stage this
         * bright clips to flat white and the flat colour fields turn into paper. It is set from
         * a MEASURED sweep, not from taste; see the report for the table.
         * ⚠ This is the one place the fight deliberately parts company with `js/card3d.js`, which
         *   keeps TONEMAP_NONE because "these are finished artworks... ACES would re-grade the
         *   artist's own colour". That is right for the collector's view (the binder viewer and
         *   cards/lens3d.html, which are untouched). It is not right here: in the fight the card is
         *   a FIGHTER inside a bloomed scene, and an unrolled frame clips it. Two different jobs. */
        frame.rendering.toneMapping = POST.tone;
        frame.rendering.sharpness = POST.sharpness;
        frame.bloom.intensity = POST.bloom;
        frame.bloom.blurLevel = 10;
        frame.ssao.type = pc.SSAOTYPE_NONE;      // flat colour fields have nothing for AO to find
        frame.vignette.inner = POST.vignette.inner; frame.vignette.outer = POST.vignette.outer;
        frame.vignette.curvature = POST.vignette.curvature; frame.vignette.intensity = POST.vignette.intensity;
        frame.grading.enabled = true;
        frame.grading.saturation = POST.saturation;
        frame.grading.contrast = 1.0;            // linear-space contrast; see the note in s9pc-app.js
        frame.grading.brightness = 1.0;
        frame.fringing.intensity = POST.fringing;
        frame.update();
      } catch (e) { frame = null; }
      return frame;
    }

    return {
      root: root, cam: cam, camRig: camRig, mats: mats,
      lights: { key: key, rimYou: rimYou, rimHouse: rimHouse, centre: centre },
      PAL: PAL, camState: camState,
      refit: refit, setExtents: setExtents, update: updateCamera, buildPost: buildPost,
      get frame() { return frame; },
      /* hero-moment controls, all additive so two of them can land on the same frame */
      punch: function (n) { camState.punch = Math.min(1.5, camState.punch + n); },
      shake: function (n) { camState.shake = Math.min(3.2, camState.shake + n); },
      focus: function (x) { camState.biasTo = Math.max(-0.8, Math.min(0.8, x)); },
      zoom: function (z) { camState.zoomTo = z; },
      destroy: function () { try { root.destroy(); } catch (e) {} try { camRig.destroy(); } catch (e) {} },
      _tex: { sunburstCanvas: sunburstCanvas, floorCanvas: floorCanvas, stripeCanvas: stripeCanvas, tex: tex },
    };
  }

  global.CBArena = { build: build, PAL: PAL };
})(window);

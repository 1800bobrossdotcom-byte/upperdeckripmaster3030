/* upperdeckripmaster3030 — Section 9 on the PlayCanvas engine (S9PC). EVALUATION BUILD.
 *
 * ⚠⚠ THIS IS A PROTOTYPE FOR A DECISION THAT HAS NOT BEEN MADE. `section9.html` is the game;
 *     this page exists only so the same level, the same bodies and the same weapon can be
 *     looked at through an off-the-shelf engine and compared. It shares NO code with the
 *     shipping renderer and nothing in the shipping game loads it. If the answer is "no",
 *     deleting `section9-pc.html`, `js/s9pc-*.js` and `vendor/playcanvas/` costs nothing.
 *
 * WHAT IS IMPLEMENTED
 *   · a real baked level (models/world/*.wld + .cols.json) with PBR materials
 *   · walk / look / jump / sprint against the level's own AABB set, Section 9's capsule numbers
 *   · three skinned operatives (models/*.skn) posed by the SHIPPING poser, S9Skin.pose()
 *   · models/weapons/m4a1.glb with models/weapons/m4a1_tex.jpg as a genuine albedo map
 *   · a directional key with 3-cascade shadow maps, an IBL environment probe, dozens of
 *     shadow-free omni lights (clustered), SSAO, bloom, ACES tonemapping, vignette, grading
 *
 * WHAT IS NOT
 *   · no combat at all — no weapons fire, damage, bots, AI, HUD, killfeed, netcode, audio,
 *     wager/seat integration, lobby, arena picker, or 2D fallback path
 *   · the operatives walk on the spot; they do not path, aim, shoot or die
 *   · no touch controls, no pointer-lock polish, no mobile tuning beyond the dpr cap
 */
(function () {
  const Q = new URLSearchParams(location.search);
  const num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  const on = (k, d) => (Q.has(k) ? Q.get(k) !== '0' : d);

  const LEVEL = Q.get('level') || 'arcade';
  const WANT_POST = on('post', true);
  const WANT_BODIES = on('bodies', true);
  const WANT_WEAPON = on('weapon', true);
  const SHADOW_RES = num('shadow', 2048);
  const HOLD = on('hold', false);                       // freeze the sim (headless capture)

  const $ = id => document.getElementById(id);
  const canvas = $('pcv');
  const T0 = performance.now();
  const marks = { boot: 0, level: 0, firstFrame: 0, bodies: 0, weapon: 0 };
  const log = [];
  const say = m => { log.push(m); const el = $('boot'); if (el) el.textContent = m; };

  // ── application ───────────────────────────────────────────────────────────────────────────
  const app = new pc.Application(canvas, {
    mouse: new pc.Mouse(canvas),
    keyboard: new pc.Keyboard(window),
    graphicsDeviceOptions: { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance' },
  });
  window.__pcapp = app;
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  /* Reuse OUR mobile resolution policy rather than inventing a second one. GfxPost.dprCap() is
   * the single definition of "weak device" the four WebGL games already share; an engine
   * prototype that quietly renders at a different resolution is not a comparison. */
  const dprCap = (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2;
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, dprCap);
  function fit() { app.resizeCanvas(); }
  addEventListener('resize', fit); fit();
  marks.boot = performance.now() - T0;

  // ── environment: a procedural sky cubemap → skybox + IBL atlas ────────────────────────────
  /* The engine's ambient and its specular reflections both come from this one texture. Our
   * renderer has a sky gradient too, but it is only ever *looked at* — nothing in the scene is
   * lit by it. That difference is most of why metal reads as metal here. */
  const OPEN = LEVEL === 'rooftop';
  const SKY = OPEN
    ? { top: [0.13, 0.07, 0.11], mid: [0.62, 0.29, 0.15], hor: [0.86, 0.57, 0.33], grd: [0.16, 0.12, 0.10] }
    : { top: [0.05, 0.05, 0.08], mid: [0.10, 0.10, 0.14], hor: [0.17, 0.17, 0.21], grd: [0.09, 0.09, 0.11] };
  const SUN = (() => { const v = [-0.5, 0.66, -0.34], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();

  function skyColour(dx, dy, dz) {
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    let c;
    if (dy >= 0) {
      const t = Math.pow(Math.min(1, dy), 0.55);
      c = t < 0.5
        ? SKY.hor.map((h, i) => h + (SKY.mid[i] - h) * (t / 0.5))
        : SKY.mid.map((m, i) => m + (SKY.top[i] - m) * ((t - 0.5) / 0.5));
    } else {
      const t = Math.min(1, -dy * 2.2);
      c = SKY.hor.map((h, i) => h + (SKY.grd[i] - h) * t);
    }
    // sun disc + a wide glow, so the probe carries a directional highlight and not just a wash
    const d = dx * SUN[0] + dy * SUN[1] + dz * SUN[2];
    if (d > 0) {
      const glow = Math.pow(d, 24) * (OPEN ? 3.4 : 1.1) + Math.pow(d, 3) * (OPEN ? 0.22 : 0.10);
      c = c.map((v, i) => v + glow * [1.0, 0.86, 0.62][i]);
    }
    return c;
  }
  function skyCubemap(N) {
    const faces = [];
    const dirs = [
      (s, t) => [1, -t, -s], (s, t) => [-1, -t, s],
      (s, t) => [s, 1, t],   (s, t) => [s, -1, -t],
      (s, t) => [s, -t, 1],  (s, t) => [-s, -t, -1],
    ];
    for (let f = 0; f < 6; f++) {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const s = 2 * (x + 0.5) / N - 1, t = 2 * (y + 0.5) / N - 1;
        const v = dirs[f](s, t), col = skyColour(v[0], v[1], v[2]);
        const o = (y * N + x) * 4;
        // sRGB encode — the atlas generator expects display-referred pixels
        for (let k = 0; k < 3; k++) d[o + k] = Math.min(255, Math.pow(Math.max(0, col[k]), 1 / 2.2) * 255);
        d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0); faces.push(c);
    }
    const tex = new pc.Texture(app.graphicsDevice, {
      name: 's9pc-sky', cubemap: true, width: N, height: N,
      format: pc.PIXELFORMAT_SRGBA8, mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    });
    tex.setSource(faces);
    return tex;
  }

  let envOk = false;
  try {
    const cube = skyCubemap(128);
    const src = pc.EnvLighting.generateLightingSource(cube, { size: 128 });
    app.scene.envAtlas = pc.EnvLighting.generateAtlas(src, { size: 256 });
    app.scene.skybox = cube;
    app.scene.skyboxMip = 0;
    app.scene.skyboxIntensity = OPEN ? 1.0 : 0.9;
    envOk = true;
  } catch (e) { say('env probe failed: ' + e.message); }
  app.scene.ambientLight = new pc.Color(0.05, 0.05, 0.06);       // envAtlas supplies the real fill

  // ── key light + shadows ───────────────────────────────────────────────────────────────────
  const sun = new pc.Entity('sun');
  sun.addComponent('light', {
    type: 'directional',
    color: OPEN ? new pc.Color(1.00, 0.86, 0.60) : new pc.Color(0.84, 0.90, 1.00),
    intensity: OPEN ? 2.6 : 1.9,
    castShadows: true,
    shadowType: pc.SHADOW_PCF3,
    numCascades: 3,
    cascadeDistribution: 0.45,
    shadowDistance: 90,
    shadowResolution: SHADOW_RES,
    shadowBias: 0.05,
    normalOffsetBias: 0.05,
    shadowIntensity: 0.88,
  });
  sun.setPosition(SUN[0] * 100, SUN[1] * 100, SUN[2] * 100);
  sun.lookAt(0, 0, 0);
  app.root.addChild(sun);

  // ── camera ────────────────────────────────────────────────────────────────────────────────
  /* fov 0.97 rad vertical and near 0.06 are section9-gl.js's own numbers, so the two builds
   * frame the same amount of room. Anything else and a side-by-side is a lie. */
  const cam = new pc.Entity('cam');
  cam.addComponent('camera', {
    fov: 0.97 * 180 / Math.PI,
    nearClip: 0.06,
    farClip: 140,
    clearColor: new pc.Color(0.02, 0.02, 0.03),
    toneMapping: pc.TONEMAP_ACES,
  });
  app.root.addChild(cam);

  // ── post stack ────────────────────────────────────────────────────────────────────────────
  let frame = null;
  if (WANT_POST) {
    try {
      frame = new pc.CameraFrame(app, cam.camera);
      frame.rendering.samples = 1;                    // TAA off; MSAA costs more than it buys here
      frame.rendering.toneMapping = pc.TONEMAP_ACES;
      frame.rendering.sharpness = 0.35;
      frame.bloom.intensity = 0.022;
      frame.bloom.blurLevel = 12;
      frame.ssao.type = pc.SSAOTYPE_LIGHTING;
      frame.ssao.intensity = 0.55;
      frame.ssao.radius = 3.2;
      frame.ssao.samples = 10;
      frame.ssao.power = 3.0;
      frame.ssao.minAngle = 12;
      frame.ssao.blurEnabled = true;
      frame.vignette.inner = 0.42; frame.vignette.outer = 1.25;
      frame.vignette.curvature = 0.55; frame.vignette.intensity = 0.42;
      frame.grading.enabled = true;
      frame.grading.saturation = OPEN ? 1.04 : 1.10;
      frame.grading.contrast = 1.04;
      frame.grading.brightness = 1.0;
      frame.fringing.intensity = 1.4;
      frame.update();
    } catch (e) { frame = null; say('post stack failed: ' + e.message); }
  }

  // ── fog ───────────────────────────────────────────────────────────────────────────────────
  app.scene.fog.type = pc.FOG_LINEAR;
  app.scene.fog.color = OPEN ? new pc.Color(0.77, 0.59, 0.41) : new pc.Color(0.40, 0.39, 0.45);

  // ── the world ─────────────────────────────────────────────────────────────────────────────
  const P = { x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, onGround: true, eye: 1.52, h: 1.72 };
  let COL = null, WORLD = null, ops = [], weaponAsset = null, weaponTex = null;
  const keys = {};
  addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
  addEventListener('keyup', e => { keys[e.code] = false; });

  function place(x, z, y) {
    P.x = x; P.z = z;
    P.y = (y != null) ? y : COL.groundAt(x, z, (y != null ? y : 40));
    P.vy = 0; P.onGround = true;
  }

  say('loading ' + LEVEL + '…');
  S9PCWorld.build(app, LEVEL).then(W => {
    WORLD = W; COL = S9PCWorld.collider(W.boxes);
    marks.level = performance.now() - T0;

    const far = Math.max(60, Math.min(190, W.bounds.span * 0.95)) * 1.15;
    cam.camera.farClip = far;
    app.scene.fog.start = far * 0.30; app.scene.fog.end = far * 0.86;
    sun.light.shadowDistance = Math.min(120, far * 0.8);

    // omni lights: every arcade cabinet / rack / prize booth becomes a coloured source. This is
    // the "many small lights" case a forward renderer cannot afford and a clustered one can.
    const HUES = [[1.0, 0.35, 0.72], [0.30, 0.95, 1.0], [0.45, 1.0, 0.55], [1.0, 0.82, 0.28], [0.72, 0.45, 1.0]];
    let lit = 0;
    for (let i = 0; i < W.boxes.length && lit < 46; i++) {
      const b = W.boxes[i];
      if (!/^(cab|skee|claw|prize|rcrate|inlay|rostrum|dish)/i.test(String(b.name || ''))) continue;
      if (i % 2) continue;
      const c = HUES[lit % HUES.length];
      const e = new pc.Entity('glow' + lit);
      e.addComponent('light', {
        type: 'omni', color: new pc.Color(c[0], c[1], c[2]),
        intensity: 1.5, range: 7.5, castShadows: false, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED,
      });
      e.setPosition((b.lo[0] + b.hi[0]) / 2, b.hi[1] + 0.35, (b.lo[2] + b.hi[2]) / 2);
      app.root.addChild(e); lit++;
    }
    W.stats.omni = lit;

    const sp = W.spawns[0] || [0, 0, 0];
    place(num('x', sp[0]), num('z', sp[1]), Q.has('y') ? num('y', 0) : sp[2]);
    P.yaw = num('yaw', 0); P.pitch = num('pitch', 0);

    say('');
    hud();
    if (WANT_BODIES) addBodies(W);
    if (WANT_WEAPON) loadWeapon();
  }).catch(e => { say('LEVEL FAILED: ' + (e && e.message || e)); console.error(e); });

  /* Three operatives — one of each of the three sound archetypes — stood near the first spawns
   * and walking on the spot. There is no AI here on purpose: what is being evaluated is how the
   * bodies LOOK when an engine shades and shadows them, not how they behave. */
  function addBodies(W) {
    const archs = (window.S9Skin ? S9Skin.CAST.map(c => c.arch) : []).slice(0, 3);
    const t0 = performance.now();
    archs.forEach((arch, i) => {
      S9PCSkin.spawn(app, arch).then(h => {
        const sp = W.spawns[(i + 1) % W.spawns.length] || [0, 0, 0];
        h.state = {
          x: sp[0], y: sp[2], z: sp[1], yaw: (i * 2.1) % 6.283, h: 1.72,
          onGround: true, moving: true, sprinting: i === 1, gait: i * 1.7, pitch: -0.05, recoil: 0,
        };
        h.setPose(h.state);
        ops.push(h);
        marks.bodies = performance.now() - T0;
        if (weaponAsset) giveWeapon(h);
        hud();
      }).catch(e => say('body "' + arch + '": ' + e.message));
    });
  }

  // ── the weapon: a real GLB with a real texture ────────────────────────────────────────────
  /* This is the single clearest thing the engine buys. `models/weapons/m4a1.glb` now carries
   * TEXCOORD_0, and `models/weapons/m4a1_tex.jpg` goes on it as an albedo map with a metalness
   * workflow over the top. Our own renderer has no texture path for loaded geometry at all. */
  function loadTexture(url, srgb) {
    return new Promise((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        const t = new pc.Texture(app.graphicsDevice, {
          name: url, width: img.width, height: img.height,
          format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8,
          mipmaps: true, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT,
          minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, anisotropy: 8,
        });
        t.setSource(img); res(t);
      };
      img.onerror = () => rej(new Error('image ' + url));
      img.src = url;
    });
  }

  let gunMat = null;
  function loadWeapon() {
    const t0 = performance.now();
    loadTexture('models/weapons/m4a1_tex.jpg', true).then(tex => {
      weaponTex = tex;
      gunMat = new pc.StandardMaterial();
      gunMat.name = 'm4a1';
      gunMat.diffuseMap = tex;
      gunMat.diffuse = new pc.Color(1, 1, 1);
      gunMat.useMetalness = true;
      gunMat.metalness = 0.62;
      gunMat.gloss = 0.55;
      gunMat.diffuseMapTint = false;
      gunMat.update();
      return new Promise((res, rej) => {
        app.assets.loadFromUrl('models/weapons/m4a1.glb', 'container', (err, asset) => err ? rej(new Error(err)) : res(asset));
      });
    }).then(asset => {
      weaponAsset = asset;
      marks.weapon = performance.now() - t0;
      ops.forEach(giveWeapon);
      makeViewmodel();
      hud();
    }).catch(e => say('weapon: ' + (e && e.message || e)));
  }

  /* Measure the GLB rather than assume it. Longest axis = the barrel line, second = up. The
   * rifle then fits whatever the converter emitted without a hand-tuned magic transform —
   * the same rule `dogfight.html` uses for its craft. */
  let GUNFIT = null;
  function fitWeapon(ent) {
    const aabb = new pc.BoundingBox();
    let first = true;
    ent.findComponents('render').forEach(r => r.meshInstances.forEach(mi => {
      if (first) { aabb.copy(mi.aabb); first = false; } else aabb.add(mi.aabb);
    }));
    if (first) return null;
    const he = aabb.halfExtents, ctr = aabb.center;
    const size = [he.x * 2, he.y * 2, he.z * 2];
    const order = [0, 1, 2].sort((a, b) => size[b] - size[a]);
    const LONG = order[0], UP = order[1];
    const k = 0.86 / (size[LONG] || 1);                    // a carbine is ~0.86 m over the barrel
    return { LONG, UP, k, ctr: [ctr.x, ctr.y, ctr.z], size };
  }

  /* Build one weapon instance, rotated so its barrel runs +z and its top runs +y, then parented
   * where the caller wants it. `flip` reverses the barrel if the converter's axis points aft. */
  function weaponEntity() {
    const ent = weaponAsset.resource.instantiateRenderEntity();
    ent.findComponents('render').forEach(r => {
      r.castShadows = true; r.receiveShadows = true;
      r.meshInstances.forEach(mi => { mi.material = gunMat; mi.castShadow = true; });
    });
    if (!GUNFIT) GUNFIT = fitWeapon(ent);
    const F = GUNFIT; if (!F) return ent;
    const holder = new pc.Entity('m4a1');
    // centre it, then rotate its long axis onto +z and its second axis onto +y
    ent.setLocalPosition(-F.ctr[0], -F.ctr[1], -F.ctr[2]);
    const pivot = new pc.Entity('m4a1-pivot');
    pivot.addChild(ent);
    const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const zAxis = AX[F.LONG].slice(), yAxis = AX[F.UP].slice();
    if (num('wflip', 0)) { zAxis[F.LONG] = -1; }
    const xAxis = [yAxis[1] * zAxis[2] - yAxis[2] * zAxis[1], yAxis[2] * zAxis[0] - yAxis[0] * zAxis[2], yAxis[0] * zAxis[1] - yAxis[1] * zAxis[0]];
    // model axis → world axis is the transpose of [x y z]
    const m = new pc.Mat4();
    m.data.set([xAxis[0], yAxis[0], zAxis[0], 0, xAxis[1], yAxis[1], zAxis[1], 0, xAxis[2], yAxis[2], zAxis[2], 0, 0, 0, 0, 1]);
    const q = new pc.Quat().setFromMat4(m);
    pivot.setLocalRotation(q);
    pivot.setLocalScale(F.k, F.k, F.k);
    holder.addChild(pivot);
    return holder;
  }

  function giveWeapon(h) {
    if (!weaponAsset || h.__gun) return;
    const g = weaponEntity();
    h.entity.addChild(g);                                    // px space — the body's own scale applies
    h.__gun = g;
    h.__placeGun = () => {
      const P2 = h.pose; if (!P2) return;
      const gp = P2.grip, mz = P2.muzzle;
      g.setLocalPosition(gp[0], gp[1], gp[2]);
      const d = [mz[0] - gp[0], mz[1] - gp[1], mz[2] - gp[2]];
      const l = Math.hypot(d[0], d[1], d[2]) || 1;
      g.setLocalScale(S9Skin.H * 0.62, S9Skin.H * 0.62, S9Skin.H * 0.62);   // px → the fit's metres
      g.lookAt(gp[0] + d[0] / l * 10, gp[1] + d[1] / l * 10, gp[2] + d[2] / l * 10);
      // lookAt aims −z at the target; the fit put the barrel on +z, so spin 180°
      g.rotateLocal(0, 180, 0);
    };
    h.__placeGun();
  }

  let viewmodel = null;
  function makeViewmodel() {
    viewmodel = weaponEntity();
    cam.addChild(viewmodel);
    viewmodel.setLocalPosition(0.17, -0.15, 0.34);
    viewmodel.setLocalEulerAngles(0, 182, 0);
    viewmodel.findComponents('render').forEach(r => r.meshInstances.forEach(mi => { mi.castShadow = false; }));
  }

  // ── controller ────────────────────────────────────────────────────────────────────────────
  const MOVE = { accel: 62, walk: 4.6, sprint: 6.9, air: 18, friction: 11, gravity: 26, jump: 7.2 };
  let locked = false;
  canvas.addEventListener('click', () => { if (!locked && canvas.requestPointerLock) canvas.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
  addEventListener('mousemove', e => {
    if (!locked) return;
    P.yaw += e.movementX * 0.0022;
    P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - e.movementY * 0.0022));
  });

  let vx = 0, vz = 0;
  function step(dt) {
    if (!COL) return;
    const f = [Math.sin(P.yaw), 0, Math.cos(P.yaw)], r = [Math.cos(P.yaw), 0, -Math.sin(P.yaw)];
    let mx = 0, mz = 0;
    if (keys.KeyW) { mx += f[0]; mz += f[2]; }
    if (keys.KeyS) { mx -= f[0]; mz -= f[2]; }
    if (keys.KeyD) { mx += r[0]; mz += r[2]; }
    if (keys.KeyA) { mx -= r[0]; mz -= r[2]; }
    const L = Math.hypot(mx, mz); if (L > 0.01) { mx /= L; mz /= L; }
    const top = keys.ShiftLeft || keys.ShiftRight ? MOVE.sprint : MOVE.walk;
    const acc = (P.onGround ? MOVE.accel : MOVE.air) * dt;
    vx += mx * acc; vz += mz * acc;
    const sp = Math.hypot(vx, vz);
    if (sp > top) { const k = top / sp; vx *= k; vz *= k; }
    if (P.onGround && L < 0.05) { const k = Math.max(0, 1 - MOVE.friction * dt); vx *= k; vz *= k; }

    if (keys.Space && P.onGround) { P.vy = MOVE.jump; P.onGround = false; }
    P.vy -= MOVE.gravity * dt;

    let nx = P.x + vx * dt;
    if (COL.hits(nx, P.y, P.z)) { const g = COL.groundAt(nx, P.z, P.y);
      if (g > P.y && g - P.y <= COL.STEP && !COL.hits(nx, g, P.z)) P.y = g; else { vx = 0; nx = P.x; } }
    P.x = nx;
    let nz = P.z + vz * dt;
    if (COL.hits(P.x, P.y, nz)) { const g = COL.groundAt(P.x, nz, P.y);
      if (g > P.y && g - P.y <= COL.STEP && !COL.hits(P.x, g, nz)) P.y = g; else { vz = 0; nz = P.z; } }
    P.z = nz;

    let ny = P.y + P.vy * dt;
    const floor = COL.groundAt(P.x, P.z, Math.max(P.y, ny));
    if (P.vy <= 0 && ny <= floor) { ny = floor; P.vy = 0; P.onGround = true; }
    else { P.onGround = false; if (P.vy > 0 && COL.hits(P.x, ny, P.z)) { ny = P.y; P.vy = 0; } }
    P.y = ny;
  }

  const _qy = new pc.Quat(), _qx = new pc.Quat(), _qr = new pc.Quat();
  function applyCamera() {
    cam.setPosition(P.x, P.y + P.eye, P.z);
    /* Section 9's yaw convention is forward = (sin yaw, 0, cos yaw); PlayCanvas's camera looks
     * down its own −z. Hence the +180°: without it the whole world sits behind you, which is
     * exactly the class of bug the dogfight renderer shipped once (see CLAUDE.md). */
    _qy.setFromAxisAngle(pc.Vec3.UP, P.yaw * 180 / Math.PI + 180);
    _qx.setFromAxisAngle(pc.Vec3.RIGHT, P.pitch * 180 / Math.PI);
    _qr.copy(_qy).mul(_qx);
    cam.setRotation(_qr);
  }

  // ── frame ─────────────────────────────────────────────────────────────────────────────────
  const times = [];
  let frames = 0, tPrev = 0;
  app.on('update', dt => {
    if (frames === 0) { marks.firstFrame = performance.now() - T0; }
    frames++;
    const nowT = performance.now();
    if (tPrev) { times.push(nowT - tPrev); if (times.length > 240) times.shift(); }
    tPrev = nowT;

    if (!HOLD) {
      step(Math.min(0.05, dt));
      for (const h of ops) {
        const s = h.state; if (!s) continue;
        s.gait += dt * (s.sprinting ? 9.5 : 6.2);
        s.pitch = -0.05 + Math.sin(nowT / 1400 + s.yaw) * 0.12;
        h.setPose(s);
        if (h.__placeGun) h.__placeGun();
      }
    }
    applyCamera();
    if (frames % 12 === 0) hud();
  });

  // ── HUD + dev peephole ────────────────────────────────────────────────────────────────────
  function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }
  function hud() {
    const el = $('hud'); if (!el) return;
    const W = WORLD;
    el.innerHTML =
      '<b>' + (W ? W.def.name : '…') + '</b> · PlayCanvas ' + pc.version + ' <span class="dim">(prototype)</span><br>' +
      (W ? W.stats.tris.toLocaleString() + ' tris · ' + W.stats.parts + ' PBR materials · ' + (W.stats.omni || 0) + ' omni lights<br>' : '') +
      ops.length + ' skinned bodies · ' + (weaponAsset ? 'textured M4A1' : 'no weapon') + ' · ' +
      (frame ? 'SSAO+bloom+ACES' : 'no post') + (envOk ? ' · IBL probe' : '') + '<br>' +
      '<span class="dim">first frame ' + marks.firstFrame.toFixed(0) + ' ms · median ' + median(times).toFixed(1) + ' ms/f</span>';
  }

  window.__s9pc = {
    get ready() { return !!(COL && (!WANT_WEAPON || weaponAsset) && (!WANT_BODIES || ops.length >= 1)); },
    get s() {
      return {
        level: LEVEL, engine: pc.version, frames,
        pos: [+P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2)], yaw: +P.yaw.toFixed(3), pitch: +P.pitch.toFixed(3),
        stats: WORLD ? WORLD.stats : null, ops: ops.length, weapon: !!weaponAsset, post: !!frame, env: envOk,
        marks, medianMs: +median(times).toFixed(2), p95Ms: +(times.slice().sort((a, b) => a - b)[Math.floor(times.length * 0.95)] || 0).toFixed(2),
        gunfit: GUNFIT, log,
      };
    },
    _place(x, z, y) { place(x, z, y); applyCamera(); },
    _look(yaw, pitch) { P.yaw = yaw; if (pitch != null) P.pitch = pitch; applyCamera(); },
    _spawns() { return WORLD ? WORLD.spawns : []; },
    _fwd() { const v = cam.forward; return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; },
    _hidehud(v) { const h = $('hud'); if (h) h.style.display = v ? 'none' : ''; },
    _resetTimes() { times.length = 0; },
    app,
  };

  app.start();
})();

/* upperdeckripmaster3030 — DOGFIGHT / PlayCanvas: the world (window.DFPCWorld).
 *
 * Sky, image-based lighting, the ground and its lattice, the scenery props, the boost gates and
 * the cloud deck. Everything here is drawn CAMERA-RELATIVE — the eye sits at the origin and the
 * world is translated by −cam — which is how `js/dogfight-gl.js` does it too, and it is not a
 * style choice: the map is a 150-unit TORUS, so a seam exists at some x and some y, and placing
 * content relative to the eye puts that seam behind the fog wall where it can never be seen.
 *
 *   DFPCWorld.SKINS                     the palette table, one entry per WORLDS theme
 *   DFPCWorld.create(app, opt)          → { apply(world, o), update(G, cam, o), skin(), stats() }
 *
 * ⚑ HIGH KEY, AND IT REVERSES THE GAME'S OWN PALETTE ON PURPOSE. Measured on the shipping build
 *   before any of this existed: 50.4% of a 960×600 frame was below luma 12/255 — half the screen
 *   near-black. All five themes are neon-on-void, and against a void a dark craft has no
 *   silhouette at all; the only thing that reads is the emissive trim. The artist's standing
 *   direction is bright, high-key, saturated, crisp silhouettes, clean flat colour fields — which
 *   is exactly the correction `js/s9pc-app.js` records under TIME OF DAY for the outdoor arenas:
 *   "High-key daylight puts every silhouette DARK against a bright field, which is the single
 *   biggest legibility win available and costs nothing to render." Dogfight is nothing BUT
 *   outdoors, so it applies here with no carve-out at all.
 *
 *   The HUES are kept — each theme is recognisably itself — and the VALUES are inverted: the sky
 *   and the deck go bright and saturated, the lattice goes DARK on the deck (a neon line on a
 *   bright field must be dark to read; the same line light-on-dark is the old palette), and hulls
 *   are dark bodies with emissive trim. `?tod=night` keeps the original palette intact for an A/B
 *   rather than deleting it, the same escape hatch s9pc kept for dusk.
 */
window.DFPCWorld = (function () {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const Q = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
  const NIGHT = Q.get('tod') === 'night';

  const hex = h => { const s = String(h || '#ffffff').replace('#', '');
    return [(parseInt(s.slice(0, 2), 16) || 0) / 255, (parseInt(s.slice(2, 4), 16) || 0) / 255, (parseInt(s.slice(4, 6), 16) || 0) / 255]; };

  /* ── the palettes ───────────────────────────────────────────────────────────────────────
   * top  zenith · hor  horizon (the brightest band, which is what a distant craft is read
   * against) · gnd  deck albedo · line  the lattice · fog  aerial perspective, which must AGREE
   * with the horizon or distance reads as a coloured filter rather than as air · sun  key light
   * tint · glow  the sun disc · prop  scenery albedo.
   *
   * ⚠ FOG AND HORIZON ARE THE SAME COLOUR ON PURPOSE. The old renderer tinted the haze with
   *   `world.fog` (a dark purple) under a dark sky, which is consistent; do the same thing under
   *   a bright sky and the far field goes MUDDY — a dark haze over a light sky is smoke. Aerial
   *   perspective is the sky getting in the way, so it is the sky's colour by construction. */
  const SKINS = {
    'neon grid':    { top: '#1f4fd0', hor: '#c6ecff', gnd: '#79d6cd', line: '#0a4f5c', fog: '#c6ecff',
                      sun: '#fff3c8', glow: '#ffe27a', prop: '#123f4c', grid: '#12e0c8' },
    'moon ocean':   { top: '#1a6fbe', hor: '#e2f6ff', gnd: '#4fb6d8', line: '#0b4d68', fog: '#e2f6ff',
                      sun: '#ffffff', glow: '#eafcff', prop: '#0d4761', grid: '#4fe0ff' },
    'ember canyon': { top: '#2d78cc', hor: '#ffe6c2', gnd: '#df8a3e', line: '#6f2f0e', fog: '#ffe2bc',
                      sun: '#fff0c4', glow: '#ffd23b', prop: '#833c13', grid: '#ffae4a' },
    'chrome city':  { top: '#1f9f96', hor: '#e6fff2', gnd: '#b3e5c6', line: '#11543c', fog: '#e6fff2',
                      sun: '#ffffff', glow: '#9affd0', prop: '#1a5946', grid: '#2bff80' },
    'ghost nebula': { top: '#6d3fd0', hor: '#ffd9f2', gnd: '#c39be6', line: '#43206a', fog: '#f4d8ff',
                      sun: '#fff2ff', glow: '#ff9cf0', prop: '#472875', grid: '#c060ff' },
  };
  /* NIGHT is the game's own five themes, unchanged — kept as a comparison build rather than
   * deleted, because "is the new palette actually better" is a question that needs both frames. */
  function skinFor(world) {
    const S = SKINS[world.name];
    if (NIGHT || !S) {
      return { top: world.sky[0], hor: world.sky[1], gnd: world.gnd, line: world.grid, fog: world.fog,
               sun: world.sun, glow: world.sun, prop: world.grid, grid: world.grid, night: true };
    }
    return S;
  }

  /* ── sky ────────────────────────────────────────────────────────────────────────────────
   * A generated gradient cubemap. It is the skybox AND, through pc.EnvLighting, the image-based
   * light — so the ambient in the scene is literally the sky the player is looking at rather than
   * a constant somebody picked. That agreement is most of why an engine frame reads as a place.
   * Same construction as `js/s9pc-app.js`'s skyCubemap; the gradient shape differs (this one is
   * horizon-bright all the way round, because in a flight game you spend the whole match looking
   * at the horizon and never at a wall). */
  const CUBE_DIRS = [(s, t) => [1, -t, -s], (s, t) => [-1, -t, s], (s, t) => [s, 1, t],
                     (s, t) => [s, -1, -t], (s, t) => [s, -t, 1], (s, t) => [-s, -t, -1]];
  function skyColour(S, sunDir, dx, dy, dz) {
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const top = hex(S.top), hor = hex(S.hor), gnd = hex(S.gnd), glow = hex(S.glow);
    let c;
    if (dy >= 0) { const t = Math.pow(Math.min(1, dy), 0.62);
      c = hor.map((h, i) => h + (top[i] - h) * t); }
    else { const t = Math.min(1, -dy * 1.7); c = hor.map((h, i) => h + (gnd[i] * 0.9 - h) * t); }
    const d = dx * sunDir[0] + dy * sunDir[1] + dz * sunDir[2];
    if (d > 0) { const g = Math.pow(d, 30) * 2.6 + Math.pow(d, 4) * 0.20;
      c = c.map((v, i) => v + g * glow[i]); }
    return c;
  }
  function skyCubemap(app, N, S, sunDir, boost) {
    const faces = []; boost = boost || 1;
    for (let f = 0; f < 6; f++) {
      const cv = document.createElement('canvas'); cv.width = cv.height = N;
      const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const s = 2 * (x + 0.5) / N - 1, t = 2 * (y + 0.5) / N - 1;
        const v = CUBE_DIRS[f](s, t), col = skyColour(S, sunDir, v[0], v[1], v[2]);
        const o = (y * N + x) * 4;
        for (let k = 0; k < 3; k++) d[o + k] = Math.min(255, Math.pow(Math.max(0, col[k] * boost), 1 / 2.2) * 255);
        d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0); faces.push(cv);
    }
    const tex = new pc.Texture(app.graphicsDevice, { name: 'dfpc-sky', cubemap: true, width: N, height: N,
      format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
    tex.setSource(faces); return tex;
  }

  /* ── the deck texture ───────────────────────────────────────────────────────────────────
   * ⚑ THE LATTICE IS A TEXTURE NOW, NOT GEOMETRY, and that is a real change rather than a port.
   * The old renderer built ~70 extruded beams of geometry every frame to draw the grid: it costs
   * a buffer upload per frame, it aliases badly at range (a 0.03-unit beam is sub-pixel by 20
   * units out, so it shimmers), and it cannot be mip-mapped. A tile with the lattice IN it is one
   * draw call, and the mip chain is exactly the anti-aliasing the beams never had.
   *
   * One tile = TILE world units, with a lattice line every STEP units, so the pattern lands on
   * the same coordinates the old grid did. The low-frequency mottle is the terrain pass the old
   * renderer got from a third raymarch of the cloud shader — same information, no fill cost. */
  function deckTexture(app, S, TILE, STEP, N) {
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const ctx = cv.getContext('2d');
    const g = hex(S.gnd), ln = hex(S.line);
    // seeded value noise: a fixed lattice so the terrain is the same every load for a theme
    const R = 16, rnd = new Float32Array(R * R);
    let seed = 1337; for (let i = 0; i < R * R; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; rnd[i] = seed / 4294967296; }
    const smooth = t => t * t * (3 - 2 * t);
    const noise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
      const at = (a, b) => rnd[((b % R) + R) % R * R + (((a % R) + R) % R)];
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return (a + (b - a) * xf) + ((c + (d - c) * xf) - (a + (b - a) * xf)) * yf;
    };
    const img = ctx.createImageData(N, N), px = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N * R, v = y / N * R;          // one tile spans the whole noise lattice: seamless
      const n = noise(u, v) * 0.62 + noise(u * 2, v * 2) * 0.26 + noise(u * 4, v * 4) * 0.12;
      const k = 0.80 + n * 0.42;                   // patches of deck, not detail — flat fields
      const o = (y * N + x) * 4;
      for (let c = 0; c < 3; c++) px[o + c] = Math.min(255, Math.pow(clamp(g[c] * k, 0, 1), 1 / 2.2) * 255);
      px[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // the lattice, drawn on top so its colour is exact rather than blended out of the noise
    const perUnit = N / TILE, w = Math.max(1.4, perUnit * 0.055);
    ctx.strokeStyle = 'rgb(' + ln.map(v => Math.round(Math.pow(v, 1 / 2.2) * 255)).join(',') + ')';
    ctx.lineWidth = w; ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (let i = 0; i * STEP <= TILE + 0.001; i++) {
      const p = i * STEP * perUnit;
      ctx.moveTo(p, 0); ctx.lineTo(p, N); ctx.moveTo(0, p); ctx.lineTo(N, p);
    }
    ctx.stroke();
    const tex = new pc.Texture(app.graphicsDevice, { name: 'dfpc-deck', width: N, height: N,
      format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, anisotropy: 8 });
    tex.setSource(cv); return tex;
  }

  function create(app, opt) {
    opt = opt || {};
    const ENVSIZE = opt.envSize || 128, ATLAS = opt.atlas || 256;
    const FAR = opt.VIEW_FAR || 34;
    const TILE = 16, STEP = 2;                        // 16-unit texture tile, lattice every 2 units
    const root = new pc.Entity('dfpc-world');
    app.root.addChild(root);

    // ── the deck ──────────────────────────────────────────────────────────────────────────
    /* Big enough to reach past the fog wall in every direction so the player never sees its edge
     * — a flight game's floor has no rim, and one you can fly over the end of is the single most
     * expensive way to say "this is a diagram". */
    const deckMesh = pc.Mesh.fromGeometry(app.graphicsDevice,
      new pc.PlaneGeometry({ halfExtents: new pc.Vec2(FAR * 2.4, FAR * 2.4), widthSegments: 1, lengthSegments: 1 }));
    const deckMat = new pc.StandardMaterial();
    deckMat.name = 'dfpc-deck';
    deckMat.useMetalness = true; deckMat.metalness = 0.02; deckMat.gloss = 0.22;
    deckMat.diffuse = new pc.Color(1, 1, 1); deckMat.diffuseMapTint = false;
    const deck = new pc.Entity('deck');
    const deckMi = new pc.MeshInstance(deckMesh, deckMat, deck);
    deckMi.castShadow = false;
    deck.addComponent('render', { meshInstances: [deckMi], castShadows: false, receiveShadows: true });
    root.addChild(deck);

    // ── props ─────────────────────────────────────────────────────────────────────────────
    /* One entity per prop, repositioned camera-relative every frame. 260 Vec3 writes is nothing;
     * what it buys is the ENGINE'S frustum culling, which the old renderer did not have — it
     * culled on radius only, so everything within 34 units drew, including everything behind you.
     * Roughly two thirds of a 260-prop field is behind the camera at any moment. */
    const propMat = new pc.StandardMaterial();
    propMat.name = 'dfpc-prop';
    propMat.useMetalness = true; propMat.metalness = 0.10; propMat.gloss = 0.42;
    const gateMat = new pc.StandardMaterial();
    gateMat.name = 'dfpc-gate';
    /* A boost ring is a THING YOU AIM AT. It gets emissive rather than albedo so it stays legible
     * against a bright sky, which is the case a lit material cannot win. */
    gateMat.useLighting = false;
    gateMat.diffuse = new pc.Color(0, 0, 0);
    gateMat.emissive = new pc.Color(1, 0.82, 0.23); gateMat.emissiveIntensity = 2.4;
    gateMat.update();

    let propProto = null, propEnts = [], gateEnts = [];
    // the fallback shape, so scenery exists from the first frame and forever if the GLB 404s
    function fallbackProp() {
      const geo = new pc.BoxGeometry({ halfExtents: new pc.Vec3(0.17, 0.95, 0.17) });
      const m = pc.Mesh.fromGeometry(app.graphicsDevice, geo);
      return { mesh: m, off: new pc.Vec3(0, 0.95, 0), scale: 1 };
    }
    const gateGeo = new pc.TorusGeometry({ tubeRadius: 0.16, ringRadius: 1.4, segments: 28, sides: 8 });
    const gateMesh = pc.Mesh.fromGeometry(app.graphicsDevice, gateGeo);

    function makeProps(n) {
      while (propEnts.length > n) { const e = propEnts.pop(); try { e.destroy(); } catch (err) {} }
      while (propEnts.length < n) {
        const e = new pc.Entity('prop' + propEnts.length);
        const inner = new pc.Entity('fit');
        e.addChild(inner); root.addChild(e); e.enabled = false;
        propEnts.push(e); e.__inner = inner;
      }
      for (const e of propEnts) rebuildProp(e);
    }
    function rebuildProp(e) {
      const inner = e.__inner;
      if (inner.render) inner.removeComponent('render');
      const P = propProto || (propProto = fallbackProp());
      const mi = new pc.MeshInstance(P.mesh, propMat, inner);
      mi.castShadow = true;
      inner.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
      inner.setLocalPosition(P.off); inner.setLocalScale(P.scale, P.scale, P.scale);
    }
    function makeGates(n) {
      while (gateEnts.length > n) { const e = gateEnts.pop(); try { e.destroy(); } catch (err) {} }
      while (gateEnts.length < n) {
        const e = new pc.Entity('gate' + gateEnts.length);
        const mi = new pc.MeshInstance(gateMesh, gateMat, e);
        mi.castShadow = false;
        e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
        root.addChild(e); e.enabled = false; gateEnts.push(e);
      }
    }

    /* ── the cloud deck ─────────────────────────────────────────────────────────────────────
     * ⚑ PUFFS, NOT SHEETS — and this is a deliberate non-regression. CLAUDE.md records that the
     * old renderer replaced flat cloud sheets with a raymarch precisely because "three flat
     * sheets read as three flat sheets from every angle that isn't edge-on". Going back to
     * sheets would undo that. A raymarch is also the single most expensive thing in the old
     * frame (three fullscreen marches). Camera-facing soft puffs on a seeded toroidal lattice
     * give the volume back — they read as bodies from any angle because they ARE distributed
     * through the slab's thickness — at one draw call and no per-pixel loop.
     *
     * The lattice is toroidal (positions are taken modulo WS), so the deck wraps with the map
     * and the seam cannot appear. Seeded, so a theme's weather is the same every load. */
    const cloudLayer = window.DFPCFx ? DFPCFx.quadLayer(app, { name: 'dfpc-cloud', max: 320,
      sprite: DFPCFx.radial(64, 1.25), blend: pc.BLEND_NORMAL, emissive: 1.0, fog: true, depthWrite: false }) : null;
    if (cloudLayer) root.addChild(cloudLayer.node);
    let PUFFS = null;
    function buildPuffs(WS, CY, CT) {
      const out = []; let seed = 90210;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 210; i++) {
        // two bands: the main deck, and a thinner higher shelf. Parallax between them is the cue
        // that says these are bodies at different distances rather than one painted layer.
        const hi = i > 150;
        out.push({ x: rnd() * WS, z: rnd() * WS,
          y: (hi ? CY + CT * 1.9 : CY) + (rnd() - 0.5) * CT * (hi ? 1.0 : 1.9),
          r: (hi ? 2.6 : 4.2) * (0.55 + rnd() * 0.9), k: 0.55 + rnd() * 0.45 });
      }
      return out;
    }

    // ── environment / lighting state ──────────────────────────────────────────────────────
    const CACHE = {};
    let S = skinFor({ name: 'neon grid', sky: ['#12043a', '#5a0a6e'], gnd: '#060018', grid: '#27f7e4', fog: '#3a0a5e', sun: '#ff2a6d' });
    let sunDir = [0.55, 0.83, 0.0];
    let deckTex = null, themeKey = '';

    /** called whenever the match picks a theme; cheap to call every frame, it early-outs */
    function apply(world, o) {
      const key = (world && world.name) || 'neon grid';
      if (key === themeKey) return;
      themeKey = key;
      S = skinFor(world);
      // the sun rides the theme's own azimuth (G.sunAz is per match); elevation is high and fixed
      const C = CACHE[key] || (CACHE[key] = {});
      if (!C.deck) C.deck = deckTexture(app, S, TILE, STEP, 512);
      deckTex = C.deck;
      deckMat.diffuseMap = deckTex;
      deckMat.diffuseMapTiling = new pc.Vec2(1, 1);
      deckMat.update();
      if (!C.sky) {
        try {
          C.sky = skyCubemap(app, ENVSIZE, S, sunDir, 1);
          /* Boosted copy for the IBL only. Outdoors the sky IS the fill light, and a cubemap
           * authored for LOOKING at is a stop or two under what it should be for LIGHTING with —
           * the same correction s9pc makes with its own iblBoost. */
          const lit = skyCubemap(app, 64, S, sunDir, 1.45);
          const src = pc.EnvLighting.generateLightingSource(lit, { size: ENVSIZE });
          C.atlas = pc.EnvLighting.generateAtlas(src, { size: ATLAS });
        } catch (e) { C.sky = null; C.atlas = null; }
      }
      if (C.sky) { app.scene.skybox = C.sky; app.scene.skyboxMip = 0; app.scene.skyboxIntensity = S.night ? 0.7 : 1.0; }
      if (C.atlas) app.scene.envAtlas = C.atlas;
      /* Ambient: a slice of the sky rather than a constant. Under the high-key palettes this is
       * genuinely bright, which is what stops the underside of a hull going to black — the thing
       * that made the old frames read as cardboard cut-outs over a void. */
      const hr = hex(S.hor);
      app.scene.ambientLight = S.night ? new pc.Color(0.06, 0.06, 0.09)
        : new pc.Color(hr[0] * 0.42, hr[1] * 0.42, hr[2] * 0.44);
      const fg = hex(S.fog);
      app.scene.fog.type = pc.FOG_LINEAR;
      app.scene.fog.color = new pc.Color(fg[0], fg[1], fg[2]);
      /* ⚠ FOG STARTS LATE AND ENDS AT THE FOG WALL. Starting it early is how a bright palette
       * turns into a flat wash: everything mid-distance gets pulled to one colour and the frame
       * loses its depth AND its contrast in one move. 0.42→1.0 of the draw distance keeps the
       * near field honest and still closes the horizon. */
      app.scene.fog.start = FAR * 0.42;
      app.scene.fog.end = FAR * 1.05;
      const pc0 = hex(S.prop);
      propMat.diffuse = new pc.Color(pc0[0], pc0[1], pc0[2]);
      propMat.update();
      PUFFS = null;                                  // rebuilt on the next update with live consts
    }

    function sunColour() { return hex(S.sun); }

    // ── per-frame ─────────────────────────────────────────────────────────────────────────
    let nProps = 0, nGates = 0, nPuffs = 0;
    const _v = new pc.Vec3();
    function update(G, cam, camEnt, o) {
      const WS = o.WS, F2 = o.VIEW_FAR || FAR;
      const wdel = v => { v -= Math.round(v / WS) * WS; return v; };

      // the deck follows the eye and the texture slides the other way, so the lattice stays put
      deck.setPosition(0, 0, 0);
      deckMat.diffuseMapOffset = new pc.Vec2(cam.x / TILE, -cam.y / TILE);
      deckMat.diffuseMapTiling = new pc.Vec2(FAR * 4.8 / TILE, FAR * 4.8 / TILE);
      deckMat.update();

      // props
      const P = G.props || [];
      if (propEnts.length !== P.length) makeProps(P.length);
      nProps = 0;
      for (let i = 0; i < P.length; i++) {
        const p = P[i], e = propEnts[i];
        const dx = wdel(p.x - cam.x), dz = wdel(p.y - cam.y);
        const on = Math.hypot(dx, dz) <= F2 * 1.05;
        if (e.enabled !== on) e.enabled = on;
        if (!on) continue;
        nProps++;
        e.setPosition(dx, p.alt || 0, dz);
        e.setLocalEulerAngles(0, -(p.rot || 0) * 180 / Math.PI, 0);
        const s = (p.s || 1) * 1.9;                  // fitStanding normalises height to 1
        e.setLocalScale(s, s, s);
      }

      // boost gates. The hitbox is a vertical cylinder (r 1.4, ±0.9 alt) and has no facing, so
      // the ring turns to meet you — a fixed yaw would show an edge-on line from the side while
      // the game still let you fly through it, which is the worse lie.
      const GT = G.gates || [];
      if (gateEnts.length !== GT.length) makeGates(GT.length);
      nGates = 0;
      for (let i = 0; i < GT.length; i++) {
        const gt = GT[i], e = gateEnts[i];
        const dx = wdel(gt.x - cam.x), dz = wdel(gt.y - cam.y);
        const on = Math.hypot(dx, dz) <= F2 * 1.05;
        if (e.enabled !== on) e.enabled = on;
        if (!on) continue;
        nGates++;
        e.setPosition(dx, gt.alt || 0, dz);
        // the torus lies in XZ with its axis on +Y; stand it up, then face the eye
        e.setLocalEulerAngles(90, Math.atan2(-dx, -dz) * 180 / Math.PI, 0);
      }

      // cloud deck
      nPuffs = 0;
      if (cloudLayer) {
        const CY = o.CLOUD_ALT || 5.4, CT = o.CLOUD_THICK || 0.9;
        if (!PUFFS) PUFFS = buildPuffs(WS, CY, CT);
        cloudLayer.begin(camEnt);
        const c = hex(S.hor), sun = hex(S.sun);
        const vis = [];
        for (const q of PUFFS) {
          const dx = wdel(q.x - cam.x), dz = wdel(q.z - cam.y);
          const d = Math.hypot(dx, dz);
          if (d > F2 * 1.15) continue;
          vis.push([d, dx, dz, q]);
        }
        // back to front: one alpha layer, one draw call, so the buffer order IS the sort order
        vis.sort((a, b) => b[0] - a[0]);
        for (const [d, dx, dz, q] of vis) {
          /* Lit from above by the sun tint, shaded toward the sky colour underneath — the one
           * cue that makes a soft blob read as weather rather than as fog. */
          const up = clamp((q.y - (o.CLOUD_ALT || 5.4)) / ((o.CLOUD_THICK || 0.9) * 2) + 0.5, 0, 1);
          const k = (0.72 + up * 0.28) * q.k;
          const r = Math.round(255 * clamp(c[0] * 0.34 + sun[0] * 0.70 * k, 0, 1));
          const g = Math.round(255 * clamp(c[1] * 0.34 + sun[1] * 0.70 * k, 0, 1));
          const b = Math.round(255 * clamp(c[2] * 0.34 + sun[2] * 0.70 * k, 0, 1));
          // fade in over the last few units of draw distance so a puff never pops into being
          const a = Math.round(clamp((1 - d / (F2 * 1.15)) * 3.2, 0, 1) * 190);
          cloudLayer.billboard(dx, q.y, dz, q.r, r, g, b, a, 0.62);
          nPuffs++;
        }
        cloudLayer.end();
      }
    }

    /* ── flying INSIDE the weather ────────────────────────────────────────────────────────
     * The old renderer white-outs the sky and drags the fog wall in close when the eye enters the
     * deck band, and that is a GAMEPLAY mechanic, not decoration: it is what makes owning the
     * airspace above or below the cloud worth anything. Kept, expressed as fog rather than as a
     * shader uniform — same effect, and it applies to every object automatically. */
    function weather(eyeAlt, o) {
      const CY = o.CLOUD_ALT || 5.4, CT = o.CLOUD_THICK || 0.9;
      const k = clamp(1 - Math.abs(eyeAlt - CY) / CT, 0, 1);
      const fg = hex(S.fog), sun = hex(S.sun);
      const wc = [fg[0] * 0.3 + sun[0] * 0.7, fg[1] * 0.3 + sun[1] * 0.7, fg[2] * 0.3 + sun[2] * 0.7];
      app.scene.fog.color = new pc.Color(fg[0] + (wc[0] - fg[0]) * k, fg[1] + (wc[1] - fg[1]) * k, fg[2] + (wc[2] - fg[2]) * k);
      app.scene.fog.start = FAR * (0.42 - 0.36 * k);
      app.scene.fog.end = FAR * (1.05 - 0.86 * k);
      return k;
    }

    /** the authored GLB has landed: swap the procedural prop for the real one and rebuild */
    function setPropMesh(mesh, off, scale) {
      propProto = { mesh, off: off || new pc.Vec3(0, 0, 0), scale: scale == null ? 1 : scale };
      for (const e of propEnts) rebuildProp(e);
    }
    function setGateMesh(mesh) {
      for (const e of gateEnts) {
        if (e.render) e.removeComponent('render');
        const mi = new pc.MeshInstance(mesh, gateMat, e); mi.castShadow = false;
        e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
      }
    }

    return { root, apply, update, weather, setPropMesh, setGateMesh,
             skin: () => S, sunColour, sunDir: () => sunDir,
             setSun: d => { sunDir = d; },
             stats: () => ({ props: nProps, gates: nGates, puffs: nPuffs, theme: themeKey, night: !!S.night }) };
  }

  return { create, SKINS, skinFor, hex, NIGHT };
})();

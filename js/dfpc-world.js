/* ripmaster3030studios — DOGFIGHT / PlayCanvas: the world (window.DFPCWorld).
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
   *   perspective is the sky getting in the way, so it is the sky's colour by construction.
   *
   * ⛔ AND THE FIRST VERSION OF THIS TABLE WAS WRONG, in exactly the way `js/s9pc-world.js`
   *   already records the expensive way: BRIGHTER IS NOT THE SAME AS MORE COLOURFUL. It used
   *   near-white horizons (#c6ecff, #e2f6ff, #ffd9f2 — max channel 0.94–1.00) on the theory that
   *   "high key" means "light". Measured, that frame came back luma 226.4, RMS contrast 11.9,
   *   saturation 5.1%, mean |Laplacian| 0.80 — a flat white screen with a plane on it, and LESS
   *   saturated than the near-black build it replaced (54.6%). The cause is the tonemapper: ACES
   *   desaturates as it compresses toward white, so pushing values up walks the whole frame into
   *   the part of the curve that removes chroma. High key is about the VALUE RELATIONSHIP — the
   *   background lighter than the subject — not about the absolute number.
   *   So every entry below now sits at a MODERATE value with REAL chroma: horizons cap around
   *   0.84 of full and carry 25–48% saturation, zeniths and decks are properly saturated at
   *   0.55–0.70. The silhouette job is already won at deck 0.62 against a hull at 0.22; it never
   *   needed 0.95. */
  const SKINS = {
    'neon grid':    { top: '#1436c8', hor: '#7cc4d6', gnd: '#2f9d90', line: '#0a3f45', fog: '#7cc4d6',
                      sun: '#ffe9b0', glow: '#ffd66a', prop: '#12414d', grid: '#12e0c8' },
    'moon ocean':   { top: '#0f4f9c', hor: '#82bcd6', gnd: '#2b7fa0', line: '#0a3a4e', fog: '#82bcd6',
                      sun: '#eaf6ff', glow: '#dff2ff', prop: '#0d4761', grid: '#4fe0ff' },
    'ember canyon': { top: '#1f66b4', hor: '#d8ab70', gnd: '#b4622a', line: '#5a2408', fog: '#d8ab70',
                      sun: '#ffe6b4', glow: '#ffc84a', prop: '#8a3f14', grid: '#ffae4a' },
    'chrome city':  { top: '#0f8a80', hor: '#96d2b6', gnd: '#3f9e77', line: '#0d4a36', fog: '#96d2b6',
                      sun: '#f2fff8', glow: '#9affd0', prop: '#1a5946', grid: '#2bff80' },
    'ghost nebula': { top: '#5228b4', hor: '#c68fd6', gnd: '#7b4fa8', line: '#341757', fog: '#c68fd6',
                      sun: '#ffe6ff', glow: '#ff9cf0', prop: '#472875', grid: '#c060ff' },
  };
  /* NIGHT is the game's own five themes, unchanged — kept as a comparison rather than deleted,
   * because "is the new palette actually better" is a question that needs both frames.
   * ⚠ IT IS A PALETTE A/B, NOT A RENDERER A/B, and it flatters neither side. The old renderer drew
   * its grid as EMISSIVE beams, which is what made neon-on-black read; here the lattice is albedo
   * on a lit deck, so under the old dark colours it is a dark line on a dark ground and mostly
   * disappears. Measured on the same arena: `?tod=night` comes back luma 15.1, RMS 8.3, 34% of the
   * frame under luma 12 — flatter than the classic build's own 53 / 54.6 / 22%. If you want the
   * renderers compared, compare `dogfight-classic.html`; this switch answers a different question. */
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
  /* ⛔ NO GAMMA ENCODE HERE, AND THAT WAS A REAL BUG. The first version wrote
   * `pow(col, 1/2.2) * 255` into a PIXELFORMAT_SRGBA8 texture — but an sRGB texture is DECODED by
   * the hardware, so the shader then saw `col` as a LINEAR value, tone-mapped it and gamma-encoded
   * it AGAIN on the way to the screen. Every authored colour came out roughly v^(1/2.2) too
   * bright: a zenith authored at #5228b4 measured 215/185/230 on screen. Writing the raw sRGB byte
   * means the texture decodes to the right linear value and the frame encodes back to the colour
   * that was authored, which is also the space `material.diffuse`, `scene.fog.color` and
   * `scene.ambientLight` are specified in — so the sky, the haze and the ground now agree by
   * construction instead of by coincidence. Same fix in deckTexture(). */
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
        for (let k = 0; k < 3; k++) d[o + k] = Math.min(255, Math.max(0, col[k] * boost) * 255);
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
      for (let c = 0; c < 3; c++) px[o + c] = Math.min(255, clamp(g[c] * k, 0, 1) * 255);
      px[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    /* The lattice, drawn on top so its colour is exact rather than blended out of the noise.
     * ⚠ WIDTH AND OPACITY ARE DOING THE JOB THE OLD RENDERER'S EMISSIVE BEAMS DID, and they have
     * to work harder for it. Neon lines on near-black are maximal local contrast by construction —
     * it is the same property that put half of that frame under luma 12 — whereas a dark line on
     * a lit deck is read through a mip chain that deliberately averages it away with distance.
     * 0.075 of a unit at full opacity is the widest the line can be before it stops reading as a
     * grid and starts reading as tiling; below ~0.05 it mips out inside the near field. */
    const perUnit = N / TILE, w = Math.max(2, perUnit * 0.075);
    ctx.strokeStyle = 'rgb(' + ln.map(v => Math.round(v * 255)).join(',') + ')';
    ctx.lineWidth = w; ctx.globalAlpha = 1;
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

  /* ⚠ FOG STARTS LATE AND DOES NOT FULLY CLOSE INSIDE THE DRAW DISTANCE, and both halves matter.
   * Starting it early is how a bright palette turns into a flat wash — every mid-distance object
   * gets pulled to one colour and the frame loses its depth AND its contrast in one move. Ending
   * it AT the fog wall is the other half of the same mistake: the deck reaches sky colour well
   * before its own far edge, so there is no horizon LINE at all and the frame is one gradient.
   * Measured on the first attempt (0.42 → 1.05 of a 34-unit view): RMS contrast 11.9, mean
   * |Laplacian| 0.80 — a flat screen. 0.55 → 1.12 recovered it to 21.2. 0.68 → 1.25 leaves an
   * object at the cull radius ~70% hazed: far enough that a pop is soft, near enough that two
   * thirds of the depth range is still drawn in its own colour rather than in the sky's.
   *
   * ⛔ AND THESE ARE MODULE CONSTANTS BECAUSE THEY WERE DUPLICATED AND IT COST A WHOLE TEST RUN.
   * `apply()` set the fog once per theme and `weather()` reset it EVERY FRAME from its own copy of
   * the numbers, so editing apply() changed nothing at all and the measurement came back identical
   * — which reads exactly like "the fix didn't work" rather than "the fix never ran". Two copies
   * of a constant is one copy too many; weather() now scales these. */
  const FOG_NEAR = 0.68, FOG_FAR = 1.25;

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

    /* ⚠ ONE SILHOUETTE PER THEME, and the first version got this wrong in a way only a screenshot
     * showed: it took whichever prop part the GLB happened to yield first and planted 260 of it in
     * every world, so all five themes were pylons. `WORLDS[].prop` names the shape the theme is
     * supposed to have (pylon · ring · spire · tower · crystal) and it is the cheapest identity
     * any of them has. PROPSET holds them all; apply() picks. */
    let propProto = null, PROPSET = null, propEnts = [], gateEnts = [];
    /* The fallback shape, so scenery exists from the first frame and forever if the GLB 404s.
     * ⚠ IT IS NORMALISED TO HEIGHT 1 WITH ITS BASE ON THE ORIGIN, exactly like the authored mesh's
     * `fitStanding`. Getting that wrong is invisible while the GLB loads and then makes every prop
     * change size the moment it lands — the fallback's whole job is to be the same object. */
    function fallbackProp() {
      const geo = new pc.BoxGeometry({ halfExtents: new pc.Vec3(0.09, 0.5, 0.09) });
      const m = pc.Mesh.fromGeometry(app.graphicsDevice, geo);
      return { mesh: m, off: new pc.Vec3(0, 0.5, 0), scale: 1 };
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
    /* The gate lives on an inner `fit` node for the same reason the props do: the authored GLB
     * ring is whatever radius Blender exported, and the game tests a 1.4-unit pass-through. The
     * fit is MEASURED from the mesh (see dfpc-app loadArt) and applied here, so a replacement ring
     * is still the size the collision actually uses. A gate that draws bigger than its hitbox is
     * the worst possible lie: you aim at the hole and miss. */
    let gateProto = { mesh: gateMesh, off: new pc.Vec3(0, 0, 0), scale: 1 };
    function makeGates(n) {
      while (gateEnts.length > n) { const e = gateEnts.pop(); try { e.destroy(); } catch (err) {} }
      while (gateEnts.length < n) {
        const e = new pc.Entity('gate' + gateEnts.length);
        const inner = new pc.Entity('fit');
        e.addChild(inner); root.addChild(e); e.enabled = false;
        e.__inner = inner; gateEnts.push(e);
      }
      for (const e of gateEnts) rebuildGate(e);
    }
    function rebuildGate(e) {
      const inner = e.__inner;
      if (inner.render) inner.removeComponent('render');
      const mi = new pc.MeshInstance(gateProto.mesh, gateMat, inner);
      mi.castShadow = false;
      inner.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
      inner.setLocalPosition(gateProto.off);
      inner.setLocalScale(gateProto.scale, gateProto.scale, gateProto.scale);
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
      /* ⚠ 130, NOT 210, AND SMALLER. The first pass put 210 wide puffs across a 150-unit torus and
       * a screenshot showed what that actually is: ~40 of them in view at once, each several units
       * across and squashed flat, overlapping into pale HORIZONTAL BANDS that covered the top
       * quarter of the frame. A cloud deck you cannot see past is not weather, it is a ceiling —
       * and it took the sky's whole value gradient with it, which is where the frame's contrast
       * was supposed to come from. Sparser and rounder reads as scattered cloud; the deck is still
       * dense enough to white you out when you fly INTO it, which is the part that is a mechanic. */
      for (let i = 0; i < 130; i++) {
        // two bands: the main deck, and a thinner higher shelf. Parallax between them is the cue
        // that says these are bodies at different distances rather than one painted layer.
        const hi = i > 96;
        out.push({ x: rnd() * WS, z: rnd() * WS,
          y: (hi ? CY + CT * 1.9 : CY) + (rnd() - 0.5) * CT * (hi ? 1.0 : 1.9),
          r: (hi ? 1.9 : 2.9) * (0.55 + rnd() * 0.9), k: 0.55 + rnd() * 0.45 });
      }
      return out;
    }

    // ── environment / lighting state ──────────────────────────────────────────────────────
    /* ⚠ TWO CACHES, NOT ONE, AND THE REASON IS THE SUN. The deck texture depends only on the
     * theme, so it caches per theme and stays. The sky has the sun's GLOW baked into it, and the
     * sun's azimuth is per MATCH (`G.sunAz = rnd(TAU)`) — cache the sky per theme and the second
     * match on a repeated theme gets a glow in the sky pointing one way and a directional light
     * coming from another, which reads as two suns. So the sky keys on theme + azimuth bucket and
     * keeps ONE slot: a 128³ cubemap is ~400 KB and caching every bucket of every theme would be
     * tens of megabytes for a texture that changes once a match. Rebuild costs ~100 ms, once, at
     * a moment the player is already looking at a loading screen. */
    const DECKS = {};
    let S = skinFor({ name: 'neon grid', sky: ['#12043a', '#5a0a6e'], gnd: '#060018', grid: '#27f7e4', fog: '#3a0a5e', sun: '#ff2a6d' });
    let sunDir = [0.55, 0.83, 0.0];
    let themeKey = '', skyKey = '', sky = null, atlas = null;

    /** called every frame with the match's theme; early-outs unless the theme or the sun moved */
    function apply(world, o) {
      const name = (world && world.name) || 'neon grid';
      const bucket = Math.round(Math.atan2(sunDir[2], sunDir[0]) * 8 / Math.PI);
      const key = name + '|' + bucket;
      if (key === skyKey) return;
      const themeChanged = name !== themeKey;
      skyKey = key; themeKey = name;
      S = skinFor(world);
      if (themeChanged || !deckMat.diffuseMap) {
        if (!DECKS[name]) DECKS[name] = deckTexture(app, S, TILE, STEP, 512);
        deckMat.diffuseMap = DECKS[name];
        // one tile = TILE world units across a plane that is FAR×4.8 wide; set once, never again
        deckMat.diffuseMapTiling = new pc.Vec2(FAR * 4.8 / TILE, FAR * 4.8 / TILE);
        deckMat.update();
      }
      try {
        const old = sky, oldA = atlas;
        sky = skyCubemap(app, ENVSIZE, S, sunDir, 1);
        /* Boosted copy for the IBL only. Outdoors the sky IS the fill light, and a cubemap
         * authored for LOOKING at is a stop or two under what it should be for LIGHTING with —
         * the same correction s9pc makes with its own iblBoost. */
        const lit = skyCubemap(app, 64, S, sunDir, 1.45);
        const src = pc.EnvLighting.generateLightingSource(lit, { size: ENVSIZE });
        atlas = pc.EnvLighting.generateAtlas(src, { size: ATLAS });
        try { lit.destroy(); } catch (e) {}
        if (old) try { old.destroy(); } catch (e) {}
        if (oldA) try { oldA.destroy(); } catch (e) {}
      } catch (e) { sky = null; atlas = null; }
      if (sky) { app.scene.skybox = sky; app.scene.skyboxMip = 0; app.scene.skyboxIntensity = S.night ? 0.7 : 1.0; }
      if (atlas) app.scene.envAtlas = atlas;
      /* Ambient: a slice of the sky rather than a constant. Under the high-key palettes this is
       * genuinely bright, which is what stops the underside of a hull going to black — the thing
       * that made the old frames read as cardboard cut-outs over a void. */
      const hr = hex(S.hor);
      app.scene.ambientLight = S.night ? new pc.Color(0.06, 0.06, 0.09)
        : new pc.Color(hr[0] * 0.28, hr[1] * 0.28, hr[2] * 0.30);
      const fg = hex(S.fog);
      app.scene.fog.type = pc.FOG_LINEAR;
      app.scene.fog.color = new pc.Color(fg[0], fg[1], fg[2]);
      app.scene.fog.start = FAR * FOG_NEAR;
      app.scene.fog.end = FAR * FOG_FAR;
      const pc0 = hex(S.prop);
      propMat.diffuse = new pc.Color(pc0[0], pc0[1], pc0[2]);
      propMat.update();
      pickProp(world && world.prop);                 // the theme's own silhouette, not the first one
      PUFFS = null;                                  // rebuilt on the next update with live consts
    }

    function sunColour() { return hex(S.sun); }

    // ── per-frame ─────────────────────────────────────────────────────────────────────────
    let nProps = 0, nGates = 0, nPuffs = 0;
    function update(G, cam, camEnt, o) {
      const WS = o.WS, F2 = o.VIEW_FAR || FAR;
      const wdel = v => { v -= Math.round(v / WS) * WS; return v; };

      /* ⚑ THE DECK IS SNAPPED TO THE LATTICE, not scrolled by a UV offset. Both make the grid
       * look world-fixed; only one of them is verifiable without a screenshot. A UV offset needs
       * the SIGN of v against the plane's own winding to be right, and getting it backwards makes
       * the ground slide the wrong way under you — visible, and indistinguishable from a physics
       * bug. Moving the whole plane to the nearest multiple of the texture's own period has no
       * sign to get wrong: the texture is fixed to the mesh and the mesh is fixed to the world.
       * The plane is FAR×4.8 across and the offset is at most TILE/2, so coverage never runs out. */
      const snap = v => -(v - Math.round(v / TILE) * TILE);
      deck.setPosition(snap(cam.x), 0, snap(cam.y));
      // ⚠ NO deckMat.update() here. The tiling never changes, and material.update() every frame
      // re-runs the engine's shader-variant bookkeeping for a value that is already correct.

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
        /* `fitStanding` normalises the authored prop to height 1, so this scale IS its height in
         * world units. ×1.9 rather than ×1: the old renderer applied the 1.9 only on its
         * PROCEDURAL path and passed the authored mesh through at ×1, which planted 0.6–1.7-unit
         * pylons in a world where the craft itself is 0.9 — scenery smaller than the aircraft
         * reads as litter, not landscape. One multiplier, both paths. */
        const s = (p.s || 1) * 1.9;
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
          const a = Math.round(clamp((1 - d / (F2 * 1.15)) * 3.2, 0, 1) * 122);
          // 0.78 rather than 0.62: flatter puffs stack into horizontal bars, which is what the
          // first screenshot showed the sky turning into. A cloud is a lump, not a stratum.
          cloudLayer.billboard(dx, q.y, dz, q.r, r, g, b, a, 0.78);
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
      // inside the deck the wall comes right in — that blindness is the mechanic
      app.scene.fog.start = FAR * (FOG_NEAR - (FOG_NEAR - 0.06) * k);
      app.scene.fog.end = FAR * (FOG_FAR - (FOG_FAR - 0.19) * k);
      return k;
    }

    /** the authored GLB has landed: {pylon,ring,spire,tower,crystal} → fitted protos */
    function setPropSet(set) {
      PROPSET = set || null;
      pickProp(currentPropKind);
    }
    let currentPropKind = 'pylon';
    function pickProp(kind) {
      currentPropKind = kind || 'pylon';
      if (!PROPSET) return;
      const p = PROPSET[currentPropKind] || PROPSET.pylon || PROPSET[Object.keys(PROPSET)[0]];
      if (!p || p === propProto) return;
      propProto = p;
      for (const e of propEnts) rebuildProp(e);
    }
    function setGateMesh(mesh, off, scale) {
      gateProto = { mesh, off: off || new pc.Vec3(0, 0, 0), scale: scale == null ? 1 : scale };
      for (const e of gateEnts) rebuildGate(e);
    }

    return { root, apply, update, weather, setPropSet, setGateMesh,
             skin: () => S, sunColour, sunDir: () => sunDir,
             setSun: d => { sunDir = d; },
             stats: () => ({ props: nProps, gates: nGates, puffs: nPuffs, theme: themeKey, night: !!S.night }) };
  }

  return { create, SKINS, skinFor, hex, NIGHT };
})();

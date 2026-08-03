/* ripmaster3030studios — Section 9 / PlayCanvas EVALUATION build: the world (S9PCWorld).
 *
 * ⚠ THIS IS A PROTOTYPE FOR COMPARISON, NOT A MIGRATION. It exists so the artist can look at
 *   `section9.html` (our hand-rolled WebGL) and `section9-engine.html` (this) side by side and
 *   decide. Nothing here is loaded by the shipping game; `section9.html` is untouched.
 *
 * What this module does: takes the SAME baked level our renderer eats — `models/world/*.wld`
 * (binary pos3+norm3 triangle soup) plus `*.cols.json` (the authored AABB set) — and turns it
 * into PlayCanvas meshes with real PBR materials.
 *
 *   S9PCWorld.LEVELS                 the same catalogue as S9World
 *   S9PCWorld.build(app, file)       → Promise<{root, boxes, spawns, bounds, stats}>
 *   S9PCWorld.collider(boxes)        → { hits, groundAt } — Section 9's own capsule params
 *
 * ⚑ The .wld parser is `RoninWorld.load()`, reused exactly as `js/section9-world.js` reuses it.
 *   One format, one parser. Kind classification is `S9World.kindOf()`, likewise reused — the
 *   collision box a triangle's centroid sits inside is what names the surface, which is the
 *   same trick `section9-gl.js` uses to pick a material.
 *
 * ⚑ A .wld carries NO uvs, NO materials and NO vertex colour. Our renderer derives all three
 *   per triangle from the face normal. This does the same thing, then hands the result to an
 *   engine that can actually use it: planar uv on the dominant axis, four material classes,
 *   procedurally generated albedo + normal + gloss maps, and tangents so the normal maps light.
 */
window.S9PCWorld = (function () {
  const BASE = 'models/world/';
  // one tuning knob left on the URL, because every look call in this prototype was settled by
  // A/B screenshots rather than by taste: ?nrm=0 turns the normal maps off entirely
  const _q = new URLSearchParams(location.search);
  const NRM = _q.has('nrm') && isFinite(+_q.get('nrm')) ? +_q.get('nrm') : 1;
  const TEXDIR = 'textures/';

  // Same three levels S9World lists, same `open` flag (outdoors keeps the sun).
  const LEVELS = [
    { file: 'arcade',  name: 'ARCADE PIT' },
    { file: 'vault',   name: 'THE VAULT' },
    { file: 'rooftop', name: 'ROOFTOP', open: true },
  ];
  const levelFor = f => LEVELS.find(l => l.file === f) || LEVELS[0];

  /* ── material classes ───────────────────────────────────────────────────────────────────
   * Four is enough to make the point and few enough to stay one draw call each. `tile` is
   * world-units per texture repeat; `metal`/`gloss` are the two numbers a metalness workflow
   * actually runs on, and they are the thing our forward shader has no way to express. */
  const MATS = {
    deck:  { name: 'deck',  tex: 'slab',     tint: [0.36, 0.37, 0.40], metal: 0.04, gloss: 0.34, tile: 0.19, bump: 0.85 },
    wall:  { name: 'wall',  tex: 'course',   tint: [0.44, 0.43, 0.47], metal: 0.03, gloss: 0.22, tile: 0.22, bump: 1.00 },
    metal: { name: 'metal', tex: 'brushed',  tint: [0.62, 0.64, 0.69], metal: 0.94, gloss: 0.70, tile: 0.85, bump: 0.55 },
    crate: { name: 'crate', tex: 'paint',    tint: [0.52, 0.26, 0.20], metal: 0.30, gloss: 0.52, tile: 0.75, bump: 0.70 },
    // a cabinet is a lacquered plastic-and-vinyl box, not a shipping crate — and in ARCADE PIT
    // it is two thirds of the geometry, so it is worth its own material rather than tinting the
    // whole arena the colour of a packing case
    cab:   { name: 'cab',   tex: 'paint',    tint: [0.27, 0.28, 0.34], metal: 0.14, gloss: 0.78, tile: 1.10, bump: 0.35 },
    /* ── outdoor classes, for arenas authored as places rather than as concrete yards ────────
     * These exist because retinting `wall` and `deck` can only ever produce a differently
     * coloured box. A lido has WATER in it, and planting, and canvas — surfaces whose gloss and
     * bump differ as much as their colour does, which is what stops a bright frame reading as a
     * flat poster. Each still carries a dusk tint, so an arena using them plays under `?tod=dusk`
     * without a hole in it. */
    water:  { name: 'water',  tex: 'paint',  tint: [0.09, 0.20, 0.26], metal: 0.02, gloss: 0.94, tile: 0.55, bump: 0.14 },
    plant:  { name: 'plant',  tex: 'course', tint: [0.14, 0.20, 0.12], metal: 0.00, gloss: 0.26, tile: 0.34, bump: 1.00 },
    awning: { name: 'awning', tex: 'paint',  tint: [0.34, 0.18, 0.16], metal: 0.02, gloss: 0.44, tile: 0.60, bump: 0.40 },
    trim:   { name: 'trim',   tex: 'slab',   tint: [0.50, 0.49, 0.51], metal: 0.02, gloss: 0.32, tile: 0.28, bump: 0.60 },
  };

  /* ── DAYLIGHT PALETTE — open arenas only ───────────────────────────────────────────────────
   * ⚑ MEASURED, and it is the correction to a real mistake. Switching the outdoor arenas to a
   * daylight sun and a pale haze (see s9pc-app.js TOD) bought brightness and local detail but
   * took mean saturation from 50.8% to 20.9% on DUST BOWL. The cause is above: every tint in
   * MATS is a NEUTRAL GREY. Under a dusk-orange sun and an orange haze, neutral grey comes back
   * orange, and the frame measured "saturated" because the LIGHT was coloured — the arena itself
   * had no colour in it at all. Light a grey box with white light and you get a grey box.
   *
   * The reference frames are bright AND saturated because their surfaces are PAINTED: cream
   * plaster, terracotta, teal trim, sand. That is albedo, not grading. So the honest fix is to
   * paint the arena rather than to prop the number back up with a coloured haze or a global
   * saturation crank — both of which would tint the sky and the operatives too.
   *
   * The values also do the legibility job the brief actually asked for: walls and ground go
   * BRIGHT (0.72–0.82) so a dark operative silhouette reads against them at any range, and the
   * saturated colour is spent on the small stuff — crates, cabinets — which is where it marks
   * cover without competing with a player. Interiors keep the concrete set: THE VAULT is a
   * concrete box, and it should look like one.
   *
   * ⚠ AND BRIGHTER IS NOT THE SAME AS MORE COLOURFUL — the first attempt at this table proved it
   * the expensive way. Near-white tints (wall 0.82/0.80/0.74) took DUST BOWL to mean luma 200 and
   * saturation DOWN again, 20.9% → 17.6%, because ACES desaturates as it compresses toward white:
   * pushing albedo up walks the whole frame into the part of the curve that removes chroma. So
   * these values carry real chroma at a MODERATE value — sand is genuinely orange (max−min over
   * max ≈ 42%), not a warm-tinted grey — and sit well below white so the tonemapper never has to
   * squeeze them. Value separation against a dark operative is already won at 0.60 vs the old
   * 0.36; it did not need 0.82. */
  const MATS_DAY = {
    deck:  [0.60, 0.50, 0.35],   // sand — the ground everything else is read against
    wall:  [0.70, 0.64, 0.52],   // warm cream plaster; bright enough to silhouette a body at range
    metal: [0.50, 0.57, 0.64],   // cool steel, so rails and pillars separate from the warm masonry
    crate: [0.68, 0.26, 0.18],   // terracotta — cover should be findable at a glance
    cab:   [0.10, 0.42, 0.46],   // teal lacquer, the complement that stops the frame going one-note
    water:  [0.10, 0.54, 0.60],  // the biggest saturated field in a lido, and it is FLAT — so it
                                 // reads as colour rather than as detail, exactly what is needed
    plant:  [0.24, 0.50, 0.21],
    awning: [0.82, 0.33, 0.30],
    trim:   [0.86, 0.84, 0.77],  // white stone: the brightest thing in frame, and only on edges
  };
  const ORDER = ['deck', 'wall', 'metal', 'crate', 'cab', 'water', 'plant', 'awning', 'trim'];
  const CABINET = /^(cab|skee|claw|prize|booth|rostrum|plinth)/i;

  /* Kind (from the authored box NAME) + face normal → material class. Same two inputs our GL
   * renderer uses; the difference is only what they select.
   *
   * ⚑ `ammo`, `shelf`, `stair`, `plat`, `perim` are the HAND-BUILT arenas' kinds — S9World.kindOf
   *   never emits them, so the baked-level path is unchanged by their presence here. An ammo crate
   *   is a crate and a shelving run is metal; a stair tread and a platform top are deck, because a
   *   surface you stand on should look like one from above and like the thing it is from the side. */
  function classOf(kind, ny, name) {
    /* Authored outdoor kinds win outright — a pool is a pool from every angle, so unlike `deck`
     * these must be decided BEFORE the up-facing test or the sides of a water box become wall. */
    if (kind === 'water' || kind === 'plant' || kind === 'awning' || kind === 'trim') return kind;
    if (kind === 'pillar' || kind === 'cover' || kind === 'shelf') return 'metal';
    if (kind === 'crate' || kind === 'ammo') return CABINET.test(String(name || '')) ? 'cab' : 'crate';
    if (ny > 0.5) return 'deck';
    return 'wall';
  }

  // ── tileable value-noise fbm ─────────────────────────────────────────────────────────────
  function rnd(seed) { let s = (seed >>> 0) || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  function fbm(n, seed, oct, base) {
    const out = new Float32Array(n * n); let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const g = Math.max(2, base << o), R = rnd(seed + o * 7919), grid = new Float32Array(g * g);
      for (let i = 0; i < g * g; i++) grid[i] = R();
      for (let y = 0; y < n; y++) {
        const fy = y / n * g, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
        const ra = (y0 % g) * g, rb = ((y0 + 1) % g) * g;
        for (let x = 0; x < n; x++) {
          const fx = x / n * g, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
          const a = x0 % g, b = (x0 + 1) % g;
          out[y * n + x] += amp * ((grid[ra + a] * (1 - sx) + grid[ra + b] * sx) * (1 - sy) +
                                   (grid[rb + a] * (1 - sx) + grid[rb + b] * sx) * sy);
        }
      }
      tot += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }

  function canvasOf(n) { const c = document.createElement('canvas'); c.width = c.height = n; return c; }

  /* Height field → tangent-space normal map (OpenGL/+Y convention, which is what PlayCanvas
   * expects). Sobel-free central difference is plenty at 512px. */
  function normalCanvas(h, n, strength) {
    const c = canvasOf(n), ctx = c.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const l = h[y * n + ((x - 1 + n) % n)], r = h[y * n + ((x + 1) % n)];
      const u = h[((y - 1 + n) % n) * n + x], dn = h[((y + 1) % n) * n + x];
      let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1;
      const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
      const o = (y * n + x) * 4;
      d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); return c;
  }
  function greyCanvas(v, n) {
    const c = canvasOf(n), ctx = c.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
    for (let i = 0; i < n * n; i++) { const g = Math.max(0, Math.min(255, v[i] * 255)) | 0; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g; d[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0); return c;
  }
  function rgbCanvas(rgb, n) {
    const c = canvasOf(n), ctx = c.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
    for (let i = 0; i < n * n; i++) {
      d[i * 4] = Math.max(0, Math.min(255, rgb[i * 3] * 255)); d[i * 4 + 1] = Math.max(0, Math.min(255, rgb[i * 3 + 1] * 255));
      d[i * 4 + 2] = Math.max(0, Math.min(255, rgb[i * 3 + 2] * 255)); d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); return c;
  }

  /* One texture set per class: albedo (rgb), height→normal, gloss (r). All tileable, all
   * generated — nothing sampled, which is the only kind of texture this repo can ship. */
  /* ⚑ THE STUDIO LOOK — DEFAULT ON. Flat albedo, structure kept, noise removed.
   * `?grit=1` returns the old gritty surfaces for comparison.
   * The reference art direction (bright stylised shooters) is not doing anything our renderer
   * cannot: it is DELETING. Every surface is a large flat field of one colour and the whole
   * detail budget goes into silhouette. What kills clarity here is the fbm + aggregate speckle
   * sprayed across exactly those large fields — high-frequency noise over the areas that need to
   * stay quiet, which the unsharp pass in the post stack then sharpens.
   * So clean mode keeps the JOINTS — slab seams and wall courses are structure the eye locks
   * onto, and the reference has them too in its cobbles and roof tiles — and drops the noise. */
  const CLEAN = (() => { try { return new URLSearchParams(location.search).get('grit') !== '1'; }
                         catch (e) { return true; } })();
  function makeTexSet(kind, N) {
    const px = N * N, alb = new Float32Array(px * 3), h = new Float32Array(px), gl = new Float32Array(px);
    if (kind === 'slab' || kind === 'course') {
      /* ⚑ A pure-noise floor is a bad floor, and not for taste reasons. At a 2.4 m repeat seen
       * from standing height every repeat is a long thin pixel footprint, and the blobs smear
       * into streaks that radiate from the vanishing point — which reads exactly like broken
       * anisotropic filtering. What our own arena textures get right is STRUCTURE: grid joints
       * the eye can lock onto. So the deck gets slab joints (2×2 per repeat) and the wall gets
       * horizontal courses, on a much larger world repeat. */
      const a = fbm(N, 11, 5, 4), b = fbm(N, 977, 4, 24), c = fbm(N, 4241, 2, 80);
      const nx = kind === 'slab' ? 2 : 1, ny = kind === 'slab' ? 2 : 4;
      const jw = 0.012;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const fx = (x / N * nx) % 1, fy = (y / N * ny) % 1;
        const dj = Math.min(Math.min(fx, 1 - fx) / (nx * jw), Math.min(fy, 1 - fy) / (ny * jw));
        const joint = dj < 1 ? (1 - dj) : 0;                                  // 1 inside a seam
        const agg = CLEAN ? 0 : (c[i] > 0.74 ? (c[i] - 0.74) * 2.4 : 0);       // aggregate speckle
        // per-slab tone variation, so no two panels read identical
        const cell = ((Math.floor(y / N * ny) * 7 + Math.floor(x / N * nx) * 13) % 5) / 5;
        /* clean: the panel-to-panel step survives (it is large-scale, and it is what stops a flat
         * field reading as a bug) but the per-texel noise does not */
        let v = CLEAN ? 0.82 + (cell - 0.5) * 0.07
                      : 0.70 + a[i] * 0.20 + (b[i] - 0.5) * 0.10 + agg * 0.35 + (cell - 0.5) * 0.10;
        v *= (1 - joint * 0.42);
        alb[i * 3] = v; alb[i * 3 + 1] = v * 0.995; alb[i * 3 + 2] = v * 1.02;
        h[i] = (CLEAN ? 0 : a[i] * 0.35 + agg * 0.7) - joint * 1.6;            // seams sink
        gl[i] = CLEAN ? 0.30 - joint * 0.10 : 0.34 + (1 - b[i]) * 0.16 - agg * 0.10 - joint * 0.12;
      }
    } else if (kind === 'brushed') {
      const streak = fbm(N, 313, 4, 6), fine = fbm(N, 8081, 3, 64);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        // stretched along x → a brushed grain, which is what makes metal read as metal
        const s = streak[y * N + ((x * 8) % N)], f = fine[y * N + ((x * 24) % N)];
        const v = CLEAN ? 0.84 : 0.80 + (s - 0.5) * 0.22 + (f - 0.5) * 0.10;
        alb[i * 3] = v * 0.99; alb[i * 3 + 1] = v; alb[i * 3 + 2] = v * 1.04;
        h[i] = s * 0.35 + f * 0.25;
        gl[i] = 0.62 + (s - 0.5) * 0.30 + (f - 0.5) * 0.12;
      }
    } else {                                                                   // paint over metal
      const chip = fbm(N, 5501, 4, 8), grain = fbm(N, 7717, 3, 40);
      for (let i = 0; i < px; i++) {
        const worn = chip[i] > 0.66 ? (chip[i] - 0.66) * 3 : 0;
        const v = 0.86 + (grain[i] - 0.5) * 0.10;
        alb[i * 3] = v * (1 - worn * 0.35) + worn * 0.42;                      // chips back to bare metal
        alb[i * 3 + 1] = v * (1 - worn * 0.45) + worn * 0.44;
        alb[i * 3 + 2] = v * (1 - worn * 0.45) + worn * 0.48;
        h[i] = grain[i] * 0.2 + worn * 0.7;
        gl[i] = 0.55 - worn * 0.28 + (grain[i] - 0.5) * 0.12;
      }
    }
    const strength = (kind === 'slab' || kind === 'course') ? 1.6 : 1.0;
    return { albedo: rgbCanvas(alb, N), normal: normalCanvas(h, N, strength), gloss: greyCanvas(gl, N) };
  }

  /* Accepts a <canvas> (the generator above) or an <img> (a baked PNG) — same two properties. */
  function texFrom(app, canvas, srgb) {
    const t = new pc.Texture(app.graphicsDevice, {
      name: 'proc', width: canvas.width, height: canvas.height,
      format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8,
      mipmaps: true, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
      anisotropy: (app.graphicsDevice.maxAnisotropy || 1),
    });
    t.setSource(canvas);
    return t;
  }

  /* ── BAKED PBR MAPS — `textures/<class>_{albedo,normal,orm}.png` ─────────────────────────────
   * Authored as node graphs and baked in Blender by `npm run textures`
   * (scripts/blender/bake-materials.py). The canvas generator above stays as the FALLBACK, per
   * class, and this whole block is written so that any failure — no manifest, a 404, a decode
   * error, no `fetch` at all — lands back on it silently. Fail-open at every step is the standing
   * principle here, and a missing texture file must never be the reason an arena does not load.
   *
   * ⚑ THE SWAP IS LIVE, and that is what makes the fallback honest rather than a race. A material
   *   is a live object in PlayCanvas: set `diffuseMap` and call `update()` and the next frame uses
   *   it. So materials() never waits. It builds with whatever is ready — baked if the PNGs have
   *   landed, canvas if they have not — and a class that arrives late swaps itself in afterwards.
   *   The alternative (block the arena build on a fetch) turns a slow network into a black screen.
   *
   * ⚑ ONE image carries three channels: `_orm` is R = ambient occlusion, G = roughness,
   *   B = metalness, so it is one fetch and one texture unit rather than two. PlayCanvas addresses
   *   the channels directly (`aoMapChannel` / `glossMapChannel`), and `glossInvert` is what lets
   *   a ROUGHNESS map drive a gloss slot — the engine's own glTF loader does exactly this.
   *
   * ⚠ On the baked path `bumpiness` is NOT `MATS[key].bump`. The relief is authored in metres in
   *   the bake (`CLASSES` in bake-materials.py), so scaling it again at runtime would be two
   *   strengths for one thing. MATS.bump still drives the canvas fallback, where it is the only
   *   place the strength can live. `?nrm=0` still kills normals on both paths.
   *
   * ⚠ The albedo maps are near-neutral BY DESIGN so the MATS/MATS_DAY tints keep doing the
   *   colouring — see the long note on MATS_DAY above; baking colour in would double-tint. */
  const TEXQ = (() => { try { return _q.get('tex') || ''; } catch (e) { return ''; } })();
  const BAKED = { man: null, cls: Object.create(null), started: Object.create(null), demand: [] };
  const MADE = [];                                  // every material built, for the late swap

  function bakedOn() {
    // ?tex=canvas forces the generator. ?grit=1 asks for the OLD gritty canvas surfaces by name,
    // so it selects the generator too — otherwise the flag would silently do nothing.
    return TEXQ !== 'canvas' && CLEAN && typeof fetch === 'function' && typeof Image === 'function';
  }

  function loadImg(url) {
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);                 // a 404 is a fallback, not an error
      im.src = url;
    });
  }

  /* Pull one class's three maps. Resolves either way; a partial set is treated as no set, because
   * half-baked (albedo from the PNG, normal from the canvas) is a look nobody chose. */
  function wantClass(key) {
    if (!bakedOn() || BAKED.started[key]) return;
    const man = BAKED.man;
    /* ⚠ REMEMBER THE ASK. The manifest is a fetch and the arena can be built before it lands — on
     * a weak device (no prefetch) that is the NORMAL order, so dropping the request here would
     * mean the baked maps never load at all on exactly the machines that asked for them by name. */
    if (!man) { if (BAKED.demand.indexOf(key) < 0) BAKED.demand.push(key); return; }
    if (!man.classes || !man.classes[key]) return;
    BAKED.started[key] = true;
    const f = man.classes[key];
    Promise.all([loadImg(TEXDIR + f.albedo), loadImg(TEXDIR + f.normal), loadImg(TEXDIR + f.orm)])
      .then(([a, n, o]) => {
        if (!a || !n || !o) return;
        BAKED.cls[key] = { albedo: a, normal: n, orm: o };
        for (const r of MADE) if (r.key === key && !r.baked) dressBaked(r);
      })
      .catch(() => {});
  }

  function dressBaked(rec) {
    const B = BAKED.cls[rec.key];
    if (!B || !rec.app) return false;
    try {
      const m = rec.mat, orm = texFrom(rec.app, B.orm, false);
      /* Hand back the generated textures this material was wearing. texFrom() builds a NEW
       * pc.Texture per material even though the source canvas is shared, so these are this
       * material's own and nothing else is pointing at them — but they are GPU memory, and a
       * swap that only reassigns the slot keeps every one of them uploaded for the session. */
      for (const t of [m.diffuseMap, m.normalMap, m.glossMap]) { if (t && t.destroy) t.destroy(); }
      m.diffuseMap = texFrom(rec.app, B.albedo, true);
      m.normalMap = texFrom(rec.app, B.normal, false);
      /* ⚠ THE GRAIN IS NOT THE NORMAL MAP — SWEPT, AND THE EXPECTED ANSWER DID NOT REPRODUCE.
       * The baked arenas measure mean |Laplacian| 13–15 against docs/ART-DIRECTION.md's 6.0–9.5
       * band; on screen that is salt-and-pepper speckle on every stone surface. The obvious
       * suspect was this map, and the bake's own report claimed removing it took edge 24.56 → 3.32.
       * Swept `?nrm=` on a PLANTED camera (same pose every sample, so the numbers are comparable):
       *     LIDO      1 → 13.02   0.6 → 12.14   0.35 → 11.56   0.2 → 11.24   0.1 → 13.02→11.13
       *     KOWLOON   1 → 15.40   0.6 → 14.09   0.35 → 13.40   0.2 → 13.14   0.1 → 12.92
       * A 10× reduction in normal strength buys ~2 points of edge and none of the band. So the
       * residual lives in the ALBEDO's own high-frequency content and/or the post chain's
       * sharpness (0.70, carried from a sweep on the pre-bake frames and never re-derived against
       * textured ones — CAS amplifies exactly this kind of speckle).
       * ⚑ Left at NRM: turning it down is paying real relief for ~2 points of a 6-point problem.
       * The next pass belongs in the bake's albedo and in POST.sharpness, not here. */
      m.bumpiness = NRM;                            // relief is authored in the map — see above
      m.glossMap = orm;
      m.glossMapChannel = 'g';
      m.glossInvert = true;                         // the G channel is ROUGHNESS, not gloss
      m.gloss = 1;
      m.aoMap = orm;
      m.aoMapChannel = 'r';
      m.update();
      rec.baked = true;
      return true;
    } catch (e) { console.warn('[s9pc] baked textures failed for ' + rec.key + ':', e && e.message); }
    return false;
  }

  /* Manifest first, then the maps. The manifest exists so that a build with no `textures/` yet
   * costs ONE 404 instead of twenty-seven — and so the console of a normal run is clean, which is
   * the only state in which a real 404 is visible. */
  if (bakedOn()) {
    fetch(TEXDIR + 'manifest.json')
      .then(r => (r.ok ? r.json() : null))
      .then(m => {
        if (!m || !m.classes) return;
        BAKED.man = m;
        /* Prefetch, but only on a machine that can afford it. `GfxPost.dprCap()` is this repo's
         * ONE definition of "weak device" (touch + small screen + low cores/memory + save-data);
         * reusing it means the texture budget and the resolution budget can never disagree. On a
         * weak device the maps still load — just on demand, so an arena pays for the classes it
         * actually contains rather than for all nine. */
        let weak = false;
        try { weak = !!(window.GfxPost && GfxPost.dprCap && GfxPost.dprCap() < 2); } catch (e) {}
        for (const k of (weak ? BAKED.demand.slice() : ORDER)) wantClass(k);
      })
      .catch(() => {});
  }

  /* Two material sets, cached separately — the textures are shared (the tint is a multiplier on
   * the same albedo map), so the second set costs five materials, not a second texture bake. */
  const TEXSETS = {};
  let TEXCACHE = {};
  const DAY = (() => { try { return new URLSearchParams(location.search).get('tod') !== 'dusk'; }
    catch (e) { return true; } })();
  /* `used` is the set of classes this arena actually has triangles in. It is an optimisation with
   * a correctness edge: the cache is now PER CLASS, not per set, so an arena asking for five
   * classes cannot poison the cache for a later arena that needs nine. */
  function materials(app, open, used) {
    const day = !!open && DAY, key0 = day ? 'day' : 'base';
    const out = TEXCACHE[key0] || (TEXCACHE[key0] = {});
    const N = 512;
    for (const key of ORDER) {
      if (out[key] || (used && !used.has(key))) continue;
      const M = MATS[key], m = new pc.StandardMaterial();
      const tint = day ? MATS_DAY[key] : M.tint;
      m.name = 's9pc-' + key + (day ? '-day' : '');
      m.diffuse = new pc.Color(tint[0], tint[1], tint[2]);
      m.useMetalness = true;
      m.metalness = M.metal;
      m.diffuseMapTint = true;
      const rec = { key, mat: m, app, baked: false };
      MADE.push(rec);
      wantClass(key);
      if (!dressBaked(rec)) {                       // not here yet (or off) → the generator
        if (!TEXSETS[M.tex]) TEXSETS[M.tex] = makeTexSet(M.tex, N);
        const s = TEXSETS[M.tex];
        m.diffuseMap = texFrom(app, s.albedo, true);
        m.normalMap = texFrom(app, s.normal, false);
        m.bumpiness = M.bump * NRM;
        m.glossMap = texFrom(app, s.gloss, false);
        m.glossMapChannel = 'r';
        m.gloss = M.gloss;
        m.update();
      }
      out[key] = { mat: m, tile: M.tile };
    }
    return out;
  }

  /* ── triangle soup → one PlayCanvas mesh per material class ───────────────────────────────
   * `kindOf` is a per-triangle kind array (from the owning collision box for a baked level, or
   * straight off the solid for a hand-built one) and `nameOf` an optional per-triangle name.
   * Everything below is shared by both arena kinds. */
  /* ⚑ `clsOf` IS AN EXPLICIT OVERRIDE AND IT EXISTS BECAUSE `classOf` IS NOT IDEMPOTENT.
   * `classOf` translates an S9World *kind* (from an authored object's name) into a material
   * *class*, and for five of the nine classes the two vocabularies do not overlap: hand it
   * `'metal'` and it matches none of its cases, falls through to the up-facing test and returns
   * `'deck'`. A generator that already KNOWS what it is emitting therefore had its roads silently
   * repainted sand and its teal shopfronts repainted cream — no error, right geometry, wrong
   * colour, which is the third time that exact failure shape has appeared in this pipeline.
   * ⚠ Making `classOf` idempotent would NOT be the fix: `'wall'` is both a class AND kindOf's
   *   default, and a baked level relies on `'wall' + ny > 0.5` becoming `deck` so floors are
   *   floors. So the override is a separate channel rather than a smarter guess. */
  function meshParts(app, V, kindOf, nameOf, open, clsOf) {
    const tris = (V.length / 18) | 0;                              // 3 verts × 6 floats

    /* ⚠ THE INTERLEAVE IS pos3 + norm3, SO THE NORMAL STARTS AT +3, NOT AT +0 — and getting that
     * wrong reads the X component where Y was meant. Per triangle the three vertices sit at
     * o, o+6, o+12, and their normals at (o+3,o+4,o+5), (o+9,o+10,o+11), (o+15,o+16,o+17). The
     * prototype averaged o+3 / o+9 / o+15 and called it `ny`; that is `nx`.
     *
     * It is worth spelling out what that cost, because it was invisible as a bug and obvious as a
     * "look": every FLOOR in the game (n = +Y, so nx = 0) failed the `ny > 0.5` up-facing test and
     * went into the WALL bucket, and then took the ±x wall's uv projection — (z, y) — where y is
     * constant across a floor. A constant v samples ONE ROW of the wall texture and stretches it
     * over the whole arena, so the ground came out flat, streaked along z, and whatever colour
     * that row happened to be. On ARCADE PIT it made the floor read 4× darker than the walls it
     * is lit better than. The prototype blamed the streaks on missing tangents; tangents were a
     * real second bug, but this is the one that was drawing the floor. */
    const nrm = (o) => [
      (V[o + 3] + V[o + 9] + V[o + 15]) / 3,
      (V[o + 4] + V[o + 10] + V[o + 16]) / 3,
      (V[o + 5] + V[o + 11] + V[o + 17]) / 3,
    ];
    // bucket by class
    const buckets = {}; for (const k of ORDER) buckets[k] = [];
    for (let t = 0; t < tris; t++) {
      const o = t * 18, n = nrm(o);
      const forced = clsOf && clsOf[t];
      buckets[(forced && buckets[forced]) ? forced
              : classOf(kindOf ? kindOf[t] : 'wall', n[1], nameOf ? nameOf[t] : '')].push(t);
    }
    /* Bucket FIRST, then ask for materials — an arena only pays (in texture fetches and in canvas
     * generation) for the classes it actually contains. Every built-in arena is five of the nine. */
    const used = new Set(ORDER.filter(k => buckets[k].length));
    const mats = materials(app, open, used);

    const out = [], stats = {};
    for (const key of ORDER) {
      const list = buckets[key]; if (!list.length) continue;
      stats[key] = list.length;
      const n = list.length * 3;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      const idx = new Uint32Array(n);
      const tile = mats[key].tile;
      for (let i = 0; i < list.length; i++) {
        const o = list[i] * 18;
        /* Planar uv on the two axes the face does NOT point along — the same projection our GL
         * renderer derives, only here it also has to feed a normal map. Drop the dominant axis of
         * the face normal and keep the other two; the surface then never degenerates to a
         * constant coordinate, which is the failure that flattened every floor. */
        const n = nrm(o);
        const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
        let uAxis, vAxis;
        if (ay >= ax && ay >= az) { uAxis = 0; vAxis = 2; }         // up/down-facing → xz
        else if (ax >= az) { uAxis = 2; vAxis = 1; }                // faces ±x → zy
        else { uAxis = 0; vAxis = 1; }                              // faces ±z → xy
        for (let v = 0; v < 3; v++) {
          const s = o + v * 6, d3 = (i * 3 + v) * 3, d2 = (i * 3 + v) * 2;
          pos[d3] = V[s]; pos[d3 + 1] = V[s + 1]; pos[d3 + 2] = V[s + 2];
          nor[d3] = V[s + 3]; nor[d3 + 1] = V[s + 4]; nor[d3 + 2] = V[s + 5];
          uv[d2] = V[s + uAxis] * tile; uv[d2 + 1] = V[s + vAxis] * tile;
          idx[i * 3 + v] = i * 3 + v;
        }
      }
      const mesh = new pc.Mesh(app.graphicsDevice);
      mesh.setPositions(pos); mesh.setNormals(nor); mesh.setUvs(0, uv); mesh.setIndices(idx);
      /* ⚠ Tangents are NOT optional and `mesh.calculateTangents()` DOES NOT EXIST — that method
       * is on pc.Geometry, so a `mesh.calculateTangents && …` guard silently does nothing and
       * the normal maps then light off a derivative-guessed basis. On a big floor plane that
       * reads as long streaks radiating from the vanishing point, which looks exactly like a
       * mipmap/anisotropy fault and is not one. `pc.calculateTangents` is the free function. */
      try {
        const tan = pc.calculateTangents(pos, nor, uv, idx);
        if (tan && tan.length) mesh.setVertexStream(pc.SEMANTIC_TANGENT, tan, 4);
      } catch (e) { console.warn('[s9pc] tangents failed for ' + key + ':', e && e.message); }
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      out.push({ mesh, material: mats[key].mat, key });
    }
    return { parts: out, stats };
  }

  /* ── the SIX hand-built arenas → the same PBR mesh set ────────────────────────────────────
   * A baked level arrives as triangle soup; a hand-built one arrives as `MAP.solids`, a list of
   * AABBs. The renderer wants one thing, so this turns the boxes into triangles and then walks
   * exactly the same bucket/UV/tangent path a `.wld` walks. Nothing downstream knows which kind
   * of arena it is looking at, which is the whole point — the six built-ins get real materials,
   * shadows and IBL without a second renderer.
   *
   * ⚑ Every box gets all six faces. A perimeter wall is a solid whose INWARD face is one of its
   *   own outward faces, so back-face culling shows exactly the right side from inside the arena
   *   and nothing at all from outside it. The two exceptions worth spending triangles on are the
   *   arena floor (there is no solid for it — the hand-built maps treat y=0 as the ground plane)
   *   and, indoors, a ceiling: without one an interior has a hole where the sky is, and the sky
   *   at floor level inside a concrete room is the exact artefact CLAUDE.md records as reading
   *   like a rendering fault. */
  function boxSoup(MAP) {
    const V = [];                                   // pos3 + norm3 interleaved, 3 verts per tri
    const kinds = [];                               // one kind per triangle, parallel to V
    const clss = [];                                // …and an optional explicit class override
    /* ⚠ WINDING. `a,b,c,d` are listed anticlockwise as seen from OUTSIDE the surface, and
     * PlayCanvas's front face is CCW — but the triangles have to be emitted `a,c,b` / `a,d,c` for
     * that to hold. Emitting them in the obvious `a,b,c` order produces the mirror winding and
     * every box in the arena renders inside-out: the near faces are culled and you look straight
     * through a crate at the inside of its far wall, which reads as "the geometry didn't load".
     * Checked, not guessed — for the top face, (P5−P4)×(P6−P5) = (0, −(x1−x0)(z1−z0), 0), i.e.
     * −Y, while the declared normal is +Y. Lighting uses the declared normal, so this is a
     * CULLING bug only, which is exactly why it looks like missing geometry rather than bad shading. */
    function quad(a, b, c, d, n, kind, cls) {
      const t = [[a, c, b], [a, d, c]];
      for (const tri of t) {
        for (const p of tri) { V.push(p[0], p[1], p[2], n[0], n[1], n[2]); }
        kinds.push(kind); clss.push(cls || null);
      }
    }
    function box(x0, y0, z0, x1, y1, z1, kind, cls) {
      const P = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
                 [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
      quad(P[4], P[5], P[6], P[7], [0, 1, 0], kind, cls);          // top
      quad(P[3], P[2], P[1], P[0], [0, -1, 0], kind, cls);         // bottom
      quad(P[0], P[1], P[5], P[4], [0, 0, -1], kind, cls);         // −z
      quad(P[2], P[3], P[7], P[6], [0, 0, 1], kind, cls);          // +z
      quad(P[1], P[2], P[6], P[5], [1, 0, 0], kind, cls);          // +x
      quad(P[3], P[0], P[4], P[7], [-1, 0, 0], kind, cls);         // −x
    }
    const pad = 1.2;
    // ground plane — the hand-built arenas have no floor solid; y=0 IS the ground
    quad([MAP.x0 - pad, 0, MAP.z0 - pad], [MAP.x1 + pad, 0, MAP.z0 - pad],
         [MAP.x1 + pad, 0, MAP.z1 + pad], [MAP.x0 - pad, 0, MAP.z1 + pad], [0, 1, 0], 'plat');
    for (const b of MAP.solids) box(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, b.kind || 'wall', b.cls);
    if (!MAP.open) {                                 // a lid, so an interior is an interior
      const cy = MAP.ceilY || 6;
      quad([MAP.x0 - pad, cy, MAP.z1 + pad], [MAP.x1 + pad, cy, MAP.z1 + pad],
           [MAP.x1 + pad, cy, MAP.z0 - pad], [MAP.x0 - pad, cy, MAP.z0 - pad], [0, -1, 0], 'wall');
    }
    return { verts: new Float32Array(V), kinds, clss };
  }

  /* Build the render meshes for ANY Section 9 map — baked (`MAP.mesh.verts`) or hand-built
   * (`MAP.solids`). One entry point, so the app never branches on arena kind. */
  function buildFor(app, MAP) {
    const t0 = performance.now();
    const baked = !!(MAP.mesh && MAP.mesh.verts && MAP.mesh.verts.length);
    let verts, ownerKind, ownerName, ownerCls = null;
    if (baked) {
      verts = MAP.mesh.verts;
      const boxes = MAP.solids || [];
      const tris = (verts.length / 18) | 0, eps = 0.06;
      const kk = new Array(tris), nn = new Array(tris), cc = new Array(tris);
      for (let t = 0; t < tris; t++) {
        const o = t * 18;
        const cx = (verts[o] + verts[o + 6] + verts[o + 12]) / 3;
        const cy = (verts[o + 1] + verts[o + 7] + verts[o + 13]) / 3;
        const cz = (verts[o + 2] + verts[o + 8] + verts[o + 14]) / 3;
        let k = null;
        for (let i = 0; i < boxes.length; i++) { const b = boxes[i];
          if (cx >= b.x0 - eps && cx <= b.x1 + eps && cy >= b.y0 - eps && cy <= b.y1 + eps &&
              cz >= b.z0 - eps && cz <= b.z1 + eps) { k = b; break; } }
        kk[t] = k ? k.kind : 'wall'; nn[t] = k ? k.name : ''; cc[t] = k ? (k.cls || null) : null;
      }
      ownerKind = kk; ownerName = nn; ownerCls = cc;
    } else {
      const s = boxSoup(MAP); verts = s.verts; ownerKind = s.kinds; ownerName = null; ownerCls = s.clss;
    }
    const { parts, stats } = meshParts(app, verts, ownerKind, ownerName, !!MAP.open, ownerCls);
    const root = new pc.Entity('level');
    const instances = parts.map(p => { const mi = new pc.MeshInstance(p.mesh, p.material, root); mi.castShadow = true; return mi; });
    root.addComponent('render', { meshInstances: instances, castShadows: true, receiveShadows: true });
    (app.__worldMirror || app.root).addChild(root);   // under the world mirror — see s9pc-app.js
    return { root, parts,
      stats: Object.assign({ tris: (verts.length / 18) | 0, boxes: (MAP.solids || []).length, parts: parts.length,
        buildMs: +(performance.now() - t0).toFixed(1), baked }, stats) };
  }

  /* ⚑ `build(app, file)` and `collider(boxes)` used to live here. Both are gone on purpose:
   * the level catalogue, the AABB set and the capsule numbers now come from `S9Game`, which owns
   * collision for BOTH arena kinds and is the same code the shipping game runs. Two colliders is
   * how a build ends up standing in a different place than the one it is being compared against.
   */

  return { LEVELS, buildFor, materials, MATS, classOf, boxSoup };
})();

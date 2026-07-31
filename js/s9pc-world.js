/* upperdeckripmaster3030 — Section 9 / PlayCanvas EVALUATION build: the world (S9PCWorld).
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
  };
  const ORDER = ['deck', 'wall', 'metal', 'crate', 'cab'];
  const CABINET = /^(cab|skee|claw|prize|booth|rostrum|plinth)/i;

  /* Kind (from the authored box NAME) + face normal → material class. Same two inputs our GL
   * renderer uses; the difference is only what they select.
   *
   * ⚑ `ammo`, `shelf`, `stair`, `plat`, `perim` are the HAND-BUILT arenas' kinds — S9World.kindOf
   *   never emits them, so the baked-level path is unchanged by their presence here. An ammo crate
   *   is a crate and a shelving run is metal; a stair tread and a platform top are deck, because a
   *   surface you stand on should look like one from above and like the thing it is from the side. */
  function classOf(kind, ny, name) {
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
        const agg = c[i] > 0.74 ? (c[i] - 0.74) * 2.4 : 0;                    // aggregate speckle
        // per-slab tone variation, so no two panels read identical
        const cell = ((Math.floor(y / N * ny) * 7 + Math.floor(x / N * nx) * 13) % 5) / 5;
        let v = 0.70 + a[i] * 0.20 + (b[i] - 0.5) * 0.10 + agg * 0.35 + (cell - 0.5) * 0.10;
        v *= (1 - joint * 0.42);
        alb[i * 3] = v; alb[i * 3 + 1] = v * 0.995; alb[i * 3 + 2] = v * 1.02;
        h[i] = a[i] * 0.35 + agg * 0.7 - joint * 1.6;                          // seams sink
        gl[i] = 0.34 + (1 - b[i]) * 0.16 - agg * 0.10 - joint * 0.12;
      }
    } else if (kind === 'brushed') {
      const streak = fbm(N, 313, 4, 6), fine = fbm(N, 8081, 3, 64);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        // stretched along x → a brushed grain, which is what makes metal read as metal
        const s = streak[y * N + ((x * 8) % N)], f = fine[y * N + ((x * 24) % N)];
        const v = 0.80 + (s - 0.5) * 0.22 + (f - 0.5) * 0.10;
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

  let TEXCACHE = null;
  function materials(app) {
    if (TEXCACHE) return TEXCACHE;
    const N = 512, sets = {};
    for (const k of ['slab', 'course', 'brushed', 'paint']) sets[k] = makeTexSet(k, N);
    const out = {};
    for (const key of ORDER) {
      const M = MATS[key], s = sets[M.tex], m = new pc.StandardMaterial();
      m.name = 's9pc-' + key;
      m.diffuse = new pc.Color(M.tint[0], M.tint[1], M.tint[2]);
      m.diffuseMap = texFrom(app, s.albedo, true);
      m.normalMap = texFrom(app, s.normal, false);
      m.bumpiness = M.bump * NRM;
      m.glossMap = texFrom(app, s.gloss, false);
      m.glossMapChannel = 'r';
      m.gloss = M.gloss;
      m.useMetalness = true;
      m.metalness = M.metal;
      m.diffuseMapTint = true;
      m.update();
      out[key] = { mat: m, tile: M.tile };
    }
    return (TEXCACHE = out);
  }

  /* ── triangle soup → one PlayCanvas mesh per material class ───────────────────────────────
   * `kindOf` is a per-triangle kind array (from the owning collision box for a baked level, or
   * straight off the solid for a hand-built one) and `nameOf` an optional per-triangle name.
   * Everything below is shared by both arena kinds. */
  function meshParts(app, V, kindOf, nameOf) {
    const tris = (V.length / 18) | 0;                              // 3 verts × 6 floats
    const mats = materials(app);

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
      buckets[classOf(kindOf ? kindOf[t] : 'wall', n[1], nameOf ? nameOf[t] : '')].push(t);
    }

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
    /* ⚠ WINDING. `a,b,c,d` are listed anticlockwise as seen from OUTSIDE the surface, and
     * PlayCanvas's front face is CCW — but the triangles have to be emitted `a,c,b` / `a,d,c` for
     * that to hold. Emitting them in the obvious `a,b,c` order produces the mirror winding and
     * every box in the arena renders inside-out: the near faces are culled and you look straight
     * through a crate at the inside of its far wall, which reads as "the geometry didn't load".
     * Checked, not guessed — for the top face, (P5−P4)×(P6−P5) = (0, −(x1−x0)(z1−z0), 0), i.e.
     * −Y, while the declared normal is +Y. Lighting uses the declared normal, so this is a
     * CULLING bug only, which is exactly why it looks like missing geometry rather than bad shading. */
    function quad(a, b, c, d, n, kind) {
      const t = [[a, c, b], [a, d, c]];
      for (const tri of t) {
        for (const p of tri) { V.push(p[0], p[1], p[2], n[0], n[1], n[2]); }
        kinds.push(kind);
      }
    }
    function box(x0, y0, z0, x1, y1, z1, kind) {
      const P = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
                 [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
      quad(P[4], P[5], P[6], P[7], [0, 1, 0], kind);          // top
      quad(P[3], P[2], P[1], P[0], [0, -1, 0], kind);         // bottom
      quad(P[0], P[1], P[5], P[4], [0, 0, -1], kind);         // −z
      quad(P[2], P[3], P[7], P[6], [0, 0, 1], kind);          // +z
      quad(P[1], P[2], P[6], P[5], [1, 0, 0], kind);          // +x
      quad(P[3], P[0], P[4], P[7], [-1, 0, 0], kind);         // −x
    }
    const pad = 1.2;
    // ground plane — the hand-built arenas have no floor solid; y=0 IS the ground
    quad([MAP.x0 - pad, 0, MAP.z0 - pad], [MAP.x1 + pad, 0, MAP.z0 - pad],
         [MAP.x1 + pad, 0, MAP.z1 + pad], [MAP.x0 - pad, 0, MAP.z1 + pad], [0, 1, 0], 'plat');
    for (const b of MAP.solids) box(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, b.kind || 'wall');
    if (!MAP.open) {                                 // a lid, so an interior is an interior
      const cy = MAP.ceilY || 6;
      quad([MAP.x0 - pad, cy, MAP.z1 + pad], [MAP.x1 + pad, cy, MAP.z1 + pad],
           [MAP.x1 + pad, cy, MAP.z0 - pad], [MAP.x0 - pad, cy, MAP.z0 - pad], [0, -1, 0], 'wall');
    }
    return { verts: new Float32Array(V), kinds };
  }

  /* Build the render meshes for ANY Section 9 map — baked (`MAP.mesh.verts`) or hand-built
   * (`MAP.solids`). One entry point, so the app never branches on arena kind. */
  function buildFor(app, MAP) {
    const t0 = performance.now();
    const baked = !!(MAP.mesh && MAP.mesh.verts && MAP.mesh.verts.length);
    let verts, ownerKind, ownerName;
    if (baked) {
      verts = MAP.mesh.verts;
      const boxes = MAP.solids || [];
      const tris = (verts.length / 18) | 0, eps = 0.06;
      const kk = new Array(tris), nn = new Array(tris);
      for (let t = 0; t < tris; t++) {
        const o = t * 18;
        const cx = (verts[o] + verts[o + 6] + verts[o + 12]) / 3;
        const cy = (verts[o + 1] + verts[o + 7] + verts[o + 13]) / 3;
        const cz = (verts[o + 2] + verts[o + 8] + verts[o + 14]) / 3;
        let k = null;
        for (let i = 0; i < boxes.length; i++) { const b = boxes[i];
          if (cx >= b.x0 - eps && cx <= b.x1 + eps && cy >= b.y0 - eps && cy <= b.y1 + eps &&
              cz >= b.z0 - eps && cz <= b.z1 + eps) { k = b; break; } }
        kk[t] = k ? k.kind : 'wall'; nn[t] = k ? k.name : '';
      }
      ownerKind = kk; ownerName = nn;
    } else {
      const s = boxSoup(MAP); verts = s.verts; ownerKind = s.kinds; ownerName = null;
    }
    const { parts, stats } = meshParts(app, verts, ownerKind, ownerName);
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

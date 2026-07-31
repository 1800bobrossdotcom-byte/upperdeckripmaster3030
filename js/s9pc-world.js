/* upperdeckripmaster3030 — Section 9 / PlayCanvas EVALUATION build: the world (S9PCWorld).
 *
 * ⚠ THIS IS A PROTOTYPE FOR COMPARISON, NOT A MIGRATION. It exists so the artist can look at
 *   `section9.html` (our hand-rolled WebGL) and `section9-pc.html` (this) side by side and
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
   * renderer uses; the difference is only what they select. */
  function classOf(kind, ny, name) {
    if (kind === 'pillar' || kind === 'cover') return 'metal';
    if (kind === 'crate') return CABINET.test(String(name || '')) ? 'cab' : 'crate';
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

  /* ── .wld triangle soup → one PlayCanvas mesh per material class ───────────────────────── */
  function buildMeshes(app, w, boxes) {
    const V = w.verts, tris = (V.length / 18) | 0;                 // 3 verts × 6 floats
    const mats = materials(app);

    // triangle → owning box, by the collision box its centroid sits in. Same rule section9-gl.js
    // uses to pick a surface material — those boxes ARE the authored objects, so they name it.
    const owner = new Array(tris);
    const eps = 0.06;
    for (let t = 0; t < tris; t++) {
      const o = t * 18;
      const cx = (V[o] + V[o + 6] + V[o + 12]) / 3, cy = (V[o + 1] + V[o + 7] + V[o + 13]) / 3, cz = (V[o + 2] + V[o + 8] + V[o + 14]) / 3;
      let k = null;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (cx >= b.lo[0] - eps && cx <= b.hi[0] + eps && cy >= b.lo[1] - eps && cy <= b.hi[1] + eps &&
            cz >= b.lo[2] - eps && cz <= b.hi[2] + eps) { k = b; break; }
      }
      owner[t] = k;
    }

    // bucket by class
    const buckets = {}; for (const k of ORDER) buckets[k] = [];
    for (let t = 0; t < tris; t++) {
      const o = t * 18, ny = (V[o + 3] + V[o + 9] + V[o + 15]) / 3, b = owner[t];
      buckets[classOf(b ? b.__kind : 'wall', ny, b ? b.name : '')].push(t);
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
        // planar uv on the axis the face points along least — the same projection our GL
        // renderer derives, only here it feeds a normal map as well as an albedo
        const ax = Math.abs(V[o + 3] + V[o + 9] + V[o + 15]) / 3;
        const az = Math.abs(V[o + 5] + V[o + 11] + V[o + 17]) / 3;
        const axx = Math.abs(V[o + 4] + V[o + 10] + V[o + 16]) / 3;
        let uAxis, vAxis;
        if (ax >= axx && ax >= az) { uAxis = 0; vAxis = 2; }        // up-facing → xz
        else if (axx >= az) { uAxis = 2; vAxis = 1; }               // faces ±x → zy
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

  /* ── Section 9's own collider, ported verbatim in spirit ─────────────────────────────────
   * r 0.42 / h 1.72 / step 0.62 are the shipping game's numbers (see section9.html), so the
   * two builds stand in the same places and the comparison shots line up. */
  function collider(boxes) {
    const R = 0.42, H = 1.72, STEP = 0.62;
    function hits(x, y, z) {
      for (let i = 0; i < boxes.length; i++) { const b = boxes[i];
        if (x + R > b.lo[0] && x - R < b.hi[0] && z + R > b.lo[2] && z - R < b.hi[2] && y + H > b.lo[1] && y < b.hi[1]) return b; }
      return null;
    }
    function groundAt(x, z, y) {
      let best = -1e9;
      for (let i = 0; i < boxes.length; i++) { const b = boxes[i];
        if (x + R > b.lo[0] && x - R < b.hi[0] && z + R > b.lo[2] && z - R < b.hi[2] && b.hi[1] <= y + STEP && b.hi[1] > best) best = b.hi[1]; }
      return best > -1e8 ? best : 0;
    }
    return { hits, groundAt, R, H, STEP };
  }

  /* Load one baked level and put it in the scene. Rejects if the payload is not an arena — the
   * prototype has no fallback path on purpose, because a prototype that silently degrades is a
   * prototype that lies to the person evaluating it. */
  function build(app, file) {
    if (!window.RoninWorld) return Promise.reject(new Error('RoninWorld missing'));
    const def = levelFor(file);
    const t0 = performance.now();
    return RoninWorld.load(BASE + def.file + '.wld').then(w => {
      const boxes = (w.boxes || []).filter(b => b && b.lo && b.hi);
      if (!boxes.length) throw new Error('no collision boxes');
      if (!w.verts || !w.verts.length) throw new Error('no geometry');
      for (const b of boxes) b.__kind = (window.S9World && S9World.kindOf) ? S9World.kindOf(b.name) : 'wall';

      const tLoad = performance.now() - t0;
      const { parts, stats } = buildMeshes(app, w, boxes);

      const root = new pc.Entity('level');
      const instances = parts.map(p => {
        const mi = new pc.MeshInstance(p.mesh, p.material, root);
        mi.castShadow = true;
        return mi;
      });
      root.addComponent('render', { meshInstances: instances, castShadows: true, receiveShadows: true });
      app.root.addChild(root);

      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = -1e9, y0 = 1e9;
      for (const b of boxes) {
        x0 = Math.min(x0, b.lo[0]); x1 = Math.max(x1, b.hi[0]);
        z0 = Math.min(z0, b.lo[2]); z1 = Math.max(z1, b.hi[2]);
        y0 = Math.min(y0, b.lo[1]); y1 = Math.max(y1, b.hi[1]);
      }
      const spawns = (w.spawns || []).filter(s => s && isFinite(s.x)).map(s => [+s.x, +s.z, +(s.y || 0)]);
      return {
        root, boxes, spawns, def, verts: w.verts,
        bounds: { x0, x1, z0, z1, y0, y1, span: Math.max(x1 - x0, z1 - z0) },
        stats: Object.assign({ tris: (w.verts.length / 18) | 0, boxes: boxes.length, parts: parts.length, loadMs: tLoad }, stats),
      };
    });
  }

  return { LEVELS, build, collider, materials, MATS, classOf };
})();

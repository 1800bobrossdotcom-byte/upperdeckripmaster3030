/* ripmaster3030studios — THE CITY · the world.
 *
 * Artist, 2026-08-03: *"that is too small of a world, maybe that is a place in it, but we are
 * talking mmorpg size or aspiring to that size."* — and the original ask said **large levels**.
 * `models/world/lido.wld` is 54 x 46 m. It is a courtyard. It is A PLACE IN THE CITY, not the city.
 *
 * ⛔ THE ONE DECISION THAT MAKES MMO-ASPIRING SCALE POSSIBLE HERE, stated plainly because every
 *    other choice follows from it: **THE CITY IS GENERATED, NOT AUTHORED.** A hand-built 3.8 km
 *    city is an asset budget this studio does not have and would take longer than the game. A
 *    generated one is a few hundred lines and is infinite in the directions that matter. What the
 *    artist authors is the LANGUAGE — the massing rules, the material vocabulary, the district
 *    mix — and hand-built `.wld` places drop in as LANDMARKS inside it (see `LANDMARKS`).
 *
 * ⚑ AND THE GENERATOR IS BUILT OUT OF ITS OWN COLLISION. Every visible surface in this city is a
 *   box that is also a collider, because the geometry is DERIVED from the collision set rather
 *   than the other way round. `docs/CITY-GAME.md` acceptance test 3 asks that at least 18 of 20
 *   surfaces that look landable from the air actually are; here the ratio is 1:1 BY CONSTRUCTION,
 *   and it cannot drift, because there is no second representation to drift from. That is the
 *   direct answer to the recorded complaint that `street.wld` has 57 collision boxes for 69,513
 *   triangles and "as it stands is not climbable".
 *
 * ⚑ EVERY BOX CARRIES ITS MATERIAL CLASS EXPLICITLY, and the reason is worth stating.
 *   `section9-world.js` INFERS a class from an object's NAME, because for a `.wld` baked out of
 *   Blender a name is genuinely all there is — and its own table warns that this "fails silently;
 *   the level still loads, it just comes out the wrong colour". That was proved the expensive way
 *   on this game the same day it was written: the lido's box list reached the builder in the wrong
 *   SHAPE (`lo`/`hi` where `x0`…`z1` was expected), every one of 16,108 triangles fell through to
 *   `wall`, and a place with a turquoise pool, red awnings and white stone rendered as two tones of
 *   sandstone. No error. No 404. Just the wrong colour.
 *   ⚠ Here we are the author — we know a road is a road at the instant we emit it — so guessing it
 *     back out of a string we just wrote would be inventing a chance to be wrong. Names are kept
 *     for debugging only. `CityWorld.audit()` makes the result a measurement, not an opinion.
 *
 *   CityWorld.chunkAt(x, z)          → {cx, cz}
 *   CityWorld.genChunk(cx, cz, lod)  → {solids, x0, z0, x1, z1, district}   (pure, deterministic)
 *   CityWorld.genRegion(cx, cz, n)   → the same, for an n x n block of chunks at LOD 1
 *   CityWorld.audit(n)               → material-class histogram over n sample chunks
 */
window.CityWorld = (function () {
  'use strict';

  /* ── the dimensions of the place ────────────────────────────────────────────────────────────
   * ⚑ CHUNK is 120 m because that is a city block you can cross, and GRID x CHUNK is the whole
   *   world. 32 x 32 is 3.84 km on a side — about 15 km² — which is genuinely large-world scale
   *   and, being generated, costs nothing to hold. Nothing outside is generated: the world has an
   *   edge, and an edge you can reach and see is better than an infinite plain that fades. */
  const CHUNK = 120;
  const GRID = 32;
  const EXTENT = GRID * CHUNK / 2;                 // ±1,920 m from origin
  const ROAD = 16;                                 // street width, centred on the chunk boundary
  const ALLEY = 9;
  const INNER = CHUNK - ROAD;                      // 104 m of buildable interior
  const LOT = (INNER - ALLEY) / 2;                 // 47.5 m — four lots to a chunk

  /* ── determinism ────────────────────────────────────────────────────────────────────────────
   * A chunk must generate identically every time it streams in, from nothing but its coordinates,
   * or the city changes shape behind you. So: an integer hash, never a stored seed, never
   * Math.random(). ⚠ The same rule the `.skn` bake and `RoninMorph` already follow. */
  const SEED = 30301;
  function h3(a, b, c) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  function rngFrom(n) { let s = (n >>> 0) || 1;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);

  /* Smooth value noise over the CHUNK lattice — the district field. Low frequency on purpose:
   * districts should be several chunks across so that flying over one reads as somewhere. */
  function vnoise(x, z, freq, salt) {
    const fx = x * freq, fz = z * freq;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = smooth(fx - x0), tz = smooth(fz - z0);
    const g = (a, b) => h3(a, b, salt) / 4294967296;
    return lerp(lerp(g(x0, z0), g(x0 + 1, z0), tx),
                lerp(g(x0, z0 + 1), g(x0 + 1, z0 + 1), tx), tz);
  }

  /* ── THE RIVER ──────────────────────────────────────────────────────────────────────────────
   * ⚑ A river is the cheapest legibility in a generated city and it is worth more than any amount
   *   of building variety. It is CONTINUOUS by construction (a function of x, so adjacent chunks
   *   cannot disagree), it gives the whole map an orientation you can read in one frame from the
   *   air — which is literally acceptance test 1 — and it gives a bird something to follow.
   *   Bridges then land where the street grid crosses it, and a bridge is a thing to fly under. */
  const RIVER_W = 86;
  function riverZ(x) { return Math.sin(x / 640) * 330 + Math.sin(x / 197 + 1.7) * 74; }
  function inRiver(x, z) { return Math.abs(z - riverZ(x)) < RIVER_W / 2; }

  /* ── districts ──────────────────────────────────────────────────────────────────────────────
   * The settled decision is a park / green pocket AND a neighbourhood block, ADJOINING, as one
   * continuous space. So the field is continuous and the two are neighbours everywhere it crosses
   * the threshold — there are no district walls, only a gradient. `plaza` is the third area the
   * artist said would come later, seeded sparsely so it reads as an event rather than a tile. */
  function districtAt(cx, cz) {
    const wx = cx * CHUNK + CHUNK / 2, wz = cz * CHUNK + CHUNK / 2;
    if (inRiver(wx, wz)) return 'water';
    const d = vnoise(cx, cz, 0.22, 11);
    const p = vnoise(cx, cz, 0.55, 77);
    if (p > 0.86) return 'plaza';
    return d < 0.42 ? 'park' : 'block';
  }

  /* ⚑ LANDMARKS — the hand-authored places, dropped INTO the generated city. This is the answer to
   * "maybe that is a place in it": `lido.wld` keeps every one of its 170 authored boxes and simply
   * occupies a chunk. The generator leaves that chunk empty apart from its surrounding streets, so
   * the authored work is never overdrawn. Add a landmark by adding a row. */
  const LANDMARKS = [
    { file: 'models/world/lido.wld', cx: 1, cz: 0, name: 'the lido' },
    { file: 'models/world/street.wld', cx: -3, cz: 2, name: 'the old block' },
  ];
  const LANDMARK_AT = {};
  for (const L of LANDMARKS) LANDMARK_AT[L.cx + ',' + L.cz] = L;
  function landmarkAt(cx, cz) { return LANDMARK_AT[cx + ',' + cz] || null; }

  /* ── box helpers ────────────────────────────────────────────────────────────────────────────
   * ⚑ THE GENERATOR ASSIGNS THE MATERIAL CLASS DIRECTLY, and that is deliberate. `section9-world.js`
   *   infers a kind from an object's NAME because for an authored `.wld` a name is all there is —
   *   and its own comment warns that this "fails silently; the level still loads, it just comes out
   *   the wrong colour", which was proved the expensive way on this game the same day. Here we are
   *   the author: we know a road is a road at the moment we emit it, so guessing from a string we
   *   just wrote would be inventing an opportunity to be wrong. The name stays for debugging.
   * ⚠ The nine classes are the whole vocabulary (see `s9pc-world.js` MATS_DAY) and each is spent on
   *   purpose:  wall cream plaster · deck sand · metal cool grey (ASPHALT) · crate terracotta ·
   *   cab teal lacquer (shopfronts) · water · plant · awning red canvas · trim white stone. */
  function box(out, name, kind, x0, y0, z0, x1, y1, z1) {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05 || y1 - y0 < 0.05) return;
    /* `cls` is the material class, read DIRECTLY by S9PCWorld; `kind` is carried alongside purely
     * so anything downstream that still speaks the S9World vocabulary keeps working. */
    out.push({ name, kind, cls: kind, x0, y0, z0, x1, y1, z1 });
  }

  /* ⛔ EVERY SLAB MUST SIT ABOVE y = 0, and this is not cosmetic. `S9PCWorld.boxSoup` lays a ground
   * plane at exactly y = 0 across the map, so anything whose top is at or below 0 is HIDDEN UNDER
   * IT — which is how the river first rendered as a broad white band with no water in it at all:
   * the surface was at −0.15 and the sand plane was drawn over the top of it. Nothing errored.
   * ⚠ 0.03 WAS NOT ENOUGH CLEARANCE. At 3 cm the road slabs and the ground plane z-fought visibly
   * from 600 m up — a moiré that reads as a texture fault and is a depth one. 12 cm is still
   * nothing to a bird and is four times the margin. The other half of that fix is the camera's
   * near clip (see city-app.js): 0.12 m over a 1.5 km far clip is a 12,500:1 depth range, and
   * precision is spent almost entirely in the first metre. */
  const GROUND = 0.12;

  /* ── the downtown field ─────────────────────────────────────────────────────────────────────
   * ⚑ HEIGHT VARIANCE IS THE SINGLE BIGGEST LEGIBILITY WIN FROM THE AIR, measured by looking: the
   * first city was 9–33 m everywhere and from 600 m up it read as one flat crust with no landmark
   * and nowhere to aim for. A low-frequency field with a hard gamma means most of the map stays
   * low-rise and a few districts are genuinely tall, so the skyline tells you where you are —
   * which is exactly what acceptance test 1 asks of it ("somewhere you can point at"). */
  function heightMul(cx, cz) {
    const t = vnoise(cx, cz, 0.13, 301);
    return 0.55 + Math.pow(t, 2.2) * 3.6;                 // ~0.55 low-rise … ~4.15 downtown
  }

  /* ── A BUILDING ─────────────────────────────────────────────────────────────────────────────
   * ⚠ `lod` is not a quality dial, it is a CONTRACT: LOD 1 must emit exactly the MASSES that LOD 0
   *   emits and nothing else, so a building does not change height or footprint as you fly toward
   *   it. That is why the mass is drawn from `R` before any detail is — the random sequence has to
   *   line up between the two paths, and it does because the detail draws come after. The ROOF
   *   SLAB is part of the mass on purpose: it is what gives the horizon its colour variety, and a
   *   horizon that changes colour as it resolves is worse than one that is merely coarse.
   * ⚑ THE SILLS ARE THE GAME. A squirrel and a cat climb this city and the brief is explicit that
   *   "a ledge you can see is a ledge you can land on". Each is a real box, so it is one.
   *   ⚠ They were 0.42 m proud every 4.5 m and turned every building into a striped ziggurat from
   *     the air — a gameplay affordance that ate the silhouette. 0.22 m, and spaced by storey. */
  function building(out, R, x0, z0, x1, z1, lod, mul) {
    const storeys = 2 + ((R() * 7) | 0);
    const h = Math.min(150, (4.2 + storeys * 3.6 + R() * 5) * mul);
    const inset = 1.2 + R() * 2.4;
    const bx0 = x0 + inset, bz0 = z0 + inset, bx1 = x1 - inset, bz1 = z1 - inset;
    box(out, 'wall_body', 'wall', bx0, 0, bz0, bx1, h, bz1);
    // the roof is its own thin slab so it can be its own colour — tar, tile, or plant
    /* Roof material: tall buildings get tar-and-plant decks, low ones terracotta tile — but a
     * roll decides inside each band, because a rule keyed on height alone paints every block the
     * same colour and a city is not that tidy. */
    const rr = R();
    const rk = h > 46 ? (rr < 0.7 ? 'metal' : 'deck')
             : h > 22 ? (rr < 0.45 ? 'deck' : rr < 0.8 ? 'crate' : 'metal')
             :          (rr < 0.62 ? 'crate' : rr < 0.85 ? 'deck' : 'plant');
    box(out, 'roof_cap', rk, bx0 - 0.25, h, bz0 - 0.25, bx1 + 0.25, h + 0.40, bz1 + 0.25);
    if (lod > 0) return h;                                  // ── masses only, and nothing more ──

    const pt = 0.5, ph = 0.95, rh = h + 0.40;
    box(out, 'trm_parapet_n', 'trim', bx0, rh, bz0, bx1, rh + ph, bz0 + pt);
    box(out, 'trm_parapet_s', 'trim', bx0, rh, bz1 - pt, bx1, rh + ph, bz1);
    box(out, 'trm_parapet_w', 'trim', bx0, rh, bz0, bx0 + pt, rh + ph, bz1);
    box(out, 'trm_parapet_e', 'trim', bx1 - pt, rh, bz0, bx1, rh + ph, bz1);
    const band = 3.6 + R() * 1.4;
    for (let y = band; y < h - 1.5; y += band) {
      box(out, 'trm_sill', 'trim', bx0 - 0.22, y, bz0 - 0.22, bx1 + 0.22, y + 0.26, bz1 + 0.22);
    }
    // the ground floor is a SHOPFRONT — teal lacquer, the one strong cool accent in a warm city
    box(out, 'cab_front', 'cab', bx0 - 0.14, 0, bz0 - 0.14, bx1 + 0.14, 2.9, bz0 + 0.2);
    const sw = 3.2 + R() * 2.4, sx = lerp(bx0 + 1, bx1 - sw - 1, R());
    box(out, 'deck_stoop', 'trim', sx, GROUND, bz0 - 2.1, sx + sw, 0.55, bz0);
    box(out, 'awn_shop', 'awning', sx - 0.6, 3.1, bz0 - 2.6, sx + sw + 0.6, 3.42, bz0);
    const n = 1 + ((R() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const w = 1.4 + R() * 2.2, d = 1.4 + R() * 2.2;
      const px = lerp(bx0 + 1, bx1 - w - 1, R()), pz = lerp(bz0 + 1, bz1 - d - 1, R());
      const t = R();
      if (t < 0.34) box(out, 'plnt_roofbed', 'plant', px, rh, pz, px + w, rh + 0.9, pz + d);
      else if (t < 0.7) box(out, 'crate_tank', 'crate', px, rh, pz, px + w, rh + 1.7, pz + d);
      else { box(out, 'crate_vent', 'metal', px, rh, pz, px + w, rh + 1.1, pz + d);
             box(out, 'trm_vent_cap', 'trim', px - 0.2, rh + 1.1, pz - 0.2, px + w + 0.2, rh + 1.35, pz + d + 0.2); }
    }
    if (R() < 0.45) box(out, 'bin_kerb', 'cab', bx0 + 0.6, GROUND, bz0 - 1.6, bx0 + 1.7, 1.05, bz0 - 0.5);
    return h;
  }

  function tree(out, R, x, z, scale) {
    const th = (3.4 + R() * 3.2) * scale, tr = 0.30 * scale;
    box(out, 'trunk', 'crate', x - tr, GROUND, z - tr, x + tr, th, z + tr);
    const cr = (2.1 + R() * 1.6) * scale;
    box(out, 'canopy', 'plant', x - cr, th, z - cr, x + cr, th + cr * 1.05, z + cr);
    // a second, offset lobe — one box reads as a green cube, two read as a tree
    const o = cr * 0.45;
    box(out, 'canopy2', 'plant', x - cr * 0.7 + o, th + cr * 0.5, z - cr * 0.7 - o,
        x + cr * 0.7 + o, th + cr * 1.5, z + cr * 0.7 - o);
  }

  /* ── THE STREET ─────────────────────────────────────────────────────────────────────────────
   * ⚑ EVERY CHUNK OWNS THE ROAD ON ITS −x AND −z EDGES ONLY. That is what makes the grid tile
   *   without every boundary being drawn twice by both neighbours, and it is why the streets run
   *   continuously across chunk borders instead of stopping at them. The corner is covered because
   *   each strip is run the full chunk length plus the road width.
   * ⚠ Asphalt is `metal` (cool grey). Against cream plaster and sand it is the thing that makes a
   *   street grid legible from 600 m — the first city had roads the same sand as everything else
   *   and read as an undifferentiated crust. */
  function streets(out, x0, z0) {
    const r = ROAD / 2;
    box(out, 'road_w', 'metal', x0 - r, -0.4, z0 - r, x0 + r, GROUND, z0 + CHUNK + r);
    box(out, 'road_n', 'metal', x0 - r, -0.4, z0 - r, x0 + CHUNK + r, GROUND, z0 + r);
    box(out, 'kerb_w', 'trim', x0 + r, -0.4, z0 + r, x0 + r + 0.5, 0.17, z0 + CHUNK);
    box(out, 'kerb_n', 'trim', x0 + r, -0.4, z0 + r, x0 + CHUNK, 0.17, z0 + r + 0.5);
  }

  // ── the four district generators ────────────────────────────────────────────────────────────
  function genBlock(out, R, x0, z0, lod, mul) {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const lx = x0 + ROAD / 2 + i * (LOT + ALLEY), lz = z0 + ROAD / 2 + j * (LOT + ALLEY);
      if (inRiver(lx + LOT / 2, lz + LOT / 2)) { embankment(out, R, lx, lz, lx + LOT, lz + LOT, lod); continue; }
      building(out, R, lx, lz, lx + LOT, lz + LOT, lod, mul);
    }
    if (lod > 0) return;
    for (let k = 0; k < 4; k++) {                              // street trees along the kerb
      const t = 0.15 + k * 0.23;
      tree(out, R, x0 + ROAD * 0.34, z0 + CHUNK * t, 0.9);
      tree(out, R, x0 + CHUNK - ROAD * 0.34, z0 + CHUNK * (t + 0.06), 0.9);
    }
  }

  function genPark(out, R, x0, z0, lod) {
    // the lawn is a real slab proud of the road, so the green is a SURFACE and not a decal
    box(out, 'lawn', 'plant', x0 + ROAD / 2, -0.5, z0 + ROAD / 2, x0 + CHUNK - ROAD / 2, 0.07, z0 + CHUNK - ROAD / 2);
    if (lod > 0) return;
    const pw = 3.4;
    box(out, 'path_x', 'deck', x0 + ROAD / 2, -0.3, z0 + CHUNK * 0.44, x0 + CHUNK - ROAD / 2, 0.11, z0 + CHUNK * 0.44 + pw);
    box(out, 'path_z', 'deck', x0 + CHUNK * 0.52, -0.3, z0 + ROAD / 2, x0 + CHUNK * 0.52 + pw, 0.11, z0 + CHUNK - ROAD / 2);
    if (R() < 0.62) {
      const px = x0 + CHUNK * (0.15 + R() * 0.2), pz = z0 + CHUNK * (0.6 + R() * 0.15);
      const pr = 9 + R() * 7;
      box(out, 'pond_coping', 'trim', px - pr - 0.8, -0.3, pz - pr - 0.8, px + pr + 0.8, 0.38, pz + pr + 0.8);
      box(out, 'water_pond', 'water', px - pr, -0.3, pz - pr, px + pr, 0.26, pz + pr);
    }
    const n = 7 + ((R() * 7) | 0);
    for (let i = 0; i < n; i++) tree(out, R, x0 + ROAD + R() * (INNER - 4), z0 + ROAD + R() * (INNER - 4), 1 + R() * 0.6);
    for (let i = 0; i < 4; i++) {
      const bx = x0 + ROAD + R() * (INNER - 6);
      box(out, 'bench', 'trim', bx, 0.11, z0 + CHUNK * 0.44 - 1.5, bx + 2.2, 0.52, z0 + CHUNK * 0.44 - 0.7);
    }
    if (R() < 0.3) {                                           // a bandstand — the park's landmark
      const bx = x0 + CHUNK * 0.68, bz = z0 + CHUNK * 0.24, br = 6;
      box(out, 'stand', 'deck', bx - br, -0.2, bz - br, bx + br, 0.9, bz + br);
      for (const s of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        box(out, 'stand_col', 'trim', bx + s[0] * br * 0.8 - 0.3, 0.9, bz + s[1] * br * 0.8 - 0.3,
            bx + s[0] * br * 0.8 + 0.3, 4.4, bz + s[1] * br * 0.8 + 0.3);
      box(out, 'stand_roof', 'crate', bx - br - 0.6, 4.4, bz - br - 0.6, bx + br + 0.6, 5.0, bz + br + 0.6);
    }
  }

  function genPlaza(out, R, x0, z0, lod) {
    box(out, 'paving', 'trim', x0 + ROAD / 2, -0.4, z0 + ROAD / 2, x0 + CHUNK - ROAD / 2, 0.08, z0 + CHUNK - ROAD / 2);
    const cx = x0 + CHUNK / 2, cz = z0 + CHUNK / 2;
    box(out, 'fountain_rim', 'trim', cx - 8.6, 0, cz - 8.6, cx + 8.6, 1.0, cz + 8.6);
    box(out, 'water_fountain', 'water', cx - 7.8, 0, cz - 7.8, cx + 7.8, 0.9, cz + 7.8);
    if (lod > 0) return;
    box(out, 'fountain_stem', 'trim', cx - 1.1, 0.9, cz - 1.1, cx + 1.1, 4.2, cz + 1.1);
    box(out, 'fountain_bowl', 'trim', cx - 3.0, 4.2, cz - 3.0, cx + 3.0, 4.8, cz + 3.0);
    for (let i = 0; i < 9; i++) {                              // a colonnade — the classic perch run
      const px = x0 + ROAD + 2 + i * 11;
      box(out, 'col', 'trim', px, 0.08, z0 + ROAD, px + 1.1, 6.2, z0 + ROAD + 1.1);
    }
    box(out, 'entab', 'trim', x0 + ROAD, 6.2, z0 + ROAD - 0.5, x0 + CHUNK - ROAD, 7.1, z0 + ROAD + 1.9);
    for (let i = 0; i < 6; i++) {                              // market stalls, canvas over them
      const sx = x0 + ROAD + R() * (INNER - 8), sz = z0 + CHUNK * 0.66 + R() * 18;
      box(out, 'stall', 'cab', sx, 0.08, sz, sx + 3.4, 1.1, sz + 2.2);
      box(out, 'stall_awn', 'awning', sx - 0.7, 2.4, sz - 0.7, sx + 4.1, 2.7, sz + 2.9);
    }
    for (let i = 0; i < 5; i++) {
      const px = x0 + ROAD + R() * (INNER - 6), pz = z0 + ROAD + R() * (INNER - 6);
      box(out, 'planter', 'crate', px, 0.08, pz, px + 3.2, 0.85, pz + 3.2);
      box(out, 'planter_folig', 'plant', px + 0.25, 0.85, pz + 0.25, px + 2.95, 2.3, pz + 2.95);
    }
  }

  /* Water chunks and the river's edge. ⚑ THE EMBANKMENT IS WHY THE RIVER IS NOT A HOLE: a water
   * plane at the bottom of a pit reads as a bug, and the recorded free-roam failure was exactly a
   * player standing on a water plane. The wall, the walkway and the bollards give it a bank you can
   * land on, walk along, and see the height of. */
  function embankment(out, R, x0, z0, x1, z1, lod) {
    box(out, 'quay', 'trim', x0, -0.4, z0, x1, 1.1, z1);
    if (lod > 0) return;
    for (let x = x0 + 2; x < x1 - 2; x += 6)
      box(out, 'bollard', 'metal', x, 1.1, z0 + 0.6, x + 0.5, 1.8, z0 + 1.1);
  }

  function genWater(out, R, x0, z0, lod) {
    const wz = riverZ(x0 + CHUNK / 2);
    const b0 = wz - RIVER_W / 2, b1 = wz + RIVER_W / 2;
    const z0c = Math.max(z0, b0), z1c = Math.min(z0 + CHUNK, b1);
    /* ⛔ THE RIVER'S SURFACE MUST BE PROUD OF y = 0. At −0.15 it was UNDER `boxSoup`'s ground plane
     * and the whole river rendered as a broad pale band with no water in it — a bug that looks
     * exactly like a material mistake and is a depth one. See GROUND above. */
    box(out, 'water_river', 'water', x0, -1.4, z0c, x0 + CHUNK, GROUND + 0.02, z1c);
    // banks: a narrow quay at the water's edge, not a slab over half the chunk
    const QW = 7;
    if (b0 > z0 + 1) box(out, 'quay_n', 'trim', x0, -0.4, Math.max(z0, b0 - QW), x0 + CHUNK, 0.9, b0);
    if (b1 < z0 + CHUNK - 1) box(out, 'quay_s', 'trim', x0, -0.4, b1, x0 + CHUNK, 0.9, Math.min(z0 + CHUNK, b1 + QW));
    if (lod > 0) return;
    /* A BRIDGE where the street grid crosses. Roads run on chunk boundaries, so this lands on the
     * grid by construction and every crossing has one — a thing to fly under, which is the single
     * most bird-specific piece of geometry in the city. */
    const bx = x0;
    box(out, 'bridge_deck', 'metal', bx - ROAD * 0.6, 5.4, z0, bx + ROAD * 0.6, 6.0, z0 + CHUNK);
    box(out, 'bridge_rail_w', 'trim', bx - ROAD * 0.6, 6.0, z0, bx - ROAD * 0.6 + 0.4, 7.0, z0 + CHUNK);
    box(out, 'bridge_rail_e', 'trim', bx + ROAD * 0.6 - 0.4, 6.0, z0, bx + ROAD * 0.6, 7.0, z0 + CHUNK);
    for (const zz of [b0 - 2, b1 + 2])                          // piers down into the water
      box(out, 'pier', 'wall', bx - 2.2, -1.4, zz - 1.2, bx + 2.2, 5.4, zz + 1.2);
    for (let x = x0 + 4; x < x0 + CHUNK - 4; x += 9) {          // bollards along both banks
      if (b0 > z0 + 2) box(out, 'bollard_n', 'metal', x, 0.9, b0 - 1.4, x + 0.5, 1.6, b0 - 0.9);
      if (b1 < z0 + CHUNK - 2) box(out, 'bollard_s', 'metal', x, 0.9, b1 + 0.9, x + 0.5, 1.6, b1 + 1.4);
    }
  }

  /* ── the entry point ────────────────────────────────────────────────────────────────────────
   * PURE: same (cx, cz, lod) → the same boxes, every time, with no state read and none written.
   * That is what lets a chunk be thrown away the moment it is out of range and rebuilt identically
   * when you turn round. */
  function genChunk(cx, cz, lod) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const out = [];
    const district = districtAt(cx, cz);
    const lm = landmarkAt(cx, cz);
    const R = rngFrom(h3(cx, cz, SEED));
    streets(out, x0, z0);                            // every chunk lays its own two edges of road
    if (lm) {
      /* An authored place holds its own chunk. Only the surrounding street is generated, so nothing
       * the artist built is ever overdrawn by something a loop invented. */
    } else if (district === 'water') genWater(out, R, x0, z0, lod);
    else if (district === 'park') genPark(out, R, x0, z0, lod);
    else if (district === 'plaza') genPlaza(out, R, x0, z0, lod);
    else genBlock(out, R, x0, z0, lod, heightMul(cx, cz));
    return { solids: out, x0, z0, x1: x0 + CHUNK, z1: z0 + CHUNK, district, landmark: lm,
             tall: +heightMul(cx, cz).toFixed(2) };
  }

  /* n x n chunks as ONE map at LOD 1. ⚑ This is a DRAW-CALL decision, not a triangle one: the
   * far ring is 80-odd chunks and each built separately would be its own entity with its own
   * mesh instance per material class — several hundred draw calls to show a horizon. Merged
   * 4 x 4 at a time it is a couple of dozen. */
  function genRegion(cx, cz, n) {
    const solids = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const c = genChunk(cx + i, cz + j, 1);
      for (const b of c.solids) solids.push(b);
    }
    return { solids, x0: cx * CHUNK, z0: cz * CHUNK, x1: (cx + n) * CHUNK, z1: (cz + n) * CHUNK };
  }

  /* ── the guard ──────────────────────────────────────────────────────────────────────────────
   * ⚑ THE MATERIAL HISTOGRAM IS THE ASSERTION THAT BITES. The failure this city is most likely to
   * have is the one it already had once: everything silently classified as `wall`, the whole world
   * one colour, no error anywhere. A histogram over a sample of chunks either shows a city's worth
   * of classes or it does not, and it takes no judgement to read. */
  function audit(n) {
    const hist = {}, dist = {};
    const N = n || 64;
    for (let i = 0; i < N; i++) {
      const cx = (i % 8) - 4, cz = ((i / 8) | 0) - 4;
      const c = genChunk(cx, cz, 0);
      dist[c.district] = (dist[c.district] || 0) + 1;
      for (const b of c.solids) hist[b.kind] = (hist[b.kind] || 0) + 1;
    }
    return { chunks: N, kinds: hist, districts: dist };
  }

  function chunkAt(x, z) { return { cx: Math.floor(x / CHUNK), cz: Math.floor(z / CHUNK) }; }
  function inWorld(x, z) { return Math.abs(x) < EXTENT && Math.abs(z) < EXTENT; }

  return { CHUNK, GRID, EXTENT, ROAD, SEED, LANDMARKS,
           chunkAt, districtAt, landmarkAt, genChunk, genRegion, audit, inWorld,
           riverZ, inRiver, RIVER_W };
})();

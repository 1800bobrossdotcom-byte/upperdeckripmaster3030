/* ripmaster3030studios — DOGFIGHT / PlayCanvas: THE CITY BELOW (window.DFPCCity).
 *
 * Artist: "improve the cities below, make them with actual cities and skyscrapers and cars
 * beneath, areas to fly through etc."  What was there: 260 scattered prop silhouettes on an empty
 * plane. What this is: a seeded corporate street grid with a skyline, avenues you fly down,
 * landmarks you navigate by, and traffic that moves because it is on a road.
 *
 *   DFPCCity.layoutFor(name, WS)   the plan — pure math, no engine, no GLB, cached per theme
 *   DFPCCity.create(app, opt)      → { root, apply(world, o), update(G, cam, camEnt, o), setKit,
 *                                      stats() }
 *   DFPCCity.laneProbe(name, WS, t)  one car's world position at time t — the traffic acceptance
 *                                    test, callable headless
 *
 * ⚑ THE LAYOUT IS A FUNCTION, NOT AN ASSET, and that is the same call `js/dfpc-world.js` makes
 *   for its cloud lattice and its deck noise. 675 baked transforms would be shipping a screenshot
 *   of a city: it could not vary per theme, it could not be re-seeded, and a diff of it would be
 *   unreadable. Seeded from the theme NAME, so a theme's city is the same every load — a player
 *   learns a map, and a map that reshuffles cannot be learned.
 *
 * ── THE BRIEF ───────────────────────────────────────────────────────────────────────────────
 * Written in full at the top of `scripts/blender/build-city.py`, which is where the geometry it
 * decides lives. The four load-bearing decisions, restated here because this file implements them:
 *
 *   MADE OF   die-cut card stock, flat ink, dark, matte, NO environment on any face (§1). NOT
 *             foil — the craft is the foil object and §5 allows one focal object per view.
 *             ⚑ The CORPORATION is the only self-lit thing: sign crowns, hazard beacons and the
 *             traffic lanes are emissive, everything else is dark stock. DELTRON-3030 §2.
 *   LIT BY    the scene's swept sun (KEY) and the sky cubemap (FILL) — the same two lights that
 *             already light the craft and the deck. ⚑ NOT by its own windows: dfpc-world.js
 *             inverted every palette so bodies are DARK against a BRIGHT field, and a field of
 *             glowing windows behind a dark craft destroys exactly that silhouette.
 *   MOVES     (a) traffic, because it is on a one-way corporate route: p = phase + v·t, wrapped
 *                 by the torus. Not a shimmer, not a scrolled texture.
 *             (b) nothing on its own — beacons are STEADY, no idle loop anywhere.
 *             (c) THE CITY ITSELF, because you fly through it. dfpc-app.js's own note says the
 *                 old world had "nothing close to parallax against", which is why thrust had to
 *                 be faked with camera shove. This is the parallax.
 *   SITS ON   the deck, and is dimensioned by it: cell pitch 10 and every street centreline lands
 *             on a multiple of the deck texture's own 2-unit lattice STEP.
 *
 * ── ACCEPTANCE ──────────────────────────────────────────────────────────────────────────────
 *   1. frame legibility — luma / RMS contrast / clipped % / black %, in a MATCH not a lobby.
 *      Must not wash out (Cloud Racer's failure) and must not black out (this game's own old
 *      50.4%-under-luma-12 failure). Contrast should go UP: a city is edges.
 *   2. budget — ≤ 40,000 triangles and ≤ 24 draw calls for the whole city, reported by stats()
 *      and surfaced in dogfight.html's `?eng` readout so it stays visible rather than assumed.
 *   3. traffic is a route — laneProbe() at two times must advance by exactly v·dt ALONG the lane
 *      and be identical ACROSS it, and must not read the camera.
 *   4. canyons are clear — every avenue centreline is empty for its full 150-unit run, asserted
 *      by walking the layout rather than by looking at a screenshot.
 *   5. fail open — no `models/city.glb` ⇒ procedural masses; no DFPCCity at all ⇒ dogfight.html
 *      guards every call and the 260 props draw exactly as they did.
 *
 * ⛔ KNOWN GAP, STATED RATHER THAN HIDDEN: BUILDINGS ARE NOT SOLID. Dogfight has no world
 *    collision of any kind today — only the altitude clamp and the toroidal wrap — and the bots
 *    have no obstacle avoidance whatsoever. Making the city solid without giving them avoidance
 *    would put every bot into a wall within seconds, which is a worse bug than an intangible one.
 *    The layout is O(1) queryable (`cellAt`), so collision is a small change once bot avoidance
 *    exists; it is a gameplay job with a crash model attached, not a rendering one.
 */
window.DFPCCity = (function () {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const Q = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
  const num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  const ON = Q.get('city') !== '0';

  const hex = h => { const s = String(h || '#ffffff').replace('#', '');
    return [(parseInt(s.slice(0, 2), 16) || 0) / 255, (parseInt(s.slice(2, 4), 16) || 0) / 255, (parseInt(s.slice(4, 6), 16) || 0) / 255]; };

  /* ── the plan ────────────────────────────────────────────────────────────────────────────
   * P    cell pitch. 10 divides the 150-unit torus into 15×15 and is a multiple of the deck
   *      texture's 2-unit lattice STEP, so streets land ON lattice lines instead of across them.
   * SW   street half-clearance from a cell boundary → a 3.6-unit side street.
   * AV   every AVth boundary line is an AVENUE, set back a further AW each side → 7.2 units.
   *      ⚑ THE AVENUE IS THE DESIGN. A 3.6-unit side street between 8-unit towers is a slot you
   *      would only enter by accident; 7.2 at cruise (9 u/s) is a corridor you can commit to and
   *      still turn in. Every third line means an avenue every 30 units, which is close enough
   *      that you are never more than 15 units from one — i.e. always within reach of a route.
   * CH   chunk size for the static merge. 30 = 3×3 cells and lines up with the avenues, so a
   *      chunk seam is always a street rather than a cut through a building.
   */
  const P = 10, SW = 1.8, AV = 3, AW = 1.8, CH = 30;

  /* One profile per WORLDS theme — the same table shape as DFPCWorld.SKINS, keyed the same way.
   * A city is not the same city in five places: `chrome city` is the downtown it is named after,
   * `ember canyon` is low and industrial (a canyon wants canyon walls, not towers), `ghost nebula`
   * is sparse and tall — ruins with the odd spire still standing.
   * ⚠ `peak` is capped by the arena: ALT_MAX is 9.0, so 8.8 puts the tallest crowns just under the
   *    ceiling and — because CLOUD_ALT is 5.4 ± 0.9 — through the weather. That relationship is
   *    deliberate: above the cloud you navigate by tower tops. */
  const PROFILE = {
    'neon grid':    { seed: 0x1a53, dens: 0.92, peak: 8.4, base: 1.5, cores: 2, spread: 3.6, vacant: 0.15 },
    'moon ocean':   { seed: 0x2f71, dens: 0.52, peak: 5.4, base: 1.1, cores: 2, spread: 2.6, vacant: 0.22 },
    'ember canyon': { seed: 0x3c19, dens: 0.66, peak: 4.6, base: 1.3, cores: 3, spread: 4.4, vacant: 0.20 },
    'chrome city':  { seed: 0x4b2d, dens: 1.00, peak: 8.8, base: 1.8, cores: 2, spread: 3.9, vacant: 0.14 },
    'ghost nebula': { seed: 0x5e07, dens: 0.44, peak: 7.2, base: 1.0, cores: 2, spread: 2.2, vacant: 0.26 },
  };
  const DEFAULT_PROFILE = PROFILE['neon grid'];

  /* Hash-based, NOT a running LCG. A cell's values must not depend on the order cells are
   * visited: with a running stream, adding one building to cell 0 reshuffles all 224 after it, so
   * every tuning change becomes a different city and nothing can be compared to anything. */
  function h3(i, j, k, seed) {
    let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k | 0, 2147483647) + (seed | 0);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const smooth = t => t * t * (3 - 2 * t);
  /** toroidal value noise on the cell grid, so the field wraps with the map */
  function vnoise(x, y, N, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
    const at = (a, b) => h3(((a % N) + N) % N, ((b % N) + N) % N, 7, seed);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    const t = a + (b - a) * xf;
    return t + ((c + (d - c) * xf) - t) * yf;
  }
  const wrapDelta = (v, W) => v - Math.round(v / W) * W;

  /* KITS — the five body silhouettes, weighted by how tall the slot is. `top` is the fraction of
   * the footprint the part's TOP mass occupies, which is what a roof cap or a sign crown has to
   * be sized against.
   * ⚠ `top` is AUTHORED knowledge shared with build-city.py, not a measured fit — it is the one
   *   number in this file that a change to the kit could silently invalidate, and a cap that is
   *   too wide is visible immediately, which is the reason it is tolerable. */
  const KITS = [
    { name: 'slab', top: 0.44, cap: 'plant', lo: 'tall' },
    { name: 'rib',  top: 0.82, cap: 'deck',  lo: 'tall' },
    { name: 'twin', top: 0.94, cap: null,    lo: 'tall' },
    { name: 'pod',  top: 0.88, cap: 'plant', lo: 'low' },
    { name: 'step', top: 0.38, cap: null,    lo: 'low' },
  ];

  const CACHE = new Map();
  /** the plan for one theme. Pure, deterministic, and free of the engine — callable headless. */
  function layoutFor(name, WS) {
    WS = WS || 150;
    const key = name + '|' + WS;
    if (CACHE.has(key)) return CACHE.get(key);
    const pf = PROFILE[name] || DEFAULT_PROFILE;
    const N = Math.max(2, Math.round(WS / P));
    const NC = Math.max(1, Math.round(WS / CH));
    const seed = pf.seed;

    // downtown cores: the field's peaks. Two or three, placed on the cell grid from the seed.
    const cores = [];
    for (let k = 0; k < pf.cores; k++) {
      cores.push([h3(k, 101, 1, seed) * N, h3(k, 202, 2, seed) * N]);
    }
    function coreAt(i, j) {
      let m = 0;
      for (const c of cores) {
        const dx = wrapDelta(i + 0.5 - c[0], N), dy = wrapDelta(j + 0.5 - c[1], N);
        m = Math.max(m, Math.exp(-(dx * dx + dy * dy) / (pf.spread * pf.spread)));
      }
      return m;
    }

    /* Block extents per cell. A cell boundary that is an avenue line eats a further AW, so a cell
     * flanked by two avenues is genuinely smaller and carries fewer, lower buildings — which is
     * what a real corner lot on a boulevard looks like. */
    const isAv = i => (((i % AV) + AV) % AV) === 0;
    function blockOf(i, j) {
      const x0 = i * P + SW + (isAv(i) ? AW : 0), x1 = (i + 1) * P - SW - (isAv(i + 1) ? AW : 0);
      const z0 = j * P + SW + (isAv(j) ? AW : 0), z1 = (j + 1) * P - SW - (isAv(j + 1) ? AW : 0);
      return [x0, z0, x1, z1];
    }

    const buildings = [];
    const open = new Uint8Array(N * N);
    const density = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      /* ⚠ THE NOISE IS CENTRED (nz − 0.5), and the first version was not. Unsigned noise can only
       * ADD, so at `chrome city`'s density 1.00 the field never fell below the "no buildings"
       * threshold and the plan came back with ZERO open cells — which silently disabled
       * openSpot(), left all 260 scenery props standing inside towers, and looked like the prop
       * relocation had simply not shipped. Measured, not spotted: `plan.open` was 0 of 225.
       * ⚑ On top of that, an explicit VACANCY roll. A downtown with no gaps is a solid block; a
       * city has lots, plazas and yards, and they are where the scenery props go. Rolled from its
       * own hash so it is independent of the height field — a plaza next to a tower is normal, a
       * plaza only where the city was already thinning is just the outskirts. */
      const core = coreAt(i, j);
      const nz = vnoise(i * 0.5, j * 0.5, N, seed) * 0.66 + vnoise(i, j, N, seed + 17) * 0.34;
      const vacant = h3(i, j, 88, seed) < (pf.vacant || 0.15);
      const w = vacant ? 0 : clamp(pf.dens * (0.34 + 0.70 * core + 0.62 * (nz - 0.5)), 0, 1.2);
      density[j * N + i] = w;
      const n = w > 0.70 ? 4 : w > 0.50 ? 3 : w > 0.32 ? 2 : w > 0.16 ? 1 : 0;
      if (!n) { open[j * N + i] = 1; continue; }

      const [x0, z0, x1, z1] = blockOf(i, j);
      const bw = x1 - x0, bd = z1 - z0;
      if (bw < 1.1 || bd < 1.1) { open[j * N + i] = 1; continue; }

      /* slots: 1 fills the block, 2 splits the long axis, 3 is one big plus two small, 4 is 2×2.
       * A gap `g` is left between slots so neighbours never fuse into one mass — a block that
       * reads as one object is a block, not four buildings. */
      const g = 0.32;
      let slots;
      if (n === 1) slots = [[0.5, 0.5, 1, 1]];
      else if (n === 2) slots = (bw >= bd) ? [[0.25, 0.5, 0.5, 1], [0.75, 0.5, 0.5, 1]]
                                           : [[0.5, 0.25, 1, 0.5], [0.5, 0.75, 1, 0.5]];
      else if (n === 3) slots = (bw >= bd) ? [[0.28, 0.5, 0.56, 1], [0.78, 0.26, 0.44, 0.52], [0.78, 0.74, 0.44, 0.52]]
                                           : [[0.5, 0.28, 1, 0.56], [0.26, 0.78, 0.52, 0.44], [0.74, 0.78, 0.52, 0.44]];
      else slots = [[0.27, 0.27, 0.54, 0.54], [0.73, 0.27, 0.54, 0.54], [0.27, 0.73, 0.54, 0.54], [0.73, 0.73, 0.54, 0.54]];

      for (let s = 0; s < slots.length; s++) {
        const [u, v, sw, sd] = slots[s];
        const fw = Math.max(0.9, bw * sw - g), fd = Math.max(0.9, bd * sd - g);
        const x = x0 + bw * u, z = z0 + bd * v;
        // the block's PRINCIPAL building is slot 0 and carries the cell's height; the rest are
        // annexes at a fraction of it, so a block has a hierarchy instead of four equal stumps
        const r1 = h3(i, j, s * 3 + 1, seed), r2 = h3(i, j, s * 3 + 2, seed), r3 = h3(i, j, s * 3 + 3, seed);
        const lead = pf.base + pf.peak * (0.20 + 0.80 * core) * (0.42 + 0.72 * r1);
        const h = clamp(s === 0 ? lead : lead * (0.30 + 0.42 * r2), 1.0, pf.peak);
        // tall slots get tall kits, low slots get low ones; the tie is broken by the hash so a
        // street is not five copies of one building
        const tall = h > pf.base + pf.peak * 0.30;
        const pool = tall ? [0, 1, 1, 2, 0] : [3, 3, 4, 0, 4];
        const kit = pool[(r3 * pool.length) | 0] | 0;
        /* Rotation is a quarter turn from the hash — a 45° building on a grid plan reads as an
         * error — plus a small settle so the row is not machine-perfect (§7: "printed, stamped,
         * slightly misregistered").
         * ⛔ AND THE QUARTER TURN HAS TO SWAP THE FOOTPRINT, which the first version did not. A
         *   slot is sized (fw × fd) to fit between the streets; turn the MESH 90° without turning
         *   the SCALE with it and the world footprint becomes (fd × fw), so a 1.98-wide slot on a
         *   4.6-deep block put a 4.28-wide building in it — overhanging its block by 1.03 units,
         *   i.e. a third of the way into the avenue it was set back from. Found by the corridor
         *   assertion, not by looking: at street level a building whose corner clips the road is
         *   indistinguishable from a building that is simply close to it.
         *   So `fw`/`fd` stay the WORLD footprint (what the corridor test measures) and `sw`/`sd`
         *   are the LOCAL scale the mesh is stamped with. */
        const rq = (h3(i, j, s + 40, seed) * 4) | 0;
        const rot = rq * (Math.PI / 2) + (h3(i, j, s + 60, seed) - 0.5) * 0.07;
        const quarter = (rq & 1) === 1;
        buildings.push({ x, z, rot, fw, fd, sw: quarter ? fd : fw, sd: quarter ? fw : fd, h, kit,
          cap: (KITS[kit].cap && h > pf.base + pf.peak * 0.12 && r2 > 0.42) ? KITS[kit].cap : null,
          crown: h > pf.base + pf.peak * 0.42 });
      }
    }

    /* ── the landmarks ────────────────────────────────────────────────────────────────────
     * Three, placed at avenue crossings near the cores. A skyline of interchangeable blocks has
     * no way to say WHERE you are on a 150-unit torus; a landmark is the map.
     * ⚑ The GANTRY straddles an avenue and you fly THROUGH it — a framed gap is unambiguous in a
     *   way an unframed one is not, which is most of the answer to "does this canyon read as
     *   flyable". Its opening is asserted at BUILD time in scripts/build-craft.mjs. */
    const avLines = [];
    for (let i = 0; i < N; i++) if (isAv(i)) avLines.push(i * P);
    const heroes = [];
    if (avLines.length) {
      const pick = (k) => avLines[(h3(k, 900, 5, seed) * avLines.length) | 0];
      heroes.push({ kind: 'gantry', x: pick(1), z: pick(2) + P * 1.5, h: 7.0, rot: Math.PI / 2 });
      heroes.push({ kind: 'stack',  x: pick(3) + P * 1.5, z: pick(4) + P * 1.5, h: 6.5, rot: 0 });
      heroes.push({ kind: 'mast',   x: pick(5) + P * 1.5, z: pick(6) - P * 1.5, h: 9.6, rot: 0 });
      for (const hr of heroes) { hr.x = ((hr.x % WS) + WS) % WS; hr.z = ((hr.z % WS) + WS) % WS; }
    }

    /* ── the routes ───────────────────────────────────────────────────────────────────────
     * Two street lanes in opposing directions plus one elevated skyway per avenue, both axes.
     * `axis` 0 = the lane runs along +z at a fixed x; 1 = along +x at a fixed z.
     * ⚠ There is NO per-car state anywhere. A lane's cars are the set
     *       { phase + dir·sp·t + k·gap : k ∈ ℤ }
     *   so the visible ones are computed from the camera's own window every frame, the torus wrap
     *   is exact rather than a modulo that can drift, and the acceptance test (position advances
     *   by v·dt along the lane, unchanged across it) holds by construction rather than by care. */
    const lanes = [];
    for (let a = 0; a < avLines.length; a++) {
      const A = avLines[a];
      for (let axis = 0; axis < 2; axis++) {
        lanes.push({ axis, at: A - 1.95, dir: 1,  alt: 0.10, sp: 6.8 + h3(a, axis, 11, seed) * 1.6, gap: 6.2, phase: h3(a, axis, 12, seed) * WS, kind: 0 });
        lanes.push({ axis, at: A + 1.95, dir: -1, alt: 0.10, sp: 6.8 + h3(a, axis, 13, seed) * 1.6, gap: 6.2, phase: h3(a, axis, 14, seed) * WS, kind: 1 });
        lanes.push({ axis, at: A,        dir: (h3(a, axis, 15, seed) > 0.5 ? 1 : -1), alt: 2.25,
                     sp: 10.5 + h3(a, axis, 16, seed) * 2.4, gap: 9.4, phase: h3(a, axis, 17, seed) * WS, kind: 2 });
      }
    }

    const L = {
      name, WS, N, NC, P, CH, SW, AV, AW, seed, profile: pf,
      buildings, heroes, lanes, open, density, avLines,
      cellAt(x, z) { const i = ((Math.floor(x / P) % N) + N) % N, j = ((Math.floor(z / P) % N) + N) % N; return j * N + i; },
      /** nearest avenue centreline point to (x,z) — where a boost gate belongs */
      avenueSnap(x, z) {
        if (!avLines.length) return null;
        let bx = 0, bz = 0, best = Infinity, ax = true;
        for (const A of avLines) {
          const dx = Math.abs(wrapDelta(x - A, WS)); if (dx < best) { best = dx; bx = A; ax = true; }
          const dz = Math.abs(wrapDelta(z - A, WS)); if (dz < best) { best = dz; bz = A; ax = false; }
        }
        return ax ? { x: ((bx % WS) + WS) % WS, y: z } : { x, y: ((bz % WS) + WS) % WS };
      },
      /** nearest cell the plan left EMPTY — where a scenery prop belongs, so it is not in a wall */
      openSpot(x, z) {
        const ci = Math.floor(x / P), cj = Math.floor(z / P);
        for (let r = 0; r <= 4; r++) {
          for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
            const i = ((ci + di) % N + N) % N, j = ((cj + dj) % N + N) % N;
            if (!open[j * N + i]) continue;
            const t = h3(i, j, 71, seed), u = h3(i, j, 72, seed);
            return { x: (i + 0.25 + t * 0.5) * P, y: (j + 0.25 + u * 0.5) * P };
          }
        }
        return null;
      },
    };
    CACHE.set(key, L);
    return L;
  }

  /** one car's world position — the traffic acceptance test, headless, no engine, no camera */
  function laneProbe(name, WS, t, laneIdx, k) {
    const L = layoutFor(name, WS);
    const ln = L.lanes[(laneIdx || 0) % L.lanes.length];
    const s = ln.phase + ln.dir * ln.sp * t + (k || 0) * ln.gap;
    return ln.axis === 0 ? { x: ln.at, y: s, alt: ln.alt, lane: ln }
                         : { x: s, y: ln.at, alt: ln.alt, lane: ln };
  }

  // ════════════════════════════════════════════════════════════════════════════════════════
  // the renderer
  // ════════════════════════════════════════════════════════════════════════════════════════
  function create(app, opt) {
    opt = opt || {};
    const FAR = opt.VIEW_FAR || 34;
    const root = new pc.Entity('dfpc-city');
    app.root.addChild(root);
    if (!ON) { return { root, apply: () => {}, update: () => {}, setKit: () => {},
                        stats: () => ({ ok: false, why: '?city=0' }) }; }

    /* ── materials ──────────────────────────────────────────────────────────────────────
     * §1: a flat printed face may be LIT by the sky and must never be MIRRORED in it. Same
     * treatment js/dfpc-app.js's hullMat arrived at the expensive way — kill the dielectric
     * specular (useSpecularityFactor) rather than the skybox, because cutting the skybox would
     * also cut the ambient DIFFUSE, which is this scene's only fill and would drop every
     * shadowed face to black. */
    const cityMat = new pc.StandardMaterial();
    cityMat.name = 'dfpc-city';
    cityMat.useMetalness = true; cityMat.metalness = 0.0; cityMat.gloss = 0.28;
    cityMat.useSpecularityFactor = true; cityMat.specularityFactor = 0.07;
    /* The corporation's own voice, and the ONLY self-lit thing down there. Unlit on purpose: a
     * sign that dims when it falls into a tower's shadow is a sign that is not switched on. */
    const signMat = new pc.StandardMaterial();
    signMat.name = 'dfpc-city-sign';
    signMat.useLighting = false;
    signMat.diffuse = new pc.Color(0, 0, 0);
    signMat.emissive = new pc.Color(1, 0.86, 0.35);
    signMat.emissiveIntensity = num('signglow', 1.5);
    signMat.update();

    /* ── the traffic layer ───────────────────────────────────────────────────────────────
     * Its own quad layer rather than borrowing dfpc-fx's: sharing one would couple this module's
     * fill to that module's begin/end ordering for the sake of saving a draw call that the budget
     * has room for. One additive layer, one sprite, one call.
     * ⚑ A CAR IS A RIBBON, NOT A DOT, and the reason is physical rather than decorative: a moving
     *   light leaves a streak along its direction of travel. It costs the same two triangles a
     *   billboard does and it is the one cue that says which WAY the lane runs. */
    const traffic = window.DFPCFx ? DFPCFx.quadLayer(app, { name: 'dfpc-traffic', max: 360,
      sprite: DFPCFx.radial(48, 1.5), blend: pc.BLEND_ADDITIVE, emissive: 2.4, fog: true, depthWrite: false }) : null;
    if (traffic) root.addChild(traffic.node);

    /* ── the kit ─────────────────────────────────────────────────────────────────────────
     * Every part arrives as {pos, nrm, idx, tris}, ALREADY normalised — bodies into a unit cube
     * with the base on the origin, heroes uniformly by height so their aspect (and therefore the
     * gantry's opening) survives. setKit() swaps the whole table and rebuilds; until it lands,
     * PROC below is the city, exactly the way dfpc-world keeps a fallback prop so scenery exists
     * from the first frame and forever if the GLB 404s. */
    let KIT = null, kitState = 'procedural';

    /** a stepped box, unit cube, base at origin — the fallback body and nothing more */
    function procBody(steps) {
      const pos = [], nrm = [], idx = [];
      const push = (cx, cy, cz, sx, sy, sz) => {
        const b = pos.length / 3;
        const hx = sx / 2, hz = sz / 2;
        const V = [[-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz],
                   [-hx, sy, -hz], [hx, sy, -hz], [hx, sy, hz], [-hx, sy, hz]];
        const F = [[0, 3, 2, 1, 0, -1, 0], [4, 5, 6, 7, 0, 1, 0], [0, 1, 5, 4, 0, 0, -1],
                   [1, 2, 6, 5, 1, 0, 0], [2, 3, 7, 6, 0, 0, 1], [3, 0, 4, 7, -1, 0, 0]];
        for (const f of F) {
          const o = pos.length / 3;
          for (let k = 0; k < 4; k++) {
            const v = V[f[k]];
            pos.push(cx + v[0], cy + v[1], cz + v[2]); nrm.push(f[4], f[5], f[6]);
          }
          idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
        }
        return b;
      };
      let y = 0, w = 1;
      for (let s = 0; s < steps; s++) { const hh = (s === 0 ? 0.6 : 0.4 / (steps - 1 || 1)); push(0, y, 0, w, hh, w * 0.9); y += hh; w *= 0.72; }
      return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx, tris: idx.length / 3 };
    }
    const PROC = { body: procBody(2), bodyLo: procBody(1) };

    /* ── the merge ───────────────────────────────────────────────────────────────────────
     * ⚑ CHUNKED STATIC MERGE, NOT HARDWARE INSTANCING, and the choice was made on the budget.
     *   Instancing is one draw call per kit mesh, which sounds better — but it loses per-object
     *   frustum culling (every instance in the buffer is submitted) and it costs a dynamic vertex
     *   write every frame. Merging 3×3 cells into one static mesh gives the ENGINE something it
     *   can cull, costs zero per-frame vertex traffic, and lands at ~10 draw calls against a
     *   budget of 24. When the budget has room, the cheaper frame wins over the smaller number.
     *
     * A chunk is built ONCE per theme (~25 of them) and only its NODE moves, camera-relative, the
     * same way every prop and gate in this game already moves. Vertices are stored relative to the
     * chunk CENTRE so the mesh's own bound is centred and culls tightly.
     */
    const chunks = [];
    let L = null, NC = 1, built = '', nHi = 0, nLo = 0, nSign = 0, nCars = 0, triHi = 0, triLo = 0, triSign = 0;

    function makeMesh(pos, nrm, idx) {
      if (!pos.length) return null;
      const m = new pc.Mesh(app.graphicsDevice);
      m.setPositions(pos); m.setNormals(nrm);
      m.setIndices(pos.length / 3 > 65000 ? new Uint32Array(idx) : new Uint16Array(idx));
      m.update(pc.PRIMITIVE_TRIANGLES);
      return m;
    }

    /** append one placed copy of a kit part into the accumulating arrays */
    function stamp(dst, part, x, y, z, rot, sx, sy, sz) {
      if (!part) return;
      const c = Math.cos(rot), s = Math.sin(rot);
      const p = part.pos, n = part.nrm, base = dst.pos.length / 3;
      /* ⚠ NON-UNIFORM SCALE MEANS THE NORMAL TRANSFORM IS NOT THE VERTEX TRANSFORM. A body is
       * squashed in x/z and stretched in y by different factors, so a normal has to go through
       * the INVERSE scale and then be renormalised — feed it the vertex scale and every lit face
       * on a tall building shades as though it were leaning. */
      const ix = 1 / (sx || 1), iy = 1 / (sy || 1), iz = 1 / (sz || 1);
      for (let k = 0; k < p.length; k += 3) {
        const vx = p[k] * sx, vy = p[k + 1] * sy, vz = p[k + 2] * sz;
        dst.pos.push(x + vx * c - vz * s, y + vy, z + vx * s + vz * c);
        let nx = n[k] * ix, ny = n[k + 1] * iy, nz = n[k + 2] * iz;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        dst.nrm.push(nx * c - nz * s, ny, nx * s + nz * c);
      }
      const src = part.idx;
      for (let k = 0; k < src.length; k++) dst.idx.push(base + src[k]);
    }

    function partBody(kitIdx, lod) {
      if (!KIT) return lod ? PROC.bodyLo : PROC.body;
      const k = KITS[kitIdx] || KITS[0];
      return KIT['blk_' + k.name + (lod ? '_lo' : '')] || (lod ? PROC.bodyLo : PROC.body);
    }

    function buildChunks() {
      /* ⚠ DESTROY THE MESHES, NOT JUST THE ENTITIES. A chunk owns a real vertex buffer; dropping
       * the entity unhooks it from the scene graph and leaves the GPU allocation behind. One
       * rebuild per theme is invisible, five themes over a session is 375 orphaned buffers — the
       * same shape of leak dfpc-app records against its per-match ship entities. */
      for (const c of chunks) {
        for (const child of [c.hi, c.lo, c.sg]) {
          if (!child || !child.render) continue;
          for (const mi of child.render.meshInstances) { try { mi.mesh.destroy(); } catch (e) {} }
        }
        try { c.ent.destroy(); } catch (e) {}
      }
      chunks.length = 0;
      if (!L) return;
      NC = L.NC;
      const CS = L.WS / NC;
      const acc = [];
      for (let k = 0; k < NC * NC; k++) {
        acc.push({ hi: { pos: [], nrm: [], idx: [] }, lo: { pos: [], nrm: [], idx: [] }, sg: { pos: [], nrm: [], idx: [] } });
      }
      const idxOf = (x, z) => (Math.min(NC - 1, Math.floor(z / CS)) * NC + Math.min(NC - 1, Math.floor(x / CS)));
      const cenOf = k => [((k % NC) + 0.5) * CS, ((k / NC) | 0) * CS + CS * 0.5];

      for (const b of L.buildings) {
        const k = idxOf(b.x, b.z), cen = cenOf(k);
        const rx = b.x - cen[0], rz = b.z - cen[1];
        // ⚠ sw/sd, never fw/fd — the LOCAL scale, which is the world footprint swapped when the
        // building took a quarter turn. See the note where they are computed.
        stamp(acc[k].hi, partBody(b.kit, 0), rx, 0, rz, b.rot, b.sw, b.h, b.sd);
        stamp(acc[k].lo, partBody(b.kit, 1), rx, 0, rz, b.rot, b.sw, b.h, b.sd);
        const top = KITS[b.kit].top;
        if (b.cap && KIT && KIT['cap_' + b.cap]) {
          // ⚠ the cap is scaled by the FOOTPRINT only, never by height — that is the whole reason
          // roof furniture is a separate part (see build-city.py's authoring constraint)
          const cw = Math.min(b.sw, b.sd) * top * 0.82;
          stamp(acc[k].hi, KIT['cap_' + b.cap], rx, b.h, rz, b.rot, cw, cw * 0.9, cw);
        }
        if (b.crown && (KIT ? KIT.sign_crown : null)) {
          const bw = b.sw * top * 1.05, bd = b.sd * top * 1.05, bh = clamp(b.h * 0.045, 0.10, 0.30);
          stamp(acc[k].sg, KIT.sign_crown, rx, b.h - bh * 0.65, rz, b.rot, bw, bh, bd);
        }
      }
      /* Heroes go into BOTH LODs rather than getting a _lo of their own: there are three of them
       * in the whole city and a landmark that simplifies at range is a landmark you cannot
       * navigate by, which is its entire job. */
      for (const hr of L.heroes) {
        const part = KIT ? KIT['hero_' + hr.kind] : null;
        if (!part) continue;
        const k = idxOf(hr.x, hr.z), cen = cenOf(k);
        const s = hr.h;                                    // heroes are fitted uniformly by height
        stamp(acc[k].hi, part, hr.x - cen[0], 0, hr.z - cen[1], hr.rot, s, s, s);
        stamp(acc[k].lo, part, hr.x - cen[0], 0, hr.z - cen[1], hr.rot, s, s, s);
      }

      triHi = triLo = triSign = 0;
      for (let k = 0; k < NC * NC; k++) {
        const a = acc[k], cen = cenOf(k);
        const ent = new pc.Entity('city' + k);
        root.addChild(ent); ent.enabled = false;
        const mk = (d, mat, cast, recv) => {
          const mesh = makeMesh(new Float32Array(d.pos), new Float32Array(d.nrm), d.idx);
          if (!mesh) return null;
          const e = new pc.Entity('m');
          const mi = new pc.MeshInstance(mesh, mat, e);
          mi.castShadow = cast;
          e.addComponent('render', { meshInstances: [mi], castShadows: cast, receiveShadows: recv });
          ent.addChild(e);
          return e;
        };
        /* ⚑ ONLY THE NEAR LOD CASTS. A shadow map has a fixed texel budget over shadowDistance, so
         * every far caster that lands on a sub-texel silhouette spends rasterisation to darken
         * nothing. The lo chunks are ≥ 18 units out by definition; their shadows are already
         * inside the fog. */
        const hi = mk(a.hi, cityMat, true, true);
        const lo = mk(a.lo, cityMat, false, false);
        const sg = mk(a.sg, signMat, false, false);
        if (hi) hi.enabled = false; if (lo) lo.enabled = false; if (sg) sg.enabled = false;
        triHi += a.hi.idx.length / 3; triLo += a.lo.idx.length / 3; triSign += a.sg.idx.length / 3;
        chunks.push({ ent, hi, lo, sg, cx: cen[0], cz: cen[1], r: CS * 0.708,
                      tHi: a.hi.idx.length / 3, tLo: a.lo.idx.length / 3, tSg: a.sg.idx.length / 3 });
      }
      built = L.name + '|' + kitState;
    }

    /** the authored GLB has landed — swap the kit and rebuild every chunk */
    function setKit(parts) {
      KIT = parts || null;
      kitState = parts ? 'authored' : 'procedural';
      if (L) buildChunks();
    }

    /* ⚠ EARLY-OUT FIRST. `apply` is called every frame from DFPC.sync, and the first version
     * re-derived the palette and called material.update() on both materials before the "did the
     * theme change" test — i.e. it re-ran the engine's shader-variant bookkeeping 60 times a
     * second for two values that change once a match. js/dfpc-world.js records the identical
     * mistake against its own deck material, one function up the call stack. */
    function apply(world, o) {
      const name = (world && world.name) || 'neon grid';
      const next = layoutFor(name, o.WS || 150);
      if (L === next && built === next.name + '|' + kitState) return;
      const skin = (window.DFPCWorld && DFPCWorld.skinFor) ? DFPCWorld.skinFor(world) : null;
      if (skin) {
        /* ⚑ SWEPT, AND THE SWEEP IS WHAT KILLED THE OBVIOUS ANSWER. "Darker city ⇒ harder
         * silhouette ⇒ more contrast" is the reasoning the high-key palette was built on, so
         * 0.74 went in first. Measured on a held chrome-city frame at 1280×800 (luma / RMS
         * contrast / mean |Laplacian|):
         *     0.60 → 99.1 · 49.7 · 58.54
         *     0.74 → 100.5 · 49.7 · 58.38
         *     0.90 → 101.0 · 49.5 · 60.03
         * i.e. a 1.5× albedo sweep moves the frame by less than its own noise — the city is lit
         * mostly by the sky and then compressed by ACES, and the frame is dominated by sky and
         * deck anyway. The albedo is NOT the frame's contrast lever, so it should be spent on the
         * thing it DOES decide:
         * ⚠ THE CITY IS THE FIELD THE CRAFT IS READ AGAINST IN A CANYON. A hull is its team tint
         *   at ×0.24 — genuinely dark, by design — so a city darker than that puts a dark craft on
         *   a dark wall and recreates, at the range where it matters most, the exact defect the
         *   high-key palette was written to fix. At 0.74 the two albedos are 0.197 and 0.172 in
         *   luma, i.e. indistinguishable. At 0.90 the wall is ~1.4× the hull and the silhouette
         *   survives. Just under the PROPS' own albedo, so a tower still reads behind a pylon. */
        const a = num('cityalb', 0.90);
        const p0 = hex(skin.prop);
        cityMat.diffuse = new pc.Color(p0[0] * a, p0[1] * a, p0[2] * a * 1.02);
        cityMat.update();
        /* ⚠ THE SIGN CANNOT BE THE THEME'S OWN GRID COLOUR, which is what it was first. On
         * `chrome city` the lattice, the props and the city are all the same green family, so a
         * green sign on a green tower is a band you cannot see — the corporate layer existed and
         * said nothing. docs/DESIGN-SYSTEM.md §2 has the answer already: "Gold #ffd23b is not a
         * light. It is the accent — the torch, the highlight, the one warm thing." A sign is
         * exactly that, so it is mostly gold with a third of the theme's colour left in it so
         * five cities are still five cities. */
        const g0 = hex(skin.grid), k = 0.66;
        signMat.emissive = new pc.Color(g0[0] * (1 - k) + 1.00 * k, g0[1] * (1 - k) + 0.824 * k, g0[2] * (1 - k) + 0.231 * k);
        signMat.update();
      }
      L = next;
      buildChunks();
    }

    /* kind 0 = with the flow (headlights, warm), 1 = against it (tail lights), 2 = the skyway,
     * which is corporate infrastructure and therefore wears the corporation's own colour — the
     * same one the deck lattice is drawn in. */
    const TRAFFIC_COL = [[255, 232, 188], [255, 96, 58], [150, 240, 255]];

    /* ── per frame ───────────────────────────────────────────────────────────────────────── */
    function update(G, cam, camEnt, o) {
      if (!L) return;
      const WS = o.WS || L.WS, F2 = o.VIEW_FAR || FAR;
      const wdel = v => { v -= Math.round(v / WS) * WS; return v; };
      nHi = nLo = nSign = nCars = 0;

      /* LOD by the chunk's NEAREST point, not its centre. A 30-unit chunk whose centre is 24 out
       * has near geometry at 9 — picking the LOD off the centre would drop a building nine units
       * off your wingtip to the far mesh, which is the one place the swap is visible. */
      const half = (WS / L.NC) * 0.5;
      for (const c of chunks) {
        const dx = wdel(c.cx - cam.x), dz = wdel(c.cz - cam.y);
        const near = Math.hypot(Math.max(0, Math.abs(dx) - half), Math.max(0, Math.abs(dz) - half));
        const on = near <= F2 * 1.05;
        if (c.ent.enabled !== on) c.ent.enabled = on;
        if (!on) continue;
        c.ent.setPosition(dx, 0, dz);
        const hi = near < num('citylod', 18);
        if (c.hi && c.hi.enabled !== hi) c.hi.enabled = hi;
        if (c.lo && c.lo.enabled !== !hi) c.lo.enabled = !hi;
        if (c.sg && !c.sg.enabled) c.sg.enabled = true;
        if (hi) { nHi++; } else { nLo++; }
        if (c.sg) nSign++;
      }

      // ── traffic ──────────────────────────────────────────────────────────────────────────
      if (!traffic) return;
      traffic.begin(camEnt);
      const t = G.t || 0;
      const reach = F2 * 0.94;
      for (const ln of L.lanes) {
        // the cheap half: a lane is a straight line, so one perpendicular test kills the whole
        // lane before a single car is considered
        const perp = ln.axis === 0 ? wdel(ln.at - cam.x) : wdel(ln.at - cam.y);
        if (Math.abs(perp) > reach) continue;
        const span = Math.sqrt(Math.max(0, reach * reach - perp * perp));
        const along = ln.axis === 0 ? cam.y : cam.x;
        const base = ln.phase + ln.dir * ln.sp * t;
        const k0 = Math.ceil((along - span - base) / ln.gap), k1 = Math.floor((along + span - base) / ln.gap);
        const col = TRAFFIC_COL[ln.kind];
        const w = ln.kind === 2 ? 0.075 : 0.055, len = ln.kind === 2 ? 0.26 : 0.18;
        for (let k = k0; k <= k1; k++) {
          if (nCars >= 340) break;
          const s = base + k * ln.gap;
          const d = s - along;
          const ax = ln.axis === 0 ? perp : d, az = ln.axis === 0 ? d : perp;
          // fade the last few units so a car never pops into being at the fog wall
          const dist = Math.hypot(ax, az);
          const fade = clamp((1 - dist / reach) * 4.2, 0, 1);
          if (fade <= 0.02) continue;
          const ex = ln.axis === 0 ? 0 : ln.dir * len, ez = ln.axis === 0 ? ln.dir * len : 0;
          traffic.ribbon(ax - ex, ln.alt, az - ez, ax + ex, ln.alt, az + ez, w * 0.5, w,
            col[0] * fade, col[1] * fade, col[2] * fade, 255);
          nCars++;
        }
      }
      /* Hazard beacons on the crowns of the tallest towers and on the mast. ⛔ STEADY, not
       * flashing: §4's "nothing moves on its own" is a house rule, and a blinking light is the
       * cheapest possible way to break it. Real warning lights come both ways; only one of them
       * obeys the rule. */
      for (const hr of L.heroes) {
        const dx = wdel(hr.x - cam.x), dz = wdel(hr.z - cam.y);
        if (Math.hypot(dx, dz) > reach) continue;
        traffic.billboard(dx, hr.h * 0.99, dz, 0.13, 255, 96, 58, 255, 1);
        nCars++;
      }
      traffic.end();
    }

    return { root, apply, update, setKit,
      layout: () => L,
      stats: () => ({ ok: true, kit: kitState, theme: L ? L.name : '-',
        buildings: L ? L.buildings.length : 0, chunks: chunks.length,
        hi: nHi, lo: nLo, sign: nSign, cars: nCars,
        tris: Math.round(chunks.reduce((a, c) => a + (c.ent.enabled ? ((c.hi && c.hi.enabled ? c.tHi : 0) + (c.lo && c.lo.enabled ? c.tLo : 0) + (c.sg && c.sg.enabled ? c.tSg : 0)) : 0), 0)) + nCars * 2,
        draws: nHi + nLo + nSign + (nCars ? 1 : 0),
        triTotal: Math.round(triHi + triLo + triSign) }) };
  }

  return { create, layoutFor, laneProbe, PROFILE, KITS, P, SW, AV, AW, CH, enabled: () => ON };
})();

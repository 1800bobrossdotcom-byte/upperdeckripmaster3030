/* upperdeckripmaster3030 — Section 9 GAME CORE, renderer-agnostic (S9Game).
 *
 * The shipping game (`section9.html`) carries its rules and its canvas renderer in ONE inline
 * script. The PlayCanvas build needs the rules and not the renderer, so this file is the rules:
 * maps, collision, weapons, damage, the cover AI, the match clock, the payout hand-off. It draws
 * nothing, touches no canvas and knows no engine — everything visual is state on `G` that a
 * renderer reads.
 *
 *   const g = S9Game.create({ sfx, powMsg, onKill, onEnd, wager });
 *   g.startMatch(real);  g.step(dt);   // then draw g.G / g.cam however you like
 *
 * ⚑ THE NUMBERS ARE THE SHIPPING NUMBERS and they are load-bearing. 150 HP / 60 armour, AK 17,
 *   pistol 22, buckshot 9, rifle 88 ⇒ ~1.3 s TTK; headshot ×2.1 AND armour soaking only 15% of a
 *   headshot vs 45% of a body hit; out-of-combat regen to 62% after 4.5 s. Those were tuned
 *   together — at the old 100 HP / 26 dmg an AK duel was ~0.63 s and cover, suppression and
 *   visible bullets could not exist because nobody lived long enough to use them. Do not "clean
 *   them up".
 *
 * ⚑ ONE REAL FIX vs section9.html. Its `spawnEnt` has a swallowed line: a `//` comment ends with
 *   `…kit being handled e.spawnT=0; e.iframe=1.4; e.respawnT=0; e.reloading=false; …`, so on a
 *   RESPAWN (not the initial drop, which sets iframe separately) the operative gets no spawn
 *   protection, keeps a half-finished reload and keeps its fire cooldown. Restored below. The
 *   shipping file is deliberately untouched; this is noted so the fix can be carried over.
 *
 * WHAT IS DELIBERATELY NOT HERE: `bakeFaces`/`bakeNeon`/`drawEntities` and the whole canvas
 * software rasteriser. Those are `section9.html`'s renderer, and this build has an engine.
 */
window.S9Game = (function () {
  const TAU = Math.PI * 2;
  const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
  const rint = n => Math.floor(Math.random() * n);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const angDiff = a => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
  const shortName = n => { n = String(n || ''); return n.length > 13 ? n.slice(0, 12) + '…' : n; };

  /* de_dust2 dust palette. Only `kind` matters to this module (collision + AI read it); `base`
   * is carried because S9World.load() wants a palette and the 2D fallback used the colours. */
  const PAL = {
    floorA: [199, 178, 133], floorB: [186, 164, 120], wall: [201, 180, 138], perim: [176, 154, 113], ceil: [150, 120, 86],
    crate: [150, 109, 60], pillar: [190, 169, 128], cover: [120, 120, 78], stair: [196, 176, 134], plat: [200, 181, 140], shelf: [150, 109, 60],
    ammo: [96, 108, 66], hazard: [196, 164, 60], band: [42, 38, 30], sand: [205, 185, 142], sandstoneDk: [150, 128, 92],
  };

  // ── map authoring (the six hand-built arenas) ───────────────────────────────────────────────
  /* ⚑ `open: true` — THE SIX HAND-BUILT ARENAS ARE WALLED YARDS UNDER A DUSK SKY, not rooms.
   * "tight interior" in the comments below describes the LAYOUT (rooms joined by corridors),
   * not a roof, and `ceilY` is a jump/spawn ceiling rather than geometry. The shipping renderer
   * has one global dusk ENV and draws all six that way — orange sky above the walls, hard low
   * sun, deep shadow — and that is the game's look.
   * Leaving this flag unset made the engine build treat every one of them as an INTERIOR: it hung
   * ceiling practicals, swapped in the indoor sky, pushed the IBL fill to 5.2x and opened the
   * exposure to 1.25. Measured against the shipping build on the SAME arena that cost the frame
   * its black point entirely — blacks 7.3% of frame -> 0.4%, saturation 52.5% -> 27.4% — which
   * reads as "the engine washed the game out". It was not a lighting-taste question; it was a
   * roof that is not there.
   * Baked levels keep their own per-level flag (S9PCWorld.LEVELS: ROOFTOP open, the others not),
   * because those genuinely are interiors and have real ceilings in the mesh. */
  function newMap(name, x0, x1, z0, z1, ceilY) { return { name, x0, x1, z0, z1, ceilY, open: true, solids: [], spawns: [] }; }
  function addBox(M, x0, z0, x1, z1, y0, y1, base, kind) {
    M.solids.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, base, kind: kind || 'wall' });
  }
  function addStairs(M, x0, z0, dir, steps, w, rise, run, base) {
    for (let i = 0; i < steps; i++) {
      const y1 = (i + 1) * rise;
      if (dir === '+z') addBox(M, x0, z0 + i * run, x0 + w, z0 + (i + 1) * run + 0.02, 0, y1, base, 'stair');
      else if (dir === '-z') addBox(M, x0, z0 - (i + 1) * run - 0.02, x0 + w, z0 - i * run, 0, y1, base, 'stair');
      else if (dir === '+x') addBox(M, x0 + i * run, z0, x0 + (i + 1) * run + 0.02, z0 + w, 0, y1, base, 'stair');
      else addBox(M, x0 - (i + 1) * run - 0.02, z0, x0 - i * run, z0 + w, 0, y1, base, 'stair');
    }
  }
  function perimeter(M) {
    const t = 1, h = M.ceilY;
    addBox(M, M.x0 - t, M.z0 - t, M.x1 + t, M.z0, 0, h, PAL.perim, 'perim');
    addBox(M, M.x0 - t, M.z1, M.x1 + t, M.z1 + t, 0, h, PAL.perim, 'perim');
    addBox(M, M.x0 - t, M.z0 - t, M.x0, M.z1 + t, 0, h, PAL.perim, 'perim');
    addBox(M, M.x1, M.z0 - t, M.x1 + t, M.z1 + t, 0, h, PAL.perim, 'perim');
  }

  function buildMaps() {
    const maps = [];
    // ── KOWLOON BLOCK — tight interior, two rooms + corridor, central plateau, sniper ledge
    { const M = newMap('KOWLOON BLOCK', -22, 22, -18, 18, 6); perimeter(M);
      addBox(M, -3, -18, -2, -6, 0, 6, PAL.wall);
      addBox(M, -3, 6, -2, 18, 0, 6, PAL.wall);
      addBox(M, -22, -2, -8, -1, 0, 6, PAL.wall);
      addBox(M, 4, -2, 22, -1, 0, 6, PAL.wall);
      addBox(M, -6, -4, 6, 4, 0, 2, PAL.plat, 'plat');
      addStairs(M, -6, 4, '+z', 4, 12, 0.5, 0.9, PAL.stair);
      addBox(M, 16, -14, 21, -4, 0, 3.2, PAL.plat, 'plat');
      addStairs(M, 15, -14, '-z', 6, 4, 0.55, 0.7, PAL.stair);
      addBox(M, -18, 10, -16, 12, 0, 1.4, PAL.ammo, 'ammo');
      addBox(M, -16.2, 10.2, -14.8, 11.6, 0, 2.6, PAL.ammo, 'ammo');
      addBox(M, 12, 10, 14, 12, 0, 1.2, PAL.cover, 'cover');
      addBox(M, 8, -15, 10, -13, 0, 1.2, PAL.cover, 'cover');
      addBox(M, -14, -14, -12, -12, 0, 1.6, PAL.ammo, 'ammo');
      addBox(M, 0, 12, 1.4, 13.4, 0, 1.1, PAL.cover, 'cover');
      addBox(M, -10, 2, -8.5, 3.5, 0, 1.1, PAL.cover, 'cover');
      addBox(M, 9, 3, 10.5, 4.5, 0, 1.1, PAL.cover, 'cover');
      addBox(M, -1, -1, 1, 1, 0, 6, PAL.pillar, 'pillar');
      M.spawns = [[-18, -14], [18, -14], [-18, 14], [18, 14], [0, -15], [0, 15], [-19, 0], [19, 8], [0, 0]];
      maps.push(M); }
    // ── COLD STORAGE — warehouse, shelving rows, a catwalk you walk under and over
    { const M = newMap('COLD STORAGE', -24, 24, -20, 20, 6.5); perimeter(M);
      for (const cx of [-15, -5, 5, 15]) {
        addBox(M, cx - 0.9, -14, cx + 0.9, -2, 0, 1.5, PAL.shelf, 'cover');
        addBox(M, cx - 0.9, 2, cx + 0.9, 14, 0, 1.5, PAL.shelf, 'cover'); }
      addBox(M, -24, -1.4, 24, 1.4, 3.2, 3.7, PAL.plat, 'plat');
      addBox(M, -24, -3, -18, 3, 0, 3.2, PAL.plat, 'plat');
      addBox(M, 18, -3, 24, 3, 0, 3.2, PAL.plat, 'plat');
      addStairs(M, -18, -2.5, '+x', 5, 5, 0.64, 0.8, PAL.stair);
      addStairs(M, 18, -2.5, '-x', 5, 5, 0.64, 0.8, PAL.stair);
      addBox(M, -21, -17, -18, -14, 0, 1.6, PAL.ammo, 'ammo');
      addBox(M, -20.4, -16.4, -18.6, -14.6, 0, 3.0, PAL.ammo, 'ammo');
      addBox(M, 18, 15, 21, 18, 0, 1.6, PAL.ammo, 'ammo');
      addBox(M, 18.6, 15.6, 20.4, 17.4, 0, 3.0, PAL.ammo, 'ammo');
      addBox(M, -21, 15, -18, 18, 0, 2.0, PAL.ammo, 'ammo');
      addBox(M, 18, -18, 21, -15, 0, 2.0, PAL.ammo, 'ammo');
      addBox(M, -2, -6, 2, -4.5, 0, 1.1, PAL.cover, 'cover');
      addBox(M, -2, 4.5, 2, 6, 0, 1.1, PAL.cover, 'cover');
      M.spawns = [[-21, -17], [21, 17], [-21, 17], [21, -17], [0, -18], [0, 18], [-22, 0], [22, 0], [-10, -8], [10, 8]];
      maps.push(M); }
    // ── NEON STREET — a city block: two building rows, alleys, reachable rooftops
    { const M = newMap('NEON STREET', -26, 26, -22, 22, 7); perimeter(M);
      addBox(M, -26, -22, -14, -11, 0, 7, PAL.wall);
      addBox(M, -26, -8, -14, 4, 0, 7, PAL.wall);
      addBox(M, -26, 7, -14, 22, 0, 7, PAL.wall);
      addBox(M, 14, -22, 26, -13, 0, 7, PAL.wall);
      addBox(M, 14, -10, 26, 6, 0, 7, PAL.wall);
      addBox(M, 14, 9, 26, 22, 0, 7, PAL.wall);
      addBox(M, -14, -22, -9, -11, 0, 3.4, PAL.plat, 'plat');
      addBox(M, -14, 7, -9, 22, 0, 3.4, PAL.plat, 'plat');
      addBox(M, 9, -22, 14, -13, 0, 3.4, PAL.plat, 'plat');
      addBox(M, 9, 9, 14, 22, 0, 3.4, PAL.plat, 'plat');
      addStairs(M, -9, -20, '+x', 6, 5, 0.57, 0.8, PAL.stair);
      addStairs(M, -9, 18, '+x', 6, 5, 0.57, 0.8, PAL.stair);
      addStairs(M, 9, -20, '-x', 6, 5, 0.57, 0.8, PAL.stair);
      addStairs(M, 9, 18, '-x', 6, 5, 0.57, 0.8, PAL.stair);
      addBox(M, -4, -3, 4, 3, 0, 1.6, PAL.plat, 'plat');
      addBox(M, -1.2, -1.2, 1.2, 1.2, 0, 4.2, PAL.pillar, 'pillar');
      addBox(M, -8, -16, -5.6, -13.6, 0, 1.3, PAL.cover, 'cover');
      addBox(M, 5.6, -16, 8, -13.6, 0, 1.3, PAL.cover, 'cover');
      addBox(M, -8, 13.6, -5.6, 16, 0, 1.3, PAL.cover, 'cover');
      addBox(M, 5.6, 13.6, 8, 16, 0, 1.3, PAL.cover, 'cover');
      addBox(M, -2, -10, 2, -8.6, 0, 1.1, PAL.cover, 'cover');
      addBox(M, -2, 8.6, 2, 10, 0, 1.1, PAL.cover, 'cover');
      addBox(M, -11, -2, -9.4, 2, 0, 1.5, PAL.shelf, 'cover');
      addBox(M, 9.4, -2, 11, 2, 0, 1.5, PAL.shelf, 'cover');
      addBox(M, -13.4, -10.4, -11.6, -8.6, 0, 1.5, PAL.ammo, 'ammo');
      addBox(M, 11.6, 5.6, 13.4, 7.4, 0, 1.5, PAL.ammo, 'ammo');
      addBox(M, -13.4, 4.6, -11.6, 6.4, 0, 1.6, PAL.ammo, 'ammo');
      addBox(M, 11.6, -12.4, 13.4, -10.6, 0, 1.6, PAL.ammo, 'ammo');
      M.spawns = [[-11, -19], [11, -19], [-11, 19], [11, 19], [0, -20], [0, 20], [-12, 0], [12, 0], [0, -6], [0, 6]];
      M.city = true; M.open = true;                 // a street at dusk: keep the sun, no roof
      maps.push(M); }
    // ── DUST BOWL — open sand arena ringed by tiered stands; long sightlines
    { const M = newMap('DUST BOWL', -25, 25, -21, 21, 8); perimeter(M);
      for (let t = 0; t < 3; t++) { const y = 1.1 * (t + 1), inset = t * 2.4;
        addBox(M, -25 + inset, -21, -21 + inset, 21, 0, y, PAL.plat, 'plat');
        addBox(M, 21 - inset, -21, 25 - inset, 21, 0, y, PAL.plat, 'plat'); }
      addStairs(M, -16, -19, '-x', 5, 4, 0.62, 0.8, PAL.stair);
      addStairs(M, 16, -19, '+x', 5, 4, 0.62, 0.8, PAL.stair);
      addStairs(M, -16, 15, '-x', 5, 4, 0.62, 0.8, PAL.stair);
      addStairs(M, 16, 15, '+x', 5, 4, 0.62, 0.8, PAL.stair);
      addBox(M, -6, -4, 6, 4, 0, 1.5, PAL.sand, 'plat');
      addBox(M, -1.1, -1.1, 1.1, 1.1, 0, 4.6, PAL.pillar, 'pillar');
      const clusters = [[-13, -11], [13, -11], [-13, 11], [13, 11], [0, -15], [0, 15]];
      for (const [cx, cz] of clusters) {
        addBox(M, cx - 1.5, cz - 1.5, cx + 1.5, cz + 1.5, 0, 1.5, PAL.crate, 'crate');
        addBox(M, cx - 0.9, cz + 1.5, cx + 0.9, cz + 2.9, 0, 1.0, PAL.crate, 'crate'); }
      addBox(M, -19.6, -1.0, -17.8, 1.0, 0, 1.5, PAL.ammo, 'ammo');
      addBox(M, 17.8, -1.0, 19.6, 1.0, 0, 1.5, PAL.ammo, 'ammo');
      // the stands step inward to |x|≈16.2 — arena-floor spawns are AUTHORED inside that, not rescued
      M.spawns = [[-13, -17], [13, -17], [-13, 17], [13, 17], [0, -18], [0, 18], [-13, 0], [13, 0], [-7, -9], [7, 9]];
      M.open = true;                                // an open sand bowl under the sun
      maps.push(M); }
    // ── SUBWAY — two platforms either side of an exposed track trench, joined by a mezzanine
    { const M = newMap('SUBWAY', -26, 26, -16, 16, 6.5); perimeter(M);
      addBox(M, -26, -16, 26, -4.5, 0, 1.25, PAL.plat, 'plat');
      addBox(M, -26, 4.5, 26, 16, 0, 1.25, PAL.plat, 'plat');
      for (let x = -21; x <= 21; x += 6) {
        addBox(M, x - 0.55, -5.6, x + 0.55, -4.5, 0, 6.5, PAL.pillar, 'pillar');
        addBox(M, x - 0.55, 4.5, x + 0.55, 5.6, 0, 6.5, PAL.pillar, 'pillar'); }
      addBox(M, -4, -5, 4, 5, 3.3, 3.85, PAL.plat, 'plat');
      addStairs(M, -8, -4.4, '+x', 5, 3, 0.66, 0.8, PAL.stair);
      addStairs(M, 8, 1.4, '-x', 5, 3, 0.66, 0.8, PAL.stair);
      for (const [bx, bz] of [[-15, -9], [15, -9], [-15, 9], [15, 9], [-8, -12], [8, 12]])
        addBox(M, bx - 1.6, bz - 0.7, bx + 1.6, bz + 0.7, 1.25, 2.15, PAL.cover, 'cover');
      addBox(M, -24.2, -8.9, -22.6, -7.1, 1.25, 2.75, PAL.ammo, 'ammo');
      addBox(M, 22.6, 7.1, 24.2, 8.9, 1.25, 2.75, PAL.ammo, 'ammo');
      M.spawns = [[-22, -12], [22, -12], [-22, 12], [22, 12], [-12, -13], [12, 13], [0, -13], [0, 13], [-18, 0], [18, 0]];
      maps.push(M); }
    // ── NIGHT MARKET — shelf aisles make a grid of corridors; the checkouts are the open room
    { const M = newMap('NIGHT MARKET', -24, 24, -19, 19, 5.5); perimeter(M);
      for (let i = 0; i < 5; i++) { const x = -16 + i * 7;
        addBox(M, x - 1.1, -13, x + 1.1, -2.5, 0, 2.35, PAL.shelf, 'cover');
        addBox(M, x - 1.1, 2.5, x + 1.1, 13, 0, 2.35, PAL.shelf, 'cover'); }
      for (let i = 0; i < 4; i++) { const x = -13 + i * 8;
        addBox(M, x - 2.6, 15.4, x + 2.6, 16.6, 0, 1.15, PAL.cover, 'cover'); }
      addBox(M, 12, -19, 24, -14.6, 0, 5.5, PAL.wall);
      addBox(M, 12, -14.6, 15.4, -13.4, 0, 5.5, PAL.wall);
      addBox(M, 19, -14.6, 24, -13.4, 0, 5.5, PAL.wall);
      addBox(M, -21.5, -17, -17.5, -13, 0, 1.5, PAL.crate, 'crate');
      addBox(M, -20.8, -16.3, -18.2, -13.7, 1.5, 2.9, PAL.crate, 'crate');
      addStairs(M, -17.4, -16.5, '+x', 4, 3.4, 0.62, 0.8, PAL.stair);
      addBox(M, -2.2, -1.0, 2.2, 1.0, 0, 1.35, PAL.cover, 'cover');
      addBox(M, 16.4, -16.4, 18.0, -14.8, 0, 1.6, PAL.ammo, 'ammo');
      addBox(M, -22.4, 13.4, -20.8, 15.0, 0, 1.6, PAL.ammo, 'ammo');
      M.spawns = [[-20, -9], [20, -9], [-20, 9], [20, 9], [0, -16], [0, 16], [-9, 0], [9, 0], [18, 16], [-18, 16]];
      maps.push(M); }

    /* ── LIDO DECK — authored FOR daylight, not retinted into it ─────────────────────────────
     * ⚑ WHY A NEW ARENA RATHER THAN A NEW PALETTE. The six above are concrete yards: every solid
     * is `wall`, `cover`, `plat` or `crate`, which is four shades of the same grey box. Switching
     * the sun to daylight measured brighter and sharper but took saturation 50.8% → 20.9%, and
     * repainting those tints could not fix it — the frame had no colour IN it, only coloured
     * light on it. You cannot retint your way to a place. The reference frames read the way they
     * do because the LEVEL is a location with water and planting and canvas in it, at different
     * glosses, so the eye gets material variety and large flat colour fields at the same time.
     *
     * So this one is built out of the outdoor material classes (S9PCWorld: water · plant ·
     * awning · trim) and laid out to the same rules the other six obey:
     *   · the pool is a big EXPOSED crossing — 0.2 m of water is walkable, so it reads as open
     *     ground that happens to be the most saturated thing in frame. Risk you can see.
     *   · cover is COLOURED and low (planters, cabanas), so "where can I hide" is answerable at
     *     a glance from across the arena — which is the actual clarity win, not the sharpening.
     *   · the colonnade gives peek-and-shoot down the long axis; the terraces give height without
     *     giving a perch that sees everything.
     *   · white trim goes on EDGES only. It is the brightest value here, and a bright edge is
     *     what makes a silhouette in front of it legible. */
    { const M = newMap('LIDO DECK', -26, 26, -22, 22, 12); perimeter(M);
      // the pool — one flat teal field, wadeable (0.2 < the 0.62 step height), dead centre
      addBox(M, -9.5, -7.5, 9.5, 7.5, 0, 0.2, PAL.sand, 'water');
      // kerb: a low lip you vault, and the bright line that draws the pool's shape
      for (const [a, b, c, d] of [[-10.2, -8.2, 10.2, -7.5], [-10.2, 7.5, 10.2, 8.2],
                                  [-10.2, -8.2, -9.5, 8.2], [9.5, -8.2, 10.2, 8.2]])
        addBox(M, a, b, c, d, 0, 0.55, PAL.plat, 'trim');
      // sun terraces, +x and −x, two heights so neither owns the other
      addBox(M, -25, -13, -17, 13, 0, 2.4, PAL.plat, 'plat');
      addBox(M, 17, -13, 25, 13, 0, 3.4, PAL.plat, 'plat');
      addStairs(M, -17, -6, '+x', 4, 5.5, 0.62, 0.85, PAL.stair);
      addStairs(M, 17, 0.5, '-x', 5, 5.5, 0.7, 0.85, PAL.stair);
      // balustrades — cover ON the terraces, and the bright edge that separates them from the sky
      addBox(M, -17.6, -13, -17, 13, 2.4, 3.5, PAL.plat, 'trim');
      addBox(M, 17, -13, 17.6, 13, 3.4, 4.5, PAL.plat, 'trim');
      // colonnade down the −z side: peek-and-shoot, and the reference's portico
      for (let i = 0; i < 7; i++) { const x = -18 + i * 6;
        addBox(M, x - 0.75, -19.5, x + 0.75, -18, 0, 6.2, PAL.pillar, 'trim'); }
      addBox(M, -21, -20.4, 21, -19.5, 5.6, 6.6, PAL.plat, 'trim');   // the lintel they carry
      // cabanas — coral canvas, mid-field cover you can find at any range
      for (const [cx, cz] of [[-11.5, 13.5], [0, 15.5], [11.5, 13.5], [-6, -12.5], [6, -12.5]]) {
        addBox(M, cx - 2.1, cz - 1.6, cx + 2.1, cz + 1.6, 0, 2.5, PAL.crate, 'awning');
        addBox(M, cx - 2.6, cz - 2.0, cx + 2.6, cz + 2.0, 2.5, 2.85, PAL.crate, 'awning'); }
      // planters: low green cover, scattered so the open floor is never a single empty run
      for (const [px, pz] of [[-13.5, 4.5], [13.5, -4.5], [-13.5, -4.5], [13.5, 4.5],
                              [0, 11], [0, -10], [-4.5, 18], [4.5, 18]]) {
        addBox(M, px - 1.5, pz - 1.5, px + 1.5, pz + 1.5, 0, 0.75, PAL.plat, 'trim');
        addBox(M, px - 1.2, pz - 1.2, px + 1.2, pz + 1.2, 0.75, 1.65, PAL.cover, 'plant'); }
      /* ⚑ THE DIVING TOWER, AND WHY THE POOL NEEDED SOMETHING IN IT. "One big flat teal field in
       * the middle" was a nice idea about colour and a bad piece of level design: it made every
       * sightline flat deck below and flat sky above, with nothing in between. Measured from a
       * spawn — rms 11.7, edge 0.50, against 39–49 from a spot in the same arena with structure
       * in front of the camera. Haze was not the cause and neither was exposure; both were
       * chased first and neither moved it. A frame needs an OCCUPANT.
       * So the pool gets a tower at its centre: it is the landmark every spawn looks at, it
       * breaks the one sightline that crossed the whole arena unobstructed, and it turns the
       * exposed wade into a crossing with something to break to. */
      addBox(M, -1.6, -1.6, 1.6, 1.6, 0, 7.6, PAL.pillar, 'trim');
      addBox(M, -3.4, -3.4, 3.4, 3.4, 7.6, 8.2, PAL.plat, 'trim');       // the board
      addBox(M, -3.4, -3.4, 3.4, -2.6, 8.2, 9.0, PAL.plat, 'trim');      // its rail, so the top reads as a place
      addBox(M, -3.4, 2.6, 3.4, 3.4, 8.2, 9.0, PAL.plat, 'trim');
      // parasols — thin posts with wide canopies at head height, mid-field frame-breakers
      for (const [ux, uz] of [[-13, 0], [13, 0], [0, -11], [0, 11]]) {
        addBox(M, ux - 0.3, uz - 0.3, ux + 0.3, uz + 0.3, 0, 3.1, PAL.pillar, 'trim');
        addBox(M, ux - 2.4, uz - 2.4, ux + 2.4, uz + 2.4, 3.1, 3.5, PAL.crate, 'awning'); }
      // lifeguard stand — the one high perch, deliberately small and exposed on three sides
      addBox(M, -1.4, 19, 1.4, 21.4, 0, 4.2, PAL.plat, 'plat');
      addBox(M, -1.6, 18.8, 1.6, 19.2, 4.2, 5.1, PAL.plat, 'trim');
      addStairs(M, -1.4, 18.9, '-z', 5, 2.8, 0.84, 0.8, PAL.stair);
      /* ⚑ VERTICAL MASS — the fix for a frame that was half empty sky. The first draft topped out
       * at the 6.6 m lintel in a 52×44 yard, so from a spawn you looked across 40 m at a 9 m
       * perimeter that subtends ~10° and the rest of the frame was gradient: measured rms 11,
       * edge 0.47, against 39–49 rms from the same arena at a spot with something in front of it.
       * That is not a lighting bug and no exposure value fixes it — an arena needs things ABOVE
       * eyeline or the sky is the picture. The reference frames are full of building: a pavilion
       * behind the pool, a tower, a roofed colonnade. Same here, and every mass is also cover. */
      addBox(M, -22, 16.5, -10, 21.5, 0, 9.5, PAL.wall);        // north pavilion
      addBox(M, 10, 16.5, 22, 21.5, 0, 8.0, PAL.wall);          // its shorter twin, so neither owns the skyline
      addBox(M, -22.4, 16.1, -9.6, 16.9, 9.5, 10.2, PAL.plat, 'trim');   // cornice: the bright top edge
      addBox(M, 9.6, 16.1, 22.4, 16.9, 8.0, 8.7, PAL.plat, 'trim');
      addBox(M, -24.5, -20.5, -19, -15, 0, 12.5, PAL.wall);     // corner towers — the tall silhouette
      addBox(M, 19, -20.5, 24.5, -15, 0, 10.5, PAL.wall);
      addBox(M, -24.9, -20.9, -18.6, -14.6, 12.5, 13.2, PAL.plat, 'trim');
      addBox(M, 18.6, -20.9, 24.9, -14.6, 10.5, 11.2, PAL.plat, 'trim');
      addBox(M, -21, -21, 21, -19.5, 6.2, 7.0, PAL.plat, 'trim');        // roof over the colonnade
      // clutter, because a lido has clutter and clutter breaks a sightline
      addBox(M, -8.5, 15.5, -6.5, 17.5, 0, 1.5, PAL.crate, 'crate');
      addBox(M, 6.5, 15.5, 8.5, 17.5, 0, 1.5, PAL.crate, 'crate');
      /* ⚑ SPAWNS AUTHORED, THEN VERIFIED — 12/12 clear, fixSpawns relocates none. CLAUDE.md's
       * rule is that a map needing rescue is a wrong map, and the first draft of this one broke
       * it three times: [0,19] sat inside the lifeguard stand, and [±14,0] sat inside the two
       * stair runs — none of which is visible in the source, because a staircase is authored as
       * a loop and reads as one line. The rescue spiral then dropped the player 4 m from a 2.4 m
       * terrace wall FACING it, which is what a blank first frame actually was. Checked against
       * the game's own blocks()/inBounds over MAP.solids, plus a 32-ray sweep for the longest
       * clear line: every spawn below has 19 m or more of open sightline. */
      M.spawns = [[-13, 10], [13, 10], [-13, -10], [13, -10], [-6, 12], [6, 12],
                  [-21, 14.5], [21, 14.5], [-15, -9], [15, -9], [-15, -17], [15, -17]];
      maps.push(M); }
    return maps;
  }

  /* Spawn sanity. A hand-written [x,z] that lands inside a roof deck puts you at y=0 sealed in
   * geometry staring at a wall — which reads as "the update didn't ship". Skipped for baked
   * levels: `npm run level` already validated those against this same box set, and the rescue
   * spiral searches x/z only, so on a level with floors at 1.05, 11.79 and 19.84 the "nearest
   * clear point" is very often thin air. */
  function fixSpawns(M) {
    if (M.wld) return M;
    const HEAD = 1.72, CLEAR = 1.5;
    const blocks = (x, z, pad) => M.solids.some(b => x + pad > b.x0 && x - pad < b.x1 && z + pad > b.z0 && z - pad < b.z1 && b.y1 > 0.62 && b.y0 < HEAD);
    const inBounds = (x, z) => x > M.x0 + 1.2 && x < M.x1 - 1.2 && z > M.z0 + 1.2 && z < M.z1 - 1.2;
    let moved = 0;
    M.spawns = M.spawns.map(([sx, sz]) => {
      if (inBounds(sx, sz) && !blocks(sx, sz, CLEAR)) return [sx, sz];
      for (let rad = 1; rad <= 20; rad += 0.5)
        for (let a = 0; a < 24; a++) { const th = a / 24 * TAU, px = sx + Math.cos(th) * rad, pz = sz + Math.sin(th) * rad;
          if (inBounds(px, pz) && !blocks(px, pz, CLEAR)) { moved++; return [+px.toFixed(2), +pz.toFixed(2)]; } }
      moved++; return [0, 0];
    });
    M.spawnsMoved = moved;
    return M;
  }

  /* Which way you face on the drop. "Face the arena centre" puts your nose in a wall whenever the
   * centre is behind one; sweep the compass and take the longest clear sightline instead. Eye
   * height is measured from the floor you stand ON — a baked deck can be 11.8 m up. */
  function spawnYaw(M, x, z, y) {
    const EYE = (y || 0) + 1.52, MAXD = 26; let best = 0, bestD = -1;
    for (let a = 0; a < 24; a++) { const yaw = a / 24 * TAU, dx = Math.sin(yaw), dz = Math.cos(yaw);
      let d = 0.6;
      for (; d < MAXD; d += 0.6) { const px = x + dx * d, pz = z + dz * d;
        if (px < M.x0 || px > M.x1 || pz < M.z0 || pz > M.z1) break;
        if (M.solids.some(b => px > b.x0 && px < b.x1 && pz > b.z0 && pz < b.z1 && b.y1 > EYE && b.y0 < EYE)) break; }
      const score = d - 0.05 * Math.hypot(x + dx * d, z + dz * d);
      if (score > bestD) { bestD = score; best = yaw; } }
    return best;
  }

  /* Cover points: the perimeter of every solid tall enough to hide behind, baked once per map.
   * Both map kinds already carry that information in MAP.solids — a box you cannot see through is
   * a box you can hide behind. ⚑ y is stored per point, because on a baked level a cover point
   * without its own y is somewhere a bot walks to and falls through. */
  function bakeCover(M) {
    const CH = 0.95, PAD = 0.85, pts = [];
    const blocked = (x, z) => M.solids.some(b => x + 0.5 > b.x0 && x - 0.5 < b.x1 && z + 0.5 > b.z0 && z - 0.5 < b.z1 && b.y1 > 0.7 && b.y0 < 1.7);
    for (const b of M.solids) {
      const hgt = b.y1 - b.y0; if (hgt < CH) continue;
      if (b.y0 > 12) continue;
      const wx = b.x1 - b.x0, wz = b.z1 - b.z0; if (wx < 0.6 && wz < 0.6) continue;
      const nx = Math.min(3, Math.max(1, Math.round(wx / 2.6))), nz = Math.min(3, Math.max(1, Math.round(wz / 2.6)));
      const cand = [];
      for (let i = 0; i < nx; i++) { const t = (i + 0.5) / nx, px = b.x0 + wx * t; cand.push([px, b.z0 - PAD], [px, b.z1 + PAD]); }
      for (let i = 0; i < nz; i++) { const t = (i + 0.5) / nz, pz = b.z0 + wz * t; cand.push([b.x0 - PAD, pz], [b.x1 + PAD, pz]); }
      for (const [x, z] of cand) {
        if (x < M.x0 + 0.6 || x > M.x1 - 0.6 || z < M.z0 + 0.6 || z > M.z1 - 0.6) continue;
        if (blocked(x, z)) continue;
        let y = 0; for (const s of M.solids) { if (s.x1 <= x - 0.42 || s.x0 >= x + 0.42 || s.z1 <= z - 0.42 || s.z0 >= z + 0.42) continue;
          if (s.y1 <= b.y0 + 0.9 && s.y1 > y) y = s.y1; }
        pts.push({ x, z, y, bx: (b.x0 + b.x1) / 2, bz: (b.z0 + b.z1) / 2, hard: hgt > 1.8 });
      }
    }
    if (pts.length > 260) { const keep = []; const step = pts.length / 260; for (let i = 0; i < 260; i++) keep.push(pts[Math.floor(i * step)]); M.cover = keep; }
    else M.cover = pts;
    return M;
  }

  // ── weapons ─────────────────────────────────────────────────────────────────────────────────
  const WEAPONS = [
    { name: 'RIP-9 PISTOL', key: 'pistol', dmg: 22, spread: 0.010, rate: 250, mag: 12, reload: 1050, auto: false, pellets: 1, zoom: 1, sfx: 'pistol', range: 60, kick: 0.9 },
    { name: 'AK RIPMASTER', key: 'smg', dmg: 17, spread: 0.045, rate: 105, mag: 30, reload: 1500, auto: true, pellets: 1, zoom: 1, sfx: 'smg', range: 56, kick: 0.7 },
    { name: 'STREET SWEEPER', key: 'shotgun', dmg: 9, spread: 0.10, rate: 780, mag: 6, reload: 1900, auto: false, pellets: 8, zoom: 1, sfx: 'shotgun', range: 26, kick: 1.6 },
    { name: 'LONG RIFLE', key: 'sniper', dmg: 88, spread: 0.002, rate: 1150, mag: 5, reload: 1700, auto: false, pellets: 1, zoom: 2.7, sfx: 'sniper', range: 80, kick: 2.2 },
  ];
  const CTINTS = [[80, 120, 220], [220, 90, 90], [210, 200, 80], [190, 110, 220], [90, 200, 140], [230, 150, 70], [120, 210, 220], [200, 120, 170]];
  const POWS = [{ t: 'med', ch: '✚', col: [70, 230, 110] }, { t: 'armor', ch: '▣', col: [90, 180, 255] }, { t: 'ammo', ch: '▪', col: [230, 200, 90] }];
  const AMPPOW = { t: 'amp', ch: '★', col: [255, 214, 90] };
  const BARKS = {
    contact: ['contact front', 'tango spotted', 'eyes on', 'got one'],
    reload: ['reloading!', 'swapping mag', 'cover me, dry'],
    cover: ['taking fire!', 'pinned, moving', 'falling back'],
    flank: ['going around', 'flanking left', 'wide right'],
    suppress: ['suppressing', 'keep his head down', 'laying it on'],
    push: ['pushing up', 'on the move', 'last known, moving'],
  };
  const HANDLES = ['Raoul Duke', 'Chuck Meltdown', 'Baron Von Blazed', 'Denim Reaper', 'Cogito Ribbit', 'Slim Bridger',
    'Duck Loathing', 'Reservoir Frog', 'Deltoid Zeus', 'Bail Denied', 'Technicolor Yawn', 'Kitchen Bandido',
    'Rug-Pull Rick', 'Too Weird To Live', 'Public Domain', 'The Consigliere'];

  // ────────────────────────────────────────────────────────────────────────────────────────────
  function create(env) {
    env = env || {};
    const SFX = env.sfx || {};
    const sfx = (n, a) => { try { const f = SFX[n]; if (f) f(a); } catch (e) {} };
    const powMsg = env.powMsg || function () {};
    const STEP = 0.62, GRAV = 20, JUMP = 7.4;

    const MAPS = buildMaps().map(fixSpawns);
    const BUILTIN = MAPS.length;
    let MAP = MAPS[0];

    const cam = { x: 0, y: 1.5, z: 0, yaw: 0, pitch: 0 };
    const G = {
      mode: 'lobby', t: 0, dur: 150, timeLeft: 150, ents: [], me: null, real: false, over: false,
      tracers: [], sparks: [], chunks: [], flashes: [], kills: [], comms: [], myStake: [], oppStakes: [],
      hitmark: 0, dmgFlash: 0, mapIdx: 0, pows: [], powT: 6, loadout: null, myCards: [], decals: [],
      shake: 0, fireFlash: 0, fireHeavy: false, fireCol: [255, 224, 150], nearMiss: 0, scopeZoom: 1,
    };
    // the wager the host lobby owns; the core only reads it
    const wager = env.wager || { ante: 50, cards: 2, players: 4, picked: [], loadout: 1 };
    const keys = {};
    const mouse = { left: false, right: false };
    const touch = { move: { active: false, x: 0, y: 0 }, fire: false, jump: false, sprint: false, scope: false, crouch: false };

    const mktAmp = () => { try { return (window.RipPowers ? RipPowers.getMarket().amp : 1) || 1; } catch (e) { return 1; } };

    // ── collision + queries (over MAP.solids, identical to the shipping game) ──────────────────
    function blocksE(e, b) { return b.y1 > e.y + STEP && b.y0 < e.y + e.h - 0.02; }
    function moveEnt(e, dx, dz) {
      e.x += dx;
      for (const b of MAP.solids) { if (!blocksE(e, b)) continue;
        if (e.x + e.r > b.x0 && e.x - e.r < b.x1 && e.z + e.r > b.z0 && e.z - e.r < b.z1) {
          if (dx > 0) e.x = b.x0 - e.r; else if (dx < 0) e.x = b.x1 + e.r; } }
      e.z += dz;
      for (const b of MAP.solids) { if (!blocksE(e, b)) continue;
        if (e.x + e.r > b.x0 && e.x - e.r < b.x1 && e.z + e.r > b.z0 && e.z - e.r < b.z1) {
          if (dz > 0) e.z = b.z0 - e.r; else if (dz < 0) e.z = b.z1 + e.r; } }
      e.x = clamp(e.x, MAP.x0 + e.r, MAP.x1 - e.r); e.z = clamp(e.z, MAP.z0 + e.r, MAP.z1 - e.r);
    }
    function supportY(e) { let s = 0; const fx0 = e.x - e.r, fx1 = e.x + e.r, fz0 = e.z - e.r, fz1 = e.z + e.r;
      for (const b of MAP.solids) { if (b.x1 <= fx0 || b.x0 >= fx1 || b.z1 <= fz0 || b.z0 >= fz1) continue;
        if (b.y1 <= e.y + STEP + 0.01 && b.y1 > s) s = b.y1; }
      return s; }
    function gravity(e, dt) { const sup = supportY(e); const wasAir = !e.onGround; e.vy -= GRAV * dt; e.y += e.vy * dt;
      if (e.y <= sup + 0.001) { const vimp = e.vy; e.y = sup; e.vy = 0;
        if (wasAir && vimp < -3) { if (e.isMe || Math.hypot(e.x - cam.x, e.z - cam.z) < 18) sfx('land');
          if (e.isMe) G.shake = Math.max(G.shake, Math.min(4, -vimp * 0.4)); }
        e.onGround = true; } else e.onGround = false;
      if (e.y < -8) { e.y = sup; e.vy = 0; e.onGround = true; } }

    function rayAABB(ox, oy, oz, dx, dy, dz, b, maxT) {
      let tmin = 0, tmax = maxT;
      const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1], o = [ox, oy, oz], d = [dx, dy, dz];
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-8) { if (o[i] < lo[i] || o[i] > hi[i]) return -1; continue; }
        const inv = 1 / d[i]; let t1 = (lo[i] - o[i]) * inv, t2 = (hi[i] - o[i]) * inv;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
      return tmin;
    }
    function raycast(ox, oy, oz, dx, dy, dz, maxT, ignore) {
      let bestT = maxT, ent = null, wall = false, wallBox = null;
      for (const b of MAP.solids) { const t = rayAABB(ox, oy, oz, dx, dy, dz, b, bestT);
        if (t >= 0 && t < bestT) { bestT = t; wall = true; wallBox = b; ent = null; } }
      for (const e of G.ents) { if (e === ignore || !e.alive || e.spawnT > 0) continue;
        const bb = { x0: e.x - e.r, x1: e.x + e.r, y0: e.y, y1: e.y + e.h, z0: e.z - e.r, z1: e.z + e.r };
        const t = rayAABB(ox, oy, oz, dx, dy, dz, bb, bestT); if (t >= 0 && t < bestT) { bestT = t; ent = e; wall = false; wallBox = null; } }
      return { t: bestT, x: ox + dx * bestT, y: oy + dy * bestT, z: oz + dz * bestT, ent, wall, wallBox };
    }
    function hitNormal(res) { const b = res.wallBox; if (!b) return [0, 1, 0];
      const px = res.x, py = res.y, pz = res.z;
      const d = [[px - b.x0, -1, 0, 0], [b.x1 - px, 1, 0, 0], [py - b.y0, 0, -1, 0], [b.y1 - py, 0, 1, 0], [pz - b.z0, 0, 0, -1], [b.z1 - pz, 0, 0, 1]];
      let best = d[0]; for (const q of d) if (q[0] < best[0]) best = q; return [best[1], best[2], best[3]]; }
    function losClear(ox, oy, oz, tx, ty, tz) { const dx = tx - ox, dy = ty - oy, dz = tz - oz; const d = Math.hypot(dx, dy, dz); if (d < 0.001) return true;
      const idx = dx / d, idy = dy / d, idz = dz / d;
      for (const b of MAP.solids) { const t = rayAABB(ox, oy, oz, idx, idy, idz, b, d - 0.02); if (t >= 0 && t < d - 0.02) return false; }
      return true; }
    const lookDir = (yaw, pitch) => { const cp = Math.cos(pitch); return { x: cp * Math.sin(yaw), y: Math.sin(pitch), z: cp * Math.cos(yaw) }; };
    const eyePos = e => ({ x: e.x, y: e.y + e.eye, z: e.z });

    // ── entities ────────────────────────────────────────────────────────────────────────────
    function makeEnt(opt) {
      return { name: opt.name, x: 0, y: 0, z: 0, vy: 0, r: 0.42, h: 1.72, eye: 1.52,
        yaw: 0, pitch: 0, crouch: 0, hp: 150, maxHp: 150, armor: opt.me ? 60 : 55, maxArmor: 80, alive: true, isMe: !!opt.me, bot: !opt.me,
        regenT: 0, tint: opt.tint || [120, 200, 220], team: opt.team, verified: !!opt.verified, kills: 0, deaths: 0,
        weapon: opt.weapon || 0, mag: 0, fireT: 0, reloadT: 0, reloading: false, triggerConsumed: false, spawnT: 0, iframe: 0, respawnT: 0,
        onGround: true, boost: 1, state: 'patrol', aiT: 0, tgt: null, wp: null, strafe: 1, strafeT: 0, reactT: 0, seenT: 0, wantFire: false, bob: 0, moving: false,
        recoil: 0, muzzle: 0, scoped: false, ads: false, killStreak: 0,
        cardDmg: 1, cardRate: 1, cardSpeed: 1, cardArmor: 0, cardAmp: 1, surgeT: 0, overdrive: false, sigGun: '', gait: 0 };
    }
    function applyLoadout(e, L) { if (!e || !L) return;
      e.cardDmg = L.dmg || 1; e.cardRate = L.rate || 1; e.cardSpeed = Math.min(1.35, L.speed || 1); e.cardAmp = L.amp || 1;
      e.sigGun = (L.guns && L.guns.length) ? L.guns[L.guns.length - 1] : '';
      if (L.shield > 0) { const bonus = Math.round(L.shield * 6); e.maxArmor += bonus; e.armor = Math.min(e.maxArmor, e.armor + bonus); }
      if (L.powerups && L.powerups.includes('overdrive')) e.overdrive = true; }

    function spawnPow() {
      const a = mktAmp();
      const pool = [[POWS[0], 3], [POWS[1], 2], [POWS[2], 3]]; const ampW = Math.max(0, (a - 0.95)) * 6; if (ampW > 0.15) pool.push([AMPPOW, ampW]);
      let tot = 0; for (const q of pool) tot += q[1]; let r = Math.random() * tot, pick = pool[0][0];
      for (const [p, wt] of pool) { if ((r -= wt) <= 0) { pick = p; break; } }
      const s = MAP.spawns[rint(MAP.spawns.length)];
      G.pows.push({ x: s[0] + rnd(2, -2), z: s[1] + rnd(2, -2), y: (s[2] || 0) + 0.5, type: pick.t, ch: pick.ch, col: pick.col, t: 0 });
    }
    function applyPow(e, t) { const a = e.cardAmp || 1;
      if (t === 'med') e.hp = Math.min(e.maxHp, e.hp + Math.round(34 * a));
      else if (t === 'armor') e.armor = Math.min(e.maxArmor, e.armor + Math.round(30 * a));
      else if (t === 'ammo') { e.mag = WEAPONS[e.weapon].mag; e.reloading = false; e.reloadT = 0; }
      else if (t === 'amp') { e.surgeT = Math.max(e.surgeT || 0, 5.5 + 2.5 * a); e.hp = Math.min(e.maxHp, e.hp + Math.round(8 * a)); }
      if (e.isMe) { sfx('pickup');
        powMsg(t === 'med' ? '✚ MEDKIT' : t === 'armor' ? '▣ ARMOR' : t === 'ammo' ? '▪ AMMO' : '★ OVERCHARGE' + (e.sigGun ? ' · ' + e.sigGun.toUpperCase() : ''),
          t === 'amp' ? '#ffd23b' : '#59e0ff'); } }

    function farSpawn(avoidList, minD) { let best = null, bestScore = -1;
      for (let i = 0; i < MAP.spawns.length; i++) { const s = MAP.spawns[(i + rint(MAP.spawns.length)) % MAP.spawns.length];
        let d = 1e9; for (const e of avoidList) { if (e && e.alive) { const dd = Math.hypot(e.x - s[0], e.z - s[1]); if (dd < d) d = dd; } }
        if (d > bestScore) { bestScore = d; best = s; if (d > minD) break; } }
      return best || MAP.spawns[0]; }
    /* Seed y from the spawn point BEFORE asking supportY — supportY only counts a surface you
     * could step onto from where you already are, so from y=0 it cannot see a deck at 11.79. */
    function dropAt(e, s) { e.x = s[0]; e.z = s[1]; e.y = (s[2] || 0); e.y = supportY(e); }
    function spawnEnt(e, firstWeapon) {
      const others = G.ents.filter(o => o !== e);
      const s = farSpawn(others, 12); dropAt(e, s); e.vy = 0; e.alive = true;
      e.hp = e.maxHp; e.armor = e.isMe ? 60 : 55; e.regenT = 0;
      if (e.isMe && env.sfxOn && env.sfxOn() && window.RipSfx) RipSfx.play('gearup', 0.5);   // 23 shuffled takes: kit being handled
      // ⚑ restored — section9.html loses this whole line into the comment above it
      e.spawnT = 0; e.iframe = 1.4; e.respawnT = 0; e.reloading = false; e.reloadT = 0; e.fireT = 0;
      e.weapon = firstWeapon != null ? firstWeapon : e.weapon; e.mag = WEAPONS[e.weapon].mag;
      e.state = 'patrol'; e.tgt = null; e.wp = null; e.boost = 1; e.cover = null; e.inCover = false;
      e.crouch = 0; e.eye = 1.52;
      e.yaw = spawnYaw(MAP, e.x, e.z, e.y); e.pitch = 0;
    }

    function addKill(killer, victim, head) {
      G.kills.unshift({ k: killer ? killer.name : '', v: victim.name, me: (killer && killer.isMe) || victim.isMe, kMe: killer && killer.isMe, head: !!head, t: 2.6 });
      if (G.kills.length > 5) G.kills.pop();
    }
    function bark(e, kind) {
      if ((e.barkT || 0) > G.t) return;
      e.barkT = G.t + rnd(7, 3.5);
      const L = BARKS[kind]; if (!L) return;
      G.comms.unshift({ n: shortName(e.name), s: L[rint(L.length)], t: 3.4, tint: e.tint });
      if (G.comms.length > 4) G.comms.pop();
    }

    // ── firing (hitscan; tracers are presentation only) ──────────────────────────────────────
    function muzzleOrigin(e) { const d = lookDir(e.yaw, e.pitch); const rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);
      return { x: e.x + d.x * 0.4 + rx * 0.16, y: e.y + e.eye - 0.08 + d.y * 0.4, z: e.z + d.z * 0.4 + rz * 0.16, d }; }
    function spark(x, y, z, col, n) { for (let i = 0; i < n; i++) G.sparks.push({ x, y, z, vx: rnd(3, -3), vy: rnd(4, -1), vz: rnd(3, -3), t: rnd(0.4, 0.2), col }); }
    function chunkBurst(x, y, z, col, n) { for (let i = 0; i < n; i++) G.chunks.push({ x, y, z, vx: rnd(4, -4), vy: rnd(6, 1), vz: rnd(4, -4), t: rnd(0.9, 0.5), s: rnd(0.22, 0.08), col }); }
    function addDecal(x, y, z, n, type) {
      G.decals.push({ x: x + n[0] * 0.02, y: y + n[1] * 0.02, z: z + n[2] * 0.02, n, type,
        r: type === 'laser' ? 0.17 : 0.1, life: type === 'laser' ? 4 : 10, max: type === 'laser' ? 4 : 10, id: ++decalId });
      if (G.decals.length > 60) G.decals.shift();
    }
    let decalId = 0;

    function fireWeapon(e) {
      const w = WEAPONS[e.weapon]; if (e.reloading || e.fireT > 0) return;
      if (e.mag <= 0) { if (e.isMe) sfx('empty'); startReload(e); return; }
      e.mag--; e.fireT = w.rate / ((e.cardRate || 1) * ((e.surgeT > 0 || e.overdrive) ? 1.35 : 1));
      e.recoil = Math.min(1.4, e.recoil + w.kick * 0.5); e.muzzle = 0.05;
      const mo = muzzleOrigin(e);
      G.flashes.push({ x: mo.x, y: mo.y, z: mo.z, t: 0.06, max: 0.06, big: w.key === 'shotgun' || w.key === 'sniper' });
      if (e.isMe) { sfx(w.sfx);
        const heavy = (w.key === 'shotgun' || w.key === 'sniper');
        G.shake = Math.max(G.shake, w.kick * 1.3);
        G.fireFlash = 1; G.fireHeavy = heavy; G.fireCol = w.key === 'sniper' ? [210, 235, 255] : [255, 224, 150]; }
      else if (Math.hypot(e.x - cam.x, e.z - cam.z) < 26) sfx(w.sfx);
      const scopeAcc = ((e.isMe && e.scoped) ? 0.35 : ((e.isMe && e.ads) ? 0.55 : 1)) * (1 - 0.35 * (e.crouch || 0));   // braced stance is steadier
      for (let p = 0; p < w.pellets; p++) {
        const sp = w.spread * scopeAcc;
        const ay = e.yaw + rnd(sp, -sp) + (e.isMe ? 0 : rnd(0.03, -0.03));
        const ap = e.pitch + rnd(sp, -sp) + (e.isMe ? 0 : rnd(0.022, -0.022));
        const d = lookDir(ay, ap); const hit = raycast(mo.x, mo.y, mo.z, d.x, d.y, d.z, w.range, e);
        /* A belt is not all tracer, and a round you can see every time stops meaning anything.
         * Yours read more often than theirs — incoming being sparser is what makes a visible
         * round feel like it was aimed at you. */
        const trace = e.isMe ? (p === 0 || Math.random() < 0.55) : Math.random() < 0.42;
        if (trace) {
          const len = Math.hypot(hit.x - mo.x, hit.y - mo.y, hit.z - mo.z) || 0.001;
          G.tracers.push({ x0: mo.x, y0: mo.y, z0: mo.z, dx: (hit.x - mo.x) / len, dy: (hit.y - mo.y) / len, dz: (hit.z - mo.z) / len,
            len, p: 0, sp: 340, tail: w.key === 'shotgun' ? 1.6 : 3.4, me: e.isMe, t: 0.10 });
        }
        // near miss — distance from the camera to the ray, CLAMPED to the segment, so a round
        // that stops in a wall behind you cannot crack after it has already landed
        if (!e.isMe && G.me && G.me.alive) {
          const rx = cam.x - mo.x, ry = cam.y - mo.y, rz = cam.z - mo.z;
          const along = clamp(rx * d.x + ry * d.y + rz * d.z, 0, Math.hypot(hit.x - mo.x, hit.y - mo.y, hit.z - mo.z));
          const px = mo.x + d.x * along - cam.x, py = mo.y + d.y * along - cam.y, pz = mo.z + d.z * along - cam.z;
          const miss = Math.hypot(px, py, pz);
          if (miss < 2.2 && along > 1.5) { const n = 1 - miss / 2.2; G.nearMiss = Math.max(G.nearMiss || 0, n);
            G.shake = Math.max(G.shake, n * 1.6);
            if (Math.random() < 0.7) sfx('crack', miss); }
        }
        if (hit.ent) { const head = hit.y > hit.ent.y + hit.ent.h * 0.78;
          const dmg = w.dmg * (head ? 2.1 : 1) * (e.cardDmg || 1) * (e.surgeT > 0 ? 1.6 : 1);
          applyDamage(hit.ent, dmg, e, head, hit.x, hit.y, hit.z);
          if (e.isMe) { G.hitmark = 0.14; sfx(head ? 'headshot' : 'hit'); }
        } else if (hit.wall) { const nrm = hitNormal(hit); spark(hit.x, hit.y, hit.z, [210, 205, 180], 8);
          G.flashes.push({ x: hit.x, y: hit.y, z: hit.z, t: 0.05, max: 0.05, big: false, col: [255, 220, 150] });
          addDecal(hit.x, hit.y, hit.z, nrm, e.surgeT > 0 ? 'laser' : 'bullet');
          const dcam = Math.hypot(hit.x - cam.x, hit.z - cam.z); if (dcam < 24) { sfx('impact'); if (Math.random() < 0.22) sfx('ricochet'); } }
      }
    }
    /* Reload / swap use the artist's recorded racking takes (RipSfx), not the oscillator kit — a
     * magazine going in is a mechanical event with a dozen little noises in it. Bots within
     * earshot get it too, because hearing someone else reload is tactical information. */
    function startReload(e) { if (!e || e.reloading) return; const w = WEAPONS[e.weapon]; if (e.mag >= w.mag) return;
      e.reloading = true; e.reloadT = w.reload;
      if (!(env.sfxOn && env.sfxOn())) return;
      const d = e.isMe ? 0 : Math.hypot(e.x - cam.x, e.z - cam.z);
      if (e.isMe) { if (window.RipSfx) RipSfx.play(w.key === 'shotgun' ? 'attachMachine' : 'attach', 0.5); else sfx('reload'); }
      else if (d < 20 && window.RipSfx) RipSfx.play('attachSmall', 0.34 * (1 - d / 20)); }
    function finishReload(e) { e.reloading = false; e.mag = WEAPONS[e.weapon].mag; }
    function switchWeapon(i) { const e = G.me; if (!e || !e.alive) return; i = clamp(i, 0, WEAPONS.length - 1); if (i === e.weapon) return;
      e.weapon = i; e.reloading = false; e.reloadT = 0; e.fireT = Math.max(e.fireT, 180); e.mag = Math.min(e.mag, WEAPONS[i].mag);
      if (e.mag <= 0) e.mag = WEAPONS[i].mag; e.scoped = false;
      if ((env.sfxOn && env.sfxOn()) && window.RipSfx) RipSfx.play('attachSmall', 0.45); }

    function applyDamage(e, dmg, src, head, hx, hy, hz) {
      if (!e.alive || e.iframe > 0 || e.spawnT > 0) return;
      if (src && src.bot && e.isMe) dmg *= 0.62;                       // arcade fairness
      /* Armour soaks 45% of a body hit but only 15% of a headshot. Plates do not cover a skull,
       * and without that carve-out a longer TTK quietly kills the sniper — a full-power head hit
       * would be soaked into a survivable body shot and precision would stop being worth it. */
      if (e.armor > 0) { const soak = Math.min(e.armor, dmg * (head ? 0.15 : 0.45)); e.armor -= soak; dmg -= soak; }
      e.hp -= dmg; e.regenT = 0;
      /* Being shot is information: it is the single behaviour that makes the longer TTK read as
       * a firefight rather than a longer damage race. */
      if (e.bot) { e.supT = Math.max(e.supT || 0, 2.6); if (src && !e.tgt) e.tgt = src;
        if (src) { e.lastSeen = { x: src.x, z: src.z }; e.seenT = Math.max(e.seenT || 0, 1.8); } }
      spark(hx, hy, hz, head ? [255, 220, 80] : e.tint, head ? 11 : 7);
      if (e.isMe) { G.dmgFlash = Math.min(1, G.dmgFlash + clamp(dmg * 0.02, 0.3, 0.7)); G.shake = Math.max(G.shake, 3 + Math.min(dmg, 40) * 0.12); sfx('hurt'); }
      if (e.hp <= 0) downEnt(e, src, head);
    }
    function downEnt(e, src, head) {
      e.alive = false; e.respawnT = e.isMe ? 2.4 : rnd(2.6, 1.8); e.deaths++;
      chunkBurst(e.x, e.y + e.h * 0.5, e.z, e.tint, 16); chunkBurst(e.x, e.y + e.h * 0.85, e.z, [150, 140, 120], 6);
      G.flashes.push({ x: e.x, y: e.y + e.h * 0.55, z: e.z, t: 0.13, max: 0.13, big: true, col: e.tint });
      const dcam = Math.hypot(e.x - cam.x, e.z - cam.z);
      if (dcam < 30) sfx('down');
      if (dcam < 26) G.shake = Math.max(G.shake, (1 - dcam / 26) * 6.5);
      if (src && src !== e) { src.kills++; src.killStreak = (src.killStreak || 0) + 1;
        if (src.isMe) { G.shake = Math.max(G.shake, 2.4); sfx('frag');
          powMsg((head ? '✖ HEADSHOT · ' : '✖ FRAG · ') + shortName(e.name), head ? '#ffd23b' : '#2bff80');
          if (src.killStreak >= 3 && src.killStreak % 2 === 1) powMsg('▲ ' + src.killStreak + ' FRAG STREAK', '#ff2ad9'); } }
      else if (e.isMe) powMsg('✖ YOU WERE DOWNED', '#ff6b57');
      if (e.isMe) e.killStreak = 0;
      addKill(src && src !== e ? src : null, e, head);
    }

    // ── AI ──────────────────────────────────────────────────────────────────────────────────
    function pickCover(e, tgt) {
      const C = MAP.cover; if (!C || !C.length || !tgt) return null;
      let best = null, bs = -1e9;
      const tx = tgt.x, tz = tgt.z, ty = tgt.y + tgt.eye;
      for (let i = 0; i < C.length; i++) {
        const c = C[i]; const d = Math.hypot(c.x - e.x, c.z - e.z);
        if (d > 26) continue;
        if (Math.hypot(c.x - tx, c.z - tz) < 3.5) continue;
        const safe = !losClear(c.x, c.y + e.eye, c.z, tx, ty, tz);
        const away = ((c.x - c.bx) * (c.x - tx) + (c.z - c.bz) * (c.z - tz)) > 0;
        const s = (safe ? 60 : 0) + (away ? 14 : 0) + (c.hard ? 8 : 0) - d * 1.7 + (e.cover && e.cover === c ? 9 : 0);
        if (s > bs) { bs = s; best = c; }
      }
      return bs > 18 ? best : null;
    }
    function nearestFoe(e) { let best = null, bd = 1e9; for (const o of G.ents) { if (o === e || !o.alive || o.spawnT > 0) continue; const d = Math.hypot(o.x - e.x, o.z - e.z); if (d < bd) { bd = d; best = o; } } return best; }
    /* Five behaviours in priority order: COVER · FLANK · SUPPRESS · PUSH · PATROL. The point is
     * not the count — it is that two of them make a bot deliberately NOT shoot at what it is
     * looking at. */
    function stepBot(e, dt) {
      e.aiT -= dt; e.strafeT -= dt; e.wantFire = false; const me = eyePos(e);
      if (e.supT > 0) e.supT -= dt; if (e.flankT > 0) e.flankT -= dt; if (e.holdT > 0) e.holdT -= dt;
      let tgt = e.tgt; if (!tgt || !tgt.alive || e.aiT <= 0) { tgt = nearestFoe(e); e.tgt = tgt; e.aiT = rnd(0.7, 0.3); }
      let mvx = 0, mvz = 0, sprint = false;
      if (tgt) { const teye = eyePos(tgt); const dx = tgt.x - e.x, dz = tgt.z - e.z; const dist = Math.hypot(dx, dz);
        const canSee = losClear(me.x, me.y, me.z, teye.x, teye.y, teye.z);
        const w = WEAPONS[e.weapon];
        const hurt = e.hp < e.maxHp * 0.42;
        const wantCover = (e.supT > 0 || hurt || e.reloading) && !e.inCover;
        if (canSee) { e.lastSeen = { x: tgt.x, z: tgt.z }; e.seenT = 2.2; if (e.reactT > 0) e.reactT -= dt; }
        else e.reactT = rnd(0.32, 0.12);

        if (wantCover) {
          e.state = 'cover'; bark(e, 'cover');
          if (!e.cover || e.coverT <= 0 || Math.random() < dt * 0.35) { e.cover = pickCover(e, tgt); e.coverT = rnd(6, 3); }
          e.coverT -= dt;
          if (e.cover) { const cx = e.cover.x - e.x, cz = e.cover.z - e.z, cd = Math.hypot(cx, cz) || 1;
            if (cd > 1.0) { mvx = cx / cd; mvz = cz / cd; sprint = true; e.inCover = false; }
            else { e.inCover = true; mvx = mvz = 0;
              if (e.holdT <= 0) { e.holdT = rnd(1.5, 0.7); e.peek = !e.peek; }
              if (e.peek && canSee) { const s = e.strafe || 1; mvx = -dz / (dist || 1) * s * 0.5; mvz = dx / (dist || 1) * s * 0.5; } } }
          else { mvx = -dx / (dist || 1); mvz = -dz / (dist || 1); sprint = true; }
          if (e.mag <= 0 || e.reloading) startReload(e);
          if (canSee) e.yaw += angDiff(Math.atan2(dx, dz) - e.yaw) * Math.min(1, dt * 6);
          if (canSee && e.peek && !e.reloading && e.reactT <= 0 && e.fireT <= 0 && dist < w.range * 0.85) e.wantFire = true;
        } else if (canSee) {
          e.state = 'fight'; e.inCover = false;
          if (e.mag <= 0) startReload(e);
          const wantYaw = Math.atan2(dx, dz); const wantPitch = Math.atan2((teye.y - me.y), dist);
          e.yaw += angDiff(wantYaw - e.yaw) * Math.min(1, dt * 7); e.pitch += (clamp(wantPitch, -0.7, 0.7) - e.pitch) * Math.min(1, dt * 6);
          const aimed = Math.abs(angDiff(wantYaw - e.yaw)) < 0.20;
          if (dist < w.range * 0.8 && aimed && e.reactT <= 0 && e.fireT <= 0 && !e.reloading) { e.wantFire = true; bark(e, 'contact'); }
          // a COMMITTED lateral bearing held for seconds is what reads as flanking; a coin flip
          // every ~1 s read as a bot vibrating on the spot
          if (e.flankT <= 0) { e.strafe = Math.random() < 0.5 ? 1 : -1; e.flankT = rnd(4.5, 2.2); if (Math.random() < 0.4) bark(e, 'flank'); }
          const pref = w.key === 'shotgun' ? 5 : w.key === 'sniper' ? 18 : 11;
          const nx = dx / (dist || 1), nz = dz / (dist || 1);
          const toward = (dist > pref + 2) ? 1 : (dist < pref - 2 ? -1 : 0);
          mvx = nx * toward * 0.75 + (-nz) * e.strafe; mvz = nz * toward * 0.75 + (nx) * e.strafe;
          sprint = dist > 16;
        } else if (e.seenT > 0) {
          e.seenT -= dt; e.inCover = false;
          const lx = (e.lastSeen && e.lastSeen.x) || 0, lz = (e.lastSeen && e.lastSeen.z) || 0;
          const dx2 = lx - e.x, dz2 = lz - e.z, dd = Math.hypot(dx2, dz2) || 1;
          e.yaw += angDiff(Math.atan2(dx2, dz2) - e.yaw) * Math.min(1, dt * 5);
          // SUPPRESS: deliberately wasteful rounds on the last known position. Never with the
          // sniper (five rounds), never below a third of the mag — a bot must not suppress itself dry.
          if (w.key !== 'sniper' && e.mag > WEAPONS[e.weapon].mag * 0.34 && dd < w.range * 0.8
              && e.seenT > 0.9 && !e.reloading && e.fireT <= 0 && Math.random() < dt * 3.2) {
            e.wantFire = true; e.pitch += (0.02 - e.pitch) * Math.min(1, dt * 4); bark(e, 'suppress');
          } else { mvx = dx2 / dd; mvz = dz2 / dd; sprint = true; bark(e, 'push'); }
          if (e.mag <= 0) startReload(e);
        } else e.state = 'patrol', e.inCover = false;
      }
      if (e.reloading && Math.random() < dt * 1.2) bark(e, 'reload');
      if (e.state === 'patrol' || !tgt) {
        if (!e.wp || Math.hypot(e.wp[0] - e.x, e.wp[1] - e.z) < 1.5 || Math.random() < dt * 0.2) { const s = MAP.spawns[rint(MAP.spawns.length)]; e.wp = [s[0] + rnd(3, -3), s[1] + rnd(3, -3)]; }
        const dx2 = e.wp[0] - e.x, dz2 = e.wp[1] - e.z, dd = Math.hypot(dx2, dz2) || 1; mvx = dx2 / dd; mvz = dz2 / dd;
        e.yaw += angDiff(Math.atan2(dx2, dz2) - e.yaw) * Math.min(1, dt * 4);
      }
      if (e.onGround && Math.random() < dt * 0.25) e.vy = JUMP * 0.7;
      const spd = (sprint ? 6.6 : 3.9) * (e.cardSpeed || 1); const ml = Math.hypot(mvx, mvz) || 1;
      moveEnt(e, (mvx / ml) * spd * dt, (mvz / ml) * spd * dt);
      e.moving = (Math.abs(mvx) + Math.abs(mvz)) > 0.05; e.sprinting = sprint && e.moving;
    }

    // ── player ──────────────────────────────────────────────────────────────────────────────
    function stepMe(e, dt) {
      let fwd = 0, strafe = 0;
      if (keys.w || keys.arrowup) fwd += 1; if (keys.s || keys.arrowdown) fwd -= 1;
      if (keys.a || keys.arrowleft) strafe -= 1; if (keys.d || keys.arrowright) strafe += 1;
      if (touch.move.active) { fwd += -touch.move.y; strafe += touch.move.x; }
      /* CROUCH — Ctrl or C, the standard binding. Ctrl used to FIRE, which is the one genuinely
       * confusing key in the old scheme: every FPS a player has touched puts crouch there, so the
       * reflex to duck behind a crate made you shoot it instead. Fire is LMB (and touch), which is
       * where it belongs.
       *
       * Crouching is a real TRADE, not a pose: the eye drops 0.52 so a chest-high crate actually
       * hides you, movement halves, and spread tightens 35% because a braced stance is steadier.
       * It matters in this game specifically — the bots take cover and peek, and without it the
       * player has no answer to that but strafing. Eased in and out rather than snapped, and
       * sprint is locked out while crouched.
       *
       * ⚑ This lives in the CORE, not in a front-end. `e.eye` is read by the camera, by
       *   `muzzleOrigin`, and by every bot's line-of-sight test through `eyePos` — so crouching
       *   changes what can see you, not just what you see, and there is exactly one place where
       *   that is true. */
      const wantCrouch = !!(keys.control || keys.c || touch.crouch);
      e.crouch = Math.max(0, Math.min(1, (e.crouch || 0) + (wantCrouch ? dt * 7 : -dt * 8)));
      e.eye = 1.52 - 0.52 * e.crouch;
      const wantSprint = (keys.shift || touch.sprint) && fwd > 0.1 && e.crouch < 0.5;
      if (wantSprint && e.boost > 0.02) { e.sprinting = true; e.boost = Math.max(0, e.boost - dt * 0.42); }
      else { e.sprinting = false; e.boost = Math.min(1, e.boost + dt * 0.3); }
      const spd = (e.sprinting ? 7.0 : 4.3) * (1 - 0.5 * e.crouch) * (e.scoped ? 0.5 : (e.ads ? 0.72 : 1)) * (e.cardSpeed || 1);
      const s = Math.sin(e.yaw), c = Math.cos(e.yaw);
      let mx = (s * fwd + c * strafe), mz = (c * fwd - s * strafe); const ml = Math.hypot(mx, mz);
      const mag = Math.min(1, ml);
      if (ml > 0.001) { mx /= ml; mz /= ml; moveEnt(e, mx * spd * mag * dt, mz * spd * mag * dt); e.moving = true; e.bob += dt * (e.sprinting ? 13 : 9);
        if (e.onGround) { e._stepT = (e._stepT || 0) - dt; if (e._stepT <= 0) { e._stepT = e.sprinting ? 0.28 : 0.4; sfx('step'); } } }
      else e.moving = false;
      if ((keys[' '] || keys.alt || touch.jump) && e.onGround) { e.vy = JUMP; e.onGround = false; touch.jump = false; sfx('jump'); }
      const w = WEAPONS[e.weapon];
      const wantFire = (mouse.left || touch.fire);       // Ctrl is crouch now, as every FPS expects
      if (wantFire) { if (w.auto) { if (e.fireT <= 0) fireWeapon(e); } else { if (!e.triggerConsumed) { fireWeapon(e); e.triggerConsumed = true; } } }
      else e.triggerConsumed = false;
      e.ads = (mouse.right || touch.scope) && e.alive; e.scoped = e.ads && w.zoom > 1;
    }

    // ── match ───────────────────────────────────────────────────────────────────────────────
    function pickMap(arenaPick) {
      let pick = (arenaPick >= 0 && MAPS[arenaPick]) ? arenaPick : null;
      /* ROTATE stays over the hand-built arenas: MAPS grows asynchronously as baked levels load,
       * so anything modulo MAPS.length would give a different answer depending on network timing.
       * A player with no stored position starts on the NEWEST map. */
      if (pick == null) { let last = BUILTIN - 2; try { const s = localStorage.getItem('s9_last'); if (s != null) last = +s; } catch (e) {}
        pick = (last + 1) % BUILTIN; try { localStorage.setItem('s9_last', pick); } catch (e) {} }
      return pick;
    }
    function startMatch(real, arenaPick, roster, deck) {
      G.mapIdx = pickMap(arenaPick == null ? -1 : arenaPick);
      MAP = MAPS[G.mapIdx]; if (!MAP.cover) bakeCover(MAP);
      const bySlug = (deck && deck.bySlug) || new Map();
      const DECK = (deck && deck.list) || [];
      const others = []; const seen = new Set([env.myHandle ? env.myHandle() : 'you']);
      (roster || []).forEach(p => { if (others.length < wager.players - 1 && !seen.has(p.handle)) { seen.add(p.handle); others.push({ h: p.handle, v: !!p.verified }); } });
      let hi = 0; while (others.length < wager.players - 1) { let h; do { h = HANDLES[(hi++) % HANDLES.length]; } while (seen.has(h) && seen.size < HANDLES.length); seen.add(h); others.push({ h, v: false }); }
      G.ents = []; G.tracers = []; G.sparks = []; G.chunks = []; G.flashes = []; G.kills = []; G.comms = [];
      G.nearMiss = 0; G.hitmark = 0; G.dmgFlash = 0; G.shake = 0; G.fireFlash = 0; G.pows = []; G.powT = 6; G.decals = [];
      G.t = 0; G.timeLeft = G.dur; G.real = !!real; G.over = false;
      G.me = makeEnt({ name: env.myHandle ? env.myHandle() : 'you', me: true, tint: [64, 220, 200],
        verified: !!(window.RipWallet && RipWallet.isConnected && RipWallet.isConnected()) });
      G.me.weapon = wager.loadout | 0; G.ents.push(G.me);
      others.forEach((o, i) => { const e = makeEnt({ name: o.h, tint: CTINTS[i % CTINTS.length], verified: o.v, weapon: rint(WEAPONS.length) });
        if (window.S9Skin) e.skin = S9Skin.archFor(i);
        G.ents.push(e); });
      G.ents.forEach((e, i) => { const s = MAP.spawns[i % MAP.spawns.length]; dropAt(e, s); e.mag = WEAPONS[e.weapon].mag; e.iframe = 1.4; e.yaw = spawnYaw(MAP, e.x, e.z, e.y); });
      // stakes
      G.myStake = []; G.oppStakes = [];
      if (real && env.vault) { const v = env.vault(); G.myStake = wager.picked.slice();
        G.myStake.forEach(sl => { const i = v.findIndex(x => x && x.slug === sl); if (i >= 0) v.splice(i, 1); }); env.saveVault && env.saveVault(v); }
      for (let s = 1; s < G.ents.length; s++) { const arr = []; for (let k = 0; k < wager.cards; k++) { if (DECK.length) arr.push(DECK[rint(DECK.length)].slug); } G.oppStakes.push(arr); }
      // arm operatives from their staked cards, scaled by the live $UR3030 market
      G.loadout = null; G.myCards = [];
      try { if (window.RipPowers) { const src = wager.picked.length ? wager.picked : (env.ownedSlugs ? env.ownedSlugs().slice(0, wager.cards) : []);
        const picks = src.map(sl => bySlug.get(sl)).filter(Boolean);
        /* ⚑ Keep the card OBJECTS, not just the slugs. The HUD pins the card you brought into the
         * match (see S9PCUI.paintHudCard) and needs its art, title and rarity — and the whole
         * point of this studio is that the card is not a lobby menu item you leave behind at the
         * door. Slugs alone would send the HUD back to bySlug, which is the lobby's map. */
        G.myCards = picks.slice();
        if (picks.length) { G.loadout = RipPowers.loadout(picks, RipPowers.getMarket()); applyLoadout(G.me, G.loadout); }
        for (let s = 1; s < G.ents.length; s++) { if (G.oppStakes[s - 1]) {
          const bl = RipPowers.loadout(G.oppStakes[s - 1].map(sl => bySlug.get(sl)).filter(Boolean), RipPowers.getMarket());
          applyLoadout(G.ents[s], bl); } } } } catch (e) {}
      G.mode = 'play';
      return MAP;
    }

    function step(dt) {
      G.t += dt;
      // decay FIRST so a kick set later this same step still renders for at least one frame
      if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 40);
      if (G.fireFlash > 0) G.fireFlash = Math.max(0, G.fireFlash - dt * 8);
      for (const e of G.ents) {
        if (e.reloadT > 0) { e.reloadT -= dt * 1000; if (e.reloadT <= 0) finishReload(e); }
        if (e.fireT > 0) e.fireT -= dt * 1000; if (e.iframe > 0) e.iframe -= dt;
        if (e.recoil > 0) e.recoil = Math.max(0, e.recoil - dt * 4.5); if (e.muzzle > 0) e.muzzle -= dt;
        if (e.surgeT > 0) { e.surgeT -= dt; if (e.alive) e.hp = Math.min(e.maxHp, e.hp + dt * 6 * (e.cardAmp || 1)); }
        /* Out-of-combat regen to 62% of max. The other half of the longer TTK: a survivable fight
         * is only interesting if disengaging is a real option, and it only becomes one if breaking
         * contact buys something back. Stops well short of full — running away is a reset, not a heal. */
        if (e.alive && e.hp > 0) { e.regenT = (e.regenT || 0) + dt;
          if (e.regenT > 4.5 && e.hp < e.maxHp * 0.62) e.hp = Math.min(e.maxHp * 0.62, e.hp + dt * 7); }
        if (!e.alive) { e.respawnT -= dt; if (e.respawnT <= 0) { spawnEnt(e, e.isMe ? (wager.loadout | 0) : e.weapon); if (e.isMe) { powMsg('◈ RESPAWN', '#59e0ff'); sfx('spawn'); } } continue; }
        if (e.isMe) stepMe(e, dt); else if (!G.__hold) stepBot(e, dt);
        if (e.bot && e.wantFire && e.fireT <= 0 && !e.reloading) fireWeapon(e);
        gravity(e, dt);
        if (!(G.__hold && !e.isMe)) e.gait = (e.gait || 0) + (e.moving ? (e.sprinting ? 11 : 7) : 0) * dt;
      }
      // supply drops
      G.powT -= dt; if (G.powT <= 0 && G.pows.length < 4) { G.powT = rnd(11, 7) / (0.85 + (mktAmp() - 0.75) * 0.5); spawnPow(); }
      for (const pw of G.pows) pw.t += dt;
      for (const e of G.ents) { if (!e.alive || e.spawnT > 0) continue; for (const pw of G.pows) { if (pw.got) continue;
        if (Math.hypot(e.x - pw.x, e.z - pw.z) < 0.95 && Math.abs((e.y + 0.6) - pw.y) < 1.3) { pw.got = 1; applyPow(e, pw.type); } } }
      G.pows = G.pows.filter(pw => !pw.got && pw.t < 26);
      if (G.me) { cam.x = G.me.x; cam.z = G.me.z; cam.y = G.me.y + G.me.eye + (G.me.moving && G.me.onGround ? Math.sin(G.me.bob) * 0.045 : 0);
        cam.yaw = G.me.yaw; cam.pitch = clamp(G.me.pitch - G.me.recoil * 0.05, -1.45, 1.45); }
      // rounds fly, then their streak fades where they landed
      for (const t of G.tracers) { if (t.p < t.len) t.p += t.sp * dt; else t.t -= dt; }
      G.tracers = G.tracers.filter(t => t.t > 0);
      if (G.nearMiss > 0) G.nearMiss = Math.max(0, G.nearMiss - dt * 5);
      for (const f of G.flashes) f.t -= dt; G.flashes = G.flashes.filter(f => f.t > 0);
      for (const s of G.sparks) { s.t -= dt; s.vy -= GRAV * 0.5 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; } G.sparks = G.sparks.filter(s => s.t > 0);
      for (const c of G.chunks) { c.t -= dt; c.vy -= GRAV * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; if (c.y < 0) { c.y = 0; c.vy *= -0.35; c.vx *= 0.6; c.vz *= 0.6; } } G.chunks = G.chunks.filter(c => c.t > 0);
      for (const k of G.kills) k.t -= dt; G.kills = G.kills.filter(k => k.t > 0);
      for (const c of G.comms) c.t -= dt; G.comms = G.comms.filter(c => c.t > 0);
      for (const dc of G.decals) dc.life -= dt; G.decals = G.decals.filter(dc => dc.life > 0);
      if (G.hitmark > 0) G.hitmark -= dt; if (G.dmgFlash > 0) G.dmgFlash = Math.max(0, G.dmgFlash - dt * 1.6);
      G.scopeZoom = lerp(G.scopeZoom || 1, (G.me && G.me.ads) ? (WEAPONS[G.me.weapon].zoom > 1 ? WEAPONS[G.me.weapon].zoom : 1.3) : 1, Math.min(1, dt * 12));
      G.timeLeft -= dt;
      if (!G.over && G.timeLeft <= 0) { G.over = true; G.mode = 'result'; if (env.onEnd) env.onEnd(); }
    }

    return {
      G, cam, keys, mouse, touch, WEAPONS, MAPS, PAL, BUILTIN, HANDLES,
      get MAP() { return MAP; },
      set MAP(m) { MAP = m; },
      addMaps(list) { for (const m of list) MAPS.push(m); return MAPS; },
      startMatch, step, fireWeapon, startReload, switchWeapon, applyLoadout,
      supportY, moveEnt, losClear, raycast, spawnYaw, bakeCover, eyePos, lookDir, shortName, mktAmp,
    };
  }

  return { create, PAL, WEAPONS, buildMaps, fixSpawns, spawnYaw, bakeCover, HANDLES, shortName };
})();

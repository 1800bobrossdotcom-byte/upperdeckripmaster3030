/* ripmaster3030studios — Section 9 baked-level adapter (S9World).
 *
 * Section 9's arenas have always been hand-built in buildMaps(): a list of axis-aligned boxes
 * plus hand-written spawn points. `npm run level` bakes Blender-authored levels into exactly
 * two things — a binary .wld triangle soup (pos3+norm3) and a .cols.json AABB set with authored
 * spawns. That is the same shape from both ends, so this is an ADAPTER, not a renderer rewrite:
 *
 *     .cols.json boxes  →  MAP.solids     (collision, raycast, AI line-of-sight, 2D fallback)
 *     .cols.json spawns →  MAP.spawns     (now [x, z, y] — baked levels have floors above y=0)
 *     .wld triangles    →  MAP.mesh       (what the GL renderer actually draws)
 *
 * The box set is the collision truth in both engines, so physics is identical to a hand-built
 * map; only the pixels come from the mesh. Without WebGL the boxes are also what you SEE, which
 * is the level in blocked-out form — crude, but playable, and it is the fallback path.
 *
 *   S9World.load(PAL)  → Promise<map[]>   (never rejects: a missing/malformed level is dropped)
 *   S9World.LEVELS                        the catalogue
 *
 * ⚑ Fails open, everywhere. No RoninWorld, no fetch, no boxes, no spawns ⇒ that level simply
 *   does not appear in the arena picker and Section 9 ships its six built-ins exactly as before.
 * ⚑ The .wld parser is RoninWorld.load() — one format, one parser. Section 9 uses none of
 *   RoninWorld's movement model; it only borrows the loader, and copes with it being absent.
 */
window.S9World = (function () {
  // Only levels authored by scripts/blender/build-level.py are listed. models/world/street.wld is
  // an imported scene: it carries no spawns and its vertex buffer has NaNs, so it is not an arena.
  // `open` says the level is outdoors. It is the only art-direction fact the adapter carries,
  // and it earns its place: the renderer cools the key light, the fog and the sky for a baked
  // INTERIOR (a concrete pit lit by a warm dusk sun reads as a sandstone quarry), and a rooftop
  // at dusk must not get that treatment — it is standing in the sun.
  const LEVELS = [
    { file: 'arcade',  name: 'ARCADE PIT' },
    { file: 'vault',   name: 'THE VAULT' },
    { file: 'rooftop', name: 'ROOFTOP', open: true },
    /* Blender-authored, 1:1 metres — the box-built LIDO DECK rebuilt as real geometry: round
     * columns with bases and capitals, semicircular arches, individual balusters, nosed treads,
     * lathed parasols. `open` because it is a sunlit lido, not a room. */
    { file: 'lido',    name: 'LIDO DECK', open: true },
  ];
  const BASE = 'models/world/';

  /* Baked object names → Section 9 solid kinds. Kind drives the 2D fallback's colour and surface
   * grain only (the GL path draws the mesh), so "close enough" really is enough — but a stair
   * that reads as a wall looks wrong even blocked out, so the ordering below matters. */
  const KINDS = [
    /* ⚑ THE OUTDOOR PREFIXES GO FIRST, AND THE ORDER IS LOAD-BEARING. First match wins, and the
     * generic rows below are hungry — `/pil/` alone was routing LIDO's masonry pilasters to the
     * cool-steel `metal` class and putting five blue panels down its sunniest wall. Explicit
     * `water_ / plnt_ / awn_ / trm_` prefixes claim their surfaces before anything can guess.
     * Verified non-colliding: zero objects in arcade / vault / rooftop / street begin with any of
     * these, so the four existing levels classify exactly as before.
     * ⚠ An object NAME is a material assignment in this pipeline. That is easy to forget and it
     * fails silently — the level still loads, it just comes out the wrong colour. */
    [/^water_/i, 'water'],
    [/^plnt_/i,  'plant'],
    [/^awn_/i,   'awning'],
    [/^trm_/i,   'trim'],
    [/_step|stair/i, 'stair'],
    [/rail|para|sill|counter|shelf|rope|hood|cap\b/i, 'cover'],
    [/floor|roof|deck|mezz|bridge|catwalk|balc\d|dais|walk|inlay|annex$/i, 'plat'],
    [/pil|col\d|_col|post|leg|mast|rod/i, 'pillar'],
    [/crate|pallet|cab|prize|booth|skee|claw|ac\d|duct|vent|tank|rostrum|plinth|bin/i, 'crate'],
    [/wall|bulk|door|lintel|pilaster|cornice|sign|panel|truss|sky\d|dish|annex/i, 'wall'],
  ];
  function kindOf(name) {
    const n = String(name || '');
    for (const [re, k] of KINDS) if (re.test(n)) return k;
    return 'wall';
  }

  /* One baked level → one Section 9 MAP. Throws (and the level is dropped) if the payload is not
   * a playable arena: no collision means you fall through it, no spawns means there is nowhere to
   * drop in, and neither is worth shipping as a silently-broken chip in the lobby. */
  function adapt(def, w, PAL) {
    const boxes = (w && w.boxes) || [], spawns = (w && w.spawns) || [];
    if (!boxes.length) throw new Error('no collision boxes');
    if (!spawns.length) throw new Error('no authored spawns');
    if (!w.verts || !w.verts.length) throw new Error('no geometry');

    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, yTop = 0;
    const solids = [];
    for (const b of boxes) {
      const lo = b.lo, hi = b.hi;
      if (!lo || !hi) continue;
      const kind = kindOf(b.name);
      solids.push({ x0: lo[0], y0: lo[1], z0: lo[2], x1: hi[0], y1: hi[1], z1: hi[2],
        base: PAL[kind] || PAL.wall, kind });
      if (lo[0] < x0) x0 = lo[0]; if (hi[0] > x1) x1 = hi[0];
      if (lo[2] < z0) z0 = lo[2]; if (hi[2] > z1) z1 = hi[2];
      if (hi[1] > yTop) yTop = hi[1];
    }
    if (!solids.length || !isFinite(x0) || !isFinite(z0)) throw new Error('degenerate bounds');

    // Spawns carry their height. A hand-built arena's floor is the y=0 plane so [x,z] was enough;
    // a baked level's floor is a slab (the arcade pit floor tops out at 1.05, the rooftop deck at
    // 11.79), and dropping in at y=0 puts you underneath the level.
    const sp = spawns.filter(s => s && isFinite(s.x) && isFinite(s.z))
      .map(s => [+s.x, +s.z, +(s.y || 0)]);
    if (!sp.length) throw new Error('no usable spawns');

    return {
      name: def.name, x0, x1, z0, z1, ceilY: yTop,
      solids, spawns: sp, faces: null,
      wld: def.file,                       // marks a baked level: skip niches / posters / floor plane
      open: !!def.open,                    // outdoors → keep the dusk sun; indoors → cool it
      mesh: { verts: w.verts, scale: w.scale || 0 },
    };
  }

  /* Load every catalogued level. Resolves to whatever succeeded — including [] — and never
   * rejects: the arena picker is additive, so a level that will not load is one chip that never
   * appears, not a game that will not start. */
  function load(PAL) {
    if (!window.RoninWorld || typeof RoninWorld.load !== 'function') return Promise.resolve([]);
    return Promise.all(LEVELS.map(def =>
      RoninWorld.load(BASE + def.file + '.wld')
        .then(w => adapt(def, w, PAL))
        .catch(e => { console.warn('[section9] level "' + def.file + '" not loaded:', e && e.message || e); return null; })
    )).then(list => list.filter(Boolean));
  }

  return { load, LEVELS, kindOf };
})();

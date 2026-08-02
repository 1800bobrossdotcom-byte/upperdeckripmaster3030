/* ripmaster3030studios — NEON RONIN world (RoninWorld).
 *
 * Turns the duel arena into a city you move through. Loads a baked .wld (see
 * scripts/bake-world.mjs) plus its AABB collision set, and owns the free-roam movement model:
 *
 *   RUN      hold a direction — full 8-way ground movement on x/z
 *   SPRINT   hold Shift — a real speed tier, not a nudge
 *   LEAP     jump scales with your run speed, so a sprinting jump carries a LONG way
 *   BOOST    hold jump in the air while fuel lasts → sustained flight; fuel refills on the ground
 *
 * Collision is swept-AABB against the world boxes, resolved per axis so you slide along walls
 * instead of sticking, and land cleanly on rooftops (which is the point — the city is climbable).
 *
 *   RoninWorld.load(url)         → Promise<{verts, boxes, scale}>
 *   RoninWorld.step(a, dt, input)  advance one actor
 *   RoninWorld.MOVE                the tuning table
 */
window.RoninWorld = (function () {
  let world = null;                                  // { verts, boxes, scale }

  // movement tuning — units are world-units/sec. The city is ~120 units across.
  const MOVE = {
    accel: 78, runMax: 15, sprintMax: 30, airAccel: 34, friction: 9.5, airDrag: 0.6,
    gravity: 42, jumpV: 17, leapBonus: 0.42,         // jump velocity gains with horizontal speed
    boostUp: 46, boostMax: 22, boostDrain: 1.0, boostRefill: 0.55, boostMin: 0.12,
    radius: 0.55, height: 2.1, stepUp: 0.9,          // capsule-ish player box + step height
  };

  function load(url) {
    return fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(buf => {
      const dv = new DataView(buf);
      const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 8));
      if (magic !== 'UR3WORLD') throw new Error('not a .wld file');
      const count = dv.getUint32(12, true), scale = dv.getFloat32(16, true);
      const verts = new Float32Array(buf, 32, count * 6);
      return fetch(url.replace(/\.wld$/, '') + '.cols.json').then(r => r.ok ? r.json() : { boxes: [] })
        .then(c => (world = { verts, boxes: c.boxes || [], spawns: c.spawns || [], scale: scale || 120 }));
    });
  }

  // ── collision: resolve one axis at a time so motion slides rather than sticks ──
  function hits(x, y, z) {
    const r = MOVE.radius, h = MOVE.height, B = world ? world.boxes : [];
    for (let i = 0; i < B.length; i++) { const b = B[i];
      if (x + r > b.lo[0] && x - r < b.hi[0] && z + r > b.lo[2] && z - r < b.hi[2] && y + h > b.lo[1] && y < b.hi[1]) return b;
    }
    return null;
  }
  // highest surface directly under the actor (rooftops + street), used for landing
  function groundAt(x, z, y) {
    let best = 0; const r = MOVE.radius, B = world ? world.boxes : [];
    for (let i = 0; i < B.length; i++) { const b = B[i];
      if (x + r > b.lo[0] && x - r < b.hi[0] && z + r > b.lo[2] && z - r < b.hi[2]) {
        if (b.hi[1] <= y + MOVE.stepUp && b.hi[1] > best) best = b.hi[1];
      } }
    return best;
  }

  /* Advance one actor. `a` carries {x,y,z,vx,vy,vz,onGround,boost,flying}; `input` carries
   * {mx,mz} (-1..1 desired direction), {sprint, jump} booleans. Returns `a`. */
  function step(a, dt, input) {
    if (a.y == null) { a.y = 0; a.vy = 0; a.vx = a.vx || 0; a.vz = a.vz || 0; a.boost = 1; }
    const mx = input.mx || 0, mz = input.mz || 0, len = Math.hypot(mx, mz);
    const dirx = len > 0.01 ? mx / len : 0, dirz = len > 0.01 ? mz / len : 0;
    const sprinting = !!input.sprint && a.onGround && len > 0.1;
    const top = sprinting ? MOVE.sprintMax : MOVE.runMax;

    // horizontal acceleration (weaker in the air, so a leap commits)
    const acc = (a.onGround ? MOVE.accel : MOVE.airAccel) * dt;
    a.vx += dirx * acc; a.vz += dirz * acc;
    const sp = Math.hypot(a.vx, a.vz);
    if (sp > top && a.onGround) { const k = top / sp; a.vx *= k; a.vz *= k; }
    if (a.onGround && len < 0.05) { const f = Math.max(0, 1 - MOVE.friction * dt); a.vx *= f; a.vz *= f; }
    else if (!a.onGround) { const f = Math.max(0, 1 - MOVE.airDrag * dt); a.vx *= f; a.vz *= f; }

    // jump / leap: launch velocity scales with how fast you're already going
    if (input.jump && a.onGround && !a._jumpHeld) {
      a.vy = MOVE.jumpV + Math.min(sp, MOVE.sprintMax) * MOVE.leapBonus;
      a.onGround = false; a.jumped = true;
    }
    // booster flight — hold jump in the air while fuel remains
    a.flying = false;
    if (input.jump && !a.onGround && a.boost > MOVE.boostMin) {
      a.vy += MOVE.boostUp * dt; if (a.vy > MOVE.boostMax) a.vy = MOVE.boostMax;
      a.boost = Math.max(0, a.boost - MOVE.boostDrain * dt); a.flying = true;
    }
    a._jumpHeld = !!input.jump;
    if (a.onGround) a.boost = Math.min(1, a.boost + MOVE.boostRefill * dt);

    a.vy -= MOVE.gravity * dt;

    // ── integrate with per-axis collision ──
    let nx = a.x + a.vx * dt;
    if (hits(nx, a.y, a.z)) { const g = groundAt(nx, a.z, a.y);            // try to step up onto it
      if (g > a.y && g - a.y <= MOVE.stepUp && !hits(nx, g, a.z)) a.y = g; else { a.vx = 0; nx = a.x; } }
    a.x = nx;
    let nz = a.z + a.vz * dt;
    if (hits(a.x, a.y, nz)) { const g = groundAt(a.x, nz, a.y);
      if (g > a.y && g - a.y <= MOVE.stepUp && !hits(a.x, g, nz)) a.y = g; else { a.vz = 0; nz = a.z; } }
    a.z = nz;

    let ny = a.y + a.vy * dt;
    const floor = groundAt(a.x, a.z, Math.max(a.y, ny));
    if (a.vy <= 0 && ny <= floor) { ny = floor; a.vy = 0; a.onGround = true; a.jumped = false; }
    else { a.onGround = false;
      if (a.vy > 0 && hits(a.x, ny, a.z)) { ny = a.y; a.vy = 0; } }                // bonked a ceiling
    a.y = ny;
    if (a.y < 0) { a.y = 0; a.vy = 0; a.onGround = true; }

    a.speed = Math.hypot(a.vx, a.vz);
    return a;
  }

  /* Authored spawn points baked into the level (kit.spawn → bake-world), farthest-first from
   * an optional avoid-point so two fighters don't start on top of each other.
   * Returns null when a level carries none, which is the signal to fall back to findSpawn's
   * search. Authored beats searched: a spiral lands you *somewhere legal*, which is not the
   * same as somewhere the level was designed to be entered from. */
  function pickSpawn(avoid) {
    const sp = world && world.spawns;
    if (!sp || !sp.length) return null;
    if (!avoid) return sp[0];
    let best = sp[0], bd = -1;
    for (const s of sp) {
      const d = Math.hypot(s.x - avoid.x, s.z - avoid.z);
      if (d > bd) { bd = d; best = s; }
    }
    return best;
  }

  /* Nearest clear standing spot to (x,z) — spiral out until we find ground with headroom.
   * Without this a spawn can land inside a building and the actor is simply stuck. */
  function findSpawn(x, z) {
    for (let r = 0; r <= 60; r += 2) {
      for (let a = 0; a < 16; a++) {
        const th = a / 16 * Math.PI * 2, px = x + Math.cos(th) * r, pz = z + Math.sin(th) * r;
        const g = groundAt(px, pz, 0.5);
        if (!hits(px, g + 0.1, pz) && !hits(px, g + MOVE.height * 0.9, pz)) return { x: px, y: g, z: pz };
      }
      if (r === 0) r = 0;                                   // first ring is the point itself
    }
    return { x, y: 0, z };
  }
  const bounds = () => world ? world.scale : 120;
  return { load, step, hits, groundAt, findSpawn, pickSpawn, MOVE, get world() { return world; }, bounds };
})();

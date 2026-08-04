/* ripmaster3030studios — THE CITY · RIDES. Cars in the street that you can get into and drive.
 *
 * Artist, 2026-08-04: *"lets make some land vehicles we can hop in and drive."*
 *
 * ⚑ A CAR IS THE FIRST THING IN THIS CITY THAT IS NEITHER AN ANIMAL NOR A SOLDIER, and that is
 *   what makes it worth having: the bird sees the whole map and cannot touch it, the squirrel
 *   touches everything and cannot cover ground, the operative covers ground at 6.4 m/s. A car is
 *   the missing middle — it moves at 30 m/s along the streets the generator already draws, which
 *   means it makes the STREET GRID legible in a way nothing else does. You learn a city by
 *   driving it.
 *
 * ⛔ ANY BODY ON FOOT MAY DRIVE, AND THAT IS THE WHOLE INTEGRATION. It is not a fourth mode: the
 *   squirrel drives (it is funny, and this is a Dadaist studio) and the operative drives (it is
 *   useful). A bird has no reason to and a jet is already a vehicle, so both are refused rather
 *   than half-supported. ⚠ `targetable` NEVER changes when you get in — an animal in a car is
 *   still an observer, or the observer rule would have a loophole shaped like a car door.
 *
 * ⚑ THE PHYSICS IS A CAR'S, NOT A BODY'S WITH A DIFFERENT TOP SPEED. Three things make it read as
 *   driving rather than as a fast walk, and all three are the same one fact — a car may only push
 *   itself ALONG ITS OWN AXIS:
 *     · STEERING IS A RATE THAT NEEDS SPEED. Stationary, the wheel does nothing. That single
 *       property is most of what separates a car from a character controller.
 *     · GRIP IS FINITE. Sideways velocity is scrubbed, not cancelled, so the back steps out under
 *       power and the handbrake lets go of it on purpose.
 *     · THE BODY LEANS INTO WHAT IT IS DOING. Roll from lateral load, pitch from acceleration.
 *       DESIGN-SYSTEM §4: what moves, and why it physically moved.
 *
 * ⚠ Fails open like everything else here: no collider ⇒ no cars, and the game is exactly what it
 *   was. Nothing else in THE CITY depends on this module existing.
 *
 *   CityRides.create(app, parent, { collide }) -> api
 */
window.CityRides = (function () {
  'use strict';

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const TAU = Math.PI * 2;

  /* ── the car. Metres. Roughly a small hatchback: 4.1 long, 1.8 wide, 1.5 tall. */
  const CAR = {
    len: 4.1, wid: 1.8, hgt: 1.45,
    r: 1.15,                       // collision radius — a car is not a capsule, but the city is
    step: 0.55,                    // kerbs it can mount
    accel: 13.5,                   // m/s² — brisk, not a supercar
    reverse: 6.0,
    brake: 22,
    topFwd: 33, topRev: 9,         // ~120 km/h forward
    rollDrag: 0.9,                 // rolling resistance, m/s²
    dragK: 0.0016,                 // quadratic — this is what sets the real top speed
    steer: 1.9,                    // rad/s at the reference speed
    steerRef: 12,                  // …and the speed at which steering is fullest
    grip: 9.0,                     // lateral scrub, m/s² — finite ON PURPOSE
    driftGrip: 2.6,                // …and what the handbrake drops it to
    grav: 26,
    enterR: 3.6,                   // how close you must be to get in
  };

  const PAINT = [[0.72, 0.16, 0.12], [0.13, 0.34, 0.48], [0.83, 0.68, 0.18],
                 [0.16, 0.42, 0.26], [0.78, 0.78, 0.76], [0.30, 0.22, 0.36]];

  function create(app, parent, opts) {
    opts = opts || {};
    const collide = opts.collide || null;
    const root = parent || app.root;
    const cars = [];
    let driving = null, seq = 0;
    const log = { spawned: 0, entered: 0, exited: 0 };

    let BOX = null;
    const mats = {};
    function mat(key, r, g, b, gloss, metal) {
      if (mats[key]) return mats[key];
      const m = new pc.StandardMaterial();
      m.diffuse = new pc.Color(r, g, b);
      m.useMetalness = true; m.metalness = metal == null ? 0.35 : metal;
      m.gloss = gloss == null ? 0.55 : gloss;
      m.update(); return (mats[key] = m);
    }
    function paintMat(i) {
      const c = PAINT[i % PAINT.length];
      return mat('p' + (i % PAINT.length), c[0], c[1], c[2], 0.62, 0.30);
    }

    function part(parentEnt, m, px, py, pz, sx, sy, sz, ry) {
      if (!BOX) BOX = pc.Mesh.fromGeometry(app.graphicsDevice, new pc.BoxGeometry());
      const e = new pc.Entity('cp');
      const mi = new pc.MeshInstance(BOX, m, e);
      mi.castShadow = true;
      e.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
      e.setLocalPosition(px, py, pz); e.setLocalScale(sx, sy, sz);
      if (ry) e.setLocalEulerAngles(0, ry, 0);
      parentEnt.addChild(e);
      return e;
    }

    /* ⚑ BUILT FROM PARTS, NOT FROM ONE BOX. `docs/DESIGN-SYSTEM.md` §1 is explicit that the
     * default primitive is only right when it is also the truth — it was right for a trading card
     * and it is wrong here, because a car is a body with a cabin set back on it, wheels at the
     * corners and glass you can see through. A single scaled cube is the placeholder this project
     * has already been told off for twice. */
    function buildBody(i) {
      const e = new pc.Entity('car');
      const P = paintMat(i);
      const glass = mat('glass', 0.10, 0.14, 0.17, 0.90, 0.10);
      const tyre = mat('tyre', 0.055, 0.055, 0.060, 0.14, 0.02);
      const trim = mat('trim', 0.10, 0.10, 0.11, 0.40, 0.55);
      const lamp = mat('lamp', 0.98, 0.94, 0.72, 0.85, 0.05);
      const tail = mat('tail', 0.72, 0.10, 0.08, 0.80, 0.05);
      const L = CAR.len, W = CAR.wid;
      // lower body, sitting on the axles
      part(e, P, 0, 0.52, 0, W, 0.52, L);
      // bonnet and boot are LOWER than the cabin, which is what gives it a silhouette
      part(e, P, 0, 0.80, -L * 0.30, W * 0.92, 0.20, L * 0.36);
      part(e, P, 0, 0.80, L * 0.34, W * 0.92, 0.20, L * 0.28);
      // cabin, set back and narrower
      part(e, P, 0, 1.02, L * 0.04, W * 0.86, 0.46, L * 0.40);
      // glasshouse — a band right round, so it reads as windows rather than a stripe
      part(e, glass, 0, 1.14, L * 0.04, W * 0.88, 0.26, L * 0.38);
      // wheels
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        part(e, tyre, sx * (W * 0.50), 0.34, sz * (L * 0.31), 0.24, 0.68, 0.68);
      // bumpers, lamps
      part(e, trim, 0, 0.44, -L * 0.50, W * 0.98, 0.22, 0.18);
      part(e, trim, 0, 0.44, L * 0.50, W * 0.98, 0.22, 0.18);
      for (const sx of [-1, 1]) {
        part(e, lamp, sx * (W * 0.32), 0.72, -L * 0.50, 0.30, 0.18, 0.10);
        part(e, tail, sx * (W * 0.32), 0.72, L * 0.50, 0.30, 0.16, 0.10);
      }
      return e;
    }

    function makeCar(x, y, z, yaw) {
      const e = buildBody(seq);
      root.addChild(e);
      const c = { n: seq++, x, y, z, yaw, vx: 0, vy: 0, vz: 0, spd: 0,
                  steerA: 0, roll: 0, pitch: 0, onGround: false, ent: e, occupied: false };
      e.setLocalPosition(x, y, z);
      e.setLocalEulerAngles(0, yaw * 180 / Math.PI, 0);
      cars.push(c); log.spawned++;
      return c;
    }

    /* ⚑ CARS BELONG ON ROADS, and the generator already knows where those are: streets run along
     * chunk boundaries, so a point near one at street level with nothing on it is a parking space.
     * ⚠ Checked against the COLLIDER rather than assumed from the grid — a boundary can carry a
     *   bridge, a landmark or the river, and a car parked inside a wall is worse than no car. */
    function park(px, pz) {
      if (!collide || !window.CityWorld) return null;
      const CW = window.CityWorld, CH = CW.CHUNK;
      for (let t = 0; t < 24; t++) {
        const a = Math.random() * TAU, d = 22 + Math.random() * 70;
        let x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d;
        // snap onto the nearest street centreline, then slide along it
        const bx = Math.round(x / CH) * CH, bz = Math.round(z / CH) * CH;
        let yaw;
        if (Math.abs(x - bx) < Math.abs(z - bz)) { x = bx + (Math.random() < 0.5 ? -3.6 : 3.6); yaw = Math.random() < 0.5 ? 0 : Math.PI; }
        else { z = bz + (Math.random() < 0.5 ? -3.6 : 3.6); yaw = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
        /* ⛔ NOT ON THE RIVER. The street grid runs straight across it and the water's surface slab
         * answers `groundBelow` at street level, so a height test alone parks cars ON THE WATER —
         * measured, and it is exactly the kind of thing that looks like a physics bug and is a
         * spawn-validation one. `inRiver` is the generator's own function, so the check agrees
         * with the geometry by construction instead of guessing at it. ⚠ Both ends of the car are
         * tested: a 4 m body straddling the bank would still be half in. */
        if (window.CityWorld.inRiver) {
          const nx = Math.sin(yaw) * CAR.len * 0.5, nz = Math.cos(yaw) * CAR.len * 0.5;
          if (CW.inRiver(x, z) || CW.inRiver(x + nx, z + nz) || CW.inRiver(x - nx, z - nz)) continue;
        }
        const g = collide.groundBelow(x, z, 60, CAR.r, 60);
        if (g == null || g > 1.2) continue;                      // not street level
        if (collide.hits(x, g + 0.2, z, CAR.r, CAR.hgt)) continue;
        return makeCar(x, g, z, yaw);
      }
      return null;
    }

    // ── enter / exit ─────────────────────────────────────────────────────────────────────────
    function nearest(x, z) {
      let best = null, bd = CAR.enterR;
      for (const c of cars) { if (c.occupied) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) { bd = d; best = c; } }
      return best;
    }

    /* ⛔ THE BIRD AND THE JET ARE REFUSED, NOT HALF-SUPPORTED. A flying body has no reason to want
     * a car, and "it sort of works if you land first" is the kind of almost-rule that turns into a
     * bug report. `canDrive` is the only gate and it is asked in one place. */
    function canDrive(player) {
      return !!(player && player.mode !== 'jet' && player.mode !== 'bird');
    }

    function enter(player) {
      if (driving || !canDrive(player)) return null;
      const c = nearest(player.x, player.z);
      if (!c) return null;
      c.occupied = true; driving = c; log.entered++;
      c.spd = 0; c.vx = c.vy = c.vz = 0;
      return c;
    }

    /* ⚠ PUT THEM DOWN SOMEWHERE THEY CAN STAND. Stepping out into the wall the car is parked
     * against is how a vehicle becomes a trap; the door side is tried first, then the other, then
     * the roof as a last resort — which is silly and is still better than being inside geometry. */
    function exit(bodyR, bodyH) {
      if (!driving) return null;
      const c = driving;
      const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);      // the car's right
      let out = null;
      for (const s of [1, -1]) {
        const x = c.x + rx * 2.1 * s, z = c.z + rz * 2.1 * s;
        const g = collide ? collide.groundBelow(x, z, c.y + 2, bodyR || 0.42, 4) : c.y;
        if (g == null) continue;
        if (collide && collide.hits(x, g + 0.1, z, bodyR || 0.42, bodyH || 1.72)) continue;
        out = { x, y: g, z }; break;
      }
      if (!out) out = { x: c.x, y: c.y + CAR.hgt + 0.2, z: c.z };
      c.occupied = false; driving = null; log.exited++;
      return out;
    }

    // ── the drive ────────────────────────────────────────────────────────────────────────────
    function stepCar(c, dt, IN) {
      const throttle = IN ? IN.fwd : 0;
      const steerIn = IN ? IN.turn : 0;
      const hand = IN ? !!IN.hand : false;

      const hx = Math.sin(c.yaw), hz = Math.cos(c.yaw);
      const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
      // decompose velocity into "along the car" and "sideways", which is the whole model
      let vFwd = c.vx * hx + c.vz * hz;
      let vLat = c.vx * rx + c.vz * rz;

      // ── engine and brakes
      if (throttle > 0) vFwd += (vFwd < 0 ? CAR.brake : CAR.accel) * dt;
      else if (throttle < 0) vFwd -= (vFwd > 0 ? CAR.brake : CAR.reverse) * dt;
      else { const s = Math.sign(vFwd); vFwd -= s * Math.min(Math.abs(vFwd), CAR.rollDrag * dt); }
      vFwd -= CAR.dragK * vFwd * Math.abs(vFwd) * dt * 60 * dt;
      vFwd = clamp(vFwd, -CAR.topRev, CAR.topFwd);

      /* ⛔ STEERING NEEDS ROAD SPEED. A stationary car turning on the spot is a character
       * controller wearing a car, and it is the single thing that would make this not feel like
       * driving. The rate rises with speed to `steerRef` and then FALLS again, because a real
       * front wheel at 30 m/s cannot be cranked to full lock — which is also what stops the thing
       * spinning like a top on the motorway. */
      const sp = Math.abs(vFwd);
      const auth = Math.min(sp / CAR.steerRef, 1) * (CAR.steerRef / Math.max(CAR.steerRef, sp));
      c.steerA += (clamp(steerIn, -1, 1) - c.steerA) * Math.min(1, dt * 8);
      const omega = c.steerA * CAR.steer * auth * Math.sign(vFwd || 1);
      c.yaw += omega * dt;

      /* ⛔ GRIP IS FINITE AND THAT IS THE POINT. Cancelling lateral velocity outright makes a car
       * that is on rails; scrubbing it at a fixed rate means a hard turn under power lets the back
       * step out, and the handbrake simply lowers the rate. The slide is not a special case — it
       * is the same line with a smaller number. */
      const grip = (hand ? CAR.driftGrip : CAR.grip) * dt;
      const s2 = Math.sign(vLat);
      vLat -= s2 * Math.min(Math.abs(vLat), grip);
      // the turn throws weight sideways: that is where the slide comes FROM
      vLat -= omega * vFwd * dt;

      c.vx = hx * vFwd + rx * vLat;
      c.vz = hz * vFwd + rz * vLat;
      c.spd = Math.hypot(c.vx, c.vz);

      // ── move. VERTICAL FIRST, then horizontal probed from above the wheels — the same ordering
      //    `city-app.js` records for bodies on foot, and for the same reason.
      c.vy -= CAR.grav * dt;
      let ny = c.y + c.vy * dt;
      if (collide) {
        const g = collide.groundBelow(c.x, c.z, ny, CAR.r, CAR.step);
        if (g != null && ny <= g + 0.02 && c.vy <= 0) { ny = g; c.vy = 0; c.onGround = true; }
        else c.onGround = false;
      }
      let nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
      if (collide) {
        const probe = ny + CAR.step, hh = Math.max(0.2, CAR.hgt - CAR.step);
        let bump = false;
        if (collide.hits(nx, probe, c.z, CAR.r, hh)) { nx = c.x; bump = true; }
        if (collide.hits(nx, probe, nz, CAR.r, hh)) { nz = c.z; bump = true; }
        /* ⚠ A WALL STOPS A CAR, it does not bounce it. Killing the along-axis speed is what makes
         * hitting a building read as hitting a building; leaving the velocity intact would grind
         * along the wall at full speed, which is the classic driving-game tell. */
        if (bump) { c.vx *= 0.1; c.vz *= 0.1; }
        const g2 = collide.groundBelow(nx, nz, ny + CAR.step, CAR.r, CAR.step);
        if (g2 != null && g2 > ny && g2 - ny <= CAR.step && c.vy <= 0) { ny = g2; c.vy = 0; c.onGround = true; }
      }
      c.x = nx; c.z = nz; c.y = ny;

      /* ── it LEANS. Roll from the lateral load it is carrying, pitch from acceleration — squat
       * under power, dive under braking. DESIGN-SYSTEM §4: what moves, and why it physically
       * moved. Both are springs toward a target derived from the forces, not animations. */
      const wantRoll = clamp(-omega * vFwd * 0.055, -0.30, 0.30);
      const wantPitch = clamp(-(throttle > 0 ? 1 : throttle < 0 ? -1.6 : 0) * 0.035, -0.10, 0.10);
      c.roll += (wantRoll - c.roll) * Math.min(1, dt * 6);
      c.pitch += (wantPitch - c.pitch) * Math.min(1, dt * 5);
      return c;
    }

    function step(dt, player, IN) {
      if (driving) stepCar(driving, dt, IN);
      for (const c of cars) {
        c.ent.setLocalPosition(c.x, c.y, c.z);
        c.ent.setLocalEulerAngles(c.pitch * 180 / Math.PI, c.yaw * 180 / Math.PI, c.roll * 180 / Math.PI);
      }
      // population: cars exist near you and are recycled, exactly like the operatives
      if (player) {
        for (let i = cars.length - 1; i >= 0; i--) { const c = cars[i];
          if (c.occupied) continue;
          if (Math.hypot(c.x - player.x, c.z - player.z) > 260) { c.ent.destroy(); cars.splice(i, 1); } }
        let free = 0; for (const c of cars) if (!c.occupied) free++;
        if (free < 6 && canDrive(player)) park(player.x, player.z);
      }
    }

    return {
      step, CAR,
      enter, exit, canDrive,
      get driving() { return driving; },
      get cars() { return cars; },
      /* what a HUD needs and nothing it could fake with */
      get hud() {
        if (!driving) return null;
        const kph = Math.round(Math.abs(driving.vx * Math.sin(driving.yaw) + driving.vz * Math.cos(driving.yaw)) * 3.6);
        return { kph, roll: +driving.roll.toFixed(2) };
      },
      near(x, z) { return nearest(x, z); },
      get counts() { return { cars: cars.length, spawned: log.spawned,
        entered: log.entered, exited: log.exited, driving: !!driving }; },
      _spawnAt(x, y, z, yaw) { return makeCar(x, y, z, yaw || 0); },
      _seed(px, pz, n) { const out = []; for (let i = 0; i < (n || 4); i++) {
        const c = park(px, pz); if (c) out.push(c); } return out; },
    };
  }

  return { create, CAR };
})();

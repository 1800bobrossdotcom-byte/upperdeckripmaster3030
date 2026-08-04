/* ripmaster3030studios — THE CITY · SECTION 9 ON THE GROUND.
 *
 * Artist, 2026-08-03: *"you should be able to play as Section 9 on the ground in the city as
 * well."* What shipped before this was TRAVERSAL — walking, looking, gravity, standing on the
 * city — and `js/city-app.js` says so in as many words, because a mode that half-exists and is
 * described as finished is how "built ≠ reachable" becomes "built ≠ true". This is the other half:
 * a weapon, somebody to use it on, and somebody using one back.
 *
 * ⛔ THE NUMBERS ARE SECTION 9'S, CHARACTER FOR CHARACTER, AND THEY ARE LOAD-BEARING. 150 HP /
 *   60 armour, AK 17, pistol 22, buckshot 9, rifle 88 ⇒ ~1.3 s TTK; headshot ×2.1 AND armour
 *   soaking only 15% of a headshot against 45% of a body hit; out-of-combat regen to 62% after
 *   4.5 s clean; tracers TRAVEL at 340 m/s. They were tuned together — at the old 100 HP / 26 dmg
 *   an AK duel was ~0.63 s, and at that speed cover, suppression and disengaging cannot exist,
 *   because nobody lives long enough to use them. Re-picking any one of them here would quietly
 *   make this a different game wearing the same name.
 * ⚑ AND THEY CANNOT DRIFT: `npm run test:reach` parses BOTH this file and `js/s9pc-game.js` and
 *   asserts the tables agree. The honest alternative was importing `S9Game.WEAPONS` at runtime,
 *   which costs 104 KB of maps, HUD and match clock to read one array — so the coupling is a test
 *   rather than a require. That is the same arrangement `build-hero-type.mjs` uses to keep the
 *   Python RUNS and the CSS type scale moving together.
 *
 * ⛔ THE ANIMAL IS NEVER A TARGET, AND IT IS ENFORCED IN ONE PLACE. Artist, 2026-08-03: the
 *   animals are observers and cannot be hurt. `acquire()` reads `targetable` off the candidate and
 *   there is no second path to a target list — "we never gave the bird any health" is not a
 *   design, and a bot that aims at a squirrel and does no damage has already ruined the tone. The
 *   dev hook exposes `targets()` so this is a measurement rather than a promise.
 *
 * ⚑ A DEAD OPERATIVE DROPS A CARD, which is the one line that makes the firefight part of the
 *   same game as the bird and the squirrel rather than a second game sharing a street. The binder
 *   is what this studio is about; a kill that fed nothing would be a kill in somebody else's game.
 *
 * ⚠ FAILS OPEN AT EVERY STEP, like everything else here: no `S9Skin` / no `S9PCSkin` ⇒ NO BOTS AT
 *   ALL, deliberately. `s9pc-skin.js` records why the box rig exists — "a missing body in a
 *   firefight is not a downgrade, it is an invisible enemy" — so the fallback for "no bodies
 *   module" is an empty street, not an invisible one.
 *
 *   CityOps.create(app, parent, { collide, moveBody, onKill }) -> api
 */
window.CityOps = (function () {
  'use strict';

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const TAU = Math.PI * 2;
  const wrapPi = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

  /* ⛔ SECTION 9'S TABLE. Asserted equal to `js/s9pc-game.js`'s by `npm run test:reach`. The four
   * fields the city cares about are dmg / rate / spread / range; `zoom`, `sfx` and `kick` come
   * along so the two tables are literally comparable rather than approximately. */
  const WEAPONS = [
    { name: 'SIDE BET', key: 'pistol', dmg: 22, spread: 0.010, rate: 250, mag: 12, reload: 1050, auto: false, pellets: 1, zoom: 1, sfx: 'pistol', range: 60, kick: 0.9 },
    { name: 'FULL TILT', key: 'smg', dmg: 17, spread: 0.045, rate: 105, mag: 30, reload: 1500, auto: true, pellets: 1, zoom: 1, sfx: 'smg', range: 56, kick: 0.7 },
    { name: 'SCATTER', key: 'shotgun', dmg: 9, spread: 0.10, rate: 780, mag: 6, reload: 1900, auto: false, pellets: 8, zoom: 1, sfx: 'shotgun', range: 26, kick: 1.6 },
    { name: 'COLD CALL', key: 'sniper', dmg: 88, spread: 0.002, rate: 1150, mag: 5, reload: 1700, auto: false, pellets: 1, zoom: 2.7, sfx: 'sniper', range: 80, kick: 2.2 },
  ];

  const TUNE = {
    hp: 150, armor: 60, botArmor: 55,
    regenAfter: 4.5, regenTo: 0.62, regenRate: 7,
    headMul: 2.1, headSoak: 0.15, bodySoak: 0.45,
    botDmgToMe: 0.62,                  // Section 9's arcade fairness, kept
    tracerSpeed: 340, traceMine: 0.55, traceTheirs: 0.42,
    nearMiss: 2.2,
    /* ⚠ THE CAPSULE IS THE ONE SECTION 9 COLLIDES WITH — r 0.42, h 1.72 — because a bullet that
     * misses a body you could not walk through is the same defect as a wall you can see and not
     * touch. The head band is the top 0.27 m of it. */
    r: 0.42, h: 1.72, headY: 1.45, eye: 1.58,
    downT: 3.2,                        // you are back on your feet, not sent to a menu
  };

  /* ── the operative's body, which is Section 9's own and NOT a second opinion about it ───────── */
  const BODY = { r: TUNE.r, h: TUNE.h, step: 0.62, eye: TUNE.eye,
                 run: 6.4, sprint: 9.6, accel: 46, friction: 11, airAccel: 9,
                 jump: 6.6, grav: 26, climb: false };

  /* ⚑ HOW MANY, AND WHERE — a population, not a roster. In a 3.84 km city a fixed list of enemies
   * is either empty everywhere or a thousand entities; bots exist NEAR YOU and are recycled, which
   * is the same decision the chunk streamer already made about buildings. */
  const POP = { want: 4, spawnMin: 46, spawnMax: 96, despawn: 190, every: 1.4 };

  const TINTS = [[210, 120, 90], [110, 190, 210], [200, 190, 110], [170, 130, 210],
                 [120, 200, 150], [230, 150, 180]];

  function create(app, parent, opts) {
    opts = opts || {};
    const collide = opts.collide || null;
    const moveBody = opts.moveBody || null;
    const onKill = opts.onKill || null;
    const camEnt = opts.camera || null;
    const root = parent || app.root;

    const bots = [];
    const tracers = [];
    let popT = 0, seq = 0;
    const log = { shots: 0, hits: 0, heads: 0, kills: 0, downs: 0, spawned: 0, botShots: 0 };

    /* the player's combat state. POSITION is not here — `js/city-app.js` owns the body and this
     * owns what happens to it, so there is never a second copy of where you are. */
    const me = { hp: TUNE.hp, armor: TUNE.armor, maxHp: TUNE.hp, alive: true, downT: 0,
                 weapon: 1, mag: WEAPONS[1].mag, reloading: false, reloadT: 0, fireT: 0,
                 regenT: 0, recoil: 0, kick: 0, hitmark: 0, dmgFlash: 0, nearMiss: 0,
                 kills: 0, deaths: 0, ads: 0 };
    let trigger = false, wantAds = false;

    // ── FX pools ────────────────────────────────────────────────────────────────────────────
    /* ⚑ A TRACER IS A ROUND IN FLIGHT, NOT A DRAWN LINE. Damage lands hitscan at the trigger pull;
     * this is presentation — but it is the presentation that makes a firefight legible, because a
     * line that appears whole tells you nothing about which way it went. */
    let BOXG = null;
    function unlit(r, g, b) {
      const m = new pc.StandardMaterial();
      m.diffuse = new pc.Color(0, 0, 0);
      m.emissive = new pc.Color(r, g, b);
      m.useLighting = false; m.blendType = pc.BLEND_ADDITIVE; m.depthWrite = false;
      m.update(); return m;
    }
    const matTracer = unlit(1.00, 0.72, 0.34);
    const matTheirs = unlit(1.00, 0.36, 0.30);
    const matSpark = unlit(1.00, 0.86, 0.62);

    function quad(mat) {
      if (!BOXG) BOXG = pc.Mesh.fromGeometry(app.graphicsDevice, new pc.BoxGeometry());
      const e = new pc.Entity('fx');
      const mi = new pc.MeshInstance(BOXG, mat, e);
      mi.castShadow = false;
      e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
      e.enabled = false; root.addChild(e); return e;
    }
    const POOL = { tracer: [], spark: [] };
    function take(kind, mat) {
      const p = POOL[kind];
      for (let i = 0; i < p.length; i++) if (!p[i].enabled) { p[i].enabled = true; return p[i]; }
      if (p.length > 64) return null;
      const e = quad(mat); e.enabled = true; p.push(e); return e;
    }

    /* ── THE VIEWMODEL. ⛔ In first person the weapon IS the body, and until now the mode's whole
     * visual presence was a line of text saying which one you were holding. It hangs off the
     * CAMERA rather than the world, which is also why it has to be built here: `js/city-app.js`
     * keeps the camera outside the world mirror (game x is negated), so anything parented to it
     * is in un-mirrored space and must never be reasoned about in game coordinates.
     * ⚑ §4 — WHAT MOVES AND WHY IT PHYSICALLY MOVED (DESIGN-SYSTEM). The recorded failure on this
     *   project is a beautiful object that is dead to the touch, twice. So: firing drives ONE
     *   impulse — `me.kick` — and everything visible is that impulse decaying. The muzzle rises
     *   and the whole weapon travels back along its own axis, because that is what recoil is;
     *   walking sways it because a carried weight lags the body that carries it. Nothing is on a
     *   clock, and at rest it is exactly still. */
    let view = null, viewFlash = null;
    function buildView(camEnt) {
      if (view || !camEnt) return;
      view = new pc.Entity('viewmodel');
      const mat = rifleMat();
      /* camera space: −z is forward. Held low-right, angled in toward the centre of the frame.
       * ⛔ IT MUST SIT BEYOND `nearClip`, WHICH THIS GAME RAISED TO 0.4 m. The city's near plane
       * was pushed out from 0.12 to 0.4 to buy depth PRECISION against a kilometre-scale far clip
       * (the river was moiréing at 600 m) — so a viewmodel held at the usual ~0.4 m has its whole
       * front half sliced off by the near plane and reads as a featureless slab across the corner
       * of the screen. Measured: that is exactly what the first pass looked like.
       * ⚑ The fix is distance, not scale: hold it at 0.9 m and size it for that distance. A
       *   viewmodel is one of the few objects whose position is decided by the projection rather
       *   than by the fiction, and the projection here is not the default one. */
      const parts = [[0, 0, 0, 0.075, 0.085, 0.46], [0, 0.016, -0.40, 0.040, 0.040, 0.34],
                     [0, -0.100, -0.03, 0.056, 0.150, 0.060], [0, -0.020, 0.27, 0.064, 0.100, 0.14],
                     [0, 0.065, 0.03, 0.030, 0.030, 0.26]];
      for (const [px, py, pz, sx, sy, sz] of parts) {
        const e = new pc.Entity('vp');
        const mi = new pc.MeshInstance(rifleMesh(), mat, e);
        mi.castShadow = false;
        e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: true });
        e.setLocalPosition(px, py, pz); e.setLocalScale(sx, sy, sz);
        view.addChild(e);
      }
      /* ⛔ "WHERE ARE MY DUDES HANDS" — artist, 2026-08-04, and he is right: a weapon floating in
       * the corner of the frame with nothing holding it is the DESIGN-SYSTEM §1 failure in its
       * purest form. A gun is not an object in space, it is an object BEING HELD, and the hands
       * are most of what makes a first-person shooter read as a body rather than a camera.
       * ⚑ FORE HAND ON THE HANDGUARD, REAR HAND ON THE GRIP, and a forearm running back out of
       *   frame from each — that last part matters, because a pair of disembodied hands is the
       *   same defect one step smaller. The rear arm is angled in toward the shoulder that would
       *   be carrying it; the fore arm crosses under the barrel, which is what a two-handed carry
       *   actually looks like from behind the sights.
       * ⚠ Skin has to be a DIFFERENT VALUE from the weapon or the print pass posterises both into
       *   one silhouette — the same lesson the bots' rifle just taught, in reverse: there the gun
       *   was too dark against the body, here the body must not match the gun. */
      const skin = new pc.StandardMaterial();
      skin.diffuse = new pc.Color(0.42, 0.30, 0.23);
      skin.useMetalness = true; skin.metalness = 0; skin.gloss = 0.16; skin.update();
      const cuff = new pc.StandardMaterial();
      cuff.diffuse = new pc.Color(0.15, 0.155, 0.17);
      cuff.useMetalness = true; cuff.metalness = 0.1; cuff.gloss = 0.22; cuff.update();
      //            x      y      z     sx     sy     sz    rotX rotY  material
      /* ⚠ THE ARM DROP IS BOUNDED BY THE FRAME, NOT BY ANATOMY. First pass hung the forearms at
       * −0.19 under a viewmodel already at −0.29; at 0.92 m out with this fov the bottom of the
       * frame is −0.48, so the arms ended exactly on the edge and were sliced off — hands with no
       * arms, which is the defect this is fixing wearing a different hat. Everything is measured
       * back from the frame edge now. */
      const hands = [
        [ 0.020, -0.062, -0.250, 0.085, 0.075, 0.115,   0,   0, skin],   // fore hand, on the guard
        [ 0.105, -0.140, -0.190, 0.075, 0.075, 0.330, -20,  16, skin],   // …and its forearm
        [ 0.005, -0.058,  0.150, 0.085, 0.090, 0.110,   0,   0, skin],   // rear hand, on the grip
        [ 0.140, -0.112,  0.330, 0.080, 0.080, 0.300, -11,  20, skin],   // …and its forearm
        [ 0.125, -0.152,  0.010, 0.088, 0.088, 0.090, -20,  16, cuff],   // sleeve cuffs, so the arms
        [ 0.160, -0.126,  0.470, 0.092, 0.092, 0.090, -11,  20, cuff],   //   end in a garment
      ];
      for (const [px, py, pz, sx, sy, sz, rx, ry, m] of hands) {
        const e = new pc.Entity('vh');
        const mi = new pc.MeshInstance(rifleMesh(), m, e);
        mi.castShadow = false;
        e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: true });
        e.setLocalPosition(px, py, pz); e.setLocalScale(sx, sy, sz);
        e.setLocalEulerAngles(rx, ry, 0);
        view.addChild(e);
      }
      viewFlash = new pc.Entity('muzzle');
      const fm = new pc.MeshInstance(rifleMesh(), matSpark, viewFlash);
      viewFlash.addComponent('render', { meshInstances: [fm], castShadows: false, receiveShadows: false });
      viewFlash.setLocalPosition(0, 0.016, -0.60); viewFlash.setLocalScale(0.11, 0.11, 0.11);
      viewFlash.enabled = false;
      view.addChild(viewFlash);
      camEnt.addChild(view);
    }
    /* the un-zoomed field of view, captured once so ADS has something to return to. ⚠ Read from
     * the camera rather than assumed: `city-app.js` sets it, and a hard-coded 62 here would be a
     * second opinion that silently wins whenever the first one changes. */
    let BASE_FOV = (camEnt && camEnt.camera) ? camEnt.camera.fov : 62;
    const vs = { sway: 0, swayT: 0, bob: 0 };
    function stepView(dt, player, armed) {
      if (!view) return;
      view.enabled = !!armed && me.alive;
      if (!view.enabled) return;
      const spd = (player && player.speed) || 0;
      /* the sway lags the turn: a carried weight does not corner with you */
      const yawRate = clamp((player.yaw - (vs.lastYaw == null ? player.yaw : vs.lastYaw)) / Math.max(dt, 1e-3), -6, 6);
      vs.lastYaw = player.yaw;
      vs.sway += (yawRate * -0.014 - vs.sway) * Math.min(1, dt * 7);
      vs.bob += spd * dt * 2.6;
      const walk = Math.min(1, spd / 6);
      const bx = Math.sin(vs.bob) * 0.012 * walk, by = Math.abs(Math.cos(vs.bob)) * 0.010 * walk;
      /* ⛔ AIMING MOVES THE WEAPON ONTO THE RETICLE. `s9pc-app.js` records the reason its ADS pose
       * is `x = 0`: that is what puts the sights on the crosshair. Interpolating between the hip
       * carry and that pose is the whole animation — no clip, just the same spring the sway uses,
       * driven by a state that also tightens the cone and pulls the fov in. */
      const a = me.ads;
      const k = me.kick;                                   // the ONLY input to recoil
      const hipX = 0.27 + vs.sway + bx, adsX = 0.0 + vs.sway * 0.3;
      const hipY = -0.235 - by, adsY = -0.078 - by * 0.3;
      view.setLocalPosition(hipX + (adsX - hipX) * a,
                            hipY + (adsY - hipY) * a + k * 0.018,
                            -0.92 + (0.30 * a) + k * 0.10);
      view.setLocalEulerAngles(k * 9 * (1 - a * 0.5),
                               (-4.5 + vs.sway * 40) * (1 - a),
                               (1.5 + vs.sway * 22) * (1 - a));
      viewFlash.enabled = k > 0.55;
      if (viewFlash.enabled) { const s = 0.08 + k * 0.14;
        viewFlash.setLocalScale(s, s, s * 1.6); }
    }

    const sparks = [];
    function spark(x, y, z) {
      const e = take('spark', matSpark); if (!e) return;
      e.setLocalPosition(x, y, z); e.setLocalScale(0.16, 0.16, 0.16);
      sparks.push({ e, t: 0.13 });
    }

    // ── geometry queries ─────────────────────────────────────────────────────────────────────
    /* Ray vs a standing body: closest approach between the ray and the capsule's vertical spine.
     * Returns the ray parameter, or null. ⚠ The spine is a SEGMENT, so the approach has to be
     * clamped to it or a shot at the pavement in front of somebody registers on their shins. */
    function rayBody(ox, oy, oz, dx, dy, dz, b, maxT) {
      const cy0 = b.y + TUNE.r, cy1 = b.y + TUNE.h - TUNE.r;
      // axis is +y; solve for the closest points between ray and the y-segment
      const px = ox - b.x, py = oy - cy0, pz = oz - b.z;
      const L = cy1 - cy0;
      const d1d2 = dy;                       // dir · yhat
      const den = 1 - d1d2 * d1d2;
      let t;
      if (Math.abs(den) < 1e-6) t = -(px * dx + py * dy + pz * dz);   // parallel-ish: project
      else t = ((-(px * dx + py * dy + pz * dz)) - d1d2 * (-py)) / den;
      if (t < 0) t = 0;
      if (maxT != null && t > maxT) return null;
      let s = (oy + dy * t) - cy0;
      s = clamp(s, 0, L);
      // re-solve t against the clamped point on the spine
      const qx = b.x, qy = cy0 + s, qz = b.z;
      t = (qx - ox) * dx + (qy - oy) * dy + (qz - oz) * dz;
      if (t < 0) return null;
      if (maxT != null && t > maxT) return null;
      const hx = ox + dx * t - qx, hy = oy + dy * t - qy, hz = oz + dz * t - qz;
      if (hx * hx + hy * hy + hz * hz > TUNE.r * TUNE.r) return null;
      return { t, y: oy + dy * t };
    }

    function wallT(ox, oy, oz, dx, dy, dz, maxT) {
      if (!collide || !collide.rayHit) return maxT == null ? Infinity : maxT;
      const h = collide.rayHit(ox, oy, oz, dx, dy, dz, maxT);
      return h ? h.t : (maxT == null ? Infinity : maxT);
    }

    /* ⚑ LINE OF SIGHT IS THE SAME BOX LIST THE STREET WAS BUILT FROM. `docs/CITY-GAME.md`'s 1:1
     * guarantee — the geometry IS the collision set — is what makes this true without a second
     * representation to disagree with: a bot cannot see through something you can see. */
    function canSee(ax, ay, az, bx, by, bz) {
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      const d = Math.hypot(dx, dy, dz); if (d < 0.01) return true;
      dx /= d; dy /= d; dz /= d;
      return wallT(ax, ay, az, dx, dy, dz, d - 0.15) >= d - 0.16;
    }

    // ── targets ──────────────────────────────────────────────────────────────────────────────
    /* ⛔ THE OBSERVER RULE, AND IT IS THE ONLY PLACE A TARGET LIST IS BUILT. Everything that can be
     * shot at passes through here, so the animal's exemption is structural rather than a value
     * somebody remembered to check. `player.targetable` comes straight off `MODES` in city-app. */
    function candidates(player) {
      const out = [];
      for (let i = 0; i < bots.length; i++) if (bots[i].alive) out.push(bots[i]);
      if (player && player.targetable && me.alive) out.push(playerAsTarget(player));
      return out;
    }
    let _pt = null;
    function playerAsTarget(player) {
      _pt = _pt || { isMe: true, team: 0 };
      _pt.x = player.x; _pt.y = player.y; _pt.z = player.z;
      _pt.hp = me.hp; _pt.armor = me.armor; _pt.alive = me.alive;
      return _pt;
    }

    /* ⛔ THE OPERATIVES ARE ONE SQUAD, AND WITHOUT THAT THE STREET CLEARS ITSELF. Measured: four
     * bots seeded 50 m apart with no teams killed each other inside thirteen seconds — 8 spawned,
     * 5 killed, ZERO alive by the time the player walked over. Section 9's arena is a free-for-all
     * because a deathmatch is what it is; a city you wander into is not, and "everyone was already
     * dead when you got there" is not an atmosphere, it is an empty game that looks like a bug.
     * ⚑ It still routes through `candidates`, so the observer rule is not duplicated here — this
     *   only NARROWS that list, it can never widen it. An animal is absent before teams are
     *   considered, which is the ordering that makes the exemption impossible to lose. */
    function hostilesFor(b, player) {
      const all = candidates(player), out = [];
      for (let i = 0; i < all.length; i++) if (all[i].team !== b.team) out.push(all[i]);
      return out;
    }

    // ── damage ───────────────────────────────────────────────────────────────────────────────
    function applyDamage(t, dmg, src, head, hx, hy, hz) {
      if (!t || !t.alive) return;
      if (src && src.bot && t.isMe) dmg *= TUNE.botDmgToMe;
      /* Armour soaks 45% of a body hit but only 15% of a headshot. Plates do not cover a skull,
       * and without this carve-out a longer TTK quietly deletes the marksman. */
      let d = dmg;
      const cur = t.isMe ? me : t;
      if (cur.armor > 0) { const soak = Math.min(cur.armor, d * (head ? TUNE.headSoak : TUNE.bodySoak));
        cur.armor -= soak; d -= soak; }
      cur.hp -= d; cur.regenT = 0;
      /* being shot is INFORMATION: it points a bot at where the round came from even when it
       * cannot see you. That single line is what turns the long TTK into a firefight rather than
       * a longer damage race. */
      if (!t.isMe) { t.supT = 1.8; if (src) { t.lastSeen = { x: src.x, y: src.y, z: src.z }; } }
      if (t.isMe) { me.dmgFlash = Math.min(1, me.dmgFlash + clamp(d * 0.02, 0.3, 0.7)); }
      spark(hx, hy, hz);
      if (cur.hp <= 0) kill(t, src);
    }

    function kill(t, src) {
      if (t.isMe) {
        me.alive = false; me.downT = TUNE.downT; me.deaths++; log.downs++;
        return;
      }
      t.alive = false; t.deadT = 0; log.kills++;
      if (src && src.isMe !== undefined && src.isMe) me.kills++;
      /* ⚑ A CARD FALLS OUT. The whole reason this game folds three cabinets into one street is that
       * they feed the SAME binder; a kill that produced nothing would just be Section 9 with a
       * bigger map. */
      if (onKill) { try { onKill(t.x, t.y + 0.9, t.z); } catch (e) {} }
    }

    // ── firing ───────────────────────────────────────────────────────────────────────────────
    function shoot(shooter, ox, oy, oz, dx, dy, dz, w, player, mine) {
      const targets = candidates(player);
      const maxR = w.range;
      const wt = wallT(ox, oy, oz, dx, dy, dz, maxR);
      let best = null, bestT = Math.min(wt, maxR);
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (t === shooter) continue;
        if (shooter && shooter.isMe && t.isMe) continue;
        const h = rayBody(ox, oy, oz, dx, dy, dz, t, bestT);
        if (h) { best = t; bestT = h.t; best._hitY = h.y; }
      }
      const endT = Math.min(bestT, wt, maxR);
      // the round in flight
      const rate = mine ? TUNE.traceMine : TUNE.traceTheirs;
      if (Math.random() < rate) tracers.push({ x: ox, y: oy, z: oz, dx, dy, dz,
        len: endT, p: 0, mine: !!mine, e: null });
      if (best) {
        const head = best._hitY >= best.y + TUNE.headY;
        const dmg = w.dmg * (head ? TUNE.headMul : 1);
        log.hits++; if (head) log.heads++;
        if (mine) me.hitmark = 0.14;
        applyDamage(best, dmg, shooter, head, ox + dx * endT, oy + dy * endT, oz + dz * endT);
      } else {
        spark(ox + dx * endT, oy + dy * endT, oz + dz * endT);
      }
      return { t: endT, hit: best };
    }

    function spread(dx, dy, dz, s) {
      // a cheap orthonormal kick — enough for a cone, and it costs no basis construction
      const ax = Math.abs(dy) < 0.9 ? 0 : 1;
      let ux = ax ? 1 : 0, uy = 0, uz = ax ? 0 : 1;
      let rx = dy * uz - dz * uy, ry = dz * ux - dx * uz, rz = dx * uy - dy * ux;
      const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
      const px = dy * rz - dz * ry, py = dz * rx - dx * rz, pz = dx * ry - dy * rx;
      const a = Math.random() * TAU, m = s * Math.sqrt(Math.random());
      const cx = Math.cos(a) * m, cy = Math.sin(a) * m;
      let ox = dx + rx * cx + px * cy, oy = dy + ry * cx + py * cy, oz = dz + rz * cx + pz * cy;
      const l = Math.hypot(ox, oy, oz) || 1;
      return [ox / l, oy / l, oz / l];
    }

    function fireOnce(player) {
      if (!me.alive || me.reloading || me.fireT > 0) return false;
      const w = WEAPONS[me.weapon];
      if (me.mag <= 0) { startReload(); return false; }
      me.mag--; me.fireT = w.rate / 1000; log.shots++;
      me.recoil = Math.min(1, me.recoil + 0.45); me.kick = w.kick;
      const ox = player.x, oy = player.y + TUNE.eye, oz = player.z;
      const cp = Math.cos(player.pitch || 0);
      const bx = Math.sin(player.yaw) * cp, by = Math.sin(player.pitch || 0), bz = Math.cos(player.yaw) * cp;
      /* ⛔ AIMING TIGHTENS THE CONE — that is what aiming IS, and without it the right mouse
       * button is a zoom lens rather than a weapon state. Section 9 ties the two together and so
       * does this: `me.ads` is the same 0..1 that moves the viewmodel and pulls the fov in, so the
       * sight picture and the accuracy can never disagree. SCATTER is exempt on purpose — a
       * shotgun's spread is the weapon, not the aim. */
      const tight = w.key === 'shotgun' ? 1 : (1 - 0.62 * me.ads);
      for (let i = 0; i < w.pellets; i++) {
        const d = spread(bx, by, bz, w.spread * tight);
        shoot({ isMe: true, x: ox, y: oy, z: oz }, ox, oy, oz, d[0], d[1], d[2], w, player, true);
      }
      if (me.mag <= 0) startReload();
      return true;
    }

    function startReload() {
      if (me.reloading) return; const w = WEAPONS[me.weapon];
      if (me.mag >= w.mag) return;
      me.reloading = true; me.reloadT = w.reload / 1000;
    }
    function switchWeapon(i) {
      i = clamp(i | 0, 0, WEAPONS.length - 1); if (i === me.weapon) return me.weapon;
      me.weapon = i; me.reloading = false; me.reloadT = 0;
      me.fireT = Math.max(me.fireT, 0.18); me.mag = WEAPONS[i].mag;
      return me.weapon;
    }
    function cycleWeapon(d) { return switchWeapon((me.weapon + (d || 1) + WEAPONS.length) % WEAPONS.length); }

    // ── bots ─────────────────────────────────────────────────────────────────────────────────
    /* ⛔ A BODY IS PARKED, NEVER DESTROYED, AND THE REASON IS A SHARED MESH. `S9PCSkin` memoises
     * `BUILT[arch].mesh` so that seven operatives of one archetype upload 4,600 triangles ONCE —
     * which means `entity.destroy()` on one of them takes the render component's mesh instance
     * (and its vertex buffer) with it, and the NEXT operative of that archetype renders from a
     * dead buffer. Symptom in the driven run: "Cannot read properties of null (reading
     * 'getFormat')", repeatedly, with nothing visibly wrong until a body simply stopped drawing.
     * ⚑ Parking is also just better: a recycled body costs no fetch, no skin build and no upload,
     *   and in a streamed city bodies are recycled constantly by construction. */
    const parked = {};                        // arch -> [handle]

    /* ⛔ AN UNARMED OPERATIVE IN A FIREFIGHT READS AS A BUG — this repo's own recorded rule, the
     * same one that makes NEON RONIN always draw the sword and makes Section 9 hang a rifle off
     * the pose. `S9PCSkin` ships the BODY and nothing else, so the gun is ours to mount.
     * ⚑ IT HANGS OFF THE SKELETON, NOT THE MESH — a child of the `armF1` bone, which the poser
     *   already positions at the elbow and rotates along the forearm. One implementation fits
     *   every archetype and every body size, because the bone is the only thing it reads. Bones
     *   are in S9Skin's px space (H = 150 px = 1.72 m) and the root carries the metre scale, so a
     *   child measured in px lands correctly on a tall body and a squat one alike. */
    let RIFLE = null;
    function rifleMesh() {
      if (!BOXG) BOXG = pc.Mesh.fromGeometry(app.graphicsDevice, new pc.BoxGeometry());
      return BOXG;
    }
    function rifleMat() {
      if (RIFLE) return RIFLE;
      const m = new pc.StandardMaterial();
      /* ⚠ NOT NEAR-BLACK. The operatives' vests are ~0.16 albedo and the print pass posterises to
       * about six steps, so a 0.085 weapon merges into the body it is held against and the fix
       * for "an unarmed operative reads as a bug" produces an operative who still looks unarmed.
       * `s9pc-skin.js`'s own note applies to the gun too: hue identifies, VALUE is what makes a
       * thing findable. Mid grey with real metalness, so it also catches the key light. */
      m.diffuse = new pc.Color(0.23, 0.225, 0.24);
      m.useMetalness = true; m.metalness = 0.55; m.gloss = 0.42;
      m.update(); return (RIFLE = m);
    }
    function armFor(handle) {
      if (!handle || !handle.bones || handle.bones.length < 5 || handle.gun) return;
      const hand = handle.bones[4];                        // armF1 — the forward forearm
      const gun = new pc.Entity('rifle');
      /* receiver · barrel · magazine · stock, in px along the bone (+y runs elbow → wrist).
       * ⛔ THE NUMBERS COME FROM `S9Skin.BIND`, NOT FROM EYE. armF1 runs [39,118.5,0] → [60,117,0],
       * i.e. the forearm is **21 px long** — so a part laid out at py 44 is TWICE the arm away
       * from the elbow, which put two floating black boxes beside the operative's head. Measured
       * off the screenshot, and the only reason it was findable is that this rig is drawn from a
       * table rather than authored. The hand is py 21; everything is placed relative to that. */
      const HAND = 21;
      const parts = [[0, HAND - 5, 0, 4.2, 20, 4.2],        // receiver, spanning the fist
                     [0, HAND + 11, 0, 2.6, 20, 2.6],       // barrel, out past the hand
                     [0, HAND - 3, 5.0, 3.4, 9, 3.4],       // magazine, hanging below the receiver
                     [0, HAND - 19, 0, 4.0, 13, 4.0]];      // stock, back toward the elbow
      for (const [px, py, pz, sx, sy, sz] of parts) {
        const e = new pc.Entity('p');
        const mi = new pc.MeshInstance(rifleMesh(), rifleMat(), e);
        mi.castShadow = true;
        e.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
        /* ⚠ The bone's local +y runs along the arm, so the barrel's LENGTH is the z extent here
         * and the piece has to be re-laid rather than just scaled — a box scaled on the wrong
         * axis is a plank across the operative's chest, which is how this reads when it is wrong. */
        e.setLocalPosition(px, py, pz); e.setLocalScale(sx, sy, sz);
        gun.addChild(e);
      }
      hand.addChild(gun);
      handle.gun = gun;
    }

    function bodyFor(bot) {
      if (!window.S9PCSkin || !window.S9Skin) return;
      const cast = S9Skin.CAST.map(c => c.arch);
      const arch = cast[bot.n % cast.length];
      const tint = TINTS[bot.n % TINTS.length];
      const free = parked[arch];
      if (free && free.length) { const h = free.pop(); h.entity.enabled = true;
        bot.body = h; bot.arch = arch; bot.name = S9Skin.nameFor(arch); return; }
      S9PCSkin.spawn(app, arch, { tint })
        .then(h => { armFor(h); if (bot.dropped) { park(arch, h); return; }
                     bot.body = h; bot.arch = arch; bot.name = S9Skin.nameFor(arch); })
        /* ⚠ and if the skinned path is not available this is the box rig, which `s9pc-skin.js`
         * argues for at length: ugly beats invisible in a firefight. */
        .catch(() => { if (bot.dropped) return;
          try { const h = S9PCSkin.spawnBox(app, tint); armFor(h);
                bot.body = h; bot.arch = 'box'; bot.name = 'OPERATIVE'; }
          catch (e) {} });
    }
    function park(arch, h) { h.entity.enabled = false;
      (parked[arch] || (parked[arch] = [])).push(h); }

    function makeBot(x, y, z) {
      const w = (Math.random() * WEAPONS.length) | 0;
      const b = { isMe: false, bot: true, team: 1, n: seq++, x, y, z, vx: 0, vy: 0, vz: 0,
        yaw: Math.random() * TAU, pitch: 0, onGround: false, speed: 0, alt: 0,
        hp: TUNE.hp, maxHp: TUNE.hp, armor: TUNE.botArmor, alive: true, deadT: 0, dropped: false,
        weapon: w, mag: WEAPONS[w].mag, reloading: false, reloadT: 0, fireT: 0, regenT: 0,
        state: 'patrol', stateT: 0, goal: null, lastSeen: null, supT: 0, think: 0,
        gait: 0, moving: false, sprinting: false, recoil: 0,
        body: null, arch: null, name: 'OPERATIVE' };
      bots.push(b); log.spawned++;
      bodyFor(b);
      return b;
    }

    function dropBot(b) {
      b.dropped = true;
      if (b.body) { b.body.entity.setLocalEulerAngles(0, 0, 0); park(b.arch, b.body); b.body = null; }
      const i = bots.indexOf(b); if (i >= 0) bots.splice(i, 1);
    }

    /* Put one somewhere it can stand, between spawnMin and spawnMax away, PREFERRING street level.
     * ⚠ `groundBelow` from high up will happily answer with a roof; a firefight that starts with
     * four operatives on four different rooftops is a sniper duel, not a street. */
    function placeBot(px, pz) {
      if (!collide) return null;
      let fallback = null;
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * TAU;
        const d = POP.spawnMin + Math.random() * (POP.spawnMax - POP.spawnMin);
        const x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d;
        const g = collide.groundBelow(x, z, 400, TUNE.r, 800);
        if (g == null) continue;
        if (collide.hits(x, g + 0.1, z, TUNE.r, TUNE.h)) continue;
        if (g < 3) return makeBot(x, g, z);
        if (!fallback) fallback = [x, g, z];
      }
      return fallback ? makeBot(fallback[0], fallback[1], fallback[2]) : null;
    }

    /* ⚑ COVER IS PICKED FROM THE CITY'S OWN BOXES, ON DEMAND. Section 9 bakes cover per map; a
     * generated 3.84 km city has no bake step and no fixed map, so the same idea has to become a
     * query. It SCORES rather than filters — a bot caught in the open still goes somewhere sane
     * instead of standing still because nothing was perfect. */
    function pickCover(b, tgt) {
      if (!collide || !collide.hits) return null;
      let best = null, bestS = -1e9;
      const near = collide.solidsNear ? collide.solidsNear(b.x, b.z) : null;
      if (!near) return null;
      for (let i = 0; i < near.length; i++) {
        const s = near[i];
        if (s.y1 - s.y0 < 1.0) continue;                       // a kerb hides nothing
        const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
        if (Math.hypot(cx - b.x, cz - b.z) > 26) continue;
        const pts = [[s.x0 - 0.7, cz], [s.x1 + 0.7, cz], [cx, s.z0 - 0.7], [cx, s.z1 + 0.7]];
        for (let j = 0; j < 4; j++) {
          const x = pts[j][0], z = pts[j][1];
          const g = collide.groundBelow(x, z, b.y + 2.2, TUNE.r, 2.5);
          if (g == null) continue;
          if (collide.hits(x, g + 0.1, z, TUNE.r, TUNE.h)) continue;
          // the point of cover is that the target CANNOT see you standing in it
          const blocked = !canSee(x, g + TUNE.eye, z, tgt.x, tgt.y + TUNE.eye, tgt.z);
          const d = Math.hypot(x - b.x, z - b.z);
          const score = (blocked ? 40 : 0) - d;
          if (score > bestS) { bestS = score; best = { x, z, y: g }; }
        }
      }
      return best;
    }

    function botFire(b, tgt, player) {
      const w = WEAPONS[b.weapon];
      if (b.reloading || b.fireT > 0) return;
      if (b.mag <= 0) { b.reloading = true; b.reloadT = w.reload / 1000; return; }
      b.mag--; b.fireT = w.rate / 1000; b.recoil = Math.min(1, b.recoil + 0.4); log.botShots++;
      const ox = b.x, oy = b.y + TUNE.eye, oz = b.z;
      let dx = tgt.x - ox, dy = (tgt.y + 1.0) - oy, dz = tgt.z - oz;
      const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
      for (let i = 0; i < w.pellets; i++) {
        /* ⛔ THE DIFFICULTY KNOB IS AIM, AND NOTHING ELSE — not dmg, not rate, not HP, not armour,
         * which is what keeps TTK arithmetically identical to Section 9's. Three terms, and the
         * first two are the ones that were missing when four bots took a full-health operative
         * down in the driven run:
         *   · DISTANCE. A fixed 0.03 cone is a marksman at 60 m. It widens with range, so the
         *     open ground this city has (and a 52 m arena does not) stops being a free kill.
         *   · SETTLE. A bot that has just acquired you shoots WIDE and tightens over ~1.2 s, so
         *     there is time to break contact — which is the whole point of the long TTK.
         *   · A MOVING TARGET IS HARDER, because otherwise standing still costs nothing. */
        const far = Math.min(1, L / 55);
        const settle = clamp(1 - (b.aimT || 0) / 1.2, 0, 1);
        const mover = tgt.isMe ? Math.min(1, (player && player.speed || 0) / 6) : 0;
        const cone = w.spread + 0.020 + far * 0.055 + settle * 0.070 + mover * 0.020;
        const d = spread(dx, dy, dz, cone);
        shoot(b, ox, oy, oz, d[0], d[1], d[2], w, player, false);
      }
    }

    function stepBot(b, dt, player) {
      const w = WEAPONS[b.weapon];
      if (b.fireT > 0) b.fireT -= dt;
      if (b.reloading) { b.reloadT -= dt; if (b.reloadT <= 0) { b.reloading = false; b.mag = w.mag; } }
      b.recoil = Math.max(0, b.recoil - dt * 3.2);
      b.supT = Math.max(0, b.supT - dt);
      b.regenT += dt;
      if (b.hp > 0 && b.regenT > TUNE.regenAfter && b.hp < b.maxHp * TUNE.regenTo)
        b.hp = Math.min(b.maxHp * TUNE.regenTo, b.hp + dt * TUNE.regenRate);

      /* ── who is it looking at? `candidates` is the ONLY source, so an animal is never here. */
      let tgt = null, tgtD = 1e9;
      const list = hostilesFor(b, player);
      for (let i = 0; i < list.length; i++) {
        const t = list[i]; if (t === b) continue;
        const d = Math.hypot(t.x - b.x, t.z - b.z);
        if (d < tgtD && d < 120) { tgt = t; tgtD = d; }
      }
      const los = tgt ? canSee(b.x, b.y + TUNE.eye, b.z, tgt.x, tgt.y + TUNE.eye, tgt.z) : false;
      if (los && tgt) b.lastSeen = { x: tgt.x, y: tgt.y, z: tgt.z };
      /* ⚑ HOW LONG IT HAS HAD EYES ON — the settle term `botFire` reads. Resets the moment contact
       * breaks, so ducking behind a van and stepping back out really does buy you the first shot. */
      b.aimT = (los && tgt) ? (b.aimT || 0) + dt : 0;

      b.think -= dt;
      if (b.think <= 0) {
        b.think = 0.5 + Math.random() * 0.7;
        /* Five ideas, in priority order, and the point is that two of them make a bot deliberately
         * NOT shoot at what it is looking at. A bot that only ever advances and fires is a target. */
        if (tgt && b.hp < b.maxHp * 0.42) { const c = pickCover(b, tgt); b.state = c ? 'cover' : 'engage'; b.goal = c; }
        else if (tgt && los && tgtD < w.range * 0.95) { b.state = 'engage'; b.goal = null; }
        /* ⛔ PUSH — and without it the squad WANDERS OFF. Measured: bots seeded 90 m out with no
         * line of sight fell straight through to `patrol` and walked 110 m in thirteen seconds,
         * in random directions, while the player stood in the street. `lastSeen` only exists once
         * somebody has been SEEN, so a hostile that has never had eyes on you has no reason to
         * come — which is correct for a sentry and wrong for a squad sent to find you. */
        else if (tgt) { b.state = 'push'; b.goal = { x: tgt.x, z: tgt.z }; }
        else if (b.lastSeen) { b.state = 'hunt'; b.goal = { x: b.lastSeen.x, z: b.lastSeen.z }; }
        else { b.state = 'patrol';
          const a = Math.random() * TAU, d = 18 + Math.random() * 34;
          b.goal = { x: b.x + Math.sin(a) * d, z: b.z + Math.cos(a) * d }; }
      }

      // ── steer
      let wx = 0, wz = 0, wish = 0;
      if (b.state === 'engage' && tgt) {
        // hold at a comfortable band for the weapon rather than walking into the muzzle
        const want = w.key === 'shotgun' ? 8 : w.key === 'sniper' ? 40 : 18;
        const err = tgtD - want;
        if (Math.abs(err) > 4) { const s = err > 0 ? 1 : -1;
          wx = (tgt.x - b.x) / (tgtD || 1) * s; wz = (tgt.z - b.z) / (tgtD || 1) * s; wish = 0.8; }
      } else if (b.goal) {
        const dx = b.goal.x - b.x, dz = b.goal.z - b.z, d = Math.hypot(dx, dz);
        if (d < 1.6) { b.goal = null; if (b.state === 'hunt') b.lastSeen = null; }
        else { wx = dx / d; wz = dz / d; wish = b.state === 'patrol' ? 0.55 : 1; }
      }
      /* ⚠ A PUSH GOAL GOES STALE THE MOMENT THE TARGET MOVES. Refreshing it every frame would be
       * a heat-seeker; refreshing it on the think tick (above) is a squad closing on where you
       * were a second ago, which is both fairer and what it looks like from the street. */
      b.sprinting = wish > 0.9 && b.state !== 'engage';
      b.moving = wish > 0.05;

      // face the target if there is one, otherwise face where you are going
      const faceX = tgt ? tgt.x - b.x : wx, faceZ = tgt ? tgt.z - b.z : wz;
      if (Math.abs(faceX) + Math.abs(faceZ) > 1e-4) {
        const want = Math.atan2(faceX, faceZ);
        b.yaw += clamp(wrapPi(want - b.yaw), -3.4 * dt, 3.4 * dt);
      }
      b.pitch = tgt ? clamp(Math.atan2((tgt.y + 1.0) - (b.y + TUNE.eye), tgtD || 1), -0.9, 0.9) : 0;

      // ── move, through the SAME resolve the player uses
      const onG = b.onGround;
      const top = b.sprinting ? BODY.sprint : BODY.run;
      const a = (onG ? BODY.accel : BODY.airAccel) * dt;
      if (wish > 1e-3) { b.vx += wx * a * wish; b.vz += wz * a * wish; }
      else if (onG) { const f = Math.max(0, 1 - BODY.friction * dt); b.vx *= f; b.vz *= f; }
      const sp = Math.hypot(b.vx, b.vz); if (sp > top) { const k = top / sp; b.vx *= k; b.vz *= k; }
      b.vy -= BODY.grav * dt;
      /* ⚠ A BOT THAT CANNOT STEP UP IS A BOT THAT STANDS AGAINST A KERB FOREVER. `moveBody` gives
       * step-up for free, but only if it is actually the thing being called — which is the whole
       * reason it was lifted out of `stepGround` rather than copied. */
      if (moveBody) moveBody(b, dt, BODY, false);
      else { b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt; }
      b.gait = (b.gait || 0) + (b.moving ? (b.sprinting ? 9 : 6) * dt : 0);

      if (tgt && los && b.state === 'engage' && tgtD < w.range) botFire(b, tgt, player);

      // ── the visible body
      if (b.body) b.body.setPose({ x: b.x, y: b.y, z: b.z, yaw: b.yaw, h: TUNE.h,
        onGround: b.onGround, sprinting: b.sprinting, moving: b.moving,
        gait: b.gait, pitch: b.pitch, recoil: b.recoil });
    }

    // ── the frame ────────────────────────────────────────────────────────────────────────────
    function step(dt, player) {
      // ── the player's own weapon clock. It ticks whatever mode you are in, because a reload
      //    that pauses when you look away is a reload you can game.
      if (me.fireT > 0) me.fireT -= dt;
      if (me.reloading) { me.reloadT -= dt; if (me.reloadT <= 0) {
        me.reloading = false; me.mag = WEAPONS[me.weapon].mag; } }
      me.recoil = Math.max(0, me.recoil - dt * 3.4);
      me.kick = Math.max(0, me.kick - dt * 6);
      me.hitmark = Math.max(0, me.hitmark - dt);
      me.dmgFlash = Math.max(0, me.dmgFlash - dt * 1.6);
      me.nearMiss = Math.max(0, me.nearMiss - dt * 3);

      if (!me.alive) { me.downT -= dt; if (me.downT <= 0) revive(); }
      else {
        me.regenT += dt;
        /* Out-of-combat regen to 62% of max. The other half of the longer TTK: a fight you can
         * survive is only interesting if walking away from one is a real option. */
        if (me.regenT > TUNE.regenAfter && me.hp < TUNE.hp * TUNE.regenTo)
          me.hp = Math.min(TUNE.hp * TUNE.regenTo, me.hp + dt * TUNE.regenRate);
      }

      /* ⚠ …AND NOT WHILE DRIVING. `armed` gates the viewmodel AND the trigger, and both are wrong
       * at the wheel: nobody holds a rifle in front of their face to steer, and a drive-by is a
       * feature rather than a side effect of forgetting to ask. Caught by looking at the frame —
       * the chase camera was correct and the gun was still there in front of it. */
      const armed = !!(player && player.armed && player.mode === 'operative' && !player.driving);
      /* ⚠ Aiming COLLAPSES when you cannot aim — down, driving, or out of the mode — rather than
       * being left latched at whatever it was. A weapon state that survives its own mode is the
       * HUD-survives-its-mode bug with a fov attached. */
      const canAds = armed && me.alive && !me.reloading;
      me.ads += ((canAds && wantAds ? 1 : 0) - me.ads) * Math.min(1, dt * 11);
      if (camEnt && camEnt.camera) {
        const w = WEAPONS[me.weapon];
        const want = BASE_FOV / (1 + (Math.max(1, w.zoom) - 1) * me.ads);
        camEnt.camera.fov += (want - camEnt.camera.fov) * Math.min(1, dt * 11);
      }
      if (armed && !view) buildView(camEnt);
      stepView(dt, player || { yaw: 0, speed: 0 }, armed);
      if (armed && trigger && me.alive) {
        const w = WEAPONS[me.weapon];
        if (w.auto || !me._held) fireOnce(player);
        me._held = true;
      }
      if (!trigger) me._held = false;

      // ── population. Bots exist only while somebody in the city can be shot at.
      popT -= dt;
      if (player && popT <= 0) {
        popT = POP.every;
        for (let i = bots.length - 1; i >= 0; i--) {
          const b = bots[i];
          const d = Math.hypot(b.x - player.x, b.z - player.z);
          if (!b.alive && b.deadT > 6) dropBot(b);
          else if (d > POP.despawn) dropBot(b);
        }
        /* ⚑ THEY ONLY TURN UP FOR A MODE THAT CAN ANSWER THEM. Spawning a firefight around a bird
         * would be exactly the tone failure the observer rule exists to prevent — the animal would
         * be walking through somebody else's war unable to participate or be hurt, which is worse
         * than either being shot at or being left alone. */
        if (armed) { let alive = 0;
          for (let i = 0; i < bots.length; i++) if (bots[i].alive) alive++;
          if (alive < POP.want) placeBot(player.x, player.z); }
      }

      for (let i = 0; i < bots.length; i++) { const b = bots[i];
        if (b.alive) stepBot(b, dt, player);
        else { b.deadT += dt;
          /* fall where you were hit and stay there for a few seconds. ⚠ NOT a ragdoll and not an
           * instant vanish: a body that blinks out removes the only evidence a fight happened. */
          if (b.body) { const t = Math.min(1, b.deadT * 3.4);
            b.body.setPose({ x: b.x, y: b.y, z: b.z, yaw: b.yaw, h: TUNE.h * (1 - t * 0.55),
              onGround: true, sprinting: false, moving: false, gait: 0, pitch: -0.9 * t, recoil: 0 });
            if (b.body.entity) b.body.entity.setLocalEulerAngles(t * 84, b.yaw * 180 / Math.PI, 0); } }
      }

      stepFx(dt, player);
    }

    function stepFx(dt, player) {
      for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.p += TUNE.tracerSpeed * dt;
        if (t.p >= t.len + 3) { if (t.e) t.e.enabled = false; tracers.splice(i, 1); continue; }
        if (!t.e) { t.e = take('tracer', t.mine ? matTracer : matTheirs); if (!t.e) { tracers.splice(i, 1); continue; }
          t.e.render.meshInstances[0].material = t.mine ? matTracer : matTheirs; }
        const tail = 3.4, a = Math.max(0, t.p - tail), b = Math.min(t.len, t.p);
        if (b <= a) { t.e.enabled = false; continue; }
        t.e.enabled = true;
        const mx = t.x + t.dx * (a + b) / 2, my = t.y + t.dy * (a + b) / 2, mz = t.z + t.dz * (a + b) / 2;
        t.e.setLocalPosition(mx, my, mz);
        t.e.setLocalScale(0.035, 0.035, b - a);
        t.e.lookAt(mx + t.dx, my + t.dy, mz + t.dz);
        /* ⚑ A ROUND THAT GOES PAST YOUR EAR IS INFORMATION. ⚠ Clamped to the SEGMENT, or a round
         * that stopped in a wall behind you cracks after it has already landed. */
        if (player && !t.mine && me.alive) {
          const px = player.x - t.x, py = (player.y + TUNE.eye) - t.y, pz = player.z - t.z;
          let s = px * t.dx + py * t.dy + pz * t.dz;
          s = clamp(s, 0, Math.min(t.len, t.p));
          const qx = px - t.dx * s, qy = py - t.dy * s, qz = pz - t.dz * s;
          if (Math.hypot(qx, qy, qz) < TUNE.nearMiss && t.p >= s && t.p - TUNE.tracerSpeed * dt < s)
            me.nearMiss = 1;
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i];
        s.t -= dt; if (s.t <= 0) { s.e.enabled = false; sparks.splice(i, 1); continue; }
        const k = s.t / 0.13; s.e.setLocalScale(0.16 * k, 0.16 * k, 0.16 * k); }
    }

    function revive() {
      me.alive = true; me.hp = TUNE.hp; me.armor = TUNE.armor; me.regenT = 0;
      me.mag = WEAPONS[me.weapon].mag; me.reloading = false; me.reloadT = 0;
      /* ⚠ AND THE FIGHT HAS TO ACTUALLY BE OVER. Coming back with four operatives still standing
       * where they killed you is a death loop, and this is a mellow game with a shooter in it —
       * not the other way round. The street is cleared and repopulates from scratch. */
      for (let i = bots.length - 1; i >= 0; i--) dropBot(bots[i]);
      popT = 2.5;
    }

    function clear() { for (let i = bots.length - 1; i >= 0; i--) dropBot(bots[i]);
      for (let i = tracers.length - 1; i >= 0; i--) { if (tracers[i].e) tracers[i].e.enabled = false; }
      tracers.length = 0; }

    return {
      step, BODY, WEAPONS, TUNE,
      setTrigger(v) { trigger = !!v; },
      setAds(v) { wantAds = !!v; },
      get ads() { return me.ads; },
      get trigger() { return trigger; },
      fire(player) { return fireOnce(player); },
      reload: startReload, switchWeapon, cycleWeapon,
      clear, revive,
      get me() { return me; },
      get bots() { return bots; },
      get weapon() { return WEAPONS[me.weapon]; },
      /* ⛔ THE OBSERVER RULE, EXPOSED SO A TEST CAN ASSERT IT RATHER THAN A COMMENT CLAIM IT.
       * Returns what every bot in the street is currently allowed to shoot at. */
      targets(player) { return candidates(player).map(t => t.isMe ? 'player' : ('bot#' + t.n)); },
      get hud() {
        const w = WEAPONS[me.weapon];
        let alive = 0; for (let i = 0; i < bots.length; i++) if (bots[i].alive) alive++;
        return { hp: Math.max(0, Math.round(me.hp)), maxHp: TUNE.hp, armor: Math.max(0, Math.round(me.armor)),
          weapon: w.name, mag: me.mag, magSize: w.mag, reloading: me.reloading,
          alive: me.alive, down: me.alive ? 0 : +me.downT.toFixed(1),
          kills: me.kills, deaths: me.deaths, bots: alive, hitmark: me.hitmark > 0 };
      },
      get counts() { return { bots: bots.length, tracers: tracers.length, shots: log.shots,
        hits: log.hits, heads: log.heads, kills: log.kills, downs: log.downs,
        spawned: log.spawned, botShots: log.botShots,
        bodied: bots.filter(b => !!b.body).length }; },
      /* headless only — a driver should not have to wait 90 s of streaming for a firefight */
      _spawnAt(x, y, z) { return makeBot(x, y, z); },
      _seed(px, pz, n) { const out = []; for (let i = 0; i < (n || POP.want); i++) {
        const b = placeBot(px, pz); if (b) out.push(b); } return out; },
    };
  }

  return { create, WEAPONS, TUNE };
})();

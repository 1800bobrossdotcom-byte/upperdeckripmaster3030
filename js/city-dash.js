/* ripmaster3030studios — THE DASH.  `CityDash`
 *
 *   CityDash.create({ world, seed })    -> ctrl | null      lay a course through the city
 *   ctrl.step(dt, me)                   -> event | null     advance the clock, test the gates
 *   ctrl.hud()                          -> {…}              what the readout should say
 *   ctrl.reset()                        -> void             back to the start line
 *   ctrl.probe()                        -> {…}              for the harness
 *
 * Artist, 2026-08-05: *"lets create a snappy squirrel racing game that is like sonic the hedgehog,
 * but very fast, motion blur, speed run game - overhead shoulder cam like in the city. simple and
 * fun."*
 *
 * ══ WHY THIS IS A MODE OF THE CITY AND NOT A FIFTH CABINET ═════════════════════════════════
 *
 * ⛔ THE ARCADE WAS COMPRESSED TO FOUR ON PURPOSE — artist directive, 2026-08-03: *"we compress
 *   our games to 4 games total."* A fifth tile would reverse a decision that is three days old,
 *   and `npm run test:reach` asserts the count. Everything this game needs already exists inside
 *   THE CITY and belongs to the squirrel that is already in it: the body, the climb, the collision
 *   set, the streamed 3.84 km world, the over-the-shoulder chase camera the artist explicitly
 *   asked for ("like in the city"). Rebuilding any of that beside it would give the studio two
 *   squirrels to keep in sync, and the one that drifts is always the one nobody is looking at.
 *
 * ══ THE MECHANIC — DESIGN-SYSTEM §4, AND IT IS THE WHOLE GAME ══════════════════════════════
 *
 * ⚑ **SPEED IS THE LIFT.** Sonic is not "a fast character"; it is a game where SPEED IS THE ROUTE
 *   — go fast enough and the level carries you along a line slow play cannot reach. This city
 *   already has a high line (the roofs) and a slow way onto it (the squirrel's climb, which is a
 *   deliberate 0.62·run crawl up a wall). So the fast line is the SAME geometry taken at speed:
 *   hit a wall above `VAULT_SPD` and you go up and OVER it carrying your momentum; hit it slow
 *   and you are back to grinding. Nothing is authored, no ramps are placed, and every box in the
 *   city is a vault by construction — the same 1:1 guarantee the generator already makes about
 *   landing and climbing, true only because the geometry and the collision set are one thing.
 * ⚑ That makes the risk real without adding a fail state: **losing speed does not kill you, it
 *   drops you to the slow route**, which is exactly Sonic's punishment and exactly this studio's
 *   anti-casino position — you lose time, never a thing you own.
 *
 * ⚠ THE COURSE IS LAID ON THE STREET GRID, NOT SPRINKLED. `CityWorld` draws roads at a known
 *   spacing and `riverZ(x)` is a pure function of x, so a gate can be placed where a runner can
 *   actually reach it and never in the water. Scattering gates by seed alone produces a course
 *   with a leg through a river and a leg through the middle of a tower, and a course you cannot
 *   finish reads as a broken game rather than a hard one.
 *
 * ⚠ SEEDED AND PURE. Same seed ⇒ same course, so a time means something and two people can race
 *   the same line. `Math.random` appears nowhere in this file.
 */
window.CityDash = (function () {
  'use strict';

  /* ── the numbers, and every one of them is a feel decision ──────────────────────────────── */
  var GATE_R      = 5.2;    // how near counts as through it. Generous: this is a speed game, not
                            // a precision game, and a gate you can miss at 30 m/s is a gate that
                            // punishes the thing the game is asking you to do.
  var LEGS        = 8;      // gates in a lap
  var LEG_MIN     = 130;    // metres between gates — long enough to actually build speed
  var LEG_MAX     = 260;
  var START_PAD   = 40;

  function rng(seed) {
    var s = (seed >>> 0) || 3030;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ⚑ SNAP TO THE GRID THE CITY ACTUALLY DREW. CityWorld lays its roads on a fixed spacing; a
   * gate on that line is a gate on tarmac with a clear run at it. Off the line it is a gate
   * inside somebody's third floor. */
  function snapToRoad(v, spacing) { return Math.round(v / spacing) * spacing; }

  function create(o) {
    o = o || {};
    var W = o.world || window.CityWorld;
    if (!W) return null;                                  // fails open — no course, city unchanged

    var seed = (o.seed >>> 0) || 3030;
    var R = rng(seed);
    /* ⛔ READ THE WORLD'S OWN NUMBERS, AND READ THE RIGHT ONES. The first cut of this invented
     * `W.HALF` and `W.ROAD_SPACING`; neither exists, so both fell through to hard-coded guesses
     * and NOTHING WOULD HAVE ERRORED — the course would simply have been laid on a grid the city
     * does not have. `ROAD` is the street WIDTH (16 m), not the spacing: `city-world.js` centres
     * every street ON THE CHUNK BOUNDARY, so the street grid repeats every CHUNK (120 m) and
     * snapping to 40 puts two gates in three inside somebody's building.
     * ⚠ Same shape as the recorded renderer-address rule — always read it, never trust a name you
     *   remember. Asserted in probe() as `offGrid`, which must be 0. */
    var HALF = (typeof W.EXTENT === 'number') ? W.EXTENT : 1920;
    var SPACING = (typeof W.CHUNK === 'number') ? W.CHUNK : 120;

    /* ── lay the course ──────────────────────────────────────────────────────────────────── */
    var gates = [], gx = 0, gz = 0, heading = R() * Math.PI * 2;
    var inRiver = (typeof W.inRiver === 'function') ? W.inRiver : function () { return false; };

    for (var i = 0; i < LEGS; i++) {
      var placed = false;
      /* ⚠ BOUNDED RETRIES, AND THE FALLBACK IS NAMED. An unbounded "keep trying until it fits"
       * loop in a generator is how a page hangs on one unlucky seed. After 24 attempts the leg
       * is taken straight ahead and clamped — a slightly worse gate beats a frozen tab. */
      for (var t = 0; t < 24 && !placed; t++) {
        var turn = (R() - 0.5) * 1.9;                     // wander, but never double back
        var dist = LEG_MIN + R() * (LEG_MAX - LEG_MIN);
        var h = heading + turn;
        var nx = gx + Math.sin(h) * dist, nz = gz + Math.cos(h) * dist;
        nx = snapToRoad(nx, SPACING); nz = snapToRoad(nz, SPACING);
        if (Math.abs(nx) > HALF - 120 || Math.abs(nz) > HALF - 120) continue;
        if (inRiver(nx, nz)) continue;                    // ⚠ never a gate in the water
        gx = nx; gz = nz; heading = h; placed = true;
      }
      if (!placed) {
        gx = Math.max(-HALF + 120, Math.min(HALF - 120, gx + Math.sin(heading) * LEG_MIN));
        gz = Math.max(-HALF + 120, Math.min(HALF - 120, gz + Math.cos(heading) * LEG_MIN));
      }
      gates.push({ x: gx, z: gz, n: i + 1 });
    }

    var start = { x: gates[0].x - Math.sin(heading) * START_PAD,
                  z: gates[0].z - Math.cos(heading) * START_PAD };

    /* ── state ───────────────────────────────────────────────────────────────────────────── */
    var S = {
      running: false, done: false, t: 0, next: 0,
      best: null, splits: [], topSpeed: 0, vaults: 0, lastGateT: 0,
    };
    var KEY = 'urm_dash_best_' + seed;
    try { var b = parseFloat(localStorage.getItem(KEY)); if (isFinite(b) && b > 0) S.best = b; } catch (e) {}

    function reset() {
      S.running = false; S.done = false; S.t = 0; S.next = 0;
      S.splits = []; S.topSpeed = 0; S.vaults = 0; S.lastGateT = 0;
    }

    /* ⚑ THE CLOCK STARTS WHEN YOU MOVE, NOT WHEN THE PAGE LOADS. A speed-run timer that is
     * already running while you read the HUD is a timer nobody trusts, and the first thing any
     * runner does is reload to get a clean one. */
    function step(dt, me) {
      if (!me || S.done) return null;
      var sp = Math.hypot(me.vx || 0, me.vz || 0);
      if (!S.running) {
        if (sp < 0.5) return null;
        S.running = true;
      }
      S.t += dt;
      if (sp > S.topSpeed) S.topSpeed = sp;

      var g = gates[S.next];
      if (!g) return null;
      var dx = me.x - g.x, dz = me.z - g.z;
      /* ⛔ HORIZONTAL DISTANCE ONLY — no y term. The whole point of the vault is that the fast
       * line goes over the roofs, so a gate that also demanded a height would punish exactly the
       * play the game is built to reward. A gate is a vertical column, not a hoop. */
      if (dx * dx + dz * dz > GATE_R * GATE_R) return null;

      var split = S.t - S.lastGateT;
      S.lastGateT = S.t;
      S.splits.push(split);
      S.next++;

      if (S.next >= gates.length) {
        S.done = true; S.running = false;
        var improved = (S.best === null || S.t < S.best);
        if (improved) { S.best = S.t; try { localStorage.setItem(KEY, String(S.t)); } catch (e) {} }
        return { kind: 'finish', time: S.t, best: S.best, improved: improved,
                 topSpeed: S.topSpeed, vaults: S.vaults };
      }
      return { kind: 'gate', n: S.next, of: gates.length, split: split, t: S.t };
    }

    function nextGate() { return gates[S.next] || null; }

    function hud() {
      var g = nextGate();
      return {
        running: S.running, done: S.done,
        t: S.t, best: S.best,
        gate: S.next, of: gates.length,
        topSpeed: S.topSpeed, vaults: S.vaults,
        next: g ? { x: g.x, z: g.z } : null,
      };
    }

    return {
      gates: gates,
      start: start,
      step: step,
      hud: hud,
      reset: reset,
      nextGate: nextGate,
      countVault: function () { S.vaults++; },
      probe: function () {
        return { seed: seed, gates: gates.length, t: S.t, next: S.next, done: S.done,
                 best: S.best, topSpeed: S.topSpeed, vaults: S.vaults,
                 legs: gates.map(function (g, i) {
                   var p = i ? gates[i - 1] : start;
                   return Math.round(Math.hypot(g.x - p.x, g.z - p.z));
                 }),
                 inWater: gates.filter(function (g) {
                   return (typeof W.inRiver === 'function') && W.inRiver(g.x, g.z); }).length,
                 /* every gate must sit on the street grid the city actually drew */
                 offGrid: gates.filter(function (g) {
                   return (g.x % SPACING !== 0) || (g.z % SPACING !== 0); }).length,
                 outside: gates.filter(function (g) {
                   return Math.abs(g.x) > HALF || Math.abs(g.z) > HALF; }).length,
                 spacing: SPACING, half: HALF };
      },
    };
  }

  return { create: create, GATE_R: GATE_R, LEGS: LEGS };
})();

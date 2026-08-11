/* THE LIGHT — the STEEL. What a sword does that a pointer does not (BladeSteel).
 *
 * Artist, 2026-08-11, on the first build: "the game is rough bones, but nowhere near real blade
 * physics, motion blur etc, a LOT of work to do." He is right, and this is the half that was
 * missing underneath everything else.
 *
 * ⛔ THE FIRST BUILD SET THE BLADE'S ANGLE DIRECTLY FROM THE FINGER, AND THAT IS THE WHOLE
 *    PROBLEM. `roll = rollFor(aim)` every frame means the blade IS the cursor: it arrives the
 *    instant your thumb does, it stops dead when your thumb stops, and it weighs nothing. Every
 *    property that makes a sword read as a sword is a property of the gap between the hand and
 *    the tip, and there was no gap.
 *
 * ⚑ SO THE HAND AND THE BLADE ARE TWO DIFFERENT ANGLES, AND THE PICTURE IS THE DIFFERENCE.
 *      finger  →  the line you drew. An instruction, not a position.
 *      hand    →  a wrist. It tracks the finger fast but has a top speed; it cannot teleport.
 *      blade   →  a mass on a torsional spring hanging off the hand. It LAGS going out and
 *                 OVERSHOOTS coming back, because that is what a metre of steel does.
 *    That single split gives, for free and without a single tuned special case:
 *      · tip lag — the blade trails the wrist while you are moving
 *      · follow-through — it keeps going after you stop, then rings down
 *      · weight — a fast input produces a BIGGER lag than a slow one, so heavy feels heavy
 *      · a real path to smear — the tip's arc is a thing that happened, not a decoration
 *
 * ⚠ DESIGN-SYSTEM §4 is the standard being answered here: "what MOVES and why it physically
 *   moved". §9 records what happens when that is answered with a light vector instead of a
 *   mechanism — a beautiful object that is dead to the touch, twice. The wordmark rig (test:rig)
 *   is the precedent that worked: springs, coupling, measured overshoot.
 *
 * PURE — no DOM, no engine, no clock of its own. `npm run test:blade` §E drives it under node, so
 * every claim in this header is a number in that suite and not a feeling.
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;

  /* Shortest signed way round from `a` to `b`, in (−π, π]. ⚠ THE WHOLE RIG IS WRONG WITHOUT THIS.
   * A raw `b − a` sends the blade the long way round whenever a cut crosses the ±π seam, so a
   * perfectly ordinary horizontal slash occasionally whips the sword through a full circle. THE
   * CITY's world boundary paid for the same lesson in the other direction (a dead spot at π). */
  function wrap(d) {
    d = (d + Math.PI) % TAU;
    if (d < 0) d += TAU;
    return d - Math.PI;
  }
  const delta = (a, b) => wrap(b - a);

  // ── the numbers. Each is a physical claim, and §E measures the claim. ────────────────────────
  const HAND_RATE = 15.0;    // rad/s — a wrist's top speed. Not infinite; that was the bug.
  const HAND_K = 22.0;       // how hard the wrist chases the finger (rad/s per rad of error)
  /* ⛔ STIFFNESS SETS THE LAG, DAMPING SETS THE FOLLOW-THROUGH, AND THE FIRST PASS CONFLATED
   * THEM. Swept as two axes rather than one:
   *      spring  damp   zeta | peak lag  overshoot  agrees<5deg  still
   *         165  15.5   0.60 |   56.2d      5.66d       0.267s   0.892s   floppy — a wet noodle
   *         900    34   0.57 |   29.7d      1.53d       0.158s   0.308s
   *        1400    24   0.32 |   18.7d      8.63d       0.117s   0.392s   <- taken
   *        2000    28   0.31 |   14.3d      0.59d       0.117s   0.325s   dead — no follow-through
   * ⚑ THE 56 DEGREES OF THE FIRST BUILD WERE NOT MERELY UGLY, THEY WERE DISHONEST. The RULE scores
   *   the line your FINGER drew; the thing you watch is the BLADE. Let those diverge by 56 degrees
   *   and the game is telling you one story and scoring another — a player cutting correctly sees
   *   a sword pointing somewhere else. Under 20 degrees, and agreeing with the drawn line inside
   *   0.12 s, the lag reads as weight and never as a lie.
   * ⚠ AND STIFFENING PAST ~1400 BUYS PRECISION BY DELETING THE THING THAT MAKES IT STEEL: at
   *   2000/28 the overshoot is 0.59 degrees, i.e. invisible. Precision and follow-through pull
   *   against each other and the numbers are where the argument gets settled, not the eye. */
  const SPRING = 1400.0;     // torsional stiffness of the blade about the grip
  const DAMP = 24.0;         // zeta ~= 0.32 — underdamped on purpose, so it follows through
  const SWING_TORQUE = 34.0; // the impulse a committed cut puts through the wrist
  const MAX_VEL = 42.0;      // rad/s ceiling, so a frame spike cannot fling the blade
  const REACH = 0.19;        // metres the hand travels along the cut and back
  /* ⛔ THE SMEAR IS BOUNDED BY TIME, NOT BY SAMPLE COUNT, AND THE FIRST VERSION WAS NOT. Keeping
   * "the last 14 samples" makes the trail's LENGTH a function of the frame rate: at 120 fps that
   * is 0.12 s of arc, at 30 fps it is 0.47 s — and at a cut's peak of ~1700 deg/s the slow machine
   * draws a 200-degree fan across the whole screen while the fast one draws a tasteful streak.
   * ⚑ A shutter is a DURATION. `TRAIL_S` is that duration, `TRAIL_MAX` is only a memory bound, and
   *   the picture is now the same on every device — which is the whole point of a physical model. */
  const TRAIL_S = 0.055;     // seconds of edge path the smear holds — the shutter
  const TRAIL_MAX = 24;      // hard cap, so a 500 fps machine cannot grow the buffer without end

  function create(opts) {
    const o = opts || {};
    const S = {
      finger: o.aim == null ? -Math.PI / 2 : o.aim,   // the line last drawn
      hand: o.aim == null ? -Math.PI / 2 : o.aim,     // the wrist
      blade: o.aim == null ? -Math.PI / 2 : o.aim,    // the steel
      vel: 0,                                          // blade angular velocity, rad/s
      handVel: 0,
      lag: 0,                                          // blade − hand, the thing you can SEE
      reach: 0,                                        // 0..1 along the thrust
      cut: 0,                                          // 1 at the instant of a cut, decays
      trail: [],                                       // [{ang, reach, age}] newest last
      t: 0,
    };

    /* A COMMITTED CUT IS A TORQUE, NOT A KEYFRAME. The old build lerped the roll from
     * `aim − 0.55` to `aim + 0.55` over a fixed 0.16 s, which is an animation: identical every
     * time, unaffected by where the blade already was, and impossible to interrupt. An impulse
     * composes with whatever the blade is already doing — cut twice quickly and the second one
     * inherits the first one's momentum, which is what a real second cut does. */
    function swing(dir, power) {
      const p = power == null ? 1 : power;
      S.vel += SWING_TORQUE * (dir < 0 ? -1 : 1) * p;
      if (S.vel > MAX_VEL) S.vel = MAX_VEL;
      if (S.vel < -MAX_VEL) S.vel = -MAX_VEL;
      S.cut = 1;
      S.reach = 0.001;                                  // the thrust begins; step() carries it
    }

    /* aim the wrist. The blade is NOT told; it finds out through the spring. */
    function point(a) { if (a != null && isFinite(a)) S.finger = a; }

    function step(dt) {
      if (!(dt > 0)) return S;
      if (dt > 0.05) dt = 0.05;                         // a tab that was backgrounded must not fling it
      S.t += dt;

      // ── the wrist: chases the finger, capped. ────────────────────────────────────────────────
      const want = delta(S.hand, S.finger) * HAND_K;
      const rate = want > HAND_RATE ? HAND_RATE : (want < -HAND_RATE ? -HAND_RATE : want);
      S.handVel = rate;
      S.hand = wrap(S.hand + rate * dt);

      // ── the steel: a damped torsional spring hanging off the wrist. ──────────────────────────
      const err = delta(S.blade, S.hand);
      S.vel += (err * SPRING - S.vel * DAMP) * dt;
      if (S.vel > MAX_VEL) S.vel = MAX_VEL;
      if (S.vel < -MAX_VEL) S.vel = -MAX_VEL;
      S.blade = wrap(S.blade + S.vel * dt);
      S.lag = delta(S.hand, S.blade);

      // ── the thrust. A cut has REACH — it goes somewhere and comes back. ──────────────────────
      if (S.cut > 0) {
        S.cut = Math.max(0, S.cut - dt / 0.30);
        S.reach = Math.sin((1 - S.cut) * Math.PI);
      } else S.reach = 0;

      // ── the edge's path, for the smear. It records where the blade WAS, which is the only
      //    honest source for a trail: a smear drawn from the current angle is a decoration. ─────
      S.trail.push({ ang: S.blade, reach: S.reach, age: 0 });
      for (const p of S.trail) p.age += dt;
      /* ⛔ `length > 2`, NOT `length`, AND THE DIFFERENCE WAS A ZERO AT 30 fps. Ageing every sample
       * and then dropping everything older than the shutter empties the buffer down to ONE entry
       * whenever `dt > TRAIL_S / 2` — one point is not a path, so the smear vanished entirely on
       * exactly the machines that need it most. Measured before the fix: 33.5 deg at 240 fps,
       * 27.1 at 120, 19.4 at 60, and 0.0 at 30. Two samples are always kept. */
      while (S.trail.length > 2 && S.trail[0].age > TRAIL_S) S.trail.shift();
      while (S.trail.length > TRAIL_MAX) S.trail.shift();

      return S;
    }

    /* ⛔ THE SMEAR IS SAMPLED FROM AN INTERPOLATED PATH, NOT FROM THE RAW BUFFER, AND THAT IS WHAT
     * MAKES IT THE SAME PICTURE ON EVERY DEVICE. A shutter is a DURATION; a frame buffer is
     * whatever the machine managed. Reading the raw samples ties both the arc AND the polygon
     * count to the frame rate, which is how the first version produced a 200-degree fan on a slow
     * machine and a tasteful streak on a fast one — from identical physics.
     * `path(u)` takes u in 0..1 (0 = oldest end of the shutter, 1 = now) and interpolates between
     * whichever raw samples bracket it, so the view can ask for a fixed number of segments across
     * a fixed slice of time and get the same ribbon at 30 fps as at 240.
     * ⚠ It clamps to what was actually simulated. If the machine only stepped 0.033 s, the smear
     *   covers 0.033 s — extrapolating past the oldest sample would be inventing motion that never
     *   happened, which is worse than a shorter streak. */
    function window_() {
      const tr = S.trail;
      if (tr.length < 2) return 0;
      return Math.min(TRAIL_S, tr[0].age);
    }
    function path(u) {
      const tr = S.trail;
      if (tr.length < 2) return null;
      const w = window_();
      if (w <= 0) return null;
      const want = w * (1 - (u < 0 ? 0 : u > 1 ? 1 : u));   // seconds ago
      let a = tr[0], b = tr[tr.length - 1];
      for (let i = 0; i < tr.length - 1; i++) {
        if (tr[i].age >= want && tr[i + 1].age <= want) { a = tr[i]; b = tr[i + 1]; break; }
      }
      const span = a.age - b.age;
      const k = span > 1e-6 ? (a.age - want) / span : 1;
      return { ang: a.ang + delta(a.ang, b.ang) * k, reach: a.reach + (b.reach - a.reach) * k };
    }

    /* how fast the EDGE is travelling, in metres/second at the tip — the number a motion blur and
     * a trail opacity should both read, so they can never disagree about how hard you swung. */
    function tipSpeed(len) { return Math.abs(S.vel) * (len == null ? 1 : len); }

    /* ⚠ AT REST, EVERYTHING IS EXACTLY ZERO — asserted, not hoped. The hero card and the wordmark
     * rig both carry this same assertion for the same reason: a rig that idles is a rig that is
     * animating on its own, and DESIGN-SYSTEM's acceptance for both was "dead still until you
     * touch it". `settled()` is what the trail reads to know it should not draw. */
    function settled() { return Math.abs(S.vel) < 1e-4 && Math.abs(S.lag) < 1e-4 && S.reach === 0; }

    return {
      get state() { return S; },
      step, swing, point, tipSpeed, settled, path, shutter: window_,
      get blade() { return S.blade; },
      get hand() { return S.hand; },
      get lag() { return S.lag; },
      get reach() { return S.reach; },
      get trail() { return S.trail; },
    };
  }

  const API = { create, wrap, delta,
    HAND_RATE, HAND_K, SPRING, DAMP, SWING_TORQUE, MAX_VEL, REACH, TRAIL_S, TRAIL_MAX };
  root.BladeSteel = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

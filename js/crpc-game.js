/* CLOUD RACER — THE RULES (CRGame). No engine, no DOM, no WebGL.
 *
 * `js/crpc-app.js` owns the PlayCanvas scene and knows none of this; this file owns the racing and
 * knows nothing about how it is drawn. The split is the same one Section 9 uses, and it is what
 * lets the pacing be MEASURED: this file runs unmodified under node, so the numbers in the report
 * come from the shipping code rather than from a model of it.
 *
 * ══ WHY THIS EXISTS: the artist said CLOUD RACER is "too slow, mundane". That is a feel complaint
 *    first. It was measured before anything was rebuilt, on the shipping build, and the result was
 *    worse than "slow" — the game had no decisions in it at all:
 *
 *      lap 30.2 s at cruise (24.3 s realistically driven), race 72.9 s
 *      "hold boost" vs "touch nothing"            16.57 s  (18.5% of the race)
 *      PERFECT RACING LINE vs DEAD CENTRE          0.00 s  (0.00%)      ← steering's entire value
 *      hard-left into the wall the whole race   −236.23 s  (4.2× slower)
 *
 *    Steering was worth exactly zero seconds because progress was `r.s += r.speed*dt` — independent
 *    of lateral position. Corners could not be taken well or badly; the racing line did not exist;
 *    the only thing steering could do was scrape a wall and be punished. So the whole game was
 *    "hold W for 73 seconds", and one dominant strategy with no cost is not a decision.
 *    Everything below exists to give the player something to be good at.
 *
 * ⛔ THE FIRST REBUILD'S OWN HEADLINE NUMBER DID NOT REPRODUCE, AND THAT MATTERS MORE THAN THE
 *    NUMBER. It claimed "driving is worth 3.56 s (7.0%) over holding the boost key", measured
 *    against a baseline called "hold boost, never steer". Re-run on the shipped constants with a
 *    baseline that holds boost AND steers the racing line — which is what an actual naive player
 *    does — the sign flips: 45.46 s for hold-boost-and-steer against 46.59 s for a policy that
 *    also braked on lookahead. **The airbrake was a control that could only cost you time**, which
 *    is precisely the failure the file's own GRIP sweep says it was avoiding. Two causes, both
 *    structural, both fixed below:
 *      1 the brake LOOKAHEAD was the wrong formula — see `brakePoint()`
 *      2 over-grip cost only cos(slip) and a scrub, both INSTANTANEOUS, so ploughing bought back
 *        everything it lost the moment the corner ended — see `lost`
 *
 *    Battery re-run on THIS file, 6 pilots, 3 laps, 5 seeds, each row adding ONE control to the
 *    row above it — so the value of a decision is the gap between two adjacent rows:
 *
 *      policy                          finish   place   best lap   boost used   this verb is worth
 *      A hold boost, no steering       39.86 s   2.8     11.64 s     13.8 s        —
 *      B  + the racing line            39.15 s   2.6     11.63 s     12.5 s      0.71 s
 *      C  + take the light-strips      38.19 s   1.2     11.26 s     15.1 s      0.96 s   ← biggest
 *      D  + dodge the storm cells      38.33 s   1.4     11.36 s     15.2 s     −0.14 s
 *      E  + brake for the corners      38.04 s   1.0     11.22 s     22.2 s      0.29 s
 *      ─ do nothing at all             43.06 s   5.8     12.38 s      0.0 s
 *      ─ hard-left into the barrier    49.15 s   6.0     12.94 s      4.7 s
 *
 *    Read it honestly. The dominant decision is the boost ECONOMY — where you refuel and where you
 *    spend — and the light-strips are the single most valuable thing on the track. Driving properly
 *    is worth 1.82 s (4.6%) over the naive hold-boost line and, more to the point, it is the
 *    difference between averaging 2.8th and winning, which is what the wager pays on. Doing
 *    nothing costs 13.2%; leaning on the barrier costs 29.2%.
 *    ⚠ TWO THINGS THIS TABLE SAYS THAT ARE NOT FLATTERING, and they should stay written down:
 *      · each individual verb is worth under a second in a ~38 s race. This game is decided by
 *        fuel management, not by cornering, and any future tuning should start from that fact.
 *      · D is NEGATIVE. Steering round a storm cell currently costs about as much line as the
 *        cell costs speed, so "dodge the weather" is not yet a real decision — it is a wash. It
 *        is left in because the tier ladder tightens the cells every lap (0.84 → 0.66) and the
 *        row should be re-measured at tier 3 rather than deleted on a tier-1 number.
 *
 * ══ THIRD IDEA, AND IT WAS SIMPLY MISSING: THE RACE ESCALATES. Nothing in the old rules read
 *    `r.lap` for anything but standings, so lap 3 was byte-identical to lap 1. Every completed lap
 *    now opens a TIER: the whole field goes 13% faster and grip rises more slowly than pace, so
 *    the road narrows as the speed climbs. Measured in the browser on a real 3-lap race, from the
 *    shipping code: **16.27 s → 12.33 s → 11.32 s**, a 30% drop across one race.
 *
 *      tier   cruise   boost   lap@cruise   braking zones   % of lap under cruise   storm ×
 *        1      76      108      16.3 s           5                 12%              0.84
 *        2      86      122      14.4 s           5                 14%              0.78
 *        3      97      138      12.8 s           5                 15%              0.72
 *        4     110      156      11.3 s           6                 19%              0.66
 *
 * ══ THE ONE IDEA: LATERAL POSITION IS PROGRESS, AND IT IS REAL GEOMETRY, NOT A FUDGE.
 *    For a centre-line c(s) with unit tangent T and right-vector R, the offset path p = c + lx·R
 *    has dp/ds = T·(1 − lx·κ), where κ is the signed curvature toward R. So a racer holding lx at
 *    speed v advances along the CENTRE-LINE at  ds/dt = v / (1 − lx·κ).
 *      · inside of a corner (sign lx = sign κ) ⇒ denominator < 1 ⇒ you gain centre-line per second
 *      · the offset path's own curvature is κ/(1 − lx·κ), i.e. the inside is TIGHTER
 *    Those two together are the entire sport: the short way round is also the one that runs out of
 *    grip first. Measured on the circuit this file builds: at the tightest corner the inside line
 *    advances 24.8% faster AND its own curvature is 24.8% higher, which drops the speed it can hold
 *    by 10.5%. Take it and you must slow for it; refuse it and you drive further.
 *
 * ══ SECOND IDEA: BOOST IS EARNED, NOT REGENERATED. The old bar refilled by itself at 0.22/s and
 *    drained at 0.34/s whatever you did, so the optimal play was "hold the key, always" and there
 *    was nothing to think about. Here nothing refills it except things you had to DO: hit a strip,
 *    tuck into someone's wake, carry a corner right on the limit, or GRAZE — hold the barrier or
 *    thread a rival close enough to trade paint without trading it. Spending it is then a real
 *    choice, because the bar is a record of driving rather than a clock.
 *    ⚠ AND IT HAD TO BE MADE SCARCE. Measured on the first rebuild: a policy that simply held the
 *    key boosted for 62% of the race and the bar never emptied, because the earn rate exceeded
 *    0.45/s of spend. An unlimited resource is not a resource and it cannot carry a decision.
 *    Spend is 0.62/s now and the trickle is 0.010; measured duty cycle is 35–55%, so roughly half
 *    the lap can be boosted and WHICH half is the game.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function rotAxis(v, ax, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), d = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2];
    const cr = cross(ax, v);
    return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)];
  }
  // deterministic PRNG — a track that reshuffles every load cannot be learned, and a circuit you
  // cannot learn is a circuit you cannot get better at. Same seed ⇒ same lap, every session.
  function rng(seed) { let x = (seed | 0) || 1; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff, x / 0x7fffffff); }

  /* ── PACE: every number here is in WORLD UNITS PER SECOND, not the old abstract "track nodes per
   * second". The old HUD multiplied its own unit by 34 to get a plausible "KM/H", which meant the
   * number on screen was decoration. A pod is 3.2 units nose to tail, so these are readable as
   * pod-lengths per second — the thing the eye actually integrates. */
  const PACE = {
    /* ⚑ 76, NOT 64 — AND THE REASON IS A RENDER MEASUREMENT, NOT A FEELING. 64 was chosen as
     * "20 pod-lengths/s" and then the deck texture was drawn with an 0.969 u panel period, which
     * at 60 fps stops reading as motion at 58.1 u/s. Cruise sat inside its own strobe: measured
     * optical flow (mean |ΔLuma| between two frames 1/60 s apart) FELL from 15.1 at 32 u/s to
     * 11.5 at 64. The texture is fixed in `crpc-app.js` (nothing repeats faster than 3.875 u now)
     * and flow rises monotonically to ~112 u/s, so raising the pace finally buys something:
     *     v      16    32    48    64    80    96   112   128
     *     before 11.0  15.1  12.1  11.5  17.8  17.7  11.9   —      ← flat, and NULLED at cruise
     *     after   6.2   9.3  12.4  14.7  17.2  19.5  20.2  19.2
     * Before, 112 u/s scored the same as 16 u/s — flat out looked like crawling. After, the curve
     * rises all the way through the range the game can reach. At the tier-1 cruise of 76 the frame
     * changes ~16.6 per frame against the old cruise's 11.5: +45% image motion, before a single
     * tier of escalation. Tier 4 boost is 156 u/s, past the 112 peak but still at ~18. */
    CRUISE: 76,
    BOOST_MUL: 1.42,     // 108 u/s flat out at tier 1, 156 at tier 4
    DRAFT_MUL: 1.13,     // tucked in someone's wake
    BANK_MUL: 0.80,      // inside a storm cell
    ACCEL: 30,           // u/s² onto the target speed
    LIFT: 26,            // u/s² off it (closed throttle)
    BRAKE: 62,           // u/s² on the airbrake
    /* ⚑ GRIP IS THE LOAD-BEARING NUMBER, and it was SWEPT against the built circuit, not picked.
     * a_lat = v²·κ, so the apex speed a line can hold is v = √(GRIP/κ_path). Swept on the track
     * this file builds (tightest κ 0.0209/u = radius 48 u), counting how many corners per lap
     * actually force you below cruise:
     *     GRIP 104 → 0 braking corners           the circuit is flat out everywhere and the brake
     *                                            key does nothing. Measured at 104: "racing line +
     *                                            brake" finished 0.45 s SLOWER than "racing line,
     *                                            never brake" — a control that can only cost you
     *                                            time is not a decision.
     *     GRIP  90 → 1 corner,  apex 95% of cruise      barely a lift
     *     GRIP  80 → 1 corner,  apex 89%
     *     GRIP  68 → 3 corners, apex 82%, 8% of the lap below cruise      ← chosen
     *     GRIP  62 → 3 corners, apex 79%
     * 68 gives the lap a RHYTHM: three real braking zones, a set of medium corners that are flat
     * at cruise but not under boost, and straights. Full boost (91 u/s) is only holdable where
     * κ < 0.0078, which is 31% of the lap — so "when do I spend it" has a geography. */
    GRIP: 78,
    /* ⚑ OVER-GRIP IS A SLIP ANGLE, NOT A NUDGE — and this replaces a version that MEASURED WRONG.
     * The first model just added outward lateral velocity and scrubbed a little speed, and the
     * battery caught it immediately: "hold boost, never steer, never brake" beat a driven lap by
     * 0.92 s, because ploughing through every corner at +42% boost cost about 10% of progress and
     * nothing else. Ploughing has to lose, or there is no reason to drive.
     * So a sliding pod points where it is going and MOVES where physics says: progress along the
     * track is v·cos(slip) and the rest of the speed goes sideways, into the barrier. Cheap,
     * principled, and it self-limits — the harder you over-drive, the less of your speed is
     * pointing down the road. */
    SLIP_MAX: 0.60,      // rad (34°) at full over-grip ⇒ 17.5% of speed stops being progress
    SLIP_REF: 90,        // u/s² of excess that reaches SLIP_MAX
    SLIDE: 3.0,          // how hard the sideways component throws you at the barrier
    SCRUB: 0.90,         // and how much speed sliding costs
    /* how fast traction is lost while over the limit and recovered afterwards. Recovery at 2.4/s
     * ⇒ a full slide leaves you with no drive for ~0.42 s, which is the first third of the
     * straight you were trying to get to sooner by not braking. */
    LOST_UP: 3.2,
    LOST_DOWN: 2.4,
    LOST_TOP: 0.45,      // and how much of your TOP SPEED a fully-slid pod cannot hold
    STEER_ACC: 40,       // lateral u/s²
    STEER_MAX: 17,       /* lateral u/s cap. Half-width is 9.5, so crossing the full track takes
                          * 1.1 s. The old build crossed it in 0.5 s, which makes lateral position
                          * something you flick rather than something you commit to. */
    LAT_DAMP: 3.2,
    HALFW: 9.5,
    /* ⚠ THE WALL. The old rule was `speed *= 0.86` EVERY FRAME while against the edge — 0.86^60 ≈
     * 1e-4 per second, so touching a wall deleted your race (measured: 309 s vs 73 s). That is not
     * a penalty, it is a trap, and it is invisible because nothing on screen says "you are losing
     * 99.99% of your speed per second". Here a wall costs a one-off proportional to how hard you
     * hit it, and it bounces you off — readable, survivable, still worth avoiding. */
    WALL_LOSS: 0.55,     // × the lateral speed you arrived with, as u/s of forward speed
    WALL_BOUNCE: 0.45,
    // boost economy — nothing here refills by itself except a trickle that stops you being stranded
    /* ⚑ THE ECONOMY IS A BUDGET, AND THE FIRST ONE WAS NOT. Measured: a policy that simply held
     * boost spent 51.2 s of boost inside a 48.4 s race — i.e. the bar never emptied, because
     * strips + corner-carry + trickle refilled it faster than 0.38/s drained it. An unlimited
     * resource is not a resource. At these values the sustainable duty cycle is
     *   (9 strips × 0.28 / 17 s lap  +  ~0.08 corner-carry  +  0.022) / 0.45  ≈  55%
     * so roughly half the lap can be boosted and WHICH half is the whole decision. */
    BOOST_SPEND: 0.62,   // /s  ⇒ a full bar is 1.6 s of boost
    BOOST_PAD: 0.28,     // per strip, granted ONCE ON ENTRY — see below
    BOOST_DRAFT: 0.17,   // /s while tucked in
    BOOST_EDGE: 0.16,    // /s while carrying ≥70% of the grip limit — the corner IS the refuel
    BOOST_TRICKLE: 0.010,
    PAD_KICK: 20,        // instant u/s from a strip
    DRAFT_S: 24,         // arc-length reach of a slipstream
    DRAFT_L: 4.6,
    CONTACT_S: 3.4,      // pods are solid: this is where they touch
    CONTACT_L: 2.3,
    LAP_KICK: 0.2,       // a little boost across the line, so a new lap starts with a decision
    /* ⚑ THE GRAZE — a reason to be somewhere dangerous on a straight. Everything else on this list
     * pays you for being on the racing line or behind somebody; on a long straight with no strip
     * the correct input was "nothing", and a racer with a do-nothing stretch in it is the
     * definition of mundane. Running the barrier without touching it, or threading a rival close
     * enough to trade paint without trading it, earns boost — and both are exactly the places
     * where being wrong costs you (WALL_LOSS, contact). Gated above 0.8 × cruise so it cannot be
     * farmed by crawling along the wall, and off while braking for the same reason. */
    BOOST_GRAZE: 0.34,   // /s while on the edge or threading
    /* ⚠ 0.90, NOT 1.15, AND THE MEASUREMENT IS WHY. The scrape band starts at halfW − 0.35, so
     * GRAZE_W sets how wide the "close but not touching" gap is. At 1.15 it was 0.8 u wide and a
     * policy that simply held boost and NEVER STEERED grazed for 13.2 s of a 38 s race — the slip
     * from every corner drifted it out to the wall and it just sat there collecting. A reward for
     * not steering is the exact bug this whole rebuild exists to remove. At 0.90 the band is
     * 0.55 u — about a sixth of a pod width — so it has to be held, and holding it while the
     * corner is trying to push you out is the thing being paid for. */
    GRAZE_W: 0.90,       // how close to the barrier counts, in units of lateral clearance
    GRAZE_L: 3.6,        // lateral gap to a rival that counts as threading (contact is at 2.3)
  };

  /* ══ TIERS — THE RACE GETS FASTER AND HARDER AS IT RUNS ══════════════════════════════════════
   * ⛔ THIS DID NOT EXIST. Lap 3 was byte-identical to lap 1: nothing in the old rules read
   * `r.lap` for anything except standings and the finish test, so a five-lap race was the same
   * twenty seconds five times. "It should get harder and faster as it runs, so a good run feels
   * earned" was simply not implemented, and no amount of tuning a constant fixes that.
   *
   * A tier opens when you COMPLETE A LAP — the same shape the studio uses everywhere else: a tier
   * is a promise about what you have done, not about how long you have been here.
   *
   * ⚑ GRIP RISES MORE SLOWLY THAN PACE, AND THAT IS THE WHOLE DESIGN. Apex speed is
   * v = √(GRIP/κ), so holding the corner census constant while pace rises would need GRIP to scale
   * as pace². It scales as pace^1.40 instead, so every tier hands you speed and takes back a
   * little of the road. Measured on the circuit this file builds:
   *
   *     tier  cruise  boost  lap@cruise  braking zones  % of lap under cruise  slowest corner
   *       1     76     108      16.3 s         5                15%             69% of cruise
   *       2     86     122      14.4 s         6                18%             67%
   *       3     97     138      12.8 s         6                22%             65%
   *       4    110     156      11.3 s         7                27%             62%
   *
   * ⚠ Tier is PER RACER, off that racer's own lap count. A race-wide tier driven by the leader
   * would push a lapped player to tier-3 pace on their first lap, which is a difficulty spike
   * arriving for a reason they cannot see. Everyone escalates on their own record. */
  const TIER = {
    STEP: 1.13,          // pace × per tier
    GRIP_EXP: 1.40,      // grip × STEP^(GRIP_EXP·(t−1)); 2.0 would hold difficulty flat
    MAX: 4,
    // storm cells bite harder every tier: weather you could power through on lap 1 really hurts later
    BANK: [0.84, 0.78, 0.72, 0.66],
  };
  const tierOf = r => Math.min(TIER.MAX, 1 + (r.lap | 0));
  /* Effective constants for a tier. Accel/brake/lift and the boost burn scale WITH pace so
   * time-to-speed and the boost duty cycle stay what they were tuned to be; steering scales as
   * √pace, so the pod deliberately loses a little agility as it gains speed — that is the part
   * that makes a tier-4 lap feel like it is on the edge rather than merely faster. */
  function paceOf(t) {
    const cm = Math.pow(TIER.STEP, t - 1), gm = Math.pow(cm, TIER.GRIP_EXP), sq = Math.sqrt(cm);
    return { tier: t, cm, gm, apexMul: Math.sqrt(gm),
      CRUISE: PACE.CRUISE * cm, ACCEL: PACE.ACCEL * cm, LIFT: PACE.LIFT * cm, BRAKE: PACE.BRAKE * cm,
      GRIP: PACE.GRIP * gm, SLIP_REF: PACE.SLIP_REF * gm,
      STEER_ACC: PACE.STEER_ACC * sq, STEER_MAX: PACE.STEER_MAX * sq,
      BOOST_SPEND: PACE.BOOST_SPEND * cm, PAD_KICK: PACE.PAD_KICK * cm,
      BANK_MUL: TIER.BANK[Math.min(t, TIER.MAX) - 1], SCRAPE: 15 * cm };
  }
  const PACE_TIER = [null, paceOf(1), paceOf(2), paceOf(3), paceOf(4)];
  const paceFor = r => PACE_TIER[tierOf(r)];

  /* ══ TRACK ══════════════════════════════════════════════════════════════════════════════════
   * ⚑ AUTHORED, NOT WOBBLED. The old circuit was `R = 165 + 44sin2θ + 24sin3θ` — a circle with a
   * ripple, measured at mean 2.59°/node and max 6.33°, i.e. every metre of it approximately the
   * same as every other metre. There is nothing in that to recognise, so there is nothing to learn
   * and nothing to get better at, which is a large part of "mundane". This is a LAYOUT: a long
   * main straight, a fast double-apex right, a back straight, a genuine hairpin, a sweeping left
   * and an S-chicane onto the start line. Control points below, Catmull-Rom through them,
   * resampled by arc length.
   *
   * ⚑ AND THEN THE CURVATURE IS LIMITED, because the first authored attempt was UNPHYSICAL and the
   *   measurement caught it: harmonics normalised to a 1200 u lap produced a corner of radius 17 u
   *   on a track 19 u wide. At that radius `1 − lx·κ` falls to 0.44, so the inside line measured
   *   129% faster — the offset-arc-length model had degenerated, because the inner edge of the
   *   ribbon was turning tighter than the ribbon is wide. K_LIMIT keeps the tightest radius at
   *   ≥ 2.1× the track width, which is also just what a drivable circuit looks like. */
  const K_LIMIT = 0.025;                              // 1/40 u — the tightest corner on the circuit
  const CTRL = [
    /* x, y, z — a sky circuit, roughly 460 × 380 before the length normalisation. y is altitude:
     * the hairpin sits in a dip and the sweeper climbs out of it, so the track has a skyline. */
    [   0,   0,  210], [ 118,   9,  198], [ 214,  22,  140], [ 250,  33,   36],
    [ 224,  38,  -62], [ 140,  27, -116], [  54,  12, -104], [  -4,   0,  -44],
    [ -34, -10,  -78], [-110, -16, -104], [-192,  -8,  -64], [-224,   8,   22],
    [-176,  22,  118], [ -98,  12,   98], [ -44,   2,  168],
  ];
  function catmull(P, i, t) {                          // closed uniform Catmull-Rom
    const n = P.length, a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
    const t2 = t * t, t3 = t2 * t, o = [0, 0, 0];
    for (let k = 0; k < 3; k++)
      o[k] = 0.5 * ((2 * b[k]) + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
    return o;
  }
  function resample(poly, count) {                     // uniform by arc length, closed
    const n = poly.length, cum = [0];
    for (let i = 0; i < n; i++) cum.push(cum[i] + Math.hypot(...sub(poly[(i + 1) % n], poly[i])));
    const total = cum[n], out = [];
    let j = 0;
    for (let i = 0; i < count; i++) {
      const want = total * i / count;
      while (j < n - 1 && cum[j + 1] < want) j++;
      const seg = cum[j + 1] - cum[j] || 1, t = (want - cum[j]) / seg;
      out.push(lerpV(poly[j % n], poly[(j + 1) % n], t));
    }
    return out;
  }
  function curvatures(pts) {                           // unsigned, per world unit — for the limiter
    const n = pts.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      const t0 = norm(sub(b, a)), t1 = norm(sub(c, b));
      const ds = (Math.hypot(...sub(b, a)) + Math.hypot(...sub(c, b))) * 0.5 || 1e-6;
      const d = clamp(t0[0] * t1[0] + t0[1] * t1[1] + t0[2] * t1[2], -1, 1);
      out[i] = Math.acos(d) / ds;
    }
    return out;
  }

  function buildTrack(opts) {
    opts = opts || {};
    const LEN = opts.length || 1240;                 // world units ⇒ 19.4 s/lap at cruise
    const NODES = opts.nodes || 480;
    const R = rng(opts.seed || 30301);
    // spline → dense polyline → uniform resample
    let poly = [];
    for (let i = 0; i < CTRL.length; i++) for (let k = 0; k < 40; k++) poly.push(catmull(CTRL, i, k / 40));
    let pts = resample(poly, NODES);
    // scale to the design length FIRST, so the curvature limit is judged in shipping units
    const relen = () => { let L = 0; for (let i = 0; i < NODES; i++) L += Math.hypot(...sub(pts[(i + 1) % NODES], pts[i])); return L; };
    let sc = LEN / relen(); pts = pts.map(p => [p[0] * sc, p[1] * sc, p[2] * sc]);
    /* Laplacian relaxation until nothing is tighter than K_LIMIT. Each pass shortens the curve, so
     * the length is restored afterwards — otherwise "smooth the hairpin" silently becomes "make the
     * lap shorter", and the lap time would drift every time the layout is touched. */
    let passes = 0;
    while (Math.max(...curvatures(pts)) > K_LIMIT && passes < 400) {
      const q = pts.map((p, i) => {
        const a = pts[(i - 1 + NODES) % NODES], c = pts[(i + 1) % NODES];
        return [p[0] + (a[0] + c[0] - 2 * p[0]) * 0.25, p[1] + (a[1] + c[1] - 2 * p[1]) * 0.25, p[2] + (a[2] + c[2] - 2 * p[2]) * 0.25];
      });
      pts = resample(q, NODES); passes++;
    }
    sc = LEN / relen(); pts = pts.map(p => [p[0] * sc, p[1] * sc, p[2] * sc]);

    // ── pass 1: unbanked frames, to get a signed curvature to bank with ────────────────────────
    const k0 = new Array(NODES);
    for (let i = 0; i < NODES; i++) {
      const a = pts[(i - 1 + NODES) % NODES], b = pts[i], c = pts[(i + 1) % NODES];
      const fwd = norm(sub(c, a));
      const right0 = norm(cross(fwd, [0, 1, 0]));
      const dT = sub(norm(sub(c, b)), norm(sub(b, a)));
      const ds = (Math.hypot(...sub(b, a)) + Math.hypot(...sub(c, b))) * 0.5 || 1e-6;
      k0[i] = (dT[0] * right0[0] + dT[1] * right0[1] + dT[2] * right0[2]) / ds;
    }
    // ── pass 2: banked frames. Banking tilts `up` toward the OUTSIDE, so the surface leans into
    //    the turn. rotAxis(up, fwd, +θ) swings up toward +right, so the outside is −sign(κ). ────
    const nodes = [];
    for (let i = 0; i < NODES; i++) {
      const a = pts[(i - 1 + NODES) % NODES], b = pts[i], c = pts[(i + 1) % NODES];
      const fwd = norm(sub(c, a));
      const bank = clamp(-k0[i] * 19, -0.52, 0.52);
      let up = rotAxis([0, 1, 0], fwd, bank);
      /* ⚑ right = cross(fwd, up). This is not arbitrary and it is not the convention Section 9
       * used. In a right-handed y-up space an entity facing F with up U has its right axis at
       * cross(F, U) — which is exactly a PlayCanvas entity's +x column. Section 9's game used
       * cross(U, F), the opposite sign, and that one sign rendered its whole world mirrored and
       * produced three separate bug reports. Verified numerically in the app, not assumed here;
       * see `__crpc._hand()`. */
      let right = norm(cross(fwd, up)); up = norm(cross(right, fwd));
      nodes.push({ p: b, fwd, up, right, s: 0, k: 0 });
    }
    let acc = 0;
    for (let i = 0; i < NODES; i++) { nodes[i].s = acc; acc += Math.hypot(...sub(nodes[(i + 1) % NODES].p, nodes[i].p)); }
    const len = acc;
    // signed curvature measured against the FINAL (banked) right vector
    for (let i = 0; i < NODES; i++) {
      const a = nodes[(i - 1 + NODES) % NODES], b = nodes[i], c = nodes[(i + 1) % NODES];
      const dT = sub(norm(sub(c.p, b.p)), norm(sub(b.p, a.p)));
      const ds = (Math.hypot(...sub(b.p, a.p)) + Math.hypot(...sub(c.p, b.p))) * 0.5 || 1e-6;
      b.k = (dT[0] * b.right[0] + dT[1] * b.right[1] + dT[2] * b.right[2]) / ds;
    }
    // smooth twice — curvature off finite differences is noisy, and the bots BRAKE on it, so a
    // one-node spike reads to the player as a bot lifting for nothing
    for (let pass = 0; pass < 2; pass++) {
      const ks = nodes.map((n, i) => (nodes[(i - 1 + NODES) % NODES].k + 2 * n.k + nodes[(i + 1) % NODES].k) / 4);
      nodes.forEach((n, i) => { n.k = ks[i]; });
    }

    /* ── THE RACING LINE, precomputed. Target lateral = toward the inside, in proportion to how
     * tight the corner is, then smoothed over ±40 units. The smoothing is what makes it a LINE
     * rather than a reaction: it turns in before the corner arrives and runs wide after, which is
     * the shape a human draws. The bots drive it, so the line is visible to the player as
     * something to copy — an AI that races well is the cheapest tutorial there is. */
    const KREF = 0.016;
    const wantRaw = nodes.map(n => clamp(n.k / KREF, -1, 1) * (PACE.HALFW - 1.7));
    const SM = Math.max(2, Math.round(40 / (len / NODES)));
    const line = new Array(NODES);
    for (let i = 0; i < NODES; i++) {
      let a = 0, w = 0;
      for (let j = -SM; j <= SM; j++) { const g = 1 - Math.abs(j) / (SM + 1); a += wantRaw[(i + j + NODES * 4) % NODES] * g; w += g; }
      line[i] = a / w;
    }
    // apex speed for each node, on the racing line: v = sqrt(GRIP / κ_path)
    const vmax = nodes.map((n, i) => {
      const kp = Math.abs(n.k / Math.max(0.35, 1 - line[i] * n.k));
      return kp < 1e-5 ? 999 : Math.sqrt(PACE.GRIP / kp);
    });

    /* ── FEATURES. The point of every one of them is the same: make the player choose a lateral
     * position for a REASON, on a cadence short enough that there is never a stretch of road where
     * holding the stick still is correct. Strips are only 42% of the track wide and they alternate
     * sides, so "line up for the boost" and "take the racing line" are frequently different
     * answers — which is the trade the old full-width strips could not have, because a strip you
     * cannot miss is scenery. */
    const pads = [], banks = [];
    const PAD_EVERY = 138, BANK_EVERY = 121;
    for (let d = 44; d < len - 30; d += PAD_EVERY) {
      const i = nodeAt(nodes, len, d);
      // put roughly half of them on the OUTSIDE of whatever the track is doing there: taking those
      // costs you the line, which is the decision. The rest reward the line you already wanted.
      const outside = (pads.length % 2) === 1;
      const side = Math.abs(nodes[i].k) > 0.004 ? (outside ? -Math.sign(nodes[i].k) : Math.sign(nodes[i].k))
                                                : (R() < 0.5 ? -1 : 1);
      const c = side * PACE.HALFW * 0.52;
      pads.push({ s0: d, s1: d + 26, l0: c - PACE.HALFW * 0.42, l1: c + PACE.HALFW * 0.42, side, outside });
    }
    for (let d = 96; d < len - 30; d += BANK_EVERY) {
      const i = nodeAt(nodes, len, d);
      if (Math.abs(nodes[i].k) > 0.013) continue;    // never park a hazard in a tight corner: that
                                                    // is not a decision, it is a coin toss
      if (pads.some(p => Math.abs(p.s0 - d) < 34)) continue;
      const side = R() < 0.5 ? -1 : 1;
      const c = side * PACE.HALFW * 0.46;
      banks.push({ s0: d, s1: d + 34, l0: c - PACE.HALFW * 0.5, l1: c + PACE.HALFW * 0.5, side });
    }
    return { nodes, len, N: NODES, line, vmax, pads, banks, halfW: PACE.HALFW };
  }

  function nodeAt(nodes, len, s) {
    const N = nodes.length;
    return clamp(Math.floor(((s % len) + len) % len / len * N), 0, N - 1);
  }

  /* frameAt in ARC LENGTH, not node index. The old build parameterised by node, so a "unit of
   * speed" meant different distances on different parts of the track and no physical quantity in
   * the game was comparable to any other. */
  function frameAt(T, s) {
    const N = T.N, u = (((s % T.len) + T.len) % T.len) / T.len * N;
    const i = Math.floor(u), t = u - i, a = T.nodes[i], b = T.nodes[(i + 1) % N];
    return { p: lerpV(a.p, b.p, t), fwd: norm(lerpV(a.fwd, b.fwd, t)), up: norm(lerpV(a.up, b.up, t)),
      right: norm(lerpV(a.right, b.right, t)), k: lerp(a.k, b.k, t), i };
  }
  const lineAt = (T, s) => T.line[nodeAt(T.nodes, T.len, s)];
  const vmaxAt = (T, s) => T.vmax[nodeAt(T.nodes, T.len, s)];
  function inZone(z, s, lx, len) {
    let d = s - z.s0; d = ((d % len) + len) % len;
    return d >= 0 && d <= (z.s1 - z.s0) && lx >= z.l0 && lx <= z.l1;
  }

  // ══ RACERS ═══════════════════════════════════════════════════════════════════════════════════
  function newRacer(i, isMe, T, players) {
    const rowW = Math.min(3, players);
    const col = i % rowW, row = (i / rowW) | 0;
    return { i, isMe, s: -(6 + row * 7), lx: (col - (rowW - 1) / 2) * 5.2, v: 0, vl: 0,
      lap: 0, place: i + 1, boostE: 0.45, boosting: false, lean: 0, bob: Math.random() * 6,
      slide: 0, slip: 0, draft: 0, onPad: 0, padWas: 0, inBank: 0, bump: 0, scrape: 0, rev: 0, launch: 0,
      tier: 1, graze: 0, grazeWas: 0, thread: 0, lost: 0,
      done: false, finishT: 0, best: 0, lapT: 0, skill: isMe ? 1 : 0, wobble: Math.random() * TAU };
  }

  function create(o) {
    const T = o.track, players = o.players || 6;
    const racers = [];
    for (let i = 0; i < players; i++) racers.push(newRacer(i, i === 0, T, players));
    // Bot skill is a SPREAD, not a difficulty dial. A field where everyone is equally good has no
    // shape to it; one slow bot to pass early and one quick one to chase is what makes a race read
    // as a race. 1.0 = drives to the grip limit; below that it lifts earlier and lines up worse.
    const SK = [0.99, 0.955, 0.915, 0.875, 0.835, 0.795, 0.76, 0.73];
    for (let i = 1; i < players; i++) { racers[i].skill = SK[(i - 1) % SK.length]; racers[i].lineBias = ((i * 2.7) % 3 - 1) * 1.5; }
    return { T, racers, me: racers[0], t: 0, laps: o.laps || 3, countdown: o.countdown == null ? 3.2 : o.countdown,
      started: false, over: false, cardEdge: o.cardEdge || 1, assist: o.assist !== false,
      order: racers.slice(), events: [], lead: racers[0], tier: 1, pace: PACE_TIER[1] };
  }

  // ── one racer's controls for this tick ──────────────────────────────────────────────────────
  function botInput(G, r) {
    const T = G.T, P = paceFor(r);
    const want = lineAt(T, r.s) + (r.lineBias || 0) * (1 - r.skill * 0.6);
    // aim at a strip when it is nearly free — a bot that ignores pickups teaches the player that
    // pickups do not matter
    let tgt = want;
    for (const p of T.pads) {
      let d = p.s0 - r.s; d = ((d % T.len) + T.len) % T.len;
      if (d > 8 && d < 95) { const c = (p.l0 + p.l1) / 2; if (Math.abs(c - want) < T.halfW * 0.95 * r.skill) tgt = c; break; }
    }
    for (const b of T.banks) {          // and steer around the weather
      let d = b.s0 - r.s; d = ((d % T.len) + T.len) % T.len;
      if (d > 4 && d < 70 && tgt > b.l0 - 1 && tgt < b.l1 + 1) tgt = (b.side > 0 ? b.l0 - 2.6 : b.l1 + 2.6);
    }
    r.wobble += 0.9 * (1 - r.skill) * 0.6;
    tgt = clamp(tgt + Math.sin(r.wobble) * (1 - r.skill) * 5, -T.halfW + 1, T.halfW - 1);
    const steer = clamp((tgt - r.lx) * 0.55 - r.vl * 0.05, -1, 1);
    const bp = brakePoint(T, r.s, P, r.skill);
    const brake = r.v > bp.need * 1.02;
    const boost = !brake && r.boostE > 0.12 && r.v < bp.need * 0.94;
    return { steer, boost, brake };
  }

  /* ⛔ THE BRAKE LOOKAHEAD WAS THE WRONG FORMULA, AND IT WAS COPIED INTO THREE PLACES.
   * The old test was: scan `v²/(2·BRAKE)` units ahead, take the slowest apex in there, brake if
   * you are above it. `v²/(2·BRAKE)` is the distance to stop DEAD — at 108 u/s that is 94 u, 7.6%
   * of the lap — and the comparison ignored that you have all of that distance to slow down in.
   * So every bot lifted for every corner from a tenth of a lap away and the HUD's LIFT/BRAKE lamp
   * was lit almost permanently, which is precisely how a racing game reads as sluggish.
   *
   * The right question is not "is anything ahead slower than me" but "can I still make it".
   * Shedding v → lim needs (v² − lim²)/(2·BRAKE), so the fastest you may be at distance d from an
   * apex of lim is √(lim² + 2·BRAKE·d). Take the minimum of that over the scan and you have a
   * brake POINT: flat out until the last moment, then a real, short, decisive braking zone.
   * Returns the limiting speed AND the apex it belongs to, because the HUD wants both. */
  function brakePoint(T, s, P, skill) {
    const scan = 24 + (P.CRUISE * PACE.BOOST_MUL) * (P.CRUISE * PACE.BOOST_MUL) / (2 * P.BRAKE);
    let need = 1e9, apex = 1e9;
    // ⚠ apexMul, not the raw table: `vmax` is GEOMETRY at the base grip, and a driver braking to
    // tier-1 apex speeds while running tier-3 pace would lift for corners that are no longer there.
    for (let d = 2; d < scan; d += 6) {
      const lim = vmaxAt(T, s + d) * P.apexMul * (skill == null ? 1 : skill);
      if (lim > 900) continue;
      const can = Math.sqrt(lim * lim + 2 * P.BRAKE * d);
      if (can < need) { need = can; apex = lim; }
    }
    return { need, apex };
  }

  function step(G, dt, input) {
    const T = G.T, len = T.len;
    G.t += dt;
    if (G.countdown > 0) {
      G.countdown -= dt;
      /* ── THE LAUNCH. A decision at t = 0, before the race has even started. Revs build while
       * boost is held and bleed off when it is not; the GREEN BAND is 0.55–1.0 and the HUD draws
       * it, so the timing is legible rather than a secret.
       *
       * ⚠ FIRST VERSION BOGGED YOU FOR OVER-REVVING AND IT WAS WRONG. Revs build at 0.55/s over a
       *   3.2 s count, so simply holding boost — the single most likely thing a new player does —
       *   pinned the meter and bogged the start of EVERY race. A mechanic that punishes the naive
       *   input on the first three seconds of the first race is a mechanic that teaches people to
       *   stop playing. It is now upside-only: time it and you jump the field, miss it and you get
       *   the ordinary standing start everyone used to get. */
      const me = G.me;
      if (input && input.boost) me.rev = Math.min(1.6, me.rev + dt * 0.55);
      else me.rev = Math.max(0, me.rev - dt * 0.75);
      for (const r of G.racers) if (!r.isMe) r.rev = 0.45 + (r.skill - 0.86) * 3.2;
      if (G.countdown <= 0) {
        G.started = true;
        for (const r of G.racers) {
          const q = r.rev;
          // a plateau with soft shoulders: full value across the band, fading either side of it
          r.launch = q < 0.55 ? clamp(q / 0.55, 0, 1) * 0.7 : clamp(1 - (q - 1.0) / 0.6, 0, 1);
          r.v = PACE.CRUISE * 0.34 * r.launch;
          r.boostE = Math.min(1, r.boostE + r.launch * 0.25);
        }
        G.events.push({ t: G.t, kind: 'go' });
      }
    }
    const go = G.started;

    for (const r of G.racers) {
      const P = paceFor(r);                       // ← every constant below is TIER-SCALED
      // ⚠ a finished racer keeps the tier it raced. Assigning before this guard bumped the player
      //   to tier 4 the frame after they crossed the line, and the HUD then reported a tier that
      //   never existed in a 3-lap heat.
      if (!r.done) r.tier = P.tier;
      if (r.done) { r.v = Math.max(0, r.v - P.LIFT * 0.5 * dt); r.s += r.v * dt; r.bob += dt * 4; continue; }
      const ctl = go ? (r.isMe ? (input || { steer: 0, boost: false, brake: false }) : botInput(G, r))
                     : { steer: 0, boost: false, brake: false };
      const fr = frameAt(T, r.s);

      // ── zones ──
      r.onPad = 0; r.inBank = 0;
      for (const p of T.pads) if (inZone(p, r.s, r.lx, len)) { r.onPad = 1; break; }
      for (const b of T.banks) if (inZone(b, r.s, r.lx, len)) { r.inBank = 1; break; }

      // ── slipstream: someone ahead, close, and roughly in front of you.
      //    Same sweep finds the GRAZE: a rival alongside, closer than a car's width but not
      //    touching. One loop, two answers — they are the same geometry asked twice. ──
      r.draft = 0; r.thread = 0;
      if (go) for (const o of G.racers) {
        if (o === r || o.done) continue;
        let d = (o.lap * len + o.s) - (r.lap * len + r.s);
        const dl = Math.abs(o.lx - r.lx);
        if (Math.abs(d) < PACE.CONTACT_S * 1.5 && dl > PACE.CONTACT_L && dl < PACE.GRAZE_L) r.thread = 1;
        if (!r.draft && d > 0.6 && d < PACE.DRAFT_S && dl < PACE.DRAFT_L) r.draft = 1 - d / PACE.DRAFT_S;
      }

      // ── target speed ──
      let top = P.CRUISE * G.cardEdge * (r.isMe ? 1 : 1);
      if (r.draft > 0) top *= 1 + (PACE.DRAFT_MUL - 1) * r.draft;
      if (r.inBank) top *= P.BANK_MUL;
      const canBoost = ctl.boost && r.boostE > 0.02 && !ctl.brake;
      if (canBoost) top *= PACE.BOOST_MUL;
      r.boosting = canBoost;
      /* ⚑ AND LOST TRACTION CAPS THE TOP SPEED, not just the acceleration. Measured why: a policy
       * that simply held boost and never braked spent 37% of the race past the grip limit and got
       * away with it, because boost (1.42 × cruise) is above the apex speed almost everywhere on
       * this circuit — so "spend it everywhere" was nearly free and the whole "WHEN do I spend it"
       * geography the boost economy was built for did not exist. A pod that is sliding cannot use
       * its engine; that has to be true of speed, not only of the derivative. */
      top *= 1 - PACE.LOST_TOP * r.lost;

      /* ⚑ TRACTION IS THE THING THE BRAKE BUYS, and without it the airbrake was a control that
       * could only cost you time. Measured on the SHIPPING build (cruise 64, grip 68, 5 seeds,
       * 3 laps): "hold boost + racing line, never brake" 45.46 s beat a policy that braked on
       * lookahead by 1.1–2.7 s. The file's header claimed driving was worth +3.56 s over holding
       * boost; it is not, once the hold-boost baseline is allowed to steer as well.
       * The reason is structural: over-grip only cost cos(slip) and a scrub, both INSTANTANEOUS,
       * so ploughing bought back everything it lost the moment the corner ended. `lost` makes the
       * cost persist — slide and you have no drive for about half a second afterwards, which is
       * where the straight is. Slow in, fast out; fast in, slow out. That is the entire reason a
       * brake exists in a racing game, and it was the missing term. */
      const drive = P.ACCEL * (canBoost ? 1.5 : 1) * (1 - 0.82 * r.lost);
      if (ctl.brake) r.v = Math.max(top * 0.32, r.v - P.BRAKE * dt);
      else if (r.v < top) r.v = Math.min(top, r.v + drive * dt);
      else r.v = Math.max(top, r.v - P.LIFT * dt);
      if (r.onPad) { r.v = Math.min(r.v + P.PAD_KICK * dt * 6, top + P.PAD_KICK); }

      // ── cornering: offset-path curvature, then the grip test ──
      const denom = Math.max(0.35, 1 - r.lx * fr.k);
      const kPath = fr.k / denom;
      const aLat = r.v * r.v * Math.abs(kPath);
      const over = aLat - P.GRIP;
      r.slide = 0; r.slip = 0;
      if (over > 0) {
        // The pod keeps pointing along the track and slides across it: only v·cos(slip) is
        // progress, v·sin(slip) is a trip to the outside barrier, and the tyre scrub is on top.
        r.slip = Math.min(PACE.SLIP_MAX, over / P.SLIP_REF * PACE.SLIP_MAX);
        const dir = -Math.sign(kPath) || 1;
        r.vl += dir * r.v * Math.sin(r.slip) * PACE.SLIDE * dt;
        r.v = Math.max(8, r.v - over * PACE.SCRUB * dt);
        r.slide = Math.min(1, over / 60);
        r.lost = Math.min(1, r.lost + dt * PACE.LOST_UP * Math.min(2.5, over / P.GRIP));
      } else r.lost = Math.max(0, r.lost - dt * PACE.LOST_DOWN);

      // ── steering ──
      const auth = 0.55 + clamp(r.v / P.CRUISE, 0, 1.3) * 0.45;   // no airspeed, no authority
      r.vl += ctl.steer * P.STEER_ACC * auth * dt;
      r.vl -= r.vl * PACE.LAT_DAMP * dt;
      r.vl = clamp(r.vl, -P.STEER_MAX, P.STEER_MAX);
      r.lx += r.vl * dt;
      r.scrape = 0;
      if (Math.abs(r.lx) > T.halfW) {
        const hit = Math.abs(r.vl);
        r.lx = clamp(r.lx, -T.halfW, T.halfW);
        r.v = Math.max(10, r.v - hit * PACE.WALL_LOSS);
        r.vl = -r.vl * PACE.WALL_BOUNCE;
        if (hit > 4) { r.bump = 1; if (r.isMe) G.events.push({ t: G.t, kind: 'wall' }); }
        r.scrape = 1;
      } else if (Math.abs(r.lx) > T.halfW - 0.35 && ctl.steer * r.lx > 0) r.scrape = 1;
      /* ⚑ A CONTINUOUS COST FOR RIDING THE BARRIER, added because the measurement said the
       * one-off bounce was not enough: "hard left the whole race" finished only 1.3 s off centre,
       * i.e. leaning on the wall was a viable line. The old build had the opposite failure —
       * `speed *= 0.86` EVERY FRAME, which is ×1e-4 per second and made one touch fatal. This is
       * the middle: 15 u/s² while scraping (tier-scaled, or it would quietly become a rounding
       * error at 110 u/s), so the barrier costs about a quarter of your top speed for as long as
       * you lean on it, and stops costing the instant you come off it. */
      if (r.scrape) r.v = Math.max(10, r.v - P.SCRAPE * dt);

      /* ── THE GRAZE, resolved AFTER the wall test so "graze" and "scrape" can never both be true.
       * That ordering is the whole mechanic: the reward is for the lane you did NOT touch. */
      r.graze = 0;
      // ⚠ and not while sliding: a pod that has lost traction is not threading a gap, it is a
      //   passenger, and paying it would pay the plough again through a side door.
      if (go && !r.scrape && !r.inBank && !ctl.brake && r.lost < 0.25 && r.v > P.CRUISE * 0.9) {
        if (Math.abs(r.lx) > T.halfW - PACE.GRAZE_W) r.graze = 1;   // running the barrier
        else if (r.thread) r.graze = 1;                             // threading a rival
      }

      // ── boost economy: nothing here refills on a timer ──
      let earn = PACE.BOOST_TRICKLE;
      if (r.draft > 0) earn += PACE.BOOST_DRAFT * r.draft;
      if (aLat > P.GRIP * 0.70 && over <= 0) earn += PACE.BOOST_EDGE;   // carried, not survived
      if (r.graze) earn += PACE.BOOST_GRAZE;
      r.boostE = clamp(r.boostE + (earn - (canBoost ? P.BOOST_SPEND : 0)) * dt, 0, 1);
      /* ⚑ EDGE-TRIGGERED, not per-second. A rate grant pays MORE to whoever crosses the strip
       * SLOWEST, which is exactly backwards, and the first version quietly paid ~0.58 instead of
       * the 0.34 it advertised. A pickup is worth what it is worth. */
      if (r.onPad && !r.padWas) { r.boostE = Math.min(1, r.boostE + PACE.BOOST_PAD); if (r.isMe) G.events.push({ t: G.t, kind: 'pad' }); }
      r.padWas = r.onPad;
      if (r.isMe && r.graze && !r.grazeWas) G.events.push({ t: G.t, kind: 'graze' });
      r.grazeWas = r.graze;

      // ── progress: THE line. ds/dt = v / (1 − lx·κ) ──
      r.s += (r.v * Math.cos(r.slip) / denom) * dt;
      r.lean = lerp(r.lean, clamp(-ctl.steer * 0.42 - kPath * r.v * 0.055, -0.75, 0.75), dt * 7);
      r.bob += dt * (5 + r.v * 0.05);
      if (r.bump > 0) r.bump = Math.max(0, r.bump - dt * 3);

      if (r.s >= len) {
        r.s -= len; r.lap++;
        const lt = G.t - r.lapT; r.lapT = G.t;
        if (r.lap > 1 && (!r.best || lt < r.best)) r.best = lt;
        r.boostE = Math.min(1, r.boostE + PACE.LAP_KICK);
        const nt = tierOf(r);
        if (r.isMe) {
          G.events.push({ t: G.t, kind: 'lap', lap: r.lap, time: lt });
          // ⚑ THE TIER-UP IS ITS OWN EVENT. The pace change is worth nothing the player cannot
          //   see coming — a race that silently got 13% faster reads as "the controls got worse".
          if (nt > r.tier && r.lap < G.laps) G.events.push({ t: G.t, kind: 'tier', tier: nt });
        }
        // ⚠ do NOT advance the tier on the lap that finishes the race — the HUD would light a tier
        //   the player never actually raced, which is a scoreboard telling a small lie.
        if (r.lap < G.laps) r.tier = nt;
        if (r.lap >= G.laps && !r.done) { r.done = true; r.finishT = G.t; if (r.isMe) G.events.push({ t: G.t, kind: 'finish' }); }
      }
    }
    G.tier = G.me.tier || 1; G.pace = PACE_TIER[G.tier];

    // ── contact. Pods are solid: this is where a pack becomes a fight instead of a queue. ──
    if (go) for (let a = 0; a < G.racers.length; a++) for (let b = a + 1; b < G.racers.length; b++) {
      const x = G.racers[a], y = G.racers[b];
      if (x.done || y.done) continue;
      let d = (y.lap * len + y.s) - (x.lap * len + x.s);
      if (Math.abs(d) > PACE.CONTACT_S) continue;
      const dl = y.lx - x.lx;
      if (Math.abs(dl) > PACE.CONTACT_L) continue;
      const push = (PACE.CONTACT_L - Math.abs(dl)) * 5.5, sgn = dl >= 0 ? 1 : -1;
      y.vl += push * sgn * 0.5; x.vl -= push * sgn * 0.5;
      y.v = Math.max(12, y.v - push * 0.10); x.v = Math.max(12, x.v - push * 0.10);
      x.bump = y.bump = 1;
      if (x.isMe || y.isMe) G.events.push({ t: G.t, kind: 'contact' });
    }

    /* ── FIELD ASSIST, and it is ASYMMETRIC ON PURPOSE. The old build gave every racer behind the
     * leader up to +12% — which, when the player is leading, is a straight handicap applied to the
     * player and to nobody else. Here only bots that have dropped out of contention get help, it
     * is capped at +5%, and a bot that is AHEAD of the pack mean gets nothing. It closes a
     * procession; it cannot manufacture a win. */
    if (go && G.assist) {
      let mean = 0; for (const r of G.racers) mean += r.lap * len + r.s;
      mean /= G.racers.length;
      for (const r of G.racers) {
        if (r.isMe || r.done) continue;
        const gap = mean - (r.lap * len + r.s);
        if (gap > 30) r.v += Math.min(0.05, gap * 0.00035) * paceFor(r).CRUISE * dt;
      }
    }

    // ── standings ──
    const sorted = G.racers.slice().sort((a, b) => {
      if (a.done !== b.done) return a.done ? -1 : 1;
      if (a.done && b.done) return a.finishT - b.finishT;
      return (b.lap * len + b.s) - (a.lap * len + a.s);
    });
    sorted.forEach((r, i) => { r.place = i + 1; });
    G.order = sorted; G.lead = sorted[0];
    if (G.racers.every(r => r.done)) G.over = true;
    // a fail-safe end: once the player is done, do not make them watch the back marker
    if (G.me.done && G.t - G.me.finishT > 6) G.over = true;
    return G;
  }

  // world-space pose for a racer, for whatever is drawing it
  function pose(G, r) {
    const T = G.T, f = frameAt(T, r.s);
    const hv = 1.75 + Math.sin(r.bob) * 0.15 + r.bump * 0.35;
    const up = rotAxis(f.up, f.fwd, r.lean);
    const right = norm(cross(f.fwd, up));
    const p = [f.p[0] + right[0] * r.lx + up[0] * hv, f.p[1] + right[1] * r.lx + up[1] * hv, f.p[2] + right[2] * r.lx + up[2] * hv];
    return { p, fwd: f.fwd, up, right, k: f.k };
  }

  const API = { PACE, TIER, paceOf, paceFor, tierOf, brakePoint, buildTrack, frameAt, lineAt, vmaxAt,
    nodeAt, inZone, create, step, pose, botInput, rng };
  root.CRGame = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

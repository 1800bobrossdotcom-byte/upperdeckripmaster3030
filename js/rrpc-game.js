/* upperdeckripmaster3030 — RIP ROCKETER: the simulation (RRGame).
 *
 * The artist's brief was one line: RIP ROCKETER is "too slow mundane — make it galaga on acid".
 * That is a game-feel complaint, so it was MEASURED before it was answered. What the old build
 * actually did, from `scripts`-free instrumentation of the shipping page (see the report):
 *
 *     enemies on screen        mean 1.69   median 1   max 5
 *     enemy bullets on screen  mean 0      max 0
 *     time to first THREAT     never, inside a 60 s run — the only thing that can take a shield
 *                              is the boss, and the boss spawns at 2500 m ≈ 62.5 s
 *     player bolts on screen   mean 18.35  max 42     ← eighteen bolts, 1.7 targets
 *     spawn cadence            one drifter every 0.49–0.98 s, 1.6 s of travel ⇒ ~2 alive
 *     enemy behaviour          o.z -= dt*0.52 and o.rot += o.spin. That is the whole AI.
 *
 * So it was not "slow" in the sense of low frame rate (though it was that too). It was EMPTY:
 * nothing on screen, nothing shooting back, nothing to decide, and a full minute before the game
 * contained a single thing that could hurt you. Eighteen bullets in flight against 1.7 targets is
 * the number that says it plainest — the player was already firing as fast as an arcade game
 * expects, and there was nothing to fire at.
 *
 * ⛔ AND THE PACING WAS BOUND TO SEPOLIA. `market.pendingWave` was set by the block poller, so the
 *    only formation-shaped content in the game arrived at BLOCK RATE — ~12 s, or never if the RPC
 *    was unreachable. An arcade game's tempo cannot be a network's tempo. The chain still drives
 *    colour, weather and enemy flavour here; it no longer drives the clock.
 *
 * ⚠ AND THE OLD LOOP RAN IN SLOW MOTION WHEN IT DROPPED FRAMES. `dt=Math.min(0.05,…)` with no
 *   accumulator means a machine rendering at 10 fps advances the world at half speed — the game
 *   literally becomes "too slow" on exactly the hardware where it already felt worst. This module
 *   steps a FIXED 1/120 s tick and burns up to 16 of them per frame, so the simulation runs at
 *   real time down to ~7.5 fps and is deterministic besides.
 *
 * WHAT GALAGA ACTUALLY IS, and what is therefore built here:
 *   1. a FORMATION that flies in on swooping arcs and locks into a grid, and breathes there;
 *   2. individual enemies BREAKING OUT to dive at you on curved paths, shooting;
 *   3. escalation per wave — more of them, diving more often, more at once;
 *   4. a reason to take risks: a diving enemy is worth 3× a parked one, so the safe play is the
 *      poor play;
 *   5. THE CAPTURE. Galaga's best idea: a boss steals your fighter, and you can go and get it
 *      back for double firepower. Here it is THE RIP — which is the studio's own word for the
 *      moment of anticipation, and it is a genuine gamble: kill the ripper in formation and your
 *      captive ship dies with it.
 *   6. a CHALLENGING STAGE every fourth wave — sixteen enemies that never shoot, flying patterns,
 *      all-or-nothing bonus. Nothing can hurt you and there is nothing to win but the having-done
 *      -it, which is this studio's stated ethos rather than a nod to it.
 *
 * This file knows NOTHING about PlayCanvas, canvases, or the DOM. `js/rrpc-app.js` owns the
 * engine and knows none of the rules. The split is what makes both testable: pacing is measured
 * off G, and pixels are measured off the frame, and neither measurement can lie about the other.
 *
 * ── ⛔ THE SECOND VERDICT, AND WHAT IT SAYS ABOUT THE FIRST ────────────────────────────────────
 * Everything above describes a PORT that succeeded. The artist then played it:
 *
 *     "Why is Rip Rocketer ship so slow, and what happened to the metal slug integration and the
 *      ship being way better and more tactical (dies every 1/2 seconds) impossible to fly."
 *
 * ⚑ THE HONEST READING IS THAT THE GAMEPLAY BRIEF WAS NEVER DELIVERED. The original ask was
 *   "moving forward like metal slug on acid and galaga, but we need the best ship and guns in the
 *   universe to outman these fleets — we are just one ship, the ship needs fast combos for movement
 *   and a physics system that is out of this world and defense rolls." What shipped answered the
 *   *density* half of that and none of the rest: there were no combos, no dash, no roll, no
 *   physics beyond a damped velocity, and the guns opened on two bolts.
 *
 * ⚑ AND IT WAS MEASURED BEFORE IT WAS ANSWERED, again, because "impossible to fly" is a game-feel
 *   complaint and those are the ones most worth putting a number on. Seven seeds, a dodging bot,
 *   the fixed tick, seconds ALIVE AND VULNERABLE per life lost:
 *
 *       ship top speed          2.08 u/s   (the code's own comment claimed 7.5)
 *       field crossing          6.06 s     (the comment claimed 1.7)
 *       enemy bolt speed        8.6 u/s    — 4.1× faster than the player
 *       TTK, dodging bot        0.72 s     ← "dies every 1/2 seconds", literally
 *       TTK, idle bot           0.33 s
 *       whole 3-life run        ~11 s
 *       clock spent playable    20%        (the rest is respawn and invulnerable blink)
 *       cause of every death    enemy bullets, 100%, at a mean of 2–3 bullets on screen
 *
 *   It was never a bullet wall. The ship could not get out of the way of anything, and the cause
 *   was one exponent — see the SHIP block below, which is where both complaints get fixed at once.
 *
 * The brief's own list, and where each now lives:
 *     fast combos for movement  → doDash / doRoll / bumpFlow / OVERDRIVE
 *     defence rolls             → doRoll, i-frames + the shock that clears incoming fire
 *     physics out of this world → SHIP.DRAG per second, wall BOUNCE, RECOIL, impulse dash
 *     best ship and guns        → GUNS (pierce at the top), BOLT_V/BOLT_CAP, open on the tri
 *     survivable enough to use any of it → hitShip's shield pool + regen
 */
window.RRGame = (function () {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TAU = Math.PI * 2;

  // ── the field ───────────────────────────────────────────────────────────────────────────────
  /* One plane, seen with real perspective. The formation sits at the top a little further away
   * than you; divers swing THROUGH the camera plane, which is the whole reason this is 3D and not
   * a sprite grid — a card that comes at you and grows is a different event from one that slides
   * down the screen. */
  const F = {
    /* ⚠ THESE ARE FRAMING NUMBERS AND THE FIRST SET WAS OFF THE SCREEN AT BOTH ENDS. With the
     * camera at z 11.4 and a 42° vertical fov the visible band at z=0 is y ∈ [-4.52, +4.22], so
     * the old FORMY 4.05 put the formation's top row 96% of the way up — clipped by the frame and
     * sitting under the HUD — while SHIPY -3.4 put the ship 87% down, behind the controls legend.
     * Verified by screenshot, which is the one thing screenshots ARE reliable for here. */
    X: 6.3,                    // playable half-width
    YTOP: 0.30, YBOT: -3.9,    // the SHIP's box. Deliberately the lower third: Galaga's silhouette
                               // is "them up there, you down here", and free vertical movement
                               // dissolves it into a twin-stick game. YTOP stops below the bottom
                               // formation row (y ≈ 0.87) so you can never stand inside the grid —
                               // 0.30 keeps that clearance while giving the dash/roll somewhere to go.
    SHIPY: -3.05,
    COLS: 9, ROWS: 4,
    COLW: 1.30, ROWH: 0.86,
    FORMY: 3.45,               // top row — clear of the frame edge and of the HUD
    FORMZ: -1.2, ROWZ: 0.22,   // rows step toward the camera so the grid has depth
    ZNEAR: 2.6,                // a diver may come this far past the formation plane
  };

  // ── enemy kinds ─────────────────────────────────────────────────────────────────────────────
  /* pts / dpts: parked vs DIVING. The ratio is the risk/reward statement — 3× for fighting the
   * thing that is actively trying to kill you. Galaga's own split is 50/100..800; ours is flatter
   * because our dives are more frequent. */
  const KIND = [
    { name: 'grunt',   hp: 1, pts: 50,  dpts: 160, fire: 1.0, sz: 0.42 },
    { name: 'flanker', hp: 2, pts: 80,  dpts: 260, fire: 1.4, sz: 0.46 },
    { name: 'ripper',  hp: 4, pts: 400, dpts: 900, fire: 1.6, sz: 0.62 },
  ];

  // ── THE SHIP ────────────────────────────────────────────────────────────────────────────────
  /* ⛔ THE VERDICT WAS "so slow … dies every 1/2 seconds … impossible to fly", AND BOTH HALVES OF
   *    THAT WERE ONE ARITHMETIC BUG. It is worth writing out, because the bug was invisible in the
   *    code and loud in the game.
   *
   *    The old line was `const d = Math.pow(0.88, h * 120); s.vx *= d;` inside a fixed h = 1/120 s
   *    tick. `Math.pow(0.88, (1/120)*120)` is `Math.pow(0.88, 1)` — 0.88 PER TICK, i.e. 0.88^120 =
   *    2.2e-7 per second. The comment next to it said the ship "settles at ~7.5 u/s, which crosses
   *    the 12.6-unit field in 1.7 s". MEASURED, it settled at **2.08 u/s and crossed in 6.06 s**.
   *    The drag was 120× stronger than its own author intended.
   *
   *    ⚑ And that is ALSO the survivability bug, which is why the two complaints are one fix.
   *    EBOLT_V is 8.6 u/s: enemy fire arrived **4.1× faster than the player could move**. Measured
   *    against a dodging bot, the ship survived a median of **0.72 vulnerable seconds per life**
   *    (0.33 s idle) and a whole run lasted ~11 s — with a mean of only 2–3 enemy bullets alive.
   *    It was never a bullet wall. You simply could not get out of the way of anything.
   *
   *    Section 9's precedent (CLAUDE.md: "TTK is the load-bearing number") applies verbatim: below
   *    a survivable TTK, no tactic can exist, because nobody lives long enough to use one. Rolls,
   *    dashes and combos would all have been decoration on top of a ship that dies in 0.7 s.
   *
   * ⚑ DRAG IS NOW PER SECOND AND THE TOP SPEED IS DERIVED, NOT GUESSED. With `v *= DRAG^h` the
   *   terminal speed is ACC/(−ln DRAG) for small h — 78 / 7.99 = 9.77 u/s derived, and **9.44 u/s
   *   MEASURED** on the discrete 1/120 s tick (the tick loses 3% to the finite step; both numbers
   *   are recorded because a derivation that is never checked against the loop is how the 120× got
   *   in here in the first place). The 12.6-unit field crosses in **1.46 s measured** from a
   *   standing start at the wall, 1.33 s asymptotic — against **6.12 s measured before**. Galaga's
   *   ship crosses in ~1.6 s; the brief asked for faster than Galaga. `_selfCheck()` re-derives the
   *   whole set from the constants, so a future edit cannot move them silently.
   *
   * ⚠ THE RESPONSE IS *NOT* UNCHANGED, and an earlier draft of this comment claimed it was — which
   *   is the same species of unchecked claim as the bug above, so it is corrected here rather than
   *   quietly deleted. The time constant is 1/−ln(DRAG): the old build's was 0.065 s (90% of its
   *   2.08 u/s in 0.158 s), this one's is 0.125 s (90% of 9.76 u/s in 0.288 s). The ship is
   *   deliberately HEAVIER as well as faster — that is the "physics system that is out of this
   *   world" half of the brief, and it is what makes the dash worth having, since the dash is the
   *   instant direction change the cruise no longer gives you for free.
   */
  const SHIP = {
    ACC: 78,            // u/s² lateral
    DRAG: 0.00034,      // PER SECOND. −ln(0.00034) = 7.99 ⇒ top ≈ 9.76 u/s, τ = 0.125 s
    VACC: 0.80,         // vertical accel as a fraction of lateral — a rocket climbs well
    BOUNCE: 0.42,       // the wall gives some back. A dead stop at the wall has no mass in it.
    RECOIL: 1.35,       // each volley shoves you DOWN. Firing while climbing is a real trade.

    /* THE DASH — offensive movement, and the first half of "fast combos for movement". */
    DASH_V: 27, DASH_T: 0.17, DASH_CD: 0.30, DASH_I: 0.10,

    /* THE DEFENCE ROLL — the brief asked for this by name. i-frames are the point: 0.30 s of the
     * 0.42 s roll is invulnerable, so a read beats a bullet. It is also the ONLY way to delete
     * incoming fire — the roll's shock ring clears every enemy bolt inside ROLL_SHOCK units, which
     * is what makes it a defence you can see working rather than a timing window you have to
     * take on faith. */
    ROLL_T: 0.42, ROLL_I: 0.30, ROLL_CD: 0.70, ROLL_V: 19, ROLL_SHOCK: 1.85,

    /* THE FLOW — chain a dash or a roll inside FLOW_WIN of the last one and it counts. Three in a
     * chain lights OVERDRIVE. This is what makes movement OFFENSIVE, which is the Metal Slug half
     * of the brief: you are not dodging in order to survive, you are dodging in order to hit
     * harder. It cannot be farmed in a corner — the cooldowns mean a chain costs ~1 s of committed
     * movement, and committed movement is exactly where the bullets are. */
    /* ⚠ OD_CD IS LOAD-BEARING AND THE FIRST BUILD OF THIS SYSTEM DID NOT HAVE IT. Measured over
     * seven 180 s runs with a bot that chases the flow: overdrive was live for **114 of 180
     * seconds — 66% uptime**, because a dash comes off cooldown every 0.47 s and FLOW_WIN is
     * 1.15 s, so the chain simply never breaks and each new chain extended the timer. A reward
     * that is on two-thirds of the time is not a reward, it is the base state with a colour on it,
     * and it silently made every gun number in the file wrong. So: the flow can no longer EXTEND a
     * live overdrive, and once it drops there is a relight lockout. Overdrive is a burst you spend,
     * not a mode you live in. */
    FLOW_WIN: 1.15, FLOW_OD: 3, OD_T: 4.2, OD_CD: 6.0,
    OD_RATE: 1.7, OD_DMG: 1.6, OD_SPD: 1.22, OD_CAP: 2,

    /* SURVIVABILITY. A hit spends a SHIELD pip, not a life — Section 9's armour pool, in this
     * game's language — and pips come back after REGEN clean seconds, which is Section 9's
     * out-of-combat regen almost to the number (4.5 s there). ⚑ The dead time was as bad as the
     * dying: the old build spent 80% of its wall clock in respawn + blink, so a "10-second run"
     * contained about two playable seconds. */
    SHIELD: 3, REGEN: 6.5, HIT_I: 1.05, RESPAWN: 0.9, DEATH_I: 1.8,
  };
  /* Derived, so the numbers in the comment above cannot drift away from the code. */
  function shipTop(loadSpeed) { return SHIP.ACC * (loadSpeed || 1) / -Math.log(SHIP.DRAG); }
  function _selfCheck() {
    const top = shipTop(1);
    return { topSpeed: +top.toFixed(2), crossSec: +((F.X * 2) / top).toFixed(2),
      tau: +(1 / -Math.log(SHIP.DRAG)).toFixed(3), dragPerTick: +Math.pow(SHIP.DRAG, 1 / 120).toFixed(4) };
  }

  // ── cubic bezier, and its tangent (used for banking) ────────────────────────────────────────
  function bez(p, u, out) {
    const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    out.x = a * p[0] + b * p[3] + c * p[6] + d * p[9];
    out.y = a * p[1] + b * p[4] + c * p[7] + d * p[10];
    out.z = a * p[2] + b * p[5] + c * p[8] + d * p[11];
    return out;
  }
  function bezT(p, u, out) {
    const v = 1 - u, a = 3 * v * v, b = 6 * v * u, c = 3 * u * u;
    out.x = a * (p[3] - p[0]) + b * (p[6] - p[3]) + c * (p[9] - p[6]);
    out.y = a * (p[4] - p[1]) + b * (p[7] - p[4]) + c * (p[10] - p[7]);
    out.z = a * (p[5] - p[2]) + b * (p[8] - p[5]) + c * (p[11] - p[8]);
    return out;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  function create() {
    const G = {
      mode: 'gate', t: 0, score: 0, wave: 0, lives: 3, staked: false,
      phase: 'entry', phaseT: 0, waveT: 0, msg: '', msgT: 0, bigMsg: '', bigMsgT: 0,
      /* ⚑ `inv` is the RESPAWN blink (it flashes the ship). `iframe` is the DASH/ROLL window and it
       * must NOT blink — a rolling ship is doing something visible and readable, and flickering it
       * would hide the one frame the player is reading. Two names because they are two things;
       * `invuln()` is the single test everything hostile asks. */
      ship: { x: 0, y: F.SHIPY, vx: 0, vy: 0, roll: 0, pitch: 0, alive: true, respawn: 0, inv: 2,
              iframe: 0, dual: false, ripped: false, gun: 1, rapid: 0, fireT: 0,
              shield: SHIP.SHIELD, shieldMax: SHIP.SHIELD, sinceHit: 0,
              dash: 0, dashCd: 0, dashDir: 0, rollT: 0, rollCd: 0, rollDir: 0, spin: 0,
              flow: 0, flowT: 0, od: 0, odCd: 0, odPeak: 0 },
      enemies: [], bullets: [], ebullets: [], pops: [], beams: [], pows: [],
      chain: 0, mult: 1, bestChain: 0, bombs: 1,
      shots: 0, hits: 0, waveShots: 0, waveHits: 0,
      shake: 0, flash: 0, dist: 0,
      /* set by the app from RipPowers — the staked deck is allowed to change the numbers, which is
       * the studio thesis stated as a mechanic rather than as a paragraph. Defaults are neutral. */
      loadout: { dmg: 1, rate: 1, shield: 0, speed: 1, score: 1, guns: [] },
      /* live chain: flavour only. It tints, it names the wave, it nudges aggression a little. It
       * does NOT gate a single spawn — that was the old build's structural bug. */
      market: { hue: 168, heat: 1, block: 0, weather: 'reading chain…' },
      rng: mulberry32(0x1234),
      diveT: 1.1, ripper: null, captive: null,
      /* ⚑ SOUND WITHOUT A DEPENDENCY. The simulation must not know that an AudioContext exists —
       * it is measured headlessly and it has to run with no DOM at all. So it appends event names
       * to `ev` and js/rrpc-app.js drains the queue each frame. One array, no callbacks to wire up
       * per event, and a headless run can assert on the queue instead of on a speaker. */
      ev: [],
      stat: newStat(),
    };
    return G;
  }
  /* ⚑ `vulnT` IS THE TTK INSTRUMENT AND IT LIVES IN THE SIMULATION ON PURPOSE. Wall-clock time
   * between deaths flatters this game badly: the old build spent 80% of its clock in respawn and
   * invulnerable blink, so "a death every 3.6 s" was really "a death every 0.7 s of actually
   * playing". Seconds ALIVE AND VULNERABLE per life lost is the number the player feels, it is the
   * number the artist reported, and having it inside G means the browser and the headless probe
   * measure the same quantity instead of two different ones. */
  function newStat() {
    return { threatEvents: 0, dives: 0, ebullets: 0, waves: 0, peakEnemies: 0, subSteps: 0,
      deaths: 0, dByShot: 0, dByRam: 0, dByRip: 0,
      vulnT: 0, invT: 0, deadT: 0, shieldHits: 0, rolls: 0, dashes: 0, shocks: 0,
      overdrives: 0, odT: 0, bestFlow: 0, bulletsCleared: 0 };
  }
  const invuln = s => s.inv > 0 || s.iframe > 0;

  // ── formation geometry ──────────────────────────────────────────────────────────────────────
  function slotXYZ(G, col, row, out) {
    /* the breathing. Two out-of-phase sines so the grid rocks rather than slides — a pure
     * translation reads as the camera moving, not as a swarm holding station. */
    const s = Math.sin(G.waveT * 0.9) * 0.62 + Math.sin(G.waveT * 0.37) * 0.30;
    const bob = Math.sin(G.waveT * 1.7 + row * 0.6) * 0.10;
    out.x = (col - (F.COLS - 1) / 2) * F.COLW + s;
    out.y = F.FORMY - row * F.ROWH + bob;
    out.z = F.FORMZ + row * F.ROWZ;
    return out;
  }

  // ── waves ───────────────────────────────────────────────────────────────────────────────────
  /* Every number below is a PACING number, and each is written next to the thing it controls so
   * the escalation can be read off in one place instead of being distributed through the code.
   *   count      how full the screen is
   *   diveGap    seconds between dive launches — the single biggest knob on "relentless"
   *   maxDive    how many can be diving at once
   *   eFire      enemy shots per second per diver
   *   speed      dive path speed multiplier
   * The old build's equivalents were: count ~2, diveGap ∞, maxDive 0, eFire 0. */
  function waveSpec(w) {
    const bonus = (w % 4 === 0);
    return {
      bonus,
      /* ⚠ EVERY CEILING HERE USED TO BE REACHED BY WAVE 10 AND THEN THE GAME STOPPED ESCALATING.
       * With the ship fixed, that showed up immediately: a bot using the movement system ran to
       * wave 18+ without the pressure ever rising again, because eFire capped at wave 10, maxDive
       * at 7, count at 7 and speed at 15 — past that, wave 30 was wave 15 with a bigger number on
       * the HUD. The caps are raised, not the ramps: waves 1–8 are numerically IDENTICAL to what
       * was measured, and the escalation simply keeps going instead of flattening. */
      count: bonus ? 16 : Math.min(40, 24 + (w - 1) * 2),
      diveGap: Math.max(0.26, 1.15 - (w - 1) * 0.085),
      maxDive: Math.min(10, 2 + Math.floor(w * 0.8)),
      /* ⚠ eFire IS THE DIFFICULTY DIAL AND IT TOOK THREE PASSES TO GET RIGHT. 0.85 first: measured
       * with a dodging bot, three lives gone in 9 seconds and wave 2 never reached. 0.50 next:
       * still 3-4 deaths inside 15 seconds, and the death-cause counters said all of them were
       * BULLETS (dByShot 3, dByRam 0, dByRip 0) — which is what sent this here rather than to the
       * collision boxes. Density is the brief; a wall of aimed fire on wave 1 is just the opposite
       * failure with better production values, and it is the one that makes a game feel unfair
       * rather than hard. 0.34 opens with roughly one bullet in the air and the steeper 0.26 ramp
       * still reaches the old 0.85 by wave 3 and the cap by wave 10. The pressure on wave 1 is
       * meant to come from DIVERS and from things filling the screen — those never went down. */
      eFire: bonus ? 0 : Math.min(3.4, 0.34 + (w - 1) * 0.26),
      /* ⚑ A HARD CEILING ON LIVE ENEMY FIRE, which the old build did not have at all. eFire is a
       * RATE, and a rate with no ceiling means wave 10's screen is decided by how many enemies
       * happen to be alive rather than by a designed number. This is the "fewer enemy bullets"
       * lever in the brief, expressed as a budget rather than as a nerf: on wave 1 the cap (6) is
       * above what the game already produces (measured mean 2–3), so early waves are unchanged and
       * only the late-wave wall is capped. ⚠ It is a CAP, not a queue — a shot suppressed by the
       * budget is simply not taken, so the pressure comes off smoothly instead of arriving late. */
      maxEB: bonus ? 0 : Math.min(22, 6 + (w - 1) * 1.15),
      speed: Math.min(2.5, 1 + (w - 1) * 0.075),
      ripper: !bonus && w >= 2,
    };
  }

  function buildWave(G) {
    const w = G.wave, spec = waveSpec(w);
    G.spec = spec;
    G.phase = spec.bonus ? 'bonus' : 'entry';
    G.phaseT = 0; G.waveT = 0;
    G.enemies.length = 0; G.ebullets.length = 0; G.beams.length = 0;
    G.waveShots = 0; G.waveHits = 0;
    G.ripper = null;
    G.diveT = spec.bonus ? 0.6 : 0.7;
    const rng = G.rng;

    /* Entry is STAGGERED IN SQUADS, not all at once. Galaga flies four or five in at a time from
     * alternating sides and that is what makes an entry feel choreographed instead of like a
     * level loading. delay = squad index × 0.42 s. */
    const N = spec.count;
    for (let i = 0; i < N; i++) {
      const col = i % F.COLS, row = (i / F.COLS) | 0;
      const squad = (i / 5) | 0;
      const side = (squad % 2) ? 1 : -1;
      let kind = 0;
      if (!spec.bonus) {
        if (row === 0) kind = 1;                         // the back row is tougher: shooting into
        else if (row === 1 && rng() < 0.35) kind = 1;    // the formation should get harder, not easier
      }
      const e = {
        id: i, col, row, kind, hp: KIND[kind].hp, state: 'entry',
        x: 0, y: 0, z: 0, u: 0, dur: 1.35 + rng() * 0.4, delay: squad * 0.42 + (i % 5) * 0.075,
        path: null, roll: 0, pitch: 0, spin: (rng() * 2 - 1) * 3.4, tumble: rng() * TAU,
        fireT: 0.6 + rng() * 0.9, hue: (G.market.hue + i * 13) % 360, art: i % 14,
        dived: 0, holds: null,
      };
      entryPath(G, e, side, rng);
      G.enemies.push(e);
    }
    /* THE RIPPER goes in the middle of the back row where it is hardest to reach — you have to
     * shoot past three rows to get it in formation, or wait for it to come to you. That choice IS
     * the mechanic. */
    if (spec.ripper) {
      const mid = G.enemies.find(e => e.row === 0 && e.col === (F.COLS >> 1)) || G.enemies[0];
      if (mid) { mid.kind = 2; mid.hp = KIND[2].hp; G.ripper = mid; }
    }
    G.stat.waves++;
    G.ev.push('wave');
    G.bigMsg = spec.bonus ? 'CHALLENGE ·  N O   S H O O T I N G' : 'WAVE ' + w;
    G.bigMsgT = 1.6;
  }

  function entryPath(G, e, side, rng) {
    /* Off-screen high on one side → a swing across and DOWN past the player's eyeline → up into
     * the slot. The middle control point is deliberately below the formation so the arc dips into
     * the play area on the way in: an entry you have to dodge is content, an entry that slides in
     * over the top is a loading screen. */
    const sx = side * (F.X + 3.4), sy = 5.4 + rng() * 1.6, sz = -6 - rng() * 2;
    const c1x = side * (F.X * 0.55), c1y = -2.6 - rng() * 1.4, c1z = 1.4 + rng() * 1.6;
    const c2x = -side * (F.X * 0.75), c2y = 1.0 + rng() * 1.5, c2z = -3.4;
    e.path = [sx, sy, sz, c1x, c1y, c1z, c2x, c2y, c2z, 0, 0, 0];   // endpoint filled per-frame
    e.u = 0;
  }

  function divePath(G, e, rng) {
    /* A dive has to threaten the SHIP, not the middle of the screen. c1 pulls hard toward the
     * player's current x and TOWARD THE CAMERA (positive z) — the near-miss where a card fills the
     * frame is the single most "on acid" thing this game does and it is worth aiming for
     * explicitly. c2 overshoots past the ship so the exit is a flyby, not a stop. */
    const px = G.ship.x, sgn = Math.sign(px - e.x) || (rng() < 0.5 ? -1 : 1);
    const wide = 1.4 + rng() * 2.2;
    const c1x = px + sgn * -wide, c1y = 1.2 - rng() * 2.4, c1z = F.ZNEAR * (0.5 + rng() * 0.5);
    const c2x = px + sgn * wide * 0.7, c2y = F.SHIPY + (rng() * 1.4 - 0.5), c2z = 0.4 + rng() * 1.2;
    const ex = px + sgn * (2.5 + rng() * 4), ey = -7.5, ez = -1 + rng() * 3;
    e.path = [e.x, e.y, e.z, c1x, c1y, c1z, c2x, c2y, c2z, ex, ey, ez];
    e.u = 0;
    e.dur = (1.55 + rng() * 0.5) / G.spec.speed;
    e.state = 'dive';
    /* the first shot lands 0.4-0.7 s into the dive, not 0.2 — a diver shot down on approach should
     * not already have fired. It is what makes shooting the divers (the thing worth 3×) also the
     * thing that reduces incoming fire, instead of two unrelated decisions. */
    e.fireT = 0.4 + rng() * 0.3;
    e.dived++;
    G.stat.dives++;
  }

  function returnPath(G, e, rng) {
    /* Galaga's divers do not despawn — they come back over the top and re-enter the formation.
     * Keeping them means the on-screen count does not decay across a wave, which is exactly the
     * failure mode the old build had (spawn, drift, vanish, screen empties). */
    const side = e.x > 0 ? 1 : -1;
    e.path = [e.x, 6.6, e.z, side * (F.X + 2), 5.2, -4, -side * F.X * 0.6, 3.0, -3, 0, 0, 0];
    e.u = 0; e.dur = 1.05 + rng() * 0.3; e.state = 'entry';
  }

  // ── bonus-wave choreography ─────────────────────────────────────────────────────────────────
  /* Three patterns, picked off the chain block so the challenge stage is the one place the chain
   * genuinely authors something. None of them shoot. All of them are legible as a SHAPE, because
   * the whole point of a challenging stage is that it looks like a performance. */
  function bonusPos(G, e, out) {
    const p = G.market.block % 3, u = G.phaseT * 0.55 + e.id * 0.135;
    if (p === 0) {                                     // double helix down the screen
      out.x = Math.sin(u * 2.1) * 5.2;
      out.y = 5.6 - ((G.phaseT * 1.5 + e.id * 0.42) % 12);
      out.z = Math.cos(u * 2.1) * 3.4;
    } else if (p === 1) {                              // kaleidoscope rosette
      const a = e.id / 16 * TAU + G.phaseT * 0.8, r = 2.2 + Math.sin(G.phaseT * 1.3 + e.id) * 2.1;
      out.x = Math.cos(a) * r * 1.5; out.y = 0.6 + Math.sin(a * 3) * r * 0.75;
      out.z = Math.sin(a * 2 + G.phaseT) * 2.6;
    } else {                                           // figure-eight conga past the camera
      const a = u * 1.7;
      out.x = Math.sin(a) * 5.6; out.y = 1.2 + Math.sin(a * 2) * 2.8;
      out.z = -3 + Math.cos(a) * 4.4;
    }
    return out;
  }

  // ── MOVEMENT COMBOS: THE DASH, THE DEFENCE ROLL, AND THE FLOW ───────────────────────────────
  /* The artist's brief, verbatim: "the ship needs fast combos for movement and a physics system
   * that is out of this world and defense rolls." None of it existed. This is it.
   *
   * ⚑ THE DESIGN RULE THAT MAKES IT A COMBO SYSTEM RATHER THAN TWO BUTTONS: neither move scores
   *   anything by itself. Chaining them inside FLOW_WIN does. So the reward for good movement is
   *   MORE FIREPOWER, which means dodging and attacking stop being separate activities — that is
   *   the Metal Slug feel the one-line brief was pointing at, and it is the thing a pure Galaga
   *   formation game does not have.
   * ⚑ AND IT CANNOT BE FARMED. Both moves have cooldowns, so a chain costs about a second of
   *   committed, telegraphed movement — and committed movement in this game is exactly where the
   *   bullets are. You buy overdrive by going somewhere dangerous on purpose. */
  function bumpFlow(G, kind) {
    const s = G.ship;
    s.flow = (s.flowT > 0 ? s.flow : 0) + 1;
    s.flowT = SHIP.FLOW_WIN;
    if (s.flow > G.stat.bestFlow) G.stat.bestFlow = s.flow;
    if (s.flow >= SHIP.FLOW_OD && s.od <= 0 && s.odCd <= 0) {
      s.od = SHIP.OD_T; s.odPeak = s.flow; s.odCd = SHIP.OD_T + SHIP.OD_CD;
      G.stat.overdrives++;
      G.bigMsg = '⚡ OVERDRIVE'; G.bigMsgT = 1.5; G.ev.push('overdrive'); G.flash = Math.max(G.flash, 0.7);
    } else if (s.flow >= SHIP.FLOW_OD && s.odCd > 0 && s.od <= 0) {
      G.msg = 'flow ' + s.flow + ' · charging'; G.msgT = 0.7;
    } else {
      G.msg = kind.toUpperCase() + ' · flow ' + s.flow; G.msgT = 0.7;
    }
  }

  function doDash(G, dir) {
    const s = G.ship;
    if (!s.alive || s.dashCd > 0 || s.rollT > 0) return false;
    s.dashDir = dir || 1;
    s.dash = SHIP.DASH_T; s.dashCd = SHIP.DASH_CD + SHIP.DASH_T;
    /* the impulse ADDS to whatever you already had, capped — so dash-out-of-a-dash is faster than
     * a standing dash, which is what makes chaining them feel like acceleration rather than like
     * pressing the same button twice. */
    s.vx = clamp(s.vx + s.dashDir * SHIP.DASH_V, -SHIP.DASH_V * 1.5, SHIP.DASH_V * 1.5);
    s.iframe = Math.max(s.iframe, SHIP.DASH_I);
    G.stat.dashes++;
    G.ev.push('dash');
    bumpFlow(G, 'dash');
    return true;
  }

  /* THE DEFENCE ROLL. 0.30 s of the 0.42 s roll is invulnerable, and — the part that makes it a
   * defence you can SEE rather than a timing window you take on faith — it detonates a shock that
   * deletes every enemy bolt within ROLL_SHOCK units. In OVERDRIVE the same shock also bites
   * divers for 1. One rule, escalating; not two mechanics. */
  function doRoll(G, dir) {
    const s = G.ship;
    if (!s.alive || s.rollCd > 0 || s.rollT > 0) return false;
    s.rollDir = dir || 0;
    s.rollT = SHIP.ROLL_T; s.rollCd = SHIP.ROLL_CD + SHIP.ROLL_T; s.spin = 0;
    s.iframe = Math.max(s.iframe, SHIP.ROLL_I);
    if (s.rollDir) s.vx = clamp(s.vx + s.rollDir * SHIP.ROLL_V, -SHIP.DASH_V * 1.5, SHIP.DASH_V * 1.5);
    else s.vy += 3.0;                                  // a standing roll pops you up out of the lane
    G.stat.rolls++;
    rollShock(G);
    G.ev.push('roll');
    bumpFlow(G, 'roll');
    return true;
  }

  function rollShock(G) {
    const s = G.ship, R = SHIP.ROLL_SHOCK;
    let n = 0;
    for (const b of G.ebullets) {
      if (!b.live) continue;
      if (Math.hypot(b.x - s.x, b.y - s.y) < R && Math.abs(b.z) < 3) { b.live = false; n++; }
    }
    if (s.od > 0) {
      for (const e of G.enemies) {
        if (e.state !== 'dive' && e.state !== 'beam') continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) < R * 1.15 && Math.abs(e.z) < 2.2) {
          e.hp -= 1; e.hurt = 0.25;
          if (e.hp <= 0) killEnemy(G, e); else G.ev.push('ping');
        }
      }
    }
    G.stat.shocks++; G.stat.bulletsCleared += n;
    // a shock ring for the renderer. `shock` rather than `boom`: it is not an explosion.
    G.pops.push({ x: s.x, y: s.y, z: 0, shock: 1, t: 0, life: 0.42, hue: 168, r: R });
    if (n) { G.msg = '↻ ' + n + ' CLEARED'; G.msgT = 0.8; }
  }

  // ── firing ──────────────────────────────────────────────────────────────────────────────────
  /* ⚑ "THE BEST SHIP AND GUNS IN THE UNIVERSE" IS A DESIGN CONSTRAINT, NOT FLAVOUR TEXT, and the
   * old table did not meet it: you opened on `twin`, two bolts on screen, at 16 u/s under a ship
   * that moved 2 u/s. Every gun now has a CHARACTER rather than one more bolt than the last —
   * spread, cadence and, at the top, PIERCE, which is the one property that makes a weapon read as
   * overwhelming rather than merely numerous. You open on `tri` and never drop below it. */
  const GUNS = [
    { bolts: [0, 0], off: [-0.24, 0.24], rate: 0.115, dmg: 1, name: 'twin' },
    { bolts: [-0.11, 0, 0.11], off: [-0.3, 0, 0.3], rate: 0.100, dmg: 1, name: 'tri' },
    { bolts: [-0.2, -0.07, 0.07, 0.2], off: [-0.42, -0.16, 0.16, 0.42], rate: 0.090, dmg: 1.2, name: 'quad' },
    { bolts: [-0.34, -0.13, 0, 0.13, 0.34], off: [-0.5, -0.24, 0, 0.24, 0.5], rate: 0.080, dmg: 1.7, name: 'penta' },
    { bolts: [-0.42, -0.17, 0, 0.17, 0.42], off: [-0.56, -0.26, 0, 0.26, 0.56], rate: 0.066, dmg: 2.6,
      name: 'MAX plasma', laser: true, pierce: 2 },
  ];
  /* ⚑ BOLT SPEED AND THE BULLET CAP ARE ONE DECISION, AND THE FIRST VERSION GOT IT WRONG.
   * At 27 u/s with no cap, a bot that simply held fire under the formation cleared 13 of 18
   * enemies in 4.3 seconds — MEASURED, in the first headless run. A wave that evaporates before
   * it has finished flying in is not "relentless", it is a different kind of empty, and it makes
   * the accuracy bonus meaningless because nearly every shot lands in a wall.
   *
   * The fix is Galaga's own rule, and it is the single most load-bearing constraint in that game:
   * TWO BULLETS ON SCREEN. Firing is free; MISSING costs you half your firepower until the bolt
   * leaves the top of the screen. That is what makes the chain-halving penalty a real decision
   * rather than a scold, and it is why the fire rate can stay generous.
   *   cap 2 per rig (4 with the DOUBLE RIG) · 16 u/s ⇒ ~0.46 s to the formation, ~0.63 s to miss
   *   ⇒ ~4.3 effective shots/s hitting, ~3.2 missing.
   *
   * ⚠ THAT REASONING IS STILL RIGHT AND THE NUMBERS WERE STILL WRONG, for a reason the original
   *   could not have known: it was calibrated against a ship that (bug, see the SHIP block) moved
   *   at 2.08 u/s. Galaga's two-bullet rule works because Galaga's ship crosses the screen in 1.6 s
   *   — the cap is a constraint on a FAST ship. Bolted onto a ship that could not get anywhere, it
   *   was not a decision, it was a second handbrake.
   * ⚑ SO THE RULE IS KEPT AND THE NUMBERS ARE RE-DERIVED AGAINST THE FIXED SHIP. Bolts fly at 30
   *   u/s (was 16 — a bolt slower than three times the ship's own top speed reads as a lob), and
   *   the cap is 4 per rig, +2 in overdrive. Firing is still free and MISSING still costs you
   *   firepower until the bolt leaves the screen; the accuracy bonus and the chain still pay for
   *   aiming. What changed is that the ceiling is now reachable by a ship that can move.
   * ⚠ Do not delete the cap. A cap of Infinity is the hose, and the hose is the losing game. */
  const BOLT_V = 30, EBOLT_V = 8.6;
  const BOLT_CAP = 4;

  function fire(G) {
    const s = G.ship;
    if (!s.alive || G.mode !== 'play') return;
    const g = GUNS[clamp(s.gun - 1, 0, GUNS.length - 1)];
    const odK = s.od > 0 ? SHIP.OD_RATE : 1;
    const rate = g.rate / (s.rapid > 0 ? 1.75 : 1) / odK / (G.loadout.rate || 1);
    if (G.t - s.fireT < rate) return;
    const rigs = s.dual ? [-0.62, 0.62] : [0];
    const cap = BOLT_CAP + (s.od > 0 ? SHIP.OD_CAP : 0);
    let live = 0; for (const b of G.bullets) if (b.live) live++;
    if (live >= cap * rigs.length * g.bolts.length) return;
    s.fireT = G.t;
    const dmg = g.dmg * (G.loadout.dmg || 1) * (s.od > 0 ? SHIP.OD_DMG : 1);
    for (const rx of rigs) {
      for (let i = 0; i < g.bolts.length; i++) {
        G.bullets.push({ x: s.x + rx + g.off[i], y: s.y + 0.5, z: 0, vx: g.bolts[i] * 9, vy: BOLT_V,
          dmg, laser: !!g.laser, pierce: g.pierce || 0, live: true });
        G.shots++; G.waveShots++;
      }
    }
    /* ⚑ RECOIL. Every volley shoves the ship DOWN. It is small (1.35 u/s against a 9.6 u/s top
     * speed) and it is the difference between a gun that emits bolts and a gun that is bolted to
     * something with mass — with autofire on you feel it as a constant downward pressure you have
     * to fly against, which is free tension and costs one line. */
    s.vy -= SHIP.RECOIL * (rigs.length > 1 ? 1.35 : 1) * 0.35;
    G.muzzle = 1;
    G.ev.push('fire');
  }

  function eFire(G, e) {
    /* Aimed with LEAD, but only partial lead (0.55): a perfectly-led shot from eight enemies at
     * once is unreadable, and an unaimed one is ignorable. Partial lead means moving is the right
     * answer and standing still is the wrong one, which is the behaviour the shot is for. */
    const s = G.ship;
    /* the live-fire budget. See waveSpec.maxEB. */
    if (G.spec && G.spec.maxEB) { let n = 0; for (const b of G.ebullets) if (b.live) n++; if (n >= G.spec.maxEB) return; }
    /* ⚠ LEAD IS SCALED BY THE SHIP'S TOP SPEED, NOT LEFT AT A CONSTANT. 0.55 was tuned against a
     * ship that moved 2.08 u/s; against a 9.6 u/s ship the same coefficient leads far enough ahead
     * that standing still becomes the correct dodge, which inverts the whole intent of the shot. */
    const lead = 0.55 * (2.08 / Math.max(2.08, shipTop(G.loadout.speed || 1)));
    const dx = (s.x + s.vx * lead) - e.x, dy = (s.y - 0.2) - e.y, dz = 0 - e.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    G.ebullets.push({ x: e.x, y: e.y - 0.2, z: e.z, vx: dx / L * EBOLT_V, vy: dy / L * EBOLT_V,
      vz: dz / L * EBOLT_V, hue: e.hue, live: true, seen: false });
    G.stat.ebullets++;
    G.ev.push('efire');
  }

  // ── THE RIP ─────────────────────────────────────────────────────────────────────────────────
  /* Galaga's tractor beam, in this studio's language. The ripper stops mid-dive, opens a beam,
   * and if it holds you for 0.55 s it takes the ship. You lose a life either way — the gamble is
   * afterwards: the captive rides in the ripper's formation slot, and
   *   · kill the ripper WHILE DIVING  → the captive is freed and docks alongside you: DOUBLE RIG,
   *     two ships, twice the guns, twice the hitbox.
   *   · kill the ripper IN FORMATION  → the captive dies with it. Nothing is refunded.
   * That asymmetry is the entire point. Shooting the dangerous thing at the dangerous moment is
   * the only way to get the prize, and the safe shot destroys it. */
  function openBeam(G, e) {
    G.beams.push({ e, t: 0, dur: 1.5, hold: 0, done: false });
    e.state = 'beam'; e.beamT = 0;
  }
  function rip(G) {
    const s = G.ship;
    s.alive = false; s.respawn = 1.5; G.lives--; G.stat.deaths++;
    G.captive = { hue: G.ripper ? G.ripper.hue : 300, freed: false };
    s.ripped = true; s.dual = false;
    G.bigMsg = '◈ RIPPED'; G.bigMsgT = 1.8; G.ev.push('rip'); G.shake = Math.max(G.shake, 22); G.flash = 1;
    if (G.lives <= 0) { G.mode = 'over'; }
  }

  // ── scoring ─────────────────────────────────────────────────────────────────────────────────
  const CHAIN_TIER = [0, 8, 20, 36, 56, 80];
  function multOf(chain) { let m = 1; for (let i = 0; i < CHAIN_TIER.length; i++) if (chain >= CHAIN_TIER[i]) m = i + 1; return m; }
  function award(G, n, x, y, z, big) {
    const v = Math.round(n * G.mult * (G.loadout.score || 1));
    G.score += v;
    G.pops.push({ x, y, z, t: 0, life: big ? 1.5 : 0.9, txt: v >= 1000 ? v.toLocaleString('en-US') : String(v), big: !!big });
    return v;
  }
  function hitScored(G) {
    G.hits++; G.waveHits++; G.chain++;
    if (G.chain > G.bestChain) G.bestChain = G.chain;
    const m = multOf(G.chain);
    if (m !== G.mult) { G.mult = m; G.msg = '×' + m + ' CHAIN'; G.msgT = 1.1; }
  }
  function missed(G) {
    /* A miss HALVES the chain instead of clearing it. Clearing it makes the mechanic a tax on
     * playing at all — you cannot fire an arcade shooter without missing — while halving keeps
     * the incentive ("aim") without the punishment ever feeling arbitrary. */
    if (G.chain <= 0) return;
    G.chain = G.chain >> 1; G.mult = multOf(G.chain);
  }

  // ── the fixed tick ──────────────────────────────────────────────────────────────────────────
  const _v = { x: 0, y: 0, z: 0 }, _t = { x: 0, y: 0, z: 0 }, _s = { x: 0, y: 0, z: 0 };

  function tick(G, h, input) {
    G.t += h;
    if (G.msgT > 0) G.msgT -= h;
    if (G.bigMsgT > 0) G.bigMsgT -= h;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - h * 40);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - h * 3.4);
    if (G.muzzle > 0) G.muzzle = Math.max(0, G.muzzle - h * 9);
    if (G.mode !== 'play') return;
    G.waveT += h; G.phaseT += h;
    G.dist += h * 44 * (1 + G.wave * 0.06);
    const spec = G.spec, rng = G.rng, s = G.ship;

    // ── ship ──
    if (!s.alive) {
      G.stat.deadT += h;
      s.respawn -= h;
      if (s.respawn <= 0 && G.lives > 0) {
        s.alive = true; s.x = 0; s.y = F.SHIPY; s.vx = 0; s.vy = 0; s.inv = SHIP.DEATH_I;
        s.iframe = 0; s.dash = 0; s.rollT = 0; s.spin = 0; s.flow = 0; s.flowT = 0; s.od = 0; s.odCd = 0;
        s.shield = s.shieldMax; s.sinceHit = 0;      // a respawn is a clean slate, not a punishment
        s.gun = Math.max(2, s.gun - 1);              // demote, but never below the tri — see GUNS
      }
    } else {
      if (s.inv > 0) s.inv -= h;
      if (s.iframe > 0) s.iframe -= h;
      if (invuln(s)) G.stat.invT += h; else G.stat.vulnT += h;

      // ── SHIELD REGEN, out of combat. Section 9's rule, and for its reason: a survivable fight is
      //    only interesting if disengaging is a real option. Getting hit resets the clock.
      s.sinceHit += h;
      if (s.shield < s.shieldMax && s.sinceHit >= SHIP.REGEN) {
        s.shield++; s.sinceHit = 0; G.msg = '◈ SHIELD'; G.msgT = 0.9; G.ev.push('regen');
      }

      // ── THE FLOW WINDOW. It decays; overdrive burns down separately.
      if (s.flowT > 0) { s.flowT -= h; if (s.flowT <= 0) s.flow = 0; }
      if (s.od > 0) { s.od -= h; G.stat.odT += h; if (s.od <= 0) { G.msg = 'overdrive out'; G.msgT = 0.8; } }
      if (s.odCd > 0) s.odCd -= h;
      if (s.dashCd > 0) s.dashCd -= h;
      if (s.rollCd > 0) s.rollCd -= h;

      // ── the two new verbs. Edge-triggered by the driver; the simulation owns the rules.
      if (input.dash) doDash(G, input.dashDir || (input.right ? 1 : input.left ? -1 : (s.vx >= 0 ? 1 : -1)));
      if (input.roll) doRoll(G, input.rollDir || (input.right ? 1 : input.left ? -1 : (Math.abs(s.vx) > 0.6 ? Math.sign(s.vx) : 0)));

      const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const ay = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      const spdK = (G.loadout.speed || 1) * (s.od > 0 ? SHIP.OD_SPD : 1);
      const acc = SHIP.ACC * spdK;
      /* ⚑ A DASH AND A ROLL ARE IMPULSES, NOT STATES. They write velocity once and then let the
       * same drag carry them out, so they inherit the ship's whole physics — they bounce off the
       * wall, they blend with the stick, they can be steered mid-flight. A dash implemented as
       * "position += k each tick while held" would be a teleport with an animation on it. */
      if (s.dash > 0) { s.dash -= h; }
      if (s.rollT > 0) {
        s.rollT -= h;
        // the barrel roll itself: one full turn over the roll's duration, eased at the ends
        s.spin += (TAU / SHIP.ROLL_T) * h;
        if (s.rollT <= 0) { s.spin = 0; s.rollDir = 0; }
      }
      if (input.stick) {
        /* the touch stick drives a TARGET velocity, so a thumb at the rim is full speed. It has to
         * scale with the same top speed as the keyboard or the two controls play different games. */
        const top = shipTop(spdK);
        s.vx += (input.sx * top - s.vx) * Math.min(1, h * 16);
        s.vy += (-input.sy * top * SHIP.VACC - s.vy) * Math.min(1, h * 16);
      } else {
        s.vx += ax * acc * h;
        s.vy += ay * acc * SHIP.VACC * h;
      }
      /* ⛔ DRAG IS PER SECOND. `Math.pow(0.88, h*120)` was 0.88 per TICK — see the SHIP block.
       *    Everything about how this ship feels came out of that one exponent. */
      const d = Math.pow(SHIP.DRAG, h);
      s.vx *= d; s.vy *= d;
      s.x += s.vx * h;
      s.y = clamp(s.y + s.vy * h, F.YBOT, F.YTOP);
      if (s.y <= F.YBOT || s.y >= F.YTOP) s.vy *= -0.25;
      /* ⚑ THE WALL GIVES SOME BACK. The old build set `vx = 0` at the edge, which is a ship with no
       * mass hitting a wall with no give — you simply stopped existing sideways. A 0.42 restitution
       * is the cheapest possible "physics system out of this world" and it is the one the player
       * touches most often, because a dash into the wall is a thing that will happen constantly. */
      if (s.x < -F.X) { s.x = -F.X; if (s.vx < 0) { s.vx *= -SHIP.BOUNCE; G.ev.push('bump'); } }
      else if (s.x > F.X) { s.x = F.X; if (s.vx > 0) { s.vx *= -SHIP.BOUNCE; G.ev.push('bump'); } }
      // bank into the turn, pitch into the climb — inertia made visible
      s.roll += (clamp(-s.vx * 0.075, -0.95, 0.95) - s.roll) * Math.min(1, h * 13);
      s.pitch += (clamp(s.vy * 0.055, -0.55, 0.55) - s.pitch) * Math.min(1, h * 9);
      if (s.rapid > 0) s.rapid -= h;
      if (input.fire) fire(G);
    }

    // ── enemies ──
    let alive = 0, diving = 0;
    for (const e of G.enemies) {
      if (e.state === 'dead') continue;
      alive++;
      /* ⚑ TUMBLE ONLY WHILE MOVING. Everything spun at up to 0.54 rev/s including the parked
       * formation, so every enemy was edge-on about half the time and the whole grid read as a
       * field of glowing blobs with a card flickering inside — clearly visible in the first clean
       * screenshot. These are TRADING CARDS and the art is the entire point of the game being
       * this game. So a parked enemy settles face-on with a slow wobble, and only an entry or a
       * dive tumbles. It is also information: the things spinning are the things attacking. */
      if (e.state === 'form') {
        const want = Math.sin(G.waveT * 0.8 + e.id * 0.9) * 0.34;
        e.tumble += (want - e.tumble) * Math.min(1, h * 3.4);
      } else {
        e.tumble += e.spin * h;
      }
      if (e.hurt > 0) e.hurt -= h;   // decayed HERE, not in the renderer: a draw pass that
                                     // mutates the simulation is frame-rate dependent by construction

      if (G.phase === 'bonus') {
        bonusPos(G, e, _v);
        e.roll += ((_v.x - e.x) * 0.5 - e.roll) * Math.min(1, h * 8);
        e.x = _v.x; e.y = _v.y; e.z = _v.z;
        continue;
      }

      if (e.state === 'entry') {
        if (e.delay > 0) { e.delay -= h; e.x = e.path[0]; e.y = e.path[1]; e.z = e.path[2]; continue; }
        slotXYZ(G, e.col, e.row, _s);
        e.path[9] = _s.x; e.path[10] = _s.y; e.path[11] = _s.z;
        e.u = Math.min(1, e.u + h / e.dur);
        bez(e.path, e.u, _v); bezT(e.path, e.u, _t);
        e.x = _v.x; e.y = _v.y; e.z = _v.z;
        e.roll = clamp(-_t.x * 0.055, -1.5, 1.5); e.pitch = clamp(_t.y * 0.03, -1, 1);
        /* one shot on the way in, at the bottom of the arc. Galaga's entry swarms shoot, and it
         * is what puts the first real threat inside two seconds instead of four. */
        if (!e.entryShot && e.u > 0.34 && e.u < 0.62 && s.alive && rng() < 0.18 * spec.eFire) {
          e.entryShot = 1; eFire(G, e);
        }
        if (e.u >= 1) { e.state = 'form'; e.roll = 0; e.entryShot = 0; }
      } else if (e.state === 'form') {
        slotXYZ(G, e.col, e.row, _s);
        e.x = _s.x; e.y = _s.y; e.z = _s.z;
        e.roll *= Math.pow(0.9, h * 60);
        /* Parked enemies still shoot, rarely. Without it the formation is scenery and the only
         * threat is whatever happens to be diving; with it, standing under the grid is never free. */
        e.fireT -= h;
        if (e.fireT <= 0) {
          e.fireT = (9 + rng() * 7) / Math.max(0.4, spec.eFire);
          if (spec.eFire > 0 && Math.abs(e.x - s.x) < 2.6 && s.alive) eFire(G, e);
        }
      } else if (e.state === 'dive') {
        diving++;
        e.u = Math.min(1, e.u + h / e.dur);
        bez(e.path, e.u, _v); bezT(e.path, e.u, _t);
        e.x = _v.x; e.y = _v.y; e.z = _v.z;
        e.roll = clamp(-_t.x * 0.04, -2.2, 2.2); e.pitch = clamp(_t.y * 0.02, -1.2, 1.2);
        e.fireT -= h;
        if (e.fireT <= 0 && s.alive && e.y > s.y - 0.5) {
          e.fireT = 1 / (KIND[e.kind].fire * spec.eFire);
          eFire(G, e);
        }
        if (e.u >= 1) returnPath(G, e, rng);
      } else if (e.state === 'beam') {
        e.beamT += h;
        // the ripper HOLDS position while the beam is open — it is a sitting duck, and that is
        // the window the whole gamble is built around
        e.roll = Math.sin(e.beamT * 9) * 0.35;
        if (e.beamT > 1.5) { divePath(G, e, rng); }
      }
    }

    // ── dive scheduler ──
    /* The relentlessness knob. Launch a dive every `diveGap` seconds while under `maxDive`, and
     * PREFER the enemy nearest the player's column so the dives arrive where the player is rather
     * than where they are not. Random selection produced dives that were frequently ignorable. */
    /* ⚑ Dives begin during the TAIL of the entry, not after it. Waiting for the whole formation to
     * lock put the first dive at ~4.0 s and the first enemy bullet at ~4.2 s — measured — which is
     * a slow start in a game whose entire brief was that it starts slow. The entry itself lasts
     * ~3 s because the squads are staggered, so the last squad is still arriving while the first
     * is already coming back down at you. That overlap is the thing that reads as relentless. */
    if ((G.phase === 'fight' || (G.phase === 'entry' && G.phaseT > 1.0)) && alive > 0) {
      G.diveT -= h;
      if (G.diveT <= 0 && diving < spec.maxDive) {
        G.diveT = spec.diveGap * (0.75 + rng() * 0.5);
        const pool = G.enemies.filter(e => e.state === 'form');
        if (pool.length) {
          pool.sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x));
          const pick = pool[Math.min(pool.length - 1, (rng() * rng() * 3) | 0)];
          /* the ripper only opens a beam if it has nothing already, you are alive, and the coin
           * lands — otherwise it dives like anything else. A guaranteed capture attempt every
           * appearance turns a gamble into a tax. */
          if (pick === G.ripper && !s.ripped && !s.dual && s.alive && rng() < 0.45) {
            divePath(G, pick, rng);
            pick.beamAt = 0.45;                        // open the beam partway down the dive
          } else divePath(G, pick, rng);
        }
      }
      // the ripper's mid-dive beam
      if (G.ripper && G.ripper.state === 'dive' && G.ripper.beamAt != null && G.ripper.u >= G.ripper.beamAt) {
        G.ripper.beamAt = null; openBeam(G, G.ripper);
      }
    }

    // ── beams ──
    for (const b of G.beams) {
      b.t += h;
      const e = b.e;
      if (e.state !== 'beam' || b.t > b.dur) { b.done = true; continue; }
      if (!s.alive || invuln(s)) continue;      // a roll beats the beam. That is the point of a roll.
      /* the catch test is a CONE widening downward from the ripper — visible, dodgeable, and it
       * has to hold you, not touch you. 0.55 s is long enough to run out of and short enough that
       * a distracted player loses the ship, which is the intended feeling. */
      const dy = e.y - s.y;
      const halfW = 0.42 + Math.max(0, dy) * 0.20;
      if (dy > 0 && Math.abs(s.x - e.x) < halfW) { b.hold += h; if (b.hold > 0.55) { b.done = true; G.stat.dByRip++; rip(G); } }
      else b.hold = Math.max(0, b.hold - h * 2);
    }
    if (G.beams.length) G.beams = G.beams.filter(b => !b.done);

    // ── player bullets ──
    for (const b of G.bullets) {
      if (!b.live) continue;
      b.x += b.vx * h; b.y += b.vy * h;
      if (b.y > 7.2 || Math.abs(b.x) > F.X + 3) { b.live = false; missed(G); continue; }
      for (const e of G.enemies) {
        if (e.state === 'dead') continue;
        /* ⚠ THE HIT BOX WAS TWICE THE CARD. `sz + 0.16` gave a half-width of 0.58 against a card
         * whose drawn half-width is sz*1.15*0.68 ≈ 0.33 — so at 1.30 column spacing a bolt fired
         * anywhere hit something 89% of the time, which is most of why the formation melted. The
         * x radius now matches what is DRAWN; y stays generous because a vertical bolt crossing a
         * card should not slip between frames. Measured hit rate against a held-fire bot fell from
         * ~90% to ~55%, which is the number the accuracy bonus was written for.
         * z is folded in rather than ignored: a diver at z=+2 is much nearer than the bullet
         * plane, and a pure 2D test kills things that are visibly in front of you. */
        const rx = KIND[e.kind].sz * (e.kind === 2 ? 1.5 : 1.15) * 0.68 + 0.06;
        const ry = KIND[e.kind].sz * (e.kind === 2 ? 1.5 : 1.15) + 0.10;
        if (Math.abs(e.x - b.x) < rx && Math.abs(e.y - b.y) < ry && Math.abs(e.z) < 3.2) {
          e.hp -= b.dmg;
          e.hurt = 0.25;
          hitScored(G);
          if (e.hp <= 0) killEnemy(G, e); else G.ev.push('ping');
          /* ⚑ PIERCE is the MAX plasma's whole identity — it is what makes the top gun read as
           * "best in the universe" rather than as penta with a bigger number. A pierce bolt
           * survives the kill and keeps climbing, losing a third of its damage each time, so it
           * rakes a column out of the formation. It is capped, or one shot clears the wave. */
          if (b.pierce > 0) { b.pierce--; b.dmg *= 0.66; }
          else { b.live = false; break; }
        }
      }
    }
    if (G.bullets.length > 90) G.bullets = G.bullets.filter(b => b.live);

    // ── enemy bullets ──
    for (const b of G.ebullets) {
      if (!b.live) continue;
      b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
      /* THREAT EVENT instrumentation: counted once, the first time a hostile object is inside
       * 2.6 units and still closing. This is the "time between meaningful decisions" number the
       * brief asked for, and it is measured rather than asserted. */
      if (!b.seen) {
        const d = Math.hypot(b.x - s.x, b.y - s.y);
        if (d < 2.6 && b.vy < 0) { b.seen = true; G.stat.threatEvents++; }
      }
      if (b.y < -7 || Math.abs(b.x) > F.X + 4 || b.z > 5) { b.live = false; continue; }
      if (s.alive && !invuln(s)) {
        const rigs = s.dual ? [-0.62, 0.62] : [0];
        /* ⚠ THE HITBOX IS SMALLER THAN THE SHIP AND THAT IS DELIBERATE — Galaga's is too, and so is
         * every arcade shooter worth the name. The craft is drawn ~0.63 units wide; 0.26 is what
         * makes a near miss read as a near miss instead of as a lie. */
        for (const rx of rigs) {
          if (Math.abs(b.x - (s.x + rx)) < 0.26 && Math.abs(b.y - s.y) < 0.30) { b.live = false; G.stat.dByShot++; hitShip(G); break; }
        }
      }
    }
    if (G.ebullets.length > 120) G.ebullets = G.ebullets.filter(b => b.live);

    // ── enemy ↔ ship collision (a diver that reaches you is a kill, both ways) ──
    if (s.alive && !invuln(s)) {
      for (const e of G.enemies) {
        if (e.state !== 'dive' && e.state !== 'beam') continue;
        /* ⚠ THE RAM BOX WAS TOO FAT. sz+0.3 with |z|<1.8 meant a diver passing 0.7 units to one
         * side and a unit and a half in front of you still killed you — and a dive path is
         * deliberately aimed near where you were standing, so it fired constantly. Tightened to
         * roughly the drawn silhouette: an unavoidable death you cannot see coming is not
         * difficulty, it is noise. */
        const r = KIND[e.kind].sz + 0.12;
        if (Math.abs(e.x - s.x) < r && Math.abs(e.y - s.y) < r && Math.abs(e.z) < 1.1) {
          G.stat.dByRam++; killEnemy(G, e, true); hitShip(G); break;
        }
      }
    }

    // ── score pops ──
    for (const p of G.pops) { p.t += h; p.y += h * 1.1; }
    if (G.pops.length) G.pops = G.pops.filter(p => p.t < p.life);

    // ── phases ──
    if (G.phase === 'entry') {
      if (G.enemies.every(e => e.state !== 'entry' || e.u >= 1)) { G.phase = 'fight'; G.phaseT = 0; }
      else if (G.phaseT > 6) { G.phase = 'fight'; G.phaseT = 0; }   // never stall on a stuck entry
    } else if (G.phase === 'fight') {
      if (alive === 0) waveClear(G);
    } else if (G.phase === 'bonus') {
      if (alive === 0 || G.phaseT > 13) waveClear(G, alive === 0);
    } else if (G.phase === 'clear') {
      if (G.phaseT > 1.5) { G.wave++; buildWave(G); }
    }
    if (alive > G.stat.peakEnemies) G.stat.peakEnemies = alive;
    G.alive = alive; G.diving = diving;
  }

  function killEnemy(G, e, ram) {
    const K = KIND[e.kind];
    const diving = (e.state === 'dive' || e.state === 'beam');
    e.state = 'dead'; e.deadT = 0;
    G.pops.push({ x: e.x, y: e.y, z: e.z, boom: 1, t: 0, life: 0.6, hue: e.hue, big: e.kind === 2 });
    G.shake = Math.max(G.shake, e.kind === 2 ? 16 : 5);
    G.ev.push(e.kind === 2 ? 'bigkill' : (diving ? 'divekill' : 'kill'));
    if (G.phase === 'bonus') { award(G, 200, e.x, e.y, e.z); return; }
    if (e === G.ripper) {
      G.ripper = null;
      if (G.captive && diving) {
        /* THE RESCUE. Only from a dive, and this is the branch the whole mechanic exists for. */
        G.captive = null; G.ship.ripped = false; G.ship.dual = true;
        G.bigMsg = '★ DOUBLE RIG'; G.bigMsgT = 2.0; G.ev.push('dual');
        award(G, 2500, e.x, e.y, e.z, true);
      } else if (G.captive) {
        G.captive = null; G.ship.ripped = false;
        G.bigMsg = 'captive lost'; G.bigMsgT = 1.4;
        award(G, K.pts, e.x, e.y, e.z, true);
      } else award(G, diving ? K.dpts : K.pts, e.x, e.y, e.z, true);
      return;
    }
    award(G, ram ? K.pts : (diving ? K.dpts : K.pts), e.x, e.y, e.z);
    /* power-ups drop from DIVERS only — another nudge toward fighting the dangerous ones. */
    if (diving && G.rng() < 0.11) {
      const t = ['gun', 'rapid', 'shield', 'bomb'][(G.rng() * 4) | 0];
      G.pows.push({ x: e.x, y: e.y, z: e.z, vy: -3.4, type: t, live: true });
    }
  }

  /* ⚠ `deaths` is counted where the life is actually spent, and the dBy* counters where the CAUSE
   * is known. They are deliberately separate: an early version had only the cause counters and
   * they summed to one less than the lives lost, which is exactly the shape of bug that makes a
   * difficulty argument unfalsifiable. Two independent counts disagreeing is a signal; one count
   * is just a number. */
  /* ⛔ THIS FUNCTION IS THE "DIES EVERY 1/2 SECONDS" FIX, AND IT IS SECTION 9'S FIX.
   *    CLAUDE.md: "At the old 100 HP / 26 dmg an AK duel was ~0.63 s, and at that speed cover,
   *    suppression and visible bullets cannot exist — nobody lives long enough to use them."
   *    Here it was worse: one bullet was one life, so the measured survival was 0.72 vulnerable
   *    seconds and a whole three-life run finished in about eleven. A defence roll with 0.30 s of
   *    i-frames is meaningless if the thing it protects dies to the next bullet regardless.
   *
   *    So a hit now spends a SHIELD pip, not a life: pips regenerate out of combat, a hit buys
   *    HIT_I seconds of i-frames plus a knockback, and only a hit at zero pips costs the rig. That
   *    is armour + regen + a hit-flash, i.e. exactly the four levers the brief named, and the
   *    chain penalty is what keeps a shield hit from being free. */
  function hitShip(G) {
    const s = G.ship;
    if (s.dual) {
      /* the double rig is spent as ARMOUR, not deleted outright — losing both ships to one bullet
       * after the gamble paid off would make the gamble not worth taking. */
      s.dual = false; s.inv = 1.4; G.shake = Math.max(G.shake, 14); G.flash = 0.7; G.ev.push('hurt');
      G.msg = 'rig split'; G.msgT = 1.1; return;
    }
    if (s.shield > 0) {
      s.shield--; s.sinceHit = 0; s.inv = SHIP.HIT_I;
      G.stat.shieldHits++;
      // knockback: being hit MOVES you. A hit with no physical consequence is a number changing.
      s.vy -= 5.5; s.vx += (s.x >= 0 ? -1 : 1) * 3.0;
      s.flow = 0; s.flowT = 0;                 // the flow is a reward for clean movement
      G.chain = G.chain >> 1; G.mult = multOf(G.chain);
      G.shake = Math.max(G.shake, 13); G.flash = 0.75; G.ev.push('hurt');
      G.msg = s.shield > 0 ? '◈ SHIELD ' + s.shield : '◈ SHIELD DOWN';
      G.msgT = 1.0;
      return;
    }
    s.alive = false; s.respawn = SHIP.RESPAWN; G.lives--; G.stat.deaths++;
    G.chain = 0; G.mult = 1;
    G.shake = Math.max(G.shake, 20); G.flash = 1; G.ev.push('die');
    G.pops.push({ x: s.x, y: s.y, z: 0, boom: 1, t: 0, life: 0.9, hue: 40, big: true });
    if (G.lives <= 0) G.mode = 'over';
  }

  function waveClear(G, perfect) {
    G.phase = 'clear'; G.phaseT = 0;
    const acc = G.waveShots ? G.waveHits / G.waveShots : 0;
    /* the accuracy bonus is what stops "hold fire and hose". It is Galaga's own end-of-stage
     * hit/miss ratio, and it is the counterweight to the fire rate being generous. */
    const bonus = Math.round(acc * 1200 * G.wave);
    if (perfect) { G.bigMsg = 'PERFECT · 10,000'; G.bigMsgT = 2.4; G.score += 10000; }
    else { G.bigMsg = 'WAVE CLEAR · ' + Math.round(acc * 100) + '% · +' + bonus.toLocaleString('en-US'); G.bigMsgT = 2.0; G.score += bonus; }
    G.ebullets.length = 0; G.beams.length = 0;
    G.ev.push(perfect ? 'perfect' : 'clear');
  }

  // ── power-ups ───────────────────────────────────────────────────────────────────────────────
  function stepPows(G, h) {
    const s = G.ship;
    for (const p of G.pows) {
      if (!p.live) continue;
      p.y += p.vy * h; p.vy += -1.6 * h;
      if (p.y < -7) { p.live = false; continue; }
      if (s.alive && Math.abs(p.x - s.x) < 0.7 && Math.abs(p.y - s.y) < 0.7) {
        p.live = false;
        if (p.type === 'gun') { s.gun = Math.min(GUNS.length, s.gun + 1); G.msg = 'GUN ▲ ' + GUNS[s.gun - 1].name; }
        else if (p.type === 'rapid') { s.rapid = 7; G.msg = '» RAPID'; }
        /* a shield pickup refills the pips FIRST and only overflows into a rig. Pips are the thing
         * you actually run out of, and a pickup that gives you a spare life while your shield is
         * empty is a pickup that arrives too late to matter. */
        else if (p.type === 'shield') {
          if (s.shield < s.shieldMax) { s.shield = s.shieldMax; s.sinceHit = 0; G.msg = '◈ SHIELD FULL'; }
          else { G.lives = Math.min(6, G.lives + 1); G.msg = '◆ +1 RIG'; }
        }
        else { G.bombs = Math.min(3, G.bombs + 1); G.msg = '✸ +BURN'; }
        G.msgT = 1.2; G.ev.push('pow');
      }
    }
    if (G.pows.length) G.pows = G.pows.filter(p => p.live);
  }

  /* THE BURN. Stored, not spent on pickup — a screen-clear that fires itself the moment you touch
   * it is a pickup, not a decision, and the touch build had it wired to a pad with no cost at all.
   * It kills DIVERS only: clearing the parked formation would delete the wave, and the wave is the
   * thing you are supposed to be fighting through. */
  function burn(G) {
    if (G.mode !== 'play' || G.bombs <= 0) return false;
    G.bombs--;
    let n = 0;
    for (const e of G.enemies) if (e.state === 'dive' || e.state === 'beam') { killEnemy(G, e); n++; }
    G.flash = 1; G.shake = Math.max(G.shake, 12);
    G.ev.push('burn');
    G.msg = n ? '✸ BURN · ' + n : '✸ BURN';
    G.msgT = 1.1;
    return true;
  }

  // ── the frame entry point ───────────────────────────────────────────────────────────────────
  const H = 1 / 120;
  const MAXSUB = 16;      // 0.133 s of catch-up: real time all the way down to ~7.5 fps
  let acc = 0;
  function step(G, dt, input) {
    acc += Math.min(0.4, dt);
    let n = 0;
    while (acc >= H && n < MAXSUB) { tick(G, H, input); stepPows(G, H); acc -= H; n++; }
    if (n >= MAXSUB) acc = 0;             // give up rather than spiral; the alternative is a freeze
    G.stat.subSteps = n;
    if (G.ev.length > 200) G.ev.splice(0, G.ev.length - 200);   // never unbounded, even undrained
    return n;
  }

  function start(G, staked) {
    G.mode = 'play'; G.t = 0; G.score = 0; G.wave = 1; G.lives = 3 + (G.loadout.shield || 0);
    G.staked = !!staked; G.chain = 0; G.mult = 1; G.bestChain = 0; G.bombs = 1;
    G.shots = 0; G.hits = 0; G.dist = 0;
    G.bullets.length = 0; G.pops.length = 0; G.pows.length = 0;
    G.captive = null;
    const shieldMax = SHIP.SHIELD + Math.max(0, Math.round((G.loadout.shield || 0) * 0.5));
    Object.assign(G.ship, { x: 0, y: F.SHIPY, vx: 0, vy: 0, roll: 0, pitch: 0, alive: true, respawn: 0,
      inv: 1.4, iframe: 0, dual: false, ripped: false, rapid: 0, fireT: 0,
      shield: shieldMax, shieldMax, sinceHit: 0,
      dash: 0, dashCd: 0, dashDir: 0, rollT: 0, rollCd: 0, rollDir: 0, spin: 0,
      flow: 0, flowT: 0, od: 0, odCd: 0, odPeak: 0,
      // ⚑ you OPEN on the tri, not the twin. "The best ship and guns in the universe" cannot
      //   start below the second rung of its own ladder.
      gun: 2 });
    if (G.loadout.guns && G.loadout.guns.indexOf('laser') >= 0) G.ship.gun = 4;
    else if (G.loadout.guns && G.loadout.guns.indexOf('spread') >= 0) G.ship.gun = 3;
    G.ev.length = 0;
    G.stat = newStat();
    acc = 0;
    buildWave(G);
  }

  return { create, start, step, fire, burn, dash: doDash, roll: doRoll, F, SHIP, KIND, GUNS,
    waveSpec, multOf, slotXYZ, bez, bezT, mulberry32, shipTop, _selfCheck };
})();

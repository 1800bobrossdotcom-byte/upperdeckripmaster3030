/* ripmaster3030studios — RIP ROCKETER: the simulation (RRGame).
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

  // ── THE ASCENT: four tiers, and they are the reason the screen scrolls ───────────────────────
  /* ⚑ THE VERTICAL SCROLL NEEDED A REASON, AND `docs/DELTRON-3030.md` HAD IT. "Rip Rocketer's
   *   tiers are levels of an ascent" — you are climbing out of a corporate facility, and that is
   *   why tier 1 and tier 4 must not look alike. "More levels" is a content answer; an ascent is a
   *   structural one, and it is the one that makes the fourth tier feel EARNED rather than reskinned.
   *
   * ⚑ THE ASCENT IS LEGIBLE AS DENSITY FALLING AWAY, not as a palette swap. Tier I is a packed
   *   sub-level; tier IV is open sky with a mast in it. That is a measurable progression (the
   *   world's quad count per tier, see `__rrpc._tierScan()`), which a colour change is not.
   * ⚠ A tier is FOUR waves and every fourth wave is the challenge wave, so a tier always ENDS on
   *   the one stage where nothing shoots. That lull is the lift between floors — it was already in
   *   the pacing and it is now doing narrative work for free.
   * ⛔ No lyrics, no titles, no names — `docs/DELTRON-3030.md`'s hard rule. What is taken is the
   *   SHAPE of the story (an ascent through a corporate structure), which is an idea, and ideas
   *   are free. The tier names below are this studio's own words for its own building. */
  const TIERS = [
    { n: 1, name: 'SUB-LEVEL', fill: 0.94, hue: 26,  sky: 0.055, lamp: 0.10, rows: 'wide' },
    { n: 2, name: 'ASSEMBLY',  fill: 0.80, hue: 150, sky: 0.075, lamp: 0.22, rows: 'ribbed' },
    { n: 3, name: 'TOWER',     fill: 0.52, hue: 306, sky: 0.105, lamp: 0.22, rows: 'glass' },
    { n: 4, name: 'OPEN AIR',  fill: 0.14, hue: 192, sky: 0.135, lamp: 0.06, rows: 'mast' },
  ];
  function tierOf(w) { return Math.min(4, 1 + (((w || 1) - 1) / 4 | 0)); }
  function tierSpec(w) { return TIERS[tierOf(w) - 1]; }

  // ── enemy kinds ─────────────────────────────────────────────────────────────────────────────
  /* pts / dpts: parked vs DIVING. The ratio is the risk/reward statement — 3× for fighting the
   * thing that is actively trying to kill you. Galaga's own split is 50/100..800; ours is flatter
   * because our dives are more frequent.
   *
   * ⚑ "DIFFERENT TYPES OF PLANE SHIPS" — AND THE DESIGN QUESTION IS *HOW YOU TELL AT A GLANCE*.
   *   The existing idiom is right and is extended rather than replaced: these are TRADING CARDS
   *   that break formation and dive. So a type is not a different sprite with a different stat
   *   block; it is a different PATH, and the silhouette is the promise of that path:
   *
   *     grunt    plain 2:3 card, face-on            curved swoop past you            (unchanged)
   *     flanker  card + swept trailing fins         wide arc, crosses and returns    (unchanged)
   *     ripper   card + magenta ring                stops, opens the tractor beam    (unchanged)
   *     lancer   card carried EDGE-ON + a spike     no curve: a straight fast plunge
   *     weaver   card + a permanent halo ring       slow sine descent, fires the whole way
   *     hauler   card at 1.5× + a slung pod         crosses the top, drops straight down
   *
   *   `dive` names the path so the silhouette and the behaviour cannot drift apart — a type with
   *   swept fins that flies straight is a lie the player only learns by dying.
   * ⚑ AND THE *WHEN* IS A WIND-UP, NOT A LABEL. See `WIND_T`: before any dive the card rears back
   *   away from you and its aura ignites. A change is readable in peripheral vision; a colour you
   *   have to have learned is not. `dsz` is the drawn size multiplier and lives here so the sim's
   *   hit box and the renderer's quad cannot disagree — they used to share a literal `1.5`. */
  const KIND = [
    { name: 'grunt',   hp: 1, pts: 50,  dpts: 160, fire: 1.0, sz: 0.42, dsz: 1.15, dive: 'swoop' },
    { name: 'flanker', hp: 2, pts: 80,  dpts: 260, fire: 1.4, sz: 0.46, dsz: 1.15, dive: 'swoop' },
    { name: 'ripper',  hp: 4, pts: 400, dpts: 900, fire: 1.6, sz: 0.62, dsz: 1.50, dive: 'swoop' },
    { name: 'lancer',  hp: 2, pts: 110, dpts: 360, fire: 0.0, sz: 0.40, dsz: 1.15, dive: 'lance' },
    { name: 'weaver',  hp: 3, pts: 140, dpts: 420, fire: 2.0, sz: 0.48, dsz: 1.15, dive: 'weave' },
    { name: 'hauler',  hp: 6, pts: 320, dpts: 760, fire: 0.8, sz: 0.60, dsz: 1.45, dive: 'haul', drop: 1 },
  ];
  /* The wind-up. 0.34 s is long enough to read and short enough that it never reads as hesitation;
   * the dive scheduler is unchanged, so the RATE of dives is what it always was — each one simply
   * announces itself first. A winding enemy counts against `maxDive`, or the tell would silently
   * raise the dive ceiling. */
  const WIND_T = 0.34;

  // ── THE FACILITY: the scrolling world, and the guns bolted to it ─────────────────────────────
  /* ⚑ THE SCROLL BELONGS TO THE SIMULATION, NOT THE RENDERER, and moving it here is the change
   *   that makes bases possible at all. It used to live in `rrpc-app.js` as `scrollRate()`, which
   *   was fine while the only thing it moved was the starfield — but an emplacement is a GAMEPLAY
   *   object that arrives on the scroll, and a gameplay object cannot be positioned by a render
   *   quantity computed at frame rate. One clock, stepped on the fixed 1/120 s tick, and the wall,
   *   the guns and the motes can no longer disagree about how fast the world is going past.
   *
   * ⚑ AND THE CLIMB IS SIGNED NOW. `scrollRate` used `Math.abs(s.vy)`, so DIVING sped the world up
   *   exactly as much as climbing did — which is backwards for an ascent and is why the old field
   *   read as wallpaper with a speed knob. Pull up and the wall runs; push down and it eases. That
   *   is the §4 answer for the whole backdrop: it moves because YOU are climbing it.
   * ⚠ The flight model is NOT touched by any of this — `SHIP` is untouched, and the scroll reads
   *   `s.vy` without ever writing it. The artist's "good otherwise in fluidity" is the movement,
   *   and the movement is exactly what must not move. */
  const SCROLL_BASE = 4.2;      // world units/s at the facade's depth, at k = 1
  const EZ = -12;               // the facade plane. Emplacements live ON it, at its depth.
  const ETOP = 11.5, EBOT = -11.5;

  /* ⛔ TURRETS TRACK, THEN *STOP*, THEN FIRE WHERE THEY STOPPED. THEY DO NOT LEAD.
   *
   * The design question was "turrets that track and lead, or turrets that spray?" and the answer
   * falls out of what already exists: `eFire` already fires with partial lead, from DIVERS. A diver
   * is mobile, intelligent pressure that comes to you. A turret is fixed. If a fixed gun also led
   * you, it would be strictly worse than a diver — unavoidable, arriving from a place you cannot
   * choose to be away from, and punishing the same skill the divers already punish.
   *
   * ⚑ So an emplacement is a hazard with RHYTHM rather than intent, which is the Metal Slug idea:
   *   the LEVEL is dangerous, separately from the enemies in it. The cycle is visible in the
   *   geometry — the barrel swings to your bearing (track), stops dead and charges (lock), then
   *   throws a fixed fan down that bearing (fire). The counter is "be somewhere else by then",
   *   which is the same lesson the divers teach, so the game teaches ONE lesson twice instead of
   *   two lessons once.
   * ⚑ IT IS AN OPPORTUNITY, NOT A TAX. Emplacements are destructible, worth points, and they
   *   scroll away if ignored. Clear every gun on a site and it drops a power-up.
   * ⚠ THEY SHARE `spec.maxEB`. The live-enemy-fire ceiling was designed as a budget, not a nerf —
   *   adding a second source of bullets outside it would have silently doubled the wall it exists
   *   to cap. A turret shot suppressed by the budget is simply not taken. There is a second, small
   *   cap on turret-origin bolts as well, so a wall of guns cannot crowd the divers out of it. */
  const EMPK = [
    /* w/h are the mount plate in world units at EZ. `warn` is the lock-and-charge window: the tell.
     * `spread` is the beaten zone's HALF-WIDTH IN WORLD UNITS at the aim point — see empFire. */
    { name: 'sentry', hp: 2,  pts: 90,  w: 0.72, h: 0.60, len: 0.78, track: 0.42, warn: 0.42, burst: 1, spread: 0.00, cd: 1.9, hue: 44 },
    { name: 'gun',    hp: 4,  pts: 150, w: 1.05, h: 0.80, len: 1.02, track: 0.52, warn: 0.62, burst: 3, spread: 0.55, cd: 2.7, hue: 32 },
    { name: 'flak',   hp: 7,  pts: 260, w: 1.45, h: 1.05, len: 1.20, track: 0.62, warn: 0.86, burst: 5, spread: 1.50, cd: 3.6, hue: 12 },
    /* the CORE has no gun. It is the thing a base is built around, it is worth clearing, and it is
     * the only emplacement that cannot hurt you — so a base always contains one honest reward. */
    { name: 'core',   hp: 12, pts: 700, w: 1.7,  h: 1.7,  len: 0,    track: 0,    warn: 0,    burst: 0, spread: 0,    cd: 0,   hue: 168 },
  ];
  const TBOLT_V = 13.5;         // faster than EBOLT_V: it has 12 units of depth to cross first
  const EMP_CAP = 4;            // turret-origin bolts alive at once, inside the global maxEB

  /* A SITE is what actually spawns: a lone gun, a nest of two, or a BASE — a core with guns around
   * it. Offsets are in world units on the facade. Kept as data so a tier's character is a table
   * edit rather than a code branch. */
  const SITES = {
    lone:  [{ k: 0, dx: 0, dy: 0 }],
    pair:  [{ k: 0, dx: -1.9, dy: 0.3 }, { k: 0, dx: 1.9, dy: -0.3 }],
    post:  [{ k: 1, dx: 0, dy: 0 }],
    twin:  [{ k: 1, dx: -2.3, dy: 0 }, { k: 1, dx: 2.3, dy: 0 }],
    heavy: [{ k: 2, dx: 0, dy: 0 }],
    base:  [{ k: 3, dx: 0, dy: 0 }, { k: 1, dx: -2.6, dy: -1.4 }, { k: 1, dx: 2.6, dy: -1.4 }],
    fort:  [{ k: 3, dx: 0, dy: 0.4 }, { k: 2, dx: -3.0, dy: -1.2 }, { k: 1, dx: 3.0, dy: -1.2 }, { k: 0, dx: 0, dy: -2.6 }],
  };
  /* Which sites a tier builds. The ascent again: the sub-level is thick with light guns, the tower
   * is sparser and heavier, and OPEN AIR has almost nothing — a mast and one lonely nest. */
  const TIER_SITES = [
    ['lone', 'lone', 'pair', 'post'],
    ['post', 'pair', 'twin', 'base'],
    ['twin', 'heavy', 'base', 'post'],
    ['lone', 'heavy', 'fort'],
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
    /* how long a refused dash stays asked-for. Longer than ROLL_T (0.42) on purpose — see the
     * buffer note in stepShip: the whole point is that a dash asked for DURING a roll lands as
     * the roll ends, which is the FLOW chain the game is built to reward. */
    DASH_BUF: 0.50,

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

    /* ── THE DRAWN PATH — the touch scheme's third verb ──────────────────────────────────
     * Artist, 2026-08-06: *"let finger draw fast paths with double tap."* Double-tap and KEEP the
     * second tap down and the ship stops being steered and starts being LED: it seeks the
     * fingertip's own position in the field at DRAW_K × the normal top speed, so whatever line
     * the finger draws on the glass is the line the ship flies.
     *
     * ⚑ IT IS A SEEK, NOT A TELEPORT, and that is the same rule the dash and the roll already
     *   obey (see the impulse note in stepShip): it writes a target VELOCITY and lets the ship's
     *   own drag, wall bounce and bank carry it out. `s.x = fingerX` would be a cursor with a
     *   spaceship drawn on it — it would pass through the wall, never bank, and never overshoot.
     * ⚑ AND IT COSTS SOMETHING, which is why it can be strictly faster without being strictly
     *   better: the map is ABSOLUTE. The stick is relative and its anchor follows your thumb, so
     *   it never runs out of glass; a drawn path puts your fingertip exactly where the ship is,
     *   which means your own finger is on top of the thing you are trying to keep alive. It is a
     *   burst you take across open space, not a way to play the whole wave.
     * ⚠ DRAW_G is a gain in (u/s) per unit of error, so it saturates at drawTop for anything
     *   further than drawTop/DRAW_G ≈ 1.2 units away. Inside that it eases in, which is what
     *   stops the ship buzzing either side of a stationary fingertip. */
    DRAW_K: 1.9, DRAW_G: 15, DRAW_R: 22,

    /* SURVIVABILITY. A hit spends a SHIELD pip, not a life — Section 9's armour pool, in this
     * game's language — and pips come back after REGEN clean seconds, which is Section 9's
     * out-of-combat regen almost to the number (4.5 s there). ⚑ The dead time was as bad as the
     * dying: the old build spent 80% of its wall clock in respawn + blink, so a "10-second run"
     * contained about two playable seconds. */
    SHIELD: 3, REGEN: 6.5, HIT_I: 1.05, RESPAWN: 0.9, DEATH_I: 1.8,
  };
  /* Derived, so the numbers in the comment above cannot drift away from the code. */
  function shipTop(loadSpeed) { return SHIP.ACC * (loadSpeed || 1) / -Math.log(SHIP.DRAG); }

  /* ── ⛔ A VELOCITY TARGET SETTLES BELOW ITSELF, AND THE TOUCH STICK HAS ALWAYS BEEN 27% SLOW ──
   * `v += (T − v) * k` followed — every tick, four lines later — by `v *= DRAG^h` does NOT settle
   * at T. Solving the fixed point v = (v + (T−v)k)·d gives v = T·dk / (1 − d(1−k)); at the fixed
   * 1/120 s tick with k = 16h that is **0.659·T**. So the stick's real ceiling was 6.44 u/s while
   * the keyboard's `v += ACC·h` reaches 8.84 u/s under the same drag — and the comment sitting
   * over that line claimed *"the two controls agree on the ceiling by construction"*.
   * ⚑ IT IS THE ARTIST'S OWN COMPLAINT, ONE LAYER DOWN. *"On mobile we cannot move fast like we
   *   can on desktop"* was answered in rrpc-app.js by making full deflection REACHABLE from
   *   anywhere on the glass — correct, and it fixed what you could ASK for. This is what you got
   *   when you asked: full deflection was already worth two thirds of a keyboard.
   * ⚑ The fix is not a fudge factor, it is the inverse of the arithmetic above: aim past the
   *   target by exactly what the drag is about to take back. Degenerates correctly — at k = 1 it
   *   is 1/d, i.e. "set the velocity that survives one tick of drag" — and it is a function of h,
   *   so it cannot rot if the tick ever changes. */
  function seek(v, target, k, d) { return v + (target * (1 - d * (1 - k)) / (d * k) - v) * k; }

  function _selfCheck() {
    const top = shipTop(1), h = 1 / 120, d = Math.pow(SHIP.DRAG, h);
    /* the stick's ACHIEVED terminal speed, run out on the same loop the game uses, so the claim
     * that the two controls share a ceiling is a measurement rather than an assertion. */
    const settle = (drive) => { let v = 0; for (let i = 0; i < 2400; i++) { v = drive(v); v *= d; } return v; };
    const kk = Math.min(1, h * 16);
    return { topSpeed: +top.toFixed(2), crossSec: +((F.X * 2) / top).toFixed(2),
      tau: +(1 / -Math.log(SHIP.DRAG)).toFixed(3), dragPerTick: +d.toFixed(4),
      keyTop: +settle(v => v + SHIP.ACC * h).toFixed(2),
      stickTop: +settle(v => seek(v, top, kk, d)).toFixed(2),
      stickTopRaw: +settle(v => v + (top - v) * kk).toFixed(2),
      drawTop: +settle(v => seek(v, top * SHIP.DRAW_K, Math.min(1, h * SHIP.DRAW_R), d)).toFixed(2) };
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
              dash: 0, dashCd: 0, dashDir: 0, dashBuf: 0, dashBufDir: 0, rollT: 0, rollCd: 0, rollDir: 0, spin: 0, drawT: 0,
              flow: 0, flowT: 0, od: 0, odCd: 0, odPeak: 0 },
      enemies: [], bullets: [], ebullets: [], pops: [], beams: [], pows: [],
      /* THE FACILITY. `scroll` is world distance climbed at the facade's depth; `scrollK` is the
       * multiplier the renderer's motes and parallax share, so nothing can drift out of step. */
      emps: [], scroll: 0, scrollK: 1, scrollV: 0, surge: 0, tier: 1, nextSite: 14, siteId: 0,
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
      deaths: 0, dByShot: 0, dByRam: 0, dByRip: 0, dByTurret: 0,
      vulnT: 0, invT: 0, deadT: 0, shieldHits: 0, rolls: 0, dashes: 0, shocks: 0,
      overdrives: 0, odT: 0, bestFlow: 0, bulletsCleared: 0,
      sites: 0, emps: 0, empKills: 0, empShots: 0, sitesCleared: 0,
      /* ── ⚑ THE TWO EARNED-TITLE COUNTERS — see docs/HERO-UNLOCKS.md ─────────────────────────
       * A hero 1/1 is real value and every score in this project lives in localStorage, so the
       * earned tier is claimed against an EIP-712 voucher a human signs — the studio is the judge
       * and says so. ⚑ THE CONSEQUENCE IS NOT "the numbers do not matter", IT IS THE OPPOSITE: a
       * judge watches a screen capture, so a condition is only claimable if the run SHOWS its own
       * evidence. These two exist to be displayed, not to gate anything in code.
       * `flowHeld` is the longest unbroken stretch of live FLOW in the run — the chain lapses the
       * moment `flowT` runs out, so this is a stopwatch on the dash→roll→dash rhythm.
       * `odKills`/`kills` is how many of your kills landed with OVERDRIVE lit. ⚠ Both are RUN
       * totals; the titles are scoped to a tier and a wave, so `tierFlowOk` and the per-wave pair
       * carry the scoped answer and reset on the boundary that owns them. */
      flowHeld: 0, flowRun: 0, kills: 0, odKills: 0,
      tierFlowOk: true, tierOdOnly: true };
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
      /* ⚑ THE LEVEL'S OWN DIFFICULTY DIAL, AND IT IS A DISTANCE, NOT A RATE. `empGap` is how much
       * of the facility passes between gun sites; it tightens with the wave and, like every other
       * ceiling in this table, it deliberately does NOT bottom out by wave 10 — the comment above
       * exists because that is precisely how the old escalation died. 26 units at wave 1 (about six
       * seconds of climb) down to 9 at wave 25.
       * ⛔ Zero on a challenge wave. The bonus stage's whole promise is that nothing can hurt you,
       *    and a wall gun is something that can hurt you. */
      empGap: bonus ? 0 : Math.max(9, 26 - (w - 1) * 0.72),
      /* which of the new types are flying yet — see KIND. Tier I is deliberately UNCHANGED from
       * what was measured: grunts, flankers and the ripper, nothing else. */
      tier: tierOf(w),
    };
  }

  /* ⚑ WHO IS IN THE FORMATION, BY TIER — and tier I is untouched on purpose. Waves 1–4 build the
   * exact roster that was measured and tuned (grunts, a tougher back row, the ripper); the new
   * types are the ASCENT's escalation, so they arrive as you climb out of the sub-level rather
   * than as a difficulty patch applied to the opening. Each entry is [kind, share of the row]. */
  function rosterFor(tier, row, rng) {
    if (row === 0) return 1;                                     // back row is always tougher
    if (tier >= 2 && row === 3 && rng() < 0.42) return 3;         // lancers hang off the front edge
    if (tier >= 3 && row === 2 && rng() < 0.30) return 4;         // weavers mid-grid
    if (tier >= 4 && row === 1 && rng() < 0.22) return 5;         // haulers in the second rank
    if (row === 1 && rng() < 0.35) return 1;
    return 0;
  }

  function buildWave(G) {
    const w = G.wave, spec = waveSpec(w);
    G.spec = spec;
    G.tier = spec.tier;
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
      if (!spec.bonus) kind = rosterFor(spec.tier, row, rng);
      const e = {
        id: i, col, row, kind, hp: KIND[kind].hp, state: 'entry',
        x: 0, y: 0, z: 0, u: 0, dur: 1.35 + rng() * 0.4, delay: squad * 0.42 + (i % 5) * 0.075,
        path: null, roll: 0, pitch: 0, spin: (rng() * 2 - 1) * 3.4, tumble: rng() * TAU,
        fireT: 0.6 + rng() * 0.9, hue: (G.market.hue + i * 13) % 360, art: i % 14,
        dived: 0, holds: null, wind: 0, windT: 0,
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
    /* ⛔ A CHALLENGE WAVE PROMISES THAT NOTHING CAN HURT YOU, AND A WALL GUN CAN HURT YOU. `empGap`
     *    is already 0 so nothing new arrives, and `spec.eFire` is 0 so nothing can start tracking —
     *    but a turret already holding a lock would get one shot off across the boundary. Stand them
     *    down explicitly rather than relying on two other numbers to happen to cover it. */
    if (spec.bonus) for (const e of G.emps) { e.state = 'idle'; e.fireT = 99; e.angV = 0; }
    else for (const e of G.emps) if (e.fireT > 90) e.fireT = 0.8;
    G.stat.waves++;
    G.ev.push('wave');
    /* ⚑ THE FLOOR IS ANNOUNCED, AND THAT IS THE INTERLUDE DOING WORK. `docs/DELTRON-3030.md` idea 1
     * — "the interstitials carry the world; treat dead time as inventory" — and the wave-clear
     * banner is the deadest time this game has. Reaching a new tier is the only moment the ascent
     * is a fact rather than a background, so it gets the banner and the wave number stands aside. */
    const newTier = spec.tier !== G.lastTier;
    /* ⛔ THE COMPLETED TIER IS RECORDED BEFORE THE FLAGS RESET, WHICH IS THE WHOLE ORDERING.
     * Entering tier N means tier N−1's four waves were cleared, and at THIS instant the flags
     * still hold that tier's answer — one line later they do not. A detector reading them after
     * the reset would award the title to everybody, every tier, forever.
     * ⚠ `G.lastTier >= 1` because the very first buildWave also sees `newTier` (tier 1 against
     *   lastTier 0) and that is the START of a run, not the completion of anything. */
    if (newTier && G.lastTier >= 1) {
      G.tierDone = { tier: G.lastTier, flowOk: G.stat.tierFlowOk, odOnly: G.stat.tierOdOnly };
      G.ev.push('tierdone');
    }
    /* ⚠ A NEW TIER IS A CLEAN SHEET FOR THE CHAIN TITLE, and the reset belongs here rather than
     * in `start()`: the attempt is scoped to ONE tier, so failing tier II must not lock you out
     * of claiming it on tier III in the same run. */
    if (newTier) { G.stat.tierFlowOk = true; G.stat.tierOdOnly = true; }
    G.lastTier = spec.tier;
    G.bigMsg = spec.bonus ? 'CHALLENGE ·  N O   S H O O T I N G'
      : newTier ? ('TIER ' + ['I', 'II', 'III', 'IV'][spec.tier - 1] + ' · ' + TIERS[spec.tier - 1].name)
      : 'WAVE ' + w;
    G.bigMsgT = newTier && !spec.bonus ? 2.2 : 1.6;
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

  /* ⚑ THE WIND-UP — THE ANSWER TO "HOW DOES THE PLAYER TELL WHICH ONE IS ABOUT TO DIVE".
   * A card that is about to commit REARS BACK: it pulls away from you along −z, squares up
   * face-on, and its aura ignites. So for a third of a second it gets visibly SMALLER and
   * BRIGHTER, and then it comes. A change is readable in peripheral vision; a badge you have to
   * have learned is not — and the studio's whole subject is anticipation, which is this exact
   * shape: the pull, then the snap. It costs one state and it upgrades every enemy type at once. */
  function windUp(G, e) {
    e.state = 'wind'; e.windT = WIND_T; e.wind = 0;
    e.wx = e.x; e.wy = e.y; e.wz = e.z;
    G.ev.push('wind');
  }

  function divePath(G, e, rng) {
    /* A dive has to threaten the SHIP, not the middle of the screen. c1 pulls hard toward the
     * player's current x and TOWARD THE CAMERA (positive z) — the near-miss where a card fills the
     * frame is the single most "on acid" thing this game does and it is worth aiming for
     * explicitly. c2 overshoots past the ship so the exit is a flyby, not a stop. */
    const px = G.ship.x, sgn = Math.sign(px - e.x) || (rng() < 0.5 ? -1 : 1);
    const style = KIND[e.kind].dive;
    let c1x, c1y, c1z, c2x, c2y, c2z, ex, ey, ez, dur;
    if (style === 'lance') {
      /* ⚑ THE LANCER DOES NOT CURVE. It squares up over your column and falls straight through it,
       * fast, without firing — a thrown blade rather than a fighter. The threat is entirely
       * POSITIONAL, so it is the one type you answer by moving sideways rather than by shooting,
       * and its edge-on silhouette says so before it starts. */
      const lx = px + (rng() * 1.2 - 0.6);
      c1x = lx; c1y = e.y - 2.2; c1z = e.z * 0.5;
      c2x = lx; c2y = F.SHIPY + 1.2; c2z = 0.15;
      ex = lx; ey = -8.2; ez = 0.4;
      dur = (0.92 + rng() * 0.16) / G.spec.speed;
    } else if (style === 'weave') {
      /* THE WEAVER slides down slowly on a wide S and fires the whole way. It is suppression: it
       * does not try to reach you, it tries to make a column expensive to stand in. */
      const side = sgn;
      c1x = px + side * 5.4; c1y = e.y - 1.4; c1z = 0.6;
      c2x = px - side * 5.4; c2y = F.SHIPY + 2.4; c2z = 0.9;
      ex = px + side * 2.4; ey = -7.8; ez = 0.2;
      dur = (2.9 + rng() * 0.6) / G.spec.speed;
    } else if (style === 'haul') {
      /* THE HAULER comes in across the top, heavy and slow, and never reaches your altitude. You
       * have time to kill it; the cost of ignoring it is what it drops on the way past. */
      const side = e.x >= 0 ? 1 : -1;
      c1x = -side * 3.0; c1y = e.y - 0.6; c1z = 1.2;
      c2x = side * 3.0; c2y = e.y - 1.9; c2z = 1.4;
      ex = -side * (F.X + 3.5); ey = e.y - 2.6; ez = -0.6;
      dur = (3.2 + rng() * 0.5) / G.spec.speed;
    } else {
      const wide = 1.4 + rng() * 2.2;
      c1x = px + sgn * -wide; c1y = 1.2 - rng() * 2.4; c1z = F.ZNEAR * (0.5 + rng() * 0.5);
      c2x = px + sgn * wide * 0.7; c2y = F.SHIPY + (rng() * 1.4 - 0.5); c2z = 0.4 + rng() * 1.2;
      ex = px + sgn * (2.5 + rng() * 4); ey = -7.5; ez = -1 + rng() * 3;
      dur = (1.55 + rng() * 0.5) / G.spec.speed;
    }
    e.path = [e.x, e.y, e.z, c1x, c1y, c1z, c2x, c2y, c2z, ex, ey, ez];
    e.u = 0;
    e.dur = dur;
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

  /* ⛔ DYING BREAKS THE CHAIN, AND IT HAS TO BE SAID OUT LOUD RATHER THAN ASSUMED. The FLOW decay
   * runs inside the `s.alive` branch, so a DEAD ship's `flowT` never counts down — measured, a
   * tireless bot died three times in 85 s and `tierFlowOk` was still true at the end. "Held the
   * chain through a whole tier" has to mean you were flying for all of it; a combo that survives
   * your own death is the kind of rule that makes a title worth nothing. Both death paths call
   * this — the ordinary one and THE RIP, which is also a life. */
  function breakFlow(G) {
    const s = G.ship;
    if (G.stat.flowRun > G.stat.flowHeld) G.stat.flowHeld = G.stat.flowRun;
    G.stat.flowRun = 0; G.stat.tierFlowOk = false;
    s.flow = 0; s.flowT = 0;
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
    /* ⛔ FIRE DISCIPLINE, AND IT KEYS ON THE SHOT RATHER THAN ON THE KILL — the difference is the
     * whole reason this title is claimable. Scoping it to KILLS measured out at 99%, not 100:
     * a ram or a rip kills something outside the window, so a condition demanding every kill in
     * overdrive is defeated by an accident the player never chose. **A shot is the one thing
     * entirely under their control**, and a silent gun is obvious on a screen capture, which is
     * what a human judge is actually watching. See docs/HERO-UNLOCKS.md.
     * ⚠ Cleared per TIER, not per run: scoped to one wave a trigger-holding bot banks it by
     * accident (measured 100% on waves 1, 3 and 10), and across a whole tier it never does —
     * 67% is the best an undisciplined run reaches. */
    if (s.od <= 0) G.stat.tierOdOnly = false;
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
    /* ⚑ THE HAULER DROPS, IT DOES NOT AIM — and the silhouette said so before the code did. It
     * carries a slung pod and it crosses the top of the screen without ever coming down to you, so
     * an aimed shot from it would be a lie about what the pod is for. It releases straight down and
     * the danger is entirely in WHERE IT IS, which is the only threat shape in the game you answer
     * by leaving a column rather than by dodging a line. */
    if (KIND[e.kind].drop) {
      G.ebullets.push({ x: e.x + (G.rng() * 0.7 - 0.35), y: e.y - 0.3, z: e.z,
        vx: 0, vy: -EBOLT_V * 0.62, vz: -e.z * 0.10, hue: e.hue, live: true, seen: false });
      G.stat.ebullets++; G.ev.push('efire');
      return;
    }
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

  // ── EMPLACEMENTS: the level shooting back ───────────────────────────────────────────────────
  /* ⚑ THEY LIVE AT THE FACADE'S OWN DEPTH (z = EZ), NOT ON A BRACKET NEAR THE CAMERA, and that is
   *   a deliberate call rather than a shortcut. A gun standing proud of the wall would parallax
   *   against the wall as the world scrolled — it would visibly slide off its own mount, because a
   *   perspective camera moves near things faster than far ones. Putting the gun ON the wall makes
   *   the bookkeeping honest and buys two things for free: it is smaller on screen, so it reads as
   *   part of the level rather than as an enemy; and its bolts travel 12 units of DEPTH toward you,
   *   growing as they come, which is the clearest "this is aimed at YOU" cue this renderer has.
   * ⚑ AND THE FORMATION SHIELDS THE LEVEL. Player bolts test the formation first and only reach an
   *   emplacement if nothing was in the way, because a bolt dies on its first hit. So shooting the
   *   wall means making a gap first — which is a real decision, and it is free: it is just what the
   *   existing bullet loop already does, read in a new light. */
  function spawnSite(G) {
    const rng = G.rng, tier = G.tier;
    const list = TIER_SITES[tier - 1];
    const kind = list[(rng() * list.length) | 0];
    const parts = SITES[kind];
    const x = (rng() * 2 - 1) * (F.X + 1.2);
    const id = ++G.siteId;
    for (const p of parts) {
      const K = EMPK[p.k];
      G.emps.push({
        id: id, n: parts.length, kind: p.k, x: clamp(x + p.dx, -(F.X + 2.4), F.X + 2.4), y: ETOP + p.dy, z: EZ,
        hp: K.hp, hpMax: K.hp, hurt: 0, dead: 0,
        /* ang is the barrel bearing, measured the way atan2 does — 0 = +x, −π/2 = straight down.
         * It rests pointing out and slightly down, which is where a wall gun would sit idle. */
        ang: -Math.PI / 2 + (rng() * 0.5 - 0.25), angV: 0, tgt: -Math.PI / 2,
        /* ⚠ THE FIRST DELAY IS SHORT, AND IT HAS TO BE. A turret is only on screen for
         * (17.5 units / scrollV) seconds, and scrollV runs from 4.2 at wave 1 to ~14 by wave 30 —
         * so a wave-30 gun has about 1.25 s of visibility against a track-and-lock cycle of 1.1 s.
         * Measured with the old 0.6–2.0 s idle delay: 400 emplacements spawned over a 300 s run and
         * only 24 shots were fired, i.e. the level stopped shooting back exactly when the climb got
         * fast. Meeting them sooner is the intended consequence of speed; meeting them ASLEEP is a
         * bug that reads as the feature having been turned off. */
        state: 'idle', t: 0, fireT: 0.10 + rng() * 0.40, recoil: 0, flash: 0,
        seed: (rng() * 1e6) | 0,
      });
      G.stat.emps++;
    }
    G.stat.sites++;
  }

  function empFire(G, e) {
    const K = EMPK[e.kind];
    /* the GLOBAL live-fire budget first, then the turret-only one. Both are caps, not queues. */
    if (G.spec && G.spec.maxEB) { let n = 0; for (const b of G.ebullets) if (b.live) n++; if (n >= G.spec.maxEB) return; }
    let tb = 0; for (const b of G.ebullets) if (b.live && b.emp) tb++;
    if (tb >= EMP_CAP) return;
    /* ⛔ IT SHOOTS AT THE POINT IT MARKED, AND THE POINT IS IN *WORLD* SPACE. The first build froze
     *    a BEARING instead, and against a still target it missed 41 shots out of 41 — measured, and
     *    the cause is that the gun itself is scrolling. Between the lock and the shot the turret
     *    falls two to eight units, so a bearing that was correct when it stopped is pointing well
     *    below the target by the time it fires. Freezing the AIM POINT is immune to that, and it is
     *    also the honest statement of the design: it fires at where you were standing, not at where
     *    you are, and not at where it happened to be looking. `e.tgt` is re-derived from the marked
     *    point every tick, so the barrel visibly holds its aim on that spot as the gun descends —
     *    the elevation creeps up, which reads exactly like a gun that has picked its shot. */
    const ax = e.aimX, ay = e.aimY;
    /* ⚠ AIM FROM THE MUZZLE, NOT FROM THE MOUNT — and this was worth a measurement to find. The
     *   first version placed the bolt at the barrel tip but computed its direction from the
     *   turret's centre, which is the same ray displaced forward along itself: every shot then
     *   OVERSHOT the marked point by exactly one barrel length. Against a ship that had not moved
     *   at all, 31 tracked bolts arrived a median 0.75 units wide, and the error was in the
     *   direction the gun was pointing — which is the signature of this bug and of no other. */
    const mnx = ax - e.x, mny = ay - e.y, mnl = Math.hypot(mnx, mny) || 1e-4;
    const nx = mnx / mnl, ny = mny / mnl;
    const mx = e.x + nx * K.len, my = e.y + ny * K.len;
    const bx = ax - mx, by = ay - my, bz = 0 - e.z;
    const bl = Math.hypot(bx, by) || 1e-4;
    /* ⛔ THE FAN IS A BEATEN ZONE AT THE TARGET, NOT AN ANGLE AT THE MUZZLE — and the first build
     *    got this wrong in a way that made the whole system inert. `spread` was radians, so the
     *    pattern's width was (angle × distance): from twelve units of depth away, a three-bolt fan
     *    at 0.15 rad arrived nearly two units apart. Measured against a still ship: 41 shots, ZERO
     *    hits, with the nearest bolt passing 0.38 units wide. Three separate near misses is not a
     *    burst, it is three misses — and the difficulty silently varied with how far off to one
     *    side the gun happened to have spawned, which is a thing the player cannot see or plan for.
     *    `spread` is now the pattern's half-width IN WORLD UNITS at the aim point, so a gun's
     *    beaten zone is the same size wherever it is standing. */
    const px = -by / bl, py = bx / bl;           // perpendicular, in the facade's own plane
    for (let i = 0; i < K.burst; i++) {
      const off = (K.burst === 1) ? 0 : (i / (K.burst - 1) - 0.5) * 2 * K.spread;
      const vx = bx + px * off, vy = by + py * off, vz = bz;
      const L = Math.hypot(vx, vy, vz) || 1;
      G.ebullets.push({ x: mx, y: my, z: e.z,
        vx: vx / L * TBOLT_V, vy: vy / L * TBOLT_V, vz: vz / L * TBOLT_V,
        hue: K.hue, live: true, seen: false, emp: 1 });
      G.stat.ebullets++; G.stat.empShots++;
    }
    e.recoil = 1; e.flash = 1;
    G.ev.push('tfire');
  }

  function killEmp(G, e) {
    const K = EMPK[e.kind];
    e.dead = 1;
    G.pops.push({ x: e.x, y: e.y, z: e.z, boom: 1, t: 0, life: 0.7, hue: K.hue, big: e.kind >= 2 });
    G.shake = Math.max(G.shake, e.kind >= 2 ? 11 : 4);
    G.ev.push(e.kind >= 2 ? 'bigkill' : 'kill');
    G.stat.empKills++;
    award(G, K.pts, e.x, e.y, e.z, e.kind === 3);
    /* CLEAR A WHOLE SITE and it pays out. This is the reward for engaging the LEVEL rather than
     * only the formation — without it the wall is scenery you are allowed to shoot.
     * ⚠ SHOT, not merely GONE. `dead = 2` is "scrolled off the bottom", and counting those would
     *   pay out for killing the one gun of a base whose others simply left — a bonus for being
     *   slow. `n` is the site's size, carried on every member so the pruning pass cannot lose it. */
    let shot = 0;
    for (const o of G.emps) if (o.id === e.id && o.dead === 1) shot++;
    if (shot >= e.n) {
      G.stat.sitesCleared++;
      G.bigMsg = '▣ SITE CLEARED'; G.bigMsgT = 1.3;
      const t = ['gun', 'rapid', 'shield', 'bomb'][(G.rng() * 4) | 0];
      G.pows.push({ x: e.x, y: e.y, z: 0, vy: -3.0, type: t, live: true });
      award(G, 600, e.x, e.y, e.z, true);
    }
  }

  function stepEmps(G, h) {
    const s = G.ship, spec = G.spec;
    /* arrival is measured in SCROLL DISTANCE, never in seconds — so a site's spacing is a property
     * of the building you are climbing, and speeding up means meeting them sooner rather than
     * meeting more of them. */
    if (G.phase !== 'bonus' && spec && spec.empGap && G.scroll >= G.nextSite) {
      G.nextSite = G.scroll + spec.empGap * (0.72 + G.rng() * 0.56);
      spawnSite(G);
    }
    let live = 0;
    for (const e of G.emps) {
      if (e.dead) continue;
      live++;
      e.y -= G.scrollV * h;
      if (e.y < EBOT) { e.dead = 2; continue; }        // scrolled away — not a kill, no points
      if (e.hurt > 0) e.hurt -= h;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - h * 6);
      if (e.recoil > 0) e.recoil = Math.max(0, e.recoil - h * 5);
      const K = EMPK[e.kind];
      if (!K.burst) continue;                          // the core has no gun
      e.t += h;
      /* the visible band at the facade's depth: tan(21°)·(11.4+12) = 8.98 either side of the
       * camera's y. Tracking a target from off screen would put the whole telegraph where nobody
       * can read it, which is the one thing this design cannot afford. */
      const onScreen = e.y < 8.5 && e.y > -9.0;
      if (e.state === 'idle') {
        e.fireT -= h;
        if (e.fireT <= 0 && onScreen && s.alive && G.mode === 'play' && spec.eFire > 0) { e.state = 'track'; e.t = 0; }
      } else if (e.state === 'track') {
        /* it follows you, live and visibly — this is the half that says "it has seen you". */
        e.aimX = s.x; e.aimY = s.y;
        e.tgt = Math.atan2(s.y - e.y, s.x - e.x);
        if (e.t >= K.track) { e.state = 'lock'; e.t = 0; }
      } else if (e.state === 'lock') {
        /* ⛔ AND THIS IS THE HALF THAT SAYS "IT HAS DECIDED". The aim point stops following you.
         *    The barrel keeps pointing at that fixed point in the world while the gun itself falls
         *    past it, so the elevation creeps and the player can read the marked spot off the
         *    geometry alone. Everything needed is in the picture: a barrel that has stopped
         *    following you is a barrel about to fire, at where you were. */
        e.tgt = Math.atan2(e.aimY - e.y, e.aimX - e.x);
        if (e.t >= K.warn) { empFire(G, e); e.state = 'cool'; e.t = 0; }
      } else if (e.state === 'cool') {
        if (e.t >= K.cd) { e.state = 'idle'; e.fireT = 0.1; }
      }
      /* THE TRAVERSE IS A SPRING WITH OVERSHOOT, not a lerp — the hero-wordmark rig's lesson, and
       * for its reason: a servo slewing a mass settles, it does not glide. It is also the cheapest
       * possible "this thing is mechanical". */
      let d = e.tgt - e.ang;
      while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      e.angV += d * 62 * h;
      e.angV *= Math.pow(0.0009, h);
      e.ang += e.angV * h;
    }
    G.empsLive = live;
    if (G.emps.length > 40) G.emps = G.emps.filter(e => !e.dead);
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
    breakFlow(G);
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

    /* ── THE CLIMB ─────────────────────────────────────────────────────────────────────────────
     * ⚑ §4: the world moves because the ship is climbing it, and it moves FASTER when the player
     *   climbs harder. `s.vy` signed, not `abs` — pulling up runs the wall, pushing down eases it.
     *   Dash, roll and overdrive all pull the facility past you, which is the same surge the
     *   starfield already had; what is new is that the building is on the same clock, so speed you
     *   caused is visible in something with STRUCTURE rather than only in a field of dots.
     * ⚠ Smoothed on the fixed tick, so it cannot stutter with the frame rate, and floored well
     *   above zero: the vehicle is a rocket, and a rocket that can be brought to a stop by holding
     *   ▼ is a lift. */
    /* ⛔ AND IT CANNOT BE VELOCITY ALONE, WHICH IS WHAT THE FIRST VERSION USED. Measured over six
     *    seconds of holding ▲: scrollV 4.68 u/s against 4.70 idle — a 0.4% difference, i.e. nothing.
     *    The cause is structural rather than a tuning miss: the ship's box is only 4.2 units tall
     *    (F.YBOT −3.9 to F.YTOP 0.30, deliberately the lower third so the Galaga silhouette holds),
     *    so a climb is a THIRD OF A SECOND of travel and then a ceiling. Keying the world's speed
     *    to `vy` therefore keys it to a transient, and "pull up and the wall runs" was a claim the
     *    code could not keep.
     * ⚑ SO THE SUSTAINED TERM IS HEIGHT IN THE BOX, and it is a better mechanic than the one it
     *   replaces. Flying high means leaning into the climb: the facility comes at you faster, you
     *   meet its guns sooner — and you are also nearer the formation, which is where the dives and
     *   the fire are. It gives the vertical axis a REASON beyond dodging, which it did not have,
     *   and it costs one read of `s.y`. The velocity term stays for the kick on the way up.
     * ⚠ Both terms only READ the ship. Nothing here writes a single value the flight model owns. */
    const perch = (s.y - F.SHIPY) / (F.YTOP - F.YBOT);        // −0.20 on the floor, +0.80 at the top
    const want = (G.mode === 'play' && s.alive)
      ? clamp(s.vy * 0.052 + perch * 0.90
        + (s.dash > 0 ? 1.5 : 0) + (s.od > 0 ? 0.85 : 0) + (s.rollT > 0 ? 0.5 : 0), -0.55, 3.0)
      : 0;
    G.surge += (want - G.surge) * Math.min(1, h * 7);
    G.scrollK = Math.max(0.35, 1 + Math.min(2.4, G.wave * 0.12) + G.surge);
    G.scrollV = SCROLL_BASE * G.scrollK;
    G.scroll += G.scrollV * h;

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
      /* ⚑ THE FLOW STOPWATCH. `flowRun` is how long the chain has been alive without lapsing; it
       * banks into `flowHeld` and resets the instant it drops. ⚠ The lapse also clears
       * `tierFlowOk`, which is the whole of the tier-scoped title — a single dropped chain any
       * time in four waves ends the attempt, and it has to be recorded AT the lapse because
       * nothing afterwards can tell that it happened. */
      if (s.flowT > 0) {
        s.flowT -= h; G.stat.flowRun += h;
        if (s.flowT <= 0) {
          s.flow = 0;
          if (G.stat.flowRun > G.stat.flowHeld) G.stat.flowHeld = G.stat.flowRun;
          G.stat.flowRun = 0; G.stat.tierFlowOk = false;
        }
      }
      if (s.od > 0) { s.od -= h; G.stat.odT += h; if (s.od <= 0) { G.msg = 'overdrive out'; G.msgT = 0.8; } }
      if (s.odCd > 0) s.odCd -= h;
      if (s.dashCd > 0) s.dashCd -= h;
      if (s.rollCd > 0) s.rollCd -= h;

      // ── the two new verbs. Edge-triggered by the driver; the simulation owns the rules.
      if (input.roll) doRoll(G, input.rollDir || (input.right ? 1 : input.left ? -1 : (Math.abs(s.vx) > 0.6 ? Math.sign(s.vx) : 0)));
      /* ── ⛔ THE DASH IS BUFFERED, AND IT IS WHAT MAKES ROLL → DASH A COMBO RATHER THAN A RACE ──
       * `doDash` refuses while `rollT > 0` — correctly; a barrel roll is a committed 0.42 s and a
       * dash out of the middle of one would cancel the animation the i-frames are read from. But
       * FLOW exists to reward exactly that chain, so "ask during a roll and lose the input" makes
       * the game's own combo depend on releasing a key at the right millisecond.
       * ⚑ IT BECAME LOAD-BEARING WHEN THE ROLL BUTTON CAME OFF (artist, 2026-08-06: *"I don't
       *   believe we need the roll button either"*). On touch a tap now rolls and a double tap is
       *   two taps — so the dash request ALWAYS lands mid-roll, by construction, and without this
       *   the double tap the artist asked for by name would be swallowed every single time by the
       *   gesture that precedes it. `DASH_BUF` outlasts a roll on purpose, so the dash fires as
       *   the roll ends: you tap-tap, and the ship rolls and comes out of it dashing.
       * ⚠ It is a BUFFER, not a queue — a later request overwrites an earlier one rather than
       *   stacking, so holding a gesture down can never bank dashes to spend later. */
      if (input.dash) { s.dashBuf = SHIP.DASH_BUF; s.dashBufDir = input.dashDir || (input.right ? 1 : input.left ? -1 : (s.vx >= 0 ? 1 : -1)); }
      if (s.dashBuf > 0) { s.dashBuf -= h; if (doDash(G, s.dashBufDir)) s.dashBuf = 0; }

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
      /* ⛔ DRAG IS PER SECOND. `Math.pow(0.88, h*120)` was 0.88 per TICK — see the SHIP block.
       *    Everything about how this ship feels came out of that one exponent. */
      const d = Math.pow(SHIP.DRAG, h);
      if (input.draw) {
        /* THE DRAWN PATH. The driver hands over a point in the FIELD, not a deflection, so the
         * ship chases where the finger actually is. See SHIP.DRAW_* for why this is a seek. */
        const top = shipTop(spdK) * SHIP.DRAW_K, k = Math.min(1, h * SHIP.DRAW_R);
        const tx = clamp(input.dx, -F.X, F.X), ty = clamp(input.dy, F.YBOT, F.YTOP);
        s.vx = seek(s.vx, clamp((tx - s.x) * SHIP.DRAW_G, -top, top), k, d);
        s.vy = seek(s.vy, clamp((ty - s.y) * SHIP.DRAW_G, -top, top) * SHIP.VACC, k, d);
        s.drawT = 0.08;                       // for the renderer; decays below so a dropped
      } else if (input.stick) {               // finger cannot leave the effect running
        /* the touch stick drives a TARGET velocity, so a thumb at the rim is full speed. It has to
         * scale with the same top speed as the keyboard or the two controls play different games —
         * `seek` is what makes that true rather than merely claimed. */
        const top = shipTop(spdK), k = Math.min(1, h * 16);
        s.vx = seek(s.vx, input.sx * top, k, d);
        s.vy = seek(s.vy, -input.sy * top * SHIP.VACC, k, d);
      } else {
        s.vx += ax * acc * h;
        s.vy += ay * acc * SHIP.VACC * h;
      }
      if (s.drawT > 0) s.drawT -= h;
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
      } else if (e.state === 'wind') {
        /* squaring up: the tumble eases to dead face-on, so the card is at its widest and
         * brightest at the instant it commits. */
        e.tumble += (0 - e.tumble) * Math.min(1, h * 9);
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
        if (!e.entryShot && e.u > 0.34 && e.u < 0.62 && s.alive && KIND[e.kind].fire > 0 && rng() < 0.18 * spec.eFire) {
          e.entryShot = 1; eFire(G, e);
        }
        if (e.u >= 1) { e.state = 'form'; e.roll = 0; e.entryShot = 0; }
      } else if (e.state === 'wind') {
        /* the rear-back. It pulls away from you and drops a little, which is a real recoil shape:
         * a thing loading up before it throws itself. The renderer reads `e.wind` for the flare. */
        diving++;                                     // counts against maxDive — see WIND_T
        e.windT -= h;
        e.wind = clamp(1 - e.windT / WIND_T, 0, 1);
        const k = Math.sin(e.wind * Math.PI * 0.5);
        e.x = e.wx; e.y = e.wy + k * 0.30; e.z = e.wz - k * 1.15;
        e.roll *= Math.pow(0.9, h * 60);
        if (e.windT <= 0) { e.x = e.wx; e.y = e.wy; e.z = e.wz; e.wind = 0; divePath(G, e, rng); }
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
        /* ⚠ `fire: 0` MEANS SILENT, AND divePath SEEDS fireT BEFORE THIS EVER READS IT. The lancer
         * is defined as a type that does not shoot — its threat is entirely where it IS — but the
         * first shot is scheduled by `divePath` for every kind alike, so without this guard it got
         * exactly one free bolt off before `1/(0 * eFire)` = Infinity silenced it forever. One
         * bullet from the type whose whole contract is "this one does not shoot" is worse than a
         * type that shoots properly. */
        if (e.fireT <= 0 && s.alive && e.y > s.y - 0.5 && KIND[e.kind].fire > 0) {
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
          /* ⚑ EVERY DIVE GOES THROUGH THE WIND-UP, INCLUDING THE RIPPER'S. `beamAt` is set here and
           * survives the wind because `divePath` never touches it — so the tell comes first and
           * the tractor run is announced exactly like everything else. */
          if (pick === G.ripper && !s.ripped && !s.dual && s.alive && rng() < 0.45) {
            pick.beamAt = 0.45;                        // open the beam partway down the dive
            windUp(G, pick);
          } else { pick.beamAt = null; windUp(G, pick); }
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
      /* ⚑ THE WALL IS SHOT WITH THE SAME GUN, and only by a bolt that got through. The formation
       * is tested first and a bolt dies on its first hit, so an emplacement is reachable exactly
       * when its column is clear — the level is shielded by the fleet standing in front of it.
       * That is a real decision and it cost nothing to build: it is just the order of two loops. */
      if (b.live && G.emps.length) {
        for (const e of G.emps) {
          if (e.dead) continue;
          const K = EMPK[e.kind];
          if (Math.abs(e.x - b.x) < K.w * 0.62 && Math.abs(e.y - b.y) < K.h * 0.75) {
            e.hp -= b.dmg; e.hurt = 0.22;
            hitScored(G);
            if (e.hp <= 0) killEmp(G, e); else G.ev.push('ping');
            if (b.pierce > 0) { b.pierce--; b.dmg *= 0.66; }
            else { b.live = false; break; }
          }
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
      /* ⚠ A TURRET BOLT IS TWELVE UNITS BEHIND THE PLAY PLANE WHEN IT IS FIRED, AND THE SHIP TEST
       *   READS NO DEPTH AT ALL. Without this gate a bolt still deep in the world would hit you the
       *   moment its x/y crossed yours — a death from something visibly far away, which is the
       *   exact "unavoidable death you cannot see coming" the ram box was tightened for. The gate
       *   is applied ONLY to emplacement bolts, so every existing hit box is byte-identical: a
       *   diver's shot is aimed at z ≈ 0 and arrives there anyway. */
      if (b.emp && Math.abs(b.z) > 0.9) continue;
      if (s.alive && !invuln(s)) {
        const rigs = s.dual ? [-0.62, 0.62] : [0];
        /* ⚠ THE HITBOX IS SMALLER THAN THE SHIP AND THAT IS DELIBERATE — Galaga's is too, and so is
         * every arcade shooter worth the name. The craft is drawn ~0.63 units wide; 0.26 is what
         * makes a near miss read as a near miss instead of as a lie. */
        for (const rx of rigs) {
          if (Math.abs(b.x - (s.x + rx)) < 0.26 && Math.abs(b.y - s.y) < 0.30) {
            b.live = false;
            if (b.emp) G.stat.dByTurret++; else G.stat.dByShot++;
            hitShip(G); break;
          }
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

    // ── the facility ──
    stepEmps(G, h);

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
    /* ⚑ COUNTED HERE, ONCE, FOR EVERY DEATH — the ram, the rip, the beam and the ordinary bolt all
     * arrive through this one function, so a kill cannot be scored by one path and missed by
     * another. `od > 0` is read at the instant of the kill rather than at the shot: OVERDRIVE is
     * 4.2 s lit on a 10.2 s cycle (a 41.2% ceiling), so a bolt fired inside the window can easily
     * land outside it, and the title is about killing IN overdrive. */
    if (G.phase !== 'bonus') {
      G.stat.kills++;
      if (G.ship.od > 0) G.stat.odKills++;
    }
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
    breakFlow(G);
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
    G.emps.length = 0; G.scroll = 0; G.scrollK = 1; G.scrollV = SCROLL_BASE;
    G.surge = 0; G.tier = 1; G.lastTier = 0; G.nextSite = 14; G.siteId = 0;
    G.tierDone = null;                       // the last COMPLETED tier's title flags
    G.captive = null;
    const shieldMax = SHIP.SHIELD + Math.max(0, Math.round((G.loadout.shield || 0) * 0.5));
    Object.assign(G.ship, { x: 0, y: F.SHIPY, vx: 0, vy: 0, roll: 0, pitch: 0, alive: true, respawn: 0,
      inv: 1.4, iframe: 0, dual: false, ripped: false, rapid: 0, fireT: 0,
      shield: shieldMax, shieldMax, sinceHit: 0,
      dash: 0, dashCd: 0, dashDir: 0, dashBuf: 0, dashBufDir: 0, rollT: 0, rollCd: 0, rollDir: 0, spin: 0, drawT: 0,
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
    waveSpec, multOf, slotXYZ, bez, bezT, mulberry32, shipTop, seek, _selfCheck,
    TIERS, EMPK, tierOf, tierSpec, SCROLL_BASE, EZ, ETOP, EBOT, WIND_T };
})();

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
    X: 6.3,                    // playable half-width
    YTOP: 0.4, YBOT: -4.3,     // the SHIP's box. Deliberately the lower third: Galaga's silhouette
                               // is "them up there, you down here", and free vertical movement
                               // dissolves it into a twin-stick game.
    SHIPY: -3.4,
    COLS: 9, ROWS: 4,
    COLW: 1.30, ROWH: 0.86,
    FORMY: 4.05,               // top row
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
      ship: { x: 0, y: F.SHIPY, vx: 0, vy: 0, roll: 0, alive: true, respawn: 0, inv: 2,
              dual: false, ripped: false, gun: 1, rapid: 0, fireT: 0 },
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
      stat: { threatEvents: 0, dives: 0, ebullets: 0, waves: 0, peakEnemies: 0, subSteps: 0, deaths: 0, dByShot: 0, dByRam: 0, dByRip: 0 },
    };
    return G;
  }

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
      count: bonus ? 16 : Math.min(36, 24 + (w - 1) * 2),
      diveGap: Math.max(0.30, 1.15 - (w - 1) * 0.085),
      maxDive: Math.min(7, 2 + Math.floor(w * 0.8)),
      /* ⚠ eFire IS THE DIFFICULTY DIAL AND IT TOOK THREE PASSES TO GET RIGHT. 0.85 first: measured
       * with a dodging bot, three lives gone in 9 seconds and wave 2 never reached. 0.50 next:
       * still 3-4 deaths inside 15 seconds, and the death-cause counters said all of them were
       * BULLETS (dByShot 3, dByRam 0, dByRip 0) — which is what sent this here rather than to the
       * collision boxes. Density is the brief; a wall of aimed fire on wave 1 is just the opposite
       * failure with better production values, and it is the one that makes a game feel unfair
       * rather than hard. 0.34 opens with roughly one bullet in the air and the steeper 0.26 ramp
       * still reaches the old 0.85 by wave 3 and the cap by wave 10. The pressure on wave 1 is
       * meant to come from DIVERS and from things filling the screen — those never went down. */
      eFire: bonus ? 0 : Math.min(2.6, 0.34 + (w - 1) * 0.26),
      speed: Math.min(2.1, 1 + (w - 1) * 0.075),
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

  // ── firing ──────────────────────────────────────────────────────────────────────────────────
  const GUNS = [
    { bolts: [0, 0], off: [-0.24, 0.24], rate: 0.115, dmg: 1, name: 'twin' },
    { bolts: [-0.11, 0, 0.11], off: [-0.3, 0, 0.3], rate: 0.108, dmg: 1, name: 'tri' },
    { bolts: [-0.2, -0.07, 0.07, 0.2], off: [-0.42, -0.16, 0.16, 0.42], rate: 0.10, dmg: 1, name: 'quad' },
    { bolts: [-0.3, -0.12, 0, 0.12, 0.3], off: [-0.5, -0.24, 0, 0.24, 0.5], rate: 0.092, dmg: 1.5, name: 'penta' },
    { bolts: [-0.38, -0.16, 0, 0.16, 0.38], off: [-0.56, -0.26, 0, 0.26, 0.56], rate: 0.076, dmg: 2.4, name: 'MAX plasma', laser: true },
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
   * ⚠ Do not "improve" this by raising the cap. The cap IS the game. */
  const BOLT_V = 16, EBOLT_V = 8.6;
  const BOLT_CAP = 2;

  function fire(G) {
    const s = G.ship;
    if (!s.alive || G.mode !== 'play') return;
    const g = GUNS[clamp(s.gun - 1, 0, GUNS.length - 1)];
    const rate = g.rate / (s.rapid > 0 ? 1.75 : 1) / (G.loadout.rate || 1);
    if (G.t - s.fireT < rate) return;
    const rigs = s.dual ? [-0.62, 0.62] : [0];
    let live = 0; for (const b of G.bullets) if (b.live) live++;
    if (live >= BOLT_CAP * rigs.length * g.bolts.length) return;
    s.fireT = G.t;
    for (const rx of rigs) {
      for (let i = 0; i < g.bolts.length; i++) {
        G.bullets.push({ x: s.x + rx + g.off[i], y: s.y + 0.5, z: 0, vx: g.bolts[i] * 9, vy: BOLT_V,
          dmg: g.dmg * (G.loadout.dmg || 1), laser: !!g.laser, live: true });
        G.shots++; G.waveShots++;
      }
    }
    G.muzzle = 1;
    G.ev.push('fire');
  }

  function eFire(G, e) {
    /* Aimed with LEAD, but only partial lead (0.55): a perfectly-led shot from eight enemies at
     * once is unreadable, and an unaimed one is ignorable. Partial lead means moving is the right
     * answer and standing still is the wrong one, which is the behaviour the shot is for. */
    const s = G.ship;
    const dx = (s.x + s.vx * 0.55) - e.x, dy = (s.y - 0.2) - e.y, dz = 0 - e.z;
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
      s.respawn -= h;
      if (s.respawn <= 0 && G.lives > 0) { s.alive = true; s.x = 0; s.y = F.SHIPY; s.vx = 0; s.vy = 0; s.inv = 2.2; s.gun = Math.max(1, s.gun - 1); }
    } else {
      if (s.inv > 0) s.inv -= h;
      /* Acceleration + heavy damping rather than direct position. 34 u/s² with 0.88^ (per 1/120 s)
       * damping settles at ~7.5 u/s, which crosses the 12.6-unit field in 1.7 s. Galaga's ship
       * crosses in about 1.6 s; a twin-stick's would be 0.6 s and would make the formation
       * trivially dodgeable. */
      const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const ay = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      const acc = 34 * (G.loadout.speed || 1);
      if (input.stick) { s.vx += (input.sx * 8.2 - s.vx) * Math.min(1, h * 16); s.vy += (-input.sy * 6.4 - s.vy) * Math.min(1, h * 16); }
      else { s.vx += ax * acc * h; s.vy += ay * acc * 0.7 * h; }
      const d = Math.pow(0.88, h * 120);
      s.vx *= d; s.vy *= d;
      s.x = clamp(s.x + s.vx * h, -F.X, F.X);
      s.y = clamp(s.y + s.vy * h, F.YBOT, F.YTOP);
      if (s.x <= -F.X || s.x >= F.X) s.vx = 0;
      s.roll += (clamp(-s.vx * 0.11, -0.7, 0.7) - s.roll) * Math.min(1, h * 11);
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
      if (!s.alive || s.inv > 0) continue;
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
          b.live = false;
          e.hp -= b.dmg;
          e.hurt = 0.25;
          hitScored(G);
          if (e.hp <= 0) killEnemy(G, e); else G.ev.push('ping');
          break;
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
      if (s.alive && s.inv <= 0) {
        const rigs = s.dual ? [-0.62, 0.62] : [0];
        for (const rx of rigs) {
          if (Math.abs(b.x - (s.x + rx)) < 0.34 && Math.abs(b.y - s.y) < 0.36) { b.live = false; G.stat.dByShot++; hitShip(G); break; }
        }
      }
    }
    if (G.ebullets.length > 120) G.ebullets = G.ebullets.filter(b => b.live);

    // ── enemy ↔ ship collision (a diver that reaches you is a kill, both ways) ──
    if (s.alive && s.inv <= 0) {
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
  function hitShip(G) {
    const s = G.ship;
    if (s.dual) {
      /* the double rig is spent as ARMOUR, not deleted outright — losing both ships to one bullet
       * after the gamble paid off would make the gamble not worth taking. */
      s.dual = false; s.inv = 1.4; G.shake = Math.max(G.shake, 14); G.flash = 0.7; G.ev.push('hurt');
      G.msg = 'rig split'; G.msgT = 1.1; return;
    }
    s.alive = false; s.respawn = 1.4; G.lives--; G.stat.deaths++;
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
        else if (p.type === 'shield') { G.lives = Math.min(6, G.lives + 1); G.msg = '◆ +1 RIG'; }
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
    Object.assign(G.ship, { x: 0, y: F.SHIPY, vx: 0, vy: 0, roll: 0, alive: true, respawn: 0,
      inv: 1.4, dual: false, ripped: false, gun: 1, rapid: 0, fireT: 0 });
    if (G.loadout.guns && G.loadout.guns.indexOf('laser') >= 0) G.ship.gun = 4;
    else if (G.loadout.guns && G.loadout.guns.indexOf('spread') >= 0) G.ship.gun = 2;
    G.ev.length = 0;
    G.stat = { threatEvents: 0, dives: 0, ebullets: 0, waves: 0, peakEnemies: 0, subSteps: 0, deaths: 0, dByShot: 0, dByRam: 0, dByRip: 0 };
    acc = 0;
    buildWave(G);
  }

  return { create, start, step, fire, burn, F, KIND, GUNS, waveSpec, multOf, slotXYZ, bez, bezT, mulberry32 };
})();

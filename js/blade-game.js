/* THE LIGHT — the duel, and nothing else (BladeGame).
 *
 * Artist, 2026-08-07: "a game that is light sword fighting the dark, over the shoulder cam - made
 * specifically for phone. control is double tap and drag for slashing, blocking, fast movement.
 * the finger is the sword and you fight the other on coming swords, as you battle through."
 *
 * ⛔ "THE FINGER IS THE SWORD" IS THE WHOLE DESIGN, AND IT HAS ONE CONSEQUENCE THAT DECIDES
 *    EVERYTHING ELSE: THE DIRECTION YOU DRAG HAS TO MATTER. A game where any swipe answers any
 *    attack is Fruit Ninja — satisfying, but it is not sword fighting, because your hand is not
 *    making a decision. So an incoming blade cuts along a LINE, and you answer it by cutting
 *    ACROSS that line. Drag parallel to their edge and your blade slides off it and you are cut.
 *    ⚑ That single rule is what turns a swipe into a READ: you look at the angle, then you answer
 *      the angle. It is learnable in two seconds and deep for as long as the angles keep changing.
 *
 * ⚑ THE GESTURE VOCABULARY IS THE ONE THIS STUDIO ALREADY SHIPPED. RIP ROCKETER's touch scheme is
 *   tap / tap-tap / tap-tap-hold, and CLAUDE.md records it as the pass that finally made that
 *   cabinet playable one-handed. Same shape here, because a player who learned one arcade should
 *   not have to learn a second grammar:
 *      drag                  SLASH  — the arc your finger draws IS the blade
 *      double-tap            PARRY  — a guard beat; timing, not direction
 *      double-tap then drag  STEP   — fast movement, break or close
 *
 * ⛔ AND A DEFLECT IS NOT A DODGE — IT OPENS THEM UP. Answering a blade correctly staggers the
 *    attacker for a beat, and a slash landed inside that beat is what actually kills. Without that
 *    the game is pure defence and there is no rhythm; with it the loop is READ → DEFLECT → STRIKE,
 *    which is the sentence the whole thing has to be.
 *
 * PURE AND SEEDED: no DOM, no engine, no clock of its own. `npm run test:blade` drives thousands
 * of exchanges against the SHIPPING rules under node — the split cr-streak.js and pull-game.js use.
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;

  // ── the numbers, and every one is a feel decision ────────────────────────────────────────────
  const HP = 100;
  const TELEGRAPH = 0.62;      // s a blade is visible before it lands — the whole read window
  const STRIKE = 0.16;         // s the blade is actually AT you: parry has to land inside this
  const OPEN = 0.85;           // s an attacker is exposed after you answer them
  const STEP_CD = 0.55;        // s between steps, so it cannot be spammed as invulnerability
  const STAM = 3;              // steps before you have to stop stepping
  const STAM_REGEN = 1.6;      // s per point
  /* ⛔ 30° IS THE WHOLE SKILL CEILING AND IT IS DELIBERATELY GENEROUS. `|sin(dθ)| > 0.5` means any
   * answer more than 30 degrees off their line deflects — so a player who reads the angle at all is
   * rewarded, and only a lazy swipe along the blade fails. A tighter window would make a phone
   * screen a precision instrument, which it is not. ⚠ Tuned against the driven bot in test:blade,
   * not by eye: at 0.5 a bot that aims perpendicular deflects ~100% and a bot that swipes at random
   * deflects ~50%, which is the separation that makes the read worth doing. */
  const CROSS = 0.5;
  const SLASH_MIN = 46;        // px of travel before a drag counts as a slash, not a tap
  const DOUBLE_MS = 300;       // window for the second tap
  const TAP_SLOP = 14;         // px a tap may travel and still be a tap

  /* Smallest angle between two undirected LINES (a blade has no head or tail): 0..pi/2. */
  function lineDelta(a, b) {
    let d = Math.abs(a - b) % Math.PI;
    if (d > Math.PI / 2) d = Math.PI - d;
    return d;
  }
  const crosses = (mine, theirs) => Math.sin(lineDelta(mine, theirs)) > CROSS;

  function rng(seed) {
    let a = (seed >>> 0) || 3030;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── THE GESTURE CLASSIFIER LIVES HERE, NOT IN THE PAGE. `test:rr` records the cost of the other
   * arrangement: a recogniser buried in a touch handler can only be tested by dispatching synthetic
   * touches through a driver, and that driver is slower than the window it is measuring, so it ends
   * up measuring itself. This takes plain numbers and returns a verb.
   * ⚠ A TAP NEEDS BOTH HALVES — neither travelled NOR lingered. RIP ROCKETER shipped a time-only
   *   test and it fired five phantom dashes out of six brisk steering flicks. */
  function classify(p) {
    const dx = p.x1 - p.x0, dy = p.y1 - p.y0;
    const dist = Math.hypot(dx, dy);
    const held = p.gap != null && p.gap <= DOUBLE_MS;
    if (dist >= SLASH_MIN) return held ? 'step' : 'slash';
    if (dist <= TAP_SLOP && held) return 'parry';
    return null;
  }
  /* the angle of the LINE the finger drew. ⚠ `atan2` on the raw delta, then read as a line — a cut
   * from upper-left to lower-right and its reverse are the same cut. */
  const arcOf = p => Math.atan2(p.y1 - p.y0, p.x1 - p.x0);

  // ── a duel ───────────────────────────────────────────────────────────────────────────────────
  function create(opts) {
    const o = opts || {};
    const rnd = rng(o.seed || 1);
    const S = {
      t: 0, hp: HP, wave: 1, score: 0, combo: 0, bestCombo: 0, stam: STAM, stepAt: -9,
      foes: [], over: false, cleared: 0, spawned: 0,
      stat: { slashes: 0, deflects: 0, parries: 0, steps: 0, hits: 0, kills: 0, slid: 0 },
    };

    /* ⚑ A FOE IS A BLADE, NOT A BODY. What you read is the ARC — the line it will cut along — and
     * everything else about it is decoration. `arc` is the line; `at` is when it lands. */
    function spawn(lane, delay) {
      const arc = rnd() * Math.PI;                      // any line; the read is the whole game
      S.spawned++;
      const f = { id: 'f' + S.spawned,
        lane: lane != null ? lane : (rnd() * 2 - 1),    // -1 left .. +1 right, for the camera
        arc, at: S.t + TELEGRAPH + (delay || 0), hp: 1, open: 0, dead: false, landed: false };
      S.foes.push(f);
      return f;
    }

    /* ⛔ THEY ARRIVE IN SEQUENCE, NOT TOGETHER, AND THE FIRST VERSION GOT THIS WRONG IN A WAY THAT
     * WOULD HAVE READ AS "the controls don't work". Every foe in a wave was given `at = t +
     * TELEGRAPH`, so six blades landed on the SAME INSTANT — one gesture can answer one line, so
     * five of the six were unanswerable by construction, and `threat()` picking "the earliest" had
     * a six-way tie it broke by array order. The player would have experienced a correct read
     * being punished, which is the one thing this design cannot afford.
     * ⚑ THE GAP IS THE DIFFICULTY, AND IT IS THE ONLY DIFFICULTY. Not damage, not health, not
     *   blade speed — those all change how much a mistake costs. The gap changes how much time you
     *   have to READ, which is the actual skill. It tightens with the wave and floors at GAP_MIN,
     *   which is a shade over the strike window: below that, two lines overlap and the game stops
     *   being answerable again — the same wall, arrived at gradually instead of on wave one. */
    const GAP_0 = 1.15, GAP_MIN = 0.34;
    function waveGap() { return Math.max(GAP_MIN, GAP_0 - (S.wave - 1) * 0.075); }
    function seedWave() {
      const n = Math.min(6, 1 + Math.floor(S.wave * 0.8));
      const gap = waveGap();
      for (let i = 0; i < n; i++) spawn(-1 + 2 * (i + 0.5) / n, i * gap);
    }
    seedWave();

    function live() { return S.foes.filter(f => !f.dead); }
    /* the blade that is closest to landing — the one a player is actually answering */
    function threat() {
      let best = null;
      for (const f of live()) { if (f.landed) continue;
        if (!best || f.at < best.at) best = f; }
      return best;
    }

    function hurt(n) {
      S.hp = Math.max(0, S.hp - n);
      S.combo = 0;
      S.stat.hits++;
      if (!S.hp) S.over = true;
    }

    /* ── ONE GESTURE, RESOLVED. Returns what happened so the view can say it out loud — a player
     * who cannot tell a deflect from a lucky miss cannot learn the angle rule. */
    function act(kind, arc) {
      if (S.over) return { kind: 'none' };
      const f = threat();

      if (kind === 'step') {
        if (S.t - S.stepAt < STEP_CD || S.stam <= 0) return { kind: 'step', ok: false, why: 'spent' };
        S.stepAt = S.t; S.stam--; S.stat.steps++;
        /* ⚠ A STEP ALWAYS SAVES YOU AND THAT IS WHY IT COSTS STAMINA AND GIVES NO OPENING. Without
         *   a price it is a better answer than reading the angle, and the read is the game. */
        /* ⚠ MARK ONLY — the recover branch in step() owns what happens next. Writing an `at`
         * here as well would be a second author of the same fact, and the two would drift. */
        if (f && f.at - S.t <= STRIKE * 2) f.landed = true;
        return { kind: 'step', ok: true };
      }

      if (kind === 'parry') {
        S.stat.parries++;
        if (f && Math.abs(f.at - S.t) <= STRIKE) {
          f.open = S.t + OPEN; f.landed = true;
          S.combo++; S.bestCombo = Math.max(S.bestCombo, S.combo);
          S.score += 60 + 20 * S.combo;
          return { kind: 'parry', ok: true, foe: f.id, opened: true };
        }
        /* ⚠ A MISSED PARRY IS NOT FREE — it is the one input with a real cost, which is what stops
         *   "double-tap constantly" being a strategy. It burns the guard for a beat. */
        S.stepAt = S.t - STEP_CD * 0.5;
        return { kind: 'parry', ok: false, why: 'early' };
      }

      if (kind === 'slash') {
        S.stat.slashes++;
        /* strike an opened foe: this is the half that KILLS, and it is only reachable through a
         * successful answer, which is what makes the loop READ -> DEFLECT -> STRIKE */
        const opened = live().filter(x => x.open > S.t);
        if (opened.length) {
          const x = opened[0];
          x.dead = true; S.stat.kills++; S.cleared++;
          S.combo++; S.bestCombo = Math.max(S.bestCombo, S.combo);
          S.score += 100 + 40 * S.combo;
          if (!live().length) { S.wave++; S.hp = Math.min(HP, S.hp + 8); S.stam = STAM; seedWave(); }
          return { kind: 'slash', ok: true, killed: x.id, combo: S.combo };
        }
        if (!f) return { kind: 'slash', ok: false, why: 'air' };
        /* ⛔ THE ANGLE RULE. Cut ACROSS their line and you take it; cut ALONG it and your blade
         *   slides off and their edge reaches you. This is the only place direction is read, and it
         *   is the entire reason the finger is a sword rather than a button. */
        const near = f.at - S.t <= TELEGRAPH && f.at - S.t > -STRIKE;
        if (!near) return { kind: 'slash', ok: false, why: 'air' };
        if (crosses(arc, f.arc)) {
          f.open = S.t + OPEN; f.landed = true;
          S.stat.deflects++;
          S.combo++; S.bestCombo = Math.max(S.bestCombo, S.combo);
          S.score += 80 + 25 * S.combo;
          return { kind: 'slash', ok: true, deflected: f.id, opened: true,
            delta: +(lineDelta(arc, f.arc) * 180 / Math.PI).toFixed(1) };
        }
        S.stat.slid++;
        return { kind: 'slash', ok: false, why: 'slid', foe: f.id,
          delta: +(lineDelta(arc, f.arc) * 180 / Math.PI).toFixed(1) };
      }
      return { kind: 'none' };
    }

    /* ⛔ AN ANSWERED FOE RECOVERS. IT IS NOT REMOVED — AND THE FIRST VERSION REMOVED IT, WHICH
     * TURNED THE GAME INTO A STILL LIFE. `landed` is set by every answer (deflect, parry, step) and
     * only this function ever cleared it; this loop skipped `landed` foes, so nothing ever cleared
     * it. A blade you turned but failed to follow up on was frozen FOREVER: it never attacked
     * again, `threat()` skipped it, and it could not be killed because a kill needs an open window
     * that had already closed. Deflect a few without finishing them and the whole wave went inert —
     * the player became immortal and the screen stopped moving.
     * ⚑ NOTHING ERRORED AND THE HP BAR LOOKED PERFECT, which is why it was found by a driven suite
     *   asking "does a player who stops defending actually die" and getting `false` after 200
     *   simulated seconds. Every §A assertion passed throughout: each one answers a blade and then
     *   kills it, so none of them ever lived through the state that breaks.
     * ⚑ AND THE FIX IS THE BETTER DESIGN. A deflect is supposed to buy you a BEAT, not delete
     *   someone: they stagger, they recover, they come again. That is what makes the open window
     *   worth spending a slash on instead of just turning blades away all day. */
    function step(dt) {
      if (S.over) return;
      S.t += dt;
      S.stam = Math.min(STAM, S.stam + dt / STAM_REGEN);
      for (const f of live()) {
        if (f.landed) {
          /* they are staggered while the opening is live; the instant it closes they wind up
           * again. ⚠ Read from `open`, not from a second timer — one fact, one place, or the
           * stagger and the opening can disagree and a foe recovers while still marked open. */
          if (f.open <= S.t) { f.landed = false; f.at = S.t + TELEGRAPH * (1.15 + rnd() * 0.55); }
          continue;
        }
        if (f.at > S.t) continue;
        hurt(12);
        f.at = S.t + TELEGRAPH * 1.9;                    // it winds up again rather than vanishing
      }
    }

    return {
      get state() { return S; },
      act, step, threat, spawn, waveGap,
      /* ⚑ exposed so a driven check can ask the world the same question the rules ask, rather than
       * inferring it from an outcome — `__city._collide`'s lesson. `waveGap` in particular: the
       * difficulty curve is one number, and a curve nothing can read is a curve nobody can prove
       * is monotone. */
      crosses, lineDelta, classify, arcOf,
    };
  }

  const API = { create, classify, arcOf, crosses, lineDelta, rng,
    HP, TELEGRAPH, STRIKE, OPEN, STEP_CD, STAM, CROSS, SLASH_MIN, DOUBLE_MS, TAP_SLOP };
  root.BladeGame = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

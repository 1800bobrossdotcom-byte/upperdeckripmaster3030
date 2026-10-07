#!/usr/bin/env node
/* THE LIGHT — the rule, the pacing, the geometry, and the glass.   npm run test:blade
 *
 * ⚑ THE RULES MODULE IS PURE AND SEEDED, so §A and §B drive tens of thousands of exchanges against
 *   the SHIPPING code under node rather than against a model of it — the split cr-streak.js and
 *   pull-game.js already use, and the only reason a claim like "a perpendicular answer always
 *   deflects and a random swipe answers half the time" can be a measurement here instead of a
 *   feeling.
 *
 * ⛔ FOUR THINGS ARE NOT NEGOTIABLE, in order of what they would cost:
 *   1. THE ANGLE RULE HAS TO DISCRIMINATE. If any swipe answers any blade this is Fruit Ninja with
 *      a sword on it, and the game the artist asked for does not exist. §A proves the separation
 *      by MEASURING two bots that differ only in where they aim.
 *   2. BLADES MUST NOT ARRIVE TOGETHER. One gesture answers one line, so a wave that lands as one
 *      instant is unanswerable BY CONSTRUCTION — and a player experiences that as a correct read
 *      being punished, which is the one thing a game built on reading cannot afford. This shipped
 *      broken in the first draft; §A2 is why it did not ship at all.
 *   3. THE SCREEN-ANGLE CONVENTION. `rollFor` turns a drawn line into a drawn blade, and 90° out
 *      it RENDERS PERFECTLY while making every correct answer look wrong. There is no visual tell.
 *   4. THE GEOMETRY PIVOTS AT THE GRIP. §C reads models/blade.glb itself, so the contract holds
 *      even for someone who never runs `npm run blade`.
 *
 * ⚠ EVERY PROBE RETURNS {err} AND NEVER THROWS. An `evaluate` that throws rejects the whole script
 *   — no FAIL line, no total, which reads exactly like a clean run. Recorded twice in this repo
 *   (test:forge, test:board) and it is precisely the sabotage case: the moment a sabotage removes
 *   the thing being reached for is the moment the harness must still speak.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9053;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg' };

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok   ' + m + (d ? '  — ' + d : '')); }
  else { fail++; console.log('  FAIL ' + m + (d ? '  — ' + d : '')); } };
const head = t => console.log('\n' + t);
const D = n => Math.round(n * 1000) / 1000;

// ── load the shipping rules under node ────────────────────────────────────────────────────────
globalThis.window = globalThis;
const SRC = process.env.BLADE_SRC || join(ROOT, 'js/blade-game.js');
eval(await readFile(SRC, 'utf8'));
const B = globalThis.BladeGame;

const RAD = d => d * Math.PI / 180;
const DEG = r => r * 180 / Math.PI;

// ══ §A  THE RULES ══════════════════════════════════════════════════════════════════════════════
head('§A  the rule the whole game is made of');

/* A1-A3 — the gesture classifier. ⚠ A TAP NEEDS BOTH HALVES, neither travelled nor lingered.
 * RIP ROCKETER shipped a time-only test and it fired five phantom dashes out of six brisk
 * steering flicks — and here steering IS a drag on the same glass, so a distance-blind classifier
 * would parry every time you swept the sword. */
{
  const drag = { x0: 0, y0: 0, x1: 120, y1: 20, gap: 9e9 };
  const dragAfterTap = { x0: 0, y0: 0, x1: 120, y1: 20, gap: 140 };
  const tapAlone = { x0: 0, y0: 0, x1: 3, y1: 2, gap: 9e9 };
  const tapAfterTap = { x0: 0, y0: 0, x1: 3, y1: 2, gap: 140 };
  const lingerNoTravel = { x0: 0, y0: 0, x1: 4, y1: 3, gap: 900 };
  ok(B.classify(drag) === 'slash', 'A1 a drag is a SLASH', B.classify(drag));
  ok(B.classify(dragAfterTap) === 'step', 'A2 a drag right after a tap is a STEP', B.classify(dragAfterTap));
  ok(B.classify(tapAfterTap) === 'parry', 'A3 the second of two taps is a PARRY', B.classify(tapAfterTap));
  ok(B.classify(tapAlone) === null && B.classify(lingerNoTravel) === null,
    'A4 a lone tap is nothing — a double-tap needs both taps, and a slow tap is still not one',
    B.classify(tapAlone) + ' / ' + B.classify(lingerNoTravel));
  /* the distance half, stated on its own so it cannot be satisfied by the time half */
  const brisk = { x0: 0, y0: 0, x1: 90, y1: 0, gap: 60 };
  ok(B.classify(brisk) === 'step',
    'A5 travel decides slash-vs-tap, so a brisk flick is never mistaken for a guard', B.classify(brisk));
}

/* A6-A8 — the angle. A blade is an undirected LINE, so a cut and its reverse are one cut. */
{
  ok(D(DEG(B.lineDelta(RAD(10), RAD(190)))) === 0,
    'A6 a line and its reverse are the same line', DEG(B.lineDelta(RAD(10), RAD(190))).toFixed(3) + '°');
  ok(Math.abs(DEG(B.lineDelta(RAD(0), RAD(90))) - 90) < 1e-9,
    'A7 perpendicular reads as 90°');
  const at = d => B.crosses(RAD(d), 0);
  ok(!at(0) && !at(10) && !at(25) && at(35) && at(90) && at(145),
    'A8 the 30° gate: under it slides, over it turns',
    [0, 10, 25, 29, 31, 35, 90].map(d => d + '°:' + (at(d) ? 'turn' : 'slide')).join(' '));
  ok(!at(29) && at(31), 'A9 the gate is exactly where CROSS says it is (sin 30° = 0.5)');
}

/* A10-A13 — a slash ALONG the line slides and does not answer; ACROSS it turns and OPENS. */
{
  const g = B.create({ seed: 7 });
  const f = g.threat();
  const slid = g.act('slash', f.arc);                       // dead parallel
  ok(slid.ok === false && slid.why === 'slid', 'A10 a cut along their edge slides off', JSON.stringify(slid.why));
  ok(g.threat() === f, 'A11 …and does NOT answer it — the same blade is still coming');
  const turned = g.act('slash', f.arc + Math.PI / 2);
  ok(turned.ok === true && turned.deflected === f.id && turned.opened === true,
    'A12 a cut across it turns the blade and OPENS them', JSON.stringify(turned.delta) + '°');
  const kill = g.act('slash', 0);
  ok(kill.ok === true && kill.killed === f.id,
    'A13 a slash inside that opening kills — READ → DEFLECT → STRIKE', JSON.stringify(kill.killed));
}

/* A14 — and the opening CLOSES. Without this the kill is free forever and the beat means nothing. */
{
  const g = B.create({ seed: 11 });
  const f = g.threat();
  g.act('slash', f.arc + Math.PI / 2);
  g.step(B.OPEN + 0.05);
  const late = g.act('slash', 0);
  ok(!late.killed, 'A14 the opening closes — a late strike kills nobody', JSON.stringify(late.why || late));
}

/* ── A14b/A14c — AN ANSWERED FOE RECOVERS. ⛔ THIS IS THE ASSERTION THE SUITE WAS MISSING WHEN THE
 * BUG IT GUARDS SHIPPED, and the gap is instructive: every other case here answers a blade and
 * then immediately KILLS it, so not one of them ever lived through the state that breaks — a foe
 * deflected and left alive. In that state `landed` was set by the answer and cleared by nobody,
 * `threat()` skipped it, `step()` skipped it, and it could never be killed because the opening had
 * closed. Deflect a couple without finishing them and the wave went inert: the player was immortal
 * and the screen stopped moving, with a full HP bar and no error.
 * ⚑ Proved to bite by restoring the exact defect (`continue` before the recover branch): with it,
 *   the sole foe of wave 1 never attacks again and A14c's idle player lives forever. */
{
  const g = B.create({ seed: 41 });
  const f = g.threat();
  g.act('slash', f.arc + Math.PI / 2);                       // turn it, and deliberately do NOT strike
  ok(f.landed === true && f.open > g.state.t, 'A14b a deflect staggers them for a beat');
  g.step(B.OPEN + 0.1);
  ok(f.landed === false && f.dead === false && f.at > g.state.t,
    'A14c …and when the beat closes they RECOVER and wind up again — staggered, not deleted',
    JSON.stringify({ landed: f.landed, dead: f.dead, windup: D(f.at - g.state.t) }));
  ok(g.threat() === f, 'A14d …so they are the blade in front of you once more');
}
{
  /* the consequence, on a wave of exactly one: turn the only blade away, then stand still. If a
   * deflect deleted them, nothing would ever reach you again and the duel would be a still life. */
  const g = B.create({ seed: 43 });
  ok(g.state.foes.filter(x => !x.dead).length === 1,
    'A14e (wave 1 is a single blade, so this measures that blade and nothing else)');
  const f = g.threat();
  g.act('slash', f.arc + Math.PI / 2);
  for (let i = 0; i < 1200 && !g.state.over; i++) g.step(0.05);
  ok(g.state.stat.hits > 0 && g.state.over,
    'A14f a player who turns a blade away and then stops is still cut down by it',
    g.state.stat.hits + ' hits, dead at ' + D(g.state.t) + 's');
}

/* A15-A17 — the parry is TIMING and it is not free. */
{
  const g = B.create({ seed: 13 });
  const early = g.act('parry');
  ok(early.ok === false && early.why === 'early', 'A15 a parry thrown early catches nothing');
  const g2 = B.create({ seed: 13 });
  const f2 = g2.threat();
  /* ⚠ JUST BEFORE, NOT EXACTLY ON. `step()` LANDS a blade the moment `t >= at` — it hurts you and
   * winds the blade up again — so stepping exactly onto `at` means the parry arrives after the cut
   * and finds a re-armed blade a full telegraph away. ⚑ The window is therefore effectively
   * ONE-SIDED, [at − STRIKE, at], even though the rule reads as symmetric: the "after" half is
   * unreachable because being there means you were already hit. That is the right behaviour and
   * the wrong assertion, and it is worth saying out loud — at 60 fps this is ~10 frames of guard,
   * which is what makes the parry a timing verb rather than a coin toss. */
  g2.step(f2.at - g2.state.t - 0.02);
  const hit = g2.act('parry');
  ok(hit.ok === true && hit.opened === true, 'A16 a parry inside the strike window catches and opens',
    'thrown ' + D(f2.at - g2.state.t) + 's before it lands, window ' + B.STRIKE + 's');
  /* the cost: a missed guard pushes the step timer, so double-tapping forever is not a strategy */
  const g3 = B.create({ seed: 17 });
  g3.step(0.9);
  g3.act('parry');
  const stepped = g3.act('step');
  ok(stepped.ok === false, 'A17 a missed parry burns the guard — you cannot spam it', JSON.stringify(stepped.why));
}

/* A18-A19 — the step always saves you, which is exactly why it is metered. */
{
  const g = B.create({ seed: 19 });
  const f = g.threat();
  g.step(f.at - g.state.t - 0.02);
  const s = g.act('step');
  ok(s.ok === true && f.landed === true, 'A18 a step takes you out of a blade that was about to land');
  let spent = 1;
  for (let i = 0; i < 8; i++) { g.step(B.STEP_CD + 0.01); if (g.act('step').ok) spent++; }
  ok(spent <= B.STAM + 4, 'A19 …and stamina bounds it — it is not invulnerability', spent + ' steps in 9 tries');
}

// ── §A2  PACING: they arrive in SEQUENCE ──────────────────────────────────────────────────────
head('§A2  blades arrive one at a time — the defect that would have read as broken controls');
{
  /* ⚠ WAVE 1 HAS ONE FOE, SO "no two blades collide" IS TRIVIALLY TRUE OF IT — and the first
   * version of this block asserted exactly that, reporting a reassuring `closest pair 9s` from
   * its own no-pairs fallback. Same vacuity that has bitten test:press ("every card survived" of
   * no cards), test:cab ("nothing is covered" of a control that is not drawn) and test:board
   * ("no chip is under 44px" of a panel with no chips). Clear waves until there is a real
   * multi-blade wave to measure, and SAY how many blades were in it. */
  const g = B.create({ seed: 23 });
  function clearWave() {
    let guard = 0;
    const w = g.state.wave;
    while (g.state.wave === w && guard++ < 900 && !g.state.over) {
      const f = g.threat();
      if (!f || f.at - g.state.t > B.TELEGRAPH) { g.step(0.02); continue; }
      g.act('slash', f.arc + Math.PI / 2);
      g.act('slash', 0);
    }
  }
  while (g.state.foes.filter(f => !f.dead).length < 3 && g.state.wave < 8) clearWave();
  const live = g.state.foes.filter(f => !f.dead);
  ok(live.length >= 3, 'A20 a later wave really does send several blades',
    live.length + ' in wave ' + g.state.wave);
  const ats = live.map(f => f.at).sort((a, b) => a - b);
  const gaps = ats.slice(1).map((a, i) => a - ats[i]);
  /* ⛔ THE ASSERTION THAT BITES. With every `at` equal this is 0 — and one gesture answers one
   * line, so all but one of them is unanswerable BY CONSTRUCTION and the player is punished for
   * a correct read. That is exactly what the first draft of seedWave() shipped. */
  ok(gaps.length >= 2 && Math.min(...gaps) > B.STRIKE * 1.5,
    'A21 no two blades land close enough to be one unanswerable instant',
    gaps.length + ' pairs, closest ' + D(Math.min(...gaps)) + 's vs a ' + B.STRIKE + 's strike window');

  /* the difficulty is the gap and nothing else: it must tighten, and it must floor. */
  const walk = [];
  const g2 = B.create({ seed: 29 });
  for (let w = 1; w <= 20; w++) { g2.state.wave = w; walk.push(g2.waveGap()); }
  const monotone = walk.every((v, i) => i === 0 || v <= walk[i - 1] + 1e-9);
  ok(monotone, 'A22 the wave gap never widens', walk[0].toFixed(2) + ' → ' + walk[walk.length - 1].toFixed(2));
  ok(walk[walk.length - 1] > B.STRIKE * 1.5,
    'A23 …and it floors above the strike window, so late waves stay answerable',
    D(walk[walk.length - 1]) + 's');
}

// ── §A3  it is a duel, not a cutscene ─────────────────────────────────────────────────────────
head('§A3  doing nothing kills you; clearing a wave brings the next');
{
  const g = B.create({ seed: 31 });
  for (let i = 0; i < 2000 && !g.state.over; i++) g.step(0.05);
  ok(g.state.over === true && g.state.hp === 0,
    'A24 a player who never answers is cut down', 'after ' + D(g.state.t) + 's');

  const g2 = B.create({ seed: 37 });
  const w0 = g2.state.wave;
  let guard = 0;
  while (g2.state.wave === w0 && guard++ < 400) {
    const f = g2.threat();
    if (!f) { g2.step(0.02); continue; }
    if (f.at - g2.state.t > B.TELEGRAPH) { g2.step(0.02); continue; }
    g2.act('slash', f.arc + Math.PI / 2);
    g2.act('slash', 0);
  }
  ok(g2.state.wave > w0, 'A25 clearing a wave brings the next one', 'wave ' + g2.state.wave);
  ok(g2.state.score > 0 && g2.state.stat.kills > 0,
    'A26 answering scores; the board has something to rank',
    g2.state.score + ' pts, ' + g2.state.stat.kills + ' cut down');
}

// ══ §B  THE SEPARATION — measured, because "the angle matters" must be a number ════════════════
head('§B  two bots, identical but for where they aim');
{
  /* ⛔ THIS IS THE ONE MEASUREMENT THAT SAYS THE GAME EXISTS. Both bots answer every blade at the
   * same instant with the same verb; the ONLY difference is the angle they choose. If the two
   * numbers are close, direction does not matter and the design is a swipe game. */
  /* ⚠ POOLED ACROSS DUELS UNTIL THE SAMPLE IS BIG ENOUGH, NOT AVERAGED PER DUEL — and the first
   * version did the latter and reported the random bot at 51.4% against a true 66.7%. The reason
   * is the bot itself: a random swiper slides a third of the time, takes the hit and DIES, so each
   * duel contributed a handful of attempts and the mean of forty tiny noisy rates was nowhere near
   * the rate. ⚑ A measurement whose sample size depends on the thing being measured needs the
   * pooling done at the bottom, not the top. Verified against the rule in isolation
   * (`crosses(random, random)` over 400k draws = 66.5%), which is what said the harness was at
   * fault rather than the game. */
  const NEED = 6000;
  function measure(pick, seed0) {
    let turned = 0, slid = 0, duels = 0;
    for (let s = seed0; turned + slid < NEED && s < seed0 + 4000; s++) {
      const g = B.create({ seed: s });
      duels++;
      for (let i = 0; i < 80 && !g.state.over; i++) {
        const f = g.threat();
        if (!f) { g.step(0.05); continue; }
        const wait = f.at - g.state.t - B.TELEGRAPH * 0.4;
        if (wait > 0) g.step(wait);
        const r = g.act('slash', pick(f.arc, i, s));
        if (r.ok && r.deflected) turned++; else if (r.why === 'slid') slid++;
        g.act('slash', 0);                                   // finish it if it opened
      }
    }
    return { turned, slid, duels, rate: turned / Math.max(1, turned + slid) };
  }
  let x = 99991;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  const perp = measure(arc => arc + Math.PI / 2, 1);
  const para = measure(arc => arc, 4001);
  const rand = measure(() => rnd() * Math.PI, 8001);

  ok(perp.rate > 0.995, 'B1 a bot that always cuts perpendicular turns essentially every blade',
    (perp.rate * 100).toFixed(1) + '% of ' + (perp.turned + perp.slid));
  ok(para.rate < 0.005, 'B2 a bot that always cuts along the line turns essentially none',
    (para.rate * 100).toFixed(1) + '% of ' + (para.turned + para.slid));
  /* a uniform random line sits within 30° of theirs a third of the time, so the honest expectation
   * is 2/3 — stated as arithmetic so a drifting CROSS moves this number and is caught. */
  const want = 1 - (Math.asin(B.CROSS) / (Math.PI / 2));
  ok(Math.abs(rand.rate - want) < 0.03,
    'B3 a bot swiping at random lands exactly where the gate says it should',
    (rand.rate * 100).toFixed(1) + '% measured vs ' + (want * 100).toFixed(1) + '% predicted, n=' +
    (rand.turned + rand.slid));
  ok(perp.rate - rand.rate > 0.2, 'B4 the separation is wide enough to be learnable, not a coin flip',
    ((perp.rate - rand.rate) * 100).toFixed(1) + ' points');

  /* ⛔ AND THE CONSEQUENCE, WHICH IS THE CLAIM A PLAYER ACTUALLY EXPERIENCES. A rate is abstract;
   * "reading the angle keeps you alive longer" is the game. Same bots, same seeds, only the aim
   * differs — so any difference in survival is the angle rule and nothing else. */
  /* ⚠ ONE GESTURE PER BLADE, WHICH IS WHAT A HAND CAN DO — and the first version let both bots
   *   retry a slid blade every frame until it stuck, so BOTH survived to the loop's own ceiling
   *   and the measurement read 120s vs 120s. ⚑ A capped measurement that reports the cap as a
   *   result is worse than no measurement: it looks like a finding. `capped` is returned and
   *   asserted at zero, per this repo's no-silent-caps rule. */
  function survive(pick, seed0, n) {
    let total = 0, capped = 0;
    for (let s = seed0; s < seed0 + n; s++) {
      const g = B.create({ seed: s });
      const tried = new Set();
      let i = 0;
      for (; i < 6000 && !g.state.over; i++) {
        const f = g.threat();
        if (f && !tried.has(f.id) && f.at - g.state.t <= B.TELEGRAPH * 0.5) {
          tried.add(f.id);
          const r = g.act('slash', pick(f.arc));
          if (r.ok && r.deflected) g.act('slash', 0);       // only an ANSWERED blade can be struck
        }
        g.step(0.03);
      }
      if (i >= 6000) capped++;
      total += g.state.t;
    }
    return { t: total / n, capped };
  }
  let y = 7777;
  const rnd2 = () => ((y = (y * 1664525 + 1013904223) >>> 0) / 4294967296);
  const tPerp = survive(arc => arc + Math.PI / 2, 1, 120);
  const tRand = survive(() => rnd2() * Math.PI, 1, 120);
  /* ⚠ THE PERFECT READER IS SUPPOSED TO BE IMMORTAL, so its survival time is a CEILING and
   *   comparing means would be comparing a real number to the harness's own loop bound - which is
   *   what the first version did, reporting 120s vs 120s and calling it a null result. State the
   *   two halves as what they actually are: one never dies, the other dies fast. */
  ok(tPerp.capped === 120,
    'B5 a bot that reads every angle survives the whole window, every time',
    tPerp.capped + '/120 duels reached the ceiling at ' + D(tPerp.t) + 's');
  ok(tRand.capped === 0 && tRand.t < 30,
    'B6 …and one that swipes blind dies fast, on the same seeds and the same verbs',
    D(tRand.t) + 's mean, ' + tRand.capped + ' capped');
}

// ══ §E  THE STEEL — what a sword does that a pointer does not ══════════════════════════════════
head('§E  blade physics: lag, follow-through, weight, and a shutter that is a duration');
{
  const ST = (await import('node:fs')).readFileSync(join(ROOT, 'js/blade-steel.js'), 'utf8');
  globalThis.BladeSteel = undefined; (0, eval)(ST);
  const S = globalThis.BladeSteel;
  const dt = 1 / 120, deg = r => r * 180 / Math.PI;
  ok(!!S, 'E1 js/blade-steel.js loads');

  /* ⛔ NOTHING MOVES ON ITS OWN. Same assertion the wordmark rig and the hero card both carry, for
   * the same reason: a rig that idles is animating, and the acceptance for all three was "dead
   * still until you touch it". */
  {
    const q = S.create({ aim: 0 });
    let m = 0;
    for (let i = 0; i < 900; i++) { q.step(dt); m = Math.max(m, Math.abs(q.blade)); }
    ok(m === 0 && q.settled(), 'E2 at rest the blade is EXACTLY still', m.toExponential(1));
  }

  /* the four properties that separate steel from a cursor */
  const run = (target, n) => {
    const q = S.create({ aim: 0 }); q.point(target);
    let lag = 0, over = 0, crossed = false, arrive = null, still = null, lagT = 0, handT = 0, hv = 0;
    for (let i = 0; i < (n || 1400); i++) {
      q.step(dt); const st = q.state;
      if (Math.abs(st.lag) > lag) { lag = Math.abs(st.lag); lagT = st.t; }
      if (Math.abs(st.handVel) > hv) { hv = Math.abs(st.handVel); handT = st.t; }
      if (!crossed && Math.abs(S.delta(q.blade, target)) < 0.02) crossed = true;
      if (crossed) over = Math.max(over, S.delta(q.hand, q.blade));
      if (!arrive && Math.abs(S.delta(q.blade, target)) < 0.0873) arrive = st.t;
      if (!still && Math.abs(st.vel) < 0.02 && Math.abs(q.lag) < 0.005) still = st.t;
    }
    return { lag: deg(lag), over: deg(over), arrive, still, lagT, handT };
  };
  const r90 = run(Math.PI / 2);
  ok(r90.lag > 8 && r90.lag < 26,
    'E3 the tip LAGS the wrist — visible weight, and never enough to disagree with what was scored',
    D(r90.lag) + ' deg');
  /* ⛔ THE HONESTY ASSERTION. The RULE scores the line the FINGER drew; the player watches the
   * BLADE. If they stay apart, the game scores one thing and shows another — the first build sat
   * at 56 degrees of lag and did exactly that. */
  ok(r90.arrive != null && r90.arrive < 0.20,
    'E4 …and the blade agrees with the drawn line fast enough that the picture cannot lie',
    D(r90.arrive) + 's to within 5 deg');
  ok(r90.lagT > r90.handT,
    'E5 the lag peaks AFTER the wrist does — it trails, it does not lead',
    'lag ' + D(r90.lagT) + 's vs wrist ' + D(r90.handT) + 's');
  ok(r90.over > 2,
    'E6 it OVERSHOOTS and rings back — follow-through, the thing that dies if you over-damp it',
    D(r90.over) + ' deg');
  ok(r90.still != null && r90.still < 0.8, 'E7 …and it settles rather than ringing forever',
    D(r90.still) + 's');
  /* ⛔ WEIGHT IS A FUNCTION OF SPEED, AND THE WRIST HAS A TOP SPEED — so the lag GROWS with demand
   * and then PLATEAUS. The first version of this assertion required it to keep growing (small <
   * 90deg < 166deg) and failed at 18.665 = 18.665, which was the test being wrong about the model
   * rather than the model being wrong: past HAND_RATE the wrist is saturated and asking for more
   * cannot move it faster. ⚑ The plateau is the speed limit made observable, so it is asserted
   * rather than tuned away — without it, a flick of the thumb would fling the sword arbitrarily
   * fast and the weight would be a lie at exactly the moment it matters. */
  const small = run(0.17), big = run(2.9);
  ok(small.lag < r90.lag * 0.5,
    'E8 a small ask lags far less than a big one — that is what makes it feel heavy',
    D(small.lag) + ' vs ' + D(r90.lag) + ' deg');
  ok(Math.abs(big.lag - r90.lag) < 0.5,
    'E8b …and past the wrist\'s top speed the lag PLATEAUS, because a wrist cannot go faster',
    D(r90.lag) + ' deg at 90 deg of demand, ' + D(big.lag) + ' at 166 deg');

  /* ⛔ THE SHUTTER IS A DURATION, NOT A SAMPLE COUNT, and the first version measured 33.5 deg at
   * 240 fps, 27.1 at 120, 19.4 at 60 and **0.0 at 30** — the smear vanished entirely on the
   * machines that need it most, because ageing every sample before pruning empties the buffer to
   * one entry whenever dt > TRAIL_S/2. One point is not a path. */
  const arcAt = d => {
    const q = S.create({ aim: 0 }); q.swing(1, 1);
    let best = 0;
    for (let i = 0; i < Math.ceil(0.6 / d); i++) {
      q.step(d);
      const a = q.path(0), b = q.path(1);
      if (a && b) best = Math.max(best, Math.abs(S.delta(a.ang, b.ang)));
    }
    return deg(best);
  };
  const arcs = [1 / 240, 1 / 120, 1 / 60, 1 / 30].map(arcAt);
  ok(arcs.every(a => a > 12),
    'E9 the smear exists at EVERY frame rate — 30 fps included',
    arcs.map(a => D(a)).join(' / ') + ' deg at 240/120/60/30 fps');
  ok(Math.max(...arcs) / Math.min(...arcs) < 1.8,
    'E10 …and it is the same picture, within a bounded factor, on every device',
    'spread ' + D(Math.max(...arcs) / Math.min(...arcs)) + 'x');

  /* a cut is an IMPULSE, so a second cut inherits the first one's momentum */
  {
    const q = S.create({ aim: 0 });
    q.swing(1, 1); for (let i = 0; i < 4; i++) q.step(dt);
    const v1 = Math.abs(q.state.vel);
    q.swing(1, 1); q.step(dt);
    ok(Math.abs(q.state.vel) > v1,
      'E11 a cut is a torque, not a keyframe — a second one compounds instead of restarting',
      D(v1) + ' -> ' + D(Math.abs(q.state.vel)) + ' rad/s');
  }
  /* the seam. A raw b-a whips the sword the long way round on an ordinary horizontal cut. */
  ok(Math.abs(S.delta(3.10, -3.10)) < 0.09,
    'E12 the shortest way round is taken across the +/-pi seam, so a cut never whips a full circle',
    D(S.delta(3.10, -3.10)) + ' rad');
}

// ══ §C  THE GEOMETRY CONTRACT — read off the shipped GLB ═══════════════════════════════════════
head('§C  models/blade.glb, read directly (no Blender needed)');
{
  let json = null, err = null;
  try {
    const b = await readFile(join(ROOT, 'models/blade.glb'));
    let off = 12;
    while (off < b.length) {
      const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
      if (type === 0x4E4F534A) json = JSON.parse(b.slice(off + 8, off + 8 + len).toString('utf8'));
      off += 8 + len;
    }
  } catch (e) { err = String(e); }
  ok(!!json, 'C1 the GLB parses', err || (json && json.meshes.length + ' meshes'));
  if (json) {
    const names = new Set(json.nodes.map(n => n.name));
    const want = ['blade_light', 'blade_dark', 'hilt', 'foe', 'ground'];
    const missing = want.filter(n => !names.has(n));
    ok(missing.length === 0, 'C2 every part js/blade-view.js looks up by name is present',
      missing.length ? 'missing ' + missing.join(', ') : want.join(' · '));
    const boundOf = nm => {
      const node = json.nodes.find(n => n.name === nm);
      if (!node || node.mesh == null) return null;
      const a = json.accessors[json.meshes[node.mesh].primitives[0].attributes.POSITION];
      return { min: a.min, max: a.max };
    };
    /* ⛔ THE PIVOT. Every arc is drawn by rotating the blade NODE, so an origin at the blade's
     * middle swings it like a propeller — and it only appears IN MOTION, which is why no name
     * check and no still frame can see it. */
    for (const nm of ['blade_light', 'blade_dark']) {
      const bd = boundOf(nm);
      if (!bd) { ok(false, 'C3 ' + nm + ' has geometry'); continue; }
      const len = bd.max[1] - bd.min[1];
      ok(Math.abs(bd.min[1]) <= len * 0.02,
        `C3 ${nm} pivots at the grip, not at its middle`, 'base y = ' + D(bd.min[1]));
      ok(Math.abs(len - 1) <= 0.08,
        `C4 ${nm} is 1.0 long, so the reach numbers are world units`, D(len) + '');
      /* the length must be the axis the view rotates about, i.e. y — not x or z */
      const w = bd.max[0] - bd.min[0], t = bd.max[2] - bd.min[2];
      ok(len > w * 4 && len > t * 4, `C5 ${nm}'s long axis is +y, which is what rollFor assumes`,
        `w ${D(w)} · t ${D(t)} · len ${D(len)}`);
    }
    const bl = boundOf('blade_light'), bd2 = boundOf('blade_dark');
    if (bl && bd2) ok(Math.abs((bl.max[1] - bl.min[1]) - (bd2.max[1] - bd2.min[1])) < 1e-3,
      'C6 both blades are the same length — a duel where one is longer is unreadable');
    const foe = boundOf('foe');
    if (foe) ok(foe.max[1] > 1.0 && foe.max[1] < 2.4 && foe.min[1] > -0.05,
      'C7 the foe stands ON the floor and is human-sized', 'height ' + D(foe.max[1]));
  }
}

// ══ §D  THE GLASS — the real page, driven ══════════════════════════════════════════════════════
const srv = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const b = await readFile(join(ROOT, p.endsWith('/') ? p + 'index.html' : p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));
const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

head('§D  blade.html on a phone');
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('urm_admin_ok', '1'); } catch (e) {}
    window.__posts = [];
    Object.defineProperty(window, 'RipBoard', {
      configurable: true,
      set(v) {
        const o = v.post ? v.post.bind(v) : null;
        v.post = (g, s) => { window.__posts.push([g, s]); return o ? o(g, s) : null; };
        Object.defineProperty(window, 'RipBoard', { value: v, writable: true, configurable: true });
      },
      get() { return undefined; },
    });
  });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const f404 = []; pg.on('response', r => { if (r.status() === 404) f404.push(r.url().split(PORT)[1]); });
  await pg.goto(`http://127.0.0.1:${PORT}/blade.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForTimeout(900);

  const lobby = await pg.evaluate(() => {
    try {
      const l = document.getElementById('lobby'), n = document.getElementById('nogl');
      return { lobby: !!l && !l.hidden, nogl: !!n && !n.hidden,
        rules: (document.body.innerText || '').toLowerCase() };
    } catch (e) { return { err: String(e) }; }
  });
  ok(!lobby.err && lobby.lobby && !lobby.nogl, 'D1 the lobby comes up (WebGL 2 available)',
    JSON.stringify({ lobby: lobby.lobby, nogl: lobby.nogl }));
  /* ⚠ THE ONE RULE HAS TO BE ON THE LOBBY. Everything else is discoverable by pressing the glass;
   * "cut across, not along" is not, and a player who never learns it experiences a correct swipe
   * being punished — which reads as a broken game rather than a rule they missed. */
  ok((lobby.rules || '').includes('across'),
    'D2 the lobby states the angle rule before you play');

  await pg.click('#go');
  await pg.waitForTimeout(700);
  const started = await pg.evaluate(() => {
    try {
      const b = window.__blade; if (!b) return { err: 'no __blade' };
      const v = b.view(), g = b.game();
      const c = document.getElementById('gl');
      return { art: v.art, hp: g.state.hp, foes: g.state.foes.length,
        w: c.width, h: c.height, hudOn: !document.getElementById('hud').hidden };
    } catch (e) { return { err: String(e) }; }
  });
  ok(!started.err && started.hudOn && started.foes > 0,
    'D3 BEGIN starts a duel', JSON.stringify(started));
  ok(started.art === 'authored',
    'D4 the AUTHORED geometry loaded — not the fallback primitives', String(started.art));
  ok(started.w > 300 && started.h > 600, 'D5 the canvas is sized to the phone',
    started.w + '×' + started.h);

  /* ── D6 THE SCREEN-ANGLE CONVENTION. 90° out renders perfectly and makes every correct answer
   * look wrong; there is no visual tell, so it is asserted as arithmetic. Take the blade's own
   * world direction and project it onto the camera's right/up axes — i.e. measure what a player
   * actually sees, rather than re-deriving the formula the code already used. */
  const conv = await pg.evaluate(() => {
    try {
      const v = window.__blade.view();
      const out = [];
      for (const deg of [0, 45, 90, 135]) {
        const a = deg * Math.PI / 180;
        v.aim = a;
        /* ⚠ LET THE STEEL ARRIVE FIRST. This used to set the aim and read the blade one
         * millisecond later, which was correct while the blade WAS the cursor. It is a spring now
         * — measured at 0.117 s to come within 5 degrees of the drawn line — so reading it
         * immediately measures where the sword was a moment ago and reports the convention as
         * broken. The convention assertion is unchanged and still the one that matters; only the
         * moment it is read moved. */
        for (let i = 0; i < 60; i++) v.step(1 / 120);
        const hand = v.hand;
        const dir = hand.getWorldTransform().transformVector(new pc.Vec3(0, 1, 0));
        const R = v.cam.right, U = v.cam.up;
        const sx = dir.dot(R), sy = dir.dot(U);
        // back to a screen angle with y DOWN, folded to a line in [0,180)
        let got = Math.atan2(-sy, sx) * 180 / Math.PI;
        got = ((got % 180) + 180) % 180;
        out.push([deg, Math.round(got * 10) / 10]);
      }
      return { out };
    } catch (e) { return { err: String(e) }; }
  });
  const conOk = !conv.err && conv.out.every(([want, got]) =>
    Math.min(Math.abs(got - want), 180 - Math.abs(got - want)) < 1.5);
  ok(conOk, 'D6 the blade draws along the line the finger drew, at every angle',
    conv.err || conv.out.map(([w, g]) => w + '°→' + g + '°').join(' · '));

  /* ── D7-D9 REAL GESTURES ON THE GLASS. The recogniser is pure and already proved in §A; what is
   * unproven until here is that the PAGE feeds it real numbers — that a drag reaches it as a
   * drag, and that a double-tap survives the browser. ⚠ Taps are dispatched WITHOUT awaiting each
   * command: RIP ROCKETER measured that awaiting puts 174 ms of press and 427 ms between taps,
   * which cannot produce a 300 ms double-tap at all, so the driver was measuring itself. */
  /* ⛔ ASSERTED OFF THE GLASS'S OWN LOG, NOT OFF `stat`, AND THE DIFFERENCE COST A ROUND.
   * `stat.steps` counts SUCCESSFUL steps - so a step that arrived and was correctly REFUSED (the
   * three preceding parries had burned the guard, exactly as designed) is indistinguishable from a
   * gesture that never reached the page at all. The first version read that as a dead input path
   * and I nearly went looking for a bug in the pointer handler. ⚑ `__blade.log` records what the
   * glass CLASSIFIED; what the rules then did with it is a separate question and §A owns it. */
  const g1 = await pg.evaluate(async () => {
    try {
      const el = document.getElementById('glass');
      const L = window.__blade.log;
      const n0 = L.length;
      const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type,
        { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
          clientX: x, clientY: y }));
      const wait = ms => new Promise(r => setTimeout(r, ms));
      // a drag, well clear of any previous tap → SLASH
      await wait(420);
      fire('pointerdown', 120, 600); fire('pointermove', 240, 460); fire('pointerup', 240, 460);
      // two quick taps → PARRY (the second one classifies)
      await wait(420);
      fire('pointerdown', 200, 500); fire('pointerup', 200, 500);
      fire('pointerdown', 202, 502); fire('pointerup', 202, 502);
      // tap then drag → STEP
      await wait(420);
      fire('pointerdown', 200, 500); fire('pointerup', 200, 500);
      fire('pointerdown', 200, 500); fire('pointermove', 90, 470); fire('pointerup', 90, 470);
      return { verbs: L.slice(n0).map(x => x.kind) };
    } catch (e) { return { err: String(e) }; }
  });
  const verbs = (g1 && g1.verbs) || [];
  ok(!g1.err && verbs[0] === 'slash', 'D7 a drag on the glass reaches the rules as a SLASH',
    JSON.stringify(g1.err || verbs));
  ok(!g1.err && verbs.includes('parry'), 'D8 a double-tap reaches them as a PARRY',
    JSON.stringify(g1.err || verbs));
  ok(!g1.err && verbs.includes('step'), 'D9 a double-tap-then-drag reaches them as a STEP',
    JSON.stringify(g1.err || verbs));

  /* D10 — the blade tracks the finger DURING the drag, before you let go. Without it the angle
   * rule is a blind guess and therefore unfair; it is what makes "the finger is the sword" true. */
  const track = await pg.evaluate(async () => {
    try {
      const el = document.getElementById('glass'), v = window.__blade.view();
      const fire = (t, x, y) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true,
        pointerId: 2, pointerType: 'touch', clientX: x, clientY: y }));
      fire('pointerdown', 200, 600);
      fire('pointermove', 200, 400);          // straight up the screen
      const up = v.aim;
      fire('pointermove', 360, 600);          // straight to the right
      const right = v.aim;
      fire('pointerup', 360, 600);
      const fold = a => { let d = ((a * 180 / Math.PI) % 180 + 180) % 180; return Math.round(d * 10) / 10; };
      return { up: fold(up), right: fold(right) };
    } catch (e) { return { err: String(e) }; }
  });
  ok(!track.err && Math.abs(track.up - 90) < 2 && track.right < 2,
    'D10 the blade follows the finger mid-drag, so you can lay your line over theirs first',
    JSON.stringify(track));

  /* D11 — the glass must not be pierced by anything that wants a tap for itself. The WHOLE screen
   * is the control; a stray element taking a press in the middle of it is a dead spot with no
   * visible cause. Sampled on a grid, the way `#soundBar` and `#modes` were caught. */
  const hits = await pg.evaluate(() => {
    try {
      /* the audio cog is a REAL control and is allowed to take its own 44px; everything else on
       * this screen must fall through to the glass. ⚠ Naming it rather than exempting "whatever
       * happens to be there" is the point — an unnamed exemption is how `#soundBar` swallowed
       * presses across a 157px pill for a 44px button. */
      const DECLARED = new Set(['tgCog', 'toggles', 'tgPanel']);
      const bad = {}, declared = {};
      let n = 0;
      for (let i = 1; i < 12; i++) for (let j = 1; j < 22; j++) {
        const x = innerWidth * i / 12, y = innerHeight * j / 22;
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        n++;
        if (el.id === 'glass') continue;
        const key = el.id || el.className || el.tagName;
        const owner = el.closest('#toggles') || DECLARED.has(el.id) ? 'toggles' : null;
        if (owner) declared[key] = (declared[key] || 0) + 1;
        else bad[key] = (bad[key] || 0) + 1;
      }
      return { n, bad, declared };
    } catch (e) { return { err: String(e) }; }
  });
  ok(!hits.err && Object.keys(hits.bad || {}).length === 0,
    'D11 every point of the screen is the sword — nothing undeclared steals a press',
    hits.err || (JSON.stringify(hits.bad) + ' of ' + hits.n + ' points'));
  /* ⛔ AND THE DECLARED CONTROL MUST STAY THE SIZE OF THE CONTROL. `#soundBar` was a 157px layout
   * box taking presses across its padding, gaps and rounded corners for three 44px buttons; the
   * rule that came out of it is that a hit surface is the size of the thing you can click. */
  const stolen = Object.values(hits.declared || {}).reduce((a, b) => a + b, 0);
  ok(!hits.err && stolen <= 2, 'D11b …and the audio cog takes only its own corner, not a band',
    stolen + ' of ' + hits.n + ' points: ' + JSON.stringify(hits.declared));

  /* D12 — layout floors, on both axes. A thumb is round. */
  const lay = await pg.evaluate(() => {
    try {
      const de = document.documentElement, small = [];
      for (const el of document.querySelectorAll('button,a.btn')) {
        const s = getComputedStyle(el);
        if (s.display === 'none' || !el.offsetParent) continue;
        const b = el.getBoundingClientRect();
        if (b.width < 4 || b.height < 4) continue;
        if (b.width < 44 || b.height < 44) small.push((el.id || el.className) + ' ' +
          Math.round(b.width) + '×' + Math.round(b.height));
      }
      return { sw: de.scrollWidth, cw: de.clientWidth, small };
    } catch (e) { return { err: String(e) }; }
  });
  ok(!lay.err && lay.sw <= lay.cw, 'D12 no horizontal overflow', lay.sw + ' vs ' + lay.cw);
  ok(!lay.err && lay.small.length === 0, 'D13 every control clears 44px on BOTH axes',
    (lay.small || []).join(' · ') || 'none');

  /* D14-D15 — built ≠ reachable, pointed at the SCOREBOARD. test:board's whole subject: a panel
   * that mounts with nothing on the other end of it is indistinguishable from a game nobody has
   * played. Drive the duel to its actual end and watch for the post. */
  const over = await pg.evaluate(async () => {
    try {
      const b = window.__blade, g = b.game(), v = b.view();
      // answer enough blades to put a real score up, then stop defending and die
      for (let i = 0; i < 40 && !g.state.over; i++) {
        const f = g.threat();
        if (f && f.at - g.state.t <= 0.4) { v.act('slash', f.arc + Math.PI / 2); v.act('slash', 0); }
        v.step(0.05);
      }
      const scored = g.state.score;
      for (let i = 0; i < 4000 && !g.state.over; i++) v.step(0.05);
      await new Promise(r => setTimeout(r, 120));
      return { scored, over: g.state.over, posts: window.__posts.slice(),
        shown: !document.getElementById('over').hidden };
    } catch (e) { return { err: String(e) }; }
  });
  ok(!over.err && over.scored > 0, 'D14 a driven player actually scores',
    over.err || over.scored + ' pts');
  ok(!over.err && over.shown, 'D15 death raises the result screen', JSON.stringify(over.over));
  ok(!over.err && (over.posts || []).some(p => p[0] === 'blade' && p[1] > 0),
    'D16 …and it POSTS to the board, so the panel has something behind it',
    JSON.stringify(over.posts));

  ok(errs.length === 0, 'D17 no JS errors on the page', errs.join(' · ') || 'none');
  /* ⚠ /api/ is EXCLUDED because this harness is a static file server — there is no KV and no
   * function runtime, so `js/leaderboard.js` fetching the board is expected to 404 and the module
   * is built to fall back when it does. `npm run test:board` is where the API is driven for real.
   * ⚑ It is NOT excluded blindly: D19 asserts the board asked for THIS game, which is how the
   * page defaulting to RIP ROCKETER's board was caught. */
  /* ⚠ READS only — the bare `/api/scores` with no query is the POST, which carries its game in the
   * body. This asks the narrower question it can actually answer from a URL. */
  const boardAsk = f404.filter(u => /\/api\/scores\?/.test(u || ''));
  ok(boardAsk.length > 0 && boardAsk.every(u => /game=blade/.test(u)),
    'D19 the board on this page asks for THIS game, not whichever one is first in the list',
    boardAsk.join(' · ') || 'no board fetch');
  const real404 = f404.filter(u => u && !/favicon|sfx|\.mp3|\/api\//.test(u));
  ok(real404.length === 0, 'D18 nothing 404s', real404.join(' · ') || 'none');
  await ctx.close();
}

await br.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

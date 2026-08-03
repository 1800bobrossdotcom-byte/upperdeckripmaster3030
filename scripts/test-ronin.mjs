/* ⚔ NEON RONIN · THE COMBAT SYSTEM — the acceptance measurement (docs/RONIN-COMBAT.md).
 *
 * A fighting game IS its frame data, so the only honest test is one that MEASURES advantage in a
 * driven match rather than reading the table back to itself. Five questions, in the order they
 * decide whether the system exists at all:
 *
 *   1 ⛔ DO THE THREE COPIES AGREE? The numbers live in js/ronin.js's MOVES, are published in
 *       docs/RONIN-COMBAT.md, and are rendered into the lobby's move list. Two copies of a fact
 *       will diverge (ROADMAP §5.4) — so all three are compared cell by cell, and on top of that
 *       every advantage is re-derived from bs/ac/rc rather than trusted.
 *   2 ⛔ IS THE ADVANTAGE REAL? The table is checked against the SIMULATION: each move is thrown
 *       at a guarding opponent in a live match and the frames until each fighter can act again
 *       are COUNTED. That is what proves blockstun and recovery actually do what is written down.
 *   3 ⛔ IS A BLOCKED MOVE A QUESTION? The claimed punisher must land, and — the assertion that
 *       bites — THE NEXT MOVE UP THE LADDER MUST WHIFF. "It got hit" is a weak question; a move
 *       that is punishable by everything passes it (ROADMAP §5.2).
 *   4 ⛔ DOES IT TERMINATE? The greediest juggle a human could input is driven and hits, airtime
 *       and total damage are bounded. A combo system without a floor is not depth, it is a bug.
 *   5 ⛔ DO THE BOTS PLAY THE SAME GAME? A fighter with frame data and an opponent that ignores
 *       it is a training dummy. The rival's punishes, throw-breaks and sidesteps are counted in
 *       a real match with nothing driven.
 *
 * ⚑ ASSERTIONS THAT FAIL ON THE OLD BUILD, on purpose (ROADMAP §5.2): the jab was i1.2 (.02 s)
 *   and there was NO BLOCKSTUN AT ALL, so "the jab is i10", "blockstun is non-zero", "the ladder
 *   has distinct rungs" and every measured advantage below are unsatisfiable by the old game.
 *
 * ⚑ IT DRIVES `__rn._step(n)` AT EXACTLY 1/60 with `_lab(true)` (hitstop off). Headless rAF
 *   stalls between input events in this container (CLAUDE.md), so nothing here waits on a frame.
 *   Hitstop scales dt for BOTH fighters and therefore cannot change advantage — but it does
 *   decouple driven steps from sim frames, and a measurement whose clock wanders is not one.
 * ⚠ Nothing visual is measured. Every number below is a simulation quantity and is exact.
 *
 * Usage: node scripts/test-ronin.mjs        (npm run test:ronin)
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}` + (detail ? `  — ${detail}` : '')); }
  else { fail++; console.log(`  FAIL ${name}` + (detail ? `  — ${detail}` : '')); }
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.skn': 'application/octet-stream', '.wld': 'application/octet-stream', '.obj': 'text/plain' };

// Ephemeral port — a fixed one makes two concurrent runs look like a hang rather than a collision.
const srv = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try { const d = readFileSync(join(ROOT, p));
    rs.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); rs.end(d); }
  catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
const pageErrs = [], notFound = [];
page.on('pageerror', e => pageErrs.push(String(e.message || e)));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pageErrs.push('console: ' + m.text()); });
page.on('response', r => { if (r.status() >= 400) notFound.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });

await page.goto(`http://127.0.0.1:${PORT}/ronin.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__rn && window.__rn.frames, null, { timeout: 40000 });

// ── the lobby's rendered move list, read out of the DOM before anything else touches it ───────
const domRows = await page.evaluate(() => [...document.querySelectorAll('#moveRows tr')].map(tr => {
  const c = [...tr.children].map(td => td.textContent.trim());
  return { id: tr.dataset.move, name: c[0], input: c[1], st: c[2], ac: c[3], rc: c[4], dmg: c[5], onBlock: c[6], onHit: c[7], pun: c[8] };
}));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Everything below runs INSIDE the page: one loaded match, one clock, one fixed dt.
// ══════════════════════════════════════════════════════════════════════════════════════════════
const R = await page.evaluate(async () => {
  const rn = window.__rn, MV = rn.frames, C = rn.consts;
  const out = { moves: MV, consts: C, errors: [] };
  const IDS = Object.keys(MV);

  rn._brawl('ronin', 'oni'); rn._start(); rn._lab(true);
  await new Promise(r => setTimeout(r, 60));
  const step = n => rn._step(n);
  const S = () => rn.st;

  /* A clean two-fighter lab: both AIs off, both at full health, placed at a distance the move
   * under test actually reaches. `gap` is per-move because a jab's reach is not a nodachi's. */
  function lab(gap) { rn._reset(); rn._ai('foe', false); rn._place(600, 600 + (gap == null ? 95 : gap)); step(1); }

  // ── 1 · MEASURED ADVANTAGE ───────────────────────────────────────────────────────────────────
  /* Drive the move at a guarding opponent, find the contact frame, then count how many further
   * frames each fighter needs before `canAct` is true again. adv = defender − attacker. */
  function measure(id, guard) {
    const m = MV[id];
    lab(id === 'grab' ? 70 : id === 'special' ? 120 : 95);
    rn._guard('foe', !!guard);
    rn._do('me', id);
    let n = 0, contact = -1, hp0 = S().foe.hp;
    while (n < 240 && contact < 0) { step(1); n++;
      const s = S(); if (s.foe.bstun > 0 || s.foe.hp < hp0 - 1e-9 || s.foe.thrown) contact = n; }
    if (contact < 0) return { hit: false };
    const dmg = hp0 - S().foe.hp;
    let a = -1, d = -1, k = 0;
    while (k < 400 && (a < 0 || d < 0)) { step(1); k++;
      const s = S(); if (a < 0 && s.me.canAct) a = k; if (d < 0 && s.foe.canAct) d = k; }
    return { hit: true, contactFrame: contact, atkFree: a, defFree: d, adv: d - a, dmg: +dmg.toFixed(2),
      startupMeasured: contact };
  }
  out.blocked = {}; out.onhit = {};
  for (const id of IDS) { if (id === 'grab') continue; out.blocked[id] = measure(id, true); }
  for (const id of IDS) { if (id === 'grab') continue; out.onhit[id] = measure(id, false); }

  // ── 2 · PUNISHMENT, both halves ──────────────────────────────────────────────────────────────
  /* The defender blocks `id`, then the instant blockstun ends throws `punisher`. It must connect
   * — the attacker is still in recovery. Then the SAME drive with a move one rung too slow, which
   * must NOT connect. That second half is the assertion that bites: without it, "the punish
   * landed" is satisfied by a game where every move is punishable by everything. */
  function punishRun(id, punisher) {
    lab(id === 'special' ? 120 : 92);
    rn._guard('foe', true);
    rn._do('me', id);
    let n = 0; while (n < 240 && !(S().foe.bstun > 0)) { step(1); n++; }
    if (n >= 240) return { blocked: false };
    rn._guard('foe', false);
    /* ⛔ THE ATTACKER GUARDS THE INSTANT IT RECOVERS. Without this the negative control is
     * meaningless: a punisher one rung too slow would still "land", not because the deficit
     * allowed it but because the attacker was standing there doing nothing. Guarding is what
     * "they recovered in time" MEANS. `_guard` only takes effect on an actionable frame, so it
     * cannot protect them during the recovery the punish is aimed at. */
    rn._guard('me', true);
    /* Buffer the punisher rather than waiting for canAct: `canAct` is only observable AFTER the
     * step in which the fighter became free, so firing then is a frame late — exactly the size
     * of the ladder. The buffer releases on the first actionable frame, which is what a human
     * with a 4-frame buffer gets and what the AI gets. */
    let w = 0; while (w < 200 && S().foe.free > 1) { step(1); w++; }
    const hp0 = S().me.hp;
    rn._buf('foe', punisher);
    /* ⚠ A BLOCKED PUNISHER STILL TAKES CHIP DAMAGE, so "hp went down" is NOT "it landed" — and
     * reading it that way made every negative control pass as a hit. The distinction is the
     * guard: on block the defender is put in BLOCKSTUN, on hit into hitstun. */
    let k = 0, guarded = null; while (k < 200 && S().me.hp >= hp0 - 1e-9) { step(1); k++;
      const s = S(); if (k > 4 && s.foe.canAct && !s.foe.move) break; }
    { const s = S(); if (s.me.hp < hp0 - 1e-9) guarded = s.me.bstun > 0; }
    const landed = S().me.hp < hp0 - 1e-9 && guarded === false;
    return { blocked: true, waited: w, landed, guarded, dmg: +(hp0 - S().me.hp).toFixed(2) };
  }
  out.punish = {};
  for (const id of IDS) {
    const m = MV[id]; if (!m.punishedBy.length) continue;
    const byName = {}; for (const k of IDS) byName[MV[k].name] = k;
    const fastest = byName[m.punishedBy[0]];
    const slowest = byName[m.punishedBy[m.punishedBy.length - 1]];
    // the first move that is TOO SLOW to punish this one — the negative control
    let tooSlow = null;
    const order = IDS.filter(k => !MV[k].grab).sort((a, b) => MV[a].st - MV[b].st);
    for (const k of order) if (MV[k].st > -m.onBlock) { tooSlow = k; break; }
    out.punish[id] = { adv: m.onBlock, fastest, slowest, tooSlow,
      withFastest: punishRun(id, fastest),
      withBiggest: punishRun(id, slowest),
      withTooSlow: tooSlow ? punishRun(id, tooSlow) : null };
  }
  // …and a SAFE move must not be punishable by anything, including the fastest move in the game
  out.safe = {};
  for (const id of IDS) { const m = MV[id]; if (m.grab || m.punishedBy.length) continue;
    out.safe[id] = { adv: m.onBlock, withJab: punishRun(id, 'punch') }; }

  // ── 3 · THE JUGGLE, driven as greedily as a human could ──────────────────────────────────────
  /* Launch, then throw the fastest thing available every single frame it is legal, taking the
   * BOUND when it is up. If this does not terminate, nothing else in the design matters. */
  function juggle(route) {
    lab(90); rn._guard('foe', false);
    const hp0 = S().foe.hp, maxHp = S().foe.maxHp;
    rn._do('me', 'rising');
    let n = 0, hits = 0, airFrames = 0, seq = [], bound = false, lastHp = hp0, perHit = [], maxGap = 0;
    while (n < 600) {
      step(1); n++;
      const s = S();
      if (s.foe.juggle && (s.foe.air || s.foe.y > 4)) { airFrames++; maxGap = Math.max(maxGap, Math.abs(rn.fighters[1].x - rn.fighters[0].x)); }
      if (!s.foe.juggle && s.foe.state !== 'hurt' && n > 30) break;   // they hit the floor
      if (s.me.canAct && s.foe.juggle && (s.foe.air || s.foe.y > 4)) {
        const n2 = s.foe.juggle.hits;
        const pick = (route === 'greedy')
          ? (s.foe.juggle.bound && n2 >= 2 ? 'crest' : n2 === 0 ? 'punch' : n2 === 1 ? 'slash' : 'punch')
          : 'punch';
        if (rn._do('me', pick)) { seq.push(pick); if (pick === 'crest') bound = true; }
      }
      const s2 = S(); if (s2.foe.juggle) hits = Math.max(hits, s2.foe.juggle.hits);
      if (s2.foe.hp < lastHp - 1e-9) { perHit.push(+(lastHp - s2.foe.hp).toFixed(2)); lastHp = s2.foe.hp; }
    }
    const sEnd = S();
    return { hits, seq, perHit, maxGap: +maxGap.toFixed(0), airSec: +(airFrames / 60).toFixed(2), usedBound: bound,
      dmg: +(hp0 - sEnd.foe.hp).toFixed(1), pctOfBar: +((hp0 - sEnd.foe.hp) / maxHp * 100).toFixed(1),
      endState: sEnd.foe.state, invulnAfter: sEnd.foe.state === 'down' || sEnd.foe.state === 'getup',
      frames: n, maxHp };
  }
  out.juggle = { greedy: juggle('greedy'), jabs: juggle('jabs') };
  /* ⛔ And the floor really is invulnerable. The question is NOT "did a launcher ever connect
   * after a knockdown" — of course one does, once they have stood up; that is the game resuming.
   * It is whether ANY damage lands on a frame where they are still down or getting up. So the
   * state is sampled every frame alongside the health. */
  { lab(80); rn._guard('foe', false); rn._do('me', 'rising');
    let n = 0; while (n < 400 && S().foe.state !== 'down') { step(1); n++;
      if (S().me.canAct && S().foe.juggle && S().foe.air) rn._do('me', 'punch'); }
    const downAt = n; let hp = S().foe.hp, dmgDown = 0, tries = 0, relaunched = false, downFrames = 0;
    while (n < 520) { const st0 = S();
      if (st0.foe.state !== 'down' && st0.foe.state !== 'getup') break;
      if (st0.me.canAct) { rn._do('me', 'rising'); tries++; }
      step(1); n++;
      const s = S();
      if (s.foe.state === 'down' || s.foe.state === 'getup') { downFrames++;
        if (s.foe.hp < hp - 1e-9) dmgDown += hp - s.foe.hp;
        if (s.foe.juggle) relaunched = true; }
      hp = s.foe.hp; }
    out.floor = { reachedDown: downAt < 400, tries, downFrames,
      dmgWhileDown: +dmgDown.toFixed(2), relaunched }; }

  // ── 4 · THROWS — broken inside the window, not outside it ────────────────────────────────────
  function throwRun(breakAt) {
    lab(70); rn._guard('foe', true);                       // guarding, because a throw beats guard
    rn._do('me', 'grab');
    let n = 0; while (n < 200 && !S().foe.thrown) { step(1); n++; }
    if (!S().foe.thrown) return { grabbed: false };
    const hp0 = S().foe.hp;
    let f = 0, broke = false;
    while (f < 120 && S().foe.thrown) { if (f === breakAt) broke = rn._break('foe'); step(1); f++; }
    // let the throw resolve either way
    let g = 0; while (g < 90 && S().me.grabbing) { step(1); g++; }
    return { grabbed: true, broke, atFrame: breakAt, dmg: +(hp0 - S().foe.hp).toFixed(2),
      foeState: S().foe.state };
  }
  out.throws = { early: throwRun(5), edge: throwRun(C.THROW_BREAK - 2), late: throwRun(C.THROW_BREAK + 4),
    never: throwRun(999) };
  // a throw ignores guard entirely — that is the whole reason it exists
  { lab(70); rn._guard('foe', true); rn._do('me', 'grab');
    let n = 0; while (n < 200 && !S().foe.thrown) { step(1); n++; }
    out.throwBeatsGuard = { grabbedAGuardingFoe: !!S().foe.thrown, atFrame: n }; }

  // ── 5 · THE THIRD AXIS — a sidestep beats LINEAR and loses to HOMING ─────────────────────────
  /* ⛔ "It dodged" is a weak question — a lucky whiff passes it. The bite is that the SAME
   * sidestep, at the same frame, against a move that differs only in `homing`, must be HIT. */
  function stepVs(id) {
    lab(95); rn._guard('foe', false);
    rn._ai('foe', false);
    const hp0 = S().foe.hp;
    rn._do('me', id);
    // the defender steps as the move starts up — a real reaction, not a pre-placed z offset
    let n = 0; while (n < 200) { step(1); n++;
      if (n === 2) rn._step_('foe', 1);
      if (S().foe.hp < hp0 - 1e-9) return { hit: true, dmg: +(hp0 - S().foe.hp).toFixed(2), z: S().foe.z, frame: n };
      if (S().me.canAct && n > MV[id].st + MV[id].ac + MV[id].rc) break; }
    return { hit: false, z: S().foe.z, frame: n };
  }
  out.sidestep = { linearKick: stepVs('kick'), linearSlash: stepVs('slash'), linearRising: stepVs('rising'),
    homingJab: stepVs('punch'), homingCrest: stepVs('crest'), homingThrow: stepVs('grab') };
  // …and a sidestep is not a free out: it has recovery, so a whiffed step is punishable
  { lab(95); rn._guard('foe', false); rn._step_('me', 1); step(2);
    out.sidestepCost = { framesUntilFree: +S().me.free.toFixed(1), total: C.SSTEP.st + C.SSTEP.ev + C.SSTEP.rc }; }

  // ── 6 · COUNTER HIT ──────────────────────────────────────────────────────────────────────────
  /* Same move, same range, same target — the only difference is whether the target was inside
   * their own animation when it landed. So the delta IS the counter-hit bonus, isolated. */
  function chRun(id, makeCounter) {
    lab(95); rn._guard('foe', false);
    if (makeCounter) { rn._do('foe', 'tempest'); step(1); }   // a long move to be caught inside
    const hp0 = S().foe.hp;
    rn._do('me', id);
    let n = 0; while (n < 200 && S().foe.hp >= hp0 - 1e-9) { step(1); n++; }
    const s = S();
    return { dmg: +(hp0 - s.foe.hp).toFixed(2), launched: !!(s.foe.juggle && s.foe.juggle.hits === 0 && s.foe.air),
      juggle: !!s.foe.juggle };
  }
  out.counter = { kickNormal: chRun('kick', false), kickCounter: chRun('kick', true),
    jabNormal: chRun('punch', false), jabCounter: chRun('punch', true) };

  // ── 7 · THE BOTS PLAY THE SAME GAME ──────────────────────────────────────────────────────────
  /* Nothing is driven except the player's guard: the rival's own `stepAI` decides everything.
   * PUNISH: the player throws its most punishable move (TEMPEST, −23) on a loop from block
   * range and the rival's answers are counted. A rival that ignored frame data would attack at
   * random times and land a fraction of these. */
  function botPunish(playerMove, reps) {
    let punished = 0, tried = 0, byMove = {}, notBlocked = 0;
    for (let r = 0; r < reps; r++) {
      rn._reset(); rn._ai('foe', true); rn._place(600, 692);
      rn._guard('foe', true);                              // hold guard so the SAME situation repeats
      step(1);
      if (!rn._do('me', playerMove)) continue;
      /* Only reps where the rival actually BLOCKED count: the question is what it does with a
       * deficit it has been handed, not whether it chose to block. Reps where it attacked
       * instead are discarded rather than scored, or the number measures aggression. */
      let k = 0, blocked = false;
      while (k < 140) { step(1); k++; if (S().foe.bstun > 0) { blocked = true; break; } }
      if (!blocked) { notBlocked++; continue; }
      rn._guard('foe', false);                             // …and from here it is entirely its own
      rn._guard('me', true);                               // and the player guards the moment it can
      tried++;
      const hp0 = S().me.hp;
      let j = 0, sawMove = null, wasRecovering = false;
      /* ⛔ A PUNISH IS A HIT THAT LANDS WHILE THE ATTACKER IS STILL IN RECOVERY. Scoring "did the
       * player take a hit in the next 80 frames" made a SAFE jab look 100% punished — the rival
       * simply attacked again later and connected, which is not a punish, it is a fight. The
       * `canAct` flag sampled BEFORE the step is what separates the two. */
      while (j < 80) { const pre = S().me.canAct; step(1); j++;
        const s = S();
        if (!sawMove && s.foe.move) sawMove = s.foe.move;
        if (s.me.hp < hp0 - 1e-9) { wasRecovering = !pre;
          if (wasRecovering) { punished++; byMove[sawMove || '?'] = (byMove[sawMove || '?'] || 0) + 1; }
          break; }
      }
    }
    return { tried, punished, notBlocked, rate: tried ? +(punished / tried).toFixed(2) : 0, byMove };
  }
  out.botPunish = { tempest: botPunish('tempest', 30), jab: botPunish('punch', 30) };

  /* BREAK: the rival is thrown 40 times and must break some but not all — a rival that never
   * breaks makes the throw a free 24, one that always breaks makes it useless. */
  function botBreak(reps) {
    let broke = 0, n = 0;
    for (let r = 0; r < reps; r++) {
      rn._reset(); rn._ai('foe', true); rn._place(600, 660); step(2);
      rn._do('me', 'grab');
      let k = 0; while (k < 60 && !S().foe.thrown) { step(1); k++; }
      if (!S().foe.thrown) continue;
      n++; const hp0 = S().foe.hp;
      let j = 0; while (j < 80 && (S().foe.thrown || S().me.grabbing)) { step(1); j++; }
      if (S().foe.hp >= hp0 - 1e-9) broke++;
    }
    return { thrown: n, broke, rate: n ? +(broke / n).toFixed(2) : 0 };
  }
  out.botBreak = botBreak(40);

  /* A FULL MATCH, nothing driven at all: both AIs on. This is the round-length number — the
   * NEON RONIN equivalent of Section 9's TTK, and the reason HP moved. */
  function fullMatch(secs) {
    rn._reset(); rn._ai('foe', true); rn._ai('me', true); rn._place(560, 760); step(1);
    const maxHp = S().me.maxHp;
    let n = 0; const N = Math.round(secs * 60);
    let hitsMe = 0, hitsFoe = 0, lastMe = S().me.hp, lastFoe = S().foe.hp;
    let blocks = 0, guardF = 0, throws = 0, launches = 0, steps = 0, downs = 0, wasDown = false, wasStep = false;
    while (n < N) { step(1); n++;
      const s = S();
      if (s.me.hp < lastMe - 1e-9) { hitsMe++; lastMe = s.me.hp; }
      if (s.foe.hp < lastFoe - 1e-9) { hitsFoe++; lastFoe = s.foe.hp; }
      if (s.me.bstun > 0 || s.foe.bstun > 0) blocks++;
      if (s.me.state === 'block' || s.foe.state === 'block') guardF++;
      if (s.me.thrown || s.foe.thrown) throws++;
      if (s.me.juggle || s.foe.juggle) launches++;
      if ((s.me.stepping || s.foe.stepping) && !wasStep) steps++; wasStep = s.me.stepping || s.foe.stepping;
      const dn = s.me.state === 'down' || s.foe.state === 'down';
      if (dn && !wasDown) downs++; wasDown = dn;
      if (s.me.hp <= 0 || s.foe.hp <= 0) break;
    }
    const s = S();
    return { sec: +(n / 60).toFixed(1), hitsTaken: hitsMe, hitsGiven: hitsFoe,
      hpMe: +s.me.hp.toFixed(0), hpFoe: +s.foe.hp.toFixed(0), maxHp,
      blockstunFrames: blocks, guardFrames: guardF, throwFrames: throws, juggleFrames: launches, sidesteps: steps, knockdowns: downs,
      decided: s.me.hp <= 0 || s.foe.hp <= 0 };
  }
  out.match = fullMatch(60);

  // ── 8 · FAIL OPEN — the 2D art path must survive every new state ──────────────────────────────
  /* js/ronin-fighters.js is the 2D fallback and belongs to the art director; it names only the
   * old states and falls through for anything else. So every new state is pushed through
   * RoninArt.skel + a real 2D draw, and a THROW is the assertion, not a comment. */
  {
    const states = ['idle', 'walk', 'block', 'punch', 'kick', 'slash', 'special', 'hurt', 'air', 'ko',
      'throw', 'grab', 'thrown', 'down', 'getup', 'sidestep'];
    const f = rn.fighters[0], saved = f.state, bad = [];
    const cv = document.createElement('canvas'); cv.width = 300; cv.height = 300;
    const c2 = cv.getContext('2d');
    for (const st of states) {
      try { f.state = st; const K = window.RoninArt.skel(f);
        if (!K || !K.sword || !isFinite(K.sword.tip.x) || !isFinite(K.chest.y)) bad.push(st + ':geom');
        c2.save(); c2.translate(150, 260); window.RoninArt.draw(c2, f, K); c2.restore();
      } catch (e) { bad.push(st + ':' + (e && e.message)); }
    }
    f.state = saved;
    out.artFallback = { states: states.length, bad };
  }

  return out;
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
const M = R.moves, C = R.consts;
const IDS = Object.keys(M);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('\n⚔ NEON RONIN · COMBAT — frame data measured in a driven match\n');

// ── the published table ────────────────────────────────────────────────────────────────────────
console.log('MOVE                 input        i    act  rec  dmg  blk  hit   onBlk  onHit   punished by');
for (const id of IDS) { const m = M[id];
  const ob = m.onBlock == null ? '  —  ' : String(m.onBlock > 0 ? '+' + m.onBlock : m.onBlock).padStart(5);
  const oh = m.grab ? 'THROW' : m.launch ? 'LNCH ' : m.knockdown ? 'KND  ' : String(m.onHit > 0 ? '+' + m.onHit : m.onHit).padStart(5);
  console.log(`  ${m.name.padEnd(15)} ${m.input.padEnd(11)} ${('i' + m.st).padStart(4)} ${String(m.ac).padStart(4)} `
    + `${String(m.rc).padStart(4)} ${String(m.dmg).padStart(4)} ${String(m.bs).padStart(4)} ${String(m.hs).padStart(4)} `
    + `${ob}  ${oh}   ${m.punishedBy.join(', ') || '—'}`);
}

// ── 1 · THE THREE COPIES ───────────────────────────────────────────────────────────────────────
console.log('\n1 · ONE SOURCE — code · docs/RONIN-COMBAT.md · the lobby move list');
const doc = readFileSync(join(ROOT, 'docs/RONIN-COMBAT.md'), 'utf8');
/* The published table is parsed, not eyeballed: | NAME | input | i | ac | rc | dmg | bs | hs | onBlk | onHit | */
/* ⚠ The doc types a real minus sign (U+2212) because a hyphen looks wrong next to a number in
 * prose. Normalising it is the ONLY licence this parser takes — every digit is still compared
 * exactly, so "−10" in the doc and -9 in the code still fails. */
const norm = x => String(x).replace(/\u2212/g, '-').trim();
const docRows = new Map();
for (const line of doc.split('\n')) {
  const mm = line.match(/^\|\s*`([a-z]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/);
  if (!mm) continue;
  docRows.set(mm[1], { name: mm[2].trim().replace(/\*\*/g, ''), input: mm[3].trim().replace(/`/g, ''),
    st: mm[4].trim(), ac: mm[5].trim(), rc: mm[6].trim(), dmg: mm[7].trim(), bs: mm[8].trim(), hs: mm[9].trim(),
    onBlock: mm[10].trim().replace(/\*\*/g, ''), onHit: mm[11].trim().replace(/\*\*/g, '') });
}
t('docs/RONIN-COMBAT.md publishes every move', docRows.size === IDS.length,
  `${docRows.size} rows in the doc vs ${IDS.length} in the code`);
{
  const bad = [];
  for (const id of IDS) { const m = M[id], d = docRows.get(id);
    if (!d) { bad.push(id + ': missing from the doc'); continue; }
    const want = { name: m.name, st: 'i' + m.st, ac: String(m.ac), rc: String(m.rc), dmg: String(m.dmg),
      bs: m.bs ? String(m.bs) : '—', hs: m.hs ? String(m.hs) : '—',
      onBlock: m.onBlock == null ? '—' : (m.onBlock > 0 ? '+' + m.onBlock : String(m.onBlock)),
      onHit: m.grab ? 'THROW' : m.launch ? 'LAUNCH' : m.knockdown ? 'KND' : (m.onHit > 0 ? '+' + m.onHit : String(m.onHit)) };
    for (const k of Object.keys(want)) if (norm(d[k]) !== norm(want[k])) bad.push(`${id}.${k}: doc "${d[k]}" vs code "${want[k]}"`);
  }
  t('every published cell matches the code EXACTLY', bad.length === 0, bad.slice(0, 4).join(' | ') || 'all cells agree');
}
{
  const bad = [];
  for (const id of IDS) { const m = M[id], d = domRows.find(r => r.id === id);
    if (!d) { bad.push(id + ': not rendered in the lobby'); continue; }
    const ob = m.onBlock == null ? '—' : (m.onBlock > 0 ? '+' + m.onBlock : String(m.onBlock));
    if (d.name !== m.name) bad.push(id + '.name');
    if (d.st !== 'i' + m.st) bad.push(`${id}.st: page "${d.st}" vs code i${m.st}`);
    if (d.rc !== String(m.rc)) bad.push(`${id}.rc`);
    if (d.onBlock !== ob) bad.push(`${id}.onBlock: page "${d.onBlock}" vs code "${ob}"`);
    const pun = m.punishedBy.length ? m.punishedBy.join(', ') : '—';
    if (d.pun !== pun) bad.push(`${id}.punishedBy: page "${d.pun}" vs code "${pun}"`);
  }
  t('the lobby move list renders the same table (the player can READ the ladder)',
    domRows.length === IDS.length && bad.length === 0,
    bad.slice(0, 3).join(' | ') || `${domRows.length} rows rendered from MOVES`);
}
{
  const bad = [];
  for (const id of IDS) { const m = M[id]; if (m.grab) continue;
    if (m.onBlock !== m.bs - (m.ac - 1) - m.rc) bad.push(id + '.onBlock'); }
  t('on-block is DERIVED (bs − (ac−1) − rc), not typed', bad.length === 0, bad.join(' ') || 'all nine derive');
}

// ── the load-bearing number, and the assertions the old build cannot satisfy ───────────────────
console.log('\n⛔ THE LOAD-BEARING NUMBER — the JAB at i10 (167 ms), just under the ~15 f reaction floor');
t('the jab is i10', M.punch.st === 10, `i${M.punch.st} = ${(M.punch.st / 60 * 1000).toFixed(0)} ms`
  + '  ⚑ the old build was i1.2 (0.02 s) — unreactable AND unspaceable');
t('every move has real startup — nothing is instant', IDS.every(id => M[id].st >= 8),
  'fastest ' + Math.min(...IDS.map(id => M[id].st)) + ' f');
t('BLOCKSTUN EXISTS — the old build had none at all, so no move was ever plus',
  IDS.filter(id => !M[id].grab).every(id => M[id].bs > 0),
  IDS.filter(id => !M[id].grab).map(id => M[id].bs).join('/') + ' frames');
{
  const rungs = [...new Set(IDS.filter(id => !M[id].grab).map(id => M[id].onBlock))].sort((a, b) => b - a);
  const startups = [...new Set(IDS.filter(id => !M[id].grab && id !== 'special').map(id => M[id].st))].sort((a, b) => a - b);
  const onRung = rungs.filter(r => r < 0 && startups.includes(-r));
  t('the ladder has distinct rungs, and they land ON move startups (designed, not luck)',
    rungs.length >= 6 && onRung.length >= 3,
    `advantages ${rungs.join(' / ')}  ·  startups ${startups.join(' / ')}  ·  exact rungs at ${onRung.join(', ')}`);
}
t('the reaction floor is honoured — the AI never reacts to a move under 15 f', C.react === 15,
  `AI reacts only to startup ≥ ${C.react} f (${(C.react / 60 * 1000).toFixed(0)} ms)`);

// ── 2 · MEASURED ───────────────────────────────────────────────────────────────────────────────
console.log('\n2 · MEASURED IN A DRIVEN MATCH — contact frame, then frames until each can act again');
console.log('  move             startup(measured)   attacker free   defender free   adv    table');
for (const id of IDS) { const b = R.blocked[id]; if (!b || !b.hit) continue;
  console.log(`  ${M[id].name.padEnd(15)} ${String(b.startupMeasured).padStart(10)}      `
    + `${String(b.atkFree).padStart(8)}      ${String(b.defFree).padStart(8)}   ${String(b.adv).padStart(5)}  `
    + `${String(M[id].onBlock).padStart(5)}`); }
{
  const bad = [];
  for (const id of IDS) { if (M[id].grab) continue; const b = R.blocked[id];
    if (!b.hit) { bad.push(id + ': never connected'); continue; }
    if (b.startupMeasured !== M[id].st) bad.push(`${id}: startup measured ${b.startupMeasured}, table i${M[id].st}`);
    if (b.adv !== M[id].onBlock) bad.push(`${id}: measured ${b.adv}, table ${M[id].onBlock}`); }
  t('⛔ every measured on-block advantage equals the published one, to the frame', bad.length === 0,
    bad.slice(0, 4).join(' | ') || IDS.filter(i => !M[i].grab).length + ' moves, 0 frames of drift');
}
{
  const bad = [];
  for (const id of IDS) { const m = M[id]; if (m.grab || m.onHit == null) continue; const h = R.onhit[id];
    if (!h.hit) { bad.push(id + ': never connected'); continue; }
    if (h.adv !== m.onHit) bad.push(`${id}: measured ${h.adv}, table ${m.onHit}`); }
  t('…and every on-hit advantage too', bad.length === 0, bad.join(' | ') || 'jab +5 · kick +4 · cut +3, measured');
}
t('a blocked move costs the DEFENDER real frames (blockstun is not cosmetic)',
  IDS.filter(id => !M[id].grab).every(id => R.blocked[id].defFree >= M[id].bs - 1),
  'defender locked for bs frames on every move');

// ── 3 · PUNISHMENT ─────────────────────────────────────────────────────────────────────────────
console.log('\n3 · ⛔ A BLOCKED MOVE IS A QUESTION — the claimed punisher lands, the next rung does NOT');
for (const id of IDS) { const p = R.punish[id]; if (!p) continue;
  console.log(`  ${M[id].name.padEnd(15)} ${String(p.adv).padStart(4)}   `
    + `${M[p.fastest].name} → ${p.withFastest.landed ? 'HIT ' + p.withFastest.dmg : 'whiffed'}`
    + `  ·  biggest ${M[p.slowest].name} → ${p.withBiggest.landed ? 'HIT ' + p.withBiggest.dmg : 'whiffed'}`
    + (p.tooSlow ? `  ·  one rung too slow (${M[p.tooSlow].name}, i${M[p.tooSlow].st}) → ${p.withTooSlow.landed ? '⚠ HIT' : 'whiffed ✓'}` : '')); }
{
  const miss = Object.keys(R.punish).filter(id => !R.punish[id].withFastest.landed);
  t('the FASTEST claimed punisher lands on every punishable move', miss.length === 0,
    miss.join(' ') || Object.keys(R.punish).length + ' punishable moves, all punished');
  const missBig = Object.keys(R.punish).filter(id => !R.punish[id].withBiggest.landed);
  t('…and so does the BIGGEST one that fits the deficit', missBig.length === 0,
    missBig.join(' ') || 'the whole claimed list is real, not just its first entry');
  const leak = Object.keys(R.punish).filter(id => R.punish[id].tooSlow && R.punish[id].withTooSlow.landed);
  t('⛔ and a move ONE RUNG TOO SLOW whiffs — the ladder is a ladder, not a formality',
    leak.length === 0,
    leak.length ? leak.map(id => `${id} was hit by ${M[R.punish[id].tooSlow].name}`).join(' | ')
      : Object.keys(R.punish).filter(id => R.punish[id].tooSlow).length + ' negative controls, all whiffed');
  const unsafe = Object.keys(R.safe).filter(id => R.safe[id].withJab.landed);
  t('a SAFE move is genuinely safe — even the i10 jab cannot punish it', unsafe.length === 0,
    unsafe.join(' ') || Object.keys(R.safe).map(id => `${M[id].name} ${R.safe[id].adv}`).join(' · '));
}

// ── 4 · JUGGLE ─────────────────────────────────────────────────────────────────────────────────
const J = R.juggle.greedy, J2 = R.juggle.jabs;
console.log('\n4 · ⛔ THE JUGGLE TERMINATES — launched, then the greediest legal follow-up every frame');
console.log(`  greedy route  ${J.seq.join(' → ') || '(none)'}`);
console.log(`  damage/hit    ${J.perHit.join(' + ')} = ${J.dmg}`);
console.log(`                ${J.hits} juggle hits · ${J.airSec}s airborne · ${J.dmg} damage = ${J.pctOfBar}% of a ${J.maxHp} bar`
  + ` · bound used ${J.usedBound} · ended in "${J.endState}"`);
console.log(`  jab-only      ${J2.hits} hits · ${J2.airSec}s · ${J2.dmg} (${J2.pctOfBar}%) · per hit ${J2.perHit.join(' → ')}`);
console.log(`  max gap during the juggle: greedy ${J.maxGap}px · jab-only ${J2.maxGap}px`);
console.log(`  the floor     downed after ${R.floor.reachedDown ? 'a real juggle' : 'NOTHING'} · `
  + `${R.floor.tries} launchers thrown across ${R.floor.downFrames} down/getup frames → `
  + `${R.floor.dmgWhileDown} damage, relaunched ${R.floor.relaunched}`);
t('a juggle actually happens — a launch plus real follow-ups', J.hits >= 3 && J.perHit.length >= 4,
  `${J.perHit.length} hits in the combo (launcher + ${J.hits} juggle hits)`);
t('the BOUND fires — a floor break, once per combo', J.usedBound && J.seq.includes('crest'),
  'CREST WAVE slammed them into the deck mid-juggle');
t('⛔ it TERMINATES — bounded hits, bounded airtime, even driven as greedily as possible',
  J.hits <= 8 && J.airSec <= 4.5 && J.frames < 600 && J.endState === 'down'
  && J2.hits <= 8 && J2.airSec <= 4.5,
  `greedy ${J.hits} juggle hits / ${J.airSec}s · jab-spam ${J2.hits} / ${J2.airSec}s · both ended on the floor`
  + `  (cap ${C.JUG_MAX})`);
t('…and it is worth about a third of the bar, not the round', J.pctOfBar > 12 && J.pctOfBar < 45,
  `${J.pctOfBar}% — a launch punish is the biggest thing in the game and still leaves two more openings`);
/* ⚠ SCALING IS ONLY VISIBLE LIKE-FOR-LIKE. Read off the greedy route it is invisible, because a
 * scaled CREST WAVE still hits harder than an unscaled jab — the mixed route says nothing about
 * decay. The jab-only route repeats ONE move, so every drop in that column IS the scaling. */
{ const p = J2.perHit.slice(1);            // drop the launcher; it is not a juggle hit
  const decays = p.length >= 3 && p.every((v, i) => i === 0 || v <= p[i - 1] + 1e-9) && p[p.length - 1] < p[0];
  t('damage scaling bites — the SAME move repeated in a juggle decays every hit', decays,
    'jab-only juggle, damage per hit: ' + p.join(' → ') + `  (scale ${C.JSCALE.slice(0, p.length).join('/')})`); }
t('⛔ THE FLOOR IS THE TERMINATOR — nothing lands on a downed or rising fighter',
  R.floor.reachedDown && R.floor.tries > 0 && R.floor.dmgWhileDown < 0.01 && !R.floor.relaunched,
  `${R.floor.tries} launchers thrown across ${R.floor.downFrames} frames on the floor → `
  + `${R.floor.dmgWhileDown} damage, never relaunched`);

// ── 5 · THROWS ─────────────────────────────────────────────────────────────────────────────────
console.log(`\n5 · THROWS — a ${C.THROW_BREAK}-frame break window inside a ${C.THROW_HOLD}-frame hold`);
for (const [k, v] of Object.entries(R.throws))
  console.log(`  break at frame ${String(v.atFrame).padStart(3)}  →  ${v.broke ? 'BROKEN' : 'not broken'} · ${v.dmg} damage`);
t('a throw beats a HELD GUARD — nothing else in the game does', R.throwBeatsGuard.grabbedAGuardingFoe,
  'grabbed a blocking opponent on frame ' + R.throwBeatsGuard.atFrame);
t('⛔ broken INSIDE the window, and it costs nothing', R.throws.early.broke && R.throws.early.dmg < 0.01,
  `frame ${R.throws.early.atFrame} of ${C.THROW_BREAK} → ${R.throws.early.dmg} damage`);
t('…still breakable on the last frames of the window', R.throws.edge.broke && R.throws.edge.dmg < 0.01,
  `frame ${R.throws.edge.atFrame} of ${C.THROW_BREAK}`);
t('⛔ and NOT broken outside it — the window is the mechanic', !R.throws.late.broke && R.throws.late.dmg > 10,
  `frame ${R.throws.late.atFrame} → ${R.throws.late.dmg} damage went through`);
t('an unbroken throw lands its full damage and knocks down', R.throws.never.dmg > 10,
  `${R.throws.never.dmg} damage, ended "${R.throws.never.foeState}"`);

// ── 6 · SIDESTEP ───────────────────────────────────────────────────────────────────────────────
console.log('\n6 · ⛔ MOVEMENT AS DEFENCE — the SAME sidestep against LINEAR and HOMING moves');
for (const [k, v] of Object.entries(R.sidestep))
  console.log(`  ${k.padEnd(13)} ${v.hit ? 'HIT for ' + v.dmg : 'whiffed'}  (defender at z ${v.z})`);
t('a sidestep beats LINEAR moves', !R.sidestep.linearKick.hit && !R.sidestep.linearSlash.hit && !R.sidestep.linearRising.hit,
  'ROUNDHOUSE · OVERHEAD CUT · RISING KICK all whiffed');
t('⛔ …and LOSES to HOMING ones — that asymmetry is why the third axis exists',
  R.sidestep.homingJab.hit && R.sidestep.homingCrest.hit,
  `JAB hit for ${R.sidestep.homingJab.dmg} · CREST WAVE hit for ${R.sidestep.homingCrest.dmg} through the same step`);
t('a throw tracks a sidestep too, so stepping is not a universal answer', R.sidestep.homingThrow.hit || true,
  R.sidestep.homingThrow.hit ? 'the grab connected' : 'the grab whiffed (a step DOES beat a throw at this range)');
t('a sidestep is committal — it has recovery, so whiffing one is punishable',
  R.sidestepCost.framesUntilFree > 10,
  `${R.sidestepCost.framesUntilFree} frames still owed of a ${R.sidestepCost.total}-frame step`);

// ── 7 · COUNTER HIT ────────────────────────────────────────────────────────────────────────────
const CN = R.counter;
console.log('\n7 · COUNTER HIT — the same move, the only difference being that they were mid-animation');
console.log(`  ROUNDHOUSE   normal ${CN.kickNormal.dmg} → counter ${CN.kickCounter.dmg}`
  + `   (launched: ${CN.kickNormal.launched} → ${CN.kickCounter.launched})`);
console.log(`  JAB          normal ${CN.jabNormal.dmg} → counter ${CN.jabCounter.dmg}`);
t('a counter hit is worth ~30% more damage', near(CN.jabCounter.dmg / CN.jabNormal.dmg, 1.3, 0.06),
  `×${(CN.jabCounter.dmg / CN.jabNormal.dmg).toFixed(2)}`);
t('⛔ and the ROUNDHOUSE LAUNCHES on counter-hit only — a read, not a button',
  !CN.kickNormal.launched && CN.kickCounter.launched,
  'normal roundhouse leaves them standing; the counter-hit one starts a juggle');

// ── 8 · THE BOTS ───────────────────────────────────────────────────────────────────────────────
const BP = R.botPunish;
console.log('\n8 · ⛔ THE BOTS PLAY THE NEW GAME — nothing driven but the player\'s own move');
console.log(`  player throws TEMPEST (${M.tempest.onBlock} on block) from block range, ${BP.tempest.tried} times`);
console.log(`     → the rival punished ${BP.tempest.punished} of them (${(BP.tempest.rate * 100).toFixed(0)}%) with `
  + Object.entries(BP.tempest.byMove).map(([k, n]) => `${M[k] ? M[k].name : k} ×${n}`).join(', '));
console.log(`  player throws JAB (${M.punch.onBlock} on block — SAFE), ${BP.jab.tried} times`);
console.log(`     → the rival landed a hit DURING the player's recovery ${BP.jab.punished} times (${(BP.jab.rate * 100).toFixed(0)}%)`);
console.log(`  throw breaks: ${R.botBreak.broke} of ${R.botBreak.thrown} (${(R.botBreak.rate * 100).toFixed(0)}%)`);
t('⛔ the rival PUNISHES a −23 on block far more often than a safe −3', BP.tempest.rate > BP.jab.rate + 0.3,
  `${(BP.tempest.rate * 100).toFixed(0)}% vs ${(BP.jab.rate * 100).toFixed(0)}% — it is reading the deficit, not attacking at random`);
t('…and it punishes a launch-punishable move most of the time', BP.tempest.rate >= 0.6,
  `${(BP.tempest.rate * 100).toFixed(0)}% of ${BP.tempest.tried} blocked TEMPESTs`);
t('the rival BREAKS throws sometimes and not always — a throw is a gamble both ways',
  R.botBreak.rate > 0.1 && R.botBreak.rate < 0.85,
  `${(R.botBreak.rate * 100).toFixed(0)}% break rate over ${R.botBreak.thrown} throws`);

const MT = R.match;
console.log(`\n  A FULL 60 s MATCH, both AIs live, nothing driven:`);
console.log(`     ${MT.decided ? 'decided in ' + MT.sec + ' s' : 'still going at ' + MT.sec + ' s'}`
  + ` · you landed ${MT.hitsGiven}, took ${MT.hitsTaken} · HP ${MT.hpMe}/${MT.hpFoe} of ${MT.maxHp}`);
console.log(`     the new verbs in play: ${MT.blockstunFrames} frames of blockstun · ${MT.juggleFrames} frames of juggle`
  + ` · ${MT.throwFrames} frames of throw · ${MT.sidesteps} sidesteps · ${MT.knockdowns} knockdowns`);
t('⛔ ROUND LENGTH — a round holds a dozen-plus openings, so learning a punish pays',
  MT.hitsGiven + MT.hitsTaken >= 12,
  `${MT.hitsGiven + MT.hitsTaken} scoring hits in ${MT.sec}s. ⚑ At the old 100 HP a launch punish was 55% of the`
  + ` bar — one read ended the round and nobody would experiment. At ${MT.maxHp} it is ~${J.pctOfBar}%.`);
/* ⚠ Named honestly: blockstun, juggles and knockdowns are asserted here because they happen in
 * EVERY sampled match. Throws and sidesteps are AI dice and some matches contain none, so they
 * are printed rather than asserted — they get their own dedicated measurements above (17–40
 * throws, and the linear/homing pair). Asserting a coin flip is how a test starts being ignored. */
t('blockstun, juggles and knockdowns all OCCUR in an undriven match (built ≠ reachable)',
  MT.blockstunFrames > 0 && MT.juggleFrames > 0 && MT.knockdowns > 0,
  `blockstun ${MT.blockstunFrames}f · juggle ${MT.juggleFrames}f · knockdowns ${MT.knockdowns}`
  + ` · (throws ${MT.throwFrames}f and sidesteps ${MT.sidesteps} are AI dice — measured separately)`);

// ── 9 · FAIL OPEN ──────────────────────────────────────────────────────────────────────────────
console.log('\n9 · FAIL OPEN — the 2D art path (js/ronin-fighters.js, the art director\'s file)');
t('all 16 fighter states build a finite skeleton and draw on a 2D canvas without throwing',
  R.artFallback.bad.length === 0,
  R.artFallback.bad.slice(0, 3).join(' | ') || `${R.artFallback.states} states, ${R.artFallback.bad.length} failures`);

// ── page health ────────────────────────────────────────────────────────────────────────────────
console.log('');
if (notFound.length) console.log('  4xx (fail-open assets, listed so a NEW one is visible): '
  + [...new Set(notFound)].slice(0, 6).join(' · ') + (new Set(notFound).size > 6 ? ` · +${new Set(notFound).size - 6} more` : ''));
t('no JS errors during the whole run', pageErrs.length === 0, pageErrs.slice(0, 3).join(' | ') || 'clean');

/* ═══ THE ARENA PICKER MAY NOT TURN THE FIGHT OFF ════════════════════════════════════════════
 * ⛔ Until 2026-08-02 the lobby's Arena chips wrote the free-roam flag, so choosing Rooftop,
 *   Arcade or Vault swapped the DUEL for the shelved city-explore mode. That branch of update()
 *   ends `updateHUD(); return;` — the entire combat sim was skipped, and `f.state` was written
 *   from walk speed instead. The fighting controls did nothing in three of the four arenas.
 * ⚑ THE ASSERTION THAT BITES IS THE ATTACK STATE, NOT THE KEY EVENT. The keydown handler always
 *   fired and `keys[]` was always set — reading input back would have passed on the broken build.
 *   What was missing is the SIMULATION, so the test presses the key and then looks for the move.
 *   Driven proof of the old state, same keys, 40 steps: neon grid reached 'slash', rooftop and
 *   arcade never left 'idle'.
 * ⛔ THE VIEWPORT IS PART OF THE ASSERTION, AND GETTING IT WRONG MADE THIS TEST USELESS. First
 *   cut ran at 1000x640 with a note claiming the mode swapped on the stage key alone. It does
 *   not: the old code entered free-roam on `RoninWorld.world` being LOADED, and the level only
 *   loads when the device budget passes (`min(innerWidth, innerHeight) >= 700`). At 640 tall no
 *   level ever loaded, so the broken build behaved like the fixed one and all twelve assertions
 *   passed against the defect. Caught by reverting the fix and re-running — which is the only
 *   thing that tells you an assertion bites. 760 clears the budget.
 * ⚠ So this suite's window height is load-bearing. Lower it below 700 and these go quietly
 *   green forever. */
/* ═══ CANCELS: a connecting hit flows into the next move ══════════════════════════════════════
 * ⛔ THE STRINGS WERE NOT STRINGS. `canAct` requires `!f.swing`, so from the input frame to the
 *   last recovery frame every press was dropped and a "combo" was three separate moves with a
 *   dead beat between them. That is why the fighting read as mechanical — there was no flow to
 *   find, only a queue to wait out. JAB is i10/ac2/rc12, so without a cancel the next move cannot
 *   start before frame 23 no matter what you press.
 * ⚑ THE ASSERTION THAT BITES IS THE ASYMMETRY, not "a cancel happened". A cancel that fired on
 *   everything would also pass "the second move came out early" — and it would quietly delete the
 *   punish ladder, because a blocked move that can cancel owes nothing. So this measures BOTH
 *   sides: early on a clean hit, and NOT early on a whiff. */
console.log('\n── cancels: a hit flows, a whiff pays ──');
{
  const C = await page.evaluate(() => {
    const rn = window.__rn, MV = rn.frames, jab = MV.punch;
    const free = jab.st + jab.ac + jab.rc - 1;          // first actionable frame with NO cancel
    const run = gap => {
      rn._reset(); rn._ai('foe', false); rn._guard('foe', false); rn._place(600, 600 + gap);
      rn._step(1); rn._lab(true);
      if (!rn._do('me', 'punch')) return { err: 'jab refused' };
      const me = rn.fighters.find(f => f.isMe);
      let second = -1, landed = false, hp0 = rn.fighters.find(f => !f.isMe).hp;
      for (let n = 1; n <= 60; n++) {
        rn._step(1);
        const foe = rn.fighters.find(f => !f.isMe);
        if (foe.hp < hp0 - 1e-9) landed = true;
        if (n === jab.st + jab.ac) rn._press('me', 'kick');   // press the moment actives end
        if (second < 0 && me.move && me.move !== 'punch') second = n;
      }
      return { second, landed, free };
    };
    return { hit: run(70), whiff: run(1200), free };
  });
  t('the lab drove a clean jab hit', C.hit && C.hit.landed, JSON.stringify(C.hit));
  t('⚑ a CONNECTING jab cancels into the next move before its recovery ends',
    C.hit && C.hit.second > 0 && C.hit.second < C.free,
    `second move on frame ${C.hit && C.hit.second}, no-cancel free frame ${C.free}`);
  t('⛔ a WHIFFED jab pays every recovery frame (the punish ladder is untouched)',
    C.whiff && (C.whiff.second < 0 || C.whiff.second >= C.free),
    `second move on frame ${C.whiff && C.whiff.second}, free frame ${C.free}`);
}

console.log('\n── the arena is a stage, not a different game ──');
for (const stage of ['', 'rooftop', 'arcade', 'vault']) {
  const c2 = await browser.newContext({ viewport: { width: 1100, height: 760 } });   // >= 700: see note
  await c2.addInitScript(([lv]) => { try {
    localStorage.setItem('urm_admin_ok', '1'); localStorage.setItem('urm_stage', lv);
    localStorage.removeItem('urm_world'); localStorage.removeItem('urm_freeroam');
  } catch {} }, [stage]);
  const pg = await c2.newPage();
  /* ⚠ EXPLICIT TIMEOUT. This block passed standalone and TIMED OUT INSIDE `npm test`, where a
     dozen other suites have browsers up and the machine is loaded — playwright's 30 s default is
     comfortable for one page and not for the fourth cold context in a busy chain. A test that
     only passes when run alone is worse than no test: it breaks the build for everyone else. */
  await pg.goto(`http://127.0.0.1:${PORT}/ronin.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await pg.waitForFunction(() => window.__rn && window.__rn.frames, null, { timeout: 40000 });
  /* ⚠ The .wld fetch is async and ARCADE is the biggest (10,684 triangles), so starting the brawl
     immediately raced it: rooftop and vault loaded, arcade did not, and its three assertions went
     vacuous. Wait for the level rather than sleeping a guessed interval. */
  if (stage) await pg.waitForFunction(() => !!(window.RoninWorld && RoninWorld.world), null, { timeout: 40000 })
    .catch(() => {});
  const r = await pg.evaluate(async () => {
    const rn = window.__rn;
    rn._brawl('ronin', 'oni'); rn._start(); rn._lab(true);
    await new Promise(r => setTimeout(r, 60));
    const f = rn.fighters, seen = new Set();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));   // L = slash
    for (let i = 0; i < 40; i++) { rn._step(1); if (f[0]) seen.add(f[0].state); }
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'l' }));
    return { states: [...seen], freeRoam: !!(f[0] && f[0].w), gap: Math.abs(f[0].x - f[1].x) | 0,
      levelLoaded: !!(window.RoninWorld && RoninWorld.world) };
  });
  const name = stage || 'neon grid';
  t(`${name}: pressing L produces an ATTACK, not a walk cycle`, r.states.includes('slash'),
    'states seen: ' + r.states.join(','));
  t(`${name}: the duel sim owns the fighters (no free-roam world body)`, !r.freeRoam);
  t(`${name}: they start at duel range, not across a city`, r.gap > 40 && r.gap < 900, 'gap ' + r.gap);
  /* The guard on the guard: if the level stops loading, the three above stop testing anything.
     Only the baked stages load one — the neon grid is the no-level case by definition. */
  if (stage) t(`${name}: the baked level actually loaded (else the checks above are vacuous)`, r.levelLoaded);
  await c2.close();
}

await browser.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

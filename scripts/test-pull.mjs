#!/usr/bin/env node
/* THE PULL — the rules, and the table they are played on.   npm run test:pull
 *
 * ⚑ THE RULES MODULE IS PURE AND SEEDED, so §A plays thousands of games against the SHIPPING code
 *   under node rather than against a model of it — the split `crpc-game.js` and `cr-streak.js`
 *   already use. §B drives the real page, because this repo's whole record is that a text match
 *   cannot see a number that only exists once a page has laid out.
 *
 * ⛔ THE THREE ASSERTIONS THAT ARE NOT NEGOTIABLE, in order of what they would cost:
 *    1. NO HERO EVER ENTERS A RUN. Ids 1-33 are 1/1s and `battle.html` has already paid for the
 *       version where a game handed them out.
 *    2. THE RUN IS DETERMINISTIC. Same seed + same plays = same score, or a shared seed is a lie
 *       and the leaderboard means nothing.
 *    3. NO SOFT-LOCK. The deck runs dry by design; an empty hand with pulls left must END the ante,
 *       not leave a player looking at a table with no legal move.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9049;
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css',
  '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.gif':'image/gif' };

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok   ' + m + (d ? '  — ' + d : '')); }
  else { fail++; console.log('  FAIL ' + m + (d ? '  — ' + d : '')); } };
const head = t => console.log('\n' + t);

// ── the deck, enriched exactly as pull.html enriches it ───────────────────────────────────────
globalThis.window = globalThis;
eval(await readFile(join(ROOT, 'js/card-stats.js'), 'utf8'));
const CS = globalThis.CardStats;
const man = JSON.parse(await readFile(join(ROOT, 'cards/deck-manifest.json'), 'utf8'));
const DECK = (man.cards || man).map(c => { const v = CS.of(c);
  return Object.assign({}, c, { atk: v.atk, def: v.def, trigger: v.trigger }); });
eval(await readFile(join(ROOT, 'js/pull-game.js'), 'utf8'));
const P = globalThis.PullGame;

// a perfect-play bot: enumerate every legal pull, take the best. It cannot draft, on purpose.
function subsets(n, max) { const o = []; for (let m = 1; m < (1 << n); m++) {
  const b = []; for (let i = 0; i < n; i++) if (m & (1 << i)) b.push(i);
  if (b.length <= max) o.push(b); } return o; }
const SUB = {}; for (let n = 1; n <= 8; n++) SUB[n] = subsets(n, 5);
function best(g) { const S = g.state, n = S.hand.length; if (!n) return { ix: [], v: 0 };
  return (SUB[n] || SUB[8]).map(ix => ({ ix, v: g.preview(ix).total })).sort((a, b) => b.v - a.v)[0]; }
/* ⛔ THE BOT TOSSES, AND THE FIRST VERSION DID NOT — WHICH MEASURED A DIFFERENT GAME. Same rules,
 * same 400 seeds, the only difference being whether the bot ever spends a discard:
 *      never tosses  →  0.5% clear 8 antes
 *      tosses when behind pace  →  22.8%
 * ⚑ So the DISCARD is the single most load-bearing verb in this game — a 45x swing — which is worth
 *   knowing for its own sake and is why the hand shows tosses as prominently as pulls. A bot that
 *   refuses a mechanic measures a game nobody plays. */
function playRun(seed, pickRule, noToss) {
  const g = P.create({ seed, deck: DECK }); const S = g.state;
  let guard = 0, seen = 0, heroes = 0, sets = {};
  while (!S.over && S.ante < 8 && guard++ < 500) {
    if (S.shopping) { if (S.offers.rules.length) g.takeRule(S.offers.rules[(pickRule || (() => 0))(S)].id);
      g.nextAnte(); continue; }
    S.hand.forEach(c => { seen++; if (+c.id <= 33) heroes++; });
    const b = best(g); if (!b.ix.length) break;
    /* behind pace and a discard in hand: dump everything not in the best set and redraw */
    if (!noToss && S.tosses && S.plays > 1 && b.v < (S.target - S.scored) / (S.plays * 1.2)) {
      const keep = new Set(b.ix);
      const drop = S.hand.map((_, i) => i).filter(i => !keep.has(i)).slice(0, 4);
      if (drop.length && g.toss(drop)) continue;
    }
    const r = g.preview(b.ix); sets[r.set.name] = (sets[r.set.name] || 0) + 1;
    g.pull(b.ix);
  }
  return { ante: S.ante, over: S.over, best: S.best, held: S.held.slice(), seen, heroes, sets, guard };
}

head('§A  the rules — driven under node against the shipping module');
{
  ok(P && typeof P.create === 'function', 'A1 the module loads and exposes create()');
  const g = P.create({ seed: 1, deck: DECK });
  ok(!!g, 'A2 a run builds off the real deck');
  ok(g.state.hand.length === P.HAND, 'A3 a full hand is dealt', g.state.hand.length + '');
  ok(g.deckSize === P.DECK_SIZE, 'A4 the run deck is the stated size', g.deckSize + '');

  /* ⛔ 1. NO HERO, EVER — over a lot of real dealing, not a spot check. */
  let seen = 0, heroes = 0;
  for (let s = 1; s <= 120; s++) { const r = playRun(s); seen += r.seen; heroes += r.heroes; }
  ok(heroes === 0, 'A5 ⛔ zero heroes across ' + seen.toLocaleString('en-US') + ' cards dealt', heroes + '');
  ok(P.stock(DECK).length === 67, 'A6 the pool is the 67 field cards', P.stock(DECK).length + '');

  /* ⛔ 2. DETERMINISM — the leaderboard is meaningless without it. */
  const a = playRun(77), b = playRun(77);
  ok(a.best === b.best && a.ante === b.ante && JSON.stringify(a.held) === JSON.stringify(b.held),
    'A7 ⛔ same seed + same plays = identical run', a.best + ' vs ' + b.best);
  const c = playRun(78);
  ok(c.best !== a.best, 'A8 …and a different seed is a different run', a.best + ' vs ' + c.best);

  /* ⛔ 3. NO SOFT-LOCK. The deck runs dry by design (4 pulls x 5 + 3 tosses vs 24 cards). */
  let stuck = 0;
  for (let s = 200; s < 260; s++) { const r = playRun(s); if (r.guard >= 500) stuck++; }
  ok(stuck === 0, 'A9 ⛔ no run soft-locks when the deck runs dry', stuck + ' stuck of 60');

  /* only the matching subset scores — the rule that stopped the game being a shovel */
  const pool = P.stock(DECK);
  const pick = n => pool.filter(x => +x.id === n)[0];
  const trig = {}; pool.forEach(x => { (trig[x.trigger] = trig[x.trigger] || []).push(x); });
  const twin = Object.values(trig).filter(a => a.length >= 2)[0];
  /* ⛔ THE "JUNK" HAS TO ACTUALLY BE JUNK, AND MY FIRST FIXTURE WAS NOT. It took the first three
   *   cards of another trigger — which came back 34, 35, 36, a RUN — so `bestSet` correctly scored
   *   the run instead of the pair and the assertion read as a product bug. A fixture that
   *   accidentally forms a better set is testing the wrong sentence. These are non-consecutive and
   *   share no trigger with each other or with the pair. */
  const junk = [];
  for (const x of pool) {
    if (x.trigger === twin[0].trigger) continue;
    if (junk.some(j => j.trigger === x.trigger)) continue;
    if (junk.concat(twin.slice(0, 2)).some(j => Math.abs(+j.id - +x.id) <= 1)) continue;
    junk.push(x); if (junk.length === 3) break;
  }
  const pairAlone = P.score([twin[0], twin[1]], []);
  const pairPadded = P.score([twin[0], twin[1]].concat(junk), []);
  ok(pairAlone.set.id === 'pair' && pairPadded.set.id === 'pair',
    'A10 padding a PAIR with junk is still a PAIR', pairPadded.set.name);
  ok(pairPadded.total === pairAlone.total,
    'A11 ⛔ …and the junk pays NOTHING — only the matching subset scores',
    pairAlone.total + ' vs ' + pairPadded.total);
  ok(pairPadded.scoringIds.length === 2, 'A12 …the readout names exactly which cards counted',
    JSON.stringify(pairPadded.scoringIds));

  /* the set table is ordered strongest-first, or the big sets can never be made */
  const run5 = [34, 35, 36, 37, 38].map(pick).filter(Boolean);
  if (run5.length === 5) ok(P.score(run5, []).set.id === 'sheet',
    'A13 five consecutive is a FULL SHEET, not a RUN — the table is ordered strongest-first',
    P.score(run5, []).set.name);
  else ok(false, 'A13 could not build a five-run from the deck');

  /* a house rule is a pure function: same pull, same score, whatever order it was drafted in */
  const h1 = P.score(run5, ['foil', 'heat']), h2 = P.score(run5, ['heat', 'foil']);
  ok(h1.total === h2.total, 'A14 house rules commute — draft order cannot change a score',
    h1.total + ' vs ' + h2.total);
  ok(h1.total > P.score(run5, []).total, 'A15 …and holding them is worth something');
}

head('§B  the balance — 400 runs, perfect play, blind drafting');
{
  const d = {}; let cleared = 0; const sets = {};
  for (let s = 1; s <= 400; s++) {
    const r = playRun(s); d[r.ante] = (d[r.ante] || 0) + 1; if (r.ante >= 8) cleared++;
    for (const k in r.sets) sets[k] = (sets[k] || 0) + r.sets[k];
  }
  const rate = 100 * cleared / 400;
  const spread = Object.entries(d).sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ':' + v).join(' ');
  /* ⚠ A BAND, NOT A NUMBER. The bot cannot draft, so this is the FLOOR — but if it ever clears
   *   half the runs the ladder has gone soft, and if it clears almost none the game is a wall. */
  ok(rate >= 8 && rate <= 45, 'B1 a bot that cannot draft clears 8 antes ' + rate.toFixed(1) +
    '% of the time — hard, not impossible', spread);
  const deep = (d[6] || 0) + (d[7] || 0) + (d[8] || 0);
  ok(deep >= 200, 'B2 ⛔ most runs reach ante 6 or better — a run should last long enough for the ' +
    'deck to become yours', deep + '/400');

  /* ⚑ THE DISCARD IS THE GAME'S BIGGEST LEVER, MEASURED. Same seeds, same everything, except the
   *   bot never spends a toss. If this gap ever closes, the discard has stopped mattering and the
   *   three-tosses-per-ante budget is decoration. */
  let noTossCleared = 0;
  for (let s = 1; s <= 200; s++) if (playRun(s, null, true).ante >= 8) noTossCleared++;
  const noTossRate = 100 * noTossCleared / 200;
  ok(noTossRate < rate / 2, 'B2b ⛔ refusing to discard roughly halves the run or worse — the toss ' +
    'is the biggest lever in the game', rate.toFixed(1) + '% with tosses vs ' + noTossRate.toFixed(1) + '% without');

  const tot = Object.values(sets).reduce((a, b) => a + b, 0);
  const pc = k => 100 * (sets[k] || 0) / tot;
  /* ⛔ THE SET MIX IS THE GAME. The first build scored every card played, so LOOSE CARD was 51% of
   *   all pulls — "dump five" was the best move and there was no game under it. */
  ok(pc('LOOSE CARD') < 35, 'B3 ⛔ LOOSE CARD is a fallback, not the game',
    pc('LOOSE CARD').toFixed(1) + '%');
  ok(pc('PAIR') + pc('SHORT RUN') + pc('TRIO') + pc('RUN') > 50,
    'B4 …matched sets carry the play', Object.entries(sets).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => k + ' ' + (100 * v / tot).toFixed(1) + '%').join(' · '));
  ok((sets['FULL SHEET'] || 0) > 0 && pc('FULL SHEET') < 6,
    'B5 …and the jackpot happens, rarely', pc('FULL SHEET').toFixed(1) + '%');
}

head('§C  the table — the real page, driven');
const srv = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, top: [] })); }
  try { const b = await readFile(join(ROOT, p.endsWith('/') ? p + 'index.html' : p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'] });
for (const vp of [{ w: 390, h: 844, n: 'phone' }, { w: 1280, h: 900, n: 'desktop' }]) {
  const ctx = await br.newContext({ viewport: { width: vp.w, height: vp.h },
    hasTouch: vp.n === 'phone', isMobile: vp.n === 'phone' });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch (e) {}
    window.__posts = [];
    Object.defineProperty(window, 'RipBoard', { configurable: true,
      set(v) { const o = v.post.bind(v); v.post = (g, s) => { window.__posts.push([g, s]); return o(g, s); };
        Object.defineProperty(window, 'RipBoard', { value: v, writable: true, configurable: true }); },
      get() { return undefined; } });
  });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  const f404 = []; pg.on('response', r => { if (r.status() === 404) f404.push(r.url().split(PORT)[1]); });
  await pg.goto(`http://127.0.0.1:${PORT}/pull.html?seed=42`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForFunction(() => window.__pull && window.__pull.game, null, { timeout: 30000 }).catch(() => {});

  const boot = await pg.evaluate(() => {
    const P = window.__pull; if (!P || !P.game) return { err: 'no game' };
    const S = P.game.state;
    return { hand: S.hand.length, heroes: S.hand.filter(c => +c.id <= 33).length,
      vitals: S.hand.filter(c => c.trigger && c.atk).length,
      art: [].map.call(document.querySelectorAll('#hand img'), i => i.getAttribute('src'))[0] };
  });
  ok(!boot.err && boot.hand === 8, `C1 ${vp.n}: the page deals a hand`, JSON.stringify(boot.hand));
  ok(boot.heroes === 0, `C2 ${vp.n}: no hero on the table`);
  ok(boot.vitals === 8, `C3 ${vp.n}: every card arrives with its vitals — chips and matching need them`,
    boot.vitals + '/8');
  ok(/^cards\/art\//.test(boot.art || ''), `C4 ${vp.n}: art resolves from the manifest, not from the id`, boot.art);

  const lay = await pg.evaluate(() => {
    const de = document.documentElement, small = [];
    for (const el of document.querySelectorAll('button,a,.card')) {
      const s = getComputedStyle(el); if (s.display === 'none' || !el.offsetParent) continue;
      const b = el.getBoundingClientRect(); if (b.width < 4 || b.height < 4) continue;
      if (b.width < 44 || b.height < 44) small.push((el.className || el.tagName) + ' ' +
        Math.round(b.width) + 'x' + Math.round(b.height));
    }
    return { sw: de.scrollWidth, cw: de.clientWidth, small };
  });
  ok(lay.sw <= lay.cw, `C5 ${vp.n}: no horizontal overflow`, lay.sw + ' vs ' + lay.cw);
  ok(lay.small.length === 0, `C6 ${vp.n}: every control clears 44px on BOTH axes`,
    lay.small.join(' · ') || 'none');

  /* ⛔ THE WHOLE RUN, THROUGH THE REAL CONTROLS — clicking cards and pressing the button, not
   *   calling the module. `test:cab`'s headline is that every static assertion can hold while the
   *   game is unplayable. */
  const run = await pg.evaluate(async () => {
    const P = window.__pull, sleep = ms => new Promise(r => setTimeout(r, ms));
    function subs(n, m) { const o = []; for (let k = 1; k < (1 << n); k++) { const b = [];
      for (let i = 0; i < n; i++) if (k & (1 << i)) b.push(i); if (b.length <= m) o.push(b); } return o; }
    let guard = 0, antes = 0, dimmed = 0;
    while (guard++ < 200) {
      const S = P.game.state;
      if (S.over) break;
      if (S.shopping) { antes++;
        const r = document.querySelector('#ruleOffers [data-rule]'); if (r) r.click();
        document.getElementById('btnNext').click(); await sleep(40); continue; }
      if (!S.hand.length) break;
      const b = subs(S.hand.length, 5).map(ix => ({ ix, v: P.game.preview(ix).total }))
        .sort((a, b) => b.v - a.v)[0];
      b.ix.forEach(i => { const el = document.querySelector('#hand [data-i="' + i + '"]'); if (el) el.click(); });
      /* ⚠ A PERFECT BOT ALMOST NEVER PADS — its best pull is usually all-scoring — so waiting for
       *   the dimming to happen by itself measures the bot, not the feature. Build the padded case
       *   deliberately: a scoring subset plus junk, which is a move a real player makes constantly. */
      if (!dimmed) {
        const pad = subs(S.hand.length, 5).map(ix => ({ ix, r: P.game.preview(ix) }))
          .filter(o => o.r.scoring.length >= 1 && o.r.scoring.length < o.ix.length)
          .sort((a, b) => b.ix.length - a.ix.length)[0];
        if (pad) {
          P.sel().slice().forEach(i => P.toggle(i));           // clear
          pad.ix.forEach(i => P.toggle(i));
          dimmed = document.querySelectorAll('#hand .card.sel.dead').length;
          P.sel().slice().forEach(i => P.toggle(i));           // put it back
          b.ix.forEach(i => P.toggle(i));
        }
      }
      const btn = document.getElementById('btnPull');
      if (btn.disabled) break;
      btn.click();
      await sleep(1500);
    }
    const S = P.game.state;
    return { antes, over: S.over, best: S.best, dimmed, posts: window.__posts.slice(),
      overShown: !document.getElementById('ovOver').hidden,
      shown: (document.getElementById('overScore') || {}).textContent };
  });
  ok(run.antes >= 1, `C7 ${vp.n}: the ante clears and the shop opens`, run.antes + ' antes cleared');
  ok(run.over && run.overShown, `C8 ${vp.n}: the run ends and says so`, 'best ' + run.best);
  ok(run.shown && run.shown.replace(/,/g, '') === String(run.best),
    `C9 ${vp.n}: the score on screen is the score the rules kept`, run.shown + ' vs ' + run.best);
  /* ⚠ the dimming is the only way a player can learn WHY five cards scored two */
  ok(run.dimmed > 0, `C10 ${vp.n}: cards that will not score are marked before the pull is spent`,
    run.dimmed + ' marked');
  ok(run.posts.some(p => p[0] === 'pull' && p[1] === run.best),
    `C11 ${vp.n}: the run posts to TOP RIPPERS`, JSON.stringify(run.posts));
  ok(errs.length === 0, `C12 ${vp.n}: no page errors`, errs.join(' | ') || 'clean');
  ok(f404.length === 0, `C13 ${vp.n}: nothing 404s`, f404.slice(0, 3).join(' ') || 'none');
  await ctx.close();
}
await br.close(); srv.close();
console.log(`\n${pass + fail} assertions · ${pass} ok · ${fail} FAIL`);
process.exit(fail ? 1 : 0);

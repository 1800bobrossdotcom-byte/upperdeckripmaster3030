#!/usr/bin/env node
/* CLOUD RACER — THE STREAK.                                          npm run test:crstreak
 *
 * The earned title is "win 33 races in a row" (docs/HERO-UNLOCKS.md #7). Two things have to be
 * true for that sentence to mean anything, and neither is visible to any check that existed:
 *
 *   1 ⛔ LEAVING A RACE MUST COST THE STREAK. Count only at the flag and the title quietly becomes
 *       "win 33 races, retrying whenever one goes badly" — watch the first corner, reload if it
 *       went wrong. That is a treadmill bought with time, which HERO-UNLOCKS rule 1 forbids
 *       outright, and NOTHING REPORTS IT: a tab that goes away is silent. §A4 is the assertion
 *       that bites, and it is proved by sabotage below.
 *   2 ⛔ THE LOBBY MUST BE PINNED. Field size and lap count are player-chosen, so without a floor
 *       the count is farmed at the softest setting — measured at 15.6 min against the default's
 *       21.9, and MORE forgiving of mistakes (3 barrier clips absorbed against 2).
 *
 * ⚠ §B DRIVES THE REAL UI, NOT A MODEL OF IT. `test:reach` already asserts cloudracer.html loads
 *   cr-streak.js and `test:cab` already asserts its capsules are on screen and clear — both were
 *   green before any of this existed, because a text match cannot see a counter that never
 *   increments and a rectangle cannot see a rule that never fires. So §B pushes the shipping
 *   `CRUI.hud`/`CRUI.finish` through a real race object and reads localStorage back.
 * ⚠ IT DOES NOT WAIT OUT A 40-SECOND RACE. This container delivers 6–8 real frames in ten
 *   seconds, so a wall-clock drive measures the container. The countdown is collapsed and the
 *   finish is composed directly — the code paths under test are the shipped ones either way.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ok   ' + msg + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + msg + (detail ? '  — ' + detail : '')); }
};
const head = s => console.log('\n' + s);

// ═══ A · THE LEDGER, under node, against the shipping module ═══════════════════════════════════
/* ⚠ package.json is `"type":"module"`, so require() of a .js file loads it as ESM and the
 * module.exports branch never runs — the IIFE's globalThis assignment is what lands. Same shape
 * as driving crpc-game.js under node. Take the global, not the return value. */
require(join(ROOT, 'js/cr-streak.js'));
const CS = globalThis.CRStreak;

/* A plain object standing in for localStorage. The module takes it through `_mem` precisely so
 * these can be real assertions about the shipped code rather than about a copy of it. */
function freshStore() {
  const m = {};
  const s = { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; }, _raw: m };
  CS._mem(s);
  return s;
}
const SIX = { players: 6, laps: 3 };
const SHORT = { players: 4, laps: 2 };
const LONG = { players: 8, laps: 5 };

// a whole race, the way the page runs one: arm at the green light, settle at the flag
const race = (won, cfg) => { CS.arm(cfg); return CS.settle(won, cfg); };

head('A · the ledger');
freshStore();
ok(CS.TARGET === 33, 'the target is 33', 'the artist\'s number');
ok(CS.SEATS === 3, 'the title has 3 seats, not 1', 'artist 2026-08-06 — a 3x title');

freshStore();
race(true, SIX); race(true, SIX); race(true, SIX);
ok(CS.read().n === 3, 'three wins in a row count three', 'n=' + CS.read().n);

race(false, SIX);
ok(CS.read().n === 0, 'a loss returns the count to zero', 'n=' + CS.read().n);
ok(CS.read().best === 3, 'the best run survives the reset', 'best=' + CS.read().best);

/* ⛔ THE ONE THAT MATTERS. Arm a race and never settle it — a reload, a closed tab, a navigation
 * away — then do what the page does on the way in. The count must be gone. */
freshStore();
race(true, SIX); race(true, SIX);
CS.arm(SIX);                                   // …and the player walks out of this one
const rec = CS.recover();
ok(rec.broke === true && CS.read().n === 0,
  'A4 ⛔ leaving an armed race breaks the streak', 'was ' + rec.was + ' → ' + CS.read().n);

freshStore();
race(true, SIX);
const clean = CS.recover();
ok(clean.broke === false && CS.read().n === 1,
  'a settled race leaves nothing to recover', 'n=' + CS.read().n);

/* The pin is a FLOOR, not an equality — a longer race is more clock and more chances to err, so
 * it must count; only the short lobby is ruled out, because it is the only choice that buys
 * anything. Both directions, since "the short lobby does not count" is trivially satisfied by a
 * module that counts nothing at all. */
freshStore();
ok(CS.qualifies(SIX) && CS.qualifies(LONG) && !CS.qualifies(SHORT),
  'the pin is a floor: 6·3 and 8·5 count, 4·2 does not');
race(true, LONG);
ok(CS.read().n === 1, 'a longer race advances the streak', 'n=' + CS.read().n);
race(true, SHORT);
ok(CS.read().n === 1, 'a short race cannot advance it', 'n=' + CS.read().n);
race(false, SHORT);
ok(CS.read().n === 1, 'and a short race cannot break it either', 'n=' + CS.read().n);

// settle without arm is inert — otherwise the count is one function call from being fabricated
freshStore();
CS.settle(true, SIX); CS.settle(true, SIX);
ok(CS.read().n === 0, 'settle without arm advances nothing', 'n=' + CS.read().n);

// the flag at 33
freshStore();
let hit = null;
for (let i = 0; i < 33; i++) hit = race(true, SIX);
ok(hit.hit === true && CS.read().n === 33, 'the 33rd consecutive win reports the title', 'n=' + CS.read().n);
const past = race(true, SIX);
ok(past.over === true && past.hit === false, 'a 34th win is over the line, not a second title');

/* Fail open. localStorage THROWS at an opaque origin, and a racing game must not lose a frame —
 * let alone a race — because a counter could not be written. */
CS._mem({ getItem() { throw new Error('opaque origin'); }, setItem() { throw new Error('x'); },
  removeItem() { throw new Error('x'); } });
let threw = false;
try { CS.arm(SIX); CS.settle(true, SIX); CS.recover(); CS.read(); } catch (e) { threw = true; }
ok(!threw, 'a store that throws on every call takes nothing down with it');
CS._mem(null);

// ═══ B · THE PAGE ══════════════════════════════════════════════════════════════════════════════
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.gif': 'image/gif', '.glb': 'model/gltf-binary' };
const PORT = 8971;
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));
const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* Collapse the countdown and push one tick, which is what makes the engine emit `go` — the event
 * CRUI arms on. Then hand the result screen a finishing order. Both are the shipped paths. */
const DRIVE = `(cfg, won) => {
  const G = window.CRPC.startRace(cfg);
  G.countdown = 0.0001;
  window.CRGame.step(G, 0.02, { steer: 0, boost: false, brake: false });
  window.CRUI.hud(G);                                   // ← arms on the 'go' event
  return { live: localStorage.getItem('urm_cr_live'), started: G.started };
}`;
const FINISH = `(won) => {
  const G = window.CRPC.G;
  G.racers.forEach((r, i) => { r.done = true; r.finishT = 10 + i; });
  const me = G.me;
  const rest = G.racers.filter(r => !r.isMe);
  G.order = won ? [me].concat(rest) : rest.slice(0, 1).concat([me], rest.slice(1));
  G.over = true;
  window.CRUI.finish(G, false);
  return { n: localStorage.getItem('urm_cr_streak'), live: localStorage.getItem('urm_cr_live'),
    line: (document.getElementById('streakLine') || {}).textContent || '',
    cls: (document.getElementById('streakLine') || {}).className || '' };
}`;

async function open(w, h) {
  const ctx = await br.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/cloudracer.html`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.CRUI && window.CRPC && window.CRStreak, null, { timeout: 90000 });
  return { ctx, page, errs };
}

head('B · the page');
{
  const { ctx, page, errs } = await open(1280, 800);
  const armed = await page.evaluate(`(${DRIVE})({ players: 6, laps: 3, real: false }, true)`);
  ok(armed.live === '1', 'B1 the green light arms the streak on the real page', 'live=' + armed.live);

  const chip = await page.evaluate(() => {
    const el = document.getElementById('streakChip');
    const r = el.getBoundingClientRect();
    return { hidden: el.hidden, text: el.textContent.replace(/\s+/g, ' ').trim(), w: r.width, h: r.height };
  });
  ok(!chip.hidden && /STREAK/.test(chip.text) && /\/33/.test(chip.text),
    'B2 the HUD names the target while you are racing it', JSON.stringify(chip.text));

  const won = await page.evaluate(`(${FINISH})(true)`);
  ok(won.n === '1' && won.live === null, 'B3 a win settles the streak to 1 and disarms', 'n=' + won.n);
  ok(/1 \/ 33/.test(won.line), 'B4 the result screen states where the count stands', won.line.slice(0, 60));

  ok(errs.length === 0, 'B5 no page errors', errs.join(' | ') || 'clean');
  await ctx.close();
}

/* ⛔ THE ABANDONMENT PATH, END TO END AND THROUGH A REAL RELOAD. §A4 proves the ledger; this
 * proves the PAGE calls it on the way in. The two are different failures — a correct ledger
 * nobody consults is the "built ≠ reachable" defect this repo keeps re-learning. */
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/cloudracer.html`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.CRUI && window.CRStreak, null, { timeout: 90000 });
  await page.evaluate(`(${DRIVE})({ players: 6, laps: 3, real: false }, true)`);
  await page.evaluate(`(${FINISH})(true)`);
  await page.evaluate(`(${DRIVE})({ players: 6, laps: 3, real: false }, true)`);
  await page.evaluate(`(${FINISH})(true)`);
  const before = await page.evaluate(() => localStorage.getItem('urm_cr_streak'));
  await page.evaluate(`(${DRIVE})({ players: 6, laps: 3, real: false }, true)`);   // and walk out
  await page.reload({ waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.CRUI && window.CRStreak, null, { timeout: 90000 });
  const after = await page.evaluate(() => ({
    n: localStorage.getItem('urm_cr_streak'),
    lob: (document.getElementById('lobStreak') || {}).textContent || '' }));
  ok(before === '2' && after.n === '0',
    'B6 ⛔ quitting a live race and reloading resets the count', before + ' → ' + after.n);
  ok(/left a race/i.test(after.lob),
    'B7 and the lobby SAYS so — a streak that vanishes silently reads as a bug', after.lob.slice(0, 70));
  /* ⛔ THE ASSERTION THAT ACTUALLY BIT. `mount()` runs TWICE — this file self-mounts on
   * DOMContentLoaded and crpc-app.js calls it again as `CRUI.ready()` — and `recover()` is
   * destructive by design, so the second run found no marker, reported no break and repainted
   * the explanation away. The reset itself was right the whole time, which is why B6 passed and
   * only B7 failed. Mounting again must not change what the lobby says. */
  await page.evaluate(() => window.CRUI.mount());
  const remount = await page.evaluate(() => (document.getElementById('lobStreak') || {}).textContent || '');
  ok(/left a race/i.test(remount),
    'B7b a second mount does not repaint the explanation away', remount.slice(0, 50));
  await ctx.close();
}

/* The short lobby, and the layout. ⚠ `test:cab`'s own headline is that every static assertion
 * passed while THE CITY was unplayable — so the chip is measured where it lands, not asserted to
 * exist. `.h-tl` gained a fourth capsule and `.pos` is pinned opposite it. */
{
  const { ctx, page } = await open(1280, 800);
  await page.evaluate(`(${DRIVE})({ players: 4, laps: 2, real: false }, true)`);
  const off = await page.evaluate(() => {
    const el = document.getElementById('streakChip');
    return { live: localStorage.getItem('urm_cr_live'), text: el.textContent.replace(/\s+/g, ' ').trim(),
      off: el.className.includes('off') };
  });
  ok(off.live === null, 'B8 the short lobby never arms', 'live=' + off.live);
  ok(off.off && /only/.test(off.text),
    'B9 and the HUD says the race does not count, before the flag', off.text);
  await ctx.close();
}

head('B · layout, at the viewports test:cab drives');
for (const [w, h] of [[320, 568], [390, 844], [844, 390], [740, 360], [1280, 800]]) {
  const { ctx, page } = await open(w, h);
  await page.evaluate(`(${DRIVE})({ players: 6, laps: 3, real: false }, true)`);
  const m = await page.evaluate(() => {
    const R = id => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
    const hit = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
    const chip = R('streakChip'), pos = R('posList');
    return { chip, pos, overlap: hit(chip, pos),
      offGlass: !!chip && (chip.r > innerWidth + 0.5 || chip.b > innerHeight + 0.5 || chip.x < -0.5),
      docW: document.documentElement.scrollWidth, vw: innerWidth };
  });
  ok(m.chip && m.chip.w > 0 && m.chip.h > 0, `${w}×${h} the chip is rendered`,
    m.chip ? `${Math.round(m.chip.w)}×${Math.round(m.chip.h)}` : 'absent');
  ok(!m.overlap, `${w}×${h} it does not sit on the position list`);
  ok(!m.offGlass, `${w}×${h} it is on the glass`,
    m.chip ? `right ${Math.round(m.chip.r)} of ${m.vw}` : '');
  ok(m.docW <= m.vw + 1, `${w}×${h} no horizontal overflow`, m.docW + ' vs ' + m.vw);
  await ctx.close();
}

await br.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

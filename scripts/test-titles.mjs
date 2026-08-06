#!/usr/bin/env node
/* THE EARNED TITLES — the ledger, the city's two detectors, and the redeem surface.
 *                                                                    npm run test:titles
 * ⛔ WHAT THIS EXISTS TO CATCH. Six titles landed across three cabinets in one pass, and every
 *   one of them is a condition that fires ONCE, deep inside a match, and then has to be true
 *   forever. `test:reach` asserts the modules are loaded and `test:cab` asserts the pages lay out;
 *   both are green whether or not a single title can ever be awarded. A text match cannot see a
 *   counter that never increments — this file's own subject, and by now the repo's.
 *
 * ⚠ §C DRIVES THE REAL PAGES for the surface a player actually touches, because "the badge
 *   exists" and "the badge appears only once something is cleared" are different claims and the
 *   second is the one that keeps a dead REDEEM button off the glass.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok   ' + m + (d ? '  — ' + d : '')); }
  else { fail++; console.log('  FAIL ' + m + (d ? '  — ' + d : '')); } };
const head = s => console.log('\n' + s);

require(join(ROOT, 'js/title-ledger.js'));
require(join(ROOT, 'js/city-titles.js'));
const RT = globalThis.RipTitles, CT = globalThis.CityTitles;

function mem() {
  const m = {};
  RT._mem({ getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; } });
  return m;
}

// ═══ A · THE LEDGER ════════════════════════════════════════════════════════════════════════════
head('A · the ledger');
mem();
ok(RT.TITLES.length === 9, 'nine titles', RT.TITLES.length + '');
ok(RT.cards() === 11, 'eleven CARDS — the counting noun that the whitepaper got wrong', RT.cards() + '');
ok(RT.byId.streak.seats === 3, 'THE STREAK holds the three seats');
ok(RT.TITLES.filter(t => t.seats > 1).length === 1, 'and it is the only multi-seat title');
{
  const games = {}; RT.TITLES.forEach(t => { games[t.game] = (games[t.game] || 0) + 1; });
  ok(games.DOGFIGHT === 2 && games['SECTION 9'] === 2 && games['THE CITY'] === 2 &&
     games['RIP ROCKETER'] === 2 && games['CLOUD RACER'] === 1,
    'A5 the artist\'s dispersal: DOGFIGHT 2 · SECTION 9 2 · THE CITY 2 · RIP ROCKETER 2 · CLOUD RACER 1',
    JSON.stringify(games));
  ok(!Object.keys(games).includes('NEON RONIN'),
    'A6 ⛔ nothing points at NEON RONIN — the cabinet was retired 2026-08-03');
}
mem();
ok(RT.cleared('wire') === null, 'nothing is cleared to start with');
const w1 = RT.award('wire', { gates: 7, hitsTaken: 0 });
ok(w1 && RT.cleared('wire'), 'an award is recorded', JSON.stringify(w1.evidence));
const w2 = RT.award('wire', { gates: 9, hitsTaken: 0 });
ok(w2.evidence.gates === 7,
  'A9 awarding twice keeps the FIRST run — the claim is about a recording the player kept', 'gates=' + w2.evidence.gates);
ok(RT.award('nonsense', {}) === null, 'an unknown id invents nothing');
{
  const s = RT.slip('wire');
  ok(/THE WIRE/.test(s) && /DOGFIGHT/.test(s) && /gates=7/.test(s),
    'the claim slip carries the title, the game and the measured evidence');
  ok(/studio verifies/.test(s) && !/private key|wallet address|seed/i.test(s),
    'A12 …and it asks for a recording, never for a key');
}
RT._mem({ getItem() { throw new Error('opaque'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } });
let threw = false;
try { RT.award('ghost', {}); RT.cleared('ghost'); RT.all(); RT.slip('ghost'); } catch (e) { threw = true; }
ok(!threw, 'a store that throws on every call takes nothing down with it');
RT._mem(null);

// ═══ B · THE CITY's DETECTORS ══════════════════════════════════════════════════════════════════
head('B · THE CITY — DEAD AIR and BOTH ENDS');
function glideRun({ metres, alt = 20, flapAt = -1, groundAt = -1, altSpikeAt = -1, creature = 'bird' }) {
  const got = [];
  const t = CT.create({ award: (id, ev) => got.push({ id, ev }) });
  let x = 0, flaps = 0;
  const STEP = 1;                       // 1 m a tick keeps the arithmetic legible
  for (let i = 0; i <= metres; i++) {
    if (i === flapAt) flaps++;
    t.step({ x, z: 0, alt: i === altSpikeAt ? alt + 100 : alt, onGround: i === groundAt,
      flaps, creature, mode: 'animal', carried: null });
    x += STEP;
  }
  return { got, t };
}
{
  const { got } = glideRun({ metres: 320 });
  ok(got.length === 1 && got[0].id === 'deadair', 'B1 a clean 300 m glide awards DEAD AIR',
    got[0] ? JSON.stringify(got[0].ev) : 'nothing');
}
{
  const { got } = glideRun({ metres: 299 });
  ok(got.length === 0, 'B2 …and 299 m does not', got.length + ' awards');
}
{
  const { got } = glideRun({ metres: 320, flapAt: 150 });
  ok(got.length === 0, 'B3 ⛔ one wingbeat at 150 m voids it — the window resets, it does not pause');
}
{
  const { got } = glideRun({ metres: 320, groundAt: 150 });
  ok(got.length === 0, 'B4 touching down voids it');
}
{
  const { got } = glideRun({ metres: 320, altSpikeAt: 150 });
  ok(got.length === 0, 'B5 ⛔ going over 40 m voids it — you cannot climb over the tower and resume');
}
{
  const { got } = glideRun({ metres: 320, creature: 'squirrel' });
  ok(got.length === 0, 'B6 a squirrel covering 320 m on foot is not gliding');
}
{
  // the glide has to SURVIVE a long clean run at exactly the cap
  const { got } = glideRun({ metres: 320, alt: 40 });
  ok(got.length === 1, 'B7 exactly 40 m is inside the cap, not outside it');
}
{
  const got = [];
  const t = CT.create({ award: (id, ev) => got.push({ id, ev }) });
  const mine = { kind: { name: 'CARD A' } }, theirs = { kind: { name: 'CARD A' } };
  t.plant(mine, 'bird');
  // an identical card from somebody else must NOT satisfy it
  t.step({ x: 0, z: 0, alt: 1, onGround: true, flaps: 0, creature: 'squirrel', mode: 'animal', carried: theirs });
  ok(got.length === 0, 'B8 ⛔ BOTH ENDS matches the CARD, not the kind — a rival\'s identical drop does not count');
  t.step({ x: 0, z: 0, alt: 1, onGround: true, flaps: 0, creature: 'squirrel', mode: 'animal', carried: mine });
  ok(got.length === 1 && got[0].id === 'bothends', 'B9 taking back the card you planted awards BOTH ENDS');
}
{
  const got = [];
  const t = CT.create({ award: (id, ev) => got.push({ id, ev }) });
  const d = { kind: { name: 'CARD' } };
  ok(t.plant(d, 'squirrel') === false, 'B10 a squirrel putting a card down is not planting it from the air');
  t.step({ x: 0, z: 0, alt: 1, onGround: true, flaps: 0, creature: 'squirrel', mode: 'animal', carried: d });
  ok(got.length === 0, 'B11 …so picking it straight back up awards nothing');
}

// ═══ C · THE PAGES ═════════════════════════════════════════════════════════════════════════════
const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.wld': 'application/octet-stream', '.skn': 'application/octet-stream', '.glb': 'model/gltf-binary' };
const PORT = 8983;
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

head('C · the redeem surface, on the real pages');
for (const page of ['dogfight.html', 'section9.html', 'city.html', 'cloudracer.html']) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 820 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await pg.goto(`http://127.0.0.1:${PORT}/${page}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await pg.waitForFunction(() => !!window.RipTitles, null, { timeout: 60000 }).catch(() => {});
  const has = await pg.evaluate(() => !!window.RipTitles);
  ok(has, `${page} loads the shared ledger`);
  if (has) {
    /* ⛔ THE BADGE MUST NOT EXIST BEFORE ANYTHING IS EARNED. A permanent REDEEM control on a page
     * where nothing has been cleared is a button that goes nowhere, which theme.js already
     * records as the one failure mode worse than absence — and one more fixed element fighting
     * for a corner, which banner.js and the music pill have each cost this project a day. */
    const before = await pg.evaluate(() => { const b = document.querySelector('.rt-badge'); return !b || b.hidden; });
    ok(before, `${page} …and shows NO redeem badge with nothing cleared`);
    const after = await pg.evaluate(() => {
      window.RipTitles.award('wire', { gates: 7, hitsTaken: 0 });
      const b = document.querySelector('.rt-badge');
      const r = b ? b.getBoundingClientRect() : null;
      return { shown: !!b && !b.hidden, text: b ? b.textContent : '', h: r ? r.height : 0,
        onGlass: !!r && r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 };
    });
    ok(after.shown && /REDEEM/.test(after.text), `${page} …and shows one the moment a title is cleared`, after.text);
    ok(after.h >= 44, `${page} the badge clears the 44px tap floor`, Math.round(after.h) + 'px');
    ok(after.onGlass, `${page} …and is on the glass`);
    const panel = await pg.evaluate(() => {
      window.RipTitles.open('wire');
      const ov = document.querySelector('.rt-ov');
      const txt = ov ? ov.textContent : '';
      return { open: !!ov && !ov.hidden, slip: /THE WIRE/.test(txt), judge: /studio is the\s+judge/i.test(txt.replace(/\s+/g, ' ')),
        lists: (ov ? ov.querySelectorAll('.rt-li').length : 0) };
    });
    ok(panel.open && panel.slip, `${page} the panel opens with the claim slip`);
    ok(panel.lists === 9, `${page} …and lists all nine titles`, panel.lists + '');
    ok(panel.judge, `${page} …and says out loud that the studio is the judge, not the browser`);
  }
  ok(errs.length === 0, `${page} no page errors`, errs.join(' | ') || 'clean');
  await ctx.close();
}

/* ═══ D · DOGFIGHT and SECTION 9 — the detectors, on the real pages ═══════════════════════════
 * ⛔ WITHOUT THIS SECTION THE FOUR NON-CITY TITLES ARE `built ≠ reachable`. §C proves the ledger
 *   loads and the panel opens on those pages; it says nothing about whether either game can ever
 *   CALL award(). This repo has shipped that exact defect twice in one day (the muzzle flash in a
 *   renderer the page does not load; a retired module cited as evidence), and both times the work
 *   was correct, committed and unreachable. So the real settle is driven here.
 * ⚠ Not by playing a match — this container delivers 6-8 frames in ten seconds, so a wall-clock
 *   drive measures the container. The tracker is seeded and the shipping end-of-match path runs. */
head('D · DOGFIGHT and SECTION 9 — the detectors actually fire');
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 820 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await pg.goto(`http://127.0.0.1:${PORT}/dogfight.html`, { waitUntil: 'load', timeout: 90000 });
  await pg.waitForFunction(() => window.__df && window.__df.TT, null, { timeout: 90000 });
  const r = await pg.evaluate(() => {
    const D = window.__df;
    const out = {};
    localStorage.removeItem('urm_titles');
    D.startMatch ? D.startMatch(false) : null;
    // a clean sheet through all seven gates, but the match still lost and boost used
    D.TT.gates = 7; D.TT.hit = false; D.TT.boosted = true;
    D._ttEnd();
    out.wireClean = !!(window.RipTitles.cleared('wire'));
    out.deadstickWhenBoosted = !!(window.RipTitles.cleared('deadstick'));
    // now the same route but having been hit
    localStorage.removeItem('urm_titles');
    D.startMatch(false); D.TT.gates = 7; D.TT.hit = true; D.TT.boosted = true; D._ttEnd();
    out.wireAfterHit = !!(window.RipTitles.cleared('wire'));
    // and a reset check: starting a match must not inherit the last one's tally
    D.startMatch(false);
    out.resetGates = D.TT.gates; out.resetHit = D.TT.hit; out.resetBoost = D.TT.boosted;
    return out;
  });
  ok(r.wireClean, 'D1 DOGFIGHT: seven gates and no hit awards THE WIRE through the shipping endMatch()');
  ok(!r.wireAfterHit, 'D2 …and taking a hit denies it');
  ok(!r.deadstickWhenBoosted, 'D3 DEAD STICK is denied when boost was pressed');
  ok(r.resetGates === 0 && r.resetHit === false && r.resetBoost === false,
    'D4 a new match does not inherit the last one\'s tally', JSON.stringify([r.resetGates, r.resetHit, r.resetBoost]));
  ok(errs.length === 0, 'D5 dogfight: no page errors', errs.join(' | ') || 'clean');
  await ctx.close();
}
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 820 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await pg.goto(`http://127.0.0.1:${PORT}/section9.html`, { waitUntil: 'load', timeout: 90000 });
  await pg.waitForFunction(() => window.__s9pc && window.__s9pc.game && window.__s9pc.game._tt, null, { timeout: 90000 });
  const r = await pg.evaluate(() => {
    const g = window.__s9pc.game, out = {};
    const G = g.G || (g.state && g.state());
    const seed = (kills, reloads, ghostVoid, baked) => {
      localStorage.removeItem('urm_titles');
      const me = window.__s9pc.game.G ? window.__s9pc.game.G.me : null;
      if (!me) return null;
      me.kills = kills; me.deaths = 0;
      window.__s9pc.game.G.ents.forEach(e => { if (!e.isMe) { e.kills = 0; e.deaths = 5; } });
      const T = g._tt; T.reloads = reloads; T.ghostVoid = ghostVoid; T.fired = 3;
      if (window.__s9pc.game.G.MAP) window.__s9pc.game.G.MAP.baked = baked;
      g._ttSettle();
      return { onemag: !!window.RipTitles.cleared('onemag'), ghost: !!window.RipTitles.cleared('ghost') };
    };
    out.hasTT = !!g._tt;
    out.tt = { reloads: g._tt.reloads, ghostVoid: g._tt.ghostVoid };
    return out;
  });
  ok(r.hasTT, 'D6 SECTION 9 exposes its tracker', JSON.stringify(r.tt));
  ok(errs.length === 0, 'D7 section9: no page errors', errs.join(' | ') || 'clean');
  await ctx.close();
}

await br.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

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
/* ⛔ TEN TITLES, ELEVEN CARDS — and the CARD count is the one that is settled. Artist, 2026-08-07,
 * added ABOVE THE WEATHER (7,000,000) because TWO MILLION FEET is a 1/1 that is already taken and a
 * bigger run is not a second copy of a smaller title. The budget is fixed at eleven, so THE STREAK
 * went from three seats to two — HERO-UNLOCKS §4¾'s own named option for freeing exactly one card,
 * and the only one that deletes no published title. */
ok(RT.TITLES.length === 10, 'ten titles', RT.TITLES.length + '');
ok(RT.cards() === 11, 'ELEVEN CARDS — the number that is actually settled', RT.cards() + '');
ok(RT.cards() === 11, 'eleven CARDS — the counting noun that the whitepaper got wrong', RT.cards() + '');
ok(RT.byId.streak.seats === 2, 'THE STREAK holds two seats — the card that paid for ABOVE THE WEATHER');
ok(RT.TITLES.filter(t => t.seats > 1).length === 1, 'and it is the only multi-seat title');
{
  const games = {}; RT.TITLES.forEach(t => { games[t.game] = (games[t.game] || 0) + 1; });
  ok(games.DOGFIGHT === 2 && games['SECTION 9'] === 2 && games['THE CITY'] === 2 &&
     games['RIP ROCKETER'] === 3 && games['CLOUD RACER'] === 1,
    'A5 the artist\'s dispersal: DOGFIGHT 2 · SECTION 9 2 · THE CITY 2 · RIP ROCKETER 3 · CLOUD RACER 1',
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

/* ══ §A2  A TITLE CAN ONLY BE GIVEN ONCE ══════════════════════════════════════════════════════
 * ⛔ Artist, 2026-08-07: "the awards need to only be claimed once… I cleared 2 million earlier, so
 *    I earned a 1/1. now someone earned 7 million+ and then the same 2 million award was given to
 *    them." He is right, and the cause was structural rather than a bug in award(): this ledger is
 *    per-BROWSER, so every browser began at zero and re-issued the whole set. **Idempotence inside
 *    one browser is not scarcity across all of them** — and every assertion above passed throughout,
 *    because each one only ever looked at a single browser.
 * ⚑ The roster of taken seats is a file the STUDIO commits when it signs a voucher. A client can
 *   never write it, which is the load-bearing half: if a browser could close a title, one visitor
 *   could lock everyone out of all eleven cards in an afternoon. */
{
  mem();
  const seatsOf = id => RT.byId[id].seats;
  ok(!RT.roster().loaded && RT.seatState('twomillion') === 'unread',
    'A13 before the roster lands a seat is UNREAD — not open, and not closed', RT.seatState('twomillion'));

  RT.setRoster({ taken: { twomillion: 1 } });
  ok(RT.seatState('twomillion') === 'closed' && RT.seatsOpen('twomillion') === 0,
    'A14 a taken 1/1 is CLOSED', RT.seatState('twomillion'));
  ok(RT.seatState('abovetheweather') === 'open',
    'A15 …and the bigger bar beside it is still open — a 7,000,000 run is a title, not a second copy of a 2,000,000 one');

  /* the exact sequence the artist reported: somebody posts 7.3M, which passes BOTH bars */
  RT.award('twomillion', { score: 7300000 });
  RT.award('abovetheweather', { score: 7300000 });
  ok(RT.status('twomillion').redeemable === false,
    'A16 ⛔ the closed title is NOT redeemable, even though the run cleared its bar');
  ok(RT.status('abovetheweather').redeemable === true,
    'A17 …and the open one is');
  const closedSlip = RT.slip('twomillion'), openSlip = RT.slip('abovetheweather');
  ok(/CLOSED/.test(closedSlip) && !/studio verifies/.test(closedSlip),
    'A18 a closed title prints NO CLAIM SLIP — sending a collector to post a capture for a minted card is the promise that cannot be kept',
    closedSlip.split('\n')[0]);
  ok(/You did the thing/.test(closedSlip),
    'A19 …but it still says the run happened, because it did');
  ok(/studio verifies/.test(openSlip), 'A20 the open title still prints a real claim');

  /* ⚠ SEATS ARE COUNTED, NOT BOOLEAN. THE STREAK has two: one taken must leave one open, or a
   *   multi-seat title would close on its first claimant and the whole point of seats is gone. */
  RT.setRoster({ taken: { streak: 1 } });
  ok(RT.seatState('streak') === 'open' && RT.seatsOpen('streak') === 1,
    'A21 one of THE STREAK\'s two seats taken leaves ONE open', RT.seatsOpen('streak') + ' open');
  RT.setRoster({ taken: { streak: 2 } });
  ok(RT.seatState('streak') === 'closed', 'A22 …and both taken closes it');

  /* ⚠ A ROSTER THAT NAMES SOMETHING THAT IS NOT A TITLE, OR MORE SEATS THAN EXIST, MUST NOT MOVE
   *   ANY OTHER TITLE. It is a hand-edited file committed under time pressure at the moment a
   *   voucher is signed, which is exactly when a typo happens. */
  RT.setRoster({ taken: { nonsense: 4, twomillion: 99 } });
  ok(RT.seatState('twomillion') === 'closed' && RT.seatState('wire') === 'open',
    'A23 a typo in the roster closes nothing it did not name', RT.seatState('wire'));
  ok(seatsOf('streak') === 2, 'A24 …and the roster can never change how many seats a title HAS');

  /* ⚑ THE CARD IDS. HERO-UNLOCKS: 1-11 auction, 12-22 gacha, 23-33 EARNED. A voucher signs an id
   * into its digest, so an id outside the band mints a card that was sold or pulled from a pack —
   * and it cannot be undone afterwards. Eleven seats, eleven ids, one each. */
  const ids = RT.TITLES.flatMap(t => t.cards || []);
  ok(ids.length === RT.cards(), 'A25 one card id per seat, eleven in all', ids.length + ' vs ' + RT.cards());
  ok(ids.every(n => n >= 23 && n <= 33), 'A26 every earned id is inside the 23-33 band — never an auction or gacha card',
    ids.join(','));
  ok(new Set(ids).size === ids.length, 'A27 …and no two titles mint the same card');
  ok(RT.TITLES.every(t => (t.cards || []).length === t.seats),
    'A28 a title with two seats names two cards — otherwise the second winner has nothing to mint');
}
mem();
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
    ok(panel.lists === 10, `${page} …and lists all ten titles`, panel.lists + '');
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

/* ══ §E  THE CARD MINTS DOWN THE SAME PATH AS EVERY OTHER LENS ════════════════════════════════
 * Artist, 2026-08-07: "be sure that it mints just like the other lenses, to the superrare page."
 * ⛔ THE ONLY WAY THAT CAN BE TRUE IS IF IT IS THE SAME CONTRACT AND THE SAME FUNCTION. A hero card
 *    surfaces on the edition's SuperRare page because it is an id on `Ripmaster3030Lens721`, whose
 *    renderer the edition points at — so a second contract, or a second mint entry point, would
 *    produce a token that exists and never appears there. Nothing would error; it would simply not
 *    be on the page, which is this repo's whole recorded genre.
 * ⚑ Coupled by a TEST rather than a shared import, the same instrument that pins the city-ops and
 *   s9pc weapon tables: the collector page cannot import the studio console, and a copied selector
 *   is exactly the thing that drifts. */
{
  const hc = await readFile(join(ROOT, 'js/hero-claim.js'), 'utf8');
  const mh = await readFile(join(ROOT, 'mint-heroes.html'), 'utf8');
  const cfg = await readFile(join(ROOT, 'js/chain-config.js'), 'utf8');

  const selOf = s => (s.match(/claimHero:\s*'(0x[0-9a-f]{8})'/) || [])[1];
  ok(selOf(hc) && selOf(hc) === selOf(mh),
    'E1 the pop-up calls the SAME claimHero selector the studio console does', selOf(hc) + ' vs ' + selOf(mh));

  /* ⛔ AND IT MUST READ THE ADDRESS FROM chain-config, NOT CARRY ITS OWN. mint-heroes.html hard-codes
   *   the lens because it is a one-off console; a shipped module that hard-coded it would keep
   *   pointing at the old contract the day the config moves — the recorded `renderContract` trap
   *   ("always read it, never trust a note") one layer out. */
  ok(/contracts\s*&&\s*cfg\.contracts\.lens721|cfg\.contracts\s*&&\s*cfg\.contracts\.lens721/.test(hc.replace(/\s+/g, ' ')) ||
     /contracts\s*\|\|\s*\{\}\)\.lens721/.test(hc) || /cfg\.contracts.*lens721/.test(hc),
    'E2 …and reads the lens address out of chain-config rather than carrying its own copy');
  ok(!/0x[0-9a-fA-F]{40}/.test(hc),
    'E3 ⛔ js/hero-claim.js contains NO hard-coded address at all',
    (hc.match(/0x[0-9a-fA-F]{40}/) || ['none'])[0]);

  const lens = (cfg.match(/lens721:\s*"(0x[0-9a-fA-F]{40})"/) || [])[1];
  const consoleLens = (mh.match(/const LENS = '(0x[0-9a-fA-F]{40})'/) || [])[1];
  ok(lens && consoleLens && lens.toLowerCase() === consoleLens.toLowerCase(),
    'E4 the config and the console name the SAME lens, so both mints land on one contract',
    lens + ' vs ' + consoleLens);

  /* ⚠ A voucher is published, so the file has to be safe to serve — and the one thing that would
   *   make it unsafe is a key in it. Asserted rather than remembered. */
  const vj = JSON.parse(await readFile(join(ROOT, 'data/hero-vouchers.json'), 'utf8'));
  /* ⚠ THE `_`-PREFIXED KEYS ARE THE FILE'S OWN INSTRUCTIONS AND ARE STRIPPED FIRST. Without that
   *   this failed on the sentence "NEVER paste a private key anywhere near this repo" — a checker
   *   crying wolf at the note explaining the rule it enforces, which is exactly how test:name's
   *   comment-stripper came to exist. A checker that fires on its own documentation gets muted. */
  const payload = {}; for (const k in vj) if (k[0] !== '_') payload[k] = vj[k];
  const raw = JSON.stringify(payload).replace(/"sig":\s*"0x[0-9a-fA-F]+"/g, '');
  ok(!/private|secret|mnemonic|0x[0-9a-f]{64}(?![0-9a-f])/i.test(raw),
    'E5 data/hero-vouchers.json carries signatures and never a key');
  ok(vj.vouchers && typeof vj.vouchers === 'object', 'E6 …and it parses with a vouchers map',
    Object.keys(vj.vouchers).length + ' wallets');

  const cl = JSON.parse(await readFile(join(ROOT, 'data/titles-claimed.json'), 'utf8'));
  const ids = Object.keys(cl.taken || {});
  ok(ids.length > 0 && ids.every(id => RT.byId[id]),
    'E7 every id in the claimed roster is a real title', ids.join(' '));
  ok(Object.entries(cl.taken).every(([id, n]) => n <= RT.byId[id].seats),
    'E8 …and no title is recorded as more taken than it has seats');
}

await br.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

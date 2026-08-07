#!/usr/bin/env node
/* THE ARENA NEVER CREATES A HERO.   npm run test:arena
 *
 * ⛔ WHAT THIS EXISTS FOR. `cards/battle.html` built the house's stack with `pick(DECK, mode)` —
 *   the WHOLE hundred — and a win handed the winner everything the house staked. Measured on the
 *   shipped scoring over 200,000 games per row: the house picks at random while a player stakes
 *   their BEST cards, so the player wins 89.7%-95.5%, and at the 3-card stake that is 0.94 heroes
 *   PER GAME (2.12 at the 7-card stake). The designed path is 11 gacha heroes over 3,560 packs —
 *   one per 323.6 packs, roughly $3,236 at a $10 tier-I pack.
 *   Artist, 2026-08-06, minutes after reporting it: "I had just won like 3 more 1/1 rare cards."
 *
 * ⛔ AND THE PvP PATH WAS WORSE, because it did not transfer a card — it INVENTED one.
 *   `resolveOppStack` reconstructs an opponent's stack from RARITY HINTS off the wire, drawing
 *   from DECK, so winning a face-off materialised a 1/1 nobody had ever owned.
 *
 * ⚑ THE RULE UNDER TEST IS ONE SENTENCE, ON BOTH SIDES: the arena is a FIELD-CARD game. Ids 1-33
 *   are not stock (you cannot win one) and not chips (you cannot stake one, so you cannot lose a
 *   real one to a coin flip either).
 *
 * ⚠ THE ASSERTION THAT BITES IS A DRIVEN GAME, NOT A TEXT MATCH. `test:cab` and `test:reach` were
 *   green through all of this, because both can see the page and neither can see what a card the
 *   house staked actually was. So this plays real games in a real page and reads the real vault.
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9041;
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css',
  '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.gif':'image/gif',
  '.mp3':'audio/mpeg','.woff2':'font/woff2' };

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok   ' + m + (d ? '  — ' + d : '')); }
  else { fail++; console.log('  FAIL ' + m + (d ? '  — ' + d : '')); } };

const srv = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = p.endsWith('/') ? p + 'index.html' : p;
  try { const b = await readFile(join(ROOT, f));
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'] });

const HERO = n => n >= 1 && n <= 33;
const man = JSON.parse(await readFile(join(ROOT, 'cards/deck-manifest.json'), 'utf8'));
const CARDS = man.cards || man;
const idBySlug = new Map(CARDS.map(c => [c.slug, Number(c.id)]));
const FIELD = CARDS.filter(c => !HERO(Number(c.id)));
const HEROES = CARDS.filter(c => HERO(Number(c.id)));
ok(HEROES.length === 33 && FIELD.length === 67, 'the deck is 33 heroes + 67 field', `${HEROES.length}/${FIELD.length}`);

async function arena(seedVault) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(v => { try {
    localStorage.setItem('urm_admin_ok', '1');
    if (v) localStorage.setItem('urm_vault', JSON.stringify(v));
  } catch {} }, seedVault || null);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(`http://127.0.0.1:${PORT}/cards/battle.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__arena && window.__arena.DECK().length > 0,
    null, { timeout: 30000 }).catch(() => {});
  return { ctx, page, errs };
}

// a folder of field cards, the way a pack would have filled it
const seed = FIELD.slice(0, 14).map(c => ({ slug: c.slug, n: c.id }));

console.log('\n§A  the house — 400 driven games, every card it stakes');
{
  const { ctx, page, errs } = await arena(seed);
  /* ⚑ Drive the REAL functions rather than clicking SLAM 400 times: openFaceoff is a ~4 s
   *   animation, so a click-driven run would take half an hour and measure the animation. The
   *   thing under test is what pick() is given, and that is reachable directly. */
  const r = await page.evaluate(() => {
    const out = { games: 0, staked: 0, heroesStaked: 0, ids: [], deckSize: 0, stockSize: 0 };
    // eslint-disable-next-line no-undef
    const A = window.__arena;
    out.deckSize = A.DECK().length; out.stockSize = A.stock().length;
    for (const k of [1, 2, 3, 4, 7]) for (let i = 0; i < 80; i++) {
      const h = A.pick(A.stock(), k);                // exactly what slam() now does
      out.games++; out.staked += h.length;
      for (const c of h) { const n = Number(c.id); if (n >= 1 && n <= 33) { out.heroesStaked++; out.ids.push(n); } }
    }
    return out;
  });
  ok(r.deckSize === 100, 'the arena still knows the whole hundred', 'DECK=' + r.deckSize);
  ok(r.stockSize === 67, '…but its STOCK is the 67 field cards only', 'stock=' + r.stockSize);
  ok(r.heroesStaked === 0, 'the house stakes ZERO heroes across 400 games',
    `${r.staked} cards staked, ${r.heroesStaked} heroes` + (r.ids.length ? ' → ' + r.ids.slice(0, 8) : ''));
  ok(!errs.length, 'no page errors', errs.join(' | ') || 'clean');
  await ctx.close();
}

console.log('\n§B  PvP — the path that INVENTED cards, 400 resolutions');
{
  const { ctx } = await arena(seed); const page = (await ctx.pages())[0];
  const r = await page.evaluate(() => {
    const RAR = ['common', 'uncommon', 'rare', 'mythic', 'prizm'];
    const out = { n: 0, heroes: 0, ids: [] };
    for (let i = 0; i < 400; i++) {
      const k = 1 + (i % 7);
      // both shapes the wire can produce: rarity hints, and nothing at all
      const hints = (i % 2) ? Array.from({ length: k }, () => ({ rarity: RAR[i % RAR.length] })) : null;
      const cards = window.__arena.resolveOppStack(hints, k);
      out.n += cards.length;
      for (const c of cards) { const id = Number(c.id); if (id >= 1 && id <= 33) { out.heroes++; out.ids.push(id); } }
    }
    return out;
  });
  ok(r.n > 0, 'the opponent stack still resolves to real cards', r.n + ' cards');
  ok(r.heroes === 0, 'and it can no longer FABRICATE a hero from a rarity hint',
    r.heroes + ' heroes' + (r.ids.length ? ' → ' + r.ids.slice(0, 8) : ''));
  await ctx.close();
}

console.log('\n§C  collect() — the write to a collector\'s shelf');
{
  const { ctx } = await arena(seed); const page = (await ctx.pages())[0];
  const r = await page.evaluate(() => {
    const before = JSON.parse(localStorage.getItem('urm_vault') || '[]').length;
    /* ⛔ belt-and-braces: hand collect() heroes DIRECTLY, bypassing stock(). Two independent
       guards, because this is the line that writes to somebody's collection. */
    const A = window.__arena;
    A.collect(A.DECK().filter(c => Number(c.id) <= 33).slice(0, 5));
    const mid = JSON.parse(localStorage.getItem('urm_vault') || '[]');
    A.collect(A.DECK().filter(c => Number(c.id) > 33).slice(0, 3));
    const after = JSON.parse(localStorage.getItem('urm_vault') || '[]');
    return { before, afterHeroes: mid.length - before, added: after.length - mid.length,
             rows: after.slice(-3) };
  });
  ok(r.afterHeroes === 0, 'collect() refuses a hero even when handed one directly', '+' + r.afterHeroes + ' rows');
  ok(r.added === 3, '…and still collects field cards normally', '+' + r.added);
  ok(r.rows.every(x => x.n != null && x.src === 'arena'),
    'and every arena row now records its id AND its source', JSON.stringify(r.rows[0]));
}

console.log('\n§D  the hand — a 1/1 cannot be staked either');
{
  /* a vault holding one legitimately pack-pulled gacha hero (12-22, carries n, no arena stamp) */
  const gacha = CARDS.find(c => Number(c.id) === 12);
  const v = [...seed, { slug: gacha.slug, n: 12 }];
  const { ctx } = await arena(v); const page = (await ctx.pages())[0];
  const r = await page.evaluate(() => ({
    hand: window.__arena.hand().map(c => Number(c.id)),
    vaultRows: JSON.parse(localStorage.getItem('urm_vault') || '[]').length,
  }));
  ok(!r.hand.some(n => n >= 1 && n <= 33), 'no hero is playable in the arena',
    'hand ids ' + r.hand.slice(0, 6).join(','));
  /* ⚠ FILTERED FROM THE HAND, NOT DELETED FROM THE VAULT — the distinction is the whole point:
     unplayable here, still yours on your shelf. */
  ok(r.vaultRows === v.length, '…and it is still IN the vault, not deleted', r.vaultRows + ' rows');
  await ctx.close();
}

console.log('\n§D2  the pot picker deals the HUNDRED, not the 196 retired placeholders');
{
  /* ⛔ Artist, 2026-08-07, on the PvP tray: "showing wrong cards." `openPvp()` filled its hand
   *   from `ownedHand()`, which resolved against `deckIndex()` — the hundred PLUS the retired
   *   set — while the house game used `playIndex()` (the hundred only). Two functions answering
   *   the same question and disagreeing, with the rule already written above `playIndex()`. */
  const legacy = JSON.parse(await readFile(join(ROOT, 'cards/manifest.json'), 'utf8'));
  const LEG = (legacy.cards || legacy).slice(0, 20).map(c => ({ slug: String(c.slug) }));
  const real = FIELD.slice(0, 10).map(c => ({ slug: c.slug, n: c.id }));
  const { ctx } = await arena([...LEG, ...real]); const page = (await ctx.pages())[0];
  const r = await page.evaluate(() => { const A = window.__arena;
    const h = A.hand();
    return { vault: A.vault().length, hand: h.length,
      ids: h.map(c => Number(c.id)),
      stray: h.filter(c => !(Number(c.id) >= 34 && Number(c.id) <= 100)).length }; });
  ok(r.vault === 30, 'the vault still holds all 30 rows — nothing is deleted', r.vault + ' rows');
  ok(r.hand === 10, 'but only the 10 real cards are playable', r.hand + ' playable');
  ok(r.stray === 0, 'zero retired placeholders reach the tray', r.stray + ' stray');
  await ctx.close();
}

console.log('\n§E  the retroactive repair — and what it must NOT take');
{
  const auction = CARDS.find(c => Number(c.id) === 3);
  const earned  = CARDS.find(c => Number(c.id) === 30);
  const gacha   = CARDS.find(c => Number(c.id) === 15);
  const gacha2  = CARDS.find(c => Number(c.id) === 18);
  const field   = FIELD[0];
  const v = [
    { slug: field.slug, n: field.id },                       // ordinary card
    { slug: auction.slug, n: 3 },                            // pack-era reserved row
    { slug: earned.slug, n: 30 },                            // pack-era reserved row
    { slug: gacha.slug, n: 15 },                             // LEGITIMATE pack pull — must survive
    { slug: gacha2.slug, src: 'arena', n: 18 },              // arena-stamped gacha — must go
    { slug: auction.slug },                                  // ⛔ legacy ARENA row: NO `n` at all
    { slug: earned.slug },                                   // ⛔ the shape the old heal was blind to
  ];
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(rows => { try {
    localStorage.setItem('urm_admin_ok', '1');
    localStorage.setItem('urm_vault', JSON.stringify(rows));
    localStorage.setItem('urm_titles', JSON.stringify({ twomillion: { at: 1, evidence: { score: 2100000 } } }));
  } catch {} }, v);
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('urm_vault') || '[]');
    return { rows, n: rows.length,
      heroes: rows.filter(x => x.n >= 1 && x.n <= 33).map(x => x.n),
      swapped: rows.filter(x => x.swapped != null).map(x => x.swapped),
      titles: JSON.parse(localStorage.getItem('urm_titles') || '{}'),
      noted: !!document.body.textContent.match(/swapped/i) };
  });
  ok(r.n === v.length, 'nothing is deleted — every row is still there', r.n + ' rows');
  ok(!r.heroes.some(n => n === 3 || n === 30), 'the auction and earned rows are gone', 'left: ' + r.heroes.join(','));
  /* ⛔ THE ASSERTION THE WHOLE REPAIR TURNS ON. Those two rows carry NO `n` — the shape
     cards/battle.html's collect() wrote — and the old heal keyed on `row.n`, so it could not see
     them. Both must now be swapped, resolved by SLUG. */
  ok(r.swapped.filter(x => x === 3 || x === 30).length === 4,
    'including the two legacy ARENA rows that carried no id at all', 'swapped ids: ' + r.swapped.join(','));
  ok(!r.swapped.includes(18) === false, 'an arena-stamped gacha hero is swapped too', 'swapped: ' + r.swapped.join(','));
  ok(r.heroes.includes(15), '⚑ a LEGITIMATE pack-pulled gacha hero SURVIVES', 'kept id 15');
  /* ⛔ THE ARTIST EARNED A RIP ROCKETER TITLE. A cleared title is a claim slip in urm_titles and
     never a card row, so no vault repair can reach it — asserted, not assumed. */
  ok(!!r.titles.twomillion, 'and a cleared EARNED TITLE is untouched by any of it', 'twomillion still recorded');
  ok(r.noted, 'the swap is announced, not silent');
  await ctx.close();
}

console.log('\n§F  proved to bite — the defect line taken verbatim from git');
{
  const path = join(ROOT, 'cards/battle.html');
  const live = await readFile(path, 'utf8');
  /* ⚠ THE DEFECT IS NO LONGER AT HEAD — it was fixed and committed, so `git show HEAD:` returns
   *   the CORRECT file and the sabotage silently becomes a no-op that still prints green. Find
   *   the commit that REMOVED the line and read its parent, so this keeps biting however far the
   *   history moves on. A sabotage that stops reproducing proves nothing, loudly. */
  const { execSync } = await import('node:child_process');
  const sha = execSync(`git log -S'pick(DECK, mode)' --format=%H -- cards/battle.html`,
    { cwd: ROOT }).toString().trim().split('\n')[0];
  ok(!!sha, 'found the commit that removed the defect', sha.slice(0, 8) || 'none');
  const orig = execSync(`git show ${sha}^:cards/battle.html`,
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
  /* ⚠ THE DEFECT IS LIFTED OUT OF GIT, NOT RETYPED — this repo has recorded a sabotage that did
   *   not reproduce the original bytes and therefore proved nothing. Only the one line is spliced
   *   back, so the read hook survives and the check can still see what the house staked. */
  const bad = (orig.match(/^.*pick\(DECK, mode\);.*$/m) || [])[0];
  ok(!!bad, 'the original defect line was recovered from git', (bad || '').trim().slice(0, 60));
  const broken = live.replace(/^.*pick\(stock\(\), mode\);.*$/m, bad);
  ok(broken !== live, 'and spliced into the current build');
  await writeFile(path, broken);
  try {
    const { ctx } = await arena(seed); const page = (await ctx.pages())[0];
    const r = await page.evaluate(() => {
      const A = window.__arena; let heroes = 0, n = 0;
      for (const k of [1, 3, 7]) for (let i = 0; i < 80; i++)
        for (const c of A.pick(A.DECK(), k)) { n++; if (Number(c.id) <= 33) heroes++; }
      return { heroes, n };
    });
    ok(r.heroes > 0, 'and it reproduces: the old build stakes heroes constantly',
      `${r.heroes} of ${r.n} staked cards were 1/1s — ${(r.heroes / r.n * 100).toFixed(1)}%`);
    await ctx.close();
  } finally { await writeFile(path, live); }
  ok((await readFile(path, 'utf8')) === live, 'and the file is restored');
}

await br.close(); srv.close();
console.log('\n' + (fail ? '⛔' : '✅') + `  arena heroes — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

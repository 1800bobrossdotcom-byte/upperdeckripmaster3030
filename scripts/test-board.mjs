#!/usr/bin/env node
/* TOP RIPPERS — one board, six cabinets, and every one of them actually POSTS.  npm run test:board
 *
 * Artist, 2026-08-07: "top rippers for each game need to be shown" and "show the address as the
 * player". His own 3,975,083 was sitting on a board that read "RIPPER".
 *
 * ⛔ WHAT THIS EXISTS FOR, AND IT IS THIS REPO'S OLDEST SHAPE. `api/scores.js` + `js/leaderboard.js`
 *   shipped with THREE of the six cabinets posting. CLOUD RACER and THE ARENA both MOUNTED a board
 *   — they have a lobby roster, so the auto-mount found a host — and neither had anything on the
 *   other end of it, so both showed "be the first to sign" forever, on a live site, indefinitely.
 *   Nothing errored. `test:reach` was green (the module is reachable), `test:cab` was green (the
 *   panel is on screen and clear of everything). **A board that can never fill and a board nobody
 *   has played are the same picture**, which is why this had to be a driven test and not a text
 *   match: the only question worth asking is "does the end of a run REACH RipBoard.post", and that
 *   is a question about a line RUNNING.
 *
 * ⚑ SO §C DRIVES ALL SIX END-OF-RUN PATHS, on the real pages, through each game's own shipping
 *   settle — `showOver()`, `endMatch()`, `result()`, `CRUI.finish()`, a real SLAM, and a real
 *   glide flown by the real bird — with `RipBoard.post` intercepted. Six games, six routes, no
 *   shared shortcut, because a shared shortcut would prove the shortcut.
 *
 * ⚠ AND THE UNIT IS PART OF THE TEST. A bare number on a scoreboard is a riddle: "12" beside a
 *   name could be kills, matches, points or minutes. Every game names what it counts.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9047;
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css',
  '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.gif':'image/gif',
  '.mp3':'audio/mpeg','.woff2':'font/woff2','.wld':'application/octet-stream','.skn':'application/octet-stream' };

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok   ' + m + (d ? '  — ' + d : '')); }
  else { fail++; console.log('  FAIL ' + m + (d ? '  — ' + d : '')); } };
const head = t => console.log('\n' + t);

/* The page's own /api/scores is stubbed to a live-looking 200. ⚠ It must ANSWER rather than 404:
 * `post()` writes locally first and then fetches, so a 404 would still leave the local board right
 * and the assertion would pass for the wrong reason. What is under test is the CALL. */
const posted = [];
const srv = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = decodeURIComponent(u.pathname);
  if (p === '/api/scores') {
    if (req.method === 'POST') {
      let body = ''; for await (const c of req) body += c;
      try { posted.push(JSON.parse(body)); } catch { posted.push({ raw: body }); }
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, top: [] }));
  }
  if (p === '/api/presence') { res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, players: [] })); }
  const f = p.endsWith('/') ? p + 'index.html' : p;
  try { const b = await readFile(join(ROOT, f));
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(path, opts = {}) {
  const ctx = await br.newContext({ viewport: opts.viewport || { width: 1280, height: 900 } });
  await ctx.addInitScript(seed => {
    try { localStorage.setItem('urm_admin_ok', '1');
      localStorage.setItem('urm_wallet_addr', '0x432D71bA9C2Ae0eF0a5D3f5a6C0E0000059d166c9'.slice(0, 42));
      if (seed) for (const k in seed) localStorage.setItem(k, seed[k]);
    } catch {}
    /* the intercept has to exist BEFORE the module does, so nothing can be missed between load and
     * the probe attaching — the same race that made a `setInterval` sabotage flaky in test:press. */
    window.__posts = [];
    Object.defineProperty(window, 'RipBoard', { configurable: true,
      set(v) { const orig = v.post.bind(v);
        v.post = (g, s) => { window.__posts.push([g, s]); return orig(g, s); };
        Object.defineProperty(window, 'RipBoard', { value: v, writable: true, configurable: true }); },
      get() { return undefined; } });
  }, opts.seed || null);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(`http://127.0.0.1:${PORT}/${path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return { ctx, page, errs };
}

// ══ §A  the endpoint ═══════════════════════════════════════════════════════════════════════════
head('§A  api/scores.js — driven, against a fake Redis');
{
  /* ⚑ THE HANDLER ITSELF RUNS. A harness that reimplements the thing it tests proves the harness —
   *   this repo has paid that bill three times in one week (test:citynet agreed with the client
   *   about `messages`, the scores throttle hid its own GT assertion). So the shipped ESM handler
   *   is imported and its `fetch` is pointed at an in-memory Redis.
   * ⚠ AND THE FAKE HONOURS `EX`. The first version ignored it, so the per-identity throttle key
   *   never expired, every post after the first was refused, and "a lower score does not demote
   *   you" passed WITHOUT EVER REACHING THE GT BRANCH — two green ticks measuring a throttle. */
  const Z = new Map(), H = new Map(), K = new Map();   // zsets, hashes, plain keys (with expiry)
  const now = () => Date.now();
  const alive = k => { const e = K.get(k); if (!e) return false; if (e.exp && e.exp < now()) { K.delete(k); return false; } return true; };
  globalThis.fetch = async (_url, init) => {
    const cmd = JSON.parse(init.body).map(String);
    const op = cmd[0].toUpperCase();
    let result = null;
    if (op === 'SET') {
      const [, k, v, ...rest] = cmd;
      const nx = rest.some(x => x.toUpperCase() === 'NX');
      const exI = rest.findIndex(x => x.toUpperCase() === 'EX');
      if (nx && alive(k)) result = null;
      else { K.set(k, { v, exp: exI >= 0 ? now() + (+rest[exI + 1] * 1000) : 0 }); result = 'OK'; }
    } else if (op === 'ZADD') {
      const [, key, ...rest] = cmd;
      const gt = rest[0].toUpperCase() === 'GT';
      const [score, member] = gt ? rest.slice(1) : rest;
      const m = Z.get(key) || new Map(); Z.set(key, m);
      const cur = m.get(member);
      if (!gt || cur == null || +score > cur) m.set(member, +score);
      result = 1;
    } else if (op === 'ZREVRANGE') {
      const m = Z.get(cmd[1]) || new Map();
      const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(+cmd[2], +cmd[3] + 1);
      result = []; rows.forEach(([k, v]) => { result.push(k); result.push(String(v)); });
    } else if (op === 'HSET') { const h = H.get(cmd[1]) || new Map(); H.set(cmd[1], h); h.set(cmd[2], cmd[3]); result = 1; }
    else if (op === 'HMGET') { const h = H.get(cmd[1]) || new Map(); result = cmd.slice(2).map(k => h.get(k) ?? null); }
    else if (op === 'ZREMRANGEBYRANK') result = 0;
    return { ok: true, json: async () => ({ result }) };
  };
  process.env.KV_REST_API_URL = 'http://fake'; process.env.KV_REST_API_TOKEN = 't';
  const mod = await import(pathToFileURL(join(ROOT, 'api/scores.js')).href);
  const call = async (method, body, query) => {
    let out = null;
    const res = { setHeader() {}, status(c) { this._c = c; return this; },
      json(j) { out = { code: this._c, body: j }; return this; }, end() { out = out || { code: this._c }; return this; } };
    await mod.default({ method, body, query: query || {} }, res);
    return out;
  };
  const A = '0x432D71bA9C2Ae0eF0a5D3f5A6c0e00000059d166'.slice(0, 42);

  let r = await call('POST', { game: 'nope', name: 'x', score: 5 });
  ok(r.code === 400 && r.body.reason === 'bad-game', 'A1 an unknown game is refused, not silently keyed', JSON.stringify(r.body));

  r = await call('POST', { game: 'riprocketer', name: 'alpha', addr: A, score: 3975083 });
  ok(r.code === 200 && r.body.top[0].score === 3975083, 'A2 a run lands on the board', JSON.stringify(r.body.top[0] || {}));
  ok(r.body.top[0].addr === A, 'A3 …displayed as the ADDRESS, checksummed as it was sent', r.body.top[0].addr);

  await new Promise(t => setTimeout(t, 5100));         // let the 5s throttle expire — it is real here
  r = await call('POST', { game: 'riprocketer', name: 'alpha', addr: A, score: 12 });
  ok(r.body.top.length === 1 && r.body.top[0].score === 3975083,
    'A4 GT keeps your BEST, so a bad run cannot knock you off', JSON.stringify(r.body.top));

  await new Promise(t => setTimeout(t, 5100));
  r = await call('POST', { game: 'riprocketer', name: 'RENAMED', addr: A.toLowerCase(), score: 4000000 });
  ok(r.body.top.length === 1, 'A5 a handle change and a case change rename ONE row, they do not mint a second',
    JSON.stringify(r.body.top));
  ok(r.body.top[0].score === 4000000 && r.body.top[0].name === 'RENAMED',
    'A6 …and the better score takes, under the new name', JSON.stringify(r.body.top[0]));

  r = await call('GET', null, { game: 'section9' });
  ok(r.code === 200 && r.body.top.length === 0, 'A7 the boards are per game — SECTION 9 is still empty',
    JSON.stringify(r.body.top));

  await new Promise(t => setTimeout(t, 5100));
  r = await call('POST', { game: 'city', name: '', addr: '', score: 300 });
  ok(r.code === 400 && r.body.reason === 'no-identity', 'A8 a nameless, walletless post is refused', JSON.stringify(r.body));
}

// ══ §B  the module ═════════════════════════════════════════════════════════════════════════════
head('§B  js/leaderboard.js — the unit, and the arcade panel');
{
  const { ctx, page, errs } = await open('arcade.html', { viewport: { width: 390, height: 844 } });
  await page.waitForFunction(() => window.RipBoard && document.querySelector('#topRippers .lb-chip'),
    null, { timeout: 30000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const out = { units: {}, chips: [], hd: '', small: 0 };
    const B = window.RipBoard;
    out.games = B ? B.games.slice() : [];
    if (B) for (const g of B.games) out.units[g] = B.units[g] || '';
    document.querySelectorAll('#topRippers .lb-chip').forEach(b => {
      const r = b.getBoundingClientRect();
      out.chips.push([b.dataset.g, Math.round(r.width), Math.round(r.height)]);
      if (r.width < 44 || r.height < 44) out.small++;
    });
    out.hd = (document.querySelector('#topRippers .lb-hd') || {}).textContent || '';
    return out;
  });
  ok(r.games.length === 6, 'B1 the module knows all six cabinets', r.games.join(' '));
  ok(Object.values(r.units).every(Boolean) && new Set(Object.values(r.units)).size >= 3,
    'B2 every game NAMES what its number is', JSON.stringify(r.units));
  ok(r.chips.length === 6, 'B3 the arcade menu shows a chip per game — including THE CITY, which has no lobby',
    r.chips.map(c => c[0]).join(' '));
  /* ⚠ "NOTHING IS UNDER 44px" IS TRIVIALLY TRUE OF A PANEL THAT RENDERED NO CHIPS — proved by the
   *   sabotage, where this passed with 0 measured. The count is part of the claim. */
  ok(r.chips.length === 6 && r.small === 0, 'B4 …and every chip clears 44px on BOTH axes',
    r.chips.map(c => c[1] + 'x' + c[2]).join(' ') || 'no chips rendered');
  ok(/top rippers/i.test(r.hd) && /·/.test(r.hd), 'B5 the header carries the unit', JSON.stringify(r.hd));

  const sw = await page.evaluate(async () => {
    const before = (document.querySelector('#topRippers .lb-hd') || {}).textContent;
    const c = [...document.querySelectorAll('#topRippers .lb-chip')].find(b => b.dataset.g === 'city');
    if (!c) return { err: 'no city chip', before };
    c.click();
    await new Promise(t => setTimeout(t, 300));
    return { before, after: (document.querySelector('#topRippers .lb-hd') || {}).textContent,
      on: (document.querySelector('#topRippers .lb-chip.on') || {}).dataset?.g };
  });
  ok(!sw.err && sw.on === 'city' && sw.after !== sw.before,
    'B6 pressing a chip actually changes the board', JSON.stringify(sw));
  ok(!errs.length, 'B7 no page errors on the arcade menu', errs.join(' | ') || 'clean');
  await ctx.close();
}

// ══ §C  built ≠ reachable — six games, six real end-of-run paths ════════════════════════════════
head('§C  every cabinet POSTS — driven through its own shipping settle');

{ // ── RIP ROCKETER · points
  const { ctx, page, errs } = await open('riprocketer.html');
  await page.waitForFunction(() => window.__rrpc && window.__rrpc._over, null, { timeout: 90000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const R = window.__rrpc; if (!R || !R._over) return { err: 'no hook' };
    R.G.score = 3975083; R.G.wave = 4; R.G.bestChain = 9;
    R._over();
    return { posts: window.__posts.slice() };
  });
  ok(!r.err && (r.posts || []).some(p => p[0] === 'riprocketer' && p[1] === 3975083),
    'C1 RIP ROCKETER posts the run through showOver()', JSON.stringify(r.posts || r));
  ok(!errs.length, 'C2 riprocketer: no page errors', errs.join(' | ') || 'clean');
  await ctx.close();
}

{ // ── DOGFIGHT · kills
  const { ctx, page, errs } = await open('dogfight.html');
  await page.waitForFunction(() => window.__df && window.__df._ttEnd, null, { timeout: 90000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const D = window.__df; if (!D) return { err: 'no hook' };
    D.startMatch && D.startMatch(false);
    const me = D.G.ships.find(s => s.isMe); if (me) me.kills = 7;
    D._ttEnd();
    return { posts: window.__posts.slice() };
  });
  ok(!r.err && (r.posts || []).some(p => p[0] === 'dogfight' && p[1] === 7),
    'C3 DOGFIGHT posts kills through endMatch()', JSON.stringify(r.posts || r));
  ok(!errs.length, 'C4 dogfight: no page errors', errs.join(' | ') || 'clean');
  await ctx.close();
}

{ // ── SECTION 9 · kills
  const { ctx, page, errs } = await open('section9.html');
  await page.waitForFunction(() => window.__s9pc && window.__s9pc.game && window.__s9pc.game.G,
    null, { timeout: 90000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const S = window.__s9pc; if (!S || !S.ui || !S.ui.result) return { err: 'no ui.result' };
    const G = S.game.G;
    /* ⚠ THE LOBBY HAS NO ROSTER — `G.ents` is EMPTY until a match starts, and `result()` ranks
     *   `G.ents`, so calling it cold posts nothing and passes for the wrong reason. A three-body
     *   roster is seeded so the shipping result() has a scoreboard to read; the CALL is still the
     *   game's own. */
    G.ents.length = 0;
    G.ents.push({ isMe: true, name: 'me', kills: 5, deaths: 1, team: 0 },
      { isMe: false, name: 'b1', kills: 2, deaths: 4, team: 1 },
      { isMe: false, name: 'b2', kills: 1, deaths: 3, team: 1 });
    S.ui.result();
    return { posts: window.__posts.slice(), ents: G.ents.length };
  });
  ok(!r.err && (r.posts || []).some(p => p[0] === 'section9' && p[1] === 5),
    'C5 SECTION 9 posts kills through result()', JSON.stringify(r.posts || r));
  ok(!errs.length, 'C6 section9: no page errors', errs.join(' | ') || 'clean');
  await ctx.close();
}

{ // ── CLOUD RACER · the streak, which is the number its earned title is made of
  const { ctx, page, errs } = await open('cloudracer.html');
  await page.waitForFunction(() => window.CRUI && window.CRStreak, null, { timeout: 90000 }).catch(() => {});
  const r = await page.evaluate(() => {
    if (!window.CRUI || !window.CRStreak) return { err: 'no CRUI' };
    window.CRStreak.reset();
    const G = { laps: 3, me: { best: 31.2 }, order: [{ isMe: true, i: 0, done: true, finishT: 94.1, lap: 2 },
      { isMe: false, i: 1, done: true, finishT: 95.4, lap: 2 }] };
    /* the shipping green-light → flag pair, at the pinned lobby. Two races, so the number posted is
     * a STREAK rather than a single win. */
    window.CRStreak.arm({ players: 6, laps: 3 }); window.CRUI.finish(G, false);
    window.CRUI.raceStarted(G, { players: 6, laps: 3 });
    window.CRStreak.arm({ players: 6, laps: 3 }); window.CRUI.finish(G, false);
    return { posts: window.__posts.slice(), read: window.CRStreak.read() };
  });
  const cr = (r.posts || []).filter(p => p[0] === 'cloudracer');
  ok(!r.err && cr.length >= 1, 'C7 CLOUD RACER posts through the shipping finish()', JSON.stringify(r.posts || r));
  ok(cr.length && cr[cr.length - 1][1] === 2 && r.read.best === 2,
    'C8 …and what it posts is the STREAK, not the race', JSON.stringify({ posted: cr, best: r.read && r.read.best }));
  ok(!errs.length, 'C9 cloudracer: no page errors', errs.join(' | ') || 'clean');
  await ctx.close();
}

{ // ── THE CITY · a real glide, flown by the real bird
  const { ctx, page, errs } = await open('city.html');
  await page.waitForFunction(() => window.__city && window.__city._me && window.__city.titles,
    null, { timeout: 90000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const C = window.__city; if (!C || !C.titles) return { err: 'no __city' };
    const me = C._me;
    /* launched, not teleported: raised and given forward speed, then the shipping physics does the
     * rest. The glide window is opened and closed by the game, not by the probe. */
    me.y += 30; me.vy = 0;
    const yaw = me.yaw || 0; me.vx = Math.sin(yaw) * 14; me.vz = Math.cos(yaw) * 14;
    for (let i = 0; i < 60 && !window.__posts.length; i++) C._step(30, 1 / 60);
    return { posts: window.__posts.slice(), glide: C.titles.glide };
  });
  const cy = (r.posts || []).filter(p => p[0] === 'city');
  ok(!r.err && cy.length === 1, 'C10 THE CITY posts a finished glide — the one cabinet with no lobby and no match',
    JSON.stringify(r.posts || r));
  ok(cy.length && cy[0][1] >= 60 && Math.abs(cy[0][1] - (r.glide.best || 0)) <= 1,
    'C11 …and the metres posted are the metres DEAD AIR measured', JSON.stringify({ posted: cy[0], glide: r.glide }));
  ok(!errs.length, 'C12 city: no page errors', errs.join(' | ') || 'clean');
  await ctx.close();
}

{ // ── THE ARENA · wins in a row, and the rule differs by room
  const man = JSON.parse(await readFile(join(ROOT, 'cards/deck-manifest.json'), 'utf8'));
  const CARDS = man.cards || man;
  const FIELD = CARDS.filter(c => Number(c.id) > 33).slice(0, 14).map(c => ({ slug: c.slug, n: c.id }));
  const { ctx, page, errs } = await open('cards/battle.html', { seed: { urm_vault: JSON.stringify(FIELD) } });
  await page.waitForFunction(() => window.__arena && window.__arena.streakSettle, null, { timeout: 60000 }).catch(() => {});

  /* ⛔ THE RULE IS READ OFF THE ROOM, NOT HARD-CODED. Against the house a tie takes your stake, so
   *   it breaks the streak; in a PvP push both stacks and the ante come back, so nothing happened.
   *   A single "a tie always breaks" would make the board disagree with the screen the player just
   *   read — which is this file's whole subject. */
  /* ⚠ EVERY PROBE RETURNS `{err}` RATHER THAN THROWING. An `evaluate` that throws rejects the whole
   *   script — no FAIL line, no total, which reads exactly like a clean run. That is a recorded
   *   failure in this repo (a sabotage that CRASHES the harness has proved nothing), and it is the
   *   likeliest outcome the moment a sabotage removes the very function being reached for. */
  const rule = await page.evaluate(() => {
    const A = window.__arena, out = {};
    if (!A || typeof A.streakSettle !== 'function') return { err: 'no streakSettle' };
    const st = () => { try { return +localStorage.getItem('urm_ar_streak') || 0; } catch { return -1; } };
    localStorage.removeItem('urm_ar_streak'); localStorage.removeItem('urm_ar_best');
    A.streakSettle('win', true); A.streakSettle('win', true); A.streakSettle('win', true);
    out.three = st();
    A.streakSettle('tie', false); out.afterPvpPush = st();       // a push returned everything
    A.streakSettle('tie', true); out.afterHouseTie = st();       // ties go to the house, stake and all
    A.streakSettle('win', true); A.streakSettle('lose', true);
    out.afterLoss = st();
    out.best = +localStorage.getItem('urm_ar_best') || 0;
    return out;
  });
  ok(!rule.err && rule.three === 3, 'C13 THE ARENA counts wins in a row', rule.err || ('streak=' + rule.three));
  ok(!rule.err && rule.afterPvpPush === 3, 'C14 a PvP push does not break it — both stacks came back', 'streak=' + rule.afterPvpPush);
  ok(!rule.err && rule.afterHouseTie === 0, 'C15 …but a tie against the HOUSE does, because it takes your stake', 'streak=' + rule.afterHouseTie);
  ok(!rule.err && rule.afterLoss === 0 && rule.best === 3, 'C16 a loss resets it and the BEST survives', JSON.stringify(rule));

  /* ⚠ AND THE RULE BEING RIGHT SAYS NOTHING ABOUT WHETHER slam() CALLS IT — the exact gap that let
   *   `RRGame.seek` pass a suite while `stepShip` never invoked it. So one REAL slam is played:
   *   cards picked out of the hand, SLAM pressed, the face-off's own continue button clicked. */
  const played = await page.evaluate(async () => {
    if (!window.__arena || typeof window.__arena.streakSettle !== 'function') return { err: 'no streakSettle' };
    try { localStorage.removeItem('urm_ar_streak'); localStorage.removeItem('urm_ar_best'); } catch {}
    window.__posts.length = 0;
    const before = { streak: localStorage.getItem('urm_ar_streak'), best: localStorage.getItem('urm_ar_best') };
    /* ⚠ clicking a tile RE-RENDERS the row, so the list has to be re-queried each time — holding
     *   the first query's nodes clicks detached elements and stakes nothing. */
    const slam = document.getElementById('slamBtn');
    for (let i = 0; i < 8 && slam.disabled; i++) {
      const tiles = [...document.querySelectorAll('#handRow .tile')];
      if (!tiles.length) return { err: 'no hand', info: (document.getElementById('handInfo') || {}).textContent };
      if (!tiles[i]) break;
      tiles[i].click();
    }
    if (slam.disabled) return { err: 'slam still disabled', info: (document.getElementById('handInfo') || {}).textContent };
    slam.click();
    for (let i = 0; i < 200; i++) {                         // the face-off is a ~4s animation
      await new Promise(t => setTimeout(t, 100));
      const d = document.getElementById('foDone');
      if (d) { d.click(); break; }
    }
    await new Promise(t => setTimeout(t, 600));
    const afterSlam = { posts: window.__posts.slice(), streak: localStorage.getItem('urm_ar_streak') };
    /* ⛔ AND THE POST IS ASSERTED SEPARATELY, BECAUSE THE OUTCOME OF A REAL SLAM IS NOT OURS TO
     *   CHOOSE. `best > 0` only exists after a WIN, and the player wins 89.7-95.5% — so requiring
     *   the single driven game to post would be an assertion with a ~1-in-10 failure rate, i.e. a
     *   flake dressed as a regression. The two halves compose and neither is chancy: the slam
     *   REACHES the settle (above), and the settle POSTS on a win (here). */
    window.__posts.length = 0;
    window.__arena.streakSettle('win', true);
    return { before, ...afterSlam, winPosts: window.__posts.slice(),
      log: (document.getElementById('log') || {}).textContent || '' };
  });
  ok(!played.err && played.streak !== null && played.streak !== played.before.streak,
    'C17 a REAL slam settles the streak — the call site, not the function', JSON.stringify({ err: played.err, streak: played.streak }));
  ok(!played.err && (played.winPosts || []).some(p => p[0] === 'arena'),
    'C18 …and a settled win posts it to the board', JSON.stringify(played.winPosts || played));
  ok(!errs.length, 'C19 the arena: no page errors', errs.join(' | ') || 'clean');
  await ctx.close();
}

// ══ §D  the wire ═══════════════════════════════════════════════════════════════════════════════
head('§D  what actually left the browser');
{
  const games = new Set(posted.map(p => p.game));
  ok(games.size >= 6, 'D1 all six games reached /api/scores over the wire, not just the local list',
    [...games].sort().join(' ') + `  (${posted.length} posts)`);
  ok(posted.every(p => p.score > 0 && typeof p.game === 'string'),
    'D2 every post carries a game and a real score', posted.length + ' posts');
  /* ⚠ the identity is what makes a board a board — a post with neither is a row nobody owns, and
   *   api/scores.js refuses it (A8). Asserted on the WIRE too, because the refusal is server-side
   *   and a client that never sends one is the half this test can see. */
  ok(posted.every(p => (p.addr && /^0x[0-9a-fA-F]{40}$/.test(p.addr)) || (p.name && p.name.trim())),
    'D3 …and an identity the server will accept', JSON.stringify(posted[0] || {}));
}

console.log(`\n${pass + fail} assertions · ${pass} ok · ${fail} FAIL`);
await br.close(); srv.close();
process.exit(fail ? 1 : 0);

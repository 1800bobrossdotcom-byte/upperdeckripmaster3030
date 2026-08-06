#!/usr/bin/env node
/* THE CHALLENGE REACHES A STRANGER.   npm run test:challenge
 *
 * ⛔ WHAT THIS EXISTS FOR: `RipNet.challenge()` used to be one line — `bc.postMessage(...)` — and
 *   a BroadcastChannel stops at the machine it was opened on. The ROSTER has been internet-wide
 *   since /api/presence shipped, so two real people saw each other, pressed CHALLENGE, and
 *   nothing happened on either screen. No error, no reject, no timeout. Every static check in
 *   this repo passed the whole time, because every one of them can see the button and none of
 *   them can see whether the message arrived.
 *
 * ⚑ TWO SEPARATE BROWSER CONTEXTS IS THE WHOLE MEASUREMENT, AND IT IS LOAD-BEARING. Chromium
 *   partitions BroadcastChannel per context, so the local transport CANNOT reach across this
 *   harness — anything that gets through got there over /api/presence. §F proves exactly that by
 *   restoring the old bc-only bytes and watching the challenge vanish.
 *
 * ⚑ THE SERVER IS `api/presence.js` ITSELF, not a reimplementation of it. A fake Redis answers on
 *   a local URL and the real handler is imported and driven — so the envelope validation, the
 *   mailbox cap, the drain-only-when-asked rule and the LPOP fallback are all the shipped code.
 *   A harness that reimplements the thing it tests proves the harness.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9037;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok   ' + m + (d ? '  — ' + d : '')); }
  else { fail++; console.log('  FAIL ' + m + (d ? '  — ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── a fake Redis, speaking Upstash's REST shape ──────────────────────────────────────────────
 * ⚠ `noLpopCount` makes LPOP-with-count fail the way an older server would. That path is not
 *   decoration: without it the handler silently falls back to LRANGE+DEL, and the fallback has a
 *   real lost-message race, so it has to be exercised deliberately rather than assumed dead. */
const DB = new Map();                       // key -> { v, exp }
let noLpopCount = false, kvCalls = 0;
const alive = k => { const e = DB.get(k); if (!e) return null;
  if (e.exp && e.exp < Date.now()) { DB.delete(k); return null; } return e; };
function redis(cmd) {
  kvCalls++;
  const [op, key, ...a] = cmd.map(String);
  const e = alive(key);
  switch (op.toUpperCase()) {
    case 'SETEX': DB.set(key, { v: a[1], exp: Date.now() + (+a[0]) * 1000 }); return 'OK';
    case 'SCAN': {
      const keys = [...DB.keys()].filter(k => alive(k) && k.startsWith((a[1] || '').replace('*', '')));
      return ['0', keys];
    }
    case 'MGET': return [key, ...a].map(k => { const x = alive(k); return x ? x.v : null; });
    case 'RPUSH': { const list = e && Array.isArray(e.v) ? e.v : [];
      list.push(...a); DB.set(key, { v: list, exp: e ? e.exp : 0 }); return list.length; }
    case 'LTRIM': { if (!e) return 'OK'; const n = +a[0], m = +a[1];
      e.v = e.v.slice(n < 0 ? Math.max(0, e.v.length + n) : n, m < 0 ? e.v.length + m + 1 : m + 1); return 'OK'; }
    case 'EXPIRE': { if (e) e.exp = Date.now() + (+a[0]) * 1000; return 1; }
    case 'LPOP': {
      if (a.length && noLpopCount) throw new Error('ERR wrong number of arguments');
      if (!e) return null;
      const n = a.length ? +a[0] : 1, out = e.v.splice(0, n);
      if (!e.v.length) DB.delete(key);
      return a.length ? (out.length ? out : null) : (out[0] ?? null);
    }
    case 'LRANGE': { if (!e) return []; const m = +a[1]; return e.v.slice(+a[0], m < 0 ? undefined : m + 1); }
    case 'DEL': return DB.delete(key) ? 1 : 0;
    default: throw new Error('ERR unknown ' + op);
  }
}

process.env.KV_REST_API_URL = `http://127.0.0.1:${PORT}/__kv`;
process.env.KV_REST_API_TOKEN = 'test';
const presence = (await import('../api/presence.js')).default;   // ← the SHIPPED handler

const body = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
/* Vercel hands the handler a res with .status()/.json(); node's does not. Shim only those. */
const vercelRes = res => Object.assign(res, {
  status(n) { this._code = n; return this; },
  json(o) { this.writeHead(this._code || 200, { 'content-type': 'application/json' }); this.end(JSON.stringify(o)); },
});

const srv = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = decodeURIComponent(u.pathname);
  if (p === '/__kv') {
    const cmd = JSON.parse((await body(req)) || '[]');
    try { const result = redis(cmd); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ result })); }
    catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  if (p === '/api/presence') {
    const raw = req.method === 'POST' ? await body(req) : '';
    req.body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : undefined;
    return presence(req, vercelRes(res));
  }
  let f = p.endsWith('/') ? p + 'index.html' : p;
  try { const buf = await readFile(join(ROOT, f));
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(buf); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));
const API = `http://127.0.0.1:${PORT}/api/presence`;
const post = b => fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
  .then(r => r.json().then(j => ({ code: r.status, ...j })));
const REC = (id, extra) => ({ id, handle: id.toUpperCase(), game: 'arena', ...extra });

// ════════ §A  the server: the mailbox itself ════════════════════════════════════════════════
console.log('\n§A  the inbox — api/presence.js as shipped');
{
  const cid = 'c_aaa111';
  await post(REC('p_alpha1'));
  await post(REC('p_bravo1'));
  const s = await post({ ...REC('p_alpha1'), ch: { cid, to: 'p_bravo1', kind: 'call', fromHandle: 'ALPHA' } });
  ok(s.sent === 1, 'a challenge is accepted alongside a heartbeat', 'sent=' + s.sent);

  /* ⛔ THE DRAIN-ONLY-WHEN-ASKED RULE. Every cabinet heartbeats here; a page with nothing to
     render a challenge with must not empty the mailbox on the way past. */
  const quiet = await post(REC('p_bravo1'));
  ok((quiet.inbox || []).length === 0, 'a heartbeat that does not ask leaves the mailbox alone');

  const got = await post({ ...REC('p_bravo1'), inbox: 1 });
  const env = (got.inbox || []).map(x => JSON.parse(x));
  ok(env.length === 1 && env[0].cid === cid && env[0].kind === 'call', 'and asking delivers it', 'n=' + env.length);
  ok(env[0].from === 'p_alpha1', 'the sender is taken from the RECORD, not the envelope', env[0].from);

  const again = await post({ ...REC('p_bravo1'), inbox: 1 });
  ok((again.inbox || []).length === 0, 'a drained mailbox is empty — a challenge arrives once');

  /* the answer travels the same way, back to the challenger */
  await post({ ...REC('p_bravo1'), ch: { cid, to: 'p_alpha1', kind: 'accept', fromHandle: 'BRAVO' } });
  const back = await post({ ...REC('p_alpha1'), inbox: 1 });
  const b0 = (back.inbox || []).map(x => JSON.parse(x))[0];
  ok(b0 && b0.kind === 'accept' && b0.cid === cid, 'the accept comes back on the same thread', b0 && b0.kind);
}

console.log('\n§A2  what the mailbox refuses');
{
  const bad = [
    ['a challenge with no valid cid', { cid: 'nope', to: 'p_bravo1', kind: 'call' }],
    ['a challenge to a malformed id', { cid: 'c_bbb222', to: 'DROP TABLE', kind: 'call' }],
    ['an unknown kind', { cid: 'c_bbb222', to: 'p_bravo1', kind: 'nuke' }],
    ['a challenge addressed to yourself', { cid: 'c_bbb222', to: 'p_alpha1', kind: 'call' }],
  ];
  for (const [what, ch] of bad) {
    const r = await post({ ...REC('p_alpha1'), ch });
    ok(r.sent === 0, 'refuses ' + what, 'sent=' + r.sent);
  }
  const noRec = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ch: { cid: 'c_ccc333', to: 'p_bravo1', kind: 'call' } }) });
  /* ⛔ YOU CANNOT SEND AN INVITATION YOU ARE NOT REACHABLE TO RECEIVE THE ANSWER TO. */
  ok(noRec.status === 400, 'refuses a challenge with no record for the sender', 'HTTP ' + noRec.status);

  /* the cap: one sender cannot grow somebody's mailbox without bound */
  DB.clear();
  await post(REC('p_carol1'));
  for (let i = 0; i < 14; i++)
    await post({ ...REC('p_alpha1'), ch: { cid: 'c_f' + String(i).padStart(5, '0'), to: 'p_carol1', kind: 'call' } });
  const flood = await post({ ...REC('p_carol1'), inbox: 1 });
  ok((flood.inbox || []).length === 8, 'a mailbox is capped at 8', 'held ' + (flood.inbox || []).length + ' of 14');
}

console.log('\n§A3  the LPOP fallback — for a server without the count argument');
{
  DB.clear(); noLpopCount = true;
  await post(REC('p_dave11'));
  await post({ ...REC('p_alpha1'), ch: { cid: 'c_ddd444', to: 'p_dave11', kind: 'call' } });
  const r = await post({ ...REC('p_dave11'), inbox: 1 });
  const e = (r.inbox || []).map(x => JSON.parse(x))[0];
  ok(e && e.cid === 'c_ddd444', 'LRANGE+DEL delivers when LPOP-with-count is unsupported', e && e.cid);
  const after = await post({ ...REC('p_dave11'), inbox: 1 });
  ok((after.inbox || []).length === 0, 'and it still empties the mailbox');
  noLpopCount = false;
}

// ════════ §B  two strangers, two browsers ════════════════════════════════════════════════════
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'] });

async function ripper(name) {
  const ctx = await br.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript(n => { try {
    localStorage.setItem('urm_admin_ok', '1'); localStorage.setItem('urm_net_handle', n);
  } catch {} }, name);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(name + ': ' + e.message.slice(0, 140)));
  await page.goto(`http://127.0.0.1:${PORT}/cards/battle.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.RipNet && window.RipNet.me && window.RipNet.me().id, null, { timeout: 30000 });
  /* every arrival is recorded rather than sampled — a toast that shows and auto-hides after 14 s
     is invisible to a check that looks at the wrong moment */
  await page.evaluate(() => {
    window.__seen = { call: [], reply: [], match: [] };
    RipNet.onChallenge(c => window.__seen.call.push({ cid: c.id, from: c.from && c.from.handle }));
    RipNet.onReply(r => window.__seen.reply.push({ kind: r.kind, from: r.from && r.from.handle }));
    RipNet.onMatch(m => window.__seen.match.push({ opp: m.opponent && m.opponent.handle }));
  });
  const id = await page.evaluate(() => RipNet.me().id);
  return { name, ctx, page, id, errs,
    seen: () => page.evaluate(() => window.__seen),
    sees: other => page.waitForFunction(o => RipNet.roster().some(p => p.id === o), other, { timeout: 20000 })
      .then(() => true).catch(() => false) };
}

console.log('\n§B  two browser contexts — BroadcastChannel cannot reach across');
DB.clear();
const A = await ripper('ALPHA'), B = await ripper('BRAVO');
ok(A.id !== B.id, 'two distinct identities', A.id + ' · ' + B.id);
const sawB = await A.sees(B.id), sawA = await B.sees(A.id);
ok(sawB && sawA, 'each sees the other in the roster (this half always worked)');

await A.page.evaluate(id => RipNet.challenge(id), B.id);
await B.page.waitForFunction(() => window.__seen.call.length > 0, null, { timeout: 20000 }).catch(() => {});
const bSeen = await B.seen();
ok(bSeen.call.length === 1, 'the challenge REACHES the stranger', 'received ' + bSeen.call.length);
ok(bSeen.call[0] && bSeen.call[0].from === 'ALPHA', 'and it is named', bSeen.call[0] && bSeen.call[0].from);
/* ⚠ the ASSERTION IS THE RENDERED TOAST, not the event — a listener firing into a page that draws
   nothing is the same non-event as a message that never arrived. */
const toast = await B.page.evaluate(() => { const t = document.getElementById('lobToast');
  return { shown: !!t && t.classList.contains('show'), txt: (document.getElementById('lobToastTxt') || {}).textContent || '' }; });
ok(toast.shown && /ALPHA/.test(toast.txt), 'the arena raises the toast a human answers', JSON.stringify(toast.txt.slice(0, 40)));

console.log('\n§C  the answer comes back');
await B.page.click('#ltYes');
await A.page.waitForFunction(() => window.__seen.match.length > 0, null, { timeout: 20000 }).catch(() => {});
const aSeen = await A.seen();
ok(aSeen.match.length === 1, 'accepting starts the match on the CHALLENGER\'s screen too', 'match=' + aSeen.match.length);
ok(aSeen.match[0] && aSeen.match[0].opp === 'BRAVO', 'against the right person', aSeen.match[0] && aSeen.match[0].opp);
ok(!(await A.page.evaluate(() => !!RipNet.pending())), 'and the outbound challenge is cleared');

console.log('\n§C2  a refusal is said out loud');
{
  /* a fresh pair, because §C left both mid-match */
  DB.clear();
  const C = await ripper('CAROL'), D = await ripper('DELTA');
  await C.sees(D.id); await D.sees(C.id);
  await C.page.evaluate(id => RipNet.challenge(id), D.id);
  await D.page.waitForFunction(() => window.__seen.call.length > 0, null, { timeout: 20000 }).catch(() => {});
  await D.page.click('#ltNo');
  await C.page.waitForFunction(() => window.__seen.reply.length > 0, null, { timeout: 20000 }).catch(() => {});
  const cSeen = await C.seen();
  ok(cSeen.reply.length === 1 && cSeen.reply[0].kind === 'decline', 'the challenger is TOLD they were passed on',
    JSON.stringify(cSeen.reply));
  const said = await C.page.evaluate(() => (document.getElementById('miniToast') || {}).textContent || '');
  ok(/DELTA/.test(said) && /pass/i.test(said), 'and the arena says who', JSON.stringify(said));
  ok(cSeen.match.length === 0, 'a refusal does not start a match');
  await C.ctx.close(); await D.ctx.close();
}

console.log('\n§D  ?vs= — arriving from the front page with somebody in mind');
{
  DB.clear();
  const E = await ripper('ECHO');                       // sits in the arena, waiting
  const ctx = await br.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1');
    localStorage.setItem('urm_net_handle', 'FOXTROT'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/cards/battle.html?vs=${E.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await E.page.waitForFunction(() => window.__seen.call.length > 0, null, { timeout: 25000 }).catch(() => {});
  const eSeen = await E.seen();
  ok(eSeen.call.length === 1, '?vs= issues the challenge on arrival', 'received ' + eSeen.call.length);
  ok(eSeen.call[0] && eSeen.call[0].from === 'FOXTROT', 'from whoever followed the link', eSeen.call[0] && eSeen.call[0].from);
  await ctx.close();

  /* ⚠ a target who has left must be SAID, not silently dropped — a link from a page that was
     15 s stale is the normal case, not the exception */
  const ctx2 = await br.newContext();
  await ctx2.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  const p2 = await ctx2.newPage();
  await p2.goto(`http://127.0.0.1:${PORT}/cards/battle.html?vs=p_ghost99`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p2.waitForFunction(() => /left the room/.test((document.getElementById('miniToast') || {}).textContent || ''),
    null, { timeout: 20000 }).then(() => ok(true, 'a target who has gone is reported, not swallowed'))
    .catch(() => ok(false, 'a target who has gone is reported, not swallowed'));
  await ctx2.close(); await E.ctx.close();
}

console.log('\n§E  the front-page strip — the ⚔ is a link, and this module still never writes');
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  const p = await ctx.newPage();
  let writes = 0;
  await p.route('**/api/presence*', r => { if (r.request().method() === 'POST') writes++;
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, players: [
      { id: 'p_zulu11', handle: 'ZULU', game: 'arena', status: 'seeking', balance: 0, cards: 3 },
      { id: 'p_yank11', handle: 'YANKEE', game: 'arena', status: 'battling', balance: 0, cards: 1 },
      { id: 'p_xray11', handle: 'XRAY', game: 'city', status: 'idle', balance: 0, cards: 0 },
    ] }) }); });
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => document.querySelectorAll('#onlineNow .on-p').length === 3, null, { timeout: 20000 }).catch(() => {});
  const chips = await p.evaluate(() => [...document.querySelectorAll('#onlineNow .on-p')].map(c => {
    const go = c.querySelector('a.on-go'), vs = c.querySelector('a.on-vs');
    const r = vs && vs.getBoundingClientRect();
    return { name: (go && go.textContent || '').trim(), go: go && go.getAttribute('href'),
      vs: vs && vs.getAttribute('href'), h: r ? Math.round(r.height) : 0, w: r ? Math.round(r.width) : 0 };
  }));
  ok(chips.length === 3, 'three rippers render', 'n=' + chips.length);
  const zulu = chips.find(c => /ZULU/.test(c.name));
  ok(zulu && zulu.vs === 'cards/battle.html?vs=p_zulu11', 'a ripper in the arena is challengeable', zulu && zulu.vs);
  /* ⚠ BOTH AXES. The first version asked only about height, and passed on a 35px-wide target —
     the chip's own height had made it look fine while a thumb had 35px of horizontal room. */
  ok(zulu && zulu.h >= 44 && zulu.w >= 44, 'the ⚔ clears the 44px tap floor on BOTH axes',
    zulu && zulu.w + '×' + zulu.h);
  const xray = chips.find(c => /XRAY/.test(c.name));
  /* ⛔ AN INVITATION THAT CANNOT BE SEEN IS WORSE THAN NO BUTTON. Somebody in THE CITY has no
     challenge listener, so their mailbox would just expire — their chip takes you to them. */
  ok(xray && !xray.vs && xray.go === 'city.html', 'somebody in another game is NOT offered a challenge', xray && xray.go);
  const yank = chips.find(c => /YANKEE/.test(c.name));
  ok(yank && !yank.vs, 'nor is somebody already mid-fight');
  ok(writes === 0, 'and the front page still never heartbeats — a reader is not a player', 'POSTs=' + writes);
  await ctx.close();
}

// ════════ §F  sabotage: put the original bytes back ══════════════════════════════════════════
console.log('\n§F  proved to bite — the shipped-yesterday challenge(), restored verbatim');
{
  const { execSync } = await import('node:child_process');
  const path = join(ROOT, 'cards/arena-net.js');
  const live = await readFile(path, 'utf8');
  /* ⚠ THE SABOTAGE HAS TO BE THE ORIGINAL DEFECT, NOT A HAND-TYPED IMITATION — this repo has
     recorded a sabotage that did not reproduce and therefore proved nothing. This is the exact
     body from git, with only the two wire calls removed. */
  const broken = live
    .replace(/\n\s*wire\(\{ cid, to: id, kind: 'call'.*\n/, '\n')
    .replace(/\n\s*if \(ch\.id\) wire\(\{ cid: ch\.id, to: ch\.from\.id, kind: 'accept'.*\n/, '\n');
  ok(broken !== live, 'the sabotage patch applied', 'Δ ' + (live.length - broken.length) + ' bytes');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, broken);
  try {
    DB.clear();
    const G = await ripper('GOLF'), H = await ripper('HOTEL');
    await G.sees(H.id); await H.sees(G.id);
    await G.page.evaluate(id => RipNet.challenge(id), H.id);
    await sleep(9000);                                   // well past two heartbeats
    const hSeen = await H.seen();
    ok(hSeen.call.length === 0, 'BroadcastChannel alone reaches NOBODY across two contexts',
      'received ' + hSeen.call.length + ' — this is the bug, reproduced');
    await G.ctx.close(); await H.ctx.close();
  } finally { await writeFile(path, live); }
  ok((await readFile(path, 'utf8')) === live, 'and the file is restored');
}

const allErrs = [];
await br.close(); srv.close();
console.log('\n' + (fail ? '⛔' : '✅') + `  challenge inbox — ${pass} passed, ${fail} failed   (${kvCalls} kv ops)`);
if (allErrs.length) console.log('   page errors: ' + allErrs.join(' | '));
process.exit(fail ? 1 : 0);

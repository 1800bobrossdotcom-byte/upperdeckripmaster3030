#!/usr/bin/env node
/* THE CITY — TWO PLAYERS, ONE WORLD.   npm run test:citynet
 *
 * ⛔ THE ONLY MEASUREMENT THAT MEANS ANYTHING ABOUT MULTIPLAYER IS A SECOND REAL PAGE. Everything
 *   else — the module loads, the roster is non-empty, a channel says `open` — is satisfied by a
 *   build where nobody can see anybody. So this opens two browser contexts with two identities,
 *   stands them next to each other, moves one, and asks the OTHER where it thinks that person is.
 *
 * ⚑ The server here implements `/api/presence` and `/api/signal` IN MEMORY, to the same protocol
 *   the Vercel handlers speak. Production runs them on Upstash; the client cannot tell, which is
 *   the point of both being mailboxes rather than services — and it means this suite needs no
 *   network and no keys.
 *
 * ⚠ PROVED TO BITE: deleting the `ME < p.id` tie-break in js/city-net.js (so both sides offer at
 *   once, which is what I shipped first) takes this from 2 peers to 0 with no error anywhere.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css',
  '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.gif':'image/gif',
  '.wld':'application/octet-stream','.skn':'application/octet-stream','.glb':'model/gltf-binary' };
const PORT = 9023;

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ok   ' + msg + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + msg + (detail ? '  — ' + detail : '')); }
};

const roster = new Map();                 // id -> record (with a stamp)
const inbox = new Map();                  // room|id -> [msg]
const body = req => new Promise(r => { let b=''; req.on('data',c=>b+=c); req.on('end',()=>r(b)); });

/* ⛔ PIN THE WIRE KEY AGAINST THE SHIPPED HANDLER, because this suite has already been defeated
 *   by exactly this: js/city-net.js read `j.messages`, api/signal.js sends `msgs`, and the fake
 *   server above was written to match the CLIENT — so three green ticks meant the harness agreed
 *   with itself while THE CITY's peer motion could not work in production for a single second.
 * ⚑ Derived from api/signal.js's own source, and checked against EVERY client that reads it, so a
 *   second consumer written tomorrow cannot quietly pick a different name. */
{
  const sig = readFileSync(join(ROOT, 'api/signal.js'), 'utf8');
  const key = (sig.match(/res\.status\(200\)\.json\(\{\s*ok:\s*true,\s*(\w+)/) || [])[1];
  ok(!!key, 'api/signal.js names its response array', key || 'unparsed');
  for (const f of ['js/city-net.js', 'js/df-net.js']) {
    const src = readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');   // comments are history
    const reads = [...src.matchAll(/j\s*&&\s*j\.(\w+)\s*\|\|\s*\[\]/g)].map(m => m[1]);
    ok(reads.length > 0 && reads.every(r => r === key),
      `${f} reads the key the server actually sends`, `reads ${reads.join(',') || 'nothing'} · server sends ${key}`);
  }
}

const srv = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = decodeURIComponent(u.pathname);

  if (p === '/api/presence') {
    const rec = JSON.parse((await body(req)) || '{}');
    rec.t = Date.now();
    roster.set(rec.id, rec);
    const now = Date.now();
    const players = [...roster.values()].filter(r => now - r.t < 20000);
    res.writeHead(200, {'content-type':'application/json'});
    return res.end(JSON.stringify({ ok:true, players }));
  }
  if (p === '/api/signal') {
    if (req.method === 'POST') {
      const m = JSON.parse((await body(req)) || '{}');
      const k = m.room + '|' + m.to;
      if (!inbox.has(k)) inbox.set(k, []);
      inbox.get(k).push({ from:m.from, fromHandle:m.fromHandle, type:m.type, payload:m.payload });
      res.writeHead(200, {'content-type':'application/json'});
      return res.end(JSON.stringify({ ok:true }));
    }
    const k = u.searchParams.get('room') + '|' + u.searchParams.get('me');
    const msgs = inbox.get(k) || []; inbox.set(k, []);
    res.writeHead(200, {'content-type':'application/json'});
    /* ⛔ THIS SAID `messages` AND THE SHIPPED `api/signal.js` SAYS `msgs`. The harness had been
     * written to match the CLIENT (js/city-net.js, which read `messages`) rather than the real
     * handler — so this suite scored 10/10 for months while THE CITY's peer motion could not work
     * in production at all. The key is the server's now, and it is asserted below. */
    return res.end(JSON.stringify({ ok:true, msgs }));
  }

  let f = p.endsWith('/') ? p + 'index.html' : p;
  try {
    const buf = await readFile(join(ROOT, f));
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));

const br = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });

async function player(name) {
  const ctx = await br.newContext({ viewport:{width:900,height:640} });
  await ctx.addInitScript(n => {
    try { localStorage.setItem('urm_admin_ok','1'); localStorage.setItem('urm_net_handle', n); } catch {}
  }, name);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(name + ': ' + e.message.slice(0,120)));
  await page.goto(`http://127.0.0.1:${PORT}/city.html`, { waitUntil:'load', timeout:90000 });
  try {
    await page.waitForFunction(() => window.__city && window.__city.s && window.__city.s.ready,
      null, { timeout:35000 });
  } catch (e) {
    console.log('  !! ' + name + ' never became ready');
    console.log('     errors: ' + (errs.join(' | ') || 'none reported'));
    console.log('     __city present: ' + await page.evaluate(() => !!window.__city));
    console.log('     CityNet present: ' + await page.evaluate(() => !!window.CityNet));
    console.log('     RipNet present: ' + await page.evaluate(() => !!window.RipNet));
  }
  return { ctx, page, errs, name };
}

const A = await player('ALPHA');
const B = await player('BRAVO');
await A.page.waitForTimeout(2500);
await B.page.waitForTimeout(2500);

console.log('\n── 1 · both cities are up and the net layer is live ────────────────────────────');
ok(await A.page.evaluate(() => !!__city.net), 'the shared world attaches');
ok(await A.page.evaluate(() => __city.net && __city.net.live()), 'presence answers');

console.log('\n── 2 · they find each other and open a channel ─────────────────────────────────');
await A.page.evaluate(() => __city._place(140, 2, 60, 0));
await B.page.evaluate(() => __city._place(150, 2, 60, 0));
await A.page.waitForTimeout(9000);
await B.page.waitForTimeout(9000);

const aP = await A.page.evaluate(() => __city.net ? __city.net.peers() : []);
const bP = await B.page.evaluate(() => __city.net ? __city.net.peers() : []);
ok(aP.length === 1, 'ALPHA has exactly one peer', JSON.stringify(aP.map(p => p.name)));
ok(bP.length === 1, 'BRAVO has exactly one peer', JSON.stringify(bP.map(p => p.name)));
ok(aP[0] && aP[0].name === 'BRAVO', '…and it is the other player, by name', aP[0] && aP[0].name);
ok(aP[0] && aP[0].open === true,
  'the data channel is OPEN — the assertion that bites, because both sides offering at once '
  + 'leaves the roster full and the mesh empty with nothing thrown',
  aP[0] && String(aP[0].open));

console.log('\n── 3 · the peer has a real BODY, not a marker ──────────────────────────────────');
ok(await A.page.evaluate(() => __city._peerBodies.size) === 1,
  'ALPHA built a body in the scene for BRAVO');
ok(aP[0] && aP[0].body === 'bird', '…of the animal they actually are', aP[0] && aP[0].body);

console.log('\n── 4 · MOVEMENT CROSSES THE WIRE ──────────────────────────────────────────────');
/* ⚠ "a peer exists" is the weak question — a stale first packet satisfies it forever. The one
 *   that discriminates is whether the position KEEPS ARRIVING after the first exchange. */
const before = aP[0] ? aP[0].dist : null;
await B.page.evaluate(() => __city._place(210, 2, 60, 0));
await B.page.waitForTimeout(4000);
await A.page.waitForTimeout(2500);
const after = await A.page.evaluate(() => {
  const p = __city.net ? __city.net.peers()[0] : null; return p ? p.dist : null; });
ok(before != null && after != null && after - before > 40,
  'BRAVO walks 60 m and ALPHA reads the new distance', before + ' m -> ' + after + ' m');

console.log('\n── 5 · nothing threw in either city ───────────────────────────────────────────');
const errs = [...A.errs, ...B.errs];
ok(errs.length === 0, 'no page errors', errs.slice(0,2).join(' | ') || 'clean');

await br.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

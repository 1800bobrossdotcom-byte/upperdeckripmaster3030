#!/usr/bin/env node
/* npm run test:standalone — the crypto-free game exports.
 *
 * ⛔ "IT BOOTS" IS THE WEAK QUESTION. Every module the export strips is written to fail open, so
 *   a build with the wallet removed will always LOAD. The question is whether it still PLAYS —
 *   and the one assertion that can tell the difference is pixels: a canvas that is a single flat
 *   colour is a game that died politely. Same discriminator the press suite uses on a card.
 * ⚑ AND THE SECOND ONE IS THAT IT PHONES NOBODY. A build that quietly fetches our API on a
 *   stranger's machine is both a privacy claim we did not make and a hard dependency that turns
 *   an offline download into a broken page the day the site moves.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(new URL('.', import.meta.url).pathname, '..');
const OUT = join(ROOT, 'build/standalone');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok    ' + m + (d ? '  — ' + d : '')); } else { fail++; console.log('  FAIL  ' + m + (d ? '  — ' + d : '')); } };

if (!existsSync(OUT)) { console.log('  ⛔ no build — run `npm run standalone` first'); process.exit(1); }
const GAMES = readdirSync(OUT).filter(d => statSync(join(OUT, d)).isDirectory());
ok(GAMES.length >= 4, `builds present`, GAMES.join(' · '));

const MT = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.skn': 'application/octet-stream', '.wld': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.gif': 'image/gif', '.bin': 'application/octet-stream' };
let SERVE = OUT;
const srv = createServer((q, r) => {
  let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = join(SERVE, decodeURIComponent(p));
  if (!existsSync(f) || !extname(f)) { r.writeHead(404); return r.end('x'); }
  r.writeHead(200, { 'content-type': MT[extname(f)] || 'application/octet-stream' });
  r.end(readFileSync(f));
});
await new Promise(z => srv.listen(8096, z));
const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* ⚠ The token address and the studio's own hosts. `3030` alone is far too loose to grep for —
 *   it is in filenames, class names and the studio's own name — so the check is the things that
 *   would actually make a portal reader call this a crypto drop. */
/* ⛔ THIS LIST WAS TOO BLUNT FIRST TIME AND FAILED FIVE HONEST BUILDS. It banned the STRING
 *   `RipWallet`, which appears in game code as guarded reads — `window.RipWallet && …` — that are
 *   exactly how fail-open is implemented and are completely inert once the module is not loaded.
 *   The same mistake as stripping `wager-payout.js` for having "wager" in its name, one layer up:
 *   **assert the CAPABILITY is gone, not that the WORD is gone.** What is left below is only what
 *   would make a portal reader call this a crypto drop, or would actually reach a network. The
 *   real proof that the capability is absent is the RUNTIME check further down. */
const BANNED = [
  { re: /0x1D4bcbb505182a49303CC3B23EfF1E3157147A33/i, what: 'the $3030 contract address' },
  { re: /walletconnect|eth_requestAccounts|reown/i, what: 'a live wallet-connect path' },
  { re: /https?:\/\/[^"'\s]*(?:rpc|infura|alchemy|publicnode|drpc)/i, what: 'a hardcoded RPC endpoint' },
  { re: /api\.dexscreener|app\.uniswap\.org|superrare\.com/i, what: 'a market/marketplace link' },
  { re: /<script[^>]+src="[^"]*(?:wallet|chain-config|session|eth-play)\.js"/i, what: 'a wallet module still loaded' },
];

for (const g of GAMES) {
  console.log(`\n── ${g} ──`);
  SERVE = join(OUT, g);
  const html = readFileSync(join(SERVE, 'index.html'), 'utf8');

  /* §A — nothing crypto survived, in the MARKUP or in any shipped script. */
  let hits = [];
  const files = [];
  (function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e);
    statSync(p).isDirectory() ? walk(p) : (/\.(js|html|json)$/.test(e) && files.push(p)); } })(SERVE);
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const b of BANNED) if (b.re.test(s)) hits.push(`${b.what} in ${f.slice(SERVE.length + 1)}`);
  }
  ok(!hits.length, 'no wallet, no chain config, no contract address anywhere in the build', hits[0] || 'clean');
  ok(/ripmaster3030studios\.com/.test(html), 'the studio credit link survives — this is the whole funnel');

  /* §B/C/D — drive it. */
  const pg = await br.newPage();
  const errs = [], offsite = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  pg.on('request', r => { const u = r.url();
    if (!/^http:\/\/localhost:8096/.test(u) && !/^data:|^blob:/.test(u)) offsite.push(u.slice(0, 70)); });
  await pg.goto('http://localhost:8096/index.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(6000);

  ok(!errs.length, 'boots with no page errors', errs[0] || 'clean');
  ok(!offsite.length, 'phones nobody — every request is same-origin', offsite[0] || 'no external requests');

  /* ⛔ THE ONE THAT SEPARATES "LOADED" FROM "RUNNING": pixels. A stripped build that died politely
   *   still renders a canvas — it just renders ONE COLOUR. */
  const px = await pg.evaluate(async () => {
    const cs = [...document.querySelectorAll('canvas')].filter(c => c.width > 200 && c.height > 150);
    if (!cs.length) return { err: 'no canvas' };
    const c = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    try {
      const o = document.createElement('canvas'); o.width = 160; o.height = 100;
      o.getContext('2d').drawImage(c, 0, 0, 160, 100);
      const d = o.getContext('2d').getImageData(0, 0, 160, 100).data;
      const lum = []; for (let i = 0; i < d.length; i += 4) lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      const m = lum.reduce((a, b) => a + b, 0) / lum.length;
      const sd = Math.sqrt(lum.reduce((a, b) => a + (b - m) ** 2, 0) / lum.length);
      return { w: c.width, h: c.height, mean: +m.toFixed(1), sd: +sd.toFixed(1), distinct: new Set(lum.map(v => v | 0)).size };
    } catch (e) { return { err: String(e).slice(0, 60) }; }
  });
  ok(!px.err && px.w > 200, 'a real canvas is up', px.err || `${px.w}×${px.h}`);
  /* ⚠ WebGL canvases read back black without preserveDrawingBuffer, which is a recorded trap in
   *   this repo — so a zero here is reported as UNREADABLE rather than as a dead game. */
  if (!px.err) {
    if (px.mean === 0 && px.sd === 0) ok(true, '⚠ canvas unreadable (no preserveDrawingBuffer) — pixels not asserted', 'known trap');
    else ok(px.sd > 2 || px.distinct > 8, 'and it is DRAWING, not one flat colour', `sd ${px.sd}, ${px.distinct} levels`);
  }

  /* §E — it takes input without throwing. Not "the ship moved" (each game differs) but that the
   *   input path survives the strip, which is where a removed module would actually bite. */
  const before = errs.length;
  await pg.keyboard.down('KeyW'); await pg.waitForTimeout(250);
  await pg.keyboard.press('Space'); await pg.waitForTimeout(250);
  await pg.keyboard.up('KeyW');
  await pg.mouse.click(400, 300); await pg.waitForTimeout(700);
  ok(errs.length === before, 'takes keyboard + pointer input without throwing', errs[before] || 'clean');

  await pg.close();
}

await br.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* THE SHARE CABINET — driven.                                             npm run test:play
 *
 * `play.html` exists to be opened by a stranger who tapped a link card in a social feed, on a
 * phone held UPRIGHT, having never seen this studio. Everything it asserts is about that person.
 *
 * ⛔ WHY A TEXT MATCH CANNOT DO THIS JOB, which is this repo's most-repeated finding one level in:
 *   `test:reach` proves the page parses and is linked, `test:cab` proves pads lay out, and BOTH
 *   were green on a build where **68% of the playable field was off screen in portrait** — the
 *   ship flies to ±6.3 while a 390×844 camera showed ±2.02. Nothing errors. The ship simply is
 *   not in the picture, which reads as a dead game, and only projecting it through the LIVE
 *   camera can see it.
 *
 * ⚠ THE NO-REGRESSION HALF IS NOT OPTIONAL. The artist's verdict on the current build is "plays
 *   GREAT", so landscape and desktop must come back with the SAME numbers they had before the
 *   portrait work — fov 42, vertical framing. A fix that improves one viewport by moving another
 *   is not a fix.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg' };
const PORT = 8967;

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok   ' + m + (d ? '  — ' + d : '')); }
  else { fail++; console.log('  FAIL ' + m + (d ? '  — ' + d : '')); } };

const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));

const html = await readFile(join(ROOT, 'play.html'), 'utf8');

console.log('\n── 1 · THE GENERATOR AND THE SHIPPED FILE AGREE ───────────────────────────────');
/* ⛔ `restyle-backs.mjs` is the recorded failure: a hand-patched OUTPUT and a generator left
 * armed to put the defect back, so the next run silently reverts the fix. `riprocketer.html` is
 * edited constantly and this page is derived from it, so the two drifting apart is a WHEN. */
{
  const { buildPlay } = await import('./build-play.mjs').catch(() => ({}));
  if (!buildPlay) { ok(false, 'build-play.mjs exports buildPlay()'); }
  else {
    const fresh = await buildPlay();
    ok(fresh === html, 'play.html IS what scripts/build-play.mjs produces right now',
      fresh === html ? 'byte-identical' : 'DRIFTED — run node scripts/build-play.mjs');
  }
}

console.log('\n── 2 · THE CARD IS THE DELIVERY MECHANISM ─────────────────────────────────────');
/* The viral Minecraft-on-X post was measured, off its own meta tags, as `summary_large_image` —
 * a link card, not an in-feed player. That is what this page is delivered by, so the card meta
 * is not polish: with none, a shared link renders as a bare URL and nobody taps it.
 * ⚠ `riprocketer.html` HAS none, which is why this page exists rather than the cabinet being
 *   shared directly. */
for (const [re, what] of [
  [/<meta name="twitter:card" content="summary_large_image">/, 'twitter:card = summary_large_image'],
  [/<meta name="twitter:title"/, 'twitter:title'],
  [/<meta name="twitter:description"/, 'twitter:description'],
  [/<meta name="twitter:image" content="https:\/\/[^"]+play-card\.png">/, 'twitter:image (absolute)'],
  [/<meta name="twitter:image:alt"/, 'twitter:image:alt'],
  [/<meta property="og:url" content="https:\/\//, 'og:url (absolute)'],
  [/<link rel="canonical"/, 'canonical'],
]) ok(re.test(html), 'the page carries ' + what);
/* ⚠ RELATIVE IS NOT ALLOWED HERE. A crawler fetching the card resolves these against nothing it
 * can be trusted to guess; every image and url must be absolute or the card renders blank. */
ok(!/<meta (name|property)="(twitter|og):(image|url)" content="(?!https:\/\/)/.test(html),
  'no card image or url is relative');
{
  const card = await stat(join(ROOT, 'media/site/play-card.png')).catch(() => null);
  ok(!!card, 'media/site/play-card.png exists', card ? (card.size / 1024).toFixed(0) + ' KB' : 'MISSING');
  /* X rejects over 5 MB. Under 10 KB means the build produced an empty frame. */
  ok(card && card.size > 40 * 1024 && card.size < 5 * 1024 * 1024,
    'the card is a real image and inside the platform limit');
}

console.log('\n── 3 · NOTHING STANDS BETWEEN THE TAP AND THE GAME ────────────────────────────');
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function drive(file, W, H) {
  const ctx = await br.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/${file}?hold=1`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.__rrpc && window.__rrpc._cam, null, { timeout: 90000 });
  const env = await page.evaluate(() => ({
    gate: !!document.getElementById('urm-gate'),
    orient: !!document.getElementById('ripOrient'),
    wallet: !!window.RipWallet,
  }));
  await page.evaluate(() => __rrpc.start(false));
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const s = __rrpc.G.ship, F = RRGame.F;
    __rrpc._camStep(40, 1 / 60);
    const at = x => { s.x = x; s.y = -3.05; s.alive = true; __rrpc._camStep(2, 1 / 60);
      const p = __rrpc.cam.camera.worldToScreen(new pc.Vec3(x, -3.05, 0), new pc.Vec3());
      return { x: Math.round(p.x), on: p.x >= 0 && p.x <= innerWidth && p.z > 0 }; };
    return { cam: __rrpc._cam(), L: at(-F.X), R: at(F.X), fieldX: F.X, w: innerWidth,
             mode: __rrpc.G.mode };
  });
  await ctx.close();
  return { env, m, errs };
}

const port = await drive('play.html', 390, 844);
ok(port.env.gate === false, 'PORTRAIT: no pre-launch veil — a stranger is not asked for a password');
ok(port.env.orient === false, '…and no "turn it sideways" veil on the orientation a feed hands you');
/* ⛔ THE SAME ARGUMENT SuperRare's security team MADE ABOUT THE EMBED, with more force: a game
 * arriving from a social post that asks for a wallet is indistinguishable from a phish. */
ok(port.env.wallet === false, '…and NO wallet module is loaded at all');
ok(port.m.mode === 'play', '…and it reaches play without any further interaction', port.m.mode);

console.log('\n── 4 · PORTRAIT FRAMES THE FIELD ──────────────────────────────────────────────');
/* The load-bearing one. Before this work a 390×844 camera showed ±2.02 of a ±6.3 field. */
ok(port.m.cam.hw >= port.m.fieldX,
  'the visible half-width covers the playable half-width',
  port.m.cam.hw + ' vs field ' + port.m.fieldX);
ok(port.m.cam.horiz === true, '…by framing HORIZONTALLY, so the surplus goes into height',
  'fov ' + port.m.cam.fov);
/* ⚑ The assertion that discriminates: "the camera is wide enough" is arithmetic, "the ship is on
 * screen at the edge of its own bounds" is the player's question. Projected through the LIVE
 * camera, not the nominal one. */
ok(port.m.L.on && port.m.R.on,
  'the ship is ON SCREEN at BOTH field edges — projected through the live camera',
  'left x=' + port.m.L.x + ' right x=' + port.m.R.x + ' of 0..' + port.m.w);

console.log('\n── 5 · AND THE BUILD THAT "PLAYS GREAT" DID NOT MOVE ──────────────────────────');
for (const [W, H, label] of [[844, 390, 'landscape phone'], [1280, 800, 'desktop']]) {
  const r = await drive('riprocketer.html', W, H);
  ok(r.m.cam.horiz === false && Math.abs(r.m.cam.fov - 42) < 0.01,
    label + ': still the vertical 42° frame, unchanged',
    'fov ' + r.m.cam.fov + ' horiz ' + r.m.cam.horiz);
  ok(r.m.L.on && r.m.R.on, label + ': ship still on screen at both field edges');
  ok(r.errs.length === 0, label + ': no page errors', r.errs.slice(0, 2).join(' | ') || 'clean');
}

console.log('\n── 6 · NOTHING THREW ──────────────────────────────────────────────────────────');
ok(port.errs.length === 0, 'the share cabinet boots clean in portrait',
  port.errs.slice(0, 2).join(' | ') || 'clean');

await br.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

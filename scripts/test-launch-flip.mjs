/* DOES THE COUNTDOWN ACTUALLY FLIP AT 11:11 PM ON AUGUST 6?   npm run test:launch
 *
 * ⛔ WHY THIS EXISTS. This is the one piece of the site that must work at a single instant, in
 *    public, with no second attempt — and until 2026-08-02 it was broken and nobody had run it.
 *    `.lc-grid{display:flex}` beat the user agent's `[hidden]{display:none}`, so `grid.hidden =
 *    true` set the attribute and changed nothing: at 11:11 PM the clock would have kept counting
 *    *underneath* "▓ THE PACK IS OPEN ▓". The mobile pass added a global
 *    `[hidden]{display:none!important}` that fixes it. This test is what stops it coming back —
 *    any future rule that sets `display` on either element re-opens the same hole.
 *
 * ⚑ IT DRIVES THE REAL PAGE ACROSS THE REAL BOUNDARY. The clock is moved to three seconds before
 *   the target and then left to run, so the flip happens the way it will happen on the night —
 *   inside the page's own `setInterval`, not by calling a function directly. Checking
 *   `grid.hidden === true` would have PASSED on the broken build; the assertion has to be that
 *   the element is not RENDERED.
 *
 * ⚠ `Date.UTC` is left alone. The page computes its target with it and the whole point is to test
 *   the page's own arithmetic — only `Date.now` moves.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.gif': 'image/gif',
  '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg' };
const srv = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]); if (p === '/') p = '/index.html';
  try { const d = readFileSync(join(ROOT, p));
    rs.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); rs.end(d); }
  catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

/* The launch instant, stated twice on purpose. If the page's own target ever drifts from this the
 * test fails on the FIRST assertion rather than quietly measuring the wrong moment. */
const TARGET = Date.UTC(2026, 7, 7, 3, 11, 0);      // 2026-08-06 23:11 America/New_York (EDT)

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (c) console.log('  ok    ' + m); else { fails++; console.log('  FAIL  ' + m); } };

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

/** Open index with Date.now() shifted so the page believes `offsetMs` remain until launch. */
async function at(offsetMs, label) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.message).slice(0, 110)));
  await page.addInitScript(([target, off]) => {
    try { localStorage.setItem('urm_admin_ok', '1'); } catch (e) {}
    const real = Date.now;
    const skew = (target - off) - real();          // constant offset; the clock still RUNS
    Date.now = () => real() + skew;
  }, [TARGET, offsetMs]);
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 45000 });
  return { ctx, page, errs, label };
}

/** What a human would see: is the box actually painted, and what does it say? */
const read = page => page.evaluate(() => {
  const vis = el => {
    if (!el) return null;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
             display: cs.display, attr: el.hasAttribute('hidden'), w: Math.round(r.width) };
  };
  const g = document.getElementById('lcGrid'), l = document.getElementById('lcLive');
  return { grid: vis(g), live: vis(l),
    digits: g ? ['lcD', 'lcH', 'lcM', 'lcS'].map(i => (document.getElementById(i) || {}).textContent).join(':') : null,
    liveText: l ? l.textContent.trim() : null };
});

console.log('\n── before launch: the clock is counting ──');
{
  const { ctx, page, errs } = await at(3 * 86400e3, 'T-3d');
  const r = await read(page);
  ok(r.grid && r.grid.shown, `the countdown is on screen  — ${r.grid && r.grid.w}px wide`);
  ok(r.live && !r.live.shown, 'THE PACK IS OPEN is not');
  /* ⚠ NOT an equality check. The skew is fixed when navigation starts and the page's first tick
   *   runs seconds later under SwiftShader, so a 3-day offset renders as 2:23:59:5x. Asserting
   *   the exact string would be asserting this container's load time. */
  ok(/^2:23:5[0-9]:|^3:00:00:/.test(r.digits), `and it reads three days out  — ${r.digits}`);
  ok(errs.length === 0, errs.length ? 'page errors: ' + errs[0] : 'no page errors');
  await ctx.close();
}

console.log('\n── the page crosses 11:11 PM on its own clock ──');
{
  /* ⚠ 20 s, not 3. Page load costs several seconds here and it is spent OUT OF THE OFFSET, so a
   *   3 s margin had already flipped before the first read — the test then measured nothing. */
  const { ctx, page, errs } = await at(20000, 'T-20s');
  const before = await read(page);
  ok(before.grid.shown && !before.live.shown, `on arrival the clock is still up  — ${before.digits}`);
  /* Wait for the flip the way the night will produce it: the page's own 1 s interval. */
  let flipped = false;
  for (let i = 0; i < 70 && !flipped; i++) {
    await page.waitForTimeout(500);
    const r = await read(page);
    flipped = !r.grid.shown && r.live.shown;
  }
  const after = await read(page);
  ok(flipped, 'it flipped, driven by the page\'s own setInterval');
  /* ⛔ THE ASSERTION THAT BITES. `hidden` was SET on the broken build too — the attribute was
   *    never the problem, the rendering was. Assert the box is gone, not that the flag is on. */
  ok(after.grid.attr, 'the countdown carries [hidden]');
  ok(!after.grid.shown, `and is genuinely NOT RENDERED  — display:${after.grid.display}` +
     (after.grid.display !== 'none' ? '  ⛔ [hidden] IS BEING OVERRIDDEN' : ''));
  ok(after.live.shown, `THE PACK IS OPEN is on screen  — ${after.live.w}px wide`);
  ok(after.liveText === '▓ THE PACK IS OPEN ▓', `and reads right  — ${JSON.stringify(after.liveText)}`);
  ok(errs.length === 0, errs.length ? 'page errors: ' + errs[0] : 'no page errors through the flip');
  await ctx.close();
}

console.log('\n── a late arrival, well after launch, sees the open state immediately ──');
{
  const { ctx, page, errs } = await at(-6 * 3600e3, 'T+6h');
  const r = await read(page);
  ok(!r.grid.shown, `no stale countdown  — display:${r.grid.display}`);
  ok(r.live.shown, 'THE PACK IS OPEN on first paint, with no interval needed');
  ok(errs.length === 0, errs.length ? 'page errors: ' + errs[0] : 'no page errors');
  await ctx.close();
}

console.log(`\n${checks - fails} passed, ${fails} failed.`);
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);

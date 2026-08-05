/* ripmaster3030studios — THE PRESS MUST NEVER TAKE A CARD AWAY.   node scripts/test-press.mjs
 *
 * Artist, 2026-08-05: *"the cards are not displaying in the viewer, the binder, the binder
 * viewer, or into the deck."* They were not. `js/card-press.js` replaced a WORKING card with the
 * press's output before knowing the press had produced anything — so on a machine where the press
 * built correctly and drew nothing, every card surface on the site went blank at once.
 *
 * ⛔ THAT IS A FAIL-OPEN VIOLATION, AND FAIL-OPEN IS THIS PROJECT'S ONE STANDING PRINCIPLE.
 *   Everything else here is allowed to be absent — no WebGL2, no engine, a blocked script, a
 *   404 on a manifest — and the page is still the page it was. The press was the first thing in
 *   the repo that could make the page WORSE by failing.
 *
 * ⚑ THE ONLY TEST THAT MEANS ANYTHING IS A SABOTAGE. "Does the press work" is the easy question
 *   and it was always yes. The question that matters is what happens when it DOESN'T, and you
 *   cannot ask that of a healthy press — you have to break one. `deadPress()` below builds a
 *   perfectly good controller whose `render()` clears to nothing, which is precisely the failure
 *   the artist hit and precisely what no amount of reading the code revealed.
 *
 * ⚠ AND IT ASSERTS BOTH DIRECTIONS, because "no card is ever blanked" is trivially satisfied by
 *   never pressing anything at all. A guard that is too strict looks exactly like a guard that
 *   works. So a HEALTHY press must still visibly press.
 *
 * ⚠ Judge STRUCTURE here, never hue — this container's screenshot path rotates hue on canvas
 *   content (CLAUDE.md). "Is there a picture" is a tonal-range question and survives that.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = '/home/user/upperdeckripmaster3030';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.avif': 'image/avif' };
const PORT = 8951;

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ok   ' + msg + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + msg + (detail ? '  — ' + detail : '')); }
};

const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const b = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => srv.listen(PORT, r));

const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* ⛔ THE SABOTAGE. A press that BUILDS correctly — right plates, right seed, no error anywhere —
 * and renders nothing. This is not a hypothetical: it is what the artist's machine did, and every
 * signal available to the page said the press was healthy. */
const deadPress = () => {
  const t = setInterval(() => {
    if (!window.HeroCard) return;
    clearInterval(t);
    const real = window.HeroCard.build;
    window.HeroCard.build = (o) => real(o).then(c => {
      if (!c) return c;
      const gl = o.canvas.getContext('webgl2');
      c.render = () => { try { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } catch (e) {} };
      c.advance = () => {};
      return c;
    });
  }, 5);
};

/* Does this element actually show a PICTURE? Not "is it opaque" — the press's stock is near-white,
 * so a blank card is fully opaque and completely empty. A picture has tonal RANGE. */
const INK = (sel) => {
  const range = (el) => {
    const cv = document.createElement('canvas'); cv.width = 48; cv.height = 72;
    const g = cv.getContext('2d');
    try { g.drawImage(el, 0, 0, 48, 72); } catch (e) { return -1; }
    const d = g.getImageData(0, 0, 48, 72).data;
    let lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 8) continue;
      const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (l < lo) lo = l;
      if (l > hi) hi = l;
    }
    return hi - lo;
  };
  const els = [...document.querySelectorAll(sel)].slice(0, 8);
  return {
    n: els.length,
    alive: els.filter(e => range(e) > 24).length,
    pressed: els.filter(e => e.hasAttribute('data-pressed')).length,
  };
};

async function visit(url, { sabotage } = {}) {
  const ctx = await br.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  if (sabotage) await ctx.addInitScript(deadPress);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: 'load', timeout: 60000 });
  return { ctx, page, errs };
}

console.log('\n── 1 · A DEAD PRESS MUST NOT COST A SINGLE CARD ───────────────────────────────');
for (const [url, sel, label] of [['/cards/', '.tile-art img', 'the deck browser'],
                                 ['/cards/binder.html', '.pk img', "the folder's pockets"]]) {
  const { ctx, page, errs } = await visit(url, { sabotage: true });
  await page.waitForTimeout(22000);
  const s = await page.evaluate(INK, sel);
  ok(s.n > 0 && s.alive === s.n,
    `${label} keeps every card when the press draws nothing`,
    `${s.alive}/${s.n} still showing a picture`);
  ok(errs.length === 0, `…and nothing threw doing it`, errs.slice(0, 2).join(' | ') || 'clean');
  await ctx.close();
}

console.log('\n── 2 · …AND A HEALTHY PRESS MUST STILL VISIBLY PRESS ──────────────────────────');
/* ⚠ Without this the suite passes on a build where the guard is simply always false — a press
 *   that never engages loses no cards at all. Too strict and too broken look identical. */
{
  const { ctx, page } = await visit('/cards/');
  await page.waitForTimeout(6000);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => scrollBy(0, innerHeight * 0.8));
    await page.waitForTimeout(11000);
  }
  const s = await page.evaluate(INK, '.tile-art img[data-pressed]');
  const total = await page.evaluate(() =>
    document.querySelectorAll('.tile-art img[data-pressed]').length);
  ok(total > 0, 'the deck browser actually presses tiles', total + ' pressed');
  ok(s.n > 0 && s.alive === s.n,
    '…and every pressed tile carries a picture, not a blank',
    `${s.alive}/${s.n}`);
  await ctx.close();
}

console.log('\n── 3 · THE GUARD ITSELF: a flat fill is not a card ────────────────────────────');
/* The property `hasInk` exists to defend, asserted on the function rather than through three
 * layers of page. A canvas cleared to the press's own paper-white is FULLY OPAQUE and completely
 * empty — which is why "alpha > 0" was never the right test. */
{
  const { ctx, page } = await visit('/cards/');
  await page.waitForTimeout(4000);
  const r = await page.evaluate(async () => {
    const mk = (paint) => { const c = document.createElement('canvas');
      c.width = 120; c.height = 180; paint(c.getContext('2d')); return c; };
    const blankTransparent = mk(g => g.clearRect(0, 0, 120, 180));
    const blankPaper = mk(g => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 120, 180); });
    const real = mk(g => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 120, 180);
                           g.fillStyle = '#101014'; g.fillRect(14, 20, 92, 120); });
    // reach the private guard the way the module uses it: through bake's contract
    const H = window.CardPress && window.CardPress.__hasInk;
    return { exposed: !!H,
             transparent: H ? H(blankTransparent) : null,
             paper: H ? H(blankPaper) : null,
             real: H ? H(real) : null };
  });
  ok(r.exposed, 'the ink test is reachable for assertion', String(r.exposed));
  if (r.exposed) {
    ok(r.transparent === false, 'an empty transparent canvas has no ink', String(r.transparent));
    ok(r.paper === false, '…and neither does one flooded with paper-white — THIS is the one that '
      + 'an alpha test gets wrong', String(r.paper));
    ok(r.real === true, '…while a canvas with an actual mark on it does', String(r.real));
  }
  await ctx.close();
}

await br.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

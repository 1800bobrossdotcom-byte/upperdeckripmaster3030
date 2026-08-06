#!/usr/bin/env node
/* ripmaster3030studios — EVERY CARD IN THE HUNDRED ACTUALLY PRINTS.  `npm run test:deck`
 *
 * ⛔ A RECORD THAT PARSES IS NOT A CARD THAT PRINTS. `cards/deck.json` is a list of query
 *   strings; a wrong plate slug, an unknown dial or a bad number does not throw — the press
 *   falls open and prints something, or prints nothing, and the JSON looks perfect either way.
 *   This repo's one fail-open violation was exactly that shape (a working card replaced by an
 *   empty bake) and it was invisible to every static check.
 *
 * ⚑ SO EACH CARD IS BOOTED THROUGH ITS OWN URL. `cards/proof.html?<q>` is how the artist loads a
 *   saved card, and the forge's own note says a saved card IS its URL — so this drives the path
 *   that actually runs rather than reconstructing the press by hand. Anything that would break on
 *   his screen breaks here.
 *
 * ⚠ "NOT BLANK" IS NOT "ALPHA > 0". The press stock is near-white, so a sheet cleared to paper is
 *   fully opaque and completely empty. A card is a picture and a picture has TONAL RANGE, so the
 *   test is VARIANCE — the same discriminator `cards/card-stage.js` and `test:press` use.
 *
 * ⚠ readPixels is called in the SAME TASK as render(). Without preserveDrawingBuffer the buffer
 *   is already cleared by the time a later turn runs, which reads as a dead press and is the
 *   harness. Recorded in CLAUDE.md; reproduced here on purpose.
 *
 * Usage: node scripts/test-deck.mjs [--only 23,24] [--all]
 *   default: every card the deck declares.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? null : process.argv[i + 1]; };
const only = arg('--only')?.split(',').map(s => s.trim()).filter(Boolean);

const deck = JSON.parse(readFileSync(join(ROOT, 'cards/deck.json'), 'utf8'));
const nums = Object.keys(deck.cards).map(Number).sort((a, b) => a - b)
  .filter(n => !only || only.includes(String(n)));

const srv = createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { rs.writeHead(404); return rs.end('nf'); }
  rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  rs.end(readFileSync(f));
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });

let checks = 0, fails = 0;
const ok = (c, m, d) => {
  checks++; if (!c) fails++;
  if (!c) console.log(`  FAIL ${m}${d !== undefined ? '  — ' + d : ''}`);
};

console.log(`\n── ${nums.length} cards, each booted through its own URL ──\n`);
const rows = [];
for (const n of nums) {
  const rec = deck.cards[String(n)];
  const before = errs.length;
  await page.goto(`http://localhost:${PORT}/cards/proof.html?${rec.q}`, { waitUntil: 'domcontentloaded' });

  /* ⚑ PUMP rAF FROM INSIDE THE PAGE. This container delivers a handful of real frames in ten
   * seconds, so a wall-clock wait reports a press that never ran — third sighting of that trap
   * in this repo. The write-on lands over ~1.5s of press time, so advance it deliberately. */
  const m = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 60 && !window.__proof; i++) await wait(100);
    const c = window.__proof;
    if (!c) return { built: false };
    try { c.writeOn(1); } catch {}
    for (let i = 0; i < 120; i++) { try { c.advance(16.6667); } catch {} }
    try { c.render(); } catch {}

    /* Same task as render() — see the header note. */
    const cv = document.getElementById('cv');
    const gl = cv && (cv.getContext('webgl2') || cv.getContext('webgl'));
    if (!gl) return { built: true, gl: false };
    const W = 64, H = 96;
    const px = new Uint8Array(W * H * 4);
    // sample the middle of the sheet, away from the trim
    const x0 = Math.floor(cv.width * 0.5 - W / 2), y0 = Math.floor(cv.height * 0.5 - H / 2);
    gl.readPixels(x0, y0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0, sq = 0, cnt = 0, opaque = 0;
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      sum += l; sq += l * l; cnt++; if (px[i + 3] > 250) opaque++;
    }
    const mean = sum / cnt;
    const sd = Math.sqrt(Math.max(0, sq / cnt - mean * mean));
    const p = (() => { try { return c.probe(); } catch { return {}; } })();
    return { built: true, gl: true, mean: +mean.toFixed(1), sd: +sd.toFixed(1),
             opaque: opaque / cnt, pigment: (p.pigment || []).length, sheet: p.sheet };
  });

  const newErrs = errs.slice(before);
  ok(m.built, `card ${n} — the press built`, m.built ? '' : 'no __proof');
  ok(m.gl !== false, `card ${n} — WebGL2 context`, '');
  /* THE ASSERTION THAT BITES: tonal range. A paper-white sheet is opaque and empty. */
  ok((m.sd || 0) > 6, `card ${n} "${rec.name}" — real ink on the sheet (variance)`,
    `sd ${m.sd} mean ${m.mean}`);
  ok(newErrs.length === 0, `card ${n} — no page errors`, newErrs[0] || '');
  rows.push({ n, name: rec.name, band: rec.band, sd: m.sd, mean: m.mean, plates: m.pigment });
}

/* A summary that makes a dead band visible at a glance rather than buried in 400 lines. */
const bad = rows.filter(r => !(r.sd > 6));
console.log(`  printed ${rows.length - bad.length}/${rows.length}` +
  `   sd min ${Math.min(...rows.map(r => r.sd || 0)).toFixed(1)}` +
  ` · median ${rows.map(r => r.sd || 0).sort((a, b) => a - b)[Math.floor(rows.length / 2)].toFixed(1)}` +
  ` · max ${Math.max(...rows.map(r => r.sd || 0)).toFixed(1)}`);
if (bad.length) console.log('  BLANK: ' + bad.map(r => r.n).join(', '));
/* ⚠ ALWAYS NAME THE WEAKEST SHEETS, PASS OR FAIL. A summary that prints only the minimum hides
 *   WHICH card is at the minimum, and a card sitting 0.3 above the bar is inside this container's
 *   own noise — it is a card to look at, not a card that passed. Reporting only failures is how a
 *   marginal case becomes a regression nobody saw coming. */
const weak = rows.slice().sort((a, b) => (a.sd || 0) - (b.sd || 0)).slice(0, 5);
console.log('  faintest: ' + weak.map(r => `${r.n} "${r.name}" sd ${r.sd}`).join(' · '));

await browser.close(); srv.close();
console.log(`\n${checks - fails} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);

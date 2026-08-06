#!/usr/bin/env node
/* ripmaster3030studios — PRINT THE HUNDRED TO DISK.  `npm run deck:bake`
 *
 * `cards/deck.json` holds the hundred as PRESS RECIPES — a query string each. That is the right
 * master (it reproduces exactly, and it re-prints when the press improves), but it is not
 * something the gallery, the pack, the binder or a game can put on screen: every one of them
 * wants an image URL. This pulls a real sheet for each card and writes it out.
 *
 * ⛔ THE PIGMENT IS NOT THE DECK, AND CONFLATING THEM WOULD DESTROY THE HUNDRED.
 *   `cards/manifest.json` + `cards/hero-manifest.json` are the 211 SOURCE pictures the press
 *   prints FROM — every saved card names its six plates by slug out of that pool. They are ink,
 *   not cards. Repointing `manifest.json` at the hundred would stop every plate slug resolving,
 *   the press would fall back to a seeded pick, and all 100 cards would silently change. So the
 *   pigment manifests are left exactly alone and the deck gets its OWN manifest.
 *   (`scripts/clean-slate.mjs` archives `cards/art/*.webp`. Do NOT run it: that is the ink.)
 *
 * ⚠ NEVER WRITES A BLANK. The press stock is near-white, so an empty sheet is fully opaque and
 *   completely empty — "not blank" is not "alpha > 0". Each bake is measured for TONAL VARIANCE
 *   before it is allowed to hit the disk, and a card that fails is reported rather than written.
 *   A blank file on disk is worse than a missing one: it looks finished.
 *
 * Usage: node scripts/bake-deck.mjs [--only 23,24] [--size 640]
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = join(ROOT, 'cards/art/deck');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? null : process.argv[i + 1]; };
const only = arg('--only')?.split(',').map(s => s.trim()).filter(Boolean);
const W = Number(arg('--size') || 640), H = Math.round(W * 1.5);

const deck = JSON.parse(readFileSync(join(ROOT, 'cards/deck.json'), 'utf8'));
const nums = Object.keys(deck.cards).map(Number).sort((a, b) => a - b)
  .filter(n => !only || only.includes(String(n)));
mkdirSync(OUTDIR, { recursive: true });

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
const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });

const out = [], blank = [];
for (const n of nums) {
  const rec = deck.cards[String(n)];
  await page.goto(`http://localhost:${PORT}/cards/proof.html?${rec.q}`, { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(async ({ W, H }) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 60 && !window.__proof; i++) await wait(100);
    const c = window.__proof;
    if (!c) return { ok: false, why: 'press never built' };
    const cv = document.getElementById('cv');
    /* ⛔ SUPERSAMPLE, BECAUSE THE SCREEN RULING IS A PROPERTY OF THE PRINT AND THE PIXEL COUNT IS
     *   A PROPERTY OF THE BUFFER. The press lays a fixed 170 halftone cells across the card; bake
     *   straight to 480px and a cell is under 3 device pixels, which aliases into moiré — a
     *   RENDERING failure that looks exactly like a printing one, and this repo has already
     *   chased it once and (correctly) refused to "fix" it in the shader. Render at 2x and let
     *   the downsample average the dots, which is optically what stepping back from a real card
     *   does. */
    cv.width = W * 2; cv.height = H * 2;
    try { c.resize && c.resize(); } catch {}
    /* Finish the sheet before pulling it — the impression lands down the sheet over about a
     * second and a half of press time, so a card grabbed at build is a card half printed. */
    try { c.writeOn(1); } catch {}
    for (let i = 0; i < 150; i++) { try { c.advance(16.6667); } catch {} }
    try { c.render(); } catch {}

    /* Measure IN THE SAME TASK as render() — hero-card sets preserveDrawingBuffer, but the
     * variance check must reflect the frame we are about to encode, not a later one. */
    /* Downsample 2x -> 1x with smoothing on. This IS the anti-aliasing; encoding straight from
     * the big canvas would just ship a bigger file with the same moiré at display size. */
    const o = document.createElement('canvas'); o.width = W; o.height = H;
    const oc = o.getContext('2d');
    oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
    oc.drawImage(cv, 0, 0, W, H);

    const t = document.createElement('canvas'); t.width = 64; t.height = 96;
    const x = t.getContext('2d'); x.drawImage(o, 0, 0, 64, 96);
    const d = x.getImageData(0, 0, 64, 96).data;
    let sum = 0, sq = 0, cnt = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += l; sq += l * l; cnt++;
    }
    const mean = sum / cnt, sd = Math.sqrt(Math.max(0, sq / cnt - mean * mean));
    return { ok: true, sd: +sd.toFixed(1), url: o.toDataURL('image/webp', 0.86) };
  }, { W, H });

  /* ⛔ THE GUARD. A sheet with no tonal range is an empty press, and writing it would put a
   *   plausible-looking blank on the site — the exact fail-open violation this repo already paid
   *   for once. Report it; do not write it. */
  if (!r.ok || !(r.sd > 6) || !r.url || r.url.length < 2000) {
    blank.push({ n, why: r.why || `sd ${r.sd}` });
    console.log(`  ✗ ${n} "${rec.name}" — NOT written (${r.why || 'sd ' + r.sd})`);
    continue;
  }
  const buf = Buffer.from(r.url.split(',')[1], 'base64');
  writeFileSync(join(OUTDIR, `${n}.webp`), buf);
  out.push({ n, name: rec.name, rarity: rec.rarity, band: rec.band, seed: rec.seed,
             bytes: buf.length, sd: r.sd });
  if (out.length % 10 === 0) console.log(`  … ${out.length}/${nums.length}`);
}

await browser.close(); srv.close();

/* ── the DECK manifest — separate from the pigment manifests, on purpose ─────────────────────
 * Same row shape the site's other manifests use (`art` + `title` + `slug` + `rarity`), so the
 * gallery, the pack and the binder can read it without special-casing anything. */
const manifest = {
  studio: 'ripmaster3030studios',
  set: 'the hundred',
  note: 'THE DECK. cards/manifest.json is the PIGMENT the press prints from — a different thing.',
  count: out.length,
  cards: out.map(c => ({
    id: c.n,
    slug: String(c.n),
    art: `art/deck/${c.n}.webp`,
    title: c.name,
    rarity: c.rarity,
    band: c.band,
    href: `card.html?n=${c.n}`,
  })),
};
writeFileSync(join(ROOT, 'cards/deck-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const kb = out.reduce((a, c) => a + c.bytes, 0) / 1024;
console.log(`\n✦ baked ${out.length}/${nums.length}  ·  ${Math.round(kb)} KB total, ${Math.round(kb / (out.length || 1))} KB/card`);
if (blank.length) console.log(`⛔ NOT written (${blank.length}): ` + blank.map(b => `${b.n} (${b.why})`).join(', '));
console.log(`→ cards/art/deck/*.webp  ·  cards/deck-manifest.json`);
process.exit(blank.length ? 1 : 0);

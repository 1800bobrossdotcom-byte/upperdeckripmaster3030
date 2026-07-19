#!/usr/bin/env node
// Measure the VISUAL traits of every card straight off its pixels, so rarity can be
// derived from what the art actually looks like (see scripts/derive-rarity.mjs).
// Writes cards/data/_traits.json: one row per card with foil-sparkle, gold-leaf,
// colorfulness (Hasler–Süsstrunk), palette breadth, neon, edge/background variance
// (full-bleed vs framed) and contrast — all normalized 0..1 or comparable scales.
//
// Runs a headless Chromium (playwright-core) so it can decode the .webp art into a
// canvas and read the pixels. Serve the repo (any static server) or let this script
// spin its own file server, then:
//
//   node scripts/extract-traits.mjs
//
// Deterministic given the art; re-run whenever the deck's images change, then run
// derive-rarity.mjs to re-bucket. Provenance for the committed _traits.json.

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { rootDir } from './make-card.mjs';

const chromiumPath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('needs playwright-core (npm i -D playwright-core) + a chromium at CHROMIUM_PATH'); process.exit(1); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif' };
const srv = createServer(async (req, res) => {
  try { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const buf = await readFile(join(rootDir, normalize(p)));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(buf);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;
const manifest = JSON.parse(await readFile(join(rootDir, 'cards/manifest.json'), 'utf8'));

const browser = await chromium.launch({ executablePath: chromiumPath });
const page = await (await browser.newContext()).newPage();
await page.goto(base + '/cards/', { waitUntil: 'domcontentloaded' });
const traits = await page.evaluate(async (cards) => {
  const rgb2hsv = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, mx ? d / mx : 0, mx]; };
  const loadImg = src => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const S = 96, T = 144, cv = document.createElement('canvas'); cv.width = S; cv.height = T;
  const g = cv.getContext('2d', { willReadFrequently: true }); const out = [];
  for (const c of cards) { const im = await loadImg('art/' + c.slug + '.webp'); if (!im) { out.push({ slug: c.slug, err: 1 }); continue; }
    g.clearRect(0, 0, S, T); g.drawImage(im, 0, 0, S, T); let d; try { d = g.getImageData(0, 0, S, T).data; } catch { out.push({ slug: c.slug, err: 1 }); continue; }
    let n = 0, sumV = 0, sumV2 = 0, sat6 = 0, gold = 0, sparkle = 0, neon = 0; const hueB = new Array(12).fill(0), rgArr = [], ybArr = [];
    for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], b = d[i + 2]; const [h, s, v] = rgb2hsv(r, gg, b); n++;
      sumV += v; sumV2 += v * v; if (s > 0.6 && v > 0.6) neon++; if (s > 0.55) sat6++;
      if (h >= 38 && h <= 58 && s > 0.4 && v > 0.55) gold++; if (v > 0.9 && s < 0.28) sparkle++;
      hueB[Math.floor(h / 30) % 12] += (s > 0.25 ? 1 : 0); rgArr.push(r - gg); ybArr.push(0.5 * (r + gg) - b); }
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length, std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
    const colorfulness = Math.sqrt(std(rgArr) ** 2 + std(ybArr) ** 2) + 0.3 * Math.sqrt(mean(rgArr) ** 2 + mean(ybArr) ** 2);
    const paletteDiv = hueB.map(x => x / n).filter(x => x > 0.03).length;
    let ring = []; for (let x = 0; x < S; x++)[0, 1, T - 2, T - 1].forEach(y => { const i = (y * S + x) * 4; ring.push([d[i], d[i + 1], d[i + 2]]); });
    for (let y = 0; y < T; y++)[0, 1, S - 2, S - 1].forEach(x => { const i = (y * S + x) * 4; ring.push([d[i], d[i + 1], d[i + 2]]); });
    const rv = std(ring.map(c => c[0])) + std(ring.map(c => c[1])) + std(ring.map(c => c[2]));
    const meanV = sumV / n, contrast = Math.sqrt(sumV2 / n - meanV * meanV);
    out.push({ slug: c.slug, colorfulness: +colorfulness.toFixed(1), neon: +(neon / n).toFixed(3), sat: +(sat6 / n).toFixed(3),
      gold: +(gold / n).toFixed(3), sparkle: +(sparkle / n).toFixed(3), paletteDiv, bgVar: +rv.toFixed(1), bright: +meanV.toFixed(3), contrast: +contrast.toFixed(3) });
  }
  return out;
}, manifest.cards);
await writeFile(join(rootDir, 'cards/data/_traits.json'), JSON.stringify(traits));
console.log(`✦ traits: ${traits.filter(t => !t.err).length}/${traits.length} cards → cards/data/_traits.json`);
await browser.close(); srv.close();

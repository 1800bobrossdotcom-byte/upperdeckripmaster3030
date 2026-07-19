#!/usr/bin/env node
// Bake a little pack of ORIGINAL, self-made animated GIFs for the Forge's GIF
// drawer — the lo-fi GeoCities-web vibe (twinkles, flames, peace signs, a UFO)
// without scraping anyone's server. Guaranteed SFW because we draw every pixel.
// Output: cards/gifs/*.gif  +  cards/gifs/gifs.json (the drawer reads that list).
//
// The Forge's GIF drawer is folder-driven: drop any extra .gif into cards/gifs/
// and add a line to gifs.json and it shows up as a brush. So this is a seed set,
// not a ceiling.
//
//   node scripts/make-gifs.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { rootDir } from './make-card.mjs';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;

const S = 48;                                 // chunky, authentic
const outDir = join(rootDir, 'cards', 'gifs');
mkdirSync(outDir, { recursive: true });

// ── tiny raster helpers (RGBA buffer) ──
const buf = () => new Uint8ClampedArray(S * S * 4);
const px = (b, x, y, r, g, bl, a = 255) => { if (x < 0 || y < 0 || x >= S || y >= S) return; const i = (y * S + x) * 4; b[i] = r; b[i + 1] = g; b[i + 2] = bl; b[i + 3] = a; };
const hsv = (h, s, v) => { h = ((h % 360) + 360) % 360; const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c; let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; };
const inPoly = (x, y, pts) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
  const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; };
const starPts = (cx, cy, R, r, n, rot) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r : R; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return p; };

// ── each generator returns an array of RGBA frames ──
const C = S / 2;
const GENS = {
  sparkle: () => Array.from({ length: 6 }, (_, f) => { const b = buf(); const R = 8 + 10 * Math.abs(Math.sin(f / 6 * Math.PI));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = x - C, dy = y - C, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const spikes = Math.abs(Math.cos(a * 2)); if (d < R * (0.25 + 0.75 * spikes ** 3)) { const t = d / R; px(b, x, y, 255, 255 * (1 - t) + 200 * t, 255 * (1 - t * .3)); } }
    return b; }),
  star: () => Array.from({ length: 8 }, (_, f) => { const b = buf(); const pts = starPts(C, C, 20, 8, 5, f / 8 * Math.PI * 2 - Math.PI / 2);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inPoly(x, y, pts)) { const edge = inPoly(x, y, starPts(C, C, 17, 6.5, 5, f / 8 * Math.PI * 2 - Math.PI / 2)); px(b, x, y, edge ? 255 : 30, edge ? 220 : 20, edge ? 40 : 10); } return b; }),
  flame: () => Array.from({ length: 6 }, (_, f) => { const b = buf(); const wob = Math.sin(f / 6 * Math.PI * 2);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const t = (S - y) / S; const w = 15 * t * (1 - t * .3) + wob * 2 * (1 - t); const cx = C + wob * 3 * t;
      if (Math.abs(x - cx) < w && y > 6) { const hh = (y - 6) / (S - 6); const col = hh > .66 ? [255, 240, 120] : hh > .33 ? [255, 140, 30] : [220, 40, 20]; px(b, x, y, ...col); } } return b; }),
  heart: () => Array.from({ length: 4 }, (_, f) => { const b = buf(); const sc = 1 + 0.12 * Math.sin(f / 4 * Math.PI * 2);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const nx = (x - C) / (16 * sc), ny = (C - y + 4) / (16 * sc); const v = (nx * nx + ny * ny - 1) ** 3 - nx * nx * ny * ny * ny;
      if (v < 0) { const edge = ((nx * 1.15) ** 2 + (ny * 1.15) ** 2 - 1) ** 3 - (nx * 1.15) ** 2 * (ny * 1.15) ** 3 > 0; px(b, x, y, 255, edge ? 90 : 30, edge ? 130 : 70); } } return b; }),
  rainbow: () => Array.from({ length: 8 }, (_, f) => { const b = buf(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { if (y < 8 || y > 40) continue; const [r, g, bl] = hsv((x + f * 6) * 6, 1, 1); px(b, x, y, r, g, bl); } return b; }),
  peace: () => Array.from({ length: 8 }, (_, f) => { const b = buf(); const rot = f / 8 * Math.PI * 2; const R = 19;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = x - C, dy = y - C, d = Math.hypot(dx, dy); const ring = d < R && d > R - 4;
      const ar = Math.atan2(dy, dx) - rot; const vert = Math.abs(dx * Math.cos(-rot) - dy * Math.sin(-rot)) < 2 && d < R;
      const legL = Math.abs((dx) * Math.cos(-rot - 2.356) - (dy) * Math.sin(-rot - 2.356)) < 2 && d < R && (dx * Math.sin(rot) + dy * Math.cos(rot)) > 0;
      const legR = Math.abs((dx) * Math.cos(-rot + 2.356) - (dy) * Math.sin(-rot + 2.356)) < 2 && d < R && (dx * Math.sin(rot) + dy * Math.cos(rot)) > 0;
      if (ring || vert || legL || legR) px(b, x, y, 60, 240, 120); } return b; }),
  ufo: () => Array.from({ length: 6 }, (_, f) => { const b = buf(); const bob = Math.round(Math.sin(f / 6 * Math.PI * 2) * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = x - C, dy = y - (C + bob);
      if ((dx / 20) ** 2 + (dy / 7) ** 2 < 1) px(b, x, y, 150, 160, 180);                 // saucer
      if ((dx / 9) ** 2 + ((dy + 6) / 8) ** 2 < 1 && dy < -2) px(b, x, y, 120, 230, 255, 220); } // dome
    for (let i = -2; i <= 2; i++) { const on = (f + i + 6) % 3 === 0; const [r, g, bl] = hsv(i * 60 + f * 40, 1, 1); if (on) { px(b, C + i * 7, C + bob + 4, r, g, bl); px(b, C + i * 7 + 1, C + bob + 4, r, g, bl); } } return b; }),
  spiral: () => Array.from({ length: 8 }, (_, f) => { const b = buf(); const rot = f / 8 * Math.PI * 2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = x - C, dy = y - C, d = Math.hypot(dx, dy); if (d > 21) continue; const a = Math.atan2(dy, dx);
      const band = Math.sin(a * 3 + d * 0.9 - rot * 3) > 0; px(b, x, y, band ? 20 : 240, band ? 20 : 60, band ? 30 : 240); } return b; }),
};

const meta = [];
for (const [name, gen] of Object.entries(GENS)) {
  const frames = gen();
  const enc = GIFEncoder();
  for (const rgba of frames) {
    const palette = quantize(rgba, 64, { format: 'rgba4444' });
    const index = applyPalette(rgba, palette, 'rgba4444');
    enc.writeFrame(index, S, S, { palette, transparent: true, delay: 110, dispose: 2 });
  }
  enc.finish();
  writeFileSync(join(outDir, `${name}.gif`), enc.bytes());
  meta.push({ file: `${name}.gif`, name });
}
writeFileSync(join(outDir, 'gifs.json'), JSON.stringify({ note: 'Forge GIF drawer. Drop any SFW .gif here and add it below.', gifs: meta }, null, 2));
console.log(`✦ baked ${meta.length} gifs → cards/gifs/  (${meta.map(m => m.name).join(', ')})`);

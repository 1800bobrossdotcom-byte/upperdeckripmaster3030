#!/usr/bin/env node
/* ripmaster3030studios — COVER ART for the game listings.  `npm run cover`
 *
 * itch.io REQUIRES a cover image (min 315×250, recommended 630×500) and refuses to publish
 * without one. Ours are cut from the gameplay screenshots the listing pack already captured.
 *
 * ⛔ CUT FROM THE GAME, NOT COMPOSED ABOUT IT — the same rule as `npm run mark` cutting the
 *   wordmark out of the live foil rather than redrawing it. A cover painted in a tool is a claim
 *   about the game; a crop of the running game IS the game, and it cannot drift from what a
 *   player will actually see when they press play.
 * ⚑ BUT A COVER IS SEEN AT ~315 px WIDE IN A GRID, so a straight downscale of a 1280×720 frame
 *   is mush. Two things fix that and both are mechanisms, not taste: crop to 630×500 (1.26:1)
 *   from the 16:9 frame instead of squashing it, and lay the title over the DARKEST quadrant —
 *   measured, not guessed — so the type has contrast to sit on wherever the action happens to be.
 * ⚠ The frame chosen is the one with the MOST tonal range of the three, because the busiest
 *   frame is the one that reads as a game rather than as a sky.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST = join(ROOT, 'build/listing');
if (!existsSync(LIST)) { console.log('  ⛔ run `npm run listing` first'); process.exit(1); }

const TITLES = { riprocketer: 'RIP ROCKETER', cloudracer: 'CLOUD RACER',
  dogfight: 'DOGFIGHT', section9: 'SECTION 9', city: 'THE CITY' };

const srv = createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<html><body></body></html>'); }
  const f = join(ROOT, p);
  if (!existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': 'image/png' }); r.end(readFileSync(f));
});
await new Promise(z => srv.listen(8090, z));
const br = await chromium.launch({ args: ['--no-sandbox'],
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pg = await br.newPage();
await pg.goto('http://localhost:8090/');

const games = readdirSync(LIST).filter(d => statSync(join(LIST, d)).isDirectory());
console.log('\n  COVER ART — 630×500, cut from the gameplay frames\n');

for (const g of games) {
  const shots = readdirSync(join(LIST, g)).filter(f => /^shot-\d+\.png$/.test(f)).sort();
  if (!shots.length) { console.log(`  ${g.padEnd(12)} ⛔ no screenshots`); continue; }
  const out = await pg.evaluate(async ({ urls, title }) => {
    /* pick the busiest frame — most tonal range reads as a game, not as a sky */
    let best = null;
    for (const u of urls) {
      const im = new Image(); im.src = u; await im.decode();
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0, 160, 90);
      const d = x.getImageData(0, 0, 160, 90).data, l = [];
      for (let i = 0; i < d.length; i += 4) l.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      const m = l.reduce((a, b) => a + b, 0) / l.length;
      const sd = Math.sqrt(l.reduce((a, b) => a + (b - m) ** 2, 0) / l.length);
      if (!best || sd > best.sd) best = { u, sd: +sd.toFixed(1), im };
    }
    const W = 630, H = 500;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    /* CROP to 1.26:1 rather than squash a 16:9 frame */
    const im = best.im, srcH = im.naturalHeight, srcW = srcH * (W / H);
    ctx.drawImage(im, (im.naturalWidth - srcW) / 2, 0, srcW, srcH, 0, 0, W, H);

    /* measure the four quadrants and put the type on the darkest one */
    const q = ctx.getImageData(0, 0, W, H).data;
    const lum = (x0, y0, x1, y1) => { let s = 0, n = 0;
      for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) {
        const i = (y * W + x) * 4; s += 0.2126 * q[i] + 0.7152 * q[i + 1] + 0.0722 * q[i + 2]; n++; }
      return s / n; };
    const bottom = lum(0, H / 2, W, H), top = lum(0, 0, W, H / 2);
    const band = bottom <= top ? H - 128 : 0;

    const grd = ctx.createLinearGradient(0, band, 0, band + 128);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.55, 'rgba(0,0,0,.72)'); grd.addColorStop(1, 'rgba(0,0,0,.88)');
    if (band) { ctx.fillStyle = grd; ctx.fillRect(0, band, W, 128); }
    else { const g2 = ctx.createLinearGradient(0, 128, 0, 0);
      g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,.88)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, 128); }

    const ty = band ? H - 46 : 62;
    ctx.font = '700 54px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    let size = 54; while (ctx.measureText(title).width > W - 56 && size > 22) {
      size -= 2; ctx.font = `700 ${size}px ui-monospace, Menlo, monospace`; }
    ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 12;
    ctx.fillText(title, 28, ty);
    ctx.shadowBlur = 0;
    ctx.font = '500 15px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(255,255,255,.66)';
    ctx.fillText('ripmaster3030studios', 30, ty + 24);
    return { png: cv.toDataURL('image/png'), from: best.u.split('/').pop(), sd: best.sd, band: band ? 'bottom' : 'top' };
  }, { urls: shots.map(s => `/build/listing/${g}/${s}`), title: TITLES[g] || g.toUpperCase() });

  const buf = Buffer.from(out.png.split(',')[1], 'base64');
  writeFileSync(join(LIST, g, 'cover.png'), buf);
  console.log(`  ${g.padEnd(12)} cover.png  630×500  ${String(Math.round(buf.length / 1024)).padStart(3)} KB   from ${out.from} (sd ${out.sd}), title on the ${out.band}`);
}
await br.close(); srv.close();
console.log(`\n  → ${LIST}/<game>/cover.png\n`);

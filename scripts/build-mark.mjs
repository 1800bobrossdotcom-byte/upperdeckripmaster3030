/* Cut the square mark into every size the studio actually needs.   npm run mark
 *
 * ⛔ WHY THIS EXISTS, and it is a live bug rather than a nice-to-have.
 *
 *    `index.html`, `cabinet.html` and `superrare.html` all point og:image and twitter:image at
 *    `upperdeckripmaster3030_01_marquee.png` — the OLD NAME, baked into a bitmap. CLAUDE.md
 *    records this exact failure once already: *"the first thing anyone saw was still
 *    UPPERDECKRIPMASTER3030, because it was baked into upperdeckripmaster3030_01_marquee.png."*
 *    The fix then was to make the on-page wordmark TYPE instead of a bitmap. It worked, and it
 *    never reached the META TAGS — so the page says the right name and the SHARE CARD says the
 *    wrong one. Two of the three pages are the SuperRare embed surfaces.
 *    ⚑ Same family as everything else in docs/ROADMAP.md §5: the rename was applied where it was
 *    visible and missed where it was not.
 *
 *    And the second half: the mark was a 9.7:1 band until this session, so there was nothing to
 *    put in a favicon, an app icon or an avatar even if anyone had wanted to. It is square now.
 *
 * ⚑ THE MARK IS SCREENSHOT FROM THE LIVE PAGE, not redrawn here. The wordmark is real foil — a
 *   diffraction shader running against a real view vector over baked surface data — and a
 *   flat re-drawing of it in a build script would be a picture OF the mark rather than the mark,
 *   which is the exact "sticker of foil" failure DESIGN-SYSTEM.md §1 is about. So this drives the
 *   page, waits for the 3D layer to put real ink on the canvas, and captures the wordmark's own
 *   square box.
 *
 * ⚠ HUE IS NOT TRUSTWORTHY IN THIS CONTAINER. CLAUDE.md: the screenshot path rotates hue on
 *   CANVAS content under SwiftShader. So these files are correct in LAYOUT and VALUE and their
 *   colour must be checked on a real machine before launch. The build says so out loud rather
 *   than pretending. Re-run `npm run mark` anywhere with a real GPU and the colour is right.
 *
 * OUT (all under media/site/):
 *   mark-1024.png   the square, for a token image / SuperRare avatar / anything large
 *   mark-512.png    PWA / manifest
 *   mark-180.png    apple-touch-icon
 *   mark-32.png     favicon fallback for browsers that will not take the SVG
 *   og-1200x630.png the share card — the square centred on the studio's own stock, with margin
 */
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { decodePNG, encodePNG } from './png23d.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'media/site');
const PORT = 8997;
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try {
    const d = readFileSync(join(ROOT, p));
    rs.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    rs.end(d);
  } catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(r => srv.listen(PORT, r));

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
/* deviceScaleFactor 3 on a 430-wide box gives ~1290 native pixels to downsample from, so the
 * 1024 output is a genuine downscale rather than an upscale of a 430px capture. */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e && e.message).slice(0, 120)));
await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(9000);

/* Hide everything that is not the mark. The torches flank the wordmark and would crop into a
 * square capture; the intro splash sits over it. This is a CAPTURE-time change to a throwaway
 * page instance, never written to disk. */
const box = await page.evaluate(() => {
  const kill = ['#introSplash', '.torch', '#banner', '.marquee-sign > img'];
  kill.forEach(sel => document.querySelectorAll(sel).forEach(e => { e.style.visibility = 'hidden'; }));
  const wm = document.querySelector('.marquee-art.wordmark');
  if (!wm) return null;
  wm.scrollIntoView({ block: 'center' });
  const r = wm.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height,
    ink: !!(window.__heroType && window.__heroType.rig && window.__heroType.rig.ok) };
});
if (!box) { console.error('no .wordmark on the page'); process.exit(1); }
await page.waitForTimeout(600);

const shot = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
const src = decodePNG(shot);
console.log(`captured ${src.w}x${src.h} from a ${Math.round(box.w)}x${Math.round(box.h)} CSS box` +
  `  (3D layer live: ${box.ink})`);

/* Box downsample. Averaging every source pixel that lands in a destination cell — not a nearest
 * sample — because a 1290 -> 32 nearest reduction of type is aliased confetti. */
function resize(img, W, H) {
  const out = new Uint8ClampedArray(W * H * 4);
  const sx = img.w / W, sy = img.h / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let j = y0; j < y1 && j < img.h; j++) {
        for (let i = x0; i < x1 && i < img.w; i++) {
          const k = (j * img.w + i) * 4;
          r += img.data[k]; g += img.data[k + 1]; b += img.data[k + 2]; a += img.data[k + 3]; n++;
        }
      }
      const k = (y * W + x) * 4;
      out[k] = r / n; out[k + 1] = g / n; out[k + 2] = b / n; out[k + 3] = a / n;
    }
  }
  return { w: W, h: H, data: out };
}

function write(name, img) {
  const p = join(OUT, name);
  writeFileSync(p, encodePNG(img.w, img.h, img.data));
  return `${name} ${img.w}x${img.h} ${(readFileSync(p).length / 1024).toFixed(0)} KB`;
}

const made = [];
for (const s of [1024, 512, 180, 32]) made.push(write(`mark-${s}.png`, resize(src, s, s)));

/* The share card. 1200x630 is the size every platform crops toward, and the mark is square, so it
 * sits centred with the page's own stock either side rather than being stretched to fit — §5,
 * "everything sits ON something". Background is sampled from the page's own corner so the card
 * matches the site rather than guessing a hex. */
const OGW = 1200, OGH = 630;
const pad = Math.round(OGH * 0.12);
const side = OGH - pad * 2;
const mark = resize(src, side, side);
const bg = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const g = c.getContext('2d');
  g.fillStyle = getComputedStyle(document.body).backgroundColor || '#07040d';
  g.fillRect(0, 0, 1, 1);
  return Array.from(g.getImageData(0, 0, 1, 1).data);
});
const og = new Uint8ClampedArray(OGW * OGH * 4);
for (let i = 0; i < OGW * OGH; i++) {
  og[i * 4] = bg[0]; og[i * 4 + 1] = bg[1]; og[i * 4 + 2] = bg[2]; og[i * 4 + 3] = 255;
}
const ox = Math.round((OGW - side) / 2), oy = pad;
for (let y = 0; y < side; y++) {
  for (let x = 0; x < side; x++) {
    const s = (y * side + x) * 4, d = ((oy + y) * OGW + (ox + x)) * 4;
    const a = mark.data[s + 3] / 255;
    og[d] = mark.data[s] * a + og[d] * (1 - a);
    og[d + 1] = mark.data[s + 1] * a + og[d + 1] * (1 - a);
    og[d + 2] = mark.data[s + 2] * a + og[d + 2] * (1 - a);
    og[d + 3] = 255;
  }
}
made.push(write('og-1200x630.png', { w: OGW, h: OGH, data: og }));

/* A mark that is nearly all background is a failed capture, and it would ship silently — the file
 * would exist, the tags would point at it, and the card would be an empty rectangle. */
const big = decodePNG(readFileSync(join(OUT, 'mark-1024.png')));
let lit = 0;
for (let i = 0; i < big.w * big.h; i++) {
  const l = 0.299 * big.data[i * 4] + 0.587 * big.data[i * 4 + 1] + 0.114 * big.data[i * 4 + 2];
  if (l > 60) lit++;
}
const inkPct = 100 * lit / (big.w * big.h);

console.log('\n' + made.map(m => '  ' + m).join('\n'));
console.log(`\n  ink coverage ${inkPct.toFixed(1)}% of mark-1024`);
console.log(errs.length ? `  page errors: ${errs.slice(0, 2).join(' | ')}` : '  no page errors');
console.log('\n⚠ COLOUR IS NOT VERIFIED — SwiftShader rotates hue on canvas content in this\n' +
  '  container. Layout and value are right; re-run `npm run mark` on a real GPU before launch.');

await browser.close();
srv.close();
if (inkPct < 8) { console.error('\nFAIL mark-1024 is nearly empty — the capture did not get the type'); process.exit(1); }

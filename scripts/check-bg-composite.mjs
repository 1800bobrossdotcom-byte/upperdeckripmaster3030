/* Shoot the background plate in isolation and hold it to a legibility band.
 * Called by scripts/build-bg.mjs; standalone-runnable for tuning.
 *
 * ⚠ Judge LUMA and STRUCTURE here, never hue: this container's screenshot path rotates hue on
 *   canvas content (CLAUDE.md). Luminance and spatial variance survive that; colour does not. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { decodePNG } from './png23d.mjs';

const ROOT = '/home/user/upperdeckripmaster3030';
const SHOT = '/tmp/claude-0/-home-user-upperdeckripmaster3030/21c774c7-333a-5b09-b4f7-1b86ae6fac6a/scratchpad/bg-composite.png';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
               '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
               '.mp4': 'video/mp4', '.webp': 'image/webp' };

const srv = createServer(async (rq, rs) => {
  try {
    const p = decodeURIComponent(rq.url.split('?')[0]);
    const f = join(ROOT, p === '/' ? '/index.html' : p);
    const b = await readFile(f);
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    rs.end(b);
  } catch { rs.writeHead(404); rs.end('nf'); }
});
/* ⚑ EPHEMERAL PORT — see the note in scripts/debug-games.mjs. A fixed port makes two concurrent
 * harnesses collide with EADDRINUSE, which reads as a hang rather than as a port clash. */
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

const pw = await import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const chromium = (pw.default || pw).chromium;
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
const pg = await ctx.newPage();
await pg.goto('http://127.0.0.1:${PORT}/index.html', { waitUntil: 'load', timeout: 45000 });
await pg.waitForTimeout(2500);
// hide every other layer so we measure the plate, not the page
await pg.addStyleTag({ content: '#rain,.lm,.crt,.wrap,#banner,body>*:not(#bgFoilC):not(#bgFoil){visibility:hidden!important}' });
await pg.waitForTimeout(500);
const mode = await pg.evaluate(() => document.getElementById('bgFoilC') ? 'webgl' : (document.getElementById('bgFoil') ? 'css' : 'none'));
await pg.screenshot({ path: SHOT });
await br.close(); srv.close();

const img = decodePNG(readFileSync(SHOT));
const vals = [];
let sum = 0;
for (let y = 150; y < 650; y++) for (let x = 250; x < 1030; x++) {
  const i = (y * img.w + x) * 4;
  const L = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
  vals.push(L); sum += L;
}
const mean = sum / vals.length;
vals.sort((a, b) => a - b);
const p99 = vals[Math.floor(vals.length * 0.99)];
let v = 0; for (const L of vals) v += (L - mean) ** 2;
const sd = Math.sqrt(v / vals.length);

const t = (n, ok, x) => console.log((ok ? '  ok   ' : '  FAIL ') + n + (x ? '  — ' + x : ''));
console.log(`  composite (${mode}): mean ${mean.toFixed(1)} · p99 ${p99.toFixed(1)} · sd ${sd.toFixed(1)}`);
t('composite renders through WebGL', mode === 'webgl', mode);
t('composite mean under 26', mean < 26, mean.toFixed(1));
/* p99 is the bound that small dim type actually cares about — the site's `.fine` grey is well
 * under the body text's luma, so a background that peaks near it stops being a background. */
t('composite p99 under 58', p99 < 58, p99.toFixed(1));
t('composite sd under 11 (calm enough under a paragraph)', sd < 11, sd.toFixed(1));
t('still a texture — sd above 2', sd > 2, sd.toFixed(1));

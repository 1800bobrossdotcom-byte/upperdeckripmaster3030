/* Sweep every game, report what is actually broken. `npm run debug`
 *
 * Not a test — it asserts nothing and never fails a build. It loads each game the way the arcade
 * links to it, drives it far enough to render, and prints what came back: page errors, console
 * errors, 4xx, whether WebGL and the post chain came up, and PIXEL STATISTICS.
 *
 * ⚑ The pixel stats are the point. "It looks washed out" is a real report and an unmeasurable
 *   one; `clipped` (fraction of subpixels at 255) and `p99` turn it into a number that can be
 *   swept against a change. This container is SwiftShader and rotates hue on canvas content
 *   (CLAUDE.md), so HUE HERE IS MEANINGLESS — but luma, contrast and clipping are computed from
 *   the same buffer the game drew and are comparable between runs of this script.
 *
 * ⚠ Frame timings are RELATIVE ONLY for the same reason. Use them to compare two builds in the
 *   same container, never as an fps claim about a real machine.
 *
 * Usage: node scripts/debug-games.mjs [name ...]        (default: all)
 */
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build/debug');
const PORT = 8951;
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.skn': 'application/octet-stream', '.wld': 'application/octet-stream', '.mp4': 'video/mp4',
  '.avif': 'image/avif', '.ttf': 'font/ttf', '.obj': 'text/plain' };

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

/* `drive` runs INSIDE the page after load: start the game, skip menus, get to a frame that is
 * actually representative. A menu screenshot is what made three earlier frame measurements void
 * (CLAUDE.md) — a game measured in its lobby is not measured. */
const GAMES = [
  { name: 'index', url: 'index.html', wait: 7000 },
  { name: 'riprocketer', url: 'riprocketer.html', wait: 9000, drive: () => {
      const g = window.__rr || window.RR || null;
      const b = [...document.querySelectorAll('button,.btn')].find(e => /START|PLAY|LAUNCH|BEGIN/i.test(e.textContent || ''));
      if (b) b.click();
      return g ? 'hook' : (b ? 'clicked' : 'none');
    } },
  { name: 'dogfight', url: 'dogfight.html', wait: 9000, drive: () => {
      const b = [...document.querySelectorAll('button,.btn')].find(e => /START|PLAY|LAUNCH|BEGIN|FLY/i.test(e.textContent || ''));
      if (b) b.click(); return b ? 'clicked' : 'none';
    } },
  /* ⛔ THIS ROW WAS MEASURING THE LOBBY, AND EVERY NUMBER IT EVER PRINTED FOR CLOUD RACER IS VOID.
   * The generic click finds the FIRST /START|PLAY|RACE|BEGIN/ button, which is "🔥 Ante up & race";
   * with no wallet that path returns straight to the grid, so the sweep screenshotted a white panel
   * on a pale gradient and reported it as the game (luma 193.1, blacks 0.9%). Driven properly the
   * same build reads luma 140.3 and blacks 0.00% — a different picture with a different diagnosis.
   * Cloud Racer has had a dev hook since the PlayCanvas port; use it, the way section9 and ronin
   * already do. The header of this file says a game measured in its lobby is not measured. */
  { name: 'cloudracer', url: 'cloudracer.html', wait: 9000, drive: () => {
      const c = window.CRPC;
      if (c && c.startRace) { try { c.startRace({ players: 6, laps: 3, real: false, cardEdge: 1 }); return 'startRace'; }
        catch (e) { return 'threw ' + e.message; } }
      const b = [...document.querySelectorAll('button,.btn')].find(e => /PRACTICE/i.test(e.textContent || ''));
      if (b) b.click(); return b ? 'clicked practice' : 'no hook';
    } },
  { name: 'section9', url: 'section9.html', wait: 9000, drive: () => {
      const g = window.__s9pc && window.__s9pc.game;
      if (g && g.startMatch) { try { g.startMatch(false, 0, [], null); return 'startMatch'; } catch (e) { return 'threw ' + e.message; } }
      return 'no hook';
    } },
  { name: 'ronin', url: 'ronin.html', wait: 9000, drive: () => {
      const r = window.__rn;
      if (r && r._brawl) { try { r._brawl('ronin', 'oni'); return '_brawl'; } catch (e) { return 'threw ' + e.message; } }
      const b = [...document.querySelectorAll('button,.btn')].find(e => /START|FIGHT|DUEL|BEGIN/i.test(e.textContent || ''));
      if (b) b.click(); return b ? 'clicked' : 'no hook';
    } },
];

/* Read the pixels the game actually drew.
 * ⚠ NOT via drawImage on a WebGL canvas — without preserveDrawingBuffer that reads back BLACK
 *   outside the game's own frame, and it once reported meanLuma 0 for a frame rendering perfectly
 *   (CLAUDE.md). The screenshot path is what sees the composited result, so stats come from the
 *   decoded PNG rather than from the page. */
function statsFromPng(buf) {
  const { decodePNG } = pngMod;
  let img = null;
  try { img = decodePNG(buf); } catch (e) { return null; }
  if (!img || !img.w) return null;
  const w = img.w, h = img.h, data = img.data;   // png23d returns {w,h,data}, not {width,height}
  let n = 0, sum = 0, sum2 = 0, clipped = 0, dark = 0, sub = 0;
  const hist = new Uint32Array(256);
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r === 255) clipped++; if (g === 255) clipped++; if (b === 255) clipped++;
      sub += 3;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      hist[Math.min(255, l | 0)]++;
      sum += l; sum2 += l * l; n++;
      if (l < 16) dark++;
    }
  }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  let acc = 0, p99 = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.99) { p99 = i; break; } }
  return { mean: +mean.toFixed(1), contrast: +sd.toFixed(1), p99,
    clippedPct: +(100 * clipped / sub).toFixed(2), darkPct: +(100 * dark / n).toFixed(1) };
}
const pngMod = await import('./png23d.mjs');

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const only = process.argv.slice(2);
const rows = [];
for (const G of GAMES) {
  if (only.length && only.indexOf(G.name) < 0) continue;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [], bad = [];
  page.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(`http://localhost:${PORT}`, '')); });
  await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });

  let drove = '-';
  try {
    await page.goto(`http://localhost:${PORT}/${G.url}`, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(4000);
    if (G.drive) drove = await page.evaluate(G.drive).catch(e => 'eval ' + String(e).slice(0, 60));
    await page.waitForTimeout(G.wait);
  } catch (e) { errs.push('NAV ' + String(e && e.message).slice(0, 120)); }

  const gl = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')];
    let webgl2 = false;
    try { const c = document.createElement('canvas'); webgl2 = !!c.getContext('webgl2'); } catch {}
    return { canvases: cs.length, biggest: cs.map(c => c.width * c.height).sort((a, b) => b - a)[0] || 0, webgl2 };
  }).catch(() => ({ canvases: -1, biggest: 0, webgl2: false }));

  const shot = join(OUT, G.name + '.png');
  let px = null;
  try { const buf = await page.screenshot({ path: shot }); px = statsFromPng(buf); } catch (e) { errs.push('SHOT ' + e.message); }

  rows.push({ name: G.name, drove, gl, px, errs: errs.slice(0, 4), bad: bad.slice(0, 4), nerr: errs.length, nbad: bad.length });
  await ctx.close();
}
await browser.close();
srv.close();

console.log('\n══ GAME DEBUG SWEEP ' + '═'.repeat(56));
console.log('   SwiftShader — luma/contrast/clipping comparable between runs, hue is NOT.\n');
for (const r of rows) {
  const p = r.px || {};
  console.log(`── ${r.name.toUpperCase()}`);
  console.log(`   drive=${r.drove}  canvases=${r.gl.canvases} (max ${r.gl.biggest}px)  webgl2=${r.gl.webgl2}`);
  console.log(`   luma mean ${p.mean}  contrast ${p.contrast}  p99 ${p.p99}  CLIPPED ${p.clippedPct}%  black ${p.darkPct}%`);
  console.log(`   errors ${r.nerr}  4xx ${r.nbad}`);
  r.errs.forEach(e => console.log(`     ! ${e}`));
  r.bad.forEach(e => console.log(`     ? ${e}`));
  console.log('');
}
console.log('shots: build/debug/*.png');

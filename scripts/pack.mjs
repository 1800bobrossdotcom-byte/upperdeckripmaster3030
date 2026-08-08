#!/usr/bin/env node
/* ripmaster3030studios — ZIP THE GAMES AND PROVE THE ZIP WORKS.  `npm run pack`
 *
 * ⛔ THIS EXISTS BECAUSE FOUR OF FIVE ZIPS SHIPPED BROKEN AND EVERY CHECK PASSED THEM.
 *   `npm run test:standalone` asserted no page errors and no external requests, and never
 *   asserted NO 404s. A missing asset throws nothing and renders nothing — the games fail open,
 *   which is a virtue that makes a broken build indistinguishable from a working one. DOGFIGHT
 *   and RIP ROCKETER were going out without `cards/art/deck/*.webp`, the card art, which is what
 *   those games are about.
 *
 * ⚑ SO IT DOES NOT INSPECT THE BUILD DIRECTORY. It zips, unpacks the zip into a CLEAN temp dir,
 *   serves that, and plays it — the way itch.io does. The build directory can be right while the
 *   zip is wrong (a stray path, a dotfile, a nested folder), and the zip is what a stranger gets.
 * ⚑ AND THE GATE IS 404s. Not "did it boot": a game with no card art boots perfectly.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build/standalone');
if (!existsSync(OUT)) { console.log('  ⛔ run `npm run standalone` first'); process.exit(1); }
const GAMES = readdirSync(OUT).filter(d => statSync(join(OUT, d)).isDirectory());

const MT = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.skn': 'application/octet-stream', '.wld': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.gif': 'image/gif', '.bin': 'application/octet-stream', '.ico': 'image/x-icon' };

let SERVE = '', missed = [];
const srv = createServer((q, r) => {
  let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = join(SERVE, decodeURIComponent(p));
  if (!existsSync(f) || !extname(f)) { missed.push(p); r.writeHead(404); return r.end('x'); }
  r.writeHead(200, { 'content-type': MT[extname(f)] || 'application/octet-stream' });
  r.end(readFileSync(f));
});
await new Promise(z => srv.listen(8091, z));
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

console.log('\n  PACK — zip, then unpack the ZIP into a clean dir and play it\n');
let bad = 0;
for (const g of GAMES) {
  execSync(`cd ${JSON.stringify(join(OUT, g))} && rm -f ../${g}.zip && zip -qr ../${g}.zip . -x '.*' -x '__MACOSX/*'`);
  const zip = join(OUT, `${g}.zip`);
  const mb = (statSync(zip).size / 1048576).toFixed(1);

  const tmp = mkdtempSync(join(tmpdir(), 'pack-'));
  execSync(`unzip -qo ${JSON.stringify(zip)} -d ${JSON.stringify(tmp)}`);
  SERVE = tmp; missed = [];

  const pg = await br.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [], off = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 90)));
  pg.on('request', rq => { const u = rq.url();
    if (!/^http:\/\/localhost:8091|^data:|^blob:/.test(u)) off.push(u.slice(0, 60)); });
  await pg.goto('http://localhost:8091/index.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pg.waitForTimeout(4500);
  for (const sel of ['#btnPractice', '#btnStart', '#btnPlay']) {
    const el = await pg.$(sel).catch(() => null);
    if (el && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); break; }
  }
  await pg.waitForTimeout(3500);
  await pg.keyboard.press('Space').catch(() => {});
  await pg.keyboard.down('KeyW').catch(() => {}); await pg.waitForTimeout(2000); await pg.keyboard.up('KeyW').catch(() => {});
  await pg.waitForTimeout(1500);
  const canvas = await pg.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].filter(x => x.width > 300);
    return c.length ? `${c[0].width}x${c[0].height}` : null;
  }).catch(() => null);
  await pg.close();
  rmSync(tmp, { recursive: true, force: true });

  /* ⚠ `/gate.js` is EXPECTED to 404 and is not a defect — the strip removes its script tag, but
   *   a page may still reference it in a comment or a stale handler. Anything else missing is a
   *   real hole in the download. */
  const real = [...new Set(missed)].filter(p => !/gate\.js|favicon/.test(p));
  const okAll = canvas && !errs.length && !real.length && !off.length;
  if (!okAll) bad++;
  console.log(`  ${g.padEnd(12)} ${String(mb).padStart(5)} MB  canvas ${canvas || '✗'}  404s ${String(real.length).padStart(3)}  errors ${errs.length}  offsite ${off.length}   ${okAll ? '✅ SHIPPABLE' : '⛔ BROKEN'}`);
  if (real.length) console.log(`       missing: ${real.slice(0, 5).join(', ')}${real.length > 5 ? ` … +${real.length - 5}` : ''}`);
  if (errs.length) console.log(`       error:   ${errs[0]}`);
  if (off.length)  console.log(`       offsite: ${[...new Set(off)].slice(0, 2).join(', ')}`);
}
await br.close(); srv.close();
console.log(`\n  ${GAMES.length - bad}/${GAMES.length} zips verified shippable   → ${OUT}/*.zip`);
if (bad) console.log('  ⛔ Do not upload a BROKEN one. Re-run `npm run standalone` (its trace pass fetches what is missing) and pack again.\n');
else console.log('  Upload: itch.io → new project → Kind: HTML → drop the zip → tick "play in browser" → 1280x720.\n');
process.exit(bad ? 1 : 0);

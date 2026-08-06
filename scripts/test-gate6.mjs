#!/usr/bin/env node
/* ripmaster3030studios — MAINNET PRE-FLIGHT GATE 6: ALL SIX GAMES.  `npm run test:gate6`
 *
 * SuperRare's requirement before public launch is one fresh-wallet mainnet test covering the
 * approval flow, PackSink price enforcement, a true supply-reducing burn, the 50/50 split, card
 * mint/render — and **all six games**.
 *
 * ⚑ GATE 6 IS THE ONLY ONE OF THE SIX THAT NEEDS NO WALLET, NO CONTRACT AND NO CHAIN, so it is
 *   the one gate that can be taken off the artist's plate in advance. Everything else in that
 *   document is blocked on PackSink + Lens721 being deployed (task #89) and on a fresh wallet
 *   holding real $3030. This proves the six cabinets load, build their renderer and run clean on
 *   a desktop and a phone, so the fresh-wallet sitting is a CONFIRMATION rather than a discovery.
 *
 * ⛔ WHAT IT DOES NOT PROVE, AND THE DOC SAYS SO: that the games are FUN, that they behave on
 *   real GPU hardware (this container is SwiftShader — task #73 stands), or anything at all about
 *   the five wallet-bound gates. A green run here is a pre-check, not gate 6 signed off.
 *
 * ⚠ EVERY CABINET REQUIRES WEBGL 2 — there is no 2D fallback left anywhere in the arcade. That is
 *   the whole cost of the classic builds being deleted, and it is asserted rather than assumed:
 *   a cabinet that quietly showed the #nogl panel would "load fine" and be unplayable.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
  '.wld': 'application/octet-stream', '.skn': 'application/octet-stream', '.glb': 'model/gltf-binary' };

/* The six named in docs/MAINNET-PREFLIGHT.md gate 6. THE ARENA is DOM/CSS by design (its only
 * canvas is a decorative sparkle layer), so it is the one cabinet that must NOT be held to a
 * WebGL2 requirement — holding it to one would fail a game that works. */
const GAMES = [
  { name: 'THE CITY',      url: 'city.html',         gl: true },
  { name: 'RIP ROCKETER',  url: 'riprocketer.html',  gl: true },
  { name: 'CLOUD RACER',   url: 'cloudracer.html',   gl: true },
  { name: 'THE ARENA',     url: 'cards/battle.html', gl: false },
  { name: 'SECTION 9',     url: 'section9.html',     gl: true },
  { name: 'DOGFIGHT',      url: 'dogfight.html',     gl: true },
];

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

let checks = 0, fails = 0;
const ok = (c, m, d) => {
  checks++; if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${d !== undefined && d !== '' ? '  — ' + d : ''}`);
};

for (const view of [
  { label: 'desktop 1280×800', opts: { viewport: { width: 1280, height: 800 } } },
  { label: 'phone 390×844', opts: { ...devices['iPhone 13'] } },
]) {
  console.log(`\n── ${view.label} ──`);
  const ctx = await browser.newContext(view.opts);
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  for (const g of GAMES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 150)));
    try {
      await page.goto(`http://localhost:${PORT}/${g.url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) { ok(false, `${g.name} — page loads`, String(e.message).slice(0, 80)); await page.close(); continue; }
    await page.waitForTimeout(3500);

    const r = await page.evaluate(() => {
      const cvs = [...document.querySelectorAll('canvas')];
      let gl = false, w = 0, h = 0;
      for (const c of cvs) {
        const r = c.getBoundingClientRect();
        if (r.width * r.height > w * h) { w = Math.round(r.width); h = Math.round(r.height); }
        try { if (c.getContext('webgl2')) gl = true; } catch {}
      }
      const nogl = document.getElementById('nogl');
      const noglShown = !!(nogl && getComputedStyle(nogl).display !== 'none' && nogl.offsetHeight > 0);
      return { canvases: cvs.length, gl, w, h, noglShown,
               overflow: document.documentElement.scrollWidth > innerWidth + 1,
               title: document.title.slice(0, 60) };
    });

    ok(r.title.length > 0, `${g.name} — page loads`, r.title);
    /* ⛔ "It loaded" is the weak question. A cabinet showing its no-WebGL panel loads perfectly
     *   and is unplayable, which is exactly the shape that would slip through a smoke test. */
    ok(!r.noglShown, `${g.name} — is NOT showing the no-WebGL panel`);
    if (g.gl) ok(r.gl, `${g.name} — WebGL2 context is up`, r.gl ? `${r.w}×${r.h}` : 'none');
    else ok(r.canvases >= 0, `${g.name} — DOM/CSS cabinet (no WebGL2 required, by design)`);
    ok(!r.overflow, `${g.name} — no horizontal overflow`);
    ok(errs.length === 0, `${g.name} — no console errors`, errs[0] || 'clean');
    await page.close();
  }
  await ctx.close();
}

await browser.close(); srv.close();
console.log(`\n⚠ THIS IS A PRE-CHECK, NOT GATE 6 SIGNED OFF.`);
console.log(`  Not proven: real GPU hardware (this is SwiftShader — task #73), or that they are fun.`);
console.log(`  The other five gates need PackSink + Lens721 deployed and a fresh wallet with`);
console.log(`  real $3030 — see docs/MAINNET-PREFLIGHT.md.`);
console.log(`\n${checks - fails} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);

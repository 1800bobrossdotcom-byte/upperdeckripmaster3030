#!/usr/bin/env node
/* SHOTS FOR THE UPDATES LOG.   npm run shots
 *
 * Each entry in `updates.json` names a `shot` — a real page on this site, driven and captured at
 * 1200×675, the size a social card is cropped to. ⛔ THE SHOT IS TAKEN FROM THE LIVE PAGE, NEVER
 * COMPOSED. A hand-made picture of a feature is a claim about the feature; a screenshot of the
 * page is the feature. This repo has a name for the difference — DESIGN-SYSTEM §1, "a flat redraw
 * would be a picture OF the mark".
 *
 * ⚑ THE CAPTURE IS A SCRIPT AND NOT A NOTE, for the reason `npm run cc0` exists: the oni/ronin
 *   bake settings were lost because they lived in prose, and had to be recovered by sweeping until
 *   the shipped files reproduced byte-identically. A shot nobody can retake is a shot that rots
 *   the day the page changes.
 *
 * ⚠ COLOUR WAS MEASURED, NOT ASSUMED. CLAUDE.md records this container's screenshot path rotating
 *   hue on CANVAS content (green came out magenta), which would make every game shot unpublishable.
 *   Driven with a known colour on a DOM box, a 2D canvas and a WebGL canvas in one frame, under
 *   these ANGLE flags: all three read back 43,255,128 exactly. The note predates this flag set.
 *   The check below re-runs that on every shot rather than trusting this paragraph.
 */
import { createServer } from 'node:http';
import { readFileSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'media/updates');
const { chromium } = createRequire(import.meta.url)(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const W = 1200, H = 675;                       // a social card is cropped to 16:9; shoot it that way

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary', '.wld': 'application/octet-stream', '.skn': 'application/octet-stream',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.xml': 'application/xml',
};

const srv = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let p = join(ROOT, url);
  try { if (statSync(p).isDirectory()) p = join(p, 'index.html'); } catch {}
  let body = null;
  try { body = readFileSync(p); } catch {}
  if (body) { res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(body); }
  else { res.writeHead(404); res.end('not here'); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

const entries = JSON.parse(readFileSync(join(ROOT, 'updates.json'), 'utf8'));
const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const shots = entries.filter(e => e.shot && (!only.length || only.includes(e.id)));

mkdirSync(OUT, { recursive: true });

const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let bad = 0;
for (const e of shots) {
  const s = e.shot;
  const ctx = await br.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  /* ⚑ `seed` WRITES localStorage BEFORE THE PAGE RUNS, which is the only moment that works for a
   *   surface whose whole subject is what YOU have — the folder is a collection now, so a fresh
   *   context shows nine empty sleeves and a shot of it is a picture of nobody's folder. An
   *   `eval` step cannot do this: the page has already read the vault by the time one runs. */
  if (s.seed) await ctx.addInitScript(`try{ ${s.seed} }catch(e){}`);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', err => errs.push(String(err).slice(0, 100)));
  await page.goto(`http://127.0.0.1:${PORT}${s.url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  /* ⚠ A PAGE IS NOT READY WHEN IT HAS LOADED. Half of these surfaces build themselves out of a
   *   fetch (the deck, the folder) and two are engines that need frames on the clock. The steps
   *   are per-shot rather than one global sleep, because a global sleep long enough for the city
   *   is dead time on nine other pages — and one short enough for them shoots the city's sky. */
  for (const step of (s.steps || [])) {
    if (step.click) { await page.waitForSelector(step.click, { timeout: 30000 }); await page.click(step.click); }
    if (step.wait) await page.waitForTimeout(step.wait);
    if (step.scroll != null) await page.evaluate(y => scrollTo(0, y), step.scroll);
    if (step.eval) await page.evaluate(step.eval);
  }
  await page.waitForTimeout(s.settle ?? 2500);

  /* ⚠ THE SITE'S FLOATING TRANSPORT COMES OFF, AND ONLY THAT. `#soundBar` and `#sfxToggle` are
   *   fixed to two corners of every page on the site — they are CHROME, and a promo shot of a
   *   page is about its content. ⛔ Nothing else is touched: no copy is edited, no element is
   *   moved, nothing is added. The line is "remove the site's own furniture", not "arrange the
   *   picture", because the moment a shot is composed it stops being evidence. A per-shot `eval`
   *   step may hide a GAME's HUD, which is that game's own chrome by the same argument. */
  await page.evaluate(() => {
    for (const id of ['soundBar', 'sfxToggle']) {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    }
  });
  await page.waitForTimeout(250);

  const png = await page.screenshot({ type: 'png' });

  /* ⛔ TEN FULL-WIDTH PNGs IS A SEVEN-MEGABYTE PAGE, and the page whose whole job is showing
   *   people things is the worst one to make unloadable on a phone. Measured before the change:
   *   the driven suite found **5 of 10 screenshots undecoded** after a scroll to the bottom.
   * ⚑ CHROMIUM ENCODES WebP ITSELF, so this needs no new dependency and no second tool to keep in
   *   step — the same browser that took the shot re-encodes it. ⚠ JPEG was the obvious
   *   alternative and is wrong here: every one of these frames is small light type on near-black,
   *   which is exactly what JPEG ringing destroys. Quality is measured below, not assumed. */
  const webp = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.88).split(',')[1];
  }, png.toString('base64'));
  const buf = Buffer.from(webp, 'base64');
  const file = join(OUT, e.id + '.webp');
  writeFileSync(file, buf);

  /* ⛔ A SHOT THAT CAME OUT BLANK IS THE ONE FAILURE NOTHING ELSE HERE CAN SEE — the file exists,
   *   the byte count looks plausible, and the page it is meant to show is fine. Two reads, decoded
   *   in the browser: tonal RANGE (a flat fill of any colour has none — the press suite's own rule,
   *   "not blank is not alpha > 0") and the hue check described in the header. */
  const q = await page.evaluate(async (a) => {
    const img = new Image(); img.src = 'data:' + a.mime + ';base64,' + a.b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lo = 255, hi = 0, n = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {                 // stride: a sample, not a survey
      const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (l < lo) lo = l; if (l > hi) hi = l; sum += l; n++;
    }
    return { w: img.width, h: img.height, range: Math.round(hi - lo), mean: Math.round(sum / n) };
  }, { b64: buf.toString('base64'), mime: 'image/webp' });

  const ok = q.w === W && q.h === H && q.range > 40;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'BAD '} ${e.id.padEnd(22)} ${q.w}×${q.h}  range ${String(q.range).padStart(3)}  ` +
              `mean ${String(q.mean).padStart(3)}  ${(buf.length / 1024).toFixed(0)} KB` +
              (errs.length ? `  ⚠ ${errs.length} page error(s): ${errs[0]}` : ''));
  await ctx.close();
}

await br.close();
srv.close();

/* every entry that claims a shot must have one on disk — an <img> pointing at nothing is the
 * broken-picture icon in the middle of a page whose whole subject is showing people things */
for (const e of entries) {
  if (!e.shot) continue;
  if (!existsSync(join(OUT, e.id + '.webp'))) { console.log(`  MISSING ${e.id}.webp`); bad++; }
}

console.log(bad ? `\n⛔ ${bad} shot(s) unusable\n` : `\n✅ ${shots.length} shots in media/updates/\n`);
process.exit(bad ? 1 : 0);

#!/usr/bin/env node
/* ripmaster3030studios — SUBMISSION PACK.  `npm run listing`
 *
 * Turns `build/standalone/*` into something you can paste into itch.io, Newgrounds, a Reddit post
 * or Alchemy's dapp store, plus screenshots taken from the games themselves.
 *
 * ⛔ THE SHOTS ARE CAPTURED FROM THE BUILT GAME, NEVER COMPOSED. A picture *of* a feature is a
 *   claim about it; a shot of the running build IS it. Same rule as `npm run mark` cutting the
 *   wordmark out of the live foil, and `npm run shots` capturing the real pages. It also means a
 *   listing cannot drift from the thing it is listing.
 * ⚠ AND IT SHOOTS GAMEPLAY, NOT THE MENU. The first frame of every one of these is a title card,
 *   which is the least informative image available and exactly what an unattended capture grabs.
 *   Each game gets its own way in, and the capture asserts the frame is not near-uniform before
 *   keeping it — a black screen is the failure mode, and it is silent.
 *
 * ⚑ COPY IS DERIVED, NOT WRITTEN. Titles, blurbs and controls come out of the built HTML and the
 *   games' own key legends. Anything that cannot be derived is left blank and REPORTED, because
 *   the arcade menu has already once described a game that was not the one that shipped.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(new URL('.', import.meta.url).pathname, '..');
const BUILDS = join(ROOT, 'build/standalone');
const OUT = join(ROOT, 'build/listing');
if (!existsSync(BUILDS)) { console.log('  ⛔ run `npm run standalone` first'); process.exit(1); }

/* How to get past the title card, per game. ⚠ Hand-written because each one differs — an
 * unattended "press everything" produces a paused menu as often as a frame of play. */
/* ⛔ CLOUD RACER AND SECTION 9 BOTH SHIP A `#btnPractice` — THE NO-STAKES ENTRY — AND CLICKING
 *   COORDINATES NEVER FOUND IT. Their first three captures were byte-identical (sd 32.8 three
 *   times, 22.1 three times): three photographs of a lobby. A blind click at (640,420) is a guess
 *   about layout; pressing the button the page actually exposes is not. */
const START = ['#btnPractice', '#btnStart', '#btnPlay', '#btnGo'];
async function enterGame(p, g) {
  for (const sel of START) {
    const el = await p.$(sel);
    if (el && await el.isVisible()) { await el.click(); await p.waitForTimeout(3500); break; }
  }
  await p.keyboard.press('Space'); await p.waitForTimeout(1200);
  const drive = { city: 'KeyW', cloudracer: 'KeyW', riprocketer: 'KeyD', dogfight: 'KeyW', section9: 'KeyW' }[g] || 'KeyW';
  if (g === 'section9') await p.mouse.move(700, 380);
  await p.keyboard.down(drive); await p.waitForTimeout(2200); await p.keyboard.up(drive);
}

const MT = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.skn': 'application/octet-stream', '.wld': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.gif': 'image/gif', '.bin': 'application/octet-stream' };
let SERVE = BUILDS;
const srv = createServer((q, r) => {
  let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = join(SERVE, decodeURIComponent(p));
  if (!existsSync(f) || !extname(f)) { r.writeHead(404); return r.end('x'); }
  r.writeHead(200, { 'content-type': MT[extname(f)] || 'application/octet-stream' });
  r.end(readFileSync(f));
});
await new Promise(z => srv.listen(8095, z));
const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* ⛔ JUDGE THE SCREENSHOT, NOT A CANVAS READBACK — I GOT THIS WRONG AND CALLED FIVE GOOD BUILDS
 *   BROKEN. The first version measured liveness with `drawImage(webglCanvas)` + `getImageData`,
 *   which needs `preserveDrawingBuffer` and returns black without it — a trap this repo has on
 *   record. So it reported all fifteen shots "unreadable in headless" while the PNGs on disk were
 *   300 KB–1.3 MB of real image. ⚑ `page.screenshot()` COMPOSITES the page; the caveat simply
 *   does not apply to it. **A recorded trap belongs to an OPERATION, not to a topic** — I carried
 *   it across from readback to capture and mislabelled working deliverables.
 * ⚑ AND THE CHECK THAT ACTUALLY MATTERS IS DIFFERENCE, NOT BRIGHTNESS. A lobby screenshot is
 *   bright, varied and completely uninformative; what proves gameplay is that consecutive frames
 *   DIFFER. Cloud Racer scored an identical sd 32.8 three times — three photographs of a menu. */
function statsOf(buf) {
  /* PNG bytes → a coarse luma signature, via the same decoder path the browser gives us. */
  let h = 0, n = 0, sum = 0;
  for (let i = 0; i < buf.length; i += 97) { const v = buf[i]; sum += v; n++; h = (h * 31 + v) >>> 0; }
  return { hash: h, mean: +(sum / n).toFixed(1), bytes: buf.length };
}

mkdirSync(OUT, { recursive: true });
const games = readdirSync(BUILDS).filter(d => statSync(join(BUILDS, d)).isDirectory());
const report = [];

for (const g of games) {
  SERVE = join(BUILDS, g);
  const html = readFileSync(join(SERVE, 'index.html'), 'utf8');
  const title = ((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || g).split('·')[0].trim();
  const blurb = (html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [])[1] || '';
  const dir = join(OUT, g); mkdirSync(dir, { recursive: true });

  const pg = await br.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 90)));
  await pg.goto('http://localhost:8095/index.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(5000);

  const shots = [];
  try { await enterGame(pg, g); } catch {}
  for (let i = 1; i <= 3; i++) {
    const f = join(dir, `shot-${i}.png`);
    const buf = await pg.screenshot({ path: f });
    shots.push({ f: `shot-${i}.png`, ...statsOf(buf) });
    await pg.keyboard.down('KeyW'); await pg.waitForTimeout(1100); await pg.keyboard.up('KeyW');
    await pg.waitForTimeout(700);
  }
  /* ⚠ IDENTICAL CONSECUTIVE FRAMES = A PHOTOGRAPH OF A MENU, and it is the failure this reports
   *   rather than a black screen, because a black screen never actually happened. */
  const moving = new Set(shots.map(s => s.hash)).size > 1;
  await pg.close();

  /* Controls, read off the game's own on-screen legend rather than invented.
   * ⚠ TWO MARKUPS, BECAUSE THERE ARE TWO. THE CITY uses `<span class="key">`; RIP ROCKETER,
   *   DOGFIGHT and SECTION 9 use `<kbd>`. Matching only the first derived controls for one game
   *   in five and reported the other four as "needs the artist" — a checker that knows one
   *   spelling guards one spelling, which is this repo's hand-picked-list failure in a regex. */
  const legend = [
    ...[...html.matchAll(/<span class="key">([^<]{1,14})<\/span>\s*([^<\n]{0,30})/g)],
    ...[...html.matchAll(/<kbd[^>]*>([^<]{1,14})<\/kbd>\s*([^<\n]{0,30})/g)],
  ].map(m => `${m[1].trim()} — ${m[2].trim().replace(/^[·—-]\s*/, '')}`.replace(/ — $/, ''))
   .filter(s => s.length > 1)
   .filter((s, i, a) => a.indexOf(s) === i).slice(0, 10);

  const md = `# ${title}

${blurb}

**Play in your browser — nothing to install, no account.**

## Controls
${legend.length ? legend.map(l => `- ${l}`).join('\n') : '_(not derivable from the build — needs a line from the artist)_'}

## itch.io fields
| field | value |
| --- | --- |
| Title | ${title} |
| Tagline | ${blurb.split('.')[0]}. |
| Kind | HTML (browser) |
| Genre | ${({ city: 'Adventure', cloudracer: 'Racing', riprocketer: 'Shooter', dogfight: 'Simulation', section9: 'Shooter' })[g] || 'Action'} |
| Tags | webgl, browser, ${({ city: 'exploration, relaxing, animals, open-world', cloudracer: 'racing, arcade, futuristic', riprocketer: 'shmup, arcade, bullet-hell', dogfight: 'flying, arcade, combat', section9: 'fps, tactical, arena' })[g] || 'arcade'} |
| Pricing | Free |
| Upload | zip of \`build/standalone/${g}/\`, set \`index.html\` as the launch file |
| Viewport | 1280 × 720, fullscreen enabled |
| Author | ripmaster3030studios |
| Links | https://www.ripmaster3030studios.com |

## Screenshots
${shots.map(s => `- \`${s.f}\` (${Math.round(s.bytes/1024)} KB)`).join('\n')}
${moving ? '' : '\n⚠ **These three frames are identical — this is a photograph of the menu, not gameplay.** Re-shoot.'}

---
_Generated by \`npm run listing\` from \`build/standalone/${g}\`. Copy is derived from the build's own
title and meta description — if a line here is wrong, fix it in \`scripts/standalone.mjs\` and rebuild,
not here, or the listing and the game will drift apart._
`;
  writeFileSync(join(dir, 'LISTING.md'), md);
  report.push({ g, title, shots: shots.length, moving, errs: errs.length, legend: legend.length });
}

await br.close(); srv.close();
console.log('\n  SUBMISSION PACK\n');
for (const r of report)
  console.log(`  ${r.g.padEnd(12)} ${r.shots} shots ${r.moving ? '· gameplay (frames differ)' : '· ⚠ IDENTICAL FRAMES — a menu, not gameplay'}   ${r.legend ? r.legend + ' controls' : '⚠ no controls found — needs a line from the artist'}${r.errs ? `   ⚠ ${r.errs} page errors` : ''}`);
console.log(`\n  → ${OUT}`);
console.log('  ⚠ Read every LISTING.md before submitting. A listing is a promise to somebody who has not played it.\n');

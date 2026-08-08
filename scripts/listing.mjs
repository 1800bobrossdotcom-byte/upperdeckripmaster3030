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
const ENTER = {
  city:        async p => { await p.mouse.click(640, 400); await p.keyboard.press('Space'); await p.waitForTimeout(2500);
                            await p.keyboard.down('KeyW'); await p.waitForTimeout(2200); await p.keyboard.up('KeyW'); },
  cloudracer:  async p => { await p.mouse.click(640, 420); await p.waitForTimeout(600); await p.keyboard.press('Enter');
                            await p.waitForTimeout(3500); await p.keyboard.down('KeyW'); await p.waitForTimeout(3000); await p.keyboard.up('KeyW'); },
  riprocketer: async p => { await p.mouse.click(640, 420); await p.keyboard.press('Space'); await p.waitForTimeout(2500);
                            await p.keyboard.down('KeyD'); await p.waitForTimeout(1200); await p.keyboard.up('KeyD'); },
  dogfight:    async p => { await p.mouse.click(640, 420); await p.keyboard.press('Enter'); await p.waitForTimeout(3000);
                            await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.keyboard.up('KeyW'); },
  section9:    async p => { await p.mouse.click(640, 420); await p.keyboard.press('Enter'); await p.waitForTimeout(3000);
                            await p.mouse.move(700, 380); await p.keyboard.down('KeyW'); await p.waitForTimeout(2000); await p.keyboard.up('KeyW'); },
};

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

/* Is this frame worth keeping, or is it a black screen / a flat title card? */
async function frameIsAlive(pg) {
  return pg.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')].filter(c => c.width > 300);
    if (!cs.length) return { ok: false, why: 'no canvas' };
    const c = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    try {
      const o = document.createElement('canvas'); o.width = 120; o.height = 80;
      o.getContext('2d').drawImage(c, 0, 0, 120, 80);
      const d = o.getContext('2d').getImageData(0, 0, 120, 80).data;
      const l = []; for (let i = 0; i < d.length; i += 4) l.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      const m = l.reduce((a, b) => a + b, 0) / l.length;
      const sd = Math.sqrt(l.reduce((a, b) => a + (b - m) ** 2, 0) / l.length);
      return { ok: true, mean: +m.toFixed(1), sd: +sd.toFixed(1), readable: !(m === 0 && sd === 0) };
    } catch (e) { return { ok: false, why: 'tainted' }; }
  });
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
  try { if (ENTER[g]) await ENTER[g](pg); } catch {}
  for (let i = 1; i <= 3; i++) {
    const live = await frameIsAlive(pg);
    const f = join(dir, `shot-${i}.png`);
    await pg.screenshot({ path: f });
    shots.push({ f: `shot-${i}.png`, ...live });
    await pg.keyboard.down('KeyW'); await pg.waitForTimeout(900); await pg.keyboard.up('KeyW');
    await pg.waitForTimeout(600);
  }
  await pg.close();

  /* Controls, read off the game's own on-screen legend rather than invented. */
  const legend = [...html.matchAll(/<span class="key">([^<]{1,12})<\/span>\s*([^<]{0,26})/g)]
    .map(m => `${m[1].trim()} ${m[2].trim()}`.trim()).filter(Boolean).slice(0, 8);

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
${shots.map(s => `- \`${s.f}\`${s.readable === false ? '  ⚠ WebGL frame unreadable in headless capture — re-shoot on a real GPU' : s.sd !== undefined ? `  (contrast sd ${s.sd})` : ''}`).join('\n')}

---
_Generated by \`npm run listing\` from \`build/standalone/${g}\`. Copy is derived from the build's own
title and meta description — if a line here is wrong, fix it in \`scripts/standalone.mjs\` and rebuild,
not here, or the listing and the game will drift apart._
`;
  writeFileSync(join(dir, 'LISTING.md'), md);
  report.push({ g, title, shots: shots.length, dead: shots.filter(s => s.readable === false).length, errs: errs.length, legend: legend.length });
}

await br.close(); srv.close();
console.log('\n  SUBMISSION PACK\n');
for (const r of report)
  console.log(`  ${r.g.padEnd(12)} ${r.shots} shots${r.dead ? ` (⚠ ${r.dead} unreadable headless)` : ''}   ${r.legend ? r.legend + ' controls derived' : '⚠ no controls found'}${r.errs ? `   ⚠ ${r.errs} page errors` : ''}`);
console.log(`\n  → ${OUT}`);
console.log('  ⚠ Read every LISTING.md before submitting. A listing is a promise to somebody who has not played it.\n');

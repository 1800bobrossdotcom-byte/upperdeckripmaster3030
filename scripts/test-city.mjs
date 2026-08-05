#!/usr/bin/env node
/* THE CITY — the things that read as "the game is broken" and throw nothing.   npm run test:city
 *
 * ⛔ EVERY DEFECT THIS FILE GUARDS WAS REPORTED BY THE ARTIST AND INVISIBLE TO EVERY CHECK THAT
 *   EXISTED. `test:reach` parses these files and asserts they carry the right handlers; all of
 *   that was TRUE while the squirrel could not climb, the bird minted cards from nothing and the
 *   operative's camera ignored the mouse. A text match cannot see a body that does not move.
 *
 * ⚠ THE CLOCK IS `__city._step(n, dt)`, NOT rAF. This container stalls requestAnimationFrame —
 *   measured 6-8 real frames in 10.5 seconds — so a wall-clock drive reports 0 m of movement for
 *   a perfectly healthy bird. Recorded in CLAUDE.md and re-learned here at some cost.
 * ⚠ AND THE KEYS ARE `page.keyboard`, NOT a synthetic KeyboardEvent. A dispatched event moved the
 *   body by exactly 0 while gravity and the ground resolve both worked, which reads as a physics
 *   bug and is an input-path artefact of the harness.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.gif': 'image/gif', '.wld': 'application/octet-stream',
  '.skn': 'application/octet-stream', '.glb': 'model/gltf-binary' };
const PORT = 8962;

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ok   ' + msg + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + msg + (detail ? '  — ' + detail : '')); }
};

const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));
const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await br.newContext({ viewport: { width: 1280, height: 820 } });
await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
await page.goto(`http://127.0.0.1:${PORT}/city.html`, { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => window.__city && window.__city.s && window.__city.s.ready,
  null, { timeout: 90000 });
await page.waitForTimeout(4000);

console.log('\n── 1 · THE SQUIRREL CLIMBS, AND ARRIVES ───────────────────────────────────────');
/* ⛔ THE BUG THIS EXISTS FOR: `moveBody`'s ceiling clamp fired on the wall being climbed. A
 *   climbing body is pressed INTO its wall (wallAt reaches r + 0.22), so its head at `y + h` is
 *   inside that box — the clamp pinned `ny` back every frame and the squirrel hung at whatever
 *   height it first touched, `onGround` false, nothing thrown. It reads as being glued to the
 *   wall. Proved to bite by deleting the `!climbing &&` guard: y stays constant for 420 ticks. */
const wall = await page.evaluate(() => {
  __city.setMode('animal'); __city.setCreature('squirrel');
  const S = __city.s; let best = null;
  for (const e of __city.near.values()) for (const b of e.solids) {
    if (b.y1 - b.y0 < 2.0 || b.y1 > 12) continue;
    const d = Math.hypot((b.x0 + b.x1) / 2 - S.x, (b.z0 + b.z1) / 2 - S.z);
    if (d < 60 && (!best || d < best.d)) best = { d, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y1: b.y1 };
  }
  return best;
});
ok(!!wall, 'the city offers a climbable wall near the spawn',
  wall ? wall.y1.toFixed(1) + ' m tall' : 'none found');

if (wall) {
  await page.evaluate(({ x, z }) => { __city._place(x, 1.0, z, 0); __city._settle(400); },
    { x: (wall.x0 + wall.x1) / 2, z: wall.z0 - 0.42 });
  await page.waitForTimeout(300);
  const y0 = await page.evaluate(() => __city.s.y);
  await page.keyboard.down('w');
  const climb = await page.evaluate(() => {
    const t = [];
    for (let i = 0; i < 200; i++) { __city._step(1, 1 / 60); if (i % 8 === 0) t.push(+__city.s.y.toFixed(2)); }
    return { t, y: __city.s.y, onGround: __city.s.onGround };
  });
  await page.keyboard.up('w');
  const gained = climb.y - y0;
  const peak = Math.max(...climb.t);
  ok(gained > 1.5, 'holding forward against a wall GAINS HEIGHT — the assertion that bites, '
    + 'because the ceiling clamp pinned this to exactly its starting y',
    'y ' + y0.toFixed(2) + ' -> ' + climb.y.toFixed(2) + ' (peak ' + peak.toFixed(2) + ')');
  ok(peak > 2.5, '…and it is a climb rather than a hop', 'peak ' + peak.toFixed(2) + ' m');
  /* ⚠ "it moved" is the weak question — a body bouncing at the lip also moves. The one that
   *   discriminates is whether it ever STANDS above where it started. */
  const stood = await page.evaluate(() => {
    for (let i = 0; i < 90; i++) __city._step(1, 1 / 60);
    return { y: __city.s.y, onGround: __city.s.onGround };
  });
  ok(stood.onGround && stood.y > y0 + 1.0,
    'it ENDS UP STANDING on something above where it started, rather than oscillating at the lip',
    'y ' + stood.y.toFixed(2) + ' · onGround ' + stood.onGround);
}

console.log('\n── 2 · THE BIRD CANNOT MINT CARDS ─────────────────────────────────────────────');
/* ⛔ Measured before the pouch: 100 presses produced 106 cards, no bound of any kind. */
const drops = await page.evaluate(() => {
  __city.setMode('animal'); __city.setCreature('bird');
  const before = __city.drops.counts;
  let got = 0;
  for (let i = 0; i < 60; i++) if (__city._act()) got++;
  const after = __city.drops.counts;
  return { pouchMax: before.pouchMax, startPouch: before.pouch, got,
           dropped: after.dropped, pouch: after.pouch };
});
ok(drops.pouchMax > 0, 'the pouch exists and is bounded', drops.pouchMax + ' deep');
ok(drops.got <= drops.pouchMax && drops.got === drops.startPouch,
  '60 presses yield ONLY what the pouch held — supply is closed, not minted',
  drops.got + ' cards from ' + drops.startPouch + ' carried (60 presses)');
ok(drops.pouch === 0, '…and the pouch is empty afterwards rather than refilling itself',
  'pouch ' + drops.pouch);

console.log('\n── 3 · A PRESS THAT DOES NOTHING STILL SAYS SO ────────────────────────────────');
/* ⚠ Half the "cannot drop power ups" report was silence: an empty pouch and an empty pair of
 *   hands both did exactly nothing, and the bird's successful drop goes behind the camera. */
const said = await page.evaluate(() => {
  const el = document.getElementById('carry');
  __city._act();                       // pouch is empty by now — this must report a refusal
  /* ⚠ AND THEN STEP. The HUD line is written inside `stepDrops`, i.e. once per frame — reading
   *   it in the same tick as the press measures the frame BEFORE the press and reports an empty
   *   string, which looks exactly like the message never arriving. The game is right; an
   *   un-stepped read is the wrong moment to look. */
  __city._step(1, 1 / 60);
  const txt = el ? el.textContent : '';
  return { txt, on: el ? el.dataset.on : '' };
});
ok(/EMPTY|NOTHING/i.test(said.txt), 'an empty drop reports a reason on the HUD', JSON.stringify(said.txt));

console.log('\n── 4 · THE OPERATIVE SAYS ITS VIEW NEEDS A CLICK ──────────────────────────────');
/* ⛔ `mousemove` returns early unless the canvas is pointer-locked, and the lock is only ever
 *   requested by a click. Arriving from the jet — where the mouse does nothing — you land in a
 *   first-person body whose camera ignores the mouse, with nothing saying why. */
const lock = await page.evaluate(() => {
  __city.setMode('jet');
  const inJet = (() => { const el = document.getElementById('lockHint');
    return el ? !el.hidden && getComputedStyle(el).display !== 'none' : null; })();
  __city.setMode('operative');
  const el = document.getElementById('lockHint');
  const shownOp = el ? (!el.hidden && getComputedStyle(el).display !== 'none') : null;
  const txt = el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  __city.setMode('animal');
  const backToAnimal = el ? (!el.hidden && getComputedStyle(el).display !== 'none') : null;
  return { exists: !!el, inJet, shownOp, backToAnimal, txt };
});
ok(lock.exists, 'the prompt element is on the page');
ok(lock.shownOp === true, 'entering SECTION 9 shows it', JSON.stringify(lock.txt.slice(0, 40)));
/* ⚠ Both directions. "it is shown in operative mode" is trivially satisfied by showing it
 *   always, which would put a permanent label over a bird. */
ok(lock.inJet === false && lock.backToAnimal === false,
  '…and it is NOT shown in the modes that do not use the mouse',
  'jet ' + lock.inJet + ' · animal ' + lock.backToAnimal);

console.log('\n── 5 · NOTHING THREW DOING ANY OF IT ──────────────────────────────────────────');
ok(errs.length === 0, 'no page errors', errs.slice(0, 2).join(' | ') || 'clean');

await br.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

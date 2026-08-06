#!/usr/bin/env node
/* RIP ROCKETER — THE TOUCH SCHEME, DRIVEN.                              npm run test:rr
 *
 * Artist, 2026-08-06: *"double tap on either side to go fast side to side. take the gun button
 * off and have it always shooting. take off unnessary buttons. let finger draw fast paths with
 * double tap. lets get wild cool on mobile controls for this game."*
 *
 * ⛔ WHY THIS FILE HAS TO EXIST, AND IT IS THE REPO'S OWN HEADLINE ONE LEVEL IN. `test:reach` §1b
 *   asserts a cabinet REGISTERS pointer handlers and `test:cab` asserts its pads are on screen and
 *   nothing covers them. Both were green, and the DASH — half of the DASH → ROLL → FLOW →
 *   OVERDRIVE loop the whole game is built on, the thing the start screen calls "moving well IS
 *   shooting well" — had **no touch binding of any kind**. Not a broken one: none. A text match
 *   cannot see a gesture that was never bound, and a rectangle check cannot see one that does not
 *   fire. Only a driven probe can ask "did the tap do the thing".
 *
 * ⚠ THE CLOCK IS `__rrpc._step(n, h)` AND THE PAGE IS LOADED `?hold=1`. This container stalls rAF
 *   — CLAUDE.md records 6-8 real frames in 10.5 s — so a wall-clock drive of a gesture measures
 *   the container and reports a healthy ship as a dead control. `?hold=1` takes the rAF path off
 *   the simulation entirely, so `_step` is the only clock and every number below is repeatable.
 * ⚠ TOUCH IS DISPATCHED OVER CDP, not as a synthetic PointerEvent from inside the page. Same rule
 *   as `page.keyboard` over a synthetic KeyboardEvent (CLAUDE.md, THE CITY): a probe that fakes
 *   its own input path is measuring the fake.
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
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg' };
const PORT = 8971;
const W = 844, H = 390;                    // the landscape phone; js/orient.js veils portrait here

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
const ctx = await br.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
const cdp = await ctx.newCDPSession(page);

/* ── the touch driver. One event per changed point, which is what CDP wants: for touchEnd the
 *   list is the points that REMAIN down, so releasing the last finger sends an empty list.
 *
 * ⛔ AND A TAP HAS TO BE PIPELINED, WHICH COST A WHOLE ROUND OF FALSE FAILURES. Awaiting each CDP
 *   command before sending the next puts a full round trip between touchStart and touchEnd:
 *   measured **174 ms of press and 427 ms between the two taps**, so the harness could not deliver
 *   a double tap at all and reported the feature as unrecognised. Queueing both messages without
 *   awaiting in between — CDP processes a session's commands in order — gives 2 ms of press and
 *   124 ms of gap, and the same build passes. ⚑ Same genre as this repo's `waitForTimeout`
 *   measuring the container's rAF stalls rather than the thing under test: **a timing harness that
 *   is slower than the window it is testing measures itself.** The window is 300 ms because that
 *   is what a double tap is on a phone; it was not widened to suit the driver. */
const send = (type, pts) => cdp.send('Input.dispatchTouchEvent',
  { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id == null ? 1 : p.id })) });
const wait = ms => page.waitForTimeout(ms);
const tap = (x, y, id = 1) =>
  Promise.all([send('touchStart', [{ x, y, id }]), send('touchEnd', [])]);
const dbl = async (x, y) => { await tap(x, y); await tap(x, y); };
/* every case starts from a cold gesture state: a clean gap past DTAP_T so the previous case's
 * last tap cannot arm this one's first — which it did, and read as a false positive. */
const cold = () => wait(420);

await page.goto(`http://127.0.0.1:${PORT}/riprocketer.html?hold=1`, { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => window.__rrpc && window.__rrpc._touch, null, { timeout: 90000 });
await page.evaluate(() => __rrpc.start(false));
await wait(1200);
const held = await page.evaluate(() => __rrpc._step(1, 1 / 120).held);
ok(held === true, 'the page is running with the rAF clock off, so _step is the only clock',
  '?hold=1 → held ' + held);
/* Park the ship, alive and unencumbered, before every case. ⚠ `alive` and `inv` are in here for a
 * reason: with the rAF clock off, `_step` is the only thing advancing the game, so an earlier
 * case's thousand ticks are real seconds of a real wave — the ship can be dead by §7, and a
 * control that "does nothing" because the ship is wreckage looks exactly like a broken binding.
 * The GESTURE counters are cumulative on purpose (they count what the recogniser has ever seen),
 * so every case takes a baseline and asserts a DELTA. */
const reset = async (x = 0) => {
  await page.evaluate(px => {
    const s = __rrpc.G.ship;
    s.x = px; s.y = -3.05; s.vx = 0; s.vy = 0; s.alive = true; s.inv = 0; s.iframe = 0;
    s.dash = 0; s.dashCd = 0; s.rollT = 0; s.rollCd = 0; s.respawn = 0;
    s.drawT = 0; s.flow = 0; s.flowT = 0; s.od = 0; s.odCd = 0;
    s.shield = s.shieldMax; __rrpc.G.stat.dashes = 0; __rrpc.G.stat.rolls = 0;
  }, x);
  return page.evaluate(() => __rrpc._touch());
};

console.log('\n── 1 · THE GUN BUTTON IS GONE AND THE SHIP IS STILL SHOOTING ──────────────────');
/* "take the gun button off and have it always shooting". The two halves are one assertion: the
 * pad's absence only counts if the guns kept working without it, and autofire on its own is not
 * the ask. ⚠ `⌁ auto` has to go WITH it — with no manual trigger left on a thumb, turning autofire
 * off leaves a ship that cannot shoot and nothing on screen to say why. */
const guns = await page.evaluate(() => {
  const t = __rrpc._touch();
  const before = __rrpc.G.shots;
  const r = __rrpc._step(240, 1 / 120);          // two seconds, no input at all
  return { pads: t.pads, autofire: t.autofire, coarse: t.coarse,
    fireBtn: !!document.getElementById('tFire'), autoTg: !!document.getElementById('tgAuto'),
    shots: r.shots - before, bolts: r.bolts };
});
ok(guns.fireBtn === false, 'there is no FIRE pad in the document at all', guns.pads);
ok(guns.coarse === true, 'the page knows it is on a coarse pointer', 'coarse ' + guns.coarse);
ok(guns.autoTg === false, '…so the `⌁ auto` toggle is removed too — it could only disarm you now',
  'tgAuto present: ' + guns.autoTg);
ok(guns.shots > 0 && guns.bolts > 0,
  'and the ship fires for two seconds with NOTHING touching the screen',
  guns.shots + ' volleys · ' + guns.bolts + ' bolts in flight');

console.log('\n── 2 · DOUBLE-TAP EITHER SIDE, GO FAST THAT WAY ───────────────────────────────');
/* The artist's first sentence, and the verb that had no touch binding whatsoever. */
for (const [side, x, sign] of [['left', W * 0.22, -1], ['right', W * 0.78, 1]]) {
  await cold();
  const base = await reset();
  await dbl(x, H * 0.55);
  /* ⚠ MEASURE THE PEAK AND THE DISPLACEMENT, NOT THE VELOCITY WHENEVER THE PROBE GOT ROUND TO
   *   LOOKING. A dash is a 27 u/s IMPULSE decaying on a 0.125 s time constant, so reading `vx`
   *   0.35 s later gives 1.65 u/s and reads exactly like a dash that never fired. The first
   *   version of this assertion did precisely that and failed on a correct build. */
  const r = await page.evaluate(() => {
    const g = __rrpc.G, x0 = g.ship.x; let peak = 0;
    for (let i = 0; i < 24; i++) { const s = __rrpc._step(1, 1 / 120); if (Math.abs(s.vx) > Math.abs(peak)) peak = s.vx; }
    return { t: __rrpc._touch(), peak: +peak.toFixed(2), dx: +(g.ship.x - x0).toFixed(2), dashes: g.stat.dashes };
  });
  ok(r.t.dashes - base.dashes === 1, `a double-tap on the ${side} is RECOGNISED as a double tap`,
    'gestures +' + (r.t.dashes - base.dashes));
  /* ⚑ TWO COUNTERS ON PURPOSE. `_touch().dashes` counts the GESTURE, `stat.dashes` counts what the
   *   simulation accepted. Splitting them is what tells "the recogniser never fired" apart from
   *   "it fired and doDash refused it on cooldown" — two bugs that look identical from outside. */
  ok(r.dashes >= 1, '…and the simulation accepted it as a dash', 'stat.dashes ' + r.dashes);
  ok(Math.sign(r.peak) === sign && Math.abs(r.peak) > 20,
    `…and the ship is genuinely thrown ${side}, far past anything the stick can reach`,
    'peak ' + r.peak + ' u/s against a 9.8 u/s stick ceiling');
  ok(Math.sign(r.dx) === sign && Math.abs(r.dx) > 1.5,
    `…and it is DISTANCE, not a twitch — a fifth of the field in 0.2 s`,
    'moved ' + r.dx + ' units of a ' + 12.6 + '-unit field');
}

console.log('\n── 3 · …AND STEERING IS NOT A DASH ────────────────────────────────────────────');
/* ⚑ THE ONE THAT ACTUALLY BITES. "the double tap dashes" is trivially satisfied by dashing on any
 *   touch at all. Steering here is a continuous drag on the SAME glass, so the recogniser has to
 *   reject it — and the keyboard's own note records this exact failure at one level up ("a
 *   double-tap test of two presses inside 260 ms is TOO LOOSE": a probe merely pumping ◀/▶ to keep
 *   rAF alive accumulated three dashes and lit OVERDRIVE without asking). A tap needs BOTH halves:
 *   it neither travelled nor lingered. */
await cold();
let base = await reset();
for (let i = 0; i < 6; i++) {                      // brisk steering flicks, thumb never still
  await send('touchStart', [{ x: W * 0.3, y: H * 0.6 }]);
  for (let k = 1; k <= 5; k++) await send('touchMove', [{ x: W * 0.3 + k * 26, y: H * 0.6 }]);
  await send('touchEnd', []);
}
const drags = await page.evaluate(() => ({ t: __rrpc._touch(), s: __rrpc._step(8, 1 / 120) }));
ok(drags.t.dashes - base.dashes === 0 && drags.s.dashes === 0,
  'six brisk steering drags in a row produce ZERO dashes',
  'gestures +' + (drags.t.dashes - base.dashes) + ' · sim ' + drags.s.dashes);

await cold(); base = await reset();
await tap(W * 0.3, H * 0.6); await wait(500); await tap(W * 0.3, H * 0.6);
const slow = await page.evaluate(() => __rrpc._touch());
ok(slow.dashes - base.dashes === 0, 'two taps 500 ms apart are two taps, not a double tap',
  'gestures +' + (slow.dashes - base.dashes));

await cold(); base = await reset();
await tap(W * 0.25, H * 0.6); await tap(W * 0.75, H * 0.6);
const far = await page.evaluate(() => __rrpc._touch());
ok(far.dashes - base.dashes === 0,
  'two quick taps at opposite ends of the screen are not a double tap either',
  'gestures +' + (far.dashes - base.dashes) + ' over ' + Math.round(W * 0.5) + 'px');

console.log('\n── 4 · HOLD THE SECOND TAP AND THE FINGER DRAWS THE PATH ──────────────────────');
/* "let finger draw fast paths with double tap." The gesture is the same one; what changes is that
 * the second press does not lift. The ship stops being STEERED and starts being LED. */
await cold(); base = await reset();
await tap(W * 0.30, H * 0.62);
await send('touchStart', [{ x: W * 0.30, y: H * 0.62 }]);      // …and this one stays down
const on = await page.evaluate(() => __rrpc._touch());
ok(on.drawing === true, 'holding the second tap enters the drawn-path mode', 'drawing ' + on.drawing);
ok(on.draws - base.draws === 1 && on.dashes - base.dashes === 1,
  '…and it is the SAME gesture that produced the dash, not a second one to learn',
  'dashes +' + (on.dashes - base.dashes) + ' · draws +' + (on.draws - base.draws));

/* ⛔ THE MAPPING IS ABSOLUTE AND THAT IS THE WHOLE POINT: the ship goes where the FINGER is, not
 *   where the finger has moved to. So the assertion is arrival, not motion — "it moved" is
 *   satisfied by any drift at all. Drawn from the left third to the right third of the glass. */
const target = await page.evaluate(x => __rrpc._field(x, 195).x, W * 0.80);
for (let k = 1; k <= 14; k++) {
  await send('touchMove', [{ x: W * (0.30 + 0.5 * k / 14), y: H * 0.5 }]);
  await page.evaluate(() => __rrpc._step(9, 1 / 120));
}
const drawn = await page.evaluate(() => __rrpc._step(60, 1 / 120));
ok(Math.abs(drawn.x - target) < 0.9,
  'the ship ARRIVES at the fingertip — an absolute map, not a nudge in its direction',
  'ship x ' + drawn.x + ' vs finger ' + target.toFixed(2) + ' (Δ' + Math.abs(drawn.x - target).toFixed(2) + ')');
ok(drawn.drawT > 0, '…and it reports the mode to the renderer while the finger is down',
  'drawT ' + drawn.drawT);
await send('touchEnd', []);
const off = await page.evaluate(() => ({ t: __rrpc._touch(), s: __rrpc._step(30, 1 / 120) }));
ok(off.t.drawing === false && off.s.drawT <= 0,
  'lifting off leaves the mode, and it cannot run on after the finger is gone',
  'drawing ' + off.t.drawing + ' · drawT ' + off.s.drawT);

console.log('\n── 5 · A DRAWN PATH IS MATERIALLY FASTER THAN THE STICK ───────────────────────');
/* ⚠ Otherwise it is a second way to do the same thing, and the artist asked for FAST paths. Both
 *   runs are the same 0.75 s from the same standing start at the same place, driven on the same
 *   clock; only the gesture differs. */
/* ⚠ FROM THE LEFT WALL, AND FOR HALF A SECOND. The first version ran both from x = 0 for 0.75 s
 *   and BOTH finished at exactly 6.3 — the field's half-width — so the measurement compared two
 *   ships pressed against the same wall and reported them identical. A speed test has to fit
 *   inside the track. */
async function runFor(setup) {
  await cold();
  await reset(-6.0);
  await setup();
  const r = await page.evaluate(() => __rrpc._step(60, 1 / 120));   // 0.50 s
  await send('touchEnd', []);
  return r;
}
const stickRun = await runFor(async () => {           // full deflection, right, anchor followed
  await send('touchStart', [{ x: W * 0.30, y: H * 0.55 }]);
  await send('touchMove', [{ x: W * 0.30 + 240, y: H * 0.55 }]);
});
const drawRun = await runFor(async () => {
  await tap(W * 0.30, H * 0.55);
  await send('touchStart', [{ x: W * 0.30, y: H * 0.55 }]);
  await send('touchMove', [{ x: W * 0.97, y: H * 0.55 }]);
});
ok(drawRun.x > stickRun.x + 1.5,
  'in the same 0.50 s from the wall, a drawn path covers materially more ground than a stick at '
  + 'full deflection', 'draw ' + (drawRun.x + 6).toFixed(2) + ' u vs stick ' + (stickRun.x + 6).toFixed(2) + ' u');
ok(Math.abs(drawRun.vx) > Math.abs(stickRun.vx) * 1.4,
  '…because its ceiling is higher, not because the stick is being throttled',
  'draw ' + drawRun.vx + ' u/s vs stick ' + stickRun.vx + ' u/s');

console.log('\n── 6 · THE STICK REACHES WHAT THE KEYBOARD REACHES ────────────────────────────');
/* ⛔ IT NEVER HAS. `v += (T − v)·k` followed by `v *= DRAG^h` settles at T·dk/(1 − d(1−k)) —
 *   0.659·T at this tick — so full deflection was worth 6.44 u/s against the keyboard's 8.84,
 *   under a comment claiming "the two controls agree on the ceiling by construction". It is the
 *   artist's own earlier "on mobile we cannot move fast like we can on desktop", one layer below
 *   where that was answered: the anchor fix made full deflection ASKABLE, this makes it worth
 *   asking for. Derived from the drag, not tuned — see RRGame.seek. */
const sc = await page.evaluate(() => window.RRGame._selfCheck());
ok(sc.stickTop >= sc.keyTop * 0.97,
  'the stick and the keyboard settle at the same speed, run out on the real loop',
  'stick ' + sc.stickTop + ' vs key ' + sc.keyTop + ' u/s');
ok(sc.stickTopRaw < sc.keyTop * 0.75,
  '…and the uncompensated lerp this replaces genuinely did not — the gap was real, not a rounding',
  'was ' + sc.stickTopRaw + ' u/s, i.e. ' + (100 * sc.stickTopRaw / sc.keyTop).toFixed(0) + '% of a keyboard');
ok(sc.drawTop > sc.keyTop * 1.7, 'and a drawn path is the fast one by design',
  'draw ' + sc.drawTop + ' u/s = ' + (sc.drawTop / sc.keyTop).toFixed(2) + '× the keyboard');

console.log('\n── 7 · THE TWO PADS THAT SURVIVED ARE REACHABLE, AND THE ROLL ROLLS ───────────');
/* ⚠ `test:cab`'s rule: a rectangle is a layout fact, whether the press LANDS is the question the
 *   player asks — so it is elementFromPoint, and then the verb itself. And ROLL stays a button on
 *   purpose: the only tap-shaped gesture left is the FIRST HALF of the double tap, so binding the
 *   roll there would fire a roll before every dash and `doDash` refuses while one is live. */
const padr = await page.evaluate(() => {
  const out = {};
  for (const id of ['tRoll', 'tBomb']) {
    const el = document.getElementById(id);
    if (!el) { out[id] = { ok: false, why: 'absent' }; continue; }
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    out[id] = { w: Math.round(b.width), h: Math.round(b.height),
      onScreen: b.x >= 0 && b.y >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
      hits: !!hit && (hit === el || el.contains(hit)), got: hit ? (hit.id || hit.className) : 'none' };
  }
  return out;
});
for (const id of ['tRoll', 'tBomb']) {
  const p = padr[id];
  ok(p.w >= 44 && p.h >= 44 && p.onScreen, `#${id} is on screen and clears the 44px tap floor`,
    p.w + '×' + p.h + (p.onScreen ? '' : ' OFF SCREEN'));
  ok(p.hits === true, `…and a press at its centre actually lands on it`, 'elementFromPoint → ' + p.got);
}
await cold(); await reset();
{
  const b = await page.evaluate(() => { const r = document.getElementById('tRoll').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await tap(b.x, b.y);
  const r = await page.evaluate(() => __rrpc._step(6, 1 / 120));
  ok(r.rolls >= 1 && r.rollT > 0, 'tapping ROLL rolls — the verb, not the rectangle',
    'rolls ' + r.rolls + ' · rollT ' + r.rollT + ' s');
}

console.log('\n── 8 · THE STEERING THUMB KEEPS ITS STICK WHILE THE OTHER DRAWS ───────────────');
/* ⚑ The reason `drawStart` DIMS the stick instead of hiding it: `stickHide()` drops `stick.id`,
 *   and the thumb that is still physically down would then be ignored for the rest of its press —
 *   you would lift the drawing finger and find you had no steering at all. Priority belongs in
 *   readInput, which is one line, not in the teardown. */
/* ⚠ TWO HARNESS MISTAKES HERE, BOTH REPORTING A WORKING FEATURE AS BROKEN.
 *   (a) The helper defaulted finger 2 to id 1 — the id finger 1 was already holding — so CDP saw
 *       one finger teleporting rather than two.
 *   (b) `Input.dispatchTouchEvent`'s touchEnd list is the points that **END**, not the points
 *       that remain. Passing the survivor released the wrong finger: the pointer log shows
 *       `pointerup id2 @350,240`, i.e. the STEERING thumb lifting while the tapping one stayed
 *       down. Read the events the page actually received rather than the sequence you meant. */
await cold(); await reset(-2);
const F1 = { x: W * 0.18, y: H * 0.62, id: 10 }, F1B = { x: W * 0.18 + 200, y: H * 0.62, id: 10 };
const F2 = { x: W * 0.80, y: H * 0.45, id: 20 };
await send('touchStart', [F1]);
await send('touchMove', [F1B]);                                   // finger 1 steering, hard right
await Promise.all([send('touchStart', [F1B, F2]), send('touchEnd', [F2])]);   // finger 2 taps…
await send('touchStart', [F1B, F2]);                              // …twice, and stays down
const both = await page.evaluate(() => __rrpc._touch());
ok(both.drawing === true && both.stick === true,
  'finger 2 can draw while finger 1 is still holding the stick down',
  'drawing ' + both.drawing + ' · stick ' + both.stick);
await send('touchEnd', [F2]);                                     // finger 2 lifts
const back = await page.evaluate(() => ({ t: __rrpc._touch(), s: __rrpc._step(50, 1 / 120) }));
ok(back.t.drawing === false && back.t.stick === true,
  '…and lifting it hands steering straight back rather than leaving a dead thumb',
  'drawing ' + back.t.drawing + ' · stick ' + back.t.stick);
ok(back.s.vx > 3, '…which is a live control, not just a flag', 'vx ' + back.s.vx + ' u/s');
await send('touchEnd', []);

console.log('\n── 9 · NOTHING THREW DOING ANY OF IT ──────────────────────────────────────────');
ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | ') || 'clean');

await br.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

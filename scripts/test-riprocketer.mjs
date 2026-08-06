#!/usr/bin/env node
/* RIP ROCKETER — THE TOUCH SCHEME, DRIVEN.                              npm run test:rr
 *
 * Artist, 2026-08-06: *"double tap on either side to go fast side to side. take the gun button
 * off and have it always shooting. take off unnessary buttons. let finger draw fast paths with
 * double tap. lets get wild cool on mobile controls for this game."* — and, on seeing it,
 * *"I don't believe we need the roll button either."*
 *
 * THE SCHEME, and it is one thing that escalates:
 *      drag                → fly (the anchor-following stick, unchanged)
 *      tap                 → ROLL, toward the side you tapped
 *      tap tap             → that roll, and the ship comes OUT of it DASHING
 *      tap tap + hold      → …and then draws a fast path to wherever the finger goes
 *      BURN                → the only button left, because it spends a consumable
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
    s.drawT = 0; s.flow = 0; s.flowT = 0; s.od = 0; s.odCd = 0; s.dashBuf = 0;
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
    fireBtn: !!document.getElementById('tFire'), rollBtn: !!document.getElementById('tRoll'),
    autoTg: !!document.getElementById('tgAuto'),
    shots: r.shots - before, bolts: r.bolts };
});
ok(guns.fireBtn === false, 'there is no FIRE pad in the document at all', guns.pads);
ok(guns.rollBtn === false, '…and no ROLL pad either — BURN is the only button left', guns.pads);
ok(guns.coarse === true, 'the page knows it is on a coarse pointer', 'coarse ' + guns.coarse);
ok(guns.autoTg === false, '…so the `⌁ auto` toggle is removed too — it could only disarm you now',
  'tgAuto present: ' + guns.autoTg);
ok(guns.shots > 0 && guns.bolts > 0,
  'and the ship fires for two seconds with NOTHING touching the screen',
  guns.shots + ' volleys · ' + guns.bolts + ' bolts in flight');

console.log('\n── 2 · TAP ROLLS · TAP TWICE ROLLS INTO A DASH ────────────────────────────────');
/* The artist's first sentence — the verb that had no touch binding whatsoever — plus the roll,
 * which lost its pad on 2026-08-06 and had to become the FIRST HALF of the same gesture.
 * ⛔ THE ONE THAT MATTERS IS THAT BOTH LAND. `doDash` refuses while a roll is live, so before
 *   SHIP.DASH_BUF existed this exact sequence produced a roll and silently ate the dash — i.e.
 *   removing the button would have removed the feature the artist asked for by name, and the
 *   only visible symptom would have been a dash that "sometimes doesn't work". */
for (const [side, x, sign] of [['left', W * 0.22, -1], ['right', W * 0.78, 1]]) {
  await cold();
  const b = await reset();
  await tap(x, H * 0.55);
  const one = await page.evaluate(() => ({ t: __rrpc._touch(), s: __rrpc._step(6, 1 / 120) }));
  ok(one.t.rolls - b.rolls === 1 && one.s.rolls === 1,
    `a single tap on the ${side} ROLLS — the pad's job, on the whole half of the glass`,
    'gesture +' + (one.t.rolls - b.rolls) + ' · sim ' + one.s.rolls + ' · rollT ' + one.s.rollT);
  ok(Math.sign(one.s.vx) === sign,
    `…and it carries a DIRECTION the pad never had`, 'vx ' + one.s.vx + ' u/s');
  ok(one.t.dashes - b.dashes === 0, '…and one tap is not yet a dash',
    'dashes +' + (one.t.dashes - b.dashes));
}

for (const [side, x, sign] of [['left', W * 0.22, -1], ['right', W * 0.78, 1]]) {
  await cold();
  const base = await reset();
  await dbl(x, H * 0.55);
  /* ⚠ MEASURE THE PEAK INSIDE THE DASH'S OWN WINDOW, NOT WHENEVER THE PROBE GOT ROUND TO LOOKING.
   *   A dash is a 27 u/s IMPULSE decaying on a 0.125 s time constant, so reading `vx` a third of a
   *   second later gives 1.65 u/s and looks exactly like a dash that never fired — the first
   *   version did that and failed on a correct build. And now the ROLL comes first and the dash is
   *   buffered behind it, so the window has to span both: ROLL_T 0.42 s then DASH_BUF releases it.
   *   Sampling on `s.dash > 0` is what tells the dash's 27 apart from the roll's own 19. */
  const r = await page.evaluate(() => {
    const g = __rrpc.G, x0 = g.ship.x;
    let peak = 0, rollPeak = 0, dashTicks = 0;
    for (let i = 0; i < 96; i++) {
      const s = __rrpc._step(1, 1 / 120);
      if (s.dash > 0) { dashTicks++; if (Math.abs(s.vx) > Math.abs(peak)) peak = s.vx; }
      else if (s.rollT > 0 && Math.abs(s.vx) > Math.abs(rollPeak)) rollPeak = s.vx;
    }
    return { t: __rrpc._touch(), peak: +peak.toFixed(2), rollPeak: +rollPeak.toFixed(2),
      dashTicks, dx: +(g.ship.x - x0).toFixed(2), dashes: g.stat.dashes, rolls: g.stat.rolls };
  });
  ok(r.rolls === 1, `a double-tap on the ${side} rolls first`, 'rolls ' + r.rolls
    + ' · peak in the roll ' + r.rollPeak + ' u/s');
  ok(r.dashes >= 1 && r.dashTicks > 0,
    `…and the DASH SURVIVES THE ROLL rather than being swallowed by it`,
    'stat.dashes ' + r.dashes + ' · ' + r.dashTicks + ' ticks of dash after a roll that refuses '
    + 'dashes for its whole 0.42 s');
  ok(r.t.dashes - base.dashes === 1, `a double-tap on the ${side} is RECOGNISED as a double tap`,
    'gestures +' + (r.t.dashes - base.dashes));
  /* ⚑ TWO COUNTERS ON PURPOSE. `_touch().dashes` counts the GESTURE, `stat.dashes` counts what the
   *   simulation accepted. Splitting them is what tells "the recogniser never fired" apart from
   *   "it fired and doDash refused it on cooldown" — two bugs that look identical from outside. */
  ok(r.dashes >= 1, '…and the simulation accepted it as a dash', 'stat.dashes ' + r.dashes);
  ok(Math.sign(r.peak) === sign && Math.abs(r.peak) > 20,
    `…and the ship is genuinely thrown ${side}, far past anything the stick can reach`,
    'peak ' + r.peak + ' u/s against a 9.8 u/s stick ceiling');
  ok(Math.sign(r.dx) === sign && Math.abs(r.dx) > 2.5,
    `…and it is DISTANCE, not a twitch — the roll and the dash together`,
    'moved ' + r.dx + ' units of a ' + 12.6 + '-unit field');
}

console.log('\n── 3 · …AND STEERING IS NOT A DASH ────────────────────────────────────────────');
/* ⚑ THE ONE THAT ACTUALLY BITES. "the double tap dashes" is trivially satisfied by dashing on any
 *   touch at all. Steering here is a continuous drag on the SAME glass, so the recogniser has to
 *   reject it — and the keyboard's own note records this exact failure at one level up ("a
 *   double-tap test of two presses inside 260 ms is TOO LOOSE": a probe merely pumping ◀/▶ to keep
 *   rAF alive accumulated three dashes and lit OVERDRIVE without asking). A tap needs BOTH halves:
 *   it neither travelled nor lingered. */
/* ⛔ AND THE FLICK HAS TO BE FAST OR THIS ASSERTION DOES NOT BITE. The first version awaited each
 *   CDP command, so a "brisk" drag took ~900 ms of wall clock — comfortably past TAP_T, which
 *   means the TIME half rejected it on its own and the DISTANCE half was never exercised. Proved
 *   by deleting `p.moved < TAP_SLOP` from the recogniser: the suite stayed at 35/35 on a build
 *   where every quick steering flick becomes a dash. Pipelined, the same drag is ~5 ms over 130 px
 *   — short enough to be a tap on time alone, which is the case that matters. */
await cold();
let base = await reset();
for (let i = 0; i < 6; i++) {                      // brisk steering flicks, thumb never still
  const seq = [send('touchStart', [{ x: W * 0.3, y: H * 0.6 }])];
  for (let k = 1; k <= 5; k++) seq.push(send('touchMove', [{ x: W * 0.3 + k * 26, y: H * 0.6 }]));
  seq.push(send('touchEnd', []));
  await Promise.all(seq);
}
const drags = await page.evaluate(() => ({ t: __rrpc._touch(), s: __rrpc._step(8, 1 / 120) }));
ok(drags.t.dashes - base.dashes === 0 && drags.s.dashes === 0,
  'six brisk steering drags in a row produce ZERO dashes',
  'gestures +' + (drags.t.dashes - base.dashes) + ' · sim ' + drags.s.dashes);
/* ⚑ AND ZERO ROLLS, WHICH IS THE NEW HALF AND THE MORE DANGEROUS ONE. With the pad gone a tap is
 *   the roll, and steering is a press on the same glass — a recogniser that let a drag through
 *   would barrel-roll the ship every time the player steered, which is unplayable rather than
 *   merely wrong. It is also why the roll can never fire on an unqualified pointerdown. */
ok(drags.t.rolls - base.rolls === 0 && drags.s.rolls === 0,
  '…and ZERO rolls — steering must never be mistaken for the defensive move',
  'gestures +' + (drags.t.rolls - base.rolls) + ' · sim ' + drags.s.rolls);

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
for (let k = 1; k <= 14; k += 2) {
  await Promise.all([send('touchMove', [{ x: W * (0.30 + 0.5 * k / 14), y: H * 0.5 }]),
                     send('touchMove', [{ x: W * (0.30 + 0.5 * (k + 1) / 14), y: H * 0.5 }])]);
  await page.evaluate(() => __rrpc._step(9, 1 / 120));
}
const drawn = await page.evaluate(() => __rrpc._step(60, 1 / 120));
ok(Math.abs(drawn.x - target) < 0.9,
  'the ship ARRIVES at the fingertip — an absolute map, not a nudge in its direction',
  'ship x ' + drawn.x + ' vs finger ' + target.toFixed(2) + ' (Δ' + Math.abs(drawn.x - target).toFixed(2) + ')');
ok(drawn.drawT > 0, '…and it reports the mode to the renderer while the finger is down',
  'drawT ' + drawn.drawT);
/* ⛔ AND THE INK IS ASSERTED BY COUNTING WHAT IT EMITS, NOT BY LOOKING. The line the finger draws
 *   is the mode's only feedback — during a draw your own fingertip is on top of the ship — so an
 *   ink that silently drew nothing would be this repo's muzzle-flash failure again: correct,
 *   committed, described as done, invisible. ⚠ `fx.counts()` CANNOT answer it: the ship's own
 *   afterimage brightens during a draw too, so the additive quad count rises either way. That was
 *   measured (+11 quads) and taken as proof, and it was a confounded measurement that happened to
 *   agree. `ink` counts the ribbon segments themselves.
 * ⚠ The drive is DELIBERATELY grouped rather than batched: twelve touchMoves dispatched at once
 *   make Chrome fire `pointercancel` and end the draw — measured, `drawing:false` and `ink:0` on a
 *   healthy build — while awaiting each one gives ~6 points/second, which is a crawl no finger
 *   makes. Neither is a real drag, and both read as a broken feature. */
/* ⛔ AND THE RING MAY NOT POINT SOMEWHERE THE SHIP CANNOT GO. Draw to the top of the glass and the
 *   simulation clamps the target into the ship's lane (F.YBOT…F.YTOP, the lower third, so you can
 *   never stand inside the formation) — but the CURSOR did not, and sat in the formation with the
 *   ship stopped 1.8 units below it. Every number was right and the picture said the control was
 *   broken. Found by looking at a frame, which is why this assertion exists at all. */
await send('touchMove', [{ x: W * 0.6, y: 4 }]);            // as high as the glass goes
const high = await page.evaluate(() => ({ t: __rrpc._touch(), top: window.RRGame.F.YTOP }));
ok(high.t.dy <= high.top + 0.001,
  'drawing off the top of the screen pins the target to the ship\'s own ceiling',
  'target y ' + high.t.dy + ' vs the lane top ' + high.top);
const inked = await page.evaluate(() => __rrpc._touch());
ok(inked.inkPts >= 4, 'the drawn line has real points in it, not just the one the tap started with',
  inked.inkPts + ' points buffered');
ok(inked.ink >= 3, '…and the renderer is emitting the line as ribbon segments',
  inked.ink + ' segments on the last frame');
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
/* ⛔ THE LOAD-BEARING ONE IS THE DRIVEN RUN, AND THE FIRST VERSION OF THIS SECTION HAD ONLY THE
 *   DERIVATION. `_selfCheck` runs `seek` out on its own — so it proves the ARITHMETIC and says
 *   nothing about whether `stepShip` calls it. Proved: reverting the stick branch to the plain
 *   lerp left the suite at **35/35**, i.e. the whole section passed on the build it exists to
 *   catch. An assertion is only as good as the thing it actually points at, which is this repo's
 *   own recorded lesson from `test:reach`'s MODES table. Below, a real thumb at full deflection
 *   for half a second, read off the real loop: 9.77 with the fix, 6.44 without. */
await cold(); await reset(-6.0);
await send('touchStart', [{ x: W * 0.30, y: H * 0.55 }]);
await send('touchMove', [{ x: W * 0.30 + 240, y: H * 0.55 }]);
const live = await page.evaluate(() => __rrpc._step(60, 1 / 120));
await send('touchEnd', []);
ok(live.vx >= sc.keyTop * 0.97,
  'a REAL thumb at full deflection reaches what the keyboard reaches, measured on the game loop',
  'live stick ' + live.vx + ' u/s vs key ' + sc.keyTop + ' u/s');
ok(sc.stickTop >= sc.keyTop * 0.97,
  '…and the derivation agrees with the drive rather than standing in for it',
  'derived ' + sc.stickTop + ' u/s');
ok(sc.stickTopRaw < sc.keyTop * 0.75,
  '…and the uncompensated lerp this replaces genuinely did not — the gap was real, not a rounding',
  'was ' + sc.stickTopRaw + ' u/s, i.e. ' + (100 * sc.stickTopRaw / sc.keyTop).toFixed(0) + '% of a keyboard');
ok(sc.drawTop > sc.keyTop * 1.7, 'and a drawn path is the fast one by design',
  'draw ' + sc.drawTop + ' u/s = ' + (sc.drawTop / sc.keyTop).toFixed(2) + '× the keyboard');

console.log('\n── 7 · BURN IS THE LAST PAD, AND A SECOND THUMB ROLLS ON THE PRESS ────────────');
/* ⚠ `test:cab`'s rule: a rectangle is a layout fact, whether the press LANDS is the question the
 *   player asks — so it is elementFromPoint, and then the verb itself. BURN stays a button because
 *   it is a CONSUMABLE: an accidental roll costs a cooldown, an accidental burn costs a
 *   screen-clear you were saving. */
const padr = await page.evaluate(() => {
  const out = {};
  for (const id of ['tBomb']) {
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
for (const id of ['tBomb']) {
  const p = padr[id];
  ok(p.w >= 44 && p.h >= 44 && p.onScreen, `#${id} is on screen and clears the 44px tap floor`,
    p.w + '×' + p.h + (p.onScreen ? '' : ' OFF SCREEN'));
  ok(p.hits === true, `…and a press at its centre actually lands on it`, 'elementFromPoint → ' + p.got);
}
/* ⛔ THE LONE-THUMB ROLL FIRES ON RELEASE AND THE SECOND-FINGER ROLL FIRES ON THE PRESS, and the
 *   split is not an inconsistency — it is the only way to have both. The very first press on the
 *   glass is how STEERING begins, so it cannot roll; a press that lands while a thumb is already
 *   flying cannot be steering, so it can, and a panic button should not wait for a release.
 *   Measured here as latency: the second finger rolls with the simulation not yet stepped. */
await cold(); await reset();
{
  await send('touchStart', [{ x: W * 0.2, y: H * 0.6, id: 10 }]);         // thumb 1 flies
  await send('touchMove', [{ x: W * 0.2 + 120, y: H * 0.6, id: 10 }]);
  const b = await page.evaluate(() => __rrpc._touch());
  await send('touchStart', [{ x: W * 0.2 + 120, y: H * 0.6, id: 10 }, { x: W * 0.85, y: H * 0.4, id: 20 }]);
  const onPress = await page.evaluate(() => __rrpc._touch());            // BEFORE any release
  ok(onPress.rolls - b.rolls === 1,
    'a second thumb rolls on the PRESS, with no release and no simulation step in between',
    'gestures +' + (onPress.rolls - b.rolls));
  const r = await page.evaluate(() => __rrpc._step(6, 1 / 120));
  ok(r.rolls >= 1 && r.rollT > 0, '…and the simulation is actually rolling',
    'rolls ' + r.rolls + ' · rollT ' + r.rollT + ' s');
  await send('touchEnd', [{ x: W * 0.85, y: H * 0.4, id: 20 }]);
  await send('touchEnd', []);
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

console.log('\n── 9 · …AND IT WORKS WITH THE GAME ACTUALLY RUNNING ───────────────────────────');
/* ⛔ EVERYTHING ABOVE RAN UNDER `?hold=1`, WHICH IS A LAB. That is the right way to measure a
 *   gesture — it removes the container's rAF stalls from the reading — but "works with the clock
 *   off" is not the claim anyone cares about. A pointer handler on a live page is queued behind a
 *   full 3D frame: measured on THIS page at ~60 fps over 80 taps, `performance.now()` inside the
 *   handler ran **45–148 ms behind `e.timeStamp`**, a 103 ms spread against a 300 ms window. So
 *   the last case is the same double tap on a page that is rendering, with nothing held. */
{
  const p2 = await ctx.newPage();
  const c2 = await ctx.newCDPSession(p2);
  const s2 = (t, pts) => c2.send('Input.dispatchTouchEvent',
    { type: t, touchPoints: pts.map(q => ({ x: q.x, y: q.y, id: 1 })) });
  await p2.goto(`http://127.0.0.1:${PORT}/riprocketer.html`, { waitUntil: 'load', timeout: 90000 });
  await p2.waitForFunction(() => window.__rrpc && window.__rrpc._touch, null, { timeout: 90000 });
  await p2.evaluate(() => __rrpc.start(false));
  await p2.waitForTimeout(4000);
  const b0 = await p2.evaluate(() => __rrpc._touch());
  await Promise.all([s2('touchStart', [{ x: 200, y: 250 }]), s2('touchEnd', []),
                     s2('touchStart', [{ x: 200, y: 250 }]), s2('touchEnd', [])]);
  await p2.waitForTimeout(900);
  const b1 = await p2.evaluate(() => ({ t: __rrpc._touch(), dashes: __rrpc.G.stat.dashes,
    held: __rrpc._step(0, 1 / 120).held }));
  ok(b1.held === false, 'the second page is running the real rAF clock, nothing held',
    'held ' + b1.held);
  ok(b1.t.dashes - b0.dashes >= 1 && b1.dashes >= 1,
    'a double tap on a LIVE, rendering page still dashes — the timing is not a lab artefact',
    'gestures +' + (b1.t.dashes - b0.dashes) + ' · sim ' + b1.dashes);
  await p2.close();
}

console.log('\n── 10 · THE COMBO CAMERA AND THE EXPOSURE SMEAR ───────────────────────────────');
/* Artist, 2026-08-06: *"lets add in some motion blur and camera angles now for dynamic combo
 * sequences."* The combo is FLOW — dash → roll → dash, three links light OVERDRIVE — so the
 * assertions below are all about the camera being driven BY THAT STATE MACHINE. "The camera
 * moved" is the weak question; a timer would pass it.
 *
 * ⚠ `_camStep` exists because `_step` advances the SIMULATION only and the camera lives in the
 *   render frame. A probe that stepped the sim and read the camera would be reading a rig that
 *   never moved, and every assertion here would pass or fail for the wrong reason. */
/* ⛔ THIS SECTION OWNS ITS OWN PAGE, AND THE FIRST VERSION DID NOT — IT MEASURED A BUILD WITH THE
 * FEATURE SWITCHED OFF AND CALLED IT A REGRESSION. The suite runs at 844×390, where the quality
 * tier resolves to `low`, and `low` carries `smear: 0` ON PURPOSE — a weak device should not pay
 * for an exposure pass. So every smear number came back 0.00000 and two assertions failed against
 * code that was working. ⚑ Same genre as this repo's `test:ronin` note ("the test did not bite
 * until the viewport was fixed"), with the sign flipped: here the viewport made a healthy feature
 * look broken. Force the tier, and assert the OFF case separately rather than inferring it. */
{
  const pc3 = await ctx.newPage();
  await pc3.goto(`http://127.0.0.1:${PORT}/riprocketer.html?hold=1&q=high`, { waitUntil: 'load', timeout: 90000 });
  await pc3.waitForFunction(() => window.__rrpc && window.__rrpc._cam, null, { timeout: 90000 });
  await pc3.evaluate(() => __rrpc.start(false));
  await pc3.waitForTimeout(700);
  const page = pc3;                       // shadow, so the section reads the same as the others
  const park = () => page.evaluate(() => {
    const s = __rrpc.G.ship;
    s.x = 0; s.y = -3.05; s.vx = 0; s.vy = 0; s.alive = true; s.inv = 0; s.iframe = 0;
    s.dash = 0; s.dashCd = 0; s.rollT = 0; s.rollCd = 0; s.flow = 0; s.flowT = 0; s.od = 0; s.odCd = 0;
    __rrpc.G.shake = 0; __rrpc.G.phase = 'fight'; __rrpc.G.phaseT = 9;
    for (let i = 0; i < 200; i++) __rrpc._camStep(1, 1 / 60);
    return __rrpc._cam();
  });
  const rest = await park();
  /* ⛔ THE LOAD-BEARING ONE, and it is EXACTLY 0 rather than "small". The smear is an exposure
   * integral of how far the camera travelled, so a still camera must produce a still frame — not
   * a nearly-still one. A threshold here would pass a shader that permanently smudges the game.
   * Same shape as the hero rig's "at rest every letter is exactly 0". */
  ok(rest.len === 0, 'at rest the exposure smear is EXACTLY zero, not merely small',
    'len ' + rest.len);
  /* ⛔ ROTATION IS IDENTITY, AND THIS ASSERTION PROTECTS THE TOUCH CONTROLS, NOT THE LOOK.
   * `_field()`/`_screen()` map the draw-path gesture using NOMINAL camera constants — reading the
   * live camera would close a finger ⇒ ship ⇒ camera ⇒ finger loop. A yaw added later "because
   * camera angles" would desync the fingertip from the ship by the whole rotation, silently, on
   * the control that shipped the week before. Dolly and crane are safe; a rotation is not. */
  ok(rest.rot.every(v => Math.abs(v) < 0.001),
    'the camera never rotates — the draw-path mapping assumes the optical axis is where it was',
    'euler ' + JSON.stringify(rest.rot));

  const chain = await page.evaluate(() => {
    const s = __rrpc.G.ship, out = {};
    const tick = n => { for (let i = 0; i < n; i++) { __rrpc._step(2, 1 / 120); __rrpc._camStep(1, 1 / 60); } };
    s.x = 0; s.y = -3.05; s.vx = 0; s.vy = 0; s.alive = true; s.inv = 0;
    s.dash = 0; s.dashCd = 0; s.rollT = 0; s.rollCd = 0; s.flow = 0; s.flowT = 0; s.od = 0; s.odCd = 0;
    __rrpc.G.shake = 0; tick(30);
    out.idle = __rrpc._cam().len;
    RRGame.dash(__rrpc.G, 1); tick(10); out.d1 = __rrpc._cam().len; out.f1 = __rrpc.G.ship.flow;
    tick(18); RRGame.roll(__rrpc.G, -1); tick(8); out.r = __rrpc._cam().len; out.f2 = __rrpc.G.ship.flow;
    tick(40); RRGame.dash(__rrpc.G, 1); tick(8); out.d2 = __rrpc._cam().len; out.f3 = __rrpc.G.ship.flow;
    tick(6); out.od = __rrpc._cam().len; out.odT = __rrpc.G.ship.od; out.cam = __rrpc._cam();
    return out;
  });
  /* ⚑ THE ASSERTION THAT DISCRIMINATES: the smear ESCALATES along the chain. "It blurred" is
   * satisfied by any constant; a ramp that tracks flow 1 → 2 → 3 → overdrive can only come from
   * the combo state. Measured 0.0006 → 0.0009 → 0.0015 → 0.0026, a 4.3× rise. */
  ok(chain.d1 < chain.r && chain.r < chain.d2 && chain.d2 < chain.od,
    'the smear ESCALATES through dash → roll → dash → overdrive, so the combo is what drives it',
    [chain.d1, chain.r, chain.d2, chain.od].map(v => (+v).toFixed(5)).join(' → '));
  ok(chain.f3 >= 3 && chain.odT > 0, 'the chain really did light OVERDRIVE (not a coincidental ramp)',
    'flow ' + chain.f1 + '→' + chain.f2 + '→' + chain.f3 + ' · od ' + (+chain.odT).toFixed(2));
  ok(chain.od / Math.max(1e-9, chain.idle) > 2.5,
    'overdrive smears materially more than idle flight — the effect is an event, not a wash',
    (chain.od / Math.max(1e-9, chain.idle)).toFixed(1) + '×');
  /* the camera geometry itself: in on the dolly, down on the crane, ahead on the lead. */
  ok(chain.cam.z < rest.z - 0.3 && chain.cam.y < rest.y - 0.08,
    'OVERDRIVE dollies the camera IN and cranes it DOWN — a real angle change, not a zoom',
    'Δz ' + (chain.cam.z - rest.z).toFixed(3) + ' · Δy ' + (chain.cam.y - rest.y).toFixed(3));
  ok(chain.cam.rot.every(v => Math.abs(v) < 0.001),
    'and it is STILL not rotating at full overdrive deflection', 'euler ' + JSON.stringify(chain.cam.rot));
  /* ⛔ THE BOUND THE COMMENT IN rrpc-app.js CLAIMS — AND MY FIRST VERSION OF IT COULD NOT FAIL.
   * I asserted that `_field` round-trips through `_screen`. Both use NOMINAL camera constants and
   * are exact inverses of each other by construction, so that assertion is true on any build,
   * including one where the camera has flown off to the moon. It measured nothing.
   * ⚑ The real question is whether the nominal mapping still agrees with the LIVE camera once the
   *   dolly has moved it: the finger picks a world point through nominal (z 11.4, fov 42°) while
   *   the ship is DRAWN through the live one. So project the picked point through the actual
   *   camera and compare it back to where the finger was. That can fail, and it is the number the
   *   dolly has to stay inside. */
  const err = await page.evaluate(() => {
    const ov = document.getElementById('rrov'), r = ov.getBoundingClientRect();
    const px = r.left + r.width * 0.72, py = r.top + r.height * 0.34;
    const f = __rrpc._field(px, py);
    const v = new pc.Vec3(f.x, f.y, 0);
    const s = __rrpc.cam.camera.worldToScreen(v, new pc.Vec3());
    return { dx: Math.abs(s.x - px) / r.width, dy: Math.abs(s.y - py) / r.height,
             z: __rrpc._cam().z, fov: __rrpc._cam().fov };
  });
  /* the existing `drift` already spends ±0.5 world units of the same kind of disagreement, which
   * is ~3.6% of the frame. The dolly must not cost more than that on either axis. */
  ok(err.dx < 0.036 && err.dy < 0.036,
    'at full combo deflection the finger and the LIVE camera still agree to within what drift already spends',
    'off by ' + (err.dx * 100).toFixed(1) + '% / ' + (err.dy * 100).toFixed(1) + '% of frame'
      + ' · cam z ' + err.z + ' fov ' + err.fov);
  const hi = await page.evaluate(() => __rrpc._cam());
  ok(hi.smear === true && hi.taps > 1, 'the high tier actually has the exposure pass installed',
    'taps ' + hi.taps + ' shutter ' + hi.shutter);
  await park();
  await pc3.close();
}

/* ⚑ AND THE OFF CASE, WHICH IS THE HALF THAT KEEPS THE LADDER HONEST. "No smear on low" is
 * trivially satisfied by a build where the smear never works anywhere — so it is asserted
 * alongside the high-tier assertion above, not instead of it. This is the fail-open direction:
 * the game must render and play identically with the pass absent. */
{
  const lo = await ctx.newPage();
  const loErrs = [];
  lo.on('pageerror', e => loErrs.push(e.message.slice(0, 160)));
  await lo.goto(`http://127.0.0.1:${PORT}/riprocketer.html?hold=1&q=low`, { waitUntil: 'load', timeout: 90000 });
  await lo.waitForFunction(() => window.__rrpc && window.__rrpc._cam, null, { timeout: 90000 });
  await lo.evaluate(() => __rrpc.start(false));
  await lo.waitForTimeout(600);
  /* ⚠ THE PHASE HAS TO BE PARKED OR THIS MEASURES THE WAVE-ENTRY PULL-BACK, NOT THE DOLLY. On
   * `phase === 'entry'` the camera adds up to +1.4 to z so the formation arrives from further
   * away — correct, and it swamps the combo's −0.78. The first version of this read z 12.02 and
   * reported the angles as missing on the low tier when they were working: a probe measuring the
   * wrong moment, which is this repo's most-repeated harness mistake. */
  const c = await lo.evaluate(() => {
    const s = __rrpc.G.ship; s.od = 4; s.flow = 3; s.vx = 9; s.alive = true;
    __rrpc.G.phase = 'fight'; __rrpc.G.phaseT = 9; __rrpc.G.shake = 0;
    for (let i = 0; i < 120; i++) __rrpc._camStep(1, 1 / 60);
    return __rrpc._cam();
  });
  ok(c.smear === false && c.taps === 0, 'the LOW tier ships no exposure pass at all',
    'smear ' + c.smear + ' taps ' + c.taps);
  ok(c.z < 11.4 - 0.3, 'but the combo CAMERA still moves there — the angles are not a quality feature',
    'z ' + c.z);
  ok(loErrs.length === 0, 'and nothing throws with the pass absent', loErrs.slice(0, 2).join(' | ') || 'clean');
  await lo.close();
}

console.log('\n── 11 · NOTHING THREW DOING ANY OF IT ─────────────────────────────────────────');
ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | ') || 'clean');

await br.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

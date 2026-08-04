#!/usr/bin/env node
/* ripmaster3030studios — ACCEPTANCE 1–5 FOR THE FIRST OF THE 33.   npm run test:hero
 *
 * `docs/HERO-33-BRIEF.md` §5 lists ten measurements and §7 says step one ends in the first five.
 * They exist because this project has twice accepted a beautiful object that was dead — the
 * recorded signature is a brief that names a material and a mood and waves at motion. So none of
 * these is "does it look right":
 *
 *   1  it is foil          median hue travel across >= 8 view angles          >= 200 deg
 *   2  it is still         max displacement over 10 s with no input           EXACTLY 0
 *   3  it is reactive      displacement under pointer, and it OVERSHOOTS      > 0, overshoot > 0
 *   4  the glitch is PRINT plate offsets uniform per plate, not radial        variance ~ 0
 *   5  it is deterministic same seed -> byte-identical frame                  exact
 *
 * ⚑ EVERY ONE OF THESE IS MEASURED OFF THE RENDERED PICTURE, not off the state that produced it.
 *   The distinction has cost this repo real time: DOGFIGHT's every driven number passed while the
 *   game rendered an empty sky, because all of them read the simulation and none of them read the
 *   frame. `probe()` is used only where the claim is genuinely about the sim (the springs).
 *
 * ⚑ AND FOUR AND FIVE PROVE THEY DISCRIMINATE. Test 4 runs the same block-match over a build
 *   whose registration has been made deliberately RADIAL and requires it to FAIL; test 5 requires
 *   two DIFFERENT seeds to differ, because "the two frames match" is trivially true of two black
 *   frames. A check that cannot fail is not a check.
 *
 * ⚠ Colour is read with readPixels from inside the page. CLAUDE.md: this container's screenshot
 *   path rotates hue on canvas content, so a hue measured off a PNG here means nothing.
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}` + (detail ? `  — ${detail}` : '')); }
  else { fail++; console.log(`  FAIL ${name}` + (detail ? `  — ${detail}` : '')); }
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try {
    const d = readFileSync(join(ROOT, p));
    rs.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    rs.end(d);
  } catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

console.log('\nTHE 33 · card 1 — acceptance 1-5\n');

// ── 0 · the pieces exist at all ─────────────────────────────────────────────────────────────
{
  const spec = join(ROOT, 'cards', 'type', 'plate-proof.json');
  t('the type is committed as coordinates', existsSync(spec));
  if (existsSync(spec)) {
    const j = JSON.parse(readFileSync(spec, 'utf8'));
    const letters = (j.letters || []).length;
    const pts = (j.letters || []).reduce((n, L) => n + L.contours.reduce((m, c) => m + c.length, 0), 0);
    t('the type carries real outlines', letters >= 8 && pts > 200, `${letters} letters · ${pts} points`);
    // ⛔ No font may be NAMED either — the whole point of §0 is that the collector's machine does
    //    not get a vote. A font-family anywhere in the renderer would mean it does.
    const src = readFileSync(join(ROOT, 'js', 'hero-card.js'), 'utf8');
    t('the renderer names no font', !/font-family|['"]Arial|measureText|ctx\.font|g\.font/.test(src));
  }
}

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });

/* ⚑ A BARE HARNESS PAGE, not cards/proof.html. The proof page runs a rAF loop and a readout
 * interval, and a test that fights a live loop for control of the clock measures the fight.
 * Everything below drives `advance(dt)` by hand, which is the whole reason that entry point
 * exists. cards/proof.html's own reachability is asserted by `npm run test:reach`. */
await page.goto(`http://localhost:${PORT}/cards/proof.html?bare`, { waitUntil: 'load' });
await page.evaluate(() => { if (window.__proof) window.__proof.destroy(); });

const R = await page.evaluate(async () => {
  const out = { steps: [] };
  const spec = await fetch('type/plate-proof.json').then(r => r.json());
  const rows = await fetch('hero-manifest.json').then(r => r.json());
  const pool = (Array.isArray(rows) ? rows : rows.cards).map(c => c.art).filter(Boolean);
  out.pool = pool.length;

  function mk(seed, W, H) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    document.body.appendChild(cv);
    return window.HeroCard.build({ canvas: cv, seed: seed, pigment: pool, type: spec });
  }
  const A = await mk(3030, 360, 540);
  if (!A) { out.built = false; return out; }
  out.built = true;

  const still = (c, n) => { for (let i = 0; i < n; i++) c.advance(16.6667); };
  const hash = px => {                       // FNV-1a over the whole buffer — byte-identical or not
    let h = 0x811c9dc5;
    for (let i = 0; i < px.data.length; i++) { h ^= px.data[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  };

  // ── 1 · FOIL: hue travel along the die edge across a fan of yaws ────────────────────────
  /* The sample patch is the TOP-CENTRE of the die edge, and it is there for a reason: under a
   * yaw the card turns about its own y axis, so a point at x=0 does not move on screen. Every
   * angle therefore reads the SAME piece of foil, which is what makes the numbers comparable. */
  {
    A.setRegistration(1, 0);
    A.setView(0, 0);
    const W = 360, H = 540;
    const meds = [];
    for (let i = 0; i < 9; i++) {
      const yaw = -0.60 + (1.20 * i) / 8;
      A.setView(yaw, 0);
      A.render();
      const px = A.pixels();
      const hs = [];
      // readPixels is bottom-up; the die edge sits in the outer ~2-4% of the half-extent
      for (let y = Math.round(H * 0.958); y < Math.round(H * 0.978); y++) {
        for (let x = Math.round(W * 0.35); x < Math.round(W * 0.65); x++) {
          const k = (y * W + x) * 4;
          const r = px.data[k] / 255, g = px.data[k + 1] / 255, b = px.data[k + 2] / 255;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx - mn < 0.05) continue;
          let h;
          if (mx === r) h = ((g - b) / (mx - mn) + 6) % 6;
          else if (mx === g) h = (b - r) / (mx - mn) + 2;
          else h = (r - g) / (mx - mn) + 4;
          hs.push(h * 60);
        }
      }
      hs.sort((a, b) => a - b);
      meds.push(hs.length ? hs[hs.length >> 1] : null);
    }
    let travel = 0, n = 0;
    for (let i = 1; i < meds.length; i++) {
      if (meds[i] == null || meds[i - 1] == null) continue;
      let d = meds[i] - meds[i - 1];
      while (d > 180) d -= 360; while (d < -180) d += 360;
      travel += Math.abs(d); n++;
    }
    out.foil = { travel: travel, samples: n, meds: meds.map(m => m == null ? null : +m.toFixed(1)) };
    A.setView(null);
  }

  // ── 2 · STILL: ten seconds, no input, and the FRAME must not move either ───────────────
  {
    A.setView(0, 0);
    A.render();
    const before = hash(A.pixels());
    const p0 = A.probe();
    still(A, 600);                                             // 10 s at 60
    A.render();
    const after = hash(A.pixels());
    const p1 = A.probe();
    out.still = {
      maxFlex: p1.maxFlex,
      maxVel: p1.flexV.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
      sheetBefore: p0.sheet, sheetAfter: p1.sheet,
      frameSame: before === after, before, after,
    };
    A.setView(null);
  }

  // ── 3 · REACTIVE, and it OVERSHOOTS ────────────────────────────────────────────────────
  /* "Did it move" is the weak question — a lerp passes it. The assertion that bites is that the
   * dish crosses back through zero after release, because a first-order approach never can. */
  {
    A.pointer(0.35, 0.20, true);
    let held = 0;
    for (let i = 0; i < 40; i++) { A.advance(16.6667); held = Math.min(held, A.probe().flex[0]); }
    A.pointer(0, 0, false);
    let over = 0;
    for (let i = 0; i < 90; i++) { A.advance(16.6667); over = Math.max(over, A.probe().flex[0]); }
    // and it must come back to rest, or "it rings" is really "it does not settle"
    for (let i = 0; i < 600; i++) A.advance(16.6667);
    out.react = { held: held, overshoot: over, settled: A.probe().maxFlex };
  }

  // ── 4 · THE GLITCH IS PRINT, NOT A LENS ────────────────────────────────────────────────
  /* Hold the view still, step the registration, and block-match the two frames. A press failure
   * displaces every block by the SAME vector; a lens artefact displaces them by a vector that
   * grows with radius. So the discriminator is the correlation of |shift| with radius, and the
   * radial control below must show it while the real build must not. */
  function shiftField(c, radial) {
    c.setView(0, 0);
    c.setRegistration(0, 0); c.render();
    const a = c.pixels();
    c.setRegistration(2.2, radial); c.render();
    const b = c.pixels();
    c.setRegistration(1, 0); c.setView(null);
    const W = a.w, H = a.h, S = 5, RNG = 7, blocks = [];
    const lum = px => {
      const L = new Float32Array(W * H);
      for (let i = 0, p = 0; i < px.data.length; i += 4, p++)
        L[p] = px.data[i] * 0.299 + px.data[i + 1] * 0.587 + px.data[i + 2] * 0.114;
      return L;
    };
    const LA = lum(a), LB = lum(b);
    for (let by = 0; by < S; by++) for (let bx = 0; bx < S; bx++) {
      const x0 = Math.round(W * (0.18 + 0.64 * bx / (S - 1))) - 18;
      const y0 = Math.round(H * (0.20 + 0.60 * by / (S - 1))) - 18;
      let best = 1e18, bdx = 0, bdy = 0, energy = 0;
      for (let dy = -RNG; dy <= RNG; dy++) for (let dx = -RNG; dx <= RNG; dx++) {
        let sum = 0;
        for (let y = 0; y < 36; y += 2) for (let x = 0; x < 36; x += 2) {
          const d = LA[(y0 + y) * W + (x0 + x)] - LB[(y0 + y + dy) * W + (x0 + x + dx)];
          sum += d * d;
        }
        if (sum < best) { best = sum; bdx = dx; bdy = dy; }
      }
      for (let y = 2; y < 36; y += 2) for (let x = 0; x < 36; x += 2)
        energy += Math.abs(LA[(y0 + y) * W + (x0 + x)] - LA[(y0 + y - 2) * W + (x0 + x)]);
      blocks.push({ dx: bdx, dy: bdy, energy: energy,
        r: Math.hypot(bx / (S - 1) - 0.5, by / (S - 1) - 0.5) });
    }
    // only blocks with real detail can report a shift at all; a flat block matches anywhere
    const good = blocks.filter(b => b.energy > 900);
    const mag = good.map(b => Math.hypot(b.dx, b.dy));
    const mean = mag.reduce((s, v) => s + v, 0) / Math.max(1, mag.length);
    const varr = mag.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, mag.length);
    // correlation of shift magnitude with radius — the radial signature
    const rs = good.map(b => b.r);
    const rm = rs.reduce((s, v) => s + v, 0) / Math.max(1, rs.length);
    let cov = 0, vr = 0;
    for (let i = 0; i < good.length; i++) { cov += (rs[i] - rm) * (mag[i] - mean); vr += (rs[i] - rm) ** 2; }
    return { n: good.length, mean: mean, sd: Math.sqrt(varr),
      slope: vr > 1e-9 ? cov / vr : 0 };
  }
  out.print = shiftField(A, 0);
  out.printRadial = shiftField(A, 1);

  // ── 5 · DETERMINISTIC ──────────────────────────────────────────────────────────────────
  {
    const B = await mk(3030, 360, 540);
    const C = await mk(4747, 360, 540);
    const drive = c => {
      c.setView(0.18, -0.07);
      c.pointer(0.3, -0.2, true);
      for (let i = 0; i < 25; i++) c.advance(16.6667);
      c.pointer(0.3, -0.2, false);
      for (let i = 0; i < 25; i++) c.advance(16.6667);
      c.render();
      return hash(c.pixels());
    };
    const a = drive(A), b = drive(B), c = drive(C);
    out.det = { same: a === b, differs: a !== c, a, b, c };
    B.destroy(); C.destroy();
  }

  // ── 6 · the type comes from the JSON, not from anything installed ──────────────────────
  {
    const D = await mk(3030, 360, 540);
    const E = await window.HeroCard.build({
      canvas: Object.assign(document.createElement('canvas'), { width: 360, height: 540 }),
      seed: 3030, pigment: pool, type: null,
    });
    D.setView(0, 0); D.render();
    E.setView(0, 0); E.render();
    out.typeDrives = hash(D.pixels()) !== hash(E.pixels());
    D.destroy(); E.destroy();
  }

  // ── 7 · fails open ─────────────────────────────────────────────────────────────────────
  out.failsOpen = (await window.HeroCard.build({
    canvas: document.createElement('canvas'), seed: 1, pigment: ['nope-does-not-exist.webp'],
  })) === null;

  A.destroy();
  return out;
});

if (!R.built) {
  t('the card builds', false, 'HeroCard.build returned null');
} else {
  t('the card builds', true, `${R.pool} deck cards in the pigment pool`);

  // 1
  t('1 · it is foil — hue walks with the angle', R.foil.travel >= 200,
    `${R.foil.travel.toFixed(0)} deg over ${R.foil.samples + 1} yaws (bar 200)`);

  // 2
  t('2 · still at rest — flex is EXACTLY zero after 10 s',
    R.still.maxFlex === 0 && R.still.maxVel === 0,
    `flex ${R.still.maxFlex} · vel ${R.still.maxVel}`);
  t('2 · still at rest — and the FRAME is byte-identical', R.still.frameSame,
    `${R.still.before} vs ${R.still.after}`);
  t('2 · the press does not run on its own', R.still.sheetBefore === R.still.sheetAfter,
    `sheet #${R.still.sheetAfter}`);

  // 3
  t('3 · it moves under the pointer', R.react.held < -1e-4, `dish ${R.react.held.toFixed(5)}`);
  t('3 · and it OVERSHOOTS on release', R.react.overshoot > 1e-5,
    `+${R.react.overshoot.toFixed(5)} past rest`);
  t('3 · and then it settles', R.react.settled < 1e-6, `${R.react.settled.toExponential(2)}`);

  // 4
  t('4 · the plates actually moved', R.print.mean > 0.8 && R.print.n >= 8,
    `${R.print.mean.toFixed(2)} px over ${R.print.n} blocks`);
  /* ⚠ RELATIVE, not absolute. Block matching is integer-precision on a four-plate composite, so
   * an absolute sd bar sits a hair above the noise and the test becomes a coin toss the first
   * time a source card changes. What "uniform" means is that the spread is small COMPARED TO the
   * shift, which is scale-free and is the actual claim. */
  t('4 · the offset is UNIFORM across the frame', R.print.sd < 0.35 * R.print.mean,
    `sd ${R.print.sd.toFixed(2)} of ${R.print.mean.toFixed(2)} px = ${(R.print.sd / R.print.mean).toFixed(2)} (bar 0.35)`);
  t('4 · and it does not grow with radius', Math.abs(R.print.slope) < 3.0,
    `slope ${R.print.slope.toFixed(2)} px per unit radius`);
  /* ⛔ THE CONTROL. If the radial build passes the same two assertions then they are not
   * measuring anything, and a green line would mean nothing at all. */
  t('4 · the measurement REJECTS a radial build',
    R.printRadial.sd >= 0.35 * R.printRadial.mean || Math.abs(R.printRadial.slope) >= 3.0,
    `radial: sd/mean ${(R.printRadial.sd / R.printRadial.mean).toFixed(2)} · slope ${R.printRadial.slope.toFixed(2)}`);

  // 5
  t('5 · same seed, same drive -> byte-identical frame', R.det.same, R.det.a);
  t('5 · and a different seed is a different card', R.det.differs, `${R.det.a} vs ${R.det.c}`);

  // 6 / 7
  t('the name comes from the committed outlines', R.typeDrives === true);
  t('a missing pigment fails open to null', R.failsOpen === true);
}
t('no page errors', errs.length === 0, errs.join(' | ') || 'clean');

await browser.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

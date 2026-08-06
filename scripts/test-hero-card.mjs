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
  const grab = u => fetch(u).then(r => r.json())
    .then(raw => (Array.isArray(raw) ? raw : raw.cards).map(c => c.art).filter(Boolean));
  const pool = (await grab('manifest.json')).concat(await grab('hero-manifest.json'));
  out.pool = pool.length;

  function mk(seed, W, H) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    document.body.appendChild(cv);
    return window.HeroCard.build({ canvas: cv, seed: seed, pigment: pool, type: spec });
  }
  const mkM = (seed, W, H, motion) => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    document.body.appendChild(cv);
    return window.HeroCard.build({ canvas: cv, seed: seed, pigment: pool, type: spec, motion: motion });
  };
  const A = await mk(3030, 360, 540);
  if (!A) { out.built = false; return out; }
  out.built = true;
  /* ⚠ FINISH THE SHEET BEFORE MEASURING IT. Cards now WRITE THEMSELVES ON — the impression lands
   * down the sheet over about a second and a half — so a card measured straight after build is a
   * card half printed. Two assertions caught it the moment the write-on landed: "nothing drifts"
   * saw the ink still arriving, and the registration block-match found ZERO blocks with any detail
   * in them, because most of the card was still blank stock. Both were right; the setup was wrong.
   * The write-on gets its own measurements further down. */
  A.writeOn(1);

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
    /* Lifted into a function so HOLDING can be measured with the SAME instrument as the foil
     * itself. Two copies of this loop would be two chances for the comparison to be measuring
     * something other than the thing it names. */
    const measureTravel = () => {
      const meds = [];
      for (let i = 0; i < 9; i++) {
        const yaw = -0.60 + (1.20 * i) / 8;
        A.setView(yaw, 0);
        A.render();
        const px = A.pixels();
        const hs = [];
        // readPixels is bottom-up; the die edge sits in the outer ~2-4% of the half-extent
        for (let y = Math.round(H * 0.961); y < Math.round(H * 0.974); y++) {
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
      return { travel: travel, samples: n, meds: meds.map(m => m == null ? null : +m.toFixed(1)) };
    };
    out.foil = measureTravel();

    /* ── HOLDING: the lens's tier, as the foil's RULING ────────────────────────────────────
     * The staking read has existed and been tested for days and drove ZERO pixels — two lines of
     * JSON on a marketplace. This is the payoff, and it is measured the only way DESIGN-SYSTEM §1
     * accepts: "foil is defined by movement… render at several view angles and MEASURE the hue
     * shift." A finer-ruled foil splits light harder, so Inferno must TRAVEL further than Ash.
     * ⛔ AND COVERAGE MUST NOT MOVE. If holding changed how much of the border is metal, a common
     *   card in a rich wallet would read as a mythic one — rarity would be purchasable. Both
     *   halves are asserted, because "it changed" alone would pass a build that changed the
     *   wrong thing. */
    A.setTier(0); A.render();
    const ash = measureTravel();
    const ashProbe = A.probe();
    A.setTier(4); A.render();
    const inferno = measureTravel();
    const infProbe = A.probe();
    /* ⚠ AND BACK TO 0 MUST RETURN THE ORIGINAL CARD, not merely something similar. An unheld card
     *   is the artist's card; a dial that cannot go home is a dial that permanently alters the
     *   work of anyone who once connected a funded wallet. */
    A.setTier(0); A.render();
    const home = hash(A.pixels());
    A.setTier(0); A.render();
    /* ⚠ MEASURE COVERAGE ON A CARD OF ITS OWN, AND NEVER ON `A`. At A's own rarity the coverage is
     *   0, so "ash cover === inferno cover" is 0 === 0 — true even of a build where holding adds
     *   coverage. The obvious fix, A.setRarity('rare'), broke test 5 THREE BLOCKS LATER: setRarity
     *   rebakes the type plate and putting the rarity back does not undo the rebake, so "same seed
     *   -> byte-identical frame" started failing with nothing pointing at this block. A
     *   measurement that mutates shared state fails somebody else's assertion, far from the cause.
     *   Same shape as the tier ladder leaking between blocks in test:lens today. */
    const Bc = await mk(3030, 360, 540);
    let coverAsh = null, coverInf = null;
    if (Bc) {
      Bc.writeOn(1);
      Bc.setRarity('rare');
      Bc.setTier(0); Bc.render(); coverAsh = Bc.probe().frameFoilSent;
      Bc.setTier(4); Bc.render(); coverInf = Bc.probe().frameFoilSent;
      Bc.destroy();
    }
    out.hold = {
      ashCover: coverAsh, infernoCover: coverInf,
      ashTravel: ash.travel, infernoTravel: inferno.travel,
      ashGrating: ashProbe.grating, infernoGrating: infProbe.grating,
      ashHold: ashProbe.hold, infernoHold: infProbe.hold,
      returnsHome: home === hash(A.pixels()),
    };
    A.setView(null);
  }

  // ── 2 · STILL: ten seconds, no input, and the FRAME must not move either ───────────────
  /* ⚠ THIS ASSERTION HAD TO NARROW, AND SAYING SO IS THE POINT. It used to demand a byte-identical
   * frame over ten seconds full stop — which encoded a decision the artist has since overruled:
   * the press RUNS now, looping in z. Deleting the test would have thrown away what it was really
   * protecting, which is that nothing DRIFTS. So the claim is now exact: with the press stopped
   * the card is dead still, the springs sit at exactly 0, and the only motion the card has is a
   * closed cycle — which the loop test below measures on its own terms. */
  {
    A.setView(0, 0);
    A.setSpin(false); A.setPhase(0);
    A.render();
    const before = hash(A.pixels());
    const p0 = A.probe();
    still(A, 600);                                             // 10 s at 60
    A.render();
    const after = hash(A.pixels());
    const p1 = A.probe();
    A.setSpin(true);
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
  function shiftField(c, radial, gain) {
    c.setView(0, 0);
    c.setRegistration(0, 0); c.render();
    const a = c.pixels();
    c.setRegistration(gain, radial); c.render();
    const b = c.pixels();
    c.setRegistration(1, 0); c.setView(null);
    /* ⚠ THE SEARCH WINDOW HAS TO COVER THE RADIAL CONTROL'S WORST BLOCK, or the control stops
     * being a control. At RNG 7 the outer blocks of the radial build were displaced further than
     * the search could look, every one of them reported a clamped 7 px, and the slope FLATTENED —
     * the deliberately-broken build started passing the uniformity test by being too broken to
     * measure. Widened to 11 and the radial gain in the shader tuned so its worst block lands
     * inside it. A saturating measurement reads as a null result. */
    const W = a.w, H = a.h, S = 5, RNG = 16, blocks = [];
    /* ⛔ LOW-PASS FIRST, BECAUSE A HALFTONE IS PERIODIC. The screen runs at about three device
     * pixels a cell, so the luminance field repeats — and a block matcher over a periodic signal
     * has many equally good minima. Widening the search window to cover the radial control made
     * that bite immediately: the honest build's measured shift jumped from 4.6 px to 8.5 px and
     * its spread went over the bar, not because the plates had moved but because blocks were
     * locking onto the wrong dot. A 5-tap box in each axis erases the screen and leaves the
     * picture, which is the thing whose displacement is actually being claimed. */
    const lum = px => {
      const L = new Float32Array(W * H), T = new Float32Array(W * H);
      for (let i = 0, p = 0; i < px.data.length; i += 4, p++)
        T[p] = px.data[i] * 0.299 + px.data[i + 1] * 0.587 + px.data[i + 2] * 0.114;
      const B = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let a = 0;
        for (let k = -2; k <= 2; k++) a += T[y * W + Math.min(W - 1, Math.max(0, x + k))];
        B[y * W + x] = a / 5;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let a = 0;
        for (let k = -2; k <= 2; k++) a += B[Math.min(H - 1, Math.max(0, y + k)) * W + x];
        L[y * W + x] = a / 5;
      }
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
        x: bx / (S - 1) - 0.5, y: by / (S - 1) - 0.5,
        r: Math.hypot(bx / (S - 1) - 0.5, by / (S - 1) - 0.5) });
    }
    // only blocks with real detail can report a shift at all; a flat block matches anywhere
    const good = blocks.filter(b => b.energy > 900);
    const mag = good.map(b => Math.hypot(b.dx, b.dy));
    const mean = mag.reduce((s, v) => s + v, 0) / Math.max(1, mag.length);
    const varr = mag.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, mag.length);
    /* ⛔ POSITION-INDEPENDENCE IS THE TEST, NOT LOW SPREAD, and getting that wrong would have
     * been a test that fails on a correct card forever. A four-plate print has FOUR different
     * registrations by construction, and a block matcher over the composite returns whichever
     * plate dominates locally — so blocks are SUPPOSED to disagree, and the spread has a
     * predicted value. Measured against it: at this gain the four plates should shift by
     * 9.9 / 12.9 / 3.7 / 5.5 px (mean 8.0, sd 3.55) and the matcher reports mean 8.10, sd 3.07.
     * The spread is the plates, not the measurement.
     * ⚑ What separates a press failure from a lens artefact is that the field does not depend on
     *   WHERE you are in the frame. So: regress the shift magnitude on radius, on x and on y, and
     *   all three slopes must be flat. Measured 0.08 for the real build against 13.88 for the
     *   radial control — a factor of 170, which is a discriminator rather than a threshold. */
    const reg1 = key => {
      const xs = good.map(key);
      const xm = xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
      let cov = 0, vr = 0;
      for (let i = 0; i < good.length; i++) { cov += (xs[i] - xm) * (mag[i] - mean); vr += (xs[i] - xm) ** 2; }
      return vr > 1e-9 ? cov / vr : 0;
    };
    /* ⛔ THE EXACT INVARIANT: every block's shift must land on ONE OF THE FOUR PLATE OFFSETS,
     * anywhere in the frame. That is what "the plates are misregistered" MEANS, and unlike a
     * spread bar or a slope it is not confounded by content — a radial field is ~0 at the centre
     * and large at the edge, so most of its blocks match none of the four. */
    const reg = c.probe().reg;
    const cands = [];
    for (let p = 0; p < 4; p++) {
      // readPixels is bottom-up while uv y runs down the card, hence the flipped y.
      cands.push([reg[p * 2] * gain * W, -reg[p * 2 + 1] * gain * H]);
      cands.push([-reg[p * 2] * gain * W, reg[p * 2 + 1] * gain * H]);
    }
    const dists = good.map(bl => Math.min(...cands.map(q => Math.hypot(bl.dx - q[0], bl.dy - q[1]))));
    dists.sort((x, y) => x - y);
    /* ⛔ AND THE SIGNATURE OF A LENS ARTEFACT IS A DIRECTION, NOT A SIZE. Chromatic aberration
     * displaces every point AWAY FROM THE CENTRE, so its shift vector is parallel to the block's
     * own position vector; a press failure has no idea where the centre of the sheet is, so its
     * direction is set by which plate dominates and is uncorrelated with position. Distance to
     * the nearest plate offset alone could not separate them cleanly — the four candidates span
     * 3.7 to 12.9 px, which covers most of the radial field's range — but the cosine does, and it
     * needs no threshold tuning because the two answers are 0 and 1. */
    let cosSum = 0, cosN = 0;
    for (const bl of good) {
      const pr = Math.hypot(bl.x, bl.y), sr = Math.hypot(bl.dx, bl.dy);
      if (pr < 0.15 || sr < 1.0) continue;             // centre blocks have no direction to speak of
      /* ⚠ NO FLIP, AND WORKING IT OUT ON PAPER MATTERED. Two sign reversals cancel: readPixels is
       * bottom-up so buffer y opposes card y, AND a feature moves by MINUS the sampling offset,
       * so both the position and the shift pick up the same reversal. Flipping one of them by
       * hand made the x and y terms cancel and the deliberately-radial control measured 0.119
       * against the real build's 0.086 — a control that had stopped controlling. The magnitude
       * is what matters: 0 is a press, 1 is a lens, and the sign only says which way round. */
      cosSum += (bl.dx * bl.x + bl.dy * bl.y) / (pr * sr); cosN++;
    }
    return { n: good.length, mean: mean, sd: Math.sqrt(varr),
      slope: reg1(b => b.r), slopeX: reg1(b => b.x), slopeY: reg1(b => b.y),
      radialCos: cosN ? cosSum / cosN : 0, cosN: cosN,
      onPlate: dists[dists.length >> 1], onPlateWorst: dists[Math.floor(dists.length * 0.85)] };
  }
  out.print = shiftField(A, 0, 2.2);
  out.printRadial = shiftField(A, 1, 2.2);

  // ── 5 · DETERMINISTIC ──────────────────────────────────────────────────────────────────
  {
    const B = await mk(3030, 360, 540);
    const C = await mk(4747, 360, 540);
    /* ⚠ RESET THE PHASE FIRST. A ran the press during the loop tests and B and C are fresh, so
     * without this the three cards start at different points in the cycle and "same seed, same
     * frame" fails on a build that is perfectly deterministic — the test measuring its own setup
     * rather than the renderer. */
    /* ⚠ …and the sheet has to be FINISHED too. A is a card that has been handled all through this
     * harness; B and C are seconds old and still printing. Without this the three start in
     * different states and "same seed, same frame" fails on a renderer that is perfectly
     * deterministic — the test measuring its own setup, for the second time in this file. */
    const drive = c => {
      c.setSpin(false); c.setPhase(0); c.writeOn(1);
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

  /* ══ THE MATERIAL ═══════════════════════════════════════════════════════════════════════
   * Artist, 2026-08-04: "lets keep texturing and add pbr textures, metallic foil etc." A PBR
   * claim is only worth making if it can be told apart from a picture of one, so each of these
   * asks for a behaviour that a painted-on texture cannot fake. */
  {
    const W = 360, H = 540;
    // readPixels is bottom-up, so the card's TOP edge sits at high y.
    const band = (px, y0, y1, x0, x1) => {
      let sat = 0, lum = 0, lum2 = 0, n = 0, white = 0; const px2 = [];
      for (let y = Math.round(H * y0); y < Math.round(H * y1); y++)
        for (let x = Math.round(W * x0); x < Math.round(W * x1); x++) {
          const k = (y * W + x) * 4;
          const r = px.data[k] / 255, g = px.data[k + 1] / 255, b = px.data[k + 2] / 255;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          sat += mx > 1e-3 ? (mx - mn) / mx : 0;
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          lum += l; lum2 += l * l;
          if (px.data[k] === 255 && px.data[k + 1] === 255 && px.data[k + 2] === 255) white++;
          px2.push([l, mx > 1e-3 ? (mx - mn) / mx : 0]);
          n++;
        }
      const m = lum / n;
      /* ⛔ THE HIGHLIGHT'S OWN SATURATION, WHICH IS THE ONLY THING THAT SEPARATES A METAL FROM A
       * COLOURED GLOSS. A dielectric's specular is the LIGHT's colour whatever its albedo, so its
       * brightest pixels wash toward neutral; a metal tints its specular with its own
       * reflectance, so its brightest pixels stay saturated. Averaging over the whole patch — the
       * first version — measured the albedo instead, and passed happily on a build where the foil
       * had been turned into a coloured plastic. */
      px2.sort((a, b) => b[0] - a[0]);
      const top = px2.slice(0, Math.max(4, Math.round(px2.length * 0.10)));
      return { sat: sat / n, lum: m, sd: Math.sqrt(Math.max(0, lum2 / n - m * m)), white: white / n,
        hiSat: top.reduce((a, v) => a + v[1], 0) / top.length,
        hiLum: top.reduce((a, v) => a + v[0], 0) / top.length };
    };
    /* ⚠ THESE TWO WINDOWS WERE SCANNED FOR, NOT GUESSED, and the first pair was wrong in a way
     * that quietly weakened the test: the die band ran from 0.958 and picked up both the paper
     * inside it and the empty frame outside, so its brightest decile was mostly stock. Sweeping
     * the top of the card in 0.7% steps puts the foil at 0.961-0.974 (highlight saturation
     * 0.72-0.90) with bare trim at 0.930-0.952 (0.18) and nothing but clear colour past 0.977. */
    const DIE = [0.961, 0.974, 0.35, 0.65];      // the foil die edge, top-centre
    const TRIM = [0.930, 0.952, 0.35, 0.65];     // bare stock a few mm inside it
    const ART = [0.30, 0.70, 0.25, 0.75];        // deep inside the art window

    A.setView(0.26, -0.10); A.setLight(2.36); A.setEnv(true); A.render();
    const on = A.pixels();
    out.metal = { die: band(on, ...DIE), trim: band(on, ...TRIM) };

    /* ⛔ THE ANTI-WASH ASSERTION. Kill the environment and the ARTWORK must not move by one byte
     * while the FOIL must. This is js/card3d.js's most expensive recorded bug turned into a
     * measurement: an environment map on the art plate lands as a milky ambient-specular sheen,
     * and the only way to know it is not happening is to switch the environment off and diff. */
    const sub = (px, r) => {
      let h = 0x811c9dc5;
      for (let y = Math.round(H * r[0]); y < Math.round(H * r[1]); y++)
        for (let x = Math.round(W * r[2]); x < Math.round(W * r[3]); x++) {
          const k = (y * W + x) * 4;
          for (let c = 0; c < 3; c++) { h ^= px.data[k + c]; h = Math.imul(h, 0x01000193); }
        }
      return (h >>> 0).toString(16);
    };
    A.setEnv(false); A.render();
    const off = A.pixels();
    A.setEnv(true);
    out.env = { artSame: sub(on, ART) === sub(off, ART), dieDiffers: sub(on, DIE) !== sub(off, DIE),
      art: sub(on, ART), die: sub(on, DIE), dieOff: sub(off, DIE) };

    /* ⚑ MOVE THE LIGHT, NOT THE CARD. Shading baked into a texture is invariant to the light by
     * definition, so this is the cheapest possible proof that the surface is lit. It is measured
     * on the BARE TRIM, where nothing but the stock and the light can be responsible. */
    const sweep = [];
    for (let i = 0; i < 7; i++) {
      A.setLight(0.6 + (i * 2.2) / 6);
      A.render();
      const px = A.pixels();
      sweep.push({ trim: band(px, ...TRIM), art: band(px, ...ART), die: band(px, ...DIE) });
    }
    A.setLight(2.36); A.render();
    /* ⚑ THE QUANTITY MATTERS MORE THAN THE BAR. The first version swept the key azimuth and
     * measured the trim's MEAN luminance, which barely moved — and it was right to: on a FLAT
     * card the light's elevation above the surface is the same at every azimuth, so N.L is
     * constant and the diffuse term cannot change. What a moving light actually changes on paper
     * is the SHADOWING OF ITS OWN TOOTH, i.e. the local contrast, and the fibres are laid down
     * with a direction, so lighting along them and across them are different pictures. */
    const swing = (k, f) => {
      const v = sweep.map(s => s[k][f]);
      return (Math.max(...v) - Math.min(...v)) / Math.max(1e-4, v.reduce((a, b) => a + b, 0) / v.length);
    };
    /* ⛔ A METAL HAS NO DIFFUSE, AND THAT IS THE TEST. Asking whether the highlight is tinted was
     * not enough: a build with the foil turned into a coloured PLASTIC — tint moved from F0 into
     * the albedo — sailed through it, because a saturated matte patch has saturated bright pixels
     * too. What a dielectric cannot do is GO OUT. Swing the key away from the specular direction
     * and a metal falls to near black because there is nothing else holding it up, while a
     * coloured plastic sits there at its albedo. Min/max across the sweep, no tuning. */
    /* ⚠ AND THE ENVIRONMENT HAS TO COME OFF FOR THIS ONE. The first version swept only the key
     * and asked the foil to go dark; it bottomed out at 0.46 of its peak and the assertion was
     * simply WRONG — a metal in a room reflects the room, so moving one light cannot extinguish
     * it. A metal has exactly two sources, specular and environment, and no diffuse at all. Take
     * both away and there is nothing left; take both away from a coloured plastic and its albedo
     * is still sitting there. That is the difference, stated exactly. */
    A.setEnv(false);
    const dark = [];
    for (let i = 0; i < 7; i++) {
      A.setLight(0.6 + (i * 2.2) / 6); A.render();
      dark.push(band(A.pixels(), ...DIE).lum);
    }
    A.setEnv(true); A.setLight(2.36);
    const dieL = sweep.map(s2 => s2.die.lum);
    out.light = { trimLum: swing('trim', 'lum'), trimSd: swing('trim', 'sd'),
      artSd: swing('art', 'sd'),
      dieMin: Math.min(...dieL), dieMax: Math.max(...dieL),
      dieNoEnvMin: Math.min(...dark), dieNoEnvMax: Math.max(...dark) };
    out.white = band(on, 0.06, 0.94, 0.06, 0.94).white;

    /* ⚑ THE FIBRE, MEASURED IN THE TEXTURE RATHER THAN THROUGH THE LIGHTING. The lit test below
     * says the trim answers a moving light — true, and it stays true with the fibre switched off,
     * because a crease crossing the patch answers a light too. So the DIRECTIONALITY claim is
     * asserted where it lives: paper's tooth is fibres lying along the machine direction, and a
     * normal map of fibres has more slope across the grain than along it. A hash has neither. */
    const st = A.maps().stock;
    const sc = document.createElement('canvas');
    sc.width = st.width; sc.height = st.height;
    sc.getContext('2d').drawImage(st, 0, 0);
    const sd2 = sc.getContext('2d').getImageData(0, 0, st.width, st.height).data;
    let ax = 0, ay = 0, alpha0 = 0;
    for (let i = 0; i < sd2.length; i += 4) {
      ax += Math.abs(sd2[i] - 128); ay += Math.abs(sd2[i + 1] - 128);
      if (sd2[i + 3] !== 255) alpha0++;
    }
    out.fibre = { ax: ax / (sd2.length / 4), ay: ay / (sd2.length / 4), alphaBad: alpha0 };
  }

  /* ══ THE PRESS RUNS — the loop, and it lives in Z ═══════════════════════════════════════
   * Artist, 2026-08-04: "have the animations live in z space and be looping." Two claims, and
   * they need two different measurements — one about TIME and one about SPACE. */
  {
    A.setSpin(false); A.setView(0, 0); A.setRegistration(1, 0);

    /* ⛔ A LOOP THAT DOES NOT CLOSE IS THE ONE DEFECT NOBODY CATCHES BY WATCHING. The jump happens
     * once every revolution, for one frame, and the eye writes it off as a stutter. Phase 0 and
     * phase 1 are the same instant, so the frame must be identical TO THE BYTE. */
    A.setPhase(0); A.render(); const z0 = hash(A.pixels());
    A.setPhase(1); A.render(); const z1 = hash(A.pixels());
    A.setPhase(0.5); A.render(); const zHalf = hash(A.pixels());

    /* ⛔ AND "PHASE 0 EQUALS PHASE 1" IS TRIVIALLY TRUE OF ANYTHING THAT WRAPS — a build driven by
     * a SAWTOOTH passed it, because 0 % 1 and 1 % 1 are the same number even though the animation
     * snaps back hard a thousandth of a cycle earlier. The endpoints matching says the
     * parameterisation is periodic; it says nothing about whether the PICTURE is continuous.
     * ⚑ So step ACROSS the seam and compare that step to an identical one in mid-cycle. A closed
     *   loop makes the two steps the same size; a sawtooth makes the seam enormous. The mid-cycle
     *   step is the control, which is what stops this being another absolute threshold. */
    const meanAbs = (a, b) => {
      let sum = 0, n = 0;
      for (let i = 0; i < a.data.length; i += 4 * 3) { sum += Math.abs(a.data[i] - b.data[i]); n++; }
      return sum / n;
    };
    const frameAt = p2 => { A.setPhase(p2); A.render(); const px = A.pixels(); return { data: px.data }; };
    const seamA = frameAt(0.996), seamB = frameAt(0.004);
    const midA = frameAt(0.496), midB = frameAt(0.504);
    out.loop = { closes: z0 === z1, moves: z0 !== zHalf, z0, z1, zHalf,
      seam: meanAbs(seamA, seamB), mid: meanAbs(midA, midB) };

    /* ⛔ Z IS A SCALE, NOT AN OFFSET, so the displacement field of a depth move GROWS WITH RADIUS —
     * the exact mirror of registration, which must be uniform and radius-free. The same block
     * matcher answers both, and the two answers are opposite: that is what makes each of them
     * mean something rather than just being a number that came out. */
    const zFieldOn = (C) => {
      C.setView(0, 0);
      C.setPhase(0.02); C.render(); const a = C.pixels();
      C.setPhase(0.5); C.render(); const b = C.pixels();
      const W = a.w, H = a.h, S = 5, RNG = 16, out2 = [];
      const lum = px => {
        const T = new Float32Array(W * H), B = new Float32Array(W * H), L = new Float32Array(W * H);
        for (let i = 0, p2 = 0; i < px.data.length; i += 4, p2++)
          T[p2] = px.data[i] * 0.299 + px.data[i + 1] * 0.587 + px.data[i + 2] * 0.114;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s2 = 0;
          for (let k = -2; k <= 2; k++) s2 += T[y * W + Math.min(W - 1, Math.max(0, x + k))];
          B[y * W + x] = s2 / 5; }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s2 = 0;
          for (let k = -2; k <= 2; k++) s2 += B[Math.min(H - 1, Math.max(0, y + k)) * W + x];
          L[y * W + x] = s2 / 5; }
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
        if (energy > 900) out2.push({ dx: bdx, dy: bdy, x: bx / (S - 1) - 0.5, y: by / (S - 1) - 0.5 });
      }
      let cosSum = 0, n = 0, far = 0, near = 0, nf = 0, nn = 0;
      for (const b2 of out2) {
        const pr = Math.hypot(b2.x, b2.y), sr = Math.hypot(b2.dx, b2.dy);
        if (pr > 0.30) { far += sr; nf++; } else if (pr < 0.18) { near += sr; nn++; }
        if (pr < 0.15 || sr < 1.0) continue;
        cosSum += (b2.dx * b2.x + b2.dy * b2.y) / (pr * sr); n++;
      }
      return { n: out2.length, cos: n ? cosSum / n : 0,
        near: nn ? near / nn : 0, far: nf ? far / nf : 0 };
    };
    /* ⛔ THE Z-SIGNATURE BELONGS TO A MOTION, NOT TO THE CARD, and assuming otherwise broke this
     * assertion the moment there were eight of them: seed 3030 draws SLUR, which is a sideways
     * smear and correctly has no radial component at all. So the claim is measured on the motion
     * that makes it — the impression, the plates converging through the card's thickness — and
     * the card under test names it rather than hoping. */
    const Z = await mkM(3030, 360, 540, 'impression');
    if (Z) {
      Z.writeOn(1); Z.setSpin(false);
      out.zmove = (() => { const save = A; try { return zFieldOn(Z); } finally { void save; } })();
      Z.destroy();
    }
    A.setPhase(0);
    // and the elements must lead and lag, or the "stack" is one global zoom
    A.setPhase(0.3); A.render();
    out.stack = A.probe().elemZ.slice();
    out.motionKey = A.probe().motion;
    out.motionCount = (window.HeroCard.MOTIONS || []).length;
    A.setPhase(0); A.render(); A.setSpin(true);
  }

  /* ══ THE WRITE-ON — the sheet feeding through ═══════════════════════════════════════════ */
  {
    A.setSpin(false); A.setPhase(0); A.setView(0, 0);
    const inkRows = () => {
      const px = A.pixels(), W = px.w, H = px.h, rows = [];
      // readPixels is bottom-up, so walk from the card's TOP down
      for (let b = 0; b < 8; b++) {
        let dark = 0, n = 0;
        const y1 = Math.round(H * (0.90 - b * 0.09)), y0 = Math.round(H * (0.90 - b * 0.09 - 0.07));
        for (let y = y0; y < y1; y += 2) for (let x = Math.round(W * 0.2); x < Math.round(W * 0.8); x += 2) {
          const k = (y * W + x) * 4;
          if (px.data[k] * 0.299 + px.data[k + 1] * 0.587 + px.data[k + 2] * 0.114 < 150) dark++;
          n++;
        }
        rows.push(dark / n);
      }
      return rows;                                    // [0] is the top band, [7] the bottom
    };
    A.writeOn(0); A.render();
    const blank = inkRows();
    // half way through the impression: the top has ink, the bottom is still bare stock
    for (let i = 0; i < 45; i++) A.advance(16.6667);
    A.render();
    const half = inkRows();
    for (let i = 0; i < 240; i++) A.advance(16.6667);
    A.render();
    const ramped = hash(A.pixels());
    /* ⚠ Taken AFTER the ramp, not before it. Ordered the other way the comparison spans every
     * other state this harness has touched, and a mismatch tells you nothing about the write-on. */
    A.writeOn(1); A.render(); const done = hash(A.pixels());
    out.write = {
      blankInk: blank.reduce((a, b) => a + b, 0) / blank.length,
      halfTop: half.slice(0, 3).reduce((a, b) => a + b, 0) / 3,
      halfBottom: half.slice(5).reduce((a, b) => a + b, 0) / 3,
      finished: ramped === done,
    };
    A.writeOn(1); A.setSpin(true);
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

  /* ══ TAKE IT WITH YOU — the export ══════════════════════════════════════════════════════
   * ⚑ A GIF ENCODER EITHER PRODUCES A VALID FILE OR IT DOES NOT, and "it looked fine in the
   * browser" is not the test: every decoder in the world is more forgiving than the spec, so a
   * stream with a desynchronised colour table can display in Chrome and be rubbish everywhere the
   * collector actually posts it. This walks the stream the way the format says to. */
  {
    const g = await window.CardExport.gif(A, { frames: 8, name: 't', maxW: 160 });
    const buf = new Uint8Array(await g.blob.arrayBuffer());
    const str = (a, n) => String.fromCharCode.apply(null, buf.slice(a, a + n));
    // walk blocks properly — counting 0x21 0xF9 byte pairs also hits LZW payload
    let n = 0, i = 13 + 3 * (1 << ((buf[10] & 7) + 1)), guard = 0;
    while (i < buf.length && guard++ < 1e6) {
      const c = buf[i];
      if (c === 0x3B) break;
      if (c === 0x21) { i += 2; while (buf[i]) i += buf[i] + 1; i++; continue; }
      if (c === 0x2C) {
        n++; i += 10;
        if (buf[i - 1] & 0x80) i += 3 * (1 << ((buf[i - 1] & 7) + 1));
        i++; while (buf[i]) i += buf[i] + 1; i++; continue;
      }
      break;
    }
    out.gif = {
      header: str(0, 6), frames: n, bytes: buf.length,
      trailer: buf[buf.length - 1] === 0x3B,
      loops: String.fromCharCode.apply(null, buf.slice(0, 900)).indexOf('NETSCAPE2.0') > 0,
      w: buf[6] | (buf[7] << 8), h: buf[8] | (buf[9] << 8),
      // the card must be put back the way it was found
      spinAfter: A.probe().spin, phaseAfter: A.probe().phase,
    };
    const png = await window.CardExport.still(A, { name: 't' });
    out.png = { bytes: png.blob.size, type: png.blob.type };
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
  // artist, 2026-08-04: "remix any of the 194+ cards we have available" — both manifests
  t('the pigment pool is the WHOLE deck', R.pool >= 194, `${R.pool} sources`);

  // 1
  t('1 · it is foil — hue walks with the angle', R.foil.travel >= 200,
    `${R.foil.travel.toFixed(0)} deg over ${R.foil.samples + 1} yaws (bar 200)`);

  /* ── HOLDING · the lens tier reaches the artwork ─────────────────────────────────────────
   * Before this, tierOfHolder drove nothing a collector could see. */
  {
    const H = R.hold;
    t('1h · holding is OFF at tier 0 and full at tier 4', H.ashHold === 0 && H.infernoHold === 1,
      `hold ${H.ashHold} -> ${H.infernoHold}`);
    t('1h · the ruling at Ash is the value every card prints at today', Math.abs(H.ashGrating - 1.55) < 1e-9,
      `${H.ashGrating}`);
    /* ⛔ THE ONE THAT BITES. A finer grating must MEASURABLY split light harder. */
    t('1h · Inferno foil travels further than Ash — holding is visible',
      H.infernoTravel > H.ashTravel * 1.10,
      `${H.ashTravel.toFixed(0)} deg -> ${H.infernoTravel.toFixed(0)} deg (+${((H.infernoTravel / H.ashTravel - 1) * 100).toFixed(0)}%)`);
    /* ⛔ AND THE ONE THAT KEEPS IT HONEST: coverage is rarity's, and holding may not touch it.
     *   Without this, "holding changed the card" would pass a build that let money buy rarity. */
    /* Reads frameFoilSent — what the SHADER got — and at a rarity whose coverage is non-zero,
     * so a build that let holding add coverage fails here instead of passing on 0 === 0. */
    t('1h · …while foil COVERAGE is untouched — holding cannot buy rarity',
      H.ashCover === H.infernoCover && H.ashCover > 0,
      /* ⚠ PRINT BOTH. The first version said "cover 0.3 both ways" from H.ashCover alone — which
       *   it still printed while FAILING, i.e. the failure message asserted the opposite of the
       *   failure. A detail line that can lie is worse than no detail line. */
      `Ash ${H.ashCover} · Inferno ${H.infernoCover}`);
    t('1h · and tier 0 returns the original card exactly', H.returnsHome === true);
  }

  // 2
  t('2 · still at rest — flex is EXACTLY zero after 10 s',
    R.still.maxFlex === 0 && R.still.maxVel === 0,
    `flex ${R.still.maxFlex} · vel ${R.still.maxVel}`);
  t('2 · with the press stopped, the FRAME is byte-identical over 10 s', R.still.frameSame,
    `${R.still.before} vs ${R.still.after} — nothing drifts`);
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
  /* ⛔ THE SPREAD IS NOT THE TEST — see the note in shiftField. Four plates at four registrations
   * are supposed to disagree, and they disagree by the predicted amount. What must be flat is the
   * dependence on POSITION, in every direction, because that is what separates a sheet that went
   * through the press askew from a lens artefact. */
  /* ⛔ NOT A SPREAD BAR, AND NOT A SLOPE. Both were tried and both are confounded: a four-plate
   * print is SUPPOSED to disagree block to block (measured sd 3.07 against a predicted 3.55 from
   * the four offsets themselves), and the slope of magnitude against position picks up which
   * plate happens to dominate each region, which follows the COMPOSITION rather than the
   * geometry — the y slope read -3.67 on a build whose offsets are, structurally, four constants
   * with nowhere for a position to enter. The exact invariant is below. */
  t('4 · the offset does not point away from the centre', Math.abs(R.print.radialCos) < 0.35,
    `mean cos(shift, position) = ${R.print.radialCos.toFixed(3)} over ${R.print.cosN} blocks ` +
    `(0 = a press, 1 = a lens)`);
  t('4 · …and every block lands on one of the four plate offsets', R.print.onPlate < 3.0,
    `median miss ${R.print.onPlate.toFixed(2)} px, 85th ${R.print.onPlateWorst.toFixed(2)} px`);
  t('4 · …and the spread across blocks is the PLATES, not the measurement',
    R.print.sd < 0.75 * R.print.mean,
    `sd ${R.print.sd.toFixed(2)} of ${R.print.mean.toFixed(2)} px — four plates, four registrations`);
  /* ⛔ THE CONTROL. If the radial build passes the same two assertions then they are not
   * measuring anything, and a green line would mean nothing at all. */
  t('4 · the measurement REJECTS a radial build', Math.abs(R.printRadial.radialCos) >= 0.35,
    `radial cos ${R.printRadial.radialCos.toFixed(3)} against the real build's ` +
    `${R.print.radialCos.toFixed(3)}`);

  /* ── THE MATERIAL ────────────────────────────────────────────────────────────────────── */
  /* ⛔ A METAL TINTS ITS OWN HIGHLIGHT AND A DIELECTRIC DOES NOT. That is the whole difference
   * between the two, it is one line in the shader (F0 comes from the albedo rather than from
   * 0.04), and it is the only test that can tell a metallic foil from a coloured gloss. */
  t('m · the foil edge is METAL — no diffuse at all, so with the room off and the key away it is nothing',
    R.light.dieNoEnvMin < 0.03,
    `die luminance falls to ${R.light.dieNoEnvMin.toFixed(4)} (peak ${R.light.dieNoEnvMax.toFixed(3)}); ` +
    `with the room on it never goes below ${R.light.dieMin.toFixed(3)}, because a metal reflects the room`);
  t('m · …and its highlight carries the metal\u2019s own colour', R.metal.die.hiSat > R.metal.trim.hiSat * 2.5,
    `brightest decile: die ${R.metal.die.hiSat.toFixed(3)} vs bare stock ${R.metal.trim.hiSat.toFixed(3)}`);
  t('m · the ARTWORK never sees the environment', R.env.artSame,
    `${R.env.art} with the room on and off`);
  t('m · …and the foil does', R.env.dieDiffers, `${R.env.die} vs ${R.env.dieOff}`);
  t('m · the bare stock answers a moving LIGHT', R.light.trimSd > 0.10,
    `its local contrast swings ${(R.light.trimSd * 100).toFixed(1)}% over 7 key azimuths ` +
    `(the mean luminance moves only ${(R.light.trimLum * 100).toFixed(1)}%, which is correct — ` +
    `a flat card holds N·L constant across an azimuth sweep)`);
  /* ⚠ THE RATIO, NOT ITS SIGN — I had this backwards first time. Most fibres are laid along x,
   * and a stroke running along x has its height changing ACROSS y, so it is the Y slope that is
   * the larger one. What the claim actually is, is that the two differ at all: a hash has no
   * grain and would come back at 1.00. */
  t('m · …and the tooth is FIBRES, with a grain direction',
    Math.max(R.fibre.ax, R.fibre.ay) > Math.min(R.fibre.ax, R.fibre.ay) * 1.25,
    `mean |n| x ${R.fibre.ax.toFixed(1)} vs y ${R.fibre.ay.toFixed(1)} = ` +
    `${(Math.max(R.fibre.ax, R.fibre.ay) / Math.min(R.fibre.ax, R.fibre.ay)).toFixed(2)}x (a hash gives 1.00)`);
  // ⛔ and the alpha of every generated map stays 255 — see buildComp's premultiply note.
  t('m · the stock map keeps its alpha at 255', R.fibre.alphaBad === 0,
    `${R.fibre.alphaBad} texels would have been wiped`);
  /* ⚠ The GfxPost lesson, carried over rather than re-learned: this is an LDR target and a metal
   * specular runs well past 1.0, where the GPU clips it to flat white and the foil loses its
   * colour exactly where it is brightest. The knee has to be doing its job. */
  t('m · the highlights do not clip to flat white', R.white < 0.004,
    `${(R.white * 100).toFixed(3)}% of the card is pure white`);

  /* ── THE WRITE-ON ────────────────────────────────────────────────────────────────────── */
  t('w · before the impression the sheet is BLANK STOCK, not a faded picture',
    R.write.blankInk < 0.04, `${(R.write.blankInk * 100).toFixed(1)}% of it carries ink`);
  /* ⛔ AND IT ARRIVES DOWN THE SHEET, which is the difference between a press and a fade-in. Half
   * way through, the top is printed and the bottom has not been touched. A crossfade would show
   * the two ends at the same density and pass any "is it animating" check. */
  t('w · …and it lands top-first, in the order the cylinder touches it',
    R.write.halfTop > R.write.halfBottom * 2.0,
    `top ${(R.write.halfTop * 100).toFixed(0)}% vs bottom ${(R.write.halfBottom * 100).toFixed(0)}%`);
  t('w · …and it finishes as the same card', R.write.finished);

  /* ── THE PRESS ───────────────────────────────────────────────────────────────────────── */
  t('p · the loop CLOSES — phase 0 and phase 1 are the same frame to the byte', R.loop.closes,
    `${R.loop.z0} vs ${R.loop.z1}`);
  t('p · …and it is somewhere else in between', R.loop.moves, `half-cycle ${R.loop.zHalf}`);
  t('p · …and the picture is CONTINUOUS across the seam, not just equal at the ends',
    R.loop.seam < R.loop.mid * 1.6,
    `a 0.008-cycle step costs ${R.loop.seam.toFixed(2)} at the wrap vs ${R.loop.mid.toFixed(2)} ` +
    `mid-cycle (a sawtooth blows this up)`);
  /* ⛔ THIS ASSERTION WAS INVERTED ON PURPOSE, 2026-08-05, AND THE OLD ONE IS WHY THE CONTROL WAS
   * BROKEN. It used to demand that the stack's displacement be RADIAL and GROW WITH RADIUS
   * (|cos| > 0.5, edge > 1.6x centre) — the signature of a magnification about the frame centre,
   * which is precisely what a zoom is. It passed for months, and the artist's report was *"these
   * are not separated layers it is just zooming in."* The test was faithfully describing the bug.
   * ⚑ A STACK THAT SEPARATES MUST MOVE ITS CENTRE. A zoom about the middle cannot: at zero
   *   eccentricity a magnification displaces nothing, so a card whose centre is still is a card
   *   that is only being scaled. Measured after the fix: centre 22.6 px against edge 17.0, i.e.
   *   the uniform slide now dominates the magnification hint rather than the other way round.
   * ⚠ AND THE DISTINCTION FROM REGISTRATION DID NOT GO WITH IT — it moved to the assertion below,
   *   which requires the four elements to sit at four DIFFERENT depths. That is the thing
   *   registration can never do: registration offsets ink plates and is identical for every
   *   element, while the stack offsets elements and is identical for every ink. Losing the radius
   *   test costs nothing because the per-element test carries the claim. */
  t('p · the stack SEPARATES — the centre travels, so it is not a zoom about the centre',
    R.zmove.near > 3 && Math.abs(R.zmove.cos) < 0.85,
    `centre ${R.zmove.near.toFixed(1)} px · edge ${R.zmove.far.toFixed(1)} px · ` +
    `cos ${R.zmove.cos.toFixed(2)} (a pure zoom is centre ~0, |cos| ~1)`);
  /* ⚑ "Did it move" is the weak question again — a global zoom passes it and is not depth. What
   * bites is that the four elements are at DIFFERENT depths at the same instant. */
  t('p · this card draws a named motion of its own', typeof R.motionKey === 'string' &&
    R.motionKey.length > 2, R.motionKey + ' (of ' + R.motionCount + ')');
  t('p · the stack travels through itself, not as one zoom',
    new Set(R.stack.map(v => v.toFixed(4))).size === 4,
    'z = ' + R.stack.map(v => v.toFixed(3)).join(' · '));

  // 5
  t('5 · same seed, same drive -> byte-identical frame', R.det.same, R.det.a);
  t('5 · and a different seed is a different card', R.det.differs, `${R.det.a} vs ${R.det.c}`);

  // 6 / 7
  t('the name comes from the committed outlines', R.typeDrives === true);
  t('a missing pigment fails open to null', R.failsOpen === true);

  /* ── THE EXPORT ──────────────────────────────────────────────────────────────────────── */
  t('x · the GIF is a well-formed GIF89a', R.gif.header === 'GIF89a' && R.gif.trailer,
    `${R.gif.header} · ${(R.gif.bytes / 1024).toFixed(0)} KB · ${R.gif.w}x${R.gif.h}`);
  /* ⛔ EVERY FRAME, AND NOT ONE MORE. Frames are sampled at i/N and never at 1, because phase 1 IS
   * phase 0 — including it duplicates a frame and the loop hitches once a cycle, in a file the
   * collector will watch a hundred times. Walking the block stream is the only way to count them:
   * scanning for the 0x21 0xF9 byte pair also hits LZW payload and reported 67 for a 24-frame
   * file, which is a measurement that looks like a bug in the encoder and is a bug in the ruler. */
  t('x · …with exactly the frames asked for, and no duplicate at the seam', R.gif.frames === 8,
    `${R.gif.frames} frames`);
  t('x · …and it loops forever', R.gif.loops, 'NETSCAPE2.0 present');
  /* ⚠ An export that leaves the card stopped at the last frame looks like the export broke it. */
  t('x · the card is put back the way it was found',
    R.gif.spinAfter === 1 && R.gif.phaseAfter < 0.001,
    `spin ${R.gif.spinAfter} · phase ${R.gif.phaseAfter.toFixed(3)}`);
  t('x · and a still comes out as a PNG', R.png.type === 'image/png' && R.png.bytes > 2000,
    `${(R.png.bytes / 1024).toFixed(0)} KB`);
}
t('no page errors', errs.length === 0, errs.join(' | ') || 'clean');

await browser.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

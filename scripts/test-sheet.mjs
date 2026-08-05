/* THE UNCUT SHEET — acceptance.  `npm run test:sheet`   (studio3d.html + js/sheet3d.js)
 *
 * docs/BRAND-3030.md §7 names five measurements and this file is them. They are chosen the
 * same way the wordmark rig's were: so that a LAZY RE-IMPLEMENTATION FAILS.
 *
 *   1 FOIL     hue must TRAVEL across view angles, and must collapse when the grating is off.
 *              ⚑ The control is the whole assertion. "It looks like foil" is not a result; a
 *                rainbow painted on a face passes any test that only asks whether it is
 *                colourful. The sabotage build has to fail.
 *   2 INK      the print must MULTIPLY the stock. Halve the paper and the printed area halves.
 *              Additive ink cannot do that, and additive ink is what a black stock forces.
 *   3 RIG      §4 — what moves and why. "Did it move" is the weak question; a global transform
 *                passes it. What bites: different cards by different amounts · a release that
 *                OVERSHOOTS (kills a lerp) · card n+2 later than n+1 (kills 8 loose springs) ·
 *                and the coupling DYING with the web it went through.
 *   4 STILL    at rest, max vertex displacement is EXACTLY 0. No idle loop, no breathing.
 *   5 OPEN     with WebGL2 refused the page is still a printed sheet with eight live links.
 *   6 PHONE    320px: the imposition changes, nothing overflows, every tap clears 44px.
 *
 * ⚠ SwiftShader in this container, so this asserts SHAPE, RATIO and TIMING. Absolute colour off
 *   a screenshot is meaningless here (CLAUDE.md: the screenshot path rotates hue on canvas
 *   content) — every colour number below comes from readPixels on the live buffer, and every
 *   one is read as a RATIO or a DELTA against a control taken through the same path.
 * ⚠ The clock is driven from inside the page (`advance`/`render`), never `waitForTimeout`. This
 *   container's rAF stalls between input events, and measuring that instead of the springs
 *   produced a false FAIL on the wordmark rig.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
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
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(2, 78 - s.length)));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.gif': 'image/gif', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
  '.jpg': 'image/jpeg', '.avif': 'image/avif', '.pdf': 'application/pdf' };

/* ⚑ listen(0): several harnesses here bind a server and a fixed port makes the second one die
 *   with EADDRINUSE, which reads as "the test hangs" rather than "pick another port". */
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

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function open(query, viewport, killGL) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  if (killGL) {
    await page.addInitScript(() => {
      const g = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (k) {
        if (String(k).indexOf('webgl') === 0) return null;
        return g.apply(this, arguments);
      };
    });
  }
  await page.goto(`http://localhost:${PORT}/studio3d.html${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(killGL ? 1500 : 6500);
  return { ctx, page, errs };
}

/* ══ 1 · FOIL — the hue must WALK with the view ═════════════════════════════════════════════ */
head('1 · foil is defined by MOVEMENT, and the grating-off control must fail');
{
  const { ctx, page, errs } = await open('?manual=1&readback=1&nonav=1');
  const up = await page.evaluate(() => !!window.__sheet);
  t('the sheet mounts under WebGL2', up, errs.slice(0, 2).join(' | ') || '');

  if (up) {
    /* ⛔ THE FIRST VERSION OF THIS TEST MEASURED THE WRONG STATISTIC AND PUNISHED THE FIX.
     *   It took the MEAN hue over the whole slug at each angle. A finer grating makes the hue
     *   vary strongly ACROSS the letters as well as with the view, so refining the ruling from
     *   26 to 62 — unambiguously more diffractive — drove the measured number DOWN, 99° to 63°,
     *   because the circular mean averaged the very thing it was looking for into a constant.
     * ⚑ The right statistic is PER-POINT travel: follow one place on the foil through the
     *   sweep and ask how far ITS hue walked, then take the median over many places. That is
     *   what "261° median travel" means on the shipped wordmark.
     * ⚠ Each sample is a POINT ON THE FOIL BAND projected through the live camera, not a fixed
     *   fraction of its screen bounding box — the sheet moves under the camera during a sweep,
     *   so a fraction of a moving box is a different piece of foil at every angle. That
     *   mismatch reported "0 of 140 points trackable" and read as a dead material.
     * ⚠ A fine grating also varies spatially, so any residual sampling drift shows up as hue
     *   change. The CONTROL is what makes that harmless: it carries the identical drift and
     *   the identical embossed ruling, and only the half-angle term is removed. */
    const sweep = await page.evaluate(() => {
      const GX = 150, GY = 11, NA = 9;
      const c = window.__sheet;
      c.flicker(false); c.setParallax(false);
      const runs = {};
      for (const [name, grating] of [['foil', 1.0], ['sabotage', 0.0]]) {
        c.set('uIso', 1.0); c.set('uGrating', grating);
        const series = [];                       // [angle][point] = hue in degrees, or null
        for (let i = 0; i < NA; i++) {
          c.setView(-0.42 + (0.84 * i) / (NA - 1), 0.06);
          series.push(c.slugSamples(GX, GY).map(s => {
            if (!s) return null;
            const R = s[0] / 255, G = s[1] / 255, B = s[2] / 255;
            const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
            if (mx < 0.06 || mx - mn < 0.04) return null;
            let h;
            if (mx === R) h = ((G - B) / (mx - mn) + 6) % 6;
            else if (mx === G) h = (B - R) / (mx - mn) + 2;
            else h = (R - G) / (mx - mn) + 4;
            return h * 60;
          }));
        }
        runs[name] = series;
      }
      c.set('uIso', 0.0); c.set('uGrating', 1.0);
      return runs;
    });

    const perPoint = series => {
      const nPts = series[0].length, out = [];
      for (let p = 0; p < nPts; p++) {
        let total = 0, steps = 0;
        for (let a = 1; a < series.length; a++) {
          const x = series[a][p], y = series[a - 1][p];
          if (x == null || y == null) continue;
          let d = Math.abs(x - y); if (d > 180) d = 360 - d;
          total += d; steps++;
        }
        if (steps >= 6) out.push(total);
      }
      out.sort((a, b) => a - b);
      return { n: out.length, median: out.length ? out[out.length >> 1] : 0,
               max: out.length ? out[out.length - 1] : 0 };
    };
    const A = perPoint(sweep.foil), B = perPoint(sweep.sabotage);
    t('the foil is chromatic at enough places to measure', A.n >= 30,
      `${A.n} tracked points of ${sweep.foil[0].length}`);
    t('hue TRAVELS as the view moves (a painted gradient cannot)', A.median >= 200,
      `median ${A.median.toFixed(0)}° · max ${A.max.toFixed(0)}° over 8 steps of a 48° sweep`);
    /* ⛔ THIS is what makes the line above mean anything. Delete only the half-angle term and
       the same geometry, palette, lighting and roughness must stop walking. Without a control,
       "it is colourful" passes for "it is foil" — which is the sticker bug the whole rule
       exists to catch. */
    t('…and the grating-off control collapses', B.median < A.median * 0.45,
      `sabotage median ${B.median.toFixed(0)}° vs foil ${A.median.toFixed(0)}°`);
  }
  await ctx.close();
}

/* ══ 2 · INK MULTIPLIES THE STOCK ══════════════════════════════════════════════════════════ */
head('2 · ink multiplies the paper and never adds');
{
  const { ctx, page } = await open('?manual=1&readback=1&nonav=1');
  const r = await page.evaluate(() => {
    const c = window.__sheet;
    if (!c) return null;
    c.flicker(false); c.setParallax(false); c.setView(0, 0.06);
    c.set('uIso', 2.0);                                  // print only, no foil in the average
    const rect = c.cardRect(1);
    const lum = () => {
      c.render();
      const px = c.readback(rect.x, rect.y, rect.w, rect.h);
      let s = 0, n = 0;
      for (let k = 0; k < px.length; k += 4) {
        /* decode sRGB — the shader encodes on the way out, so a raw byte ratio is not a
           luminance ratio and would quietly report 0.73 for a perfect halving. */
        const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        s += 0.2126 * f(px[k]) + 0.7152 * f(px[k + 1]) + 0.0722 * f(px[k + 2]); n++;
      }
      return s / Math.max(1, n);
    };
    c.set('uPaperGain', 1.0); const full = lum();
    c.set('uPaperGain', 0.5); const half = lum();
    c.set('uPaperGain', 0.0); const none = lum();
    c.set('uPaperGain', 1.0); c.set('uIso', 0.0);
    return { full, half, none };
  });
  t('a card region reads back with real signal', r && r.full > 0.004, r ? r.full.toFixed(5) : 'no ctrl');
  if (r) {
    const ratio = r.half / r.full;
    t('halving the stock halves the print (multiply, not add)', ratio > 0.44 && ratio < 0.58,
      `ratio ${ratio.toFixed(3)} (additive ink cannot reach this)`);
    t('…and with no stock there is nothing to print on', r.none < r.full * 0.06,
      `${(r.none / r.full * 100).toFixed(2)}% of full — the residue is the paper sheen, which is not albedo`);
  }
  await ctx.close();
}

/* ══ 3 · THE RIG ═══════════════════════════════════════════════════════════════════════════ */
head('3 · the sheet is rigged: coupling, overshoot, and a tear that does not reverse');
{
  const { ctx, page } = await open('?manual=1&nonav=1');
  const r = await page.evaluate(() => {
    const c = window.__sheet;
    if (!c) return null;
    c.flicker(false); c.setParallax(false);
    const out = {};

    /* (a) one pull, and the sheet must not move as one object */
    c.drag(1, 0.020, 12);
    const p = c.probe();
    out.q = p.q.slice();
    out.spread = Math.max.apply(null, p.q.map(Math.abs)) - Math.min.apply(null, p.q.map(Math.abs));

    /* (b) COUPLING DELAY. Neighbour 2 is adjacent to the pulled card 1; card 3 is adjacent to
       2 and NOT to 1. Eight independent springs cannot produce an ordering here. */
    c.release();
    for (let i = 0; i < 8; i++) c.advance(16.7);
    const t2 = [], t3 = [];
    // restart clean
    return (function () {
      const res = { spread: out.spread, q: out.q };
      return res;
    })();
  });
  t('a pull moves different cards by different amounts', r && r.spread > 1e-4,
    r ? `spread ${r.spread.toFixed(4)} across 8 cards` : 'no ctrl');

  /* the ordering + overshoot run on a fresh page so the springs start from a known zero */
  await ctx.close();

  const s2 = await open('?manual=1&nonav=1');
  const ord = await s2.page.evaluate(() => {
    const c = window.__sheet;
    if (!c) return null;
    c.flicker(false); c.setParallax(false);
    /* pull card 0 (top-left of a 4-up lay). Its neighbour is 1; 1's neighbour is 2. */
    const first = { 1: null, 2: null, 3: null };
    c.drag(0, 0.030, 4);
    c.release();
    for (let step = 0; step < 220; step++) {
      c.advance(16.7);
      const p = c.probe();
      for (const k of [1, 2, 3]) {
        if (first[k] == null && Math.abs(p.q[k]) > 0.002) first[k] = step * 16.7;
      }
    }
    return first;
  });
  const okOrder = ord && ord[1] != null && ord[2] != null &&
    ord[1] < ord[2] && (ord[3] == null || ord[2] < ord[3]);
  t('a shove reaches card n+2 LATER than n+1 (kills 8 independent springs)', !!okOrder,
    ord ? `n+1 ${ord[1]}ms · n+2 ${ord[2]}ms · n+3 ${ord[3] === null ? 'never' : ord[3] + 'ms'}` : 'no ctrl');

  const ring = await s2.page.evaluate(() => {
    const c = window.__sheet;
    /* let everything settle, then pull one card and release: the spring must cross zero. */
    for (let i = 0; i < 700; i++) c.advance(16.7);
    c.drag(5, 0.030, 5);
    const peak = c.probe().q[5];
    c.release();
    let minAfter = peak, crossed = false;
    for (let i = 0; i < 120; i++) {
      c.advance(16.7);
      const v = c.probe().q[5];
      if (Math.sign(v) !== Math.sign(peak) && Math.abs(v) > 1e-4) crossed = true;
      if (v < minAfter) minAfter = v;
    }
    return { peak, minAfter, crossed };
  });
  t('a release OVERSHOOTS through zero (kills a lerp)', ring && ring.crossed,
    ring ? `peak ${ring.peak.toFixed(4)} → ${ring.minAfter.toFixed(4)}` : 'no ctrl');

  const tearing = await s2.page.evaluate(() => {
    const c = window.__sheet;
    for (let i = 0; i < 900; i++) c.advance(16.7);
    const trace = [];
    c.drag(6, 0.055, 60);                      // hold and keep pulling
    trace.push(c.probe().tear[6]);
    c.release();
    for (let i = 0; i < 60; i++) { c.advance(16.7); trace.push(c.probe().tear[6]); }
    const p = c.probe();
    let monotone = true;
    for (let i = 1; i < trace.length; i++) if (trace[i] < trace[i - 1] - 1e-9) monotone = false;
    return { tear: p.tear[6], gone: p.gone[6], fly: p.fly[6], monotone, first: trace[0] };
  });
  t('pulling hard runs the perforation to the end', tearing && tearing.tear >= 1,
    tearing ? `tear ${tearing.tear.toFixed(3)}` : 'no ctrl');
  t('…and the card comes away, which is what navigates', tearing && tearing.gone === 1 && tearing.fly > 0,
    tearing ? `gone=${tearing.gone} fly=${tearing.fly.toFixed(2)}` : '');
  t('a tear NEVER reverses — paper does not un-tear', tearing && tearing.monotone);

  /* ⛔ the coupling has to DIE WITH THE WEB. Card 6 is now free; shoving it must no longer
     reach card 7, because the paper that was carrying that force is gone. */
  const dead = await s2.page.evaluate(() => {
    const c = window.__sheet;
    for (let i = 0; i < 400; i++) c.advance(16.7);
    const before = c.probe().q[7];
    c.drag(6, 0.060, 10); c.release();
    let maxN = 0;
    for (let i = 0; i < 90; i++) { c.advance(16.7); maxN = Math.max(maxN, Math.abs(c.probe().q[7] - before)); }
    return maxN;
  });
  t('once the perforation has gone, so has the force it carried', dead !== null && dead < 2e-3,
    `neighbour moved ${Number(dead).toExponential(2)} after the tear`);
  await s2.ctx.close();
}

/* ══ 4 · NOTHING MOVES ON ITS OWN ══════════════════════════════════════════════════════════ */
head('4 · at rest the sheet is a still object (§4 — no idle loop, no breathing)');
{
  const { ctx, page } = await open('?manual=1&nonav=1');
  const r = await page.evaluate(() => {
    const c = window.__sheet;
    if (!c) return null;
    c.setParallax(false);
    let worst = 0;
    for (let i = 0; i < 600; i++) { c.advance(16.7); worst = Math.max(worst, c.probe().maxDisp); }
    return { worst, t: c.probe().simT };
  });
  /* ⚠ EXACTLY zero, not "small". A breath, a drift or a wall-clock term in the displacement
     would show here as a non-zero float, and the wordmark rig learned that a frame-hash test
     can stay green while a shader breathes — so this asserts GEOMETRY. The two torches DO
     flicker, deliberately and only in the light: a flame is a combustion, and the landing
     page's two torches already do it. That is why this reads displacement, not pixels. */
  t('ten seconds of clock move no vertex at all', r && r.worst === 0,
    r ? `max displacement ${r.worst} over ${r.t.toFixed(1)}s of sim` : 'no ctrl');
  await ctx.close();
}

/* ══ 5 · FAIL OPEN ═════════════════════════════════════════════════════════════════════════ */
head('5 · with WebGL2 refused the page is still a printed sheet with eight live links');
{
  const { ctx, page } = await open('', { width: 1280, height: 900 }, true);
  const r = await page.evaluate(() => ({
    ctrl: !!window.__sheet,
    flatHidden: document.getElementById('flat').hidden,
    canvases: document.querySelectorAll('#bed canvas').length,
    sheetLinks: [...document.querySelectorAll('#flat a')].map(a => a.getAttribute('href')),
    docketLinks: [...document.querySelectorAll('.docket a')].map(a => a.getAttribute('href')),
    visible: getComputedStyle(document.querySelector('.flat-sheet')).display !== 'none',
    name: /ripmaster3030studios/.test(document.body.textContent)
  }));
  t('the renderer declines rather than throwing', r.ctrl === false);
  t('no canvas is inserted at all', r.canvases === 0);
  t('the CSS press sheet stays on screen', r.flatHidden === false && r.visible);
  t('all eight cards are real links in the served HTML', r.sheetLinks.length === 8,
    r.sheetLinks.join(' '));
  t('…and the job docket repeats them for a keyboard', r.docketLinks.length === 8);
  t('the studio name is TEXT in the DOM, not only pixels on a canvas', r.name);
  await ctx.close();
}

/* ══ 6 · THE PHONE ═════════════════════════════════════════════════════════════════════════ */
head('6 · 320px: the imposition changes with the press, and nothing overflows');
{
  const { ctx, page } = await open('?nonav=1', { width: 320, height: 568 });
  const r = await page.evaluate(() => {
    const smalls = [], taps = [];
    for (const el of document.querySelectorAll('a, button')) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.height > 0 && b.height < 44) taps.push((el.textContent || '').trim().slice(0, 18));
    }
    for (const el of document.querySelectorAll('body *')) {
      if (!el.childElementCount && (el.textContent || '').trim().length > 1) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs && fs < 12) smalls.push((el.textContent || '').trim().slice(0, 18) + '@' + fs);
      }
    }
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      taps, smalls,
      probe: window.__sheet ? window.__sheet.probe() : null
    };
  });
  t('no horizontal overflow at 320px', r.overflow <= 0, `${r.overflow}px`);
  t('every tap target clears 44px', r.taps.length === 0, r.taps.slice(0, 4).join(' · '));
  t('nothing is set below the 12px label floor', r.smalls.length === 0, r.smalls.slice(0, 4).join(' · '));
  t('the sheet is imposed 2-up on a portrait press', r.probe && r.probe.cols === 2 && r.probe.rows === 4,
    r.probe ? `${r.probe.cols} × ${r.probe.rows}` : 'no ctrl (webgl unavailable)');
  await ctx.close();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
await browser.close();
srv.close();
process.exit(fail ? 1 : 0);

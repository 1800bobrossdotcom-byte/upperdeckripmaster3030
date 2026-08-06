/* ripmaster3030studios — THE PRESS MUST NEVER TAKE A CARD AWAY.   node scripts/test-press.mjs
 *
 * Artist, 2026-08-05: *"the cards are not displaying in the viewer, the binder, the binder
 * viewer, or into the deck."* They were not. `js/card-press.js` replaced a WORKING card with the
 * press's output before knowing the press had produced anything — so on a machine where the press
 * built correctly and drew nothing, every card surface on the site went blank at once.
 *
 * ⛔ THAT IS A FAIL-OPEN VIOLATION, AND FAIL-OPEN IS THIS PROJECT'S ONE STANDING PRINCIPLE.
 *   Everything else here is allowed to be absent — no WebGL2, no engine, a blocked script, a
 *   404 on a manifest — and the page is still the page it was. The press was the first thing in
 *   the repo that could make the page WORSE by failing.
 *
 * ⚑ THE ONLY TEST THAT MEANS ANYTHING IS A SABOTAGE. "Does the press work" is the easy question
 *   and it was always yes. The question that matters is what happens when it DOESN'T, and you
 *   cannot ask that of a healthy press — you have to break one. `deadPress()` below builds a
 *   perfectly good controller whose `render()` clears to nothing, which is precisely the failure
 *   the artist hit and precisely what no amount of reading the code revealed.
 *
 * ⚠ AND IT ASSERTS BOTH DIRECTIONS, because "no card is ever blanked" is trivially satisfied by
 *   never pressing anything at all. A guard that is too strict looks exactly like a guard that
 *   works. So a HEALTHY press must still visibly press.
 *
 * ⚠ Judge STRUCTURE here, never hue — this container's screenshot path rotates hue on canvas
 *   content (CLAUDE.md). "Is there a picture" is a tonal-range question and survives that.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = '/home/user/upperdeckripmaster3030';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.avif': 'image/avif' };
const PORT = 8951;

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ok   ' + msg + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + msg + (detail ? '  — ' + detail : '')); }
};

const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const b = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => srv.listen(PORT, r));

const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* ⛔ THE SABOTAGE. A press that BUILDS correctly — right plates, right seed, no error anywhere —
 * and renders nothing. This is not a hypothetical: it is what the artist's machine did, and every
 * signal available to the page said the press was healthy. */
const deadPress = () => {
  const t = setInterval(() => {
    if (!window.HeroCard) return;
    clearInterval(t);
    const real = window.HeroCard.build;
    window.HeroCard.build = (o) => real(o).then(c => {
      if (!c) return c;
      const gl = o.canvas.getContext('webgl2');
      c.render = () => { try { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } catch (e) {} };
      c.advance = () => {};
      return c;
    });
  }, 5);
};

/* Does this element actually show a PICTURE? Not "is it opaque" — the press's stock is near-white,
 * so a blank card is fully opaque and completely empty. A picture has tonal RANGE. */
const INK = (sel) => {
  const range = (el) => {
    const cv = document.createElement('canvas'); cv.width = 48; cv.height = 72;
    const g = cv.getContext('2d');
    try { g.drawImage(el, 0, 0, 48, 72); } catch (e) { return -1; }
    const d = g.getImageData(0, 0, 48, 72).data;
    let lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 8) continue;
      const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (l < lo) lo = l;
      if (l > hi) hi = l;
    }
    return hi - lo;
  };
  const els = [...document.querySelectorAll(sel)].slice(0, 8);
  return {
    n: els.length,
    alive: els.filter(e => range(e) > 24).length,
    pressed: els.filter(e => e.hasAttribute('data-pressed')).length,
  };
};

async function visit(url, { sabotage } = {}) {
  const ctx = await br.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  if (sabotage) await ctx.addInitScript(deadPress);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: 'load', timeout: 60000 });
  return { ctx, page, errs };
}

console.log('\n── 1 · A DEAD PRESS MUST NOT COST A SINGLE CARD ───────────────────────────────');
for (const [url, sel, label] of [['/cards/', '.tile-art img', 'the deck browser'],
                                 ['/cards/binder.html', '.pk img', "the folder's pockets"]]) {
  const { ctx, page, errs } = await visit(url, { sabotage: true });
  await page.waitForTimeout(22000);
  const s = await page.evaluate(INK, sel);
  ok(s.n > 0 && s.alive === s.n,
    `${label} keeps every card when the press draws nothing`,
    `${s.alive}/${s.n} still showing a picture`);
  ok(errs.length === 0, `…and nothing threw doing it`, errs.slice(0, 2).join(' | ') || 'clean');
  await ctx.close();
}

console.log('\n── 2 · …AND A HEALTHY PRESS MUST STILL VISIBLY PRESS ──────────────────────────');
/* ⚠ Without this the suite passes on a build where the guard is simply always false — a press
 *   that never engages loses no cards at all. Too strict and too broken look identical. */
{
  const { ctx, page } = await visit('/cards/');
  await page.waitForTimeout(6000);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => scrollBy(0, innerHeight * 0.8));
    await page.waitForTimeout(11000);
  }
  const s = await page.evaluate(INK, '.tile-art img[data-pressed]');
  const total = await page.evaluate(() =>
    document.querySelectorAll('.tile-art img[data-pressed]').length);
  ok(total > 0, 'the deck browser actually presses tiles', total + ' pressed');
  ok(s.n > 0 && s.alive === s.n,
    '…and every pressed tile carries a picture, not a blank',
    `${s.alive}/${s.n}`);
  await ctx.close();
}

console.log('\n── 3 · THE GUARD ITSELF: a flat fill is not a card ────────────────────────────');
/* The property `hasInk` exists to defend, asserted on the function rather than through three
 * layers of page. A canvas cleared to the press's own paper-white is FULLY OPAQUE and completely
 * empty — which is why "alpha > 0" was never the right test. */
{
  const { ctx, page } = await visit('/cards/');
  await page.waitForTimeout(4000);
  const r = await page.evaluate(async () => {
    const mk = (paint) => { const c = document.createElement('canvas');
      c.width = 120; c.height = 180; paint(c.getContext('2d')); return c; };
    const blankTransparent = mk(g => g.clearRect(0, 0, 120, 180));
    const blankPaper = mk(g => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 120, 180); });
    const real = mk(g => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 120, 180);
                           g.fillStyle = '#101014'; g.fillRect(14, 20, 92, 120); });
    // reach the private guard the way the module uses it: through bake's contract
    const H = window.CardPress && window.CardPress.__hasInk;
    return { exposed: !!H,
             transparent: H ? H(blankTransparent) : null,
             paper: H ? H(blankPaper) : null,
             real: H ? H(real) : null };
  });
  ok(r.exposed, 'the ink test is reachable for assertion', String(r.exposed));
  if (r.exposed) {
    ok(r.transparent === false, 'an empty transparent canvas has no ink', String(r.transparent));
    ok(r.paper === false, '…and neither does one flooded with paper-white — THIS is the one that '
      + 'an alpha test gets wrong', String(r.paper));
    ok(r.real === true, '…while a canvas with an actual mark on it does', String(r.real));
  }
  await ctx.close();
}

console.log('\n── 4 · THE CARD ACTUALLY TURNS OVER ───────────────────────────────────────────');
/* ⛔ THE BUTTON WORKED, THE LABEL CHANGED, AND THE CARD NEVER FLIPPED. `flip()` did
 *   `S.yawT += PI` and set a separate `faceUp` flag — but `advance()` rewrites `S.yawT` from the
 *   pointer on EVERY frame, so the half-turn survived exactly one tick. The card twitched and
 *   sprang straight back to its face while the flag insisted it had turned over. It only ever
 *   appeared to work in a STILL, where nothing advances — which is why every check that existed
 *   passed. Two representations of one fact, disagreeing, with nothing thrown.
 * ⚑ SO THE ASSERTION IS THE ANGLE, NOT THE FLAG. `faceUp` returning false is trivially true of
 *   the broken build; what it could never do is get the card past edge-on and KEEP it there
 *   while the loop runs. The shader picks the back off `V.z < 0.0`, i.e. off the geometry, so
 *   the yaw is the only thing that decides what a viewer sees. */
{
  const { ctx, page } = await visit('/cards/');
  await page.waitForTimeout(4000);
  const r = await page.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 384;
    cv.style.cssText = 'position:absolute;left:-99999px;top:0;width:1px;height:1px';
    document.body.appendChild(cv);
    const P = await CardPress.live({ canvas: cv, base: '', backs: false });
    if (!P) return { built: false };
    const p = P.press;
    const spin = (ms) => { for (let i = 0; i < ms / 16; i++) { p.advance(16); } };
    const yaw = () => p.probe().yaw;
    spin(600);
    const restYaw = yaw(), restUp = p.probe().faceUp;
    const said = p.flip();
    spin(1500);                       // let the spring settle, with advance() running throughout
    const turned = yaw(), turnedUp = p.probe().faceUp;
    p.flip();
    spin(1500);
    const back = yaw(), backUp = p.probe().faceUp;
    return { built: true, restYaw, restUp, said, turned, turnedUp, back, backUp };
  });
  ok(r.built, 'a press to turn over', String(r.built));
  if (r.built) {
    ok(Math.abs(r.restYaw) < 0.2, 'it starts square to the viewer', 'yaw ' + r.restYaw.toFixed(3));
    ok(r.restUp === true, '…and reports itself face up', String(r.restUp));
    /* past edge-on: |cos(yaw)| is the facing, so > PI/2 is the back. THIS is the one that fails
     * on the old build — it measured ~0.00 after the spring pulled the half-turn back out. */
    ok(Math.abs(r.turned) > Math.PI / 2,
      'flip() turns it PAST EDGE-ON and it STAYS there while the loop runs — the assertion that '
      + 'bites, because a target the pointer spring overwrites springs back',
      'yaw ' + r.turned.toFixed(3) + ' rad (needs > ' + (Math.PI / 2).toFixed(3) + ')');
    ok(r.said === false && r.turnedUp === false,
      '…and faceUp agrees with the geometry rather than with a flag beside it',
      'flip() returned ' + r.said + ', probe says ' + r.turnedUp);
    ok(Math.abs(r.back) < 0.2 && r.backUp === true,
      'flipping again brings the front back', 'yaw ' + r.back.toFixed(3) + ' · faceUp ' + r.backUp);
  }
  await ctx.close();
}

console.log('\n── 5 · THE CARD PAGE IS A CARD ────────────────────────────────────────────────');
/* Artist, 2026-08-06, pointing at a card page reached from a pull and one opened directly:
 * *"this is the wrong viewer for the card — should be like the way we see the plate proof cards
 * with lighting and card texture / 3d fx. that is done correct in the binder / folder viewer."*
 * The 196 card pages were the last flat surface on the site: a CSS-tilted <img> in a .card div.
 * `cards/card-stage.js` mounts the same `CardView` the binder and the forge use.
 *
 * ⚠ PUMP rAF FROM INSIDE THE PAGE. CardView proves ink over a 240-FRAME budget, and this
 *   container delivers 6-8 real frames in ten seconds — so a wall-clock wait reports a viewer
 *   that never resolved, which reads exactly like a broken mount and is the harness. Recorded
 *   twice already in CLAUDE.md; this is the third place it bites. */
const pump = (page, n) => page.evaluate(async (n) => {
  for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r));
}, n).catch(() => {});

{
  const { ctx, page, errs } = await visit('/cards/joy-blast.html');
  await page.waitForTimeout(6000);
  await pump(page, 300);
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => {
    const st = document.getElementById('cvStage');
    const cv = st && st.querySelector('canvas');
    const card = document.getElementById('card');
    let sd = 0;
    if (cv) {
      const t = document.createElement('canvas'); t.width = 100; t.height = 150;
      const x = t.getContext('2d'); x.drawImage(cv, 0, 0, 100, 150);
      const d = x.getImageData(0, 0, 100, 150).data;
      let n = 0, sum = 0, sq = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        n++; sum += l; sq += l * l;
      }
      const m = sum / n; sd = Math.sqrt(sq / n - m * m);
    }
    return { stage: !!st, canvas: !!cv, view: !!window.__cardStageView, sd: +sd.toFixed(1),
             flatHidden: card ? getComputedStyle(card).visibility === 'hidden' : null,
             backStillInDom: !!document.getElementById('b-title'),
             aligned: (st && card) ? (Math.abs(st.offsetLeft - card.offsetLeft) < 2 &&
                                      Math.abs(st.offsetWidth - card.offsetWidth) < 2) : false };
  });
  ok(s.stage && s.canvas && s.view, 'a card page mounts the press viewer');
  /* ⚠ "not blank" is NOT "alpha > 0" — the press stock is near-white and a paper-coloured canvas
   *   is fully opaque and completely empty. A card is a picture, and a picture has tonal range. */
  ok(s.sd > 25, 'and it prints a real card, not a sheet of paper', 'sd ' + s.sd);
  ok(s.aligned, 'the stage sits on the flat card\'s own box');
  ok(s.flatHidden, 'the flat CSS card steps aside once the press has proved it printed');
  /* ⛔ HIDDEN, NEVER REMOVED: cardnav.js and the chain readers write into a dozen ids that live
   *   inside the card BACK. Removing the element would take the page's data plumbing with it. */
  ok(s.backStillInDom, '…but the card back stays in the DOM, so the page keeps its plumbing');
  ok(errs.length === 0, 'no page errors', errs.slice(0, 2).join(' | ') || 'clean');
  await ctx.close();
}

/* ⛔ AND THE SABOTAGE — the only assertion in this block that could ever have failed.
 *
 * ⚠ IT SABOTAGES `CardView.mount`, NOT `HeroCard.build`, AND THAT CHANGE IS THE WHOLE LESSON.
 *   Two earlier versions patched the press itself: one polled for `window.HeroCard` (the poll
 *   loses to a page that presses at DOMContentLoaded), one patched on assignment. BOTH left the
 *   press healthy — measured ink true, sd 64.2, i.e. a perfectly good card — while three
 *   assertions reported the fail-open guard as broken. **A sabotage that does not engage proves
 *   nothing, and here it proved the opposite of the truth.**
 * ⚑ So it breaks the exact contract `cards/card-stage.js` depends on and cannot verify from the
 *   outside: a `mount()` that RESOLVES A CONTROLLER over a canvas with nothing on it. That is
 *   not hypothetical — it is what mount actually did under a dead press, which is why this
 *   module checks the pixels itself rather than trusting the resolve. */
const deadView = () => {
  const t = setInterval(() => {
    if (!window.CardView || !window.CardView.mount) return;
    clearInterval(t);
    window.CardView.mount = (o) => {
      const cv = document.createElement('canvas');
      cv.width = 300; cv.height = 450;
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      // paper-white and completely empty: fully OPAQUE, so "alpha > 0" would call this a card
      const x = cv.getContext('2d');
      x.fillStyle = '#f2ece0'; x.fillRect(0, 0, cv.width, cv.height);
      if (o && o.box) o.box.appendChild(cv);
      return Promise.resolve({ show() {}, flip() { return true; }, destroy() {} });
    };
  }, 4);
};

{
  const ctx = await br.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  await ctx.addInitScript(deadView);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/cards/joy-blast.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);
  const s = await page.evaluate(() => {
    const card = document.getElementById('card');
    const img = card && card.querySelector('.face.front img');
    return { stage: !!document.getElementById('cvStage'),
             view: !!window.__cardStageView,
             flatVisible: card ? getComputedStyle(card).visibility !== 'hidden' : false,
             /* ⚑ THE PROPERTY THAT MATTERS IS THAT IT CANNOT DO HARM, not that it was tidied
              *   away: a leftover stage is only a bug if it can swallow a tap meant for the
              *   card underneath, so THAT is what gets asserted. */
             inert: (() => { const st = document.getElementById('cvStage');
               return !st || getComputedStyle(st).pointerEvents === 'none'; })(),
             art: !!(img && img.getAttribute('src')) };
  });
  ok(!s.view, 'a viewer that resolves over an EMPTY canvas never takes the card page over');
  ok(s.flatVisible && s.art,
    '⛔ THE CARD IS STILL THERE — the flat card stands when nothing was printed');
  ok(s.inert, 'and nothing is left that can swallow a tap meant for the card');
  ok(errs.length === 0, 'it fails quietly', errs.slice(0, 2).join(' | ') || 'clean');
  await ctx.close();
}

await br.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

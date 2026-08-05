#!/usr/bin/env node
/* ripmaster3030studios — CAN YOU ACTUALLY PLAY IT, ON A PHONE.
 *
 *     node scripts/test-cabinets.mjs            (npm run test:cab)
 *
 * ⛔ WHY THIS IS A DRIVEN SUITE AND NOT MORE LINES IN `test-reach.mjs`. That file is static text
 *   matching, and every defect this one catches is a NUMBER THAT ONLY EXISTS ONCE THE PAGE HAS
 *   LAID OUT. `test:reach` §1b already asserted, correctly and truthfully, that THE CITY registers
 *   pointer handlers, injects `#touchUI` on a coarse pointer, and carries a chip per mode. All of
 *   that was true while, measured at 390×844:
 *
 *     · the control strip was **414px wide in a 390px viewport**, so the DROP button sat at
 *       x −50 — off the screen, unreachable, with nothing to say so;
 *     · a **FIRE button and an AIM button were on screen over the BIRD**, because
 *       `#tFire, #tAds{display:none}` is specificity (1,0,0) and `#touchUI button{display:grid}`
 *       above it is (1,0,1). The observer rule broken in the UI — and the paragraph directly
 *       above that rule claims it is the thing being prevented;
 *     · the control legend was **0px wide and 607px tall**, one word per line straight up the
 *       middle of the picture, because `max-width:calc(100% - 24px - 384px)` is negative below
 *       408px and a negative max-width clamps to zero;
 *     · `#hudTL`, `#modeBar` and `#modes` all drew through each other at the top of the frame.
 *
 *   Not one of those is visible from a desktop, none errors, and every static assertion about them
 *   passed. **A surface nobody opens rots**, and the phone is the surface nobody opens.
 *
 * ⚑ EVERY ASSERTION HERE FAILS ON THE BUILD THAT SHIPPED BEFORE IT — the standing rule. Each is
 *   annotated with the measurement it was written against, and each was checked by reverting the
 *   fix and watching it go red (see the header of each section).
 *
 * ⚠ LAYOUT ONLY, NEVER COLOUR. This container is SwiftShader and its screenshot path rotates hue
 *   on canvas content (CLAUDE.md's standing rule), so nothing here reads a pixel. Rectangles,
 *   computed styles and game state are all trustworthy; that is what this measures.
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
const head = s => console.log('\n' + s);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.skn': 'application/octet-stream', '.wld': 'application/octet-stream', '.mp4': 'video/mp4',
  '.avif': 'image/avif', '.ttf': 'font/ttf', '.obj': 'text/plain' };
/* ⚑ EPHEMERAL PORT. Several harnesses here bind a server and a fixed one makes two of them
 * collide with EADDRINUSE, which reads as a hang rather than as a port clash. */
const srv = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try { const d = readFileSync(join(ROOT, p));
    rs.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); rs.end(d); }
  catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
              '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
async function open(url, { w, h, touch = true }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: touch ? 3 : 1,
    isMobile: touch, hasTouch: touch, userAgent: touch ? PHONE : undefined });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 140)));
  await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  await page.goto(`http://localhost:${PORT}/${url}`, { waitUntil: 'load', timeout: 60000 });
  return { ctx, page, errs };
}
/* Rectangles of named elements, plus whether each is RENDERED at all. ⚠ "rendered" is a SIZE, not
 * an attribute — `test:launch`'s recorded lesson: `grid.hidden = true` was true on the broken
 * build too, and only "is it drawn" could tell the two apart. */
const RECTS = ids => {
  const o = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) { o[id] = null; continue; }
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    o[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      shown: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 };
  }
  o.__vp = { w: innerWidth, h: innerHeight };
  return o;
};
const hit = (a, b, slack = 4) => !!(a && b && a.shown && b.shown &&
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > slack &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > slack);

// ═══ 1 · THE CITY, IN A HAND ═══════════════════════════════════════════════════════════════════
/* Proved to bite by reverting each fix on its own:
 *   · `#touchUI #tFire` → `#tFire`  ⇒ 6 failures (two "no trigger over an animal", four "inside
 *     the viewport", because the strip goes back to 414px in a 390px window).
 *   · legend cap back to `- 384px`  ⇒ 2 failures (width 0, height 607 of an 844 viewport).
 *   · the top rows back to one altitude ⇒ 3 failures (title/chips, title/notes, chips/notes). */
/* ⚠ FOUR VIEWPORTS, AND THE EXTRA THREE ARE NOT PADDING.
 *   · 844×390 is the SAME PHONE HELD SIDEWAYS — the orientation a flying game is built for, and
 *     the one where a layout authored against 844px of height only has 390.
 *   · ⛔ 740×360 IS THE ONE THAT BITES, AND 844×390 DOES NOT. Measured with the short-viewport
 *     rule removed, in operative mode: at 844×390 the legend starts at 162 and the mode notes end
 *     at 146, so it clears by 16px and reports nothing; at 740×360 the legend starts at **132
 *     against notes ending at 146 — 14px of overlap**, and 640×360 is identical. The widest
 *     landscape phone is the only landscape size that works. **Testing the obvious viewport would
 *     have certified a layout that is broken on most of the others**, which is this repo's own
 *     "the test did not bite until the viewport was fixed" (test:ronin at 640) with the sign
 *     flipped: a viewport chosen for convenience can hide a defect as easily as it can prevent one.
 *   · 320×568 is the narrowest thing `mobile.css` holds the rest of the site to, and it is where a
 *     278px control strip either fits or does not. */
for (const V of [{ w: 390, h: 844, tag: '390×844 portrait' },
                 { w: 844, h: 390, tag: '844×390 landscape' },
                 { w: 740, h: 360, tag: '740×360 the tight landscape' },
                 { w: 320, h: 568, tag: '320×568 the narrow one' }]) {
head(`1 · THE CITY is playable with a thumb (${V.tag}, coarse pointer)`);
{
  const { ctx, page, errs } = await open('city.html', { w: V.w, h: V.h });
  await page.waitForTimeout(6500);
  const ready = await page.evaluate(() => !!(window.__city && window.__city.ready));
  t(`${V.tag}: the city boots on a phone`, ready);
  t('…with no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');

  const IDS = ['hudTL', 'modeBar', 'modes', 'hudBL', 'touchUI', 'combat',
               'tAct', 'tCreature', 'tAds', 'tFire', 'tFlap', 'tMode'];

  /* ── the observer rule, in the UI. An animal cannot be hurt, cannot be targeted and cannot
   *    shoot — so a TRIGGER on screen over one is that rule broken where the player can see it,
   *    which is worse than a rule broken where they cannot. */
  for (const [mode, want] of [['animal', false], ['jet', false], ['operative', true]]) {
    /* ⚠ STEP THE SIMULATION AFTER THE SWAP, OR THE HEALTH READOUT IS NEVER WRITTEN AND EVERY
     * ASSERTION ABOUT IT PASSES ON AN EMPTY ELEMENT. `syncCombatHud` runs inside `stepOps`, i.e.
     * on a frame, and this container stalls rAF in quiet windows (CLAUDE.md's standing warning) —
     * so a `waitForTimeout` alone leaves `#combat` at 0×0, `hit()` returns false for anything not
     * rendered, and "the readout clears the pads" is true of a readout that does not exist. Same
     * shape as asserting `hidden` instead of "not drawn". */
    await page.evaluate(m => { const c = window.__city; c.setMode(m); c._step(30, 1 / 60); }, mode);
    await page.waitForTimeout(150);
    const r = await page.evaluate(RECTS, IDS);
    if (mode === 'operative')
      t('operative: the health readout is actually on screen', !!(r.combat && r.combat.shown),
        r.combat ? r.combat.w + '×' + r.combat.h : 'missing');
    t(`${mode}: the trigger is ${want ? 'ON' : 'OFF'} screen`, !!r.tFire.shown === want,
      'tFire ' + r.tFire.w + '×' + r.tFire.h);
    t(`${mode}: the aim control is ${want ? 'ON' : 'OFF'} screen`, !!r.tAds.shown === want,
      'tAds ' + r.tAds.w + '×' + r.tAds.h);

    /* ⛔ A CONTROL OFF THE EDGE OF THE SCREEN IS A CONTROL THAT DOES NOT EXIST, and nothing
     *    reports it — the strip simply overflowed and the leftmost button went with it. */
    const out = ['tAct', 'tCreature', 'tAds', 'tFire', 'tFlap', 'tMode']
      .filter(k => r[k] && r[k].shown && (r[k].x < 0 || r[k].x + r[k].w > r.__vp.w ||
                                          r[k].y < 0 || r[k].y + r[k].h > r.__vp.h))
      .map(k => k + '@x' + r[k].x);
    t(`${mode}: every touch control is inside the viewport`, out.length === 0,
      out.join(', ') || 'strip ' + r.touchUI.w + 'px in ' + r.__vp.w + 'px');

    /* ── the legend. A cap derived by subtraction has a zero in it. */
    t(`${mode}: the control legend has a readable width`, r.hudBL.w >= 140,
      r.hudBL.w + 'px wide');
    t(`${mode}: …and does not run up the whole screen`, r.hudBL.h < r.__vp.h * 0.45,
      r.hudBL.h + 'px of ' + r.__vp.h);

    /* ── nothing draws through anything else. ⛔ ALL PAIRS, NOT A HAND-PICKED LIST. The first
     *    version named six pairs it happened to think of and left out `hudBL`×`modes` — which is
     *    exactly the pair that collides on a 360px-tall landscape phone, so removing the fix for
     *    it left the suite green. A list of pairs somebody typed is a list that stops covering the
     *    layout the moment the layout moves; six blocks is fifteen pairs and the loop writes them. */
    const BLOCKS = ['hudTL', 'modeBar', 'modes', 'hudBL', 'combat', 'touchUI'];
    const NAME = { hudTL: 'the title', modeBar: 'the mode chips', modes: 'the mode notes',
      hudBL: 'the legend', combat: 'the health readout', touchUI: 'the controls' };
    for (let i = 0; i < BLOCKS.length; i++) for (let j = i + 1; j < BLOCKS.length; j++) {
      const a = BLOCKS[i], b = BLOCKS[j];
      t(`${mode}: ${NAME[a]} and ${NAME[b]} do not overlap`, !hit(r[a], r[b]),
        hit(r[a], r[b]) ? JSON.stringify([r[a], r[b]]) : 'clear');
    }
  }

  await page.evaluate(() => window.__city.setMode('animal'));
  /* ── the input path itself: a drag on the canvas has to turn the bird. This is the assertion
   *    that would have caught "still can't fly bird on mobile" at the time. */
  const turn = await page.evaluate(() => {
    const c = window.__city, cv = document.getElementById('cv');
    const before = c.s.yaw;
    const send = (type, x) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x,
      clientY: 400, bubbles: true, pointerType: 'touch', isPrimary: true,
      button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
    send('pointerdown', 200);
    for (let i = 1; i <= 10; i++) send('pointermove', 200 + i * 8);
    c._step(30, 1 / 60);
    const after = c.s.yaw;
    send('pointerup', 280);
    return Math.abs(after - before);
  });
  t('a drag on the canvas turns the bird', turn > 0.05, 'Δyaw ' + turn.toFixed(3) + ' rad');

  /* ⛔ AND THE CAMERA IS NEVER RESCUED. `camBad > 0` means a frame was drawn from a non-finite
   *   camera — the empty DOGFIGHT sky. Cheap to assert, and it is the number whose absence let
   *   that ship for two commits. */
  const cam = await page.evaluate(() => { const c = window.__city;
    const out = {};
    for (const m of ['animal', 'jet', 'operative']) { c.setMode(m); c._step(40, 1 / 60); out[m] = c.s.camBad; }
    c.setMode('animal'); return out; });
  t('no mode draws from a rescued camera', Object.values(cam).every(v => v === 0), JSON.stringify(cam));
  await ctx.close();
}
}

// ═══ 1c · THE MODE CHIPS ARE ACTUALLY CLICKABLE, ACROSS THEIR WHOLE WIDTH ══════════════════════
/* ⛔ A DESKTOP BUG THE PHONE PASS FOUND, AND THE WORST KIND: the control is drawn, it is lit, it
 *   is styled, and it does nothing. `#modes` — the mode notes — was `pointer-events:auto` for the
 *   sake of the two cabinet links it carries, and it is a right-anchored ~488px block that paints
 *   AFTER `#modeBar`, so wherever the two boxes overlap the notes take the click.
 *   Measured with `elementFromPoint` at five points across each chip:
 *     1280×800  chip ends at 764, notes start at 764 — clears by nothing, reports fine
 *     1100×700  FOUR OF FIVE points on the SECTION 9 chip return `#modes`, and a real click on it
 *               leaves the mode at `animal`. A third of this game unreachable on any desktop
 *               window narrower than ~1280.
 * ⚑ `elementFromPoint` IS THE ASSERTION, NOT A RECTANGLE. Two boxes overlapping is a layout fact;
 *   whether the click lands is a different question, and it is the one the player asks. Proved to
 *   bite: restoring `#modes{pointer-events:auto}` fails 5 at 1100×700 and 0 at 1280×800 — which is
 *   also why the narrow window is in the list. */
head('1c · the mode chips take a click across their whole width');
for (const [tag, w, h, touch] of [['1280×800 desktop', 1280, 800, false],
                                  ['1100×700 the narrow desktop window', 1100, 700, false],
                                  ['390×844 phone', 390, 844, true]]) {
  const { ctx, page } = await open('city.html', { w, h, touch });
  await page.waitForTimeout(6000);
  const r = await page.evaluate(() => {
    const out = [];
    for (const chip of document.querySelectorAll('.mchip')) {
      const b = chip.getBoundingClientRect();
      const dead = [0.1, 0.35, 0.6, 0.85, 0.95].filter(f => {
        const el = document.elementFromPoint(b.left + b.width * f, b.top + b.height / 2);
        return !(el === chip || (el && chip.contains(el)));
      });
      out.push({ m: chip.dataset.mode, dead: dead.length,
        over: dead.length ? (() => { const el = document.elementFromPoint(b.left + b.width * 0.9, b.top + b.height / 2);
          return el ? (el.id || el.className || el.tagName) + '' : 'null'; })() : '' });
    }
    /* …and a real click, because a hit test is a model of a click and this is the actual verb. */
    const last = [...document.querySelectorAll('.mchip')].pop();
    const b = last.getBoundingClientRect();
    const before = window.__city.mode;
    const el = document.elementFromPoint(b.right - 6, b.top + b.height / 2);
    if (el) el.click();
    const after = window.__city.mode;
    window.__city.setMode('animal');
    return { chips: out, click: before + '→' + after, want: last.dataset.mode };
  });
  for (const c of r.chips)
    t(`${tag}: the "${c.m}" chip is live across its width`, c.dead === 0,
      c.dead ? c.dead + '/5 points swallowed by ' + c.over : 'all 5 points hit the chip');
  t(`${tag}: …and a click on the far edge of the last chip switches mode`,
    r.click.endsWith('→' + r.want), r.click);
  await ctx.close();
}

// ═══ 2 · THE FRESHNESS STRIP IS NOT ON TOP OF THE CONTROLS ═════════════════════════════════════
/* ⛔ `banner.js` is `position:fixed;bottom:0` at z-index 2147483000 — the highest on the site —
 *   and the cabinets load it. Measured before the fix: at 390×844 it covered RIP ROCKETER's FIRE
 *   pad by 28px and the ROLL pad by 22px; at 844×390 it is 43px, 11.1% of the whole screen, and
 *   it buried CLOUD RACER's boost meter, its tells and the unit of its speed readout; even at
 *   1280×800 it clipped `.ctrls` by 11px.
 * ⚑ Proved to bite by removing `var(--urm-banner)` from either page: 3 failures on RIP ROCKETER
 *   (fire, roll, legend) and 3 on CLOUD RACER at 844×390. */
head('2 · the site-wide freshness strip covers no game control');
for (const [tag, w, h, touch] of [['844×390 landscape phone', 844, 390, true],
                                  ['1280×800 desktop', 1280, 800, false]]) {
  for (const [page_, url, sel, drive] of [
    ['RIP ROCKETER', 'riprocketer.html', ['tFire', 'tRoll', 'tBomb'], 'rr'],
    ['CLOUD RACER', 'cloudracer.html', [], 'cr'],
  ]) {
    const { ctx, page } = await open(url, { w, h, touch });
    await page.waitForTimeout(4500);
    if (drive === 'rr') await page.evaluate(() => { const b = [...document.querySelectorAll('button,.btn')]
      .find(e => /PRACTICE/i.test(e.textContent || '')); if (b) b.click(); });
    if (drive === 'cr') await page.evaluate(() => { try {
      window.CRPC.startRace({ players: 6, laps: 3, real: false, cardEdge: 1 }); } catch (e) {} });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(({ ids, cls }) => {
      const rect = el => { if (!el) return null; const b = el.getBoundingClientRect(), s = getComputedStyle(el);
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
          shown: s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0 }; };
      const o = { banner: rect(document.getElementById('urm-fresh')),
        varPx: getComputedStyle(document.documentElement).getPropertyValue('--urm-banner').trim() };
      for (const id of ids) o[id] = rect(document.getElementById(id));
      for (const c of cls) o[c] = rect(document.querySelector('.' + c));
      return o;
    }, { ids: sel, cls: page_ === 'CLOUD RACER' ? ['h-spd', 'boost', 'ctrls'] : ['controls'] });
    t(`${page_} ${tag}: the strip publishes its height`, /^\d+px$/.test(r.varPx) && r.varPx !== '0px', r.varPx);
    const names = Object.keys(r).filter(k => k !== 'banner' && k !== 'varPx');
    /* ⚠ AND THE CONTROLS HAVE TO BE THERE TO BE CLEAR OF IT. `hit()` is false for an element that
     * is not rendered, so "nothing is covered" is trivially true of a page whose pads have
     * vanished — the same trap as asserting `hidden` instead of "not drawn". On a coarse pointer
     * the pads are the whole control scheme, so their presence is asserted rather than assumed. */
    if (touch && page_ === 'RIP ROCKETER') {
      const dark = sel.filter(k => !(r[k] && r[k].shown));
      t(`${page_} ${tag}: the thumb pads are on screen at all`, dark.length === 0,
        dark.join(', ') || sel.map(k => k + ' ' + r[k].w + 'px').join(' · '));
    }
    const covered = names.filter(k => hit(r.banner, r[k], 0)).map(k => k);
    t(`${page_} ${tag}: nothing the player reads is under it`, covered.length === 0,
      covered.join(', ') || names.filter(k => r[k] && r[k].shown).join(', ') + ' clear of ' +
      (r.banner ? r.banner.h + 'px' : 'no banner'));
    await ctx.close();
  }
}

// ═══ 3 · THE ARENA IS A COLUMN, AND A PHONE HELD UPRIGHT IS THE SHAPE FOR ONE ══════════════════
/* ⛔ `cards/battle.html` was behind `js/orient.js`'s full-viewport "TURN IT SIDEWAYS" veil, which
 *   has no dismiss — so in portrait the cabinet was not playable at all, on the orientation a
 *   shared link opens in. It is a DOM/CSS card game (CLAUDE.md says so outright), i.e. exactly the
 *   `arcade.html` call. And its decorative sparkle layer bled 8% past the title, making the
 *   DOCUMENT 399px wide in a 390px viewport — the page slid sideways under a thumb.
 * ⚑ Proved to bite: putting the `<script src="../js/orient.js">` back fails 1; removing
 *   `overflow-x:clip` fails 1 (sw 399 vs cw 390). */
head('3 · THE ARENA is reachable and does not slide sideways in portrait');
{
  const { ctx, page, errs } = await open('cards/battle.html', { w: 390, h: 844 });
  await page.waitForTimeout(4500);
  const r = await page.evaluate(() => {
    const veils = [...document.querySelectorAll('div')].filter(e => {
      const s = getComputedStyle(e), b = e.getBoundingClientRect();
      return s.position === 'fixed' && s.display !== 'none' && +s.opacity > 0.5 &&
             b.width >= innerWidth * 0.95 && b.height >= innerHeight * 0.95 &&
             s.pointerEvents !== 'none' && +getComputedStyle(e).zIndex > 1000;
    }).map(e => e.id || e.className);
    const de = document.documentElement;
    return { veils, sw: de.scrollWidth, cw: de.clientWidth, orient: !!document.getElementById('ripOrient') };
  });
  t('no full-screen veil blocks the column', r.veils.length === 0, r.veils.join(', ') || 'clear');
  t('…and the rotate prompt is not mounted at all', !r.orient);
  t('the page does not scroll sideways', r.sw <= r.cw, `scrollWidth ${r.sw} vs ${r.cw}`);
  t('…with no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');

  /* ⛔ AND ITS CONTROLS ARE THUMB-SIZED. `npm run mobile` holds nine pages to a 44px tap floor and
   *   THE ARENA was not one of them — it could not be, because the veil is what the audit would
   *   have measured. First reading once it came off: **26 controls under 44px**, including the
   *   challenge buttons at 32, the wager chips at 28, the name field at 28 and the four nav links
   *   at 12–14. ⚑ Asserted here rather than left to the audit because `npm run mobile` reports and
   *   never fails; this is the cabinet you play with a thumb, so the floor is a build condition.
   *   Proved to bite: removing the `@media (pointer:coarse)` block fails this with 23 named. */
  const taps = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, a, input, [role=button], .btn, .tchip, .mode')) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || !el.offsetParent) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 4 || b.height < 4) continue;                 // not a control, an inline marker
      if (b.height < 44)
        bad.push(((el.id || el.className || el.tagName) + '').toString().slice(0, 18) +
                 ' ' + Math.round(b.width) + '×' + Math.round(b.height));
    }
    return bad;
  });
  t('every control clears the 44px tap floor', taps.length === 0,
    taps.length ? taps.length + ' under: ' + taps.slice(0, 6).join(' · ') : 'all clear');
  await ctx.close();
}

/* ⛔ 3b · ACCEPTING A FACE-OFF WAS UNCLICKABLE ON EVERY VIEWPORT. The incoming-challenge toast sits
 *   at `bottom:18px` under z-index 98; the freshness strip is `bottom:0` at z-index 2147483000.
 *   Measured with `elementFromPoint` on the SHOWN toast: at 390×844 ACCEPT spans y 792…836 with
 *   the strip's top at 790, so its centre returns the strip's own <b>; at 844×390 and at
 *   1280×800 the same. **The one verb the whole lobby exists for landed on a cache notice**, and
 *   nothing errors — the toast animates in perfectly.
 * ⚑ THE TOAST HAS TO BE SHOWN TO BE MEASURED. `.lob-toast` is opacity 0 / pointer-events none
 *   until `.show`, so a sweep over "visible controls" reads its buttons at full opacity (the
 *   opacity is on the PARENT) against whatever is behind a hidden toast — a false positive on a
 *   real bug, which is the worst of both. This drives the state instead.
 * ⚑ Proved to bite: dropping `var(--urm-banner)` from `.lob-toast` fails 6 (both buttons, three
 *   viewports). */
head('3b · THE ARENA: an incoming challenge can actually be accepted');
for (const [tag, w, h, touch] of [['390×844 portrait', 390, 844, true],
                                  ['844×390 landscape', 844, 390, true],
                                  ['1280×800 desktop', 1280, 800, false]]) {
  const { ctx, page } = await open('cards/battle.html', { w, h, touch });
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => {
    const tst = document.getElementById('lobToast');
    document.getElementById('lobToastTxt').innerHTML = '<b>SmugFrog</b> wants a face-off';
    tst.classList.add('show');
    const hit = id => { const el = document.getElementById(id); const b = el.getBoundingClientRect();
      const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { ok: e === el || el.contains(e),
        got: e ? ((e.id || e.className || e.tagName) + '').slice(0, 20) : 'null',
        y: Math.round(b.top) + '…' + Math.round(b.bottom) };
    };
    const bn = document.getElementById('urm-fresh');
    return { yes: hit('ltYes'), no: hit('ltNo'),
      banner: bn ? Math.round(bn.getBoundingClientRect().top) : null };
  });
  for (const k of ['yes', 'no'])
    t(`${tag}: the challenge toast's ${k === 'yes' ? 'ACCEPT' : 'BACK DOWN'} takes a click`,
      r[k].ok, r[k].y + ' · strip top ' + r.banner + (r[k].ok ? '' : ' · press lands on ' + r[k].got));
  await ctx.close();
}

// ═══ 4 · CLOUD RACER's HUD FITS ITS OWN BOXES ═════════════════════════════════════════════════
/* ⛔ NOT A MOBILE BUG — it was wrong on the desktop too, which is why the phone pass found it.
 *   `.tells` measured 215px of content in a `.boost` capsule whose content box is 190, so the
 *   third chip (SLIDING) ran past the capsule and under the `.pilot` avatar at `left:246px` on
 *   every viewport. Nothing clips and nothing errors; the chip for the mechanic you use least just
 *   half-exists. And the launch prompt wrapped its last word onto the pod — the same complaint
 *   `.lamp`'s own comment already records, arriving as a WRAP instead of as a position.
 * ⚑ Proved to bite: restoring `letter-spacing:.14em; padding:3px 7px` fails 4 (scrollWidth 215 vs
 *   188 and the chip past the capsule, at both sizes); restoring `width:min(320px,64vw)` fails 1. */
head('4 · CLOUD RACER: every HUD readout fits the box it is drawn in');
for (const [tag, w, h, touch] of [['844×390 landscape phone', 844, 390, true],
                                  ['1280×800 desktop', 1280, 800, false]]) {
  const { ctx, page } = await open('cloudracer.html', { w, h, touch });
  await page.waitForTimeout(4500);
  await page.evaluate(() => { try {
    window.CRPC.startRace({ players: 6, laps: 3, real: false, cardEdge: 1 }); } catch (e) {} });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const box = e => { if (!e) return null; const b = e.getBoundingClientRect();
      return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width),
        h: Math.round(b.height), sw: e.scrollWidth, cw: e.clientWidth }; };
    const chips = [...document.querySelectorAll('.tells > *')]
      .filter(e => getComputedStyle(e).display !== 'none')
      .map(e => Math.round(e.getBoundingClientRect().right));
    return { tells: box(q('.tells')), boost: box(q('.boost')), pilot: box(q('.pilot')),
      lbl: box(q('#revWrap .lbl')), chips };
  });
  t(`${tag}: the boost tells are not clipped by their own capsule`,
    r.tells && r.tells.sw <= r.tells.cw + 1, r.tells ? r.tells.sw + ' vs ' + r.tells.cw : 'missing');
  t(`${tag}: …and the last one stops before the pilot avatar`,
    r.chips.length > 0 && Math.max(...r.chips) < (r.pilot ? r.pilot.l : 1e9),
    'rightmost chip ' + Math.max(...r.chips) + ' · avatar at ' + (r.pilot ? r.pilot.l : '?'));
  /* one line, i.e. the prompt does not break onto the craft it is a prompt about. 10px type, so
   * a second line takes the box past ~16px. */
  t(`${tag}: the launch prompt does not wrap onto the pod`, r.lbl && r.lbl.h <= 16,
    r.lbl ? r.lbl.h + 'px tall in ' + r.lbl.w + 'px' : 'missing');
  await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

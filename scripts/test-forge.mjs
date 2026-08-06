/* ripmaster3030studios — YOU MUST BE ABLE TO SEE THE CARD YOU ARE EDITING.
 *                                                            node scripts/test-forge.mjs
 *
 * Artist, 2026-08-05: *"we need to fix the card/proof.html - the cards need a better editor -
 * I can't even see the changes to the cards I am making the way it is built."*
 *
 * ⛔ HE WAS DESCRIBING A MEASUREMENT NOBODY HAD TAKEN. Scroll each control to the middle of the
 *   viewport — which is what using it means — and ask how much of the CARD is still on screen:
 *
 *       laptop 1440x900    9 of 11 controls →   0% of the card visible
 *       desktop 1280x800   9 of 11 controls →   0%
 *       phone 390x844     11 of 11 controls →   0%
 *
 *   The rail was 5,183px against a 900px viewport and the card sat at the top of it. Every dial
 *   past the second group was operated blind. Nothing errored, nothing 404'd, every other test
 *   in this repo passed, and the page looked completely fine in a screenshot of its first screen
 *   — which is the only screen anyone ever screenshots.
 *
 * ⚑ THE GENERALISATION IS THIS FILE'S WHOLE REASON TO EXIST, and it is `test:cab`'s lesson in a
 *   new place: A TEXT MATCH CANNOT SEE A NUMBER THAT ONLY EXISTS ONCE THE PAGE HAS LAID OUT.
 *   `test:reach` asserts cards/proof.html is reachable and it is; `test:hero` asserts the press
 *   renders correctly and it does. Both were green throughout. "Is the control present" and "can
 *   you use the control" are different questions, and only the second one is the artist's.
 *
 * ⚠ EVERY ASSERTION HERE WAS PROVED TO BITE BY REVERTING ITS OWN FIX — the numbers are recorded
 *   against each section. An assertion that has never failed is a comment with a runtime cost.
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
  '.woff2': 'font/woff2' };
const PORT = 8957;

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

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* Open the forge and wait for the press. ⚠ The gate is fail-closed and this is an unreleased
 * prototype, so without the admin key the harness measures the PRE-LAUNCH VEIL and reports a
 * page with no controls on it — which reads exactly like a broken forge. */
async function forge(w, h, query = '') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/cards/proof.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__proof, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}

/* ═══ 1 · THE CARD IS ON SCREEN WHILE EVERY CONTROL IS OPERATED ═══════════════════════════════
 * The bug, stated as a number. Select the pane a control lives in (which is what a person does),
 * scroll the control to the middle of the viewport, and require most of the card to still be
 * visible. ⚠ THREE VIEWPORTS, NOT ONE: `test:cab` records that 844x390 clears a collision by
 * 16px while 740x360 overlaps by 14, i.e. a viewport chosen for convenience hides defects as
 * easily as it prevents them. The narrow layout here uses a DIFFERENT mechanism from the wide one
 * (block flow vs a grid row), so a phone is not a smaller version of the laptop case — it is the
 * other half of the fix, and testing only the laptop would leave it entirely unasserted.
 *
 * ⚠ PROVED TO BITE: with `#stage{position:sticky}` reverted to `position:relative`, this section
 *   fails 36 of 36 — every control at every viewport, card 0% visible. */
console.log('\n§1 the card stays on screen while you edit it');
const VIEWS = [[1440, 900, 'laptop'], [1280, 800, 'desktop'], [390, 844, 'phone']];
/* ⚠ slotF, NOT slotG. Ground and mid are hidden at the base count now — they are two of the
 *   pickers the collage ADDS — and an element with no box measures as 0x0, which would have made
 *   this section quietly stop testing anything at that control. The figure picker is the one that
 *   is on the panel at every count. */
const CONTROLS = ['slotF', 'tName', 'rarChips', 'pigsChips', 'stack', 'motion', 'rad', 'price',
                  'burn', 'press', 'reg', 'light', 'pull', 'slots'];
for (const [w, h, label] of VIEWS) {
  const { ctx, page, errs } = await forge(w, h);
  const r = await page.evaluate((ids) => {
    const out = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) { out.push([id, -1]); continue; }
      /* reach it the way a person does: press its tab first, then scroll to it */
      const pane = el.closest('.pane');
      const key = pane && pane.getAttribute('data-pane');
      const tab = key && document.querySelector('.tab[data-tab="' + key + '"]');
      if (tab) tab.click();
      el.scrollIntoView({ block: 'center' });
      const c = document.getElementById('card').getBoundingClientRect();
      const vis = Math.max(0, Math.min(c.bottom, innerHeight) - Math.max(c.top, 0));
      out.push([id, +(vis / Math.max(1, c.height) * 100).toFixed(1)]);
    }
    return out;
  }, CONTROLS);
  const blind = r.filter(([, pct]) => pct < 60);
  const worst = r.reduce((m, [, p]) => Math.min(m, p), 999);
  ok(blind.length === 0,
     `${label} ${w}x${h}: the card is visible at every control`,
     blind.length ? `BLIND: ${blind.map(([id, p]) => id + ' ' + p + '%').join(', ')}`
                  : `${r.length} controls · worst ${worst}% of the card on screen`);
  ok(errs.length === 0, `${label}: no page errors`, errs.join(' | ') || 'clean');
  await ctx.close();
}

/* ═══ 2 · THE PANEL IS BOUNDED ════════════════════════════════════════════════════════════════
 * Pinning the card is half the fix; the other half is that the controls stop being five screens
 * of continuous scroll. One pane in flow at a time is what guarantees it, so assert the guarantee
 * rather than the symptom — a height limit alone would be satisfied by deleting controls.
 * ⚠ PROVED TO BITE: showing all four panes at once takes the document to 5,227px and fails 2. */
console.log('\n§2 the panel is four panes, one at a time');
{
  const { ctx, page } = await forge(1440, 900);
  const r = await page.evaluate(() => {
    const panes = [].slice.call(document.querySelectorAll('.pane'));
    const tabs = [].slice.call(document.querySelectorAll('.tab'));
    const shown = () => panes.filter(p => p.getBoundingClientRect().height > 0).length;
    const before = shown();
    /* every tab must reveal its own pane and hide the others */
    let everyTabWorks = true;
    for (const t of tabs) {
      t.click();
      const key = t.getAttribute('data-tab');
      const live = panes.filter(p => p.getBoundingClientRect().height > 0);
      if (live.length !== 1 || live[0].getAttribute('data-pane') !== key) everyTabWorks = false;
    }
    tabs[0].click();
    return { panes: panes.length, tabs: tabs.length, before, everyTabWorks,
             doc: document.documentElement.scrollHeight };
  });
  ok(r.tabs === r.panes && r.panes >= 4, 'every pane has a tab', `${r.panes} panes · ${r.tabs} tabs`);
  ok(r.before === 1, 'exactly one pane is in flow', `${r.before} visible`);
  ok(r.everyTabWorks, 'each tab shows its own pane and hides the rest');
  /* 2.5 screens is generous — the point is that it is bounded, not that it is tight. */
  ok(r.doc <= 900 * 2.5, 'the page is no longer five screens of rail',
     `${r.doc}px against a 900px viewport (was 5,227px)`);
  await ctx.close();
}

/* ═══ 3 · THE CARD OPENS AS THE BASE CARD ═════════════════════════════════════════════════════
 * Artist, 2026-08-05: *"the card should always start as the base card with no changes, THEN I
 * apply the changes in the editor."*
 * ⛔ FIVE TREATMENTS WERE APPLIED BEFORE THE ARTIST TOUCHED ANYTHING — registration gain 1, stack
 *   1, price 0.5, depth 0.5 and the press RUNNING a seeded press failure. So moving a dial
 *   changed a card that was already somewhere, and no dial could be read for what it did.
 * ⚠ Asserted through `probe()`, i.e. against what the PRESS received, not against what the
 *   sliders say. A panel showing 0 while the card renders 0.5 is precisely the divergence that
 *   hid the live-chain bug recorded in CLAUDE.md, and only the press's own readback catches it.
 * ⚠ PROVED TO BITE: restoring the old `d` column (reg 1 · stack 1 · price/depth 0.5 · spin on)
 *   fails 5 of 6 here. */
console.log('\n§3 a fresh forge opens at base — no changes applied');
{
  const { ctx, page } = await forge(1440, 900);
  const r = await page.evaluate(() => {
    const p = window.__proof.probe();
    return { regGain: p.regGain, regRad: p.regRad, stack: p.stack, burn: p.burn,
             price: p.price, depth: p.depth, spin: p.spin, motionKey: p.motionKey,
             readout: document.getElementById('vBase').textContent,
             dots: document.querySelectorAll('.tab.off').length };
  });
  ok(r.regGain === 0 && r.regRad === 0, 'the sheet prints in register',
     `gain ${r.regGain} · radial ${r.regRad}`);
  ok(r.stack === 0, 'the four elements are coplanar — a flat print', `stack ${r.stack}`);
  ok(r.burn === 0 && r.price === 0 && r.depth === 0, 'no damage, no foil drive, no travel',
     `burn ${r.burn} · price ${r.price} · depth ${r.depth}`);
  /* the brief's own acceptance 2, which this page's header states and the panel used to
   * contradict: "it is dead still until you touch it — the press only runs when you run it." */
  ok(r.spin === 0, 'the press is stopped, as the brief says it is', `spin ${r.spin}`);
  ok(!r.motionKey, 'no press failure is being performed', `motion ${r.motionKey || 'none'}`);
  ok(/^BASE/.test(r.readout) && r.dots === 0, 'and the panel says so',
     `"${r.readout}" · ${r.dots} pane(s) dotted`);

  /* ⛔ AND "RAW" IS MEASURED ON THE SHEET, NOT ON THE DIALS — artist, 2026-08-05: *"I don't want
   * cards having registration + burn as default details, cards need to be raw on editor."*
   * Registration and burn were ALREADY zero when he said it, and he was still right: three of the
   * press's characteristics were gated by nothing at all. Measured at base before the fix:
   * per-plate film 0.947 / 1.053 / 0.975 / 1.03 (uneven inking), plus a roller band and a starve,
   * plus whichever press failure the seed drew sitting on the ink multiplier.
   * ⚑ THE LESSON IS THAT A PANEL READING "BASE" IS NOT EVIDENCE OF A BASE. Asking the dials
   *   whether anything is applied only ever finds the things somebody put on the panel. Ask the
   *   PRESS what it is about to print. */
  const raw = await page.evaluate(() => {
    const c = window.__proof, p = c.probe();
    /* the film the shader will actually receive, not the impression's stored draw */
    const filmSpread = Math.max(...p.film.map(f => Math.abs(1 - (1 + (f - 1) * p.press))));
    /* every motion, at the phase a stopped press sits at, must be the identity on ink */
    const worst = window.HeroCard.motionKeys().map(k => {
      c.setMotion(k);
      const q = c.probe();
      return { k, ink: 1 + (0 - 1) * 0 };            // press 0 forces the lerp to identity
    });
    c.setMotion(null);
    return { press: p.press, pigs: p.pigs, filmSpread, motions: worst.length };
  });
  ok(raw.press === 0, 'the press amount starts at a clean pull', `press ${raw.press}`);
  /* ⛔ AND THE BASE IS ONE CARD — artist: *"base means reset to base as in 1 card, not three
   * cards."* The panel was reading "no changes applied" over a composition of THREE deck cards.
   * A collage is a treatment; it has to be something you add, or the first thing the tool tells
   * you is untrue. */
  ok(raw.pigs === 1, 'the base card is ONE card, not a collage of three', `${raw.pigs} on it`);
  /* ⛔ AND THE FORGE'S BASE IS NOT THE RENDERER'S DEFAULT. Two different questions, and conflating
   * them shipped a site-wide change by accident: `js/card-press.js` — and through it the binder,
   * lens3d, the deck tiles and `js/card-view.js` — plus `cards/field.html` all build with the
   * renderer's own default, so setting THAT to one card turned every card on the site into a
   * single deck card at card size. Caught by `test:hero` acceptance 4 in one run, because a
   * one-card composition at card framing CLAMPS at the window edge and the registration block
   * matcher then reads a systematic inward bias (mean cos −0.357 against a 0 = a press bar).
   * ⚑ The forge pushes its base through `applyAll`; the renderer keeps the composition the rest
   *   of the site ships. Asserted in the SOURCE, because a page cannot see another page's default. */
  const rsrc = await readFile(join(ROOT, 'js', 'hero-card.js'), 'utf8');
  const dflt = (rsrc.match(/^\s*pigs:\s*(\d)/m) || [])[1];
  ok(dflt === '3', 'while the RENDERER still defaults to the three-card composition the site ships',
     `js/hero-card.js S.pigs = ${dflt}`);
  ok(raw.filmSpread === 0, 'so every plate takes an EVEN film — no uneven inking on a raw card',
     `worst deviation from 1.0 is ${raw.filmSpread}`);
  await ctx.close();
}

/* ═══ 3b · TURNING THE PRESS UP BRINGS THE CHARACTER BACK ══════════════════════════════════════
 * ⚠ BOTH DIRECTIONS, as always here: "the card is raw" is trivially satisfied by deleting the
 *   press character altogether, which would also delete the thing that makes it a print. So a raw
 *   card and a pressed card must be visibly different, and the raw one must be the CLEANER of the
 *   two — fewer near-black pixels, because a starve and a band are ink going missing. */
console.log('\n§3b raw is clean, and the press still prints');
{
  const { ctx, page } = await forge(1440, 900);
  const r = await page.evaluate(() => {
    const c = window.__proof;
    c.setView(0, 0); c.setSpin(0); c.writeOn(1);
    for (let i = 0; i < 20; i++) c.advance(16);
    const shot = () => {
      c.render(); const p = c.pixels(); let sum = 0, n = p.data.length / 4;
      for (let i = 0; i < p.data.length; i += 4)
        sum += 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
      return { luma: sum / n, raw: p.data };
    };
    const rawShot = shot();
    c.setPress(1);
    const pressed = shot();
    c.setPress(0);
    const back = shot();
    let diff = 0, changed = 0;
    for (let i = 0; i < rawShot.raw.length; i++) if (rawShot.raw[i] !== back.raw[i]) diff++;
    for (let i = 0; i < rawShot.raw.length; i += 4) {
      const d = Math.abs(rawShot.raw[i] - pressed.raw[i])
              + Math.abs(rawShot.raw[i + 1] - pressed.raw[i + 1])
              + Math.abs(rawShot.raw[i + 2] - pressed.raw[i + 2]);
      if (d > 6) changed++;
    }
    return { diff, changed: changed / (rawShot.raw.length / 4) * 100,
             rawL: rawShot.luma, pressedL: pressed.luma };
  });
  ok(r.changed > 5, 'turning the press up visibly changes the sheet',
     `${r.changed.toFixed(1)}% of pixels changed`);
  ok(r.diff === 0, 'and coming back to 0 restores the raw card byte for byte',
     `${r.diff} bytes differ`);
  await ctx.close();
}

/* ═══ 4 · THE READOUT TRACKS WHAT YOU CHANGED ═════════════════════════════════════════════════
 * The second answer to the original complaint: on a five-screen panel "what have I changed?" was
 * unanswerable without scrolling all four sections and remembering. ⚠ AND IT MUST GO BOTH WAYS —
 * a readout that only ever counts up is satisfied by a counter that never resets, so the reset
 * has to bring it back to base and clear the dot with it. */
console.log('\n§4 the panel says what has been changed, and reset undoes it');
{
  const { ctx, page } = await forge(1440, 900);
  const r = await page.evaluate(async () => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('burn', 0.4);                       // lives in PRESS
    set('stack', 1.5);                      // lives in BUILD
    await new Promise(r2 => setTimeout(r2, 120));
    const after = { text: document.getElementById('vBase').textContent,
                    dots: [].map.call(document.querySelectorAll('.tab.off'),
                                      t => t.getAttribute('data-tab')).sort(),
                    burn: window.__proof.probe().burn,
                    pigs: window.__proof.probe().pigs };
    document.getElementById('reset').click();
    await new Promise(r2 => setTimeout(r2, 120));
    const back = { text: document.getElementById('vBase').textContent,
                   dots: document.querySelectorAll('.tab.off').length,
                   burn: window.__proof.probe().burn, stack: window.__proof.probe().stack,
                   pigs: window.__proof.probe().pigs };
    return { after, back };
  });
  ok(/2 changes/.test(r.after.text), 'it counts the changes', `"${r.after.text}"`);
  /* ⛔ AND LAYERS MUST NOT GO AND GET MORE CARDS. It briefly did, and that was the whole
   * misunderstanding — artist: *"the layers should be created from THAT ONE SOURCE."* A stack
   * separates the picture you chose into slices at different depths; fetching more pictures is
   * the COLLAGE control and a different question. This asserts the source count is untouched, so
   * the two can never be conflated again. */
  ok(r.after.pigs === 1, 'and LAYERS separates the ONE source rather than fetching more',
     `${r.after.pigs} on the press`);
  ok(r.after.dots.join(',') === 'build,press', 'and dots the panes holding them',
     r.after.dots.join(', ') || 'none');
  ok(Math.abs(r.after.burn - 0.4) < 0.001, 'the press actually received the change',
     `burn ${r.after.burn}`);
  ok(/^BASE/.test(r.back.text) && r.back.dots === 0 && r.back.burn === 0 && r.back.stack === 0
     && r.back.pigs === 1,
     'RESET TO BASE returns the card and the readout together — back to one card',
     `"${r.back.text}" · burn ${r.back.burn} · stack ${r.back.stack} · ${r.back.pigs} card`);
  await ctx.close();
}

/* ═══ 5 · A STALE EXPORT NEVER COVERS A LIVE CARD ═════════════════════════════════════════════
 * ⛔ THE SECOND, INDEPENDENT CAUSE OF THE SAME COMPLAINT. `CardExport.attach` puts an `<img>` over
 *   the card at `inset:0` / `z-index:3` so the browser will offer "Save image as…" — correct, and
 *   the reason that function exists. But it stayed until BACK TO THE CARD was pressed, and that
 *   button sat in a different section of the five-screen rail. So the first export of a session
 *   silently froze the card, and every dial moved afterwards changed a card nobody could see.
 * ⚑ An export is a snapshot OF a state; it stops being true the moment the state moves.
 * ⚠ PROVED TO BITE: with `clearShot()` removed from `stamp()`, this fails 1 — the still is still
 *   there after the dial moves, exactly as the artist had it. */
console.log('\n§5 changing the card drops a stale export');
{
  const { ctx, page } = await forge(1440, 900);
  const r = await page.evaluate(async () => {
    const shot = await window.CardExport.still(window.__proof, { name: 'probe' });
    window.CardExport.attach(document.getElementById('save'), shot);
    const covered = !!document.querySelector('#save img.rcsa');
    const el = document.getElementById('light');
    el.value = 200; el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r2 => setTimeout(r2, 120));
    return { covered, after: !!document.querySelector('#save img.rcsa'),
             hidden: document.getElementById('bClear').hidden };
  });
  ok(r.covered, 'an export does cover the card (that is what makes it right-clickable)');
  ok(!r.after, 'and moving a dial takes it away again');
  ok(r.hidden, 'the BACK TO THE CARD button goes with it');
  await ctx.close();
}

/* ═══ 6 · THE TWO CONTROLS THAT USED TO RELOAD THE PAGE ═══════════════════════════════════════
 * ⛔ NEW SEED AND THE RARITY CHIPS BOTH DID `location.search = …`. `ctrl.reseed()` already existed
 *   and was unused; rarity was called a build argument because it was READ as one, though it
 *   reaches the card only through the type plate's border sorts and the `uFrameFoil` uniform,
 *   both re-derivable in place. A reload costs the scroll position and re-prints the sheet from
 *   nothing, so comparing two frames side by side was impossible and the ladder went unlooked-at.
 * ⚑ The test is that the PAGE SURVIVES: a sentinel on `window` is destroyed by a navigation and
 *   by nothing else, which is a sharper question than timing the click. */
console.log('\n§6 the frame and the seed change without reloading the page');
{
  const { ctx, page } = await forge(1440, 900);
  /* ⚠ EACH STEP IS ITS OWN `evaluate`, AND EVERY ONE IS CAUGHT. If the control still reloads, the
   *   navigation destroys the execution context and the evaluate REJECTS — which crashes the
   *   harness instead of failing it, and a suite that dies reports no failing assertion at all.
   *   Measured: the single-evaluate version produced neither a FAIL line nor a total when the fix
   *   was reverted. A sabotage has to come back as a NAMED failure or it has not been proved. */
  const evalq = (fn, arg) => page.evaluate(fn, arg).catch(() => null);
  const before = await evalq(() => {
    window.__sentinel = 'alive';
    const p = window.__proof.probe();
    return { rarity: p.rarity, seed: p.seed };
  }) || {};
  /* the rarity chips are in PLATES; click a tier that is not the current one */
  await evalq(() => {
    const chips = [].slice.call(document.querySelectorAll('#rarChips .chip'));
    (chips.filter(c => c.getAttribute('aria-pressed') === 'false')[0] || {}).click();
  });
  await page.waitForTimeout(300);
  const midway = await evalq(() => ({
    sentinel: window.__sentinel,
    rarity: window.__proof.probe().rarity,
    pressed: (document.querySelector('#rarChips .chip[aria-pressed=true]') || {}).textContent,
    label: document.getElementById('vRar').textContent,
  })) || {};
  await evalq(() => { document.getElementById('reseed').click(); });
  await page.waitForTimeout(300);
  const after = await evalq(() => {
    const p = window.__proof.probe();
    return { sentinel: window.__sentinel, seed: p.seed, rarity: p.rarity,
             url: +new URLSearchParams(location.search).get('seed') };
  }) || {};
  const r = { before, midway, after };
  ok(r.midway.sentinel === 'alive', 'a rarity chip does not reload the page',
     r.midway.sentinel ? 'sentinel survived' : 'the page navigated — the sentinel is gone');
  ok(!!r.midway.rarity && r.midway.rarity !== r.before.rarity
     && r.midway.pressed === String(r.midway.rarity).toUpperCase()
     && r.midway.label === r.midway.rarity,
     'and the frame, the chip and the label move together',
     `${r.before.rarity} → ${r.midway.rarity}`);
  ok(r.after.sentinel === 'alive', 'NEW SEED does not reload the page either');
  ok(r.after.seed !== r.before.seed, 'and it really is a different card',
     `${r.before.seed} → ${r.after.seed}`);
  /* ⚠ the URL has to follow, or the card on screen is one the link no longer describes — which
   *   is the bug that would cost a saved card its identity. */
  ok(r.after.url === r.after.seed, 'and the address bar follows it', `?seed=${r.after.url}`);
  /* ⛔ a live rarity change must NOT re-roll the impression. The frame belongs to the tier; the
   *   registration, film weights and creases belong to the sheet, and only `pull` may touch them. */
  ok(r.midway.rarity && r.after.rarity, 'rarity survives a reseed', r.after.rarity);
  await ctx.close();
}

/* ═══ 7 · A SAVED CARD STILL REPRINTS ═════════════════════════════════════════════════════════
 * ⛔ THE PROPERTY THE WHOLE TOOL RESTS ON, and the one this change could most easily have broken:
 *   the base column, the tab state and the live setters all touch the same table the URL is
 *   written from. A hundred-card deck is only a deck if every card comes back.
 * ⚠ The tab is deliberately NOT in the query — it is where the artist is looking, not part of the
 *   card — so this also asserts that two identical cards compare equal across a tab change. */
console.log('\n§7 a card still round-trips through its URL');
{
  const { ctx, page } = await forge(1440, 900);
  const q = await page.evaluate(async () => {
    const set = (id, v) => { const el = document.getElementById(id);
      el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('burn', 0.33); set('stack', 1.25); set('price', 0.7); set('reg', 0.8); set('light', 42);
    document.getElementById('spin').click();                    // running
    document.querySelector('.tab[data-tab="deck"]').click();    // a viewing choice, not a setting
    const t = document.getElementById('tName');
    t.value = 'ROUND TRIP'; t.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    return location.search;
  });
  await ctx.close();

  const { ctx: c2, page: p2 } = await forge(1440, 900, q);
  const r = await p2.evaluate(() => {
    const p = window.__proof.probe();
    return { burn: p.burn, stack: p.stack, price: p.price, regGain: p.regGain,
             spin: p.spin, name: window.__proof.text().name,
             light: +(p.lightA * 180 / Math.PI).toFixed(0),
             tab: document.querySelector('.tab[aria-selected=true]').getAttribute('data-tab') };
  });
  ok(Math.abs(r.burn - 0.33) < 0.005 && Math.abs(r.stack - 1.25) < 0.005
     && Math.abs(r.price - 0.7) < 0.005 && Math.abs(r.regGain - 0.8) < 0.005,
     'every dial came back', `burn ${r.burn} · stack ${r.stack} · price ${r.price} · reg ${r.regGain}`);
  ok(r.spin === 1, 'the toggle came back', `spin ${r.spin}`);
  ok(r.light === 42, 'the key light came back', `${r.light}°`);
  ok(r.name === 'ROUND TRIP', 'the words came back', r.name);
  ok(r.tab === 'plates', 'and the TAB did not travel with the card', `opened on "${r.tab}"`);
  /* the card is off base and the panel must say so on a reloaded card too, or a saved card looks
   * untouched the moment you open it */
  const base = await p2.evaluate(() => document.getElementById('vBase').textContent);
  ok(!/^BASE/.test(base), 'a loaded card reports its changes', `"${base}"`);
  await c2.close();
}

/* ═══ 8 · THE CHAIN DOES NOT DRIVE THE BASE CARD ══════════════════════════════════════════════
 * ⛔ "Always start as the base card" cannot be true of a card whose opening state is read off a
 *   live curve. The recorded rule — a dial absent from the URL is unclaimed, so the market drives
 *   it — is right for a card being DISPLAYED and is exactly wrong for one being MADE: with no
 *   query string all three dials were unclaimed, so a fresh forge opened wherever the market was
 *   that minute and somewhere else the next morning.
 * ⚑ The live lens is not removed, it is asked for — `?live=1`. Asserted in the source rather than
 *   against a live RPC, because a test that needs the chain to answer fails when the chain is
 *   merely slow, and this container has no route to it at all. */
console.log('\n§8 the market does not move a card that is being made');
{
  const src = await readFile(join(ROOT, 'cards', 'proof.html'), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  ok(/LIVE_DRIVES\s*=\s*Q\.get\('live'\)\s*===\s*'1'/.test(body),
     'following the chain is opt-in');
  const pushes = body.match(/push\.(burn|price|depth)\s*=/g) || [];
  const guarded = (body.match(/if\s*\(LIVE_DRIVES\s*&&\s*!AUTHORED\.\w+\)\s*push\.\w+\s*=/g) || []);
  ok(pushes.length > 0 && guarded.length === pushes.length,
     'and every push into the press is behind it', `${guarded.length}/${pushes.length} guarded`);
  /* ⚠ BOTH DIRECTIONS. "The chain never drives" is trivially satisfied by deleting the reader,
   *   which would also delete the live lens — so the watcher must still be running and still
   *   reporting what it reads. */
  ok(/LensState\.watch\(/.test(body), 'the live reader is still running');
  ok(/the chain reads /.test(body), 'and still reports what it sees');
}

/* ═══ 9 · THE PLATE SEPARATOR — FOUR PLATES OR SIX ════════════════════════════════════════════
 * Artist, 2026-08-05: *"i need my plate separator to have up to 6 plates … a toggle that just
 * creates the card with 6 plates as before."*
 * ⛔ THE ASSERTION THAT MATTERS IS THE ONE ABOUT GOING BACK. Six inks that cannot return to
 *   exactly four would mean every card in the deck quietly reprinting differently the moment the
 *   separator was added — so the four-colour card is required to be BYTE-IDENTICAL after a round
 *   trip, the same discipline the room switch is held to.
 * ⛔ AND THE CARD MUST NOT SIMPLY GET DARKER. Two more inks piled onto a subtractive stack drives
 *   everything toward black, which is what "6 plates looks worse" would actually have been. A
 *   real extended-gamut separation SPLITS: orange takes what magenta and yellow were both
 *   carrying, green what cyan and yellow shared, and that load comes off the process inks.
 *   Measured luma 91.06 -> 91.22, i.e. flat, while 69.6% of the card's pixels change. */
console.log('\n§9 the separation goes to six plates, and comes back');
{
  const { ctx, page } = await forge(1440, 900);
  const r = await page.evaluate(async () => {
    const c = window.__proof;
    c.setView(0, 0); c.writeOn(1);
    for (let i = 0; i < 20; i++) c.advance(16);
    const stat = () => {
      c.render(); const p = c.pixels(); let sum = 0;
      for (let i = 0; i < p.data.length; i += 4)
        sum += 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
      return { luma: sum / (p.data.length / 4), raw: p.data };
    };
    const four = stat();
    const nSix = c.setInks(6); const six = stat();
    c.setInks(4); const back = stat();
    let diff = 0, changed = 0;
    for (let i = 0; i < four.raw.length; i++) if (four.raw[i] !== back.raw[i]) diff++;
    for (let i = 0; i < four.raw.length; i += 4) {
      const d = Math.abs(four.raw[i] - six.raw[i]) + Math.abs(four.raw[i + 1] - six.raw[i + 1])
              + Math.abs(four.raw[i + 2] - six.raw[i + 2]);
      if (d > 6) changed++;
    }
    return { nSix, diff, changed: changed / (four.raw.length / 4) * 100,
             fourL: four.luma, sixL: six.luma, probe: c.probe().inks };
  });
  ok(r.nSix === 6 && r.probe === 4, 'setInks(6) takes, and setInks(4) puts it back');
  ok(r.diff === 0, 'four plates is BYTE-IDENTICAL after a trip through six',
     `${r.diff} bytes differ`);
  ok(r.changed > 20, 'and six plates really does reprint the card',
     `${r.changed.toFixed(1)}% of pixels changed`);
  /* ⚠ ONE-SIDED, BECAUSE ONLY ONE SIDE IS A FAILURE. The guard exists because ADDING two inks
   * to a subtractive stack drives everything toward black — that is what "6 plates looks worse"
   * would be. A two-sided bound also failed the card for getting LIGHTER, which is the split
   * working: with the halftone off the ink is laid in continuous tone and the spot plates take
   * their load off the process inks more cleanly, so six comes out 4.3 luma brighter than four.
   * Rejecting that would be rejecting the fix for succeeding. */
  ok(r.sixL > r.fourL - 4, 'without simply making it darker — it is a split, not a pile',
     `luma ${r.fourL.toFixed(2)} → ${r.sixL.toFixed(2)}`);
  await ctx.close();
}

/* ═══ 10 · THE COLLAGE GOES TO SIX SOURCES ════════════════════════════════════════════════════
 * The other half of "6 plates". ⚠ THE RECORDED FAILURE IS THE RISK HERE, NOT THE COUNT: "three
 * pigment cards at 1:1 average into ONE card — three pictures of the same kind of thing at the
 * same size is a filter, not a composition." Six sources at similar scales is that failure with a
 * bigger number, so the three new roles take scales the first three do not. Asserted the same way
 * as the inks: it must change the card, and it must come back. */
console.log('\n§10 the collage goes to six sources, and comes back');
{
  const { ctx, page } = await forge(1440, 900);
  const r = await page.evaluate(async () => {
    const c = window.__proof;
    c.setView(0, 0); c.writeOn(1);
    for (let i = 0; i < 20; i++) c.advance(16);
    const px = () => { c.render(); return c.pixels().data; };
    /* ⚠ PIN THE COUNT. This first shot used to be taken at "whatever base is", and base was
     *   three — so when base became ONE the comparison silently changed what it was comparing and
     *   reported 713,474 bytes differing. The test was right to fail; it was measuring 1 vs 3. */
    c.setPigs(3); const three = px().slice();
    c.setPigs(6); const six = px().slice();
    c.setPigs(3); const back = px().slice();
    let diff = 0, changed = 0;
    for (let i = 0; i < three.length; i++) if (three[i] !== back[i]) diff++;
    for (let i = 0; i < three.length; i += 4) {
      const d = Math.abs(three[i] - six[i]) + Math.abs(three[i + 1] - six[i + 1])
              + Math.abs(three[i + 2] - six[i + 2]);
      if (d > 6) changed++;
    }
    return { diff, changed: changed / (three.length / 4) * 100,
             pig: c.probe().pigment.length, pigs: c.probe().pigs };
  });
  ok(r.pig === 6, 'the press carries six sources', `${r.pig} on the card`);
  ok(r.diff === 0, 'three sources is BYTE-IDENTICAL after a trip through six',
     `${r.diff} bytes differ`);
  ok(r.changed > 20, 'and six really does recompose the card',
     `${r.changed.toFixed(1)}% of pixels changed`);
  /* the three extra pickers must appear with the plates they drive, and only then */
  const ui = await page.evaluate(() => {
    const chip = v => document.querySelector('#pigsChips [data-v="' + v + '"]');
    const state = () => ({ gm: document.getElementById('slotsGM').hidden,
                           six: document.getElementById('slots6').hidden,
                           cap: document.getElementById('figCap').textContent,
                           pigs: window.__proof.probe().pigs });
    chip(1).click(); const one = state();
    chip(3).click(); const three = state();
    chip(6).click(); const six = state();
    chip(1).click();
    return { one, three, six, n: document.querySelectorAll('#slots6 select').length };
  });
  /* ⛔ EACH COUNT SHOWS EXACTLY THE PICKERS THE PRESS IS READING. Six selects on a card printing
   * one of them is five chances to spend an hour on a plate that is not on the press. */
  ok(ui.one.pigs === 1 && ui.one.gm === true && ui.one.six === true && /THE CARD/.test(ui.one.cap),
     'at ONE the panel shows one picker, and calls it the card', `"${ui.one.cap}"`);
  ok(ui.three.pigs === 3 && ui.three.gm === false && ui.three.six === true
     && /FIGURE/.test(ui.three.cap),
     'at THREE ground and mid appear and the figure is a role again');
  ok(ui.six.pigs === 6 && ui.six.gm === false && ui.six.six === false && ui.n === 3,
     'at SIX the last three appear too', `${ui.n} extra pickers`);
  await ctx.close();
}

/* ═══ 11 · ALL SIX PLATES AND BOTH TOGGLES ROUND-TRIP ═════════════════════════════════════════
 * ⛔ AND AN OLD CARD MUST STILL LOAD. Every card saved before the collage went to six names only
 *   g, m and f — so requiring all six in the URL would have failed the "exact" test on all of
 *   them, silently dropping the three plates the artist chose and reprinting the seeded pick
 *   instead. The card would still render, which is what makes it dangerous. */
console.log('\n§11 six plates survive the URL, and a three-plate card still loads');
{
  const { ctx, page } = await forge(1440, 900);
  const q = await page.evaluate(async () => {
    document.querySelector('#pigsChips [data-v="6"]').click();   // six sources
    document.getElementById('inks').click();     // six inks
    await new Promise(r => setTimeout(r, 150));
    /* ⚠ BY ID, IN ROLE ORDER. querySelectorAll returns DOCUMENT order, and the figure picker is
     *   first in the markup now because at ONE plate it is the card — so a comma-list selector
     *   compares the press's ground/mid/figure against the panel's figure/ground/mid and reports
     *   the same three stems as a mismatch. */
    const ids = ['slotG', 'slotM', 'slotF', 'slotW', 'slotS', 'slotI'];
    const sels = ids.map(i => document.getElementById(i));
    sels.forEach((s, i) => { s.value = s.options[10 + i * 3].value;
      s.dispatchEvent(new Event('change', { bubbles: true })); });
    await new Promise(r => setTimeout(r, 900));
    return { search: location.search, want: sels.map(s => s.value) };
  });
  await ctx.close();

  const { ctx: c2, page: p2 } = await forge(1440, 900, q.search);
  const r = await p2.evaluate(() => {
    const p = window.__proof.probe();
    return { inks: p.inks, pigs: p.pigs,
             got: ['slotG', 'slotM', 'slotF', 'slotW', 'slotS', 'slotI']
                    .map(i => document.getElementById(i).value),
             on: p.pigment.map(u => String(u).replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '')) };
  });
  ok(r.inks === 6 && r.pigs === 6, 'both toggles came back', `${r.inks} inks · ${r.pigs} sources`);
  ok(r.got.join(',') === q.want.join(','), 'all six pickers came back',
     `${r.got.filter((v, i) => v === q.want[i]).length}/6 match`);
  ok(r.on.join(',') === q.want.join(','), 'and the PRESS is carrying those six, not a seeded pick',
     r.on.slice(0, 3).join(' · ') + ' …');
  await c2.close();

  /* the old-card path: only g, m and f named, exactly as every record saved before today */
  const old = new URLSearchParams(q.search);
  ['w', 's', 'i'].forEach(k => old.delete(k));
  const { ctx: c3, page: p3 } = await forge(1440, 900, '?' + old.toString());
  const r3 = await p3.evaluate(() => window.__proof.probe().pigment
    .map(u => String(u).replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '')));
  ok(r3.slice(0, 3).join(',') === q.want.slice(0, 3).join(','),
     'a card naming only g/m/f keeps the three plates it chose',
     r3.slice(0, 3).join(' · '));
  ok(r3.length === 6, 'and the press pads the rest from its own seed rather than refusing',
     `${r3.length} sources`);
  await c3.close();
}

/* ═══ 12 · THE NUMBER SAYS HOW THE CARD IS SERVED ═════════════════════════════════════════════
 * Artist, 2026-08-05: *"i name card and save card as a number designating where it lays in the
 * deck and how it is served (1-33, 34-100)."* That split is model v2.2 and it is load-bearing
 * everywhere else in this repo — 1–33 are hero 1/1s minted by voucher and built as live HTML
 * lenses, 34–100 are render-only field cards that tokenURI(id) draws without any mint.
 * ⚑ It is shown BEFORE the save, because typing the number IS the moment that decision is made. */
console.log('\n§12 the number says which of the two things you are making');
{
  const { ctx, page } = await forge(1440, 900);
  const r = await page.evaluate(async () => {
    const box = document.getElementById('slotNo');
    const band = () => document.getElementById('vBand').textContent;
    const set = v => { box.value = v; box.dispatchEvent(new Event('input', { bubbles: true })); };
    set(7);   const hero = band();
    set(33);  const edgeHero = band();
    set(34);  const edgeField = band();
    set(90);  const field = band();
    document.querySelector('.tab[data-tab="deck"]').click();
    const cells = [].slice.call(document.querySelectorAll('#slots .num'));
    return { hero, edgeHero, edgeField, field,
             heroCells: cells.filter(c => c.classList.contains('hero')).length,
             total: cells.length,
             counts: document.getElementById('vTaken').textContent };
  });
  ok(/1–33/.test(r.hero) && /HERO/.test(r.hero), 'a low number reads as a hero', `"${r.hero.slice(0, 34)}…"`);
  ok(/hero/i.test(r.edgeHero) && /34–100/.test(r.edgeField),
     'and the boundary lands between 33 and 34 — not off by one');
  ok(/FIELD/.test(r.field) && /without any mint/.test(r.field), 'a high number says how it is served');
  ok(r.heroCells === 33 && r.total === 100, 'the grid marks the two bands',
     `${r.heroCells} hero cells of ${r.total}`);
  ok(/33 heroes/.test(r.counts) && /67 field/.test(r.counts), 'and the deck is counted per band',
     `"${r.counts}"`);

  /* ⛔ AND THE HUNDRED SLOTS ARE ACTUALLY A GRID. Adding the per-band counts made the deck's
   * value string 311px wide in a 340px rail, and `.grp .v` was a `float:right` — a grid container
   * SHRINKS TO AVOID A FLOAT, so `.numgrid` resolved to 1px with 2px tracks while the 44px cells
   * overflowed and overlapped 5px apart. A hundred numbered slots rendered as a stacked column.
   * ⚑ Nothing errored, every control was present, and §1's visibility check passed throughout —
   *   this is the same lesson one level in: a text match cannot see a collapsed track, and neither
   *   can a check that only asks whether the element exists. Ask where the cells ARE.
   * ⚠ PROVED TO BITE: restoring `float:right` fails all three of these. */
  const grid = await page.evaluate(() => {
    const g = document.getElementById('slots');
    const cells = [].slice.call(g.children);
    const box = c => c.getBoundingClientRect();
    const w = g.getBoundingClientRect().width;
    /* a row is ten cells; cell 0 and cell 9 must be on the same line and not on top of each other */
    const a = box(cells[0]), j = box(cells[9]), nextRow = box(cells[10]);
    let overlaps = 0;
    for (let i = 0; i < 99; i++) {
      const p = box(cells[i]), q = box(cells[i + 1]);
      if (p.y === q.y && q.x < p.x + p.width - 0.5) overlaps++;
    }
    return { w, cols: getComputedStyle(g).gridTemplateColumns.split(' ').length,
             rowSame: Math.abs(a.y - j.y) < 1, wrapped: nextRow.y > a.y + 1,
             cellW: +a.width.toFixed(1), overlaps };
  });
  ok(grid.w > 200, 'the slot grid gets its own width', `${Math.round(grid.w)}px wide`);
  ok(grid.cols === 10 && grid.rowSame && grid.wrapped, 'and lays out ten to a row',
     `${grid.cols} tracks · cell ${grid.cellW}px`);
  ok(grid.overlaps === 0, 'with no cell sitting on top of the next',
     `${grid.overlaps} overlapping pairs`);
  await ctx.close();
}

/* ═══ 13 · THE CARD PRINTS ITS NAME ONCE, AND ON THE TRIM ═════════════════════════════════════
 * ⛔ THE SITE-WIDE BREAKAGE NO TEST CAUGHT. Artist, 2026-08-05: *"those changes broke
 *   everything."* Every card on the site was printing its name TWICE — once in ink, once as an
 *   emboss about 16px away — with a ghost of the title lying across the artwork.
 * ⚑ THE CAUSE IS A COUPLING, NOT A VALUE. The name's INK is laid inside `artAt` at the type
 *   element's own displaced UV; its RELIEF is read in the main body at the undisplaced one,
 *   because the crease and the marks sharing that texture belong to the sheet and must never
 *   travel. The two agreed only while the type's displacement was exactly zero. Giving the stack
 *   a lateral slide broke that silently, and removing the slide was not enough — the
 *   magnification alone still split them.
 * ⚠ AND EVERY SUITE WAS GREEN THROUGHOUT, INCLUDING THIS ONE. 44 + 68 + 10 + 147 assertions, and
 *   not one of them asked where the name lands. They all checked the FORGE, which pushes its own
 *   base and hid it; the defect lived at the renderer's DEFAULTS, which is what every other
 *   surface builds with. Test the defaults, not just the panel.
 * ⚑ MEASURED BY DIFFERENCE, which needs no threshold: render the card, rename it, and the pixels
 *   that change ARE the name. Where they lie is then a fact rather than a guess. */
console.log('\n§13 the name is struck once, on the trim, at the renderer\'s own defaults');
{
  const { ctx, page } = await forge(1440, 900);
  const r = await page.evaluate(async () => {
    const spec = await fetch('type/alphabet.json').then(r => r.json()).catch(() => null);
    const grab = u => fetch(u).then(r => r.json())
      .then(raw => (Array.isArray(raw) ? raw : raw.cards).map(c => c.art).filter(Boolean));
    const pool = (await grab('manifest.json')).concat(await grab('hero-manifest.json'));
    const cv = document.createElement('canvas');
    cv.width = 300; cv.height = 450; document.body.appendChild(cv);
    /* ⚠ NOTHING IS SET. This is the card js/card-press.js builds for the binder, the deck tiles,
     *   lens3d and the field — the renderer's defaults and no panel in sight. */
    const c = await window.HeroCard.build({ canvas: cv, seed: 7011, pigment: pool, type: spec,
                                            rarity: 'rare', name: 'AAAAAAAA' });
    if (!c) return { err: 'no build' };
    c.setView(0, 0); c.writeOn(1);
    for (let i = 0; i < 30; i++) c.advance(16);
    const shot = () => { c.render(); const p = c.pixels(); return { w: p.w, h: p.h, d: p.data }; };
    const A = shot();
    c.setText({ name: '' });                    // same sheet, same everything — only the words go
    const B = shot();
    /* readPixels is bottom-up: row 0 is the BOTTOM of the card, where the trim and name live */
    const rows = new Float64Array(A.h);
    for (let y = 0; y < A.h; y++) {
      let s = 0;
      for (let x = 0; x < A.w; x++) {
        const i = (y * A.w + x) * 4;
        s += Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]);
      }
      rows[y] = s / A.w;
    }
    const peak = rows.reduce((m, v) => Math.max(m, v), 0);
    const lit = [];
    for (let y = 0; y < A.h; y++) if (rows[y] > peak * 0.22) lit.push(y);
    /* group the lit rows into contiguous bands — two bands means two names */
    const bands = [];
    for (const y of lit) {
      const last = bands[bands.length - 1];
      if (last && y - last[1] <= 4) last[1] = y; else bands.push([y, y]);
    }
    return { h: A.h, peak: +peak.toFixed(1), bands: bands.map(b => [b[0], b[1]]),
             topOfName: bands.length ? Math.max(...bands.map(b => b[1])) / A.h : 0 };
  });
  ok(!r.err, 'a card builds at the renderer defaults', r.err || 'built');
  ok(r.peak > 2, 'the name is actually printed', `peak row difference ${r.peak}`);
  ok(r.bands.length === 1, 'and it appears in exactly ONE band — not printed twice',
     `${r.bands.length} band(s): ${r.bands.map(b => b[0] + '–' + b[1]).join(', ')}`);
  /* bottom-up: the name lives in the lower fifth of the card, on the trim under the art window */
  ok(r.topOfName < 0.30, 'in the trim at the foot of the card, not across the artwork',
     `highest name row at ${(r.topOfName * 100).toFixed(0)}% up from the bottom`);
  await ctx.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
srv.close();
process.exit(fail ? 1 : 0);

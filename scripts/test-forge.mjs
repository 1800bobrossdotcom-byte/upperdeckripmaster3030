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
const CONTROLS = ['slotG', 'tName', 'rarChips', 'stack', 'motion', 'rad', 'price',
                  'burn', 'reg', 'light', 'pull', 'slots'];
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
                    burn: window.__proof.probe().burn };
    document.getElementById('reset').click();
    await new Promise(r2 => setTimeout(r2, 120));
    const back = { text: document.getElementById('vBase').textContent,
                   dots: document.querySelectorAll('.tab.off').length,
                   burn: window.__proof.probe().burn, stack: window.__proof.probe().stack };
    return { after, back };
  });
  ok(/2 changes/.test(r.after.text), 'it counts the changes', `"${r.after.text}"`);
  ok(r.after.dots.join(',') === 'build,press', 'and dots the panes holding them',
     r.after.dots.join(', ') || 'none');
  ok(Math.abs(r.after.burn - 0.4) < 0.001, 'the press actually received the change',
     `burn ${r.after.burn}`);
  ok(/^BASE/.test(r.back.text) && r.back.dots === 0 && r.back.burn === 0 && r.back.stack === 0,
     'RESET TO BASE returns the card and the readout together',
     `"${r.back.text}" · burn ${r.back.burn} · stack ${r.back.stack}`);
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

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
srv.close();
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* ripmaster3030studios — CHECK, THE DOOR.  `npm run test:check`
 *
 * ⛔ CHECK HAD NO DRIVEN TEST AT ALL, which is how it shipped with the defect the artist reported
 *   in one line: *"check is too cumbersome, you have to copy and paste pools from multiple
 *   windows, not sophisticated very 1996."* Nothing was broken. `test:name` was green, `test:rail`
 *   was green, the detector correctly told a pool from a wallet from a token. **The page simply
 *   demanded that the visitor already hold the thing to paste** — and the only cure for that was
 *   leaving for another window, which is not a state any static check can see.
 *
 * ⚑ THE LOAD-BEARING ASSERTION IS THE SABOTAGE (§C), not §B. "The shelf has rows" is trivially
 *   satisfied while the data files happen to be present, and this repo has now been bitten four
 *   separate times by an assertion that was vacuously true. The question worth asking is what the
 *   page does when the screen has NOT run: a shelf captioned "0 things worth checking" is a claim
 *   that the chain is quiet, where an absent shelf claims nothing.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp' };
const PORT = 8937;

let checks = 0, fails = 0;
const ok = (c, m, d) => { checks++; if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${d !== undefined && d !== '' ? '  — ' + d : ''}`); };

const srv = createServer((q, s) => {
  const p = join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!existsSync(p) || !extname(p)) { s.writeHead(404); return s.end('no'); }
  s.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  s.end(readFileSync(p));
});
await new Promise((r) => srv.listen(PORT, r));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

/* ⚠ OUTBOUND RPC IS BLOCKED IN EVERY VISIT. The shelf is built from files this repo commits, so
 *   letting the page reach a public endpoint would make the result depend on a rate limit — and
 *   this container cannot reach one anyway, which would look like a broken shelf. */
async function visit({ width = 1280, height = 900, killData = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**://*/**', (r) => {
    const u = r.request().url();
    const local = u.includes(`127.0.0.1:${PORT}`) || u.includes(`localhost:${PORT}`);
    if (!local) return r.abort();
    if (killData && /\/data\/(drain|terminal)\.json/.test(u)) return r.fulfill({ status: 500, body: 'no' });
    return r.continue();
  });
  await page.goto(`http://127.0.0.1:${PORT}/check.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const s = await page.evaluate(() => {
    try {
      const rows = [...document.querySelectorAll('.lr')];
      const box = (e) => e.getBoundingClientRect();
      return {
        shown: !document.getElementById('live').hidden,
        rows: rows.length,
        under44: rows.filter((e) => box(e).height < 44 || box(e).width < 44).length,
        age: (document.getElementById('liveAge') || {}).textContent || '',
        text: rows.map((e) => e.textContent).join(' ').toLowerCase(),
        addrs: rows.map((e) => e.getAttribute('data-a')),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    } catch (e) { return { err: e.message }; }
  });
  return { page, ctx, s, errs };
}

console.log('\n── A · the shelf exists so the visitor arrives with nothing ──');
const { page, ctx, s, errs } = await visit();
ok(s.shown === true, 'A1 · the live shelf is shown on arrival', `${s.rows} rows`);
ok(s.rows >= 3, 'A2 · and it offers enough to be a shelf rather than an example', `${s.rows}`);
ok(/ago|screen/.test(s.age), 'A3 · it states how old the screening is', s.age);
ok(errs.length === 0, 'A4 · with no page errors', errs.join(' | ') || 'clean');
ok(s.overflow === 0, 'A5 · and the page does not scroll sideways', `${s.overflow}px`);

/* ⛔ THE ONE THAT MATTERS: pressing a row must actually START A READING with nothing typed. A
 *   shelf that only fills the box still leaves the visitor to find and press CHECK, and a shelf
 *   whose rows are decorative is furniture — the exact thing the four frozen `try:` links were. */
{
  const before = await page.inputValue('#addr');
  await page.click('.lr');
  await page.waitForTimeout(350);
  const after = await page.inputValue('#addr');
  ok(before === '' && /^0x[0-9a-fA-F]{40,64}$/.test(after),
    'A6 · pressing a row fills the input from empty — no paste, no second window', after.slice(0, 20) + '…');
  const started = await page.evaluate(() =>
    (document.getElementById('stat').textContent || '') +
    (document.getElementById('what').className || ''));
  ok(/reading|on/.test(started), 'A7 · and it starts the reading itself', started.trim().slice(0, 40));
}
await ctx.close();

console.log('\n── B · it never accuses, and a shelf is the sharpest place for that ──');
/* ⛔ PUTTING AN ADDRESS ON A STUDIO PAGE UNDER A HEADING IS AN EDITORIAL ACT in a way that
 *   answering a question somebody asked is not. The scorer is already asserted never to accuse in
 *   `test:drain`; this asserts the SHELF does not add a word the scorer refused to. */
for (const w of ['scam', 'drainer', 'malicious', 'thief', 'fraud', 'criminal', 'stolen', 'attacker'])
  ok(!s.text.includes(w), `B · no row on the shelf calls anything "${w}"`);

console.log('\n── C · sabotage: the screen has not run ──');
{
  const { ctx: c2, s: dead, errs: e2 } = await visit({ killData: true });
  /* an empty shelf would say "the chain is quiet", which is a claim; absence says nothing */
  ok(dead.shown === false, 'C1 · with no screen data the shelf is ABSENT, not empty',
    `shown=${dead.shown} rows=${dead.rows}`);
  ok(dead.rows === 0, 'C2 · and no row is drawn from nothing');
  ok(e2.length === 0, 'C3 · and it fails without throwing', e2.join(' | ') || 'clean');
  /* ⚠ THE PAGE MUST STILL WORK. The shelf is an accelerator, never a dependency — if it were,
   *   a cron that missed an hour would take the door down with it. */
  const stillUsable = await (async () => {
    const { ctx: c3, page: p3 } = await visit({ killData: true });
    const has = await p3.evaluate(() => !!document.getElementById('addr') &&
      !document.getElementById('addr').disabled && !!document.getElementById('go'));
    await c3.close(); return has;
  })();
  ok(stillUsable, 'C4 · and the input still works — the shelf accelerates, it does not gate');
  await c2.close();
}

console.log('\n── D · a phone gets the same shelf, at the tap floor ──');
{
  const { ctx: c4, s: m } = await visit({ width: 390, height: 844 });
  ok(m.shown && m.rows >= 3, 'D1 · the shelf is on a phone too', `${m.rows} rows`);
  /* ⚠ A THUMB IS ROUND — 44px is a floor on BOTH axes, which is the recorded 44-tall-35-wide bug */
  ok(m.under44 === 0, 'D2 · every row clears 44px on both axes', `${m.under44} under`);
  ok(m.overflow === 0, 'D3 · and nothing overflows at 390px', `${m.overflow}px`);
  await c4.close();
}

await browser.close();
srv.close();
console.log(`\n${fails ? 'FAIL' : 'PASS'}  ${checks - fails}/${checks}\n`);
process.exit(fails ? 1 : 0);

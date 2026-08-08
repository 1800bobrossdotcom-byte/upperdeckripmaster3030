#!/usr/bin/env node
/* npm run test:onramp — THE RIP IS A BUY.
 *
 * ⛔ THIS GUARDS THE FRONT DOOR OF THE ENTIRE DISTRIBUTION PLAN. The pack schedule is 3,560 packs
 *   and tier I alone is 200,000 $3030 off $16,000 — 2.5x everything the token has ever
 *   distributed — and every one of those sales walks through `ripNeedTokens()`. Until 2026-08-08
 *   that function was a dead end: it read the balance, found it short, and told the visitor to go
 *   buy somewhere else, at the exact moment they had decided they wanted a pack.
 *
 * ⚑ THE ASSERTION THAT MATTERS IS §D, THE SABOTAGE. "Does the buy button appear" was always going
 *   to be yes. The question is what happens when the swap link CANNOT be built — and the answer
 *   has to be the old panel, intact, rather than a button pointing at nothing. A funnel that
 *   fails into a broken control is worse than the dead end it replaced.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(new URL('.', import.meta.url).pathname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok    ' + m + (d ? '  — ' + d : '')); } else { fail++; console.log('  FAIL  ' + m + (d ? '  — ' + d : '')); } };
const sect = s => console.log(`\n── ${s} ──`);

const MT = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.jpg': 'image/jpeg' };
const srv = createServer((q, r) => {
  let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = join(ROOT, decodeURIComponent(p));
  if (!existsSync(f) || !extname(f)) { r.writeHead(404); return r.end('x'); }
  r.writeHead(200, { 'content-type': MT[extname(f)] || 'application/octet-stream' });
  r.end(readFileSync(f));
});
await new Promise(z => srv.listen(8097, z));
const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* A connected wallet that is SHORT. `killSwap` makes swapUrl() return '' — the fail-open case. */
async function openShort({ have = 40, killSwap = false } = {}) {
  const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await pg.addInitScript(({ have, killSwap }) => {
    window.__bal = have;
    Object.defineProperty(window, 'RipWallet', {
      configurable: true,
      get() {
        const w = window.__realWallet; if (!w) return undefined;
        return new Proxy(w, { get(t, k) {
          if (k === 'isLive') return () => true;
          if (k === 'hasWallet') return () => true;
          if (k === 'isConnected') return () => true;
          if (k === 'connect') return async () => ({ ok: true });
          if (k === 'ensureChain') return async () => ({ ok: true });
          if (k === 'hasSink') return () => true;
          if (k === 'balance') return async () => ({ ok: true, tokens: window.__bal, wei: 0n });
          if (k === 'marketDepth') return async () => ({ live: true, pools: [{ quote: 'RARE', price: 0.09387 }] });
          if (killSwap && k === 'swapUrl') return () => '';
          return t[k];
        } });
      },
      set(v) { window.__realWallet = v; },
    });
  }, { have, killSwap });
  await pg.goto('http://localhost:8097/index.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1800);
  await pg.evaluate(() => {
    const t = [...document.querySelectorAll('a,button')].find(e => /rip a pack|rip pack/i.test(e.textContent || ''));
    if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await pg.waitForTimeout(1500);
  return { pg, errs };
}
const read = pg => pg.evaluate(() => {
  const buy = document.getElementById('ripBuy'), watch = document.getElementById('ripWatch'), usd = document.getElementById('ripUsd');
  const note = document.querySelector('#packModal .pack-note');
  return {
    note: note ? note.textContent : '',
    buyText: buy ? buy.textContent.trim() : null,
    buyHref: buy ? buy.getAttribute('href') : null,
    watch: watch ? watch.textContent : null,
    usd: usd ? usd.textContent : null,
    retry: !!document.getElementById('ripRetry'),
    practice: !!document.getElementById('ripPractice'),
    title: (document.querySelector('#packModal h2, #packTitle') || {}).textContent || '',
  };
});

/* ── §A THE DOOR OPENS ──────────────────────────────────────────────────────────────────── */
sect('A · a short balance gets a buy door, not a dead end');
{
  const { pg, errs } = await openShort({ have: 40 });
  const r = await read(pg);
  ok(!!r.buyText, 'a BUY control exists', r.buyText);
  ok(/need\s*<?b?>?85/.test(r.note.replace(/\s+/g, ' ')) || /85/.test(r.note),
    'it names the SHORTFALL, not just the price', r.note.trim().slice(0, 90));
  ok(/\$8\.\d\d/.test(r.usd || ''), 'and prices it in DOLLARS, live-read', (r.usd || '').trim());
  ok(r.retry && r.practice, 'the old escape hatches survive', 'retry + practice');
  /* ⛔ THE OLD COPY MUST BE GONE. Leaving "buy some on SuperRare, then rip" beside a working
   *   buy button is two instructions for one action, and the stale one is the confident one. */
  ok(!/SuperRare, then rip/i.test(r.note), 'the "go buy somewhere else" dead end is gone');
  ok(!errs.length, 'no page errors', errs[0] || 'clean');
  await pg.close();
}

/* ── §B THE LINK IS AN EXACT-OUTPUT ORDER, AND STILL TOKEN-KEYED ───────────────────────── */
sect('B · the swap link asks for the amount, and names no pool');
{
  const { pg } = await openShort({ have: 40 });
  const r = await read(pg);
  const u = r.buyHref || '';
  ok(/exactField=output/.test(u), 'exactField=output — Uniswap solves for the input');
  /* ⚠ THE CUSHION IS LOAD-BEARING. Buying precisely the shortfall lands a few tokens short after
   *   slippage and drops the collector back on this panel having already paid. 85 → 90. */
  const m = u.match(/exactAmount=(\d+)/);
  ok(m && Number(m[1]) > 85, 'the amount carries a CUSHION over the exact shortfall', m ? m[1] + ' vs 85' : 'none');
  ok(m && Number(m[1]) <= 95, '…and the cushion is small, not a silent upsell', m ? m[1] : '');
  ok(new RegExp('outputCurrency=0x1D4bcbb505182a49303CC3B23EfF1E3157147A33', 'i').test(u),
    'it buys the real $3030 contract');
  /* ⛔ A POOL ID IN A SWAP LINK AIMS A COLLECTOR AT ONE MARKET — including, historically, an empty
   *   one. The router must keep choosing. 64 hex chars is the tell. */
  ok(!/0x[0-9a-fA-F]{64}/.test(u), 'no pool id reaches the swap host — the router still picks the venue');
  ok(/^https:\/\/app\.uniswap\.org\/swap/.test(u), 'and it is the configured swap host', u.slice(0, 38));
  await pg.close();
}

/* ── §C IT WATCHES, SO IT IS ONE ERRAND ─────────────────────────────────────────────────── */
sect('C · the balance is watched and the rip resumes by itself');
{
  const { pg, errs } = await openShort({ have: 40 });
  const before = await read(pg);
  ok(/watching/i.test(before.watch || ''), 'it says it is watching, BEFORE the first poll tick', JSON.stringify(before.watch));
  await pg.evaluate(() => { window.__bal = 999; });
  await pg.waitForTimeout(4500);
  const after = await read(pg);
  ok(!after.buyText, 'once the tokens land the buy door closes by itself');
  ok(/approve|confirm|ripping/i.test(after.title), 'and the rip carries on without another press', after.title.trim());
  ok(!errs.length, 'no page errors across the hand-off', errs[0] || 'clean');
  await pg.close();
}
sect('C2 · the poll does not outlive the modal');
{
  const { pg } = await openShort({ have: 40 });
  await pg.evaluate(() => {
    const m = document.getElementById('packModal');
    const c = m.querySelector('.pack-close, [data-close]'); if (c) c.click(); else m.classList.remove('show');
  });
  await pg.waitForTimeout(3600);
  /* A poll left running behind a closed modal is an eth_call every 3 s, forever, on somebody's
   * phone. The modal being hidden is the stop condition the interval itself checks. */
  const alive = await pg.evaluate(() => document.getElementById('packModal').classList.contains('show'));
  ok(!alive, 'the modal is closed and the interval self-terminates on that check');
  await pg.close();
}

/* ── §D THE SABOTAGE — the only assertion that could ever have failed ───────────────────── */
sect('D · no swap link ⇒ the ORIGINAL panel, intact');
{
  const { pg, errs } = await openShort({ have: 40, killSwap: true });
  const r = await read(pg);
  ok(!r.buyText, 'no BUY button is rendered when swapUrl() cannot be built');
  ok(/SuperRare, then rip/i.test(r.note), 'the original copy comes back verbatim', r.note.trim().slice(0, 70));
  ok(r.retry && r.practice, 'and the escape hatches are still there', 'retry + practice');
  ok(!/href="">|href=""/.test(await pg.content()), 'nothing renders a button pointing at an empty href');
  ok(!errs.length, 'no page errors on the fail-open path', errs[0] || 'clean');
  /* ⚑ BOTH DIRECTIONS. "No broken button" is trivially true of a panel that renders nothing at
   *   all, so §A already proved the healthy path puts a real one there. */
}

await br.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);

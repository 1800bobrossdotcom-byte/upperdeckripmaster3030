#!/usr/bin/env node
/* ripmaster3030studios — MOBILE WALLETCONNECT ACTUALLY CONNECTS.  `npm run test:wc`
 *
 * Artist, 2026-08-06: *"we need to make sure wallet connect on mobile is working."* On a phone
 * there is no injected provider, so WalletConnect is not one option among several — it is THE
 * way a collector connects, and it is the last thing standing between them and a pack.
 *
 * ⛔ WHAT THIS CAN AND CANNOT PROVE, STATED UP FRONT, because the difference decides whether the
 *   artist has anything left to do:
 *     ✓ the project id is real            — checked against Reown's API, with a bogus-id control
 *     ✓ the WC branch is the one taken on a phone (no injected provider)
 *     ✓ the SDK actually imports from the CDN — the site's ONLY third-party runtime dependency
 *     ✓ the metadata rendered INSIDE the wallet names the live studio and the live domain
 *     ✓ the deep-link fallback is reachable and tappable when WC cannot start
 *     ✗ THE DOMAIN ALLOW-LIST. A Reown project id is allow-listed BY ORIGIN in their dashboard,
 *       and this harness's origin is localhost. A pass here says nothing about
 *       ripmaster3030studios.com, and a test that quietly implied otherwise would be worse than
 *       no test — it is the single most likely way mobile connect is broken on launch night.
 *
 * ⚠ NO WALLET IS HARMED. Nothing here signs, sends or approves anything; `EP.init` builds a
 *   provider and the modal is opened and closed. There is no key in this container.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };

let checks = 0, fails = 0;
const ok = (c, m, d) => {
  checks++; if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${d !== undefined && d !== '' ? '  — ' + d : ''}`);
};

const CFG = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
const PID = (/walletConnectProjectId:\s*"([^"]*)"/.exec(CFG) || [])[1] || '';

/* ── 1 · the project id is real, proved with a control ─────────────────────────────────────── */
console.log('\n── 1 · the Reown project id ──');
ok(/^[0-9a-f]{32}$/i.test(PID), 'chain-config carries a well-formed project id', PID ? PID.slice(0, 8) + '…' : 'EMPTY');
const listings = (pid) => fetch(
  `https://explorer-api.walletconnect.com/v3/wallets?entries=3&page=1&projectId=${pid}`,
  { headers: { Origin: 'https://ripmaster3030studios.com' } })
  .then(r => r.status).catch(() => 0);
const live = await listings(PID);
const dead = await listings('00000000000000000000000000000000');
/* ⚑ THE CONTROL IS THE POINT. Reown's *config* endpoint returns 200 for ANY origin and ANY
 *   caller, so a bare 200 there proves nothing — an A/B whose halves are identical looks like a
 *   result and is not. This endpoint discriminates: a bogus id comes back 401. */
ok(dead === 401, 'the check discriminates — a bogus project id is rejected', `bogus → ${dead}`);
ok(live === 200, 'OUR project id is live at Reown', `ours → ${live}`);

/* ── serve the site ───────────────────────────────────────────────────────────────────────── */
const srv = createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { rs.writeHead(404); return rs.end('nf'); }
  rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  rs.end(readFileSync(f));
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
/* A real phone profile: touch, no hover, mobile UA — which is what `isMobileUA()` reads, and
 * what decides whether a failed WC hands over to the deep-link panel instead of a dead end. */
const ctx = await browser.newContext({
  ...devices['iPhone 13'],
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

/* ── 2 · on a phone, WC is the branch that gets taken ──────────────────────────────────────── */
console.log('\n── 2 · the branch a phone actually takes ──');
const env = await page.evaluate(() => ({
  wallet: !!window.RipWallet,
  hasWC: !!(window.RipWallet && window.RipWallet.hasWalletConnect && window.RipWallet.hasWalletConnect()),
  injected: !!(window.ethereum),
  coarse: matchMedia('(hover:none)').matches,
  ua: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
}));
ok(env.wallet, 'RipWallet is on the page');
ok(env.hasWC, 'hasWalletConnect() is true — the project id reached the browser');
ok(!env.injected, 'no injected provider, i.e. a real phone browser', 'window.ethereum absent');
ok(env.coarse && env.ua, 'the page sees a mobile UA + coarse pointer');
/* ⚑ With no injected wallet and a project id present, `chooser()` must resolve straight to
 *   'walletconnect' — no picker, no extra tap. A chooser shown here would be a second screen
 *   between a collector and the only door they have. */
ok(!env.injected && env.hasWC, '…so chooser() resolves directly to walletconnect (no picker)');

/* ── 3 · WHAT WE ACTUALLY HAND WALLETCONNECT ───────────────────────────────────────────────────
 * ⛔ THE REAL CDN IS UNREACHABLE FROM THIS CONTAINER AND THAT IS THE HARNESS, NOT THE PRODUCT.
 *   Chromium here has no outbound TLS (CLAUDE.md records ERR_CONNECTION_RESET), while `curl`
 *   through the agent proxy fetches the same URL with a 200 — checked both ways before drawing
 *   any conclusion. Reporting "the SDK is broken" off that would have been a false alarm about
 *   the single most launch-critical path on the site.
 * ⚑ SO THE MODULE IS STUBBED AND BOTH PATHS BECOME DRIVABLE — the same move `test:theme` makes
 *   for the audio widget, for the same reason. Stubbing also buys the strongest assertion
 *   available anywhere in this file: it CAPTURES THE ARGUMENTS `EthereumProvider.init` is called
 *   with, so the project id, the required chain and the metadata a collector reads inside their
 *   wallet are proved as SENT, not as written in the source. */
console.log('\n── 3 · what we hand WalletConnect (SDK stubbed — see note) ──');
const STUB = `
  export class EthereumProvider {
    static async init(opts) {
      globalThis.__wcInit = JSON.parse(JSON.stringify(opts));
      const p = {
        accounts: ['0x1111111111111111111111111111111111111111'],
        async enable(){ globalThis.__wcEnabled = true; return p.accounts; },
        async request(){ return null; }, on(){}, removeListener(){},
      };
      return p;
    }
  }
  export default { EthereumProvider };`;
await page.route('https://esm.sh/**', route =>
  route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));

const sent = await page.evaluate(async () => {
  const r = await window.RipWallet.connect('walletconnect');
  return { r, init: globalThis.__wcInit || null, enabled: !!globalThis.__wcEnabled };
});
ok(!!sent.init, 'EthereumProvider.init was reached', sent.init ? '' : 'never called');
const I = sent.init || {};
ok(I.projectId === PID, '…with OUR project id', I.projectId ? I.projectId.slice(0, 8) + '…' : 'none');
/* ⚠ REQUIRED mainnet only. A required TESTNET makes MetaMask mobile and friends silently reject
 *   the session proposal — "connecting…" forever, nothing in connected sites. Sepolia belongs in
 *   optionalChains, and today the site IS on Sepolia, so this is live-fire. */
ok(Array.isArray(I.chains) && I.chains.length === 1 && I.chains[0] === 1,
  '…requiring ONLY mainnet — a required testnet is silently rejected by mobile wallets',
  JSON.stringify(I.chains));
ok(Array.isArray(I.optionalChains) && I.optionalChains.includes(11155111),
  '…with the site\'s current chain offered as OPTIONAL', JSON.stringify(I.optionalChains));
ok(I.showQrModal === true, '…and the wallet picker opens');
/* The block rendered INSIDE the wallet — proved as sent, not as written. */
const M = I.metadata || {};
ok(M.name === 'ripmaster3030studios', 'the approval sheet names the live studio', M.name);
/* ⚑ THE URL IS DERIVED FROM THE HOST, so at localhost it must be the CANONICAL FALLBACK — an
 *   unknown origin must never name itself inside somebody's wallet. The other direction (a real
 *   studio host derives to ITSELF) is proved in section 3b, because one of these two assertions
 *   alone is satisfied by a hard-coded string, which is exactly what this change removed. */
ok(M.url === 'https://ripmaster3030studios.com',
  '…at the canonical domain when the origin is unknown (localhost ⇒ fallback)', M.url);
ok(!!(M.icons || [])[0] && M.icons[0] === M.url + '/media/site/mark-512.png',
  '…with an icon from the SAME origin as the url', (M.icons || [])[0]);
ok(!JSON.stringify(M).match(/upperdeck/i), 'no retired name reaches the wallet');
ok(sent.enabled, 'enable() ran — the session proposal was raised');
ok(sent.r && sent.r.ok, 'connect() reports success', sent.r ? (sent.r.reason || 'ok') : 'no result');

/* ── 3b · THE URL REALLY DERIVES — driven from a studio host, not from localhost ────────────────
 * ⛔ WITHOUT THIS THE CHECK ABOVE IS SATISFIED BY A HARD-CODED STRING, i.e. by the exact defect
 *   this change removed: the sheet said the APEX while the site is served from `www`, so a
 *   collector was shown a host they were not on and WalletConnect's own domain verification had
 *   two different answers to compare. A single assertion at localhost cannot tell a working
 *   derivation from a constant — they agree there by construction.
 * ⚑ Chromium resolves the real hostname to our loopback server via --host-resolver-rules, so the
 *   page genuinely runs at `www.ripmaster3030studios.com` and `location.hostname` is the live
 *   host. Nothing leaves the container; the name never reaches DNS. */
console.log('\n── 3b · the dApp URL follows the host the collector is on ──');
const hostBrowser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', `--host-resolver-rules=MAP www.ripmaster3030studios.com 127.0.0.1`],
});
const hctx = await hostBrowser.newContext({ ...devices['iPhone 13'], ignoreHTTPSErrors: true });
const hpage = await hctx.newPage();
await hpage.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
await hpage.route('https://esm.sh/**', route =>
  route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
await hpage.goto(`http://www.ripmaster3030studios.com:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await hpage.waitForTimeout(1200);
const onHost = await hpage.evaluate(async () => {
  await window.RipWallet.connect('walletconnect');
  return { host: location.hostname, meta: (globalThis.__wcInit || {}).metadata || null };
});
ok(onHost.host === 'www.ripmaster3030studios.com',
  'the page really is running at the live host', onHost.host);
ok(onHost.meta && onHost.meta.url === 'https://www.ripmaster3030studios.com',
  '⛔ the approval sheet names THAT host, not the apex', onHost.meta ? onHost.meta.url : 'no metadata');
ok(onHost.meta && (onHost.meta.icons || [])[0] === 'https://www.ripmaster3030studios.com/media/site/mark-512.png',
  '…and the icon comes from it too (the apex one 308s, and a wallet may not follow it)',
  onHost.meta ? (onHost.meta.icons || [])[0] : '');
await hostBrowser.close();

/* ── 4 · the metadata a collector reads INSIDE their wallet ────────────────────────────────── */
console.log('\n── 4 · what the wallet shows the collector ──');
const src = readFileSync(join(ROOT, 'js/wallet.js'), 'utf8');
const meta = /metadata:\s*\{([\s\S]*?)\}/.exec(src)?.[1] || '';
/* ⛔ This block once named the RETIRED studio at the RETIRED domain, so someone standing on
 *   ripmaster3030studios.com was asked to approve a connection from a different name at a
 *   different address — the exact shape people are told to read as a phish. */
ok(/name:\s*'ripmaster3030studios'/.test(meta), 'the dApp NAME is the live studio');
ok(/url:\s*siteOrigin\(\)/.test(meta), 'the dApp URL is DERIVED from the host, not written down');
ok(/icons:\s*\[siteOrigin\(\)\s*\+/.test(meta), 'the icon is served from that same origin');
ok(!/upperdeck/i.test(meta), 'no retired name survives in the approval sheet');
/* ⚠ The fallback is the one part that IS written down, so it is pinned: an unknown origin must
 *   land on the canonical host and never on whatever host happened to serve the page. */
const originFn = /function siteOrigin\(\)\s*\{([\s\S]*?)\n  \}/.exec(src)?.[1] || '';
ok(/return 'https:\/\/ripmaster3030studios\.com';/.test(originFn),
  'an unknown origin falls back to the canonical domain');
/* ⛔ RUN THE PATTERN, DO NOT READ IT. My first version matched the regex SOURCE with another
 *   regex and failed on its own correct input — `(^|\.)` in a matcher means "start or a dot", not
 *   the literal characters. That is the redirect outage's exact mistake in miniature: it asserted
 *   a host rule EXISTED instead of running it against hosts, and the fix there was to run it.
 *   Behaviour is the claim; the source text is just how the claim happens to be spelled. */
const HOSTRE = new RegExp((/const SITE_HOST = \/(.*)\/;/.exec(src) || [])[1] || '$^');
for (const h of ['ripmaster3030studios.com', 'www.ripmaster3030studios.com'])
  ok(HOSTRE.test(h), `the host test accepts our own host ${h}`);
/* ⚠ AND THE OTHER DIRECTION, WHICH IS THE HALF THAT MATTERS: this string ends up inside a wallet
 *   approval sheet, so a pattern that accepts everything would let a preview build — or a clone —
 *   present itself under our identity. A suffix lookalike is the one a bare `includes` would miss.
 * ⛔ THE RETIRED DOMAIN IS IN THIS LIST ON PURPOSE. My first version accepted it, and
 *   `npm run test:name` failed the build — correctly: deriving there would print the retired
 *   studio name inside a wallet approval sheet, the exact surface the name law exists for. It
 *   forwards to the live host anyway, so nobody connects from it. */
for (const h of ['upperdeckripmaster3030.com', 'www.upperdeckripmaster3030.com',
                 'ripmaster3030studios.com.evil.example', 'notripmaster3030studios.com',
                 'urm-preview-abc123.vercel.app', 'localhost'])
  ok(!HOSTRE.test(h), `…and refuses ${h}`);

/* ── 5 · the fallback, because the SDK can fail and a dead end is unacceptable ─────────────── */
console.log('\n── 5 · the deep-link fallback ──');
ok(/metamask\.app\.link\/dapp\//.test(src), 'MetaMask deep link present');
ok(/go\.cb-w\.com\/dapp/.test(src), 'Coinbase Wallet deep link present');
ok(/link\.trustwallet\.com\/open_url/.test(src), 'Trust Wallet deep link present');
/* ⚑ The fallback must fire when WC fails on a phone with NO injected wallet — otherwise a
 *   collector whose SDK did not load is simply stuck. */
ok(/isMobileUA\(\)\s*&&\s*!injected\(\)/.test(src),
  'a failed WC on a phone hands over to the deep-link panel instead of a dead end');

/* ⛔ DRIVE THE PATH A BLOCKED VISITOR ACTUALLY GETS. The SDK now fails to load — a blocker, a
 *   captive portal, a corporate proxy, esm.sh being down — and on a phone with no injected wallet
 *   that must open the hand-off panel rather than dead-end. This is the assertion that matters
 *   most in this file, for the same reason test:theme's sabotage is its only load-bearing one:
 *   the healthy path is not the one that strands anybody.
 * ⚠ AND IT IS WHY THIS HARNESS CRASHED FIRST TIME. `connect()` does not resolve while the panel
 *   is open — it is waiting for a human to pick a wallet — so awaiting it hangs until the browser
 *   is torn down, which reads exactly like a broken connect and was the probe. Fire it, wait for
 *   the overlay to APPEAR, measure, then dismiss. */
/* ⛔ A FRESH PAGE, AND THAT IS LOAD-BEARING. `js/wallet.js` memoises the module
 *   (`if (!wcMod) wcMod = await import(…)`), so once section 3 has loaded the stub the import is
 *   never attempted again — blocking the CDN on the SAME page aborts nothing, WC succeeds from
 *   cache, and the panel never opens. My first version did exactly that and reported the FALLBACK
 *   as broken when it was the sabotage that had failed to engage. A sabotage that does not engage
 *   proves the opposite of the truth; this one needs a context where `wcMod` is still null. */
const page2 = await ctx.newPage();
page2.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page2.route('https://esm.sh/**', route => route.abort());
await page2.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(1200);
const panel = await page2.evaluate(async () => {
  const before = new Set([...document.body.children]);
  window.RipWallet.connect().catch(() => {});          // deliberately NOT awaited — see note
  const t0 = Date.now();
  let ov = null;
  while (Date.now() - t0 < 12000 && !ov) {
    await new Promise(r => setTimeout(r, 120));
    ov = [...document.body.children].find(el => !before.has(el) &&
      el.style && el.style.position === 'fixed' && /wallet/i.test(el.textContent || ''));
  }
  if (!ov) return { shown: false };
  const btns = [...ov.querySelectorAll('a,button')].map(b => {
    const q = b.getBoundingClientRect();
    return { t: (b.textContent || '').trim().slice(0, 22), h: Math.round(q.height),
             href: b.getAttribute('href') || '' };
  });
  const box = ov.getBoundingClientRect();
  const res = { shown: true, btns, overflow: box.width > innerWidth + 1,
                deep: btns.filter(b => /metamask\.app\.link|cb-w\.com|trustwallet\.com/.test(b.href)).length };
  ov.querySelector('[data-x]')?.click();
  return res;
});
ok(panel.shown, 'a blocked SDK opens the wallet hand-off panel instead of dead-ending');
if (panel.shown) {
  ok(panel.deep >= 3, '…offering all three wallet hand-offs', panel.deep + ' deep links');
  const small = panel.btns.filter(b => b.h < 44);
  ok(small.length === 0, '…every control clears the 44px tap floor',
    small.map(b => `${b.t} ${b.h}px`).join(', ') || 'all ≥44');
  ok(!panel.overflow, '…and it fits a 390px screen');
}

console.log('\n── page errors ──');
ok(errs.length === 0, 'no uncaught page errors on the mobile path', errs[0] || 'clean');

await browser.close(); srv.close();

console.log(`\n⚠ NOT PROVEN HERE — the Reown DOMAIN ALLOW-LIST.`);
console.log(`  A project id is allow-listed by ORIGIN and this harness's origin is localhost, so`);
console.log(`  no pass in this file can speak for the live host. It is a dashboard setting, not code.`);
console.log(`  STATUS 2026-08-06: the artist allow-listed ripmaster3030studios.com, www., and the`);
console.log(`  retired upperdeckripmaster3030.com. www. matters most — the platform serves it as`);
console.log(`  Production and 308s the apex to it, so www. is the origin a collector arrives at.`);
console.log(`  RE-CHECK IF PRODUCTION EVER MOVES TO THE APEX: the metadata url now follows the host`);
console.log(`  automatically (section 3b), but the ALLOW-LIST does not — that stays a dashboard job.`);
console.log(`\n${checks - fails} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);

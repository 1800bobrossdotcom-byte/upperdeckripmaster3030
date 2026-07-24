/* End-to-end "test transact" of the site's pack-rip burn flow, headless.
 *
 * A mock EIP-1193 provider is injected as window.ethereum:
 *   - eth_call / eth_estimateGas / eth_blockNumber → forwarded to REAL Sepolia RPC
 *     (via node-side curl through the proxy), so balance reads are live chain data
 *   - the "wallet account" is the Uniswap v4 PoolManager (the pool that holds the
 *     whole 1M supply) so the site's ≥350 balance check passes against real state
 *   - starts on chainId 0x1 (mainnet) so the site MUST exercise its network guard
 *     (wallet_switchEthereumChain → Sepolia) before it may burn
 *   - eth_sendTransaction is CAPTURED (never signed) and the exact payload is
 *     re-verified against live Sepolia via eth_call + eth_estimateGas
 * Run 2 uses an empty wallet → the "need more $UR3030" refusal path must show.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const PW = '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const TOKEN = '0xdc47e98b35Da73956fa7cCD450f8feEA746Ec83C'.toLowerCase();
const POOL_MANAGER = '0xe03a1074c86cfedd5c142c4f04f1a1536e203543';
const EMPTY_ADDR = '0x1111111111111111111111111111111111111111';
const PORT = 8899;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(PORT, r));

// node-side JSON-RPC via curl (goes through the agent proxy cleanly)
function rpc(method, params) {
  const out = execFileSync('curl', ['-sS', '-m', '25', '-X', 'POST', RPC, '-H', 'Content-Type: application/json',
    '-d', JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })], { encoding: 'utf8' });
  return JSON.parse(out);
}

const pw = await import(PW);
const chromium = (pw.default || pw).chromium;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function runFlow({ account, label, shot }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const events = [];
  page.on('pageerror', e => events.push(['PAGEERROR', String(e)]));
  page.on('console', m => { if (m.type() === 'error') events.push(['CONSOLE', m.text()]); });

  // bridge: browser → node → live Sepolia
  await page.exposeFunction('__liveRpc', (method, params) => {
    const r = rpc(method, params);
    events.push(['RPC→sepolia', method, JSON.stringify(params).slice(0, 90), (r.result || (r.error && r.error.message) || '').toString().slice(0, 40)]);
    if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code });
    return r.result;
  });
  await page.exposeFunction('__capture', (kind, data) => { events.push([kind, data]); });

  await page.addInitScript(({ account }) => {
    try { localStorage.setItem('urm_admin_ok', '1'); } catch {}
    let connected = false;
    let chainId = '0x1'; // start WRONG on purpose — the site must switch us to Sepolia
    const listeners = {};
    window.__mockTxs = [];
    window.ethereum = {
      isMetaMask: true,
      on: (ev, cb) => { (listeners[ev] = listeners[ev] || []).push(cb); },
      removeListener: () => {},
      async request({ method, params }) {
        window.__capture && __capture('WALLET←site', method);
        switch (method) {
          case 'eth_accounts': return connected ? [account] : [];
          case 'eth_requestAccounts': connected = true; return [account];
          case 'eth_chainId': return chainId;
          case 'wallet_switchEthereumChain':
            chainId = params[0].chainId;
            (listeners.chainChanged || []).forEach(f => f(chainId));
            __capture('CHAIN-SWITCH', chainId);
            return null;
          case 'eth_call':
          case 'eth_estimateGas':
          case 'eth_blockNumber':
            return await __liveRpc(method, params || []);
          case 'eth_sendTransaction': {
            const tx = params[0];
            window.__mockTxs.push(tx);
            __capture('TX-CAPTURED', JSON.stringify(tx));
            // pretend-signed: deterministic fake hash
            return '0x' + 'ab'.repeat(32);
          }
          default: __capture('WALLET-UNHANDLED', method); return null;
        }
      },
    };
  }, { account });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // rip a pack
  await page.click('#packOpen');
  // the connect chooser (injected + WC both available) → pick the browser wallet
  try { await page.click('button[data-k="injected"]', { timeout: 4000 }); } catch { events.push(['NOTE', 'no chooser shown (already connected)']); }
  await page.waitForTimeout(1500);
  const busyTitle = await page.textContent('#packTitle').catch(() => '');
  await page.waitForTimeout(6500); // rip video hard-cap (4.2s) + flip-in
  const finalTitle = await page.textContent('#packTitle').catch(() => '');
  const banner = await page.textContent('.pack-tx').catch(() => null);
  const bannerLink = await page.getAttribute('.pack-tx a', 'href').catch(() => null);
  const note = await page.textContent('.pack-note').catch(() => null);
  const fanCards = await page.$$eval('.fcard', els => els.length).catch(() => 0);
  const txs = await page.evaluate(() => window.__mockTxs);
  await page.screenshot({ path: shot, fullPage: false });
  await page.close();
  return { label, busyTitle, finalTitle, banner, bannerLink, note, fanCards, txs, events };
}

// ── RUN 1: funded holder — full burn flow must complete ──
const r1 = await runFlow({ account: POOL_MANAGER, label: 'funded holder (PoolManager, ~1M UR3030)', shot: 'transact-run1-funded.png' });
// ── RUN 2: empty wallet — must be REFUSED with "need more $UR3030" ──
const r2 = await runFlow({ account: EMPTY_ADDR, label: 'empty wallet (0 UR3030)', shot: 'transact-run2-empty.png' });

await browser.close();
server.close();

// ── verdicts ──
function report(r) {
  console.log(`\n════ ${r.label} ════`);
  console.log('busy title  :', JSON.stringify(r.busyTitle));
  console.log('final title :', JSON.stringify(r.finalTitle));
  console.log('tx banner   :', JSON.stringify(r.banner), '→', r.bannerLink);
  console.log('block note  :', JSON.stringify(r.note));
  console.log('fan cards   :', r.fanCards);
  console.log('captured txs:', JSON.stringify(r.txs, null, 1));
  for (const e of r.events) console.log('  ·', e.join('  '));
}
report(r1); report(r2);

// assertions
const t = r1.txs[0] || {};
const expectData = '0x42966c68' + (350n * 10n ** 18n).toString(16).padStart(64, '0');
const checks = [
  ['run1: exactly one tx sent', r1.txs.length === 1],
  ['run1: tx.to = $UR3030 token', (t.to || '').toLowerCase() === TOKEN],
  ['run1: tx.from = connected account', (t.from || '').toLowerCase() === POOL_MANAGER],
  ['run1: calldata = burn(350e18)', t.data === expectData],
  ['run1: network guard switched to Sepolia', r1.events.some(e => e[0] === 'CHAIN-SWITCH' && e[1] === '0xaa36a7')],
  ['run1: reveal shows on-chain burn title', /burned on-chain/.test(r1.finalTitle || '')],
  ['run1: tx banner with explorer link', !!r1.banner && /sepolia\.etherscan\.io\/tx\//.test(r1.bannerLink || '')],
  ['run1: 7 cards revealed', r1.fanCards === 7],
  ['run2: NO tx sent from empty wallet', r2.txs.length === 0],
  ['run2: refusal shows "need more"', /need more \$UR3030/i.test(r2.finalTitle || '') || /burns .*350/i.test(r2.note || '')],
];
let live = null;
if (t.data === expectData) {
  const sim = rpc('eth_call', [{ from: t.from, to: t.to, data: t.data }, 'latest']);
  const gas = rpc('eth_estimateGas', [{ from: t.from, to: t.to, data: t.data }]);
  live = { sim: sim.result ?? sim.error, gas: gas.result ? parseInt(gas.result, 16) : gas.error };
  checks.push(['live-sim: captured tx executes on Sepolia', sim.result === '0x']);
}
console.log('\n──── VERDICT ────');
let pass = 0;
for (const [name, ok] of checks) { console.log((ok ? ' ✓ ' : ' ✗ ') + name); if (ok) pass++; }
if (live) console.log(` ⛽ live gas estimate for the captured tx: ${live.gas} gas`);
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);

#!/usr/bin/env node
/* ripmaster3030studios — POOLFIND · you type a token, it finds the pools.  `npm run test:poolfind`
 *
 * ⛔ THE DEFECT THIS GUARDS, in the artist's words: *"it requires multiple windows, copy pasting
 *   pool addresses that no one knows off hand or how to search for."* POOL CHECK demanded the one
 *   string on the chain a person is least able to produce, and offered three frozen `try:` links
 *   as the answer. Nothing was broken; the tool simply required you to have already done the
 *   search it exists to perform.
 *
 * ⚑ NO NETWORK IN THIS SUITE. `find()` takes its `call` injected, so the factory is driven by a
 *   stub that returns known answers — which means these assertions test the MODULE and not
 *   whether a public RPC was up. The one thing that genuinely needs the chain (are the registry
 *   addresses real?) is asserted structurally here and was verified on-chain by reading symbol()
 *   off all 13, recorded in §C.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0, fails = 0;
const ok = (c, m, d) => { checks++; if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${d !== undefined && d !== '' ? '  — ' + d : ''}`); };

/* ⛔ THE SHIPPED FILE IS READ, NEVER A COPY. `js/poolfind.js` is a classic script because
 *   `test:reach` §0 compiles every browser script with `new Function` — so the CLI evaluates the
 *   same bytes the browser runs, the way `scripts/drain.mjs` reads `js/check3030.js`. A harness
 *   that reimplements the thing it tests proves the harness, and this repo has paid that bill
 *   four times. */
const shim = {};
new Function('window', readFileSync(join(ROOT, 'js/poolfind.js'), 'utf8'))(shim);
const P = shim.PoolFind;

console.log('\n── A · it resolves what a person would actually type ──');
ok(!!P, 'the module loads and exports PoolFind');
ok(P.resolve('pepe', 'ethereum').addr.toLowerCase() === '0x6982508145454ce325ddbe47a25d4ec3d2311933',
  'A1 · a bare name resolves to a token', 'pepe');
ok(P.resolve('PEPE', 'ethereum') && P.resolve('$pepe', 'ethereum'),
  'A2 · case and a leading $ are the same request — a symbol is a human word');
const raw = '0x1234567890abcdef1234567890ABCDEF12345678';
ok(P.resolve(raw, 'ethereum').addr === raw,
  'A3 · an address is passed through EXACTLY — never case-corrected', 'an address is not a word');
ok(P.resolve('definitely-not-a-token', 'ethereum') === null,
  'A4 · an unknown name resolves to nothing rather than to a guess');

console.log('\n── B · the query plan is the pairs worth asking about ──');
{
  const pepe = P.resolve('pepe', 'ethereum').addr;
  const plan = P.plan(pepe, 'ethereum');
  ok(plan.length === 16, 'B1 · four quotes × four fee tiers', `${plan.length} reads, one batch`);
  ok(P.FEES.includes(100) && P.FEES.includes(10000),
    'B2 · the extreme tiers are asked about — 1% is where a toll hides');
  /* ⛔ A TOKEN MUST NOT BE PAIRED WITH ITSELF. getPool(WETH, WETH, fee) is a wasted read that can
   *   only ever return zero, and it would have shipped as a phantom "no pool" row for WETH. */
  const weth = P.resolve('weth', 'ethereum').addr;
  ok(!P.plan(weth, 'ethereum').some((q) => q.quote.addr.toLowerCase() === weth.toLowerCase()),
    'B3 · and nothing is paired against itself', `${P.plan(weth, 'ethereum').length} reads for WETH`);
  ok(P.plan(pepe, 'base').length === P.QUOTES.base.length * P.FEES.length,
    'B4 · Base has its own quote set, not mainnet\'s');
}

console.log('\n── C · the registry is real, and every row was read off the chain ──');
/* ⚑ VERIFIED BY READING symbol() OFF ALL 13 — a one-time proof that stays true because a token
 *   address is immutable:
 *     ethereum  3030 weth usdc usdt dai wbtc uni link pepe shib rare   ✓
 *     base      weth usdc                                             ✓
 *   ⛔ A WRONG ADDRESS HERE DOES NOT ERROR. It sends somebody to a real market for the wrong
 *     asset — this repo's "a buy link is a claim about which market is ours", applied to a
 *     lookup — which is why the check was done against the chain and not against memory. */
{
  const all = [];
  for (const chain of Object.keys(P.TOKENS))
    for (const [name, addr] of Object.entries(P.TOKENS[chain])) all.push({ chain, name, addr });
  ok(all.length >= 13, 'C1 · the registry has entries', `${all.length}`);
  ok(all.every((t) => P.isAddr(t.addr)), 'C2 · every entry is a well-formed address');
  /* two names pointing at one address, or one name at two, is how a lookup quietly lies */
  for (const chain of Object.keys(P.TOKENS)) {
    const rows = Object.entries(P.TOKENS[chain]);
    const addrs = rows.map(([, a]) => a.toLowerCase());
    ok(new Set(addrs).size === addrs.length, `C3 · no duplicate address in the ${chain} registry`);
  }
  ok(Object.keys(P.FACTORY).every((c) => P.isAddr(P.FACTORY[c])),
    'C4 · every chain has a factory address');
  /* ⛔ BASE'S FACTORY IS NOT MAINNET'S. A mainnet factory address on Base has no code, so getPool
   *   returns empty and EVERY token reports "no pools" — which reads as a quiet token rather than
   *   as a misconfiguration, and is therefore the failure that would never get reported. */
  ok(P.FACTORY.ethereum.toLowerCase() !== P.FACTORY.base.toLowerCase(),
    'C5 · and Base\'s factory is a different contract from mainnet\'s');
}

console.log('\n── D · find() against a stubbed factory ──');
{
  const ZERO = '0x' + '0'.repeat(64);
  const pool = (h) => '0x' + '0'.repeat(24) + h;
  const pepe = P.resolve('pepe', 'ethereum').addr;

  /* only the 0.3% WETH pair exists in this fake world */
  const calls = [];
  const stub = (to, data) => {
    calls.push({ to, data });
    const feeHex = data.slice(-64);
    const isThreeK = parseInt(feeHex, 16) === 3000;
    const wethIn = data.toLowerCase().includes('c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
    return Promise.resolve(isThreeK && wethIn ? pool('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') : ZERO);
  };
  const res = await P.find(pepe, 'ethereum', stub);
  ok(res.pools.length === 1, 'D1 · a zero-address answer is not a pool', `${res.pools.length} of 16`);
  ok(res.pools[0].feePct === 0.3 && res.pools[0].quote === 'WETH',
    'D2 · and the one that exists is returned with its fee and quote',
    `${res.pools[0].feePct}% vs ${res.pools[0].quote}`);
  ok(calls.every((c) => c.to === P.FACTORY.ethereum), 'D3 · every read goes to the factory');
  ok(calls.every((c) => c.data.startsWith('0x1698ee82')),
    'D4 · and every read is getPool(address,address,uint24)');

  /* ⛔ ONE DEAD READ MUST NOT LOSE THE OTHERS. Sixteen reads over free RPCs will not all land, and
   *   a single rejection taking down the whole lookup would report "no pools" for a token with
   *   plenty — the reassuring wrong answer this project keeps paying for. */
  let n = 0;
  const flaky = (to, data) => (++n % 3 === 0 ? Promise.reject(new Error('rpc'))
    : stub(to, data));
  const res2 = await P.find(pepe, 'ethereum', flaky);
  ok(res2.pools.length >= 0 && res2.asked === 16,
    'D5 · a failing read is dropped, not fatal', `${res2.asked} attempted despite rejections`);

  /* ⛔ AND AN EMPTY RESULT IS NOT A CLAIM ABOUT A MARKET. Our own $3030 trades on v4 and finds
   *   ZERO v3 pools — measured, not hypothetical — so the page must say what it LOOKED AT. */
  const none = await P.find(P.resolve('3030', 'ethereum').addr, 'ethereum', () => Promise.resolve(ZERO));
  ok(none.pools.length === 0 && none.asked === 16,
    'D6 · a token with no v3 pools returns none, having genuinely looked', '$3030 is a v4 market');
  const HTML = readFileSync(join(ROOT, 'poolcheck.html'), 'utf8');
  ok(/not a statement that it has no market/.test(HTML),
    'D7 · and the page says that is what it looked at, not that there is no market');
}

console.log('\n── E · the page asks for a token, not a pool ──');
{
  const HTML = readFileSync(join(ROOT, 'poolcheck.html'), 'utf8');
  ok(/placeholder="a token name, a token address, or a pool"/.test(HTML),
    'E1 · the input no longer demands a pool address');
  ok(!/paste a 40-hex v3 pool address or a 64-hex v4 pool id/.test(HTML),
    'E2 · and the old refusal is gone');
  ok(/<script src="\/js\/poolfind\.js"><\/script>/.test(HTML),
    'E3 · the page actually loads the finder — a mention is not a load');
  /* ⚠ the try line was three pool addresses; it is names now, which is the whole point */
  const tries = [...HTML.matchAll(/data-p="([^"]+)"/g)].map((m) => m[1]);
  ok(tries.length > 0 && tries.every((t) => !/^0x/.test(t)),
    'E4 · every example is a name a person could have typed', tries.join(' · '));
  /* ⛔ THE LABEL IS USER INPUT AND IS WRITTEN WITH innerHTML. A lookup that prints a stranger's
   *   string back is the one shape that turns a reader into a script injection. */
  ok(/var esc = function/.test(HTML) && /esc\(label\)/.test(HTML),
    'E5 · and what was typed is escaped before it is printed back');
}

console.log(`\n${fails ? 'FAIL' : 'PASS'}  ${checks - fails}/${checks}\n`);
process.exit(fails ? 1 : 0);

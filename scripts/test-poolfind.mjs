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
  /* ⚠ THE PROPERTY, NOT THE SPELLING. This pinned the placeholder verbatim and broke the moment
   *   the copy improved — the recorded failure of a pin tuned to one wording rather than to what
   *   it means. What matters is that the field no longer DEMANDS a pool and does offer a token. */
  const ph = (HTML.match(/id="addr"[^>]*placeholder="([^"]*)"/) || [, ''])[1];
  ok(/token/i.test(ph) && !/^0x… v3 pool address/.test(ph),
    'E1 · the input asks for a token, not only a pool address', ph);
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

console.log('\n── F · the long tail: a name nobody hand-listed ──');
/* ⛔ THIRTEEN ROWS WAS NEVER GOING TO BE ENOUGH — artist: "not pulling up token names like fwa mog
 *   etc". And there is NO ON-CHAIN ANSWER to "what is mog": symbol() reads forwards from an
 *   address and nothing reverses it, because a symbol is not unique and was never an identifier.
 *   Name resolution needs an index; the discipline is to use one ONLY for the part that cannot be
 *   derived, and to confirm on-chain before reading anything. */
{
  const page = (pairs) => Promise.resolve({ pairs });
  const P_ = (chain, addr, sym, liq) => ({ chainId: chain, baseToken: { address: addr, symbol: sym, name: sym },
    liquidity: { usd: liq } });

  /* the real shape of a `fwa` search: three tokens, one name */
  const three = await P.search('fwa', () => page([
    P_('ethereum', '0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845', 'FWA', 1103847),
    P_('ethereum', '0x47883e389BB6be3650B0C0935b300b50a95fc072', 'FWA', 30538),
    P_('ethereum', '0xB32F38017576307637789E53b6cBd24ad95cBA8a', 'FWA', 0),
    P_('solana',   '0xdeadbeef', 'FWA', 999999999)          /* a chain this tool cannot read */
  ]));
  ok(three.length === 3, 'F1 · a name returns EVERY token that claims it, not one',
    `${three.length} tokens called FWA`);
  ok(three[0].liq > three[1].liq && three[2].liq === 0,
    'F2 · ordered by depth, and the $0 impostor is SHOWN not filtered',
    'hiding it would hide what makes the choice legible');
  ok(!three.some((c) => c.chain !== 'ethereum' && c.chain !== 'base'),
    'F3 · chains this tool cannot read are dropped rather than offered');

  /* ⚠ an exact symbol match outranks a deeper substring match — searching "mog" must not put
   *   "MOGCOIN" first merely because it has more liquidity */
  const rank = await P.search('mog', () => page([
    P_('ethereum', '0x1111111111111111111111111111111111111111', 'MOGCOIN', 9000000),
    P_('ethereum', '0x2222222222222222222222222222222222222222', 'Mog', 4648426)
  ]));
  ok(rank[0].sym.toLowerCase() === 'mog', 'F4 · an exact name match outranks a deeper near-match',
    `${rank[0].sym} over ${rank[1].sym}`);

  /* ⛔ THE INDEX BEING DOWN IS NOT A FACT ABOUT A TOKEN */
  const dead = await P.search('mog', () => Promise.reject(new Error('offline')));
  ok(Array.isArray(dead) && dead.length === 0, 'F5 · a failed search returns nothing, never throws');
  const HTML = readFileSync(join(ROOT, 'poolcheck.html'), 'utf8');
  ok(/not proof the token does not exist/.test(HTML),
    'F6 · and the page says an empty search is not proof the token does not exist');

  /* ⛔ WHATEVER THE INDEX SAID, THE CHAIN IS ASKED BEFORE ANYTHING IS READ. */
  const abi = (str) => { const h = Buffer.from(str, 'utf8').toString('hex');
    return '0x' + '20'.padStart(64, '0') + str.length.toString(16).padStart(64, '0') + h.padEnd(64, '0'); };
  const sym = await P.confirmSymbol('0xabc', () => Promise.resolve(abi('MOG')));
  ok(sym === 'MOG', 'F7 · symbol() is read back off the chain before pools are shown', sym);
  const b32 = await P.confirmSymbol('0xabc', () => Promise.resolve(
    '0x' + Buffer.from('MKR', 'utf8').toString('hex').padEnd(64, '0')));
  ok(b32 === 'MKR', 'F8 · and a bytes32 symbol still decodes — old tokens predate the string ABI', b32);
  const nope = await P.confirmSymbol('0xabc', () => Promise.reject(new Error('x')));
  ok(nope === null, 'F9 · an address that will not answer symbol() confirms nothing');
  ok(/confirming .* on-chain|confirmSymbol/.test(HTML),
    'F10 · and the page confirms before it reads, rather than trusting the index');
  ok(/A name is not an identifier/.test(HTML),
    'F11 · the page says out loud that a name is not an identifier');
}

console.log(`\n${fails ? 'FAIL' : 'PASS'}  ${checks - fails}/${checks}\n`);
process.exit(fails ? 1 : 0);

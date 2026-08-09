#!/usr/bin/env node
/* ripmaster3030studios — THE RESTING ORDER MAP.  `npm run resting -- <pool> [name]`
 *
 * Every liquidity position in a Uniswap v3/v4 pool is public, and a ONE-SIDED position is a limit
 * order. This reads them and prints where the money is actually waiting.
 *
 * ⛔ NOBODY SURFACES THIS AND IT IS SITTING IN PLAIN SIGHT. Charts show price and volume — the
 *   OUTPUT. A position whose range sits entirely above the current tick holds only currency0;
 *   entirely below, only currency1. So the book is readable: a wall of one-sided QUOTE under the
 *   price is a bid nobody has advertised, and it is where support genuinely is rather than where
 *   a trendline says it should be.
 *
 * ⛔ AND THE FIRST VERSION OF THIS FILE PRINTED THAT BOOK UPSIDE DOWN ON MOST POOLS. It hard-coded
 *   "above the tick = a BID", which is a statement about WHICH ASSET SITS ON WHICH SIDE, not about
 *   the tick. It is true when the QUOTE is currency0 and false when the TOKEN is — and mainnet is
 *   mostly the second case, because WETH is `0xC02a…` and sorts after nearly every memecoin, so
 *   `token0` is the token. Measured: PEPE/WETH 0.3% has token0 = PEPE, so an above-spot range holds
 *   only PEPE and can ONLY SELL. The tool called it a bid.
 *   ⚑ IT PASSED BECAUSE IT WAS VALIDATED ON THE ONE POOL WHERE THE ANSWER IS ACCIDENTALLY RIGHT.
 *   The FWA pool it was built against is v4 with NATIVE ETH, and `address(0)` sorts before
 *   everything — so there currency0 really is the quote. One case, right for the wrong reason,
 *   generalised to every pool. The rule is not about the tick: **the side holding the QUOTE is the
 *   BID; the side holding the TOKEN is the ASK.** Both currencies are read from the chain now, and
 *   the header prints which is which so the label can be checked by eye.
 *   ⚠ The distance-from-spot number was inverted by the same mistake, one layer down. `1.0001^tick`
 *   is currency1 per currency0 — so when the token is currency1, a HIGHER tick means a CHEAPER
 *   token, and a bid 2.4% below the price printed as "+2.5%". Everything is expressed in TOKEN
 *   price now, so below always means below.
 *
 * ⚑ FOUND THE HARD WAY. A hookless FWA pool quoted 7.2% below the main one and every buy reverted,
 *   which read as a cage. It was a single position at [115670, 120314] — starting exactly AT spot
 *   and running up, so it held only ETH. Not a trap, not an arb: a standing limit bid. In 4.2 hours
 *   it absorbed 912,255 FWA for 8.12 ETH.
 * ⚠ AND THE DECOMPOSITION IS THE LESSON. That position is up ~14.8%, of which the MAKER edge — the
 *   size-weighted discount it actually bought at — is **0.17%**. The rest is the token going up.
 *   Being the bid pays a fraction of a percent and hands you directional risk; anyone quoting the
 *   headline gain as a market-making return is selling something.
 */
import { createPublicClient, http, parseAbi, parseAbiItem, keccak256, encodeAbiParameters } from 'viem';
import { mainnet, base } from 'viem/chains';

const ARG = (process.argv[2] || '').toLowerCase();
const NAME = process.argv[3] || ARG.slice(0, 10);
const CHAIN = (process.env.CHAIN || 'ethereum').toLowerCase();
if (!/^0x[0-9a-f]{40}$|^0x[0-9a-f]{64}$/.test(ARG)) {
  console.log('  usage: npm run resting -- 0x<v3 pool address | v4 pool id> [name]');
  console.log('         CHAIN=base npm run resting -- 0x…');
  process.exit(1);
}
const RPCS = CHAIN === 'base'
  ? ['https://mainnet.base.org', 'https://base.drpc.org']
  : ['https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org'];
const cs = RPCS.map(u => createPublicClient({ chain: CHAIN === 'base' ? base : mainnet, transport: http(u, { timeout: 30000, retryCount: 1 }) }));
const c = cs[0];
/* ⛔ THE v4 POOLMANAGER IS A DIFFERENT ADDRESS ON EVERY CHAIN, and this file hard-coded mainnet's
 *   while accepting CHAIN=base. Verified: mainnet 0x0000…08A90 has 24,009 bytes and NO CODE on
 *   Base; Base's is 0x498581fF…52b2b, same 24,009 bytes. ⚑ It threw rather than lying, which is
 *   the only reason this is a bug report instead of a wrong book — an `extsload` against an
 *   address with no code returns "0x", and a reader that treated that as zero would have printed
 *   a confident empty pool. */
const PM = (CHAIN === 'base')
  ? '0x498581fF718922c3f8e6A244956aF099B2652b2b'
  : '0x000000000004444c5dc75cB358380D2e3dE08A90';
const V4_FROM = CHAIN === 'base' ? 25350988n : 21688329n;      // PoolManager deploy block
const isV4 = ARG.length === 66;

const MINT3 = parseAbiItem('event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)');
const BURN3 = parseAbiItem('event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)');
const MOD4 = parseAbiItem('event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)');
const INIT4 = parseAbiItem('event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)');
const V3 = parseAbi(['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)', 'function token0() view returns (address)', 'function token1() view returns (address)', 'function fee() view returns (uint24)']);
const ERC = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)']);
const EXT = parseAbi(['function extsload(bytes32) view returns (bytes32)']);

/* ⚑ WHICH SIDE IS THE QUOTE IS THE WHOLE QUESTION, so it is answered from a named list rather than
 *   from "whichever sorts first". Native ETH is `address(0)` in v4 and sorts first; WETH is
 *   `0xC02a…` on mainnet and sorts LAST against most tokens. Sorting tells you nothing. */
const QUOTES = new Map(Object.entries(CHAIN === 'base'
  ? { '0x0000000000000000000000000000000000000000': 'ETH',
      '0x4200000000000000000000000000000000000006': 'WETH',
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC' }
  : { '0x0000000000000000000000000000000000000000': 'ETH',
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
      '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT' }));

const head = Number(await c.getBlockNumber());
const DAYS = Number(process.env.DAYS || 14);
const from = head - Math.round(DAYS * 86400 / (CHAIN === 'base' ? 2 : 12.042));

async function grab(addr, ev, args) {
  const out = []; let fails = 0;
  const step = CHAIN === 'base' ? 4000 : 2000;
  const ch = []; for (let lo = from; lo <= head; lo += step) ch.push([lo, Math.min(lo + step - 1, head)]);
  const q = ch.slice();
  await Promise.all(cs.map(async x => { for (;;) { const j = q.shift(); if (!j) return;
    let ok = false;
    for (let a = 0; a < 2 && !ok; a++) { try { out.push(...await x.getLogs({ address: addr, event: ev, args, fromBlock: BigInt(j[0]), toBlock: BigInt(j[1]) })); ok = true; } catch {} }
    if (!ok) fails++; } }));
  /* ⛔ report gaps — a missing window hides a position, and a book with a hole in it is worse
   *   than no book because it looks complete. */
  return { out, fails };
}

let tick, positions = new Map(), meta = {};
if (isV4) {
  const { encodePacked } = await import('viem');
  const slot = keccak256(encodePacked(['bytes32', 'uint256'], [ARG, 6n]));
  const w = BigInt(await c.readContract({ address: PM, abi: EXT, functionName: 'extsload', args: [slot] }));
  tick = Number((w >> 160n) & 0xffffffn); if (tick >= 0x800000) tick -= 0x1000000;

  /* The id is a one-way hash of the PoolKey, so the currencies come from the pool's own Initialize
   * event — indexed by id, one filtered query over the whole of v4's history, ~0.5 s.
   * ⚑ And it is PROVEN, not trusted: re-hashing the key must reproduce the id. Same standard
   *   `npm run mm` holds its own table to. */
  /* ⛔ AND `.catch(() => [])` TURNED A REFUSED QUERY INTO A FACT ABOUT THE POOL. The first version
   *   printed "no Initialize event for this id" — a statement about the POOL — when the truth was
   *   that nobody had looked. Third time tonight this exact shape appeared.
   * ⛔ THEN THE HONEST VERSION REVEALED A HARD LIMIT: both Base endpoints cap eth_getLogs at
   *   10,000 blocks (5.5 hours of Base), so scanning v4's 24M-block history needs 2,400 queries.
   *   Log-scanning for a v4 pool key is not viable on a free endpoint and no chunk size fixes it.
   * ⚑ SO THE INDEX SAYS WHERE TO LOOK AND THE CHAIN SAYS WHAT IS TRUE — the discipline used
   *   everywhere else here. DexScreener's `pairCreatedAt` narrows 24M blocks to one 10k window;
   *   the PoolKey found there is then PROVEN by re-hashing to the id. A wrong hint cannot produce
   *   a wrong answer, only a failed search. */
  const SPAN = CHAIN === 'base' ? 10000 : 9000;
  let ini = null, tried = 0, errored = 0, hintBlock = null;
  try {
    const j = await (await fetch(`https://api.dexscreener.com/latest/dex/pairs/${CHAIN}/${ARG}`,
      { signal: AbortSignal.timeout(12000) })).json();
    const pr = (j && (j.pair || (j.pairs || [])[0])) || null;
    if (pr && pr.pairCreatedAt) {
      const secs = CHAIN === 'base' ? 2 : 12.042;
      const nowB = head, ago = (Date.now() - Number(pr.pairCreatedAt)) / 1000;
      hintBlock = Math.max(Number(V4_FROM), Math.floor(nowB - ago / secs));
    }
  } catch { /* no hint is not an error — the fallback below still runs */ }

  const windows = [];
  if (hintBlock) for (const d of [0, -1, 1, -2, 2, -3, 3]) windows.push(hintBlock + d * SPAN);
  for (let b = head; b > Number(V4_FROM) && windows.length < 40; b -= SPAN) windows.push(b - SPAN);
  for (const lo of windows) {
    if (ini) break;
    const a = BigInt(Math.max(Number(V4_FROM), Math.floor(lo)));
    const b = a + BigInt(SPAN) > BigInt(head) ? BigInt(head) : a + BigInt(SPAN);
    let ok = false;
    for (const cl of cs) {
      try { const g = await cl.getLogs({ address: PM, event: INIT4, args: { id: ARG }, fromBlock: a, toBlock: b });
        ok = true; if (g && g.length) { ini = g[0]; } break; } catch {}
    }
    tried++; if (!ok) errored++;
  }
  if (!ini) {
    console.log(errored === tried
      ? `\n  ⛔ all ${tried} log windows FAILED to read — a failure to look, not a fact about the pool.\n`
      : `\n  ⛔ searched ${tried} windows${hintBlock ? ' around the indexed creation block' : ' back from head'} and found\n     no Initialize for this id on ${CHAIN}. ⚠ Free endpoints cap getLogs at ${SPAN} blocks, so this is\n     a NARROW search, not an exhaustive one — it is "not found here", never "does not exist".\n`);
    process.exit(1);
  }
  const a = ini.args;
  const rehash = keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
    [a.currency0, a.currency1, a.fee, a.tickSpacing, a.hooks]));
  if (rehash.toLowerCase() !== ARG) { console.log(`\n  ⛔ the PoolKey in the Initialize log does not reproduce the id. Refusing to report.\n`); process.exit(1); }
  meta = { t0: a.currency0, t1: a.currency1, fee: Number(a.fee), hooks: a.hooks, spacing: Number(a.tickSpacing) };

  const r = await grab(PM, MOD4, { id: ARG });
  meta.gaps = r.fails;
  for (const l of r.out) {
    const k = `${l.args.tickLower}:${l.args.tickUpper}`;
    positions.set(k, (positions.get(k) || 0n) + l.args.liquidityDelta);
  }
} else {
  const s = await c.readContract({ address: ARG, abi: V3, functionName: 'slot0' });
  tick = Number(s[1]);
  const [t0, t1, fee] = await Promise.all([
    c.readContract({ address: ARG, abi: V3, functionName: 'token0' }),
    c.readContract({ address: ARG, abi: V3, functionName: 'token1' }),
    c.readContract({ address: ARG, abi: V3, functionName: 'fee' })]);
  meta = { t0, t1, fee: Number(fee), hooks: null };
  const m = await grab(ARG, MINT3), b = await grab(ARG, BURN3);
  meta.gaps = m.fails + b.fails;
  for (const l of m.out) { const k = `${l.args.tickLower}:${l.args.tickUpper}`; positions.set(k, (positions.get(k) || 0n) + l.args.amount); }
  for (const l of b.out) { const k = `${l.args.tickLower}:${l.args.tickUpper}`; positions.set(k, (positions.get(k) || 0n) - l.args.amount); }
}

/* ── which side is the quote, and therefore which side is the bid ───────────────────────────── */
const q0 = QUOTES.get(meta.t0.toLowerCase()), q1 = QUOTES.get(meta.t1.toLowerCase());
if (q0 && q1) { /* both are quotes (a stable pair) — pick c1 as "token" so the print still works */ }
if (!q0 && !q1) {
  console.log(`\n  ⛔ neither side is a known quote asset (${meta.t0} / ${meta.t1}).`);
  console.log(`     Bid and ask are defined relative to the quote, so without one this tool cannot`);
  console.log(`     label the book. It would rather say nothing than print it the wrong way up.\n`);
  process.exit(1);
}
const quoteIs0 = !!q0 && !(q0 && q1 && false);
const QUOTE = quoteIs0 ? q0 : q1;
const tokAddr = quoteIs0 ? meta.t1 : meta.t0;
const sym = await c.readContract({ address: tokAddr, abi: ERC, functionName: 'symbol' }).catch(() => NAME.toUpperCase());
const decT = await c.readContract({ address: tokAddr, abi: ERC, functionName: 'decimals' }).catch(() => 18);

/* raw 1.0001^tick is currency1 per currency0. The TOKEN price is that, or its reciprocal, depending
 * on which side the token sits — and getting this backwards is what inverted the distances. */
const tokenPx = t => {
  const raw = Math.pow(1.0001, t - tick);
  return quoteIs0 ? 1 / raw : raw;              // quote is c0 ⇒ higher tick = cheaper token
};
const pctFrom = t => (tokenPx(t) - 1) * 100;    // % away from spot, in TOKEN price

const live = [...positions.entries()].map(([k, L]) => {
  const [lo, hi] = k.split(':').map(Number);
  return { lo, hi, L };
}).filter(p => p.L > 0n);

console.log(`\n  ${NAME.toUpperCase()} · ${CHAIN} · ${isV4 ? 'v4' : 'v3'} · spot tick ${tick} · last ${DAYS} days`);
console.log(`  ${sym}/${QUOTE} · fee ${(meta.fee / 10000).toFixed(3)}%${meta.hooks && /[1-9a-f]/i.test(meta.hooks.slice(2)) ? ` · hook ${meta.hooks}` : ''}`);
console.log(`  currency0 ${quoteIs0 ? `= ${QUOTE} (the quote)` : `= ${sym} (the token)`} → an ABOVE-spot range holds only ${quoteIs0 ? QUOTE : sym}, i.e. a standing ${quoteIs0 ? 'BID' : 'ASK'}`);
console.log(`  ${live.length} live position ranges${meta.gaps ? `  ⚠ ${meta.gaps} unreadable windows — the book may be incomplete` : ''}`);
if (!live.length) { console.log('\n  no positions in the window — widen DAYS.\n'); process.exit(0); }

/* ⚑ THE CLASSIFICATION IS THE WHOLE POINT, AND IT KEYS ON THE ASSET, NOT THE TICK.
 *   Holding only the QUOTE = a standing BID (it can only buy). Holding only the TOKEN = a standing
 *   ASK (it can only sell). Straddling = a two-sided maker. */
const aboveIsBid = quoteIs0;
const above = live.filter(p => p.lo >= tick);
const below = live.filter(p => p.hi <= tick);
const bids = (aboveIsBid ? above : below).sort((a, b) => pctFrom(aboveIsBid ? b.lo : b.hi) - pctFrom(aboveIsBid ? a.lo : a.hi));
const asks = (aboveIsBid ? below : above).sort((a, b) => pctFrom(aboveIsBid ? a.hi : a.lo) - pctFrom(aboveIsBid ? b.hi : b.lo));
const both = live.filter(p => p.lo < tick && p.hi > tick);
const sum = xs => xs.reduce((a, p) => a + p.L, 0n);
/* the edge of a range NEAREST to spot is the price the order actually rests at */
const restAt = p => aboveIsBid ? p.lo : p.hi;   // for bids
const restAsk = p => aboveIsBid ? p.hi : p.lo;

console.log(`\n  ${'kind'.padEnd(16)} ${'ranges'.padStart(7)} ${'liquidity'.padStart(26)}`);
console.log(`  ${`standing BIDS`.padEnd(16)} ${String(bids.length).padStart(7)} ${sum(bids).toString().padStart(26)}   holds only ${QUOTE} — can only buy`);
console.log(`  ${`standing ASKS`.padEnd(16)} ${String(asks.length).padStart(7)} ${sum(asks).toString().padStart(26)}   holds only ${sym} — can only sell`);
console.log(`  ${'two-sided'.padEnd(16)} ${String(both.length).padStart(7)} ${sum(both).toString().padStart(26)}   real market making`);

const show = (list, label, edge) => {
  if (!list.length) return;
  console.log(`\n  ── ${label} ──`);
  console.log(`  ${'from spot'.padStart(10)}  ${'range'.padEnd(19)} ${'liquidity'.padStart(24)}`);
  for (const p of list.slice(0, 8)) {
    const d = pctFrom(edge(p));
    console.log(`  ${((d >= 0 ? '+' : '') + d.toFixed(2) + '%').padStart(10)}  [${String(p.lo).padStart(8)},${String(p.hi).padStart(8)}] ${p.L.toString().padStart(24)}`);
  }
};
show(bids, `WHERE THE BUYERS ARE WAITING (only ${QUOTE}; ${sym} must FALL into them)`, restAt);
show(asks, `WHERE THE SELLERS ARE WAITING (only ${sym}; ${sym} must RISE into them)`, restAsk);

console.log(`\n  ⚑ A one-sided range is a limit order somebody placed with real money and did not announce.`);
console.log(`     It is where support and resistance actually are, as opposed to where a line says.`);
console.log(`  ⚠ It is NOT a signal to copy. The position found this way in FWA is up ~14.8% — of which`);
console.log(`     the maker edge is 0.17% and the rest is the token going up. Being the bid pays a`);
console.log(`     fraction of a percent and hands you the inventory. Read the book; do not assume the`);
console.log(`     person who placed it knows something.\n`);

if (process.env.JSON) {
  const j = { name: NAME, chain: CHAIN, kind: isV4 ? 'v4' : 'v3', pool: ARG, tick, sym, quote: QUOTE,
    fee: meta.fee, hooks: meta.hooks, quoteIs0, gaps: meta.gaps,
    bids: bids.map(p => ({ lo: p.lo, hi: p.hi, L: p.L.toString(), pct: +pctFrom(restAt(p)).toFixed(4) })),
    asks: asks.map(p => ({ lo: p.lo, hi: p.hi, L: p.L.toString(), pct: +pctFrom(restAsk(p)).toFixed(4) })) };
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.JSON, JSON.stringify(j, null, 1));
  console.log(`  wrote ${process.env.JSON}\n`);
}

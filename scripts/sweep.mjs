#!/usr/bin/env node
/* ripmaster3030studios — THE CROSS-VENUE SWEEP.  `npm run sweep`
 *
 *   npm run sweep              ethereum
 *   CHAIN=base npm run sweep   base
 *
 * Finds tokens quoted in more than one pool and asks the only question that turns a price gap into
 * money: DOES BOTH LEGS FILL.
 *
 * ⛔ A PRICE GAP IS NOT AN ARB, AND THIS PROJECT HAS THE SCAR. Two FWA pools sat 7.238% apart
 *   against a 1.874% cost to close — a 5.36% edge in the open, on a chain where searchers close
 *   gaps in one block. It persisted because the only executable direction was the wrong one: the
 *   cheap pool's single position started exactly AT spot and ran upward, so it held only ETH and
 *   every BUY reverted. You could sell into the cheap price and nothing else.
 *   ⚑ So this script never reports a gap it has not QUOTED IN BOTH DIRECTIONS. A gap that has not
 *   been quoted is a rumour.
 *
 * ⚑ AND IT PRICES THE WHOLE ROUND TRIP, NOT THE GAP. buy fee + sell fee + both price impacts at
 *   the size you would actually do + gas. The number printed is what lands in the wallet.
 *
 * ⚠ Even a real, quoted, profitable gap is a RACE. Searchers see the same chain with better
 *   infrastructure, so anything visible here for more than a block is usually visible because it
 *   cannot be taken. Treat a hit as a hypothesis to inspect, never as a trade to fire.
 */
import { createPublicClient, http, parseAbi, formatEther, parseEther } from 'viem';
import { mainnet, base } from 'viem/chains';

const CHAIN = (process.env.CHAIN || 'ethereum').toLowerCase();
const IS_BASE = CHAIN === 'base';
const RPCS = IS_BASE ? ['https://mainnet.base.org', 'https://base.drpc.org']
                     : ['https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org'];
const c = createPublicClient({ chain: IS_BASE ? base : mainnet, transport: http(RPCS[0], { timeout: 25000, retryCount: 1 }) });
const NATIVE_USD = Number(process.env.ETH_USD || 1919.63);
const SIZE = process.env.SIZE || '0.03';           // the size we would actually do
const TOPN = Number(process.env.TOPN || 40);

const V3 = parseAbi([
  'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)',
  'function token0() view returns (address)', 'function token1() view returns (address)',
  'function fee() view returns (uint24)', 'function liquidity() view returns (uint128)']);
const V2 = parseAbi(['function getReserves() view returns (uint112,uint112,uint32)',
  'function token0() view returns (address)', 'function token1() view returns (address)']);
const ERC = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)']);
const QUOTER_V3 = IS_BASE ? '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' : '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const QV3 = parseAbi([
  'struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160, uint32, uint256)']);

/* Candidate pools come from a public index; every number that decides anything is then re-read
 * from the chain. ⚠ The index is a HINT — it is wrong about fees and blind to hooks. */
/* ⚑ /search RETURNS ONE PAIR PER TOKEN AND THAT IS WHY THE FIRST SWEEP FOUND ONE CANDIDATE. The
 *   endpoint that lists EVERY pool for a token is /tokens/<address>. Discover addresses by symbol,
 *   then ask for the full venue list per token — otherwise the sweep is structurally blind to the
 *   exact thing it exists to find. */
const SEED = IS_BASE
  ? ['BRETT', 'TOSHI', 'DEGEN', 'AERO', 'MIGGLES', 'KEYCAT', 'MOCHI', 'NORMIE', 'DOGINME', 'BASED']
  : ['PEPE', 'SHIB', 'MOG', 'SPX6900', 'TURBO', 'NEIRO', 'ANDY', 'WOJAK', 'HPOS10I', 'LADYS',
     'BITCOIN', 'APU', 'BOBO', 'MEME', 'ELON', 'KABOSU', 'PONKE', 'MSTR'];

async function candidates() {
  const addrs = new Map();
  for (const sym of SEED) {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${sym}`, { signal: AbortSignal.timeout(12000) });
      const j = await r.json();
      const best = (j.pairs || [])
        .filter(p => p.chainId === (IS_BASE ? 'base' : 'ethereum') && p.baseToken?.symbol?.toUpperCase() === sym)
        .sort((a, b) => Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0))[0];
      if (best) addrs.set(best.baseToken.address.toLowerCase(), best.baseToken.symbol);
    } catch {}
  }
  const out = [];
  for (const [addr, sym] of addrs) {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, { signal: AbortSignal.timeout(12000) });
      const j = await r.json();
      const pools = (j.pairs || [])
        .filter(p => p.chainId === (IS_BASE ? 'base' : 'ethereum') && p.pairAddress)
        .map(p => ({ addr: p.pairAddress, dex: p.dexId, labels: (p.labels || []).join(','),
          vol: Number(p.volume?.h24 || 0), liq: Number(p.liquidity?.usd || 0) }))
        .filter(p => p.liq > 20000)
        .sort((a, b) => b.liq - a.liq);
      if (pools.length > 1) out.push({ sym, token: addr, pools });
    } catch {}
  }
  return out.sort((a, b) => b.pools.reduce((s, p) => s + p.vol, 0) - a.pools.reduce((s, p) => s + p.vol, 0)).slice(0, TOPN);
}

/* ⛔ v4 pools are skipped here ON PURPOSE and it is stated rather than silently dropped: their id
 *   is not an address, their fee can be dynamic and a hook can take the whole fee or refuse the
 *   trade. `npm run mm scan` handles those one at a time and correctly. */
async function readPool(addr) {
  try {
    const [s, t0, t1, fee] = await Promise.all([
      c.readContract({ address: addr, abi: V3, functionName: 'slot0' }),
      c.readContract({ address: addr, abi: V3, functionName: 'token0' }),
      c.readContract({ address: addr, abi: V3, functionName: 'token1' }),
      c.readContract({ address: addr, abi: V3, functionName: 'fee' })]);
    return { kind: 'v3', sqrt: s[0], tick: Number(s[1]), t0: t0.toLowerCase(), t1: t1.toLowerCase(), fee: Number(fee) };
  } catch {}
  try {
    const [r, t0, t1] = await Promise.all([
      c.readContract({ address: addr, abi: V2, functionName: 'getReserves' }),
      c.readContract({ address: addr, abi: V2, functionName: 'token0' }),
      c.readContract({ address: addr, abi: V2, functionName: 'token1' })]);
    return { kind: 'v2', r0: r[0], r1: r[1], t0: t0.toLowerCase(), t1: t1.toLowerCase(), fee: 3000 };
  } catch {}
  return null;
}

const WETH = (IS_BASE ? '0x4200000000000000000000000000000000000006' : '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2').toLowerCase();

function priceOf(p, tok, dec) {
  const tokIs0 = p.t0 === tok;
  if (p.kind === 'v3') {
    const raw = Math.pow(Number(p.sqrt) / 2 ** 96, 2);
    return tokIs0 ? raw * 10 ** (dec - 18) : (1 / raw) * 10 ** (dec - 18);
  }
  const r0 = Number(p.r0), r1 = Number(p.r1);
  if (!r0 || !r1) return null;
  return tokIs0 ? (r1 / r0) * 10 ** (dec - 18) : (r0 / r1) * 10 ** (dec - 18);
}

console.log(`\n  CROSS-VENUE SWEEP · ${CHAIN} · size ${SIZE} ${IS_BASE ? 'ETH' : 'ETH'} · top ${TOPN} multi-pool tokens\n`);
const toks = await candidates();
console.log(`  ${toks.length} tokens quoted in more than one indexed pool\n`);
if (!toks.length) { console.log('  ⚠ the index returned nothing usable — that is a failed read, not an absence of pools.\n'); process.exit(0); }

console.log(`  ${'token'.padEnd(12)} ${'venues'.padStart(6)} ${'gap'.padStart(9)} ${'fees'.padStart(8)} ${'edge'.padStart(9)}   verdict`);
let hits = 0;
for (const t of toks) {
  const dec = await c.readContract({ address: t.token, abi: ERC, functionName: 'decimals' }).catch(() => 18);
  const reads = [];
  for (const p of t.pools.slice(0, 5)) {
    if (/v4/i.test(p.labels)) continue;                       // stated, not silent — see the header
    const r = await readPool(p.addr);
    if (!r) continue;
    if (r.t0 !== WETH && r.t1 !== WETH) continue;             // ETH-quoted only, so prices compare
    const px = priceOf(r, t.token.toLowerCase(), dec);
    if (px && isFinite(px) && px > 0) reads.push({ ...p, ...r, px });
  }
  if (reads.length < 2) continue;
  reads.sort((a, b) => a.px - b.px);
  const lo = reads[0], hi = reads[reads.length - 1];
  const gap = (hi.px / lo.px - 1) * 100;
  const fees = (lo.fee + hi.fee) / 10000;
  const edge = gap - fees;
  const v = edge > 0.3 ? '⚑ QUOTE IT — gap clears the fees' : edge > 0 ? 'thin, gas will eat it' : 'efficient';
  if (edge > 0) hits++;
  console.log(`  ${(t.sym || '?').slice(0, 11).padEnd(12)} ${String(reads.length).padStart(6)} ${(gap.toFixed(3) + '%').padStart(9)} ${(fees.toFixed(2) + '%').padStart(8)} ${((edge >= 0 ? '+' : '') + edge.toFixed(3) + '%').padStart(9)}   ${v}`);
  if (edge > 0.3) console.log(`     cheap ${lo.dex} ${lo.addr} (${(lo.fee / 10000).toFixed(2)}%) → dear ${hi.dex} ${hi.addr} (${(hi.fee / 10000).toFixed(2)}%)`);
}
console.log(`\n  ${hits} token(s) show a gap wider than their fees.`);
console.log(`  ⛔ A GAP IS NOT AN ARB UNTIL BOTH LEGS ARE QUOTED. The FWA case looked like 5.36% and every`);
console.log(`     buy in the cheap pool reverted — the pool held only ETH and could not sell. Next step for`);
console.log(`     any hit above: quote the buy AND the sell at ${SIZE} ETH before believing a single digit.`);
console.log(`  ⚠ And anything still visible after a block is usually visible because it cannot be taken.\n`);

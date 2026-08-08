#!/usr/bin/env node
/* ripmaster3030studios — THE RESTING ORDER MAP.  `npm run resting -- <pool> [name]`
 *
 * Every liquidity position in a Uniswap v3/v4 pool is public, and a ONE-SIDED position is a limit
 * order. This reads them and prints where the money is actually waiting.
 *
 * ⛔ NOBODY SURFACES THIS AND IT IS SITTING IN PLAIN SIGHT. Charts show price and volume — the
 *   OUTPUT. A position whose range sits entirely above spot holds only token0 and can only BUY;
 *   entirely below spot, only token1 and can only SELL. So the book is readable: a wall of
 *   one-sided ETH under the price is a bid nobody has advertised, and it is where support
 *   genuinely is rather than where a trendline says it should be.
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
import { createPublicClient, http, parseAbi, parseAbiItem, formatEther, formatUnits } from 'viem';
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
const PM = '0x000000000004444c5dc75cB358380D2e3dE08A90';
const isV4 = ARG.length === 66;

const MINT3 = parseAbiItem('event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)');
const BURN3 = parseAbiItem('event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)');
const MOD4 = parseAbiItem('event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)');
const V3 = parseAbi(['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)', 'function token0() view returns (address)', 'function token1() view returns (address)', 'function fee() view returns (uint24)']);
const ERC = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)']);
const EXT = parseAbi(['function extsload(bytes32) view returns (bytes32)']);

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
  const { keccak256, encodeAbiParameters } = await import('viem');
  const slot = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [ARG, 6n]));
  const w = BigInt(await c.readContract({ address: PM, abi: EXT, functionName: 'extsload', args: [slot] }));
  tick = Number((w >> 160n) & 0xffffffn); if (tick >= 0x800000) tick -= 0x1000000;
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
  meta.t0 = t0; meta.t1 = t1; meta.fee = Number(fee);
  const m = await grab(ARG, MINT3), b = await grab(ARG, BURN3);
  meta.gaps = m.fails + b.fails;
  for (const l of m.out) { const k = `${l.args.tickLower}:${l.args.tickUpper}`; positions.set(k, (positions.get(k) || 0n) + l.args.amount); }
  for (const l of b.out) { const k = `${l.args.tickLower}:${l.args.tickUpper}`; positions.set(k, (positions.get(k) || 0n) - l.args.amount); }
}

const live = [...positions.entries()].map(([k, L]) => {
  const [lo, hi] = k.split(':').map(Number);
  return { lo, hi, L };
}).filter(p => p.L > 0n);

console.log(`\n  ${NAME.toUpperCase()} · ${CHAIN} · ${isV4 ? 'v4' : 'v3'} · spot tick ${tick} · last ${DAYS} days`);
console.log(`  ${live.length} live position ranges${meta.gaps ? `  ⚠ ${meta.gaps} unreadable windows — the book may be incomplete` : ''}`);
if (!live.length) { console.log('\n  no positions in the window — widen DAYS.\n'); process.exit(0); }

/* ⚑ THE CLASSIFICATION IS THE WHOLE POINT. Above spot = only token0 = a standing BID.
 *   Below spot = only token1 = a standing ASK. Straddling = a two-sided maker. */
const bids = live.filter(p => p.lo >= tick).sort((a, b) => b.lo - a.lo);
const asks = live.filter(p => p.hi <= tick).sort((a, b) => b.hi - a.hi);
const both = live.filter(p => p.lo < tick && p.hi > tick);
const sum = xs => xs.reduce((a, p) => a + p.L, 0n);
const pctFrom = t => ((Math.pow(1.0001, t - tick) - 1) * 100);

console.log(`\n  ${'kind'.padEnd(16)} ${'ranges'.padStart(7)} ${'liquidity'.padStart(26)}`);
console.log(`  ${'standing BIDS'.padEnd(16)} ${String(bids.length).padStart(7)} ${sum(bids).toString().padStart(26)}   one-sided, can only buy`);
console.log(`  ${'standing ASKS'.padEnd(16)} ${String(asks.length).padStart(7)} ${sum(asks).toString().padStart(26)}   one-sided, can only sell`);
console.log(`  ${'two-sided'.padEnd(16)} ${String(both.length).padStart(7)} ${sum(both).toString().padStart(26)}   real market making`);

const show = (list, label, edge) => {
  if (!list.length) return;
  console.log(`\n  ── ${label} ──`);
  console.log(`  ${'from spot'.padStart(10)}  ${'range'.padEnd(19)} ${'liquidity'.padStart(24)}`);
  for (const p of list.slice(0, 8)) {
    const d = pctFrom(edge === 'lo' ? p.lo : p.hi);
    console.log(`  ${((d >= 0 ? '+' : '') + d.toFixed(2) + '%').padStart(10)}  [${String(p.lo).padStart(8)},${String(p.hi).padStart(8)}] ${p.L.toString().padStart(24)}`);
  }
};
show(bids, 'WHERE THE BUYERS ARE WAITING (one-sided, price must RISE into them)', 'lo');
show(asks, 'WHERE THE SELLERS ARE WAITING (one-sided, price must FALL into them)', 'hi');

console.log(`\n  ⚑ A one-sided range is a limit order somebody placed with real money and did not announce.`);
console.log(`     It is where support and resistance actually are, as opposed to where a line says.`);
console.log(`  ⚠ It is NOT a signal to copy. The position found this way in FWA is up ~14.8% — of which`);
console.log(`     the maker edge is 0.17% and the rest is the token going up. Being the bid pays a`);
console.log(`     fraction of a percent and hands you the inventory. Read the book; do not assume the`);
console.log(`     person who placed it knows something.\n`);

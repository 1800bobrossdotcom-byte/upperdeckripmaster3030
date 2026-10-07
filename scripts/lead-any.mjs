#!/usr/bin/env node
/* ripmaster3030studios — DOES FLOW LEAD PRICE, ON ANY POOL.  `npm run lead -- <pool> [name]`
 *
 * The same question `flow:lead` asked of FWA, asked of any Uniswap v2 or v3 pool: does net token
 * flow out of the pool in window t predict the return in window t+1?
 *
 * ⛔ THIS EXISTS TO FALSIFY A RESULT, NOT TO EXTEND IT. On FWA the signal measured corr +0.294
 *   over the pool's whole life and −0.014 over the last ten days, and the difference lines up
 *   exactly with a 15-day emission programme ending. That gives two competing explanations —
 *   "the signal is real and FWA's regime changed" versus "the signal was only ever measuring the
 *   emissions" — and one sample cannot separate them. Three unrelated tokens with no emission
 *   programme can. ⚑ A null result here is the MORE useful outcome, because it closes the
 *   question instead of leaving a maybe.
 *
 * ⚑ POOL-SIDE TRANSFERS ONLY, FILTERED SERVER-SIDE. PEPE has tens of millions of transfers and
 *   pulling them all would be absurd; the only ones that matter are those with the pool on one
 *   side, which is two indexed queries. The same trick makes this work on a token of any size.
 *
 * ⚠ Price comes from the pool's own events — v3 `Swap.sqrtPriceX96`, v2 `Sync` reserves — so it is
 *   the pool's real executed state, not an index quote.
 */
import { createPublicClient, http, parseAbi, parseAbiItem, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';

const POOL = (process.argv[2] || '').toLowerCase();
const NAME = process.argv[3] || POOL.slice(0, 10);
if (!/^0x[0-9a-f]{40}$/.test(POOL)) { console.log('  usage: npm run lead -- 0x<pool address> [name]'); process.exit(1); }
const DAYS = Number(process.env.DAYS || 10);

const RPCS = ['https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org'];
const cs = RPCS.map(u => createPublicClient({ chain: mainnet, transport: http(u, { timeout: 30000, retryCount: 1 }) }));
const c = cs[0];

const V3 = parseAbi(['function fee() view returns (uint24)', 'function token0() view returns (address)', 'function token1() view returns (address)']);
const V2 = parseAbi(['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)', 'function token1() view returns (address)']);
const ERC = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)']);
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'.toLowerCase();

let kind = null, fee = 3000;
try { fee = Number(await c.readContract({ address: POOL, abi: V3, functionName: 'fee' })); kind = 'v3'; }
catch { try { await c.readContract({ address: POOL, abi: V2, functionName: 'getReserves' }); kind = 'v2'; } catch {} }
if (!kind) { console.log('  ⛔ not a recognisable v2 or v3 pool'); process.exit(1); }

const t0 = (await c.readContract({ address: POOL, abi: V3, functionName: 'token0' })).toLowerCase();
const t1 = (await c.readContract({ address: POOL, abi: V3, functionName: 'token1' })).toLowerCase();
const TOK = t0 === WETH ? t1 : t0;                       // the non-WETH side is "the token"
const tokIs0 = TOK === t0;
const [sym, dec] = await Promise.all([
  c.readContract({ address: TOK, abi: ERC, functionName: 'symbol' }).catch(() => '?'),
  c.readContract({ address: TOK, abi: ERC, functionName: 'decimals' }).catch(() => 18),
]);

const head = Number(await c.getBlockNumber());
const SEC = 12.042, span = Math.round(DAYS * 86400 / SEC);
const from = head - span;
console.log(`\n  ${NAME.toUpperCase()} · ${sym} · ${kind} · fee ${(fee / 10000).toFixed(2)}% · last ${DAYS} days (${span.toLocaleString()} blocks)`);

async function pull(addr, ev, args, label) {
  const out = []; let fails = 0, done = 0;
  const chunks = [];
  for (let lo = from; lo <= head; lo += 800) chunks.push([lo, Math.min(lo + 799, head)]);
  const q = chunks.slice();
  await Promise.all(cs.map(async cl => {
    for (;;) {
      const j = q.shift(); if (!j) return;
      let ok = false;
      for (let a = 0; a < 2 && !ok; a++) {
        try { out.push(...await cl.getLogs({ address: addr, event: ev, args, fromBlock: BigInt(j[0]), toBlock: BigInt(j[1]) })); ok = true; }
        catch { /* retry once, then count it */ }
      }
      if (!ok) fails++;
      if (++done % 200 === 0) process.stdout.write(`\r  ${label}: ${done}/${chunks.length}…   `);
    }
  }));
  process.stdout.write(`\r  ${label}: ${out.length} logs, ${fails} windows unreadable        \n`);
  return { out, fails };
}

const T = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const A = await pull(TOK, T, { from: POOL }, 'out of pool');
const B = await pull(TOK, T, { to: POOL }, 'into pool');
/* ⛔ Unreadable windows are reported, never swallowed — a gap in the tape biases the flow. */
const gaps = A.fails + B.fails;

const SWAP3 = parseAbiItem('event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)');
const SYNC2 = parseAbiItem('event Sync(uint112 reserve0, uint112 reserve1)');
const PX = kind === 'v3' ? await pull(POOL, SWAP3, undefined, 'price (v3 swaps)')
                         : await pull(POOL, SYNC2, undefined, 'price (v2 syncs)');
if (!PX.out.length) { console.log('  ⛔ no price events in the window — cannot measure.'); process.exit(1); }

/* price = WETH per token, from the pool's own state */
const pts = PX.out.map(l => {
  let p;
  if (kind === 'v3') {
    const raw = Math.pow(Number(l.args.sqrtPriceX96) / 2 ** 96, 2);   // token1 per token0, raw units
    p = tokIs0 ? raw * Math.pow(10, dec - 18) : (1 / raw) * Math.pow(10, dec - 18);
  } else {
    const r0 = Number(l.args.reserve0), r1 = Number(l.args.reserve1);
    if (!r0 || !r1) return null;
    p = tokIs0 ? (r1 / r0) * Math.pow(10, dec - 18) : (r0 / r1) * Math.pow(10, dec - 18);
  }
  return Number.isFinite(p) && p > 0 ? { b: Number(l.blockNumber), p } : null;
}).filter(Boolean).sort((x, y) => x.b - y.b);
const pb = pts.map(x => x.b);
const priceAt = b => { let i = 0, j = pb.length - 1, k = -1;
  while (i <= j) { const m = (i + j) >> 1; if (pb[m] <= b) { k = m; i = m + 1; } else j = m - 1; }
  return k < 0 ? null : pts[k].p; };

const flow = [];
for (const l of A.out) flow.push({ b: Number(l.blockNumber), v: +Number(formatUnits(l.args.value, dec)) });
for (const l of B.out) flow.push({ b: Number(l.blockNumber), v: -Number(formatUnits(l.args.value, dec)) });
flow.sort((x, y) => x.b - y.b);
console.log(`  ${pts.length.toLocaleString()} price points · ${flow.length.toLocaleString()} pool-side transfers${gaps ? `  ⚠ ${gaps} unreadable windows` : ''}`);

function test(minutes) {
  const w = Math.round(minutes * 60 / SEC);
  const rows = [];
  let i = 0;
  for (let b = from; b + 2 * w <= head; b += w) {
    let net = 0;
    while (i < flow.length && flow[i].b < b) i++;
    for (let k = i; k < flow.length && flow[k].b < b + w; k++) net += flow[k].v;
    const p0 = priceAt(b + w), p1 = priceAt(b + 2 * w);
    if (!p0 || !p1) continue;
    rows.push({ net, fwd: (p1 - p0) / p0 });
  }
  if (rows.length < 30) return `  ${String(minutes + 'm').padStart(6)}  only ${rows.length} windows`;
  const mn = rows.reduce((a, r) => a + r.net, 0) / rows.length;
  const mf = rows.reduce((a, r) => a + r.fwd, 0) / rows.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (const r of rows) { const x = r.net - mn, y = r.fwd - mf; sxy += x * y; sxx += x * x; syy += y * y; }
  const corr = sxy / Math.sqrt(sxx * syy || 1);
  const s = rows.slice().sort((a, b) => a.net - b.net), q = Math.floor(rows.length / 5);
  const top = s.slice(-q), bot = s.slice(0, q);
  const avg = xs => xs.reduce((a, r) => a + r.fwd, 0) / xs.length * 100;
  const up = xs => xs.filter(r => r.fwd > 0).length / xs.length * 100;
  const spread = avg(top) - avg(bot);
  const rt = 2 * (fee / 1e6) * 100;
  /* ⛔ THE TRIM TEST, AND IT IS THE ONLY ONE THAT DISCRIMINATES. A spread is an average, so a
   *   handful of violent windows can carry all of it while the other 98% contribute nothing —
   *   and you cannot identify those windows in advance, so an edge made of them is not a
   *   strategy. Measured on BITCOIN at 60 min: +0.742pp over 478 windows, and dropping the
   *   largest 2% of |moves| takes it to +0.227pp, under the toll. Ten hours out of 478 were the
   *   whole result. Without this check the tool would have reported it as tradeable. */
  /* ⚠ AND A 2% TRIM AT n=238 DROPS FIVE WINDOWS, WHICH IS NOT A TEST. Two runs of this check
   *   disagreed about BITCOIN — 20 days (n=478) died at 2%, 10 days (n=238) survived — and the
   *   difference was sample size, not the market. Report a LADDER and judge on 5%, and say when
   *   n is too small for any of it to mean much. */
  const trimAt = f => {
    const keep = rows.slice().sort((a, b) => Math.abs(a.fwd) - Math.abs(b.fwd)).slice(0, Math.floor(rows.length * (1 - f)));
    const qq = Math.floor(keep.length / 5), bn = keep.slice().sort((a, b) => a.net - b.net);
    return qq < 5 ? NaN : avg(bn.slice(-qq)) - avg(bn.slice(0, qq));
  };
  const t2 = trimAt(0.02), t5 = trimAt(0.05), t10 = trimAt(0.10);
  const dropped = Math.round(rows.length * 0.02);
  const weak = dropped < 8;
  return `  ${String(minutes + 'm').padStart(6)}  n=${String(rows.length).padStart(5)}  corr ${corr >= 0 ? '+' : ''}${corr.toFixed(3)}   ` +
    `accum→ ${(avg(top) >= 0 ? '+' : '') + avg(top).toFixed(3)}% (${up(top).toFixed(0)}% up)   ` +
    `sell→ ${(avg(bot) >= 0 ? '+' : '') + avg(bot).toFixed(3)}%   ` +
    `spread ${spread >= 0 ? '+' : ''}${spread.toFixed(3)}pp` +
    `  trim 2/5/10% ${[t2, t5, t10].map(x => (isNaN(x) ? ' n/a' : (x >= 0 ? '+' : '') + x.toFixed(2))).join(' / ')}  ` +
    `${spread > rt && t5 > rt ? '✅ CLEARS ' + rt.toFixed(2) + '% AND SURVIVES A 5% TRIM'
       : spread > rt ? '⛔ clears ' + rt.toFixed(2) + '% but DIES ON THE TRIM — a few windows carry it'
       : '⛔ under the ' + rt.toFixed(2) + '% round trip'}` +
    (weak ? `  ⚠ n too small: a 2% trim drops only ${dropped} windows` : '');
}

console.log(`\n  does net flow in window t predict the return in window t+1?`);
for (const m of [5, 15, 30, 60]) console.log(test(m));
console.log(`\n  ⚑ TWO bars, and the second is the one that fails things: the spread must beat the round`);
console.log(`     trip (${(2 * fee / 1e4).toFixed(2)}%), AND it must survive dropping the largest 2% of moves. A real`);
console.log(`     correlation whose spread is under the toll is a fact about the market, not a trade —`);
console.log(`     and a spread that dies on the trim was never a spread, it was a few events.\n`);

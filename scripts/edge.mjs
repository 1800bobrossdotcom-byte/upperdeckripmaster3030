#!/usr/bin/env node
/* ripmaster3030studios — THE EDGE SCREEN.  `npm run edge`
 *
 *   npm run edge                 ethereum, 12 h of tape
 *   CHAIN=base npm run edge
 *   HOURS=48 BUCKET=15 npm run edge
 *
 * ⛔ THE BAR IS THE FEE, NOT THE MARKET, AND NOBODY HAD PUT A NUMBER ON IT. `npm run book` walks the
 *   real depth curve, and at the size this treasury can actually trade — 0.01 ETH, about twenty
 *   dollars — the price impact on a major pool is ZERO to three decimals. Measured on PEPE: a
 *   0.01 WETH round trip costs 0.600%, and 0.600% is exactly 2 × the pool's 0.3% fee. On
 *   USDC/WETH 0.05% the same round trip costs 0.100% = 2 × 0.05%.
 *   ⚑ SO AT OUR SIZE THE ENTIRE COST IS THE FEE TIER, AND THE FEE TIER IS A CHOICE. Every screen
 *   this project has run so far was pointed at 0.3% pools, i.e. hunting for a signal that predicts
 *   a 0.6% move. The same signal is six times easier to pay for in a 0.05% pool. That is not a
 *   better signal — it is a lower bar, and it was free the whole time.
 *
 * ⚑ WHAT THIS RANKS: mean absolute move per bucket ÷ round-trip cost. Call it the WORK RATIO. It
 *   asks whether there is enough movement here for ANY signal to clear the toll.
 * ⛔ AND IT IS A NECESSARY CONDITION, NEVER A SUFFICIENT ONE. A high ratio does not mean money; it
 *   means money is not arithmetically impossible. You still only collect it if you can call the
 *   DIRECTION, and every directional signal measured on this project so far has failed
 *   out-of-sample. What the ratio does is eliminate — a pool where the average move is smaller
 *   than the toll cannot be traded by anyone, however good the signal, and most pools are that.
 *
 * ⚠ Mean |move| is symmetric and a coin flip captures none of it. Do not read the top of this
 *   table as a shortlist of trades. Read it as the only places worth spending a backtest on.
 *
 * ⛔ AND THE FIRST VERSION LEFT GAS OUT ENTIRELY, WHICH AT THIS SIZE IS NOT A ROUNDING ERROR. A
 *   swap is ~150k gas; two of them is a round trip, and on a $20 notional that is a percentage,
 *   not a fee. ⚠ I nearly published "2.9% on Ethereum" from a 1 gwei assumption — the live number
 *   was 0.0339 gwei and the true cost 0.097%, a 30× error in the alarming direction. MEASURED, not
 *   assumed, and read live on every run: gas is the one input here that moves three orders of
 *   magnitude between a quiet Sunday and a mint, so a constant would be wrong almost always.
 *   ⚑ It is also why the size matters more than anything else on this page: gas is FIXED per
 *   trade, so it falls as a share of notional. The same pool that is untradeable at $20 can be
 *   fine at $200 for no reason but arithmetic.
 */
import { createPublicClient, http, parseAbi, parseAbiItem } from 'viem';
import { mainnet, base } from 'viem/chains';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHAIN = (process.env.CHAIN || 'ethereum').toLowerCase();
const IS_BASE = CHAIN === 'base';
const RPCS = IS_BASE ? ['https://mainnet.base.org', 'https://base.drpc.org']
                     : ['https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org'];
const cs = RPCS.map(u => createPublicClient({ chain: IS_BASE ? base : mainnet, transport: http(u, { timeout: 30000, retryCount: 1 }) }));
const c = cs[0];
const HOURS = Number(process.env.HOURS || 12);
const BUCKET = Number(process.env.BUCKET || 15);         // minutes
const SECS = IS_BASE ? 2 : 12.042;
const TOPN = Number(process.env.TOPN || 60);
const MINLIQ = Number(process.env.MINLIQ || 150000);
const HZ = (process.env.HZ || '15,60,240,720').split(',').map(Number);
const STAKE_ETH = Number(process.env.STAKE_ETH || 0.01);
const ETH_USD = Number(process.env.ETH_USD || 1914.72);
const GAS_UNITS = BigInt(process.env.GAS_UNITS || 150000);   // one router swap, warm

const SWAP3 = parseAbiItem('event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)');
const V3 = parseAbi(['function fee() view returns (uint24)', 'function token0() view returns (address)', 'function token1() view returns (address)']);
const ERC = parseAbi(['function decimals() view returns (uint8)']);

const QUOTES = new Set(Object.keys(IS_BASE
  ? { '0x4200000000000000000000000000000000000006': 1, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 1 }
  : { '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 1, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 1,
      '0xdac17f958d2ee523a2206206994597c13d831ec7': 1 }));

/* Candidates come from a public index and every number that decides anything is re-read from the
 * chain — the index is wrong about fees and blind to hooks. ⚠ /tokens/<address>, never /search:
 * search returns one pair per token and would hide most of the fee tiers, which are the subject. */
const SEED = IS_BASE
  ? ['BRETT', 'TOSHI', 'DEGEN', 'AERO', 'MIGGLES', 'KEYCAT', 'MOCHI', 'NORMIE', 'DOGINME', 'BASED', 'WETH', 'cbBTC']
  : ['PEPE', 'SHIB', 'MOG', 'SPX6900', 'TURBO', 'NEIRO', 'ANDY', 'WOJAK', 'LADYS', 'BITCOIN',
     'APU', 'BOBO', 'ELON', 'PONKE', 'WETH', 'WBTC', 'LINK', 'UNI', 'AAVE', 'ENA'];

async function candidates() {
  const addrs = new Map();
  for (const sym of SEED) {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${sym}`, { signal: AbortSignal.timeout(12000) });
      const j = await r.json();
      const best = (j.pairs || [])
        .filter(p => p.chainId === (IS_BASE ? 'base' : 'ethereum') && p.baseToken?.symbol?.toUpperCase() === sym.toUpperCase())
        .sort((a, b) => Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0))[0];
      if (best) addrs.set(best.baseToken.address.toLowerCase(), best.baseToken.symbol);
    } catch {}
  }
  const out = [];
  for (const [addr, sym] of addrs) {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, { signal: AbortSignal.timeout(12000) });
      const j = await r.json();
      for (const p of (j.pairs || [])) {
        if (p.chainId !== (IS_BASE ? 'base' : 'ethereum') || !p.pairAddress) continue;
        if (Number(p.liquidity?.usd || 0) < MINLIQ) continue;
        if (/v4/i.test((p.labels || []).join(','))) continue;      // stated in the header, not silent
        out.push({ sym, pool: p.pairAddress.toLowerCase(), dex: p.dexId,
          liq: Number(p.liquidity?.usd || 0), vol: Number(p.volume?.h24 || 0) });
      }
    } catch {}
  }
  const seen = new Set();
  return out.filter(p => !seen.has(p.pool) && seen.add(p.pool))
    .sort((a, b) => b.vol - a.vol).slice(0, TOPN);
}

/* ⚠ LIVE, because this is the input that moves 300× and a stale constant is a wrong verdict. */
const gasPrice = await c.getGasPrice();
const gasEthPerSwap = Number(gasPrice * GAS_UNITS) / 1e18;
const gasPct = (2 * gasEthPerSwap / STAKE_ETH) * 100;        // round trip, as % of notional

const head = Number(await c.getBlockNumber());
const from = head - Math.round(HOURS * 3600 / SECS);
const perBucket = Math.max(1, Math.round(BUCKET * 60 / SECS));

async function tape(pool) {
  const step = IS_BASE ? 6000 : 3000;
  const jobs = []; for (let lo = from; lo <= head; lo += step) jobs.push([lo, Math.min(lo + step - 1, head)]);
  const out = []; let fails = 0;
  const q = jobs.slice();
  await Promise.all(cs.map(async x => { for (;;) { const j = q.shift(); if (!j) return;
    let ok = false;
    for (let a = 0; a < 2 && !ok; a++) {
      try { out.push(...await x.getLogs({ address: pool, event: SWAP3, fromBlock: BigInt(j[0]), toBlock: BigInt(j[1]) })); ok = true; } catch {}
    }
    if (!ok) fails++; } }));
  return { out, fails };
}

console.log(`\n  THE EDGE SCREEN · ${CHAIN} · ${HOURS}h of tape in ${BUCKET}-minute buckets · size ${STAKE_ETH} ETH`);
console.log(`  toll = 2 × fee  +  2 × gas.  Impact is ZERO at this size (the book walks the curve and says so).`);
console.log(`  gas now ${(Number(gasPrice) / 1e9).toFixed(4)} gwei → ${gasEthPerSwap.toFixed(8)} ETH/swap = ${gasPct.toFixed(3)}% round trip on ${STAKE_ETH} ETH ($${(STAKE_ETH * ETH_USD).toFixed(0)})\n`);
const cands = await candidates();
console.log(`  ${cands.length} pools over $${(MINLIQ / 1000).toFixed(0)}k liquidity\n`);
if (!cands.length) { console.log('  ⚠ the index returned nothing — a failed read, not an absence of pools.\n'); process.exit(0); }

const rows = [];
for (const p of cands) {
  try {
    const [fee, t0, t1] = await Promise.all([
      c.readContract({ address: p.pool, abi: V3, functionName: 'fee' }),
      c.readContract({ address: p.pool, abi: V3, functionName: 'token0' }),
      c.readContract({ address: p.pool, abi: V3, functionName: 'token1' })]);
    const quoteIs0 = QUOTES.has(t0.toLowerCase());
    if (!quoteIs0 && !QUOTES.has(t1.toLowerCase())) continue;      // no quote, no comparable price
    const dq = Number(await c.readContract({ address: quoteIs0 ? t0 : t1, abi: ERC, functionName: 'decimals' }).catch(() => 18));

    const { out: sw, fails } = await tape(p.pool);
    if (sw.length < 20) { rows.push({ ...p, fee: Number(fee), err: `${sw.length} swaps` }); continue; }

    /* ⚑ THE HORIZON IS A DIAL, AND IT IS THE ONLY ONE THAT MOVES THE BAR. The toll is fixed per
     *   round trip; the move grows with holding time — roughly √t for anything near a random walk.
     *   So a pool that is untradeable at 15 minutes can be tradeable at 4 hours purely because you
     *   crossed the toll fewer times per unit of movement. Measuring the ladder turns "no edge
     *   here" into the sharper and more useful "no edge here BELOW N hours". */
    let volQ = 0;
    for (const l of sw) volQ += Math.abs(Number(quoteIs0 ? l.args.amount0 : l.args.amount1)) / 10 ** dq;
    /* ⛔ THE TOLL IS THE FEE **PLUS GAS**. Two swaps of fee, two swaps of gas, and at 0.01 ETH the
     *   gas half is the same order as the fee half — leaving it out flattered every pool equally
     *   and flattered the CHEAP pools most, which is precisely the ranking this file produces. */
    const cost = Number(fee) / 5000 + gasPct;                                      // round trip %
    const madAt = mins => {
      const per = Math.max(1, Math.round(mins * 60 / SECS));
      const byB = new Map();
      for (const l of sw) {
        const b = Math.floor((Number(l.blockNumber) - from) / per);
        const prev = byB.get(b);
        if (!prev || Number(l.blockNumber) >= prev.bn) byB.set(b, { bn: Number(l.blockNumber), tick: Number(l.args.tick) });
      }
      const ks = [...byB.keys()].sort((a, b) => a - b);
      const px = ks.map(k => { const raw = Math.pow(1.0001, byB.get(k).tick); return quoteIs0 ? 1 / raw : raw; });
      const rets = [];
      for (let i = 1; i < px.length; i++) if (px[i - 1] > 0) rets.push(Math.log(px[i] / px[i - 1]));
      /* ⛔ a mean over four buckets is not a measurement. Say so rather than print it. */
      if (rets.length < 8) return null;
      return rets.reduce((a, r) => a + Math.abs(r), 0) / rets.length * 100;
    };
    const ladder = HZ.map(h => ({ min: h, mad: madAt(h) })).map(x => ({ ...x, ratio: x.mad == null ? null : x.mad / cost }));
    const base = ladder.find(x => x.min === BUCKET) || ladder.find(x => x.ratio != null);
    if (!base || base.ratio == null) { rows.push({ ...p, fee: Number(fee), err: 'too few buckets' }); continue; }
    /* the shortest horizon at which the average move finally clears the toll */
    const cross = ladder.find(x => x.ratio != null && x.ratio >= 1);
    /* quoteIs0 + decimals ride along so the LIVE page can price this pool from one slot0 read
     * instead of re-deriving what has already been measured. ⚠ Which side is the quote is the
     * exact thing `npm run resting` got wrong by assuming; it is never inferred twice. */
    rows.push({ ...p, fee: Number(fee), swaps: sw.length, volQ, ladder, crossMin: cross ? cross.min : null,
      madPct: base.mad, costPct: cost, ratio: base.ratio, fails, quoteIs0, dq, dt: null, t0, t1 });
  } catch (e) { rows.push({ ...p, err: String(e.shortMessage || e.message).slice(0, 34) }); }
}

const ok = rows.filter(r => r.ratio != null && isFinite(r.ratio));
ok.sort((a, b) => b.ratio - a.ratio);
const hz = h => h >= 60 ? `${h / 60}h` : `${h}m`;
console.log(`  ${'token'.padEnd(10)} ${'dex'.padEnd(10)} ${'fee'.padStart(6)} ${'toll'.padStart(7)}  ` +
  HZ.map(h => `ratio@${hz(h)}`.padStart(11)).join(' ') + `  ${'tradeable from'.padStart(15)}`);
for (const r of ok.slice(0, 30)) {
  const cells = HZ.map(h => { const x = r.ladder.find(l => l.min === h);
    return (x && x.ratio != null ? x.ratio.toFixed(2) : '·').padStart(11); }).join(' ');
  const verdict = r.crossMin == null ? '⛔ never, at any horizon measured' : `⚑ ${hz(r.crossMin)}`;
  console.log(`  ${r.sym.slice(0, 9).padEnd(10)} ${String(r.dex).slice(0, 9).padEnd(10)} ${((r.fee / 10000).toFixed(2) + '%').padStart(6)} ${(r.costPct.toFixed(3) + '%').padStart(7)}  ${cells}  ${verdict.padStart(15)}`);
}
const bad = rows.filter(r => r.err);
if (bad.length) console.log(`\n  ${bad.length} skipped: ${bad.slice(0, 6).map(r => `${r.sym}(${r.err})`).join(' · ')}${bad.length > 6 ? ' …' : ''}`);

const best = ok[0];
console.log(`\n  ⚑ RATIO is mean |move| per bucket ÷ round-trip toll. Above 1 a perfect forecaster makes`);
console.log(`     money; below 1 NOBODY can, at any skill level, and that is the useful half — it`);
console.log(`     deletes pools from the search instead of adding hope to it.`);
console.log(`  ⛔ It is NECESSARY, NOT SUFFICIENT. |move| is symmetric and a coin flip collects none of`);
console.log(`     it. Every directional signal measured on this project has failed out-of-sample, so`);
console.log(`     read the top of this table as "where a backtest is worth running", never as a trade.`);
console.log(`  ⚑ TRADEABLE FROM is the shortest holding period whose average move finally clears the`);
console.log(`     toll. It is the single most useful number here, because it is not a forecast — it`);
console.log(`     is an arithmetic floor on how long a position has to be held in THIS pool to have`);
console.log(`     any chance at all. A bot scalping under that number is paying to play.`);
console.log(`  ⚠ GAS IS LIVE AND IT IS ${gasPct.toFixed(3)}% OF THIS TRADE RIGHT NOW. It is fixed per trade, so it`);
console.log(`     shrinks as a share of a bigger one — every verdict above is a verdict about ${STAKE_ETH} ETH`);
console.log(`     at ${(Number(gasPrice) / 1e9).toFixed(3)} gwei, and re-runs with either one different.`);
if (best) console.log(`  ⚠ Best here: ${best.sym} ${(best.fee / 10000).toFixed(2)}% — ratio ${best.ratio.toFixed(2)} at ${hz(BUCKET)}, clears at ${best.crossMin == null ? 'no measured horizon' : hz(best.crossMin)}.\n`);

const OUT = process.env.JSON || join(ROOT, `data/edge-${CHAIN}.json`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ chain: CHAIN, hours: HOURS, bucketMin: BUCKET, readAt: new Date().toISOString(),
  stakeEth: STAKE_ETH, gasGwei: +(Number(gasPrice) / 1e9).toFixed(5), gasPctRoundTrip: +gasPct.toFixed(4),
  rows: ok.map(r => ({ sym: r.sym, pool: r.pool, dex: r.dex, feeBps: r.fee / 100, costPct: +r.costPct.toFixed(4),
    madPct: +r.madPct.toFixed(4), ratio: +r.ratio.toFixed(3), crossMin: r.crossMin, swaps: r.swaps,
    ladder: r.ladder.map(l => ({ min: l.min, ratio: l.ratio == null ? null : +l.ratio.toFixed(3) })),
    quoteIs0: r.quoteIs0, dq: r.dq, t0: r.t0, t1: r.t1, feeOnlyPct: +(r.fee / 5000).toFixed(4),
    liqUsd: Math.round(r.liq) })) }, null, 1));
console.log(`  wrote ${OUT}\n`);

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
/* ⛔ 150,000 WAS A GUESS AND IT UNDERSTATED THE ROUND TRIP BY 1.7×. Measured with `estimateGas`
 *   against the live Aerodrome Slipstream router on Base: BUY 265,647 · SELL 244,398 · and a
 *   one-off APPROVE of 60,773. A round trip is 510,045 gas, not 300,000.
 *   ⚑ It is not a rounding error at this size: it is what pushed the best Base pool's 15-minute
 *   ratio from 1.572 to 0.695 — from "a perfect forecaster profits" to "a perfect forecaster
 *   loses". A guessed constant in the denominator of every verdict is the whole ballgame.
 * ⚠ Still an estimate, and still per-chain-generic. A receipt's gasUsed will differ, and the sell
 *   leg's number in particular depends on how many initialized ticks the swap crosses. */
const GAS_BUY = BigInt(process.env.GAS_BUY || 265647);
const GAS_SELL = BigInt(process.env.GAS_SELL || 244398);
const GAS_UNITS = GAS_BUY + GAS_SELL;                        // one ROUND TRIP, both legs

const SWAP3 = parseAbiItem('event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)');
const V3 = parseAbi(['function fee() view returns (uint24)', 'function token0() view returns (address)', 'function token1() view returns (address)', 'function factory() view returns (address)', 'function tickSpacing() view returns (int24)']);
const ROUTER = parseAbi(['function factory() view returns (address)']);

/* ⛔ TWO WAYS A POOL CAN TOP THIS TABLE AND BE UNTRADEABLE, both found by adversarial review of an
 *   earlier run, both silent:
 *   (a) A DYNAMIC FEE. Aerodrome Slipstream pools can move their fee — one read 75, another 375,
 *       minutes apart. `fee()` sampled once is a snapshot presented as a constant, and the toll is
 *       the denominator of every verdict here.
 *   (b) NO ROUTER THAT CAN REACH IT. The screen's own top-ratio pool was spawned by a factory the
 *       canonical router does not recognise: 703 swaps in 30k blocks, every one from a bespoke bot
 *       contract, no retail router present. Ranking it first is pointing at a market you cannot
 *       trade — the FWA "5.36% arb" mistake in a new costume. */
const KNOWN_ROUTERS = IS_BASE
  ? { '0x2626664c2603336E57B271c5C0b26F421741e481': 'uniswap-v3',
      '0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5': 'aerodrome-slipstream' }
  : { '0xE592427A0AEce92De3Edee1F18E0157C05861564': 'uniswap-v3' };
/* ⛔ AND A FAILED READ MUST NOT BECOME A VERDICT. The first version let an unreachable router
 *   silently produce an empty factory set, so EVERY pool came back "NO KNOWN ROUTER" — a definite
 *   negative manufactured out of a network error, printed with total confidence. That is this
 *   project's most expensive recurring failure (a clean zero from a measurement that never looked)
 *   and it took ten minutes to reproduce it here. `routableKnown` separates "checked, not routable"
 *   from "could not check", and the table prints different words for each. */
const routableFactories = new Map();
let routerReads = 0;
for (const [r, name] of Object.entries(KNOWN_ROUTERS)) {
  for (const cl of cs) {
    try {
      const f = await cl.readContract({ address: r, abi: ROUTER, functionName: 'factory' });
      routableFactories.set(f.toLowerCase(), name); routerReads++; break;
    } catch {}
  }
}
const routableKnown = routerReads > 0;
if (!routableKnown) console.log(`  ⚠ could not read any router's factory — routability is UNKNOWN below, not "no"\n`);
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
const gasEthRoundTrip = Number(gasPrice * GAS_UNITS) / 1e18;
const gasPct = (gasEthRoundTrip / STAKE_ETH) * 100;          // round trip, as % of notional

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
console.log(`  gas now ${(Number(gasPrice) / 1e9).toFixed(4)} gwei · ${GAS_UNITS} units/round trip (measured, not assumed) → ${gasEthRoundTrip.toFixed(8)} ETH = ${gasPct.toFixed(3)}% on ${STAKE_ETH} ETH ($${(STAKE_ETH * ETH_USD).toFixed(0)})\n`);
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
    /* (a) ⚠ SAMPLED IN WALL-CLOCK, NOT HISTORICALLY. Reading fee() at head-43200 is an ARCHIVE
     *   query; a public endpoint refuses it, and 88 refusals rate-limited the whole run into
     *   skipping 41 of 44 pools. The second sample is taken AFTER the tape fetch below, which
     *   naturally spans seconds and blocks.
     *   ⚠ And the label is honest about what that proves: "not observed to change" over two reads
     *   is not immutability. The factory has an owner; a fixed reading is a fact about today. */
    const feeSamples = new Set([Number(fee)]);
    /* (b) can a router this project would actually use even reach it? */
    let routedBy = null, routeChecked = false;
    if (routableKnown) {
      for (const cl of cs) {
        try {
          const f = (await cl.readContract({ address: p.pool, abi: V3, functionName: 'factory' })).toLowerCase();
          routedBy = routableFactories.get(f) || null; routeChecked = true; break;
        } catch {}
      }
    }
    const quoteIs0 = QUOTES.has(t0.toLowerCase());
    if (!quoteIs0 && !QUOTES.has(t1.toLowerCase())) continue;      // no quote, no comparable price
    const dq = Number(await c.readContract({ address: quoteIs0 ? t0 : t1, abi: ERC, functionName: 'decimals' }).catch(() => 18));

    const { out: sw, fails } = await tape(p.pool);
    /* the second fee sample — seconds and blocks after the first, for free */
    try { feeSamples.add(Number(await c.readContract({ address: p.pool, abi: V3, functionName: 'fee' }))); } catch {}
    const feeDynamic = feeSamples.size > 1;
    const feeUse = Math.max(...feeSamples);          // price the WORST fee seen, never the friendliest
    if (sw.length < 20) { rows.push({ ...p, fee: feeUse, err: `${sw.length} swaps` }); continue; }

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
    const cost = feeUse / 5000 + gasPct;                                           // round trip %
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
    rows.push({ ...p, fee: feeUse, feeNow: Number(fee), feeDynamic, feeSeen: [...feeSamples].sort((a, b) => a - b),
      routedBy, routeChecked, swaps: sw.length, volQ, ladder, crossMin: cross ? cross.min : null,
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
  let verdict = r.crossMin == null ? '⛔ never, at any horizon measured' : `⚑ ${hz(r.crossMin)}`;
  /* a pool no router reaches is not a market, whatever its ratio says */
  if (!r.routeChecked) verdict += ' ⚠ route unchecked';
  else if (!r.routedBy) verdict = '⛔ NO KNOWN ROUTER';
  else if (r.feeDynamic) verdict += ' ⚠ dyn fee';
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
    feeDynamic: r.feeDynamic, feeSeen: r.feeSeen, routedBy: r.routedBy, routeChecked: r.routeChecked,
    liqUsd: Math.round(r.liq) })) }, null, 1));
console.log(`  wrote ${OUT}\n`);

#!/usr/bin/env node
/* ripmaster3030studios — THE BOOK.  `npm run book -- <v3 pool> [name]`
 *
 *   npm run book -- 0x11950d…                    the complete depth curve
 *   CHAIN=base npm run book -- 0x…
 *   JSON=data/book-pepe.json npm run book -- 0x… so a bot can read it
 *
 * ⛔ THIS IS THE ORDER BOOK THAT EVERY CHART REFUSES TO DRAW, AND IT IS FREE. A Uniswap v3 pool
 *   stores its liquidity as `liquidityNet` on initialized ticks, and which ticks are initialized
 *   is a BITMAP. So the whole depth curve — every resting order, at every price, right now — is
 *   about thirty `eth_call`s. No history scan, no indexer, nobody to trust.
 *
 * ⛔ AND IT SUPERSEDES `npm run resting` ON COMPLETENESS, WHICH IS THE POINT. That file
 *   reconstructs positions from Mint/Burn logs inside a WINDOW, so a position minted before the
 *   window is invisible and the book is silently truncated — it prints as though it were the whole
 *   book. This reads current state, so it cannot miss an old order. ⚑ The trade is that state is
 *   aggregate: it tells you how much is resting at a price, never who placed it or when. Use
 *   `resting` to see individual positions and their age; use this to size a trade.
 *
 * ⚑ WHAT IT IS ACTUALLY FOR: every bot decision reduces to "what will I really get at this size",
 *   and the honest answer is a walk down the curve, not a spot price. Walking it LOCALLY means a
 *   fleet can price hundreds of pools per minute without a quoter call per pool per size — and the
 *   answer is exact, because it is the same arithmetic the pool runs.
 * ⚠ Exact for THIS pool at THIS block. It does not know about the next block, MEV, or a router
 *   splitting across venues. A quote is a measurement, not a promise.
 *
 * ⚠ v3-shaped pools only (Uniswap v3 and its forks). v4 keeps the same bitmap inside the singleton
 *   behind `extsload`, and a hook can change the fee or refuse the trade outright — those go
 *   through `npm run mm scan`, one at a time, deliberately.
 */
import { createPublicClient, http, parseAbi, formatUnits } from 'viem';
import { mainnet, base } from 'viem/chains';

const ARG = (process.argv[2] || '').toLowerCase();
const NAME = process.argv[3] || '';
const CHAIN = (process.env.CHAIN || 'ethereum').toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(ARG)) {
  console.log('  usage: npm run book -- 0x<v3 pool address> [name]');
  console.log('         CHAIN=base  JSON=data/book.json  npm run book -- 0x…');
  process.exit(1);
}
const RPCS = CHAIN === 'base'
  ? ['https://mainnet.base.org', 'https://base.drpc.org']
  : ['https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org'];
const c = createPublicClient({ chain: CHAIN === 'base' ? base : mainnet, transport: http(RPCS[0], { timeout: 30000, retryCount: 1 }) });
const c2 = createPublicClient({ chain: CHAIN === 'base' ? base : mainnet, transport: http(RPCS[1], { timeout: 30000, retryCount: 1 }) });

const V3 = parseAbi([
  'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)',
  'function token0() view returns (address)', 'function token1() view returns (address)',
  'function fee() view returns (uint24)', 'function tickSpacing() view returns (int24)',
  'function liquidity() view returns (uint128)',
  'function tickBitmap(int16) view returns (uint256)',
  'function ticks(int24) view returns (uint128,int128,uint256,uint256,int56,uint160,uint32,bool)']);
const ERC = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)']);

/* Bid and ask are defined relative to the QUOTE, so the quote is named rather than inferred from
 * address ordering — WETH is 0xC02a… and sorts AFTER most tokens, so "token0 is the quote" is
 * false far more often than it is true. `npm run resting` printed a whole book upside down on
 * exactly that assumption. */
const QUOTES = new Map(Object.entries(CHAIN === 'base'
  ? { '0x4200000000000000000000000000000000000006': 'WETH',
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC' }
  : { '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
      '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT' }));

const [slot0, t0, t1, fee, spacing, L0] = await Promise.all([
  c.readContract({ address: ARG, abi: V3, functionName: 'slot0' }),
  c.readContract({ address: ARG, abi: V3, functionName: 'token0' }),
  c.readContract({ address: ARG, abi: V3, functionName: 'token1' }),
  c.readContract({ address: ARG, abi: V3, functionName: 'fee' }),
  c.readContract({ address: ARG, abi: V3, functionName: 'tickSpacing' }),
  c.readContract({ address: ARG, abi: V3, functionName: 'liquidity' }),
]).catch(e => { console.log(`\n  ⛔ not a v3-shaped pool: ${String(e.shortMessage || e.message).slice(0, 90)}\n`); process.exit(1); });

const TICK = Number(slot0[1]), SPACING = Number(spacing), FEE = Number(fee);
const q0 = QUOTES.get(t0.toLowerCase()), q1 = QUOTES.get(t1.toLowerCase());
if (!q0 && !q1) { console.log(`\n  ⛔ neither side is a known quote asset — bid and ask are undefined here. Refusing to guess.\n`); process.exit(1); }
const quoteIs0 = !!q0;
const QUOTE = quoteIs0 ? q0 : q1;
const tokAddr = quoteIs0 ? t1 : t0;
const [sym, decT, decQ] = await Promise.all([
  c.readContract({ address: tokAddr, abi: ERC, functionName: 'symbol' }).catch(() => NAME.toUpperCase() || '?'),
  c.readContract({ address: tokAddr, abi: ERC, functionName: 'decimals' }).catch(() => 18),
  c.readContract({ address: quoteIs0 ? t0 : t1, abi: ERC, functionName: 'decimals' }).catch(() => 18),
]);
const d0 = quoteIs0 ? Number(decQ) : Number(decT);
const d1 = quoteIs0 ? Number(decT) : Number(decQ);

/* ── walk the bitmap ─────────────────────────────────────────────────────────────────────────
 * compressed = floor(tick / spacing); wordPos = compressed >> 8; bitPos = compressed & 255.
 * ⚠ FLOOR, not truncate. JS `(-3388/60)|0` truncates toward zero and lands one tick out on every
 *   negative price — which is every token worth less than its quote, i.e. all of them. */
const compress = t => Math.floor(t / SPACING);
const wordOf = ct => ct >> 8;
/* ⛔ A WINDOW OF ±N WORDS AROUND SPOT IS NOT SYMMETRIC IN WHAT IT MISSES, and that is how the first
 *   version cut the top off the book. Spot sits wherever it sits inside v3's ±887272 tick range, so
 *   ±64 words around a low price reaches far past the bottom and stops short of the top — measured
 *   on PEPE as a non-zero liquidity residue going up and exactly zero going down. Read the WHOLE
 *   legal range, which for any normal spacing is ~120 words and costs one multicall. */
const MIN_T = -887272, MAX_T = 887272;
const full = [wordOf(compress(MIN_T)), wordOf(compress(MAX_T))];
const CAP = Number(process.env.MAXWORDS || 1400);      // covers spacing ≥ 10 in full
let [wLo, wHi] = full, clamped = false;
if (wHi - wLo + 1 > CAP) {                      // only bites on spacing 1 pools
  const here = wordOf(compress(TICK));
  wLo = Math.max(full[0], here - (CAP >> 1)); wHi = Math.min(full[1], wLo + CAP - 1); clamped = true;
}
const WORDS = wHi - wLo + 1;
const words = [];
for (let w = wLo; w <= wHi; w++) words.push(w);

/* ⛔ ONE 1,548-CALL MULTICALL COMES BACK PART-EMPTY AND STILL "SUCCEEDS". Measured on USDC/WETH:
 *   112 silent failures, which corrupted the liquidity walk and reported the pool holding 614% of
 *   its own token0 balance. The node has a response-size limit and `allowFailure` turns hitting it
 *   into missing data rather than an error. Chunk it, retry each chunk, and COUNT what never came
 *   back — a book assembled from a partial read is the failure this whole file exists to avoid. */
const BATCH = Number(process.env.BATCH || 120);
async function mc(contracts) {
  const out = new Array(contracts.length);
  for (let i = 0; i < contracts.length; i += BATCH) {
    const slice = contracts.slice(i, i + BATCH);
    let res = null;
    for (let a = 0; a < 3 && !res; a++) {
      try { res = await c.multicall({ contracts: slice, allowFailure: true }); }
      catch { await new Promise(r => setTimeout(r, 300 * (a + 1))); }
    }
    for (let k = 0; k < slice.length; k++) out[i + k] = res ? res[k] : { status: 'failure' };
  }
  /* ⚠ AND CHUNKING IS NOT ENOUGH — individual calls still come back `failure` inside a chunk that
   *   otherwise succeeded (56 of 1,550 on USDC/WETH). Retry those one at a time, on the spare RPC,
   *   because one missed tick is a wrong curve for everything inward of it. */
  const miss = out.map((r, i) => r.status === 'success' ? -1 : i).filter(i => i >= 0);
  for (const i of miss) {
    for (const cl of [c, c2]) {
      try { out[i] = { status: 'success', result: await cl.readContract(contracts[i]) }; break; } catch {}
    }
  }
  return out;
}

const bits = await mc(words.map(w => ({ address: ARG, abi: V3, functionName: 'tickBitmap', args: [w] })));
const initialized = [];
words.forEach((w, i) => {
  if (bits[i].status !== 'success') return;
  const b = BigInt(bits[i].result);
  if (b === 0n) return;
  for (let bit = 0; bit < 256; bit++) if ((b >> BigInt(bit)) & 1n) initialized.push(((w << 8) + bit) * SPACING);
});
initialized.sort((a, b) => a - b);
if (initialized.length < 2) { console.log(`\n  ⛔ ${initialized.length} initialized tick(s) across ${WORDS} words — nothing to read.\n`); process.exit(1); }

const nets = await mc(initialized.map(t => ({ address: ARG, abi: V3, functionName: 'ticks', args: [t] })));
const net = new Map();
let readFails = bits.filter(b => b.status !== 'success').length;
initialized.forEach((t, i) => { if (nets[i].status === 'success') net.set(t, BigInt(nets[i].result[1])); else readFails++; });
/* ⛔ A FAILED `ticks()` READ IS NOT A MISSING TICK, IT IS A WRONG CURVE. `net.get(t) ?? 0n` makes
 *   the walk continue with the liquidity of every span beyond that tick silently wrong — and it
 *   still prints a full, plausible book. Count them and say so. */

/* Reconstruct L over every span. Crossing an initialized tick UPWARD adds liquidityNet; downward
 * subtracts it. Start from the pool's own reported active liquidity, which is ground truth. */
const spans = [];
let endUp = 0n, endDown = 0n;
{
  let L = BigInt(L0);
  const up = initialized.filter(t => t > TICK);
  let lo = TICK;
  for (const t of up) { spans.push({ lo, hi: t, L }); L += (net.get(t) ?? 0n); lo = t; }
  endUp = L;
}
{
  let L = BigInt(L0);
  const down = initialized.filter(t => t <= TICK).sort((a, b) => b - a);
  let hi = TICK;
  for (const t of down) { spans.push({ lo: t, hi, L }); L -= (net.get(t) ?? 0n); hi = t; }
  endDown = L;
}
spans.sort((a, b) => a.lo - b.lo);
/* ⚑ THE CLOSURE TEST, AND IT NEEDS NO BALANCE AND NO NETWORK. Walk past the last initialized tick
 *   in either direction and the liquidity MUST be exactly zero — every position that opened has
 *   closed. A non-zero residue means the walk missed ticks, so the curve is wrong from that point
 *   inward, and it would otherwise print as a complete book. */
const closes = endUp === 0n && endDown === 0n;

const sq = t => Math.pow(1.0001, t / 2);
/* amounts a span holds, in BASE units, when price is outside it */
const amt0 = s => Number(s.L) * (1 / sq(s.lo) - 1 / sq(s.hi));   // token0, held when price is BELOW the span
const amt1 = s => Number(s.L) * (sq(s.hi) - sq(s.lo));           // token1, held when price is ABOVE the span

/* token price in quote units, per whole token */
const priceAt = t => { const raw = Math.pow(1.0001, t) * Math.pow(10, d0 - d1); return quoteIs0 ? 1 / raw : raw; };
const SPOT = priceAt(TICK);
const pct = t => (priceAt(t) / SPOT - 1) * 100;

/* ── the two sides ───────────────────────────────────────────────────────────────────────────
 * Above the current tick the pool holds only token0; below, only token1. Whichever of those is
 * the QUOTE is the bid side. */
const above = spans.filter(s => s.lo >= TICK), below = spans.filter(s => s.hi <= TICK);
const bidSpans = quoteIs0 ? above : below;     // spans holding the quote → they can only buy
const askSpans = quoteIs0 ? below : above;     // spans holding the token → they can only sell
const bidQuote = s => quoteIs0 ? amt0(s) / 10 ** d0 : amt1(s) / 10 ** d1;
const askToken = s => quoteIs0 ? amt1(s) / 10 ** d1 : amt0(s) / 10 ** d0;

const bidWithin = p => bidSpans.filter(s => Math.abs(pct(quoteIs0 ? s.lo : s.hi)) <= p).reduce((a, s) => a + bidQuote(s), 0);
const askWithin = p => askSpans.filter(s => Math.abs(pct(quoteIs0 ? s.hi : s.lo)) <= p).reduce((a, s) => a + askToken(s), 0);

console.log(`\n  THE BOOK · ${sym}/${QUOTE} · ${CHAIN} · v3 · fee ${(FEE / 10000).toFixed(3)}% · spacing ${SPACING}`);
console.log(`  ${ARG}`);
console.log(`  spot tick ${TICK} · 1 ${sym} = ${SPOT < 1e-4 ? SPOT.toExponential(4) : SPOT.toPrecision(6)} ${QUOTE}`);
console.log(`  ${initialized.length} initialized ticks read from the bitmap · ${spans.length} spans · active L ${L0}`);

/* ── RECONCILIATION, and it is the only reason to believe any number above ───────────────────
 * Everything here is reconstructed. The pool's own token balances are not. So sum what the curve
 * says the pool is holding and compare it to `balanceOf` — if the walk missed liquidity outside
 * ±WORDS, or got the reconstruction wrong, this is where it shows up and nowhere else.
 * ⚠ The balance is expected to run a little ABOVE the curve: uncollected LP and protocol fees sit
 *   in the contract without being part of L. A curve ABOVE the balance is impossible and means the
 *   arithmetic is wrong; far below means the window is too narrow. */
const BAL = parseAbi(['function balanceOf(address) view returns (uint256)']);
const [b0, b1] = await Promise.all([
  c.readContract({ address: t0, abi: BAL, functionName: 'balanceOf', args: [ARG] }).catch(() => null),
  c.readContract({ address: t1, abi: BAL, functionName: 'balanceOf', args: [ARG] }).catch(() => null),
]);
const curve0 = spans.filter(s => s.lo >= TICK).reduce((a, s) => a + amt0(s), 0) / 10 ** d0;
const curve1 = spans.filter(s => s.hi <= TICK).reduce((a, s) => a + amt1(s), 0) / 10 ** d1;
const real0 = b0 == null ? null : Number(formatUnits(b0, d0));
const real1 = b1 == null ? null : Number(formatUnits(b1, d1));
const cover = (curve, real) => real ? curve / real : NaN;
const cov0 = cover(curve0, real0), cov1 = cover(curve1, real1);
const covOk = [cov0, cov1].every(x => isFinite(x) && x > 0.90 && x < 1.02);
console.log(`  reconciliation  curve/balance  token0 ${(cov0 * 100).toFixed(1)}%  token1 ${(cov1 * 100).toFixed(1)}%` +
  (covOk ? '  ✓ the walk accounts for the pool' : `  ⚠ short — see below`));
console.log(`  closure  L past the last tick: up ${endUp} · down ${endDown}` +
  (closes ? '  ✓ the walk read every tick' : `  ⛔ NON-ZERO — ticks were missed, the curve is wrong inward of them`) +
  (readFails ? `  ⛔ ${readFails} failed read(s)` : '') +
  (clamped ? `  ⚠ tick range CLAMPED to ${WORDS} words (spacing ${SPACING}) — raise MAXWORDS` : ''));
if (!covOk && closes && !readFails) {
  console.log(`  ⚑ the curve closes and every read succeeded, so the shortfall is NOT missing liquidity:`);
  console.log(`     it is value in the contract that is not part of L — uncollected LP and protocol fees,`);
  console.log(`     and anything transferred in directly. Depth and quotes are unaffected by it.`);
}
console.log(`  ⚑ complete at this block — no window, so no position is too old to appear.\n`);

console.log(`  ${'band'.padStart(8)}  ${`bid depth (${QUOTE})`.padStart(20)}  ${`ask depth (${sym})`.padStart(22)}`);
for (const p of [0.5, 1, 2, 5, 10, 25]) {
  const b = bidWithin(p), a = askWithin(p);
  console.log(`  ${('±' + p + '%').padStart(8)}  ${b.toLocaleString(undefined, { maximumFractionDigits: 4 }).padStart(20)}  ${a.toLocaleString(undefined, { maximumFractionDigits: 2 }).padStart(22)}`);
}

/* ── exact quotes, by walking the curve the way the pool does ─────────────────────────────────
 * ⛔ THE DIRECTION LOGIC HERE WAS WRONG FOUR WAYS AT ONCE AND THE OUTPUT LOOKED PLAUSIBLE, which
 *   is the only reason it is worth this many lines of comment. Selling token1 for token0 pushes
 *   the price UP; selling token0 pushes it DOWN. Walking UP, the pool takes token1 and pays out
 *   token0 — so `in` is amt1 and `out` is amt0, not the reverse. The first version had both the
 *   direction AND the in/out pairing inverted, and the two inversions CANCELLED into a number
 *   that had the right order of magnitude: identical slippage at every size across a 500× range,
 *   and a round trip that came back +1.206% — i.e. it reported that buying and instantly selling
 *   MADE money, on a pool charging 0.3% a side.
 * ⚑ Nothing errored. The tell was that a 0.01 and a 5 WETH order priced identically, and the only
 *   reason that was visible is that the size ladder was printed rather than a single quote.
 *   ⚠ A quoter that reports the same price at every size is not "deep", it is not walking. */
const UP = spans.filter(s => s.lo >= TICK).sort((a, b) => a.lo - b.lo);
const DOWN = spans.filter(s => s.hi <= TICK).sort((a, b) => b.hi - a.hi);

/* ⛔ AND THEN THE SECOND VERSION PRICED EVERY SIZE THE SAME, WHICH IS THE SAME BUG WEARING A
 *   PLAUSIBLE FACE. Filling PART of a span by linear interpolation — `got = outCap * left/inCap` —
 *   is exactly proportional, so the average price it reports is the average across the WHOLE span
 *   no matter how little you buy. Measured: 0.01 WETH and 5 WETH both quoted +1.634% slippage on
 *   PEPE, a 500× size range at one price. ⚑ The tell is structural, not numerical: a curve that
 *   returns a constant average price is a LINE, and the entire reason to walk a book is that it
 *   is not one. A partial fill has to use the pool's own arithmetic.
 * ⚑ Written cancellation-free on purpose. Δ0 = L·(1/√a − 1/√b) subtracts two numbers around 25,906
 *   to get ~0.1 and throws away five significant digits; the algebraically identical Δ0 = Δ1/(√a·√b)
 *   never forms the difference at all. */
const LN = Math.log(1.0001);
function walk(amountInHuman, dir) {
  /* dir +1 = price rises: input is token1, output is token0.
     dir −1 = price falls: input is token0, output is token1. */
  const dIn = dir > 0 ? d1 : d0, dOut = dir > 0 ? d0 : d1;
  let left = amountInHuman * (1 - FEE / 1e6) * 10 ** dIn;      // raw base units
  let out = 0, t = TICK;
  for (const s of (dir > 0 ? UP : DOWN)) {
    const L = Number(s.L);
    const inCap = dir > 0 ? amt1(s) : amt0(s);
    const outCap = dir > 0 ? amt0(s) : amt1(s);
    if (!(L > 0) || !(inCap > 0) || !isFinite(inCap)) { t = dir > 0 ? s.hi : s.lo; continue; }
    if (left >= inCap) { left -= inCap; out += outCap; t = dir > 0 ? s.hi : s.lo; continue; }
    if (dir > 0) {                       // √b = √a + Δ1/L ;  Δ0 = Δ1/(√a·√b)
      const sA = sq(s.lo), sB = sA + left / L;
      out += left / (sA * sB);
      t = 2 * Math.log(sB) / LN;
    } else {                             // 1/√a = 1/√b + Δ0/L ;  Δ1 = √b²·Δ0/(1 + √b·Δ0/L)
      const sB = sq(s.hi), den = 1 + sB * left / L;
      out += sB * sB * left / den;
      t = 2 * Math.log(sB / den) / LN;
    }
    left = 0; break;
  }
  return { got: out / 10 ** dOut, unfilled: left / 10 ** dIn, endTick: t };
}
/* Spending the QUOTE buys the token. Which way that moves the tick depends only on which side the
 * quote sits: spending token0 pushes down, spending token1 pushes up. */
const buy = q => walk(q, quoteIs0 ? -1 : +1);
const sell = tk => walk(tk, quoteIs0 ? +1 : -1);

const SIZES = (process.env.SIZES || '0.01,0.1,0.5,1,5').split(',').map(Number);
console.log(`\n  ${'size'.padStart(8)} ${QUOTE.padEnd(5)} ${'→ ' + sym}`.padEnd(34) + `${'avg px'.padStart(14)} ${'slip'.padStart(8)} ${'round trip'.padStart(11)}`);
const rows = [];
for (const s of SIZES) {
  const b = buy(s);
  if (b.unfilled > s * 0.001) { console.log(`  ${String(s).padStart(8)} ${QUOTE.padEnd(5)} ⛔ only ${((1 - b.unfilled / s) * 100).toFixed(1)}% fillable inside ±${WORDS} words`); continue; }
  const avg = s / b.got;
  const slip = (avg / SPOT - 1) * 100;
  const back = sell(b.got);                              // and straight back out again
  const rt = (back.got / s - 1) * 100;
  rows.push({ size: s, out: b.got, avg, slipPct: +slip.toFixed(4), roundTripPct: +rt.toFixed(4) });
  console.log(`  ${String(s).padStart(8)} ${QUOTE.padEnd(5)} ${(b.got < 1 ? b.got.toPrecision(5) : b.got.toLocaleString(undefined, { maximumFractionDigits: 0 })).padStart(18)}  ${(avg < 1e-4 ? avg.toExponential(3) : avg.toPrecision(5)).padStart(13)} ${('+' + slip.toFixed(3) + '%').padStart(8)} ${(rt.toFixed(3) + '%').padStart(11)}`);
}

console.log(`\n  ⚑ ROUND TRIP is the number that decides everything: buy and immediately sell back, both`);
console.log(`     fees and both impacts. It is the bar any signal has to clear before it is an edge,`);
console.log(`     and at ${(FEE / 10000).toFixed(2)}% a side it starts at ${(FEE / 5000).toFixed(2)}% before a single token moves.`);
console.log(`  ⚠ Exact for this pool at this block. It knows nothing about the next block, a searcher`);
console.log(`     in front of you, or a router splitting the fill across venues.\n`);

if (process.env.JSON) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(process.env.JSON), { recursive: true });
  writeFileSync(process.env.JSON, JSON.stringify({
    pool: ARG, chain: CHAIN, sym, quote: QUOTE, fee: FEE, spacing: SPACING, tick: TICK, spot: SPOT,
    quoteIs0, ticks: initialized.length, readAt: new Date().toISOString(),
    depth: [0.5, 1, 2, 5, 10, 25].map(p => ({ pct: p, bid: bidWithin(p), ask: askWithin(p) })),
    quotes: rows,
  }, null, 1));
  console.log(`  wrote ${process.env.JSON}\n`);
}

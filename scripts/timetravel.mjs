#!/usr/bin/env node
/* ripmaster3030studios — TIME TRAVEL.  `npm run timetravel`
 *
 * Replay the bot, tick by tick, from the pool's first block to now — calling THE SAME
 * `decide()` the live bot calls, fed only the data that existed at each moment.
 *
 * ⛔ IT IMPORTS THE BOT'S BRAIN RATHER THAN REIMPLEMENTING IT. `bot/lib/brain.mjs` holds
 *   computeSignal / decide / apply, and the live bot, the daemon and this replay all call those
 *   exact functions. If the simulator computed its own signal, a profitable result would be
 *   evidence about the simulator. This project has paid for that four times; the sharpest was a
 *   test suite that scored 10/10 for three weeks because its fake server and its client agreed
 *   with each other while the shipped handler used a different key.
 *
 * ⛔ AND IT IS BLIND BY CONSTRUCTION, WHICH IS THE ONLY PROPERTY THAT MATTERS HERE. At every tick
 *   the replay slices the tape to `[head - window, head]` and hands over nothing else. The
 *   quantile the signal ranks against is computed from the trailing buckets inside that slice, so
 *   it cannot know which days were unusual before they happened. Lookahead is the way a backtest
 *   lies and it lies in the flattering direction every time.
 *
 * ⚠ WHAT IT STILL CANNOT MODEL, stated because a simulation that hides its assumptions is worse
 *   than none:
 *   · FILLS. It marks at the pool's tick and charges the measured 2.11% round trip. A real order
 *     moves the price it is filling against — at $20 that is ~0.6 bps and negligible, which is the
 *     only reason this is defensible at this size and would NOT be at $10,000.
 *   · The bot's own footprint. Nineteen days of a real bot buying would have changed the tape it
 *     is being tested on. Unknowable, and it flatters the result.
 *   · Failed transactions, reverts, RPC outages, and the Permit2 approval that is not yet set.
 */
import { readFileSync, existsSync } from 'node:fs';
import { PARAMS, computeSignal, decide, apply, newBook } from '../bot/lib/brain.mjs';

const SW = 'fwa-audit/swaps.json', TP = 'fwa-audit/tape-a0Df17B5-25546793.json';
if (!existsSync(SW) || !existsSync(TP)) { console.log('  ⛔ run `npm run flow holders` and `npm run flow:lead` first'); process.exit(1); }
const ETHUSD = 1919.63;

const swaps = JSON.parse(readFileSync(SW, 'utf8')).rows;                 // [block, sqrtPriceX96, amount0]
const tape = JSON.parse(readFileSync(TP, 'utf8'));                        // [block, logIndex, from, to, value]
const PMl = '0x000000000004444c5dc75cb358380d2e3de08a90';

/* Pool-side transfers only, pre-reduced to {block, from, to, value} in whole tokens — the brain
 * accepts either shape, and this keeps 19 days of ticks out of BigInt arithmetic. */
const flow = [];
for (const [b, li, f, t, v] of tape.logs) {
  const fl = f.toLowerCase(), tl = t.toLowerCase();
  if (fl !== PMl && tl !== PMl) continue;
  flow.push({ block: b, from: fl, to: tl, value: Number(BigInt(v) / 10n ** 12n) / 1e6 });
}
const blocks = swaps.map(r => r[0]);
const priceAt = b => {
  let i = 0, j = blocks.length - 1, best = -1;
  while (i <= j) { const m = (i + j) >> 1; if (blocks[m] <= b) { best = m; i = m + 1; } else j = m - 1; }
  return best < 0 ? null : 1 / Math.pow(Number(swaps[best][1]) / 2 ** 96, 2);
};
/* Real timestamps matter: the entry rule is hour-of-day, so a 0.02 s/block error compounds to 46
 * minutes over the sample and would move ticks into the wrong session. Anchored on the tape's own
 * span and interpolated, rather than assumed. */
/* ⛔ READ FROM THE CHAIN, NOT GUESSED. The first version assumed an epoch and printed a run
 *   ending 2026-08-20 — twelve days in the future. Harmless-looking, except the entry rule is
 *   HOUR OF DAY, so every tick was being tested against the wrong session. A wrong clock in a
 *   backtest is not a cosmetic bug; it silently rewires the strategy. */
const T0 = Number(process.env.T0 || 1784574191);   // block 25575888 = 2026-07-20T19:03:11Z
const LO = swaps[0][0], HI = swaps[swaps.length - 1][0];
const SEC = Number(process.env.BLOCK_SEC || 12.042080);   // measured across the sample, not assumed
const timeAt = b => new Date((T0 + (b - LO) * SEC) * 1000);

/* ⛔ LEG_COST IS THE WHOLE QUESTION NOW. The main pool charges 1.0194% a leg via its hook; the
 *   hookless external pools charge 0.855-0.86%; an empty 0.01% pool exists. Sweeping it answers
 *   "at what venue fee does this strategy stop losing" with a number instead of a hope. */
const P = { ...PARAMS, stake: Number(process.env.STAKE_ETH || 0.01),
  legCost: Number(process.env.LEG_COST || PARAMS.legCost) };
const WIN = P.bucketBlocks * P.histBuckets;
const START = Number(process.env.START_ETH || 0.1);

/* ⛔ SUB-PERIODS ARE THE REAL TEST. A 37x sample flatters any long-biased rule; the question is
 *   what it does when the trend is not paying. FROM/TO slice the replay. */
const FROM = Number(process.env.FROM || 0), TO = Number(process.env.TO || 0);
let book = newBook(START);
let ticks = 0, entries = 0, exits = 0, skipped = {}, fi = 0;
const equityCurve = [];

/* walk forward, one bucket at a time */
const S0 = FROM || (LO + WIN), S1 = TO || HI;
for (let head = S0; head <= S1; head += P.bucketBlocks) {
  ticks++;
  /* ⛔ THE SLICE IS THE BLINDFOLD. Only events in [head-WIN, head] are visible. */
  while (fi < flow.length && flow[fi].block < head - WIN) fi++;
  const slice = [];
  for (let k = fi; k < flow.length && flow[k].block <= head; k++) slice.push(flow[k]);

  const price = priceAt(head);
  const sig = computeSignal({ transfers: slice, price, from: head - WIN, head, P });
  const hourUTC = timeAt(head).getUTCHours();
  const intent = decide({ book, sig, head, hourUTC, P });

  if (intent.action === 'enter') entries++;
  else if (intent.action === 'exit') exits++;
  else skipped[intent.why] = (skipped[intent.why] || 0) + 1;

  if (intent.action === 'enter' || intent.action === 'exit')
    book = apply({ book, intent, sig, head, P, at: timeAt(head).toISOString() });

  if (ticks % 40 === 0) {
    const mark = book.fwa > 0 && price ? book.fwa * price : 0;
    equityCurve.push({ d: timeAt(head).toISOString().slice(5, 10), eq: book.eth + book.swept + mark });
  }
}

const lastPx = priceAt(S1);
const mark = book.fwa > 0 ? book.fwa * lastPx : 0;
const equity = book.eth + book.swept + mark;
const hold = (lastPx / priceAt(S0)) * (1 - P.legCost) ** 2;

console.log(`\n  TIME TRAVEL — the bot's own decide(), replayed blind from block ${LO + WIN} to ${HI}`);
console.log(`  ${((S1 - S0) * SEC / 86400).toFixed(1)} days · ${ticks.toLocaleString()} ticks · stake ${P.stake} ETH · start ${START} ETH\n`);
console.log(`  entries              ${entries}`);
console.log(`  exits                ${exits}`);
console.log(`  closed trades        ${book.trades.length}`);
if (book.trades.length) {
  const w = book.trades.filter(t => t.pnlPct > 0);
  const by = k => book.trades.filter(t => t.why === k).length;
  console.log(`  win rate             ${(w.length / book.trades.length * 100).toFixed(1)}%   (${by('take-profit')} take-profit · ${by('stop')} stop · ${by('timeout')} timeout)`);
  const avg = book.trades.reduce((s, t) => s + t.pnlPct, 0) / book.trades.length;
  console.log(`  average trade        ${avg >= 0 ? '+' : ''}${avg.toFixed(3)}%`);
}
console.log(`\n  ending ETH           ${book.eth.toFixed(6)}`);
console.log(`  open position        ${book.fwa ? book.fwa.toFixed(0) + ' FWA marked at ' + mark.toFixed(6) + ' ETH' : 'none'}`);
console.log(`  ⚑ swept to treasury  ${book.swept.toFixed(6)} ETH = $${(book.swept * ETHUSD).toFixed(2)}   (one-way, never returns)`);
console.log(`  total equity         ${equity.toFixed(6)} ETH  = ${((equity / START - 1) * 100).toFixed(2)}%`);
console.log(`  buy & hold the same  ${(START * hold).toFixed(6)} ETH  = ${((hold - 1) * 100).toFixed(2)}%`);
console.log(`  ⚑ bot vs holding     ${(((equity / START) - hold) * 100).toFixed(2)} points`);
if (book.halted) console.log(`  ⛔ HALTED partway — the book breached the ${P.floorPct * 100}% floor`);

console.log(`\n  why it stood down (tick counts):`);
for (const [k, v] of Object.entries(skipped).sort((a, b) => b[1] - a[1]).slice(0, 6))
  console.log(`     ${String(v).padStart(6)}  ${k}`);

if (equityCurve.length) {
  console.log(`\n  equity by day (ETH):`);
  const seen = new Set(); const rows = [];
  for (const p of equityCurve) if (!seen.has(p.d)) { seen.add(p.d); rows.push(p); }
  for (const r of rows) {
    const bars = Math.max(0, Math.round((r.eq / START) * 20));
    console.log(`     ${r.d}  ${r.eq.toFixed(5).padStart(9)}  ${'█'.repeat(Math.min(bars, 60))}`);
  }
}
console.log(`\n  ⚠ Marks at the pool tick and charges the measured 2.11% round trip. It does NOT model`);
console.log(`    fills moving the price (~0.6 bps at this size), its own footprint on 19 days of tape,`);
console.log(`    reverts, or RPC outages. Every one of those omissions flatters the result.\n`);

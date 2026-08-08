#!/usr/bin/env node
/* ripmaster3030studios — THE FWA/ETH BOT.  `npm run bot …`
 *
 *   npm run bot paper                 run it 24/7 on live data, decide, log, spend nothing
 *   npm run bot report                what the paper book has done so far
 *   npm run bot once                  evaluate right now and print the decision
 *
 * ── WHAT IT IS FOR ─────────────────────────────────────────────────────────────────────────
 * Trade FWA against ETH; when a trade closes green, a fixed share of the ETH profit is skimmed
 * to the $3030 treasury and never comes back.
 *
 * ⚑ THE SKIM IS THE BEST RISK FEATURE IN HERE AND IT IS STRUCTURAL, NOT A POLICY. The treasury
 *   is PUSH-ONLY: profit flows out of the risk book into the cold wallet and the bot can never
 *   draw on it, so a losing streak cannot reach the studio's money. That is exactly PackSink's
 *   property — `_split()` pushes and the treasury signs nothing — applied to a trading book.
 *   A bot that can top itself up from treasury is a bot that eventually empties it.
 *
 * ⛔ IT HOLDS NO KEY AND SIGNS NOTHING, IN ANY MODE. It decides and it logs. Execution is a
 *   separate signer on the operator's own machine reading this log. Two reasons, and the second
 *   is the real one: a key in a repo is a key in every backup of that repo forever; and a
 *   detector wired straight to a spender turns every false positive into a filled trade, at a
 *   false-positive rate nobody has measured yet — which is precisely what `paper` exists to fix.
 *
 * ── WHY IT STARTS IN PAPER, AND WHY THAT IS NOT A STALL ────────────────────────────────────
 * Everything the rules below are built on is a BACKTEST, and the backtest's own out-of-sample
 * pass was brutal: the best in-sample configuration (69.5% win, +9,459%) fell to 50.0% win and
 * −60% on the second half, and holding beat every rule in every out-of-sample window. So the
 * honest state of knowledge is "a real signal that has never been tested forward". Paper runs
 * 24/7 from tonight and produces that test at a cost of zero. ⚠ If it does not clear its own
 * costs on live data, that is the answer, and it will have been a cheap one.
 *
 * ── THE RULES, AND WHERE EACH NUMBER CAME FROM ─────────────────────────────────────────────
 *  entry   net accumulation in the trailing ~5 min sits in the TOP QUINTILE of the trailing
 *          history — measured corr +0.294 with the next window's return, 75% up-rate.
 *  window  19:00–23:59 UTC only. Measured: 19h carries 1,865 ETH against ~500 typical, and the
 *          top four hours carry 28.9% of all volume against 16.7% for a flat day. ⚠ Depth only —
 *          up-share is 46–47% in EVERY hour, so the clock says WHERE THE LIQUIDITY IS and
 *          nothing whatsoever about direction.
 *  exit    +20% take-profit, −50% stop, 4 h timeout. Wide on purpose: every narrow-TP
 *          configuration in the 108-row sweep lost money, and the 89.4%-win-rate row returned
 *          −93% because its average loss was 19× its average win.
 *  cost    2.028% the round trip, SIMULATED against live state, not assumed — the hook charges
 *          1.0194% on the buy and 1.0192% on the sell and its FEE_BIPS is a private constant.
 */
import { createPublicClient, http, parseAbiItem, formatEther, keccak256, encodeAbiParameters } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOOKF = join(ROOT, 'fwa-audit/book.json');
const LOGF = join(ROOT, 'fwa-audit/bot.jsonl');
const PM = '0x000000000004444c5dc75cB358380D2e3dE08A90';
const POOL = '0x230ecd3c25b44af30db59c15f70df7794eb13f67a200f230b7400daa96fe804d';
const FWA = '0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';
const HOOK = '0x2C67ebA8A50AF0dB5Fba55F725247a75CbDA6444';

/* The treasury comes from chain-config, never from a literal here — it is the same cold Ledger
 * that receives every pack's studio half, and one source for "where our money goes" is the whole
 * lesson of the day two destinations were found disagreeing. */
const CFG = (() => { const w = {}; new Function('window', readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8'))(w); return w.RIPMASTER_CHAIN; })();
const TREASURY = CFG.treasury;

const P = {
  skimBps: 5000,          // half of every realised ETH profit goes to the treasury, permanently
  tpPct: 0.20,
  slPct: 0.50,
  holdBlocks: 1200,       // ~4 h
  hoursUTC: [19, 20, 21, 22, 23],
  legCost: 0.01055,
  stake: 0.05,            // ETH per position
  floorPct: 0.50,         // ⛔ stop trading for good if the book halves
  pollMs: 60000,
};

const RPCS = ['https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org'];
const cs = RPCS.map(u => createPublicClient({ chain: mainnet, transport: http(u, { timeout: 25000, retryCount: 1 }) }));
const SWAP = parseAbiItem('event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)');
const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

async function logs(ev, addr, from, to, args) {
  /* ⚠ Try both endpoints and SAY when both failed. A read that returns an empty array because
   *   every provider errored is the "confident zero" this project keeps paying for. */
  let last = null;
  for (const c of cs) {
    try { return { ok: true, out: await c.getLogs({ address: addr, event: ev, args, fromBlock: BigInt(from), toBlock: BigInt(to) }) }; }
    catch (e) { last = e; }
  }
  return { ok: false, out: [], why: String(last?.shortMessage || last).slice(0, 80) };
}

const priceOf = sq => 1 / Math.pow(Number(sq) / 2 ** 96, 2);   // ETH per FWA

/* The signal, computed causally: net FWA out of the pool over the trailing window, ranked against
 * the trailing history the bot has actually seen. Never against the future, and never against a
 * quantile of the whole sample — that is lookahead and it is how a backtest lies. */
async function signal(head) {
  const W = 25, N = 40;                       // 25 blocks ~5 min, 40 buckets of history
  const from = head - W * N, to = head;
  const t = await logs(TRANSFER, FWA, from, to);
  const s = await logs(SWAP, PM, from, to, { id: POOL });
  if (!t.ok || !s.ok) return { err: `read failed: ${t.why || s.why}` };
  const buckets = new Float64Array(N);
  for (const l of t.out) {
    const f = l.args.from.toLowerCase(), o = l.args.to.toLowerCase(), pm = PM.toLowerCase();
    if (f !== pm && o !== pm) continue;
    const i = Math.floor((Number(l.blockNumber) - from) / W);
    if (i >= 0 && i < N) buckets[i] += (f === pm ? 1 : -1) * Number(l.args.value / 10n ** 12n) / 1e6;
  }
  const now = buckets[N - 1], hist = [...buckets.slice(0, N - 1)].sort((a, b) => a - b);
  const cut = hist[Math.floor(hist.length * 0.8)];
  const px = s.out.length ? priceOf(s.out[s.out.length - 1].args.sqrtPriceX96) : null;
  return { now, cut, top: now > cut, px, swaps: s.out.length };
}

const loadBook = () => existsSync(BOOKF) ? JSON.parse(readFileSync(BOOKF, 'utf8'))
  : { startEth: 0.10, eth: 0.10, fwa: 0, entry: null, entryBlock: 0, swept: 0, trades: [], halted: false };
const saveBook = b => { mkdirSync(dirname(BOOKF), { recursive: true }); writeFileSync(BOOKF, JSON.stringify(b, null, 1)); };
const note = o => { mkdirSync(dirname(LOGF), { recursive: true }); appendFileSync(LOGF, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n'); };

async function step(book, verbose) {
  const head = Number(await cs[0].getBlockNumber());
  const hour = new Date().getUTCHours();
  const sig = await signal(head);
  if (sig.err) { note({ ev: 'readfail', why: sig.err }); if (verbose) console.log(`  ⚠ ${sig.err} — no decision made (this is NOT "no signal")`); return book; }
  const px = sig.px;
  if (!px) { if (verbose) console.log('  no swaps in the window — price unknown, standing down'); return book; }

  if (book.fwa > 0) {
    const val = book.fwa * px, cost = book.entry * book.fwa;
    const pnl = (val * (1 - P.legCost)) / cost - 1;
    const aged = head - book.entryBlock > P.holdBlocks;
    const hit = pnl >= P.tpPct, stop = pnl <= -P.slPct;
    if (hit || stop || aged) {
      const out = book.fwa * px * (1 - P.legCost);
      const profit = out - cost;
      let skim = 0;
      if (profit > 0) { skim = profit * P.skimBps / 10000; book.swept += skim; }
      book.eth += out - skim; book.fwa = 0;
      book.trades.push({ at: new Date().toISOString(), why: hit ? 'take-profit' : stop ? 'stop' : 'timeout', pnlPct: +(pnl * 100).toFixed(3), eth: +out.toFixed(6), skim: +skim.toFixed(6) });
      note({ ev: 'exit', why: hit ? 'tp' : stop ? 'sl' : 'timeout', pnlPct: pnl * 100, out, skim, book: book.eth });
      if (verbose) console.log(`  EXIT ${hit ? 'take-profit' : stop ? 'STOP' : 'timeout'}  ${(pnl * 100).toFixed(2)}%  → ${out.toFixed(5)} ETH${skim ? `, skimmed ${skim.toFixed(5)} to treasury` : ''}`);
      if (book.eth + book.swept < book.startEth * P.floorPct) {
        book.halted = true; note({ ev: 'halt', book: book.eth });
        if (verbose) console.log('  ⛔ HALTED — the book has halved. It does not restart on its own.');
      }
    } else if (verbose) console.log(`  holding · ${(pnl * 100).toFixed(2)}%  (tp +${P.tpPct * 100}% / sl −${P.slPct * 100}% / ${P.holdBlocks - (head - book.entryBlock)} blocks left)`);
    saveBook(book); return book;
  }

  const inWindow = P.hoursUTC.includes(hour);
  if (book.halted) { if (verbose) console.log('  halted.'); return book; }
  if (!inWindow) { if (verbose) console.log(`  ${hour}h UTC — outside the depth window (${P.hoursUTC[0]}–${P.hoursUTC[P.hoursUTC.length - 1]}h), standing down`); return book; }
  if (!sig.top) { if (verbose) console.log(`  no signal · accumulation ${sig.now.toFixed(0)} vs top-quintile cut ${sig.cut.toFixed(0)}`); return book; }
  if (book.eth < P.stake) { if (verbose) console.log(`  not enough working ETH (${book.eth.toFixed(5)} < ${P.stake})`); return book; }

  const got = (P.stake * (1 - P.legCost)) / px;
  book.eth -= P.stake; book.fwa = got; book.entry = P.stake / got; book.entryBlock = head;
  note({ ev: 'entry', px, stake: P.stake, fwa: got, sig: sig.now, cut: sig.cut });
  if (verbose) console.log(`  ▶ ENTRY ${P.stake} ETH → ${got.toFixed(0)} FWA at ${px.toExponential(4)} ETH  (accumulation ${sig.now.toFixed(0)} > ${sig.cut.toFixed(0)})`);
  saveBook(book); return book;
}

function report() {
  const b = loadBook();
  const wins = b.trades.filter(t => t.pnlPct > 0);
  console.log(`\n  PAPER BOOK  (spends nothing, signs nothing)`);
  console.log(`  working    ${b.eth.toFixed(6)} ETH${b.fwa ? ` + ${b.fwa.toFixed(0)} FWA open` : ''}`);
  console.log(`  swept      ${b.swept.toFixed(6)} ETH → ${TREASURY}  ⚑ push-only, never returns`);
  console.log(`  total      ${(b.eth + b.swept).toFixed(6)} ETH from ${b.startEth} start  = ${(((b.eth + b.swept) / b.startEth - 1) * 100).toFixed(2)}%`);
  console.log(`  trades     ${b.trades.length}${b.trades.length ? `, ${wins.length} green = ${(wins.length / b.trades.length * 100).toFixed(1)}% win` : ''}`);
  if (b.halted) console.log('  ⛔ HALTED — the book halved.');
  for (const t of b.trades.slice(-8)) console.log(`     ${t.at.slice(5, 16)}  ${t.why.padEnd(11)} ${(t.pnlPct >= 0 ? '+' : '') + t.pnlPct}%  skim ${t.skim}`);
  if (!b.trades.length) console.log('\n  No closed trades yet. ⚠ An empty book is not evidence of anything — the point of');
  console.log(b.trades.length ? '' : '     this run is to produce the forward evidence the backtest could not.\n');
}

const cmd = process.argv[2] || 'once';
if (cmd === 'report') report();
else if (cmd === 'once') { const b = await step(loadBook(), true); saveBook(b); }
else if (cmd === 'paper') {
  console.log(`  FWA/ETH paper bot · stake ${P.stake} ETH · tp +${P.tpPct * 100}% sl −${P.slPct * 100}% · ${P.hoursUTC[0]}–${P.hoursUTC[P.hoursUTC.length - 1]}h UTC`);
  console.log(`  skim ${P.skimBps / 100}% of realised profit → ${TREASURY}`);
  console.log(`  ⛔ signs nothing, spends nothing. Ctrl-C to stop.\n`);
  for (;;) {
    let b = loadBook();
    try { b = await step(b, true); saveBook(b); } catch (e) { note({ ev: 'error', why: String(e.message).slice(0, 120) }); console.log('  ⚠', String(e.shortMessage || e.message).slice(0, 90)); }
    await new Promise(r => setTimeout(r, P.pollMs));
  }
} else {
  console.log('  usage: npm run bot [paper|once|report]');
  process.exit(1);
}

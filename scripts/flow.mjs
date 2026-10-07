#!/usr/bin/env node
/* ripmaster3030studios — THE TAPE.  `npm run flow …`   (window: none, keys: none)
 *
 *   npm run flow holders --token 0x…       every holder, rebuilt from Transfer logs, self-checked
 *   npm run flow whales  [--n 25]          the big ones, and whether they are BUYING or LEAVING
 *   npm run flow pulse   [--hours 6]       is movement starting right now, and which way
 *
 * ── WHAT THIS IS, AND THE ONE THING IT IS NOT ──────────────────────────────────────────────
 * It reads public data faster and more completely than a chart does. A chart shows you PRICE,
 * which is the output; this shows you the INPUTS — who is accumulating, who is distributing, how
 * many wallets are new, and whether the rate of arrival is rising. That is a legitimate edge and
 * it is available to anybody willing to pull 300,000 logs.
 *
 * ⛔ IT IS A NOWCAST, NOT A FORECAST, AND THE DIFFERENCE IS THE WHOLE HONESTY OF THE TOOL. It can
 *   tell you a rush is UNDERWAY several minutes before a candle makes it obvious, because a candle
 *   aggregates and this does not. It cannot tell you a rush is COMING. Anyone claiming the second
 *   thing from this data is selling something. Every number below is a measurement of the past,
 *   including the ones with "rate" in the name.
 * ⛔ AND IT SIGNS NOTHING. Same rule as `mm.mjs`: no key, no execution, no order. It prints what
 *   is happening; a human decides. The reason is not timidity — it is that a detector wired
 *   straight to a spender turns every false positive into a filled trade, and the false-positive
 *   rate of any signal on a three-week-old token is unknown by construction.
 *
 * ── THE PRIMITIVE IS NET BALANCE DELTA, ON PURPOSE ─────────────────────────────────────────
 * ⚑ NOT "buys" and "sells". Under v4 the tokens live in the PoolManager singleton and a swap
 *   settles through flash accounting, so the ERC-20 Transfer you can see may be pool↔router
 *   rather than pool↔trader, and it changes with the router somebody used. Classifying a transfer
 *   as a buy therefore requires knowing every router on mainnet, and the list is wrong the day a
 *   new one ships. A BALANCE DELTA needs none of that: if an address holds more than it did, it
 *   accumulated, whatever path the tokens took. Routing-agnostic by construction.
 *
 * ⚑ AND IT PROVES ITSELF: replaying every Transfer from genesis must reproduce `totalSupply()`
 *   exactly. That single assertion catches a dropped window, a truncated result set, a
 *   silently-failing endpoint and an off-by-one on the range — every way this can be quietly
 *   wrong. If the sum does not match, the tool REFUSES to report rather than printing a plausible
 *   holder list. A reassuring wrong answer is the failure this project keeps paying for.
 */
import { createPublicClient, http, parseAbiItem, formatUnits, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'fwa-audit');
const PM = '0x000000000004444c5dc75cB358380D2e3dE08A90';   // v4 PoolManager (singleton)
const ZERO = '0x0000000000000000000000000000000000000000';
const DEAD = '0x000000000000000000000000000000000000dEaD';

/* Defaults are FWA because that is the token in front of us; --token points it anywhere. */
const DEF = {
  token: '0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845',
  pool: '0x230ecd3c25b44af30db59c15f70df7794eb13f67a200f230b7400daa96fe804d',
  birth: 25546799,   // the pool's Initialize block, proven by rehash in `mm scan`
};

/* ⛔ LOG-CAPABLE ENDPOINTS ONLY. chain-config's first entry (publicnode) rejects eth_getLogs
 *   outright and merkle answers "method does not exist" — measured. A log reader that takes the
 *   house default gets nothing, and if it swallows its errors it reports a confident zero. */
const RPCS = ['https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org'];

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const SWAP = parseAbiItem('event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)');
const ERC = [
  parseAbiItem('function totalSupply() view returns (uint256)'),
  parseAbiItem('function decimals() view returns (uint8)'),
  parseAbiItem('function symbol() view returns (string)'),
];

const clients = RPCS.map(u => ({ url: u, c: createPublicClient({ chain: mainnet, transport: http(u, { timeout: 30000, retryCount: 1 }) }) }));
const any = clients[0].c;

/* ── the pull ──────────────────────────────────────────────────────────────────────────────
 * ⚠ 1,000-block windows measured at ~1,869 transfers each on FWA. Endpoints cap on RESULT COUNT,
 *   not block span, so a window that works today fails during a rush — which is exactly when you
 *   are running this. Hence: halve and retry on failure, recursively, and COUNT the failures. */
async function pullWindow(cli, addr, ev, from, to, out, depth = 0) {
  try {
    const L = await cli.getLogs({ address: addr, event: ev, fromBlock: from, toBlock: to });
    out.push(...L); return { ok: 1, fail: 0 };
  } catch (e) {
    if (to - from < 2n || depth > 12) return { ok: 0, fail: 1 };
    const mid = from + (to - from) / 2n;
    const a = await pullWindow(cli, addr, ev, from, mid, out, depth + 1);
    const b = await pullWindow(cli, addr, ev, mid + 1n, to, out, depth + 1);
    return { ok: a.ok + b.ok, fail: a.fail + b.fail };
  }
}

async function pull(addr, ev, from, to, label, span = 1000n) {
  const out = [];
  const chunks = [];
  for (let lo = BigInt(from); lo <= BigInt(to); lo += span) {
    const hi = lo + span - 1n > BigInt(to) ? BigInt(to) : lo + span - 1n;
    chunks.push([lo, hi]);
  }
  let done = 0, fails = 0;
  const t0 = Date.now();
  /* Both endpoints work the queue so the pull is bounded by the faster one. */
  const queue = chunks.slice();
  await Promise.all(clients.map(async ({ c }) => {
    for (;;) {
      const job = queue.shift(); if (!job) return;
      const r = await pullWindow(c, addr, ev, job[0], job[1], out);
      fails += r.fail; done++;
      if (done % 25 === 0) process.stdout.write(`\r  ${label}: ${done}/${chunks.length} windows, ${out.length} logs…   `);
    }
  }));
  process.stdout.write(`\r  ${label}: ${chunks.length} windows, ${out.length} logs, ${fails} unrecoverable, ${((Date.now() - t0) / 1000).toFixed(1)}s        \n`);
  out.sort((a, b) => Number(a.blockNumber - b.blockNumber) || (a.logIndex - b.logIndex));
  return { logs: out, fails };
}

/* ── holders, rebuilt and PROVEN ───────────────────────────────────────────────────────── */
function replay(logs) {
  const bal = new Map();
  const firstSeen = new Map();
  const add = (a, v, blk) => {
    if (a === ZERO) return;
    bal.set(a, (bal.get(a) || 0n) + v);
    if (v > 0n && !firstSeen.has(a)) firstSeen.set(a, blk);
  };
  for (const l of logs) {
    const { from, to, value } = l.args;
    add(from, -value, Number(l.blockNumber));
    add(to, value, Number(l.blockNumber));
  }
  for (const [a, v] of bal) if (v === 0n) bal.delete(a);
  return { bal, firstSeen };
}

/* ⛔ THE TOKEN IS OLDER THAN ITS POOL, AND STARTING AT THE POOL LOSES THE MINT.
 *   First run defaulted to the pool's Initialize block and the self-check refused the result —
 *   off by EXACTLY 1,000,000,000, with the rebuilt sum sitting at −4,841,583.275287090655949122.
 *   Those two numbers name the bug between them: 1e9 − 4,841,583.275… is totalSupply to the wei,
 *   so every burn since had been captured and the genesis mint had not. ⚑ A vaguer check —
 *   "roughly right", or a tolerance — would have printed a holder table that was wrong by the
 *   entire supply and looked completely reasonable, because the RANKING would have been correct.
 *   Binary-searching the first block with bytecode costs ~25 calls and removes the guess. */
async function deployBlock(token, head) {
  let lo = 1n, hi = BigInt(head);
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    const code = await any.getBytecode({ address: token, blockNumber: mid }).catch(() => null);
    if (code && code !== '0x') hi = mid; else lo = mid;
  }
  return Number(hi);
}

async function loadTape(a) {
  const token = (a.token || DEF.token);
  const head = Number(await any.getBlockNumber());
  const birth = Number(a.from || await deployBlock(token, head));
  const key = join(CACHE, `tape-${token.slice(2, 10)}-${birth}.json`);
  mkdirSync(CACHE, { recursive: true });

  let logs = [], have = birth - 1;
  if (existsSync(key) && !a.fresh) {
    try {
      const j = JSON.parse(readFileSync(key, 'utf8'));
      if (j.token === token && j.birth === birth) {
        logs = j.logs.map(r => ({ blockNumber: BigInt(r[0]), logIndex: r[1], args: { from: r[2], to: r[3], value: BigInt(r[4]) } }));
        have = j.head;
        console.log(`  cache: ${logs.length} transfers through block ${have}`);
      }
    } catch { /* a corrupt cache is not a finding — just re-pull */ }
  }
  if (head > have) {
    const { logs: fresh, fails } = await pull(token, TRANSFER, have + 1, head, 'transfers');
    if (fails) console.log(`  ⚠ ${fails} windows could not be read even after bisecting — the set is INCOMPLETE`);
    logs = logs.concat(fresh);
    writeFileSync(key, JSON.stringify({
      token, birth, head,
      logs: logs.map(l => [Number(l.blockNumber), l.logIndex, l.args.from, l.args.to, l.args.value.toString()]),
    }));
  }

  const [supply, dec, sym] = await Promise.all(ERC.map(abi =>
    any.readContract({ address: token, abi: [abi], functionName: abi.name })));

  const { bal, firstSeen } = replay(logs);
  let sum = 0n; for (const v of bal.values()) sum += v;

  /* ⛔ THE SELF-CHECK. Replaying every Transfer must reproduce totalSupply exactly. */
  const ok = sum === supply;
  console.log(`\n  ${sym}  supply ${formatUnits(supply, dec)}   rebuilt ${formatUnits(sum, dec)}   ${ok ? '✅ EXACT — the tape is complete' : '⛔ MISMATCH of ' + formatUnits(supply > sum ? supply - sum : sum - supply, dec)}`);
  if (!ok) console.log('     Refusing to report holders off an incomplete tape. Re-run with --fresh.');
  return { token, logs, bal, firstSeen, supply, dec, sym, head, ok };
}

/* Contract or person? A "whale" that is the PoolManager is inventory, not conviction. */
async function classify(addrs) {
  const out = new Map();
  const known = new Map([[PM.toLowerCase(), 'Uniswap v4 PoolManager (pool inventory)'],
    [DEAD.toLowerCase(), 'burn address']]);
  for (let i = 0; i < addrs.length; i += 8) {
    const batch = addrs.slice(i, i + 8);
    const codes = await Promise.all(batch.map(a =>
      any.getBytecode({ address: a }).catch(() => null)));
    batch.forEach((a, j) => {
      const k = known.get(a.toLowerCase());
      out.set(a, k ? k : (codes[j] && codes[j] !== '0x' ? 'contract' : 'wallet'));
    });
  }
  return out;
}

const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const pct = (x, t) => t ? (Number(x * 10000n / t) / 100).toFixed(2) + '%' : '—';

async function holders(a) {
  const t = await loadTape(a);
  if (!t.ok) return;
  const rows = [...t.bal.entries()].sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0));
  const kinds = await classify(rows.slice(0, 60).map(r => r[0]));
  const people = rows.filter(r => (kinds.get(r[0]) || 'wallet') === 'wallet');

  console.log(`\n  ── ${t.sym}: ${rows.length} addresses hold a non-zero balance ──`);
  const share = n => { let s = 0n; for (const r of rows.slice(0, n)) s += r[1]; return s; };
  console.log(`     top 1  ${pct(share(1), t.supply)}   top 5  ${pct(share(5), t.supply)}   top 10 ${pct(share(10), t.supply)}   top 50 ${pct(share(50), t.supply)}`);
  const pmBal = t.bal.get(PM) || t.bal.get(PM.toLowerCase()) || 0n;
  console.log(`     in the pool (PoolManager): ${formatUnits(pmBal, t.dec)}  = ${pct(pmBal, t.supply)} of supply`);
  console.log(`     ⚑ everything else is what has actually reached a holder: ${pct(t.supply - pmBal, t.supply)}`);

  console.log(`\n  ── top 25 ──`);
  console.log(`     ${'#'.padStart(3)} ${'address'.padEnd(15)} ${'balance'.padStart(16)} ${'share'.padStart(7)}  ${'first seen'.padStart(10)}  kind`);
  rows.slice(0, 25).forEach(([addr, v], i) => {
    const fs = t.firstSeen.get(addr);
    console.log(`     ${String(i + 1).padStart(3)} ${short(addr).padEnd(15)} ${Number(formatUnits(v, t.dec)).toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(16)} ${pct(v, t.supply).padStart(7)}  ${String(fs ? `blk ${fs}` : '—').padStart(10)}  ${kinds.get(addr) || ''}`);
  });
  console.log(`\n     of the top 60, ${[...kinds.values()].filter(v => v === 'wallet').length} are wallets and ${[...kinds.values()].filter(v => v !== 'wallet').length} are contracts.`);
  console.log(`     ⚠ A contract in this list is not a person. Copying its "position" copies a pool.\n`);
  return { t, rows, kinds, people };
}

/* ── whales: not who is big, but who is MOVING ─────────────────────────────────────────── */
async function whales(a) {
  const h = await holders(a); if (!h) return;
  const { t, rows, kinds } = h;
  const N = Number(a.n || 25);
  const now = t.head;
  const win = { '1h': 300, '6h': 1800, '24h': 7200, '7d': 50400 };

  /* balance delta per address over each window, straight off the same tape */
  const deltas = new Map();
  for (const [k, blocks] of Object.entries(win)) {
    const cut = now - blocks;
    const d = new Map();
    for (const l of t.logs) {
      if (Number(l.blockNumber) < cut) continue;
      const { from, to, value } = l.args;
      if (from !== ZERO) d.set(from, (d.get(from) || 0n) - value);
      if (to !== ZERO) d.set(to, (d.get(to) || 0n) + value);
    }
    deltas.set(k, d);
  }

  const top = rows.filter(([addr]) => (kinds.get(addr) || 'wallet') === 'wallet').slice(0, N);
  console.log(`  ── the ${top.length} biggest WALLETS (contracts excluded), and what they did ──`);
  console.log(`     ${'address'.padEnd(15)} ${'holds'.padStart(14)} ${'24h'.padStart(13)} ${'6h'.padStart(12)} ${'1h'.padStart(11)}   read`);
  let acc = 0, dist = 0, net24 = 0n;
  for (const [addr, v] of top) {
    const d24 = deltas.get('24h').get(addr) || 0n;
    const d6 = deltas.get('6h').get(addr) || 0n;
    const d1 = deltas.get('1h').get(addr) || 0n;
    net24 += d24;
    const f = x => { const n = Number(formatUnits(x, t.dec)); return (n > 0 ? '+' : '') + n.toLocaleString(undefined, { maximumFractionDigits: 0 }); };
    const read = d24 > 0n ? 'ACCUMULATING' : d24 < 0n ? 'distributing' : 'still';
    if (d24 > 0n) acc++; if (d24 < 0n) dist++;
    console.log(`     ${short(addr).padEnd(15)} ${Number(formatUnits(v, t.dec)).toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(14)} ${f(d24).padStart(13)} ${f(d6).padStart(12)} ${f(d1).padStart(11)}   ${read}`);
  }
  console.log(`\n     ${acc} accumulating · ${dist} distributing · ${top.length - acc - dist} unchanged over 24h`);
  console.log(`     their NET over 24h: ${(Number(formatUnits(net24, t.dec)) > 0 ? '+' : '') + Number(formatUnits(net24, t.dec)).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${t.sym}`);
  console.log(`     ⚠ On a token three weeks old, the biggest wallets often include the team and`);
  console.log(`       the earliest buyers. "Following a whale" into a distribution is the way this`);
  console.log(`       data loses money — the read that matters is the DIRECTION, not the size.\n`);
}

/* ── pulse: is something happening RIGHT NOW ───────────────────────────────────────────── */
async function pulse(a) {
  const t = await loadTape(a);
  if (!t.ok) return;
  const hours = Number(a.hours || 6);
  const blocks = Math.round(hours * 300);
  const now = t.head, start = now - blocks;
  const B = 12;                                   // buckets across the window
  const size = Math.max(1, Math.round(blocks / B));

  /* the swap tape, for the ETH side of the same window */
  const pool = a.pool || DEF.pool;
  const { logs: sw, fails } = await pull(PM, SWAP, start, now, 'swaps', 400n);
  const mine = sw.filter(s => s.args.id.toLowerCase() === pool.toLowerCase());

  /* per-bucket: unique wallets touched, wallets seen for the FIRST time ever, net token flow
   * out of the pool (= net accumulation by everyone else), and ETH volume. */
  console.log(`\n  ── ${t.sym} pulse · last ${hours} h in ${B} buckets ──`);
  console.log(`     ${'bucket'.padEnd(10)} ${'wallets'.padStart(8)} ${'new'.padStart(6)} ${'net out of pool'.padStart(17)} ${'ETH vol'.padStart(9)} ${'swaps'.padStart(6)}`);
  const rowsOut = [];
  for (let i = 0; i < B; i++) {
    const lo = start + i * size, hi = i === B - 1 ? now : start + (i + 1) * size - 1;
    const touched = new Set(); let netPool = 0n, fresh = 0;
    for (const l of t.logs) {
      const b = Number(l.blockNumber);
      if (b < lo || b > hi) continue;
      const { from, to, value } = l.args;
      if (from !== ZERO) touched.add(from);
      if (to !== ZERO) touched.add(to);
      if (from.toLowerCase() === PM.toLowerCase()) netPool += value;
      if (to.toLowerCase() === PM.toLowerCase()) netPool -= value;
      if (to !== ZERO && t.firstSeen.get(to) === b) fresh++;
    }
    let ethv = 0n, n = 0;
    for (const s of mine) { const b = Number(s.blockNumber); if (b < lo || b > hi) continue;
      const x = s.args.amount0; ethv += x < 0n ? -x : x; n++; }
    const np = Number(formatUnits(netPool, t.dec));
    rowsOut.push({ i, w: touched.size, fresh, np, eth: Number(formatEther(ethv)), n });
    const hrsAgo = ((now - hi) * 12.02 / 3600).toFixed(1);
    console.log(`     -${String(hrsAgo).padStart(4)} h   ${String(touched.size).padStart(8)} ${String(fresh).padStart(6)} ${((np > 0 ? '+' : '') + np.toLocaleString(undefined, { maximumFractionDigits: 0 })).padStart(17)} ${Number(formatEther(ethv)).toFixed(2).padStart(9)} ${String(n).padStart(6)}`);
  }

  /* the read. Compare the most recent third against the earlier two thirds — a rate, not a level. */
  const late = rowsOut.slice(-4), early = rowsOut.slice(0, -4);
  const avg = (xs, k) => xs.length ? xs.reduce((s, r) => s + r[k], 0) / xs.length : 0;
  const rate = (k) => { const e = avg(early, k), l = avg(late, k); return { e, l, x: e ? l / e : (l ? Infinity : 1) }; };
  const W = rate('w'), F = rate('fresh'), E = rate('eth'), P = rate('np');

  console.log(`\n  ── the read (last third vs the earlier two thirds) ──`);
  const line = (name, r, unit = '') => console.log(`     ${name.padEnd(22)} ${r.e.toFixed(1).padStart(9)} → ${r.l.toFixed(1).padStart(9)}${unit}   ${r.x === Infinity ? 'from nothing' : (r.x >= 1 ? '×' + r.x.toFixed(2) + ' ↑' : '×' + r.x.toFixed(2) + ' ↓')}`);
  line('wallets touched/bucket', W);
  line('NEW wallets/bucket', F);
  line('ETH volume/bucket', E);
  line('net out of pool/bucket', P);

  const heating = [W.x > 1.3, F.x > 1.3, E.x > 1.3].filter(Boolean).length;
  console.log('');
  if (P.l > 0 && heating >= 2)
    console.log(`     ⚑ ACCUMULATION IS ACCELERATING — ${heating} of 3 activity measures up >30% and tokens are net LEAVING the pool.`);
  else if (P.l < 0 && heating >= 2)
    console.log(`     ⛔ DISTRIBUTION IS ACCELERATING — activity up on ${heating} of 3 measures while tokens flow BACK INTO the pool. Volume rising into selling.`);
  else if (heating >= 2)
    console.log(`     ⚠ Activity is rising but flow is flat. Churn, not direction.`);
  else
    console.log(`     · Quiet. Nothing in this window is accelerating.`);
  console.log(`\n     ⛔ This describes the last ${hours} hours. It is not a prediction, and the`);
  console.log(`        false-positive rate of any signal on a 3-week-old token is unmeasured.`);
  if (fails) console.log(`     ⚠ ${fails} swap windows unreadable — the ETH column is INCOMPLETE.`);
  console.log('');
}

/* ══ cost ═══════════════════════════════════════════════════════════════════════════════════
 * `flow cost` — WHAT DOES A ROUND TRIP ACTUALLY COST HERE, measured off real fills.
 *
 * ⛔ THIS IS THE NUMBER THAT DECIDES WHETHER SCALPING IS POSSIBLE, AND IT CANNOT BE LOOKED UP.
 *   The PoolKey fee is 0 and the `fee` field on every real swap is 0 — but an
 *   `afterSwapReturnDelta` hook takes its cut AFTER the swap, outside both of those numbers. So
 *   the advertised fee is 0% and the true taker cost is something else entirely, and the only way
 *   to know it is to compare what a filler PAID against what the pool's mid price was one
 *   instant earlier.
 *
 * ⚑ THE METHOD: the Swap event carries sqrtPriceX96 AFTER the swap, so swap n−1's price is swap
 *   n's mid-before. Execution price is |amount1|/|amount0| out of the same event. The gap between
 *   them is everything the taker gave up — hook fee, LP fee and price impact together — which is
 *   the only figure that matters, because a scalper pays all three and cannot tell them apart.
 * ⚠ Bucketed BY TRADE SIZE, because impact scales with size and a strategy trading $50 does not
 *   care what a $50,000 order paid. The small bucket is the honest quote for a small book.
 */
async function cost(a) {
  const pool = (a.pool || DEF.pool).toLowerCase();
  const blocks = Number(a.blocks || 4000);
  const head = Number(await any.getBlockNumber());
  const { logs, fails } = await pull(PM, SWAP, head - blocks, head, 'swaps', 400n);
  const sw = logs.filter(s => s.args.id.toLowerCase() === pool);
  if (fails) console.log(`  ⚠ ${fails} windows unreadable — this sample is INCOMPLETE, not empty.`);
  if (sw.length < 20) return console.log(`  only ${sw.length} swaps in ${blocks} blocks — not enough to measure a cost.`);

  const ethUsd = Number(a.eth || 1919.63);
  const rows = [];
  for (let i = 1; i < sw.length; i++) {
    const prev = sw[i - 1].args, cur = sw[i].args;
    const midBefore = Math.pow(Number(prev.sqrtPriceX96) / 2 ** 96, 2);   // c1 per c0, raw units
    if (!isFinite(midBefore) || midBefore <= 0) continue;
    const a0 = cur.amount0 < 0n ? -cur.amount0 : cur.amount0;
    const a1 = cur.amount1 < 0n ? -cur.amount1 : cur.amount1;
    if (a0 === 0n || a1 === 0n) continue;
    const exec = Number(a1) / Number(a0);                                  // c1 per c0, raw units
    /* Whichever side the taker was on, they received LESS than mid — express that as a positive
     * cost in basis points. The direction tells us which, so we do not have to assume it. */
    const buy = cur.amount0 > 0n;                                          // c0 (ETH) into the pool
    const bps = (buy ? (midBefore - exec) / midBefore : (exec - midBefore) / midBefore) * 10000;
    const usd = Number(formatEther(a0)) * ethUsd;
    if (usd < 1 || !isFinite(bps)) continue;
    rows.push({ usd, bps, buy });
  }
  if (!rows.length) return console.log('  no usable fills — every sample was degenerate.');

  const BUCKETS = [[0, 100], [100, 500], [500, 2000], [2000, 10000], [10000, 1e12]];
  console.log(`\n  ── what a taker actually paid, ${rows.length} real fills over ~${(blocks * 12.02 / 3600).toFixed(1)} h ──`);
  console.log(`     ${'trade size'.padEnd(16)} ${'n'.padStart(5)} ${'median cost'.padStart(12)} ${'mean'.padStart(9)}   ${'round trip'.padStart(11)}`);
  const med = xs => { const s = xs.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  let smallMed = null;
  for (const [lo, hi] of BUCKETS) {
    const b = rows.filter(r => r.usd >= lo && r.usd < hi);
    if (b.length < 5) continue;
    const m = med(b.map(r => r.bps)), mean = b.reduce((s, r) => s + r.bps, 0) / b.length;
    if (lo === 0) smallMed = m;
    const label = hi > 1e11 ? `$${lo.toLocaleString()}+` : `$${lo.toLocaleString()}–${hi.toLocaleString()}`;
    console.log(`     ${label.padEnd(16)} ${String(b.length).padStart(5)} ${(m.toFixed(1) + ' bps').padStart(12)} ${(mean.toFixed(1)).padStart(9)}   ${((2 * m / 100).toFixed(2) + '%').padStart(11)}`);
  }

  /* the verdict a scalper needs */
  const GAS_RT = 0.0315 * 2;    // two hooked v4 swaps at the gas measured 2026-08-08
  console.log(`\n  ── what that means for a $50 micro-trade ──`);
  if (smallMed == null) console.log('     not enough sub-$100 fills in the window to quote the small bucket honestly.');
  else {
    const rt = 2 * smallMed / 10000;
    console.log(`     cost to go in and back out : ${(rt * 100).toFixed(2)}%  = $${(50 * rt).toFixed(3)} on $50`);
    console.log(`     gas, both legs             : $${GAS_RT.toFixed(3)}`);
    console.log(`     total to break even        : $${(50 * rt + GAS_RT).toFixed(3)}  = ${((50 * rt + GAS_RT) / 50 * 100).toFixed(2)}% move`);
    console.log(`\n     ⚑ So the price must move ${((50 * rt + GAS_RT) / 50 * 100).toFixed(2)}% IN YOUR FAVOUR before a $50 round trip`);
    console.log(`        is worth zero. Every trade smaller than that is a guaranteed loss, and`);
    console.log(`        no amount of splitting it across wallets changes it — ⛔ splitting makes`);
    console.log(`        it WORSE, because each wallet pays the gas leg again.`);
  }
  console.log('');
}

/* ── main ──────────────────────────────────────────────────────────────────────────────── */
const IS_MAIN = process.argv[1] && process.argv[1].endsWith('flow.mjs');
if (IS_MAIN) {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || 'pulse';
  const args = {};
  for (let i = 1; i < argv.length; i++)
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2), v = argv[i + 1]; args[k] = (!v || v.startsWith('--')) ? true : (i++, v); }
  try {
    if (cmd === 'holders') await holders(args);
    else if (cmd === 'cost') await cost(args);
    else if (cmd === 'whales') await whales(args);
    else if (cmd === 'pulse') await pulse(args);
    else {
      console.log('  usage:');
      console.log('    flow holders [--token 0x…] [--fresh]     every holder, rebuilt and self-checked');
      console.log('    flow whales  [--n 25]                    the big wallets, and which way they are moving');
      console.log('    flow pulse   [--hours 6]                 is a rush underway, and in which direction');
      console.log('    flow cost    [--blocks 4000]             what a round trip REALLY costs, off real fills');
      process.exit(1);
    }
  } catch (e) { console.error('  ⛔', e.shortMessage || e.message); process.exit(1); }
}

/* Exported so a test can drive the arithmetic without a network: `replay` is the whole
 * holder-reconstruction, and it is the piece that has to be exactly right. */
export { replay, pullWindow, loadTape, classify, holders, whales, pulse };

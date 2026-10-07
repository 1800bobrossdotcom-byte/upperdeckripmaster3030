#!/usr/bin/env node
/* ripmaster3030studios — WORLD COMPUTER HYPERTERMINAL, the data pass.  `npm run terminal`
 *
 * Measures the market and writes `data/terminal.json`, which
 * `worldcomputerhyperterminal.html` renders. Run it on a schedule; the page reads the file.
 *
 * ⛔ WHY A FILE AND NOT LIVE READS IN THE BROWSER. The interesting numbers here come from tens of
 *   thousands of logs — the flow/price lead test alone pulls ~7,000 per token — and no visitor is
 *   waiting forty seconds for a page. The split is honest as long as the page SAYS WHEN IT WAS
 *   MEASURED, which it does, on every panel. ⚠ A dashboard whose age is invisible is a dashboard
 *   that lies quietly the first time the cron stops.
 *
 * ⛔ AND EVERY NUMBER CARRIES ITS OWN VERDICT, NOT JUST ITS VALUE. This studio publishes no burn
 *   percentage because a printed figure drifts into a lie with nobody editing anything. The same
 *   rule applies here: a spread of "+1.05pp" means nothing without the toll it has to beat and
 *   the trim that tells you whether it is made of five windows. So the record carries `spread`,
 *   `roundTrip` and the trim ladder together, and the page is not allowed to show one without
 *   the others.
 *
 * ⚑ THE TERMINAL EXISTS BECAUSE THE RESEARCH FOUND THINGS, NOT BECAUSE IT FOUND A TRADE. Measured
 *   in one night: a hook taking 100% of a pool's fees while its `fee` field reads 0; a token whose
 *   transfers revert for ordinary holders; twelve venues where the world believes there is one; a
 *   buyback contract running to a 2.00-hour metronome; and an emission cliff visible in the
 *   transfer tape before it was announced. None of that needs an edge to be worth publishing.
 */
import { createPublicClient, http, parseAbi, parseAbiItem, formatUnits, formatEther, keccak256, encodeAbiParameters } from 'viem';
import { mainnet, base } from 'viem/chains';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/terminal.json');
const CFG = (() => { const w = {}; new Function('window', readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8'))(w); return w.RIPMASTER_CHAIN; })();

const L1 = ['https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org'];
const cs = L1.map(u => createPublicClient({ chain: mainnet, transport: http(u, { timeout: 30000, retryCount: 1 }) }));
const c = cs[0];
const baseC = createPublicClient({ chain: base, transport: http('https://mainnet.base.org', { timeout: 20000 }) });

const PMGR = '0x000000000004444c5dc75cB358380D2e3dE08A90';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'.toLowerCase();
const T = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const SWAP3 = parseAbiItem('event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)');
const SYNC2 = parseAbiItem('event Sync(uint112 reserve0, uint112 reserve1)');
const V3 = parseAbi(['function fee() view returns (uint24)', 'function token0() view returns (address)', 'function token1() view returns (address)']);
const V2 = parseAbi(['function getReserves() view returns (uint112,uint112,uint32)']);
const ERC = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)']);

/* The board. Add a row and it appears on the page — one list, no second place to edit.
 * ⚠ THESE SIX ARE ALL 0.30% POOLS AND FIVE OF THEM CANNOT BE TRADED BY ANYONE. `npm run edge`
 *   measured the average move against each pool's own toll: PEPE 0.12×, SHIB 0.18×, and even at a
 *   four-hour hold PEPE only reaches 0.60×. A perfect forecaster loses money in those. They stay
 *   on the board because the page is a RESEARCH terminal and "this market is untradeable" is a
 *   finding worth showing — but they are no longer the whole universe. */
const MANUAL = [
  { name: 'PEPE', pool: '0xa43fe16908251ee70ef74718545e4fe6c5ccec9f' },
  { name: 'BITCOIN', pool: '0x25392d7129040710f152174af5019004a6f9b18d' },
  { name: 'WOJAK', pool: '0xcaa3a16f8440f85303afaab1992f2b97d12469b1' },
  { name: 'SPX6900', pool: '0x52c77b0cb827afbad022e6d6caf2c44452edbc39' },
  { name: 'MOG', pool: '0x7832310cd0de39c4ce0a635f34d9a4b5b47fd434' },
  { name: 'ANDY', pool: '0xa1bf0e900fb272089c9fd299ea14bfccb1d1c2c0' },
];

/* ⛔ A HAND-TYPED UNIVERSE ROTS, AND THIS ONE HAD ROTTED INTO SIX POOLS WHERE NO SIGNAL CAN PAY.
 *   The board now ABSORBS whatever `npm run edge` says clears its own toll at some horizon, so the
 *   universe follows the market instead of following whoever last edited this file. Each row
 *   carries where it came from and the arithmetic that admitted it, because "why is this on the
 *   board" is exactly the question a stale list can never answer. */
const EDGE_FILE = join(ROOT, 'data/edge-ethereum.json');
let derived = [];
try {
  const e = JSON.parse(readFileSync(EDGE_FILE, 'utf8'));
  derived = (e.rows || [])
    .filter(r => r.crossMin != null)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, Number(process.env.EDGE_N || 6))
    .map(r => ({ name: `${r.sym}·${(r.feeBps / 100).toFixed(2)}%`, pool: r.pool, src: 'edge',
      ratio: r.ratio, crossMin: r.crossMin, feeBps: r.feeBps }));
} catch { /* no screen yet — the manual list still stands, and the page says how old it is */ }
const seenPool = new Set();
const WATCH = [...derived, ...MANUAL.map(m => ({ ...m, src: 'manual' }))]
  .filter(p => !seenPool.has(p.pool.toLowerCase()) && seenPool.add(p.pool.toLowerCase()));

const DAYS = Number(process.env.DAYS || 10);
const SEC = 12.042;

async function pull(cl, addr, ev, args, from, head) {
  const out = []; let fails = 0;
  const ch = []; for (let lo = from; lo <= head; lo += 800) ch.push([lo, Math.min(lo + 799, head)]);
  const q = ch.slice();
  await Promise.all(cs.map(async x => { for (;;) { const j = q.shift(); if (!j) return;
    let ok = false;
    for (let a = 0; a < 2 && !ok; a++) { try { out.push(...await x.getLogs({ address: addr, event: ev, args, fromBlock: BigInt(j[0]), toBlock: BigInt(j[1]) })); ok = true; } catch {} }
    if (!ok) fails++; } }));
  return { out, fails };
}

async function measure(row, head) {
  const from = head - Math.round(DAYS * 86400 / SEC);
  let kind = null, fee = 3000;
  try { fee = Number(await c.readContract({ address: row.pool, abi: V3, functionName: 'fee' })); kind = 'v3'; }
  catch { try { await c.readContract({ address: row.pool, abi: V2, functionName: 'getReserves' }); kind = 'v2'; } catch {} }
  if (!kind) return { ...row, err: 'not a v2/v3 pool' };
  const t0 = (await c.readContract({ address: row.pool, abi: V3, functionName: 'token0' })).toLowerCase();
  const t1 = (await c.readContract({ address: row.pool, abi: V3, functionName: 'token1' })).toLowerCase();
  const TOK = t0 === WETH ? t1 : t0, tokIs0 = TOK === t0;
  const [sym, dec] = await Promise.all([
    c.readContract({ address: TOK, abi: ERC, functionName: 'symbol' }).catch(() => row.name),
    c.readContract({ address: TOK, abi: ERC, functionName: 'decimals' }).catch(() => 18)]);

  const A = await pull(c, TOK, T, { from: row.pool }, from, head);
  const B = await pull(c, TOK, T, { to: row.pool }, from, head);
  const P = kind === 'v3' ? await pull(c, row.pool, SWAP3, undefined, from, head)
                          : await pull(c, row.pool, SYNC2, undefined, from, head);
  const gaps = A.fails + B.fails + P.fails;
  const pts = P.out.map(l => { let p;
    if (kind === 'v3') { const raw = Math.pow(Number(l.args.sqrtPriceX96) / 2 ** 96, 2); p = tokIs0 ? raw * 10 ** (dec - 18) : (1 / raw) * 10 ** (dec - 18); }
    else { const r0 = Number(l.args.reserve0), r1 = Number(l.args.reserve1); if (!r0 || !r1) return null; p = tokIs0 ? (r1 / r0) * 10 ** (dec - 18) : (r0 / r1) * 10 ** (dec - 18); }
    return Number.isFinite(p) && p > 0 ? { b: Number(l.blockNumber), p } : null; }).filter(Boolean).sort((a, b) => a.b - b.b);
  if (pts.length < 50) return { ...row, sym, kind, feePct: fee / 10000, err: 'too few price points', gaps };
  const pb = pts.map(x => x.b);
  const px = b => { let i = 0, j = pb.length - 1, k = -1; while (i <= j) { const m = (i + j) >> 1; if (pb[m] <= b) { k = m; i = m + 1; } else j = m - 1; } return k < 0 ? null : pts[k].p; };
  const flow = [...A.out.map(l => ({ b: Number(l.blockNumber), v: +Number(formatUnits(l.args.value, dec)) })),
                ...B.out.map(l => ({ b: Number(l.blockNumber), v: -Number(formatUnits(l.args.value, dec)) }))].sort((a, b) => a.b - b.b);

  const rt = 2 * (fee / 1e6) * 100;
  const horizons = [5, 15, 30, 60].map(min => {
    const w = Math.round(min * 60 / SEC), rows = []; let i = 0;
    for (let b = from; b + 2 * w <= head; b += w) { let net = 0;
      while (i < flow.length && flow[i].b < b) i++;
      for (let k = i; k < flow.length && flow[k].b < b + w; k++) net += flow[k].v;
      const p0 = px(b + w), p1 = px(b + 2 * w); if (!p0 || !p1) continue; rows.push({ net, fwd: (p1 - p0) / p0 }); }
    if (rows.length < 40) return { min, n: rows.length, thin: true };
    const mn = rows.reduce((a, r) => a + r.net, 0) / rows.length, mf = rows.reduce((a, r) => a + r.fwd, 0) / rows.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (const r of rows) { const x = r.net - mn, y = r.fwd - mf; sxy += x * y; sxx += x * x; syy += y * y; }
    const corr = sxy / Math.sqrt(sxx * syy || 1);
    const avg = xs => xs.reduce((a, r) => a + r.fwd, 0) / xs.length * 100;
    const sp = f => { const keep = rows.slice().sort((a, b) => Math.abs(a.fwd) - Math.abs(b.fwd)).slice(0, Math.floor(rows.length * (1 - f)));
      const q = Math.floor(keep.length / 5); if (q < 5) return null;
      const bn = keep.slice().sort((a, b) => a.net - b.net); return +(avg(bn.slice(-q)) - avg(bn.slice(0, q))).toFixed(3); };
    return { min, n: rows.length, corr: +corr.toFixed(3), spread: sp(0), trim2: sp(0.02), trim5: sp(0.05), trim10: sp(0.10) };
  });
  const best = horizons.filter(h => !h.thin && h.spread != null)
    .sort((a, b) => (b.trim5 ?? -9) - (a.trim5 ?? -9))[0] || null;
  const tradeable = !!(best && best.spread > rt && best.trim5 > rt);
  return { ...row, sym, kind, feePct: fee / 10000, roundTripPct: +rt.toFixed(3),
    priceWeth: pts[pts.length - 1].p, swaps: pts.length, poolTransfers: flow.length,
    horizons, tradeable, gaps };
}

console.log('\n  WORLD COMPUTER HYPERTERMINAL — measuring…\n');
const head = Number(await c.getBlockNumber());
const rows = [];
for (const w of WATCH) {
  process.stdout.write(`  ${w.name.padEnd(9)}`);
  try { const r = await measure(w, head); rows.push(r);
    console.log(r.err ? `⛔ ${r.err}` : `${r.kind} ${r.feePct}% · best ${r.horizons.filter(h=>!h.thin).sort((a,b)=>(b.trim5??-9)-(a.trim5??-9))[0]?.min}m · ${r.tradeable ? '✅ TRADEABLE' : 'no edge'}${r.gaps ? ` ⚠ ${r.gaps} gaps` : ''}`); }
  catch (e) { rows.push({ ...w, err: String(e.shortMessage || e.message).slice(0, 80) }); console.log(`⛔ ${String(e.shortMessage || e.message).slice(0, 60)}`); }
}

/* ── the chains themselves ── */
const [gasL1, blk] = await Promise.all([c.getGasPrice(), c.getBlock()]);
let baseGas = null, baseHead = null;
try { baseGas = await baseC.getGasPrice(); baseHead = Number(await baseC.getBlockNumber()); } catch {}

/* ── $3030's own state, read live ── */
const TOKEN = CFG.contracts.liquidEdition;
let ours = null;
try {
  const [sup, dec] = await Promise.all([
    c.readContract({ address: TOKEN, abi: ERC, functionName: 'totalSupply' }),
    c.readContract({ address: TOKEN, abi: ERC, functionName: 'decimals' })]);
  const max = await c.readContract({ address: TOKEN, abi: parseAbi(['function maxTotalSupply() view returns (uint256)']), functionName: 'maxTotalSupply' }).catch(() => 0n);
  const inPool = await c.readContract({ address: TOKEN, abi: ERC, functionName: 'balanceOf', args: [PMGR] }).catch(() => 0n);
  const treas = await c.readContract({ address: TOKEN, abi: ERC, functionName: 'balanceOf', args: [CFG.treasury] }).catch(() => 0n);
  ours = { totalSupply: +formatUnits(sup, dec), maxSupply: +formatUnits(max, dec),
    burned: +formatUnits(max - sup, dec), inPool: +formatUnits(inPool, dec), treasury: +formatUnits(treas, dec),
    reachedHolders: +(100 * (1 - Number(inPool) / Number(sup))).toFixed(2) };
} catch (e) { ours = { err: String(e.shortMessage || e).slice(0, 80) }; }

const doc = {
  measuredAt: new Date().toISOString(),
  block: head, days: DAYS,
  chains: {
    ethereum: { gwei: +formatUnits(gasL1, 9).slice(0, 8), baseFeeGwei: +formatUnits(blk.baseFeePerGas ?? 0n, 9).slice(0, 8),
      fullPct: +(100 * Number(blk.gasUsed) / Number(blk.gasLimit)).toFixed(1), swapUsd: +(Number(formatEther(gasL1 * 180000n)) * 1919.63).toFixed(4) },
    base: baseGas ? { gwei: +formatUnits(baseGas, 9).slice(0, 10), head: baseHead,
      swapUsd: +(Number(formatEther(baseGas * 180000n)) * 1919.63).toFixed(6) } : { err: 'unreachable' },
  },
  ours,
  board: rows,
  /* ⚠ Stated on the page, not buried here: the bar is spread > round trip AND surviving a 5% trim. */
  method: { bar: 'spread must beat the round trip AND survive dropping the largest 5% of moves',
    why: 'a spread is an average; a few violent windows can carry all of it, and you cannot pick those windows in advance' },
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 1));
const n = rows.filter(r => r.tradeable).length;
console.log(`\n  → data/terminal.json   ${rows.length} pools · ${n} clearing the bar${n ? '' : ' (none — that is the usual answer and it is the honest one)'}\n`);

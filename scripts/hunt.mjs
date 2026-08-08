#!/usr/bin/env node
/* ripmaster3030studios — THE HUNT.  `npm run hunt`
 *
 *   npm run hunt            one pass: screen the watchlist, trade the ones that pass, record it
 *   npm run hunt loop       the same, forever, on a clock
 *   npm run hunt record     the running win/loss ledger
 *
 * ⛔ IT PAPER-TRADES, AND THE RECORD IS THE PRODUCT. Every rule in here is backtested; none has a
 *   forward track record. The whole point of this file is to build one in public, at a cost of
 *   zero, so that "do the bots make money" stops being an argument and becomes a number anyone can
 *   read off the terminal. ⚑ A ledger that says −4% after two hundred trades is worth more than
 *   any backtest, and it is the only thing that should ever justify a real key.
 *
 * ⛔ AND IT ONLY TRADES WHAT PASSES THE SCREEN. Measured across four tokens in one night, ZERO
 *   cleared the bar — so on most days this does nothing at all, and that is the correct behaviour
 *   rather than a broken cron. A bot that always finds a trade is a bot fitting noise: the screen
 *   requires the flow→price spread to beat the pool's ROUND TRIP and to survive dropping the
 *   largest 5% of moves, because a spread is an average and a handful of violent windows can
 *   carry all of it. One pool measured +1.05pp against a 0.60% toll and collapsed to +0.38pp on
 *   that trim; without it this would have opened a position.
 *
 * ⚠ The screen is measured by `npm run terminal` and read from data/terminal.json. Positions are
 *   marked live. Nothing here holds a key or signs anything.
 */
import { createPublicClient, http, parseAbi, parseAbiItem, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCREEN = join(ROOT, 'data/terminal.json');
const LEDGER = join(ROOT, 'data/hunt.json');
/* ⛔ THE LEDGER AND THE HEARTBEAT ARE DIFFERENT FILES BECAUSE THEY CHANGE AT DIFFERENT RATES.
 *   `hunt.json` is PUBLISHED — the site fetches it — so it should change when something HAPPENED:
 *   a position opened, closed, or swept. `passes` and `updatedAt` change every five minutes
 *   forever, and writing them into the published file meant every single tick produced a commit
 *   whose entire diff was a timestamp. ⚑ That is not a tidiness complaint: a history where the
 *   signal ("a trade closed") is buried under three hundred heartbeats is a history nobody reads,
 *   and the deployed page can only ever be as fresh as the last deploy anyway, so the timestamp
 *   was never live on the site to begin with.
 * ⚠ The heartbeat is gitignored and therefore ABSENT in production, so anything reading it must
 *   treat missing as normal rather than as a failure. */
const BEAT = join(ROOT, 'data/hunt.live.json');
const cs = ['https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org']
  .map(u => createPublicClient({ chain: mainnet, transport: http(u, { timeout: 25000, retryCount: 1 }) }));
const c = cs[0];
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'.toLowerCase();
const V3 = parseAbi(['function fee() view returns (uint24)', 'function token0() view returns (address)', 'function token1() view returns (address)', 'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)']);
const V2 = parseAbi(['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)', 'function token1() view returns (address)']);
const ERC = parseAbi(['function decimals() view returns (uint8)']);

/* sizing and exits — the wide shape the 108-config sweep chose; narrow take-profits all lost */
const P = {
  stakeEth: Number(process.env.STAKE_ETH || 0.01),
  tpPct: 0.20, slPct: 0.50, holdHours: 4,
  skimBps: 5000,
  maxOpen: 3,
};

const load = () => {
  const base = { startedAt: new Date().toISOString(), open: [], closed: [], sweptEth: 0, skipped: 0, passes: 0 };
  let l = base;
  try { if (existsSync(LEDGER)) l = Object.assign({}, base, JSON.parse(readFileSync(LEDGER, 'utf8'))); } catch {}
  try { if (existsSync(BEAT)) Object.assign(l, JSON.parse(readFileSync(BEAT, 'utf8'))); } catch {}
  return l;
};
/* Split on write: the published ledger only when its own contents moved, the heartbeat always. */
const save = l => {
  mkdirSync(dirname(LEDGER), { recursive: true });
  const pub = { startedAt: l.startedAt, open: l.open, closed: l.closed, sweptEth: l.sweptEth };
  const now = JSON.stringify(pub, null, 1);
  let was = null; try { was = readFileSync(LEDGER, 'utf8'); } catch {}
  /* ⚠ compare the PUBLISHED shape, not the whole object — otherwise the counters reintroduce the
   *   churn this split exists to remove, and it would do so silently. */
  if (was !== now) writeFileSync(LEDGER, now);
  writeFileSync(BEAT, JSON.stringify({ passes: l.passes, skipped: l.skipped, updatedAt: l.updatedAt }, null, 1));
};

/* Live mark, from the pool's own state — not an index quote. */
async function priceOf(pool) {
  try {
    const t0 = (await c.readContract({ address: pool, abi: V3, functionName: 'token0' })).toLowerCase();
    const t1 = (await c.readContract({ address: pool, abi: V3, functionName: 'token1' })).toLowerCase();
    const tok = t0 === WETH ? t1 : t0, tokIs0 = tok === t0;
    const dec = await c.readContract({ address: tok, abi: ERC, functionName: 'decimals' }).catch(() => 18);
    try {
      const s = await c.readContract({ address: pool, abi: V3, functionName: 'slot0' });
      const raw = Math.pow(Number(s[0]) / 2 ** 96, 2);
      return tokIs0 ? raw * 10 ** (dec - 18) : (1 / raw) * 10 ** (dec - 18);
    } catch {
      const r = await c.readContract({ address: pool, abi: V2, functionName: 'getReserves' });
      const r0 = Number(r[0]), r1 = Number(r[1]);
      return tokIs0 ? (r1 / r0) * 10 ** (dec - 18) : (r0 / r1) * 10 ** (dec - 18);
    }
  } catch { return null; }
}

async function pass() {
  if (!existsSync(SCREEN)) { console.log('  ⛔ no screen — run `npm run terminal` first'); return; }
  const scr = JSON.parse(readFileSync(SCREEN, 'utf8'));
  const l = load();
  const now = Date.now();
  l.passes++;

  /* ── exits first: an open position outranks any new idea ── */
  for (const pos of l.open.slice()) {
    const px = await priceOf(pos.pool);
    if (px == null) { console.log(`  ${pos.name.padEnd(9)} mark unreadable — holding, NOT closing on a failed read`); continue; }
    const gross = px / pos.entry;
    const legs = (1 - pos.legCost) ** 2;
    const pnl = gross * legs - 1;
    const aged = (now - new Date(pos.at).getTime()) / 3600000 >= P.holdHours;
    const why = pnl >= P.tpPct ? 'take-profit' : pnl <= -P.slPct ? 'stop' : aged ? 'timeout' : null;
    if (!why) { console.log(`  ${pos.name.padEnd(9)} holding ${(pnl * 100).toFixed(2)}%  (${(P.holdHours - (now - new Date(pos.at).getTime()) / 3600000).toFixed(1)}h left)`); continue; }
    const out = pos.stakeEth * gross * legs;
    const profit = out - pos.stakeEth;
    const skim = profit > 0 ? profit * P.skimBps / 10000 : 0;
    l.sweptEth += skim;
    l.closed.push({ ...pos, closedAt: new Date().toISOString(), why, pnlPct: +(pnl * 100).toFixed(3),
      outEth: +out.toFixed(6), skimEth: +skim.toFixed(6) });
    l.open = l.open.filter(o => o.id !== pos.id);
    console.log(`  ${pos.name.padEnd(9)} ⚑ CLOSED ${why} ${(pnl * 100).toFixed(2)}%${skim ? ` · skim ${skim.toFixed(5)} ETH` : ''}`);
  }

  /* ── entries: only what the screen passes ── */
  const held = new Set(l.open.map(o => o.pool));
  for (const r of (scr.board || [])) {
    if (r.err || !r.tradeable) { l.skipped++; continue; }
    if (held.has(r.pool) || l.open.length >= P.maxOpen) continue;
    const px = await priceOf(r.pool);
    if (px == null) { console.log(`  ${r.name.padEnd(9)} passes the screen but the mark is unreadable — not entering blind`); continue; }
    const best = (r.horizons || []).filter(h => !h.thin && h.trim5 != null).sort((a, b) => b.trim5 - a.trim5)[0];
    l.open.push({ id: `${r.name}-${now}`, name: r.name, pool: r.pool, at: new Date().toISOString(),
      entry: px, stakeEth: P.stakeEth, legCost: r.roundTripPct / 200,
      because: `${best.min}m spread ${best.spread}pp trim5 ${best.trim5}pp vs ${r.roundTripPct}% round trip` });
    console.log(`  ${r.name.padEnd(9)} ▶ OPENED ${P.stakeEth} ETH · ${l.open[l.open.length - 1].because}`);
  }

  const passing = (scr.board || []).filter(r => r.tradeable).length;
  if (!passing && !l.open.length) console.log(`  nothing passed the screen (${(scr.board || []).length} pools) — standing down, which is the usual answer`);
  l.updatedAt = new Date().toISOString();
  save(l);
}

function record() {
  const l = load();
  const w = l.closed.filter(t => t.pnlPct > 0);
  const days = (Date.now() - new Date(l.startedAt).getTime()) / 86400000;
  console.log(`\n  THE HUNT · paper record · ${days.toFixed(1)} days, ${l.passes} passes`);
  console.log(`  closed        ${l.closed.length}${l.closed.length ? `  ·  ${w.length} green = ${(w.length / l.closed.length * 100).toFixed(1)}% win` : ''}`);
  console.log(`  open          ${l.open.length}${l.open.map(o => `  ${o.name}`).join('')}`);
  console.log(`  swept         ${l.sweptEth.toFixed(6)} ETH  (would have gone to the treasury)`);
  if (l.closed.length) {
    const tot = l.closed.reduce((a, t) => a + t.pnlPct, 0);
    console.log(`  average trade ${tot / l.closed.length >= 0 ? '+' : ''}${(tot / l.closed.length).toFixed(3)}%`);
    for (const t of l.closed.slice(-10)) console.log(`     ${t.closedAt.slice(5, 16)}  ${t.name.padEnd(9)} ${t.why.padEnd(11)} ${(t.pnlPct >= 0 ? '+' : '') + t.pnlPct}%`);
  } else {
    console.log(`\n  ⚑ No closed trades. With ${l.skipped} screen rejections so far, that is the screen doing`);
    console.log(`     its job — it has found nothing worth trading, which is what it found on all four`);
    console.log(`     tokens measured by hand. An empty ledger is evidence, not a malfunction.`);
  }
  console.log('');
}

const cmd = process.argv[2] || 'once';
if (cmd === 'record') record();
else if (cmd === 'loop') {
  console.log(`  THE HUNT · paper · stake ${P.stakeEth} ETH · tp +${P.tpPct * 100}% / sl −${P.slPct * 100}% / ${P.holdHours}h · max ${P.maxOpen} open`);
  console.log(`  ⛔ signs nothing. The record is the product.\n`);
  for (;;) { try { await pass(); } catch (e) { console.log('  ⚠', String(e.shortMessage || e.message).slice(0, 90)); }
    await new Promise(r => setTimeout(r, Number(process.env.TICK_MS || 300000))); }
} else await pass();

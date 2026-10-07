#!/usr/bin/env node
/* ripmaster3030studios — THE DAEMON.  One long-running process: read, decide, execute, skim.
 *
 *   node bot/run.mjs            dry run (the default — decides and logs, signs nothing)
 *   LIVE=1 node bot/run.mjs     signs, subject to every rail in lib/rails.mjs
 *   node bot/run.mjs report     what the book has done
 *
 * ── WHY THIS EXISTS ALONGSIDE api/tick.js, AND WHY IT SUPERSEDES IT ────────────────────────
 * ⛔ `api/tick.js` ONLY BUYS. A Vercel cron is stateless: each invocation is a fresh process with
 *   no memory of an open position, so take-profit, stop-loss and the timeout have nowhere to live.
 *   As written it would enter and never exit — which is not a bot, it is a slow way to convert ETH
 *   into an unmanaged bag. Keeping state in KV could patch it, but then the position lives in a
 *   database a network blip can hide, and "did I already sell?" becomes a question with two
 *   possible answers. A daemon holds one answer.
 *
 * ⚑ IT ALSO REMOVES THE TWO THINGS THAT MADE THE HOSTED VERSION AWKWARD: no cron-tier minimum, and
 *   the key sits in a file on a box you control rather than in a hosting dashboard.
 *
 * ── THE SELL LEG NEEDS APPROVALS AND THAT IS A REAL TRAP ───────────────────────────────────
 * ⛔ Buying is free of approvals because the input is native ETH. SELLING is not: FWA must be
 *   approved to Permit2, and Permit2 must be approved to the router. Miss either and the sell
 *   reverts — at exactly the moment you are trying to take profit or stop a loss. So the daemon
 *   checks both allowances BEFORE it ever opens a position, and refuses to buy something it has
 *   not yet proved it can sell. ⚠ A bot that can enter and cannot exit is strictly worse than one
 *   that never enters.
 */
import {
  createPublicClient, createWalletClient, http, parseAbi, parseAbiItem, encodeAbiParameters,
  parseEther, formatEther, formatUnits, keccak256, maxUint256, maxUint160,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAILS, check } from './lib/rails.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE = join(HERE, 'state.json');
const LOG = join(HERE, 'bot.jsonl');

/* .env, read by hand — no dependency, and it never enters the repo (see .gitignore). */
if (existsSync(join(HERE, '.env'))) {
  for (const line of readFileSync(join(HERE, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PM = '0x000000000004444c5dc75cB358380D2e3dE08A90';
const ROUTER = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af';
const QUOTER = '0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const FWA = '0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';
const HOOK = '0x2C67ebA8A50AF0dB5Fba55F725247a75CbDA6444';
const ZERO = '0x0000000000000000000000000000000000000000';
const POOL_ID = '0x230ecd3c25b44af30db59c15f70df7794eb13f67a200f230b7400daa96fe804d';
const KEY = { currency0: ZERO, currency1: FWA, fee: 0, tickSpacing: 60, hooks: HOOK };
const TREASURY = '0x8455cF296e1265b494605207e97884813De21950';

const RPCS = (process.env.RPC_URLS || 'https://gateway.tenderly.co/public/mainnet,https://eth.drpc.org').split(',');
const pub = createPublicClient({ chain: mainnet, transport: http(RPCS[0], { timeout: 25000 }) });

const LIVE = process.env.LIVE === '1';
const acct = process.env.BOT_PRIVATE_KEY
  ? privateKeyToAccount(process.env.BOT_PRIVATE_KEY.startsWith('0x') ? process.env.BOT_PRIVATE_KEY : `0x${process.env.BOT_PRIVATE_KEY}`)
  : null;
const wallet = acct ? createWalletClient({ account: acct, chain: mainnet, transport: http(RPCS[0]) }) : null;

const QABI = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
  'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
]);
const RABI = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);
const ERC = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)']);
const P2 = parseAbi(['function allowance(address,address,address) view returns (uint160,uint48,uint48)', 'function approve(address,address,uint160,uint48)']);

const KEY_T = { type: 'tuple', components: [
  { name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] };

function swapCalldata({ zeroForOne, amountIn, minOut }) {
  const actions = '0x060c0f';                        // SWAP_EXACT_IN_SINGLE · SETTLE_ALL · TAKE_ALL
  const p0 = encodeAbiParameters([{ type: 'tuple', components: [
    { name: 'poolKey', ...KEY_T }, { name: 'zeroForOne', type: 'bool' },
    { name: 'amountIn', type: 'uint128' }, { name: 'amountOutMinimum', type: 'uint128' },
    { name: 'hookData', type: 'bytes' }] }],
    [{ poolKey: KEY, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: '0x' }]);
  const cIn = zeroForOne ? ZERO : FWA, cOut = zeroForOne ? FWA : ZERO;
  return {
    commands: '0x10',
    inputs: [encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [
      p0,
      encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [cIn, amountIn]),
      encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [cOut, minOut]),
    ]])],
  };
}

const load = () => existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8'))
  : { pos: null, startEth: null, swept: 0, spent: {}, trades: [], halted: false };
const save = s => writeFileSync(STATE, JSON.stringify(s, null, 1));
const note = o => appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function quote(zeroForOne, amountIn) {
  const q = await pub.simulateContract({ address: QUOTER, abi: QABI, functionName: 'quoteExactInputSingle',
    args: [{ poolKey: KEY, zeroForOne, exactAmount: amountIn, hookData: '0x' }] });
  return q.result[0];
}

/* ⛔ Can this wallet actually SELL? Checked before any buy, never after. */
async function canSell() {
  if (!acct) return { ok: true, note: 'no key — dry run' };
  const a1 = await pub.readContract({ address: FWA, abi: ERC, functionName: 'allowance', args: [acct.address, PERMIT2] });
  if (a1 < parseEther('1000000')) return { ok: false, why: 'FWA is not approved to Permit2', fix: 'approve' };
  const [amt, exp] = await pub.readContract({ address: PERMIT2, abi: P2, functionName: 'allowance', args: [acct.address, FWA, ROUTER] });
  if (amt === 0n || Number(exp) * 1000 < Date.now()) return { ok: false, why: 'Permit2 has not authorised the router (or it expired)', fix: 'permit2' };
  return { ok: true };
}

async function doApprovals() {
  if (!LIVE || !wallet) return say('dry run — would set the two sell approvals');
  const a1 = await pub.readContract({ address: FWA, abi: ERC, functionName: 'allowance', args: [acct.address, PERMIT2] });
  if (a1 < parseEther('1000000')) {
    const h = await wallet.writeContract({ address: FWA, abi: ERC, functionName: 'approve', args: [PERMIT2, maxUint256] });
    say('approve FWA→Permit2', h); await pub.waitForTransactionReceipt({ hash: h });
  }
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const h2 = await wallet.writeContract({ address: PERMIT2, abi: P2, functionName: 'approve', args: [FWA, ROUTER, maxUint160, exp] });
  say('approve Permit2→router', h2); await pub.waitForTransactionReceipt({ hash: h2 });
}

async function send({ zeroForOne, amountIn, label }) {
  const q = await quote(zeroForOne, amountIn);
  const minOut = q - (q * BigInt(RAILS.slippageBps)) / 10000n;
  const { commands, inputs } = swapCalldata({ zeroForOne, amountIn, minOut });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const value = zeroForOne ? amountIn : 0n;
  /* ⛔ simulate first, always. Hand-assembled v4 calldata fails silently when it is wrong. */
  if (acct) {
    try {
      await pub.simulateContract({ address: ROUTER, abi: RABI, functionName: 'execute', args: [commands, inputs, deadline], value, account: acct });
    } catch (e) {
      note({ ev: 'refused', label, why: String(e.shortMessage || e).slice(0, 140) });
      say(`⛔ ${label} REFUSED — simulation reverted, so the calldata is wrong, not the market:`, String(e.shortMessage || e).slice(0, 100));
      return null;
    }
  }
  if (!LIVE || !wallet) { say(`(dry) ${label}: would swap, expecting ${q}`); return { dry: true, q, minOut }; }
  const hash = await wallet.writeContract({ address: ROUTER, abi: RABI, functionName: 'execute', args: [commands, inputs, deadline], value });
  say(`${label} sent`, hash);
  const r = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: r.status, q, minOut };
}

async function signal(head) {
  const W = 25, N = 40, from = head - W * N;
  const T = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
  const S = parseAbiItem('event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)');
  let t = null, s = null, why = '';
  for (const u of RPCS) {
    const c = createPublicClient({ chain: mainnet, transport: http(u, { timeout: 20000 }) });
    try {
      t = await c.getLogs({ address: FWA, event: T, fromBlock: BigInt(from), toBlock: BigInt(head) });
      s = await c.getLogs({ address: PM, event: S, args: { id: POOL_ID }, fromBlock: BigInt(from), toBlock: BigInt(head) });
      break;
    } catch (e) { why = String(e.shortMessage || e).slice(0, 70); t = null; }
  }
  if (!t || !s) return { err: `every endpoint failed: ${why}` };   // ⛔ not "no signal"
  const b = new Float64Array(N), pm = PM.toLowerCase();
  for (const l of t) {
    const f = l.args.from.toLowerCase(), o = l.args.to.toLowerCase();
    if (f !== pm && o !== pm) continue;
    const i = Math.floor((Number(l.blockNumber) - from) / W);
    if (i >= 0 && i < N) b[i] += (f === pm ? 1 : -1) * Number(l.args.value / 10n ** 12n) / 1e6;
  }
  const hist = [...b.slice(0, N - 1)].sort((x, y) => x - y);
  const cut = hist[Math.floor(hist.length * 0.8)];
  return { now: b[N - 1], cut, top: b[N - 1] > cut,
    px: s.length ? 1 / Math.pow(Number(s[s.length - 1].args.sqrtPriceX96) / 2 ** 96, 2) : null };
}

async function tick() {
  const st = load();
  if (st.halted) return say('halted — the book halved. Restarting is a human decision.');
  const head = Number(await pub.getBlockNumber());
  const hour = new Date().getUTCHours();
  const sig = await signal(head);
  if (sig.err) { note({ ev: 'readfail', why: sig.err }); return say('⚠', sig.err, '— no decision (this is NOT "no signal")'); }
  if (!sig.px) return say('no swaps in the window — price unknown, standing down');

  const bal = acct ? Number(formatEther(await pub.getBalance({ address: acct.address }))) : 0.1;
  if (st.startEth == null) { st.startEth = bal; save(st); }

  /* ── holding? decide the exit ── */
  if (st.pos) {
    const pnl = (sig.px / st.pos.entryPx) * (1 - RAILS.legCost || 0.01055) - 1;
    const aged = head - st.pos.block > RAILS.holdBlocks;
    const why = pnl >= RAILS.tpPct ? 'take-profit' : pnl <= -RAILS.slPct ? 'STOP' : aged ? 'timeout' : null;
    if (!why) return say(`holding · ${(pnl * 100).toFixed(2)}%  (${RAILS.holdBlocks - (head - st.pos.block)} blocks left)`);

    const fwaBal = acct ? await pub.readContract({ address: FWA, abi: ERC, functionName: 'balanceOf', args: [acct.address] }) : BigInt(Math.floor(st.pos.fwa));
    const r = await send({ zeroForOne: false, amountIn: fwaBal, label: `EXIT ${why}` });
    if (!r) return;
    const outEth = r.dry ? Number(formatEther(r.q)) : Number(formatEther(r.q));
    const profit = outEth - st.pos.stake;
    let skim = 0;
    if (profit > 0) {
      skim = profit * RAILS.skimBps / 10000;
      if (LIVE && wallet) {
        const g = check({ toAddress: TREASURY, valueEth: skim, spentTodayEth: 0, walletBalanceEth: bal, hourUTC: hour, live: true });
        if (g.ok) { const h = await wallet.sendTransaction({ to: TREASURY, value: parseEther(skim.toFixed(12)) }); say('skim → treasury', h); }
        else say('skim held back:', g.why);
      }
      st.swept += skim;
    }
    st.trades.push({ at: new Date().toISOString(), why, pnlPct: +(pnl * 100).toFixed(3), skim: +skim.toFixed(6) });
    st.pos = null; save(st);
    note({ ev: 'exit', why, pnl, skim });
    return say(`EXIT ${why} ${(pnl * 100).toFixed(2)}%${skim ? ` · skimmed ${skim.toFixed(5)} ETH to treasury` : ''}`);
  }

  /* ── flat, but the wallet already holds a bag? ADOPT IT RATHER THAN IGNORE IT. ──
   * ⛔ The bot being "flat" while the wallet holds $100 of the token is the worst of both states:
   *   nothing is managing the real exposure and the bot is looking for more. Adoption gives the
   *   existing position a take-profit and a clock. The cost basis comes from `flow:wallet` if the
   *   operator passes it; absent that, the CURRENT price is used and that is stated out loud —
   *   an adopted bag with an invented entry would report a fictional P&L. */
  if (acct) {
    const held = await pub.readContract({ address: FWA, abi: ERC, functionName: 'balanceOf', args: [acct.address] });
    if (held > parseEther('1') && !st.pos) {
      const basis = Number(process.env.BASIS_ETH || 0);
      st.pos = { entryPx: basis > 0 ? basis / Number(formatUnits(held, 18)) : sig.px, stake: basis || Number(formatUnits(held, 18)) * sig.px,
        block: head, fwa: Number(formatUnits(held, 18)), adopted: true, basisKnown: basis > 0 };
      save(st);
      say(`⚑ ADOPTED an existing bag of ${Number(formatUnits(held, 18)).toFixed(0)} FWA${basis > 0 ? ` at a stated basis of ${basis} ETH` : ' — no BASIS_ETH given, so P&L is measured FROM NOW, not from your real entry'}`);
      note({ ev: 'adopt', fwa: formatUnits(held, 18), basisKnown: basis > 0 });
      return;
    }
  }

  if (RAILS.manageOnly) return say('manage-only: holding no position and not opening one');

  const day = new Date().toISOString().slice(0, 10);
  const spent = st.spent[day] || 0;
  const stake = Math.min(RAILS.maxPerTrade, RAILS.maxPerDay - spent);
  const gate = check({ toAddress: ROUTER, valueEth: stake, spentTodayEth: spent, walletBalanceEth: bal, hourUTC: hour, live: LIVE || !acct });
  if (!gate.ok && !(gate.why || '').includes('LIVE')) return say('stand down:', gate.why);
  if (!sig.top) return say(`no signal · accumulation ${sig.now.toFixed(0)} vs cut ${sig.cut.toFixed(0)}`);

  /* ⛔ refuse to buy what we have not proved we can sell */
  const sellable = await canSell();
  if (!sellable.ok) { say(`⛔ NOT ENTERING — ${sellable.why}. Run:  node bot/run.mjs approve`); return; }

  const r = await send({ zeroForOne: true, amountIn: parseEther(String(stake)), label: 'ENTRY' });
  if (!r) return;
  st.pos = { entryPx: sig.px, stake, block: head, fwa: Number(r.q) };
  st.spent[day] = spent + stake; save(st);
  note({ ev: 'entry', px: sig.px, stake });
  say(`▶ ENTRY ${stake} ETH at ${sig.px.toExponential(4)}`);
}

function report() {
  const s = load();
  const w = s.trades.filter(t => t.pnlPct > 0);
  console.log(`\n  BOOK  (${LIVE ? '⚠ LIVE' : 'dry run'})`);
  console.log(`  swept to treasury  ${s.swept.toFixed(6)} ETH → ${TREASURY}  ⚑ one-way`);
  console.log(`  trades             ${s.trades.length}${s.trades.length ? `, ${w.length} green = ${(w.length / s.trades.length * 100).toFixed(1)}%` : ''}`);
  if (s.pos) console.log(`  OPEN               ${s.pos.stake} ETH from block ${s.pos.block}`);
  for (const t of s.trades.slice(-10)) console.log(`     ${t.at.slice(5, 16)}  ${t.why.padEnd(11)} ${(t.pnlPct >= 0 ? '+' : '') + t.pnlPct}%  skim ${t.skim}`);
  console.log('');
}

const cmd = process.argv[2];
if (cmd === 'report') report();
else if (cmd === 'approve') await doApprovals();
else if (cmd === 'once') await tick();
else {
  const rehash = keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
    [KEY.currency0, KEY.currency1, KEY.fee, KEY.tickSpacing, KEY.hooks]));
  if (rehash.toLowerCase() !== POOL_ID) { console.error('⛔ PoolKey does not rehash to the pool id — refusing to start'); process.exit(1); }
  say(`FWA/ETH daemon · ${LIVE ? '⚠ LIVE — it will sign' : 'DRY RUN — signs nothing'} · wallet ${acct?.address || 'none'}`);
  say(`rails: ${RAILS.maxPerTrade} ETH/trade, ${RAILS.maxPerDay}/day, ceiling ${RAILS.maxWalletBalance}, window ${RAILS.hoursUTC[0]}-${RAILS.hoursUTC.at(-1)}h UTC`);
  for (;;) {
    try { await tick(); } catch (e) { note({ ev: 'error', why: String(e.message).slice(0, 160) }); say('⚠', String(e.shortMessage || e.message).slice(0, 120)); }
    await new Promise(r => setTimeout(r, Number(process.env.TICK_MS || 60000)));
  }
}

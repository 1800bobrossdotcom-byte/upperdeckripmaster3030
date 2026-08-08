/* ripmaster3030studios — THE EXECUTOR.  One cron tick: read, decide, simulate, maybe send.
 *
 * ⛔ DEPLOY THIS AS ITS OWN VERCEL PROJECT. Never in the site's project. Every function in a Vercel
 *   project shares one environment, and the site's project already has two endpoints that reflect
 *   `process.env` keys into HTTP responses (api/pin.js, api/presence.js) plus an LLM endpoint that
 *   takes user text (api/lore.js). Those filter tightly enough today; the point is that a signing
 *   key must not live where echoing env is a debugging habit.
 *
 * ⛔ DRY RUN IS THE DEFAULT AND `LIVE=1` IS THE ONLY WAY PAST IT. Every rule this executes is
 *   backtested and none is forward-tested — the best in-sample configuration went 69.5% win /
 *   +9,459% and then 50.0% win / −60% out of sample. Run it dry until the paper book says
 *   otherwise.
 *
 * ⛔ AND IT SIMULATES BEFORE IT SENDS, ALWAYS, WITH NO BYPASS. v4 calldata is assembled by hand
 *   here (UniversalRouter commands → v4 actions → abi-encoded params) and this repo's own record
 *   of hand-assembled calldata is that "every failure is silent — wrong selector hits the
 *   fallback, wrong offset approves the wrong spender". So the transaction is eth_call'd first and
 *   its output compared against the Quoter; a disagreement past maxQuoteDeviationBps means the
 *   calldata is not doing what it is meant to, and the response to that is never to send.
 *
 * env (Production only, never Preview):
 *   CRON_SECRET       required — rejects anything not carrying it
 *   BOT_PRIVATE_KEY   the hot key. ⚠ Fund it with what you can lose. It is NOT the treasury.
 *   LIVE              "1" to actually sign. Absent = decide and log only.
 *   KV_REST_API_URL / KV_REST_API_TOKEN   for the daily-spend counter that survives a restart
 */
import {
  createPublicClient, createWalletClient, http, parseAbi, parseAbiItem, encodeAbiParameters,
  parseEther, formatEther, keccak256, encodePacked,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import { RAILS, check } from '../lib/rails.mjs';

const PM = '0x000000000004444c5dc75cB358380D2e3dE08A90';
const ROUTER = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af';
const QUOTER = '0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203';
const FWA = '0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';
const HOOK = '0x2C67ebA8A50AF0dB5Fba55F725247a75CbDA6444';
const ZERO = '0x0000000000000000000000000000000000000000';
const POOL_ID = '0x230ecd3c25b44af30db59c15f70df7794eb13f67a200f230b7400daa96fe804d';
/* PROVEN, not copied: this key rehashes to POOL_ID. Asserted at boot below. */
const KEY = { currency0: ZERO, currency1: FWA, fee: 0, tickSpacing: 60, hooks: HOOK };

const RPCS = ['https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org'];
const pub = createPublicClient({ chain: mainnet, transport: http(RPCS[0], { timeout: 20000 }) });

const kv = { url: process.env.KV_REST_API_URL || '', tok: process.env.KV_REST_API_TOKEN || '' };
async function kvCmd(...cmd) {
  if (!kv.url) return null;
  const r = await fetch(kv.url, { method: 'POST', headers: { authorization: `Bearer ${kv.tok}`, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  if (!r.ok) return null;
  return (await r.json())?.result ?? null;
}

const QABI = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
  'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
]);
const RABI = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);

/* v4 through the UniversalRouter: one command (V4_SWAP) whose input is (actions, params). */
const V4_SWAP = '0x10';
const A_SWAP_EXACT_IN_SINGLE = 0x06, A_SETTLE_ALL = 0x0c, A_TAKE_ALL = 0x0f;
const KEY_T = { type: 'tuple', components: [
  { name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] };

function swapCalldata({ zeroForOne, amountIn, minOut }) {
  const actions = `0x${A_SWAP_EXACT_IN_SINGLE.toString(16).padStart(2, '0')}${A_SETTLE_ALL.toString(16).padStart(2, '0')}${A_TAKE_ALL.toString(16).padStart(2, '0')}`;
  const p0 = encodeAbiParameters([{ type: 'tuple', components: [
    { name: 'poolKey', ...KEY_T }, { name: 'zeroForOne', type: 'bool' },
    { name: 'amountIn', type: 'uint128' }, { name: 'amountOutMinimum', type: 'uint128' },
    { name: 'hookData', type: 'bytes' }] }],
    [{ poolKey: KEY, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: '0x' }]);
  const cIn = zeroForOne ? ZERO : FWA, cOut = zeroForOne ? FWA : ZERO;
  const p1 = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [cIn, amountIn]);
  const p2 = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [cOut, minOut]);
  const input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [p0, p1, p2]]);
  return { commands: V4_SWAP, inputs: [input] };
}

/* the same causal signal the paper bot uses: trailing net accumulation vs its own trailing history */
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
  /* ⛔ a read that failed is NOT "no signal" */
  if (!t || !s) return { err: `both endpoints failed: ${why}` };
  const b = new Float64Array(N), pm = PM.toLowerCase();
  for (const l of t) {
    const f = l.args.from.toLowerCase(), o = l.args.to.toLowerCase();
    if (f !== pm && o !== pm) continue;
    const i = Math.floor((Number(l.blockNumber) - from) / W);
    if (i >= 0 && i < N) b[i] += (f === pm ? 1 : -1) * Number(l.args.value / 10n ** 12n) / 1e6;
  }
  const hist = [...b.slice(0, N - 1)].sort((x, y) => x - y);
  return { now: b[N - 1], cut: hist[Math.floor(hist.length * 0.8)], top: b[N - 1] > hist[Math.floor(hist.length * 0.8)],
    px: s.length ? 1 / Math.pow(Number(s[s.length - 1].args.sqrtPriceX96) / 2 ** 96, 2) : null };
}

export default async function handler(req, res) {
  const out = (code, o) => res.status(code).json({ t: new Date().toISOString(), ...o });

  /* 1 — only Vercel's scheduler may fire this */
  const secret = process.env.CRON_SECRET;
  if (!secret) return out(500, { error: 'CRON_SECRET is not set — refusing to run unauthenticated' });
  const auth = req.headers?.authorization || '';
  if (auth !== `Bearer ${secret}`) return out(401, { error: 'unauthorized' });

  /* 2 — the PoolKey must reproduce the pool id, or we are about to trade something else */
  const rehash = keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
    [KEY.currency0, KEY.currency1, KEY.fee, KEY.tickSpacing, KEY.hooks]));
  if (rehash.toLowerCase() !== POOL_ID) return out(500, { error: 'PoolKey does not rehash to the pool id', rehash });

  const live = process.env.LIVE === '1';
  const pk = process.env.BOT_PRIVATE_KEY;
  if (live && !pk) return out(500, { error: 'LIVE is set but BOT_PRIVATE_KEY is not' });
  const account = pk ? privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`) : null;

  const head = Number(await pub.getBlockNumber());
  const hourUTC = new Date().getUTCHours();
  const sig = await signal(head);
  if (sig.err) return out(200, { action: 'none', reason: sig.err, note: 'a failed read is not a signal' });
  if (!sig.px) return out(200, { action: 'none', reason: 'no swaps in the window — price unknown' });
  if (!sig.top) return out(200, { action: 'none', reason: 'accumulation below the top quintile', now: sig.now, cut: sig.cut });

  const balWei = account ? await pub.getBalance({ address: account.address }) : 0n;
  const bal = Number(formatEther(balWei));
  const day = new Date().toISOString().slice(0, 10);
  const spent = Number(await kvCmd('GET', `bot:spent:${day}`) || 0);
  const stake = Math.min(RAILS.maxPerTrade, RAILS.maxPerDay - spent);

  const gate = check({ toAddress: ROUTER, valueEth: stake, spentTodayEth: spent, walletBalanceEth: bal, hourUTC, live });

  /* 3 — quote, then build, then SIMULATE, and compare. Never send on a disagreement. */
  const amountIn = parseEther(String(stake));
  let quoted = null, simulated = null, deviationBps = null;
  try {
    const q = await pub.simulateContract({ address: QUOTER, abi: QABI, functionName: 'quoteExactInputSingle',
      args: [{ poolKey: KEY, zeroForOne: true, exactAmount: amountIn, hookData: '0x' }] });
    quoted = q.result[0];
  } catch (e) { return out(200, { action: 'none', reason: `quote failed: ${String(e.shortMessage || e).slice(0, 90)}` }); }

  const minOut = quoted - (quoted * BigInt(RAILS.slippageBps)) / 10000n;
  const { commands, inputs } = swapCalldata({ zeroForOne: true, amountIn, minOut });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  if (account) {
    try {
      await pub.simulateContract({ address: ROUTER, abi: RABI, functionName: 'execute',
        args: [commands, inputs, deadline], value: amountIn, account });
      simulated = true;
    } catch (e) {
      return out(200, { action: 'refused', reason: `simulation reverted — the calldata is wrong, not the market: ${String(e.shortMessage || e).slice(0, 120)}` });
    }
  }

  const decision = {
    action: gate.ok && simulated ? 'BUY' : 'none',
    reason: gate.ok ? (simulated ? 'signal + rails + simulation all clear' : 'no key: decided only') : gate.why,
    hourUTC, stake, balance: bal, spentToday: spent,
    price: sig.px, quotedFwa: quoted?.toString(), minOut: minOut.toString(),
    signal: { now: sig.now, cut: sig.cut },
    live, wallet: account?.address || null,
  };
  if (!gate.ok || !live || !simulated) return out(200, decision);

  /* 4 — send. Everything above had to pass first. */
  const wallet = createWalletClient({ account, chain: mainnet, transport: http(RPCS[0]) });
  const hash = await wallet.writeContract({ address: ROUTER, abi: RABI, functionName: 'execute',
    args: [commands, inputs, deadline], value: amountIn });
  await kvCmd('INCRBYFLOAT', `bot:spent:${day}`, String(stake));
  await kvCmd('EXPIRE', `bot:spent:${day}`, '172800');
  return out(200, { ...decision, sent: hash });
}

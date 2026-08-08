#!/usr/bin/env node
/* ripmaster3030studios — THE MARKET MAKER'S CONSOLE (window: none, keys: none).
 *
 *   npm run mm book                          read all three pools, price + fee + hazards
 *   npm run mm quote --eth 0.5               size a two-sided range with 0.5 ETH of capital
 *   npm run mm quote --usd 1000 --width 25   ± 25% instead of the default ± 20%
 *
 * ⛔ THIS SIGNS NOTHING AND HOLDS NO KEY, ON PURPOSE, AND THAT IS NOT TIMIDITY.
 *   Minting a v4 position is `PositionManager.modifyLiquidities` behind Permit2, with native
 *   ETH as currency0 — several encoded actions, real money, and no audit. The repo's own
 *   standard for a contract is "small enough to read in one sitting"; the standard for a bot
 *   that spends the treasury should be at least that. So this computes the position and PRINTS
 *   it. A human reads the numbers and posts it. Execution is a separate, later, rehearsed step.
 *   ⚠ There is a second reason and it is the stronger one: an LP position is a POSITION. It can
 *   lose money while working perfectly. Automating the entry before anyone has watched one
 *   round-trip is how you find that out at scale instead of at a sensible size.
 *
 * ── WHAT A MARKET MAKER IS, AND WHAT IT IS NOT ─────────────────────────────────────────────
 * A maker quotes BOTH sides and carries inventory risk; it earns the fee and it eats the
 * adverse selection. A manipulator only buys, and needs somebody else to be fooled. This file
 * only knows how to do the first thing: every range it prints holds both assets, and it tells
 * you what you are left holding at each end before you post it.
 *
 * ⚑ THE POOL PARAMETERS ARE PROVEN, NOT TRUSTED. A v4 pool id IS `keccak256(abi.encode(PoolKey))`,
 *   so re-hashing (currency0, currency1, fee, tickSpacing, hooks) and comparing to the id proves
 *   the fee offline, with no RPC call and nobody to take at their word. `book` refuses to report
 *   a pool whose params do not reproduce its id. That matters here specifically: one of the three
 *   pools this project has published carries an 89.898% swap fee.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient, http, keccak256, encodeAbiParameters, encodePacked, parseAbiItem,
} from 'viem';
import { mainnet } from 'viem/chains';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── chain-config is the one source for RPCs and the token, same as every other script here ── */
function chainConfig() {
  const src = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
  const w = {}; new Function('window', src)(w);
  return w.RIPMASTER_CHAIN;
}
const CFG = chainConfig();
const TOKEN = CFG.contracts.liquidEdition;
const RARE  = CFG.protocol.rare;
const USDC  = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ZERO  = '0x0000000000000000000000000000000000000000';
const PM    = '0x000000000004444c5dc75cB358380D2e3dE08A90';   // v4 PoolManager (singleton)

/* Every $3030 market this project has ever published. `fee`/`spacing`/`hooks` are PROVEN against
 * the id by re-hashing the PoolKey — a wrong value cannot reproduce the id, so nothing here is
 * taken on trust.
 * ⚠ THE USDC POOL IS KEPT AFTER BEING DELISTED, AND THAT IS DELIBERATE. A hazard removed from
 *   the config is a hazard the tooling can no longer recognise; leaving it here, flagged, means
 *   `book` still names it if anyone re-adds it and the test still proves why it was dropped.
 *   `delisted` means "not in chain-config", never "safe". */
const POOLS = [
  { key: 'RARE', id: '0x7943d0d19a67d2185de840d8cf057b21f67b60bf442a4a727f66551ac1cd7ab6',
    c0: TOKEN, c1: RARE, fee: 0,      spacing: 60,
    hooks: '0x8Ff5660951C974f4806F0bEF9A32bcf35d3aE0cC', d0: 18, d1: 18, quote: 'RARE', tokenIs: 0 },
  { key: 'ETH',  id: '0x9a7e4306112ddeb2527bcc97b73c74624d5c65aca9fccfae4e389cf061192ca7',
    c0: ZERO,  c1: TOKEN, fee: 9000,  spacing: 90,
    hooks: ZERO, d0: 18, d1: 18, quote: 'ETH', tokenIs: 1 },
  { key: 'USDC', id: '0x597a6772ea18e45803ecf070193d2314934c3b604badf6c62851babf2b530d9c',
    c0: TOKEN, c1: USDC, fee: 898980, spacing: 8990,
    hooks: ZERO, d0: 18, d1: 6, quote: 'USDC', tokenIs: 0, delisted: true },
];
/* What the site actually publishes today, so `book` can say which of the above are live. */
const LISTED = new Set((CFG.market.pools || []).map(p => String(p.id).toLowerCase()));

const poolId = p => keccak256(encodeAbiParameters(
  [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
  [p.c0, p.c1, p.fee, p.spacing, p.hooks]));

const client = createPublicClient({ chain: mainnet, transport: http(process.env.RPC_URL || CFG.rpcs[0]) });

/* ── slot0, read straight out of the singleton's storage ────────────────────────────────────
 * PoolManager keeps `mapping(PoolId => Pool.State) pools` at slot 6, and Pool.State's first
 * word is slot0 = (sqrtPriceX96 | tick << 160 | …). `extsload` is the sanctioned public reader.
 * ⚠ The tick is a SIGNED 24-bit field — sign-extend it or every price below 1.0 comes back as
 *   about 1.7e7 and the whole console reports nonsense with total confidence. */
async function slot0(id) {
  const slot = keccak256(encodePacked(['bytes32', 'uint256'], [id, 6n]));
  const word = BigInt(await client.readContract({
    address: PM, abi: [parseAbiItem('function extsload(bytes32) view returns (bytes32)')],
    functionName: 'extsload', args: [slot],
  }));
  let tick = Number((word >> 160n) & 0xffffffn);
  if (tick >= 0x800000) tick -= 0x1000000;
  return { sqrtPriceX96: word & ((1n << 160n) - 1n), tick };
}

/* raw 1.0001^tick is currency1 per currency0 in BASE UNITS; the decimal shift makes it human. */
const rawPrice   = tick => Math.pow(1.0001, tick);
const humanPrice = (tick, p) => rawPrice(tick) * Math.pow(10, p.d0 - p.d1);
/* Whichever side $3030 sits on, express one $3030 in units of the quote asset. */
const tokenInQuote = (tick, p) => p.tokenIs === 0 ? humanPrice(tick, p) : 1 / humanPrice(tick, p);

const tickToSqrt = t => Math.pow(1.0001, t / 2);
const priceToTick = px => Math.log(px) / Math.log(1.0001);
const align = (t, s, dir) => (dir < 0 ? Math.floor(t / s) : Math.ceil(t / s)) * s;

/* ── spot, from outside the chain, and LABELLED as such ──────────────────────────────────── */
async function usdRefs() {
  const get = async (url, pick) => {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
    try { const r = await fetch(url, { signal: ctl.signal }); return pick(await r.json()) || 0; }
    catch { return 0; } finally { clearTimeout(to); }
  };
  const eth = await get('https://api.coinbase.com/v2/prices/ETH-USD/spot',
    j => parseFloat(j?.data?.amount));
  const ds = await get(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN}`, j => j);
  const pair = (ds?.pairs || [])[0] || null;
  return {
    ethUsd: eth,
    tokenUsd: pair ? parseFloat(pair.priceUsd) : 0,
    vol24: pair ? Number(pair.volume?.h24 || 0) : 0,
    liqQuoteUsd: pair && pair.liquidity
      ? Number(pair.liquidity.quote || 0) * (parseFloat(pair.priceUsd) / parseFloat(pair.priceNative))
      : 0,
    src: pair ? pair.pairAddress : null,
  };
}

const fmt = (n, d = 4) => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : '—';
/* ⚠ A $0.089 token needs four decimals and a $1,918 one needs two. A single
 *   `maximumFractionDigits: 2` prints the token price as "$0.09" and quietly throws away the
 *   precision every range boundary in this file is computed from. */
const usd = n => !Number.isFinite(n) ? '—'
  : '$' + n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 1 ? 5 : 2 });

/* ── BOOK ──────────────────────────────────────────────────────────────────────────────── */
async function book() {
  const refs = await usdRefs();
  console.log('\n  $3030 — THE BOOK        (chain: ticks + params · APIs: USD spot, labelled)\n');
  console.log(`  ETH/USD ${usd(refs.ethUsd)}  ·  $3030 ${usd(refs.tokenUsd)} (DexScreener)  ·  24h vol ${usd(refs.vol24)}`);
  console.log(`  buy-side depth in the deepest pool: ${usd(refs.liqQuoteUsd)}   ⚠ NOT the headline "liquidity" — that is 97% unsold inventory\n`);

  const rows = [];
  for (const p of POOLS) {
    const proven = poolId(p).toLowerCase() === p.id.toLowerCase();
    if (!proven) { console.log(`  ⛔ ${p.key}: params do NOT reproduce the pool id — refusing to report it`); continue; }
    const s = await slot0(p.id);
    const inQuote = tokenInQuote(s.tick, p);
    const tokUsd = p.key === 'ETH' ? (refs.ethUsd ? refs.ethUsd / humanPrice(s.tick, p) : NaN)
                 : p.key === 'USDC' ? inQuote
                 : (refs.tokenUsd || NaN);
    rows.push({ p, s, inQuote, tokUsd, live: s.sqrtPriceX96 > 0n });
  }

  const ref = rows.find(r => r.p.key === 'RARE');
  const refUsd = refs.tokenUsd || (ref ? ref.tokUsd : 0);

  for (const r of rows) {
    const { p } = r;
    const feePct = p.fee / 10000;
    const skew = refUsd && Number.isFinite(r.tokUsd) ? (r.tokUsd - refUsd) / refUsd * 100 : NaN;
    const listed = LISTED.has(p.id.toLowerCase());
    console.log(`  ── ${p.key} pool  ${p.id.slice(0, 12)}…   ${listed ? 'LISTED on the site' : '⛔ DELISTED — not in chain-config'}`);
    console.log(`     initialized  ${r.live ? 'yes' : 'NO — never initialized'}   tick ${r.s.tick}`);
    console.log(`     price        1 $3030 = ${fmt(r.inQuote, 6)} ${p.quote}   ≈ ${usd(r.tokUsd)}` +
                (Number.isFinite(skew) ? `   (${skew >= 0 ? '+' : ''}${skew.toFixed(1)}% vs the RARE pool)` : ''));
    console.log(`     swap fee     ${feePct}%  ${p.fee === 0 ? '⛔ ZERO — an external LP here earns NOTHING, ever' : feePct > 1 ? '⛔ HAZARD' : '✅ a maker is paid here'}`);
    console.log(`     hook         ${p.hooks === ZERO ? 'none ✅ nothing skims the fee' : p.hooks + '  ⚠ takes the fee via return-delta'}`);
    /* ⚠ The message has to read the CONFIG, not a memory of it. It said "this id is in
     *   chain-config" for one commit after the id was removed — a sentence describing a state
     *   that has changed is this repo's most-recorded defect, and a console is a surface too. */
    if (feePct > 1) console.log(listed
      ? `     ⛔ DELIST NOW. A ${feePct}% fee is not a market, and this id IS in chain-config.market.pools[].`
      : `     ✅ Correctly delisted. A ${feePct}% fee is not a market, and the fee is immutable — it never can be.`);
    console.log('');
  }

  const eth = rows.find(r => r.p.key === 'ETH');
  console.log('  ⚑ WHERE A MAKER SHOULD QUOTE');
  if (eth && eth.live) {
    console.log(`     The ETH pool: 0.9% fee, no hook, and ${Number.isFinite(eth.tokUsd) && refUsd ? Math.abs((eth.tokUsd - refUsd) / refUsd * 100).toFixed(1) : '?'}% from the reference price.`);
    console.log('     The RARE pool holds the depth and pays makers zero — the fee is 0 and immutable in the PoolKey.');
  }
  console.log('\n     Next:  npm run mm quote --eth 0.5\n');
}

/* ── QUOTE ─────────────────────────────────────────────────────────────────────────────── */
async function quote(args) {
  const p = POOLS.find(x => x.key === (args.pool || 'ETH').toUpperCase());
  if (!p) return console.log('  unknown --pool');
  if (poolId(p).toLowerCase() !== p.id.toLowerCase())
    return console.log('  ⛔ pool params do not reproduce the id — refusing');
  if (p.fee / 10000 > 1)
    return console.log(`  ⛔ ${p.key} charges ${p.fee / 10000}% a swap. Refusing to size a position in it.`);
  if (p.fee === 0)
    return console.log(`  ⛔ ${p.key}'s LP fee is 0 and immutable. A maker there is paid nothing, forever. Refusing.`);

  const refs = await usdRefs();
  const s = await slot0(p.id);
  if (s.sqrtPriceX96 === 0n) return console.log(`  ⛔ ${p.key} is not initialized.`);

  const width = Number(args.width || 20);
  const maxSkew = Number(args.maxSkew || 10);

  /* ⛔ QUOTE AROUND THE REFERENCE PRICE, NEVER AROUND THIS POOL'S OWN TICK, AND REFUSE IF THEY
   *   HAVE DRIFTED APART. This pool was initialized 254× above the real market and the first two
   *   trades took the difference. A range centred on a stale local tick is a standing offer at a
   *   price nobody else agrees with, i.e. free money for the first arb. */
  const poolTokUsd = refs.ethUsd ? refs.ethUsd / humanPrice(s.tick, p) : NaN;
  const refTokUsd  = refs.tokenUsd;
  if (!refTokUsd || !refs.ethUsd) return console.log('  ⛔ no reference price (DexScreener/Coinbase unreachable) — refusing to size blind.');
  const skewPct = (poolTokUsd - refTokUsd) / refTokUsd * 100;

  console.log(`\n  QUOTE — ${p.key} pool, ±${width}%\n`);
  console.log(`  reference $3030 ${usd(refTokUsd)} (deepest pool)   this pool ${usd(poolTokUsd)}   skew ${skewPct >= 0 ? '+' : ''}${skewPct.toFixed(1)}%`);
  if (Math.abs(skewPct) > maxSkew) {
    console.log(`\n  ⛔ REFUSING: this pool is ${Math.abs(skewPct).toFixed(1)}% from the reference, over the ${maxSkew}% limit.`);
    console.log('     Posting here would quote a price the rest of the market does not hold, and the');
    console.log('     first arbitrageur takes the difference out of your position. Arb it in first,');
    console.log('     or raise --maxSkew deliberately knowing that is what you are accepting.\n');
    return;
  }

  /* Range around the REFERENCE, expressed in this pool's tick space. */
  const refRaw = p.tokenIs === 1 ? (refs.ethUsd / refTokUsd) : (refTokUsd / refs.ethUsd);
  const cTick  = priceToTick(refRaw / Math.pow(10, p.d0 - p.d1));
  /* A ±width% band on the $3030 price. $3030 cheaper = more $3030 per ETH = HIGHER tick when
   * $3030 is currency1, so the two edges swap sides depending on which side the token sits. */
  const loPx = refTokUsd * (1 - width / 100), hiPx = refTokUsd * (1 + width / 100);
  const edge = px => priceToTick((p.tokenIs === 1 ? (refs.ethUsd / px) : (px / refs.ethUsd)) / Math.pow(10, p.d0 - p.d1));
  let tA = edge(loPx), tB = edge(hiPx);
  let tickLower = align(Math.min(tA, tB), p.spacing, -1);
  let tickUpper = align(Math.max(tA, tB), p.spacing, +1);

  /* Standard concentrated-liquidity amounts. sp/sa/sb are sqrt(price) in RAW units.
   * ⛔ THE SPLIT IS TAKEN AT THE POOL'S OWN TICK, NOT AT THE REFERENCE. The RANGE is centred on
   *   the reference price (so we never quote a stale market) but the DEPOSIT RATIO is decided by
   *   where the pool actually sits inside that range — that is the number the AMM uses. Sizing
   *   at the reference tick printed amounts Uniswap would have rejected, silently, by 6%.
   *   ⚠ `cTick` is kept only to report the reference; it must never reach the amount math. */
  const sp = tickToSqrt(s.tick), sa = tickToSqrt(tickLower), sb = tickToSqrt(tickUpper);
  const spc = Math.min(Math.max(sp, sa), sb);
  if (spc <= sa || spc >= sb)
    return console.log('  ⛔ the pool tick sits outside the reference range — the position would be one-sided. Widen --width or arb the pool in first.');

  /* Budget: --eth is capital on the ETH side; --usd splits notionally at the reference price. */
  let budget0;   // currency0 units (ETH here)
  if (args.eth) budget0 = Number(args.eth);
  else if (args.usd) budget0 = Number(args.usd) / refs.ethUsd / 2;   // half the notional per side
  else budget0 = 0.25;

  const L0 = budget0 * (spc * sb) / (sb - spc);
  const L  = L0;
  const amt0 = L * (sb - spc) / (spc * sb);
  const amt1 = L * (spc - sa);

  const tokenAmt = p.tokenIs === 1 ? amt1 : amt0;
  const quoteAmt = p.tokenIs === 1 ? amt0 : amt1;
  const notional = quoteAmt * refs.ethUsd + tokenAmt * refTokUsd;

  console.log(`\n  THE POSITION`);
  console.log(`     range        ${usd(loPx)} … ${usd(hiPx)} per $3030   (ticks ${tickLower} … ${tickUpper}, spacing ${p.spacing})`);
  console.log(`     you post     ${fmt(quoteAmt, 6)} ETH  +  ${fmt(tokenAmt, 0)} $3030`);
  console.log(`     notional     ${usd(notional)}`);
  console.log(`     fee tier     ${p.fee / 10000}%  on every swap that crosses your range`);

  console.log(`\n  WHAT YOU HOLD AT EACH END  — this is the risk, stated before you post`);
  const allTok = L * (sb - sa);                       // at the top tick, 100% currency1
  const allQuo = L * (sb - sa) / (sa * sb);           // at the bottom tick, 100% currency0
  if (p.tokenIs === 1) {
    console.log(`     $3030 at ${usd(hiPx)} (up ${width}%)   → you hold ~${fmt(allQuo, 6)} ETH and no $3030 — you sold into strength`);
    console.log(`     $3030 at ${usd(loPx)} (down ${width}%) → you hold ~${fmt(allTok, 0)} $3030 and no ETH — you bought the whole way down`);
  } else {
    console.log(`     up ${width}%   → ~${fmt(allTok, 0)} ${p.quote}`);
    console.log(`     down ${width}% → ~${fmt(allQuo, 0)} $3030`);
  }
  console.log(`     ⚠ At 10 sells to 1 buy, the DOWN leg is the one to plan for. That is not a bug in`);
  console.log(`       the position — it is what a maker is paid the fee for.`);

  /* Fees: be honest that today's volume is in the OTHER pool. */
  const feeIfAll = refs.vol24 * (p.fee / 1e6);
  console.log(`\n  WHAT IT EARNS`);
  console.log(`     ${p.fee / 10000}% × 24h volume`);
  console.log(`       if this pool captured ALL of today's ${usd(refs.vol24)}:  ${usd(feeIfAll)}/day`);
  console.log(`       if it captured a tenth:                        ${usd(feeIfAll / 10)}/day`);
  console.log(`     ⛔ TODAY THAT VOLUME IS IN THE **RARE** POOL, NOT THIS ONE. Depth here does not move`);
  console.log(`        volume here by itself — a router only picks this pool when it quotes better.`);
  console.log(`        Treat the top line as a ceiling you have to earn, never as a yield.`);

  console.log(`\n  TO POST IT (a human, reading these numbers, once):`);
  console.log(`     Uniswap → Pool → New position → v4 → ETH / $3030 → fee ${p.fee / 10000}%`);
  console.log(`     token: ${TOKEN}`);
  console.log(`     range: ${usd(loPx)} … ${usd(hiPx)}     amounts above`);
  console.log(`     ⚠ Re-run \`npm run mm book\` immediately before posting. A tick is a fact with a`);
  console.log(`       shelf life, and this pool has already been 254% wrong once.\n`);
}

/* ── exports for npm run test:mm ────────────────────────────────────────────────────────────
 * The pure half is exported so the suite can drive the arithmetic and the guards with no
 * network at all. ⚠ The main block below is guarded on being the entry module — without that,
 * importing this file to test it would fire a live `book()` as a side effect. */
export { POOLS, LISTED, poolId, rawPrice, humanPrice, tokenInQuote, tickToSqrt, priceToTick, align, signExtendTick, amountsFor };

/* Pulled out of slot0() so the sign extension is testable without an RPC. The tick is a signed
 * 24-bit field; the USDC pool sits at -309,435 and reads as +16,467,781 without this. */
function signExtendTick(raw) { const t = Number(raw & 0xffffffn); return t >= 0x800000 ? t - 0x1000000 : t; }

/* The concentrated-liquidity split, given a currency0 budget and a range. Returns the deposit
 * and both boundary inventories, so a test can check that value reconciles across the range. */
function amountsFor(budget0, poolTick, tickLower, tickUpper) {
  const sp = tickToSqrt(poolTick), sa = tickToSqrt(tickLower), sb = tickToSqrt(tickUpper);
  const spc = Math.min(Math.max(sp, sa), sb);
  if (spc <= sa || spc >= sb) return null;
  const L = budget0 * (spc * sb) / (sb - spc);
  return {
    L,
    amount0: L * (sb - spc) / (spc * sb),
    amount1: L * (spc - sa),
    allCurrency0AtLower: L * (sb - sa) / (sa * sb),
    allCurrency1AtUpper: L * (sb - sa),
  };
}

/* ── BID — single-sided ETH, the only shape that works with ETH and no $3030 ─────────────
 * ⚑ A TWO-SIDED QUOTE NEEDS BOTH ASSETS. With only ETH the honest instrument is a range placed
 *   entirely on the far side of spot, holding ETH and nothing else until price reaches it — a
 *   standing BID. It is a limit order, publicly visible on-chain, and it is the one thing this
 *   book is short of: total quote-side depth is under $8,000.
 * ⚑ AND IT IS THE OPPOSITE OF WHAT WAS ASKED FOR ORIGINALLY, WHICH IS WHY IT IS WORTH SAYING
 *   OUT LOUD: a buy spends $100 once and it is gone. A bid puts the same $100 under the market
 *   permanently, earns 0.9% on anything that crosses it, and if nobody ever sells into it you
 *   still have your ETH. It does not push a price up. It catches a price coming down.
 * ⚠ TICK DIRECTION IS THE TRAP. currency0 is ETH and currency1 is $3030, so P = $3030-per-ETH
 *   and a CHEAPER $3030 is a HIGHER tick. A bid therefore sits ABOVE the current tick while
 *   sitting BELOW the current dollar price. Get it backwards and you have posted an ask. */
async function bid(args) {
  const p = POOLS.find(x => x.key === 'ETH');
  if (poolId(p).toLowerCase() !== p.id.toLowerCase()) return console.log('  ⛔ pool params do not reproduce the id — refusing');
  const refs = await usdRefs();
  const s = await slot0(p.id);
  if (!refs.tokenUsd || !refs.ethUsd) return console.log('  ⛔ no reference price — refusing to size blind.');

  const near = Number(args.near || 5);    // top of the bid, % below reference
  const far  = Number(args.far  || 30);   // bottom of the bid, % below reference
  if (!(far > near)) return console.log('  ⛔ --far must be deeper than --near');

  const ethBudget = args.eth ? Number(args.eth) : (Number(args.usd || 100) / refs.ethUsd);
  const refPx = refs.tokenUsd;
  const poolPx = refs.ethUsd / humanPrice(s.tick, p);

  const edge = px => priceToTick(refs.ethUsd / px);
  let tLo = align(Math.min(edge(refPx * (1 - near / 100)), edge(refPx * (1 - far / 100))), p.spacing, -1);
  let tHi = align(Math.max(edge(refPx * (1 - near / 100)), edge(refPx * (1 - far / 100))), p.spacing, +1);

  console.log(`\n  A STANDING BID — ETH only, no $3030 required\n`);
  console.log(`  reference $3030 ${usd(refPx)}   this pool ${usd(poolPx)}   your capital ${fmt(ethBudget, 6)} ETH (${usd(ethBudget * refs.ethUsd)})`);

  /* ⛔ THE WHOLE POSITION MUST SIT BELOW SPOT OR IT IS NOT A BID. If the pool's tick is already
   *   inside the range, part of it is an ASK and the first trade sells your ETH into a falling
   *   market at a price you did not choose. Refuse rather than silently post a hybrid. */
  if (s.tick >= tLo) {
    console.log(`\n  ⛔ REFUSING: the pool tick (${s.tick}) is already inside this range.`);
    console.log(`     The pool prices $3030 at ${usd(poolPx)} against a reference of ${usd(refPx)}, so a bid`);
    console.log(`     ${near}% down is not actually below this pool's market. Use a deeper --near.\n`);
    return;
  }

  const sa = tickToSqrt(tLo), sb = tickToSqrt(tHi);
  const L = ethBudget * (sa * sb) / (sb - sa);
  const tokensIfFilled = L * (sb - sa);            // all currency1 once price passes tHi
  const avgFill = ethBudget * refs.ethUsd / tokensIfFilled;

  console.log(`\n  THE BID`);
  console.log(`     buys between  ${usd(refPx * (1 - far / 100))} and ${usd(refPx * (1 - near / 100))} per $3030   (ticks ${tLo} … ${tHi})`);
  console.log(`     you post      ${fmt(ethBudget, 6)} ETH   and ZERO $3030`);
  console.log(`     if fully hit  you end up holding ~${fmt(tokensIfFilled, 0)} $3030 at an average of ${usd(avgFill)}`);
  console.log(`     if never hit  you still hold your ${fmt(ethBudget, 6)} ETH — a bid is not a purchase`);
  console.log(`     it earns      0.9% of anything that trades through the range, while it is in range`);

  console.log(`\n  WHAT IT DOES TO THE BOOK`);
  const depth = refs.liqQuoteUsd || 0;
  console.log(`     buy-side depth today            ${usd(depth)}`);
  console.log(`     this adds                       ${usd(ethBudget * refs.ethUsd)}  (+${depth ? (ethBudget * refs.ethUsd / depth * 100).toFixed(1) : '?'}%)`);
  console.log(`     ⚑ and it is concentrated: spread over ${near}–${far}% instead of the whole curve,`);
  console.log(`        so within that band it is far deeper than the same money added flat.`);

  console.log(`\n  ⚠ THE HONEST PART`);
  console.log(`     This does not raise the price and is not meant to. It is a public offer to BUY`);
  console.log(`     lower. If it fills you own $3030 bought on the way down, which is exactly the`);
  console.log(`     position a maker is paid to take — and at 10 sells to 1 buy it is the leg to`);
  console.log(`     plan for. Size it as money you are content to convert into the token.\n`);
  console.log(`  TO POST: Uniswap → Pool → New → v4 → ETH/$3030 → 0.9% → range above, ETH only.`);
  console.log(`     token ${TOKEN}`);
  console.log(`     ⚠ Re-run \`npm run mm book\` first — the tick moves.\n`);
}

/* ── main ──────────────────────────────────────────────────────────────────────────────── */
const IS_MAIN = process.argv[1] && process.argv[1].endsWith('mm.mjs');
const argv = IS_MAIN ? process.argv.slice(2) : [];
const cmd = argv[0] || 'book';
const args = {};
for (let i = 1; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1]; args[k] = (!v || v.startsWith('--')) ? true : (i++, v); }
}
if (IS_MAIN) {
  try {
    if (cmd === 'book') await book();
    else if (cmd === 'quote') await quote(args);
    else if (cmd === 'bid') await bid(args);
    else {
      console.log('  usage:');
      console.log('    mm book                                     price, fee and hazards on every pool');
      console.log('    mm quote [--eth N|--usd N] [--width 20]     two-sided range (needs ETH *and* $3030)');
      console.log('    mm bid   [--usd 100] [--near 5] [--far 30]  ETH-only standing bid below spot');
      process.exit(1);
    }
  } catch (e) {
    console.error('  ⛔', e.shortMessage || e.message);
    process.exit(1);
  }
}

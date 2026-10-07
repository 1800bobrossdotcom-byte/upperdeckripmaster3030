#!/usr/bin/env node
/* npm run test:mm — the market maker's console.
 *
 * ⚑ EVERY ASSERTION HERE IS OFFLINE AND DETERMINISTIC, WHICH IS THE POINT. The console's whole
 *   safety argument is that a v4 pool id IS `keccak256(abi.encode(PoolKey))`, so the fee can be
 *   PROVEN rather than fetched. A property you can prove without a network is a property a test
 *   can prove without a network — no RPC, no flake, no "the endpoint was down so it passed".
 *
 * ⚠ The suite that matters is §A and §D. §A is the guard that stops the console sizing a
 *   position in a pool with an 89.898% fee; §D is the arithmetic bug I actually shipped and
 *   caught — sizing the deposit at the reference tick instead of the pool's.
 */
import {
  POOLS, LISTED, poolId, humanPrice, tokenInQuote, tickToSqrt, priceToTick, align,
  signExtendTick, amountsFor,
} from './mm.mjs';
import { keccak256, encodeAbiParameters } from 'viem';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m}  (${a} vs ${b}, tol ${tol})`);
const sect = s => console.log(`\n── ${s} ──`);

/* ── §A THE FEE IS PROVEN, NOT TRUSTED ─────────────────────────────────────────────────── */
sect('A · pool params are proven by the id, offline');

for (const p of POOLS) {
  ok(poolId(p).toLowerCase() === p.id.toLowerCase(),
    `${p.key} — (currency0, currency1, fee, tickSpacing, hooks) reproduces the published pool id`);
}

/* ⛔ THE SABOTAGE THAT MATTERS: change ONE digit of the fee and the id must stop reproducing.
 *   Without this the whole "proven" claim is decoration — a hash check that never fails on a
 *   wrong input is a hash check that proves nothing. */
{
  const eth = POOLS.find(p => p.key === 'ETH');
  const lied = poolId({ ...eth, fee: 3000 });
  ok(lied.toLowerCase() !== eth.id.toLowerCase(),
    'a LIE about the fee (9000 → 3000) fails to reproduce the id — the proof discriminates');
  const lied2 = poolId({ ...eth, hooks: '0x8Ff5660951C974f4806F0bEF9A32bcf35d3aE0cC' });
  ok(lied2.toLowerCase() !== eth.id.toLowerCase(),
    'a LIE about the hook fails to reproduce the id too');
}

/* The three published fees, asserted by value, because two of them decide whether a maker
 * should ever quote there and one of them is a hazard sitting in chain-config today. */
{
  const f = k => POOLS.find(p => p.key === k).fee;
  ok(f('RARE') === 0,       'RARE pool fee is 0 — an external LP there earns nothing, forever');
  ok(f('ETH')  === 9000,    'ETH pool fee is 0.9% — the only venue that pays a maker');
  ok(f('USDC') === 898980,  'USDC pool fee is 89.898% — a hazard, and it is in chain-config.market.pools[]');
  ok(f('USDC') / 10000 > 1, 'the USDC fee is over the 1% refusal bar the console enforces');
  ok(POOLS.find(p => p.key === 'ETH').hooks === '0x0000000000000000000000000000000000000000',
    'the ETH pool has no hook — nothing skims the fee via return-delta');
}

/* ── §B THE SIGNED TICK ────────────────────────────────────────────────────────────────── */
sect('B · slot0 tick sign extension');

/* ⛔ THE USDC POOL SITS AT -309,435. Read as an unsigned 24-bit field that is +16,467,781, and
 *   1.0001^16467781 overflows to Infinity — so the console would report a price of Infinity
 *   with total confidence rather than erroring. Sign extension is load-bearing, not tidiness. */
/* ⚠ THIS CONSTANT WAS WRONG FIRST AND THE TEST IS WHAT CAUGHT IT. I hand-wrote `0xfb4bc5`,
 *   which is -308,283, not -309,435 — close enough to look right and off by 1,152 ticks (~12%
 *   of price). Derive it rather than type it: `-309435 & 0xffffff` is `0xfb4745`. A magic hex
 *   number in a test is a place for exactly this mistake to hide. */
ok(signExtendTick(BigInt(-309435 & 0xffffff)) === -309435, 'the USDC pool tick sign-extends to -309,435');
ok(signExtendTick(0xfb4745n) === -309435,  'and the literal 0xfb4745 is that same value');
ok(signExtendTick(98984n) === 98984,      'a positive tick is unchanged');
ok(signExtendTick(19928n) === 19928,      'the RARE pool tick is unchanged');
{
  const naive = Number(0xfb4745n);
  ok(naive === 16467781, 'and the naive unsigned read really is +16,467,781');
  ok(!Number.isFinite(Math.pow(1.0001, naive)) || Math.pow(1.0001, naive) > 1e100,
    'which would price the pool at Infinity rather than throwing — the failure is SILENT');
}

/* ── §C PRICE MATHS AGAINST A KNOWN-GOOD EXTERNAL READING ──────────────────────────────── */
sect('C · tick → price, checked against DexScreener\'s independent number');

/* The RARE pool at tick 19938 gave 7.3427 RARE per $3030 from our own storage read, against
 * DexScreener's 7.3429 for the same block. Agreement between two independent paths is what
 * makes the other two pools' reads trustworthy — so it is pinned. */
{
  const rare = POOLS.find(p => p.key === 'RARE');
  near(humanPrice(19938, rare), 7.3427, 0.001, 'RARE pool tick 19938 → 7.3427 RARE per $3030');
  near(tokenInQuote(19938, rare), 7.3427, 0.001, '$3030 is currency0 there, so the quote is direct');
}
{
  const eth = POOLS.find(p => p.key === 'ETH');
  near(humanPrice(98984, eth), 19888.66, 1, 'ETH pool tick 98984 → 19,888.66 $3030 per ETH');
  /* ⚑ AND THE INITIALIZATION TICK, kept because it is the reason the console refuses on skew:
   *   this pool opened 254× above the real market and the first two trades took the difference. */
  near(humanPrice(44395, eth), 84.714, 0.01, 'ETH pool INIT tick 44395 → 84.714 $3030 per ETH');
  ok(humanPrice(98984, eth) / humanPrice(44395, eth) > 200,
    'i.e. the pool has moved >200× since it was initialized — a recorded price has a shelf life');
}
{ /* $3030 is currency1 in the ETH pool, so the quote has to invert. Getting this backwards
   * prints a token price of ~19,889 ETH and nothing in the output looks obviously wrong. */
  const eth = POOLS.find(p => p.key === 'ETH');
  near(tokenInQuote(98984, eth), 1 / 19888.66, 1e-9, 'ETH pool inverts — 1 $3030 in ETH, not the reverse');
}
{ /* USDC has 6 decimals against $3030's 18; without the shift the price is out by 1e12. */
  const u = POOLS.find(p => p.key === 'USDC');
  near(humanPrice(-309435, u), 0.036482, 1e-5, 'USDC pool applies the 18→6 decimal shift');
  ok(humanPrice(-309435, u) < 0.05, 'and prices $3030 ~59% under the real market');
}

sect('C2 · tick/price round-trip and spacing alignment');
for (const t of [-309435, 0, 19938, 44395, 98984]) {
  near(priceToTick(Math.pow(1.0001, t)), t, 0.5, `priceToTick(1.0001^${t}) round-trips`);
}
ok(align(98984, 90, -1) % 90 === 0 && align(98984, 90, -1) <= 98984, 'lower edge aligns DOWN to spacing');
ok(align(98984, 90, +1) % 90 === 0 && align(98984, 90, +1) >= 98984, 'upper edge aligns UP to spacing');

/* ── §D THE ARITHMETIC BUG THAT SHIPPED, AND THE CONSERVATION CHECK ────────────────────── */
sect('D · the deposit split, and value conservation across the range');

const LOWER = 97740, UPPER = 101880, POOL_TICK = 98984, REF_TICK = 99574;   // ref ≈ $0.09088
const ETH_USD = 1918.08;
const a = amountsFor(0.5, POOL_TICK, LOWER, UPPER);
ok(a !== null, 'a pool tick inside the range yields a two-sided position');
near(a.amount0, 0.5, 1e-9, 'the currency0 budget is spent exactly (0.5 ETH)');
ok(a.amount1 > 4000 && a.amount1 < 5000, `the $3030 leg sizes to ~4,449 (got ${Math.round(a.amount1)})`);

/* ⛔ THE BUG: sizing at the REFERENCE tick instead of the POOL's. Both are legal inputs and
 *   both produce a plausible position — the wrong one just asks for 91% more $3030 than the
 *   AMM will take. It printed amounts Uniswap would have rejected, silently, and nothing in
 *   the output looked wrong. The assertion is that the two DIFFER, so a regression is visible. */
const bad = amountsFor(0.5, REF_TICK, LOWER, UPPER);
ok(Math.abs(bad.amount1 - a.amount1) / a.amount1 > 0.25,
  `sizing at the reference tick differs from the pool tick by >25% (${Math.round(bad.amount1)} vs ${Math.round(a.amount1)}) — the two are NOT interchangeable`);

/* Conservation: what you put in must equal what you hold at each boundary, valued at that
 * boundary's price. This is the check that would catch an inverted sqrt or a swapped boundary. */
{
  const pxAt = tick => ETH_USD / Math.pow(1.0001, tick);      // USD per $3030 in this pool
  const inUsd = a.amount0 * ETH_USD + a.amount1 * pxAt(POOL_TICK);
  const atUpper = a.allCurrency1AtUpper * pxAt(UPPER);        // all $3030 — the DOWN leg in USD terms
  const atLower = a.allCurrency0AtLower * ETH_USD;            // all ETH   — the UP leg
  ok(inUsd > 1200 && inUsd < 1500, `deposit notional reconciles to ~$1,363 (got $${inUsd.toFixed(0)})`);
  ok(atLower > inUsd, 'the all-ETH boundary is worth MORE than the deposit — you sold into strength');
  ok(atUpper < inUsd, 'the all-$3030 boundary is worth LESS — you bought the whole way down');
  /* ⚑ THAT ASYMMETRY IS THE WHOLE RISK DISCLOSURE, so it is asserted rather than described.
   *   A position that showed a gain at both ends would mean the maths is wrong, not that the
   *   trade is free. */
}

sect('D2 · a one-sided range is refused rather than sized');
ok(amountsFor(0.5, LOWER - 1000, LOWER, UPPER) === null, 'pool below the range → refused (would be 100% one asset)');
ok(amountsFor(0.5, UPPER + 1000, LOWER, UPPER) === null, 'pool above the range → refused');
ok(amountsFor(0.5, LOWER, LOWER, UPPER) === null,        'pool exactly ON the lower edge → refused');

/* ── §E WHAT THE SITE PUBLISHES, AND THE FEE BAR IT MUST CLEAR ─────────────────────────── */
sect('E · chain-config publishes only pools that are actually markets');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/chain-config.js', import.meta.url), 'utf8');
  const w = {}; new Function('window', src)(w);
  const cfg = w.RIPMASTER_CHAIN.market.pools;
  const ids = cfg.map(p => p.id.toLowerCase());

  /* ⛔ THE BAR. Every pool the site names as one of ours must charge a fee a human would accept.
   *   `0x597a6772…` charges 89.898% and was published for two days. This is the assertion that
   *   makes re-adding it fail the board instead of shipping quietly. */
  for (const p of cfg) {
    const known = POOLS.find(k => k.id.toLowerCase() === p.id.toLowerCase());
    ok(!!known, `${p.quote} — the console knows this published pool` );
    if (!known) continue;
    ok(known.fee / 10000 <= 1, `${p.quote} — fee ${known.fee / 10000}% is under the 1% bar`);
    /* The config now DECLARES its fee; the declaration is proven against the id by §A, so a
     * wrong number here cannot pass both checks. One fact, stated once, proven twice. */
    ok(p.fee === known.fee, `${p.quote} — chain-config's declared fee matches the hash-proven one`);
  }
  ok(new Set(ids).size === ids.length, 'no two configured pools share an id');

  /* ⛔ AND THE DELISTING IS ASSERTED IN BOTH DIRECTIONS. "No hazardous pool is listed" is
   *   trivially true of a config with no pools at all, so the live one must still be there. */
  const usdc = POOLS.find(p => p.key === 'USDC');
  ok(!ids.includes(usdc.id.toLowerCase()), 'the 89.898% USDC pool is NOT published');
  ok(usdc.delisted === true, '…and the console still carries it, flagged, so it stays recognisable');
  ok(ids.includes(POOLS.find(p => p.key === 'RARE').id.toLowerCase()), 'the RARE pool IS still published');
  ok(ids.includes(POOLS.find(p => p.key === 'ETH').id.toLowerCase()), 'the ETH pool IS still published');
  ok(LISTED.size === cfg.length && LISTED.size === 2, `the console agrees exactly 2 pools are live (got ${LISTED.size})`);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);

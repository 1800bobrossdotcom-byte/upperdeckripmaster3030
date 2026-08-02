#!/usr/bin/env node
// $3030 economic model — reproducible. Prints the price schedule, sensitivity to
// the demand multiple, buy slippage, the TIERED pack allotment + escalating pack
// price, per-tier burn pressure, and reward-pool funding. All numbers in
// docs/TOKEN-MATH.md come from here; re-run to re-derive.
//
//   node scripts/token-model.mjs
//
// Grounding (from the SuperRare liquid-editions-starter-kit + Doppler Multicurve):
// a Liquid Edition is a Uniswap-v4 pool with liquidity placed as a log-normal
// multicurve. Idealization: a constant number of tokens sold per multiplicative
// price bucket => log(price) linear in supply => price EXPONENTIAL in supply, which
// is EXACTLY LINEAR IN RESERVE:  P = P0 + a*R,  a = ln(M)/cap,  P(f) = P0 * M^f.
// The true per-preset curve must be confirmed with `rare liquid-edition ... --preview`.
//
// THE TOKEN stays a cheap micro-token (cap 3.03M, P0≈1 RARE, FDV≈$606k — unchanged;
// see "is 3M too low? no" in TOKEN-MATH §3). THE PACK is the one premium action: a
// bundle of ~350 $3030 ≈ $7 at launch, so every rip is a real buy-and-burn of
// hundreds of tokens (steady upward pressure), NOT a token reprice. Pack price
// escalates within a tier (allotment dwindles) and across tiers (field shrinks).
//
// MINT-ONCE (per SuperRare audit 2026-07): the edition mints its whole supply into
// the pool ONCE and burned tokens DO NOT re-mint — every burn is PERMANENT. So the
// LIFETIME burn is bounded by the cap. We size the whole four-tier pack arc to a
// fixed budget below the cap, leaving a deliberate live float. This is TOKEN DEFLATION,
// not card death (model v2.2): packs burn the token; the 100-card deck SURVIVES. Numbers
// below are our provisional target; the exact curve/supply/pack sizing is co-designed
// with SuperRare (see the audit reply + docs/ECONOMIC-FLOW.md).

// ── token assumptions (swap in live values before locking) ──
const CAP        = 33_000_000;   // maxTotalSupply ($3030), minted once, burns permanent
const P0         = 1;           // opening price, RARE per token
const M          = 10;          // demand multiple = end/start price ("medium-demand", verify via --preview)
const RARE_USD   = 0.02;        // rough current-era RARE/USD — the whole $ column rides on this
const SELL_FRAC  = 1.0;         // fraction of cap actually sold on the curve (poolLaunchSupply/cap); verify via --preview
// ── mint-once burn ceiling (matches scripts/burn-milestones.mjs) ──
const LIFETIME_BURN_BUDGET = 22_000_000;   // ≈ ⅔ of cap — total permanent burn to retire the whole field
const FLOOR_SUPPLY         = CAP - LIFETIME_BURN_BUDGET;   // ≈ 1,010,000 live tokens survive the retirement

// ── pack assumptions (the $7 premium ritual — site-guided buy, then SPLIT) ──
// The Phase-2 vault design (docs/CARD-ECONOMY-SPEC.md) would set REWARD_CUT=1
// and LAST_STAND=50; kept here as constants so §6 can print the reference numbers.
/* ⚑ A PACK NO LONGER BURNS IN FULL. Artist directive: half of every pack burns and half funds
 * the studio, atomically, via contracts/PackSink.sol (docs/TREASURY.md). This model predates
 * that and was still burning 100% of every pack, so every burn figure it printed — and every
 * figure quoted FROM it — was double the truth. The treasury half is not destroyed, it is
 * revenue, so it is reported as its own line rather than quietly dropped. */
const BURN_SHARE     = 0.50;    // of each pack; the remainder is studio revenue
const CARDS_PER_PACK = 7;
const REWARD_CUT     = 0;       // LAUNCH: no house bounty pool (Phase-2 vault: 1)
const LAST_STAND     = 50;      // Phase-2 reference only (no on-chain bounty at launch)
/* ── PACK TIERS (⛔ SEASONS ARE GONE — artist directive 2026-08-01) ────────────────────────────
 * ripmaster3030studios is a game studio, not a seasonal drop calendar. The pack schedule is now
 * TIERED: four tiers of dwindling allotment and rising floor, each opening when the one before
 * it SELLS OUT — not on a date.
 *
 * ⚑ THIS IS A REAL CHANGE, NOT A RENAME. A season is a promise about TIME: name it "Summer" and
 *   you owe the public a drop in summer, every year, forever, and a studio that misses one has
 *   visibly failed at something it never needed to promise. A tier is a promise about SUPPLY:
 *   tier II opens when tier I is gone, and if that takes three weeks or three years the
 *   mechanism is equally honest. It also matches the standing directive to work like there is no
 *   deadline — nothing creative should be pinned to a calendar the studio didn't have to publish.
 *
 * ⚠ The NUMBERS ARE DEEPLY UNCHANGED — same four allotments, same base/ceil, so every burn,
 *   float and treasury figure below is identical. Only the framing and the trigger changed.
 *   base/ceil are $3030; ceil = 1.5·base (the within-tier line). The floor is recalibrated at
 *   each tier open to hold the USD target against the then-live token price. */
const TIERS = [
  { s: 'TIER I',   budget: 11_200, base: 350, ceil: 525  },   // 1,600 packs
  { s: 'TIER II',  budget:  7_700, base: 450, ceil: 675  },   // 1,100 packs
  { s: 'TIER III', budget:  4_200, base: 600, ceil: 900  },   //   600 packs
  { s: 'TIER IV',  budget:  1_820, base: 800, ceil: 1200 },   //   260 packs
];

const usd = r => r * RARE_USD;
const price = f => P0 * Math.pow(M, f);                 // RARE per token at sold-fraction f
const a = Math.log(M) / (CAP * SELL_FRAC);             // price rise per RARE of reserve (P = P0 + a*R)
const reserveAt = f => (P0 / a) * (Math.pow(M, f) - 1); // RARE in the pool after selling fraction f
const RTOTAL = reserveAt(1);
const fdvAt = f => price(f) * CAP * RARE_USD;           // USD, fully-diluted at spot
const packUsd = tok => tok * P0 * RARE_USD;            // a `tok`-token pack in $ at LAUNCH spot ($0.02)
const fmt = (n, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const line = () => console.log('─'.repeat(80));

console.log('\n$3030 TOKEN MODEL');
console.log(`cap ${CAP.toLocaleString()} · P0 ${P0} RARE · M ${M} · RARE≈$${RARE_USD} · sell-fraction ${SELL_FRAC}`);
console.log(`pack ≈ ${TIERS[0].base} $3030 = $${fmt(packUsd(TIERS[0].base),2)} at launch (the token stays cheap; the PACK is the premium)`);

// 1. price schedule — the SAME launch-size pack (350 tok) costs more $ as the token appreciates
line(); console.log('1. PRICE SCHEDULE  (P = P0·M^f) — pack column = 350 $3030 priced at that spot');
console.log(['f', 'spot(RARE)', 'spot($)', 'pack350($)', 'FDV($)', 'reserve(RARE)'].map((s,i)=>s.padStart(i?13:5)).join(''));
for (const f of [0, 0.10, 0.25, 0.50, 0.75, 1.0]) {
  console.log([
    f.toFixed(2).padStart(5),
    fmt(price(f), 3).padStart(13),
    ('$'+fmt(usd(price(f)), 4)).padStart(13),
    ('$'+fmt(350*price(f)*RARE_USD, 2)).padStart(13),
    ('$'+fmt(fdvAt(f), 0)).padStart(13),
    fmt(reserveAt(f), 0).padStart(13),
  ].join(''));
}
console.log(`RARE to walk the curve to full: ${fmt(RTOTAL,0)} RARE ≈ $${fmt(usd(RTOTAL),0)}  ·  avg fill price ${fmt(RTOTAL/(CAP*SELL_FRAC),2)} RARE/token`);
console.log('NOTE: FDV/cap/curve are the TOKEN — unchanged by the pack size. A bigger pack does not');
console.log('reprice the token; it just makes each rip a larger buy-and-burn (see §4 burn pressure).');

// 2. sensitivity to M
line(); console.log('2. SENSITIVITY TO DEMAND MULTIPLE M  (cap + P0 fixed) — pack = 350 tok @ spot');
console.log(['M', 'pack@0', 'pack@50%', 'pack@100%', 'FDV@100%($)', 'RARE to fill'].map((s,i)=>s.padStart(i?13:5)).join(''));
for (const m of [3, 10, 30]) {
  const p = f => P0 * Math.pow(m, f);
  const rfill = CAP * SELL_FRAC * (m - 1) / Math.log(m);
  console.log([
    String(m).padStart(5),
    ('$'+fmt(350*p(0)*RARE_USD,2)).padStart(13),
    ('$'+fmt(350*p(0.5)*RARE_USD,2)).padStart(13),
    ('$'+fmt(350*p(1)*RARE_USD,2)).padStart(13),
    ('$'+fmt(p(1)*CAP*RARE_USD,0)).padStart(13),
    fmt(rfill,0).padStart(13),
  ].join(''));
}

// 3. buy slippage (worst case = at launch, P0). impact = a*ΔR / P.
line(); console.log('3. BUY PRICE-IMPACT AT LAUNCH  (ΔP = a·ΔR, impact = ΔP/P0)');
console.log(['buy($)', 'buy(RARE)', 'impact@launch'].map((s,i)=>s.padStart(i?15:8)).join(''));
for (const d of [20, 200, 2000, 20000]) {
  const dR = d / RARE_USD, impact = (a * dR) / P0;
  console.log([('$'+fmt(d,0)).padStart(8), fmt(dR,0).padStart(15), (fmt(impact*100,2)+'%').padStart(15)].join(''));
}
const capFor2pct = Math.log(M) / (0.02 * P0 / (2000 / RARE_USD));   // cap s.t. $2000 buy < 2% at launch
console.log(`cap needed to hold a $2,000 launch buy under 2% impact: ~${fmt(capFor2pct/1e6,1)}M tokens (at M=${M})`);

// 4. PACK ALLOTMENT BY TIER — dwindling supply, escalating price
line(); console.log('4. PACK ALLOTMENT BY TIER  (packs = cardBudget / 7; price rises base→ceil as it is spent)');
console.log(['tier','cardBudget','packs','base(tok)','ceil(tok)','base≈$*','ceil≈$*','tier$ (tok·spot)*'].map((s,i)=>s.padStart(i?11:11)).join(''));
for (const S of TIERS) {
  const packs = Math.floor(S.budget / CARDS_PER_PACK);
  const avg = (S.base + S.ceil) / 2;                 // linear line → mean price = midpoint
  const tierTok = packs * avg;                       // tokens of buy-and-burn demand this tier
  console.log([
    S.s.padStart(11),
    S.budget.toLocaleString().padStart(11),
    packs.toLocaleString().padStart(11),
    String(S.base).padStart(11),
    String(S.ceil).padStart(11),
    ('$'+fmt(packUsd(S.base),2)).padStart(11),
    ('$'+fmt(packUsd(S.ceil),2)).padStart(11),
    (fmt(tierTok/1e6,2)+'M tok').padStart(13),
  ].join(''));
}
console.log('* $ columns price tokens at the LAUNCH spot ($0.02) — a conservative floor. As the curve');
console.log('  fills, the token appreciates, so real USD pack prices ride ABOVE these on top of the base');
console.log('  rise. Two escalators stack: the within-tier base→ceil line AND token appreciation, and');
console.log('  each tier opens with a smaller allotment + higher floor. Allotment gone => that tier closes');
console.log('  and the next opens (secondary in between). Curator-set defaults; tune at each tier open.');

// 5. LIFETIME BURN — PERMANENT, bounded by the cap (mint-once)
line(); console.log(`5. LIFETIME BURN  (4 tiers; burns PERMANENT; ${fmt(BURN_SHARE*100,0)}% of each pack burns, the rest funds the studio)`);
const tierBurn = S => Math.floor(S.budget / CARDS_PER_PACK) * ((S.base + S.ceil) / 2) * BURN_SHARE;
let selloutTotal = 0, treasuryTotal = 0;
console.log(['tier','packs','avg pack','tier 🔥','cum 🔥','% of mint','→ studio'].map((s,i)=>s.padStart(i?12:11)).join(''));
for (const S of TIERS) {
  const packs = Math.floor(S.budget / CARDS_PER_PACK), avg = (S.base + S.ceil) / 2;
  const gross = packs * avg, burn = gross * BURN_SHARE, treas = gross - burn;   // remainder, so it is exhaustive
  selloutTotal += burn; treasuryTotal += treas;
  console.log([
    S.s.padStart(11), packs.toLocaleString().padStart(12), fmt(avg,0).padStart(12),
    fmt(burn,0).padStart(12), fmt(selloutTotal,0).padStart(12), (fmt(selloutTotal/CAP*100,1)+'%').padStart(12),
    fmt(treas,0).padStart(12),
  ].join(''));
}
console.log(`\nFull four-tier SELLOUT burns ${fmt(selloutTotal,0)} — the full token-contraction arc (model v2.2).`);
console.log(`It lands at ${fmt(selloutTotal/CAP*100,1)}% of the ${fmt(CAP,0)} mint (budget ${fmt(LIFETIME_BURN_BUDGET,0)}, target ⅔).`);
/* ⚠ The studio's share is TOKENS, not dollars, and it is a large slug against a thin float —
 * selling it all is itself sell pressure on the curve. Report it, do not price it. */
console.log(`Studio treasury over the same four tiers: ${fmt(treasuryTotal,0)} $3030 (${fmt(treasuryTotal/CAP*100,1)}% of the mint),`);
console.log(`  ≈ $${fmt(usd(treasuryTotal*P0),0)} at the OPENING price — a ceiling, not a forecast: it is not sold at P0,`);
console.log(`  and it is ${fmt(treasuryTotal/realFloatPreview()*100,1)}% of the surviving float, so selling it moves the curve it is priced on.`);
function realFloatPreview() { return CAP - selloutTotal; }
/* Report the float the PACK SCHEDULE actually produces, not the one the budget assumes.
 * These were the same number by construction at the old 3.03M cap, so the distinction never
 * showed. At 33M they diverge hard — LIFETIME_BURN_BUDGET is an aspiration (22M) while the
 * schedule burns 2.03M — and the old line went on confidently printing a 3.0× contraction that
 * nothing in the model supports. A tool that flatters the story is worse than no tool. */
const packsAll = TIERS.reduce((n, S) => n + Math.floor(S.budget / CARDS_PER_PACK), 0);
const realFloat = CAP - selloutTotal;
console.log(`Burns are PERMANENT: supply only falls. After the field's four-tier life sells through, ~${fmt(realFloat,0)} $3030`);
console.log(`survive as the settled live float — a ${fmt(CAP/realFloat,2)}× contraction from the mint.`);
if (CAP / realFloat < 1.5) {
  console.log(`⚠ That is NOT a scarcity engine. Pack burns are denominated in TOKENS (${fmt(TIERS[0].base,0)}→${fmt(TIERS[TIERS.length-1].ceil,0)}),`);
  console.log(`  so raising the cap does not scale them. To reach 3× you would need ~${fmt((CAP-CAP/3)/packsAll,0)} tokens/pack`);
  console.log(`  against today's ~${fmt(selloutTotal/packsAll,0)} — about ${fmt(((CAP-CAP/3)/packsAll)/(selloutTotal/packsAll),1)}× more, which forces P0 down by the same factor.`);
  console.log(`  Current direction: DEMOTE deflation. The burn still raises reserve-backing per surviving token.`);
}
console.log(`INVARIANT (mint-once): cumulative lifetime burn ≤ cap. Sellout ${selloutTotal < CAP ? '< cap ✓' : '> CAP ✗'}`);
console.log('CARDS DO NOT RETIRE OR ASH — this is token deflation only. A partial life (fewer rips) simply');
console.log('settles the token at a higher float. Scarcity is dwindling allotments + rarity votes, not card death.');

// 6. reward pool — LAUNCH: none (pure liquid edition). Phase-2 reference below.
line(); console.log(`6. HOUSE REWARD POOL — LAUNCH: NONE. A pack splits ${fmt(BURN_SHARE*100,0)}/${fmt((1-BURN_SHARE)*100,0)} burn/studio and`);
console.log('nothing else (mint-once: the burned half is gone for good; the studio half is revenue, not a');
console.log('pool players can win back). The hero-lens mints (11 SuperRare auctions + 11 gacha claims + 11 earned titles) are 721 LENS');
console.log('MINTS on the renderer+721 lens contract, not token payouts. A Phase-2 vault');
console.log(`(REWARD_CUT=${REWARD_CUT?REWARD_CUT:1} ref) would divert a per-pack cut to a bounty pool`);
console.log('INSTEAD of burning it — which would REDUCE lifetime burn below the budget above, never raise');
console.log('it. Any such pool is seeded only from real rips, so it is solvent by construction (no pre-mint).');
line();
console.log('Verify before mainnet: mint/burn semantics, effective M, sell-fraction (--preview/getMarketState),');
console.log('and recalibrate packBase to the $7-and-up USD target against the live token price at each tier open.\n');

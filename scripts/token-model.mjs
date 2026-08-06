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
// THE TOKEN stays a cheap micro-token (cap 3.03M; P0 $0.08 was measured at the OLD 3.3M cap).
// THE PACK is the one premium action and is priced in DOLLARS — $10/$12/$15/$20 across the four
// tiers — so every rip is a real buy-and-burn of a hundred-odd tokens, NOT a token reprice.
// ⛔ The token count per pack is DERIVED from the live price at each tier open and then LOCKED
// for that tier. It is not a constant, which is exactly why no burn percentage is promised.
//
// MINT-ONCE (per SuperRare audit 2026-07): the edition mints its whole supply into
// the pool ONCE and burned tokens DO NOT re-mint — every burn is PERMANENT. So the
// LIFETIME burn is bounded by the cap. We size the whole four-tier pack arc to a
// fixed budget below the cap, leaving a deliberate live float. This is TOKEN DEFLATION,
// not card death (model v2.2): packs burn the token; the 100-card deck SURVIVES. Numbers
// below are our provisional target; the exact curve/supply/pack sizing is co-designed
// with SuperRare (see the audit reply + docs/ECONOMIC-FLOW.md).

// ── token assumptions (swap in live values before locking) ──
/* ⛔ CAP SETTLED AT 3,300,000 — artist's call, 2026-08-02, and it reverses the 33,000,000
 *    direction. The decision was made on ONE fact this model produces: the pack burn is
 *    denominated in TOKENS PER PACK (350 → 1,200), so the four-tier total is a FIXED 1,014,375
 *    whatever the cap is. The cap alone decides what fraction that is:
 *
 *        33,000,000  →   3.1% of mint,  1.03× contraction — deflation is not a story
 *         3,300,000  →  30.7% of mint,  1.44× contraction — deflation is real   ← CHOSEN
 *         3,030,000  →  33.5% of mint,  1.50× contraction — the original cap
 *
 * ⚠ AND THE COST IS THE MIRROR IMAGE, which must not get lost: the studio's accumulated slug
 *   is the SAME 1,014,375 tokens, so it is also 30.7% of the mint instead of 3.1%. Raising the
 *   cap to 33M had defused the treasury's price impact (spot −6.8% vs −53.7%); coming back to
 *   3.3M re-arms it. §5 prints the treasury against the real float for exactly this reason, and
 *   docs/TREASURY.md leads with it. Do not quote the burn without quoting the slug. */
/* ⛔ P0 IS MEASURED NOW, NOT ASSUMED — and the assumption it replaces was out by 4×.
 * SuperRare ran the live mainnet Liquid Editions CLI previews against the full 3,300,000 supply
 * and recommended: **low-demand preset · ZERO initial RARE liquidity · NO creator allocation.**
 * That opens at **≈ $0.08 per $3030** and places 30% of supply in the gentlest $0.08–$0.16 band.
 * Everything below is priced off that, not off the old `P0 = 1 RARE ≈ $0.02` guess.
 *
 * ✅ AND IT SETTLES THE RESERVE-SEED CONTRADICTION recorded in CLAUDE.md. `CURVE-TARGET.md` and
 * `TOKEN-MATH.md` both described a ~10,000 RARE seed at deploy while this script printed reserve
 * = 0. **Zero was right.** There is no bid below spot on day one; the first seller walks the
 * curve down alone. That is a real property of the launch and is now stated rather than argued. */
const CAP        = 3_030_000;    // maxTotalSupply ($3030), minted once, burns permanent
/* ⛔ THIS NUMBER WAS MEASURED AT A SUPPLY WE NO LONGER SHIP. SuperRare's mainnet preview gave
 *   $0.08 against 3,300,000; the cap is 3,030,000 as of launch day. Whether the CLI's opening
 *   price moves with the cap is NOT something to reason out from here — the preset defines the
 *   curve and the supply is spread across it, and the only honest way to know is to read it off
 *   `--preview` at the real cap. Until that is done every dollar figure below, INCLUDING the
 *   tier-I pack of 125 tokens, is provisional.
 * ⚠ The label on this constant said "MEASURED" while the thing it was measured against had
 *   changed — which is this project's most-repeated failure shape, on the number the pack price
 *   is derived from. Left labelled honestly rather than silently carried forward. */
const P0_USD     = 0.08;        // ⚠ measured at the SUPERSEDED 3.3M cap — re-read at 3.03M
const SEED_RARE  = 0;           // zero initial RARE liquidity (SuperRare's recommendation)
const CREATOR_ALLOC = 0;        // no creator allocation
const CURVE      = 'low-demand';
const RARE_USD   = 0.02;        // rough current-era RARE/USD — used only for RARE-denominated columns
const P0         = P0_USD / RARE_USD;   // opening price in RARE/token, derived from the measured $
/* ⚠ M IS STILL AN ASSUMPTION AND IS LABELLED AS ONE. The preview gave us the OPENING price and
 * the shape of the first band; it did not give us end/start over the whole curve. Do not quote
 * any M-derived number as measured. */
const M          = 10;          // demand multiple = end/start price — ⚠ ASSUMED, verify via --preview
const SELL_FRAC  = 1.0;         // fraction of cap actually sold on the curve (poolLaunchSupply/cap); verify via --preview
// ── mint-once burn ceiling (matches scripts/burn-milestones.mjs) ──
/* ⚠ STILL AN ASPIRATION, NOT A SCHEDULE — kept at ⅔ of the cap so the gap stays visible. The
 *   pack schedule burns 1,014,375, i.e. 46% of this budget, so reaching it would need ~2.2×
 *   today's tokens-per-pack. At 33M the same gap was 11×, which is what made the deflation claim
 *   indefensible there; at 3.3M it is a tuning question rather than a different product. §5
 *   prints BOTH numbers and never lets this one stand in for the schedule. */
const LIFETIME_BURN_BUDGET = 2_200_000;    // ≈ ⅔ of cap — total permanent burn to retire the whole field
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
/* ⛔ THE PACK IS PRICED IN DOLLARS NOW, NOT IN TOKENS — and this is the change with the biggest
 * downstream consequence in the whole model. SuperRare's review of the live preview:
 *
 *     "I would not use the existing 350–1,200 token pack amounts. Even Tier I would open around
 *      $28–$42 on the low curve, and considerably higher on the other presets."
 *
 * At the measured $0.08 open, 350 tokens is a $28 pack. The old schedule was written when a
 * token was assumed to be $0.02, where 350 tokens was $7 — the number the site has published all
 * along. **The token amount was never the product; the price of a pack of cards was.** So the
 * TARGET is the dollar figure and the token count is DERIVED from it.
 *
 * ⚑ AND IT IS RE-DERIVED AT EACH TIER OPEN, THEN LOCKED FOR THAT TIER. Recomputing per purchase
 * would make the pack a moving target mid-tier; never recomputing would let a 3× appreciation
 * turn a $12 pack into a $36 one. Lock-at-open is the only version that is both honest to the
 * dollar target and stable enough to publish. */
const TIERS = [
  { s: 'TIER I',   budget: 11_200, usd: 10 },   // 1,600 packs
  { s: 'TIER II',  budget:  7_700, usd: 12 },   // 1,100 packs
  { s: 'TIER III', budget:  4_200, usd: 15 },   //   600 packs
  { s: 'TIER IV',  budget:  1_820, usd: 20 },   //   260 packs
];
/* tokens a pack costs at a given $/token — the whole pricing rule, in one line */
const packTok = (usdTarget, spotUsd = P0_USD) => Math.round(usdTarget / spotUsd);

const usd = r => r * RARE_USD;
const price = f => P0 * Math.pow(M, f);                 // RARE per token at sold-fraction f
const a = Math.log(M) / (CAP * SELL_FRAC);             // price rise per RARE of reserve (P = P0 + a*R)
const reserveAt = f => (P0 / a) * (Math.pow(M, f) - 1); // RARE in the pool after selling fraction f
const RTOTAL = reserveAt(1);
const fdvAt = f => price(f) * CAP * RARE_USD;           // USD, fully-diluted at spot
const packUsd = tok => tok * P0_USD;                   // a `tok`-token pack in $ at the MEASURED open
const fmt = (n, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const line = () => console.log('─'.repeat(80));

console.log('\n$3030 TOKEN MODEL');
console.log(`cap ${CAP.toLocaleString()} · P0 ${fmt(P0,2)} RARE · M ${M} (ASSUMED) · RARE≈$${RARE_USD} · sell-fraction ${SELL_FRAC}`);
console.log(`curve ${CURVE} · seed ${SEED_RARE} RARE · creator alloc ${CREATOR_ALLOC} · P0 $${P0_USD}/token ⚠ measured at the SUPERSEDED 3.3M cap — re-read --preview at ${fmt(CAP,0)}`);
console.log(`pack TIER I = $${TIERS[0].usd} = ${packTok(TIERS[0].usd)} $3030 at the open → ${packTok(TIERS[0].usd)/2} burned / ${packTok(TIERS[0].usd)/2} to the studio`);

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
line(); console.log('4. PACK ALLOTMENT BY TIER  (packs = cardBudget / 7; the pack is a $ TARGET)');
console.log(['tier','cardBudget','packs','$ target','tok @open','burn/pack','studio/pack','tier tok'].map(x=>x.padStart(12)).join(''));
let flatGross = 0;
for (const S of TIERS) {
  const packs = Math.floor(S.budget / CARDS_PER_PACK);
  const tok = packTok(S.usd);                       // AT TODAY'S OPEN — re-derived at each tier open
  flatGross += packs * tok;
  console.log([
    S.s, S.budget.toLocaleString(), packs.toLocaleString(), '$' + S.usd,
    String(tok), fmt(tok * BURN_SHARE, 1), fmt(tok * (1 - BURN_SHARE), 1),
    (packs * tok).toLocaleString(),
  ].map(x => String(x).padStart(12)).join(''));
}
console.log('\n⚠ THE `tok @open` COLUMN IS TIER I FACT AND TIERS II-IV SCENARIO. Only tier I opens at a');
console.log('  price we have measured. Tiers II, III and IV are RE-DERIVED from the live token price on');
console.log('  the day each one opens and then LOCKED for that tier, so their token counts are not');
console.log('  knowable now. Shown here at today\'s open purely so the columns add up to something.');
console.log('⚑ If the token appreciates, a $12 pack costs FEWER tokens — so pack-driven burn FALLS as');
console.log('  the price rises. That is the opposite of the old fixed-token schedule and is the whole');
console.log('  reason the burn percentage below cannot be promised.');

// 5. LIFETIME BURN — PERMANENT, bounded by the cap (mint-once)
line(); console.log(`5. BURN AND STUDIO REVENUE  (${fmt(BURN_SHARE*100,0)}% of each pack burns, the rest funds the studio)`);
/* ⛔ THIS SECTION NO LONGER PUBLISHES A PERCENTAGE, AND THAT IS THE POINT.
 *
 * SuperRare, on the live preview: *"we should not promise a fixed 30.7% burn. That model requires
 * roughly 570 tokens per pack on average, already about $46 per pack at the opening price, before
 * gas and curve appreciation. Better to publish live burn and studio totals."*
 *
 * ✅ CONFIRMED INDEPENDENTLY FROM THIS MODEL'S OWN NUMBERS: the old schedule burned 1,014,375 over
 *    3,560 packs at a 50/50 split, i.e. 1,014,375 / 3,560 / 0.5 = 570.0 GROSS tokens per pack, and
 *    570 x $0.08 = $45.60. Their figure is exactly ours, arrived at from the other direction.
 * ⛔ So 30.7% was never a property of the design — it was a property of a $0.02 token. At the
 *    measured $0.08 open the same dollar packs buy a quarter of the tokens, and any published
 *    percentage becomes a promise about a PRICE nobody controls. The site reports what has
 *    actually happened on-chain instead. */
let selloutBurn = 0, selloutTreas = 0;
console.log(['tier','packs','tok/pack','tier burn','cum burn','% of mint','→ studio'].map(x=>x.padStart(12)).join(''));
for (const S of TIERS) {
  const packs = Math.floor(S.budget / CARDS_PER_PACK), tok = packTok(S.usd);
  const gross = packs * tok, burn = gross * BURN_SHARE, treas = gross - burn;
  selloutBurn += burn; selloutTreas += treas;
  console.log([
    S.s, packs.toLocaleString(), String(tok), fmt(burn,0), fmt(selloutBurn,0),
    fmt(selloutBurn/CAP*100,1)+'%', fmt(treas,0),
  ].map(x => String(x).padStart(12)).join(''));
}
const flatPct = selloutBurn / CAP * 100;
console.log(`\n⚠ SCENARIO ONLY — "all four tiers sell out AND the price never moves from $${P0_USD}".`);
console.log(`  It burns ${fmt(selloutBurn,0)} (${fmt(flatPct,1)}% of the ${fmt(CAP,0)} mint) and sends the same`);
console.log(`  ${fmt(selloutTreas,0)} to the studio. ⛔ DO NOT PUBLISH ${fmt(flatPct,1)}% AS A TARGET. It moves`);
console.log(`  with the token price on every tier after the first, in the direction of LESS burn.`);
console.log(`\n  For reference, the burn the OLD fixed-token schedule implied: 1,014,375 (30.7%) — which`);
console.log(`  needs ${fmt(1_014_375/3_560/BURN_SHARE,0)} tokens/pack, i.e. $${fmt(1_014_375/3_560/BURN_SHARE*P0_USD,2)} a pack at today's open. That is the`);
console.log(`  trade in one line: a $46 pack, or an honest live number. The studio chose the number.`);
console.log(`\n✅ WHAT THE SITE PUBLISHES INSTEAD: live burn = maxTotalSupply() - totalSupply(), read from`);
console.log(`  the chain, and the studio total read from the treasury. Both are facts at the moment of`);
console.log(`  reading, neither is a forecast, and no visitor has to trust a projection to check them.`);

function realFloatPreview() { return CAP - selloutBurn; }
/* Report the float the PACK SCHEDULE actually produces, not the one the budget assumes.
 * These were the same number by construction at the old 3.03M cap, so the distinction never
 * showed. At 33M they diverge hard — LIFETIME_BURN_BUDGET is an aspiration (22M) while the
 * schedule burns 2.03M — and the old line went on confidently printing a 3.0× contraction that
 * nothing in the model supports. A tool that flatters the story is worse than no tool. */
const packsAll = TIERS.reduce((n, S) => n + Math.floor(S.budget / CARDS_PER_PACK), 0);
const realFloat = CAP - selloutBurn;
console.log(`Burns are PERMANENT: supply only falls. After the field's four-tier life sells through, ~${fmt(realFloat,0)} $3030`);
console.log(`survive as the settled live float — a ${fmt(CAP/realFloat,2)}× contraction from the mint.`);
/* ⚠ TWO DIFFERENT VERDICTS, and conflating them is how a claim gets overstated. "Is the burn a
 *   material fraction of the mint" and "is it a 3× scarcity engine" are separate questions, and
 *   at 3.3M the answers are YES and NO. The old single branch said "DEMOTE deflation" whenever
 *   contraction fell under 1.5×, which was right at 1.03× and would be a lie at 1.44×. */
const contraction = CAP / realFloat, burnPct = 100 * selloutBurn / CAP;
if (burnPct < 10) {
  console.log(`⛔ The burn is COSMETIC at this cap — ${fmt(burnPct,1)}% of the mint. Do not lead with deflation.`);
} else {
  console.log(`✓ The burn is MATERIAL: ${fmt(burnPct,1)}% of the mint is destroyed for good, a ${fmt(contraction,2)}× contraction.`);
}
if (contraction < 2.5) {
  /* ⛔ AND THE REASON CHANGED, WHICH MATTERS MORE THAN THE NUMBER. Under the old fixed-token
   * schedule the burn was small because the CAP outran the tokens per pack. Now the pack is a
   * DOLLAR target, so the burn is small because the token is worth 4× what the schedule assumed
   * — and it gets smaller as the token appreciates, because a $12 pack then buys fewer tokens.
   * Deflation is a side effect of this design, never the pitch. */
  console.log(`⚠ It is NOT a scarcity engine, and must not be sold as one. The pack is priced in DOLLARS`);
  console.log(`  ($${TIERS[0].usd}→$${TIERS[TIERS.length-1].usd}), so a RISING token price buys FEWER tokens per pack and burns less.`);
  console.log(`  Reaching a 3× contraction needs ~${fmt((CAP-CAP/3)/packsAll/BURN_SHARE,0)} gross tokens/pack — $${fmt((CAP-CAP/3)/packsAll/BURN_SHARE*P0_USD,0)} a pack at today's open.`);
  console.log(`  The studio chose playable pack prices over a deflation headline. Say that, not a percentage.`);
}
/* ⛔ THE SLUG IS THE OTHER HALF OF THE SAME SPLIT AND IT SCALES WITH THE CAP THE SAME WAY.
 *   A small cap makes the burn look good and the treasury look enormous, by exactly the same
 *   arithmetic. Print them together or the model is flattering the story again. */
if (selloutTreas / realFloat > 0.25) {
  console.log(`⛔ CONCENTRATION: the studio's slug is ${fmt(selloutTreas/realFloat*100,1)}% of the surviving float. At this cap that is the`);
  console.log(`  headline risk, not the burn — the same 50/50 split that makes the burn material makes the slug large.`);
  console.log(`  Never quote the ${fmt(burnPct,1)}% burn without it. docs/TREASURY.md leads with this.`);
}
console.log(`INVARIANT (mint-once): cumulative lifetime burn ≤ cap. Sellout ${selloutBurn < CAP ? '< cap ✓' : '> CAP ✗'}`);
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
console.log("and RE-DERIVE each tier's token count from the live price at its open, then LOCK it for that tier.\n");

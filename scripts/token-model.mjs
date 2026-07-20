#!/usr/bin/env node
// $UR3030 economic model — reproducible. Prints the price schedule, sensitivity to
// the demand multiple, buy slippage, the seasonal pack allotment + escalating pack
// price, per-season burn pressure, and reward-pool funding. All numbers in
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
// bundle of ~350 $UR3030 ≈ $7 at launch, so every rip is a real buy-and-burn of
// hundreds of tokens (steady upward pressure), NOT a token reprice. Pack price
// escalates within a season (allotment dwindles) and across seasons (field shrinks).
//
// MINT-ONCE (per SuperRare audit 2026-07): the edition mints its whole supply into
// the pool ONCE and burned tokens DO NOT re-mint — every burn is PERMANENT. So the
// LIFETIME burn is bounded by the cap. We size the whole field-retirement arc (all
// four seasons of pack rips) to a fixed budget below the cap, leaving a deliberate
// live float. Numbers below are our provisional target; the exact curve/supply/pack
// sizing is co-designed with SuperRare (see the audit reply + burn-milestones.mjs).

// ── token assumptions (swap in live values before locking) ──
const CAP        = 3_030_000;   // maxTotalSupply ($UR3030), minted once, burns permanent
const P0         = 1;           // opening price, RARE per token
const M          = 10;          // demand multiple = end/start price ("medium-demand", verify via --preview)
const RARE_USD   = 0.02;        // rough current-era RARE/USD — the whole $ column rides on this
const SELL_FRAC  = 1.0;         // fraction of cap actually sold on the curve (poolLaunchSupply/cap); verify via --preview
// ── mint-once burn ceiling (matches scripts/burn-milestones.mjs) ──
const LIFETIME_BURN_BUDGET = 2_020_000;   // ≈ ⅔ of cap — total permanent burn to retire the whole field
const FLOOR_SUPPLY         = CAP - LIFETIME_BURN_BUDGET;   // ≈ 1,010,000 live tokens survive the retirement

// ── pack assumptions (the $7 premium ritual — site-guided buy + burn IN FULL) ──
// LAUNCH (pure liquid edition, docs/LAUNCH-ARCHITECTURE.md): there is no game
// contract, so there is no house pool and no reward cut — a rip burns 100%.
// The Phase-2 vault design (docs/CARD-ECONOMY-SPEC.md) would set REWARD_CUT=1
// and LAST_STAND=50; kept here as constants so §6 can print the reference numbers.
const CARDS_PER_PACK = 7;
const REWARD_CUT     = 0;       // LAUNCH: packs burn in full (Phase-2 vault: 1)
const LAST_STAND     = 50;      // Phase-2 reference only (no on-chain bounty at launch)
// Reference seasonal schedule. Card budget dwindles, price floor rises, each season.
// base/ceil are $UR3030; ceil = 1.5*base (within-season line). The curator recalibrates
// base at each openSeason to hold the USD target against the then-live token price.
// Allotments are sized so a full four-season SELLOUT burns ≈ the lifetime budget
// (retiring the field to 77) and no more — permanent burns, so the arc fits under
// the cap by construction. Card budget (pack pulls) dwindles and the price floor
// rises each season. base/ceil are $UR3030; ceil = 1.5·base (within-season line).
const SEASONS = [
  { s: 'I · Summer',  budget: 11_200, base: 350, ceil: 525  },   // 1,600 packs
  { s: 'II · Fall',   budget:  7_700, base: 450, ceil: 675  },   // 1,100 packs
  { s: 'III · Winter', budget:  4_200, base: 600, ceil: 900  },   //   600 packs
  { s: 'IV · Spring', budget:  1_820, base: 800, ceil: 1200 },   //   260 packs
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

console.log('\n$UR3030 TOKEN MODEL');
console.log(`cap ${CAP.toLocaleString()} · P0 ${P0} RARE · M ${M} · RARE≈$${RARE_USD} · sell-fraction ${SELL_FRAC}`);
console.log(`pack ≈ ${SEASONS[0].base} $UR3030 = $${fmt(packUsd(SEASONS[0].base),2)} at launch (the token stays cheap; the PACK is the premium)`);

// 1. price schedule — the SAME launch-size pack (350 tok) costs more $ as the token appreciates
line(); console.log('1. PRICE SCHEDULE  (P = P0·M^f) — pack column = 350 $UR3030 priced at that spot');
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

// 4. SEASONAL PACK ALLOTMENT — dwindling supply, escalating price
line(); console.log('4. SEASONAL PACK ALLOTMENT  (packs = cardBudget / 7; price rises base→ceil as it is spent)');
console.log(['season','cardBudget','packs','base(tok)','ceil(tok)','base≈$*','ceil≈$*','season$ (tok·spot)*'].map((s,i)=>s.padStart(i?11:11)).join(''));
for (const S of SEASONS) {
  const packs = Math.floor(S.budget / CARDS_PER_PACK);
  const avg = (S.base + S.ceil) / 2;                 // linear line → mean price = midpoint
  const seasonTok = packs * avg;                     // tokens of buy-and-burn demand this season
  console.log([
    S.s.padStart(11),
    S.budget.toLocaleString().padStart(11),
    packs.toLocaleString().padStart(11),
    String(S.base).padStart(11),
    String(S.ceil).padStart(11),
    ('$'+fmt(packUsd(S.base),2)).padStart(11),
    ('$'+fmt(packUsd(S.ceil),2)).padStart(11),
    (fmt(seasonTok/1e6,2)+'M tok').padStart(13),
  ].join(''));
}
console.log('* $ columns price tokens at the LAUNCH spot ($0.02) — a conservative floor. As the curve');
console.log('  fills, the token appreciates, so real USD pack prices ride ABOVE these on top of the base');
console.log('  rise. Two escalators stack: the within-season base→ceil line AND token appreciation, and');
console.log('  each season opens with a smaller allotment + higher floor. Allotment gone => packs close');
console.log('  for the season (secondary market only). Numbers are curator-set defaults, tune at openSeason.');

// 5. LIFETIME BURN — PERMANENT, bounded by the cap (mint-once)
line(); console.log('5. LIFETIME BURN  (whole-field retirement across all 4 seasons; burns are PERMANENT)');
const seasonBurn = S => Math.floor(S.budget / CARDS_PER_PACK) * ((S.base + S.ceil) / 2);
let selloutTotal = 0;
console.log(['season','packs','avg pack','season 🔥','cum 🔥','% of mint'].map((s,i)=>s.padStart(i?12:11)).join(''));
for (const S of SEASONS) {
  const packs = Math.floor(S.budget / CARDS_PER_PACK), avg = (S.base + S.ceil) / 2, burn = packs * avg;
  selloutTotal += burn;
  console.log([
    S.s.padStart(11), packs.toLocaleString().padStart(12), fmt(avg,0).padStart(12),
    fmt(burn,0).padStart(12), fmt(selloutTotal,0).padStart(12), (fmt(selloutTotal/CAP*100,1)+'%').padStart(12),
  ].join(''));
}
console.log(`\nFull four-season SELLOUT burns ${fmt(selloutTotal,0)} — that is the arc that retires the field to 77.`);
console.log(`It lands at ${fmt(selloutTotal/CAP*100,1)}% of the ${fmt(CAP,0)} mint (budget ${fmt(LIFETIME_BURN_BUDGET,0)}, target ⅔).`);
console.log(`Burns are PERMANENT: supply only falls. After the field fully retires, ~${fmt(FLOOR_SUPPLY,0)} $UR3030`);
console.log(`survive as the settled live float — a ${fmt(CAP/FLOOR_SUPPLY,1)}× permanent contraction from the mint.`);
console.log(`INVARIANT (mint-once): cumulative lifetime burn ≤ cap. Sellout ${selloutTotal < CAP ? '< cap ✓' : '> CAP ✗'}`);
console.log('A partial life (fewer rips) simply retires fewer cards and settles at a higher float — the deck');
console.log('only reaches 77 if the community truly burns across the seasons. No burn ever re-mints.');

// 6. reward pool — LAUNCH: none (pure liquid edition). Phase-2 reference below.
line(); console.log('6. HOUSE REWARD POOL — LAUNCH: NONE. Packs burn IN FULL (mint-once: those tokens are');
console.log('gone for good). The season-end rewards (survivor 1/1s, compression rebirths, Ash-Trophy');
console.log('honors) are 721 LENS MINTS via SuperRare assisted setup, not token payouts. A Phase-2');
console.log(`vault (REWARD_CUT=${REWARD_CUT?REWARD_CUT:1} ref, LAST_STAND=${LAST_STAND}) would divert a per-pack cut to a bounty pool`);
console.log('INSTEAD of burning it — which would REDUCE lifetime burn below the budget above, never raise');
console.log('it. Any such pool is seeded only from real rips, so it is solvent by construction (no pre-mint).');
line();
console.log('Verify before mainnet: mint/burn semantics, effective M, sell-fraction (--preview/getMarketState),');
console.log('and recalibrate packBase to the $7-and-up USD target against the live token price at each openSeason.\n');

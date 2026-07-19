#!/usr/bin/env node
// $UR3030 economic model — reproducible. Prints the price schedule, sensitivity to
// the demand multiple, buy slippage, per-season burn pressure, and reward-pool
// funding. All numbers in docs/TOKEN-MATH.md come from here; re-run to re-derive.
//
//   node scripts/token-model.mjs
//
// Grounding (from the SuperRare liquid-editions-starter-kit + Doppler Multicurve):
// a Liquid Edition is a Uniswap-v4 pool with liquidity placed as a log-normal
// multicurve. Idealization: a constant number of tokens sold per multiplicative
// price bucket => log(price) linear in supply => price EXPONENTIAL in supply, which
// is EXACTLY LINEAR IN RESERVE:  P = P0 + a*R,  a = ln(M)/cap,  P(f) = P0 * M^f.
// The true per-preset curve must be confirmed with `rare liquid-edition ... --preview`.

// ── assumptions (swap in live values before locking) ──
const CAP        = 3_030_000;   // maxTotalSupply ($UR3030), capped
const P0         = 1;           // opening price, RARE per token
const M          = 10;          // demand multiple = end/start price ("medium-demand", verify via --preview)
const RARE_USD   = 0.02;        // rough current-era RARE/USD — the whole $ column rides on this
const PACK_TOK   = 10;          // packPrice
const SELL_FRAC  = 1.0;         // fraction of cap actually sold on the curve (poolLaunchSupply/cap); verify via --preview

const usd = r => r * RARE_USD;
const price = f => P0 * Math.pow(M, f);                 // RARE per token at sold-fraction f
const a = Math.log(M) / (CAP * SELL_FRAC);             // price rise per RARE of reserve (P = P0 + a*R)
const reserveAt = f => (P0 / a) * (Math.pow(M, f) - 1); // RARE in the pool after selling fraction f
const RTOTAL = reserveAt(1);
const fdvAt = f => price(f) * CAP * RARE_USD;           // USD, fully-diluted at spot
const fmt = (n, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const line = () => console.log('─'.repeat(78));

console.log('\n$UR3030 TOKEN MODEL');
console.log(`cap ${CAP.toLocaleString()} · P0 ${P0} RARE · M ${M} · RARE≈$${RARE_USD} · sell-fraction ${SELL_FRAC}`);

// 1. price schedule
line(); console.log('1. PRICE SCHEDULE  (P = P0·M^f)');
console.log(['f', 'spot(RARE)', 'spot($)', 'pack($)', 'FDV($)', 'reserve(RARE)'].map((s,i)=>s.padStart(i?13:5)).join(''));
for (const f of [0, 0.10, 0.25, 0.50, 0.75, 1.0]) {
  console.log([
    f.toFixed(2).padStart(5),
    fmt(price(f), 3).padStart(13),
    ('$'+fmt(usd(price(f)), 4)).padStart(13),
    ('$'+fmt(PACK_TOK*price(f)*RARE_USD, 2)).padStart(13),
    ('$'+fmt(fdvAt(f), 0)).padStart(13),
    fmt(reserveAt(f), 0).padStart(13),
  ].join(''));
}
console.log(`RARE to walk the curve to full: ${fmt(RTOTAL,0)} RARE ≈ $${fmt(usd(RTOTAL),0)}  ·  avg fill price ${fmt(RTOTAL/(CAP*SELL_FRAC),2)} RARE/token`);

// 2. sensitivity to M
line(); console.log('2. SENSITIVITY TO DEMAND MULTIPLE M  (cap + P0 fixed)');
console.log(['M', 'pack@0', 'pack@50%', 'pack@100%', 'FDV@100%($)', 'RARE to fill'].map((s,i)=>s.padStart(i?13:5)).join(''));
for (const m of [3, 10, 30]) {
  const p = f => P0 * Math.pow(m, f);
  const rfill = CAP * SELL_FRAC * (m - 1) / Math.log(m);
  console.log([
    String(m).padStart(5),
    ('$'+fmt(PACK_TOK*p(0)*RARE_USD,2)).padStart(13),
    ('$'+fmt(PACK_TOK*p(0.5)*RARE_USD,2)).padStart(13),
    ('$'+fmt(PACK_TOK*p(1)*RARE_USD,2)).padStart(13),
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

// 4. per-season BURN PRESSURE (transparent inputs; illustrative, not a forecast)
line(); console.log('4. PER-SEASON BURN PRESSURE  ($UR3030 of demand needed to hold float flat)');
const CULL_PER_EDITION = 300;   // avg downvote-conviction burned to retire an edition (through tiers)
const scen = [
  { name: 'LOW',  players: 500,   packs: 5,  wagers: 2,  trades: 3,  sends: 2,  editionsCulled: 40  },
  { name: 'MED',  players: 5000,  packs: 10, wagers: 4,  trades: 5,  sends: 4,  editionsCulled: 90  },
  { name: 'HIGH', players: 50000, packs: 15, wagers: 6,  trades: 8,  sends: 6,  editionsCulled: 119 },
];
console.log(['scenario','players','pack🔥','play🔥','cull🔥','TOTAL 🔥/season'].map((s,i)=>s.padStart(i?12:8)).join(''));
for (const s of scen) {
  const packBurn = s.players * s.packs * 9;                      // 9 of 10 burn
  const playBurn = s.players * (s.wagers*4 + s.trades*2 + s.sends*1);
  const cullBurn = s.editionsCulled * CULL_PER_EDITION + s.editionsCulled * 50;  // conviction + destroyToll
  const total = packBurn + playBurn + cullBurn;
  console.log([
    s.name.padStart(8), s.players.toLocaleString().padStart(12),
    fmt(packBurn,0).padStart(12), fmt(playBurn,0).padStart(12), fmt(cullBurn,0).padStart(12),
    (fmt(total,0)+`  (${fmt(100*total/CAP,1)}% of cap)`).padStart(24),
  ].join(''));
}
console.log('NOTE: net supply change = BUYS − BURNS (sign indeterminate). Burns are downward');
console.log('PRESSURE; "deflation" holds only while buy-demand < burn-demand. Cap never "runs out"');
console.log('— burns pull totalSupply below what was bought; the next buy re-mints into the gap.');

// 5. reward-pool funding
line(); console.log('5. HOUSE REWARD POOL');
const REWARD = 50, CUT = 1;
console.log(`each destroyEdition pays min(pool, ${REWARD}); each pack seeds ${CUT}. lastStandingReward(${REWARD}) = destroyToll(${REWARD}) => culling is toll-neutral (non-farmable).`);
for (const s of scen) {
  const seeded = s.players * s.packs * CUT;
  const maxOut = s.editionsCulled * REWARD;
  console.log(`  ${s.name.padEnd(4)} seeded ${fmt(seeded,0).padStart(9)} · max payout ${fmt(maxOut,0).padStart(6)} · ${seeded>=maxOut?'SOLVENT by season end':'pre-fund via fundReward()'} (worst-case gap ${fmt(Math.max(0,maxOut-seeded),0)})`);
}
console.log('Timing fix (no param change): curator calls fundReward() at season open to pre-fund the early window.');
line();
console.log('Verify before mainnet: mint/burn semantics, effective M, and sell-fraction — all via `--preview`/getMarketState.\n');

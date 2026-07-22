# CURVE TARGET — corrected Sepolia redeploy spec ($UR3030)

*The exact parameters to build the next Sepolia curve around, and a line-by-line
reconciliation of the SuperRare audit. Item 2 (the curve) is the only one that
needs SuperRare's side to build; items 1/3/4/5 are already fixed in this repo.*

---

## The corrected deploy parameters

| Parameter | Sepolia test (wrong) | **Corrected target** | Why |
|---|---|---|---|
| **Max supply** | 1,000,000 (launcher default) | **3,030,000** | the brand cap; also the burn-meter denominator (`maxTotalSupply − totalSupply`) |
| **Opening price** | ~16 RARE/token (→ 5,700 RARE/pack) | **~1 RARE/token** (≈ $0.02) | a 350-token pack should cost ~350 RARE ≈ **$7**, not 5,700 |
| **Pack** | — | **350 $UR3030, bought + burned in full** | ≈ $7 at launch, seven cards; a *fixed-USD ritual*, escalating base→ceil within a season |
| **Reserve seed** | — | **≈ 10,000 RARE** (to confirm) | seeds the opening price; exact figure depends on the multicurve shape |
| **Lifetime burn** | schedule totalled 4,355,400 (impossible) | **≈2,020,000 total** (66.7% of cap) | mint-once, burns permanent; TOKEN deflation only (no card retirement); `scripts/token-model.mjs` |

### The key realization on slippage
The 5,700-RARE quote was **not** a cap problem — it was the **opening price** (the
medium-demand preset on a 1M supply opened ~16× too high) plus the wrong supply.
A single 350-token pack is **350 / 3,030,000 = 0.0116%** of supply, so pack-sized
buys move the price a negligible amount on a 3.03M curve. The cap is fine for the
pack ritual; only large whale buys (~$2k+) would need deeper liquidity, and those
are out of scope for the pack economy.

### The one open question for SuperRare
Can the **medium-demand** multicurve be calibrated (reserve seed / params) to
**open at ≈ 1 RARE/token** on a **3,030,000** supply? If the preset can't open
that low, we'll take whatever opening price it *can* hit and set the pack's token
count so the pack lands at ~$7 (i.e. pack = `round($7 / opening_price_in_$)` tokens),
then re-derive the burn milestones from that token count. Either way the pack stays
a **~$7 buy-and-burn**; the token count flexes to the curve, not the reverse.

---

## Audit reconciliation (what's already fixed here)

| # | Audit item | Status | Where |
|---|---|---|---|
| 1 | Milestones 4,355,400 > 3,030,000 (mint-once can't complete) | **Resolved — mechanic removed** | v2.2 cut forced card retirement entirely; only TOKEN deflation remains (Σ pack burns ≤ ⅔ cap ≈ 2.02M), `scripts/token-model.mjs` |
| 2 | Curve too expensive (5,700 RARE/pack); decide supply+pack+burn together | **Spec above** | this doc — build target for SuperRare |
| 3 | Renderer: 100% circulating + 0 per-RARE | **Fixed** | `contracts/UR3030RenderPrototype.sol` → BURNED% (`max−total`), per-RARE ×100→2dp; re-callable `setRenderContract`, no token redeploy |
| 4 | Real burn vs. local card pulls — label prototype | **Doing** | pack / binder / battle / card-powers relabelled testnet-prototype site-wide; only the **$UR3030 buy+burn** stays framed as real |
| 5 | "Upperdeck" trademark (same category as Upper Deck) | **Decision** | keep **upperdeckripmaster3030** as one coined word (matches the domain); professional clearance before public promotion |

## Sequencing (as SuperRare proposed)
1. Lock **supply + opening price + pack + burn** (this doc) — awaiting only the
   curve-calibration answer above.
2. Request **25,000 test RARE** (≈ three 350-token rehearsals + a partial-sell test).
3. Redeploy on Sepolia at **3,030,000 / ~1 RARE open**, point the token at the
   **fixed renderer** (`setRenderContract`), and run the corrected buy/burn to watch the
   **burn meter climb** in the render (BURNED %) — no card retirement to test anymore.

*Not financial advice. `$UR3030` is an experimental, volatile testnet token.*

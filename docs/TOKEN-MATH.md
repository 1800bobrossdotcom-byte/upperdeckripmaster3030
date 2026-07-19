# $UR3030 — token math (finalized)

Supply, burn costs, pricing, and liquidity for Upperdeck Ripmaster 3030, grounded
in how SuperRare Liquid Editions actually work and pressure-tested by an
adversarial modeling pass (5 independent models, each verified by a skeptic).
Every number here is reproduced by `scripts/token-model.mjs` — run it to re-derive.
Pairs with `docs/ARTIST-INTAKE.md` Part 3.

> **Not financial advice.** `$UR3030` is an experimental, volatile crypto token.
> Two numbers must be confirmed on-chain with `--preview` before mainnet (§8): the
> effective demand multiple **M**, and the **sell-fraction** (how much of the cap
> the curve actually sells). One assumption — that burns re-mint on the next buy —
> is the linchpin; verify it too.

---

## 0. Final decisions (TL;DR)

| Knob | **Final** | Why |
|---|---|---|
| **Supply cap** | **3,030,000 `$UR3030` — KEEP** | 3M is **not** too low; see §2. The cap is a live-supply ceiling on the curve, not a lifetime burn budget. |
| Opening price **P₀** | **≈ 1 RARE / token** → ~$0.02/token → **pack ≈ $0.20** (band 0.5–2.5 RARE) | set by price, not cap; a real micro-play the whole way up |
| Demand multiple **M** | `medium-demand` preset, assume **M ≈ 10**, **verify via `--preview`** | pick the *steadiest* slope even if that's low-demand |
| Reserve currency | **RARE** | `baseToken()` = RARE |
| Reserve seed | **~10,000 RARE** (`max(2×minRareLiquidityWei, 10k)`) | bootstrap floor; confirm with cohort |
| All tolls / step costs | **unchanged** (verified against the contract) | §3 |
| `rewardCut` / `lastStandingReward` | **1 / 50 — KEEP** | invariant `reward = destroyToll = 50` → culling is non-farmable |
| Creator cut | upvote + HODL → creator | **add vesting + recycle 25–50% into RARE reserve** |
| `retireQuorum` | **9** (was 5) | harder for a clique to condemn a card |

**FDV at full curve ≈ $606k** (3.03M × $0.20). That is an "artist-scale niche
edition," and it is a deliberate choice — see §2.

---

## 1. What a Liquid Edition actually is (grounded)

Not a Bancor single-formula bond. Each edition is a **Uniswap-v4 pool** whose
liquidity is placed by **Doppler Multicurve** — an array of concentrated-liquidity
positions approximating a **log-normal** shape, so it "sells a constant number of
tokens in each price bucket." All price math is standard v4 tick math
(`price = 1.0001^tick`); the `--curve-preset` names (low/medium/high-demand) are
bundles of `Curve[] {tickLower, tickUpper, numPositions, shares}` that SuperRare
fills in. `numPositions` = steepness; `shares` (must sum to 1e18) split supply
across curves. Reserve/quote = **RARE** (mainnet `0xba5BDe66…6350`); factory
`0x25f993C2…9540`.

**The clean law we model with.** "Constant tokens per multiplicative price step" ⟹
`log(price)` is linear in supply ⟹ **price is exponential in supply, which is
exactly linear in reserve**:

```
P(f) = P0 · M^f           (f = tokens sold / cap)
P    = P0 + a · R,   a = ln(M) / cap        (price is a straight line in RARE reserve)
```

so a buy of ΔR RARE raises price by exactly `a·ΔR` — which makes the slippage in
§5 exact, not approximate.

**Reads we use** (`ILiquid`): `getCurrentPrice() → (rarePerToken, tokenPerRare)`,
`getMarketState() → (rarePerToken, tokenPerRare, sqrtPriceX96, currentTick,
liquidity, currentSupply)`, `quoteBuy/quoteSell` (use these for real execution
slippage — don't reinvent it), `maxTotalSupply()`, `poolLaunchSupply()`, `burn()`.

---

## 2. Is 3,030,000 too low? — **No. Keep it.**

The tempting answer was "raise it 10× to 30.3M." It's wrong, and the reason is one
fact: **the cap is a live-supply ceiling on the curve, not a lifetime burn budget.**
Tokens are minted on *buy*; game burns pull `totalSupply` *below* what's been
bought; the next buy re-mints into the gap. `ILiquid` has no cumulative-mint
counter — only `totalSupply()` and `maxTotalSupply()`. So lifetime burns are
effectively unbounded and the cap never "runs dry." Every reason to raise it then
collapses:

1. **Runway** — void. (The HIGH scenario in §6 "burns 300% of the cap per season" —
   which is *only possible because the cap refills*. Self-refuting as a runway
   argument.)
2. **Toll granularity** — 3.03M is comfortable: a full Common→Prizm climb (2,700) is
   **0.089%** of supply; a pack is **0.00033%**. Granularity only ever argues
   *against going lower*.
3. **Cheap micro-plays** — set by **opening price, not cap**. At P₀≈1 RARE the pack
   is **$0.20 → $2.00 across the entire curve** (§4). A bigger cap doesn't make packs
   cheaper.
4. **Steady-not-pump** — the anti-rug protection is *structural* (un-pullable RARE
   reserve, no team pre-mint), independent of cap. A **larger** cap actively *harms*
   steady upward growth: at 30.3M, realistic niche volume barely lifts price off the
   floor → a **flat, stagnant chart**, which is the failure mode from the other side.

The only *verified* nudge upward is slippage: to hold a single **$2,000** launch buy
under 2% impact you'd need cap ≥ **~11.5M** (§5). Take that **only if** you expect
routine $2k+ single tickets — which does not fit a cheap-micro-play card game. **For
the stated goals, hold 3,030,000.** (The 30.3M idea was motif-driven — it spells
"3030" — and undershoots even its own 5-year target math; rejected.)

Keeping 3.03M is an implicit choice of **artist-scale niche edition** (~$606k
full-curve FDV). Only reopen the cap question if the ambition is genuinely bigger.

---

## 3. The burn/spend schedule (unchanged, verified against `CardVault.sol`)

"→" = destination: 🔥 burn · 🎨 creator · 🏦 house reward pool. Curator-tunable.

| Action | Toll | → |
|---|---|---|
| `sendCard` | **1** | 🔥 |
| `trade` | **1 / side** (2) | 🔥 |
| `openMatch`/`joinMatch` | **2 / side** (4) | 🔥 |
| `ripPack` (7 cards) | **10** | 9 🔥 + 1 🏦 |
| `voteRarity` up / `voteHodl` | vote `amt` | 🎨 |
| `voteRarity` down | vote `amt` | 🔥 |
| `destroyEdition` (retired card) | **50** + all copies | 🔥 |
| last-standing reward (paid out) | **50** | 🏦 → keeper |
| `fundReward` | `amt` | 🏦 |
| marquee transfer | **25** | 🔥 |

**Rarity-court step costs** (one tier, up or down): Common↔Uncommon **50**,
Uncommon↔Rare **150**, Rare↔Mythic **500**, Mythic↔Prizm **2,000**. Full climb =
**2,700**. Retiring a card off the island also needs a **quorum of 9 distinct
downvoters**.

**Sizing** is pegged to the 1-token base: casual moves 1–4, a pack 10, ending an
edition 50, tier moves 50→2,000. Deflation comes from **volume** (thousands of small
burns), not a few big ones.

---

## 4. Price schedule (cap 3.03M, P₀ = 1 RARE, M = 10, RARE ≈ $0.02)

From `scripts/token-model.mjs` §1:

| f (sold) | spot (RARE) | spot ($) | **pack ($)** | FDV ($) | reserve (RARE) |
|---|---|---|---|---|---|
| 0.00 (launch) | 1.000 | $0.0200 | **$0.20** | $60,600 | 0 |
| 0.10 | 1.259 | $0.0252 | **$0.25** | $76,291 | 340,723 |
| 0.50 | 3.162 | $0.0632 | **$0.63** | $191,634 | 2,845,368 |
| 0.75 | 5.623 | $0.1125 | **$1.12** | $340,779 | 6,084,006 |
| 1.00 (full) | 10.000 | $0.2000 | **$2.00** | $606,000 | 11,843,211 |

**Headline:** the pack stays **$0.20 → $2.00 the whole way up** — a genuine
micro-play across the entire curve. Walking the curve to full takes **~11.84M RARE
(~$237k)** of net buys; average fill price **3.91 RARE/token**.

**Demand-multiple sensitivity** (bracketing the unknown preset — §8 verify):

| M | pack@0 | pack@50% | pack@100% | FDV@100% | RARE to fill |
|---|---|---|---|---|---|
| 3 (flat) | $0.20 | $0.35 | $0.60 | $181,800 | 5.52M |
| **10 (medium — rec.)** | $0.20 | $0.63 | $2.00 | $606,000 | 11.84M |
| 30 (steep) | $0.20 | $1.10 | $6.00 | $1,818,000 | 25.84M |

---

## 5. Slippage & the steady-growth posture

`ΔP = a·ΔR`, so price-impact at launch = `a·ΔR / P₀`:

| buy | impact @ launch |
|---|---|
| $20 | 0.08% |
| $200 | 0.76% |
| $2,000 | **7.60%** |
| $20,000 | 76% |

Small plays barely move price; a whale $2k single buy moves it 7.6% at launch (and
less as the reserve deepens). This is the **steady-not-pump** design working:
- **un-pullable liquidity** — the RARE reserve lives in the pool, not a yankable LP;
  sells walk *down the curve*, they can't drain it to zero.
- **no team pre-mint** — nothing minted at genesis to dump.
- **deflation under steady demand** — burns pressure the float down; under recurring
  micro-buys, a shrinking float clears the same demand at a higher price. A ratchet,
  not a spike.

**Adding to liquidity over time** (a design caveat): a *static* multicurve places all
liquidity **once at deploy**; there is **no native "top-up the curve later"** flow.
Add depth by (a) seeding real RARE at deploy (~10k), (b) letting buys deepen the
reserve organically, and (c) **recycling 25–50% of the creator cut / house pool back
into RARE reserve** on a schedule — the game's own income funding standing liquidity.
A later Uniswap-v3 `$UR3030`/RARE side-pool is optional, never the primary market.
*(If continuous curve top-ups are a hard requirement, flag it to SuperRare — it needs
raw v4 position management, not a first-class multicurve feature.)*

---

## 6. Burn pressure per season (illustrative, reproducible)

From `scripts/token-model.mjs` §4 — transparent inputs, **not a forecast**:

| scenario | players | pack 🔥 | play 🔥 | cull 🔥 | total 🔥/season |
|---|---|---|---|---|---|
| LOW | 500 | 22,500 | 8,000 | 14,000 | **44,500** (1.5% of cap) |
| MED | 5,000 | 450,000 | 150,000 | 31,500 | **631,500** (20.8% of cap) |
| HIGH | 50,000 | 6,750,000 | 2,300,000 | 41,650 | **9,091,650** (300% of cap) |

**Read this correctly:** net supply change = **buys − burns** (sign *indeterminate*).
Burns are downward **pressure**; "deflation" holds only while buy-demand < burn-demand
— it is not a guaranteed permanent decline. The HIGH row exceeding 100% of the cap is
exactly the proof that the cap refills (§2). Read the real net trajectory live from
`totalSupply()`.

---

## 7. House reward pool (solvency)

`destroyEdition` pays `min(rewardPool, 50)`; each pack seeds `1`; and the invariant
**`lastStandingReward (50) = destroyToll (50)`** makes culling **toll-neutral →
non-farmable** (you pay 50 to destroy, get 50 back, minus the cards you burned and a
soulbound trophy — no profit loop). Solvency (model §5): seeded packs ≫ max payouts in
every scenario, so the pool is solvent by season end. The only risk is *early-season*
underpayment — fixed with **zero code**: the curator calls `fundReward()` at season
open to pre-fund the window. **Keep `rewardCut = 1`.** Destruction now also requires
the card be **already retired** by the court (contract fix) — you cannot destroy a
healthy edition to farm the bounty.

**Creator cut is not a floor.** Cards register at explicit initial tiers and packs
draw at *current* tier, so a card minted at its final tier pays the creator **zero**.
Real creator income = Σ(final − registered tier) × step-cost, driven by tier *churn* —
genuinely unknown; do **not** quote a fixed "floor." Recommended governance:
vest/timelock the cut (it's an instant transfer today — a HODL windfall could be
dumped) and recycle a share into liquidity (§5).

---

## 8. Endpoints + pre-mainnet verification

**Deploy / wire (Rare CLI):**
```
rare liquid-edition deploy multicurve "Upperdeck Ripmaster 3030" "UR3030" \
  --curve-preset medium-demand --description "…" --image ./cards/art/<hero>.png --preview
rare liquid-edition status            --contract 0x…
rare liquid-edition set-render-contract --contract 0x… --render-contract 0x…
```
`rare mcp serve` exposes all of this over MCP.

**Verify BEFORE locking numbers (these can overturn the model):**
1. **★ Mint/burn semantics** — does a burn reopen mint headroom (re-mint on next buy)?
   The whole "3M is enough" verdict assumes yes. If burns *permanently* consume curve
   inventory, runway becomes real and the target moves to **~40M**. Check via
   `getMarketState`/`--preview` on a live edition.
2. **Effective M** — back the real end/start multiple out of the preset's `Curve[]`
   (`--preview`). Pick the steadiest slope.
3. **Sell-fraction** — is the whole cap sold on the curve, or is some reserved
   (`poolLaunchSupply < maxTotalSupply`)? FDV / RARE-to-fill / slippage all scale with
   it.
4. **RARE seed floor** — read `minRareLiquidityWei()`; confirm ~10k RARE with the cohort.
5. **Live RARE/USD** — the entire $-column assumes $0.02; re-peg P₀ on deploy day.
6. **Chain choice** — a $0.20 pack is **gas-dominated on L1** ($1–5/tx). **Deploy on an
   L2** (or batch actions) or the micro-play thesis breaks.

---

## 9. Doc corrections applied

- Removed the erroneous "0.5–1 RARE per **100** `$UR3030`" peg (implied a ~$0.001
  pack, ~100× off). The peg is **~1 RARE per token → pack ~$0.20**.
- Reframed the "runway / % of cap consumed" framing as **burn *pressure* / demand to
  hold the float flat** — the cap is not a fuel tank.
- Creator-cut "floor" removed (see §7).

*Everything here is tunable on-chain via the curator setters; only the cap and the
curve are locked at deploy. Re-run `scripts/token-model.mjs` after any change.*

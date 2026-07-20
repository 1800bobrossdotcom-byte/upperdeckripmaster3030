# $UR3030 — token math (finalized)

Supply, burn costs, pricing, and liquidity for upperdeckripmaster3030, grounded
in how SuperRare Liquid Editions actually work and pressure-tested by an
adversarial modeling pass (5 independent models, each verified by a skeptic).
Every number here is reproduced by `scripts/token-model.mjs` — run it to re-derive.
Pairs with `docs/ARTIST-INTAKE.md` Part 3.

> **Not financial advice.** `$UR3030` is an experimental, volatile crypto token.
> Two numbers must be confirmed on-chain with `--preview` before mainnet (§8): the
> effective demand multiple **M**, and the **sell-fraction** (how much of the cap
> the curve actually sells). One assumption — that burns re-mint on the next buy —
> is the linchpin; verify it too.

> 🏗️ **Architecture note (2026-07-19).** The project launches as a **pure Liquid
> Edition** — one ERC-20, a render contract, optional 721 lenses; **no game
> contract** (see `docs/LAUNCH-ARCHITECTURE.md`). The curve math here (§1, §2, §4,
> §4a, §5) describes the ERC-20 and **stands unchanged**. The CardVault toll/pool
> mechanics referenced in §3 and §7 are **Phase 2 reference design**: at launch,
> packs are site-guided buy+burns that burn **in full**, and the burn-down runs on
> the published milestone schedule (`scripts/burn-milestones.mjs`).

---

## 0. Final decisions (TL;DR)

| Knob | **Final** | Why |
|---|---|---|
| **Supply cap** | **3,030,000 `$UR3030` — KEEP** | 3M is **not** too low; see §2. The cap is a live-supply ceiling on the curve, not a lifetime burn budget. |
| Opening price **P₀** | **≈ 1 RARE / token** → **~$0.02/token** (band 0.5–2.5 RARE) | set by price, not cap; keeps every toll + vote a micro-move |
| **Pack price** | **~350 `$UR3030` ≈ $7 at launch**, escalating within + across seasons | the ONE premium action; each rip is a real buy-and-burn of hundreds of tokens (§4a) |
| Demand multiple **M** | `medium-demand` preset, assume **M ≈ 10**, **verify via `--preview`** | pick the *steadiest* slope even if that's low-demand |
| Reserve currency | **RARE** | `baseToken()` = RARE |
| Reserve seed | **~10,000 RARE** (`max(2×minRareLiquidityWei, 10k)`) | bootstrap floor; confirm with cohort |
| All tolls / step costs | **unchanged** (verified against the contract) | §3 |
| `rewardCut` / `lastStandingReward` | **1 / 50 — KEEP** | invariant `reward = destroyToll = 50` → culling is non-farmable |
| Creator cut | upvote + HODL → creator | **add vesting + recycle 25–50% into RARE reserve** |
| `retireQuorum` | **9** (was 5) | harder for a clique to condemn a card |

**FDV at full curve ≈ $606k** (3.03M tokens × $0.20 *token spot-at-full*, not the
pack price). That is an "artist-scale niche edition," and it is a deliberate choice —
see §2. The **pack** is $7-and-up, but that is a *bundle size* (~350 cheap tokens),
not the token price — the two never got conflated again (§4a).

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

1. **Runway** — void. (A sold-out season in §6 cycles **~1.4× the cap through burns** —
   which is *only possible because the cap refills*. Self-refuting as a runway
   argument.)
2. **Toll granularity** — 3.03M is comfortable: a full Common→Prizm climb (2,700) is
   **0.089%** of supply; a pack (~350) is **0.012%**. Granularity only ever argues
   *against going lower*.
3. **Cheap micro-moves** — the tolls and votes that make up moment-to-moment play stay
   tiny because the **token** is cheap (set by **opening price, not cap**): a send is
   1 token ≈ $0.02, a tier step 50–2,000. The **pack** is the one deliberate premium
   ($7+), and it is priced as a *token bundle*, not by the token's spot — so a bigger
   cap changes neither the micro-tolls nor the pack.
4. **Steady-not-pump** — the anti-rug protection is *structural* (un-pullable RARE
   reserve, no team pre-mint), independent of cap. A **larger** cap actively *harms*
   steady upward growth: at 30.3M, realistic niche volume barely lifts price off the
   floor → a **flat, stagnant chart**, which is the failure mode from the other side.

The only *verified* nudge upward is slippage: to hold a single **$2,000** launch buy
under 2% impact you'd need cap ≥ **~11.5M** (§5). Take that **only if** you expect
routine $2k+ single tickets — which does not fit a $7-pack, micro-toll card game. **For
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
| `ripPack` (7 cards) | **`packPrice()`** — ~350 (S1 base) → escalates, §4a | (all − 1) 🔥 + 1 🏦 |
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

**Sizing** is pegged to the 1-token base: casual moves 1–4, ending an edition 50,
tier moves 50→2,000. The one exception is the **pack (~350, the premium on-ramp)** —
sized in dollars, not pegged to the base, so it stays ≈$7 while the token stays cheap.
Deflation comes from **volume**: thousands of small burns *plus* the pack — now the
single biggest per-action burn (§4a, §6).

---

## 4. Price schedule (cap 3.03M, P₀ = 1 RARE, M = 10, RARE ≈ $0.02)

From `scripts/token-model.mjs` §1. The pack column holds the bundle **fixed at 350
tokens** and reprices it by the token's spot — so it isolates *one* of the two pack
escalators (token appreciation). The designed escalation (base→ceil, per-season) is §4a.

| f (sold) | spot (RARE) | spot ($) | **pack of 350 ($)** | FDV ($) | reserve (RARE) |
|---|---|---|---|---|---|
| 0.00 (launch) | 1.000 | $0.0200 | **$7.00** | $60,600 | 0 |
| 0.10 | 1.259 | $0.0252 | **$8.81** | $76,291 | 340,723 |
| 0.25 | 1.778 | $0.0356 | **$12.45** | $107,764 | 1,024,147 |
| 0.50 | 3.162 | $0.0632 | **$22.14** | $191,634 | 2,845,368 |
| 0.75 | 5.623 | $0.1125 | **$39.36** | $340,779 | 6,084,006 |
| 1.00 (full) | 10.000 | $0.2000 | **$70.00** | $606,000 | 11,843,211 |

**Headline:** the **token** stays a cheap micro-token ($0.02 → $0.20 spot across the
whole curve); the **pack** is deliberately premium and *rises* — the same 350-token
bundle runs $7 at launch to $70 at a full curve on token appreciation alone. Walking
the curve to full takes **~11.84M RARE (~$237k)** of net buys; average fill price
**3.91 RARE/token**. FDV is the *token* line and is unchanged by the pack size.

**Demand-multiple sensitivity** (pack = 350 tokens @ spot; bracketing the unknown
preset — §8 verify):

| M | pack@0 | pack@50% | pack@100% | FDV@100% | RARE to fill |
|---|---|---|---|---|---|
| 3 (flat) | $7.00 | $12.12 | $21.00 | $181,800 | 5.52M |
| **10 (medium — rec.)** | $7.00 | $22.14 | $70.00 | $606,000 | 11.84M |
| 30 (steep) | $7.00 | $38.34 | $210.00 | $1,818,000 | 25.84M |

---

## 4a. The pack: a $7 premium bundle on a dwindling seasonal allotment

Packs are **$7.00 at launch, not $0.20** — and they *go up*. This is deliberate, and
it is done **without repricing the token**:

- A pack is a **bundle of ~350 `$UR3030`** (≈ $7 at the $0.02 launch spot), not 10.
  The token stays cheap (so every toll/vote stays a micro-move); only the *pack* is
  premium. Repricing the token to make 10 tokens = $7 would have blown FDV to ~$21M —
  pump territory, and it would reopen the "is 3M too low" verdict (§2). Rejected.
- **Why a big pack is the right lever for "steady growth, not a pump":** each rip is a
  real **buy-and-burn of ~350 tokens**. The buyer must buy the tokens off the curve
  (RARE flows *into* the reserve, price ticks up), then the game **burns** them (supply
  falls, so the deeper reserve now backs *fewer* tokens → price ticks up again). Packs
  are the engine of the ratchet, not a spike.

**Two escalators, stacked** — packs get scarcer and dearer the deeper the game runs:

1. **Within a season** — `packPrice()` rises on a straight line from `packBase` (the
   season's first rip) to `packCeil` (its last), indexed by how much of the season's
   card budget has been ripped. S1: **350 → 525** tokens.
2. **Across seasons** — the field is burned **down** toward the 77-survivor deck, so
   each season issues **fewer cards**, so its **pack allotment** (= cards issued ÷ 7)
   **shrinks** and its **floor rises**. Reference schedule (`token-model.mjs` §4;
   curator-set at `openSeason`, recalibrated to the live token price):

| Season | Cards issued | Pack allotment | base → ceil (tok) | base ≈ $* | ceil ≈ $* |
|---|---|---|---|---|---|
| **I · Summer** (launch) | 70,000 | **10,000 packs** | 350 → 525 | **$7.00** | $10.50 |
| II · Fall | 52,500 | 7,500 packs | 450 → 675 | $9.00 | $13.50 |
| III · Winter | 35,000 | 5,000 packs | 600 → 900 | $12.00 | $18.00 |
| IV · Spring | 17,500 | 2,500 packs | 800 → 1,200 | $16.00 | $24.00 |

*\* priced at the **launch** spot ($0.02) — a conservative floor. Token appreciation
(the §4 column) rides on **top** of these, so real USD pack prices are higher again as
the curve fills.* When a season's allotment is spent, **`ripPack` closes for the
season** (`AllotmentSpent`) — the only cards left come off the secondary market, which
is the scarcity that lifts the floor into the next season.

**Contract surface** (`CardVault.sol`): `packPrice()` / `packsLeft()` (views),
`openSeason(season, cardBudget, base, ceil)` (sets the allotment + price line, resets
`cardsIssued`), `setPackPrice(base, ceil)` (mid-season recalibration), and the
`ripPack` gate `cardsIssued + 7 ≤ seasonCardBudget`. `CARDS_PER_PACK = 7`.

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

From `scripts/token-model.mjs` §5 — **bounded by the S1 allotment (10,000 packs)**;
scenarios are the fraction of that allotment sold. Transparent inputs, **not a
forecast**. Packs now dominate burn (a rip destroys ~437 tokens, ~48× the old 9):

| scenario | packs sold | pack 🔥 | play 🔥 | cull 🔥 | total 🔥/season |
|---|---|---|---|---|---|
| QUIET (30%) | 3,000 | 1,309,500 | 18,000 | 10,500 | **1,338,000** (0.44× cap) |
| STEADY (70%) | 7,000 | 3,055,500 | 42,000 | 26,250 | **3,123,750** (1.03× cap) |
| SELLOUT (100%) | 10,000 | 4,365,000 | 60,000 | 41,650 | **4,466,650** (1.47× cap) |

**Read this correctly:** net supply change = **buys − burns** (sign *indeterminate*).
Burns are downward **pressure**; "deflation" holds only while buy-demand < burn-demand
— it is not a guaranteed permanent decline. A sold-out season **cycling ~1.4× the cap
through burns** is exactly the proof that the cap refills (§2): buys re-mint into the
gap, so the curve churns and the reserve climbs — that churn *is* the steady upward
pressure. Read the real net trajectory live from `totalSupply()`.

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
rare liquid-edition deploy multicurve "upperdeckripmaster3030" "UR3030" \
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
6. **Chain choice** — the **micro-tolls** (a 1-token send ≈ $0.02, votes, trades) are
   **gas-dominated on L1** ($1–5/tx swamps a $0.02 toll). The $7 pack survives L1 gas,
   but moment-to-moment play does not. **Deploy on an L2** (or batch actions) or the
   cheap-move layer breaks.

---

## 9. Doc corrections applied

- Removed the erroneous "0.5–1 RARE per **100** `$UR3030`" peg (implied a ~$0.001
  pack). The peg is **~1 RARE per token**; the pack is a **~350-token bundle ≈ $7**
  (§4a), escalating within and across seasons.
- **Pack repriced $0.20 → $7** as a *bundle size*, not a token reprice — the token
  stays cheap and FDV stays $606k (§4a). Packs are now the biggest single burn.
- Reframed the "runway / % of cap consumed" framing as **burn *pressure* / demand to
  hold the float flat** — the cap is not a fuel tank.
- Creator-cut "floor" removed (see §7).

*Everything here is tunable on-chain via the curator setters; only the cap and the
curve are locked at deploy. Re-run `scripts/token-model.mjs` after any change.*

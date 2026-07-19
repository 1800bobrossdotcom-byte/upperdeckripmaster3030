# $UR3030 — token math: supply, burn costs, liquidity, endpoints

The numbers behind the game economy, and the strategy for pricing what things cost
to burn. Grounded in what SuperRare's Liquid Editions actually expose (help.superrare.com,
rare.xyz/docs, the liquid-editions-starter-kit, and our `contracts/interfaces/ILiquid.sol`),
then applied to Upperdeck Ripmaster 3030. Pairs with `docs/ARTIST-INTAKE.md` Part 3.

> **Not financial advice.** `$UR3030` is an experimental, volatile crypto token.
> These are design parameters, not promises. The exact curve schedule must be read
> off the deployed contract with `--preview` / `getMarketState` before mainnet.

---

## 0. TL;DR — the decisions

| Knob | Decision | Why |
|---|---|---|
| Supply | **Capped, 3,030,000 `$UR3030`** | thematic (3030); capped + burn-heavy = provable per-season deflation |
| Curve | multicurve, `--curve-preset medium-demand` | SuperRare preset; preview + tune before deploy |
| Reserve / quote | **RARE** | the pool is seeded and priced in RARE (per TESTNET.md) |
| Opening price target | **≈ 0.5–1 RARE / 100 `$UR3030`** | makes the base 1-token toll a real micro-cost |
| Toll denomination | **fixed in `$UR3030`** (not repegged per-tx) | predictable, gas-cheap; fiat cost rises as the token appreciates (intended) |
| Token routing | burn (most) · creator cut (upvote/HODL) · house pool (bounty) | see §4 — "no treasury" with two transparent exceptions |

---

## 1. Supply & the curve

Liquid Editions are an **ERC-20 on a multicurve bonding curve**, supply **fixed at
launch** (the curve's parameters — and therefore its max supply — are set at deploy
and immutable). We choose:

- **`maxTotalSupply` = 3,030,000 `$UR3030`** (18 decimals). Capped, so
  `burnProgress = maxTotalSupply − totalSupply()` is a real, monotonic burn meter
  the render reads (a wax seal that only ever melts).
- **Curve preset:** `medium-demand`. Deploy-preview it first — never blind:
  ```bash
  rare liquid-edition deploy multicurve "Upperdeck Ripmaster 3030" "UR3030" \
    --curve-preset medium-demand --preview
  ```
  `--preview` prints the price-vs-supply schedule; confirm the opening price and the
  price at, say, 10% / 50% / 100% of cap land where we want before deploying for real.
- **Reserve currency: RARE.** Buys deposit RARE into the pool and mint `$UR3030`
  along the curve; sells burn `$UR3030` and return RARE. The pool *is* the market —
  there is no order book and no auction.

**Circulating vs minted vs burned.** Tokens are minted on *buy* and destroyed on
*game burns*. Circulating = minted − burned. Burns don't lower the cap; they pull
`totalSupply` below what's been bought, which (a) advances `burnProgress` and (b),
against a fixed curve, means the same RARE demand clears fewer tokens → upward price
pressure. Activity is deflation.

---

## 2. The burn/spend schedule (all values in `$UR3030`)

Every game action's toll, as set in `CardVault.sol` (curator-tunable). "→" shows
where the tokens go: 🔥 burn · 🎨 creator · 🏦 house reward pool.

| Action | Toll | → |
|---|---|---|
| `sendCard` (gift) | **1** | 🔥 |
| `trade` (swap) | **1 / side** (2) | 🔥 |
| `openMatch`/`joinMatch` (wager) | **2 / side** (4) | 🔥 |
| `ripPack` (7 cards) | **10** (9 🔥 + **1 🏦**) | 🔥/🏦 |
| `voteRarity` up (promote) | vote `amt` | 🎨 |
| `voteRarity` down (demote) | vote `amt` | 🔥 |
| `voteHodl` (⛨ anchor) | vote `amt` | 🎨 |
| `destroyEdition` | **50** + all copies | 🔥 |
| last-standing reward (paid out) | `lastStandingReward` = **50** | 🏦 → keeper |
| marquee transfer | **25** | 🔥 |

**Rarity-court step costs** (conviction to move a card one tier, up or down):

| Step | Cost |
|---|---|
| Common ↔ Uncommon | **50** |
| Uncommon ↔ Rare | **150** |
| Rare ↔ Mythic | **500** |
| Mythic ↔ Prizm | **2,000** |

Climbing all the way Common → Prizm burns/pays **2,700** total; the same to grief
one back down. These are deliberately steep — tier moves are supposed to be a
community effort, and retiring a card also needs a **quorum of 5 distinct
downvoters** on top of the conviction.

**Sizing logic (why these numbers).** The base unit is the **1-token send toll**.
Everything else is a small multiple of it:
- casual actions (send/trade/wager) = 1–4 — friction, not a wall.
- a pack rip = 10 — a "purchase," and the one action that *seeds* the bounty.
- destroying an edition = 50 + torching the cards — a real, expensive endgame move.
- moving rarity = 50 → 2,000 by tier — climbing the top costs what earning it did.

Against a 3,030,000 cap, one pack rip burns ~0.0003% of supply; the economy only
deflates through **volume**, which is the point — thousands of small burns, not a
few big ones.

---

## 3. Pricing strategy — what a burn should *cost*

Two ways to keep tolls sane as the token's price floats:

**A. Fixed-in-token (recommended, shipped).** Tolls are constants in `$UR3030`.
Simple, gas-cheap, predictable for players ("a pack is always 10"). The *fiat* cost
of a pack rises if `$UR3030` appreciates — which is fine and even desirable (early
players get cheap plays; the sink tightens as the token matters more). Pick the
**opening price** so 1 `$UR3030` ≈ a few cents, i.e. a 10-token pack ≈ US$0.10–0.50
at launch. Read the opening price off `--preview` and tune the curve/reserve to hit
that band.

**B. Price-pegged (optional, future).** Have the curator periodically call
`setTolls` from an off-chain keeper that reads live price via `getMarketState`
(§6) and rescales tolls to hold a *target fiat cost*. More complex, needs a trusted
updater, and makes costs unpredictable — only worth it if the token moves violently.
We ship **A** and keep **B** as a lever (`setTolls`/`setDestroyToll`/`setReward`
exist).

**Peg target to write down for SuperRare:** opening ≈ **0.5–1 RARE per 100
`$UR3030`**. At that band the whole toll table above lands between "a few cents" and
"a couple dollars," which is where a game economy wants to be.

---

## 4. Where the tokens go — "no treasury," with two honest exceptions

The original one-rule copy said *every* move burns and supply only goes down. The
current design is a **split economy** — still no operator fee-wallet, but two
transparent, on-chain flows exist:

1. **🔥 Burn** — send, trade, wager, rip (90%), downvote, destroy, marquee. Destroyed
   forever; this is the deflation.
2. **🎨 Creator cut** — upvotes and HODL transfer to the **creator** wallet (a
   transparent artist royalty on constructive conviction). Not burned, not pooled by
   an operator — it's the artist being paid when people champion their cards.
3. **🏦 House reward pool** — 1 of every 10-token pack rip (plus voluntary
   `fundReward`) accrues to a bounty the contract holds, and pays the keeper who
   ends an edition (`min(rewardPool, lastStandingReward)`), alongside their Ash
   Trophy. A **player-to-player bounty**, not a treasury: packs (adding cards) fund
   the reward for culling cards back down.

Net supply still trends **down** over a season (burns ≫ the small pooled/creator
slices), so the deflation story holds — it's just not literally "100% of every
token burns." Site copy should say so (see coherency notes).

---

## 5. How to add liquidity

On a Liquid Edition the **curve is the liquidity** — every buy/sell routes through
the RARE-backed pool, so there's always a price and always a counterparty (the
pool). Three levers:

1. **Seed the reserve at deploy.** The pool needs RARE behind it. Fund the deploying
   wallet with RARE (Sepolia RARE for the rehearsal; mainnet RARE for launch) so the
   opening curve has depth — thin reserve = jumpy price on small buys. Ask the cohort
   (@im_jonooo) how much RARE they recommend seeding for a `medium-demand` cap of
   3,030,000.
2. **Buy-and-hold deepens it.** Because buys deposit RARE into the reserve, genuine
   demand *is* added liquidity — the reserve grows as people buy in. No separate LP
   position to manage.
3. **Optional secondary DEX pool (post-launch).** If `$UR3030` is freely
   transferable, a Uniswap v3 `$UR3030`/RARE (or /ETH) pool can add secondary depth
   and price discovery outside the curve. Not required for v1 and not something to
   promise — the curve alone is a complete market. If we do it, seed a modest LP and
   let arbitrage keep it aligned with the curve.

**Do not** route game burns through the liquidity pool — burns call `token.burn()`
and permanently remove tokens; they are separate from the buy/sell reserve.

---

## 6. Endpoints & reads we use (the pricing/render surface)

What the game and the render contract actually call. From `ILiquid` (our
`contracts/interfaces/ILiquid.sol`, mirroring the starter kit) + the Rare CLI.

**On-chain reads (ILiquid / IERC20):**
- `getMarketState() → (rarePerToken, tokenPerRare, sqrtPriceX96, currentTick, liquidity, currentSupply)`
  — the price + pool snapshot. `rarePerToken` is the live price (drives foil heat,
  the toll-peg keeper in strategy B, and any "market weather" render). `liquidity`
  is pool depth. `currentSupply` + `maxTotalSupply()` give burn progress.
- `maxTotalSupply() → uint256` — the cap.
- `totalSupply()` (IERC20) — circulating; `burnProgress = maxTotalSupply − totalSupply`.
- `balanceOf(addr)` — holder weight (for holder-gated visuals/tiers).
- `burn(amount)` — the only sink; `CardVault._burnToll` calls it.

**Our game reads (CardVault):** `rarityNet(id)`, `hodlBuffer(id)`, `retired(id)`,
`supplyOf(id)`, `downvoterCount(id)`, `rewardPool`, `trophyEdition(id)` — the render
turns these into living provenance on each card back.

**Ballot read (SeasonBallot):** `burnProgress()` / `tally(...)` / `winners()` — the
season lock + burn meter.

**Rare CLI (deploy + wiring):**
```bash
rare liquid-edition deploy multicurve "Upperdeck Ripmaster 3030" "UR3030" \
  --curve-preset medium-demand --description "…" --image ./cards/art/<hero>.png [--preview]
rare liquid-edition status            --contract 0x…      # pool/price/supply
rare liquid-edition token-uri         --contract 0x…      # what the render returns
rare liquid-edition set-render-contract --contract 0x… --render-contract 0x…
```
Mainnet Liquid-Edition **factory**: `0x25f993C222fE5e891128a782A5168f1C78629540`.
`rare mcp serve` exposes all of this over MCP (can drive deploys/status directly).

**Pricing strategy hook:** the render reads `getMarketState().rarePerToken` at
metadata-fetch time → the foil/market-weather is *real* price, not the gas proxy we
fake today. If we ever switch to price-pegged tolls (strategy B), the same read
feeds the keeper that rescales `setTolls`.

---

## 7. Worked example — what one season burns

Rough order-of-magnitude for a modestly active season (illustrative, not a forecast):

- **Culling 119 cards** (196 → 77): retiring a card averages, say, ~300 `$UR3030`
  of downvote conviction + some destroys → ~**35,000** burned.
- **Pack rips:** 1,000 players × 8 packs × 10 = 80,000 → **72,000 🔥** + **8,000 🏦**.
- **Arena + trades + sends:** 20,000 actions × ~2 avg → ~**40,000** burned.
- **Upvotes/HODL (to creator):** say ~15,000 → **15,000 🎨**.

≈ **147,000 burned**, ~**8,000** to the house bounty, ~**15,000** to the creator in
one season — ~**5% of a 3,030,000 cap** destroyed per active season, i.e. the float
provably tightens each cycle while the reserve (from buys) can keep growing. Tune
the cap up if you expect much heavier play; tune tolls with `setTolls` if the fiat
cost drifts.

---

*Confirm the `medium-demand` schedule with `--preview`, and the recommended RARE
seed with the cohort, before mainnet. Everything here is tunable on-chain via the
curator setters — nothing is locked but the cap and the curve.*

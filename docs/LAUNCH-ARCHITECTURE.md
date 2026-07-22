# Launch Architecture — $UR3030 (model v2.2)

*The on-chain shape of the launch. Companion to **`docs/ECONOMIC-FLOW.md`** (the
canonical economics) — this doc covers the contracts and what is / isn't on-chain.*

---

## The whole stack — two contract surfaces

1. **`$UR3030` — one ERC-20 SuperRare Liquid Edition.** Minted once into a Uniswap-v4 +
   Doppler multicurve pool (reserve in RARE). Cap **3,030,000**, opens **~1 RARE/token**.
   Burns are **permanent** (never re-mint). It is the currency *and* the burn meter
   (`burnProgress = maxTotalSupply − totalSupply`). Deployed by SuperRare's audited
   factory via the Rare CLI — **not our code**.

2. **One combined renderer + ERC-721 lens contract.** Every card is a **lens** — a render
   **keyed by card id** that reads the live market + burn. A card is a live lens *before*
   any token is minted for it, so the deck exists as art from day one. **No ERC-1155
   anywhere.** (`contracts/UR3030RenderPrototype.sol` is the token's own market renderer;
   the card-lens contract is the Phase-2 build, assisted-setup or self-deployed via CLI —
   see the open question below.)

That's it. No game contract, no fee wallet, no treasury, no side ballot contract.
(`contracts/CardVault.sol` — an old ERC-1155 game design — is **retired**, kept only for
history. `contracts/SeasonBallot.sol` — a clean burn-to-vote 721 seeder — is optional.)

## The 100-card deck (art hand-made by the artist; current site art is placeholder)

| Layer | Count | On-chain state |
|---|---|---|
| **Hero lenses** | **33** | **minted 1/1 ERC-721** now — 11 gacha (pull a pack claim → mint) + 22 earned (win a game title → signed voucher → mint) |
| **Field cards** | **67** | **render-only lens** (chain-readable via CLI, **0 mints**); mintable **later** on the *same* lens contract, so they stay lenses |
| **Lovebeing** | +1 | **holder-bound lens** — every `$UR3030` holder resolves it, one per wallet, non-transferable, non-burnable. Zero per-person mints |

**Minting = render-only → +ownership.** A lens is the render; minting only *attaches a
token*. That is why field cards can be render-only today (**B**) and minted later (**C**)
without their art logic ever changing.

## What is on-chain vs. site-layer

- **On-chain (real):** the `$UR3030` buy + **burn** (packs, conviction), and the **33
  hero-lens mints** (wallet-signed 721). This is the audited-real surface.
- **Site-layer (labeled prototype):** field-card pulls (render-only lenses), the binder,
  rarity-court votes, wagers, and card-powers. Field cards mint for real in a later phase.

## The burn — token deflation, not card death

Packs are the **only** burn: a site-guided buy of `$UR3030` off the curve, burned in full.
Over the deck's four-season life, ~**3,560 packs** (S1 1,600 → S4 260) burn **≈2,020,000
(⅔ of the cap)**, settling supply at a **~1,010,000 floor** — a **≈3× permanent
contraction**. **Cards never retire or ash.** Scarcity is dwindling pack allotments +
community rarity votes + voluntary compression (corner every copy of a field card → a 1/1;
the card survives). The pack count is bounded by the **burn budget, not card supply**.

## Wallet & mint mechanics

- Buying/burning a pack and minting a hero lens **require a connected, signing wallet** —
  the site can never mint for you or move your tokens.
- Field-card pulls and game practice are **walletless** (site-layer prototype).
- **Lovebeing** needs a wallet **connected to read** your holding — no mint.

## Games

Token antes are **wagers** (net-zero) — **1v1** the winner takes the pot + the loser's
staked cards; **multiplayer (3+)** pays the **podium (1st 50% / 2nd 30% / 3rd 20%**, cards
to 1st). Staked cards **transfer**, never burned. Card → in-game power is live
(`js/card-powers.js`). The **22 earned hero lenses** are won as one-of-a-kind **Season-1**
game titles (12 cabinet titles + 6 first-blood feats + 4 grand titles).

**The 33 hero lenses are a Season-1 genesis set** — established at launch and **persisting
through all four seasons**; no new special cards mint after S1. Seasons 2–4 continue the
field-card packs and the token burn-down only.

## Open ⏳ (needs SuperRare)

1. **Curve calibration** — open at ~1 RARE/token on 3,030,000 (`docs/CURVE-TARGET.md`).
2. **Lens setup** — does the **assisted 721 setup** support **render-by-id across 100
   card-lenses** (33 minted, 67 render-only), or do we deploy our **own combined
   renderer+721 lens contract** via the CLI? Either way it's 721.
3. **Mint mechanism** — a claim/voucher redeemer for the 11 gacha claims (pack burn) and
   the 22 earned vouchers (signed game titles).

*Reproduce every number: `node scripts/token-model.mjs`. Canonical: `docs/ECONOMIC-FLOW.md`.*

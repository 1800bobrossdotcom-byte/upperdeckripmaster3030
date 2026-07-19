# Liquid Editions study + token economics answers

Grounded in SuperRare's own docs (help.superrare.com "Introduction to Liquid
Editions" and rare.xyz/docs), then applied to Upperdeck Ripmaster 3030. Short
version of what the protocol actually gives us, then straight answers to your
questions.

## What a Liquid Edition actually is (per SuperRare)

- It's an **ERC-20**, not a single NFT — "living, generative artworks" you own as
  fungible tokens.
- **Dynamic pricing from liquidity + demand.** You trade into/out of a liquidity
  pool (a multicurve bonding curve, chosen at deploy — we picked `medium-demand`
  in TESTNET.md). Price moves as people buy and sell; trades can fail on slippage
  if price moves first. There is no auction.
- **The art can respond to on-chain state** — token balances, trades, transfers,
  **burns**, supply, and pool activity.
- **Liquid Lens** = an optional connected **ERC-721** layer whose **HTML render**
  interprets the ERC-20's market state and draws "dynamic, interactive,
  generative" art — live price, trading activity, holder balances, custom rules.
- Artists point the edition at a **render contract** (`set-render-contract`); when
  metadata refreshes, the render logic produces updated artwork. HTML is
  explicitly called out as the powerful path because it can do what static images
  can't.

That last part matters a lot for us: **our card is already that HTML render.**
`cards/_full.html` reads gas/market and drives the foil `--heat`, tilt, and live
trigger. Porting that engine into a Liquid Lens render contract is the whole
"dynamic art" story — see §3.

---

## 1. How does $UR3030 gain value?

Three honest, separable forces — no promises, this is a volatile crypto asset:

1. **Curve mechanics (buy pressure).** On the bonding curve, buying pushes price
   up along the curve, selling pushes it down. More net buyers → higher price.
   Nothing game-specific — it's the pool.

2. **Deflation — the game is one giant sink.** *Every* action burns $UR3030 and
   there is no treasury or fee wallet catching it (CardVault enforces this): pack
   rips, wagers, sends, trades, the rarity court (▲/⛨/▼), and forging (§4) all
   pull tokens from the player and destroy them. Burning permanently shrinks
   supply; against a curve, a shrinking float means the same demand clears at a
   higher price. Activity itself is the deflation.

3. **Utility demand.** You cannot do *anything* without holding and spending the
   token — no free plays. Wanting to rip, battle, curate packs, or forge is a
   standing reason to acquire $UR3030. On top of that sits collectible pull: the
   1/1 marquee, the prizm chase, and the ability to *curate the deck itself* by
   voting (a reason to hold conviction, not just flip).

So: **price = pool demand + shrinking supply from burns + must-hold-to-play
utility + collectible/curation status.** Be clear-eyed — it can also go down; the
sinks help the floor, they don't guarantee it.

## 2. Does this token go to traditional (TradFi) markets?

**No.** $UR3030 is a crypto-native **ERC-20** living on SuperRare's protocol
(Ethereum / Base), traded through the **liquidity pool / bonding curve** and
DEX-style swaps (the CLI shows RARE/ETH/USDC pairings). It is **not** a stock,
not a registered security, and it does **not** list on the NYSE, Nasdaq, or any
traditional brokerage. The only "market" is on-chain.

Nuance worth knowing: a token *could* someday be listed on a centralized *crypto*
exchange (Coinbase/etc.) — that's still crypto rails, not TradFi, and not
something we control or should promise. Nothing here should be read as a security
offering or investment advice.

## 3. How do we apply Liquid Lenses to make our art dynamic?

We already have the render; we make it on-chain. The path:

1. **The card page IS the lens.** `cards/_full.html` already reads live chain
   state and drives the holographic foil heat, the tilt, and the trigger status.
   That's exactly what a Liquid Lens HTML render does.
2. **Build the render contract** from the starter kit's `LiquidLensHTMLExample`
   (TESTNET.md §4). It returns HTML metadata that reads:
   - the **ERC-20 market state** (`getMarketState()` on ILiquid) → price/supply →
     drives foil intensity, palette shift, "market weather."
   - `SeasonBallot.burnProgress()` → a wax-seal / burn meter that fills as the
     edition burns down.
   - `CardVault` reads → a card's **rarity-court net**, HODL buffer, battle W/L,
     times wagered, forge lineage → printed as living provenance on the back.
3. **`set-render-contract`** points the edition at it. Now every metadata refresh
   redraws the card from real state — the art literally evolves with the market
   and with how the community treats the card.

Concrete "art evolves" hooks we can ship into the lens:
- **Market weather** → foil hue/intensity from price + volatility (we fake this
  today with gas; swap to `getMarketState`).
- **Burn bloom** → the more the edition is burned, the more the frame chars /
  gilds / cracks (prizm crackle already exists — gate it on `burnProgress`).
- **Provenance patina** → battles won, times wagered, forge generation age the
  card visibly (a veteran card looks veteran).
- **Rarity shimmer** → a card the court is promoting glows warmer; one being
  demoted desaturates; a HODL-shielded card gets an anchor sigil.
- **Seasonal render swap** → point the edition at a new render each season
  (Bloom → Melt → Fractal → Void) so the whole deck re-skins on the calendar.

## 4. More ways the contract can interact + the art can evolve

Already in `CardVault.sol`: send, trade, pog-wager escrow, rip, the rarity court
(promote/demote/HODL), the sealed 1/1 marquee. New utility to add (each one a
fresh $UR3030 sink, i.e. more §1 pressure):

- **Forge / card creator** (LIVE at `cards/forge.html`, on-chain path in
  `CardVault.forge()`): add 2-3 owned cards as **layers**, then sculpt — drag /
  scale, pick a **blend mode**, and **key out a color** (eyedrop the art to punch
  it transparent so a layer beneath shows through) before framing and minting.
  The consumed inputs become **house cards** the vault holds/re-issues;
  `forgeInputs[newId]` records the lineage on chain while the composited art
  lives off-chain keyed by the id. Forged cards are first-class — playable in the
  arena and listable in the binder. New art from old art, real sink.
- **Binder + market** (LIVE at `cards/binder.html`): a nine-pocket collector
  folder with turning pages (owned cards, or the full-set checklist with unowned
  pockets ghosted) that doubles as the **marketplace** — list cards for sale or
  trade, or buy/trade the house's re-issued forge stock. Listings are a local
  order book that settles on-chain through the existing `trade`/`sendCard` burns
  (no treasury); every settle shrinks supply. See CARD-ECONOMY-SPEC §2.6.
- **Evolve / level a card** — `feed(id, amount)` burns tokens into a card to
  raise a cosmetic level the lens reads (more foil, more particles, a level pip).
  Pure art evolution driven by conviction.
- **Stake-to-curate** — lock $UR3030 behind a card to lend it standing in packs
  (soft version of HODL that returns the stake).
- **Burn-to-reveal** — hidden variants that only render once a global burn
  threshold is crossed.
- **Provenance feed** — every event (`CardSent`/`MatchResolved`/`PackRipped`/
  `RarityShifted`/forge) is already emitted; the lens turns them into the living
  dossier on the back.

None of these need a treasury — they're all burns, which is the point.

---

*Not financial advice. $UR3030 is an experimental, volatile crypto token with no
promise of value. Play with what you can afford to burn.*

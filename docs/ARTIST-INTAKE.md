# Liquid Editions — Artist Intake & Launch Agreement (final)

Copy-paste-ready answers for the SuperRare *Liquid Editions: Artist Intake & Launch
Agreement*, for the game as it stands (196-card field → 77-survivor burn-down, rarity
court, arena, 1/1 marquee, Ash Trophies, creator cut + house reward pool). Tokenomics
in Part 3 are finalized in `docs/TOKEN-MATH.md`. Fields only the artist can supply are
flagged **[ARTIST TO SUPPLY]**.

- **Artist / Project:** Gianni Arone — *Upperdeck Ripmaster 3030*
- **Token:** `$UR3030` · **Site:** https://upperdeckripmaster3030.com
- **X / handle:** **[ARTIST TO SUPPLY]** · **Launch date:** **[ARTIST TO SUPPLY]**

---

## Part 1 — The Collector Proposition

**Core Concept**

> Upperdeck Ripmaster 3030 is a liquid trading-card game: a full field of psychedelic
> hyperfoil cards opens each season, and the community plays it down to a standard deck
> of 77 survivors by burning the rest. Every card is a live SuperRare Liquid Edition
> denominated in RARE; the token `$UR3030` is the currency you rip packs, cast votes,
> wager, and settle disputes with. It's a card game whose scoreboard is on-chain and
> whose losers actually leave the table.

**Mechanics**

> You rip a pack — **seven cards for about $7** in `$UR3030`, the one premium move — and
> pull the copies as ERC-1155 editions; nearly all of the price burns, a sliver seeds the
> house reward pool. From there the whole game is small on-chain moves: send a
> card (toll 1), trade it (1 a side), wager it (2 a side), marquee it to the top of the
> feed (25). Cards climb and fall through five rarity tiers — Common, Uncommon, Rare,
> Mythic, Prizm — in the rarity court, where moving a card **up pays its creator** and
> moving it **down burns** tokens (50 to 2,000 per tier step). When the field gets culled
> to 77, whoever lands the final blow on a dying edition collects the 50-token
> last-standing bounty and a soulbound **Ash Trophy**. The render reads live market state
> (`getMarketState`) and burn progress, so the art evolves with price and with how the
> community treats each card. Four seasons a year, on the calendar: Summer, Fall, Winter, Spring.

**Collector Value**

> There's no treasury and no team unlock — value comes from scarcity you can watch happen.
> Roughly 119 of the ~196 editions are retired every season, and the game is deflationary
> by construction: packs net-burn, tolls burn, downvotes burn, dead editions burn. Two
> flows stay transparent and go *to people*, not a pool: the **creator cut** (upvotes,
> HODL votes, tier-ups) and the **house bounty** (last-standing reward). Holding a survivor
> means holding one of 77 cards that outlived a field that no longer exists — and an Ash
> Trophy is a permanent, non-transferable receipt that you were the one who ended something.

---

## Part 2 — Deployment Path & Responsibilities

**☑ Path B: The CLI (Custom) Route.** We supply the custom front end (this card site —
gallery, arena, binder, rarity court), the custom renderer (the `_full.html` foil engine
ported to a Liquid Lens render contract), the game economy contract (`CardVault.sol`),
metadata, and full technical execution. **We acknowledge the support boundary:** SuperRare
provides the base protocol, indexing/whitelisting, and cohort splash-page support; QA and
bug-fixes for our custom renderer + front end are ours.

---

## Part 3 — Tokenomics & Structure

*(reasoning + reproducible model in `docs/TOKEN-MATH.md` / `scripts/token-model.mjs`)*

- **Target Launch Date:** **[ARTIST TO SUPPLY]** — after a full Sepolia dress rehearsal.
- **Total Token Supply / Cap:** **Capped — 3,030,000 `$UR3030`.** (Deliberately tight:
  the cap is a live-supply ceiling on the curve, not a burn budget; a bigger cap would
  flatten the chart. `burnProgress = maxTotalSupply − totalSupply()` is the render's burn
  meter. Full-curve FDV ≈ $606k — an artist-scale niche edition, by choice.)
- **Curve / Price:** multicurve **`--curve-preset medium-demand`** (Uniswap-v4 + Doppler,
  reserve in **RARE**), previewed with `--preview` and tuned to the **steadiest** slope.
  **Opening price ≈ 1 RARE/token (~$0.02)** — the token stays a cheap micro-token, so every
  toll and vote is a micro-move. **Reserve seed ≈ 10,000 RARE** at deploy.
- **Packs — the premium on-ramp (~$7, escalating).** A pack is a *bundle* of ~350 `$UR3030`
  ≈ **$7 at launch** (seven cards, ~$1 a card), **not** a token reprice — so FDV stays ~$606k.
  It rises two ways: **within** a season as the pack allotment (cards issued ÷ 7) is spent
  (`packPrice()` walks packBase→packCeil), and **across** seasons as the burning field issues
  fewer cards (S1 **10,000 packs** → S4 2,500; floor 350 → 800 tokens). Each rip is a real
  buy-and-burn of hundreds of tokens — the engine of steady upward pressure, not a pump.
- **ERC-721 "Lenses"? — Yes.** The card render is an HTML Liquid Lens reading live market
  + game state; the sealed **1/1 marquee** (Lovebeing) is its own lens. Per-card copies are
  `CardVault` ERC-1155 ids; Ash Trophies mint into id space 9000+. Edition sizes finalized
  with SuperRare during assisted setup.
- **Deploy on an L2** (or batch actions): the micro-tolls (1-token sends/votes) are
  gas-dominated on L1; the $7 pack survives L1 gas, but moment-to-moment play does not.

---

## Part 4 — Deliverables & Marketing Assets

| Ask | Ours |
|---|---|
| Artist / Project Name | Gianni Arone — Upperdeck Ripmaster 3030 |
| Artist X handle | **[ARTIST TO SUPPLY]** |
| Mint page / front-end URL | https://upperdeckripmaster3030.com |
| Render contract address | **[0x… after Sepolia deploy]** |
| Hero image/video | screen-capture of a prizm card tilting under live foil (the site *is* the demo) |
| Mechanics explainer | the storyboard below |
| Artist backstory | the 152-word piece below |
| Social drafts | the three tweets below |
| Drive link | **[ARTIST TO SUPPLY]** |

### Artist backstory ("why liquid") — 152 words

> I've been painting cards that don't exist for games nobody's played for about fifteen
> years. Hyperfoil monsters, prizm-tier freaks, whole decks I'd finish and file away,
> because a trading card only means something when it's in a pile of other cards with
> stakes on the table. Static NFTs never fixed that. You'd mint a thing, it'd sit in a
> wallet, and the "game" was just watching a number. Dead art in a nice frame.
>
> Liquid Editions are the first format where the card is *alive* — priced by a curve,
> played by a crowd, and able to actually die. That last part is why I'm here. Ripmaster
> is built to burn: a full field opens, the community rips it down to 77, and the rest
> turn to ash you can hold. I wanted a card game where losing is real and permanent.
> Liquid is the only medium that lets a card lose.

*[ARTIST TO SUPPLY: any personal detail to swap in — city, prior projects, the card/deck that started this.]*

### Mechanics explainer (storyboard, 6 beats — ~45–60s video or one scrollable diagram)

1. **THE FIELD OPENS.** A season banner drops (SUMMER); ~196 hyperfoil cards fan out,
   shimmering, RARE prices flickering. → *"Every season, the whole field wakes up. 196
   living cards, each its own liquid edition."*
2. **YOU RIP.** A hand tears a pack; a fat stack of `$UR3030` flies in (~$7 worth) — most
   dissolves to smoke, a sliver drops into a glowing HOUSE POOL jar; seven copies spill
   out. → *"Rip a pack — seven cards, about seven bucks. Nearly all of it burns. A sliver
   seeds the bounty."*
3. **YOU PLAY.** Montage — send / trade / wager / marquee, tiny toll numbers popping. →
   *"Send it, trade it, wager it, marquee it. Small moves, all on-chain."*
4. **THE COURT.** A card climbs Common → Prizm; up, coins flow to the artist; down, coins
   combust. → *"The crowd promotes and demotes. Up pays the creator. Down burns."*
5. **BURN IT DOWN TO 77.** The 196 collapse card by card into embers until 77 remain. →
   *"Then we cull. ~119 editions retired. A 196-card field becomes a 77-card deck."*
6. **ASH & SURVIVORS.** The final kill stamps a soulbound Ash Trophy + 50-token bounty; the
   77 lock into a STANDARD DECK frame; SUMMER → FALL. → *"Land the final blow, keep the ash.
   Hold a survivor, hold 1 of 77."*

### Launch tweets (3 — X handle + link **[ARTIST TO SUPPLY]**)

> **1 — hook.** A full field of psychedelic hyperfoil cards just went liquid. Upperdeck
> Ripmaster 3030 by Gianni Arone: 196 living editions, and the community burns it down to a
> deck of 77. The losers don't get delisted — they turn to ash. `$UR3030` → **[link + @handle]**

> **2 — mechanic.** Rip a pack — seven cards, ~$7. Nearly all of it burns; a sliver seeds
> the bounty. Play your cards up the rarity court — Common to Prizm. Then help cull the
> field to 77 survivors. Land the final blow on a dying edition and keep a soulbound Ash
> Trophy. Forever. Season 1: SUMMER. **[date]**

> **3 — ethos.** No treasury. No team unlock. No pump. Just a card game where losing is
> real: ~119 editions retired every season, burns all the way down, two clean flows — one
> to creators, one to whoever ends the fight. Live on SuperRare Liquid Editions. Come rip. **[link]**

---

## Part 5 — Sign-Off

> By signing I agree to the Part 2 technical responsibilities (custom renderer + front end
> are ours), the Part 3 tokenomics, and the deliverable deadlines.

Artist Signature / Typed Name: **Gianni Arone** ___________________________  Date: ________

---

*Not financial advice. `$UR3030` is an experimental, volatile crypto token with no promise
of value.*

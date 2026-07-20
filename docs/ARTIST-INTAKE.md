# Liquid Editions — Artist Intake & Launch Agreement (final)

Copy-paste-ready answers for the SuperRare *Liquid Editions: Artist Intake & Launch
Agreement*, for the game as it stands (196-card field → 77-survivor burn-down, rarity
court, arena, 1/1 marquee, Ash Trophies, creator cut + house reward pool). Tokenomics
in Part 3 are finalized in `docs/TOKEN-MATH.md`. Fields only the artist can supply are
flagged **[ARTIST TO SUPPLY]**.

- **Artist / Project:** Gianni Arone (**lovebeing**) — *upperdeckripmaster3030*
- **Token:** `$UR3030` · **Site:** https://upperdeckripmaster3030.com
- **X / handle:** **@_lovebeing_** · **Launch date:** **[ARTIST TO SUPPLY]**
- **Cohort:** SuperRare **Liquid Editions — Cohort 1** (with @CreamyDreamy, @takenstheorem, @tyaagnliu)

---

## Part 1 — The Collector Proposition

**Core Concept**

> upperdeckripmaster3030 is a liquid trading-card game: a full field of psychedelic
> hyperfoil cards opens each season, and the community plays it down to a standard deck
> of 77 survivors by burning the rest. Every card is a live SuperRare Liquid Edition
> denominated in RARE; the token `$UR3030` is the currency you rip packs, cast votes,
> wager, and settle disputes with. It's a card game whose scoreboard is on-chain and
> whose losers actually leave the table.

**Mechanics**

> The whole 196-card deck is the **artwork of one Liquid Edition** — no side contracts.
> You rip a pack — **seven cards for about $7** — by buying ~350 `$UR3030` on the curve
> and **burning it in full**; your pulls derive from your burn tx, your collection is
> your on-chain rip history. The field is culled by a **published burn-milestone
> schedule**: every time cumulative burn crosses the next milestone, the next card in
> the weakest-first retirement queue turns to ash in the render — 119 milestones,
> escalating (first card ~8k burned, the last at 2,020,025 ≈ ⅔ of the mint burned
> over the field's multi-season life — mint-once, burns are permanent), until a
> standard deck of **77 survivors** locks in. At season end those
> survivors mint as a **Companion 721 Lens Collection** (assisted setup): each is a
> **collectible lens edition sized to its holders** — the tradeable playable deck.
> A **1/1** is always *earned* — corner a card's whole claim set (survivor or retired)
> and **compress** it (one last burn) into a single 1/1; uncornered retirees stay ash,
> final blows earn Ash-Trophy lenses, and cards that survive into later seasons accrue
> **provenance and stronger stats**. The rarity court, arena, and binder run site-side
> as signal; **burns are the consensus**. The render reads live market state
> (`getMarketState`) and burn progress, so the art evolves with price and with the fire.
> Four seasons a year, on the calendar: Summer, Fall, Winter, Spring.

**Collector Value**

> There's no treasury, no team unlock, no fee wallet — and at launch there is no other
> contract for one to hide in. Value comes from scarcity you can watch happen: every pack
> is a **full buy-and-burn**, 119 of the 196 cards retire on the published milestone
> schedule, and the render grays them to ash in real time. Holding into season end means
> holding a claim on the **survivor lenses** — one of 77 cards that outlived a field that
> no longer exists — and an Ash-Trophy lens is a permanent receipt that your burn was the
> one that ended something.

---

## Part 2 — Deployment Path & Responsibilities

**☑ Path B: The CLI (Custom) Route.** We deploy **one Liquid Edition** (the ERC-20
multicurve) and supply the custom front end (this card site — gallery, arena, binder,
rarity court), the custom **render contract** (the `_full.html` foil engine reading
market state + burn progress, driving the milestone burn-down), metadata, and full
technical execution. The optional **Companion 721 Lens Collection** (survivors, Ash
Trophies, the sealed 1/1) goes through SuperRare's assisted setup. **No other
contracts.** **We acknowledge the support boundary:** SuperRare provides the base
protocol, indexing/whitelisting, and cohort splash-page support; QA and bug-fixes for
our custom renderer + front end are ours.

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
- **Packs — the premium ritual (~$7, escalating).** A pack is a **site-guided buy of
  ~350 `$UR3030` on the curve, burned in full** — native ILiquid operations, no side
  contract. ≈ **$7 at launch** (seven cards, ~$1 a card), **not** a token reprice — so
  FDV stays ~$606k. The schedule escalates **within** a season (base→ceil as the
  allotment sells) and **across** seasons (the burning field shrinks the allotment:
  S1 **1,600 packs** → S4 260; floor 350 → 800 tokens; provisional, co-designed with
  SuperRare), enforced by the site and auditable from the burn txs. Each rip is real
  buy-and-burn — steady pressure, not a pump.
- **The burn-down = burn milestones.** A published weakest-first retirement queue
  (`cards/data/_milestones.json`); each time cumulative burn crosses the next milestone
  the next card turns to ash in the render — first at ~8k burned, all 119 at 2,020,025
  (⅔ of the 3,030,000 mint, burned over the field's life; burns are permanent, so
  supply settles at a ~1,009,975 floor). 77 survive.
- **ERC-721 "Lenses"? — Yes.** The render contract is the HTML foil engine reading live
  market state + burn progress; the sealed **1/1 marquee** — *Lovebeing*, the artist's
  own name — is its own lens. At season end the **77 survivors** and the **Ash-Trophy
  honors** mint as the Companion 721 Lens Collection; scope finalized with SuperRare
  during assisted setup.
- **Deploy on an L2** (or batch): a $7 buy+burn survives L1 gas, but frequent small
  rips and community burns breathe easier on an L2 — decide with the cohort.

---

## Part 4 — Deliverables & Marketing Assets

| Ask | Ours |
|---|---|
| Artist / Project Name | Gianni Arone (lovebeing) — upperdeckripmaster3030 |
| Artist X handle | **@_lovebeing_** |
| Mint page / front-end URL | https://upperdeckripmaster3030.com |
| Render contract address | **[0x… after Sepolia deploy]** |
| Hero image/video | screen-capture of a prizm card tilting under live foil (the site *is* the demo) |
| Mechanics explainer | the storyboard below |
| Artist backstory | the ~185-word piece below |
| Social drafts | the three tweets below |
| Drive link | **[ARTIST TO SUPPLY]** |

### Artist backstory ("why liquid") — ~185 words

> I'm Gianni Arone — a multidisciplinary artist working as **lovebeing**, out of New York.
> For years I've moved between painting, silkscreen, zines, motion, sound, and code, all of
> it chasing the same feeling I've had since I was a kid. I grew up on trading cards, pogs,
> MAD magazine, and the backs of cereal boxes — the first memes, if you'll let me call them
> that. That's where I learned a picture could be a joke, a trophy, and a currency all at
> once: something you'd trade at recess and still guard with your life.
>
> Static NFTs never caught that. You'd mint a thing, it'd sit in a wallet, and the "game"
> was just watching a number. Liquid Editions are the first format where the card is
> *alive* — priced by a curve, played by a crowd, and able to win and to actually die.
> Ripmaster is that recess table rebuilt on-chain: a full field opens, the crowd plays it
> down to 77, and the rest turn to ash you can hold. I'm honored to build it in SuperRare's
> first Liquid Editions cohort — and the 1/1 at the top of the deck carries my name,
> *Lovebeing*.

*Optional personal swaps if you want them in: your city, a specific childhood set (the pogs/cards
that started it), or a nod to your cohort peers. The upbringing above is drawn from your own words.*

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

### Launch tweets (3 — from **@_lovebeing_**; link **[ARTIST TO SUPPLY]**)

> **1 — hook.** A full field of psychedelic hyperfoil cards just went liquid. Upperdeck
> Ripmaster 3030 by Gianni Arone (@_lovebeing_): 196 living editions, and the community burns it
> down to a deck of 77. The losers don't get delisted — they turn to ash. `$UR3030` → **[link]**

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

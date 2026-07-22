# Liquid Editions — Artist Intake & Launch Agreement (final)

Copy-paste-ready answers for the SuperRare *Liquid Editions: Artist Intake & Launch
Agreement*, for the game as it stands (**model v2.2** — 100-card deck of live ERC-721
lenses, 33 minted hero 1/1s + 67 render-only field cards + a holder-bound Lovebeing lens,
packs that burn the token, no card retirement). Tokenomics in Part 3 are reproducible in
`scripts/token-model.mjs`; canonical economics in `docs/ECONOMIC-FLOW.md`. Fields only the
artist can supply are flagged **[ARTIST TO SUPPLY]**.

- **Artist / Project:** Gianni Arone (**lovebeing**) — *upperdeckripmaster3030*
- **Token:** `$UR3030` · **Site:** https://upperdeckripmaster3030.com
- **X / handle:** **@_lovebeing_** · **Launch date:** **[ARTIST TO SUPPLY]**
- **Cohort:** SuperRare **Liquid Editions — Cohort 1** (with @CreamyDreamy, @takenstheorem, @tyaagnliu)

---

## Part 1 — The Collector Proposition

**Core Concept**

> upperdeckripmaster3030 is a liquid trading-card game built on **one** SuperRare Liquid
> Edition — the ERC-20 `$UR3030`, priced by a bonding curve in RARE. A **100-card deck**
> is the artwork, and **every card is a lens**: a render that reads the live market and
> the fire, so the art moves with price and with the burn. You rip packs, play the games,
> vote in the rarity court, and wager — and the token itself **burns down ≈3×** over the
> deck's life. It's a card game whose scoreboard is on-chain and whose token gets scarcer
> the more the crowd plays.

**Mechanics**

> **Every card is a lens keyed by its id on one combined renderer+721 contract** — a card
> is a live lens *before* any token is minted for it. The deck splits three ways:
> **33 hero cards** — a **Season-1 genesis set that persists through all four seasons** (no
> new special cards mint after S1) — mint as real **1/1 lenses**: **11 pulled from packs
> (gacha)** and **22 earned in the games** (each a one-of-a-kind title); the other **67 field cards** are
> **render-only lenses** (live and readable on-chain, unminted) that mint for real later on
> the *same* render; and **Lovebeing** — the artist's namesake — is a **holder-bound lens**
> every `$UR3030` holder carries (one per wallet, non-transferable, non-burnable).
>
> You **rip a pack** — ~350 `$UR3030` ≈ **$7**, **burned in full** — and pull field cards
> plus, rarely, a gacha lens claim. Packs are the only burn: over four seasons ~**3,560
> packs** retire **≈2,020,000 (⅔ of the mint)**, contracting supply from 3,030,000 to a
> **~1,010,000 floor** — a **3× permanent contraction**. **Cards never retire or ash** —
> the deck survives; scarcity comes from dwindling pack allotments, **community rarity
> votes** (the court moves a card up or down the ladder, never off the deck), and voluntary
> **compression** (own every copy of a field card → collapse it into a single 1/1; the card
> survives). The **games** (dogfight, rip rocketer, Section 9) are where the 22 hero lenses
> are earned and where your cards **arm** you — staked cards grant live, market-scaled
> power. Four seasons a year: Summer, Fall, Winter, Spring.

**Collector Value**

> No treasury, no team unlock, no fee wallet. Value is scarcity you can watch happen: every
> pack is a **full buy-and-burn**, the token deflates 3× across the deck's life, and the
> render reflects the fire live. The **33 hero lenses are 1/1s** — 11 you can only pull, 22
> you can only win — and every holder carries **Lovebeing**. A cornered field card
> **compresses** into a 1/1; the on-chain footprint stays deliberately tiny (33 mints), so
> a lens means something.

---

## Part 2 — Deployment Path & Responsibilities

**☑ Path B: The CLI (Custom) Route.** We deploy **one Liquid Edition** (the ERC-20
multicurve) and supply the custom front end (this card site — gallery, games, arena,
binder, rarity court), and the **combined renderer + ERC-721 lens contract** (the foil
engine reading market state + burn progress, keyed per card id), metadata, and full
technical execution. **No ERC-1155, no side game contract.** The lens layer — **33 hero
1/1 mints now + 67 field mints later + the holder-bound Lovebeing lens** — is either the
assisted **Companion 721 setup** or our own CLI-deployed renderer+721 lens contract (open
question below). **We acknowledge the support boundary:** SuperRare provides the base
protocol, indexing/whitelisting, and cohort splash-page support; QA and bug-fixes for our
custom renderer + front end are ours.

---

## Part 3 — Tokenomics & Structure

*(reasoning + reproducible model in `scripts/token-model.mjs`; canonical `docs/ECONOMIC-FLOW.md`)*

- **Target Launch Date:** **[ARTIST TO SUPPLY]** — after a full Sepolia dress rehearsal.
- **Total Token Supply / Cap:** **Capped — 3,030,000 `$UR3030`, minted once.** Burns are
  **permanent** (never re-mint). `burnProgress = maxTotalSupply − totalSupply()` is the
  render's burn meter. Full-curve FDV ≈ $606k — an artist-scale niche edition, by choice.
- **Curve / Price:** multicurve **`--curve-preset medium-demand`** (Uniswap-v4 + Doppler,
  reserve in **RARE**), previewed with `--preview` and tuned to the **steadiest** slope.
  **Opening price ≈ 1 RARE/token (~$0.02)** — the token stays a cheap micro-token.
  **Reserve seed ≈ 10,000 RARE** at deploy (to confirm with the cohort).
- **Packs — the premium ritual (~$7, escalating).** A pack is a **site-guided buy of ~350
  `$UR3030` on the curve, burned in full** — native ILiquid operations, no side contract.
  ≈ **$7 at launch** (seven cards), **not** a token reprice (FDV stays ~$606k). The schedule
  escalates **within** a season (base→ceil as the allotment sells) and **across** seasons:
  **S1 1,600 → S2 1,100 → S3 600 → S4 260 packs** (~3,560 total; floor 350 → ~1,200 tokens).
  The pack count is bounded by the **burn budget (~2,020,000, ⅔ cap)**, not card supply.
- **The burn-down = TOKEN deflation (no card death).** Over the deck's four-season life,
  pack burns retire **≈2,020,000 (⅔ of the mint)**; supply settles at a **~1,010,000
  floor** (**3× contraction**). Cards do **not** retire or ash — scarcity is dwindling
  allotments + rarity votes + compression.
- **ERC-721 "Lenses"? — Yes, and it's the whole card layer.** One combined renderer+721
  contract: **33 hero 1/1s** minted now (**11 gacha** pack claims + **22 earned** game
  titles), **67 render-only field cards** (mintable later on the same render), and the
  **holder-bound 1/1 marquee — *Lovebeing*** (every holder carries one). Scope finalized
  with SuperRare during assisted setup, or self-deployed via the CLI.
- **Games are wagers, net-zero.** Token antes **transfer** (they do not burn): **1v1** the
  winner takes the pot + the loser's staked cards; **multiplayer (3+)** pays the **podium —
  1st 50% / 2nd 30% / 3rd 20%** of the pot (4th+ forfeit their ante), staked cards to 1st.
  Net-zero to supply; the burn-down stays driven only by packs.
- **Deploy on an L2** (or batch): a $7 buy+burn survives L1 gas, but frequent small rips
  and community burns breathe easier on an L2 — decide with the cohort.

---

## Part 4 — Deliverables & Marketing Assets

| Ask | Ours |
|---|---|
| Artist / Project Name | Gianni Arone (lovebeing) — upperdeckripmaster3030 |
| Artist X handle | **@_lovebeing_** |
| Mint page / front-end URL | https://upperdeckripmaster3030.com |
| Render / lens contract address | **[0x… after Sepolia deploy]** |
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
> *alive* — priced by a curve, played by a crowd, a living lens over the market. Ripmaster
> is that recess table rebuilt on-chain: a full field of 100 living lenses, a token that
> burns down 3× while the deck survives, and hero cards you earn or pull and mint as real
> 1/1s. I'm honored to build it in SuperRare's first Liquid Editions cohort — and the 1/1
> at the top of the deck carries my name, *Lovebeing*, one for every holder.

*Optional personal swaps if you want them in: your city, a specific childhood set (the pogs/cards
that started it), or a nod to your cohort peers. The upbringing above is drawn from your own words.*

### Mechanics explainer (storyboard, 6 beats — ~45–60s video or one scrollable diagram)

1. **THE FIELD IS ALIVE.** A season banner drops (SUMMER); ~100 hyperfoil cards fan out,
   shimmering, RARE prices flickering. → *"100 living cards — each a lens over one liquid
   edition, art moving with the market."*
2. **YOU RIP.** A hand tears a pack; a fat stack of `$UR3030` flies in (~$7 worth) and
   **all of it dissolves to smoke**; field cards spill out, and once in a while a golden
   hero-lens claim. → *"Rip a pack — seven cards, about seven bucks. It all burns."*
3. **YOU PLAY.** Montage — the three games; staked cards arming your craft; a `$UR3030`
   wager pot. → *"Play the cabinets. Your cards arm you; the ante is a wager, winner takes
   the pot."*
4. **THE COURT.** A card climbs Common → Prizm and slides back down; the crowd votes with
   burns. → *"The crowd promotes and demotes — up the ladder, down the ladder, never off
   the deck."*
5. **THE TOKEN BURNS DOWN.** A supply meter falls 3.03M → ~1.01M as packs rip; the cards
   stay lit. → *"The token burns down 3×. The deck survives. The token burns so the art
   can live."*
6. **MINT & COMPRESS.** A hero card mints as a 1/1 (pulled or earned); a cornered field
   card compresses into a single 1/1; every wallet lights up with Lovebeing. → *"33 hero
   1/1s — earn them or pull them. Corner a card, compress it. Everyone carries Lovebeing."*

### Launch tweets (3 — from **@_lovebeing_**; link **[ARTIST TO SUPPLY]**)

> **1 — hook.** A full field of psychedelic hyperfoil cards just went liquid. Upperdeck
> Ripmaster 3030 by Gianni Arone (@_lovebeing_): 100 living lenses on one SuperRare Liquid
> Edition, and the token burns down 3× while you play. `$UR3030` → **[link]**

> **2 — mechanic.** Rip a pack — seven cards, ~$7, it all burns. Play the cabinets to earn
> hero lenses; pull the rest from packs. Vote cards up and down the rarity court. 33 real
> 1/1s, and every holder carries the Lovebeing lens. Season 1: SUMMER. **[date]**

> **3 — ethos.** No treasury. No team unlock. No pump. One token, minted once, burning down
> 3× as the crowd plays — a card game where the fire is real but the art survives. Live on
> SuperRare Liquid Editions. Come rip. **[link]**

---

## Part 5 — Sign-Off

> By signing I agree to the Part 2 technical responsibilities (custom renderer + front end
> are ours), the Part 3 tokenomics, and the deliverable deadlines.

Artist Signature / Typed Name: **Gianni Arone** ___________________________  Date: ________

---

*Not financial advice. `$UR3030` is an experimental, volatile crypto token with no promise
of value.*

# Liquid Editions — Artist Intake & Launch Agreement (filled)

Answers for the SuperRare *Liquid Editions: Artist Intake & Launch Agreement*,
written for the game as it stands today (the 196-card field → 77-survivor
burn-down deck, rarity court, arena, 1/1 marquee, Ash Trophies, creator cut +
house reward pool). Supersedes the older `INTAKE-DRAFT.md` (which described the
earlier "vote 8 cards into a pack" model). Numbers in **Part 3** come from
`docs/TOKEN-MATH.md` — read that for the reasoning.

- **Artist / Project:** Gianni Arone — *Upperdeck Ripmaster 3030*
- **Token:** `$UR3030`
- **Site:** https://upperdeckripmaster3030.com
- **Artist X / handle:** `[@handle — fill in]`

---

## Part 1 — The Collector Proposition

**The Core Concept**

> Upperdeck Ripmaster 3030 is a liquid trading-card game of psychedelic hyperfoil
> cartoon spirits — blacklight rubber-hose memes, pepes, and public-domain ghosts.
> `$UR3030` *is* the game: you can't rip a pack, battle, trade, or curate the deck
> without holding and spending it. The edition's art is the living state of a
> community ritual — a full deck that the players **burn down** each season, on
> chain, until only a standard 77-card deck of survivors remains.

**The Mechanics**

> Every action reads and moves the token. A season opens with the whole field in
> play; holders **burn `$UR3030` to downvote** cards off the island and **corner +
> destroy** editions, culling ~196 cards down to 77 survivors. The render contract
> reads live market state (price/supply via `getMarketState`), burn progress
> (`maxTotalSupply − totalSupply`), and each card's rarity-court standing, and
> draws the card from it: foil heat tracks market weather, the frame chars as the
> edition burns down, a promoted card glows and a demoted one desaturates. It is a
> **split economy, not pure burn**: destructive/circulatory moves (rip, wager,
> send, trade, downvote, destroy) *burn* the token; constructive moves (upvote,
> HODL) pay a transparent **creator** royalty; and a slice of every pack rip seeds
> a **house reward pool** that pays whoever ends an edition. Rarity itself is not
> hand-assigned — it's derived from measured art traits (foil, gold leaf,
> colorfulness, archetype scarcity).

**The Collector Value**

> Holding is standing in a live market *and* a vote you haven't cast. Spending
> converts market position into **authorship over the canon**: the community
> literally decides which 77 cards survive each season. Owning the whole (dwindling)
> supply of a card lets you **end it forever** — and the keeper of an edition's
> final card is rewarded with a soulbound **Ash Trophy** card plus a `$UR3030`
> payout from the house. There is a sealed **1/1 marquee** (Lovebeing) as the apex
> chase, a prizm tier as the mid chase, and four seasons a year — a permanent
> scarcity ritual with real collectibles falling out of it.

---

## Part 2 — Deployment Path & Responsibilities

**☑ Path B: The CLI (Custom) Route.**

We supply the custom front end (this card site — gallery, arena, binder, rarity
court), the custom renderer (the `_full.html` foil engine ported to a Liquid Lens
render contract), the game economy contract (`CardVault.sol`), metadata, and full
technical execution. **We acknowledge the support boundary:** SuperRare provides
the base protocol, indexing/whitelisting, and cohort splash-page support; QA and
bug-fixes for our custom renderer + front end are ours.

---

## Part 3 — Tokenomics & Structure

*(full worksheet + reasoning in `docs/TOKEN-MATH.md`)*

- **Target Launch Date:** `[MM/DD/YYYY]` — after a full Sepolia dress rehearsal
  (open ballot → burn-vote → lock → read winners → mint lens pack; `docs/MECHANICS.md §8`).
- **Total Token Supply / Cap:** **Capped — 3,030,000 `$UR3030`** (thematic 3030
  motif). Capped + a burn-heavy economy = every season provably shrinks circulating
  supply; `burnProgress = maxTotalSupply − totalSupply` is the render's burn meter.
- **Initial Price / Bonding Curve Parameters:** multicurve, **`--curve-preset
  medium-demand`** (previewed with `--preview` before deploy), reserve/quote in
  **RARE**. Target opening price ≈ **0.5–1 RARE per 100 `$UR3030`** so the base
  1-token toll is a true micro-cost; final schedule read live from the curve. See
  TOKEN-MATH §2–3 for the burn-cost table and the price-peg strategy.
- **ERC-721 "Lenses"? — Yes.** The card render is an HTML Liquid Lens. Two lens
  roles: (a) the **deck lens** — the ERC-721 that renders each card from on-chain
  state; (b) the **1/1 marquee** (Lovebeing, sealed until a later season). Per-card
  copies live as `CardVault` ERC-1155 ids; Ash Trophies mint into id space 9000+.
  Exact per-card edition sizes to finalize with SuperRare during assisted setup.

---

## Part 4 — Deliverables & Marketing Assets

| Ask | Ours |
|---|---|
| Artist / Project Name | Gianni Arone — Upperdeck Ripmaster 3030 |
| Artist Twitter/X Handle | `[@handle — fill in]` |
| Mint Page / Custom Front-End URL | https://upperdeckripmaster3030.com |
| Render Contract Address | `[0x… after Sepolia deploy]` |
| Hero Image/Video | screen-capture of a prizm card tilting under live foil (the site *is* the demo) |
| "Mechanics" Explainer | animated diagram of the burn-down season loop (rip → play → downvote/destroy → 77 survivors → Ash Trophy) |
| Artist Backstory | *why liquid*: the pack rip as ritual, burning as belief, the deck as a thing the crowd carves down together |
| Social Drafts | 2–3 tweets, drafted once S1's opening field + date are locked |
| Drive Link | `[insert]` |

---

## Part 5 — Sign-Off

> By signing I agree to the Part 2 technical responsibilities (custom renderer +
> front end are ours), the Part 3 tokenomics, and the deliverable deadlines.

Artist Signature / Typed Name: **Gianni Arone** ___________________________

Date: ____________

---

*Not financial advice. `$UR3030` is an experimental, volatile crypto token with no
promise of value.*

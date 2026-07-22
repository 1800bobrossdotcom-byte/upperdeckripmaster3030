# SuperRare Intake Form — Draft Answers

> ⛔ **OBSOLETE DRAFT — SUPERSEDED (2026-07).** These early drafts describe a retired
> model (holders vote candidate cards into season packs; fixed multi-copy editions).
> The current game is **model v2.2**: a fixed **100-card handmade deck** of live ERC-721
> lenses (33 hero 1/1s + 67 render-only field cards + a holder-bound Lovebeing lens),
> packs are buy-and-burns (token deflation, no card retirement), rarity by community
> vote. See **`docs/ECONOMIC-FLOW.md`** (canonical) and **`docs/ARTIST-INTAKE.md`** for
> the live intake answers. Kept for history only.

Drafts for *Liquid Editions: Artist Intake & Launch Agreement*. Edit voice as needed —
these are written to be pasted into the form.

## Part 1 — The Collector Proposition

**The Core Concept**

> A liquid trading card game of psychedelic hyperfoil cartoon cards — the wild old
> rubber-hose spirits of the public domain in blacklight. The token is the game: four
> seasons a year, holders burn it to vote candidate cards into the season's pack, and
> the edition's artwork is the living state of that ritual — a pack that melts as the
> community burns, and crystallizes into cards when the season locks.

**The Mechanics**

> The ERC-20's render contract reads burn progress, season vote tallies, price, and
> liquidity at metadata-fetch time. During a season, the artwork is a live ballot — the
> leading candidate cards glow and scale with their burned-vote share, and the pack's wax
> seal visibly melts as supply is destroyed. At a pre-announced close block, the top 8
> candidates are enshrined as an ERC-721 Companion Lens Collection (the season pack).
> Between seasons the artwork shows the sealed pack of winners. Burns are the only sink:
> voting is permanent, deflationary, and legible on-chain.

**The Collector Value**

> Holding is potential energy: tokens are votes not yet cast, standing in a live market.
> Burning converts market position into authorship — voters decide the canon, and their
> burned votes become pro-rata "rip rights" to the season's pack of card lenses. Holding
> more means more say over the deck and a bigger rip when the pack opens. Four seasons a
> year, every year: a permanent scarcity ritual with a collectible artifact at the end.

## Part 2 — Deployment Path

**Path B: The CLI (Custom) Route.** Custom front end (the card site), custom renderer,
custom ballot mechanics. Acknowledge the support boundary: renderer + front end are ours.

## Part 3 — Tokenomics (proposals — decide before signing)

- **Target Launch Date**: after a full Sepolia dress rehearsal (see MECHANICS.md §8)
- **Supply**: capped. A round, thematic number (e.g. 3,030,000 for the 3030 motif).
  Capped + burn-only-sink = every season provably shrinks the supply.
- **Curve**: start `--curve-preset medium-demand`, inspect with `--preview`, tune.
- **721 Lenses**: **Yes** — one Companion Lens Collection per season, 8 winning cards
  (+ chase variants selected by lock-block hash). Supply per card: small editions
  (e.g. 30 each) or 1/1s for chase — decide with SuperRare during assisted setup.

## Part 4 — Deliverables mapping

| Ask | Ours |
|---|---|
| Mint page / custom front-end URL | the Namecheap domain → GitHub Pages site |
| Render contract address | after Sepolia deploy |
| Hero image/video | screen-capture of a hyperfoil card tilting (the site *is* the demo) |
| Mechanics explainer | animated diagram of the season loop (README mermaid → motion version) |
| Artist backstory | why liquid: the pack rip as ritual; burning as belief |
| Social drafts | 2–3 tweets, written once S1 candidates exist |

## Open questions for the SuperRare team (@im_jonooo)

1. Burn mechanics — `ILiquid.burn(uint256)` and derived burn progress
   (`maxTotalSupply() − currentSupply`) are confirmed from the starter kit; please
   confirm a companion ballot contract burning via `transferFrom → burn` is the
   intended pattern, and that nothing in the pool accounting objects to third-party
   contract burns.
2. Can the assisted Companion Lens setup mint *from* our ballot contract's winners list,
   or is the lens mint list manual?
3. Does SuperRare.com render HTML `animation_url` works (and with what iframe
   sandbox/allow flags and size limits)? Public docs don't say — this decides whether
   the live-foil card is the NFT itself or a companion view on our site.
4. Timing: which cohort window should S1 target?
5. CLI v2.0.0 (July 8) vs docs at v1.2.2 — any liquid-edition changes we should know?

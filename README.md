# UPPERDECK RIPMASTER 3030

**A liquid trading card game on SuperRare.** One living ERC‑20 artwork, four seasons a year,
and a deck of psychedelic hyperfoil cards — voted into existence by burning the token.

The sacred texts of the world, retold through rubber‑hose cartoon spirits, printed on
cards that are alive: each card is a thin, self‑contained HTML work with real holographic
foil that tilts with your phone and breathes with the Ethereum network.

---

## How it works

```mermaid
flowchart LR
    subgraph Season Loop — 4x per year
        A[Candidate cards<br/>curated + generated] --> B[Burn-to-vote window<br/>burn $TOKEN = cast votes]
        B --> C[Pack lock<br/>top cards make the season pack]
        C --> D[Season pack mints<br/>ERC-721 Companion Lenses]
    end
    D --> A
    T[(Liquid Edition ERC-20<br/>bonding-curve market)] -->|burned for votes| B
    T -->|render contract reads<br/>burn progress + tallies| L[The Living Pack<br/>evolving ERC-20 artwork]
```

1. **The token** — one Liquid Edition ERC‑20 deployed with the Rare CLI (`rare liquid-edition deploy multicurve`). It is the ink, the energy, the pack wax.
2. **The vote** — each season opens a ballot of candidate cards. Burning tokens casts votes; burns are permanent, so every season the supply gets scarcer and the deck gets realer.
3. **The pack** — when the season closes, the top cards are enshrined as an ERC‑721 **Companion Lens Collection** (the format SuperRare's Liquid Editions docs describe): each card is a lens over the same living market.
4. **The living artwork** — the ERC‑20's render contract reads burn progress, vote tallies, price, and liquidity at `tokenURI()` fetch time. The edition's artwork *is* the state of the game.
5. **The cards** — pog‑spirited trading cards. Art is generated in Midjourney (textless, psychedelic, hyperfoil, rubber‑hose cartoon spirits × world scripture), curated by hand, then wrapped in a live HTML foil frame.

## Repo layout

```
index.html            → the site (GitHub Pages, mobile-first)
cards/                → each card: one self-contained HTML file (live foil work)
art/inbox/            → drop curated Midjourney PNGs here for ingestion
scripts/make-card.mjs → wraps a PNG into a live foil card page (no deps)
prompts/PROMPT-KIT.md → the Midjourney prompt system + season card lists
docs/MECHANICS.md     → season / burn-to-vote / tokenomics design
docs/INTAKE-DRAFT.md  → drafted answers for the SuperRare cohort intake form
docs/NAMECHEAP-SETUP.md → domain → GitHub Pages wiring
```

## Quickstart

```bash
# preview the site locally
python3 -m http.server 8000    # → http://localhost:8000

# wrap a curated Midjourney render into a card page
node scripts/make-card.mjs \
  --img art/inbox/s01-c01-the-serpent.png \
  --name "The Serpent" \
  --season 1 --number 1 \
  --scripture "Genesis 3"
```

## Status

- [x] Aesthetic prototype: live hyperfoil card frame (`cards/the-serpent.html`)
- [x] Prompt kit v1
- [x] Mechanics design v1
- [ ] Domain (Namecheap) → GitHub Pages
- [ ] Testnet deploy via `rare` CLI (Sepolia first — never straight to mainnet)
- [ ] Season ballot contract + render contract
- [ ] Season 1 candidate art run

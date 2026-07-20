# UPPERDECKRIPMASTER3030

**A liquid trading card game on SuperRare.** One living ERC‑20 artwork, four seasons a year,
and a deck of psychedelic hyperfoil cards — voted into existence by burning the token.

The wild old cartoon spirits of the public domain, soaked in blacklight and pressed in
foil: each card is a thin, self‑contained HTML work with real holographic foil that
tilts with your phone and breathes with the Ethereum network.

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
5. **The cards** — pog‑spirited trading cards. Art is hand‑curated (Midjourney‑generated or manually created: textless, psychedelic, hyperfoil, rubber‑hose cartoon spirits), then wrapped in a live HTML foil frame.
6. **The slam** — cards battle. Every card carries ATK/DEF and a trigger that reads live chain state (gas, burns, price, liquidity). Wager pog‑style — pairings of 1/2/3 or stacks of 3/4/7 — winner takes the cards, then lists them in the Bazaar for the liquid token or burns them for notches. Full rules: `docs/BATTLE.md`.

## Repo layout

```
index.html            → the site (GitHub Pages, mobile-first)
cards/                → each card: one self-contained HTML file (live foil work)
cards/index.html      → the deck gallery (generated — do not hand-edit)
art/inbox/            → drop curated renders here for ingestion
scripts/make-card.mjs → wraps one image into a live foil card page (no deps)
scripts/ingest-batch.mjs → bulk ingest + gallery rebuild (thousands of cards OK)
docs/ART-VAULT.md     → how to upload/organize the big curated art collection
prompts/PROMPT-KIT.md → the Midjourney prompt system + season card lists
docs/MECHANICS.md     → season / burn-to-vote / tokenomics design
docs/BATTLE.md        → battle rules: triggers, pog wagers, arena contract design
docs/TESTNET.md       → Sepolia deploy runbook (token, ballot, renderer)
contracts/            → SeasonBallot.sol (burn-to-vote) + Liquid Edition interface
scripts/generate-lore.mjs → Claude reads each card, writes the living-dossier back
js/chain-config.js    → chain the site reads (Sepolia/mainnet, contract addresses)
docs/INTAKE-DRAFT.md  → drafted answers for the SuperRare cohort intake form
docs/NAMECHEAP-SETUP.md → domain → GitHub Pages wiring
```

## Quickstart

```bash
# preview the site locally
python3 -m http.server 8000    # → http://localhost:8000

# wrap one curated render into a card page
node scripts/make-card.mjs \
  --img art/inbox/s01-c01-the-vine.png \
  --name "The Vine" --season 1 --number 1 \
  --flavor "tangled in neon"

# bulk-ingest a whole folder (thousands OK) + rebuild the deck gallery
node scripts/ingest-batch.mjs --dir art/inbox
node scripts/ingest-batch.mjs --dir ../art-vault/season-01 --manifest ../art-vault/manifest.json
```

## Status

- [x] Aesthetic prototype: live hyperfoil card frame (`cards/the-egg.html`)
- [x] Prompt kit v1
- [x] Mechanics design v1
- [ ] Domain (Namecheap) → GitHub Pages
- [ ] Testnet deploy via `rare` CLI (Sepolia first — never straight to mainnet)
- [ ] Season ballot contract + render contract
- [ ] Season 1 candidate art run
- [ ] Exhibition battles on the site (no stakes) → staked arena after audit

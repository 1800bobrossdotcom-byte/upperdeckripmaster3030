# Mechanics — Seasons, Burn‑to‑Vote, and the Living Pack

Design v1 · maps the game onto SuperRare Liquid Editions primitives (ERC‑20 + bonding curve,
pull‑based render contracts, Companion 721 Lenses).

## 1. The token

One Liquid Edition ERC‑20 for the life of the game (not one per season).

- Deployed via `rare liquid-edition deploy multicurve "<NAME>" "<SYMBOL>" --curve-preset ...`
  from **the wallet connected to the SuperRare artist profile** (the "Golden Rule" in the CLI
  guide — otherwise the drop won't surface on the profile).
- The bonding curve gives the game a permanent live market, **paired with RARE as the
  reserve/base token** in an embedded liquidity pool (prices and quotes are denominated
  in RARE; `rare swap buy-rare` exists for acquiring it).
- Liquid Editions run on **Ethereum mainnet and Sepolia only** (verified July 2026 —
  Base is supported by the CLI for other flows, but not Liquid Editions).
- Burning is the game's only sink, so every vote is deflationary. Four seasons a year means
  four scheduled scarcity events, forever.
- Version note: npm `@rareprotocol/rare-cli` latest is **2.0.0** (July 8, 2026) while
  rare.xyz/docs documents v1.2.2 — re-check `rare liquid-edition --help` after install
  in case v2 added/renamed subcommands. Documented liquid-edition subcommands today:
  `deploy multicurve`, `status`, `token-uri`, `set-render-contract`. The only documented
  curve preset is `medium-demand` ("instant" and "graduated" were removed in June 2026).

Why one token instead of per‑season tokens: a single market accrues history and liquidity;
season packs (the 721 lenses) carry the season identity instead. This also keeps the
SuperRare story clean — one living work that four times a year contracts and crystallizes.

## 2. The season loop (quarterly)

| Phase | Weeks | What happens |
|---|---|---|
| **The Reveal** | 1–6 | Candidate cards drop on the site (curated + generated). Community discusses. |
| **The Burn** | 7–10 | Voting window. Burn N tokens = N votes on a candidate. Live leaderboard. |
| **The Lock** | 11 | Season closes at a pre‑announced block. Top 8 cards make the pack. |
| **The Rip** | 12–13 | Pack mints as an ERC‑721 Companion Lens Collection. Next season teased. |

Year‑one arc (one visual theme per quarter):

- **S1 — Bloom**: neon flora, spores, vines, impossible gardens
- **S2 — Melt**: liquid foil, dripping suns, molten gold, lava-lamp physics
- **S3 — Fractal**: kaleidoscopes, tessellation, infinite recursion
- **S4 — Void**: cosmic dark, negative holo, starfields, deep static

## 3. Burn‑to‑vote

The Liquid Editions docs list **burn progress** as first‑class readable on‑chain state, but
attributing burns to *choices* needs a small companion contract:

```
SeasonBallot
  openSeason(seasonId, cardIds[], closeBlock)
  vote(seasonId, cardId, amount)   // transferFrom → burn; tally[seasonId][cardId] += amount
  tally(seasonId, cardId) → uint   // read by render contract + site
  winners(seasonId) → cardIds[]    // top 8 after closeBlock
```

- **Linear voting for v1** (1 token burned = 1 vote). Quadratic resists whales but is
  sybil‑trivial on-chain; linear is honest and legible. Revisit if a whale distorts S1.
- Votes are burns — no refunds, no delegation, no snapshot games. Conviction = combustion.
- **Burn interface — confirmed (July 2026)**: the starter kit's `ILiquid` interface
  (which `is IERC20Metadata`) declares `burn(uint256)`, so the ballot can
  `transferFrom` then `burn`. There is **no dedicated burn-progress getter** — derive it
  as `maxTotalSupply() − currentSupply` (from `getMarketState()` / `totalSupply()`).
  The CLI itself has no burn command; burns are contract calls (ballot, site, or `cast`).
  Remaining check: whether tokens held by the ballot burn cleanly, or votes should
  instead pull straight from the voter's wallet in the same call.

## 4. The Living Pack (the ERC‑20's artwork)

The render contract is pull‑based view logic (per the CLI guide), so the edition's artwork
can be a live collage of the current season:

- reads `SeasonBallot.tally(...)` → candidate cards scale/glow by vote share
- reads burn progress (`maxTotalSupply() − currentSupply`) → the pack "wax seal"
  visibly melts as supply burns
- reads `getCurrentPrice()` / `getMarketState()` liquidity → foil intensity and palette heat
- `animation_url` → a thin HTML work (same foil engine as the site's cards); the starter
  kit's `LiquidLensHTMLExample.sol` is direct precedent for HTML metadata from a renderer

Between seasons it shows the sealed pack of the last season's winners.

**Constraints for the NFT-context version of the cards (verified against 2025–26
marketplace behavior):**

- Marketplace iframes are sandboxed with a null origin and no `window.ethereum`; treat
  **live RPC reads as progressive enhancement only** — the canonical dynamic state must
  be baked into the metadata by the render contract at `tokenURI()` time.
- Always ship a **static `image` fallback** (≥3000×3000) — wallets and several
  marketplaces render only that field, never the HTML.
- Cards must be **self-contained and deterministic** from a baked seed (no CDNs); our
  template already fails silent offline, and chase-variant selection by lock-block hash
  gives each card its deterministic seed.
- iOS gyro inside third-party iframes is gated in WebKit on a magnetometer permission
  embedders rarely grant — the card template therefore requests **DeviceMotion as well
  as DeviceOrientation** and derives tilt from motion when orientation never fires
  (pointer/drag always works regardless).
- **SuperRare's own support for HTML `animation_url` is publicly unconfirmed** — ask the
  team (tracked in INTAKE-DRAFT.md); worst case the lens metadata uses image/video from
  the renderer and the live HTML lives on our site.

## 5. Season packs as Companion 721 Lenses

Each season's top 8 mint as lenses over the same market — exactly the Companion Lens
pattern in the Overview doc. Distribution options (decide before S1 closes):

1. **Rip rights** *(recommended)*: pro‑rata claim for voters — your burned votes are pack‑opening
   rights, whichever cards you voted for. Voting = ripping.
2. Priced lens mint in the ERC‑20, proceeds burned (second sink).
3. Artist‑curated 1/1 auctions for "chase" variants, editions for the base 8.

Chase variants ("prizm" states) can be deterministic from on‑chain entropy — e.g. the
lock block's hash selects which winner gets a holo‑negative variant. Network effects as
pack luck.

## 6. ETH network effects in the art

Cards and the Living Pack read chain state to modulate the foil (see the constraint note
in the site docs — marketplace iframes may block network calls, so live reads are for the
**site** presentation; the **NFT** metadata states come from the render contract):

- gas price → foil heat (calm teal → solar flare)
- block hash → sparkle field seed (every block, a new glitter constellation)
- burn progress → frame corrosion / halo growth
- ETH price motion → aurora drift speed

## 7. Curation model

Two lanes into a season's candidate pool, both hand‑approved:

- **Curated**: you commission/select art directly (manual updates always possible —
  cards are just files in `cards/`).
- **Imagined**: generated candidates seeded from chain data (e.g. weekly, the latest
  block hash picks theme × character × palette from the prompt kit's tables; you
  run the prompt, keep or kill the result). The chain proposes, the artist disposes.

## 8. Testnet plan

1. Clone `github.com/superrare/liquid-editions-starter-kit` (Foundry workspace; has
   render-only and renderer+721-lens example patterns, `.env.eth.sepolia` template, and
   `AGENTS.md`/`skills/` AI workflow guides). Sepolia create flow lives at
   `dev.superrare.co/create/liquid-edition`.
2. Sepolia deploy via CLI (`--preview` first, per the guide), burner supply, fake season
   with 4 candidates, exercise ballot + render + lens mint end‑to‑end.
3. Only after a full dress rehearsal: mainnet, S1.

Bonus: the CLI ships `rare mcp serve` — an MCP server over the protocol. That means
Claude can be wired directly to deploys, status checks, and marketplace ops during
development ("connect Claude to the CLI" is a supported pattern, not a hack).

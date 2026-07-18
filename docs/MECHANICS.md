# Mechanics — Seasons, Burn‑to‑Vote, and the Living Pack

Design v1 · maps the game onto SuperRare Liquid Editions primitives (ERC‑20 + bonding curve,
pull‑based render contracts, Companion 721 Lenses).

## 1. The token

One Liquid Edition ERC‑20 for the life of the game (not one per season).

- Deployed via `rare liquid-edition deploy multicurve "<NAME>" "<SYMBOL>" --curve-preset ...`
  from **the wallet connected to the SuperRare artist profile** (the "Golden Rule" in the CLI
  guide — otherwise the drop won't surface on the profile).
- The bonding curve gives the game a permanent live market. Collectors enter at any scale.
- Burning is the game's only sink, so every vote is deflationary. Four seasons a year means
  four scheduled scarcity events, forever.

Why one token instead of per‑season tokens: a single market accrues history and liquidity;
season packs (the 721 lenses) carry the season identity instead. This also keeps the
SuperRare story clean — one living work that four times a year contracts and crystallizes.

## 2. The season loop (quarterly)

| Phase | Weeks | What happens |
|---|---|---|
| **Revelation** | 1–6 | Candidate cards drop on the site (curated + generated). Community discusses. |
| **The Burn** | 7–10 | Voting window. Burn N tokens = N votes on a candidate. Live leaderboard. |
| **The Lock** | 11 | Season closes at a pre‑announced block. Top 8 cards make the pack. |
| **The Rip** | 12–13 | Pack mints as an ERC‑721 Companion Lens Collection. Next season teased. |

Year‑one arc (one testament per quarter):

- **S1 — Origins**: creation stories (Genesis, Enūma Eliš, Popol Vuh, the Cosmic Egg…)
- **S2 — Floods & Trials**: Noah/Utnapishtim, Job, Jonah, the desert…
- **S3 — Prophets & Visions**: Ezekiel's wheel, burning bush, Jacob's ladder…
- **S4 — Apocalypses**: Revelation, Ragnarök, Kali Yuga…

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
- **Open question to confirm against the starter kit** (`liquid-editions-starter-kit`,
  linked from the CLI guide): the exact burn interface on the Liquid Edition ERC‑20
  (public `burn(uint256)` vs. transfer‑to‑dead vs. protocol burn hook), so the ballot's
  burn call matches what the render contract's "burn progress" actually reads.

## 4. The Living Pack (the ERC‑20's artwork)

The render contract is pull‑based view logic (per the CLI guide), so the edition's artwork
can be a live collage of the current season:

- reads `SeasonBallot.tally(...)` → candidate cards scale/glow by vote share
- reads burn progress → the pack "wax seal" visibly melts as supply burns
- reads price/liquidity → foil intensity and palette heat
- `animation_url` → a thin HTML work (same foil engine as the site's cards)

Between seasons it shows the sealed pack of the last season's winners.

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
  block hash picks scripture × character × palette from the prompt kit's tables; you
  run the prompt, keep or kill the result). The chain proposes, the artist disposes.

## 8. Testnet plan

1. Sepolia deploy via CLI (`--preview` first, per the guide), burner supply, fake season
   with 4 candidates, exercise ballot + render + lens mint end‑to‑end.
2. Only after a full dress rehearsal: mainnet, S1.

# The Slam — battle rules & onchain design

Design v1 for card battles. Yes, it makes sense — and the key insight is that the same
live market state the render contracts already read (via the Rare Protocol interfaces)
can drive combat: **the cards' art and their powers breathe from one source of truth.**

## 1. Every card is battle-born

Each card carries:

- **ATK** and **DEF** (1–9)
- **One trigger** — a conditional power that reads live chain state at resolution time

On the site today these derive deterministically from the card's slug (see
`scripts/make-card.mjs`; manifest can override any of them). When cards mint as season
lenses, stats derive from the **mint block hash** instead — same idea, chain-sealed.

## 2. The trigger table (chain connectivity = the rules engine)

Everything below is readable on-chain by a battle contract — no oracles, no servers:

| Trigger | Condition read at resolve block | Effect |
|---|---|---|
| **GAS STORM** | `block.basefee` > 25 gwei | +2 ATK |
| **STILL AIR** | `block.basefee` < 5 gwei | +2 DEF |
| **BURN WAVE** | season burn progress (`maxTotalSupply − currentSupply`) crossed another 0.5% | +1 ATK per 0.5% |
| **MOON CANDLE** | token price (`getCurrentPrice`) above its commit-block snapshot | +2 ATK |
| **RUG WIND** | price below the commit snapshot | +2 DEF |
| **DEEP WATER** | pool liquidity (`getMarketState`) above season median | ignore the first hit |
| **BLOCK OMEN** | resolve `blockhash` is odd | strike first |
| **WHALE SONG** | staker's token balance ≥ threshold | +1 ATK, +1 DEF |

The market *is* the weather. Battling during a gas spike is a different game than at
3am on a quiet chain — players time their slams like surfers.

## 3. Wager formats (pogs rules)

Up to **7 cards** wagered per side, in two families:

**Pairings (duels)** — cards fight head-to-head, round by round:

| Format | Cards staked | Feel |
|---|---|---|
| 1v1 | 1 | quick draw |
| 2v2 | 2 | doubles |
| 3v3 | 3 | skirmish |

**Stacks (slams)** — the classic pog wager, combo bonuses live here:

| Format | Cards staked | Feel |
|---|---|---|
| Stack of 3 | 3 | small slam |
| Stack of 4 | 4 | big slam |
| Full stack | 7 | the whole pot |

**Combo bonuses (evaluated within your stack at resolve):**

- **Echo** — 2 cards sharing a trigger: that trigger's effect doubles
- **Suit run** — 3 cards sharing a frame color: +1 ATK to all
- **Pure pack** — every card from the same season: +2 DEF to all
- **Rainbow** — 7 cards, 7 different frame colors: strike first, all rounds

Stack order is part of your sealed commit — sequencing your stack around expected
chain weather *is* the skill.

## 4. Resolution (fair by construction)

Commit–reveal against a future block, fully deterministic, fully verifiable:

1. **Challenge**: player A opens a battle (format, stake list, sealed stack-order hash).
   Cards escrow into the arena contract. Price snapshot stored.
2. **Accept**: player B matches the format with their own sealed stake. Both consented —
   stakes are never taken from anyone who didn't opt in.
3. **Resolve**: anyone may call `resolve()` after block `C + K` (K ≥ 10). Seed =
   `blockhash(C + K)` — unknowable at commit time. The contract shuffles rounds from the
   seed, evaluates every trigger against *current* chain state, plays out the rounds
   (ATK vs DEF, round winner captures that round's card in slam mode; majority takes
   the pot in duel mode v1), and transfers the captured cards.
4. Every battle is replayable from public state — the site can animate the whole slam
   from the transaction alone.

## 5. After the slam: the Bazaar

Winners hold the captured cards. Two exits, both feeding the token economy:

- **List** — `CardBazaar.list(tokenId, price)` priced in the liquid token.
  On sale, a cut (e.g. 10%) of proceeds is **burned** — trading feeds the same
  deflation engine as voting.
- **Burn the card** — destroy a captured card forever. The burner's chosen surviving
  card gains a permanent **notch** (kill-mark) its renderer displays — foil tier rises
  with notches. Card supply shrinks, survivors get scarcer and visibly battle-worn.

No token printing anywhere: burns only. Sinks: vote burns, bazaar burns, card burns.

## 6. Sequencing (ship it honest)

1. **Exhibition mode (Season 1)** — battles on the site, no stakes: same math, same
   triggers, chain state read over RPC in the browser. Proves the game is fun, tunes
   the numbers, costs nothing, risks nothing.
2. **Staked battles (post-audit)** — the arena escrows real lens NFTs; that's real
   value custody, so the contract gets audited first, and stakes launch on Sepolia
   for a full season of dress rehearsal before mainnet.
3. **Bazaar** alongside staked battles.

## 7. Open design questions

- Duel mode v1: majority-takes-pot vs per-round capture (per-round is more pog, more
  contract complexity).
- Trigger thresholds (25 gwei etc.) should be set relative to trailing averages so the
  game stays balanced as the chain evolves — a `tune()` from trailing medians, or
  per-season constants voted by burn.
- Whether exhibition wins earn anything (leaderboard only, or small token prizes from
  a community pool — prizes must come from somewhere, never minted).

# Card Economy Spec — cards on-chain, split by intent

> ⛔ **RETIRED — SUPERSEDED BY MODEL v2.2 (2026-07).** The ERC-1155 `CardVault` design
> below (card retirement, edition destruction, Ash-Trophies, Lovebeing-as-1155-item) is
> **no longer the plan**. Under v2.2 there is **no ERC-1155 anywhere**: every card is an
> **ERC-721 render-by-id lens** on one combined renderer+721 contract — **33 hero 1/1s**
> minted now (11 gacha + 22 earned) + **67 render-only field cards** (mintable later) +
> a **holder-bound Lovebeing lens**; **cards never retire or ash**; the burn is **token
> deflation only** (3.03M → ~1.01M). Canonical: **`docs/ECONOMIC-FLOW.md`**. The 1155
> spec below is kept only as historical reference — its mechanics are not deployed.

The site now plays the whole game client-side (arena, pack rips, the vault in
localStorage). This spec moves ownership on-chain on **Sepolia**, around one
house rule that splits every action by what it *does*:

> **Constructive acts pay the creator; everything else burns.** Championing art —
> upvoting a card in the rarity court, HODL — transfers the toll to the **creator**
> wallet as a transparent royalty.
> Everything else — sending, trading, wagering, ripping, **down**voting, and
> destroying an edition — **burns** the liquid token. There is still no treasury
> catching fees; burns are destroyed, the creator cut is a plain transfer, and
> burns remain the burn progress the renderer and card backs read.

Three contracts, two already written:

| Contract | Role | Status |
|---|---|---|
| Liquid Edition ($UR3030) | the ERC-20 + bonding curve (SuperRare protocol) | deploy via Rare CLI (TESTNET.md §2) |
| `SeasonBallot.sol` | burn-to-vote: which cards make each season | written (TESTNET.md §3) |
| `CardVault.sol` | **this spec** — cards as ERC-1155, send/trade/wager/rip, marquee rules | written |

## 1. Cards as ERC-1155

One vault contract holds the whole deck. Token id = `season × 200 + №`
(S1 №01 = 201, S2 №18 = 418 — keeps seasons apart and clears id 1000 for the
marquee); many copies of a common can exist, and packs mint more. Each id
carries `(season, tier)` where tier ∈ {common, uncommon, rare, mythic, prizm} —
the same five tiers the gallery sorts by and the foil engine renders. The
**initial** tier is not hand-assigned: it is *derived from the art's traits* —
measured pixel traits (foil sparkle, gold leaf, colorfulness, palette breadth,
full-bleed vs framed) plus a vision-read archetype/subject scarcity — ranked and
bucketed into a fixed pyramid (`scripts/extract-traits.mjs` → `derive-rarity.mjs`;
74/60/40/17/5). After mint the rarity court (§2.5) can still move any card.
`scripts/export-vault-registration.mjs` prints the id/tier batches straight from
`cards/manifest.json`.

Bare ERC-1155 transfers are **closed** (`safeTransferFrom` reverts). Cards move
only through the vault's named actions, so no path can skip the toll.

## 2. The actions, and where the toll goes

Defaults (curator-tunable via `setTolls` / `setDestroyToll` / `setReward`).
**→ 🔥** = burned, **→ 🎨** = paid to the creator wallet, **→ 🏦** = house reward pool.

| Action | What happens | Toll |
|---|---|---|
| `sendCard(to, id)` | gift a card | 1 $UR3030 → 🔥 |
| `trade(b, idA, idB)` | atomic card-for-card swap | 1 $UR3030 **per side** → 🔥 |
| `openMatch(stack)` / `joinMatch(id, stack)` | pog-stack escrow — 1/2/3/4/7 cards a side, like-for-like | 2 $UR3030 per side → 🔥 |
| `resolveMatch(id, winner)` | winner collects both stacks from escrow | — (already paid) |
| `cancelMatch(id)` | un-joined match refunds the stack; toll stays burned | — |
| `ripPack()` | mint 7 cards weighted 48/30/15/6/1 by tier (same odds as pack.js); gated by the season's pack allotment (§2.8) | `packPrice()` — ~350 $UR3030 ≈ **$7** at launch, rising → 🔥 (1 → 🏦) |
| `voteRarity(id, true, amt)` | **up**vote / promote a card (at prizm → HODL) | `amt` → 🎨 |
| `voteRarity(id, false, amt)` | **down**vote / demote (clears HODL buffer first) | `amt` → 🔥 |
| `voteHodl(id, amt)` | ⛨ anchor a card in place | `amt` → 🎨 |
| `destroyEdition(id)` | on a **court-retired** card, own every copy + burn them all forever; mints the keeper an Ash Trophy + pays them from 🏦 | cards + 50 $UR3030 → 🔥 |
| `fundReward(amt)` | top up the house bounty | `amt` → 🏦 |
| marquee transfer | see §3 | 25 $UR3030 → 🔥 |

The **creator** wallet (set in the constructor, retargetable via `setCreator`)
is the artist. Constructive volume — people minting new cards and burning
conviction to champion their favourites — becomes a royalty stream that aligns
the artist with the deck; destructive and circulatory volume still feeds the
fire. Neither path is a treasury: the burn is destroyed and the creator cut is a
direct transfer, both fully on-chain and legible in `CreatorPaid` / burn events.

## 2.5 The Rarity Court — cards voted up, down, and off

Rarity is not fixed at print. Any token holder can spend $UR3030 at any time to
vote any card **up** (promote) or **down** (demote); the ballot never closes.
**Up pays the creator, down burns** — championing art is constructive, scorn
feeds the fire.

- `voteRarity(id, up, amount)` — `amount` moves the card's signed **net
  conviction** (promote adds, demote subtracts) and settles immediately. On an
  upvote the amount is paid to the creator (🎨); on a downvote it burns (🔥).
- Crossing the current tier's **step cost** moves the card one rung and consumes
  that much conviction (remainder carries forward):

  | Step | Cost |
  |---|---|
  | Common ↔ Uncommon | 50 $UR3030 |
  | Uncommon ↔ Rare | 150 $UR3030 |
  | Rare ↔ Mythic | 500 $UR3030 |
  | Mythic ↔ Prizm | 2,000 $UR3030 (both directions — griefing the top costs what earning it did) |

- Demoted past Common a card is **retired — voted off the island**: it stops
  appearing in packs and can't enter the arena, but holders keep it and can still
  send/trade it (a dead card is a collector's item). Promote votes at the Common
  bar bring it back (`CardRestored`).
- **Retirement takes a crowd, not a whale.** Sliding a card *down* the tiers is
  pure conviction, but the final step *off the island* also needs a **quorum of
  distinct downvoter wallets** (`retireQuorum`, default **9**, curator-tunable).
  One deep pocket can drag a card to Common and bank scorn there, but the card
  only retires once `retireQuorum` different addresses have voted it down — so
  removal is a community verdict, not a bankroll. The moment the quorum-completing
  vote lands, the banked scorn settles the retirement. `didDownvote[id][wallet]`
  and `downvoterCount[id]` track the tally.
- **⛨ HODL votes** (`voteHodl`, paid to the creator 🎨) anchor a card where it
  is: they add to its **HODL buffer**, and demotes must burn through the buffer
  before they can touch net conviction. HODL works at **any tier** — curation by
  shield, for holders who want the pack to stay exactly as printed. At **prizm**
  there's nowhere left to climb, so `voteRarity(id, up)` automatically becomes a
  HODL vote. Buffers never push a card up; they only make it expensive to drag
  down. (HODL is constructive conviction, hence the creator cut.)
- The marquee is exempt — the court has no jurisdiction over the 1/1.
- Pack pulls read each card's **current** tier live, so a promotion changes its
  pull odds the same block. (Testnet does this with an O(deck) scan; mainnet
  should re-index tier pools on every `RarityShifted` event.)
- Events (`RarityVote`, `RarityShifted`, `CardRetired`, `CardRestored`) are the
  feed for the site: gallery tiers re-sort from the chain, and each card back
  can show its net conviction as living provenance.

This is deliberately the same physics as the season ballot: conviction is
combustion. A community that loves a common enough literally burns it into a
prizm; a card the deck turns on burns out of the game.

## 2.6 The Binder & market — collect, list, settle

`cards/binder.html` is the collector's folder: nine-pocket pages you turn like a
book, showing your owned cards (**My cards**) or the whole deck as a checklist
with unowned pockets ghosted **FIND IT** (**Full set**). Opening a pocket gives
the card's stats and its market actions.

The same page is the **market bench**. It is an order book, not a treasury:

- **Sell / trade** — list a card from your binder for an ask in $UR3030 or an
  open want. Listings persist on-device (`urm_market`) as a signed intent; a
  real fill **settles on-chain** through the primitives that already exist —
  `trade(b, idA, idB)` for a swap, `sendCard(to, id)` for a paid hand-off —
  each of which burns. No new escrow contract is required for v1.
- **House market** — cards the vault holds (culled into the house, plus a
  curated shelf) are offered back. **Buy** burns the ask and mints/transfers the
  card to you; **Trade for it** swaps one of your cards for it and burns
  `tradeToll` per side. This is the house re-issuing the cards it absorbed — a
  sink on the way out (buy/trade burn).
- A device-local **🔥 burned** meter tallies every settle for flavor; the real
  accounting is `totalSupply` on-chain.

Mainnet hardening (optional v2): a `list(id, price)` / `fill(listingId)` escrow
pair on the vault so listings hold the card in the contract and settle
trustlessly — still all burns, still no treasury. v1 ships on the existing
send/trade rails.

## 2.7 The burn-down — a season culled to the standard 77

A season **opens with the whole field in play** — every registered card — and
the community **burns it down**. Two forces do the culling:

1. **Downvotes** (§2.5) drag cards down the tiers and, on quorum, retire them off
   the island.
2. **Cornering + destruction** takes editions all the way to ash.

The season resolves toward a **standard UR3030 deck of 77 survivors**
(`STANDARD_DECK = 77`). The highest-ranked non-survivors seed the *next* season's
opening field, so nothing is wasted — the cull is a rolling tournament, not a
delete.

**Corner the edition.** The vault tracks live per-id supply (`supplyOf`,
maintained in `_update`). If a wallet holds **every circulating copy** of a card
it may `destroyEdition(id)`:

- guard: the card must already be **`retired`** by the court (no destroying a healthy edition), `balanceOf(caller, id) == supplyOf[id]`, and `supplyOf[id] > 0`;
- **burns every copy** + a `destroyToll` (default 50), marks the id
  `!exists` + `retired` — gone from packs, arena, and the court, permanently.

**The last keeper is rewarded.** Whoever ends an edition (holds its final card
when it burns) gets two things:

- an **Ash Trophy card** — a minted, soulbound "last of its kind" collectible
  (`isAshTrophy`, id space 9000+) that commemorates the retired edition
  (`trophyEdition[trophyId]`); and
- a **$UR3030 payout from the house** — `min(rewardPool, lastStandingReward)`,
  transferred out of the vault's **house reward pool**.

The reward pool is a **player bounty, not an operator treasury**: a slice of
every pack rip (`rewardCut`, default 1 token) seeds it, and anyone can top it
up with `fundReward`. Ripping packs *adds* cards to the field; that inflow funds
the bounty for whoever later *culls* one back down — a closed loop that pays the
community to reach the 77-card deck. `AshTrophy(editionId, keeper, trophyId,
reward)` + `EditionDestroyed(...)` are the epitaph. The **1/1 marquee is
indestructible**.

## 2.8 The pack — a $7 premium on-ramp, on a dwindling seasonal allotment

The pack is the one **premium** action; every other move stays a micro-toll. It is
priced in dollars, not pegged to the token's spot, so it holds ≈ **$7 at launch**
(a bundle of ~350 `$UR3030`) while the token itself stays cheap. Two things make it
**escalate**, by design (full math in `docs/TOKEN-MATH.md` §4a):

- **`packPrice()`** is not a constant. It rises on a straight line from `packBase`
  (the season's first rip) to `packCeil` (its last), indexed by how much of the
  season's card budget has been ripped — **within-season** escalation as the
  allotment dwindles. S1: 350 → 525 tokens.
- **The pack allotment** for a season = **cards issued that season ÷ 7**
  (`CARDS_PER_PACK`). Because the field burns **down** toward 77 survivors, each
  season issues fewer cards, so its allotment shrinks and its floor rises —
  **across-season** escalation. Reference (provisional — co-designed with SuperRare):
  S1 11,200 cards / **1,600 packs** → S2 7,700 / 1,100 → S3 4,200 / 600 → S4 1,820 /
  260 packs; base 350 → 800 tokens. A full four-season sellout burns **~2.03M `$UR3030`
  lifetime** (≈ the 2,020,025 milestone budget that retires the field to 77) — **not**
  per-season: under **mint-once (SuperRare audit 2026-07)** those burns are permanent and
  bounded by the cap, settling supply at a ~1,009,975 floor.

`ripPack` enforces the allotment (`cardsIssued + 7 ≤ seasonCardBudget`, else
`AllotmentSpent`) and increments `cardsIssued`. When a season sells out its
allotment, **packs close** for that season — remaining cards trade on the secondary
market only, which is the scarcity that lifts the floor into the next season. The
curator rolls it all with **`openSeason(season, cardBudget, base, ceil)`** (resets
`cardsIssued`) and can fine-tune mid-season with **`setPackPrice(base, ceil)`**;
**`packsLeft()`** and **`packPrice()`** are the reads the site shows. Set
`cardBudget = 0` to leave packs uncapped (early testnet).

## 3. The marquee (Lovebeing, id 1000)

Minted **once, supply 1**, straight into the vault at deploy. Rules enforced in
code, not convention:

- **Not playable** — `openMatch`/`joinMatch`/`trade` revert on id 1000.
- **Not burnable** — no code path burns it; it can only ever change hands.
- **Sealed** — every marquee move reverts until `currentSeason ≥ marqueeUnlockSeason`
  (constructor default: season 3). `releaseMarquee(to)` is the curator's one-time
  hand-off to the first keeper once unlocked.
- **Moves cost conviction** — `sendCard` on id 1000 burns the 25 $UR3030 marquee toll.

## 4. Arena resolution — testnet shape, mainnet path

The battle math (gas-weather trigger surges, ATK + combo + stack-size) lives in
`cards/battle.html`. On testnet the same engine reports the outcome via the
`resolver` key calling `resolveMatch`. That's a trusted role — fine for a dress
rehearsal, not for money. The mainnet path, in order of ambition:

1. **Signed-result v1**: both players sign the match seed; the resolver's result
   must verify against an EIP-712 payload of (matchId, seed, winner). Cheap,
   auditable, still one signer.
2. **On-chain math v2**: stats are deterministic from the card id (same
   `statsFor` hash the site uses); gas weather read from `block.basefee`;
   `resolveMatch` recomputes the winner itself, no oracle at all. The arena
   becomes fully trustless — this is the real target, and the math is already
   integer-only for exactly this reason.

Also honest about `trade()`: on testnet, counterparty consent is just the ERC-20
toll approval. Mainnet wants a propose/accept two-step or an EIP-712 signature
from side B before the swap executes.

## 5. Pack randomness

`ripPack` seeds from `blockhash(block.number-1) + sender + nonce` — **testnet
grade**, minable by a determined block producer. Before mainnet swap the seed for
Chainlink VRF (or the SuperRare protocol's randomness if the cohort ships one).
The tier weights (48/30/15/6/1) match `pack.js`, so the site's animation and the
chain's mints agree.

## 6. Site wiring (after deploy)

1. Paste the vault address into `js/chain-config.js` → `contracts.cardVault`.
2. `pack.js`: when `window.RIPMASTER_CHAIN.contracts.cardVault` is set and a
   wallet is connected, "Rip a pack" sends `ripPack()` and animates the reveal
   from the `PackRipped` event's ids; otherwise it keeps the current client-side
   simulation.
3. `cards/battle.html`: "SLAM" becomes `openMatch`/`joinMatch` when a wallet is
   connected; the vault panel reads `balanceOf` instead of localStorage.
4. Card backs: the provenance grid (battles W/L, times wagered, owners) fills
   from `CardSent`/`MatchResolved`/`PackRipped` events instead of nulls.
5. The Lovebeing page reads `balanceOf(vault, 1000)` — while the vault holds it,
   show "sealed"; after release, show the keeper's address.

Wallet layer: `window.ethereum` (MetaMask) with a plain `BrowserProvider`; no
wallet SDK dependency. Every page keeps working read-only with no wallet.

## 7. Deploy order (Sepolia)

```bash
# 0-2. token + ballot: docs/TESTNET.md §0–3 (unchanged)

# 3. vault (after forge init per TESTNET.md §3)
forge create contracts/CardVault.sol:CardVault \
  --rpc-url $SEPOLIA_RPC --private-key $DEPLOYER_KEY \
  --constructor-args <LIQUID_EDITION_ADDRESS> "https://upperdeckripmaster3030.com/api/card/{id}"

# 4. register the deck (ids/tiers straight from cards/manifest.json)
node scripts/export-vault-registration.mjs   # prints the calldata batches
cast send <VAULT> "registerCards(uint256[],uint32,uint8[])" <IDS> 1 <TIERS> ...
cast send <VAULT> "setSeason(uint32)" 2

# 5. rehearsal: two funded wallets
#    approve → ripPack ×2 → sendCard → trade → openMatch/joinMatch → resolveMatch
#    → confirm totalSupply dropped by exactly the tolls burned
```

## 8. Rehearsal checklist

- [ ] `ripPack` mints 7, tier spread looks like 48/30/15/6/1 over ~20 packs
- [ ] `sendCard` moves the card and `totalSupply` drops by `sendToll`
- [ ] `trade` swaps atomically, burns both tolls
- [ ] full pog cycle: open(7) → join(7) → resolve → winner holds 14
- [ ] `cancelMatch` refunds the stack, not the toll
- [ ] marquee: every move reverts while `currentSeason < 3`; wager/trade of id
      1000 always reverts; after `setSeason(3)` + `releaseMarquee`, `sendCard`
      burns 25 $UR3030
- [ ] site: pack rip animates from the chain event; arena vault = `balanceOf`
- [ ] `SeasonBallot.burnProgress()` visibly climbs from game activity alone

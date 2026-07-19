# Card Economy Spec — cards on-chain, every transaction burns

The site now plays the whole game client-side (arena, pack rips, the vault in
localStorage). This spec moves ownership on-chain on **Sepolia**, keeping one
house rule at the center:

> **Every transaction burns the liquid token.** Send a card — burn. Trade — both
> sides burn. Wager — both sides burn. Rip a pack — burn. There is no fee wallet
> and no treasury anywhere in the system; tolls are destroyed on use, so all
> activity is deflation, and deflation is the burn progress the renderer and the
> card backs already read.

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
the same five tiers the gallery sorts by and the foil engine renders.
`scripts/export-vault-registration.mjs` prints the id/tier batches straight from
`cards/manifest.json`.

Bare ERC-1155 transfers are **closed** (`safeTransferFrom` reverts). Cards move
only through the vault's named actions, so no path can skip the toll.

## 2. The actions and their burns

Defaults (curator-tunable via `setTolls`):

| Action | What happens | Burned |
|---|---|---|
| `sendCard(to, id)` | gift a card | 1 $UR3030 |
| `trade(b, idA, idB)` | atomic card-for-card swap | 1 $UR3030 **per side** |
| `openMatch(stack)` / `joinMatch(id, stack)` | pog-stack escrow — 1/2/3/4/7 cards a side, like-for-like | 2 $UR3030 per side |
| `resolveMatch(id, winner)` | winner collects both stacks from escrow | — (already paid) |
| `cancelMatch(id)` | un-joined match refunds the stack; toll stays burned | — |
| `ripPack()` | mint 7 cards weighted 48/30/15/6/1 by tier (same odds as pack.js) | 10 $UR3030 |
| marquee transfer | see §3 | 25 $UR3030 |

## 2.5 The Rarity Court — cards voted up, down, and off

Rarity is not fixed at print. Any token holder can burn $UR3030 at any time to
vote any card **up** (promote) or **down** (demote); the ballot never closes.

- `voteRarity(id, up, amount)` — burns `amount` and adds it to the card's signed
  **net conviction** (promote adds, demote subtracts). Settles immediately.
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

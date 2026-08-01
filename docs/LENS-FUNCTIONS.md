# The lens contract — every function

`contracts/Ripmaster3030Lens721.sol` · `Ripmaster3030Lens721 is ERC721, EIP712` · solc 0.8.24 viaIR · 18,349 B ·
31/31 tests (`npm run test:lens`).

One contract is both the **renderer** and the **ERC-721**. That is SuperRare's own
`LiquidLensMintable721SVGExample` pattern, not our invention.

---

## Read — anyone

| function | returns | notes |
| --- | --- | --- |
| `tokenURI()` | `string` | **Edition passthrough.** No id. Delegates to `editionRenderer` — this is the ERC-20 edition's own metadata, which is why the contract is a renderer at all. Reverts `NoRenderer` if unset. |
| `tokenURI(uint256 id)` | `string` | **Per-lens metadata**, ids 1–100. ⚑ Renders **without requiring a mint** — the 67 field cards are render-only, so OZ's default revert-on-nonexistent is wrong here and is deliberately overridden. |
| `card(uint256 id)` | `(cid, title)` | The IPFS CID and title behind a card. |
| `isLovebeing(uint256 id)` | `bool` | `pure`. Is this the holder-bound lens? |
| `owner()` | `address` | |
| `claimSigner()` | `address` | Whose EIP-712 signature `claimHero` accepts. |
| `editionRenderer()` | `address` | The edition renderer `tokenURI()` passes through to. |
| `collectionName()` / `collectionDescription()` | `string` | |
| `externalUrl()` / `lensBaseUrl()` | `string` | `lensBaseUrl` is what `animation_url` is built from — the live site framed in the token's media slot. |
| `tierOfHolder(address)` | `uint8` | **0–4 — the staking read.** That wallet's `$3030` balance mapped to a tier. ⚠ Cannot revert (see below). |
| `tierOf(uint256 id)` | `uint8` | The tier a CARD renders at — i.e. its owner's. Unminted ⇒ 0. |
| `tierName(uint8)` | `string` | `pure`. Ash · Spark · Ember · Flame · Inferno. |
| `edition()` | `address` | The `$3030` ERC-20 the tiers read. `address(0)` ⇒ tiers off. |
| `tierAt(uint256)` | `uint256` | Threshold i, in the token's base units. |
| `voucherUsed(bytes32)` | `bool` | Replay guard: a spent voucher digest. |
| `lovebeingOf(address)` | `uint256` | That wallet's Lovebeing id, 0 if none. |
| `lovebeingMinted()` | `uint256` | How many exist. |
| *(ERC-721)* | | `balanceOf` · `ownerOf` · `getApproved` · `isApprovedForAll` · `supportsInterface` · `name` · `symbol` |

## Write — anyone (with a valid voucher)

| function | notes |
| --- | --- |
| `claimHero(to, id, kind, deadline, sig)` | **The only public mint.** Ids 1–33 only (`NotHero` otherwise). `kind` 1 = gacha pack-claim, 2 = earned Season-1 game title. Guards: `VoucherExpired`, `VoucherSpent`, `BadSignature`, `AlreadyMinted`. ⚑ Because eligibility is decided by the **signer**, staking-gated or auction-won heroes need no contract change — see `docs/TREASURY.md` §3. |

## Write — owner only

| function | notes |
| --- | --- |
| `setCards(ids[], cids[], titles[])` | Batch-set art + titles. Emits `CardSet`. |
| `setClaimSigner(address)` | ⚠ Rotate the hot signing key without touching the owner key. |
| `setEditionRenderer(address)` | Repoint the passthrough. |
| `setUrls(external_, lensBase_)` | Changes what `animation_url` frames. |
| `setEdition(address)` | Points the tiers at the `$3030` ERC-20. `address(0)` turns them off. Emits `EditionSet`. |
| `setTiers(uint256[4])` | Ascending thresholds, base units. Reverts `TiersNotAscending` — order is not cosmetic, the read returns the highest threshold cleared. Emits `TiersSet`. |
| `setDescription(string)` | |
| `mintLovebeing(address to)` | Mints the holder-bound lens. One per wallet (`OnePerWallet`). |
| `transferOwnership(address)` | |

## Internal

`_update` — enforces the soulbind. Lovebeing is **non-transferable and non-burnable**; any move
after mint reverts `Soulbound`. · `_lovebeingJson` · `_animHtml` · `_escJson`.

## Events / errors

`CardSet(id, cid, title)` · `HeroClaimed(id, to, kind)` · `LovebeingMinted(to, id)`

`NotOwner` `BadId` `NotHero` `AlreadyMinted` `VoucherExpired` `VoucherSpent` `BadSignature`
`Soulbound` `OnePerWallet` `NoRenderer`

---

## What is NOT in here, and matters

- ~~No `balanceOf` read~~ — ✅ **BUILT (task #78).** See the tier section below.
- **No auction.** See `docs/TREASURY.md` §3; the recommended Season-1 route needs no change here.
- **No treasury logic.** The lens contract takes no payment at all. The pack split lives in the
  proposed `PackSink`, the game rake in `js/wager-payout.js`.
- **No royalty standard (EIP-2981).** If SuperRare's secondary pays creator royalties, confirm
  whether it reads 2981 — that is question 6 in `docs/ARTIST-REVENUE.md`, and adding the interface
  after deploy is impossible.
- ⚠ **`getMarketState()` word order is still unproven on the REAL edition.** Verified on Sepolia
  (word0 = rarePerToken); it can drift.


---

## ⚑ Tiers — staking, and why it cannot break the art

SuperRare's own docs name the render inputs a Liquid Lens may use: *"token price, trading activity,
and **holder balances**"*, and the Cohort-01 CLI guide repeats it. That last input **is** the
staking mechanism: no staking contract, no lock, no emissions, nothing to drain.

**The art acknowledges you; it does not pay you.** Tiers are purely aesthetic, which disposes of
the two obvious objections: a balance is borrowable for a snapshot, which matters if it gates value
and doesn't when it gates a colour; and there is no yield, so there is nothing to farm.

The ladder is anchored on the **pack** (~350 `$3030`), not on round numbers, so a holder can state
what they hold in the project's own unit of account:

| tier | name | holding | in packs |
| --- | --- | --- | --- |
| 0 | Ash | under 350 | — |
| 1 | Spark | 350 | one pack |
| 2 | Ember | 3,500 | ten |
| 3 | Flame | 35,000 | a hundred |
| 4 | Inferno | 350,000 | a thousand |

### ⚠ `tierOfHolder` MUST NEVER REVERT, and `try/catch` is not enough

It is called from `tokenURI`, so a revert there takes the metadata of **all 100 cards** offline at
once — on a marketplace, and permanently as far as any cache is concerned. Two guards, and the
second was found by a test rather than by reasoning:

1. `try/catch` around `balanceOf` — covers a token that reverts.
2. **`if (edition.code.length == 0) return 0;`** — Solidity emits a contract-existence
   (`extcodesize`) check *before* an external call that returns data, and a failure there is **not
   catchable by try/catch**. Without this line, setting `edition` to an address with **no code** —
   i.e. pasting a **wallet** address instead of the token's, the single most likely mistake anyone
   will make here — reverted `tokenURI` for the whole deck. The try/catch looked sufficient and
   wasn't.

Both are asserted in `npm run test:lens` against a deliberately reverting `HostileToken` and
against a bare EOA.

### ⚠ Owner-dependent metadata is not cacheable

Marketplaces cache `tokenURI` hard, and updates here are **pull-based** — SuperRare: *"a render
contract is not a background process… the market changes on-chain, metadata gets refetched, and the
artwork changes."* So the tier is exposed **twice**: as a metadata attribute (whenever a client
refetches) and as `tierOf()` / `tierOfHolder()`, which the live lens page can read directly and
which updates immediately. Check how SuperRare's frontend refreshes lens media before relying on
the attribute alone.

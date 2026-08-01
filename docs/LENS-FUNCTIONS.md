# The lens contract — every function

`contracts/UR3030Lens721.sol` · `UR3030Lens721 is ERC721, EIP712` · solc 0.8.24 viaIR · 18,349 B ·
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

- **No `balanceOf` read of the $3030 token.** Staking-as-render (`docs/ARTIST-REVENUE.md` §1) is
  designed and not built — task #78. It needs the token address and a tiered read inside
  `tokenURI(id)`.
- **No auction.** See `docs/TREASURY.md` §3; the recommended Season-1 route needs no change here.
- **No treasury logic.** The lens contract takes no payment at all. The pack split lives in the
  proposed `PackSink`, the game rake in `js/wager-payout.js`.
- **No royalty standard (EIP-2981).** If SuperRare's secondary pays creator royalties, confirm
  whether it reads 2981 — that is question 6 in `docs/ARTIST-REVENUE.md`, and adding the interface
  after deploy is impossible.
- ⚠ **`getMarketState()` word order is still unproven on the REAL edition.** Verified on Sepolia
  (word0 = rarePerToken); it can drift.

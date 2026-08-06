# The lens contract — every function, and what is actually on-chain

`contracts/Ripmaster3030Lens721.sol` · `Ripmaster3030Lens721 is ERC721, EIP712` · solc 0.8.24 viaIR
· **17,536 B deployed · 0 warnings · 89/89 (`npm run test:lens`)** — all three measured 2026-08-06,
not carried forward from a note. 7,040 B spare against the 24,576 B contract-size limit.

One contract is both the **renderer** and the **ERC-721**. That is SuperRare's own
`LiquidLensMintable721SVGExample` pattern, not our invention.

---

## ⛔ DEPLOYMENT STATUS — the lens is NOT DEPLOYED, on any chain

Read live off Sepolia with `npm run preflight` (keyless, `eth_call` only) on 2026-08-05.

| contract | source | address | status |
| --- | --- | --- | --- |
| **$UR3030 edition** (rehearsal ERC-20) | SuperRare's, via Rare CLI | `0xdc47e98b…Ec83C` | ✅ **live on Sepolia** — rehearsal only |
| **Ripmaster3030Renderer** (edition passthrough) | `contracts/Ripmaster3030Renderer.sol` | `0x948E6330…de903` | ✅ **live on Sepolia** — verified as `edition.renderContract()` |
| **Ripmaster3030Lens721** ← *this document* | `contracts/Ripmaster3030Lens721.sol` | — | ⛔ **NOT DEPLOYED ANYWHERE.** Built, 89/89, `chain-config.lens721: ""` |
| **PackSink** (50/50 split) | `contracts/PackSink.sol` | — | ⛔ **NOT DEPLOYED.** 51/51, 1,773 B, `packSink: ""` |
| **$3030 launch token** | SuperRare's, artist types `name`/`symbol` | — | ⛔ **NOT DEPLOYED.** Mainnet, artist's SuperRare-linked wallet |
| CardVault | `contracts/CardVault.sol` | — | **retired** — old ERC-1155 design, kept for history only |
| SeasonBallot | `contracts/SeasonBallot.sol` | — | **optional**, deliberately outside the launch architecture |

⛔ **NOTHING IS DEPLOYED ON MAINNET.** Everything above that is live is a Sepolia rehearsal.

⚠ **The rehearsal edition is frozen as `name()` "Upperdeck Ripmaster 3030" / `symbol()` "UR3030"** —
title case, retired studio name. Not a bug to fix: it is the standing exhibit for why the launch
deploy command is asserted character-for-character. The launch token is `ripmaster3030` / `3030`.

### What each un-deployed piece costs while it stays un-deployed

| empty | the site does this instead | who notices |
| --- | --- | --- |
| `lens721: ""` | collector seat door falls back to the **local vault**, flagged `verified:false` | nobody — it degrades quietly and honestly (`js/session.js`) |
| `packSink: ""` | `RipWallet.payPack/payRake` fall back to a plain **100% burn** | ⛔ **the site's copy is ahead of the code** — pages say half funds the studio, and all of it burns |
| `edition` unset *on a deployed lens* | all 100 cards render **`Holding: Ash · Tier 0`** | ⛔ **nobody, on-chain or off** — see the trap below |

### ⛔ PLANNED BUT NOT BUILT — game pot escrow is not in this contract

There are **three** states here, not two, and the third is the one that can embarrass the studio:
built-and-deployed, built-and-not-deployed, and **promised-and-not-built**.

Eight game result screens, `docs/ECONOMIC-FLOW.md`, `docs/MULTIPLAYER.md`, `docs/SEATS.md` and
`docs/STATE-OF-PLAY.md` all say real on-chain token-pot escrow *"ships with the 721 lens — Phase-2"*.
**It is not in `Ripmaster3030Lens721.sol`.** There is no escrow, no pot, no payout, no wager
function — `grep` finds none of it. Deploying this contract therefore does **not** deliver that
promise; it is a separate build that does not exist yet.

⚠ What *is* real today: the **rake burn** and the **card moves** (`js/wager-payout.js`,
`js/card-powers.js`). The pot split is displayed and settles **off-chain**. That is stated on the
result screens, which is the honest half — but "ships with the 721 lens" reads as *when the lens
lands, this lands*, and that is not true. Either build it or reword the copy; do not let a deploy
imply it.

---

## The three deploy-time permanents

Frozen the instant the transaction lands. Two have setters; the third does not.

| | value | fixable after deploy? |
| --- | --- | --- |
| ERC-721 `name()` | `ripmaster3030studios lens` | ⛔ **NO** — a redeploy |
| ERC-721 `symbol()` | `3030L` | ⛔ **NO** — a redeploy |
| **EIP-712 domain** | `ripmaster3030studios` | ⛔ **NO**, and worse: it is in every voucher digest. Change it after one real voucher is signed and they all die |
| on-chain `animation_url` byline | `ripmaster3030studios` | ⛔ **NO** — compiled into the bytecode |
| `externalUrl` / `lensBaseUrl` | `https://ripmaster3030studios.com[/cards/hero/]` | ✅ `setUrls()` — but marketplaces cache hard |

⚑ All five are pinned by `npm run test:name`, in **both** deploy routes. `docs/DEPLOY-LENS.md`'s
Remix table carried the retired name and domain until 2026-08-05 while `scripts/lens-cli.mjs` was
correct and pinned — **the tested route was the one nobody is sent down.**

---

## Read — anyone, no key

| function | returns | notes |
| --- | --- | --- |
| `tokenURI()` | `string` | **Edition passthrough.** No id. Delegates to `editionRenderer` — this is the ERC-20 edition's own metadata, which is why the contract is a renderer at all. Reverts `NoRenderer` if unset. **This is the one SuperRare calls.** |
| `tokenURI(uint256 id)` | `string` | **Per-lens metadata**, ids 1–100 (+ Lovebeing). ⚑ Renders **without requiring a mint** — the 67 field cards are render-only, so OZ's default revert-on-nonexistent is wrong here and is deliberately overridden. |
| `card(uint256 id)` | `(cid, title)` | The IPFS CID and title behind a card. |
| `isLovebeing(uint256 id)` | `bool` | `pure`. Is this the holder-bound lens? (`id > 1_000_000`) |
| `tierOfHolder(address)` | `uint8` | **0–4 — the staking read.** That wallet's `$3030` balance mapped to a tier. ⚠ Cannot revert (see below). |
| `tierOf(uint256 id)` | `uint8` | The tier a CARD renders at — i.e. its owner's. Unminted ⇒ 0. |
| `tierName(uint8)` | `string` | `pure`. Ash · Spark · Ember · Flame · Inferno. |
| `burnBps()` | `uint256` | **Burn progress, 0…10000 bps.** `maxTotalSupply − totalSupply` over the cap. 0 when the edition is unset or mute. ⚠ Cannot revert. |
| `marketSnapshot()` | `(live, burnBps, rarePerToken, tick, liquidity)` | **The whole market read in one call.** `live == false` ⇒ every other field is meaningless. ⚠ Cannot revert. |
| `lensState(uint256 id)` | `(live, tier, burnBps, minted, rarePerToken, tick, liquidity)` | **One eth_call for the live card page** — replaces four round-trips, and the numbers are read at one block so they cannot disagree. ⚠ Cannot revert. |
| `edition()` | `address` | The `$3030` ERC-20 the tiers **and the market read** point at. `address(0)` ⇒ **both off**. |
| `tierAt(uint256 i)` | `uint256` | Threshold `i`, in the token's base units. |
| `owner()` · `claimSigner()` · `editionRenderer()` | `address` | Admin, voucher signer, passthrough target. |
| `collectionName()` · `collectionDescription()` | `string` | |
| `externalUrl()` · `lensBaseUrl()` | `string` | `lensBaseUrl` is what `animation_url` is built from. |
| `voucherUsed(bytes32)` | `bool` | Replay guard: a spent voucher digest. |
| `lovebeingOf(address)` | `uint256` | That wallet's Lovebeing id, 0 if none. |
| `lovebeingMinted()` | `uint256` | How many exist. |
| `DECK()` · `HERO_MAX()` · `LOVEBEING_BASE()` | `uint256` | Constants: `100` · `33` · `1_000_000`. |
| `eip712Domain()` | *(struct)* | ERC-5267. Lets a wallet show what it is signing. |
| *(ERC-721)* | | `balanceOf` · `ownerOf` · `getApproved` · `isApprovedForAll` · `supportsInterface` · `name` · `symbol` |

## Write — anyone, with a valid voucher

| function | notes |
| --- | --- |
| `claimHero(to, id, kind, deadline, sig)` | **The only public mint.** Ids 1–33 only (`NotHero`). `kind` **1 = gacha pack-claim, 2 = earned game title** — bound into the signature, so a pack voucher cannot be replayed as a title. Guards: `VoucherExpired`, `VoucherSpent`, `BadSignature`, `AlreadyMinted`. Effects land **before** `_safeMint` so a re-entering receiver finds the id already taken. |

⚑ **Eligibility is decided by the SIGNER, so the hard part needs no contract change.** The 33 are
11 SuperRare auctions + 11 gacha pack-claims + **11 earned titles** (`docs/HERO-UNLOCKS.md`), and
the earned tier *cannot* be self-serve: every score in this project lives in `localStorage`, so a
player with devtools could claim any run in seconds. Because a **human** verifies before signing,
the criteria can be arbitrarily hard and need not be machine-checkable. `kind 2` covers all eleven.

## Write — owner only

| function | notes |
| --- | --- |
| `setCards(ids[], cids[], titles[])` | Batch-set art + titles. 100 separate transactions is a bad launch night. Emits `CardSet`. |
| `setEdition(address)` | ⛔ **THE SWITCH THAT TURNS STAKING ON.** `address(0)` = off. Emits `EditionSet`. |
| `setTiers(uint256[4])` | Ascending thresholds, base units. Reverts `TiersNotAscending` — order is not cosmetic, the read returns the **highest** threshold cleared, so an out-of-order table silently caps everyone at tier 1. Emits `TiersSet`. |
| `setClaimSigner(address)` | ⚠ Rotate the hot signing key without touching the owner key. |
| `setEditionRenderer(address)` | Repoint the passthrough. |
| `setUrls(external_, lensBase_)` | Changes what `animation_url` frames. |
| `setDescription(string)` | |
| `mintLovebeing(address to)` | Mints the holder-bound lens. One per wallet (`OnePerWallet`). |
| `transferOwnership(address)` | |

## Write — ERC-721 standard

`approve` · `setApprovalForAll` · `transferFrom` · `safeTransferFrom` ×2. All ordinary, **except
that Lovebeing ids reject every one of them** — see `_update`.

## Internal

`_update` — enforces the soulbind. Lovebeing is **non-transferable and non-burnable**; any move
after mint reverts `Soulbound`. · `_lovebeingJson` · `_animHtml` · `_escJson`.

## Events

`CardSet` · `EditionSet` · `TiersSet` · `HeroClaimed` · `LovebeingMinted` · plus ERC-721's
`Transfer` · `Approval` · `ApprovalForAll` and EIP-712's `EIP712DomainChanged`.

## Errors

`NotOwner` · `BadId` · `NotHero` · `AlreadyMinted` · `VoucherExpired` · `VoucherSpent` ·
`BadSignature` · `Soulbound` · `OnePerWallet` · `NoRenderer` · `TiersNotAscending`, plus OZ's
ERC-721 / ECDSA / ShortString sets.

---

## Who calls what

| caller | calls | when |
| --- | --- | --- |
| **SuperRare** (marketplace) | `tokenURI()` | renders the **edition**; pull-based, on refetch |
| **SuperRare / any marketplace** | `tokenURI(id)` | renders a **card**; pull-based, caches hard |
| `js/session.js` — collector door | `balanceOf(address)` | seating a collector. ⚠ falls back to the local vault while `lens721` is `""` |
| `js/lens-state.js` | *(the **edition**, not this contract)* `totalSupply()` `0x18160ddd` · `maxTotalSupply()` `0x2ab4d052` · `getMarketState()` `0xd8165743` | the live card's market read. ⛔ `0xd5abeb01` is `maxSupply()`, a **different** function that reverts on this edition |
| `scripts/lens-cli.mjs verify` | `name` `symbol` `owner` `claimSigner` `editionRenderer` `edition` `tokenURI()` `tokenURI(id)` `ownerOf` | post-deploy read-back, **no key** |
| `scripts/lens-cli.mjs tiers` | `edition` `tierAt` `tierName` `tierOfHolder` · writes `setEdition` `setTiers` | wiring and auditing staking |
| `scripts/lens-cli.mjs cards` | `setCards` | registering art |
| `scripts/lens-cli.mjs voucher` / `claim` | EIP-712 sign · `claimHero` | issuing and redeeming a hero |
| `scripts/lens-cli.mjs wire` | `setEditionRenderer` | repointing the passthrough |

---

## Staking — the tier ladder

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

### ⛔ Staking is OFF on a fresh deploy, and nothing says so

`edition` starts at `address(0)`. Every card then renders `Holding: Ash · Tier 0` — which is a
perfectly healthy-looking card. There is no revert, no event, no warning.

⚑ **Until 2026-08-05 there was no scripted way to make the call that fixes it.** `setEdition`
appeared only in the local-EVM test harness; `lens-cli.mjs`'s ABI did not carry it and
`DEPLOY-LENS.md` had no step for it — so a lens deployed by either documented route would have had
its whole staking feature switched off silently. **Same defect class as PackSink having no deploy
path**: built, reviewed, tested, unreachable. Now `lens-cli.mjs tiers` makes the call and `verify`
reports the state out loud.

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
against a bare EOA. ⚠ The cost of guard 2 is that a wrong `edition` **fails silently** — which is
why `lens-cli.mjs tiers --edition` refuses an address with no bytecode.

---

## The market read — what makes this a *Liquid* lens

Added 2026-08-06. Until then the contract read exactly **one** of SuperRare's documented inputs
(*"price, supply, liquidity, burn progress, balances"*) — balances. The edition's passthrough
renderer read the market, but that is the **edition's** card; nothing per-lens. A card in this deck
could say nothing about the market it lives in.

`_market()` reads `maxTotalSupply` · `totalSupply` · `getMarketState()` off the same `edition`
address the tiers use, and surfaces as `burnBps()`, `marketSnapshot()` and `lensState(id)`.

### ⛔ Three external calls means three more ways to take the deck offline

Every guard on `tierOfHolder` applies here and there are more of them, because this is reached from
`tokenURI` too. All five are asserted, and **three were proved by sabotage** — deleting the guard
and watching the suite fail by name:

| guard | what it stops | proved |
| --- | --- | --- |
| `edition.code.length == 0` | an EOA pasted in as the edition — not catchable by `try/catch` | ✅ |
| `max == 0` | division by zero on a token that returns no cap | ✅ **delete it ⇒ `tokenURI still renders` FAILS** |
| `supply > max` | **underflow ⇒ revert**, and a false burn figure | ✅ **delete it ⇒ `tokenURI` reverts, `burnBps` returns 3.5e76** |
| `max > type(uint256).max / 10_000` | **overflow ⇒ revert** on a token reporting an astronomical cap | ✅ **delete it ⇒ `tokenURI` reverts.** Found by re-reading the function, not by a failing test — every other path already returned neutral, so nothing pointed at it |
| per-call `try/catch` | a token that reverts on any one of the three | ✅ |

⚑ The sabotage output is the argument: the assertion that fails is *"tokenURI still renders"*. A
missing guard here does not produce a wrong number on one card — it takes **all 100 cards'
metadata offline at once**, on a marketplace, permanently as far as any cache is concerned.

### ⚑ Two interfaces, on purpose

`IERC20Balance` (just `balanceOf`) and `IEditionMarket` (the curve) are deliberately separate. The
tier read must keep working against a plain ERC-20 with no curve at all. Folding them into one
interface would compile fine and make every market call a *new way for `tierOfHolder` to fail* —
and `tierOfHolder` is called from `tokenURI`. Asserted: a token with balances and no market surface
still tiers correctly (35,000 ⇒ Flame) while `burnBps()` answers 0.

### ⚑ Why only `Burned` is baked into metadata

Marketplaces cache `tokenURI` hard and refetch on their own schedule, so **any attribute here is a
number that will be read late.** Burn is monotonic — it only rises — so a stale burn reads as *"at
least this much"*, which is true. A stale **price** or **tick** is a lie about what the token is
worth right now. So `Burned bps` is an attribute; price, tick and liquidity live only on
`lensState()`/`marketSnapshot()`, which the live page reads directly and immediately. A test asserts
no price or tick has crept into the metadata.

### ⚠ Owner-dependent metadata is not cacheable

Marketplaces cache `tokenURI` hard, and updates here are **pull-based** — SuperRare: *"a render
contract is not a background process… the market changes on-chain, metadata gets refetched, and the
artwork changes."* So the tier is exposed **twice**: as a metadata attribute (whenever a client
refetches) and as `tierOf()` / `tierOfHolder()`, which the live lens page can read directly and
which updates immediately. Check how SuperRare's frontend refreshes lens media before relying on
the attribute alone.

---

## To deploy what is not deployed

Runbook: `docs/DEPLOY-LENS.md` (Route A = Remix, recommended; Route B = `lens-cli`). Rehearsal:
`docs/LENS-REHEARSAL.md`. In order:

1. `npm run preflight` — keyless, free, confirms the chain is in the state you think it is.
2. `npm run test:lens` — **55/55 before spending gas.**
3. Deploy to **Sepolia first**, from the artist's SuperRare-linked wallet, with a **claim signer
   that is not the deployer**.
4. `lens-cli verify --at 0x…` — reads it back, and now names staking if it is off.
5. `lens-cli tiers --at 0x… --edition 0x…` — ⛔ **turns staking on.**
6. `lens-cli cards --at 0x…` — registers art (CIDs must be pinned first).
7. Paste the address into `js/chain-config.js` → `contracts.lens721`, commit. That one edit flips
   the collector seat door from the local vault to real on-chain ownership.

⚠ **The golden rule:** deploy from **the exact wallet connected to the verified SuperRare account**,
or the indexer will not associate the drop with the artist profile. A burner forfeits SuperRare.com
surfacing.

*NFA. Experimental art token — it can go to zero.*

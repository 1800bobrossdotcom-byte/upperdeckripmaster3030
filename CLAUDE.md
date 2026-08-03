# upperdeckripmaster3030 — project memory

> ⚠ **THIS FILE IS IN A PUBLICLY DEPLOYED REPO.** It was served at `/CLAUDE.md` (HTTP 200)
> until `.vercelignore` was added. Write it as if a stranger will read it, because one could:
> **no legal reasoning, no named third parties, no credentials or pointers to where credentials
> live, no unannounced commercial decisions.** Operational facts only. Anything sensitive goes
> to the artist directly, not into the repo.

*Read this first. It's the durable context for the $3030 launch. Canonical detail
lives in `docs/ECONOMIC-FLOW.md`; this file is the map.*

## What it is
A **card and game studio** whose token has staking functionality. Artist: **Gianni Arone
(lovebeing / @_lovebeing_)**, SuperRare **Liquid Editions — Cohort 01**.

## ⛔ RENAME IN PROGRESS — read before touching the token, the domain, or any copy
**Artist directive. Rationale is deliberately not recorded in this file — ask the artist.
This SUPERSEDES the old "NAME LAW".**

- **Ticker / `symbol()`: `3030`** (written `$3030`). Confirmed by the artist. Like `name()`,
  `symbol()` is baked in at deploy — hand SuperRare `3030`, not `RMS3030`, not `$3030`.
- ⛔ **THE TOKEN AND THE STUDIO HAVE DIFFERENT NAMES. Settled 2026-08-02.**
  | | string |
  | --- | --- |
  | studio · domain · wordmark · every page | **`ripmaster3030studios`** |
  | ERC-20 **`name()`** | **`ripmaster3030`** — no "studios" |
  | ERC-20 **`symbol()`** | **`3030`** |
  ⚑ This is deliberate, not a slip: the studio is `ripmaster3030studios`, and the token it
  issues is `ripmaster3030`. A company and its product may differ. **Nothing on the site
  changes** — the 258-file rename, the wordmark and `npm run test:name` all still enforce
  `ripmaster3030studios` everywhere a visitor looks.
  ⚠ `name()` is a POSITIONAL ARG the artist types into the Rare CLI and is frozen the moment the
  transaction lands. `npm run test:name` now asserts the **exact** string in every deploy command
  in `TESTNET.md`, `TOKEN-MATH.md` and this file, plus `token-metadata.json` — an EXACT match, not
  a substring, because `ripmaster3030studios` *contains* `ripmaster3030` and a substring test
  would happily pass the wrong one. That is the single likeliest way the wrong string reaches
  the CLI. **`--preview` first, read it back, then `--yes`.**
- ✅ **Name: `ripmaster3030studios`** — ONE word, lowercase, 3030 in the MIDDLE. Confirmed by
  the artist after being asked to disambiguate: it matches the domain `ripmaster3030studios.com`.
  ⚠ It is NOT `ripmasterstudios3030` (3030 on the end) — that ordering was written once in
  passing and explicitly rejected. `name()` is **baked in at deploy and unfixable**; this project
  already owns a token permanently stuck with a wrong name for exactly this class of slip
  (Sepolia's edition reads `"Upperdeck Ripmaster 3030"`, title case). Hand this exact string to
  SuperRare in writing and re-read `name()` before they broadcast. See task #70.
- ⛔ **`UR3030` IS GONE FROM EVERY LIVE SURFACE (2026-08-01).** Contracts renamed:
  `UR3030Lens721` → **`Ripmaster3030Lens721`**, `UR3030RenderPrototype` → **`Ripmaster3030Renderer`**
  (the contract name is public on Etherscan once verified). `$UR3030` → `$3030` across 258 files.
  ⚑ **THREE DEPLOY-TIME PERMANENTS were carried with it, and each is frozen at deploy:**
  the lens **EIP-712 domain** (`upperdeckripmaster3030` → `ripmaster3030studios`), the lens
  **symbol** (`UR3030L` → `3030L`), and the `"3030 per RARE"` trait the renderer emits on-chain.
  ⚠ **The EIP-712 domain is part of every voucher digest** — the contract and
  `scripts/lens-cli.mjs` must always agree, and changing it broke 6 tests instantly, which is the
  good outcome: it proved the coupling. **Once one real voucher is signed against a deployed
  contract, that string is frozen forever.**
  ⚠ Also corrected: the `rare liquid-edition deploy multicurve "…" "…"` command in `TESTNET.md`
  and `TOKEN-MATH.md` still carried the OLD name and symbol — a copy-paste trap of exactly the
  kind task #70 exists to prevent.
  ✅ **Left alone on purpose:** the Sepolia rehearsal records (`LENS-REHEARSAL.md`,
  `AUDIT-REPLY.md`, `LAUNCH-CHECKLIST.md`, the rehearsal log below). That edition's symbol really
  IS `UR3030`; rewriting history to match the new name would make the record false. Also untouched:
  `urm_*` localStorage keys — renaming them would wipe every collector's local vault.
- **Host: `ripmaster3030studios.com`**; `upperdeckripmaster3030.com` gets ported or redirected.
- ⛔ **THE OLD NAME IS DROPPED ENTIRELY — artist's call, 2026-08-01.** SuperRare had confirmed
  `upperdeckripmaster3030` references *could* remain as flavour; the artist has since decided
  they should not. **The studio has one name.** New surfaces carry `ripmaster3030studios` only.
  Old URLs keep resolving — this is an identity decision, not a link-breaking one — but nothing
  new should reintroduce the old name.
  *(Superseded: the earlier "SuperRare confirmed it may remain, it stays as flavour" line.)*
- ⚠ The old rule ("upperdeckripmaster3030 — one word, lowercase, EVERYWHERE, and the launch
  token MUST carry it") is **DEAD**. Anything still asserting it is stale; treat it as a bug.

*Historical note:* **upperdeckripmaster3030** was one word on purpose — it amplified the meme and
the clearance joke. ⛔ It no longer appears on new surfaces; see the directive above.

## 💰 REVENUE: half of every pack and every game rake funds the studio
**Artist directive.** Treasury `0x5C3b…d89F`. `docs/TREASURY.md` is canonical.
- **A pack no longer burns in full**: 50% burns, 50% to the studio. **The game rake's 5%/5% is
  the same 50/50 ratio**, so ONE contract does both — `contracts/PackSink.sol`, `buyPack()` and
  `payRake()` over a shared `_split()`, separate events only so pack revenue and game revenue
  stay distinguishable in the ledger.
- ⚑ **It CANNOT be two client-side transactions.** A wallet can sign the burn and reject the
  transfer — collector's tokens destroyed, studio unpaid, no pack owed. There is no ordering that
  fixes it, because there is no atomicity between two signatures. Hence a contract.
- No owner, no admin, no upgrade, no pause; both addresses `immutable`; holds nothing between
  calls. With no external audit, **"small enough to read in one sitting" is the whole safety
  argument.** `flush()` is permissionless *because* its destination is immutable, so opening it
  to everyone grants no power — an owner-gated sweep would have added the admin key the contract
  exists to not have.
- **`RipWallet.payPack/payRake` are wired everywhere and SHIP DARK**: with
  `chain-config.contracts.packSink` empty they fall back to the plain 100% burn, byte-identical
  to the rehearsed call. `result.split` says which ran, and `WagerPayout.splitLive()` asks
  `hasSink()` so all eight game result screens report reality from one place. **Deploy + paste
  the address is the only remaining step.**
- ⚠ **Approve-then-call means TWO wallet prompts.** `onStep` fires `'approve'` then `'pay'` so
  the UI can name each — an unexplained second prompt reads as a scam. One approval covers 12
  packs; **not unlimited**, though it would be safe here (PackSink's only `transferFrom` takes
  from `msg.sender`, so an allowance can only be spent by a transaction you sent yourself).
- ⚑ **`npm run test:split` exists because `test:pack` cannot prove the browser reaches the
  contract.** `js/wallet.js` hand-assembles calldata and every failure is silent — wrong selector
  hits the fallback, wrong offset approves the wrong spender, a missing `10^18` approves 350 wei.
  **Writing the two selectors from memory got BOTH wrong**; they are now recomputed from the ABI
  and asserted against the file. `npm test` = 31 + 17 + 51 + 38.
- ⚠ **"Treasury is ~3.2% of the float" IS THE WRONG DENOMINATOR** — corrected in `TREASURY.md`.
  The arithmetic is right, the measurement isn't: under mint-once most of `totalSupply` is unsold
  inventory still inside the AMM. Against tokens that actually LEFT the curve the studio holds
  **50%**, and **100%** of everything not burned, because it takes half of every pack by
  construction. Whether that is 3% or 80% of real circulating supply is a demand assumption, not a
  fact. ⚑ Price risk is genuinely small at 33M (dumping the slug moves spot ~−6.8%, vs −53.7% at
  the old cap — the supply change defused that); **concentration risk is the opposite of small.**
  Do not quote 3.2% as reassurance.
- ✅ **THE EDITION GRADUATES TO A DEX** (artist, 2026-08-01) — timing unknown. ⚑ Load-bearing for
  liquidity: **before graduation there is nothing to provide liquidity TO** (curve depth is placed
  once at deploy, no documented top-up path), so every "contribute to the pool" feature is gated on
  it. Threshold, LP ownership, and whether third parties can add are questions 5/14 to SuperRare.
- ⚠ **RESERVE-SEED CONTRADICTION, unresolved.** `docs/CURVE-TARGET.md` and `docs/TOKEN-MATH.md`
  both record a ~10,000 RARE seed at deploy (`max(2×minRareLiquidityWei, 10k)`); `token-model.mjs`
  prints reserve = **0** at launch. One is wrong, and it decides **whether there is any bid below
  spot on day one** — i.e. whether the first seller walks the curve down alone. Question 11.
- ✅ **Rip Rocketer's flat 25-token launch fee goes 100% TO THE TREASURY** (artist's call,
  2026-08-01) — it does not split and it does not burn. ⚑ **No contract needed, and that is the
  lesson**: PackSink exists because a *split* is two operations that must not half-execute; paying
  one address is ONE operation, i.e. a plain ERC-20 `transfer`, atomic by definition. Routing it
  through the sink would have added an approval and a second wallet prompt to buy nothing.
  `RipWallet.payTreasury()` is the whole implementation. **Reach for the contract when there is
  something to make atomic, not by habit.** Fails closed (`no-treasury`) rather than falling back
  to a burn — a fallback that performs a *different economic action* is worse than a refusal. The
  word "burn" is gone from that game's copy in both builds.

## ⛔ NO SEASONS — the pack schedule is TIERED (artist directive, 2026-08-01)
**"We are a game studio now."** Four **TIERS** of dwindling allotment and rising floor —
1,600 → 1,100 → 600 → 260 packs — and **a tier opens when the one before it SELLS OUT, not on a
date.**
- ⚑ **A real change, not a rename.** A season is a promise about TIME: call it "Summer" and you
  owe the public a drop every summer forever, and missing one is a visible failure at something
  nobody had to promise. A tier is a promise about SUPPLY, equally honest whether it takes three
  weeks or three years. It also matches the standing "work like we don't have a deadline" rule.
- ⚠ **The NUMBERS ARE UNCHANGED** — same allotments, same base/ceil, so every burn/float/treasury
  figure is identical. `token-model.mjs`'s `SEASONS` is now `TIERS`; §4 prints "PACK ALLOTMENT BY
  TIER". Regenerated: `index.html` (countdown, marquee, tier strip, rite §2/§3), `tokenomics.html`,
  `whitepaper.html/pdf`, `audit.html`, `ECONOMIC-FLOW.md`, `TREASURY.md`.
- ⚠ **The 33 heroes are now "the genesis set", not "Season-1"** — same thing, no calendar.
- ⚠ **Still seasoned, deliberately left alone:** ~200 placeholder card pages carry a
  `season: II · card 31` print-run line on the back. That is card-back METADATA, a different
  concept, and the whole deck is being clean-slated anyway (task #71). Decide it there.
- ⚠ `index.html`'s CSS class names are still `.season`/`.seasons` — cosmetic only, left to avoid
  churn; the markup and copy say Tier.

## ✅ SUPPLY SETTLED: **3,300,000** (artist, 2026-08-02) — the 33,000,000 direction is REVERSED
**Run `npm run model` for the live numbers; `scripts/token-model.mjs` is the only source.**

⚑ **THE DECISION RESTED ON ONE FACT, and it is worth keeping at the front of the head: the pack
burn is denominated in TOKENS PER PACK (350 → 1,200), so the four-tier total is a FIXED
1,014,375 whatever the cap is.** The cap changes nothing except what fraction that is:

| cap | four-tier burn | % of mint | contraction | studio slug as % of surviving float |
| --- | --- | --- | --- | --- |
| 33,000,000 | 1,014,375 | 3.1% | 1.03× — none | ~3.2% |
| **3,300,000 ← SETTLED** | 1,014,375 | **30.7%** | **1.44× — material** | ⛔ **44.4%** |
| 3,030,000 (original) | 1,014,375 | 33.5% | 1.50× | ~50% |

⛔ **THE COST IS THE MIRROR IMAGE OF THE BENEFIT, and it must never be quoted separately.** The
50/50 split sends the *same number of tokens* to the fire and to the studio. So any cap that makes
the burn look material makes the treasury look large **by exactly the same arithmetic** — you
cannot have one without the other while the split is 50/50. At 33M the burn was cosmetic and the
slug was negligible; at 3.3M the burn is real and **the studio ends up holding 44.4% of everything
still alive.** ⚠ Raising the cap to 33M had *defused* the treasury's price impact (dumping the slug
moved spot ~−6.8% vs ~−53.7% at ~3M); **coming back to 3.3M re-arms it.** The contract did not
change; the denominator did. `docs/TREASURY.md` leads with this, `token-model.mjs` refuses to print
one number without the other, and the landing page's rite §3 states both in the same breath.

⚠ **It is material, and it is NOT a 3× scarcity engine** — do not let anyone round 1.44× up.
Reaching 3× needs ~618 tokens/pack against today's ~285, about 2.2× more, which forces P0 down by
the same factor. (At 33M that same gap was 11×, which is what made the deflation claim
indefensible there; at 3.3M it is a tuning question rather than a different product.)

⚠ Regenerated with the new cap: `tokenomics.html`, `whitepaper.html/pdf`, `audit.html`,
`index.html`, `docs/TREASURY.md`, `docs/CURVE-TARGET.md`, `scripts/burn-milestones.mjs`.
`npm run test:name` now pins the derived figures (30.7% · 1.44× · 44.4%) so a cap edit that
misses the percentages fails the build.

### ⚠ Historical — the 33M reasoning, kept because it is why 3.3M was chosen
**Artist directive at the time: an indie game company with a live 33,000,000 supply.**

⛔ **The deflation story does NOT survive the supply change on its own.** Reran
`scripts/token-model.mjs` at CAP 33,000,000 with the pack schedule untouched:

| | old (3.03M cap) | 33M cap, same packs | **+ the 50/50 split (LIVE)** |
| --- | --- | --- | --- |
| four-season sellout burn | 2,028,750 | 2,028,750 (packs burn tokens, not %) | **1,014,375** |
| as % of mint | 67% | 6.1% | **3.1%** |
| settled float | ~1.01M | ~30.97M | **~31.99M** |
| permanent contraction | **3.0×** | 1.07× | **1.03× — none** |

⚑ **The 50/50 split halves it again**, and to the studio instead: ~1,014,375 $3030 over four
seasons. `token-model.mjs` was burning 100% of every pack until 2026-08-01, so **any burn figure
from an older run — or any doc that copied one — is DOUBLE the truth.** `BURN_SHARE = 0.50` now,
and the treasury column is printed rather than dropped. Regenerated with it: `tokenomics.html`,
`audit.html`, `whitepaper.html/pdf`, `index.html`, `ECONOMIC-FLOW.md`, `CURVE-TARGET.md`.
⛔ **`docs/TOKEN-MATH.md` is stale on BOTH axes and is banner-marked, not patched** — a correct
rewrite needs the unmade 33M decision, and a doc silently edited to look current is worse than
one plainly marked dead.

The burn is denominated in TOKENS per pack (350 → 1,200 across seasons), so multiplying the cap
by 10.89 does not multiply the burn. To keep a 3× contraction you must burn ~22M over ~3,560
packs ≈ **6,180 tokens/pack average, ~11× today's**. At a ~$7 pack that means the token has to
OPEN about 11× cheaper (P0 ≈ 0.09 RARE rather than 1 RARE), or packs cost far more, or deflation
stops being the headline. **This is an unmade decision — do not present 3× deflation as fact.**

⚠ `token-model.mjs` currently prints "a 3.0× permanent contraction" at 33M, which is WRONG: it
derives the float from `LIFETIME_BURN_BUDGET` (an assumption) rather than from what the pack
schedule actually burns. Fix the script's summary when the new numbers are chosen.

## Launch
- **Target: August 6, 2026 · 11:11 PM ET** (= `2026-08-07T03:11:00Z`, EDT/UTC-4). Full real
  launch (token + lenses + site). ✅ **CONFIRMED by the artist 2026-07-27.** (August in New
  York is EDT, so "11:11 PM EST" = 11:11 PM EDT = `03:11Z`; the landing countdown already
  targets exactly this — verified, no change needed.)
- **No external security audit** (artist's call). Substitute: a **Sepolia dress rehearsal +
  internal review** are the non-negotiable safety net.
- **100 handmade cards are being made by the artist.** The cards on the site today are
  **PLACEHOLDER** (a 196-card set) — a **clean-slate to an empty deck is pending**.

## Model v2.2 (canonical: `docs/ECONOMIC-FLOW.md`)
- **$3030** — one ERC-20 SuperRare Liquid Edition, **mint-once**, cap **3,030,000**, opens
  ~1 RARE/token; **burns permanent**; deflates **~3× → ~1.01M floor**, driven only by packs.
- **Every card is a LENS** = a render keyed by card id on **one combined renderer + ERC-721
  lens contract**. **ERC-721 only — ERC-1155 is nixed.**
- **Deck = 100 cards:** **33 hero 1/1s** minted (**11 SuperRare auctions + 11 gacha pack-claims +
  11 earned titles** — artist directive 2026-08-01, replacing the old 11+22) + **67 render-only
  field lenses** (mint later) + **Lovebeing**, a **holder-bound lens** (one per wallet,
  non-transferable, non-burnable). The 33 are a **genesis set** that persists all tiers.
  - ✅ **THE ELEVEN EARNED TITLES ARE STATED — `docs/HERO-UNLOCKS.md`**, printed in full on
    `whitepaper.html#titles`. The artist asked *"they need to be hard enough"*; each is a named
    feat in a named cabinet, first claimant takes it and it closes. ⚠ Names, numbers and which
    card ids go where are **his review**, not a blank page.
  - ⛔ **THE LOAD-BEARING FINDING: the earned tier CANNOT BE SELF-SERVE.** Every score in this
    project lives in `localStorage` — the whole persistence layer is four keys — so a player with
    devtools can claim any run in seconds, and a hero 1/1 is real value. ⚑ **The fix was already
    built**: `claimHero()` mints only against an EIP-712 voucher (`kind 2` = game title), so a
    human decides and the chain enforces it. That inverts the problem usefully — **because a
    person verifies before signing, the criteria can be arbitrarily hard and need not be
    machine-checkable.** No contract change; `kind 2` covers all eleven. The site says out loud
    that the studio is the judge and why a machine cannot referee it.
  - ⚑ **No title can be bought** — nothing keys on holding, ripping or burning more. Ethics, and
    it also closes the flash-borrow hole in one line: a balance is borrowable for one block, a
    feat is not.
  - ⚠ **A condition that merely SOUNDS hard is worse than none.** Cloud Racer's title was drafted
    as *"win a race without braking"*; `crpc-game.js`'s own 6-pilot × 3-lap × 5-seed battery puts
    the airbrake **last of four verbs at 0.29 s out of a 38 s race** — the easiest of the eleven
    while reading like one of the hardest. Replaced with the light-strips (0.96 s, the biggest
    verb on that track). **Check the number before publishing the rule.**
  - ⚠ Economics do not move: all 33 mint as 1/1s either way. This is distribution, not supply.
- **Packs:** ~$7 escalating buy-and-burn, ~3,560 over 4 seasons (S1 1,600 → S4 260).
- **Games:** wager **$3030 + cards** into a pot; a **small ~10% rake burns** (deflationary,
  real on-chain via `js/wager-payout.js`), the rest + cards pay the **podium 1st/2nd/3rd
  (50/30/20), 1st the most** (1v1 = winner-take-pot). Cards transfer, never burned in-game.
  Real token-pot escrow/payout = **Phase-2 721-lens contract**; today the rake burn + card
  moves are the real part. Card→power is live (`js/card-powers.js`).
- **Cards never retire/ash.** Scarcity = dwindling packs + community rarity vote + compression.

## Render contract (see `docs/RENDER-CONTRACT.md`)
- SuperRare pattern: `tokenURI()` = edition passthrough; `tokenURI(uint256 id)` = per-lens.
  First-party template **`LiquidLensMintable721SVGExample.sol`** = exactly our combined
  renderer+721. `contracts/Ripmaster3030Renderer.sol` IS the passthrough renderer (done).
  ✅ **BUILT: `contracts/Ripmaster3030Lens721.sol`** — render-by-id + ERC-721 + EIP-712 voucher
  mint. **WE build the contracts; SuperRare provides connectivity/deployment/platform**
  (artist directive 2026-07-27). `tokenURI(id)` renders ids 1–100 **without requiring a
  mint** (the 67 field cards are render-only — OZ's default revert-on-nonexistent is wrong
  here). `image`=ipfs://CID, heroes add `animation_url`. Heroes mint by voucher (kind 1
  gacha / 2 game title); 34–100 can't mint. Lovebeing soulbound via `_update`. solc 0.8.24
  viaIR, 0 warnings, 18,349 B. **31/31 EVM tests: `npm run test:lens`** — including the full
  chain `MockLiquid → RenderPrototype → Lens.tokenURI()` (a 350 pack-burn moves the delegated
  render 0→350), so the passthrough is proven, not assumed. Sepolia rehearsal tooling +
  runbook: `scripts/lens-cli.mjs` (`npm run lens`) + `docs/LENS-REHEARSAL.md`. ⚠ Still
  unproven on the REAL edition: `getMarketState()` word order can drift.
- **Sepolia addresses (verified on-chain 2026-07-27, not from memory):** edition
  `0xdc47e98b…d89F`-owned `0xdc47e98b35Da73956fa7cCD450f8feEA746Ec83C`; **LIVE renderer
  `0x948E633054c516253D21d313aC789B37935de903`** (lowercase `name()`, emits `animation_url`
  framing the site, per-RARE 0.06). ⚠ `chain-config` had carried the superseded
  `0xEB5Dc231…FDFF7` (title-case name, no animation_url, per-RARE truncated to 0) — **always
  read `edition.renderContract()`, never trust a recorded address.** `lens721` still unset.
- Deploy from the **artist's SuperRare-linked wallet** or it won't surface on superrare.com.
- ✅ **RESOLVED 2026-07-27 — both former blockers are closed:**
  **(a) Deploy path = ASSISTED, via SuperRare.** We do not self-deploy. ⚑ Consequence: the
  launch token's `name()` is set by whatever WE HAND SUPERRARE, and it is unfixable
  post-deploy. ⛔ **The string is NOT `upperdeckripmaster3030` any more** — see the RENAME
  section at the top of this file. Ticker `$RMS3030`, name
  **`ripmaster3030studios`** (one word, lowercase, 3030 in the middle — confirmed by the artist,
  matches the domain). Hand exactly that, in writing, and re-read `name()` before broadcast.
  **(b) Curve calibration = SuperRare's**, they walk the artist through it. The uncalibrated
  Sepolia curve (1 UR3030 ≈ 16 RARE) does not carry over.

## ✅ Staking = the lens reads your balance — BUILT (task #78)
`Ripmaster3030Lens721.tierOfHolder(addr)` / `tierOf(id)` / `tierName(t)`, wired into `tokenURI(id)` as
`Holding` + `Tier` attributes. `setEdition` points it at the $3030 ERC-20; `address(0)` = off.
**55/55 `npm run test:lens`** (was 31), 16,155 B, 0 warnings.
- **The ladder is anchored on the PACK, not round numbers** — 350 / 3,500 / 35,000 / 350,000 =
  one pack, ten, a hundred, a thousand. Ash · Spark · Ember · Flame · Inferno (fire, because the
  token burns so the art can live). A holder can say what they hold in the project's own unit.
- ⚑ **`tierOfHolder` MUST NEVER REVERT** — it is called from `tokenURI`, so a revert takes the
  metadata of ALL 100 CARDS offline at once, on a marketplace, permanently as far as any cache is
  concerned. Two guards, and **`try/catch` alone is NOT enough**:
  ⛔ **Solidity's contract-existence (`extcodesize`) check fires BEFORE the call and is NOT
  catchable by try/catch.** So `if (edition.code.length == 0) return 0;` is load-bearing — without
  it, setting `edition` to an address with no code (i.e. **pasting a wallet address instead of the
  token's**, the likeliest mistake anyone will make here) reverted `tokenURI` for the whole deck.
  **Found by the test, not by reasoning** — the try/catch looked sufficient and wasn't. Asserted
  against `contracts/test/HostileToken.sol` and against a bare EOA.
- ⚠ **`"Deck":"Season I"` was baked into the on-chain metadata** of all 100 cards and was caught
  before deploy during the seasons→tiers pass. It now reads `Genesis`, and a test asserts no
  `Season` string survives.
- ⚠ Owner-dependent metadata is **not cacheable** and updates are pull-based, so the tier is
  exposed twice: as an attribute (on refetch) and as `tierOf()` for the live page (immediate).

## Staking — the design note (SuperRare's own documented input)
SuperRare's *Introduction to Liquid Editions* says Liquid Lenses "can use that state as creative
input" and names the inputs: **token price, trading activity, and HOLDER BALANCES**. That last one
is the staking mechanism — no staking contract, no emissions, nothing to drain.

- `Ripmaster3030Renderer.sol` already reads `getMarketState()` and derives burn from
  `maxTotalSupply − totalSupply`. It does **not** read `balanceOf`. **That is the missing input.**
- Design: `tokenURI(id)` knows the lens's owner → read that owner's `$3030` balance → drive the
  render from it, in **tiers**. The art acknowledges you; it does not pay you. That is the
  anti-casino ethos ("the tangible prize is the having-done-it") expressed as a mechanic.
- Composes with what exists: `claimHero()` already mints only against an EIP-712 voucher, so the
  signer can gate hero eligibility on held balance with **no contract change**.
- ⚠ Owner-dependent metadata is **not cacheable** and marketplaces cache `tokenURI` hard — check
  how SuperRare's frontend refreshes lens media before committing.
- ⚠ Balance is instantaneous, so it is borrowable for a snapshot. Fine when the prize is purely
  aesthetic; **not** fine if it ever gates real value — use held-over-time, off-chain, for that.

⛔ **SuperRare's public docs do NOT state** the creator revenue model, the buy/sell fee split and
who receives it, the curve mechanism or any DEX graduation, or how the opening price is set.
**Ask them. Do not model revenue until they answer.**

## ⚑ Liquid Editions CLI — corrections from SuperRare's own Technical CLI Guide
*Source: SuperRare "Liquid Editions: Technical CLI Guide (Cohort 01)" + the public
"Introduction to Liquid Editions" help article. Read them, don't reason from memory.*

- ⛔ **"Deploy path = ASSISTED, we do not self-deploy" was WRONG.** Whitelisted artists may use
  **either** the guided SuperRare create flow **or** the Rare Protocol CLI. Via the CLI the
  artist deploys it themselves:
  ```
  npm install -g @rareprotocol/rare-cli          # Node 22+
  rare configure --chain sepolia --private-key-ref op://…   # 1Password ref; key NOT stored plaintext
  rare liquid-edition deploy multicurve "ripmaster3030" "3030" \
    --curve-preset medium-demand --description "…" --image ./art.png --preview
  ```
  ⚑ **`name` and `symbol` are POSITIONAL ARGS the artist types** — they are not handed to
  SuperRare and hoped for. `--preview` first, `--yes` to submit. This de-risks the naming
  problem enormously: preview, read it back, then commit.
- ⚑ **The curve is a PRESET, not a hand-calibration.** `--curve-preset medium-demand` is what
  `token-model.mjs`'s `M = 10` was already modelling. **`--preview` prints the generated curve
  without submitting — that is how to get real numbers instead of assumed ones.** Run it on
  Sepolia before modelling anything further.
- ⚑ **THE GOLDEN RULE:** a whitelisted artist MUST deploy from **the exact wallet connected to
  their verified SuperRare account**, or the indexer will not associate the drop with the artist
  profile. A burner/dev wallet forfeits SuperRare.com surfacing.
- ✅ **Render contracts may read `balances`** — stated outright: they "can read price, supply,
  liquidity, burn progress, balances, and related on-chain state at fetch time." This is the
  second independent confirmation of the staking design above.
- ⚑ **Updates are PULL-BASED**: "a render contract is not a background process… the market
  changes on-chain, metadata gets refetched, and the artwork changes." So owner-dependent
  metadata works, but only as fast as clients refetch — the caching caveat is real.
- ⚠ **"SuperRare does not provide custom development support or QA for custom renderers"**, and
  "you are fully responsible for ensuring your custom renderer correctly outputs the dynamic
  states." With no external audit, the Sepolia rehearsal + internal review are genuinely the
  only safety net. Nobody else is checking this.
- Example render contracts: <https://github.com/superrare/liquid-editions-starter-kit/tree/main/src/examples>
- ⛔ **Still NOT stated anywhere SuperRare has published:** the creator revenue model, the
  buy/sell fee split and who receives it, and how the opening price is set. Ask them directly.

## Curve: the REAL multicurve shape (from SuperRare's create-flow, 7 steps)
Artist directive: **we take the Custom path** ("start from your last selected preset and edit
every segment manually"). Presets are low / medium / high / custom.

- **medium** — "middle-ground starting price with supply concentrated through the middle of the
  curve, which is where real price discovery usually happens."
- **high** — back-loaded on purpose; "withholds about half the visible supply for the highest
  band… only right if you expect a genuinely hot launch."
- **low** — "lower starting price with more supply available earlier… easy entry and softer
  price discovery."

**Medium's actual shape** — three stacked curves, each split into overlapping *positions*:

| curve | price range | share of supply | positions | start points |
| --- | --- | --- | --- | --- |
| 1 | 2.0× | 10% | 3 | P1 0%, P2 33%, P3 67% up the range |
| 2 | 5.0× | 65% | 2 | P1 0%, P2 50% |
| 3 | 10.0× | 25% | 2 | P1 0%, P2 50% |

⚑ **"Positions are overlapping liquidity bands, not extra supply slices.** Within one curve the
first position opens earliest and spans the widest range; later positions activate only after
price has already moved higher." Every position ends at the same upper cap.

**Tick conversion uses live prices** — the flow showed ETH/USD **$2,043**, RARE/ETH **0.000008**,
RARE/USD **$0.0159**. ⚠ `token-model.mjs` assumes `RARE_USD = 0.02`. Use their number.

**Buy simulation** (their tool, on a 1,000,000-token example): a **$2,000** budget consumed
**9,211 tokens** (0.92% of curve supply) at an average of **$0.22**, ending at **$0.24** with a
**$236K** end market cap and only **1 curve touched**. ⚠ Our model's `P0 ≈ 1 RARE ≈ $0.02` is an
order of magnitude below what their own example opens at — **re-derive P0 against 33M supply
from the flow's preview, do not carry the old assumption forward.**

**Step 6 — fallback artwork:** PNG/JPEG/GIF/MP4/MOV/**HTML**/GLB/WebM, **250 MB** limit, MP4
under 2345×2345. "This artwork will serve as the initial fallback metadata… when you later
connect a render contract, that will become the default source."

## ⛔ The SuperRare embed must be WALLET-FREE — `superrare.html`
**SuperRare's security team flagged this; they were right.** `cabinet.html` loads `js/wallet.js`
and performs WalletConnect burns — it is **NOT** for embedding.

- `superrare.html` is what `animation_url` points at: a showcase + how-to that sends people to
  the studio site. **No injected provider, no WalletConnect, no signing, no connect button** —
  not behind a click, a flag, or an opt-in.
- Why: a frame that asks for a wallet is indistinguishable from one that has been swapped for a
  malicious frame. Teaching collectors that embedded art asking for a wallet is normal is the
  exact reflex phishing needs.
- **Read-only `eth_call` over `fetch` is allowed** — it can show state, it cannot move anything,
  and the page degrades to static copy when blocked (which it will be in a sandboxed frame).
- Guarded by **`npm run test:embed`** — 17 assertions; fails if any wallet identifier or any
  `<script src>` reappears. A comment does not survive a hurried edit; a failing test does.
- ⚑ Selector trap: `maxTotalSupply()` is **`0x2ab4d052`**. `0xd5abeb01` is `maxSupply()`, a
  different function that **reverts** on this edition. Verified against the chain, not guessed.

## ⛔ THREE DEPLOY-TIME PERMANENTS WERE STILL WRONG ON 2026-08-02 — four days out
Found while wiring the Sepolia run. None was reachable by any check that existed, because
`npm run test:name` mirrors `.vercelignore` and therefore skips `scripts/` and `contracts/` —
and "does not ship to the CDN" is **not** the same as "cannot hurt you":
- **`scripts/lens-cli.mjs` passed the RETIRED DOMAIN as the lens's `externalUrl` AND
  `lensBaseUrl`.** Every token minted would have been born with `external_url` and
  `animation_url` on `upperdeckripmaster3030.com`. ⚠ Recoverable — `setUrls()` exists — but
  marketplaces cache metadata hard, so "recoverable" and "not visible on the collector's card for
  a week" are different things.
- ⛔ **`Ripmaster3030Lens721.sol` generates the `animation_url` HTML ON-CHAIN and its byline read
  `upperdeckripmaster3030`.** There is **NO SETTER** for that one — the string is compiled into
  the bytecode. Fixing it after a deploy means deploying a new contract.
- ✅ The **EIP-712 domain** was already correct (`ripmaster3030studios`). It is now pinned, because
  it is part of every voucher digest: change it after one real voucher is signed and they all die.
⚑ `npm run test:name` now pins all three explicitly (42 assertions). The lesson is the same one as
the `og:image`, one layer deeper: **a surface nobody looks at rots, and "it isn't deployed" is not
the same as "it isn't shipped".** A constructor argument ships.

## ✅ PackSink HAD NO DEPLOY PATH — `lens-cli.mjs sink` / `deploy-sink`
It was written, reviewed and tested (51/51) and there was **no scripted way to get it on-chain**,
so the one contract standing between the site's stated 50/50 revenue split and what the code
actually does was blocked on somebody hand-rolling a deployment. Compiles clean through the CLI's
own settings: **1,773 bytes, 0 warnings** — which is also the safety argument, since with no
external audit "small enough to read in one sitting" is all there is.
- ⚠ **Both constructor addresses are `immutable`.** A wrong one is not a setting to change later,
  it is a redeploy — and a wrong treasury sends every pack's studio half somewhere nobody controls.
  `deploy-sink` refuses an address with no bytecode (pasting a wallet where the token goes is the
  likeliest slip) and `sink` reads both back and diffs them against `chain-config`.
- `sink` also reports the contract's balance: it should hold nothing between calls, and `flush()`
  is permissionless so anyone can clear it.

## Deploying the lens — see `docs/DEPLOY-LENS.md`
- **Route A (recommended): Remix.** `npm run flatten` → `contracts/build/Ripmaster3030Lens721.flat.sol`
  (19 sources inlined); paste into Remix, compiler **0.8.24 + optimizer 200 runs**, Injected
  Provider. The key never leaves MetaMask. `scripts/flatten.mjs` recompiles its own output and
  **refuses to write unless the executable bytecode is byte-identical** to the normal build;
  it strips the trailing CBOR metadata first, since that hashes source paths and must differ.
  ⚠ The entry file's pragma wins on purpose — taking the first pragma seen inherited OZ's
  looser `^0.8.20` and invited Remix to compile a `^0.8.24` contract on 0.8.20.
- **Route B:** `npm run test:lens` then `node scripts/lens-cli.mjs deploy --renderer … --signer …`.
- ⚑ **Constructor: renderer 3rd, signer 4th.** Use the LIVE renderer
  `0x948E633054c516253D21d313aC789B37935de903`, and **use a different wallet for the claim
  signer than the owner** — the signer is a hot key used all season, the owner can repoint
  every card. `verify` warns when they match; `setClaimSigner` can fix it later.
- After deploy: `lens-cli verify --at 0x…` (no key), then `cards`, then record the address in
  `chain-config.contracts.lens721` — that flips the collector seat door to real ownership.

## Hero lenses (cards 1–33) — see `docs/HERO-LENS.md`
- **Heroes are live HTML, not flat art.** `scripts/build-hero-lens.mjs` wraps an authored
  `NN - TITLE.html` (or `.gif`) into a standalone `cards/hero/<n>.html` — the page the
  token's `animation_url` frames. Numbering: **1–33 heroes** (html/gif), **34–100 field**
  (png, via `scripts/ingest-deck.mjs`) = model v2.2's 33+67.
- ⚠ The lens loads in a **sandboxed iframe at an opaque origin**: `localStorage` THROWS, no
  injected wallet, no `window.parent`, no external requests, unknown size. Author against
  `cards/hero/_template.html`, which encodes all of it.
- ⚠ **Aspect trap:** `height:100%` + `max-width:100%` makes `aspect-ratio` silently yield —
  measured 0.571 instead of 2:3 in a 320×560 phone slot. Fixed with paired
  `min/max-aspect-ratio` media queries. Always test a hero at 320px wide in a real
  sandboxed frame.

## ⛔ THE NAME LAW IS A TEST NOW — `npm run test:name` (task #99's neighbour)
**The rename to `ripmaster3030studios` touched 258 files on 2026-08-01 and was STILL WRONG on
200+ live surfaces a day later.** Not obscure ones:
- `gate.js` — the **pre-launch veil's logo**, i.e. the first thing every visitor sees, was the
  old-name bitmap **with an `alt` that already read the new name**. The mismatch sat inside one tag.
- `index.html` **`og:image` + `twitter:image`** — the same bitmap. Every share, every unfurl.
- whitepaper/tokenomics/audit/artist `og:image` — **`marquee-header.webp`, whose PIXELS read
  "UPPERDECK RIPMASTER 3030"**. The filename is innocent; no string search can ever find it.
- **`token-metadata.json` `"image"`** — the picture representing the token itself.
- **196 card backs** — the same bitmap, printed as the watermark on every card.
- **`js/wallet.js` WalletConnect `metadata`** — the dApp name, URL and icon **rendered inside the
  user's wallet**. A collector on ripmaster3030studios.com was asked to approve a connection from
  a *different name at a different domain* — the exact shape people are told to read as a phish.
- **`js/session.js`'s SIWE statement** — the sentence a user reads in their wallet *before signing*.
- **`api/lore.js`'s system prompt** — so generated card lore could name the retired studio.
- plus an `aria-label`, three `<title>`s, one visible tag and 38 file headers.

⚑ **THE GENERALISATION, and it is bigger than the rename: a surface nobody looks at rots.** Every
item above is somewhere you never open in the course of the work. **If a fact is displayed
somewhere you do not routinely open, assume it is stale and write the test that opens it.**
- The test checks **four** things, because there are four ways a name travels. ⚠ It said **two**
  until 2026-08-02, and the two it was missing were live on ~200 pages while it passed:
  1. the **string** outside a comment in any shipped file;
  2. **references to the bitmaps whose pixels spell it** (listed by hand — grep cannot see a PNG);
  3. ⛔ **THE NAME WRITTEN AS SEPARATE WORDS.** `Upperdeck ★ Ripmaster 3030` on **197 card backs**,
     `UPPERDECK ★ RIPMASTER` in **`ripmaster-roundel.svg`'s own vector type** (embedded by 198
     pages, under an `aria-label` that already read the live name — the `gate.js` mismatch again,
     inside one file), `UPPERDECK · RIPMASTER · 3030` as the side watermark on **all four generated
     public pages**, and `UPPERDECK<br>RIPMASTER 3030` as the **whitepaper PDF's cover headline**.
     None is the string `upperdeckripmaster3030`, so a substring test for the joined form is blind
     to every one of them. ⚑ **A name also travels as its own words with anything at all between
     them.** The check anchors on the retired FIRST WORD, so `RIPMASTER 3030 STUDIOS` still passes
     and nothing led by the dead word can.
  4. ⛔ **THE GENERATORS THAT WRITE THE SHIPPED TREE.** The 2026-08-01 pass patched OUTPUT and left
     ten generators armed to put it all back. Sharpest case: `restyle-backs.mjs` still emitted the
     dead-name bitmap while the 197 shipped backs had already been repointed at the mark by hand —
     **generator and output disagreed, so re-running it would have silently undone the fix.**
     `scripts/` is skipped by the sweep because it does not ship; **a generator is not "a script",
     it is the source of a surface.** Also caught here: `build-hero-lens.mjs` put the **retired
     domain** in every hero's `animation_url`/`external_url` — the same defect found in
     `lens-cli.mjs` the same day, whose twin was missed.
  - ⚠ **And the deploy command handed the CLI `marquee-header.webp` as `--image`** — SuperRare's
    own flow calls that argument *"the initial fallback metadata"*, so the token's permanent
    fallback art was a picture spelling the retired studio name. Not a string; no search could
    find it. Pinned now, read out of the fenced code block only.
  - ⛔ **`docs/LAUNCH-CHECKLIST.md` told the artist to name the token `upperdeckripmaster3030`** —
    on the one irreversible step, in the document opened once, at 11 PM, under pressure. It was
    also stale on the deploy path ("assisted, we do not self-deploy" — retracted), on seasons, and
    on P0. **The runbook is the ultimate surface nobody looks at.**
- **Comments are exempt on purpose.** The record of the failure belongs next to the fix; rewriting
  history to match the present makes it false — same reason the Sepolia rehearsal logs still say
  `UR3030`.
- `package.json`/`package-lock.json` keep the old name as the npm/repo identifier. Allow-listed
  with a reason, not overlooked.
- ⚠ The stripper must handle `<style>` as well as `<script>` — without it the checker flagged the
  CSS comment *explaining this very bug*. A checker that cries wolf on the note describing the fix
  gets muted, and then it is not a checker.

## The mark — `npm run mark`, and it shipped CLIPPED
`media/site/mark-{1024,512,180,32}.png` + `og-1200x630.png`, screenshot from the LIVE foil
wordmark (a flat redraw would be a *picture of* the mark — DESIGN-SYSTEM §1).
- ⛔ **It clipped to `.marquee-art.wordmark` — the DOM string's box, 430×430 — while the ink lives
  on `hero3d.js`'s own canvas at 499×499**, an ~8% bleed on every side for the foil's specular and
  the letters' overshoot. RIPMASTER's final R and STUDIOS's final S were sliced down the stem, on
  the live `og:image`. ⚑ **It survived because both boxes are square**: the only guard asked
  whether the capture was EMPTY, and a tight square crop of a square mark is still square.
- ✅ **The guard that catches it is edge ink** — sample one pixel in from each side; >2% lit means
  the type runs off the capture. It immediately found two more layers of the same bug (the credit
  line above and the SuperRare lockup below, 3.8% and 18.3%).
- The three fixed backdrop washes (`#rain`, `.lm`, `.crt`) come off and the page goes transparent
  for the capture. Icons should be the mark alone, and the baked page stock left a visible seam
  where it met the share card's flat fill — **two backgrounds that nearly match is worse than one.**
- ⚠ **A width cap on a square is also a height cap.** `.u-logo` was `min(74vw,500px)`, sized for a
  ~2:1 banner; at 1:1 that pushed the gate's login form off a phone. 300px now, verified.
- ⚠ Colour is NOT verified — SwiftShader rotates hue on canvas content here. Layout and value are
  right; re-run on a real GPU before launch.

## Site state
- **Pre-launch admin gate** is ON (`gate.js`, injected in every page's `<head>` + the
  `build-pages.mjs` shell). Fail-closed. It is a **soft veil only** — the check runs client
  side, so treat it as a curtain, not a lock. Use Vercel Deployment Protection for anything
  that actually must not be reached.
- ✅ **MOBILE IS DONE — `mobile.css` + `npm run mobile`.** One type scale is DECLARED in
  `mobile.css` and SPENT by each page, so the cascade never fights the big inline `<style>` blocks
  and a missing sheet degrades via `var(--t-body, 15px)`. **Two floors, because there are two kinds
  of text: 12px for labels, 16px for prose.** Across nine pages: sub-12px text **172 → 0**, prose
  under 16px **206 → 0**, taps under 44px **117 → 0**, horizontal overflow gone; clean at 320×568
  and in landscape. Documents grew 15–25%, which is the cost of 16px prose and is the intended
  trade. ⚠ Still SwiftShader — task #73 (a real phone) stands.
  - ⛔ **`arcade.html` was behind a full-screen "TURN IT SIDEWAYS" veil.** It is the *menu* — a
    scrolling column of cards, the one shape a phone held upright is perfect for. `js/orient.js`
    self-initialises and every cabinet includes it; the arcade is not a cabinet. Removed there
    only; the ten game pages keep it.
  - ⛔ **`[hidden]` DID NOT WORK ON THE LAUNCH COUNTDOWN.** `.lc-grid{display:flex}` beat the UA's
    `[hidden]{display:none}`, so on **Aug 6 at 11:11 PM** the clock would have kept ticking
    *underneath* "▓ THE PACK IS OPEN ▓". A global `[hidden]{display:none!important}` ends the
    class. (Third sighting of this rule in this repo — see the `display:inline-block` note below.)
    ✅ **`npm run test:launch` now drives the real page across the real boundary** — the clock is
    skewed to 20 s before the target and then left to RUN, so the flip is produced by the page's
    own `setInterval`, the way the night will produce it. 14 assertions over three moments (T−3d,
    across T, T+6h). ⚑ **The assertion that bites is "not RENDERED", not "`hidden` is set"** —
    `grid.hidden = true` was always true, including on the broken build. Verified by deleting the
    `!important` rule and re-running: 3 failures, `display:flex` with the attribute present.
    ⚠ This is the one thing on the site that must work at a single instant with no second attempt,
    and until 2026-08-02 nobody had ever run it.
  - The generated pages' sticky topbar was **127px — three wrapped rows, 15% of the viewport, on
    every page**; now one 58px rail. The pack modal's close button was **half off-screen**, hidden
    from every overflow check by the modal's own `overflow:auto`. index had **three fixed bottom
    layers at the same altitude**, the freshness strip covering the ticker and both controls.
  - ⚑ **Hover-only affordances went to zero.** You cannot hover a finger: a hover *lift* becomes a
    press *yield*, and the `.btn` sheen had **no** touch trigger at all.
- Landing has: marquee + torches, countdown to Aug 6, and a **"What is this?" facts panel**
  (informative, not corporate).
- Public pages `whitepaper/tokenomics/audit/artist` are **generated** by
  `scripts/build-pages.mjs` — edit the source + regenerate, don't edit the HTML directly.
  PDF deck via `scripts/build-whitepaper.mjs`.
- **THE FOLDER — `cards/binder.html`.** Nine-pocket binder pages you turn; pulling a card out of
  its sleeve flies it (FLIP: measure pocket → measure destination → move a plain `<img>` between
  them) into the **starfield viewer**, where it becomes the live 3D card. The warp is lifted from
  the landing page's pack-rip modal **unchanged on purpose** — opening a card from the folder and
  pulling one from a pack should be the same event. Two decks behind chips, labelled: the
  artist's cards (`hero-manifest.json`) and the placeholder set (`manifest.json`); they are never
  merged, because merging them would invent canon. Deep links: `#hero-34`.
  ⚑ The old binder was **the folder AND the market bench**; the market/vault half moved to
  `cards/market.html` rather than being deleted. `cards/deck3d.html` is a redirect (that URL had
  already been shared). Fails open at every step — no engine ⇒ flat card in a starfield.
- **`js/card3d.js` (`Card3D`) is the ONE dynamic 3D card**, used by the folder's viewer and by
  `cards/lens3d.html` (which is what a token's `animation_url` frames). It lived inline in
  lens3d first; the moment a second page wanted the same card there were two copies of the
  colour-management fix, i.e. two chances to lose it. `Card3D.engine(base)` loads the engine
  once; `Card3D.build({canvas, box, tilt, env})` returns `{setArt, setRarity, resize, destroy}`
  or **null** (never throws).
- ⚑ **THE WASH, SECOND EDITION — `useSkybox:false` on the artwork.** Giving the card an
  environment map (`models/env/*.png`, RGBM8 equirect) was right: a raised metal bevel with
  nothing to reflect is just a grey edge. But a StandardMaterial samples that environment for
  **ambient specular too**, and on the art plate that lands as a broad milky sheen — measured
  against the flat artwork as lifted blacks and lost saturation. Identical symptom to the CSS
  `.glare` bug, completely different cause. **The environment is scoped: metal reflects it, the
  ARTWORK never does.** The travelling highlight that sells the relief comes from the KEY light,
  which is directional and moves as the card turns; a flat ambient sheen never did that job.
- ⚑ **Judge card colour by A/B, not by absolute numbers.** SwiftShader screenshots in this
  container are not colour-faithful, so a number off one screenshot means nothing. Shoot the 3D
  card AND the same artwork flat at the same pixel size through the SAME path, then decode both
  PNGs and compare. `readPixels` on the live canvas returns zeros — no `preserveDrawingBuffer`,
  so the buffer is already cleared. ⚠ **Crop the same fraction OF THE ARTWORK, not of the frame**:
  the art plate spans ~0.796 of the 3D frame (0.90×1.35 plate on a 1.0×1.5 card, 28° fov at
  z 3.4) and 1.0 of the flat one, so a fixed crop compares different regions and invents a gap.
- ⚑ **The card's colour pipeline is FAITHFUL — measured, and the residual is fully explained.**
  Pushing known swatches through the emissive path: `0→0, 51→54, 128→127, 204→203, 255→255`,
  and saturated colours survive (`204,0,102 → 203,0,102`). It is identity above ~50. Below that
  it lifts, by up to +7 levels, and the curve matches to the integer: **the texture is decoded
  with the true piecewise sRGB curve (hardware `PIXELFORMAT_SRGBA8`) and the frame is encoded
  with a pure 2.2 power law.** `sRGB_decode(16)^(1/2.2) = 23`, `(32)→37`, `(8)→17`, `(64)→66` —
  every measured value. It is confined to the toe and is the engine's own pipeline, shared with
  every other object in every game here. **Do not "fix" it**; a saturation/contrast metric on a
  card that is ~29% near-black swings hard on a +7 toe lift and will keep inviting a fix that
  makes the artwork worse. (This is the card-35 lesson again: measure before believing the eye,
  then stop.)
- ⚑ **Isolate before tuning.** Switching the foil, the specular, the rim and the key light off
  ONE AT A TIME moved the numbers by ≤0.3 — which is what proved the wash was not lighting and
  sent the search to the colour path. `Card3D.build` returns the parts by name (`art`, `fx`,
  `holo`, `key`, `rim`, `body`) and stashes the controller on `window.__card3d` precisely so a
  headless check can do this instead of guessing.
- ⚠ `display:inline-block` **beats the user agent's `[hidden]{display:none}`**. Any rule that
  sets `display` has to also say what hidden means, or hidden stops meaning anything.
- ⚠ `pkill -f <pattern>` matches **the bash command line running it**, so a script that pkills
  its own name kills its own shell. Cost two silent test runs that looked like hangs.

## ⛔ ART DIRECTION MUST BE DESIGNED, NOT MOOD-BOARDED — `docs/DESIGN-SYSTEM.md`
**Artist, 2026-08-01: "everything needs actual art direction that is designed."** Said right after
rejecting the 3D hero wordmark — *"this sucks, we can do so much better, this is like basic bitch
geometry and fx"* — and he was right.
- ⚑ **THE DIAGNOSIS IS A PROCESS FAILURE, NOT A TASTE FAILURE.** `docs/ART-DIRECTION.md` is a
  596-line **RUBRIC** — value bands, saturation floors, a rejection list. It says how to MEASURE
  that something came out wrong. It never says what the thing should BE. So briefs went out
  carrying a palette and a vibe, and **an agent handed a mood reaches for the default**: the hero
  came back as a default extrude with the CSS gradient painted on the face. Technically correct,
  fail-open, measured, tested, dead.
- ⚑ **FOIL IS DEFINED BY MOVEMENT, NOT BY COLOUR.** A rainbow gradient painted on a surface is a
  *sticker of* foil. Real foil's hue walks with the half-angle, its highlight smears
  anisotropically, its die edge breaks into prism. **Acceptance test: render at several view
  angles and MEASURE the hue shift. No shift, no foil.** This is the single most-broken thing in
  the studio's own material language — the page background is literally baked foil card stock and
  nothing else in the project behaves like foil.
- ⚠ **Every visual brief must state, before any code: what it is MADE OF, how it is LIT, what
  MOVES and why it physically moved, what it SITS ON, and the acceptance measurement.** A brief
  missing any of those produces the default. That is now a recorded failure, not a hypothetical.
- ⚑ **When unsure what something should look like, the answer is "look at the artist's own cards",
  not "make it look premium".** `docs/CC0-SOURCES.md` already records that his own Fake Rares work
  is the natural first source for in-game art. Hand-drawn, high-contrast, flat saturated ink,
  deliberately crude registration — the opposite of smooth bevelled corporate CG, which is exactly
  what a default pipeline emits.
- ⛔ **v2 WAS REJECTED TOO, AND THE FAILURE HAS A SIGNATURE — `docs/DESIGN-SYSTEM.md` §9.** The foil
  rebuild answered §1 (material) and §2 (light) *well* — 261° median hue travel, the acceptance test
  passes — and answered §4 (**what moves, and why it physically moved**) with *"the pointer swings
  the key light."* Artist: *"can't even interact with it · not rigged · not reactive."* All three
  were **literally true in the code**: the canvas was `pointer-events:none`, the GLB was 3 meshes
  split by face NORMAL with every letter welded into each, and the only input drove a light vector.
  ⚑ **§1 and §2 are the easy half, because a renderer HAS FEATURES for material and light — so an
  agent answers them and feels finished. §4 has no feature to reach for; it has to be designed.**
  A brief that names the material and the light and waves at motion produces a beautiful object
  that is dead to the touch, every time. That is now twice.
- ✅ **v3: THE WORDMARK IS RIGGED — 20 letters, `npm run test:rig` (15 assertions).** It is a card,
  and a card FLEXES: press dishes the stock, each letter rocks on its own spring in its own die
  impression, neighbours are coupled so a shove runs down the row and dies out, release rings.
  ⛔ **Nothing moves on its own** — at rest every letter is exactly 0, asserted.
  - ⚑ **The rig rides in the vertex stream** — `TEXCOORD_1 = (letter index, u across the word)`,
    baked by `build-hero-type.py` from the glyphs it already builds separately. Not a side-car
    JSON: geometry cannot then arrive without its rig. **Pivots are DERIVED in JS from the vertex
    data**, not shipped — 8 bytes × 8,558 vertices to repeat twenty numbers, and a baked pivot can
    drift from its geometry while a derived one cannot.
  - ⚠ **TEXCOORD slots are numbered PER MESH by UV-layer order.** `wm_rim` had no UV0, so shipping
    it only the rig layer would have put it in TEXCOORD_0 while face/bevel used TEXCOORD_1 — the
    shader reads the planar UV as a letter index and rigs the whole silhouette to letter 0. No
    error. The rim now carries an unused UV0 purely for slot alignment, and a test asserts it.
  - ⚠ **`vObjP` must stay at the REST position.** It drives the grating phase and the vertical
    ramp — properties of the FOIL, embossed in it. Feed it the moved position and the diffraction
    pattern slides across the letter as it rocks. `vObjN` is the opposite: it MUST take the
    rotation, or a letter can turn without its hue walking, which is the v1 sticker bug in a rig.
  - ⚠ **Step the springs ABOVE the render throttle.** `stepRig` below the `1000/FPS` early-return
    advanced one tick's `dt` on every other tick — a rig running at half speed, which reads as
    "mushy" and invites tuning instead of fixing.
  - ⚑ **"Did it move" is the weak question** — a global transform passes it. The assertions that
    bite: letters move by DIFFERENT amounts and the sign flips either side of the contact (kills
    one transform); release OVERSHOOTS (kills a lerp); a shove reaches n+2 later than n+1, measured
    at 100 → 313 → 749 ms (kills 20 independent springs).
  - ⚠ **Pump rAF from inside the page to measure a ring.** `waitForTimeout` measures this
    container's rAF stalls, not the springs — it produced one FAIL that looked exactly like a rig
    that would not settle. Same trap as the "headless rAF stalls between input events" note below.
  - ⚠ `touch-action:pan-y`, not `none`: the wordmark is a 9.7:1 band across the top of the landing
    page, and a canvas that swallows vertical drags is one a phone cannot scroll past.
  - ⚠ **The throw was set by eye at DRAGV 5.0 and measured out at 1.5 px.** A drag impulse fights a
    stiff spring (peak ≈ v/ω), so the number that "feels like a lot" is an order low. 16.0 now.
- ✅ **THE BALANCE: `3030` IS NOT A SUBSCRIPT.** Artist: *"I do not like the text imbalance it is
  RIPMASTER 3030 STUDIOS."* `RUNS` carried `('3030', 0.62)` mirroring `.wordmark .sm`; both are
  1.00/`1em` now, three parts of equal standing. ⛔ Equal **size**, still **one word, no spaces** —
  the DOM string stays `ripmaster3030studios` (name law), so it is typographic, not a rename.
  ⚠ The `.py` RUNS and the CSS `.sm` describe the same type and the mesh is cut to land on the box
  the CSS lays out; `build-hero-type.mjs` asserts they moved together.
- ⚠ `DESIGN-SYSTEM.md` is a **DRAFT FOR THE ARTIST** — proposals, not decisions. It carries the
  open typeface question (`--fat` is `'Arial Black'`, which does not exist on Linux/Android, so the
  wordmark has always been a different face per platform — pin/vendor, draw as outlines, or keep
  the accident). Do not treat any of it as settled until he has struck what is wrong.

## Artist ethos (in the artist's own frame)
The trading card is the form — a **size** before it's anything (palm, phone, two sides:
a front that shows, a back that tells; sometimes it holds data and powers). Lineage:
**Rare Pepes on Bitcoin/Counterparty did it first; came up as a Fake Rares artist**,
discovered a love and a knack for making digital cards. Throughline: **MAD magazine + cereal
boxes** (picture that's joke + trophy + currency at once) → **the casino + the arcade** (the
machine that promises you win something tangible) → **the auction** (the promise of value
received). It's all **anticipation** — the rip, the pull, the reveal, the bid. The Dadaist
turn: **sometimes the thing you win is the experience itself.** So this is the **anti-casino**
— same anticipation, but the tangible prize is the having-done-it. Hence: **the token burns
so the art can live**, and the "win" in the cabinets is a title/lens/moment, not a payout.
The whole token experience is **very Dadaist** — parody the crypto/KOL/meme-coin/casino
culture as art, safely (generic archetypes, clearly satire, never deceptive).

## Working notes
- **Git:** develop on `claude/superrare-trading-cards-71ajcx` → push, then fast-forward
  `main` (`git fetch . claude/superrare-trading-cards-71ajcx:main` → push main). Commit
  trailers: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` +
  `Claude-Session:`. Never put the model id in committed artifacts.
- **Card LENS (live in NEON RONIN):** `js/ronin-morph.js` (**RoninMorph**) is a seeded generative
  mesh-distortion system — 16 composable operators (melt/twist/shatter/voxel/glitch/inflate/
  ripple/taper/stretch/spike/swirl/fracture/bulge/static/kaleido/sag) over the engine's
  interleaved pos3+norm3 format. Deterministic: same seed → byte-identical mesh, so
  `RoninMorph.fromSlug(cardSlug)` gives each card a permanent body variant. Wired in:
  `Ronin3D.setMorphVariant(id, slug)` bakes morphed copies of the body primitives and
  `f.morphId` swaps a fighter onto them (via a `meshVar` redirect in `draw()`), so **the card you
  bring visibly warps your fighter**. Also accepted by `registerModel(arch, parsed, {morph})`.
  ⚠ Morphing does NOT launder copyright — a distorted recognisable character is still a
  derivative work. Use on our procedural bodies / the artist's own models.
## ⛔ NEON RONIN IS RETIRED — the cabinet is **THE CITY** now (artist, 2026-08-03)
*"neon ronin honestly sucks as a game, I am trying to think how we salvage it to be something else?
how about a game that has us as a squirrel and we just explore the city with other squirrels or
birds or cats… very mellow game. large levels. amazing graphics."*
Brief: **`docs/CITY-GAME.md`**. Page: **`city.html`** + `js/city-app.js` + `js/city-world.js`.
Settled with the artist: place = **park AND neighbourhood block, adjoining**; scope = **replaces
NEON RONIN**; first animal = **the BIRD**; you can be squirrel · dog · cat · bird.
- ⛔ **THE HOOK, and it is what stops this being a generic walking sim: A PHOTOGRAPH YOU TAKE
  BECOMES A CARD.** The artist's own frame is that *the trading card is a SIZE before it is
  anything* — and a photo is already that shape. `explore → notice → frame → shoot → it is in your
  binder` is the rip/pull/reveal in another key, and it is the anti-casino position exactly: the
  prize is a thing you MADE, not a thing you won.
- ⚑ **THE ANIMALS ARE LAYERS, NOT SKINS.** Bird = the whole map from above, briefly, and **scouts**;
  squirrel takes the vertical (branches, wires, ledges); cat gets *in* (gaps, sills, under things);
  dog is nose-level and finds what is buried or behind. **A card seen from the air is a PLAN rather
  than a pickup** — that one asymmetry is worth more than any amount of stat tuning.
- ⚑ **BIRD FIRST WAS THE ARTIST'S CALL OVER MY SUGGESTION OF THE SQUIRREL, AND HE WAS RIGHT.** The
  quadruped rig is a *known* hard problem that no prototype de-risks; **whether the place is worth
  looking at is the UNKNOWN one**, and a mellow game about noticing things lives or dies on it.

### ⛔ SCALE: **3.84 km** — *"we are talking mmorpg size or aspiring to that size"*
First build was `lido.wld` alone and the artist's reply was immediate: *"that is too small of a
world, maybe that is a place in it."* `js/city-world.js` is a **32 × 32 grid of 120 m chunks,
seeded, streamed, pure** (`genChunk(cx,cz,lod)` reads no state and writes none, so a chunk thrown
away rebuilds identically).
- ⚑ **THE CITY IS GENERATED, NOT AUTHORED, and every other choice follows.** A hand-built 3.8 km
  city is an asset budget this studio does not have. **What the artist authors is the LANGUAGE** —
  massing rules, material vocabulary, district mix — and hand-built `.wld` places drop in as
  **LANDMARKS**. `lido.wld` is now literally what he called it: *a place in it*, one chunk, with
  the city around it. Add one by adding a row to `CityWorld.LANDMARKS`.
- ⚑ **THE GEOMETRY *IS* THE COLLISION SET** — boxes are emitted once and used for both. Acceptance
  test 3 ("18 of 20 surfaces that look landable must be landable") is **1:1 by construction and
  cannot drift, because there is no second representation to drift from.** That is the answer to
  `street.wld`'s 57 collision boxes for 69,513 triangles.
- ⚑ **A RIVER IS THE CHEAPEST LEGIBILITY IN A GENERATED CITY.** `riverZ(x)` is a function of x, so
  adjacent chunks *cannot* disagree; it gives the map an orientation readable in one frame from the
  air (= acceptance test 1) and bridges land on the street grid by construction — a thing to fly
  under, the single most bird-specific geometry in the city. **Height variance is the second**: the
  first pass was 9–33 m everywhere and from 600 m up read as one flat crust with nowhere to aim for.
- ⚠ **Streaming is two tiers and the far one is a DRAW-CALL decision, not a triangle one.** Near
  5 × 5 chunks full detail (and the only ones that collide — they are the only ones you can touch);
  horizon = 4 × 4-chunk regions merged into one map each, so a kilometre of city is a couple of
  dozen draw calls rather than several hundred. **LOD 1 MUST EMIT THE SAME MASSES AS LOD 0** — the
  generator draws every building's height and footprint *before* any detail so the random sequence
  lines up — or a tower changes height as you fly toward it.

### ⛔ THE SAME SILENT FAILURE, TWICE IN ONE DAY: a level that loads and is the wrong colour
- **The lido rendered as two tones of sandstone.** `RoninWorld` returns AABBs as `{name, lo[], hi[]}`;
  `S9PCWorld.buildFor` reads `b.x0…b.z1`. Handing the boxes straight over compared every triangle
  centroid against `undefined` — false for all 16,108 — so **every triangle fell through to kind
  `wall`** and a place with a turquoise pool, red awnings, planting and white stone came out flat
  sand. **No error. No 404.** `section9-world.js`'s own KINDS table warns about exactly this
  ("an object NAME is a material assignment… it fails silently"); the warning was about names and
  the defect was one layer under it, in the SHAPE. Fixed: 2 material classes → **8**.
- ⚑ **SO `city-world.js` ASSIGNS THE CLASS EXPLICITLY AND NEVER INFERS IT.** Name→kind inference
  exists because a Blender-baked `.wld` has nothing but a name; **we are the author and know a road
  is a road at the instant we emit it**, so guessing it back out of a string we just wrote would be
  inventing a chance to be wrong. `CityWorld.audit()` + `__city.s.classes` make it a measurement.
- ⚠ **EVERY SLAB MUST SIT ABOVE y = 0.** `boxSoup` lays a ground plane at exactly 0, so the river's
  surface at −0.15 was **hidden under it** and the whole river drew as a wide pale band with no
  water in it. Then 3 cm of clearance z-fought into moiré at 600 m — 12 cm now, **and the other
  half of that fix is `nearClip` 0.12 → 0.4**: near clip is a depth-PRECISION dial, and 0.12 m
  against a kilometre-scale far clip spends the whole buffer inside the first metre.

### ⛔ NO FUEL, AND IT LOOKS LIKE A BIRD — two artist corrections, 2026-08-03
*"the bird needs to be able to just fly - and we need it looking more like a birb please. no having
to land to keep flying."*
- ⛔ **THE WING-ENERGY METER IS GONE.** The brief had argued for it ("a bird that must land" makes a
  perch a decision). It also makes a mellow game about looking at things into **a game about a
  meter**, and in a 3.84 km city it means running out over the middle of the river.
  ⚑ **Everything that made it feel like a bird rather than a drone SURVIVED the removal**, because
  none of it was ever the fuel: the beat is still discrete, the glide is still free and default,
  height and speed are still one currency. **The meter was a constraint bolted onto a good model.**
- ⛔ **"PLACEHOLDER" IS NOT A DEFENCE FOR WHAT IS ON SCREEN.** The body was a capsule and two boxes,
  labelled a placeholder in three separate comments — and a placeholder you can see is still the
  thing the artist sees. It is generated geometry now: a lofted taper, a **two-joint** wing
  (shoulder + elbow), a fanning tail, a beak, and countershading done with **vertex colour** keyed
  on height (dark above, cream below) so it costs one attribute and no texture.
  ⚑ **A capsule and two boxes IS the default an engine hands you** — the exact DESIGN-SYSTEM §1
    failure, and the third time on this project. A bird is a taper, a sweep and a fan; none of
    those is a primitive.
  ⚑ **§4 — what moves and why: THE ELBOW LAGS THE SHOULDER.** Driven together they are a rotating
    plank; ~90 ms apart the outer hand is still coming down while the inner arm has started back
    up, which is the shape every bird makes. The tail fans only when the bird is *working*
    (turning, or slow); a tail that is always fanned is a decoration.
  ⚠ **The first body was 5.8 : 1 and read as a DART.** A pigeon is nearer 2 : 1 with the mass
    forward. Likewise a 0.15 chord on a 0.86 span is a blade, not a wing — a bird's inner wing is
    nearly as deep as its body, and that depth is most of the silhouette.
  ⚠ **A probe that sets the camera will be overwritten** — the live `app.on('update')` re-places it
    every frame, which reads as "the framing is wrong" and is not. `app.off('update')` first.

### ⛔ "STILL CAN'T FLY BIRD ON MOBILE" — THERE WAS NO TOUCH INPUT AT ALL
Artist, 2026-08-03. Every control in THE CITY was a `keydown`. On a phone the world loaded,
streamed and rendered perfectly and **did nothing** — no way to turn, launch or flap.
⚑ **This is the repo's own "built ≠ reachable" one level deeper than `test:reach` had been
looking**: the PAGE was reachable, the GAME was not, on the device most people open it on, and
nothing errored to say so. `test:reach` §1b now covers the INPUT PATH (8 assertions).
- ⚑ **THE SCHEME IS BUILT FOR THIS GAME, not copied off a shooter. FORWARD IS AUTOMATIC** — a
  mellow game about looking at things must not ask you to hold a throttle for its whole length,
  and removing a control beats shrinking one. **Drag anywhere steers** (wherever the thumb lands
  becomes the centre — no stick to find), **tap flaps** (a tap IS a beat, so input and mechanic are
  the same shape), and there is a **mode button**, because TAB does not exist on a phone and the
  jet would otherwise be unreachable there — the same defect one level down.
- ⚠ **A tap is a pointerup that did NOT drag.** Firing on every pointerup beats the wings at the
  end of every steering swipe, which reads as the bird lurching whenever you turn.
- ⚠ `readInput()` merges touch and keys into three numbers so `step()` never asks what device it is
  on — the arena-chips lesson, where a device branch deep in a step function is how a control
  scheme quietly stops applying.

⛔ **AND THE PHONE FOUND A REAL WORLD BUG: THE GROUND WAS NOT A COLLIDER.** The bird spawned at
**y −0.62, under the road it was standing on**, and sank. `S9PCWorld.boxSoup` draws a ground plane
at y = 0 for every map, but that plane is RENDER-ONLY — it is not in `MAP.solids`. So it was the one
piece of visible geometry in the city that was not also a collider, and every courtyard and every
landmark forecourt was a hole you could see a street through. ⚑ `city-world.js`'s whole claim is
"the geometry IS the collision set"; **a piece of geometry arriving from somewhere else breaks that
silently, and silently is the only way it breaks.** A real ground slab is emitted per chunk now, and
the spawn height is READ FROM THE COLLIDER rather than hand-written.
⚠ **The phone HUD was a wreck and it was invisible from a desktop**: title and mode bar drew through
each other, the hint ran under both buttons and off-screen, and it advertised "TAB swap" to a device
with no keyboard. ⚑ The fix is to stop fighting for the corners — one column, and the hint is
WIDTH-CAPPED so it can never reach the buttons rather than nudged until it happens not to.
⚠ **Hiding `.key` is not hiding the hint** — that is only the boxed letter; the words around it live
in `.kw` and went on printing a keyboard legend stripped of its keys.
⚠ **`fov` is VERTICAL**, so a portrait phone already sees far more sky than a desktop; the same
look-down on top of that put the bird at the very top of frame. Droop is scaled by aspect now.

### ⚠ THE PRINT PASS IS BUILT AND IS **OFF BY DEFAULT** — `js/city-ink.js`, `?ink=1`
docs/CITY-GAME.md §2's "painted card stock" answer: posterise value into flat fields, ink line from
a DEPTH edge (silhouettes) + a LUMA edge (creases within a form), plates misregistered by a pixel,
paper tooth. ⚠ **Misregistration is NOT chromatic aberration** — CA is radial and grows toward the
frame edge (a lens artefact); misregistration is a UNIFORM translation per plate, because the paper
went through the press askew. Getting that wrong reads as a cheap camera instead of a cheap print.
⛔ **It renders BLACK and I am recording the retreat rather than hiding it.** A/B through the same
path: 93 luma levels and 39.5% saturation with it off, **1 level and 100% dark with it on**, screenshot
confirms an empty canvas under a live HUD. ⚠ **NOT** a missing input and **NOT** the maths —
`render()` is called, `input.colorBuffer` is present, output is the backbuffer, and a PASSTHROUGH
shader is black too. Remaining suspect: the shader LANGUAGE (this engine compiles GLSL ES 3.00 on
WebGL2; the code is ES 1.00 `varying`/`texture2D`/`gl_FragColor`), and **a shader that fails to LINK
is indistinguishable from one that outputs zero.** Shipping a look that blanks the game is worse
than shipping the default look.
⚑ Two engine facts worth keeping: `pc.PostEffect` is an **ES class** (the prototype-borrowing form
throws), and `pc.PostEffect.quadVertexShader` calls `getImageEffectUV()`, a shader **chunk** that
`createShaderFromCode` does not inject. Also `addEffect` reads **`needsDepthBuffer` off the effect** —
asking the camera directly is not the same thing.
⚑ **`?readback=1` makes colour MEASURABLE** — `preserveDrawingBuffer` plus a luma histogram, because
this container's screenshot path rotates hue on canvas content. ⚠ Bind the DEFAULT framebuffer
first: the engine leaves its own target bound, and an unqualified `readPixels` came back 100% black,
which reads exactly like a broken renderer and was a bound-target mistake.

### ⛔ THE COMPRESSION: SIX CABINETS → **FOUR**, and the city is where three of them go
*Artist, 2026-08-03: "the animals are invincible and more as observers… we can actually have
dogfight AND the section 9 game both play here and compress them all into the City. so play as a
jet fighter or an animal. then we compress our games to 4 games total."*
**THE CITY · RIP ROCKETER · CLOUD RACER · THE ARENA.** Plan: `docs/CITY-GAME.md` § THE COMPRESSION.
- ⚑ **THE INVINCIBLE ANIMAL IS WHAT MAKES IT WORK, and it is not a difficulty setting.** A mellow
  game and a tactical shooter cannot share a world as PEERS. They can if the animal is a **witness**:
  it cannot be hurt, targeted or armed, so a firefight two streets over becomes **weather** —
  something to fly over, watch and photograph. The mellow game keeps its promise ("nothing chases
  you") inside a world containing people shooting at each other, and **a photograph of someone
  else's war is a better card than a kill count** — the anti-casino position as a mechanic.
  ⚠ **Enforced, not true by omission**: `MODES` carries `mortal/targetable/armed` and `__city.s`
  exposes them, because "we never gave the bird any health" is not a design and a bot that aims at
  a squirrel for zero damage has already ruined the tone.
- ⚑ **SECTION 9's MAP FORMAT *IS* THE CITY'S CHUNK FORMAT — not luck, it is why the generator was
  built out of collision boxes.** A Section 9 map is `MAP.solids` (AABBs + kind); `genChunk` emits
  exactly that, so collision, raycast, AI line-of-sight, cover baking and spawn validation all run
  on a city chunk unmodified. The renderer is already shared (`S9PCWorld.buildFor`).
- ⛔ **DOGFIGHT IS NOT AUTHORED IN METRES, and it would have failed PLAUSIBLY.** Its world is
  `WS = 150` with `ALT 0.35–9.0`, `STALL 2.9`, `VREF 7.2` — against a 3,840 m city with 150 m
  towers, roughly **25 : 1**. Copy the table over and the aircraft still flies, it just crosses the
  whole city in a second. ⚑ **The UNIT-FREE half ports exactly and is the half that is the feel**:
  the roll spring (`ROLL_K 81 / ROLL_D 11.6`, ω 9.0, ζ 0.644) and `heading rate = TURN_G·sin(roll)·
  pull·auth / spd^0.6` are radians and seconds. Only speeds, altitudes and distances are re-derived.
  Measured after: cruise 168 m/s, **360° in 8.9 s, radius ~238 m**.
- ⛔ **A JET NEEDS A COMPLETELY DIFFERENT WORLD EDGE FROM A BIRD, and three separate measurements
  were needed to get it right:**
  1. Reusing the bird's edge (cancel outward thrust) leaked **386 m** past the wall. The bird's fix
     relies on being able to STOP something against it; a jet has idle thrust and a stall speed, so
     "stopped" is not a state it has. **The boundary has to be a TURN, begun before the edge.**
  2. ⚠ **AND THE END POSITION HID IT.** The jet was turned round and finished well inside, so a
     check that read where it stopped said "fine". **The excursion is the measurement.**
  3. ⛔ **`sin(inward − yaw)` HAS A DEAD SPOT AT π — exactly the case a boundary exists for.**
     Flying straight at the corner sits at the antipode, the correction was multiplied by ≈ 0, and
     one wall held while the other leaked 244 m. It read as an asymmetry bug and was trigonometry.
     Wrap the difference into (−π, π] and command on the ANGLE, which is largest where the sine was
     smallest. ⚑ And **the rate comes from the geometry** (`v/d`, the rate needed to turn inside the
     remaining distance), not from a curve that looked right — a boundary tuned by eye holds at the
     speed you happened to test. Final: max |x| 1,745 · |z| 1,918.8 against ±1,920.
  ⚠ **A handling number taken next to a wall is a measurement of the wall** — the 360° test read
  50 s / 1,337 m until it was moved to the world centre; nothing had regressed.
- ⚠ **TDZ, THIRD SIGHTING.** `MODES`/`isJet` sat below the jet's geometry, which calls `isJet()`;
  `const` hoists into the temporal dead zone, so it threw at module scope and took the whole app
  down before `window.__city` existed — the probe reads "undefined", not "broken mode swap".
- ⚠ **Two `setLocalEulerAngles` calls on one entity is not two rotations** — the second REPLACES the
  first, so the jet's fin cant silently vanished and both fins came out as one forward-swept blade.
- ⛔ **A CABINET IS NOT REMOVED UNTIL ITS REPLACEMENT WORKS.** `section9.html` and `dogfight.html`
  left the grid and are still reached **from THE CITY's own mode bar**, and `test:reach` now
  ASSERTS that link rather than allow-listing it — deleting the route to a working game to make a
  count look right is test:reach's own failure with the sign flipped. When the modes land, those
  two assertions are what should fail. Proved to bite: removing one link fails 1, adding a fifth
  cabinet fails 1. 66 → 65 (two cabinets out, three assertions in).

### ⛔ THE FIRST FLIGHT MODEL WAS A HELICOPTER, AND THE ARC SAID SO
Held SPACE was a sustained +15 m/s² and held W +26, so 70 driven frames took the bird to **y 48.5
over a level whose highest roof is 17.5**, then out through the side at (41, 36) against ±27 × ±23.
- ⚑ **A WINGBEAT IS DISCRETE.** `flapEvery` is a refractory period, so SPACE is a beat you spend,
  not a button you lean on. **Gliding is free and is the default** (speed² buys lift; at ~15 m/s it
  cancels gravity) and **diving tucks** (drag × 0.45 — the swoop).
- ⛔ **"HEIGHT AND SPEED ARE ONE CURRENCY" WAS ONLY A COMMENT UNTIL THE ENERGY TERM EXISTED.**
  Conservation is `v·dv = −g·dh`. Without it, released at 111 m the bird **carried 15 m in 15 s**
  and arrived almost vertically — a parachute. With it: **245 m for 22 m of height, about 11 : 1.**
  ⚠ **Only the DESCENT half, and the symmetric version is a MEASURED failure.** Taxing the climb by
  the same rule divides by the *horizontal* speed, which during a powered climb is small while `vy`
  is large, so the factor collapses — and again next frame. Driven: 19.6 → 0.1 m/s in two seconds,
  sinking vertically out of the world. The climb is already paid for twice (lift capped at 1.35 g,
  and beating is the only way up).
- ⚠ **LIFT MUST BE CAPPED** — uncapped, speed² at the speed cap is +34 m/s² and the bird is a rocket.
- ⚠ **A BOUNDARY YOU CAN LEAN AGAINST IS NOT A BOUNDARY.** The first soft edge was a spring the
  thrust simply out-muscled: at 8 m outside it the two balanced and the bird hung there, stalled,
  outside the world, then sank onto the y=0 plane — **word for word the shelved city's "stood on a
  water plane with the city floating in the distance"**. The fix cancels the outward COMPONENT OF
  THRUST, which cannot be out-muscled. Related: `RoninWorld.groundAt` returns **0** when nothing is
  under you, i.e. an invisible floor everywhere; `groundBelow` returns **null**, so nothing lands
  on nothing.
- ⚠ **THE CEILING IS AN ABSOLUTE ALTITUDE, NOT A FRACTION OF THE WORLD.** Derived from the span it
  was right for a 54 m courtyard and became **1,848 m** the moment the world became a 3.84 km city.
- ⚠ **THE CHASE CAMERA MUST LOOK DOWN AS YOU CLIMB.** Framed level, a bird at 40 m fills the screen
  with sky and the city is off the bottom of the frame — the first flight screenshot was pure blue
  with a bird in it, and that is a FRAMING bug that looks exactly like a flight one.

### ✅ THE NAME IS **THE CITY** (artist, 2026-08-03) — *"the city is what we can call it"*
STRAYS · FOUND · THE LOT · PERCH are dead. ⚑ **`npm run test:name` PINS IT**, which is the standing
rule the moment a name exists, and it checks the SHIPPED SURFACES a visitor reads — the `<title>`,
the on-screen title, the arcade cabinet — plus that no retired candidate and no "working title"
survives on any of them. Comments are exempt, same as everywhere else here: the note recording the
decision has to name what it rejected, and a checker that fires on its own explanation gets muted.
⚠ **Proved to bite**: breaking the HUD to `PERCH · working title` and the cabinet back to
`NEON RONIN` fails **5** assertions. 56 → 64.
⚠ The FILE stays `city.html` — named descriptively rather than guessed, and it landed on the right
word. A URL that already resolves keeps resolving.

⚠ **STILL OPEN and the artist's:** how a photographed card is marked so it never passes as one of
his, whether the animals share one city, whether anyone else is in it, and whether time of day
moves.
⚠ **NOT BUILT YET:** the quadruped rig (the 11-bone skeleton is a BIPED — biggest new piece), photo
mode, found cards in the world. Steps 3–5 of the brief.
⚠ `ronin.html` is **kept and still resolves** — a shared URL should keep working — but nothing links
it. It is allow-listed in `test:reach`'s `ORPHAN_OK` **with a reason**, which is the difference
between a decision and an oversight.

- **Games** are self-contained HTML canvas/WebGL (dogfight, section9 + `js/section9-gl.js`,
  riprocketer, cloudracer + `js/cloudracer-gl.js`, ronin = NEON RONIN 1v1 ninja duel in
  `js/ronin.js` (renderer-agnostic game logic) + `js/ronin-fighters.js` (IK skeleton +
  2D procedural fighters) + `js/ronin3d.js` (TRUE-3D WebGL renderer — perspective camera,
  lit depth-tested 3D fighters built from the same IK skeleton with **tapered (muscled) limbs**
  (frustum mesh, thick at the proximal joint), **rounded capsule joints** (higher-poly cyl/sph:
  22-seg / 18×26), a neck + deltoid shoulders, booted feet with toes, a **held hilt**
  (pommel + wrapped grip through the fist + tsuba, blade emerging ABOVE the guard — not jutting
  from the arm), **hands** (palm + fingers + thumb) that grip it / clench to fists, **expressive faces**
  (eyes+pupils, brows, nose, mouth — expression driven by state; oni fangs, kappa big eyes,
  kunoichi masked) and human-ish proportions, a **procedural material system** in the lit shader (`uMat`: 1 cloth-weave /
  2 brushed-metal / 3 reptile-scale / 4 iridescent-crystal / 5 skin / 6 energy-pulse / 7 wrap
  bands, textured stably in object space via `vL`), and a distinct silhouette per archetype
  (ronin straw-hat+haori cloak, kappa scaled shell+bulbous eyes, doomer cowl hood+coat, oni
  upswept horns+spiked club, kunoichi wrapped limbs+trailing scarf+face-mask, prizm crystal
  body+orbiting shards+light blade), neon-grid arena with wet-floor reflections + soft contact
  shadows, moon/skyline, fog, plus native additive **3D combat FX** — smooth **ribbon** blade-
  streaks + crescent slash-arcs (own flat per-vertex-alpha shader `trailProg`), velocity-aligned
  **streak** sparks, flat ground-puff dust, and ONE clean expanding **ring**-mesh shock (all
  deliberately NOT spheres/orbs; mapped from `G.fx`/`G.shock` via `G.groundY`), **anime sprite
  pops** — billboarded manga glyphs drawn by `spriteProg` from `G.pops` (kind 0 impact star ·
  1 speed line · 2 "!" · 3 sweat drop · 4 burst ring), fired game-wide from hits/blocks/
  knockdowns/KOs/combos/dashes via `pop()`/`popImpact()` — a full-scene **bloom post-pass** (scene→FBO→bright→separable
  gaussian→composite w/ vignette+grain+chromatic-aberration, falls back to direct draw if the
  FBO chain fails), and a **dynamic fight-camera** that orbits gently and pulls-in+swings on
  hero moments (`G.camZoom`/`G.camDir`, fired from ko/finishers/special); Milestone 5, preferred
  when WebGL is up. Dev hook
  `__rn._brawl(meArch, foeArch)` forces a matchup for headless capture.) + **`js/ronin-glb.js`**
  (glTF-2.0 **GLB part loader** — parses the container itself, no library; emits interleaved
  pos3+norm3 triangle soup straight into the renderer's mesh format. **Rigid-part rig**: drop
  `models/<arch>.glb` in and its objects attach to skeleton joints by NAME (head/chest/pelvis/
  arm_f_upper/…; see `models/README.md`) — no skinning/animation needed, the existing IK drives
  everything. Missing files fall back silently to the procedural fighters. Static-mesh DCC output
  converts via dave3d/meshconvert. **Only commit geometry the artist owns or that is clearly
  licensed for commercial/NFT use.**) + `js/ronin-gl.js` (2D bloom compositor, the
  fallback path). cards/battle + animated fight `js/card-fight.js`). Reached via `arcade.html`.
- **FBX in — `scripts/fbx2glb.mjs` (`npm run fbx`), 43 tests `npm run test:fbx`.** Dependency-free
  FBX reader → GLB/OBJ, so Mixamo drops straight into `models/`. Handles **binary 6.x and 7.x +
  ASCII**, geometry + per-object names + the full transform chain (pivots, pre/post-rotation,
  geometric offsets) + Z-up→Y-up. ⚑ **It reads what Blender refuses**: Blender errors
  *"Version 6100 unsupported, must be 7100 or later"*, and **4 of the artist's 5 Mixamo exports
  are 6100** — so a rejected FBX is not a broken FBX. Verified two ways: on the one file both
  tools read, Blender and this agree exactly (1.17×0.63×1.33 m vs 116.78×133.52×62.97, i.e.
  Blender's cm→m + Y/Z swap); and all five convert → GLB → render correctly in Blender
  (knight, paladin-in-plate, theBoss all reconstruct cleanly). ⚠ **6.x is a different format,
  not a version bump**: arrays are thousands of scalar properties (not one typed array), the
  mesh lives *inside* the `Model` (there is no `Geometry` object), connections link by **name
  string** not numeric id, and `Properties60` has no flags column so values start one column
  earlier. ⚠ Skin weights/bones/animation are dropped **on purpose** — `bake-fighter --skin`
  builds our own 11-bone rig and ronin.js's IK drives every pose; a Mixamo rig would fight it.
  Download **T-pose, no animation**. ⚠ Mixamo object names often don't describe their contents
  (one file has the whole armoured body inside an object called `…_Sword`) → `--segment`, don't
  trust names. `bake-fighter.mjs` now also accepts `.glb` input. **Mixamo licence must be checked
  before committing** any Adobe stock character; your own uploaded mesh is clean.
- **Dressing loaded bodies — `Ronin3D.dressLoaded()`.** Loaded/skinned fighters used to draw the
  bare mesh and nothing else (`drawFighter` returned early, skipping the whole wardrobe), so an
  imported base being fought naked and unarmed. Now they get boots, belt, bracers, the archetype
  silhouette (hat/cowl/horns/shell/mask), cloak/scarf and the held weapon — all placed from the
  **skeleton, not the mesh**, so one implementation fits any body. Default: dress a `.skn` or a
  single-part model (a bare mannequin), leave a multi-part model alone (the artist already
  dressed it); override with `{dress:…}`. The weapon is separate and near-always drawn — NEON
  RONIN is a sword duel, an unarmed fighter reads as a bug. `drawWeapon` was lifted out of
  `drawFighter` so both paths share one definition (procedural path verified unchanged).
  ✅ **Reachable from the lobby now** (was gated off). NEON RONIN's lobby has two chip rows:
  **▦ Arena** (Neon grid · Rooftop · Arcade · Vault) and **▤ Bodies** (Procedural · Modelled).
  Both write localStorage and reload — the world mesh and skins upload once at init, so a live
  swap would mean rebuilding the renderer's buffers for nothing. ⚑ **The fighter gate was
  decoupled from the world gate**: loading a `.skn` used to require `urm_world='1'`, i.e. opting
  into the *shelved free-roam city*, so the rigged characters never appeared in the duel they
  were built for. Now `FIGHTERS_OK = DEVICE_OK && urm_bodies==='model'` and `HEAVY_OK =
  WORLD_ON && DEVICE_OK` — two unrelated things, two switches. **Defaults are unchanged**
  (procedural bodies, neon grid), so the shipping duel looks exactly as it did.
  ⚑ `.skn` files are heavy (`ronin.skn` is 5.7 MB) — `DEVICE_OK` is still the mobile protection.
- ## ⛔ THE ARENA CHIPS SWAPPED THE GAME, NOT THE STAGE — fixed 2026-08-02 (artist report)
  **Picking Rooftop, Arcade or Vault turned the DUEL OFF.** The picker wrote `urm_world='1'`, which
  is the *shelved free-roam city* flag, and the world branch of `update()` ends
  `updateHUD(); return;` — so **the entire combat simulation was skipped**. Attacks, hitboxes,
  blocking, combos, meter and KO never ran; `f.state` was written straight from walk speed; Q/E
  turned the camera instead of sidestepping; W/S were forward/back instead of jump/guard. Driven,
  same keys, 40 steps: neon grid reached `slash`, the other three never left `idle`, and the two
  fighters spawned **~3,000 units apart**. Exactly the report: *"fighting controls are not working
  in the xyz space arena."*
  - ⚑ **THE FIX IS THAT A LEVEL IS A STAGE, NOT A MODE**, which is also what the artist asked for
    ("just have them fighting side scroll style") and what Tekken actually is — 3D bodies on a 2D
    fight plane with a depth sidestep, which `f.z` + Q/E already implement. `urm_stage` picks the
    arena; `urm_freeroam` keeps the city mode alive for whoever picks it up. **The renderer already
    had them separate** — `worldMesh` gates the geometry, `G.worldMode` gates the chase camera —
    only `ronin.js` conflated them.
  - ⚠ **A ROOM IS NOT A STAGE.** Three staging bugs, each found only by LOOKING:
    (a) drawn whole, the level put walls *between the camera and the fight* — so geometry in front
    of the fight line is culled at upload, which is why you never see a Tekken stage's fourth wall;
    (b) culling by triangle CENTROID left a wall-sized wedge across a fighter, because these
    levels have very large triangles — the test is whether **any** part reaches in front, not
    where the middle is; (c) that cull then ate the floor and the fighters stood on void — **a
    near-horizontal surface cannot occlude a side-on duel**, so floors are exempt.
  - ⚠ **The stage was drawing and was invisible, which looks identical to not drawing.** The duel's
    fog is 17→58 m, right for a ~3 m table; the levels measure **rooftop x ±82.5 · y 0→57.2 ·
    z ±78.1**, arcade ±60/27.5/±42.7, vault ±49.7/25.9/±52.4, so every backdrop sat past the fog
    end and all three read as the same void. The range is now **derived from the level's own
    measured depth**, not picked by eye — a "geometry outside the visible range" fix, the same
    shape as Section 9's missing `open:true`, *not* a lighting-taste decision.
  - ⚠ **A single authored spawn is the wrong stage origin** — a spawn is where a player *enters*,
    usually at the edge facing in, which put the whole vault duel outside the room. The centroid of
    all spawns, dropped to the floor, lands the fight inside the space on all three.
  - ⛔ **AND THE TEST DID NOT BITE UNTIL THE VIEWPORT WAS FIXED.** `npm run test:ronin` grew 12
    assertions that all passed against the *broken* build, because the harness ran at 1000×**640**
    and `DEVICE_OK` needs `min(w,h) ≥ 700` — no level loaded, so the defect could not occur.
    Caught only by reverting the fix and re-running, which is the one thing that proves an
    assertion bites. At 760 the revert fails **9**. The window height is now load-bearing and says
    so. 40 → 55.
  - ⚠ **Still the artist's call:** how each arena is lit and dressed. The fight reads clearly in all
    three and the levels are visible, but rooftop is a plain deck next to arcade's cabinet row —
    that is DESIGN-SYSTEM §1/§2 work, not a constant to nudge.
  **Combat (M4):** fighters hold the blade UPRIGHT in a jodan ready stance → committed
  overhead cuts; agility physics (snappier accel/jump, double-tap **dash** w/ i-frames);
  **depth strafe** (`f.z`, Q/E) that recentres on the fight line and lets an off-line target
  whiff melee; **special combos** via recent-attack strings (`detectCombo`): slash·slash·slash
  = TEMPEST, punch·kick·slash = CREST WAVE, punch·kick = DRAGON KICK launcher. **Spin attacks**:
  the meter special + TEMPEST whirl the whole body (`f.spin` → Ry in 3D / cos-squash in 2D),
  blade extended level so the edge sweeps a full circle and hits both sides (`f.spinT`).
  **Controls:** desktop **mouse** — L=slash, R=kick, middle=punch (chain for combos); keyboard
  L/K/J attacks, A/D move, W jump, S block, Q/E strafe, Shift or dbl-tap A/D dash, Space special.
  Shared `fuse3D` 3D interceptor renderer; card powers in `js/card-powers.js`; shared game
  modules `js/{wager-payout,arena-lobby,card-hover,game-help}.js`. **NEON RONIN gates
  playable fighters behind card ownership** (rarity/trigger unlock rules in `ARCH`).
- **SEATS — `js/session.js` (`RipSession`), doc `docs/SEATS.md`:** three doors into one
  lobby so holders, collectors and paying visitors play *each other*. **A** holder
  (`$3030.balanceOf ≥ holderMin`), **B** collector (`lens721.balanceOf ≥ 1`), **C** visitor
  (Base arcade-fee receipt, via `RipEth`). Built on the split that makes this tractable:
  **entry is read-only, stakes are custody** — each door reads its OWN chain over a public
  RPC (a wallet on Base can prove a mainnet balance without switching), so entry needs no
  contract and ships now; pots stay Phase-2. Visitor door verifies the **Base tx receipt**,
  not `RipEth`'s forgeable localStorage credit count. ⚠ **A seat is advisory** — SIWE is
  signed and stored but nothing verifies it server-side, so **no real value may depend on
  `seat.ok`** until a backend does. `lens721:""` ⇒ collector door falls back to the local
  vault with `verified:false`. Reference integration: Section 9 `#seatBox`; practice stays
  open to all.
- **Shared GFX pass — `js/gfx-post.js` (`GfxPost`):** the bloom compositor lifted out of ronin3d so
  every WebGL game gets it. `GfxPost.create(gl, canvas, GfxPost.PRESET.x)` → wrap the existing draw
  in `post.begin()` / `post.end()`; chain is scene→bright→half-res separable gaussian→composite with
  additive bloom + chromatic aberration + vignette + grain. **Fails open** — any shader/FBO failure
  sets `on=false` and both calls no-op, so the game draws exactly as before. Presets: `neon`
  (ronin), `tactical` (Section 9 — restrained, it's a gritty FPS), `sky` (Cloudracer — high
  threshold, or the already-white cloudscape blooms into a flat wash). **All three WebGL games
  now share it** — ronin3d's inline copy was deleted (−60 lines), so a tuning fix lands
  everywhere at once. Each renderer exposes `post()` for headless checks.
- **GfxPost composite order matters:** CA (sampled) → bloom → **highlight rolloff** → sat/vignette
  → **8×8 Bayer dither** → **unsharp** → grain. The rolloff is the load-bearing one: these games
  are LDR, so additive bloom pushes pixels past 1.0 and the GPU clips them to flat white.
  ⚑ **`knee` was MEASURED, not guessed** — swept against Cloudracer's clipped-pixel count.
  **0.94 removes 100% of clipping for free** (mean 129.5 vs 128.8 unrolled, contrast 73.2 vs
  73.3); my first guess of 0.62 also removed it but cost **14 luma and 14 contrast**, dimming
  the whole sky instead of the highlights. Lower is not safer, just darker.
- ## ⛔ ENGINE DECISION — **PlayCanvas is being adopted. Artist's call, 2026-07-31.**
  The hand-rolled renderers were evaluated against PlayCanvas side by side (`section9-engine.html`
  vs `section9.html`) and the artist's verdict is that **incremental upgrades to our own
  renderers do not reach the quality bar this studio is aiming at.** We take the engine.
  - ⚠ **The evaluation's own "don't migrate" recommendation rested largely on launch being six
    days out. That was a bad argument and is explicitly overruled**: the standing directive is
    *work like we don't have a deadline — the ONLY things that must ship finished are the
    contract, the lenses and the token functionality. Everything creative is **open studio,
    work in progress**, agreed with SuperRare.* A renderer touches none of the three. Do not
    re-raise the launch date against creative work; it has been answered.
  - **What made it defensible:** the engine is NOT the cost — stripped to what our renderer
    does, PlayCanvas measured ~20% FASTER than us while running a full scene graph. The cost is
    features, and each is switchable. It is MIT, UMD, **~598 KB gzipped, no build step**, and
    already carries gaussian splatting (+SOG, PLY), Draco, Basis, WebGPU, shadow maps,
    clustered lighting and the Ammo hook.
  - **What ports for free** (measured, not assumed): `RoninWorld.load`, `S9World.kindOf`,
    `S9Skin.pose`, `S9Skin.BIND` all went in UNMODIFIED, and skinning reproduced our own
    palette to 7.6 × 10⁻⁶. The IK-driving-rigid-parts pattern gets EASIER under a scene graph —
    attaching a part to a joint becomes `bone.addChild(part)`. **The formats and the rigging
    are not at risk; only the rendering is.**
  - ⚠ **What we must not lose by accident:** `GfxPost`'s MEASURED calibration — the 0.94
    highlight knee swept against clipped-pixel counts, the composite ordering, the tactical
    motion smear. An engine replaces the FUNCTION, not the TUNING; those numbers must be
    re-derived in the engine's terms, not left at defaults. Also `Gfx2D` and the **2D fallback**
    (PlayCanvas has no software path, so WebGL2 becomes a hard requirement) — fail-open at every
    step is a standing principle here, so dropping it is a DESIGN decision to be made openly.
  - ✅ **SHIPPED — the PlayCanvas build IS `section9.html`.**
  - ⛔ **`section9-classic.html` IS DELETED (artist's call, 2026-08-02). Section 9 has ONE build.**
    The hand-rolled renderer had been kept as the rollback, the free A/B, and the route for a
    browser with **no WebGL 2**. All three are gone with it, and the third is the one that costs
    something: **fail-open was preserved as a ROUTE rather than a renderer, and that route no
    longer exists.** WebGL 2 is now a hard requirement for this game.
    - `#nogl` states the requirement plainly and sends the visitor to `arcade.html`, where
      **DOGFIGHT and RIP ROCKETER still carry their own 2D fallbacks** — so it is a closed door
      with a sign on it, not a black rectangle and not a dead link.
    - ⚠ **A live `<a href="section9-classic.html">` survived the first pass** in the footer
      mininote, four comments deep into the same file I had just edited. `npm run test:reach` §4b
      caught it — and the assertion only works because it resolves LINKS via `navigatorsOf()`
      rather than grepping the string, which matched eight files that merely *mention* the
      removed build in comments. Mentions are history and are exempt; an href is a promise.
    - ⚑ It also ends a real divergence: the classic build never received the sky-drop supply work
      (0 hits for `stepPow`/`restY`/`dropH`) and had no mobility tokens at all, so the two builds
      had been drifting apart with only one of them tested against the artist's reports.
  - ⛔ **AND THEN ALL FOUR WENT (artist, 2026-08-02): "we don't need the classic versions for any
    games, too distracting."** `riprocketer-classic.html`, `dogfight-classic.html` and
    `cloudracer-classic.html` deleted too. **EVERY ARCADE CABINET IS A PLAYCANVAS BUILD NOW, SO
    NOTHING IN THE ARCADE RUNS WITHOUT WEBGL 2.** That is the whole cost, stated once, plainly.
    - ⛔ **I HAD JUST TOLD THE ARTIST THE OPPOSITE.** section9.html's `#nogl` said *"DOGFIGHT and
      RIP ROCKETER both degrade to a 2D renderer and will run here"* — **wrong the moment it was
      written.** I took it from this file's older `Gfx2D` note, which predates their PlayCanvas
      ports; `dogfight.html`'s own comment says in as many words that it *"cannot fall back to a
      2D renderer"*. ⚑ **A CLAIM ABOUT ANOTHER PAGE HAS TO BE CHECKED AGAINST THAT PAGE** — a
      stale note in CLAUDE.md is not evidence, and sending a visitor with no WebGL 2 to a cabinet
      that also needs WebGL 2 is a worse answer than admitting there is nowhere to send them.
      `npm run test:reach` §4b now asserts that no `#nogl` panel promises a game that also needs
      the thing the visitor does not have.
    - ⚠ Two live `<a href>`s survived the first pass again — cloudracer's lobby mininote and its
      file header. The guard caught both because it resolves LINKS (`navigatorsOf`) rather than
      grepping the string, and because it now checks **all four** names, not just Section 9's.
      Checking one of four is how the other three rot back in.
  - ⚑ **THE SCENE WAS RENDERING MIRRORED — one cause, three bug reports.** "Mouse inverted",
    "strafe backwards" and "aim off" were all the same defect. Verified numerically: at yaw 0 the
    camera's forward matched the game's (0,0,1) but its RIGHT was (−1,0,0) against the game's
    (1,0,0); same at 90°. Section 9's basis (x right, y up, z **forward**) is **LEFT-handed**; a
    PlayCanvas camera's (x right, y up, −z forward) is **right-handed**. The old `+180°` yaw
    offset makes FORWARD agree and **cannot** make RIGHT agree, because a rotation preserves
    handedness. `section9-gl.js` gets away with it only because its `viewMat` is hand-written and
    is not a pure rotation. ⚑ The reticle is drawn dead-centre on the 2D overlay, which does not
    mirror — which is exactly why "aim off" and "mouse inverted" were the same report.
    **Fix: a handedness flip is not a rotation, so it has to be a SCALE.** Everything in game
    coordinates (level, bodies, FX, level lights) hangs under one `worldMirror` node at
    `(−1, 1, 1)`; the camera stays OUTSIDE it at `(−x, y, z)` with yaw `π − gameYaw`. One node
    instead of negating x at forty call sites — which is what makes it verifiable, since the
    scene is either mirrored or it is not and nothing can be half-converted. Modules reach it via
    `app.__worldMirror`. ⚠ Negative scale reverses winding; PlayCanvas derives face flipping from
    the transform determinant and handled it (verified by screenshot — walls solid, not
    inside-out). That is the first thing to check if an arena ever renders inside-out.
  - ⚠ **A workaround must die with its bug.** `invX` was defaulted ON while the mirror was still
    live; leaving it on afterwards would have inverted the mouse the other way.
  - ⚑ **The washed-out interiors were a MISSING `open` FLAG, not a lighting-taste question.** The
    six hand-built arenas are walled yards under the dusk sky — "tight interior" in their comments
    describes the LAYOUT, and `ceilY` is a jump ceiling, not geometry. With the flag unset the
    engine build classified all six as rooms: ceiling practicals, indoor sky, IBL fill ×5.2,
    exposure 1.25. Measured against the classic build on the SAME arena that cost the frame its
    black point — blacks 7.3% of frame → **0.4%**, saturation 52.5% → **27.4%**. Setting
    `open:true` in `newMap()` took it to **42.5% saturation, 2.7% blacks, contrast 53.9 (above the
    classic build's 42.1)**. Baked levels keep their own per-level flag; they have real ceilings.
  - ⚠ **Known gap: the DarkFarms CC0 wall art is classic-only.** The posters are not hung in the
    engine build yet, so they are absent from the game the arcade links to. See CREDITS.md.
- **DOGFIGHT true-3D — `js/dogfight-gl.js` (`DFGL`), Milestone 1.** Real perspective camera +
  z-buffer, replacing the fake-3D FOCAL/HORIZON projection. Same conventions as
  `section9-gl.js` / `ronin3d.js`. Game state was already 3D — world `(x, alt, y)`, `cam{x,y,
  alt,h,ph,roll}` — so gameplay was untouched. `DFGL.frame(G, cam, world(), {WS,CAM_BACK,
  CAM_H,VIEW_FAR})`; the game's constants are PASSED IN, never duplicated, so tuning them in
  `dogfight.html` can't desync the renderer. GL owns the world; the 2D canvas above stays for
  HUD/radar/reticle (text is sharper there — same split Section 9 uses). Fails open to the 2D
  renderer + `Gfx2D`, which are mutually exclusive with it (Gfx2D *hides* the 2D canvas).
  ⚠ **View-matrix trap:** the chase pull-back must be applied in CAMERA space (after the
  inverse rotation). `R * T` looks correct dead-ahead and drifts wrong the moment you turn.
  ⚑ **CAMERA YAW NEEDS `+π/2`, and it is load-bearing.** The game's heading convention is
  `fwd = dx·cos h + dy·sin h`, so `h = 0` means flying along world **+x**, which lands on GL
  +x — while a bare `Ry(cam.h)` keeps the camera looking down −Z. M1 shipped that way and the
  whole world sat 90° off its own flight axis: scenery slid sideways, the hull pointed out of
  the right of frame, and nothing ever came toward you. It reads to a player as *"the plane is
  stuck flying in one direction."* The ship transform's own `+π/2` is a SEPARATE offset (model
  +Z → the same axis) and was never the bug. Verified numerically at five headings: dead ahead
  → camera −Z, world-right → +X, nose → (0,0,−1).
  **Geometry is AUTHORED** — `models/dogfight.glb` from `scripts/blender/build-craft.py`
  (`npm run craft`), loaded by name through `ronin-glb.js`: `craft` · `pod` · `gate` ·
  `prop_{pylon,ring,spire,tower,crystal}`. Fits are computed from MEASURED bounds (craft →
  `CRAFT`, gate → the 1.4 pass-through radius `dogfight.html` actually tests, props → base at
  origin so `alt` means altitude), so a replacement model drops in without retuning anything.
  Every piece keeps its procedural fallback — the fetch is async and can fail.
  **Lighting (post-M1):** hemisphere ambient + wrapped diffuse + Blinn-Phong + fresnel rim,
  two-sided (CULL_FACE is off, so thin geometry would otherwise go black from behind), plus
  sun-vector ground shadows that widen and fade with height. ⚑ The lit shader needs the model
  matrix in its own right, so **every draw must go through `xform()`** which sets `uMVP` and
  `uM` together — setting `uMVP` alone silently reuses the previous draw's normals.
  **Clouds** are two slabs RAYMARCHED through their own thickness with a short second march
  toward the sun for self-shadowing. Three flat sheets read as three flat sheets from every
  angle that isn't edge-on; thickness is what makes them weather. Wrap-safe lattice, so no seam.
  **M1 OUT / still known:** bolt ribbons are axis-aligned rather than camera-facing; no
  reflections; cloud shadows don't fall on the ground.
- ⛔ **SECTION 9's TIER TABLE WAS NOT A LADDER — the frame-rate bug the artist reported.**
  In-arena (SwiftShader, RELATIVE ONLY): low 317 ms · mid 597 · high 693. **The entire cliff is
  low→mid (+88%)**; mid→high adds 16%. Four things stacked at that one step:
  ⚑ **(a) `omni` NEVER TIERED on the six hand-built arenas.** `stride = max(1, floor(cands/omni))`
  only bites when the cap is SMALLER than the candidate count, and those arenas carry 8/16/12/14/
  8/19 candidates — all under mid's 24 — so **mid and high built byte-identically the same light
  set**. "46/24/8" read as three rungs and behaved as two. On baked interiors it inverts: ARCADE
  PIT has 178 candidates, THE VAULT 74, so cost tracked the ARENA, not the setting.
  ⚑ **(b) SSAO forces a whole extra geometry pass** — `CameraFrame.sanitizeOptions` in the
  vendored engine: `(taa || ssaoType!==NONE || dof || volFog) ⇒ prepassEnabled = true`. The scene
  renders TWICE. `ssao:true` at mid AND high, false at low — the cleanest match to the two tiers
  named, and a structural fact rather than a measurement.
  (c) 3 cascades × 2048² = 12.6M shadow texels/frame for a ≤52 m arena. (d) `spotShadow:true`
  made all six ceiling fixtures casters.
  ⚑ **`ADAPT` could not reach any of it** — it only scaled the backing store, while the frame was
  bound by a prepass, fixed-size shadow rasterisation and a per-fragment light loop, none of which
  shrink with the window. It is now a **quality ladder** (ssao → shadow map → live lights →
  cascade → *then* resolution). ⚠ Its floor was `max(0.7,…)`, i.e. **below one CSS pixel — which
  the comment directly above it claimed to be honouring.**
  **Fix:** `omniLive` (12/8/5) bounds how many practicals are LIT, nearest-first, each fading to
  zero before it switches off; `spotShadow` is a count; high 2048→1024; mid drops SSAO.
  ARCADE PIT q=high: **median ×1.23, mean ×1.64**, visual cost +0.6% luma / −0.7% RMS / clipping
  to zero. ⚠ A finer cluster grid was TRIED AND REJECTED — 6% slower than engine defaults, noise
  floor ±8%; halving a cell doesn't halve a 9.5 m light's volume while CPU insert cost rises.
- ⚠ **I WAS WRONG THAT THERE ARE "NO JS ERRORS AT ANY TIER".** That was measured in a MENU on the
  default arena. `mid` + ARCADE PIT throws twice at match start: `TypeError: reading 'x'` at
  `_initBoneAabbs → get aabb → MeshInstance._isVisible → cullMeshInstances`. **Pre-existing and in
  the skinned-body path**, not the tier work — it reproduces with the old behaviour restored
  (`?omnilive=9999&sres=1024&casc=2`) and disappears with `?bodies=0`. Non-fatal, the match runs.
  Needs a separate look.
- **Mobile resolution policy — `GfxPost.dprCap()`:** ONE definition of "weak device" (touch +
  screen ≤900 + low cores/memory + save-data), used by dogfight, section9, riprocketer and
  ronin3d as `Math.min(devicePixelRatio, GfxPost.dprCap())`, and by `Gfx2D` via `deviceScale()`.
  Backing-store resolution is the dominant mobile cost — the game's own rasterisation AND every
  fullscreen post pass scale with it. Measured under iPhone emulation (390×844 @3):
  dogfight 4.3→10.9 fps, section9 6.9→11.4, riprocketer 3.1→11.5, ronin 3.4→8.1; worst frame
  1048ms→368ms. ⚑ **`dprCap` returns an ABSOLUTE cap with a floor of 1, not a multiplier** —
  the multiplier version multiplied against callers' existing `min(dpr,2)` and pushed the
  effective ratio to 0.63, i.e. *below one CSS pixel*, which is visibly soft. Never go under 1.
  ⚠ Those numbers are SwiftShader (software GL in a container), so they are RELATIVE ONLY —
  a real phone has hardware GL. **Task #73 still needs a real device.**
- **2D games on the GPU — `js/gfx-2d.js` (`Gfx2D`):** `Gfx2D.attach(canvas,{preset})` +
  `present()` at the end of the draw. The game keeps its 2D draw calls; the canvas is uploaded
  as a texture each frame and presented through `GfxPost`, so it gets bloom/rolloff/dither/
  unsharp/CA/vignette. Wired into **dogfight, riprocketer and the card-fight** (`js/card-fight.js`).
  Non-invasive by design: the source canvas keeps its layout and listeners and is only made
  `opacity:0`; the GL layer sits over it with `pointer-events:none`, so no input code changes.
  Fails open — no WebGL / no GfxPost / lost context ⇒ source canvas becomes visible again.
  ⚑ This is GPU **presentation, not geometry** — the CPU still rasterises, so there's no depth,
  lighting or 3D. True geometry is a renderer rewrite (the ronin3d path), a separate job.
- ⚑ **`cards/battle.html`'s card UI is DOM/CSS, not canvas** — its only canvas is the decorative
  `#arenaParticles` sparkle layer. Do NOT "convert the cards to WebGL": the holographic tilt,
  the vintage torn-paper back and the crisp text are CSS, and WebGL would render them *worse*.
  The legitimate GPU target in battle is the animated fight canvas in `js/card-fight.js`.
- ⚠ **Don't trust `drawImage(glCanvas)` for pixel stats.** A WebGL canvas without
  `preserveDrawingBuffer` reads back BLACK outside its own frame — it reported `meanLuma:0` for
  a NEON RONIN frame that was rendering perfectly. Screenshot to judge, `post()` to confirm the
  chain is on.
- **Section 9 has SIX maps** (`buildMaps()`): KOWLOON BLOCK · COLD STORAGE · NEON STREET ·
  **DUST BOWL** (open sand arena, tiered stands, long sightlines — the counterpoint to the
  alleys) · **SUBWAY** (two platforms either side of an exposed track trench, joined by a
  mezzanine; pillar runs to peek between) · **NIGHT MARKET** (shelf aisles make a grid of
  corridors, so every fight is a corner fight; checkouts are the one open room). Picked in the
  lobby's ARENA chip row, or ROTATE.
- **Section 9's bots are the NEON RONIN bodies — `js/section9-skin.js` (`S9Skin`), phase 2 of
  the port.** The same `models/*.skn` auto-skinned meshes, drawn by a skinning program in
  `section9-gl.js` that shares the world's fragment shader (so a body is lit, fogged and
  muzzle-flashed by the same rules as the wall behind it). Two deliberate differences from
  ronin3d: (a) `S9Skin.palette` uses a **full shortest-arc rotation**, not `Rz` — an operative's
  legs swing along the VIEW axis, which a planar palette cannot express at all; (b) **no
  `dressLoaded`** — the straw hat / horns / katana are the duel's, so Section 9 hangs a **rifle**
  off the same pose instead (an unarmed operative in a firefight reads as a bug, the same
  argument that makes NEON RONIN always draw the sword). Fails open at every step: no module, no
  skin program, a 404, a bad magic number ⇒ that bot keeps the articulated box rig. `?noskin`
  opts out; verified against `?nogl` too.
- ✅ **THE ARM SHARD IS FIXED (task #77), and the CC0 bodies are in the game.** `.skn` **v2**
  ships the bind skeleton inside the file (11 bones after the header, vertex data at 296, bones
  ×150 into the renderer's frame); `S9Skin` reads it and poses against it, falling back to the
  canonical table for v1. Measured with the new **`npm run stretch`**, same pose, same tri counts:
  `ronin` **56.6× → 8.1×** with every above-10× triangle gone (79 → 0), and `oni` **3.8× → 3.6×**
  — the fit helps the toon without damaging the mesh that already matched.
  ⚑ **The blocker was never the skeleton — it was that no one had recorded the bake commands**,
  so no asset change could be compared to anything. Reconstructed by sweeping until the tri count
  matched exactly: `oni --detail 2.5` (5,804) and `ronin --detail 2.0` (15,705). Both in
  `models/README.md` now.
  ⚑ **The CC0 characters are now the first three entries in `S9Skin.CAST`** — `cc0-lank` 3.3×,
  `cc0-squat` 4.0×, `cc0-lump` 3.9×, all with ZERO triangles over 10×, and **~0.2 MB each against
  oni's 0.9**. A four-bot match costs 0.8 MB of bodies instead of 2.35. They bake correctly only
  BECAUSE of v2: their shoulders sit at 0.76–0.78, not 0.80, so a canonical bind would have torn
  them exactly like ronin did. Every triangle is generated by `scripts/blender/build-cc0-chars.py`,
  so no third-party mesh is committed — see `models/cc0/README.md` and `docs/CC0-SOURCES.md`.
  ⚠ `kappa`/`prizm`/`doomer`/`kunoichi` are morph variants whose `--ops`/`--amt` were never
  recorded, so they remain **v1** and load unchanged through the canonical path.
  ⚠ `skin-stretch.mjs` hinges bones independently while `S9Skin.palette` uses a hierarchy and
  shortest-arc, so its absolute numbers run HARSHER than the game's. Read the columns against
  each other, not against a 3× bar.
- ⚑ **(historical) Only three of the six .skn used to ship — a QUALITY call, not just a byte
  budget.** oni + kappa + prizm = **2.35 MB**, fetched at match start and only as many as the
  match has bots (a 2-player game pays 0.93 MB). The other three are 5.04 MB *and* broken.
  **Task #77's arm shard is diagnosed: it is a PROPORTION mismatch, and it is pose-time only.**
  In bind pose every bone matrix is identical so the mesh must reproduce exactly — measured
  worst edge-stretch **1.000× for all six**, which rules out the weights being malformed in
  themselves. Posed: `oni`/`kappa`/`prizm` (from `oni.obj`) worst 2.1–2.9× and ZERO triangles
  over 3×; `ronin`/`doomer`/`kunoichi` (from `ronin.obj`) worst 8.9–19.6× and 114–194 over 3×.
  Cause: `bake-fighter.mjs`'s bind table assumes human proportions and puts the arm bones at
  0.80 of body height. `oni.obj` is a true T-pose with shoulders at 0.79–0.83 ✅.
  `ronin.obj` (TOON TROOPER) is a big-headed toon — head 38% of height, **shoulders at 0.62** —
  so its bind arm bones land inside its skull and 17% of its verts end up ~88% weighted to
  `chest` with a few percent on `armF1`; swing the arms and the two claims tear the mesh.
  ⛔ Neither published hypothesis was right (not flat sheet geometry, not the palette fanning a
  shoulder). ⚑ **AND "fit the bind skeleton to the mesh's own shoulder line" is only HALF the
  fix — attempted 2026-07-31 and reverted before it shipped, because on its own it makes things
  WORSE.** The measurement works: slicing the mesh into 48 bands and taking the widest slice in
  the upper body finds `ronin.obj`'s real shoulder line, and re-weighting against it drops
  rigid-snapped vertices to 0.0%. But **`js/section9-skin.js` hard-codes the bind skeleton**
  (`BIND`, in px at H=150 — the arm sits at y 120, i.e. exactly the canonical 0.80). So a fitted
  bake produces weights measured against one skeleton and posed by a different one, which is a
  worse mismatch than the one it set out to cure.
  **The real fix is paired: the bind skeleton has to ship WITH THE MESH.** Bump the `.skn` to v2,
  append the 11 bones (start+end = 66 floats = 264 bytes) after the header, have `S9Skin` read
  them and fall back to the canonical table for v1 files, then re-bake all six. The skeleton
  belongs to the body, not to the renderer — which is the actual design error underneath task
  #77. Details + numbers in `models/README.md`.
- ⛔ **`js/ronin.js` WAS READING v2 `.skn` AT THE v1 OFFSET (32, not 296) — a shipped bug nobody
  saw.** v2 puts 11 bones × [start,end] = **264 bytes** at offset 32, and **264 is not a multiple
  of the 56-byte stride**, so it never threw: it slid every vertex **4.71 along**, shuffling
  position into normal into bone index. `oni.skn` and `ronin.skn` became v2 with task #77, so
  **two of NEON RONIN's six fighters have been loading as noise ever since.** ⚑ Verified
  independently by arithmetic, not taken on report: both files' lengths equal `296 + n·56` exactly
  while `kappa.skn` (v1) equals `32 + n·56`. **An offset bug in a binary format never throws; it
  just draws wrong.** `js/section9-skin.js` and `bake-fighter.mjs` always read it correctly — only
  this one reader did not.
- ✅ **SEVEN generated bodies now, 1.25 MB total — less than TWO imported ones.** New: `rip-mascot`
  (PRIZE MASCOT, from the artist's OWN Fake Rares practice — ⛔ no Pepe, nothing amphibian
  modelled), `cc0-mosh` (BAD SIGNAL ← XCOPY, solo work only), `cc0-cel` (HEAVY LINE ← Darkfarms
  SMOWLz only, **not** Decal/BOME), `cc0-grid` (GRIDLOCK ← Nouns, ⛔ no noggles).
  ⚑ **Every body carries a ripmaster3030studios name** (`S9Skin.nameFor`) — CC0 never waives
  trademark, so a body may be INFORMED by a source and never NAMED after one.
  Measured (`npm run stretch`, same pose): cc0-cel **1.6×**, cc0-mosh **1.8×** — the two
  best-behaved bodies in the repo, against oni 3.6× / prizm 6.1× / kappa 23.7×. Zero triangles
  over 10× on all seven. The existing three re-verified **byte-identical**, so no recorded number
  was invalidated.
  ⚑ **The bake command is now ASSERTED, not written down** — `npm run cc0` bakes all seven and
  checks each file's length against its vertex count. The oni/ronin settings were lost precisely
  because they lived in prose; `--detail 2.5` was recovered by sweeping until the shipped files
  reproduced byte-identically.
- ⚠ `S9Skin.load()` memoises per name and fires `onSkin` only on the FIRST call — a harness that
  parses a body before the match starts silently stops the game registering it with GL, and it
  reads as "the mesh didn't load".
- ⚠ **NEON RONIN loads the new bodies but does not field them**: that needs an `ARCH` entry with
  stats, weapon and card-unlock rules. Roster design, artist's call.
- ⚑ **Cross-limb stitch (`S9Skin`, at load).** Separate, smaller defect that survives on the good
  family: `bake-fighter`'s side test has a tolerance band at the centreline, so near the floor a
  few triangles get corners bound **rigidly to opposite shins** — a spike between the ankles under
  a stride. Repaired PER TRIANGLE (each corner is individually fine; the combination is not): the
  minority corner adopts the majority corner's bones. 113/4604 tris on kappa, 85/4217 on prizm →
  worst stretch 21.2×→6.0× and 9.0×→6.7×. Stride amplitude is also a quality knob, not just a
  look one — run swing 0.95→0.72 rad roughly halves the stretched-triangle count.
- **Section 9 phase 3 — baked levels stop being sandstone.** ronin3d's `uMat` material system is
  in `section9-gl.js`'s shared FS, but with ONE change that makes it portable: ronin3d keys its
  patterns on `vL.y` and `atan(vL.z,vL.x)` — a cylinder wrapped round a fighter — which
  degenerates on a room (a band keyed on y is a constant across a floor). The coordinate is now
  picked **per fragment from the face normal**: drop the axis the surface points along, pattern
  the other two. One material id then means the same thing on a floor, a wall and a shoulder,
  which is what lets bodies and world share a shader. Per-surface assignment comes from the
  **collision box a triangle's centroid sits inside** — those boxes ARE the authored objects, so
  `S9World.kindOf` already names them; pillars/rails → brushed metal, crates → warm, up-facing →
  mottled deck, else banded wall, plus contact-AO up each object's sides and per-triangle jitter.
  ⚑ Three things only screenshots taught: (a) **mat 7 is right for a wall and wrong for a floor**
  and it's the same material — `mp.y` is world y on a wall (horizontal courses) but world z on a
  floor (a moiréing zebra); (b) **tints must neutralise hue without dropping luminance** — the
  warm textures need blue lifted past 1.0, but scaling the whole thing down turned THE VAULT into
  unreadable near-black, because a wall facing away from the key is lit by ambient alone so its
  albedo IS its brightness; (c) **ambient goes UP indoors, not down** (0.33 → 0.45): outdoors the
  sky is the fill, inside a concrete box the fill is bounce off six close surfaces. Interiors
  also get a cool key + cool haze + **dark neutral sky** (a baked level has no infinite floor
  plane, so you see past its edge; dusk orange at floor level reads as a bug). `S9World.LEVELS`
  gained `open:true` for ROOFTOP — it is outdoors and keeps ENV. The six built-ins build with
  `uMat 0`, no overrides, white vertex colours → byte-identical, verified by screenshot.
- **Section 9 combat feel (Battlefield-ish round).** ⚑ **TTK is the load-bearing number.** At the
  old 100 HP / 26 dmg an AK duel was ~0.63 s, and at that speed cover, suppression and visible
  bullets cannot exist — nobody lives long enough to use them. Now **150 HP / 60 armour**, AK 17,
  pistol 22, buckshot 9, rifle 88 ⇒ ~1.3 s. Two carve-outs keep aim worth having: headshot ×2.1
  AND **armour soaks only 15% of a headshot vs 45% of a body hit** (without that, a long TTK
  quietly deletes the sniper). **Out-of-combat regen** to 62% of max after 4.5 s clean — a
  survivable fight is only interesting if disengaging is a real option.
- **Tracers TRAVEL** (`G.tracers` carry dir + `p` + 340 m/s, not a pre-drawn full path). Damage is
  still hitscan at the trigger pull — presentation only. Not every round traces (yours ~55%,
  theirs ~42%): a round you see every time stops meaning anything. **Near-miss crack** when a shot
  passes <2.2 m of the camera; the test clamps to the segment so a round that stops in a wall
  behind you doesn't crack after it landed.
- **Bots take cover — `bakeCover(MAP)` + a 5-state `stepBot`.** Cover points are the perimeter of
  every solid tall enough to hide behind, baked once per map from **MAP.solids, which both map
  kinds already have**. `pickCover` SCORES rather than filters (near · far side of the block ·
  and above all **LOS from there to the target's eye is blocked**) so a bot in the open still
  moves somewhere sane. States in priority order: cover · flank · suppress · push · patrol — the
  point is that two of them make a bot deliberately NOT shoot at what it's looking at. **Being
  shot sets `supT` + a last-known position** — that single line is what turns the longer TTK into
  a firefight instead of a longer damage race. Flanking is a *committed* bearing held for seconds
  (the old coin-flip every ~1 s read as vibrating). Barks → a quiet `#comms` feed under the
  killfeed; generic archetype chatter, nothing lifted.
- **Motion smear lives in `js/gfx-post.js`** (composite → accumulation target that samples the
  previous one → blit; one extra pass, only on that path). ⚑ `blur` is read off the object handed
  to `create()`, so `{...PRESET.neon, blur:0.3}` gives dogfight a smear without ronin inheriting
  it. Every named preset is **0 except `tactical` (0.55)**. It is a CEILING: the game calls
  `post.motion(0..1)` and the mix is motion × blur, so a still camera is pin sharp. Capped at
  0.85 (feedback loop) and there is a **warm-up guard** — the first frame after allocation or a
  resize has an uninitialised "previous" target and mixing it in is a frame of garbage.
- **Arena texturing:** grime is **directional** (walls weep down, floors wear in patches) and it's
  the direction that stops the eye reading a repeat — all inside the existing 256px tile, so no
  memory/draw-call change. **Graffiti is wholly generated** (seeded stroke path → overspray,
  outline, fill, highlight, drips): nothing traced or sampled, which is the only kind this repo
  can ship. Placed from MAP.solids, seeded off the map NAME so an arena wears the same tags every
  load. ⚠ Still reads as colour bands at range rather than legible marks — needs a closer pass.
- Reload / weapon swap / respawn use the artist's recorded foley via `RipSfx` (`js/sfx-lib.js`),
  not the oscillator kit; bots within 20 m are audible, because hearing someone reload is
  tactical information.
- **Section 9 also loads BAKED levels — `js/section9-world.js` (`S9World`), phase 1 of the port.**
  ARCADE PIT · THE VAULT · ROOFTOP are `models/world/*.wld` + `.cols.json` (`npm run level`),
  appended to the arena chips after the six built-ins. ⚑ **This is an adapter, not a renderer
  rewrite, and the bet held**: a Section 9 map already IS boxes-with-AABBs, so `.cols.json` boxes
  become `MAP.solids` (collision, raycast, AI line-of-sight, 2D fallback all untouched) and the
  `.wld` triangle soup becomes `MAP.mesh`, which is the only thing that changed — what GL draws.
  A `.wld` has no UVs/materials/vertex colour, so `GLR` derives all three per triangle from the
  face normal (up-facing → floor texture, else wall; planar UV on the dominant axis). The
  `.wld` parser is **`RoninWorld.load()` reused** — one format, one parser; Section 9 uses none
  of RoninWorld's movement model and copes with the file being absent.
  **Fails open at every step**: no RoninWorld, no fetch, no boxes, no spawns ⇒ that level is one
  chip that never appears and the six built-ins ship exactly as before (verified by aborting all
  `models/world/*` requests). ROTATE deliberately still cycles the six only — `MAPS` grows
  asynchronously, so anything modulo `MAPS.length` would depend on network timing.
- ⚑ **A baked level's floor is not y=0.** The arcade pit floor tops out at 1.05, the vault at
  1.19, the rooftop deck at **11.79** — so `MAP.spawns` is now `[x, z, y]` (`y` optional; the six
  built-ins stay `[x, z]` and behave identically). `supportY()` only sees a surface you could step
  onto from where you already are, so a spawn's y must be seeded BEFORE asking it (`dropAt()`) or
  you drop in underneath the level; `spawnYaw()` likewise sweeps at `y + 1.52`, not 1.52.
  `fixSpawns()` is skipped for baked levels — they are validated against this same box set at
  bake time, and its rescue spiral searches x/z only, which on a level with floors at three
  different heights lands you in mid-air. Re-checked all 21 baked spawns against Section 9's own
  (tighter) collider — r 0.42 / h 1.72 / step 0.62 vs the bake's 0.55 / 2.1 / 0.9 — 21/21 clear.
- ⚑ **Authored spawns, not rescued ones.** `fixSpawns()` relocating a spawn is a safety net,
  not a design: DUST BOWL first shipped with 7 of 10 relocated because the stands step inward
  to |x|≈16.2 and the spawns sat at ±19. Re-authored to 1. If a new map relocates more than a
  couple, the map is wrong, not the validator.
- **Section 9 spawns are validated, not trusted.** `fixSpawns()` rejects any hand-written spawn
  without 1.5u of clearance and spirals out to open floor; `spawnYaw()` picks the longest clear
  sightline instead of "face arena centre". Before this, 4 of NEON STREET's 10 spawns sat *inside*
  the roof-deck boxes (and KOWLOON/COLD STORAGE each had buried ones too) — you spawned sealed in
  geometry staring at a wall, which reads as "the update didn't ship".
- ⚠ **This container's screenshot path rotates hue on CANVAS content.** DOM text and CSS come
  out correct in the same shot, so a screenshot that looks colour-shifted is not evidence of a
  shader bug — `getImageData` on the source canvas proved the pixels were right while the PNG
  showed green as magenta. **Judge colour from `getImageData`, never from a SwiftShader
  screenshot.** Judge LAYOUT from screenshots freely; that part is trustworthy.
- ⚠ **Headless rAF stalls between input events.** A quiet 600 ms window can advance `G.t` by
  exactly 0, then a keypress unblocks a burst of frames. So "I held the key and nothing moved"
  is an artifact, not a stuck control — probe by pumping input and reading state, and never
  conclude a game loop is broken from one sample. Also: waking rAF with **Shift** presses the
  BOOST key in dogfight, which quietly changes what you are measuring.
- **DOGFIGHT flight physics — height and speed are ONE currency.** Climbing spends speed,
  diving buys it back (`spd -= dAlt·3.4`, measured against the CLAMPED altitude so grinding the
  ceiling doesn't keep charging for a climb that isn't happening). Control authority rides
  airspeed (`0.5 + spd/16`, floored at 0.5 — unresponsive is a feeling, uncontrollable is a bug
  report), and a sustained hard turn scrubs speed, so rate-fighting costs energy. Equilibria,
  derived not guessed: sustained full climb settles at **5.6** vs 9 cruise, full dive at
  **12.4**, and boost overpowers the trade entirely (19.9 of 22) — so boost still means escape.
  Bots climb to bank height when far and dive to convert it when closing, and unload below
  speed 5.5; without that the energy model would tax only the player and read as a handicap.
- **Headless verify:** node http server + playwright-core at
  `/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js`, chromium
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `--no-sandbox` (WebGL adds
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`).
- **NFA always** — experimental art token, can go to zero; keep the disclaimers loud.

## ✅ SEPOLIA PRE-FLIGHT — `npm run preflight`, keyless, and it CLOSED THREE OPEN WORRIES
Reads the live chain with `eth_call` only — no key, no gas, no writes — so every reason to abort a
rehearsal is knowable for free before the expensive half. Run 2026-08-02 against block 11,404,471:
- ✅ **`getMarketState()` WORD ORDER IS CONFIRMED ON THE REAL EDITION.** It was recorded as
  "unproven, can drift", and a transposed word puts a **280×-wrong price** on a collector's card.
  The tick and the price are the same quantity twice, so `1.0001^tick` must equal word1 —
  measured agreement **0.0040%**. word0 = rarePerToken. `js/lens-state.js` runs this same proof on
  every read, so the card proves its own decoding rather than trusting a note.
- ✅ **`maxSupply()` (`0xd5abeb01`) REALLY DOES REVERT** on this edition, while `maxTotalSupply()`
  (`0x2ab4d052`) answers. The selector trap is now demonstrated, not remembered.
- ✅ **`edition.renderContract()` matches what `chain-config` records** —
  `0x948E6330…de903`. CLAUDE.md's rule is "always read it, never trust a recorded address"; the
  recorded one is currently correct, and now that is a checked fact rather than a hope.
- ⚠ **The rehearsal edition is frozen as `name()` "Upperdeck Ripmaster 3030" / `symbol()`
  "UR3030"** — title case, retired studio name. Not a bug to fix: it is the exhibit for why the
  launch deploy command is now asserted character-for-character.
- ⚠ **Supply has moved since the 2026-07-24 record.** `totalSupply` is **998,700** of 1,000,000,
  i.e. **1,300 burned**, not the 350 recorded below — more rips have happened on the dev
  environment since. The buy-and-burn loop is being exercised, and it works.

### ⛔ AND IT FOUND THE ONE NUMBER NOTHING HAD MEASURED: P0
`token-model.mjs` assumes **P0 = 1 RARE/token**, and the **$7 pack rests entirely on it** — a pack
is priced in TOKENS (350 at tier I), so its dollar price is just 350 × the token price.
**The live Sepolia curve sits at 16.78 RARE/token — 16.8× the assumption. A 350-token pack costs
$93 there, not $7.**
⚠ That curve is explicitly UNCALIBRATED and its cap is 1,000,000, so this is not a forecast. But it
is the only real curve this project has ever had, and it points the same way as SuperRare's own
worked example (a $2,000 budget buying 9,211 tokens at ~$0.22 average). **Two independent data
points now say the opening price is an order of magnitude above what the pack schedule assumes.**
⚑ **The fix is free and takes one command:** `rare liquid-edition deploy multicurve … --preview`
prints the generated curve **without submitting**. Run it at the 3,300,000 cap, put the real P0
into `token-model.mjs`, and re-derive the pack schedule **before** the $7 figure is published
anywhere it can be quoted back at the studio.

## Dress rehearsal (2026-07-24) — buy + burn PROVEN live
- Artist wallet `0x5C3b…d89F` bought **367.17 UR3030 for 6,000 test RARE** (tx
  `0xee5424…807b85`) and site-ripped a pack, burning **350** (tx `0xba1716…1a78ff`).
  `totalSupply` = **999,650** — the first permanent burn; SuperRare's page shows it live.
- **Testnet collect UI = `dev.superrare.co`** (prod superrare.com 404s testnet tokens);
  `buyUrl()` is chain-aware. Test curve is UNCALIBRATED: 1 UR3030 ≈ 16 RARE (word order
  of `getMarketState` verified on-chain — word0 = rarePerToken; see ILiquid.sol notes).
- **Port-into-SuperRare plan:** renderer emits `animation_url` (owner-settable via
  `setAnimationUrl`) → full site in the token page's media slot; `/cabinet.html` is the
  sandbox-safe embed fallback (no gate, opt-in WC burns, null-origin tolerant;
  vercel.json serves CORS-open). ✅ **PROVEN 2026-07-27 — the artist deployed the updated
  renderer on the dev environment and the SuperRare token page renders the live site in its
  media slot.** The port-into-SuperRare plan is no longer theoretical; repeat on mainnet at
  launch.

## Pending
- Clean-slate the placeholder deck (plan in the launch dossier / `docs`); Aug-6 launch PDF
  for the artist + SuperRare; build the render-by-id lens + voucher mint; get SuperRare's
  deploy-path answer; ingest the real 100 cards as art lands.

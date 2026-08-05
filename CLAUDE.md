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

## ⛔ THE SITE WENT DARK ONE DAY BEFORE LAUNCH, AND THE REDIRECT THAT DID IT WAS OURS
Artist: *"lets focus on getting the site up - dark atm."* `www` 308'd to the apex, the apex 308'd
back to `www`; curl gave up at fifty hops. Runbook: `docs/DNS-AND-DOMAIN.md` §4½.
- ⚑ **BOTH HALVES WERE CORRECT IN ISOLATION.** The platform serves **`www` as Production** and 308s
  the apex to it — the dashboard's job, done right. `vercel.json` ALSO carried a `www → apex` rule,
  host-scoped exactly as the existing test demanded. **Host-scoped stops a rule matching EVERY
  domain; it says nothing about aiming at the ONE domain the site is served from.**
  ⛔ **apex↔www belongs to the platform and nowhere else.** This repo owns the OLD-domain forward
  and nothing else.
- ⛔ **EVERY MEASUREMENT POINTED AWAY FROM IT, IN THE REASSURING DIRECTION.** The old-domain forward
  was landing on `www` — not on the apex our rule names — which *proved* these rules were not the
  ones firing. True, right up until the deploy carrying them went live. ⚑ **"My config is not what
  is running" has a shelf life of exactly one deploy**, and the window it is true in is the window
  you write the rule in.
- ⚑ **THE TEST WAS ASKING THE WRONG QUESTION AND PASSING.** It asserted a host scope EXISTS. It now
  runs each redirect's host regex **against the live hosts** and fails if any matches. Proved to
  bite by restoring the exact committed config that caused the outage: 1 failure, naming the host.
  ⚠ My first sabotage attempt passed — the shell ate a backslash, so the regex tested a literal
  `\\` and matched nothing. **A sabotage that does not reproduce the original bytes proves nothing**;
  use `git show HEAD:<file>` rather than hand-retyping the defect.
- ⚠ **"Dark" had a second, legitimate cause and they must not be conflated:** behind the loop the
  pre-launch veil (`gate.js`) is doing exactly its job — a visitor sees `◈ PRIVATE · PRE-LAUNCH ◈`
  and a password field at `z-index 2147483647`. Verified separately that the site BEHIND it is
  healthy (1,670 words, 19 links, countdown live, wordmark canvas up, **0 JS errors, 0 failed
  requests**) — because lifting the veil on launch night reveals whatever is under it, and that is
  a bad moment to find out.
- ⚠ **The canonical host is `www`; every shipped surface names the apex** (canonicals, `og:url`,
  `sitemap.xml`, `robots.txt`, `token-metadata.json`). All resolve — apex 308s to `www` — so nothing
  is broken, but each is one hop from the truth. **The fix is one dashboard click, not a sweep:**
  make the apex Production, let `www` redirect to it, and every string already shipped is exact.
- ⚠ Chromium here cannot use the agent proxy for outbound TLS (`ERR_CONNECTION_RESET`), so a live
  headless visit is not available. Serving the repo at the deployed commit is byte-equivalent and
  answers the same question; `curl` reaches the real host fine and is what proves the redirect.

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
- ⛔ **`npm test | tail` REPORTS THE PIPE'S EXIT CODE, NOT npm's** — and `npm test` chains 17 scripts
  with `&&`, so a failure HALTS the chain and the tail shows whichever suite ran last, looking
  exactly like a clean finish. Reported "green" twice off `| tail -8` and `| grep`; the chain had
  actually stopped at `test:ronin` with 1 failure and `test:reach` never ran. ⚑ **Redirect to a file
  and read `$?` from npm itself** (`npm test > log 2>&1; echo $?`). Same shape as every other defect
  in this file: nothing tells you, and the wrong answer is the reassuring one.
- ⚠ **`test:ronin` FLAKES UNDER LOAD — 57/58 once in a full chain, 58/58 on three standalone runs
  and in a clean unpiped chain.** It is the one harness here that depends on real timing: the window
  must be ≥700px (`DEVICE_OK`, or no level loads and the assertions cannot bite) and it drives input
  events, which this container's rAF stalls between. **A single failure there is not a regression
  until it reproduces** — check what the failing suite actually reads before chasing it.

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

## ⛔ THE SITE 3D PROPS ARE GONE — "random 3D icons that do nothing" (artist, 2026-08-05)
*"what are all these weird 3D objects that are half baked. remove them. when I asked for the site
updated in playcanvas, random 3D icons that do nothing, was not what I was intending."*
`js/site3d-prop.js` and its five hosts (`index`, `arcade`, `cards/{binder,index,market}`) deleted,
with the CSS, the loader tags and the explanatory notes. `scripts/build-site-check.mjs` went with
them — it existed to hold those props to numbers and was never wired into `npm test`.
- ⚑ **I MISREAD "UPGRADE THE SITE WITH PLAYCANVAS ELEMENTS" AS "PUT AN ENGINE OBJECT ON EACH
  PAGE".** The brief was about the site LOOKING like it came from the same studio as the games;
  what shipped was a decorative binder, a bench and a fan of cards sitting in a slot, doing
  nothing and reacting to nothing. **That is DESIGN-SYSTEM §4 unanswered — "what MOVES and why it
  physically moved" — for the third recorded time**, and the fact that each one was measured,
  fail-open and correctly lit is exactly the trap §9 describes: the easy half answered well.
- ⚠ **THE TEXTURES STAYED, and that distinction is the whole of the cleanup.** `media/site/{pulp,
  steel,vinyl}-{albedo,normal}.webp` are tiled by the FLAT CSS on those three card pages and
  always were; the props merely shared them. `scripts/blender/build-site-props.py` and
  `build-site-props.mjs` stay for the same reason — deleting the bake would have quietly orphaned
  live page styling to tidy up a removed feature.
- ⚠ Verified by loading all five pages: no errors, no gaps where a prop used to be. `test:name`
  77/77 and `test:reach` 197/197.

## ◱ THE BRAND — `docs/BRAND-3030.md` + `studio3d.html`, `npm run test:sheet` (25)
*Artist, 2026-08-05: "lets design (inspired by the current site) and rebrand for ripmaster 3030
studios … the entire site in interactive webgl for playcanvas."* ⚠ **A PROPOSAL, and disposable on
purpose** — `index.html` is untouched and the new page says "proposal · not final art" on its face.
- ⚑ **THE POSITION: THE STUDIO IS A PRESS, NOT A POSTER.** `index.html` is a *poster about* a card;
  `studio3d.html` is **the uncut sheet the cards come off** — eight up, crop marks, colour bar, a
  perforation between every pair, the slug hot-foil-stamped in the tail margin. ⛔ **The navigation
  IS the physical act: you tear a card out**, and the studio's verb is RIP. That is §4 answered
  with a mechanic instead of a light vector, which is the half two rejected wordmarks skipped.
- ⛔ **THE STOCK IS PALE ON A BLACK SITE, AND IT IS A STRUCTURAL ARGUMENT.** Ink MULTIPLIES the
  paper and never adds; on near-black stock there is nothing to multiply, so **black stock forces
  additive ink** — the exact thing `hero-card.js` forbids. Measured: halve the paper and the print
  halves, **ratio 0.508**; at zero stock only 1.45% survives (the sheen, which is not albedo).
- ⛔ **⟨proposal⟩ GOLD IS PROMOTED FROM ACCENT TO KEY LIGHT**, contradicting `DESIGN-SYSTEM §2` on
  purpose: that file says gold "is not a light" and two paragraphs later notes the two torches sit
  exactly where two warm keys would go. A torch *is* a light. Green becomes the ROOM, not an ink —
  which is also what stops warm paper going ill under a green key. Strike or ratify; do not leave.
- ⛔ **TWO MEASUREMENTS WERE WRONG BEFORE THEY WERE RIGHT, AND BOTH WRONG ANSWERS WERE REASSURING:**
  (a) **the readback returned a STALE frame every time** — render, bind framebuffer 0, `readPixels`
  is the obvious thing and a pure-red clear colour still read back green. Nothing errored, and the
  harness reported the foil and its own sabotage control as **identical**, i.e. an A/B whose halves
  are the same, which looks exactly like a null result. Read from a RenderTarget you own.
  (b) **the hue statistic punished the fix** — a MEAN hue over the slug averages away the thing it
  measures, so refining the grating (unambiguously more diffractive) drove the number **99° → 63°**.
  The right statistic is per-point travel, sampled by PROJECTING points on the foil through the live
  camera; a fixed fraction of the moving screen box is a different piece of foil at every angle.
  Final: **median 586°, control 51°** — 11.5× separation.
- ⚑ **Measured**: coupling n+1 0 ms → n+2 67 ms (kills 8 loose springs — proved by setting
  `COUPLE = 0`, which fails that one assertion); release overshoots +0.196 → −0.061; the coupling
  **dies with the web** (2.2 × 10⁻¹⁸ after the tear); tear is monotone; at rest max displacement is
  **exactly 0**; WebGL2 refused ⇒ 8/8 card links + 8/8 docket links live and no canvas inserted.
- ⚠ **The torches flicker and the sheet does not.** A flame is a combustion — the one thing with its
  own reason to move — and it touches LIGHT, never geometry, which is why test 4 asserts
  displacement rather than a frame hash. (The hero card recorded a shader breath that broke a frame
  hash while "flex is exactly 0" stayed green. Assert the thing you mean.)
- ⚠ Also caught here: the sheet printed **mirror-image** (canvas Y counts down, UV V counts up); the
  paper CLIPPED at ~1.5 linear, which is why ink-multiply first read 0.68 — clipped paper cannot be
  dimmed; and the masthead was 400px tall on a phone, putting the whole object below the fold.
- ⚠ **NOT DECIDED, and the artist's:** whether this replaces the front page at all, the eight card
  names, the card faces (generated placeholder ink — eight distinct compositions, but *which* one
  goes *where* is authorship, the same open question as the 33's figure placement), and the
  typeface question. Plan for the rest of the site + honest sizing: `BRAND-3030.md` §9.

## ✅ THE 33 · STEP 1 — `cards/proof.html` + `js/hero-card.js`, `npm run test:hero` (20)
*Artist, 2026-08-04: "make them from scratch as 3D cards … living generative works with glitches
and fx treatments. use the 100 cards as source material to paint these cards." Then: "no font."*
Brief `docs/HERO-33-BRIEF.md`. Reached from the folder (`cards/binder.html`, ◆ THE 33).
- ⚑ **THE CARD IS A FOUR-COLOUR SEPARATION OF A COMPOSITION MADE OUT OF THE DECK.** Each ink is
  laid down at its own registration and screened at its own angle (15/75/0/45), so the
  mis-registration and the moiré are not effects applied to a picture — they **fall out of
  printing one picture four times with the plates slightly wrong**. Two properties the brief needs
  therefore become STRUCTURAL rather than promised: the offset is uniform across the frame because
  it is one vector per plate, and every sample resolves to a deck card because there is no other
  image in the shader. ⛔ Ink MULTIPLIES the paper's reflectance and never adds — one line, and it
  is what keeps the thing a card instead of a screen.
- ⛔ **REGISTRATION IS FROZEN, PARALLAX IS NOT, and conflating them would have made acceptance 4
  unmeasurable.** Registration is a press failure: fixed at the impression, identical from every
  angle — **your card is one bad pull**. Parallax is depth, per element, and moves only when you
  do. Hold the view still, step the registration, and the field must be one constant vector.
- ⛔ **THE BRIEF CONTRADICTED ITSELF AND STILLNESS WON.** §3 wanted an ambient press cycle *and*
  "zero displacement, nothing breathing" — and acceptance 2 demands **exactly 0** over ten seconds.
  ⚑ **The press is driven by HANDLING now**: work accumulates and the sheet ADVANCES. Same input
  as motion 1 at another timescale, physical, and a card nobody touches is a card on a table.
- ⚑ **FOUR AND FIVE PROVE THEY DISCRIMINATE, INSIDE THE TEST.** #4 re-runs its block-match over a
  build whose registration is deliberately RADIAL and requires it to FAIL (spread 0.21 vs 0.35,
  slope 1.31 vs 9.40); #5 requires two different seeds to differ, because "the frames match" is
  trivially true of two black frames. The other four were proved by sabotage: killing the grating
  took hue travel **612° → 12°**; a lerp took the overshoot to **0.00000** while "it moves" still
  passed; ⚠ **a wall-clock breath in the shader broke the frame hash while "flex is exactly 0"
  stayed green** — which is exactly why #2's load-bearing half is frame identity, not the springs.
- ⛔ **THE ALPHA CHANNEL OF A GENERATED CANVAS IS NOT A DATA CHANNEL.** Crease height was written
  into the composition texture's alpha via `putImageData`; a 2D canvas stores pixels PREMULTIPLIED,
  so alpha 0 multiplies that pixel's colour by zero. **Every mask in the texture was wiped wherever
  there was no crease** — i.e. almost everywhere — and the card went on rendering the ground card
  alone, edge to edge, which looks exactly like a composition nobody finished. Alpha stays 255 in
  every generated texture; a fourth channel of data gets a fourth channel of another texture.
- ⛔ **`createTexture` BINDS TO WHATEVER UNIT IS ACTIVE.** The type plate is rebuilt on every pull,
  long after setup, and it bound itself over unit 3 — the composition plate's slot. `uComp` then
  sampled the TYPE texture, and because that texture also has three meaningful channels the card
  kept rendering: strips masked to the letterforms, the figure window to the printer's marks, the
  trim to the crease relief. ⚑ **A wrong sampler binding never errors; it paints with the wrong
  data, and the picture is plausible enough to argue about.** Every texture names its unit now.
- ⚠ **`ctx.rect(x, y, w, h)` takes a HEIGHT.** Passing the window's BOTTOM EDGE ran the art window
  31 px past the name, so the title came out straddling the lip — half on stock, half on dark
  artwork, and it read as a colour choice. One `WINDOW()` for the trim and the type.
- ⚠ **A 2:3 card needs the aspect IN the projection.** One scale on x and y overscanned it 1.5×
  vertically; the trim, the marks and the whole name were off-frame, and **the middle of a card
  still looks like a card**, so it read as composition rather than projection.
- ⚠ **The screen ruling was wrong in BOTH directions, an octave each way.** At 118 cells the dots
  were the picture; at 240 they aliased into a moiré grid against a 500-px buffer — a rendering
  failure dressed as a print one. 170. Paper tooth had the same problem at 900.
- ⚠ **All three pigment cards at 1:1 average into ONE card.** Three pictures of the same kind of
  thing at the same size is a filter, not a composition. Ground zoomed to a field, mid mirrored at
  another scale, only the figure near card-size — and cropped ABOVE the source's own name, or the
  hero wears somebody else's title.
- ⚠ **A crease is WIDE and SHALLOW.** 0.6–1.8% of the card with a normal gain of 26 put hard black
  lines across the art: at that width the height field swings past the terminator in one texel and
  a FOLD renders as a SCRATCH. And the die edge is an EDGE — a foil band from 0.86 gave the card a
  rainbow border, which is the decal acceptance 1 exists to catch.
- ⛔ **`?bare` IS NOT A MEDIA-SLOT MODE.** `cards/proof.html` loads `/gate.js`, so in a sandboxed
  iframe at an opaque origin it shows the **pre-launch veil** — measured, not assumed. The gate is
  right (unreleased prototype); the point is that **acceptance 10 is NOT proven by anything here**
  and must not be assumed from a chromeless view. That belongs to a real `cards/hero/NN.html`.
- ⚠ **`test:reach` §6b strips comments before checking for entropy**, because the renderer's own
  header explains that `Math.random` appears nowhere in it and the first version failed on the
  sentence describing the property it was verifying. Same lesson as `test:name`, new place.
- ⚠ **Two renderers on purpose, and the test is whether they would share a fix.** `js/card3d.js`
  stays THE ONE dynamic card — it reproduces art someone painted, with a measured colour pipeline.
  This one generates the artwork and damages it. When the 33 land, the honest composition is that
  this draws the ARTWORK and card3d frames it.
- ⚠ **Open, and the artist's:** the burn end state reads as *a worse print* rather than a card that
  has been through something; the tear may now be too subtle to be a feature; and **where the
  figure sits is authorship, not a seed** — which decides whether the 33 are a set or a batch.
  Plus §8's standing four, including the 33 names.

### ✅ AND IT IS A REAL MATERIAL — PBR + metallic foil (artist, 2026-08-04)
*"these are awesome - lets keep texturing and add pbr textures, metallic foil etc."* Cook-Torrance
GGX, albedo/roughness/metallic/normal, three lights and an analytic room. **`npm run test:hero` 30.**
- ⛔ **THE ENVIRONMENT IS REACHABLE ONLY THROUGH THE METALLIC TERM**, which is `js/card3d.js`'s most
  expensive recorded bug turned into a structure instead of an intention: an env map on the art
  plate lands as ambient specular, i.e. a milky wash, measured there as lifted blacks and lost
  saturation. **Asserted: switch the room off and the ARTWORK must come back byte-identical while
  the FOIL changes.** Letting the artwork see it fails that assertion instantly.
- ⛔ **THE GRATING IS THE METAL'S REFLECTANCE, NOT A TINT OVER THE TOP.** v1 mixed the diffracted
  hue over the finished pixel — a decal with extra steps. A foil stamp is thin metal: no diffuse,
  specular tinted by the metal, and a ruled grating makes that tint a function of the half-angle.
  `pal()` feeds F0 and Fresnel carries it, so the colour arrives THROUGH the lighting. Hue travel
  **612° → 802°** as a side effect.
- ⛔ **"METAL" IS NOT "SHINY", AND MY FIRST TEST FOR IT WAS PHYSICALLY WRONG.** I asserted the foil
  goes dark when the key moves away; it bottomed out at 0.46 of its peak and the assertion was the
  thing at fault — **a metal in a room reflects the room.** A metal has exactly two sources and no
  diffuse, so the exact test removes BOTH: room off, key off-specular, die edge falls to **0.022**,
  while the same build with the foil turned into a coloured plastic sits at **0.249**.
  ⚠ An earlier version asked whether the HIGHLIGHT was tinted, and the coloured-plastic build
  passed it — a saturated matte patch has saturated bright pixels too.
- ⛔ **LIGHTS AND THE ROOM ARE IN WORLD SPACE.** They were being handed to an OBJECT-space normal,
  so the key turned with the card and the highlight never moved: printed-on shading wearing a
  material's clothes. ⚠ And the first world-space rig swung the key through a full circle in xz,
  which put it BEHIND an opaque sheet for half the sweep — N·L went negative and the card came out
  near black. **A card is lit from the side you are looking at**; the azimuth orbits the FACE.
- ⚠ **IF YOU DIVIDE BY π YOU HAVE TO PUT THE π BACK IN THE LIGHT.** Swapping `albedo * light` for
  the correct Lambert `albedo/π` is a 3.14× dim, and the first PBR pass read as a broken shader.
- ⛔ **TWO LAYERS OF THE SAME UNDERSAMPLING, AND THE ISOLATION PASS IS WHAT FOUND IT.** The card came
  back covered in fine chroma speckle and the obvious suspect was the new material — but zeroing
  every relief term changed nothing, which ruled the normals out in one shot and pointed at the
  ALBEDO. **The pigment textures are minified (the mid plate at 1.9×) with no mipmaps**, so each
  pixel took one arbitrary texel out of a 683×1024 scan. Same defect in the new stock texture at
  ~3 texels/pixel. Mipped, and the tiling dropped 7×10.5 → 2.4×3.6. ⚑ It predated the material work
  entirely; the PBR pass only made it legible by sharpening the surface.
- ⚑ **A VARNISH FILLS THE TOOTH, it does not only smooth it** — so the same mask that drops the
  roughness in the art window drops the fibre relief, and the bare trim keeps its grain.
- ⚑ **PAPER TOOTH IS FIBRES, NOT NOISE.** A hash has grain with no DIRECTION; pulp lies down in the
  machine direction and catches a raking light as short streaks. Asserted on the generated map
  (x slope vs y slope **1.31×**; a hash gives **1.03×**). ⚠ I asserted the ratio the wrong way round
  first — fibres running along x put the larger slope on **y**.
- ⛔ **AND THE "TOOTH" TEST HAD TO BE RENAMED BECAUSE IT DID NOT TEST TOOTH.** With the fibre
  switched off entirely the light-sweep assertion still passed: a crease crossing the patch answers
  a light too. It now claims only what it proves — *the bare stock answers a moving light* — and the
  fibre claim is asserted directly on the texture. `ctrl.maps()` exists for that: a property of a
  MAP should be measured on the map.
- ⚠ **The halftone dots are modelled as beads standing proud** (analytic spherical-cap slope,
  faded out below ~3 device pixels a cell so it cannot alias). Correct, and nearly invisible at
  card size — relief you cannot resolve should flatten rather than sparkle. Worth its cost is an
  open question.
- ⚠ **The GfxPost knee, carried over rather than re-learned:** this is an LDR target and metal
  specular runs past 1.0. Removing the rolloff clips **11.1%** of the card to flat white.

### ⛔ ACCEPTANCE 4 TOOK THREE TRIES, AND THE FIRST TWO WOULD HAVE FAILED ON A CORRECT CARD
Measuring "the mis-registration is uniform" is harder than it looks on a FOUR-plate print:
- **A low-spread bar is wrong.** Four plates at four registrations are SUPPOSED to disagree, and
  they disagree by a predictable amount: the offsets give mean 8.0 px / sd 3.55, and the block
  matcher reported **8.10 / 3.07**. The spread is the plates, not the measurement.
- **A slope of magnitude against position is wrong too.** It picks up which plate dominates each
  region, which follows the COMPOSITION — it read **−3.67** on a build whose offsets are four
  constants with nowhere for a position to enter.
- ✅ **The right invariant is DIRECTION.** Chromatic aberration points away from the centre; a press
  has no idea where the centre of the sheet is. `mean cos(shift, position)` = **0.03** for the real
  build against **−0.97** for the radial control — no threshold to tune, because the two answers are
  0 and 1. ⚠ And my first cosine flipped the position's y by hand: readPixels is bottom-up AND a
  feature moves by MINUS the sampling offset, so both reversals cancel. Flipping one made the terms
  cancel and the radial control measured 0.119 against the real build's 0.086 — **a control that had
  stopped controlling.**
- ⚠ **A block matcher over a halftone is matching a periodic signal**, so it locks onto the wrong
  dot: widening the search window took the honest build's measured shift from 4.6 px to 8.5 px.
  Low-pass first; the claim is about the picture, not the screen.

### ⛔ "WHERE ARE THE CARDS" — THE DECK WAS A DEAD END, AND THE ORPHAN SWEEP COULD NOT SEE IT
*Artist, 2026-08-04, from a card page: "where are the cards, I'm not seeing them in the folder or
the deck or anywhere."* Both pages rendered, both were one click from home, and he was still right.
- ⛔ **`cards/index.html` CARRIED EXACTLY ONE LINK — back to the pack.** 197 cards and no sign that
  the folder, the artist's own cards or the generated heroes existed. ⚑ **REACHABLE-FROM-SOMEWHERE
  IS NOT FINDABLE-FROM-WHERE-YOU-ARE**, which is `test:reach`'s own subject one level in from where
  it had been looking. It has a `.decknav` row now: THE FOLDER · THE ARTIST'S CARDS · ◆ THE 33.
- ⛔ **AND THE ORPHAN SWEEP HAD EXEMPTED THE DECK AS A "ROOT".** `index.html` links it as
  `href="cards/"` and every card page backs out with `href="./"` — neither is a `.html` string, so
  `navigatorsOf` saw it as unlinked and somebody resolved that by declaring it a root. **A root with
  no inbound link is an orphan with a special name.** The sweep resolves the directory form now and
  the exemption is gone; `index.html` is the only real root, because it is the domain.
- ⛔ **AN ORPHAN SWEEP CANNOT ANSWER "CAN A VISITOR GET THERE", AND MEASURING PROVED IT.** It asks
  whether ANYTHING links a page, which a CLOSED CYCLE satisfies trivially: the deck links its 196
  card pages and every card page links `./` straight back. Cutting the home page's only door left
  the whole card surface passing §2 — verified by cutting it. **§2c WALKS instead**: breadth-first
  from `index.html`, resolving hrefs the way a server does, and asserts each surface is ≤ 3 clicks.
  Proved to bite — removing both routes to the proof gives `NO WALK EXISTS`.
- ⚠ **`cards/index.html` IS GENERATED by `scripts/ingest-batch.mjs`**, so the nav went into the
  generator as well as the output — the `restyle-backs.mjs` failure from the name law, which is that
  a generator left armed will quietly put the defect back. ⚠ And the two had **already diverged**
  (the court-note copy differs), so it was patched rather than regenerated: re-running would have
  reverted live text. `test:reach` §6c now asserts generator and output carry the same nav.

### ⚑ THE PIGMENT IS THE WHOLE DECK — 211 sources
*"lets be sure to remix any of the 194+ cards we have available."* Both manifests merged, fetched
rather than listed, so the clean-slate (task #71) swaps the pigment without touching the renderer.

## ⛔ THE CABINETS ON A PHONE — `npm run test:cab` (2026-08-05)
*Artist: "put a subagent on fixing the mobile games (controls, bugs, gfx, details) | do same for
desktop."* Four cabinets, driven at 390×844 · 844×390 · 740×360 · 320×568 · 1100×700 · 1280×800.
**298 assertions, every one proved to bite by reverting its fix.**

⚑ **THE HEADLINE, AND IT IS THIS FILE'S OWN SUBJECT ONE LEVEL IN: `test:reach` §1b WAS TRUE AND THE
GAME WAS STILL UNPLAYABLE.** It asserts — correctly — that THE CITY registers pointer handlers,
injects `#touchUI` on a coarse pointer and carries a chip per mode. All of that held while, at
390×844, the control strip was **414px wide in a 390px viewport** with the drop button at x −50,
a **FIRE button sat on screen over the bird**, the legend was **0px wide and 607px tall**, and three
HUD blocks drew through each other. **Every static assertion passed and nothing errored.** A text
match cannot see a number that only exists once the page has laid out.

- ⛔ **THE SAME SPECIFICITY TRAP, ONE RULE BELOW THE COMMENT THAT RECORDS IT.** `#tFire, #tAds
  {display:none}` is (1,0,0); `#touchUI button{display:grid}` four rules above is (1,0,1), so
  `grid` won and the observer rule was broken **in the UI** — in the file whose own note claims that
  is the thing prevented. The note above `#tFlap` states the arithmetic and was applied to one rule
  and not to this one. **A recorded lesson protects the line it was written on and nothing else.**
- ⛔ **A CAP DERIVED BY SUBTRACTION HAS A ZERO IN IT.** The legend's `max-width:calc(100% − 24px −
  384px)` is negative below 408px and clamps to 0. The reservation had been raised 172 → 246 → 384
  as controls were added, each time correctly describing the strip, and nothing ever measured the
  result. It has its own ROW now instead of sharing one.
  ⚠ And a reservation for a box whose width is its own content (`#combat` is `white-space:pre`) is a
  reservation that is *sometimes* wrong — that version failed intermittently at 180px vs past it.
- ⛔ **`banner.js` WAS SITTING ON TOP OF THE GAMES' CONTROLS, INCLUDING ON A DESKTOP.** A strip
  written for a document, at the highest z-index on the site, loaded by cabinets. It covered RIP
  ROCKETER's FIRE pad by **28px** at 390×844; at 844×390 it is **11.1% of the whole screen** and
  buried CLOUD RACER's boost meter, tells and speed unit; at 1280×800 it clipped `.ctrls` by 11px.
  ⛔ **And it made ACCEPTING A FACE-OFF unclickable on every viewport** — THE ARENA's challenge
  toast at `bottom:18px` under z-index 98, the press landing on a cache notice, no error.
  ⚑ **The fix is a measurement, not a guess:** the strip publishes its own height as
  `--urm-banner` (on mount, on rotate, through a `ResizeObserver` because it re-wraps on its own,
  and 0 when tucked away) and the pages that own the bottom of the screen subtract it. A hard-coded
  "about 40px" elsewhere is how city.html's caps drifted until one reached zero.
- ⛔ **A THIRD OF THE CITY WAS UNCLICKABLE ON ANY DESKTOP UNDER ~1280px.** `#modes` is
  `pointer-events:auto` for two links it carries and is a right-anchored ~488px block painting
  AFTER `#modeBar`, so it swallowed the SECTION 9 chip: at 1100×700 **four of five sample points
  return `#modes`** and a real click leaves the mode at `animal`. At 1280 the chip ends at 764 and
  the notes start at 764 — it clears by NOTHING and reports fine. ⚑ **A hover-and-click surface
  should be the size of the thing you can click, not of the box it was laid out in**; the exception
  belongs on the `<button>` and the `<a>`, never on their parents. ⚑ And **`elementFromPoint` is
  the assertion, not a rectangle** — two boxes overlapping is a layout fact, whether the click
  lands is the question the player asks.
- ⛔ **THE ARENA WAS NOT PLAYABLE AT ALL IN PORTRAIT**, behind `js/orient.js`'s undismissable veil —
  on the orientation a shared link opens in. It is a **scrolling column of DOM panels** (this file
  already says its UI "is DOM/CSS, not canvas"), i.e. the `arcade.html` call. The veil is gone
  there; the five genuinely-wide cabinets keep it. ⚠ **A judgement call, and one line to reverse.**
  Behind it: 9px of horizontal overflow from the sparkle layer's bleed, and **26 controls under the
  44px tap floor → 0**. `npm run mobile` carried nine pages and no cabinets, and could not have
  carried this one — **a page behind a veil is a page whose defects are invisible and unreachable
  at the same time**, which is why lifting the veil and adding the audit row had to happen together.
- ⚠ **CLOUD RACER's third boost tell did not fit its own capsule** — 215px of content in a 190px
  box, so SLIDING ran under the pilot avatar **on every viewport including the desktop**. Fixed by
  making the type fit the box: widening it would have pushed the avatar off a 320px phone, i.e. one
  overflow traded for another. Its launch prompt also wrapped its last word onto the pod.

### ⚠ Three assertions were written WRONG FIRST, and each says so in the file
- **A HAND-PICKED LIST OF PAIRS STOPS COVERING THE LAYOUT THE MOMENT THE LAYOUT MOVES.** The overlap
  check named six pairs and omitted `hudBL × modes` — precisely the pair that collides on a 360px
  landscape phone — so reverting that fix left the suite green. It is all fifteen pairs now, from a
  loop.
- **"NOTHING IS COVERED" IS TRIVIALLY TRUE OF A CONTROL THAT IS NOT RENDERED.** The health readout
  was 0×0 for every run until the suite stepped the simulation after the mode swap (`syncCombatHud`
  runs inside `stepOps`, i.e. on a frame, and this container stalls rAF). RIP ROCKETER's pads are
  asserted PRESENT before they are asserted clear. Same shape as asserting `hidden` instead of
  "not drawn". Likewise the challenge toast has to be `.show`n before it can be hit-tested — its
  opacity lives on the PARENT, so its buttons read at full opacity through a hidden toast.
- ⛔ **844×390 IS THE WRONG LANDSCAPE VIEWPORT TO TEST ALONE.** It clears the mode-notes collision
  by 16px while **740×360 overlaps by 14** and 667×375 clears by one. **A viewport chosen for
  convenience can hide a defect as easily as it can prevent one** — `test:ronin`'s recorded "the
  test did not bite until the viewport was fixed", with the sign flipped.

⚠ **STILL OPEN.** THE ARENA carries **82 elements under 12px and 4 prose blocks under 16px** — a
typography pass with the recorded cost (documents grew 15–25%), deliberately not attempted here.
⚠ **`test:cardlayers` FLAKES AND IT IS NOT NEW**: on an unmodified `battle.html` it read 81 / 78 /
80 / 94% against a `>= 0.78` bar with worst gaps of 510–610 ms, i.e. the assertion sits inside this
container's own rAF-stall noise. A single failure there is not a regression until it reproduces.

## ⛔ THE WHOLE CARD SURFACE WAS A WEEK STALE IN EVERY BROWSER — a header, not a deploy
*Artist, 2026-08-05: "the cards are not updated on site."* They were not. The deploy was correct,
every file was on the origin, `curl` returned the new bytes, and the newest commit was live.
- ⛔ **RULE ORDER IN `vercel.json`, AND BOTH RULES WERE INDIVIDUALLY RIGHT.** `/(.*).html` and
  `/(.*).js` set `must-revalidate`; `/cards/(.*)` sets `max-age=604800` to cache card ARTWORK,
  which is correct and wanted. **Later rules win**, and `/cards/(.*)` came last — so it silently
  overrode the document rules for every page, script and manifest under `/cards/`. Measured live:
  `cards/index.html`, `cards/cardnav.js`, `cards/binder.html`, `cards/lens3d.html`,
  `cards/manifest.json` and all 196 card pages were `max-age=604800`, while `/index.html` and
  `/js/*.js` were correctly revalidating. **The fix is a REORDER, not a rewrite.**
- ⚑ **SO THE PRESS SHIPPED AND WAS UNREACHABLE.** `js/card-press.js` and `js/hero-card.js` live at
  `/js/`, outside the rule, so they were always fresh. The pages that CALL them were a week old.
  The modules sat there and nothing invoked them.
- ⛔ **A HEADER FIX DOES NOT REACH A COPY ALREADY STORED.** A browser told to keep something for a
  week does not re-ask — it serves what it has, per URL. So after the fix the artist still had to
  hard-refresh **each card page individually**. There is no server-side remedy for an
  already-poisoned entry; it expires or the visitor busts it. ⚑ **That makes a bad cache header a
  DELAYED-ACTION bug: the damage keeps running for its whole max-age after the fix lands.** Verified
  no service worker exists, so it does self-heal.
- ⚑ **EVERY SIGNAL POINTED AWAY FROM IT IN THE REASSURING DIRECTION** — commit pushed, deployment
  live, files 200 with the right content, every dependency present. **The one thing nobody had read
  was a response HEADER.** Same shape as the redirect outage three days earlier: correct in
  isolation, wrong in composition.
- ✅ `npm run test:name` now **RESOLVES** Cache-Control the way the platform does (every match
  applies, last wins) and asserts the outcome per path rather than that some rule exists. It checks
  **both directions** — "no document is long-cached" is trivially satisfied by deleting the asset
  rules and making the site slower, so the artwork is asserted to STAY cached in the same breath.
  Proved to bite with `git show HEAD:vercel.json`: 1 failure naming all nine stale paths.
- ⚠ `banner.js`'s "fresh paint ships daily — hard refresh" strip was the studio **living with this
  bug**. It is still true for anyone poisoned before the fix; remove it after that week.

## ⛔ THE PRESS COULD TAKE A CARD AWAY — the first fail-open violation in this repo
*Artist: "the cards are not displaying in the viewer, the binder, the binder viewer, or into the
deck."* `js/card-press.js` replaced a WORKING card with the press's output **before knowing the
press had produced anything**:
- `frame()` bound `card3d`'s art plate to the press canvas immediately ⇒ a press that never drew
  left the 3D card rendering an EMPTY texture, permanently, and the flat plate was already gone.
- `tile()` assigned `img.src = canvas.toDataURL(...)` unconditionally ⇒ an empty bake painted a
  blank rectangle over a good card.
⚑ **Everything else here is allowed to be absent** — no WebGL2, no engine, a blocked script, a 404
on a manifest — and the page is still the page it was. **This was the first thing in the repo that
could make the page WORSE by failing**, and it is invisible by construction: nothing throws,
nothing 404s, and the probe reports a live press with the right three plates on it.
- ⚠ **"NOT BLANK" IS NOT "ALPHA > 0".** The press's stock is near-white, so a canvas cleared to
  paper is **fully opaque and completely empty**. The test is that the pixels **VARY** — a card is
  a picture and a picture has tonal range; a flat fill of any colour has none.
- ⛔ **I HAD THE EVIDENCE AND MISREAD IT.** Card 44 in the pockets, cards 1 and 6 in the rip fan and
  several deck tiles came back near-blank in my own screenshots; I recorded them as "pale ink" and
  went hunting a specular wash. They were empty bakes. **A measurement that explains away a visible
  defect is worse than no measurement.**
- ✅ **`npm run test:press` (10) — and the only assertion that means anything is a SABOTAGE.** "Does
  the press work" was always yes; the question is what happens when it does not, and you cannot ask
  that of a healthy press. The suite builds a press that is correct in every way and renders
  nothing. Before: deck browser **0/8** cards surviving, pockets **0/8**. After: **8/8** and
  **8/8**. ⚠ It asserts BOTH directions — a guard that never engages loses no cards either, so a
  healthy press must still visibly press (49 pressed). ⚑ That second assertion **passed on the
  broken build**, which is exactly why it could never have been the test on its own.
- ⚠ **STILL OPEN: why the press draws nothing on the artist's machine.** The guard makes it
  harmless, not explained. `cards/proof.html` is the press ALONE and is the one-look discriminator.

## ✅ ONE CARD VIEWER EVERYWHERE — `js/card-view.js`, and the reveal is a card now
*Artist, 2026-08-05: "we need the same cardviewer used in the proof.html with the enviroments - in
as every viewer. each card should have a back too."* `CardView.mount({box, card, base})` is
proof.html's viewer lifted whole; `cards/lens3d.html`, `cards/binder.html`'s starfield and the
**pack reveal** all call it. `npm run test:press` 10 → 16.
- ⚑ **THE REVEAL WAS THE LAST FLAT CARD ON THE SITE, AND IT IS THE ONE THAT MATTERS MOST.** The
  artist's frame for this whole project is anticipation — *the rip, the pull, the reveal* — and
  `#pvCard` was a CSS `background-image` of a bake: seven pressed cards fanned along the bottom and
  a photograph of one above them. It is the press itself now, in its room, and **`⇄ BACK` turns it
  over onto the real designed back** (`js/card-back.js` rasterises the card's own page).
- ⛔ **`flip()` HAD NEVER WORKED IN A LIVE VIEWER, AND THE BUTTON REPORTED SUCCESS.** It did
  `S.yawT += PI` and set a separate `faceUp` flag — but `advance()` rewrites `S.yawT` from the
  pointer **every frame**, so the half-turn survived exactly one tick. The card twitched, sprang
  back to its face, and the flag said it had turned over. ⚑ It only ever appeared to work in a
  STILL, where nothing advances — which is why nothing had caught it. **Two representations of one
  fact, disagreeing.** Now there is one: the pointer target is `pointer + faceTurn`, and `faceUp`
  is DERIVED. The shader was never at fault; it reads `V.z < 0.0`, i.e. the geometry.
  ⚠ **The assertion is the ANGLE, not the flag** — `faceUp === false` is trivially true of the
  broken build. What it could never do is get past edge-on and stay there while the loop runs.
- ⛔ **`CardView` WAS A THIRD PATH WITHOUT THE FAIL-OPEN GUARD.** `frame()` and `tile()` both prove
  ink before swapping; this one handed back a controller the moment the press BUILT, and callers
  destroy their fallback on success — so a press that builds and draws nothing laid a sheet of
  paper-white over a working card. **The exact defect the artist reported, in a new file, two days
  later.** It mounts at `opacity:0` and does not resolve until `CardPress.__hasInk` says a real
  sheet printed; 240 frames, then `null`.
- ⛔ **`press.destroy()` DID NOT RELEASE THE GL CONTEXT.** Browsers cap live WebGL contexts near
  sixteen and **silently drop the oldest**, so the pack rebuilding its reveal on every pull would
  not fail on the seventeenth rip — it would blank a card somebody opened ten minutes earlier.
  `WEBGL_lose_context` now, and the pack tears its viewer down before `innerHTML` replaces it.
- ⚠ **The designed back is OFF for stills** (`live({backs:false})`). A back costs a fetch of the
  card's page, a fetch of every stylesheet it links, a live DOM host and a 520×780 foreignObject
  raster — and `bake()` shares `live()`, so wiring it unconditionally put all four on the one path
  that runs **196 times**, to prepare a face a thumbnail has no pointer to turn.

### ⛔ THE CARD LOOKED WASHED, AND THREE MEASUREMENTS SAID THREE DIFFERENT THINGS
- ✅ **The ink is fine.** Pressed vs the flat source, same size, same path, 12 cards: mean +7.9 luma,
  **sd +6.2 (MORE tonal range)**, pale-pixel share **−6.2 points**. It is not starving.
- ✅ **The "two near-blank cards" in the fan did not exist.** All seven measured `pale 0`, range
  ~198, `data-pressed`. At dpr 3 they are full four-colour prints. It was overlap at dpr 1 — *the
  eye again, and the measurement was right.*
- ⛔ **What IS real is SAMPLING.** The ruling is a fixed 170 cells across the card, a property of
  the PRINT; how many dots a buffer can carry is a property of the BUFFER. At 270 px a cell is
  ~1.6 device pixels and the screen samples itself into speckle — measured at up to **1.38× the
  high-frequency energy** of the same card rendered at 900 and downsampled, which is the optically
  correct answer (it is what stepping back from a real card does). Not detail, moiré.
- ⛔ **I FIXED IT IN THE SHADER FIRST AND THE MEASUREMENT REFUSED IT TWICE.** Fading coverage
  toward flat density took 270 to **0.75–0.77** of the correct HF — *softer than the truth, i.e.
  mush, which is worse than mild aliasing* — **and moved the 900-px reference by ~3.5%**, so my
  claim that it was "bounded to small canvases" was simply false. ⚑ **The knee is `fwidth`, which
  varies with angle and perspective: you cannot assert "it only engages below N pixels" about a
  shader without measuring the big case too.** Reverted; the print is byte-for-byte back.
- ✅ **`CardView.backingScale()` supersamples instead** — fix the sampling, leave the print alone.
  ⚠ **The floor comes from `deviceTier()`, NOT `dprCap()`, and this repo has already paid for that
  distinction once**: `dprCap()` ends in `min(devicePixelRatio, cap)`, so an ordinary 1× desktop
  scores 1 — `gfx-post.js`'s own note records Section 9 deriving a quality tier from it and
  switching every character model off on exactly that machine. A literal floor of 2 is the same
  mistake with the sign flipped: it shoves a save-data phone `dprCap` deliberately held at 1 back
  up to 2. ⚑ **`cards/proof.html` was the surface most exposed** — it capped at `min(dpr, 2)`, so
  on a 1× monitor **the hundred cards were being graded at the one ratio that aliases**, and the
  reaction to that would have been to retune the press. It reads the shared function now.

⚠ **Two traps hit again, and both are in this file already.** (a) **`new Function` compiles without
executing**, so `test:reach` §0 scored the pack clean while `showCards()` threw `list is not
defined` on a stray call and the entire reveal never built — **a driven probe is the only thing
that finds a runtime reference error.** (b) **A comment containing BACKTICKS inside a shader
template literal ends the string** — tenth sighting, and I put it in the very note warning against
untested shader claims. `HeroCard` was simply never defined and every press on the site fell open.

## ✅ THE FORGE IS THE TOOL THE HUNDRED GET MADE WITH — `cards/proof.html`
*Artist, 2026-08-05: "the press needs more creation options (layered card) animated card /
collaged card / registration etc — these should all be settings so I can create the final 100
cards. there should be a way to save and number the cards too (i manually number, you let me know
what's left)."*
- ⚑ **ONE TABLE DRIVES FOUR THINGS** — the control's label, the value pushed into the press, the
  URL, and the saved record. They are the same list of facts, and as four separate lists they
  drift: a dial you can move but cannot save, one that saves and does not reload, or a URL missing
  the knob you just spent an hour on. Every failure in that family is silent and each one costs a
  card you cannot reproduce. **`DIALS` + `TOGGLES` are that list.**
- ⚑ **A SAVED CARD IS ITS URL.** The forge already serialised the whole press state into the query
  string, so a record is that string plus a number — no second format to keep in step, and loading
  a card is the page's own boot path rather than a parallel "apply" that can drift from it. The
  slot grid NAVIGATES; the tested path is the one that runs.
- ⛔ **THE LIVE CHAIN WAS OVERWRITING THE ARTIST'S SETTINGS.** `goLive()` pushed `{burn, price,
  depth}` from the market every 60 s over whatever was on the panel, and synced only the BURN
  slider back — so price and depth silently diverged from the numbers on screen. Right for a card
  being DISPLAYED, exactly wrong for one being MADE, and it broke the property the whole tool
  rests on. Measured: saved price 0.17 / depth 0.91, reloaded 0.50 / 0.50.
  ⚑ **The rule is the URL**: a dial named in the query string was chosen by a person, so the chain
  leaves it alone; a dial absent from it is unclaimed, so the market drives it. A fresh forge
  follows the chain, a saved card is frozen — one fact, not a mode nobody remembers to set.
- ⛔ **`.slot` WAS ALREADY TAKEN.** The new 100-slot grid used `.slot`, which is the plate-role
  caption 25 lines up — `aspect-ratio:1/1` turned all three captions into giant empty squares. It
  RENDERED, so nothing errored; found by looking at the frame. `.numgrid`/`.num` now. **A generic
  class name in a page that already has a design system collides silently.**
- ⚠ **localStorage IS NOT THE ARTIFACT AND THE UI SAYS SO.** One browser, and clearing site data
  takes the deck. The JSON export is what survives — commit it and the set rebuilds anywhere.
  Import MERGES rather than replaces; a partial import must not delete finished cards.
### ⛔ THE EDITOR: THE CARD WAS OFF THE SCREEN — `npm run test:forge` (60)
*Artist, 2026-08-05: "we need to fix the card/proof.html — the cards need a better editor — I
can't even see the changes to the cards I am making the way it is built."* He was describing a
measurement nobody had taken. Scroll each control to the middle of the viewport — which is what
using it means — and ask how much of the CARD is still on screen:

| | controls with the card **0%** visible |
| --- | --- |
| laptop 1440×900 | **9 of 11** |
| desktop 1280×800 | **9 of 11** |
| phone 390×844 | **11 of 11** |

The rail was **5,183px against a 900px viewport** and `align-items:start` parked the card at the
top of it. **100% at every control now, and the page is 1,183px instead of 5,227px.**
- ⚑ **THE HEADLINE IS `test:cab`'s LESSON ONE LEVEL IN: A TEXT MATCH CANNOT SEE A NUMBER THAT ONLY
  EXISTS ONCE THE PAGE HAS LAID OUT.** `test:reach` asserts this page is reachable and it is;
  `test:hero` asserts the press renders and it does. **Both were green throughout.** "Is the
  control present" and "can you use the control" are different questions, and only the second is
  the artist's. The page also looked completely fine in a screenshot of its first screen — which
  is the only screen anyone ever screenshots.
- ⚠ **TWO LAYOUTS, TWO MECHANISMS, and the second is not optional.** Sticky works on wide because
  the grid ROW is as tall as the rail. **In a ONE-COLUMN grid each item gets its own row, so the
  stage's containing block is exactly its own height and sticky silently no-ops** — the narrow
  layout drops to block flow. A sticky rule that quietly does nothing on the device the artist is
  holding is worse than no rule. ⚠ And the narrow block must come AFTER the `max-aspect-ratio:2/3`
  rule, which a 0.46:1 phone also matches.
- ⛔ **A STALE EXPORT WAS COVERING THE LIVE CARD — the second, independent cause of the same
  complaint.** `CardExport.attach` puts an `<img>` over the card at `z-index:3` so right-click-save
  works (correct, and why it exists), and it stayed until BACK TO THE CARD was pressed — a button
  in a different section of the five-screen rail. **The first export of a session froze the card
  and every edit after it was invisible.** An export is a snapshot OF a state; it stops being true
  the moment the state moves. `stamp()` drops it.
- ⛔ **THE CARD NOW OPENS AS THE BASE CARD** — *"the card should always start as the base card with
  no changes, THEN I apply the changes in the editor."* **Five treatments were applied before the
  artist touched anything**: registration 1, stack 1, price/depth 0.5, and the press RUNNING a
  seeded press failure. Every dial's default is the value at which it does nothing, so moving one
  is legible. ⚑ **It also made the panel agree with the brief's own acceptance 2**, which this
  page's header states in as many words — *"dead still until you touch it"* — and which the panel
  had been shipping the opposite of. ⚠ Not every control is a treatment: the key light is a
  viewing condition and the room is the room; those keep their tuned values.
- ⛔ **AND THE CHAIN WAS DRIVING A FRESH FORGE.** With no query string all three market dials were
  unclaimed, so the forge opened wherever the market was that minute. **A card being DISPLAYED
  should read the market; a card being MADE needs a fixed origin.** Following it is `?live=1` now;
  the reader still runs and still reports.
- ⚑ **RARITY AND NEW SEED STOPPED RELOADING THE PAGE.** `ctrl.reseed()` already existed and was
  unused. Rarity was *called* a build argument because it was READ as one (`o.rarity` at five
  sites) — it reaches the card only through the type plate's border sorts and the `uFrameFoil`
  uniform, both re-derivable in place, so it is state now and `setRarity` rebakes what `setText`
  already rebakes. **The reload is why the ladder went unlooked-at: six tiers meant six rebuilds,
  each losing the scroll position and reprinting the sheet from nothing.**
- ⚠ **TWO SABOTAGES FIRST REPORTED GREEN BECAUSE THE SHELL ATE THE QUOTES** and the edit never
  applied, and a third CRASHED the harness instead of failing it — no FAIL line, no total, which
  reads like a clean run. **A sabotage that does not come back as a NAMED failure has proved
  nothing.** Recorded already for a backslash; it is quotes and execution contexts too.

### ✅ SIX PLATES, ON BOTH AXES — and "plates" meant both
*Artist: "i need my plate separator to have up to 6 plates … a toggle that just creates the card
with 6 plates as before."* Two different things in this renderer are called plates; asked which,
the answer was **both**.
- **THE SEPARATION 4 → 6:** C M Y K + **orange and green**, each on its own screen angle (52.5°,
  22.5°) and its own registration. ⛔ **THEY ARE AN INK SPLIT, NOT TWO MORE LAYERS** — orange takes
  the part magenta and yellow were both carrying, green the part cyan and yellow shared, and that
  load comes OFF the process inks. **So the card reaches further without going darker: luma
  91.06 → 91.22 while 63% of its pixels change.** Adding instead of splitting would have piled two
  more inks onto a subtractive stack and driven everything toward black, which is what "6 plates
  looks worse" would actually have been.
- **THE COLLAGE 3 → 6:** wash (zoomed past ground, a colour field), strip (tiled small, turned off
  the sheet's axis), inset (a tight crop held in one region). ⚠ **The recorded failure is the
  count, not the roles** — *"three pigment cards at 1:1 average into ONE card"* — so six at similar
  scales is that failure with a bigger number. The three new roles take the scales the first three
  do not. ⚑ Masked from a **second texture**, never `uComp`'s alpha: a 2D canvas stores
  premultiplied, which is a recorded and expensive bug in this exact file.
- ⛔ **TWO ORDERING HAZARDS THAT WOULD HAVE SILENTLY REWRITTEN EVERY SAVED CARD.** (a) The two spot
  plates are drawn **LAST** in `pull()` — widening the loop from 4 to 6 would have consumed four
  more numbers *before* the film weights, roller band, phase and starve, so every impression in the
  deck would land differently. (b) A card saved before today names only `g/m/f`, and requiring all
  six in the URL **failed `every()` on all of them** — dropping the artist's three chosen plates
  and reprinting the seeded pick, **with the card still rendering**. Take the leading run; the
  press pads the rest from its own seed.
- ⚠ **Only the first three sources are load-bearing.** Requiring all six would mean one 404 on a
  source the card is not even printing takes the whole card down — and the deck is being
  clean-slated, so a missing image is a WHEN.
- ✅ Both toggles ride the existing `DIALS`/`TOGGLES` table, so both save, reload, reach the URL,
  count against the base and reset **for free**. Both prove **byte-identical round-trips** (0 bytes
  differ returning to 4 inks / 3 sources).

### ✅ THE NUMBER SAYS HOW THE CARD IS SERVED — and the hundred slots had NEVER laid out
*Artist: "i name card and save card as a number designating where it lays in the deck and how it
is served (1-33, 34-100)."* **1–33** are hero 1/1s minted by voucher and built as live HTML lenses;
**34–100** are render-only field cards `tokenURI(id)` draws without any mint. The panel says which
one you are making **before** you save — typing the number IS when that decision gets made — the
grid separates the bands by hue, the deck counts per band, and the record carries it into the JSON.
- ⛔ **90 OVERLAPPING PAIRS, AND IT PREDATES THIS PASS.** Measured on the build before any of this
  work: grid **272px**, tracks **24.5px**, cells **44px** — every cell overflowed its track by
  ~20px and sat on its neighbour, so the hundred slots rendered as a smear.
  ⚑ **THE CAUSE IS TWO CORRECT RULES MEETING**: `.num` is a `<button>` so it inherits the site's
  44px tap floor, and **`aspect-ratio:1/1` turns a HEIGHT floor into a WIDTH floor.** Neither rule
  is wrong. The tap target is bought with COLUMNS now (5 across on a coarse pointer, ~60px).
  ⚠ The comment that sat there claimed the tap target was handled *"via padding on the row"*.
  **There was no such padding. A note describing a mechanism that was never built is worse than no
  note, because it stops the next person looking.**
- ⛔ **AND `.grp .v` WAS A `float:right`.** The longer deck count (311px in a 340px rail) collapsed
  the grid to **1px with 2px tracks**, because **a grid container shrinks to avoid a float** the way
  a BFC root does. The float was correct for every value this panel had ever held, right up until a
  value got long — the recorded "a layout number derived from content that changed" failure. The
  label is a flex row now, so a long value wraps instead of eating its neighbour's width.

- ⚑ New press setters: **`setStack(k)`** (layer separation through the card's thickness — 0 is
  coplanar, and it scales rest positions AND travel together, because depth that only appears when
  the card moves is an animation rather than a build) and **`setMotion(key)`** (eight named press
  failures; the list is READ from `HeroCard.motionKeys()` so a ninth needs no UI edit). Both are
  STATE and both round-trip through `probe()` — a setting that cannot be read back cannot be saved.
- ✅ **Verified by round-trip, which is the only test that matters here**: dial thirteen settings
  off their defaults, save to № 7, navigate to a different card, load № 7 back from the grid, and
  require every value plus all three plates to return. `✓ every setting came back`.

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

### ✅ THE BIRD PLANTS, THE SQUIRREL TAKES — `js/city-drops.js` (artist, 2026-08-03)
*"have the birds poop out and place power ups and squirrels and carry power ups and steal them haha"*
- ⛔ **FIRST TIME THE ANIMAL LAYERS ACT ON EACH OTHER.** "Layers, not skins" was until now a claim
  about what each one could SEE. A bird that plants and a squirrel that takes makes it a claim about
  what each can DO TO THE OTHER — the difference between a roster and a game.
- ⚑ **THE JOKE IS THE MECHANIC.** A drop FALLS, so you cannot place it precisely — you fly over the
  spot and let go. The bird's advantage (seeing everything) becomes a decision and its disadvantage
  (no fine control) becomes the cost. **Neither had to be balanced; the physics did it.**
- ⚑ **A DROP IS A CARD, and this is the one place in the project where `box` is the RIGHT primitive
  rather than the lazy one** — the trading card is a SIZE before it is anything. That distinction
  is the whole of DESIGN-SYSTEM §1: the default is only wrong when it is not also the truth.
- ⚑ **RIVAL SQUIRRELS ARE THE OTHER END OF THE STEAL**, not decoration — a steal needs somebody to
  steal FROM. They are also the first living thing in the city, which answers the brief's open
  "is there anyone else in it?" in the mellow direction: yes, and they want your stuff.
- ⚠ **Steal reach > pick-up reach.** Taking it off someone is the EASY half; catching them was the
  hard half. Reversed, the chase is pointless.
- ⚠ **A carried card at 0.30 is INSIDE the squirrel** (body ~0.19 deep, card 0.48 tall). Seeing who
  has it is the entire point of carrying.
- ⛔ **AND A SILENT PATCH FAILURE COST A ROUND: `str.replace()` MATCHES NOTHING AND SAYS NOTHING.**
  The `drops.seed()` call was written against an anchor that an earlier edit had already changed, so
  it was never inserted — rivals came back `0`, which reads as a broken spawn and was a no-op edit.
  ⚑ Every scripted patch here now raises on a missed anchor. **An edit that does nothing is worse
  than one that errors, for exactly the reason this repo keeps re-learning: nothing tells you.**
- ⚠ Two probe mistakes worth remembering, both of which reported "the game is broken" about the
  probe: measuring `taken` AFTER the settle that already took the card, and placing the squirrel
  9 m from a card that was on a terrace — which put it inside the lido wall.

### ⛔ THREE MODES IN ONE WORLD — animal · dogfight · section 9 (artist, 2026-08-03)
*"the city game is supposed to have the fps shooter as well - and to be able to be a squirrel as
well. so there are 3 modes, animal mode, dogfight mode, section 9 mode."*
TAB cycles (shift-TAB back), **C** swaps animal, and a phone gets both as buttons. Driven: the
cycle runs animal/BIRD·observer → jet/DOGFIGHT·mortal·armed → operative/SECTION 9·mortal·armed and
**the world does not reload** — 31 near chunks before and after.
- ⚑ **THE SQUIRREL OWNS THE VERTICAL, which is why it is an animal rather than a re-skin.** Hold
  forward against any solid over 1.2 m and you climb it, crest it and step onto the roof. **Every
  box in this city is climbable by construction** — the same 1:1 guarantee the generator makes
  about landing, true only because the geometry and the collision set are one thing. Measured:
  runs 23.2 m, climbs 3.94 m.
- ⚑ **THE OPERATIVE IS SECTION 9's OWN CAPSULE** — r 0.42 · h 1.72 · step 0.62 — because its map
  format IS the city's chunk format, so the body should match what the collision was written for.
  First person, mortal, armed. Walks 11.7 m, jumps 0.89 m.
- ⚠ **WHAT EXISTS IS TRAVERSAL.** Weapons, bots and the firefight are the next step and the docs
  say so. A mode that half-exists and is described as finished is how *built ≠ reachable* becomes
  *built ≠ true*.
- ⛔ **COLLISION ORDER: VERTICAL FIRST, THEN HORIZONTAL PROBED FROM `y + step`.** Both bodies landed
  correctly on the street and then **could not move a single metre** — `walked: 0`, `moved: 0`.
  Gravity runs every frame, so the feet dip ~7 mm below the slab before the ground resolve catches
  them; the HORIZONTAL test then ran at that dipped height, found `y < groundSlab.y1`, and treated
  **the floor itself as a wall**. A body standing perfectly still on a surface it cannot walk along
  looks like broken input and is a collision-ORDER mistake. ⚑ Probing from `y + step` also gives
  step-up for free, which is why a kerb is a kerb and not a fence.
- ⚠ **THE BODY SIZE HAD TO BECOME AN ARGUMENT.** `hits()` carried the bird's 0.45/0.9 as constants;
  reusing that for a 1.72 m operative lets them stand with their head in a ceiling.
- ⚠ **"Which game" and "which animal" are DIFFERENT AXES.** Folding them into one cycle would bury
  a four-animal roster three presses deep. Two controls, two questions.
- ⚠ **A width cap tuned to two buttons breaks when a third arrives** — the mobile hint clamp was
  172px for flap+mode and had to become 246px for flap+mode+animal. Same class as the flap button
  silently shrinking: a layout number derived from a count that changed.
- ⚠ A squirrel's tail **curls above the back** — a straight taper trailing on the ground reads as a
  rat. It is a rising offset per ring, not a rotation of a straight tail.

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

### ✅ THE PRINT PASS IS LIVE — `js/city-ink.js`, and it is §2's "painted card stock" answered
Posterise the VALUE into flat fields (hue kept — quantising each channel separately drags colour
toward grey), an ink line from a **DEPTH edge** (silhouettes) **+ a LUMA edge** (creases within a
form; neither alone is sufficient — depth misses two walls meeting at the same distance, luma
misses a dark building against a dark building), plates **misregistered**, paper tooth.
⚠ **MISREGISTRATION IS NOT CHROMATIC ABERRATION.** CA is radial and grows toward the frame edge — a
lens artefact. Misregistration is a **uniform** translation per plate, because the paper went
through the press askew. Getting it wrong reads as a cheap camera instead of a cheap print.
⚑ Measured A/B through the same path, same place: distinct luma levels **97 → 83**, near-black
**0.5% → 5.14%** (that is the drawing), saturation held at ~39%. `?noink=1` is the off switch.

⛔ **IT RENDERED THE WHOLE FRAME BLACK FOR SEVERAL ROUNDS AND EVERY SIGNAL POINTED AWAY FROM THE
CAUSE.** Shader `ready` true / `failed` false, GL program present, queue enabled, `render()` called
every frame with a live `input.colorBuffer`, output the backbuffer — and a shader outputting a
CONSTANT RED was *still* black. ⚑ **The fault was the last argument:**
`drawQuadWithShader(device, target, shader, RECT)` — the queue hands `render()` the **camera's**
rect, which is NORMALISED (0..1), while drawQuadWithShader's own default builds one in **PIXELS**.
Forwarding it gave the pass a viewport **one pixel across**: it drew perfectly, somewhere nobody
could see. **Omit the argument.**
⚑ **THE ISOLATION THAT CRACKED IT WAS THE CONSTANT COLOUR.** A passthrough shader cannot tell "the
sampling is broken" from "nothing reaches the screen" — a constant can, because it deletes the
input entirely. **When two failures look identical, delete one of them.**
⚠ **And a rectangular patch of "stale content" in the sky was NOT an artefact** — it is a gap
between two towers showing distant ground, present with the pass off too. Checked before chasing.

Engine facts worth keeping: `pc.PostEffect` is an **ES class** (prototype-borrowing throws);
`pc.PostEffect.quadVertexShader` calls `getImageEffectUV()`, a shader **chunk** `createShaderFromCode`
does not inject, so write your own VS; `addEffect` reads **`needsDepthBuffer` off the effect**, not
from the camera; **an unbound `sampler2D` is not a no-op** on SwiftShader; and `addEffect` allocates
its offscreen target from the canvas size **at that moment**, so attach AFTER the first `resize()`
and call `resizeRenderTargets()` on window resize.
⚠ **A comment containing BACKTICKS inside a shader template literal ends the string** — the module
then fails to parse, `CityInk` is never defined, and every probe reports "not attached" while the
page falls open to the default look. **Fourth sighting of this trap in this repo.**
⚑ **`?readback=1` makes colour MEASURABLE** (`preserveDrawingBuffer` + a luma histogram), because
this container's screenshot path rotates hue on canvas content. ⚠ Bind the DEFAULT framebuffer
first — the engine leaves its own target bound and an unqualified `readPixels` returns 100% black,
which reads exactly like a broken renderer.
⛔ **AND THE CONTROL STOPPED BEING A CONTROL** when the flag flipped from opt-in to opt-out: the A/B
ran the pass on BOTH halves and reported a difference of ~zero. **An A/B whose halves are identical
looks like a null result, which is the most expensive kind of wrong measurement.** The probe now
throws if the control attaches.

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

### ✅ SECTION 9 ON THE GROUND — `js/city-ops.js` (artist, 2026-08-03)
*"you should be able to play as Section 9 on the ground in the city as well."* The operative mode
was TRAVERSAL — walk, look, jump, nothing to shoot and nothing shooting back. It is a firefight now.
- ⛔ **THE NUMBERS ARE SECTION 9's CHARACTER FOR CHARACTER AND CANNOT DRIFT.** 150 HP / 60 armour,
  AK 17 · pistol 22 · buckshot 9 · rifle 88 ⇒ ~1.3 s TTK; headshot ×2.1 AND armour soaking 15% of a
  headshot vs 45% of a body hit; regen to 62% after 4.5 s; tracers at 340 m/s. ⚑ **`npm run
  test:reach` parses BOTH `city-ops.js` and `s9pc-game.js` and asserts the tables are identical** —
  importing `S9Game.WEAPONS` would cost 104 KB of maps, HUD and match clock to read one array, so
  the coupling is a TEST rather than a require. Verified to bite (2 edited numbers → 2 failures).
- ⛔ **THE OBSERVER RULE IS A STRUCTURE, NOT A PROMISE.** `candidates()` is the ONLY place a target
  list is built and it reads `targetable`; `hostilesFor()` may only NARROW it, so an animal is
  absent *before* teams are considered. Driven: a squirrel sat on an operative's boots for 15 s and
  drew **zero rounds**. *"We never gave the bird any health" is not a design.*
- ⛔ **NO TEAMS MEANT THE STREET CLEARED ITSELF** — four bots seeded 50 m apart killed each other in
  13 s and none were alive when the player arrived. A free-for-all is what Section 9's ARENA is; a
  city you wander into is not, and "everyone was already dead when you got there" reads as an empty
  game, not an atmosphere.
- ⛔ **DESTROYING ONE BODY DESTROYED THE MESH ALL OF THEM SHARE.** `S9PCSkin` memoises
  `BUILT[arch].mesh`, so `entity.destroy()` took the vertex buffer with it and the next operative of
  that archetype drew from a dead one — *"Cannot read properties of null (reading 'getFormat')"*,
  with nothing visibly wrong until a body stopped rendering. **Bodies are PARKED, never destroyed**,
  which is also cheaper in a streamed city that recycles them constantly.
- ⛔ **THE RETICLE AND THE BULLET DISAGREED.** The first-person camera read `pitch` as a SLOPE
  (`y + pitch*10`) while the shot left along `sin(pitch)`. Identical at 0; 26.6° vs 28.6° at 0.5.
  Same defect class as the mirrored scene, and invisible until you shoot at something above you.
- ⛔ **A BOT WITH NO LINE OF SIGHT HAD NO REASON TO COME.** `lastSeen` only exists once somebody has
  been SEEN, so hostiles fell through to `patrol` and walked **110 m in random directions** while
  the player stood in the street. A `push` state fixed it — correct for a sentry, wrong for a squad.
- ⚠ **THE DIFFICULTY KNOB IS AIM AND NOTHING ELSE** — the cone widens with range, with how recently
  the bot acquired you (~1.2 s settle) and with your own speed. Never dmg/rate/HP/armour, which is
  what keeps TTK arithmetically identical to the arena's. Measured: four operatives take a
  stationary player from 150 to down in **11.2 s**, first hit landing at **5.2 s**.
- ⚠ **THE VIEWMODEL HAD TO CLEAR `nearClip`, WHICH THIS GAME RAISED TO 0.4 m** (for depth precision
  against a kilometre far clip — the river was moiréing at 600 m). Held at the usual ~0.4 m its
  whole front half was sliced off and it read as a featureless slab. Held at 0.9 m and sized for
  that distance. **A viewmodel's position is decided by the projection, not by the fiction.**
- ⚠ **AN UNARMED OPERATIVE READS AS A BUG** (this repo's own rule, from the sword and the rifle).
  The gun hangs off the **`armF1` BONE**, so one implementation fits every archetype — and its
  offsets come from `S9Skin.BIND`, where the forearm is **21 px**: laying parts out to py 44 put two
  floating black boxes beside the operative's head. ⚠ It also had to stop being near-black; the
  vests are ~0.16 and the print pass posterises to ~6 steps, so a 0.085 weapon merged into the body
  and the fix for "looks unarmed" produced an operative who still looked unarmed.
- ⚠ **THE RETICLE SEPARATES BY HUE, NOT VALUE.** Measured: cream at 0.85 opacity, rendering
  correctly at frame centre, and genuinely unreadable over the sand street — the whole map is that
  value family. The accent is the one hue nothing in this city occupies. ⛔ Its gap is a gradient
  stop now; the first version cut it with a self-intersecting `clip-path`, which is legal CSS that
  rendered NOTHING while the HUD readout said `reticle=on`. **An attribute is not a pixel.**
- ⚠ **ON A PHONE, ON FOOT, IT IS TWO PADS** — left thumb moves, right thumb looks, `◉` holds the
  trigger. The one-pad flight scheme (auto-forward + drag to steer) is right for a bird that cannot
  stop and wrong for a body that can, must aim independently of where it walks, and has a trigger.
- ⚑ **A DEAD OPERATIVE DROPS A CARD**, which is the one line that keeps the firefight in the same
  game as the bird and the squirrel rather than a second game sharing a street.
- ⚑ **ONE COLLISION RESOLVE FOR EVERY BODY ON FOOT** — `moveBody()` was lifted out of `stepGround`
  and handed to `city-ops`. `stepGround`'s own comment said why: two copies drift, and the one that
  drifts is the one nobody is looking at. A bot sinking through a kerb the player steps over is that
  bug with an audience.
- ⚠ **WHAT THE CITY HAS IS SECTION 9's COMBAT, NOT SECTION 9's GAME** — no match clock, no arena
  picker, no loadout, no card powers, no powerups. The cabinet link stays for exactly that reason.
- ⚠ **FOUR PROBE MISTAKES REPORTED AS GAME BUGS**, every one the same shape: placing the player
  0.2 m above the bot's ground put the eye at 1.78 against a capsule topping out at 1.72, so every
  round went overhead and "damage does nothing"; firing ten sniper rounds without re-aiming at a bot
  that walks 4.5 m between shots measured my own leading, not the weapon; a synchronous `_step` loop
  gives an async `.skn` fetch no gap to resolve in, so "the bodies never load" was a statement about
  the probe; and letting `_seed` accumulate across five sections ended with 14 operatives against a
  cap of 4, i.e. measuring a crowd the probe had built itself.

### ⛔ DOGFIGHT RENDERED AN EMPTY SKY FOR TWO COMMITS — a dropped constant, and NOTHING said so
Artist sent a screenshot of the mode: pure clear colour, no city, no jet. `MODES.jet` carried
`camBack: 15 / camUp: 4.2` in `e19fa30`; `c17d1f7` rewrote the table into the
mortal/targetable/armed one and **did not carry them over**, while `stepJet` went on reading
`M.camBack`. `x - hx * undefined` is **NaN**, it propagates into `camPos` and then into
`cam.setPosition`, and **a camera at NaN draws nothing** — so the whole city was there the entire
time, behind a frame that was only the clear colour.
- ⚑ **IT SURVIVED BECAUSE THE PHYSICS WAS PERFECT.** Every driven measurement of the jet — cruise
  168 m/s, 360° in 8.9 s, the world-edge excursions at 1,745 / 1,918.8 — reads `__city.s`, which
  never looked at the camera. **The numbers all passed while the game showed nothing.** That is
  "a surface nobody looks at rots" with the surface being *the picture*.
- ⚑ **THREE GUARDS, because one would have been the wrong lesson.** (a) `MODES.jet` carries them
  again, and **only** the jet does — the bird and squirrel derive their chase distance per frame,
  so a constant there is dead data; (b) a non-finite `camPos` is caught at the write and snapped
  back to the aircraft, counted in `__city.s.camBad`, which a driven probe asserts is **0** in all
  four bodies; (c) `test:reach` pulls every `M.<prop>` read out of the source and requires the
  **bound entry** to define it.
- ⛔ **AND THE FIRST VERSION OF (c) PASSED ON THE BROKEN BUILD.** It collected key names from the
  WHOLE table, so `camBack` sitting on the ANIMAL entry satisfied a read of `MODES.jet.camBack`.
  Caught only by reverting the fix and watching it stay green. ⚠ **The dead data I had added "for
  completeness" is what defeated the check** — completeness in a table that only one consumer reads
  is not tidiness, it is noise that can absorb a real failure.
- ⛔ **`npm run test:reach` NOW PARSES EVERY SHIPPED BROWSER SCRIPT (§0), because it scored 121/121
  on a `city-app.js` that did not compile.** Every other check in that file is a text match, so a
  `SyntaxError` is invisible to all of them — the page serves, nothing 404s, and the game is simply
  absent. `new Function` compiles without executing, which is exactly the question. ⚠ Scoped to
  browser scripts: `api/*.js` are Vercel ESM handlers that `new Function` cannot parse by
  definition, and flagging them was the check being wrong rather than the files.
- ⚠ **The legend fell through to the animal one**, so DOGFIGHT advertised "flap · dive · animal ·
  drop" over an aircraft. Read off `stepJet` instead: W throttles and pulls, S backs off, A/D bank
  (there is no rudder), SHIFT is the airbrake.

### ✅ CARS — `js/city-rides.js` (artist, 2026-08-04: *"lets make some land vehicles we can hop in and drive"*)
Parked on the street grid the generator already draws; **E** gets in and **E** gets out; the chase
camera banks with the body.
- ⚑ **A CAR IS THE MISSING MIDDLE.** The bird sees the whole map and cannot touch it, the squirrel
  touches everything and cannot cover ground, the operative covers it at 6.4 m/s. A car does 30 m/s
  along the streets — which is the one thing that makes the STREET GRID legible. You learn a city
  by driving it.
- ⛔ **DRIVING REPLACES THE BODY'S STEP, NOT THE MODE.** Making it a fourth mode would have put a
  loophole in the observer rule shaped like a car door. Driven: a squirrel drives, `targetable`
  stays **false** and it never enters a target list. The bird and the jet are REFUSED rather than
  half-supported — "it sort of works if you land first" is the kind of almost-rule that becomes a
  bug report.
- ⛔ **STEERING IS A RATE THAT NEEDS ROAD SPEED**, and that single property is most of what
  separates a car from a character controller wearing one. Asserted: `spunWhileParked` **0.000 rad**
  over two seconds of full lock at rest. Grip is finite rather than absolute, so the back steps out
  under power and the handbrake just lowers the number — the slide is the same line, not a mode.
- ⛔ **A HEIGHT TEST ALONE PARKS CARS ON THE RIVER.** The street grid runs straight across it and
  the water's surface slab answers `groundBelow` at street level, so the first build had cars
  floating mid-channel — **found by looking at the frame, not by any number**. `CityWorld.inRiver`
  is the generator's own function, so the check agrees with the geometry by construction; both ends
  of a 4 m body are tested or one straddling the bank is still half in.
- ⚠ **THE WEAPON GOES AWAY AT THE WHEEL.** The chase camera was correct and the rifle was still
  hanging in front of it. `armed` gates the viewmodel and the trigger together, and both are wrong
  while driving — a drive-by is a feature, not a side effect of forgetting to ask.

### ✅ SECTION 9's CONTROLS, NOT A SUBSET OF THEM (artist, 2026-08-04)
*"port over the guns and controls from other game."* The weapon TABLE was already asserted
identical; the SCHEME was not, and the two bindings it was missing are exactly the two that change
how the weapon BEHAVES rather than how it looks.
- ⛔ **RMB AIMS, AND AIMING TIGHTENS THE CONE.** One value — `me.ads` — drives the viewmodel pose,
  the field of view and the accuracy, so the sight picture and the group can never disagree. Without
  the cone term the right button is a zoom lens rather than a weapon state. Measured: COLD CALL
  (zoom 2.7) pulls fov **62 → 23**, which is 62/2.7 to the decimal, and returns on release; FULL
  TILT (zoom 1) brings the weapon up without magnifying. ⚠ SCATTER is exempt — a shotgun's spread
  IS the weapon, not the aim. ⚠ `contextmenu` must be suppressed or the browser eats the press.
- ⛔ **CROUCH IS A STATE, NOT A CAMERA OFFSET.** CTRL lowers the eye, slows the walk and steadies
  the aim, which is why anyone crouches. Measured: eye drops **0.55 m** and creeping covers 5.4 m
  where walking covers 12.2. The eye follows as a spring — a camera that teleports down 40 cm reads
  as a glitch.
- ⚠ **A PATCH SCRIPT THAT DIES BEFORE ITS WRITE ROLLS BACK EVERY EDIT BEFORE IT**, and the "ok"
  lines it already printed are only STAGED. Two edits were lost that way and the failure surfaced
  three steps later as `ReferenceError: adsDown is not defined`. Writing at the end is the safe
  design; treating the progress output as proof of application is the mistake.

### ⛔ THE SQUIRREL COULD NOT CLIMB AT ALL — the CEILING clamp, not the ledge · `npm run test:city`
*Artist, 2026-08-05: "the squirell gets stuck on wall ledges and that shouldn't happen."*
- ⛔ **`moveBody`'s ceiling clamp FIRED ON THE WALL BEING CLIMBED.** A climbing squirrel is pressed
  INTO its wall by construction — `wallAt` reaches `r + 0.22`, so the body's footprint overlaps the
  box and its head at `y + h` is **inside** it. `if (b.vy > 0 && hits(nx, ny + B.h, nz, …))` then
  reset `ny` to where it started, every frame, forever. Measured: `vy` set to **+5.58** every tick
  and **y constant at 0.99 for all 420 ticks**, `onGround` false, nothing thrown.
- ⚑ **THE GIVE-AWAY IS `onGround:false` ON A BODY THAT IS NEITHER RISING NOR FALLING.** That rules
  gravity out — it is not being skipped, the climb is being CANCELLED after the fact. It looks like
  a floor bug and it is a ceiling bug, and it reads to a player as being glued to the wall.
- ⚠ **I SHIPPED THE WRONG DIAGNOSIS FIRST.** I read the lip as a limit cycle (crest ⇒ `wallAt`
  stops matching ⇒ fall ⇒ re-reach) and fixed *that* — replacing a decaying nudge with a real
  mantle, which is a genuine improvement and is now exercised. But it was never the reported bug,
  and I committed it saying so: *"reasoned from the code, not driven."* **The honest label was
  right and the fix was still not the cause.** Only the driven probe found the real one.
- ⛔ **AND THE HARNESS LIED TWICE ON THE WAY THERE, both in the reassuring direction.** (a) A
  synthetic `KeyboardEvent` dispatched from inside the page moved the body **0 m** while gravity
  and the ground resolve both worked — an input-path artefact that reads exactly like broken
  physics. `page.keyboard.down` (a TRUSTED event) is the only reliable drive. (b) rAF frame
  counting is useless here: the baseline bird measured **6–8 real frames in 10.5 s**, so every
  wall-clock movement test reports 0. `__city._step(n, dt)` is the clock.
- ✅ **`__city._collide` and `._me` are exposed now** so a harness can ask the world the same
  questions the physics asks instead of inferring them from where a body stopped. One call
  (`hits` at the frozen position) settled what several rounds of reasoning had not.
- ✅ **`npm run test:city` (12)** — the first driven suite this game has had. `test:reach` parses
  these files and asserts the handlers exist, and **all of that was true the whole time**: a text
  match cannot see a body that does not move. Proved to bite by deleting the `!climbing` guard:
  3 failures, y pinned at 0.99. Also guards the pouch bound, the drop's HUD report, and that the
  pointer-lock prompt shows in SECTION 9 **and not in the modes that do not use the mouse** —
  both directions, because "shown in operative" is trivially satisfied by showing it always.
  ⚠ One assertion was mis-timed, not mis-designed: `#carry` is written inside `stepDrops`, i.e.
  once per frame, so reading it in the same tick as `_act()` measures the frame BEFORE the press.

### ✅ OTHER PEOPLE ARE IN THE CITY — `js/city-net.js`, `npm run test:citynet` (10)
*Artist, 2026-08-05: "for city we need to wire in mmorpg dynamics for multiplayer for people in
game."* Two real pages, two identities, each with the other's body in their world.
- ⚑ **TWO LAYERS, BECAUSE THEY ANSWER TWO QUESTIONS, and the split is the game's own design.**
  `/api/presence` is DISCOVERY — a heartbeat with a 20 s TTL, so it can say *who* is in the city
  and roughly where, and can never animate anyone. WebRTC data channels over `/api/signal` are
  MOTION — ~9 Hz, peer to peer, no game server. ⚑ **That is the bird's own asymmetry, as netcode:**
  `CITY-GAME.md` says the bird SCOUTS — sees the whole map, touches none of it — and the roster is
  exactly that. Getting close enough to watch somebody move is the part you fly over and earn.
- ⛔ **ONLY THE LOWER ID OFFERS, AND WITHOUT IT NOTHING EVER CONNECTS.** Both sides see each other
  on the same roster tick, so both created an offer, each then received one while already in
  `have-local-offer`, and `setRemoteDescription` rejected on both. **Measured: roster 1 and peers
  0 on each of two live tabs, with no error anywhere.** `js/df-net.js` states the tie-break in its
  own header — *"in each pair the lower id makes the offer"* — and I did not carry it over. **A
  rule recorded in the file you are copying FROM is not a rule you have applied.**
- ⛔ **ANIMALS ONLY, ON PURPOSE.** DOGFIGHT and SECTION 9 are matches with shooter-authoritative
  netcode; a persistent world and a scored match are different contracts, and merging them would
  put a loophole in the observer rule shaped like a jet. Switching to a combat mode leaves the
  shared world — `body:null` is how the wire says so, and a peer with no body is not drawn.
- ⚑ **`buildBird()` IS A FACTORY NOW**, for the reason `buildSquirrel` already had written down: a
  second caller exists, and two bird definitions would drift. ⚠ **TDZ, FOURTH SIGHTING** — the
  extraction renamed `bird.` to `ent.` and missed three `bodyPart(bird, …)` ARGUMENTS, so the
  const was read above its own declaration and the whole app died at module scope. `__city` simply
  never appears; the probe reports "not ready", not "broken bird".
- ⚠ **THE NAME TAG NEEDS A DEPTH TEST.** `worldToScreen` returns a point for geometry BEHIND the
  camera too, so ignoring `z <= 0` pins every peer you have flown past to the top of the screen,
  mirrored, permanently. And it is projected from the MIRRORED space the camera lives in while the
  body is placed in the unmirrored one — one space for bodies, the flip on the camera only.
- ⚠ **`test:citynet` runs `/api/presence` and `/api/signal` IN MEMORY** to the same protocol the
  Vercel handlers speak, so it needs no network and no keys. Proved to bite by deleting the
  tie-break: 2 peers → 0. ⚑ **"A peer exists" is the weak question** — a stale first packet
  satisfies it forever; the assertion that discriminates is that BRAVO walks 60 m and ALPHA reads
  10 → 70.
- ⚠ **NOT BUILT: interaction.** You can see each other and where each other is. Trading, stealing
  across the wire, and shared drops are the next step — the mesh is capped at 6 peers nearest-first
  because a full P2P mesh is O(n²) with nothing to relay through.

⚠ **STILL OPEN and the artist's:** how a photographed card is marked so it never passes as one of
his, whether the animals share one city, whether anyone else is in it, and whether time of day
moves.
⚠ **NOT BUILT YET:** the quadruped rig (the 11-bone skeleton is a BIPED — biggest new piece), photo
mode, found cards in the world, and **JET COMBAT** (bolts, lock, bots, re-derived at city scale) —
the last thing standing between the two old cabinets and retirement.
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

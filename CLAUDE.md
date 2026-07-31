# upperdeckripmaster3030 — project memory

> ⚠ **THIS FILE IS IN A PUBLICLY DEPLOYED REPO.** It was served at `/CLAUDE.md` (HTTP 200)
> until `.vercelignore` was added. Write it as if a stranger will read it, because one could:
> **no legal reasoning, no named third parties, no credentials or pointers to where credentials
> live, no unannounced commercial decisions.** Operational facts only. Anything sensitive goes
> to the artist directly, not into the repo.

*Read this first. It's the durable context for the $UR3030 launch. Canonical detail
lives in `docs/ECONOMIC-FLOW.md`; this file is the map.*

## What it is
A **card and game studio** whose token has staking functionality. Artist: **Gianni Arone
(lovebeing / @_lovebeing_)**, SuperRare **Liquid Editions — Cohort 01**.

## ⛔ RENAME IN PROGRESS — read before touching the token, the domain, or any copy
**Artist directive. Rationale is deliberately not recorded in this file — ask the artist.
This SUPERSEDES the old "NAME LAW".**

- **Ticker / `symbol()`: `3030`** (written `$3030`). Confirmed by the artist. Like `name()`,
  `symbol()` is baked in at deploy — hand SuperRare `3030`, not `RMS3030`, not `$3030`.
- ✅ **Name: `ripmaster3030studios`** — ONE word, lowercase, 3030 in the MIDDLE. Confirmed by
  the artist after being asked to disambiguate: it matches the domain `ripmaster3030studios.com`.
  ⚠ It is NOT `ripmasterstudios3030` (3030 on the end) — that ordering was written once in
  passing and explicitly rejected. `name()` is **baked in at deploy and unfixable**; this project
  already owns a token permanently stuck with a wrong name for exactly this class of slip
  (Sepolia's edition reads `"Upperdeck Ripmaster 3030"`, title case). Hand this exact string to
  SuperRare in writing and re-read `name()` before they broadcast. See task #70.
- **Host: `ripmaster3030studios.com`**; `upperdeckripmaster3030.com` gets ported or redirected.
- **SuperRare has confirmed** that `upperdeckripmaster3030` references may REMAIN on the new
  site. The change is about the TOKEN and the studio identity, not a scrub of the joke — the
  artist is designing ripmaster3030studios assets to sit alongside it.
- ⚠ The old rule ("upperdeckripmaster3030 — one word, lowercase, EVERYWHERE, and the launch
  token MUST carry it") is **DEAD**. Anything still asserting it is stale; treat it as a bug.

*Historical note, still true and still the reason the joke works:* **upperdeckripmaster3030** is
one word on purpose — it amplifies the meme and the clearance joke. It stays as flavour.

## ⚠ TOKENOMICS BEING REBUILT — supply 3,030,000 → 33,000,000
**Artist directive: ripmaster3030studios is an indie game company with a live 33,000,000 supply.**
Model v2.2 below is stale wherever it says 3,030,000.

⛔ **The deflation story does NOT survive the supply change on its own.** Reran
`scripts/token-model.mjs` at CAP 33,000,000 with the pack schedule untouched:

| | old (3.03M cap) | new (33M cap), same packs |
| --- | --- | --- |
| four-season sellout burn | 2,028,750 | 2,028,750 (unchanged — packs burn tokens, not %) |
| as % of mint | 67% | **6.1%** |
| settled float | ~1.01M | **~30.97M** |
| permanent contraction | **3.0×** | **1.07× — i.e. essentially none** |

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
- **$UR3030** — one ERC-20 SuperRare Liquid Edition, **mint-once**, cap **3,030,000**, opens
  ~1 RARE/token; **burns permanent**; deflates **~3× → ~1.01M floor**, driven only by packs.
- **Every card is a LENS** = a render keyed by card id on **one combined renderer + ERC-721
  lens contract**. **ERC-721 only — ERC-1155 is nixed.**
- **Deck = 100 cards:** **33 hero 1/1s** minted (11 gacha pack-claims + 22 earned Season-1
  game titles) + **67 render-only field lenses** (mint later) + **Lovebeing**, a
  **holder-bound lens** (one per wallet, non-transferable, non-burnable). The 33 are a
  **Season-1 genesis set** that persists all seasons.
- **Packs:** ~$7 escalating buy-and-burn, ~3,560 over 4 seasons (S1 1,600 → S4 260).
- **Games:** wager **$UR3030 + cards** into a pot; a **small ~10% rake burns** (deflationary,
  real on-chain via `js/wager-payout.js`), the rest + cards pay the **podium 1st/2nd/3rd
  (50/30/20), 1st the most** (1v1 = winner-take-pot). Cards transfer, never burned in-game.
  Real token-pot escrow/payout = **Phase-2 721-lens contract**; today the rake burn + card
  moves are the real part. Card→power is live (`js/card-powers.js`).
- **Cards never retire/ash.** Scarcity = dwindling packs + community rarity vote + compression.

## Render contract (see `docs/RENDER-CONTRACT.md`)
- SuperRare pattern: `tokenURI()` = edition passthrough; `tokenURI(uint256 id)` = per-lens.
  First-party template **`LiquidLensMintable721SVGExample.sol`** = exactly our combined
  renderer+721. `contracts/UR3030RenderPrototype.sol` IS the passthrough renderer (done).
  ✅ **BUILT: `contracts/UR3030Lens721.sol`** — render-by-id + ERC-721 + EIP-712 voucher
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

## Staking = the lens reads your balance (SuperRare's own documented input)
SuperRare's *Introduction to Liquid Editions* says Liquid Lenses "can use that state as creative
input" and names the inputs: **token price, trading activity, and HOLDER BALANCES**. That last one
is the staking mechanism — no staking contract, no emissions, nothing to drain.

- `UR3030RenderPrototype.sol` already reads `getMarketState()` and derives burn from
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
  rare liquid-edition deploy multicurve "ripmaster3030studios" "3030" \
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

## Deploying the lens — see `docs/DEPLOY-LENS.md`
- **Route A (recommended): Remix.** `npm run flatten` → `contracts/build/UR3030Lens721.flat.sol`
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

## Site state
- **Pre-launch admin gate** is ON (`gate.js`, injected in every page's `<head>` + the
  `build-pages.mjs` shell). Fail-closed. It is a **soft veil only** — the check runs client
  side, so treat it as a curtain, not a lock. Use Vercel Deployment Protection for anything
  that actually must not be reached.
- Landing has: marquee + torches, countdown to Aug 6, and a **"What is this?" facts panel**
  (informative, not corporate).
- Public pages `whitepaper/tokenomics/audit/artist` are **generated** by
  `scripts/build-pages.mjs` — edit the source + regenerate, don't edit the HTML directly.
  PDF deck via `scripts/build-whitepaper.mjs`.

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
  (`UR3030.balanceOf ≥ holderMin`), **B** collector (`lens721.balanceOf ≥ 1`), **C** visitor
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
  **M1 IN:** sky+sun shader, GPU ground grid (camera-relative, so the toroidal seam never
  shows), props, ships, bolts, bursts, GfxPost. **M1 OUT / known:** bolt ribbons are
  axis-aligned rather than camera-facing; own-craft placement in chase view needs work; gates
  and rings not drawn yet; no shadows or reflections.
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
- ⚑ **Only THREE of the six .skn ship in Section 9 — and it is a QUALITY call, not just a byte
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
  shoulder). **Fix, if the ronin family is wanted back: fit the bind skeleton to the mesh's own
  shoulder line instead of to its bounding box.** Details + numbers in `models/README.md`.
- ⚑ **Cross-limb stitch (`S9Skin`, at load).** Separate, smaller defect that survives on the good
  family: `bake-fighter`'s side test has a tolerance band at the centreline, so near the floor a
  few triangles get corners bound **rigidly to opposite shins** — a spike between the ankles under
  a stride. Repaired PER TRIANGLE (each corner is individually fine; the combination is not): the
  minority corner adopts the majority corner's bones. 113/4604 tris on kappa, 85/4217 on prizm →
  worst stretch 21.2×→6.0× and 9.0×→6.7×. Stride amplitude is also a quality knob, not just a
  look one — run swing 0.95→0.72 rad roughly halves the stretched-triangle count.
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
- **Headless verify:** node http server + playwright-core at
  `/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js`, chromium
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `--no-sandbox` (WebGL adds
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`).
- **NFA always** — experimental art token, can go to zero; keep the disclaimers loud.

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

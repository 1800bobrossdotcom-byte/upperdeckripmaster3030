# Launch Architecture — a pure Liquid Edition

**The decision (settled 2026-07-19):** upperdeckripmaster3030 ships as **one SuperRare
Liquid Edition and nothing else** — we are not at liberty to deploy other contracts.
This doc is the authoritative description of what that means and how the whole game
maps onto the format. It supersedes the contract-based design in
`docs/CARD-ECONOMY-SPEC.md`, which is retained as a **Phase 2 reference design**.

## 1. What the format actually is (from SuperRare's Cohort 01 docs)

> *"A Liquid Edition is an **ERC-20 artwork** with a live onchain market. The token is
> not separate from the art. It is the collecting layer for a dynamic work."*
> — Liquid Editions Overview, Cohort 01

The permitted surfaces, per the Overview + Technical CLI Guide:

| Layer | Standard | Notes |
|---|---|---|
| **The edition** — `$UR3030` | **ERC-20** | Uniswap-v4 + Doppler multicurve, reserve in RARE. One token. This *is* the artwork's collecting layer. |
| **The render contract** | view logic | *"You will likely be deploying a custom renderer."* Read-only `tokenURI()` metadata that reads **price, supply, liquidity, burn progress, balances** at fetch time. |
| **Companion 721 Lens Collection** | **ERC-721** | Optional; *"assisted setup"* with SuperRare. *"Each NFT is a different 'lens' over the same market."* |

What is **not** in scope at launch: any custom game/economy contract (the CardVault
ERC-1155 — tolls, on-chain votes, wagers, on-chain pack mints). Cards are **not**
individual ERC-20s either — 196 tokens would be 196 separate editions, not the format.

The Overview's own list of what an edition may respond to — *"total supply, **burn
progress**, price, liquidity, market activity, time, **collector balances, holding
thresholds, artist-defined phases**, custom onchain mechanics"* — is the toolbox the
whole game is rebuilt from.

## 2. The game, restated in pure-LE primitives

**The deck is the artwork of the ONE edition.** All 196 cards (+ the 1/1 marquee) are
states of the render, not separate assets.

### 2.1 The burn-down → burn milestones (`scripts/burn-milestones.mjs`)

> **MINT-ONCE (per SuperRare audit 2026-07).** The whole supply mints into the pool once
> at launch; **burned tokens do NOT re-mint**. Every burn is permanent, so cumulative
> lifetime burn is **bounded by the cap** and supply only falls — the burn-down is a
> one-way ratchet from the 3,030,000 mint toward the ~1,009,975 survivor floor.

The community burns the field down **by burning the token** — the format's first-class
mechanic. A **published retirement queue** (weakest first: by rarity tier, then
ascending trait-score, deterministic tie-breaks) is fixed at season open in
`cards/data/_milestones.json`. Every time **cumulative witnessed burn** crosses the
next milestone, the next queued card retires — permanently grayed to ash in the render.

- **Escalator (mint-once):** retirement *k* costs `7,975 + 150·k` more burn than the
  last. First card falls at **~8,125** burned (~23 packs at the S1 base); clearing all
  **119** permanently burns **2,020,025** — the whole-field retirement, **66.7% (⅔) of
  the 3,030,000 mint**, spread across a **multi-season arc** (not one season). It leaves a
  **~1,009,975** live float — a **3× permanent contraction** — and fits under the cap. The
  deck only reaches **77 survivors** if the community truly burns across the seasons.
- **Survivors:** the strongest 77 (15 uncommon / 40 rare / 17 mythic / 5 prizm).
  The **1/1 marquee (Lovebeing) is indestructible** and outside the queue.
- **Burn measure:** the render reads the protocol's canonical burn metric.
  **Verify the exact getter in the liquid-editions-starter-kit examples** (burn
  progress is a first-class render input per the docs). Fallback if no cumulative
  getter exists: a checkpoint ratchet in the render contract (a stored high-water
  mark anyone can poke after burns — still view-logic + one tiny setter, no game state).

### 2.2 Packs → guided buy + burn (~$7, escalating)

A "rip" is the site walking you through **buy ~350 `$UR3030` on the curve, then
`burn()` it** (both native ILiquid operations). Your 7 pulls derive deterministically
from your burn tx hash; your collection = your on-chain rip history + balance,
rendered by the site. The **$7 → escalating pack schedule** (base→ceil within a
season, dwindling allotment across seasons, `scripts/token-model.mjs` §4) survives
intact as a **site-enforced schedule** — the site prices each rip off packs-ripped-
so-far, all of it auditable from the burn txs themselves.

- Every pack now burns **in full** (no house-pool cut — that was a contract mechanic).
- Buying without burning is just… collecting the edition. Packs are the ritual, not a gate.

### 2.3 Holding thresholds → the collection experience

*"Does holding more change the experience?"* — yes, natively: the render and site read
balances. Holding pack-scale amounts unlocks binder/arena views; whale-scale holdings
can unlock marquee states. No contract needed.

### 2.4 Season end → the ownership layer (four kinds of lens)

During a season, "cards" are shared render-states; "owning" a card is a **rip-claim**
tracked from your burn txs (site-layer at launch — there is no card token). At season
end the Companion 721 Lens Collection (assisted setup) is where ownership becomes real,
resolved on **two independent axes**: *survived?* (beat the milestones) and *cornered?*
(does one wallet hold a card's **entire** claim set).

A **1/1 means one owner, one object** — so a card is a 1/1 **only** when cornered.
Survival does not make a 1/1; a survivor held by many is held by many.

- **Deck lenses — the 77 survivors (the playable deck).** Each surviving card mints as a
  **collectible lens edition sized to its surviving holders** — you own your serial
  (e.g. *Moon Cat #3 / 8*). These are **buy / sell / trade** on the marketplace and are
  the cards you actually play. A survivor only two wallets held becomes a **2-edition**
  lens; one forty wallets held, a 40-edition — **scarcity is emergent, by provenance,
  not decree.** (Edition sizes finalized in assisted setup; claim-tracking is site-layer
  until the mint.)
- **1/1 lenses — the Compression rite (any fully-cornered card).** Hold **100%** of a
  card — survivor *or* retired — and you may **compress**: burn a compression cost in
  `$UR3030` and collapse every claim into a **single 1/1 lens**, pulled out of
  circulation (its deck edition ceases). Cornering a *survivor* into a 1/1 is the apex
  flex; cornering a *retired* card **rescues it from ash**.
- **Ash + Ash-Trophy lenses.** Retired cards **no one corners stay ash** (gone for good).
  Whoever's burn crossed each milestone (the "final blow") is offered a soulbound
  **Ash-Trophy lens** — the reward is art, not a token payout.
- **The marquee — *Lovebeing*** — always the sealed **1/1**.

**The honest end state:** they do **not** all become 1/1s. Every survivor lives on as a
tradeable **deck edition**; every *fully-cornered* card (survivor or retired) can be
pulled to a **1/1**; the uncornered dead stay **ash**. The dream — "the whole 196 live
on" — is a *reachable* outcome (corner and compress enough of them), not an automatic one.

### 2.4a Provenance & stats compound across seasons

Cards that survive into later seasons carry their record, and the render reads it:
**seasons survived, cumulative burn withstood, holder count, final-blow trophies.** Two
native effects (the render already reads live + historical state — no new contract):

- **Provenance** — a multi-season survivor shows its history on the lens; a card that
  outlived three culls is visibly older and rarer than a first-season pull.
- **Stats** — a card's **ATK / DEF / trigger harden with longevity**, so a battle-tested
  survivor out-plays a fresh one.

The deck becomes a **living pedigree**: the longer a card lasts, the more it's worth — in
scarcity, in story, and in play. This is also the incentive to *not* just corner-and-1/1
everything: a card left in the living deck keeps accruing provenance; a compressed 1/1
freezes it forever at that moment. Two different kinds of value, by design.

### 2.5 Court, arena, binder → site-layer (honest about it)

Rarity-court voting, wagers, and trades have **no on-chain contract at launch**. They
run site-side (localStorage today; signed-message votes later), and they **influence
the next season's** published queue and field. The one hard on-chain action is the
burn — real, irreversible, and the only thing the render trusts. All public copy must
say this plainly: *votes are community signal; burns are consensus.*

### 2.6 Wallet & how users interact (where the wallet lives)

Three surfaces, and **wallet-connect + signing happen at exactly one of them — the
top-level page — never inside an embedded card iframe.** The iframe is the painting;
the wallet lives in the gallery around it.

1. **The render / lens (the card art) — read-only, NO wallet.** The card page is the
   artwork the render contract points to (`tokenURI` → `animation_url`). Wherever it's
   embedded — SuperRare's edition page, a marketplace, our own homepage zoom — it's a
   sandboxed iframe with no injected provider and no reason to ask for one; it only
   **reads** public chain state over RPC to render live. This is why our card pages
   already no-op their interactive/wallet bits when framed (`window.self !== window.top`)
   and render display-only. **Never** trigger a wallet prompt from inside the lens.
2. **SuperRare.com — native buy/sell, their wallet UI.** Because `$UR3030` is a standard
   ERC-20 Liquid Edition, SuperRare surfaces it on the artist's profile with *their own*
   connect-wallet + trade UI (backed by the Uniswap-v4 pool). Anyone can buy/sell the
   token there with zero code from us — the "collect the edition" path.
3. **Our custom front end (upperdeckripmaster3030.com) — the game actions, our wallet.**
   The game-specific moves aren't native SuperRare buttons, so they live on our
   **top-level** site, where we connect a wallet (injected **EIP-1193 / MetaMask** on
   desktop, **WalletConnect** for mobile), on the right chain, and send the txs:
   - **rip a pack** = buy ~350 `$UR3030` on the pool → `burn()` it (two txs, or one via a
     small router/helper the *user* calls — still just the token + pool, no game contract);
   - **voluntary/conviction burns** toward the milestone queue;
   - **season-end compression** (a burn) — all from the top window.

**Sepolia dress rehearsal** exercises exactly this: deploy the edition via the Rare CLI
on Sepolia, wire the render, connect a test wallet to Sepolia on our site, and run
rip (buy+burn) → milestone crossings → a compression. See §4.

## 3. What dies, what survives

| Phase-2 contract mechanic | Launch replacement |
|---|---|
| ERC-1155 card copies (in-season) | render-states of the one edition + your rip-claims (site-layer) |
| ERC-1155 editions (at season end) | **deck lenses** — each survivor an ERC-721 lens edition sized to its holders (the tradeable playable deck) |
| `ripPack()` mint + toll | guided buy + `burn()` (~350; full burn) |
| Send/trade/wager tolls | site-side play; no toll (nothing to toll) |
| On-chain rarity court | site-side votes → next-season queue |
| `destroyEdition` / corner | burn milestones (collective cull) + the **Compression rite** (corner ANY card's full claim set → burn → a 1/1 lens; else survivors stay editioned deck lenses, uncornered retirees stay ash) |
| House reward pool + bounty | Ash-Trophy lenses at season end |
| Creator cut (upvote → artist) | the artist's position in / around the edition (cohort terms) |
| Ash Trophy ERC-1155 ids | trophy lenses in the 721 collection |

**Economics that remain true:** the curve math in `docs/TOKEN-MATH.md` §1–§5 is
unchanged (it always described the ERC-20). Burn pressure now comes from pack burns
(full ~350/rip) + voluntary burns; the allotment/escalation schedule is site-enforced.
"No treasury, no team pre-mint, no fee wallet" stays true and is now trivially
verifiable — there is no other contract to hide one in.

## 4. Pre-mainnet verification (updated)

1. **★ Burn metric** — find the canonical cumulative-burn read in the starter kit
   (`src/examples`); confirm the render can read it in `tokenURI()`.
2. **Burn semantics — SETTLED: mint-once (SuperRare audit 2026-07).** Burns are
   **permanent** — they do **not** reopen mint headroom on the curve. The milestone
   escalator assumes cumulative burn is **bounded by the cap**: the full 119-card
   burn-down is **2,020,025** (⅔ of the mint), settling at a **~1,009,975** float. Still
   confirm the exact cumulative-burn getter the render reads (item 1).
3. **Effective M / sell-fraction** — `--preview`, as before (`docs/TOKEN-MATH.md` §8).
4. **Lens path** — confirm assisted-setup scope with SuperRare (@im_jonooo): survivor
   lenses at season end, trophy lenses, the sealed 1/1.
5. **Sepolia dress rehearsal** — deploy multicurve, wire the render, run a full mock
   season: rips (buy+burn), milestone crossings, retirement renders, threshold states.

## 5. Phase 2 (the vault, if ever permitted)

`contracts/CardVault.sol` + `docs/CARD-ECONOMY-SPEC.md` remain in the repo as a
**reference design** — reviewed, compiling, and honest about being undeployed. If the
cohort later allows a companion game contract, that design picks up where this leaves
off. Until then, nothing public may describe its mechanics as live.

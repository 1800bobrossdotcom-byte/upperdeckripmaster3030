# Launch Architecture — a pure Liquid Edition

**The decision (settled 2026-07-19):** Upperdeck Ripmaster 3030 ships as **one SuperRare
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

The community burns the field down **by burning the token** — the format's first-class
mechanic. A **published retirement queue** (weakest first: by rarity tier, then
ascending trait-score, deterministic tie-breaks) is fixed at season open in
`cards/data/_milestones.json`. Every time **cumulative witnessed burn** crosses the
next milestone, the next queued card retires — permanently grayed to ash in the render.

- **Escalator:** retirement *k* costs `15,000 + 360·k` more burn than the last.
  First card falls at **15,360** burned (~44 packs); clearing all **119** takes
  **4,355,400** — almost exactly a **sold-out season of packs** (~10,000 rips ≈ 4.37M).
  The deck only reaches **77 survivors** if the season truly burns.
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

### 2.4 The Companion 721 Lens Collection → every card can end as a 1/1

Via SuperRare's **assisted setup**, at the right moments:

- **The 1/1 marquee — *Lovebeing*** — its own lens over the market (sealed, released later).
- **Season end — the survivors:** the **77 survivors** mint as **1/1 lenses** — each
  rendering the shared market through one card's art. The standard deck becomes a
  real, ownable set.
- **Season end — the Compression rite:** every *retired* card faces a choice. The
  collector who holds its **full claim set** (all rip-claims of that card, tracked
  from the season's burn txs — "cornering the edition," site-layer) may either
  **let it stand as ash**, or **compress it**: burn a compression cost in `$UR3030`
  and the card is reborn as a **1/1 lens** — retired from the deck, alive as a
  collectible. Uncompressed retirees stay pure ash.
- **Ash Trophies:** the site records which address's burn tx crossed each milestone
  (the "final blow"); at season end those keepers are offered trophy lenses. The
  emotional reward survives — as art, not as a contract payout.

**The end state:** potentially the **entire original 196** lives on as 1/1
collectible cards — 77 survivor lenses + up to 119 compressed 1/1s — a permanent
museum of the field that no longer exists. Nothing is deleted; everything is either
a survivor, a reborn 1/1, or ash with a name on it.

### 2.5 Court, arena, binder → site-layer (honest about it)

Rarity-court voting, wagers, and trades have **no on-chain contract at launch**. They
run site-side (localStorage today; signed-message votes later), and they **influence
the next season's** published queue and field. The one hard on-chain action is the
burn — real, irreversible, and the only thing the render trusts. All public copy must
say this plainly: *votes are community signal; burns are consensus.*

## 3. What dies, what survives

| Phase-2 contract mechanic | Launch replacement |
|---|---|
| ERC-1155 card copies | render-states of the one edition + rip history |
| `ripPack()` mint + toll | guided buy + `burn()` (~350; full burn) |
| Send/trade/wager tolls | site-side play; no toll (nothing to toll) |
| On-chain rarity court | site-side votes → next-season queue |
| `destroyEdition` / corner | burn milestones + the **Compression rite** (corner a retired card's claim set → burn to compress it into a 1/1 lens, or let it stand as ash) |
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
2. **Burn semantics** — does burning reopen mint headroom on the curve (re-mint into
   the gap)? The milestone escalator assumes cumulative burn is unbounded.
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

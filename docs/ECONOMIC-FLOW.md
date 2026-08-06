# $3030 — the economic flow (canonical)

> ## ⚠ CANONICAL FOR STRUCTURE — **NOT** FOR THE PACK PRICE OR THE CAP (updated 2026-08-06)
> **Pack price: `docs/PACK-PRICING.md`. Live numbers: `npm run model`. Cap: 3,300,000.**
>
> ⛔ This file is pointed at from CLAUDE.md as *the* canonical narrative, so a stale figure here
> propagates further than one anywhere else. Two had gone stale, **a generation apart**:
> - the pack was written as **~350 tok (~$7) → ~1,200 tok (~$24)**. Dead: the open is a MEASURED
>   ~$0.08, which makes 350 tokens a **$28** pack. Packs are a **dollar target** —
>   **$10 / $12 / $15 / $20** — with the token count re-derived at each tier open and then locked.
> - §5 measured the contraction **against a 33,000,000 cap**. That direction was REVERSED on
>   2026-08-02; the cap is **3,300,000**.
>
> ⚑ Both are fixed in place below. The lesson is the label: **"canonical" is a claim about
> STRUCTURE — which contract does what, what is atomic, what burns — and it does not extend to
> the NUMBERS, which move.** A doc that is canonical about everything is a doc nobody dares
> correct, and this one had gone two decisions stale while carrying the word at the top.

*How the token, the packs, the lenses, the games, and the burn fit together.
**Model v2.2 — the handmade 100-card deck.** Decisions locked with the artist are
marked ✅; items still needing SuperRare are marked ⏳.*

---

## 1 · The one primitive — `$3030` (ERC-20, mint-once)

A single SuperRare Liquid Edition. **Minted once** into the AMM pool (Uniswap v4 +
Doppler, reserve in RARE) at launch. **Burns are permanent — nothing re-mints.** No
treasury, no team unlock, no fee wallet. `$3030` is the only fungible token; it is
both the **currency** and the **burn meter** (`burnProgress = maxTotalSupply −
totalSupply`).

- Cap **3,030,000** · opening **≈ 1 RARE/token (~$0.02)** ⏳ (curve calibration — see `CURVE-TARGET.md`)

## 2 · Every card is a LENS — the render, not the token ✅

A **lens** is a *render*: art whose `tokenURI` reads `$3030`'s live market + burn,
so the card evolves with price and with the fire. **Lenses are ERC-721** (per the
Cohort-01 docs: *"Companion 721 Lens Collections… supported through an assisted
setup"*; CLI: *"a combined renderer plus **ERC721** contract where each NFT is a
different lens"*). **There is no ERC-1155 anywhere.**

The load-bearing idea: **the lens is keyed by card id in one combined renderer+721
contract, so a card is a live lens *before* any token is minted for it.** That splits
the deck into two states of the *same* thing:

- **Minted lens** = render **+** an owned 1/1 token (tradeable, surfaced on the marketplace).
- **Render-only lens** = the *same* live render, readable via the CLI / view calls,
  with **no token minted yet** (0 mints, no marketplace clutter).

So **all 100 cards are lenses**; they differ only by whether a token has been attached.
Minting never *creates* a lens — the render already is one — it just **bolts ownership
on**. That is why the field cards can be **render-only today and minted later without
their art logic changing** (see §3).

## 3 · The 100-card deck ✅

*(The art is **hand-made by the artist**; any card art/names on the site today are
**placeholder**.)*

| Layer | Count | On-chain state | How you get it |
|---|---|---|---|
| **Hero lenses** | **33** | **minted 1/1 ERC-721** (live lens) | 11 pulled from packs · 22 earned as game titles |
| **Field cards** | **67** | **render-only lens** (chain-readable, unminted) | pulled from packs · site-layer collectible |
| **Lovebeing** | +1 | **holder-bound lens** | every `$3030` holder carries one |

### The 33 hero lenses — the **genesis set** (11 gacha + 22 earned) ✅
**The 33 are established in Tier I only, and persist through all four tiers** — no new
hero/special cards are ever minted after S1. They are the permanent elite of the deck; later
tiers (II–IV) continue the field-card packs and the token burn-down, but the special tier
is locked at launch.
- **11 GACHA** — a lens claim is seeded **rarely** across the Tier-I pack stream; pull it →
  **mint** (wallet signs). 11 exist, ever.
- **22 EARNED** — each a one-of-a-kind **genesis game title** (**12 cabinet titles** — 4 per
  game across the three cabinets — **+ 6 first-blood feats + 4 grand titles**); win it → a
  signed claim **voucher** → **mint**. One winner per title.

### The 67 field cards — **B now, C later** ✅
- **B (now):** **render-only lenses.** Their attributes live in an on-chain
  **registry / merkle root**, and their render reads the live market — so they are
  **readable via the CLI without being minted** (0 mints). They **survive**: no ash, no
  forced retirement. **Rarity is set by community vote** (Rarity Court), and copies can
  be **compressed** (corner-the-edition → 1/1 — a *voluntary* upgrade, not destruction).
- **C (later):** an optional phase that **mints** field cards for real. Because they
  mint **against the same lens render** (same id), a minted field card **stays a lens** —
  C only attaches ownership; the art logic never changes. *(If C is ever done via a
  separate Manifold contract, its `tokenURI` must point back at the render — otherwise
  it is static art, not a lens.)*

### Lovebeing — the holder lens ✅
The 1/1 marquee, **distributed to every `$3030` holder**: **one per wallet regardless
of balance**, **non-transferable**, **non-burnable**, with special CLI properties. It is
a **holder-bound lens** — every holding wallet resolves its render — so it is **never
minted per-person** (no flood). Hold the token, you carry Lovebeing.

## 4 · Packs — the BURN engine ✅

⛔ **THERE ARE NO SEASONS. The schedule is TIERED.** (Artist directive, 2026-08-01 —
ripmaster3030studios is a game studio, not a drop calendar.) **A tier opens when the one before
it SELLS OUT, not on a date.** ⚑ This is a real change, not a rename: a season is a promise about
*time* — call it "Summer" and you owe the public a drop every summer, forever, and missing one is
a visible failure at something nobody had to promise. A tier is a promise about *supply*, and it
is equally honest whether it takes three weeks or three years. The four allotments and prices are
unchanged, so every burn, float and treasury number is identical.

A pack is a **site-guided buy of `$3030` off the curve**, then **split 50/50: half burns
permanently, half funds the studio** (artist directive — `docs/TREASURY.md`). Together with the
game rake it is the only thing that burns supply.

⚠ **This halved every burn figure that predates it.** The model burned 100% of every pack until
2026-08-01, so any burn number quoted from an older run of `token-model.mjs` — or from a document
that copied one — is **double the truth**. The four-tier sellout burn is **≈1.01M, not ≈2.03M**.
The split is atomic (`contracts/PackSink.sol`), because burn-then-transfer as two signed
transactions can half-execute; see `docs/TREASURY.md` for why that is not negotiable.

- **Allotment (site-enforced, dwindling):** Tier I **1,600** → II **1,100** → III **600**
  → IV **260** = **≈3,560 packs**. The pack count is bounded by the **burn budget, not
  card supply** — allotment gone ⇒ that tier closes and the next opens (secondary market in between).
- **Price is a DOLLAR target and escalates across tiers: $10 → $12 → $15 → $20.** The `$3030`
  amount is derived from the live token price when a tier OPENS and then **locked for that
  tier** — at the measured ~$0.08 open, Tier I is **125 $3030** (62.5 burned · 62.5 to the
  studio). ⚑ Locking at open is the only rule that is both honest to the dollar price and stable
  enough to publish: recomputing per purchase makes "1,600 packs" unpriceable, never recomputing
  lets a 3× appreciation turn a $12 pack into a $36 one. `js/chain-config.js` `packBurn` carries
  the current tier's count and is pinned to `docs/PACK-PRICING.md` by `npm run test:name`.
  ⛔ The old **~350 tok (~$7) → ~1,200 tok (~$24)** schedule is dead — it assumed a $0.02 token.
- A pack reveals **field cards** (site-layer). **Rarely** it carries one of the **11
  gacha lens-claims** — mint it and you have a hero lens. **Lovebeing is not in packs.**
- **Full four-tier sellout burns ≈ 1.01M** and pays the studio ≈ **1.01M** (`token-model.mjs`)
  — see §6. ⛔ **That ≈1.01M figure came from the DEAD fixed-token schedule and no longer holds**;
  under dollar-priced packs the four-tier burn depends on where the token trades, which is why
  **no burn percentage and no contraction multiple is published at all.** ⚠ The direction is
  counter-intuitive and is the reason: **if the token appreciates, a $12 pack costs FEWER tokens,
  so pack-driven burn FALLS as the price rises.** The site publishes **live burn and live studio
  totals** read from the chain — facts at the moment of reading, not forecasts.
  ⚠ The line here previously measured this "against a 33M cap"; the cap is **3,300,000** (the 33M
  direction was reversed 2026-08-02).

## 5 · Games — WAGERS, and where 22 lenses are earned ✅

Playing **wagers `$3030` + cards** into one pot. A **small ~10% rake burns** — permanent,
deflationary ("the token burns so the art lives") — and the rest of the pot **plus the staked
cards** pay out to the **podium**: **1v1** — winner takes the pot + the loser's cards;
**multiplayer** — **1st 50% · 2nd 30% · 3rd 20%** of both the (post-rake) token pot **and**
the staked cards, **1st taking the most** (4th+ take nothing). So games add a *small* steady
burn on top of the pack-driven deflation. The rake burn (`js/wager-payout.js`, 10%/50-30-20)
is the shared math for every cabinet. **Staked cards/lenses transfer** (never burned in-game).
Card → in-game power is live today (`js/card-powers.js`, see `CARD-POWER-MAPPING.md`).

> **On-chain scope:** today the **rake burn is real** (`RipWallet.burn`) and card moves are
> local-vault; the **trustless token-pot escrow + real podium payout** ships with the
> **Phase-2 721-lens contract**. Until then the pot split is shown but settles off-chain.

The **22 earned hero lenses** are the prestige track — all **genesis titles** (the 33 are a
genesis set; §3): each maps to a single, unrepeatable **title** across the three cabinets —
**12 cabinet titles** (4 per game), **6 first-blood feats**, **4 grand titles**. Win a title
→ signed voucher → mint the 1/1.

## 6 · The burn-down — token deflation, **not** card death ✅

Packs burn `$3030` permanently, so supply only falls: from the **3,030,000** mint
toward a **~1,010,000 floor** once the field's four-tier life sells through — a **≈3×
permanent contraction** (`token-model.mjs`). **Lifetime burn ≈ 2,020,000 (⅔ of the
cap)**; the invariant **Σ lifetime burn ≤ cap** holds trivially.

**Cards do not retire or ash.** The deck **survives**. Scarcity comes from **dwindling
pack allotments** (harder to *acquire*), **community rarity votes**, and **compression** —
never from destroying cards. *The token burns so the art can live.*

- **Corner-the-edition:** own every copy of a field card → **compress** into a **1/1**.
  A collector's flourish, not a retirement.

## 7 · Wallet & minting mechanics ✅

| Action | Wallet? | Why |
|---|---|---|
| Buy pack / burn `$3030` | **required** | a real buy + burn tx — this is the audited-real part |
| Mint a hero lens (1 of 33) | **required** | a token can't be minted without the owner's signature |
| Field-card pulls / game practice | not required | site-layer prototype, honestly labeled |
| Lovebeing (holder lens) | **connected to read** | the render reads that your address holds — no mint |

The site can **never** mint *for* someone or move their tokens on their behalf — that is
fundamental to wallets and the correct security posture. The two moments that need a
connected, signing wallet are **buying/burning a pack** and **minting a hero lens**.

## 8 · The loop, in one line

**buy `$3030` → burn it as a pack → get field cards + a rare gacha lens → play for the
22 title lenses → the token deflates 3× while the deck survives.**

---

### Open ⏳ (needs SuperRare)
1. Curve calibration to open at ~1 RARE/token on the 3,030,000 supply (`CURVE-TARGET.md`).
2. Whether the **assisted 721 lens setup** supports **render-by-id over 100 card-lenses**
   (33 minted now, 67 render-only) — or we deploy our **own combined renderer+721 lens
   contract** via the CLI (self-supported). Either way it is 721, and either way the
   render-by-id split (**B now / C later**) is the target.
3. The **mint mechanism** — a claim/voucher redeemer that takes the pack burn (for the 11
   gacha lenses) and the signed game vouchers (for the 22 earned lenses), vs. assisted setup.

*Not financial advice. `$3030` is an experimental, volatile testnet token.*

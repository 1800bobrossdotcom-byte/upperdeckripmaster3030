# Pack pricing — the pack is a DOLLAR target, and no burn percentage is promised

**Source: SuperRare's review of the live mainnet Liquid Editions CLI previews, 2026-08-06.**
Canonical numbers: `npm run model` (`scripts/token-model.mjs`).
This file records the decision and the arithmetic behind it. It supersedes the `$7 / 350-token`
pack schedule everywhere it still appears.

---

## 1 · The curve

| setting | value |
| --- | --- |
| preset | **low-demand** ⚠ every deploy command said `medium-demand` until 2026-08-06 |
| initial RARE liquidity | **0** |
| creator allocation | **0** |
| supply | 3,300,000 (unchanged) |
| **opening price** | **≈ $0.08 per $3030** — *measured, not assumed* |
| supply in the gentlest band | 30% sits in $0.08–$0.16 |

⛔ **P0 was assumed at ~$0.02 and is really ~$0.08 — a 4× error, and every pack number rode on
it.** The old model wrote `P0 = 1 RARE` with `RARE ≈ $0.02`. This is the first time the opening
price has been measured rather than guessed, and it invalidates the pack schedule outright.

✅ **It also settles the RESERVE-SEED CONTRADICTION.** `CURVE-TARGET.md` and `TOKEN-MATH.md` both
described a ~10,000 RARE seed at deploy while `token-model.mjs` printed reserve = 0. **Zero was
right.** There is no bid below spot on day one; the first seller walks the curve down alone. That
is a real property of this launch and should be stated plainly rather than discovered.

---

## 2 · The pack

⛔ **The 350–1,200 token amounts are dead.** At the measured open, SuperRare's note is exact:

> "Even Tier I would open around $28–$42 on the low curve, and considerably higher on the other
> presets."

350 tokens × $0.08 = **$28**. The old schedule was written when a token was assumed to be $0.02,
where 350 tokens was the $7 the site has published all along. ⚑ **The token count was never the
product — the price of a pack of cards was.** So the dollar figure is the target and the token
count is derived from it.

| tier | packs | **$ target** | tokens at the $0.08 open | burned | to the studio |
| --- | --- | --- | --- | --- | --- |
| **I** | 1,600 | **$10** | **125** | 62.5 | 62.5 |
| **II** | 1,100 | **$12** | 150 * | 75 * | 75 * |
| **III** | 600 | **$15** | 188 * | 94 * | 94 * |
| **IV** | 260 | **$20** | 250 * | 125 * | 125 * |

\* **Tier I is fact; tiers II–IV are scenario.** Only tier I opens at a price we have measured.
Each later tier's token count is **re-derived from the live token price on the day it opens, then
LOCKED for that tier**.

⚑ **Why lock-at-open rather than recompute per purchase:** recomputing continuously makes the pack
a moving target mid-tier and makes "1,600 packs" unpriceable; never recomputing lets a 3×
appreciation turn a $12 pack into a $36 one. Lock-at-open is the only rule that is both honest to
the dollar target and stable enough to publish.

---

## 3 · ⛔ NO FIXED BURN PERCENTAGE IS PROMISED

> "This means we should not promise a fixed 30.7% burn. That model requires roughly 570 tokens per
> pack on average, already about $46 per pack at the opening price, before gas and curve
> appreciation. Better to publish live burn and studio totals." — SuperRare

✅ **Confirmed independently from our own model, from the other direction:**
1,014,375 burned ÷ 3,560 packs ÷ 0.50 split = **570.0 gross tokens per pack**, and
570 × $0.08 = **$45.60**. Their number is exactly ours.

⛔ **So 30.7% was never a property of the design. It was a property of a $0.02 token.** At $0.08
the same dollar packs buy a quarter of the tokens, and any published percentage becomes a promise
about a price nobody controls.

⚠ **And the direction is counter-intuitive, which is the strongest reason not to publish a number:
if the token appreciates, a $12 pack costs FEWER tokens, so pack-driven burn FALLS as the price
rises.** The old fixed-token schedule behaved the opposite way. A percentage printed on a page
would drift away from the truth on its own, with nobody editing anything.

**Flat-price scenario, for internal reference only — never for publication:** if all four tiers
sold out and the price never moved from $0.08, the burn is **271,400 (8.2% of the mint)** and the
studio receives the same 271,400, leaving a float of 3,028,600 (**1.09×** contraction) with the
studio slug at **9.0%** of it.

⚠ These replace the previously pinned **30.7% · 1.44× · 44.4%**, which are now wrong in both
directions — but they must not simply be swapped in. **They are a scenario, not a target.**

### What the site publishes instead

- **Live burn** = `maxTotalSupply() − totalSupply()`, read from the chain.
- **Live studio total**, read from the treasury.

Both are facts at the moment of reading, neither is a forecast, and no visitor has to trust a
projection to check either one. `js/lens-state.js` already reads the first of these.

---

## 4 · What this does NOT change

- Supply stays **3,300,000**; the 50/50 split stays; `PackSink.sol` is unchanged — it enforces a
  split, not a price, so no contract edit follows from any of this.
- The tier allotments (1,600 / 1,100 / 600 / 260) and the sell-out trigger are unchanged.
- Burns remain permanent and mint-once.

## 5 · Settled, and still open

- ✅ **APPROVED BY THE ARTIST, 2026-08-06** — *"yes on pricing changes"*. The $10/$12/$15/$20
  ladder is settled and replaces the $7 figure the site had published since March.
- Whether the four dollar targets are the right ladder at all — the shape (rising with scarcity)
  is his design; only the level moved.
- **`M` (end/start over the whole curve) is still assumed at 10.** The preview gave us the opening
  price and the first band, not the full curve. No M-derived number may be quoted as measured.

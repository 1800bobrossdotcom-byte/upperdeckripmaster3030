# Reply to the SuperRare Sepolia audit — upperdeckripmaster3030

*Draft for lovebeing to send. Covers all five audit items + the test-RARE request.*

---

Hey — thank you, genuinely. This is exactly the kind of review the testnet rehearsal
was for, and every point landed. Here's where we are on each, with the fixes already
in the repo where we could make them.

## 1 · The burn-milestone overflow — you're right; we fixed it *and then removed the mechanic*

You caught the load-bearing mistake. Our schedule totalled **4,355,400** tokens of
burn against a **3,030,000** max supply, and it only "worked" because our model
assumed **burns re-mint on the next buy**. Your correction — *minted into the pool
once, burned tokens do not re-mint* — is the truth about the protocol, and under it
that schedule was impossible.

Rather than just re-size it, we **simplified the design so the problem can't recur**:
we **removed forced card retirement entirely.** There is no longer a card-death
schedule that could overflow the cap. What remains is only **token deflation**:

- **3,030,000 minted once, every burn permanent.**
- Packs burn `$UR3030` down toward a **~1,010,000 floor** over the field's four-season
  life — **lifetime burn ≈ 2,020,000 (⅔ of the mint)**, a **3× permanent contraction**.
- The only burn rule is the trivial **Σ pack burns ≤ ⅔ cap**, enforced in
  `scripts/token-model.mjs`. Pack allotments (S1 1,600 → S4 260) are sized so a full
  four-season sellout lands right at that budget.
- **Cards do not retire or ash.** The 100-card deck **survives**; scarcity comes from
  dwindling pack allotments, community rarity votes, and voluntary compression. *The
  token burns so the art can live.*

So the audit item is resolved by **deletion, not patching** — the cleanest possible fix.

## 2 · The curve — let's design it together, exactly as you proposed

Agreed completely. At the medium-demand preset with 1,000,000 supply, ~5,700 RARE for
a 350-token pack is nowhere near our intended **$7 pack**. We also found that
`medium-demand` is the only curve preset currently documented (instant/graduated were
removed), and the 1,000,000 supply came from the launcher defaults, not a knob we set
— so we can't just dial a cheaper curve ourselves.

Here's the target we'd bring to a joint sizing pass, and we'd love your guidance on the
curve params + supply that actually deliver it:

- **Pack:** ~350 $UR3030 ≈ **$7** at launch, escalating to ~$24 by S4 (within-season
  base→ceil plus token appreciation).
- **Max supply:** we'd like to keep **3,030,000** (it's the brand — "3030"), but we're
  open to whatever supply makes the $7 pack and the burn schedule coherent together.
- **Lifetime burn:** ~2,020,000 permanent (the ⅔ retirement arc above).

If a $7/350-token pack needs a different supply or a curve preset we don't have access
to, tell us — we'll build the schedule around whatever curve you can actually give us,
rather than the other way round.

## 3 · The renderer display bugs — both fixed (no token redeploy)

Diagnosed and patched in `contracts/UR3030RenderPrototype.sol`:

- **"100% circulating"** — we were reading `currentSupply` (the pool's total supply,
  which sits at ~max because the whole curve is minted into the pool) and labelling it
  "circulating." Since burns are the real signal, the meter now reads **BURNED %**,
  derived as `maxTotalSupply − totalSupply` (per your own interface note that there's
  no burn getter). It correctly reads **0% at launch** and climbs as the field retires.
- **"0 UR3030 per RARE"** — `tokenPerRare / 1e18` was truncating an ~O(1) fixed-point
  value to zero. Now scaled ×100 before the divide and rendered to two decimals
  (e.g. `1 RARE → 1.29 $UR`).
- Also hardened while we were in there: JSON/SVG escaping on owner-set strings and the
  symbol, and an `int24` min-tick edge that could revert `tokenURI()`.

Since `setRenderContract` is re-callable, this ships **without redeploying the token**.
Compiles clean on 0.8.24 with viaIR.

## 4 · Honesty about what's on-chain vs. prototype — doing it now

Fair and important — and the v2.2 card design draws the line cleanly. **Two things are
real on-chain:** the **`$UR3030` buy + burn** (irreversible), and the **33 hero-lens
mints** (11 gacha + 22 earned — real 1/1 ERC-721 tokens, wallet-signed). Everything else
— the **67 render-only field cards** (chain-readable but unminted), the binder,
battles/wagers, and card-powers — is labelled **testnet prototype / later phase**. Field
pulls generate and save in the browser today; minting them for real is an explicit later
phase (the render already exists, so it's a pure ownership add). This directly narrows
the "local prototype" gap you flagged — a third of the deck is real from day one.

## 5 · The name

We've decided to keep **upperdeckripmaster3030** — but as **one continuous word**
(matching the domain), not "Upper Deck." It reads as a single coined mark and we've
made the whole site consistent to that form. We hear you that trading cards is the same
category as Upper Deck, so we'll get a professional clearance on the fused mark rather
than assume; happy to talk it through if you have a view.

## 6 · The lens layer — we read the Cohort-01 docs and rebuilt the card design around them

We went back through the **Overview** and **Technical CLI Guide** to settle how the
cards should exist on-chain, and your docs answered it: Liquid Edition lenses are
**ERC-721** — *"Companion 721 Lens Collections… supported through an assisted setup,"*
and the CLI's *"combined renderer plus ERC721 contract where each NFT is a different
lens."* We took the render-by-id idea and built the whole card layer on it:

- **Every card is a lens = a render keyed by card id** in one renderer+721 contract, so
  a card is a live lens **before** any token exists for it. Minting just attaches
  ownership; it never changes the render.
- The deck is **100 hand-made cards**. **33 are minted 1/1 hero lenses now** (11 pulled
  from packs, 22 earned as game titles). The **other 67 are render-only lenses** —
  readable on-chain via the CLI, **zero mints, zero marketplace clutter** — and can be
  minted later against the *same* render without becoming static art.
- Plus **Lovebeing**, a **holder-bound lens**: every `$UR3030` holder resolves its
  render, one per wallet, non-transferable, non-burnable. No per-person mints.

So we're firmly on **721**, with a deliberately tiny mint footprint (33 + optional
later mints), not a flood of editions.

**The fork we'd like your read on:** does the **assisted 721 lens setup** support
**render-by-id across 100 card-lenses** (33 minted, 67 render-only), or is the intended
path that we deploy our **own combined renderer+721 lens contract** via the CLI
(self-supported)? And on the mint side — should a **claim/voucher redeemer** take the
pack burn (for the 11 gacha lenses) and the signed game vouchers (for the 22 earned),
or does that sit in the assisted layer?

## The rehearsal

Please do send the **25,000 test RARE** — that covers the three rehearsals plus the
partial-sell test you suggested. Once the supply/curve numbers are settled together,
we'll redeploy the corrected edition on Sepolia and run the corrected renderer against
it.

And yes — please share the detailed audit + checklist. We'll work each item with you.

— lovebeing

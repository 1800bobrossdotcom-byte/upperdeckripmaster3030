# Reply to the SuperRare Sepolia audit — upperdeckripmaster3030

*Draft for lovebeing to send. Covers all five audit items + the test-RARE request.*

---

Hey — thank you, genuinely. This is exactly the kind of review the testnet rehearsal
was for, and every point landed. Here's where we are on each, with the fixes already
in the repo where we could make them.

## 1 · The burn-milestone overflow — you're right, and it's fixed

You caught the load-bearing mistake. Our schedule totalled **4,355,400** tokens of
burn against a **3,030,000** max supply, and it only "worked" because our model
assumed **burns re-mint on the next buy**. Your correction — *minted into the pool
once, burned tokens do not re-mint* — is the truth about the protocol, and under it
that schedule is simply impossible. We'd actually flagged "burns reopen mint
headroom" as an unverified pre-mainnet assumption in our own launch doc; you've now
verified it, in the other direction.

So we've rebuilt the schedule around a **fixed, mint-once lifetime burn budget**:

- **3,030,000 minted once, every burn permanent.**
- Retiring the whole field (119 cards → 77 survivors) now burns **2,020,025 total
  (66.7% of the mint)** — sized to ⅔ of supply by design, with the escalator's base
  *derived* from that budget so the full clear can never exceed the cap.
- **~1,009,975 $UR3030 survive** the full retirement as the settled live float — a
  **3× permanent contraction** from the mint. That's the deflation story, now honest.
- Retirement is a **multi-season arc**, not one season. We rescaled the pack
  allotments (S1 1,600 packs → S4 260) so a full four-season sellout burns ~2.03M —
  right at the retirement total, and comfortably under the cap.

The generator (`scripts/burn-milestones.mjs`) and model (`scripts/token-model.mjs`)
both enforce `cumulative burn ≤ cap` as an invariant now.

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

Fair and important. We're relabelling the pack rip, binder, battles/wagers, and
card-power mechanics as a **testnet prototype / later phase** across the site. The one
thing that stays framed as real is the **$UR3030 buy + burn** — because that part *is*
real and irreversible. Card pulls generate and save in the browser today; on-chain
card ownership is an explicitly-labelled future phase.

## 5 · The name

We've decided to keep **upperdeckripmaster3030** — but as **one continuous word**
(matching the domain), not "Upper Deck." It reads as a single coined mark and we've
made the whole site consistent to that form. We hear you that trading cards is the same
category as Upper Deck, so we'll get a professional clearance on the fused mark rather
than assume; happy to talk it through if you have a view.

## 6 · The lens layer — we read the Cohort-01 docs; one structural question

We went back through the **Overview** and **Technical CLI Guide** to settle how the
cards should exist on-chain, and your docs answered it: Liquid Edition lenses are
**ERC-721** — *"Companion 721 Lens Collections… supported through an assisted setup,"*
and the CLI's *"combined renderer plus ERC721 contract where each NFT is a different
lens."* So we're **not** trying to force a custom 1155 — that's off the supported/
surfaced path, and 721 numbered editions actually read as *stronger* card provenance
(a card mints as #1/62 … #62/62).

The one thing we can't tell from the docs: our field is **196 distinct card-lenses,
each editioned** (print run = edition size, per rarity). Does the **assisted 721 lens
setup** support a collection of that shape, or is the intended path that we deploy our
own **editioned 721 renderer + lens contract** via the CLI (self-supported)? And on the
mint side — should a **pack contract** take the $UR3030 burn and mint the 7 lenses, or
does that sit in the assisted layer? That's the one design fork we'd like your read on
before we build it.

## The rehearsal

Please do send the **25,000 test RARE** — that covers the three rehearsals plus the
partial-sell test you suggested. Once the supply/curve numbers are settled together,
we'll redeploy the corrected edition on Sepolia and run the corrected renderer against
it.

And yes — please share the detailed audit + checklist. We'll work each item with you.

— lovebeing

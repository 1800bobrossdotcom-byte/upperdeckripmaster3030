# $UR3030 — the economic flow (canonical)

*How the token, the packs, the lenses, the games, and the burn-down fit
together. Decisions locked with the artist are marked ✅; items still needing
SuperRare are marked ⏳.*

---

## 1 · The one primitive — `$UR3030` (ERC-20, mint-once)

A single SuperRare Liquid Edition. **Minted once** into the AMM pool (Uniswap v4
+ Doppler, reserve in RARE) at launch. **Burns are permanent — nothing
re-mints.** No treasury, no team unlock, no fee wallet. `$UR3030` is the only
fungible token; it is both the **currency** and the **burn meter**
(`burnProgress = maxTotalSupply − totalSupply`).

- Cap **3,030,000** · opening **≈ 1 RARE/token (~$0.02)** ⏳ (curve calibration — see `CURVE-TARGET.md`)

## 2 · The cards are LENSES (ERC-1155) ✅

Every card in the 196-card field is a **Lens**: an ERC-1155 render token whose
`tokenURI` reads `$UR3030`'s live market + burn state, so the card art evolves
with price and with the fire. A card's **print run = its 1155 supply cap** (the
"denomination"). Rarer tier → smaller run. The sealed **1/1 marquee** (*Lovebeing*)
is its own lens.

⏳ *For SuperRare:* confirm Lenses can be **ERC-1155** (fungible copies per card).
If the assisted Lens setup is 721-only, the same denominations become **numbered
editions** (many token-ids sharing one card's art) — the economics are identical,
only the token standard differs.

### Denominations (from `scripts/print-runs.mjs`)

| Tier | Cards | Run / card | Tier supply |
|---|---|---|---|
| common | 74 | 200 | 14,800 |
| uncommon | 60 | 105 | 6,300 |
| rare | 40 | 62 | 2,480 |
| mythic | 17 | 45 | 765 |
| prizm | 5 | 22 | 110 |
| marquee | 1 | 1/1 | 1 |
| **total** | **196** | — | **24,456** |

Sized against **3,560 packs × 7 = 24,920 lens pulls** over the field's four-season
life (numbers are curator-set knobs; re-run the script to retune).

## 3 · Packs — the BURN engine ✅

A pack is a **site-guided buy of `$UR3030` off the curve, burned in full**, that
mints you **7 lens copies**. It is the *only* thing that burns supply, so it is
the sole driver of the burn-down.

- **Allotment (site-enforced, dwindling):** S1 **1,600** → S2 **1,100** → S3 **600**
  → S4 **260** = **3,560 packs**. Allotment gone ⇒ packs close for the season
  (secondary/lens market only).
- **Price escalates** within a season (base→ceil as the allotment sells) and
  across seasons: **~350 tok (~$7)** in S1 → **~1,200 tok (~$24)** by S4, on top of
  token appreciation.
- **Full four-season sellout burns ≈ 2,028,750** (`token-model.mjs`) — the arc that
  retires the field.

## 4 · Games — WAGERS, net-zero to supply ✅

Playing costs `$UR3030`, but **game token-antes are wagers, not burns** — the pot
transfers to the winner, so play is **net-zero to supply and does not touch the
burn-down**. **Lens stakes** (the cards you field) likewise **transfer** between
players — you arm with them and can lose them. This keeps the retirement pace
**fully controlled by the pack allotment**, not by how much people play.

*(Optional future knob: a small fixed % of each ante could burn as a "rake to the
fire" — a minor, budgeted accelerant. Off by default.)*

Cards → in-game power is live today (`js/card-powers.js`, see `CARD-POWER-MAPPING.md`):
staked lenses arm damage / fire-rate / shield / speed / weapon tier, scaled by
live chain heat, with a market-driven OVERCHARGE.

## 5 · The burn-down → retirement → ash ✅

Cumulative pack burn crosses a **published weakest-first milestone schedule**
(`scripts/burn-milestones.mjs`, `cards/data/_milestones.json`): first card at
**~8,125** burned … last at **2,020,025**. Each crossing **retires the next card**
— its lens render flips to **ASH**. After the full clear, **119 cards retire, 77
survive**, and **~1,010,000 `$UR3030` remain** as the settled live float (a **3×
permanent contraction**). Invariant: **Σ lifetime burn ≤ cap** ✅.

**Print run and retirement are separate axes.** A card *sells out* when its 1155
supply cap is hit (no more pulls); it *retires* when the burn crosses its milestone
(render → ash). The tiers align by design: **commons** have the biggest runs **and**
retire first (they flood, then turn to ash you can hold); **prizm** have the tiniest
runs **and** survive (scarce lenses that endure into the 77-card deck).

- **Corner-the-edition:** own every copy of a card's lens → **compress** (burn the
  copies) → mint a **1/1**. Final blows on a dying card earn **Ash-Trophy** lenses.

## 6 · The loop, in one line

**buy `$UR3030` → burn it as a pack → mint 7 lenses → play/wager/trade the lenses
→ burns cross milestones → cards retire to ash → 77 survive → season turns.**

---

### Open ⏳ (needs SuperRare)
1. Curve calibration to open at ~1 RARE/token on the 3,030,000 supply (`CURVE-TARGET.md`).
2. Lens token standard — ERC-1155 vs. 721 numbered editions — and the **pack-mint
   mechanism** (a pack contract that takes the burn + mints lenses, vs. assisted setup).
3. Whether lens minting is **per-pack at launch** (bigger contract surface) or the
   launch stays **one edition + render**, with lenses minting the survivors at season
   end (the original intake posture). Going per-pack makes the card layer real on-chain
   from day one — which directly closes the audit's "local prototype" gap.

*Not financial advice. `$UR3030` is an experimental, volatile testnet token.*

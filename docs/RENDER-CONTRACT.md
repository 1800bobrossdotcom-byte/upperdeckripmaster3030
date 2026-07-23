# Render Contract — functionality & the lens build ($UR3030)

*Authoritative render-contract interface for SuperRare Liquid Editions (pulled from the
`liquid-editions-starter-kit`, July 2026), how our prototype maps to it, and exactly what
to build for the 721 lens plan. Canonical economics: `docs/ECONOMIC-FLOW.md`.*

---

## How a Liquid Edition renders on-chain

The ERC-20 edition has **no baked art** — it **delegates its metadata to a render contract**
the token creator registers:

```
cast send $LIQUID 'setRenderContract(address)' $RENDER   # creator-only, RE-CALLABLE
```

Re-callable ⇒ we can **swap art without redeploying the token**. The token then delegates all
metadata reads to the render contract.

## Two `tokenURI` roles (one contract can serve both)

| Function | Role |
|---|---|
| **`tokenURI()`** (no args) | **Liquid Edition passthrough** — the ERC-20's own "market card". Reads live state, renders one image. |
| **`tokenURI(uint256 tokenId)`** | **Per-lens NFT metadata** — each companion ERC-721 tokenId is *a different lens over the same market* (different mappings, thresholds, narratives, visuals). |

> "Each NFT can be a different lens over the same state." — starter kit

**Minted lens tokens begin at ID 1** (the passthrough does not mint token 0). So our card ids
run **1…100**.

## SuperRare's reference contracts (our templates)

- **`LiquidLensHTMLExample.sol`** — *render-only*. Exposes `tokenURI()`, returns HTML via
  `animation_url`. One artwork attached to the Liquid token.
- **`LiquidLensMintable721SVGExample.sol`** — ***combined renderer + ERC-721***. Exposes
  **both** `tokenURI()` **and** `tokenURI(uint256 tokenId)`, implements `supportsInterface`
  (ERC-721), returns SVG metadata, **supports NFT minting**. ← **this is our template.**

**Feasibility verdict:** our combined renderer+721 lens plan (render-by-id for 100 cards,
33 minted + 67 render-only, Lovebeing holder-bound) is **directly supported — SuperRare
ships a first-party contract of exactly this shape.** No off-path custom work required; no
ERC-1155.

## Market-state reads available to the renderer (`ILiquid`)

`balanceOf(address)`, `totalSupply()`, `maxTotalSupply()`, `getCurrentPrice()`,
`getMarketState()` → `(rarePerToken, tokenPerRare, sqrtPriceX96, currentTick, liquidity,
currentSupply)`, `quoteBuy()`, `quoteSell()`, `lpLiquidity()`, `totalLiquidity()`, plus
`name()`, `symbol()`, `tokenCreator()`. Burn progress = `maxTotalSupply − totalSupply`
(there is no burn getter). We currently read `getMarketState` + `maxTotalSupply` + `symbol`;
`getCurrentPrice`/`quoteBuy`/`quoteSell` are available if we want richer overlays.

## Where we are vs. what to build

- **✅ Done — `contracts/UR3030RenderPrototype.sol`** *is* the passthrough renderer:
  `tokenURI()` reads live `getMarketState`/`maxTotalSupply`, computes the burn snapshot
  (BURNED = max − live, burned %, $UR/RARE, tick), draws an on-chain SVG "market card" +
  JSON. Owner-set meta without redeploy; JSON/XML escaping; int24-min-tick safe; compiles
  clean (viaIR). This is correct for the **edition's own** display.

- **⬜ To build — the combined lens contract** (port `LiquidLensMintable721SVGExample`):
  1. `tokenURI(uint256 id)` for **ids 1…100** — base card art (the handmade lens for card N)
     **+** the same live market/burn overlay, keyed by id. Renders for an id **whether or
     not it's minted** (so the **67 field cards are render-only / readable now**; minting
     later just attaches ownership — the B→C path).
  2. **ERC-721 mint** — the **33 hero 1/1s** at launch: **11 via a pack-burn claim**, **22
     via a signed game-title voucher**. `supportsInterface` for ERC-721.
  3. **Lovebeing** — a **holder-bound** lens: gate its render/claim on `balanceOf(holder) >
     0`, one per wallet, non-transferable, non-burnable (soulbound), no mint flood.
  4. Keep `tokenURI()` (passthrough) so the same contract can also be the edition renderer,
     or keep the prototype as the edition renderer and this as the lens collection —
     decide with SuperRare during assisted setup.

## Open ⏳ (confirm with SuperRare / the starter kit at deploy)
- Pull the **exact `ILiquid` + render interface** from the pinned starter-kit commit before
  deploy (signatures can drift): `github.com/superrare/liquid-editions-starter-kit`.
- Whether the **assisted 721 setup** hosts the lens collection or we deploy the combined
  contract ourselves via the Rare CLI (`set-render-contract`).
- The **mint path** for gacha claims + earned vouchers (a redeemer, or assisted-setup mint).
- Confirm `tokenURI(uint256)` on **unminted** ids is acceptable for the render-only field
  cards (view-only render vs. requiring a mint).

# Render Contract — functionality & the lens build ($3030)

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

- **✅ Done — `contracts/Ripmaster3030Renderer.sol`** *is* the passthrough renderer:
  `tokenURI()` reads live `getMarketState`/`maxTotalSupply`, computes the burn snapshot
  (BURNED = max − live, burned %, $UR/RARE, tick), draws an on-chain SVG "market card" +
  JSON. Owner-set meta without redeploy; JSON/XML escaping; int24-min-tick safe; compiles
  clean (viaIR). This is correct for the **edition's own** display.

- **✅ Built — `contracts/Ripmaster3030Lens721.sol`**, the combined lens contract. WE build it;
  SuperRare provides connectivity, deployment and platform (artist directive 2026-07-27).
  1. `tokenURI(uint256 id)` for **ids 1…100**, and it deliberately does **not** require the
     token to exist — OpenZeppelin's default reverts on a nonexistent id, which is exactly
     wrong for the 67 render-only field cards. Minting later only attaches ownership.
  2. `image` = `ipfs://CID` (the pinned base art, the permanent record); heroes also carry
     `animation_url` = the live HTML lens, wrapped on-chain in `data:text/html` because
     SuperRare renders animation_url as a document rather than fetching a URL.
  3. **ERC-721 mint of the 33 heroes** via a single EIP-712 voucher path, `kind` 1 = gacha
     pack-claim, 2 = earned game title. One trust path rather than two, because the
     qualifying event is observed off-chain either way. Cards 34…100 cannot be minted.
  4. **Lovebeing** — soulbound, one per wallet, enforced in `_update` (mint allowed;
     transfer and burn revert).
  5. `tokenURI()` (no args) delegates to the passthrough renderer, so the edition keeps its
     existing display and this contract can serve both roles.

  Compiles clean under solc 0.8.24 viaIR, **0 warnings, 18,349 bytes** (EIP-170 limit
  24,576). **21/21 behavioural tests pass on a real EVM** — `npm run test:lens`
  (`scripts/test-lens721.mjs`) deploys the bytecode and exercises unminted rendering,
  the ipfs/animation_url split, voucher replay, `kind` swapping, field-card mint refusal,
  deadline expiry, and soulbound transfer refusal.

  ⚠ Untested against the real Liquid Edition: `tokenURI()` delegation is only exercised
  with the renderer unset. Wire the real address on Sepolia and re-check before mainnet.

## Open ⏳ (confirm with SuperRare / the starter kit at deploy)
- Pull the **exact `ILiquid` + render interface** from the pinned starter-kit commit before
  deploy (signatures can drift): `github.com/superrare/liquid-editions-starter-kit`.
- Whether the **assisted 721 setup** hosts the lens collection or we deploy the combined
  contract ourselves via the Rare CLI (`set-render-contract`).
- The **mint path** for gacha claims + earned vouchers (a redeemer, or assisted-setup mint).
- Confirm `tokenURI(uint256)` on **unminted** ids is acceptable for the render-only field
  cards (view-only render vs. requiring a mint).

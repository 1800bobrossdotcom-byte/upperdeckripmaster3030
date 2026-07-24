# Research Notes — verified July 18, 2026

Findings from an 8-agent research + adversarial-verification pass (web sources, official
docs, Wayback snapshots). Everything below survived independent fact-checking; corrections
from the verify pass are already folded in. Re-verify anything marked volatile before
mainnet launch.

## Rare Protocol / Liquid Editions

- `@rareprotocol/rare-cli` on npm: latest **2.0.0** (2026-07-08); rare.xyz/docs documents
  v1.2.2. Liquid-edition subcommands (per docs + repo README): `deploy multicurve`,
  `status`, `token-uri`, `set-render-contract`. **No burn/mint/lens subcommands.**
- Only documented curve preset: `medium-demand` (`instant`/`graduated` removed 2026-06-04).
- **Chains: Ethereum mainnet + Sepolia only** for Liquid Editions. Mainnet Liquid Factory
  `0x25f993C222fE5e891128a782A5168f1C78629540`; Sepolia `0xb1777091C953fa2aC1fD67f2b3e2f61343F5Ce5e`.
- **RARE is the reserve/base token** of the embedded liquidity pool; prices quoted in RARE.
- Starter kit `github.com/superrare/liquid-editions-starter-kit` (Foundry): `ILiquid is
  IERC20Metadata` declaring `burn(uint256)`, `maxTotalSupply`, `poolLaunchSupply`,
  `getCurrentPrice`, `getMarketState` (returns tokenPerRare, rarePerToken, sqrtPriceX96,
  currentTick, liquidity, currentSupply), `quoteBuy`, `quoteSell`, `lpLiquidity`,
  `totalLiquidity`, `lpTickLower`, `lpTickUpper`, `tokenCreator`, `baseToken`.
  **No burn-progress getter — derive from maxTotalSupply vs currentSupply.**
  Examples include `LiquidLensHTMLExample.sol` (HTML metadata) and a mintable SVG 721 lens.
- First Liquid Edition drop: "Value Discovery" by ripe, March 5, 2026 (mainnet).
- The CLI also ships `rare mcp serve` (MCP server) — Claude can drive protocol ops directly.
- Volatile: v2.0.0 command surface unverified against the v1.2.2 docs; re-run
  `rare liquid-edition --help` after install.

## Midjourney (July 2026)

- **No official public API.** Only lead: Enterprise API application form (July 16, 2025);
  no launch as of the June 25, 2026 updates feed.
- ToS (effective May 27, 2026): *"You may not use automated tools to access, interact
  with, or generate Assets through the Services."* All third-party "Midjourney APIs"
  (Apiframe, useapi, PiAPI…) automate a real account → documented bans. Don't.
- Flagship: **V8.1** (default June 10, 2026). HD mode = native 2K. Web "Run batch as HD"
  re-runs a seed-locked batch. V7 remains available; V8.0 slated for decommission.
- Consistency: `--sref <urls|codes>` + `--sw 0–1000` (default 100), `--sv 6`; sref
  stability **across model versions is not guaranteed** (docs warn V6→V7 codes drifted) —
  pin `--v 8.1` with the sref set. `--oref` is V7-only (auto-fallback, 2× GPU).
- Batch: permutations `{a,b,c}` + `--repeat`; limits 4/10/40 jobs per submission
  (Basic/Standard/Pro+Mega), Fast/Turbo only. Pricing: $10/$30/$60/$120 per month.

## Public domain (US, as of Jan 1, 2026)

- Rule: works published **through 1930** are US-PD; only the design as it appeared then.
- Safe (early versions only): 1928–30 B&W Mickey/Minnie (gloves PD via 1929 shorts;
  color/pupils/Fantasia are not), 1927 Oswald, pre-1931 Felix, Koko + Fitz (1918–29),
  1929 strip Popeye (no spinach — renewal status unverified; no Bluto), 1930 poodle-eared
  proto-Betty Boop (human Betty is 1931–32, still claimed), 1930 "Rover" bloodhound
  (the name Pluto is 1931 → PD 2027), 1930 white-form Bimbo, Flip the Frog (1930),
  Skeleton Dance skeletons (1929).
- Dropped: Tintin (EU copyright to 2054, litigious rightsholder; NFTs sell globally),
  Bosko (PD but racial caricature).
- Not PD: Donald (2030), Daffy (2033), proto-Bugs (2034), Bugs proper & Tom & Jerry &
  Woody Woodpecker (2036), Bart Simpson (~2083), SpongeBob (~2095), modern Mickey.
- Trademarks survive copyright: Disney (Steamboat Willie footage used as a logo),
  Fleischer BETTY BOOP, NBCU Felix, King Features POPEYE. Keep character names out of
  branding/titles; non-affiliation disclaimer; attorney review before mainnet.
- Precedents: *Disney v. Air Pirates* (9th Cir. 1978) — psychedelic-parody Mickey comics
  lost fair use; *Hermès v. Rothschild* (S.D.N.Y. 2023, MetaBirkins) — NFT trademark
  verdict, First Amendment defense rejected (2d Cir. appeal outcome unconfirmed —
  check docket before launch); *Jack Daniel's v. VIP* (SCOTUS 2023).

## Live-HTML NFTs

- OpenSea: HTML `animation_url` runs in a sandboxed iframe (JS/WebGL OK, null origin,
  **no `window.ethereum`**, square aspect); 300MB stated max, keep ≤ ~10–30MB; wallets
  and some marketplaces show only the static `image` field → **always ship a hi-res
  static image (≥3000×3000) and ideally a video loop as fallback**.
- Network from inside the sandbox works if the endpoint's CORS allows null/any origin
  (Tokenbound ships live-data iframes on OpenSea using indexer APIs + a JSON-RPC
  provider) — but generative platforms (fxhash) forbid network entirely. Pattern:
  **bake state at `tokenURI()` time; live RPC = progressive enhancement with timeouts.**
- Determinism: seed all randomness from a mint-time 32-byte hash (Art Blocks
  `tokenData.hash`, fxhash `$fx.rand`, Highlight `hl-gen.js`) — never `Math.random()`.
- Fully-onchain HTML is viable for tens-of-KB pages (scripty.sol + onchain JS storage;
  Terraforms' 11,104 tokens; Art Blocks' generator — 90% of its mainnet projects are
  chain-constructible). Our foil engine is small enough to consider this later.
- **iOS sensor trap (verified in WebKit source):** third-party iframes get
  `deviceorientation` only if the embedder allows **gyroscope + accelerometer +
  magnetometer**; marketplace allow-lists typically omit magnetometer, so orientation
  never fires on iOS there. `devicemotion` needs only gyroscope + accelerometer.
  → Card template requests **both** DeviceMotion and DeviceOrientation permissions and
  derives tilt from motion when orientation is silent; pointer/drag is the universal path.
- SuperRare HTML `animation_url` support: **publicly unconfirmed** — ask the team.
- Volatile: OpenSea OS2 (Feb 2025 rebuild) sandbox/allow attributes are undocumented;
  verify empirically on a live listing before locking the NFT-side design.

## Hosting

- IPFS (canonical `ipfs://` URI, single directory CID, relative paths, needs pinning)
  and/or Arweave (pay-once permanence) for NFT assets; GitHub Pages for the site.

# upperdeckripmaster3030 — project memory

*Read this first. It's the durable context for the $UR3030 launch. Canonical detail
lives in `docs/ECONOMIC-FLOW.md`; this file is the map.*

## What it is
A **liquid trading-card game** — one word, on purpose (amplifies the meme + the clearance
joke; keep the name). ⚑ **NAME LAW (artist directive 2026-07-24): "upperdeckripmaster3030"
— ONE word, lowercase, EVERYWHERE.** Never "Upperdeck Ripmaster 3030". The Sepolia test
ERC-20 has the title-case name() baked in (unfixable post-deploy) — the **launch token
MUST be deployed with name "upperdeckripmaster3030"**. Artist: **Gianni Arone (lovebeing / @_lovebeing_)**, SuperRare
**Liquid Editions — Cohort 01**. Site: **upperdeckripmaster3030.com** (Vercel, deploys from
`main`).

## Launch
- **Target: August 6, 2026 · 11:11 PM ET** (= `2026-08-07T03:11:00Z`, EDT/UTC-4). Full real
  launch (token + lenses + site). ⚠ **Date needs confirming** — the artist said "Thursday
  Oct 6," then moved it to "August 6"; Oct 6 2026 is a Tuesday, Aug 6 is a Thursday. The
  countdown on the landing targets **Aug 6**.
- **No external security audit** (artist's call). Substitute: a **Sepolia dress rehearsal +
  internal review** are the non-negotiable safety net.
- **100 handmade cards are being made by the artist.** The cards on the site today are
  **PLACEHOLDER** (a 196-card set) — a **clean-slate to an empty deck is pending**.

## Model v2.2 (canonical: `docs/ECONOMIC-FLOW.md`)
- **$UR3030** — one ERC-20 SuperRare Liquid Edition, **mint-once**, cap **3,030,000**, opens
  ~1 RARE/token; **burns permanent**; deflates **~3× → ~1.01M floor**, driven only by packs.
- **Every card is a LENS** = a render keyed by card id on **one combined renderer + ERC-721
  lens contract**. **ERC-721 only — ERC-1155 is nixed.**
- **Deck = 100 cards:** **33 hero 1/1s** minted (11 gacha pack-claims + 22 earned Season-1
  game titles) + **67 render-only field lenses** (mint later) + **Lovebeing**, a
  **holder-bound lens** (one per wallet, non-transferable, non-burnable). The 33 are a
  **Season-1 genesis set** that persists all seasons.
- **Packs:** ~$7 escalating buy-and-burn, ~3,560 over 4 seasons (S1 1,600 → S4 260).
- **Games:** wager **$UR3030 + cards** into a pot; a **small ~10% rake burns** (deflationary,
  real on-chain via `js/wager-payout.js`), the rest + cards pay the **podium 1st/2nd/3rd
  (50/30/20), 1st the most** (1v1 = winner-take-pot). Cards transfer, never burned in-game.
  Real token-pot escrow/payout = **Phase-2 721-lens contract**; today the rake burn + card
  moves are the real part. Card→power is live (`js/card-powers.js`).
- **Cards never retire/ash.** Scarcity = dwindling packs + community rarity vote + compression.

## Render contract (see `docs/RENDER-CONTRACT.md`)
- SuperRare pattern: `tokenURI()` = edition passthrough; `tokenURI(uint256 id)` = per-lens.
  First-party template **`LiquidLensMintable721SVGExample.sol`** = exactly our combined
  renderer+721. `contracts/UR3030RenderPrototype.sol` IS the passthrough renderer (done).
  **To build:** the render-by-id lens contract + an EIP-712 voucher mint for the 33 heroes.
- Deploy from the **artist's SuperRare-linked wallet** or it won't surface on superrare.com.
- **Open ⏳ / gating:** SuperRare's answer on **assisted-vs-self 721 deploy path** (in their
  inbox) + curve calibration. Questions drafted in `docs/AUDIT-REPLY.md`.

## Site state
- **Pre-launch admin gate** is ON (`gate.js`, injected in every page's `<head>` + the
  `build-pages.mjs` shell). Fail-closed. **Admin creds are in `gate.js`** (email +
  password). Soft veil — recommend Vercel Deployment Protection for a hard lock.
- Landing has: marquee + torches, countdown to Aug 6, and a **"What is this?" facts panel**
  (informative, not corporate).
- Public pages `whitepaper/tokenomics/audit/artist` are **generated** by
  `scripts/build-pages.mjs` — edit the source + regenerate, don't edit the HTML directly.
  PDF deck via `scripts/build-whitepaper.mjs`.

## Artist ethos (in the artist's own frame)
The trading card is the form — a **size** before it's anything (palm, phone, two sides:
a front that shows, a back that tells; sometimes it holds data and powers). Lineage:
**Rare Pepes on Bitcoin/Counterparty did it first; came up as a Fake Rares artist**,
discovered a love and a knack for making digital cards. Throughline: **MAD magazine + cereal
boxes** (picture that's joke + trophy + currency at once) → **the casino + the arcade** (the
machine that promises you win something tangible) → **the auction** (the promise of value
received). It's all **anticipation** — the rip, the pull, the reveal, the bid. The Dadaist
turn: **sometimes the thing you win is the experience itself.** So this is the **anti-casino**
— same anticipation, but the tangible prize is the having-done-it. Hence: **the token burns
so the art can live**, and the "win" in the cabinets is a title/lens/moment, not a payout.
The whole token experience is **very Dadaist** — parody the crypto/KOL/meme-coin/casino
culture as art, safely (generic archetypes, clearly satire, never deceptive).

## Working notes
- **Git:** develop on `claude/superrare-trading-cards-71ajcx` → push, then fast-forward
  `main` (`git fetch . claude/superrare-trading-cards-71ajcx:main` → push main). Commit
  trailers: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` +
  `Claude-Session:`. Never put the model id in committed artifacts.
- **Games** are self-contained HTML canvas/WebGL (dogfight, section9 + `js/section9-gl.js`,
  riprocketer, cloudracer + `js/cloudracer-gl.js`, ronin = NEON RONIN 2D ninja brawler in
  `js/ronin.js`, cards/battle + animated fight `js/card-fight.js`). Reached via `arcade.html`.
  Shared `fuse3D` 3D interceptor renderer; card powers in `js/card-powers.js`; shared game
  modules `js/{wager-payout,arena-lobby,card-hover,game-help}.js`. **NEON RONIN gates
  playable fighters behind card ownership** (rarity/trigger unlock rules in `ARCH`).
- **Headless verify:** node http server + playwright-core at
  `/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js`, chromium
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `--no-sandbox` (WebGL adds
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`).
- **NFA always** — experimental art token, can go to zero; keep the disclaimers loud.

## Dress rehearsal (2026-07-24) — buy + burn PROVEN live
- Artist wallet `0x5C3b…d89F` bought **367.17 UR3030 for 6,000 test RARE** (tx
  `0xee5424…807b85`) and site-ripped a pack, burning **350** (tx `0xba1716…1a78ff`).
  `totalSupply` = **999,650** — the first permanent burn; SuperRare's page shows it live.
- **Testnet collect UI = `dev.superrare.co`** (prod superrare.com 404s testnet tokens);
  `buyUrl()` is chain-aware. Test curve is UNCALIBRATED: 1 UR3030 ≈ 16 RARE (word order
  of `getMarketState` verified on-chain — word0 = rarePerToken; see ILiquid.sol notes).
- **Port-into-SuperRare plan:** renderer emits `animation_url` (owner-settable via
  `setAnimationUrl`) → full site in the token page's media slot; `/cabinet.html` is the
  sandbox-safe embed fallback (no gate, opt-in WC burns, null-origin tolerant;
  vercel.json serves CORS-open). Updated renderer compiled + simulated, NOT yet
  redeployed — artist deploys + clicks "Update Render Contract" on dev.superrare.co.

## Pending
- Clean-slate the placeholder deck (plan in the launch dossier / `docs`); Aug-6 launch PDF
  for the artist + SuperRare; build the render-by-id lens + voucher mint; get SuperRare's
  deploy-path answer; ingest the real 100 cards as art lands.

// Chain config the site + card pages read via window.RIPMASTER_CHAIN.
// The card foil engine falls back to mainnet gas for "network-weather" flavor;
// point this at Sepolia while testing the ballot/renderer, then flip to mainnet.
//
// After deploying with the Rare CLI (docs/TESTNET.md), paste the addresses here
// and commit — the site redeploys and starts reading real testnet state.
window.RIPMASTER_CHAIN = {
  /* ⛔ FLIPPED TO MAINNET 2026-08-06, the night $3030 deployed. Nine fields move together and a
   * PARTIAL flip does not error — chainId alone drives wantChainId() in js/wallet.js (the network
   * a collector's wallet is forced onto), which SuperRare host buyUrl() points at, and every
   * explorer link. `npm run test:name` derives the expectation from `network` and checks the other
   * eight against it, so a half-flip fails loudly instead of quietly herding people onto a
   * testnet. Written while the answer was still "sepolia", because a guard added after the flip
   * guards nothing. */
  network: "mainnet",
  label: "block",
  chainId: 1,
  // WalletConnect (mobile wallets). Free project id from https://cloud.reown.com —
  // paste it here and mobile users can connect + burn. Empty = WC option hidden,
  // injected/MetaMask still works. (js/wallet.js)
  /* ⛔ A REOWN PROJECT ID IS ALLOW-LISTED BY DOMAIN, AND THAT IS THE ONE THING THE DOMAIN
   * REDIRECT CANNOT FIX. Serving the site from a host that is not on the project's allowed list
   * does not degrade gracefully — mobile wallet connect simply fails, at the exact moment a
   * collector is trying to rip a pack. It is a dashboard setting, not a code change, so no test
   * can repair it; `npm run test:name` asserts only that this note names the LIVE host, which is
   * the most a checker can do about a fact that lives on somebody else's server.
   * ⚠ REQUIRED: ripmaster3030studios.com must be on the allowed-domains list before launch. */
  walletConnectProjectId: "8b9d15349eb2a2cd42434a8c3de9c579",   // Reown (WalletConnect) — publishable id; allow-list must include ripmaster3030studios.com
  /* $3030 taken per pack rip — half burns, half funds the studio (contracts/PackSink.sol).
   *
   * ⛔ THIS WAS 350 UNTIL 2026-08-06, AND 350 WAS THE $7-ERA NUMBER. The pricing change the
   * artist approved ("yes on pricing changes") was written into `docs/PACK-PRICING.md` and never
   * into the code — so the SITE would have charged 350 $3030, which at the MEASURED $0.08 open
   * is about $28, against an approved tier-I price of $10. ⚑ The docs and the code disagreed on
   * the one number a collector actually pays, and the docs are not what runs.
   *
   * ⚑ THE PACK IS A DOLLAR TARGET; THE TOKEN COUNT IS DERIVED FROM IT. Tier I is $10, and
   * $10 / $0.08 = 125. Later tiers ($12 / $15 / $20) are re-derived from the LIVE token price on
   * the day each one opens and then LOCKED for that tier — so this value changes exactly four
   * times, and only ever at a tier boundary. `npm run test:name` pins it against the tier table
   * in docs/PACK-PRICING.md so the two cannot drift apart again.
   *
   * ⚠ DO NOT "round it to a nicer number". The dollar target is the product decision; the token
   * count is arithmetic against a price nobody controls. */
  packBurn: 125,
  /* ── TREASURY (artist directive) ────────────────────────────────────────────────────────
   * The studio wallet. A PUBLIC ADDRESS is not a credential, and this one has to be public
   * anyway: it ships to the browser and it is the address collectors verify the split against.
   *
   * ⛔ THIS VALUE BECOMES PackSink's `treasury` CONSTRUCTOR ARGUMENT, WHICH IS `immutable`.
   * Half of every pack and half of every game rake go here, permanently. A wrong address is not
   * a setting to change later — it is a redeploy, and every split paid in the meantime is gone.
   *
   * ⚠ IT WAS THE SEPOLIA DEPLOYER (0x5C3b…d89F) UNTIL 2026-08-06. That is the
   * testnet wallet; on mainnet it would have sent studio revenue to a testnet-era address while
   * js/eth-play.js was already paying the arcade fee to the SuperRare wallet — two destinations
   * for one studio's money. Artist's call: use the SuperRare-account wallet, so all studio
   * revenue lands in one place and matches the identity that deploys the edition.
   *
   * ✅ AND IT IS A COLD WALLET — artist's call, 2026-08-06. This is a Ledger address that signs
   * NOTHING here, which is what makes it free: `_split()` PUSHES with `token.transfer(treasury,…)`
   * and `flush()` is permissionless, so the treasury is a pure RECEIVER. Cold storage costs the
   * mechanism nothing and removes the one key whose balance only ever grows.
   * ⚑ THE WALLET IT REPLACED WAS THE OPPOSITE PROFILE: the SuperRare account wallet must be HOT
   * (it signs the edition deploy, it connects to sites, it owns the lens). Putting a
   * monotonically-accumulating slug behind a hot key is the combination worth avoiding, and
   * `immutable` means deploy day was the only moment it was free to change.
   * ⚠ The DEPLOY wallet is a separate question and is unaffected: the edition must still be
   * deployed from the SuperRare-account wallet or the drop never associates with the profile. */
  treasury: '0x8455cF296e1265b494605207e97884813De21950',
  /* Pack purchase split — half burns, half funds the studio. See docs/TREASURY.md for why this
   * CANNOT be done as two client-side transactions. */
  packSplit: { burn: 0.50, treasury: 0.50 },
  /* How many packs/antes one `approve` should cover, so a player isn't signing an approval before
   * every rip. NOT unlimited on purpose — see the note in js/wallet.js. */
  approveBatch: 12,
  /* CORS-open public RPCs (sandboxed iframes need any/null-origin CORS; see docs/RESEARCH-NOTES.md).
   *
   * ⛔ TWO OF THE THREE HERE WERE DEAD ON LAUNCH NIGHT AND THE FAILOVER HID IT. Ankr answers
   *   every request with "authenticate with an API key" and Cloudflare with "cannot fulfill
   *   request" — both as HTTP 200 carrying a JSON-RPC `error` object. Callers here check
   *   `if (j.result)` rather than catching, so they correctly fell through and the site read fine
   *   off the one survivor. ⚑ That is the trap: a working fallback chain and a broken fallback
   *   chain look identical from the outside, right up until the survivor throttles and the whole
   *   site reads as a token with no supply and no holders. Depth you have never exercised is
   *   depth you do not have.
   * ⚠ Verified 2026-08-06 by an eth_call against the live edition, not by reputation: all four
   *   returned the SAME totalSupply and all four send `access-control-allow-origin: *`. Agreement
   *   across independent endpoints is the check — one lying is visible, all four lying is not a
   *   failure mode worth designing against.
   * ⚠ Rejected in the same sweep, so nobody re-adds them: llamarpc and blockpi (521), flashbots
   *   (eth_call not whitelisted — it is a relay, not a read node), 1rpc (plan limit reached). */
  rpcs: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.drpc.org",
    "https://rpc.mevblocker.io",
    "https://eth.merkle.io",
  ],
  // Pure Liquid Edition: just the ERC-20 token + its render contract. No ballot/vault
  // contracts (see docs/LAUNCH-ARCHITECTURE.md). Fill these after the Sepolia deploy
  // (docs/TESTNET.md) and commit — the site starts reading real testnet state.
  contracts: {
    /* ✦ $3030 ON ETHEREUM MAINNET — deployed 2026-08-06, block 25,697,191, tx 0xe983b77e…9f2c,
     * from 0x432D71bA…59d166c9 (the SuperRare account wallet, so the drop associates with the
     * artist profile). Verified on-chain, not taken from the CLI's own output: name() reads
     * `ripmaster3030`, symbol() `3030`, maxTotalSupply() 3,030,000, decimals 18. */
    liquidEdition: "0x1D4bcbb505182a49303CC3B23EfF1E3157147A33",
    // LIVE renderer — read off the edition itself (edition.renderContract()) on 2026-07-27,
    // not from memory. This is the artist's updated deploy: name() is lowercase, it emits
    // animation_url framing the site, and $3030-per-RARE reads 0.06 rather than the 0 the
    // previous build truncated to. Superseded 0xEB5Dc231…FDFF7, which is an older prototype.
    /* ✦ MAINNET renderer, 2026-08-06 — READ OFF edition.renderContract(), never from a note.
     * Its animation_url frames https://www.ripmaster3030studios.com/superrare.html, the
     * WALLET-FREE embed. ⛔ NOT the site root: index.html loads pack.js and js/wallet.js, and
     * framing that inside a marketplace is what SuperRare's security team flagged. The Sepolia
     * renderer pointed at the root of the RETIRED domain and nobody noticed for three weeks. */
    /* ⚠ SUPERSEDED 2026-08-06, and the reason is worth keeping: 0xeAbdfb01… published
     *   "Burned % 0" because `pctBps / 100` is an integer divide and pctBps was 1. Replaced by
     *   0x3175419A…, wired with setRenderContract and read back off the EDITION rather than
     *   trusted from here — which is the standing rule, and the rule that caught this file
     *   carrying a superseded Sepolia renderer once already. */
    renderContract:"0x3175419A532e3e6adC5a31DbEE6A3C2F08745E9D",
    // Phase-2 combined renderer + 721 lens contract. Empty until it's deployed — the
    // collector seat door (js/session.js) falls back to the local vault and marks itself
    // unverified rather than pretending a localStorage array is proof of ownership.
    /* ✦ DEPLOYED ON MAINNET 2026-08-06, tx 0xa3cf618f…c096, owner 0x432D71bA…59d166c9,
     * claim signer 0x42A6baD4…eb049 — DIFFERENT KEYS, which is the property the two-argument
     * constructor exists for and the only one that cannot be fixed afterwards. setEdition wired in
     * a second transaction (0x52d35d32…36e2), so staking reads real balances rather than silently
     * rendering every card at tier 0.
     * ⚑ Proven by reading the chain, not the deploy page: tokenURI(40) returns metadata for a
     * FIELD card with no mint at all — Deck "Genesis", Class "Field Lens", Holding/Tier present,
     * Minted "no". That single call proves render-by-id, the seasons→tiers fix surviving into
     * on-chain metadata, and setEdition having taken, all at once.
     * ⚠ A SECOND LENS EXISTS AT 0x938fa651…32d1c AND MUST NEVER BE USED. It was deployed minutes
     * earlier with MetaMask on the claim signer, so its owner IS the hot signing key. It is inert:
     * it owns nothing, nothing references it, and this line is the only place the site could ever
     * have pointed. Recorded so nobody later finds it on-chain and assumes it is the real one. */
    lens721:       "0xe2d11bC2f0122Be198a6e102fD2567888878e138",
    /* contracts/PackSink.sol — the atomic 50/50 splitter for pack payments and game rakes.
     * ⚠ EMPTY = every split path in js/wallet.js falls back to a plain 100% burn, exactly as
     * lens721:"" degrades the collector seat. That is deliberate (nothing half-executes), but it
     * also means THE SITE COPY IS AHEAD OF THE CODE until this is filled in: the pages say half
     * funds the studio and, with this empty, all of it burns. Deploy, paste, rehearse on Sepolia.
     * The UI reads RipWallet.hasSink() and says which is actually happening. */
    /* ✦ DEPLOYED ON MAINNET 2026-08-06, tx 0x150a6a01…a09e, from 0x432D71bA…59d166c9.
     * Verified independently of the deploy page's own success message: token() is the $3030
     * edition, treasury() is the COLD wallet, BURN_BPS is 5000, and the deployed runtime is
     * BYTE-IDENTICAL to our compiled source once the three `immutable` injection sites are masked
     * back to their zero placeholders — which is the strongest form this check takes, because a
     * transaction landing and a transaction landing with the RIGHT arguments are different facts.
     * ⚑ Before this line existed, the first real mainnet rip burned 125 $3030 and paid the studio
     * NOTHING — measured, not feared: totalSupply fell by exactly 125 while the treasury stayed at
     * 0. That is the documented fallback behaving correctly, and it is what this one edit ends. */
    packSink:      "0x384936Ee3Baf9B81715117d180Ca2aA4abe6018E",
  },
  // ── SEATS (js/session.js) ──────────────────────────────────────────────────────────
  // $3030 needed to seat yourself as a HOLDER. Entry only — it is never spent or
  // burned, it is just read. Set > 0 so seats can't be farmed by splitting dust across
  // wallets; the holder-bound Lovebeing lens is the stronger fix once it exists.
  holderMin: 1,
  // Base L2 public RPC, read-only. The VISITOR door verifies arcade-fee receipts here,
  // independently of whatever chain the player's wallet is currently pointed at.
  baseRpcs: [
    "https://mainnet.base.org",
  ],
  // Sepolia Liquid Factory + RARE, from the starter kit (verified July 2026):
  /* ✦ THE LIVE MARKET — the edition graduated to a DEX, which docs/ECONOMIC-FLOW.md had carried
   * as "timing unknown" since 2026-08-01. Uniswap **v4**, reserve in RARE, on Ethereum mainnet.
   *
   * ⛔ THIS IS A POOL ID, NOT AN ADDRESS — 32 bytes / 66 characters, where an address is 20 / 42.
   *   A v4 pool is not a contract: liquidity lives in the singleton PoolManager and a pool is
   *   identified by the hash of its key. So it must never be fed to `explorerAddr()`, and any
   *   check that validates it with the repo's usual `^0x[0-9a-fA-F]{40}$` will reject a perfectly
   *   correct value. It is a market identifier and nothing else.
   *
   * ⚑ VERIFIED IN BOTH DIRECTIONS BEFORE IT WAS PUBLISHED, which is the standard `protocol.rare`
   *   set when it was the one value the repo held only truncated. DexScreener's API for this pool
   *   returns baseToken 0x1D4bcbb5…47A33 — EXACTLY `contracts.liquidEdition` — with name
   *   `ripmaster3030` and symbol `3030`, and quoteToken 0xba5BDe66…296350, EXACTLY
   *   `protocol.rare`. A chart link is a claim about which market is ours; pasting one without
   *   checking is how a site sends its own collectors to somebody else's token.
   * ⚑ AND IT CONFIRMED THE OPEN. It priced at $0.07957 against the ≈$0.08 SuperRare measured off
   *   the mainnet `--preview`, and an FDV of $241,118 against `npm run model`'s $242,400 — inside
   *   0.5%. The number the whole pack schedule was re-derived from is the number the market made.
   *
   * ⚠ ONE DECLARATION. `chart` is BUILT from `poolId` at read time (see RipWallet.chartUrl) rather
   *   than stored beside it, because two copies of a 66-character hex string is two chances to
   *   ship a link to the wrong market and no way to notice. */
  market: {
    poolId: "0x7943d0d19a67d2185de840d8cf057b21f67b60bf442a4a727f66551ac1cd7ab6",
    chartHost: "https://dexscreener.com/ethereum/",
  },

  protocol: {
    // Mainnet multicurve factory — the `Factory:` line the deploy printed, 2026-08-06.
    liquidFactory: "0x25f993C222fE5e891128a782A5168f1C78629540",
    /* ⛔ THE RESERVE TOKEN, AND THE ONE VALUE THE REPO ONLY EVER HELD TRUNCATED (0xba5BDe66…6350).
     * A wrong reserve token is not a typo, it is the pool pointing at the wrong asset, so this was
     * VERIFIED rather than completed from memory: this address returns symbol() "RARE" and name()
     * "SuperRare" on mainnet, AND matches the recorded prefix and suffix. Two independent
     * directions agreeing is the standard this number needed. */
    rare:          "0xba5BDe662c17e2aDFF1075610382B9B691296350",
  },
};

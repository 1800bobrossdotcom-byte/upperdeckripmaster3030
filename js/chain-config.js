// Chain config the site + card pages read via window.RIPMASTER_CHAIN.
// The card foil engine falls back to mainnet gas for "network-weather" flavor;
// point this at Sepolia while testing the ballot/renderer, then flip to mainnet.
//
// After deploying with the Rare CLI (docs/TESTNET.md), paste the addresses here
// and commit — the site redeploys and starts reading real testnet state.
window.RIPMASTER_CHAIN = {
  network: "sepolia",              // "sepolia" while testing, "mainnet" for S1
  label: "sepolia block",
  chainId: 11155111,               // Sepolia (mainnet = 1)
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
  // CORS-open public RPCs (sandboxed iframes need any/null-origin CORS; see docs/RESEARCH-NOTES.md)
  rpcs: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://rpc.sepolia.org",
  ],
  // Pure Liquid Edition: just the ERC-20 token + its render contract. No ballot/vault
  // contracts (see docs/LAUNCH-ARCHITECTURE.md). Fill these after the Sepolia deploy
  // (docs/TESTNET.md) and commit — the site starts reading real testnet state.
  contracts: {
    liquidEdition: "0xdc47e98b35Da73956fa7cCD450f8feEA746Ec83C", // Sepolia deploy 2026-07-19 (rare liquid-edition deploy multicurve)
    // LIVE renderer — read off the edition itself (edition.renderContract()) on 2026-07-27,
    // not from memory. This is the artist's updated deploy: name() is lowercase, it emits
    // animation_url framing the site, and $3030-per-RARE reads 0.06 rather than the 0 the
    // previous build truncated to. Superseded 0xEB5Dc231…FDFF7, which is an older prototype.
    renderContract:"0x948E633054c516253D21d313aC789B37935de903", // Sepolia, artist deploy (verified on-chain 2026-07-27)
    // Phase-2 combined renderer + 721 lens contract. Empty until it's deployed — the
    // collector seat door (js/session.js) falls back to the local vault and marks itself
    // unverified rather than pretending a localStorage array is proof of ownership.
    lens721:       "",
    /* contracts/PackSink.sol — the atomic 50/50 splitter for pack payments and game rakes.
     * ⚠ EMPTY = every split path in js/wallet.js falls back to a plain 100% burn, exactly as
     * lens721:"" degrades the collector seat. That is deliberate (nothing half-executes), but it
     * also means THE SITE COPY IS AHEAD OF THE CODE until this is filled in: the pages say half
     * funds the studio and, with this empty, all of it burns. Deploy, paste, rehearse on Sepolia.
     * The UI reads RipWallet.hasSink() and says which is actually happening. */
    packSink:      "",
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
  protocol: {
    liquidFactory: "0xb1777091C953fa2aC1fD67f2b3e2f61343F5Ce5e",
    rare:          "0x197FaeF3f59eC80113e773Bb6206a17d183F97CB",
  },
};

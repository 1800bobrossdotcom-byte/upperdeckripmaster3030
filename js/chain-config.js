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
  walletConnectProjectId: "8b9d15349eb2a2cd42434a8c3de9c579",   // Reown (WalletConnect) — publishable id; domain-allowlisted to upperdeckripmaster3030.com
  // $UR3030 burned per pack rip (the "buy the ticket" — deflationary). Real price;
  // note the uncalibrated Sepolia test curve prices 1 UR3030 at ~16 RARE, so a
  // pack ≈ 5,700 test RARE (the rehearsal wallet was funded accordingly).
  packBurn: 350,
  /* ── TREASURY (artist directive) ────────────────────────────────────────────────────────
   * The studio wallet. A PUBLIC ADDRESS is not a credential — this is the same wallet that
   * already appears in docs/TESTNET.md and docs/LENS-REHEARSAL.md as owner()/deployer, so it
   * is recorded here rather than hidden.
   * ⚠ IT IS ALSO THE DEPLOYER AND CONTRACT OWNER, and those are different risk profiles: a
   * treasury accumulates a balance worth stealing, while an owner key can repoint every card.
   * CLAUDE.md already makes this argument for keeping the claim signer separate from the owner;
   * the same reasoning says a treasury should be its own address. Worth changing before real
   * money flows through it — it is one config line now and a migration later. */
  treasury: '0x5C3bc6dD6d5b9913d267527275dD95ceB235d89F',
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
    // animation_url framing the site, and UR3030-per-RARE reads 0.06 rather than the 0 the
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
  // $UR3030 needed to seat yourself as a HOLDER. Entry only — it is never spent or
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

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
  // $UR3030 burned per pack rip (the "buy the ticket" — deflationary).
  // ⚠ TESTNET REHEARSAL VALUE: the uncalibrated Sepolia test curve prices 1 UR3030
  // at ~16 RARE, so 350 would cost ~5,600 test RARE. 2 keeps the full buy→rip→burn
  // loop affordable on ~100 test RARE. RESTORE 350 FOR THE CALIBRATED LAUNCH DEPLOY.
  packBurn: 2,
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
    renderContract:"0xEB5Dc23130A7E422239a99493A12dB586feFDFF7", // Sepolia render prototype (set-render-contract 2026-07-19)
  },
  // Sepolia Liquid Factory + RARE, from the starter kit (verified July 2026):
  protocol: {
    liquidFactory: "0xb1777091C953fa2aC1fD67f2b3e2f61343F5Ce5e",
    rare:          "0x197FaeF3f59eC80113e773Bb6206a17d183F97CB",
  },
};

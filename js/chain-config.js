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
  // CORS-open public RPCs (sandboxed iframes need any/null-origin CORS; see docs/RESEARCH-NOTES.md)
  rpcs: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://rpc.sepolia.org",
  ],
  contracts: {
    liquidEdition: "0x0000000000000000000000000000000000000000", // rare liquid-edition deploy → address
    seasonBallot:  "0x0000000000000000000000000000000000000000", // SeasonBallot deploy → address
    renderContract:"0x0000000000000000000000000000000000000000", // set-render-contract → address
    cardVault:     "0x0000000000000000000000000000000000000000", // CardVault deploy → address (CARD-ECONOMY-SPEC.md)
  },
  // Sepolia Liquid Factory + RARE, from the starter kit (verified July 2026):
  protocol: {
    liquidFactory: "0xb1777091C953fa2aC1fD67f2b3e2f61343F5Ce5e",
    rare:          "0x197FaeF3f59eC80113e773Bb6206a17d183F97CB",
  },
};

# Testnet wiring — Sepolia

Get the token, the ballot, and the renderer live on Sepolia before mainnet.
Everything here uses the Rare CLI (verified July 2026) and needs a **funded
Sepolia wallet** — the deploy itself is the one step I can't run for you (it
signs with your private key), but every command is ready to paste.

> Golden rule (from the CLI guide): deploy the Liquid Edition from the **wallet
> connected to your SuperRare artist profile**, or the drop won't surface on it.

## 0. Prerequisites

- Node.js 22+
- A Sepolia wallet with test ETH ([sepoliafaucet.com](https://sepoliafaucet.com) or Alchemy's faucet)
- Some Sepolia RARE to seed the pool (ask @im_jonooo / the cohort where to get it)
- An Alchemy or Infura Sepolia RPC URL (public RPCs are rate-limited)
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`) for the ballot contract

## 1. Install + configure the Rare CLI

```bash
npm install -g @rareprotocol/rare-cli
rare --help
rare liquid-edition --help          # confirm subcommands (docs lag npm; latest is v2.0.0)

# store your deployer key (1Password reference recommended; plaintext shown for testnet)
rare configure --chain sepolia --private-key 0xYOUR_SEPOLIA_KEY
rare configure --chain sepolia --rpc-url https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
rare configure --show
```

## 2. Deploy the Liquid Edition token

```bash
# preview the bonding curve first — never deploy blind
rare liquid-edition deploy multicurve "Upperdeck Ripmaster 3030" "UDR" \
  --curve-preset medium-demand \
  --description "A liquid trading card game of psychedelic hyperfoil cartoon spirits." \
  --image ./cards/art/the-card-01.png \
  --preview

# when the curve looks right, deploy for real
rare liquid-edition deploy multicurve "Upperdeck Ripmaster 3030" "UDR" \
  --curve-preset medium-demand \
  --description "A liquid trading card game of psychedelic hyperfoil cartoon spirits." \
  --image ./cards/art/the-card-01.png \
  --yes
```

Note the printed **contract address** → paste into `js/chain-config.js`
(`contracts.liquidEdition`).

## 3. Deploy the SeasonBallot (burn-to-vote)

```bash
# one-time Foundry setup
forge init --force --no-git .
forge install OpenZeppelin/openzeppelin-contracts

# deploy the ballot, pointing at the token from step 2
forge create contracts/SeasonBallot.sol:SeasonBallot \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_KEY \
  --constructor-args <LIQUID_EDITION_ADDRESS>
```

Paste the ballot address into `js/chain-config.js` (`contracts.seasonBallot`).
Then open the first season (card IDs are the deck numbers, e.g. 1..16; close
block ≈ now + ~2 weeks of Sepolia blocks):

```bash
cast send <BALLOT_ADDRESS> \
  "openSeason(uint32,uint32[],uint64)" 1 "[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]" <CLOSE_BLOCK> \
  --rpc-url $SEPOLIA_RPC --private-key $DEPLOYER_KEY
```

## 4. Deploy + wire the render contract

The Living Pack's artwork comes from a render contract that reads
`SeasonBallot.tally(...)` and `burnProgress()`. Start from the starter kit's
`LiquidLensHTMLExample.sol` (it returns HTML metadata — same foil engine as our
cards):

```bash
# clone the starter kit for the interfaces + example renderers
git clone https://github.com/superrare/liquid-editions-starter-kit
# build your renderer against ILiquid + SeasonBallot, deploy it, then:
rare liquid-edition set-render-contract \
  --contract <LIQUID_EDITION_ADDRESS> \
  --render-contract <RENDER_ADDRESS> \
  --chain sepolia
```

Paste the render address into `js/chain-config.js` (`contracts.renderContract`).

## 5. Point the site at Sepolia

`js/chain-config.js` already targets Sepolia. Include it before the card scripts
if you want the card backs' "trigger status" to read Sepolia gas instead of
mainnet — add to any page's `<head>`:

```html
<script src="/js/chain-config.js"></script>
```

(The card pages read `window.RIPMASTER_CHAIN` if present and fall back to mainnet
gas otherwise, so this is optional until the contracts are live.)

## 6. Dress rehearsal, then mainnet

Run a full fake season on Sepolia (open ballot → burn-vote from a couple of
wallets → lock at the close block → read `winners()` → mint the lens pack) before
touching mainnet. Checklist lives in `docs/MECHANICS.md §9`.

Bonus: `rare mcp serve` exposes the protocol over MCP — you can connect me
directly to run these deploys and status checks during development instead of
copy-pasting.

## Status

- [x] `SeasonBallot.sol` written (burn-to-vote, winners, burn progress)
- [x] `js/chain-config.js` scaffolded (Sepolia + starter-kit factory/RARE addresses)
- [ ] Fund a Sepolia wallet + get Sepolia RARE
- [ ] `rare liquid-edition deploy multicurve … --preview` then `--yes`
- [ ] Deploy SeasonBallot, open season 1
- [ ] Deploy + `set-render-contract`
- [ ] Full fake-season rehearsal

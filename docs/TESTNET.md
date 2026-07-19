# Sepolia dress rehearsal — a first-timer's walkthrough

**Goal:** deploy the `$UR3030` Liquid Edition to **Sepolia** (Ethereum's free practice
network) and do a full mock run — buy some tokens, burn them (a "rip"), watch the
render change — *before* we ever touch real money on mainnet.

**This is safe.** Sepolia coins are worthless test tokens you get for free from a
faucet. You cannot lose real money here. The only hard rule is the same one as
everywhere in crypto: **never paste your seed phrase or private key into a website,
a chat, or anyone's DM — including mine.** I never need it and never ask for it.

We ship a **pure Liquid Edition**: one ERC-20 token + a render contract. There is no
ballot contract, no vault contract, nothing else to deploy. That keeps this short.

---

## Who does what

| Step | You | Me |
|---|---|---|
| Make a throwaway "deployer" wallet | ✅ (2 min) | — |
| Get free Sepolia test-ETH | ✅ (2 min) | — |
| Get a free Alchemy RPC key | ✅ (5 min) | — |
| Install Node 22 + the Rare CLI | ✅ (I give exact commands) | — |
| Run the deploy command | ✅ (you sign; it's your key) | I write the exact command |
| Paste the printed contract address back to me | ✅ (copy/paste) | — |
| Wire the address into the site + build the render + rip flow | — | ✅ |

The single thing only you can do is the deploy itself — it's signed by your wallet's
private key, which lives only on your machine. Everything around it, I do.

### Wallets on record
- **Mainnet / SuperRare artist wallet:** `0x432D71bA14D2602B566dD9e3e098E24859d166c9`
  — the real Season-1 edition **must** be deployed from this address so it surfaces
  on the SuperRare.com profile (the golden rule). Public address only; the key stays
  with the artist.
- **Sepolia deployer:** a *fresh throwaway* wallet (TBD) — do **not** load the
  mainnet key above into a plaintext testnet CLI config. Testnet doesn't surface on
  the profile, so a burner is both correct and safer.

---

## Your shopping list (get these 4 things first)

### 1. A throwaway wallet ("deployer")
Install the **MetaMask** browser extension (metamask.io). Create a **brand-new
account** just for this test — don't use a wallet that holds anything real.
- In MetaMask, switch the network dropdown to **Sepolia** (turn on "Show test
  networks" in Settings → Advanced if you don't see it).
- Copy your new address (starts with `0x…`). That's your **deployer address** —
  safe to share with me.
- Your **Secret Recovery Phrase / private key stays with you.** Write it down
  offline. Never type it anywhere online.

### 2. Free Sepolia test-ETH (to pay gas)
Every action costs a tiny "gas" fee, paid in test-ETH. Get some free:
- **Google Cloud faucet:** https://cloud.google.com/application/web3/faucet/ethereum/sepolia
- or **Alchemy faucet:** https://sepoliafaucet.com (needs a free Alchemy login)
Paste your deployer address, request ~0.5 Sepolia ETH. It arrives in a minute.

### 3. A free RPC key (your private door to the network)
An "RPC" is just the URL your tools use to talk to Ethereum. Public ones are
slow/flaky, so grab a free dedicated one:
- Sign up at **alchemy.com** (free), create an app, choose **Ethereum → Sepolia**.
- Copy the **HTTPS URL** it gives you — looks like
  `https://eth-sepolia.g.alchemy.com/v2/XXXXXXXX`.
This URL is *slightly* sensitive (it's your quota). Paste it into your terminal;
sharing it with me here for setup is fine.

### 4. Node.js 22+
The CLI needs Node 22 or newer. Check with `node -v`. If it's older or missing,
install from nodejs.org (LTS) or via `nvm install 22`.

> **Sepolia RARE?** Seeding the pool with reserve RARE is optional for a first
> smoke test; the cohort can point you to test RARE if we want a funded curve. We
> can skip it for the very first deploy and add it on a second pass.

---

## The flow (once you have the 4 things)

### Step 1 — install + configure the CLI
```bash
npm install -g @rareprotocol/rare-cli
rare --help                                   # confirms it installed
rare liquid-edition --help                    # confirms the deploy subcommand

# point it at Sepolia, your key, your RPC (run these in YOUR terminal only)
rare configure --chain sepolia --private-key 0xYOUR_DEPLOYER_KEY
rare configure --chain sepolia --rpc-url https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
rare configure --show                         # keys show masked — good
```
*Storing the key in 1Password instead of plaintext is nicer (`--private-key-ref
op://…`), but plaintext is fine for a throwaway testnet wallet.*

### Step 2 — preview the token, then deploy it
**Always `--preview` first** — it shows the bonding curve without spending anything.
```bash
rare liquid-edition deploy multicurve "Upperdeck Ripmaster 3030" "UR3030" \
  --curve-preset medium-demand \
  --description "A liquid trading-card game of psychedelic hyperfoil cartoon spirits." \
  --image ./marquee-header.webp \
  --preview
```
When the curve looks right, run the **same line with `--yes`** instead of `--preview`.
Your key signs it, and after a minute the CLI prints a **contract address** (`0x…`).

**→ Copy that address and send it to me.** That's the whole handoff.

### Step 3 — I take it from there
With the address I will:
1. paste it into `js/chain-config.js` so the live site starts reading real Sepolia
   state (block, price, supply, burn progress);
2. build + deploy the **render contract** — the `tokenURI()` that turns live market
   state into the card art, from SuperRare's
   [starter-kit examples](https://github.com/superrare/liquid-editions-starter-kit/tree/main/src/examples) —
   and wire it with `rare liquid-edition set-render-contract`;
3. wire the site's **"rip a pack"** button to the real thing — connect wallet on
   Sepolia → **buy ~350 `$UR3030` on the curve → `burn()` it** — so a rip becomes a
   real on-chain buy+burn instead of the current local demo;
4. we then run the full mock season together: rips, watch the burn-progress
   milestones retire cards, check the holding-threshold states.

---

## Notes & gotchas
- **Docs vs npm:** the CLI moves fast; if a flag differs, `rare liquid-edition
  deploy --help` is the source of truth. Paste me what it prints and I'll adjust.
- **Golden rule (for mainnet later, not now):** the *real* S1 drop must be deployed
  from the wallet linked to your SuperRare artist profile, or it won't surface on
  SuperRare.com. For Sepolia practice, the throwaway wallet is correct and safer.
- **If a command errors,** copy the whole message to me — testnet errors are
  usually "out of gas" (get more from the faucet) or "wrong network" (re-run
  `rare configure --show`).
- **Optional power move:** `rare mcp serve` exposes the protocol over MCP. If you
  run it, you can connect me to it directly and I can run the status checks /
  reads with you instead of copy-pasting outputs back and forth.
- **When we go to mainnet,** we repeat this with real ETH/RARE and your
  SuperRare-linked wallet, and flip `js/chain-config.js` `network` to `"mainnet"`.

---

## Status
- `js/chain-config.js` is pre-filled with the Sepolia Liquid Factory + RARE
  addresses and `network: "sepolia"`; the `liquidEdition` / `renderContract`
  address slots are zero until you deploy (Step 2) and hand me the address.

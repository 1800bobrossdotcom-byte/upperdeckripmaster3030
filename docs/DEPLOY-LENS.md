# How to deploy the lens contract

*`contracts/Ripmaster3030Lens721.sol` — the ERC-721 that holds the 33 hero 1/1s and renders all 100
cards. Deploy to **Sepolia first**. Full rehearsal: `docs/LENS-REHEARSAL.md`.*

---

## Before you touch a wallet

Two things are worth knowing up front.

**The lens is forgiving; the edition is not.** If you deploy a bad lens, you redeploy and
change one address in `js/chain-config.js`. Nothing is lost. So deploy early, deploy on
Sepolia, and break it there.

**You need two addresses, not one.**

| | what it does | should be |
|---|---|---|
| **deployer / owner** | admin — can retarget the renderer, register card art | your SuperRare-linked wallet, `0x5C3bc6dD…35d89F` |
| **claim signer** | signs hero vouchers all season | **a different wallet** |

They *can* be the same address and the contract will work. Don't. The signer is a hot key
you'll use repeatedly to issue claims; the owner can rewrite what every card points at. If
the signer leaks and it's also the owner, someone can repoint the whole deck. `verify` warns
you when they match. You can change the signer later with `setClaimSigner`.

---

## Route A — Remix (recommended)

Your private key never leaves MetaMask. Nothing gets typed into a terminal.

**1. Get the flattened contract**

```bash
node scripts/flatten.mjs contracts/Ripmaster3030Lens721.sol
```

Writes `contracts/build/Ripmaster3030Lens721.flat.sol` — one file, 19 sources inlined. The script
recompiles it and refuses to write unless the **executable bytecode is byte-identical** to
the normal build, so the flat file can't silently be a different contract. (The trailing
metadata hash does differ — it hashes source paths, so flattening necessarily changes it.
That's expected and reported separately.)

**2. Paste it into Remix**

- Go to <https://remix.ethereum.org>
- New file → paste the whole flat file
- **Solidity Compiler** tab:
  - Compiler **0.8.24** (the file's pragma says `^0.8.24` — don't pick lower)
  - Advanced Configurations → **Enable optimization, 200 runs**
  - Compile
- It should compile with **0 warnings**

**3. Deploy**

- **Deploy & Run** tab → Environment: **Injected Provider – MetaMask**
- Check MetaMask is on **Sepolia**
- Contract: `Ripmaster3030Lens721`
- Expand the constructor and fill six fields **in this order**:

| # | field | value |
|---|---|---|
| 1 | `name_` | `upperdeckripmaster3030 lens` |
| 2 | `symbol_` | `3030L` |
| 3 | `editionRenderer_` | `0x948E633054c516253D21d313aC789B37935de903` |
| 4 | `claimSigner_` | *your signer address — not the deployer* |
| 5 | `externalUrl_` | `https://upperdeckripmaster3030.com` |
| 6 | `lensBaseUrl_` | `https://upperdeckripmaster3030.com/cards/hero/` |

⚑ `editionRenderer_` above is the **live** renderer, read off `edition.renderContract()` on
2026-07-27 — not the older `0xEB5Dc231…FDFF7` that some docs used to carry. If in any doubt,
re-read it rather than trusting this table:

```bash
cast call 0xdc47e98b35Da73956fa7cCD450f8feEA746Ec83C "renderContract()(address)" --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

- Press **Deploy**, confirm in MetaMask, copy the deployed address.

**4. Read it back**

```bash
node scripts/lens-cli.mjs verify --at 0x<your new lens>
```

No key needed. It prints owner, signer, renderer, the edition passthrough, and per-card
metadata for ids 1 / 7 / 34 / 42 / 100. Send me that address and I'll check it too.

---

## Route B — command line

Faster if you're comfortable with a key in your shell. Same result.

```bash
npm install                                  # pulls solc, viem, OZ from package.json
npm run test:lens                            # 31/31 locally BEFORE spending gas

export PRIVATE_KEY=0x…                       # your shell only. never commit, never paste in chat
node scripts/lens-cli.mjs deploy \
  --renderer 0x948E633054c516253D21d313aC789B37935de903 \
  --signer   0x<your signer address>

node scripts/lens-cli.mjs verify --at 0x<new lens>
```

---

## After it's deployed

```bash
# register card art (reads cards/hero/cids.json)
node scripts/lens-cli.mjs cards --at 0x<lens>

# issue a hero voucher — kind 1 = gacha pack-claim, 2 = earned game title
node scripts/lens-cli.mjs voucher --at 0x<lens> --to 0x<collector> --id 7 --kind 1

# the collector redeems it from their own wallet and their own gas
node scripts/lens-cli.mjs claim --at 0x<lens> --to 0x<collector> --id 7 --kind 1 \
  --deadline <n> --sig 0x…
```

Then record the address in `js/chain-config.js` under `contracts.lens721` and commit — that
switches the site's collector seat door (`js/session.js`) from the local vault to real
on-chain ownership.

---

## Things that will bite

- **Wrong compiler in Remix.** Below 0.8.24 won't compile; optimization off changes the
  bytecode and makes later verification mismatch. 0.8.24 + optimizer 200 runs.
- **Constructor field order.** Remix labels them, but two addresses sit next to each other.
  Renderer third, signer fourth. Getting these backwards deploys a contract whose
  `tokenURI()` reverts and whose vouchers all fail.
- **Deploying with the signer == deployer.** Works, and you'll regret it. See above.
- **`setCards` before pinning.** `cards/hero/cids.json` must hold real CIDs; the builder
  reports `UNPINNED` for anything missing. Registering an empty CID means `image` is null and
  the card has no permanent record.

## Verifying the source on Etherscan (optional, nice to have)

Use the same flat file, compiler 0.8.24, optimizer enabled 200 runs, and paste the
ABI-encoded constructor args. `scripts/lens-cli.mjs deploy` prints them; in Remix they're in
the deployment transaction's input data after the bytecode.

*NFA. Experimental art token — it can go to zero.*

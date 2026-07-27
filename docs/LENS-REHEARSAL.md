# LENS DRESS REHEARSAL — Sepolia

*Prove `contracts/UR3030Lens721.sol` on testnet before it holds 33 1/1s on mainnet.
Tooling: `scripts/lens-cli.mjs`. Local tests: `npm run test:lens`.*

There is **no external audit** (artist's call). This rehearsal and the internal review are
the whole safety net, so it is not optional and it is not a formality.

---

## What is already proven, without spending gas

`npm run test:lens` deploys the real bytecode to a local EVM and runs **31 assertions**:

- unminted field cards and heroes both render (the render-only path)
- `image` = `ipfs://CID`; heroes additionally carry `animation_url` as `data:text/html`
- the on-chain wrapper genuinely iframes `/cards/hero/<id>.html`
- ids outside 1…100 revert
- voucher replay rejected · `kind` swap rejected · expired voucher rejected
- field cards refuse to mint as heroes
- Lovebeing: one per wallet, transfer reverts, heroes still transferable
- **the full chain** `MockLiquid → UR3030RenderPrototype → Lens.tokenURI()`, and a 350-token
  pack burn moves the delegated render from `Burned: 0` to `Burned: 350`

What a local EVM cannot prove: real gas, real block times, the **real** Liquid Edition's
`getMarketState()` word order, and how SuperRare's UI actually treats the metadata. That is
what Sepolia is for.

## Keys

Everything that writes reads `PRIVATE_KEY` from the environment. Nothing is stored, logged
or transmitted, and `verify` needs no key at all — anyone can audit a deployed lens.

```
export PRIVATE_KEY=0x…       # in your shell. Never committed, never pasted into chat.
export RPC_URL=https://…     # optional; defaults to js/chain-config.js
```

⚑ **The voucher-signing key should not be the owner key.** `deploy --signer` takes a
separate address on purpose: the hot key that signs claims all season should not also be the
admin key that can retarget the contract. If they match, `verify` says so.

## The run

```bash
# 0. local first — never rehearse a contract that fails at home
npm run test:lens

# 1. deploy, wired to the existing Sepolia render prototype
node scripts/lens-cli.mjs deploy \
  --renderer 0xEB5Dc23130A7E422239a99493A12dB586feFDFF7 \
  --signer   0x<the voucher-signing address>

# 2. read it back — no key needed
node scripts/lens-cli.mjs verify --at 0x<lens>

# 3. register card art from cards/hero/cids.json
node scripts/lens-cli.mjs cards --at 0x<lens>

# 4. issue a hero voucher (kind 1 = gacha pack-claim, 2 = earned game title)
node scripts/lens-cli.mjs voucher --at 0x<lens> --to 0x<collector> --id 7 --kind 1

# 5. redeem it — normally the collector does this, from their own wallet and gas
node scripts/lens-cli.mjs claim --at 0x<lens> --to 0x<collector> --id 7 --kind 1 \
  --deadline <n> --sig 0x…

# 6. read it back again — id 7 should now show an owner
node scripts/lens-cli.mjs verify --at 0x<lens>
```

## What must be true before mainnet

- [ ] `tokenURI()` returns the **edition** JSON through the real Liquid Edition — not the
      mock. This is the one path local tests could only exercise against a stand-in.
- [ ] `getMarketState()` word order still matches. Word 0 vs word 1 was verified once on
      Sepolia; signatures drift. Confirm `$UR3030 per RARE` reads sanely, not 1000×off.
- [ ] `tokenURI(id)` resolves for an **unminted** field card in a real marketplace UI, not
      just via `eth_call`. Some indexers assume a mint.
- [ ] A hero's `animation_url` renders the live lens in SuperRare's media slot — the same
      thing already proven for the edition on the dev environment.
- [ ] A voucher claim works **from the collector's own wallet**, not the artist's.
- [ ] A replayed voucher fails on-chain, with real gas, exactly as it does locally.
- [ ] Lovebeing transfer fails on-chain.
- [ ] Gas for `setCards` across the full deck is affordable in one or two batches.

## Live testnet facts (read 2026-07-27)

```
sepolia edition   0xdc47e98b35Da73956fa7cCD450f8feEA746Ec83C
name()            "Upperdeck Ripmaster 3030"     ← TITLE CASE, permanent
totalSupply       999,050 UR3030   (950 burned)
```

That `name()` is the NAME LAW failure mode, already live and unfixable on the test token.
It is the single best argument for reading `name()` back off the mainnet contract **before**
any announcement — see `docs/LAUNCH-CHECKLIST.md`.

## If something is wrong

The lens is ours and re-deployable — a bad lens costs a redeploy and the address in
`js/chain-config.js`. The **edition** is not. Keep that asymmetry in mind: rehearse
aggressively here, because this is the half that forgives mistakes.

*NFA. Experimental art token — it can go to zero.*

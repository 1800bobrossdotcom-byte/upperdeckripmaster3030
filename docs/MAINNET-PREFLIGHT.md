# Mainnet pre-flight — one fresh wallet, end to end, before the site goes public

**Required by SuperRare before public launch:**

> "Before public launch we need one fresh-wallet mainnet test confirming the token approval flow,
> exact PackSink price enforcement, true supply-reducing burn, 50/50 studio split, card
> mint/render, and all six games."

⛔ **A FRESH WALLET IS THE WHOLE POINT AND IS THE EASIEST STEP TO SKIP.** The artist's own wallet
has approvals, balances, a vault in `localStorage` and a browser that has already loaded every
module on the site. It cannot fail the way a collector's will. Use a wallet that has never touched
this project, in a browser profile that has never opened it — every state below must be reached
from nothing.

⚠ **This is the Sepolia rehearsal's counterpart, not a repeat of it.** Sepolia proved buy-and-burn
against an *uncalibrated* curve with a *retired* token name. Mainnet is the first time the real
curve, the real name, the real PackSink and the real treasury are in the same transaction.

---

## The six gates

Every line is either ✅ with evidence (a tx hash, a number, a screenshot) or the launch does not
happen. "It looked fine" is not evidence — this repo's record is that every expensive failure
looked fine.

### 1 · Token approval flow
- [ ] Fresh wallet buys $3030 on the curve. Record tx, tokens received, effective price paid.
- [ ] **Compare the effective price to the $0.08 preview.** A material gap means the preview and
      the deployed curve disagree, and everything in `docs/PACK-PRICING.md` is re-derived before
      launch, not after.
- [ ] Rip a pack. **TWO wallet prompts appear** — `approve` then `pay` — and the UI NAMES each one
      (`onStep` fires `'approve'` then `'pay'`). ⚠ An unexplained second prompt reads as a scam.
- [ ] The approval is bounded (12 packs), not unlimited.

### 2 · Exact PackSink price enforcement
- [ ] The contract takes **exactly** the tier's locked token amount — not "about". Diff the
      wallet's balance before/after against the published tier price.
- [ ] A pack cannot be bought for less. Attempt an underpay and confirm it reverts.
- [ ] `sink` reads both immutable addresses back and they match `chain-config`.
      ⛔ **A wrong treasury address is a redeploy, not a setting** — both are `immutable`.

### 3 · True supply-reducing burn
- [ ] `totalSupply()` **before** and **after** the rip. The delta must equal the burned half
      exactly. ⚑ This is the one that cannot be faked by a transfer to a dead address: it must be
      a real `burn` that moves `totalSupply`, or the deflation claim is false.
- [ ] `maxTotalSupply()` is unchanged (mint-once).
- [ ] The site's live burn readout matches the chain, on a hard refresh.

### 4 · 50/50 studio split
- [ ] Treasury balance rises by exactly the other half, in the same transaction.
- [ ] Separate events fire for pack revenue and game rake, so the ledger keeps them apart.
- [ ] `PackSink` holds **nothing** after the call; `flush()` is permissionless and clears it.

### 5 · Card mint / render
- [ ] The pulled cards appear in the vault and in the folder.
- [ ] `tokenURI(id)` renders for a hero (1–33) **and** a field card (34–100). ⚠ Field cards must
      render **without any mint** — OZ's default revert-on-nonexistent is wrong here.
- [ ] `tierOfHolder` returns a tier for the fresh wallet and **does not revert** with a zero
      balance. ⛔ A revert here takes the metadata of all 100 cards offline at once.
- [ ] The token page's media slot renders the site (the `animation_url` port, proven on Sepolia —
      repeat on mainnet).

### 6 · All six games
Reachable from `arcade.html`, loading, playable, no console errors, on **desktop and a real phone**:
- [ ] THE CITY · [ ] RIP ROCKETER · [ ] CLOUD RACER · [ ] THE ARENA
- [ ] SECTION 9 · [ ] DOGFIGHT *(reached from THE CITY's mode bar)*
- [ ] The site music plays and the ◀◀ / play / ▶▶ transport works in a cabinet.
- [ ] ⚠ **Every cabinet requires WebGL 2** — there is no 2D fallback left. Confirm the `#nogl`
      panel is what a visitor without it actually gets.

---

## 0 · The flip itself is NINE fields — run `npm run test:name` after it

⛔ **"Flip `network` to mainnet" reads like one edit and is nine**: `network`, `chainId`, `label`,
the RPC list, `protocol.liquidFactory`, `protocol.rare`, `contracts.liquidEdition`,
`contracts.renderContract` — and `packSink`/`lens721` once they exist. **A partial flip does not
error; it misbehaves quietly.** `chainId` alone decides which network the collector's wallet is
forced onto, which SuperRare host `buyUrl()` points at (testnet ids go to `dev.superrare.co`), and
every explorer link on the site — so `network:"mainnet"` with the Sepolia `chainId` left behind
gives a mainnet-branded site that herds people onto a testnet, with nothing thrown.

✅ **`npm run test:name` now derives every chain-scoped field from whatever `network` claims to be
and fails on each one that disagrees.** Change `network` alone and it prints the remaining eight as
named failures — i.e. the flip has a checklist that cannot be half-completed. Verified by doing
exactly that: 7 failures, each naming its field.

⚠ **One value it cannot check: MAINNET RARE.** The repo records it only truncated
(`0xba5BDe66…6350`, `docs/TOKEN-MATH.md`). **Get the full address from SuperRare and do not guess
it** — a wrong reserve token is not a typo, it is the pool pointing at the wrong asset. The test
asserts only that it stopped being the Sepolia one, and says so.

⚠ And the standing rule no test can enforce: **read the renderer off the edition**
(`edition.renderContract()`), never from a recorded note. `chain-config` once carried a superseded
renderer that looked entirely plausible.

## Order

0. Flip `chain-config` (all nine fields) and run `npm run test:name` until it is green.
1. Deploy `PackSink` + `Ripmaster3030Lens721`; paste addresses into `chain-config` *(task #89 —
   still open, and gates 2, 4 and 5 cannot run until it is done)*.
2. Fresh wallet, fresh browser profile.
3. Gates 1 → 5 in one sitting, recording hashes as you go.
4. Gate 6 separately, including on a real phone *(task #73 — mobile has never been confirmed on
   real hardware; SwiftShader in a container is not evidence)*.
5. Only then lift the pre-launch veil.

⚠ **The veil is a curtain, not a lock** — it runs client-side. Anything that must not be reached
before launch belongs behind Vercel Deployment Protection, not `gate.js`.

⛔ **If any gate fails, the honest move is to delay the public launch, not to launch and patch.**
The burn is permanent and the contract addresses are immutable; there is no second attempt at
either.

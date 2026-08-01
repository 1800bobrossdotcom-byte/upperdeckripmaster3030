# Treasury — the studio's stated cut

**Artist directive.** Half of every pack and half of the game rake fund the studio; the rest burns.

This exists because `docs/ARTIST-REVENUE.md` records that SuperRare has published nothing about
the creator revenue model on a Liquid Edition. **This is income the project controls outright and
does not have to wait on an answer for.**

Treasury wallet: `0x5C3bc6dD6d5b9913d267527275dD95ceB235d89F` (`chain-config.treasury`).

---

## ⚠ This changed a public promise, and the copy has been changed with it

Four surfaces claimed the opposite. They were rewritten in the same commit that added the split:

| where | was | now |
| --- | --- | --- |
| `index.html` facts panel | "No team pre-mint, **no treasury, no fee wallet**" | "no hidden fees — the studio takes a **stated** cut" |
| `index.html` the drop | "~$7 of $3030, **burned in full**" | "**half burned, half to the studio**" |
| `index.html` rite §3 | "No tolls, no fee wallet, no treasury" | "the studio's cut is **stated on the tin**" |
| whitepaper + PDF deck | "**No treasury.** No team pre-mint. No fee wallet." | "No team pre-mint. No hidden fees." + the split |

**A mechanic that quietly contradicts the site is worse than one that is simply announced.** The
"no treasury" line was a selling point; removing it is a change collectors deserve to hear stated,
not discover. Say it out loud at launch.

⚠ `token-model.mjs` and `docs/ECONOMIC-FLOW.md` model the pack burn as the **whole** pack. At a
50% split the burn per pack halves — ~1.01M over four seasons, not ~2.03M. Those need rerunning
before any burn figure is quoted again.

---

## 1. Game rake — ✅ IMPLEMENTED (`js/wager-payout.js`)

The rake stays **10% of the pot**. What changed is where it goes: **5% burns, 5% to treasury.**

```
ante  25 → rake  3 → burn  2 + treasury  1
ante  50 → rake  5 → burn  3 + treasury  2
ante 100 → rake 10 → burn  5 + treasury  5
pot 4×50 → gross 200, rake 20 (burn 10 + treasury 10), net pot 180   ← conserved
```

Two things the implementation is careful about:

- **`RAKE_PCT` is the single source of the 10%.** `BURN_PCT + TREASURY_PCT` is asserted against it
  at load, so an edit that changes one and forgets the other is caught instead of silently
  changing what the pot pays out.
- **The split is floor + remainder, never two independent roundings.** At ante 50,
  `round(50×0.05)` twice gives 3 + 3 = 6 against a rake of 5 — the pot would pay out more than it
  took in. The remainder goes to the **burn**, so rounding can only ever burn more, never pay the
  treasury more than its share.

---

## 2. Pack purchase — ✅ CONTRACT BUILT AND TESTED (`contracts/PackSink.sol`, 28/28)

Currently a pack is one call: `RipWallet.burn(350)` → `burn(uint256)` on the token.

**A 50/50 split cannot just become two calls.** `burn()` then `transfer()` is two separate
transactions, and a wallet can approve the first and reject the second — or the second can simply
fail. The outcomes are:

- burn succeeds, transfer rejected → **collector's tokens burned, studio unpaid, no pack owed**
- transfer succeeds, burn rejected → **studio paid, nothing burned, deflation claim now false**

There is no ordering that fixes this, because there is no atomicity between two user-signed
transactions. Shipping it would mean a live money path that is *half-executed by design*.

### The correct shape: one atomic call

ERC-20 has no receive hook (that is ERC-777/ERC-1363), so the token cannot notify a contract on a
plain `transfer`. The standard pattern is approve-then-call:

```solidity
// PackSink — takes the pack payment and splits it atomically.
contract PackSink {
    IERC20  public immutable token;
    address public immutable treasury;
    uint16  public constant BURN_BPS = 5000;          // 50.00%

    event PackPaid(address indexed buyer, uint256 burned, uint256 toTreasury);

    function buyPack(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        uint256 burned = amount * BURN_BPS / 10_000;
        ERC20Burnable(address(token)).burn(burned);     // permanent
        token.transfer(treasury, amount - burned);      // remainder, so nothing is stranded
        emit PackPaid(msg.sender, burned, amount - burned);
    }
}
```

- One `approve` (once, or per pack), then **one** `buyPack` that either wholly succeeds or wholly
  reverts. The pack is owed only if `PackPaid` fired.
- `amount - burned` rather than a second percentage, so no rounding dust is ever stranded in the
  contract.
- Holds no balance between calls, has no owner, and cannot be upgraded — the smallest surface that
  does the job. **With no external audit (artist's call), "small enough to read in one sitting" is
  the whole safety argument.**

### Built — `npm run test:pack`, 28/28

The contract is written and tested against a real EVM. What the tests actually prove, chosen for
the properties that make the split trustworthy rather than for coverage:

- **`burned + toTreasury == amount` exactly**, at 350, **351**, **1**, 999,999 and 1e21. The odd
  amounts are the point: an even one cannot reveal a dust bug, and at `amount = 1` the burn floors
  to 0 and the treasury must still receive the whole thing. It does.
- **The sink holds nothing afterwards** — checked after every case.
- **`totalSupply` actually falls.** The burn is a burn, not a transfer to a dead address.
- **A transfer that returns `false` reverts the whole call** — nothing burns, the buyer keeps
  their tokens, no pack is owed. This is the one that matters: plenty of ERC-20s return false
  rather than reverting, and an unchecked transfer would burn the collector's tokens and leave
  the studio unpaid. The mock can be told to fail on purpose precisely so this is provable.
- **No admin surface.** The ABI is asserted to contain no owner / admin / pause / upgrade /
  withdraw / setToken / setTreasury function. There is nothing to trust the deployer about later.

### Still to do before it is live

1. Add `approve` + `buyPack` to `js/wallet.js` (it has `burn` and `balanceOf` only).
2. Point `pack.js` and `cabinet.html` at it; keep the single-burn path as the fallback while
   `chain-config.packSink` is unset, exactly as `lens721:""` degrades today.
3. Deploy and rehearse on Sepolia — same drill as the buy/burn rehearsal.

⚠ **Until it is deployed and wired, packs still burn 100%**, so the site copy is ahead of the
code. That is now a wiring job rather than a design question, but it is still a real gap: ship it
before launch or soften the copy to "will split".

---

## 3. Lens auctions — design note

*"Each of the 33 lens can be up for auction too."*

The 33 heroes are already `claimHero()`-only (EIP-712 voucher, kinds 1 gacha / 2 game title), so an
auction is a **third route to the same mint** rather than a new asset. Cleanest options:

- **Off-chain auction, voucher settlement (least new code).** Run the auction anywhere; the winner
  gets a signed voucher and calls `claimHero()`. No new contract, no escrow, works today.
  ⚠ The signer is trusted and the outcome is not on-chain-provable.
- **On-chain English auction contract** holding the mint right, settling to `claimHero()`. Real
  provenance, real bids — and a second unaudited contract holding bidder funds.
- **Auction the token, not the mint** — mint to a vault and let it be traded on SuperRare's own
  secondary. Zero new contract surface; loses the "first owner won it" story.

Auction proceeds are the same treasury question as everything else here, and the same caveat
applies: it is a revenue line, so state it publicly rather than let it be discovered.

Recommendation: **option 1 for Season 1.** It ships without adding an unaudited contract holding
other people's money five days before launch, and it can be upgraded to option 2 later without
changing the lens contract at all.

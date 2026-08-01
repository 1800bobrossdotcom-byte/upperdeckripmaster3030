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

✅ **The model has been rerun at the split.** `token-model.mjs` burned 100% of every pack until
2026-08-01, so every burn figure it printed was **double the truth**, as was every figure copied
out of it. At `BURN_SHARE = 0.50`:

| | modelled before | actual at the 50% split |
| --- | --- | --- |
| four-tier sellout burn | 2,028,750 | **1,014,375** |
| to the studio, same period | — | **1,014,375** (≈ $16.1K at the opening price, RARE $0.0159) |
| settled float | ~30,971,250 | **~31,985,625** |
| permanent contraction | 1.07× | **1.03× — essentially none** |

Regenerated with it: `tokenomics.html`, `audit.html`, `whitepaper.html`, `whitepaper.pdf`,
`index.html`, `docs/ECONOMIC-FLOW.md`, `docs/CURVE-TARGET.md`.

⚠ The studio's cut is **tokens, not dollars** — selling it is itself sell pressure on the curve it
is priced against. The model reports it and does not price it.

### ⚠ "~3.2% of the float" was the WRONG DENOMINATOR — corrected 2026-08-01

An earlier version of this file reassured with "1.01M is ~3.2% of the surviving float." The
arithmetic is right (1,014,375 / 31,985,625 = 3.17%) and **the measurement is wrong**, because
under mint-once **most of `totalSupply` is unsold inventory still sitting inside the AMM's own
positions.** It is not float in any economic sense. Against tokens that have actually *left* the
curve:

| denominator | treasury share |
| --- | --- |
| `totalSupply` after burns (what this file used to say) | 3.17% |
| supply cap | 3.07% |
| **tokens ever removed from the curve** | **50.0%** |
| **off-curve and not burned, pack demand only** | **100%** |

**By construction the studio ends up holding exactly half of every token the pack economy ever
pulls out of the pool** — and every one that isn't burned. Whether that is 3% or 80% of genuinely
circulating supply depends entirely on outside speculative demand this project does not model and
cannot control:

| outside holders accumulate | treasury share of circulating |
| --- | --- |
| 0 | 100% |
| 250,000 | 80% |
| 1,000,000 | 50% |
| 5,000,000 | 17% |

⚑ **Do not quote 3.2% as reassurance.** The number that matters is the second table, and it is a
demand assumption, not a fact. The *price* risk is genuinely small at 33M — dumping the whole slug
moves spot about −6.8% on the smooth model, against −53.7% at the old 3.03M cap, so the supply
change defused that — but **ownership concentration is the opposite of reassuring** and the two
should not be confused.

⚠ `docs/TOKEN-MATH.md` is **not** rewritten: it is still written against the old 3,030,000 cap, so
it is stale on two axes at once and a correct rewrite needs the artist's unmade 33M decision
first. It carries a banner saying so rather than a quietly patched number.

---

## 1. Game rake — ✅ WIRED (`js/wager-payout.js` + `RipWallet.payRake`)

The rake stays **10% of the pot**. What changed is where it goes: **5% burns, 5% to treasury.**

⚑ **The rake and the pack use the SAME contract, because the ratio is the same.** 5% burn / 5%
treasury *is* half the rake, so `PackSink` splits both. `payRake()` exists alongside `buyPack()`
purely so the two emit **different events** — pack revenue and game revenue are separate lines in
the same ledger, and an indexer summing `PackPaid` must not silently count rakes.

⚠ **The eight result screens used to overstate this.** `wager-payout.js` computed a treasury half
unconditionally while the eight games still called `burn(wholeRake)` — so a player was shown
"🔥5 rake burned · 5 to the studio" when in fact all 10 had burned. `splitLive()` now asks
`RipWallet.hasSink()`, so the figures follow the deployed reality from one place and start
reporting the split the moment the address is pasted in, with no edit to any game.

## 1b. Rip Rocketer's launch fee — ✅ 100% TO THE TREASURY

**Artist directive, 2026-08-01.** The flat **25 $3030** to launch is not a pot rake and does not
split: **all of it funds the studio, none of it burns.**

⚑ **This needs no contract, and that is the point.** `PackSink` exists because a *split* is two
operations that must not half-execute. Paying one address is **one** operation — a plain ERC-20
`transfer`, atomic by definition. Routing it through the sink would have added a contract call, an
approval and a second wallet prompt to buy exactly nothing. `RipWallet.payTreasury()` is the whole
implementation. *Reach for the contract when there is something to make atomic, not by habit.*

⚠ **It fails closed with no treasury configured** (`reason: 'no-treasury'`). There is no sensible
fallback: burning instead would perform a different economic action than the one asked for, and
the zero address is how tokens get destroyed by accident. A player getting a practice run beats a
silent substitution.

⚠ **The word "burn" is gone from that game's copy**, in both the PlayCanvas and classic builds —
buttons, the gate note, the meta description, the wallet-missing message. It now reads *"Launch
fee: 25 $3030 to the studio — this one funds the shop, it doesn't burn."* Leaving the old wording
would have been exactly the failure this whole treasury change exists to avoid: a claim about
where a collector's tokens went that is not true.

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

### ✅ Wired — `npm run test:split`, 38/38

`RipWallet.payPack(tokens, onStep)` and `payRake(tokens, onStep)` do approve-then-call and are
used by `pack.js`, `cabinet.html` and all eight pot-rake call sites.

- **It ships dark.** With `contracts.packSink` empty, both fall back to the plain 100% burn —
  byte-identical to the call already rehearsed on-chain. `result.split` says which path ran, and
  every surface reports what *actually* happened rather than what this document says should.
- **Two prompts, explained.** The split needs an `approve` first. `onStep` fires `'approve'` then
  `'pay'` so the UI can name each one — an unexplained second wallet prompt reads as a scam.
- **One approval covers 12 packs** (`chain-config.approveBatch`), so a player is not signing an
  approval before every rip. **Deliberately not unlimited.** It would in fact be safe here —
  PackSink's only `transferFrom` takes from `msg.sender`, so an allowance granted to it can only
  ever be spent by a transaction you sent yourself — but "approve unlimited, it's fine" is the
  exact reflex that gets people drained elsewhere.
- **A rejected approval charges nothing** — the pack call is never sent. Tested.

⚑ **Why `test:split` exists separately from `test:pack`.** The contract suite proves the split is
correct; it cannot prove the browser ever reaches it. `js/wallet.js` hand-assembles calldata as
hex, and every failure there is silent — a wrong selector hits the fallback, a wrong offset
approves the wrong spender, a missing `10^18` approves 350 *wei*. None of them throw; they just
produce a wallet prompt that looks fine. **Writing the two selectors from memory got both wrong**,
which is why they are now recomputed from the ABI and asserted against the file.

### Still to do before it is live

1. Deploy `PackSink(token, treasury)` and paste the address into `chain-config.contracts.packSink`.
2. Rehearse on Sepolia — same drill as the buy/burn rehearsal: one approve, one `buyPack`, then
   read `totalSupply` and the treasury balance and check they moved by the same amount.

⚠ **Until that address is filled in, packs and rakes still burn 100%.** The code no longer claims
otherwise — the receipts and result screens say "burned N" rather than crediting a studio cut that
did not happen — but `index.html` and the whitepaper still describe the split in the present
tense. Ship the deploy before launch, or soften that copy to "will split".

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

Recommendation: **option 1 for the genesis set.** It ships without adding an unaudited contract holding
other people's money five days before launch, and it can be upgraded to option 2 later without
changing the lens contract at all.

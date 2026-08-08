# FWA — what it is, measured, and the three things it does that our pack does not

*2026-08-08. Every number here was read off the chain or off their published source
(`github.com/token-works/fwa-relaunch`, verified via Sourcify — Etherscan's keyless endpoints are
dead, and an agent that stopped there would have wrongly reported it unverified). Press figures are
labelled as press. Founders: Adam (@Rhynotic) and Teto (@tetonotsorry), trading as TokenWorks.*

---

## 0 · why this file exists

⚑ **It is our pack, inverted, and the inversion is the whole difference in outcome.** They do
$1.6M of daily volume across 2,681 holders; $3030 ran **five swaps in ten hours** with 31 holders
and 97.38% of supply never having left the curve. Same shape of product — a randomised pull for a
collectible — and a three-orders-of-magnitude difference in throughput. The reasons are structural
and they are copyable.

⛔ **This is not a recommendation to hold or trade FWA.** §4 records why every trading strategy
tested against it lost, and §2 records a transfer lock that would surprise anyone who bought it
expecting to move it.

---

## 1 · the machine

| | |
| --- | --- |
| draw | **0.117 ETH**, resolved by Chainlink VRF (subscription, not the wrapper — their source says the wrapper's p95 callback of 46 blocks trips the pool's slippage guard) |
| stock | **depositors** lock an approved NFT plus an ETH *backing*. Higher backing ⇒ lower pull probability, so rarity is priced by strangers putting capital at risk |
| win | the drawer takes the NFT **or** 85% of the backing in ETH or FWA |
| rake | protocol keeps fees **plus 15% of backing** on a cash-out |
| where it goes | **100% of protocol fees to FWA buybacks** since 2026-08-06 (raised from 80%) |

Press: peak **~$1.53M/day** in fees on 2026-07-25, easing to **~$350k/day**; TVL over **$6.15M** on
07-31; briefly a larger consumer of Ethereum blockspace than Tether and Circle. Founder, 08-04:
**1,735 Ξ** of protocol revenue to date — 63% TokenWorks, 30% S02 holders, 7% Teto.

⚠ **Two different fee streams, and conflating them is a 17× error.** The gacha (0.117 Ξ a draw plus
the 15% haircut) is the big one. The **1% swap fee** on the v4 pool is separate and much smaller:
measured directly, the hook took **20,378,454 FWA over 84,756 transfers = 1.0007% of buy-side
flow**, ~10.45 Ξ/day ≈ $20,060. Our first reading of "$20k/day" was the pool fee alone.

---

## 2 · what we measured that the press did not

- **Transfers are LOCKED.** `FWAToken._afterTokenTransfer` reverts `InvalidTransfer()` (0x2f352531)
  unless one side is `address(0)`, the owner, an owner-whitelisted distributor, or the PoolManager.
  Proved live: a plain `transfer` of 100 FWA from a real holder **reverts**. ⛔ FWA cannot be sent
  to a second wallet, a treasury or an exchange. It can only be sold back into the one pool, from
  the wallet holding it.
- **The 1% is symmetric and frozen.** `FEE_BIPS = 100`, a `private constant`. Simulated on live
  state: **1.0194% buy, 1.0192% sell, −2.028% the round trip.**
- **`beforeAddLiquidity` is OFF** — the hook *cannot refuse* liquidity, so an outside LP may fund a
  pool whose `fee` field is 0 and earn nothing, silently. And liquidity can never be added anyway:
  exactly **one** `ModifyLiquidity` event exists, the LP NFT went to `0x…dEaD`, and
  `_afterAddLiquidity` reverts `NotLaunching()` outside the one-shot launch.
- **Owner powers** (`0x019817aD…E8Cb`, an unrenounced EOA holding 1.04% of supply): hook —
  `setToken`, `setFeeAddress`, `setExternalBuysEnabled`, `setPool`; token — `setDistributor`,
  `setPool`, `setRouteSplit`. ⛔ `setExternalBuysEnabled` is asymmetric: the owner can close the
  **buy** side while sells stay open. It was **false for the token's first 19 days**, flipped true
  at block 25683506 (2026-08-04 18:59).
- ✅ **No mint path.** `_mint` appears twice, both in the constructor. Supply can only fall. No
  blacklist, no pause, no seizure. That is a better safety profile than most tokens this age.
- **The scheduled buyback is real.** `0xabc98D86eA62919399c4211251890308Ce37A6BF`, 4,773 bytes,
  holding **280 ETH ($537,496)**. 47 fills measured, **mean gap 2.00 h against an announced 2.00 h**
  — ~12 ETH/day of bid on a clock, roughly 23 days left.
- **The emission cliff is visible in the tape without reading a word of Twitter.** Off-pool
  distributor flow: 527M FWA on 07-20 decaying to 38M by 08-02 — and **burns are exactly zero until
  08-04**, then 188K → 544K → 1,304K → 2,003K. Emissions stopped and buybacks started, on the day
  the founder said they would.

---

## 3 · ⚑ THE THREE THINGS IT DOES THAT OUR PACK DOES NOT

**① It takes ETH and does the buying itself.** A collector arrives with ETH and pulls. Our pack
requires them to already hold $3030 — a step `pack.js`'s buy door was built to paper over a day
ago, and papering over a step is not removing it. Their every sale is a **live bid on the pool**;
ours is a burn of tokens the buyer acquired at some earlier, unrelated moment. That single
difference is most of "1 buy vs 10 sells".

**② Strangers stock the machine.** Depositors supply the prizes *and price them* by choosing how
much ETH to back each one with. ⛔ This is the one that matters most for a studio funding itself
month to month: **you do not have to manufacture the inventory.** Our model needs 100 finished
cards before the machine is full. Theirs needed a contract and a queue.

**③ Revenue buys the token back.** 100% of protocol fees, mechanically, on a published schedule
anyone can verify. Our 50/50 burn/treasury is honest and it is not a bid — the burn removes supply
that was already sold, while a buyback puts money into the book.

⚠ **And what NOT to copy.** The drawer loses ~21% per spin on average (pays ~1.1× the average
backing, receives 0.85×). That is a negative-expectancy game for the player, and this studio's
whole position is the anti-casino — *"the tangible prize is the having-done-it"*. A pull that is
honestly a coin flip against the house is the thing `docs/HERO-UNLOCKS.md` refuses. ⚑ The
mechanism to lift is the **ETH-in, contract-buys, depositors-stock** plumbing, not the payout
maths.

---

## 4 · why no trading strategy against it survived

Measured over the pool's whole life (392,399 transfers replayed, sum reproducing `totalSupply()`
to the wei; 182,535 swaps):

- The accumulation signal is **real**: corr **+0.294** at 5 min, **75% up-rate** after heavy
  accumulation, decaying to nothing by 3 h — the shape of a genuine microstructure edge.
- Its top-minus-bottom quintile spread is **1.4–1.8 points**. The round trip is **2.11**. It clears
  a one-way cost and loses to a round trip. ⛔ **The 1% per leg is what eats it**, not the absence
  of an edge.
- Walk-forward replay of the bot's own `decide()` (`npm run timetravel`): whole sample 59.5% win,
  +22.82%, $41.59 swept — but **last 10 days −6.28%, last 7 −7.13%, last 5 −3.46%**, win rate
  decayed 59.5% → ~42%. The entire gain came from the first nine days.
- ⚑ **And §2's emission cliff explains it.** The "accumulation" the signal detected was
  substantially the emission distribution itself. When 1% of supply a day stopped arriving, the
  signal lost its subject. Not a mysterious decay — a mechanism that was switched off.

⛔ **AND THE "EXTERNAL POOL WILL REVIVE IT" THESIS IS FALSE — I HELD IT ALL EVENING AND THE
SWEEP I BUILT TO PROVE IT DISPROVED IT.** TokenWorks said on 08-06 that external pools "will not
have this fee", and the reasoning was clean: a 1.4–1.8 point edge loses to a 2.11% round trip and
clears a 0.3% one. Two measurements killed it.

**First, the external pools already exist.** `npm run poolwatch` swept the token's whole life and
found **twelve** FWA venues, not one. Three are hookless with real depth and real flow:

| fee | hook | liquidity | swaps/24h | |
| --- | --- | --- | --- | --- |
| 0.000% | **SKIMS** | 7.92e22 | 3,386 | the main pool — the hook takes 1% a leg |
| 0.855% | none | 7.84e21 | 92 | `0xe008f37a…` |
| 0.860% | none | 6.49e21 | 110 | `0x845a8909…` |
| 0.850% | none | 6.84e21 | 2 | |
| 0.010% | none | **0** | 0 | `0x6a4fe51c…` — exists, empty |

**Second, and decisively: the fee was never the binding constraint.** Sweeping `LEG_COST` through
the walk-forward replay:

| round trip | whole 19 days | last 10 days |
| --- | --- | --- |
| 2.11% | +22.82% | **−8.31%** |
| 1.72% | +24.39% | −7.66% |
| 0.60% | +27.22% | −5.77% |
| **0.02%** | +28.45% | **−4.79%** |

At an essentially free venue the recent regime still loses. Fees cost ~5.6 points over the whole
sample — real, and not the cause.

⛔ **THE CAUSE IS THAT THE SIGNAL STOPPED PREDICTING.** Correlation of flow with the next window's
return, by period:

| | ~5 min | ~15 min | ~1 h |
| --- | --- | --- | --- |
| whole sample | **+0.294** | +0.222 | +0.214 |
| last 10 days | −0.014 | −0.113 | −0.163 |
| last 4 days | −0.010 | −0.071 | −0.060 |

It has gone to zero and slightly negative; at 1 h over the last 10 days it has **inverted**
(heaviest accumulation → −0.519%, heaviest selling → +4.011%). ⚑ Which closes the loop with §2's
emission cliff: **1% of supply a day arriving looks exactly like a crowd accumulating.** The signal
was measuring the distribution programme. It ended on 08-04 and the signal lost its subject.

⚠ **So the trigger to go live is NOT an external pool.** It is the edge returning, which is a
measurable thing and not a scheduled one. Cheaper losing is still losing.

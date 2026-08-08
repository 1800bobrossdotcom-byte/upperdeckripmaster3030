# WHERE THE CAPITAL ACTUALLY COMES FROM

*Artist, 2026-08-08: "I genuinely am looking at novel integrations we can build to accelerate the
growth of capital for the chart, token, edition, and liquidity."*

*Five design mandates, each adversarially verified, plus a completeness pass — then every
load-bearing on-chain claim re-measured by hand, because one of them was stale and inverted the
recommendation. Measured 2026-08-08. Nothing here is a forecast.*

---

## 0 · THE ARGUMENT, BEFORE THE LIST

**There is no market to grow. There is a primary sale that is 2.6% complete.**

| | |
| --- | --- |
| `totalSupply` | 3,022,687 |
| held by the v4 **PoolManager** | **2,943,363 — 97.38%** |
| **ever reached a human** | **79,324 $3030, across 31 wallets** |
| real circulating market cap | ⛔ **$7,065** |
| headline "FDV" | $269,201 |
| **buy-side depth (the RARE in the pool)** | ⛔ **$7,622** |

⛔ **"$269,421 OF LIQUIDITY" IS 97% UNSOLD INVENTORY.** DexScreener adds both sides of the pool;
the token side is $261,794 of stock that has never been sold. ⚑ **`CLAUDE.md` predicted this exact
trap** — *"under mint-once most of `totalSupply` is unsold inventory still inside the AMM"* — and
nobody had put the number to it.

⚑ **So the chart is not a market signal. It is three people.** The top three wallets hold 26.1%,
17.8% and 17.8% of the float; the treasury is #6 at 4.9%. "1 buy against 10 sells" is eleven trades
by a handful of wallets on an asset almost nobody owns yet.

That reframe kills a whole class of proposal in one line. **You cannot recycle fees on a token with
no float, you cannot incentivise a holder base that is thirty-one people, and you cannot make a
chart alive by moving your own $632 through it.** Every mechanism has to answer one question:
**does it get tokens out of the curve, into real hands, because somebody wanted something?**

Asked that way, the answer is already built and has never been run:

| door | size | status |
| --- | --- | --- |
| **the pack schedule** | tier I = 1,600 × 125 = **200,000 $3030 off $16,000** — **2.5× everything ever distributed** | ⛔ **0% executed.** Its front door is a paragraph telling people to go elsewhere. |
| **the 100 handmade cards** | the only thing the artist makes with his hands | ⛔ no price, no mechanism, no date |
| **the 11 hero 1/1s** | the largest external capital event on the calendar | ⚠ **all 11 minted; 9 still in the artist's wallet** |

⛔ **CAPITAL FOR THIS PROJECT DOES NOT COME FROM THE TOKEN. IT COMES FROM PEOPLE BUYING OBJECTS THE
ARTIST MADE, AND THE TOKEN IS THE TILL.** A mechanism that operates on the chart operates on
thirty-one people. A mechanism that sells an object operates on everyone who likes the work.

⚑ **And the binding constraint is PEOPLE, not dollars.** At 31 holders, thirty new collectors is
**+97% on the base**. $30,000 is not available from any mechanism here; thirty people is available
from several. **Grade everything on holders, not on volume.** ⚠ `docs/ROADMAP.md` has sections for
the games, the cards, the lens, the contracts and the deploy — and **not one line about anybody
hearing about any of it.**

---

## 1 · ⛔ WHAT I RE-MEASURED, AND THE ONE THAT INVERTED

The design round produced a headline warning: *"do not mint any position in the ETH pool — it is
254× mispriced."* It also said, in its own words, **"verify the tick with your own read before
acting on any of it."** I did. **The warning was true at initialization and is false now**, and
following it would have cost the project the one pool where liquidity can still earn a fee.

Read from `PoolManager.extsload` (slot 6), validated against DexScreener — my RARE tick gives
**7.3427** RARE/token against their **7.3429**, which is what makes the other two reads trustworthy:

| pool | fee | current price | verdict |
| --- | --- | --- | --- |
| **RARE** `0x7943d0d1…` | ⛔ **0%** | $0.0891 | depth is here; **an LP earns literally nothing, forever** |
| **ETH** `0x9a7e4306…` | **0.9%** | **$0.0963** | ✅ **at fair value — 8% off the RARE pool.** No hook. |
| **USDC** `0x597a6772…` | ⛔ **89.898%** | $0.0365 — **59% below market** | ⛔ **delist today** |

- ⛔ **THE ETH POOL WAS INITIALIZED AT TICK 44,395 = $22.62/token — 254× spot — AND HAS SINCE BEEN
  ARBITRAGED TO TICK 98,984 = $0.0963.** That is exactly what its "2 sells, −78.7%" was: someone
  took the free money. ⚑ **The mispricing is spent. The pool is now honest**, and it is the only
  one of the three with a real LP fee and no hook skimming it.
- ⛔ **THE RARE POOL'S FEE IS `0` AND IT IS IMMUTABLE IN THE PoolKey.** Every swap fee is taken by
  hook `0x8Ff56609…3aE0cC` through the return-delta path. **Any plan to attract third-party
  liquidity there with yield is dead on arrival** — this answers, from the chain, a question
  `CLAUDE.md` has carried since launch as "ask SuperRare".
- ✅ **But the hook CANNOT refuse liquidity.** Its low 14 bits are `0x20CC` = `beforeInitialize |
  beforeSwap | afterSwap | beforeSwapReturnDelta | afterSwapReturnDelta`. **`beforeAddLiquidity`
  is OFF.** Third parties can add. They just will not be paid for it.
- ⛔ **THE USDC POOL IS IN `chain-config.market.pools[]` RIGHT NOW WITH AN 89.898% SWAP FEE**, and
  it is priced 59% below the real market. It is empty, which is the only reason nobody has been
  hurt. **This has no capital path and is the most urgent line in the document: delist it, and add
  a `test:name` assertion that reads each configured pool's fee off its own `Initialize` log and
  refuses anything above 1%.**
- ⚠ **And `marketDepth()` sorts on `liquidity.usd`, which for the RARE pool is 97% unsold
  inventory.** DexScreener returns `liquidity.base` and `liquidity.quote` separately in the same
  response. **Route buys by ask depth and sells by bid depth**, not by the sum.

### ⛔ AND A PERMANENT ONE THAT CANNOT BE FIXED: THERE ARE NO ROYALTIES

`Ripmaster3030Lens721.supportsInterface(0x2a55205a)` → **false**. `royaltyInfo` reverts. There is
no ERC-2981 and no royalty setter among the seven owner functions.

⛔ **Every resale of every genesis 1/1 pays the studio zero, forever, and there is no transaction
that changes it.** A second hero contract would fracture the set, which is worse than the problem.
**Write the ERC-2981 rule into `docs/RENDER-CONTRACT.md` so no future contract repeats it**, and
price the primary sale knowing it is the only sale the studio is ever paid on.

### ⚠ Also measured

- **All 11 auction heroes (ids 1–11) are minted.** Nine sit in `0x432D71bA…` (the artist); **ids 1
  and 3 are held by a collector, `0x6D7c4477…`.** All minted ~1.4 days ago. ⚠ **What they cleared
  at is the artist's own knowledge** — the design round asserted $58 and I could not verify a price
  on-chain. **If the nine are being drip-sold on 24-hour clocks with no announcement, stop today.**
  That is the largest capital event on the calendar being spent as a background process.
- **`lovebeingMinted()` = 0.** The holder-bound lens has never been issued.
- **`tierOfHolder` IS live in `tokenURI`** (emits `Holding` + `Tier` traits on all 100 cards).
  **`heldFor` is NOT** — it exists only in `lensState()`. And **no live page shows either.**

---

## 2 · THE RANKING — capital impact per unit of effort

| # | mechanism | effort | dollars | people | verdict |
| --- | --- | --- | --- | --- | --- |
| **1** | **Delist the 89.9% pool. Fix `marketDepth`'s denominator.** | **hours** | prevents a loss | — | ⛔ **TODAY** |
| **2** | **Stop the hero drip.** Withhold the nine, or confirm they are not being drip-sold. | **hours, no code** | prevents a permanent loss | — | ⛔ **TODAY** |
| **3** | **The rip is a BUY** — close the on-ramp in `pack.js`. | **days** | unlocks $16,000 | ✔✔ | ✅ **LOAD-BEARING** |
| **4** | **Ship the six games standalone, off-site, crypto-free.** | weeks | $0 directly | ✔✔✔ | ✅ **the only lever on the denominator** |
| **5** | **The press run** — 100 physical cards, claimable in $3030. | weeks + 1 contract | $25k–$50k | ✔✔ | ✅ **biggest ticket** |
| **6** | **Sell the nine properly** — one dated, marketed night. | days + weeks of run-up | $2k–$20k | ✔ | ✅ downstream of #4 |
| 7 | **Say what the tier does** — deployed and invisible. | days, free | $0 | ✔ | ✅ before the auctions |
| 8 | The address book — 50 hand-picked collectors, hand-delivered packs. | days | −$556 | ✔✔ | after #3 |
| 9 | The curing deck — 67 field lenses finish as burn advances. | days | $0 | — | a motive, not an audience |
| 10 | Liquidity in the **ETH** pool (0.9% fee, fair value, no hook). | days | — | — | ⚠ re-read the tick first |

### ✅ 3 · THE RIP IS A BUY — the one that unlocks the schedule

`pack.js:228` reads the balance, finds it short, and renders a panel telling the visitor to go buy
$3030 somewhere else. **That is the front door of the entire distribution plan, and it is a
dead end at the exact moment of maximum intent.**

Make the rip button do the buy: exact-output swap for `packBurn()` tokens + a cushion, priced in
**dollars** on the button, then `PackSink.buyPack()` in the same session. Two prompts, named via
the existing `onStep` (`'approve'` then `'pay'`). ⚑ **It creates no demand by itself — it is a
conversion multiplier on every other mechanism here**, which is exactly why it goes first.
⚠ Extend `test:split` and `test:press` §6; the repo's own rule is that `js/wallet.js` hand-assembles
calldata and every failure there is silent.

### ✅ 5 · THE PRESS RUN — the biggest ticket, and it needs a contract

`contracts/PressClaim.sol`, PackSink's shape and PackSink's safety argument (~2,200 bytes, no
withdraw, no upgrade, no pause, immutable token and treasury). `claim(cardId, maxPay)` →
`transferFrom` → burn 50% → `transfer(treasury, amount − burned)`, exhaustive by subtraction.

⚑ **`maxPay` is one line and it kills a whole class**: without it a claimant who approved N is
exposed to the owner raising `price` between approve and claim. **Sabotage-test it.**
Price in dollars, derive the token count the day a card opens, freeze it — the pack's own settled
rule. One price for all 100.

⛔ **AND DECIDE THE TREASURY HALF BEFORE THE FIRST CARD OPENS.** 100 claims at $300 pulls ~337,000
tokens out of the curve — 168,500 burned and **168,500 to the treasury, which is still float, held
cold, by the wallet that is already holder #6.** The honest destination is *spent* — paper,
sleeves, tracked insured post, the artist's hours. **"Held" is the answer that quietly makes the
studio the dominant holder.**

### ⛔ AND THIS INVERTS THE BUYBACK ADVICE I GAVE YOU EARLIER

$300 of buy-and-burn destroys ~3,370 tokens out of 3.02M — **0.11% of supply, invisible.** The same
$300 on the quote side **deepens the entire buy-side book by 3.9%, permanently, and then earns
fees** (in the ETH pool, at 0.9% — not the RARE pool, where the fee is zero).

⛔ **At this size, seeding the quote side beats burning, and it is not close.** Burning is the right
policy for a token with a float. This one has $7,000. The pack's atomic 50/50 split should not
change — it is deployed and honest — but *discretionary* dollars belong in the book, not the fire,
until the float is an order of magnitude larger.

---

## 3 · THE KILL LIST — by name

- ⛔ **The Bankr swarm / fee-recycling loop.** Arithmetic: 1.75% paid, 0.665% returned, **−1.085¢
  per dollar of self-generated volume.** A fee farm you feed yourself always loses.
- ⛔ **A second token on Base.** Breaks `ECONOMIC-FLOW.md` line 29, inherits a 1.75% tax and a 15%
  vest $3030 does not have, and reads as *the art token was the warm-up*.
- ⛔ **Bridging $3030 to Base.** Splits a $7,622 book, opens a 7-day arb window, and
  `getMarketState()` would be blind to it — **the artwork would tell a partial truth by
  construction.**
- ⛔ **The press bureau / tenure credits / agent bench / credits-for-depth.** A beautiful discount
  ladder **on a compute bill no customer has.** The whole agent-economy branch is conditioned on
  agents wanting card renders, which is unproven, and it sells the studio's core IP to find out.
- ⛔ **The card exchange.** An unaudited contract holding NFT approvals — a PackSink bug loses a
  fee, a bug here loses a collector's 1/1. **Keep the ERC-2981 finding, drop the venue.**
- ⚠ **The treasury ask-ladder.** Its own author says the present value is negative, and it requires
  the cold treasury to start signing — breaking the one property `TREASURY.md` is proud of.
- ⛔ **Anything whose output is a number on a page rather than a person with a card.**

---

## 4 · THE ARTIST'S CALLS — cannot be made from a repo

1. ⛔ **The nine heroes: held or sold, until when, at what reserve, announced or not.** And what
   ids 1 and 3 actually realised. This project's credibility is built on stating uncomfortable
   measurements; if they cleared low, say so.
2. ⛔ **Whether the six games ship off-site, crypto-free, under the studio name**, on portals whose
   communities are hostile to crypto. The answer may legitimately be no.
3. ⛔ **The physical cards: for sale, for allocation, or both — and whether the eleven auction
   heroes' physical twins are claimable at all.** Selling the object twice is the failure mode.
4. ⛔ **A stated destination for the treasury half of every press claim, before the first card.**
5. **The `setDescription()` copy** that goes on-chain and is what a collector reads.
6. ⚠ **The one that competes with everything: his hands.** A six-week auction run-up, a curated
   list and a hundred hand-made cards are the same person's time. **If there is time for only one,
   it is the cards** — they are what everything else sells.

**One message to SuperRare, not five:** add `0x1D4bcbb5…47A33` to the Bazaar's approved-token
registry so a Liquid Editions artist can sell his 1/1s in his own Liquid Edition; confirm the RARE
pool's LP fee really is permanently zero; and the four `ARTIST-REVENUE` questions open since before
launch. **Their willingness to add the token is itself informative.**

---

⚑ **THE ONE SENTENCE: the pack schedule is the distribution plan, it is already built, it is 0%
executed, and its front door is a paragraph telling people to go somewhere else. Everything
upstream of that is optional. Everything downstream of it is arithmetic.**

*NFA. Experimental art token. It can go to zero, and every number here was measured on one day.*

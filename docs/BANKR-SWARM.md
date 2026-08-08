# BANKR × $3030 — trading agents, fee recycling, and what a "swarm" can honestly be

*Research + integration design. Nothing here is built. Every number was measured on
2026-08-08 against mainnet and the live indexer, not taken from a note.*

> **Ask (artist, 2026-08-08):** *"research bankr bot and see how we can integrate to create
> trading bot swarms for specifically $3030 — since we bring in trading fees, repopulating
> those fees, and then trading upwards in swarm movement or other novel integrations."*

---

## 0. ⛔ I GOT THIS WRONG FIRST, AND THE MISTAKE IS WORTH MORE THAN THE ANSWER

The ask rests on four words — *"since we bring in trading fees"* — so I checked it before
designing on top of it, and reported back that **the studio receives no trading fees at all.**

**That was wrong. The artist has received $300+ in ETH in fees. He is right and I was not.**

⛔ **THE ERROR WAS NOT THE WRONG WALLET. IT WAS MEASURING THE WRONG QUANTITY.** I read
`balanceOf` on two addresses and reported the answer as lifetime income. **A balance is a
STOCK; a fee stream is a FLOW, and a balance cannot see money that arrived and left.** The
reasoning that made it feel safe is in the original note and is where the rot is: *"the
treasury is a cold Ledger that signs nothing, so a zero balance is proof of zero received."*
That inference is **true of the cold wallet and of nothing else** — and I quietly extended it
to `0x432D71bA…59d166c9`, a **hot wallet with 4,605 transactions**, where it is worthless.

⚑ **AND THE LOG SCAN THAT WAS SUPPOSED TO CATCH THAT WAS BLIND BY CONSTRUCTION.** I then
scanned ERC-20 `Transfer` events for WETH and RARE — and **native ETH emits no logs at all.**
The artist's own words were *"$300 in **eth**"*. So the one instrument I reached for to fix a
stock/flow error could not see the asset in question. Two independent methods, both
structurally incapable of seeing the thing, **both returning zero, which reads as corroboration.**

⚑ **THIS IS THIS REPO'S OWN RECORDED FAILURE, IN A NEW PLACE: the reassuring answer arrived
first and nothing errored.** Same shape as the four dead RPCs answering HTTP 200 with an error
body, and as `test:cab`'s headline — *every static assertion passed while the game was
unplayable.* A measurement that returns a clean zero is not the same as a measurement that
looked.

### What the scan DID turn up, and it is real

Scanning WETH inflows since launch block 25,697,191 did find movement — including
**0.0188 WETH (~$83) into the cold treasury** at block 25,697,588, ~80 minutes after launch,
**which is not there now.** A cold wallet whose balance went up and back to zero is by itself
proof that the "signs nothing" premise no longer describes reality. I stopped there rather
than keep forensically reconstructing the artist's own wallets from a container.

### ⚠ What is now measured, what is corrected, and the one thing needed

| | status |
| --- | --- |
| studio receives trading fees | ✅ **YES — $300+, artist-confirmed.** My "zero" is retracted. |
| which address receives them | ⚠ **OPEN — and it is the one input every automation below needs.** |
| the rate they arrive at | ⚠ open — see the decay note below |
| Bankr can pay creator fees on $3030 | ⛔ **No, and this is unaffected** — §2, and it turns on the launch record, not on any balance |
| 24 h volume · buys/sells | ✅ $5,440 · **1 buy / 10 sells** — unaffected |
| burn to date | ✅ 7,250 $3030 (≈$646) |
| treasury `$3030` | ✅ 7,100 (≈$632), pack splits |

⚠ **AND THE $300 HAS A DATE ON IT, WHICH CHANGES WHAT IT PREDICTS.** `CLAUDE.md` records the
RARE pool doing **$60,637 of volume** on launch day. Today it is **$5,440** — about **1/11th**.
Fees are a percentage of volume, so *the same fee rate that produced $300 in launch week
produces roughly a tenth of that now.* **$300 earned is a fact; $300/week is not a forecast.**
⚑ Which is why the sell-pressure finding below survives the correction intact and is still the
thing that matters most: **fee income is a function of the volume, and the volume is one buyer.**

**⛔ ACTION, and everything in §4 is blocked on it: name the address the fees land on.** Given
it, `eth_getBalance` deltas plus a log scan give an exact per-day figure in one pass, and a
Bankr automation can be pointed at it. Without it, this document is guessing at its own input.

### And the market it would be recycling into

DexScreener, live, `0x1D4bcbb5…47A33`:

| | |
| --- | --- |
| price | **$0.08906** (the ≈$0.08 open held) |
| liquidity | $269,421 |
| FDV | $269,856 |
| **24 h volume** | **$5,440** |
| **24 h txns** | ⛔ **1 buy · 10 sells** |
| pools indexed | **1 of 3** — only the RARE pool. The ETH and USDC pools in `chain-config.market.pools[]` show no indexed activity at all. |

⛔ **THE PROBLEM ON THIS TOKEN IS NOT PLUMBING, IT IS ONE BUYER A DAY.** Eleven trades. Ten of
them sells. No fee-recycling architecture, however clever, manufactures a second buyer — it can
only move money the studio already had from one pocket to another and charge itself gas for the
trip. **Any design below that does not increase the number of distinct humans who want the token
is decoration.** Sizing it, for scale: even at Bankr's own best-case creator share (§1),
$5,440/day of volume yields **$36/day**. That is the entire prize, and §2 explains why $3030 is
not eligible for even that.

---

## 1. What Bankr actually is (verified against the docs, 2026-08-08)

Bankr is **infrastructure for self-sustaining AI agents** — custodied wallets, a trading
router, a token launchpad, and a paid-endpoint host. Base URL `https://api.bankr.bot`,
auth `X-API-Key: bk_…`. Two layers:

- **Wallet API** — synchronous, no LLM. `POST /wallet/swap-quote`, `POST /wallet/swap`,
  `/wallet/transfer`, `/wallet/portfolio`, `/wallet/me`, `/wallet/sign`, `/wallet/submit`.
- **Agent API** — asynchronous, natural language. `POST /agent/prompt` → `{jobId, threadId,
  status:'pending'}`, then poll `GET /agent/job/{jobId}` for `completed | failed | cancelled`.

**Chains:** Base, **Ethereum mainnet**, Polygon, Unichain, World Chain, Arbitrum, BNB,
Robinhood Chain, Solana, Hyperliquid. ✅ Ethereum mainnet is supported for swaps, which is the
one compatibility fact $3030 needed.

**Swap parameters:** `fromChain`/`toChain`, `fromToken`/`toToken` (address, or the
`0xEeee…EEeE` sentinel for native), `amount` (human-readable), `slippageBps` (10–2000, default
500), `minBuyAmount` (required on execute, taken from the quote), `idempotencyKey`.
⚠ **A reverted swap returns HTTP 200 with `success:false`.** Any integration that treats 200 as
success will report a fill that never happened — the same shape as this repo's recorded
`if (j.result)` RPC trap, where two dead endpoints answered 200 carrying an error object.

**Other surface:** automations (limit · stop · DCA · TWAP · vesting sells · recurring agent
commands; 5 concurrent standard / **20 with Club**; `GET /user/automation`,
`POST /user/automation/:taskId/{pause,resume,cancel}`), webhooks (sandboxed TS handler returning
`{prompt}`, `readOnly:true` by default, 10 req/min · 1,000/day), an LLM gateway, a CLI
(`npm i -g @bankr/cli`), and a Claude Code plugin (`claude plugin marketplace add
BankrBot/claude-plugins`).

**Cost:** Bankr Club **$20/mo or $198/yr**. Free tier is 5 messages/day and **100 Agent API
requests/day**; Club is 1,000/day. Gas is sponsored on supported chains.

**Security primitives worth noting, because they are what make a fleet defensible:** per-key
`readOnly` (default **true**), IP allowlists, **recipient allowlists**, wallet-level spending
limits, price-impact guards, and pause/suspend/resume.

### The fee engine — the part the ask is really about

A token **launched through Bankr** pays a **0.7% swap fee on the pool**, of which **95%
(0.665% of volume)** goes to a **fee beneficiary address** you nominate. All-in the pool charges
~1.75% (0.475% Bankr protocol · 0.2375% BNKR buyback · ~0.0875% Doppler · 0.285% LP compounding).
Standard allocation is 85% to the pool and 15% creator vest over a year behind a 30-day cliff
(disable-able). Fees accrue in the launched token and WETH and are claimed with
`POST /token-launches/:tokenAddress/fees/claim`; unclaimed amounts read from
`GET /token-launches/:tokenAddress/fees`.

⚑ **The beneficiary may be any address — a wallet, an ENS name, a social handle, or a
contract.** It is set at deployment and thereafter transferable **only by the current holder**,
permanently and irreversibly.

---

## 2. ⛔ THE FEES ARE REAL — AND BANKR STILL CANNOT PAY THEM, FOR A REASON THAT IS NOT ABOUT MONEY

With §0 corrected, the picture is: **there IS a fee stream (SuperRare's), and Bankr's fee
engine is a separate thing that $3030 cannot enter.** Those are two different statements and
conflating them is what produced the wrong answer the first time.

**(a) $3030 is not a Bankr token and can never become one.** The fee beneficiary is set *at
deployment*. $3030 was deployed 2026-08-06 by SuperRare's multicurve factory
(`0x25f993C2…29540`) on mainnet, block 25,697,191. There is no Bankr launch record to attach a
beneficiary to. `GET /token-launches/0x1D4bcbb5…/fees` returns **404 — "Token was not launched
via Bankr."** No onboarding path exists; the docs are explicit that *"tokens launched earlier
keep the schedule they launched with."*

⚑ **THIS IS A RECORD-KEEPING FACT, NOT A BALANCE, WHICH IS WHY IT SURVIVED THE CORRECTION.**
It is the one claim in the original note that did not depend on reading a wallet — and it is
the load-bearing one. **Bankr's 0.665% is not available to $3030 under any configuration.**

**(b) So Bankr is not the fee SOURCE here. SuperRare already is.** That inverts the whole
design and improves it: we do not need Bankr to *earn*. We need it to **route, schedule and
execute** what SuperRare already pays — which is exactly what its swap API and automations do,
and which needs no launch record at all. ⚑ **The flywheel in the ask is available today; it
just runs on SuperRare's fees rather than Bankr's.**

**(c) The constraint that remains is volume, and it is the real one.** Fees are a percentage of
$5,440/day and falling. Nothing in §4 changes that, and §4's ranking reflects it.

---

## 3. ⛔ THE ONE PART I AM NOT GOING TO BUILD, AND WHY IT IS FATAL TO **THIS** PROJECT

*"Trading upwards in swarm movement"* — a fleet of studio-funded, studio-coordinated wallets
buying to move the price up — is market manipulation. If the wallets trade against each other
it is also wash trading, which additionally falsifies the volume number the site publishes.
That is a legal exposure I am not qualified to size and the artist should not accept unsighted.

But the reason to refuse it here is narrower and stronger than the legal one, and it is written
all over this repo already:

- The project **refuses to publish a burn percentage** — not because the arithmetic is hard, but
  because a printed number would drift away from the truth with nobody editing anything. The
  site prints live reads instead.
- The ethos line is *"parody the crypto/KOL/meme-coin/casino culture as art, **safely** …
  clearly satire, **never deceptive**."*
- The whole position is **anti-casino**: *"the tangible prize is the having-done-it."*

⛔ **A swarm that manufactures price action is not a parody of the casino. It is the casino.**
A studio that will not print "30.7%" because it might mislead cannot run bots whose entire
function is to mislead. The first person to chart the buy pattern gets a screenshot that ends
the project, and they would be right.

⚑ **The word "swarm" is worth keeping. The target is what has to change: point the swarm at the
GAMES and at DISTRIBUTION, not at the price.** That is §4-B, and it is a better idea than the
original.

---

## 4. ✅ WHAT ACTUALLY INTEGRATES — ranked by value ÷ cost

### A. The buy path — one line, free, the biggest win on this page

⛔ **Buying $3030 today requires three steps and most people quit at the first.** Acquire RARE
(itself an illiquid mid-cap almost nobody holds) → find a Uniswap **v4** pool → swap. §0 says
**1 buy in 24 hours**. That is what a three-step on-ramp looks like from the outside.

Bankr collapses it to one sentence, from a tweet, a terminal, or the API:

```
@bankrbot buy $25 of 0x1D4bcbb505182a49303CC3B23EfF1E3157147A33 on ethereum
```

```bash
curl -X POST https://api.bankr.bot/wallet/swap \
  -H "X-API-Key: $BANKR_KEY" -H 'content-type: application/json' -d '{
    "fromChain":"ethereum", "toChain":"ethereum",
    "fromToken":"0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "toToken":"0x1D4bcbb505182a49303CC3B23EfF1E3157147A33",
    "amount":"0.01", "slippageBps":300,
    "minBuyAmount":"<from /wallet/swap-quote>",
    "idempotencyKey":"rip-<uuid>"
  }'
```

⚑ **The router picks the venue, which is a SAFETY property and not a convenience.** This repo
already made exactly this call for the Uniswap link: *"the swap link is built from the token,
never from a pool id … a token-keyed link cannot fill from a pool with nothing in it."* Bankr is
token-keyed by construction — you hand it an address, never a pool. **It cannot aim a collector
at the empty ETH pool**, which is the failure `chain-config`'s `marketDepth()` was written to
avoid.

⚠ **It is custodial, and the site must say so in the same breath.** A Bankr wallet is held by
Bankr. Every other money path here is non-custodial and the pages say so loudly. If this ships
it is an **additional** door beside the Uniswap link, labelled as third-party and custodial —
never a replacement, and never the default.

⛔ **GATED ON ONE UNVERIFIED FACT — see §5.** Whether Bankr's router can actually fill a
**Uniswap v4** pool quoted in **RARE** on mainnet. If it cannot, A is dead and B/D/E are not.

### B. The honest swarm — a fleet of player wallets, via the Partnership API

This is the piece of Bankr that most deserves the word *swarm*, and it has nothing to do with
price:

```
POST /partner/wallets              X-Partner-Key   →  { walletId, evmAddress, solanaAddress?, apiKey? }
POST /partner/wallets/:id/fund     up to 3 tokens, one batched tx, gas sponsored
POST /partner/wallets/:id/keys     up to 20 per wallet; readOnly:true by DEFAULT;
                                   IP allowlist + RECIPIENT allowlist
POST /partner/wallets/:id/{suspend,resume}     on-chain funds unaffected
```

`idempotencyKey` is keyed to your own user id, so a retry returns the same wallet instead of
minting a second one. Org-level `maxWallets` quota; 403 at the ceiling.

⚑ **THIS SOLVES A PROBLEM THE REPO ALREADY HAS AND HAS DOCUMENTED.** `docs/SEATS.md` describes
three doors into the arcade and admits the honest limit: *"a seat is advisory — SIWE is signed
and stored but nothing verifies it server-side, so no real value may depend on `seat.ok`."*
And the leaderboard says the same about itself: *"every score is computed in the player's
browser, so the board is exactly as trustworthy as the client."* A provisioned wallet per player
gives the arcade a **real on-chain identity** — a rake that actually settles, a podium that
actually pays, and a `$3030` balance the lens can read — **without the player installing
anything.** The six games stop being a scoreboard of self-reported numbers.

⚠ **And it does not weaken the earned tier, which is the thing to protect.** The eleven hero
1/1s mint only against a human-signed EIP-712 `kind 2` voucher. A Bankr wallet is an identity,
not a judge. `js/title-ledger.js`'s own header — *"nothing here awards anything"* — stays true.
That guard is why a fleet of agent-owned wallets in the arcade cannot farm heroes, and it
already exists.

⚠ **The custody question is the artist's and it is not small:** provisioning wallets for players
means a third party holds their funds under our branding. Recipient allowlists and per-key
`readOnly` make it defensible; they do not make it non-custodial.

### C. Buy-and-burn as a **disclosed policy**, not a swarm

The legitimate version of "repopulating fees." The studio holds 7,100 $3030 and takes 50% of
every pack. Publishing a rule — *"the studio converts N% of pack revenue to a weekly TWAP buy,
and burns it; here is the wallet, here is the schedule"* — is an ordinary, disclosed treasury
policy. Bankr's automations execute it (`TWAP`, 20 concurrent on Club) and its API can pause it.

⚑ **What makes this legitimate and §3 illegitimate is one property: it is announced in advance
and verifiable after the fact.** Same buys, same wallet, same chain — the difference is entirely
whether anyone was told. The site already prints live burn and studio totals, so the honest
version costs nothing to disclose.

⚠ **Do not automate it before it is decided.** `PackSink` is `immutable` and has no owner by
design; a treasury policy is a separate, revocable, off-chain thing and should stay that way.
⚠ And it does not need Bankr — a TWAP over a $5,440/day pool can be a person clicking Uniswap
once a week. Bankr's value here is scheduling, not access.

### D. x402 Cloud — the only genuinely NEW revenue line on this page

The studio already runs endpoints that other people's agents would pay for:
`api/lore.js` (card lore generation), and the whole `tokenURI(id)` / card-render surface.
x402 hosts them as **paid** endpoints — a caller gets HTTP 402, its wallet signs, Bankr verifies,
your handler runs, and settlement lands **directly in your wallet**.

- Settles in **USDC (or any ERC-20) on Base** — the chain the arcade coin box already uses, and
  the cold treasury is an EOA so it has the same address there.
- **Free under 1,000 requests/month** (0% platform fee), then 5% on Pro.
- **Payment is only collected if the endpoint returns successfully.**

⚑ **This is "self-sustaining" without a single manipulative trade, because it is revenue from
selling something real.** It is also the only item here that grows without needing $3030's
volume to grow — and USDC on Base converts to a $3030 buy on mainnet in one cross-chain swap if
the studio wants it to. **If the goal is "fees we can recycle", this is the fee source that
actually exists.**

### E. A Base-side arcade token — the only way to get a Bankr fee stream, and it conflicts

The **only** path to the 0.665% creator share is to launch something **through Bankr**, on Base,
with `feeBeneficiary` set to the cold treasury at deploy. Fees claim to the studio and could
fund $3030 buy-and-burn on mainnet. That is, precisely, the flywheel in the ask.

⛔ **AND IT CONTRADICTS THE PROJECT'S FOUNDING SENTENCE.** `docs/ECONOMIC-FLOW.md` line 29:
*"`$3030` is the only fungible token."* A second token fragments the one story every generated
page tells, gives the studio two things to defend, and invites the obvious reading — that the
art token was a warm-up. ⚠ It also inherits Bankr's 15% creator vest and its ~1.75% all-in swap
tax, both of which the $3030 design deliberately does not have.

**Recorded because it is the literal answer to the question, and flagged as an artist decision
that I would not take.** Not a recommendation.

---

## 4½. A BASE PAIR, AND WIRING IT TO THE LENS — the artist's two questions

> *"don't tokens sometimes launch a base pair? since this is on l1 mainnet can we connect them
> somehow with the lens?"*

### ⚑ THE TENSION IS REAL AND WORTH NAMING BEFORE ANSWERING: the arcade wants Base, the art wants L1

They are not the same economy and never were. **The arcade already lives on Base** —
`js/eth-play.js` takes the $1 coin slot in Base ETH straight to the hangar wallet, because a
25¢ game on L1 would cost more in gas than the game. **The art lives on L1** — the edition, the
renderer, the lens, the SuperRare profile, the whole `getMarketState()` read. Yes, tokens
routinely launch a Base pair, and the reason is exactly this: Base is where small transactions
are affordable.

### ⛔ BUT BRIDGING $3030 TO BASE IS THE ONE MOVE I WOULD ARGUE HARDEST AGAINST

It is mechanically easy — $3030 is a plain ERC-20, so the canonical OP-Stack bridge mints an
`OptimismMintableERC20` on Base backed 1:1 by locked L1 tokens, and you pool that. The problem
is what it does to the book:

- **It splits liquidity that is already thin.** $269k of depth and $5,440/day across *two*
  chains is two shallow markets instead of one adequate one.
- ⛔ **And the arbitrage that normally re-joins a split market cannot run here.** Closing a gap
  means bridging — **7 days** on the canonical bridge, or a fast-bridge fee — so a price
  divergence *persists* instead of being arbed out in a block. **Two prices for one token, for
  a week at a time, is a worse failure than the empty-ETH-pool problem** the site already
  reads depth to avoid, because there is no router that can route around it.
- ⛔ **And the lens goes blind to it.** `getMarketState()` is an L1 call on the L1 edition. A
  Base pool is not in it, so the card would keep rendering the L1 market while trading happened
  somewhere it cannot see. **The artwork would be telling a partial truth by construction.**

### ✅ SO: PUT THE MONEY ON BASE AND LEAVE THE TOKEN ON L1

Bankr's swap takes `fromChain` and `toChain` **independently** — that is the whole trick, and
it is why no bridged token is needed:

```jsonc
{ "fromChain":"base",     "fromToken":"<USDC on Base>",
  "toChain":"ethereum",   "toToken":"0x1D4bcbb505182a49303CC3B23EfF1E3157147A33",
  "amount":"250", "slippageBps":300, "minBuyAmount":"<from /wallet/swap-quote>" }
```

Base-side earnings (x402 revenue, arcade coin box, anything Bankr-native) buy L1 $3030 in **one
call**, on a schedule, and burn it. **Earn where it is cheap, hold the market where the art
is.** One token, one price, one pool, no bridge, and the treasury is the only party that ever
crosses chains — not every player.

### ✅ AND THE LENS IS ALREADY CONNECTED — the connection is the burn

I checked what the deployed lens can actually read (`contracts/Ripmaster3030Lens721.sol`). Its
entire view of the world is four calls: `totalSupply`, `maxTotalSupply`, `getMarketState()`,
and `balanceOf(who)` — surfaced as `burnBps()`, `marketSnapshot()`, `lensState(id)` and
`tierOfHolder()`.

⛔ **A mainnet contract cannot read Base. There is no L1←L2 read** — OP Stack messaging is L2→L1
withdrawals behind a 7-day challenge window with an explicit prove/finalize, which is not a
thing metadata can call. So the question becomes: *what L1 number can Base activity move?*

⚑ **`burnBps()` is `(maxTotalSupply − totalSupply)`, and a burn is an L1 event no matter whose
money paid for it.** Base revenue → cross-chain buy → burn on L1 → **the number the lens
already renders moves.** No oracle, no bridge, no new contract, no trust assumption. **The
Base economy proves itself on L1 by destroying supply, and the card shows it because it was
always showing it.** That is the connection, and it exists today.

⚑ **Second live wire, already built: `tierOfHolder()`.** Ash · Spark · Ember · Flame · Inferno
read `balanceOf` on the L1 edition. **If §4-B provisions player wallets and those wallets hold
$3030 on L1, the arcade's players appear in the artwork as tiers.** The game connects to the
lens through the holder, with nothing new deployed.

⛔ **AND THE THIRD OPTION IS CLOSED, WHICH IS USEFUL TO KNOW.** An owner-written stat
(`setBaseVolume(...)` etc.) would be the obvious way to post Base numbers onto L1 — **the lens
has no such setter.** Its writers are `setCards`, `setUrls`, `setDescription`, `setTiers`,
`setEdition`, `setEditionRenderer`, `setClaimSigner`. Adding one means **deploying a new lens**,
and the current one is live with heroes minted against it.
⚠ **That closure is a good outcome, not a limitation.** An owner-written number is a *printed*
number — the exact thing this project refuses on every public page because it drifts with
nobody editing anything. The lens reads facts. A cross-chain oracle (LayerZero/CCIP) would
technically work and buys a trusted dependency that can die, per update, to display a figure
the burn already implies.

**Answer, in one line: don't bridge the token — bridge the money, and let the burn carry the
signal onto the card.**

---

## 5. ⛔ THE ONE UNKNOWN THAT GATES §4-A, AND THE EXACT TEST

**Can Bankr's router fill a Uniswap v4 pool, quoted in RARE, on Ethereum mainnet?**

Aggregator v4 coverage is uneven and a RARE-quoted v4 pool is exotic. Nothing in Bankr's docs
answers it, and it cannot be reasoned out — it has to be asked, for real, with money.

```bash
# $5 and one API key settles it. Quote only — no funds move.
curl -s -X POST https://api.bankr.bot/wallet/swap-quote \
  -H "X-API-Key: $BANKR_KEY" -H 'content-type: application/json' -d '{
    "fromChain":"ethereum","toChain":"ethereum",
    "fromToken":"0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "toToken":"0x1D4bcbb505182a49303CC3B23EfF1E3157147A33",
    "amount":"0.002","slippageBps":300 }' | jq
```

Then read three things, in this order:
1. **Does a route exist at all?** No route ⇒ §4-A is dead today; revisit when the ETH pool
   (`0x9a7e4306…`) has depth, since an ETH-quoted v4 pool is far likelier to be indexed.
2. **`priceImpact`.** Against $269k of liquidity a $25 buy should be a rounding error. A large
   impact means it found a bad venue — probably the near-empty ETH or USDC pool.
3. **Execute one real $5 buy and check `success`, not the status code.** 200 with
   `success:false` is a revert.

⚠ **Then verify the fill landed in OUR pool** — DexScreener's pair
`0x7943d0d1…7ab6` should show one more buy. A swap that succeeded against some other market is
not the thing being tested. *A buy link is a claim about which market is ours*, and that
standard applies to a router exactly as it applies to a URL.

---

## 6. Recommendation

**The flywheel the ask describes is available, and it runs on SuperRare's fees, not Bankr's.**
Fees land (address TBC) → Bankr automation converts on a published schedule → buy $3030 on L1 →
burn → `burnBps()` moves → the card shows it. Every leg of that exists today; none of it needs
a Bankr launch, a bridged token, or a new contract.

| | move | cost | blocked on |
| --- | --- | --- | --- |
| 0 | ⛔ **Name the fee-recipient address** | $0 | **artist — everything else waits on this** |
| 1 | Run the §5 quote (can the router fill a v4/RARE pool?) | $0 | an API key |
| 2 | **D** — x402 on `api/lore.js`, USDC on Base | $0 under 1k req/mo | nothing |
| 3 | **C** — write the buyback policy down, *then* automate it | $0 | artist |
| 4 | **A** — Bankr as a second, labelled, custodial buy door | $20/mo Club | §5 passing |
| 5 | **B** — player wallets → real arcade identity → holder tiers | Club + partner quota | artist (custody) |
| 6 | ⛔ **Bridging $3030 to Base** | splits a thin book two ways for 7 days at a time | — I would not |
| 7 | ⛔ **E** — a second, Bankr-launched Base token | breaks "the only fungible token" | artist — I would not |

⚑ **The closing note survives the correction, and §0 sharpened it rather than softening it.**
The fees are real, and they are a percentage of volume that has fallen from $60,637/day to
$5,440/day on **1 buy against 10 sells**. Recycling them is worth doing and is honest. But a
fee stream is downstream of trading, so **an architecture that recycles fees harder cannot
outrun the thing generating them.** Bankr is distribution and settlement — it makes the token
reachable in one sentence instead of three steps, and it can give the arcade a real on-chain
identity. It does not create demand, and a design that quietly assumes it will is §3 wearing
better clothes.

---

## Sources

- [Bankr Documentation](https://docs.bankr.bot/) · [Quick Start](https://docs.bankr.bot/getting-started/quick-start/)
- [Agent API](https://docs.bankr.bot/agent-api/overview) · [Wallet API](https://docs.bankr.bot/wallet-api/overview) · [Swap](https://docs.bankr.bot/wallet-api/swap)
- [Token Launching](https://docs.bankr.bot/token-launching/overview/) · [Fee splitting](https://docs.bankr.bot/token-launching/fee-splitting) · [Claim fees](https://docs.bankr.bot/token-launching/api-reference/claim-token-launch-fees)
- [Partnership · wallet provisioning](https://docs.bankr.bot/partnership/wallet-provisioning) · [Automations](https://docs.bankr.bot/agent/automations) · [Webhooks](https://docs.bankr.bot/webhooks/overview) · [x402 Cloud](https://docs.bankr.bot/x402-cloud/overview)
- [Bankr Club](https://docs.bankr.bot/faq/bankr-club/) · [Self-sustaining agent](https://docs.bankr.bot/guides/self-sustaining-agent/) · [BankrBot/skills](https://github.com/BankrBot/skills)
- On-chain reads: `ethereum-rpc.publicnode.com`, `mainnet.base.org`. Market: `api.dexscreener.com`, 2026-08-08.

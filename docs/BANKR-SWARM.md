# BANKR × $3030 — trading agents, fee recycling, and what a "swarm" can honestly be

*Research + integration design. Nothing here is built. Every number was measured on
2026-08-08 against mainnet and the live indexer, not taken from a note.*

> **Ask (artist, 2026-08-08):** *"research bankr bot and see how we can integrate to create
> trading bot swarms for specifically $3030 — since we bring in trading fees, repopulating
> those fees, and then trading upwards in swarm movement or other novel integrations."*

---

## 0. ⛔ THE MEASUREMENT THAT DECIDES EVERYTHING, AND IT WAS TAKEN FIRST

The ask rests on four words — *"since we bring in trading fees"*. That is the premise, so it
is the thing to check before designing anything on top of it.

**The studio brings in no trading fees. Not few — zero.**

| read | value | what it means |
| --- | --- | --- |
| `treasury.balanceOf(RARE)` | **0** | a Uniswap v4 LP fee on a RARE-quoted pool arrives as RARE. None ever has. |
| `treasury.balanceOf(WETH)` | **0** | nor as WETH. |
| `treasury` ETH (mainnet) | 0.000376 | dust. |
| `treasury` ETH (Base) | 0.0000089 | dust. |
| `treasury.balanceOf($3030)` | **7,100** ≈ $632 | ⚑ **this is the studio's entire revenue to date, and it is pack splits — not trading.** |
| `totalSupply` | 3,022,750 | 7,250 $3030 burned ≈ $646. |

Treasury `0x8455cF29…De21950` is a cold Ledger that, by design, **signs nothing** — so nothing
has ever left it. A zero balance is therefore proof of zero received, not proof of a
withdrawal. ⚑ **`docs/ECONOMIC-FLOW.md` line 29 said this all along** — *"no treasury, no team
unlock, **no fee wallet**"* — and `CLAUDE.md` has carried *"SuperRare's public docs do NOT
state … the buy/sell fee split and who receives it"* as an open question since July. It is not
open any more. Whatever the SuperRare curve charges, it does not land here.

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

## 2. ⛔ WHY THE FLYWHEEL HAS NO FUEL — three independent blockers, any one of them fatal

**(a) $3030 is not a Bankr token and can never become one.** The fee beneficiary is set *at
deployment*. $3030 was deployed on 2026-08-06 by SuperRare's multicurve factory
(`0x25f993C2…29540`) on Ethereum mainnet, block 25,697,191. There is no Bankr launch record to
attach a beneficiary to. `GET /token-launches/0x1D4bcbb5…/fees` will return **404 — "Token was
not launched via Bankr."** There is no onboarding path; the docs are explicit that
*"tokens launched earlier keep the schedule they launched with."*

**(b) The SuperRare pool's fees do not come to us either.** Measured in §0: 0 RARE, 0 WETH,
forever. So there is no *existing* fee stream to recycle, from Bankr or from anywhere.

**(c) Even if both were solved, the volume is $5,440/day.** 0.665% of that is **$36/day**, and
it would be earned by charging our own collectors an extra 1.75% on every trade.

⚑ **THE HONEST RESTATEMENT: the flywheel Bankr sells is real, and $3030 is standing outside it.
A fee stream is not something the token *has* and we forgot to collect — it is something that
would have to be BUILT, on Base, inside Bankr, as a new thing.** §4-D and §4-E are the two ways
to do that. Everything else in §4 is worth doing anyway and does not need a fee stream at all.

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

**Do A and D. Test A first, because it is free and it is gated. Take B to the artist as a
custody decision. Do C only as a written, published policy. Do not do E. Do not do §3 at all.**

Ordered by what it costs to find out:

| | move | cost | blocked on |
| --- | --- | --- | --- |
| 1 | Run the §5 quote | $0 | an API key |
| 2 | **D** — x402 on `api/lore.js` | $0 under 1k req/mo | nothing |
| 3 | **A** — Bankr as a second, labelled buy door | $20/mo Club | §5 passing |
| 4 | **C** — write the buyback policy down before automating it | $0 | artist |
| 5 | **B** — player wallets | Club + partner quota | artist (custody) |
| 6 | **E** — Base arcade token | a second token | artist — I would not |

⚑ **And the honest closing note, because it is the finding rather than a caveat: none of this
changes 1 buy and 10 sells.** Bankr is a distribution and settlement tool. It makes the token
easier to buy and it can give the arcade real on-chain identity — both genuinely worth having.
It does not create demand, and a design that quietly assumes it will is the same wrong answer
as §3 wearing better clothes.

---

## Sources

- [Bankr Documentation](https://docs.bankr.bot/) · [Quick Start](https://docs.bankr.bot/getting-started/quick-start/)
- [Agent API](https://docs.bankr.bot/agent-api/overview) · [Wallet API](https://docs.bankr.bot/wallet-api/overview) · [Swap](https://docs.bankr.bot/wallet-api/swap)
- [Token Launching](https://docs.bankr.bot/token-launching/overview/) · [Fee splitting](https://docs.bankr.bot/token-launching/fee-splitting) · [Claim fees](https://docs.bankr.bot/token-launching/api-reference/claim-token-launch-fees)
- [Partnership · wallet provisioning](https://docs.bankr.bot/partnership/wallet-provisioning) · [Automations](https://docs.bankr.bot/agent/automations) · [Webhooks](https://docs.bankr.bot/webhooks/overview) · [x402 Cloud](https://docs.bankr.bot/x402-cloud/overview)
- [Bankr Club](https://docs.bankr.bot/faq/bankr-club/) · [Self-sustaining agent](https://docs.bankr.bot/guides/self-sustaining-agent/) · [BankrBot/skills](https://github.com/BankrBot/skills)
- On-chain reads: `ethereum-rpc.publicnode.com`, `mainnet.base.org`. Market: `api.dexscreener.com`, 2026-08-08.

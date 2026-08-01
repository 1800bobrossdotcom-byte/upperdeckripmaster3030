# Staking, and how the artist gets paid

Two questions, and they have very different answers. One is settled. **The other is not, it is
the artist's own income, and the launch is days away.**

---

## 1. "What does staking mean?" — settled, and it is not financial

**In this project, staking is not a yield mechanism. There is no staking contract, no emissions,
no lock-up, no rewards pool, and nothing that pays you for holding.**

It means exactly this: **the lens reads your balance.** SuperRare's own *Introduction to Liquid
Editions* says a Liquid Lens "can use that state as creative input" and names the inputs — token
price, trading activity, and **holder balances**. Their Technical CLI Guide repeats it: render
contracts "can read price, supply, liquidity, burn progress, balances, and related on-chain state
at fetch time."

So `tokenURI(id)` can see who owns the lens, read that wallet's `$3030` balance, and change what
the artwork looks like in tiers. Hold more, the card renders differently.

**The art acknowledges you. It does not pay you.** That is the anti-casino position stated as a
mechanic — CLAUDE.md's "the tangible prize is the having-done-it", expressed in the one place it
can be: the picture itself.

Why this is the right shape:
- **Nothing to drain.** No contract holds user funds, so there is no staking exploit surface.
- **No new contract at all.** It is a read inside a render call.
- **It composes with what exists.** `claimHero()` already mints only against an EIP-712 voucher,
  so the signer can gate hero eligibility on held balance with no contract change.

Two real caveats, both recorded in CLAUDE.md:
- ⚠ **Owner-dependent metadata is not cacheable**, and marketplaces cache `tokenURI` hard.
  SuperRare's own docs say updates are pull-based — "a render contract is not a background
  process… the market changes on-chain, metadata gets refetched, and the artwork changes." So it
  works, but only as fast as clients refetch. Check how SuperRare's frontend refreshes lens media
  before committing to a design that depends on it.
- ⚠ **A balance is instantaneous, so it is borrowable for a snapshot.** Fine when the prize is
  purely aesthetic. **Not** fine if it ever gates real value — for that you need held-over-time,
  computed off-chain.

Status: designed, not built. Task #78.

---

## 2. "How do I earn money on this SuperRare edition?" — ⛔ UNANSWERED, AND IT IS A LAUNCH BLOCKER

**I cannot answer this from anything SuperRare has published, and I am not going to guess at it.**

CLAUDE.md has carried this warning for a while and it is still true:

> ⛔ SuperRare's public docs do NOT state the creator revenue model, the buy/sell fee split and
> who receives it, the curve mechanism or any DEX graduation, or how the opening price is set.
> **Ask them. Do not model revenue until they answer.**

That was written after reading both the public *Introduction to Liquid Editions* help article and
the *Liquid Editions: Technical CLI Guide (Cohort 01)*. Neither contains it.

**Why guessing would be actively harmful here.** Bonding-curve token launches pay creators through
some combination of an initial allocation, a share of trading fees, and/or LP position ownership —
and the differences between those are the difference between "paid at launch", "paid only if it
trades" and "paid only if it succeeds". Modelling the wrong one would produce a revenue number the
artist plans around. `docs/ECONOMIC-FLOW.md` and `token-model.mjs` deliberately model **supply and
burn**, never creator income, for exactly this reason.

### What IS known, and it is not income

- **Packs burn $3030.** A burn is a *sink* — it removes supply. It does not route value to the
  artist. "The token burns so the art can live" is an artistic position, not a revenue line.
- **The game's rake burns too** (~10%, `js/wager-payout.js`). Also a sink.
- **The artist deploys the edition themselves** via the Rare Protocol CLI, from the wallet
  connected to their verified SuperRare account. Whatever the creator terms are, they attach to
  that deployment — which is one more reason the golden rule matters: deploy from the right
  wallet or the indexer never associates the drop with the artist profile at all.
- **The curve is a preset** (`--curve-preset medium-demand`), and `--preview` prints the generated
  curve without submitting. That gives real numbers for the *curve* — not for the split.

### The questions to put to SuperRare, in writing, before deploying

Copy these verbatim. Each one changes a number the artist would otherwise be planning around.

1. **On a Liquid Edition, what does the creator receive, and when?** Specifically: is there an
   initial token allocation to the creator wallet at deploy, a share of buy/sell fees, ownership
   of an LP position, or some combination?
2. **What is the buy fee and the sell fee, exactly, and how is each split** between creator,
   SuperRare, and liquidity?
3. **Is any creator allocation vested or locked?** If so, on what schedule?
4. **How is the opening price set?** Is it purely a function of the chosen curve preset and the
   supply cap, or is there a separate parameter?
5. **Does the edition graduate to a DEX** at some threshold? If so — at what point, who owns the
   resulting LP, and what happens to the curve contract afterwards?
6. **Do secondary sales of the 721 lens NFTs pay a creator royalty** through SuperRare, and is
   that separate from the ERC-20 side?
7. **At a 33,000,000 supply cap, is there a minimum raise or float requirement** we should know
   about before choosing the curve?

### Until they answer

- ✅ Fine to say publicly: the token burns, the burn is permanent, the cards survive.
- ⛔ Do **not** put any creator-revenue claim, projection or number on the site, in the whitepaper,
  in the PDF deck, or in conversation with collectors.
- ⛔ Do **not** let the answer arrive after deploy. Several of these — the allocation, the vesting,
  the curve — are fixed at deployment and unfixable afterwards, exactly like `name()` and
  `symbol()`. This belongs on the same pre-flight checklist as task #70.

**This is the single highest-value unanswered question in the project.** Everything else on the
list is craft; this one is whether the artist gets paid.

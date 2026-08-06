# Ways to implement the lens — a working sheet

> ⚠ **PROPOSALS, NOT DECISIONS.** Same status as `docs/DESIGN-SYSTEM.md`: this is a draft for the
> artist to strike from. Two of these are built and marked ✅; everything else is an idea with its
> cost and its acceptance test attached, so it can be judged rather than admired.

---

## The rule that makes these good instead of arbitrary

**The lens's material language is the PRESS.** Every mapping below is a real thing that happens in
a print shop — not a metaphor we invented to be clever. That single constraint does most of the
work, because it rules out the entire family of bad answers at once.

It also gives every idea a built-in honesty check: *if the chain state went the other way, would the
physical thing still be true?* A mapping that only makes sense when the number goes up is a
marketing device, not a material.

### ⛔ The anti-patterns, stated once

| never | why |
| --- | --- |
| **A glow** | *"Glow is foil, not light — a glow makes it a SCREEN and this is a card."* Already ruled on in `js/hero-card.js`. |
| **A badge, a number, a tier name printed on the face** | The card would be a dashboard. The art acknowledges you; it does not label you. |
| **Anything that makes rarity purchasable** | `docs/HERO-UNLOCKS.md`: *"no title can be bought."* Holding may never counterfeit what a card IS. |
| **A dial with no reference** | Absolute price is meaningless without a baseline — `js/lens-state.js` already refuses to render one. |
| **Anything that pays** | The anti-casino position. The prize is the having-done-it. |

---

## What a lens can actually read

Everything at fetch time, on-chain, no oracle:

| source | reads | used today |
| --- | --- | --- |
| the **edition** | `balanceOf` · `totalSupply` · `maxTotalSupply` · `getMarketState` (price, tick, liquidity) | ✅ all of it, as of today |
| the **lens itself** | `ownerOf` · `balanceOf` · `heldSince` · `lovebeingOf` · `voucherUsed` · mint counts | partly |
| the **chain** | `block.timestamp` · `block.number` · `blockhash` | tenure only |

---

## ✅ BUILT — holding is the foil's ruling

**Reads** `tierOfHolder(ownerOf(id))` → 0…4.
**Does** a finer-ruled grating: the same amount of metal, splitting light harder.
**Why it is honest** coverage is what the card IS (rarity, the artist's decision); ruling is what
the print run bought. A common card in a rich wallet is a brilliant *common* — it can never read as
a mythic, so money cannot buy rarity.
**Measured** hue travel 805° → 1090° (+35%) across nine view angles, coverage unchanged at 0.30.
Both halves proved by sabotage, and they fail independently.

## ✅ BUILT — tenure, and the ink cures

**Reads** `heldFor(id)` — seconds the current owner has held it.
**Does** *(mapping still to be spent on the render)* a sheet off the press is **wet**: dense,
glossy, liable to offset onto whatever it touches. It sets over hours and days into a matte, stable
print. A card that just changed hands renders wet and settles as it is held.
**Why it is honest** **time cannot be borrowed.** This is the one input immune to the flash-loan
objection that limits every balance-based idea to decoration. Balance says what you can afford;
tenure says what you actually did.
**Cost** one `SSTORE` in `_update`, which is already writing storage.

---

## Proposed, in rough order of how much they'd earn their keep

### 1 · The unminted 67 are **PROOFS**

**Reads** `_ownerOf(id) == 0` — state the contract already has, for free.
**Does** an unminted field card renders as a press proof: the **colour bar** down the margin,
registration targets at the corners, `NOT FOR SALE` slugged across the tail, trim marks uncut.
Minting promotes it to a finished, trimmed card.
**Why it is the strongest idea here** 67 of the 100 cards render without a mint and currently look
*identical to a minted card except for one metadata attribute*. That is a third of the deck with no
visual reason to exist yet. This makes the unminted state **meaningful rather than merely
pending** — and a proof is a genuinely desirable object, so it does not read as a lesser card.
It also makes minting an *event you can see*.
**Acceptance** a minted and an unminted card of the same id differ in a named list of marks, and
the proof's colour bar is measurably present (six patches, correct hues) rather than decorative.
**Cost** zero contract change. Renderer only.

### 2 · The card wears with its own provenance

**Reads** a transfer counter in `_update` (one more `SSTORE`).
**Does** each pass through hands is a pass through the feed rollers: corner softening, a fractional
loss of registration, edge wear. A card flipped ten times **looks flipped**.
**Why it is honest** provenance made visible, and card collectors already read wear as history
rather than damage. It also quietly discourages flipping without forbidding it — the anti-casino
position expressed as a material rather than a rule.
⚠ **The risk is real and worth stating:** wear reduces apparent condition, and condition is value.
This one could be read as the studio punishing trade. It may be better as *patina* — burnish and
warmth rather than damage. **Artist's call, and it should not be built until he rules.**
**Acceptance** measured corner radius and registration spread rise monotonically with transfer
count, and the effect saturates (a card does not become unreadable).

### 3 · A collection prints **in register**; an accumulation does not

**Reads** `balanceOf(owner)` **on the lens itself** — how much of the deck one wallet holds.
**Does** the mis-registration that defines this card (`docs/HERO-33-BRIEF.md` acceptance 4: one
constant offset vector per plate) **converges toward zero across a wallet's cards.** One card sits
crooked. A set sits square. Hold the whole run and the deck prints as one sheet.
**Why it is good** it distinguishes a *collection* from an *accumulation*, which is the actual
truth of card collecting and which no current mechanic expresses. It is also structurally already
there — registration is a single vector per plate and the render already varies it.
⚠ Careful: registration is the card's whole character. Removing it entirely at high counts would
make the reward *a blander card*. It should tighten, not vanish.
**Acceptance** mean |shift| falls with holdings, and the direction test from acceptance 4 still
reports ~0 (uniform, not radial) at every level.

### 4 · The Lovebeing is the maker's chop

**Reads** `lovebeingOf(owner) != 0`.
**Does** a **blind emboss** in the corner — a debossed studio mark with no ink at all, visible only
at a raking angle as it catches the key light.
**Why it is right** the Lovebeing is soulbound: it is a property of the *person*, not the asset. A
blind emboss is exactly that — the shop's mark on work it recognises, carrying no colour and
therefore no value claim. It also cannot travel: sell the card and the emboss is gone, because the
mark was never the card's.
**Acceptance** zero pixel difference under flat lighting; a measurable normal-map response under a
raking key. (That test is the definition of a blind emboss.)

### 5 · The press runs hot or cold with the market's **direction**

**Reads** `tick` against the session reference — the change, never the level.
**Does** a rising market over-inks: denser coverage, richer saturation, a little squeeze at the
edges of solids. A falling one starves: lighter, patchier, the roller band showing.
**Why it is honest** `js/lens-state.js` already refuses to render absolute price because it has no
meaningful baseline, and it is right. **Direction has no such problem.** The starve machinery
already exists — this just drives it from something truer.
⚠ It must be slow and bounded, or the card flickers with every trade.
**Acceptance** ink density tracks the sign of the tick delta, and a flat market is byte-identical
to today.

### 6 · Burn milestones stamp an edition band

**Reads** `burnBps()` — live today.
**Does** every 10% of the mint burned adds a permanent band to the card's edge, like a print-run
marker. Countable, monotonic, and it only ever goes one way because burns are permanent.
**Why it is good** it turns *"a number nobody can read into a thing you can count"* — which is
`js/card3d.js`'s own argument for its existing burn bands, generalised and made permanent.
**Acceptance** band count equals `floor(burnBps/1000)` exactly, and never decreases.

### 7 · The sheet fills in as the 33 mint out

**Reads** how many heroes have been claimed.
**Does** the card is a window on the **uncut sheet** it was cut from — `studio3d.html`'s position
exactly. Early on, the neighbouring pockets are blank stock. As the set mints, the neighbours
appear in the margin.
**Why it is good** it makes every holder's card a live scoreboard of the set's completion, without
a number anywhere, and it gives the genesis 33 a collective identity rather than 33 separate ones.
⚠ The most expensive of these to build, and the neighbours are *other artists' compositions* — it
needs the deck finished first.

---

## The one that needs a decision before it can be designed

⛔ **Pot escrow.** Eight game screens and four docs say on-chain token-pot escrow *"ships with the
721 lens."* It is not in the contract, and none of the above changes that. There is 7 KB of room.
It is a different kind of thing from every idea on this page — those are all **reads**, and escrow
takes **custody**. The contract's current safety argument is *"holds nothing, small enough to read
in one sitting"*, and custody ends both halves of that. With no external audit that is a real
decision, not a build task.

---

---

# The lens in the GAMES

⛔ **Start from the measurement: no game consults the lens at all.** The only chain read in any
game file is `eth_getBlockByNumber` — the latest block's **gas ratio** — in `js/card-powers.js` and
`js/rrpc-app.js`. Cards come from `localStorage`. The single genuinely on-chain thing in a match is
the **rake burn**, and that is the ERC-20, not the lens.

So everything below is unbuilt, and the surface it would read is now live: `tierOfHolder` ·
`burnBps` · `marketSnapshot` · `heldFor` · `lensState(id)`.

### ⛔ THE STANDING RULE FOR GAMES, AND IT IS SHARPER THAN FOR CARDS

**A balance is borrowable, so it may never touch a STAT.** Flash-borrow $3030 for one block,
snapshot a tier, play the match. On a card that gates only a colour this does not matter — it is
said out loud in the contract. In a game that keeps a score it is cheating with extra steps.

So: **holding may drive how you LOOK. It may never drive what you DO.** The one lens input immune
to this is **tenure** (`heldFor`), because time cannot be lent — which makes it the only input that
could ever gate something that counts.

### ⛔ AND A FINDING WORTH ACTING ON: `amp` IS A STAT MULTIPLIER DRIVEN BY NETWORK CONGESTION

`RipPowers.loadout()` scales **damage, fire rate, shields, speed and score** by
`amp ∈ [0.75, 1.7]`, derived from `gasUsed/gasLimit` of the latest Ethereum block. So how hard your
gun hits drifts by up to **2.3×** with how busy the chain happens to be that minute — something no
player perceives, controls, or can plan around. It is shared, so it is not *unfair* between
players; it is **noise in the number that decides how a weapon feels.**

⚠ And `js/card-powers.js`'s own header calls it *"LIVE $3030 market activity read straight off the
chain."* It is not — it is network weather on any chain the config points at.
`docs/CARD-POWER-MAPPING.md` describes it correctly; the code comment does not.

Two honest ways out, and they are a real choice:
- **Drive it from actual $3030 state** (burn, liquidity) — keeps the mechanic, makes the sentence
  true, and ties the games to the token instead of to Ethereum's traffic.
- **Take it off stats entirely** and let the chain drive weather instead (below) — the cleanest,
  because it stops a number nobody can see from deciding a fight.

---

## 1 · The burn is the one **shared world state** — and it is the strongest link available

**Reads** `burnBps()`. Global, monotonic, permanent, and **identical for every player**.
**Does** in THE CITY it drives the print pass — the ink, the sky, the light. As the community
burns, the city changes *for everyone*, and it never changes back.
**Why it is the best of these** every other input is personal, so it makes a private game.
This one is the only number in the project that is *the same for all of us and cannot be undone*.
It turns a single-player walking sim into a place with a shared history, for one `eth_call`.
It also finally makes deflation something you can **see** rather than read in a whitepaper.
**Anti-casino check** pays nobody, buys nobody anything, competes with nobody. Clean.
**Acceptance** the pass's measured parameters track `burnBps` monotonically, and two clients at the
same block render the same city.

## 2 · A photograph is stamped with the chain at the instant of the shot

**Reads** `burnBps()` + block number, once, at the shutter.
**Does** THE CITY's core hook — *"a photograph you take becomes a card"* — is still unbuilt. When it
lands, the card it produces should carry **the state of the token at the moment it was taken**.
Two identical photographs of the same corner, a week apart, are **different cards**.
**Why it is the most on-ethos idea here** the artist's frame is anticipation and the anti-casino
position is that *the prize is a thing you MADE*. A photograph stamped with a moment that can never
recur is exactly that: provenance as art rather than as a certificate. It is also the only thing in
the project that would make a *generated* card genuinely unrepeatable.
**Acceptance** two shots of the same framing at different burn states differ measurably, and the
stamp is recoverable from the card.

## 3 · A staked hero should be **real** — games trust `localStorage` completely

**Reads** `lensState(id).minted` / `ownerOf(id)`.
**Does** today a staked card is a `localStorage` entry, so devtools grants anyone any card. That is
fine while nothing counts — and `docs/SEATS.md` already says a seat is advisory. It stops being
fine the moment a **leaderboard or a title claim** depends on it, and the earned titles already
exist.
⚑ **The right shape is the one the collector seat already uses:** verify what can be verified and
**label** the rest, rather than pretending. Heroes 1–33 can be checked with `ownerOf`; field cards
are vault-only by design and should be shown as `verified: false`, exactly like the collector door
does when `lens721` is unset.
**Acceptance** a hand-edited vault entry for a hero shows as unverified; a genuinely held one
verifies. No card is silently rejected — this labels, it does not lock people out.

## 4 · Holding drives your kit's **finish**, never your numbers

**Reads** `tierOfHolder(player)`.
**Does** the same treatment the cards got today, on the thing you are flying or wearing: the foil
on the craft, the finish on the operative's kit, the trail. Ash → Inferno is a material, not a buff.
**Why** it is the standing rule above, applied. It is also the only way holding can appear in a
game at all without becoming pay-to-win.
**Acceptance** stats are byte-identical across all five tiers; the render is not.

## 5 · You burned **N of the M**

**Reads** `burnBps()` for the global figure; the player's own rips are already local.
**Does** show a player their own contribution to the permanent number. Not a score, not a rank —
a **stake in something that outlasts the session**.
**Why** *"the tangible prize is the having-done-it"*, stated as arithmetic. It is also the honest
version of a progress bar: the thing it measures is real and cannot be taken back.

## 6 · Tenure could gate what a balance never could — and probably still should not gate a title

`heldFor` is unfakeable, so it is the **only** lens input that could safely gate something that
counts. Worth stating clearly, because the temptation will be to spend it on the eleven titles.
⛔ **It should not be.** The titles are **feats** — *"each is a named feat in a named cabinet"* —
and **waiting is not a feat.** Tenure gating a title would quietly turn the one thing in this
project that cannot be bought into the one thing that can be *outlasted*, which is nearly the same
failure wearing a different hat. Spend it on a cosmetic, or on nothing.

---

### ⛔ Anti-patterns, for the games specifically

| never | why |
| --- | --- |
| **Deflation as difficulty** | "More burned ⇒ harder / rarer" makes the community's burning *punish* the players, and it is a treadmill nobody opted into. |
| **Holding on any stat** | Borrowable for one block. See the standing rule. |
| **A payout of any kind** | The whole position. The win is a title, a lens, a moment. |
| **Gating play behind a balance** | The arcade already has three doors and practice is open to all. Keep it that way. |
| **Silent chain influence** | If the chain changes the game, the game must SAY so. `amp` has moved every weapon in the arcade for months and nothing on screen mentions it. |

## How to judge any new idea

Four questions, from `docs/DESIGN-SYSTEM.md` §4 — a brief missing any of them produces the default:

1. **What is it made of?** (paper, ink, foil, emboss — not "an effect")
2. **How is it lit?**
3. **What moves, and why did it physically move?**
4. **What is the acceptance measurement?**

And one more this project has earned:

5. **If the number went the other way, would the physical thing still be true?**

*NFA. Experimental art token — it can go to zero.*

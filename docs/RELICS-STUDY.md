# Studying RELICS — what a lens can read, and the term we are missing

*Artist, 2026-08-05: "study this a bit for card art design (lenses)" — <https://www.relics.wtf/whitepaper>.*
*This is a STUDY, not a plan. Nothing here is decided.*

---

## ⚑ THE ONE SENTENCE WORTH THE WHOLE READ

> **immutable DNA + persistent token history + shared market state = the current Relic**

That is a **three-term** model. Ours has two:

| term | RELICS | `Ripmaster3030Lens721` today |
| --- | --- | --- |
| immutable DNA | six traits in one 256-bit word | the card **id / seed** ✅ |
| **persistent token history** | scars · resonance · lineage · evolve count | ⛔ **NOTHING** |
| shared market state | the hook's recorded market history | `getMarketState()` → burn · price · depth ✅ |

⛔ **THE MIDDLE TERM IS THE GAP, AND IT IS THE INTERESTING ONE.** Everything our card
renders today is either fixed at mint or read live off the market. **A card cannot
remember anything that happened to it.** Two cards of the same id, one ripped on launch
night and fought fifty times, one bought yesterday and never played, render *byte for
byte identically*. The lens has no way to tell them apart because we never gave it one.

⚑ **AND THIS PROJECT ALREADY GENERATES THAT HISTORY AND THROWS IT AWAY.** A card is
ripped from a pack, wagered in THE ARENA, staked, won, lost, carried by a squirrel,
photographed in THE CITY. All of it happens and none of it marks the card.

⚑ **IT IS ALSO EXACTLY THE STUDIO'S OWN ETHOS, RENDERED AS MATERIAL.** The artist's line
is *"the tangible prize is the having-done-it."* **A scar is a record of having-done-it.**
Not a payout, not a stat boost — a mark. That is the anti-casino position expressed in the
one place we have not expressed it yet: the surface of the card.

---

## 1 · REVERSIBLE vs PERMANENT — the distinction we do not make at all

RELICS separates these with real care, and names which is which:

| attribute | behaviour |
| --- | --- |
| Corruption State | *"current weather"* — reversible |
| Recovery State | reversible |
| **Scar Severity** | accumulated scars **+** current drawdown — part permanent, part weather |
| **Resonance** | *"strictly monotonic"* — only ever increases |
| Historical Tier | *"mostly permanent, but includes reversible drawdown bonuses"* |

⛔ **OURS IS ALL WEATHER.** `burn` is `maxTotalSupply − totalSupply`, a live global reading,
so every damage term on the card is a function of *right now*. **A card that has been
through something looks identical to a card that is currently in something.** That is a
real expressive loss and it costs nothing to see once it is pointed out.

⚠ Note the honesty in their own model: `Scar Severity` is *deliberately mixed* —
accumulated scars plus current drawdown. So a card carries both what happened to it and
what is happening, in one readable quantity. That is a better answer than picking a side.

---

## 2 · ⚑ THE SAME INPUT SHOULD NOT PRODUCE THE SAME PICTURE

> *"When the market falls, it falls for all of them at once"* — yet each archetype wears
> the same drawdown differently: **"a fragile Sacred Shard"** darkens toward collapse while
> **"a Buried Monolith merely dims."**

⛔ **THIS IS A DIRECT CRITICISM OF OUR STAKING LADDER AND I THINK IT LANDS.**
`tierOfHolder` returns one of five steps — Ash · Spark · Ember · Flame · Inferno — and
**every one of the 100 cards renders that number the same way.** One meter, a hundred
copies. The deck reads as a hundred instances of a single dial rather than as a deck.

⚑ **The fix is not more tiers, it is DNA MODULATING THE RESPONSE.** The shared reading
stays shared; how a given card *wears* it comes out of its own seed. A card whose seed
says brittle cracks; a card whose seed says dense just goes quiet. Same burn number, a
hundred different readings of it — and a collector learns their cards' temperaments,
which is a thing you cannot get from a bar.

⚠ This is cheap for us. `js/hero-card.js` already derives per-card constants from the seed
(film weights, registration, starve, band). Routing the market dials through those instead
of applying them uniformly is a change of *wiring*, not of architecture.

---

## 3 · Decorrelated trait axes — we already do this and never said so

> *"Colour is drawn from a different part of the word than form, so a vessel shape recurs
> across unrelated palettes and a palette is recognisable across unrelated shapes."*

✅ **We already do exactly this**, by accident of good practice: `hero-card.js` pulls each
subsystem off the seed with its own constant — `seed ^ 0x9E3779B9` picks pigment,
`^ 0x27D4EB2F` the creases, `^ 0x1B873593` the border sorts, `^ 0x2545F491` the type slop,
`^ 0x5F356495` the press motion. So form and colour genuinely vary independently.

⚠ **But it is undeclared and untested.** It is a property we happen to have, not one we
assert — and the recorded lesson in this repo is that an unasserted property is one that
quietly stops being true. A discriminating measurement exists: hold the pigment constant
and sweep the seed; the border family must vary while the palette does not.

---

## 4 · What NOT to take

⛔ **THEIR ART HAS NO ARTIST IN IT, AND OURS DOES.** RELICS is *"fully procedural and
on-chain — no stored images or external metadata"*: a 24,543-byte renderer emitting SVG.
Ours is `image = ipfs://CID` plus an `animation_url` framing a live page, because **the
pictures are Gianni's hand-drawn cards.** Going fully on-chain-generative would delete the
one thing that makes this deck his. Their constraint produced their aesthetic; copying the
constraint would import the aesthetic with it.

⚠ **Their immutability is a genuinely different bet.** 33 bytes under the 24,576 ceiling,
*"no room to grow into and no upgrade path"* — deliberate. Ours is 16,155 bytes with
`setUrls`, `setEdition`, `setTiers`, `setClaimSigner`. We chose recoverability; they chose
finality. Worth being able to say which we picked and why, because a collector will ask.

⚠ **10,000 supply vs our 100.** Their phenotype system exists partly to make ten thousand
procedural objects distinguishable. We have a hundred cards each of which is a drawing.
**We need less variation machinery than they do, not more** — the risk for us is burying a
drawing under a simulation.

---

## 5 · What I would actually propose (⟨proposal⟩, none of it decided)

1. ⟨proposal⟩ **Give the lens a third term: the card's own history.** Minimum viable is
   monotonic counters on `Ripmaster3030Lens721` — `rips`, `bouts`, `wins` — incremented by
   the same voucher signer that already gates `claimHero()`. No new trust: `kind 2` proved a
   human referee is acceptable here.
   ⚠ **The hard part is not the contract, it is that every score in this project lives in
   `localStorage` and is forgeable in seconds** — the finding that made the earned tier
   voucher-gated. History that a player can mint themselves is not history.
2. ⟨proposal⟩ **Split weather from memory in the render.** Burn stays live and reversible;
   marks accumulate and never decrease. Two visually distinct languages — the print gets
   *worse* under drawdown, and *older* with use.
3. ⟨proposal⟩ **Route the market dials through the seed** so 100 cards wear one number a
   hundred ways (§2). Cheapest item here and the biggest visible gain.
4. ⟨proposal⟩ **Assert the decorrelation** we already have (§3), before it stops being true.

⚠ **THE HONEST ORDERING NOTE:** items 1 and 2 change what a token *is* and touch a contract
that is not deployed. Item 3 touches only the renderer and could be done today. If only one
of these ever happens, it should be 3.

---

*Read: `docs/HERO-33-BRIEF.md` (what the card is made of), `docs/RENDER-CONTRACT.md`
(the SuperRare lens pattern), CLAUDE.md § Staking (why tiers are aesthetic only).*

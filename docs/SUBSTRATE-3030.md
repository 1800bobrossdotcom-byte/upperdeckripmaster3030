# 3030 — the substrate omni data layer

> Page `substrate.html` · deriver `npm run substrate` · suite `npm run test:substrate` (52)
>
> Artist, 2026-08-09: *"an omni ghost chain for eth and base that is basically the idea that eth
> prints a substrate and then each sigil and space or mark is on chain — so all typing, data
> input, the mundane code, all the typing each is an individual component of a larger work of live
> encryption — since is dually using the same language to encrypt."*
> Then: *"call the chain 3030"* · *"the substrate omni data layer protocol for eth and base"* ·
> *"L0 L1 L2"* · *"or 00"*.

---

## The one-paragraph version

Every transaction on Ethereum and Base carries calldata. Classify each byte three ways — **space**
(`0x00`), **sigil** (`0x20`–`0x7E`, a byte that also reads as language), **mark** (everything
else) — and pair each Ethereum block with the Base blocks that landed under it. That pairing,
hashed and linked, is a chain: **3030**, layer **00**. It has a genesis, a height and a head, and
it needs no validators, because a block is a pure function of blocks the two source chains have
already finalised. **Verification replaces consensus.**

---

## ⛔ The three claims, and why none of them is a metaphor

This is the part that decides whether the piece is any good. Every claim on the page is something
the chains say about themselves, and each is checkable in under a minute.

### 1 · Three quarters of both chains is empty space

Measured, not asserted. Ethereum block 25,714,463: **75.18%** of all calldata is `0x00`. Base
block 49,726,776: **71.47%**. Across the six-sheet derivation in `data/substrate.json`:
**67.21%** space, 12.73% sigil, 20.05% mark, over 1,796,078 bytes.

⚑ **The substrate is not something Ethereum prints *in addition to* the marks — it is most of what
Ethereum prints.** The ABI pads everything to 32-byte words, so the chain is overwhelmingly
padding. That is the artist's "substrate" as a census rather than a figure of speech.

### 2 · The protocol already prices paper cheaper than ink — by exactly four

⛔ **This is the strongest fact in the piece, and I got the number wrong the first time.**

Intrinsic calldata gas is `max(standard, floor)`:

| schedule | space | mark | when it binds |
| --- | --- | --- | --- |
| **standard** | **4** | **16** | any transaction with meaningful execution — **almost everything this census counts** |
| floor (EIP-7623) | 10 | 40 | only when `24·nonzero + 6·zero > execution gas`, i.e. a near-pure-data transaction |

⚑ **Measured both ways by slope**, against a target with heavy execution and one with none:

```
lens tokenURI (~311k gas of execution):   4.032 and 16.127 gas/byte   → standard binds
bare value transfer (no execution):      10.020 and 40.346 gas/byte   → floor binds
```

⛔ **I PUBLISHED 10 AND 40 AS "THE PROTOCOL'S PRICE" AND IT WAS THE FLOOR.** The measurement was
taken on a bare value transfer — correct for that transaction, wrong as a general claim, and wrong
in exactly the direction that flatters the story. Found by an adversarial review, not by any check
in this repo.

⚠ **AND IT IS TWO ERRORS IN ONE NUMBER, WHERE THE SECOND SURVIVED THE FIRST FIX.** The first pass
read 3.71× at a single point; switching to a two-point slope corrected the estimator's buffer and
produced a clean 4.0011×, which *looked* rigorous — and was still measuring a transaction shape
almost nothing on either chain has. **A measurement can be precise, reproducible, and answering
the wrong question.** The tell was there: the target was a bare transfer, and a census of real
calldata is not counting bare transfers.

✅ **THE RATIO IS EXACTLY 4× UNDER BOTH SCHEDULES, AND THAT IS THE DURABLE CLAIM** — the one number
that does not depend on which schedule binds. It is also one the protocol has deliberately kept
through two repricings:

- **before EIP-2028** (Istanbul, 2019): a mark cost **68** against a space's 4 — a ratio of **17×**
- **EIP-2028** took 68 down to 16 and left 4 alone → **4×**
- **EIP-7623** later scaled both by 2.5 (to 10 and 40) → **4× again**

⚑ **Ethereum has re-priced the relationship between space and mark twice, and settled on four both
times.** That is a better fact than the one it replaced.

### 3 · The same byte is instruction and glyph

`0x60` is `PUSH1` to the machine and a backtick to a reader. `0x20` is a stack operand and a
space. Nothing is concealed and there is no key — **the cipher is the register you read in**. That
is why "encryption" is the right word and not decoration: the plaintext has been public the whole
time, in a reading nobody performs. *"Dually using the same language to encrypt."*

The **ghost text** makes it visible: runs of four or more printable bytes found inside calldata
nobody wrote as text. One sheet carried 1,070 of them. A sample, unedited:

```
$tYES_OR_NO_QUERY        relaydepository        bc_6q3ubwtz
<team_cll5mvyyt0kwx3n0um7zjdxoh-prj_clv08989h02jr86q694h8b795
```

⚑ Each was typed by somebody into a system, paid for in gas, and is now permanent. That is the
artist's brief — *"all typing, data input, the mundane code"* — arriving as evidence.

### 4 · Glyphs — and the chain turns out to be monolingual

*Artist: "what about glyphs and other type of formations."* The ASCII-only classifier was blind to
every writing system but one: Chinese, Arabic, Cyrillic, Devanagari and every emoji counted as
opaque **mark**. In a census whose whole claim is *"this is language nobody reads"*, that silently
asserted the only language on-chain is English.

⛔ **THE FIRST FILTER WAS NOT NEARLY GOOD ENOUGH AND THE DATA SAID SO.** Keeping any valid UTF-8
sequence that sat beside an ASCII byte reported **0.93% glyphs** — and the kept "text" came back
as `ă)Z>>Q`, `Ϫő:g`, `P񮳥Ս`: Coptic beside Tibetan beside a **private-use codepoint on plane 15**.
That scatter is the signature of noise. Random bytes form a valid 2-byte UTF-8 sequence ~2.9% of
the time, and calldata is mostly hashes. **I had written the false-positive argument in the
comment and then shipped a filter that did not clear it.**

✅ Real text has two properties random bytes do not: it **clusters in one script** and it **comes
in runs**. Requiring ≥2 consecutive glyphs sharing a script band, and refusing private-use planes,
took the number from 0.93% to **0.02%** — 468 bytes kept, 17,756 candidates rejected.

⚑ **So the finding is that the substrate is effectively MONOLINGUAL**, and that is more interesting
than the number it replaced. What is written into these chains is ASCII: machine identifiers,
English, and hex. The page states this as a result and shows the rejected count, because a
near-zero share otherwise reads as a broken detector.
⚠ `test:substrate` asserts the filter **rejects far more than it keeps** — deliberately not a floor
on glyphs, because a floor is pressure to loosen the filter until it is met.

### 5 · Formations — the structure above the byte

A byte census says what the typing is *made of* and nothing about how it is *set*. The ABI lays
every argument on a **32-byte grid**, which is the closest thing the chain has to a typographic
measure — and once the grid is visible the substrate stops being a field of dots and becomes a
page with lines on it.

| formation | what it is | measured |
| --- | --- | --- |
| **WORD** | the 32-byte ABI grid — the line | 63,605 |
| **RULE** | a word of pure zero — the blank line | 6,191 · **9.7% of all lines** |
| **ADDRESS** | 12 zeros then 20 bytes — a proper noun | 6,768 |
| **SELECTOR** | the first 4 bytes of a call — pure ink | 4,425 |

⚠ **These are SHAPES, not declarations.** Calldata is untyped bytes, so a word that looks like an
address may be a small number sitting in the same place. They are counted and named as shapes,
never as claims about what a call does.

---

## ⛔ The attack suite found a real vulnerability in my own construction

*Artist: "do more cryptography grade white hat black hat grey hat rainbow clear hat tests."*
`npm run test:substrate:attack` — 33 assertions across five hats. It broke the construction on its
first run.

**⬛ B1 · the canonicalization / field-splitting attack.** The hash was
`fields.join(SEP)`. That is ambiguous the moment any field can contain the separator:
`['0xAA','0xBB']` and `['0xAA␀0xBB']` produce the **identical string and therefore the identical
hash**, so an attacker moves bytes across a field boundary for free.

⚠ It was not exploitable — no legitimate field can encode NUL, since every one is hex or the fixed
canonical string. **But that is an unenforced invariant holding the security**, which is exactly
the shape that becomes a hole the day somebody adds a field.

✅ **Fixed by netstring framing:** each field is encoded `len:field` before joining, the same idea
as NIST's TupleHash. Two different field lists can no longer produce one string, whatever the
fields contain. The genesis carries `framing:v2` so a chain built the old way can never be
mistaken for one built this way.

### The other four hats

- **⬜ WHITE — avalanche.** A change to any input flips 122–143 of 256 output bits. This is not a
  test of sha256; it is a test that each input *reaches* sha256. **A field dropped from the join
  shows an avalanche of exactly zero**, which is the bug class that hides here.
- **◩ GREY — the silent vector.** The worst defect in a commitment scheme is a field that is
  *recorded but not hashed*: nothing errors, every test passes, and the value can be rewritten at
  will. Every field is probed, and every deliberately-unhashed field is listed **with its reason**
  — including that `runs` (the ghost text) is a display sample and is **not attested by the chain**.
- **🌈 RAINBOW — replay.** The genesis binds the protocol name, the title, the framing version and
  **both source chain identities**, so a digest computed for one protocol or version cannot be
  presented as valid in another.
- **⬦ CLEAR — attacks that succeed, demonstrated rather than hidden.** The most important section.
  ⛔ **A chain of entirely invented source blocks verifies perfectly.** There is no signature and
  no proof-of-existence, so internal consistency is **not** proof the source blocks are real. The
  mitigation is re-derivation against a live node. Also stated: the hash proves the census was not
  edited *after* derivation and nothing more — a deriver that miscounts produces a self-consistent
  wrong chain; nothing here is secret; and a source reorg silently invalidates a derived block.

---

## The structure

**One Ethereum block is one sheet; the Base blocks under it are the impressions on that sheet.**
ETH is ~12s and Base ~2s, so roughly six Base blocks land inside every Ethereum block. The slow
chain sets the sheet; the fast chain does the typing. That is what makes the layer *omni* rather
than two panels side by side.

Pairing is by **timestamp window** — a Base block belongs to the sheet whose `(parentTs, ts]`
window contains it — so the rule is total, deterministic, and depends on nothing either chain can
revise.

```
hash(n) = sha256( hash(n-1) ‖ ethHash ‖ baseHash… ‖ canonical(census) )
```

⚠ **The census is inside the hash on purpose.** Hashing only the source hashes would make this a
linked list of pointers — a chain that is correct and says nothing. Committing to the census makes
the hash a claim *about the reading*, so a deriver that miscounts produces a different chain and
is caught by anyone who recomputes.

⚠ **sha256, not keccak**, and the reason is about the page: `crypto.subtle` gives every browser
sha256 with no dependency, so `substrate.html` **recomputes the whole chain in front of you**
rather than asserting it. A verification you have to be talked into trusting is not one.

### ⛔ The separator is a NUL byte, written as an escape

NUL is right on the merits — it cannot occur inside any field it separates, so `a‖b` can never be
confused with `a'‖b'`. It was originally a **literal, invisible `0x00`** in the source: the line
read as `.join(' ')` in every editor and diff, hashed as NUL, and disagreed with every hand
reconstruction — including the page's own verifier, which reported a healthy chain as broken.

⚑ **The tell was that `grep` had started calling the file binary**, which is easy to skim past.
A separator you cannot see is a separator you cannot review. Written `\x00` it is visible,
greppable and the identical byte, so the chain derived before the fix is still valid.
⚠ `test:substrate` extracts the separator from **both** the module and the page and requires them
to agree — coupling-by-test, the same instrument as the city/section-9 weapon tables.

---

## ⛔ 00, not L0 — and the difference is a true claim versus a false one

The artist floated `L0 L1 L2`, then `or 00`. **00 is the one to ship.**

"L0" already means something, and it is not this: in common use a layer zero sits *beneath* the
L1s — the networking/interop substrate several chains plug into. 3030 does the opposite. It sits
on top of Ethereum and Base and reads **down** into them. Shipping "L0" would claim a position in
the security stack this layer does not hold, on a page whose whole argument is that it adds no
trust assumption.

⚑ **`00` is the byte.** `0x00` is the zero byte — the space, the paper, ~70% of both chains. The
layer is named after the material it is made of, and the name is therefore a *measurement*. That
is the artist's instinct landing somewhere stronger than the convention it started from.

| | |
| --- | --- |
| **L1** | ETHEREUM — substrate, prints the sheet |
| **L2** | BASE — impression, types on it |
| **00** | 3030 — the reading; the zero byte both are mostly made of |

⚠ Stated on the page in words, not implied by a number: **00 is not below them, it is inside
them.** `test:substrate` asserts the page never says "L0".

---

## ⛔ THE ASYMMETRY IS REAL, AND IT IS THE ARCHITECTURE — measured 2026-08-09

*Artist: "we create a base lens · that is a ghost lense 3030 lens · that mirrors the l1 lense · and
then the 3030 lense is the full recursive composite lense."* Whether that trinity can exist turns
on one question, and it has a definite answer.

**BASE CAN READ ETHEREUM SYNCHRONOUSLY. ETHEREUM CANNOT READ BASE.**

The OP-Stack `L1Block` predeploy at `0x4200000000000000000000000000000000000015` exposes the
latest L1 header to any Base contract as ordinary state: `number()`, `timestamp()`, `hash()`,
`basefee()`, `blobBaseFee()`. **Verified in both directions**, the standard every address in this
repo is held to — Base reported L1 block **25,714,638** with hash `0x89b38c57ae80…8612a`, and
Ethereum returns that exact hash at that exact block.

⚑ **It is not an oracle and it is not a bridge.** The value is in the L2's own state, derived from
L1 during block derivation, so a Base contract reading it inherits Ethereum's ordering with no new
trust assumption. That is the strongest possible form of this and it is available today.

⛔ **THE REVERSE DOES NOT EXIST.** An L1 contract cannot read Base state at render time: OP-Stack
messaging is L2→L1 withdrawals behind a prove/finalize challenge window measured in days, not a
call a `tokenURI` can make. CLAUDE.md already recorded this; it is now measured rather than
recalled.

### ⚑ So the trinity resolves, and the constraint is productive rather than limiting

| lens | chain | can see |
| --- | --- | --- |
| **the L1 lens** — `Ripmaster3030Lens721`, deployed | Ethereum | Ethereum only. **Blind to Base by construction.** |
| **the ghost lens** — to build | Base | **Both.** Base natively, Ethereum through `L1Block`. |
| **the 3030 lens** — the composite | — | see below |

⚑ **THE GHOST LENS IS THE ONLY ONE THAT CAN SEE BOTH CHAINS, AND THAT IS THE WORK RATHER THAN A
WORKAROUND.** It matches the substrate's own layering exactly: **the sheet cannot see what is
printed on it; the impression can see the sheet.** A lens on Base looking back at Ethereum is
structurally the same gesture as an impression looking back at its own paper.

### ⛔ AND THE LAG IS THE GHOST — *artist: "old data"*

He spotted it immediately. `L1Block` runs **~5 blocks / ~60 seconds behind** the Ethereum head, so
a Base lens renders **Ethereum as it was a minute ago**. That is not an error bar to apologise for:
it is a physical property of the system, it is the same reason starlight shows a star that has
already moved, and it is exactly the kind of cause `DESIGN-SYSTEM §4` demands — *what moves, and
why it physically moved*. **A ghost sees the past. This one is measured, and it is late by
construction.**

⚠ **WHAT IS STILL OPEN, and it is the hard one:** whether a "full recursive composite" can be
on-chain at all, given L1's blindness. The honest candidates are (a) the composite lives on Base,
where both reads exist; (b) the composite is explicitly a READING, which is what the 3030 layer
already is; (c) an attestation is committed to L1, which adds a trusted signer and must say so.
**Not decided here** — see the recommendation this section was written to feed.

---

## ⚠ What this is NOT — the limits, stated before anyone else states them

- **It cannot settle anything.** No transactions, no accounts, no writable state. It is a
  *reading*. Every byte it indexes was paid for and ordered by Ethereum or Base.
- **It is not a new blockchain and cannot become one by degrees.** If a future surface wants to
  move value, that is a different design and nothing here is evidence for it.
- **Text in calldata is not new.** Ordinals, on-chain messages, the Genesis block's newspaper
  headline. What is fresh is the *composition* — census + fee-schedule reading + deterministic
  derived chain. A new arrangement of true things, not a discovery.
- **The census is a reading at a moment.** Re-deriving reads different blocks. What is checkable
  forever is that a recorded reading hashes to its recorded hash.

⛔ **The failure mode for this project is INFLATION, not error.** This is exactly the kind of idea
that sounds profound and can be talked up into claims that are false. The studio already refuses
to publish a burn percentage because a printed number drifts into a lie with nobody editing
anything; the same rule governs every sentence here.

---

## 💰 Ways this could make money — and the ones to refuse

The artist asked directly. Answering it honestly means starting from a constraint that rules out
the obvious answers.

⛔ **THE LAYER IS DERIVED, SO IT CANNOT BE GATEKEPT.** Anyone who can read Ethereum and Base can
recompute every block of it. That is the property that makes it trustworthy and it is also why
**there is nothing here to sell access to.** No fees, no gas, no sequencer revenue — a layer that
settles nothing collects nothing. Any pitch that implies otherwise is the deceptive thing this
studio does not do.

So the question becomes: *what is actually scarce?* Not the layer. **A specific reading.**

### ✅ 1 · A sheet is a card — the strongest one, and it needs no new machinery

A ghost block is a unique, permanent, verifiable composition derived from two blocks that will
never recur. That is an edition mechanism that costs nothing to produce and is 1/1 **by
construction** rather than by promise.

It plugs straight into what already exists: `Ripmaster3030Lens721` does render-by-id with on-chain
metadata, and the renderer already reads chain state. A sheet — its census, its proportion of
paper to ink, its ghost text — *is* a card face, and the artist's own frame already says the
trading card is **a size before it is anything**.

⚠ **Scarcity has to come from a RULE, not from throttling.** One sheet per Ethereum block is
unbounded supply. A defensible rule picks the sheet out of the chain rather than rationing it:
the day's highest sigil share, the first sheet whose ghost text contains a given word, one sheet
per calendar day. **The rule must be publishable in advance and checkable afterwards**, or it is
just the studio deciding what is rare, which is the thing `HERO-UNLOCKS.md` forbids.

### ✅ 2 · Your own block, read as a sheet — probably the most sellable, and the cheapest to build

The deriver already does this; it only needs to accept an arbitrary block number instead of the
head. *"The block your mint landed in."* *"The block you deployed in."* Somebody's own
transaction, rendered as the substrate it actually sat in, with the real ghost text that shared
the block with it.

⚑ It has genuine emotional pull, it is self-serve, it is honest (you are selling a specific dated
reading, not a claim about future value), and the marginal cost is a few RPC calls.

### ✅ 3 · Free material for the deck that already has a revenue model

The ghost text is authored-by-the-world source material with perfect provenance. `docs/CC0-SOURCES.md`
already treats sourcing as a first-class problem; this generates an endless supply of strings that
are public, dated, and verifiably not ours. That is not revenue directly — it feeds the packs,
which are.

### ✅ 4 · The honest funnel argument, which may be worth more than 1–3

`docs/CAPITAL.md` measured the binding constraint: **31 holders. 97.38% of supply has never left
the curve.** The constraint is *people*, not mechanism. This is the most genuinely interesting
artifact the studio has for a crypto-native audience — verifiable, surprising, and checkable in
thirty seconds. **The 4× gas fact is a shareable finding, not an advertisement.** At 31 holders,
thirty collectors is +97%.

### ⛔ And the ones to refuse, with reasons

| refuse | why |
| --- | --- |
| **A token for the layer** | `ECONOMIC-FLOW.md` line 29: *"$3030 is the only fungible token."* The Base-token idea was already rejected on arithmetic (`docs/BANKR-SWARM.md`); a second one here is the same loop wearing a ticker. |
| **Selling access / an API tier** | It is derived. Access cannot be withheld, and pretending it can is a lie with a price on it. |
| **Calling it an L0, an L3, or "a new chain"** | False. It settles nothing. This is the claim that would get the project rightly taken apart. |
| **Writing our own bytes to make prettier sheets** | The moment the studio types into the substrate to improve the artwork, the census stops being a reading of the world and becomes a reading of us. That is the wash-trading argument in another register. |

---

## Files

| | |
| --- | --- |
| `scripts/substrate.mjs` | the deriver · `npm run substrate [--sheets N]` · **the protocol name lives here and nowhere else** |
| `data/substrate.json` | the derived chain, carrying the name and the layer to the page |
| `substrate.html` | the reading · wallet-free, read-only, recomputes its own chain |
| `scripts/test-substrate.mjs` | `npm run test:substrate` — 60 assertions, four sabotages |
| `scripts/test-substrate-attack.mjs` | `npm run test:substrate:attack` — 33 adversarial assertions, five hats |

⛔ **The protocol name is never typed in `substrate.html`.** The 2026-08-01 rename touched 258
files and was still wrong on 200+ live surfaces a day later, because the name had been *typed*
everywhere instead of *read* from somewhere. The artist floated three names for this layer before
settling on 3030, so the cost of the next rename is **one constant**. `test:substrate` asserts
the literal never appears in the page body, and — in the other direction, because "no literal" is
trivially satisfied by showing no name at all — that it still reaches the DOM.
⚠ The `<title>` and social meta tags *are* hard-coded and are the deliberate exception: a crawler
reads them before any script runs, so a runtime-only title is no title.

---

## ⚠ Open, and the artist's

1. **The name.** `3030` is settled — but it is also the ERC-20 `symbol()`. Coherent (the token
   and the layer are the same work) and worth one deliberate decision, because prose must never
   leave a reader unsure whether "3030" is the ticker or the chain. Every surface here says *"the
   3030 layer"* or *"$3030"* and never a bare 3030 where the two could be confused.
2. **Whether sheets become cards**, and if so the selection rule — see §1 above. That rule is
   authorship, not arithmetic.
3. **How many sheets the shipped chain should carry.** Six is a demonstration. A day is ~7,200
   Ethereum blocks; the derivation is linear in blocks and the data file is not small.
4. **Whether this is linked from the front page.** Currently unlinked, and allow-listed in
   `test:reach`'s `ORPHAN_OK` **with a reason and a stated end** — it gets linked or it gets
   deleted, the same terms `toll.html *(removed 2026-08-09 — the rail is for tools, and it was a game)*` is held to.

---

## ⚠ Named next, not built — the artist's later directions

Recorded so they are decisions rather than drift. Each is cheap because the deriver already holds
the numbers; none is started.

- **x-y-z and n space.** The sheet is currently a flat field. The ABI grid gives a *real*
  coordinate system rather than an imposed one: **x** = byte offset within the 32-byte word (the
  column), **y** = word index (the line), **z** = transaction index within the block (the stack).
  That makes a block a volume. Separately, **n-space**: each block is a vector of its census and
  formations, so the chain is a *trajectory*, and two blocks can be compared by distance.
- **Mattes / disappearing ink / fake substrates.** The blanks are not absence — they are
  **mattes**, hold-outs with a shape. `RULE` already counts full-zero words; what is not yet
  measured is *where* the zeros fall: leading-zero runs (address padding is exactly 12), trailing
  runs, and the difference between structurally-required padding and a deliberately reserved
  slot. A "fake substrate" is a region that reads as paper but is a hold-out.
- **Language and linguistics.** The ASCII half is untouched as *language*: word frequency, what
  the identifiers actually are, how much is English versus base64 versus hex. The monolingual
  finding above is the opening result, not the end of that line.

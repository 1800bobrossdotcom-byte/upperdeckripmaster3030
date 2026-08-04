# THE 33 — generative 3D cards, painted from the deck

*Artist, 2026-08-04: "for the 33 cards, lets try to make them from scratch as 3D cards with ARIAL
font, with memetic names, and have them as living generative works with glitches, and fx
treatments. use the 100 cards as source material to paint these cards."*

**DRAFT FOR THE ARTIST.** Proposals, not decisions. Strike what is wrong.

This brief exists in this shape because `docs/DESIGN-SYSTEM.md` §9 records the same failure twice:
a brief that names a material and a mood and waves at motion produces a beautiful object that is
dead to the touch. So: **made of · lit by · what moves and why it physically moved · sits on ·
how we measure it.** Nothing gets built until all five are answered.

---

## 0 · ✅ SETTLED — **NO FONT** (artist, 2026-08-04)

**The type is geometry.** Nothing ships as a font and nothing is named in CSS.
`scripts/build-card-type.py` (`npm run cardtype`) turns a name into contours at BUILD time; the
browser gets polygons and never asks what is installed.

- Outline source is **Liberation Sans Bold** — metric-compatible with Arial, so it is the look
  that was asked for, and OFL, which permits derivative works. ⚠ Tracing Arial itself would still
  be deriving from a licensed face. **What is committed is coordinates, not type software.**
- ⚑ **And it is the better art answer, not the compromise.** A displaced plate, a mis-registered
  separation and a torn edge are things you do to SHAPES. A CSS font cannot be pulled apart; an
  outline can. **The glitch wants the type to be a mesh.**
- ⚠ `DecomposingRecordingPen`, not `RecordingPen` — composite glyphs are references, and a plain
  recording pen hands back the reference. The symptom is a letter that comes out silently EMPTY,
  which reads as a spacing bug rather than a missing glyph. A missing codepoint exits loudly for
  the same reason: a dropped glyph is a name that ships wrong on a 1/1.

Proven: `SCRAM JETS` → 9 letters · 11 contours · 830 points; `GET IT OUT OF MY HOME` → 16 letters ·
19 contours. Counters stay hollow, metrics match.

### Why it mattered — the reasoning, kept

## 0b · ⛔ THE FONT WAS A DEPLOY DECISION, NOT A STYLE ONE

`--fat` is `'Arial Black', Arial, sans-serif`. **Arial Black does not exist on Linux or Android**,
and we vendor Anton, Bungee and Share Tech Mono — no Arial. On the site that is cosmetic drift. On
a **1/1** whose `animation_url` renders in a *sandboxed iframe at an opaque origin*, it means every
collector's machine decides what the permanent artwork looks like.

Arial is Monotype-licensed and cannot be embedded. Three routes:

| route | cost | verdict |
| --- | --- | --- |
| **Liberation Sans** | 60 KB, OFL, metric-compatible with Arial | works, ships legally |
| **⭐ Draw the type as OUTLINES** | build step; `scripts/blender/build-hero-type.py` already does this for the wordmark | **recommended** |
| Name Arial in CSS and hope | free | ⛔ not viable for a 1/1 |

⚑ **Outlines are also the better ART answer**, which is why they are the recommendation rather than
the compromise: letterforms as geometry can be displaced, sheared, exploded and mis-registered by
the same machinery that glitches everything else. A CSS font cannot be. **The glitch wants the type
to be a mesh.** You keep designing *in* Arial; it ships as shapes.

⚠ Arial-the-look is exactly right and is not in question — it is the flat, unlovely, institutional
face of every deep-fried image and every Rare Pepe. That register is the point.

---

## 1 · WHAT IT IS MADE OF

**Printed card stock that has been through the press too many times.**

Not "a 3D model with effects on it". The card is *paper* — the same stock as the rest of the deck,
`docs/DESIGN-SYSTEM.md` §1's foil-card material — and everything that happens to it is a **printing
failure**, not a screen failure:

- **plate mis-registration** — the colour separations never quite line up (⚠ uniform per plate, NOT
  radial; radial is chromatic aberration, a *lens* artefact, and getting that wrong reads as a
  cheap camera instead of a cheap print — this project already learned it in `js/city-ink.js`)
- **overinking and starvation** — bands where the roller carried too much or ran dry
- **halftone breakdown** — dots coarsening until the image gives up
- **tears, folds, creases** with real thickness
- **the die-cut edge** breaking into prism, because it is foil

⛔ **THE GLITCH MUST NOT BE EMISSIVE.** Scanlines, RGB-split-with-a-glow, CRT bloom — those make it
a *screen*. This is a **card**. Every artefact must be something that can happen to paper under a
press or a scanner. That single constraint is what keeps 33 generative cards from looking like
everyone else's generative cards.

### The 100 are the pigment

*"use the 100 cards as source material to paint these cards."*

The deck is the palette. A hero is **composed of other cards** — sampled, torn, offset, re-scanned:
strips of one card's ground under another's figure, a third's type ghosting through, a fourth's
halftone bleeding at the edge. The 33 are what the deck looks like *after* it has been through the
machine.

⚑ **This is the studio's own lineage rather than a filter.** Rare Pepes, Fake Rares, MAD, cereal
boxes — the form has always been recombinant, and a hero built out of the field cards says the set
is one object rather than a hundred separate ones.
⚠ **Only our own art.** Every sample is one of the 100 or the artist's own work. Nothing third-party
gets composited into a 1/1 — and `docs/CC0-SOURCES.md`'s rule stands: informed by, never named after.

---

## 2 · HOW IT IS LIT

**One low raking key, and nothing else that matters.**

- Raking, so the *relief* reads — ink sitting proud of stock, the crease, the die edge, the emboss.
- **The foil reflects the environment; the artwork never does.** Recorded twice in this repo, both
  times as a milky wash that measured as lifted blacks and lost saturation (`js/card3d.js`, the CSS
  `.glare`). Metal takes the env map; the art plate takes the key only.
- **The glitch does not light itself.** A displaced plate is still lit by the same key from the same
  direction — that is what makes it read as *the plate moved* rather than as *a filter was applied*.
- Ambient stays low. Paper in a room, not paper in a lightbox.

---

## 3 · ⛔ WHAT MOVES, AND WHY IT PHYSICALLY MOVED

*This is the section that gets waved at. It is the reason two wordmarks were rejected. Everything
below names a physical cause; nothing is "it animates".*

### It is STILL at rest

⛔ **Zero displacement, zero drift, nothing breathing.** `DESIGN-SYSTEM` §4 and the wordmark rig
both hold this line and it is asserted, not intended. A card that seethes on its own is a
screensaver, and it also destroys the one thing that makes a glitch land: **contrast with stillness.**

### Three things move it, in order of how often you will feel them

**1 · YOU DO.** Tilt/pointer/touch. The card is a physical object being handled:
- plates parallax against each other (the layer stack — see `docs/CARD-LAYERS-BRIEF.md`)
- the foil's hue walks with the half-angle (§1's acceptance test: **no hue shift, no foil**)
- the stock **flexes** — press it and it dishes, release and it rings, exactly as the wordmark's
  20-letter rig already does

**2 · THE PRESS RUNS.** The generative layer: the sheet advances, the plates hunt for registration
and never quite find it, the ink film thins and recovers.

⛔ **AND THIS SECTION CONTRADICTED ITSELF. STILLNESS WON — settled in step 1.** The first draft
wanted the press on a slow clock, "the way you notice a fridge stopping." That cannot coexist with
"zero displacement, zero drift, nothing breathing" three paragraphs up, and acceptance 2 demands
**exactly 0** over ten seconds with no input. One of them had to go, and the ambient cycle is the
one that should: it is the screensaver §3 rejects, and it destroys the contrast with stillness that
makes a glitch land at all.
⚑ **So the press is driven by HANDLING.** Work you put into the card accumulates, and at one
sheet's worth the impression **advances** — new registration, new ink film, new creases, the type
re-set with fresh slop. It is the same input as motion 1 at a different timescale, it is physical
(a press runs when somebody runs it), and a card nobody is touching is a card sitting on a table.
⚑ **A corollary worth keeping: your card is ONE BAD PULL.** Registration is frozen at the moment
of the impression, not drifting under you. That is what makes it a specific object rather than an
effect, and it is also what makes acceptance 4 measurable.

**3 · ⛔ THE TOKEN DEGRADES IT — and this is the one that makes it LIVING rather than merely
animated.** The renderer already reads `getMarketState()` and derives burn from
`maxTotalSupply − totalSupply`. `Ripmaster3030Lens721.tierOfHolder()` already reads the owner's
balance. **So the card's condition is on-chain state:**

- **more burned ⇒ more damaged.** The set is deflationary; the survivors show the mileage. The
  token burns so the art can live, and the art should carry the scars of it.
- **the holder's tier rakes the light differently** — the staking ladder is already built
  (Ash · Spark · Ember · Flame · Inferno) and already in `tokenURI`.
- ⚠ **Pull-based, so it moves as fast as clients refetch.** Recorded caveat, still true.

⚑ **Nothing here is a payout and nothing gates on holding *more*.** The anti-casino line holds: the
art acknowledges the state of the edition, it does not reward you for it.

---

## 4 · WHAT IT SITS ON

- **The binder pocket** (`cards/binder.html`) — nine-up, alongside the field cards, same stock.
- **SuperRare's media slot**, sandboxed, opaque origin, no localStorage, no wallet, no parent
  access, reachable cold. `cards/hero/_template.html` already encodes every one of those.
- **A phone, in a 320 px sleeve.** ⚠ The recorded aspect trap: `height:100%` + `max-width:100%`
  makes `aspect-ratio` silently yield — measured 0.571 instead of 2:3. Test at 320 wide in a real
  sandboxed frame or it is not tested.
- **A durable base underneath.** The lens is an enhancement over an IPFS-pinned still, never the
  only copy. If the HTML dies the card survives. THE CARDS PERSIST.

---

## 5 · HOW WE KNOW IT WORKED — the acceptance measurements

*Numbers, not opinions. Each one fails on a build that only looks right.*

| # | claim | measurement | bar |
| --- | --- | --- | --- |
| 1 | it is foil | median hue travel across ≥ 8 view angles | **≥ 200°** (the wordmark got 261°) |
| 2 | it is still at rest | max vertex/plate displacement over 10 s, no input | **exactly 0** |
| 3 | it is reactive | displacement under pointer, and it **overshoots** on release | > 0, overshoot > 0 |
| 4 | the glitch is PRINT, not screen | plate offsets are uniform per plate, not radial | variance across frame ≈ 0 |
| 5 | it is deterministic | same seed → byte-identical frame | exact |
| 6 | each of the 33 is its own | pairwise frame distance at t=0 | all distinct |
| 7 | it is made of the deck | every sampled source resolves to one of the 100 | 100% |
| 8 | the type is not a font | renders identically with **no fonts installed** | exact |
| 9 | it degrades with burn | frame at burn=0 vs burn=max measurably differs | distinct |
| 10 | it survives the sandbox | loads at opaque origin, 320 px, no storage, no wallet | renders |

⚠ **1 and 4 are the two that catch a fake.** A rainbow gradient painted on a surface passes a
screenshot and fails #1 — it is a *sticker of* foil. A radial RGB split passes the eye and fails #4
— it is a lens artefact wearing a print costume.

### ✅ 1–5 are MEASURED on card 1 — `npm run test:hero`, 20 assertions

| # | measured | bar |
| --- | --- | --- |
| 1 | **612°** median hue travel across 9 yaws | ≥ 200 |
| 2 | flex **exactly 0** after 10 s, and the frame is **byte-identical** | exact |
| 3 | dish −0.067 under the thumb, **+0.014 overshoot** past rest on release, settles to 2e−26 | > 0 |
| 4 | plates move 5.20 px, spread **0.21 of the shift**, slope 1.31 px/radius | < 0.35 |
| 5 | same seed + same drive → **byte-identical**; a different seed differs | exact |

⚑ **AND FOUR AND FIVE PROVE THEY DISCRIMINATE, IN THE TEST ITSELF.** #4 runs the same block-match
over a build whose registration has been made deliberately **radial** and requires it to fail
(it does: spread 0.35, slope 9.40). #5 requires two *different* seeds to differ, because "the two
frames match" is trivially true of two black frames. **A check that cannot fail is not a check.**
⚠ The other four were proved to bite by sabotage, and the result is worth keeping: killing the
grating dropped #1 from 612° to **12°**; a wall-clock breath in the shader broke the frame hash
(and #5 with it) **while "flex is exactly 0" stayed green** — which is precisely why the
frame-identity half of #2 is the load-bearing one; replacing the spring with a lerp took the
overshoot to **0.00000** while "it moves" still passed.

⛔ **#10 IS NOT PROVEN AND MUST NOT BE ASSUMED.** `cards/proof.html` loads `/gate.js`, so in a
sandboxed iframe at an opaque origin it shows the **pre-launch veil**, measured. That is the gate
working — this is an unreleased prototype — but `?bare` is a chromeless *studio* view, not a
media-slot mode. The sandbox pass belongs to a real `cards/hero/NN.html`, which carries no gate by
design. Step §7.5.

---

## 6 · MEMETIC NAMES

⚠ **The artist's, not generated.** `docs/HERO-UNLOCKS.md` already states the eleven earned titles
and CLAUDE.md is explicit that names, numbers and which card ids go where are his review, not a
blank page. Same here: the register is obvious — flat, declarative, all-caps, the caption under a
deep-fried JPEG — and picking the actual 33 is authorship.

⛔ **NO LYRICS.** Standing rule, and it is absolute: not in names, card text, filenames, comments,
commit messages or metadata.

---

## 7 · ORDER OF WORK — proposed

Each step ends in something that can be **looked at**, because that is the only way this gets judged.

1. ✅ **ONE card, end to end — BUILT. `cards/proof.html`, "PLATE PROOF".** Type as outlines, deck
   samples as pigment, print-glitch on a stock that flexes, on-chain degrade behind a slider.
   *Ended in: acceptance 1–5, above.* Reached from **the folder** (`cards/binder.html`, ◆ THE 33).
2. **The generator.** Seed → composition, so #6 is provable across 33 rather than asserted.
3. **Wire the real chain state** — `getMarketState()` + `tierOfHolder()`. *Ends in: #9.*
4. **The 33**, once the artist has struck what is wrong with 1–3.
5. **Bases pinned**, metadata written, sandbox pass. *Ends in: #10.*

⚠ **1 is a prototype and should be treated as disposable.** The recorded failure mode is agreeing
a direction from a mood board; the point of step 1 is to have something concrete to reject.

### What step 1 actually produced — and where it is weak

**The idea it commits to:** the card is a **four-colour separation of a composition made out of
the deck**, and every artefact is a printing failure. Each ink is laid down at its own
registration and screened at its own angle (15° / 75° / 0° / 45°), so the mis-registration and the
moiré are not effects applied to a picture — they *fall out* of printing one picture four times
with the plates in slightly the wrong place. Ink multiplies the paper's reflectance, never adds to
it, which is the single line keeping the whole thing on the paper side of the fence.

⚠ **Three weaknesses, stated rather than hidden:**
- **The burn end state is busier, not obviously more damaged.** The screen coarsens and the roller
  starves, but at 0.85 it reads as *a worse print* rather than *a card that has been through
  something*. §8's "how damaged at full burn" is the live question and the slider is there to
  argue with.
- **The tear barely reads.** Crease relief is subtle by design (the first pass drew hard black
  scratches), and it may now be too subtle to be a feature.
- **The composition is legible but not composed.** Three sources at three scales stopped it
  reading as one card lightly filtered, which was the first failure — but *where* the figure sits
  and *what* it is next to is authorship, not a seed. That is §8's first question and it is the
  one that decides whether the 33 are a set or a batch.

---

## 8 · OPEN — the artist's calls

- **How recombinant?** A hero built visibly *out of* named field cards is a different statement from
  one that merely uses them as texture. Both are defensible; they are different sets.
- **How damaged at full burn?** Legible-but-worn, or genuinely destroyed at the end state?
- Do the 33 share one visual system, or is each its own object with only the stock in common?
- The 33 names.

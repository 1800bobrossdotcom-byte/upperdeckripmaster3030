# The design — what this studio's work IS

> ⛔ **DRAFT FOR THE ARTIST. Every section below is a proposal, not a decision.**
> It is written to be *edited*, because handing an artist a blank page is useless and handing
> them a finished system they didn't choose is worse. Strike anything that is wrong.

---

## Why this file exists

`docs/ART-DIRECTION.md` is a **rubric**: value bands, saturation floors, an rms/edge target, a
rejection list. It tells you how to *measure* whether something came out wrong. It never says what
the thing is supposed to *be*.

That gap has a cost, and it has now been paid twice. The hero wordmark shipped as an extruded
letterform with the CSS gradient painted on the face — technically correct, fail-open, measured,
tested, and **dead**, because "3D type, palette #2bff80, 1980s acid-terminal" is a mood, not a
design. An agent handed a mood will reach for the default. The verdict was *"basic bitch geometry
and fx"* and it was right.

**A brief that does not decide the material, the light and the motion has not been written yet.**

---

## 1 · The material language — FOIL, and it is not decoration

Everything this studio makes is a **printed object**. Not a UI, not a game world with cards in it —
a card, or the stock a card is cut from, or a thing photographed on a table next to one.

That gives us one material spine, and it should be visible on every surface:

| layer | what it is | where it already exists |
| --- | --- | --- |
| **stock** | dark pressed card, paper fibre, cell emboss | `media/bg/foil-*.webp` — the page background IS this |
| **foil** | hot-stamped, **view-dependent hue**, anisotropic streak | ⛔ nowhere yet — this is the gap |
| **ink** | flat, saturated, slightly out of register | the card fronts, the palette |
| **die** | the cut edge — chamfer, bright rim, slight burr | ⛔ nowhere yet |

### ⚑ The one rule that matters most, and the one v1 broke

**FOIL IS DEFINED BY MOVEMENT, NOT BY COLOUR.** A rainbow gradient painted on a surface is not
foil — it is a sticker of foil. Real foil's whole character is that *the hue walks as the viewer
moves*: diffraction colour keyed to the half-angle, an anisotropic highlight that smears into a
line along the brush direction, prism break-up where the die edge catches.

**Acceptance test, and it should be applied to anything claiming to be foil:** render it at
several view angles and measure the hue shift between them. No shift, no foil. That is a number,
not an opinion.

### What is NOT foil
- a linear-gradient fill, animated or not
- a hue-rotate filter over a static image
- an environment map on a flat face (⚑ and it is actively harmful — see THE WASH in CLAUDE.md:
  a StandardMaterial samples the env for ambient specular too, and it lands as a milky sheen that
  lifts blacks. **Metal may reflect the environment. A flat face must not.**)

---

## 2 · Light — one model, everywhere

Right now every surface is lit by whatever its author felt like. Proposal — three lights, the same
three, on the site and in the games:

- **KEY — phosphor green `#2bff80`, raking.** Low angle, ~55–60° off the surface normal. ⚑ Raking
  is the load-bearing part: an emboss lit head-on flattens into a swatch. This is already why the
  background plate reads as material.
- **FILL — acid magenta `#ff2ad9`, from below, weak.** Keeps recesses off dead black and puts the
  palette in the frame twice.
- **RIM — cyan `#27f7e4`, near-grazing, fixed.** Picks edges out of the dark. This is what makes a
  die-cut edge read.

**Gold `#ffd23b` is not a light. It is the accent — the torch, the highlight, the one warm thing.**

⚠ On the landing page, **the two torches flanking the wordmark are already at the exact positions
two warm keys would go.** The 3D type currently ignores them. Tying the render's key lights to
the torches would make the page a single lit scene instead of a flat layout with a 3D thing
dropped in.

---

## 3 · Type

The wordmark is the studio's face and it currently has an unresolved question in it.

⚠ **`--fat` is `'Arial Black'`, which does not exist on Linux or Android.** The wordmark has
always rendered as a different typeface, at a different width, depending on the visitor's OS. That
is not a style choice; it is an accident that has been shipping.

Options, and this is the artist's call:
1. **Pin a face and vendor it** — deterministic everywhere, and the 3D layer can align to a box it
   can predict. v1 did this with Anton; the letterforms visibly changed.
2. **Draw the wordmark as outlines** — it stops being text, but it becomes *the artist's* letter-
   forms rather than a font nobody chose. For a studio whose logo is its name, this is arguably
   the right answer.
3. **Keep the accident.** Defensible only if nothing needs to align to it.

⚑ Whatever is chosen, **the real text stays in the DOM.** The wordmark is TYPE, not a bitmap of
the name — that was a deliberate fix and it should not be undone by a 3D layer.

---

## 4 · Motion

Proposal: **motion is either a physical property or it does not exist.**

- **Yes:** a highlight travelling because the light or the viewer moved. A card tilting under the
  pointer. Parallax between depth layers. A pack tearing.
- **No:** things that pulse, breathe, shimmer or drift for their own sake. A loop the eye can
  learn is a screensaver.

Speeds already measured and worth keeping as the house tempo: the background's key light orbits in
**74 s**, its drift is **0.0065 tiles/s**. Slow enough to be felt, not watched.

⚠ `prefers-reduced-motion` means **still lit, not switched off.** The relief is the point; the
movement is the garnish. Already implemented that way in `js/bg-foil.js`.

---

## 5 · Composition

- **Dark field, lit object.** The subject is the only bright thing. Blacks stay black — the
  background plate is held to composite mean < 26 and p99 < 58 precisely so text and objects have
  somewhere to sit.
- **One focal object per view.** The binder, the card, the wordmark, the fighter.
- **Everything sits ON something.** A card on a bench, a pack on a table, type on stock. Floating
  UI is the failure mode; a printed object always has a surface under it.
- **Vignette inward.** Corners fall off so the centre column of a page stays the readable part.

---

## 6 · The lineage, and why it is not just flavour

⚑ **There are TWO lineages and they answer different questions.** This section is the VISUAL one —
how a thing should look. `docs/DELTRON-3030.md` is the NARRATIVE one — what world it is from, and
it is where the studio's own `3030` comes from. Reach for that file when the question is "what is
this a page/screen/card *out of*"; reach for this one when the question is "what is it made of".
⛔ That file carries a hard rule worth repeating here: **no lyrics, ever, anywhere.** Ideas and
structure are free; the words are not.

The artist came up in **Rare Pepes on Bitcoin/Counterparty** and **Fake Rares**. `docs/CC0-SOURCES.md`
records the operative fact: *"the artist's own Fake Rares work is the natural first source for
in-game art — it is the project's actual lineage and the strongest answer this repo can give to
'where did this come from'."*

⚑ **That is a design instruction, not a credit line.** Hand-drawn, high-contrast, saturated flat
ink, deliberately crude registration, joke-and-trophy at once. It is the opposite of the smooth
bevelled corporate 3D that a default pipeline produces — which is exactly what v1 of the hero
produced.

**When an agent is unsure what something should look like, the answer is "look at the artist's own
cards", not "make it look premium".**

---

## 7 · The rejection list, restated as design rather than QA

`ART-DIRECTION.md` §3 lists what is wrong. Stated positively, so a brief can be written from it:

| instead of | do |
| --- | --- |
| default extrude + uniform bevel | die-cut profile: chamfer, micro-bevel, bright rim, varied depth |
| gradient painted on a face | view-dependent diffraction that walks as you move |
| env map on everything | env on metal only; faces lit by the three keys |
| a thing rendered in isolation | a thing lit by the page it sits on |
| smooth premium CG | printed, stamped, slightly misregistered |
| motion for its own sake | motion because something physically moved |

---

## 8 · How to brief with this

Every 3D/visual brief must state, explicitly, before any code:

1. **What the object is made of** — which of the four layers in §1.
2. **How it is lit** — which of the three keys, from where.
3. **What moves, and why it physically moves.**
4. **What it sits on.**
5. **The acceptance measurement** — for foil, hue shift across view angles; for a backdrop,
   the composite legibility band; for a body, worst-triangle stretch.

⚠ A brief missing any of 1–4 will produce the default, and the default has now been rejected once
in this project. That is the whole reason this file exists.

---

## 9 · Worked example — the hero wordmark, and the half of the brief that got skipped

⛔ **v2 was rejected too, and the reason is recorded here because it is a process failure with a
signature.** v2 answered §1 (material: hot-stamped foil) and §2 (light: the two page torches, placed
from the DOM) *well* — the hue-shift acceptance test passes at 261° median travel. It answered §4
(**what moves, and why it physically moved**) with *"the viewer's pointer swings the key light."*

**That is not the object moving. That is a lit rock.** The artist's words were "can't even interact
with it · not rigged · not reactive", and all three were literally true in the code:

| the note | the fact |
| --- | --- |
| can't interact | the canvas was `pointer-events:none` — the pointer passed through it |
| not rigged | the GLB was **3 meshes split by face normal**; every letter merged into each |
| not reactive | one window `pointermove` → a light angle; the geometry never moved |

⚑ **The lesson generalises: §1 and §2 are the easy half.** Material and light are what a renderer
*has features for*, so an agent handed the brief will answer them and feel finished. §4 has no
feature to reach for — it has to be designed. **A brief that names the material and the light and
waves at motion will produce a beautiful object that is dead to the touch, every time.**

### The wordmark's actual brief

1. **Made of** — twenty separate pieces of foil, hot-stamped into card stock. Not a word: *letters*,
   each its own stamping, each with its own die impression and its own slightly different depth.
2. **Lit by** — unchanged from v2. The two torches are the keys, from the DOM, with flicker.
3. **What moves, and why** — ⚑ **it is a card, and a card FLEXES.**
   - **The stock bows under a press.** The pointer is a finger on the card: a smooth falloff bow
     around the contact point. This is what makes the foil sweep, because the surface normals
     genuinely change rather than the light merely moving.
   - **Each letter rocks on its own.** Foil is stiffer than the stock it sits in, so a stamped
     letter tips in its impression rather than bending. Per-letter pivot at its base, spring return,
     damping, **overshoot**.
   - **Neighbours are coupled through the stock.** Shove one letter and the disturbance runs down
     the row and dies out. That is the difference between a rig and twenty independent toys.
   - **Grab and throw.** Press-drag is pulling on the card; release rings it out. ⚑ This is the
     studio's whole subject — the pull and the snap-back *is* anticipation.
   - ⛔ **Nothing moves on its own.** §4 still holds: no idle loop, no breathing, no drift. At rest
     it is a still object. All motion is the visitor's.
4. **Sits on** — the foil card-stock plate (`js/bg-foil.js`), which is the same material one layer
   back. The letters are stamped into *that*.
5. **Acceptance measurement** — v2's hue-shift test stays, and **three new numbers that must FAIL on
   v2**: (a) a synthetic drag displaces letters, and displaces *different letters by different
   amounts* — a global transform would pass a naive "did it move" check, so the per-letter spread is
   the real assertion; (b) release settles within a named window **with overshoot**, proving a spring
   rather than a lerp; (c) shoving letter *n* moves letter *n+2* **later** than *n+1*, proving
   coupling rather than twenty independent springs.

### And the balance

⚠ `RUNS = [('RIPMASTER', 1.00), ('3030', 0.62), ('STUDIOS', 1.00)]` set the digits as a subscript.
The name is **RIPMASTER 3030 STUDIOS — three parts of equal standing**, so all three runs are 1.00.
⛔ Equal *size*, still **one word, no spaces**: `ripmaster3030studios` is the name law, and the DOM
string stays exactly that. The balance is typographic, not a rename.

# ripmaster3030studios — the identity, written as decisions

> ⛔ **DRAFT FOR THE ARTIST.** Everything marked **⟨proposal⟩** is mine and is meant to be struck.
> Everything marked **⟨fact⟩** is already true in the repo and is here so a brief can be written
> without re-deriving it. `docs/DESIGN-SYSTEM.md` is the material/light/motion spine and this file
> does not replace it — it is the *brand* layer that sits on top: what the studio's face is, what
> it is made of, and how it differs from the retired era while staying descended from it.
>
> Built against it: **`studio3d.html`** (the proposed landing surface) + `js/sheet3d.js`,
> measured by `npm run test:sheet`. That page is **disposable on purpose**. The recorded failure
> on this project is agreeing a direction off a mood board, so the point of a prototype is to be
> something specific to reject.

---

## 0 · The one-line position

**⟨proposal⟩ The studio is a PRESS, not a poster.**

Everything it makes is a printed object, and the front door should be the thing it prints. Today
`index.html` is a *poster about* a card. The proposal is that the front door becomes **the uncut
sheet the cards come off** — eight up, crop marks, colour bar, a perforation between every pair,
and the studio's slug hot-foil-stamped in the tail margin.

⚑ That single move earns three things at once that a poster cannot:

| | |
| --- | --- |
| **a subject** | the studio's product, not a picture of it |
| **a verb** | you navigate by **tearing a card out**, and the studio's verb is RIP |
| **an honest scale** | a trading card is a SIZE before it is anything (the artist's own frame), and a sheet is that size, repeated, with the trim shown |

---

## 1 · What survives from the retired era, and what changes

⚠ The brief said *inspired by* the current site, not a break from it. So this is written as a
**diff against `index.html`**, not a clean slate.

| | `upperdeckripmaster3030` era | **⟨proposal⟩ ripmaster3030studios** |
| --- | --- | --- |
| the ground | black void, digital rain, CRT scanlines, tiled watermark | **unchanged** — void `#020804`, the CRT, the mono voice |
| the palette | phosphor / acid / cyan / gold on black | **unchanged in value, redistributed in ROLE** — see §3 |
| the subject | a wordmark, lit, above a page of panels | **an object on a surface**: one sheet of stock on a press bed |
| the light | ambient page glow + two decorative torch GIFs | **the two torches become the KEY**, real, raking, flickering |
| the type | a foil-stamped wordmark, three lines, square | **the same mark, stamped onto the product** rather than floating above it |
| the motion | hover lifts, gradient sweeps, a rig on the wordmark | **one motion: paper under a hand.** Nothing else moves at all |
| the affordance | buttons in a row | the sheet **is** the navigation; the buttons become a job docket |

⛔ **What must not change, and is not negotiable:** the name law. `ripmaster3030studios` — one
word, lowercase, 3030 in the middle — on every visible surface, in **text in the DOM** as well as
in any pixels. `npm run test:name` enforces it and the retired name may not appear, including as
separate words with anything between them, and including inside a bitmap.

⚑ **The studio's mark is stamped ON the product, not floated above it.** `studio3d.html`
deliberately does **not** carry a second copy of `js/hero3d.js`'s hero wordmark. The only place
the wordmark appears is the foil slug in the sheet's tail margin — which is where a printer puts
their imprint, and it means the identity and the thing it identifies are one object. ⚠ The DOM
still carries the name as an `<h1>` in text: a canvas-only name is a *bitmap of the name*, and a
bitmap of the name is exactly how the retired studio name survived a 258-file rename on 200+ live
surfaces.

---

## 2 · The material language — four layers, and each has one job

⟨fact⟩ `DESIGN-SYSTEM.md §1` already names four layers. This assigns each of them a **place** so a
brief can say which one it means.

| layer | what it is | where it lives | value |
| --- | --- | --- | --- |
| **STOCK** | warm card, 300gsm, fibre running in the machine direction | the sheet itself; the page background (`js/bg-foil.js`) | albedo **0.905 / 0.876 / 0.806** |
| **INK** | three spot inks, flat, saturated, screened, slightly out of register | the card faces and every printer's mark | transmittances in §3 |
| **FOIL** | hot-stamped thin metal, ruled, view-dependent hue | **one place only** — the studio slug | palette ramp §3 |
| **DIE** | the cut and the tear — and they are NOT the same edge | perforations, trim, torn lips | — |

### ⛔ The stock is PALE, and that is a structural argument rather than a taste one

A black site wants a black object. It cannot have one.

**Ink multiplies the paper's reflectance and never adds** — that is `js/hero-card.js`'s rule and it
is what keeps a card a card instead of a screen. On near-black stock there is nothing to multiply,
so black stock **forces additive ink**, i.e. the exact thing the card renderer forbids. Warm
off-white stock also makes the sheet the one bright object on a dark field, which is
`DESIGN-SYSTEM §5` rather than a departure from it.

⚑ Measured, not asserted: halving the stock's reflectance halves the printed area's luminance,
**ratio 0.508** (`npm run test:sheet` §2). Additive ink cannot reach that number.

### ⛔ A DIE EDGE AND A TORN EDGE ARE DIFFERENT EDGES

This is the sheet's most specific material claim and the easiest thing to get lazily wrong:

- **die-cut** — clean, a chamfer, a bright rim, no fibre. This is what a finished card has.
- **torn** — crooked, fibrous, brighter than the face because broken pulp scatters. This is what
  a card taken off an uncut sheet has, and it is the difference between a *product* and a *pull*.

⟨proposal⟩ **Every card the studio issues shows a die edge. Every card you take out of the sheet
yourself shows a torn one.** That is a one-bit visual record of *where a card came from*, and it
costs nothing to keep consistent.

### ⚑ Foil goes in exactly ONE place

A foil stamp is a separate pass on a separate press and it costs real money. A sheet with foil
everywhere is a sheet nobody printed. One slug, in the tail margin. ⚠ This is also the practical
answer to why the current landing page's rainbow-gradient headline reads as decoration: value
comes from scarcity in the *material*, not from more colour.

---

## 3 · Palette — with values, and with ROLES

⟨fact⟩ Every value below is already in `index.html`. Nothing is invented.

| | hex | linear | **⟨proposal⟩ role** |
| --- | --- | --- | --- |
| void | `#020804` | 0.0078 / 0.0314 / 0.0157 | the field. Blacks stay black |
| phosphor | `#2bff80` | 0.169 / 1.000 / 0.502 | ⛔ **the ROOM, not an ink** — the terminal glow beside the bed |
| acid | `#ff2ad9` | 1.000 / 0.165 / 0.851 | **INK 1**. Transmittance `0.98 / 0.11 / 0.86` |
| cyan | `#27f7e4` | 0.153 / 0.969 / 0.894 | **INK 2** `0.10 / 0.92 / 0.90`, and the RIM light |
| key | near-black ink | — | **INK 3** `0.065 / 0.070 / 0.062` |
| gold | `#ffd23b` | 1.000 / 0.824 / 0.231 | ⛔ **promoted to the KEY LIGHT** — see below |
| stock | `#e7dfcd` | 0.905 / 0.876 / 0.806 | the paper |

**The foil ramp** is the same six stops as the landing page's wordmark gradient, wrapped into a
loop so the hue sweep can never leave the site's palette:
`#eafff2 → #2bff80 → #27f7e4 → #7aa8ff → #ff2ad9 → #ffd23b →` (back to the first).

### ⛔ ⟨proposal⟩ An amendment to `DESIGN-SYSTEM §2` — gold IS a light

That section currently says *"Gold `#ffd23b` is not a light. It is the accent."* Two paragraphs
later it observes that **the two torches flanking the wordmark sit at the exact positions two warm
keys would go.** Those two statements are in tension, and the fiction settles it: a torch *is* a
light. So:

- **KEY — gold, two lamps, raking (~58° off normal), from above-left and above-right.** They are
  the landing page's own torches, promoted from decoration to the thing lighting the scene.
- **FILL — phosphor green, weak, low and frontal.** The terminal glow. This is the one place the
  studio's signature colour lives, and putting it in the *room* rather than in the *ink* is what
  keeps warm paper from going ill under a green key.
- **RIM — cyan, near-grazing, fixed.** What finds a die edge, a torn lip, or the sheet's own
  silhouette against the void.

⚠ **Both keys above means the contact shadow drops straight down and is soft.** Two broad lamps do
not cast a hard edge. If the artist wants a hard shadow, that is a different lamp, not a setting.

⚠ **Exposure is a real number, not a vibe.** The first build drove white stock to ~1.5 in linear
light — clipped — and clipped paper is paper that cannot be dimmed, which is how the ink-multiply
measurement read 0.68 instead of 0.50. Two lamps on 0.9 albedo want to land near 0.8. The
`GfxPost` highlight knee (**0.94**, swept against clipped-pixel counts, not guessed) is carried
onto this surface for the same reason it exists there: an engine replaces the FUNCTION, not the
TUNING.

---

## 4 · Type

⚠ ⟨fact, unresolved⟩ `--fat` is `'Arial Black'`, which does not exist on Linux or Android. The
open question in `DESIGN-SYSTEM §3` is still open and is still the artist's.

⟨proposal⟩ **Option 2 — draw it as outlines — and the machinery already exists.**
`cards/type/alphabet.json` ships coordinates, not type software, and `scripts/build-card-type.py`
built it. `studio3d.html` uses it for every word printed on the sheet: the card titles, the
numbers, the docket line and the foil slug. Nothing on that surface names a font.

⚑ The reason is not aesthetic, it is about **who decides**. A font named in CSS hands the
visitor's machine a vote over what the studio's own product says, and the studio's product is
permanent. For a studio whose logo is its name, outlines are the answer.

⚠ Chrome and running prose stay in the shipped mono (`Courier New` stack). This is not a proposal
to draw paragraphs as outlines; only the things that are **printed on an object**.

---

## 5 · Motion — the section with no feature to reach for

⛔ **This is the half that got two hero wordmarks rejected, so it is written first and in most
detail.** `DESIGN-SYSTEM §9`: *§1 and §2 are the easy half, because a renderer HAS FEATURES for
material and light — so an agent answers them and feels finished. §4 has to be designed.*

**⟨proposal⟩ The studio's motion language is: PAPER UNDER A HAND. Nothing else moves.**

1. **The stock dishes under your finger.** A local, bounded bow around the contact point. This is
   what makes the foil sweep and the halftone catch, because the surface *normals genuinely
   change* rather than the light merely moving.
2. **The perforation gives progressively.** A tear runs; it does not switch. The hinge retreats
   across the card as the perf lets go, so the card opens like a page before it comes away.
3. **Neighbours are dragged through the webs between them** — and ⚑ **the coupling dies with the
   web it went through.** When a perforation lets go, the force it was carrying vanishes, so the
   neighbours snap back late and separately rather than all together. Measured: after the tear, a
   shove on the freed card moves its old neighbour by **2.2 × 10⁻¹⁸**.
4. **Release rings.** A spring, under-damped (ω 10.9, ζ 0.42), so it **overshoots**. A lerp is
   not a release.
5. ⛔ **Nothing moves on its own.** No idle loop, no breath, no drift. Measured: ten seconds of
   clock move **exactly zero** vertices.
6. **A tear never reverses.** Paper does not un-tear. That one-way property is what makes the
   sheet a record of what you did to it rather than a toy that resets.

### ⚠ The one exception, stated rather than smuggled

**The two torches flicker.** A flame is a combustion; it is the one thing in the frame with its
own reason to move, and the current landing page's torches already do exactly this. It touches
**light and never geometry**, which is precisely why acceptance test 4 asserts *displacement*
rather than a frame hash. ⚑ That matters: the hero card recorded a case where a wall-clock breath
in a shader broke the frame hash while "flex is exactly 0" stayed green. Assert the thing you mean.

### ⚑ And the navigation IS the motion

You do not click a card; you tear it out. Input and mechanic are the same shape, which is the same
argument that made "tap flaps" right for the bird. It also means the page cannot become a beautiful
object that is dead to the touch — **the only way through it is to touch it.**

⚠ **One rule, no device branch:** the pull is the drag **across the perforation**, i.e. mostly
horizontal. That is how you take a card off an uncut sheet you are holding, and it leaves
`touch-action: pan-y` free so a phone can still scroll past the hero. A canvas that swallows
vertical drags is one a phone cannot get past.

---

## 6 · Composition

- **One object per view.** The sheet. Not a grid of panels with an object in one of them.
- **It sits on something.** A press bed — rolled rubber, near-black — with a soft contact shadow.
  Floating UI is the failure mode; a printed object always has a surface under it.
- **⟨proposal⟩ The imposition changes with the press.** Landscape gets the sheet run 4-up across;
  portrait gets it 2-up. Same eight cards, same plates, a different lay. ⚑ This is why it is not a
  media query bolted on afterwards — it is a fact about printing that happens to be responsive.
- **The margins carry the furniture, not decoration.** Crop marks that do not touch the trim (that
  gap is the whole tell), registration targets, a colour bar down the fore-edge, and a job docket
  line. Every one of them is information a printer would actually need.

---

## 7 · Acceptance — the numbers this identity is held to

⚑ *"It looks like foil" is not a result.* Every claim above that can be measured, is, in
`npm run test:sheet` — **25 assertions**, and each is chosen so that a lazy re-implementation
FAILS rather than so that the current build passes.

| # | claim | measurement | measured |
| --- | --- | --- | --- |
| 1 | the foil is defined by MOVEMENT | median per-point hue travel across a 48° view sweep | **586°** (max 936°) |
| 1b | …and the control must collapse | the same build with only the half-angle term removed | **51°** — 11.5× separation |
| 2 | ink MULTIPLIES the stock | luminance ratio when the paper is halved | **0.508** |
| 2b | …and nothing adds | luminance with the stock at zero | **1.45%** of full (the residue is the paper sheen, which is not albedo) |
| 3 | the sheet is RIGGED, not transformed | spread of displacement across 8 cards under one pull | **0.27** |
| 3b | coupling, not eight loose springs | first response of card n+1 vs n+2 | **0 ms → 67 ms**, n+3 never |
| 3c | a spring, not a lerp | release must cross zero | **+0.196 → −0.061** |
| 3d | the coupling dies with the web | neighbour movement after the tear completes | **2.2 × 10⁻¹⁸** |
| 3e | paper does not un-tear | the tear value must be monotone | monotone |
| 4 | nothing moves on its own | max vertex displacement over 10 s of clock | **exactly 0** |
| 5 | fail open | WebGL2 refused ⇒ links still live | **8/8 cards + 8/8 docket**, no canvas, name in text |
| 6 | the phone is not an afterthought | 320 px: overflow, taps, type floors, imposition | **0 px · 0 under 44 · 0 under 12 · 2 × 4** |

⚠ **All of it under SwiftShader**, so these are shapes, ratios and timings. Absolute colour off a
screenshot is meaningless in this container (it rotates hue on canvas content) — every colour
number above is a readback from a render target, read as a ratio or a delta against a control
taken through the same path.

### ⛔ Two measurements were wrong before they were right, and both wrong versions were reassuring

1. **The readback read a stale frame.** Render, bind framebuffer 0, `readPixels` — the obvious
   thing, and it returned the previous frame *every time*. Setting the clear colour to pure red
   and re-rendering still read back green. Nothing errored. The harness reported the foil and its
   own sabotage control as **identical**, and an A/B whose halves are the same looks exactly like
   a null result. Fixed by reading from a RenderTarget we own.
2. **The hue statistic punished the fix.** Taking the MEAN hue over the whole slug at each angle
   averaged away the very thing it was measuring: refining the grating from a coarse pitch to a
   fine one — unambiguously *more* diffractive — drove the number **down**, 99° to 63°. The right
   statistic is per-point travel, sampled by projecting points on the foil band through the live
   camera. A fixed fraction of the moving screen box is a different piece of foil at every angle,
   which reported "0 of 140 points trackable" and read as a dead material.

---

## 8 · What is deliberately NOT decided here

These are the artist's and this document does not pretend otherwise.

1. **Whether the sheet replaces the front page at all.** `index.html` is untouched.
2. **The eight names.** THE ARCADE / THE CITY / THE FOLDER / THE 33 / THE MARKET / THE PAPER /
   THE NUMBERS / THE ARTIST is a first cut chosen so every card goes to a page that exists.
3. **The card faces.** They are generated placeholder ink — eight distinct compositions rather
   than one composition with eight seeds, because a seed is not authorship. ⚠ *Which* composition
   goes on *which* card is authorship, and it is the same open question `docs/HERO-33-BRIEF.md`
   already records about where the figure sits: it decides whether the eight are a **set** or a
   **batch**.
4. **The typeface question** (§4) — still open, still `DESIGN-SYSTEM §3`'s.
5. **⟨proposal⟩ Gold as the key light** (§3) — this contradicts a line in `DESIGN-SYSTEM §2` on
   purpose and should be struck or ratified, not left ambiguous.
6. **Whether the studio's mark should ever appear on its own**, above the product, the way
   `index.html` shows it today. The sheet takes the opposite position and that is an argument, not
   a fact.

---

## 9 · The rest of the site, sized honestly

⚠ **Sized in units of "a session like this one".** This is the estimate, not a promise, and it
excludes the three things that must ship finished — the contract, the lenses and the token — which
none of this touches.

| | what | cost | why |
| --- | --- | --- | --- |
| **1** | **Ratify or strike §§1–8.** One pass with the artist over this file. | ~0 | ⛔ Everything below is worthless until this happens. Two hero wordmarks were built before the direction was agreed. |
| **2** | The **print pass as a shared surface treatment** — `js/city-ink.js` already posterises, inks and misregisters a rendered frame, and this sheet does the same thing to a printed one. One of them should be the definition. | 1 | Cheap, high leverage, and it makes every page look like it came out of the same press. ⚠ The test is whether they would ever share a fix — see the two-renderers note in CLAUDE.md before merging. |
| **3** | **The stock, everywhere.** `js/bg-foil.js` already lights baked foil card stock. Bring its light rig into agreement with §3 (gold key, green fill, cyan rim) so the page and the objects on it are one scene. | 1 | Currently the background has its own lighting and the objects have theirs. |
| **4** | **The die/tear rule** applied to `js/card3d.js` and `cards/binder.html`: cards issued by the studio get a die edge, cards you pulled get a torn one. | 1 | §2's one-bit provenance. Small, and it is the kind of detail that reads as authorship. |
| **5** | **Generated pages** (whitepaper / tokenomics / audit / artist) get the sheet's furniture — crop marks, colour bar, docket line — as a CSS layer, no WebGL. | 1 | ⚑ These are `scripts/build-pages.mjs` output, so it is one generator edit, not four page edits. **Do not patch the HTML** — the `restyle-backs.mjs` failure is exactly this. |
| **6** | **The arcade + game shells** adopt the same rail, the same stock and the same two-lamp key. | 1–2 | The cabinets are PlayCanvas already; this is chrome, not renderers. |
| **7** | **The 33 and the sheet reconcile.** `js/hero-card.js` prints four-colour process; the sheet prints three spot. Both are correct for what they are — but the studio should be able to say which press a given card came off. | 1 | ⚠ Genuinely a design decision, not an implementation. Do not merge them to look tidy. |
| **8** | **A real device.** Everything above was measured under SwiftShader. | — | ⚠ Task #73 is still open and this work does not close it. Colour, frame cost and touch feel are all unverified on hardware. |

⛔ **What is NOT on this list, and should stay off it:** a second hero wordmark, a landing-page
animation, and anything described as "make it look premium". Smooth bevelled corporate CG is what
a default pipeline emits, and it has been rejected twice here. When unsure what something should
look like, the answer is **the artist's own cards** — hand-drawn, high-contrast, flat saturated
ink, deliberately crude registration.

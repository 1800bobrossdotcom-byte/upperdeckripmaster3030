# ART DIRECTION — the standard the 3D work is judged against

*Owner: art direction. This is the spec the arena, texture and character work is measured
against, not a mood board. Every target below is a number you can read off a frame, and the
"where we are now" section at the end is a measured critique of the build as it stands on
`eb29adc` (2026-08-01), not an impression.*

> **Read `CLAUDE.md` first**, especially *Artist ethos*. This document is downstream of it. Where
> the two disagree, CLAUDE.md wins and this file is the bug.

---

## 0 · How to check anything in this document

The build already carries the instruments. **Nothing here needs a new tool.**

```
section9.html?map=<n>&grab=1        ?grab=1 sets preserveDrawingBuffer, so a headless run can
                                    readPixels the REAL backing store
__s9pc._clip()                      → { clippedPct, meanLuma, rms }
__s9pc._sharpMetric()               → mean |Laplacian| ("edge")
__s9pc._hideui(true)                → hide HUD, so you measure the RENDER not the overlay
__s9pc._post({...})                 → live post/exposure/sun override, for a sweep
?tod=dusk  ?grit=1  ?clean=1  ?nrm=0  ?q=high|mid|low   the A/B switches that already exist
```

Headless harness: node http server + playwright-core at
`/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js`, chromium
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, args
`--no-sandbox --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
Gate bypass: `localStorage urm_admin_ok='1'`. Click `#btnPractice`, then a button matching
`/start|skip/i`, wait ~11 s, then read.

**Two rules that are not negotiable, both already recorded in CLAUDE.md:**

1. ⚠ **This container's screenshot path rotates hue on canvas content.** Judge COLOUR only from
   `readPixels` / `getImageData`. Judge LAYOUT, composition and silhouette from screenshots
   freely — that part is trustworthy. *Never report a colour conclusion from a PNG.*
2. ⚑ **Measure A/B, not absolutes.** SwiftShader is not colour-faithful in the abstract. Shoot
   the change and the baseline through the SAME path at the SAME size, and compare.

⚑ **Luma weighting agrees across the repo — verified, not assumed.** `__s9pc._clip()` uses
Rec.601 (0.299/0.587/0.114); the external harnesses use Rec.709 (0.2126/0.7152/0.0722). On a
LIDO DECK frame these give **mean 153.33 vs 154.23 and RMS 40.57 vs 40.53** — under one level
apart. So the in-build hooks are directly comparable to the targets in this document and you do
not need an external harness to check compliance. `_sharpMetric()` returned 5.967 against the
harness's 5.99 on the same frame.

---

## 1 · The look, stated so it can be checked

### 1.1 The one sentence

**A bright, sunlit, hand-painted place made of large flat colour fields, where every character is
a dark shape and every surface behind them is a light one — and the whole thing looks like it was
printed on a trading card, not scanned off a location.**

### 1.2 Why this look, and not another

The artist's throughline is *the trading card as a form* — MAD magazine and cereal boxes, the
casino and the arcade, anticipation, and the Dadaist turn where the prize is the having-done-it.
That is **printed** imagery: flat inks, bold shapes, saturated spot colour, legible at palm size.
It is also **parody** — of crypto/KOL/meme-coin/casino culture, done as art.

Photoreal grit cannot carry a joke. The moment an arena looks like a scanned warehouse, the
parody stops reading as parody and starts reading as an asset flip that happens to have funny bot
names on it. **The tone lives in the rendering, not only in the writing.** A dead-serious arena
under the handle `Rug-Pull Rick` is a tonal mismatch, and a player reads that mismatch as
"unfinished", not as "satire".

So: high-key, flat, saturated, printed. Every technical decision below serves that.

### 1.3 Value structure — this is the legibility mechanism, and it is the one that is failing

**The rule: the world is LIGHT, the characters are DARK, and the gap between them is the single
number that decides whether this game is readable.**

A player finds a target by value contrast before they find it by colour, motion or outline. In a
high-key world you get this for free *if and only if* the characters are genuinely dark. If a
character renders in the same value band as the wall behind it, the whole high-key palette has
bought you nothing and you have a bright game that is harder to read than a dark one.

| | rendered luma target (0–255, from `readPixels`) |
| --- | --- |
| sky / horizon band | 175 – 215 |
| lit vertical surfaces (walls, masonry, plaster) | **185 – 215** |
| ground / deck in sun | 150 – 185 |
| ground / deck in shadow | 110 – 145 |
| bright trim, edges, cornices | 210 – 235 |
| **character body** | **95 – 135** |
| weapon viewmodel | 40 – 90 |

**The acceptance number:** measured at the aim point, with the body dead-centre and the surround
sampled as flanking strips 1.6–3.0 body-widths out at the same height band —

> **`body_mean − surround_mean ≤ −45` at 8 m, and `≤ −35` at 20 m.**
> The **sign is part of the test.** The body must be DARKER than what it is read against, every
> time. A body that is 40 levels brighter than the ground passes an absolute-difference test and
> fails the design: it inverts the read, so the eye has to relearn the rule per arena.

*Today this measures **−4.0** at 8 m on LIDO DECK. See §5.*

### 1.4 Palette — the actual values

These are the authored albedo floats in `js/s9pc-world.js` `MATS_DAY` and `js/s9pc-app.js`'s
`SKY_DAY` / `SUN_TINT` / fog, with their byte and hex equivalents so a Blender or texture pass can
match them directly. **This palette is the standard; a new material must justify itself against
it, not replace it quietly.**

**World — the arena palette**

| class | float | byte | hex | role |
| --- | --- | --- | --- | --- |
| `deck` | 0.60, 0.50, 0.35 | 153, 128, 89 | `#998059` | sand — the ground everything is read against |
| `wall` | 0.70, 0.64, 0.52 | 179, 163, 133 | `#B3A385` | warm cream plaster — the silhouette backdrop |
| `metal` | 0.50, 0.57, 0.64 | 128, 145, 163 | `#8091A3` | cool steel — separates rails from masonry |
| `crate` | 0.68, 0.26, 0.18 | 173, 66, 46 | `#AD422E` | terracotta — cover, findable at a glance |
| `cab` | 0.10, 0.42, 0.46 | 26, 107, 117 | `#1A6B75` | teal lacquer — the complement |
| `water` | 0.10, 0.54, 0.60 | 26, 138, 153 | `#1A8A99` | the biggest saturated field, deliberately FLAT |
| `plant` | 0.24, 0.50, 0.21 | 61, 128, 54 | `#3D8036` | planting |
| `awning` | 0.82, 0.33, 0.30 | 209, 84, 77 | `#D1544D` | coral canvas |
| `trim` | 0.86, 0.84, 0.77 | 219, 214, 196 | `#DBD6C4` | white stone — **EDGES ONLY, see §3.4** |

**Light**

| | float | hex |
| --- | --- | --- |
| sun tint | 1.00, 0.97, 0.90 | `#FFF7E6` |
| sky zenith | 0.17, 0.36, 0.82 | `#2B5CD1` |
| sky mid | 0.40, 0.62, 0.94 | `#669EF0` |
| sky horizon | 0.80, 0.89, 0.98 | `#CCE3FA` |
| daylight haze | 0.76, 0.85, 0.93 | `#C2D9ED` |
| ambient (open, day) | 0.30, 0.37, 0.48 | `#4D5E7A` |

**Characters** — see §4. The current values are wrong and are listed there as a defect, not as a
palette.

### 1.5 Where saturation is allowed to live

Saturation is a **budget**, and spending it in the wrong place is how a bright frame goes
one-note or goes candy.

- **Large fields get ONE saturated hue, flat.** The pool is the model: a single teal plane with no
  texture incident in it at all. Big + flat + saturated reads as *colour*; big + saturated +
  noisy reads as *dirt*.
- **Mid-size masses get the complement.** Coral awnings against teal water, terracotta crates
  against cream plaster. Two families, roughly opposed.
- **Small objects may go hottest.** Cover markers, pickups, cabinet fronts. They are the smallest
  area so they cost the least frame-wide saturation and buy the most "where do I go".
- **Vertical surfaces a player will be seen against stay LOW saturation and HIGH value.** Cream,
  sand, bone. Their job is to be a backdrop; a saturated wall competes with the body in front of
  it and with the HUD.
- **Characters are near-neutral except for one saturated mark.** §4.
- ⛔ **Never buy saturation with a coloured light or a global grading crank.** That was tried and
  recorded: under a dusk-orange sun a grey box arena *measured* saturated (50.8%) while having no
  colour in it at all, and the fix — painting the albedo — is the only honest one. A coloured
  haze or a `grading.saturation` push tints the sky, the HUD and the operatives too.
- ⛔ **Never buy brightness at saturation's expense.** Recorded sweep on DUST BOWL: exposure
  0.55 → sat 33.0; 1.00 → sat 25.1, with RMS contrast flat across the whole range. **ACES
  desaturates on the way to white.** Every stop of exposure is paid for in colour and buys
  nothing. Exposure is metered once and left alone (open+day 0.55, dusk 1.0, interior 1.25).

### 1.6 How much black is permitted

**Effectively none.** Target `blacks% (luma < 12) ≤ 1.5`, and 0.0 is fine and normal outdoors.

The reference has almost no black in frame. Shadows are soft, light and *coloured* — the shadow
side of a cream wall is a cooler cream, not a grey. Depth comes from **value + overlap**, not
from things getting darker with distance.

This is already the correction the engine build made against the classic renderer, and it is
recorded: setting `open:true` on the six hand-built arenas took blacks from 7.3% → 0.4% and
contrast from 42.1 → 53.9. **Crushed shadows are a legibility failure before they are a taste
failure** — a dark character in a dark shadow is invisible, and this game's whole read depends on
the character being the darkest thing in frame.

Interiors are the deliberate exception. `SKY_IN` stays near-black because a neon sign only reads
against dark, and a wedge of bright sky at floor level inside a concrete pit reads as a rendering
fault. **The high-key rule is an OUTDOOR rule.** Do not "fix" THE VAULT to match it.

### 1.7 Edge treatment

- **Every major mass gets a bright top edge** — a cornice, a lip, a coping band. That band is what
  separates a building from the sky and what a silhouette in front of it is read against. LIDO
  DECK's instinct here is right.
- **The band is THIN.** ≤ 0.4 m on a mass ≥ 2 m tall, i.e. under ~15% of the object's height.
  When the "edge" material becomes the object's main material it stops being an edge and starts
  being a white box — which is exactly what has happened (§5.3).
- **Every object needs a visible contact shadow where it meets the ground.** Ambient at
  (0.30, 0.37, 0.48) plus IBL currently washes contacts out, and an object with no contact
  appears to hover. SSAO exists at `high`/`mid` tier only; at `low` the contact has to come from
  authored geometry (a darker plinth course, a recessed base) or it does not exist at all.
- ⛔ **No toon outlines, no rim-light outlines, no ink pass.** It is the cheap way to fake this
  reference and the reference does not have them. It would also fight the card art, which has its
  own line language. Silhouette comes from **value separation**, which is free and already paid
  for by the palette.

### 1.8 Silhouette rules

- **A character must be identifiable as a solid black shape at 40 px tall.** Runnable test:
  render each body at 40 px, threshold to 1-bit, and check the three are distinguishable from
  each other. If two collapse to the same blob, one of them is redundant.
- **Volume, not detail.** `scripts/blender/build-cc0-chars.py` already states this correctly:
  the IK skeleton fixes where every joint is, so the only degree of freedom is the **mass hung on
  each joint** — and at play distance that is all a fighter is. Exaggerate it.
- **Arena masses must break the horizon.** An arena whose tallest thing subtends ~10° from a spawn
  gives you a gradient with a gun in it — measured RMS 11.7 / edge 0.50 against 39–49 from a spot
  with something in front of the camera. **A frame needs an occupant.** This is recorded in
  `js/s9pc-game.js` and it is the single most expensive lesson in the file; do not relearn it.
- **Nothing important is silhouetted against something of its own value.** Cover should be a
  different value from the floor it sits on, not just a different hue.

---

## 2 · Acceptance criteria

Measured on a **daylight open arena**, HUD hidden (`__s9pc._hideui(true)`), from a validated
spawn with arena structure in frame — not aimed at the sky and not nose-to-a-wall.

| metric | **target** | too LOW looks like | too HIGH looks like |
| --- | --- | --- | --- |
| **mean luma** | **140 – 175** | dark, muddy; the high-key premise is gone and the parody reads as milsim | ACES walks the frame toward white and strips chroma — measured: 186.6 luma ⇒ sat 25.1 |
| **RMS contrast** | **42 – 55** | flat poster / empty sky. **11.7 is the recorded failure** | crushed; blacks and clipping both climb |
| **edge** (mean \|Laplacian\|) | **6.0 – 9.5** | greybox. **0.50 is the recorded failure** — nothing in frame | noise mistaken for detail; the CAS pass is sharpening grain |
| **blacks %** (luma < 12) | **0.0 – 1.5** | — | crushed shadows; a dark body in a dark shadow is invisible |
| **clipped %** (any ch ≥ 250) | **≤ 0.01** | — | the tonemapper is being overrun; highlights are flat white |
| **mean saturation** | **36 – 48** | a grey box under coloured light. **20.9 is the recorded failure** | candy; colour starts competing with the value read |
| **saturated-pixel share** (sat > 0.15) | **≥ 70 %** | too much neutral in frame — white/grey trim or concrete is taking over | — |
| **hue spread** | ≥ 2 families ≥ 15 % each, **none > 60 %** | one-note | — |
| **top-third minus bottom-third luma** | **+25 to +60** | no aerial/value depth; the frame reads as a flat card | sky is blowing out and the ground is falling into shadow |
| **peak value decile share** | **≤ 35 %** in any one decile | — | the whole frame is one value — a flat poster, whatever its mean says |
| **body − surround luma @ 8 m** | **≤ −45** | (sign must be negative) | body brighter than background — the read is inverted |
| **body − surround luma @ 20 m** | **≤ −35** | | |

### 2.1 The reference points these are grounded in

Everything below is a real recorded measurement in this repo, not a guess.

| frame | luma | rms | sat | edge | blacks | clipped |
| --- | --- | --- | --- | --- | --- | --- |
| DUST BOWL daylight *(CLAUDE.md)* | 154 | 46.9 | 34.2 | 6.87 | 0 | — |
| DUST BOWL daylight *(measured `eb29adc`)* | 155.2 | 45.3 | 34.4 | 6.90 | 0.00 | 0.006 |
| LIDO DECK *(CLAUDE.md)* | — | 42.8 | — | 5.93 | — | — |
| LIDO DECK *(measured `eb29adc`)* | 154.2 | 40.5 | 28.9 | 5.99 | 0.00 | 0.000 |
| LIDO first draft — the failure | — | **11.7** | — | **0.50** | — | — |
| DUST BOWL, grey albedo under dusk sun | — | — | **50.8** | — | — | — |
| DUST BOWL, grey albedo under daylight sun | — | — | **20.9** | — | — | — |
| DUST BOWL, near-white albedo attempt | **200** | — | **17.6** | — | — | — |
| Section 9 engine build, arenas misflagged as interiors | — | — | 27.4 | — | **0.4 %** | — |
| Section 9 engine build, `open:true` | — | 53.9 | **42.5** | — | 2.7 % | — |
| ARCADE PIT interior, exposure 1.25 | ~112 | ~29 | — | — | — | 0 |

**Read the table this way:** the arenas today sit at the *bottom* of the luma window and *below*
the saturation window. The engine has already been shown to produce 42.5 % saturation at 53.9
contrast on this hardware, so the targets are not aspirational — they have been hit once.

### 2.2 Interior arenas — a separate, deliberate standard

Interiors are NOT held to the high-key numbers. `SKY_IN` stays dark on purpose.

| metric | interior target |
| --- | --- |
| mean luma | 95 – 125 |
| RMS contrast | 27 – 38 |
| blacks % | ≤ 6 |
| mean saturation | ≥ 30 (from painted albedo and practicals, not from a coloured wash) |
| body − surround | **sign may INVERT** — indoors a body is lit against dark, so `≥ +35` is the pass |

The body/background rule is about *separation and consistency within an arena*, not about dark
bodies as such. What is forbidden is an arena where the sign is ambiguous or the gap is small.

---

## 3 · What is WRONG for this studio — the rejection list

These are grounds to send work back. They are specific because "make it more stylised" is not
actionable.

### 3.1 Photoreal grit that erases the parody
Rust streaks, grime weeping, blood decals, scanned concrete, wet-asphalt speculars, brown-grey
"realism". This studio's frame is a **printed card**, and print does not have pore detail. If a
surface would look at home in a military shooter, it is wrong here regardless of how well it is
made. **Test:** could this frame appear, unedited, in a serious tactical shooter? If yes, reject.

### 3.2 Muddy desaturated "realism"
Mean saturation under 34 on an outdoor arena is an automatic fail. The recorded mistake is
exactly this: neutral-grey albedo lit by a coloured sun, which *measures* saturated at dusk
(50.8 %) and collapses in daylight (20.9 %). **A grey box lit with white light is a grey box.**
Paint the albedo or do not claim the colour.

### 3.3 Noise mistaken for detail
`edge` is a detail metric and it is trivially gamed by spraying fbm over everything — which then
gets *sharpened* by the CAS pass and reads as compression artefacts. The `CLEAN` default in
`s9pc-world.js` gets this right and its comment states the principle correctly: *the reference is
not doing anything our renderer cannot; it is **deleting**.* Detail must come from **structure**
(joints, courses, edges, cornices, mouldings, geometry) and **silhouette**, never from grain.

> ⛔ **Live defect.** The `paint` branch of `makeTexSet()` (`js/s9pc-world.js` ~line 230) is **not
> gated by `CLEAN`** — the slab/course and brushed branches both are, the paint branch is not. So
> `crate`, `cab`, `water` and `awning` — *every saturated surface in the game* — always get chip
> and grain noise, even in clean mode. **The colour-carrying surfaces are the only noisy ones,
> which is exactly backwards.** It is visible on the red crate in DUST BOWL and on the coral
> awnings in LIDO DECK. Whoever owns `s9pc-world.js` should fix this.

### 3.4 Anything that reads as a generic asset flip
The tells, in order of how badly they hurt:
- **Axis-aligned boxes with nothing else in frame.** Every solid in LIDO DECK is a box. Not one
  curve, arch, slope, cylinder, dome or non-90° angle. Blender is now in the pipeline; this is the
  single largest available win.
- **Texture repeats that align with nothing.** The `wall` class tiles at 0.22 world-units, i.e. a
  **4.5 m repeat** on a 12 m wall — so the wall reads as a grid of three enormous squares
  belonging to no object. A repeat must either be small enough to disappear or aligned to real
  architectural courses.
- **One material doing every job.** See below.
- **A palette that could be swapped for any other without changing the game's identity.**

### 3.5 Over-bright frames
Recorded fact, not opinion: **ACES desaturates toward white.** Pushing exposure costs colour and
buys nothing — the sweep showed RMS contrast flat from 0.55 to 1.00 while saturation fell
monotonically 33.0 → 25.1. Mean luma above 180 on an outdoor arena is a fail. **Brighter is not
the same as more colourful**, and the near-white albedo attempt (luma 200, sat 17.6) is the
recorded proof.

### 3.6 White as a material instead of as an accent
`trim` (`#DBD6C4`) is the brightest value in the palette and its stated job is edges. In LIDO DECK
it is on **17 of 31 explicit `addBox` calls**, and once the loops are expanded it is roughly **36
of ~75 solids** — the diving tower, the whole kerb ring, both balustrades, seven colonnade
columns, the lintel, the colonnade roof, four cornices, eight planter bases, four parasol posts,
the lifeguard rail. That is not an edge treatment, it is the dominant material, and it is a large
part of why the arena built *for* colour measures **less** saturated (28.9) than the grey arena it
was built to beat (34.4). **A guideline that is violated 36 times is not a guideline.**

### 3.7 A coherent frame that has nothing in it
Recorded: RMS 11.7, edge 0.50. Passing the palette and failing to put a mass in front of the
camera is still a fail. Vertical mass is a **level design** requirement, not a lighting one, and
no exposure value fixes it.

---

## 4 · Character and bot direction

The artist called this out and it is genuinely unaddressed. Here is the standard.

### 4.1 What they are — the concept

They are **trading-card characters standing in a first-person shooter**. Not operators, not
soldiers, not tactical anybody. The bot handles already carry the register perfectly —
*Raoul Duke · Chuck Meltdown · Baron Von Blazed · Denim Reaper · Cogito Ribbit · Reservoir Frog ·
Rug-Pull Rick · Too Weird To Live · Public Domain · The Consigliere* — and the bodies must match
it. **A dead-serious body under a joke name is the tonal mismatch that makes the whole thing read
as placeholder.**

`scripts/blender/build-cc0-chars.py` already has this right and its own comment says why: these
are **proportion studies** — "the limbs are far too long for the head", "the mass is low and the
feet are enormous", "nothing is symmetrical". `cc0-lank` (hand-drawn slouch), `cc0-squat` (low
centre of mass, wide flat head, heavy splayed feet), `cc0-lump` (soft mass) are the right
direction. The `oni` / `kappa` / `prizm` naming and their "cloth fatigues / strapped webbing /
brushed hardsuit" material story is NEON RONIN's, and importing it here drags the tone straight
back to generic milsim.

### 4.2 What they must look like — the rules

1. **One dark mass.** Body albedo in the **0.16 – 0.26** band, `metalness ≤ 0.10`,
   `gloss ≤ 0.35`. Rendered, that puts a body at 95–135 luma against 185–215 walls, which is the
   §1.3 acceptance number. **Metalness is the trap:** a metallic body samples the environment and
   picks up the bright sky, which is precisely how a body climbs into the wall's value band.
   `prizm` at `metalness 0.85` cannot pass this test at any albedo.
2. **The head is not the brightest thing on the body.** It must be the same value as the torso or
   darker. A bright head on a dark body is a floating dot, not a silhouette — the eye tracks the
   dot and loses the shape, and the shape is what tells you which way the character is facing.
3. **The team tint is a MARK, not a wash.** One saturated element on a shape — a sash, a bib, a
   helmet band, a shoulder plate — occupying roughly 10–20 % of the silhouette. Blending the tint
   across the whole body (the current 62/38 mix) makes two different teams the same value with a
   slightly different cast, which is the read that fails first at range and under bloom.
4. **Distinguishable as black shapes at 40 px.** §1.8.
5. **The weapon is part of the silhouette.** An unarmed operative reads as a bug — the same
   argument that makes NEON RONIN always draw the sword. It should also be the darkest element,
   so the "which way is it pointing" read survives.
6. **No faces in the mesh.** Already the rule in `build-cc0-chars.py` and it is the right one for
   provenance *and* for the look: a face is where a character lives, and at 40 px it is mud.

### 4.3 What is actually shipping today — three defects

- **Every bot is the same body.** `ensureBody()` in `js/s9pc-app.js` calls
  `S9Skin.archFor(0)` — always index 0, always `cc0-lank`. `S9Skin.CAST` lists six archetypes and
  the build uses one. There is no visual variety between operatives at all beyond the tint.
- **The three best bodies have no authored material.** `S9PCSkin.material()`'s `K` table
  (`js/s9pc-skin.js`) has entries only for `oni` / `kappa` / `prizm`. `cc0-lank`, `cc0-squat` and
  `cc0-lump` — measured as the best-behaved meshes in the repo (3.3× / 4.0× / 3.9× worst stretch,
  zero triangles over 10×, ~0.2 MB each) — fall through to
  `{ d: [0.4, 0.4, 0.4], metal: 0.1, gloss: 0.4 }`. **A flat mid-grey.** That is 0.4 albedo where
  §4.2 asks for 0.16–0.26, and it is most of why the separation number is −4.
- **The `low`-tier fallback has the value structure exactly inverted.** `spawnBox()` gives the
  head `mats.skin = (0.52, 0.40, 0.31)` — the *brightest* material on the body — over
  `mats.kit = (0.30, 0.28, 0.21)` limbs and a `tint × 0.55` torso. Bright head, mid torso, dark
  legs: three values, no single silhouette, and the brightest one on the smallest part.
  ⚠ **This is what a headless capture measures by default** — `AUTO_TIER` derives from `DPRCAP`,
  which is 1 in this container, so it selects `low` and `QCFG.skin` is false. Any character
  measurement taken without `?q=high` is measuring the box rig, not the game.

### 4.4 Current body values, for reference (all of these fail §4.2)

| | float | byte | hex | verdict |
| --- | --- | --- | --- | --- |
| `oni` | 0.28, 0.30, 0.26 | 71, 77, 66 | `#474D42` | value OK, but it is a milsim fatigue green |
| `kappa` | 0.22, 0.26, 0.24 | 56, 66, 61 | `#38423D` | value OK, same tonal problem |
| `prizm` | 0.46, 0.49, 0.55 | 117, 125, 140 | `#757D8C` | ⛔ too bright AND `metalness 0.85` |
| fallback (all cc0 bodies) | 0.40, 0.40, 0.40 | 102, 102, 102 | `#666666` | ⛔ unauthored; too bright |
| box rig `skin` (head) | 0.52, 0.40, 0.31 | 133, 102, 79 | `#85664F` | ⛔ brightest part of the body |
| box rig `kit` | 0.30, 0.28, 0.21 | 77, 71, 54 | `#4D4736` | OK |

---

## 5 · Where we are now — measured review, `eb29adc`, 2026-08-01

**Method:** 960×600 viewport (918×546 backing store), default tier, `?grab=1`,
`section9.html?map=6` (LIDO DECK) and `?map=3` (DUST BOWL), ~11 s after match start, from an
authored spawn. All numbers from `readPixels`. Screenshots used for composition only.

### 5.1 The numbers

```
LIDO DECK    luma 154.2  rms 40.5  sat 28.9  edge 5.99  blacks 0.00  clipped 0.000
             bands: bottom 139.3 / mid 150.0 / top 173.3     satPx 63.6 %
             value deciles %: [0, 3.7, 1.7, 4.5, 11.3, 32.0, 12.3, 20.5, 13.8, 0]
             hue of saturated px: 30-60° 50.4 % · 180-210° 33.8 % · 0-30° 8.3 %

DUST BOWL    luma 155.2  rms 45.3  sat 34.4  edge 6.90  blacks 0.00  clipped 0.006
             bands: bottom 130.5 / mid 150.1 / top 185.0     satPx 84.7 %
             value deciles %: [0, 3.2, 6.5, 7.5, 9.9, 8.4, 15.8, 46.6, 2.1, 0]

silhouette separation (body dead-centre, surround = flanking strips at the same height band)
             LIDO  @  8 m   body 140.6   surround 144.6   sep  −4.0
             LIDO  @ 20 m   body 175.0   surround 184.5   sep  −9.5
             DUST  @  8 m   body 177.2   surround 148.7   sep  +28.5   ← sign INVERTED
```

### 5.2 Against the criteria

| metric | LIDO | DUST | target | |
| --- | --- | --- | --- | --- |
| mean luma | 154.2 | 155.2 | 140–175 | ✅ ✅ |
| RMS contrast | 40.5 | 45.3 | 42–55 | ⚠ marginal fail · ✅ |
| edge | 5.99 | 6.90 | 6.0–9.5 | ⚠ on the floor · ✅ |
| blacks % | 0.00 | 0.00 | ≤ 1.5 | ✅ ✅ |
| clipped % | 0.000 | 0.006 | ≤ 0.01 | ✅ ✅ |
| mean saturation | **28.9** | **34.4** | 36–48 | ⛔ **fail** · ⛔ **fail** |
| satPx | **63.6** | 84.7 | ≥ 70 % | ⛔ fail · ✅ |
| hue spread | 50.4 / 33.8 | 40.3 / 32.9 / 23.4 | ≥2 ≥15 %, none >60 % | ✅ ✅ |
| top − bottom band | 34.0 | 54.5 | +25 to +60 | ✅ ✅ |
| peak decile share | 32.0 % | **46.6 %** | ≤ 35 % | ✅ · ⛔ **fail** |
| body − surround @8 m | **−4.0** | **+28.5** | ≤ −45 | ⛔ **fail** · ⛔ **fail (sign)** |

### 5.3 The honest critique

**What is genuinely right, and should not be touched.** The high-key call was correct and it
holds: zero blacks, zero clipping, a clean top-to-bottom value gradient, and a coherent two-family
palette (sand-orange against pool-teal, coral as the accent) — that is a designed frame, not a
default one. The reasoning recorded in `s9pc-world.js` and `s9pc-app.js` — that you cannot retint
your way to a place, that ACES charges for exposure in chroma, that a frame needs an occupant, that
daylight haze at 52 m is nonsense — is all correct and all hard-won. **The direction is right. The
execution has stopped short of it in three specific ways.**

**1 · The characters do not silhouette. This is the serious one.**
`s9pc-world.js`'s palette comment states the design intent exactly: *"walls and ground go BRIGHT
(0.72–0.82) so a dark operative silhouette reads against them at any range."* **The walls got
bright. The operatives never got dark.** Measured separation is **4 luma levels** at 8 metres —
which is to say a body standing eight metres in front of you is, in value terms, *the same as the
wall behind it*. The only thing making the bot findable in that frame is a blue torso patch, and
it is blue against teal water. At 20 m it is 9.5 levels. The high-key palette has been paid for in
saturation and is not delivering the thing it was bought for. Everything in §4.3 feeds this: a
0.40 unauthored grey body, one archetype for every bot, and a fallback rig whose brightest
material is on the head.

Worse, the **sign flips between arenas**: on DUST BOWL the body is *brighter* than the ground it
stands on (+28.5). A player has to learn a different read per map, which is the same class of
problem as an inverted mouse.

**2 · It reads as a blockout, not a place.** Every solid in LIDO DECK is an axis-aligned box.
There is not one curve, arch, slope, cylinder, dome or non-90° angle in the frame. The diving
tower is a box with a box on it. A cabana is a box with a wider box on it. A planter is a white
box with a green box on it — and a green box is what an untextured collision volume looks like,
so the planting reads as missing geometry rather than as planting. On top of that the `wall` class
tiles at a 4.5 m repeat against a 12 m wall, so the masonry reads as a grid of three giant squares
that belong to no object in the scene. That grid is the loudest single "this is a prototype"
signal in the frame.

The layout underneath is good — the pool is a legible exposed crossing, cover is coloured and
low, the colonnade gives a real peek-and-shoot line, the towers break the skyline, and the spawns
were authored rather than rescued. **The level design is ahead of the level art.** Blender is now
in the pipeline; this is where it should be pointed first.

**3 · The arena built for colour is the least colourful one we have.** LIDO DECK measures
**28.9 %** mean saturation against DUST BOWL's **34.4 %** — the concrete yard beats the lido. The
cause is §3.6: `trim` at `#DBD6C4` is on roughly 36 of ~75 solids, so a near-neutral off-white is
the dominant material in an arena whose whole premise was painted surfaces. Only 63.6 % of pixels
carry any saturation at all. The `water` / `plant` / `awning` classes were the right idea and
they are being outvoted by their own edge treatment.

**Two smaller things worth logging.**
- LIDO DECK's RMS 40.5 and edge 5.99 both sit *just under* the floor. Nothing is broken, but
  there is no margin: the arena is one simplification away from the flat-poster failure mode, and
  the fix is structure and geometry, not sharpening.
- ⚠ **`?q=high` renders a broken frame in this container on `eb29adc`** — shattered geometry, mean
  luma ~20, repeated `Cannot read properties of undefined (reading 'x')`. That is on a commit
  labelled `wip: in-flight agent work (unreviewed checkpoint)`, so it is very likely transient
  and/or a SwiftShader-only path failure rather than an art issue. **Flagging it, not judging it —
  but the skinned-body path is the one that matters for §4 and it needs to be verifiable.**

### 5.4 The top three changes, in order of how much they would improve the look

1. **Make the bodies dark and make them different.** Give `cc0-lank` / `cc0-squat` / `cc0-lump`
   authored materials in the 0.16–0.26 albedo band with `metalness ≤ 0.10`, put the team tint on a
   *shape* rather than blending it across the mesh, stop `ensureBody()` pinning every bot to
   `archFor(0)`, and fix the box rig so the head is not the brightest part of the body. This is the
   cheapest change on the list and it is the one the entire palette was built to enable. Target:
   separation from −4 to ≤ −45.
2. **Author the arena in Blender with non-box masses.** Arches on the colonnade, a curved pool
   lip, tapered parasol posts and real canopies, planting with actual foliage silhouette, a domed
   or stepped roof on the pavilions, chamfers on everything. Fix the wall tiling to align to
   authored courses at the same time. This is what turns a blockout into a place and it is what
   the artist meant by *"we have blender, shader tools, so much to create with"*.
3. **Demote `trim` to an actual edge treatment and give the reclaimed area to painted colour.**
   Cap it at ≤ 15 % of an object's height and stop using it as the body material for towers,
   columns, kerbs and planter bases. Target: LIDO saturation 28.9 → ≥ 36 and satPx 63.6 → ≥ 70,
   *without* touching exposure or `grading.saturation` — because §1.5 and §3.5 both say those two
   knobs cannot buy it.

*(And while in `s9pc-world.js`: gate the `paint` branch on `CLEAN`. §3.3. It is a two-line fix
and it is currently putting the game's only noise on the game's only saturated surfaces.)*

---

## 6 · Review checklist

Runnable by another agent, in order. **Stop at the first ⛔.**

**A · Frame metrics** — `?grab=1`, `__s9pc._hideui(true)`, daylight open arena, from a spawn with
structure in frame.

- [ ] `__s9pc._clip()` → `meanLuma` in **140–175**
- [ ] `__s9pc._clip()` → `rms` in **42–55**
- [ ] `__s9pc._clip()` → `clippedPct` **≤ 0.01**
- [ ] `__s9pc._sharpMetric()` in **6.0–9.5**
- [ ] blacks (luma < 12) **≤ 1.5 %**
- [ ] mean saturation **36–48 %**, saturated-pixel share **≥ 70 %**
- [ ] no single value decile holds **> 35 %** of the frame
- [ ] top third − bottom third luma in **+25 to +60**
- [ ] ≥ 2 hue families at ≥ 15 %, none over 60 %

**B · Silhouette** — `?q=high`, body dead-centre at 8 m and 20 m, FX and other bots cleared.

- [ ] `body_mean − surround_mean ≤ −45` at 8 m
- [ ] `≤ −35` at 20 m
- [ ] **sign is negative in every outdoor arena tested** (inverted sign = ⛔ regardless of magnitude)
- [ ] each body distinguishable from the others as a 1-bit shape at 40 px tall
- [ ] the head is not the brightest material on the body
- [ ] the weapon is present and is among the darkest elements

**C · Eyeball, from screenshots** *(layout only — no colour conclusions from a PNG)*

- [ ] Is there anything in frame that is **not** an axis-aligned box?
- [ ] Does any texture repeat align to an authored architectural feature, or does it float?
- [ ] Does every object have a visible contact where it meets the ground?
- [ ] Could this frame appear unedited in a serious tactical shooter? *(yes ⇒ ⛔ §3.1)*
- [ ] Is the brightest large area a wall/sky, and the darkest small area a character?
- [ ] Cover the HUD: is it still obvious where you can hide?

**D · Regressions this repo has already paid for once**

- [ ] `?tod=dusk` still renders (a daylight-only palette with a hole in it is a fail)
- [ ] interiors have **not** been dragged into the high-key numbers — `SKY_IN` stays dark (§1.6)
- [ ] no saturation was bought with exposure, `grading.saturation`, or a coloured haze (§1.5)
- [ ] no toon/rim outline pass was added (§1.7)
- [ ] `edge` did not rise because grain was added rather than structure (§3.3)
- [ ] the six built-in arenas still carry `open:true` (blacks 0.4 % ⇒ 2.7 %, sat 27.4 ⇒ 42.5)
- [ ] classic build `section9-classic.html` unchanged — it is the rollback and the free A/B

---

## 7 · Standing notes

- **Work like there is no deadline.** Per CLAUDE.md: the only things that must ship finished are
  the contract, the lenses and the token functionality. Everything creative is **open studio, work
  in progress**, agreed with SuperRare. Do not argue the launch date against creative work; that
  has been answered.
- **Only commit geometry the artist owns or that is clearly licensed for commercial/NFT use.** The
  artist's own standing rule. `models/cc0/` and `docs/CC0-SOURCES.md` are the model for how to
  evidence it.
- **`GfxPost`'s calibration is a measurement, not a default.** The 0.94 highlight knee, the
  composite ordering and the tactical motion smear were swept against clipped-pixel counts. An
  engine replaces the FUNCTION, not the TUNING. If a number moves, re-derive it and write down
  what you swept.
- **When the eye and the measurement disagree, measure again — then stop.** The card-35 lesson.
  A metric that swings hard on a small change is inviting a "fix" that makes the art worse.

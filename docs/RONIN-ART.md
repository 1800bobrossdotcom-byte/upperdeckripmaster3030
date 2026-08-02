# NEON RONIN — the art direction

> ⚠ **This is a brief, not a rubric.** `docs/ART-DIRECTION.md` measures whether something came out
> wrong. `docs/DESIGN-SYSTEM.md` §8 says what a brief must decide before any code is written. This
> file is that brief, for the duel, and it answers §8 for **three subjects**: the FIGHTER, the
> STAGE, the IMPACT. Every claim below has a number attached or is marked as an open question.
>
> ⛔ Owned by the renderer (`js/ronin3d.js`, `js/ronin-fighters.js`, `js/ronin-morph.js`).
> **Combat timing, states, damage, hitstop duration and camera *triggers* belong to `js/ronin.js`**
> and are not decided here — this file says only what those states must LOOK like.

---

## 0 · Why this file exists, and what it is not allowed to do

`DESIGN-SYSTEM.md` §9 records the same failure twice: a brief that names the **material** and the
**light** and waves at **motion** produces a beautiful object that is dead to the touch. The
diagnosis is structural, not a matter of taste — *a renderer HAS FEATURES for material and light,
so an agent answers §1 and §2 and feels finished. §4 has no feature to reach for.*

So §4 is answered first here, for every subject, and it is answered with a **cause**, never with a
clock. The rule that falls out of it, and it is the load-bearing rule in this document:

> ⛔ **NOTHING IN NEON RONIN MOVES ON ITS OWN.** No idle drift, no breathing loop, no orbiting
> shard, no shimmer keyed to `uTime`. Every movement in the frame is traceable to a body that
> accelerated, a camera that turned, or a hit that landed. **At rest, every secondary offset in
> the renderer is exactly 0 — and that is asserted, not asserted-in-a-comment.**

**What was already wrong when this file was written**, all four found by reading the code rather
than by looking at it:

| where | what it did | why that is the §4 failure |
| --- | --- | --- |
| `archBack` kunoichi scarf | `t3 * 3 + i * 0.7` → a sine per segment | the scarf waves while the fighter stands still |
| `archShards` prizm | `t3 * 0.7` orbit | five crystals circling a motionless body, forever |
| `LIT_FS` mat 4 "crystal" | hue = `cos(6.2831*(fac + uTime*0.25))` | **iridescence keyed to TIME is a sticker of foil.** §1's rejection list, verbatim |
| the fight camera | `Math.sin(t3 * 0.22) * 0.10` azimuth | the camera drifts when nothing has happened |

⚑ And the fifth, which is worse because it is invisible in a still: **`t3` advanced during
hitstop.** The game freezes the simulation for 55–130 ms on every hit — that freeze is the whole
genre — and the renderer kept animating straight through it. The one moment the picture is
supposed to be a held frame was the one moment nothing was held.

---

## 1 · THE FIGHTER

### 1 · What it is made of — **a die-cut printed standee, not a CG character**

⚑ This is the decision the rest of the fighter follows from, and it is taken straight out of
`DESIGN-SYSTEM.md` §1: *everything this studio makes is a printed object.* NEON RONIN's cast are
card characters. So a fighter is **the character punched out of the stock and stood up on the
table** — not a person, not a mannequin, not a smooth bevelled game asset.

Four layers, mapped onto the four in §1:

| §1 layer | on a fighter | rule |
| --- | --- | --- |
| **ink** | the body, the cloth, the skin | flat, saturated, **stepped** — see below. ⛔ takes no specular, ever |
| **die** | the outline of the figure | the cut edge of the stock: a bright core just at the silhouette, with the printed keyline sitting just inside it |
| **foil** | blade, tsuba, belt hardware, prizm's body, oni's horns | hot-stamped: hue **walks with the half-angle**. Nothing else in the frame may be iridescent |
| **stock** | the arena — see §2 | the fighter stands on it, it is not part of him |

**Ink is stepped, and that is a physical claim rather than a style.** Flat printed ink cannot
produce a smooth gradient; a printed object gets its form from *value steps* and from the black
keyline. So diffuse is quantised into a small number of bands. ⚠ Do not read this as "toon
shading because it looks cool" — read it as *the material cannot do a continuous ramp*.
**Acceptance: a body surface reports ≤ 12 distinct luma levels; a smooth ramp reports hundreds.**

**The die-cut profile replaces the fresnel rim, and this is the biggest single change.** The
shipped shader did `lit += uColor * rim * 0.55` — a bright fresnel added to *every* surface. That
is the default a renderer hands you, it is what `DESIGN-SYSTEM.md` §7 rejects by name ("default
extrude + uniform bevel → die-cut profile: chamfer, micro-bevel, bright rim, varied depth"), and
on a matte cloth sleeve it is simply wrong. Replaced with a **two-band die profile**:

- **outermost band** (grazing) → the exposed core of the cut stock: bright, slightly warm, narrow.
- **the band just inside it** → **the keyline**: darkened. This is the printed contour, and it is
  what makes the figure read as drawn rather than rendered.
- **interior** → flat stepped ink, no view-dependent term at all.

⚑ That ordering is the point and it is why this is not just "add an outline": a real die-cut card
is **bright at the very edge and dark just inside it**, because you are seeing the white core of
the board past the end of the printed area. An outline shader gives you the dark band and not the
bright one, and the result reads as a sticker.

**Foil is confined.** ⛔ `DESIGN-SYSTEM.md` §1: *an env map on a flat face is actively harmful.*
Metal and crystal walk their hue; ink never does. **Acceptance: measured hue travel across view
angles ≥ 60° on a foil surface and ≤ 8° on an ink surface, in the same scene.** Both numbers are
required — a test that only proves the foil moves cannot catch foil leaking onto the ink.

### 2 · How it is lit — **the studio's own three lights, for the first time**

`DESIGN-SYSTEM.md` §2 declares one light model for the whole studio and the game had never used
it: NEON RONIN ran a single white lamp at `[0.35, 0.9, 0.5]` plus a flat 0.26 ambient. Adopted as
stated:

- **KEY — phosphor green `#2bff80`, raking**, high and off the shoulder. Does the shaping.
- **FILL — acid magenta `#ff2ad9`, from below, weak.** Keeps recesses off dead black and puts the
  palette in the frame twice. It is also *the floor* — the arena is magenta neon, so a magenta
  bounce from underneath is the physically true answer as well as the branded one.
- **RIM — cyan `#27f7e4`, near-grazing, fixed.** This is what lifts a figure off a dark stage, and
  it is what makes the die edge read.
- **Gold `#ffd23b` is not a light.** It is the accent: the charged blade, the meter, the win.

⚠ **A coloured key can eat the albedo, so the cost is measured, not assumed.** The acceptance
number for the lighting change is *frame saturation must not fall* — reported below.

### 3 · What moves, and why it physically moved

The skeleton is the game's (`ronin.js` owns the springs, and correctly — it is combat). What the
renderer owns is everything the skeleton drags behind it, and none of it existed:

- **Soft goods are driven by the body's own acceleration.** The haori, the doomer's coat, the
  kunoichi's scarf, hair, and prizm's shards are nodes on damped springs whose forcing term is
  `−m·a` of the fighter plus gravity. Shove the fighter and the cloak swings **later** than the
  body and **further**; stop, and it rings down. ⛔ At rest, all of it is exactly 0.
  ⚑ The prizm's shards are the sharpest case: they used to *orbit on a timer*. Now they hang in
  the field of the body and get thrown when it lunges. Same five crystals, opposite meaning.
- **Weight is contact, and contact is the shadow.** The shadow was one fixed-radius quad at fixed
  alpha regardless of altitude, per fighter, for every archetype. It now **tightens and darkens as
  a body approaches the floor and spreads and fades as it leaves** — which is the only cue in the
  frame that says how high something is — and its footprint is the archetype's own (an oni's
  shadow is not a kunoichi's).
- **A landing settles.** Touchdown compresses the standee and rebounds it, scaled by the impact
  speed. ⚠ This is a *render* spring, not a gameplay one: it never moves a hitbox.
- **Hitstop freezes the renderer.** During `G.hitstop` the renderer's own clock does not advance,
  so cloth, foil and FX hold on the impact frame with the fighters. This is a one-line change and
  it is the single biggest "Tekken" item in the file.

### 4 · What it sits on

The arena — §2 below. ⚑ Not a metaphor: the fighters must be *seen* to stand on a finite object
with a visible edge. `DESIGN-SYSTEM.md` §5: *floating UI is the failure mode; a printed object
always has a surface under it.* The duel was previously happening on an infinite grid in a void.

### 5 · Acceptance measurement

1. **Silhouette distinctness, measured pairwise, not asserted.** Each archetype is rendered in an
   identical pose from an identical camera; the frame is thresholded to a binary mask; every pair
   is compared by **IoU** twice — raw (position, size and shape) and **bounding-box-normalised**
   (shape alone). Two numbers on purpose: raw IoU rewards an oni for being enormous, which is real
   distinctness in a fighting game, while normalised IoU is the harder question — *if they were
   the same size, could you still tell?*
2. **Ink is stepped:** ≤ 12 distinct luma levels on a body surface.
3. **Foil travels, ink does not:** ≥ 60° hue travel on foil, ≤ 8° on ink, same scene.
4. **Nothing moves on its own:** with the fighter held still, every soft-goods node is 0.000.
5. **Soft goods lag:** after an impulse, the cloak's peak displacement occurs **later** than the
   body's and the cloak **overshoots** on the way back. (A lerp passes "did it move"; it fails
   both of these. Same trap as the wordmark rig — §9.)
6. **Hitstop holds:** renderer clock delta across a hitstop frame = 0.

---

## 2 · THE STAGE

### 1 · What it is made of — **the ring is a card, lying on a dark table**

The arena was an infinite neon grid, thirteen flat lavender boxes and a sphere. It had no edge, no
depth cue that survived a camera swing, and nothing in it said where it was.

**Decision: the fighting surface is one enormous piece of hot-stamped foil card stock, die-cut,
lying on a dark table.** That is the studio's material spine (§1) applied to the largest surface in
the game, and it earns three things at once that a grid cannot:

- **An edge.** The die-cut boundary — chamfer, bright core, keyline — is the first appearance of
  the §1 "die" layer anywhere in this repo. It is also what makes §5's *everything sits on
  something* literally true.
- **Foil, correctly.** The floor's hue walks as the camera moves. This is the studio's most-broken
  material claim ("nothing in the project behaves like foil"), and the arena floor is the biggest
  possible place to fix it.
- **The neon grid survives** — it becomes the guilloche printed on the card, which is what a grid
  on a card actually is.

### 2 · How it is lit

The same three lights, plus the stage's own emissive ink (the guilloche is printed in magenta neon
and lights itself). The table beyond the die edge takes fill only, so it falls away into the dark
and the card reads as the lit object. **Dark field, lit object** — §5.

### 3 · What moves, and why

⛔ **Nothing.** No drifting camera, no pulsing grid, no rolling fog. What changes is the *view*:

- **The foil's hue walks because the camera moved.** The camera moves on hero moments only
  (`cineKick`), which means the floor changes colour exactly when something happened. That is the
  §4 answer for the stage and it required no new motion at all — the movement was already there,
  keyed to combat, and the material simply now responds to it.
- **Parallax between depth bands because the camera moved.** The backdrop is built at three real
  depths, so camera motion separates them. **Acceptance: near:far screen displacement > 1.6** — a
  backdrop painted at one depth reports 1.00 and fails. Measured **2.41**.
  ⚑ **And the sign depends on which camera motion you measure, which is worth knowing before
  anyone "fixes" it.** The fight camera does two different things: it TRUCKS sideways every frame
  tracking the fighters' midpoint, and it ORBITS occasionally on `cineKick`. Under a truck you get
  classic parallax — near moves more (41 px vs 17 px). Under an orbit that keeps *looking at the
  centre* you get the opposite, because a distant object barely moves in the world while the view
  direction sweeps the whole angle (far 32 px vs near 36 px, and the mid band scarcely moves at
  all). Both separate the bands; only the truck has the sign the word usually means, and the truck
  is the motion this camera makes constantly. The first version of the test asserted the orbit's
  ordering and failed a renderer that was correct.

### 4 · What it sits on

The table. There is a surface under the card and it is visible past the die edge.

### 5 · Acceptance measurement

- Foil hue travel across camera azimuth (degrees), from `readPixels` in a `preserveDrawingBuffer`
  context — ⚠ **never from a screenshot**: this container rotates hue on canvas content.
- Parallax ratio near:far > 1 by a stated margin.
- Frame legibility: blacks, contrast and clipping before/after, so a brighter floor cannot quietly
  eat the black point the fighters are read against.

---

## 3 · THE IMPACT

The frame a hit lands is the genre. `CLAUDE.md` already lists what exists — ribbon blade-streaks,
crescent arcs, velocity-aligned sparks, ring shocks, sprite pops, the dynamic camera. **The brief
is to improve those, not to build a second set beside them.** Four defects, each a cause:

### 1 · Made of — light, and misregistered ink

- ⚑ **The signature hit effect is a REGISTRATION SLIP.** The artist's lineage is hand-drawn work
  with *deliberately crude registration* (`DESIGN-SYSTEM.md` §6, `CC0-SOURCES.md`). So when a
  fighter is struck, **his colour plates separate**: a cyan ghost and a magenta ghost pull apart
  from the body for ~0.12 s and snap back. It is chromatic aberration confined to one object,
  fired by a hit — a *printing* failure, not a video-game glow, and it is the one impact effect in
  this document that a default pipeline would never emit.
- ⛔ It must be **on the struck body only**. A full-screen aberration is a post-process everyone
  has; a plate slip on the thing that was hit is a printed object being hit.

### 2 · Lit by

Unchanged — the three lights. The slip ghosts are additive and unlit by construction (they are ink
plates, not surfaces).

### 3 · What moves, and why

- **Camera shake was white noise** (`(Math.random()*2-1) * shake` per axis, per frame). A struck
  camera does not vibrate randomly; it is **displaced along the direction of the blow and rings
  back**. Replaced with a decaying oscillation on an axis derived from the hit direction the game
  already publishes (`G.camDir`). **Acceptance: the trace crosses zero and decays; noise does
  neither.**
- **Ribbons were flat.** Blade streaks and crescents built their width from a fixed perpendicular
  in the world x-y plane, so the moment the camera swung off the fight line — which is exactly
  when the camera swings, on a hero moment — a blade trail collapsed to a line and the crescent
  turned edge-on. They are **camera-facing** now: the ribbon width is built against the view
  vector. **Acceptance: ribbon screen width at azimuth 0 vs. a swung azimuth; the old path loses
  most of it, the new path holds it.**
- **Hitstop holds the frame** (see §1.3).

### 4 · Sits on

The impact happens above the card, and the ring shock spreads **across the card's surface** rather
than in mid-air, so a hit is visibly transmitted into the thing everyone is standing on.

### 5 · Acceptance measurement

- Shake trace: sign changes ≥ 2 and monotonically decaying envelope.
- Ribbon screen width retained across a camera swing, as a percentage.
- Plate slip: coloured fringe offset > 0 px on a struck body and exactly 0 on an unstruck one.

---

## 3½ · THE NUMBERS — `npm run test:roninart`, 40 assertions

Everything below is read off the shipped renderer through `Ronin3D.probe`, which draws with the
same `drawFighter`/`drawScene` the game uses. ⚠ Colour comes from `readPixels` into the probe's own
framebuffer, never from a screenshot — this container rotates hue on canvas content.

| what | measured | the bar |
| --- | --- | --- |
| silhouette, 13 bodies · 78 pairs | mean IoU **raw 0.48**, **shape-only 0.45** | raw < 0.72 |
| worst-confusable pair | **0.78** — `rip-mascot` / `cc0-lump` | < 0.94 |
| most distinct pair | **0.24** — `kunoichi` / `cc0-lank` | — |
| ink value steps on a body surface | **10** (of 143 distinct luma values) | ≤ 12 |
| foil hue travel, **floor** (`GND_FS`) | **109.5° median**, 180° max, over ±0.5 rad | ≥ 60° |
| foil hue travel, **fighter** (`LIT_FS`) | **166.6°** over ±0.6 rad | ≥ 45° |
| **ink** hue travel, same sweep | **6.2°** | ≤ 8° |
| soft goods at rest, 4 s | offset **exactly 0.000**, velocity **exactly 0.000** | = 0 |
| cloth lag behind the body | **75 ms** | > 0 |
| propagation down the chain | **75 → 158 → 250 ms** | strictly increasing |
| return overshoot past zero | **−2.03 px** | < 0 |
| hitstop, 8 frames | **0.000** movement, resumes at **4.90 px** on the next live frame | = 0, then > 0 |
| camera shake | **9 sign changes**, envelope **0.11 → 0.02 → 0.01** | oscillates + decays |
| blade trail pointed at the camera | **46 px lit, 10 px wide** (broadside control 12 px) | was geometrically **0** |
| plate slip, struck frame | **1423 px** of fringe outside the body | > 60 |
| plate slip, unstruck / expired | **0 px**, **0 px** | = 0 |
| parallax, near : far, camera truck | **2.41** (41 px / 17 px) | > 1.6 |
| empty stage | mean luma **20.8**, clipped **0.00%**, black **50.2%** | mean < 46 |

**The whole-frame numbers, `npm run debug ronin`** — median of five frames, SwiftShader, so
comparable between runs and never an fps or a colour claim.

⛔ **THIS GAME IS EVENT-DRIVEN AND ONE RUN OF THE SWEEP IS NOT A MEASUREMENT.** Run four times on
the same build, the median frame came back at **29.1 · 29.6 · 31.5 · 37.2** depending on whether a
hit-flash happened to land in the five-frame window — the sweep prints its own warning when the
spread exceeds 25 and it fired on three of the four. So the comparison has to be made *within*
regime, not against a single number:

| | before (1 run) | after, quiet frames | after, a frame with a hit in it |
| --- | --- | --- | --- |
| luma mean | 35.4 | **29.1 – 29.6** | 31.5 – 37.2 |
| contrast | 42.4 | **35.6 – 36.3** | 39.5 – 48.6 |
| p99 | 212 | **182 – 183** | 192 – 226 |
| clipped | 0.17% | **0.18 – 0.20%** | 0.27 – **0.38%** |
| black | 45.7% | **52.2 – 52.6%** | 48.4 – 51.7% |

- ✅ **At rest the frame is a dark field again**: blacks 45.7 → 52.4%, p99 212 → 182. That is what
  §5 asks for and what the old build did not have — its floor was a lit grid, edge to edge.
- ⚠ **Contrast fell, 42.4 → ~36, and it is a real cost.** The old frame bought its spread from a
  near-white mannequin and a bright grid, both of which were the defects; but the number went
  down and should be reported going down.
- ⚠ **Clipping during a hit is up, 0.17% → 0.38%.** The plate slip and the ring are additive on
  top of a scene that already blooms. Below GfxPost's own threshold for concern, but it is the
  one number that moved the wrong way in the impact work and it should be watched.
- ⚑ **The clean number for the stage change is the probe's, not the sweep's**: an empty stage,
  deterministic, measures mean luma **21.3 with 0.00% clipped and 50.3% black.** That is the row
  above and it is the one to sweep a future change against.

⛔ **Not measured, and not claimable:** frame time (SwiftShader — relative only), colour on a real
GPU, and anything on a real phone. Task #73 still stands.

---

## 4 · The rejection list, for this game specifically

| ⛔ do not | ✅ do |
| --- | --- |
| a fresnel rim on every surface | a two-band die profile: bright cut core, keyline inside it |
| smooth diffuse ramps on cloth | stepped ink, ≤ 12 levels |
| iridescence keyed to `uTime` | hue keyed to the half-angle; measured in degrees |
| an idle camera orbit | a camera that moves only when the game moved it |
| a scarf on a sine | a scarf on the body's acceleration |
| a shadow of constant size | a shadow that is the contact cue |
| more FX beside the existing FX | fix the four that are already there |
| an infinite grid | a finite die-cut object with a table under it |
| "make it look premium" | look at the artist's own cards |

---

## 5 · Open questions — the artist's, not the renderer's

1. **The three lights are `DESIGN-SYSTEM.md`'s proposal, and that file is explicitly a draft.** A
   phosphor-green key over a red oni is a real colour decision and it is his. The rig is one
   constant block; the hues can be changed without touching anything else.
2. **The crowd, and it is the weakest thing in this pass.** Two ranks of card standees stand
   beyond the far die edge — the deck watching the title fight (`DELTRON-3030.md` idea 3: the
   battle is a performance, and NEON RONIN "lacks the sense of an audience and a championship").
   ⚠ It took three attempts to make them read at all and the third gives up the material rule:
   at 1.5 units tall they were thin bright ticks at the frame margin; enlarged and drawn as INK
   they became a picket fence, because a 0.10-deep card at 21 units shows a near-white die edge
   against a face ten times darker; they are now FLAT, a shade above the low sky, so the card
   *shape* carries. **A crowd at distance is a silhouette.** Whether the audience should be cards,
   people, or nothing at all is a call, not a bug — and "nothing" is a defensible answer.
3. **The roster's silhouettes.** The measurement names the confusable pairs: **`rip-mascot` /
   `cc0-lump` at 0.78**, `cc0-grid` / `cc0-squat` at 0.75, `rip-mascot` / `cc0-squat` at 0.71 —
   all of them among the seven generated bodies, none among the original six. Fixing a pair means
   changing what a character *is* (proportions, a silhouette prop, a weapon), which is design.
   ⚑ The renderer can only do so much here: `cc0-lump` and `rip-mascot` are both mid-build bodies
   with the same wardrobe slot and no distinguishing headgear.
4. **The 2D fallback (`ronin-fighters.js`) is now a different-looking game from the 3D path.** It
   is the no-WebGL route and it must stay playable, but it has not been redirected to this brief.
   Doing so is a separate pass and should probably wait until the 3D look is signed off.

# THE CITY GAME — design brief

> ⚠ **A DRAFT FOR THE ARTIST. Proposals, not decisions.** Same status as `docs/DESIGN-SYSTEM.md`.
> Strike what is wrong. Nothing here is settled except the four decisions recorded at the top.

*Replaces NEON RONIN. Artist's call, 2026-08-03: "neon ronin honestly sucks as a game… how about a
game that has us as a squirrel and we just explore the city… very mellow game. large levels.
amazing graphics."*

---

## ✅ SETTLED (artist, 2026-08-03)

| | decision |
| --- | --- |
| **the place** | a **park / green pocket** AND a **neighbourhood block**, adjoining — one continuous space. A third area later. |
| **scope** | **REPLACES NEON RONIN.** `ronin.html` becomes this game; the duel lives on in git history. |
| **first animal** | **THE BIRD.** |
| **who you can be** | squirrel · dog · cat · bird |

**What you do:** explore, and look for cards, items and power-ups. Take photos. That is the whole
loop. There is no fail state and nothing chases you.

⚑ **WHY BIRD FIRST, since it is not the hardest thing.** The quadruped rig is a *known* hard
problem — it will take the time it takes and no prototype changes that. Whether **the place is
worth looking at** is the *unknown* one, and a mellow game about noticing things lives or dies on
it. The bird is the fastest way to put the city in front of a camera and find out. It also reuses
`js/ronin-world.js`'s boost-flight, which is already written.

---

## 1 · WHAT IT IS

⛔ **The one idea that ties it to the studio, and the reason this is not a generic walking sim:**

> **A photograph you take becomes a card.**

The artist's own recorded frame: *the trading card is the form — a **size** before it's anything
(palm, phone, two sides: a front that shows, a back that tells)*. A photo is already that shape.
So the loop is:

    explore  →  notice  →  frame  →  shoot  →  it is a card in your binder

That is the rip/pull/reveal in a different key. The anticipation is not a pack tearing open, it is
**cresting a roofline and seeing something you did not know was there.** And it is the anti-casino
position stated in the ethos — *the tangible prize is the having-done-it* — with the artefact being
a thing you made rather than a thing you won.

⚠ Found cards and photographed cards are **different things and must stay different**: found cards
are the artist's; photographed cards are yours. They should not sit in the same sleeve without a
mark. Decide how they are distinguished — this is the first question the binder will ask.

### The animals are LAYERS, not skins

Each one sees and reaches a different part of the same city. This is what stops "pick your
character" being a costume menu:

| | reaches | sees |
| --- | --- | --- |
| **bird** | anywhere, briefly — perch, glide, no climbing | the **whole map from above**. Spots what the others must then go and get. |
| **squirrel** | branches, wires, ledges, drainpipes — the vertical | the middle layer. Small gaps, high thin places. |
| **cat** | fences, sills, under things, through gaps | ground and low roofs; gets *in*. |
| **dog** | the street, and only the street | nose-level. Finds what is buried or behind, not above. |

⚑ So the bird is the **scout** and the others are the **reachers**, and a card seen from the air is
a plan rather than a pickup. That single asymmetry is worth more than any amount of stat tuning.

---

## 2 · THE BRIEF PROPER

⛔ **DESIGN-SYSTEM §1–4 exists because a brief that carries a mood produces the default.** It has
happened twice on this project (hero wordmark v1 and v2), and the recorded diagnosis is that a
renderer HAS FEATURES for material and light — so an agent answers those and feels finished —
while "what moves and why it physically moved" has no feature to reach for and has to be designed.
So: all five, before any code.

### What it is MADE OF

**Painted card stock, at city scale.** Not photoreal, not toon-shaded. The city is built the way
the artist's own cards are built: **flat saturated ink, high contrast, deliberately crude
registration** — `docs/CC0-SOURCES.md` records his Fake Rares work as the natural first source and
DESIGN-SYSTEM says outright that when unsure, the answer is *look at the artist's own cards*, never
*make it look premium*.

Concretely: large flat colour fields, black or near-black line where forms meet, and **colour
separation that misses by a pixel or two on purpose** — the misregistration of cheap card printing.
Brick is one red with a darker red line, not a brick texture.

⚠ **This is also the cheapest route to "amazing".** A photoreal city needs an asset budget this
studio does not have; a *beautifully printed* city needs decisions, which it does.

### How it is LIT

**One low sun and a lot of sky.** A mellow game is a game where the light is doing the emotional
work, so the time of day is the mood dial and nothing else needs to be.

- Long shadows, warm key, cool sky fill — the ratio wide enough that a north-facing wall is
  genuinely a different colour from a south-facing one.
- ⚠ **Interiors and unders are the whole point of a cat/squirrel.** `S9World`'s recorded lesson
  applies: **ambient goes UP under cover, not down** — inside a stoop or under a bench the fill is
  bounce off close surfaces, and lighting it darker is what makes a game look muddy.
- ⛔ **No bloom-first look.** The GfxPost stack is calibrated (0.94 knee, measured) and it belongs
  here, but a mellow park is not a neon arena: `sky` preset territory, not `neon`.

### What MOVES, and why it physically moved

This is the section that gets skipped. Everything on this list is a **force or a spring with a
state variable, never a function of absolute time** — the rule the pickups already follow.

- **Leaves and grass** move because something *passed through them*. A bird landing bends the
  branch it lands on, and the branch springs back. Wind is a slow drift, not a loop.
- **The bird itself**: wingbeats cost height, a glide trades height for distance, and a perch is a
  full stop with a settle. ⚑ `js/ronin-world.js` already has `leapBonus` — a jump whose distance
  scales with run speed — and `boostUp/boostMax/boostDrain/boostRefill`, i.e. **flight with a fuel
  budget that refills on the ground.** That is a bird that must land, which is a better bird than
  one that can hover forever.
- **The camera settles, it does not follow.** A chase camera that tracks perfectly reads as a
  drone. It should lag, then catch up, then overshoot slightly and settle — the same spring
  language as everything else here.
- ⛔ **Nothing moves on its own at rest.** Per DESIGN-SYSTEM §4 and the wordmark rig: stand still
  and the world should be *still*, apart from wind and whatever the world itself is doing
  (a flag, a bus). An idle animation loop on every prop is the screensaver failure.

### What it SITS ON

The ground is **a place, not a plane.** The measured problem in the shelved city was that the
player stood on a water plane with the city floating in the distance — the level was scenery rather
than a floor. Every surface in this game is stood on, climbed, or perched on, so:

- collision is **dense, not coarse.** ⚠ `street.wld` has **57 collision boxes for 69,513
  triangles**; `lido.wld` has **170 boxes for 16,108**. For a game about climbing, that ratio *is*
  the game feel, and street.wld as it stands is not climbable.
- a ledge you can see is a ledge you can land on. If it reads as a surface it must be one.

### THE ACCEPTANCE MEASUREMENT

⚑ A brief without one produces "looks fine to me". These are the numbers that decide it:

1. **The place reads from the air.** Fly the bird to the highest perch and screenshot. If the city
   does not read as a *place* in one frame — recognisable park, recognisable block, somewhere you
   can point at and say "go there" — the layout is wrong, not the lighting.
2. **The still frame test.** Stand still for 5 s and diff two frames. Everything that changed must
   be nameable: wind, a bus, a shadow moving. Nothing else may move.
3. **Perch coverage.** Pick 20 surfaces at random that *look* landable from the air. At least 18
   must actually be landable. Below that the city is lying to the player, which for a game about
   noticing things is the cardinal sin.
4. **A photo is worth keeping.** Take 10 photos as a naive player would. If fewer than half are
   worth putting in a binder, the framing tools or the place are wrong.
5. Colour: judged by `getImageData`, **never** from a SwiftShader screenshot in this container —
   the recorded rule, and it has produced false conclusions here before.

---

## 3 · WHAT ALREADY EXISTS (measured 2026-08-03, not assumed)

| piece | state |
| --- | --- |
| `js/ronin-world.js` | **146 lines, works.** accel 78 · run 15 · sprint 30 · gravity 42 · `leapBonus` 0.42 (jump scales with run speed) · boost-flight with fuel that refills on the ground. **This is the bird's flight model, already written.** |
| `models/world/street.wld` | **69,513 tris · 82 × 80 × 120 m.** A city block with towers. ⚠ only 57 collision boxes — coarse. |
| `models/world/lido.wld` | 16,108 tris · 54 × 18 × 46 m · **170 boxes, 12 spawns.** Denser collision; the better starting shape. |
| level pipeline | `npm run level` → Blender → `.wld` + `.cols.json`. Works. |
| engine | **PlayCanvas, adopted.** Section 9's build is the working reference: shadow maps, clustered lights, SSAO, bloom, the CameraFrame stack, quality tiers. |
| pickups | portal drop + collection + `js/card-powers.js`, built 2026-08-02. Directly reusable as *found cards*. |
| bodies | `S9Skin` auto-skinning from `.skn`; `scripts/blender/build-cc0-chars.py` generates bodies procedurally, no third-party mesh committed. |

### ⚠ What does NOT exist, stated plainly

1. **The quadruped rig.** The 11-bone skeleton is a **biped** (chest/pelvis/arm/leg). Squirrel, cat
   and dog need a different skeleton and gait; a bird needs wings. **Biggest new piece.**
2. **Photo mode.** Small, but nothing is there.
3. **The place.** Park + neighbourhood is not built. `street.wld` was authored as a fighting
   backdrop, not somewhere to live in.
4. **The free-roam mode does not currently work.** Driven 2026-08-03 with `urm_freeroam=1` on
   street: world loads, body exists, **sprint carries 6.2 m then stalls, the leap never leaves the
   ground**, and the city renders as fragments in the distance while the player stands on the old
   water plane. It is a shell.

---

## 4 · ORDER OF WORK — proposed

Each step ends in something that can be **looked at**, because that is the only way this kind of
game gets judged.

1. **The bird flies, over the place that exists.** Port the free-roam body onto PlayCanvas using
   Section 9's app as the reference, fix the stall, and get a camera behind a bird over `lido`.
   *Ends in: a screenshot from the highest perch. Acceptance test 1.*
2. **The place.** Park + block, authored, with **dense** collision. This is the long pole and the
   one that decides whether the game is good.
   *Ends in: perch coverage ≥ 18/20. Acceptance test 3.*
3. **Found cards in the world.** Reuse the pickup system; cards sit in gutters, on sills, under
   benches. A bird *sees* them; reaching them is the other animals' job.
4. **Photo mode.** Frame, shoot, it lands in the binder as a card.
   *Ends in: acceptance test 4.*
5. **The quadruped rig**, then squirrel → cat → dog.

⚠ **1 and 2 can be worked in parallel and 2 is the long pole**, so do not let the flight model
block the place.

---

## 5 · OPEN — the artist's calls

- **The name.** NEON RONIN is dead. Candidates only, all his: **STRAYS** · **FOUND** ·
  **THE LOT** · **PERCH**. ⚠ Whatever it is, `npm run test:name` will pin it the moment it exists.
- **How a photographed card is marked** so it never passes as one of the artist's.
- Do the animals share one city, or does each get its own start?
- Is there anyone else in it — other players' animals, or is it solitary? (The lobby and presence
  layer already exist from the duel, so either is cheap.)
- Time of day: fixed golden hour, or does it move?

---

*NFA. Experimental art project — keep the disclaimers loud.*

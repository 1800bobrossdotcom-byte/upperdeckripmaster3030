# THE CITY — design brief

> ⚠ **A DRAFT FOR THE ARTIST. Proposals, not decisions.** Same status as `docs/DESIGN-SYSTEM.md`.
> Strike what is wrong. Nothing here is settled except the four decisions recorded at the top.

*Replaces NEON RONIN. Artist's call, 2026-08-03: "neon ronin honestly sucks as a game… how about a
game that has us as a squirrel and we just explore the city… very mellow game. large levels.
amazing graphics."*

---

## ✅ SETTLED (artist, 2026-08-03)

| | decision |
| --- | --- |
| **the name** | ✅ **THE CITY.** *"the city is what we can call it."* STRAYS / FOUND / THE LOT / PERCH are dead. Pinned by `npm run test:name`. |
| **the place** | a **park / green pocket** AND a **neighbourhood block**, adjoining — one continuous space. A third area later. |
| **scale** | ⛔ **MMORPG-ASPIRING.** *"that is too small of a world, maybe that is a place in it, but we are talking mmorpg size or aspiring to that size."* |
| **scope** | **REPLACES NEON RONIN.** `ronin.html` becomes this game; the duel lives on in git history. |
| **first animal** | **THE BIRD.** ✅ Squirrel built second. |
| **who you can be** | squirrel · dog · cat · bird |
| **modes** | ⛔ **THREE.** *"there are 3 modes, animal mode, dogfight mode, section 9 mode."* One world; the body, the camera and whether you can be hurt are what differ. |

## ⛔ SCALE — and the one decision the whole game rests on

**3.84 km × 3.84 km** — a 32 × 32 grid of 120 m chunks, streamed. `js/city-world.js`.

⚑ **THE CITY IS GENERATED, NOT AUTHORED, and every other choice follows from that.** A hand-built
3.8 km city is an asset budget this studio does not have and would take longer to make than the
game. A generated one is a few hundred lines. **What the artist authors is the LANGUAGE** — the
massing rules, the material vocabulary, the district mix — and hand-built `.wld` places drop in as
**LANDMARKS** inside it. `lido.wld` (54 × 46 m) is now exactly what the artist called it: *a place
in it*, occupying one chunk, with the generated city around it. Add a landmark by adding a row to
`CityWorld.LANDMARKS`.

⚑ **AND THE GENERATOR IS BUILT OUT OF ITS OWN COLLISION.** Every visible surface is a box that is
also a collider, because the geometry is *derived from* the collision set rather than the other way
round. **Acceptance test 3 — "18 of 20 surfaces that look landable must be landable" — is 1:1 by
construction and cannot drift, because there is no second representation to drift from.** That is
the direct answer to `street.wld`'s 57 boxes for 69,513 triangles.

What the world carries: a **river** (a continuous function of x, so adjacent chunks cannot disagree
— it gives the map an orientation readable in one frame from the air, and bridges to fly under),
**park**, **neighbourhood block**, and **plaza** as the sparse third area. Districts come from a
continuous noise field, so park and block *adjoin* everywhere it crosses the threshold — there are
no district walls, only a gradient, which is what the artist asked for.

⚠ **Streaming is two tiers and the second one is a DRAW-CALL decision, not a triangle one.** Near:
5 × 5 chunks at full detail — the only ones that collide, because they are the only ones you can
touch. Horizon: 4 × 4-chunk regions merged into one map each, so a kilometre of city costs a couple
of dozen draw calls instead of several hundred. **LOD 1 must emit the same masses as LOD 0** (the
generator draws every building's height and footprint before any detail so the random sequence
lines up) or a tower changes height as you fly toward it. That is a contract between tiers.

**What you do:** explore, and look for cards, items and power-ups. Take photos. That is the whole
loop. There is no fail state and nothing chases you.

⚑ **WHY BIRD FIRST, since it is not the hardest thing.** The quadruped rig is a *known* hard
problem — it will take the time it takes and no prototype changes that. Whether **the place is
worth looking at** is the *unknown* one, and a mellow game about noticing things lives or dies on
it. The bird is the fastest way to put the city in front of a camera and find out. It also reuses
`js/ronin-world.js`'s boost-flight, which is already written.

---

## ⛔ THE COMPRESSION — six cabinets become FOUR, and the city is where three of them go

*Artist, 2026-08-03: "the animals are invincible and more as observers… we can actually have
dogfight AND the section 9 game both play here and compress them all into the City. so play as a
jet fighter or an animal. then we compress our games to 4 games total."*

| | before | after |
| --- | --- | --- |
| 1 | SECTION 9 TASK FORCE | **THE CITY** — animal · jet · operative, one world |
| 2 | DOGFIGHT | RIP ROCKETER |
| 3 | CLOUD RACER | CLOUD RACER |
| 4 | RIP ROCKETER | THE ARENA (cards) |
| 5 | THE CITY | — |
| 6 | THE ARENA | — |

### ⚑ THE INVINCIBLE ANIMAL IS WHAT MAKES THIS WORK, and it is not a difficulty setting

A mellow game about noticing things and a tactical shooter cannot share a world **as peers**. They
can share one if the animal is a **witness**: it cannot be hurt, cannot be targeted, and cannot
shoot. Then a firefight two streets over is *weather* — something you fly over, watch, and
photograph. That is the ethos stated as a mechanic, in the artist's own frame: the anti-casino
position is that the prize is the having-done-it, and **a photograph of someone else's war is a
better card than a kill count.**

- **The animal cannot die. The jet and the operative can.** That single asymmetry is the whole
  difference between the three modes, and it means the mellow game keeps its promise — *nothing
  chases you* — inside a world that contains people shooting at each other.
- ⚠ It also has to be enforced, not merely true by omission. An animal must be **absent from the
  target list**, not just tough: a bot that aims at a squirrel and does no damage still ruins the
  tone, and "we forgot to add health to the bird" is not a design.

### ✅ WHAT ACTUALLY PORTS — measured, not assumed

⚑ **SECTION 9's MAP FORMAT *IS* THE CITY'S CHUNK FORMAT, and that is not luck** — it is why the
generator was built out of collision boxes. A Section 9 map is `MAP.solids`, a list of AABBs with a
kind; `CityWorld.genChunk` emits exactly that. So collision, raycast, AI line-of-sight, cover
baking and spawn validation all run on a city chunk unmodified. The renderer is already shared:
`city.html` draws through `S9PCWorld.buildFor`, which is Section 9's own world builder.

### ⛔ WHAT DOES NOT PORT, AND IT WOULD HAVE BITTEN SILENTLY

**DOGFIGHT IS NOT AUTHORED IN METRES.** Its world is `WS = 150` units wide with `ALT_MIN 0.35 /
ALT_MAX 9.0`, `STALL 2.9`, `VREF 7.2`, `VIEW_FAR 34`. The city is **3,840 m** across with buildings
up to 150 m. That is roughly a **25 : 1 scale mismatch**, and dropping the numbers in unchanged
gives a jet that crosses the entire city in about a second, or crawls, depending which way you read
it. Worse, it fails *plausibly* — the aircraft flies, it just flies wrong.

- ⚑ **The UNIT-FREE parts port exactly and are the valuable half**: the roll spring (`ROLL_K 81 /
  ROLL_D 11.6`, ω = 9.0 rad/s, ζ = 0.644 — re-derived and measured, per its own note) and the turn
  law `heading rate = TURN_G · sin(roll) · pull · auth / spd^0.6` are in radians and seconds. Those
  are the feel. **Speeds, altitudes and view distances are the only things that must be re-derived.**
- ⚠ **DOGFIGHT'S WORLD WRAPS (`wdel`); THE CITY HAS AN EDGE.** A toroidal world never needs a
  boundary, so nothing in that game has ever had to answer what happens at one. The city already
  has a soft edge that cancels the outward component of thrust (built for the bird, and driven: 60 s
  of full power at the corner ends at 1920.9 against a ±1920 wall). The jet inherits it.

### ORDER — and the one rule about retiring a cabinet

1. ✅ **Animal + jet in the city**, sharing the world, the streamer and the edge.
2. ✅ **All three modes traversable** — animal (bird ✅ · squirrel ✅ · cat/dog pending), dogfight,
   and section 9 on foot in first person. TAB cycles; the world does not reload.
3. Jet combat: bolts, lock, bots — DOGFIGHT's, re-derived at city scale.
4. ✅ **Operative combat: Section 9's weapons and bots, on a chunk's `solids`** — `js/city-ops.js`.
5. *Then* the two old cabinets retire.

⚠ **THE JET IS STILL TRAVERSAL, AND SAYING SO IS THE POINT.** Flying it is real; bolts, lock and
bots are not. A mode that half-exists and is described as finished is how *built ≠ reachable*
becomes *built ≠ true*.

### ✅ SECTION 9 ON THE GROUND — `js/city-ops.js` (artist, 2026-08-03)
*"you should be able to play as Section 9 on the ground in the city as well."*

**The numbers are Section 9's, character for character**, because they were tuned together: 150 HP
/ 60 armour, AK 17 · pistol 22 · buckshot 9 · rifle 88 ⇒ ~1.3 s TTK, headshot ×2.1 **and** armour
soaking only 15% of a headshot against 45% of a body hit, out-of-combat regen to 62% after 4.5 s,
tracers travelling at 340 m/s. At the old 0.63 s TTK cover, suppression and disengaging cannot
exist — nobody lives long enough to use them.
⚑ **And they cannot drift:** `npm run test:reach` parses **both** `city-ops.js` and `s9pc-game.js`
and asserts the tables are identical. Importing `S9Game.WEAPONS` at runtime would cost 104 KB of
maps, HUD and match clock to read one array, so the coupling is a test rather than a require —
the same arrangement that keeps `build-hero-type.mjs`'s Python RUNS and the CSS type scale
together. Verified to bite: two edited numbers → two failures.

**Measured end to end** (`ops.mjs`, headless): a magazine empties and tracers travel; four bots
spawn with real skinned bodies (`cc0-cel` · `cc0-grid` · `oni` · `kappa`), stand on the street and
walk 10–29 m; a COLD CALL headshot takes **157.1** off a bot — 88 × 2.1 less a 15% armour soak, to
the decimal — and the body drops a card into the binder; four operatives take a stationary player
from 150 to down in **11.2 s**, first hit landing at **5.2 s**.

⛔ **THE OBSERVER RULE IS A STRUCTURE, NOT A PROMISE.** `candidates()` is the only place a target
list is built and it reads `targetable` off the candidate; bot acquisition calls `hostilesFor()`,
which may only **narrow** that list. So an animal is absent *before* teams are even considered.
Driven: a squirrel sat on an operative's boots for fifteen seconds and drew **zero rounds**, health
never fell, and the bots went on thinking. *"We never gave the bird any health" is not a design.*

**Four defects found by driving it, all of which look like something else:**
- ⛔ **No teams meant the street cleared itself.** Four bots seeded 50 m apart killed each other in
  thirteen seconds — 8 spawned, 5 dead, zero alive by the time the player walked over. A deathmatch
  is what Section 9's *arena* is; a city you wander into is not, and "everyone was already dead
  when you got there" reads as an empty game rather than an atmosphere.
- ⛔ **Destroying a body destroyed the mesh every other body shares.** `S9PCSkin` memoises
  `BUILT[arch].mesh`, so `entity.destroy()` took the vertex buffer with it and the next operative
  of that archetype rendered from a dead one — *"Cannot read properties of null (reading
  'getFormat')"*, with nothing visibly wrong until a body stopped drawing. Bodies are **parked**
  now, never destroyed, which is also cheaper.
- ⛔ **The reticle and the bullet disagreed.** The first-person camera read `pitch` as a slope
  (`y + pitch * 10`) while the shot left along `sin(pitch)`. Identical at 0, 26.6° vs 28.6° at 0.5
  — the same defect class as the mirrored scene, and invisible until you shoot at something above
  you.
- ⛔ **Bots with no line of sight wandered off.** `lastSeen` only exists once somebody has been
  *seen*, so a hostile that had never had eyes on you had no reason to come: measured, they walked
  110 m in random directions while the player stood in the street. A `push` state fixed it. That is
  correct for a sentry and wrong for a squad sent to find you.

⚠ **The difficulty knob is AIM and nothing else** — cone widens with range, with how recently the
bot acquired you (~1.2 s settle), and with your own speed. Not dmg, not rate, not HP, not armour,
which is what keeps TTK arithmetically identical to the arena's.

⚠ **What the city has is Section 9's COMBAT, not Section 9's GAME.** No match clock, no arena
picker, no loadout, no card powers, no powerups. The cabinet link stays for that reason.

### ⚑ THE SQUIRREL OWNS THE VERTICAL — and that is why it is an animal, not a re-skin
The bird SEES the map and cannot get into it. The squirrel goes UP anything: hold forward against
any solid over 1.2 m and you climb it, crest it, and step onto the roof. **Every box in this city
is climbable by construction** — the same 1:1 guarantee the generator already makes about landing,
and it is only true because the geometry and the collision set are one thing.
Measured: lands on the street, runs **23.2 m**, climbs **3.94 m** up a wall.

### ✅ THE BIRD PLANTS AND THE SQUIRREL TAKES — the layers finally touch
*Artist, 2026-08-03: "have the birds poop out and place power ups and squirrels and carry power ups
and steal them haha"* — `js/city-drops.js`.

⛔ **THIS IS THE FIRST TIME THE ANIMAL LAYERS ACT ON EACH OTHER.** §1 says the animals are LAYERS
rather than skins, but until now that was a claim about what each one could *see*. A bird that
**plants** and a squirrel that **takes** makes it a claim about what each can *do to the other*,
which is the difference between a roster and a game.

⚑ **THE JOKE IS THE MECHANIC.** A drop comes out of the bird and **falls** — you cannot place it
precisely, you have to fly over the right spot and let go. The bird's advantage (seeing the whole
map) is spent as a real decision and its disadvantage (no fine control) is the cost. **Neither had
to be balanced; the physics did it.**

- A drop is **a card**, because in this studio it could not be anything else — the trading card is
  a SIZE before it is anything, so a flat rectangle is the *correct* primitive here rather than the
  lazy one. Four kinds: RIP · FOIL · LENS · ASH, identified by flat saturated colour, which in a
  posterised city IS the icon.
- The squirrel carries **exactly one** — a full mouth also slows you down.
- **Rival squirrels are the other end of the steal**, not decoration: they want the same cards, they
  are slower than you, and they carry one each. They are also the first thing in this city that is
  ALIVE, which answers the brief's open question ("is there anyone else in it?") in the mellow
  direction: yes, and they want your stuff, and that is the entire conflict.
- ⚠ **Steal range is deliberately LARGER than pick-up range.** Taking something off somebody should
  be the easy part once you have caught them — the hard part was catching them. The other way round
  makes the chase pointless.
- Measured in one run: 5 dropped, 5 landed (two on raised surfaces — they land where they land),
  **take 0 → 1**, **steal 0 → 1**.

### ⚠ THE OPERATIVE IS SECTION 9's CAPSULE, NOT A NEW ONE
r 0.42 · h 1.72 · step 0.62 — Section 9's own numbers, because its map format *is* the city's chunk
format and the body should match the thing the collision was written for. Measured: stands at
street level, walks **11.7 m**, jumps **0.89 m**, first-person, mortal and armed.

⚑ **AND A BULLET MUST MISS EXACTLY WHAT YOU COULD NOT WALK THROUGH.** The capsule the shot tests
against is the same one the collider uses, and `npm run test:reach` asserts all four numbers appear
in both `city-ops.js` and `city-app.js` — checked per number, because the two files declare them in
different shapes and a regex written against one file's *layout* passes there and fails on the
other for reasons that have nothing to do with the numbers agreeing. (It did exactly that on the
first run.)

⚑ **ONE COLLISION RESOLVE FOR EVERY BODY ON FOOT.** `moveBody()` was lifted out of `stepGround`
and handed to `city-ops`, so a bot walks this city by the rule the player does. `stepGround`'s own
comment already said why — *two copies drift, and the one that drifts is always the one nobody is
currently looking at* — and a bot sinking through a kerb the player steps over is that bug with an
audience.

⛔ **A CABINET IS NOT REMOVED UNTIL ITS REPLACEMENT WORKS.** The arcade shows four now, and THE
CITY's own mode bar links the two old pages until their modes are real — so nothing shipped becomes
unreachable in the meantime. `npm run test:reach` exists precisely because "built ≠ reachable", and
deleting the route to a working game to make a count look right is that same failure with the sign
flipped.

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
- **The bird itself**: a wingbeat is a discrete impulse with a refractory period, a glide trades
  height for distance, and a perch is a full stop with a settle.
  ⛔ **THERE IS NO FUEL. Artist, 2026-08-03: *"the bird needs to be able to just fly - no having to
  land to keep flying."*** This section previously argued for wing energy that only refills on the
  ground — "a bird that must land" — on the grounds that it makes a perch a decision. It also turns
  a mellow game about looking at things into a game about a meter, and in a city 3.84 km across it
  means running out over the middle of the river. **Overruled, and rightly.**
  ⚑ **What survives the removal is everything that made it feel like a bird rather than a drone**,
  because none of it was ever the fuel: the beat is still discrete (a held key gives beats at a
  wing's rate, not thrust), the glide is still free and still the default, and height and speed are
  still one currency. The meter was a constraint bolted onto a good model, not the model.
  ⚠ Measured after the change: sustained climb to the 210 m ceiling, and **245 m of glide for 22 m
  of height** — about 11 : 1 — where before it carried 15 m in 15 s and arrived almost vertically.
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
| `js/city-world.js` | ✅ **BUILT.** The generated world: 3.84 km, seeded, chunked, pure. River · park · block · plaza · landmarks. Geometry *is* the collision set. |
| `models/world/street.wld` | **69,513 tris · 82 × 80 × 120 m.** A city block with towers. ⚠ only 57 collision boxes — coarse. **Now a LANDMARK inside the generated city**, not the world. |
| `models/world/lido.wld` | 16,108 tris · 54 × 18 × 46 m · **170 boxes, 12 spawns.** ✅ **The first landmark**, and the artist's own "a place in it". |
| level pipeline | `npm run level` → Blender → `.wld` + `.cols.json`. Works. |
| engine | **PlayCanvas, adopted.** Section 9's build is the working reference: shadow maps, clustered lights, SSAO, bloom, the CameraFrame stack, quality tiers. |
| pickups | portal drop + collection + `js/card-powers.js`, built 2026-08-02. Directly reusable as *found cards*. |
| bodies | `S9Skin` auto-skinning from `.skn`; `scripts/blender/build-cc0-chars.py` generates bodies procedurally, no third-party mesh committed. |
| the bird | ✅ **BUILT** — generated geometry in `js/city-app.js`: lofted taper, swept **two-joint** wing (shoulder + lagging elbow), fanning tail, beak, countershading by vertex colour. Not primitives, because a capsule and two boxes *is* the default DESIGN-SYSTEM §1 exists to refuse. |

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

- **How a photographed card is marked** so it never passes as one of the artist's.
- Do the animals share one city, or does each get its own start?
- Is there anyone else in it — other players' animals, or is it solitary? (The lobby and presence
  layer already exist from the duel, so either is cheap.)
- Time of day: fixed golden hour, or does it move?

---

*NFA. Experimental art project — keep the disclaimers loud.*

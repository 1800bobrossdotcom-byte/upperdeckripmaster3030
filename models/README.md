# NEON RONIN — fighter models

Drop `<archetype>.glb` in this folder and it replaces that fighter's procedural body in the
3D renderer. Recognised names: `ronin`, `kappa`, `doomer`, `oni`, `kunoichi`, `prizm`.

Nothing here is required. If a file is missing (the normal case today) the game silently uses
the procedural fighter — so the arcade never breaks because a model is absent or still in progress.

## How the rig works — parts, not skinning

This is a **rigid-part rig**, the same approach the PS1-era 3D fighters used: a fighter is a set
of *static* part meshes, each attached to one joint of the skeleton the game already computes
every frame. There is deliberately **no skinned-mesh requirement** — you do not need to rig,
weight-paint, or export animation. All the movement (stances, the overhead cut, spins, dashes,
combos, ragdoll) comes from the existing IK skeleton and keeps working unchanged.

Practically: **name each object in your scene after the joint it belongs to**, then export the
whole thing as one `.glb`.

| Object name contains | Attaches to |
| --- | --- |
| `head`, `skull`, `face` | head |
| `chest`, `torso`, `jacket` | chest |
| `pelvis`, `hip`, `waist` | pelvis |
| `arm_f_upper` / `arm_f_lower` / `hand_f` | front arm (shoulder / elbow / hand) |
| `arm_b_upper` / `arm_b_lower` / `hand_b` | back arm |
| `leg_f` / `shin_f` / `foot_f` | front leg (hip / knee / foot) |
| `leg_b` / `shin_b` / `foot_b` | back leg |
| `sword`, `blade`, `katana`, `weapon` | sword hand |

A `.glb` containing a **single unnamed mesh** is treated as one whole-body part anchored at the
feet. It will render, but it will stand rigid — it can't articulate, because there's nothing to
attach to separate joints. Split the model into the parts above to get it moving.

## Dressing a loaded body

A loaded model draws only the mesh you gave it, so a bare base being would otherwise fight naked
and unarmed next to fully-costumed procedural fighters. `Ronin3D` now puts the archetype's
wardrobe on it: boots, belt, bracers, the silhouette piece (ronin straw hat, doomer cowl, oni
horns, kappa shell, kunoichi mask), the cloak/scarf, and the held weapon. Every piece is placed
from the **skeleton**, not the mesh, so one implementation fits any body.

The default is chosen from the model itself, and is overridable:

| model | dressed by default | why |
| --- | --- | --- |
| `.skn` (auto-skinned) | **yes** | a baked skin is one unified body — a bare mannequin |
| `.glb`/`.obj`, one part | **yes** | same: an undivided body with no costume of its own |
| `.glb`/`.obj`, many named parts | **no** | you split and named it, so you already dressed it |

```js
Ronin3D.registerModel('ronin', parsed, { dress: false });   // it came with its own armour
Ronin3D.registerSkin('ronin', verts, count, { dress: false });
```

The weapon is separate from `dress`: a fighter always gets one unless the model supplies a part
that attaches to the `sword` joint. NEON RONIN is a sword duel — an unarmed fighter reads as a
bug, not as a style.

## The .skn bodies are in Section 9 too

`js/section9-skin.js` loads the same `.skn` meshes for the deathmatch's bots, with its own FPS
poser (`S9Skin.pose`) and its own joint palette. Two things differ from NEON RONIN's path and
both are deliberate:

- **The palette is a full 3D rotation, not a planar one.** `Ronin3D.skinPalette` rotates each
  bone by `Rz` of its turn from bind, which is everything a side-on duel needs. An operative's
  legs swing along the *view* axis, which `Rz` cannot express at all, so `S9Skin.palette` uses
  the shortest-arc (Rodrigues) rotation from the bind direction to the live one. It reduces to
  the same matrix whenever the motion happens to be planar.
- **No `dressLoaded`.** The duel's wardrobe — straw hat, horns, turtle shell, katana — is the
  duel's. Section 9 hangs one thing off the skeleton instead: a rifle, for the same reason
  NEON RONIN always draws the sword.

Section 9 ships **three** of the six bodies (`oni`, `kappa`, `prizm` — 2.35 MB of the 7.39 MB
set), fetched only when a match starts and only as many as the match has bots. Why those three
is the next section.

## ⚑ The arm shard (task #77) is a PROPORTION mismatch — measured, not guessed

The auto-skinned bodies show a stretched shard around the arms. Two hypotheses were on the
table: flat sheet geometry far from any bone axis, or the palette fanning geometry at a
shoulder with no intermediate bone. **Neither is right.**

The decisive test is bind pose versus motion. In bind pose every bone matrix is identical, so
weights that sum to 1 must reproduce the mesh exactly — and they do, for all six, to the last
digit (worst per-triangle edge stretch **1.000×**). The shard is therefore *pose-time*, which
rules out the weights being malformed in themselves. Posed, the six split cleanly in two:

| | worst edge stretch | triangles > 3× |
| --- | --- | --- |
| `oni`, `kappa`, `prizm` (from `oni.obj`) | 2.1 – 2.9× | **0** |
| `ronin`, `doomer`, `kunoichi` (from `ronin.obj`) | 8.9 – 19.6× | 114 – 194 |

The cause is the bind skeleton in `bake-fighter.mjs` assuming realistic human proportions.
`oni.obj` ("Mom") is a true T-pose whose shoulder line sits at **0.79–0.83** of body height —
exactly where the bind table puts `armF0`/`armB0` (0.80). `ronin.obj` (TOON TROOPER) is a
big-headed toon: its head is 38% of its height and its shoulders are at **0.62**, so the bind
arm bones land *inside its skull*, its real arms sit down at the pelvis/chest boundary, and
17% of its vertices end up **~88% weighted to `chest`** with a few percent left on `armF1`.
Swing the arms and those two claims tear the geometry between them. Posed through Section 9's
rig the `ronin` family's bounding box runs x[−57, 116] for a 150-tall body; the `oni` family
stays inside x[−27, 29].

**The fix, if someone wants the ronin family back, is to fit the bind skeleton to the mesh
rather than to its bounding box** — find the shoulder line from the geometry instead of
assuming 0.80. Until then, do not ship `ronin.skn`, `doomer.skn` or `kunoichi.skn` in a game
that poses them.

### Cross-limb stitch

A smaller, separate defect survives even on the good family. `bake-fighter` keeps one limb's
bone from claiming the other limb's vertices with a side test, but the test has a tolerance
band around the centreline, and near the floor — where the feet almost touch — a handful of
triangles end up with corners bound **rigidly to opposite shins**. Under a running stride that
is a spike shooting between the ankles. `S9Skin` repairs it at load, per triangle (each corner
is individually fine; the combination is not): a minority corner adopts the majority corner's
bones and weights. It touches 113 of kappa's 4,604 triangles and 85 of prizm's 4,217, and takes
kappa's worst stretch from 21.2× to 6.0× and prizm's from 9.0× to 6.7×.

⚠ **This path is gated off in NEON RONIN's own lobby only by the device budget.** `js/ronin.js`
loads `.skn`/`.glb` fighters when `FIGHTERS_OK` (`DEVICE_OK`) is true.

The model is **auto-scaled** so its total height matches the fighter (~150 skeleton units), so
you can author at any scale. Y-up, facing +X.

## FBX and Mixamo

FBX is not read by the game at runtime, but `scripts/fbx2glb.mjs` converts it here, with no
dependency and no Blender round-trip:

```bash
npm run fbx -- character.fbx --list              # what's inside: parts, tri counts, sizes
npm run fbx -- character.fbx models/ronin.glb    # → GLB for the renderer
npm run fbx -- character.fbx build/ronin.obj     # → OBJ, if you want to edit it first
```

It reads binary FBX (6.x and 7.x) and ASCII FBX, and brings across geometry, per-object names,
the full transform chain (pivots, pre/post-rotation, geometric offsets) and a Z-up → Y-up
correction. Verified against the artist's five Mixamo exports plus 43 tests (`npm run test:fbx`).

⚑ **It reads files Blender cannot.** Blender refuses FBX 6100 outright — *"Version 6100
unsupported, must be 7100 or later"* — and four of those five Mixamo characters are 6100. If
Blender rejects an FBX, try this first rather than assuming the file is broken.

**Download from Mixamo in T-pose with no animation.** Skin weights, bones and animation clips
are deliberately dropped: the game builds its own 11-bone rig (`bake-fighter.mjs --skin`) and
every pose comes from ronin.js's IK, so an imported rig would fight it rather than help. The
mesh is the part worth having.

A Mixamo character usually arrives as one mesh (or as material-grouped objects whose names do
*not* describe what they contain — one of the five has the whole armoured body inside an object
called `…_Sword`). Names like that will attach to the wrong joint, so segment instead:

```bash
npm run bake:fighter -- models/ronin.glb models/ronin.obj --segment --skin models/ronin.skn
```

`bake-fighter` takes `.glb` as well as `.obj`, decimates, splits a unified body into
joint-named anatomy, and writes the skinned `.skn`.

### Licensing Mixamo assets — check before committing

Adobe's Mixamo terms permit use in projects but restrict redistributing the assets themselves,
and these models ship inside a publicly-minted art token. Two very different cases:

- **You uploaded your own character to Mixamo for auto-rigging** — clean. The mesh is yours;
  Mixamo only rigged it. Record it in the table below and go.
- **You downloaded one of Adobe's stock characters** — verify Adobe's current terms first. Do
  not commit it on the assumption that it's fine.

## Authoring → GLB

Any DCC works (Blender, Maya, ZBrush, Nomad…). Export `.glb` directly if you can.

If your tool only emits static formats (STL / PLY / OBJ / WRL / X3D), convert with
[`dave3d/meshconvert`](https://github.com/dave3d/meshconvert) (Python, Apache-2.0):

```bash
pip install trimesh pymeshlab
python mesh2glb.py fighter_parts.obj ronin.glb
```

Note that converter **drops scene hierarchy and animation** — which is fine here, because this
rig only needs static geometry, but it means you should export one file *per fighter* with the
part objects intact, and check the part names survived the round-trip.

## Generative iterations (RoninMorph)

`js/ronin-morph.js` can distort any loaded part into a **new seeded iteration** — melt, twist,
shatter, voxel, glitch, inflate, ripple, taper, stretch, spike. Same seed always gives the same
result, so a seed is a stable identity and **a card slug can key its own permanent variant** of a
shared body. Pass it at registration:

```js
Ronin3D.registerModel('ronin', parsed, { morph: 'cosmic-yawn' });   // slug → deterministic stack
Ronin3D.registerModel('ronin', parsed, { morph: { seed: 7, ops: [{op:'twist',amt:.6},{op:'melt',amt:.4}] } });
```

Note this does **not** change the licensing position below: a distorted copyrighted character is
a derivative work and is still that character's. Run it on geometry you own.

### Baking iterations offline

`scripts/morph-mesh.mjs` runs the same morph over an OBJ and writes new OBJs, so you can sweep
seeds, keep the ones you like, and drop the keepers in here as fighters. Part structure is
preserved, so a morphed file still attaches by part name. Stage props (floor/plane/…) are
dropped unless you pass `--keep-props`.

```bash
node scripts/morph-mesh.mjs TROOPER.obj out --seeds ripmaster,cosmic-yawn,blue-boar
node scripts/morph-mesh.mjs Mom.obj out --ops sag,bulge,static --amt 0.85
```

Same seed always regenerates the same creature, so a kept iteration is reproducible from its
name alone — no need to archive the output if you keep the source + seed.

## Requirements & limits

- glTF 2.0 binary (`.glb`) with the geometry in the embedded `BIN` chunk. External `.bin`
  sidecars are not supported.
- Triangles only (`mode 4`). `POSITION` required; `NORMAL` used if present, otherwise flat face
  normals are generated.
- Skins and animations in the file are **ignored** (bind-pose geometry is used).
- Materials/textures are not read yet — parts are shaded with the fighter's costume palette and
  the procedural material system. PBR texture support is a possible later pass.
- Keep files lean; these load over the wire on every visit. A few thousand triangles per fighter
  is plenty for this art direction.

## Licensing — read before adding anything

These models ship inside a publicly-minted art token tied to the artist's SuperRare identity.
**Only add geometry that is the artist's own work, or that carries a licence clearly permitting
commercial and NFT use.** Do not commit third-party assets without recording the source and
licence here. When you add a model, note it below.

| File | Source | Licence |
| --- | --- | --- |
| `world/street.wld` (+ `.cols.json`) | "street" / `chinese build` scene OBJ, supplied by the artist | Cleared for use by the artist, 2026-07-25 |
| `ronin.obj` (TOON TROOPER) | supplied by the artist | Cleared for use by the artist, 2026-07-25 |
| `oni.obj` (Mom) | supplied by the artist | Cleared for use by the artist, 2026-07-25 |
| `ronin.skn`, `doomer.skn`, `kunoichi.skn` | derived from `ronin.obj` (see below) | inherits that clearance |
| `oni.skn`, `kappa.skn`, `prizm.skn` | derived from `oni.obj` (see below) | inherits that clearance |

## Remodelling — one body, several fighters

`bake-fighter --ops <a,b,c> --amt <n>` distorts the mesh **before** segmenting and skinning, so
the anatomy split and the bone weights both describe the shape that ships. (Morphing afterwards
would weight a body that no longer exists and the elbows would bend around the wrong places.)
The seed is the identity, so a variant is reproducible from its command alone.

All six archetypes are currently derived from the two cleared sources:

| archetype | source | ops | size |
| --- | --- | --- | --- |
| `ronin` | `ronin.obj` | — (the original) | 2.5 MB |
| `doomer` | `ronin.obj` | `taper,stretch,sag` @0.55 | 1.1 MB |
| `kunoichi` | `ronin.obj` | `taper,twist` @0.45 | 1.4 MB |
| `oni` | `oni.obj` | — (the original) | 0.9 MB |
| `kappa` | `oni.obj` | `inflate,bulge,sag` @0.60 | 0.7 MB |
| `prizm` | `oni.obj` | `shatter,spike,kaleido` @0.50 | 0.7 MB |

⚑ **Use `--detail <pct>`, not `--grid`.** Detail sets the decimation cell as a percentage of the
model's own height, so one number means the same fidelity on any source. An absolute grid cannot:
`ronin.obj` stands 9.83 units tall and `oni.obj` 2.24, so a single `--grid 0.3` is a sane 3% on
one and a silhouette-destroying 13% on the other — it collapsed a 13k-triangle body to 1,065
vertices before this was fixed.

⚠ **Distortion changes the shape, not the ownership.** A morphed copyrighted model is still a
derivative work — remodelling is an art tool here, not a rights tool. Every entry above inherits
a clearance that already existed; anything new needs its own row before it is committed.

Baked scenes live in `world/`. Source art is not committed — only the baked
`.wld` (binary pos3+norm3) and its `.cols.json` AABB set. Re-bake with
`scripts/bake-world.mjs`.

## Levels — authored in Blender, in code

`npm run level -- arcade|vault|rooftop|all` builds a level and bakes it into `models/world/`.
Two stages, both pre-existing: `scripts/blender/build-level.py` authors the geometry and writes
OBJ; `scripts/bake-world.mjs` decimates it, rescales to world units and emits the binary `.wld`
plus the `.cols.json` AABB set the collider uses.

| level | what it is | objects · tris · size |
| --- | --- | --- |
| `arcade` | sunken duel pit ringed by cabinet banks, two mezzanines, a bridge across | 351 · 10.7k · 751 KB |
| `vault` | auction hall — plinths under glass, balcony ring, oversized vault door | 326 · 6.6k · 466 KB |
| `rooftop` | water tower, billboard, catwalk to an annex, a skyline you can land on | 145 · 2.9k · 204 KB |

Levels are built **in code, not sculpted**, and that is deliberate: every triangle is generated
by a script in this repo, so it cannot become a rights problem inside a minted token; a level is
its script plus a seed, so a variant costs a number rather than a re-export; and we choose the
tri budget instead of discovering it.

Select one at runtime with `localStorage urm_level` (an unknown name falls back to `street`).

**Section 9 loads all three as arenas**, appended to its ARENA chip row after the six hand-built
maps (`js/section9-world.js`). The adapter maps `.cols.json` boxes onto `MAP.solids` — so the
collision the game runs is the same AABB set `npm run level` validated — and hands the `.wld`
triangles to the GL renderer to draw. `street.wld` is deliberately NOT offered: it carries no
authored spawns and its vertex buffer contains NaNs, so it is a scene, not an arena.

⚑ **A baked object's NAME is all the material information there is.** A `.wld` has no UVs, no
materials and no vertex colour, so both renderers guess: GL splits triangles by face normal
(up-facing → floor texture, else wall) and Section 9's 2D fallback colours each box by a kind
inferred from its name (`*_step` → stair, `para|rail|sill` → cover, and so on). Name level
objects for what they ARE and they will look right for free.

⚑ **Bake authored levels with `--minTris 0`** — bake-world's default drops objects under 40
triangles as clutter, which is right for a scanned city and catastrophic here: a crate is 12
triangles and a railing post is 8.

### Spawns are authored and validated, not rescued

`kit.spawn()` drops a marker named `spawn_*`; `bake-world` lifts those out of the geometry (they
never become triangles or collision) and records the transformed point, so a spawn rides the
same recentre/rescale as the level and cannot drift off its floor. `RoninWorld.pickSpawn()`
prefers them, farthest-first so two fighters don't start on top of each other, and falls back to
the old spiral search for levels that carry none.

`npm run level` then **validates every spawn against the baked collision set** and reports
`INSIDE` (embedded in geometry) or `FLOATING` (nothing to stand on). It caught 7 bad spawns on
the first run; all three levels are clean now — arcade 6/6, vault 8/8, rooftop 7/7.

⚠ **Collision boxes are AXIS-ALIGNED, so rotated geometry gets a fat AABB.** A 9 m wall segment
turned 45° swells about 3.5 m inward, which is why the vault's clear standing band is far
tighter than its walls suggest, and why the balcony had to be widened from 4.6 m to 7 m to hold
a player at all. Reason about clearance from the **baked** `.cols.json`, not from the Blender
coordinates — the bake also recentres on the geometry's bounds, so an asymmetric feature like
the vault's door bay shifts everything.

---

## `.skn` v2 — the paired fix for task #77, ready to execute

Everything below was established by reading the code, not by guessing, so the next pass is
execution rather than rediscovery.

**Why v1 cannot be fixed from the baker alone.** `js/section9-skin.js` hard-codes the bind
skeleton (`const BIND`, px space, `H = 150`, arm bones at y 120 = the canonical 0.80 of height).
Fitting the baker's skeleton to a mesh's real shoulder line therefore produces weights measured
against one skeleton and posed by another — a worse mismatch than the one it cures. **The
skeleton has to travel with the mesh.**

### Format
Header is 32 bytes and only 20 are used: magic `UR3SKIN0` (0), version (8), vertex count (12),
bone count (16). Bump version to **2** and insert a bone block between header and vertex data:

```
0   ..31    header (version = 2)
32  ..295   11 bones x 6 float32 = [startXYZ, endXYZ], 264 bytes, in the RENDERER's px space
296 ..      vertex data, unchanged: 14 floats/vertex, stride 56
```

⚑ **Conversion is exactly ×150.** The baker's table is normalised body space (y 0 feet → 1
crown); the renderer's is px at `H = 150`. Canonical `armF0` start `[0.10, 0.80, 0]` is the
renderer's `[15, 120, 0]`. So write `norm * 150` and no other transform is needed.

### Reader — `js/section9-skin.js`
- Parse at line ~120: `getUint32(8)` is the version. v2 ⇒ read 66 floats at offset 32, vertex
  data starts at **296** not 32 (`new Float32Array(buf, 296, n * 14)`); v1 ⇒ unchanged.
- Attach `sk.bind` (11 × [start, end]) and `sk.bdir` (unit directions, same derivation as the
  existing `BDIR`) to the loaded skin object.
- `palette(P, sk, out)` **already takes `sk`** — change its two reads to `const BINDT = sk.bind
  || BIND, BDIRT = sk.bdir || BDIR;` and index those. That is the whole renderer change.

### Baker — `scripts/bake-fighter.mjs`
- Re-apply the anatomy fit (measured and verified 2026-07-31, reverted only because the reader
  was not ready): 48 y-bands; **shoulder = the widest band above mid-body** (in a T-pose the body
  is widest where the arms are); **crotch = the lowest band whose centre line is occupied**;
  everything else proportional between floor, crotch, shoulder and crown; radii scale with the
  limbs they serve. Falls back to canonical when there is no lateral peak (not a T-pose).
  Keep `--bind canonical` as the A/B escape hatch.
- Measured on `ronin.obj`: shoulder **y = 0.531** vs the canonical 0.80, rigid-snapped vertices
  **0.0%**.
- Write version 2 + the bone block.

### Then
Re-bake all six, widen `S9Skin.CAST` from three to six, and re-measure posed edge-stretch — the
number to beat is the good family's **2.1–2.9× worst, zero triangles over 3×**. `js/s9pc-skin.js`
consumes `S9Skin.pose`/`palette` and needs no change if `palette` keeps its signature.

⚠ There is no stretch-measuring tool in the repo — the historical numbers were ad-hoc. Write one
alongside this, or the result cannot be checked.


### Update — v2 plumbing landed, the bake did NOT

`scripts/skin-stretch.mjs` (`npm run stretch`) now exists, and the first thing it did was
disagree with this file.

**What it confirmed.** The anatomy fit measures correctly: `oni.obj` reads shoulder **y = 0.802**,
which is the canonical 0.80 to two decimals and exactly matches the "true T-pose, 0.79–0.83"
description above. `ronin.obj` reads **0.531** — clearly non-human, same direction as the 0.62
recorded here. The measurement is sound.

**What it did not confirm.** Re-baking oni and ronin changed their triangle counts (5,804 →
12,966 and 15,705 → 34,250), so the shipped `.skn` files were baked with decimation settings
that are **not recorded anywhere and were not reproduced**. Every before/after comparison across
that boundary is meaningless, and the re-bakes were reverted rather than kept. ⚑ **Find and write
down the exact bake command before touching the assets again** — that is now the first blocker,
ahead of the skeleton work.

⚠ **And the harness is not yet the game's poser.** It hinges each bone independently about its own
bind start; `S9Skin.palette` uses a hierarchy and a shortest-arc rotation. On the shipped v1 files
it ranks oni 3.8× · prizm 6.1× · kunoichi 14.6× · kappa 23.7× · doomer 52.2× · ronin 56.6× — which
puts **kappa with the bad family**, against everything else recorded here. So it is a usable
STRESS test and a usable A/B on one file, and it is **not** a source of truth about which bodies
ship. Point it at `S9Skin.pose`/`palette` directly before trusting the ranking.

Bind pose reads exactly 1.000× on all six, so the harness's own arithmetic is sound — that check
runs on every invocation and fails loudly.

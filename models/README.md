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

⚠ **This path is currently gated off.** `js/ronin.js` loads `.skn`/`.glb` fighters only when
`HEAVY_OK` is true, and `HEAVY_OK` requires the **shelved** free-roam world flag
(`localStorage urm_world='1'`) *and* a non-mobile device budget. So models in this folder do not
appear in the shipping duel today. Opt in with that flag to develop against them.

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

⚑ **Bake authored levels with `--minTris 0`** — bake-world's default drops objects under 40
triangles as clutter, which is right for a scanned city and catastrophic here: a crate is 12
triangles and a railing post is 8.

⚠ **Spawn placement is not done.** Loading a `.wld` flips the duel into free-roam world mode,
and the spawn points are not yet authored per level, so the camera can start inside geometry.
The levels themselves bake and render correctly; placing spawns on open floor (the way
`fixSpawns()` does for Section 9, and per that map's lesson — author them, don't rescue them)
is the next step before these are playable.

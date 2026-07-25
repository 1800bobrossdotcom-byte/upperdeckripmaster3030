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

The model is **auto-scaled** so its total height matches the fighter (~150 skeleton units), so
you can author at any scale. Y-up, facing +X.

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

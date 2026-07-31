# models/weapons

Weapon geometry for Section 9, converted with this repo's own tooling.

| file | tris | source | converted by |
| --- | --- | --- | --- |
| `m4a1.glb` | 1,642 | `M4a1.fbx` (Blender-authored, shipped with .3ds/.obj/.blend siblings) | `npm run fbx` |
| `m4a1_tex.jpg` | — | the M4A1's base-colour map, kept beside the mesh | — |
| `sniper_stand.glb` | 268 | `Sniper_Stand.obj`, from a KSR28 rifle .blend (Blender 2.82) | `scripts/fbx2glb.mjs`'s `toGLB()` |

## Licence

**The artist supplied both archives and cleared them for use in the game.** That clearance is
the standing rule in `models/README.md` being satisfied by the person who can satisfy it —
nothing here is scraped, and nothing here is a recognisable branded character. If a weapon's
provenance is ever questioned, the answer is the artist's, not a guess made here.

⚠ The same rule still binds anything added later: only geometry the artist owns or that is
clearly licensed for commercial/NFT use. A distortion pass does not launder a licence.

## Notes for wiring these up

- `m4a1.glb` arrives as ONE unnamed part (`Cylinder`), so the rigid-part rig has nothing to
  attach — it stands rigid, which is exactly right for a weapon held in a fixed grip. It does
  NOT need `bake-fighter --segment`; that advice in the converter's output is aimed at bodies.
- Both are authored Z-up in Blender and come through the converter's Y-up conversion, same as
  every other model here — so they load through `js/ronin-glb.js` with no axis fixing.
- Scale is the source's own. Normalise against measured bounds at load rather than trusting it,
  the way `js/dogfight-gl.js` fits its craft; a viewmodel and a world pickup want different
  sizes from the same mesh anyway.
- `m4a1_tex.jpg` is a plain base-colour map. Neither the Section 9 skinning program nor
  `ronin-glb.js` reads UVs today, so using it means adding a UV path — until then the renderer's
  procedural materials are what shade these.

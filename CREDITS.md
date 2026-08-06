# Credits — upperdeckripmaster3030

## Art

- **DarkFarms** — trading-card art displayed as arena wall-art ("posters") in the
  Section 9 Taskforce Supergame cabinet.
  In the shipping game (`section9.html` / `js/section9-gl.js`). The PlayCanvas build
  (`section9-engine.html`) does not hang the posters yet — a gap to close when it takes over.
  Released **CC0** (public-domain dedication) — basis: **the artist's own attestation.**
  Our artist knows DarkFarms personally and confirmed the CC0 status directly.
  ⚑ This is a *private* basis, not a published one, and the correction matters: this entry
  previously cited **https://darkfarms.wtf** as the source of the CC0 status, but that site
  publishes no licence statement of any kind (fetched and checked in full), and the SMOWL
  contract exposes no licence field on-chain. The conclusion stands; the citation did not.
  Worth obtaining in writing at some point, since a repo outlives a conversation.
  Site: **https://darkfarms.wtf** · see `docs/CC0-SOURCES.md` for the full dossier.
  The images are displayed live from DarkFarms' own permanent **Arweave** storage —
  they are **not** copied into this repository. In-game credit is shown in the
  arena's control bar. Attribution is a courtesy (CC0 requires none); we credit
  anyway, and only credit DarkFarms for their genuine work.

## 3D assets

- **Magnum 460** — `models/weapons/magnum460.glb`, a revolver model.
  Released **CC0 1.0** by **TheGoodFella**, stated in the repository's own `LICENSE.txt`
  (fetched and read, not inferred from the repo page):
  <https://github.com/TheGoodFella/magnum460Blend>. CC0 waives copyright worldwide and
  permits commercial use with no attribution required — we credit anyway.
  Converted from the source `.fbx` by our own `scripts/fbx2glb.mjs`, dropping the
  scene's backdrop `Plane` (`--drop Plane`). 2,120 triangles, 66 KB.

See `docs/BLENDER-PIPELINE.md` for the wider survey of Blender and texturing tooling,
including which of it can and cannot be used here.

## Music

- **BASIX — "GO-TEAM!"** is the site's music.
  Set: **https://soundcloud.com/basix265/sets/go-team** · artist: **https://soundcloud.com/basix265**
  ⛔ **The audio is NOT in this repository and is not re-hosted anywhere by us.** `theme.js`
  drives SoundCloud's own embedded player (`w.soundcloud.com`) through their public Widget
  API, so every play is served by SoundCloud, counts for the artist, and runs under
  SoundCloud's terms. Copying the files in would be smaller, faster and seamless across
  page loads — and would be taking the record instead of playing it.
  ⚠ **Permission is the artist's to hold, not the code's.** Embedding a public SoundCloud set
  is what the widget is published for, but if BASIX ever asks for it to come down, the whole
  removal is deleting `theme.js`'s script tags — no asset to purge, because there is no asset.
  ⚑ Replaces the previous site song ("smilingman", by lovebeing & sean), removed at the
  artist's request along with its `smilingman.mp3`.

## Everything else

- Original art, card designs, code, contracts, and the $3030 experience by
  **Gianni Arone — lovebeing** (@_lovebeing_), SuperRare Liquid Editions, Cohort 01.

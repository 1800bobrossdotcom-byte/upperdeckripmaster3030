# The site background — Blender foil card stock, lit live

`scripts/blender/build-bg.py` → `media/bg/foil-{albedo,normal}.webp` → `js/bg-foil.js`
Rebuild + verify: **`npm run bg`**.

**What it is:** embossed foil card stock — pressed cell relief, paper fibre, holographic tint —
authored as a procedural Blender material, baked to a seamlessly tiling albedo + tangent normal
map, and lit in the browser by three coloured lights from the site palette, one of them slowly
orbiting. The trading card is this studio's whole form, so the backdrop is the *material a card is
made of*, seen too close to read as a card.

---

## ⚑ Why it is a baked material and not a rendered video

The first version rendered an animation: a cylinder of stock turning 360°, which loops *exactly*
because the geometry returns to its start. It was measured and abandoned.

| | measured |
| --- | --- |
| EEVEE, headless | **cannot run at all** — no `libEGL.so.1` in this container |
| Cycles CPU, 4 cores, 640×360, 32 spp | **133 s for ONE frame** |
| ⇒ a 160-frame 720p loop | **~35 hours** |

Dropping the resolution far enough to afford it produces a soft, blurry plate — a bad trade for
something whose entire job is to look *textured*. This build also has no OpenImageDenoise, so the
low-sample escape hatch isn't there either.

But the baked route wins even given free render time, which is why it isn't recorded as a
consolation:

- **~600 KB, not megabytes** — this loads on *every page*.
- **It never repeats.** A video loop has one period the eye eventually learns. Here the light's
  orbit (74 s) and the drift are different periods, so the surface never returns to a prior state.
- **The relief, the foil and the colour are still entirely Blender's.** Only the lighting moved
  into the browser — and lighting is what makes an emboss read as an emboss.

## ⚑ Seamless is done properly, via a 4-D torus

Blender's noise is not periodic, so a plain UV lookup cannot tile: the left edge has no reason to
match the right. The fix is to sample the noise on the surface of a **torus embedded in 4-D** —
map `u,v → (cos 2πu, sin 2πu, cos 2πv, sin 2πv)` and read 4-D noise there. Walking `u` from 0 to 1
walks a full circle and arrives exactly where it started, in every octave, so the tile is periodic
**by construction**.

Rejected alternatives, and why: **mirroring** puts a visible axis of symmetry across the page;
**edge-blending** puts a soft cross through the one part of the image that has to look like
material. `npm run bg` measures it — the wrap step must cost about what an interior one-pixel step
costs. It does (albedo 0.34 vs 0.44).

⚠ The bake margin must stay **0**. A margin bleeds pixels *across* the tile edge and would undo
exactly the property above.

## ⚑ Legibility is measured on the LIT composite, not on the albedo

This is a mistake the build already made once. The bake was tuned to a mean luma of 33 and called
legible — then three coloured lights and a specular put the composite's p99 at 80 with a lot of
high-frequency structure, and the small dim print on `tokenomics.html` visibly fought it.

**Text sits on the lit plate, so the lit plate is what gets a threshold.**
`scripts/check-bg-composite.mjs` shoots the plate in isolation (every other layer hidden) and holds
it to a band; `npm run bg` runs it and fails the build.

| | measured | bound |
| --- | --- | --- |
| composite mean | 20.7 | < 26 |
| composite p99 | 47.9 | < 58 |
| composite sd | 9.0 | < 11, > 2 |

⚠ **sd is bounded on purpose.** Contrast under small type is a *spatial* property — a mean will
happily pass a background you cannot read on. The overall gain (`STRENGTH = 0.62` in
`js/bg-foil.js`) was swept against these numbers, not chosen by eye.

⚠ Judge **luma and structure** here, never hue: this container's screenshot path rotates hue on
canvas content (CLAUDE.md). Luminance and spatial variance survive that; colour does not.

## ⚑ The layer is additive — z-index −4, under everything that was already there

`#rain` (−3), `.lm` (−2) and `.crt` (−1) are untouched. If the fetch 404s, WebGL is missing, the
context is lost, or `js/bg-foil.js` never loads, **the site renders exactly as it did before this
existed.** That is why it is a separate layer rather than a rewrite of the page background.

Degradation, in order: WebGL → CSS-tiled albedo (`#bgFoil`, still textured, deliberately *not*
animated — a full-page `background-position` animation repaints the whole viewport every frame on
exactly the machines that just failed to give us a GL context) → nothing at all.

## ⚠ An opaque `body` background HIDES it — this is the trap

A negative-z fixed layer paints in **step 2** of the root stacking context; an in-flow block's own
background paints in **step 3**, i.e. *after* it. So `body{background:var(--void)}` does not sit
behind the plate, it covers it — and the page looks unchanged while still downloading 500 KB.

`index.html` has carried this note since the rain layer was added ("page color lives on html —
body stays transparent"). The generated shell in `scripts/build-pages.mjs` did **not**, which is
exactly how the plate came out invisible on tokenomics/audit/whitepaper while working fine on the
landing page. The shell now puts the colour on `html` and keeps `body` transparent, with the
radial tints moved onto the transparent layer so they sit *over* the foil.

**Any new page that wants the background must keep `body` transparent.**

## Where it is wired

`index.html` · `cards/index.html` · `cards/binder.html` · `cards/market.html` · and the four
generated pages via the `build-pages.mjs` shell (whitepaper / tokenomics / audit / artist).

⛔ **NOT `superrare.html`** — that is the wallet-free embed, and `npm run test:embed` fails if any
`<script src>` reappears in it. Correct: an embedded frame should carry no scripts at all.

The games are not wired either; they have their own 3D scenes and a decorative fullscreen pass
under them would be pure cost.

## Costs and knobs

- **500 KB total** (albedo 23 KB + normal 477 KB, WebP q82). ⚠ WebP, not PNG: a normal map is
  high-frequency by nature and PNG cannot compress it — the same map is **2.8 MB** as a PNG.
- Renders at **~30 fps** (a background this slow does not need 60) and **pauses entirely when the
  tab is hidden**.
- Backing-store resolution goes through **`GfxPost.dprCap()`** — the one definition of "weak
  device" the games already agreed on — rather than a second one that could drift from it.
- **`prefers-reduced-motion`** and **save-data**: still lit, just frozen. The relief is the point;
  the motion is the garnish. Verified: Δ over 5 s is 6.9 normally and **0.00** under reduced
  motion.

Tuning lives in two places — the material (`scripts/blender/build-bg.py`: cell scale, fibre, bump
distance, albedo ramps) and the lighting (`js/bg-foil.js`: `TILE_PX`, `STRENGTH`, `DRIFT`,
`ORBIT`, light colours/gains). Change either, then run `npm run bg` and read the numbers.

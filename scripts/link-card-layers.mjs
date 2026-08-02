/* Make the generated card layers REACHABLE.   npm run cardlayers
 *
 * ⛔ THE DEFECT THIS FIXES: three cards already have full, generated layer stacks —
 *      models/cards/44          4 layers  (background · midground · subject · text)
 *      models/cards/45-strata   7 layers  (background · 5 strata · text)
 *      models/cards/47          7 layers  (background · 3 midground · subject · frame · text)
 *    complete with inpainted backplates and per-layer rects — and NOTHING IN THE SITE READS THEM.
 *    `grep -rl "models/cards"` over every .js and .html returns nothing. They were generated and
 *    orphaned, which is why "where are the layered and 3d z space cards?" has the answer "built,
 *    invisible".
 *
 * ⚑ TWO separate mismatches, and either alone would have been enough:
 *
 *    1 LOCATION. `CardLayers.sidecarUrl()` swaps the art's extension —
 *      `cards/art/hero/45.webp` -> `cards/art/hero/45.layers.json`. The generated file is at
 *      `models/cards/45-strata/layers.json`. The reader was never going to look there.
 *    2 SCHEMA. png23d emits `{generator, card, source, size:{w,h}, layers:[{file,name,kind,rect}]}`.
 *      The reader wants `{v, size:[w,h], layers:[{id, src, z, blend, fit}]}`. Different shape,
 *      different key names, different `size` type.
 *
 * So this writes the sidecar the reader is actually looking for, next to the art, with `src`
 * pointing back at the PNGs where they already live. Nothing is copied and nothing is
 * regenerated — the generator's output stays the source of truth.
 *
 * ⚠ It does NOT invent layers. `CardLayers`'s own header is emphatic that flat art must not be
 *   segmented on luminance to fake depth, and that resolving to null is the NORMAL case. This
 *   only exposes stacks that a generator already produced from real separations; a card with no
 *   `models/cards/<slug>/layers.json` gets no sidecar and stays flat.
 *
 * ══ WHICH CARDS GET A STACK — the gate, and the cards that FAILED it ════════════════════════
 *
 * ⛔ THE ANSWER IS NOT "run png23d over the deck". It ran over all 15 hero cards and produced a
 *    layers.json for every one of them; **6 were kept**. The other 9 produced stacks that load,
 *    parse and render — and are fakes. This is the list so nobody re-derives it by shipping them.
 *
 * A card qualifies only if ALL of these hold, and then only after LOOKING at
 * `preview/_exploded.png`, because the numbers pass on cards the eye rejects:
 *
 *   1 THE PEEL FOUND SOMETHING. `keyPeel` must accept ≥ 1 band. With zero bands png23d falls
 *     through to k-means over the WHOLE card — which is precisely "split flat art on a colour
 *     key", the forbidden move. Its signature is in the log: every cluster's `borderShare`
 *     lands in the same 0.2–0.5 range, i.e. every "layer" touches the border equally, i.e.
 *     there is no background. Cards 34, 38, 41, 43, 45, 48 all key nothing.
 *   2 THE FRONT PLATES ARE OBJECTS, NOT THE CARD. No cut-out over ~90% of the frame. A `subject`
 *     at 95% is not a separation, it is the card with a hairline rim lifted off it: 35 → 95.8%,
 *     40 → 95.0%, 46 → 98.3% (and 46's text plate came out EMPTY, 2 KB).
 *   3 ≥ 2 plates in front of the backing, none of them empty.
 *   4 ⚑ THE EXPLODED RENDER HAS TO BE LOOKED AT. Card 37 passes 1–3 on the numbers (2 peel bands,
 *     subject 85.5%) and its render shows the face SHEARED IN HALF along a skin-tone cluster
 *     boundary, with a slab of forehead floating on its own plane. That is exactly the "cut-off
 *     hair, a subject shearing off its own shadow" the rule names. Rejected on the picture.
 *
 * ⚑ AND THE SETTINGS ARE PER CARD — `--mode layers` alone is not a method. Card 36 only separates
 *   with `--cluster-above 0.9`, i.e. peel-ONLY: with the default 0.55 the k-means fires inside the
 *   peel and returns confetti, while peel-only returns frame → inner rule → art panel → type,
 *   which is the real printed structure. Card 49 needs `--cluster-above 0.95 --text-ground 0.12`;
 *   without the tighter text ground a false-positive glyph group punches a hole in the portrait's
 *   cheek and floats the fragment forward. Card 42 needs the DEFAULT — png23d's own comments cite
 *   it as the k-means success case, and the render agrees: speckled ground, red hearts, the white
 *   suit and the blue face all come off cleanly. Every stack now records its own command in
 *   `models/cards/<slug>/layers.json`.
 * ⚠ `--key grad` was tried on the cards that key nothing and is a TRAP here: the wider leash walks
 *   the flood into the art. Card 48's subject went to 21.6% and card 49's to 17.8% — the peel
 *   eating the portrait, which is the `alley-trio` failure png23d's own comments describe.
 * ⚠ Card 45's strata are a CREATIVE CUT, not a separation, and were not extended to other cards.
 *   Measured for scanline displacement (best per-row horizontal shift against the row above),
 *   45 scores 1.3% of rows and 34 scores 1.0% — the two LOWEST in the set. There is no measurable
 *   tear to exaggerate; slicing a card into horizontal bands is an art direction decision and it
 *   is the artist's to make, not a thing to infer.
 *
 * Guarded by `npm run test:cardlayers`, which asserts 2 and 3 against every sidecar in the repo.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'models/cards');

/* png23d's `kind` -> the reader's `fit`. A layer that parallaxes must not reveal its own edge, so
 * anything acting as a backdrop goes edge-to-edge; everything else sits inside the bevel. */
const FIT = { background: 'full', frame: 'full' };
/* ...and -> a default z when the generator did not supply one. The reader treats z as the PHYSICAL
 * stack (occlusion + which plate the key light rakes first), not as the parallax amount. */
const ZOF = { background: 0.0, stratum: 0.45, midground: 0.45, subject: 0.72, frame: 0.88, text: 0.95 };

let wrote = 0, skipped = 0;
const dirs = existsSync(SRC) ? readdirSync(SRC) : [];
for (const slug of dirs) {
  const jf = join(SRC, slug, 'layers.json');
  if (!existsSync(jf)) { skipped++; continue; }
  let d;
  try { d = JSON.parse(readFileSync(jf, 'utf8')); } catch (e) { console.log(`  skip ${slug}: ${e.message}`); continue; }
  if (!d.source || !Array.isArray(d.layers) || d.layers.length < 2) {
    console.log(`  skip ${slug}: no source or fewer than two layers`);
    skipped++; continue;
  }
  const artAbs = join(ROOT, d.source);
  if (!existsSync(artAbs)) { console.log(`  skip ${slug}: art missing at ${d.source}`); skipped++; continue; }

  const outFile = artAbs.replace(/\.[a-z0-9]+$/i, '') + '.layers.json';
  const outDir = dirname(outFile);
  const n = d.layers.length;

  /* ⚑ THE GENERATOR'S z IS IN DIFFERENT UNITS AND MUST BE RESCALED, not passed through. png23d
   * writes z as a fraction of the card's HEIGHT — real separations came out as
   * [0, 0.0405, 0.0405, 0.108, 0.108, 0.108, 0.144] — while the reader's z is 0..1 through the
   * card's THICKNESS. Handing it the raw numbers puts every plate within 14% of the backing,
   * i.e. visually co-planar: the sidecar loads, seven layers arrive, and the card still looks
   * flat. That is a worse failure than not linking at all, because everything reports success.
   * ⚠ The generator's ORDER and RELATIVE spacing are real information, so they are preserved —
   *   only the range is stretched. Ties are broken by index so two plates never share a z and
   *   sort arbitrarily against each other. */
  const zs = d.layers.map(L => (typeof L.z === 'number' ? L.z : null));
  const known = zs.filter(v => v !== null);
  const zlo = known.length ? Math.min(...known) : 0;
  const zhi = known.length ? Math.max(...known) : 0;
  const zSpan = zhi - zlo;

  const layers = d.layers.map((L, i) => {
    const kind = L.kind || 'midground';
    /* z: honour the generator when it gave a real one, otherwise spread by kind. png23d writes
     * z as a fraction of card HEIGHT and the reader wants 0..1 through the thickness, so a flat
     * 0 from the generator is "unset" rather than "against the backing". */
    let z;
    if (zs[i] !== null && zSpan > 1e-6) {
      z = (zs[i] - zlo) / zSpan;                       // rescale the generator's own stack to 0..1
      z += (i / Math.max(1, n)) * 1e-3;                // break ties by order, invisibly
    } else {
      z = ZOF[kind] !== undefined ? ZOF[kind] : (n > 1 ? i / (n - 1) : 0);
    }
    z = Math.max(0, Math.min(1, z));
    const src = relative(outDir, join(SRC, slug, L.file)).split('\\').join('/');
    const out = { id: L.name || kind + i, src, z: +z.toFixed(4), fit: FIT[kind] || 'art' };
    /* ⛔ THE RECT IS NOT OPTIONAL AND DROPPING IT DOES NOT FAIL, IT LIES. png23d emits TRIMMED
     * cut-outs — `layer 06 text … 0.6% cover` is a 22 KB PNG cropped to a corner badge — and the
     * reader draws a rect-less plate across the whole face. So every one of these stacks rendered
     * as its own ink stretched edge to edge: a face blown up to the card, a badge spanning the top
     * rule. Seven plates, seven 200s, z spanning the thickness, every check green, card ruined.
     * The rect is already in the generator's manifest in exactly the reader's units — fractions of
     * the card, origin top-left — so this is a passthrough, and its absence was the whole bug. */
    if (Array.isArray(L.rect) && L.rect.length >= 4) out.rect = L.rect.slice(0, 4).map(v => +(+v).toFixed(5));
    if (L.blend && L.blend !== 'normal') out.blend = L.blend;
    /* The bottom plate carries the emboss — the reader's own default, made explicit here because
     * png23d's layer 0 is a full-frame inpainted backplate and is exactly the right one for it. */
    if (i === 0) out.relief = 0.6;
    return out;
  });

  const spec = {
    v: 1,
    size: [d.size && d.size.w, d.size && d.size.h].map(x => x | 0),
    title: d.card || slug,
    note: `Generated separations, linked by scripts/link-card-layers.mjs from models/cards/${slug}/layers.json (${d.method || 'png23d'}). Edit that, not this.`,
    layers,
  };
  writeFileSync(outFile, JSON.stringify(spec, null, 2) + '\n');
  console.log(`  ok   ${basename(outFile)}  <- models/cards/${slug}  (${n} layers, ${layers.map(l => l.id).join(' · ')})`);
  wrote++;
}

console.log(`\n${wrote} sidecar(s) written, ${skipped} skipped.`);
if (!wrote) console.log('nothing linked — run the generator first, or check models/cards/*/layers.json');

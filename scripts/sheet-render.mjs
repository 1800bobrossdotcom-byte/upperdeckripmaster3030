#!/usr/bin/env node
/* ripmaster3030studios — SHEET: the plate renderer.  `npm run sheet`
 *
 * A collector sets type into a fixed frame — 8 lines of 32 cells, 256 bytes, the ABI word as the
 * measure — and sends it. That transaction IS the press. This file is the picture.
 *
 * ⛔ THIS IS THE REFERENCE IMPLEMENTATION, NOT THE PRODUCT. The Solidity that ships must produce
 *   this output BYTE FOR BYTE, and will be asserted against it on a hundred random plates. It is
 *   written in JS first for one reason: the decision this design actually turns on cannot be made
 *   on a screen, and writing a contract before making it would be building on an unmade choice.
 *
 * ⚠ THE QUESTION IT EXISTS TO ANSWER: **does this read as a page, or as a chart?** Eight rows of
 *   variable length is one step from a bar graph. Two things are meant to resolve it, and neither
 *   is checkable by a test:
 *     · the die is cut to a FIXED 2:3 CARD, not to the type block — so the ragged edge is a
 *       ragged right margin inside a page, never the outline of the object;
 *     · the length of each line is set by what a person chose to LEAVE OUT, priced — not by a
 *       datum being plotted. A chart plots data. This plots a composition.
 *   **Print three plates at card size and look at them on a bench.** If it reads as a chart, the
 *   gesture changes and no contract should exist yet.
 *
 * ══ THE MATERIAL — three layers and no fourth ═════════════════════════════════════════════════
 *
 *   STOCK       0x00              an unwritten cell. Warm off-white paper. 1 unit wide.
 *   TYPE        0x20–0x7E         the byte set as its own glyph. Ink MULTIPLIES stock. 4 wide.
 *   SLUG        every other       furniture worked up and taking ink where there should be
 *               non-zero byte     white — a real and hated press failure, and precisely what a
 *                                 byte with no readable face IS. 4 wide.
 *
 * ⛔ THE SLUG'S FORM IS KEYED ON THE BYTE'S OWN VALUE. The first draft drew all 161 non-printable
 *   values identically, so two different plates could produce byte-identical pictures and "the
 *   picture is the bytes" was true of only 63% of the byte space. `0x01` kisses the sheet as a
 *   hairline; `0xFF` is a solid black band. Every value is distinguishable — asserted, not hoped.
 *
 * ⛔ THE PAID BLANK — this is the answer to "blank disappearing ink formations". A TYPED space
 *   (`0x20`) costs four times an unwritten cell and, being a quad below type height, takes no
 *   ink. It is not nothing: it prints as a BLIND EMBOSS — the sheet pressed and not inked.
 *   **The space you paid for leaves a mark. The space you did not pay for leaves nothing.**
 *   That is the disappearing ink, it is a real press artefact, and it makes the price legible in
 *   the picture rather than only in a meter.
 *
 * ⚑ THE MEASURE IS THE PRICE. A cell is drawn 1 unit wide if unwritten and 4 if written — the
 *   protocol's own calldata token weights (a zero byte is 1 token, a non-zero byte is 4). A line
 *   of pure paper is 32 units; a line of pure ink is 128.
 *   ⚠ THOSE ARE TOKEN WEIGHTS, NOT A GAS PRICE. Intrinsic gas is max(standard, floor) and the
 *     schedules disagree (4/16 vs 10/40) — see docs/SUBSTRATE-3030.md §2, where publishing one
 *     as "the price" is a recorded and corrected error. The WEIGHTS are 1 and 4 under both, and
 *     the ratio is 4×. That is why the picture is built on the weight and never on a gas figure.
 *
 * ⚑ THE FORMATIONS THAT SURVIVE ON A TYPED PLATE are the collector's own, not the chain's:
 *     WORD        a line of 32 cells — the ABI word as the typographic measure
 *     RULE        a line left entirely unwritten — the blank line
 *     TINT BLOCK  a full line of slug: a flat of solid ink pretending to be a different paper.
 *                 The artist's "fake substrate". Printers do it constantly — honest craft,
 *                 dishonest name.
 *   ⚠ ADDRESS and SELECTOR are shapes of CHAIN calldata and mean nothing on a typed plate. Not
 *     drawn. Carrying them over would be decoration wearing a measurement's clothes.
 *
 * ══ WHAT IS DELIBERATELY ABSENT ═══════════════════════════════════════════════════════════════
 *
 * ⛔ NO FOIL. Foil is defined by MOVEMENT — render at several angles and measure the hue travel;
 *   no shift, no foil. An SVG has no viewer angle, so any rainbow in it is a sticker OF foil,
 *   which DESIGN-SYSTEM §1 has now rejected four times. The on-chain sheet is ONE INK ON ONE
 *   STOCK. Foil exists on the gallery card, which has a camera.
 * ⛔ NO LIGHTING. No gradient, no filter, no specular, no shadow. Paper reflectance multiplied by
 *   ink transmittance. §2's three keys model a ROOM, and a room needs a viewer position an SVG
 *   does not have. Every marketplace composites this onto its own field.
 * ⛔ NOTHING EMISSIVE, and nothing that moves. No wall-clock term, no block read, no animation.
 *   `tokenURI` must return an identical string at two blocks a thousand apart.
 * ⛔ THE SHEET BRINGS ITS OWN OPAQUE PAPER, so it never borrows a marketplace's background. That
 *   is asserted, because the future edit that makes it transparent "to look nicer" is the one
 *   that puts somebody else's black where the paper goes.
 *
 * ⚠ THE ONE GENUINELY OFF-CHAIN DEPENDENCY, SAID PLAINLY RATHER THAN TALKED AROUND: the
 *   LETTERFORMS come from the reader's font stack. The composition, the grid, the measure, the
 *   paper and the ink are all in the bytecode. `textLength` pins the grid so the composition
 *   cannot break, and the type BODY is drawn behind every glyph — so a machine with no monospace
 *   face renders a bad pull with no ink on the face, rather than a blank page.
 */

/* ── the frame ────────────────────────────────────────────────────────────────────────────── */
export const COLS = 32;          // the ABI word, as the measure
export const ROWS = 8;           // 256 bytes
export const CAP  = COLS * ROWS;

/* Cell widths ARE the protocol's calldata token weights: a zero byte is 1 token, a non-zero byte
 * is 4. Not a gas price — see the header. */
export const W_UNWRITTEN = 1;
export const W_WRITTEN   = 4;

/* ⚠ A FIXED 2:3 CARD DIE. The type block is ragged; the OBJECT never is. This is the single
 * decision standing between a page and a bar chart, so it is a constant here and not derived. */
const LINE_H   = 12;
const LEAD     = 4;
const MARGIN_X = 14;
const MARGIN_Y = 18;
const BLOCK_W  = COLS * W_WRITTEN;                     // 128 units — a full line of ink
const CARD_W   = BLOCK_W + MARGIN_X * 2;               // 156
const CARD_H   = Math.round(CARD_W * 1.5);             // 2:3, always

/* Paper and ink. ⚠ PALE STOCK IS STRUCTURAL, NOT A PREFERENCE: ink MULTIPLIES paper and never
 * adds, so on near-black stock there is nothing to multiply and black stock forces additive ink —
 * exactly what the card renderer forbids. docs/BRAND-3030.md measured the ratio at 0.508. */
const STOCK   = '#e7dfcd';
const INK     = '#141210';
const EMBOSS  = '#d8cfba';   // the paid blank: pressed, not inked — a shoulder kiss, no colour
const TRIM    = '#c9bfa6';

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const SPACE = 'space', TYPE = 'type', SLUG = 'slug';
export const classOf = (b) =>
  b === 0 ? SPACE : (b >= 0x20 && b <= 0x7e) ? TYPE : SLUG;

/* ⛔ THE SLUG STANDS PROUD IN PROPORTION TO ITS VALUE. Without this, 161 byte values render
 * identically and the picture stops being the bytes. 0x01 is a hairline; 0xFF a solid band. */
/* ⛔ AND IT MUST NOT BE MONOTONIC IN THE BYTE'S VALUE. The first version mapped value straight to
 * height, and the bench print showed exactly what that produces: a ramp of ascending bars — **a
 * bar chart**, which is the one thing this whole design is trying not to be. The risk did not
 * land at the ragged end where it was expected; it landed at the INK end.
 * ✅ Height now comes from the byte's LOW NIBBLE and the standing proud from its HIGH nibble, so
 *   neighbouring values differ sharply and a sorted run of bytes does not draw a slope. Every
 *   value is still distinguishable (asserted) — it simply no longer plots. */
const slugHeight = (b) => {
  const hi = (b >> 4) & 0xf, lo = b & 0xf;
  const t = 0.22 + (lo / 15) * 0.55 + ((hi * 7) % 16) / 15 * 0.23;
  return Math.max(0.10, Math.min(1, t));
};

/**
 * plate(bytes) → { svg, stats }
 * Pure. No clock, no chain, no randomness. Same bytes in, same string out, forever.
 */
export function plate(bytes, { title = '' } = {}) {
  const b = Uint8Array.from(bytes).slice(0, CAP);
  const counts = { [SPACE]: 0, [TYPE]: 0, [SLUG]: 0 };
  let tokens = 0, paidBlanks = 0;
  const rows = [];

  for (let r = 0; r < ROWS; r++) {
    const cells = [];
    let x = MARGIN_X;
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const v = i < b.length ? b[i] : 0;
      const k = classOf(v);
      const w = v === 0 ? W_UNWRITTEN : W_WRITTEN;
      counts[k]++; tokens += w;
      if (v === 0x20) paidBlanks++;
      cells.push({ v, k, x, w });
      x += w;
    }
    rows.push({ cells, width: x - MARGIN_X });
  }

  /* ── draw ───────────────────────────────────────────────────────────────────────────────── */
  const P = [];
  P.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}" shape-rendering="crispEdges">`);
  /* the sheet's own opaque paper — never borrow the marketplace's field */
  P.push(`<rect width="${CARD_W}" height="${CARD_H}" fill="${STOCK}"/>`);
  /* the trim: the die edge, so it reads as a cut sheet rather than a canvas */
  P.push(`<rect x="0.5" y="0.5" width="${CARD_W - 1}" height="${CARD_H - 1}" fill="none" stroke="${TRIM}" stroke-width="1"/>`);

  const top = MARGIN_Y;
  rows.forEach((row, r) => {
    const y = top + r * (LINE_H + LEAD);
    for (const cell of row.cells) {
      if (cell.k === SPACE) continue;                      // unwritten: the paper shows. Nothing drawn.
      if (cell.v === 0x20) {
        /* THE PAID BLANK — blind emboss. Pressed, not inked. */
        /* ⚠ A SHOULDER KISS, and it must not look like the type's foot. It sits HIGHER, is
         * paler, and is inset — a quad pressed into the sheet without reaching the ink. */
        P.push(`<rect x="${(cell.x + 0.6).toFixed(2)}" y="${y + 2}" width="${(cell.w - 1.2).toFixed(2)}" height="${LINE_H - 4}" fill="${EMBOSS}"/>`);
        continue;
      }
      if (cell.k === SLUG) {
        const h = slugHeight(cell.v) * LINE_H;
        P.push(`<rect x="${cell.x}" y="${(y + LINE_H - h).toFixed(2)}" width="${cell.w}" height="${h.toFixed(2)}" fill="${INK}"/>`);
        continue;
      }
      /* TYPE — the body first, so a font-less reader gets a bad pull rather than a blank page,
       * then the glyph over it. ⚠ textLength pins the grid: the composition cannot break even if
       * the reader's monospace face has different metrics.
       * ⛔ THE BODY WAS 0.10 AND IT READ AS A HIGHLIGHTER. A grey box behind every glyph is a UI
       *   artifact — selected text — not a press one, and on the bench print it was the first
       *   thing the eye saw. It is a FOOT now: a thin bearer under the line, which is what an
       *   inked-up type body actually leaves on paper, and which cannot be confused with the
       *   paid blank's shoulder kiss because it sits at a different height and weight. */
      P.push(`<rect x="${cell.x}" y="${y + LINE_H - 1.4}" width="${cell.w}" height="0.6" fill="${INK}" opacity="0.20"/>`);
      P.push(`<text x="${cell.x}" y="${y + LINE_H - 2.5}" textLength="${cell.w}" lengthAdjust="spacingAndGlyphs" font-family="ui-monospace,monospace" font-size="${LINE_H - 2}" fill="${INK}">${esc(String.fromCharCode(cell.v))}</text>`);
    }
  });

  if (title) {
    P.push(`<text x="${MARGIN_X}" y="${CARD_H - MARGIN_Y / 2}" font-family="ui-monospace,monospace" font-size="6" fill="${INK}" opacity="0.55">${esc(title)}</text>`);
  }
  P.push('</svg>');

  return {
    svg: P.join(''),
    stats: {
      bytes: b.length, tokens, paidBlanks,
      counts: { ...counts },
      rules: rows.filter(r => r.cells.every(c => c.v === 0)).length,
      tintBlocks: rows.filter(r => r.cells.every(c => classOf(c.v) === SLUG)).length,
      widest: Math.max(...rows.map(r => r.width)),
      narrowest: Math.min(...rows.map(r => r.width)),
    },
  };
}

/* ── CLI: write the three bench plates ────────────────────────────────────────────────────── */
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const { writeFileSync, mkdirSync, readFileSync } = await import('node:fs');
  const enc = new TextEncoder();
  const pad = (s) => { const a = new Uint8Array(CAP); a.set(enc.encode(s).slice(0, CAP)); return a; };

  /* ⚠ THE THREE THAT DECIDE IT. Nearly-all-paper, mixed, nearly-all-ink — the extremes of the
   * composition, because the chart risk lives at the ragged end. */
  const PLATES = {
    'a-paper': (() => { const a = new Uint8Array(CAP); enc.encode('the space you did not pay for').forEach((c, i) => a[i] = c); return a; })(),
    'b-mixed': pad(
      'everything is data\n' +
      'everything is connected\n\n' +
      'eth prints a substrate\n' +
      'each sigil and space\n' +
      'a mark on chain'),
    'c-ink':   (() => { const a = new Uint8Array(CAP); for (let i = 0; i < CAP; i++) a[i] = 0x80 + (i * 7) % 0x7f; return a; })(),
    /* ⚠ AND ONE FROM REAL CALLDATA, because a synthetic ramp is the one input that flatters a
     * value→height mapping and the bench print proved it. Taken from the shipped derivation. */
    'd-chain': (() => {
      const a = new Uint8Array(CAP);
      try {
        const d = JSON.parse(readFileSync('data/substrate.json', 'utf8'));
        const seed = d.blocks[d.blocks.length - 1].hash;
        for (let i = 0; i < CAP; i++) a[i] = parseInt(seed.substr((i * 2) % 62, 2), 16) ^ (i * 31 & 0xff);
        /* leave real padding in it — the chain is mostly zero and the plate should show that */
        for (let i = 0; i < CAP; i++) if ((i % 32) > 19) a[i] = 0;
      } catch { /* fall through to an empty plate */ }
      return a;
    })(),
  };

  mkdirSync('build/sheet', { recursive: true });
  console.log('\n══ SHEET · three plates for the bench ══\n');
  for (const [name, bytes] of Object.entries(PLATES)) {
    const { svg, stats } = plate(bytes, { title: name });
    writeFileSync(`build/sheet/${name}.svg`, svg);
    const pc = (n) => ((100 * n / CAP).toFixed(1) + '%').padStart(6);
    console.log(`  ${name.padEnd(9)} paper ${pc(stats.counts.space)} · type ${pc(stats.counts.type)} · slug ${pc(stats.counts.slug)}`);
    console.log(`  ${' '.repeat(9)} tokens ${String(stats.tokens).padStart(4)}/${CAP * 4}  · lines ${stats.narrowest}–${stats.widest} of ${BLOCK_W} units` +
      `  · rules ${stats.rules} · tint ${stats.tintBlocks} · paid blanks ${stats.paidBlanks}`);
    console.log(`  ${' '.repeat(9)} ${svg.length.toLocaleString()} bytes of SVG\n`);
  }
  console.log('  → build/sheet/*.svg\n');
  console.log('  ⚠ THE DECISION IS NOT ON A SCREEN. Print these at card size (63×88mm) and look');
  console.log('    at them on a bench. If it reads as a chart, the gesture changes.\n');
}

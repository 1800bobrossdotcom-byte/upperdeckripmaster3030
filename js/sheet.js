/* ripmaster3030studios — SHEET: the plate renderer. THE ONE DEFINITION.
 *
 * A collector sets type into a fixed frame — 8 lines of 32 cells, 256 bytes, the ABI word as the
 * measure — and sends it. That transaction IS the press. This file is the picture.
 *
 * ⛔ THIS FILE IS SHARED BY THE BROWSER AND THE CLI, AND THAT IS DELIBERATE. `sheet.html` loads it
 *   with a <script src>; `scripts/sheet-render.mjs` READS THIS FILE and evaluates it. So the
 *   plate you compose in the browser and the plate the CLI writes to build/sheet are produced by
 *   the same bytes, and cannot drift. Two copies of a renderer is two pictures for one plate, and
 *   the one that drifts is the one nobody is looking at.
 *
 * ⚠ CLASSIC SCRIPT, NOT ESM, ON PURPOSE. `npm run test:reach` §0 compiles every shipped browser
 *   script with `new Function` — an `export` keyword is a SyntaxError there and would report the
 *   whole file as broken. It assigns to `window.Sheet`.
 *
 * ⛔ THIS IS THE REFERENCE THE SOLIDITY MUST MATCH BYTE FOR BYTE, on a hundred random plates.
 *   It is written in JS first because the decision this design turns on cannot be made on a
 *   screen, and writing a contract before making it would be building on an unmade choice.
 *
 * ══ THE MATERIAL — three layers and no fourth ═════════════════════════════════════════════════
 *
 *   STOCK   0x00           an unwritten cell. Warm off-white paper. 1 unit wide.
 *   TYPE    0x20–0x7E      the byte set as its own glyph. Ink MULTIPLIES stock. 4 wide.
 *   SLUG    other non-zero furniture worked up and taking ink where there should be white — a
 *                          real and hated press failure, and precisely what a byte with no
 *                          readable face IS. 4 wide.
 *
 * ⛔ THE PAID BLANK — the answer to "blank disappearing ink formations". A TYPED space (0x20)
 *   costs four times an unwritten cell and, being a quad below type height, takes no ink. It
 *   prints as a BLIND EMBOSS — the sheet pressed and not inked. **The space you paid for leaves
 *   a mark. The space you did not pay for leaves nothing.**
 *
 * ⚑ THE MEASURE IS THE PRICE. A cell is 1 unit wide if unwritten and 4 if written — the
 *   protocol's own calldata TOKEN WEIGHTS (a zero byte is 1 token, a non-zero byte is 4).
 *   ⚠ TOKEN WEIGHTS, NOT A GAS PRICE. Intrinsic gas is max(standard, floor) and the two
 *     schedules disagree (4/16 vs 10/40) — publishing one as "the price" is a recorded and
 *     corrected error, see docs/SUBSTRATE-3030.md §2. The WEIGHTS are 1 and 4 under both and the
 *     ratio is 4x, which is exactly why the picture is built on the weight and never on a gas
 *     figure. A picture built on a gas number would have been wrong twice already.
 *
 * ══ WHAT IS DELIBERATELY ABSENT ═══════════════════════════════════════════════════════════════
 *
 * ⛔ NO FOIL. Foil is defined by MOVEMENT — render at several angles and measure the hue travel;
 *   no shift, no foil. An SVG has no viewer angle, so any rainbow in it is a sticker OF foil,
 *   which DESIGN-SYSTEM §1 has now rejected four times. One ink on one stock.
 * ⛔ NO LIGHTING, nothing emissive, and nothing that moves. No wall-clock term, no block read.
 *   `tokenURI` must return an identical string at two blocks a thousand apart.
 * ⛔ THE SHEET BRINGS ITS OWN OPAQUE PAPER, so it never borrows a marketplace's background.
 *
 * ⚠ THE ONE GENUINELY OFF-CHAIN DEPENDENCY, SAID PLAINLY: the LETTERFORMS come from the reader's
 *   font stack. The composition, grid, measure, paper and ink are all in the bytecode.
 *   `textLength` pins the grid so the composition cannot break, and a FOOT is drawn under every
 *   glyph — so a machine with no monospace face renders a bad pull rather than a blank page.
 */
(function (root) {
  'use strict';

  var COLS = 32, ROWS = 8, CAP = COLS * ROWS;
  var W_UNWRITTEN = 1, W_WRITTEN = 4;

  /* ⚠ A FIXED 2:3 CARD DIE. The type block is ragged; the OBJECT never is. This is the single
   * decision standing between a page and a bar chart, so it is a constant and not derived. */
  var LINE_H = 12, LEAD = 4, MARGIN_X = 14, MARGIN_Y = 18;
  var BLOCK_W = COLS * W_WRITTEN;              // 128 — a full line of ink
  var CARD_W  = BLOCK_W + MARGIN_X * 2;        // 156
  var CARD_H  = Math.round(CARD_W * 1.5);      // 2:3, always

  /* ⚠ PALE STOCK IS STRUCTURAL, NOT A PREFERENCE: ink MULTIPLIES paper and never adds, so on
   * near-black stock there is nothing to multiply and black stock forces additive ink — exactly
   * what the card renderer forbids. docs/BRAND-3030.md measured the ratio at 0.508. */
  var STOCK = '#e7dfcd', INK = '#141210', EMBOSS = '#d8cfba', TRIM = '#c9bfa6';

  var SPACE = 'space', TYPE = 'type', SLUG = 'slug';
  function classOf(b) { return b === 0 ? SPACE : (b >= 0x20 && b <= 0x7e) ? TYPE : SLUG; }

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ⛔ THE SLUG STANDS PROUD IN PROPORTION TO ITS VALUE — without this, 161 byte values render
   *   identically and the picture stops being the bytes.
   * ⛔ AND IT MUST NOT BE MONOTONIC IN THAT VALUE. The first version mapped value straight to
   *   height, and the bench print showed exactly what that produces: a ramp of ascending bars —
   *   a BAR CHART, the one thing this design is trying not to be. The risk did not land at the
   *   ragged end where it was expected; it landed at the INK end. Height now comes from the LOW
   *   nibble and the standing-proud from the HIGH nibble, so neighbouring values differ sharply
   *   and a sorted run of bytes does not draw a slope. Every value stays distinguishable; it
   *   simply no longer plots. */
  function slugHeight(b) {
    var hi = (b >> 4) & 0xf, lo = b & 0xf;
    var t = 0.22 + (lo / 15) * 0.55 + ((hi * 7) % 16) / 15 * 0.23;
    return Math.max(0.10, Math.min(1, t));
  }

  /* Pure. No clock, no chain, no randomness. Same bytes in, same string out, forever. */
  function plate(bytes, opts) {
    opts = opts || {};
    var b = [], i;
    for (i = 0; i < Math.min(bytes.length, CAP); i++) b.push(bytes[i] & 0xff);

    var counts = {}; counts[SPACE] = 0; counts[TYPE] = 0; counts[SLUG] = 0;
    var tokens = 0, paidBlanks = 0, rows = [];

    for (var r = 0; r < ROWS; r++) {
      var cells = [], x = MARGIN_X;
      for (var c = 0; c < COLS; c++) {
        var idx = r * COLS + c;
        var v = idx < b.length ? b[idx] : 0;
        var k = classOf(v);
        var w = v === 0 ? W_UNWRITTEN : W_WRITTEN;
        counts[k]++; tokens += w;
        if (v === 0x20) paidBlanks++;
        cells.push({ v: v, k: k, x: x, w: w });
        x += w;
      }
      rows.push({ cells: cells, width: x - MARGIN_X });
    }

    var P = [];
    P.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + CARD_W + ' ' + CARD_H +
           '" width="' + CARD_W + '" height="' + CARD_H + '" shape-rendering="crispEdges">');
    P.push('<rect width="' + CARD_W + '" height="' + CARD_H + '" fill="' + STOCK + '"/>');
    P.push('<rect x="0.5" y="0.5" width="' + (CARD_W - 1) + '" height="' + (CARD_H - 1) +
           '" fill="none" stroke="' + TRIM + '" stroke-width="1"/>');

    for (var ri = 0; ri < rows.length; ri++) {
      var y = MARGIN_Y + ri * (LINE_H + LEAD);
      var cs = rows[ri].cells;
      for (var ci = 0; ci < cs.length; ci++) {
        var cell = cs[ci];
        if (cell.k === SPACE) continue;                 // unwritten: the paper shows. Nothing drawn.
        if (cell.v === 0x20) {
          /* THE PAID BLANK — a shoulder kiss. ⚠ It must not look like the type's foot: it sits
           * HIGHER, is paler, and is inset — a quad pressed in without reaching the ink. */
          P.push('<rect x="' + (cell.x + 0.6).toFixed(2) + '" y="' + (y + 2) + '" width="' +
                 (cell.w - 1.2).toFixed(2) + '" height="' + (LINE_H - 4) + '" fill="' + EMBOSS + '"/>');
          continue;
        }
        if (cell.k === SLUG) {
          var h = slugHeight(cell.v) * LINE_H;
          P.push('<rect x="' + cell.x + '" y="' + (y + LINE_H - h).toFixed(2) + '" width="' +
                 cell.w + '" height="' + h.toFixed(2) + '" fill="' + INK + '"/>');
          continue;
        }
        /* TYPE — the FOOT first, then the glyph over it.
         * ⛔ THE FOOT WAS A FULL BOX AT 0.10 AND IT READ AS A HIGHLIGHTER — a grey panel behind
         *   every glyph is a UI artifact, selected text, not a press one, and on the bench print
         *   it was the first thing the eye went to. A thin bearer under the line is what an
         *   inked-up type body actually leaves on paper. */
        P.push('<rect x="' + cell.x + '" y="' + (y + LINE_H - 1.4) + '" width="' + cell.w +
               '" height="0.6" fill="' + INK + '" opacity="0.20"/>');
        P.push('<text x="' + cell.x + '" y="' + (y + LINE_H - 2.5) + '" textLength="' + cell.w +
               '" lengthAdjust="spacingAndGlyphs" font-family="ui-monospace,monospace" font-size="' +
               (LINE_H - 2) + '" fill="' + INK + '">' + esc(String.fromCharCode(cell.v)) + '</text>');
      }
    }

    if (opts.title) {
      P.push('<text x="' + MARGIN_X + '" y="' + (CARD_H - MARGIN_Y / 2) +
             '" font-family="ui-monospace,monospace" font-size="6" fill="' + INK +
             '" opacity="0.55">' + esc(opts.title) + '</text>');
    }
    P.push('</svg>');

    var widths = rows.map(function (r2) { return r2.width; });
    return {
      svg: P.join(''),
      stats: {
        bytes: b.length, tokens: tokens, paidBlanks: paidBlanks, counts: counts,
        rules: rows.filter(function (r2) {
          return r2.cells.every(function (c2) { return c2.v === 0; }); }).length,
        tintBlocks: rows.filter(function (r2) {
          return r2.cells.every(function (c2) { return classOf(c2.v) === SLUG; }); }).length,
        widest: Math.max.apply(null, widths),
        narrowest: Math.min.apply(null, widths),
      },
    };
  }

  /* ── intrinsic gas, BOTH schedules ────────────────────────────────────────────────────────
   * ⛔ THERE IS NO SINGLE "GAS PRICE" FOR A BYTE AND SAYING THERE IS, IS A MISTAKE THIS PROJECT
   *   HAS ALREADY MADE AND PUBLISHED. Intrinsic gas is `max(standard, floor)`:
   *     standard  4 per zero byte, 16 per non-zero   ← binds once a transaction does real work
   *     floor     10 per token; zero = 1, non-zero = 4 → 10 and 40   (EIP-7623)
   *   The floor only wins when `24*nonzero + 6*zero > execution`. A press does SSTORE2, a census
   *   walk and a mint — a few hundred thousand gas — so the STANDARD schedule is what a real
   *   press pays. Both are returned, named, so the meter can never quote one as "the" price.
   * ⚠ EXECUTION IS EXCLUDED AND SAID SO. This is the calldata component only. */
  function gasOf(bytes) {
    var zero = 0, nonzero = 0;
    for (var i = 0; i < bytes.length; i++) (bytes[i] === 0 ? zero++ : nonzero++);
    var tokens = zero + nonzero * 4;
    return {
      zero: zero, nonzero: nonzero, tokens: tokens,
      standard: zero * 4 + nonzero * 16,
      floor: tokens * 10,
      /* which one actually binds depends on the execution gas of the press, which does not exist
       * yet — so this reports the calldata component and refuses to guess the total */
      note: 'calldata component only; execution excluded',
    };
  }

  root.Sheet = {
    COLS: COLS, ROWS: ROWS, CAP: CAP,
    W_UNWRITTEN: W_UNWRITTEN, W_WRITTEN: W_WRITTEN,
    CARD_W: CARD_W, CARD_H: CARD_H, BLOCK_W: BLOCK_W,
    SPACE: SPACE, TYPE: TYPE, SLUG: SLUG,
    classOf: classOf, slugHeight: slugHeight, plate: plate, gasOf: gasOf,
  };
})(typeof window !== 'undefined' ? window : this);

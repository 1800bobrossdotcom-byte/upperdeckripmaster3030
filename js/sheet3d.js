/* ripmaster3030studios — THE UNCUT SHEET.  `Sheet3D`   (PlayCanvas)
 *
 *   Sheet3D.mount(host, opts) -> Promise<ctrl | null>     never rejects, never throws
 *   ctrl.pointer(nx, ny, down)      -1..1 across the host, `down` = finger on the sheet
 *   ctrl.setView(yaw, pitch)        drive the camera directly (probes, acceptance tests)
 *   ctrl.advance(dtMs) / .render()  explicit clock — see DETERMINISM
 *   ctrl.loop(on)                   hand the clock back to rAF
 *   ctrl.probe()                    numbers for scripts/test-sheet.mjs
 *
 * Brief: `docs/BRAND-3030.md`. This is the studio's proposed landing surface and it is
 * DISPOSABLE ON PURPOSE — the recorded failure on this project is agreeing a direction off a
 * mood board, so the point of a prototype is to be something specific to reject.
 *
 * ══ THE ONE IDEA ═══════════════════════════════════════════════════════════════════════════
 * Before a trading card is a card it is ONE CARD ON AN UNCUT PRESS SHEET — printed eight-up,
 * with crop marks, a colour bar, a perforation between every pair, and the studio's slug
 * hot-foil-stamped in the tail margin. This page IS that sheet, lying on the press bed.
 *
 * ⛔ AND THE NAVIGATION IS THE PHYSICAL ACT: you do not click a card, YOU TEAR IT OUT. The
 * studio's own verb is RIP. That is the answer to DESIGN-SYSTEM §4 — "what moves, and why did
 * it physically move" — and it is the half of the brief that two rejected hero wordmarks
 * skipped. Nothing here moves on its own; every displacement is the visitor's hand.
 *
 * ══ WHY THE STOCK IS PALE, WHICH LOOKS LIKE A BREAK FROM A BLACK SITE AND IS NOT ═══════════
 * ⚑ INK MULTIPLIES THE PAPER'S REFLECTANCE AND NEVER ADDS (js/hero-card.js's rule, and it is
 * what keeps a card a card instead of a screen). On near-black stock there is nothing to
 * multiply — black stock FORCES additive ink, i.e. the exact thing the card renderer forbids.
 * So the sheet is warm off-white and it is the one bright object on a dark field, which is
 * also DESIGN-SYSTEM §5 ("dark field, lit object") rather than a departure from it.
 *
 * ══ THREE PLATES, AND NO DATA IN AN ALPHA CHANNEL ══════════════════════════════════════════
 * The cards print in three spot inks — ACID, CYAN, KEY — laid down at three different
 * registrations. ⚑ The mis-registration is not a filter: it is ONE CONSTANT VECTOR PER PLATE,
 * so it is uniform across the frame by construction (a press has no idea where the centre of
 * the sheet is; that is what separates it from chromatic aberration).
 * ⛔ Green is deliberately NOT an ink. It is the ROOM — the terminal glow beside the bed — so
 * the palette arrives twice by two different physical routes, and three plates fit in RGB with
 * nothing in alpha. A 2D canvas stores pixels PREMULTIPLIED, so a fourth plate in the alpha
 * channel would have multiplied every other plate by zero (recorded, CLAUDE.md).
 *
 * ══ DETERMINISM ════════════════════════════════════════════════════════════════════════════
 * `Math.random` appears nowhere below. Every wobble is a seeded hash of the card index, so the
 * same sheet prints the same way every load. The clock is explicit: `advance(dtMs)` steps the
 * springs and `render()` draws, so a harness measures the RIG rather than this container's rAF
 * stalls (that trap cost a false FAIL on the wordmark rig).
 *
 * ⛔ FAILS OPEN AT EVERY STEP. PlayCanvas has no software path, so WebGL2 is a hard
 * requirement. No engine, no WebGL2, a 404 on the type outlines, a shader that will not link,
 * a lost context ⇒ this resolves to null and studio3d.html is exactly the page it is without
 * this file: a printed sheet in CSS with eight real links on it.
 */
(function (global) {
  'use strict';

  var SELF = (document.currentScript && document.currentScript.src) || '';
  var BASE = SELF ? SELF.replace(/js\/sheet3d\.js.*$/, '') : '';
  function url(p) { return new URL(p, BASE || document.baseURI).href; }

  /* ── THE IMPOSITION ───────────────────────────────────────────────────────────────────────
   * ⚑ The imposition CHANGES WITH THE PRESS, which is why this is not a media query bolted on
   *   afterwards: a landscape viewport gets the sheet run 4-up across, a portrait one gets it
   *   run 2-up. Same eight cards, same plates, a different lay. Card is 2:3 — the studio's own
   *   size law, "a trading card is a SIZE before it is anything". */
  var CARD_W = 1.0, CARD_H = 1.5;
  var GUTTER = 0.10;                 // between two cards: the perforation lives on its midline
  var MARGIN = 0.17;                 // head and fore-edge
  var TAIL = 0.46;                   // the tail margin carries the foil slug and the colour bar
  var FALLOFF = GUTTER * 0.55;       // how far a card's pull reaches into the web around it

  /* ── THE EIGHT ────────────────────────────────────────────────────────────────────────────
   * Every one is a page that already exists. A sheet with a card on it that goes nowhere is a
   * dead end, which is this repo's own recorded failure ("where are the cards"). */
  var CARDS = [
    { n: '01', t: 'THE ARCADE',  s: 'SIX GAMES',       href: 'arcade.html' },
    { n: '02', t: 'THE CITY',    s: 'FLY IT · WALK IT', href: 'city.html' },
    { n: '03', t: 'THE FOLDER',  s: 'NINE POCKETS',    href: 'cards/binder.html' },
    { n: '04', t: 'THE 33',      s: 'GENESIS SET',     href: 'cards/proof.html' },
    { n: '05', t: 'THE MARKET',  s: 'THE BENCH',       href: 'cards/market.html' },
    { n: '06', t: 'THE PAPER',   s: 'HOW IT WORKS',    href: 'whitepaper.html' },
    { n: '07', t: 'THE NUMBERS', s: 'BURN AND FLOAT',  href: 'tokenomics.html' },
    { n: '08', t: 'THE ARTIST',  s: 'LOVEBEING',       href: 'artist.html' }
  ];
  var NCELL = CARDS.length;

  /* ── THE PALETTE, WITH VALUES ─────────────────────────────────────────────────────────────
   * The six diffraction stops are the SAME six the landing page's wordmark gradient uses, so
   * the foil on this sheet and the foil on index.html walk through one palette. */
  var RAMP = [[0.918,1.000,0.949], [0.169,1.000,0.502], [0.153,0.969,0.894],
              [0.478,0.659,1.000], [1.000,0.165,0.851], [1.000,0.824,0.231]];

  /* ── seeded noise: no Math.random anywhere in this file ───────────────────────────────── */
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function rnd(seed) { var s = seed; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ══ 1 · TYPE — OUTLINES, NEVER A FONT ══════════════════════════════════════════════════
   * `cards/type/alphabet.json` is coordinates, not type software. Naming a font here would
   * hand the visitor's machine a vote over what the studio's own sheet says. Fails open: no
   * outlines ⇒ the card faces carry their ink and their number-block and no words, and the
   * DOM docket under the canvas still names all eight. */
  var _alpha = null;
  function loadType() {
    if (_alpha) return Promise.resolve(_alpha);
    return fetch(url('cards/type/alphabet.json')).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { _alpha = (j && j.glyphs) ? j : null; return _alpha; })
      .catch(function () { return null; });
  }
  /** Fill `str` at (x,y) with cap height `cap` px. Returns the advance width in px. */
  function drawText(g, str, x, y, cap, align) {
    if (!_alpha) return 0;
    var G = _alpha.glyphs, unit = cap / (_alpha.cap || 0.7422), w = 0, i, gl;
    for (i = 0; i < str.length; i++) { gl = G[str[i]]; if (gl) w += gl.adv * unit; }
    var px = align === 'c' ? x - w / 2 : (align === 'r' ? x - w : x);
    for (i = 0; i < str.length; i++) {
      gl = G[str[i]]; if (!gl) continue;
      if (gl.contours) {
        g.beginPath();
        for (var c = 0; c < gl.contours.length; c++) {
          var ct = gl.contours[c];
          for (var p = 0; p < ct.length; p++) {
            var X = px + ct[p][0] * unit, Y = y - ct[p][1] * unit;
            if (p === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
          }
          g.closePath();
        }
        g.fill('evenodd');
      }
      px += gl.adv * unit;
    }
    return w;
  }

  /* ══ 2 · THE PLATE ATLAS — three separations in R, G, B ═════════════════════════════════
   * ⚑ Every plate is drawn onto an OPAQUE BLACK ground with `globalCompositeOperation:
   *   'lighter'` in pure red / green / blue. The channel value IS that plate's ink coverage,
   *   alpha stays 255 everywhere, and the premultiplied-alpha trap cannot happen.
   * ⚠ The shapes are drawn with a seeded wobble on every vertex. Hand-drawn, high-contrast,
   *   deliberately crude registration is the artist's own practice (DESIGN-SYSTEM §6); a
   *   perfect circle is what a default pipeline emits. */
  var CW = 220, CH = 330;   // one cell of the atlas, in texels
  function buildPlates(cols, rows) {
    var c = document.createElement('canvas');
    c.width = CW * cols; c.height = CH * rows;
    var g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'lighter';

    for (var i = 0; i < NCELL; i++) {
      var cx = (i % cols) * CW, cy = ((i / cols) | 0) * CH;
      if (cy + CH > c.height) break;
      g.save(); g.beginPath(); g.rect(cx, cy, CW, CH); g.clip(); g.translate(cx, cy);
      paintCard(g, i);
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  /** A wobbled polygon — the registration is crude on purpose. */
  function blob(g, cx, cy, r, k, sides, seed) {
    var R = rnd(seed);
    g.beginPath();
    for (var i = 0; i <= sides; i++) {
      var a = i / sides * Math.PI * 2, rr = r * (1 - k + k * 2 * R());
      var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 1.12;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
  }

  var ACID = '#ff0000', CYAN = '#00ff00', KEY = '#0000ff';   // R = acid, G = cyan, B = key

  /* ⛔ EIGHT COMPOSITIONS, NOT ONE COMPOSITION WITH EIGHT SEEDS. The first pass gave every
   *   card the same blob under the same burst with a different random number, and eight cards
   *   of the same kind of thing at the same size average into ONE card — the exact failure the
   *   hero card recorded as "three pictures at 1:1 average into one". A seed is not authorship.
   * ⚠ WHICH composition goes on WHICH card is the artist's, not mine; these are eight distinct
   *   shapes so the sheet can be judged as a SET rather than as a batch. */
  function paintCard(g, i) {
    var card = CARDS[i], R = rnd(1000 + i * 37);
    var M = 12;                                   // the card's own inner margin, in texels
    var W = CW, H = CH, kind = i % 8;

    /* ── GROUND: the acid plate. One flat field per card, each a different figure. ── */
    g.fillStyle = ACID;
    if (kind === 0) {                                   // a horizon, high
      g.fillRect(-4, H * 0.13, W + 8, H * 0.40);
    } else if (kind === 1) {                            // a leaning column
      g.beginPath(); g.moveTo(W * 0.16, H * 0.86); g.lineTo(W * 0.40, H * 0.10);
      g.lineTo(W * 0.86, H * 0.16); g.lineTo(W * 0.62, H * 0.88); g.closePath(); g.fill();
    } else if (kind === 2) {                            // a stack of three slabs
      for (var s2 = 0; s2 < 3; s2++) g.fillRect(W * (0.08 + s2 * 0.04), H * (0.16 + s2 * 0.19), W * 0.80, H * 0.13);
    } else if (kind === 3) {                            // a burst, contained
      var bx = W * 0.5, by = H * 0.40;
      for (var s3 = 0; s3 < 13; s3++) {
        var a3 = s3 / 13 * Math.PI * 2;
        g.beginPath(); g.moveTo(bx, by);
        g.lineTo(bx + Math.cos(a3 - 0.10) * W * 0.62, by + Math.sin(a3 - 0.10) * W * 0.62);
        g.lineTo(bx + Math.cos(a3 + 0.10) * W * 0.62, by + Math.sin(a3 + 0.10) * W * 0.62);
        g.closePath(); g.fill();
      }
    } else if (kind === 4) {                            // a diagonal split
      g.beginPath(); g.moveTo(0, 0); g.lineTo(W, H * 0.30); g.lineTo(W, H * 0.72); g.lineTo(0, H * 0.42);
      g.closePath(); g.fill();
    } else if (kind === 5) {                            // an arch
      g.beginPath(); g.moveTo(W * 0.14, H * 0.80); g.lineTo(W * 0.14, H * 0.40);
      g.arc(W * 0.5, H * 0.40, W * 0.36, Math.PI, 0); g.lineTo(W * 0.86, H * 0.80); g.closePath(); g.fill();
    } else if (kind === 6) {                            // a checked field, wide gauge
      for (var cy6 = 0; cy6 < 6; cy6++) for (var cx6 = 0; cx6 < 4; cx6++)
        if ((cx6 + cy6) % 2 === 0) g.fillRect(W * (0.08 + cx6 * 0.21), H * (0.12 + cy6 * 0.10), W * 0.21, H * 0.10);
    } else {                                            // a lump
      blob(g, W * 0.48, H * 0.40, W * 0.46, 0.24, 13, 7 + i);
    }

    /* ── MID: the cyan plate, at ANOTHER scale and never concentric with the ground. ── */
    g.fillStyle = CYAN;
    if (kind === 0) { blob(g, W * 0.62, H * 0.30, W * 0.26, 0.18, 15, 40 + i); }
    else if (kind === 1) { for (var b1 = 0; b1 < 7; b1++) g.fillRect(W * 0.06, H * (0.20 + b1 * 0.085), W * (0.30 + R() * 0.6), 7); }
    else if (kind === 2) { blob(g, W * 0.30, H * 0.66, W * 0.30, 0.30, 11, 51 + i); }
    else if (kind === 3) { g.fillRect(W * 0.04, H * 0.52, W * 0.92, H * 0.10); g.fillRect(W * 0.20, H * 0.06, W * 0.16, H * 0.60); }
    else if (kind === 4) { for (var r4 = 0; r4 < 4; r4++) { g.beginPath(); g.arc(W * 0.5, H * 0.40, W * (0.12 + r4 * 0.11), 0, 6.284); g.lineWidth = 8; g.strokeStyle = CYAN; g.stroke(); } }
    else if (kind === 5) { g.fillRect(W * 0.30, H * 0.42, W * 0.40, H * 0.44); }
    else if (kind === 6) { blob(g, W * 0.52, H * 0.36, W * 0.34, 0.16, 17, 63 + i); }
    else { for (var s7 = 0; s7 < 5; s7++) g.fillRect(W * (0.10 + s7 * 0.17), H * 0.16, W * 0.09, H * (0.26 + R() * 0.42)); }

    /* ── KEY: the drawing, the rules, the words. All the linework rides the black plate. ── */
    g.fillStyle = KEY; g.strokeStyle = KEY; g.lineWidth = 3;
    g.strokeRect(M - 0.5, M - 0.5, W - M * 2 + 1, H - M * 2 + 1);       // the trim rule
    g.lineWidth = 1.4;
    g.strokeRect(M + 6.5, M + 6.5, W - M * 2 - 13, H - M * 2 - 13);     // and its hairline

    /* the number block, top-left, REVERSED OUT of a solid — a cereal-box card number */
    g.fillRect(M + 6, M + 6, 54, 40);
    g.save(); g.globalCompositeOperation = 'destination-out';
    drawText(g, card.n, M + 33, M + 38, 26, 'c');
    g.restore();
    g.fillStyle = KEY;

    /* a crude hand-set mark over the ground — different verb per card, same ink */
    if (kind % 3 === 0) { for (var q = 0; q < 4; q++) g.fillRect(W * 0.14 + R() * 12, H * (0.60 + q * 0.045), W * (0.24 + R() * 0.46), 6); }
    else if (kind % 3 === 1) { g.lineWidth = 6; g.beginPath(); g.moveTo(W * 0.16, H * 0.70); g.lineTo(W * 0.84, H * 0.62); g.stroke(); g.beginPath(); g.moveTo(W * 0.18, H * 0.76); g.lineTo(W * 0.70, H * 0.70); g.stroke(); }
    else { g.beginPath(); g.arc(W * 0.74, H * 0.66, W * 0.10, 0, 6.284); g.lineWidth = 7; g.stroke(); }

    /* the title, on the TAIL of the card, sitting on stock rather than on the artwork.
       ⚠ `ctx.rect(x, y, w, h)` takes a HEIGHT — passing the band's bottom edge here is what
       ran the hero card's title half onto the artwork, and it read as a colour choice. */
    g.fillStyle = KEY;
    g.fillRect(M + 6, H - M - 54, W - M * 2 - 12, 42);
    g.save(); g.globalCompositeOperation = 'destination-out';
    drawText(g, card.t, W / 2, H - M - 32, 17, 'c');
    drawText(g, card.s, W / 2, H - M - 17, 8.5, 'c');
    g.restore();
    g.fillStyle = KEY;
  }

  /* ══ 3 · THE FURNITURE — everything printed on the SHEET rather than on a card ══════════
   *   R = the foil mask (the slug: the one hot-stamped thing on the sheet)
   *   G = key-ink marks (crop marks, registration targets, the colour bar, the docket line)
   *   B = the perforation, as a shallow debossed crease
   * ⚑ FOIL GOES IN EXACTLY ONE PLACE, and that is a material decision rather than restraint
   *   for its own sake: a foil stamp is a separate pass on a separate press and it costs real
   *   money, so a sheet with foil everywhere is a sheet nobody printed. */
  var FW = 1024;
  function buildFurniture(sheetW, sheetH, lay) {
    var c = document.createElement('canvas');
    var px = FW / sheetW;                       // texels per world unit
    c.width = FW; c.height = Math.round(sheetH * px);
    var g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'lighter';
    var X = function (u) { return u * px; }, Y = function (v) { return c.height - v * px; };

    /* ── G: crop marks at every trim corner. A crop mark is OUTSIDE the trim and does not
     *    touch it — that gap is the whole tell that it is a printer's mark. */
    g.strokeStyle = '#00ff00'; g.lineWidth = Math.max(1, px * 0.006);
    var gap = 0.035, len = 0.085;
    for (var i = 0; i < NCELL; i++) {
      var r = cellRect(i, lay);
      [[r.x0, r.y0, -1, -1], [r.x1, r.y0, 1, -1], [r.x0, r.y1, -1, 1], [r.x1, r.y1, 1, 1]].forEach(function (m) {
        g.beginPath();
        g.moveTo(X(m[0] + m[2] * gap), Y(m[1])); g.lineTo(X(m[0] + m[2] * (gap + len)), Y(m[1]));
        g.moveTo(X(m[0]), Y(m[1] + m[3] * gap)); g.lineTo(X(m[0]), Y(m[1] + m[3] * (gap + len)));
        g.stroke();
      });
    }
    /* registration targets in the head margin — a circle with a cross through it */
    [0.22, 0.78].forEach(function (u) {
      var x = X(u * sheetW), y = Y(sheetH - MARGIN * 0.52), rr = px * 0.055;
      g.beginPath(); g.arc(x, y, rr, 0, 6.284); g.stroke();
      g.beginPath(); g.moveTo(x - rr * 1.7, y); g.lineTo(x + rr * 1.7, y);
      g.moveTo(x, y - rr * 1.7); g.lineTo(x, y + rr * 1.7); g.stroke();
    });
    /* the colour bar, down the fore-edge: eight solid patches of KEY-plate density */
    for (var b = 0; b < 8; b++) {
      var hgt = sheetH * 0.055;
      g.globalAlpha = 0.30 + b * 0.10;
      g.fillStyle = '#00ff00';
      g.fillRect(X(sheetW - MARGIN * 0.80), Y(sheetH * 0.20 + b * hgt) - hgt * px, MARGIN * 0.46 * px, hgt * px * 0.86);
    }
    g.globalAlpha = 1;
    /* the docket line, tail margin, small: what job this is */
    g.fillStyle = '#00ff00';
    drawText(g, 'JOB 3030 · 8 UP · 3 SPOT + FOIL · NOT FINAL ART', X(MARGIN), Y(TAIL * 0.24), px * 0.045, 'l');

    /* ── R: THE FOIL SLUG. One line, tail margin, centred. ⛔ The DOM carries this string as
     *    TEXT as well — a canvas-only name is a bitmap of the name, which is exactly how the
     *    retired studio name survived a 258-file rename. */
    g.fillStyle = '#ff0000';
    drawText(g, 'RIPMASTER3030STUDIOS', X(sheetW / 2), Y(TAIL * 0.52), px * 0.155, 'c');
    g.fillRect(X(MARGIN), Y(TAIL * 0.66), (sheetW - MARGIN * 2) * px, Math.max(1, px * 0.008));

    /* ── B: the perforation. A rule of dots down every gutter midline, debossed. */
    g.fillStyle = '#0000ff';
    var perfs = gutterLines(lay, sheetW, sheetH);
    perfs.forEach(function (L) {
      var n = Math.round(L.len / 0.028);
      for (var k = 0; k < n; k++) {
        var t = (k + 0.5) / n;
        var ux = L.x0 + (L.x1 - L.x0) * t, uy = L.y0 + (L.y1 - L.y0) * t;
        g.fillRect(X(ux) - px * 0.006, Y(uy) - px * 0.006, px * 0.012, px * 0.012);
      }
    });
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  /* ── the lay: where every card sits on the sheet ──────────────────────────────────────── */
  function layout(landscape) {
    var cols = landscape ? 4 : 2, rows = NCELL / (landscape ? 4 : 2);
    return {
      cols: cols, rows: rows,
      w: cols * CARD_W + (cols - 1) * GUTTER + MARGIN * 2,
      h: rows * CARD_H + (rows - 1) * GUTTER + MARGIN + TAIL
    };
  }
  function cellRect(i, lay) {
    var cx = i % lay.cols, cy = (i / lay.cols) | 0;
    var x0 = MARGIN + cx * (CARD_W + GUTTER);
    var y0 = TAIL + (lay.rows - 1 - cy) * (CARD_H + GUTTER);
    return { x0: x0, y0: y0, x1: x0 + CARD_W, y1: y0 + CARD_H };
  }
  function gutterLines(lay, W, H) {
    var out = [], i;
    for (i = 1; i < lay.cols; i++) {
      var x = MARGIN + i * (CARD_W + GUTTER) - GUTTER / 2;
      out.push({ x0: x, y0: TAIL, x1: x, y1: H - MARGIN, len: H - MARGIN - TAIL });
    }
    for (i = 1; i < lay.rows; i++) {
      var y = TAIL + i * (CARD_H + GUTTER) - GUTTER / 2;
      out.push({ x0: MARGIN, y0: y, x1: W - MARGIN, y1: y, len: W - MARGIN * 2 });
    }
    return out;
  }

  /* ══ 4 · THE LATTICE ════════════════════════════════════════════════════════════════════
   * One mesh. Each vertex carries (cell, w) and the card-local coordinate, where the local
   * coordinate CONTINUES PAST THE TRIM into the web — so "is this vertex inside a card" is
   * derivable rather than a fourth attribute, and the web between two cards is genuinely a
   * shared piece of paper that whichever card moves drags on. */
  function buildLattice(lay) {
    var W = lay.w, H = lay.h;
    var xs = axis(lay.cols, MARGIN, MARGIN, CARD_W, 8, W);
    var ys = axis(lay.rows, TAIL, MARGIN, CARD_H, 12, H);
    var nx = xs.length, ny = ys.length, n = nx * ny;
    var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    var uv0 = new Float32Array(n * 2), rig = new Float32Array(n * 2), loc = new Float32Array(n * 2);
    var cell = new Int32Array(n), att = new Float32Array(n);

    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      var k = j * nx + i, x = xs[i], y = ys[j];
      /* nearest card, and how far outside its trim we are */
      var best = 0, bd = 1e9, lu = 0, lv = 0;
      for (var c = 0; c < NCELL; c++) {
        var r = cellRect(c, lay);
        var dx = Math.max(r.x0 - x, 0, x - r.x1), dy = Math.max(r.y0 - y, 0, y - r.y1);
        var d = Math.hypot(dx, dy);
        if (d < bd) { bd = d; best = c; lu = (x - r.x0) / CARD_W; lv = (y - r.y0) / CARD_H; }
      }
      cell[k] = best;
      /* attachment: 1 inside the trim, smoothly to 0 by FALLOFF into the web. That ramp is
         the paper between two cards; the kink it leaves on the gutter midline IS the perf. */
      var t = Math.min(1, bd / FALLOFF); att[k] = 1 - t * t * (3 - 2 * t);
      pos[k * 3] = x - W / 2; pos[k * 3 + 1] = y - H / 2; pos[k * 3 + 2] = 0;
      nor[k * 3 + 2] = 1;
      uv0[k * 2] = x / W; uv0[k * 2 + 1] = y / H;
      rig[k * 2] = best + 0.5; rig[k * 2 + 1] = att[k];
      loc[k * 2] = lu; loc[k * 2 + 1] = lv;
    }
    var idx = [];
    for (var jj = 0; jj < ny - 1; jj++) for (var ii = 0; ii < nx - 1; ii++) {
      var a = jj * nx + ii, b = a + 1, cc = a + nx, d2 = cc + 1;
      idx.push(a, cc, b, b, cc, d2);
    }
    return { nx: nx, ny: ny, n: n, pos: pos, rest: pos.slice(), nor: nor, uv0: uv0, rig: rig,
             loc: loc, cell: cell, att: att, idx: idx, W: W, H: H };
  }
  /** subdivision points along one axis: margins, cards, gutters */
  function axis(count, lo, hi, size, sub, total) {
    var out = [], i, k;
    for (i = 0; i <= 3; i++) out.push(lo * i / 3);
    for (i = 0; i < count; i++) {
      var s = lo + i * (size + GUTTER);
      for (k = 1; k <= sub; k++) out.push(s + size * k / sub);
      if (i < count - 1) for (k = 1; k <= 4; k++) out.push(s + size + GUTTER * k / 4);
    }
    var e = lo + count * size + (count - 1) * GUTTER;
    for (k = 1; k <= 3; k++) out.push(e + (total - e) * k / 3);
    return out.filter(function (v, i2, a) { return i2 === 0 || v - a[i2 - 1] > 1e-6; });
  }

  /* ══ 5 · THE RIG ════════════════════════════════════════════════════════════════════════
   * Per card: one spring (q, v), a press depth, and a tear that only ever goes forward —
   * paper does not un-tear, and that one-way property is what makes the sheet a record of
   * what you did to it rather than a toy that resets.
   *
   * ⚑ The assertions that bite are NOT "did it move" (a global transform passes that):
   *     · different cards move by different amounts, and the sign flips across the contact
   *     · a release OVERSHOOTS                              (kills a lerp)
   *     · card n+2 reacts LATER than n+1                    (kills eight independent springs)
   *     · at rest every vertex is EXACTLY at its rest position (kills an idle loop) */
  var K = 118, D = 9.2;            // spring: omega 10.9, zeta 0.42 — under-damped, so it rings
  var COUPLE = 38;                 // through the web, while the web is still there
  var TEAR_HOLD = 0.16;            // lift at which the perforation starts to give
  var TEAR_RATE = 2.35;            // how fast it runs once it has started

  function newState() {
    var s = [];
    for (var i = 0; i < NCELL; i++) s.push({ q: 0, v: 0, press: 0, tear: 0, fly: 0, hx: 1, hy: 0, gone: 0 });
    return s;
  }

  function neighbours(i, lay) {
    var cx = i % lay.cols, cy = (i / lay.cols) | 0, out = [];
    if (cx > 0) out.push(i - 1);
    if (cx < lay.cols - 1) out.push(i + 1);
    if (cy > 0) out.push(i - lay.cols);
    if (cy < lay.rows - 1) out.push(i + lay.cols);
    return out;
  }

  /* ══ 6 · SHADERS ════════════════════════════════════════════════════════════════════════ */
  var VS = [
    'attribute vec3 vertex_position;',
    'attribute vec3 vertex_normal;',
    'attribute vec2 vertex_texCoord0;',   // sheet uv, at REST
    'attribute vec2 vertex_texCoord1;',   // (cell + 0.5, attachment)
    'attribute vec2 vertex_texCoord2;',   // card-local, continues past the trim
    'uniform mat4 matrix_model;',
    'uniform mat4 matrix_viewProjection;',
    'uniform mat3 matrix_normal;',
    'varying vec2 vUv; varying vec2 vLocal; varying vec2 vRig; varying vec3 vN; varying vec3 vWP;',
    'void main(){',
    '  vUv = vertex_texCoord0; vLocal = vertex_texCoord2; vRig = vertex_texCoord1;',
    '  vN = normalize(matrix_normal * vertex_normal);',
    '  vec4 wp = matrix_model * vec4(vertex_position, 1.0);',
    '  vWP = wp.xyz;',
    '  gl_Position = matrix_viewProjection * wp;',
    '}'
  ].join('\n');

  /* ⚠ vUv is the REST position and must stay that way. It drives the grating phase and the
   *   paper's fibre — both are properties EMBOSSED IN the sheet. Feed it the moved position
   *   and the diffraction pattern slides across the foil as the sheet bends, which is the v1
   *   sticker bug wearing a rig's clothes. The NORMAL is the opposite: it must take the
   *   displacement, or a surface can turn without its hue walking. */
  var FS = [
    'precision highp float;',
    'varying vec2 vUv; varying vec2 vLocal; varying vec2 vRig; varying vec3 vN; varying vec3 vWP;',
    'uniform sampler2D uFurn; uniform sampler2D uPlate;',
    'uniform vec2 uAtlas;',            // cols, rows
    'uniform vec3 uPaper; uniform float uPaperGain;',
    'uniform vec3 uLA; uniform vec3 uLB; uniform vec3 uKeyCol; uniform vec2 uKeyI;',
    'uniform vec3 uFillD; uniform vec3 uFillCol;',
    'uniform vec3 uRimD;  uniform vec3 uRimCol;',
    'uniform vec3 uEye;',
    'uniform float uGrating; uniform float uScreen; uniform float uTearVis;',
    /* ⚑ AN ISOLATION SWITCH, and it is an instrument rather than a style knob. 1 = foil only,
       2 = print only. "Isolate before tuning" is this repo's own rule and it is what proved
       the card's wash was a colour-path bug and not a lighting one; here it is what lets the
       acceptance harness measure the FOIL's hue without the paper under it voting. */
    'uniform float uIso;',
    'uniform vec4 uCellA[8];',         // q, tear, grabU, grabV
    'uniform vec4 uCellB[8];',         // hingeX, hingeY, fly, gone
    'const float PI = 3.14159265;',
    /* the six stops, wrapped so the sweep never leaves the site's palette */
    'vec3 pal(float t){',
    '  t = fract(t) * 6.0; float i = floor(t); float f = t - i;',
    '  vec3 c[6];',
    '  c[0]=vec3(0.918,1.000,0.949); c[1]=vec3(0.169,1.000,0.502); c[2]=vec3(0.153,0.969,0.894);',
    '  c[3]=vec3(0.478,0.659,1.000); c[4]=vec3(1.000,0.165,0.851); c[5]=vec3(1.000,0.824,0.231);',
    '  int a = int(i); int b = int(mod(i+1.0,6.0));',
    '  vec3 A=c[0], B=c[0];',
    '  for(int k=0;k<6;k++){ if(k==a) A=c[k]; if(k==b) B=c[k]; }',
    '  return mix(A,B,f*f*(3.0-2.0*f));',
    '}',
    'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
    /* ⚑ PAPER TOOTH IS FIBRES, NOT NOISE. Pulp lies down in the machine direction, so the
       cells are stretched along x and a raking light catches them as short streaks. */
    /* ⚠ AND IT MUST FADE OUT WHEN A FIBRE IS SMALLER THAN A PIXEL. A procedural hash has no
       mipmap to fall back on, so under-sampled fibre stops being paper and becomes chroma
       speckle — the same defect the hero card's un-mipped plates had, a different cause. Relief
       you cannot resolve should FLATTEN, not sparkle. */
    'float tooth(vec2 uv){',
    '  vec2 p = uv * vec2(430.0, 108.0);',
    '  float a = h21(floor(p)); float b = h21(floor(p*vec2(2.1,1.9))+37.0);',
    '  float f = a*0.66 + b*0.34;',
    '  float cell = max(fwidth(p.x), fwidth(p.y));',
    '  return mix(f, 0.5, smoothstep(0.45, 1.05, cell));',
    '}',
    /* one plate, screened at its own angle. Falls back to a flat tint when the cell drops
       under ~2.5 device pixels — relief you cannot resolve should flatten, not sparkle. */
    'float screen(float cov, vec2 uv, float ang, float ruling){',
    '  float s=sin(ang), c=cos(ang);',
    '  vec2 r = vec2(uv.x*c - uv.y*s, uv.x*s + uv.y*c) * ruling;',
    '  vec2 g = fract(r) - 0.5;',
    '  float d = length(g);',
    '  float rad = sqrt(clamp(cov,0.0,1.0)) * 0.60;',
    '  float aa = max(fwidth(d), 0.001) * 1.1;',
    '  float dotv = smoothstep(rad + aa, rad - aa, d);',
    '  float cell = max(fwidth(r.x), fwidth(r.y));',
    '  float vis = (1.0 - smoothstep(0.26, 0.52, cell)) * uScreen;',
    '  return mix(cov, dotv, vis);',
    '}',
    'void main(){',
    '  int ci = int(vRig.x);',
    '  vec4 A = uCellA[0]; vec4 B = uCellB[0];',
    '  for(int k=0;k<8;k++){ if(k==ci){ A=uCellA[k]; B=uCellB[k]; } }',
    '  float inCard = step(0.0, vLocal.x)*step(vLocal.x,1.0)*step(0.0,vLocal.y)*step(vLocal.y,1.0);',
    /* ⚠ A 2D CANVAS COUNTS Y DOWNWARD AND A UV COUNTS V UPWARD. Handing the sheet uv straight
         to the texture printed the whole sheet mirror-image — every card upside down and the
         studio slug reversed, which read as a compositing bug and was a coordinate one. One
         flip, in one place, for every texture on this surface. */
    '  vec2 fuv = vec2(vUv.x, 1.0 - vUv.y);',
    /* ── the plates. THREE CONSTANT VECTORS, one per plate: a press has no idea where the
         centre of the sheet is, so the offset cannot be radial. That is what separates
         mis-registration from chromatic aberration, and getting it wrong reads as a cheap
         camera instead of a cheap print. */
    '  vec2 cellUV = vec2(clamp(vLocal.x, 0.0, 1.0), 1.0 - clamp(vLocal.y, 0.0, 1.0));',
    '  vec2 base = (vec2(mod(float(ci), uAtlas.x), floor(float(ci)/uAtlas.x)) + cellUV) / uAtlas;',
    '  vec2 sx = vec2(1.0/uAtlas.x, 1.0/uAtlas.y);',
    '  float cM = texture2D(uPlate, base + vec2( 0.0030, -0.0016)*sx*8.0).r;',
    '  float cC = texture2D(uPlate, base + vec2(-0.0022,  0.0026)*sx*8.0).g;',
    '  float cK = texture2D(uPlate, base).b;',
    '  cM *= inCard; cC *= inCard; cK *= inCard;',
    '  vec4 furn = texture2D(uFurn, fuv);',
    '  cK = max(cK, furn.g);',                          // the sheet's own marks print in KEY
    /* ⚠ THE RULING WAS WRONG BY AN OCTAVE IN BOTH DIRECTIONS ON THE HERO CARD — at one end the
         dots become the picture, at the other they alias into a moiré grid, which is a
         RENDERING failure dressed as a print one. 190 across the sheet is ~40 cells per card
         width: a coarse screen, which is what a cheap card sheet actually carries. */
    '  cM = screen(cM, fuv, 0.2618, 190.0);',           // 15 degrees
    '  cC = screen(cC, fuv, 1.3090, 190.0);',           // 75 degrees
    '  cK = screen(cK, fuv, 0.7854, 190.0);',           // 45 degrees
    /* ── ink MULTIPLIES the stock's reflectance. Never adds. One line, and it is what keeps
         this a printed object rather than a screen. */
    '  float fib = tooth(fuv);',
    '  vec3 paper = uPaper * uPaperGain * (0.90 + 0.10*fib);',
    '  vec3 T = vec3(1.0);',
    '  T *= mix(vec3(1.0), vec3(0.98,0.11,0.86), cM);',
    '  T *= mix(vec3(1.0), vec3(0.10,0.92,0.90), cC);',
    '  T *= mix(vec3(1.0), vec3(0.065,0.070,0.062), cK);',
    '  vec3 albedo = paper * T;',
    /* ── the surface. Fibre and the perforation deboss perturb the normal. */
    /* ⚑ A CREASE IS WIDE AND SHALLOW. Pushed hard it renders as a SCRATCH — the height field
         swings past the terminator inside one texel and a fold comes out as a black line. The
         perforation is a rule of shallow debossed dots and reads as relief, not as damage. */
    '  vec3 N = normalize(vN);',
    '  vec2 e = vec2(0.0016, 0.0);',
    '  float t0 = tooth(fuv), tx = tooth(fuv+e.xy), ty = tooth(fuv+e.yx);',
    '  float p0 = texture2D(uFurn, fuv).b;',
    '  float pxq = texture2D(uFurn, fuv+e.xy).b, pyq = texture2D(uFurn, fuv+e.yx).b;',
    '  N = normalize(N + vec3(-(tx-t0)*0.85 - (pxq-p0)*0.35, (ty-t0)*0.85 + (pyq-p0)*0.35, 0.0));',
    '  vec3 V = normalize(uEye - vWP);',
    '  vec3 LA = normalize(uLA - vWP), LB = normalize(uLB - vWP);',
    /* ⚠ the lights are in WORLD space. Hand them an object-space normal and the key turns
         with the sheet, which is printed-on shading wearing a material's clothes. */
    '  float dA = max(dot(N, LA), 0.0), dB = max(dot(N, LB), 0.0);',
    '  float dF = max(dot(N, normalize(uFillD)), 0.0);',
    '  float dR = max(dot(N, normalize(uRimD)), 0.0);',
    /* ⚠ Lambert is albedo/PI, so the PI has to go back into the light or the whole thing
         reads as a broken shader (recorded on the hero card). It is folded into uKeyI. */
    '  vec3 lit = albedo * (uKeyCol*(uKeyI.x*dA + uKeyI.y*dB) + uFillCol*0.42*dF);',
    '  float fres = pow(1.0 - max(dot(N,V),0.0), 3.0);',
    '  lit += albedo * uRimCol * (0.55*dR*fres);',
    '  lit += albedo * 0.085;',                          // bounce off the bed
    '  vec3 hA = normalize(LA + V);',
    '  lit += uKeyCol * 0.038 * pow(max(dot(N,hA),0.0), 26.0) * (0.35 + 0.65*fib);',
    /* ── THE FOIL. Thin metal: no diffuse, specular tinted by the metal, and a ruled grating
         makes that tint a function of the HALF-ANGLE. So the colour arrives THROUGH the
         lighting rather than as a tint laid over the finished pixel — a rainbow painted on a
         face is a sticker OF foil. */
    '  float f = furn.r;',
    '  if (f > 0.003) {',
    '    vec2 G = normalize(vec2(0.94, 0.34));',        // the rule direction of the stamping die
    /* ⚠ vUv is the REST position and this is why: the ruling is EMBOSSED IN the foil. Feed it
         the moved position and the diffraction pattern slides across the letters as the sheet
         bends, which is the v1 sticker bug wearing a rig. */
    '    float embossed = dot(vUv * vec2(30.0, 30.0), G);',
    /* ⚠ 62, not 26. The pitch of the ruling IS the strength of the diffraction: a coarse
         grating walks its hue a few degrees across a whole head-turn, which measured out at
         99° of travel against the shipped wordmark's 261°. A hot-stamped holographic foil is
         ruled very fine. Pushed much past this the colour breaks up between texels and the
         letters read as noise rather than as metal — the same "wrong by an octave in both
         directions" trap as the halftone ruling. */
    '    float phA = embossed + dot(hA, vec3(G, 0.0)) * 62.0 * uGrating;',
    '    vec3 F0 = pal(phA);',
    /* ⚑ ANISOTROPIC, because a ruled grating smears its highlight PERPENDICULAR to the rules
         and keeps it tight along them. An isotropic lobe is a shiny dot, and a shiny dot is
         what "premium CG" looks like. */
    '    float NdH = max(dot(N, hA), 0.0);',
    '    vec3 tang = normalize(hA - N * NdH + vec3(1e-5));',
    '    float across = abs(dot(tang.xy, vec2(-G.y, G.x)));',
    '    float spec = pow(NdH, mix(96.0, 11.0, across)) * (1.1 + 3.4 * across);',
    '    float sch = 0.06 + 0.94 * pow(1.0 - max(dot(N,V),0.0), 5.0);',
    /* ⛔ "METAL" IS NOT "SHINY", AND THE FIRST BUILD PROVED IT THE HARD WAY: a foil stamp has
         no diffuse at all, so in a room with nothing in it the slug renders BLACK. It looked
         like a broken mask and it was correct physics with an empty room. A metal has exactly
         two sources — the lights and the room — so the room has to actually contain the two
         lamps rather than one abstract horizon band.
       ⚑ And the scoping is the load-bearing part: METAL MAY REFLECT THE ROOM, THE ARTWORK
         NEVER DOES. That is card3d.js's most expensive recorded bug turned into a structure
         instead of an intention — an env map on a flat printed face lands as ambient specular,
         i.e. a milky wash that lifts blacks and eats saturation. */
    '    vec3 Rv = reflect(-V, N);',
    '    vec3 room = mix(vec3(0.014,0.030,0.020), uKeyCol*0.55, smoothstep(0.30, 0.95, Rv.y));',
    '    room += uKeyCol * 0.62 * pow(max(dot(Rv, LA), 0.0), 13.0);',
    '    room += uKeyCol * 0.50 * pow(max(dot(Rv, LB), 0.0), 13.0);',
    '    room += uRimCol * 0.20 * pow(max(dot(Rv, normalize(uRimD)), 0.0), 8.0);',
    '    vec3 metal = F0 * (uKeyCol * spec * (uKeyI.x + uKeyI.y) * 0.42 + room * (0.30 + 0.80*sch));',
    '    lit = mix(lit, metal, f);',
    '    if (uIso > 0.5 && uIso < 1.5) lit = metal * step(0.5, f);',
    '  }',
    '  if (uIso > 0.5 && uIso < 1.5 && f <= 0.5) lit = vec3(0.0);',
    '  if (uIso > 1.5) lit *= (1.0 - step(0.003, f));',
    /* the torn edge: a fibrous lip, brighter where the paper broke. NOT a die-cut chamfer —
       a die edge is clean and a tear is not, and that difference is the sheet's most specific
       material claim. */
    '  float edge = (1.0 - inCard) * A.y * uTearVis;',
    '  lit += vec3(0.55,0.52,0.44) * edge * 0.20 * (0.4 + 0.6*fib);',
    /* ⛔ THE HIGHLIGHT ROLLOFF, CARRIED OVER RATHER THAN RE-LEARNED. This is an LDR target and
       metal specular runs past 1.0, so without a knee the GPU clips it to flat white — and the
       first build clipped the PAPER too, which is how the ink-multiply acceptance test read
       0.68 instead of 0.50: you cannot halve something that is already pinned at the ceiling.
       ⚑ GfxPost's knee was SWEPT, not guessed, and 0.94 was the value that removed 100% of the
       clipping for free; lower is not safer, just darker. Same number, same reason, new
       surface — an engine replaces the FUNCTION, not the TUNING. */
    '  float kn = 0.94;',
    '  lit = mix(lit, kn + (1.0 - kn) * (1.0 - exp(-(lit - kn) / max(1.0 - kn, 1e-4))), step(kn, lit));',
    '  gl_FragColor = vec4(pow(max(lit, 0.0), vec3(1.0/2.2)), 1.0);',
    '}'
  ].join('\n');

  /* the press bed — dark rolled rubber, plus the sheet's own contact shadow. Everything sits
     ON something; a printed object always has a surface under it (DESIGN-SYSTEM §5). */
  var BED_VS = [
    'attribute vec3 vertex_position; attribute vec2 vertex_texCoord0;',
    'uniform mat4 matrix_model; uniform mat4 matrix_viewProjection;',
    'varying vec2 vUv; varying vec3 vWP;',
    'void main(){ vUv = vertex_texCoord0; vec4 wp = matrix_model*vec4(vertex_position,1.0); vWP = wp.xyz;',
    '  gl_Position = matrix_viewProjection * wp; }'
  ].join('\n');
  var BED_FS = [
    'precision highp float;',
    'varying vec2 vUv; varying vec3 vWP;',
    'uniform vec2 uHalf; uniform vec3 uKeyCol; uniform vec3 uFillCol;',
    'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
    'void main(){',
    '  vec2 q = (vUv - 0.5) * 2.0;',
    '  float grain = h21(floor(vUv*1400.0))*0.010;',
    '  float vig = 1.0 - smoothstep(0.10, 1.10, length(q));',
    /* rolled rubber: near-black, so the sheet is the only bright thing in the frame
       (DESIGN-SYSTEM §5 — dark field, lit object, and the blacks stay black) */
    '  vec3 bed = (vec3(0.0092,0.0128,0.0104) + grain) * (0.30 + 0.70*vig);',
    '  bed += uFillCol * 0.0085 * vig;',
    '  bed += uKeyCol * 0.0075 * smoothstep(0.9, -0.3, q.y);',
    /* ⚑ THE CONTACT SHADOW IS WHAT MAKES THE SHEET SIT ON SOMETHING. Both keys are ABOVE, so
       the shadow drops straight down and it is soft, because two broad lamps do not cast a
       hard edge. `uHalf` is the fraction of the bed the sheet covers, so it cannot drift when
       the imposition changes. */
    '  vec2 s = abs(vec2(q.x, q.y + uHalf.y*0.16)) / uHalf;',
    '  float sd = max(s.x, s.y);',
    '  float sh = 1.0 - 0.80 * (1.0 - smoothstep(0.86, 1.42, sd));',
    '  gl_FragColor = vec4(pow(max(bed*sh,0.0), vec3(1.0/2.2)), 1.0);',
    '}'
  ].join('\n');

  /* ══ 7 · MOUNT ══════════════════════════════════════════════════════════════════════════ */
  var _enginePromise = null;
  function engine() {
    if (global.pc) return Promise.resolve(global.pc);
    if (_enginePromise) return _enginePromise;
    _enginePromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = url('vendor/playcanvas/playcanvas.min.js');
      s.onload = function () { global.pc ? res(global.pc) : rej(new Error('no pc')); };
      s.onerror = function () { rej(new Error('engine blocked')); };
      document.head.appendChild(s);
    });
    return _enginePromise;
  }
  function webgl2() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2'));
    } catch (e) { return false; }
  }

  function mount(host, opts) {
    opts = opts || {};
    if (!host || !webgl2()) return Promise.resolve(null);
    return Promise.all([engine(), loadType()])
      .then(function (r) { return build(host, opts, r[0]); })
      .catch(function (e) { try { console.warn('[sheet3d]', e && e.message); } catch (x) {} return null; });
  }

  function build(host, opts, pc) {
    var canvas = document.createElement('canvas');
    canvas.className = 'sheet-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    var reduced = false;
    try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var dprCap = 2;
    try { if (global.GfxPost && GfxPost.dprCap) dprCap = GfxPost.dprCap(); } catch (e) {}

    var device = null, app = null;
    try {
      app = new pc.AppBase(canvas);
    } catch (e) { return null; }

    return pc.createGraphicsDevice(canvas, {
      deviceTypes: ['webgl2'], antialias: true, alpha: false,
      preserveDrawingBuffer: !!opts.readback, powerPreference: 'high-performance'
    }).then(function (d) {
      device = d;
      app.init({
        graphicsDevice: d,
        componentSystems: [pc.RenderComponentSystem, pc.CameraComponentSystem],
        resourceHandlers: []
      });
      app.setCanvasFillMode(pc.FILLMODE_NONE);
      app.setCanvasResolution(pc.RESOLUTION_AUTO);
      app.autoRender = false;                      // the clock is ours — see DETERMINISM
      app.start();

      var landscape = host.clientWidth >= host.clientHeight * 1.02;
      var lay = layout(landscape);
      var L = buildLattice(lay);
      var st = newState();

      /* ── textures ── */
      function tex(canvasSrc, aniso) {
        var t = new pc.Texture(device, {
          width: canvasSrc.width, height: canvasSrc.height,
          format: pc.PIXELFORMAT_SRGBA8 ? pc.PIXELFORMAT_RGBA8 : pc.PIXELFORMAT_RGBA8,
          mipmaps: true, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
          minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR
        });
        t.setSource(canvasSrc);
        try { t.anisotropy = aniso || 8; } catch (e) {}
        return t;
      }
      /* ⚠ MIPPED, DELIBERATELY. The plates are minified hard at sheet scale, and an unmipped
         minified plate takes one arbitrary texel per pixel — which lands as fine chroma
         speckle and reads exactly like a broken material (recorded on the hero card). */
      var atlasCols = 4, atlasRows = Math.ceil(NCELL / 4);
      var texPlate = tex(buildPlates(atlasCols, atlasRows));
      var texFurn = tex(buildFurniture(lay.w, lay.h, lay));

      /* ── the sheet mesh ── */
      var mesh = new pc.Mesh(device);
      mesh.setPositions(L.pos);
      mesh.setNormals(L.nor);
      mesh.setUvs(0, L.uv0);
      mesh.setVertexStream(pc.SEMANTIC_TEXCOORD1, L.rig, 2);
      mesh.setVertexStream(pc.SEMANTIC_TEXCOORD2, L.loc, 2);
      mesh.setIndices(L.idx);
      mesh.update(pc.PRIMITIVE_TRIANGLES);

      var mat = new pc.ShaderMaterial({
        uniqueName: 'ripSheet',
        attributes: {
          vertex_position: pc.SEMANTIC_POSITION, vertex_normal: pc.SEMANTIC_NORMAL,
          vertex_texCoord0: pc.SEMANTIC_TEXCOORD0, vertex_texCoord1: pc.SEMANTIC_TEXCOORD1,
          vertex_texCoord2: pc.SEMANTIC_TEXCOORD2
        },
        vertexGLSL: VS, fragmentGLSL: FS
      });
      mat.cull = pc.CULLFACE_NONE;
      mat.setParameter('uPlate', texPlate);
      mat.setParameter('uFurn', texFurn);
      mat.setParameter('uAtlas', [atlasCols, atlasRows]);
      mat.setParameter('uPaper', [0.905, 0.876, 0.806]);     // warm off-white stock
      mat.setParameter('uPaperGain', 1.0);
      mat.setParameter('uGrating', 1.0);
      mat.setParameter('uScreen', 1.0);
      mat.setParameter('uTearVis', 1.0);
      mat.setParameter('uIso', 0.0);
      mat.update();

      var root = new pc.Entity('sheetRoot');
      app.root.addChild(root);
      /* the bed is a drafting table: the sheet is laid back 15 degrees, not standing up.
         A sheet dead-on to camera is a poster; a sheet on a bed is an object. */
      root.setLocalEulerAngles(-15, 0, 0);

      var sheetE = new pc.Entity('sheet');
      sheetE.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: false });
      root.addChild(sheetE);

      /* ── the bed ── */
      var BEDX = 2.4;                      // the bed runs well past the sheet on every side
      var bedMesh = (pc.Mesh.fromGeometry && pc.PlaneGeometry)
        ? pc.Mesh.fromGeometry(device, new pc.PlaneGeometry({ halfExtents: new pc.Vec2(L.W * BEDX, L.H * BEDX) }))
        : null;
      var bedMat = new pc.ShaderMaterial({
        uniqueName: 'ripBed',
        attributes: { vertex_position: pc.SEMANTIC_POSITION, vertex_texCoord0: pc.SEMANTIC_TEXCOORD0 },
        vertexGLSL: BED_VS, fragmentGLSL: BED_FS
      });
      /* the sheet's footprint as a fraction of the bed's own -1..1 space, so the shadow tracks
         the imposition rather than a number somebody typed once for a 4-up lay */
      bedMat.setParameter('uHalf', [1 / (2 * BEDX), 1 / (2 * BEDX)]);
      bedMat.update();
      if (bedMesh) {
        var bedE = new pc.Entity('bed');
        bedE.addComponent('render', { meshInstances: [new pc.MeshInstance(bedMesh, bedMat)] });
        bedE.setLocalEulerAngles(90, 0, 0);       // PlaneGeometry lies in XZ; stand it up
        bedE.setLocalPosition(0, 0, -0.28);
        root.addChild(bedE);
      }

      /* ── camera ── */
      var cam = new pc.Entity('cam');
      var FOV = 33;
      cam.addComponent('camera', {
        clearColor: new pc.Color(0.0078, 0.0314, 0.0157, 1), fov: FOV, nearClip: 0.1, farClip: 60
      });
      app.root.addChild(cam);
      var camYaw = 0, camPitch = 0, camDist = 1;

      function frameSheet() {
        var w = Math.max(1, canvas.width), h = Math.max(1, canvas.height);
        var aspect = w / h;
        var vh = 2 * Math.tan(FOV * Math.PI / 360);
        var need = Math.max((L.H * 1.10) / vh, (L.W * 1.10) / (vh * aspect));
        camDist = need;
        placeCam();
      }
      function placeCam() {
        var cy = Math.cos(camYaw), sy = Math.sin(camYaw), cp = Math.cos(camPitch), sp = Math.sin(camPitch);
        cam.setPosition(sy * cp * camDist, sp * camDist, cy * cp * camDist);
        cam.lookAt(0, 0, 0);
      }

      /* ── the light rig, in WORLD space ────────────────────────────────────────────────────
       * KEY  — the marquee. TWO warm lamps, raking, at the positions the landing page's two
       *        torches already occupy. They flicker, because a flame is a combustion.
       * FILL — phosphor green, weak, low and front: the terminal glow beside the bed.
       * RIM  — cyan, near-grazing: what picks a die edge and a torn edge out of the dark. */
      var torchA = [-L.W * 0.62, L.H * 0.40, 2.1], torchB = [L.W * 0.62, L.H * 0.40, 2.1];
      var KEYCOL = [1.0, 0.824, 0.435], FILLCOL = [0.169, 1.0, 0.502], RIMCOL = [0.153, 0.969, 0.894];
      mat.setParameter('uKeyCol', KEYCOL);
      mat.setParameter('uFillCol', FILLCOL);
      mat.setParameter('uRimCol', RIMCOL);
      mat.setParameter('uFillD', [0.0, -0.55, 0.84]);
      mat.setParameter('uRimD', [0.0, 0.72, -0.70]);
      bedMat.setParameter('uKeyCol', KEYCOL);
      bedMat.setParameter('uFillCol', FILLCOL);

      /* ── pointer ── */
      var px = 0, py = 0, down = false, held = -1, lastX = 0, lastY = 0, hover = -1;
      var parX = 0, parY = 0;            // viewer parallax — the VIEWER moved, not the sheet
      var flicker = true, simT = 0;

      /* raycast the pointer onto the sheet's own plane and return card-space coordinates */
      var _m = new pc.Mat4(), _v = new pc.Vec3(), _o = new pc.Vec3(), _d = new pc.Vec3();
      function pick(nx, ny) {
        var camPos = cam.getPosition();
        var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
        var sx = (nx * 0.5 + 0.5) * w, sy = (0.5 - ny * 0.5) * h;
        var far = cam.camera.screenToWorld(sx, sy, 10);
        _m.copy(root.getWorldTransform()); _m.invert();
        _m.transformPoint(camPos, _o);
        _m.transformPoint(far, _v);
        _d.sub2(_v, _o);
        if (Math.abs(_d.z) < 1e-6) return null;
        var t = -_o.z / _d.z;
        if (t < 0) return null;
        var X = _o.x + _d.x * t + L.W / 2, Y = _o.y + _d.y * t + L.H / 2;
        for (var i = 0; i < NCELL; i++) {
          var r = cellRect(i, lay);
          if (X >= r.x0 && X <= r.x1 && Y >= r.y0 && Y <= r.y1)
            return { cell: i, u: (X - r.x0) / CARD_W, v: (Y - r.y0) / CARD_H };
        }
        return null;
      }

      function pointer(nx, ny, isDown) {
        var wasDown = down;
        px = nx; py = ny;
        parX = nx; parY = ny;
        var hit = pick(nx, ny);
        hover = hit ? hit.cell : -1;
        if (isDown && !wasDown) {
          held = hit ? hit.cell : -1;
          if (held >= 0) {
            st[held].grabU = hit.u; st[held].grabV = hit.v;
            /* the hinge is the trim edge the grab is FURTHEST from: you tear away from where
               you are holding, so the paper gives on the far side first. */
            var hx = hit.u < 0.5 ? 1 : -1;
            st[held].hx = hx; st[held].hy = 0;
          }
          lastX = nx; lastY = ny;
        }
        if (isDown && held >= 0) {
          /* ⚑ ONE RULE, NO DEVICE BRANCH: the pull is the drag ACROSS the perforation, i.e.
             mostly horizontal. That is how you take a card off an uncut sheet you are
             holding, and it is what leaves `touch-action:pan-y` free to scroll the page — a
             hero canvas that swallows vertical drags is one a phone cannot get past. */
          var dx = nx - lastX, dy = ny - lastY;
          var pull = Math.abs(dx) + 0.35 * Math.abs(dy);
          var s = st[held];
          s.v += pull * 44.0 * (dx * s.hx > 0 ? 1.0 : 0.55);
          s.press = Math.min(1, s.press + pull * 2.0);
          lastX = nx; lastY = ny;
        }
        if (!isDown && wasDown) { if (held >= 0) st[held].press = 0; held = -1; }
        down = isDown;
      }

      /* ── the step ─────────────────────────────────────────────────────────────────────── */
      var navHref = null, navAt = 0;
      function step(dt) {
        dt = Math.min(dt, 0.033);
        simT += dt;
        var i, s;
        for (i = 0; i < NCELL; i++) {
          s = st[i];
          if (s.gone) { s.fly = Math.min(1, s.fly + dt * (reduced ? 4.0 : 2.6)); continue; }
          var f = -K * s.q - D * s.v;
          /* coupling THROUGH THE WEB — and only while the web is still there. When a
             perforation lets go, the force it was carrying vanishes, which is what makes the
             neighbours snap back late and separately rather than all together. */
          var nb = neighbours(i, lay);
          for (var k = 0; k < nb.length; k++) {
            var j = nb[k], web = (1 - st[i].tear) * (1 - st[j].tear);
            f += COUPLE * (st[j].q - st[i].q) * web;
          }
          s.v += f * dt;
          s.q += s.v * dt;
          if (!down || held !== i) s.press = Math.max(0, s.press - dt * 4.0);
          /* the perforation only gives while you are holding this card AND pulling hard, and
             it never runs backwards. Paper does not un-tear. */
          if (down && held === i) {
            var over = Math.abs(s.q) - TEAR_HOLD;
            if (over > 0) s.tear = Math.min(1, s.tear + over * TEAR_RATE * dt);
          }
          if (s.tear >= 1 && !s.gone) { s.gone = 1; navHref = CARDS[i].href; navAt = simT + (reduced ? 0.18 : 0.42); }
        }
        if (navHref && simT >= navAt && !opts.noNav) {
          var h = navHref; navHref = null;
          try { location.href = url(h); } catch (e) {}
        }
        deform();
      }

      /* ── CPU displacement, then real normals ──────────────────────────────────────────────
       * ⚑ Displacing on the CPU rather than in the vertex shader is a deliberate cost: the
       *   FOIL and the paper sheen both depend on the TRUE surface normal, and a normal
       *   recomputed from the moved lattice is the only one that is actually true. ~1,900
       *   vertices is nothing; a wrong normal is a material that does not react. */
      var P = L.pos, N = L.nor, R = L.rest, nx = L.nx, ny = L.ny;
      function deform() {
        var i, k;
        for (k = 0; k < L.n; k++) {
          var ci = L.cell[k], s = st[ci];
          var lu = L.loc[k * 2], lv = L.loc[k * 2 + 1];
          var inCard = (lu >= 0 && lu <= 1 && lv >= 0 && lv <= 1) ? 1 : 0;
          /* once the tear has run, the web is no longer holding this card — and the web's own
             vertices stop following it, which is what opens the gap. */
          var attach = L.att[k] * (1 - s.tear * (1 - inCard));
          var d = Math.max(0, Math.min(1, ((lu - 0.5) * s.hx + (lv - 0.5) * s.hy) + 0.5));
          var open = smooth(1 - s.tear, 1, d);
          var lift = s.q * (open * (1 - s.fly) + s.fly);
          var gu = (s.grabU === undefined ? 0.5 : s.grabU), gv = (s.grabV === undefined ? 0.5 : s.grabV);
          var dd = (lu - gu) * (lu - gu) * 1.9 + (lv - gv) * (lv - gv) * 0.9;
          var dish = -s.press * 0.055 * Math.exp(-7.0 * dd);
          var z = (lift * 0.42 + dish) * attach;
          P[k * 3] = R[k * 3] - s.hx * lift * 0.10 * attach + s.fly * (R[k * 3]) * 0.22 * inCard;
          P[k * 3 + 1] = R[k * 3 + 1] - s.hy * lift * 0.10 * attach + s.fly * (R[k * 3 + 1]) * 0.22 * inCard;
          P[k * 3 + 2] = z + s.fly * 2.6 * inCard;
        }
        /* normals by finite difference, but only across neighbours ON THE SAME CARD — reach
           across a tear and the cross product is garbage exactly where the eye is looking. */
        for (var j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
          k = j * nx + i;
          var c0 = L.cell[k];
          var ia = pickN(i + 1, j, nx, ny, c0, L) , ib = pickN(i - 1, j, nx, ny, c0, L);
          var ja = pickN(i, j + 1, nx, ny, c0, L), jb = pickN(i, j - 1, nx, ny, c0, L);
          if (ia < 0 || ib < 0 || ja < 0 || jb < 0) { N[k * 3] = 0; N[k * 3 + 1] = 0; N[k * 3 + 2] = 1; continue; }
          var ax = P[ia * 3] - P[ib * 3], ay = P[ia * 3 + 1] - P[ib * 3 + 1], az = P[ia * 3 + 2] - P[ib * 3 + 2];
          var bx = P[ja * 3] - P[jb * 3], by = P[ja * 3 + 1] - P[jb * 3 + 1], bz = P[ja * 3 + 2] - P[jb * 3 + 2];
          var cx = ay * bz - az * by, cy2 = az * bx - ax * bz, cz = ax * by - ay * bx;
          var len = Math.hypot(cx, cy2, cz) || 1;
          N[k * 3] = cx / len; N[k * 3 + 1] = cy2 / len; N[k * 3 + 2] = cz / len;
        }
        mesh.setPositions(P);
        mesh.setNormals(N);
        mesh.update(pc.PRIMITIVE_TRIANGLES, false);
      }
      function pickN(i, j, nx2, ny2, c0, LL) {
        if (i < 0 || j < 0 || i >= nx2 || j >= ny2) return -1;
        var k = j * nx2 + i;
        return LL.cell[k] === c0 ? k : -1;
      }
      function smooth(a, b, x) {
        if (b - a < 1e-5) return x >= b ? 1 : 0;
        var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      }

      /* ── uniforms + draw ─────────────────────────────────────────────────────────────── */
      var cellA = new Float32Array(NCELL * 4), cellB = new Float32Array(NCELL * 4);
      var _rt = null, _rtTex = null;      // allocated on the first readback, never in normal use
      function render() {
        for (var i = 0; i < NCELL; i++) {
          var s = st[i];
          cellA[i * 4] = s.q; cellA[i * 4 + 1] = s.tear;
          cellA[i * 4 + 2] = s.grabU || 0.5; cellA[i * 4 + 3] = s.grabV || 0.5;
          cellB[i * 4] = s.hx; cellB[i * 4 + 1] = s.hy; cellB[i * 4 + 2] = s.fly; cellB[i * 4 + 3] = s.gone;
        }
        mat.setParameter('uCellA[0]', cellA);
        mat.setParameter('uCellB[0]', cellB);
        /* the two lamps flicker. ⚑ THE SHEET NEVER MOVES ON ITS OWN — this is the one thing
           on the page with its own reason to move, because it is combusting, and the landing
           page's two torches already do exactly this. It touches LIGHT and never geometry,
           which is why the acceptance test asserts displacement rather than a frame hash. */
        var fa = 1, fb = 1;
        if (flicker && !reduced) {
          fa = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(simT * 8.3 + hash(1) * 6.0) * Math.sin(simT * 3.1));
          fb = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(simT * 7.1 + 2.2) * Math.sin(simT * 2.6));
        }
        /* PI folded into the light, because Lambert is albedo/PI */
        /* ⚠ 0.90 / 0.70, not 1.62 / 1.26. The first pass drove white stock to ~1.5 in linear
           light, i.e. clipped, and clipped paper is paper that cannot be dimmed — which is
           exactly what the ink-multiply test caught. Two broad lamps on 0.9 albedo want to
           land near 0.8, not past 1. */
        mat.setParameter('uKeyI', [0.90 * fa, 0.70 * fb]);
        mat.setParameter('uLA', torchA);
        mat.setParameter('uLB', torchB);
        var cp = cam.getPosition();
        mat.setParameter('uEye', [cp.x, cp.y, cp.z]);
        app.render();
      }

      /* ── resize ── */
      function resize() {
        var w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
        var dpr = Math.min(global.devicePixelRatio || 1, dprCap);
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        try { app.resizeCanvas(canvas.width, canvas.height); } catch (e) {}
        frameSheet();
      }

      /* ── input plumbing ── */
      function toN(ev) {
        var r = canvas.getBoundingClientRect();
        return [((ev.clientX - r.left) / Math.max(1, r.width)) * 2 - 1,
                -(((ev.clientY - r.top) / Math.max(1, r.height)) * 2 - 1)];
      }
      canvas.addEventListener('pointerdown', function (e) {
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
        var n = toN(e); pointer(n[0], n[1], true);
      });
      canvas.addEventListener('pointermove', function (e) { var n = toN(e); pointer(n[0], n[1], down); });
      canvas.addEventListener('pointerup', function (e) { var n = toN(e); pointer(n[0], n[1], false); });
      canvas.addEventListener('pointercancel', function () { pointer(px, py, false); });
      canvas.addEventListener('pointerleave', function () { hover = -1; pointer(px, py, false); });

      var ro = null;
      try { ro = new ResizeObserver(resize); ro.observe(host); } catch (e) { global.addEventListener('resize', resize); }

      host.appendChild(canvas);
      resize();
      deform();

      /* the viewer's own parallax: the CAMERA moves because the viewer did, which is the one
         motion §4 allows without the object moving. It is small on purpose. */
      var running = false, raf = 0, last = 0;
      function tick(ts) {
        if (!running) return;
        var dt = last ? (ts - last) / 1000 : 0.016; last = ts;
        camYaw = camYaw + (parX * 0.13 - camYaw) * Math.min(1, dt * 5);
        camPitch = camPitch + (parY * 0.09 - camPitch) * Math.min(1, dt * 5);
        placeCam();
        step(dt);
        render();
        raf = requestAnimationFrame(tick);
      }

      var ctrl = {
        canvas: canvas, app: app, device: device, lay: lay, cards: CARDS,
        pointer: pointer,
        setView: function (yaw, pitch) { camYaw = yaw; camPitch = pitch; placeCam(); },
        setParallax: function (on) { if (!on) { parX = 0; parY = 0; } },
        advance: function (ms) { step(ms / 1000); },
        render: render,
        loop: function (on) {
          running = !!on; last = 0;
          if (running) raf = requestAnimationFrame(tick); else cancelAnimationFrame(raf);
        },
        set: function (k, v) { mat.setParameter(k, v); },
        flicker: function (on) { flicker = !!on; },
        /* ── measurement instruments ────────────────────────────────────────────────────────
         * ⛔ READ FROM A TARGET WE OWN, NEVER FROM THE DEFAULT FRAMEBUFFER. The first version
         *   did the obvious thing — render, bind framebuffer 0, readPixels — and it returned a
         *   STALE frame every single time: setting the camera's clear colour to pure red and
         *   re-rendering still read back the old green. Nothing errored; every number was
         *   plausible; the acceptance harness reported the foil and its own sabotage control as
         *   IDENTICAL, which is the most expensive kind of wrong measurement (an A/B whose
         *   halves are the same looks exactly like a null result). An `app.render()` driven
         *   from outside the engine's own tick does not leave a readable backbuffer.
         * ⚑ A RenderTarget has no such ambiguity: we bind it, the camera draws into it, we
         *   read it. Same path, every time, and the picture on screen is left alone. */
        readback: function (x, y, w, h) {
          var gl = device.gl, buf = new Uint8Array(w * h * 4);
          if (!_rt) {
            _rtTex = new pc.Texture(device, {
              name: 'sheetGrab', width: canvas.width, height: canvas.height,
              format: pc.PIXELFORMAT_RGBA8, mipmaps: false,
              minFilter: pc.FILTER_NEAREST, magFilter: pc.FILTER_NEAREST
            });
            _rt = new pc.RenderTarget({ colorBuffer: _rtTex, depth: true, samples: 0 });
          }
          cam.camera.renderTarget = _rt;
          render();
          cam.camera.renderTarget = null;
          device.setRenderTarget(_rt);
          device.updateBegin();
          gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          device.updateEnd();
          device.setRenderTarget(null);
          return buf;
        },
        /** the foil slug's bounding box, in BACKING-STORE pixels, at the current view */
        slugRect: function () {
          var xs = [], ys = [], m = root.getWorldTransform();
          var sx = canvas.width / Math.max(1, canvas.clientWidth);
          var sy = canvas.height / Math.max(1, canvas.clientHeight);
          for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) {
            var p = new pc.Vec3(L.W * (i ? 0.80 : 0.20) - L.W / 2, TAIL * (j ? 0.64 : 0.38) - L.H / 2, 0);
            m.transformPoint(p, p);
            var s = cam.camera.worldToScreen(p);
            xs.push(s.x * sx); ys.push(s.y * sy);
          }
          var x0 = Math.max(0, Math.floor(Math.min.apply(null, xs)));
          var x1 = Math.min(canvas.width, Math.ceil(Math.max.apply(null, xs)));
          var y0 = Math.max(0, Math.floor(Math.min.apply(null, ys)));
          var y1 = Math.min(canvas.height, Math.ceil(Math.max.apply(null, ys)));
          /* readPixels counts y from the BOTTOM; worldToScreen counts from the top. */
          return { x: x0, y: Math.max(0, canvas.height - y1), w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
        },
        /** ⚑ Sample a grid of points ON THE FOIL BAND ITSELF, by projecting each one through
         *  the live camera — not by walking a fraction of its screen bounding box. The sheet
         *  moves under the camera during a view sweep, so a fixed fraction of a moving box is
         *  a DIFFERENT piece of foil at every angle; that mismatch reported "0 of 140 points
         *  trackable" and looked like a dead material. Returns [r,g,b] per point, in order. */
        slugSamples: function (gx, gy) {
          var r = this.slugRect();
          var px = this.readback(r.x, r.y, r.w, r.h);
          var m = root.getWorldTransform(), out = [];
          var sx = canvas.width / Math.max(1, canvas.clientWidth);
          var sy = canvas.height / Math.max(1, canvas.clientHeight);
          for (var j = 0; j < gy; j++) for (var i = 0; i < gx; i++) {
            var u = 0.20 + (0.60 * (i + 0.5)) / gx, v = 0.38 + (0.26 * (j + 0.5)) / gy;
            var p = new pc.Vec3(L.W * u - L.W / 2, TAIL * v - L.H / 2, 0);
            m.transformPoint(p, p);
            var s = cam.camera.worldToScreen(p);
            var X = Math.round(s.x * sx) - r.x;
            var Y = Math.round(canvas.height - s.y * sy) - r.y;    // readPixels counts up
            if (X < 0 || Y < 0 || X >= r.w || Y >= r.h) { out.push(null); continue; }
            var k = (Y * r.w + X) * 4;
            out.push([px[k], px[k + 1], px[k + 2]]);
          }
          return out;
        },
        /** a card's bounding box, in backing-store pixels */
        cardRect: function (idx) {
          var r = cellRect(idx, lay), xs = [], ys = [], m = root.getWorldTransform();
          var sx = canvas.width / Math.max(1, canvas.clientWidth);
          var sy = canvas.height / Math.max(1, canvas.clientHeight);
          [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]].forEach(function (c) {
            var p = new pc.Vec3(c[0] - L.W / 2, c[1] - L.H / 2, 0);
            m.transformPoint(p, p);
            var s = cam.camera.worldToScreen(p);
            xs.push(s.x * sx); ys.push(s.y * sy);
          });
          var x0 = Math.max(0, Math.floor(Math.min.apply(null, xs))), x1 = Math.min(canvas.width, Math.ceil(Math.max.apply(null, xs)));
          var y0 = Math.max(0, Math.floor(Math.min.apply(null, ys))), y1 = Math.min(canvas.height, Math.ceil(Math.max.apply(null, ys)));
          var pad = Math.round((x1 - x0) * 0.18);
          return { x: x0 + pad, y: Math.max(0, canvas.height - y1) + pad,
                   w: Math.max(1, x1 - x0 - pad * 2), h: Math.max(1, y1 - y0 - pad * 2) };
        },
        /* deterministic drive for the harness: grab a card and pull it n times */
        drag: function (cellIdx, amount, steps) {
          var r = cellRect(cellIdx, lay);
          var cu = (r.x0 + CARD_W * 0.30 - L.W / 2), cv = (r.y0 + CARD_H * 0.5 - L.H / 2);
          var hit = { cell: cellIdx, u: 0.30, v: 0.5 };
          held = cellIdx; down = true;
          st[cellIdx].grabU = hit.u; st[cellIdx].grabV = hit.v;
          st[cellIdx].hx = 1; st[cellIdx].hy = 0;
          for (var i = 0; i < (steps || 1); i++) {
            st[cellIdx].v += amount * 44.0;
            st[cellIdx].press = Math.min(1, st[cellIdx].press + amount * 2.0);
            step(1 / 60);
          }
        },
        release: function () { down = false; held = -1; },
        probe: function () {
          var maxD = 0, disp = [];
          for (var k = 0; k < L.n; k++) {
            var dz = Math.abs(P[k * 3 + 2] - R[k * 3 + 2]);
            var dx = Math.abs(P[k * 3] - R[k * 3]), dy = Math.abs(P[k * 3 + 1] - R[k * 3 + 1]);
            var m = Math.max(dz, dx, dy); if (m > maxD) maxD = m;
          }
          for (var i = 0; i < NCELL; i++) disp.push(st[i].q);
          return {
            verts: L.n, tris: L.idx.length / 3, cells: NCELL,
            cols: lay.cols, rows: lay.rows, landscape: landscape,
            maxDisp: maxD, q: disp,
            tear: st.map(function (s) { return s.tear; }),
            fly: st.map(function (s) { return s.fly; }),
            gone: st.map(function (s) { return s.gone; }),
            hover: hover, held: held, simT: simT,
            sheet: { w: L.W, h: L.H },
            hrefs: CARDS.map(function (c) { return c.href; })
          };
        },
        destroy: function () {
          running = false; cancelAnimationFrame(raf);
          try { ro && ro.disconnect(); } catch (e) {}
          try { app.destroy(); } catch (e) {}
          try { canvas.remove(); } catch (e) {}
        }
      };
      global.__sheet = ctrl;
      if (!opts.manual) ctrl.loop(true);
      return ctrl;
    }).catch(function (e) {
      try { console.warn('[sheet3d] ' + (e && e.message)); } catch (x) {}
      try { app && app.destroy(); } catch (x) {}
      try { canvas.remove(); } catch (x) {}
      return null;
    });
  }

  global.Sheet3D = { mount: mount, CARDS: CARDS, RAMP: RAMP, layout: layout };
})(window);

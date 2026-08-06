/* ripmaster3030studios — SMALL HAND-DRAWN LOOPS, STRUCK ON THE CARD.  `CardSprites`
 *
 *   CardSprites.kinds()                      -> ['boil','ascii','aperture','swarm','ripple','rain']
 *   CardSprites.sheet({seed,kind,frames,cell,type}) -> {canvas, frames, cols, rows, kind}
 *   CardSprites.VERSION
 *
 * Artist, 2026-08-05: *"there is also supposed to be module for adding small gif sprites and loops
 * that look handddrawn that we never saw, those should be infinite abstract, ascii art, generative
 * and cool"* … *"where are the handmade animations and glyphs, gifs section as well"*.
 *
 * ══ WHAT MAKES A LINE LOOK HAND-DRAWN, AND IT IS NOT WOBBLE ═══════════════════════════════════
 *
 * ⛔ THE HALLMARK IS BOILING. A tweened animation interpolates ONE drawing, so its outline is
 *    glass-smooth from frame to frame — that is what reads as computer. A hand-drawn animation was
 *    REDRAWN, by a person, for every single frame, so the line disagrees with itself slightly
 *    every time: it crawls, it breathes, it BOILS. So every frame here is generated from its own
 *    jitter seed and shares nothing with its neighbours except the pose. That is structural rather
 *    than decorative — there is no interpolation anywhere in this file to accidentally smooth it.
 * ⚑ AND IT ANSWERS DESIGN-SYSTEM §4 — *what moves, and why it physically moved*: the line moves
 *   because a hand redrew it. Nothing else in this repo can say that.
 *
 * ⚠ A stroke is drawn TWICE with different jitter, not once. One pass is a wobbly vector; two
 *   passes at slightly different offsets is a pen that went round again, which is what a real
 *   inked line looks like where the nib was reloaded. Width varies along the stroke and pools at
 *   the ends, because a nib slows at a stop.
 *
 * ══ THE GLYPHS ARE THE CARD'S OWN FOUNT ══════════════════════════════════════════════════════
 *
 * ⛔ NO FONT SHIPS AND NONE IS NAMED — the standing law of this renderer, and the reason the ASCII
 *    kinds draw from `cards/type/alphabet.json` (68 committed outlines: A–Z, 0–9 and punctuation)
 *    rather than from `ctx.fillText`. A `fillText` here would put the collector's installed fonts
 *    in charge of the artwork, and on a machine with none it would silently print nothing.
 * ⚠ Handed no alphabet, the ASCII kinds fall back to drawn marks rather than throwing. A sprite
 *   that cannot render is a sprite that is absent; it must never be a sprite that breaks the card.
 *
 * ══ INFINITE ═════════════════════════════════════════════════════════════════════════════════
 *
 * Two senses, both required. THE LOOP closes: frame N-1 hands back to frame 0 with no seam,
 * because every generator is a pure function of `t = i/frames` on a closed cycle. THE SET is
 * endless: the seed decides the composition, so there are as many of each kind as there are
 * seeds, and none of them is stored anywhere.
 *
 * ⚠ NO `Math.random` IN THIS FILE, for the same reason the press has none: a card is only a card
 *   if it reprints. Same seed, same sheet, byte for byte.
 * ⚠ ALPHA STAYS 255. A 2D canvas stores premultiplied pixels, so writing coverage into alpha
 *   multiplies the colour by zero and destroys the data — a recorded and expensive bug in
 *   js/hero-card.js. Coverage is the RED channel; the other two carry a wear mask and a phase.
 */
(function (global) {
  'use strict';
  const VERSION = 1;
  const TAU = Math.PI * 2;

  /* the press's own generator, so a sprite seeded beside a card cannot drift from it */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a ^= a << 13; a >>>= 0; a ^= a >> 17; a ^= a << 5; a >>>= 0;
      return a / 4294967296;
    };
  }

  /* ── THE PEN ────────────────────────────────────────────────────────────────────────────────
   * ⚠ Jitter is applied per POINT, not as one offset per stroke: an offset stroke is the same
   *   drawing moved, which reads as a bad tween. A hand disagrees with itself along the line. */
  function inkStroke(g, pts, w, r, boil) {
    if (pts.length < 2) return;
    const passes = 2;
    for (let p = 0; p < passes; p++) {
      g.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const t = i / (pts.length - 1);
        /* a nib is fattest in the middle of a stroke and pools where it stops */
        const jx = (r() - 0.5) * boil, jy = (r() - 0.5) * boil;
        const x = pts[i][0] + jx, y = pts[i][1] + jy;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        void t;
      }
      g.lineWidth = w * (p === 0 ? 1 : 0.62);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.stroke();
    }
    /* ink pools at both ends — a pen slows before it lifts */
    for (const e of [pts[0], pts[pts.length - 1]]) {
      g.beginPath();
      g.arc(e[0] + (r() - 0.5) * boil, e[1] + (r() - 0.5) * boil, w * 0.62, 0, TAU);
      g.fill();
    }
  }

  /* sample a closed hand-drawn ring — used by several kinds */
  function ring(cx, cy, rad, n, wob, r, squash) {
    const pts = [], ph = r() * TAU, k = 2 + Math.floor(r() * 4);
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * TAU;
      const rr = rad * (1 + Math.sin(t * k + ph) * wob);
      pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr * (squash || 1)]);
    }
    return pts;
  }

  /* ── THE GLYPH SET ──────────────────────────────────────────────────────────────────────────
   * Filled from committed outlines. ⚠ `contours` are em units with y UP and the origin on the
   * baseline; canvas is y DOWN, so the sign flips here and nowhere else. */
  function glyphPath(g, spec, ch, x, y, size) {
    const G = spec && spec.glyphs && spec.glyphs[ch];
    if (!G || !G.contours) return false;
    g.beginPath();
    for (const c of G.contours) {
      for (let i = 0; i < c.length; i++) {
        const px = x + c[i][0] * size, py = y - c[i][1] * size;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
    }
    return true;
  }
  const ASCII_POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.,;:!?&-_/\\|()[]{}<>=+*#$%@^~';

  /* ══ THE KINDS ══════════════════════════════════════════════════════════════════════════════
   * Each is `draw(g, S, t, r)` — canvas, cell size, cycle position 0..1, and a per-FRAME rng.
   * ⚠ `t` is the ONLY thing shared between frames. Everything else is redrawn, which is the
   *   boil. A generator that closed over per-sprite state would smooth itself out.               */
  const KINDS = {
    /* an abstract knot that turns itself inside out and comes back */
    boil(g, S, t, r, o) {
      const cx = S / 2, cy = S / 2, R = S * 0.34;
      const lobes = 3 + (o.seed % 3);
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * TAU;
        const m = 1 + 0.42 * Math.sin(a * lobes + t * TAU) * Math.cos(t * TAU);
        pts.push([cx + Math.cos(a) * R * m, cy + Math.sin(a) * R * m]);
      }
      inkStroke(g, pts, S * 0.030, r, S * 0.016);
    },

    /* a grid of glyphs, each one re-chosen as the cycle turns — the ASCII kind */
    ascii(g, S, t, r, o) {
      const spec = o.type;
      const N = 5 + (o.seed % 3);                       // 5..7 columns
      const cell = S / N, size = cell * 1.15;
      for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
        /* a wave decides WHICH glyph, so the grid churns as a field rather than as noise */
        const w = Math.sin((gx * 0.7 + gy * 0.5) + t * TAU) * 0.5 + 0.5;
        if (w < 0.28) continue;                          // sparse: a full grid reads as a texture
        const k = Math.floor((w * 37 + gx * 5 + gy * 11 + o.seed) % ASCII_POOL.length);
        const ch = ASCII_POOL[k];
        const x = gx * cell + cell * 0.14 + (r() - 0.5) * cell * 0.16;
        const y = gy * cell + cell * 0.92 + (r() - 0.5) * cell * 0.16;
        if (!glyphPath(g, spec, ch, x, y, size)) {
          /* no alphabet: a struck mark, so the sprite is still a sprite */
          g.beginPath(); g.arc(x + cell * 0.3, y - cell * 0.3, cell * 0.16, 0, TAU);
        }
        g.fill();
      }
    },

    /* an iris that opens and shuts — the most legible loop in the set */
    aperture(g, S, t, r) {
      const cx = S / 2, cy = S / 2;
      const open = 0.16 + 0.42 * (1 - Math.cos(t * TAU)) * 0.5;
      inkStroke(g, ring(cx, cy, S * 0.40, 72, 0.045, r, 1), S * 0.026, r, S * 0.013);
      inkStroke(g, ring(cx, cy, S * open, 56, 0.075, r, 1), S * 0.030, r, S * 0.015);
      /* blades: straight hand-cut chords, not a smooth iris */
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + t * 0.6;
        inkStroke(g, [[cx + Math.cos(a) * S * open, cy + Math.sin(a) * S * open],
                      [cx + Math.cos(a) * S * 0.40, cy + Math.sin(a) * S * 0.40]],
                  S * 0.017, r, S * 0.011);
      }
    },

    /* marks that orbit and scatter — abstract, never a particle system */
    swarm(g, S, t, r, o) {
      const n = 7 + (o.seed % 5);
      for (let i = 0; i < n; i++) {
        const ph = (i / n) * TAU;
        const rad = S * (0.14 + 0.24 * ((i * 7 + o.seed) % 5) / 4);
        const a = ph + t * TAU * (i % 2 ? 1 : -1);
        const cx = S / 2 + Math.cos(a) * rad, cy = S / 2 + Math.sin(a) * rad;
        const L = S * 0.07;
        inkStroke(g, [[cx - Math.cos(a) * L, cy - Math.sin(a) * L],
                      [cx + Math.cos(a) * L, cy + Math.sin(a) * L]], S * 0.022, r, S * 0.014);
      }
    },

    /* concentric hand-drawn rings, breathing outward and wrapping */
    ripple(g, S, t, r) {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const f = ((i / n) + t) % 1;                     // wraps: the loop closes by construction
        const rad = S * (0.06 + 0.36 * f);
        g.globalAlpha = Math.min(1, (1 - f) * 2.4);
        inkStroke(g, ring(S / 2, S / 2, rad, 64, 0.06 + 0.05 * f, r, 0.92), S * 0.024, r, S * 0.014);
      }
      g.globalAlpha = 1;
    },

    /* glyph columns falling, seamless at the wrap — the second ASCII kind */
    rain(g, S, t, r, o) {
      const spec = o.type;
      const cols = 6 + (o.seed % 3), cw = S / cols, size = cw * 1.2;
      for (let c = 0; c < cols; c++) {
        const speed = 1 + ((c * 5 + o.seed) % 3);
        const rows = 4;
        for (let k = 0; k < rows; k++) {
          /* fract() keeps it periodic in t, so the last frame hands back to the first */
          const f = ((k / rows) + t * speed) % 1;
          const y = f * (S + cw) - cw * 0.2;
          const ch = ASCII_POOL[(c * 13 + k * 7 + Math.floor(f * 11) + o.seed) % ASCII_POOL.length];
          const x = c * cw + cw * 0.12 + (r() - 0.5) * cw * 0.14;
          g.globalAlpha = 0.35 + 0.65 * (1 - Math.abs(f - 0.5) * 2);
          if (!glyphPath(g, spec, ch, x, y, size)) {
            g.beginPath(); g.rect(x, y - cw * 0.5, cw * 0.4, cw * 0.5);
          }
          g.fill();
        }
      }
      g.globalAlpha = 1;
    },
  };
  const ORDER = ['boil', 'ascii', 'aperture', 'swarm', 'ripple', 'rain'];

  /* ══ THE SHEET ══════════════════════════════════════════════════════════════════════════════
   * One canvas, `frames` cells in a grid. A sheet rather than N canvases because the press wants
   * ONE texture unit and a cell offset — uploading a texture per frame would mean a GL upload on
   * every tick of the cycle, which is the sort of thing that is invisible until a phone.
   * ⚠ COVERAGE IS RED, and alpha stays 255. See the header: a 2D canvas premultiplies. */
  function sheet(o) {
    o = o || {};
    const kind = KINDS[o.kind] ? o.kind : ORDER[(o.seed >>> 0) % ORDER.length];
    const frames = Math.max(2, Math.min(48, (o.frames | 0) || 12));
    const cell = Math.max(32, Math.min(256, (o.cell | 0) || 128));
    const seed = (o.seed >>> 0) || 3030;
    const cols = Math.ceil(Math.sqrt(frames)), rows = Math.ceil(frames / cols);

    let c;
    try {
      c = document.createElement('canvas');
      c.width = cols * cell; c.height = rows * cell;
    } catch (e) { return null; }
    const g = c.getContext('2d', { willReadFrequently: false });
    if (!g) return null;
    /* black = no ink. The press ADDS this as coverage, so the field must be zero. */
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgb(255,0,0)'; g.fillStyle = 'rgb(255,0,0)';

    for (let i = 0; i < frames; i++) {
      const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
      g.save();
      g.beginPath(); g.rect(cx, cy, cell, cell); g.clip();
      g.translate(cx, cy);
      /* ⚑ ONE RNG PER FRAME, AND IT IS THE BOIL. Every frame re-rolls its own jitter, so the line
       * disagrees with itself frame to frame the way a redrawn line does. Sharing one stream
       * across frames would correlate them and the boil would turn into a drift. */
      const r = rng(seed ^ (0x9E3779B9 + i * 2654435761));
      try { KINDS[kind](g, cell, i / frames, r, { seed: seed, type: o.type }); } catch (e) {}
      g.restore();
    }
    /* ⚠ alpha to 255 everywhere — belt and braces against a generator that used globalAlpha */
    try {
      const im = g.getImageData(0, 0, c.width, c.height);
      for (let i = 3; i < im.data.length; i += 4) im.data[i] = 255;
      g.putImageData(im, 0, 0);
    } catch (e) { /* tainted or unavailable: the sheet is still usable */ }

    return { canvas: c, frames: frames, cols: cols, rows: rows, cell: cell, kind: kind };
  }

  global.CardSprites = {
    VERSION: VERSION,
    kinds: () => ORDER.slice(),
    sheet: sheet,
    /* exposed so a harness can assert a property of the DRAWING rather than of the lit result —
     * the same reason js/hero-card.js exposes maps(). */
    _kinds: KINDS,
  };
})(window);

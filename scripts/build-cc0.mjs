#!/usr/bin/env node
/* upperdeckripmaster3030 — build the CC0-lineage asset set into models/cc0/.
 *
 *   npm run cc0                 # geometry + textures + skins.json
 *   npm run cc0 -- --preview    # …and render the Blender preview sheets (slow: Cycles on CPU)
 *   npm run cc0 -- --tex        # textures + skins.json only, no Blender
 *
 * WHAT THIS BUILDS, AND WHY IT IS SAFE TO MINT AGAINST
 * Every triangle and every pixel below is generated here or by scripts/blender/build-cc0-*.py.
 * Nothing is traced, sampled, decimated or imported from anyone else's file. What was studied is
 * palette, proportion and technique — none of which is copyrightable — from sources graded
 * VERIFIED in docs/CC0-SOURCES.md. Per-asset lineage: models/cc0/README.md.
 *
 * WHY THE TEXTURES ARE MADE HERE AND NOT IN BLENDER
 * The geometry belongs in a modeller; a 256×256 tiling bitmap does not. Doing it in Node means
 * `npm run cc0 -- --tex` regenerates the whole FX set on a machine with no Blender, which is the
 * common case when someone is only tuning a pattern. The PNG encoder is ~40 lines over Node's
 * own zlib — the same dependency-free habit as scripts/fbx2glb.mjs.
 *
 * WHAT THIS ADDS OVER RUNNING BLENDER BY HAND — the checks at the end. Both loaders in this repo
 * FAIL OPEN: js/ronin-glb.js silently falls back to a procedural fighter when a part name is
 * missing, and dogfight-gl silently draws nothing when a prop name is. Neither throws, neither
 * logs, and both look exactly like "the update didn't ship". So names are asserted here, at build
 * time, where a missing one is a red line. The bodies get two extra assertions that geometry
 * alone cannot express — see assertBody().
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'models', 'cc0');
const TEX = join(OUT, 'tex');
const PREV = join(OUT, 'preview');

/* Must match the object names in scripts/blender/build-cc0-props.py. */
const PROPS = ['prop_totem', 'prop_slice', 'prop_scanbar', 'prop_lump', 'prop_slate',
  'prop_dither', 'env_deck', 'env_bars', 'env_gate'];

/* Must match build-cc0-chars.py — and these are the names js/ronin3d.js's JOINTMAP actually
 * routes correctly, which is NOT the set models/README.md documents. See the header of
 * build-cc0-chars.py for the measurement; changing these silently welds limbs together. */
const BODY_PARTS = ['head', 'chest', 'pelvis',
  'shoulder_f', 'elbow_f', 'hand_f', 'shoulder_b', 'elbow_b', 'hand_b',
  'thigh_f', 'shin_f', 'foot_f', 'thigh_b', 'shin_b', 'foot_b'];
const BODIES = ['lank', 'squat', 'lump'];

const argv = process.argv.slice(2);
const wantPreview = argv.includes('--preview');
const texOnly = argv.includes('--tex');

mkdirSync(OUT, { recursive: true });
mkdirSync(TEX, { recursive: true });

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * The palettes. These are DATA, and where each number came from matters more than the number.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/* Nouns — the exact on-chain palette, copied from packages/nouns-assets/src/image-data.json in
 * nounsDAO/nouns-monorepo, i.e. the same table the descriptor renders from. CC0 is asserted
 * on-chain in NounsDescriptor.sol as a keccak of the CC0 1.0 legalcode. A palette is not
 * copyrightable in the first place; this one happens also to be explicitly dedicated. */
const NOUNS = {
  ink: '#1f1d29', slate: '#343235', ash: '#4b4949', stone: '#807f7e',
  bone: '#c5b9a1', paper: '#fffdf2', sky: '#63a0f9', indigo: '#5648ed', ice: '#caeff9',
  moss: '#068940', lime: '#4bea69', olive: '#80a72d', gold: '#eed811', amber: '#ffc110',
  ochre: '#ffae1a', tangerine: '#f98f30', flame: '#fe500c', rust: '#d22209',
  vermilion: '#f3322c', cerise: '#e9265c', plum: '#b9185c', blush: '#ff638d',
  violet: '#9f21a0', seafoam: '#8bc0c5', umber: '#5a423f', burnt: '#ae3208',
  bg_cold: '#d5d7e1', bg_warm: '#e1d7d5',   // the only two backgrounds — the same bytes, reversed
};

/* XCOPY — MEASURED, not remembered. Five works sampled from the artist's own CDN and analysed;
 * numbers and method in docs/CC0-SOURCES.md. The three findings that drive every skin below:
 *   1. black is 39–71% of the frame — it is the substrate, not the shadow
 *   2. near-white measured 0.00% in ALL FIVE — highlights are chromatic, never neutral
 *   3. two chroma poles (H≈335 hot / H≈185 cold) over a desaturated blue-grey mid
 * Point 2 is the one that fights the engine: additive bloom clips to white by default, which is
 * the exact look this palette does not have. Pair these skins with GfxPost's highlight rolloff. */
const XCOPY = {
  void: '#000000', pitch: '#080810', tar: '#101018', gunmetal: '#182030',
  steel: '#485870', haze: '#88a0c8',
  hot: '#f80070', flare: '#f84088', bruise: '#a04060',
  cold: '#007080', ice: '#78f8f8', teal: '#48b0b0',
  blood: '#c83030',
};

/* Darkfarms — MEASURED from seven SMOWLz tokens (903×903 flat PNGs, 512 exact colours across all
 * seven). The rule is the inverse of XCOPY's: black is the EDGE here, not the ground — 21.4% of
 * every image is pure-black keyline around flat candy fills. Both uses are in the set. */
const SMOWL = {
  key: '#000000', lilac: '#aca3fe', butter: '#f4cd70', magenta: '#9500a3',
  paper: '#cfd4da', moss: '#5d8f36', maroon: '#6d000f', shade: '#492e4c',
};

/* js/ronin3d.js's `uMat` ids. Named here so skins.json is readable by a human; the renderer only
 * ever sees the integer. Not editable from this file — it is a mirror, and if ronin3d's list
 * changes this one is wrong. */
const MAT = { flat: 0, cloth: 1, metal: 2, scale: 3, crystal: 4, skin: 5, energy: 6, bands: 7 };

/* A skin here = what this engine can actually express per draw call: one tint, one procedural
 * material id, one emissive amount, and optionally one tiling map for the triplanar sampler in
 * js/dogfight-gl.js. That is deliberately the WHOLE vocabulary — a "skin" that needs a feature
 * the renderers do not have is a wish, not an asset. */
const SKINS = {
  /* ── XCOPY lineage — black ground, chromatic highlight, zero white ── */
  burn:      { color: XCOPY.hot,   mat: MAT.energy, emis: 0.55, tex: 'fx_scanline', lineage: 'XCOPY',
               note: 'the hot pole. Emissive because at H≈335/S100 it reads as light, not paint.' },
  cathode:   { color: XCOPY.cold,  mat: MAT.energy, emis: 0.45, tex: 'fx_scanline', lineage: 'XCOPY',
               note: 'the cold pole. Pairs with burn; the two together are most of a frame.' },
  mosh:      { color: XCOPY.gunmetal, mat: MAT.bands, emis: 0.0, tex: 'fx_glitch', lineage: 'XCOPY',
               note: 'the desaturated mid that carries the middle of the value range.' },
  void:      { color: XCOPY.void,  mat: MAT.flat,   emis: 0.0, tex: 'fx_scanline', lineage: 'XCOPY',
               note: 'the substrate. Not a shadow colour — geometry that is meant to read as a hole.' },
  bruise:    { color: XCOPY.bruise, mat: MAT.cloth, emis: 0.0, tex: null, lineage: 'XCOPY',
               note: 'the low-chroma pink of "last selfie" — the palette when it is tired.' },

  /* ── Nouns lineage — flat fill, hard edge, no gradient ── */
  flat_ink:  { color: NOUNS.ink,   mat: MAT.flat, emis: 0.0, tex: 'fx_grid', lineage: 'Nouns' },
  flat_bone: { color: NOUNS.bone,  mat: MAT.flat, emis: 0.0, tex: 'fx_grid', lineage: 'Nouns' },
  flat_sky:  { color: NOUNS.sky,   mat: MAT.flat, emis: 0.0, tex: 'fx_grid', lineage: 'Nouns' },
  flat_flame:{ color: NOUNS.flame, mat: MAT.flat, emis: 0.15, tex: 'fx_grid', lineage: 'Nouns' },
  flat_moss: { color: NOUNS.moss,  mat: MAT.flat, emis: 0.0, tex: 'fx_grid', lineage: 'Nouns' },

  /* ── Darkfarms lineage — flat cel fills held by a heavy black keyline ── */
  cel_lilac: { color: SMOWL.lilac, mat: MAT.flat, emis: 0.0, tex: 'fx_keyline', lineage: 'Darkfarms (SMOWLz)' },
  cel_butter:{ color: SMOWL.butter, mat: MAT.flat, emis: 0.0, tex: 'fx_keyline', lineage: 'Darkfarms (SMOWLz)' },
  cel_magenta:{ color: SMOWL.magenta, mat: MAT.flat, emis: 0.20, tex: 'fx_keyline', lineage: 'Darkfarms (SMOWLz)',
               note: 'the one saturated accent per piece. Without it the cel palette goes soft.' },

  /* ── Anonymice / Blitmap lineage — 1-bit, tone from pattern not from value ── */
  bit_on:    { color: NOUNS.paper, mat: MAT.flat, emis: 0.0, tex: 'fx_dither', lineage: 'Anonymice' },
  bit_off:   { color: XCOPY.void,  mat: MAT.flat, emis: 0.0, tex: 'fx_dither', lineage: 'Anonymice' },
  halftone:  { color: NOUNS.stone, mat: MAT.metal, emis: 0.0, tex: 'fx_halftone', lineage: 'Blitmap' },

  /* ── Loot lineage — the format, not the contents ── */
  slate:     { color: XCOPY.pitch, mat: MAT.flat, emis: 0.0, tex: 'fx_rule', lineage: 'Loot',
               note: 'white-on-black list surface. The rules are ours; no Loot item names are used.' },
};

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * PNG out — Node zlib plus a CRC table, no dependency.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** RGBA8 pixel buffer → PNG. Filter byte 0 per scanline: these are synthetic patterns with hard
 *  edges, where a predictive filter costs CPU and saves almost nothing. */
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * The FX tiles.
 *
 * EVERY ONE OF THESE MUST TILE. js/dogfight-gl.js binds them with gl.REPEAT and samples them
 * triplanar in object space, so a tile with a seam does not show one seam — it shows a grid of
 * them welded to the hull. That constraint is why every pattern below is built from functions
 * that are periodic over the tile: no unbounded gradients, no one-shot random placement, and any
 * "ramp" is a TRIANGLE wave so it meets itself at the wrap.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */
const S = 256;
const tri = (t) => 1 - Math.abs(((t % 1) + 1) % 1 * 2 - 1);      // periodic 0→1→0 ramp

/* Value noise on a wrapping lattice. Wrapping is the whole point: `p & (n-1)` makes the lattice
 * periodic, so the noise repeats exactly at the tile edge instead of nearly repeating. */
function wrapNoise(seedN) {
  const n = 16, g = new Float32Array(n * n);
  let s = seedN >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < n * n; i++) g[i] = rnd();
  const at = (x, y) => g[((y & (n - 1)) * n) + (x & (n - 1))];
  const sm = (t) => t * t * (3 - 2 * t);
  return (fx, fy) => {
    const x = fx * n, y = fy * n, xi = Math.floor(x), yi = Math.floor(y);
    const tx = sm(x - xi), ty = sm(y - yi);
    return (at(xi, yi) * (1 - tx) + at(xi + 1, yi) * tx) * (1 - ty)
         + (at(xi, yi + 1) * (1 - tx) + at(xi + 1, yi + 1) * tx) * ty;
  };
}

/** 8×8 recursive Bayer matrix, 0..63. The SAME matrix drives prop_dither's relief in
 *  build-cc0-props.py — the prop and the texture are one pattern, not two that resemble each
 *  other, which is what makes them read as the same material at two scales. */
const BAYER = (() => {
  let m = [[0]];
  while (m.length < 8) {
    m = [...m.map(r => [...r.map(v => 4 * v), ...r.map(v => 4 * v + 2)]),
         ...m.map(r => [...r.map(v => 4 * v + 3), ...r.map(v => 4 * v + 1)])];
  }
  return m;
})();

function tile(fn) {
  const buf = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = fn(x, y, x / S, y / S);
    const i = (y * S + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c.length > 3 ? c[3] : 255;
  }
  return buf;
}

function buildTextures() {
  const n1 = wrapNoise(3030), n2 = wrapNoise(1111);
  const out = {};

  /* fx_scanline — XCOPY. A CRT line is not a stripe: the gap does as much work as the bar, and
   * the duty cycle drifts. Modulating the duty with a periodic ramp is what stops it reading as
   * corduroy. Greyscale, because the renderers multiply it against a tint. */
  out.fx_scanline = tile((x, y, u, v) => {
    const duty = 0.34 + 0.26 * tri(v * 2);
    const line = ((y % 4) / 4) < duty ? 0.34 : 1.0;
    const roll = 0.92 + 0.08 * Math.sin(v * Math.PI * 8);       // slow brightness roll down the tube
    const g = Math.round(255 * Math.min(1, line * roll * (0.94 + 0.10 * n1(u * 2, v * 2))));
    return [g, g, g];
  });

  /* fx_glitch — XCOPY datamosh. Bands of wrapping noise, each shifted sideways by a quantised
   * amount, and only SOME bands shifted. The intermittence is the signature: a uniform shear is
   * a skew, and a skew reads as a mistake rather than as corruption. */
  out.fx_glitch = tile((x, y, u, v) => {
    const band = Math.floor(y / 8);                              // 32 bands, divides 256 → tiles
    const h = (Math.sin(band * 12.9898) * 43758.5453) % 1;
    const torn = Math.abs(h) > 0.58;
    const shift = torn ? Math.round((h * 37) % 24) * 4 : 0;      // quantised, wraps in x
    const xs = (x + shift + S) % S;
    let g = 0.18 + 0.72 * n1(xs / S * 3, v * 3);
    if (torn) g = g > 0.5 ? 1.0 : 0.10;                          // torn bands go 1-bit — datamosh clips
    g *= 0.85 + 0.30 * n2(xs / S * 7, v * 7);
    const q = Math.round(255 * Math.max(0, Math.min(1, g)));
    return [q, q, q];
  });

  /* fx_dither — Anonymice. A pure ordered-dither RAMP with no greys anywhere: every pixel is 0
   * or 255, and the apparent tone is entirely the pattern's doing. Triangle ramp so it tiles. */
  out.fx_dither = tile((x, y, u, v) => {
    const level = Math.floor(64 * tri(v));
    const on = BAYER[y & 7][x & 7] < level;
    const g = on ? 255 : 0;
    return [g, g, g];
  });

  /* fx_halftone — Blitmap-adjacent. Dots on a 16px lattice whose radius follows a periodic ramp.
   * Where dither quantises the pixel, halftone quantises the CELL — the same trade (pattern for
   * value) at a different frequency, which is why they sit next to each other in the set. */
  out.fx_halftone = tile((x, y, u, v) => {
    const p = 16, cx = (x % p) - p / 2 + 0.5, cy = (y % p) - p / 2 + 0.5;
    const r = 1.2 + 6.0 * tri(v + u * 0.5);
    const d = Math.hypot(cx, cy);
    const g = d < r ? 20 : 235;
    return [g, g, g];
  });

  /* fx_keyline — Darkfarms. The measured SMOWLz rule made literal: flat candy cells, each ringed
   * by a heavy pure-black keyline, one saturated accent seeded per cell. Colour rather than
   * greyscale because here the palette IS the asset — this one is a decal/atlas, not a modulator. */
  const cel = [SMOWL.lilac, SMOWL.butter, SMOWL.paper, SMOWL.moss, SMOWL.lilac, SMOWL.butter];
  out.fx_keyline = tile((x, y) => {
    const p = 64, gx = Math.floor(x / p), gy = Math.floor(y / p);
    const ex = x % p, ey = y % p;
    const KEY = 5;                                               // keyline weight, in pixels
    if (ex < KEY || ey < KEY || ex >= p - KEY || ey >= p - KEY) return [0, 0, 0];
    const h = Math.abs((Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453) % 1);
    const c = hex(h > 0.86 ? SMOWL.magenta : cel[(gx + gy * 2) % cel.length]);
    // a second, inner keyline on some cells — SMOWLz outlines interior shapes too, not just the
    // silhouette, and that is what stops flat fills reading as wallpaper
    const inner = (ex > 16 && ex < 20) || (ey > 16 && ey < 20);
    return (h > 0.5 && inner) ? [0, 0, 0] : c;
  });

  /* fx_grid — Nouns. The 32-lattice as a surface: flat fills, hard edges, nothing between cells.
   * ⚠ 16 px cells, not 8. At 8 the contact sheet showed static rather than a lattice — a 1 px
   * grout line inside an 8 px cell is 12% of the cell, so the grout dominates and the fills never
   * get to be fills. Nouns legibility comes from the FILL being the event and the edge merely
   * bounding it; that only holds when the cell is comfortably bigger than its border. */
  out.fx_grid = tile((x, y) => {
    const p = 16, gx = Math.floor(x / p), gy = Math.floor(y / p);
    const h = Math.abs((Math.sin(gx * 45.3 + gy * 91.7) * 24634.6345) % 1);
    if (x % p < 2 || y % p < 2) return hex(NOUNS.ink);            // 2 px grout in a 16 px cell
    return hex(h > 0.82 ? NOUNS.bone : h > 0.58 ? NOUNS.stone : h > 0.26 ? NOUNS.ash : NOUNS.slate);
  });

  /* fx_rule — Loot. The list surface: a black field with white rules and a left margin, and NO
   * text. Loot's actual move is that the art is withheld for someone else to interpret, so a tile
   * that shipped its own lorem ipsum would be missing the point twice — once artistically and
   * once legally, since the item names are the only authored part of Loot. */
  out.fx_rule = tile((x, y, u, v) => {
    const pitch = 32;
    const rule = (y % pitch) < 2 ? 210 : 0;
    const margin = (x < 6 || x > S - 7) ? 150 : 0;
    const g = Math.max(rule, margin, Math.round(14 * n2(u * 4, v * 4)));
    return [g, g, g];
  });

  for (const [name, buf] of Object.entries(out)) {
    writeFileSync(join(TEX, name + '.png'), png(S, S, buf));
    seamCheck(name, buf);
  }

  /* Contact sheet — 4×2 of the seven tiles, each shown as 2×2 of itself so the REPEAT is what you
   * judge. A single tile in a box tells you nothing about the only property that matters here.
   *
   * ⚠ Downsampled by BOX AVERAGE, not by point sampling. The first version took every second
   * pixel, which is catastrophic for fx_dither and fx_halftone: point-sampling a 1-bit ordered
   * dither at 2× lands on the same phase of the Bayer cell every time and returns a near-solid
   * field, so the sheet showed a white square where the actual tile is a full black-to-white
   * ramp. Averaging is what an eye (or a mipmap) does, and it is the only honest preview of a
   * pattern whose whole trick is that tone lives in the pattern.
   */
  const cols = 4, rows = 2, cell = 128, W = cols * cell, H = rows * cell;
  const sheet = Buffer.alloc(W * H * 4, 255);
  const names = Object.keys(out);
  names.forEach((n, k) => {
    const cx = (k % cols) * cell, cy = Math.floor(k / cols) * cell;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const sx = (x * 4) % S, sy = (y * 4) % S;            // 4× shrink ⇒ 2×2 repeats per cell
      const acc = [0, 0, 0];
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
        const si = (((sy + dy) % S) * S + ((sx + dx) % S)) * 4;
        acc[0] += out[n][si]; acc[1] += out[n][si + 1]; acc[2] += out[n][si + 2];
      }
      const di = ((cy + y) * W + cx + x) * 4;
      sheet[di] = acc[0] / 16; sheet[di + 1] = acc[1] / 16; sheet[di + 2] = acc[2] / 16; sheet[di + 3] = 255;
    }
  });
  writeFileSync(join(TEX, '_contact.png'), png(W, H, sheet));
  return names;
}

/* Every tile is bound with gl.REPEAT and sampled triplanar, so a discontinuity at the wrap is not
 * one seam — it is a grid of them welded to the model. That is invisible in a directory listing
 * and obvious in the game, i.e. the worst possible place to find out.
 *
 * The test: the mean absolute difference across the WRAP (row 255 → row 0) must be no worse than
 * the typical difference between neighbouring interior rows. It cannot be zero — these patterns
 * have hard edges everywhere, so an interior row-to-row step is large by design — which is why it
 * is measured against the interior rather than against zero. Same in both axes. */
function seamCheck(name, buf) {
  const diff = (ai, bi, stride, n) => {
    let s = 0;
    for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) s += Math.abs(buf[ai + k * stride + c] - buf[bi + k * stride + c]);
    return s / (n * 3);
  };
  for (const axis of ['y', 'x']) {
    const idx = axis === 'y' ? (i, j) => (i * S + j) * 4 : (i, j) => (j * S + i) * 4;
    const stride = axis === 'y' ? 4 : S * 4;
    const wrap = diff(idx(S - 1, 0), idx(0, 0), stride, S);
    let inner = 0;
    for (let i = 0; i < S - 1; i++) inner += diff(idx(i, 0), idx(i + 1, 0), stride, S);
    inner /= (S - 1);
    // 1.5× headroom: an exact-tiling pattern lands at ~1.0×, a broken one at 5–20×.
    if (wrap > Math.max(2, inner * 1.5)) {
      throw new Error(`${name}.png does not tile in ${axis}: wrap step ${wrap.toFixed(1)} vs interior ${inner.toFixed(1)} — gl.REPEAT would show a grid of seams`);
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * Blender
 * ──────────────────────────────────────────────────────────────────────────────────────────── */
function haveBlender() {
  try { execFileSync('blender', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}
function blender(script, args) {
  return execFileSync('blender', ['--background', '--factory-startup', '-noaudio',
    '-P', join(ROOT, 'scripts', 'blender', script), '--', ...args],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
}
function parts(log) {
  return new Map(log.split('\n').filter(l => l.startsWith('  PART'))
    .map(l => { const t = l.trim().split(/\s+/); return [t[1], { tris: +t[2] }]; }));
}
function requireExport(log, what) {
  const done = log.split('\n').find(l => l.startsWith('EXPORTED'));
  if (!done) {
    console.error(log.split('\n').filter(l => /EXPORT_FAIL|Error|Traceback|line \d+/.test(l)).join('\n'));
    throw new Error(`blender did not export ${what}`);
  }
  return done;
}

/* The two things a name check cannot catch.
 *
 * (a) FEET AT ZERO, CROWN AT ONE. js/ronin3d.js's registerModel() computes scale = 150/height and
 *     footY = the lowest vertex, then places every part at its skeleton joint. The joint table is
 *     expressed in fractions of total height. So if anything at all pokes above the crown or
 *     below the sole, EVERY joint below it shifts and the whole body comes apart — subtly, in a
 *     way that looks like bad animation rather than like a bad export.
 * (b) FIFTEEN PARTS. A missing part does not error; it just does not draw, and a fighter with no
 *     forearm reads as a rendering bug.
 */
function assertBody(name, log) {
  const p = parts(log);
  const missing = BODY_PARTS.filter(n => !p.has(n));
  if (missing.length) throw new Error(`cc0-${name}.glb is missing part(s): ${missing.join(', ')}`);
  const extra = [...p.keys()].filter(n => !BODY_PARTS.includes(n));
  if (extra.length) throw new Error(`cc0-${name}.glb has unexpected part(s): ${extra.join(', ')} — the rig matches by name, so a stray object lands on a joint`);
  const bounds = log.split('\n').find(l => l.startsWith('BOUNDS'));
  if (!bounds) throw new Error(`cc0-${name}.glb: build script printed no BOUNDS line`);
  const [, lo, hi] = bounds.trim().split(/\s+/).map(Number);
  if (Math.abs(lo) > 1e-4) throw new Error(`cc0-${name}.glb: soles are at z=${lo}, must be 0 — every joint is a fraction of total height, so this shifts the whole skeleton`);
  if (Math.abs(hi - 1) > 1e-4) throw new Error(`cc0-${name}.glb: crown is at z=${hi}, must be 1.0 — same reason`);
  return p;
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * main
 * ──────────────────────────────────────────────────────────────────────────────────────────── */
console.log('── textures ──');
const texNames = buildTextures();
console.log(`✓ ${texNames.length} tiling FX maps + contact sheet → models/cc0/tex/`);

/* skins.json is written unconditionally: it is data, it needs no Blender, and it is the file the
 * renderers would read. Texture names are cross-checked against what was actually written, because
 * a skin pointing at a missing map is another silent fail-open. */
for (const [k, s] of Object.entries(SKINS)) {
  if (s.tex && !texNames.includes(s.tex)) throw new Error(`skin "${k}" references missing texture ${s.tex}`);
}
writeFileSync(join(OUT, 'skins.json'), JSON.stringify({
  version: 1,
  generated_by: 'scripts/build-cc0.mjs',
  read_first: 'docs/CC0-SOURCES.md for licence evidence, models/cc0/README.md for per-asset lineage',
  note: 'A skin is what one draw call can express in this engine: a tint, a uMat id from js/ronin3d.js, an emissive amount, and optionally one tiling map for the triplanar sampler in js/dogfight-gl.js. Nothing here requires a renderer change.',
  materials: MAT,
  palettes: { nouns: NOUNS, xcopy: XCOPY, smowl: SMOWL },
  palette_provenance: {
    nouns: 'exact, from packages/nouns-assets/src/image-data.json in nounsDAO/nouns-monorepo — the same table the on-chain descriptor renders from',
    xcopy: 'MEASURED from five works fetched from the artist\'s own CDN; method and per-work numbers in docs/CC0-SOURCES.md',
    smowl: 'MEASURED from seven SMOWLz tokens fetched over IPFS from the contract\'s own tokenURI',
  },
  textures: texNames,
  skins: SKINS,
}, null, 2) + '\n');
console.log(`✓ ${Object.keys(SKINS).length} skins → models/cc0/skins.json`);

if (texOnly) { console.log('\n--tex: stopping before Blender.'); process.exit(0); }

if (!haveBlender()) {
  console.error('\nblender not found on PATH — geometry not rebuilt.\n' +
    '  Ubuntu/Debian: sudo apt-get install blender\n' +
    '  or run: npm run cc0 -- --tex   (textures + skins.json only)');
  process.exit(1);
}

console.log('\n── props + environment ──');
const propLog = blender('build-cc0-props.py', [join(OUT, 'cc0-props.glb')]);
console.log(requireExport(propLog, 'the props'));
for (const l of propLog.split('\n').filter(l => l.startsWith('  PART'))) console.log(l);
const got = parts(propLog);
const missing = PROPS.filter(n => !got.has(n));
if (missing.length) {
  console.error(`\n✗ cc0-props.glb is missing: ${missing.join(', ')}`);
  console.error('  Every loader here fails open, so this would ship as silently-absent geometry.');
  process.exit(1);
}
console.log(`✓ all ${PROPS.length} named props present`);

console.log('\n── bodies ──');
for (const b of BODIES) {
  const log = blender('build-cc0-chars.py', [OUT, b]);
  requireExport(log, `cc0-${b}`);
  const p = assertBody(b, log);
  const tris = [...p.values()].reduce((a, v) => a + v.tris, 0);
  const kb = (statSync(join(OUT, `cc0-${b}.glb`)).size / 1024).toFixed(0);
  console.log(`  ✓ cc0-${b}.glb — ${p.size}/15 parts, ${tris} tris, ${kb} KB, soles at 0 / crown at 1`);
}

if (wantPreview) {
  console.log('\n── previews (Cycles on CPU — slow) ──');
  mkdirSync(PREV, { recursive: true });
  const log = blender('build-cc0-preview.py', [OUT, PREV]);
  for (const l of log.split('\n').filter(l => l.startsWith('RENDER'))) console.log('  ' + l);
  if (!log.includes('RENDER')) {
    console.error(log.split('\n').filter(l => /Error|Traceback/.test(l)).slice(0, 20).join('\n'));
    process.exit(1);
  }
}

console.log('\n✓ models/cc0/ built. Provenance: models/cc0/README.md · licence evidence: docs/CC0-SOURCES.md');

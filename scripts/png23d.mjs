#!/usr/bin/env node
/* upperdeckripmaster3030 — png23d: turn a flat card PNG into real geometry + material maps.
 *
 *   npm run png23d -- cards/art/blade-prince.webp --all
 *   npm run png23d -- <image> [--out models/cards] [--mode maps,slab,pop,...] [--preview]
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
 * The 33 hero cards are meant to MOVE. A card that tilts needs something to tilt: parallax,
 * a lit surface, an edge that catches light. This turns the one asset we actually have — a flat
 * 2:3 image — into the geometry and the maps that make that happen, without an artist redrawing
 * anything and without a single downloaded weight file.
 *
 * ── NO ML, ON PURPOSE ───────────────────────────────────────────────────────────────────────
 * Every technique here is classical image processing plus geometry. Monocular depth nets are
 * 100s of MB, may not be fetchable from this container at all, and — the part that actually
 * decides it — they hallucinate depth. On a Dadaist cartoon card a hallucinated depth field is
 * indistinguishable from a bug. Luminance, gradients and a keyed silhouette are *wrong in ways
 * you can predict*, which is the only kind of wrong that can be art-directed.
 *
 * ── DEPENDENCIES ────────────────────────────────────────────────────────────────────────────
 * Node only. The PNG codec below is written out longhand on top of node:zlib — no npm image
 * package, same rule scripts/fbx2glb.mjs follows for FBX. Non-PNG input (.webp/.jpg — the
 * placeholder deck is webp) is transcoded to a temp PNG by shelling out to python3 + PIL, which
 * is present in this container; that is a CONVENIENCE PATH, and PNG in is the actual contract.
 * GLB is written by `toGLB()` imported from scripts/fbx2glb.mjs — not forked. Materials and
 * embedded textures are bolted onto its output afterwards by embedMaterials(), which edits the
 * GLB's JSON chunk. toGLB stays the one place that knows how to lay out a glTF buffer.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────────────────────
 * models/README.md's rule applies unchanged: only run this on art the project owns. Everything
 * it emits is a mechanical derivative of its input — extruding a silhouette does not launder
 * anything, exactly as ronin-morph.js's distortion does not.
 *
 * ── THE TECHNIQUES ──────────────────────────────────────────────────────────────────────────
 *   maps        luma → height, Scharr gradient → tangent-space normal, cavity → AO. No geometry.
 *               ⚑ MEASURED: this is the one that matters. Rendering card 44 four ways at 38°/68°
 *               of tilt — flat / normal map only / relief displacement only / both — the normal
 *               map moves the image by RMS 26.9 grey levels against the flat slab, and the relief
 *               DISPLACEMENT moves it by 0.55, i.e. nothing. Adding relief on top of the normal
 *               map is another 0.72. At the size a card is seen, geometric relief is a 1.5 MB
 *               way to reproduce what a 200 KB texture already did. Keep --res low and spend the
 *               budget on the map.
 *   slab        the whole card as a rounded-corner bevelled solid, front face displaced by relief.
 *   pop         the KEYED SUBJECT as the same kind of solid — a cut-out that stands off the card.
 *   silhouette  contour-traced, simplified, ear-clipped, ring-inset bevelled extrusion. Low poly.
 *   relief      a plain displaced plane. The height-field technique on its own, for comparison.
 *   layers      background/subject split into separate quads at separate depths, for parallax.
 *   voxel       column-height voxelisation with hidden-face culling. For pixel-art cards.
 *
 * ── CONVENTIONS ─────────────────────────────────────────────────────────────────────────────
 * Output is glTF's frame: +X right, +Y up, +Z out of the card face, origin at the card centre.
 * The card is `--size` tall (default 1.0) and its width follows the image aspect. UVs are glTF
 * (v runs DOWN from the top of the image), matching what fbx2glb's own reader produces.
 * Internally all image work stays in PIXEL coordinates with y running down; the flip happens
 * once, at emit, and reverses triangle winding with it.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { basename, extname, join, dirname, resolve } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { toGLB, toOBJ } from './fbx2glb.mjs';

/* ══ PNG codec ═══════════════════════════════════════════════════════════════════════════════
 * Longhand rather than a dependency. Reads colour types 0/2/3/4/6 at bit depths 1/2/4/8/16 and
 * writes 8-bit RGBA or greyscale. Adam7 is rejected loudly instead of silently producing a
 * scrambled image — an interlaced source is rare and a wrong one is expensive to notice.        */

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
const crc32 = buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePNG(buf) {
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIG[i]) throw new Error('not a PNG (bad signature)');
  let p = 8, hdr = null, pal = null, trns = null;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    p += 12 + len;
    if (type === 'IHDR') hdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], colour: data[9], interlace: data[12] };
    else if (type === 'PLTE') pal = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
  }
  if (!hdr) throw new Error('PNG has no IHDR');
  if (hdr.interlace) throw new Error('interlaced (Adam7) PNG is not supported — re-save progressive/none');
  const ch = CHANNELS[hdr.colour];
  if (!ch) throw new Error(`unsupported PNG colour type ${hdr.colour}`);
  const raw = inflateSync(Buffer.concat(idat));

  const { w, h, depth } = hdr;
  const bitsPP = ch * depth;
  const bpp = Math.max(1, bitsPP >> 3);              // filter works on whole bytes; <8bpp ⇒ 1
  const stride = Math.ceil(w * bitsPP / 8);
  const lines = Buffer.alloc(h * stride);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[o++];
    const cur = lines.subarray(y * stride, y * stride + stride);
    raw.copy(cur, 0, o, o + stride); o += stride;
    const prev = y ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = cur[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {                                          // Paeth
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (f !== 0) throw new Error(`bad PNG filter ${f} on row ${y}`);
      cur[x] = v & 255;
    }
  }

  const out = new Uint8ClampedArray(w * h * 4);
  const maxV = (1 << depth) - 1;
  const sample = (row, i) => {                                     // i-th sub-pixel value of a row
    if (depth === 16) return lines[row * stride + i * 2];           // high byte only — 8 bpc is enough
    if (depth === 8) return lines[row * stride + i];
    const bit = i * depth, byte = lines[row * stride + (bit >> 3)];
    return (byte >> (8 - depth - (bit & 7))) & maxV;
  };
  const scale = depth === 16 ? 1 : 255 / maxV;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = (y * w + x) * 4;
    if (hdr.colour === 3) {
      const idx = sample(y, x);
      out[d] = pal ? pal[idx * 3] : 0; out[d + 1] = pal ? pal[idx * 3 + 1] : 0; out[d + 2] = pal ? pal[idx * 3 + 2] : 0;
      out[d + 3] = (trns && idx < trns.length) ? trns[idx] : 255;
    } else if (hdr.colour === 0 || hdr.colour === 4) {
      const g = sample(y, x * ch) * (depth === 16 ? 1 : scale);
      out[d] = out[d + 1] = out[d + 2] = g;
      out[d + 3] = hdr.colour === 4 ? sample(y, x * ch + 1) * (depth === 16 ? 1 : scale) : 255;
    } else {
      const b0 = x * ch;
      out[d] = sample(y, b0) * (depth === 16 ? 1 : scale);
      out[d + 1] = sample(y, b0 + 1) * (depth === 16 ? 1 : scale);
      out[d + 2] = sample(y, b0 + 2) * (depth === 16 ? 1 : scale);
      out[d + 3] = hdr.colour === 6 ? sample(y, b0 + 3) * (depth === 16 ? 1 : scale) : 255;
    }
  }
  return { w, h, data: out, hadAlpha: hdr.colour === 4 || hdr.colour === 6 || !!(hdr.colour === 3 && trns) };
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function encodePNG(w, h, data, { grey = false } = {}) {
  const ch = grey ? 1 : 4;
  const stride = w * ch;
  // Adaptive filtering: try all five per row and keep the one with the smallest sum of absolute
  // signed deltas. That is the heuristic libpng uses; it is cheap and it roughly halves the file
  // on the smooth gradients a normal map is made of.
  const rows = [];
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) cur[i] = data[y * stride + i];
    let best = null, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const line = new Uint8Array(stride); let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
        let v;
        if (f === 0) v = cur[x];
        else if (f === 1) v = cur[x] - a;
        else if (f === 2) v = cur[x] - b;
        else if (f === 3) v = cur[x] - ((a + b) >> 1);
        else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = cur[x] - ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)); }
        line[x] = v & 255;
        score += line[x] < 128 ? line[x] : 256 - line[x];
      }
      if (score < bestScore) { bestScore = score; best = { f, line }; }
    }
    rows.push(Buffer.from([best.f]), Buffer.from(best.line));
    prev = cur;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = grey ? 0 : 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from(PNG_SIG), pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

/* Non-PNG input. PIL is present in this container and reads webp/jpeg/gif; anything it cannot
 * read fails here with the reason rather than three stages later with a blank mask. */
function loadImage(path) {
  if (extname(path).toLowerCase() === '.png') return decodePNG(readFileSync(path));
  const tmp = join(tmpdir(), `png23d-${process.pid}-${Date.now()}.png`);
  try {
    execFileSync('python3', ['-c',
      'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1])\nim = im.convert("RGBA")\nim.save(sys.argv[2], "PNG")\n',
      path, tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    throw new Error(`cannot read ${extname(path) || 'that file'} — png23d decodes PNG itself and shells out to python3+PIL for anything else.\n  ${String(e.stderr || e.message).trim().split('\n').pop()}`);
  }
  const img = decodePNG(readFileSync(tmp));
  rmSync(tmp, { force: true });
  return img;
}

/* ══ image ops ═══════════════════════════════════════════════════════════════════════════════ */

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

/** Rec.709 luma, 0..1. */
function lumaOf(img) {
  const { w, h, data } = img, out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4)
    out[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
  return out;
}

/** Separable gaussian. sigma in pixels; radius clipped at 3σ. Reflect at the edges — zero-pad
 *  darkens the border, which on a card is exactly where the frame is and reads as a vignette
 *  baked into the height field. */
function blur(src, w, h, sigma) {
  if (sigma <= 0) return Float32Array.from(src);
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(r * 2 + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) { const xx = clamp(x + i, 0, w - 1); a += src[y * w + xx] * k[i + r]; }
    tmp[y * w + x] = a;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) { const yy = clamp(y + i, 0, h - 1); a += tmp[yy * w + x] * k[i + r]; }
    out[y * w + x] = a;
  }
  return out;
}

/** Bilateral filter — smooths inside a region without crossing an edge.
 *  This is the load-bearing filter for relief. A plain gaussian on cartoon art bleeds the black
 *  keylines outward into a soft grey moat, so every outline becomes a wide shallow valley and
 *  the whole card reads as melted wax. The range term keeps the line a line. Not separable, so
 *  it runs on a downsampled copy when the image is large — the height field is low-frequency by
 *  intent and nobody can see the difference. */
function bilateral(src, w, h, sigmaS, sigmaR) {
  const r = Math.max(1, Math.round(sigmaS * 2));
  const ks = new Float32Array((r * 2 + 1) * (r * 2 + 1));
  for (let j = -r, i = 0; j <= r; j++) for (let k = -r; k <= r; k++, i++) ks[i] = Math.exp(-(j * j + k * k) / (2 * sigmaS * sigmaS));
  const inv2r2 = 1 / (2 * sigmaR * sigmaR);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = src[y * w + x];
    let acc = 0, wt = 0, i = 0;
    for (let j = -r; j <= r; j++) {
      const yy = clamp(y + j, 0, h - 1) * w;
      for (let k = -r; k <= r; k++, i++) {
        const v = src[yy + clamp(x + k, 0, w - 1)];
        const d = v - c;
        const g = ks[i] * Math.exp(-d * d * inv2r2);
        acc += v * g; wt += g;
      }
    }
    out[y * w + x] = acc / wt;
  }
  return out;
}

/** Box downsample by an integer factor, and bilinear upsample back. */
function downsample(src, w, h, f) {
  const dw = Math.max(1, Math.floor(w / f)), dh = Math.max(1, Math.floor(h / f));
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    let a = 0, n = 0;
    for (let j = 0; j < f; j++) for (let k = 0; k < f; k++) {
      const sy = y * f + j, sx = x * f + k;
      if (sy < h && sx < w) { a += src[sy * w + sx]; n++; }
    }
    out[y * dw + x] = a / n;
  }
  return { d: out, w: dw, h: dh };
}
function upsample(src, sw, sh, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = clamp((y + 0.5) * sh / h - 0.5, 0, sh - 1), y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = clamp((x + 0.5) * sw / w - 0.5, 0, sw - 1), x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const a = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx;
      const b = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx;
      out[y * w + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

/** Stretch to 0..1 between two percentiles. A single blown highlight on a foil card otherwise
 *  owns the whole range and everything else flattens to the bottom 10%. */
function normalise(src, lo = 0.02, hi = 0.98) {
  const s = Float32Array.from(src).sort();
  const a = s[Math.floor(lo * (s.length - 1))], b = s[Math.floor(hi * (s.length - 1))];
  const span = (b - a) || 1;
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = clamp((src[i] - a) / span, 0, 1);
  return out;
}

/* ══ height / normal / AO ════════════════════════════════════════════════════════════════════ */

/** The height signal the geometry and the maps both ride on.
 *  `detail` picks how much of the fine, edge-preserved structure survives: 0 = the smooth
 *  bilateral base only (a soft relief), 1 = base + the full high-pass (engraved keylines). */
function heightField(luma, w, h, { blurPx = 2.2, range = 0.14, detail = 0.55, invert = false } = {}) {
  const f = Math.max(1, Math.round(Math.max(w, h) / 420));         // bilateral is O(r²); shrink first
  const small = f > 1 ? downsample(luma, w, h, f) : { d: luma, w, h };
  const base0 = bilateral(small.d, small.w, small.h, Math.max(1, blurPx / f), range);
  const base = f > 1 ? upsample(base0, small.w, small.h, w, h) : base0;
  const soft = blur(base, w, h, Math.max(2, blurPx * 3));
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = base[i] + detail * (base[i] - soft[i]) * 2.0;
  const n = normalise(out, 0.01, 0.99);
  if (invert) for (let i = 0; i < n.length; i++) n[i] = 1 - n[i];
  return n;
}

/** Scharr gradient → tangent-space normal map.
 *  Scharr and not Sobel: Sobel's 3×3 kernel has a measurable angular error off the axes (~3–5°
 *  on a 45° edge), which on a card full of diagonal linework tilts every highlight the same way
 *  and reads as the light being in the wrong place. Scharr is the rotation-optimised version of
 *  the same kernel and costs nothing extra.
 *  glTF's normal texture is OpenGL convention: +G points along +T, and our V axis runs DOWN the
 *  image, so the Y gradient is negated. --normal-flip-y exists because the other convention is
 *  common enough in hand-authored maps to be worth a switch. */
function normalMap(height, w, h, { strength = 2.4, flipY = false } = {}) {
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (x, y) => height[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
    const l = at(x - 1, y), r = at(x + 1, y);
    const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
    const gx = (3 * tr + 10 * r + 3 * br) - (3 * tl + 10 * l + 3 * bl);
    const gy = (3 * bl + 10 * b + 3 * br) - (3 * tl + 10 * t + 3 * tr);
    let nx = -gx * strength, ny = (flipY ? gy : -gy) * strength, nz = 1;
    const il = 1 / Math.hypot(nx, ny, nz);
    const d = (y * w + x) * 4;
    out[d] = (nx * il * 0.5 + 0.5) * 255; out[d + 1] = (ny * il * 0.5 + 0.5) * 255;
    out[d + 2] = (nz * il * 0.5 + 0.5) * 255; out[d + 3] = 255;
  }
  return out;
}

/** Cavity AO: how far below its own neighbourhood a pixel sits. Not a ray-traced occlusion and
 *  not pretending to be — it darkens the insides of the linework, which at 300 px is the entire
 *  visible effect of real AO anyway. */
function aoMap(height, w, h, { radius = 9, strength = 1.5 } = {}) {
  const wide = blur(height, w, h, radius);
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i++) out[i] = clamp(1 - (wide[i] - height[i]) * strength * 2.5, 0, 1) * 255;
  return out;
}

function greyToBytes(f) {
  const out = new Uint8ClampedArray(f.length);
  for (let i = 0; i < f.length; i++) out[i] = f[i] * 255;
  return out;
}

/* ══ masks ═══════════════════════════════════════════════════════════════════════════════════ */

/** ONE flood pass, confined to `live`, seeded from `live`'s outer frontier.
 *
 *  Two tolerances, and the pair is the whole trick. The GLOBAL test (against the frontier's median
 *  colour) stops the fill escaping into the art; the LOCAL test (against the neighbour it spread
 *  from) is what lets it cross a gradient at all. Global alone cannot key the pink→yellow ramp
 *  half this deck uses as a backdrop; local alone walks straight through a soft airbrushed edge
 *  and eats the subject. Requiring both is what a hand-tuned magic wand does.                    */
function floodPass(img, live, tol, grad = false) {
  const { w, h, data } = img;
  // The seed ring sits 2–6 px INSIDE the live region, not on its boundary.
  // ⚠ This is the fix for the peel stalling after one band, and it took a debug dump to find.
  // Sampling the boundary itself samples the ragged, half-keyed, anti-aliased edge the previous
  // pass just cut — on `ink-sketch` that made the frontier a smear of mid-greens whose mode was
  // nowhere near the pure white backdrop two pixels further in, so pass 2 keyed 0.3% and gave up
  // with the entire art panel still labelled "subject". Standing off the cut edge samples the
  // backdrop instead. Distance comes from the same EDT the geometry uses, over a padded grid so
  // that "outside the image" counts as dead and pass 0 needs no special case.
  const pw = w + 2, ph = h + 2;
  const pad = new Uint8Array(pw * ph);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pad[(y + 1) * pw + (x + 1)] = live[y * w + x];
  const d2 = edt(pad, pw, ph);
  const frontier = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (live[i]) { const d = d2[(y + 1) * pw + (x + 1)]; if (d >= 4 && d <= 40) frontier.push(i); }
  }
  if (frontier.length < 32) {                                       // thin sliver: fall back to the edge itself
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (live[i] && d2[(y + 1) * pw + (x + 1)] >= 1 && d2[(y + 1) * pw + (x + 1)] < 4) frontier.push(i);
    }
  }
  if (!frontier.length) return null;
  // Seed = the MODAL colour of the frontier, found in a 16³ histogram and then refined to the mean
  // of everything near that mode.
  // ⚠ The median was the first attempt and it is wrong for the second peel onwards. After the
  // printed frame comes off, the frontier of a framed card is typically ~45% backdrop, ~30% the
  // keyline the previous pass just cut through, and ~25% subject — three modes. A per-channel
  // median of that is a colour that appears nowhere on the card, so nothing floods and the peel
  // stops one band too early with the whole art panel called "subject". The mode is the backdrop.
  const bin = i => ((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4);
  const hist = new Map();
  for (const i of frontier) { const b = bin(i); hist.set(b, (hist.get(b) || 0) + 1); }
  let modeBin = -1, modeN = -1;
  for (const [b, n] of hist) if (n > modeN) { modeN = n; modeBin = b; }
  let sr = 0, sg = 0, sb = 0, mn = 0;
  for (const i of frontier) if (bin(i) === modeBin) { sr += data[i * 4]; sg += data[i * 4 + 1]; sb += data[i * 4 + 2]; mn++; }
  sr = Math.round(sr / mn); sg = Math.round(sg / mn); sb = Math.round(sb / mn);

  const gTol = tol * 255 * Math.sqrt(3), lTol = gTol * 0.42;
  // "Is there a background here at all?" — the fraction of the frontier that agrees with the mode.
  // 0.3, not 0.5: three-mode frontiers are the normal case and a backdrop rarely owns half a
  // frontier ring. The flood's own local+global tolerances and the band-size guards below are what
  // actually stop a bad key, not this number; this only rejects a frontier with no mode at all.
  let inTol = 0;
  for (const i of frontier) if (Math.hypot(data[i * 4] - sr, data[i * 4 + 1] - sg, data[i * 4 + 2] - sb) <= gTol) inTol++;
  const cover = inTol / frontier.length;
  if (!grad && cover < 0.30) return { seed: [sr, sg, sb], cover, bg: null };

  const bg = new Uint8Array(w * h), stack = [];
  // `grad` widens the global leash so a printed gradient backdrop — half this deck uses one — can
  // be walked end to end. It is opt-in because the global bound is the only thing stopping the
  // fill from strolling through a soft airbrushed edge into the subject; with it wide open the
  // local step is the sole gate, which is right for a smooth ramp and wrong for photographic art.
  const globalOK = i => Math.hypot(data[i * 4] - sr, data[i * 4 + 1] - sg, data[i * 4 + 2] - sb) <= gTol * (grad ? 8.0 : 2.0);
  const localOK = (i, from) => Math.hypot(data[i * 4] - data[from * 4], data[i * 4 + 1] - data[from * 4 + 1], data[i * 4 + 2] - data[from * 4 + 2]) <= lTol;
  for (const i of frontier) if (Math.hypot(data[i * 4] - sr, data[i * 4 + 1] - sg, data[i * 4 + 2] - sb) <= gTol) { bg[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    const step = j => { if (live[j] && !bg[j] && globalOK(j) && localOK(j, i)) { bg[j] = 1; stack.push(j); } };
    if (x > 0) step(i - 1);
    if (x < w - 1) step(i + 1);
    if (y > 0) step(i - w);
    if (y < h - 1) step(i + w);
  }
  return { seed: [sr, sg, sb], cover, bg };
}

/** Peeling background key. Returns the SUBJECT mask plus the bands that were peeled off it.
 *
 *  ⚑ ONE PASS IS NOT ENOUGH ON A TRADING CARD, and that is the single most useful thing measured
 *  here. Every card in this deck has a printed border, so a flood from the image edge keys the
 *  BORDER and stops — the "subject" it returns is the whole inner rectangle, which is not wrong
 *  but is not the cut-out anyone wanted either. Peeling again from the frontier the first pass
 *  left behind keys the mat/backdrop, and what remains is the actual figure. A card is
 *  frame → backdrop → subject, and those are also exactly the three planes technique 4 wants,
 *  so one peel feeds both.
 *
 *  Each pass stops on its own evidence: too small a band, too greedy a band, a frontier that is
 *  not one colour, or too little subject left. Fail-open — a card that keys nothing comes back as
 *  the whole rectangle with a printed note, because a card with a printed border IS a rectangle
 *  and slab mode wants precisely that.                                                           */
function keyPeel(img, spec = 'auto', tol = 0.11, maxPasses = 3, minSubject = 0.12) {
  const { w, h, data } = img;
  const live = new Uint8Array(w * h).fill(1);
  const bands = [];
  const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  const grad = spec === 'grad';

  if (spec === 'none' || spec === 'rect') return { subject: live, bands, how: 'rect (whole image)' };

  if (spec === 'alpha' || spec === 'auto') {
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 128) clear++;
    if (clear > w * h * 0.01) {
      const band = new Uint8Array(w * h);
      for (let i = 0, p = 3; i < live.length; i++, p += 4) if (data[p] < 128) { live[i] = 0; band[i] = 1; }
      return { subject: live, bands: [band], how: `alpha (${(clear / (w * h) * 100).toFixed(1)}% transparent)` };
    }
    if (spec === 'alpha') return { subject: live, bands, how: 'alpha absent — fell back to rect' };
  }

  const notes = [];
  for (let pass = 0; pass < Math.max(1, maxPasses); pass++) {
    const r = floodPass(img, live, tol, grad);
    if (!r) break;
    if (!r.bg) { notes.push(`pass${pass} stopped: frontier is not one colour (${(r.cover * 100).toFixed(0)}% agree)`); break; }
    let n = 0; for (let i = 0; i < r.bg.length; i++) n += r.bg[i];
    let liveN = 0; for (let i = 0; i < live.length; i++) liveN += live[i];
    const fOfFrame = n / (w * h), fOfLive = n / liveN;
    if (fOfFrame < 0.012) { notes.push(`pass${pass} stopped: band only ${(fOfFrame * 100).toFixed(1)}% of frame`); break; }
    if (fOfLive > 0.93) { notes.push(`pass${pass} stopped: band would take ${(fOfLive * 100).toFixed(0)}% of what is left`); break; }
    // ⚠ CHECKED BEFORE THE BAND IS ACCEPTED, and that ordering is the whole point. Peeling is
    // greedy and the pass AFTER the one that finally strips the backdrop is the pass that starts
    // eating the figure — on `alley-trio` at --peel 6 the run went frame → holo rule → keyline →
    // gradient → and then took the dogs' own bodies, leaving 5% of "subject" that was just the
    // white catchlights inside them. Accepting a band and noticing afterwards is one band too
    // late; there is nothing to undo it with.
    if ((liveN - n) < w * h * minSubject) { notes.push(`pass${pass} stopped: would leave only ${(((liveN - n) / (w * h)) * 100).toFixed(1)}% subject`); break; }
    for (let i = 0; i < live.length; i++) if (r.bg[i]) live[i] = 0;
    bands.push(r.bg);
    notes.push(`pass${pass} ${hex(r.seed)} −${(fOfFrame * 100).toFixed(1)}%`);
  }
  if (!bands.length) return { subject: live, bands, how: `no key (${notes.join('; ') || 'nothing matched'}) — kept the whole rectangle` };
  return { subject: live, bands, how: notes.join(' · ') };
}

/** A rounded-rectangle mask — the actual shape of a trading card. */
function roundedRectMask(w, h, radiusPx) {
  const m = new Uint8Array(w * h);
  const r = Math.max(0, radiusPx);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = Math.max(r - (x + 0.5), (x + 0.5) - (w - r), 0);
    const dy = Math.max(r - (y + 0.5), (y + 0.5) - (h - r), 0);
    m[y * w + x] = Math.hypot(dx, dy) <= r ? 1 : 0;
  }
  return m;
}

/** Binary morphology by the distance transform — one EDT is cheaper and more isotropic than N
 *  passes of a 3×3 structuring element, and it does not square off circles the way a box does. */
function morph(mask, w, h, openPx, closePx) {
  let m = mask;
  if (closePx > 0) { m = dilate(m, w, h, closePx); m = erode(m, w, h, closePx); }
  if (openPx > 0) { m = erode(m, w, h, openPx); m = dilate(m, w, h, openPx); }
  return m;
}
const dilate = (m, w, h, r) => { const d = edt(invertMask(m), w, h); const o = new Uint8Array(w * h); for (let i = 0; i < o.length; i++) o[i] = (m[i] || d[i] <= r * r) ? 1 : 0; return o; };
const erode = (m, w, h, r) => { const d = edt(m, w, h); const o = new Uint8Array(w * h); for (let i = 0; i < o.length; i++) o[i] = (!m[i] || d[i] <= r * r) ? 0 : 1; return o; };
const invertMask = m => { const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 1; return o; };

/** Connected components (4-neighbour). Drops anything under `minArea`, and optionally keeps only
 *  the largest — a keyed subject is one thing, and the speckle a chroma key leaves in a busy
 *  background otherwise becomes fifty tiny extruded islands. */
function components(mask, w, h) {
  const lab = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const id = sizes.length; sizes.push(0);
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop(); sizes[id]++;
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && mask[i - 1] && lab[i - 1] < 0) { lab[i - 1] = id; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && lab[i + 1] < 0) { lab[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && lab[i - w] < 0) { lab[i - w] = id; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && lab[i + w] < 0) { lab[i + w] = id; stack.push(i + w); }
    }
  }
  return { lab, sizes };
}

function cleanMask(mask, w, h, { minArea = 0.002, keepLargest = false, fillHoles = 0.004 } = {}) {
  const { lab, sizes } = components(mask, w, h);
  const min = minArea * w * h;
  const big = keepLargest && sizes.length ? sizes.indexOf(Math.max(...sizes)) : -1;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const id = lab[i];
    out[i] = id >= 0 && sizes[id] >= min && (big < 0 || id === big) ? 1 : 0;
  }
  if (fillHoles > 0) {                                   // a hole is a background blob that does not touch the border
    const inv = invertMask(out);
    const { lab: bl, sizes: bs } = components(inv, w, h);
    const outer = new Set();
    for (let x = 0; x < w; x++) { if (bl[x] >= 0) outer.add(bl[x]); if (bl[(h - 1) * w + x] >= 0) outer.add(bl[(h - 1) * w + x]); }
    for (let y = 0; y < h; y++) { if (bl[y * w] >= 0) outer.add(bl[y * w]); if (bl[y * w + w - 1] >= 0) outer.add(bl[y * w + w - 1]); }
    const lim = fillHoles * w * h;
    for (let i = 0; i < out.length; i++) if (!out[i] && bl[i] >= 0 && !outer.has(bl[i]) && bs[bl[i]] < lim) out[i] = 1;
  }
  return out;
}

/* ══ signed distance field ═══════════════════════════════════════════════════════════════════
 * Felzenszwalb & Huttenlocher's exact squared EDT: a 1-D lower-envelope-of-parabolas transform
 * run down the columns and then across the rows. O(n) and exact, where the chamfer masks people
 * usually reach for are neither — and a chamfer's error shows up directly as a wobble in the
 * extruded silhouette, because the contour IS an iso-line of this field.                        */

function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Squared euclidean distance from every pixel to the nearest ZERO of `mask`. */
function edt(mask, w, h) {
  const INF = 1e12;
  const g = new Float64Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = mask[i] ? INF : 0;
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n + 1), z = new Float64Array(n + 2);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x];
  }
  return g;
}

/** Signed distance in PIXELS: positive inside the mask, negative outside, ~0 on the boundary.
 *  The half-pixel offset centres the zero crossing between the last inside pixel and the first
 *  outside one instead of on top of the inside pixel — without it every silhouette comes out
 *  half a pixel fat, which is invisible on one card and cumulative once you bevel it. */
function signedDistance(mask, w, h, smooth = 0.9) {
  const din = edt(mask, w, h), dout = edt(invertMask(mask), w, h);
  const f = new Float32Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = mask[i] ? Math.sqrt(dout[i]) - 0.5 : 0.5 - Math.sqrt(din[i]);
  return smooth > 0 ? blur(f, w, h, smooth) : f;
}

const sampleF = (F, w, h, x, y) => {
  const fx = clamp(x, 0, w - 1.001), fy = clamp(y, 0, h - 1.001);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const a = F[y0 * w + x0] * (1 - tx) + F[y0 * w + x0 + 1] * tx;
  const b = F[(y0 + 1) * w + x0] * (1 - tx) + F[(y0 + 1) * w + x0 + 1] * tx;
  return a * (1 - ty) + b * ty;
};
const gradF = (F, w, h, x, y) => {
  const e = 0.75;
  return [(sampleF(F, w, h, x + e, y) - sampleF(F, w, h, x - e, y)) / (2 * e),
          (sampleF(F, w, h, x, y + e) - sampleF(F, w, h, x, y - e)) / (2 * e)];
};

/* ══ contours ════════════════════════════════════════════════════════════════════════════════
 * Marching squares on the SIGNED DISTANCE FIELD rather than on the binary mask. Contouring the
 * mask directly gives a staircase that no amount of downstream simplification recovers from;
 * contouring a smooth field gives sub-pixel crossings, and the same field then drives the bevel
 * inset, so the outline and the bevel can never disagree about where the edge is.
 *
 * Crossings are keyed by GRID EDGE (`h`/`v` + integer coords), not by their float position, so
 * chaining is exact — two cells that share an edge produce the identical key by construction and
 * there is no epsilon anywhere in the loop assembly.                                            */

const MS_TABLE = {
  1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]],
  8: [[2, 3]], 9: [[2, 0]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
};

function contours(F, w, h, level = 0) {
  const pts = new Map(), adj = new Map(), segs = [];
  const addPt = (key, x, y) => { if (!pts.has(key)) pts.set(key, [x, y]); return key; };
  const addSeg = (a, b) => {
    const id = segs.length; segs.push([a, b]);
    if (!adj.has(a)) adj.set(a, []); adj.get(a).push(id);
    if (!adj.has(b)) adj.set(b, []); adj.get(b).push(id);
  };
  const lerp = (va, vb) => (level - va) / (vb - va);

  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const a = F[y * w + x], b = F[y * w + x + 1], c = F[(y + 1) * w + x + 1], d = F[(y + 1) * w + x];
    const code = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const e = [];
    e[0] = () => addPt(`h${x},${y}`, x + lerp(a, b), y);
    e[1] = () => addPt(`v${x + 1},${y}`, x + 1, y + lerp(b, c));
    e[2] = () => addPt(`h${x},${y + 1}`, x + 1 - lerp(c, d), y + 1);
    e[3] = () => addPt(`v${x},${y}`, x, y + 1 - lerp(d, a));
    let pairs = MS_TABLE[code];
    if (!pairs) {                                                     // 5 and 10 — the saddles
      const centreIn = ((a + b + c + d) / 4) > level;
      const diagonalIn = code === 5;                                  // a,c inside vs b,d inside
      pairs = (centreIn === diagonalIn) ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
    }
    for (const [p, q] of pairs) addSeg(e[p](), e[q]());
  }

  const used = new Uint8Array(segs.length);
  const loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    const loop = [];
    let seg = s0, at = segs[s0][0];
    while (seg >= 0 && !used[seg]) {
      used[seg] = 1;
      loop.push(pts.get(at));
      const [a, b] = segs[seg];
      at = at === a ? b : a;
      const cand = adj.get(at) || [];
      seg = cand.find(i => !used[i]);
      if (seg === undefined) seg = -1;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

const area2 = loop => { let a = 0; for (let i = 0, n = loop.length; i < n; i++) { const p = loop[i], q = loop[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

/** Douglas–Peucker on a closed loop. The two mutually-most-distant points are pinned first so
 *  the loop is split into two open chains — running the open-chain algorithm on a ring and
 *  hoping collapses shapes whose start point happens to sit mid-curve. */
function simplifyLoop(loop, tol) {
  const n = loop.length;
  if (n < 8 || tol <= 0) return loop;
  let i0 = 0, i1 = 0, best = -1;
  for (let i = 1; i < n; i++) { const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]); if (d > best) { best = d; i1 = i; } }
  best = -1;
  for (let i = 0; i < n; i++) { const d = Math.hypot(loop[i][0] - loop[i1][0], loop[i][1] - loop[i1][1]); if (d > best) { best = d; i0 = i; } }
  if (i0 > i1) { const t = i0; i0 = i1; i1 = t; }
  const chainA = loop.slice(i0, i1 + 1);
  const chainB = loop.slice(i1).concat(loop.slice(0, i0 + 1));
  const out = dp(chainA, tol).slice(0, -1).concat(dp(chainB, tol).slice(0, -1));
  return out.length >= 3 ? out : loop;
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let worst = -1, wi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > worst) { worst = d; wi = i; }
    }
    if (worst > tol && wi > 0) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/** Split raw loops into { outer, holes } groups. Orientation is SELF-CALIBRATED off the biggest
 *  loop rather than assumed from the marching-squares table: the table's handedness depends on
 *  which way y runs and on the sign convention of the field, and getting it backwards produces a
 *  mesh that is inside-out in a way that only shows up under a specific light. */
function groupLoops(loops) {
  if (!loops.length) return [];
  const areas = loops.map(area2);
  const outerSign = Math.sign(areas[areas.map(Math.abs).indexOf(Math.max(...areas.map(Math.abs)))]);
  const outers = [], holes = [];
  loops.forEach((l, i) => (Math.sign(areas[i]) === outerSign ? outers : holes).push({ pts: l, area: Math.abs(areas[i]) }));
  const groups = outers.sort((a, b) => b.area - a.area).map(o => ({ outer: o.pts, holes: [] }));
  for (const hole of holes) {
    let best = -1, bestArea = Infinity;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (pointInPoly(hole.pts[0], g.outer) && polyArea(g.outer) < bestArea) { best = i; bestArea = polyArea(g.outer); }
    }
    if (best >= 0) groups[best].holes.push(hole.pts);
  }
  return groups;
}
const polyArea = l => Math.abs(area2(l));
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/* ══ triangulation ═══════════════════════════════════════════════════════════════════════════
 * Ear clipping with Eberly hole bridging. Written out rather than pulled in because the whole
 * chain here is dependency-free and this is the only piece that would have broken that.
 * Convention inside this section: the working polygon is CCW-positive under area2(), holes are
 * negative, and every ring is spliced into ONE simple polygon before a single ear is cut.       */

function triangulate(outer, holes) {
  let poly = area2(outer) > 0 ? outer.slice() : outer.slice().reverse();
  const hs = holes.map(h => (area2(h) < 0 ? h.slice() : h.slice().reverse()))
                  .sort((a, b) => Math.max(...b.map(p => p[0])) - Math.max(...a.map(p => p[0])));
  for (const hole of hs) {
    const merged = bridgeHole(poly, hole);
    if (merged) poly = merged;                 // a hole that cannot see the outer ring is FILLED,
  }                                            // not fatal — one solid ear beats no mesh at all
  return { poly, tris: earClip(poly) };
}

function bridgeHole(poly, hole) {
  let mi = 0;
  for (let i = 1; i < hole.length; i++) if (hole[i][0] > hole[mi][0]) mi = i;
  const M = hole[mi];
  // Cast +x from M; find the nearest edge crossing it, and the endpoint of that edge with the
  // larger x. Then check every reflex vertex of the outer ring against the triangle (M, I, P) —
  // if one is inside, it occludes P and becomes the bridge instead. Straight Eberly.
  let bx = Infinity, bi = -1;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if ((a[1] > M[1]) === (b[1] > M[1])) continue;
    const t = (M[1] - a[1]) / (b[1] - a[1]);
    const x = a[0] + t * (b[0] - a[0]);
    if (x >= M[0] && x < bx) { bx = x; bi = i; }
  }
  if (bi < 0) return null;
  const a = poly[bi], b = poly[(bi + 1) % poly.length];
  let p = a[0] > b[0] ? bi : (bi + 1) % poly.length;
  const I = [bx, M[1]];
  const tri = [M, I, poly[p]];
  let bestAngle = Infinity;
  for (let i = 0; i < poly.length; i++) {
    if (i === p) continue;
    const v = poly[i];
    if (v[0] <= M[0]) continue;
    if (!pointInTri(v, tri[0], tri[1], tri[2])) continue;
    const ang = Math.abs(Math.atan2(v[1] - M[1], v[0] - M[0]));
    if (ang < bestAngle) { bestAngle = ang; p = i; }
  }
  const out = poly.slice(0, p + 1);
  for (let k = 0; k < hole.length; k++) out.push(hole[(mi + k) % hole.length]);
  out.push(hole[mi], poly[p]);
  return out.concat(poly.slice(p + 1));
}

function pointInTri(p, a, b, c) {
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(d) < 1e-12) return false;
  const u = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / d;
  const v = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / d;
  return u >= 0 && v >= 0 && u + v <= 1;
}

function earClip(poly) {
  const n = poly.length;
  const idx = [...Array(n).keys()];
  const tris = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let guard = n * n + 64;
  while (idx.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = poly[ia], b = poly[ib], c = poly[ic];
      if (cross(a, b, c) <= 0) continue;                              // reflex or degenerate
      let ok = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (pointInTri(poly[j], a, b, c)) { ok = false; break; }
      }
      if (!ok) continue;
      tris.push(ia, ib, ic);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    // A polygon that yields no ear is self-intersecting (thin bridges from an aggressive
    // simplification do this). Snip the sharpest corner and carry on — a slightly wrong triangle
    // is recoverable, an infinite loop in a build script is not.
    if (!cut) {
      let worst = -1, wi = 0;
      for (let i = 0; i < idx.length; i++) {
        const a = poly[idx[(i + idx.length - 1) % idx.length]], b = poly[idx[i]], c = poly[idx[(i + 1) % idx.length]];
        const s = cross(a, b, c);
        if (s > worst) { worst = s; wi = i; }
      }
      const ia = idx[(wi + idx.length - 1) % idx.length], ib = idx[wi], ic = idx[(wi + 1) % idx.length];
      tris.push(ia, ib, ic);
      idx.splice(wi, 1);
    }
  }
  if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
  return tris;
}

/* ══ mesh building ═══════════════════════════════════════════════════════════════════════════ */

class Mesh {
  constructor(name) { this.name = name; this.pos = []; this.uv = []; this.idx = []; }
  /** px,py in IMAGE pixels; z in model units. The frame flip lives here and only here. */
  v(px, py, z, f) {
    this.pos.push((px - f.w / 2) * f.s, (f.h / 2 - py) * f.s, z);
    this.uv.push(px / f.w, py / f.h);
    return this.pos.length / 3 - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  get tris() { return this.idx.length / 3; }
  /** Area-weighted vertex normals. Accumulating unnormalised face normals IS the area weighting
   *  — the cross product's length is twice the triangle area — which is what stops a fan of tiny
   *  slivers round a bevel corner from out-voting the big flat cap next to it. */
  finish() {
    const P = new Float32Array(this.pos), N = new Float32Array(P.length);
    for (let i = 0; i < this.idx.length; i += 3) {
      const a = this.idx[i] * 3, b = this.idx[i + 1] * 3, c = this.idx[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
    }
    for (let i = 0; i < N.length; i += 3) {
      const l = Math.hypot(N[i], N[i + 1], N[i + 2]);
      if (l) { N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; } else N[i + 2] = 1;
    }
    return { name: this.name, pos: P, nrm: N, uv: new Float32Array(this.uv), idx: new Uint32Array(this.idx) };
  }
}

/** The z profile shared by every solid here: a straight wall, then a quarter-round bevel.
 *  `round` 0 = a hard-edged slab, 1 = a full pillow. Returned as ring (inset, z) pairs so the
 *  contour path and the grid path cannot drift apart. */
function bevelProfile(depth, bevelPx, round, rings) {
  const halfD = depth / 2, bd = halfD * round, wall = halfD - bd;
  const out = [];
  for (let k = 0; k <= rings; k++) {
    const th = (k / rings) * Math.PI / 2;
    out.push({ inset: bevelPx * (1 - Math.cos(th)), z: wall + bd * Math.sin(th) });
  }
  return { rings: out, wall };
}

/* ── technique 1: silhouette extrusion (contour → simplify → ear-clip → inset rings) ────────── */

function buildSilhouette(F, w, h, groups, f, opt) {
  const m = new Mesh(opt.name || 'silhouette');
  const prof = bevelProfile(opt.depth, opt.bevelPx, opt.round, opt.round > 0 ? opt.bevelRings : 0);
  for (const g of groups) {
    // Every ring is the SAME loop moved along the field gradient, so ring k and ring k+1 share a
    // vertex count and stitch as a plain quad strip. Insetting by re-contouring at a higher
    // iso-level would be more accurate and would also change the vertex count and the topology
    // (a thin arm pinches off), which is a stitching problem with no clean answer.
    const rings = [g.outer, ...g.holes].map(loop => prof.rings.map(r => insetLoop(loop, F, w, h, r.inset)));
    const front = [], back = [];
    for (let k = 0; k < prof.rings.length; k++) {
      front.push(rings.map(r => r[k].map(p => m.v(p[0], p[1], prof.rings[k].z, f))));
      back.push(rings.map(r => r[k].map(p => m.v(p[0], p[1], -prof.rings[k].z, f))));
    }
    // caps — triangulate the innermost ring, once, and reuse the winding for both faces
    const last = prof.rings.length - 1;
    const capOuter = rings[0][last], capHoles = rings.slice(1).map(r => r[last]);
    const { poly, tris } = triangulate(capOuter, capHoles);
    const capF = poly.map(p => m.v(p[0], p[1], prof.rings[last].z, f));
    const capB = poly.map(p => m.v(p[0], p[1], -prof.rings[last].z, f));
    for (let i = 0; i < tris.length; i += 3) {
      m.tri(capF[tris[i]], capF[tris[i + 2]], capF[tris[i + 1]]);      // +Z faces the viewer
      m.tri(capB[tris[i]], capB[tris[i + 1]], capB[tris[i + 2]]);
    }
    for (let r = 0; r < rings.length; r++) {
      const n = rings[r][0].length;
      for (let k = 0; k < last; k++) {
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          m.quad(front[k][r][i], front[k][r][j], front[k + 1][r][j], front[k + 1][r][i]);
          m.quad(back[k][r][j], back[k][r][i], back[k + 1][r][i], back[k + 1][r][j]);
        }
      }
      if (prof.wall > 1e-6) for (let i = 0; i < n; i++) {              // the straight side wall
        const j = (i + 1) % n;
        m.quad(back[0][r][i], back[0][r][j], front[0][r][j], front[0][r][i]);
      }
    }
  }
  return m;
}

/** Move a loop `d` pixels into the shape by walking the SDF, not by offsetting the polygon.
 *  A polygon offset self-intersects on any concave run and needs a full clipper to repair; the
 *  field already knows how far it is to the edge everywhere, so a couple of Newton steps toward
 *  iso-level `d` land on a clean inset — and on a hole boundary the same gradient points AWAY
 *  from the hole, so holes shrink correctly with no special case. */
function insetLoop(loop, F, w, h, d) {
  if (d <= 0) return loop.map(p => p.slice());
  return loop.map(([x, y]) => {
    let px = x, py = y;
    for (let it = 0; it < 6; it++) {
      const s = sampleF(F, w, h, px, py);
      const [gx, gy] = gradF(F, w, h, px, py);
      const g = Math.hypot(gx, gy) || 1;
      let step = (d - s) / g;
      step = clamp(step, -d, d);                                       // never overshoot the target
      px += gx / g * step; py += gy / g * step;
      if (Math.abs(d - s) < 0.05) break;
    }
    // A limb thinner than 2d has no interior at depth d; the walk parks on the medial axis and
    // the ring degenerates to a line. Pulling it back toward the original point keeps the quad
    // strip valid (zero-area quads render as nothing) instead of letting it fold inside out.
    const s = sampleF(F, w, h, px, py);
    if (s < d * 0.35) { const t = 0.5; px = x + (px - x) * t; py = y + (py - y) * t; }
    return [px, py];
  });
}

/* ── techniques 1+2 combined: the grid solid (slab / pop) ───────────────────────────────────── */

/** A dense masked grid: silhouette from the SDF, relief from the height field, bevel from both.
 *
 *  The trick that makes one generator cover "the whole card as a slab" and "the keyed subject as
 *  a cut-out" is the BOUNDARY PROJECTION — a grid vertex that lands just outside the mask is slid
 *  along the field gradient onto the zero crossing instead of being dropped. Without it the
 *  silhouette is a staircase at grid resolution and the whole thing looks like Minecraft; with
 *  it the edge is the same sub-pixel contour the low-poly path traces, and the interior is dense
 *  enough to carry relief. Cost: nothing, it is one Newton step per boundary vertex. */
function buildGridSolid(F, w, h, height, f, opt) {
  const m = new Mesh(opt.name || 'solid');
  const gx = Math.max(8, Math.round(opt.res * (w / Math.min(w, h))));
  const gy = Math.max(8, Math.round(opt.res * (h / Math.min(w, h))));
  const cell = Math.hypot(w / gx, h / gy);
  const halfD = opt.depth / 2, bd = halfD * opt.round, wall = halfD - bd;

  const px = new Float32Array((gx + 1) * (gy + 1)), py = new Float32Array((gx + 1) * (gy + 1));
  const keep = new Uint8Array((gx + 1) * (gy + 1));
  const sdf = new Float32Array((gx + 1) * (gy + 1));
  for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
    const k = j * (gx + 1) + i;
    let x = i * (w - 1) / gx, y = j * (h - 1) / gy;
    let s = sampleF(F, w, h, x, y);
    if (s < 0) {
      if (s < -cell * 1.5) { keep[k] = 0; px[k] = x; py[k] = y; sdf[k] = s; continue; }
      for (let it = 0; it < 4; it++) {                                 // project onto the contour
        const [ax, ay] = gradF(F, w, h, x, y); const g = Math.hypot(ax, ay) || 1;
        const st = clamp(-s / g, -cell * 2, cell * 2);
        x = clamp(x + ax / g * st, 0, w - 1); y = clamp(y + ay / g * st, 0, h - 1);
        s = sampleF(F, w, h, x, y);
        if (s > -0.05) break;
      }
      if (s < -0.5) { keep[k] = 0; px[k] = x; py[k] = y; sdf[k] = s; continue; }
      s = 0;
    }
    keep[k] = 1; px[k] = x; py[k] = y; sdf[k] = s;
  }

  const bevelPx = Math.max(1e-4, opt.bevelPx);
  const zOf = (k, front) => {
    const t = clamp(sdf[k] / bevelPx, 0, 1);
    const z = wall + bd * Math.sin(t * Math.PI / 2);
    if (!front) return -z;
    const hgt = height ? (sampleF(height, w, h, px[k], py[k]) - 0.5) * opt.relief : 0;
    return z + hgt * t;                                                // relief fades out at the rim
  };

  const vF = new Int32Array(keep.length).fill(-1), vB = new Int32Array(keep.length).fill(-1);
  for (let k = 0; k < keep.length; k++) if (keep[k]) {
    vF[k] = m.v(px[k], py[k], zOf(k, true), f);
    vB[k] = m.v(px[k], py[k], zOf(k, false), f);
  }
  const on = new Uint8Array(gx * gy);
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    const a = j * (gx + 1) + i, b = a + 1, c = a + gx + 2, d = a + gx + 1;
    if (!(keep[a] && keep[b] && keep[c] && keep[d])) continue;
    on[j * gx + i] = 1;
    m.quad(vF[a], vF[d], vF[c], vF[b]);                                // front, +Z out
    if (opt.twoSided !== false) m.quad(vB[a], vB[b], vB[c], vB[d]);    // back
  }
  // Side wall: every grid edge with a live cell on one side and nothing on the other. Its
  // vertices are fresh, so the wall stays flat-shaded and the cap keeps its smooth normals — a
  // shared vertex there rounds the card's edge over and kills the specular line that is most of
  // what says "this is a solid object" at thumbnail size.
  if (opt.twoSided !== false) {
    const wallEdge = (ka, kb) => {
      const a0 = m.v(px[ka], py[ka], zOf(ka, true), f), a1 = m.v(px[ka], py[ka], zOf(ka, false), f);
      const b0 = m.v(px[kb], py[kb], zOf(kb, true), f), b1 = m.v(px[kb], py[kb], zOf(kb, false), f);
      m.quad(a1, b1, b0, a0);
    };
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      if (!on[j * gx + i]) continue;
      const a = j * (gx + 1) + i, b = a + 1, c = a + gx + 2, d = a + gx + 1;
      if (j === 0 || !on[(j - 1) * gx + i]) wallEdge(b, a);
      if (i === gx - 1 || !on[j * gx + i + 1]) wallEdge(c, b);
      if (j === gy - 1 || !on[(j + 1) * gx + i]) wallEdge(d, c);
      if (i === 0 || !on[j * gx + i - 1]) wallEdge(a, d);
    }
  }
  return m;
}

/* ── technique 2 on its own: a plain displaced plane ────────────────────────────────────────── */

function buildRelief(height, w, h, f, opt) {
  const m = new Mesh(opt.name || 'relief');
  const gx = Math.max(8, Math.round(opt.res * (w / Math.min(w, h))));
  const gy = Math.max(8, Math.round(opt.res * (h / Math.min(w, h))));
  const V = [];
  for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
    const x = i * (w - 1) / gx, y = j * (h - 1) / gy;
    V.push(m.v(x, y, (sampleF(height, w, h, x, y) - 0.5) * opt.relief, f));
  }
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    const a = j * (gx + 1) + i;
    m.quad(V[a], V[a + gx + 1], V[a + gx + 2], V[a + 1]);
  }
  return m;
}

/* ── technique 4: depth layers ──────────────────────────────────────────────────────────────── */

/** Alpha for one layer: the mask, feathered, then re-steepened.
 *  A raw binary mask cuts a hard jagged edge that reads as a sticker; a plain blurred mask leaves
 *  a wide translucent halo that reads as a ghost. Blur then push the ramp back toward binary keeps
 *  the edge anti-aliased and one pixel wide, which is what a cut-out needs. */
function layerTexture(img, mask, w, h, feather) {
  const soft = feather > 0 ? blur(Float32Array.from(mask), w, h, feather) : Float32Array.from(mask);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    out[p] = img.data[p]; out[p + 1] = img.data[p + 1]; out[p + 2] = img.data[p + 2];
    out[p + 3] = clamp(soft[i] * 1.35 - 0.17, 0, 1) * 255;             // sharpen the feathered ramp
  }
  return out;
}

function bboxOf(mask, w, h, padPx) {
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x0 > x1) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  return { x0: Math.max(0, x0 - padPx), y0: Math.max(0, y0 - padPx), x1: Math.min(w - 1, x1 + padPx), y1: Math.min(h - 1, y1 + padPx) };
}

/* ══ EXTRACTION — turning one flat card into a stack of real layers ══════════════════════════
 *
 * Everything below exists to answer one question: what, in this PNG, is a separate PLANE?
 * The peel key above answers it for framed compositions. These answer it for the artist's own
 * cards, which are collage — and collage is genuinely easier to separate than photography,
 * because the artist has already done the separating. Distinct palettes, hard-edged pasted
 * elements, printed typography, deliberate channel fringing: every one of those is a seam that a
 * classical method can find without guessing at depth.
 *
 * NOTHING HERE INVENTS DEPTH. Each technique finds a region that is genuinely distinct in the
 * image, and the z it gets is a stated heuristic (border contact, text-ness, cluster order), not
 * a prediction. Where the ordering is a guess, the manifest says so and the number is one the
 * artist can edit.                                                                              */

/* ── OCR-lite: find the TEXT, not the characters ────────────────────────────────────────────── */

/** Text-region detection by connected components + stroke-width consistency + line grouping.
 *
 *  ⚑ WE NEED THE REGION, NOT THE STRING. A real OCR engine (Tesseract and friends) is a large
 *  binary with language data, is not fetchable here, and would give us glyph identities we have
 *  no use for — the layer only needs to know WHERE the type is. So this is the front half of an
 *  OCR pipeline and none of the back half.
 *
 *  Three filters do the work, in increasing order of how much they matter:
 *    1. SIZE  — a glyph is between ~0.8% and ~13% of the card height. Cheap, kills most of it.
 *    2. STROKE WIDTH — measured as 4 × the mean distance-to-boundary inside the component, which
 *       for a bar of width t averages t/4 and so returns t. Type has a stroke much thinner than
 *       its height; a pasted collage blob does not. This is the single best discriminator, and it
 *       is free because the EDT is already written for the geometry side.
 *    3. LINE GROUPING — a glyph never travels alone. Components only survive if they belong to a
 *       run of ≥3 similarly-sized neighbours sitting on a shared baseline. On art this glitchy,
 *       nothing else keeps the detector off the artwork; single-blob "text" is always a false
 *       positive here.
 *
 *  Run at both polarities because these cards carry white-on-dark and dark-on-light type, often
 *  on the same card (37 has a black-on-white panel AND white knockout type).                     */
function textRegions(img, luma, w, h, o = {}) {
  const S = Math.max(w, h);
  const k = o.contrast ?? 0.055;
  const local = blur(luma, w, h, Math.max(5, S * 0.018));
  const minH = Math.max(6, S * 0.008), maxH = S * 0.13;
  const cands = [];

  for (const pol of [-1, 1]) {
    const bin = new Uint8Array(w * h);
    for (let i = 0; i < bin.length; i++) bin[i] = (pol * (luma[i] - local[i]) > k) ? 1 : 0;
    const { lab, sizes } = components(bin, w, h);
    if (!sizes.length) continue;
    const d2 = edt(bin, w, h);
    const n = sizes.length;
    const x0 = new Int32Array(n).fill(w), y0 = new Int32Array(n).fill(h), x1 = new Int32Array(n).fill(-1), y1 = new Int32Array(n).fill(-1);
    const dsum = new Float64Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, c = lab[i];
      if (c < 0) continue;
      if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x;
      if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
      dsum[c] += Math.sqrt(d2[i]);
    }
    for (let c = 0; c < n; c++) {
      const bw = x1[c] - x0[c] + 1, bh = y1[c] - y0[c] + 1, area = sizes[c];
      if (bh < minH || bh > maxH) continue;
      if (bw < 2 || bw > w * 0.9) continue;
      const ar = bw / bh;
      if (ar > 8 || ar < 0.05) continue;
      const fill = area / (bw * bh);
      if (fill < 0.06 || fill > 0.97) continue;
      const sw = 4 * (dsum[c] / area);
      if (sw < 0.7 || sw > bh * 0.40) continue;
      if (area < 14) continue;
      cands.push({ c, pol, x0: x0[c], y0: y0[c], x1: x1[c], y1: y1[c], bw, bh, sw, lab, area });
    }
  }
  if (!cands.length) return { mask: new Uint8Array(w * h), boxes: [], lines: 0, glyphs: 0 };

  // Line grouping — union-find over "same baseline, same size, side by side".
  const par = cands.map((_, i) => i);
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
    const a = cands[i], b = cands[j];
    if (a.pol !== b.pol) continue;
    const hm = Math.max(a.bh, b.bh);
    if (Math.abs(a.bh - b.bh) > hm * 0.75) continue;
    const acy = (a.y0 + a.y1) / 2, bcy = (b.y0 + b.y1) / 2;
    if (Math.abs(acy - bcy) > hm * 0.45) continue;
    const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
    if (gap > hm * 1.5) continue;
    uni(i, j);
  }
  const groups = new Map();
  cands.forEach((cd, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(cd); });

  const mask = new Uint8Array(w * h);
  const boxes = [];
  let glyphs = 0, rejected = 0;
  const sd = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) / (m || 1); };
  // ⚠ MEASURED ON RAW LUMA, and a blurred version was TRIED AND REJECTED. The theory was sound —
  // "is the ground flat at the scale of the type" should beat "is the ground free of noise", and
  // card 42 sets SCRAM! on a speckle field that is flat at any scale a letter cares about. In
  // practice pre-blurring at sigma 1.6 did not recover 42 at all (0.6% either way) and it let a
  // pile of glitch through on 43/44/45/46 (44 went 9.9% → 13.8% of the frame, all of it fur and
  // scanlines). The noise IS the signal on this deck: a ground that is noisy is a ground the
  // artist has treated, and type is rarely set on one.
  for (const g of groups.values()) {
    const gx0 = Math.min(...g.map(c => c.x0)), gx1 = Math.max(...g.map(c => c.x1));
    const gy0 = Math.min(...g.map(c => c.y0)), gy1 = Math.max(...g.map(c => c.y1));
    if (g.length < 3) { rejected++; continue; }
    // ⚑ GROUP STATISTICS ARE WHERE THE FALSE POSITIVES DIE, not the per-glyph filters.
    // First attempt used per-component size + stroke width only, and on card 37 it returned 31
    // "lines" covering 36% of the frame — it had found the man's glitched hair and the cat's fur,
    // both of which are full of small high-contrast strokes of consistent width. Every test below
    // is about the group as a WHOLE, because that is what type actually is: a row of similar
    // shapes, evenly sized, on a quiet ground.
    if (sd(g.map(c => c.bh)) > 0.45) { rejected++; continue; }        // a line of type is one size
    if (sd(g.map(c => c.sw)) > 0.60) { rejected++; continue; }        // …drawn with one pen
    const glyphArea = g.reduce((s, c) => s + c.area, 0);
    const boxArea = (gx1 - gx0 + 1) * (gy1 - gy0 + 1);
    if (glyphArea / boxArea > 0.70 || glyphArea / boxArea < 0.05) { rejected++; continue; }   // type is mostly gaps
    const run = (gx1 - gx0 + 1) / (gy1 - gy0 + 1);
    if (run < 1.15 && (gy1 - gy0 + 1) / (gx1 - gx0 + 1) < 2.0) { rejected++; continue; }      // a line, or a vertical line
    // The decisive one: TYPE SITS ON A QUIET GROUND. Sample the group's box excluding the glyph
    // pixels and measure how varied it is. A printed caption panel is near-constant; hair, fur,
    // foil and scanline glitch are not, and nothing else separates them this cleanly.
    const want0 = new Set(g.map(c => c.c));
    const lab1 = g[0].lab;
    let n0 = 0, s1 = 0, s2 = 0;
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
      const i = y * w + x;
      if (want0.has(lab1[i])) continue;
      const v = luma[i]; s1 += v; s2 += v * v; n0++;
    }
    const bgStd = n0 > 8 ? Math.sqrt(Math.max(0, s2 / n0 - (s1 / n0) ** 2)) : 1;
    if (bgStd > (o.ground ?? 0.19)) { rejected++; continue; }
    boxes.push([gx0, gy0, gx1, gy1]);
    glyphs += g.length;
    for (let i = 0; i < mask.length; i++) if (want0.has(lab1[i])) mask[i] = 1;
  }
  // Dilate a little: printed type on this deck is nearly always outlined, drop-shadowed or
  // chromatically fringed, and a mask cut exactly at the glyph leaves that halo behind on the
  // plate underneath — which then reads as a ghost of the text sitting at the wrong depth.
  const grown = dilate(mask, w, h, o.grow ?? 2.4);
  return { mask: grown, boxes, lines: boxes.length, glyphs, rejected };
}

/* ── k-means palette matting ────────────────────────────────────────────────────────────────── */

const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/** k-means over colour, seeded k-means++ with a fixed PRNG so a card always clusters the same way.
 *
 *  ⚑ THIS IS THE ONE THAT SUITS THE ARTIST'S WORK. Photographic depth estimation is hard because a
 *  photo's palette is continuous; a collage's is not. When someone pastes a red robe onto a gold
 *  frame onto a black ground, those three things occupy three separate lumps of RGB space, and a
 *  cluster boundary IS the collage seam. On card 47 five clusters recover red robe / green hair /
 *  white ground / blue type / black gun almost exactly, and no edge detector or flood fill gets
 *  near that.
 *
 *  Fitted on a strided sample (colour space does not need every pixel) and then applied to all.   */
function kmeansColour(img, w, h, k, seed = 3030, iters = 14, within = null) {
  const { data } = img;
  const N = w * h;
  const stride = Math.max(1, Math.floor(N / 40000));
  const sample = [];
  for (let i = 0; i < N; i += stride) if (!within || within[i]) sample.push(i);
  if (sample.length < k * 4) return { labels: new Uint8Array(N).fill(255), centres: [], order: [] };
  const rnd = mulberry32(seed);
  const C = [];
  C.push([data[sample[0] * 4], data[sample[0] * 4 + 1], data[sample[0] * 4 + 2]]);
  const d2 = new Float64Array(sample.length).fill(Infinity);
  while (C.length < k) {                                              // k-means++ seeding
    let tot = 0;
    const last = C[C.length - 1];
    for (let s = 0; s < sample.length; s++) {
      const p = sample[s] * 4;
      const d = (data[p] - last[0]) ** 2 + (data[p + 1] - last[1]) ** 2 + (data[p + 2] - last[2]) ** 2;
      if (d < d2[s]) d2[s] = d;
      tot += d2[s];
    }
    let r = rnd() * tot, pick = sample.length - 1;
    for (let s = 0; s < sample.length; s++) { r -= d2[s]; if (r <= 0) { pick = s; break; } }
    const p = sample[pick] * 4;
    C.push([data[p], data[p + 1], data[p + 2]]);
  }
  for (let it = 0; it < iters; it++) {
    const acc = C.map(() => [0, 0, 0, 0]);
    for (const i of sample) {
      const p = i * 4;
      let best = 0, bd = Infinity;
      for (let c = 0; c < C.length; c++) {
        const d = (data[p] - C[c][0]) ** 2 + (data[p + 1] - C[c][1]) ** 2 + (data[p + 2] - C[c][2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      acc[best][0] += data[p]; acc[best][1] += data[p + 1]; acc[best][2] += data[p + 2]; acc[best][3]++;
    }
    for (let c = 0; c < C.length; c++) if (acc[c][3]) C[c] = [acc[c][0] / acc[c][3], acc[c][1] / acc[c][3], acc[c][2] / acc[c][3]];
  }
  const labels = new Uint8Array(N).fill(255);
  const count = new Int32Array(C.length), border = new Int32Array(C.length);
  const bx = Math.round(w * 0.08), by = Math.round(h * 0.08);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, p = i * 4;
    if (within && !within[i]) continue;
    let best = 0, bd = Infinity;
    for (let c = 0; c < C.length; c++) {
      const d = (data[p] - C[c][0]) ** 2 + (data[p + 1] - C[c][1]) ** 2 + (data[p + 2] - C[c][2]) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    labels[i] = best; count[best]++;
    if (x < bx || y < by || x >= w - bx || y >= h - by) border[best]++;
  }
  // Depth heuristic, stated rather than learned: a cluster that owns a lot of the outer 8% of the
  // frame is behind. That is true of a printed ground and a printed frame and false of a subject,
  // which is exactly the call being made. Reported in the manifest so it can be overruled.
  const order = C.map((c, i) => ({ i, colour: c.map(Math.round), n: count[i], borderShare: count[i] ? border[i] / count[i] : 1 }))
                 .sort((a, b) => b.borderShare - a.borderShare);
  return { labels, centres: C, order };
}

/* ── push-pull inpainting ───────────────────────────────────────────────────────────────────── */

/** Fill `hole` in an RGBA buffer by pyramid push-pull.
 *
 *  Needed because lifting a layer OFF leaves a hole in the plate behind it, and the whole point of
 *  parallax is that you get to see behind things. Without this, tilting card 37 slides the text
 *  plate aside to reveal a text-shaped void — which reads as a rendering bug, not as depth.
 *  Push-pull rather than a diffusion solve: it is O(n), it is 40 lines, and at the size a card is
 *  seen it is indistinguishable. It does NOT reconstruct occluded detail and is not trying to —
 *  it produces plausible low-frequency continuation, which is all that a few degrees of tilt
 *  ever exposes.                                                                                 */
function inpaint(rgba, hole, w, h) {
  const levels = [];
  let cw = w, ch = h;
  let col = new Float32Array(w * h * 3), wgt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const keep = hole[i] ? 0 : 1;
    wgt[i] = keep;
    col[i * 3] = rgba[i * 4] * keep; col[i * 3 + 1] = rgba[i * 4 + 1] * keep; col[i * 3 + 2] = rgba[i * 4 + 2] * keep;
  }
  levels.push({ col, wgt, w: cw, h: ch });
  while (cw > 2 && ch > 2) {                                          // pull: shrink, summing weight
    const nw = Math.max(1, cw >> 1), nh = Math.max(1, ch >> 1);
    const nc = new Float32Array(nw * nh * 3), nwg = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const sy = Math.min(ch - 1, y * 2 + j), sx = Math.min(cw - 1, x * 2 + i), s = sy * cw + sx;
        r += col[s * 3]; g += col[s * 3 + 1]; b += col[s * 3 + 2]; a += wgt[s];
      }
      const d = y * nw + x;
      nc[d * 3] = r; nc[d * 3 + 1] = g; nc[d * 3 + 2] = b; nwg[d] = a;
    }
    col = nc; wgt = nwg; cw = nw; ch = nh;
    levels.push({ col, wgt, w: cw, h: ch });
  }
  for (let L = levels.length - 2; L >= 0; L--) {                      // push: fill from the coarser level
    const fine = levels[L], coarse = levels[L + 1];
    for (let y = 0; y < fine.h; y++) for (let x = 0; x < fine.w; x++) {
      const i = y * fine.w + x;
      if (fine.wgt[i] > 0.001) continue;
      const cx = Math.min(coarse.w - 1, x >> 1), cy = Math.min(coarse.h - 1, y >> 1), c = cy * coarse.w + cx;
      if (coarse.wgt[c] <= 0.001) continue;
      fine.col[i * 3] = coarse.col[c * 3] / coarse.wgt[c];
      fine.col[i * 3 + 1] = coarse.col[c * 3 + 1] / coarse.wgt[c];
      fine.col[i * 3 + 2] = coarse.col[c * 3 + 2] / coarse.wgt[c];
      fine.wgt[i] = 1;
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  const top = levels[0];
  for (let i = 0; i < w * h; i++) {
    const a = top.wgt[i] || 1;
    out[i * 4] = hole[i] ? top.col[i * 3] / a : rgba[i * 4];
    out[i * 4 + 1] = hole[i] ? top.col[i * 3 + 1] / a : rgba[i * 4 + 1];
    out[i * 4 + 2] = hole[i] ? top.col[i * 3 + 2] / a : rgba[i * 4 + 2];
    out[i * 4 + 3] = 255;
  }
  // One light blur restricted to the filled area — push-pull leaves visible 2×2 blockiness at the
  // level where the hole was finally covered, and a hole is by definition somewhere nobody has
  // detail for, so smoothing it costs nothing real.
  const soft = Float32Array.from(hole);
  const m = blur(soft, w, h, 1.5);
  const ch3 = [0, 1, 2].map(c => { const f = new Float32Array(w * h); for (let i = 0; i < w * h; i++) f[i] = out[i * 4 + c]; return blur(f, w, h, 2.2); });
  for (let i = 0; i < w * h; i++) if (m[i] > 0.02) for (let c = 0; c < 3; c++)
    out[i * 4 + c] = out[i * 4 + c] * (1 - m[i]) + ch3[c][i] * m[i];
  return out;
}

/* ── the creative pass: glitch strata and channel separation ────────────────────────────────── */

/** Split the card into horizontal strata at rows where the image tears.
 *
 *  Scanline glitch is a HORIZONTAL discontinuity: a row that barely resembles the row above it.
 *  On card 45 (MENTAL WELLNESS) and card 34 those tears are the composition, so cutting the card
 *  into strata at its own tear rows and floating them at different depths does not fight the art,
 *  it exaggerates something already there. Rows are scored by mean absolute difference against
 *  their predecessor, then peaks are picked greedily with a minimum spacing so the strata stay
 *  band-shaped rather than collapsing into a stack of scanlines.                                 */
function scanStrata(img, w, h, n) {
  const { data } = img;
  const e = new Float32Array(h);
  for (let y = 1; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x += 2) {
      const a = (y * w + x) * 4, b = ((y - 1) * w + x) * 4;
      s += Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
    }
    e[y] = s / (w / 2);
  }
  const sm = blur(e, 1, h, 1.2);
  const minGap = Math.max(8, Math.floor(h / (n * 2.4)));
  const cuts = [];
  const taken = new Uint8Array(h);
  const idx = [...Array(h).keys()].sort((a, b) => sm[b] - sm[a]);
  for (const y of idx) {
    if (cuts.length >= n - 1) break;
    if (y < minGap || y > h - minGap || taken[y]) continue;
    cuts.push(y);
    for (let k = Math.max(0, y - minGap); k < Math.min(h, y + minGap); k++) taken[k] = 1;
  }
  cuts.sort((a, b) => a - b);
  const bounds = [0, ...cuts, h];
  return bounds.slice(0, -1).map((y0, i) => ({ y0, y1: bounds[i + 1] }));
}

/** Per-channel plates — free stereo from the artist's own chromatic aberration.
 *
 *  On the fringed cards the red, green and blue records are ALREADY displaced from one another;
 *  that displacement is what makes them look wrong-and-deliberate. Split them onto three planes at
 *  three depths and the displacement stops being a 2-D artefact and becomes what it always looked
 *  like: three sheets of colour at three distances. Emitted as additive plates — the manifest says
 *  `blend:"add"` and the renderer honours it — because R+G+B recombine to the original image
 *  exactly when the parallax is zero, so the effect vanishes gracefully as the card returns to
 *  face-on. That property is the whole reason to do it this way rather than as three alpha cuts.  */
function channelPlates(img, w, h) {
  const out = [];
  const TINT = [[255, 40, 40], [40, 255, 60], [60, 90, 255]];
  for (let c = 0; c < 3; c++) {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = c === 0 ? img.data[i * 4] : 0;
      rgba[i * 4 + 1] = c === 1 ? img.data[i * 4 + 1] : 0;
      rgba[i * 4 + 2] = c === 2 ? img.data[i * 4 + 2] : 0;
      rgba[i * 4 + 3] = 255;
    }
    out.push({ rgba, tint: TINT[c], name: ['red', 'green', 'blue'][c] });
  }
  return out;
}

/* ── technique 5: voxels ────────────────────────────────────────────────────────────────────── */

/** Column-height voxelisation with hidden-face culling. 2.5-D on purpose — a card has no back
 *  half to voxelise, and a full 3-D grid over a height field emits the same visible surface with
 *  an interior nobody can ever see. Faces are only emitted where the neighbouring column is
 *  shorter, which is the difference between ~6 faces per cell and ~1.2. */
function buildVoxel(height, mask, w, h, f, opt) {
  const m = new Mesh(opt.name || 'voxel');
  const gx = Math.max(4, Math.round(opt.res * (w / Math.min(w, h))));
  const gy = Math.max(4, Math.round(opt.res * (h / Math.min(w, h))));
  const cw = w / gx, ch = h / gy;
  const steps = Math.max(1, opt.steps | 0);
  const lvl = new Int16Array(gx * gy).fill(-1);
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    let acc = 0, hit = 0, n = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const x = (i + (sx + 0.5) / 3) * cw, y = (j + (sy + 0.5) / 3) * ch;
      if (mask && !mask[clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)]) continue;
      acc += sampleF(height, w, h, x, y); hit++; n++;
    }
    lvl[j * gx + i] = hit >= 5 ? Math.max(0, Math.round((acc / hit) * (steps - 1))) : -1;
  }
  const zStep = opt.depth / steps;
  const at = (i, j) => (i < 0 || j < 0 || i >= gx || j >= gy) ? -1 : lvl[j * gx + i];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    const L = lvl[j * gx + i];
    if (L < 0) continue;
    const x0 = i * cw, x1 = (i + 1) * cw, y0 = j * ch, y1 = (j + 1) * ch;
    const zt = (L + 1) * zStep - opt.depth / 2, zb = -opt.depth / 2;
    const V = (x, y, z) => m.v(x, y, z, f);
    m.quad(V(x0, y1, zt), V(x1, y1, zt), V(x1, y0, zt), V(x0, y0, zt));      // top
    m.quad(V(x0, y0, zb), V(x1, y0, zb), V(x1, y1, zb), V(x0, y1, zb));      // bottom
    const side = (ni, nj, a, b) => {
      const nl = at(ni, nj);
      if (nl >= L) return;
      const zc = nl < 0 ? zb : (nl + 1) * zStep - opt.depth / 2;
      m.quad(V(a[0], a[1], zc), V(b[0], b[1], zc), V(b[0], b[1], zt), V(a[0], a[1], zt));
    };
    side(i, j - 1, [x1, y0], [x0, y0]);
    side(i + 1, j, [x1, y1], [x1, y0]);
    side(i, j + 1, [x0, y1], [x1, y1]);
    side(i - 1, j, [x0, y0], [x0, y1]);
  }
  return m;
}

/* ══ GLB materials ═══════════════════════════════════════════════════════════════════════════
 * toGLB() writes geometry and nothing else, by design — a converted FBX has no material worth
 * keeping. Here the whole point is that the art travels WITH the mesh, so the GLB it produces is
 * reopened and given images, samplers, textures and materials. Editing its output rather than
 * teaching it about materials keeps one buffer-layout implementation in the repo; this function
 * only ever APPENDS to the BIN chunk and never touches an existing accessor.                    */

export function embedMaterials(glb, materials, assign) {
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const binLen = glb.readUInt32LE(20 + jsonLen);
  const bin = Buffer.from(glb.subarray(28 + jsonLen, 28 + jsonLen + binLen));

  const blobs = [bin];
  let off = bin.length;
  json.images ??= []; json.samplers ??= []; json.textures ??= []; json.materials ??= [];
  if (!json.samplers.length) json.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 });
  const addTex = png => {
    const pad = off % 4 ? 4 - (off % 4) : 0;
    if (pad) { blobs.push(Buffer.alloc(pad)); off += pad; }
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: png.length });
    blobs.push(png); off += png.length;
    json.images.push({ bufferView: json.bufferViews.length - 1, mimeType: 'image/png' });
    json.textures.push({ sampler: 0, source: json.images.length - 1 });
    return json.textures.length - 1;
  };
  for (const mat of materials) {
    const pbr = { baseColorFactor: mat.baseColorFactor || [1, 1, 1, 1], metallicFactor: mat.metallic ?? 0, roughnessFactor: mat.roughness ?? 0.55 };
    if (mat.baseColor) pbr.baseColorTexture = { index: addTex(mat.baseColor) };
    const out = { name: mat.name, pbrMetallicRoughness: pbr, doubleSided: mat.doubleSided !== false };
    if (mat.normal) out.normalTexture = { index: addTex(mat.normal), scale: mat.normalScale ?? 1 };
    if (mat.occlusion) out.occlusionTexture = { index: addTex(mat.occlusion), strength: mat.occlusionStrength ?? 1 };
    if (mat.alphaMode) out.alphaMode = mat.alphaMode;
    json.materials.push(out);
  }
  json.meshes.forEach((me, i) => {
    const mi = typeof assign === 'function' ? assign(me.name, i) : (assign?.[me.name] ?? 0);
    if (mi >= 0) me.primitives.forEach(p => { p.material = mi; });
  });

  const newBin = Buffer.concat(blobs);
  let jb = Buffer.from(JSON.stringify(json), 'utf8');
  const jp = jb.length % 4 ? 4 - (jb.length % 4) : 0;
  if (jp) jb = Buffer.concat([jb, Buffer.alloc(jp, 0x20)]);
  const bp = newBin.length % 4 ? 4 - (newBin.length % 4) : 0;
  const bb = bp ? Buffer.concat([newBin, Buffer.alloc(bp)]) : newBin;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + jb.length + 8 + bb.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jb.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bb.length, 0); bh.writeUInt32LE(0x004E4942, 4);
  return Buffer.concat([head, jh, jb, bh, bb]);
}

/** Resize RGBA for the embedded copy. The source card is 667×1000; three GLBs each carrying that
 *  at full size is 1.7 MB of duplicated albedo for an asset that is 300 px tall on a phone. */
function resizeRGBA(data, w, h, maxSide) {
  const sc = Math.min(1, maxSide / Math.max(w, h));
  if (sc >= 1) return { w, h, data };
  const dw = Math.max(1, Math.round(w * sc)), dh = Math.max(1, Math.round(h * sc));
  const out = new Uint8ClampedArray(dw * dh * 4);
  const bx = w / dw, by = h / dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let j = Math.floor(y * by); j < Math.min(h, Math.ceil((y + 1) * by)); j++)
      for (let i = Math.floor(x * bx); i < Math.min(w, Math.ceil((x + 1) * bx)); i++) {
        const p = (j * w + i) * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; a += data[p + 3]; n++;
      }
    const p = (y * dw + x) * 4;
    out[p] = r / n; out[p + 1] = g / n; out[p + 2] = b / n; out[p + 3] = a / n;
  }
  return { w: dw, h: dh, data: out };
}

/* ══ the layer stack ═════════════════════════════════════════════════════════════════════════
 *
 * SHAPE OF THE OUTPUT, and the reason for it:
 *
 *   layer 0    a FULL-FRAME OPAQUE PLATE. Every foreground layer's pixels have been inpainted
 *              out of it, so it is a complete backdrop with no holes.
 *   layer 1..n TRIMMED RGBA CUT-OUTS, each with its own rect in card space.
 *
 * The renderer therefore never has to think about what is behind anything: the back plate always
 * covers the frame, and every other plane is a sprite with a position. Tilt as far as you like and
 * you cannot see through the card. `cards/lens3d.html` already draws three fixed plates — this is
 * the same contract with the plates earned from the image instead of assumed.                    */

const cover = (m, n) => { if (!m) return 1; let c = 0; for (let i = 0; i < m.length; i++) c += m[i]; return c / n; };

/** Decide what the layers ARE. Ordered back → front; z is a fraction of card height, +z = viewer. */
function buildStack(img, { w, h, luma, subject, bands, o, log }) {
  const layers = [];
  const gap = o.layerGap;
  let text = null;

  if (o.text) {
    text = textRegions(img, luma, w, h, { contrast: o.textContrast, grow: o.textGrow, ground: o.textGround });
    log(`  text: ${text.lines} line(s), ${text.glyphs} glyph component(s), ${text.rejected} group(s) rejected`);
  }

  layers.push({ name: 'bg', kind: 'background', mask: null, z: 0, base: true, why: 'the card itself, with every liftable layer inpainted out of it' });

  // Strata REPLACE the matte rather than joining it. A card cut into horizontal tears and the same
  // card cut into colour regions are two different readings of the image, and stacking both gives
  // every pixel two homes and two depths — which renders as a doubled, mushy card. Pick one.
  if (o.strata > 1) {
    const st = scanStrata(img, w, h, o.strata);
    log(`  strata: ${st.length} band(s), tears at rows ${st.slice(1).map(s => s.y0).join(', ')}`);
    st.forEach((s, i) => {
      const m = new Uint8Array(w * h);
      for (let y = s.y0; y < s.y1; y++) for (let x = 0; x < w; x++) m[y * w + x] = 1;
      layers.push({ name: `stratum${i}`, kind: 'stratum', mask: m, z: 0, why: `glitch tear, rows ${s.y0}–${s.y1}` });
    });
    // Alternate near/far so consecutive tears separate visibly instead of forming one ramp.
    layers.forEach((L, i) => { if (i) L.z = +(gap * (i % 2 ? 1.2 : 0.45)).toFixed(4); });
    if (text && text.lines) layers.push({ name: 'text', kind: 'text', mask: text.mask, z: +(gap * 1.6).toFixed(4), boxes: text.boxes, why: `${text.lines} detected text line(s)` });
    return layers;
  }

  let subjectN = 0; for (let i = 0; i < subject.length; i++) subjectN += subject[i];
  const subjectShare = subjectN / (w * h);
  // ⚑ COMBINE, DON'T CHOOSE — the two matting methods answer different questions and both cards
  // and collages have both. The PEEL is unbeatable on printed structure: on card 47 it lifts the
  // red rule, the white mat and the green rule as three separate rings, which no colour clusterer
  // will ever produce because they are the same three colours as things elsewhere in the art.
  // K-MEANS is unbeatable inside the picture: on card 42 it separates the blue face, the white
  // suit and the speckled ground, which the peel cannot reach because none of them touch an edge.
  // So: peel from the outside in, and when what survives is still most of the card — i.e. the peel
  // has found the frame and stopped — cluster THAT and use the clusters as the front planes.
  const peelUseful = bands.length >= 1 && o.extract !== 'kmeans';
  if (peelUseful) {
    bands.slice(1).forEach((m, k) => layers.push({ name: `mid${k + 1}`, kind: 'midground', mask: m, z: gap * (0.25 + 0.18 * k), why: `peel band ${k + 1} — printed structure` }));
  }
  const needCluster = o.extract === 'kmeans' || !peelUseful || subjectShare > o.clusterAbove;
  if (needCluster) {
    const within = (peelUseful && subjectShare < 0.985) ? subject : null;
    const k = kmeansColour(img, w, h, o.clusters, o.seed, 14, within);
    if (k.order.length) {
      log(`  kmeans: k=${o.clusters}${within ? ' inside the peel subject' : ''}, border share ${k.order.map(c => c.borderShare.toFixed(2)).join(' ')}`);
      // Clusters ordered by how much of the frame's outer 8% they own — most = furthest back. The
      // rearmost stays in the base plate; the rest come forward in that order.
      const use = k.order.slice(1);
      use.forEach((c, i) => {
        const m = new Uint8Array(w * h);
        for (let p = 0; p < m.length; p++) m[p] = k.labels[p] === c.i ? 1 : 0;
        const cleaned = cleanMask(morph(m, w, h, 1.2, 2.0), w, h, { minArea: o.minArea, fillHoles: 0.002 });
        let n = 0; for (let p = 0; p < cleaned.length; p++) n += cleaned[p];
        if (n < w * h * 0.008) return;
        layers.push({
          name: `band${i}`, kind: i === use.length - 1 ? 'subject' : 'midground', mask: cleaned,
          z: gap * (0.45 + 0.45 * (i + 1) / use.length),
          why: `colour cluster rgb(${c.colour.join(',')}), border share ${c.borderShare.toFixed(2)}`,
        });
      });
    }
  } else {
    layers.push({ name: 'subject', kind: 'subject', mask: subject, z: gap * 0.8, why: 'what the peel could not key' });
  }
  if (peelUseful && bands.length) layers.push({ name: 'frame', kind: 'frame', mask: bands[0], z: gap * 1.05, why: 'peel band 0 — the printed border, in front of the art it surrounds' });

  if (text && text.lines) {
    // Text always goes FRONT-most, ahead of everything the matte found. That is not a measurement,
    // it is a decision, and it is the one the artist asked for: type lifting off the card is the
    // strongest parallax available and it is what this deck's lettering is for.
    layers.push({ name: 'text', kind: 'text', mask: text.mask, z: gap * 1.35, boxes: text.boxes, why: `${text.lines} detected text line(s)` });
    for (const L of layers) if (L.mask && L !== layers[layers.length - 1])
      for (let i = 0; i < L.mask.length; i++) if (text.mask[i]) L.mask[i] = 0;   // type belongs to one plane only
  }

  // Trim to a budget, then RE-SPACE. Two reasons the z values above are provisional: the peel and
  // the k-means pass number their bands independently and can collide, and a viewer only has so
  // much parallax to spend — eleven planes inside 0.12 of a card height are eleven planes nobody
  // can tell apart. The array order already IS the depth order (bg → printed structure → colour
  // bands → subject → frame → type), so spacing is just an even walk down it.
  if (layers.length - 1 > o.layerCount) {
    const drop = layers.map((L, i) => ({ i, L })).filter(x => x.L.kind === 'midground')
      .sort((a, b) => cover(a.L.mask, w * h) - cover(b.L.mask, w * h))
      .slice(0, layers.length - 1 - o.layerCount).map(x => x.i);
    for (const i of drop.sort((a, b) => b - a)) layers.splice(i, 1);
  }
  layers.forEach((L, i) => { L.z = i === 0 ? 0 : +(gap * 1.35 * (i / (layers.length - 1))).toFixed(4); });
  return layers;
}

/** Write the stack: layers/NN-name.png, layers.json, and layers.glb (the same planes, in one file). */
function emitStack(layers, img, w, h, f, { o, dir, put, emit, log, name, source }) {
  mkdirSync(join(dir, 'layers'), { recursive: true });
  // ⚠ YOU CAN ONLY PAINT OUT WHAT YOU CAN PAINT AROUND. The first version inpainted the union of
  // EVERY foreground layer; on card 37 that is 85% of the frame and push-pull, given 15% of real
  // pixels to work from, returned four flat rectangles — a back plate worse than no back plate.
  // Only layers small enough to have surrounding context are removed. Anything bigger simply stays
  // in the base plate: at rest it is hidden behind its own cut-out, and under parallax it shows as
  // a faint double of itself rather than as a hole, which is by far the better failure.
  const fg = new Uint8Array(w * h);
  let painted = 0;
  for (const L of layers) {
    if (!L.mask) continue;
    let n = 0; for (let i = 0; i < L.mask.length; i++) n += L.mask[i];
    if (n > w * h * o.inpaintMax) continue;
    painted++;
    for (let i = 0; i < L.mask.length; i++) if (L.mask[i]) fg[i] = 1;
  }
  const basePlate = (o.inpaint && painted) ? inpaint(img.data, fg, w, h) : img.data;

  const entries = [], mats = [], metas = [];
  layers.forEach((L, i) => {
    const file = `${String(i).padStart(2, '0')}-${L.name}.png`;
    let rect, png, cw, chh;
    if (L.base) {
      const small = resizeRGBA(basePlate, w, h, o.layerMax);
      png = encodePNG(small.w, small.h, small.data);
      rect = [0, 0, 1, 1]; cw = w; chh = h;
    } else {
      const bb = bboxOf(L.mask, w, h, 3);
      cw = bb.x1 - bb.x0 + 1; chh = bb.y1 - bb.y0 + 1;
      const tex = layerTexture(img, L.mask, w, h, o.feather);
      const crop = new Uint8ClampedArray(cw * chh * 4);
      for (let y = bb.y0; y <= bb.y1; y++) for (let x = bb.x0; x <= bb.x1; x++) {
        const s = (y * w + x) * 4, d = ((y - bb.y0) * cw + (x - bb.x0)) * 4;
        crop[d] = tex[s]; crop[d + 1] = tex[s + 1]; crop[d + 2] = tex[s + 2]; crop[d + 3] = tex[s + 3];
      }
      const small = resizeRGBA(crop, cw, chh, o.layerMax);
      png = encodePNG(small.w, small.h, small.data);
      rect = [bb.x0 / w, bb.y0 / h, cw / w, chh / h];
      metas[i] = bb;
    }
    writeFileSync(join(dir, 'layers', file), png);
    let cover = 0;
    if (L.mask) { for (let p = 0; p < L.mask.length; p++) cover += L.mask[p]; cover /= w * h; } else cover = 1;
    entries.push({
      file: `layers/${file}`, name: L.name, kind: L.kind, z: +L.z.toFixed(4), rect: rect.map(v => +v.toFixed(5)),
      opaque: !!L.base, blend: L.blend || 'normal', coverage: +cover.toFixed(4),
      ...(L.boxes ? { boxes: L.boxes.map(b => [+(b[0] / w).toFixed(4), +(b[1] / h).toFixed(4), +((b[2] - b[0]) / w).toFixed(4), +((b[3] - b[1]) / h).toFixed(4)]) } : {}),
      why: L.why,
    });
    mats.push({ name: L.name, baseColor: png, roughness: 0.62, alphaMode: L.base ? 'OPAQUE' : 'BLEND', doubleSided: true });
    log(`    layer ${String(i).padStart(2, '0')} ${L.name.padEnd(10)} ${L.kind.padEnd(11)} z ${L.z.toFixed(3)}  ${(cover * 100).toFixed(1).padStart(5)}% cover  ${(png.length / 1024).toFixed(0)} KB`);
  });

  const manifest = {
    generator: 'png23d', card: name, source,
    size: { w, h, aspect: +(w / h).toFixed(5) },
    units: 'rect is [x,y,w,h] as a fraction of the card, origin top-left. z is a fraction of card HEIGHT, +z toward the viewer.',
    method: o.extract + (o.text ? '+text' : '') + (o.strata > 1 ? '+strata' : '') + (o.inpaint ? '+inpaint' : ''),
    note: 'layer 0 is a full-frame opaque plate with every foreground layer inpainted out of it; the rest are trimmed RGBA cut-outs. z ordering is a stated heuristic, not a depth measurement — edit it.',
    layers: entries,
  };
  writeFileSync(join(dir, 'layers.json'), JSON.stringify(manifest, null, 2) + '\n');
  log(`  layers.json         ${entries.length} layer(s) · ${o.extract}${o.text ? '+text' : ''}`);

  const meshes = layers.map((L, i) => {
    const m = new Mesh(`${String(i).padStart(2, '0')}_${L.name}`);
    const bb = L.base ? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 } : metas[i];
    const lw = bb.x1 - bb.x0 + 1, lh = bb.y1 - bb.y0 + 1;
    const z = L.z * o.size;
    const V = (px, py) => {
      m.pos.push((px - w / 2) * f.s, (h / 2 - py) * f.s, z);
      m.uv.push((px - bb.x0) / lw, (py - bb.y0) / lh);
      return m.pos.length / 3 - 1;
    };
    m.quad(V(bb.x0, bb.y1 + 1), V(bb.x1 + 1, bb.y1 + 1), V(bb.x1 + 1, bb.y0), V(bb.x0, bb.y0));
    return m;
  });
  emit('layers.glb', meshes, mats, (nm, i) => i);
  return manifest;
}

/* ══ driver ══════════════════════════════════════════════════════════════════════════════════ */

const MODES = ['maps', 'slab', 'pop', 'silhouette', 'relief', 'layers', 'voxel', 'channels'];

function parseArgs(argv) {
  const o = {
    out: 'models/cards', modes: ['maps', 'slab', 'pop', 'layers'], key: 'auto', tol: 0.11, peel: 5, minSubject: 0.12,
    size: 1.0, depth: 0.075, bevel: 0.035, round: 0.85, bevelRings: 4, res: 48,
    relief: 0.22, reliefBlur: 2.2, reliefDetail: 0.55, reliefRange: 0.14, invert: false,
    normalStrength: 2.4, normalBlur: 0.7, flipY: false, corner: 0.045,
    simplify: 1.4, minArea: 0.004, keepLargest: false, layerCount: 6, layerGap: 0.09,
    voxelRes: 44, voxelSteps: 6, embed: 512, obj: false, preview: false, quiet: false, debug: false, name: null,
    extract: 'auto', clusters: 5, seed: 3030, text: true, textContrast: 0.055, textGrow: 2.4,
    strata: 0, inpaint: true, inpaintMax: 0.12, textGround: 0.26, clusterAbove: 0.55, feather: 1.1, layerMax: 512, explode: 6,
  };
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (!a.startsWith('--')) { files.push(a); continue; }
    switch (a) {
      case '--out': o.out = next(); break;
      case '--name': o.name = next(); break;
      case '--mode': o.modes = next().split(',').map(s => s.trim()).filter(Boolean); break;
      case '--all': o.modes = MODES.slice(); break;
      case '--key': o.key = next(); break;
      case '--tol': o.tol = +next(); break;
      case '--peel': o.peel = +next(); break;
      case '--min-subject': o.minSubject = +next(); break;
      case '--size': o.size = +next(); break;
      case '--depth': o.depth = +next(); break;
      case '--bevel': o.bevel = +next(); break;
      case '--round': o.round = +next(); break;
      case '--res': o.res = +next(); break;
      case '--relief': o.relief = +next(); break;
      case '--relief-blur': o.reliefBlur = +next(); break;
      case '--relief-detail': o.reliefDetail = +next(); break;
      case '--invert': o.invert = true; break;
      case '--normal-strength': o.normalStrength = +next(); break;
      case '--normal-blur': o.normalBlur = +next(); break;
      case '--normal-flip-y': o.flipY = true; break;
      case '--corner': o.corner = +next(); break;
      case '--simplify': o.simplify = +next(); break;
      case '--min-area': o.minArea = +next(); break;
      case '--keep-largest': o.keepLargest = true; break;
      case '--layers': o.layerCount = +next(); break;
      case '--layer-gap': o.layerGap = +next(); break;
      case '--extract': o.extract = next(); break;
      case '--clusters': o.clusters = +next(); break;
      case '--cluster-above': o.clusterAbove = +next(); break;
      case '--seed': o.seed = +next(); break;
      case '--no-text': o.text = false; break;
      case '--text-contrast': o.textContrast = +next(); break;
      case '--text-grow': o.textGrow = +next(); break;
      case '--strata': o.strata = +next(); break;
      case '--no-inpaint': o.inpaint = false; break;
      case '--inpaint-max': o.inpaintMax = +next(); break;
      case '--text-ground': o.textGround = +next(); break;
      case '--feather': o.feather = +next(); break;
      case '--layer-max': o.layerMax = +next(); break;
      case '--explode': o.explode = +next(); break;
      case '--voxel-res': o.voxelRes = +next(); break;
      case '--voxel-steps': o.voxelSteps = +next(); break;
      case '--embed': o.embed = +next(); break;
      case '--no-embed': o.embed = 0; break;
      case '--obj': o.obj = true; break;
      case '--preview': o.preview = true; break;
      case '--quiet': o.quiet = true; break;
      case '--debug': o.debug = true; break;
      default: throw new Error(`unknown option ${a}`);
    }
  }
  const bad = o.modes.filter(m => !MODES.includes(m));
  if (bad.length) throw new Error(`unknown mode(s) ${bad.join(', ')} — pick from ${MODES.join(', ')}`);
  return { o, files };
}

function run(file, o) {
  const log = (...a) => { if (!o.quiet) console.log(...a); };
  const name = o.name || basename(file).replace(/\.[^.]+$/, '');
  const dir = join(o.out, name);
  mkdirSync(dir, { recursive: true });

  const img = loadImage(file);
  const { w, h } = img;
  const f = { w, h, s: o.size / h };                                   // pixel → model scale
  log(`\n${basename(file)} — ${w}×${h}${img.hadAlpha ? ' RGBA' : ' RGB'} → ${dir}/`);

  const luma = lumaOf(img);
  const height = heightField(luma, w, h, { blurPx: o.reliefBlur, range: o.reliefRange, detail: o.reliefDetail, invert: o.invert });
  const written = [];
  const put = (fn, buf) => { writeFileSync(join(dir, fn), buf); written.push([fn, buf.length]); };

  /* — maps — */
  const fineH = normalise(blur(luma, w, h, o.normalBlur), 0.01, 0.99);
  const nrmPng = encodePNG(w, h, normalMap(fineH, w, h, { strength: o.normalStrength, flipY: o.flipY }));
  const albedoPng = encodePNG(w, h, img.data);
  if (o.modes.includes('maps')) {
    put('albedo.png', albedoPng);
    put('normal.png', nrmPng);
    put('height.png', encodePNG(w, h, greyToBytes(height), { grey: true }));
    put('ao.png', encodePNG(w, h, aoMap(height, w, h), { grey: true }));
  }

  /* — the key, shared by pop / silhouette / layers / voxel — */
  let subject = null, bands = [];
  if (o.modes.some(m => ['pop', 'silhouette', 'layers', 'voxel'].includes(m))) {
    const k = keyPeel(img, o.key, o.tol, o.peel, o.minSubject);
    bands = k.bands;
    subject = cleanMask(morph(k.subject, w, h, 1.5, 2.5), w, h, { minArea: o.minArea, keepLargest: o.keepLargest });
    let n = 0; for (let i = 0; i < subject.length; i++) n += subject[i];
    log(`  key: ${k.how}`);
    log(`       → ${bands.length} peeled band(s), subject ${(n / (w * h) * 100).toFixed(1)}% of frame`);
    if (n < w * h * 0.005) { log('  ⚠ key left almost nothing — falling back to the whole rectangle'); subject.fill(1); bands = []; }
    // The subject must not touch the frame, or it has no boundary and every downstream stage
    // (contour, bevel, side wall) silently produces nothing — `gold-kid` keys nothing at all and
    // came out as zero loops rather than as a card-shaped slab. One cleared pixel of margin costs
    // nothing visible and makes "no key" degrade to "the card itself", which is a usable answer.
    for (let x = 0; x < w; x++) { subject[x] = 0; subject[(h - 1) * w + x] = 0; }
    for (let y = 0; y < h; y++) { subject[y * w] = 0; subject[y * w + w - 1] = 0; }
    if (o.debug) {
      const dbg = new Uint8ClampedArray(w * h * 4);
      const PAL = [[255, 64, 96], [64, 190, 255], [255, 208, 64], [140, 255, 120]];
      for (let i = 0, p = 0; i < w * h; i++, p += 4) {
        let c = subject[i] ? [245, 245, 250] : [26, 26, 32];
        for (let b = 0; b < bands.length; b++) if (bands[b][i]) c = PAL[b % PAL.length];
        dbg[p] = c[0]; dbg[p + 1] = c[1]; dbg[p + 2] = c[2]; dbg[p + 3] = 255;
      }
      put('key.png', encodePNG(w, h, dbg));
    }
  }

  const embedded = o.embed > 0;
  const smallAlbedo = embedded ? resizeRGBA(img.data, w, h, o.embed) : null;
  const albedoSmallPng = embedded ? encodePNG(smallAlbedo.w, smallAlbedo.h, smallAlbedo.data) : null;
  const nrmSmall = embedded ? resizeRGBA(normalMap(fineH, w, h, { strength: o.normalStrength, flipY: o.flipY }), w, h, o.embed) : null;
  const nrmSmallPng = embedded ? encodePNG(nrmSmall.w, nrmSmall.h, nrmSmall.data) : null;
  const cardMat = () => [{ name: 'card', baseColor: albedoSmallPng, normal: nrmSmallPng, roughness: 0.42, metallic: 0.0, normalScale: 1.0 }];

  const emit = (file2, meshes, materials, assign) => {
    const done = meshes.map(m => m.finish());
    let glb = toGLB(done);
    if (materials) glb = embedMaterials(glb, materials, assign ?? (() => 0));
    put(file2, glb);
    if (o.obj) put(file2.replace(/\.glb$/, '.obj'), Buffer.from(toOBJ(done)));
    const tris = done.reduce((s, m) => s + m.idx.length / 3, 0);
    log(`  ${file2.padEnd(18)} ${String(tris).padStart(7)} tris · ${(glb.length / 1024).toFixed(0)} KB`);
    return tris;
  };

  /* — slab: the whole card as a rounded, bevelled, relief-displaced solid — */
  if (o.modes.includes('slab')) {
    const rect = roundedRectMask(w, h, o.corner * w);
    const F = signedDistance(rect, w, h, 0.7);
    const mesh = buildGridSolid(F, w, h, height, f, {
      name: 'card', depth: o.depth, round: o.round, bevelPx: o.bevel * w, res: o.res, relief: o.relief * o.depth * 4,
    });
    emit('slab.glb', [mesh], embedded ? cardMat() : null);
  }

  /* — pop: the keyed subject as the same kind of solid — */
  if (o.modes.includes('pop') && subject) {
    const F = signedDistance(subject, w, h, 1.1);
    const mesh = buildGridSolid(F, w, h, height, f, {
      name: 'pop', depth: o.depth * 1.5, round: o.round, bevelPx: o.bevel * w * 0.8, res: o.res, relief: o.relief * o.depth * 4,
    });
    emit('pop.glb', [mesh], embedded ? cardMat() : null);
  }

  /* — silhouette: the low-poly contour extrusion — */
  if (o.modes.includes('silhouette') && subject) {
    const F = signedDistance(subject, w, h, 1.3);
    const raw = contours(F, w, h, 0);
    const simple = raw.map(l => simplifyLoop(l, o.simplify)).filter(l => l.length >= 3 && polyArea(l) > o.minArea * w * h * 0.25);
    const groups = groupLoops(simple);
    const pts = simple.reduce((s, l) => s + l.length, 0);
    log(`  contour: ${raw.length} loop${raw.length === 1 ? '' : 's'} → ${groups.length} island${groups.length === 1 ? '' : 's'} + ${groups.reduce((s, g) => s + g.holes.length, 0)} hole(s), ${pts} pts after simplify`);
    if (groups.length) {
      const mesh = buildSilhouette(F, w, h, groups, f, {
        name: 'silhouette', depth: o.depth * 1.5, round: o.round, bevelPx: o.bevel * w * 0.8, bevelRings: o.bevelRings,
      });
      emit('silhouette.glb', [mesh], embedded ? cardMat() : null);
    } else log('  ⚠ no usable contour — silhouette skipped');
  }

  /* — relief: the plain displaced plane, one-sided — */
  if (o.modes.includes('relief')) {
    const mesh = buildRelief(height, w, h, f, { name: 'relief', res: o.res, relief: o.relief * o.depth * 4 });
    emit('relief.glb', [mesh], embedded ? cardMat() : null);
  }

  /* — layers: the extracted diorama (PNG stack + layers.json + layers.glb) — */
  if (o.modes.includes('layers') && subject) {
    const stack = buildStack(img, { w, h, luma, subject, bands, o, log });
    emitStack(stack, img, w, h, f, { o, dir, put, emit, log, name, source: file });
  }

  /* — channels: the artist's own chromatic fringing, pulled apart onto three additive plates — */
  if (o.modes.includes('channels')) {
    mkdirSync(join(dir, 'layers'), { recursive: true });
    const plates = channelPlates(img, w, h);
    const mats = [], entries = [];
    const meshes = plates.map((P, i) => {
      const small = resizeRGBA(P.rgba, w, h, o.layerMax);
      const png = encodePNG(small.w, small.h, small.data);
      writeFileSync(join(dir, 'layers', `ch${i}-${P.name}.png`), png);
      mats.push({ name: P.name, baseColor: png, roughness: 0.9, alphaMode: 'OPAQUE', doubleSided: true });
      const z = (i - 1) * o.layerGap * 0.5 * o.size;
      entries.push({ file: `layers/ch${i}-${P.name}.png`, name: P.name, kind: 'channel', z: +((i - 1) * o.layerGap * 0.5).toFixed(4), rect: [0, 0, 1, 1], blend: 'add', opaque: false, why: `${P.name} record only — recombines to the original at zero parallax` });
      const m = new Mesh(`ch${i}_${P.name}`);
      const V = (px, py) => { m.pos.push((px - w / 2) * f.s, (h / 2 - py) * f.s, z); m.uv.push(px / w, py / h); return m.pos.length / 3 - 1; };
      m.quad(V(0, h), V(w, h), V(w, 0), V(0, 0));
      return m;
    });
    emit('channels.glb', meshes, mats, (nm, i) => i);
    writeFileSync(join(dir, 'channels.json'), JSON.stringify({
      generator: 'png23d', card: name, source: file, kind: 'channel-split',
      units: 'z is a fraction of card HEIGHT, +z toward the viewer',
      note: 'three ADDITIVE plates. They sum to the original image exactly at zero parallax, so the effect appears as the card turns and vanishes as it returns to face-on. Draw with additive blending, not alpha.',
      layers: entries,
    }, null, 2) + '\n');
    log(`  channels.json       3 additive plates`);
  }

  /* — voxel — */
  if (o.modes.includes('voxel')) {
    const mesh = buildVoxel(height, subject, w, h, f, { name: 'voxel', res: o.voxelRes, steps: o.voxelSteps, depth: o.depth * 2 });
    emit('voxel.glb', [mesh], embedded ? cardMat() : null);
  }

  if (o.modes.includes('maps')) log(`  maps: albedo/normal/height/ao at ${w}×${h}`);
  return { name, dir, written };
}

function preview(dirs, o) {
  const script = resolve('scripts/blender/card-preview.py');
  if (!existsSync(script)) { console.error('preview script missing:', script); return; }
  for (const d of dirs) {
    console.log(`\n  rendering preview for ${d} …`);
    try {
      const r = execFileSync('blender', ['--background', '--factory-startup', '-P', script, '--', d], { encoding: 'utf8', maxBuffer: 64 << 20 });
      for (const line of r.split('\n')) if (/^(RENDER|SHEET|NOTE|ERR)/.test(line)) console.log('   ' + line);
    } catch (e) {
      console.error('   preview failed:', String(e.stdout || e.message).split('\n').slice(-6).join('\n   '));
    }
  }
}

function main(argv) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    console.log(`png23d — flat card art → geometry + material maps

  node scripts/png23d.mjs <image…> [options]

  --mode a,b,c        ${MODES.join(' · ')}          (default: maps,slab,pop,layers)
  --all               every mode
  --out DIR           output root                    (default models/cards)
  --name NAME         override the output folder name

  key / silhouette
  --key auto|alpha|rect|grad       background key    (default auto; grad = printed gradient backdrop)
  --tol 0.11          key colour tolerance
  --peel 5            max flood passes: frame → backdrop → subject (1 = a single pass)
  --min-subject 0.12  refuse a peel that would leave less subject than this
  --keep-largest      one island only
  --min-area 0.004    drop islands under this fraction of the frame
  --simplify 1.4      Douglas-Peucker tolerance, px

  shape
  --size 1.0          card height in model units
  --depth 0.075       slab thickness
  --bevel 0.035       bevel inset, as a fraction of card WIDTH
  --round 0.85        0 = hard slab edge, 1 = full pillow
  --res 48            grid vertices along the short side
  --relief 0.22       relief amplitude (× depth × 4)
  --relief-detail .55 0 = smooth base, 1 = engraved keylines
  --invert            dark is high instead of bright is high

  maps
  --normal-strength 2.4 / --normal-blur 0.7 / --normal-flip-y
  --corner 0.045      card corner radius, fraction of width

  layers — the extracted diorama (layers/NN-*.png + layers.json + layers.glb)
  --extract auto|peel|kmeans   how to matte      (default auto: peel, then k-means the remainder)
  --layers 6          budget of planes above the base plate; smallest midgrounds dropped first
  --inpaint-max .12   only layers smaller than this are painted out of the base plate
  --clusters 5        k for the k-means palette matte
  --seed 3030         k-means++ seed — same seed, same clusters, every time
  --no-text           skip text-region detection (it is on by default)
  --text-contrast .055 / --text-grow 2.4 / --text-ground 0.26 (max ground variance under type)
  --cluster-above .55 peel first; k-means the remainder when the peel leaves more than this
  --strata 0          also cut N horizontal glitch strata at the card's own tear rows
  --no-inpaint        do not fill the holes left behind in the back plate
  --feather 1.1       cut-out edge softness, px
  --layer-gap 0.09    plane separation, fraction of card height
  --layer-max 512     max side of an emitted layer PNG

  voxel / channels
  --voxel-res 44 / --voxel-steps 6
  --explode 6         preview only: multiply layer z so the stack reads as a diorama

  output
  --embed 512         embed textures in the GLB at this max side (--no-embed for sidecars only)
  --obj               also write OBJ
  --preview           render Blender preview sheets (Cycles CPU — slow)
  --debug             also write key.png — the peeled bands, colour-coded
`);
    return;
  }
  const { o, files } = parseArgs(argv);
  if (!files.length) throw new Error('no input image given');
  const dirs = [];
  for (const file of files) dirs.push(run(file, o).dir);
  if (o.preview) preview(dirs, o);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error('png23d:', e.message); process.exit(1); }
}

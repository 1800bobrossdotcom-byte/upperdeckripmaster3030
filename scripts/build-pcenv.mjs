#!/usr/bin/env node
/* upperdeckripmaster3030 — vendor a CC0 HDRI as an equirectangular RGBM PNG for the engine build.
 *
 *   npm run pcenv                      # bake the default set
 *   npm run pcenv -- kloppenheim_02    # one, by Poly Haven slug
 *
 * WHY THIS AND NOT `npm run ibl`. `scripts/build-ibl.mjs` bakes an HDRI down to 9 spherical-
 * harmonic coefficients — 27 floats that reconstruct the whole DIFFUSE environment to within a
 * couple of percent, for a few hundred bytes. That is exactly right for our hand-rolled shaders,
 * which have nowhere to put a cubemap and only ever wanted the ambient term.
 *
 * PlayCanvas can take the whole light field. `pc.EnvLighting.generateLightingSource` reprojects an
 * equirect to a cubemap and `generateAtlas` prefilters it into the roughness chain the standard
 * material samples for SPECULAR — which SH fundamentally cannot carry, because a mirror needs
 * direction and SH is a blur. So the engine build gets the image, not the summary.
 *
 * WHY RGBM AND NOT THE .hdr. PlayCanvas has no Radiance parser, and a 1k .hdr is 1.13 MB of
 * float3 anyway. RGBM packs the range into an ordinary 8-bit PNG: rgb carries the colour, alpha
 * carries a shared multiplier, and `decodeRGBM` recovers `rgb * a * 8`. That keeps a sun
 * thousands of times brighter than the sky — which an LDR JPEG of the same view would clip to
 * white, silently destroying the lighting we came for — inside a file the browser already knows
 * how to decode.
 *
 * ⚠ RGBM8's ceiling is 8.0 and PlayCanvas's decode multiplier is fixed, so the sun DISC clips:
 *   preller_drive peaks at 10,992 and 33 of 131,072 pixels land over range. That is acceptable
 *   here and only here — the scene has a real directional sun doing the key and the specular
 *   highlight, and the map is used for FILL. It would not be acceptable if the map were the only
 *   light. The count is recorded in every sidecar .json so the trade is visible, not assumed.
 *
 * LICENCE. Poly Haven is CC0 and verified as such in docs/CC0-SOURCES.md (evidence class A).
 * The authors are recorded in the sidecar .json anyway, because CC0 requires no attribution and
 * giving it is free.
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'models', 'env');
const API = 'https://api.polyhaven.com';
/* 512×256. The atlas this feeds is prefiltered to a 256 cubemap and then mip-chained for
 * roughness, so anything sharper is thrown away by the first filter — and a 1024×512 bake
 * measured 1.37 MB, i.e. LARGER than the 1.13 MB Radiance file it came from, because PNG's
 * predictors have nothing to predict in a noisy sky. 512×256 lands around 350 KB, which is a
 * defensible thing to put in front of a phone. */
const W = 512, H = 256, RGBM_RANGE = 8;

/* Chosen to span what the arenas actually are, not to be pretty: a warm low sun for ROOFTOP and
 * the outdoor arenas, and a night sky for the interiors' cool fill. */
const DEFAULT = ['preller_drive', 'satara_night'];

/* ── Radiance .hdr (RGBE) reader ──────────────────────────────────────────────────────────────
 * Written out rather than pulled from a dependency: this repo ships no build step, and the same
 * ~60 lines already live in scripts/build-ibl.mjs. Kept separate on purpose — build-ibl.mjs is
 * the shipping path for the hand-rolled renderers and is not mine to refactor from here. */
function readHDR(buf) {
  let p = 0;
  const line = () => { let s = ''; while (buf[p] !== 0x0a) s += String.fromCharCode(buf[p++]); p++; return s; };
  if (!line().startsWith('#?')) throw new Error('not a Radiance file');
  let l;
  while ((l = line()) !== '') if (l.startsWith('FORMAT') && !/32-bit_rle_rgbe/.test(l)) throw new Error('unsupported: ' + l);
  const dim = line().match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
  if (!dim) throw new Error('unsupported scanline order');
  const h = +dim[1], w = +dim[2];
  const out = new Float32Array(w * h * 3), row = new Uint8Array(w * 4);
  for (let y = 0; y < h; y++) {
    if (w >= 8 && w < 32768 && buf[p] === 2 && buf[p + 1] === 2 && ((buf[p + 2] << 8) | buf[p + 3]) === w) {
      p += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < w) {
          let n = buf[p++];
          if (n > 128) { const v = buf[p++]; n -= 128; while (n-- > 0) row[(x++) * 4 + c] = v; }
          else { while (n-- > 0) row[(x++) * 4 + c] = buf[p++]; }
        }
      }
    } else {
      for (let x = 0; x < w; x++) { row[x * 4] = buf[p++]; row[x * 4 + 1] = buf[p++]; row[x * 4 + 2] = buf[p++]; row[x * 4 + 3] = buf[p++]; }
    }
    for (let x = 0; x < w; x++) {
      const e = row[x * 4 + 3], f = e ? Math.pow(2, e - 136) : 0;   // 2^(e-128) / 256
      const o = (y * w + x) * 3;
      out[o] = row[x * 4] * f; out[o + 1] = row[x * 4 + 1] * f; out[o + 2] = row[x * 4 + 2] * f;
    }
  }
  return { w, h, data: out };
}

/** Box-filter downsample in LINEAR light. Averaging RGBE bytes or sRGB would move the mean. */
function resize(src, W2, H2) {
  const out = new Float32Array(W2 * H2 * 3);
  const sx = src.w / W2, sy = src.h / H2;
  for (let y = 0; y < H2; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < W2; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const o = (yy * src.w + xx) * 3; r += src.data[o]; g += src.data[o + 1]; b += src.data[o + 2]; n++;
      }
      const o = (y * W2 + x) * 3; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return out;
}

/** Linear float RGB → RGBM8, PlayCanvas's convention (decode = rgb * a * 8). */
function rgbm(px, w, h) {
  const out = Buffer.alloc(w * h * 4);
  let maxSeen = 0, clipped = 0;
  for (let i = 0; i < w * h; i++) {
    let r = px[i * 3] / RGBM_RANGE, g = px[i * 3 + 1] / RGBM_RANGE, b = px[i * 3 + 2] / RGBM_RANGE;
    const m0 = Math.max(r, g, b);
    if (m0 > maxSeen) maxSeen = m0;
    if (m0 > 1) clipped++;
    let m = Math.max(1e-6, Math.min(1, m0));
    m = Math.ceil(m * 255) / 255;
    out[i * 4] = Math.min(255, Math.round(r / m * 255));
    out[i * 4 + 1] = Math.min(255, Math.round(g / m * 255));
    out[i * 4 + 2] = Math.min(255, Math.round(b / m * 255));
    out[i * 4 + 3] = Math.round(m * 255);
  }
  return { buf: out, peak: maxSeen * RGBM_RANGE, clipped };
}

// ── PNG out (Node zlib + a CRC table, no dependency) ────────────────────────────────────────
const CRC = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 4;                                                  // Paeth
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const b = y ? rgba[(y - 1) * stride + x] : 0;
      const c = (x >= 4 && y) ? rgba[(y - 1) * stride + x - 4] : 0;
      const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
      const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      raw[y * (stride + 1) + 1 + x] = (rgba[y * stride + x] - pr) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

async function bake(slug) {
  const files = await (await fetch(`${API}/files/${slug}`)).json();
  const url = files?.hdri?.['1k']?.hdr?.url;
  if (!url) throw new Error('no 1k hdr for ' + slug);
  const info = await (await fetch(`${API}/info/${slug}`)).json();
  const authors = Object.keys(info?.authors || {});
  const raw = Buffer.from(await (await fetch(url)).arrayBuffer());
  const hdr = readHDR(raw);
  const small = resize(hdr, W, H);
  const enc = rgbm(small, W, H);
  const out = png(W, H, enc.buf);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, slug + '.png'), out);
  writeFileSync(join(OUT, slug + '.json'), JSON.stringify({
    slug, source: 'Poly Haven (CC0)', url: `https://polyhaven.com/a/${slug}`, authors,
    licence: 'CC0 1.0 — verified, evidence class A (docs/CC0-SOURCES.md)',
    from: url, encoding: 'RGBM8 equirect, decode = rgb * a * ' + RGBM_RANGE,
    width: W, height: H, sourcePixels: `${hdr.w}x${hdr.h}`,
    peakLuminance: +enc.peak.toFixed(2), pixelsOverRange: enc.clipped,
    bytes: out.length, baked: new Date().toISOString().slice(0, 10),
  }, null, 2) + '\n');
  return { slug, bytes: out.length, peak: enc.peak, clipped: enc.clipped, authors };
}

const want = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = want.length ? want : DEFAULT;
for (const slug of list) {
  if (existsSync(join(OUT, slug + '.png')) && !process.argv.includes('--force')) { console.log(`· ${slug} exists (use --force)`); continue; }
  try { const r = await bake(slug);
    console.log(`✓ ${r.slug}  ${(r.bytes / 1024).toFixed(0)} KB  peak ${r.peak.toFixed(1)}  over-range px ${r.clipped}  by ${r.authors.join(', ')}`);
  } catch (e) { console.error(`✗ ${slug}: ${e.message}`); }
}

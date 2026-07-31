#!/usr/bin/env node
/* upperdeckripmaster3030 — bake a CC0 HDRI into image-based lighting our renderers can afford.
 *
 *   npm run ibl                      # bake the default set
 *   npm run ibl -- kloppenheim_02    # bake one by Poly Haven slug
 *
 * WHY THIS EXISTS. Our renderers light everything with a directional term over an ambient
 * constant (dogfight) or a hemisphere (after today's pass). Real environments are neither: a
 * surface facing a bright sky picks up sky, one facing a red canyon wall picks up the canyon.
 * That directional ambient is the single largest reason a reference screenshot reads as real
 * and a hand-lit scene does not — more than PBR or shadows individually.
 *
 * WHY NOT JUST SHIP THE HDRI. A 1k Radiance file is 1.13 MB and a 4k is 17.6 MB, on a mobile
 * story we have never measured (task #73). But diffuse irradiance is extremely low-frequency —
 * it is a blurry function of direction and nothing more — so it compresses to almost nothing.
 * Projecting onto 9 spherical-harmonic bands gives **27 floats** that reconstruct the entire
 * diffuse environment to within a couple of percent. The whole lighting rig becomes a few
 * hundred bytes of JSON, and the shader cost is nine multiply-adds with no texture fetch.
 *
 * Specular needs direction that SH cannot carry, so a tiny prefiltered equirect strip goes
 * alongside it — small because a rough surface only ever sees a blurred environment anyway.
 *
 * LICENCE. Poly Haven is CC0 and verified as such in docs/CC0-SOURCES.md (evidence class A).
 * We bake COEFFICIENTS, not the artwork: the output is a statistical summary of a light field,
 * which is several steps further from the source than a copy. Authors are recorded anyway,
 * because CC0 requires no attribution and giving it is free.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'models', 'ibl');
const API = 'https://api.polyhaven.com';

/* Chosen to span the lighting situations the games actually put you in, not to be pretty:
 * a hard clear sun, an overcast softbox, a warm low sun, and a night sky. */
const DEFAULT = ['kloofendal_43d_clear_puresky', 'kloppenheim_02', 'preller_drive', 'satara_night'];

/* ── Radiance .hdr (RGBE) reader ───────────────────────────────────────────────────────────
 * Written out rather than pulled from a dependency: it is ~60 lines, and this repo ships no
 * build step. RGBE packs a shared exponent into the alpha byte, so the format carries real
 * dynamic range in 4 bytes per pixel — which is the whole point. A sun can be thousands of
 * times brighter than the sky, and an LDR JPEG of the same view would clip that to white and
 * silently destroy the lighting we are trying to measure. */
function readHDR(buf) {
  let p = 0;
  const line = () => { let s = ''; while (buf[p] !== 0x0a) s += String.fromCharCode(buf[p++]); p++; return s; };
  if (!line().startsWith('#?')) throw new Error('not a Radiance file');
  let l;
  while ((l = line()) !== '') if (l.startsWith('FORMAT') && !/32-bit_rle_rgbe/.test(l)) throw new Error('unsupported: ' + l);
  const dim = line().match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
  if (!dim) throw new Error('unsupported scanline order');
  const H = +dim[1], W = +dim[2];
  const out = new Float32Array(W * H * 3), row = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    // adaptive RLE: the marker is 0x02 0x02 with the width in the next two bytes
    if (W >= 8 && W < 32768 && buf[p] === 2 && buf[p + 1] === 2 && ((buf[p + 2] << 8) | buf[p + 3]) === W) {
      p += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < W) {
          let n = buf[p++];
          if (n > 128) { const v = buf[p++]; n -= 128; while (n-- > 0) row[(x++) * 4 + c] = v; }
          else { while (n-- > 0) row[(x++) * 4 + c] = buf[p++]; }
        }
      }
    } else {                                                    // flat, uncompressed scanline
      for (let x = 0; x < W; x++) { row[x*4] = buf[p++]; row[x*4+1] = buf[p++]; row[x*4+2] = buf[p++]; row[x*4+3] = buf[p++]; }
    }
    for (let x = 0; x < W; x++) {
      const e = row[x * 4 + 3], f = e ? Math.pow(2, e - 136) : 0;   // 128 bias + 8 mantissa bits
      const i = (y * W + x) * 3;
      out[i] = row[x*4] * f; out[i+1] = row[x*4+1] * f; out[i+2] = row[x*4+2] * f;
    }
  }
  return { W, H, data: out };
}

/* ── project an equirect onto 9 SH bands ───────────────────────────────────────────────────
 * Each texel is weighted by its solid angle. That sin(theta) term is the one thing that is
 * easy to omit and impossible to see afterwards: an equirect massively over-samples the poles,
 * so without it the zenith and nadir count for far more than they subtend and every bake comes
 * out subtly wrong in a way that looks like an artistic choice. */
function projectSH(img) {
  const { W, H, data } = img;
  const sh = Array.from({ length: 9 }, () => [0, 0, 0]);
  let wsum = 0;
  for (let y = 0; y < H; y++) {
    const theta = (y + 0.5) / H * Math.PI;
    const st = Math.sin(theta), ct = Math.cos(theta);
    const dw = st * (Math.PI / H) * (2 * Math.PI / W);
    for (let x = 0; x < W; x++) {
      const phi = (x + 0.5) / W * 2 * Math.PI - Math.PI;
      // world convention matches the renderers: +Y up, equirect seam behind the camera
      const d = [st * Math.sin(phi), ct, -st * Math.cos(phi)];
      const Y = [
        0.282095,
        0.488603 * d[1], 0.488603 * d[2], 0.488603 * d[0],
        1.092548 * d[0] * d[1], 1.092548 * d[1] * d[2],
        0.315392 * (3 * d[2] * d[2] - 1),
        1.092548 * d[0] * d[2],
        0.546274 * (d[0] * d[0] - d[1] * d[1]),
      ];
      const i = (y * W + x) * 3;
      for (let k = 0; k < 9; k++) {
        const w = Y[k] * dw;
        sh[k][0] += data[i] * w; sh[k][1] += data[i+1] * w; sh[k][2] += data[i+2] * w;
      }
      wsum += dw;
    }
  }
  /* Fold in the cosine-lobe convolution now, so the shader is a plain dot product rather than
   * carrying these constants around. This is what turns "radiance in a direction" into
   * "irradiance on a surface facing that direction". */
  const A = [3.141593, 2.094395, 2.094395, 2.094395, 0.785398, 0.785398, 0.785398, 0.785398, 0.785398];
  return sh.map((c, k) => c.map(v => v * A[k] / Math.PI));
}

/** a small prefiltered equirect for rough specular — SH cannot carry directional detail */
function downsample(img, W2, H2) {
  const { W, H, data } = img, out = new Float32Array(W2 * H2 * 3);
  const sx = W / W2, sy = H / H2;
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = Math.floor(y*sy); j < Math.min(H, (y+1)*sy); j++)
      for (let i = Math.floor(x*sx); i < Math.min(W, (x+1)*sx); i++) {
        const k = (j * W + i) * 3; r += data[k]; g += data[k+1]; b += data[k+2]; n++; }
    const o = (y * W2 + x) * 3;
    out[o] = r/n; out[o+1] = g/n; out[o+2] = b/n;
  }
  return { W: W2, H: H2, data: out };
}

async function bake(slug) {
  const files = await (await fetch(`${API}/files/${slug}`)).json();
  const url = files?.hdri?.['1k']?.hdr?.url;
  if (!url) throw new Error(`${slug}: no 1k .hdr`);
  const info = await (await fetch(`${API}/info/${slug}`)).json();
  const authors = Object.keys(info.authors || {});
  process.stdout.write(`  ${slug} … `);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const img = readHDR(buf);
  const sh = projectSH(img);
  const spec = downsample(img, 64, 32);
  // tone the specular strip into a byte range; the SH carries the absolute level
  const peak = Math.max(...spec.data) || 1;
  const bytes = Array.from(spec.data, v => Math.round(255 * Math.pow(Math.min(1, v / peak), 1 / 2.2)));
  const out = {
    slug, source: 'Poly Haven (CC0)', url: `https://polyhaven.com/a/${slug}`, authors,
    note: 'Baked coefficients, not the artwork. CC0 verified in docs/CC0-SOURCES.md.',
    sh,                                        // 9 × RGB, cosine-convolved irradiance
    spec: { w: spec.W, h: spec.H, peak, rgb: bytes },
  };
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${slug}.json`);
  writeFileSync(path, JSON.stringify(out));
  const kb = (readFileSync(path).length / 1024).toFixed(1);
  const amb = sh[0].map(v => v.toFixed(3)).join(', ');
  console.log(`${img.W}×${img.H} HDR (${(buf.length/1048576).toFixed(2)} MB) → ${kb} KB   ambient rgb(${amb})`);
  return path;
}

const want = process.argv.slice(2).filter(a => !a.startsWith('--'));
const list = want.length ? want : DEFAULT;
console.log(`baking ${list.length} CC0 environment(s) → models/ibl/`);
for (const s of list) { try { await bake(s); } catch (e) { console.error(`  ${s}: ${e.message}`); } }
console.log('done. Poly Haven is CC0; authors are recorded in each file as a courtesy.');

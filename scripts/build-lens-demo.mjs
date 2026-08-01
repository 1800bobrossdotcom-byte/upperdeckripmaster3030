#!/usr/bin/env node
/* ripmaster3030studios — bake the layered-card reference, then MEASURE it.
 *
 *     node scripts/build-lens-demo.mjs            bake + check
 *     node scripts/build-lens-demo.mjs --check    check what is already there, bake nothing
 *
 * ⚑ THE MEASUREMENT IS THE POINT, not the convenience wrapper. Two of the three ways this asset
 *   can be silently wrong are invisible in a screenshot:
 *     1. THE ALPHA CHANNEL SILENTLY DROPPED. Blender bakes RGB; the cut-out is a second bake
 *        moved into the colour image's alpha in numpy, and if that step or the WebP encoder
 *        loses it, every layer becomes an opaque rectangle — a stack of five cards, each hiding
 *        the one behind it. On screen it just looks like the top layer. So the alpha flag is
 *        read out of the WebP container here, per file, and a missing one fails the build.
 *     2. THE SIDECAR POINTING AT NOTHING. A renamed or unbaked plate makes CardLayers drop that
 *        layer and the card quietly loses a plane of depth.
 *   The third — does it look good — is what the screenshots are for.
 *
 * ⚠ SIZE IS A REAL CONSTRAINT HERE, not housekeeping. This card opens in a phone's media slot
 *   behind a 598 KB engine, so the budget below is enforced rather than reported.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'media/lens/demo');
const BUDGET_KB = 1400;                 // all plates + normals + the flat composite, together

/** Does this WebP carry an alpha channel? Read from the container, not inferred.
 *  RIFF....WEBP then a chunk: VP8X (extended — bit 4 of its first flag byte is ALPHA),
 *  VP8L (lossless — bit 3 of byte 4 of the 5-byte header), or VP8 (lossy, never has alpha). */
function webpAlpha(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const tag = b.toString('ascii', 12, 16);
  if (tag === 'VP8X') return !!(b[20] & 0x10);
  if (tag === 'VP8L') return !!(b[24] & 0x10);
  return false;
}
function dims(file) {
  const b = fs.readFileSync(file);
  const tag = b.toString('ascii', 12, 16);
  if (tag === 'VP8X') return [(b.readUIntLE(24, 3) & 0xffffff) + 1, (b.readUIntLE(27, 3) & 0xffffff) + 1];
  if (tag === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (tag === 'VP8L') {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  return null;
}

if (!process.argv.includes('--check')) {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('baking (1-sample EMIT/NORMAL passes — a shader evaluation, not light transport)…');
  const t0 = Date.now();
  const out = execFileSync('blender', ['--background', '--factory-startup',
    '-P', path.join(ROOT, 'scripts/blender/build-lens-demo.py'), '--', OUT],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  for (const line of out.split('\n')) if (/^LENS_/.test(line)) console.log('  ' + line);
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

let bad = 0;
const side = path.join(OUT, 'demo.layers.json');
if (!fs.existsSync(side)) { console.error('MISSING ' + side); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(side, 'utf8'));

console.log('\n  layer      z     blend  fit   file            bytes   dims        alpha  normal');
let total = fs.statSync(side).size;
for (const L of spec.layers) {
  const f = path.join(OUT, L.src);
  if (!fs.existsSync(f)) { console.log(`  ${L.id}: MISSING ${L.src}`); bad++; continue; }
  const sz = fs.statSync(f).size; total += sz;
  const a = webpAlpha(f), d = dims(f);
  /* The bottom plate is the backing: it is meant to be opaque, and demanding alpha of it would
   * be demanding a hole in the card. Every plate above it is a cut-out or it is a curtain. */
  const wantAlpha = L !== spec.layers[0];
  if (wantAlpha && !a) { console.log(`  !! ${L.id} has NO ALPHA — it would hide every layer behind it`); bad++; }
  let n = '';
  if (L.normal) {
    const nf = path.join(OUT, L.normal);
    if (!fs.existsSync(nf)) { n = 'MISSING'; bad++; }
    else { const ns = fs.statSync(nf).size; total += ns; n = `${L.normal} ${(ns / 1024).toFixed(0)}K ${dims(nf).join('x')}`; }
  }
  console.log(`  ${L.id.padEnd(9)} ${String(L.z).padEnd(5)} ${(L.blend || 'normal').padEnd(6)} ` +
              `${(L.fit || 'art').padEnd(5)} ${L.src.padEnd(15)} ${String(sz).padStart(6)}  ` +
              `${(d ? d.join('x') : '?').padEnd(11)} ${a ? 'yes' : 'no '}    ${n}`);
}
const flat = path.join(OUT, 'flat.webp');
if (!fs.existsSync(flat)) { console.log('  !! flat.webp missing — the single-plate version every other surface uses'); bad++; }
else total += fs.statSync(flat).size;

console.log(`\n  total ${(total / 1024).toFixed(0)} KB (budget ${BUDGET_KB} KB)`);
if (total / 1024 > BUDGET_KB) { console.log('  !! over budget'); bad++; }
console.log(bad ? `\n${bad} problem(s)` : '\nok');
process.exit(bad ? 1 : 0);

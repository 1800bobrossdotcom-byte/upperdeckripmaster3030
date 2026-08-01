/* ripmaster3030studios — bake the site's background material.   npm run bg
 *
 * Drives scripts/blender/build-bg.py, then MEASURES what came back. Two things can be wrong with
 * a tiling background and neither is reliably visible in a thumbnail:
 *
 *   1. IT DOESN'T ACTUALLY TILE. A seam on a page-filling background is a hard vertical line
 *      down the site. The eye misses it in a 200px preview and never misses it at full width.
 *   2. IT'S TOO BRIGHT TO PUT TEXT ON. This is a backdrop for paragraphs; if it needs a scrim to
 *      be readable then the scrim is the background and this was decoration.
 *
 * Both are cheap to measure and expensive to discover later, so they are assertions, not notes.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG } from './png23d.mjs';

const ROOT = '/home/user/upperdeckripmaster3030';
const OUT = join(ROOT, 'media/bg');
const SIZE = process.env.BG_SIZE || '1024';

mkdirSync(OUT, { recursive: true });
console.log(`baking ${SIZE}² …`);
const log = execFileSync('blender', ['--background', '--factory-startup',
  '-P', 'scripts/blender/build-bg.py', '--', OUT],
  { cwd: ROOT, encoding: 'utf8', env: { ...process.env, BG_SIZE: SIZE } });
if (!/BG_OK/.test(log)) { console.error(log); process.exit(1); }

let fail = 0;
const t = (name, ok, extra = '') => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? '  — ' + extra : '')); if (!ok) fail++; };

const load = f => { const p = join(OUT, f); const img = decodePNG(readFileSync(p)); img.kb = statSync(p).size / 1024; return img; };

/* ── does it tile? ────────────────────────────────────────────────────────────────────────────
 * The tile is periodic, so the step from the LAST column back to the FIRST is just another
 * one-pixel step and should cost about what an interior step costs. Comparing the wrap against
 * the interior mean is the whole test — an absolute threshold would depend on how noisy the
 * material happens to be, which is exactly the thing we keep changing.                          */
function seam(img, label) {
  const { w, h, data } = img;
  const at = (x, y, c) => data[(y * w + x) * 4 + c];
  const colDiff = (x0, x1) => { let s = 0; for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) s += Math.abs(at(x0, y, c) - at(x1, y, c)); return s / (h * 3); };
  const rowDiff = (y0, y1) => { let s = 0; for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) s += Math.abs(at(x, y0, c) - at(x, y1, c)); return s / (w * 3); };

  let interiorC = 0, interiorR = 0;
  for (let x = 1; x < w; x++) interiorC += colDiff(x - 1, x);
  for (let y = 1; y < h; y++) interiorR += rowDiff(y - 1, y);
  interiorC /= (w - 1); interiorR /= (h - 1);
  const wrapC = colDiff(w - 1, 0), wrapR = rowDiff(h - 1, 0);

  // 2.5x the typical interior step is generous — a real seam runs 10-50x
  t(`${label}: tiles horizontally (wrap ${wrapC.toFixed(2)} vs interior ${interiorC.toFixed(2)})`,
    wrapC < interiorC * 2.5 + 0.5);
  t(`${label}: tiles vertically (wrap ${wrapR.toFixed(2)} vs interior ${interiorR.toFixed(2)})`,
    wrapR < interiorR * 2.5 + 0.5);
}

/* ── can you read text on it? ─────────────────────────────────────────────────────────────── */
function legible(img) {
  const { w, h, data } = img;
  const lum = [];
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const L = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    lum.push(L); sum += L;
  }
  const mean = sum / lum.length;
  lum.sort((a, b) => a - b);
  const p = q => lum[Math.min(lum.length - 1, Math.floor(q * lum.length))];
  const p99 = p(0.99), p50 = p(0.50);
  let v = 0; for (const L of lum) v += (L - mean) ** 2;
  const sd = Math.sqrt(v / lum.length);

  console.log(`  albedo luma: mean ${mean.toFixed(1)} · median ${p50.toFixed(1)} · p99 ${p99.toFixed(1)} · sd ${sd.toFixed(1)}`);
  /* ⚑ These bounds are about CONTRAST AGAINST TEXT, not taste. The site's body text is #d9ffe9
   *   (luma ~236) on panels of rgba(2,16,9,.82). Anything under ~40 mean keeps a >7:1 ratio
   *   against that text even where a panel is translucent; the p99 bound stops a few blown
   *   highlights from punching through a paragraph even when the mean looks safe. */
  t(`mean luma under 40 (text stays legible)`, mean < 40, mean.toFixed(1));
  t(`p99 luma under 96 (no highlight punches through text)`, p99 < 96, p99.toFixed(1));
  t(`not flat — sd above 3 (it is a texture, not a fill)`, sd > 3, sd.toFixed(1));
}

/* ⚑ Quality is measured on the LOSSLESS png, cost on the SHIPPED webp. Judging the seam on a
 * lossy file would let WebP's ringing take the blame for a material that tiles fine — or, worse,
 * hide a real seam under compression noise. The pngs are deleted below; they never ship. */
const alb = load('foil-albedo.png');
const nrm = load('foil-normal.png');
const shipKb = f => statSync(join(OUT, f)).size / 1024;
const albKb = shipKb('foil-albedo.webp'), nrmKb = shipKb('foil-normal.webp');
console.log(`\nalbedo ${alb.w}×${alb.h}  webp ${albKb.toFixed(0)} KB (png ${alb.kb.toFixed(0)})`);
console.log(`normal ${nrm.w}×${nrm.h}  webp ${nrmKb.toFixed(0)} KB (png ${nrm.kb.toFixed(0)})\n`);

seam(alb, 'albedo');
seam(nrm, 'normal');
legible(alb);

/* payload budget: this ships on EVERY page, so it is a real cost, not an asset */
const totalKb = albKb + nrmKb;
t(`total under 900 KB (it loads on every page)`, totalKb < 900, totalKb.toFixed(0) + ' KB');

for (const f of ['foil-albedo.png', 'foil-normal.png']) { try { unlinkSync(join(OUT, f)); } catch {} }

/* ── the check that actually matters: the LIT composite ──────────────────────────────────────
 * ⚑ The albedo bounds above are necessary but NOT sufficient, and that is a mistake this build
 *   already made once. A bake measured at mean luma 33 looked safe, then three coloured lights
 *   and a specular put the composite's p99 at 80 with a lot of high-frequency structure, and
 *   the small dim print on tokenomics.html visibly fought it. Text sits on the LIT plate, so
 *   the lit plate is what gets a threshold. Contrast under small type is a SPATIAL property —
 *   a mean will happily pass a background you cannot read on, which is why sd is bounded too.
 *
 * Skipped (not failed) when the headless browser isn't available: this is an asset build, and
 * it should still work on a machine without playwright. It says so rather than going quiet.  */
if (!process.env.BG_SKIP_COMPOSITE) {
  try {
    const out = execFileSync('node', ['scripts/check-bg-composite.mjs'], { cwd: ROOT, encoding: 'utf8' });
    process.stdout.write(out);
    if (/FAIL/.test(out)) fail++;
  } catch (e) {
    const msg = (e.stdout || '') + (e.stderr || '');
    if (/Cannot find module|ENOENT/.test(msg)) console.log('  --   composite check skipped (no headless browser here)');
    else { process.stdout.write(msg); console.log('  FAIL composite check errored'); fail++; }
  }
}

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);

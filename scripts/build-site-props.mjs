/* ripmaster3030studios — bake the site's material set.   node scripts/build-site-props.mjs
 * (suggested package.json alias: "site:tex" — not added here, package.json is outside this change)
 *
 * Drives scripts/blender/build-site-props.py, then MEASURES what came back. Same two failure
 * modes scripts/build-bg.mjs guards, and neither is reliably visible in a thumbnail:
 *
 *   1. IT DOESN'T ACTUALLY TILE. A seam on a repeating surface is a hard line across a panel.
 *      The eye misses it in a 200px preview and never misses it at full width.
 *   2. IT'S THE WRONG BRIGHTNESS TO PUT TEXT ON — and that means something DIFFERENT per
 *      material, which is the part a single shared threshold would get wrong:
 *        vinyl / steel carry pale phosphor type, so they must stay DARK  (bound the bright tail)
 *        pulp        carries near-black type,     so it must stay LIGHT  (bound the DARK tail)
 *      A p1 bound on pulp is not decoration: a halftone dot that dips near black is a speck of
 *      dirt inside a letterform, and nothing about the mean would have caught it.
 *
 * ⚑ Quality is measured on the LOSSLESS png, cost on the SHIPPED webp — the same split
 *   build-bg.mjs uses. Judging a seam on a lossy file lets WebP's ringing take the blame for a
 *   material that tiles fine, or hides a real seam under compression noise. The pngs never ship.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG } from './png23d.mjs';

const ROOT = '/home/user/upperdeckripmaster3030';
const OUT = join(ROOT, 'media/site');
const SIZE = process.env.SITE_SIZE || '512';

/* Each material declares the polarity it is USED at, so the check follows the design instead of
 * the design having to follow one shared number. `dark` = pale text sits on it. */
const MATS = [
  { name: 'vinyl', polarity: 'dark',  meanMax: 26, tailMax: 62 },
  /* ⚠ steel is HARDWARE, not a text bed — rings, buttons, the props' metal. Holding it to the
   *   dark-backdrop bound was applying the wrong rule to it, so it gets its own: stay inside a
   *   mid band, because a metal that goes dark is a shadow and one that goes pale is a mirror.
   *   The pages must not put running text directly on this tile; that is a design rule, and it
   *   is the reason this row is not `dark`. */
  { name: 'steel', polarity: 'band',  meanMin: 45, meanMax: 110 },
  { name: 'pulp',  polarity: 'light', meanMin: 176, tailMin: 132 },
];

mkdirSync(OUT, { recursive: true });
console.log(`baking ${MATS.map(m => m.name).join(' · ')} at ${SIZE}² …`);
const log = execFileSync('blender', ['--background', '--factory-startup',
  '-P', 'scripts/blender/build-site-props.py', '--', OUT],
  { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SITE_SIZE: SIZE } });
if (!/SITE_OK/.test(log)) { console.error(log); process.exit(1); }

let fail = 0;
const t = (name, ok, extra = '') => {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? '  — ' + extra : ''));
  if (!ok) fail++;
};

const load = f => decodePNG(readFileSync(join(OUT, f)));
const kb = f => statSync(join(OUT, f)).size / 1024;

/* ── does it tile? ────────────────────────────────────────────────────────────────────────────
 * The tile is periodic, so the step from the LAST column back to the FIRST is just another
 * one-pixel step and should cost about what an interior step costs. Comparing the wrap against
 * the interior mean is the whole test — an absolute threshold would depend on how noisy the
 * material happens to be, which is exactly the thing we keep changing.                         */
function seam(img, label) {
  const { w, h, data } = img;
  const at = (x, y, c) => data[(y * w + x) * 4 + c];
  const colDiff = (x0, x1) => { let s = 0; for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) s += Math.abs(at(x0, y, c) - at(x1, y, c)); return s / (h * 3); };
  const rowDiff = (y0, y1) => { let s = 0; for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) s += Math.abs(at(x, y0, c) - at(x, y1, c)); return s / (w * 3); };

  let ic = 0, ir = 0;
  for (let x = 1; x < w; x++) ic += colDiff(x - 1, x);
  for (let y = 1; y < h; y++) ir += rowDiff(y - 1, y);
  ic /= (w - 1); ir /= (h - 1);
  const wc = colDiff(w - 1, 0), wr = rowDiff(h - 1, 0);

  // 2.5x the typical interior step is generous — a real seam runs 10-50x
  t(`${label}: tiles horizontally (wrap ${wc.toFixed(2)} vs interior ${ic.toFixed(2)})`, wc < ic * 2.5 + 0.5);
  t(`${label}: tiles vertically (wrap ${wr.toFixed(2)} vs interior ${ir.toFixed(2)})`, wr < ir * 2.5 + 0.5);
}

function stats(img) {
  const { w, h, data } = img;
  const lum = new Float64Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const L = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    lum[i] = L; sum += L;
  }
  const mean = sum / lum.length;
  const sorted = Array.from(lum).sort((a, b) => a - b);
  const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  let v = 0; for (const L of lum) v += (L - mean) ** 2;
  return { mean, p1: q(0.01), p50: q(0.50), p99: q(0.99), sd: Math.sqrt(v / lum.length) };
}

let totalKb = 0;
for (const m of MATS) {
  const albPng = `${m.name}-albedo.png`, nrmPng = `${m.name}-normal.png`;
  if (!existsSync(join(OUT, albPng))) { t(`${m.name}: baked`, false, 'missing'); continue; }
  const alb = load(albPng), nrm = load(nrmPng);
  const aKb = kb(`${m.name}-albedo.webp`), nKb = kb(`${m.name}-normal.webp`);
  totalKb += aKb + nKb;

  const s = stats(alb);
  console.log(`\n${m.name}  ${alb.w}×${alb.h}  webp ${(aKb + nKb).toFixed(0)} KB ` +
    `(albedo ${aKb.toFixed(0)} + normal ${nKb.toFixed(0)})`);
  console.log(`  luma: mean ${s.mean.toFixed(1)} · p1 ${s.p1.toFixed(1)} · median ${s.p50.toFixed(1)} · ` +
    `p99 ${s.p99.toFixed(1)} · sd ${s.sd.toFixed(1)}`);

  seam(alb, m.name + ' albedo');
  seam(nrm, m.name + ' normal');

  if (m.polarity === 'dark') {
    t(`${m.name}: mean under ${m.meanMax} (pale type stays legible)`, s.mean < m.meanMax, s.mean.toFixed(1));
    t(`${m.name}: p99 under ${m.tailMax} (no highlight punches through text)`, s.p99 < m.tailMax, s.p99.toFixed(1));
  } else if (m.polarity === 'band') {
    t(`${m.name}: mean in ${m.meanMin}..${m.meanMax} (reads as metal, not shadow or mirror)`,
      s.mean > m.meanMin && s.mean < m.meanMax, s.mean.toFixed(1));
  } else {
    t(`${m.name}: mean over ${m.meanMin} (dark type stays legible)`, s.mean > m.meanMin, s.mean.toFixed(1));
    t(`${m.name}: p1 over ${m.tailMin} (no speck reads as dirt in a letterform)`, s.p1 > m.tailMin, s.p1.toFixed(1));
  }
  t(`${m.name}: not flat — sd above 2 (it is a texture, not a fill)`, s.sd > 2, s.sd.toFixed(1));

  for (const f of [albPng, nrmPng]) { try { unlinkSync(join(OUT, f)); } catch {} }
}

/* payload budget. ⚠ These do NOT load on every page the way media/bg does — each page pulls only
 * the surfaces it is actually made of — but three pages sharing one cache is still a real cost. */
console.log('');
t(`total under 700 KB`, totalKb < 700, totalKb.toFixed(0) + ' KB');

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);

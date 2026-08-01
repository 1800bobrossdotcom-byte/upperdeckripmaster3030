#!/usr/bin/env node
/* upperdeckripmaster3030 — bake the Section 9 arena materials: Blender → textures/*.png
 *
 *   npm run textures                       # all nine classes at 512, ~70s on 4 CPU cores
 *   npm run textures -- --size 1024        # …bigger (≈4× the time and ≈3.5× the bytes)
 *   npm run textures -- --only deck,wall   # …one at a time, while authoring
 *   npm run textures -- --no-ao            # skip ambient occlusion; it is most of the wall clock
 *
 * The authoring is all in scripts/blender/bake-materials.py. What this adds is the CHECK, the
 * same habit as scripts/build-craft.mjs: js/s9pc-world.js FAILS OPEN on a missing texture, which
 * is right at runtime and useless at build time — a bad bake would look exactly like "the update
 * didn't ship". So the tiling is asserted numerically here, where a seam is a red line.
 *
 * It also writes textures/manifest.json. That file is what the runtime fetches FIRST, so a repo
 * with no textures/ yet costs one 404 instead of twenty-seven — and a clean console is the only
 * state in which a real 404 is visible.
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Must match ORDER in js/s9pc-world.js and CLASSES in scripts/blender/bake-materials.py. A class
 * missing from the bake is not fatal — the runtime falls back per class — but it is never
 * intentional, so it is reported. */
const CLASSES = ['deck', 'wall', 'metal', 'crate', 'cab', 'water', 'plant', 'awning', 'trim'];
const MAPS = ['albedo', 'normal', 'orm'];

/* Wrap error is measured in 8-BIT LEVELS by the Python side: it compares the overscan the bake
 * already produced against the interior one period away, so a perfect tile is 0 and quantisation
 * noise is 1. Two levels is the most a byte-rounded pattern should ever disagree by. */
const WRAP_LIMIT = 2.0;

const argv = process.argv.slice(2);
const only = (argv.find(a => a.startsWith('--only')) || '').includes('=')
  ? argv.find(a => a.startsWith('--only')).split('=')[1]
  : (argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null);
const wanted = only ? only.split(',') : CLASSES;
const OUT = join(ROOT, 'textures');

try { execFileSync('blender', ['--version'], { stdio: 'ignore' }); }
catch (e) {
  console.error('blender not found on PATH.\n' +
    '  Ubuntu/Debian: sudo apt-get install blender\n' +
    '  or download from https://www.blender.org/download/ and put it on PATH');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = execFileSync('blender', ['--background', '--factory-startup', '-noaudio',
  '-P', join(ROOT, 'scripts', 'blender', 'bake-materials.py'), '--', ...argv],
  { encoding: 'utf8', maxBuffer: 1 << 28 });
const lines = log.split('\n');

if (!lines.some(l => l.startsWith('TOTAL '))) {
  console.error(lines.filter(l => /BAKE_FAIL|Error|Traceback|line \d+/.test(l)).join('\n'));
  throw new Error('blender did not finish the bake');
}

for (const l of lines) {
  if (/^(CLASS|TOTAL|AOSTAT) /.test(l)) console.log(l);
}

/* ── tiling, asserted ────────────────────────────────────────────────────────────────────────── */
let worst = 0, worstAt = '';
const wraps = lines.filter(l => l.startsWith('WRAP '));
for (const l of wraps) {
  const m = l.match(/^WRAP (\S+) (\S+) mean=([\d.]+) max=([\d.]+)/);
  if (!m) continue;
  const mx = +m[4];
  if (mx > worst) { worst = mx; worstAt = `${m[1]}_${m[2]}`; }
}
console.log(`tiling: ${wraps.length} maps checked, worst wrap error ${worst.toFixed(2)} levels (${worstAt})`);
if (worst > WRAP_LIMIT) {
  for (const l of wraps) console.error(l);
  throw new Error(`a texture does not tile — ${worstAt} disagrees by ${worst} levels across the wrap`);
}
/* AO gets no overscan (see the Python), so its edge is reported rather than asserted exactly:
 * the check is that the wrap step is not out of line with a typical neighbouring step. */
for (const l of lines.filter(l => l.startsWith('AOEDGE '))) {
  const m = l.match(/^AOEDGE (\S+) wrap=([\d.]+) typical=([\d.]+)/);
  if (!m) continue;
  const r = +m[3] > 1e-6 ? +m[2] / +m[3] : 0;
  const flag = r > 2.5 ? '  ⚠ above 2.5× — re-check the AO ring' : '';
  console.log(`  ao edge ${m[1].padEnd(7)} ${(+m[2]).toFixed(2)} vs ${(+m[3]).toFixed(2)} typical (${r.toFixed(2)}×)${flag}`);
}

/* ── manifest ────────────────────────────────────────────────────────────────────────────────── */
const classes = {};
let bytes = 0, missing = [];
for (const key of CLASSES) {
  const files = {};
  let ok = true;
  for (const map of MAPS) {
    const f = `${key}_${map}.png`;
    if (!existsSync(join(OUT, f))) { ok = false; continue; }
    files[map] = f;
    bytes += statSync(join(OUT, f)).size;
  }
  /* A half set is treated as no set — the runtime refuses to mix a baked albedo with a generated
   * normal, because that combination is a look nobody chose. Keep the manifest honest about it. */
  if (ok) classes[key] = files;
  else if (wanted.includes(key)) missing.push(key);
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  note: 'Generated by `npm run textures` (scripts/blender/bake-materials.py). Do not hand-edit.',
  generated: new Date().toISOString().slice(0, 10),
  channels: { albedo: 'sRGB rgb', normal: 'tangent-space rgb, OpenGL +Y', orm: 'r=ao g=roughness b=metalness' },
  classes,
}, null, 2) + '\n');

const stray = readdirSync(OUT).filter(f => f.endsWith('.png') &&
  !CLASSES.some(k => MAPS.some(m => f === `${k}_${m}.png`)));
if (stray.length) console.log(`  ⚠ ${stray.length} file(s) in textures/ not in the manifest: ${stray.join(', ')}`);

console.log(`→ ${Object.keys(classes).length}/${CLASSES.length} classes, ` +
  `${(bytes / 1048576).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s wall clock`);
if (missing.length) console.log(`  ⚠ no complete set for: ${missing.join(', ')} — those fall back to the canvas generator`);

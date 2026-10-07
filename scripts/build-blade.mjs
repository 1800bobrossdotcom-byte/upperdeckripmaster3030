#!/usr/bin/env node
/* ripmaster3030studios — build THE LIGHT's authored geometry:
 *   Blender → models/blade.glb   (the two blades, the shared hilt, the dark figure, the floor)
 *
 *   npm run blade
 *   npm run blade -- --out build/    # somewhere else, to diff against the shipped file
 *
 * What this adds over running blender by hand is the CHECKS at the end, and they are not
 * decoration — the first run of build-blade.py exported FOUR parts against a five-part contract
 * and reported success. `bpy.ops.object.join()` joins by SELECTION, and the selection left
 * standing by the hilt's join was still live when the foe joined, so `hilt` was swallowed whole.
 * Blender printed "Finished glTF 2.0 export", the file was written, the size looked right, and
 * the only thing anywhere that said otherwise was the number of PART lines.
 *
 * ⚑ AND THE PAGE CANNOT REPORT IT EITHER. blade.html falls open to a primitive when a part is
 *   missing — that is deliberate, because a duel with no visible sword is worse than a duel with
 *   a box for a sword — so a missing `hilt` ships as a blade with no handle and nothing logs.
 *   Every failure mode in this pipeline is silent, which is exactly the case for asserting.
 *
 * ⛔ TWO OF THE FOUR CHECKS ARE MEASUREMENTS, NOT NAMES, because the two ways this geometry can be
 *   wrong while being completely present are both numeric:
 *     · THE ORIGIN IS AT THE GRIP. Every arc in this game is drawn by rotating the blade NODE, so
 *       an origin at the blade's middle swings it like a propeller. A name check cannot see it and
 *       a screenshot of a still frame cannot either — it only appears in motion.
 *     · THE TWO BLADES ARE THE SAME LENGTH. The whole game is reading an incoming line and cutting
 *       across it; a duel where one weapon is secretly longer is a duel nobody can read, and the
 *       player would experience it as "the timing is off" rather than as a geometry bug.
 *   Same argument as build-craft.mjs's gantry-vs-avenue span: a number that lives in prose is a
 *   number that gets lost, so assert it rather than write it down.
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Must match the object names in the .py AND the lookups in blade.html.
 * ⚠ If a part is renamed in one place only, the page falls open and the duel quietly loses a
 *   sword, a hilt or the ground it stands on. */
const REQUIRED = ['blade_light', 'blade_dark', 'hilt', 'foe', 'ground'];

/* The game's reach numbers (js/blade-game.js) are in world units and assume a 1.0 blade. */
const BLADE_LEN = 1.0;
const LEN_TOL = 0.08;

const argv = process.argv.slice(2);
const outDir = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : null; })();
const out = outDir ? resolve(ROOT, outDir, 'blade.glb') : resolve(ROOT, 'models/blade.glb');

try { execFileSync('blender', ['--version'], { stdio: 'ignore' }); }
catch (e) {
  console.error('blender not found on PATH.\n' +
    '  Ubuntu/Debian: sudo apt-get install blender\n' +
    '  or download from https://www.blender.org/download/ and put it on PATH');
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
const log = execFileSync('blender', ['--background', '--factory-startup', '-noaudio',
  '-P', join(ROOT, 'scripts', 'blender', 'build-blade.py'), '--', out],
  { encoding: 'utf8', maxBuffer: 1 << 26 });

const lines = log.split('\n');
const done = lines.find(l => l.startsWith('EXPORTED'));
if (!done) {
  console.error(lines.filter(l => /EXPORT_FAIL|Error|Traceback|line \d+/.test(l)).join('\n'));
  throw new Error('blender did not export models/blade.glb');
}
console.log('\n' + done);
const parts = lines.filter(l => l.startsWith('  PART'));
for (const l of parts) console.log(l);
if (!existsSync(out)) throw new Error(`no file at ${out}`);
console.log(`→ ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);

let failed = false;
const say = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed = true; };

const got = new Map();
for (const l of parts) {
  const f = l.trim().split(/\s+/);              // PART <name> <tris> tris extent A × B × C
  got.set(f[1], { tris: +f[2], ext: [+f[5], +f[7], +f[9]] });
}

/* 1 — every name the page looks up */
const missing = REQUIRED.filter(n => !got.has(n));
if (missing.length) {
  console.error(`\n✗ blade.glb is missing part(s) the view looks up by name: ${missing.join(', ')}`);
  console.error('  blade.html fails open to a primitive, so this would ship as silently-wrong geometry.');
  failed = true;
} else {
  console.log(`\n  ✓ all ${REQUIRED.length} named parts present`);
}

/* 2 — the blade is 1.0 long, so js/blade-game.js's reach numbers mean world units.
 * Blender is Z-up here, so the printed extent is (width, thickness, LENGTH). */
for (const nm of ['blade_light', 'blade_dark']) {
  const p = got.get(nm);
  if (!p) continue;
  const len = p.ext[2];
  say(Math.abs(len - BLADE_LEN) <= LEN_TOL,
    `${nm} is ${len.toFixed(3)} long (want ${BLADE_LEN} ±${LEN_TOL})`);
}

/* 3 — the two blades match. A duel where one weapon is longer is unreadable. */
const bl = got.get('blade_light'), bd = got.get('blade_dark');
if (bl && bd) {
  say(Math.abs(bl.ext[2] - bd.ext[2]) < 1e-3,
    `both blades are the same length (${bl.ext[2].toFixed(3)} / ${bd.ext[2].toFixed(3)})`);
}

/* 4 — the origin is AT THE GRIP, not at the blade's middle. Read from the .py's own CHECK line,
 * which measures the mesh rather than restating the constant — a check that reads the number it
 * is checking against is the tautology this repo has already shipped twice. */
for (const l of lines.filter(x => x.startsWith('CHECK '))) {
  const m = l.match(/^CHECK (\S+) origin_z=(-?[\d.]+) length=([\d.]+)/);
  if (!m) continue;
  const [, nm, oz, len] = m;
  say(Math.abs(+oz) <= +len * 0.02,
    `${nm} pivots at the grip (base is ${(+oz).toFixed(4)} from the origin, i.e. the hand)`);
}

if (failed) {
  console.error('\n✗ blade.glb did not meet the contract — see above.');
  process.exit(1);
}
console.log('\n✓ models/blade.glb meets the contract.');

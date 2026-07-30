#!/usr/bin/env node
/* upperdeckripmaster3030 — build a level: Blender → OBJ → baked .wld the game loads.
 *
 *   npm run level -- arcade            # build + bake into models/world/arcade.wld
 *   npm run level -- rooftop --seed 7  # same level script, different scatter
 *   npm run level -- all               # all three
 *
 * Two stages, both already existing pieces:
 *   1. scripts/blender/build-level.py authors the geometry in Blender and writes OBJ (Y-up)
 *   2. scripts/bake-world.mjs decimates it, rescales to world units, and emits the binary
 *      .wld (interleaved pos3+norm3) plus the .cols.json AABB set the collider uses
 *
 * ⚑ Bakes with `--minTris 0`. bake-world's default drops objects under 40 triangles as
 *   clutter, which is correct for a scanned city and catastrophic here: a crate is 12
 *   triangles and a railing post is 8, so the default would silently delete most of a level
 *   and leave you wondering why you fall through the mezzanine.
 *
 * ⚑ Bakes with `--scale <footprint>`, the level's own size in metres, so one world unit stays
 *   one metre. Author at human scale and the jump heights in js/ronin-world.js keep meaning
 *   what they mean.
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'models', 'world');
const TMP = join(ROOT, 'build', 'levels');

// must match FOOTPRINT in scripts/blender/build-level.py
const FOOTPRINT = { arcade: 60, vault: 52, rooftop: 78 };
const GRID = { arcade: 0.05, vault: 0.05, rooftop: 0.05 };

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const names = argv.filter(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--seed');
const seed = flag('seed', '3030');

const want = (!names.length || names[0] === 'all') ? Object.keys(FOOTPRINT) : names;
const bad = want.filter(n => !FOOTPRINT[n]);
if (bad.length) {
  console.error(`unknown level(s): ${bad.join(', ')} — have: ${Object.keys(FOOTPRINT).join(', ')}`);
  process.exit(1);
}

let blender = 'blender';
try { execFileSync(blender, ['--version'], { stdio: 'ignore' }); }
catch (e) {
  console.error('blender not found on PATH.\n' +
    '  Ubuntu/Debian: sudo apt-get install blender\n' +
    '  or download from https://www.blender.org/download/ and put it on PATH');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

for (const name of want) {
  const obj = join(TMP, `${name}.obj`);
  const wld = join(OUT, `${name}.wld`);
  console.log(`\n═══ ${name} ═══`);

  const out = execFileSync(blender, ['--background', '--factory-startup', '-noaudio',
    '-P', join(ROOT, 'scripts', 'blender', 'build-level.py'), '--', name, obj, seed],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  const line = out.split('\n').find(l => l.startsWith('EXPORTED'));
  if (!line) {
    console.error(out.split('\n').filter(l => /EXPORT_FAIL|Error|Traceback/.test(l)).join('\n'));
    throw new Error(`blender did not export ${name}`);
  }
  console.log(line);

  execFileSync(process.execPath, [join(ROOT, 'scripts', 'bake-world.mjs'), obj, wld,
    '--minTris', '0', '--scale', String(FOOTPRINT[name]), '--grid', String(GRID[name] || 0.05)],
    { stdio: 'inherit' });
  if (!existsSync(wld)) throw new Error(`bake produced no ${wld}`);
  console.log(`→ ${wld} (${(statSync(wld).size / 1024).toFixed(0)} KB)`);
}

console.log('\nPlay a level:  localStorage.setItem("urm_world","1"); localStorage.setItem("urm_level","%s")'
  .replace('%s', want[0]));

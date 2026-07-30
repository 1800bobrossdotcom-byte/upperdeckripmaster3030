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
import { existsSync, mkdirSync, statSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'models', 'world');
const TMP = join(ROOT, 'build', 'levels');

// must match FOOTPRINT in scripts/blender/build-level.py
const FOOTPRINT = { arcade: 120, vault: 105, rooftop: 165 };
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
  checkSpawns(name, JSON.parse(readFileSync(wld.replace(/\.wld$/, '') + '.cols.json', 'utf8')));
}

/* Validate authored spawns against the baked collision set.
 *
 * RoninWorld.findSpawn() will spiral a buried spawn out to open floor, so nothing here is fatal
 * at runtime — which is exactly why it needs saying at BUILD time. Section 9 shipped DUST BOWL
 * with 7 of 10 spawns silently relocated and it read as a broken map; the rule that came out of
 * that is a relocated spawn is a safety net, not a design. So: report, loudly, and fix the level.
 *
 * Two checks, matching what the runtime actually does:
 *   INSIDE   the spawn box overlaps a collision AABB → you start embedded in geometry
 *   FLOATING nothing solid within a step below → you start falling, or fall forever
 */
function checkSpawns(name, cols) {
  const sp = cols.spawns || [], boxes = cols.boxes || [];
  if (!sp.length) { console.log(`  ⚠ ${name}: no authored spawns — runtime will fall back to a search`); return; }
  const R = 0.55, HGT = 2.1, STEP = 0.9;                                   // must track MOVE in js/ronin-world.js
  let bad = 0;
  for (const s of sp) {
    // A box you can step onto is floor, not an obstacle — the runtime steps up to MOVE.stepUp,
    // so a 6 cm inlaid floor strip must not read as "spawned inside geometry". Only count boxes
    // whose top is above stepping height.
    const inside = boxes.find(b =>
      s.x + R > b.lo[0] && s.x - R < b.hi[0] &&
      s.z + R > b.lo[2] && s.z - R < b.hi[2] &&
      b.hi[1] > s.y + STEP &&
      s.y + HGT > b.lo[1] + 0.02 && s.y < b.hi[1] - 0.02);
    const floor = boxes.some(b =>
      s.x + R > b.lo[0] && s.x - R < b.hi[0] &&
      s.z + R > b.lo[2] && s.z - R < b.hi[2] &&
      b.hi[1] <= s.y + STEP && b.hi[1] > s.y - STEP);
    if (inside) { console.log(`  ✗ ${name}/${s.name}: INSIDE "${inside.name}"`); bad++; }
    else if (!floor && s.y > 0.05) { console.log(`  ✗ ${name}/${s.name}: FLOATING (no surface under y=${s.y})`); bad++; }
  }
  console.log(bad ? `  ⚠ ${name}: ${bad}/${sp.length} spawns need re-authoring`
                  : `  ✓ ${name}: ${sp.length}/${sp.length} spawns clear`);
}

console.log('\nPlay a level:  localStorage.setItem("urm_world","1"); localStorage.setItem("urm_level","%s")'
  .replace('%s', want[0]));

#!/usr/bin/env node
/* upperdeckripmaster3030 — build DOGFIGHT's authored geometry:
 *   Blender → models/dogfight.glb   (the craft, the gate, the five prop silhouettes)
 *   Blender → models/city.glb       (the city kit: blocks, LOD twins, caps, sign, landmarks)
 *
 *   npm run craft
 *   npm run craft -- --out build/   # somewhere else, to diff against the shipped pair
 *
 * ONE COMMAND FOR BOTH, on purpose. The two files are one asset in every sense that matters: they
 * are loaded by the same game, from the same scene, on the same frame, and a city built against
 * yesterday's kit table is exactly as broken as a craft with no trim. Two commands is one command
 * somebody forgets.
 *
 * One stage, unlike `npm run level`: a level goes Blender → OBJ → bake-world → .wld because the
 * collider needs AABBs and the renderer needs a decimated soup. A model needs neither. GLB is
 * already the format js/ronin-glb.js reads, so Blender writes the shipping files directly.
 *
 * What this adds over running blender by hand is the CHECKS at the end, and they exist because
 * every failure mode here is silent. Both renderers key on part NAMES — a GLB missing `craft`
 * falls back to the procedural ship, a GLB missing `prop_tower` draws chrome city with no
 * scenery, a GLB missing `blk_rib_lo` draws the city's far chunks at full detail. Nothing throws,
 * nothing logs, and all of it looks like "the update didn't ship".
 *
 * ⚑ AND ONE CHECK IS A MEASUREMENT RATHER THAN A NAME. `hero_gantry` is a portal you fly an
 *   AVENUE through, so its opening has to be wider than the avenue — a relationship between a
 *   Blender script and a JS layout constant that nothing else connects. CLAUDE.md's own lesson
 *   from the fighter bake commands applies exactly: a number that lives in prose is a number that
 *   gets lost. Assert it, don't write it down.
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Must match the object names in the .py AND the lookups in the JS.
 *   dogfight.glb  → js/dogfight-gl.js + js/dfpc-app.js. The five prop_* are WORLDS[].prop.
 *   city.glb      → js/dfpc-app.js loadCity() + js/dfpc-city.js KITS. Every blk_* needs its _lo
 *                   twin or that shape has no far LOD; every KITS[].cap needs its cap_*. */
const BUILDS = [
  { py: 'build-craft.py', out: 'models/dogfight.glb',
    required: ['craft', 'trim', 'pod', 'gate',
      'prop_pylon', 'prop_ring', 'prop_spire', 'prop_tower', 'prop_crystal'] },
  { py: 'build-city.py', out: 'models/city.glb',
    required: ['blk_slab', 'blk_rib', 'blk_twin', 'blk_pod', 'blk_step',
      'blk_slab_lo', 'blk_rib_lo', 'blk_twin_lo', 'blk_pod_lo', 'blk_step_lo',
      'cap_plant', 'cap_deck', 'sign_crown',
      'hero_gantry', 'hero_stack', 'hero_mast'] },
];

/* The avenue the gantry stands over. Mirrors js/dfpc-city.js: cell pitch P minus the street
 * clearance SW on each side minus the avenue setback AW on each side → 10 − 2×1.8 + 2×1.8 = 7.2.
 * ⚠ If those constants move in the JS, THIS number moves with them or the assertion is theatre. */
const AVENUE_W = 7.2;

const argv = process.argv.slice(2);
const outDir = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : null; })();

try { execFileSync('blender', ['--version'], { stdio: 'ignore' }); }
catch (e) {
  console.error('blender not found on PATH.\n' +
    '  Ubuntu/Debian: sudo apt-get install blender\n' +
    '  or download from https://www.blender.org/download/ and put it on PATH');
  process.exit(1);
}

let failed = false;
for (const B of BUILDS) {
  const out = outDir ? resolve(ROOT, outDir, B.out.split('/').pop()) : resolve(ROOT, B.out);
  mkdirSync(dirname(out), { recursive: true });

  const log = execFileSync('blender', ['--background', '--factory-startup', '-noaudio',
    '-P', join(ROOT, 'scripts', 'blender', B.py), '--', out],
    { encoding: 'utf8', maxBuffer: 1 << 26 });

  const lines = log.split('\n');
  const done = lines.find(l => l.startsWith('EXPORTED'));
  if (!done) {
    console.error(lines.filter(l => /EXPORT_FAIL|Error|Traceback|line \d+/.test(l)).join('\n'));
    throw new Error(`blender did not export ${B.out}`);
  }
  console.log('\n' + done);
  const parts = lines.filter(l => l.startsWith('  PART'));
  for (const l of parts) console.log(l);
  if (!existsSync(out)) throw new Error(`no file at ${out}`);
  console.log(`→ ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);

  const got = new Map();
  for (const l of parts) {
    const f = l.trim().split(/\s+/);            // PART <name> <tris> tris extent A × B × C
    got.set(f[1], { tris: +f[2], ext: [+f[5], +f[7], +f[9]] });
  }
  const missing = B.required.filter(n => !got.has(n));
  if (missing.length) {
    console.error(`\n✗ ${B.out} is missing part(s) the renderer looks up by name: ${missing.join(', ')}`);
    console.error('  The renderers fail open, so this would ship as silently-missing geometry.');
    failed = true;
  } else {
    console.log(`✓ all ${B.required.length} named parts present`);
  }

  /* the measured check: the gantry is fitted UNIFORMLY BY HEIGHT (js/dfpc-app.js CITY_FIT.hero),
   * so at its 7.0-unit target height its span is 7.0 × (extentX / extentZ_up). Blender is Z-up
   * here, so the printed extent is (x, y, HEIGHT). */
  const gan = got.get('hero_gantry');
  if (gan) {
    const span = gan.ext[0] / gan.ext[2] * 7.0;
    const ok = span > AVENUE_W + 1.0;
    console.log(`  hero_gantry spans ${span.toFixed(2)} at its 7.0 target height ` +
      `(avenue is ${AVENUE_W}) ${ok ? '✓' : '✗'}`);
    if (!ok) {
      console.error('✗ the gantry is narrower than the avenue it straddles — you would fly into a leg.');
      failed = true;
    }
  }
  const lowPoly = [...got].filter(([n, v]) => n.endsWith('_lo') && v.tris > (got.get(n.slice(0, -3)) || { tris: 0 }).tris * 0.6);
  if (lowPoly.length) {
    console.error(`✗ LOD1 part(s) are not cheaper than their LOD0: ${lowPoly.map(p => p[0]).join(', ')}`);
    failed = true;
  }
}
if (failed) process.exit(1);

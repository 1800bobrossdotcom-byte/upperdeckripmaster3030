#!/usr/bin/env node
/* upperdeckripmaster3030 — build DOGFIGHT's authored geometry: Blender → models/dogfight.glb.
 *
 *   npm run craft
 *   npm run craft -- build/dogfight.glb        # somewhere else, to diff against the shipped one
 *
 * One stage, unlike `npm run level`: a level goes Blender → OBJ → bake-world → .wld because the
 * collider needs AABBs and the renderer needs a decimated soup. A model needs neither. GLB is
 * already the format js/ronin-glb.js reads, so Blender writes the shipping file directly.
 *
 * What this adds over running blender by hand is the check at the end. dogfight-gl keys on part
 * NAMES — a GLB missing `craft` silently falls back to the procedural ship, and a GLB missing
 * `prop_tower` silently draws chrome city with no scenery. Neither throws, neither logs, and
 * both look like "the update didn't ship". So the names are asserted here, at build time, where
 * a missing one is a red line instead of an absence.
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Must match the object names in scripts/blender/build-craft.py AND the lookups in
 * js/dogfight-gl.js. The five prop_* names are WORLDS[].prop in dogfight.html. */
const REQUIRED = ['craft', 'pod', 'gate',
  'prop_pylon', 'prop_ring', 'prop_spire', 'prop_tower', 'prop_crystal'];

const argv = process.argv.slice(2);
const out = resolve(ROOT, argv.find(a => !a.startsWith('--')) || 'models/dogfight.glb');

try { execFileSync('blender', ['--version'], { stdio: 'ignore' }); }
catch (e) {
  console.error('blender not found on PATH.\n' +
    '  Ubuntu/Debian: sudo apt-get install blender\n' +
    '  or download from https://www.blender.org/download/ and put it on PATH');
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });

const log = execFileSync('blender', ['--background', '--factory-startup', '-noaudio',
  '-P', join(ROOT, 'scripts', 'blender', 'build-craft.py'), '--', out],
  { encoding: 'utf8', maxBuffer: 1 << 26 });

const lines = log.split('\n');
const done = lines.find(l => l.startsWith('EXPORTED'));
if (!done) {
  console.error(lines.filter(l => /EXPORT_FAIL|Error|Traceback|line \d+/.test(l)).join('\n'));
  throw new Error('blender did not export the craft');
}
console.log(done);
for (const l of lines.filter(l => l.startsWith('  PART'))) console.log(l);

if (!existsSync(out)) throw new Error(`no file at ${out}`);
console.log(`→ ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);

const got = new Set(lines.filter(l => l.startsWith('  PART')).map(l => l.trim().split(/\s+/)[1]));
const missing = REQUIRED.filter(n => !got.has(n));
if (missing.length) {
  console.error(`\n✗ GLB is missing part(s) dogfight-gl looks up by name: ${missing.join(', ')}`);
  console.error('  The renderer fails open, so this would ship as silently-missing geometry.');
  process.exit(1);
}
console.log(`✓ all ${REQUIRED.length} named parts present`);

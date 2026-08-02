/* The five field prizes must EXIST, be REACHABLE, and stay in step with the verbs. `node scripts/test-pickups.mjs`
 *
 * ⚑ THIS DELIBERATELY DOES NOT RE-MEASURE SILHOUETTE IoU. That measurement lives in
 *   scripts/blender/build-pickups.py and it is a BUILD GATE, not a test: the script rasterises
 *   every prize from 12 bearings at three ranges and REFUSES TO WRITE models/pickups.glb if any
 *   pair is too alike. A gate that runs at authoring time cannot be skipped and cannot ship a
 *   failure; re-implementing the same rasteriser in JS would be a second copy of one fact, which
 *   is exactly what ROADMAP §5.4 says will diverge. Run `npm run pickups` to see those numbers.
 *
 * What this file asserts is the half a build gate cannot see — the contract BETWEEN files:
 *
 *   ⛔ THE PART NAME IS THE MOB KEY. js/s9pc-app.js looks a prize up as `'pu_' + pw.type`, with no
 *      translation table anywhere. That is only safe while every entry in S9Game's MOBS table has
 *      a part of that name in the GLB. Add a sixth verb and forget the geometry and the loader
 *      silently draws nothing — which is ROADMAP §5.3's "built ≠ reachable" wearing its most
 *      convincing disguise, because everything still runs.
 *   ⛔ FAIL OPEN. A 404 on the GLB must leave the match playable.
 *   ⛔ THE BUDGET is stated in the .py file and has to survive the .glb being regenerated.
 */
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}` + (detail ? `  — ${detail}` : '')); }
  else { fail++; console.log(`  FAIL ${name}` + (detail ? `  — ${detail}` : '')); }
};

const GLB = join(ROOT, 'models/pickups.glb');
let json = null, bytes = 0;
try {
  const buf = readFileSync(GLB);
  bytes = buf.length;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('bad magic');
  let o = 12;
  while (o + 8 <= buf.byteLength) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buf.subarray(o + 8, o + 8 + len)));
    o += 8 + len;
  }
} catch (e) { t('models/pickups.glb parses as a GLB', false, e.message); }
t('models/pickups.glb parses as a GLB', !!json, bytes + ' bytes');
if (!json) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }

const nodes = {};
for (const n of json.nodes || []) if (n.mesh !== undefined) nodes[n.name] = json.meshes[n.mesh];

/* ⚑ THE VERB LIST IS READ OUT OF THE GAME, NOT COPIED. A hard-coded array here would be the third
 * copy of the same five strings and would pass forever after a rename. */
const gameSrc = readFileSync(join(ROOT, 'js/s9pc-game.js'), 'utf8');
const mobBlock = /const MOBS = \{([\s\S]*?)\n    \};/.exec(gameSrc);
t('js/s9pc-game.js still declares a MOBS table', !!mobBlock);
const KEYS = [...(mobBlock ? mobBlock[1] : '').matchAll(/^\s{6}(\w+):\s*\{/gm)].map(m => m[1]);
t('the MOBS table names at least five mobility verbs', KEYS.length >= 5, KEYS.join(' · '));

for (const k of KEYS) {
  t(`MOBS.${k} has a part called pu_${k} in the GLB`, !!nodes['pu_' + k],
    Object.keys(nodes).join(','));
}
t('the shared issue bay pu_base is in the GLB', !!nodes.pu_base);

/* No stray parts either: a part with no verb is dead weight fetched by every player. */
const extra = Object.keys(nodes).filter(n => n !== 'pu_base' && !KEYS.includes(n.replace(/^pu_/, '')));
t('no part in the GLB is missing its verb', extra.length === 0, extra.join(',') || 'none');

// ── budget, as stated in the build script (read from it, so the two cannot drift) ──────────────
const py = readFileSync(join(ROOT, 'scripts/blender/build-pickups.py'), 'utf8');
const num = re => { const m = re.exec(py); return m ? eval(m[1]) : NaN; };   // eslint-disable-line
const TRIS_PER_PART = num(/^TRIS_PER_PART = (\d+)/m);
const TRIS_TOTAL = num(/^TRIS_TOTAL = (\d+)/m);
const BYTES_MAX = num(/^BYTES_MAX = ([\d *]+)/m);
t('the build script states a per-part, total and byte budget',
  TRIS_PER_PART > 0 && TRIS_TOTAL > 0 && BYTES_MAX > 0,
  `${TRIS_PER_PART} / ${TRIS_TOTAL} tris · ${BYTES_MAX} bytes`);

let total = 0, worst = 0, worstName = '';
for (const [name, mesh] of Object.entries(nodes)) {
  let n = 0;
  for (const prim of mesh.primitives || []) {
    n += (prim.indices !== undefined ? json.accessors[prim.indices].count
      : json.accessors[prim.attributes.POSITION].count) / 3;
  }
  total += n;
  if (n > worst) { worst = n; worstName = name; }
}
t('every part is inside the per-part triangle budget', worst <= TRIS_PER_PART,
  `worst ${worstName} ${worst}/${TRIS_PER_PART}`);
t('the whole set is inside the triangle budget', total <= TRIS_TOTAL, `${total}/${TRIS_TOTAL}`);
t('the file is inside the byte budget', bytes <= BYTES_MAX, `${bytes}/${BYTES_MAX}`);
/* Context, not a gate: models/weapons/s9-guns.glb is the comparable file already shipping. */
try {
  const g = statSync(join(ROOT, 'models/weapons/s9-guns.glb')).size;
  console.log(`       (for scale: models/weapons/s9-guns.glb is ${g} bytes for four weapons)`);
} catch (e) { /* optional */ }

// ── the loader: reachable, derived, and fail-open ──────────────────────────────────────────────
const appSrc = readFileSync(join(ROOT, 'js/s9pc-app.js'), 'utf8');
t('js/s9pc-app.js loads models/pickups.glb', /['"]models\/pickups\.glb['"]/.test(appSrc));
t('the prize is looked up by BUILDING the part name from the drop type, not from a table',
  /['"]pu_['"]\s*\+\s*(?:pw\.)?type|['"]pu_['"] \+ type/.test(appSrc), "'pu_' + type");
t('the loader is called at startup (built ≠ reachable)', /^\s*loadPickups\(\);/m.test(appSrc));
t('the loader is driven every frame from the play branch', /syncPickups\(G,/.test(appSrc));
t('entities are cleared when a new match starts', /puClear\(\);/.test(appSrc));
/* ⚠ FAIL OPEN, asserted rather than remembered: a failed fetch must leave puAsset null, and every
 * entry point must return early on a null asset, so a 404 costs the geometry and nothing else. */
t('a failed fetch leaves the asset null instead of throwing',
  /loadFromUrl\(PU_URL[\s\S]{0,220}?if \(err\)[\s\S]{0,80}?return res\(null\)/.test(appSrc));
t('the per-frame sync returns early when there is no asset',
  /function syncPickups\([^)]*\)\s*\{\s*\n\s*if \(!puAsset\) return;/.test(appSrc));
t('a missing part does not leave a half-built entity',
  /if \(!prize\) \{[\s\S]{0,90}?return null;/.test(appSrc));
t('?pu=0 opts out entirely and ?pu=demo makes the set reachable without the drop table',
  /Q\.get\('pu'\) !== '0'/.test(appSrc) && /Q\.get\('pu'\) === 'demo'/.test(appSrc));

/* ⛔ THE MOTION IS THE HALF THAT GETS SKIPPED (DESIGN-SYSTEM §9). The old billboard bobbed on
 * `sin(t*3)` and pulsed on `sin(t*4)`; §4 rules that out by name. Assert the replacement is not
 * the same thing in a new place: no branch of puStep may read absolute time. */
const stepBlock = /function puStep\(([\s\S]*?)\n  \}\n/.exec(appSrc);
t('js/s9pc-app.js declares puStep', !!stepBlock);
const step = stepBlock ? stepBlock[1] : '';
const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
t('no idle motion is a function of absolute time (no G.t / performance.now in puStep)',
  !/\bG\.t\b|performance\.now|Date\.now/.test(decomment(step)));
for (const k of KEYS) {
  t(`${k} has its own motion branch — its verb, performed on itself`,
    new RegExp(`type === '${k}'`).test(step));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

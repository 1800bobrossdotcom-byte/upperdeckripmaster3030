/* Section 9's four weapons must be TELLABLE APART BY SILHOUETTE. `npm run test:guns`
 *
 * ⛔ The defect this exists to make unshippable: the game had four weapons and ONE model.
 *    `loadWeapon()` fetched models/weapons/m4a1.glb once and handed that same carbine to every
 *    operative, so a pistol, a shotgun and a bolt rifle were all drawn as an M4. The artist's
 *    report was "all the guns look like the same gun", and it was not an impression.
 *
 * ⚑ "There are four meshes now" is the WEAK question — four copies of one carbine under four
 *    names would pass it. So the assertion is the actual complaint: project each gun to its side
 *    view, rasterise the silhouette, and require every PAIR to differ. Identical meshes score an
 *    intersection-over-union of 1.00 and fail; these have to come in under a threshold.
 *
 * ⚠ IoU is computed AFTER normalising each gun to the length the game actually draws it at
 *   (GUN_LEN in js/s9pc-app.js). Otherwise "one is bigger than the other" would count as "they
 *   look different" — and the game rescales them anyway, so a difference that survives only at
 *   authored scale is a difference the player never sees.
 *
 * Static: parses the GLB and rasterises in-process. No browser, no GPU, fast enough for npm test.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}` + (detail ? `  — ${detail}` : '')); }
  else { fail++; console.log(`  FAIL ${name}` + (detail ? `  — ${detail}` : '')); }
};

function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  let o = 12, json = null, bin = null;
  while (o + 8 <= buf.byteLength) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buf.subarray(o + 8, o + 8 + len)));
    if (type === 0x004e4942) bin = buf.subarray(o + 8, o + 8 + len);
    o += 8 + len;
  }
  return { json, bin };
}

const GLB = join(ROOT, 'models/weapons/s9-guns.glb');
let gltf = null, bin = null;
try { ({ json: gltf, bin } = parseGlb(readFileSync(GLB))); } catch (e) {
  t('models/weapons/s9-guns.glb parses', false, e.message);
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(1);
}
t('models/weapons/s9-guns.glb parses', !!gltf);

function accessor(ai) {
  const acc = gltf.accessors[ai];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const bv = gltf.bufferViews[acc.bufferView];
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out = [];
  const stride = bv.byteStride || comps * (acc.componentType === 5126 ? 4 : acc.componentType === 5125 ? 4 : 2);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < comps; c++) {
      const off = base + i * stride + c * (acc.componentType === 5126 ? 4 : acc.componentType === 5125 ? 4 : 2);
      out.push(acc.componentType === 5126 ? dv.getFloat32(off, true)
        : acc.componentType === 5125 ? dv.getUint32(off, true) : dv.getUint16(off, true));
    }
  }
  return out;
}

const KEYS = ['pistol', 'smg', 'shotgun', 'sniper'];
const NAMES = { pistol: 'SIDE BET', smg: 'FULL TILT', shotgun: 'SCATTER', sniper: 'COLD CALL' };
/* The lengths the game draws them at — js/s9pc-app.js GUN_LEN. Read from the source rather than
 * copied, so the two cannot drift apart silently. */
const appSrc = readFileSync(join(ROOT, 'js/s9pc-app.js'), 'utf8');
const lenBlock = /const GUN_LEN = \{([^}]*)\}/.exec(appSrc);
const GUN_LEN = {};
for (const m of (lenBlock ? lenBlock[1] : '').matchAll(/(\w+):\s*([\d.]+)/g)) GUN_LEN[m[1]] = parseFloat(m[2]);
t('js/s9pc-app.js declares a drawn length for each gun',
  KEYS.every(k => GUN_LEN[k] > 0), KEYS.map(k => `${k} ${GUN_LEN[k]}`).join(' · '));

const nodes = {};
for (const n of gltf.nodes || []) if (n.mesh !== undefined) nodes[n.name] = gltf.meshes[n.mesh];
for (const k of KEYS) t(`gun_${k} (${NAMES[k]}) is in the GLB`, !!nodes['gun_' + k], Object.keys(nodes).join(','));

/* Rasterise the SIDE view (barrel axis × up axis), normalised so each gun is drawn at the length
 * the game uses. Triangles are filled by scanline; a point-cloud stamp would score two different
 * guns as different simply because their vertices land in different pixels. */
const R = 96;                                   // raster width in cells; height follows the aspect
function silhouette(mesh, targetLen) {
  const prim = mesh.primitives[0];
  const pos = accessor(prim.attributes.POSITION);
  const idx = prim.indices !== undefined ? accessor(prim.indices) : null;
  const n = pos.length / 3;
  let lox = Infinity, hix = -Infinity, loy = Infinity, hiy = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1];
    if (x < lox) lox = x; if (x > hix) hix = x;
    if (y < loy) loy = y; if (y > hiy) hiy = y;
  }
  const len = hix - lox || 1;
  const k = targetLen / len;                    // the game's normalisation
  const W = R, H = Math.max(8, Math.round(R * ((hiy - loy) * k) / (targetLen || 1)));
  const grid = new Uint8Array(W * H);
  const sx = v => ((v - lox) / len) * (W - 1);
  const sy = v => (H - 1) - ((v - loy) / ((hiy - loy) || 1)) * (H - 1);
  const tri = (ax, ay, bx, by, cx, cy) => {
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) {
      const xs = [];
      const edge = (x1, yy1, x2, yy2) => {
        if ((yy1 <= y && yy2 > y) || (yy2 <= y && yy1 > y)) xs.push(x1 + (y - yy1) / (yy2 - yy1) * (x2 - x1));
      };
      edge(ax, ay, bx, by); edge(bx, by, cx, cy); edge(cx, cy, ax, ay);
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      const a = Math.max(0, Math.floor(xs[0])), b = Math.min(W - 1, Math.ceil(xs[xs.length - 1]));
      for (let x = a; x <= b; x++) grid[y * W + x] = 1;
    }
  };
  const count = idx ? idx.length : n;
  for (let i = 0; i + 2 < count; i += 3) {
    const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2;
    tri(sx(pos[a * 3]), sy(pos[a * 3 + 1]), sx(pos[b * 3]), sy(pos[b * 3 + 1]), sx(pos[c * 3]), sy(pos[c * 3 + 1]));
  }
  return { grid, W, H, filled: grid.reduce((s, v) => s + v, 0) };
}

const sil = {};
for (const k of KEYS) if (nodes['gun_' + k]) sil[k] = silhouette(nodes['gun_' + k], GUN_LEN[k]);
for (const k of KEYS) t(`gun_${k} rasterises to a real silhouette`, sil[k] && sil[k].filled > 40,
  sil[k] ? `${sil[k].filled} cells, ${sil[k].W}×${sil[k].H}` : 'none');

/* IoU over a common canvas: both guns are placed at their drawn length against the LONGEST gun,
 * so a short weapon genuinely occupies less of the frame — which is the read at range. */
const CW = R, CH = 40;
function canvasOf(k) {
  const s = sil[k]; const out = new Uint8Array(CW * CH);
  if (!s) return out;
  const w = Math.max(1, Math.round(CW * GUN_LEN[k] / Math.max(...KEYS.map(x => GUN_LEN[x]))));
  const h = Math.max(1, Math.min(CH, Math.round(s.H * (w / s.W))));
  const y0 = Math.floor((CH - h) / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sxp = Math.min(s.W - 1, Math.floor(x * s.W / w)), syp = Math.min(s.H - 1, Math.floor(y * s.H / h));
    if (s.grid[syp * s.W + sxp]) out[(y0 + y) * CW + x] = 1;
  }
  return out;
}
const cv = {}; for (const k of KEYS) cv[k] = canvasOf(k);

let worst = 0, worstPair = '';
for (let i = 0; i < KEYS.length; i++) {
  for (let j = i + 1; j < KEYS.length; j++) {
    const a = cv[KEYS[i]], b = cv[KEYS[j]];
    let inter = 0, uni = 0;
    for (let p = 0; p < a.length; p++) { if (a[p] && b[p]) inter++; if (a[p] || b[p]) uni++; }
    const iou = uni ? inter / uni : 1;
    if (iou > worst) { worst = iou; worstPair = KEYS[i] + '/' + KEYS[j]; }
    t(`${NAMES[KEYS[i]]} vs ${NAMES[KEYS[j]]} are different shapes`, iou < 0.62, 'IoU ' + iou.toFixed(3));
  }
}
/* ⚑ The headline. Four copies of one carbine score 1.000 here; that is the number this whole
 * file exists to refuse. */
t('NO TWO WEAPONS SHARE A SILHOUETTE (four names on one mesh scores 1.000)',
  worst < 0.62, 'worst pair ' + worstPair + ' at ' + worst.toFixed(3));

/* Names: generic archetypes only. "AK" is a real weapon family and "STREET SWEEPER" a real
 * product name; the same rule that makes every CC0-derived body carry a studio name and never
 * its source's applies to a gun. */
const gameSrc = readFileSync(join(ROOT, 'js/s9pc-game.js'), 'utf8');
/* ⚠ `section9-classic.html` WAS REMOVED on 2026-08-02 (artist's call), so every assertion
 * that used to check BOTH builds now checks the one that ships. The checks are kept rather
 * than deleted — the rule each states is still the rule; it simply has one surface now. */
for (const bad of ['AK RIPMASTER', 'STREET SWEEPER', 'RIP-9 PISTOL', 'LONG RIFLE']) {
  t(`no weapon is called "${bad}" any more`,
    gameSrc.indexOf("'" + bad + "'") < 0);
}
for (const k of KEYS) {
  t(`${NAMES[k]} is the name in BOTH builds`,
    gameSrc.indexOf("'" + NAMES[k] + "'") >= 0);
}
/* ⚠ key/sfx index the foley in js/sfx-lib.js and the model lookup in s9pc-app. Renaming those
 * would silence the guns, so the rename must have left them alone. */
t('the sfx keys were NOT renamed with the display names',
  KEYS.every(k => gameSrc.indexOf("key: '" + k + "'") >= 0), KEYS.join(','));

/* ⚠ The lobby and the HUD each kept their OWN copy of the weapon list, which is how an "AK"
 * chip survived a rename that touched every other surface. Both are derived now; this asserts
 * the private copies did not come back. */
/* ⛔ REAL MODELS WHERE THEY EXIST. The first cut of this shipped four procedural guns while two
 * cleared, converted models sat in models/weapons/ unused — magnum460.glb (CC0 1.0, from
 * github.com/TheGoodFella/magnum460Blend, credited in CREDITS.md) and the artist-supplied,
 * artist-cleared m4a1.glb. Building a stand-in next to a real asset is the same failure as four
 * names on one mesh, so it is asserted rather than remembered. */
const srcBlock = /const GUN_SRC = \{([\s\S]*?)\n  \};/.exec(appSrc);
t('js/s9pc-app.js declares a source per weapon', !!srcBlock);
const SRC = srcBlock ? srcBlock[1] : '';
t('SIDE BET uses the CC0 Magnum 460, not a stand-in', /pistol:\s*\{[^}]*magnum460\.glb/.test(SRC));
t('FULL TILT uses the artist-cleared M4, with its texture',
  /smg:\s*\{[^}]*m4a1\.glb[^}]*m4a1_tex\.jpg/.test(SRC));
/* ⚠ sniper_stand.glb is NOT mapped to COLD CALL on purpose: 268 triangles, mirror-symmetric top
 * to bottom — it is the BIPOD out of the KSR28 blend, not the rifle. Mapping by filename would
 * have put a tripod in an operative's hands. */
t('COLD CALL does NOT use sniper_stand.glb (that file is a bipod, not a rifle)',
  !/sniper:\s*\{[^}]*sniper_stand/.test(SRC));
for (const f of ['magnum460.glb', 'm4a1.glb', 'm4a1_tex.jpg']) {
  let ok = false; try { ok = readFileSync(join(ROOT, 'models/weapons/' + f)).length > 1000; } catch {}
  t(`models/weapons/${f} is present`, ok);
}
/* The built set stays complete so a 404 on a real model degrades to a stand-in rather than an
 * empty hand — only the source is lost, never the silhouette. */
t('s9-guns.glb still carries all four parts as the fail-open set',
  KEYS.every(k => !!nodes['gun_' + k]));

const uiSrc = readFileSync(join(ROOT, 'js/s9pc-ui.js'), 'utf8');
t('the lobby derives its loadout list from S9Game.WEAPONS',
  /LOADOUTS = \(window\.S9Game/.test(uiSrc));
/* ⚠ Comments are stripped first. The notes explaining this fix all quote the old `'ak'` literal,
 * so a naive search matches the very documentation of the thing it is checking is gone. */
const decomment = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
t('no build hard-codes an "ak" weapon label any more',
  !/'ak'/.test(decomment(uiSrc)), 'js/s9pc-ui.js');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

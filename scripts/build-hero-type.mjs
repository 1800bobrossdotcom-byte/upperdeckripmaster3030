#!/usr/bin/env node
/* ripmaster3030studios — build the hero wordmark's foil type.   npm run herotype
 *
 * Drives scripts/blender/build-hero-type.py, then MEASURES what came back and what the browser
 * does with it. Following scripts/build-bg.mjs: the point of this file is that it ASSERTS rather
 * than eyeballs, because every one of the things that can be wrong here is invisible in a
 * thumbnail and obvious on the live site.
 *
 * ⛔ V1 OF THIS WORDMARK SHIPPED AND WAS REJECTED — "basic bitch geometry and fx" — and the tests
 *   below all passed on it. That is the useful fact about this file: a green run proved the
 *   pipeline worked and said nothing about whether the thing was any good. So v2 adds the
 *   assertions that would have FAILED on v1:
 *     · THE HUE MUST MOVE WITH THE VIEW (stage 6). Foil's whole character is that tilting it
 *       walks the colour. V1 baked the CSS gradient on as flat paint, so its hue was identical
 *       at every view angle — and nothing here noticed. The check now drives the type across a
 *       fan of yaws, reads the LIVE canvas, and measures the accumulated hue travel per patch.
 *     · THE GRAIN MUST BE IN THE NORMAL MAP (stage 4). The anisotropic highlight reads its
 *       direction out of that map; a map that bakes isotropic has no grain to read, and the
 *       highlight comes out running the wrong way. This shipped isotropic twice.
 *     · THE EDGE MUST BE A DIE, NOT A FILLET (stage 3). A quarter-circle bevel and a hand-authored
 *       die produce the same triangle count and the same silhouette at a glance.
 *
 * The older failures it already guarded, all still live:
 *   1. THE GLB LOSES A NAMED PART. js/hero3d.js looks up its three parts and fails OPEN, so a
 *      rename ships as a wordmark that quietly went back to being CSS. Nothing throws, nothing
 *      logs, and it looks exactly like "the update didn't deploy".
 *   2. THE WALLS PICK UP UVs. The face/bevel/rim split exists because a planar UV is degenerate
 *      on the extrusion walls; if a future export starts writing TEXCOORD_0 on `wm_rim` the
 *      design's premise has silently changed, so it is asserted, not assumed.
 *   3. THE FOIL STOPS BEING THE SITE'S PALETTE. Both the baked ink and the diffraction LUT
 *      reproduce the CSS wordmark's own six stops; a shader edit that flattens or reorders them
 *      still produces a perfectly plausible-looking strip of colour.
 *   4. THE LAST LETTER FALLS OFF THE END. index.html already records this exact failure for the
 *      CSS wordmark ("RIPMASTER3030STUDIO", S clipped). The 3D layer can reproduce it from a
 *      completely different cause — a turned word is wider than a square one, and v2 turns
 *      further and shortens the camera — so the browser pass drives the type to its worst pose in
 *      both directions and measures the clearance.
 *   5. THE FALLBACK STOPS WORKING. The CSS wordmark is only hidden once a frame with ink in it
 *      has drawn. That is the whole accessibility and no-WebGL story, so it is tested by breaking
 *      the build on purpose (?no3d, no WebGL2, assets blocked) and checking the type is still
 *      there and still readable.
 *
 * The browser pass is SKIPPED, not failed, where there is no headless chromium: this is an asset
 * build and it should still work on a machine without playwright. It says so rather than going
 * quiet. HERO_SKIP_BROWSER=1 forces that.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, mkdirSync, unlinkSync, rmSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from './png23d.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'media/hero');
const TMP = join(ROOT, 'build/hero-type');
const WOFF = join(ROOT, 'fonts/anton.woff2');
const TTF = join(TMP, 'anton.ttf');

let fail = 0;
const t = (name, ok, extra = '') => {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? '  — ' + extra : ''));
  if (!ok) fail++;
};

/* ── stage 1: the font ────────────────────────────────────────────────────────────────────────
 * Blender reads TTF/OTF, not WOFF2, and the repo ships the subset WOFF2 because that is what the
 * BROWSER wants. Decompressing here (rather than committing a second copy of the same outlines)
 * keeps one file as the source of truth for both the CSS wordmark and its geometry — which is
 * the entire reason the 3D layer can line up with the type it covers. The .ttf is deleted below. */
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
try {
  execFileSync('python3', ['-c',
    'import sys;from fontTools.ttLib import TTFont;f=TTFont(sys.argv[1]);f.flavor=None;f.save(sys.argv[2])',
    WOFF, TTF], { cwd: ROOT, stdio: 'pipe' });
} catch (e) {
  console.error('could not decompress ' + WOFF + ' -> ttf.\n' +
    '  needs: pip install fonttools brotli   (the same pair fonts/README.md uses to subset)\n' +
    String((e.stderr || '') + (e.stdout || '')).trim());
  process.exit(1);
}

/* ── stage 2: Blender ─────────────────────────────────────────────────────────────────────── */
try { execFileSync('blender', ['--version'], { stdio: 'ignore' }); }
catch { console.error('blender not found on PATH.'); process.exit(1); }

console.log('cutting the type …');
const log = execFileSync('blender', ['--background', '--factory-startup', '-noaudio',
  '-P', 'scripts/blender/build-hero-type.py', '--', OUT, TTF],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
const okLine = log.split('\n').find(l => l.startsWith('HERO_OK'));
if (!okLine) {
  console.error(log.split('\n').filter(l => /Error|Traceback|line \d+/.test(l)).join('\n'));
  console.error('blender did not finish the wordmark');
  process.exit(1);
}
for (const l of log.split('\n').filter(l => /^ {2}(PART|FACETS|DEPTH)/.test(l))) console.log(l);
console.log(okLine + '\n');
const blenderAspect = parseFloat(/aspect=([\d.]+)/.exec(okLine)[1]);

/* ── stage 3: the GLB ─────────────────────────────────────────────────────────────────────── */
function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  let o = 12, json = null, bin = null;
  while (o + 8 <= buf.byteLength) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buf.subarray(o + 8, o + 8 + len)));
    if (type === 0x004e4942) bin = buf.subarray(o + 8, o + 8 + len);
    o += 8 + len;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

const glbPath = join(OUT, 'type.glb');
const glbBuf = readFileSync(glbPath);
const { json: gltf, bin } = parseGlb(glbBuf);
const glbKb = glbBuf.length / 1024, glbGz = gzipSync(glbBuf, { level: 9 }).length / 1024;

const nodes = {};
for (const n of gltf.nodes || []) if (n.mesh !== undefined) nodes[n.name] = gltf.meshes[n.mesh];
const names = Object.keys(nodes);
console.log(`type.glb  ${glbKb.toFixed(0)} KB (${glbGz.toFixed(0)} KB gzipped)  parts: ${names.join(', ')}`);

/* These three names ARE the contract with js/hero3d.js, in the same way dogfight's GLB part names
 * are the contract with dfpc-app. The renderer fails open, so a rename ships as an absence. */
t('glb carries wm_face, wm_bevel and wm_rim',
  !!(nodes.wm_face && nodes.wm_bevel && nodes.wm_rim), names.join(','));

const prim = m => m && m.primitives && m.primitives[0];
const attrs = m => Object.keys((prim(m) || {}).attributes || {});

/* Read a float accessor out of the BIN chunk. Only what these assertions need: F32, non-sparse,
 * which is everything Blender writes for POSITION/NORMAL/TEXCOORD. */
function readF32(ai) {
  const acc = gltf.accessors[ai];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  if (acc.componentType !== 5126) throw new Error('accessor ' + ai + ' is not F32');
  const bv = gltf.bufferViews[acc.bufferView];
  const stride = bv.byteStride || comps * 4;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out = new Float32Array(acc.count * comps);
  for (let i = 0; i < acc.count; i++)
    for (let c = 0; c < comps; c++) out[i * comps + c] = dv.getFloat32(base + i * stride + c * 4, true);
  return out;
}

/* ⚑ ALL THREE MESHES CARRY THE SAME FOUR ATTRIBUTES IN THE SAME SLOTS, and the uniformity is the
 * assertion — not a tidiness preference. The exporter numbers TEXCOORD_n by UV-layer order PER
 * MESH, so a rim carrying only the rig layer would ship it as TEXCOORD_0 while face and bevel ship
 * it as TEXCOORD_1. The vertex shader would then read the planar UV as a letter index and rig the
 * whole silhouette to letter 0 — no error, no warning, just a wall that does not move with its
 * letter. wm_rim's TEXCOORD_0 is genuinely unused by the shader; it is 8 bytes a vertex spent on
 * making that mistake impossible. (This assertion replaces one that required the opposite.) */
for (const nm of ['wm_face', 'wm_bevel', 'wm_rim']) {
  if (!nodes[nm]) continue;
  const a = attrs(nodes[nm]);
  t(`${nm} carries POSITION + NORMAL + TEXCOORD_0 + TEXCOORD_1 (slots aligned across all parts)`,
    ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TEXCOORD_1'].every(k => a.includes(k)), a.join(','));
  t(`${nm} carries NO TEXCOORD_2 (the pivot is derived, not shipped)`,
    !a.includes('TEXCOORD_2'), a.join(','));
}

/* ── THE RIG ─────────────────────────────────────────────────────────────────────────────────
 * v2 had none of this: three meshes split by face normal, every letter welded into each, nothing
 * that could move independently. The artist's word was "not rigged" and it was literal. These
 * assertions are what make that state unshippable. */
const RUN_LETTERS = 'RIPMASTER'.length + '3030'.length + 'STUDIOS'.length;   // 20
let rigLo = Infinity, rigHi = -Infinity, rigFrac = 0, rigN = 0, uLo = Infinity, uHi = -Infinity;
const seenLetter = new Set();
for (const nm of ['wm_face', 'wm_bevel', 'wm_rim']) {
  const p = prim(nodes[nm]); if (!p || p.attributes.TEXCOORD_1 === undefined) continue;
  const uv = readF32(p.attributes.TEXCOORD_1);
  for (let i = 0; i < uv.length; i += 2) {
    const k = uv[i];
    rigN++;
    if (Math.abs(k - Math.round(k)) > 1e-3) rigFrac++;
    rigLo = Math.min(rigLo, k); rigHi = Math.max(rigHi, k);
    seenLetter.add(Math.round(k));
    uLo = Math.min(uLo, uv[i + 1]); uHi = Math.max(uHi, uv[i + 1]);
  }
}
t('the rig reaches every vertex of every part', rigN > 0, rigN + ' vertices tagged');
t(`all ${RUN_LETTERS} letters are present as separate rig members`,
  seenLetter.size === RUN_LETTERS, seenLetter.size + ' distinct letter indices');
t('letter indices are whole numbers (no vertex welded across two glyphs)',
  rigFrac === 0, rigFrac + ' fractional of ' + rigN);
t('letter indices span the whole word', rigLo === 0 && rigHi === RUN_LETTERS - 1,
  rigLo + '..' + rigHi);
/* u is the wave coordinate — a letter's position across the word, 0 at the left edge, 1 at the
 * right. Propagation reads it straight off the vertex, so a squashed range would silently make
 * the whole row respond as one letter. */
t('the wave coordinate spans the word', uLo < 0.1 && uHi > 0.9,
  `u ${uLo.toFixed(3)}..${uHi.toFixed(3)}`);

/* ⚠ THE MARK IS SQUARE, and the .py and the CSS have to agree on how. The mesh is cut to land on
 * the box index.html lays out, so a change in one without the other puts the 3D layer on a box it
 * was not cut for. Both are asserted here rather than remembered. */
const pySrc = readFileSync(join(ROOT, 'scripts/blender/build-hero-type.py'), 'utf8');
const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
const linesM = /LINES = \[([^\]]*)\]/.exec(pySrc);
const LINES = [...(linesM ? linesM[1] : '').matchAll(/'([^']+)'/g)].map(m => m[1]);
t('the .py sets the name as a multi-line block', LINES.length >= 3, LINES.join(' / '));
t('the lines spell the name, in order and with nothing else',
  LINES.join('').toLowerCase() === 'ripmaster3030studios', LINES.join('').toLowerCase());
/* ⛔ The name law: one word, no spaces, in the DOM. A line break is not a space. */
t('index.html still carries the name as ONE unbroken string',
  /aria-label="ripmaster3030studios"/.test(idx) && !/>ripmaster 3030/.test(idx));
t('index.html lays the wordmark out as a square block',
  /\.wordmark\{[^}]*aspect-ratio:1/.test(idx));
t('index.html splits it into the same number of lines as the mesh',
  (idx.match(/<span class="l1">/g) || []).length >= 1
  && (idx.match(/<span class="l3">/g) || []).length >= 1);
/* The per-line sizes justify each line to the same measure. Measured in this exact face at 100px:
 * RIPMASTER 404.4 / 3030 192.9 / STUDIOS 291.4 -> 1 : 2.0968 : 1.3877. */
const l2 = /\.wordmark \.l2\{ font-size:([\d.]+)em/.exec(idx);
const l3 = /\.wordmark \.l3\{ font-size:([\d.]+)em/.exec(idx);
t('the CSS justifies each line to a common measure',
  l2 && l3 && Math.abs(parseFloat(l2[1]) - 2.0968) < 0.02 && Math.abs(parseFloat(l3[1]) - 1.3877) < 0.02,
  l2 && l3 ? `1 : ${l2[1]} : ${l3[1]}` : 'missing');
/* ⚑ THE HEADLINE. The artist asked for a square; this is the number that says whether it is one. */
t('THE BLOCK IS SQUARE', Math.abs(blenderAspect - 1) < 0.02, blenderAspect.toFixed(4) + ':1');

let tris = 0;
for (const m of Object.values(nodes)) {
  const p = prim(m);
  if (p && p.indices !== undefined) tris += gltf.accessors[p.indices].count / 3;
}
/* Budget, not taste: this is above the fold on the landing page. It is also what the rear-half
 * cull in the .py is spent on — the die profile costs about 6,500 triangles and dropping the
 * never-visible back of the extrusion pays for all of it. */
t('under 12,000 triangles', tris < 12000, tris.toFixed(0));
t('glb under 400 KB raw', glbKb < 400, glbKb.toFixed(0) + ' KB');

let lo = null, hi = null;
for (const m of Object.values(nodes)) {
  const p = prim(m); if (!p) continue;
  const acc = gltf.accessors[p.attributes.POSITION];
  if (!acc || !acc.min) continue;
  if (!lo) { lo = acc.min.slice(); hi = acc.max.slice(); continue; }
  for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], acc.min[i]); hi[i] = Math.max(hi[i], acc.max[i]); }
}
const dim = lo ? [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] : [0, 0, 0];
const meshAspect = dim[1] ? dim[0] / dim[1] : 0;
console.log(`bounds ${dim.map(v => v.toFixed(4)).join(' x ')}  aspect ${meshAspect.toFixed(3)}`);
t('aspect matches what Blender reported', Math.abs(meshAspect - blenderAspect) < 0.02,
  `${meshAspect.toFixed(3)} vs ${blenderAspect.toFixed(3)}`);
/* ⚠ A flat mesh would render, light, and look almost right — "3D type" that is a picture of type
 *   is exactly the failure this whole build exists to avoid, and it is silent. */
t('the type is actually EXTRUDED (depth > 1% of width)', dim[2] > dim[0] * 0.01,
  (dim[2] / dim[0] * 100).toFixed(1) + '% of width');
/* glTF is Y-up: type authored in Blender's XY plane arrives lying on the floor unless the axis
 * swap in make_object() is right. Height >> depth is what proves it is standing up. */
t('the type is UPRIGHT (height > depth)', dim[1] > dim[2] * 2,
  `h ${dim[1].toFixed(3)} vs d ${dim[2].toFixed(3)}`);

/* ── the die, and the depth variation ─────────────────────────────────────────────────────────
 * Read straight out of the exported normals, because "the bevel has character" is otherwise a
 * claim nobody can check after the fact — a quarter circle and a hand-authored die produce the
 * same triangle count, the same silhouette in a thumbnail, and completely different light. */
function readAccessor(idx) {
  const acc = gltf.accessors[idx];
  const bv = gltf.bufferViews[acc.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const dv = new DataView(bin.buffer, bin.byteOffset + off, acc.count * comps * 4);
  const out = new Float32Array(acc.count * comps);
  for (let i = 0; i < out.length; i++) out[i] = dv.getFloat32(i * 4, true);
  return { data: out, comps, count: acc.count };
}
if (bin && nodes.wm_bevel && nodes.wm_face) {
  const nb = readAccessor(prim(nodes.wm_bevel).attributes.NORMAL);
  const hist = new Map();
  for (let i = 0; i < nb.count; i++) {
    const k = Math.round(Math.abs(nb.data[i * 3 + 2]) * 40) / 40;      // 0.025 buckets
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  const fams = [...hist.entries()].filter(([, n]) => n > nb.count * 0.02).map(([k]) => k).sort((a, b) => a - b);
  console.log('  chamfer facet |n.z| families: ' + fams.map(v => v.toFixed(2)).join(' '));
  /* A quarter circle steps its facet angle monotonically and in near-equal increments. A die does
   * not: it spends a lot of travel in one straight chamfer, flattens onto a shelf, then rolls. So
   * the tell is the SPREAD of the gaps between families — even on a circle, wild on a die. */
  const gaps = fams.slice(1).map((v, i) => v - fams[i]);
  const gm = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
  const gsd = Math.sqrt(gaps.reduce((a, b) => a + (b - gm) ** 2, 0) / (gaps.length || 1));
  t('the chamfer has 4+ distinct facet angles', fams.length >= 4, fams.length + ' families');
  t('the die is NOT a round bevel (facet steps are uneven)', gsd > gm * 0.35,
    `gap mean ${gm.toFixed(3)} sd ${gsd.toFixed(3)}`);

  // depth varies across the word: slice the face's z by x and look at the spread
  const pf = readAccessor(prim(nodes.wm_face).attributes.POSITION);
  const B = 20, zmin = new Array(B).fill(1e9), zmax = new Array(B).fill(-1e9);
  for (let i = 0; i < pf.count; i++) {
    const x = pf.data[i * 3], z = pf.data[i * 3 + 2];
    const b = Math.max(0, Math.min(B - 1, Math.floor((x - lo[0]) / (dim[0] || 1) * B)));
    zmin[b] = Math.min(zmin[b], z); zmax[b] = Math.max(zmax[b], z);
  }
  const fronts = zmax.filter(v => v > -1e8);
  const fm = fronts.reduce((a, b) => a + b, 0) / fronts.length;
  const fsd = Math.sqrt(fronts.reduce((a, b) => a + (b - fm) ** 2, 0) / fronts.length);
  /* ⚑ The dome. Head on it is invisible; the moment the word turns it is what stops the letters
   *   being one flat slab, so it is worth an assertion that it survived the export. */
  t('the word is DOMED (front face z varies across it)', fsd > dim[2] * 0.04,
    `front z sd ${fsd.toFixed(4)} over depth ${dim[2].toFixed(4)}`);
  // the rear half must be gone — see the .py header
  const nb2 = readAccessor(prim(nodes.wm_face).attributes.NORMAL);
  let back = 0;
  for (let i = 0; i < nb2.count; i++) if (nb2.data[i * 3 + 2] < -0.3) back++;
  t('the never-visible rear half is not exported', back === 0, back + ' rear-facing face verts');
}

/* ── stage 4: the baked plates ────────────────────────────────────────────────────────────────
 * Quality on the LOSSLESS png, cost on the SHIPPED webp — the same split build-bg.mjs makes, for
 * the same reason: a failing colour check must not be blameable on WebP ringing. */
const load = f => { const p = join(OUT, f); const img = decodePNG(readFileSync(p)); img.kb = statSync(p).size / 1024; return img; };
const alb = load('type-albedo.png');
const nrm = load('type-normal.png');
const foil = load('type-foil.png');
const lut = load('type-spectrum.png');
const kb = f => statSync(join(OUT, f)).size / 1024;
const albKb = kb('type-albedo.webp'), nrmKb = kb('type-normal.webp'),
  foilKb = kb('type-foil.webp'), lutKb = kb('type-spectrum.png');
console.log(`\nalbedo   ${alb.w}x${alb.h}  webp ${albKb.toFixed(0)} KB`);
console.log(`normal   ${nrm.w}x${nrm.h}  webp ${nrmKb.toFixed(0)} KB`);
console.log(`foil     ${foil.w}x${foil.h}  webp ${foilKb.toFixed(0)} KB`);
console.log(`spectrum ${lut.w}x${lut.h}  png  ${lutKb.toFixed(1)} KB\n`);

t('albedo, normal and foil are the same size',
  alb.w === nrm.w && alb.h === nrm.h && alb.w === foil.w && alb.h === foil.h);
/* The plates are a planar projection of the type's own bounding box. If the aspect drifts from the
 * mesh's, every feature of the foil is stretched and the gradient stops landing on the right
 * letters — and it looks fine in isolation, which is why it needs a number. */
t('plate aspect matches the mesh', Math.abs(alb.w / alb.h - meshAspect) / meshAspect < 0.03,
  (alb.w / alb.h).toFixed(3) + ' vs ' + meshAspect.toFixed(3));

function stats(img) {
  const { w, h, data } = img;
  const lum = new Float64Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const L = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    lum[i] = L; sum += L;
  }
  const mean = sum / lum.length;
  let v = 0; for (const L of lum) v += (L - mean) ** 2;
  const s = Array.from(lum).sort((a, b) => a - b);
  const p = q => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { mean, sd: Math.sqrt(v / lum.length), p01: p(0.01), p50: p(0.5), p99: p(0.99) };
}

const A = stats(alb);
console.log(`  ink luma: mean ${A.mean.toFixed(1)} · p01 ${A.p01.toFixed(1)} · median ${A.p50.toFixed(1)} · p99 ${A.p99.toFixed(1)} · sd ${A.sd.toFixed(1)}`);
/* ⚑ The BOUNDS RUN THE OPPOSITE WAY TO build-bg's, and that is the point of having them written
 *   down. That plate fails ABOVE mean 40 because paragraphs sit on it. Nothing sits on the
 *   wordmark: it is the brightest object above the fold, over a near-black page, and a dim foil
 *   does not read as restraint, it reads as a texture that failed to load. */
t('ink mean luma above 120 (it is the brightest thing on the page)', A.mean > 120, A.mean.toFixed(1));
t('ink p01 above 40 (no holes punched in the letterforms)', A.p01 > 40, A.p01.toFixed(1));
t('ink is not flat — sd above 3', A.sd > 3, A.sd.toFixed(1));

/* ── the ink is the SITE's gradient ───────────────────────────────────────────────────────────
 * Transcribed from index.html's `.wordmark` background. A bake that lost, flattened or reversed
 * the ramp still produces a perfectly attractive strip of colour, so each stop is checked where
 * it is supposed to be. The tolerance is loose on purpose — the relief modulates every pixel and
 * the ramp is interpolated in LINEAR space where CSS interpolates in sRGB — but it is nowhere
 * near loose enough to pass a different palette. */
const STOPS = [[0.04, 0xea, 0xff, 0xf2], [0.24, 0x2b, 0xff, 0x80], [0.46, 0x27, 0xf7, 0xe4],
               [0.60, 0x7a, 0xa8, 0xff], [0.80, 0xff, 0x2a, 0xd9], [0.96, 0xff, 0xd2, 0x3b]];
function rowMean(img, y) {
  const { w, data } = img;
  let r = 0, g = 0, b = 0;
  for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  return [r / w, g / w, b / w];
}
let hit = 0;
for (const [pos, r, g, b] of STOPS) {
  const y = Math.min(alb.h - 1, Math.round(pos * alb.h));      // stop 0 is the TOP of the plate
  const m = rowMean(alb, y);
  const d = Math.hypot(m[0] - r, m[1] - g, m[2] - b);
  if (d < 78) hit++;
  console.log(`    stop ${(pos * 100).toFixed(0).padStart(3)}%  want ${[r, g, b].join(',')}  got ${m.map(v => Math.round(v)).join(',')}  Δ${d.toFixed(0)}`);
}
t('at least 5 of the 6 CSS gradient stops reproduce in the ink', hit >= 5, hit + '/6');
{
  const top = rowMean(alb, Math.round(alb.h * 0.06)), bot = rowMean(alb, Math.round(alb.h * 0.94));
  const d = Math.hypot(top[0] - bot[0], top[1] - bot[1], top[2] - bot[2]);
  // ⚠ proves the ramp runs DOWN the plate. A horizontal (or absent) ramp passes every check above.
  t('the ink ramp is vertical (top and bottom differ)', d > 90, 'Δ' + d.toFixed(0));
}

/* ── the normal map, and THE GRAIN ────────────────────────────────────────────────────────────
 * A tangent-space normal that came back as flat 128,128,255 is a perfectly valid image and a
 * completely dead surface. But v2 needs more than "not flat": the live anisotropic highlight
 * reads its streak direction out of THIS MAP, so a map that bakes ISOTROPIC has no grain for it
 * to find and the highlight comes out running the wrong way. That shipped twice. */
{
  const { w, h, data } = nrm;
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < w * h; i++) { mr += data[i * 4]; mg += data[i * 4 + 1]; mb += data[i * 4 + 2]; }
  mr /= w * h; mg /= w * h; mb /= w * h;
  let vr = 0, vg = 0;
  for (let i = 0; i < w * h; i++) { vr += (data[i * 4] - mr) ** 2; vg += (data[i * 4 + 1] - mg) ** 2; }
  const sr = Math.sqrt(vr / (w * h)), sg = Math.sqrt(vg / (w * h));
  console.log(`  normal: mean ${mr.toFixed(1)},${mg.toFixed(1)},${mb.toFixed(1)}  sd x ${sr.toFixed(1)} y ${sg.toFixed(1)}`);
  t('normal points outward (blue mean above 200)', mb > 200, mb.toFixed(1));
  t('normal is unbiased (x,y means near 128)', Math.abs(mr - 128) < 8 && Math.abs(mg - 128) < 8);
  t('normal carries relief (x and y sd above 2)', sr > 2 && sg > 2, `${sr.toFixed(1)}/${sg.toFixed(1)}`);

  /* ⚑ THE GRAIN METRIC IS ROW-vs-COLUMN MEANS, NOT A GRADIENT, and the difference matters. Mean
   *   |d/dx| against mean |d/dy| looked like the obvious test and is useless here: an fBm's
   *   highest octave dominates any per-texel gradient, and at these scales that octave is below
   *   Nyquist in both directions, so it aliases to isotropic white noise and the metric reads 1.0
   *   whatever the grain is doing. Averaging a whole row cancels the noise and leaves the
   *   structure: with a horizontal grain, row means differ (each row crosses a different part of
   *   the brush) while column means do not (each column averages across every streak). */
  const sd = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  const rows = [], cols = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) { const v = data[(y * w + x) * 4 + 1]; s += v; cols[x] += v; }
    rows.push(s / w);
  }
  const cm = Array.from(cols, v => v / h);
  const grain = sd(rows) / sd(cm);
  console.log(`  grain: sd(row means) ${sd(rows).toFixed(2)} vs sd(col means) ${sd(cm).toFixed(2)}`);
  t('the BRUSH is in the normal map (grain runs along the word)', grain > 1.5, 'row/col ' + grain.toFixed(2));
}

/* ── the foil data plate ──────────────────────────────────────────────────────────────────────
 * r = brush angle / pi + 0.5 · g = grating phase · b = flake. This is DATA — every channel is
 * read as a number by the shader, and a channel that came back constant is a feature silently
 * switched off rather than an error. */
{
  const { w, h, data } = foil;
  const ch = c => {
    let m = 0, mn = 255, mx = 0;
    for (let i = 0; i < w * h; i++) { const v = data[i * 4 + c]; m += v; if (v < mn) mn = v; if (v > mx) mx = v; }
    m /= w * h;
    let v2 = 0;
    for (let i = 0; i < w * h; i++) v2 += (data[i * 4 + c] - m) ** 2;
    return { mean: m, sd: Math.sqrt(v2 / (w * h)), min: mn, max: mx };
  };
  const R = ch(0), G = ch(1), B = ch(2);
  console.log(`  foil r(angle) mean ${R.mean.toFixed(1)} sd ${R.sd.toFixed(2)} · g(phase) sd ${G.sd.toFixed(1)} · b(flake) sd ${B.sd.toFixed(1)}`);
  /* The brush angle must wander, but only a little: a foil roll drifts a few degrees. At +/-17
   *   degrees the streaks climbed clean across a 9:1 plate and the whole field baked as a marbled
   *   swirl with no grain in it at all. */
  const deg = v => (v / 255 - 0.5) * 180;
  t('brush angle is centred on horizontal', Math.abs(R.mean - 127.5) < 6, R.mean.toFixed(1));
  t('brush angle wanders, but under 12 degrees',
    R.sd > 0.3 && deg(R.max) - deg(R.min) < 24,
    `spread ${(deg(R.max) - deg(R.min)).toFixed(1)}°`);
  t('grating phase varies (the refractor breaks into patches)', G.sd > 8, G.sd.toFixed(1));
  t('flake mask varies (specular breaks into grains)', B.sd > 12, B.sd.toFixed(1));
}

/* ── the diffraction LUT ──────────────────────────────────────────────────────────────────────
 * The one file that decides what colour the foil can ever be. Re-derived here INDEPENDENTLY from
 * the same six CSS hex values, so a bug in the .py's hue interpolation cannot agree with itself. */
{
  const px = x => { const i = (Math.round(x) % lut.w) * 4; return [lut.data[i], lut.data[i + 1], lut.data[i + 2]]; };
  const hsv = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 1e-9) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, mx ? d / mx : 0, mx];
  };
  t('spectrum LUT is 256 wide', lut.w === 256, lut.w + 'x' + lut.h);
  let sHit = 0;
  for (const [pos, r, g, b] of STOPS) {
    const got = px(pos * lut.w);
    if (Math.hypot(got[0] - r, got[1] - g, got[2] - b) < 12) sHit++;
  }
  t('all 6 CSS stops land exactly in the LUT', sHit === 6, sHit + '/6');
  /* ⚑ The LOOP is the whole design: the shader fract()s into this strip, so a discontinuity at
   *   the seam would show as a hard colour line that sweeps across the wordmark as it turns. */
  const seam = Math.hypot(...px(255).map((v, i) => v - px(0)[i]));
  const typicalStep = Math.hypot(...px(128).map((v, i) => v - px(129)[i]));
  t('the palette LOOPS (no seam)', seam < 24, 'Δ' + seam.toFixed(0) + ' at the wrap');
  /* ⚑ HUE-INTERPOLATED, not componentwise. Mixing #7aa8ff to #ff2ad9 in RGB passes through a
   *   washed lilac; measured on the live render, a componentwise LUT capped the wordmark's
   *   saturation no matter what the lighting did. */
  const sats = [];
  for (let x = 0; x < lut.w; x++) sats.push(hsv(px(x))[1]);
  sats.sort((a, b) => a - b);
  const med = sats[128];
  console.log(`  LUT saturation: p10 ${sats[25].toFixed(2)} median ${med.toFixed(2)} p90 ${sats[230].toFixed(2)}`);
  t('the LUT stays saturated between stops (median > 0.62)', med > 0.62, med.toFixed(2));
  // and it must sweep the whole colour wheel, not oscillate in one corner of it
  let travel = 0;
  for (let x = 1; x < lut.w; x++) {
    let d = (hsv(px(x))[0] - hsv(px(x - 1))[0]) % 360;
    if (d > 180) d -= 360; if (d < -180) d += 360;
    travel += d;
  }
  t('the LUT sweeps a full hue circle', Math.abs(travel) > 300, Math.abs(travel).toFixed(0) + '°');
  t('the LUT is lossless PNG, not lossy', existsSync(join(OUT, 'type-spectrum.png')) && typicalStep < 12);
}

/* payload: this loads above the fold on the landing page */
const totalKb = albKb + nrmKb + foilKb + lutKb;
/* ⚠ 150 KB was the budget for a 1024x104 STRIP. The mark is a square block now, so the plate is
 * 1024x1132 — about eleven times the texels for the same width — and the maps still come in at
 * 162 KB because they are mostly empty stock. Raised to 200 with that stated, rather than left at
 * a number that silently describes the old shape. */
t('textures under 200 KB total (the plate is square now, not a 9.7:1 strip)',
  totalKb < 200, totalKb.toFixed(0) + ' KB');

for (const f of ['type-albedo.png', 'type-normal.png', 'type-foil.png']) {
  try { unlinkSync(join(OUT, f)); } catch {}
}
try { rmSync(TMP, { recursive: true, force: true }); } catch {}

/* ── stage 5 + 6: what the browser actually does with it ────────────────────────────────────── */
if (!process.env.HERO_SKIP_BROWSER) {
  try {
    await browserPass();
  } catch (e) {
    const msg = String((e && e.stack) || e);
    if (/Cannot find module|ENOENT|executablePath/.test(msg)) console.log('\n  --   browser pass skipped (no headless chromium here)');
    else { console.log(msg); t('browser pass ran', false); }
  }
}

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);

// ─────────────────────────────────────────────────────────────────────────────────────────────
async function browserPass() {
  const { createServer } = await import('node:http');
  const { extname } = await import('node:path');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
    '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.gif': 'image/gif', '.avif': 'image/avif' };
  const srv = createServer((q, s) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = join(ROOT, p);
    if (!existsSync(f) || !statSync(f).isFile()) { s.writeHead(404); return s.end('nf'); }
    s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    s.end(readFileSync(f));
  });
  /* ⚑ EPHEMERAL PORT — see the note in scripts/debug-games.mjs. A fixed port makes two concurrent
 * harnesses collide with EADDRINUSE, which reads as a hang rather than as a port clash. */
  await new Promise(r => srv.listen(0, r));
  const PORT = srv.address().port;

  const pw = await import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
  const chromium = (pw.default || pw).chromium;
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  async function open(width, height, { query = '?grab=1', block = null, noGl = false } = {}) {
    const ctx = await br.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
    if (noGl) {
      /* ⚑ Simulate a browser with no WebGL2 rather than trust a flag. PlayCanvas 2.x has no
       *   software path, so this is not an exotic case — it is every pre-2021 browser and every
       *   machine with a blocklisted driver, and it must land on the CSS wordmark. */
      await ctx.addInitScript(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
          if (String(kind).indexOf('webgl') === 0) return null;
          return orig.call(this, kind, ...rest);
        };
      });
    }
    const pg = await ctx.newPage();
    if (block) await pg.route(block, r => r.abort());
    /* `domcontentloaded`, not `load`: the intro splash pulls a video this check has no interest
     * in, and waiting for it cost about a minute across five page opens. Deferred scripts have
     * already run by then, and hero3d waits on document.fonts.ready by itself. */
    await pg.goto('http://127.0.0.1:${PORT}/index.html' + query, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pg.evaluate(() => { const s = document.getElementById('introSplash'); if (s) s.remove(); });
    /* ⚠ Headless rAF stalls between input events (CLAUDE.md) — a quiet second can advance the
     *   clock by exactly zero and then a keypress unblocks a burst. Pump it, don't wait on it. */
    for (let i = 0; i < 70; i++) { await pg.mouse.move(2 + (i % 3), 2 + (i % 2)); await pg.waitForTimeout(25); }
    return { ctx, pg };
  }

  console.log('\nbrowser:');
  for (const [W, H] of [[1280, 900], [390, 844]]) {
    const { ctx, pg } = await open(W, H);
    const r = await pg.evaluate(async () => {
      const H2 = window.RipHeroType;
      const el = document.querySelector('.marquee-art.wordmark');
      const cs = getComputedStyle(el);
      const out = {
        state: H2 ? H2.state() : null,
        limits: H2 && H2.limits ? H2.limits() : null,
        text: (el.textContent || '').replace(/\s+/g, ''),
        inline: el.style.opacity,
        display: cs.display, visibility: cs.visibility,
        docW: document.documentElement.scrollWidth, vw: innerWidth,
      };
      const c = document.getElementById('heroType');
      if (!c || !H2 || !H2.pose) return out;
      const shoot = async (px, py) => {
        H2.pose(px, py);
        await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
        const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
        const x = g.getContext('2d'); x.drawImage(c, 0, 0);
        return { d: x.getImageData(0, 0, g.width, g.height).data, w: g.width, h: g.height };
      };
      const ink = f => {
        let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
        for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
          if (f.d[(y * f.w + x) * 4 + 3] > 18) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        return { left: x0, right: f.w - 1 - x1, top: y0, bottom: f.h - 1 - y1, w: f.w, h: f.h, any: x1 >= 0 };
      };
      const L = out.limits;
      out.poseA = ink(await shoot(L.pitch, -L.yaw));
      out.poseB = ink(await shoot(-L.pitch, L.yaw));

      /* ── THE FOIL TEST ─────────────────────────────────────────────────────────────────────
       * Read off the LIVE canvas — CLAUDE.md: this container's screenshot path rotates hue on
       * canvas content, so a screenshot could not be used for this even in principle.
       * The grid is fixed from the ink box at the neutral pose so the SAME patch of the word is
       * sampled at every angle; the metric is the accumulated signed hue travel across the fan. */
      const hueOf = (r2, g2, b2) => {
        const mx = Math.max(r2, g2, b2), mn = Math.min(r2, g2, b2), d = mx - mn;
        if (d < 1e-6) return null;
        let h = mx === r2 ? ((g2 - b2) / d) % 6 : mx === g2 ? (b2 - r2) / d + 2 : (r2 - g2) / d + 4;
        h *= 60; if (h < 0) h += 360;
        return { h, s: mx ? d / mx : 0, v: mx / 255 };
      };
      const ref = await shoot(-3, -6);
      const rb = ink(ref);
      const COLS = 12, ROWS = 6;
      const cellsAt = f => {
        const cells = [];
        for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
          const ax = rb.left + (f.w - rb.right - rb.left) * cx / COLS;
          const bx = rb.left + (f.w - rb.right - rb.left) * (cx + 1) / COLS;
          const ay = rb.top + (f.h - rb.bottom - rb.top) * cy / ROWS;
          const by = rb.top + (f.h - rb.bottom - rb.top) * (cy + 1) / ROWS;
          let n = 0, R = 0, G = 0, B = 0;
          for (let y = Math.round(ay); y < by; y++) for (let x = Math.round(ax); x < bx; x++) {
            const i = (y * f.w + x) * 4;
            if (f.d[i + 3] > 200) { n++; R += f.d[i]; G += f.d[i + 1]; B += f.d[i + 2]; }
          }
          cells.push(n > 30 ? hueOf(R / n, G / n, B / n) : null);
        }
        return cells;
      };
      const YAWS = [-19, -12, -6, 0, 6, 12, 19];
      out.fan = [];
      for (const y of YAWS) out.fan.push(cellsAt(await shoot(-3, y)));
      out.yaws = YAWS;
      H2.pose(null, null);
      return out;
    });
    const tag = W + 'px';
    t(`${tag}: 3D layer is live`, r.state && r.state.phase === 'live', r.state ? r.state.phase + ' ' + r.state.why : 'no module');
    t(`${tag}: all three named parts bound`,
      r.state && r.state.parts === 'wm_bevel,wm_face,wm_rim', r.state && r.state.parts);
    /* ⚑ The blank-canvas guard's own number. `ink` is the share of a band across the middle of the
     *   canvas that actually got painted, measured by hero3d before it dares hide the real
     *   wordmark. A shader that fails to link renders nothing and every other signal still says
     *   "live" — this is the one that catches it. */
    t(`${tag}: the layer put real ink on the canvas`, r.state && r.state.ink > 25,
      (r.state ? r.state.ink : 0) + '% of the band');
    /* The torches are found in the DOM and used as light positions; if the markup around the
     * wordmark changes, they silently fall back to guessed coordinates. */
    t(`${tag}: both torches were found and are lighting the type`, r.state && r.state.torches === 2,
      String(r.state && r.state.torches));
    /* The accessibility contract, in one assertion. The wordmark may be faded; it may NEVER be
     * removed from the accessibility tree, and the string must still be the studio's name. */
    t(`${tag}: the real text is still in the DOM and in the a11y tree`,
      r.text.toLowerCase() === 'ripmaster3030studios' && r.display !== 'none' && r.visibility !== 'hidden',
      `"${r.text}" display:${r.display} visibility:${r.visibility}`);
    t(`${tag}: CSS wordmark faded only after a frame drew`, r.inline === '0', 'inline opacity ' + JSON.stringify(r.inline));
    if (r.poseA && r.poseB) {
      const m = Math.min(r.poseA.left, r.poseA.right, r.poseB.left, r.poseB.right);
      const pct = m / r.poseA.w * 100;
      console.log(`    ${tag} clearance at max yaw ±${r.limits.yaw}°: ${m}px of ${r.poseA.w} (${pct.toFixed(1)}%)`);
      /* THE "STUDIO" TEST — see the header. A turned wordmark is wider than a square one, and v2
       * both turns further and stands closer, so this got tighter rather than looser. */
      t(`${tag}: no letter clips at the worst pose`, r.poseA.any && r.poseB.any && m >= 4 && pct >= 1.5,
        m + 'px / ' + pct.toFixed(1) + '%');
      t(`${tag}: the type does not spill vertically`, Math.min(r.poseA.top, r.poseA.bottom) >= 2);
    }
    if (r.fan) {
      /* ⚑ ACCUMULATED TRAVEL, NOT MAX PAIRWISE DISTANCE. The palette is a LOOP, so once the phase
       *   walks past half a cycle "furthest apart" saturates at 180° and the metric stops
       *   discriminating — it read 174° both for a wordmark sliding gracefully through half the
       *   palette and for one strobing through two full cycles. Summing the SIGNED shortest-arc
       *   step between consecutive view angles measures what the eye sees: how far the colour
       *   slid, in one direction. */
      const step = (a, b) => { let d = (b - a) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };
      const travel = [], perStep = [], sat = [], val = [];
      for (let i = 0; i < r.fan[0].length; i++) {
        const seq = r.fan.map(f => f[i]);
        if (seq.some(c => !c || c.s < 0.10)) continue;
        let acc = 0;
        for (let k = 1; k < seq.length; k++) { acc += step(seq[k - 1].h, seq[k].h); perStep.push(Math.abs(step(seq[k - 1].h, seq[k].h))); }
        travel.push(Math.abs(acc));
        for (const c of seq) { sat.push(c.s); val.push(c.v); }
      }
      const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
      console.log(`    ${tag} HUE TRAVEL over ±${Math.max(...r.yaws)}° yaw, per patch (n=${travel.length}):` +
        ` p10 ${q(travel, .1).toFixed(0)}°  median ${q(travel, .5).toFixed(0)}°  p90 ${q(travel, .9).toFixed(0)}°`);
      console.log(`    ${tag} per 6° step: median ${q(perStep, .5).toFixed(0)}°  ·  saturation median ${q(sat, .5).toFixed(2)}  ·  value median ${q(val, .5).toFixed(2)}`);
      /* THE ACCEPTANCE TEST FOR "IT IS FOIL". V1 would score ~0 here: its face was flat paint, so
       * every patch had the same hue at every angle. 60° is a low bar deliberately — it is the
       * line between "responds to view" and "does not", not a tuning target. */
      t(`${tag}: THE HUE MOVES WITH THE VIEW (median travel ≥ 60°)`, q(travel, .5) >= 60,
        q(travel, .5).toFixed(0) + '° median, p10 ' + q(travel, .1).toFixed(0) + '°');
      t(`${tag}: ... on nearly every patch, not just a lucky few`, q(travel, .1) >= 30,
        'p10 ' + q(travel, .1).toFixed(0) + '°');
      /* ⚠ AND IT MUST NOT STROBE. Too much grating frequency is just as wrong as too little: at
       *   the first cut the phase walked ~2 full palette cycles across the fan, 92° of hue for
       *   every 6° of turn, and uncorrelated colour reads as static rather than as a material. */
      t(`${tag}: ... smoothly — under 75° of hue per 6° of turn`, q(perStep, .5) < 75,
        q(perStep, .5).toFixed(0) + '° median step');
      t(`${tag}: the foil keeps its colour (saturation median > 0.22)`, q(sat, .5) > 0.22, q(sat, .5).toFixed(2));
      /* It is the brightest thing above the fold; it is also not allowed to clip to white, which
       * is what destroyed the hue in the first cut (value 0.87 everywhere = no colour left). */
      t(`${tag}: bright but not blown out (value median 0.55–0.90)`,
        q(val, .5) > 0.55 && q(val, .5) < 0.90, q(val, .5).toFixed(2));
    }
    t(`${tag}: the page does not scroll sideways`, r.docW <= r.vw + 1, r.docW + ' vs ' + r.vw);
    await ctx.close();
  }

  /* ── fail-open, proven by breaking it ─────────────────────────────────────────────────────── */
  for (const [why, opts] of [['?no3d', { query: '?no3d' }],
                             ['no WebGL2', { noGl: true }],
                             ['assets blocked', { block: '**/media/hero/**' }]]) {
    const { ctx, pg } = await open(1280, 900, opts);
    const r = await pg.evaluate(() => {
      const el = document.querySelector('.marquee-art.wordmark');
      const cs = getComputedStyle(el);
      return { phase: window.RipHeroType ? RipHeroType.state().phase : 'none',
        why: window.RipHeroType ? RipHeroType.state().why : '',
        opacity: cs.opacity, w: +el.getBoundingClientRect().width.toFixed(1),
        canvas: !!document.getElementById('heroType') };
    });
    t(`fail-open (${why}): the CSS wordmark is fully visible`,
      r.phase === 'fallback' && +r.opacity === 1 && r.w > 100 && !r.canvas,
      `${r.phase}/${r.why} opacity ${r.opacity} w ${r.w} canvas ${r.canvas}`);
    await ctx.close();
  }

  /* ── the reveal must not run ahead of the render ──────────────────────────────────────────────
   * Regression test for a bug this build shipped once: PlayCanvas fires `frameend` on every TICK,
   * not on every rendered frame, so counting frameends faded the real wordmark out during the
   * whole window between app.start() and the mesh arriving — leaving a blank masthead. On a fast
   * connection that window is a few frames and invisible, which is exactly why it needs a test
   * that makes the window wide on purpose. */
  {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
    const pg = await ctx.newPage();
    /* Hold the mesh on a latch rather than a timer. A sleep would be racing this container's own
     * pace — the first attempt used 4 s and the pump took longer than that, so the check passed
     * the wrong assertion for the right reason. A latch cannot be out-run.
     * ⚠ A RegExp, not a glob. The engine may append a cache-buster, which a glob ending in the
     *   bare filename would then miss. (And a glob is awkward to even write here: a star-star
     *   slash inside a block comment closes the comment.) */
    let release = null, hits = 0;
    const latch = new Promise(res => { release = res; });
    await pg.route(/type\.glb/, async r => { hits++; await latch; await r.continue(); });
    await pg.goto('http://127.0.0.1:${PORT}/index.html?grab=1', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pg.evaluate(() => { const s = document.getElementById('introSplash'); if (s) s.remove(); });
    for (let i = 0; i < 40; i++) { await pg.mouse.move(2 + (i % 3), 2 + (i % 2)); await pg.waitForTimeout(25); }
    const mid = await pg.evaluate(() => ({
      phase: RipHeroType.state().phase, frames: RipHeroType.state().frames,
      opacity: getComputedStyle(document.querySelector('.marquee-art.wordmark')).opacity }));
    t('slow mesh: the wordmark stays visible until a frame really drew',
      hits === 1 && mid.phase !== 'live' && +mid.opacity === 1,
      `${hits} request(s), ${mid.phase}, frames ${mid.frames}, opacity ${mid.opacity}`);
    release();
    for (let i = 0; i < 90; i++) { await pg.mouse.move(2 + (i % 3), 2 + (i % 2)); await pg.waitForTimeout(25); }
    const end = await pg.evaluate(() => ({
      phase: RipHeroType.state().phase,
      inline: document.querySelector('.marquee-art.wordmark').style.opacity }));
    t('slow mesh: it does take over once the mesh lands', end.phase === 'live' && end.inline === '0',
      `${end.phase} inline ${JSON.stringify(end.inline)}`);
    await ctx.close();
  }

  await br.close();
  srv.close();
}

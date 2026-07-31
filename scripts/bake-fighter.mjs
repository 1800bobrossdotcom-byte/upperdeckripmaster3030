#!/usr/bin/env node
/* upperdeckripmaster3030 — bake-fighter: make an arbitrary humanoid mesh riggable + shippable.
 *
 * Two problems this solves:
 *
 *   1. SIZE. Character exports are far too heavy for a web game (a 10 MB OBJ at 130k tris).
 *      Vertex-cluster decimation on a spatial grid cuts that down while keeping the silhouette.
 *
 *   2. NO PARTS. The rigid-part rig attaches objects to skeleton joints BY NAME, so a model
 *      authored as one unified body has nothing to attach and just stands there rigid. This
 *      auto-segments a mesh into anatomical parts — head / chest / pelvis / upper + lower arms /
 *      thighs / shins / feet — by where each triangle sits in the body's own bounding box, and
 *      names them so the rig picks them up. A single-mesh character becomes an articulated one.
 *
 * Meshes that ALREADY have joint-named parts are passed through untouched (only decimated), so
 * a properly-authored model is never second-guessed.
 *
 *   node scripts/bake-fighter.mjs <in.obj> <out.obj> [--grid 0.01] [--segment] [--scale 1]
 *
 * Only bake geometry you own or that is clearly licensed for commercial/NFT use.
 */
import { readFileSync, writeFileSync } from 'fs';
import { basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const shim = { window: {} };
const load = f => new Function('window', readFileSync(join(ROOT, 'js', f), 'utf8'))(shim.window);
load('ronin-obj.js'); load('ronin-glb.js'); load('ronin-morph.js');
const { RoninOBJ, RoninGLB, RoninMorph } = shim.window;

const argv = process.argv.slice(2);
if (argv.length < 2) { console.error('usage: bake-fighter.mjs <in.obj> <out.obj> [--grid 0.01|--detail 3] [--segment] [--scale 1] [--ops a,b] [--morph slug] [--amt 0.55]'); process.exit(1); }
const inPath = argv[0], outPath = argv[1];
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i > 0 ? parseFloat(argv[i + 1]) : d; };
let GRID = flag('grid', 0.01); const SCALE = flag('scale', 1);
/* `--detail <pct>` sets the decimation cell as a percentage of the model's own height, which
 * is what you actually mean: the same number then gives the same visual fidelity on any source.
 * An absolute --grid cannot — models/ronin.obj stands 9.83 units tall and models/oni.obj 2.24,
 * so a single grid of 0.3 is a reasonable 3% on one and a silhouette-destroying 13% on the
 * other (it collapsed a 13k-tri body to 1,065 vertices). Resolved after the parse, once the
 * height is known. */
const DETAIL = flag('detail', 0);
const forceSeg = argv.includes('--segment');
const PROP_RE = /floor|ground|plane|backdrop|stage|pedestal|light|camera|helper/;
const JOINT_RE = /head|chest|torso|pelvis|hip|arm|forearm|hand|glove|leg|thigh|shin|calf|knee|foot|boot|uniform|jacket|body|helmet|sword|blade/;

console.log('reading', basename(inPath));
/* Accept .glb as well as .obj so the whole chain speaks one format: an FBX from Mixamo or a
 * .blend export becomes a GLB (scripts/fbx2glb.mjs, or Blender), and that GLB feeds straight
 * in here without a detour through OBJ. Both are read by the game's own loaders, so whatever
 * bakes correctly here is by construction what the renderer will see. */
const parsed = /\.glb$/i.test(inPath)
  ? RoninGLB.parse((b => b.buffer.slice(b.byteOffset, b.byteOffset + b.length))(readFileSync(inPath)))
  : RoninOBJ.parse(readFileSync(inPath, 'utf8'));
let meshes = parsed.meshes.filter(m => !PROP_RE.test(m.name));
console.log(`parsed: ${meshes.length} parts · ${meshes.reduce((s,m)=>s+m.count/3,0)|0} tris`);

/* ── optional seeded remodel ──────────────────────────────────────────────────────────────
 * Distort the body BEFORE segmenting and skinning, so the anatomy split and the bone weights
 * both describe the shape that actually ships. Morphing afterwards would weight a body that no
 * longer exists, and the elbows would bend around the wrong places.
 *
 * The seed IS the identity: `--morph kappa-drift` always yields the same creature, so one
 * source body can fill several archetype slots as distinct fighters, reproducibly, and a kept
 * variant needs no archiving beyond its name.
 *
 * ⚠ Distortion changes the shape, not the ownership. A morphed copyrighted model is still a
 * derivative work — run this on geometry you own or that is clearly licensed. */
const sflag = (n) => { const i = argv.indexOf('--' + n); return i > 0 ? argv[i + 1] : null; };
const morphSlug = sflag('morph');
const opList = sflag('ops');
if (morphSlug || opList) {
  const amt = flag('amt', 0.55);
  // `--ops` states the character outright; `--morph <slug>` draws it from the slug's hash.
  // The archetypes have defined identities (kappa is squat and shelled, doomer lanky and
  // hooded, prizm crystalline), so those are authored with --ops rather than hunted for by
  // trying slugs until one happens to land.
  const m = opList
    ? { seed: RoninMorph.hashStr(morphSlug || opList), ops: opList.split(',').map(o => ({ op: o.trim(), amt })) }
    : RoninMorph.fromSlug(morphSlug, amt);
  const unknown = m.ops.filter(o => !RoninMorph.OP_NAMES.includes(o.op)).map(o => o.op);
  if (unknown.length) { console.error(`unknown morph op(s): ${unknown.join(', ')}\nhave: ${RoninMorph.OP_NAMES.join(', ')}`); process.exit(1); }
  meshes = meshes.map(x => ({ ...x, verts: RoninMorph.apply(x.verts, m) }));
  console.log(`morphed ${morphSlug ? '"' + morphSlug + '" ' : ''}→ seed ${m.seed} · ${m.ops.map(o => o.op + '@' + o.amt.toFixed(2)).join(' + ')}`);
}

if (DETAIL > 0) {
  let lo = 1e9, hi = -1e9;
  for (const m of meshes) for (let i = 1; i < m.verts.length; i += 6) { if (m.verts[i] < lo) lo = m.verts[i]; if (m.verts[i] > hi) hi = m.verts[i]; }
  GRID = Math.max(1e-6, (hi - lo) * DETAIL / 100);
  console.log(`detail ${DETAIL}% of ${(hi - lo).toFixed(2)} height → grid ${GRID.toFixed(4)}`);
}

// ── decimate: cluster vertices onto a grid, drop triangles that collapse ──
function decimate(verts, cell) {
  const rep = new Map(), out = [];
  const key = (x,y,z) => `${Math.round(x/cell)},${Math.round(y/cell)},${Math.round(z/cell)}`;
  for (let i = 0; i < verts.length; i += 18) {
    const P = [];
    for (let k = 0; k < 3; k++) { const o = i + k*6, x = verts[o], y = verts[o+1], z = verts[o+2], kk = key(x,y,z);
      let r = rep.get(kk); if (!r) { r = [x,y,z]; rep.set(kk, r); } P.push(r); }
    if (P[0] === P[1] || P[1] === P[2] || P[0] === P[2]) continue;
    const ux=P[1][0]-P[0][0], uy=P[1][1]-P[0][1], uz=P[1][2]-P[0][2];
    const vx=P[2][0]-P[0][0], vy=P[2][1]-P[0][1], vz=P[2][2]-P[0][2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const L=Math.hypot(nx,ny,nz); if (L < 1e-12) continue; nx/=L; ny/=L; nz/=L;
    for (const p of P) out.push(p[0],p[1],p[2],nx,ny,nz);
  }
  return new Float32Array(out);
}

// ── anatomical auto-segmentation for unified meshes ──
// Classifies each triangle by its centroid in normalised body space (y: 0 feet → 1 crown,
// x: lateral, z: front/back) into the joint names the rig understands.
function segment(all) {
  const lo=[1e9,1e9,1e9], hi=[-1e9,-1e9,-1e9];
  for (let i=0;i<all.length;i+=6) for(let c=0;c<3;c++){ const v=all[i+c]; if(v<lo[c])lo[c]=v; if(v>hi[c])hi[c]=v; }
  const sx=(hi[0]-lo[0])||1, sy=(hi[1]-lo[1])||1, cxm=(lo[0]+hi[0])/2;
  const buckets = {};
  const push = (n, tri) => { (buckets[n] = buckets[n] || []).push(...tri); };
  for (let i=0;i<all.length;i+=18) {
    const tri = all.subarray(i, i+18);
    const cy = ((all[i+1]+all[i+7]+all[i+13])/3 - lo[1]) / sy;         // 0 feet → 1 head
    const cx = ((all[i]+all[i+6]+all[i+12])/3 - cxm) / sx;             // -0.5 .. 0.5 lateral
    const ax = Math.abs(cx), side = cx >= 0 ? 'f' : 'b';               // rig uses front/back for the two sides
    let name;
    if (cy > 0.86) name = 'head';
    else if (ax > 0.17) {                                              // out past the torso → an arm
      name = (ax > 0.33 ? 'hand_' : ax > 0.25 ? 'forearm_' : 'arm_') + side + (ax <= 0.25 ? '_upper' : '');
    }
    else if (cy > 0.52) name = 'chest';
    else if (cy > 0.44) name = 'pelvis';
    else if (cy > 0.22) name = 'thigh_' + side;
    else if (cy > 0.06) name = 'shin_' + side;
    else name = 'foot_' + side;
    push(name, tri);
  }
  return Object.entries(buckets).filter(([,v]) => v.length >= 18).map(([name, v]) => ({ name, verts: new Float32Array(v) }));
}

const named = meshes.filter(m => JOINT_RE.test(m.name)).length;
const doSeg = forceSeg || named < 3;
if (doSeg) {
  console.log(`only ${named} joint-named parts → auto-segmenting into anatomy`);
  let total = 0; for (const m of meshes) total += m.verts.length;
  const all = new Float32Array(total); let o = 0; for (const m of meshes) { all.set(m.verts, o); o += m.verts.length; }
  meshes = segment(all);
  console.log('segmented into:', meshes.map(m => m.name).join(', '));
} else console.log(`${named} joint-named parts found → keeping the author's structure`);

// ── decimate each part, scale, write ──
const L = ['# upperdeckripmaster3030 — baked fighter: ' + basename(outPath),
           '# generated by scripts/bake-fighter.mjs'];
let vBase = 1, nBase = 1, keptTris = 0;
const decimated = [];
for (const m of meshes) {
  const d = decimate(m.verts, GRID);
  if (!d.length) continue;
  keptTris += d.length / 18; decimated.push({ name: m.name, verts: d });
  L.push('o ' + m.name);
  for (let i=0;i<d.length;i+=6) L.push(`v ${(d[i]*SCALE).toFixed(5)} ${(d[i+1]*SCALE).toFixed(5)} ${(d[i+2]*SCALE).toFixed(5)}`);
  for (let i=0;i<d.length;i+=6) L.push(`vn ${d[i+3].toFixed(4)} ${d[i+4].toFixed(4)} ${d[i+5].toFixed(4)}`);
  const n = d.length/6;
  for (let t=0;t<n;t+=3) L.push(`f ${vBase+t}//${nBase+t} ${vBase+t+1}//${nBase+t+1} ${vBase+t+2}//${nBase+t+2}`);
  vBase += n; nBase += n;
}
const text = L.join('\n') + '\n';
writeFileSync(outPath, text);
const mb = n => (n/1048576).toFixed(2) + ' MB';
console.log(`wrote ${outPath} — ${meshes.length} parts · ${keptTris} tris · ${mb(Buffer.byteLength(text))} (source ${mb(Buffer.byteLength(readFileSync(inPath)))})`);

/* ── SKINNING BAKE ──────────────────────────────────────────────────────────────
 * The blocker for real skinned animation was that these meshes carry no rig. So we build one:
 * a canonical humanoid bind skeleton is fitted to the mesh's own bounding box, then every vertex
 * is weighted against the nearest bone SEGMENTS by inverse-distance falloff (the same idea as
 * Blender's automatic weights). Vertices near a joint get blended influence from both bones,
 * which is exactly what makes an elbow bend smoothly instead of hinging open.
 *
 * Emits a .skn binary: [pos3, norm3, idx4, wgt4] per vertex — 14 floats, stride 56 bytes, which
 * is exactly the stride js/ronin3d.js drawSkinned() binds. Run with --skin <out.skn>.
 */
export function bakeSkin(meshes, outFile) {
  // bones in NORMALISED body space (x lateral -0.5..0.5, y 0 feet → 1 crown, z depth)
  // index order must match JOINT_ORDER consumed by the renderer.
  /* [name, segment start, segment end, influence radius, side]
   * The radius gives each bone COMPACT SUPPORT — weight falls to exactly zero at the edge
   * instead of merely getting small. The first version used 1/d^4 over the four nearest bones
   * with no cutoff, so every vertex was partly owned by four bones no matter how far away they
   * were; a shoulder took chest + both arms at once and the mesh smeared into a soft mass the
   * moment anything moved. Thin limbs get a tight radius, the torso a wide one.
   * `side` is +1 for the front-side limbs and -1 for the back-side ones (the rig calls the two
   * sides front/back); 0 is central. It exists to stop one arm's bone reaching across the body
   * and dragging the other arm's vertices with it. */
  const CANON = [
    ['pelvis',  [0, 0.50, 0], [0, 0.62, 0],       0.13,  0],
    ['chest',   [0, 0.62, 0], [0, 0.84, 0],       0.15,  0],
    ['head',    [0, 0.84, 0], [0, 0.97, 0],       0.11,  0],
    ['armF0',   [ 0.10, 0.80, 0], [ 0.26, 0.79, 0], 0.075,  1],
    ['armF1',   [ 0.26, 0.79, 0], [ 0.40, 0.78, 0], 0.065,  1],
    ['armB0',   [-0.10, 0.80, 0], [-0.26, 0.79, 0], 0.075, -1],
    ['armB1',   [-0.26, 0.79, 0], [-0.40, 0.78, 0], 0.065, -1],
    ['legF0',   [ 0.07, 0.48, 0], [ 0.07, 0.26, 0], 0.090,  1],
    ['legF1',   [ 0.07, 0.26, 0], [ 0.07, 0.04, 0], 0.080,  1],
    ['legB0',   [-0.07, 0.48, 0], [-0.07, 0.26, 0], 0.090, -1],
    ['legB1',   [-0.07, 0.26, 0], [-0.07, 0.04, 0], 0.080, -1],
  ];
  let total = 0; for (const m of meshes) total += m.verts.length;
  const all = new Float32Array(total); { let o = 0; for (const m of meshes) { all.set(m.verts, o); o += m.verts.length; } }
  const lo=[1e9,1e9,1e9], hi=[-1e9,-1e9,-1e9];
  for (let i=0;i<all.length;i+=6) for(let c=0;c<3;c++){ const v=all[i+c]; if(v<lo[c])lo[c]=v; if(v>hi[c])hi[c]=v; }
  const sx=(hi[0]-lo[0])||1, sy=(hi[1]-lo[1])||1, cxm=(lo[0]+hi[0])/2;

  /* ── FIT THE SKELETON TO THE MESH'S OWN ANATOMY ────────────────────────────────────────────
   * ⚑ THIS IS THE FIX FOR THE TORN ARMS, and the diagnosis is the useful part.
   *
   * CANON above puts the shoulders at y 0.80 of the BOUNDING BOX, which is a human proportion.
   * `oni.obj` is a true T-pose with shoulders at 0.79–0.83, so it skins cleanly: worst posed
   * edge-stretch 2.1–2.9x, not one triangle over 3x. `ronin.obj` is a big-headed toon — head 38%
   * of its height, shoulders at 0.62 — so the canonical arm bones landed INSIDE ITS SKULL. 17%
   * of its vertices ended up ~88% weighted to `chest` with a few percent on an arm, and swinging
   * the arms tore the mesh between the two claims: worst stretch 8.9–19.6x, 114–194 triangles
   * over 3x. In BIND pose every bone matrix is identity so the mesh reproduced exactly (1.000x
   * for all six) and nothing looked wrong until it moved — which is why this read as a weighting
   * bug for so long when it was a PROPORTION mismatch.
   *
   * So measure instead of assuming. In a T-pose the body is WIDEST WHERE THE ARMS ARE, so the
   * shoulder line is the y-slice with the greatest lateral extent in the upper body; the crotch
   * is the lowest slice whose centre line is occupied (below it there are two legs and a gap,
   * above it there is a pelvis). Everything else is placed proportionally between the measured
   * floor, crotch, shoulder and crown, and the influence radii scale with the limbs they serve.
   *
   * Falls back to CANON whenever the measurement is not convincing — an A-pose or a seated mesh
   * has no lateral peak to find, and a confidently wrong fit is worse than a known approximation.
   * `--bind canonical` forces the old table for comparison. */
  function fitBind() {
    const BANDS = 48, ext = new Float32Array(BANDS), centre = new Uint32Array(BANDS), pop = new Uint32Array(BANDS);
    for (let i = 0; i < all.length; i += 6) {
      const px = (all[i] - cxm) / sx, py = (all[i + 1] - lo[1]) / sy;
      let bi = Math.floor(py * BANDS); if (bi < 0) bi = 0; if (bi >= BANDS) bi = BANDS - 1;
      const ax = Math.abs(px);
      if (ax > ext[bi]) ext[bi] = ax;
      if (ax < 0.06) centre[bi]++;
      pop[bi]++;
    }
    let sB = -1, sMax = 0;
    for (let bi = Math.floor(BANDS * 0.5); bi < BANDS; bi++) if (ext[bi] > sMax) { sMax = ext[bi]; sB = bi; }
    const torso = [];
    for (let bi = Math.floor(BANDS * 0.45); bi < BANDS * 0.78; bi++) if (bi !== sB && pop[bi]) torso.push(ext[bi]);
    torso.sort((x, y) => x - y);
    const torsoW = torso.length ? torso[torso.length >> 1] : sMax;
    const armsOut = sB >= 0 && sMax > torsoW * 1.25;          // is there really a T-pose peak?
    if (!armsOut) { console.log('  bind: no lateral peak (not a T-pose?) — canonical proportions'); return CANON; }

    /* ⚑ FIND THE CROTCH BY SCANNING DOWN, NOT UP. The first version looked for the lowest band
     * whose centre line is occupied and walked upward — which finds the ANKLES on any mesh whose
     * feet sit near the centre line, so both meshes bottomed out on the clamp at 0.28 and the
     * whole lower body was mis-rigged. Measured: it made the already-good `oni` worse (3.8x →
     * 9.6x) while helping the toon, which is the signature of a fit that is right about the
     * shoulders and wrong about the hips.
     * The crotch is where the legs MERGE: coming down from the chest the centre line is solid,
     * and below the crotch it opens into a gap between two legs. So walk down from just under
     * the shoulder and stop at the first band where centre occupancy collapses. */
    const shoulderY = (sB + 0.5) / BANDS;
    let cB = -1;
    const solid = bi => pop[bi] ? centre[bi] / pop[bi] : 0;
    let ref = 0, nref = 0;
    for (let bi = Math.floor(BANDS * 0.45); bi < sB; bi++) { ref += solid(bi); nref++; }
    ref = nref ? ref / nref : 0.3;                       // how solid the torso's centre line is
    for (let bi = Math.min(sB - 1, Math.floor(BANDS * 0.62)); bi > BANDS * 0.10; bi--) {
      if (solid(bi) < ref * 0.45) { cB = bi + 1; break; }   // the band above the gap
    }
    const crotchY = Math.max(0.22, Math.min(shoulderY - 0.14, cB >= 0 ? (cB + 0.5) / BANDS : 0.48));
    const reach = sMax * 0.98, crown = 1.0, ankle = 0.04;
    const halfT = Math.max(0.06, Math.min(reach * 0.45, torsoW));
    const legX = Math.max(0.045, halfT * 0.45);
    const neckY = shoulderY + (crown - shoulderY) * 0.12;
    const pelvisTop = crotchY + (shoulderY - crotchY) * 0.30;
    const knee = (crotchY + ankle) / 2, elbow = halfT + (reach - halfT) * 0.5;
    const armR = Math.max(0.045, (reach - halfT) * 0.26);
    const legR = Math.max(0.055, (crotchY - ankle) * 0.24);
    console.log(`  bind: shoulder y=${shoulderY.toFixed(3)} · crotch y=${crotchY.toFixed(3)} · reach ${reach.toFixed(3)} · torso half ${halfT.toFixed(3)}`);
    if (Math.abs(shoulderY - 0.80) > 0.08)
      console.log('  ⛑ non-human proportions — this is the mesh the fixed table used to tear');
    return [
      ['pelvis',  [0, crotchY, 0],   [0, pelvisTop, 0],    Math.max(0.10, (shoulderY - crotchY) * 0.42), 0],
      ['chest',   [0, pelvisTop, 0], [0, shoulderY, 0],    Math.max(0.11, (shoulderY - crotchY) * 0.50), 0],
      ['head',    [0, neckY, 0],     [0, crown - 0.03, 0], Math.max(0.09, (crown - neckY) * 0.62),       0],
      ['armF0',   [ halfT, shoulderY, 0], [ elbow, shoulderY, 0], armR,        1],
      ['armF1',   [ elbow, shoulderY, 0], [ reach, shoulderY, 0], armR * 0.87, 1],
      ['armB0',   [-halfT, shoulderY, 0], [-elbow, shoulderY, 0], armR,       -1],
      ['armB1',   [-elbow, shoulderY, 0], [-reach, shoulderY, 0], armR * 0.87,-1],
      ['legF0',   [ legX, crotchY, 0], [ legX, knee, 0],  legR,         1],
      ['legF1',   [ legX, knee, 0],    [ legX, ankle, 0], legR * 0.89,  1],
      ['legB0',   [-legX, crotchY, 0], [-legX, knee, 0],  legR,        -1],
      ['legB1',   [-legX, knee, 0],    [-legX, ankle, 0], legR * 0.89, -1],
    ];
  }
  const B = (() => { const i = argv.indexOf('--bind'); return i > 0 && argv[i + 1] === 'canonical'; })()
    ? CANON : fitBind();
  // squared distance from a normalised point to a bone segment
  /* Distance to a bone segment, in fractions of BODY HEIGHT.
   * The normalised space is anisotropic on purpose — x and z are divided by the body's width so
   * the bone table lines up with a T-pose, y by its height — so raw distances in it are not
   * comparable between axes (ronin.obj is 13.64 wide and 9.83 tall, a 1.39 aspect). Scaling each
   * axis back to world units and then dividing by height makes one radius mean one thing. */
  const AX = sx / sy;                                       // x,z were divided by width, y by height
  const segD = (p, a, b) => { const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
    const wx=p[0]-a[0], wy=p[1]-a[1], wz=p[2]-a[2];
    const uu=ux*ux+uy*uy+uz*uz || 1e-9; let t=(wx*ux+wy*uy+wz*uz)/uu; t=t<0?0:t>1?1:t;
    const dx=(wx-ux*t)*AX, dy=wy-uy*t, dz=(wz-uz*t)*AX; return dx*dx+dy*dy+dz*dz; };
  const n = all.length/6;
  const out = new Float32Array(n*14);
  /* AUTO-FIT the influence radius.
   * The right radius depends on the mesh's proportions, and a hand-picked constant that suits
   * one body starves another: the first fixed table left 32.6% of ronin's vertices outside every
   * bone, snapped rigidly to their nearest one, which is what produced the stretched spikes —
   * a triangle with two corners welded to bones that then move apart. Rather than guess per
   * model, widen the radii until nearly every vertex is properly blended. */
  let K = 1, fallback = 0, infl = 0;
  for (let attempt = 0; attempt < 9; attempt++) {
    fallback = 0; infl = 0;
    weigh(K);
    if (fallback / n <= 0.02) break;
    K *= 1.3;
  }
  console.log(`  weights: radius x${K.toFixed(2)} · ${(100*fallback/n).toFixed(1)}% rigid-snapped · ${(infl/n).toFixed(2)} influences/vertex`);

  function weigh(K) {
  for (let v=0; v<n; v++) {
    const i=v*6;
    const P=[ (all[i]-cxm)/sx, (all[i+1]-lo[1])/sy, (all[i+2]-(lo[2]+hi[2])/2)/sx ];
    const sc=[];
    let near=-1, nearD=1e9;
    for (let b=0;b<B.length;b++){
      const d=Math.sqrt(segD(P,B[b][1],B[b][2]));
      if (d < nearD) { nearD = d; near = b; }                       // remembered for the fallback
      const side=B[b][4];
      // a vertex clearly on one side of the body is not this limb's business
      if (side && P[0]*side < -0.035) continue;
      const r=B[b][3]*K; if (d >= r) continue;                       // outside this bone's support
      const t = 1 - d/r;
      sc.push([b, t*t*t]);                                          // smooth to zero at the rim
    }
    sc.sort((a,b)=>b[1]-a[1]);
    let top=sc.slice(0,4); let sum=0; for(const t of top) sum+=t[1];
    /* Compact support means a vertex can fall outside every bone — a fingertip, a hat brim, a
     * cape. Those must ride their single nearest bone RIGIDLY rather than end up unweighted,
     * which would collapse them to the origin the first time the palette was applied. */
    if (!sum) { top=[[near,1]]; sum=1; fallback++; }
    infl += top.length;
    const o=v*14;
    out[o]=all[i]; out[o+1]=all[i+1]; out[o+2]=all[i+2];
    out[o+3]=all[i+3]; out[o+4]=all[i+4]; out[o+5]=all[i+5];
    for(let k=0;k<4;k++) out[o+6+k]  = top[k] ? top[k][0] : 0;          // bone indices
    for(let k=0;k<4;k++) out[o+10+k] = top[k] ? top[k][1]/sum : 0;      // normalised weights
  }
  }
  const head=Buffer.alloc(32);
  /* ⚑ VERSION 2 — THE BIND SKELETON SHIPS WITH THE MESH.
   * v1 wrote weights only and left the renderer to supply the skeleton from a hard-coded table,
   * which is fine exactly as long as every mesh has the same proportions. It does not: fitting
   * the bake to a toon's real shoulder line while `js/section9-skin.js` still posed it from the
   * canonical 0.80 would weight against one skeleton and pose with another. The skeleton belongs
   * to the body, so it goes in the file.
   *
   *   0..31    header (version 2)
   *   32..295  11 bones x 6 float32 = [startXYZ, endXYZ] — 264 bytes
   *   296..    vertex data, unchanged: 14 floats/vertex, stride 56
   *
   * The bones are written in the RENDERER's frame, which is this table x150: the bake works in
   * normalised body space (y 0 feet → 1 crown) and section9-skin.js works in px at H=150, so
   * canonical armF0 `[0.10, 0.80, 0]` is its `[15, 120, 0]`. No other transform. */
  const H_PX = 150;
  const bones = Buffer.alloc(B.length * 6 * 4);
  B.forEach((bn, i) => {
    for (let k = 0; k < 3; k++) bones.writeFloatLE(bn[1][k] * H_PX, (i * 6 + k) * 4);
    for (let k = 0; k < 3; k++) bones.writeFloatLE(bn[2][k] * H_PX, (i * 6 + 3 + k) * 4);
  });
  head.write('UR3SKIN0',0,'ascii'); head.writeUInt32LE(2,8); head.writeUInt32LE(n,12); head.writeUInt32LE(B.length,16);
  writeFileSync(outFile, Buffer.concat([head, bones, Buffer.from(out.buffer, out.byteOffset, out.byteLength)]));
  console.log(`wrote ${outFile} — ${n} skinned verts · ${B.length} bones · ${(32+bones.length+out.byteLength)/1048576|0}.${String(Math.round((32+bones.length+out.byteLength)%1048576/104858)).padStart(1,'0')} MB`);
  return B.map(b=>b[0]);
}
const skinOut = (()=>{ const i=argv.indexOf('--skin'); return i>0?argv[i+1]:null; })();
if (skinOut) { const order = bakeSkin(decimated, skinOut); console.log('bone order:', order.join(', ')); }

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
load('ronin-obj.js');
const { RoninOBJ } = shim.window;

const argv = process.argv.slice(2);
if (argv.length < 2) { console.error('usage: bake-fighter.mjs <in.obj> <out.obj> [--grid 0.01] [--segment] [--scale 1]'); process.exit(1); }
const inPath = argv[0], outPath = argv[1];
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i > 0 ? parseFloat(argv[i + 1]) : d; };
const GRID = flag('grid', 0.01), SCALE = flag('scale', 1);
const forceSeg = argv.includes('--segment');
const PROP_RE = /floor|ground|plane|backdrop|stage|pedestal|light|camera|helper/;
const JOINT_RE = /head|chest|torso|pelvis|hip|arm|forearm|hand|glove|leg|thigh|shin|calf|knee|foot|boot|uniform|jacket|body|helmet|sword|blade/;

console.log('reading', basename(inPath));
const parsed = RoninOBJ.parse(readFileSync(inPath, 'utf8'));
let meshes = parsed.meshes.filter(m => !PROP_RE.test(m.name));
console.log(`parsed: ${meshes.length} parts · ${meshes.reduce((s,m)=>s+m.count/3,0)|0} tris`);

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
for (const m of meshes) {
  const d = decimate(m.verts, GRID);
  if (!d.length) continue;
  keptTris += d.length / 18;
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

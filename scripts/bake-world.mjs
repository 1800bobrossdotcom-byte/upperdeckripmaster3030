#!/usr/bin/env node
/* upperdeckripmaster3030 — bake-world: turn a heavy scene OBJ into a shippable world.
 *
 * A raw architectural export is far too big for a web game (the street scene is 93 MB of text,
 * 661k triangles). This bakes it down to something a browser can fetch and draw:
 *
 *   1. drop micro-objects (interior clutter that never reads at play distance)
 *   2. vertex-cluster decimation on a spatial grid — snap-merge nearby vertices and discard the
 *      triangles that collapse. Keeps silhouettes, kills density.
 *   3. re-centre + scale to the game's world units, Y-up, ground at y=0
 *   4. emit a compact BINARY (.wld): Float32 interleaved pos3+norm3 — the engine's native vertex
 *      format, so it uploads with no per-frame parsing
 *   5. emit a COLLISION set: one AABB per surviving object, which is what the player actually
 *      collides against (cheap, and a city is boxes anyway)
 *
 *   node scripts/bake-world.mjs <in.obj> <out.wld> [--grid 0.02] [--minTris 40] [--scale 12]
 *
 * Only bake geometry you own or that is clearly licensed for commercial/NFT use.
 */
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';

const argv = process.argv.slice(2);
if (argv.length < 2) { console.error('usage: bake-world.mjs <in.obj> <out.wld> [--grid 0.02] [--minTris 40] [--scale 12]'); process.exit(1); }
const inPath = argv[0], outPath = argv[1];
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i > 0 ? parseFloat(argv[i + 1]) : d; };
const GRID = flag('grid', 0.02);        // cluster cell size, in source units
const MINTRIS = flag('minTris', 40);    // objects smaller than this are clutter
const SCALE = flag('scale', 12);        // final world size (longest horizontal axis)

console.log('reading', basename(inPath));
const text = readFileSync(inPath, 'utf8');

// ── parse: positions + per-object face lists (normals are recomputed after decimation) ──
const V = [];
const objs = [];
let cur = null;
for (const line of text.split('\n')) {
  if (line.charCodeAt(0) === 118 && line.charCodeAt(1) === 32) {           // 'v '
    const p = line.split(/\s+/); V.push(+p[1], +p[2], +p[3]);
  } else if ((line.charCodeAt(0) === 111 || line.charCodeAt(0) === 103) && line.charCodeAt(1) === 32) {
    cur = { name: line.slice(2).trim() || ('obj' + objs.length), tris: [] }; objs.push(cur);
  } else if (line.charCodeAt(0) === 102 && line.charCodeAt(1) === 32) {    // 'f '
    if (!cur) { cur = { name: 'obj0', tris: [] }; objs.push(cur); }
    const t = line.split(/\s+/), n = t.length - 1;
    const idx = [];
    for (let i = 1; i <= n; i++) { const s = t[i], c = s.indexOf('/');
      let vi = +(c < 0 ? s : s.slice(0, c)); idx.push(vi < 0 ? V.length / 3 + vi : vi - 1); }
    for (let i = 1; i < n - 1; i++) cur.tris.push(idx[0], idx[i], idx[i + 1]);
  }
}
const srcTris = objs.reduce((s, o) => s + o.tris.length / 3, 0);
console.log(`parsed: ${(V.length/3)|0} verts · ${srcTris} tris · ${objs.length} objects`);

// ── 1. drop micro-objects ──
const kept = objs.filter(o => o.tris.length / 3 >= MINTRIS);
console.log(`dropped ${objs.length - kept.length} micro-objects (<${MINTRIS} tris)`);

// ── source bounds → transform to world units, Y up, ground at 0, centred ──
let lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9];
for (const o of kept) for (const vi of o.tris) { for (let c = 0; c < 3; c++) { const x = V[vi*3+c]; if (x<lo[c])lo[c]=x; if(x>hi[c])hi[c]=x; } }
const span = Math.max(hi[0]-lo[0], hi[2]-lo[2]) || 1;
const K = SCALE / span;
const cx = (lo[0]+hi[0])/2, cz = (lo[2]+hi[2])/2, fy = lo[1];
const wx = i => (V[i*3] - cx) * K, wy = i => (V[i*3+1] - fy) * K, wz = i => (V[i*3+2] - cz) * K;

// ── 2. vertex-cluster decimation + 4. build the vertex buffer, 5. collision AABBs ──
const g = GRID * K;                                        // cell size in world units
const cellKey = (x,y,z) => `${Math.round(x/g)},${Math.round(y/g)},${Math.round(z/g)}`;
const out = [];                                            // interleaved pos3+norm3
const boxes = [];
let dropped = 0;
for (const o of kept) {
  const rep = new Map();                                   // cell → representative position
  const olo = [1e9,1e9,1e9], ohi = [-1e9,-1e9,-1e9];
  let objTris = 0;
  for (let t = 0; t < o.tris.length; t += 3) {
    const P = [];
    for (let k = 0; k < 3; k++) { const vi = o.tris[t+k];
      const x = wx(vi), y = wy(vi), z = wz(vi), key = cellKey(x,y,z);
      let r = rep.get(key); if (!r) { r = [x,y,z]; rep.set(key, r); }
      P.push(r); }
    if (P[0] === P[1] || P[1] === P[2] || P[0] === P[2]) { dropped++; continue; }   // collapsed
    const ux = P[1][0]-P[0][0], uy = P[1][1]-P[0][1], uz = P[1][2]-P[0][2];
    const vx2 = P[2][0]-P[0][0], vy2 = P[2][1]-P[0][1], vz2 = P[2][2]-P[0][2];
    let nx = uy*vz2-uz*vy2, ny = uz*vx2-ux*vz2, nz = ux*vy2-uy*vx2;
    const L = Math.hypot(nx,ny,nz); if (L < 1e-12) { dropped++; continue; }
    nx/=L; ny/=L; nz/=L;
    for (const p of P) { out.push(p[0],p[1],p[2],nx,ny,nz);
      for (let c=0;c<3;c++){ if(p[c]<olo[c])olo[c]=p[c]; if(p[c]>ohi[c])ohi[c]=p[c]; } }
    objTris++;
  }
  if (objTris > 0 && (ohi[1]-olo[1]) > 0.05) boxes.push({ name: o.name, lo: olo.map(n=>+n.toFixed(3)), hi: ohi.map(n=>+n.toFixed(3)) });
}
const tris = out.length / 18;
console.log(`decimated: ${tris} tris (${(100*tris/srcTris).toFixed(1)}% of source) · ${dropped} collapsed · ${boxes.length} collision boxes`);

// ── write: 32-byte header + f32 verts, then a sidecar JSON of collision boxes ──
const f32 = new Float32Array(out);
const head = Buffer.alloc(32);
head.write('UR3WORLD', 0, 'ascii'); head.writeUInt32LE(1, 8); head.writeUInt32LE(tris * 3, 12);
head.writeFloatLE(SCALE, 16);
writeFileSync(outPath, Buffer.concat([head, Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)]));
writeFileSync(outPath.replace(/\.wld$/, '') + '.cols.json', JSON.stringify({ scale: SCALE, boxes }));
const mb = n => (n/1048576).toFixed(1) + ' MB';
console.log(`wrote ${outPath} — ${mb(32 + f32.byteLength)} (source ${mb(Buffer.byteLength(text))})`);
console.log(`wrote ${outPath.replace(/\.wld$/,'')}.cols.json — ${boxes.length} AABBs`);

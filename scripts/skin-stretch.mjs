#!/usr/bin/env node
/* upperdeckripmaster3030 — measure how much a .skn tears when it is POSED.
 *
 *   npm run stretch                    # every models/*.skn
 *   npm run stretch -- models/oni.skn  # one
 *
 * WHY THIS EXISTS. The numbers everyone in this repo quotes about the arm shard — "worst
 * 2.1–2.9x on the good family, 8.9–19.6x on the bad one" — were measured once, by hand, and then
 * copied from comment to comment. There was no tool. So the fix for task #77 could be described
 * precisely and could not be CHECKED, which is the worst combination: a confident claim with no
 * way to falsify it.
 *
 * WHAT IT MEASURES. Linear-blend skinning moves each vertex by a weighted mix of its bones. When
 * two corners of a triangle are claimed by bones that then move apart, the edge between them
 * stretches — and that stretch is the tear, visible as a shard. So: take every edge, measure it
 * in bind pose, measure it again posed, and report the ratio.
 *
 * ⚑ BIND POSE MUST COME OUT AT EXACTLY 1.000x. Every bone matrix is identity there, so any
 *   deviation means the harness itself is wrong, not the mesh. It is checked first, every run,
 *   and a failure is reported rather than swallowed — a measuring tool that quietly mis-measures
 *   is worse than none.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';

const H = 150;
/* the canonical table, in the renderer's px frame — used for v1 files, which carry no skeleton */
const CANON = [
  [[0, 75, 0], [0, 93, 0]], [[0, 93, 0], [0, 126, 0]], [[0, 126, 0], [0, 145.5, 0]],
  [[15, 120, 0], [39, 118.5, 0]], [[39, 118.5, 0], [60, 117, 0]],
  [[-15, 120, 0], [-39, 118.5, 0]], [[-39, 118.5, 0], [-60, 117, 0]],
  [[10.5, 72, 0], [10.5, 39, 0]], [[10.5, 39, 0], [10.5, 6, 0]],
  [[-10.5, 72, 0], [-10.5, 39, 0]], [[-10.5, 39, 0], [-10.5, 6, 0]],
];

function readSkn(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 8) !== 'UR3SKIN0') throw new Error('bad magic');
  const ver = b.readUInt32LE(8), n = b.readUInt32LE(12);
  const vOff = ver >= 2 ? 32 + 11 * 6 * 4 : 32;
  let bind = CANON;
  if (ver >= 2) {
    bind = [];
    for (let i = 0; i < 11; i++) {
      const o = 32 + i * 24;
      bind.push([[b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8)],
                 [b.readFloatLE(o + 12), b.readFloatLE(o + 16), b.readFloatLE(o + 20)]]);
    }
  }
  const v = new Float32Array(n * 14);
  for (let i = 0; i < n * 14; i++) v[i] = b.readFloatLE(vOff + i * 4);
  return { ver, n, bind, v };
}

/* Rotate each bone about z by `ang`, hinged at its own start — a swing, which is what the arms
 * actually do and what tore them. Bones the caller does not name stay identity. */
function palette(bind, angles) {
  return bind.map(([s0, e0], i) => {
    const a = angles[i] || 0, c = Math.cos(a), si = Math.sin(a);
    // p -> R*(p - s0) + s0
    return { r: [c, -si, si, c], s: s0 };
  });
}
const apply = (m, p) => {
  const dx = p[0] - m.s[0], dy = p[1] - m.s[1];
  return [m.r[0] * dx + m.r[1] * dy + m.s[0], m.r[2] * dx + m.r[3] * dy + m.s[1], p[2]];
};

/* ⚑ THE MESH AND THE SKELETON LIVE IN DIFFERENT SPACES, and forgetting that is how this tool
 * first reported 1000x stretch on meshes that are known-good. The .skn stores vertices in the
 * MODEL's own units; the bind table is in the renderer's px frame at H=150. section9-skin.js
 * reconciles them inside palette() with `SC = H / sk.h` and `p -> SC*p - (0, SC*lo, 0)`, so this
 * has to do the same before it rotates anything — rotating a model-space point about a px-space
 * pivot throws it an enormous distance and every edge reads as torn. */
function measure(sk, angles) {
  const { n, v, bind } = sk, P = palette(bind, angles);
  let loY = 1e9, hiY = -1e9;
  for (let i = 0; i < n; i++) { const y = v[i * 14 + 1]; if (y < loY) loY = y; if (y > hiY) hiY = y; }
  const SC = H / ((hiY - loY) || 1);
  const N = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    N[i * 3] = v[i * 14] * SC; N[i * 3 + 1] = v[i * 14 + 1] * SC - SC * loY; N[i * 3 + 2] = v[i * 14 + 2] * SC;
  }
  const out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = i * 14, p = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 4; k++) {
      const w = v[o + 10 + k]; if (w <= 0) continue;
      const q = apply(P[v[o + 6 + k] | 0], p);
      x += q[0] * w; y += q[1] * w; z += q[2] * w;
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  // triangles are consecutive vertex triples, as the baker writes them
  let worst = 1, over3 = 0, over10 = 0, tris = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    let bad = 1;
    for (let e = 0; e < 3; e++) {
      const i = t + e, j = t + (e + 1) % 3;
      const b0 = Math.hypot(N[i * 3] - N[j * 3], N[i * 3 + 1] - N[j * 3 + 1], N[i * 3 + 2] - N[j * 3 + 2]);
      if (b0 < 1e-6) continue;
      const p0 = Math.hypot(out[i * 3] - out[j * 3], out[i * 3 + 1] - out[j * 3 + 1], out[i * 3 + 2] - out[j * 3 + 2]);
      const r = p0 / b0; if (r > bad) bad = r;
    }
    tris++;
    if (bad > worst) worst = bad;
    if (bad > 3) over3++;
    if (bad > 10) over10++;
  }
  return { worst, over3, over10, tris };
}

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const files = args.length ? args
  : readdirSync('models').filter(f => f.endsWith('.skn')).map(f => join('models', f));

console.log('posed edge-stretch — arms swung 55°, legs 35°\n');
let fail = 0;
for (const f of files) {
  let sk; try { sk = readSkn(f); } catch (e) { console.log(`${basename(f).padEnd(14)} unreadable: ${e.message}`); fail++; continue; }
  // sanity: identity palette must reproduce the mesh exactly
  const id = measure(sk, {});
  if (Math.abs(id.worst - 1) > 1e-4) { console.log(`${basename(f).padEnd(14)} HARNESS ERROR — bind pose ${id.worst.toFixed(4)}x, expected 1.0000`); fail++; continue; }
  const A = 55 * Math.PI / 180, L = 35 * Math.PI / 180;
  const r = measure(sk, { 3: A, 4: A * 1.4, 5: -A, 6: -A * 1.4, 7: L, 8: L * 1.3, 9: -L, 10: -L * 1.3 });
  const flag = r.worst > 3 ? '  ⛔ TEARS' : r.worst > 2.95 ? '  ⚠' : '  ✅';
  console.log(`${basename(f).padEnd(14)} v${sk.ver}  bind ${id.worst.toFixed(3)}x  posed worst ${r.worst.toFixed(1)}x` +
    `  ${r.over3} tris >3x  ${r.over10} >10x  (${r.tris} tris)${flag}`);
}
process.exit(fail ? 1 : 0);

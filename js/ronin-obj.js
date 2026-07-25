/* upperdeckripmaster3030 — NEON RONIN Wavefront OBJ part loader (RoninOBJ).
 *
 * The companion to ronin-glb.js for the far more common case: an artist exports OBJ straight out
 * of Blender / ZBrush / Maya. Same contract, same output shape — { meshes:[{name,verts,count,
 * bounds}] } of interleaved pos3+norm3 triangle soup — so a parsed OBJ feeds
 * Ronin3D.registerModel() exactly like a GLB, and rides the same rigid-part rig.
 *
 * Each `o` / `g` block becomes one named part, so objects called CHEST / ARM / THIGH / BOOT …
 * attach to the matching skeleton joint with no code change (see models/README.md).
 *
 *   RoninOBJ.parse(text) → { meshes:[…] }
 *   RoninOBJ.load(url)   → Promise<same>
 *
 * Handles: v / vn / f, negative (relative) indices, n-gon fan triangulation, quads, and
 * `f v//vn` / `f v/vt/vn` / `f v` forms. Missing normals are generated per face. Textures,
 * materials and smoothing groups are ignored — parts are shaded by the costume palette.
 */
window.RoninOBJ = (function () {

  function parse(text) {
    const V = [], N = [];                       // shared vertex/normal pools (OBJ indices are file-global)
    const parts = [];                           // { name, tris: number[] }
    let cur = null;
    const newPart = name => { cur = { name: (name || 'part' + parts.length).toLowerCase(), tris: [] }; parts.push(cur); return cur; };

    const lines = text.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (!line || line.charCodeAt(0) === 35) continue;                 // '#'
      // fast keyword dispatch on the first token
      const sp = line.indexOf(' '); if (sp < 0) continue;
      const key = line.slice(0, sp);
      if (key === 'v') { const p = line.slice(sp + 1).trim().split(/\s+/); V.push(+p[0], +p[1], +p[2]); }
      else if (key === 'vn') { const p = line.slice(sp + 1).trim().split(/\s+/); N.push(+p[0], +p[1], +p[2]); }
      else if (key === 'o' || key === 'g') newPart(line.slice(sp + 1).trim());
      else if (key === 'f') {
        if (!cur) newPart(null);
        const toks = line.slice(sp + 1).trim().split(/\s+/);
        const nv = toks.length; if (nv < 3) continue;
        // resolve each corner → [vertIdx, normIdx] (0-based; negative OBJ indices are relative to the end)
        const corner = [];
        for (let i = 0; i < nv; i++) {
          const t = toks[i], s1 = t.indexOf('/');
          let vi, ni = -1;
          if (s1 < 0) vi = +t;
          else { vi = +t.slice(0, s1);
            const s2 = t.indexOf('/', s1 + 1);
            if (s2 >= 0 && s2 + 1 < t.length) ni = +t.slice(s2 + 1); }
          vi = vi < 0 ? (V.length / 3) + vi : vi - 1;
          ni = ni === -1 ? -1 : (ni < 0 ? (N.length / 3) + ni : ni - 1);
          corner.push(vi, ni);
        }
        for (let i = 1; i < nv - 1; i++) {                              // fan-triangulate quads / n-gons
          cur.tris.push(corner[0], corner[1], corner[i * 2], corner[i * 2 + 1], corner[(i + 1) * 2], corner[(i + 1) * 2 + 1]);
        }
      }
    }

    const meshes = [];
    for (const p of parts) {
      const t = p.tris; if (!t.length) continue;
      const triCount = t.length / 6;                                    // 3 corners × (vi,ni)
      const verts = new Float32Array(triCount * 3 * 6);
      let o = 0;
      for (let i = 0; i < t.length; i += 6) {
        const vi = [t[i], t[i + 2], t[i + 4]], ni = [t[i + 1], t[i + 3], t[i + 5]];
        const px = [], py = [], pz = [];
        for (let k = 0; k < 3; k++) { const b = vi[k] * 3; px[k] = V[b]; py[k] = V[b + 1]; pz[k] = V[b + 2]; }
        let fx = 0, fy = 0, fz = 0;
        if (ni[0] < 0 || N.length === 0) {                              // no normals in file → face normal
          const ux = px[1] - px[0], uy = py[1] - py[0], uz = pz[1] - pz[0];
          const vx = px[2] - px[0], vy = py[2] - py[0], vz = pz[2] - pz[0];
          fx = uy * vz - uz * vy; fy = uz * vx - ux * vz; fz = ux * vy - uy * vx;
          const L = Math.hypot(fx, fy, fz) || 1; fx /= L; fy /= L; fz /= L;
        }
        for (let k = 0; k < 3; k++) {
          verts[o] = px[k]; verts[o + 1] = py[k]; verts[o + 2] = pz[k];
          if (ni[k] >= 0 && N.length) { const nb = ni[k] * 3; verts[o + 3] = N[nb]; verts[o + 4] = N[nb + 1]; verts[o + 5] = N[nb + 2]; }
          else { verts[o + 3] = fx; verts[o + 4] = fy; verts[o + 5] = fz; }
          o += 6;
        }
      }
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (let i = 0; i < verts.length; i += 6) for (let c = 0; c < 3; c++) { const x = verts[i + c]; if (x < lo[c]) lo[c] = x; if (x > hi[c]) hi[c] = x; }
      meshes.push({ name: p.name, verts, count: verts.length / 6, bounds: { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] } });
    }
    if (!meshes.length) throw new Error('no triangles found in OBJ');
    return { meshes, skinned: false, animated: false };
  }

  function load(url) { return fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url); return r.text(); }).then(parse); }

  return { parse, load };
})();

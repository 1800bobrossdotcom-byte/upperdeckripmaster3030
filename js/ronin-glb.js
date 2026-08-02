/* ripmaster3030studios — NEON RONIN glTF/GLB part loader (RoninGLB).
 *
 * Loads real modelled geometry into the 3D fighter renderer. This is the "rigid-part" pipeline
 * — the same approach the PS1-era 3D fighters used: a model is a set of STATIC part meshes that
 * get attached to the skeleton's joints, rather than one smooth-skinned mesh. That fits us
 * exactly, because ronin.js already computes a full IK skeleton every frame; the parts just ride
 * the joints we already have, so no combat/animation code changes.
 *
 * It also means static-mesh tooling is enough to author fighters: sculpt the parts in any DCC,
 * export OBJ/STL/PLY, run them through a converter (e.g. dave3d/meshconvert → GLB), drop the
 * files in models/ and register them. Skinned/animated glTF is deliberately NOT required — if a
 * file does contain skins or animations they're ignored, and the bind-pose geometry is used.
 *
 *   RoninGLB.parse(arrayBuffer) → { meshes: [{name, verts:Float32Array, count, bounds}] }
 *   RoninGLB.load(url)          → Promise<same>
 *
 * verts are interleaved [px,py,pz, nx,ny,nz] triangle soup (stride 24 bytes) — byte-for-byte the
 * format Ronin3D.mesh() already uploads, so a loaded part is drawable exactly like a built-in one.
 */
window.RoninGLB = (function () {
  const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

  function parseGLB(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a GLB (bad magic)');
    const ver = dv.getUint32(4, true); if (ver !== 2) throw new Error('unsupported glTF version ' + ver);
    let off = 12, json = null, bin = null;
    while (off + 8 <= buf.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), start = off + 8;
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, start, len)));
      else if (type === 0x004E4942) bin = { buf, start, len };
      off = start + len + (len % 4 ? 4 - (len % 4) : 0);          // chunks are 4-byte aligned
    }
    if (!json) throw new Error('GLB has no JSON chunk');
    return { json, bin };
  }

  // read an accessor out of the binary chunk (or an embedded/base64 buffer) as a plain array of numbers
  function readAccessor(json, bin, idx) {
    const acc = json.accessors[idx]; if (!acc) return null;
    const n = NCOMP[acc.type] || 1, out = new Float32Array(acc.count * n);
    if (acc.bufferView == null) return out;                        // sparse-only / zero-filled
    const bv = json.bufferViews[acc.bufferView];
    const Arr = CT[acc.componentType]; if (!Arr) throw new Error('bad componentType ' + acc.componentType);
    const base = bin.start + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = bv.byteStride || 0;                             // 0 = tightly packed
    const bpe = Arr.BYTES_PER_ELEMENT;
    if (!stride || stride === n * bpe) {
      const src = new Arr(bin.buf, base, acc.count * n);
      for (let i = 0; i < out.length; i++) out[i] = src[i];
    } else {                                                       // interleaved — walk element by element
      for (let e = 0; e < acc.count; e++) { const src = new Arr(bin.buf, base + e * stride, n);
        for (let c = 0; c < n; c++) out[e * n + c] = src[c]; }
    }
    return out;
  }
  function readIndices(json, bin, idx) {
    const acc = json.accessors[idx]; if (!acc) return null;
    const bv = json.bufferViews[acc.bufferView], Arr = CT[acc.componentType];
    const base = bin.start + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const src = new Arr(bin.buf, base, acc.count);
    const out = new Uint32Array(acc.count); for (let i = 0; i < acc.count; i++) out[i] = src[i];
    return out;
  }

  // node → world matrix (column-major), walking the scene graph so parts land where they were modelled
  function nodeMatrix(nd) {
    if (nd.matrix) return Float32Array.from(nd.matrix);
    const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1;
    const t = nd.translation || [0, 0, 0], r = nd.rotation || [0, 0, 0, 1], s = nd.scale || [1, 1, 1];
    const [x, y, z, w] = r;
    const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    m[0] = (1 - (yy + zz)) * s[0]; m[1] = (xy + wz) * s[0]; m[2] = (xz - wy) * s[0];
    m[4] = (xy - wz) * s[1]; m[5] = (1 - (xx + zz)) * s[1]; m[6] = (yz + wx) * s[1];
    m[8] = (xz + wy) * s[2]; m[9] = (yz - wx) * s[2]; m[10] = (1 - (xx + yy)) * s[2];
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; return m;
  }
  const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const xfP = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  const xfN = (m, x, y, z) => { const o = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
    const l = Math.hypot(o[0], o[1], o[2]) || 1; return [o[0] / l, o[1] / l, o[2] / l]; };

  // flatten one mesh primitive into interleaved pos3+norm3 triangle soup, baked through `world`
  function primVerts(json, bin, prim, world) {
    if (prim.mode != null && prim.mode !== 4) return null;          // triangles only
    const P = readAccessor(json, bin, prim.attributes.POSITION); if (!P) return null;
    const N = prim.attributes.NORMAL != null ? readAccessor(json, bin, prim.attributes.NORMAL) : null;
    const I = prim.indices != null ? readIndices(json, bin, prim.indices) : null;
    /* TEXCOORD_0 rides in a PARALLEL array, deliberately not interleaved into `verts`.
     * Ronin3D.mesh(), Section 9's skinning program and DFGL all upload `verts` as a stride-24
     * pos3+norm3 buffer; widening it would break every one of them at once for the sake of the
     * few models that carry a map. So a textured part gains `.uv` and everything else is
     * byte-for-byte what it was. */
    const T = prim.attributes.TEXCOORD_0 != null ? readAccessor(json, bin, prim.attributes.TEXCOORD_0) : null;
    const triN = I ? I.length : (P.length / 3);
    const out = new Float32Array(triN * 6);
    const uvOut = T ? new Float32Array(triN * 2) : null;
    for (let i = 0; i < triN; i += 3) {
      const i0 = I ? I[i] : i, i1 = I ? I[i + 1] : i + 1, i2 = I ? I[i + 2] : i + 2;
      const p = [xfP(world, P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]), xfP(world, P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]), xfP(world, P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2])];
      let nn;
      if (!N) {                                                     // no normals in the file → face normal
        const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
        const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
        let cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const l = Math.hypot(cx, cy, cz) || 1; nn = [[cx / l, cy / l, cz / l], [cx / l, cy / l, cz / l], [cx / l, cy / l, cz / l]];
      } else nn = [xfN(world, N[i0 * 3], N[i0 * 3 + 1], N[i0 * 3 + 2]), xfN(world, N[i1 * 3], N[i1 * 3 + 1], N[i1 * 3 + 2]), xfN(world, N[i2 * 3], N[i2 * 3 + 1], N[i2 * 3 + 2])];
      const src = [i0, i1, i2];
      for (let k = 0; k < 3; k++) { const b = (i + k) * 6;
        out[b] = p[k][0]; out[b + 1] = p[k][1]; out[b + 2] = p[k][2];
        out[b + 3] = nn[k][0]; out[b + 4] = nn[k][1]; out[b + 5] = nn[k][2];
        if (uvOut) { const u = (i + k) * 2, j = src[k] * 2; uvOut[u] = T[j]; uvOut[u + 1] = T[j + 1]; } }
    }
    return uvOut ? { verts: out, uv: uvOut } : out;
  }

  function bounds(v) { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < v.length; i += 6) for (let c = 0; c < 3; c++) { const x = v[i + c]; if (x < lo[c]) lo[c] = x; if (x > hi[c]) hi[c] = x; }
    return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] }; }

  /* Parse a .glb ArrayBuffer → { meshes:[{name, verts, count, bounds}] }.
   * Each glTF node with a mesh becomes one part, named after the node (falling back to the mesh
   * name), so an artist can author "torso", "arm_upper_L" … as separate objects and have them
   * come through as separately-attachable parts. */
  function parse(buf) {
    const { json, bin } = parseGLB(buf);
    if (!bin) throw new Error('GLB has no BIN chunk (external .bin not supported)');
    const meshes = [];
    const nodes = json.nodes || [];
    const walk = (ni, parent) => {
      const nd = nodes[ni]; if (!nd) return;
      const world = parent ? mul(parent, nodeMatrix(nd)) : nodeMatrix(nd);
      if (nd.mesh != null) {
        const m = json.meshes[nd.mesh], chunks = [];
        const uvChunks = [];
        for (const prim of (m.primitives || [])) {
          const r = primVerts(json, bin, prim, world);
          if (!r) continue;
          const v = r.verts || r;                                     // plain array when unmapped
          if (!v.length) continue;
          chunks.push(v); uvChunks.push(r.uv || null);
        }
        if (chunks.length) {
          let total = 0; for (const c of chunks) total += c.length;
          const verts = new Float32Array(total); let o = 0; for (const c of chunks) { verts.set(c, o); o += c.length; }
          /* A part is only treated as textured when EVERY primitive in it carries a map. A
           * partly-mapped part would otherwise sample garbage over the unmapped primitives,
           * which looks like a corrupt texture rather than a missing one. */
          let uv = null;
          if (uvChunks.length && uvChunks.every(u => u)) {
            uv = new Float32Array(total / 3); let uo = 0;
            for (const u of uvChunks) { uv.set(u, uo); uo += u.length; }
          }
          meshes.push({ name: (nd.name || m.name || ('part' + meshes.length)).toLowerCase(), verts, count: verts.length / 6, bounds: bounds(verts), ...(uv ? { uv } : {}) });
        }
      }
      for (const c of (nd.children || [])) walk(c, world);
    };
    const scene = json.scenes && json.scenes[json.scene || 0];
    const roots = scene && scene.nodes ? scene.nodes : nodes.map((_, i) => i);
    for (const r of roots) walk(r, null);
    if (!meshes.length) throw new Error('no triangle meshes found in GLB');
    return { meshes, skinned: !!(json.skins && json.skins.length), animated: !!(json.animations && json.animations.length) };
  }

  function load(url) { return fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url); return r.arrayBuffer(); }).then(parse); }

  return { parse, load, parseGLB };
})();

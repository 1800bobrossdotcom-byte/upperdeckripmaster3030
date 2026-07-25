/* upperdeckripmaster3030 — NEON RONIN mesh morphology (RoninMorph).
 *
 * A seeded, generative distortion pass over raw geometry. Feed it any mesh in the engine's
 * universal vertex format (interleaved pos3+norm3 triangle soup) plus a seed, and it returns a
 * NEW mesh — melted, twisted, shattered, voxelised, datamoshed, inflated, rippled. Same input +
 * same seed always yields the same output, so a seed is a stable identity.
 *
 * That determinism is the point: **a seed is a lens**. Key the seed off a card id and every card
 * renders its own permanent iteration of a fighter from one shared geometry source — which is
 * exactly the render-by-id model the token is built on.
 *
 * It operates on geometry, not on any particular source, so it works on the procedurally-built
 * fighters as well as on loaded GLB/OBJ parts.
 *
 * IMPORTANT — distortion is not a copyright wash. Running a recognisable character through this
 * produces a derivative work, which is still that character's. Use it on geometry you own: the
 * procedural fighters, or the artist's own models. That's also where it looks best, because the
 * operators are tuned against our own builds.
 *
 *   RoninMorph.apply(verts, { seed, ops:[…] }) → Float32Array (new mesh)
 *   RoninMorph.fromSlug(slug)                  → a deterministic op-stack for a card slug
 *   RoninMorph.OPS                             → the operator table
 */
window.RoninMorph = (function () {
  // ── deterministic RNG (mulberry32) + value noise ──────────────────────────────
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < (s || '').length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const h3 = (x, y, z, s) => { let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 0.017) * 43758.5453; return n - Math.floor(n); };
  function noise3(x, y, z, s) {                                   // smooth value noise
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const L = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => h3(ix + dx, iy + dy, iz + dz, s);
    return L(L(L(c(0,0,0), c(1,0,0), fx), L(c(0,1,0), c(1,1,0), fx), fy),
             L(L(c(0,0,1), c(1,0,1), fx), L(c(0,1,1), c(1,1,1), fx), fy), fz);
  }
  function fbm(x, y, z, s) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < 3; i++) { v += a * (noise3(x * f, y * f, z * f, s + i) * 2 - 1); f *= 2.03; a *= 0.5; } return v; }

  const bounds = v => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < v.length; i += 6) for (let c = 0; c < 3; c++) { const x = v[i + c]; if (x < lo[c]) lo[c] = x; if (x > hi[c]) hi[c] = x; }
    return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], mid: [(lo[0]+hi[0])/2, (lo[1]+hi[1])/2, (lo[2]+hi[2])/2] }; };

  // recompute flat face normals after any positional edit, so lighting stays correct
  function reface(v) {
    for (let i = 0; i < v.length; i += 18) {
      const ax = v[i], ay = v[i+1], az = v[i+2], bx = v[i+6], by = v[i+7], bz = v[i+8], cx = v[i+12], cy = v[i+13], cz = v[i+14];
      const ux = bx-ax, uy = by-ay, uz = bz-az, wx = cx-ax, wy = cy-ay, wz = cz-az;
      let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
      const L = Math.hypot(nx, ny, nz);
      if (L < 1e-9) continue;                                     // degenerate (e.g. voxel-snapped flat) — keep the old normal
      nx /= L; ny /= L; nz /= L;
      for (let k = 0; k < 3; k++) { v[i + k*6 + 3] = nx; v[i + k*6 + 4] = ny; v[i + k*6 + 5] = nz; }
    }
    return v;
  }

  /* Operators. Each takes (verts, amt 0..1, rand, B=bounds) and mutates positions in place.
   * They're written to be composable — stack two or three for a genuinely new silhouette. */
  const OPS = {
    // organic melt: fbm displacement along the surface normal
    melt(v, amt, rnd, B) { const s = rnd() * 1000, k = B.size[1] * 0.16 * amt, f = 2.2 / (B.size[1] || 1);
      for (let i = 0; i < v.length; i += 6) { const d = fbm(v[i]*f, v[i+1]*f, v[i+2]*f, s) * k;
        v[i] += v[i+3]*d; v[i+1] += v[i+4]*d; v[i+2] += v[i+5]*d; } },
    // twist around the vertical axis, proportional to height
    twist(v, amt, rnd, B) { const turns = (rnd() * 2 - 1) * amt * 2.4;
      for (let i = 0; i < v.length; i += 6) { const t = (v[i+1] - B.lo[1]) / (B.size[1] || 1), a = t * turns;
        const c = Math.cos(a), s = Math.sin(a), x = v[i] - B.mid[0], z = v[i+2] - B.mid[2];
        v[i] = B.mid[0] + x*c - z*s; v[i+2] = B.mid[2] + x*s + z*c; } },
    // shatter: push each triangle out along its own normal, opening seams
    shatter(v, amt, rnd, B) { const k = B.size[1] * 0.10 * amt;
      for (let i = 0; i < v.length; i += 18) { const d = (rnd() * 0.6 + 0.4) * k, nx = v[i+3], ny = v[i+4], nz = v[i+5];
        for (let j = 0; j < 3; j++) { v[i + j*6] += nx*d; v[i + j*6 + 1] += ny*d; v[i + j*6 + 2] += nz*d; } } },
    // voxelise: snap positions to a lattice — a chunky, low-res, blocky read
    voxel(v, amt, rnd, B) { const g = Math.max(0.004, B.size[1] * (0.012 + amt * 0.06));
      for (let i = 0; i < v.length; i += 6) for (let c = 0; c < 3; c++) v[i+c] = Math.round(v[i+c] / g) * g; },
    // datamosh: random horizontal slices slip sideways, like a corrupted frame
    glitch(v, amt, rnd, B) { const bands = 14, slip = B.size[0] * 0.5 * amt, off = [];
      for (let b = 0; b < bands; b++) off.push(rnd() < 0.45 ? (rnd() * 2 - 1) * slip : 0);
      for (let i = 0; i < v.length; i += 6) { const t = (v[i+1] - B.lo[1]) / (B.size[1] || 1);
        v[i] += off[Math.min(bands - 1, Math.max(0, Math.floor(t * bands)))]; } },
    // inflate / deflate along normals — puffed-up cartoon or shrink-wrapped
    inflate(v, amt, rnd, B) { const d = (rnd() * 2 - 1) * amt * B.size[1] * 0.05;
      for (let i = 0; i < v.length; i += 6) { v[i] += v[i+3]*d; v[i+1] += v[i+4]*d; v[i+2] += v[i+5]*d; } },
    // vertical ripple — a standing wave through the body
    ripple(v, amt, rnd, B) { const freq = 4 + rnd() * 10, k = B.size[0] * 0.13 * amt, ph = rnd() * 6.28;
      for (let i = 0; i < v.length; i += 6) { const t = (v[i+1] - B.lo[1]) / (B.size[1] || 1);
        v[i] += Math.sin(t * freq + ph) * k; v[i+2] += Math.cos(t * freq + ph) * k * 0.6; } },
    // taper: squeeze or flare with height — changes proportion, not just surface
    taper(v, amt, rnd, B) { const top = 1 + (rnd() * 2 - 1) * amt * 0.8;
      for (let i = 0; i < v.length; i += 6) { const t = (v[i+1] - B.lo[1]) / (B.size[1] || 1), s = 1 + (top - 1) * t;
        v[i] = B.mid[0] + (v[i] - B.mid[0]) * s; v[i+2] = B.mid[2] + (v[i+2] - B.mid[2]) * s; } },
    // stretch the whole form on one axis — lanky or squat
    stretch(v, amt, rnd, B) { const sy = 1 + (rnd() * 2 - 1) * amt * 0.5, sx = 1 + (rnd() * 2 - 1) * amt * 0.35;
      for (let i = 0; i < v.length; i += 6) { v[i] = B.mid[0] + (v[i]-B.mid[0])*sx; v[i+1] = B.lo[1] + (v[i+1]-B.lo[1])*sy; v[i+2] = B.mid[2] + (v[i+2]-B.mid[2])*sx; } },
    // spike: pull a sparse subset of triangles into shards
    spike(v, amt, rnd, B) { const k = B.size[1] * 0.30 * amt;
      for (let i = 0; i < v.length; i += 18) { if (rnd() > 0.14) continue; const d = k * (0.5 + rnd());
        const j = (Math.floor(rnd()*3)) * 6; v[i+j] += v[i+3]*d; v[i+j+1] += v[i+4]*d; v[i+j+2] += v[i+5]*d; } },
    // ── wilder ─────────────────────────────────────────────────────────────────
    // swirl: a vortex that falls off with distance from the axis — smeared, whipped
    swirl(v, amt, rnd, B) { const k = amt * 5 * (rnd() < 0.5 ? -1 : 1), R = Math.max(1e-6, Math.max(B.size[0], B.size[2]) * 0.5);
      for (let i = 0; i < v.length; i += 6) { const x = v[i]-B.mid[0], z = v[i+2]-B.mid[2], d = Math.hypot(x, z);
        const a = k * Math.exp(-(d/R)*(d/R)); const c = Math.cos(a), s = Math.sin(a);
        v[i] = B.mid[0] + x*c - z*s; v[i+2] = B.mid[2] + x*s + z*c; } },
    // fracture: rotate every triangle about its own centroid — a shattered, cubist read
    fracture(v, amt, rnd, B) {
      for (let i = 0; i < v.length; i += 18) {
        const cx = (v[i]+v[i+6]+v[i+12])/3, cy = (v[i+1]+v[i+7]+v[i+13])/3, cz = (v[i+2]+v[i+8]+v[i+14])/3;
        const a = (rnd()*2-1)*amt*1.6, c = Math.cos(a), s = Math.sin(a);
        const b = (rnd()*2-1)*amt*1.6, cb = Math.cos(b), sb = Math.sin(b);
        for (let k = 0; k < 3; k++) { const o = i + k*6;
          let x = v[o]-cx, y = v[o+1]-cy, z = v[o+2]-cz;
          let x1 = x*c - y*s, y1 = x*s + y*c;                      // roll
          let z1 = z*cb - x1*sb, x2 = z*sb + x1*cb;                // yaw
          v[o] = cx + x2; v[o+1] = cy + y1; v[o+2] = cz + z1; } } },
    // bulge: a spherical blow-out from a random interior point — a growth / tumour
    bulge(v, amt, rnd, B) { const px = B.mid[0]+(rnd()*2-1)*B.size[0]*0.3, py = B.lo[1]+rnd()*B.size[1], pz = B.mid[2]+(rnd()*2-1)*B.size[2]*0.3;
      const R = B.size[1]*(0.18+rnd()*0.22), k = B.size[1]*0.22*amt;
      for (let i = 0; i < v.length; i += 6) { const dx = v[i]-px, dy = v[i+1]-py, dz = v[i+2]-pz, d = Math.hypot(dx,dy,dz)||1e-6;
        const w = Math.exp(-(d/R)*(d/R)) * k; v[i] += dx/d*w; v[i+1] += dy/d*w; v[i+2] += dz/d*w; } },
    // static: raw per-vertex noise — torn, corrupted, deliberately ugly
    static(v, amt, rnd, B) { const k = B.size[1] * 0.035 * amt;
      for (let i = 0; i < v.length; i += 6) { v[i] += (rnd()*2-1)*k; v[i+1] += (rnd()*2-1)*k; v[i+2] += (rnd()*2-1)*k; } },
    // kaleido: fold the form through mirrored angular wedges — symmetric and alien
    kaleido(v, amt, rnd, B) { const seg = 3 + Math.floor(rnd()*5), w = Math.PI*2/seg, blend = amt;
      for (let i = 0; i < v.length; i += 6) { const x = v[i]-B.mid[0], z = v[i+2]-B.mid[2];
        const r = Math.hypot(x, z); let a = Math.atan2(z, x);
        let fa = ((a % w) + w) % w; if (fa > w/2) fa = w - fa;      // mirror inside the wedge
        const na = a + (fa - (((a % w) + w) % w)) * blend;
        v[i] = B.mid[0] + Math.cos(na)*r; v[i+2] = B.mid[2] + Math.sin(na)*r; } },
    // sag: gravity droop that increases with height — a body losing its structure
    sag(v, amt, rnd, B) { const k = B.size[1]*0.28*amt;
      for (let i = 0; i < v.length; i += 6) { const t = (v[i+1]-B.lo[1])/(B.size[1]||1);
        const rad = Math.hypot(v[i]-B.mid[0], v[i+2]-B.mid[2]) / (Math.max(B.size[0],B.size[2])*0.5 || 1);
        v[i+1] -= t*t*rad*k; } },
  };
  const OP_NAMES = Object.keys(OPS);

  /* Apply an op-stack to a mesh. Returns a NEW Float32Array; the input is untouched. */
  function apply(verts, opt) {
    opt = opt || {};
    const out = new Float32Array(verts);                          // copy
    const seed = typeof opt.seed === 'string' ? hashStr(opt.seed) : (opt.seed >>> 0 || 1);
    const rnd = rng(seed);
    const ops = opt.ops && opt.ops.length ? opt.ops : [{ op: 'melt', amt: 0.5 }];
    for (const o of ops) { const fn = OPS[o.op]; if (!fn) continue;
      fn(out, Math.max(0, Math.min(1, o.amt == null ? 0.5 : o.amt)), rnd, bounds(out)); }
    return reface(out);
  }

  /* Deterministic op-stack for a card slug — the same slug always yields the same iteration,
   * which is what makes this usable as a per-card lens. */
  function fromSlug(slug, intensity) {
    const seed = hashStr(slug || 'ur3030'), rnd = rng(seed);
    const n = 2 + Math.floor(rnd() * 2);                           // 2–3 stacked operators
    const pool = OP_NAMES.slice(), ops = [];
    for (let i = 0; i < n && pool.length; i++) {
      const pick = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      ops.push({ op: pick, amt: (0.3 + rnd() * 0.7) * (intensity == null ? 1 : intensity) });
    }
    return { seed, ops };
  }

  return { apply, fromSlug, OPS, OP_NAMES, hashStr, bounds };
})();

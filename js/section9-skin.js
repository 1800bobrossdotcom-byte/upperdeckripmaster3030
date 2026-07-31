/* upperdeckripmaster3030 — Section 9 skinned operatives (S9Skin).
 *
 * NEON RONIN's fighters are real skinned meshes: `models/<arch>.skn` is an auto-skinned body
 * (32-byte header, then 14 floats per vertex — pos3 + norm3 + boneIdx4 + boneWgt4, stride 56)
 * over an 11-bone humanoid rig baked by scripts/bake-fighter.mjs. Section 9 renders its bots
 * from oriented boxes. This module is the bridge: it loads those meshes, poses the same 11 bones
 * for a SHOOTER instead of a duel, and hands the renderer a joint palette.
 *
 *   S9Skin.CAST                    the archetypes Section 9 uses, in assignment order
 *   S9Skin.archFor(i)              deterministic archetype for bot i
 *   S9Skin.need(n)                 the first n archetypes — load only what is in play
 *   S9Skin.load(names, onSkin)     fetch + parse; calls onSkin(name, Float32Array, count)
 *   S9Skin.pose(e)                 entity → an 11-bone FPS skeleton (px, +x right/+y up/+z fwd)
 *   S9Skin.palette(P, sk, out)     skeleton + mesh bounds → Float32Array(11*16) bone matrices
 *
 * ⚑ WHY ONLY THREE ARCHETYPES. The six .skn files are 7.39 MB together, and they are not equal.
 *   Three are derived from `oni.obj` and three from `ronin.obj`, and only the oni family is
 *   sound. Measured (bind pose vs a posed skeleton, longest-edge stretch per triangle):
 *
 *       BIND POSE, all six       worst 1.000×   — exactly rigid, as it must be
 *       oni / kappa / prizm      worst 2.1–2.9×, ZERO triangles over 3×
 *       ronin / doomer / kunoichi  worst 8.9–19.6×, 114–194 triangles over 3×, up to 31 over 10×
 *
 *   That is the known arm shard (task #77), and it is a PROPORTION mismatch, not a weighting or
 *   palette bug: `oni.obj` is a true T-pose whose shoulders sit at 0.79–0.83 of body height,
 *   exactly where the bake's bind table puts the arm bones, while `ronin.obj` (TOON TROOPER) is
 *   a big-headed toon whose shoulder line is at 0.62 — so its bind arm bones land INSIDE ITS
 *   HEAD and its real arms end up ~88% weighted to `chest`. Section 9 therefore ships the oni
 *   family only: three clean bodies for 2.35 MB instead of six for 7.39 MB.
 *
 * ⚑ FAILS OPEN. No fetch, a bad magic number, a short buffer, no WebGL — that archetype simply
 *   never registers and the bot keeps the box rig it has always had.
 */
window.S9Skin = (function () {
  const PI = Math.PI, H = 150;               // skeleton height in px — the space the bind table lives in
  const BASE = 'models/';

  /* Assignment order. Cheapest-first is deliberate: a 2-player match pays 0.93 MB, not 2.35. */
  const CAST = [
    { arch: 'oni',   bytes: 975104,  mat: 1 },   // 1 cloth weave  — fatigues
    { arch: 'kappa', bytes: 773504,  mat: 7 },   // 7 wrap bands   — strapped webbing
    { arch: 'prizm', bytes: 708488,  mat: 2 },   // 2 brushed metal— hardsuit
  ];
  const MAT = {}; CAST.forEach(c => MAT[c.arch] = c.mat);
  function archFor(i) { return CAST[((i | 0) % CAST.length + CAST.length) % CAST.length].arch; }
  function need(n) { return CAST.slice(0, Math.max(0, Math.min(CAST.length, n | 0))).map(c => c.arch); }
  function bytesFor(n) { return CAST.slice(0, Math.max(0, Math.min(CAST.length, n | 0))).reduce((s, c) => s + c.bytes, 0); }
  function matFor(arch) { return MAT[arch] || 0; }

  /* bake-fighter.mjs's bind skeleton, ×150 and in this module's frame: +x right, +y up, +z fwd.
   * Order MUST match the bone indices baked into the .skn. Each entry is [start, end] — the end
   * is the child joint, which is what gives the bone a direction to be rotated away from. */
  const BONES = ['pelvis', 'chest', 'head', 'armF0', 'armF1', 'armB0', 'armB1', 'legF0', 'legF1', 'legB0', 'legB1'];
  const BIND = [
    [[0, 75, 0], [0, 93, 0]],                    // pelvis → chest
    [[0, 93, 0], [0, 126, 0]],                   // chest  → head
    [[0, 126, 0], [0, 145.5, 0]],                // head   → crown
    [[15, 120, 0], [39, 118.5, 0]],              // armF0  right shoulder → elbow   (T-pose, out along +x)
    [[39, 118.5, 0], [60, 117, 0]],              // armF1  right elbow → wrist
    [[-15, 120, 0], [-39, 118.5, 0]],            // armB0  left shoulder → elbow
    [[-39, 118.5, 0], [-60, 117, 0]],            // armB1  left elbow → wrist
    [[10.5, 72, 0], [10.5, 39, 0]],              // legF0  right hip → knee
    [[10.5, 39, 0], [10.5, 6, 0]],               // legF1  right knee → ankle
    [[-10.5, 72, 0], [-10.5, 39, 0]],            // legB0  left hip → knee
    [[-10.5, 39, 0], [-10.5, 6, 0]],             // legB1  left knee → ankle
  ];
  // unit bind direction per bone, precomputed
  const BDIR = BIND.map(([a, b]) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; });

  // ── loader ────────────────────────────────────────────────────────────────────────────────
  /* Cross-limb stitch repair, run once per mesh at load.
   *
   * bake-fighter.mjs keeps one limb's bone from claiming the other limb's vertices with a
   * side test, but the test has a tolerance band around the centreline so that central
   * geometry still gets weighted — and near the floor, where the two feet almost touch, a few
   * triangles end up with corners rigidly bound to OPPOSITE shins. Those triangles are a
   * bridge between two limbs that are about to move apart, and a bridge under a running stride
   * is a 20x-stretched spike shooting between the ankles.
   *
   * The fix is per-TRIANGLE, not per-vertex (each corner is individually well-formed; it is
   * the combination that is wrong): a corner on the minority side adopts the majority corner's
   * bones and weights, so the whole triangle rides one leg rigidly. Measured over 54 poses
   * (walk + sprint × full gait cycle × three aim pitches): kappa's worst stretch 21.2x → 6.0x,
   * prizm's 9.0x → 6.7x, and it touches 113 of 4,604 triangles (2.5%) / 85 of 4,217 (2.0%).
   * oni has 32 spanning triangles and none of them were tearing, so it is unchanged. */
  const SIDE = BONES.map(n => /F\d$/.test(n) ? 1 : /B\d$/.test(n) ? -1 : 0);
  function limbSide(V, i) { const o = i * 14; let s = 0;
    for (let k = 0; k < 4; k++) { const w = V[o + 10 + k]; if (w) s += SIDE[Math.round(V[o + 6 + k])] * w; }
    return s; }
  function stitch(V, n) {
    let hits = 0;
    for (let t = 0; t + 2 < n; t += 3) {
      const s0 = limbSide(V, t), s1 = limbSide(V, t + 1), s2 = limbSide(V, t + 2);
      if (!((s0 > 0.05 || s1 > 0.05 || s2 > 0.05) && (s0 < -0.05 || s1 < -0.05 || s2 < -0.05))) continue;
      hits++;
      const s = [s0, s1, s2]; let src = 0;
      for (let k = 1; k < 3; k++) if (Math.abs(s[k]) > Math.abs(s[src])) src = k;
      const so = (t + src) * 14;
      for (let k = 0; k < 3; k++) {
        if (k === src || s[k] === 0 || Math.sign(s[k]) === Math.sign(s[src])) continue;
        const o = (t + k) * 14;
        for (let m = 0; m < 8; m++) V[o + 6 + m] = V[so + 6 + m];   // idx4 + wgt4
      }
    }
    return hits;
  }

  const loading = {};
  /* Fetch and parse one .skn. Resolves to null on any failure — a body that will not load is a
   * bot that keeps the box rig, never an exception that stops the match. */
  function one(name, onSkin) {
    if (loading[name]) return loading[name];
    return (loading[name] = fetch(BASE + name + '.skn')
      .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status)))
      .then(buf => {
        if (buf.byteLength < 32) throw new Error('truncated');
        const u8 = new Uint8Array(buf, 0, 8); let magic = '';
        for (let i = 0; i < 8; i++) magic += String.fromCharCode(u8[i]);
        if (magic !== 'UR3SKIN0') throw new Error('bad magic ' + JSON.stringify(magic));
        const n = new DataView(buf).getUint32(12, true);
        if (!n || 32 + n * 56 > buf.byteLength) throw new Error('vertex count ' + n + ' does not fit');
        const verts = new Float32Array(buf, 32, n * 14);
        const st = stitch(verts, n);
        if (onSkin) onSkin(name, verts, n);
        return { name, verts, count: n, stitched: st };
      })
      .catch(e => { console.warn('[section9] skin "' + name + '" not loaded:', e && e.message || e); return null; }));
  }
  function load(names, onSkin) {
    return Promise.all((names || []).map(n => one(n, onSkin))).then(l => l.filter(Boolean));
  }

  // ── the FPS poser ─────────────────────────────────────────────────────────────────────────
  /* ronin-fighters.js's skel() is authored for a 2D duel — braced stances, sword cuts, blocks —
   * and its joints only ever move in one plane. An operative runs, strafes, jumps and aims, and
   * the limb that matters most swings along the VIEW axis, which that skeleton cannot express.
   * So this is a separate, much smaller poser that emits the same 11 bones.
   *
   * Frame: +x = the operative's right, +y = up, +z = the way they face; origin at the feet;
   * units are the bind table's px (body = 150). That is the mesh's own frame — the .skn's legs
   * and arms are separated along x and its toes point +z — so nothing has to be re-axised. */
  const rx = (p, o, s, c) => [o[0] + p[0], o[1] + p[1] * c - p[2] * s, o[2] + p[1] * s + p[2] * c];

  function pose(e) {
    const air = !e.onGround, run = !!e.sprinting, mv = !!e.moving, p = e.gait || 0;
    /* Stride amplitude is a QUALITY knob, not just a look one. These bodies are auto-skinned,
     * so the wider the legs split the more the crotch and inner-shin geometry has to stretch;
     * measured over a full gait sweep, dropping the run swing from 0.95 rad to 0.72 takes the
     * worst triangle stretch from 4.2x to ~3.5x on oni and roughly halves the count of
     * stretched triangles on all three. It still reads as a run. */
    const A = air ? 0.30 : (run ? 0.72 : (mv ? 0.48 : 0));
    const bob = (air || !mv) ? 0 : (run ? 4.4 : 2.4) * Math.abs(Math.sin(p));
    const lean = air ? 0.15 : (run ? 0.26 : (mv ? 0.10 : 0.03));
    const pit = Math.max(-0.95, Math.min(0.95, e.pitch || 0));
    const rec = (e.recoil || 0) * 4.5;

    // ── torso: pelvis → chest → head → crown, tilted forward by `lean`, head tipped by aim ──
    const hipY = 75 + bob - (air ? 4 : 0);
    const pel = [0, hipY, 0];
    const cl = Math.cos(lean), sl = Math.sin(lean);
    const chest = [0, hipY + 18 * cl, 18 * sl];
    const ha = lean * 0.5 - pit * 0.7;                       // pitch UP tips the skull back (−z)
    const hc = Math.cos(ha), hs = Math.sin(ha);
    const head = [chest[0], chest[1] + 33 * hc, chest[2] + 33 * hs];
    const crown = [head[0], head[1] + 19.5 * hc, head[2] + 19.5 * hs];

    // ── legs: thigh swings about the hip in the y-z plane, shin trails it (knees bend back) ──
    const TH = 33, SH = 33;
    const kneeAmt = air ? 0.70 : (mv ? 0.66 : 0.06);
    function leg(side, ph) {
      const sw = A * Math.sin(p + ph);
      const kb = air ? kneeAmt : Math.max(0, kneeAmt * Math.sin(p + ph + 0.5));
      const hip = [side * 10.5, hipY - 3, 0];
      const knee = [hip[0], hip[1] - TH * Math.cos(sw), hip[2] + TH * Math.sin(sw)];
      const a2 = sw - kb;
      const ankle = [knee[0], knee[1] - SH * Math.cos(a2), knee[2] + SH * Math.sin(a2)];
      return [hip, knee, ankle];
    }
    const lgR = leg(1, 0), lgL = leg(-1, PI);

    /* ── arms: a two-handed carry, not a swinging gait. Offsets are chest-relative and then
     * rotated as one about x, so the whole firing platform tracks the aim: pitching up lifts
     * the hands and the weapon with them, which is what sells a bot as actually aiming. */
    const tr = lean - pit * 0.85, ts = Math.sin(tr), tc = Math.cos(tr);
    const sway = mv ? Math.sin(p) * (run ? 1.8 : 0.9) : 0;
    // shoulders ride the torso's lean only — swinging them with the aim would walk the whole
    // upper body forwards and back as a bot tracks a target up a stairwell
    const shR = rx([15, 27, 0], chest, sl, cl), shL = rx([-15, 27, 0], chest, sl, cl);
    const hdR = rx([9, 3 + sway * 0.3, 21 - rec], chest, ts, tc);      // trigger hand, tucked in
    const elR = rx([22, 1, 3], chest, ts, tc);                          // elbow flared out/back
    const hdL = rx([-1, 8 + sway * 0.3, 40 - rec * 0.6], chest, ts, tc); // support hand, out front
    const elL = rx([-17, -1, 15], chest, ts, tc);

    return {
      B: [[pel, chest], [chest, head], [head, crown],
          [shR, elR], [elR, hdR], [shL, elL], [elL, hdL],
          [lgR[0], lgR[1]], [lgR[1], lgR[2]], [lgL[0], lgL[1]], [lgL[1], lgL[2]]],
      chest, head, hdR, hdL, elR, tr,
      // where the muzzle sits, so the renderer can hang a rifle and its flash off the same pose
      muzzle: rx([2, 9, 78 - rec * 0.6], chest, ts, tc),
      grip: rx([6, 5, 26 - rec], chest, ts, tc),
    };
  }

  // ── joint palette ─────────────────────────────────────────────────────────────────────────
  /* For each bone: the transform taking its BIND segment onto the posed one. ronin3d's version
   * of this is a planar Rz, which is all a side-on duel needs; an operative's legs swing along
   * the view axis, so this uses the full shortest-arc rotation from the bind direction to the
   * live one (Rodrigues). It reduces to exactly the same thing when the motion is planar.
   *
   * Composed analytically rather than as four matrix multiplies:
   *     p → R·(SC·p − (0, SC·lo, 0) − b0) + j
   * so the linear part is R·SC and the translation is j − R·(b0 + (0, SC·lo, 0)). */
  const tmp = new Float32Array(11 * 16);
  function palette(P, sk, out) {
    const o = out || tmp, SC = H / (sk.h || 1), yo = SC * sk.lo;
    for (let i = 0; i < 11; i++) {
      const b = BIND[i], bd = BDIR[i], seg = P.B[i];
      const j = seg[0], c = seg[1];
      let dx = c[0] - j[0], dy = c[1] - j[1], dz = c[2] - j[2];
      const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
      // shortest-arc rotation bd → (dx,dy,dz)
      const dt = bd[0] * dx + bd[1] * dy + bd[2] * dz;
      let m00 = 1, m01 = 0, m02 = 0, m10 = 0, m11 = 1, m12 = 0, m20 = 0, m21 = 0, m22 = 1;
      if (dt < 0.999999) {
        let vx, vy, vz, k;
        if (dt < -0.999999) {
          // antiparallel: no unique arc, so spin a half turn about any perpendicular axis
          const a = Math.abs(bd[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
          vx = bd[1] * a[2] - bd[2] * a[1]; vy = bd[2] * a[0] - bd[0] * a[2]; vz = bd[0] * a[1] - bd[1] * a[0];
          const vl = Math.hypot(vx, vy, vz) || 1; vx /= vl; vy /= vl; vz /= vl;
          m00 = 2 * vx * vx - 1; m11 = 2 * vy * vy - 1; m22 = 2 * vz * vz - 1;
          m10 = m01 = 2 * vx * vy; m20 = m02 = 2 * vx * vz; m21 = m12 = 2 * vy * vz;
        } else {
          vx = bd[1] * dz - bd[2] * dy; vy = bd[2] * dx - bd[0] * dz; vz = bd[0] * dy - bd[1] * dx;
          k = 1 / (1 + dt);
          m00 = 1 - (vy * vy + vz * vz) * k; m01 = -vz + vx * vy * k; m02 = vy + vx * vz * k;
          m10 = vz + vx * vy * k;            m11 = 1 - (vx * vx + vz * vz) * k; m12 = -vx + vy * vz * k;
          m20 = -vy + vx * vz * k;           m21 = vx + vy * vz * k;            m22 = 1 - (vx * vx + vy * vy) * k;
        }
      }
      const px = b[0][0], py = b[0][1] + yo, pz = b[0][2];
      const q = i * 16;
      o[q]     = m00 * SC; o[q + 1] = m10 * SC; o[q + 2]  = m20 * SC; o[q + 3]  = 0;
      o[q + 4] = m01 * SC; o[q + 5] = m11 * SC; o[q + 6]  = m21 * SC; o[q + 7]  = 0;
      o[q + 8] = m02 * SC; o[q + 9] = m12 * SC; o[q + 10] = m22 * SC; o[q + 11] = 0;
      o[q + 12] = j[0] - (m00 * px + m01 * py + m02 * pz);
      o[q + 13] = j[1] - (m10 * px + m11 * py + m12 * pz);
      o[q + 14] = j[2] - (m20 * px + m21 * py + m22 * pz);
      o[q + 15] = 1;
    }
    return o;
  }

  return { CAST, BONES, BIND, H, archFor, need, bytesFor, matFor, load, pose, palette };
})();

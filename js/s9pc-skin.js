/* upperdeckripmaster3030 — Section 9 / PlayCanvas EVALUATION build: skinned bodies (S9PCSkin).
 *
 *
 * Takes the SAME auto-skinned bodies our renderer draws — `models/<arch>.skn`, 32-byte header
 * then 14 floats per vertex (pos3 + norm3 + boneIdx4 + boneWgt4, stride 56) over the 11-bone
 * humanoid rig from `scripts/bake-fighter.mjs` — and hands them to PlayCanvas as a real
 * `pc.Skin` + `pc.SkinInstance`, so the ENGINE does the skinning, the shadow casting and the
 * PBR shading instead of `section9-gl.js`'s bespoke `skinProg`.
 *
 *   S9PCSkin.spawn(app, arch, opts) → Promise<{entity, setPose, bones, pose}>
 *
 * ⚑ ONLY oni / kappa / prizm. `ronin`, `doomer` and `kunoichi` are the broken-proportion family
 *   (task #77) — their bind arm bones land inside the mesh's skull and posing them tears the
 *   arms. `S9Skin.CAST` already lists only the three good ones and this module refuses anything
 *   outside it, because a torn arm in an evaluation build reads as "the engine did that".
 *
 * ⚑ THE MATH IS S9Skin's, FACTORED. `S9Skin.palette()` emits, per bone,
 *       p → R·(SC·p − b0′) + j        SC = 150/meshHeight,  b0′ = bindStart + (0, SC·meshLo, 0)
 *   which is exactly PlayCanvas's `boneWorld · inverseBindPose`. So:
 *       inverseBindPose[i] = translate(−b0′) ∘ scale(SC)      (constant, built once)
 *       bone[i].local      = [R | j]                          (per frame, from S9Skin.pose)
 *   and the bones are children of the mesh instance's own node, so PlayCanvas's
 *   `inv(node.world) · bone.world` cancels to `bone.local` and the composition is identical.
 *   Nothing is re-derived, re-authored or approximated — the same 11 joints, the same rotations.
 */
window.S9PCSkin = (function () {
  const BASE = 'models/';
  const cache = {};
  const BUILT = {};                                  // arch → { mesh, ibp, SC } — built once, shared

  /* Fetch + parse one .skn. Reuses S9Skin's cross-limb stitch repair by going through nothing —
   * the parse is 12 lines and duplicating it here keeps the prototype from reaching into
   * S9Skin's privates. The stitch itself IS reused: S9Skin exposes no hook, so we accept the
   * un-stitched mesh and note it (the defect is a handful of triangles between the ankles). */
  function parse(buf) {
    if (buf.byteLength < 32) throw new Error('truncated');
    const u8 = new Uint8Array(buf, 0, 8); let magic = '';
    for (let i = 0; i < 8; i++) magic += String.fromCharCode(u8[i]);
    if (magic !== 'UR3SKIN0') throw new Error('bad magic ' + JSON.stringify(magic));
    const n = new DataView(buf).getUint32(12, true);
    if (!n || 32 + n * 56 > buf.byteLength) throw new Error('vertex count ' + n + ' does not fit');
    return { verts: new Float32Array(buf, 32, n * 14), count: n };
  }

  function fetchSkn(arch) {
    if (cache[arch]) return cache[arch];
    return (cache[arch] = fetch(BASE + arch + '.skn')
      .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status)))
      .then(parse));
  }

  /* .skn interleave → PlayCanvas vertex streams. The engine wants separate arrays; the file is
   * interleaved for our own attrib pointers, so this is a straight de-interleave. */
  function meshOf(app, verts, count) {
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
    const bi = new Uint8Array(count * 4), bw = new Float32Array(count * 4);
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < count; i++) {
      const o = i * 14;
      pos[i * 3] = verts[o]; pos[i * 3 + 1] = verts[o + 1]; pos[i * 3 + 2] = verts[o + 2];
      if (verts[o + 1] < lo) lo = verts[o + 1]; if (verts[o + 1] > hi) hi = verts[o + 1];
      nor[i * 3] = verts[o + 3]; nor[i * 3 + 1] = verts[o + 4]; nor[i * 3 + 2] = verts[o + 5];
      for (let k = 0; k < 4; k++) { bi[i * 4 + k] = verts[o + 6 + k] | 0; bw[i * 4 + k] = verts[o + 10 + k]; }
    }
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(pos); mesh.setNormals(nor);
    mesh.setVertexStream(pc.SEMANTIC_BLENDINDICES, bi, 4, count, pc.TYPE_UINT8, false);
    mesh.setVertexStream(pc.SEMANTIC_BLENDWEIGHT, bw, 4, count);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return { mesh, lo, hi, h: hi - lo };
  }

  /* Shortest-arc quaternion from a to b — the quaternion form of S9Skin.palette's Rodrigues
   * block. Same rotation, expressed the way a scene graph wants it. */
  const _q = new pc.Quat();
  function arcQuat(a, b, out) {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (d > 0.999999) { out.set(0, 0, 0, 1); return out; }
    if (d < -0.999999) {                                    // antiparallel: any perpendicular axis
      let ax = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const vx = a[1] * ax[2] - a[2] * ax[1], vy = a[2] * ax[0] - a[0] * ax[2], vz = a[0] * ax[1] - a[1] * ax[0];
      const l = Math.hypot(vx, vy, vz) || 1;
      out.set(vx / l, vy / l, vz / l, 0); return out;
    }
    const vx = a[1] * b[2] - a[2] * b[1], vy = a[2] * b[0] - a[0] * b[2], vz = a[0] * b[1] - a[1] * b[0];
    out.set(vx, vy, vz, 1 + d);
    const n = 1 / Math.hypot(out.x, out.y, out.z, out.w);
    out.set(out.x * n, out.y * n, out.z * n, out.w * n);
    return out;
  }

  function material(app, arch, tint) {
    const m = new pc.StandardMaterial();
    m.name = 's9pc-body-' + arch;
    // one look per archetype, echoing S9Skin's kit assignment (cloth / webbing / hardsuit)
    const K = {
      oni:   { d: [0.28, 0.30, 0.26], metal: 0.05, gloss: 0.28 },   // cloth fatigues
      kappa: { d: [0.22, 0.26, 0.24], metal: 0.18, gloss: 0.42 },   // strapped webbing
      prizm: { d: [0.46, 0.49, 0.55], metal: 0.85, gloss: 0.62 },   // brushed hardsuit
    }[arch] || { d: [0.4, 0.4, 0.4], metal: 0.1, gloss: 0.4 };
    /* One look per archetype, then nudged toward the operative's HUD tint. The tint is how you
     * tell two bodies of the same archetype apart at range, and it is the same colour the
     * nameplate, the death pop and the debris use — so the read is consistent everywhere. */
    let d = K.d.slice();
    if (tint) { const t = [tint[0] / 255, tint[1] / 255, tint[2] / 255];
      d = d.map((v, i) => v * 0.62 + t[i] * 0.38); }
    m.diffuse = new pc.Color(d[0], d[1], d[2]);
    m.useMetalness = true; m.metalness = K.metal; m.gloss = K.gloss;
    m.update();
    return m;
  }

  /* Build one skinned operative. Resolves to a handle whose `setPose(e)` takes the SAME entity
   * shape `S9Skin.pose()` expects ({onGround, sprinting, moving, gait, pitch, recoil}). */
  function spawn(app, arch, opts) {
    opts = opts || {};
    if (!window.S9Skin) return Promise.reject(new Error('S9Skin missing'));
    const allowed = S9Skin.CAST.map(c => c.arch);
    if (allowed.indexOf(arch) < 0) return Promise.reject(new Error('archetype "' + arch + '" is not in S9Skin.CAST (task #77)'));

    return fetchSkn(arch).then(({ verts, count }) => {
      /* ⚑ The MESH and the inverse bind pose are per-ARCHETYPE, not per-operative: every body
       * wearing `oni` is the same 4,600 triangles at the same bind scale, and only the bone graph
       * differs. Building them once means a seven-bot match uploads three meshes, not seven. */
      const built = BUILT[arch] || (BUILT[arch] = (() => {
        const b = meshOf(app, verts, count);
        const SC = S9Skin.H / (b.h || 1), yo = SC * b.lo;
        // inverse bind pose: mesh space → bind-local. Constant.
        // setTRS gives T·R·S ⇒ p ↦ SC·p + t, and t must be −b0′, which is what is passed.
        const ibp = S9Skin.BIND.map(bb => { const m = new pc.Mat4();
          m.setTRS(new pc.Vec3(-bb[0][0], -(bb[0][1] + yo), -bb[0][2]), pc.Quat.IDENTITY, new pc.Vec3(SC, SC, SC));
          return m; });
        return { mesh: b.mesh, lo: b.lo, h: b.h, SC, ibp };
      })());
      const mesh = built.mesh, lo = built.lo, h = built.h, SC = built.SC, ibp = built.ibp;

      const root = new pc.Entity('op-' + arch);
      const bones = S9Skin.BONES.map(n => { const b = new pc.Entity('bone-' + n); root.addChild(b); return b; });

      const skin = new pc.Skin(app.graphicsDevice, ibp, S9Skin.BONES.slice());
      mesh.skin = skin;
      const si = new pc.SkinInstance(skin);
      si.bones = bones;

      const mi = new pc.MeshInstance(mesh, opts.material || material(app, arch, opts.tint), root);
      mi.skinInstance = si;
      mi.castShadow = true;
      // skinned aabbs are derived from bones; a generous custom box in node (px) space is
      // cheaper and cannot cull the body out of its own shadow
      mi.setCustomAabb(new pc.BoundingBox(new pc.Vec3(0, 78, 0), new pc.Vec3(75, 95, 75)));

      root.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
      mi.node = root; mi.skinInstance = si;          // the component setter may re-point these
      (app.__worldMirror || app.root).addChild(root);   // under the world mirror — see s9pc-app.js

      const bd = S9Skin.BIND.map(([a, b]) => {
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
        return [d[0] / l, d[1] / l, d[2] / l];
      });

      let lastPose = null, state = null;
      /* Drive the rig. `e` is a Section-9-shaped entity; height/yaw/position ride the root so
       * the px skeleton lands in metres exactly as section9-gl.js's entModel() does. */
      function setPose(e) {
        state = e;
        const P = S9Skin.pose(e); lastPose = P;
        for (let i = 0; i < 11; i++) {
          const seg = P.B[i], j = seg[0], c = seg[1];
          let dx = c[0] - j[0], dy = c[1] - j[1], dz = c[2] - j[2];
          const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
          arcQuat(bd[i], [dx, dy, dz], _q);
          bones[i].setLocalPosition(j[0], j[1], j[2]);
          bones[i].setLocalRotation(_q);
        }
        const k = (e.h || 1.72) / S9Skin.H;
        root.setLocalScale(k, k, k);
        root.setLocalPosition(e.x || 0, e.y || 0, e.z || 0);
        // Section 9 yaw: 0 faces +z, and the mesh's own +z is its facing — a plain Y rotation.
        root.setLocalEulerAngles(0, (e.yaw || 0) * 180 / Math.PI, 0);
        return P;
      }

      /* Numeric self-check against the shipping poser. `S9Skin.palette()` is the definition of
       * "correctly posed" in this codebase; this proves the scene-graph factoring above
       * reproduces it rather than merely looking plausible. Called from the headless run. */
      function verify(e) {
        const P = S9Skin.pose(e || { onGround: true, moving: true, gait: 1.1, pitch: -0.2, recoil: 0.3 });
        const ref = S9Skin.palette(P, { h, lo });
        // drive the graph to the same pose, then read back bone.local · ibp
        for (let i = 0; i < 11; i++) {
          const seg = P.B[i], j = seg[0], c = seg[1];
          let dx = c[0] - j[0], dy = c[1] - j[1], dz = c[2] - j[2];
          const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
          arcQuat(bd[i], [dx, dy, dz], _q);
          bones[i].setLocalPosition(j[0], j[1], j[2]); bones[i].setLocalRotation(_q);
        }
        let worst = 0, at = -1;
        const m = new pc.Mat4();
        for (let i = 0; i < 11; i++) {
          m.mul2(bones[i].getLocalTransform(), ibp[i]);
          for (let k = 0; k < 16; k++) {
            const d = Math.abs(m.data[k] - ref[i * 16 + k]);
            if (d > worst) { worst = d; at = i; }
          }
        }
        return { worstAbsDiff: worst, bone: at, boneName: S9Skin.BONES[at] };
      }

      return { entity: root, bones, mesh, setPose, verify, arch, count, scale: SC,
        meshLo: lo, meshH: h, get pose() { return lastPose; }, get state() { return state; } };
    });
  }

  /* ── the fallback body ────────────────────────────────────────────────────────────────────
   * Fails open, the way the shipping game does: no .skn, a 404, a weak device ⇒ the operative is
   * still there and still articulated, just built from boxes. Same 11 bones, same `S9Skin.pose`,
   * same weapon mount — the ONLY thing that changes is the geometry hanging off the skeleton, so
   * a bot in the fallback stands, runs and aims identically to one in a skinned mesh.
   *
   * ⚑ Deliberately not "hide the operative". A missing body in a firefight is not a downgrade,
   *   it is an invisible enemy, which is worse than any amount of ugly. */
  const BOXSEG = [
    // [radius, kit] per bone, matching BONES order: pelvis chest head armF0 armF1 armB0 armB1 legs…
    [10, 'vest'], [11, 'vest'], [8.5, 'skin'], [5.5, 'vest'], [4.5, 'skin'],
    [5.5, 'vest'], [4.5, 'skin'], [6.5, 'kit'], [5.5, 'kit'], [6.5, 'kit'], [5.5, 'kit'],
  ];
  let BOXGEO = null;
  function spawnBox(app, tint) {
    if (!window.S9Skin) throw new Error('S9Skin missing');
    const t = tint || [140, 190, 210];
    const root = new pc.Entity('op-box');
    const mats = {};
    const mk = (r, g, b, gloss, metal) => { const m = new pc.StandardMaterial();
      m.diffuse = new pc.Color(r, g, b); m.useMetalness = true; m.metalness = metal; m.gloss = gloss; m.update(); return m; };
    mats.vest = mk(t[0] / 255 * 0.55, t[1] / 255 * 0.55, t[2] / 255 * 0.55, 0.30, 0.10);
    mats.kit = mk(0.30, 0.28, 0.21, 0.24, 0.05);
    mats.skin = mk(0.52, 0.40, 0.31, 0.22, 0.02);
    if (!BOXGEO) BOXGEO = pc.Mesh.fromGeometry(app.graphicsDevice, new pc.BoxGeometry());
    const bones = [], limbs = [];
    S9Skin.BONES.forEach((n, i) => {
      const b = new pc.Entity('bone-' + n); root.addChild(b);
      const seg = new pc.Entity('seg-' + n);
      const mi = new pc.MeshInstance(BOXGEO, mats[BOXSEG[i][1]], seg);
      mi.castShadow = true;
      seg.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
      b.addChild(seg); bones.push(b); limbs.push(seg);
    });
    // a head block, so the silhouette has a skull rather than a stick
    (app.__worldMirror || app.root).addChild(root);   // under the world mirror — see s9pc-app.js
    let lastPose = null, state = null;
    const _q = new pc.Quat(), _up = new pc.Vec3(0, 1, 0), _d = new pc.Vec3();
    function setPose(e) {
      state = e;
      const P = S9Skin.pose(e); lastPose = P;
      for (let i = 0; i < 11; i++) {
        const seg = P.B[i], j = seg[0], c = seg[1];
        const dx = c[0] - j[0], dy = c[1] - j[1], dz = c[2] - j[2];
        const L = Math.hypot(dx, dy, dz) || 1;
        bones[i].setLocalPosition(j[0], j[1], j[2]);
        _d.set(dx / L, dy / L, dz / L);
        _q.setFromDirections ? _q.setFromDirections(_up, _d) : _q.set(0, 0, 0, 1);
        bones[i].setLocalRotation(_q);
        const r = BOXSEG[i][0];
        limbs[i].setLocalPosition(0, L / 2, 0);
        limbs[i].setLocalScale(r * 2, L, r * 2);
      }
      const k = (e.h || 1.72) / S9Skin.H;
      root.setLocalScale(k, k, k);
      root.setLocalPosition(e.x || 0, e.y || 0, e.z || 0);
      root.setLocalEulerAngles(0, (e.yaw || 0) * 180 / Math.PI, 0);
      return P;
    }
    return { entity: root, bones, mesh: null, setPose, arch: 'box', count: 0,
      get pose() { return lastPose; }, get state() { return state; } };
  }

  return { spawn, spawnBox, CAST: () => (window.S9Skin ? S9Skin.CAST.map(c => c.arch) : []) };
})();

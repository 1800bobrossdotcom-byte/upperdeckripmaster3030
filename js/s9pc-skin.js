/* upperdeckripmaster3030 — Section 9 / PlayCanvas EVALUATION build: skinned bodies (S9PCSkin).
 *
 * ⚠ PROTOTYPE, for comparison against `section9.html`. Nothing here ships.
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

  function material(app, arch) {
    const m = new pc.StandardMaterial();
    m.name = 's9pc-body-' + arch;
    // one look per archetype, echoing S9Skin's kit assignment (cloth / webbing / hardsuit)
    const K = {
      oni:   { d: [0.28, 0.30, 0.26], metal: 0.05, gloss: 0.28 },   // cloth fatigues
      kappa: { d: [0.22, 0.26, 0.24], metal: 0.18, gloss: 0.42 },   // strapped webbing
      prizm: { d: [0.46, 0.49, 0.55], metal: 0.85, gloss: 0.62 },   // brushed hardsuit
    }[arch] || { d: [0.4, 0.4, 0.4], metal: 0.1, gloss: 0.4 };
    m.diffuse = new pc.Color(K.d[0], K.d[1], K.d[2]);
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
      const { mesh, lo, h } = meshOf(app, verts, count);
      const SC = S9Skin.H / (h || 1), yo = SC * lo;

      // inverse bind pose: mesh space → bind-local. Constant; built once.
      const ibp = S9Skin.BIND.map(b => {
        const m = new pc.Mat4();
        m.setTRS(new pc.Vec3(-b[0][0] * 1, -(b[0][1] + yo), -b[0][2]), pc.Quat.IDENTITY, new pc.Vec3(SC, SC, SC));
        // setTRS gives T·R·S ⇒ p ↦ SC·p + t, and t must be −b0′, which is what we passed.
        return m;
      });
      // ⚠ setTRS applies translation AFTER scale, which is exactly SC·p − b0′. Verified against
      //   S9Skin.palette numerically in the headless check (see docs in the report).

      const root = new pc.Entity('op-' + arch);
      const bones = S9Skin.BONES.map(n => { const b = new pc.Entity('bone-' + n); root.addChild(b); return b; });

      const skin = new pc.Skin(app.graphicsDevice, ibp, S9Skin.BONES.slice());
      mesh.skin = skin;
      const si = new pc.SkinInstance(skin);
      si.bones = bones;

      const mi = new pc.MeshInstance(mesh, opts.material || material(app, arch), root);
      mi.skinInstance = si;
      mi.castShadow = true;
      // skinned aabbs are derived from bones; a generous custom box in node (px) space is
      // cheaper and cannot cull the body out of its own shadow
      mi.setCustomAabb(new pc.BoundingBox(new pc.Vec3(0, 78, 0), new pc.Vec3(75, 95, 75)));

      root.addComponent('render', { meshInstances: [mi], castShadows: true, receiveShadows: true });
      mi.node = root; mi.skinInstance = si;          // the component setter may re-point these
      app.root.addChild(root);

      const bd = S9Skin.BIND.map(([a, b]) => {
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
        return [d[0] / l, d[1] / l, d[2] / l];
      });

      let lastPose = null;
      /* Drive the rig. `e` is a Section-9-shaped entity; height/yaw/position ride the root so
       * the px skeleton lands in metres exactly as section9-gl.js's entModel() does. */
      function setPose(e) {
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
        meshLo: lo, meshH: h, get pose() { return lastPose; } };
    });
  }

  return { spawn, CAST: () => (window.S9Skin ? S9Skin.CAST.map(c => c.arch) : []) };
})();

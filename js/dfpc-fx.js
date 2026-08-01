/* ripmaster3030studios — DOGFIGHT / PlayCanvas: world-space FX and the shared quad layer
 * (window.DFPCFx).
 *
 * ⚑ THIS MODULE EXISTS BECAUSE OF THE DIAGNOSIS, NOT BECAUSE OF THE ENGINE. Measured against the
 *   shipping build before anything was rewritten: `js/dogfight-gl.js` contains ZERO references to
 *   `G.pows`, `G.rings` or `s.trail`. The simulation maintains all three every frame — a 10 s
 *   headless sample had 3 live power cells and a 16-point trail on every ship — and the true-3D
 *   renderer drew none of them. The 2D fallback drew all three. So the game was strictly more
 *   INFORMATIVE when it looked worse, and a pickup you cannot see is a mechanic that does not
 *   exist. Rebuilding the renderer without fixing that would have been a prettier version of the
 *   same bug.
 *
 *   DFPCFx.quadLayer(app, opt)   one mesh + one material + one draw call, refilled every frame
 *   DFPCFx.create(app, opt)      → { root, update(G, cam, camEnt, o, skin), stats }
 *
 * Everything here READS the simulation and writes nothing to it. If an effect looks wrong the
 * question is which of the two is wrong, and that stays answerable.
 *
 * The quad layer is exported rather than kept private because `js/dfpc-world.js` needs the same
 * primitive for the cloud deck. One implementation, two consumers — the alternative is two copies
 * of the billboard maths, i.e. two chances to lose the fix. Load order is fx → world → app.
 */
window.DFPCFx = (function () {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ── generated sprites ──────────────────────────────────────────────────────────────────
   * Generated, never sampled: this repo can only ship art it made (CLAUDE.md), and one texture
   * per layer is what keeps each layer to a single draw call. */
  function radial(N, pow) {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
      const a = Math.pow(Math.max(0, 1 - Math.min(1, Math.hypot(u, v))), pow);
      const o = (y * N + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0); return c;
  }
  /* An annulus. A shockwave and a power cell's collar are RINGS — drawn with a radial blob they
   * read as a ball of light, which is the one thing they must not look like in a game whose
   * bursts are already balls of light. */
  function annulus(N, r0, r1) {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    const mid = (r0 + r1) / 2, half = (r1 - r0) / 2 || 1e-3;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
      const r = Math.hypot(u, v);
      const a = Math.pow(Math.max(0, 1 - Math.abs(r - mid) / half), 1.7) * (r <= 1 ? 1 : 0);
      const o = (y * N + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0); return c;
  }
  function texOf(app, canvas) {
    const t = new pc.Texture(app.graphicsDevice, { name: 'dfpc-fx', width: canvas.width, height: canvas.height,
      format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR });
    t.setSource(canvas); return t;
  }

  /* ── the quad layer ─────────────────────────────────────────────────────────────────────
   * A FIXED-SIZE buffer filled with degenerate triangles past the live count, so the vertex
   * format and the byte length never change frame to frame and PlayCanvas reuses one VBO instead
   * of allocating a new one per frame. Same pattern as `js/s9pc-fx.js`.
   *
   * opt: { max, sprite, blend, emissive, fog, depthWrite, name }
   */
  function quadLayer(app, opt) {
    opt = opt || {};
    const max = opt.max || 256;
    const pos = new Float32Array(max * 4 * 3), uv = new Float32Array(max * 4 * 2);
    const col = new Uint8Array(max * 4 * 4), idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) {
      const v = i * 4, o = i * 6, u = i * 8;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
      uv[u] = 0; uv[u + 1] = 0; uv[u + 2] = 1; uv[u + 3] = 0; uv[u + 4] = 1; uv[u + 5] = 1; uv[u + 6] = 0; uv[u + 7] = 1;
    }
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(pos); mesh.setUvs(0, uv); mesh.setColors32(col); mesh.setIndices(idx);
    mesh.update(pc.PRIMITIVE_TRIANGLES);

    const mat = new pc.StandardMaterial();
    mat.name = opt.name || 'dfpc-quads';
    mat.useLighting = false;
    mat.useFog = !!opt.fog;
    mat.diffuse = new pc.Color(0, 0, 0);
    mat.emissive = new pc.Color(1, 1, 1);
    const tex = texOf(app, opt.sprite);
    mat.emissiveMap = tex;
    mat.opacityMap = tex; mat.opacityMapChannel = 'a';
    /* ⚑ Both vertex-colour switches are set on purpose. An unlit StandardMaterial routes vertex
     * colour through whichever of the two the build wires up, and guessing wrong is a silently
     * black layer rather than an error. The diffuse term is zero anyway, so it costs nothing. */
    mat.emissiveVertexColor = true; mat.diffuseVertexColor = true;
    /* ⚠ AND THE ALPHA CHANNEL SEPARATELY. Vertex-colour RGB and vertex-colour ALPHA are two
     * different switches in a StandardMaterial, and only the first is obvious. The additive
     * layers do not care — additive blending ignores source alpha, which is why every additive
     * push here already folds its fade into RGB — but the alpha layers (shadows, cloud) encode
     * their fade in the alpha channel and would otherwise draw at full opacity forever: a
     * permanent black disc under every craft, and a cloud deck with a hard edge at the fog wall. */
    mat.opacityVertexColor = true; mat.opacityVertexColorChannel = 'a';
    /* ⚑ HDR ON PURPOSE for the additive layers. A vertex colour is 8-bit, so the brightest
     * contribution it can make is 1.0 — exactly the value the tonemapper is about to compress. A
     * tracer that tops out at "as bright as a lit surface" reads as a grey scratch. Pushing
     * emissive past 1.0 is what lets gunfire clear the bloom threshold, which is the whole reason
     * these are geometry in the scene rather than stickers on the 2D overlay. */
    mat.emissiveIntensity = opt.emissive != null ? opt.emissive : 1.0;
    mat.blendType = opt.blend || pc.BLEND_NORMAL;
    mat.depthWrite = !!opt.depthWrite;
    mat.cull = pc.CULLFACE_NONE;
    mat.update();

    const node = new pc.Entity(mat.name);
    const mi = new pc.MeshInstance(mesh, mat, node);
    /* These live all over the arena and are all camera-facing; culling them against a bounding
     * box that is only correct for last frame's contents is exactly how a burst disappears when
     * you turn slightly away from it. */
    mi.setCustomAabb(new pc.BoundingBox(new pc.Vec3(0, 0, 0), new pc.Vec3(4000, 4000, 4000)));
    mi.castShadow = false;
    node.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });

    // camera basis, refreshed in begin(); billboards and ribbons both need it
    const R = new pc.Vec3(), U = new pc.Vec3(), F = new pc.Vec3();
    let n = 0;

    function begin(camEnt) {
      const wt = camEnt.getWorldTransform().data;
      R.set(wt[0], wt[1], wt[2]);
      U.set(wt[4], wt[5], wt[6]);
      F.set(-wt[8], -wt[9], -wt[10]);
      n = 0;
    }
    function raw(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, r, g, b, a) {
      if (n >= max) return;
      const o = n * 12, k = n * 16, P = pos, C = col;
      P[o] = ax; P[o + 1] = ay; P[o + 2] = az;
      P[o + 3] = bx; P[o + 4] = by; P[o + 5] = bz;
      P[o + 6] = cx; P[o + 7] = cy; P[o + 8] = cz;
      P[o + 9] = dx; P[o + 10] = dy; P[o + 11] = dz;
      const rr = clamp(r | 0, 0, 255), gg = clamp(g | 0, 0, 255), bb = clamp(b | 0, 0, 255), aa = clamp(a | 0, 0, 255);
      for (let i = 0; i < 4; i++) { C[k + i * 4] = rr; C[k + i * 4 + 1] = gg; C[k + i * 4 + 2] = bb; C[k + i * 4 + 3] = aa; }
      n++;
    }
    /** a camera-facing square; `sy` lets a spark be tall rather than round */
    function billboard(x, y, z, rad, r, g, b, a, sy) {
      const h = rad * (sy == null ? 1 : sy);
      raw(x - (R.x * rad + U.x * h), y - (R.y * rad + U.y * h), z - (R.z * rad + U.z * h),
          x + (R.x * rad - U.x * h), y + (R.y * rad - U.y * h), z + (R.z * rad - U.z * h),
          x + (R.x * rad + U.x * h), y + (R.y * rad + U.y * h), z + (R.z * rad + U.z * h),
          x - (R.x * rad - U.x * h), y - (R.y * rad - U.y * h), z - (R.z * rad - U.z * h), r, g, b, a);
    }
    /* A tracer is a RIBBON between two world points, widened along the axis perpendicular to both
     * the round's direction and the view — so it always faces you but keeps its own length. A
     * camera-facing square cannot express a bullet; a screen-aligned quad along the flight path
     * can. Same argument for a light-cycle trail segment. */
    function ribbon(ax, ay, az, bx, by, bz, w0, w1, r, g, b, a) {
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      const L = Math.hypot(dx, dy, dz) || 1e-4; dx /= L; dy /= L; dz /= L;
      let sx = dy * F.z - dz * F.y, sy = dz * F.x - dx * F.z, sz = dx * F.y - dy * F.x;
      const sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-5) { sx = R.x; sy = R.y; sz = R.z; } else { sx /= sl; sy /= sl; sz /= sl; }
      raw(ax - sx * w0, ay - sy * w0, az - sz * w0,
          bx - sx * w1, by - sy * w1, bz - sz * w1,
          bx + sx * w1, by + sy * w1, bz + sz * w1,
          ax + sx * w0, ay + sy * w0, az + sz * w0, r, g, b, a);
    }
    /** a quad lying flat on the ground plane — shadows and shockwave rings */
    function flat(x, y, z, rad, r, g, b, a) {
      raw(x - rad, y, z - rad, x + rad, y, z - rad, x + rad, y, z + rad, x - rad, y, z + rad, r, g, b, a);
    }
    function end() {
      // degenerate the unused tail rather than shrinking the buffer: same byte length every frame
      for (let i = n; i < max; i++) { const o = i * 12; for (let k = 0; k < 12; k++) pos[o + k] = 0; }
      mesh.setPositions(pos); mesh.setColors32(col);
      mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    }
    return { node, mi, mat, begin, billboard, ribbon, flat, raw, end,
             count: () => n, full: () => n >= max, max };
  }

  // ── the effect set ────────────────────────────────────────────────────────────────────────
  const hex = h => { const s = String(h || '#fff').replace('#', '');
    return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0]; };

  function create(app, opt) {
    opt = opt || {};
    const soft = radial(64, 1.9);
    /* ⚑ TWO ADDITIVE LAYERS, not one, and the reason is the SPRITE not the blend. A shockwave and
     * a power cell's collar need an annulus; a spark and a tracer need a blob. One layer means one
     * texture, so a second layer is the cost of rings existing at all. Two draw calls total. */
    const add = quadLayer(app, { name: 'dfpc-add', max: 1100, sprite: soft,
      blend: pc.BLEND_ADDITIVE, emissive: 3.0, fog: false, depthWrite: false });
    const rings = quadLayer(app, { name: 'dfpc-ring', max: 96, sprite: annulus(96, 0.62, 0.98),
      blend: pc.BLEND_ADDITIVE, emissive: 2.6, fog: false, depthWrite: false });
    /* Shadows are the one ALPHA layer here. They are also the single biggest "is this thing in the
     * world or floating over a diagram" cue the old renderer had, and on a bright ground they do
     * double duty: a dark contact blob under a craft is what makes a dark silhouette legible
     * against a light field instead of merging with it. */
    const shadow = quadLayer(app, { name: 'dfpc-shadow', max: 260, sprite: radial(64, 1.15),
      blend: pc.BLEND_NORMAL, emissive: 1.0, fog: true, depthWrite: false });

    const root = new pc.Entity('dfpc-fx');
    root.addChild(shadow.node); root.addChild(add.node); root.addChild(rings.node);
    app.root.addChild(root);

    let nShadow = 0;

    function update(G, cam, camEnt, o, skin) {
      const WS = o.WS, FAR = o.VIEW_FAR || 34;
      const wdel = v => { v -= Math.round(v / WS) * WS; return v; };
      add.begin(camEnt); rings.begin(camEnt); shadow.begin(camEnt);

      /* ── ground shadows ────────────────────────────────────────────────────────────────
       * Cast down the sun vector onto y≈0 and widened with height, exactly as the old renderer
       * did — the geometry is different, the information is not. It is genuine gameplay data:
       * altitude is otherwise readable only off the HUD tape, and a chasing craft's shadow tells
       * you how far it has to dive. */
      const sd = skin.sunDir;
      const sx = sd[0] / (sd[1] || 1), sz = sd[2] / (sd[1] || 1);
      const drop = (x, alt, z, r) => {
        const t = clamp(alt / 6, 0, 1);
        shadow.flat(x + sx * alt, 0.02, z + sz * alt, r * (1 + t * 1.7), 0, 0, 0, (1 - t) * 150 + 22);
      };
      nShadow = 0;
      if (G.ships) for (const s of G.ships) {
        if (!s.alive) continue;
        const dx = wdel(s.x - cam.x), dz = wdel(s.y - cam.y);
        if (Math.hypot(dx, dz) < FAR) { drop(dx, s.alt || 0, dz, (o.CRAFT || 0.9) * 0.68); nShadow++; }
      }
      if (G.props) for (const p of G.props) {
        if (!(p.alt > 0.05)) continue;                       // a prop on the deck already touches it
        const dx = wdel(p.x - cam.x), dz = wdel(p.y - cam.y);
        if (Math.hypot(dx, dz) < FAR) { drop(dx, p.alt, dz, (p.s || 1) * 0.24); nShadow++; }
      }

      /* ── light-cycle trails ────────────────────────────────────────────────────────────
       * ⛔ NEVER DRAWN BY THE OLD 3D RENDERER. `s.trail` has been maintained every frame since
       * the mode shipped (16 points a ship) and `js/dogfight-gl.js` does not mention it. Ribbons
       * rather than lines, tapering and fading toward the tail, so a trail reads as a wake and
       * not as a wireframe. */
      if (G.ships) for (const s of G.ships) {
        const tr = s.trail; if (!s.alive || !tr || tr.length < 2) continue;
        const c = hex(s.tint), N = tr.length;
        let px = wdel(tr[0][0] - cam.x), pz = wdel(tr[0][1] - cam.y), py = tr[0][2];
        for (let i = 1; i < N; i++) {
          const qx = wdel(tr[i][0] - cam.x), qz = wdel(tr[i][1] - cam.y), qy = tr[i][2];
          /* ⚠ A wrapped world produces a segment that jumps the whole map when a ship crosses the
           * seam. Drawing it puts a full-width bar across the sky, so the segment is dropped —
           * the trail is cosmetic and one missing link costs nothing. */
          if (Math.abs(qx - px) < WS * 0.4 && Math.abs(qz - pz) < WS * 0.4 &&
              Math.hypot(qx, qz) < FAR) {
            const f0 = (i - 1) / N, f1 = i / N, k = f1 * f1;
            add.ribbon(px, py, pz, qx, qy, qz, 0.012 + f0 * 0.05, 0.012 + f1 * 0.05,
                       c[0] * k, c[1] * k, c[2] * k, 255);
          }
          px = qx; py = qy; pz = qz;
        }
      }

      /* ── tracers ───────────────────────────────────────────────────────────────────────
       * Head core pushed toward white plus a longer tail in the weapon's colour: your eye
       * integrates a bolt's motion, so a streak is what a round actually looks like and a dot is
       * what a diagram of one looks like. Tail length rides bolt speed, so a zoomed precision
       * shot draws a longer line. */
      if (G.bolts) for (const b of G.bolts) {
        const dx = wdel(b.x - cam.x), dz = wdel(b.y - cam.y);
        if (Math.hypot(dx, dz) > FAR) continue;
        const ch = Math.cos(b.h || 0), sh = Math.sin(b.h || 0);
        const c = hex(b.col || (b.me ? '#ffd23b' : '#ff5a3c'));
        const bsp = b.sp || 34, Lt = Math.min(3.4, bsp * 0.085);
        add.ribbon(dx, b.alt, dz, dx - ch * Lt, b.alt, dz - sh * Lt, 0.10, 0.012,
                   c[0] * 0.42, c[1] * 0.42, c[2] * 0.42, 255);
        add.ribbon(dx, b.alt, dz, dx - ch * 0.62, b.alt, dz - sh * 0.62, 0.13, 0.05,
                   c[0] * 0.35 + 160, c[1] * 0.35 + 160, c[2] * 0.35 + 160, 255);
      }

      /* ── bursts ────────────────────────────────────────────────────────────────────────
       * Camera-facing embers that DIM as they die (life², so they die fast), with the subtended
       * size capped — burst velocities run to ±6/s and one that drifts near the eye would
       * otherwise fill a third of the screen with a flat slab. */
      if (G.bursts) for (const b of G.bursts) {
        const dx = wdel(b.x - cam.x), dz = wdel(b.y - cam.y);
        const d = Math.hypot(dx, dz);
        if (d > FAR || d < 0.6) continue;
        const life = clamp(b.life, 0, 1), f = life * life;
        const c = hex(b.col || '#ff2a6d');
        const r = (0.09 + (1 - life) * 0.20) * Math.min(1, d / 3.5);
        add.billboard(dx, b.alt || 0, dz, r, c[0] * f, c[1] * f, c[2] * f, 255, 1.4);
      }

      /* ── shockwave rings ───────────────────────────────────────────────────────────────
       * ⛔ ALSO NEVER DRAWN BY THE OLD 3D RENDERER. `G.rings` is expanded every frame by step()
       * and no GL code reads it. Flat on the ground plane, because that is where the 2D renderer
       * drew them (a squashed ellipse) and it is what an expanding shock over terrain looks like. */
      if (G.rings) for (const rg of G.rings) {
        const dx = wdel(rg.x - cam.x), dz = wdel(rg.y - cam.y);
        if (Math.hypot(dx, dz) > FAR) continue;
        const c = hex(rg.col || skin.grid), a = clamp(rg.life, 0, 1);
        rings.flat(dx, (rg.alt || 0) + 0.03, dz, rg.r || 0.1, c[0] * a, c[1] * a, c[2] * a, 255);
      }

      /* ── power cells ───────────────────────────────────────────────────────────────────
       * ⛔ THE WORST OF THE THREE OMISSIONS. `G.pows` spawns on a timer, is collected by a real
       * proximity test and drives `applyPow` — and the shipping 3D renderer never drew it, so the
       * only way to collect one was to fly through it by accident. Three quads each: a soft halo
       * that says "something is here" from range, a collar ring that says which kind, and a bright
       * core. The blink in the last 3 s is the game's own expiry warning, kept.
       * ⚠ The collar IS camera-facing, unlike the shockwave rings that share this layer. A ring
       * lying flat in the world is right for a ground shock and wrong for a pickup: a cell floats
       * at the altitude you are flying at, so a horizontal disc is seen EDGE-ON — a one-pixel line
       * from exactly the approach you collect it from. The whole job of this effect is to be
       * findable. */
      if (G.pows) for (const pw of G.pows) {
        const dx = wdel(pw.x - cam.x), dz = wdel(pw.y - cam.y);
        const d = Math.hypot(dx, dz);
        if (d > FAR) continue;
        const c = hex(pw.col || '#2bff80');
        const amp = pw.type === 'amp';
        const blink = pw.t > 17 ? (0.4 + 0.6 * Math.sin(pw.t * 12)) : 1;
        const puls = 1 + 0.10 * Math.sin((pw.t || 0) * 4);
        const y = pw.alt || 0;
        const k = blink * clamp(1 - d / FAR, 0.25, 1);
        add.billboard(dx, y, dz, (amp ? 1.5 : 1.05) * puls, c[0] * 0.30 * k, c[1] * 0.30 * k, c[2] * 0.30 * k, 255);
        rings.billboard(dx, y, dz, (amp ? 0.85 : 0.62) * puls, c[0] * k, c[1] * k, c[2] * k, 255);
        add.billboard(dx, y, dz, amp ? 0.30 : 0.22,
          (c[0] * 0.4 + 153) * k, (c[1] * 0.4 + 153) * k, (c[2] * 0.4 + 153) * k, 255);
      }

      /* ── boost-gate glow ───────────────────────────────────────────────────────────────
       * The gate geometry itself is a real mesh (dfpc-world). This is the halo that makes one
       * findable from across the map, which is the whole point of a ring you are meant to seek. */
      if (G.gates) for (const gt of G.gates) {
        const dx = wdel(gt.x - cam.x), dz = wdel(gt.y - cam.y);
        const d = Math.hypot(dx, dz);
        if (d > FAR || gt.cool > 0) continue;
        const puls = 0.75 + 0.25 * Math.sin((G.t || 0) * 3 + dx);
        add.billboard(dx, gt.alt || 0, dz, 2.1, 60 * puls, 48 * puls, 12 * puls, 255);
      }

      add.end(); rings.end(); shadow.end();
    }

    function dispose() { try { root.destroy(); } catch (e) {} }
    return { root, update, dispose,
             stats: () => ({ add: add.count(), rings: rings.count(), shadow: nShadow }) };
  }

  return { create, quadLayer, radial, annulus, texOf, hex };
})();

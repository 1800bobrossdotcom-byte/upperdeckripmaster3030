/* ripmaster3030studios — RIP ROCKETER / PlayCanvas: the batched quad renderer (RRFx).
 *
 * "Galaga on acid" means a great many bright things on screen at once, and the number of things
 * on screen is exactly what the old build did not have. So the renderer is built around that
 * constraint first: EVERYTHING that is not the player's craft is a quad, all the quads live in
 * two fixed-size dynamic meshes, and the whole game costs FOUR draw calls.
 *
 *     backdrop   1  a single far quad, vertex-coloured — the sky
 *     additive   1  stars, bolts, thruster, explosions, tractor beam, rings, auras, glows
 *     cards      1  the enemies (front + back faces), the power-ups, the captive
 *     craft      1  the player's ship, a real mesh (js/rrpc-app.js owns it)
 *
 * ⚑ ONE TEXTURE, TWO MATERIALS. The additive layer and the card layer sample the SAME atlas; only
 *   the blend mode differs. That is what keeps a screen with 30 enemies, 90 bolts and 400 stars on
 *   it inside two batches. Cells 0–11 are deck art, 12 is the card back, 13 a soft dot, 14 a ring,
 *   15 flat white.
 *
 * ⚠ NO MIPMAPS, ON PURPOSE. An atlas plus mipmaps bleeds neighbouring cells into each other at
 *   low mip levels — you get another card's colour fringing yours as it recedes. The cells are
 *   inset by 1.5 px as well, since bilinear filtering alone reaches half a texel past the edge.
 *
 * ⚑ HDR ON PURPOSE (same reasoning as js/s9pc-fx.js): a vertex colour tops out at 1.0, which is
 *   precisely the value the tonemapper is about to compress. `emissiveIntensity` above 1 is what
 *   puts a bolt over the bloom threshold, and bloom is not decoration in this game — the brief
 *   asked for screen-filling colour, and glow is how colour fills a screen.
 */
window.RRFx = (function () {
  /* ⚠ THESE ARE DERIVED FROM THE WORST CASE, NOT PICKED. `push` drops silently past `max`, and it
   * drops whatever was submitted LAST — which is the emplacements and the explosions, i.e. exactly
   * the things whose absence is a bug rather than a cosmetic loss. Worked out at the widest layout
   * the code can produce (17 facade columns × 13 rows, 40 live emplacements, a 30-kill burn):
   *   B  sky 234 + far ≤140 + facade ≤442 + platforms ≤20 + mounts/edges/barrels ≤140  =  976
   *   A  motes 420 + bolts ≤420 + auras/wind 80 + lamps ≤75 + gun glow ≤240 + booms ≤450 = 1685
   *   C  40 enemies × (card + silhouette) + the ship's own card                          =    81 */
  const MAXA = 2000;         // additive quads: motes + bolts + particles + beams + auras + lamps
  const MAXC = 340;          // card quads: 40 enemies × (card + silhouette pieces) + power-ups
  /* ⚠ 96 WAS TOO FEW AND IT SHOWED AS A BRICK WALL. A 10×8 grid interpolates the hue field
   * piecewise-linearly, and a piecewise-linear surface has gradient discontinuities at every cell
   * edge — the eye reads those as Mach bands, i.e. a tiled wall behind the game. Dither does not
   * help: this is geometry, not 8-bit quantisation. Finer tessellation does. 18×13 = 216 quads,
   * same fill rate, same one draw call.
   * ⚑ AND THE FACILITY LIVES IN THIS SAME BUFFER, WHICH IS THE WHOLE REASON IT COSTS NOTHING.
   *   Sky field (234) + the far silhouette + the scrolling facade + every mount plate and barrel go
   *   into ONE opaque mesh, so the wall is still a single draw call — and, more importantly, the
   *   painter's order is guaranteed. Within one mesh instance the draw order IS the index order,
   *   so "sky, then far, then wall, then the things bolted to the wall" is a property of the code
   *   rather than something the engine's opaque sort has to be trusted to preserve. */
  const MAXB = 1200;         // sky field + far layer + facade panels + emplacement structure

  // ── the atlas ───────────────────────────────────────────────────────────────────────────────
  const CELL = 128, GRID = 4, ATLAS = CELL * GRID;
  const C_BACK = 12, C_DOT = 13, C_RING = 14, C_FLAT = 15;
  /* inset in UV units: bilinear filtering samples half a texel outside the quad, and an atlas has
   * a different picture there. 1.5 px of inset is the smallest that measured clean at grazing
   * angles; 0.5 still fringed. */
  const INSET = 1.5 / ATLAS;

  function uvOf(cell, out) {
    const cx = (cell % GRID) * CELL / ATLAS, cy = ((cell / GRID) | 0) * CELL / ATLAS, s = CELL / ATLAS;
    out[0] = cx + INSET; out[1] = cy + INSET; out[2] = cx + s - INSET; out[3] = cy + s - INSET;
    return out;
  }

  function buildAtlasCanvas() {
    const c = document.createElement('canvas'); c.width = c.height = ATLAS;
    const g = c.getContext('2d');
    g.clearRect(0, 0, ATLAS, ATLAS);
    const at = i => [(i % GRID) * CELL, ((i / GRID) | 0) * CELL];

    /* Deck cells start as GENERATED cards, not as empty boxes. The art is fetched async and may
     * never arrive (offline, a 404, a browser that will not decode webp) — and a formation of
     * blank rectangles is a broken game, while a formation of generated cards is a stylised one.
     * Fail-open is the standing principle here and it applies to art as much as to shaders. */
    for (let i = 0; i < 12; i++) {
      const [x, y] = at(i), h = (i * 31 + 20) % 360;
      const gr = g.createLinearGradient(x, y, x, y + CELL);
      gr.addColorStop(0, 'hsl(' + h + ',92%,62%)');
      gr.addColorStop(0.55, 'hsl(' + ((h + 40) % 360) + ',88%,34%)');
      gr.addColorStop(1, 'hsl(' + ((h + 80) % 360) + ',80%,12%)');
      g.fillStyle = gr; g.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
      g.strokeStyle = 'hsl(' + ((h + 180) % 360) + ',95%,74%)'; g.lineWidth = 4;
      g.strokeRect(x + 6, y + 6, CELL - 12, CELL - 12);
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.font = '900 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('◈', x + CELL / 2, y + CELL / 2 - 8);
      g.font = '900 15px Arial'; g.fillText('R' + (i + 1), x + CELL / 2, y + CELL / 2 + 30);
    }
    // 12 — the card BACK. Ripmaster livery: a torn-paper cream field with the roundel.
    {
      const [x, y] = at(C_BACK);
      g.fillStyle = '#0a0512'; g.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
      const gr = g.createRadialGradient(x + CELL / 2, y + CELL / 2, 4, x + CELL / 2, y + CELL / 2, CELL * 0.6);
      gr.addColorStop(0, '#ffd23b'); gr.addColorStop(0.4, '#ff2ad9'); gr.addColorStop(1, '#12042a');
      g.fillStyle = gr; g.fillRect(x + 10, y + 10, CELL - 20, CELL - 20);
      g.strokeStyle = '#2bff80'; g.lineWidth = 5; g.strokeRect(x + 8, y + 8, CELL - 16, CELL - 16);
      g.fillStyle = '#02040a'; g.font = '900 20px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('3030', x + CELL / 2, y + CELL / 2);
    }
    // 13 — soft dot. pow 1.9 is s9pc-fx's own value; it reads as a light rather than a disc.
    {
      const [x, y] = at(C_DOT), img = g.createImageData(CELL, CELL), d = img.data;
      for (let j = 0; j < CELL; j++) for (let i = 0; i < CELL; i++) {
        const u = (i + 0.5) / CELL * 2 - 1, v = (j + 0.5) / CELL * 2 - 1;
        const a = Math.pow(Math.max(0, 1 - Math.min(1, Math.hypot(u, v))), 1.9);
        const o = (j * CELL + i) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = (a * 255) | 0;
      }
      g.putImageData(img, x, y);
    }
    // 14 — ring (shockwaves, the warp gate, the tractor mouth)
    {
      const [x, y] = at(C_RING), img = g.createImageData(CELL, CELL), d = img.data;
      for (let j = 0; j < CELL; j++) for (let i = 0; i < CELL; i++) {
        const u = (i + 0.5) / CELL * 2 - 1, v = (j + 0.5) / CELL * 2 - 1, r = Math.hypot(u, v);
        const a = Math.pow(Math.max(0, 1 - Math.abs(r - 0.78) / 0.22), 2.2) * (r < 1 ? 1 : 0);
        const o = (j * CELL + i) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = (a * 255) | 0;
      }
      g.putImageData(img, x, y);
    }
    // 15 — flat white
    { const [x, y] = at(C_FLAT); g.fillStyle = '#fff'; g.fillRect(x + 2, y + 2, CELL - 4, CELL - 4); }
    return c;
  }

  function quadMesh(device, max) {
    const pos = new Float32Array(max * 4 * 3), uv = new Float32Array(max * 4 * 2), col = new Uint8Array(max * 4 * 4);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) {
      const v = i * 4, o = i * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
    }
    const mesh = new pc.Mesh(device);
    mesh.setPositions(pos); mesh.setUvs(0, uv); mesh.setColors32(col); mesh.setIndices(idx);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return { mesh, pos, uv, col, max, n: 0 };
  }

  function create(app) {
    const dev = app.graphicsDevice;
    const canvas = buildAtlasCanvas();
    const tex = new pc.Texture(dev, { name: 'rr-atlas', width: ATLAS, height: ATLAS,
      format: pc.PIXELFORMAT_SRGBA8, mipmaps: false,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR });
    tex.setSource(canvas);

    const A = quadMesh(dev, MAXA), C = quadMesh(dev, MAXC), B = quadMesh(dev, MAXB);
    A.premul = true;                     // the only additively-blended buffer — see push()

    function mat(name, blend, intensity, alphaMap) {
      const m = new pc.StandardMaterial();
      m.name = name;
      m.useLighting = false; m.useFog = false;
      m.diffuse = new pc.Color(0, 0, 0);
      m.emissive = new pc.Color(1, 1, 1);
      m.emissiveMap = tex;
      if (alphaMap) { m.opacityMap = tex; m.opacityMapChannel = 'a'; }
      // both flags set: an unlit StandardMaterial routes vertex colour through whichever of the
      // two the build wires up, and guessing wrong is a silently black layer, not an error.
      m.emissiveVertexColor = true; m.diffuseVertexColor = true;
      m.emissiveIntensity = intensity;
      m.blendType = blend;
      m.depthWrite = false;
      m.depthTest = true;
      m.cull = pc.CULLFACE_NONE;
      m.update();
      return m;
    }
    /* ⚠ 3.0 WAS WRONG, AND IT IS THE SAME NUMBER js/s9pc-fx.js IS RIGHT TO USE. There the additive
     * layer is occasional muzzle flashes over a lit world, so HDR headroom costs nothing and buys
     * gunfire that actually glows. Here the additive layer IS most of the picture — 420 star
     * streaks, every bolt, every aura, every explosion — so the same headroom saturates the frame.
     * ⚠ AND THE FIRST SWEEP OF THIS NUMBER WAS RUN AGAINST A BUG. Under the un-premultiplied
     *   additive layer (see `push`) every quad drew at full brightness regardless of its alpha, so
     *   the sweep was measuring a frame far brighter than the one this code describes and it
     *   picked 1.15. RE-SWEPT after the fix, bloom OFF (clipped% / luma / RMS / blacks% / sat% / edge):
     *     1.0 → 0.000 · 51.5 · 43.0 · 8.28 · 94.1 · 25.14
     *     1.4 → 0.002 · 52.2 · 45.3 · 8.35 · 94.0 · 27.50
     *     1.9 → 0.004 · 58.6 · 57.2 · 8.39 · 90.9 · 35.38   ← chosen
     *     2.5 → 0.008 · 51.4 · 48.1 · 8.77 · 93.6 · 26.91
     *     3.2 → 0.006 · 48.9 · 43.5 · 8.84 · 94.8 · 18.81
     *     4.2 → 0.024 · 48.9 · 46.3 · 10.05 · 94.3 · 20.82
     *   1.9 peaks BOTH global contrast and local detail at negligible clipping. Section 9's 3.2 is
     *   past the far side of that peak here, for the reason above: there the additive layer is
     *   occasional flashes, here it is most of the frame.
     *
     * 1.35 for cards: enough to make the art glow like a lit sign — this is a neon game — without
     * washing the artwork out, which is the mistake CLAUDE.md records for the 3D card's
     * environment map ("THE WASH, SECOND EDITION"). */
    const addMat = mat('rr-add', pc.BLEND_ADDITIVE, 1.9, false);
    const cardMat = mat('rr-card', pc.BLEND_NORMAL, 1.35, true);
    /* ⚑ THE BACKDROP IS OPAQUE, AND THAT IS THE WHOLE REASON IT IS A THIRD MESH. The first version
     * pushed it into the additive buffer to save a draw call — which put it AFTER the alpha-
     * blended cards in submission order, so a screen-filling additive field was added on top of
     * every enemy and washed the artwork flat. Same failure as CLAUDE.md's "THE WASH": a broad
     * ambient term landing on the art plate. An opaque material renders in the opaque bucket,
     * which the engine draws before the transparent one — so ordering stops being something this
     * file has to get right by hand. */
    const bgMat = mat('rr-bg', pc.BLEND_NONE, 1.0, false);

    const root = new pc.Entity('rrfx');
    const miB = new pc.MeshInstance(B.mesh, bgMat, root);
    const miA = new pc.MeshInstance(A.mesh, addMat, root);
    const miC = new pc.MeshInstance(C.mesh, cardMat, root);
    // Everything here is dynamic and spread across the whole field; culling it against a stale
    // bounding box is how the starfield disappears the moment the camera drifts.
    const huge = new pc.BoundingBox(new pc.Vec3(0, 0, 0), new pc.Vec3(400, 400, 400));
    miA.setCustomAabb(huge); miC.setCustomAabb(huge); miB.setCustomAabb(huge);
    miA.castShadow = miC.castShadow = miB.castShadow = false;
    /* cards before the additive: alpha-blended geometry must draw before additive geometry that
     * sits in front of it, and neither writes depth. Order in the array is the order drawn within
     * a bucket; the opaque backdrop is in the other bucket and is drawn first regardless. */
    root.addComponent('render', { meshInstances: [miB, miC, miA], castShadows: false, receiveShadows: false });
    app.root.addChild(root);

    // ── writing quads ─────────────────────────────────────────────────────────────────────────
    const _uv = [0, 0, 1, 1];
    /* ⚑ THE ADDITIVE LAYER PREMULTIPLIES ITS OWN VERTEX COLOUR, AND THIS WAS A REAL BUG.
     *
     * BLEND_ADDITIVE is `srcFactor ONE, dstFactor ONE`. Under ONE/ONE the fragment's ALPHA IS
     * NEVER READ — so every per-quad alpha in this file (star fade 30→220, parked aura 18, diving
     * aura 80, explosion falloff) was doing NOTHING, and every additive quad was drawing at full
     * brightness. It took isolating the layers one at a time to find: with the additive layer
     * masked off the enemy cards were crisp; with it on they sat inside soft blobs. Two rounds of
     * tuning aura radius and card emissive intensity moved nothing, because neither was the cause.
     *
     * The soft falloff still worked, which is what made it so confusing: the sprite carries its
     * falloff in the ALPHA channel, and uploading a canvas premultiplies RGB by A, so the RGB the
     * shader samples already IS the falloff. The TEXTURE was premultiplied for us; the VERTEX
     * colour was not.
     *
     * BLEND_ADDITIVEALPHA is not the fix — that reintroduces src-alpha, which would multiply the
     * already-premultiplied sprite falloff by itself. The fix is to premultiply the vertex colour
     * here, once, on the buffers that blend additively. `buf.premul` says which.
     *
     * ⚠ Worth checking in js/s9pc-fx.js, which builds its additive layer the same way — out of
     *   scope for this change, flagged rather than touched. */
    function push(buf, cell, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, r, g, b, a) {
      if (buf.n >= buf.max) return;
      const o = buf.n * 12, u = buf.n * 8, k = buf.n * 16, P = buf.pos, U = buf.uv, K = buf.col;
      P[o] = ax; P[o + 1] = ay; P[o + 2] = az;
      P[o + 3] = bx; P[o + 4] = by; P[o + 5] = bz;
      P[o + 6] = cx; P[o + 7] = cy; P[o + 8] = cz;
      P[o + 9] = dx; P[o + 10] = dy; P[o + 11] = dz;
      uvOf(cell, _uv);
      U[u] = _uv[0]; U[u + 1] = _uv[1]; U[u + 2] = _uv[2]; U[u + 3] = _uv[1];
      U[u + 4] = _uv[2]; U[u + 5] = _uv[3]; U[u + 6] = _uv[0]; U[u + 7] = _uv[3];
      let Aa = a < 0 ? 0 : a > 255 ? 255 : a | 0;
      let R = r, G = g, B = b;
      if (buf.premul) { const k = Aa / 255; R *= k; G *= k; B *= k; Aa = 255; }
      R = R < 0 ? 0 : R > 255 ? 255 : R | 0;
      G = G < 0 ? 0 : G > 255 ? 255 : G | 0;
      B = B < 0 ? 0 : B > 255 ? 255 : B | 0;
      for (let i = 0; i < 4; i++) { K[k + i * 4] = R; K[k + i * 4 + 1] = G; K[k + i * 4 + 2] = B; K[k + i * 4 + 3] = Aa; }
      buf.n++;
    }

    // camera basis, refreshed once per frame
    const RGT = { x: 1, y: 0, z: 0 }, UP = { x: 0, y: 1, z: 0 }, FWD = { x: 0, y: 0, z: -1 };

    function billboard(buf, cell, x, y, z, rad, r, g, b, a) {
      const rx = RGT.x * rad, ry = RGT.y * rad, rz = RGT.z * rad;
      const ux = UP.x * rad, uy = UP.y * rad, uz = UP.z * rad;
      push(buf, cell,
        x - rx - ux, y - ry - uy, z - rz - uz,
        x + rx - ux, y + ry - uy, z + rz - uz,
        x + rx + ux, y + ry + uy, z + rz + uz,
        x - rx + ux, y - ry + uy, z - rz + uz, r, g, b, a);
    }
    /* An oriented (NOT camera-facing) quad. This is what makes an enemy read as a physical card:
     * it tumbles, it goes edge-on and vanishes to a line, and it comes back. A billboard cannot
     * express any of that, and a billboarded trading card is a sticker. */
    function oriented(buf, cell, x, y, z, rx, ry, rz, ux, uy, uz, r, g, b, a) {
      push(buf, cell,
        x - rx - ux, y - ry - uy, z - rz - uz,
        x + rx - ux, y + ry - uy, z + rz - uz,
        x + rx + ux, y + ry + uy, z + rz + uz,
        x - rx + ux, y - ry + uy, z - rz + uz, r, g, b, a);
    }
    /* ⚠ FLAT-SHADED QUADS MADE THE BACKDROP A BRICK WALL. `push` writes one colour to all four
     * vertices, which is right for a bolt and wrong for a colour FIELD: nine by seven flat tiles
     * read as masonry, not as a gradient, and it was clearly visible in the first screenshot. This
     * writes a colour PER CORNER so the hardware interpolates across the quad and the seams
     * disappear. Corner order matches `push`: BL, BR, TR, TL. */
    function gouraud(buf, cell, x, y, z, rx, ry, rz, ux, uy, uz, c0, c1, c2, c3) {
      if (buf.n >= buf.max) return;
      const n = buf.n;
      push(buf, cell,
        x - rx - ux, y - ry - uy, z - rz - uz,
        x + rx - ux, y + ry - uy, z + rz - uz,
        x + rx + ux, y + ry + uy, z + rz + uz,
        x - rx + ux, y - ry + uy, z - rz + uz, 255, 255, 255, 255);
      const k = n * 16, K = buf.col, cs = [c0, c1, c2, c3];
      for (let i = 0; i < 4; i++) {
        const c = cs[i];
        let a = c[3] == null ? 255 : (c[3] < 0 ? 0 : c[3] > 255 ? 255 : c[3] | 0);
        let r = c[0], g = c[1], b = c[2];
        if (buf.premul) { const m = a / 255; r *= m; g *= m; b *= m; a = 255; }   // see push()
        K[k + i * 4] = r < 0 ? 0 : r > 255 ? 255 : r | 0;
        K[k + i * 4 + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
        K[k + i * 4 + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
        K[k + i * 4 + 3] = a;
      }
    }

    /* A streak between two points, widened perpendicular to both the direction and the view. A
     * camera-facing square cannot express a bolt in flight; this can, and it is what the classic
     * build's star-stretch was doing in 2D. */
    function ribbon(buf, cell, ax, ay, az, bx, by, bz, w, r, g, b, a) {
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      const L = Math.hypot(dx, dy, dz) || 1e-4; dx /= L; dy /= L; dz /= L;
      let sx = dy * FWD.z - dz * FWD.y, sy = dz * FWD.x - dx * FWD.z, sz = dx * FWD.y - dy * FWD.x;
      const sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-5) { sx = RGT.x; sy = RGT.y; sz = RGT.z; } else { sx /= sl; sy /= sl; sz /= sl; }
      push(buf, cell, ax - sx * w, ay - sy * w, az - sz * w, bx - sx * w, by - sy * w, bz - sz * w,
        bx + sx * w, by + sy * w, bz + sz * w, ax + sx * w, ay + sy * w, az + sz * w, r, g, b, a);
    }

    // hsl → rgb, 0..255. Used everywhere; the whole palette is hue-driven so the chain can move it.
    const _rgb = [0, 0, 0];
    function hsl(h, s, l) {
      h = ((h % 360) + 360) % 360 / 360;
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      const f = t => { t = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
        return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
      _rgb[0] = f(h + 1 / 3) * 255; _rgb[1] = f(h) * 255; _rgb[2] = f(h - 1 / 3) * 255;
      return _rgb;
    }

    function setCamBasis(camEnt) {
      const m = camEnt.getWorldTransform().data;
      RGT.x = m[0]; RGT.y = m[1]; RGT.z = m[2];
      UP.x = m[4]; UP.y = m[5]; UP.z = m[6];
      FWD.x = -m[8]; FWD.y = -m[9]; FWD.z = -m[10];
    }

    function commit(buf) {
      /* Degenerate the tail so a shrinking frame does not leave last frame's quads behind. Only
       * back to the previous high-water mark — everything past that is already zeroed.
       * ⚠ This was written `i < buf.prev || 0`, which parses as `(i < buf.prev) || 0` and happened
       *   to behave correctly only because `i < undefined` is false on the first frame. Correct by
       *   accident is a bug waiting for its second reader. */
      const prev = buf.prev || 0;
      for (let i = buf.n; i < prev; i++) {
        const o = i * 12; for (let k = 0; k < 12; k++) buf.pos[o + k] = 0;
        const c = i * 16; for (let k = 0; k < 16; k++) buf.col[c + k] = 0;
      }
      buf.prev = buf.n;
      buf.mesh.setPositions(buf.pos); buf.mesh.setUvs(0, buf.uv); buf.mesh.setColors32(buf.col);
      buf.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    }

    return {
      root, tex, atlasCanvas: canvas, A, C, B, addMat, cardMat, bgMat,
      CELL, GRID, ATLAS, C_BACK, C_DOT, C_RING, C_FLAT,
      setCamBasis, billboard, oriented, gouraud, ribbon, hsl, commit,
      begin() { A.n = 0; C.n = 0; B.n = 0; },
      end() { commit(B); commit(C); commit(A); },
      counts() { return { bg: B.n, add: A.n, card: C.n }; },
      /* Replace a deck cell with real card art once it decodes. Called per image, and each call
       * re-uploads the atlas — 12 uploads over the first second or two, then never again. */
      setCell(cell, img) {
        try {
          const g = canvas.getContext('2d');
          const x = (cell % GRID) * CELL, y = ((cell / GRID) | 0) * CELL;
          g.clearRect(x, y, CELL, CELL);
          // cards are 2:3; the cell is square. Cover-fit and centre, so no letterbox bars.
          const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
          if (!iw || !ih) return false;
          const s = Math.max(CELL / iw, CELL / ih), dw = iw * s, dh = ih * s;
          g.drawImage(img, x + (CELL - dw) / 2, y + (CELL - dh) / 2, dw, dh);
          tex.setSource(canvas); tex.upload();
          return true;
        } catch (e) { return false; }
      },
    };
  }

  return { create, MAXA, MAXC };
})();

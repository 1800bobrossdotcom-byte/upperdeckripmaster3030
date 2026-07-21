/* Section 9 — WebGL renderer (GLR).
 *
 * A GPU renderer for the tactical FPS: textured, lit, depth-buffered geometry
 * with real bitmap textures — the fidelity canvas-2D can't reach. It consumes
 * the SAME game state (cam, MAP, G.ents) the software renderer used, so all
 * gameplay/physics/AI/cards stay untouched; only the pixels change.
 *
 * Self-contained (no libraries): raw WebGL1, inline GLSL, procedural textures
 * drawn to offscreen 2D canvases and uploaded as mipmapped GL textures.
 *
 *   GLR.init(canvas)      → true if WebGL is available and the pipeline built
 *   GLR.buildMap(MAP)     → (re)build the static world mesh for a map
 *   GLR.frame(cam,G,ENV)  → render one frame (sky + world + operatives)
 *   GLR.supported()       → bool
 */
window.GLR = (function () {
  let gl = null, cv = null, prog = null, sky = null, ok = false;
  let loc = {}, skyLoc = {}, tex = {}, buffers = {}, dynBuf = null, skyBuf = null;
  const STRIDE = 11;                        // pos3 + nrm3 + uv2 + col3
  const MATS = ['floor', 'wall', 'crate', 'ammo'];
  const TILE = { floor: 2.2, wall: 2.4, crate: 1.05, ammo: 1.05 };
  const VMLIGHT = (() => { const v = [-0.3, 0.5, 0.7], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();

  // ── matrices (column-major) ──
  function persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy * 0.5), nf = 1 / (n - f);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]; }
  function lookAt(e, c, up) {
    let z0 = e[0] - c[0], z1 = e[1] - c[1], z2 = e[2] - c[2]; let zl = 1 / (Math.hypot(z0, z1, z2) || 1); z0 *= zl; z1 *= zl; z2 *= zl;
    let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0; let xl = Math.hypot(x0, x1, x2); if (xl) { xl = 1 / xl; x0 *= xl; x1 *= xl; x2 *= xl; }
    let y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    return [x0, y0, z0, 0, x1, y1, z1, 0, x2, y2, z2, 0,
      -(x0 * e[0] + x1 * e[1] + x2 * e[2]), -(y0 * e[0] + y1 * e[1] + y2 * e[2]), -(z0 * e[0] + z1 * e[1] + z2 * e[2]), 1]; }
  function mul(a, b) { const o = new Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
      o[i * 4 + j] = a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] + a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3];
    return o; }

  // ── shaders ──
  const VS = `attribute vec3 aPos; attribute vec3 aNormal; attribute vec2 aUV; attribute vec3 aColor;
    uniform mat4 uMVP; uniform vec3 uCam;
    varying vec3 vN; varying vec2 vUV; varying vec3 vC; varying float vDist;
    void main(){ gl_Position=uMVP*vec4(aPos,1.0); vN=aNormal; vUV=aUV; vC=aColor; vDist=distance(aPos,uCam); }`;
  const FS = `precision mediump float;
    uniform sampler2D uTex; uniform vec3 uLightDir,uLightCol,uAmbient,uFog; uniform float uFogNear,uFogFar;
    varying vec3 vN; varying vec2 vUV; varying vec3 vC; varying float vDist;
    void main(){ vec4 t=texture2D(uTex,vUV); vec3 base=t.rgb*vC;
      float d=max(dot(normalize(vN),uLightDir),0.0);
      vec3 lit=base*(uAmbient + d*uLightCol);
      float fog=clamp((vDist-uFogNear)/(uFogFar-uFogNear),0.0,1.0);
      gl_FragColor=vec4(mix(lit,uFog,fog), t.a); }`;   // t.a=1 for opaque world; <1 for blended decals
  const SKY_VS = `attribute vec2 aP; varying vec2 vUv; void main(){ vUv=aP*0.5+0.5; gl_Position=vec4(aP,1.0,1.0); }`;
  const SKY_FS = `precision mediump float; varying vec2 vUv; uniform vec3 uTop,uMid,uHorizon;
    void main(){ float y=vUv.y; vec3 c = y>0.5 ? mix(uMid,uTop,(y-0.5)*2.0) : mix(uHorizon,uMid,y*2.0); gl_FragColor=vec4(c,1.0); }`;

  function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('GLR shader', gl.getShaderInfoLog(s)); return null; } return s; }
  function link(vs, fs) { const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('GLR link', gl.getProgramInfoLog(p)); return null; } return p; }

  // ── procedural bitmap textures (drawn on a 2D canvas, uploaded mipmapped/repeat) ──
  function makeTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }
  function drawWall(x, S) { x.fillStyle = '#c8b48a'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) { const v = Math.random(); x.fillStyle = 'rgba(' + (v < 0.5 ? '80,66,48' : '224,208,172') + ',' + (0.04 + Math.random() * 0.06).toFixed(2) + ')'; x.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6); }
    const rows = 4, rh = S / rows, cols = 2, cw = S / cols;
    x.strokeStyle = 'rgba(66,52,36,0.92)'; x.lineWidth = 2.4;
    for (let r = 0; r <= rows; r++) { x.beginPath(); x.moveTo(0, r * rh); x.lineTo(S, r * rh); x.stroke(); }
    for (let r = 0; r < rows; r++) { const off = (r % 2) ? cw / 2 : 0;
      for (let c = 0; c <= cols; c++) { let cx = ((c * cw + off) % S + S) % S; x.beginPath(); x.moveTo(cx, r * rh); x.lineTo(cx, (r + 1) * rh); x.stroke(); }
      for (let c = 0; c < cols; c++) { const bx = c * cw + off; x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0' : '255,240,210') + ',' + (0.03 + Math.random() * 0.05).toFixed(2) + ')'; x.fillRect(bx + 2, r * rh + 2, cw - 4, rh - 4); } }
    x.strokeStyle = 'rgba(255,240,205,0.32)'; x.lineWidth = 1; for (let r = 1; r < rows; r++) { x.beginPath(); x.moveTo(0, r * rh + 2); x.lineTo(S, r * rh + 2); x.stroke(); } }
  function drawFloor(x, S) { x.fillStyle = '#c2b078'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 3200; i++) { const v = Math.random(); x.fillStyle = 'rgba(' + (v < 0.5 ? '92,78,52' : '212,198,152') + ',' + (0.05 + Math.random() * 0.06).toFixed(2) + ')'; x.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6); }
    const n = 4, cs = S / n; x.strokeStyle = 'rgba(68,56,38,0.8)'; x.lineWidth = 2.6;
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * cs, 0); x.lineTo(i * cs, S); x.moveTo(0, i * cs); x.lineTo(S, i * cs); x.stroke(); }
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0' : '255,245,215') + ',' + (0.03 + Math.random() * 0.05).toFixed(2) + ')'; x.fillRect(a * cs + 3, b * cs + 3, cs - 6, cs - 6); } }
  function drawCrate(x, S) { x.fillStyle = '#966d3c'; x.fillRect(0, 0, S, S);
    const p = 6, pw = S / p; for (let i = 0; i < p; i++) { x.fillStyle = 'rgba(' + (i % 2 ? '120,86,48' : '150,109,60') + ',0.5)'; x.fillRect(i * pw, 0, pw, S);
      x.strokeStyle = 'rgba(50,34,18,0.7)'; x.lineWidth = 2; x.beginPath(); x.moveTo(i * pw, 0); x.lineTo(i * pw, S); x.stroke(); }
    for (let i = 0; i < 1500; i++) { x.fillStyle = 'rgba(50,34,18,' + (0.05 + Math.random() * 0.08).toFixed(2) + ')'; x.fillRect(Math.random() * S, Math.random() * S, Math.random() * 8 + 1, 1); }
    x.strokeStyle = 'rgba(40,26,14,0.9)'; x.lineWidth = 8; x.strokeRect(4, 4, S - 8, S - 8); }
  function drawAmmo(x, S) { x.fillStyle = '#606c42'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 1300; i++) { x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '40,48,28' : '130,145,90') + ',' + (0.05 + Math.random() * 0.06).toFixed(2) + ')'; x.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
    const by = S * 0.42, bh = S * 0.16; x.fillStyle = '#c4a43c'; x.fillRect(0, by, S, bh);
    x.fillStyle = 'rgba(30,26,16,0.85)'; for (let i = -S; i < S * 2; i += 28) { x.beginPath(); x.moveTo(i, by); x.lineTo(i + bh, by + bh); x.lineTo(i + bh + 14, by + bh); x.lineTo(i + 14, by); x.closePath(); x.fill(); }
    x.fillStyle = 'rgba(30,36,20,0.9)'; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { if (Math.random() < 0.5) continue; x.beginPath(); x.arc((a + 0.5) * S / 4, (b + 0.5) * S / 4, 3, 0, 7); x.fill(); }
    x.strokeStyle = 'rgba(30,36,20,0.9)'; x.lineWidth = 6; x.strokeRect(3, 3, S - 6, S - 6); }
  function drawHole(x, S) { x.clearRect(0, 0, S, S); const c = S / 2;
    const g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(10,8,6,0.96)'); g.addColorStop(0.4, 'rgba(22,18,13,0.82)'); g.addColorStop(0.7, 'rgba(44,37,28,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(c, c, c, 0, 7); x.fill();
    x.strokeStyle = 'rgba(14,11,8,0.7)'; x.lineWidth = 1.6; for (let i = 0; i < 8; i++) { const a = Math.random() * 7, rr = c * (0.5 + Math.random() * 0.42); x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); x.stroke(); }
    x.strokeStyle = 'rgba(205,185,150,0.28)'; x.lineWidth = 2; x.beginPath(); x.arc(c, c, c * 0.3, 0, 7); x.stroke(); }
  function drawScorch(x, S) { x.clearRect(0, 0, S, S); const c = S / 2; const g = x.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,205,95,0.95)'); g.addColorStop(0.5, 'rgba(255,95,40,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(c, c, c, 0, 7); x.fill(); }
  // a decal quad on a surface → pushed into arr (STRIDE format), UV 0..1, fade dimmed via vertex color
  function decalQuad(arr, dc) {
    const n = dc.n || [0, 1, 0]; const t1 = (Math.abs(n[1]) > 0.9) ? [1, 0, 0] : [0, 1, 0];
    let a = cross(t1, n); const al = Math.hypot(a[0], a[1], a[2]) || 1; a = [a[0] / al, a[1] / al, a[2] / al]; const b = cross(n, a);
    const r = (dc.r || 0.1) * 1.35, f = Math.max(0, Math.min(1, (dc.life || 1) / (dc.max || 1))), col = [f, f, f];
    const P = (sa, sb) => [dc.x + a[0] * r * sa + b[0] * r * sb, dc.y + a[1] * r * sa + b[1] * r * sb, dc.z + a[2] * r * sa + b[2] * r * sb];
    const p0 = P(-1, -1), p1 = P(1, -1), p2 = P(1, 1), p3 = P(-1, 1);
    const push = (p, u, v) => arr.push(p[0], p[1], p[2], n[0], n[1], n[2], u, v, col[0], col[1], col[2]);
    push(p0, 0, 0); push(p1, 1, 0); push(p2, 1, 1); push(p0, 0, 0); push(p2, 1, 1); push(p3, 0, 1);
  }
  function buildDecals(G) { const hole = [], scorch = []; if (G.decals) for (const dc of G.decals) decalQuad(dc.type === 'laser' ? scorch : hole, dc); return { hole, scorch }; }
  function whiteTex() { const c = document.createElement('canvas'); c.width = c.height = 2; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 2, 2);
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }

  // ── geometry emit ──
  function quad(a, p0, p1, p2, p3, n, su, sv, col) {
    const v = (p, u, w) => { a.push(p[0], p[1], p[2], n[0], n[1], n[2], u, w, col[0], col[1], col[2]); };
    v(p0, 0, 0); v(p1, su, 0); v(p2, su, sv); v(p0, 0, 0); v(p2, su, sv); v(p3, 0, sv);
  }
  // a box → 5 faces (skip bottom), UVs scaled by world size / tile so textures tile at real scale
  function box(a, x0, y0, z0, x1, y1, z1, tile, col) {
    const wx = (x1 - x0) / tile, wy = (y1 - y0) / tile, wz = (z1 - z0) / tile;
    quad(a, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], wx, wz, col);            // top
    quad(a, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], wx, wy, col);            // +z
    quad(a, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], wx, wy, col);           // -z
    quad(a, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], wz, wy, col);            // +x
    quad(a, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], wz, wy, col);           // -x
  }
  function matForKind(k) { if (k === 'ammo') return 'ammo'; if (k === 'crate' || k === 'shelf' || k === 'cover') return 'crate'; return 'wall'; }

  function makeVBO(arr) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); return { vbo: b, count: arr.length / STRIDE }; }
  function buildMap(MAP) {
    if (!ok) return;
    for (const k in buffers) { if (buffers[k]) gl.deleteBuffer(buffers[k].vbo); }
    buffers = {};
    const A = { floor: [], wall: [], crate: [], ammo: [] };
    const WHITE = [1, 1, 1];
    // floor plane (one big textured quad)
    quad(A.floor, [MAP.x0, 0, MAP.z0], [MAP.x1, 0, MAP.z0], [MAP.x1, 0, MAP.z1], [MAP.x0, 0, MAP.z1], [0, 1, 0], (MAP.x1 - MAP.x0) / TILE.floor, (MAP.z1 - MAP.z0) / TILE.floor, WHITE);
    for (const b of MAP.solids) { const m = matForKind(b.kind); box(A[m], b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, TILE[m], WHITE); }
    for (const k of MATS) if (A[k].length) buffers[k] = makeVBO(A[k]);
  }

  // ── oriented geometry for rigs (limb boxes + axis boxes) ──
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function quadN(a, p0, p1, p2, p3, n, col) { const v = p => a.push(p[0], p[1], p[2], n[0], n[1], n[2], 0, 0, col[0], col[1], col[2]);
    v(p0); v(p1); v(p2); v(p0); v(p2); v(p3); }
  // an oriented box spanning joints A→B (long axis u), half-thick rR × rF, one flat color, shaded by GL lighting
  function limbBox(a, A, B, rR, rF, col) {
    const ax = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]; const L = Math.hypot(ax[0], ax[1], ax[2]) || 1e-4; const u = [ax[0] / L, ax[1] / L, ax[2] / L];
    const ref = (Math.abs(u[1]) > 0.9) ? [0, 0, 1] : [0, 1, 0];
    let r = cross(ref, u); const rl = Math.hypot(r[0], r[1], r[2]) || 1e-4; r = [r[0] / rl, r[1] / rl, r[2] / rl];
    const f = cross(u, r);
    const cx = (A[0] + B[0]) / 2, cy = (A[1] + B[1]) / 2, cz = (A[2] + B[2]) / 2, hL = L / 2;
    const C = (sr, su, sf) => [cx + r[0] * rR * sr + u[0] * hL * su + f[0] * rF * sf, cy + r[1] * rR * sr + u[1] * hL * su + f[1] * rF * sf, cz + r[2] * rR * sr + u[2] * hL * su + f[2] * rF * sf];
    const V = [C(-1, -1, -1), C(1, -1, -1), C(1, -1, 1), C(-1, -1, 1), C(-1, 1, -1), C(1, 1, -1), C(1, 1, 1), C(-1, 1, 1)];
    const nn = v => [-v[0], -v[1], -v[2]];
    quadN(a, V[4], V[5], V[6], V[7], u, col); quadN(a, V[0], V[1], V[2], V[3], nn(u), col);
    quadN(a, V[1], V[2], V[6], V[5], r, col); quadN(a, V[0], V[3], V[7], V[4], nn(r), col);
    quadN(a, V[2], V[3], V[7], V[6], f, col); quadN(a, V[0], V[1], V[5], V[4], nn(f), col);
  }
  // axis-aligned box from center + half extents (order-safe), flat color
  function cbox(a, cx, cy, cz, hx, hy, hz, col) { box(a, cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz, 1, col); }

  // ── operatives: the full articulated rig ported to GL (walk/run/jump), lit by the scene ──
  function buildEntities(G) {
    const a = [], T = G.t || 0;
    for (const e of G.ents) { if (!e.alive || e.isMe) continue;
      const flick = (e.spawnT > 0 || e.iframe > 0) ? (Math.sin(T * 30) > 0 ? 0.45 : 1) : 1, m = c => [c[0] * flick, c[1] * flick, c[2] * flick];
      const khaki = m([0.59, 0.52, 0.36]), boot = m([0.18, 0.16, 0.13]), vest = m([e.tint[0] / 255, e.tint[1] / 255, e.tint[2] / 255]),
        pack = m([0.47, 0.41, 0.28]), skin = m([0.77, 0.59, 0.45]), cap = m([0.25, 0.27, 0.19]), gunC = m([0.17, 0.18, 0.2]), hands = m([0.69, 0.52, 0.41]);
      const yaw = e.yaw, fwd = [Math.sin(yaw), 0, Math.cos(yaw)], rgt = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const J = (lx, ly, lz) => [e.x + rgt[0] * lx + fwd[0] * lz, e.y + ly, e.z + rgt[2] * lx + fwd[2] * lz];
      const air = !e.onGround, run = e.sprinting, p = e.gait || 0;
      const A = air ? 0.35 : (run ? 0.95 : 0.55), swL = A * Math.sin(p), swR = A * Math.sin(p + Math.PI);
      const bounce = air ? 0 : (run ? 0.055 : 0.03) * Math.abs(Math.sin(p * 2)) * 0.5, lean = air ? 0.1 : (run ? 0.17 : (e.moving ? 0.06 : 0));
      const hipH = 0.84 - (air ? 0.05 : 0) + bounce, chestY = hipH + 0.44, headY = chestY + 0.2, lz = lean * 0.42;
      limbBox(a, J(0, hipH, 0), J(0, chestY, lz), 0.24, 0.15, vest);
      limbBox(a, J(0, hipH - 0.03, 0), J(0, hipH + 0.05, 0), 0.27, 0.18, khaki);
      limbBox(a, J(0, chestY + 0.06, -0.19), J(0, chestY - 0.16, -0.24), 0.18, 0.12, pack);
      limbBox(a, J(0, chestY + 0.04, lz), J(0, headY + 0.12, lz), 0.15, 0.15, skin);
      limbBox(a, J(0, headY + 0.07, lz), J(0, headY + 0.17, lz - 0.02), 0.17, 0.16, cap);
      const leg = (side, sw) => { const t = sw, TH = 0.44, SH = 0.42;
        const b = air ? 0.85 : Math.max(0, 0.9 * Math.sin(p + (side < 0 ? 0 : Math.PI) + 0.4));
        const hip = J(side * 0.1, hipH, 0);
        const knee = [hip[0] + fwd[0] * (-TH * Math.sin(t)), hip[1] - TH * Math.cos(t), hip[2] + fwd[2] * (-TH * Math.sin(t))];
        const ta = t + b, ankle = [knee[0] + fwd[0] * (-SH * Math.sin(ta)), knee[1] - SH * Math.cos(ta), knee[2] + fwd[2] * (-SH * Math.sin(ta))];
        limbBox(a, hip, knee, 0.12, 0.12, khaki); limbBox(a, knee, ankle, 0.1, 0.1, khaki);
        limbBox(a, ankle, [ankle[0] + fwd[0] * 0.17, ankle[1] - 0.02, ankle[2] + fwd[2] * 0.17], 0.11, 0.09, boot); };
      leg(-1, swL); leg(1, swR);
      const rSh = J(0.2, chestY + 0.02, lz), lSh = J(-0.2, chestY + 0.02, lz);
      const rHand = J(0.12, chestY - 0.12, 0.34), lHand = J(-0.05, chestY - 0.05, 0.46);
      const rElb = J(0.24, chestY - 0.1, 0.12), lElb = J(-0.18, chestY - 0.06, 0.22);
      limbBox(a, rSh, rElb, 0.08, 0.08, vest); limbBox(a, rElb, rHand, 0.07, 0.07, hands);
      limbBox(a, lSh, lElb, 0.08, 0.08, vest); limbBox(a, lElb, lHand, 0.07, 0.07, hands);
      const muzJ = J(0.03, chestY - 0.06, 0.64); limbBox(a, rHand, muzJ, 0.05, 0.05, gunC);
      limbBox(a, J(0.07, chestY - 0.24, 0.36), J(0.07, chestY - 0.08, 0.4), 0.04, 0.05, gunC);
      if (e.muzzle > 0) limbBox(a, muzJ, J(0.03, chestY - 0.06, 0.74), 0.1, 0.1, [1, 0.9, 0.47]);
    }
    return a;
  }

  // ── first-person weapon viewmodel (built in view space: camera at origin, looking down -z) ──
  function buildViewmodel(G) {
    const e = G.me; if (!e || !e.alive) return []; const a = [];
    const key = G.__weapKey || 'smg';
    const bx = Math.sin(e.bob || 0) * 0.007 * (e.moving ? 1 : 0.25), by = Math.abs(Math.cos(e.bob || 0)) * 0.006 * (e.moving ? 1 : 0.25);
    const kick = e.recoil || 0, sway = Math.sin((e.bob || 0) * 0.5) * 0.01;
    const ox = 0.17 + bx + sway, oy = -0.23 + by - kick * 0.015, oz = -0.44 + kick * 0.05;   // gun anchor (lower-right, close) in view space
    const metal = [0.14, 0.15, 0.17], wood = [0.5, 0.34, 0.18], rail = [0.09, 0.09, 0.11], glove = [0.22, 0.21, 0.19], skin = [0.72, 0.55, 0.42], ir = [0.6, 0.3, 0.28];
    const long = key === 'sniper', pistol = key === 'pistol', shotgun = key === 'shotgun';
    const bl = pistol ? 0.16 : (long ? 0.34 : 0.24);     // barrel length forward from receiver front
    // receiver
    cbox(a, ox, oy, oz - 0.16, 0.035, 0.04, 0.16, metal);
    // handguard / foregrip (wood on shotgun, rail otherwise)
    cbox(a, ox, oy + 0.012, oz - 0.34, 0.03, 0.032, 0.11, shotgun ? wood : rail);
    // barrel + muzzle
    cbox(a, ox, oy + 0.016, oz - 0.34 - bl * 0.5, 0.013, 0.013, bl * 0.5, metal);
    if (!pistol) cbox(a, ox, oy + 0.06, oz - 0.5, 0.008, 0.03, 0.012, metal);   // front sight post
    // optic / rear sight
    if (long) { cbox(a, ox, oy + 0.085, oz - 0.16, 0.02, 0.022, 0.11, metal); cbox(a, ox, oy + 0.107, oz - 0.05, 0.026, 0.026, 0.028, rail); cbox(a, ox, oy + 0.107, oz - 0.27, 0.026, 0.026, 0.028, ir); }
    else { cbox(a, ox, oy + 0.06, oz - 0.02, 0.02, 0.02, 0.05, metal); cbox(a, ox, oy + 0.086, oz - 0.06, 0.018, 0.018, 0.075, metal); cbox(a, ox, oy + 0.086, oz - 0.135, 0.02, 0.02, 0.006, ir); }
    // magazine (curved-ish: two stacked slanted boxes)
    if (!pistol) { cbox(a, ox + 0.005, oy - 0.1, oz - 0.06, 0.02, 0.07, 0.028, metal); cbox(a, ox + 0.012, oy - 0.19, oz - 0.02, 0.018, 0.05, 0.024, metal); }
    else cbox(a, ox, oy - 0.09, oz - 0.02, 0.018, 0.06, 0.02, metal);
    // pistol grip
    cbox(a, ox + 0.004, oy - 0.06, oz - 0.02, 0.02, 0.05, 0.022, metal);
    // stock (behind receiver)
    if (!pistol) cbox(a, ox, oy - 0.004, oz + 0.02, 0.026, shotgun ? 0.035 : 0.03, 0.09, shotgun ? wood : metal);
    // hands (gloved) + forearms coming up from the bottom of the screen
    const rGrip = [ox + 0.012, oy - 0.075, oz - 0.02], lGrip = [ox - 0.022, oy - 0.02, oz - 0.36];
    cbox(a, rGrip[0], rGrip[1], rGrip[2], 0.03, 0.04, 0.035, glove);
    cbox(a, lGrip[0], lGrip[1], lGrip[2], 0.036, 0.036, 0.05, glove);
    limbBox(a, [ox + 0.13, oy - 0.42, oz + 0.16], rGrip, 0.04, 0.04, glove);     // right forearm (gloved)
    limbBox(a, [ox - 0.17, oy - 0.44, oz + 0.02], lGrip, 0.04, 0.04, glove);     // left forearm (gloved)
    // muzzle flash
    if (e.muzzle > 0) cbox(a, ox, oy + 0.016, oz - 0.34 - bl, 0.05, 0.05, 0.05, [1, 0.92, 0.5]);
    return a;
  }

  function bindAttribs(p) { const s = STRIDE * 4;
    gl.enableVertexAttribArray(p.aPos); gl.vertexAttribPointer(p.aPos, 3, gl.FLOAT, false, s, 0);
    gl.enableVertexAttribArray(p.aNormal); gl.vertexAttribPointer(p.aNormal, 3, gl.FLOAT, false, s, 12);
    gl.enableVertexAttribArray(p.aUV); gl.vertexAttribPointer(p.aUV, 2, gl.FLOAT, false, s, 24);
    gl.enableVertexAttribArray(p.aColor); gl.vertexAttribPointer(p.aColor, 3, gl.FLOAT, false, s, 32); }

  function init(canvas) {
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: true }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return false; cv = canvas;
    prog = link(VS, FS); sky = link(SKY_VS, SKY_FS); if (!prog || !sky) return false;
    loc = {}; ['aPos', 'aNormal', 'aUV', 'aColor'].forEach(n => loc[n] = gl.getAttribLocation(prog, n));
    ['uMVP', 'uCam', 'uTex', 'uLightDir', 'uLightCol', 'uAmbient', 'uFog', 'uFogNear', 'uFogFar'].forEach(n => loc[n] = gl.getUniformLocation(prog, n));
    skyLoc.aP = gl.getAttribLocation(sky, 'aP'); ['uTop', 'uMid', 'uHorizon'].forEach(n => skyLoc[n] = gl.getUniformLocation(sky, n));
    tex.wall = makeTex(256, drawWall); tex.floor = makeTex(256, drawFloor); tex.crate = makeTex(256, drawCrate); tex.ammo = makeTex(256, drawAmmo); tex.white = whiteTex();
    tex.hole = makeTex(64, drawHole); tex.scorch = makeTex(64, drawScorch);
    dynBuf = gl.createBuffer();
    skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    ok = true; return true;
  }

  function frame(cam, G, ENV) {
    if (!ok) return;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky (fills the screen behind the world)
    gl.useProgram(sky); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.enableVertexAttribArray(skyLoc.aP); gl.vertexAttribPointer(skyLoc.aP, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(skyLoc.uTop, ENV.skyTop); gl.uniform3fv(skyLoc.uMid, ENV.skyMid); gl.uniform3fv(skyLoc.uHorizon, ENV.skyHorizon);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    // world
    gl.useProgram(prog);
    const fovy = 0.97 / (G.scopeZoom || 1), asp = cv.width / cv.height;   // match the canvas FOV so aim/look feel is identical
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), f = [cp * Math.sin(cam.yaw), sp, cp * Math.cos(cam.yaw)];
    const eye = [cam.x, cam.y, cam.z];
    const mvp = mul(persp(fovy, asp, 0.06, 60), lookAt(eye, [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]], [0, 1, 0]));
    gl.uniformMatrix4fv(loc.uMVP, false, new Float32Array(mvp));
    gl.uniform3fv(loc.uCam, eye);
    gl.uniform3fv(loc.uLightDir, ENV.lightDir); gl.uniform3fv(loc.uLightCol, ENV.lightCol); gl.uniform3fv(loc.uAmbient, ENV.ambient);
    gl.uniform3fv(loc.uFog, ENV.fog); gl.uniform1f(loc.uFogNear, 16); gl.uniform1f(loc.uFogFar, 54);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(loc.uTex, 0);
    for (const k of MATS) { const b = buffers[k]; if (!b) continue; gl.bindTexture(gl.TEXTURE_2D, tex[k]); gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo); bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, b.count); }
    const ea = buildEntities(G);
    if (ea.length) { gl.bindTexture(gl.TEXTURE_2D, tex.white); gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ea), gl.DYNAMIC_DRAW); bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, ea.length / STRIDE); }
    // ── decals: depth-tested against the world (so they STICK to surfaces + occlude correctly), blended, no depth write ──
    const D = buildDecals(G);
    if (D.hole.length || D.scorch.length) {
      gl.enable(gl.BLEND); gl.depthMask(false);
      if (D.hole.length) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.bindTexture(gl.TEXTURE_2D, tex.hole);
        gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(D.hole), gl.DYNAMIC_DRAW); bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, D.hole.length / STRIDE); }
      if (D.scorch.length) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.bindTexture(gl.TEXTURE_2D, tex.scorch);
        gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(D.scorch), gl.DYNAMIC_DRAW); bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, D.scorch.length / STRIDE); }
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    // ── first-person weapon viewmodel: rendered over the world on its own cleared depth ──
    if (G.me && G.me.alive && !G.me.scoped) {
      const va = buildViewmodel(G);
      if (va.length) {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(loc.uMVP, false, new Float32Array(persp(1.02, asp, 0.01, 6)));
        gl.uniform3fv(loc.uCam, [0, 0, 3]);
        gl.uniform1f(loc.uFogNear, 900); gl.uniform1f(loc.uFogFar, 1000);
        gl.uniform3fv(loc.uLightDir, VMLIGHT); gl.uniform3fv(loc.uLightCol, [0.85, 0.8, 0.72]); gl.uniform3fv(loc.uAmbient, [0.5, 0.49, 0.47]);
        gl.bindTexture(gl.TEXTURE_2D, tex.white);
        gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(va), gl.DYNAMIC_DRAW); bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, va.length / STRIDE);
      }
    }
  }

  return { init, buildMap, frame, supported: () => ok };
})();

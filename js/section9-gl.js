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
      gl_FragColor=vec4(mix(lit,uFog,fog),1.0); }`;
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

  // ── operatives: simple textured boxes (full rig comes in W2); tint via vertex color ──
  function buildEntities(G) {
    const a = []; const cam = G.__cam || null;
    for (const e of G.ents) { if (!e.alive || e.isMe) continue;
      const t = e.tint, tint = [t[0] / 255, t[1] / 255, t[2] / 255], khaki = [0.59, 0.52, 0.36], skin = [0.77, 0.59, 0.46], gun = [0.17, 0.18, 0.2];
      const y0 = e.y, d = { x: Math.sin(e.yaw), z: Math.cos(e.yaw) }, rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);
      box(a, e.x - 0.22, y0, e.z - 0.16, e.x - 0.02, y0 + 0.86, e.z + 0.16, 1, khaki);
      box(a, e.x + 0.02, y0, e.z - 0.16, e.x + 0.22, y0 + 0.86, e.z + 0.16, 1, khaki);
      box(a, e.x - 0.3, y0 + 0.86, e.z - 0.2, e.x + 0.3, y0 + 1.4, e.z + 0.2, 1, tint);
      box(a, e.x - 0.15, y0 + 1.4, e.z - 0.15, e.x + 0.15, y0 + 1.72, e.z + 0.15, 1, skin);
      const gx = e.x + d.x * 0.34 + rx * 0.14, gz = e.z + d.z * 0.34 + rz * 0.14, gy = y0 + 1.06;
      box(a, Math.min(e.x, gx) - 0.05, gy - 0.05, Math.min(e.z, gz) - 0.05, Math.max(e.x, gx) + 0.05, gy + 0.06, Math.max(e.z, gz) + 0.05, 1, gun);
    }
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
    const fovy = 1.06 / (G.scopeZoom || 1), asp = cv.width / cv.height;
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
  }

  return { init, buildMap, frame, supported: () => ok };
})();

/* upperdeckripmaster3030 — NEON RONIN 3D engine (Ronin3D).  [Milestone 2]
 *
 * A real WebGL 3D renderer for the duel. Perspective camera tracking the fighters; lit,
 * depth-tested scene with fog; a neon-grid arena floor with WET-FLOOR REFLECTIONS and soft
 * contact shadows; a moon and back skyline for depth. Fighters are 3D articulated models —
 * smooth cylinder limbs + sphere joints/heads built from the existing 2D IK skeleton
 * (RoninArt.skel), with per-archetype 3D touches (ronin hat, oni horns, kappa shell). All
 * combat/IK/combo/card/wager logic in ronin.js is untouched; only the render path changes.
 *
 *   Ronin3D.init(canvas) → true if live · Ronin3D.render(G) → draw the scene
 */
window.Ronin3D = (function () {
  const PI = Math.PI, TAU = PI * 2;
  const M = {
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    ident() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
    T(x, y, z) { const o = M.ident(); o[12] = x; o[13] = y; o[14] = z; return o; },
    S(x, y, z) { const o = M.ident(); o[0] = x; o[5] = y; o[10] = z; return o; },
    Rz(a) { const o = M.ident(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; },
    Ry(a) { const o = M.ident(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
    persp(f, a, n, fa) { const o = new Float32Array(16), t = 1 / Math.tan(f / 2); o[0] = t / a; o[5] = t; o[10] = (fa + n) / (n - fa); o[11] = -1; o[14] = 2 * fa * n / (n - fa); return o; },
    look(e, c, up) { const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x); const o = M.ident();
      o[0] = x[0]; o[4] = x[1]; o[8] = x[2]; o[1] = y[0]; o[5] = y[1]; o[9] = y[2]; o[2] = z[0]; o[6] = z[1]; o[10] = z[2];
      o[12] = -dot(x, e); o[13] = -dot(y, e); o[14] = -dot(z, e); return o; },
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  let gl = null, cv = null, ok = false;
  let litProg, groundProg;
  const geo = {};                                            // {buf,count} per mesh
  const SC = 0.019;

  const LIT_VS = 'attribute vec3 aPos; attribute vec3 aNorm; uniform mat4 uMVP; uniform mat4 uModel;' +
    'varying vec3 vN; varying vec3 vW; void main(){ vN=mat3(uModel)*aNorm; vW=(uModel*vec4(aPos,1.0)).xyz; gl_Position=uMVP*vec4(aPos,1.0); }';
  const LIT_FS = 'precision mediump float; varying vec3 vN; varying vec3 vW;' +
    'uniform vec3 uColor; uniform float uEmis; uniform float uAlpha; uniform vec3 uLight; uniform vec3 uCam; uniform vec3 uFog; uniform vec2 uFogND;' +
    'void main(){ vec3 N=normalize(vN); float d=max(0.0,dot(N,normalize(uLight)));' +
    'vec3 lit=uColor*(0.26+0.9*d); vec3 V=normalize(uCam-vW); float rim=pow(1.0-max(0.0,dot(N,V)),3.0); lit+=uColor*rim*0.55;' +
    'float sp=pow(max(0.0,dot(reflect(-normalize(uLight),N),V)),26.0); lit+=vec3(sp)*0.4;' +
    'lit=mix(lit,uColor*1.2,uEmis);' +
    'float fg=clamp((distance(uCam,vW)-uFogND.x)/(uFogND.y-uFogND.x),0.0,1.0);' +
    'gl_FragColor=vec4(mix(lit,uFog,fg),uAlpha); }';
  const GND_VS = 'attribute vec3 aPos; uniform mat4 uMVP; uniform mat4 uModel; varying vec3 vW;' +
    'void main(){ vW=(uModel*vec4(aPos,1.0)).xyz; gl_Position=uMVP*vec4(aPos,1.0); }';
  const GND_FS = 'precision mediump float; varying vec3 vW; uniform vec3 uCam; uniform vec3 uFog; uniform vec2 uFogND; uniform float uAlpha;' +
    'void main(){ vec2 g=abs(fract(vW.xz*0.5)-0.5); float line=1.0-smoothstep(0.0,0.06,min(g.x,g.y));' +
    'vec3 col=mix(vec3(0.04,0.02,0.08), vec3(0.7,0.16,0.85), line*0.8);' +
    'float glow=1.0-smoothstep(0.0,2.4,abs(vW.z)); col+=vec3(1.0,0.16,0.85)*glow*0.5;' +
    'float fg=clamp((distance(uCam,vW)-uFogND.x)/(uFogND.y-uFogND.x),0.0,1.0);' +
    'gl_FragColor=vec4(mix(col,uFog,fg),uAlpha); }';

  function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; }
  function prog(v, f) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aNorm'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p); return p; }
  function mesh(name, verts) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW); geo[name] = { buf: b, count: verts.length / 6 }; }

  function cubeV() { const f = [[[0, 0, 1], [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]]], [[0, 0, -1], [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]]], [[1, 0, 0], [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]]], [[-1, 0, 0], [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]]], [[0, 1, 0], [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]]], [[0, -1, 0], [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]]]];
    const v = []; for (const [n, q] of f) for (const i of [0, 1, 2, 0, 2, 3]) v.push(q[i][0], q[i][1], q[i][2], n[0], n[1], n[2]); return v; }
  function cylV(seg) { const v = [], r = .5; for (let i = 0; i < seg; i++) { const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r, n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
    v.push(x0, -.5, z0, n0[0], 0, n0[2], x1, -.5, z1, n1[0], 0, n1[2], x1, .5, z1, n1[0], 0, n1[2], x0, -.5, z0, n0[0], 0, n0[2], x1, .5, z1, n1[0], 0, n1[2], x0, .5, z0, n0[0], 0, n0[2]);
    v.push(0, .5, 0, 0, 1, 0, x0, .5, z0, 0, 1, 0, x1, .5, z1, 0, 1, 0, 0, -.5, 0, 0, -1, 0, x1, -.5, z1, 0, -1, 0, x0, -.5, z0, 0, -1, 0); } return v; }
  function sphV(la, lo) { const v = [], r = .5, P = (t, p) => [Math.sin(t) * Math.cos(p) * r, Math.cos(t) * r, Math.sin(t) * Math.sin(p) * r], N = q => { const l = Math.hypot(q[0], q[1], q[2]) || 1; return [q[0] / l, q[1] / l, q[2] / l]; };
    for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) { const t0 = i / la * PI, t1 = (i + 1) / la * PI, p0 = j / lo * TAU, p1 = (j + 1) / lo * TAU, a = P(t0, p0), b = P(t1, p0), c = P(t1, p1), d = P(t0, p1), na = N(a), nb = N(b), nc = N(c), nd = N(d);
      v.push(a[0], a[1], a[2], na[0], na[1], na[2], b[0], b[1], b[2], nb[0], nb[1], nb[2], c[0], c[1], c[2], nc[0], nc[1], nc[2], a[0], a[1], a[2], na[0], na[1], na[2], c[0], c[1], c[2], nc[0], nc[1], nc[2], d[0], d[1], d[2], nd[0], nd[1], nd[2]); } return v; }

  function init(canvas) {
    try { cv = canvas; gl = cv.getContext('webgl', { antialias: true, alpha: false }) || cv.getContext('experimental-webgl'); if (!gl) return false;
      litProg = prog(LIT_VS, LIT_FS); groundProg = prog(GND_VS, GND_FS);
      mesh('cube', cubeV()); mesh('cyl', cylV(10)); mesh('sph', sphV(8, 12));
      mesh('quad', [-.5, 0, -.5, 0, 1, 0, .5, 0, -.5, 0, 1, 0, .5, 0, .5, 0, 1, 0, -.5, 0, -.5, 0, 1, 0, .5, 0, .5, 0, 1, 0, -.5, 0, .5, 0, 1, 0]);
      gl.enable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); ok = true; return true;
    } catch (e) { ok = false; gl = null; return false; }
  }

  const FOG = [0.07, 0.03, 0.15];
  let camPos = [0, 3, 9], t3 = 0, VP = null;
  const u = (p, n) => gl.getUniformLocation(p, n);
  const hex = h => { const n = parseInt((h || '#c9d2e6').slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const sc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  function bind(name) { const g = geo[name]; gl.bindBuffer(gl.ARRAY_BUFFER, g.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); return g.count; }
  let curMesh = '';
  function draw(name, model, color, emis, alpha) { if (curMesh !== name) { bind(name); curMesh = name; }
    gl.uniformMatrix4fv(u(litProg, 'uMVP'), false, M.mul(VP, model)); gl.uniformMatrix4fv(u(litProg, 'uModel'), false, model);
    gl.uniform3fv(u(litProg, 'uColor'), color); gl.uniform1f(u(litProg, 'uEmis'), emis || 0); gl.uniform1f(u(litProg, 'uAlpha'), alpha == null ? 1 : alpha);
    gl.drawArrays(gl.TRIANGLES, 0, geo[name].count); }
  function setLit() { gl.useProgram(litProg); curMesh = ''; gl.uniform3fv(u(litProg, 'uLight'), [0.35, 0.9, 0.5]); gl.uniform3fv(u(litProg, 'uCam'), camPos); gl.uniform3fv(u(litProg, 'uFog'), FOG); gl.uniform2fv(u(litProg, 'uFogND'), [17, 58]); }

  // cylinder beam between two LOCAL 2D skeleton points (px, y-down) inside a fighter matrix
  function beam(fm, a, b, r, color, emis, alpha) { const ax = a.x, ay = -a.y, bx = b.x, by = -b.y, L = Math.hypot(bx - ax, by - ay) || .001, th = Math.atan2(by - ay, bx - ax);
    draw('cyl', M.mul(fm, M.mul(M.mul(M.T((ax + bx) / 2, (ay + by) / 2, 0), M.Rz(th - PI / 2)), M.S(r * 2, L, r * 2))), color, emis, alpha); }
  function ball(fm, p, r, color, emis, alpha) { draw('sph', M.mul(fm, M.mul(M.T(p.x, -p.y, 0), M.S(r * 2, r * 2, r * 2))), color, emis, alpha); }
  function bit(fm, x, y, sx, sy, sz, color, emis, alpha) { draw('cube', M.mul(fm, M.mul(M.T(x, -y, 0), M.S(sx, sy, sz))), color, emis, alpha); }

  function fighterMatrix(f, mirror) { let fm = M.mul(M.mul(M.mul(M.T(f.x * SC, f.yLift * SC, 0), M.Ry(f.face < 0 ? PI : 0)), M.Rz((f.rig && f.rig.bodyRot) || 0)), M.S(SC, SC, SC));
    return mirror ? M.mul(M.S(1, -1, 1), fm) : fm; }

  function drawFighter(f, mirror) {
    const K = RoninArt.skel(f); const fm = fighterMatrix(f, mirror);
    const a = mirror ? 0.30 : 1, dk = mirror ? 0.45 : 1;
    const col = sc(hex(f.col), dk), colB = sc(col, 0.82), tint = sc(hex(f.tint), dk);
    // legs
    beam(fm, K.legB[0], K.legB[1], 8.5, colB, 0, a); beam(fm, K.legB[1], K.legB[2], 7.5, colB, 0, a); ball(fm, K.legB[1], 8, colB, 0, a);
    beam(fm, K.legF[0], K.legF[1], 9, col, 0, a); beam(fm, K.legF[1], K.legF[2], 8, col, 0, a); ball(fm, K.legF[1], 8.5, col, 0, a);
    bit(fm, K.legF[2].x, K.legF[2].y, 22, 8, 15, sc([0.06, 0.06, 0.09], dk), 0.3, a); bit(fm, K.legB[2].x, K.legB[2].y, 20, 8, 14, sc([0.05, 0.05, 0.07], dk), 0.3, a);
    // torso + hips/chest
    ball(fm, K.pelvis, 13, col, 0, a); beam(fm, K.pelvis, K.chest, 14, col, 0, a); ball(fm, K.chest, 15, col, 0, a);
    // back arm
    beam(fm, K.armB[0], K.armB[1], 7, colB, 0, a); beam(fm, K.armB[1], K.armB[2], 6, colB, 0, a); ball(fm, K.armB[1], 6.5, colB, 0, a);
    // head + band + per-arch flourish
    ball(fm, K.head, 15, col, 0.12, a);
    bit(fm, K.head.x, K.head.y + 5, 30, 6, 30, tint, 0.5, a);
    archHead(fm, f, K, tint, a, dk);
    // front arm + weapon
    beam(fm, K.armF[0], K.armF[1], 7, col, 0, a); beam(fm, K.armF[1], K.armF[2], 6, col, 0, a); ball(fm, K.armF[1], 6.5, col, 0, a);
    const blade = f.glow > 0 ? [1, 0.9, 0.5] : [0.92, 0.97, 1];
    beam(fm, K.sword.hand, K.sword.tip, f.glow > 0 ? 5 : 3.5, sc(blade, dk), 1, a);
  }
  function archHead(fm, f, K, tint, a, dk) {
    const art = (f.a && f.a.face) || '', h = K.head;
    if (f.arch === 'oni' || art === 'oni') { for (const s of [-1, 1]) beam(fm, { x: h.x + s * 8, y: h.y + 12 }, { x: h.x + s * 15, y: h.y + 30 }, 4, sc([0.95, 0.92, 0.82], dk), 0.2, a); }
    else if (f.arch === 'ronin' || art === 'ronin') { draw('cyl', M.mul(fm, M.mul(M.T(h.x, -h.y - 12, 0), M.S(60, 6, 60))), sc([0.79, 0.63, 0.35], dk), 0.15, a); }
    else if (f.arch === 'kappa' || art === 'pepe') { const bk = { x: (K.pelvis.x + K.chest.x) / 2 - 14, y: (K.pelvis.y + K.chest.y) / 2 };
      draw('sph', M.mul(fm, M.mul(M.T(bk.x, -bk.y, 0), M.S(30, 40, 34))), sc([0.42, 0.29, 0.14], dk), 0.08, a); }
  }
  function drawShadow(f) { const x = f.x * SC, r = 0.55; const m = M.mul(M.mul(M.T(x, 0.02, 0), M.S(r * 2.2, 1, r * 1.3)), M.ident());
    if (curMesh !== 'quad') { bind('quad'); curMesh = 'quad'; }
    gl.uniformMatrix4fv(u(litProg, 'uMVP'), false, M.mul(VP, m)); gl.uniformMatrix4fv(u(litProg, 'uModel'), false, m);
    gl.uniform3fv(u(litProg, 'uColor'), [0, 0, 0]); gl.uniform1f(u(litProg, 'uEmis'), 1); gl.uniform1f(u(litProg, 'uAlpha'), f.dead ? 0.15 : 0.42); gl.drawArrays(gl.TRIANGLES, 0, 6); }

  function render(G) {
    if (!ok || !G) return false;
    try {
      const dpr = Math.min(2, window.devicePixelRatio || 1), Wp = innerWidth * dpr, Hp = innerHeight * dpr;
      if (cv.width !== Wp || cv.height !== Hp) { cv.width = Wp; cv.height = Hp; }
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(FOG[0], FOG[1], FOG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      t3 += 0.016;
      const a = G.fighters[0], b = G.fighters[1];
      const midX = ((a ? a.x : 0) + (b ? b.x : 0)) / 2 * SC, sep = Math.abs(((a ? a.x : 0) - (b ? b.x : 0)) * SC);
      const shk = (G.shake || 0) * 0.02, sway = Math.sin(t3 * 0.5) * 0.22;
      camPos = [midX + sway + (Math.random() * 2 - 1) * shk, 2.7 + (Math.random() * 2 - 1) * shk, Math.min(13, 7.4 + sep * 0.55)];
      VP = M.mul(M.persp(0.72, cv.width / cv.height, 0.1, 70), M.look(camPos, [midX, 2.0, 0], [0, 1, 0]));

      gl.enable(gl.BLEND);
      // 1. ground (opaque)
      gl.useProgram(groundProg); curMesh = ''; const gm = M.mul(M.T(midX, 0, 0), M.S(90, 1, 90));
      gl.uniformMatrix4fv(u(groundProg, 'uMVP'), false, M.mul(VP, gm)); gl.uniformMatrix4fv(u(groundProg, 'uModel'), false, gm);
      gl.uniform3fv(u(groundProg, 'uCam'), camPos); gl.uniform3fv(u(groundProg, 'uFog'), FOG); gl.uniform2fv(u(groundProg, 'uFogND'), [10, 44]); gl.uniform1f(u(groundProg, 'uAlpha'), 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.quad.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.disableVertexAttribArray(1); gl.drawArrays(gl.TRIANGLES, 0, 6);

      setLit();
      // 2. skyline (kept below the moon's centre so no narrow tower can bisect the disc) then moon
      for (let i = -6; i <= 6; i++) { const bx = midX + i * 4.4, bh = 3 + ((i * 7 % 5 + 5) % 5) * 1.4; bit3(bx, bh / 2, -17 - ((i * 3 % 4 + 4) % 4), 2.4, bh, 1.2, [0.12, 0.06, 0.2], 0.5); }
      draw('sph', M.mul(M.T(midX + 13, 10.5, -30), M.S(6, 6, 6)), [1, 0.96, 0.85], 1, 1);
      // 3. reflections (drawn over the floor, depth-test off, faded) — wet-floor look
      gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
      for (const f of G.fighters) if (f) drawFighter(f, true);
      // 4. soft contact shadows
      for (const f of G.fighters) if (f) drawShadow(f);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
      // 5. fighters
      for (const f of G.fighters) if (f) drawFighter(f, false);
      gl.flush(); return true;
    } catch (e) { ok = false; return false; }
  }
  function bit3(x, y, z, sx, sy, sz, color, emis) { draw('cube', M.mul(M.T(x, y, z), M.S(sx, sy, sz)), color, emis, 1); }

  return { init, render, get ok() { return ok; } };
})();

/* upperdeckripmaster3030 — NEON RONIN 3D engine (Ronin3D).  [Milestone 1]
 *
 * A real WebGL 3D renderer for the duel: perspective camera tracking the fighters, a lit
 * depth-tested scene with fog, a neon grid arena, a moon, a back skyline, and both fighters
 * built as 3D articulated models. It reuses the existing 2D IK/spring skeleton (RoninArt.skel)
 * — each 2D bone becomes a shaded 3D beam extruded into depth — so all the combat, IK, combos,
 * card-gating and wager logic in ronin.js is untouched; only the render path changes.
 *
 *   Ronin3D.init(canvas)   → true if the 3D path is live
 *   Ronin3D.render(G)      draw the whole scene from game state
 */
window.Ronin3D = (function () {
  // ── tiny column-major mat4 kit ──
  const M = {
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    ident() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
    T(x, y, z) { const o = M.ident(); o[12] = x; o[13] = y; o[14] = z; return o; },
    S(x, y, z) { const o = M.ident(); o[0] = x; o[5] = y; o[10] = z; return o; },
    Rz(a) { const o = M.ident(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; },
    Ry(a) { const o = M.ident(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
    persp(fovy, asp, n, f) { const o = new Float32Array(16), t = 1 / Math.tan(fovy / 2); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
    look(e, c, up) { const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x); const o = M.ident();
      o[0] = x[0]; o[4] = x[1]; o[8] = x[2]; o[1] = y[0]; o[5] = y[1]; o[9] = y[2]; o[2] = z[0]; o[6] = z[1]; o[10] = z[2];
      o[12] = -dot(x, e); o[13] = -dot(y, e); o[14] = -dot(z, e); return o; },
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  let gl = null, cv = null, ok = false;
  let litProg, groundProg, cube, quad;
  const SC = 0.019;                                          // px → world units

  const LIT_VS =
    'attribute vec3 aPos; attribute vec3 aNorm; uniform mat4 uMVP; uniform mat4 uModel;' +
    'varying vec3 vN; varying vec3 vW; void main(){ vN=mat3(uModel)*aNorm; vW=(uModel*vec4(aPos,1.0)).xyz; gl_Position=uMVP*vec4(aPos,1.0); }';
  const LIT_FS =
    'precision mediump float; varying vec3 vN; varying vec3 vW;' +
    'uniform vec3 uColor; uniform float uEmis; uniform vec3 uLight; uniform vec3 uCam; uniform vec3 uFog; uniform vec2 uFogND;' +
    'void main(){ vec3 N=normalize(vN); float d=max(0.0,dot(N,normalize(uLight)));' +
    'vec3 lit=uColor*(0.28+0.85*d);' +
    'vec3 V=normalize(uCam-vW); float rim=pow(1.0-max(0.0,dot(N,V)),3.0); lit+=uColor*rim*0.5;' +
    'float sp=pow(max(0.0,dot(reflect(-normalize(uLight),N),V)),24.0); lit+=vec3(sp)*0.35;' +
    'lit=mix(lit,uColor*1.15,uEmis);' +
    'float fg=clamp((distance(uCam,vW)-uFogND.x)/(uFogND.y-uFogND.x),0.0,1.0);' +
    'gl_FragColor=vec4(mix(lit,uFog,fg),1.0); }';
  const GND_VS =
    'attribute vec3 aPos; uniform mat4 uMVP; uniform mat4 uModel; varying vec3 vW;' +
    'void main(){ vW=(uModel*vec4(aPos,1.0)).xyz; gl_Position=uMVP*vec4(aPos,1.0); }';
  const GND_FS =
    'precision mediump float; varying vec3 vW; uniform vec3 uCam; uniform vec3 uFog; uniform vec2 uFogND;' +
    'void main(){ vec2 g=abs(fract(vW.xz*0.5)-0.5);' +
    'float line=1.0-smoothstep(0.0,0.06,min(g.x,g.y));' +                                       // grid lines
    'vec3 col=mix(vec3(0.05,0.02,0.09), vec3(0.7,0.16,0.85), line*0.8);' +
    'float glow=1.0-smoothstep(0.0,2.2,abs(vW.z));' +                                           // hot strip along the fight line
    'col+=vec3(1.0,0.16,0.85)*glow*0.5;' +
    'float fg=clamp((distance(uCam,vW)-uFogND.x)/(uFogND.y-uFogND.x),0.0,1.0);' +
    'gl_FragColor=vec4(mix(col,uFog,fg),1.0); }';

  function sh(t, src) { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; }
  function prog(vs, fs) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aNorm'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p); return p; }
  function buf(arr) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); return b; }
  function unitCube() {                                       // 36 verts, position + normal
    const f = [[[0, 0, 1], [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]]], [[0, 0, -1], [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]]],
      [[1, 0, 0], [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]]], [[-1, 0, 0], [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]]],
      [[0, 1, 0], [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]]], [[0, -1, 0], [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]]]];
    const v = []; for (const [n, q] of f) { const idx = [0, 1, 2, 0, 2, 3]; for (const i of idx) v.push(q[i][0], q[i][1], q[i][2], n[0], n[1], n[2]); } return v;
  }

  function init(canvas) {
    try {
      cv = canvas; gl = cv.getContext('webgl', { antialias: true, alpha: false }) || cv.getContext('experimental-webgl');
      if (!gl) return false;
      litProg = prog(LIT_VS, LIT_FS); groundProg = prog(GND_VS, GND_FS);
      cube = buf(unitCube()); quad = buf([-.5, 0, -.5, 0, 1, 0, .5, 0, -.5, 0, 1, 0, .5, 0, .5, 0, 1, 0, -.5, 0, -.5, 0, 1, 0, .5, 0, .5, 0, 1, 0, -.5, 0, .5, 0, 1, 0]);
      gl.enable(gl.DEPTH_TEST);
      ok = true; return true;
    } catch (e) { ok = false; gl = null; return false; }
  }

  const FOG = [0.08, 0.03, 0.16];
  let camPos = [0, 3, 9], t3 = 0;

  function bindCube() { gl.bindBuffer(gl.ARRAY_BUFFER, cube); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); }
  function setLit(vp) { gl.useProgram(litProg); gl.uniform3fv(u(litProg, 'uLight'), [0.35, 0.9, 0.5]); gl.uniform3fv(u(litProg, 'uCam'), camPos); gl.uniform3fv(u(litProg, 'uFog'), FOG); gl.uniform2fv(u(litProg, 'uFogND'), [16, 55]); }
  const u = (p, n) => gl.getUniformLocation(p, n);
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  let VP = M.ident();
  function drawCube(model, color, emis) { gl.uniformMatrix4fv(u(litProg, 'uMVP'), false, M.mul(VP, model)); gl.uniformMatrix4fv(u(litProg, 'uModel'), false, model);
    gl.uniform3fv(u(litProg, 'uColor'), color); gl.uniform1f(u(litProg, 'uEmis'), emis || 0); gl.drawArrays(gl.TRIANGLES, 0, 36); }

  // a 3D beam between two LOCAL 2D skeleton points (px, y-down) inside a fighter's model matrix
  function beam(fm, a, b, r, color, emis) {
    const ax = a.x, ay = -a.y, bx = b.x, by = -b.y;           // flip y (screen-down → world-up)
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 0.001, th = Math.atan2(dy, dx);
    const local = M.mul(M.mul(M.mul(M.T((ax + bx) / 2, (ay + by) / 2, 0), M.Rz(th)), M.S(L, r * 2, r * 2)), M.ident());
    drawCube(M.mul(fm, local), color, emis);
  }
  function box(fm, x, y, sx, sy, sz, color, emis) { drawCube(M.mul(fm, M.mul(M.T(x, -y, 0), M.S(sx, sy, sz))), color, emis); }

  function render(G) {
    if (!ok || !G) return false;
    try {
      const dpr = Math.min(2, window.devicePixelRatio || 1), Wp = innerWidth * dpr, Hp = innerHeight * dpr;
      if (cv.width !== Wp || cv.height !== Hp) { cv.width = Wp; cv.height = Hp; }
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(FOG[0], FOG[1], FOG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      t3 += 0.016;
      const a = G.fighters[0], b = G.fighters[1];
      const midX = ((a ? a.x : 0) + (b ? b.x : 0)) / 2 * SC;
      const sep = Math.abs(((a ? a.x : 0) - (b ? b.x : 0)) * SC);
      const dist = Math.min(13, 7.2 + sep * 0.55), sway = Math.sin(t3 * 0.5) * 0.25;
      const shk = (G.shake || 0) * 0.02;
      camPos = [midX + sway + (Math.random() * 2 - 1) * shk, 2.7 + (Math.random() * 2 - 1) * shk, dist];
      const view = M.look(camPos, [midX, 2.0, 0], [0, 1, 0]);
      VP = M.mul(M.persp(0.72, cv.width / cv.height, 0.1, 60), view);

      // ground grid
      gl.useProgram(groundProg); const gm = M.mul(M.T(midX, 0, 0), M.S(80, 1, 80));
      gl.uniformMatrix4fv(u(groundProg, 'uMVP'), false, M.mul(VP, gm)); gl.uniformMatrix4fv(u(groundProg, 'uModel'), false, gm);
      gl.uniform3fv(u(groundProg, 'uCam'), camPos); gl.uniform3fv(u(groundProg, 'uFog'), FOG); gl.uniform2fv(u(groundProg, 'uFogND'), [10, 40]);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.disableVertexAttribArray(1); gl.drawArrays(gl.TRIANGLES, 0, 6);

      setLit(VP); bindCube();
      // moon (emissive) + back skyline (dark boxes fading into fog)
      drawCube(M.mul(M.mul(M.T(midX + 9, 9, -22), M.S(3.6, 3.6, 0.3)), M.ident()), [1, 0.95, 0.82], 1);
      for (let i = -6; i <= 6; i++) { const bx = midX + i * 4.2, bh = 5 + ((i * 7 % 5 + 5) % 5) * 1.6;
        drawCube(M.mul(M.T(bx, bh / 2, -16 - ((i * 3 % 4 + 4) % 4)), M.S(2.4, bh, 1.2)), [0.13, 0.06, 0.22], 0.6); }

      // fighters
      for (const f of G.fighters) { if (!f) continue; drawFighter(f); }
      gl.flush();
      return true;
    } catch (e) { ok = false; return false; }
  }

  function drawFighter(f) {
    const K = RoninArt.skel(f);
    const faceA = f.face < 0 ? Math.PI : 0;
    const fm = M.mul(M.mul(M.mul(M.T(f.x * SC, f.yLift * SC, 0), M.Ry(faceA)), M.Rz((f.rig && f.rig.bodyRot) || 0)), M.S(SC, SC, SC));
    const col = hex(f.col || '#c9d2e6'), tint = hex(f.tint || '#9fb0d0');
    const dead = f.dead, ce = dead ? 0.0 : 0.0;
    // blob shadow (flat dark box on the ground under the fighter)
    box(fm, 0, 2, 60, 3, 60, [0.02, 0.01, 0.04], 1);
    // legs
    beam(fm, K.legF[0], K.legF[1], 9, col); beam(fm, K.legF[1], K.legF[2], 8, col); box(fm, K.legF[2].x, K.legF[2].y, 22, 8, 16, [0.06, 0.06, 0.09], 0.4);
    beam(fm, K.legB[0], K.legB[1], 9, [col[0] * .8, col[1] * .8, col[2] * .8]); beam(fm, K.legB[1], K.legB[2], 8, [col[0] * .8, col[1] * .8, col[2] * .8]);
    // torso
    beam(fm, K.pelvis, K.chest, 15, col);
    // back arm
    beam(fm, K.armB[0], K.armB[1], 7, [col[0] * .82, col[1] * .82, col[2] * .82]); beam(fm, K.armB[1], K.armB[2], 6, [col[0] * .82, col[1] * .82, col[2] * .82]);
    // head + headband
    box(fm, K.head.x, K.head.y, 24, 24, 22, col, 0.15); box(fm, K.head.x, K.head.y + 6, 26, 6, 24, tint, 0.5);
    // front arm + weapon
    beam(fm, K.armF[0], K.armF[1], 7, col); beam(fm, K.armF[1], K.armF[2], 6, col);
    beam(fm, K.sword.hand, K.sword.tip, f.glow > 0 ? 5 : 3.5, f.glow > 0 ? [1, 0.9, 0.5] : [0.92, 0.97, 1], 1);
  }

  return { init, render, get ok() { return ok; } };
})();

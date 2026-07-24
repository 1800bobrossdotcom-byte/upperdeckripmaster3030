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
    'varying vec3 vN; varying vec3 vW; varying vec3 vL;' +
    'void main(){ vN=mat3(uModel)*aNorm; vW=(uModel*vec4(aPos,1.0)).xyz; vL=aPos; gl_Position=uMVP*vec4(aPos,1.0); }';
  // procedural materials, keyed by uMat, textured stably in object space (vL) so the pattern rides the mesh:
  //  1 cloth/gi weave · 2 brushed metal · 3 reptile scales · 4 iridescent crystal · 5 mottled skin · 6 energy pulse · 7 wrap bands
  const LIT_FS = 'precision mediump float; varying vec3 vN; varying vec3 vW; varying vec3 vL;' +
    'uniform vec3 uColor; uniform float uEmis; uniform float uAlpha; uniform vec3 uLight; uniform vec3 uCam; uniform vec3 uFog; uniform vec2 uFogND; uniform float uMat; uniform float uTime;' +
    'float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }' +
    'float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);' +
    ' float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));' +
    ' return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }' +
    'void main(){ vec3 N=normalize(vN); float d=max(0.0,dot(N,normalize(uLight)));' +
    'vec3 lit=uColor*(0.26+0.9*d); vec3 V=normalize(uCam-vW); float rim=pow(1.0-max(0.0,dot(N,V)),3.0); lit+=uColor*rim*0.55;' +
    'float sp=pow(max(0.0,dot(reflect(-normalize(uLight),N),V)),26.0); lit+=vec3(sp)*0.4;' +
    'float ang=atan(vL.z,vL.x);' +
    'if(uMat>0.5){' +
    ' if(uMat<1.5){ float w=0.5+0.5*sin(ang*20.0)*sin(vL.y*40.0); float fold=0.86+0.16*sin(vL.y*16.0+vnoise(vec2(ang*3.0,vL.y*7.0))*4.0); lit*=(0.84+0.2*w)*fold; }' +   // cloth weave + folds
    ' else if(uMat<2.5){ lit*=0.9+0.12*sin(vL.y*120.0); float s2=pow(max(0.0,dot(reflect(-normalize(uLight),N),V)),64.0); lit+=vec3(0.9,0.95,1.0)*s2*0.7; }' +           // brushed metal
    ' else if(uMat<3.5){ vec2 s=vec2(ang*3.5,vL.y*8.0); s.x+=step(1.0,mod(floor(vL.y*8.0),2.0))*0.5; vec2 g=fract(s)-0.5; float cell=smoothstep(0.30,0.5,length(g)); lit=mix(lit*1.18,lit*0.55,cell); }' +   // scales
    ' else if(uMat<4.5){ float fac=floor(vnoise(vL.xy*7.0+vL.z*5.0)*6.0)/6.0; vec3 ir=0.5+0.5*cos(6.2831*(fac+uTime*0.25)+vec3(0.0,2.1,4.2)); lit=mix(lit,ir,0.5)+pow(rim,2.0)*0.6; }' +   // crystal
    ' else if(uMat<5.5){ lit*=0.9+0.16*vnoise(vL.xy*9.0+vL.z*4.0); }' +                                                                                                     // skin
    ' else if(uMat<6.5){ float pu=0.75+0.35*sin(uTime*9.0+vL.y*12.0); lit=uColor*pu+vec3(0.2)*pu; }' +                                                                      // energy
    ' else { float b=step(0.5,fract(vL.y*10.0)); lit*=mix(0.68,1.06,b); } }' +                                                                                              // wraps
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
  let curMesh = '', _mat = 0;                                // active procedural material (see LIT_FS)
  function draw(name, model, color, emis, alpha) { if (curMesh !== name) { bind(name); curMesh = name; }
    gl.uniformMatrix4fv(u(litProg, 'uMVP'), false, M.mul(VP, model)); gl.uniformMatrix4fv(u(litProg, 'uModel'), false, model);
    gl.uniform3fv(u(litProg, 'uColor'), color); gl.uniform1f(u(litProg, 'uEmis'), emis || 0); gl.uniform1f(u(litProg, 'uAlpha'), alpha == null ? 1 : alpha);
    gl.uniform1f(u(litProg, 'uMat'), _mat); gl.uniform1f(u(litProg, 'uTime'), t3);
    gl.drawArrays(gl.TRIANGLES, 0, geo[name].count); }
  function setLit() { gl.useProgram(litProg); curMesh = ''; gl.uniform3fv(u(litProg, 'uLight'), [0.35, 0.9, 0.5]); gl.uniform3fv(u(litProg, 'uCam'), camPos); gl.uniform3fv(u(litProg, 'uFog'), FOG); gl.uniform2fv(u(litProg, 'uFogND'), [17, 58]); }

  // cylinder beam between two LOCAL 2D skeleton points (px, y-down) inside a fighter matrix
  function beam(fm, a, b, r, color, emis, alpha) { const ax = a.x, ay = -a.y, bx = b.x, by = -b.y, L = Math.hypot(bx - ax, by - ay) || .001, th = Math.atan2(by - ay, bx - ax);
    draw('cyl', M.mul(fm, M.mul(M.mul(M.T((ax + bx) / 2, (ay + by) / 2, 0), M.Rz(th - PI / 2)), M.S(r * 2, L, r * 2))), color, emis, alpha); }
  function ball(fm, p, r, color, emis, alpha) { draw('sph', M.mul(fm, M.mul(M.T(p.x, -p.y, 0), M.S(r * 2, r * 2, r * 2))), color, emis, alpha); }
  function bit(fm, x, y, sx, sy, sz, color, emis, alpha) { draw('cube', M.mul(fm, M.mul(M.T(x, -y, 0), M.S(sx, sy, sz))), color, emis, alpha); }
  function orb(fm, x, y, z, sx, sy, sz, color, emis, alpha) { draw('sph', M.mul(fm, M.mul(M.T(x, -y, z), M.S(sx, sy, sz))), color, emis, alpha); }
  // rotated slab (cloth panel / scarf / shard) in local skeleton space
  function slab(fm, x, y, z, sx, sy, sz, rot, color, emis, alpha) { draw('cube', M.mul(fm, M.mul(M.mul(M.T(x, -y, z), M.Rz(rot)), M.S(sx, sy, sz))), color, emis, alpha); }
  // ── world-space primitives for FX (not tied to a fighter matrix) ──
  const clampf = (v, a, b) => Math.max(a, Math.min(b, v));
  function xform(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
  function orb3(p, r, color, emis, alpha) { draw('sph', M.mul(M.T(p[0], p[1], p[2]), M.S(r * 2, r * 2, r * 2)), color, emis, alpha); }
  function beam3(a, b, r, color, emis, alpha) {   // cylinder between two world points (segments assumed ~in the x-y plane)
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy, b[2] - a[2]) || 0.001, th = Math.atan2(dy, dx);
    draw('cyl', M.mul(M.mul(M.T((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), M.Rz(th - PI / 2)), M.S(r * 2, L, r * 2)), color, emis, alpha); }

  function fighterMatrix(f, mirror) { let fm = M.mul(M.mul(M.mul(M.T(f.x * SC, f.yLift * SC, (f.z || 0) * SC), M.Ry(f.face < 0 ? PI : 0)), M.Rz((f.rig && f.rig.bodyRot) || 0)), M.S(SC, SC, SC));
    return mirror ? M.mul(M.S(1, -1, 1), fm) : fm; }

  // material picks per archetype: 1 cloth · 3 scale · 4 crystal · 5 skin · 7 wraps
  function bodyMat(f) { return f.arch === 'prizm' ? 4 : (f.arch === 'kappa' || f.arch === 'oni') ? 5 : 1; }
  function limbMat(f) { return f.arch === 'kunoichi' ? 7 : bodyMat(f); }        // kunoichi = wrapped limbs
  function bladeMat(f) { return (f.arch === 'prizm' || f.glow > 0) ? 6 : 2; }   // light/charged = energy, else steel

  function drawFighter(f, mirror) {
    const K = RoninArt.skel(f); const fm = fighterMatrix(f, mirror);
    if (!mirror) { const tp = xform(fm, K.sword.tip.x, -K.sword.tip.y, 0);   // world blade tip → 3D streak
      (f.trail3 = f.trail3 || []).unshift(tp); if (f.trail3.length > 11) f.trail3.pop(); }
    const a = mirror ? 0.30 : 1, dk = mirror ? 0.45 : 1;
    const col = sc(hex(f.col), dk), colB = sc(col, 0.82), tint = sc(hex(f.tint), dk);
    const bm = bodyMat(f), lm = limbMat(f);
    // legs
    _mat = lm;
    beam(fm, K.legB[0], K.legB[1], 8.5, colB, 0, a); beam(fm, K.legB[1], K.legB[2], 7.5, colB, 0, a); ball(fm, K.legB[1], 8, colB, 0, a);
    beam(fm, K.legF[0], K.legF[1], 9, col, 0, a); beam(fm, K.legF[1], K.legF[2], 8, col, 0, a); ball(fm, K.legF[1], 8.5, col, 0, a);
    _mat = 0;
    bit(fm, K.legF[2].x, K.legF[2].y, 22, 8, 15, sc([0.06, 0.06, 0.09], dk), 0.3, a); bit(fm, K.legB[2].x, K.legB[2].y, 20, 8, 14, sc([0.05, 0.05, 0.07], dk), 0.3, a);
    // cloak / scarf draped behind the torso
    archBack(fm, f, K, col, tint, a, dk);
    // torso + hips/chest + a wrapped obi belt
    _mat = bm;
    ball(fm, K.pelvis, 13, col, 0, a); beam(fm, K.pelvis, K.chest, 14, col, 0, a); ball(fm, K.chest, 15, col, 0, a);
    _mat = 1; bit(fm, K.pelvis.x, K.pelvis.y - 3, 31, 9, 27, sc(hex(f.tint), dk * 0.9), 0.12, a);
    // back arm
    _mat = lm;
    beam(fm, K.armB[0], K.armB[1], 7, colB, 0, a); beam(fm, K.armB[1], K.armB[2], 6, colB, 0, a); ball(fm, K.armB[1], 6.5, colB, 0, a);
    // head + band + per-arch flourish
    _mat = f.arch === 'prizm' ? 4 : 5;
    ball(fm, K.head, 15, col, 0.12, a);
    _mat = 1; bit(fm, K.head.x, K.head.y + 5, 30, 6, 30, tint, 0.5, a);
    archHead(fm, f, K, tint, a, dk);
    // front arm + weapon
    _mat = lm;
    beam(fm, K.armF[0], K.armF[1], 7, col, 0, a); beam(fm, K.armF[1], K.armF[2], 6, col, 0, a); ball(fm, K.armF[1], 6.5, col, 0, a);
    const wm = bladeMat(f); _mat = wm;
    const blade = f.glow > 0 ? [1, 0.9, 0.5] : f.arch === 'prizm' ? [0.82, 0.6, 1] : [0.92, 0.97, 1];
    beam(fm, K.sword.hand, K.sword.tip, (f.glow > 0 || wm === 6) ? 5 : 3.5, wm === 6 ? blade : sc(blade, dk), wm === 6 ? 0.55 : 0.4, a);
    // katana furniture — tsuba guard at the grip + a pommel (skip the light blade / club)
    if (wm !== 6 && f.arch !== 'oni') { const sh = K.sword.hand, st = K.sword.tip, bl = Math.hypot(st.x - sh.x, st.y - sh.y) || 1, bx = (st.x - sh.x) / bl, by = (st.y - sh.y) / bl; _mat = 2;
      orb(fm, sh.x + bx * 4, sh.y + by * 4, 0, 15, 4, 15, sc([0.74, 0.56, 0.22], dk), 0.15, a);   // tsuba disc
      orb(fm, sh.x - bx * 7, sh.y - by * 7, 0, 6, 6, 6, sc([0.32, 0.24, 0.12], dk), 0.1, a); }     // pommel
    if (f.arch === 'oni') { const t = K.sword.tip; _mat = 2; for (const s of [-1, 1]) orb(fm, t.x, t.y, s * 4, 7, 7, 7, sc([0.3, 0.3, 0.34], dk), 0.2, a); }   // spiked club head
    _mat = 0;
    if (f.arch === 'prizm') archShards(fm, f, K, a, dk);
  }
  function archHead(fm, f, K, tint, a, dk) {
    const art = (f.a && f.a.face) || '', h = K.head;
    if (f.arch === 'oni' || art === 'oni') { _mat = 0; for (const s of [-1, 1]) { beam(fm, { x: h.x + s * 7, y: h.y - 9 }, { x: h.x + s * 13, y: h.y - 34 }, 4.5, sc([0.96, 0.93, 0.84], dk), 0.2, a); ball(fm, { x: h.x + s * 13, y: h.y - 34 }, 3, sc([0.99, 0.97, 0.9], dk), 0.25, a); } }   // horns sweep up + out from the brow
    else if (f.arch === 'ronin' || art === 'ronin') { _mat = 1; draw('cyl', M.mul(fm, M.mul(M.T(h.x, -h.y - 12, 0), M.S(62, 7, 62))), sc([0.79, 0.63, 0.35], dk), 0.12, a); }
    else if (f.arch === 'kappa' || art === 'pepe') {                                       // turtle shell (scale) + bulbous eyes
      const bk = { x: (K.pelvis.x + K.chest.x) / 2 - 14, y: (K.pelvis.y + K.chest.y) / 2 };
      _mat = 3; draw('sph', M.mul(fm, M.mul(M.T(bk.x, -bk.y, 0), M.S(30, 40, 34))), sc([0.42, 0.29, 0.14], dk), 0.08, a);
      _mat = 0; for (const s of [-1, 1]) { orb(fm, h.x + 8, h.y - 11, s * 7, 9, 9, 9, sc([0.9, 0.96, 0.9], dk), 0.15, a); orb(fm, h.x + 11, h.y - 11, s * 7, 4, 4, 4, [0.03, 0.02, 0.05], 0, a); } }
    else if (f.arch === 'doomer' || art === 'wojak') {                                     // deep cowl hood set back off the face
      _mat = 1; orb(fm, h.x - 9, h.y - 2, 0, 46, 50, 44, sc([0.16, 0.18, 0.23], dk), 0.03, a); }
    else if (f.arch === 'kunoichi' || art === 'kuno') { _mat = 1; bit(fm, h.x + 6, h.y + 8, 22, 8, 24, sc(hex(f.tint), dk), 0.3, a); }   // lower face mask
    else if (f.arch === 'prizm' || art === 'prizm') { _mat = 4; orb(fm, h.x, h.y - 14, 0, 14, 22, 14, sc(hex(f.tint), dk), 0.6, a); }   // crystal crown spike
    _mat = 0;
  }
  // cloak (ronin/doomer), trailing scarf (kunoichi) — drawn behind the torso
  function archBack(fm, f, K, col, tint, a, dk) {
    const cx = (K.chest.x + K.pelvis.x) / 2, cy = (K.chest.y + K.pelvis.y) / 2;
    if (f.arch === 'ronin' || f.arch === 'doomer') {
      _mat = 1; const cc = f.arch === 'doomer' ? sc([0.15, 0.17, 0.22], dk) : sc(hex(f.tint), dk * 0.85);
      slab(fm, cx - 8, cy + 22, -5, 34, 92, 9, 0.05, cc, 0, a);                             // long draped haori / coat
    } else if (f.arch === 'kunoichi') {
      _mat = 1; const sccol = sc(hex(f.tint), dk); let x = K.head.x - 4, y = K.head.y + 10;
      for (let i = 0; i < 6; i++) { const ph = t3 * 3 + i * 0.7; x -= 13; y += 7 + Math.sin(ph) * 3.5;
        slab(fm, x, y, -4 - i, 18, 7, 6, 0.55 + Math.sin(ph) * 0.35, sccol, 0.22, a); }        // flowing scarf
    }
    _mat = 0;
  }
  // orbiting crystal shards for the prizmancer
  function archShards(fm, f, K, a, dk) {
    _mat = 4; const base = sc(hex(f.tint), dk), c = K.chest;
    for (let i = 0; i < 5; i++) { const ang = t3 * 0.7 + i * (TAU / 5), rx = Math.cos(ang) * 24, ry = Math.sin(ang) * 22;
      slab(fm, c.x + rx, c.y + ry, Math.sin(ang) * 9, 6, 22, 6, ang * 1.4, base, 0.55, a); }
    _mat = 0;
  }
  // ── 3D combat FX (additive): blade streak, slash arcs, sparks, dust, ground shock ring ──
  function drawTrail3(f) {
    const tr = f.trail3; if (!tr || tr.length < 2) return;
    const col = f.glow > 0 ? [1, 0.92, 0.55] : hex(f.tint || '#cfe0ff');
    for (let i = 0; i < tr.length - 1; i++) { const a = tr[i], b = tr[i + 1];
      const spd = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const al = (1 - i / tr.length) * clampf(spd / 0.16, 0, 1); if (al < 0.05) continue;
      beam3(a, b, (1 - i / tr.length) * 0.085 + 0.02, col, 1, al * 0.9); }
  }
  function drawArc3(e, gY) {
    const cx = e.x * SC, cy = (gY - e.y) * SC, rO = e.r * SC * 0.66, col = hex(e.col || '#eaf6ff'), fade = 1 - clampf(e.t / e.life, 0, 1);
    const pt = th => { const px = e.face * Math.cos(th) * rO, py = Math.sin(th) * rO; return [cx + px, cy - py, 0]; };
    const N = 9; let prev = pt(e.a0);
    for (let i = 1; i <= N; i++) { const p = pt(e.a0 + (e.a1 - e.a0) * (i / N)), k = 1 - (i - 1) / N;
      beam3(prev, p, 0.14 * k + 0.03, col, 1, 0.5 * fade);          // coloured glow
      beam3(prev, p, 0.055 * k + 0.012, [1, 1, 1], 1, 0.9 * fade);  // bright white leading core
      prev = p; }
  }
  function drawFx(G) {
    const gY = G.groundY || 500, fx = G.fx || [];
    for (const e of fx) {
      if (e.kind === 'spark') { const k = 1 - e.t / e.life; orb3([e.x * SC, (gY - e.y) * SC, 0], e.r * SC * 2.4 * (0.55 + k * 0.6), hex(e.col), 1, k); }
      else if (e.kind === 'dust') { const pr = e.t / e.life; orb3([e.x * SC, (gY - e.y) * SC, 0], e.r * SC * 1.5 * (1 + pr * 1.5), [0.52, 0.44, 0.62], 0.4, (1 - pr) * 0.26); }
      else if (e.kind === 'arc') drawArc3(e, gY);
    }
    const s = G.shock;                                              // expanding ground shock ring at the impact
    if (s) { const R = s.t * 10 + 0.3, al = Math.max(0, 1 - s.t / 0.5) * 0.8 * (s.str || 1), cx = (s.wx || 0) * SC, N = 26;
      for (let i = 0; i < N; i++) { const a = i / N * TAU; orb3([cx + Math.cos(a) * R, 0.09, Math.sin(a) * R], 0.085 + s.t * 0.05, [1, 0.45, 0.9], 1, al); } }
  }
  function drawShadow(f) { const x = f.x * SC, r = 0.55; const m = M.mul(M.mul(M.T(x, 0.02, (f.z || 0) * SC), M.S(r * 2.2, 1, r * 1.3)), M.ident());
    if (curMesh !== 'quad') { bind('quad'); curMesh = 'quad'; }
    gl.uniformMatrix4fv(u(litProg, 'uMVP'), false, M.mul(VP, m)); gl.uniformMatrix4fv(u(litProg, 'uModel'), false, m);
    gl.uniform3fv(u(litProg, 'uColor'), [0, 0, 0]); gl.uniform1f(u(litProg, 'uEmis'), 1); gl.uniform1f(u(litProg, 'uMat'), 0); gl.uniform1f(u(litProg, 'uAlpha'), f.dead ? 0.15 : 0.42); gl.drawArrays(gl.TRIANGLES, 0, 6); }

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

      setLit(); _mat = 0;
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
      // 6. combat FX — additive glow (blade streaks, slash arcs, sparks, dust, shock ring)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); _mat = 0;
      for (const f of G.fighters) if (f && !f.dead) drawTrail3(f);
      drawFx(G);
      gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.flush(); return true;
    } catch (e) { ok = false; return false; }
  }
  function bit3(x, y, z, sx, sy, sz, color, emis) { draw('cube', M.mul(M.T(x, y, z), M.S(sx, sy, sz)), color, emis, 1); }

  return { init, render, get ok() { return ok; } };
})();

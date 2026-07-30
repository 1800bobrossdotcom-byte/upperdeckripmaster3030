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
  let litProg, groundProg, trailProg, trailBuf, spriteProg, spriteBuf, skinProg;
  const skins = {};                                          // arch → {buf, count}
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
    ' else if(uMat<7.5){ float b=step(0.5,fract(vL.y*10.0)); lit*=mix(0.68,1.06,b); }' +
    ' else { float band=vW.y*0.16 + vW.x*0.055 + vW.z*0.055 + uTime*0.22;' +          // 8 = PSYCHEDELIC city
    '   vec3 ac=0.5+0.5*cos(6.2831*(band+vec3(0.0,0.33,0.67)));' +
    '   float rings=0.5+0.5*sin(length(vW.xz)*0.55 - uTime*1.1);' +
    '   vec3 ac2=0.5+0.5*cos(6.2831*(rings*0.6+uTime*0.09+vec3(0.2,0.5,0.85)));' +
    '   lit=mix(ac,ac2,0.42)*(0.5+0.85*d) + pow(rim,1.6)*vec3(1.0,0.35,0.9)*0.7;' +
    '   lit*=0.82+0.32*sin(vW.y*2.6+uTime*1.7); } }' +                                                                                              // wraps
    'lit=mix(lit,uColor*1.2,uEmis);' +
    'float fg=clamp((distance(uCam,vW)-uFogND.x)/(uFogND.y-uFogND.x),0.0,1.0);' +
    'gl_FragColor=vec4(mix(lit,uFog,fg),uAlpha); }';
  const GND_VS = 'attribute vec3 aPos; uniform mat4 uMVP; uniform mat4 uModel; varying vec3 vW;' +
    'void main(){ vW=(uModel*vec4(aPos,1.0)).xyz; gl_Position=uMVP*vec4(aPos,1.0); }';
  // WATER floor — layered travelling wave normals, fresnel sheen, caustic glimmer, psychedelic tint
  const GND_FS = 'precision mediump float; varying vec3 vW; uniform vec3 uCam; uniform vec3 uFog; uniform vec2 uFogND; uniform float uAlpha; uniform float uTime; uniform float uWater;' +
    'void main(){ vec2 p=vW.xz;' +
    ' float w1=sin(p.x*0.42+uTime*1.15)+sin(p.y*0.37-uTime*0.9);' +
    ' float w2=sin((p.x+p.y)*0.24-uTime*0.62)+sin((p.x-p.y)*0.31+uTime*0.78);' +
    ' float h=(w1+w2)*0.25;' +
    ' vec3 N=normalize(vec3(-(cos(p.x*0.42+uTime*1.15)*0.42+cos((p.x+p.y)*0.24-uTime*0.62)*0.24)*0.6, 1.0,' +
    '                      -(cos(p.y*0.37-uTime*0.9)*0.37+cos((p.x-p.y)*0.31+uTime*0.78)*0.31)*0.6));' +
    ' vec3 V=normalize(uCam-vW); float fres=pow(1.0-max(0.0,dot(N,V)),3.0);' +
    ' vec3 deep=vec3(0.02,0.05,0.14), shallow=vec3(0.10,0.42,0.62);' +
    ' vec3 col=mix(deep,shallow,0.45+0.35*h);' +
    ' vec3 sky=0.5+0.5*cos(6.2831*(h*0.4+uTime*0.05+vec3(0.0,0.33,0.67)));' +   // psychedelic reflection
    ' col=mix(col,sky,fres*0.75);' +
    ' float caust=pow(max(0.0,sin(p.x*0.9+uTime*1.3)*sin(p.y*0.8-uTime*1.1)),6.0);' +
    ' col+=vec3(0.5,0.9,1.0)*caust*0.5;' +
    ' float spec=pow(max(0.0,dot(reflect(-normalize(vec3(0.35,0.9,0.5)),N),V)),48.0); col+=vec3(1.0)*spec*0.6;' +
    ' if(uWater<0.5){' +                                                        // DUEL ARENA: the original neon grid
    '   vec2 g=abs(fract(vW.xz*0.5)-0.5); float line=1.0-smoothstep(0.0,0.06,min(g.x,g.y));' +
    '   col=mix(vec3(0.04,0.02,0.08), vec3(0.7,0.16,0.85), line*0.8);' +
    '   float glow=1.0-smoothstep(0.0,2.4,abs(vW.z)); col+=vec3(1.0,0.16,0.85)*glow*0.5; }' +
    ' float fg=clamp((distance(uCam,vW)-uFogND.x)/(uFogND.y-uFogND.x),0.0,1.0);' +
    ' gl_FragColor=vec4(mix(col,uFog,fg),uAlpha); }';
  // flat additive shader for smooth FX ribbons (blade trails + slash-arc crescents) — per-vertex alpha
  const TR_VS = 'attribute vec3 aPos; attribute float aA; uniform mat4 uVP; varying float vA; void main(){ vA=aA; gl_Position=uVP*vec4(aPos,1.0); }';
  const TR_FS = 'precision mediump float; varying float vA; uniform vec3 uCol; void main(){ gl_FragColor=vec4(uCol,vA); }';
  // billboarded anime sprite pops (impact stars, speed lines, "!" marks, sweat drops, action kanji-ish glyphs).
  // aPos = unit quad offset; the vertex shader faces it at the camera and scales in world units.
  const SP_VS = 'attribute vec2 aQ; uniform mat4 uVP; uniform vec3 uPos; uniform vec2 uSize; uniform vec3 uRight; uniform vec3 uUp; uniform float uRot;' +
    'varying vec2 vUV; void main(){ vUV=aQ; float c=cos(uRot), s=sin(uRot); vec2 q=vec2(aQ.x*c-aQ.y*s, aQ.x*s+aQ.y*c);' +
    ' vec3 w=uPos+uRight*(q.x*uSize.x)+uUp*(q.y*uSize.y); gl_Position=uVP*vec4(w,1.0); }';
  const SP_FS = 'precision mediump float; varying vec2 vUV; uniform vec3 uCol; uniform float uAlpha; uniform float uKind;' +
    'void main(){ vec2 p=vUV; float r=length(p), ang=atan(p.y,p.x); float m=0.0;' +
    ' if(uKind<0.5){ float star=0.30+0.30*cos(ang*8.0); m=smoothstep(star,star*0.45,r); }' +          // 0 impact star-burst
    ' else if(uKind<1.5){ float b=abs(p.x)*3.2; m=smoothstep(0.5,0.0,b)*smoothstep(1.0,0.2,abs(p.y)); }' +   // 1 speed line
    ' else if(uKind<2.5){ float bar=smoothstep(0.16,0.10,abs(p.x))*smoothstep(0.75,0.6,abs(p.y+0.18));' +    // 2 "!" mark
    '   float dot0=smoothstep(0.15,0.09,length(p-vec2(0.0,-0.72))); m=max(bar,dot0); }' +
    ' else if(uKind<3.5){ vec2 d=vec2(p.x*1.5,(p.y-0.15)*1.0); float body=smoothstep(0.42,0.3,length(d));' +  // 3 sweat drop
    '   float tail=smoothstep(0.2,0.0,abs(p.x)*4.0)*smoothstep(1.0,0.35,p.y); m=max(body,tail); }' +
    ' else { float ring=smoothstep(0.06,0.0,abs(r-0.62)); float sp=step(0.0,cos(ang*6.0)-0.35); m=ring*(0.45+0.55*sp); }' +   // 4 burst ring
    ' if(m<=0.01) discard; gl_FragColor=vec4(uCol, m*uAlpha); }';

  // ── SKINNED mesh: real vertex deformation. Each vertex blends up to 4 bone matrices, so an
  //    elbow BENDS instead of a rigid part hinging open at the joint. uBones = joint palette.
  const SK_VS = 'precision highp float;\n attribute vec3 aPos; attribute vec3 aNorm; attribute vec4 aIdx; attribute vec4 aWgt;' +
    'uniform mat4 uMVP; uniform mat4 uModel; uniform mat4 uBones[11];' +
    'varying vec3 vN; varying vec3 vW; varying vec3 vL;' +
    'void main(){ mat4 sk = uBones[int(aIdx.x)]*aWgt.x + uBones[int(aIdx.y)]*aWgt.y' +
    '                    + uBones[int(aIdx.z)]*aWgt.z + uBones[int(aIdx.w)]*aWgt.w;' +
    ' vec4 p = sk*vec4(aPos,1.0); vec3 n = mat3(sk)*aNorm;' +
    ' vN = mat3(uModel)*n; vW = (uModel*p).xyz; vL = aPos; gl_Position = uMVP*p; }';

  function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; }
  function prog(v, f) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aNorm'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p); return p; }
  const geoSrc = {};                                          // raw verts, kept so morph variants can be derived
  function mesh(name, verts) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW); geo[name] = { buf: b, count: verts.length / 6 }; geoSrc[name] = verts; }

  function cubeV() { const f = [[[0, 0, 1], [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]]], [[0, 0, -1], [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]]], [[1, 0, 0], [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]]], [[-1, 0, 0], [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]]], [[0, 1, 0], [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]]], [[0, -1, 0], [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]]]];
    const v = []; for (const [n, q] of f) for (const i of [0, 1, 2, 0, 2, 3]) v.push(q[i][0], q[i][1], q[i][2], n[0], n[1], n[2]); return v; }
  function cylV(seg) { const v = [], r = .5; for (let i = 0; i < seg; i++) { const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r, n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
    v.push(x0, -.5, z0, n0[0], 0, n0[2], x1, -.5, z1, n1[0], 0, n1[2], x1, .5, z1, n1[0], 0, n1[2], x0, -.5, z0, n0[0], 0, n0[2], x1, .5, z1, n1[0], 0, n1[2], x0, .5, z0, n0[0], 0, n0[2]);
    v.push(0, .5, 0, 0, 1, 0, x0, .5, z0, 0, 1, 0, x1, .5, z1, 0, 1, 0, 0, -.5, 0, 0, -1, 0, x1, -.5, z1, 0, -1, 0, x0, -.5, z0, 0, -1, 0); } return v; }
  // tapered cylinder (frustum): bottom radius rb, top radius rt — muscled limbs read as human, not tubes
  function taperV(seg, rb, rt) { const v = []; for (let i = 0; i < seg; i++) { const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const nb = Math.hypot(1, rb - rt) || 1, nn0 = [c0 / nb, (rb - rt) / nb, s0 / nb], nn1 = [c1 / nb, (rb - rt) / nb, s1 / nb];
    const b0 = [c0 * rb, -.5, s0 * rb], b1 = [c1 * rb, -.5, s1 * rb], t0 = [c0 * rt, .5, s0 * rt], t1 = [c1 * rt, .5, s1 * rt];
    v.push(b0[0], b0[1], b0[2], nn0[0], nn0[1], nn0[2], b1[0], b1[1], b1[2], nn1[0], nn1[1], nn1[2], t1[0], t1[1], t1[2], nn1[0], nn1[1], nn1[2],
      b0[0], b0[1], b0[2], nn0[0], nn0[1], nn0[2], t1[0], t1[1], t1[2], nn1[0], nn1[1], nn1[2], t0[0], t0[1], t0[2], nn0[0], nn0[1], nn0[2]);
    v.push(0, .5, 0, 0, 1, 0, t0[0], .5, t0[2], 0, 1, 0, t1[0], .5, t1[2], 0, 1, 0, 0, -.5, 0, 0, -1, 0, b1[0], -.5, b1[2], 0, -1, 0, b0[0], -.5, b0[2], 0, -1, 0); } return v; }
  // flat ground ring (annulus in x-z) for the shock wave — a clean expanding band, not a ring of orbs
  function ringV() { const v = [], N = 48, ri = 0.82, ro = 1.0; for (let i = 0; i < N; i++) { const a0 = i / N * TAU, a1 = (i + 1) / N * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    v.push(c0 * ri, 0, s0 * ri, 0, 1, 0, c0 * ro, 0, s0 * ro, 0, 1, 0, c1 * ro, 0, s1 * ro, 0, 1, 0, c0 * ri, 0, s0 * ri, 0, 1, 0, c1 * ro, 0, s1 * ro, 0, 1, 0, c1 * ri, 0, s1 * ri, 0, 1, 0); } return v; }
  function sphV(la, lo) { const v = [], r = .5, P = (t, p) => [Math.sin(t) * Math.cos(p) * r, Math.cos(t) * r, Math.sin(t) * Math.sin(p) * r], N = q => { const l = Math.hypot(q[0], q[1], q[2]) || 1; return [q[0] / l, q[1] / l, q[2] / l]; };
    for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) { const t0 = i / la * PI, t1 = (i + 1) / la * PI, p0 = j / lo * TAU, p1 = (j + 1) / lo * TAU, a = P(t0, p0), b = P(t1, p0), c = P(t1, p1), d = P(t0, p1), na = N(a), nb = N(b), nc = N(c), nd = N(d);
      v.push(a[0], a[1], a[2], na[0], na[1], na[2], b[0], b[1], b[2], nb[0], nb[1], nb[2], c[0], c[1], c[2], nc[0], nc[1], nc[2], a[0], a[1], a[2], na[0], na[1], na[2], c[0], c[1], c[2], nc[0], nc[1], nc[2], d[0], d[1], d[2], nd[0], nd[1], nd[2]); } return v; }

  // bloom post state
  /* The bloom compositor used to live inline here. It is now js/gfx-post.js, shared with
   * Section 9 and Cloudracer, so a tuning fix lands in all three at once instead of drifting.
   * `post` is a GfxPost handle: {begin, end, on, set}. Null when the module isn't loaded,
   * which is handled everywhere `post &&` appears — ronin still draws, just uncomposited. */
  let post = null;
  function init(canvas) {
    try { cv = canvas; gl = cv.getContext('webgl', { antialias: true, alpha: false }) || cv.getContext('experimental-webgl'); if (!gl) return false;
      litProg = prog(LIT_VS, LIT_FS); groundProg = prog(GND_VS, GND_FS);
      trailProg = gl.createProgram(); gl.attachShader(trailProg, sh(gl.VERTEX_SHADER, TR_VS)); gl.attachShader(trailProg, sh(gl.FRAGMENT_SHADER, TR_FS)); gl.bindAttribLocation(trailProg, 0, 'aPos'); gl.bindAttribLocation(trailProg, 1, 'aA'); gl.linkProgram(trailProg); trailBuf = gl.createBuffer();
      spriteProg = gl.createProgram(); gl.attachShader(spriteProg, sh(gl.VERTEX_SHADER, SP_VS)); gl.attachShader(spriteProg, sh(gl.FRAGMENT_SHADER, SP_FS)); gl.bindAttribLocation(spriteProg, 0, 'aQ'); gl.linkProgram(spriteProg);
      spriteBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
      mesh('cube', cubeV()); mesh('cyl', cylV(22)); mesh('sph', sphV(18, 26));   // higher-poly = smoother rounded forms
      mesh('limb', taperV(22, 0.62, 0.42)); mesh('ring', ringV());               // smooth tapered limb + flat shock ring
      mesh('quad', [-.5, 0, -.5, 0, 1, 0, .5, 0, -.5, 0, 1, 0, .5, 0, .5, 0, 1, 0, -.5, 0, -.5, 0, 1, 0, .5, 0, .5, 0, 1, 0, -.5, 0, .5, 0, 1, 0]);
      skinProg = gl.createProgram(); gl.attachShader(skinProg, sh(gl.VERTEX_SHADER, SK_VS)); gl.attachShader(skinProg, sh(gl.FRAGMENT_SHADER, LIT_FS));
      gl.bindAttribLocation(skinProg,0,'aPos'); gl.bindAttribLocation(skinProg,1,'aNorm'); gl.bindAttribLocation(skinProg,2,'aIdx'); gl.bindAttribLocation(skinProg,3,'aWgt');
      gl.linkProgram(skinProg);
      // shared bloom/rolloff/dither/sharpen chain; fails open to a direct draw
      try { post = window.GfxPost ? GfxPost.create(gl, cv, GfxPost.PRESET.neon) : null; } catch (e) { post = null; }
      gl.enable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); ok = true; return true;
    } catch (e) { ok = false; gl = null; return false; }
  }

  const FOG = [0.07, 0.03, 0.15];
  let camPos = [0, 3, 9], t3 = 0, VP = null;
  const cam = { dist: 9, h: 2.7, az: 0 };                     // smoothed fight-camera (distance / height / azimuth)
  const u = (p, n) => gl.getUniformLocation(p, n);
  const hex = h => { const n = parseInt((h || '#c9d2e6').slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const sc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  function bind(name) { const g = geo[name]; gl.bindBuffer(gl.ARRAY_BUFFER, g.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); return g.count; }
  let curMesh = '', _mat = 0;                                // active procedural material (see LIT_FS)
  let meshVar = '';                                           // active per-fighter mesh-variant prefix
  function draw(rawName, model, color, emis, alpha) {
    const name = (meshVar && geo[meshVar + rawName]) ? meshVar + rawName : rawName;
    if (curMesh !== name) { bind(name); curMesh = name; }
    gl.uniformMatrix4fv(u(litProg, 'uMVP'), false, M.mul(VP, model)); gl.uniformMatrix4fv(u(litProg, 'uModel'), false, model);
    gl.uniform3fv(u(litProg, 'uColor'), color); gl.uniform1f(u(litProg, 'uEmis'), emis || 0); gl.uniform1f(u(litProg, 'uAlpha'), alpha == null ? 1 : alpha);
    gl.uniform1f(u(litProg, 'uMat'), _mat); gl.uniform1f(u(litProg, 'uTime'), t3);
    gl.drawArrays(gl.TRIANGLES, 0, geo[name].count); }
  function setLit() { gl.useProgram(litProg); curMesh = ''; gl.uniform3fv(u(litProg, 'uLight'), [0.35, 0.9, 0.5]); gl.uniform3fv(u(litProg, 'uCam'), camPos); gl.uniform3fv(u(litProg, 'uFog'), FOG); gl.uniform2fv(u(litProg, 'uFogND'), [17, 58]); }

  // tapered limb between two LOCAL 2D skeleton points (px, y-down) — thicker at joint a, thinner at b
  function beam(fm, a, b, r, color, emis, alpha) { const ax = a.x, ay = -a.y, bx = b.x, by = -b.y, L = Math.hypot(bx - ax, by - ay) || .001, th = Math.atan2(by - ay, bx - ax);
    draw('limb', M.mul(fm, M.mul(M.mul(M.T((ax + bx) / 2, (ay + by) / 2, 0), M.Rz(th - PI / 2)), M.S(r * 2, L, r * 2))), color, emis, alpha); }
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

  function fighterMatrix(f, mirror) {
    let pos, yaw;
    if (f.w) { pos = M.T(f.w.x, f.w.y, f.w.z);                       // WORLD MODE: real 3D position
      yaw = (f.faceYaw != null ? f.faceYaw : 0) + (f.spin || 0); }
    else { pos = M.T(f.x * SC, f.yLift * SC, (f.z || 0) * SC);
      yaw = (f.face < 0 ? PI : 0) + (f.spin || 0); }
    let fm = M.mul(M.mul(M.mul(pos, M.Ry(yaw)), M.Rz((f.rig && f.rig.bodyRot) || 0)), M.S(SC, SC, SC));
    return mirror ? M.mul(M.S(1, -1, 1), fm) : fm; }

  // a hand: palm + four fingers + a thumb. `along` = unit dir the fingers point (the hilt / punch line).
  function drawHand(fm, wrist, along, col, dk, a, fist) {
    const L = Math.hypot(along.x, along.y) || 1, ax = along.x / L, ay = along.y / L, px = -ay, py = ax;   // perpendicular in x-y
    _mat = 5;
    orb(fm, wrist.x + ax * 2, wrist.y + ay * 2, 0, 11, 10, 12, col, 0, a);                       // palm
    const flen = fist ? 3.5 : 7.5, fr = 2.1;
    for (let i = 0; i < 4; i++) { const o = (i - 1.5) * 3.4, bx = wrist.x + px * o + ax * 5, by = wrist.y + py * o + ay * 5;
      const tx = bx + ax * flen - (fist ? ax * flen * 1.2 : 0), ty = by + ay * flen - (fist ? ay * flen * 1.2 : 0);
      beam(fm, { x: bx, y: by }, { x: tx, y: ty }, fr, col, 0, a); orb(fm, tx, ty, 0, fr * 1.6, fr * 1.6, fr * 1.6, sc(col, 0.92), 0, a); }
    beam(fm, { x: wrist.x - px * 5 + ax * 1, y: wrist.y - py * 5 + ay * 1 }, { x: wrist.x - px * 3 + ax * 6, y: wrist.y - py * 3 + ay * 6 }, fr * 1.05, col, 0, a);   // thumb
  }
  // hair: a skull cap plus swept spikes (Tekken-style silhouette). Skipped for the shelled/crystal heads.
  function drawHair(fm, f, K, hair, a, dk) {
    if (f.arch === 'kappa' || f.arch === 'prizm' || f.arch === 'ronin') return;    // shelled / crystal / hatted heads
    const h = K.head; _mat = 0;
    orb(fm, h.x - 2, h.y - 5, 0, 27, 20, 26, hair, 0.02, a);                       // cap over the crown
    if (f.arch === 'doomer') return;                                                // hooded — no spikes
    const spikes = f.arch === 'kunoichi'
      ? [[-6, -14, -22, 2.0], [-10, -8, -26, 2.4], [-12, 0, -24, 2.7]]              // long tail sweeping back
      : [[2, -16, -16, 1.1], [-4, -18, -12, 1.5], [-10, -15, -10, 1.9], [8, -13, -12, 0.7], [-14, -9, -8, 2.3]];
    for (const [ox, oy, len, ang] of spikes) {
      const bx = h.x + ox, by = h.y + oy, tx = bx + Math.cos(ang) * -len, ty = by + Math.sin(ang) * -Math.abs(len) * 0.5;
      beam(fm, { x: bx, y: by }, { x: tx, y: ty }, 4.6, hair, 0.02, a);
    }
  }
  // expressive face on the head front (+x local): eyes+pupils, brows, nose, mouth — expression by state
  function drawFace(fm, f, K, col, dk, a) {
    if (f.arch === 'prizm') return;                                                              // crystal head, no face
    const h = K.head, st = f.state, masked = f.arch === 'kunoichi';
    let brow = 0, mouth = 1.6, eye = f.arch === 'kappa' ? 1.35 : 1;                              // brow: + angry(down) · mouth height
    if (st === 'punch' || st === 'kick' || st === 'slash' || st === 'special') { brow = 1; mouth = 5.5; }
    else if (st === 'hurt') { brow = -0.7; mouth = 6.5; eye = 1.25; }
    else if (st === 'block') { brow = 0.5; mouth = 1.3; }
    const fx = h.x + 10;
    for (const s of [-1, 1]) {
      orb(fm, fx, h.y - 3, s * 6, 4.4 * eye, 5 * eye, 3, [0.95, 0.96, 0.98], 0.08, a);           // eye white
      orb(fm, fx + 2, h.y - 3, s * 6.3, 2.3 * eye, 2.6 * eye, 2.2, [0.05, 0.03, 0.08], 0, a);     // pupil
      draw('cube', M.mul(fm, M.mul(M.mul(M.T(fx - 1, -(h.y - 8.5), s * 6), M.Rz(s * brow * 0.45)), M.S(8, 2.2, 3.4))), sc([0.09, 0.07, 0.12], dk), 0, a);   // brow
    }
    if (masked) return;                                                                          // scarf-masked → no nose/mouth
    orb(fm, fx + 4, h.y + 2, 0, 4, 4.6, 5.4, col, 0, a);                                          // nose
    draw('cube', M.mul(fm, M.mul(M.T(fx, -(h.y + 9), 0), M.S(9, mouth, 4))), [0.09, 0.03, 0.06], 0, a);   // mouth
    if (f.arch === 'oni') for (const s of [-1, 1]) orb(fm, fx + 1, h.y + 7, s * 3.4, 2, 3, 2, [0.98, 0.97, 0.9], 0.1, a);   // fangs
  }

  // ── costumes: Tekken-style colour-blocking. Each fighter is skin + a top + pants + boots +
  //    gloves + trim + hair, instead of one flat body colour. That separation is what makes a
  //    fighter read as a dressed character rather than a monochrome mannequin.
  const GARB = {
    ronin:    { skin: '#e8c9a8', top: '#dfe6f2', pants: '#3b4258', boot: '#241a12', glove: '#8a2f2f', trim: '#9fb0d0', hair: '#20232e', bare: 'arms' },
    kappa:    { skin: '#4fc25a', top: '#2f7d3a', pants: '#1f5e2c', boot: '#123a1c', glove: '#2bff80', trim: '#2bff80', hair: '#1a4d24', bare: 'arms' },
    doomer:   { skin: '#c9b7a6', top: '#2a3040', pants: '#171b26', boot: '#0e1118', glove: '#3d4658', trim: '#8fa0b8', hair: '#141821', bare: 'none' },
    oni:      { skin: '#df463b', top: '#7a1a14', pants: '#2a1410', boot: '#160a08', glove: '#f0a03c', trim: '#ff6b57', hair: '#2b0f0c', bare: 'torso' },
    kunoichi: { skin: '#e8bfa4', top: '#c31f6d', pants: '#2b1030', boot: '#1a0a20', glove: '#ff2ad9', trim: '#ff2ad9', hair: '#1b0f1e', bare: 'none' },
    prizm:    { skin: '#c9a6ff', top: '#7b4bd0', pants: '#3a2470', boot: '#241246', glove: '#e6c8ff', trim: '#e6c8ff', hair: '#8f5cff', bare: 'none' },
  };
  function garbOf(f) { return GARB[f.arch] || GARB.ronin; }

  // material picks per archetype: 1 cloth · 3 scale · 4 crystal · 5 skin · 7 wraps
  function bodyMat(f) { return f.arch === 'prizm' ? 4 : (f.arch === 'kappa' || f.arch === 'oni') ? 5 : 1; }
  function limbMat(f) { return f.arch === 'kunoichi' ? 7 : bodyMat(f); }        // kunoichi = wrapped limbs
  function bladeMat(f) { return (f.arch === 'prizm' || f.glow > 0) ? 6 : 2; }   // light/charged = energy, else steel

  // ── loaded model parts (rigid-part rig): each part mesh rides one skeleton joint ──
  // Part names are matched by convention so an artist can author objects called "head",
  // "torso", "arm_f_upper" … and have them attach without any code change. A model with a
  // single unnamed mesh is treated as a whole body anchored at the pelvis.
  const models = {};                                            // arch → { parts:[{key,joint,off}], scale }
  // scene props that are not part of the fighter — a stage floor would wreck the auto-scale
  const PROP_RE = /floor|ground|plane|backdrop|stage|base_|pedestal|light|camera|helper/;
  const JOINTMAP = [
    [/head|skull|face|helmet|mask/, 'head'],
    [/chest|torso|upper.?body|jacket|uniform|body|spine|armor/, 'chest'],
    [/pelvis|hip|waist|belt/, 'pelvis'],
    [/(arm|shoulder|bicep).*(f|front|r|right).*(up|upper)?/, 'armF0'], [/(forearm|elbow).*(f|front|r|right)/, 'armF1'], [/(hand|glove|fist).*(f|front|r|right)/, 'armF2'],
    [/(arm|shoulder|bicep).*(b|back|l|left)/, 'armB0'], [/(forearm|elbow).*(b|back|l|left)/, 'armB1'], [/(hand|glove|fist).*(b|back|l|left)/, 'armB2'],
    [/(leg|thigh|quad).*(f|front|r|right)/, 'legF0'], [/(shin|calf|knee).*(f|front|r|right)/, 'legF1'], [/(foot|boot).*(f|front|r|right)/, 'legF2'],
    [/(leg|thigh|quad).*(b|back|l|left)/, 'legB0'], [/(shin|calf|knee).*(b|back|l|left)/, 'legB1'], [/(foot|boot).*(b|back|l|left)/, 'legB2'],
    // side-agnostic fallbacks — an un-sided "arm"/"boot" still lands on a sensible joint
    [/forearm/, 'armF1'], [/hand|glove|fist/, 'armF2'], [/arm|shoulder|bicep/, 'armF0'],
    [/knee|shin|calf/, 'legF1'], [/foot|boot/, 'legF2'], [/leg|thigh|quad/, 'legF0'],
    [/sword|blade|katana|weapon|gun|rifle/, 'sword'],
  ];
  function jointFor(name) { for (const [re, j] of JOINTMAP) if (re.test(name)) return j; return 'body'; }
  // the bone a part rides = joint → its child joint. Rotating by this bone's change from bind
  // is what makes a loaded model actually take the skeleton's pose instead of holding T-pose.
  const CHILD = { chest: 'head', pelvis: 'chest', head: null,
    armF0: 'armF1', armF1: 'armF2', armF2: 'sword', armB0: 'armB1', armB1: 'armB2', armB2: null,
    legF0: 'legF1', legF1: 'legF2', legF2: null, legB0: 'legB1', legB1: 'legB2', legB2: null, sword: null };
  function jointPt(K, j) {
    switch (j) {
      case 'head': return K.head; case 'chest': return K.chest; case 'pelvis': return K.pelvis;
      case 'armF0': return K.armF[0]; case 'armF1': return K.armF[1]; case 'armF2': return K.armF[2];
      case 'armB0': return K.armB[0]; case 'armB1': return K.armB[1]; case 'armB2': return K.armB[2];
      case 'legF0': return K.legF[0]; case 'legF1': return K.legF[1]; case 'legF2': return K.legF[2];
      case 'legB0': return K.legB[0]; case 'legB1': return K.legB[1]; case 'legB2': return K.legB[2];
      case 'sword': return K.sword.hand; default: return null;    // 'body' → anchored at the feet
    }
  }
  /* Register a parsed GLB (from RoninGLB.parse) as the model for an archetype.
   * The model is auto-scaled so its total height matches the fighter's ~150px skeleton. */
  function registerModel(arch, parsed, opt) {
    if (!ok || !parsed || !parsed.meshes || !parsed.meshes.length) return false;
    try {
      const src = parsed.meshes.filter(m => !PROP_RE.test(m.name));   // drop stage floors / helpers
      if (!src.length) return false;
      let lo = 1e9, hi = -1e9;
      for (const m of src) { lo = Math.min(lo, m.bounds.lo[1]); hi = Math.max(hi, m.bounds.hi[1]); }
      const h = Math.max(0.001, hi - lo), scale = 150 / h;         // model units → skeleton px
      // optional generative morph — `opt.morph` is a RoninMorph op-stack (or a card slug string),
      // so one geometry source can render as an unlimited number of distinct, seeded iterations.
      let morph = opt && opt.morph;
      if (typeof morph === 'string' && window.RoninMorph) morph = RoninMorph.fromSlug(morph);
      const parts = [];
      for (let i = 0; i < src.length; i++) { const m = src[i], key = 'mdl:' + arch + ':' + i;
        const verts = (morph && window.RoninMorph) ? RoninMorph.apply(m.verts, morph) : m.verts;
        mesh(key, verts); parts.push({ key, joint: src.length === 1 ? 'body' : jointFor(m.name), name: m.name }); }
      models[arch] = { parts, scale, footY: lo };
      return true;
    } catch (e) { return false; }
  }
  function hasModel(arch) { return !!models[arch]; }
  const BONE_ORDER = ['pelvis','chest','head','armF0','armF1','armB0','armB1','legF0','legF1','legB0','legB1'];
  const BONE_CHILD = { pelvis:'chest', chest:'head', head:null, armF0:'armF1', armF1:'armF2', armB0:'armB1', armB1:'armB2', legF0:'legF1', legF1:'legF2', legB0:'legB1', legB1:'legB2' };
  function registerSkin(arch, verts, count) {
    if (!ok) return false;
    try { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      // bind-space bounds so the mesh can be fitted to the skeleton
      let lo=1e9, hi=-1e9; for (let i=1;i<verts.length;i+=14){ const y=verts[i]; if(y<lo)lo=y; if(y>hi)hi=y; }
      skins[arch] = { buf:b, count, lo, hi, h:(hi-lo)||1 }; return true; } catch(e){ return false; }
  }
  function hasSkin(arch) { return !!skins[arch]; }
  // Build the joint palette: for each bone, the transform taking its BIND segment onto the
  // skeleton's current segment (rotate about the joint by the bone's turn, then translate).
  function skinPalette(f, K, sk) {
    const S = 150 / sk.h, out = new Float32Array(11*16);
    const bindPt = (nx, ny) => [nx*150, ny*150];             // normalised bind space → skeleton px
    const BIND = { pelvis:[0,0.50], chest:[0,0.62], head:[0,0.84], armF0:[0.10,0.80], armF1:[0.26,0.79],
      armB0:[-0.10,0.80], armB1:[-0.26,0.79], legF0:[0.07,0.48], legF1:[0.07,0.26], legB0:[-0.07,0.48], legB1:[-0.07,0.26] };
    const BINDC = { pelvis:[0,0.62], chest:[0,0.84], head:[0,0.97], armF0:[0.26,0.79], armF1:[0.40,0.78],
      armB0:[-0.26,0.79], armB1:[-0.40,0.78], legF0:[0.07,0.26], legF1:[0.07,0.04], legB0:[-0.07,0.26], legB1:[-0.07,0.04] };
    for (let i=0;i<11;i++) {
      const name = BONE_ORDER[i], child = BONE_CHILD[name];
      const jp = jointPt(K, name), cp = child ? jointPt(K, child) : null;
      const b0 = bindPt(BIND[name][0], BIND[name][1]), b1 = bindPt(BINDC[name][0], BINDC[name][1]);
      let m;
      if (jp) {
        const bAng = Math.atan2(b1[1]-b0[1], b1[0]-b0[0]);
        const nAng = cp ? Math.atan2(-(cp.y-jp.y), cp.x-jp.x) : bAng;
        let d = nAng - bAng; while (d>PI) d-=TAU; while (d<-PI) d+=TAU;
        // model-space: scale to skeleton px, rotate about the bind joint, move to the live joint
        m = M.mul(M.mul(M.T(jp.x, -jp.y, 0), M.Rz(d)),
              M.mul(M.T(-b0[0], -b0[1], 0), M.mul(M.S(S,S,S), M.T(0, -sk.lo, 0))));
      } else m = M.mul(M.S(S,S,S), M.T(0, -sk.lo, 0));
      out.set(m, i*16);
    }
    return out;
  }
  function drawSkinned(f, mirror, K, fm) {
    const sk = skins[f.arch]; const a = mirror ? 0.30 : 1, dk = mirror ? 0.45 : 1;
    const g = garbOf(f), col = sc(hex(g.top), dk);
    gl.useProgram(skinProg); curMesh='';
    gl.bindBuffer(gl.ARRAY_BUFFER, sk.buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,56,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,56,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,56,24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,4,gl.FLOAT,false,56,40);
    gl.uniformMatrix4fv(u(skinProg,'uBones'), false, skinPalette(f, K, sk));
    gl.uniformMatrix4fv(u(skinProg,'uMVP'), false, M.mul(VP, fm)); gl.uniformMatrix4fv(u(skinProg,'uModel'), false, fm);
    gl.uniform3fv(u(skinProg,'uColor'), col); gl.uniform1f(u(skinProg,'uEmis'),0); gl.uniform1f(u(skinProg,'uAlpha'),a);
    gl.uniform1f(u(skinProg,'uMat'), bodyMat(f)); gl.uniform1f(u(skinProg,'uTime'), t3);
    gl.uniform3fv(u(skinProg,'uLight'),[0.35,0.9,0.5]); gl.uniform3fv(u(skinProg,'uCam'),camPos);
    gl.uniform3fv(u(skinProg,'uFog'),FOG); gl.uniform2fv(u(skinProg,'uFogND'),[17,58]);
    gl.drawArrays(gl.TRIANGLES, 0, sk.count);
    gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
    gl.useProgram(litProg); curMesh='';
  }
  /* Baked city world (see scripts/bake-world.mjs). Uploaded once, drawn as one opaque batch. */
  let worldMesh = null;
  function setWorld(verts) { if (!ok || !verts || !verts.length) return false;
    try { mesh('world', verts); worldMesh = true; return true; } catch (e) { return false; } }
  function hasWorld() { return !!worldMesh; }
  /* Build a morphed set of the body primitives for one fighter, so an owned card visibly
   * reshapes that fighter's body. Cheap + cached: built once per variant id. */
  const variants = {};
  function setMorphVariant(id, morph) {
    if (!ok || !id || !window.RoninMorph) return false;
    const pre = 'mv:' + id + ':';
    if (variants[id]) return true;
    try {
      const m = (typeof morph === 'string') ? RoninMorph.fromSlug(morph, 0.55) : morph;
      for (const base of ['limb', 'sph', 'cyl', 'cube']) {
        const srcV = geoSrc[base]; if (!srcV) continue;
        mesh(pre + base, RoninMorph.apply(Float32Array.from(srcV), m));
      }
      variants[id] = pre; return true;
    } catch (e) { return false; }
  }
  // draw a model-backed fighter: parts ride the joints, everything else (FX, trail) is unchanged
  function drawModelFighter(f, mirror, K, fm) {
    const md = models[f.arch]; const a = mirror ? 0.30 : 1, dk = mirror ? 0.45 : 1;
    const g = garbOf(f), col = sc(hex(g.top), dk), S = md.scale;
    // render-space angle of the bone at joint j (y is flipped vs the skeleton)
    const boneAng = (j) => { const c = CHILD[j]; if (!c) return null;
      const p = jointPt(K, j), q = jointPt(K, c); if (!p || !q) return null;
      return Math.atan2(-(q.y - p.y), q.x - p.x); };
    // Bind pose: captured on the first drawn frame. Parts sit where the model has them; each
    // frame we move them by how far their joint travelled AND rotate them by how far their
    // bone turned — that rotation is what makes the model move like a body.
    if (!md.bind) { md.bind = {};
      for (const p of md.parts) { const jp = jointPt(K, p.joint);
        if (jp) md.bind[p.joint] = { x: jp.x, y: jp.y, ang: boneAng(p.joint) }; } }
    _mat = bodyMat(f);
    for (const p of md.parts) {
      const jp = jointPt(K, p.joint), b = md.bind[p.joint];
      const base = M.mul(M.S(S, S, S), M.T(0, -md.footY, 0));
      let local;
      if (jp && b) {
        const dx = jp.x - b.x, dy = -(jp.y - b.y);
        const now = boneAng(p.joint);
        let d = (now != null && b.ang != null) ? now - b.ang : 0;
        while (d > PI) d -= TAU; while (d < -PI) d += TAU;                 // shortest way round
        // rotate the part about its joint (in model-local space), then follow the joint
        local = M.mul(M.mul(M.T(b.x + dx, -b.y + dy, 0), M.Rz(d)), M.mul(M.T(-b.x, b.y, 0), base));
      } else local = base;
      draw(p.key, M.mul(fm, local), col, 0, a);
    }
    _mat = 0;
  }

  function drawFighter(f, mirror) {
    const K = RoninArt.skel(f); const fm = fighterMatrix(f, mirror);
    if (!mirror) { const tp = xform(fm, K.sword.tip.x, -K.sword.tip.y, 0);   // world blade tip → 3D streak
      (f.trail3 = f.trail3 || []).unshift(tp); if (f.trail3.length > 14) f.trail3.pop(); }
    if (skins[f.arch]) { drawSkinned(f, mirror, K, fm); return; }              // real skinned deformation
    if (models[f.arch]) { drawModelFighter(f, mirror, K, fm); return; }      // real modelled geometry when loaded
    meshVar = (f.morphId && variants[f.morphId]) ? variants[f.morphId] : '';  // card-keyed body variant
    const a = mirror ? 0.30 : 1, dk = mirror ? 0.45 : 1;
    const g = garbOf(f);
    const SKIN = sc(hex(g.skin), dk), TOP = sc(hex(g.top), dk), TOPB = sc(TOP, 0.84), PANT = sc(hex(g.pants), dk), PANTB = sc(PANT, 0.85),
      BOOT = sc(hex(g.boot), dk), GLOVE = sc(hex(g.glove), dk), TRIM = sc(hex(g.trim), dk), HAIR = sc(hex(g.hair), dk);
    const col = sc(hex(f.col), dk), tint = sc(hex(f.tint), dk);
    const bm = bodyMat(f), lm = limbMat(f);
    const bareArms = g.bare === 'arms' || g.bare === 'torso', bareTorso = g.bare === 'torso';
    // ── legs: pant-coloured capsules (thigh → knee → calf) ending in boots ──
    _mat = lm;
    beam(fm, K.legB[0], K.legB[1], 8.5, PANTB, 0, a); ball(fm, K.legB[1], 7.6, PANTB, 0, a); beam(fm, K.legB[1], K.legB[2], 7, PANTB, 0, a);
    beam(fm, K.legF[0], K.legF[1], 9.2, PANT, 0, a); ball(fm, K.legF[1], 8.2, PANT, 0, a); beam(fm, K.legF[1], K.legF[2], 7.6, PANT, 0, a);
    ball(fm, K.legF[0], 9, PANT, 0, a); ball(fm, K.legB[0], 8.4, PANTB, 0, a);           // hips
    _mat = 0;
    // boots: shaft cuff + sole + rounded toe
    ball(fm, K.legB[2], 6, BOOT, 0.05, a); ball(fm, K.legF[2], 6.4, BOOT, 0.05, a);
    bit(fm, K.legF[2].x + 3, K.legF[2].y + 2, 24, 7, 14, BOOT, 0.1, a); orb(fm, K.legF[2].x + 12, K.legF[2].y + 1, 0, 8, 7, 12, sc(BOOT, 1.15), 0.1, a);
    bit(fm, K.legB[2].x + 2, K.legB[2].y + 2, 22, 7, 13, sc(BOOT, 0.9), 0.1, a); orb(fm, K.legB[2].x + 10, K.legB[2].y + 1, 0, 7, 6, 11, sc(BOOT, 1.05), 0.1, a);
    // cloak / scarf draped behind the torso
    archBack(fm, f, K, col, tint, a, dk);
    // ── torso: anatomical — lats taper to a narrow waist, pecs, abs; jacket or bare skin ──
    const TCOL = bareTorso ? SKIN : TOP;
    _mat = bareTorso ? 5 : bm;
    const waist = { x: K.pelvis.x + (K.chest.x - K.pelvis.x) * 0.28, y: K.pelvis.y + (K.chest.y - K.pelvis.y) * 0.28 };
    ball(fm, K.pelvis, 11.5, TCOL, 0, a);
    beam(fm, waist, K.chest, 17, TCOL, 0, a);                                             // chest block, wide at the shoulders
    beam(fm, K.pelvis, waist, 12.5, TCOL, 0, a);                                          // narrow waist
    ball(fm, K.chest, 15.5, TCOL, 0, a);
    { const px = K.chest.x + 6, py = K.chest.y + 5;                                       // pecs
      for (const s of [-1, 1]) orb(fm, px, py, s * 7, 13, 10, 12, sc(TCOL, 1.06), 0, a);
      if (bareTorso) for (let i = 0; i < 2; i++) for (const s of [-1, 1])                 // abs (bare torsos only)
        orb(fm, waist.x + 4, waist.y - 4 + i * 9, s * 4.5, 7, 6.5, 8, sc(SKIN, 1.05), 0, a); }
    const nk = { x: K.chest.x + (K.head.x - K.chest.x) * 0.5, y: K.chest.y + (K.head.y - K.chest.y) * 0.42 };
    _mat = 5; beam(fm, K.chest, nk, 6.5, SKIN, 0, a);                                      // neck (always skin)
    _mat = bareTorso ? 5 : bm;
    orb(fm, K.armF[0].x, K.armF[0].y, 8, 20, 18, 18, TCOL, 0, a); orb(fm, K.armB[0].x, K.armB[0].y, -8, 18, 16, 16, sc(TCOL, 0.86), 0, a);   // deltoids
    _mat = 1; bit(fm, K.pelvis.x, K.pelvis.y - 3, 31, 9, 27, TRIM, 0.12, a);               // belt / obi
    // ── back arm: bare skin or sleeve, glove at the hand ──
    const ARM = bareArms ? SKIN : TOP, ARMB = bareArms ? sc(SKIN, 0.88) : TOPB;
    _mat = bareArms ? 5 : lm;
    beam(fm, K.armB[0], K.armB[1], 7, ARMB, 0, a); ball(fm, K.armB[1], 5.8, ARMB, 0, a); beam(fm, K.armB[1], K.armB[2], 5.2, ARMB, 0, a);
    _mat = 0; orb(fm, K.armB[2].x - 3, K.armB[2].y - 3, 0, 9, 9, 9, sc(GLOVE, 0.9), 0.08, a);   // wrist wrap
    drawHand(fm, K.armB[2], { x: K.armB[2].x - K.armB[1].x, y: K.armB[2].y - K.armB[1].y }, GLOVE, dk, a, f.state === 'punch');
    // ── head: skin + hair + headband + face ──
    _mat = f.arch === 'prizm' ? 4 : 5;
    ball(fm, K.head, 13, SKIN, 0.06, a);
    drawHair(fm, f, K, HAIR, a, dk);
    _mat = 1; bit(fm, K.head.x, K.head.y + 4, 27, 6, 27, TRIM, 0.45, a);
    if (!mirror) drawFace(fm, f, K, SKIN, dk, a);
    archHead(fm, f, K, tint, a, dk);
    // ── front arm + gloved hand gripping the hilt ──
    _mat = bareArms ? 5 : lm;
    beam(fm, K.armF[0], K.armF[1], 7.2, ARM, 0, a); ball(fm, K.armF[1], 6, ARM, 0, a); beam(fm, K.armF[1], K.armF[2], 5.4, ARM, 0, a);
    _mat = 0; orb(fm, K.sword.hand.x - 4, K.sword.hand.y - 4, 0, 10, 10, 10, GLOVE, 0.08, a);   // bracer
    drawHand(fm, K.sword.hand, { x: K.sword.tip.x - K.sword.hand.x, y: K.sword.tip.y - K.sword.hand.y }, GLOVE, dk, a, false);
    // ── weapon: a HELD hilt (pommel + wrapped grip through the fist + tsuba) with the blade emerging above the guard ──
    const wm = bladeMat(f); const sh = K.sword.hand, tp = K.sword.tip, bl = Math.hypot(tp.x - sh.x, tp.y - sh.y) || 1, dx = (tp.x - sh.x) / bl, dy = (tp.y - sh.y) / bl;
    if (f.arch === 'oni') {                                                                          // spiked club: shaft gripped, head at the top
      _mat = 2; const pom = { x: sh.x - dx * 8, y: sh.y - dy * 8 };
      beam(fm, pom, tp, 5, sc([0.34, 0.24, 0.14], dk), 0.05, a); orb(fm, pom.x, pom.y, 0, 7, 7, 7, sc([0.3, 0.22, 0.12], dk), 0.1, a);
      orb(fm, tp.x, tp.y, 0, 12, 12, 12, sc([0.34, 0.3, 0.24], dk), 0.1, a); for (const s of [-1, 1]) orb(fm, tp.x, tp.y, s * 6, 6, 6, 6, sc([0.28, 0.28, 0.32], dk), 0.2, a);
    } else {
      const pom = { x: sh.x - dx * 9, y: sh.y - dy * 9 }, guard = { x: sh.x + dx * 9, y: sh.y + dy * 9 }, bstart = { x: sh.x + dx * 11, y: sh.y + dy * 11 };
      _mat = 2; beam(fm, pom, guard, 2.7, sc([0.22, 0.17, 0.1], dk), 0.03, a);                       // wrapped grip through the hand
      orb(fm, pom.x, pom.y, 0, 6.5, 6.5, 6.5, sc([0.4, 0.32, 0.16], dk), 0.1, a);                    // pommel knob
      orb(fm, guard.x, guard.y, 0, 15, 4.5, 15, sc([0.74, 0.56, 0.22], dk), 0.15, a);                // tsuba guard
      const blCol = f.glow > 0 ? [1, 0.9, 0.5] : wm === 6 ? [0.82, 0.6, 1] : [0.92, 0.97, 1];
      _mat = wm; beam(fm, bstart, tp, (f.glow > 0 || wm === 6) ? 4.5 : 3.2, wm === 6 ? blCol : sc(blCol, dk), wm === 6 ? 0.55 : 0.4, a);   // blade above the fist
    }
    _mat = 0;
    if (f.arch === 'prizm') archShards(fm, f, K, a, dk);
    meshVar = '';
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
  // ── 3D combat FX ──
  // smooth blade-streak ribbon (a real katana trail — a tapered, fading strip, not chunky tubes).
  // Uses trailProg (per-vertex alpha); caller binds trailProg + uVP.
  const ribBuf = [];
  function ribbon(pts, wHead, wTail, aHead, col) {
    const n = pts.length; if (n < 2) return; ribBuf.length = 0;
    for (let i = 0; i < n; i++) { const p = pts[i], q = i < n - 1 ? pts[i + 1] : pts[i - 1];
      let dx = (i < n - 1 ? q[0] - p[0] : p[0] - q[0]), dy = (i < n - 1 ? q[1] - p[1] : p[1] - q[1]);
      const L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L;             // perpendicular in the x-y plane
      const t = i / (n - 1), w = wHead + (wTail - wHead) * t, al = aHead * (1 - t) * (1 - t);
      ribBuf.push(p[0] + px * w, p[1] + py * w, p[2], al, p[0] - px * w, p[1] - py * w, p[2], al); }
    gl.uniform3fv(u(trailProg, 'uCol'), col);
    gl.bindBuffer(gl.ARRAY_BUFFER, trailBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ribBuf), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, ribBuf.length / 4); curMesh = '';
  }
  function drawTrail3(f) {
    const tr = f.trail3; if (!tr || tr.length < 3) return;
    let spread = 0; for (let i = 0; i < tr.length - 1; i++) spread += Math.hypot(tr[i][0] - tr[i + 1][0], tr[i][1] - tr[i + 1][1]);
    if (spread < 0.45) return;                                      // only fast swings smear
    ribbon(tr, 0.16, 0.006, 0.85, f.glow > 0 ? [1, 0.95, 0.62] : hex(f.tint || '#dfeeff'));
  }
  // slash-arc crescent as a filled ribbon band (inner→outer radius), bright at the leading edge
  function drawArc3(e, gY) {
    const cx = e.x * SC, cy = (gY - e.y) * SC, rO = e.r * SC * 0.6, rI = rO * 0.5, fade = 1 - clampf(e.t / e.life, 0, 1);
    const c = hex(e.col || '#eaf6ff'), col = [Math.min(1, c[0] * 0.5 + 0.6), Math.min(1, c[1] * 0.5 + 0.6), Math.min(1, c[2] * 0.5 + 0.6)];
    const N = 14; ribBuf.length = 0;
    for (let i = 0; i <= N; i++) { const th = e.a0 + (e.a1 - e.a0) * (i / N), cs = e.face * Math.cos(th), sn = Math.sin(th);
      const edge = fade * 0.9 * (1 - Math.abs(i / N - 0.5) * 0.7);              // brighter through the middle of the sweep
      ribBuf.push(cx + cs * rI, cy - sn * rI, 0, edge * 0.15, cx + cs * rO, cy - sn * rO, 0, edge); }
    gl.uniform3fv(u(trailProg, 'uCol'), col);
    gl.bindBuffer(gl.ARRAY_BUFFER, trailBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ribBuf), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, ribBuf.length / 4); curMesh = '';
  }
  // sparks (velocity-aligned streaks), dust (flat ground puffs), shock (one clean expanding ring) — lit shader, additive
  function drawFxLit(G) {
    const gY = G.groundY || 500, fx = G.fx || [];
    for (const e of fx) {
      if (e.kind === 'spark') { const k = 1 - e.t / e.life; const hx = e.x * SC, hy = (gY - e.y) * SC;
        const tx = hx - (e.vx || 0) * SC * 0.018, ty = hy + (e.vy || 0) * SC * 0.018;   // tail trails the velocity
        beam3([tx, ty, 0], [hx, hy, 0], (e.r * SC * 0.5) * (0.4 + k), hex(e.col), 1, k); }
      else if (e.kind === 'dust') { const pr = e.t / e.life, r = e.r * SC * 1.6 * (1 + pr * 1.7);   // flat disc on the floor
        draw('quad', M.mul(M.T(e.x * SC, 0.03 + pr * 0.1, (e.z || 0) * SC), M.S(r, 1, r)), [0.5, 0.44, 0.6], 0.4, (1 - pr) * 0.22); }
      else if (e.kind === 'arc') { /* drawn in the ribbon pass */ }
    }
    const s = G.shock;                                              // ONE clean expanding ground ring (annulus mesh)
    if (s) { const R = s.t * 9 + 0.25, al = Math.max(0, 1 - s.t / 0.5) * 0.75 * (s.str || 1);
      draw('ring', M.mul(M.T((s.wx || 0) * SC, 0.05, 0), M.S(R, 1, R)), [1, 0.5, 0.92], 1, al); }
  }
  // ── anime sprite pops: camera-facing glyphs (impact stars, speed lines, "!", sweat, burst rings) ──
  const SPK = { star: 0, line: 1, bang: 2, sweat: 3, burst: 4 };
  let camRight = [1, 0, 0], camUp = [0, 1, 0];
  function drawPops(G) {
    const pops = G.pops || []; if (!pops.length) return;
    const gY = G.groundY || 500;
    gl.useProgram(spriteProg); curMesh = '';
    gl.uniformMatrix4fv(u(spriteProg, 'uVP'), false, VP);
    gl.uniform3fv(u(spriteProg, 'uRight'), camRight); gl.uniform3fv(u(spriteProg, 'uUp'), camUp);
    gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf); gl.enableVertexAttribArray(0); gl.disableVertexAttribArray(1); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const p of pops) {
      const k = clampf(p.t / p.life, 0, 1), pop = k < 0.22 ? k / 0.22 : 1;                 // quick scale-in, then hold + fade
      const s = (p.size || 0.5) * SC * 100 * (0.55 + pop * 0.65) * (1 + k * (p.grow || 0.35));
      gl.uniform3fv(u(spriteProg, 'uPos'), [p.x * SC, (gY - p.y) * SC, (p.z || 0) * SC]);
      gl.uniform2f(u(spriteProg, 'uSize'), s, s);
      gl.uniform1f(u(spriteProg, 'uRot'), p.rot || 0); gl.uniform1f(u(spriteProg, 'uKind'), p.kind || 0);
      gl.uniform3fv(u(spriteProg, 'uCol'), hex(p.col || '#ffffff')); gl.uniform1f(u(spriteProg, 'uAlpha'), (1 - k * k) * (p.a == null ? 1 : p.a));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
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
      const composited = post && post.begin();     // scene -> offscreen when the chain is up
      if (!composited) gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(FOG[0], FOG[1], FOG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      t3 += 0.016;
      const a = G.fighters[0], b = G.fighters[1];
      const midX = ((a ? a.x : 0) + (b ? b.x : 0)) / 2 * SC, sep = Math.abs(((a ? a.x : 0) - (b ? b.x : 0)) * SC);
      // ── dynamic fight-camera: gentle idle orbit, pulls in + swings on hero moments (G.camZoom / G.camDir) ──
      if (G.worldMode && G.me && G.me.w) {                             // third-person chase cam
        const p = G.me.w, yaw = G.camYaw || 0, dist = 7.5, hgt = 3.4;
        const tx = p.x - Math.sin(yaw) * dist, tz = p.z - Math.cos(yaw) * dist;
        cam.wx = cam.wx == null ? tx : cam.wx + (tx - cam.wx) * 0.14;
        cam.wz = cam.wz == null ? tz : cam.wz + (tz - cam.wz) * 0.14;
        cam.wy = cam.wy == null ? p.y + hgt : cam.wy + ((p.y + hgt) - cam.wy) * 0.16;
        const shkW = (G.shake || 0) * 0.02;
        camPos = [cam.wx + (Math.random()*2-1)*shkW, cam.wy, cam.wz];
        VP = M.mul(M.persp(0.86, cv.width / cv.height, 0.1, 400), M.look(camPos, [p.x, p.y + 1.5, p.z], [0, 1, 0]));
        { const fwd = norm(sub([p.x, p.y + 1.5, p.z], camPos)); camRight = norm(cross(fwd, [0,1,0])); camUp = cross(camRight, fwd); }
        drawScene(G); if (composited) post.end(); gl.flush(); return true;
      }
      const zoom = clampf(G.camZoom || 0, 0, 1), cdir = (G.camDir || 1) < 0 ? -1 : 1;
      const tDist = clampf(6.8 + sep * 0.5, 6.2, 12) - zoom * 3.2, tH = 2.62 - zoom * 0.5, tAz = Math.sin(t3 * 0.22) * 0.10 + cdir * zoom * 0.36;
      cam.dist += (tDist - cam.dist) * 0.14; cam.h += (tH - cam.h) * 0.14; cam.az += (tAz - cam.az) * 0.16;
      const shk = (G.shake || 0) * 0.02;
      camPos = [midX + Math.sin(cam.az) * cam.dist + (Math.random() * 2 - 1) * shk, cam.h + (Math.random() * 2 - 1) * shk, Math.cos(cam.az) * cam.dist];
      VP = M.mul(M.persp(0.72, cv.width / cv.height, 0.1, 70), M.look(camPos, [midX, 2.0, 0], [0, 1, 0]));
      { const fwd = norm(sub([midX, 2.0, 0], camPos)); camRight = norm(cross(fwd, [0, 1, 0])); camUp = cross(camRight, fwd); }   // billboard basis for sprite pops

      gl.enable(gl.BLEND);
      drawScene(G);
      if (composited) post.end();
      gl.flush(); return true;
    } catch (e) { ok = false; return false; }
  }
  function drawScene(G) {
    const a = G.fighters[0], b = G.fighters[1];
    const midX = G.worldMode ? (G.me && G.me.w ? G.me.w.x : 0) : ((a ? a.x : 0) + (b ? b.x : 0)) / 2 * SC;
    {
      gl.enable(gl.BLEND);
      // 1. ground (opaque)
      gl.useProgram(groundProg); curMesh = ''; const gm = M.mul(M.T(midX, worldMesh ? -0.35 : 0, 0), M.S(worldMesh ? 200 : 90, 1, worldMesh ? 200 : 90));
      gl.uniformMatrix4fv(u(groundProg, 'uMVP'), false, M.mul(VP, gm)); gl.uniformMatrix4fv(u(groundProg, 'uModel'), false, gm);
      gl.uniform3fv(u(groundProg, 'uCam'), camPos); gl.uniform3fv(u(groundProg, 'uFog'), FOG); gl.uniform2fv(u(groundProg, 'uFogND'), [10, 44]); gl.uniform1f(u(groundProg, 'uAlpha'), 1); gl.uniform1f(u(groundProg, 'uTime'), t3); gl.uniform1f(u(groundProg, 'uWater'), worldMesh ? 1 : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.quad.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.disableVertexAttribArray(1); gl.drawArrays(gl.TRIANGLES, 0, 6);

      setLit(); _mat = 0;
      // 1b. the baked city, if a world is loaded — one opaque batch, lit like everything else
      if (worldMesh) { _mat = 8; draw('world', M.ident(), [0.7, 0.6, 0.9], 0, 1); _mat = 0; }   // PSYCHEDELIC city
      // 2. the placeholder skyline + moon only exist when there's no real world loaded
      if (!worldMesh) {
        for (let i = -6; i <= 6; i++) { const bx = midX + i * 4.4, bh = 3 + ((i * 7 % 5 + 5) % 5) * 1.4; bit3(bx, bh / 2, -17 - ((i * 3 % 4 + 4) % 4), 2.4, bh, 1.2, [0.12, 0.06, 0.2], 0.5); }
        draw('sph', M.mul(M.T(midX + 13, 10.5, -30), M.S(6, 6, 6)), [1, 0.96, 0.85], 1, 1);
      }
      // 3. reflections (drawn over the floor, depth-test off, faded) — wet-floor look
      gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
      for (const f of G.fighters) if (f) drawFighter(f, true);
      // 4. soft contact shadows
      for (const f of G.fighters) if (f) drawShadow(f);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
      // 5. fighters
      for (const f of G.fighters) if (f) drawFighter(f, false);
      // 6. combat FX — additive glow. Ribbons (blade streaks + slash arcs) use their own flat shader;
      //    sparks/dust/shock use the lit shader.
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); _mat = 0;
      gl.useProgram(trailProg); gl.uniformMatrix4fv(u(trailProg, 'uVP'), false, VP);
      for (const f of G.fighters) if (f && !f.dead) drawTrail3(f);
      for (const e of (G.fx || [])) if (e.kind === 'arc') drawArc3(e, G.groundY || 500);
      gl.useProgram(litProg); curMesh = '';
      drawFxLit(G);
      drawPops(G);                                            // 7. anime sprite pops (billboarded glyphs)
      gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
  }
  function bit3(x, y, z, sx, sy, sz, color, emis) { draw('cube', M.mul(M.T(x, y, z), M.S(sx, sy, sz)), color, emis, 1); }

  return { init, render, registerModel, hasModel, registerSkin, hasSkin, setMorphVariant, setWorld, hasWorld,
           post: () => post, get ok() { return ok; } };
})();

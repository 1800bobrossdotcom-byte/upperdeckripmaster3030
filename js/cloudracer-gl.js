/* CLOUD RACER — WebGL renderer (window.CRGL).
 *
 * A WipEout-style anti-grav pod racer through a volumetric cloudscape. Self-
 * contained WebGL1 (no libs, inline GLSL): dawn sky + sun, a banked ribbon
 * track threaded through billboard clouds, low-poly hover-pods with meme pilots
 * (pepe/wojak portrait billboards), speed streaks, and speed-scaled fog + FOV.
 *
 *   CRGL.init(canvas)                    → true if WebGL is up
 *   CRGL.buildTrack(pts, halfW)         → build the track ribbon + boost pads
 *   CRGL.pilotTex(canvas)               → upload a pilot portrait, returns a handle
 *   CRGL.frame(state)                   → draw one frame (see state shape in cloudracer.html)
 *   CRGL.supported()                    → bool
 */
window.CRGL = (function () {
  let gl = null, cv = null, ok = false;
  let W = null, SKY = null, BB = null, STK = null;   // programs
  let loc = {}, skl = {}, bbl = {}, stl = {}, tex = {};
  let trackBuf = null, padBuf = null, dyn = null, quad = null, streakBuf = null;
  const STRIDE = 11;                                  // pos3 nrm3 uv2 col3

  // ── math ──
  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
  function persp(fovy, asp, n, f) { const t = 1/Math.tan(fovy*0.5), nf = 1/(n-f);
    return [t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)*nf,-1, 0,0,2*f*n*nf,0]; }
  function lookAt(e, c, up) {
    let z = norm(sub(e, c)); let x = norm(cross(up, z)); let y = cross(z, x);
    return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
      -(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]), -(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]), -(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]), 1]; }
  function mul(a, b) { const o = new Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
      o[i*4+j] = a[j]*b[i*4]+a[4+j]*b[i*4+1]+a[8+j]*b[i*4+2]+a[12+j]*b[i*4+3];
    return o; }

  // ── shaders ──
  const VS = `attribute vec3 aPos,aNormal,aColor; attribute vec2 aUV;
    uniform mat4 uMVP,uModel; uniform vec3 uCam;
    varying vec3 vN,vC; varying vec2 vUV; varying float vFog; varying vec3 vW;
    void main(){ vec4 w=uModel*vec4(aPos,1.0); vW=w.xyz; gl_Position=uMVP*w;
      vN=mat3(uModel)*aNormal; vC=aColor; vUV=aUV; vFog=distance(w.xyz,uCam); }`;
  const FS = `precision mediump float;
    uniform sampler2D uTex; uniform int uUseTex; uniform vec3 uLight,uFog,uEmit; uniform float uFogNear,uFogFar,uEmitAmt,uTime;
    varying vec3 vN,vC; varying vec2 vUV; varying float vFog; varying vec3 vW;
    void main(){ vec3 base=vC; if(uUseTex==1){ vec4 t=texture2D(uTex,vUV); base*=t.rgb; }
      float d=max(dot(normalize(vN),uLight),0.0);
      vec3 lit=base*(0.55+0.5*d) + uEmit*uEmitAmt;
      float f=clamp((vFog-uFogNear)/(uFogFar-uFogNear),0.0,1.0);
      gl_FragColor=vec4(mix(lit,uFog,f),1.0); }`;
  // sky: per-pixel dawn gradient + warm sun disc/halo, ray reconstructed from screen
  const SKY_VS = `attribute vec2 aP; varying vec2 vNdc; void main(){ vNdc=aP; gl_Position=vec4(aP,1.0,1.0); }`;
  const SKY_FS = `precision mediump float; varying vec2 vNdc;
    uniform vec3 uTop,uMid,uHorizon,uSunDir,uSunCol; uniform float uYaw,uPitch,uAsp,uFov;
    void main(){ float py=uPitch+vNdc.y*uFov*0.5; float yw=uYaw+vNdc.x*uFov*0.5*uAsp;
      vec3 r=vec3(sin(yw)*cos(py), sin(py), cos(yw)*cos(py));
      float h=clamp(r.y*1.4+0.34,0.0,1.0);
      vec3 c = h>0.5 ? mix(uMid,uTop,(h-0.5)*2.0) : mix(uHorizon,uMid,h*2.0);
      float sd=max(dot(r,uSunDir),0.0);
      c += uSunCol*pow(sd,7.0)*0.6;                       // halo
      c += vec3(1.0,0.96,0.86)*smoothstep(0.9975,0.9992,sd);// disc
      gl_FragColor=vec4(c,1.0); }`;
  // billboards (clouds + pilots + glows): camera-facing textured quads
  const BB_VS = `attribute vec2 aCorner; attribute vec3 aCenter; attribute vec4 aData; // xy=size, z=tint idx, w=alpha
    uniform mat4 uVP; uniform vec3 uRight,uUp,uCam; uniform vec4 uTintA,uTintB;
    varying vec2 vUV; varying float vA; varying float vFog; varying vec3 vTint;
    void main(){ vec3 w=aCenter + uRight*(aCorner.x*aData.x) + uUp*(aCorner.y*aData.y);
      gl_Position=uVP*vec4(w,1.0); vUV=aCorner*0.5+0.5; vA=aData.w;
      vTint=mix(uTintA.rgb,uTintB.rgb,clamp(aData.z,0.0,1.0)); vFog=distance(w,uCam); }`;
  const BB_FS = `precision mediump float; uniform sampler2D uTex; uniform vec3 uFog; uniform float uFogNear,uFogFar,uTintAmt;
    varying vec2 vUV; varying float vA; varying float vFog; varying vec3 vTint;
    void main(){ vec4 t=texture2D(uTex,vUV); float a=t.a*vA; if(a<0.01) discard;
      vec3 col=mix(t.rgb, t.rgb*vTint, uTintAmt);
      float f=clamp((vFog-uFogNear)/(uFogFar-uFogNear),0.0,1.0);
      gl_FragColor=vec4(mix(col,uFog,f*0.85), a*(1.0-f*0.5)); }`;
  // speed streaks: screen-space additive radial lines
  const STK_VS = `attribute vec2 aP; attribute float aA; varying float vA; void main(){ vA=aA; gl_Position=vec4(aP,0.0,1.0); }`;
  const STK_FS = `precision mediump float; varying float vA; void main(){ gl_FragColor=vec4(1.0,1.0,1.0,vA); }`;

  function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn('CRGL shader', gl.getShaderInfoLog(o)); return null; } return o; }
  function prog(vs, fs) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('CRGL link', gl.getProgramInfoLog(p)); return null; } return p; }

  // ── procedural textures ──
  function texFrom(c) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  function cvs(s) { const c = document.createElement('canvas'); c.width = c.height = s; return c; }
  function cloudTex() { const S = 128, c = cvs(S), x = c.getContext('2d'); const cx = S/2;
    // a fluffy multi-lobe puff: several soft radial blobs
    for (let i = 0; i < 9; i++) { const a = Math.random()*6.28, r = Math.random()*S*0.22;
      const px = cx + Math.cos(a)*r, py = cx + Math.sin(a)*r*0.7, rad = S*(0.16+Math.random()*0.16);
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.55, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill(); }
    // soft bottom shading for volume
    const gg = x.createLinearGradient(0, cx*0.6, 0, S); gg.addColorStop(0, 'rgba(150,170,210,0)'); gg.addColorStop(1, 'rgba(120,140,190,0.28)');
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = gg; x.fillRect(0, 0, S, S); x.globalCompositeOperation = 'source-over';
    return texFrom(c); }
  function trackTex() { const S = 256, c = cvs(S), x = c.getContext('2d');
    x.fillStyle = '#0b1030'; x.fillRect(0, 0, S, S);
    x.fillStyle = 'rgba(60,80,160,0.25)'; for (let i = 0; i < 400; i++) x.fillRect(Math.random()*S, Math.random()*S, 2, 2);
    // neon edge stripes (U near 0 and 1)
    x.fillStyle = '#3df0ff'; x.fillRect(0, 0, S*0.06, S); x.fillRect(S*0.94, 0, S*0.06, S);
    x.fillStyle = '#ff2ad9'; x.fillRect(S*0.06, 0, S*0.02, S); x.fillRect(S*0.92, 0, S*0.02, S);
    // dashed centre line
    x.fillStyle = 'rgba(255,255,255,0.5)'; for (let y = 0; y < S; y += 40) x.fillRect(S/2-3, y, 6, 22);
    return texFrom(c); }
  function padTex() { const S = 128, c = cvs(S), x = c.getContext('2d');
    x.clearRect(0, 0, S, S); x.fillStyle = 'rgba(60,255,140,0.0)'; x.fillRect(0,0,S,S);
    x.strokeStyle = '#2bff80'; x.lineWidth = 10; for (let i = 0; i < 4; i++) { const y = i*S/4; x.beginPath(); x.moveTo(0, y+S/6); x.lineTo(S/2, y); x.lineTo(S, y+S/6); x.stroke(); }
    return texFrom(c); }
  function glowTex() { const S = 64, c = cvs(S), x = c.getContext('2d'); const g = x.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
    g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.3,'rgba(120,220,255,0.8)'); g.addColorStop(1,'rgba(60,120,255,0)');
    x.fillStyle = g; x.fillRect(0,0,S,S); return texFrom(c); }

  // ── track ribbon mesh ──
  let TRACK = null;
  function buildTrack(pts, halfW) {
    TRACK = { pts, halfW };
    const A = [], P = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i+1) % n];
      const push = (arr, p, nr, u, v, col) => arr.push(p[0],p[1],p[2], nr[0],nr[1],nr[2], u,v, col[0],col[1],col[2]);
      const eL = k => [k.p[0]-k.right[0]*halfW, k.p[1]-k.right[1]*halfW, k.p[2]-k.right[2]*halfW];
      const eR = k => [k.p[0]+k.right[0]*halfW, k.p[1]+k.right[1]*halfW, k.p[2]+k.right[2]*halfW];
      const aL = eL(a), aR = eR(a), bL = eL(b), bR = eR(b);
      const vA = (i/n)*24, vB = ((i+1)/n)*24, WHITE = [1,1,1];
      const arr = a.boost ? P : A;
      const col = a.boost ? [0.5,1.0,0.7] : WHITE;
      push(arr, aL, a.up, 0, vA, col); push(arr, aR, a.up, 1, vA, col); push(arr, bR, b.up, 1, vB, col);
      push(arr, aL, a.up, 0, vA, col); push(arr, bR, b.up, 1, vB, col); push(arr, bL, b.up, 0, vB, col);
    }
    if (trackBuf) gl.deleteBuffer(trackBuf.vbo); if (padBuf) gl.deleteBuffer(padBuf.vbo);
    trackBuf = mkvbo(A); padBuf = P.length ? mkvbo(P) : null;
  }
  function mkvbo(a) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW); return { vbo: b, count: a.length/STRIDE }; }

  // ── a detailed hover-pod (local space: forward +z, up +y, right +x) ──
  function podMesh() {
    const a = []; const nrm = (p0,p1,p2) => { const u = sub(p1,p0), v = sub(p2,p0); return norm(cross(u,v)); };
    const tri = (p0,p1,p2,c) => { const n = nrm(p0,p1,p2); [p0,p1,p2].forEach(p => a.push(p[0],p[1],p[2], n[0],n[1],n[2], 0,0, c[0],c[1],c[2])); };
    const body=[0.82,0.85,0.93], hull=[0.66,0.70,0.80], dark=[0.22,0.25,0.32], glass=[0.35,0.85,1.0], eng=[0.15,0.16,0.2], acc=[0.95,0.35,0.5];
    // fuselage: nose → cockpit peak → tail, with a keel
    const nose=[0,0.02,1.75], peak=[0,0.52,0.15], tail=[0,0.30,-1.15], keel=[0,-0.18,-0.2];
    const mL=[-0.62,0.02,-0.1], mR=[0.62,0.02,-0.1];
    tri(nose,mR,peak,body); tri(nose,peak,mL,body);           // upper hull L/R
    tri(peak,mR,tail,hull); tri(peak,tail,mL,hull);           // rear deck
    tri(nose,keel,mR,dark); tri(nose,mL,keel,dark);           // belly
    tri(keel,tail,mR,dark); tri(keel,mL,tail,dark);
    // swept wings
    const wL=[-1.35,0.06,-1.25], wR=[1.35,0.06,-1.25];
    tri(mL,[-0.62,0.02,-0.9],wL,hull); tri(mL,wL,[-0.55,0.30,-0.5],acc);
    tri(mR,wR,[0.62,0.02,-0.9],hull); tri(mR,[0.55,0.30,-0.5],wR,acc);
    // winglets
    tri(wL,[-1.5,0.5,-1.5],[-1.35,0.06,-1.6],acc); tri(wR,[1.35,0.06,-1.6],[1.5,0.5,-1.5],acc);
    // twin engine nacelles (rear)
    [-0.42,0.42].forEach(sx => { const b=[sx,0.06,-1.0], t=[sx,0.30,-0.9], r=[sx+0.16,0.18,-1.35], l=[sx-0.16,0.18,-1.35];
      tri(b,t,r,eng); tri(b,l,t,eng); tri(l,r,t,eng); });
    // tail fin
    tri([0,0.30,-1.0],[0,0.78,-1.45],[0,0.30,-1.5],acc);
    // canopy
    tri([0,0.3,0.7],[-0.24,0.56,0.05],[0.24,0.56,0.05],glass); tri([0,0.3,0.7],[0.24,0.56,0.05],[0,0.48,-0.35],glass); tri([0,0.3,0.7],[0,0.48,-0.35],[-0.24,0.56,0.05],glass);
    return mkvbo(a);
  }
  // a flat livery panel on the top deck (UV 0..1) — carries the race number + decals
  function decalMesh() {
    const a = [], n = [0,1,0];
    const A=[-0.5,0.4,-0.85], B=[0.5,0.4,-0.85], C=[0.52,0.5,0.55], D=[-0.52,0.5,0.55];
    const P=(p,u,v)=>a.push(p[0],p[1],p[2], n[0],n[1],n[2], u,v, 1,1,1);
    P(A,0,0);P(B,1,0);P(C,1,1); P(A,0,0);P(C,1,1);P(D,0,1);
    return mkvbo(a);
  }
  let POD = null, DECAL = null;

  // per-racer racing livery: tinted carbon panel, chevrons, decal ticks, big number, wordmark
  function liveryTex(num, tint) {
    const S = 256, c = cvs(S), x = c.getContext('2d');
    const col = `rgb(${tint[0]*255|0},${tint[1]*255|0},${tint[2]*255|0})`;
    x.fillStyle = '#0e1119'; x.fillRect(0, 0, S, S);
    x.fillStyle = 'rgba(255,255,255,0.04)'; for (let i = 0; i < 700; i++) x.fillRect(Math.random()*S, Math.random()*S, 2, 2);
    x.save(); x.translate(S/2, S/2); x.rotate(-0.42);
    x.fillStyle = col; x.globalAlpha = 0.92; x.fillRect(-S, -S*0.17, S*2, S*0.34);
    x.fillStyle = '#fff'; x.globalAlpha = 0.9; x.fillRect(-S, S*0.17, S*2, S*0.05); x.restore(); x.globalAlpha = 1;
    x.strokeStyle = col; x.lineWidth = 9; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(S*0.22, S*0.9-i*16); x.lineTo(S*0.5, S*0.98-i*16); x.lineTo(S*0.78, S*0.9-i*16); x.stroke(); }  // nose chevrons (v→1 = front)
    x.fillStyle = 'rgba(255,255,255,0.85)'; [[0.07,0.28],[0.87,0.30],[0.09,0.46],[0.86,0.48]].forEach(([u,v]) => x.fillRect(u*S, v*S, S*0.06, S*0.028));
    x.fillStyle = '#fff'; x.strokeStyle = col; x.lineWidth = 9; x.font = 'bold ' + (S*0.5) + 'px "Arial Black",Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeText(String(num), S/2, S*0.5); x.fillText(String(num), S/2, S*0.5);
    x.fillStyle = col; x.font = 'bold ' + (S*0.06) + 'px "Courier New",monospace'; x.fillText('UR·3030 RACING', S/2, S*0.14);
    return { t: texFrom(c) };
  }

  function init(canvas) {
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return false; cv = canvas;
    W = prog(VS, FS); SKY = prog(SKY_VS, SKY_FS); BB = prog(BB_VS, BB_FS); STK = prog(STK_VS, STK_FS);
    if (!W || !SKY || !BB || !STK) return false;
    ['aPos','aNormal','aUV','aColor'].forEach(n => loc[n] = gl.getAttribLocation(W, n));
    ['uMVP','uModel','uCam','uTex','uUseTex','uLight','uFog','uFogNear','uFogFar','uEmit','uEmitAmt','uTime'].forEach(n => loc[n] = gl.getUniformLocation(W, n));
    skl.aP = gl.getAttribLocation(SKY, 'aP'); ['uTop','uMid','uHorizon','uSunDir','uSunCol','uYaw','uPitch','uAsp','uFov'].forEach(n => skl[n] = gl.getUniformLocation(SKY, n));
    ['aCorner','aCenter','aData'].forEach(n => bbl[n] = gl.getAttribLocation(BB, n));
    ['uVP','uRight','uUp','uCam','uTex','uFog','uFogNear','uFogFar','uTintAmt','uTintA','uTintB'].forEach(n => bbl[n] = gl.getUniformLocation(BB, n));
    stl.aP = gl.getAttribLocation(STK, 'aP'); stl.aA = gl.getAttribLocation(STK, 'aA');
    tex.cloud = cloudTex(); tex.track = trackTex(); tex.pad = padTex(); tex.glow = glowTex();
    POD = podMesh(); DECAL = decalMesh();
    dyn = gl.createBuffer(); streakBuf = gl.createBuffer();
    quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    ok = true; return true;
  }

  function pilotTex(canvas) { return { t: texFrom(canvas) }; }

  function bindWorld(p) { const s = STRIDE*4;
    gl.enableVertexAttribArray(loc.aPos); gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, s, 0);
    gl.enableVertexAttribArray(loc.aNormal); gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, s, 12);
    gl.enableVertexAttribArray(loc.aUV); gl.vertexAttribPointer(loc.aUV, 2, gl.FLOAT, false, s, 24);
    gl.enableVertexAttribArray(loc.aColor); gl.vertexAttribPointer(loc.aColor, 3, gl.FLOAT, false, s, 32); }

  // model matrix from a basis (right,up,fwd) + translation + uniform scale
  function modelMat(r, u, f, t, sc) { sc = sc || 1;
    return [r[0]*sc,r[1]*sc,r[2]*sc,0, u[0]*sc,u[1]*sc,u[2]*sc,0, f[0]*sc,f[1]*sc,f[2]*sc,0, t[0],t[1],t[2],1]; }
  const IDENT = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

  function frame(st) {
    if (!ok) return;
    const w = cv.width, h = cv.height, asp = w/h;
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cam = st.cam, E = st.env, fovy = cam.fov;
    const view = lookAt(cam.pos, cam.tgt, cam.up);
    const proj = persp(fovy, asp, 0.2, 900);
    const VP = mul(proj, view);
    // camera yaw/pitch for the sky ray
    const fwd = norm(sub(cam.tgt, cam.pos));
    const yaw = Math.atan2(fwd[0], fwd[2]); const pitch = Math.asin(Math.max(-1, Math.min(1, fwd[1])));

    // ── sky ──
    gl.useProgram(SKY); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(skl.aP); gl.vertexAttribPointer(skl.aP, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(skl.uTop, E.skyTop); gl.uniform3fv(skl.uMid, E.skyMid); gl.uniform3fv(skl.uHorizon, E.skyHorizon);
    gl.uniform3fv(skl.uSunDir, E.sunDir); gl.uniform3fv(skl.uSunCol, E.sunCol);
    gl.uniform1f(skl.uYaw, yaw); gl.uniform1f(skl.uPitch, pitch); gl.uniform1f(skl.uAsp, asp); gl.uniform1f(skl.uFov, fovy);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);

    // ── clouds (billboards, back-to-front, alpha) ──
    const right = [view[0], view[4], view[8]], up = [view[1], view[5], view[9]];
    gl.useProgram(BB);
    gl.uniformMatrix4fv(bbl.uVP, false, new Float32Array(VP));
    gl.uniform3fv(bbl.uRight, right); gl.uniform3fv(bbl.uUp, up); gl.uniform3fv(bbl.uCam, cam.pos);
    gl.uniform3fv(bbl.uFog, E.fog); gl.uniform1f(bbl.uFogNear, E.fogNear); gl.uniform1f(bbl.uFogFar, E.fogFar);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(bbl.uTex, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.bindTexture(gl.TEXTURE_2D, tex.cloud); gl.uniform1f(bbl.uTintAmt, 0.35);
    gl.uniform4fv(bbl.uTintA, E.cloudA); gl.uniform4fv(bbl.uTintB, E.cloudB);
    drawBillboards(st.clouds);
    gl.depthMask(true); gl.disable(gl.BLEND);

    // ── track ──
    gl.useProgram(W);
    gl.uniformMatrix4fv(loc.uModel, false, new Float32Array(IDENT));
    gl.uniformMatrix4fv(loc.uMVP, false, new Float32Array(VP));
    gl.uniform3fv(loc.uCam, cam.pos); gl.uniform3fv(loc.uLight, E.lightDir);
    gl.uniform3fv(loc.uFog, E.fog); gl.uniform1f(loc.uFogNear, E.fogNear); gl.uniform1f(loc.uFogFar, E.fogFar);
    gl.uniform3fv(loc.uEmit, [0,0,0]); gl.uniform1f(loc.uEmitAmt, 0); gl.uniform1f(loc.uTime, st.t||0);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(loc.uTex, 0); gl.uniform1i(loc.uUseTex, 1);
    gl.bindTexture(gl.TEXTURE_2D, tex.track); gl.bindBuffer(gl.ARRAY_BUFFER, trackBuf.vbo); bindWorld(); gl.drawArrays(gl.TRIANGLES, 0, trackBuf.count);
    if (padBuf) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.uniform3fv(loc.uEmit, [0.3,1.0,0.5]); gl.uniform1f(loc.uEmitAmt, 0.7*(0.6+0.4*Math.sin((st.t||0)*6)));
      gl.bindTexture(gl.TEXTURE_2D, tex.pad); gl.bindBuffer(gl.ARRAY_BUFFER, padBuf.vbo); bindWorld(); gl.drawArrays(gl.TRIANGLES, 0, padBuf.count);
      gl.uniform1f(loc.uEmitAmt, 0); gl.disable(gl.BLEND); }

    // ── pods (hull, then the livery decal with the race number) ──
    for (const r of st.racers) {
      if (r.self && st.cockpit) continue;
      const model = new Float32Array(modelMat(r.right, r.up, r.fwd, r.pos, 1.0));
      gl.uniformMatrix4fv(loc.uModel, false, model);
      gl.uniformMatrix4fv(loc.uMVP, false, new Float32Array(VP));
      gl.uniform1i(loc.uUseTex, 0);
      gl.uniform3fv(loc.uEmit, r.tint); gl.uniform1f(loc.uEmitAmt, 0.16 + (r.boost?0.5:0));
      gl.bindBuffer(gl.ARRAY_BUFFER, POD.vbo); bindWorld(); gl.drawArrays(gl.TRIANGLES, 0, POD.count);
      if (r.livery) {                                     // race number + livery on the top deck
        gl.uniform1i(loc.uUseTex, 1); gl.uniform3fv(loc.uEmit, [0,0,0]); gl.uniform1f(loc.uEmitAmt, 0.12);
        gl.activeTexture(gl.TEXTURE0); gl.uniform1i(loc.uTex, 0); gl.bindTexture(gl.TEXTURE_2D, r.livery.t);
        gl.bindBuffer(gl.ARRAY_BUFFER, DECAL.vbo); bindWorld(); gl.drawArrays(gl.TRIANGLES, 0, DECAL.count);
      }
    }
    gl.uniform1f(loc.uEmitAmt, 0); gl.uniform1i(loc.uUseTex, 0);

    // ── engine glows + pilot billboards ──
    gl.useProgram(BB);
    gl.enable(gl.BLEND); gl.depthMask(false);
    // engine glow (additive)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.bindTexture(gl.TEXTURE_2D, tex.glow); gl.uniform1f(bbl.uTintAmt, 1.0);
    const glows = [];
    for (const r of st.racers) { const back = [r.pos[0]-r.fwd[0]*1.3, r.pos[1]-r.fwd[1]*1.3+0.15, r.pos[2]-r.fwd[2]*1.3];
      glows.push({ c: back, sx: 0.9+(r.boost?0.9:0), sy: 0.9+(r.boost?0.9:0), tint: 0.4, a: 0.9 }); }
    gl.uniform4fv(bbl.uTintA, [0.5,0.85,1,1]); gl.uniform4fv(bbl.uTintB, [1,0.7,0.4,1]);
    drawBillboards(glows);
    // pilot portraits (alpha), one draw each (own texture)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(bbl.uTintAmt, 0);
    for (const r of st.racers) { if (!r.pilotTex || r.self) continue;   // skip your own pilot (you see your pod); opponents' pilots float above
      gl.bindTexture(gl.TEXTURE_2D, r.pilotTex.t);
      const head = [r.pos[0]+r.up[0]*0.8, r.pos[1]+r.up[1]*0.8, r.pos[2]+r.up[2]*0.8];
      drawBillboards([{ c: head, sx: 0.7, sy: 0.7, tint: 0, a: 1 }]);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);

    // ── speed streaks (screen-space additive) ──
    if (st.streak > 0.02) drawStreaks(st.streak, st.t || 0);
  }

  function drawBillboards(list) {
    if (!list || !list.length) return;
    const corners = [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]];
    const arr = [];
    for (const b of list) for (const c of corners) arr.push(c[0], c[1], b.c[0], b.c[1], b.c[2], b.sx, b.sy, (b.tint||0), (b.a==null?1:b.a));
    gl.bindBuffer(gl.ARRAY_BUFFER, dyn); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
    const st = 9*4;
    gl.enableVertexAttribArray(bbl.aCorner); gl.vertexAttribPointer(bbl.aCorner, 2, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(bbl.aCenter); gl.vertexAttribPointer(bbl.aCenter, 3, gl.FLOAT, false, st, 8);
    gl.enableVertexAttribArray(bbl.aData); gl.vertexAttribPointer(bbl.aData, 4, gl.FLOAT, false, st, 20);
    gl.drawArrays(gl.TRIANGLES, 0, list.length*6);
  }

  function drawStreaks(amt, t) {
    gl.useProgram(STK); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.disable(gl.DEPTH_TEST);
    const N = 46, arr = [];
    for (let i = 0; i < N; i++) {
      const a = (i*2.399 + t*0.4) % 6.283, r0 = 0.25 + (i%5)*0.02, len = 0.5*amt*(0.6+((i*13)%7)/7);
      const ca = Math.cos(a), sa = Math.sin(a), asp = cv.width/cv.height;
      const x0 = ca*r0/asp, y0 = sa*r0, x1 = ca*(r0+len)/asp, y1 = sa*(r0+len);
      const al = amt*0.5;
      arr.push(x0,y0,0, x1,y1,al*0.8, x1,y1,al*0.8);   // degenerate-ish thin tri per streak
      arr.push(x0,y0,0, x1+0.004,y1,al*0.8, x0+0.004,y0,0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, streakBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(stl.aP); gl.vertexAttribPointer(stl.aP, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(stl.aA); gl.vertexAttribPointer(stl.aA, 1, gl.FLOAT, false, 12, 8);
    gl.drawArrays(gl.TRIANGLES, 0, arr.length/3);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  }

  return { init, buildTrack, pilotTex, liveryTex, frame, supported: () => ok };
})();

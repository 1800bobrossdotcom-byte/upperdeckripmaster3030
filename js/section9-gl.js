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
  let gl = null, cv = null, prog = null, sky = null, ok = false, post = null;
  let skinProg = null, skinLoc = {}, skinOk = false;
  const skins = {};                         // arch → { buf, count, lo, hi, h }
  let loc = {}, skyLoc = {}, tex = {}, dynBuf = null, skyBuf = null;
  const STRIDE = 11;                        // pos3 + nrm3 + uv2 + col3
  const MATS = ['floor', 'wall', 'crate', 'ammo'];
  const TILE = { floor: 2.2, wall: 2.4, crate: 1.05, ammo: 1.05 };
  /* Hand-built arenas keep uMat 0 — they were tuned against the flat-textured look and are the
   * six maps that ship, so nothing about them changes here. */
  const PLAIN = { floor: { tex: 'floor', gloss: 0.30 }, wall: { tex: 'wall', gloss: 0.10 },
                  crate: { tex: 'crate', gloss: 0.16 }, ammo: { tex: 'ammo', gloss: 0.34 } };
  /* Baked levels get the material system. A .wld is one untextured triangle soup, so every cue
   * that makes it read as a place has to be derived; the derivation used here is the collision
   * box a triangle sits inside, because those boxes ARE the authored objects (S9World.kindOf
   * already names them stair/cover/plat/pillar/crate/wall). Kind + face normal then pick the
   * batch, and the batch carries texture, procedural material, gloss, rim and base tint.
   *
   * ⚑ Which material suits which surface depends on where mp.y points, and that is not the same
   * axis everywhere: on a wall mp.y is world y, so mat 7's bands are horizontal courses; on a
   * FLOOR mp.y is world z, so the same material lays a zebra of 30 cm stripes across the whole
   * pit and moirés into the distance. Floors get the noise mottle instead.
   *
   * ⚑ The tints go ABOVE 1 on blue, and they must not go far below 1 overall. Both world
   * textures are strongly warm (#c2b078, #c8b48a), so a multiplier that only scales down makes
   * a darker yellow rather than a grey — blue has to be lifted past unity to land near concrete.
   * But dropping luminance while doing it is what turned THE VAULT black: a wall facing away
   * from the key light is lit by ambient alone, so its albedo IS its brightness. Neutralise the
   * hue, hold the luminance. Props stay warm and are the only warm thing left, which is what
   * makes a cabinet read as a cabinet across a grey room. */
  const BAKED = {
    deck:  { tex: 'floor', mat: 5, matS: 0.25, gloss: 0.20, rim: 0.10, tint: [0.82, 0.93, 1.42] },
    wall:  { tex: 'wall',  mat: 7, matS: 0.42, gloss: 0.07, rim: 0.13, tint: [0.77, 0.88, 1.21] },
    metal: { tex: 'wall',  mat: 2, matS: 0.35, gloss: 0.55, rim: 0.26, tint: [0.61, 0.74, 1.11] },
    prop:  { tex: 'crate', mat: 0, matS: 1.00, gloss: 0.26, rim: 0.10, tint: [1.06, 1.05, 1.11] },
  };
  const BAKED_KEYS = ['deck', 'wall', 'metal', 'prop'];
  function batchFor(kind, up) {
    if (kind === 'pillar' || kind === 'cover') return 'metal';
    if (kind === 'crate') return 'prop';
    return up ? 'deck' : 'wall';
  }
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
  // view matrix built directly from yaw+pitch (matches the canvas toView, negated z for GL) — STABLE at all pitches,
  // unlike lookAt which degenerates as the view direction nears the world-up vector (the "look-up flip").
  function viewMat(e, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const tx = -(cy * e[0] - sy * e[2]);
    const ty = -(-sy * sp * e[0] + cp * e[1] - cy * sp * e[2]);
    const tz = -(-sy * cp * e[0] - sp * e[1] - cy * cp * e[2]);
    return [cy, -sy * sp, -sy * cp, 0, 0, cp, -sp, 0, -sy, -cy * sp, -cy * cp, 0, tx, ty, tz, 1];
  }
  function mul(a, b) { const o = new Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
      o[i * 4 + j] = a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] + a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3];
    return o; }

  // ── shaders ──
  const VS = `attribute vec3 aPos; attribute vec3 aNormal; attribute vec2 aUV; attribute vec3 aColor;
    uniform mat4 uMVP; uniform vec3 uCam;
    varying vec3 vN; varying vec2 vUV; varying vec3 vC; varying float vDist; varying vec3 vP; varying vec3 vL;
    void main(){ gl_Position=uMVP*vec4(aPos,1.0); vN=aNormal; vUV=aUV; vC=aColor; vP=aPos; vL=aPos; vDist=distance(aPos,uCam); }`;
  /* Blinn-Phong spec (uGloss per batch) + a warm muzzle-flash point light (uFlash xyz=pos w=power)
   * + NEON RONIN's procedural material system, keyed by uMat:
   *   1 cloth weave · 2 brushed metal · 3 reptile scale · 4 iridescent crystal · 5 skin
   *   6 energy pulse · 7 wrap bands
   *
   * ronin3d textures those in object space via vL, which works because everything it shades is a
   * standing body: its patterns are keyed on vL.y and on atan(vL.z, vL.x), a cylinder wrapped
   * around a fighter. Point the same code at a level and it degenerates — a band keyed on y is a
   * constant across a floor, and a cylindrical wrap around a room is meaningless. So the
   * coordinate here is chosen per fragment from the FACE NORMAL: drop the axis the surface points
   * along and pattern the other two. One material id then means the same thing on a floor, a wall
   * and a shoulder, which is what lets the bodies and the world share a shader at all.
   *
   * uMatS is cycles-per-unit; ~1 puts features at roughly 25 cm. vL is highp on purpose — these
   * levels run to 160 units across and a mediump sin() of a coordinate that large is noise. */
  const FS = `precision mediump float;
    uniform sampler2D uTex; uniform vec3 uLightDir,uLightCol,uAmbient,uFog; uniform highp vec3 uCam;
    uniform float uFogNear,uFogFar,uGloss,uMat,uMatS,uRim,uTime; uniform highp vec4 uFlash;
    varying vec3 vN; varying vec2 vUV; varying vec3 vC; varying float vDist; varying highp vec3 vP; varying highp vec3 vL;
    float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
      float a=h21(i),b=h21(i+vec2(1.0,0.0)),c=h21(i+vec2(0.0,1.0)),d=h21(i+vec2(1.0,1.0));
      return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
    void main(){ vec4 t=texture2D(uTex,vUV); vec3 base=t.rgb*vC; vec3 N=normalize(vN);
      vec3 V=normalize(uCam-vP); float spBoost=0.0;
      if(uMat>0.5){
        vec3 an=abs(N); highp vec3 q=vL*uMatS;
        highp vec2 mp=(an.y>=an.x&&an.y>=an.z)?q.xz:((an.x>=an.z)?q.zy:q.xy);
        vec2 m=vec2(mp);
        if(uMat<1.5){ float w=0.5+0.5*sin(m.x*22.0)*sin(m.y*22.0);
          base*=(0.87+0.17*w)*(0.88+0.16*vnoise(m*3.0)); }
        else if(uMat<2.5){ base*=0.90+0.12*sin(m.y*90.0); spBoost=0.7; }
        else if(uMat<3.5){ vec2 s=m*5.0; s.x+=step(1.0,mod(floor(s.y),2.0))*0.5;
          vec2 g=fract(s)-0.5; base=mix(base*1.16,base*0.58,smoothstep(0.30,0.5,length(g))); }
        else if(uMat<4.5){ float fac=floor(vnoise(m*6.0)*6.0)/6.0;
          base=mix(base,0.5+0.5*cos(6.2831*(fac+uTime*0.25)+vec3(0.0,2.1,4.2)),0.45); }
        else if(uMat<5.5){ base*=0.90+0.18*vnoise(m*7.0); }
        else if(uMat<6.5){ base*=0.75+0.35*sin(uTime*6.0+m.y*9.0); }
        else { base*=mix(0.85,1.05,step(0.5,fract(m.y*4.0)))*(0.94+0.10*vnoise(m*2.0)); } }
      float d=max(dot(N,uLightDir),0.0);
      vec3 H=normalize(uLightDir+V);
      float sp=pow(max(dot(N,H),0.0),26.0)*uGloss;
      vec3 lit=base*(uAmbient + d*uLightCol) + uLightCol*sp*d;
      if(spBoost>0.001){ lit += uLightCol*pow(max(dot(N,H),0.0),96.0)*spBoost*uGloss*d; }
      if(uRim>0.001){ lit += base*pow(1.0-max(0.0,dot(N,V)),3.0)*uRim; }
      if(uFlash.w>0.001){ vec3 fd=uFlash.xyz-vP; float fl=max(length(fd),0.001);
        float att=uFlash.w/(1.0+fl*fl*0.30); float fn=max(dot(N,fd/fl),0.0);
        lit += vec3(1.0,0.72,0.40)*att*(0.30+0.70*fn); }
      float fog=clamp((vDist-uFogNear)/(uFogFar-uFogNear),0.0,1.0);
      gl_FragColor=vec4(mix(lit,uFog,fog), t.a); }`;   // t.a=1 for opaque world; <1 for blended decals
  /* SKINNED operative. Same fragment shader as the world — the bodies must be lit, fogged and
   * muzzle-flashed by exactly the same rules as the walls they stand against, or they read as
   * pasted on. Only the vertex stage differs: each vertex blends up to four of the eleven bone
   * matrices S9Skin builds from the FPS pose, so an elbow BENDS instead of a box hinging open.
   * uModel then places that body in the world (position, facing, and px → metres). */
  const SKIN_VS = `attribute vec3 aPos; attribute vec3 aNormal; attribute vec4 aIdx; attribute vec4 aWgt;
    uniform mat4 uMVP; uniform mat4 uModel; uniform mat4 uBones[11]; uniform vec3 uTint; uniform vec3 uCam;
    varying vec3 vN; varying vec2 vUV; varying vec3 vC; varying float vDist; varying vec3 vP; varying vec3 vL;
    void main(){
      mat4 sk = uBones[int(aIdx.x)]*aWgt.x + uBones[int(aIdx.y)]*aWgt.y
              + uBones[int(aIdx.z)]*aWgt.z + uBones[int(aIdx.w)]*aWgt.w;
      vec4 sp = sk*vec4(aPos,1.0); vec4 wp = uModel*sp;
      vN = mat3(uModel)*(mat3(sk)*aNormal); vP = wp.xyz; vUV = vec2(0.5); vC = uTint;
      vL = aPos;                                  // BIND space: the pattern rides the body, not the room
      vDist = distance(wp.xyz, uCam); gl_Position = uMVP*wp; }`;
  // per-pixel ray sky: dusk gradient + warm sun halo/disc + drifting cloud banding
  const SKY_VS = `attribute vec2 aP; varying vec2 vNDC; void main(){ vNDC=aP; gl_Position=vec4(aP,1.0,1.0); }`;
  const SKY_FS = `precision mediump float; varying vec2 vNDC;
    uniform vec3 uTop,uMid,uHorizon,uSunDir; uniform float uYaw,uPitch,uAspect,uFov,uT;
    void main(){
      float py = uPitch + vNDC.y*uFov*0.5;
      float yw = uYaw   + vNDC.x*uFov*0.5*uAspect;
      vec3 ray = vec3(sin(yw)*cos(py), sin(py), cos(yw)*cos(py));
      float h = clamp(ray.y*1.55+0.32, 0.0, 1.0);
      vec3 c = h>0.5 ? mix(uMid,uTop,(h-0.5)*2.0) : mix(uHorizon,uMid,h*2.0);
      float sd = max(dot(ray,uSunDir),0.0);
      c += vec3(1.0,0.60,0.30)*pow(sd,9.0)*0.55;              /* warm halo   */
      c += vec3(1.0,0.92,0.74)*smoothstep(0.99930,0.99985,sd);/* sun disc    */
      float band = sin(ray.y*20.0 + uT*0.06 + sin(yw*2.0)*0.8);
      c += vec3(0.055,0.022,0.030)*band*smoothstep(0.02,0.40,ray.y)*(1.0-smoothstep(0.40,0.85,ray.y));
      c -= vec3(0.035)*smoothstep(0.72,1.0,h);                /* deepen zenith */
      gl_FragColor=vec4(c,1.0); }`;

  function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('GLR shader', gl.getShaderInfoLog(s)); return null; } return s; }
  /* `attrs` pins attribute locations. Three programs now share one attribute set-up path, and a
   * driver is free to hand each of them different slots; pinning every program to 0..3 means a
   * pass can never leave an array enabled at a slot the next pass does not re-point, which some
   * drivers answer with INVALID_OPERATION and a dropped draw. */
  function link(vs, fs, attrs) { const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    if (attrs) attrs.forEach((n, i) => gl.bindAttribLocation(p, i, n));
    gl.linkProgram(p);
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
    x.strokeStyle = 'rgba(255,240,205,0.32)'; x.lineWidth = 1; for (let r = 1; r < rows; r++) { x.beginPath(); x.moveTo(0, r * rh + 2); x.lineTo(S, r * rh + 2); x.stroke(); }
    grimeWall(x, S); }
  /* ── GRIME ────────────────────────────────────────────────────────────────────────────────
   * The tile was clean masonry: a perfect brick grid with even speckle, which at any distance
   * reads as wallpaper. Real surfaces are dirty in a DIRECTIONAL way — walls streak downward
   * from wherever water ran, floors wear in patches where people walk — and it is that direction
   * that stops the eye reading a repeat. Kept inside the existing 256px tile so nothing about
   * memory, mip chains or draw calls changes. */
  function grimeWall(x, S) {
    x.save();
    for (let i = 0; i < 26; i++) {                                  // weep streaks running down
      const sx = Math.random() * S, w = 2 + Math.random() * 9, top = Math.random() * S * 0.5, len = S * (0.25 + Math.random() * 0.7);
      const g = x.createLinearGradient(0, top, 0, top + len);
      g.addColorStop(0, 'rgba(48,38,26,0.24)'); g.addColorStop(0.35, 'rgba(48,38,26,0.13)'); g.addColorStop(1, 'rgba(48,38,26,0)');
      x.fillStyle = g; x.fillRect(sx, top, w, len);
    }
    for (let i = 0; i < 9; i++) {                                   // damp blotches
      const cx = Math.random() * S, cy = Math.random() * S, r = 12 + Math.random() * 46;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(36,30,22,0.16)'); g.addColorStop(1, 'rgba(36,30,22,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    for (let i = 0; i < 5; i++) {                                   // chips: exposed pale aggregate
      const cx = Math.random() * S, cy = Math.random() * S, r = 2 + Math.random() * 5;
      x.fillStyle = 'rgba(236,226,198,0.30)'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
      x.fillStyle = 'rgba(30,24,16,0.28)'; x.beginPath(); x.arc(cx + r * 0.4, cy + r * 0.5, r * 0.8, 0, 7); x.fill();
    }
    x.restore();
  }
  function grimeFloor(x, S) {
    x.save();
    for (let i = 0; i < 7; i++) {                                   // worn / wet patches
      const cx = Math.random() * S, cy = Math.random() * S, r = 20 + Math.random() * 60;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(30,26,20,0.20)'); g.addColorStop(0.7, 'rgba(30,26,20,0.07)'); g.addColorStop(1, 'rgba(30,26,20,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    x.strokeStyle = 'rgba(28,22,16,0.16)'; x.lineWidth = 1.6;       // drag marks / scuffs
    for (let i = 0; i < 16; i++) { const sx = Math.random() * S, sy = Math.random() * S, a = Math.random() * 7, l = 12 + Math.random() * 60;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke(); }
    for (let i = 0; i < 400; i++) { x.fillStyle = 'rgba(20,16,12,' + (0.04 + Math.random() * 0.07).toFixed(2) + ')';
      x.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    x.restore();
  }
  function drawFloor(x, S) { x.fillStyle = '#c2b078'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 3200; i++) { const v = Math.random(); x.fillStyle = 'rgba(' + (v < 0.5 ? '92,78,52' : '212,198,152') + ',' + (0.05 + Math.random() * 0.06).toFixed(2) + ')'; x.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6); }
    const n = 4, cs = S / n; x.strokeStyle = 'rgba(68,56,38,0.8)'; x.lineWidth = 2.6;
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * cs, 0); x.lineTo(i * cs, S); x.moveTo(0, i * cs); x.lineTo(S, i * cs); x.stroke(); }
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0' : '255,245,215') + ',' + (0.03 + Math.random() * 0.05).toFixed(2) + ')'; x.fillRect(a * cs + 3, b * cs + 3, cs - 6, cs - 6); }
    grimeFloor(x, S); }
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
  /* ── GRAFFITI ─────────────────────────────────────────────────────────────────────────────
   * Wholly generated marks: a seeded stroke path built from a chain of random control points,
   * laid down as a fat outline, a colour fill and a highlight, then dripped and oversprayed —
   * the mechanics of a spray tag rather than a copy of one. Nothing here is traced, sampled or
   * derived from anyone's work, which is the only kind of graffiti this repo can ship.
   *
   * `seed` picks both the path and the palette, so the same wall carries the same tag on every
   * load instead of re-rolling each time the map builds. */
  const TAGPAL = [
    ['#ff2ad9', '#2bff80', '#0a0510'], ['#59e0ff', '#ffd23b', '#06101a'],
    ['#ff6b57', '#ffe6a8', '#180806'], ['#b47bff', '#8ffff0', '#0d0618'],
    ['#2bff80', '#ffffff', '#04120a'], ['#ffd23b', '#ff2ad9', '#160c02'],
  ];
  function tagRand(seed) { let s = (seed | 0) * 1103515245 + 12345;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
  function drawTag(x, S, seed) {
    const R = tagRand(seed + 7), P = TAGPAL[Math.floor(R() * TAGPAL.length) % TAGPAL.length];
    x.clearRect(0, 0, S, S);
    // one continuous whip of a path across the middle of the panel
    const segs = 5 + Math.floor(R() * 4), pts = [];
    for (let i = 0; i <= segs; i++) {
      pts.push([S * (0.10 + 0.80 * (i / segs)) + (R() - 0.5) * S * 0.05,
                S * (0.30 + 0.40 * R())]);
    }
    const path = () => { x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        x.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      x.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); };
    x.lineJoin = x.lineCap = 'round';
    // overspray halo first — the soft mist a can leaves around the stroke
    x.save(); x.globalAlpha = 0.22; x.shadowColor = P[0]; x.shadowBlur = S * 0.10;
    x.strokeStyle = P[0]; x.lineWidth = S * 0.20; path(); x.stroke(); x.restore();
    x.strokeStyle = P[2]; x.lineWidth = S * 0.185; path(); x.stroke();          // outline
    x.strokeStyle = P[0]; x.lineWidth = S * 0.125; path(); x.stroke();          // fill
    x.strokeStyle = P[1]; x.lineWidth = S * 0.034;                              // highlight, offset up-left
    x.save(); x.translate(-S * 0.012, -S * 0.016); x.globalAlpha = 0.85; path(); x.stroke(); x.restore();
    // drips
    x.strokeStyle = P[0]; x.globalAlpha = 0.75;
    for (let i = 0; i < 4 + Math.floor(R() * 4); i++) {
      const p = pts[1 + Math.floor(R() * (pts.length - 2))], len = S * (0.05 + R() * 0.18);
      x.lineWidth = S * (0.008 + R() * 0.012);
      x.beginPath(); x.moveTo(p[0], p[1] + S * 0.04); x.lineTo(p[0], p[1] + S * 0.04 + len); x.stroke();
      x.beginPath(); x.arc(p[0], p[1] + S * 0.04 + len, x.lineWidth * 0.9, 0, 7); x.fillStyle = P[0]; x.fill();
    }
    // a couple of hard slashes / stars for punctuation
    x.globalAlpha = 0.9; x.strokeStyle = P[1]; x.lineWidth = S * 0.02;
    for (let i = 0; i < 2 + Math.floor(R() * 3); i++) {
      const cx = S * (0.1 + 0.8 * R()), cy = S * (0.2 + 0.6 * R()), r = S * (0.03 + R() * 0.05), a = R() * 7;
      x.beginPath(); x.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.stroke();
    }
    x.globalAlpha = 1;
  }
  // alpha texture, clamped (a tag is one decal, not a repeat)
  function makeTexA(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }
  function drawHole(x, S) { x.clearRect(0, 0, S, S); const c = S / 2;
    const g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(10,8,6,0.96)'); g.addColorStop(0.4, 'rgba(22,18,13,0.82)'); g.addColorStop(0.7, 'rgba(44,37,28,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(c, c, c, 0, 7); x.fill();
    x.strokeStyle = 'rgba(14,11,8,0.7)'; x.lineWidth = 1.6; for (let i = 0; i < 8; i++) { const a = Math.random() * 7, rr = c * (0.5 + Math.random() * 0.42); x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); x.stroke(); }
    x.strokeStyle = 'rgba(205,185,150,0.28)'; x.lineWidth = 2; x.beginPath(); x.arc(c, c, c * 0.3, 0, 7); x.stroke(); }
  function drawScorch(x, S) { x.clearRect(0, 0, S, S); const c = S / 2; const g = x.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,205,95,0.95)'); g.addColorStop(0.5, 'rgba(255,95,40,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(c, c, c, 0, 7); x.fill(); }
  function drawShadow(x, S) { x.clearRect(0, 0, S, S); const c = S / 2; const g = x.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(0,0,0,0.52)'); g.addColorStop(0.6, 'rgba(0,0,0,0.30)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(c, c, c, 0, 7); x.fill(); }
  // soft blob shadows under the operatives — grounds them in the scene for almost nothing
  function buildShadows(G) {
    const a = [];
    for (const e of G.ents) { if (!e.alive || e.isMe) continue;
      const lift = Math.max(0, e.y), r = 0.62 * Math.max(0.45, 1 - lift * 0.35), f = Math.max(0.25, 1 - lift * 0.4);
      decalQuad(a, { x: e.x, y: 0.015, z: e.z, n: [0, 1, 0], r, life: f, max: 1 });
    }
    return a;
  }
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

  // ── DarkFarms cards as arena wall-art. CC0 — credit: darkfarms.wtf. The images
  //    are DISPLAYED live from DarkFarms' own permanent Arweave storage (not copied
  //    into this repo); a themed card-back is drawn as the fallback so a wall is
  //    never blank if a fetch/CORS load fails. Attribution shown in-game + CREDITS.md. ──
  const DARKFARMS = [
    '-lIrnWW_8qHmHPuxtjB1K10OKJSo2OsmZApluUAy6HI', '1rAArvT-RVdUYm0tm3nPpSRjGBCBnu1WL3RPb3cHJFk',
    '70lM_ct0FJx7EoZjFfF49E0hpl_AXf939vrGTuDv3As', '7p1zzHKsmZbLuM8tzlC3GDOe-L543rsDkJcBfNDdjyA',
    '9jYORfFqwwrtecM9xrEKD3LlVRuWcxLIX1nDdh9vB48', '9uD0330Wcr0MhG3nG5NeVg7YkyKgL_kLkiAMHkrKagM',
    '9w3jBtRZqAik8t-yGxfEZOO2FR4xfUp3_q42GfDSBH4', 'A_D7G-HZYo5rdvckeA0rGTt5Zyy0K8LcJEkEGn2xRuw',
  ];
  function drawCardBack(x, S) { x.fillStyle = '#0a2417'; x.fillRect(0, 0, S, S);
    x.strokeStyle = 'rgba(43,255,128,0.35)'; x.lineWidth = S * 0.03; x.strokeRect(S * 0.06, S * 0.06, S * 0.88, S * 0.88);
    x.fillStyle = 'rgba(43,255,128,0.5)'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold ' + (S * 0.18) + 'px Arial'; x.fillText('◈', S / 2, S * 0.42);
    x.font = 'bold ' + (S * 0.075) + 'px monospace'; x.fillText('DARKFARMS', S / 2, S * 0.62); }
  function makeImgTex(url) {
    const t = makeTex(128, drawCardBack);   // themed fallback until (or unless) the real image loads
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { try {
      gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } catch (e) {} };
    img.onerror = () => {}; img.src = url;
    return t;
  }
  // a poster quad (STRIDE format) centered at C, spanning right-vec R × up, normal N
  function posterQuad(a, C, R, N, hw, hh, col) {
    const P = (sr, su) => [C[0] + R[0] * hw * sr, C[1] + hh * su, C[2] + R[2] * hw * sr];
    const bl = P(-1, -1), br = P(1, -1), tr = P(1, 1), tl = P(-1, 1);
    const push = (p, u, v) => a.push(p[0], p[1], p[2], N[0], N[1], N[2], u, v, col[0], col[1], col[2]);
    push(bl, 0, 0); push(br, 1, 0); push(tr, 1, 1); push(bl, 0, 0); push(tr, 1, 1); push(tl, 0, 1);
  }
  /* ── tag placement ────────────────────────────────────────────────────────────────────────
   * Both map kinds carry the same thing — MAP.solids, a list of axis-aligned boxes — so one
   * implementation tags a hand-built arena and a baked level alike. Candidates are box faces
   * tall enough and wide enough to hold a tag; the pick is seeded from the map NAME, so a given
   * arena wears the same tags in the same places every load rather than reshuffling on rebuild. */
  let tags = null;
  function clearTags() { if (!tags) return; for (const t of tags.q) gl.deleteBuffer(t.vbo); tags = null; }
  function buildTags(MAP) {
    clearTags();
    if (!tex.tags || !tex.tags.length || !MAP.solids || !MAP.solids.length) return;
    let seed = 0; for (const ch of String(MAP.name || '')) seed = (seed * 31 + ch.charCodeAt(0)) & 0xffff;
    const R = tagRand(seed + 3);
    const faces = [];
    for (const b of MAP.solids) {
      const hgt = b.y1 - b.y0; if (hgt < 2.2) continue;             // needs a wall, not a crate
      const wx = b.x1 - b.x0, wz = b.z1 - b.z0;
      const cy = b.y0 + Math.min(1.85, hgt * 0.42);
      if (wx >= 2.6) { faces.push({ c: [(b.x0 + b.x1) / 2, cy, b.z0], n: [0, 0, -1], r: [1, 0, 0], w: wx });
                       faces.push({ c: [(b.x0 + b.x1) / 2, cy, b.z1], n: [0, 0, 1], r: [1, 0, 0], w: wx }); }
      if (wz >= 2.6) { faces.push({ c: [b.x0, cy, (b.z0 + b.z1) / 2], n: [-1, 0, 0], r: [0, 0, 1], w: wz });
                       faces.push({ c: [b.x1, cy, (b.z0 + b.z1) / 2], n: [1, 0, 0], r: [0, 0, 1], w: wz }); }
    }
    if (!faces.length) return;
    const want = Math.max(4, Math.min(16, Math.round(faces.length * 0.10)));
    const q = [], used = {};
    for (let i = 0; i < want * 4 && q.length < want; i++) {
      const k = Math.floor(R() * faces.length); if (used[k]) continue; used[k] = 1;
      /* Size matters more than count. The first pass drew 1 m tags and at any playable distance
       * they were coloured flecks; a real tag is a couple of metres of wall and reads across a
       * room, which is the entire point of putting them there. */
      const f = faces[k], hw = Math.min(2.6, Math.max(1.1, f.w * 0.42)), hh = hw * 0.52;
      const off = 0.045, C = [f.c[0] + f.n[0] * off, f.c[1], f.c[2] + f.n[2] * off];
      // slide the tag along the face so they are not all dead-centre
      const slide = (R() - 0.5) * Math.max(0, f.w - hw * 2.4);
      C[0] += f.r[0] * slide; C[2] += f.r[2] * slide;
      const a = []; posterQuad(a, C, f.r, f.n, hw, hh, [1, 1, 1]);
      const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW);
      q.push({ vbo, count: a.length / STRIDE, tex: tex.tags[Math.floor(R() * tex.tags.length) % tex.tags.length] });
    }
    if (q.length) tags = { q };
  }

  let posters = null;
  function clearPosters() {
    if (!posters) return;
    if (posters.frameVBO) gl.deleteBuffer(posters.frameVBO);
    for (const c of posters.cards) gl.deleteBuffer(c.vbo);
    posters = null;
  }
  function buildPosters(MAP) {
    clearPosters();
    const hw = 0.72, hh = 1.0, off = 0.07;   // ~5:7 card, off the wall face
    const walls = [
      { ax: 'x', fixed: MAP.z0, n: [0, 0, 1],  R: [1, 0, 0] },
      { ax: 'x', fixed: MAP.z1, n: [0, 0, -1], R: [1, 0, 0] },
      { ax: 'z', fixed: MAP.x0, n: [1, 0, 0],  R: [0, 0, 1] },
      { ax: 'z', fixed: MAP.x1, n: [-1, 0, 0], R: [0, 0, 1] },
    ];
    const frameA = [], cards = []; let idx = 0;
    for (const w of walls) {
      const lo = w.ax === 'x' ? MAP.x0 : MAP.z0, hi = w.ax === 'x' ? MAP.x1 : MAP.z1;
      for (const f of [0.34, 0.66]) {
        const t = lo + (hi - lo) * f;
        const C = w.ax === 'x' ? [t, 1.95, w.fixed + w.n[2] * off] : [w.fixed + w.n[0] * off, 1.95, t];
        const ptex = tex.posters[idx % tex.posters.length]; idx++;
        const ca = []; posterQuad(ca, C, w.R, w.n, hw, hh, [1, 1, 1]);
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ca), gl.STATIC_DRAW);
        cards.push({ tex: ptex, vbo: b, count: ca.length / STRIDE });
        const Cf = w.ax === 'x' ? [t, 1.95, w.fixed + w.n[2] * (off - 0.02)] : [w.fixed + w.n[0] * (off - 0.02), 1.95, t];
        posterQuad(frameA, Cf, w.R, w.n, hw + 0.1, hh + 0.12, [0.03, 0.05, 0.04]);
      }
    }
    const fb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(frameA), gl.STATIC_DRAW);
    posters = { frameVBO: fb, frameCount: frameA.length / STRIDE, cards };
  }

  // ── geometry emit ──
  function quad(a, p0, p1, p2, p3, n, su, sv, col) {
    const v = (p, u, w) => { a.push(p[0], p[1], p[2], n[0], n[1], n[2], u, w, col[0], col[1], col[2]); };
    v(p0, 0, 0); v(p1, su, 0); v(p2, su, sv); v(p0, 0, 0); v(p2, su, sv); v(p3, 0, sv);
  }
  // side quad with baked AO: corners 0,1 are the BOTTOM edge (darkened), 2,3 the top
  function quadAO(a, p0, p1, p2, p3, n, su, sv, colB, colT) {
    const v = (p, u, w, c) => { a.push(p[0], p[1], p[2], n[0], n[1], n[2], u, w, c[0], c[1], c[2]); };
    v(p0, 0, 0, colB); v(p1, su, 0, colB); v(p2, su, sv, colT); v(p0, 0, 0, colB); v(p2, su, sv, colT); v(p3, 0, sv, colT);
  }
  // a box → 5 faces (skip bottom), UVs scaled by world size / tile so textures tile at real
  // scale. Grounded boxes get a baked contact-AO gradient up their sides — the cheap depth
  // cue that makes crates sit ON the floor instead of floating over it.
  function box(a, x0, y0, z0, x1, y1, z1, tile, col) {
    const wx = (x1 - x0) / tile, wy = (y1 - y0) / tile, wz = (z1 - z0) / tile;
    const ao = y0 < 0.06 ? 0.60 : 0.82;
    const colB = [col[0] * ao, col[1] * ao, col[2] * ao];
    quad(a, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], wx, wz, col);                 // top
    quadAO(a, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], wx, wy, colB, col);         // +z
    quadAO(a, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], wx, wy, colB, col);        // -z
    quadAO(a, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], wz, wy, colB, col);         // +x
    quadAO(a, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], wz, wy, colB, col);        // -x
  }
  function matForKind(k) { if (k === 'ammo') return 'ammo'; if (k === 'crate' || k === 'shelf' || k === 'cover') return 'crate'; return 'wall'; }

  function makeVBO(arr) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); return { vbo: b, count: arr.length / STRIDE }; }

  /* Draw distance. The six hand-built arenas are ~50 units across and were tuned at 16/54/60; a
   * baked level runs to 165, and those same numbers wall it off in fog two thirds of the way
   * across. Only a baked level widens them — the built-ins render exactly as they always did. */
  let fogNear = 16, fogFar = 54, viewFar = 60, fogCol = null, lightOv = null, ambOv = null, skyOv = null;
  let batches = [];                         // per-map draw list: {vbo,count,tex,mat,matS,gloss,rim}

  /* A baked .wld is an interleaved pos3+norm3 triangle soup and nothing else — no UVs, no
   * materials, no vertex colour. All three are derived: the UV is a planar projection along the
   * dominant axis (only correct for flat-ish faces, which is exactly what these levels are made
   * of), and the material and tint come from the collision box the triangle sits inside. */
  function meshArrays(mesh, solids) {
    const v = mesh.verts, A = { deck: [], wall: [], metal: [], prop: [] };
    const boxes = solids || [];
    for (let i = 0; i + 17 < v.length; i += 18) {          // 3 verts × 6 floats = one triangle
      let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) { const o = i + k * 6;
        nx += v[o + 3]; ny += v[o + 4]; nz += v[o + 5]; cx += v[o]; cy += v[o + 1]; cz += v[o + 2]; }
      const L = Math.hypot(nx, ny, nz) || 1; ny /= L; nx /= L; nz /= L;
      cx /= 3; cy /= 3; cz /= 3;
      const up = ny > 0.6, down = ny < -0.55;
      /* Which authored object is this triangle part of? The centroid lands inside its own
       * collision box; the epsilon covers the box being the mesh's own bounds rather than a
       * loose hull. A triangle in no box (decorative geometry with no collider) falls back to
       * the normal, which is what the whole level did before. */
      let box = null;
      for (let b = 0; b < boxes.length; b++) { const s = boxes[b];
        if (cx >= s.x0 - 0.06 && cx <= s.x1 + 0.06 && cy >= s.y0 - 0.06 && cy <= s.y1 + 0.06 &&
            cz >= s.z0 - 0.06 && cz <= s.z1 + 0.06) { box = s; break; } }
      const key = batchFor(box ? box.kind : '', up);
      const B = BAKED[key], a = A[key], t = TILE[B.tex];
      const side = !up && Math.abs(nx) > Math.abs(nz);     // face looks along ±x → span z, else span x
      // per-triangle jitter so a 30-unit wall is not one flat sheet of colour
      const jit = 0.93 + 0.14 * (Math.abs(Math.sin(cx * 12.9898 + cy * 78.233 + cz * 37.719) * 43758.5453) % 1);
      const shade = jit * (down ? 0.62 : up ? 1.05 : 1);
      const bh = box ? Math.max(0.5, box.y1 - box.y0) : 0;
      for (let k = 0; k < 3; k++) {
        const o = i + k * 6, x = v[o], y = v[o + 1], z = v[o + 2];
        // baked contact AO up the side of the object it belongs to — the cheap depth cue that
        // stops every box in the level looking like it is floating a centimetre off the floor
        const ao = (up || down || !box) ? 1 : 0.60 + 0.40 * Math.min(1, Math.max(0, (y - box.y0) / bh));
        const c0 = B.tint[0] * shade * ao, c1 = B.tint[1] * shade * ao, c2 = B.tint[2] * shade * ao;
        a.push(x, y, z, v[o + 3], v[o + 4], v[o + 5],
          (up || down ? x : (side ? z : x)) / t, (up || down ? z : y) / t, c0, c1, c2);
      }
    }
    return A;
  }

  function buildMap(MAP) {
    if (!ok) return;
    for (const b of batches) gl.deleteBuffer(b.vbo);
    batches = []; clearTags();
    // ── baked level: draw the authored triangles. The .cols.json boxes are still the collision
    //    truth in the game, they are just not what you look at. No floor plane (the mesh has
    //    floors of its own, at whatever height they were authored) and no wall posters (they hang
    //    on a hand-built arena's four perimeter walls, which a baked level does not have). ──
    if (MAP.mesh && MAP.mesh.verts && MAP.mesh.verts.length) {
      const M = meshArrays(MAP.mesh, MAP.solids);
      for (const k of BAKED_KEYS) if (M[k] && M[k].length)
        batches.push(Object.assign({}, BAKED[k], makeVBO(M[k])));
      clearPosters();
      const span = Math.max(MAP.x1 - MAP.x0, MAP.z1 - MAP.z0);
      fogFar = Math.max(54, Math.min(190, span * 0.95)); fogNear = fogFar * 0.34; viewFar = fogFar * 1.15;
      buildTags(MAP);
      /* Cool the distance haze. ENV.fog is a warm dusk chosen for the six open arenas; these
       * levels are interiors lit from a skylight, and warm fog inside a concrete pit reads as
       * dust rather than depth. Only baked levels get this — the built-ins keep ENV.fog. */
      /* And the key light with it — for INTERIORS only. ENV's key is a warm dusk sun
       * (1.15, 0.98, 0.68), which is why even a neutral-tinted floor came back tan: the tint
       * sets the albedo, the light sets the cast. An arcade pit lit through a skylight is cool.
       * The sky goes with it, because a baked level has no infinite floor plane and you can see
       * past its edge — against cool concrete a wedge of dusk orange down at floor level reads
       * as a rendering fault rather than as a window. ROOFTOP is outdoors and keeps ENV. */
      /* ⚑ Ambient has to go UP indoors, not down. ENV's 0.33 suits an open arena where the sky
       * is the fill; inside a concrete box the fill is bounce off six close surfaces, and every
       * wall facing away from the key (d = 0) is lit by ambient alone. Cooling the key without
       * raising the bounce turned THE VAULT's walls into unreadable near-black slate — moody,
       * and useless for a shooter where you have to see the cover. */
      if (!MAP.open) { fogCol = [0.40, 0.39, 0.45]; lightOv = [0.90, 0.95, 1.06];
        ambOv = [0.44, 0.46, 0.54];
        skyOv = { top: [0.05, 0.05, 0.08], mid: [0.10, 0.10, 0.14], hor: [0.17, 0.17, 0.21] }; }
      return;
    }
    const A = { floor: [], wall: [], crate: [], ammo: [] };
    const WHITE = [1, 1, 1];
    // floor plane (one big textured quad)
    quad(A.floor, [MAP.x0, 0, MAP.z0], [MAP.x1, 0, MAP.z0], [MAP.x1, 0, MAP.z1], [MAP.x0, 0, MAP.z1], [0, 1, 0], (MAP.x1 - MAP.x0) / TILE.floor, (MAP.z1 - MAP.z0) / TILE.floor, WHITE);
    for (const b of MAP.solids) { const m = matForKind(b.kind); box(A[m], b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, TILE[m], WHITE); }
    for (const k of MATS) if (A[k].length) batches.push(Object.assign({ mat: 0, matS: 1, rim: 0 }, PLAIN[k], makeVBO(A[k])));
    fogNear = 16; fogFar = 54; viewFar = 60; fogCol = null; lightOv = null; ambOv = null; skyOv = null;
    buildPosters(MAP); buildTags(MAP);
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

  /* ── skinned operatives ──────────────────────────────────────────────────────────────────
   * Register a parsed .skn (see js/section9-skin.js). The bind-space y bounds are kept because
   * the joint palette has to scale an arbitrary mesh onto the 150-unit bind skeleton. */
  function registerSkin(arch, verts, count) {
    if (!ok || !skinOk || !arch || !verts || !count) return false;
    try {
      let lo = 1e9, hi = -1e9;
      for (let i = 1; i < verts.length; i += 14) { const y = verts[i]; if (y < lo) lo = y; if (y > hi) hi = y; }
      if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return false;
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      if (skins[arch] && skins[arch].buf) gl.deleteBuffer(skins[arch].buf);
      skins[arch] = { buf: b, count, lo, hi, h: hi - lo };
      return true;
    } catch (e) { return false; }
  }
  function hasSkin(a) { return !!skins[a]; }
  /* Does this entity get a mesh this frame? Needs the module, a linked program, a loaded body
   * for its archetype — and a pose. Any one missing and it falls back to the box rig, which is
   * the whole fail-open story: an operative is always drawn, the only question is how well. */
  function skinOf(e) {
    if (!skinOk || !window.S9Skin || !e || !e.skin) return null;
    return skins[e.skin] || null;
  }
  function poseAll(G) {
    for (const e of G.ents) {
      if (!e.alive || e.isMe || !skinOf(e)) { e.__K = null; continue; }
      try { e.__K = S9Skin.pose(e); } catch (err) { e.__K = null; }
    }
  }
  // entity placement: local (+x right, +y up, +z facing, px) → world, scaled px → metres
  function entModel(e) {
    const k = (e.h || 1.72) / 150, c = Math.cos(e.yaw), s = Math.sin(e.yaw);
    return new Float32Array([c * k, 0, -s * k, 0, 0, k, 0, 0, s * k, 0, c * k, 0, e.x, e.y, e.z, 1]);
  }
  const palBuf = new Float32Array(11 * 16);
  function drawSkinned(G, mvp, eye, ENV, flash) {
    let drew = 0;
    for (const e of G.ents) {
      const sk = e.__K && skinOf(e); if (!sk) continue;
      if (!drew) {
        gl.useProgram(skinProg);
        gl.uniformMatrix4fv(skinLoc.uMVP, false, new Float32Array(mvp));
        gl.uniform3fv(skinLoc.uCam, eye);
        gl.uniform1i(skinLoc.uTex, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.white);
        gl.uniform3fv(skinLoc.uLightDir, ENV.lightDir); gl.uniform3fv(skinLoc.uLightCol, lightOv || ENV.lightCol);
        gl.uniform3fv(skinLoc.uAmbient, ambOv || ENV.ambient); gl.uniform3fv(skinLoc.uFog, fogCol || ENV.fog);
        gl.uniform1f(skinLoc.uFogNear, fogNear); gl.uniform1f(skinLoc.uFogFar, fogFar);
        gl.uniform1f(skinLoc.uGloss, 0.22); gl.uniform1f(skinLoc.uMatS, 1.6);
        gl.uniform1f(skinLoc.uRim, 0.30); gl.uniform1f(skinLoc.uTime, G.t || 0);
        gl.uniform4f(skinLoc.uFlash, flash[0], flash[1], flash[2], flash[3]);
      }
      // one kit per archetype (cloth fatigues / strapped webbing / brushed hardsuit) — the tint
      // still says who they are, the material says what they are wearing
      gl.uniform1f(skinLoc.uMat, S9Skin.matFor(e.skin));
      drew++;
      const flick = (e.spawnT > 0 || e.iframe > 0) ? (Math.sin((G.t || 0) * 30) > 0 ? 0.45 : 1) : 1;
      gl.uniform3f(skinLoc.uTint, e.tint[0] / 255 * flick, e.tint[1] / 255 * flick, e.tint[2] / 255 * flick);
      gl.uniformMatrix4fv(skinLoc.uModel, false, entModel(e));
      gl.uniformMatrix4fv(skinLoc.uBones, false, S9Skin.palette(e.__K, sk, palBuf));
      gl.bindBuffer(gl.ARRAY_BUFFER, sk.buf);
      const st = 56;
      gl.enableVertexAttribArray(skinLoc.aPos); gl.vertexAttribPointer(skinLoc.aPos, 3, gl.FLOAT, false, st, 0);
      gl.enableVertexAttribArray(skinLoc.aNormal); gl.vertexAttribPointer(skinLoc.aNormal, 3, gl.FLOAT, false, st, 12);
      gl.enableVertexAttribArray(skinLoc.aIdx); gl.vertexAttribPointer(skinLoc.aIdx, 4, gl.FLOAT, false, st, 24);
      gl.enableVertexAttribArray(skinLoc.aWgt); gl.vertexAttribPointer(skinLoc.aWgt, 4, gl.FLOAT, false, st, 40);
      gl.drawArrays(gl.TRIANGLES, 0, sk.count);
    }
    return drew;
  }
  /* The rifle a skinned operative carries, in world space, built from the SAME pose that drove
   * the mesh — so the weapon tracks the hands instead of floating near them. It goes into the
   * ordinary entity batch, because it is ordinary box geometry. ronin3d's dressLoaded() would
   * have hung a katana, a straw hat and a turtle shell off these joints; that wardrobe belongs
   * to the duel, and none of it belongs in a gunfight. The gun does: an unarmed operative in a
   * firefight reads as a bug, which is exactly why NEON RONIN always draws the sword. */
  function skinnedGear(a, e, m) {
    const P = e.__K, k = (e.h || 1.72) / 150;
    const yaw = e.yaw, fwd = [Math.sin(yaw), 0, Math.cos(yaw)], rgt = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const W = p => [e.x + rgt[0] * p[0] * k + fwd[0] * p[2] * k, e.y + p[1] * k, e.z + rgt[2] * p[0] * k + fwd[2] * p[2] * k];
    const gun = m([0.13, 0.14, 0.16]), wood = m([0.30, 0.21, 0.13]);
    const grip = W(P.grip), muz = W(P.muzzle), hand = W(P.hdR);
    const back = [hand[0] - fwd[0] * 0.30, hand[1] - 0.02, hand[2] - fwd[2] * 0.30];
    limbBox(a, grip, muz, 0.030, 0.034, gun);                                  // receiver + barrel
    limbBox(a, back, grip, 0.045, 0.052, wood);                                // stock into the shoulder
    limbBox(a, [grip[0], grip[1] - 0.13, grip[2]], grip, 0.030, 0.026, gun);   // magazine
    if (e.muzzle > 0) limbBox(a, muz, [muz[0] + fwd[0] * 0.22, muz[1], muz[2] + fwd[2] * 0.22], 0.09, 0.09, [1, 0.9, 0.47]);
  }

  // ── operatives: the full articulated rig ported to GL (walk/run/jump), lit by the scene ──
  function buildEntities(G) {
    const a = [], T = G.t || 0;
    for (const e of G.ents) { if (!e.alive || e.isMe) continue;
      const flick = (e.spawnT > 0 || e.iframe > 0) ? (Math.sin(T * 30) > 0 ? 0.45 : 1) : 1, m = c => [c[0] * flick, c[1] * flick, c[2] * flick];
      if (e.__K) { skinnedGear(a, e, m); continue; }   // mesh body drawn in its own pass; only the gear is boxes
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
    // reload animation: whole gun dips + rolls out of the eyeline while the mag drops free
    const rp = (typeof G.__reloadP === 'number' && G.__reloadP >= 0) ? Math.min(1, G.__reloadP) : -1;
    const bell = rp >= 0 ? Math.sin(rp * Math.PI) : 0;
    const magDrop = rp >= 0 ? -0.24 * Math.sin(Math.min(1, rp * 1.45) * Math.PI) : 0;
    // ADS: as the FOV zooms (scopeZoom 1→1.3 on hip guns), pull the gun to the sightline
    const adsAmt = Math.max(0, Math.min(1, ((G.scopeZoom || 1) - 1) / 0.3));
    const ox = (0.17 + bx + sway + bell * 0.05) * (1 - adsAmt * 0.82), oy = -0.23 + by - kick * 0.015 - bell * 0.11 + adsAmt * 0.115, oz = -0.44 + kick * 0.05 + bell * 0.06 - adsAmt * 0.05;   // gun anchor (lower-right, close) in view space
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
    // magazine (curved-ish: two stacked slanted boxes) — rides magDrop during a reload
    if (!pistol) { cbox(a, ox + 0.005, oy - 0.1 + magDrop, oz - 0.06, 0.02, 0.07, 0.028, metal); cbox(a, ox + 0.012, oy - 0.19 + magDrop, oz - 0.02, 0.018, 0.05, 0.024, metal); }
    else cbox(a, ox, oy - 0.09 + magDrop, oz - 0.02, 0.018, 0.06, 0.02, metal);
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
    prog = link(VS, FS, ['aPos', 'aNormal', 'aUV', 'aColor']); sky = link(SKY_VS, SKY_FS, ['aP']); if (!prog || !sky) return false;
    loc = {}; ['aPos', 'aNormal', 'aUV', 'aColor'].forEach(n => loc[n] = gl.getAttribLocation(prog, n));
    ['uMVP', 'uCam', 'uTex', 'uLightDir', 'uLightCol', 'uAmbient', 'uFog', 'uFogNear', 'uFogFar', 'uGloss', 'uFlash',
     'uMat', 'uMatS', 'uRim', 'uTime'].forEach(n => loc[n] = gl.getUniformLocation(prog, n));
    skyLoc.aP = gl.getAttribLocation(sky, 'aP'); ['uTop', 'uMid', 'uHorizon', 'uSunDir', 'uYaw', 'uPitch', 'uAspect', 'uFov', 'uT'].forEach(n => skyLoc[n] = gl.getUniformLocation(sky, n));
    /* The skinned-operative program is OPTIONAL. If it will not build — old driver, no room for
     * eleven mat4 uniforms, anything — skinOk stays false, no .skn is ever registered, and every
     * bot keeps the articulated box rig. The deathmatch does not care either way. */
    try {
      skinProg = link(SKIN_VS, FS, ['aPos', 'aNormal', 'aIdx', 'aWgt']);
      if (skinProg) {
        skinLoc = {};
        ['aPos', 'aNormal', 'aIdx', 'aWgt'].forEach(n => skinLoc[n] = gl.getAttribLocation(skinProg, n));
        ['uMVP', 'uModel', 'uBones', 'uTint', 'uCam', 'uTex', 'uLightDir', 'uLightCol', 'uAmbient',
         'uFog', 'uFogNear', 'uFogFar', 'uGloss', 'uFlash', 'uMat', 'uMatS', 'uRim', 'uTime']
          .forEach(n => skinLoc[n] = gl.getUniformLocation(skinProg, n));
        skinOk = !!skinLoc.uBones && skinLoc.aPos >= 0 && skinLoc.aIdx >= 0;
      }
    } catch (e) { skinOk = false; }
    tex.wall = makeTex(256, drawWall); tex.floor = makeTex(256, drawFloor); tex.crate = makeTex(256, drawCrate); tex.ammo = makeTex(256, drawAmmo); tex.white = whiteTex();
    tex.hole = makeTex(64, drawHole); tex.scorch = makeTex(64, drawScorch); tex.shadow = makeTex(64, drawShadow);
    tex.posters = DARKFARMS.map(t => makeImgTex('https://arweave.net/' + t));   // CC0 wall-art, darkfarms.wtf
    tex.tags = [0, 1, 2, 3, 4, 5].map(i => makeTexA(256, (x, S) => drawTag(x, S, i * 977 + 13)));   // our own marks
    dynBuf = gl.createBuffer();
    skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    // shared bloom/vignette/grain compositor — no-ops itself if the FBO chain can't be built
    try { post = window.GfxPost ? GfxPost.create(gl, cv, GfxPost.PRESET.tactical) : null; } catch (e) { post = null; }
    ok = true; return true;
  }

  /* Camera motion, 0..1, for GfxPost's smear. Turning is what sells it — a whip-pan to check a
   * flank should streak, walking forward should not — so yaw/pitch rate dominates and running
   * speed only tops it up. Normalised against ~4 rad/s, about as fast as a mouse flick. */
  let pYaw = null, pPitch = null, pX = 0, pZ = 0, pT = 0;
  function camMotion(cam, G) {
    const t = G.t || 0, dt = Math.max(1 / 240, Math.min(0.25, t - pT)); pT = t;
    if (pYaw == null) { pYaw = cam.yaw; pPitch = cam.pitch; pX = cam.x; pZ = cam.z; return 0; }
    let dy = cam.yaw - pYaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    const dp = cam.pitch - pPitch, dl = Math.hypot(cam.x - pX, cam.z - pZ);
    pYaw = cam.yaw; pPitch = cam.pitch; pX = cam.x; pZ = cam.z;
    const ang = Math.hypot(dy, dp) / dt, lin = dl / dt;
    return Math.max(0, Math.min(1, ang / 4.0 + lin / 26));
  }

  function frame(cam, G, ENV) {
    if (!ok) return;
    if (post && post.motion) post.motion(camMotion(cam, G));
    const composited = post && post.begin();          // scene → offscreen target when the chain is up
    if (!composited) gl.viewport(0, 0, cv.width, cv.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky (fills the screen behind the world)
    gl.useProgram(sky); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.enableVertexAttribArray(skyLoc.aP); gl.vertexAttribPointer(skyLoc.aP, 2, gl.FLOAT, false, 0, 0);
    const fovy = 0.97 / (G.scopeZoom || 1), asp = cv.width / cv.height;   // match the canvas FOV so aim/look feel is identical
    gl.uniform3fv(skyLoc.uTop, skyOv ? skyOv.top : ENV.skyTop); gl.uniform3fv(skyLoc.uMid, skyOv ? skyOv.mid : ENV.skyMid);
    gl.uniform3fv(skyLoc.uHorizon, skyOv ? skyOv.hor : ENV.skyHorizon);
    gl.uniform3fv(skyLoc.uSunDir, ENV.lightDir);
    gl.uniform1f(skyLoc.uYaw, cam.yaw); gl.uniform1f(skyLoc.uPitch, cam.pitch);
    gl.uniform1f(skyLoc.uAspect, asp); gl.uniform1f(skyLoc.uFov, fovy); gl.uniform1f(skyLoc.uT, G.t || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    // world
    gl.useProgram(prog);
    const eye = [cam.x, cam.y, cam.z];
    const mvp = mul(persp(fovy, asp, 0.06, viewFar), viewMat(eye, cam.yaw, cam.pitch));
    gl.uniformMatrix4fv(loc.uMVP, false, new Float32Array(mvp));
    gl.uniform3fv(loc.uCam, eye);
    gl.uniform3fv(loc.uLightDir, ENV.lightDir); gl.uniform3fv(loc.uLightCol, lightOv || ENV.lightCol); gl.uniform3fv(loc.uAmbient, ambOv || ENV.ambient);
    gl.uniform3fv(loc.uFog, fogCol || ENV.fog); gl.uniform1f(loc.uFogNear, fogNear); gl.uniform1f(loc.uFogFar, fogFar);
    gl.uniform1f(loc.uTime, G.t || 0);
    // the strongest live muzzle flash becomes a warm point light on the world
    let fx = 0, fy = 0, fz = 0, fw = 0;
    for (const e of G.ents) { if (!e.alive || !(e.muzzle > 0)) continue;
      const p = Math.min(1, e.muzzle / 0.05);
      if (p > fw) { fw = p; fx = e.isMe ? cam.x : e.x; fy = e.isMe ? cam.y - 0.1 : e.y + 1.28; fz = e.isMe ? cam.z : e.z; } }
    gl.uniform4f(loc.uFlash, fx, fy, fz, fw * 1.5);
    const flash = [fx, fy, fz, fw * 1.5];
    poseAll(G);                                       // one FPS pose per skinned bot, reused by mesh + gun
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(loc.uTex, 0);
    for (const b of batches) {
      gl.uniform1f(loc.uGloss, b.gloss); gl.uniform1f(loc.uMat, b.mat || 0);
      gl.uniform1f(loc.uMatS, b.matS || 1); gl.uniform1f(loc.uRim, b.rim || 0);
      gl.bindTexture(gl.TEXTURE_2D, tex[b.tex]); gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
      bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, b.count);
    }
    // everything after the world is plain-shaded: leaving uMat/uRim set would band the operatives
    gl.uniform1f(loc.uMat, 0); gl.uniform1f(loc.uRim, 0);
    const ea = buildEntities(G);
    if (ea.length) { gl.uniform1f(loc.uGloss, 0.28); gl.bindTexture(gl.TEXTURE_2D, tex.white); gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ea), gl.DYNAMIC_DRAW); bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, ea.length / STRIDE); }
    // skinned bodies: their own program, then hand the world program back its state
    if (drawSkinned(G, mvp, eye, ENV, flash)) { gl.useProgram(prog); gl.activeTexture(gl.TEXTURE0); }
    // ── DarkFarms wall-art posters (CC0 · darkfarms.wtf): dark frame, then each card ──
    if (posters) {
      gl.uniform1f(loc.uGloss, 0.04); gl.bindTexture(gl.TEXTURE_2D, tex.white);
      gl.bindBuffer(gl.ARRAY_BUFFER, posters.frameVBO); bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, posters.frameCount);
      gl.uniform1f(loc.uGloss, 0.12);
      for (const c of posters.cards) { gl.bindTexture(gl.TEXTURE_2D, c.tex); gl.bindBuffer(gl.ARRAY_BUFFER, c.vbo); bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, c.count); }
    }
    // ── blended ground work: blob shadows under operatives, then bullet/laser decals.
    //    Depth-tested against the world (stick + occlude), no depth write. ──
    /* Tags are alpha decals on the world: depth-TESTED so a wall in front hides them, depth
     * write off so they never occlude anything themselves. */
    if (tags) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.uniform1f(loc.uGloss, 0.05);
      for (const t of tags.q) { gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.bindBuffer(gl.ARRAY_BUFFER, t.vbo); bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, t.count); }
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    const D = buildDecals(G); const SH = buildShadows(G);
    if (D.hole.length || D.scorch.length || SH.length) {
      gl.enable(gl.BLEND); gl.depthMask(false); gl.uniform1f(loc.uGloss, 0);
      if (SH.length) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.bindTexture(gl.TEXTURE_2D, tex.shadow);
        gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(SH), gl.DYNAMIC_DRAW); bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, SH.length / STRIDE); }
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
        gl.uniform1f(loc.uGloss, 0.55);
        gl.uniform4f(loc.uFlash, 0.17, -0.15, -0.85, (G.me.muzzle > 0) ? 0.9 : 0);   // view-space: light the gun from its own muzzle
        gl.uniform3fv(loc.uLightDir, VMLIGHT); gl.uniform3fv(loc.uLightCol, [0.85, 0.8, 0.72]); gl.uniform3fv(loc.uAmbient, [0.5, 0.49, 0.47]);
        gl.bindTexture(gl.TEXTURE_2D, tex.white);
        gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(va), gl.DYNAMIC_DRAW); bindAttribs(loc); gl.drawArrays(gl.TRIANGLES, 0, va.length / STRIDE);
      }
    }
    if (composited) post.end();                       // bright → blur → composite to the screen
  }

  return { init, buildMap, frame, registerSkin, hasSkin, supported: () => ok,
           skinSupported: () => skinOk, post: () => post,
           stats: () => ({ batches: batches.length, tris: batches.reduce((n, b) => n + b.count / 3, 0),
                           tags: tags ? tags.q.length : 0, skins: Object.keys(skins).length }) };
})();

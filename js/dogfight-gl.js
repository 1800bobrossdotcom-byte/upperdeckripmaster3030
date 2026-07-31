/* upperdeckripmaster3030 — DOGFIGHT true-3D renderer (window.DFGL). Milestone 1.
 *
 * Dogfight has always been FAKE 3D: a hand-rolled projection (FOCAL/HORIZON) that maps world
 * (x, y, alt) to screen and rolls the whole scene around the horizon to bank. It reads well,
 * but it can't do depth sorting, real perspective on geometry, lighting, or anything that
 * needs a z-buffer. This is the real thing — a perspective camera and GPU geometry — built
 * the same way js/section9-gl.js and js/ronin3d.js are, so the three share conventions.
 *
 * The game's state is already 3D, which is why this is possible without touching gameplay:
 *
 *     world position   (x, alt, y)   ->  GL (x, alt, y), Y-up
 *     camera           cam{x,y,alt,h,ph,roll} + CAM_BACK behind the craft
 *     toroidal wrap    WS units; the grid is drawn camera-relative so the seam never shows
 *
 *   DFGL.init(canvas)             -> true if the GPU path is live
 *   DFGL.frame(G, cam, world, o)  draw one frame
 *   DFGL.supported()              -> ok
 *   DFGL.post()                   the GfxPost handle, for headless checks
 *
 * ── Division of labour ───────────────────────────────────────────────────────────────────
 * The craft, the boost gates and the scenery are AUTHORED — models/dogfight.glb, built by
 * `npm run craft` from scripts/blender/build-craft.py, loaded through js/ronin-glb.js. Every
 * one of them still has a procedural version below, and that is not redundancy for its own
 * sake: the fetch is async and can fail, so the procedural mesh is what flies until the file
 * lands and what flies forever if it doesn't.
 *
 * This draws the WORLD: sky, ground grid, props, gates, ships, bolts, bursts. The HUD, the
 * radar and the reticle stay in 2D/DOM on the overlay canvas, deliberately — text and UI are
 * sharper and cheaper there, and that is exactly how Section 9 splits it too.
 *
 * Fails open: if anything throws, init() returns false and dogfight keeps its 2D renderer.
 */
window.DFGL = (function () {
  const TAU = Math.PI * 2;
  let gl = null, cv = null, ok = false, post = null;
  let prog = null, sky = null, loc = {}, skyLoc = {};
  let dyn = null, skyBuf = null, geo = {};
  let cloud = null, cloudLoc = {}, cloudBuf = null;

  // ── mat4, column-major, same kit as the other two renderers ──
  const M = {
    I: () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
    mul(a, b) { const o = new Array(16);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
        o[i*4+j] = a[j]*b[i*4] + a[4+j]*b[i*4+1] + a[8+j]*b[i*4+2] + a[12+j]*b[i*4+3];
      return o; },
    T: (x,y,z) => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1],
    S: (x,y,z) => [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1],
    Rx(a){ const c=Math.cos(a),s=Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; },
    Ry(a){ const c=Math.cos(a),s=Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; },
    Rz(a){ const c=Math.cos(a),s=Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; },
    persp(fovy, asp, n, f) { const t = 1/Math.tan(fovy/2);
      return [t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]; },
  };

  const STRIDE = 9;   // pos3 + norm3 + col3

  /* ── surface shading ───────────────────────────────────────────────────────────────────
   * M1 lit everything with `0.34 + 0.78·max(0,N·L)` — one lambert term over flat ambient. On
   * faceted low-poly that reads as coloured cardboard: every face is a single flat value, the
   * terminator bands hard, and nothing anywhere is shiny, so a metal hull and a painted wall
   * shade identically. Four cheap additions do most of the work of a real material:
   *
   *   HEMISPHERE AMBIENT  sky colour from above, ground bounce from below, instead of a flat
   *                       constant. Undersides go cool and dark, tops pick up the sky — the
   *                       single biggest cue that an object is sitting in an environment.
   *   WRAPPED DIFFUSE     the terminator is pushed around the form rather than clipped at
   *                       N·L=0, which stops faceted geometry banding into hard wedges.
   *   BLINN-PHONG SPEC    a hull now has a highlight that slides as you turn. Without it,
   *                       nothing reads as a surface with a finish.
   *   FRESNEL RIM         grazing angles pick up sky colour. This is what separates a
   *                       silhouette from the fog behind it at distance.
   *
   * ⚠ Two-sided on purpose: this renderer disables CULL_FACE, so a back-facing triangle would
   *   otherwise shade black. Flipping N toward the viewer keeps thin geometry (wings, the
   *   gate ring, prop shells) lit from both sides.
   */
  const VS = 'attribute vec3 aPos; attribute vec3 aNorm; attribute vec3 aCol;' +
    'uniform mat4 uMVP; uniform mat4 uM; varying vec3 vN; varying vec3 vC; varying float vD;' +
    'varying vec3 vW;' +
    'void main(){ vN=(uM*vec4(aNorm,0.0)).xyz; vC=aCol; vW=(uM*vec4(aPos,1.0)).xyz;' +
    ' vec4 p=uMVP*vec4(aPos,1.0); vD=p.w; gl_Position=p; }';
  const FS = 'precision mediump float;' +
    'varying vec3 vN; varying vec3 vC; varying float vD; varying vec3 vW;' +
    'uniform vec3 uLight; uniform vec3 uFog; uniform vec2 uFogND; uniform float uEmit;' +
    'uniform vec3 uEye; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGnd;' +
    'uniform float uSpec; uniform float uAlpha;' +
    'void main(){' +
    ' vec3 c;' +
    ' if(uEmit>0.5){ c=vC; }' +                                  // grid, bolts, anything glowing
    ' else {' +
    '   vec3 N=normalize(vN), L=normalize(uLight), V=normalize(uEye-vW);' +
    '   if(dot(N,V)<0.0) N=-N;' +                                // two-sided: CULL_FACE is off
    '   vec3 amb=mix(uGnd,uSky,N.y*0.5+0.5);' +
    '   float wrap=max(0.0,(dot(N,L)+0.35)/1.35);' +
    '   vec3 Hv=normalize(L+V);' +
    '   float spec=pow(max(0.0,dot(N,Hv)),40.0)*uSpec*max(0.0,dot(N,L));' +
    '   float fres=pow(1.0-max(0.0,dot(N,V)),3.0);' +
    '   c=vC*(amb+uSunCol*wrap) + uSunCol*spec + uSky*fres*0.35; }' +
    ' float fg=clamp((vD-uFogND.x)/(uFogND.y-uFogND.x),0.0,1.0);' +
    ' gl_FragColor=vec4(mix(c,uFog,fg*0.92),uAlpha); }';

  // sky: the theme's two-stop gradient plus a sun disc, in one fullscreen pass
  const SKY_VS = 'attribute vec2 aP; varying vec2 uv; void main(){ uv=aP; gl_Position=vec4(aP,0.999,1.0); }';
  const SKY_FS = 'precision mediump float; varying vec2 uv;' +
    'uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uSun; uniform vec2 uSunPos;' +
    'uniform float uAsp; uniform float uRoll; uniform float uWhite; uniform vec3 uWhiteCol;' +
    'void main(){' +
    ' float c=cos(uRoll), s=sin(uRoll);' +
    ' vec2 p=vec2(uv.x*c-uv.y*s, uv.x*s+uv.y*c);' +             // sky banks with the craft
    ' float t=clamp(p.y*0.5+0.5,0.0,1.0);' +
    ' vec3 col=mix(uBot,uTop,t);' +
    ' vec2 d=vec2((p.x-uSunPos.x)*uAsp, p.y-uSunPos.y);' +
    ' float r=length(d);' +
    ' col+=uSun*smoothstep(0.30,0.0,r)*0.9;' +                   // disc
    ' col+=uSun*smoothstep(0.95,0.0,r)*0.16;' +                  // haze
    ' col=mix(col,uWhiteCol,uWhite);' +                          // inside the deck: white-out
    ' gl_FragColor=vec4(col,1.0); }';

  /* ── clouds ────────────────────────────────────────────────────────────────────────────
   * A deck of FBM value-noise layers at altitude, drawn as three camera-relative quads with
   * per-fragment coverage. The noise lattice is WRAP-AWARE: the world is toroidal (WS units),
   * so every octave's lattice repeat divides WS exactly — mod'd cell hashing — or the deck
   * would show a hard seam along the wrap line the way a naive FBM would. Drift (uT) is a
   * translation, which periodicity survives, so the clouds can move forever.
   */
  const CLOUD_VS = 'attribute vec2 aP; uniform mat4 uMVP; uniform float uY; uniform vec2 uCam;' +
    'uniform vec3 uEye; varying vec3 vP; varying vec3 vRay; varying float vD;' +
    'void main(){ vec3 w=vec3(aP.x,uY,aP.y); vP=w+vec3(uCam.x,0.0,uCam.y);' +
    ' vRay=w-uEye; vec4 p=uMVP*vec4(w,1.0); vD=p.w; gl_Position=p; }';
  /* Raymarched through the slab's THICKNESS, not painted on a plane. Three flat sheets read
   * exactly as three flat sheets from any angle that isn't edge-on — which is most of a
   * dogfight. Stepping the ray through a 3D noise field costs a loop and buys the thing that
   * makes clouds read as weather: density that accumulates with how much cloud the ray
   * actually crossed, so a shallow glance is thin haze and a dive through is opaque.
   *
   * Self-shadowing is the other half. A second short march toward the sun per sample gives
   * lit tops and dark bases — the cue the eye reads as volume — for a handful of extra taps. */
  const CLOUD_FS = 'precision mediump float;' +
    'varying vec3 vP; varying vec3 vRay; varying float vD;' +
    'uniform vec3 uCol; uniform vec3 uFog; uniform vec3 uSunDir; uniform float uT;' +
    'uniform float uThr; uniform float uFar; uniform float uRep0; uniform float uWS;' +
    'uniform float uSlabY; uniform float uSlabH; uniform float uDens;' +
    'float h(vec2 c){ return fract(sin(dot(c,vec2(127.1,311.7)))*43758.5453); }' +
    'float vn(vec2 p, float rep){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);' +
    ' float a=h(mod(i,rep)), b=h(mod(i+vec2(1.,0.),rep)), c=h(mod(i+vec2(0.,1.),rep)), d=h(mod(i+vec2(1.,1.),rep));' +
    ' return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }' +
    // density at a world point: wrap-safe FBM in xz, shaped vertically so the slab has edges
    'float dens(vec3 w){' +
    ' float rep=uRep0; vec2 p=w.xz/uWS*rep + vec2(uT*0.11,uT*0.045);' +
    ' float s=0.0, amp=0.5;' +
    ' for(int i=0;i<4;i++){ s+=amp*vn(p,rep); p=p*2.0+vec2(17.13,9.77); amp*=0.5; rep*=2.0; }' +
    ' float v=(w.y-uSlabY)/uSlabH;' +                                  // -1 base .. +1 top
    ' float shape=1.0-v*v;' +                                          // fat middle, feathered edges
    ' return max(0.0, (s-uThr)*shape); }' +
    'void main(){' +
    ' vec3 dir=normalize(vRay);' +
    ' float step=uSlabH*0.42;' +
    ' vec3 pos=vP - dir*uSlabH*0.9;' +                                 // enter a little before the plane
    ' float acc=0.0, lit=0.0;' +
    ' for(int i=0;i<6;i++){' +
    '   float d=dens(pos);' +
    '   if(d>0.0){' +
    // one short march toward the sun: how much cloud is above/behind this sample
    '     float sh=dens(pos+uSunDir*uSlabH*0.7)+dens(pos+uSunDir*uSlabH*1.4)*0.6;' +
    '     lit+=d*exp(-sh*2.6); acc+=d; }' +
    '   pos+=dir*step; }' +
    ' acc*=uDens; if(acc<0.012) discard;' +
    ' float a=clamp(acc,0.0,1.0);' +
    ' float L=clamp(lit/max(acc/uDens,0.001),0.0,1.0);' +               // 0 deep shadow .. 1 sunlit
    ' vec3 c=mix(uCol*0.42+uFog*0.30, uCol, L);' +
    ' c+=vec3(0.09)*L*L;' +                                            // silver rim on the lit crowns
    ' float fg=clamp(vD/uFar,0.0,1.0);' +
    ' gl_FragColor=vec4(mix(c,uFog,fg*0.85), a*0.92*(1.0-fg*fg)); }';

  function sh(t, src) { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
  function link(v, f) { const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }

  const hex = h => { h = String(h || '#fff').replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    const n = parseInt(h, 16) || 0;
    return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255]; };

  // ── geometry helpers: push triangles into a flat array ──
  function tri(a, p0, p1, p2, col) {
    const ux=p1[0]-p0[0], uy=p1[1]-p0[1], uz=p1[2]-p0[2];
    const vx=p2[0]-p0[0], vy=p2[1]-p0[1], vz=p2[2]-p0[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const L=Math.hypot(nx,ny,nz)||1; nx/=L; ny/=L; nz/=L;
    for (const p of [p0,p1,p2]) a.push(p[0],p[1],p[2], nx,ny,nz, col[0],col[1],col[2]);
  }
  function quad(a, p0, p1, p2, p3, col) { tri(a,p0,p1,p2,col); tri(a,p0,p2,p3,col); }
  /** a camera-facing ribbon between two points — bolts, trails, grid lines with width */
  function beam(a, A, B, w, col, up) {
    up = up || [0,1,0];
    let dx=B[0]-A[0], dy=B[1]-A[1], dz=B[2]-A[2];
    let rx=dy*up[2]-dz*up[1], ry=dz*up[0]-dx*up[2], rz=dx*up[1]-dy*up[0];
    const L=Math.hypot(rx,ry,rz)||1; rx=rx/L*w; ry=ry/L*w; rz=rz/L*w;
    quad(a, [A[0]-rx,A[1]-ry,A[2]-rz], [A[0]+rx,A[1]+ry,A[2]+rz],
            [B[0]+rx,B[1]+ry,B[2]+rz], [B[0]-rx,B[1]-ry,B[2]-rz], col);
  }

  /* The craft: a delta-wing built from flat panels. Deliberately faceted — dogfight's whole
   * look is neon low-poly, and smooth shading would fight it. Nose is +Z. */
  const CRAFT = 0.42;    // world units — a 1-unit craft fills the screen at CAM_BACK 2.4
  function craftVerts(col, accent) {
    const a = [];
    const NOSE=[0,0,0.62], TAIL=[0,0.02,-0.38];
    const WL=[-0.52,-0.02,-0.26], WR=[0.52,-0.02,-0.26];
    const TOP=[0,0.13,-0.10], BOT=[0,-0.09,-0.06];
    tri(a, NOSE, WL, TOP, col);  tri(a, NOSE, TOP, WR, col);      // upper surfaces
    tri(a, NOSE, BOT, WL, col);  tri(a, NOSE, WR, BOT, col);      // lower
    tri(a, WL, TAIL, TOP, col);  tri(a, TOP, TAIL, WR, col);
    tri(a, WL, BOT, TAIL, col);  tri(a, BOT, WR, TAIL, col);
    tri(a, [0,0.13,-0.10], [0,0.34,-0.34], TAIL, accent);        // fin
    for (let i = 0; i < a.length; i += STRIDE) { a[i]*=CRAFT; a[i+1]*=CRAFT; a[i+2]*=CRAFT; }
    return a;
  }
  function podVerts(col) {   // engine glow block, drawn emissive
    const a = [], w=0.09, h=0.05, z0=-0.30, z1=-0.44;
    for (const sx of [-0.26, 0.26]) {
      quad(a, [sx-w,-h,z0],[sx+w,-h,z0],[sx+w,h,z0],[sx-w,h,z0], col);
      quad(a, [sx-w,-h,z1],[sx+w,-h,z1],[sx+w,h,z1],[sx-w,h,z1], col);
    }
    for (let i = 0; i < a.length; i += STRIDE) { a[i]*=CRAFT; a[i+1]*=CRAFT; a[i+2]*=CRAFT; }
    return a;
  }
  /* The boost gate. GATE_R is not a look — it is the pass-through test in dogfight.html
   * (`hypot(...) < 1.4`), so the ring you see is exactly the ring you can collect. The 2D
   * renderer sizes its ellipse in PIXELS, so the two have never agreed there. */
  const GATE_R = 1.40;
  function gateVerts(col) {
    const a = [], SEG = 26, w = 0.09, r0 = GATE_R - 0.08, r1 = GATE_R + 0.08;
    for (let i = 0; i < SEG; i++) {
      const a0 = TAU*i/SEG, a1 = TAU*(i+1)/SEG;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      for (const z of [-w, w])
        quad(a, [c0*r0,s0*r0,z], [c1*r0,s1*r0,z], [c1*r1,s1*r1,z], [c0*r1,s0*r1,z], col);
      quad(a, [c0*r1,s0*r1,-w], [c1*r1,s1*r1,-w], [c1*r1,s1*r1,w], [c0*r1,s0*r1,w], col);
      quad(a, [c0*r0,s0*r0,-w], [c1*r0,s1*r0,-w], [c1*r0,s1*r0,w], [c0*r0,s0*r0,w], col);
    }
    return a;
  }

  function mkvbo(arr) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    return { vbo: b, count: arr.length / STRIDE }; }

  /* ── authored geometry: models/dogfight.glb ─────────────────────────────────────────────
   * Built by `npm run craft` from scripts/blender/build-craft.py. Parts are looked up BY NAME
   * (craft · pod · gate · prop_<kind>), which is why that build script asserts the names exist
   * instead of trusting the modeller — a missing part here is silent, not loud.
   *
   * RoninGLB returns interleaved pos3+norm3; this renderer wants pos3+norm3+col3, and colour
   * is per-draw (a ship's tint, a world's grid hue). So a part is kept once as its raw floats
   * plus a `fit`, and artGeo() expands it into a VBO the first time a colour asks for one.
   *
   * `fit` normalises the model instead of the code trusting the modeller's units: whatever
   * size a craft is authored at, it arrives on screen at CRAFT. A replacement model therefore
   * drops in without anyone retuning a constant — which is the whole reason the geometry moved
   * out of this file.
   *
   * Fails open at every step: no RoninGLB, no fetch, or a file with no `craft` part ⇒ ART
   * stays null and every path below draws the procedural verts that shipped in M1.
   */
  let ART = null, artVbo = {};
  const art = n => (ART && ART[n]) || null;

  /** out = (in - c) * s. lo/hi are the part's own bounds, so this is measured, not assumed. */
  const fitLongest = (b, target) => {
    const e = [b.hi[0]-b.lo[0], b.hi[1]-b.lo[1], b.hi[2]-b.lo[2]];
    return { s: target / (Math.max(e[0], e[1], e[2]) || 1),
             c: [(b.lo[0]+b.hi[0])/2, (b.lo[1]+b.hi[1])/2, (b.lo[2]+b.hi[2])/2] };
  };
  /** a ring: scale by its HORIZONTAL half-extent, since that is the radius the hitbox uses */
  const fitRadius = (b, target) => {
    const r = Math.max(b.hi[0]-b.lo[0], b.hi[1]-b.lo[1]) / 2;
    return { s: target / (r || 1),
             c: [(b.lo[0]+b.hi[0])/2, (b.lo[1]+b.hi[1])/2, (b.lo[2]+b.hi[2])/2] };
  };
  /** scenery: height becomes `target`, and the origin lands on the BASE so `alt` lifts it off
   *  the ground by the amount the game means rather than by half a prop */
  const fitStanding = (b, target) => ({ s: target / ((b.hi[1]-b.lo[1]) || 1),
    c: [(b.lo[0]+b.hi[0])/2, b.lo[1], (b.lo[2]+b.hi[2])/2] });

  function loadArt(url) {
    if (!window.RoninGLB) return;
    try {
      RoninGLB.load(url || '/models/dogfight.glb').then(r => {
        const p = {};
        for (const m of r.meshes) if (m.verts && m.count) p[m.name] = m;
        if (!p.craft) return;                      // a GLB with no craft is not this GLB
        // craft and pod share ONE fit, taken from the craft. The exhausts are authored bolted
        // to the tail; fitting the pod to its own bounds would centre it on the origin and hang
        // the engine glow off the nose.
        const cf = fitLongest(p.craft.bounds, CRAFT);
        const out = { craft: { v: p.craft.verts, fit: cf } };
        if (p.pod)  out.pod  = { v: p.pod.verts,  fit: cf };
        if (p.gate) out.gate = { v: p.gate.verts, fit: fitRadius(p.gate.bounds, GATE_R) };
        for (const k of ['pylon','ring','spire','tower','crystal']) {
          const m = p['prop_' + k];
          if (m) out['prop_' + k] = { v: m.verts, fit: fitStanding(m.bounds, 1) };
        }
        ART = out; artVbo = {};
      }).catch(() => {});
    } catch (e) { /* fail open — the procedural craft is always there */ }
  }

  function artGeo(key, part, col) {
    const ck = key + '|' + col[0].toFixed(3) + col[1].toFixed(3) + col[2].toFixed(3);
    if (artVbo[ck]) return artVbo[ck];
    const src = part.v, f = part.fit, n = src.length / 6, out = new Float32Array(n * STRIDE);
    for (let i = 0, o = 0; i < n; i++) {
      const j = i * 6;
      out[o++] = (src[j]   - f.c[0]) * f.s;
      out[o++] = (src[j+1] - f.c[1]) * f.s;
      out[o++] = (src[j+2] - f.c[2]) * f.s;
      out[o++] = src[j+3]; out[o++] = src[j+4]; out[o++] = src[j+5];
      out[o++] = col[0];   out[o++] = col[1];   out[o++] = col[2];
    }
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, out, gl.STATIC_DRAW);
    return (artVbo[ck] = { vbo: b, count: n });
  }

  function bindAttribs() { const s = STRIDE * 4;
    gl.enableVertexAttribArray(loc.aPos);  gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, s, 0);
    gl.enableVertexAttribArray(loc.aNorm); gl.vertexAttribPointer(loc.aNorm, 3, gl.FLOAT, false, s, 12);
    gl.enableVertexAttribArray(loc.aCol);  gl.vertexAttribPointer(loc.aCol, 3, gl.FLOAT, false, s, 24);
  }
  function drawArr(arr) {
    if (!arr.length) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, dyn);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
    bindAttribs(); gl.drawArrays(gl.TRIANGLES, 0, arr.length / STRIDE);
  }

  function init(canvas, opt) {
    try {
      cv = canvas;
      gl = cv.getContext('webgl', { antialias: true, alpha: false, depth: true })
        || cv.getContext('experimental-webgl');
      if (!gl) return false;
      prog = link(VS, FS); sky = link(SKY_VS, SKY_FS);
      ['aPos','aNorm','aCol'].forEach(n => loc[n] = gl.getAttribLocation(prog, n));
      ['uMVP','uM','uLight','uFog','uFogND','uEmit','uEye','uSunCol','uSky','uGnd','uSpec','uAlpha']
        .forEach(n => loc[n] = gl.getUniformLocation(prog, n));
      skyLoc.aP = gl.getAttribLocation(sky, 'aP');
      ['uTop','uBot','uSun','uSunPos','uAsp','uRoll','uWhite','uWhiteCol'].forEach(n => skyLoc[n] = gl.getUniformLocation(sky, n));
      // clouds fail open on their own: a compile failure costs the deck, not the game
      try {
        cloud = link(CLOUD_VS, CLOUD_FS);
        cloudLoc.aP = gl.getAttribLocation(cloud, 'aP');
        ['uMVP','uY','uCam','uEye','uCol','uFog','uSunDir','uT','uThr','uFar','uRep0','uWS',
         'uSlabY','uSlabH','uDens'].forEach(n => cloudLoc[n] = gl.getUniformLocation(cloud, n));
        cloudBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cloudBuf);
        const R = 60;
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-R,-R, R,-R, -R,R, R,-R, R,R, -R,R]), gl.STATIC_DRAW);
      } catch (e) { cloud = null; }
      dyn = gl.createBuffer();
      skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      // blur is the per-caller motion-smear CEILING (see gfx-post.js) — ronin shares the neon
      // preset and must not inherit it, hence the spread rather than editing the preset
      try { post = window.GfxPost ? GfxPost.create(gl, cv, Object.assign({}, GfxPost.PRESET.neon, { blur: 0.45 })) : null; } catch (e) { post = null; }
      loadArt(opt && opt.art);          // async; the procedural craft flies until it lands
      ok = true; return true;
    } catch (e) { ok = false; return false; }
  }

  /** o = { WS, CAM_BACK, CAM_H, VIEW_FAR, CLOUD_ALT, CLOUD_THICK } — the game's own constants,
   *  passed in rather than duplicated here, so tuning them in dogfight.html cannot desync the
   *  renderer. */
  let pvH = null, pvRoll = 0, pvPh = 0;
  function frame(G, cam, world, o) {
    if (!ok) return false;
    const WS = o.WS, FAR = o.VIEW_FAR || 34;

    /* Motion smear is driven by how hard the CAMERA is actually working — yaw/roll/pitch rate
     * plus a floor while boosting — so straight-and-level stays pin sharp and a whip-turn or a
     * boost run streaks. post.motion is the gfx-post feedback hook; guarded, since an older
     * gfx-post fails open to no smear. */
    if (post && post.motion) {
      const dh = pvH == null ? 0 : Math.abs((((cam.h - pvH) + Math.PI * 3) % TAU) - Math.PI);
      const m = Math.min(1, dh * 7 + Math.abs((cam.roll || 0) - pvRoll) * 4 +
                            Math.abs((cam.ph || 0) - pvPh) * 5 +
                            (G.me && G.me.boost ? 0.42 : 0));
      post.motion(m);
      pvH = cam.h || 0; pvRoll = cam.roll || 0; pvPh = cam.ph || 0;
    }
    const w = cv.width, h = cv.height, asp = w / h;
    const composited = post && post.begin();
    if (!composited) gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    /* ── the cloud deck's hold on the frame ──────────────────────────────────────────────
     * `inCloud` rises to 1 as the eye enters the deck band. It white-outs the sky, drags the
     * fog toward the cloud colour and pulls the fog wall in close — flying INTO the weather
     * blinds you, which is what makes owning the airspace above or below it worth anything. */
    const CLOUD_Y = o.CLOUD_ALT || 5.4, CLOUD_TH = o.CLOUD_THICK || 0.9;
    const eyeAlt = (o.CAM_H || 1.2) + (cam.alt || 0);
    const inCloud = cloud ? Math.max(0, 1 - Math.abs(eyeAlt - CLOUD_Y) / CLOUD_TH) : 0;
    const skyBot = hex(world.sky[1]);
    const cloudCol = [0.86 + skyBot[0]*0.14, 0.86 + skyBot[1]*0.14, 0.86 + skyBot[2]*0.14];
    const fogC = hex(world.fog).map((v, i) => v + (cloudCol[i] - v) * inCloud * 0.9);
    const fogFar = FAR - (FAR - 7) * inCloud;

    // ── sky ──
    const top = hex(world.sky[0]), bot = skyBot, sunC = hex(world.sun);
    gl.useProgram(sky); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.enableVertexAttribArray(skyLoc.aP); gl.vertexAttribPointer(skyLoc.aP, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(skyLoc.uTop, top); gl.uniform3fv(skyLoc.uBot, bot); gl.uniform3fv(skyLoc.uSun, sunC);
    // the sun sits on the heading, so turning sweeps it across the sky
    const sunRel = Math.sin((G.sunAz || 0) - cam.h);
    gl.uniform2f(skyLoc.uSunPos, Math.max(-1.4, Math.min(1.4, sunRel * 1.3)), 0.12 - cam.ph * 0.8);
    gl.uniform1f(skyLoc.uAsp, asp); gl.uniform1f(skyLoc.uRoll, cam.roll || 0);
    if (skyLoc.uWhite) { gl.uniform1f(skyLoc.uWhite, inCloud * 0.92); gl.uniform3fv(skyLoc.uWhiteCol, cloudCol); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);

    /* ── camera: behind and above the craft, banking with roll ───────────────────────────
     * ⚠ The +π/2 on the yaw is load-bearing, not a fudge. The game's heading convention is
     * `fwd = dx·cos h + dy·sin h`, so h = 0 means flying along world +x — which lands on GL
     * +x. A bare Ry(cam.h) leaves the camera looking down -Z while the craft flies +X, i.e.
     * the whole world 90° off: you watch the scenery slide sideways past a hull that points
     * out of the right of frame, and the plane reads as "stuck flying in one direction"
     * because nothing ever comes toward you. Verified numerically at five headings — dead
     * ahead now lands at camera -Z, world-right at +X, and the craft's nose at (0,0,-1).
     *
     * The ship transform's own +π/2 stays: it maps model +Z (the authored nose) onto the same
     * axis. The two offsets are independent — one orients the eye, one orients the hull.
     *
     * View = pullback ∘ inverseOrientation ∘ translateWorld. The pull-back has to be applied
     * in CAMERA space (after the rotation), or the chase offset points along world Z instead
     * of along the craft's own backward axis — which looks fine dead ahead and drifts wrong
     * the moment you turn. */
    const CAM_LIFT = 0.42;                 // how far the eye floats ABOVE the craft
    const eyeY = (cam.alt || 0) + CAM_LIFT;
    const rot = M.mul(M.mul(M.Rz(-(cam.roll || 0)), M.Rx(-(cam.ph || 0))),
                      M.Ry((cam.h || 0) + Math.PI / 2));
    const view = M.mul(M.T(0, 0, -(o.CAM_BACK || 2.4)), M.mul(rot, M.T(0, -eyeY, 0)));
    // world is placed camera-relative, which also hides the toroidal seam for free
    const P = M.persp(1.05, asp, 0.1, FAR * 1.6);
    const VP = M.mul(P, view);

    gl.useProgram(prog);
    /* Sun direction shared with the cloud pass, so a hull's highlight and a cloud's lit crown
     * agree about where the light is. Themes put the sun on their own azimuth. */
    const sunAz = G.sunAz || 0;
    const sunDir = [Math.cos(sunAz) * 0.55, 0.83, Math.sin(sunAz) * 0.55];
    const skyTop = hex(world.sky[0]), gndC = hex(world.gnd), sunC2 = hex(world.sun);
    gl.uniform3fv(loc.uLight, sunDir);
    gl.uniform3fv(loc.uEye, [0, eyeY, 0]);                 // camera-relative space
    gl.uniform3fv(loc.uSunCol, sunC2.map(v => 0.30 + v * 0.72));
    // hemisphere ambient, lifted off the raw theme colours so nothing bottoms out to black
    gl.uniform3fv(loc.uSky, skyTop.map((v, i) => 0.10 + v * 0.42 + bot[i] * 0.16));
    gl.uniform3fv(loc.uGnd, gndC.map(v => 0.06 + v * 0.30));
    gl.uniform1f(loc.uSpec, 0.65);
    gl.uniform1f(loc.uAlpha, 1);
    gl.uniform3fv(loc.uFog, fogC);
    gl.uniform2f(loc.uFogND, fogFar * 0.30, fogFar);

    /* One place that sets BOTH matrices. The lit shader needs the model matrix on its own now
     * (world-space normals and position for specular/fresnel), so setting uMVP alone silently
     * leaves normals from the previous draw — which shows up as a ship lit as though it were
     * still pointing where the last one pointed. */
    const IDENT = M.I();
    const xform = mdl => {
      gl.uniformMatrix4fv(loc.uMVP, false, new Float32Array(mdl ? M.mul(VP, mdl) : VP));
      gl.uniformMatrix4fv(loc.uM, false, new Float32Array(mdl || IDENT));
    };
    xform(null);

    const wdel = v => { v -= Math.round(v / WS) * WS; return v; };

    // ── ground grid: real geometry, drawn camera-relative on a 1-unit lattice ──
    {
      const g = hex(world.grid), gnd = hex(world.gnd), a = [], STEP = 2, R = Math.ceil(FAR / STEP) * STEP;
      const ox = Math.round(cam.x / STEP) * STEP, oz = Math.round(cam.y / STEP) * STEP;
      // a dark floor quad under everything so the horizon reads
      quad(a, [-R*2,-0.02,-R*2], [R*2,-0.02,-R*2], [R*2,-0.02,R*2], [-R*2,-0.02,R*2], gnd);
      drawArr(a); a.length = 0;
      gl.uniform1f(loc.uEmit, 1);
      for (let i = -R; i <= R; i += STEP) {
        const gx = ox + i - cam.x, gz = oz + i - cam.y;
        beam(a, [gx, 0, -R - (oz - cam.y)], [gx, 0, R - (oz - cam.y)], 0.03, g);
        beam(a, [-R - (ox - cam.x), 0, gz], [R - (ox - cam.x), 0, gz], 0.03, g);
      }
      drawArr(a);
      gl.uniform1f(loc.uEmit, 0);
    }

    /* ── props ──────────────────────────────────────────────────────────────────────────
     * Each world theme names a silhouette (WORLDS[].prop), and the game gives every prop its
     * own size, spin and altitude. M1 read none of that: it looked for `p.h`/`p.r`, which the
     * game has never written, so all 260 fell back to identical 2.2 × 0.36 open boxes planted
     * on the deck — one shape for five themes, and the 18% that are meant to float didn't. */
    if (G.props && G.props.length) {
      const pc = hex(world.grid), kind = 'prop_' + (world.prop || 'pylon');
      const part = art(kind) || art('prop_pylon');
      if (part) {
        const g = artGeo(art(kind) ? kind : 'prop_pylon', part, pc);
        gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo); bindAttribs();
        for (const p of G.props) {
          const dx = wdel(p.x - cam.x), dz = wdel(p.y - cam.y);
          if (Math.hypot(dx, dz) > FAR) continue;
          const sc = p.s || 1;
          xform(M.mul(M.mul(M.T(dx, p.alt || 0, dz), M.Ry(p.rot || 0)), M.S(sc, sc, sc)));
          gl.drawArrays(gl.TRIANGLES, 0, g.count);
        }
        xform(null);
      } else {
        const a = [];                                   // no GLB: boxes, but the game's boxes
        for (const p of G.props) {
          const dx = wdel(p.x - cam.x), dz = wdel(p.y - cam.y);
          if (Math.hypot(dx, dz) > FAR) continue;
          const sc = p.s || 1, hgt = sc * 1.9, r = sc * 0.17, y0 = p.alt || 0;
          const ca = Math.cos(p.rot || 0), sa = Math.sin(p.rot || 0);
          const P = (ox, oz, y) => [dx + ox*ca - oz*sa, y0 + y, dz + ox*sa + oz*ca];
          quad(a, P(-r,-r,0), P(r,-r,0), P(r,-r,hgt), P(-r,-r,hgt), pc);
          quad(a, P(-r, r,0), P(r, r,0), P(r, r,hgt), P(-r, r,hgt), pc);
          quad(a, P(-r,-r,0), P(-r,r,0), P(-r,r,hgt), P(-r,-r,hgt), pc);
          quad(a, P( r,-r,0), P( r,r,0), P( r,r,hgt), P( r,-r,hgt), pc);
        }
        drawArr(a);
      }
    }

    /* ── ground shadows ─────────────────────────────────────────────────────────────────
     * Cast down the sun vector onto y≈0, as flat ellipses that widen and fade with height.
     * Two reasons, and the second is the better one:
     *   1. Nothing was grounded. Objects floated over the lattice with no contact cue, which
     *      is most of why the world read as a diagram rather than a place.
     *   2. It is genuine gameplay information. Altitude is otherwise readable only off the
     *      HUD tape, and a chasing craft's shadow tells you how far it has to dive.
     * Alpha-blended, depth-write off so a shadow never occludes the ship that threw it. */
    {
      const a = [], sc = hex(world.gnd);
      const drop = (x, y0, z, r) => {
        const t = Math.max(0, Math.min(1, y0 / 6));
        const rr2 = r * (1 + t * 1.7);                       // higher up ⇒ larger, softer
        const sx = x + sunDir[0] / sunDir[1] * y0, sz = z + sunDir[2] / sunDir[1] * y0;
        for (let i = 0; i < 10; i++) {                       // decagon reads round enough
          const a0 = TAU * i / 10, a1 = TAU * (i + 1) / 10;
          tri(a, [sx, 0.012, sz],
                 [sx + Math.cos(a0) * rr2, 0.012, sz + Math.sin(a0) * rr2],
                 [sx + Math.cos(a1) * rr2, 0.012, sz + Math.sin(a1) * rr2], sc);
        }
        return 1 - t;
      };
      // one pass per opacity band, so a single uAlpha can serve a whole batch
      const bands = [[], [], []];
      const push = (x, y0, z, r) => {
        const before = a.length, f = drop(x, y0, z, r);
        bands[f > 0.66 ? 0 : f > 0.33 ? 1 : 2].push([before, a.length]);
      };
      if (G.ships) for (const s of G.ships) { if (!s.alive) continue;
        const dx = wdel(s.x - cam.x), dz = wdel(s.y - cam.y);
        if (Math.hypot(dx, dz) < FAR) push(dx, s.alt || 0, dz, CRAFT * 0.62); }
      if (G.props) for (const p of G.props) { if (!(p.alt > 0.05)) continue;
        const dx = wdel(p.x - cam.x), dz = wdel(p.y - cam.y);
        if (Math.hypot(dx, dz) < FAR) push(dx, p.alt, dz, (p.s || 1) * 0.22); }
      if (a.length) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        gl.uniform1f(loc.uEmit, 1);
        const ALPHA = [0.42, 0.26, 0.13];
        bands.forEach((spans, bi) => {
          if (!spans.length) return;
          const buf = [];
          for (const [s0, s1] of spans) for (let i = s0; i < s1; i++) buf.push(a[i]);
          gl.uniform1f(loc.uAlpha, ALPHA[bi]);
          drawArr(buf);
        });
        gl.uniform1f(loc.uAlpha, 1); gl.uniform1f(loc.uEmit, 0);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    }

    /* ── boost gates ────────────────────────────────────────────────────────────────────
     * G.gates has existed since the mode shipped and this renderer never drew it: on the GL
     * path the boost rings were invisible, so the only way to find one was to fly into it.
     *
     * The hitbox is a vertical cylinder — radius 1.4, ±0.9 in altitude — which has no facing,
     * so the ring turns to meet you. A fixed yaw would show an edge-on line from the side
     * while the game still let you fly through it, which is the worse lie. */
    if (G.gates && G.gates.length) {
      const gc = hex('#ffd23b');
      const g = art('gate') ? artGeo('gate', ART.gate, gc)
                            : (geo.gate || (geo.gate = mkvbo(gateVerts(gc))));
      gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo); bindAttribs();
      gl.uniform1f(loc.uEmit, 1);
      for (const gt of G.gates) {
        const dx = wdel(gt.x - cam.x), dz = wdel(gt.y - cam.y);
        if (Math.hypot(dx, dz) > FAR) continue;
        xform(M.mul(M.T(dx, gt.alt || 0, dz), M.Ry(Math.atan2(-dx, -dz))));
        gl.drawArrays(gl.TRIANGLES, 0, g.count);
      }
      gl.uniform1f(loc.uEmit, 0);
      xform(null);
    }

    // ── ships ──
    if (G.ships) {
      for (const s of G.ships) {
        if (!s.alive) continue;
        const dx = wdel(s.x - cam.x), dz = wdel(s.y - cam.y);
        const d = Math.hypot(dx, dz);
        if (d > FAR) continue;
        if (s.isMe && (G.view === 'cockpit')) continue;         // you don't see your own hull
        const key = s.tint + '|' + (s.isMe ? 'me' : 'bot'), col = hex(s.tint);
        // authored hull when models/dogfight.glb has landed, the M1 delta wing until then
        const g1 = art('craft') ? artGeo('craft', ART.craft, col)
                                : (geo[key] || (geo[key] = mkvbo(craftVerts(col, [1, 1, 1]))));
        const g2 = art('pod') ? artGeo('pod', ART.pod, col)
                              : (geo['pod|' + s.tint] || (geo['pod|' + s.tint] = mkvbo(podVerts(col))));
        const mdl = M.mul(M.mul(M.mul(
          M.T(dx, s.alt, dz), M.Ry(-(s.h || 0) + Math.PI / 2)),
          M.Rz(-(s.bank || 0))), M.S(1, 1, 1));
        xform(mdl);
        gl.bindBuffer(gl.ARRAY_BUFFER, g1.vbo); bindAttribs();
        gl.drawArrays(gl.TRIANGLES, 0, g1.count);
        if (s.thrust || s.boost) {                              // engines glow
          gl.uniform1f(loc.uEmit, 1);
          gl.bindBuffer(gl.ARRAY_BUFFER, g2.vbo); bindAttribs();
          gl.drawArrays(gl.TRIANGLES, 0, g2.count);
          gl.uniform1f(loc.uEmit, 0);
        }
      }
      xform(null);
    }

    /* ── the cloud deck: three parallax layers of the FBM shader ─────────────────────────
     * Different lattice repeats (must divide into integer cells — the wrap), thresholds and
     * heights make the stack read volumetric from below, inside and above. Drawn after the
     * opaque world (depth-tested, so a prop pokes through the deck honestly) and BEFORE the
     * additive FX, so tracers and bursts glow through the cloud like lightning in it. */
    if (cloud) {
      gl.useProgram(cloud);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.bindBuffer(gl.ARRAY_BUFFER, cloudBuf);
      gl.enableVertexAttribArray(cloudLoc.aP); gl.vertexAttribPointer(cloudLoc.aP, 2, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(cloudLoc.uMVP, false, new Float32Array(VP));
      gl.uniform2f(cloudLoc.uCam, cam.x, cam.y);
      gl.uniform3f(cloudLoc.uEye, 0, eyeAlt, 0);         // camera-relative space: eye is at x/z 0
      gl.uniform3fv(cloudLoc.uCol, cloudCol); gl.uniform3fv(cloudLoc.uFog, fogC);
      // sun direction from the theme's azimuth, well above the horizon so tops catch it
      const sa = G.sunAz || 0;
      gl.uniform3f(cloudLoc.uSunDir, Math.cos(sa) * 0.55, 0.83, Math.sin(sa) * 0.55);
      gl.uniform1f(cloudLoc.uT, G.t || 0); gl.uniform1f(cloudLoc.uFar, fogFar * 1.35);
      gl.uniform1f(cloudLoc.uWS, WS);
      /* Two slabs, each raymarched through its own thickness. Stacking a thin high sheet over
       * a deep main deck gives parallax between them — the cue that says these are bodies at
       * different distances rather than one painted layer. */
      const slabs = [   // planeY, slabCentre, slabHalfHeight, lattice repeat, threshold, density
        [CLOUD_Y,             CLOUD_Y,             CLOUD_TH,       24, 0.40, 1.35],
        [CLOUD_Y + CLOUD_TH * 1.9, CLOUD_Y + CLOUD_TH * 1.9, CLOUD_TH * 0.5, 40, 0.50, 0.95],
      ];
      for (const [py, sy, sh2, rep, thr, dn] of slabs) {
        gl.uniform1f(cloudLoc.uY, py);
        gl.uniform1f(cloudLoc.uSlabY, sy);
        gl.uniform1f(cloudLoc.uSlabH, sh2);
        gl.uniform1f(cloudLoc.uRep0, rep);
        gl.uniform1f(cloudLoc.uThr, thr);
        gl.uniform1f(cloudLoc.uDens, dn);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      /* One more pass of the same shader, grounded: terrain mottling just over the floor, in
       * the theme's grid hue. The floor was flat black under the lattice — from altitude it
       * now reads as landmass and basin instead of void. A thin slab and uT pinned to 0:
       * clouds drift, continents don't. */
      const gcol = hex(world.grid), gnd2 = hex(world.gnd);
      gl.uniform1f(cloudLoc.uY, 0.02);
      gl.uniform1f(cloudLoc.uSlabY, 0.02); gl.uniform1f(cloudLoc.uSlabH, 0.16);
      gl.uniform1f(cloudLoc.uRep0, 10);
      gl.uniform1f(cloudLoc.uThr, 0.42);
      gl.uniform1f(cloudLoc.uDens, 1.6);
      gl.uniform1f(cloudLoc.uT, 0);
      gl.uniform3fv(cloudLoc.uCol, [gnd2[0] + gcol[0]*0.16, gnd2[1] + gcol[1]*0.16, gnd2[2] + gcol[2]*0.16]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.depthMask(true); gl.disable(gl.BLEND);
      gl.useProgram(prog);
      // re-arm the main program's attribute state after the cloud pass borrowed the slot
      gl.bindBuffer(gl.ARRAY_BUFFER, dyn); bindAttribs();
    }

    // ── bolts + bursts: additive, emissive ──
    gl.uniform1f(loc.uEmit, 1);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
    // camera basis in world space, for billboards — rows of the view rotation
    const camR = [rot[0], rot[4], rot[8]], camU = [rot[1], rot[5], rot[9]];
    /* Tracers, not blips. A real tracer reads as a STREAK because your eye integrates its
     * motion: a hot near-white core at the head and a longer tail in the weapon's colour,
     * fading (additively — colour × factor IS the fade here) toward where the bolt was.
     * Tail length rides bolt speed, so zoomed precision shots draw longer lines. */
    if (G.bolts && G.bolts.length) {
      const a = [];
      for (const b of G.bolts) {
        const dx = wdel(b.x - cam.x), dz = wdel(b.y - cam.y);
        const d = Math.hypot(dx, dz);
        if (d > FAR) continue;
        const ch = Math.cos(b.h || 0), sh2 = Math.sin(b.h || 0);
        const col = hex(b.col || (b.laser ? '#ff2ad9' : '#ffd23b'));
        const bsp = b.sp || 34, Lt = Math.min(3.4, bsp * 0.085), Lc = 0.6;
        const head = [dx, b.alt, dz];
        const dim = f => [col[0]*f, col[1]*f, col[2]*f];
        // tail, two nested widths so it tapers; then the core, pushed toward white
        beam(a, head, [dx - ch*Lt,      b.alt, dz - sh2*Lt],      0.026, dim(0.30));
        beam(a, head, [dx - ch*Lt*0.45, b.alt, dz - sh2*Lt*0.45], 0.045, dim(0.55));
        beam(a, head, [dx - ch*Lc, b.alt, dz - sh2*Lc], 0.06,
             [col[0]*0.4+0.6, col[1]*0.4+0.6, col[2]*0.4+0.6]);
      }
      drawArr(a);
    }
    /* Bursts are camera-facing spark diamonds that DIM as they die. The M1 version was an
     * axis-aligned quad at constant full brightness — a burst that drifted near the camera
     * (their velocities run to ±6/s) filled a third of the screen as a flat lit slab. Facing
     * the camera, fading with life, and capping the subtended size fixes all three. */
    if (G.bursts && G.bursts.length) {
      const a = [];
      for (const b of G.bursts) {
        const dx = wdel(b.x - cam.x), dz = wdel(b.y - cam.y);
        const d = Math.hypot(dx, dz);
        if (d > FAR || d < 0.6) continue;                    // on-camera sparks are just flash
        const life = Math.max(0, Math.min(1, b.life));
        let r = 0.09 + (1 - life) * 0.20;
        r *= Math.min(1, d / 3.5);                           // cap what a near spark subtends
        const c = hex(b.col || '#ff2a6d'), f = life * life;  // ease-out — sparks die fast
        const col = [c[0]*f, c[1]*f, c[2]*f];
        const cx = [dx, b.alt, dz];
        const px = [cx[0]+camR[0]*r, cx[1]+camR[1]*r, cx[2]+camR[2]*r];
        const mx = [cx[0]-camR[0]*r, cx[1]-camR[1]*r, cx[2]-camR[2]*r];
        const py = [cx[0]+camU[0]*r*1.4, cx[1]+camU[1]*r*1.4, cx[2]+camU[2]*r*1.4];
        const my = [cx[0]-camU[0]*r*1.4, cx[1]-camU[1]*r*1.4, cx[2]-camU[2]*r*1.4];
        quad(a, mx, my, px, py, col);                        // diamond, tall — an ember, not a tile
      }
      drawArr(a);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
    gl.uniform1f(loc.uEmit, 0);

    if (composited) post.end();
    return true;
  }

  // `arts` is for headless checks: which authored parts actually landed (null = procedural)
  return { init, frame, supported: () => ok, post: () => post,
           arts: () => ART && Object.keys(ART) };
})();

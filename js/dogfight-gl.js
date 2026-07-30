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

  const VS = 'attribute vec3 aPos; attribute vec3 aNorm; attribute vec3 aCol;' +
    'uniform mat4 uMVP; varying vec3 vN; varying vec3 vC; varying float vD;' +
    'void main(){ vN=aNorm; vC=aCol; vec4 p=uMVP*vec4(aPos,1.0); vD=p.w; gl_Position=p; }';
  const FS = 'precision mediump float; varying vec3 vN; varying vec3 vC; varying float vD;' +
    'uniform vec3 uLight; uniform vec3 uFog; uniform vec2 uFogND; uniform float uEmit;' +
    'void main(){' +
    ' vec3 c;' +
    ' if(uEmit>0.5){ c=vC; }' +                                  // grid, bolts, anything glowing
    ' else { float d=max(0.0,dot(normalize(vN),normalize(uLight)));' +
    '        c=vC*(0.34+0.78*d); }' +
    ' float fg=clamp((vD-uFogND.x)/(uFogND.y-uFogND.x),0.0,1.0);' +
    ' gl_FragColor=vec4(mix(c,uFog,fg*0.92),1.0); }';

  // sky: the theme's two-stop gradient plus a sun disc, in one fullscreen pass
  const SKY_VS = 'attribute vec2 aP; varying vec2 uv; void main(){ uv=aP; gl_Position=vec4(aP,0.999,1.0); }';
  const SKY_FS = 'precision mediump float; varying vec2 uv;' +
    'uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uSun; uniform vec2 uSunPos;' +
    'uniform float uAsp; uniform float uRoll;' +
    'void main(){' +
    ' float c=cos(uRoll), s=sin(uRoll);' +
    ' vec2 p=vec2(uv.x*c-uv.y*s, uv.x*s+uv.y*c);' +             // sky banks with the craft
    ' float t=clamp(p.y*0.5+0.5,0.0,1.0);' +
    ' vec3 col=mix(uBot,uTop,t);' +
    ' vec2 d=vec2((p.x-uSunPos.x)*uAsp, p.y-uSunPos.y);' +
    ' float r=length(d);' +
    ' col+=uSun*smoothstep(0.30,0.0,r)*0.9;' +                   // disc
    ' col+=uSun*smoothstep(0.95,0.0,r)*0.16;' +                  // haze
    ' gl_FragColor=vec4(col,1.0); }';

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
  function mkvbo(arr) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    return { vbo: b, count: arr.length / STRIDE }; }

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

  function init(canvas) {
    try {
      cv = canvas;
      gl = cv.getContext('webgl', { antialias: true, alpha: false, depth: true })
        || cv.getContext('experimental-webgl');
      if (!gl) return false;
      prog = link(VS, FS); sky = link(SKY_VS, SKY_FS);
      ['aPos','aNorm','aCol'].forEach(n => loc[n] = gl.getAttribLocation(prog, n));
      ['uMVP','uLight','uFog','uFogND','uEmit'].forEach(n => loc[n] = gl.getUniformLocation(prog, n));
      skyLoc.aP = gl.getAttribLocation(sky, 'aP');
      ['uTop','uBot','uSun','uSunPos','uAsp','uRoll'].forEach(n => skyLoc[n] = gl.getUniformLocation(sky, n));
      dyn = gl.createBuffer();
      skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      try { post = window.GfxPost ? GfxPost.create(gl, cv, GfxPost.PRESET.neon) : null; } catch (e) { post = null; }
      ok = true; return true;
    } catch (e) { ok = false; return false; }
  }

  /** o = { WS, CAM_BACK, CAM_H, VIEW_FAR } — the game's own constants, passed in rather than
   *  duplicated here, so tuning them in dogfight.html cannot desync the renderer. */
  function frame(G, cam, world, o) {
    if (!ok) return false;
    const WS = o.WS, FAR = o.VIEW_FAR || 34;
    const w = cv.width, h = cv.height, asp = w / h;
    const composited = post && post.begin();
    if (!composited) gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ── sky ──
    const top = hex(world.sky[0]), bot = hex(world.sky[1]), sunC = hex(world.sun);
    gl.useProgram(sky); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.enableVertexAttribArray(skyLoc.aP); gl.vertexAttribPointer(skyLoc.aP, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(skyLoc.uTop, top); gl.uniform3fv(skyLoc.uBot, bot); gl.uniform3fv(skyLoc.uSun, sunC);
    // the sun sits on the heading, so turning sweeps it across the sky
    const sunRel = Math.sin((G.sunAz || 0) - cam.h);
    gl.uniform2f(skyLoc.uSunPos, Math.max(-1.4, Math.min(1.4, sunRel * 1.3)), 0.12 - cam.ph * 0.8);
    gl.uniform1f(skyLoc.uAsp, asp); gl.uniform1f(skyLoc.uRoll, cam.roll || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);

    // ── camera: behind and above the craft, banking with roll ──
    const eyeY = (o.CAM_H || 1.2) + (cam.alt || 0);
    /* View = pullback ∘ inverseOrientation ∘ translateWorld. The pull-back has to be applied
     * in CAMERA space (after the rotation), or the chase offset points along world Z instead
     * of along the craft's own backward axis — which looks fine dead ahead and drifts wrong
     * the moment you turn. */
    const rot = M.mul(M.mul(M.Rz(-(cam.roll || 0)), M.Rx(-(cam.ph || 0))), M.Ry(cam.h || 0));
    const view = M.mul(M.T(0, 0, -(o.CAM_BACK || 2.4)), M.mul(rot, M.T(0, -eyeY, 0)));
    // world is placed camera-relative, which also hides the toroidal seam for free
    const P = M.persp(1.05, asp, 0.1, FAR * 1.6);
    const VP = M.mul(P, view);

    gl.useProgram(prog);
    gl.uniform3fv(loc.uLight, [0.4, 0.85, 0.3]);
    gl.uniform3fv(loc.uFog, hex(world.fog));
    gl.uniform2f(loc.uFogND, FAR * 0.30, FAR);
    gl.uniformMatrix4fv(loc.uMVP, false, new Float32Array(VP));

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

    // ── props (pylons / rings / spires / towers) ──
    if (G.props && G.props.length) {
      const a = [], pc = hex(world.grid);
      for (const p of G.props) {
        const dx = wdel(p.x - cam.x), dz = wdel(p.y - cam.y);
        if (Math.hypot(dx, dz) > FAR) continue;
        const hgt = p.h || 2.2, r = p.r || 0.18;
        quad(a, [dx-r,0,dz-r],[dx+r,0,dz-r],[dx+r,hgt,dz-r],[dx-r,hgt,dz-r], pc);
        quad(a, [dx-r,0,dz+r],[dx+r,0,dz+r],[dx+r,hgt,dz+r],[dx-r,hgt,dz+r], pc);
        quad(a, [dx-r,0,dz-r],[dx-r,0,dz+r],[dx-r,hgt,dz+r],[dx-r,hgt,dz-r], pc);
        quad(a, [dx+r,0,dz-r],[dx+r,0,dz+r],[dx+r,hgt,dz+r],[dx+r,hgt,dz-r], pc);
      }
      drawArr(a);
    }

    // ── ships ──
    if (G.ships) {
      for (const s of G.ships) {
        if (!s.alive) continue;
        const dx = wdel(s.x - cam.x), dz = wdel(s.y - cam.y);
        const d = Math.hypot(dx, dz);
        if (d > FAR) continue;
        if (s.isMe && (G.view === 'cockpit')) continue;         // you don't see your own hull
        const key = s.tint + '|' + (s.isMe ? 'me' : 'bot');
        if (!geo[key]) geo[key] = mkvbo(craftVerts(hex(s.tint), [1, 1, 1]));
        if (!geo['pod|' + s.tint]) geo['pod|' + s.tint] = mkvbo(podVerts(hex(s.tint)));
        const mdl = M.mul(M.mul(M.mul(
          M.T(dx, s.alt, dz), M.Ry(-(s.h || 0) + Math.PI / 2)),
          M.Rz(-(s.bank || 0))), M.S(1, 1, 1));
        gl.uniformMatrix4fv(loc.uMVP, false, new Float32Array(M.mul(VP, mdl)));
        const g1 = geo[key];
        gl.bindBuffer(gl.ARRAY_BUFFER, g1.vbo); bindAttribs();
        gl.drawArrays(gl.TRIANGLES, 0, g1.count);
        if (s.thrust || s.boost) {                              // engines glow
          gl.uniform1f(loc.uEmit, 1);
          const g2 = geo['pod|' + s.tint];
          gl.bindBuffer(gl.ARRAY_BUFFER, g2.vbo); bindAttribs();
          gl.drawArrays(gl.TRIANGLES, 0, g2.count);
          gl.uniform1f(loc.uEmit, 0);
        }
      }
      gl.uniformMatrix4fv(loc.uMVP, false, new Float32Array(VP));
    }

    // ── bolts + bursts: additive, emissive ──
    gl.uniform1f(loc.uEmit, 1);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
    if (G.bolts && G.bolts.length) {
      const a = [];
      for (const b of G.bolts) {
        const dx = wdel(b.x - cam.x), dz = wdel(b.y - cam.y);
        if (Math.hypot(dx, dz) > FAR) continue;
        const ch = Math.cos(b.h || 0), sh2 = Math.sin(b.h || 0), L = 0.9;
        beam(a, [dx, b.alt, dz], [dx + ch*L, b.alt, dz + sh2*L], 0.045, hex(b.col || '#ffd23b'));
      }
      drawArr(a);
    }
    if (G.bursts && G.bursts.length) {
      const a = [];
      for (const b of G.bursts) {
        const dx = wdel(b.x - cam.x), dz = wdel(b.y - cam.y);
        if (Math.hypot(dx, dz) > FAR) continue;
        // bursts carry `life` (1 -> 0), no radius: bloom outward as they fade
        const r = 0.10 + (1 - Math.max(0, Math.min(1, b.life))) * 0.26, c = hex(b.col || '#ff2a6d');
        quad(a, [dx-r,b.alt-r,dz],[dx+r,b.alt-r,dz],[dx+r,b.alt+r,dz],[dx-r,b.alt+r,dz], c);
      }
      drawArr(a);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
    gl.uniform1f(loc.uEmit, 0);

    if (composited) post.end();
    return true;
  }

  return { init, frame, supported: () => ok, post: () => post };
})();

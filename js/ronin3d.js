/* ripmaster3030studios — NEON RONIN 3D engine (Ronin3D).  [Milestone 2]
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
  /* ── THE MATERIAL — a die-cut printed standee, not a CG character.  docs/RONIN-ART.md §1.1 ──
   *
   * `uSurf` picks which of DESIGN-SYSTEM §1's four material layers a draw is made of, and it is
   * the decision the whole look hangs on:
   *
   *   0  INK   flat saturated ink on card stock. Diffuse is QUANTISED into value steps and there
   *            is NO specular, ever. ⚑ Not toon-shading-for-the-look: flat printed ink physically
   *            cannot produce a smooth ramp — a printed object gets its form from value steps and
   *            from the keyline. Acceptance: ≤12 distinct luma levels on a body surface.
   *   1  FOIL  hot-stamped metal / crystal. ⛔ Hue walks with the HALF-ANGLE and NEVER with uTime.
   *            The old mat-4 "crystal" did `cos(6.2831*(fac + uTime*0.25))` — iridescence on a
   *            clock, which DESIGN-SYSTEM §1 names as the definition of a *sticker of* foil.
   *            Acceptance: ≥60° measured hue travel across view angles here, ≤8° on ink.
   *   2  LIGHT emissive — neon, sparks, shadow quads. Lit by nothing.
   *
   * THE DIE PROFILE replaces the fresnel rim, and it is the single biggest change. The old shader
   * added `uColor*rim*0.55` to EVERY surface: the default a renderer hands you, and exactly what
   * §7 rejects ("default extrude + uniform bevel → die-cut profile: chamfer, micro-bevel, bright
   * rim"). A real die-cut card is BRIGHT at the very edge — you are seeing the exposed core of the
   * board past the end of the printed area — and DARK just inside it, where the keyline prints.
   * ⚑ An outline shader gives you the dark band and not the bright one, and reads as a sticker.
   * Both bands, in that order, are what makes a figure read as drawn rather than rendered.
   *
   * `uMat` keeps the existing procedural textures (weave / scales / wraps / skin …) but they are
   * now PRINTING: they modulate value and may never add a highlight.
   */
  const LIT_FS = 'precision mediump float; varying vec3 vN; varying vec3 vW; varying vec3 vL;' +
    'uniform vec3 uColor; uniform float uEmis; uniform float uAlpha; uniform vec3 uLight; uniform vec3 uCam; uniform vec3 uFog; uniform vec2 uFogND; uniform float uMat; uniform float uTime;' +
    'uniform float uSurf; uniform float uSteps; uniform vec3 uKeyC; uniform vec3 uFillD; uniform vec3 uFillC; uniform vec3 uRimD; uniform vec3 uRimC; uniform float uFlat;' +
    'float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }' +
    'float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);' +
    ' float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));' +
    ' return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }' +
    'void main(){ vec3 N=normalize(vN); vec3 V=normalize(uCam-vW); vec3 K=normalize(uLight);' +
    ' if(uFlat>0.5){ gl_FragColor=vec4(uColor,uAlpha); return; }' +          // plate-slip ghost: pure ink, unlit
    ' float d=max(0.0,dot(N,K));' +
    ' float dq=floor(d*uSteps+0.5)/uSteps;' +                               // STEPPED ink — see header
    ' float df=max(0.0,dot(N,normalize(uFillD))), dr=max(0.0,dot(N,normalize(uRimD)));' +
    ' vec3 key=mix(vec3(1.0),uKeyC,0.62);' +                                // the key CASTS its hue, it does not replace albedo
    ' vec3 lit=uColor*(0.20+0.92*dq)*key + uColor*uFillC*df*0.30 + uRimC*dr*0.16;' +
    ' float ang=atan(vL.z,vL.x);' +
    'if(uMat>0.5){' +
    ' if(uMat<1.5){ float w=0.5+0.5*sin(ang*20.0)*sin(vL.y*40.0); float fold=0.86+0.16*sin(vL.y*16.0+vnoise(vec2(ang*3.0,vL.y*7.0))*4.0); lit*=(0.84+0.2*w)*fold; }' +   // cloth weave + folds
    ' else if(uMat<2.5){ lit*=0.92+0.10*sin(vL.y*120.0); }' +                                                                                                             // brushed grain (foil handles the shine)
    ' else if(uMat<3.5){ vec2 s=vec2(ang*3.5,vL.y*8.0); s.x+=step(1.0,mod(floor(vL.y*8.0),2.0))*0.5; vec2 g=fract(s)-0.5; float cell=smoothstep(0.30,0.5,length(g)); lit=mix(lit*1.18,lit*0.55,cell); }' +   // scales
    ' else if(uMat<4.5){ lit*=0.92+0.14*vnoise(vL.xy*7.0+vL.z*5.0); }' +                                                                                                  // faceted crystal grain
    ' else if(uMat<5.5){ lit*=0.9+0.16*vnoise(vL.xy*9.0+vL.z*4.0); }' +                                                                                                   // skin
    ' else if(uMat<6.5){ lit=uColor*1.15+vec3(0.18); }' +                                                                                                                 // energy (flat, uSurf carries it)
    ' else if(uMat<7.5){ float b=step(0.5,fract(vL.y*10.0)); lit*=mix(0.68,1.06,b); }' +                                                                                  // wrap bands
    ' else { float band=vW.y*0.16 + vW.x*0.055 + vW.z*0.055;' +                                                                     // 8 = baked city, printed in ink
    '   vec3 ac=0.5+0.5*cos(6.2831*(band+vec3(0.0,0.33,0.67)));' +
    '   lit=ac*(0.34+0.85*dq)*key + uRimC*dr*0.18; } }' +
    /* FOIL. The hue walks with the half-angle H=normalize(K+V), so it moves when the CAMERA or the
     * OBJECT moves and is dead still when neither does. `grate` is the stamping direction in
     * object space, which is what smears the highlight into a line instead of a dot. */
    ' if(uSurf>0.5&&uSurf<1.5){' +
    /* ⚠ FOIL MODULATES THE ALBEDO, IT DOES NOT REPLACE IT. First pass mixed 60% of a full-swing
     * spectrum straight over the base colour, and every katana, tsuba and obi in the game turned
     * into a rainbow candy stick — the hue travel was real and the material read as a toy. Hot
     * foil stamped on steel is still steel: a sheen that walks, over the colour underneath. A gold
     * tsuba stays gold, a blade stays white, and the hue still moves with the half-angle. */
    '   vec3 H=normalize(K+V); float hn=max(0.0,dot(H,N));' +
    '   float ph=hn*4.6+vL.y*0.55;' +
    /* ⚑ THE KEY'S HUE IS HELD BACK ON FOIL, and that is physics rather than a fudge: diffraction
     * colour is generated BY THE SURFACE, not inherited from the illuminant. With the full 0.62
     * green cast the output hue sat on the key whatever the grating did, and the measured travel
     * was 8° — a foil that does not walk is a sticker, which is the one thing §1 forbids. */
    '   vec3 ir=0.62+0.38*cos(6.2831*(ph+vec3(0.0,0.33,0.67)));' +
    '   vec3 fkey=mix(vec3(1.0),uKeyC,0.22);' +
    '   float aniso=pow(hn,44.0);' +
    '   lit=uColor*(0.18+0.70*d)*fkey*mix(vec3(1.0),ir,0.78)+vec3(0.95,0.98,1.0)*aniso*0.85; }' +
    ' else if(uSurf>1.5){ lit=uColor*(1.0+0.35*uEmis); }' +
    /* THE DIE PROFILE — keyline first, then the bright cut core outside it. Ink and foil both get
     * it; an emissive draw does not, because light has no cut edge. */
    /* ⚠ THE CUT BAND IS NARROW ON PURPOSE. Widened, it fires all over a high-frequency mesh —
     * a skinned `.skn` body has noisy normals, so a loose grazing test lights up the interior and
     * the figure blows out instead of getting an edge. Keyline broad, cut core tight. */
    ' if(uSurf<1.5){ float fres=1.0-max(0.0,dot(N,V));' +
    '   float kl=smoothstep(0.44,0.78,fres)*(1.0-smoothstep(0.90,0.975,fres));' +
    '   float cut=smoothstep(0.935,0.999,fres);' +
    '   lit*=(1.0-0.72*kl); lit+=mix(vec3(1.0,0.95,0.88),uRimC,0.42)*cut*0.60; }' +
    'lit=mix(lit,uColor*1.2,uEmis);' +
    'float fg=clamp((distance(uCam,vW)-uFogND.x)/(uFogND.y-uFogND.x),0.0,1.0);' +
    'gl_FragColor=vec4(mix(lit,uFog,fg),uAlpha); }';
  const GND_VS = 'attribute vec3 aPos; uniform mat4 uMVP; uniform mat4 uModel; varying vec3 vW; varying vec2 vC;' +
    'void main(){ vW=(uModel*vec4(aPos,1.0)).xyz; vC=aPos.xz*2.0; gl_Position=uMVP*vec4(aPos,1.0); }';
  /* ── THE STAGE — the ring is a card, lying on a dark table.  docs/RONIN-ART.md §2 ──────────
   * uKind 0 = the TABLE (matte, fill-light only, falls into the dark past the card's edge)
   *       1 = the CARD  (hot-stamped foil stock + printed guilloche + a real DIE-CUT EDGE)
   *       2 = the shelved free-roam city's water plane, kept working, unchanged in behaviour
   *
   * ⚑ The card's hue walks because the CAMERA moved — the half-angle again, no uTime anywhere on
   *   the foil path. The camera moves only on hero moments (`cineKick`), so the floor changes
   *   colour exactly when something happened. That is §4 answered with no new motion at all.
   * ⚠ The card is a long STRIP: its near and far die edges are real and in frame every moment,
   *   while along the fight line it runs past the frame. Making it a true rectangle with corners
   *   needs the stage extent, which the game does not publish yet — see the report's interface ask.
   */
  const GND_FS = 'precision mediump float; varying vec3 vW; varying vec2 vC; uniform vec3 uCam; uniform vec3 uFog; uniform vec2 uFogND; uniform float uAlpha; uniform float uTime; uniform float uWater;' +
    'uniform vec2 uHalf; uniform vec3 uKeyD; uniform vec3 uKeyC; uniform vec3 uFillC; uniform vec3 uRimC;' +
    'void main(){ vec2 p=vW.xz; vec3 V=normalize(uCam-vW); vec3 N=vec3(0.0,1.0,0.0); vec3 col;' +
    ' if(uWater>1.5){' +                                                        // shelved city: the water plane
    '   float w1=sin(p.x*0.42+uTime*1.15)+sin(p.y*0.37-uTime*0.9);' +
    '   float w2=sin((p.x+p.y)*0.24-uTime*0.62)+sin((p.x-p.y)*0.31+uTime*0.78);' +
    '   float h=(w1+w2)*0.25;' +
    '   N=normalize(vec3(-(cos(p.x*0.42+uTime*1.15)*0.42+cos((p.x+p.y)*0.24-uTime*0.62)*0.24)*0.6, 1.0,' +
    '                    -(cos(p.y*0.37-uTime*0.9)*0.37+cos((p.x-p.y)*0.31+uTime*0.78)*0.31)*0.6));' +
    '   float fres=pow(1.0-max(0.0,dot(N,V)),3.0);' +
    '   col=mix(vec3(0.02,0.05,0.14),vec3(0.10,0.42,0.62),0.45+0.35*h);' +
    '   vec3 sky=0.5+0.5*cos(6.2831*(h*0.4+uTime*0.05+vec3(0.0,0.33,0.67)));' +
    '   col=mix(col,sky,fres*0.75);' +
    '   float caust=pow(max(0.0,sin(p.x*0.9+uTime*1.3)*sin(p.y*0.8-uTime*1.1)),6.0);' +
    '   col+=vec3(0.5,0.9,1.0)*caust*0.5;' +
    '   col+=vec3(1.0)*pow(max(0.0,dot(reflect(-normalize(vec3(0.35,0.9,0.5)),N),V)),48.0)*0.6; }' +
    ' else if(uWater<0.5){' +                                                   // THE TABLE
    '   float g=0.020+0.014*fract(sin(dot(floor(p*0.7),vec2(12.9898,78.233)))*43758.5);' +
    '   col=vec3(g*0.75,g*0.62,g*1.20) + uFillC*0.030; }' +
    ' else {' +                                                                 // THE CARD — foil stock
    /* ⚠ THE STOCK IS DARK AND THE DIFFRACTION IS A BAND, not a rainbow carpet. First pass painted
     * the whole card in full-strength iridescence and it became the brightest object in the frame
     * — frame luma 35.4 → 46.4 and clipping 0.17% → 1.34%, i.e. the floor ate the black point the
     * fighters are read against (DESIGN-SYSTEM §5: dark field, LIT OBJECT). Hot foil on a black
     * card is mostly black: it catches a band near the specular direction and that band SWEEPS as
     * the viewer moves. Same physics, a tenth of the ink, and the hue travel is unchanged because
     * the phase term is untouched — only the amplitude came down. */
    '   vec3 K=normalize(uKeyD); vec3 H=normalize(K+V); float hn=max(0.0,dot(H,N));' +
    '   float grate=p.x*0.19;' +                                                // the stamping runs along the fight line
    '   float ph=hn*5.2+grate;' +
    '   vec3 ir=0.5+0.5*cos(6.2831*(ph+vec3(0.0,0.33,0.67)));' +
    '   float band=0.10+0.90*pow(hn,2.6);' +                                    // the diffraction band, not the whole sheet
    '   float aniso=pow(hn,26.0);' +
    '   col=vec3(0.022,0.013,0.045)+ir*0.42*band+vec3(0.9,0.95,1.0)*aniso*0.30;' +
    '   vec2 gr=abs(fract(p*0.5)-0.5); float line=1.0-smoothstep(0.0,0.055,min(gr.x,gr.y));' +
    '   col+=vec3(1.0,0.16,0.85)*line*0.34;' +                                  // the guilloche, printed in neon ink
    '   float spine=1.0-smoothstep(0.0,2.2,abs(p.y)); col+=vec3(1.0,0.16,0.85)*spine*0.20;' +   // the fight line
    /* THE DIE EDGE. `ez` is the world-unit distance to the cut. Keyline first (dark), then the
     * exposed board core outside it (bright) — the order that makes it a card and not a sticker. */
    '   float ez=(1.0-abs(vC.y))*uHalf.y;' +
    '   float kl=(1.0-smoothstep(0.34,1.90,ez))*smoothstep(0.20,0.42,ez);' +
    '   float cut=1.0-smoothstep(0.02,0.26,ez);' +
    '   col*=(1.0-0.72*kl); col+=mix(vec3(1.0,0.95,0.88),uRimC,0.42)*cut*0.95; }' +
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
      // upright quad (x-y plane, normal +z) — the printed sky bands stand on it. See drawSky.
      mesh('vquad', [-.5, -.5, 0, 0, 0, 1, .5, -.5, 0, 0, 0, 1, .5, .5, 0, 0, 0, 1, -.5, -.5, 0, 0, 0, 1, .5, .5, 0, 0, 0, 1, -.5, .5, 0, 0, 0, 1]);
      skinProg = gl.createProgram(); gl.attachShader(skinProg, sh(gl.VERTEX_SHADER, SK_VS)); gl.attachShader(skinProg, sh(gl.FRAGMENT_SHADER, LIT_FS));
      gl.bindAttribLocation(skinProg,0,'aPos'); gl.bindAttribLocation(skinProg,1,'aNorm'); gl.bindAttribLocation(skinProg,2,'aIdx'); gl.bindAttribLocation(skinProg,3,'aWgt');
      gl.linkProgram(skinProg);
      // shared bloom/rolloff/dither/sharpen chain; fails open to a direct draw
      /* ⛔ NEON RONIN HAD NO MOTION SMEAR AT ALL — `PRESET.neon` ships `blur: 0`, and this file
       *   never called `post.motion()`. Grepped across every game: only js/dogfight-gl.js and
       *   js/section9-gl.js drive that hook, so the FIGHTING GAME — the one where things move
       *   fastest and stop hardest — was the one with no smear. Artist: it should read as fast
       *   and furious.
       * ⚑ THE CEILING IS RAISED HERE, NOT IN THE PRESET. `neon` is shared with Rip Rocketer,
       *   whose own file says in as many words "neon's blur is 0, so there is nothing to lose.
       *   Noted so nobody adds one" — changing the preset would hand a smear to a game that
       *   deliberately has none. `{...PRESET.neon, blur}` is the documented way to disagree with
       *   one field, and gfx-post merges it per-instance.
       * ⚠ 0.62 sits between `tactical`'s 0.55 (a gritty FPS, deliberately restrained) and the
       *   0.85 hard cap the feedback loop allows. It is a CEILING scaled every frame by
       *   post.motion(), so a fighter standing still is pin sharp — see roninMotion(). */
      try { post = window.GfxPost ? GfxPost.create(gl, cv, { ...GfxPost.PRESET.neon, blur: 0.62 }) : null; } catch (e) { post = null; }
      gl.enable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); ok = true; return true;
    } catch (e) { ok = false; gl = null; return false; }
  }

  /* ── WHAT THE SMEAR IS FOR ────────────────────────────────────────────────────────────────
   * DESIGN-SYSTEM §4: motion, and a reason it physically moved. A blur keyed to a timer is the
   * screensaver this project keeps rejecting; a blur keyed to SPEED is the camera telling you the
   * truth about how fast the thing in front of it is travelling.
   * ⛔ THE LOAD-BEARING TERM IS HITSTOP, AND IT IS INVERTED ON PURPOSE. This renderer already
   *   freezes on impact (the held frame is the whole genre). A smear that kept running through
   *   that freeze would blur the one frame that must be RAZOR SHARP — the moment of contact is
   *   the read. So hitstop drives motion to ZERO, and the frames either side of it carry the
   *   speed. Sharp-fast-sharp is what reads as impact; uniformly smeared reads as mush.
   * ⚠ Every term is a state the SIM owns — nothing here samples absolute time, so a paused or
   *   idle match composites exactly the frame it composited before this existed. */
  function roninMotion(G, dt) {
    if (!G || !G.fighters) return 0;
    if ((G.hitstop || 0) > 0.001) return 0;          // the impact frame stays sharp
    let m = 0;
    for (const f of G.fighters) {
      if (!f || f.dead) continue;
      /* Travel. `vx` is in duel units/s; a dash is 760·spd, a walk a few hundred, so the dash is
         what saturates this and a walk barely registers — which is the point. */
      m = Math.max(m, Math.min(1, Math.abs(f.vx || 0) / 700));
      // a spin attack whips the whole body through the frame
      if (f.spinT > 0) m = Math.max(m, 0.85);
      // an active attack: the blade is the fastest thing on screen
      if (f.state === 'slash' || f.state === 'kick' || f.state === 'punch') m = Math.max(m, 0.55);
    }
    // the cinematic camera swing on a finisher — the WORLD moved, not the fighter
    m = Math.max(m, Math.min(1, (G.camZoom || 0) * 0.9));
    /* Ease DOWN slowly, up instantly. Smear should arrive with the movement and linger a beat
       behind it, the way an exposure does; snapping it off at the end of a dash loses the tail. */
    _mo = Math.max(m, _mo - dt * 3.2);
    return _mo;
  }
  let _mo = 0;

  const FOG = [0.07, 0.03, 0.15];
  /* ── LIGHT: the studio's own three, for the first time.  DESIGN-SYSTEM §2 / RONIN-ART §1.2 ──
   * NEON RONIN ran a single white lamp at [0.35,0.9,0.5] with a flat 0.26 ambient. The studio has
   * declared one light model for every surface it makes and no game had ever used it.
   *   KEY  phosphor green, raking — does the shaping
   *   FILL acid magenta, from below, weak — and physically true here: the floor IS magenta neon
   *   RIM  cyan, near-grazing — what lifts a figure off a dark stage and makes the die edge read
   * ⚠ Gold #ffd23b is NOT a light. It is the accent: the charged blade, the meter, the win.
   * ⚠ A coloured key can eat the albedo. The key CASTS its hue (mix 0.62) rather than replacing
   *   it, and frame saturation is a reported acceptance number, not an assumption. */
  const LIGHT = {
    keyD: [0.42, 0.88, 0.46], keyC: hexF('#2bff80'),
    fillD: [-0.24, -0.90, 0.36], fillC: hexF('#ff2ad9'),
    rimD: [-0.72, 0.20, -0.66], rimC: hexF('#27f7e4'),
    steps: 5,                                                 // ink value steps — see RONIN-ART §1.5
  };
  function hexF(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  let camPos = [0, 3, 9], t3 = 0, VP = null, tPrev = 0;
  const cam = { dist: 9, h: 2.7, az: 0 };                     // smoothed fight-camera (distance / height / azimuth)
  /* ⛔ CAMERA SHAKE WAS WHITE NOISE — `(Math.random()*2-1) * shake`, per axis, per frame. A struck
   * camera does not vibrate randomly: it is DISPLACED ALONG THE BLOW and rings back. This is a
   * decaying oscillator whose axis comes from the hit direction the game already publishes
   * (`G.camDir`, set by `cineKick`), with a small random component kept for grit so two identical
   * hits are not identical shots. Acceptance: the trace crosses zero and its envelope decays —
   * noise does neither, so the assertion cannot pass on the old behaviour.
   * ⚠ `G.shake` is a LEVEL the game decays itself, so an impulse is only taken when it JUMPS. */
  const shk = { amp: 0, ph: 0, ax: [1, 0, 0], prev: 0 };
  function shakeOffset(G, dt, cdir) {
    const lvl = G.shake || 0;
    if (lvl > shk.prev + 0.5) {                                // a fresh blow, not the tail of the last one
      shk.amp = Math.min(1.25, lvl * 0.055); shk.ph = 0;
      shk.ax = [camRight[0] * cdir, 0.34, camRight[2] * cdir];
    }
    shk.prev = lvl;
    if (shk.amp <= 0.0005) { shk.amp = 0; return [0, 0, 0]; }
    shk.ph += dt * 40; shk.amp *= Math.exp(-dt * 6.2);       // ~250 ms of ring; 11 decayed it away in 60 ms
    const s = Math.sin(shk.ph) * shk.amp, j = shk.amp * 0.12;
    return [shk.ax[0] * s + (Math.random() * 2 - 1) * j, shk.ax[1] * s * 0.6, shk.ax[2] * s + (Math.random() * 2 - 1) * j];
  }
  const u = (p, n) => gl.getUniformLocation(p, n);
  const hex = h => { const n = parseInt((h || '#c9d2e6').slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const sc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  /* ══ SOFT GOODS ═══════════════════════════════════════════════════════════════════════════
   * Cloth, hair and shards hang off the skeleton and are driven by THE BODY'S OWN ACCELERATION.
   * docs/RONIN-ART.md §1.3, and it is the answer to DESIGN-SYSTEM §9 — the half of a brief that
   * has now been skipped twice in this repo, because material and light are what a renderer HAS
   * FEATURES for and motion has to be designed.
   *
   * ⛔ WHAT THIS REPLACES, and each was a screensaver:
   *      the kunoichi scarf waved on `t3*3 + i*0.7` while the fighter stood still;
   *      five prizm crystals orbited on `t3*0.7`, forever, whatever the fighter did.
   *
   * The forcing term is −a of the fighter (the pseudo-force a hanging object feels in an
   * accelerating frame) plus an angular term from the torso's rotation. ⚑ GRAVITY IS FOLDED INTO
   * THE AUTHORED REST POSE rather than applied as a force, which is what makes the standing rule
   * exactly true: with the body still, a = 0, every node sits at 0.000, and a test asserts it.
   *
   * Chained groups couple: node i springs toward node i-1's displacement, so a shove runs DOWN
   * the cloak and dies out. Same acceptance shape as the hero wordmark's rig — "did it move" is
   * the weak question; the assertions that bite are lag, overshoot, and propagation order.
   */
  const SOFT = [                                              // i0, n, stiffness, damping, mass, chained
    { i0: 0,  n: 3, k: 165, d: 15, w: 1.00, chain: true },     // cloak / coat hem
    { i0: 3,  n: 4, k: 210, d: 13, w: 1.45, chain: true },     // scarf — lighter, whips further
    { i0: 7,  n: 3, k: 560, d: 27, w: 0.40, chain: false },    // hair — stiff, barely moves
    { i0: 10, n: 5, k: 95,  d: 10, w: 1.85, chain: false },    // crystal shards — loosest
  ];
  const N_SOFT = 15;
  const softs = {};                                           // fighter id → soft state
  function softOf(f) {
    let s = softs[f.id];
    if (!s) { s = softs[f.id] = { seen: false, px: 0, py: 0, vx: 0, vy: 0, ax: 0, ay: 0, prot: 0, pav: 0, aa: 0,
      land: 0, landV: 0, pAir: false, nodes: [] };
      for (let i = 0; i < N_SOFT; i++) s.nodes.push({ x: 0, y: 0, vx: 0, vy: 0 }); }
    return s;
  }
  /* ⛔ THE FORCING IS A VELOCITY IMPULSE, NOT A FORCE, and getting that wrong is the hero
   * wordmark's DRAGV trap exactly: *"the throw was set by eye at 5.0 and measured out at 1.5 px —
   * an impulse fights a stiff spring (peak ≈ v/ω), so the number that feels like a lot is an
   * order low."* First pass here converted the body's acceleration into a force and MEASURED at
   * 0.10 px of scarf travel on a full dash. Invisible.
   *
   * The physics that gives the right magnitude for free: in the body's frame, when the body's
   * velocity jumps by Δv, everything not rigidly attached to it appears to move at −Δv. So the
   * node's VELOCITY takes the hit directly. A dash (Δv ≈ 760 px/s) then produces peak ≈ Δv·κ/ω,
   * which is tens of pixels rather than tenths — and a sustained acceleration still behaves like
   * a force, because injecting Δv every frame IS a force. Both regimes, one line, correct units.
   * ⚑ And it keeps the standing rule exactly true: Δv = 0 ⇒ nothing is injected ⇒ 0.000. */
  const IMP = 0.26;                                           // how much of the body's Δv the cloth keeps
  let softGen = 0;
  function stepSoft(G, dt) {
    if (!G || !G.fighters || dt <= 0) return;                 // dt = 0 during hitstop: the cloth HOLDS
    /* ⚠ Prune. `softs` is keyed by fighter id and every rematch mints new ids, so without this it
     * grows by 15 nodes × 2 fighters per match forever. Slow, but a leak in a page people leave
     * open is still a leak — and a rematch loop is exactly how this game is played. */
    softGen++;
    if (softGen % 600 === 0) { const live = new Set(G.fighters.filter(Boolean).map(x => x.id));
      for (const k in softs) if (!live.has(k)) delete softs[k]; }
    for (const f of G.fighters) {
      if (!f) continue;
      const s = softOf(f);
      const vx = (f.x - s.px) / dt, vy = ((f.yLift || 0) - s.py) / dt;
      const rot = (f.rig && f.rig.bodyRot) || 0, av = (rot - s.prot) / dt;
      // ⚠ clamp the Δv: the game teleports x at the stage clamp and on a wall bounce, and an
      //   un-clamped teleport would fling the cloth off the model for a second.
      let dvx = 0, dvy = 0, dva = 0;
      if (s.seen) { dvx = clampf(vx - s.vx, -1600, 1600); dvy = clampf(vy - s.vy, -1600, 1600); dva = clampf(av - s.pav, -26, 26); }
      s.px = f.x; s.py = f.yLift || 0; s.vx = vx; s.vy = vy; s.prot = rot; s.pav = av; s.seen = true;
      // A LANDING SETTLES. Touchdown is the frame `air` clears; the impulse is the speed it hit at.
      if (s.pAir && !f.air) s.landV += Math.min(9, Math.abs(vy) * 0.010);
      s.pAir = !!f.air;
      s.landV += (0 - s.land) * 240 * dt - s.landV * 17 * dt; s.land += s.landV * dt;
      if (Math.abs(s.land) < 1e-4 && Math.abs(s.landV) < 1e-4) { s.land = 0; s.landV = 0; }
      for (const g of SOFT) {
        for (let i = 0; i < g.n; i++) {
          const nd = s.nodes[g.i0 + i], up = g.chain && i > 0 ? s.nodes[g.i0 + i - 1] : null;
          const rx = up ? up.x : 0, ry = up ? up.y : 0;
          /* ⛔ ONLY THE FIRST LINK TAKES THE BODY'S IMPULSE DIRECTLY. Giving every node a direct
           * kick scaled UP down the chain (`1 + i*0.55`) defeated the whole point: measured, the
           * tail peaked at 408 ms while its parent peaked at 425 ms, i.e. the disturbance arrived
           * at the far end FIRST. That is twenty independent toys wearing a chain's clothes — the
           * exact failure the hero wordmark's coupling assertion exists to catch. A link is
           * attached to its PARENT, so its parent's spring is what must carry the shove down. The
           * small `0.25^i` residue is real (cloth is a sheet, not a string of beads) and decays
           * fast enough that the ordering survives. */
          const lever = 1 + i * 0.55;
          const kk = IMP * g.w * (g.chain ? Math.pow(0.25, i) : lever);
          nd.vx -= dvx * kk + dva * kk * 34; nd.vy -= dvy * kk;
          nd.vx += ((rx - nd.x) * g.k - nd.vx * g.d) * dt;
          nd.vy += ((ry - nd.y) * g.k - nd.vy * g.d) * dt;
          nd.x = clampf(nd.x + nd.vx * dt, -34, 34); nd.y = clampf(nd.y + nd.vy * dt, -34, 34);
          if (Math.abs(nd.x) < 1e-4 && Math.abs(nd.vx) < 1e-4) { nd.x = 0; nd.vx = 0; }
          if (Math.abs(nd.y) < 1e-4 && Math.abs(nd.vy) < 1e-4) { nd.y = 0; nd.vy = 0; }
        }
      }
    }
  }
  const softN = (f, i) => (softs[f.id] ? softs[f.id].nodes[i] : { x: 0, y: 0 });

  function bind(name) { const g = geo[name]; gl.bindBuffer(gl.ARRAY_BUFFER, g.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); return g.count; }
  let curMesh = '', _mat = 0;                                // active procedural material (see LIT_FS)
  /* uSurf is derived from uMat by default so no existing call site has to change, and is
   * overridden by setting `_surf` >= 0 for the handful of draws whose material is not implied by
   * their texture (the tsuba, the belt hardware, the shadow quad, the neon). Reset it to -1. */
  const MAT_SURF = [0, 0, 1, 0, 1, 0, 2, 0, 0];               // 2 brushed metal · 4 crystal = FOIL · 6 energy = LIGHT
  let _surf = -1;                                             // -1 auto · 0 ink · 1 foil · 2 emissive — RONIN-ART §1.1
  const surfOf = () => (_surf >= 0 ? _surf : (MAT_SURF[_mat | 0] || 0));
  let _flat = null;                                           // non-null → draw as a flat ink plate (the slip ghost)
  let _nudge = null;                                          // world offset applied to a fighter matrix (slip ghosts)
  let meshVar = '';                                           // active per-fighter mesh-variant prefix
  function draw(rawName, model, color, emis, alpha) {
    const name = (meshVar && geo[meshVar + rawName]) ? meshVar + rawName : rawName;
    if (curMesh !== name) { bind(name); curMesh = name; }
    gl.uniformMatrix4fv(u(litProg, 'uMVP'), false, M.mul(VP, model)); gl.uniformMatrix4fv(u(litProg, 'uModel'), false, model);
    gl.uniform3fv(u(litProg, 'uColor'), _flat ? _flat.col : color); gl.uniform1f(u(litProg, 'uEmis'), emis || 0);
    gl.uniform1f(u(litProg, 'uAlpha'), _flat ? _flat.a : (alpha == null ? 1 : alpha));
    gl.uniform1f(u(litProg, 'uMat'), _flat ? 0 : _mat); gl.uniform1f(u(litProg, 'uTime'), t3);
    gl.uniform1f(u(litProg, 'uSurf'), _flat ? 0 : surfOf()); gl.uniform1f(u(litProg, 'uFlat'), _flat ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, geo[name].count); }
  function setLit() { gl.useProgram(litProg); curMesh = ''; lightUniforms(litProg);
    gl.uniform3fv(u(litProg, 'uCam'), camPos); gl.uniform3fv(u(litProg, 'uFog'), FOG); gl.uniform2fv(u(litProg, 'uFogND'), [17, 58]); }
  function lightUniforms(p) {
    gl.uniform3fv(u(p, 'uLight'), LIGHT.keyD); gl.uniform3fv(u(p, 'uKeyC'), LIGHT.keyC);
    gl.uniform3fv(u(p, 'uFillD'), LIGHT.fillD); gl.uniform3fv(u(p, 'uFillC'), LIGHT.fillC);
    gl.uniform3fv(u(p, 'uRimD'), LIGHT.rimD); gl.uniform3fv(u(p, 'uRimC'), LIGHT.rimC);
    gl.uniform1f(u(p, 'uSteps'), LIGHT.steps); gl.uniform1f(u(p, 'uFlat'), 0); }

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
    /* WEIGHT — a landing settles. The standee compresses on touchdown and rebounds past 1.0,
     * scaled by the speed it hit at. ⚠ This is a RENDER spring: it never moves a hitbox, and
     * ronin.js's collision is untouched by it. docs/RONIN-ART.md §1.3. */
    const ld = (softs[f.id] ? softs[f.id].land : 0);
    const sq = M.S(SC * (1 + ld * 0.11), SC * (1 - ld * 0.17), SC * (1 + ld * 0.11));
    if (_nudge) pos = M.mul(M.T(_nudge[0], _nudge[1], _nudge[2]), pos);
    let fm = M.mul(M.mul(M.mul(pos, M.Ry(yaw)), M.Rz((f.rig && f.rig.bodyRot) || 0)), sq);
    return mirror ? M.mul(M.S(1, -1, 1), fm) : fm; }

  /* ── THE REGISTRATION SLIP — the signature impact effect.  docs/RONIN-ART.md §3.1 ───────────
   * The artist's lineage is hand-drawn work with DELIBERATELY CRUDE REGISTRATION. So when a
   * fighter is struck his colour plates separate: a cyan ghost and a magenta ghost pull apart
   * from the body and snap back over ~0.13 s. It is chromatic aberration confined to ONE OBJECT,
   * fired by a hit — a printing failure, not a video-game glow, and it is the one impact effect
   * in this brief that a default pipeline would never emit.
   * ⛔ It must be on the struck body only. A full-screen aberration is a post-process everyone
   *    has; a plate slip on the thing that was hit is a printed object being hit. */
  const SLIP_LIFE = 0.13;
  function slipAmt(f) {
    if (!f || f.dead || f.state !== 'hurt') return 0;
    const t = f.stT || 0;
    return t > SLIP_LIFE ? 0 : 1 - t / SLIP_LIFE;
  }
  const SLIP_PLATES = [[[0.05, 1.0, 0.92], 1], [[1.0, 0.09, 0.70], -1]];
  function drawPlateSlip(f) {
    const k = slipAmt(f); if (k <= 0.002) return;
    const d = 0.10 * k;
    for (const pl of SLIP_PLATES) {
      const s = pl[1];
      _flat = { col: pl[0], a: 0.50 * k };
      _nudge = [(camRight[0] + camUp[0] * 0.35) * d * s, (camRight[1] + camUp[1] * 0.35) * d * s, (camRight[2] + camUp[2] * 0.35) * d * s];
      try { drawFighter(f, false); } catch (e) {}
    }
    _flat = null; _nudge = null;
  }

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
  // hair: a skull cap plus swept spikes. Skipped for the shelled/crystal/hatted heads.
  // ⚑ The spike TIPS ride the soft rig (nodes 7–9), so hair lags a head turn instead of being
  //    welded to the skull. Stiff group: at rest it is exactly 0 and the shape is unchanged.
  function drawHair(fm, f, K, hair, a, dk) {
    if (f.arch === 'kappa' || f.arch === 'prizm' || f.arch === 'ronin') return;    // shelled / crystal / hatted heads
    const h = K.head; _mat = 0;
    orb(fm, h.x - 2, h.y - 5, 0, 27, 20, 26, hair, 0.02, a);                       // cap over the crown
    if (f.arch === 'doomer') return;                                                // hooded — no spikes
    const spikes = f.arch === 'kunoichi'
      ? [[-6, -14, -22, 2.0], [-10, -8, -26, 2.4], [-12, 0, -24, 2.7]]              // long tail sweeping back
      : [[2, -16, -16, 1.1], [-4, -18, -12, 1.5], [-10, -15, -10, 1.9], [8, -13, -12, 0.7], [-14, -9, -8, 2.3]];
    for (let i = 0; i < spikes.length; i++) {
      const [ox, oy, len, ang] = spikes[i], nd = softN(f, 7 + (i % 3));
      const bx = h.x + ox, by = h.y + oy;
      const tx = bx + Math.cos(ang) * -len - nd.x * 0.9, ty = by + Math.sin(ang) * -Math.abs(len) * 0.5 - nd.y * 0.9;
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
  /* `foot` is the archetype's ground footprint, used by the contact shadow — a squat body plants
   * wider than a lanky one, and until this existed every fighter cast the same 0.55 disc. */
  /* ⛔ `body` IS THE COLOUR A LOADED MESH IS PRINTED IN, and it is not `top`. The skinned and
   * model paths used `top` for the WHOLE body — so the ronin, whose jacket is #dfe6f2, fought as
   * a near-white mannequin that blew out under bloom and lost its silhouette against the floor
   * entirely. A one-piece body wants a mid-value saturated ink, not the brightest garment in the
   * wardrobe. Measured: it is the single largest contributor to this game's clipping. */
  const GARB = {
    ronin:    { skin: '#e8c9a8', top: '#dfe6f2', body: '#7d8aa6', pants: '#3b4258', boot: '#241a12', glove: '#8a2f2f', trim: '#9fb0d0', hair: '#20232e', bare: 'arms',  foot: 1.00 },
    kappa:    { skin: '#4fc25a', top: '#2f7d3a', body: '#39a047', pants: '#1f5e2c', boot: '#123a1c', glove: '#2bff80', trim: '#2bff80', hair: '#1a4d24', bare: 'arms',  foot: 1.14 },
    doomer:   { skin: '#c9b7a6', top: '#2a3040', body: '#4b5566', pants: '#171b26', boot: '#0e1118', glove: '#3d4658', trim: '#8fa0b8', hair: '#141821', bare: 'none',  foot: 1.16 },
    oni:      { skin: '#df463b', top: '#7a1a14', body: '#b83a30', pants: '#2a1410', boot: '#160a08', glove: '#f0a03c', trim: '#ff6b57', hair: '#2b0f0c', bare: 'torso', foot: 1.34 },
    kunoichi: { skin: '#e8bfa4', top: '#c31f6d', body: '#a8195c', pants: '#2b1030', boot: '#1a0a20', glove: '#ff2ad9', trim: '#ff2ad9', hair: '#1b0f1e', bare: 'none',  foot: 0.84 },
    prizm:    { skin: '#c9a6ff', top: '#7b4bd0', body: '#8a5ade', pants: '#3a2470', boot: '#241246', glove: '#e6c8ff', trim: '#e6c8ff', hair: '#8f5cff', bare: 'none',  foot: 0.90 },
    /* The seven generated bodies (models/cc0 + the mascot) fell through to the ronin wardrobe, so
     * seven distinct meshes all fought dressed as the same grey swordsman. Colour-blocked to their
     * own ARCH palette instead. ⚠ Names are the studio's — a body may be INFORMED by a source and
     * never NAMED after one (docs/CC0-SOURCES.md); nothing here names one. */
    'rip-mascot': { skin: '#ffe3a0', top: '#ffd23b', body: '#e0a91f', pants: '#8a5a10', boot: '#2a1a04', glove: '#fff6d0', trim: '#fff6d0', hair: '#6a4408', bare: 'none', foot: 1.06 },
    'cc0-mosh':   { skin: '#ffb8ea', top: '#ff2ad9', body: '#c81ea8', pants: '#2a0a24', boot: '#150512', glove: '#ff8ae0', trim: '#ff8ae0', hair: '#3a0a30', bare: 'arms', foot: 0.80 },
    'cc0-cel':    { skin: '#c8ffdf', top: '#2bff80', body: '#1fbf5e', pants: '#0e3a20', boot: '#061c0f', glove: '#eafff2', trim: '#0a1f12', hair: '#0a2a16', bare: 'none', foot: 1.28 },
    'cc0-grid':   { skin: '#c8fbf6', top: '#27f7e4', body: '#1cbdb0', pants: '#0a3a38', boot: '#041c1b', glove: '#8ff6ee', trim: '#8ff6ee', hair: '#062e2c', bare: 'none', foot: 1.02 },
    'cc0-lank':   { skin: '#dff5e8', top: '#9fd8b8', body: '#6fae8c', pants: '#20402f', boot: '#0e2018', glove: '#c8f0dc', trim: '#c8f0dc', hair: '#16301f', bare: 'arms', foot: 0.76 },
    'cc0-squat':  { skin: '#ffc9bc', top: '#ff6b57', body: '#d1503e', pants: '#3a1208', boot: '#1c0804', glove: '#ffa08f', trim: '#ffa08f', hair: '#2a0d05', bare: 'torso', foot: 1.40 },
    'cc0-lump':   { skin: '#e6d4ff', top: '#b47bff', body: '#8a5cc8', pants: '#2c1a4a', boot: '#160c26', glove: '#d9bcff', trim: '#d9bcff', hair: '#1e1030', bare: 'none', foot: 1.08 },
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
  /* ⚑ Side and segment are decided from DELIMITED TOKENS, not substrings, and that is a bug
   * fix rather than a style preference. JOINTMAP's `(f|front|r|right)` is unanchored, so the
   * "r" at the end of "uppe*r*" and "lowe*r*" satisfies it — which meant every back-limb name
   * in models/README.md matched the FRONT rule. Running the documented names through the old
   * matcher, SIX of the eight limbs collapsed onto two joints: arm_b_upper, arm_b_lower and
   * arm_f_lower all landed on armF0, and the legs did the same. An artist authoring exactly
   * to our own documented convention got a model with limbs welded together, silently and
   * with no error anywhere.
   *
   * Splitting on non-alphanumerics makes "arm_b_upper" → [arm, b, upper], where "b" is a whole
   * token and the "r" inside "upper" cannot be mistaken for "right". Names that do not carry
   * recognisable tokens fall through to JOINTMAP unchanged, so anything that worked before
   * still works. */
  function jointFor(name) {
    const tok = String(name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const has = (...w) => w.some(x => tok.includes(x));
    if (has('head', 'skull', 'face', 'helmet', 'mask')) return 'head';
    if (has('pelvis', 'hip', 'waist', 'belt')) return 'pelvis';
    const isArm = has('arm', 'forearm', 'shoulder', 'bicep', 'hand', 'glove', 'fist', 'elbow');
    const isLeg = has('leg', 'thigh', 'quad', 'shin', 'calf', 'knee', 'foot', 'boot');
    if (isArm || isLeg) {
      const s = has('b', 'back', 'l', 'left') ? 'B' : 'F';       // front is the default side
      let seg;                                                   // 0 proximal · 1 mid · 2 distal
      if (isArm) seg = has('hand', 'glove', 'fist') ? 2
                     : has('forearm', 'elbow', 'lower', 'low') ? 1 : 0;
      else       seg = has('foot', 'boot') ? 2
                     : has('shin', 'calf', 'knee', 'lower', 'low') ? 1 : 0;
      return (isArm ? 'arm' : 'leg') + s + seg;
    }
    if (has('sword', 'blade', 'katana', 'weapon', 'gun', 'rifle')) return 'sword';
    if (has('chest', 'torso', 'jacket', 'uniform', 'body', 'spine', 'armor', 'armour')) return 'chest';
    for (const [re, j] of JOINTMAP) if (re.test(name)) return j;  // unrecognised → old behaviour
    return 'body';
  }
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
      /* Dress a single-part model by default and leave a multi-part one alone: one unnamed mesh
       * is a bare body that needs a costume, whereas an artist who split and named their parts
       * has already dressed it, and stacking a straw hat on a helmet reads as a bug. Override
       * either way with opt.dress. Likewise, only hand it a sword if it didn't bring one. */
      const dress = (opt && typeof opt.dress === 'boolean') ? opt.dress : (src.length === 1);
      models[arch] = { parts, scale, footY: lo, dress, armed: parts.some(p => p.joint === 'sword') };
      return true;
    } catch (e) { return false; }
  }
  function hasModel(arch) { return !!models[arch]; }
  const BONE_ORDER = ['pelvis','chest','head','armF0','armF1','armB0','armB1','legF0','legF1','legB0','legB1'];
  const BONE_CHILD = { pelvis:'chest', chest:'head', head:null, armF0:'armF1', armF1:'armF2', armB0:'armB1', armB1:'armB2', legF0:'legF1', legF1:'legF2', legB0:'legB1', legB1:'legB2' };
  function registerSkin(arch, verts, count, opt) {
    if (!ok) return false;
    try { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      // bind-space bounds so the mesh can be fitted to the skeleton
      let lo=1e9, hi=-1e9; for (let i=1;i<verts.length;i+=14){ const y=verts[i]; if(y<lo)lo=y; if(y>hi)hi=y; }
      // a .skn is one auto-skinned body by construction, so it wants the costume unless told otherwise
      const dress = (opt && typeof opt.dress === 'boolean') ? opt.dress : true;
      skins[arch] = { buf:b, count, lo, hi, h:(hi-lo)||1, dress }; return true; } catch(e){ return false; }
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
    const g = garbOf(f), col = sc(hex(g.body || g.top), dk);   // `body`, not `top` — see GARB
    gl.useProgram(skinProg); curMesh='';
    gl.bindBuffer(gl.ARRAY_BUFFER, sk.buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,56,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,56,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,56,24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,4,gl.FLOAT,false,56,40);
    gl.uniformMatrix4fv(u(skinProg,'uBones'), false, skinPalette(f, K, sk));
    gl.uniformMatrix4fv(u(skinProg,'uMVP'), false, M.mul(VP, fm)); gl.uniformMatrix4fv(u(skinProg,'uModel'), false, fm);
    gl.uniform3fv(u(skinProg,'uColor'), _flat ? _flat.col : col); gl.uniform1f(u(skinProg,'uEmis'),0);
    gl.uniform1f(u(skinProg,'uAlpha'), _flat ? _flat.a : a);
    gl.uniform1f(u(skinProg,'uMat'), _flat ? 0 : bodyMat(f)); gl.uniform1f(u(skinProg,'uTime'), t3);
    lightUniforms(skinProg);
    gl.uniform1f(u(skinProg,'uSurf'), 0); gl.uniform1f(u(skinProg,'uFlat'), _flat ? 1 : 0);
    gl.uniform3fv(u(skinProg,'uCam'),camPos);
    gl.uniform3fv(u(skinProg,'uFog'),FOG); gl.uniform2fv(u(skinProg,'uFogND'),[17,58]);
    gl.drawArrays(gl.TRIANGLES, 0, sk.count);
    gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
    gl.useProgram(litProg); curMesh='';
    dressLoaded(fm, f, K, a, dk, sk.dress);          // costume + weapon ride the skeleton, not the mesh
  }
  /* Baked city world (see scripts/bake-world.mjs). Uploaded once, drawn as one opaque batch. */
  let worldMesh = null, worldOrigin = [0, 0, 0], worldFar = 60;
  /* `origin` moves the LEVEL onto the fight line rather than bending the duel onto the level.
     The duel is authored in its own space — fighters draw at (f.x*SC, f.yLift*SC, f.z*SC), i.e. a
     plane at world y=0, z~0 running along x — and every combat verb in ronin.js is written
     against it. Translating one opaque batch by -origin is a matrix; re-homing the duel would
     mean touching hitboxes, the camera, shadows, reflections and FX, all of which assume y=0.
     Pass the level's authored spawn and its floor arrives under the fighters' feet. */
  /* ⛔ A ROOM IS NOT A STAGE, AND DRAWING IT WHOLE PUTS THE CAMERA INSIDE IT. These levels were
   *   authored to be walked through in first person; the duel camera sits ~7-12 m back on +z
   *   looking at the fight plane, so every wall, crate and rail BETWEEN it and the fighters
   *   occludes the fight. Measured on the rooftop: props covered both fighters and the read of
   *   the whole duel. This is the standard fighting-game answer — a 3D arena is dressed from
   *   behind and the front wall is simply not drawn, which is why you never see the fourth wall
   *   of a Tekken stage.
   * ⚑ CULLED AT UPLOAD, NOT PER FRAME. It is one opaque batch drawn once; filtering the vertex
   *   data costs nothing at runtime and needs no clip plane in the shader. A triangle is kept or
   *   dropped WHOLE — clipping per vertex would tear the geometry open along the cut.
   * ⚠ JUDGED BY ITS NEAREST VERTEX, NOT ITS CENTROID. A centroid test was tried first and left a
   *   wall-sized wedge across the arcade's right-hand fighter: these levels have very large
   *   triangles, so one whose MIDDLE is safely behind the cut can still reach many metres in
   *   front of it. The centroid answers "where is this triangle", and the question is actually
   *   "does any part of it get between the camera and the fight".
   * ⚠ The cut sits slightly IN FRONT of the fight plane (z = FRONT_CUT), not on it: the floor
   *   has to run toward the camera past the fighters' feet or they stand on a visible ledge. */
  const FRONT_CUT = 2.2;                       // metres in front of the fight line (z = 0)
  function setWorld(verts, origin) { if (!ok || !verts || !verts.length) return false;
    try {
      const o = (origin && origin.length === 3) ? origin.slice() : [0, 0, 0];
      const st = 6, tri = st * 3;              // interleaved pos3 + norm3, 3 verts per triangle
      const keep = [];
      for (let i = 0; i + tri <= verts.length; i += tri) {
        /* ⚠ FLOORS ARE EXEMPT, and leaving them out was visible: the cut removed the ground in
           FRONT of the fight line, so the bottom third of frame went to void and the fighters
           stood on nothing. A near-horizontal surface below the camera's eyeline cannot occlude a
           side-on duel no matter how close it comes — only uprights can. So the test is "is this
           a wall in the way", not "is this in the way". Averaged normal, because the three
           vertices of a floor triangle all point the same way anyway. */
        const ny = (verts[i + 4] + verts[i + st + 4] + verts[i + 2 * st + 4]) / 3;
        if (ny <= 0.7) {                       // not a floor — check whether it blocks the view
          const nz = Math.max(verts[i + 2], verts[i + st + 2], verts[i + 2 * st + 2]) - o[2];
          if (nz > FRONT_CUT) continue;        // any part in front of the fight would block it
        }
        for (let k = 0; k < tri; k++) keep.push(verts[i + k]);
      }
      /* Fail OPEN: if the cut removed everything (an origin outside the level, a mesh that is not
         interleaved the way this assumes) draw the level whole rather than draw nothing. An
         occluded stage is a bug; a missing stage is a blank screen. */
      const use = keep.length >= tri ? new Float32Array(keep) : verts;
      /* the level's own reach from the fight line — drives its fog range, see drawScene */
      let far = 0;
      for (let i = 0; i + st <= use.length; i += st) {
        const dx = use[i] - o[0], dz = use[i + 2] - o[2];
        const d = Math.sqrt(dx * dx + dz * dz); if (d > far) far = d;
      }
      worldFar = Math.max(24, far);
      mesh('world', use); worldMesh = true; worldOrigin = o;
      return true; } catch (e) { return false; } }
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
    const g = garbOf(f), col = sc(hex(g.body || g.top), dk), S = md.scale;   // `body`, not `top` — see GARB
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
    if (md.dress || !md.armed) dressLoaded(fm, f, K, a, dk, md.dress);
  }

  function drawFighter(f, mirror) {
    const K = RoninArt.skel(f); const fm = fighterMatrix(f, mirror);
    // ⚠ `!_flat` guards the trail: a slip ghost re-draws the body twice in the same frame, and
    //   without it each frame would push three tip samples and the streak would run 3× fast.
    if (!mirror && !_flat) { const tp = xform(fm, K.sword.tip.x, -K.sword.tip.y, 0);   // world blade tip → 3D streak
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
    _mat = 2; bit(fm, K.pelvis.x, K.pelvis.y - 3, 31, 9, 27, TRIM, 0.12, a); _mat = 0;     // belt / obi — hot-stamped hardware, so FOIL
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
    _mat = 2; bit(fm, K.head.x, K.head.y + 4, 27, 6, 27, TRIM, 0.45, a); _mat = 0;         // headband — foil
    if (!mirror) drawFace(fm, f, K, SKIN, dk, a);
    archHead(fm, f, K, tint, a, dk);
    // ── front arm + gloved hand gripping the hilt ──
    _mat = bareArms ? 5 : lm;
    beam(fm, K.armF[0], K.armF[1], 7.2, ARM, 0, a); ball(fm, K.armF[1], 6, ARM, 0, a); beam(fm, K.armF[1], K.armF[2], 5.4, ARM, 0, a);
    _mat = 0; orb(fm, K.sword.hand.x - 4, K.sword.hand.y - 4, 0, 10, 10, 10, GLOVE, 0.08, a);   // bracer
    drawHand(fm, K.sword.hand, { x: K.sword.tip.x - K.sword.hand.x, y: K.sword.tip.y - K.sword.hand.y }, GLOVE, dk, a, false);
    drawWeapon(fm, f, K, a, dk);
    if (f.arch === 'prizm') archShards(fm, f, K, a, dk);
    meshVar = '';
  }
  // ── weapon: a HELD hilt (pommel + wrapped grip through the fist + tsuba) with the blade emerging above the guard ──
  // Lifted out of drawFighter so the loaded-model and skinned paths can arm their fighters too;
  // an imported character otherwise duels bare-handed in a game that is entirely about the sword.
  function drawWeapon(fm, f, K, a, dk) {
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
  }

  /* ── dress a loaded body ──────────────────────────────────────────────────────────────────
   * The rigid-part and skinned paths draw the imported mesh and nothing else, so a character
   * brought in from Mixamo or a sculpted base mesh fought naked and unarmed while the
   * procedural fighters beside it wore a full costume. This puts the same wardrobe on it.
   *
   * Every piece here is placed from the SKELETON, never from the mesh, which is what lets one
   * implementation fit any body — a 2k-tri base being, a 13k-tri suit of plate, or the
   * procedural fighter. Boots ride the foot joints, the belt the pelvis, bracers the wrists,
   * and the archetype's own silhouette (straw hat, cowl, horns, shell, mask, cloak, scarf)
   * comes from the same archHead/archBack the procedural path uses.
   *
   * `garments` is opt-out because dressing is not always wanted: a model the artist authored
   * as separate named parts is already costumed, and stacking a haori on a suit of armour
   * looks like a bug. See the default chosen in registerModel/registerSkin. */
  const HEAD_LIFT = 17;                    // skeleton units from the head joint up into the skull
  function dressLoaded(fm, f, K, a, dk, garments) {
    const g = garbOf(f), tint = sc(hex(f.tint), dk);
    if (garments) {
      const GLOVE = sc(hex(g.glove), dk);
      archBack(fm, f, K, sc(hex(f.col), dk), tint, a, dk);                                   // cloak / scarf, behind the torso
      /* ⛔ THE BOOT SLABS AND THE BELT ARE GONE FROM THE LOADED PATH, and it is the HEAD_LIFT
       * lesson one and two joints down rather than a taste call. Those pieces were placed at
       * skeleton joints whose bind-table heights (pelvis 0.50, feet 0.00) do not match any real
       * mesh's waist or feet — so on `oni.skn` the obi hung in mid-air at mid-thigh as a bright
       * slab, and the boots sat on the floor detached from the legs. Both were plainly visible in
       * every shipped frame. A loaded mesh HAS its own feet and waist; a skeleton-placed slab on
       * top of them lands wherever the proportions happen to differ, which is always.
       * ⚠ Bracers stay: they ride the hand joints, and the IK drives the hands directly, so those
       *   two positions are the ones the skeleton is actually authoritative about. */
      _mat = 0;
      orb(fm, K.armB[2].x - 3, K.armB[2].y - 3, 0, 9, 9, 9, sc(GLOVE, 0.9), 0.08, a);        // bracers
      orb(fm, K.sword.hand.x - 4, K.sword.hand.y - 4, 0, 10, 10, 10, GLOVE, 0.08, a);
      /* Headgear rides the CROWN, not the head joint. The bind skeleton puts its head joint at
       * 0.84 of body height and the crown at ~0.97, so a real mesh's skull sits well above the
       * joint — placing the straw hat straight on K.head drew it across the fighter's chest.
       * The procedural body never showed this because its head ball is drawn at the joint too. */
      const Kh = Object.assign({}, K, { head: { x: K.head.x, y: K.head.y - HEAD_LIFT } });
      archHead(fm, f, Kh, tint, a, dk);                                                       // hat / hood / horns / shell / mask
    }
    drawWeapon(fm, f, K, a, dk);
    if (f.arch === 'prizm') archShards(fm, f, K, a, dk);
    _mat = 0;
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
  /* cloak (ronin/doomer), trailing scarf (kunoichi) — drawn behind the torso.
   * ⛔ THE SCARF USED TO BE A SINE ON `t3`. It is now three chained soft nodes: shove the body
   *    and the swing runs down the chain and dies out; stand still and it hangs dead straight.
   *    The cloak is a real three-segment drape for the same reason — one rigid slab could not
   *    express a lag no matter what drove it. docs/RONIN-ART.md §1.3. */
  function archBack(fm, f, K, col, tint, a, dk) {
    const cx = (K.chest.x + K.pelvis.x) / 2, cy = (K.chest.y + K.pelvis.y) / 2;
    if (f.arch === 'ronin' || f.arch === 'doomer') {
      _mat = 1; const cc = f.arch === 'doomer' ? sc([0.15, 0.17, 0.22], dk) : sc(hex(f.tint), dk * 0.85);
      let px = cx - 8, py = cy - 4;
      for (let i = 0; i < 3; i++) {                                                         // draped haori / coat, 3 panels
        const nd = softN(f, i), seg = [30, 34, 30][i], wid = [34, 31, 26][i];
        px += -nd.x * 0.42; py += seg * 0.5;
        slab(fm, px, py, -5 - i * 1.2, wid, seg + 3, 8, 0.05 - nd.x * 0.012, sc(cc, 1 - i * 0.06), 0, a);
        px += -nd.x * 0.42; py += seg * 0.5 + nd.y * 0.10;
      }
    } else if (f.arch === 'kunoichi') {
      _mat = 1; const sccol = sc(hex(f.tint), dk); let x = K.head.x - 4, y = K.head.y + 10;
      for (let i = 0; i < 6; i++) { const nd = softN(f, 3 + Math.min(3, i >> 1));
        x -= 13 + nd.x * 0.24; y += 7 + nd.y * 0.30;
        slab(fm, x, y, -4 - i, 18, 7, 6, 0.55 - nd.x * 0.035, sccol, 0.22, a); }               // trailing scarf
    }
    _mat = 0;
  }
  /* Crystal shards for the prizmancer.
   * ⛔ THEY USED TO ORBIT ON A TIMER — five crystals circling a motionless body, forever, which
   *    is DESIGN-SYSTEM §4's definition of a screensaver. They now HANG in the body's field on
   *    the loosest soft group and get thrown when it lunges. Same five crystals, opposite meaning. */
  function archShards(fm, f, K, a, dk) {
    _mat = 4; const base = sc(hex(f.tint), dk), c = K.chest;
    const REST = [[26, -14, 8], [17, 16, -9], [-24, -6, 7], [-14, 20, -6], [3, -26, 4]];
    for (let i = 0; i < 5; i++) { const r = REST[i], nd = softN(f, 10 + i);
      const rx = r[0] - nd.x * 1.5, ry = r[1] - nd.y * 1.5;
      slab(fm, c.x + rx, c.y + ry, r[2], 6, 22, 6, Math.atan2(ry, rx) * 1.4, base, 0.55, a); }
    _mat = 0;
  }
  // ── 3D combat FX ──
  // smooth blade-streak ribbon (a real katana trail — a tapered, fading strip, not chunky tubes).
  // Uses trailProg (per-vertex alpha); caller binds trailProg + uVP.
  /* ⛔ RIBBONS WERE FLAT, AND THE CAMERA SWINGS EXACTLY WHEN THEY MATTER.
   * The width was built from a fixed perpendicular in the world x-y plane, so the moment the
   * fight camera swung off the fight line — which is what `cineKick` does, on every hero moment —
   * a blade trail collapsed to a line and the crescent turned edge-on. The perpendicular is now
   * built against the VIEW vector (segment × eye-to-point), i.e. the ribbon faces the camera the
   * way a real motion smear does. Acceptance: measured screen width, azimuth 0 vs. swung.
   * ⚠ Degenerate case is real: a segment pointing straight at the eye has no camera-facing
   *   perpendicular, so it falls back to the old x-y one rather than producing NaNs. */
  const ribBuf = [];
  function ribPerp(px_, py_, pz_, dx, dy, dz) {
    const ex = px_ - camPos[0], ey = py_ - camPos[1], ez = pz_ - camPos[2];
    let cx = dy * ez - dz * ey, cy = dz * ex - dx * ez, cz = dx * ey - dy * ex;
    const L = Math.hypot(cx, cy, cz);
    if (L < 1e-5) { const l2 = Math.hypot(dx, dy) || 1; return [-dy / l2, dx / l2, 0]; }
    return [cx / L, cy / L, cz / L];
  }
  function ribbon(pts, wHead, wTail, aHead, col) {
    const n = pts.length; if (n < 2) return; ribBuf.length = 0;
    for (let i = 0; i < n; i++) { const p = pts[i], q = i < n - 1 ? pts[i + 1] : pts[i - 1];
      const s = i < n - 1 ? 1 : -1;
      const dx = (q[0] - p[0]) * s, dy = (q[1] - p[1]) * s, dz = (q[2] - p[2]) * s;
      const pr = ribPerp(p[0], p[1], p[2], dx, dy, dz), px = pr[0], py = pr[1], pz = pr[2];
      const t = i / (n - 1), w = wHead + (wTail - wHead) * t, al = aHead * (1 - t) * (1 - t);
      ribBuf.push(p[0] + px * w, p[1] + py * w, p[2] + pz * w, al, p[0] - px * w, p[1] - py * w, p[2] - pz * w, al); }
    gl.uniform3fv(u(trailProg, 'uCol'), col);
    gl.bindBuffer(gl.ARRAY_BUFFER, trailBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ribBuf), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, ribBuf.length / 4); curMesh = '';
  }
  function drawTrail3(f) {
    const tr = f.trail3; if (!tr || tr.length < 3) return;
    /* ⛔ THE "ONLY FAST SWINGS SMEAR" GATE MEASURED x AND y AND IGNORED z ENTIRELY, so a cut that
     * travelled toward or away from the camera counted as a still blade and drew nothing. The
     * spin attacks sweep through exactly that orientation every revolution, and the depth strafe
     * (`f.z`) puts the blade there on any lunge. Same family as the camera-facing perpendicular
     * below: a 3D renderer carrying a 2D assumption, silently, with no error anywhere. */
    let spread = 0; for (let i = 0; i < tr.length - 1; i++) spread += Math.hypot(tr[i][0] - tr[i + 1][0], tr[i][1] - tr[i + 1][1], tr[i][2] - tr[i + 1][2]);
    if (spread < 0.45) return;                                      // only fast swings smear
    ribbon(tr, 0.16, 0.006, 0.85, f.glow > 0 ? [1, 0.95, 0.62] : hex(f.tint || '#dfeeff'));
  }
  // slash-arc crescent as a filled ribbon band (inner→outer radius), bright at the leading edge
  function drawArc3(e, gY) {
    const cx = e.x * SC, cy = (gY - e.y) * SC, rO = e.r * SC * 0.6, rI = rO * 0.5, fade = 1 - clampf(e.t / e.life, 0, 1);
    const c = hex(e.col || '#eaf6ff'), col = [Math.min(1, c[0] * 0.5 + 0.6), Math.min(1, c[1] * 0.5 + 0.6), Math.min(1, c[2] * 0.5 + 0.6)];
    /* The crescent lives in the SWING plane, because that is where the edge actually travelled —
     * but a flat band goes edge-on the instant the camera swings round, which is precisely when
     * `cineKick` swings it. `fore` is how far the view has left the plane normal; the band gains
     * camera-facing thickness in exactly that proportion, so it keeps screen area without ever
     * pretending the cut happened somewhere it did not. */
    const vz = norm(sub([cx, cy, 0], camPos));
    const fore = clampf(1 - Math.abs(vz[2]), 0, 1), thk = fore * rO * 0.42;
    const N = 14; ribBuf.length = 0;
    for (let i = 0; i <= N; i++) { const th = e.a0 + (e.a1 - e.a0) * (i / N), cs = e.face * Math.cos(th), sn = Math.sin(th);
      const edge = fade * 0.9 * (1 - Math.abs(i / N - 0.5) * 0.7);              // brighter through the middle of the sweep
      ribBuf.push(cx + cs * rI, cy - sn * rI, -thk, edge * 0.15, cx + cs * rO, cy - sn * rO, thk, edge); }
    gl.uniform3fv(u(trailProg, 'uCol'), col);
    gl.bindBuffer(gl.ARRAY_BUFFER, trailBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ribBuf), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, ribBuf.length / 4); curMesh = '';
  }
  // sparks (velocity-aligned streaks), dust (flat ground puffs), shock (one clean expanding ring) — lit shader, additive
  function drawFxLit(G) {
    const gY = G.groundY || 500, fx = G.fx || [];
    _surf = 2;                                                // sparks, dust and the shock ring are LIGHT: no die edge on them
    for (const e of fx) {
      if (e.kind === 'spark') { const k = 1 - e.t / e.life; const hx = e.x * SC, hy = (gY - e.y) * SC;
        const tx = hx - (e.vx || 0) * SC * 0.018, ty = hy + (e.vy || 0) * SC * 0.018;   // tail trails the velocity
        beam3([tx, ty, 0], [hx, hy, 0], (e.r * SC * 0.5) * (0.4 + k), hex(e.col), 1, k); }
      else if (e.kind === 'dust') { const pr = e.t / e.life, r = e.r * SC * 1.6 * (1 + pr * 1.7);   // flat disc on the floor
        draw('quad', M.mul(M.T(e.x * SC, 0.03 + pr * 0.1, (e.z || 0) * SC), M.S(r, 1, r)), [0.5, 0.44, 0.6], 0.4, (1 - pr) * 0.22); }
      else if (e.kind === 'arc') { /* drawn in the ribbon pass */ }
    }
    // ONE clean expanding ring, and it spreads ACROSS THE CARD rather than in mid-air, so a hit is
    // visibly transmitted into the thing everyone is standing on. RONIN-ART §3.4.
    const s = G.shock;
    if (s) { const R = s.t * 9 + 0.25, al = Math.max(0, 1 - s.t / 0.5) * 0.75 * (s.str || 1);
      draw('ring', M.mul(M.T((s.wx || 0) * SC, 0.05, 0), M.S(R, 1, R)), [1, 0.5, 0.92], 1, al); }
    _surf = -1;
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
  /* WEIGHT IS CONTACT, AND CONTACT IS THE SHADOW.  docs/RONIN-ART.md §1.3.
   * This was one fixed-radius quad at fixed alpha for every archetype at every altitude — so the
   * frame carried no cue at all for how high a body was, which is the one thing a launcher needs
   * to read. It now TIGHTENS AND DARKENS on the floor and SPREADS AND FADES in the air, and its
   * footprint is the archetype's own: an oni's shadow is not a kunoichi's. */
  function drawShadow(f) {
    const alt = Math.max(0, (f.yLift || 0)) * SC;                 // metres above the card
    const k = clampf(1 - alt / 2.1, 0, 1);                        // 1 on contact → 0 at the top of a jump
    const g = garbOf(f), base = 0.50 * (g.foot || 1);
    const r = base * (1 + (1 - k) * 1.35);
    const m = M.mul(M.T(f.x * SC, 0.02, (f.z || 0) * SC), M.S(r * 2.2, 1, r * 1.3));
    if (curMesh !== 'quad') { bind('quad'); curMesh = 'quad'; }
    gl.uniformMatrix4fv(u(litProg, 'uMVP'), false, M.mul(VP, m)); gl.uniformMatrix4fv(u(litProg, 'uModel'), false, m);
    gl.uniform3fv(u(litProg, 'uColor'), [0, 0, 0]); gl.uniform1f(u(litProg, 'uEmis'), 1);
    gl.uniform1f(u(litProg, 'uMat'), 0); gl.uniform1f(u(litProg, 'uSurf'), 2); gl.uniform1f(u(litProg, 'uFlat'), 0);
    gl.uniform1f(u(litProg, 'uAlpha'), (f.dead ? 0.18 : 0.62) * (0.10 + 0.90 * k * k));
    gl.drawArrays(gl.TRIANGLES, 0, 6); }

  function render(G) {
    if (!ok || !G) return false;
    try {
      // see GfxPost.deviceScale — one shared policy for what counts as a weak device
      // see GfxPost.dprCap — one shared policy for what counts as a weak device
      const dpr = Math.min(window.devicePixelRatio || 1,
        (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2),
        Wp = innerWidth * dpr, Hp = innerHeight * dpr;
      if (cv.width !== Wp || cv.height !== Hp) { cv.width = Wp; cv.height = Hp; }
      const composited = post && post.begin();     // scene -> offscreen when the chain is up
      if (!composited) gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(FOG[0], FOG[1], FOG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      /* ⛔ HITSTOP FREEZES THE RENDERER, AND IT DID NOT BEFORE.
       * The game stops the simulation for 55–130 ms on every hit — that held frame is the whole
       * genre — and the renderer animated straight through it on a hard-coded `t3 += 0.016`, so
       * cloth kept flowing and foil kept walking on the one frame that is supposed to be still.
       * It is a one-line change and it is the biggest single "Tekken" item in the file.
       * ⚠ Real dt, not a constant: the soft-goods springs integrate against this clock, and a
       *   fixed step under a variable frame rate is the "rig running at half speed" trap the hero
       *   wordmark hit — it reads as mushy and invites tuning instead of fixing. */
      const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      let dtR = tPrev ? (nowMs - tPrev) / 1000 : 0.016; tPrev = nowMs;
      dtR = clampf(dtR, 0, 0.05);
      if ((G.hitstop || 0) > 0) dtR = 0;
      /* ⚠ AFTER dtR EXISTS, NOT BEFORE. This sat above the frame clock on the first pass and
         `let dtR` hoists into the temporal dead zone — a ReferenceError that would have taken the
         whole renderer down, which is the same defect found in section9-classic.html the same
         day. `post.motion()` only has to precede `post.end()`, so here is early enough. */
      if (post && post.motion) post.motion(roninMotion(G, dtR));
      t3 += dtR;
      stepSoft(G, dtR);
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
      /* ⛔ THE IDLE ORBIT IS GONE — `Math.sin(t3*0.22)*0.10` drifted the camera when nothing had
       * happened, which is DESIGN-SYSTEM §4's screensaver in the most load-bearing place in the
       * frame. The camera now moves ONLY when the game moved it (`cineKick` → camZoom/camDir),
       * and because the foil's hue is keyed to the view, the floor changes colour exactly when
       * something happened. One deletion bought the stage its §4 answer. */
      const tDist = clampf(6.8 + sep * 0.5, 6.2, 12) - zoom * 3.2, tH = 2.62 - zoom * 0.5, tAz = cdir * zoom * 0.40;
      cam.dist += (tDist - cam.dist) * 0.14; cam.h += (tH - cam.h) * 0.14; cam.az += (tAz - cam.az) * 0.16;
      const sh3 = shakeOffset(G, dtR, cdir);
      camPos = [midX + Math.sin(cam.az) * cam.dist + sh3[0], cam.h + sh3[1], Math.cos(cam.az) * cam.dist + sh3[2]];
      VP = M.mul(M.persp(0.72, cv.width / cv.height, 0.1, 140), M.look(camPos, [midX, 2.0, 0], [0, 1, 0]));   // far clears the sky wall at z=-88
      { const fwd = norm(sub([midX, 2.0, 0], camPos)); camRight = norm(cross(fwd, [0, 1, 0])); camUp = cross(camRight, fwd); }   // billboard basis for sprite pops

      gl.enable(gl.BLEND);
      drawScene(G);
      if (composited) post.end();
      gl.flush(); return true;
    } catch (e) { ok = false; return false; }
  }
  /* ── the card and the table ────────────────────────────────────────────────────────────────
   * CARD_HALF_Z is the half-depth of the die-cut strip: the near and far cut edges are always in
   * frame, which is what makes DESIGN-SYSTEM §5's "everything sits on something" literally true
   * rather than a nice idea. The fighters strafe within z ±2.3, so the edge is never underfoot. */
  const CARD_HALF_Z = 11.0, CARD_HALF_X = 62;
  function drawFloor(midX, kind, sx, sz, y) {
    const gm = M.mul(M.T(midX, y, 0), M.S(sx * 2, 1, sz * 2));
    gl.uniformMatrix4fv(u(groundProg, 'uMVP'), false, M.mul(VP, gm)); gl.uniformMatrix4fv(u(groundProg, 'uModel'), false, gm);
    gl.uniform2f(u(groundProg, 'uHalf'), sx, sz); gl.uniform1f(u(groundProg, 'uWater'), kind);
    gl.uniform1f(u(groundProg, 'uAlpha'), 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.quad.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.disableVertexAttribArray(1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  /* THE BACKDROP IS THREE REAL DEPTHS, not one painted wall. A camera swing separates them, and
   * that separation IS the §4 answer for the backdrop: nothing moves, the view moved.
   * Acceptance: near-band screen displacement > far-band, measured, at a stated ratio. A backdrop
   * painted at one depth reports 1.00 and fails. Deterministic from the index — no per-frame
   * randomness, so a headless capture of the same camera is the same picture. */
  const BANDS = [
    { z: -52, n: 15, sp: 7.2, w: 3.6, h0: 9,   hv: 7.0, col: [0.052, 0.026, 0.098], emis: 0.02 },
    { z: -33, n: 17, sp: 5.4, w: 2.7, h0: 5.5, hv: 5.2, col: [0.034, 0.016, 0.066], emis: 0.02 },
    { z: -21, n: 21, sp: 3.9, w: 1.9, h0: 2.6, hv: 3.0, col: [0.020, 0.009, 0.040], emis: 0.02 },
  ];
  /* THE SKY IS A PRINTED GRADIENT, IN STEPS — and it is the reason the backdrop reads at all.
   * The clear colour and the buildings had the same value (both ≈13/255), so the whole backdrop
   * was mush and frame contrast fell to 36.1 against a 42.4 baseline. A silhouette needs
   * something to be a silhouette AGAINST. Six flat steps, brightest at the horizon, and the bands
   * in front of it are near-black — which is also the ink rule (§1.1) applied to the largest flat
   * area in the frame: a screen-printed sky is banded, not smooth. */
  const SKY = [[0.030, 0.012, 0.062], [0.046, 0.016, 0.088], [0.068, 0.020, 0.118],
               [0.098, 0.026, 0.152], [0.140, 0.034, 0.176], [0.190, 0.052, 0.190]];
  const setFog = (n, f) => gl.uniform2fv(u(litProg, 'uFogND'), [n, f]);
  function drawSky(midX) {
    _surf = 2; setFog(1e6, 2e6);                              // the sky IS the fog colour's replacement — never fogged
    const top = 52, bot = -3, n = SKY.length, hstep = (top - bot) / n;
    for (let i = 0; i < n; i++)
      draw('vquad', M.mul(M.T(midX, bot + hstep * (i + 0.5), -88), M.S(300, hstep + 0.04, 1)), SKY[i], 0, 1);
    _surf = -1; setFog(17, 58);
  }
  function drawBand(midX, bi) {
    const B = BANDS[bi], half = (B.n - 1) / 2;
    _surf = 2;
    for (let i = 0; i < B.n; i++) {
      const k = i - half, s1 = Math.sin(k * 12.9898 + bi * 4.1) * 43758.5453, r1 = s1 - Math.floor(s1);
      const s2 = Math.sin(k * 78.233 + bi * 1.7) * 12345.678, r2 = s2 - Math.floor(s2);
      const bh = B.h0 + r1 * B.hv, bx = midX + k * B.sp + (r2 - 0.5) * B.sp * 0.5;
      bit3(bx, bh / 2, B.z - r2 * 3.5, B.w * (0.7 + r2 * 0.6), bh, B.w, B.col, B.emis);
    }
  }
  function drawBackdrop(midX) {
    setFog(34, 104);                                          // the backdrop wants aerial perspective, not the fighters' fog
    for (let bi = 0; bi < BANDS.length; bi++) drawBand(midX, bi);
    /* THE AUDIENCE — the deck, watching the title fight. DELTRON-3030.md idea 3: the battle is a
     * performance, and NEON RONIN "lacks the sense of an audience and a championship". They are
     * card-shaped standees on end, deliberately silhouettes, and deliberately STILL: a crowd that
     * sways on a timer is the screensaver again. See RONIN-ART §5 open question 2. */
    setFog(17, 58); drawCrowd(midX);
  }
  /* THE AUDIENCE — the deck, watching the title fight. DELTRON-3030.md idea 3: the battle is a
   * performance, and NEON RONIN "lacks the sense of an audience and a championship". Card-shaped
   * standees on end, in two ranks against the far die edge.
   * ⚠ First pass they were 1.5 units tall at 24 units out and read as thin bright glitches at the
   *   frame margins rather than as a crowd — a crowd that does not read is worse than no crowd.
   *   Bigger, denser and drawn as INK, so the die profile gives every card its own cut edge.
   * ⛔ They do not sway. A crowd on a timer is the screensaver again (§4). */
  function drawCrowd(midX) {
    /* ⚠ THE ROTATION HAD TO COME DOWN. At ±0.28 rad half of them were near enough to edge-on that
     * all you saw was the die profile firing on a 0.09-deep sliver — a row of thin bright ticks
     * that read as rendering glitches at the frame margins, not as an audience. A card held up
     * faces the front; the jitter is what stops it being a wall. */
    /* ⚠ THE AUDIENCE IS FLAT, NOT INK, and that is a legibility decision taken against the
     * material rule on purpose. As ink they got the die profile, and at 21 units a 0.10-deep card
     * shows a near-white cut edge against a face ten times darker — so all you saw was a picket
     * fence of bright sticks. A crowd at distance IS a silhouette; the material read belongs to
     * things you are close enough to read the material of. Flat, and a shade above the low sky so
     * the card shapes are what carries. */
    _surf = 2; _mat = 0;
    for (let i = 0; i < 54; i++) {
      const k = i - 26.5, s = Math.sin(k * 34.17) * 9871.23, r = s - Math.floor(s);
      const rank = i % 2, zz = -(CARD_HALF_Z + 0.6 + rank * 1.5), hh = (1.7 + r * 0.45) * (rank ? 1.2 : 1);
      const v = rank ? 0.88 : 1.0;
      draw('cube', M.mul(M.mul(M.T(midX + k * 1.34 + (r - 0.5) * 0.5, hh / 2 + rank * 0.5, zz), M.Ry((r - 0.5) * 0.16)),
        M.S(1.02, hh, 0.10)), [0.078 * v, 0.038 * v, 0.130 * v], 0, 1);
    }
    _surf = -1;
  }
  function drawScene(G) {
    const a = G.fighters[0], b = G.fighters[1];
    const midX = G.worldMode ? (G.me && G.me.w ? G.me.w.x : 0) : ((a ? a.x : 0) + (b ? b.x : 0)) / 2 * SC;
    {
      gl.enable(gl.BLEND);
      // 1. THE STAGE — the table, then the die-cut foil card lying on it. RONIN-ART §2.
      gl.useProgram(groundProg); curMesh = '';
      gl.uniform3fv(u(groundProg, 'uCam'), camPos); gl.uniform3fv(u(groundProg, 'uFog'), FOG);
      gl.uniform2fv(u(groundProg, 'uFogND'), [10, 44]); gl.uniform1f(u(groundProg, 'uTime'), t3);
      gl.uniform3fv(u(groundProg, 'uKeyD'), LIGHT.keyD); gl.uniform3fv(u(groundProg, 'uKeyC'), LIGHT.keyC);
      gl.uniform3fv(u(groundProg, 'uFillC'), LIGHT.fillC); gl.uniform3fv(u(groundProg, 'uRimC'), LIGHT.rimC);
      /* ⚠ THE WATER PLANE IS A FREE-ROAM PROP, NOT A STAGE FLOOR. It belongs to the shelved city
         (something to see past the edge of the world while running around); under a DUEL it sits
         0.35 below the fight line and reads as the fighters standing on nothing. A level used as
         a stage brings its own floor in the mesh, so it gets neither plane — but the card floor
         is kept for the neon grid, which is the fight's own table (RONIN-ART section 2). */
      if (worldMesh && G.worldMode) drawFloor(midX, 2, 100, 100, -0.35);
      else if (!worldMesh) { drawFloor(midX, 0, 150, 90, -0.10); drawFloor(midX, 1, CARD_HALF_X, CARD_HALF_Z, 0); }

      setLit(); _mat = 0;
      // 1b. the baked city, if a world is loaded — one opaque batch, lit like everything else
      /* ⛔ THE STAGE WAS DRAWING AND WAS INVISIBLE, which is a different bug from not drawing and
       *   looks identical on screen. The duel's fog is 17->58 m, tuned for the neon grid: that
       *   table is ~3 m wide and everything past it SHOULD go to fog. A baked level is not a
       *   table. Measured extents of the three:
       *       rooftop  x +/-82.5  y 0->57.2  z +/-78.1   (2,900 tris, 1,307 behind the cut)
       *       arcade   x +/-60    y 0->27.5  z +/-42.7  (10,684 tris, 5,978 behind)
       *       vault    x +/-49.7  y 0->25.9  z +/-52.4   (6,624 tris, 3,337 behind)
       *   Its backdrop therefore sits 40-80 m out — entirely past the 58 m fog end — so the arena
       *   was fogged to flat colour and all three read as the same empty void.
       * ⚑ THE RANGE IS DERIVED FROM THE GEOMETRY, NOT PICKED BY EYE. `worldFar` is the level's own
       *   measured depth, so a new level brings its own range and nobody re-tunes a constant. This
       *   is a "the geometry is outside the visible range" correctness fix, the same shape as
       *   Section 9's missing `open:true` flag — NOT a lighting-taste decision. How the arena
       *   should actually be lit and dressed is the artist's (DESIGN-SYSTEM section 1/2). */
      if (worldMesh) { _mat = 8; setFog(worldFar * 0.35, worldFar * 1.15);
        draw('world', M.T(-worldOrigin[0], -worldOrigin[1], -worldOrigin[2]), [0.7, 0.6, 0.9], 0, 1);
        setFog(17, 58); _mat = 0; }
      // 2. the printed sky, three parallax bands, the audience — only when there's no baked world
      if (!worldMesh) {
        drawSky(midX);
        _surf = 2; setFog(34, 104); draw('sph', M.mul(M.T(midX + 15, 13.5, -64), M.S(6, 6, 6)), [0.92, 0.88, 0.78], 1, 1); setFog(17, 58); _surf = -1;
        drawBackdrop(midX);
      }
      // 3. reflections (drawn over the floor, depth-test off, faded) — the foil is a mirror
      gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
      for (const f of G.fighters) if (f) drawFighter(f, true);
      // 4. contact shadows
      for (const f of G.fighters) if (f) drawShadow(f);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
      // 5. fighters
      for (const f of G.fighters) if (f) drawFighter(f, false);
      // 5b. THE REGISTRATION SLIP — the signature impact effect. RONIN-ART §3.1.
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
      for (const f of G.fighters) if (f) drawPlateSlip(f);
      gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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

  /* ══ HEADLESS ART-DIRECTION PROBE — driven by scripts/test-ronin-art.mjs ═══════════════════
   * Renders through the SHIPPED drawFighter / drawScene path into a private framebuffer at a
   * fixed size and a fixed camera, and hands the pixels straight back.
   *
   * ⚠ readPixels, NEVER a screenshot. This container rotates hue on canvas content (CLAUDE.md),
   *   so every colour claim in docs/RONIN-ART.md — foil hue travel, ink value steps — has to come
   *   from the framebuffer the GPU actually wrote. Layout may be judged from a screenshot; colour
   *   may not. It is also why this needs its OWN framebuffer: the game's canvas has no
   *   `preserveDrawingBuffer`, so a readback from it outside the drawing task returns zeros.
   *
   * ⚑ It draws through the same functions the game does ON PURPOSE. A probe with its own copy of
   *   the draw path measures the copy, and the copy is what drifts. Nothing in the game calls it.
   */
  let probeFB = null;
  function probeTarget(size) {
    if (probeFB && probeFB.size === size) return probeFB;
    if (probeFB) { gl.deleteFramebuffer(probeFB.fb); gl.deleteTexture(probeFB.tex); gl.deleteRenderbuffer(probeFB.rb); probeFB = null; }
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    const good = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return good ? (probeFB = { fb, tex, rb, size }) : null;
  }
  function probe(o) {
    if (!ok) return null;
    o = o || {};
    try {
      const size = Math.max(32, Math.min(320, o.size || 128));
      const T = probeTarget(size); if (!T) return null;
      const az = o.az || 0, dist = o.dist == null ? 4.6 : o.dist, hgt = o.hgt == null ? 1.55 : o.hgt;
      const look = o.look == null ? 1.45 : o.look, bg = o.bg || [0, 0, 0];
      // `pan` trucks the camera sideways WITHOUT turning it — the fight camera's dominant motion,
      // since it tracks the fighters' midpoint every frame. `az` orbits. The two produce different
      // parallax signs and the test measures the truck. See scripts/test-ronin-art.mjs §10.
      const pan = o.pan || 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb); gl.viewport(0, 0, size, size);
      gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      camPos = [Math.sin(az) * dist + pan, hgt, Math.cos(az) * dist];
      const tgt = [pan, look, 0];
      VP = M.mul(M.persp(0.72, 1, 0.1, 200), M.look(camPos, tgt, [0, 1, 0]));
      { const fwd = norm(sub(tgt, camPos)); camRight = norm(cross(fwd, [0, 1, 0])); camUp = cross(camRight, fwd); }
      if (o.foil != null) {                                   // a bare swatch of one material, for the hue test
        /* ⚠ A SPHERE, NOT A CUBE. A cube face has one normal, so the whole face shifts together
         * and a median over the swatch barely moves — the measurement said 15° for a material
         * that plainly walks. A sphere presents every normal, and the CENTRE pixel is the same
         * surface point facing the camera at every azimuth, which is literally what
         * DESIGN-SYSTEM §1's acceptance test asks for: one point, several view angles. */
        setLit(); _mat = o.foil; _surf = -1;
        draw('sph', M.mul(M.T(0, look, 0), M.S(2.0, 2.0, 2.0)), o.col || [0.86, 0.90, 0.96], 0, 1);
      }
      else if (o.stage) drawScene({ fighters: [], fx: [], pops: [] });
      else if (o.band != null) { setLit(); _mat = 0; setFog(34, 104); drawBand(0, o.band); setFog(17, 58); _surf = -1; }
      else if (o.trail && o.f) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
        gl.useProgram(trailProg); gl.uniformMatrix4fv(u(trailProg, 'uVP'), false, VP);
        drawTrail3(o.f);
        gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
      else if (o.f) {
        const f = o.f, sx = f.x, sz = f.z, sy = f.yLift, sw = f.w;
        f.x = 0; f.z = 0; f.yLift = 0; f.w = null;
        setLit(); _mat = 0;
        try { drawFighter(f, false); } catch (e) {}
        if (o.slip) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); drawPlateSlip(f);
          gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
        f.x = sx; f.z = sz; f.yLift = sy; f.w = sw;
      }
      const px = new Uint8Array(size * size * 4);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { size, px: Array.prototype.slice.call(px) };
    } catch (e) { try { gl.bindFramebuffer(gl.FRAMEBUFFER, null); } catch (e2) {} return null; }
  }

  return { init, render, registerModel, hasModel, registerSkin, hasSkin, setMorphVariant, setWorld, hasWorld,
           post: () => post, get ok() { return ok; },
           // ── art-direction introspection. Test surface only; the game never calls these. ──
           probe, shaders: () => ({ LIT_VS, LIT_FS, GND_VS, GND_FS, TR_VS, TR_FS, SP_VS, SP_FS, SK_VS }),
           light: () => LIGHT, soft: f => (f && softs[f.id]) || null, step: (G, dt) => stepSoft(G, dt),
           shake: (G, dt, dir) => shakeOffset(G, dt, dir) };
})();

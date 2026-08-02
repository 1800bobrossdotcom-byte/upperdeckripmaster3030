/* ripmaster3030studios — GfxPost: one shared post-process chain for every WebGL game.
 *
 * NEON RONIN grew a bloom compositor inline; the other games (Section 9, Cloudracer) render
 * straight to the default framebuffer and look flat next to it. This lifts that chain out into a
 * renderer-agnostic module so any game can wrap its existing draw in two calls:
 *
 *     const P = GfxPost.create(gl, canvas, GfxPost.PRESET.tactical);
 *     ...
 *     P.begin();          // scene now renders into an offscreen colour+depth target
 *     drawEverything();   // unchanged game code
 *     P.end();            // bright-pass → separable gaussian → composite to the screen
 *
 * The chain is scene → bright-pass → half-res ping-pong blur ×N → composite with additive bloom,
 * chromatic aberration, vignette and film grain.
 *
 * FAIL-OPEN BY DESIGN. If shader compilation, the FBO chain, or anything else fails, `on` goes
 * false and begin()/end() become no-ops — the game draws exactly as it did before, uncomposited.
 * A pretty frame is never worth a black screen.
 *
 * ═══ SPEED AND TIME — the brief, before the code (docs/DESIGN-SYSTEM.md §8) ═══════════════════
 *
 * Three effects, one chain. Each answers all five questions, because a brief that names the
 * material and the light and waves at the motion produces the default — twice recorded.
 *
 * ── ① VELOCITY SMEAR ────────────────────────────────────────────────────────────────────────
 * 1 MADE OF   one frame of the previous image, held. Film left open a moment too long. Not a
 *             filter and not a texture: an accumulation target.
 * 2 LIT BY    nothing. It is not lit, it is EXPOSED — every other stage shades the frame, this
 *             one integrates it over time.
 * 3 MOVES     the image on the sensor moved during the exposure, and whatever moved smears by
 *             however far it went. ROTATION translates every pixel equally (dominant).
 *             TRANSLATION slides a point at v⊥/d rad/s, so near geometry streaks and far
 *             geometry does not — a full-screen feedback cannot do the depth half, so it is
 *             folded in as a scalar weighted LOWER (`wVel` 0.55, not 1). Being honest about
 *             that is the reason for the number.
 *             ⚑ Measured from the camera's POSITION DELTA, never from intended velocity — so
 *             running into a wall smears nothing, which is correct, because nothing moved.
 *             ⚑ Per FRAME, not per second: the exposure IS the frame, so there is nothing to
 *             divide by. Reference rates are written per second and divided by REF_HZ at use.
 * 4 SITS ON   the backbuffer. Games draw their HUD on a separate 2D overlay composited after,
 *             so the world smears and the instruments stay sharp — a camera behind glass.
 * 5 MEASURED  mean |Δ| between consecutive frames must FALL when the smear is on (that is what
 *             a smear IS); a still camera must give exactly 0 so the shader branch is not taken;
 *             and smear LENGTH in pixels at a stated turn rate.
 *
 * ── ② TIME DILATION (slow-mo) ───────────────────────────────────────────────────────────────
 * ⛔ The honest velocity smear FALLS in slow motion — the world covers less ground per exposure —
 *    which is exactly why slow-mo cannot ride on it and needs its own treatment.
 * 1 MADE OF   the CABINET, not the camera. A projector dropped below sync: the gate holds each
 *             frame, the three-strip registration drifts apart, and the cool ink separates out
 *             into the shadows first because it is the weakest plate.
 * 2 LIT BY    the RIM, cyan `#27f7e4` (DESIGN-SYSTEM §2) — the light that picks edges out of the
 *             dark, which is the one that should survive when the lamp is dimming.
 * 3 MOVES     nothing new moves. Three things STOP moving fast enough: persistence (a smear
 *             FLOOR independent of speed), registration (CA widens — the plates no longer land
 *             together), and the tunnel narrows (vignette up, saturation down).
 *             ⚑ And it runs the other way too: `timeScale > 1` means the exposure covers MORE
 *             world motion, so the velocity term is multiplied rather than a new knob added.
 * 4 SITS ON   the same backbuffer, and on the same accumulation pair — allocated lazily, so a
 *             game that never dilates never pays for it.
 * 5 MEASURED  hue of the darkest quartile shifts toward cyan by a stated number of degrees while
 *             the highlights keep theirs; CA displacement in pixels at the corner; clipping 0.
 *
 * ── ③ THE PICKUP FLASH — "more acid like effects when taking power ups" ──────────────────────
 * ⛔ Acid here is HUE TRAVEL AND SATURATION, not white bloom. A white flash is the default and
 *    the default has been rejected twice in this project.
 * 1 MADE OF   FOIL — §1's material, finally on a screen effect. A diffraction front off a
 *             hot-stamped surface. ⚑ And it is a FOUR-COLOUR SEPARATION, not a rainbow: the
 *             studio's own inks (gold `#ffd23b`, key green `#2bff80`, rim cyan `#27f7e4`, fill
 *             magenta `#ff2ad9`) in flat hard bands, because §6 says the lineage is hand-drawn
 *             saturated flat ink with crude registration — a cereal box out of register, not a
 *             smooth CG spectrum. A continuous rainbow ramp IS the default here.
 * 2 LIT BY    itself. It is the light source; that is what a pickup is.
 * 3 MOVES     ⚑ THE §1 RULE, LITERALLY: the hue at a fixed pixel walks because the GEOMETRY
 *             changed, not because a gradient scrolled. A ring expands from the pickup at a
 *             finite, decelerating speed; the ink at any pixel is keyed to that pixel's distance
 *             FROM THE FRONT, so as the front sweeps past, that pixel steps gold → green → cyan
 *             → magenta. Nothing is painted on; the front moved.
 * 4 SITS ON   the composited frame, taking what is LEFT of the range rather than adding to it
 *             (a screen blend with headroom, see the shader's step 6.5). ⛔ It was written as an
 *             add above the highlight knee first, on the reasoning that the knee is what stops
 *             light clipping — measured, that was wrong, and the note at the code records why.
 *             It is placed at the pickup's own screen position, never at screen centre: a
 *             centred flash is the default and it lies about where the thing was.
 * 5 MEASURED  §1's acceptance test applied literally — hue travel in DEGREES at a fixed pixel
 *             across the front's passage. No travel, no foil. Plus: clipping stays at 0.
 *
 * ── THE INTERFACE (one line each, all fail-open, all no-ops until called) ────────────────────
 *     post.camera({yaw, pitch, x, y, z})   every frame — derives ① from what actually happened
 *     GfxPost.timeScale(0.35)              page-global; 1 = real time, <1 dilates, >1 compresses
 *     GfxPost.flash({x, y, strength})      fire ③; x/y are 0..1 screen coords, y=0 at the TOP
 * The two module-level calls fan out to every live chain on the page, because time is a property
 * of the page and not of one canvas. Per-instance methods of the same names exist for callers
 * that want one canvas to disagree.
 */
window.GfxPost = (function () {
  const PVS = 'attribute vec2 p; varying vec2 uv; void main(){ uv=p*0.5+0.5; gl_Position=vec4(p,0.0,1.0); }';

  const P_BRIGHT = 'precision mediump float; varying vec2 uv; uniform sampler2D t; uniform float thr;' +
    'void main(){ vec3 c=texture2D(t,uv).rgb; float l=dot(c,vec3(0.299,0.587,0.114));' +
    ' float k=max(0.0,l-thr)/max(l,0.001); gl_FragColor=vec4(c*k*c*1.25,1.0); }';

  const P_BLUR = 'precision mediump float; varying vec2 uv; uniform sampler2D t; uniform vec2 dir;' +
    'void main(){ vec3 s=vec3(0.0);' +
    's+=texture2D(t,uv+dir*-4.0).rgb*0.05; s+=texture2D(t,uv+dir*-3.0).rgb*0.09;' +
    's+=texture2D(t,uv+dir*-2.0).rgb*0.12; s+=texture2D(t,uv+dir*-1.0).rgb*0.15;' +
    's+=texture2D(t,uv).rgb*0.18;' +
    's+=texture2D(t,uv+dir*1.0).rgb*0.15; s+=texture2D(t,uv+dir*2.0).rgb*0.12;' +
    's+=texture2D(t,uv+dir*3.0).rgb*0.09; s+=texture2D(t,uv+dir*4.0).rgb*0.05;' +
    'gl_FragColor=vec4(s,1.0); }';

  /* The composite. Everything after the blur happens here, in one pass, in this order —
   * the order matters more than any single effect:
   *
   *   1 chromatic aberration   sampled, so it displaces the SOURCE not the result
   *   2 additive bloom
   *   3 HIGHLIGHT ROLLOFF      the important one. These games are LDR, so adding bloom
   *                            pushes bright pixels past 1.0 and the GPU clips them to flat
   *                            white — which is exactly how Cloudracer's cloudscape turned
   *                            into a wash. Scaling by luminance above a knee rolls those
   *                            off smoothly instead, preserving hue, and is identity below
   *                            the knee so the rest of the frame is untouched.
   *   3.5 DILATION TINT        the cool plate separating into the shadows. A grade, keyed to
   *                            the TOE only, so it cannot lift a highlight or clip anything.
   *   4 saturation / vignette
   *   6.5 THE PICKUP FLASH     ⚑ LAST of the colour stages, and a SCREEN with headroom rather
   *                            than an add. It was tried above the knee first and measured at
   *                            0.19% clipped subpixels — the note in the shader records why the
   *                            knee cannot protect a saturated ink, and why this form cannot
   *                            clip at all. After the unsharp, so the ring is not given an
   *                            outline no light source has; before the dither, so the ±1 LSB
   *                            that hides banding lands on the finished picture.
   *   5 ORDERED DITHER         8x8 Bayer, ±1/255. Kills the banding that shows up in dark
   *                            gradients (Section 9's corridors, the ronin night sky) where
   *                            8-bit output quantises a smooth ramp into visible steps.
   *   6 SHARPEN                a small unsharp against the 4-neighbour average. Low-poly art
   *                            reads crisper, and it wins back the softness the blur added.
   *   7 grain
   */
  const P_COMP = 'precision mediump float; varying vec2 uv;' +
    'uniform sampler2D base; uniform sampler2D bloom; uniform sampler2D prev; uniform vec2 texel;' +
    'uniform float intensity; uniform float ca; uniform float grain; uniform float vig;' +
    'uniform float sat; uniform float knee; uniform float dither; uniform float sharpen; uniform float smear;' +
    // ── speed & time. Every one of these is 0 until something calls for it, and at 0 the
    //    branches below are not taken, so a chain nobody drives is the chain that shipped.
    'uniform vec4 p0; uniform vec4 p1; uniform vec4 p2; uniform vec3 phu; uniform float tint;' +
    'uniform float pceil;' +
    'float h(vec2 p){ return fract(sin(dot(p,vec2(41.0,289.0)))*43758.5453); }' +
    // 8x8 Bayer without a lookup texture: the classic bit-interleave, unrolled cheaply.
    'float bayer(vec2 p){ vec2 t=floor(mod(p,8.0));' +
    ' float b=0.0, s=1.0;' +
    ' for(int i=0;i<3;i++){ vec2 f=floor(mod(t,2.0)); b+=s*(f.x+2.0*mod(f.x+f.y,2.0)); s*=4.0; t=floor(t*0.5); }' +
    ' return b/64.0; }' +
    /* THE FOUR HOUSE INKS, as a hard-stepped wheel — DESIGN-SYSTEM §2's palette, in plate order.
     * The 0.028 shoulder is anti-aliasing, not a gradient: at 1080p it is ~3 px of the ring's
     * width, so the bands read as flat ink with a crude register rather than as a spectrum.
     * ⚠ The wrap back to gold gets the same shoulder as the other three, or the one seam in the
     *   ring would be the only hard edge in it and would read as a bug. */
    'vec3 ink(float x){ x=fract(x); const float e=0.028;' +
    ' vec3 c=vec3(1.000,0.824,0.231);' +
    ' c=mix(c,vec3(0.169,1.000,0.502),smoothstep(0.25-e,0.25+e,x));' +
    ' c=mix(c,vec3(0.153,0.969,0.894),smoothstep(0.50-e,0.50+e,x));' +
    ' c=mix(c,vec3(1.000,0.165,0.851),smoothstep(0.75-e,0.75+e,x));' +
    ' c=mix(c,vec3(1.000,0.824,0.231),smoothstep(1.0-e,1.0,x));' +
    ' return c; }' +
    /* ONE diffraction front. P = (cx, cy, radius, amplitude); hu = the plate the front opens on.
     * ⚑ The hue is keyed to (d - radius) — the pixel's distance FROM THE FRONT — so a pixel that
     *   never moves still walks the whole wheel as the front sweeps over it. That is §1's rule
     *   expressed as arithmetic: the colour changed because the geometry did.
     * Aspect from `texel` (= 1/w, 1/h), so the ring is round on the screen, not on the uv square.
     * `wash` is the ambient half — a wide, weak lift in the same ink, so the pickup lights the
     * room rather than only drawing a hoop. */
    'vec3 pul(vec2 c2, vec4 P, float hu){ if(P.w<=0.0) return vec3(0.0);' +
    ' vec2 q=(c2-P.xy)*vec2(texel.y/texel.x,1.0); float d=length(q);' +
    ' float w=0.035+0.20*P.z; float e=(d-P.z)/w;' +
    ' float ring=exp(-e*e); float wash=exp(-d*d*2.4)*0.14;' +
    ' return ink(hu+(d-P.z)*2.6)*(ring+wash)*P.w; }' +
    'vec3 grab(vec2 c){ vec2 dd=c-0.5; vec3 o;' +
    ' o.r=texture2D(base,c+dd*ca).r; o.g=texture2D(base,c).g; o.b=texture2D(base,c-dd*ca).b;' +
    ' return o+texture2D(bloom,c).rgb*intensity; }' +
    'void main(){ vec2 dd=uv-0.5;' +
    ' vec3 col=grab(uv);' +
    // the pickup flash is COMPUTED here and APPLIED at step 6.5 — see the note down there for
    // why it is not added at this point, which is where it was first written and measured wrong.
    ' vec3 pls=vec3(0.0); float pAmp=p0.w+p1.w+p2.w;' +
    ' if(pAmp>0.0){ pls=pul(uv,p0,phu.x)+pul(uv,p1,phu.y)+pul(uv,p2,phu.z);' +
    /* ⚑ ASYMPTOTE FIRST, so three overlapping flashes cannot stack past one. `p·c/(c+max(p))`
     *   tends to c however large the sum gets. */
    '   float pm=max(pls.r,max(pls.g,pls.b)); pls*= pceil/(pceil+pm); }' +
    // 3 — highlight rolloff, luminance-keyed so colour does not shift
    ' float l=dot(col,vec3(0.299,0.587,0.114));' +
    ' col*= 1.0/(1.0+max(0.0,l-knee));' +
    /* 3.5 — DILATION TINT. The cool plate separating out into the shadows: cyan `#27f7e4`, the
     * RIM light of DESIGN-SYSTEM §2. `toe` is cubed, so it is ~1 on black, ~0.06 at mid grey and
     * exactly 0 at white — a flat hue rotate over the whole frame is the thing §1 calls out as
     * NOT foil, while one plate drifting in the shadows is a print failure, which is this
     * studio's own language.
     * ⛔ IT IS A LUMINANCE-PRESERVING CROSS-FADE, NOT AN ADD, AND THAT WAS MEASURED. The first
     *   cut was `col += CYAN*tint*toe`, which at the same visible hue shift lifted mean luma
     *   37.5 → 52.3 and cost 4.5 RMS — DESIGN-SYSTEM §5's "blacks stay black" broken, and the
     *   same shape of mistake as the 0.62 knee: it moved the whole image to move one property of
     *   it. Mixing toward cyan RESCALED TO THE PIXEL'S OWN LUMINANCE rotates the hue and leaves
     *   the luminance where it was. 0.716 is cyan's luma, precomputed. */
    ' if(tint>0.0001){ float toe=1.0-min(1.0,l); toe=toe*toe*toe;' +
    '   col=mix(col, vec3(0.153,0.969,0.894)*(l/0.716), min(0.92,tint*toe)); }' +
    // 6 — unsharp against the neighbourhood (skipped when sharpen==0)
    ' if(sharpen>0.001){' +
    '   vec3 n=grab(uv+vec2(texel.x,0.0))+grab(uv-vec2(texel.x,0.0))' +
    '         +grab(uv+vec2(0.0,texel.y))+grab(uv-vec2(0.0,texel.y));' +
    '   col+= (col-n*0.25)*sharpen; }' +
    // 4 — saturation, then vignette
    ' float lum=dot(col,vec3(0.299,0.587,0.114)); col=mix(vec3(lum),col,sat);' +
    ' float v=smoothstep(1.12,0.34,length(dd)); col*=mix(1.0-vig,1.0,v);' +
    /* 6.5 — THE PICKUP FLASH, and it takes the REMAINING HEADROOM rather than adding to what is
     * there. ⛔ It was written as `col += pls` above the knee first, on the reasoning that the
     * knee is what stops light clipping. MEASURED, that was wrong: the rolloff is LUMINANCE-keyed
     * so that it cannot shift hue, and a luminance key cannot protect a SATURATED channel — one
     * channel of a saturated ink sits far above its own luminance. At strength 1.25 the flash
     * clipped 0.19% of subpixels straight through the knee, and a swept ceiling only ever reduced
     * that (9.96% → 0.18% from no ceiling down to 0.40) without reaching zero, because an ADD
     * always can.
     * `col + pls·(0.978 − col)` is a screen blend with headroom: the result lies between col and
     * 0.978 whatever pls is, so the flash CANNOT increase clipping — it is a property of the
     * arithmetic, not a value that was tuned until the number went away. 0.978 leaves 0.022 of
     * room for the dither (±0.0045) and the grain (±0.010) that follow.
     * ⚑ And the model is right as well as safe: a flare is light filling what is LEFT of the
     *   range, so it reads hardest on the dark parts of the frame — which on a game that is
     *   mostly near-black is exactly the blacklight look the ask asked for. */
    ' if(pAmp>0.0){ col+= pls*max(vec3(0.0), vec3(0.978)-col); }' +
    // 5 — ordered dither before the 8-bit write
    ' col+= (bayer(gl_FragCoord.xy)-0.5)*dither;' +
    // 7 — grain last, so it is not sharpened into crawling speckle
    ' col+= (h(uv*vec2(1023.0,791.0)+grain)-0.5)*0.02;' +
    // 8 — MOTION SMEAR: feedback against the previously presented frame. Identity at smear==0,
    //     and the branch keeps the extra fetch off the wire entirely for presets that never
    //     enable it, so nothing that does not opt in pays for this.
    ' if(smear>0.001){ col=mix(col, texture2D(prev,uv).rgb, smear); }' +
    ' gl_FragColor=vec4(col,1.0); }';

  // trivial blit, used only on the smear path to put the accumulated frame on the screen
  const P_BLIT = 'precision mediump float; varying vec2 uv; uniform sampler2D t;' +
    'void main(){ gl_FragColor=vec4(texture2D(t,uv).rgb,1.0); }';

  /* Per-game looks. `tactical` is deliberately restrained — Section 9 is a gritty FPS, not a
   * neon duel, so the bloom reads as bounced light rather than a glow filter. */
  /* MOTION SMEAR (`blur`) is per-CALLER, not per-preset-name: create() merges whatever object it
   * is handed over PRESET.neon, so `{...GfxPost.PRESET.neon, blur: 0.3}` gives one game a smear
   * without the other game that also uses `neon` inheriting it. Every named preset below is 0
   * except `tactical`; anything that does not set it keeps today's chain exactly, down to the
   * shader branch never being taken.
   *
   * The value is a CEILING, not an amount. The game calls post.motion(0..1) each frame from how
   * fast the camera is actually turning, and the feedback mix is motion × blur — so a still
   * camera is pin sharp and only a whip-pan smears. Held below ~0.85 on purpose: this is a
   * feedback loop, and at higher mixes the frame never lets go of what it saw. */
  const PRESET = {
    // knee    : luminance above which highlights roll off instead of clipping. MEASURED, not
    //           guessed — swept against Cloudracer's clipped-pixel count. 0.94 removes 100%
    //           of clipping at no cost (mean 129.5 vs 128.8 unrolled, contrast 73.2 vs 73.3);
    //           0.62 also removed it but cost 14 luma and 14 contrast, dimming the whole sky
    //           rather than just the highlights. Lower is NOT safer here, it is just darker.
    // dither  : ordered-dither amplitude, in 1/255 units (banding killer, keep it small)
    // sharpen : unsharp strength. Low-poly wants some; photographic sources do not.
    // blur    : motion-smear CEILING, scaled every frame by post.motion(). 0 = off (default).
    neon:     { intensity: 1.15, threshold: 0.62, ca: 0.0022, vignette: 0.36, sat: 1.00,
                knee: 0.92, dither: 0.0045, sharpen: 0.18, passes: 2, blur: 0 },
    tactical: { intensity: 0.62, threshold: 0.70, ca: 0.0012, vignette: 0.42, sat: 1.06,
                knee: 0.94, dither: 0.0045, sharpen: 0.26, passes: 2, blur: 0.55 },
    // Cloudracer flies through an already near-white sky: a low threshold blooms the whole
    // cloudscape into a flat wash, so only genuine highlights (engines, neon trim) get to glow.
    sky:      { intensity: 0.34, threshold: 0.90, ca: 0.0010, vignette: 0.22, sat: 1.05,
                knee: 0.94, dither: 0.0060, sharpen: 0.14, passes: 2, blur: 0 },
  };

  /* ── SPEED AND TIME: the shared defaults ──────────────────────────────────────────────────
   * Merged UNDER whichever preset a caller picks, so a preset only names what it disagrees
   * with. Every one of them is inert until the matching call is made — a chain nobody drives
   * composites exactly the frame it composited before this block existed.
   *
   * ⚑ THE VELOCITY REFERENCE IS DERIVED, NOT PICKED. The house frame is fov 0.97 rad vertical
   *   over 16:10, so horizontal fov = 2·atan(tan(0.485)·1.6) = 1.45 rad. Image motion becomes
   *   visible at roughly 2% of frame width in one exposure — 0.029 rad — and at 60 Hz an
   *   exposure is 16.7 ms, so ω = 1.74 rad/s is the THRESHOLD of a visible smear. `wRef` 5.5 is
   *   about three times that: a deliberate turn is faintly soft, a whip-pan saturates.
   * ⚠ `vLo`/`vHi` are in the CALLER'S units per second, and they are Section 9's by default
   *   (walk 4.3, boots 9.6). A game whose top speed is higher MUST raise `vHi`, or the velocity
   *   term saturates at its old ceiling and the blur stops being velocity-driven above it —
   *   which is the exact failure the artist asked us to fix. `post.set({vHi: 18})`.
   */
  const BASE = {
    wRot: 1.0,        // a whip-pan alone may saturate the smear
    wVel: 0.55,       // translation may not — the depth half of it is not being modelled
    wRef: 5.5,        // rad/s that saturates the rotation term (derived above)
    vLo: 4.3,         // m/s — walking. The floor: ordinary movement does not smear
    vHi: 9.6,         // m/s — the fastest a body is expected to go
    /* TIME DILATION. `persist` is the smear FLOOR while dilated — independent of speed, because
     * it is the gate holding the frame, not the camera moving. Held under the same 0.85 cap as
     * everything on this feedback path. The accumulation pair is allocated lazily the first time
     * a dilation actually happens, so a game that never slows time never pays two RGBA targets. */
    persist: 0.58,
    dilCa: 2.6,       // × the base CA at full dilation — the plates drifting out of register
    /* dilTint — how far the toe cross-fades toward the cyan plate at full dilation. SWEPT, not
     * guessed, on a held frame at full dilation. Because the mix is luminance-preserving the
     * whole sweep is FREE, so the only question is how far is too far — and the answer comes
     * from the midtones, not the shadows:
     *     dilTint   mean   rms   clip%   dark-quartile hue   midtone hue
     *       0.00    37.25  27.60  0.0000       223.9°           198.6°
     *       0.14    37.25  27.60  0.0000       210.4°           190.6°
     *       0.30    37.26  27.60  0.0000       199.0°  ← taken  185.9°
     *       0.45    37.26  27.60  0.0000       190.9°           182.7°
     *       0.70    37.26  27.60  0.0000       181.2°           179.3°
     * Cyan's own hue is 174.5°. At 0.70 the shadows AND the midtones have both arrived there,
     * which is a cyan filter over the picture — the flat hue-rotate §1 rejects. 0.30 moves the
     * darkest quartile 24.9° and the midtones only 12.7°, so the frame leans cool where it is
     * dark and keeps its own colour where there is any light in it. That separation is the
     * effect; an equal shift everywhere would be a filter. */
    dilTint: 0.30,
    dilSat: 0.10,     // saturation trimmed by this fraction — the lamp dimming
    dilVig: 0.12,     // vignette added — the tunnel narrowing
    tsMax: 2.0,       // ceiling on the time-compression multiplier, so it cannot run away
    /* THE PICKUP FLASH. `life` is in WORLD seconds, so a flash fired during slow motion stretches
     * with everything else — it is an event in the world, not an animation on the glass. */
    caPulse: 5.0,     // × the base CA at the flash's peak: the prism break
    /* flashCeil — the largest FRACTION of the frame's remaining headroom one flash may take.
     * The asymptote matters more than the number: `p·c/(c+max p)` means three flashes landing on
     * the same pixel reach c and stop, so a run of pickups cannot compound into a white-out. */
    flashCeil: 0.82,
    flashLife: 0.55,
    flashReach: 0.92, // how far across the frame the front travels, in uv (1.0 = half-width)
    flashSpin: 0.55,  // turns of the ink wheel the front's own hue walks over its life
  };
  const REF_HZ = 60;  // the frame rate the reference rates above are written in

  /* ── THE FOUR HOUSE INKS, once, for JS ────────────────────────────────────────────────────
   * DESIGN-SYSTEM §2's palette in plate order — gold is the ACCENT, then key, rim, fill. The
   * composite shader carries the same four as vec3 literals because a GLSL string cannot import
   * anything; that is a second copy of a fact, so `npm run test:gfxfx` reads the four literals
   * back OUT of the shader source and asserts they equal these to the last decimal (ROADMAP §5.4
   * — derive it or assert the copies agree).
   * `ink(x)` is the same hard-stepped wheel the shader walks, for world-space FX that want to
   * land on the same colour the screen effect would: one wheel, two renderers. */
  const INKS = [ [255, 210, 59], [43, 255, 128], [39, 247, 228], [255, 42, 217] ];
  function ink(x) {
    x = x - Math.floor(x);
    return INKS[Math.min(3, Math.floor(x * 4))];
  }

  /* One resolution policy, shared by every caller.
   *
   * A phone at devicePixelRatio 3 asks for a ~1.2M-pixel backing store, and this chain then
   * runs several FULLSCREEN passes over it (bright, two blur pairs, composite) plus, for the
   * 2D games, a whole-canvas texture upload every frame. Pixels are the cost, so the lever is
   * to use fewer: cap the ratio and let the browser scale the result up.
   *
   * ⚑ Returns an ABSOLUTE cap, not a multiplier. A multiplier was the first design and it is
   *   wrong: callers already clamp with Math.min(dpr, 2), and multiplying that by (cap/dpr)
   *   pushed the effective ratio BELOW 1.0 on a dpr-3 phone — rendering under one CSS pixel
   *   per pixel, which is visibly soft. The floor here is 1: never blurrier than CSS.
   *
   *   const DPR = Math.min(devicePixelRatio || 1, GfxPost.dprCap());
   */
  function dprCap() {
    const dpr = self.devicePixelRatio || 1;
    let cap = 2;                                   // desktop default, unchanged from before
    try {
      const touch = matchMedia('(hover:none)').matches || navigator.maxTouchPoints > 0;
      const small = Math.min(screen.width, screen.height) <= 900;
      const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
      const save = navigator.connection && navigator.connection.saveData;
      if (save) cap = 1;
      else if (touch && small) cap = weak ? 1 : 1.5;
      else if (weak) cap = 1.5;
    } catch (e) {}
    return Math.max(1, Math.min(dpr, cap));        // never below 1 CSS pixel
  }
  /** Multiplier form, for callers that scale an existing size (Gfx2D's presentation layer). */
  function deviceScale() { const dpr = self.devicePixelRatio || 1; return dprCap() / Math.max(1, dpr); }

  /* ⛔ HOW POWERFUL THE MACHINE IS, WHICH IS NOT HOW DENSE ITS SCREEN IS.
   *
   * Section 9 derived its quality tier from `dprCap()`:
   *     AUTO_TIER = DPRCAP >= 2 ? 'high' : DPRCAP >= 1.5 ? 'mid' : 'low'
   * and `dprCap()` ends in `Math.min(dpr, cap)`. So a desktop with a strong GPU and an ordinary
   * 1x 1080p monitor scores 1 — the LOWEST tier — while a phone at dpr 3 scores 1.5 and a laptop
   * at dpr 2 scores 'high'. The two quantities are unrelated: pixel density says how many pixels
   * must be filled, not how fast they can be filled.
   *
   * ⚑ It mattered far past frame rate, because `low` carried `skin: false` — so an ordinary
   *   desktop monitor silently switched the game's CHARACTERS off and every operative fell back
   *   to the 11-box rig. That is the "robots with no personality, just stacks of basic geometry"
   *   report, and no amount of art would have fixed it.
   *
   * Same four signals as dprCap, WITHOUT the dpr term. Kept here rather than in the game so
   * "weak device" still has ONE definition in this repo. */
  function deviceTier() {
    try {
      const touch = matchMedia('(hover:none)').matches || navigator.maxTouchPoints > 0;
      const small = Math.min(screen.width, screen.height) <= 900;
      const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
      if (navigator.connection && navigator.connection.saveData) return 'low';
      if (touch && small) return weak ? 'low' : 'mid';
      if (weak) return 'mid';
      const cores = navigator.hardwareConcurrency || 8;
      return cores >= 8 ? 'high' : 'mid';
    } catch (e) { return 'mid'; }
  }

  function create(gl, cv, opts) {
    const O = Object.assign({}, BASE, PRESET.neon, opts || {});
    const S = { on: false, w: 0, h: 0, sceneTex: null, depth: null, sceneFbo: null,
                bA: null, bB: null, fA: null, fB: null, bright: null, blur: null, comp: null, tri: null,
                // motion-smear accumulation: full-res ping-pong, allocated only when blur > 0
                aT: null, aU: null, aF: null, aG: null, blit: null };
    let grainT = 0, maxAttr = 4, bound = false, motionAmt = 0, accWarm = false;
    /* ── speed and time state. All inert: tScale 1, no pulses, no camera history. ── */
    let tScale = 1, dilAmt = 0, camPrev = null, tPrev = 0, lastSmear = 0, lastU = null;
    const PUL = [ { a: 0, age: 0, life: 0, x: 0.5, y: 0.5, hue: 0, amp: 0 },
                  { a: 0, age: 0, life: 0, x: 0.5, y: 0.5, hue: 0, amp: 0 },
                  { a: 0, age: 0, life: 0, x: 0.5, y: 0.5, hue: 0, amp: 0 } ];
    const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
    const nowMs = () => (self.performance && performance.now) ? performance.now() : Date.now();

    function sh(t, src) { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
    function progFor(fs) { const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, PVS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
    const u = (p, n) => gl.getUniformLocation(p, n);

    function tex2d(w, h) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); return t; }
    function fboFor(t) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; }

    // Re-allocating on resize without freeing leaks a full-screen RGBA target per resize event —
    // a maximise/restore loop would climb into hundreds of MB. Drop the old set first.
    function freeTargets() {
      [S.sceneTex, S.bA, S.bB, S.aT, S.aU].forEach(t => t && gl.deleteTexture(t));
      [S.sceneFbo, S.fA, S.fB, S.aF, S.aG].forEach(f => f && gl.deleteFramebuffer(f));
      if (S.depth) gl.deleteRenderbuffer(S.depth);
      S.sceneTex = S.bA = S.bB = S.sceneFbo = S.fA = S.fB = S.depth = null;
      S.aT = S.aU = S.aF = S.aG = null; accWarm = false;
    }
    /* Allocate the accumulation pair lazily — a caller that never sets blur never pays two
     * full-screen RGBA targets for it, and set({blur}) can turn it on later. Failure here is
     * not fatal: the pair stays null and end() takes the ordinary direct-to-screen path.
     * ⚑ `persist` joins `blur` in the gate: slow-mo's hold uses the same pair, so a preset with
     *   blur 0 (neon, sky) can still dilate — but only allocates the first time it actually
     *   does, which is why the gate is here and not in create(). */
    function ensureAcc() {
      if (S.aT || !(O.blur > 0 || O.persist > 0) || !S.w) return !!S.aT;
      try {
        S.aT = tex2d(S.w, S.h); S.aF = fboFor(S.aT);
        S.aU = tex2d(S.w, S.h); S.aG = fboFor(S.aU);
        const okFbo = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (!okFbo || !S.blit) { [S.aT, S.aU].forEach(t => t && gl.deleteTexture(t));
          [S.aF, S.aG].forEach(f => f && gl.deleteFramebuffer(f));
          S.aT = S.aU = S.aF = S.aG = null; }
        accWarm = false;
      } catch (e) { S.aT = S.aU = S.aF = S.aG = null; }
      return !!S.aT;
    }

    function size(w, h) {
      if (S.w === w && S.h === h) return true;
      freeTargets();
      S.w = w; S.h = h;
      const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
      S.sceneTex = tex2d(w, h); S.sceneFbo = fboFor(S.sceneTex);
      S.depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, S.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, S.depth);
      const okFbo = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      S.bA = tex2d(bw, bh); S.fA = fboFor(S.bA); S.bB = tex2d(bw, bh); S.fB = fboFor(S.bB);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!okFbo) { freeTargets(); S.w = S.h = 0; S.on = false; }
      return okFbo;
    }

    try {
      S.bright = progFor(P_BRIGHT); S.blur = progFor(P_BLUR); S.comp = progFor(P_COMP);
      try { S.blit = progFor(P_BLIT); } catch (e) { S.blit = null; }   // smear-only; optional
      S.tri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, S.tri);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      maxAttr = Math.min(8, gl.getParameter(gl.MAX_VERTEX_ATTRIBS) || 4);
      S.on = size(Math.max(2, cv.width | 0), Math.max(2, cv.height | 0));
    } catch (e) { S.on = false; }

    /* The host game leaves its own vertex attributes enabled and pointed at buffers sized for its
     * geometry. A 3-vertex fullscreen triangle bound against those would read past the end, and
     * some drivers silently drop the whole draw. Enable 0, hard-disable the rest. */
    function drawTri() {
      gl.bindBuffer(gl.ARRAY_BUFFER, S.tri);
      for (let i = 1; i < maxAttr; i++) gl.disableVertexAttribArray(i);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function begin() {
      if (!S.on) return false;
      const w = Math.max(2, cv.width | 0), h = Math.max(2, cv.height | 0);
      if ((w !== S.w || h !== S.h) && !size(w, h)) return false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.sceneFbo);
      gl.viewport(0, 0, S.w, S.h);
      bound = true;
      return true;
    }

    function end() {
      if (!S.on || !bound) return false;
      bound = false;
      const w = S.w, h = S.h, bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
      const hadDepth = gl.isEnabled(gl.DEPTH_TEST), hadBlend = gl.isEnabled(gl.BLEND);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);

      gl.bindFramebuffer(gl.FRAMEBUFFER, S.fB); gl.viewport(0, 0, bw, bh);
      gl.useProgram(S.bright); gl.uniform1i(u(S.bright, 't'), 0); gl.uniform1f(u(S.bright, 'thr'), O.threshold);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.sceneTex); drawTri();

      gl.useProgram(S.blur); gl.uniform1i(u(S.blur, 't'), 0);
      for (let i = 0; i < O.passes; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, S.fA); gl.viewport(0, 0, bw, bh);
        gl.uniform2f(u(S.blur, 'dir'), 1.4 / bw, 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.bB); drawTri();
        gl.bindFramebuffer(gl.FRAMEBUFFER, S.fB); gl.viewport(0, 0, bw, bh);
        gl.uniform2f(u(S.blur, 'dir'), 0, 1.4 / bh);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.bA); drawTri();
      }

      grainT = (grainT + 0.017) % 1000;

      /* ── age the flashes on the WORLD clock ────────────────────────────────────────────────
       * Real elapsed time × the time scale, so a pickup taken in bullet-time stretches out with
       * everything else. The 0.25 s clamp is the ordinary tab-was-backgrounded guard: without it
       * one hidden second would retire every live flash between two frames. */
      const tN = nowMs();
      const dtR = tPrev ? Math.min(0.25, (tN - tPrev) / 1000) : 0; tPrev = tN;
      const dtW = dtR * tScale;
      let pMax = 0;
      for (let i = 0; i < 3; i++) {
        const P = PUL[i];
        if (P.a <= 0) continue;
        P.age += dtW;
        const uu = P.life > 0 ? P.age / P.life : 1;
        if (uu >= 1) { P.a = 0; continue; }
        /* ⚑ THE FRONT DECELERATES. r ∝ u^0.62, not u — a shell losing energy into a bigger
         *   circumference, which is also what makes the hue walk FAST at the pickup and slow at
         *   the frame edge. A linear front reads as a UI animation; this reads as an event. */
        P.r = Math.pow(uu, 0.62) * O.flashReach;
        P.a = P.amp * Math.pow(1 - uu, 1.6);
        P.h = P.hue + uu * O.flashSpin;
        if (P.a > pMax) pMax = P.a;
      }

      /* ── the dilation grade. Everything here is × dilAmt, so at real time it is arithmetically
       * the frame that shipped: caNow === O.ca, satNow === O.sat, vigNow === O.vignette. ── */
      const caNow = O.ca * (1 + dilAmt * O.dilCa + pMax * O.caPulse);
      const satNow = O.sat * (1 - dilAmt * O.dilSat);
      const vigNow = Math.min(0.9, O.vignette + dilAmt * O.dilVig);
      const tintNow = dilAmt * O.dilTint;
      /* ⚑ RECORDED so the no-regression claim is testable rather than argued. A game that never
       * calls the new API must hand the composite EXACTLY the preset it always handed it — and
       * the A/B against the pre-change module confirmed 0 differing subpixels on all four
       * shipping preset/motion combinations, but that A/B needs an old file and cannot live in
       * the suite. This can: `state.uniforms` vs `opts` is the same claim, permanently. */
      lastU = { ca: caNow, sat: satNow, vig: vigNow, tint: tintNow, smear: 0, pMax };

      /* Motion smear. The composite normally goes straight to the screen; when it is on, the
       * composite instead lands in an accumulation target that also SAMPLES the previous one, and
       * a blit puts that on the screen. One extra full-screen pass, and only on this path.
       * accWarm guards the first frame after allocation or a resize, where the "previous" target
       * is uninitialised memory — mixing that in is a one-frame flash of garbage.
       * ⚑ TWO INDEPENDENT SOURCES, and `max` not `+`: the velocity term is the camera moving
       *   during the exposure and the persistence term is the gate holding the frame. They are
       *   different mechanisms, so adding them would double-count a fast pan in slow motion —
       *   whichever is holding the frame harder wins.
       * ⚑ `tScale > 1` multiplies the velocity term rather than adding a knob: a compressed clock
       *   means the same exposure covers more world motion. Capped at tsMax so it cannot run away
       *   into a feedback loop that never lets go. */
      const motionMix = motionAmt * Math.max(1, Math.min(O.tsMax, tScale));
      const wantSm = (motionMix * O.blur) + (dilAmt * O.persist) > 0.0004;
      const accOk = (O.blur > 0 || (dilAmt > 0.0005 && O.persist > 0)) && ensureAcc();
      const smear = (accOk && accWarm && wantSm)
        ? Math.max(0, Math.min(0.85, Math.max(motionMix * O.blur, dilAmt * O.persist))) : 0;
      const acc = accOk && !!S.aT;
      lastSmear = smear; lastU.smear = smear;
      // a chain that stops using the pair must forget it: the held frame is now stale, and one
      // stale frame mixed in on resume is a ghost of a moment that has gone.
      if (!acc) accWarm = false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc ? S.aF : null); gl.viewport(0, 0, w, h);
      gl.useProgram(S.comp);
      gl.uniform1i(u(S.comp, 'base'), 0); gl.uniform1i(u(S.comp, 'bloom'), 1);
      gl.uniform1f(u(S.comp, 'intensity'), O.intensity); gl.uniform1f(u(S.comp, 'ca'), caNow);
      gl.uniform1f(u(S.comp, 'grain'), grainT); gl.uniform1f(u(S.comp, 'vig'), vigNow);
      gl.uniform1f(u(S.comp, 'sat'), satNow);
      gl.uniform1f(u(S.comp, 'knee'), O.knee == null ? 0.94 : O.knee);
      gl.uniform1f(u(S.comp, 'dither'), O.dither == null ? 0.0045 : O.dither);
      gl.uniform1f(u(S.comp, 'sharpen'), O.sharpen == null ? 0.2 : O.sharpen);
      gl.uniform2f(u(S.comp, 'texel'), 1 / w, 1 / h);
      gl.uniform1f(u(S.comp, 'smear'), smear); gl.uniform1i(u(S.comp, 'prev'), 2);
      gl.uniform1f(u(S.comp, 'tint'), tintNow);
      /* ⚠ CLAMPED TO 1, AND THE CLAMP IS LOAD-BEARING. The no-clip guarantee is `col + p·(H−col)`
       * lying between col and H, and that holds only while p ≤ 1. The sweep proves it: at a
       * ceiling of 1.15 clipping is 0.0000%, at 1.60 it is 0.1257% and unbounded it is 22.7%.
       * So this is not defensive tidying — it is the boundary the property lives inside. */
      gl.uniform1f(u(S.comp, 'pceil'), Math.min(1, O.flashCeil == null ? 0.82 : O.flashCeil));
      /* ⚠ uv.y is 0 at the BOTTOM in this chain's fullscreen triangle, and 0 at the TOP for every
       *   caller that has a screen position to hand us. The flip lives here, once, rather than in
       *   every game — a convention mismatch nobody can see is a flash that appears in the wrong
       *   half of the frame and reads as a bug in the game's projection. */
      for (let i = 0; i < 3; i++) {
        const P = PUL[i], n = 'p' + i;
        if (P.a > 0) gl.uniform4f(u(S.comp, n), P.x, 1 - P.y, P.r, P.a);
        else gl.uniform4f(u(S.comp, n), 0.5, 0.5, 0, 0);
      }
      gl.uniform3f(u(S.comp, 'phu'), PUL[0].h || 0, PUL[1].h || 0, PUL[2].h || 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.sceneTex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S.bB);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, acc ? S.aU : S.bB);
      drawTri();
      if (acc) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
        gl.useProgram(S.blit); gl.uniform1i(u(S.blit, 't'), 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.aT); drawTri();
        const t = S.aT, f = S.aF; S.aT = S.aU; S.aF = S.aG; S.aU = t; S.aG = f;   // ping-pong
        accWarm = true;
      }
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);

      if (hadDepth) gl.enable(gl.DEPTH_TEST);
      if (hadBlend) gl.enable(gl.BLEND);
      return true;
    }

    function set(o) { Object.assign(O, o || {}); }
    /* How hard the camera is moving, 0..1, for THIS frame. The game owns this because only the
     * game knows what "fast" means for its camera; the chain just scales `blur` by it. Reset is
     * deliberate: a game that stops calling motion() stops smearing rather than freezing at
     * whatever it last said. */
    function motion(v) { motionAmt = Math.max(0, Math.min(1, +v || 0)); }

    /* ── ① camera(): the velocity driver, and the ONE copy of this derivation ────────────────
     * Hand it the camera's absolute state each frame; it differences it here. That is the whole
     * point — three games had grown three hand-rolled "how hard is the camera working" formulas
     * with three different constants, which is CLAUDE.md's "two copies of a fact will diverge"
     * with an extra copy. `motion(v)` still exists and is untouched for callers happy with their
     * own number.
     *
     * Absolute state rather than a velocity for two reasons, both load-bearing:
     *   · it is measured from what HAPPENED, so a turn stopped by a pitch clamp or a sprint into
     *     a wall smears nothing, because nothing moved;
     *   · there is no dt to get wrong. The exposure is the frame.
     * Returns the 0..1 it set, so a caller can display or assert it.
     * ⚠ Position may be omitted ({yaw, pitch}) for a game with no translation — the velocity
     *   term then contributes 0 rather than reading garbage off undefined. */
    function camera(c) {
      if (!c) { camPrev = null; motionAmt = 0; return 0; }
      const yaw = +c.yaw || 0, pit = +c.pitch || 0;
      const x = +c.x || 0, y = +c.y || 0, z = +c.z || 0;
      if (!camPrev) { camPrev = { yaw, pit, x, y, z }; motionAmt = 0; return 0; }
      const TAU = Math.PI * 2;
      let dy = (yaw - camPrev.yaw) % TAU;
      if (dy > Math.PI) dy -= TAU; if (dy < -Math.PI) dy += TAU;
      const dAng = Math.hypot(dy, pit - camPrev.pit);
      const dPos = Math.hypot(x - camPrev.x, y - camPrev.y, z - camPrev.z);
      camPrev.yaw = yaw; camPrev.pit = pit; camPrev.x = x; camPrev.y = y; camPrev.z = z;
      const rot = clamp01(dAng / (O.wRef / REF_HZ));
      const span = Math.max(1e-6, (O.vHi - O.vLo) / REF_HZ);
      const vel = clamp01((dPos - O.vLo / REF_HZ) / span);
      motionAmt = clamp01(rot * O.wRot + vel * O.wVel);
      return motionAmt;
    }

    /* ── ② timeScale(): 1 = real time, <1 dilates, >1 compresses ─────────────────────────────
     * One number in, four treatments out (persistence, registration, tint, tunnel) plus the
     * flashes' own clock. Clamped at 0.05 so a caller that passes 0 to mean "paused" gets a
     * held frame rather than a division by zero. */
    function timeScale(s) {
      tScale = Math.max(0.05, Math.min(8, +s || 1));
      dilAmt = clamp01(1 - tScale);
      return tScale;
    }

    /* ── ③ flash(): fire one diffraction front ───────────────────────────────────────────────
     * o = { x, y, strength, hue, life }. x/y are 0..1 SCREEN coords with y=0 at the top; default
     * dead centre only because a caller with no position is better served by something than by
     * nothing, but a game that knows where the pickup was should say so — §4, "it is placed at
     * the pickup's own screen position, never at screen centre".
     * `hue` picks which of the four plates the front opens on (0 gold ·.25 green ·.5 cyan
     * ·.75 magenta); omitted, it is chosen from the fire time so two pickups in a row are not
     * the same colour, which is the difference between an effect and a loop.
     * Three slots, oldest-first: a fourth flash replaces the one furthest through its life
     * rather than being dropped, so a run of pickups always shows the most recent. */
    function flash(o) {
      o = o || {};
      let slot = 0, worst = -1;
      for (let i = 0; i < 3; i++) {
        const P = PUL[i];
        const done = P.a <= 0 ? 1e9 : (P.life > 0 ? P.age / P.life : 1);
        if (done > worst) { worst = done; slot = i; }
      }
      const P = PUL[slot];
      P.x = o.x == null ? 0.5 : clamp01(+o.x);
      P.y = o.y == null ? 0.5 : clamp01(+o.y);
      P.amp = Math.max(0, Math.min(2, o.strength == null ? 1 : +o.strength));
      P.life = Math.max(0.05, +o.life || O.flashLife);
      P.hue = o.hue == null ? (Math.floor(nowMs() * 0.004) % 4) * 0.25 : (+o.hue || 0);
      P.age = 0; P.a = P.amp; P.r = 0; P.h = P.hue;
      return slot;
    }

    function dispose() {
      freeTargets(); S.on = false;
      const i = LIVE.indexOf(api); if (i >= 0) LIVE.splice(i, 1);
    }

    const api = { begin, end, set, motion, camera, timeScale, flash, dispose,
             get on() { return S.on; }, set on(v) { S.on = !!v && !!S.comp; },
             get opts() { return O; },
             /* read-backs, for the harness and for an on-screen readout. `acc` is here because
              * "a preset with blur 0 never allocates the accumulation pair" is a claim about
              * MEMORY, and there is no other way to see it from outside. */
             get state() { return { motion: motionAmt, timeScale: tScale, dilate: dilAmt,
                                    smear: lastSmear, acc: !!S.aT, warm: accWarm, uniforms: lastU,
                                    pulses: PUL.map(p => ({ a: p.a, r: p.r || 0, hue: p.h || 0 })) }; } };
    LIVE.push(api);
    return api;
  }

  /* ── The page-global half of the interface ─────────────────────────────────────────────────
   * TIME IS A PROPERTY OF THE PAGE, NOT OF ONE CANVAS. A game with a 3D chain and a 2D overlay
   * chain (or the landing page, which has three) would otherwise have to find and drive each one,
   * and the one it forgot would be the one that kept running at full speed next to a dilated
   * neighbour. So these fan out to every live chain, and the per-instance methods stay available
   * for a caller that deliberately wants one canvas to disagree.
   * `dispose()` removes an instance, so a disposed chain cannot be driven and cannot leak. */
  const LIVE = [];
  function timeScaleAll(s) {
    let last = 1;
    for (let i = 0; i < LIVE.length; i++) { try { last = LIVE[i].timeScale(s); } catch (e) {} }
    /* ⚑ THE PITCH CUE, DUCK-TYPED. Slow motion that does not take the sound with it reads as a
     * dropped frame rate, not as time bending — the ear is what sells it. RipSfx owns playback
     * and this module does not, so the wire is offered rather than taken: if that module grows a
     * `rate()`, the cue works from the moment it does and nothing here needs to change. Wrapped,
     * because a graphics call must never be able to throw on account of the audio.
     * ⟶ The three lines RipSfx needs: keep a module-level `rate`, set `a.playbackRate = rate` and
     *   `a.preservesPitch = false` on the clone in play(), and export `rate: v => { rate = v; }`.
     *   preservesPitch MUST be false — with it true the clip plays slower at the same pitch,
     *   which is a tempo change and not a time change, and the cue is exactly the pitch. */
    try { if (self.RipSfx && typeof RipSfx.rate === 'function') RipSfx.rate(last); } catch (e) {}
    return last;
  }
  function flashAll(o) { for (let i = 0; i < LIVE.length; i++) { try { LIVE[i].flash(o); } catch (e) {} } }

  return { create, PRESET, BASE, INKS, ink, deviceScale, dprCap, deviceTier,
           timeScale: timeScaleAll, flash: flashAll, get live() { return LIVE.length; },
           // the composite source, so a harness can read the shader's own constants back out
           get COMP_SRC() { return P_COMP; } };
})();

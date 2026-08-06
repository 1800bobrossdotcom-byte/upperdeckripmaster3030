/* ripmaster3030studios — Section 9 on the PlayCanvas engine: the driver (S9PC).
 *
 * `js/s9pc-game.js` owns the rules and knows no engine. This file owns the engine and knows no
 * rules: it builds the scene for whichever arena the match picked, drives the skinned operatives
 * from the simulation's entities, hangs the weapon off the pose, runs the post stack and paints
 * the reticle. The split is the point — the two builds must stand in the same places and take the
 * same damage, and they do, because they run the same code for it.
 *
 * ⚑ THE POST STACK IS PORTED, NOT DEFAULTED. `js/gfx-post.js` carries numbers that were MEASURED
 *   against pixel counts, not chosen by eye, and an engine replaces the FUNCTION, not the TUNING.
 *   Every value in POST below is either derived analytically from GfxPost's own shader (the
 *   vignette, the chromatic aberration) or re-measured here in the engine's terms (the bloom and
 *   the highlight rolloff). The derivations are written out where they happen. Losing them
 *   silently is the single most likely way a better renderer ends up looking worse.
 */
(function () {
  const Q = new URLSearchParams(location.search);
  const num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  const on = (k, d) => (Q.has(k) ? Q.get(k) !== '0' : d);
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const canvas = $('pcv'), ov = $('ov2d');
  /* ⚑ Writes to #bootMsg, NOT to #boot — the loading screen now also holds the control legend,
   * and setting textContent on the parent would delete it. Visibility moves to a class, since
   * the old `#boot:empty` selector can never match an element that has children. */
  const say = m => { const el = $('bootMsg'), b = $('boot');
    if (el) el.textContent = m || '';
    if (b) b.classList.toggle('off', !m); };

  /* ── the no-fallback decision, made in the open ────────────────────────────────────────────
   * `section9.html` fails open all the way down: no WebGL ⇒ a canvas rasteriser still draws the
   * game. PlayCanvas has no software path, so this build genuinely requires WebGL2 and cannot
   * degrade. Fail-open is a standing principle in this repo, so the fallback here is not a worse
   * renderer — it is an honest page that names the requirement and links to the build that runs
   * anywhere. That is a deliberate design decision, not an oversight, and it is why
   * `section9.html` stays shipped. */
  const gl2 = (() => { try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; } })();
  if (!gl2 || !window.pc) {
    const n = $('nogl'); if (n) { n.classList.add('show');
      $('noglWhy').textContent = !window.pc ? 'the engine bundle did not load' : 'this browser reports no WebGL 2 context'; }
    $('ovLobby').classList.remove('show'); say('');
    return;
  }

  // ── quality tiers ───────────────────────────────────────────────────────────────────────────
  /* ONE definition of "weak device" for the whole site: GfxPost.dprCap(). It already folds in
   * touch + small screen + low cores/memory + save-data, and the four shipping WebGL games use it
   * as their resolution cap. Everything expensive here is switchable off the SAME signal, because
   * a second opinion about what a weak device is is how two games drift apart. */
  const DPRCAP = (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2;
  /* ⚠ THIS PICKS A TIER FROM THE DISPLAY, NOT FROM THE GPU, and it is worth being honest about.
   * `dprCap()` returns `min(devicePixelRatio, cap)`, so a plain 1× monitor lands on `low` however
   * fast the machine behind it is, and ANY HiDPI laptop lands on `high` — the same machine that is
   * then also asked for 2× the linear backing store, i.e. FOUR times the pixels. So the default
   * hands the most expensive tier to the display most likely to make it hurt, and it never
   * measures whether the machine can hold it. The right answer is not a cleverer guess from
   * navigator fields (that is how the guess got here); it is to guess once and then MEASURE — see
   * the adaptive ladder below, which now demotes the expensive features, not just the resolution.
   * Left as the starting guess deliberately, with the ladder as the correction. */
  /* ⛔ WAS `DPRCAP >= 2 ? 'high' : DPRCAP >= 1.5 ? 'mid' : 'low'` — a QUALITY tier derived from
   *    PIXEL DENSITY. `dprCap()` ends in `min(dpr, cap)`, so a desktop with a strong GPU and an
   *    ordinary 1x monitor scored 1 and landed on `low`. And `low` carries `skin: false`, so an
   *    ordinary monitor silently switched the game's CHARACTERS off: every operative fell back to
   *    the 11-box rig, no .skn was ever even requested, and the game read as "robots with no
   *    personality, just stacks of basic geometry shapes". Density is not capability.
   *    `GfxPost.deviceTier()` reads the same device signals WITHOUT the dpr term. */
  const AUTO_TIER = (window.GfxPost && GfxPost.deviceTier) ? GfxPost.deviceTier() : 'mid';
  let TIER = Q.get('q') || (() => { try { return localStorage.getItem('s9pc_q'); } catch (e) { return null; } })() || AUTO_TIER;
  if (['low', 'mid', 'high'].indexOf(TIER) < 0) TIER = AUTO_TIER;
  /* ⛔ THE TIER LADDER WAS NOT A LADDER — this is the frame-rate bug the artist reported.
   *
   * Measured in-arena (SwiftShader, so RELATIVE only): low 317 ms · mid 597 ms · high 693 ms on
   * NIGHT MARKET. The whole cliff is between LOW and MID; high only adds 16% on top of mid. That
   * is exactly the shape of the report — "bad at medium AND high" — and three separate causes
   * stack up at that one step:
   *
   * ⚑ (a) `omni` NEVER TIERED. The practicals are picked by striding the candidate list:
   *       `stride = max(1, floor(cands / omni))`, so the cap only bites when it is SMALLER than
   *       the candidate count. Counted from the arena definitions, the six hand-built arenas
   *       carry 8 / 16 / 12 / 14 / 8 / 19 candidates — every one below 24 — so **mid and high
   *       built byte-identically the same light set on every shipping arena** and only `low`
   *       thinned anything. The "46 / 24 / 8" ladder read as three rungs and behaved as two.
   *       On the baked interiors it goes the other way: ARCADE PIT has 178 candidates and THE
   *       VAULT 74, so high really does build 46 clustered lights there. Same tier, 46 lights in
   *       one arena and 8 in another — the cost tracked the ARENA, not the setting.
   *       Switching the practicals off at high on NIGHT MARKET took the frame 1085 → 529 ms and
   *       1456 → 726 ms on two separate runs: **half the frame, both times.**
   * ⚑ (b) SSAO COSTS A WHOLE EXTRA GEOMETRY PASS, not just its own blur. PlayCanvas's
   *       `CameraFrame.sanitizeOptions` reads `(taa || ssaoType !== NONE || dof || volFog) ⇒
   *       prepassEnabled = true` — turning SSAO on renders the entire scene a second time into a
   *       depth prepass. `ssao: true` at mid AND high, false at low, is the single cleanest match
   *       to "the two tiers the artist named", and it is a structural fact of the engine, not a
   *       measurement. **Mid gives it up**: a tier for a machine that cannot afford high must not
   *       carry high's most expensive structural feature. High keeps it.
   * ⚑ (c) 3 CASCADES × 2048² = 12.6 M SHADOW TEXELS EVERY FRAME, for an arena at most 52 m
   *       across with a shadow distance of ~40 m. That is ~0.007 m per texel — finer than any
   *       screen pixel at any range in this game, i.e. resolution bought and thrown away.
   *       1024 keeps 3 cascades and quarters the rasterisation.
   * ⚑ (d) `spotShadow: true` made ALL SIX ceiling fixtures shadow casters on an interior — six
   *       more full-scene shadow renders per frame, on top of the sun's three. It is now a COUNT:
   *       the nearest `spotShadow` fixtures cast and the rest are fill. One caster is what reads
   *       as "the room has a light in it"; the other five were paying for shadows you cannot
   *       separate from each other anyway.
   *
   * `omniLive` is the new number and it is the one that actually bounds cost: how many practicals
   * may be ENABLED at once (the nearest to the camera — see `cullPracticals`). `omni` now only
   * decides how many get BUILT, i.e. how the coloured pools are DISTRIBUTED round the arena, so
   * the look of a room is unchanged while its per-frame cost stops depending on how many crates
   * the level designer put in it. */
  /* ⧗ The motion-smear ceiling, read here because the tier table below has to know whether the
   * pass exists at all. `?smear=0` removes it completely — allocation, blit and shader branch.
   * Everything about what the number MEANS is in the SMEAR brief further down. */
  const SMEAR_CEIL = clamp(num('smear', 0.55), 0, 0.85);
  const TIERS = {
    // shadowRes/cascades — the sun's cascaded shadow map. spot: ceiling fixtures, spotShadow: how
    // many of them cast. omni: practicals BUILT; omniLive: how many may be lit at once (clustered).
    // ⛔ `skin` USED TO LIVE HERE, false at low, and switching it off replaced every operative
    //    with the 11-box fallback rig. That is not a quality setting, it is deleting the cast:
    //    four bodies at ~4–6k tris is ~20k triangles, against a measured frame whose cost was
    //    shown (a)–(d) below to be the depth prepass, the shadow rasterisation and the per-
    //    fragment light loop — none of which scale with body geometry. The generated bodies are
    //    also 0.16–0.22 MB each, so the download argument that justified it is gone too.
    //    THE CHARACTERS ARE NOT AN EFFECT. If a machine cannot afford this game, it gives up
    //    SSAO, then shadow resolution, then live lights, then cascades, then resolution — the
    //    ladder below — and it still has people in it. `?bodies=0` remains for A/B.
    // ⧗ `smear`: the motion-smear feedback. One full-res RGB8 target and one blit per frame, so
    //    it is cheap next to SSAO but it is not free, and `low` is the tier that has already
    //    given up shadows — a garnish does not outlive them.
    high: { shadowRes: 1024, cascades: 3, shadows: true, spot: 3, spotShadow: 1, omni: 46, omniLive: 12, ssao: true, ssaoSamples: 8, bloom: true, dither: true, fringing: true, smear: true, envSize: 256, atlas: 512, aniso: 8, rtScale: 1.0 },
    mid:  { shadowRes: 1024, cascades: 2, shadows: true, spot: 2, spotShadow: 0, omni: 24, omniLive: 8, ssao: false, ssaoSamples: 6, bloom: true, dither: true, fringing: true, smear: true, envSize: 128, atlas: 256, aniso: 4, rtScale: 0.85 },
    low:  { shadowRes: 512, cascades: 1, shadows: false, spot: 0, spotShadow: 0, omni: 8, omniLive: 5, ssao: false, ssaoSamples: 4, bloom: true, dither: false, fringing: false, smear: false, envSize: 64, atlas: 128, aniso: 1, rtScale: 0.7 },
  };
  let QCFG = TIERS[TIER];
  /* Every one of the four is reachable from the URL, because each is a look/cost trade someone
   * may want to re-measure, and because an A/B against the old behaviour has to be possible
   * without checking out the old file. `?omnilive=99` restores "every practical is always on". */
  QCFG = Object.assign({}, QCFG, {
    omniLive: num('omnilive', QCFG.omniLive),
    shadowRes: num('sres', QCFG.shadowRes),
    cascades: num('casc', QCFG.cascades),
    spotShadow: num('spotshadow', QCFG.spotShadow),
    /* ⚠ The `?ssao=0` / `?shadows=0` flags are folded in HERE rather than at the point of use.
     * The adaptive ladder below recomputes both from QCFG, so a flag applied only where the light
     * is built would be silently undone the first time the controller stepped back up. */
    ssao: QCFG.ssao && on('ssao', true),
    shadows: QCFG.shadows && on('shadows', true),
    smear: QCFG.smear && SMEAR_CEIL > 0,
  });
  const WANT_POST = on('post', true);
  const WANT_BODIES = on('bodies', true);
  const WANT_WEAPON = on('weapon', true);
  const HOLD = on('hold', false);

  /* ── POST: the ported calibration ─────────────────────────────────────────────────────────
   *
   * GfxPost's `tactical` preset, and where each number goes in PlayCanvas:
   *
   *   intensity 0.62  bloom amount        → bloom.intensity, RE-MEASURED (see below)
   *   threshold 0.70  bright-pass knee    → PlayCanvas has no threshold; its bloom is a mip chain
   *   knee      0.94  HIGHLIGHT ROLLOFF   → rendering.toneMapping = ACES. MEASURED, see below.
   *   ca        0.0012 chromatic aberration → fringing.intensity 2.46, DERIVED (see below)
   *   vignette  0.42                      → vignette{inner .68, outer 2.24, curvature 1}, DERIVED
   *   sat       1.06                      → grading.saturation 1.06 (direct)
   *   dither    0.0045 8×8 Bayer          → injected as a composeMainEndPS shader chunk
   *   sharpen   0.26  unsharp             → rendering.sharpness (CAS — different maths, see below)
   *   blur      0.55  motion smear CEILING→ NOT PORTED. PlayCanvas has no feedback pass.
   *
   * ⚑ THE KNEE. 0.94 was swept against Cloudracer's clipped-pixel count: it removed 100% of
   *   clipping for free (mean luma 129.5 vs 128.8 unrolled, contrast 73.2 vs 73.3), while a
   *   guessed 0.62 also removed it and cost 14 luma and 14 contrast. It exists because GfxPost is
   *   an LDR chain: adding bloom pushes pixels past 1.0 and the GPU clips them to flat white.
   *   PlayCanvas renders the scene HDR and tone-maps AFTER bloom (compose order: CAS → SSAO →
   *   fringing → bloom → grading → TONEMAP → vignette), so the tonemapper IS the rolloff, done
   *   properly and in the right space. The port of "knee 0.94" is therefore: the tonemapper must
   *   be a rolloff curve, never TONEMAP_LINEAR/NONE, and the result must be verified the same way
   *   it was derived — by counting clipped pixels, not by looking at it. `__s9pc._clip()` does
   *   exactly that measurement in-browser, and it was run. On a held ARCADE PIT frame:
   *
   *       tonemapper   clipped px   clipped %   mean luma   RMS contrast
   *       ACES                  0     0.0000       74.35        26.86     ← chosen
   *       NEUTRAL               0     0.0000       49.59        20.62
   *       FILMIC                0     0.0000       47.83        14.27
   *       LINEAR              357     0.0398       72.40        18.08
   *       NONE                234     0.0261       73.15        19.42
   *
   *   That is the SAME SHAPE of result the 0.94 sweep produced, and it settles the port the same
   *   way: ACES removes 100% of clipping for free — it costs nothing in luma and actually GAINS
   *   8.8 RMS over the unrolled image — while NEUTRAL also removes it and costs 25 luma and 6
   *   RMS. Exactly the 0.62-knee failure mode. Darker is not safer here either.
   *
   * ⚑ CHROMATIC ABERRATION, derived not guessed. GfxPost samples at `uv + (uv-0.5)*ca`, i.e. a
   *   displacement LINEAR in distance from centre: at the corner |uv-0.5| = 0.5, so the offset is
   *   0.0012 × 0.5 = 6.0e-4 uv. PlayCanvas's applyFringing uses `offset = (I/1024) * d²`, which at
   *   the corner is I/4096 per axis. Equal at I = 4096 × 6.0e-4 = 2.46.
   *
   * ⚑ VIGNETTE, derived not guessed. GfxPost: `v = smoothstep(1.12, 0.34, r)` with r = |uv−0.5|,
   *   then `col *= mix(1−0.42, 1, v)` — i.e. a factor `1 − 0.42·smoothstep(0.34, 1.12, r)`.
   *   PlayCanvas: `1 − intensity·smoothstep(inner, outer, edge)` where at curvature 1
   *   `edge = |uv·2−1| = 2r`. Substituting r = edge/2 gives inner = 2×0.34 = 0.68 and
   *   outer = 2×1.12 = 2.24 at the same intensity 0.42. Checked at the corner: r = 0.707 gives
   *   0.809 either way.
   *
   * ⚠ SHARPEN cannot be ported analytically. GfxPost does a plain unsharp against the four
   *   neighbours at strength 0.26; PlayCanvas runs AMD CAS, which is contrast-adaptive and whose
   *   `sharpness` maps to lerp(−0.125, −0.2, s). Different function, so this is set by matching
   *   measured local contrast rather than by copying the number across — see the report.
   *
   * ✅ MOTION SMEAR IS BACK — see the SMEAR brief below. `tactical` is the only GfxPost preset
   *   with `blur` non-zero (0.55) and Section 9 is the caller it was written for. PlayCanvas's
   *   CameraFrame still has no feedback pass, so the pass is built here out of the engine's own
   *   parts — the ceiling, the `motion × blur` scaling, the 0.85 cap and the warm-up guard are
   *   GfxPost's, carried across rather than re-invented.
   */
  const POST = {
    /* ⚑ BLOOM was re-measured, not carried across. GfxPost's 0.62 is an additive multiplier over
     * its own bright pass at threshold 0.70; PlayCanvas's is a mip-chain mix and the two numbers
     * are not the same quantity. Swept on a held ARCADE PIT frame (clipped% / mean luma / RMS):
     *   0 → 0.0002% · 70.3 · 33.1      0.008 → 0% · 69.8 · 25.3
     *   0.018 → 0% · 74.2 · 26.8       0.035 → 0% · 79.0 · 25.6
     *   0.06  → 0% · 86.8 · 25.8       0.10  → 0% · 98.3 · 26.0
     * Bloom buys luma and SPENDS contrast, and above ~0.02 it is buying only luma. 0.018 keeps the
     * `tactical` preset's whole point — "bloom reads as bounced light rather than a glow filter". */
    bloom: num('bloom', 0.018),
    tone: pc.TONEMAP_ACES,
    fringing: 2.46,
    vignette: { inner: 0.68, outer: 2.24, curvature: 1.0, intensity: 0.42 },
    saturation: 1.06,
    /* ⚠ CONTRAST STAYS AT 1. PlayCanvas's `grading.contrast` is applied in LINEAR space BEFORE the
     * tonemapper, so it is not the display-space knob GfxPost's `sat` sits next to — measured on
     * ARCADE PIT it takes mean luma 73.3 → 25.7 at 1.12 and → 10.1 at 1.24 while barely touching
     * clipping. Copying a >1 "contrast" number across from any LDR chain would have quietly
     * black-crushed every interior. Contrast here is bought with EXPOSURE and light placement. */
    contrast: 1.0,
    /* ⚑ SHARPNESS was picked by MEASUREMENT because it could not be derived. Mean |Laplacian| over
     * a held ARCADE PIT frame: 0 → 5.58 · 0.2 → 6.72 · 0.42 → 7.06 · 0.7 → 7.57 · 1.0 → 8.76.
     * 0.70 is the last value on the smooth part of that curve (1.0 also jumps RMS 25.5 → 30.1,
     * which is a different effect appearing, not more of the same one) and lands local contrast
     * 36% above unsharpened — the same order as GfxPost's 0.26 unsharp. */
    sharpness: num('sharp', 0.70),
    dither: num('dither', 0.0045),
    grain: num('grain', 0.014),
    ssao: { intensity: 0.55, radius: 3.2, power: 3.0, minAngle: 12 },
  };

  /* ── ⧗ MOTION SMEAR — the brief, before the code (docs/DESIGN-SYSTEM.md §8) ─────────────────
   *
   * 1 · WHAT IT IS MADE OF.  One frame of the previous image, held. Not a filter and not a
   *   texture: the accumulation target is the same idea as film left open a moment too long.
   *
   * 2 · HOW IT IS LIT.  It is not lit; it is EXPOSED. Everything else in the post chain shades
   *   the frame — this one integrates it over time.
   *
   * 3 · WHAT MOVES, AND WHY IT PHYSICALLY MOVED.  ⚑ The half that gets skipped, so it is derived
   *   rather than asserted. A smear is finite exposure time: during one exposure the image on the
   *   sensor moves, and whatever moved smears by however far it went. Two things move it:
   *     · ROTATION — the whole frame translates at ω·f. Every pixel, equally. Dominant.
   *     · TRANSLATION — a point at distance d slides at v⊥/d rad/s, so NEAR geometry streaks and
   *       far geometry does not. A full-screen feedback cannot do the depth half, so translation
   *       is folded in as a scalar and deliberately weighted lower than rotation. Being honest
   *       about that is why `wVel` is 0.55 and not 1.
   *   ⚑ THE REFERENCE RATE IS DERIVED, NOT PICKED. The frame is fov 0.97 rad vertical over 16:10,
   *     so horizontal fov = 2·atan(tan(0.485)·1.6) = 1.45 rad. Image motion becomes visible at
   *     about 2% of frame width in one exposure — 0.029 rad — and at 60 Hz an exposure is 16.7 ms,
   *     i.e. ω = 1.74 rad/s is the THRESHOLD of a visible smear. `wRef` 5.5 rad/s is roughly three
   *     times that: a deliberate turn is faintly soft, a whip-pan saturates.
   *   ⚑ SPEED IS MEASURED FROM THE POSITION DELTA, not from the intended velocity — so running
   *     into a wall smears nothing, which is correct, because nothing moved.
   *   ⚑ AND BOTH ARE MEASURED PER FRAME, NOT PER SECOND. See smearMotion(): the exposure IS the
   *     frame, so the quantity that smears is displacement per frame and there is nothing to
   *     divide by. The first cut divided by dt and read an 8× overstated turn rate off the sim's
   *     CLAMPED clock under software GL — a measurement artifact that the measurement caught.
   *   ⚑ It is a CEILING, exactly as GfxPost documents: the mix is `motion × blur`, so a still
   *     camera is pin sharp and only motion smears. 0.55 is `PRESET.tactical.blur`, unchanged —
   *     Section 9 is the caller that number was authored for, so it carries across as itself
   *     rather than being re-guessed. Held under 0.85 because this is a feedback loop and above
   *     that the frame never lets go of what it saw. Warm-up guard on the first frame after an
   *     allocation or a resize: the "previous" target is uninitialised and mixing it is garbage.
   *
   * 4 · WHAT IT SITS ON.  The BACKBUFFER, which is why it is honest here. The HUD, the reticle and
   *   the nameplates live on the separate 2D overlay canvas (#ov2d) and are composited by the
   *   browser AFTER this — so the world smears and the instruments stay sharp, which is what a
   *   camera behind a glass instrument panel actually does. It is folded into the existing
   *   `composeMainEndPS` chunk beside the dither rather than added as a pass of its own, so it
   *   costs one texture fetch plus one framebuffer blit, not another fullscreen shader.
   *   ⚠ MEASURED at this container's device: backBufferFormat is PIXELFORMAT_RGB8 and NOT sRGB,
   *     so the copy holds display-encoded values and the mix belongs in display space — which is
   *     where GfxPost does it too, its whole chain being LDR. The same pow(1/2.2) round-trip the
   *     dither already pays is reused, so there is one pow pair, not two. `s9PrevLin` covers the
   *     other case: a device that hands back an sRGB backbuffer samples LINEAR, and the shader
   *     re-encodes before mixing rather than silently lifting the ghost's toe.
   *
   * 5 · THE ACCEPTANCE MEASUREMENT.  Consecutive frames, differenced:
   *     · camera still  ⇒ near-identical, and the uniform is exactly 0 so the branch is not taken
   *     · fast turn     ⇒ clearly different, and the difference must FALL when the smear is on
   *       (that is what a smear IS: this frame carrying some of the last one).
   *   Reported as mean |Δ| per subpixel over the real backing store, via `__s9pc._smear()`.
   */
  const SMEAR = {
    /* GfxPost PRESET.tactical.blur, carried across unchanged. `?smear=0` switches the whole pass
     * off — allocation, blit and shader branch — and `?smear=0.8` re-sweeps the ceiling. */
    ceiling: SMEAR_CEIL,
    cap: 0.85,          // GfxPost's own clamp: a feedback loop above this never lets go
    wRot: 1.0,          // a whip-pan alone may saturate the smear
    wVel: 0.55,         // translation cannot, because the depth half of it is not being modelled
    wRef: 5.5,          // rad/s that saturates the rotation term — derived above
    vLo: 4.3,           // m/s — walking. The floor: ordinary movement does not smear
    vHi: 9.6,           // m/s — BOOTS.speed, the fastest anything in this game goes
    on: false, warm: false, tex: null, rt: null, w: 0, h: 0,
    motion: 0, amt: 0, force: -1, yaw: 0, pitch: 0, px: 0, py: 0, pz: 0, seeded: false,
  };

  /* ⚑ CLEAN POST — `?clean=1`. Every value below was tuned honestly for a gritty tactical look,
   * and against a bright stylised direction every one of them works backwards: chromatic
   * aberration and grain ADD the high-frequency noise the style needs removed, unsharp then
   * sharpens that noise, and a heavy vignette darkens exactly the screen edges where a shooter
   * needs to see. So clean mode subtracts rather than retunes.
   * The tonemapper stays — it is the highlight rolloff, and without it additive bloom clips to
   * flat white, which is the one thing that would actually break this look. Saturation goes UP,
   * because a flat-albedo world has no texture detail to carry interest and colour has to. */
  const CLEAN = Q.get('grit') !== '1';
  if (CLEAN) {
    POST.fringing = 0;                    // no chromatic aberration
    POST.grain = 0;                       // no film grain
    POST.dither = 0.002;                  // just enough to stop banding on the big flat skies
    POST.vignette = { inner: 0.92, outer: 3.2, curvature: 1.0, intensity: 0.10 };
    POST.sharpness = num('sharp', 0.35);  // half — there is no noise left to fight
    /* ⚑ WHERE WE PART COMPANY WITH THE REFERENCE. Those games are bright Mediterranean daylight;
     * this studio is neon on near-black — acid green, cyan, magenta, amber. Taking their CLARITY
     * without taking their PALETTE is the whole brief: flat saturated fields and hard silhouettes,
     * lit like a sign rather than like a beach.
     * So bloom stays meaningful rather than being cut to nothing (neon has to actually glow) and
     * saturation goes up hard, because a flat-albedo world has no texture detail to carry
     * interest — colour is doing all of it. */
    POST.bloom = num('bloom', 0.024);
    POST.saturation = 1.26;
  }

  // ── application ─────────────────────────────────────────────────────────────────────────────
  const T0 = performance.now();
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance',
      // ?grab=1 keeps the drawing buffer so a headless run can getImageData the real pixels.
      // CLAUDE.md: this container's screenshot path rotates hue on canvas content, so colour has
      // to be judged from a readback — and a WebGL canvas without this reads back black.
      preserveDrawingBuffer: on('grab', false) },
  });
  window.__pcapp = app;
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  const DPR_BASE = Math.min(window.devicePixelRatio || 1, DPRCAP);
  app.graphicsDevice.maxPixelRatio = DPR_BASE;

  /* ── THE ADAPTIVE CONTROLLER ───────────────────────────────────────────────────────────────
   * Stutter on a machine I cannot measure from here is not something to guess a constant for, so
   * the game measures ITSELF and adjusts: a rolling median (median, not mean — one 300 ms hitch
   * from a texture upload must not drag the estimate for the next four seconds) against a target
   * of 16.7 ms.
   *
   * ⛔ IT USED TO SCALE ONLY THE BACKING STORE, AND THAT IS WHY IT COULD NOT SAVE MID OR HIGH.
   *   Resolution buys back FILL. At mid and high this build is not fill-bound: it is bound by a
   *   depth prepass (SSAO forces one — see the tier table), by cascaded shadow maps whose cost is
   *   a fixed 3 × 1024² of rasterisation that does not shrink by one texel when the window does,
   *   and by a per-fragment clustered-light loop. So the old controller would grind the picture
   *   soft, frame after frame, and STILL not reach the thing that was actually costing the time —
   *   the worst possible outcome, because it pays the whole price of a quality drop and collects
   *   none of it. Hence a LADDER: give up the structurally expensive features first, and only
   *   spend image sharpness once they are gone.
   *
   *     step 0   as the tier asks
   *     step 1   SSAO off            ← kills the whole depth prepass, not just the AO
   *     step 2   shadow map halved   ← 4× less shadow rasterisation
   *     step 3   live practicals halved
   *     step 4   one cascade dropped
   *     step 5+  resolution, 8% at a time, down to `min`
   *
   * ⚑ THE WINDOW IS IN SECONDS, NOT FRAMES. It was 60 frames, which is self-defeating: the worse
   *   the frame rate, the LONGER the controller waits before doing anything about it. At 5 fps
   *   that is a twelve-second window per step and over a minute to walk the ladder, i.e. the whole
   *   match. It is now "at least 20 frames AND at least 1.2 s", so a bad machine reacts sooner
   *   than a good one rather than later.
   * ⚑ The hysteresis is still load-bearing. Act on a single slow frame and the renderer visibly
   *   breathes, which reads far worse than a steady lower setting. Hence the cooldown, and a raise
   *   threshold well below the lower one so the two can never chase each other.
   * ⚠ NEVER BELOW ONE CSS PIXEL for the backing store — CLAUDE.md records why (`dprCap` refuses
   *   for the same reason), and the old floor of 0.7 broke exactly that rule while the comment
   *   above it claimed to be keeping it. Below 1 the backing store is resampled UP to the canvas
   *   and it is not "lower resolution", it is visibly soft. Once `maxPixelRatio` is down to 1 the
   *   remaining resolution comes out of `renderTargetScale`, which shrinks the SCENE target and
   *   every fullscreen post pass while the HUD, the nameplates and the reticle stay sharp on the
   *   2D overlay above — that split is the whole reason a resolution drop here does not read as a
   *   broken build. */
  const ADAPT = {
    on: Q.get('adapt') !== '0',
    target: 16.7, hi: 21, lo: 13,          // ms/frame: step down above `hi`, back up below `lo`
    step: 0, maxStep: 9,                   // ladder position; 0 = exactly what the tier asked for
    scale: 1, min: 0.62, max: 1,           // scale multiplies rtScale once dpr has hit its floor
    win: [], t0: 0, cool: 0, changes: 0,
  };
  const QBASE = { ssao: QCFG.ssao, shadowRes: QCFG.shadowRes, cascades: QCFG.cascades, omniLive: QCFG.omniLive, smear: QCFG.smear };
  /* Apply ladder position `n`. Idempotent and total — it recomputes every knob from QBASE rather
   * than nudging the live value, so stepping down and back up cannot drift. Fails open: any knob
   * that throws leaves the others applied. */
  function applyStep(n) {
    const wantSsao = QBASE.ssao && n < 1;
    const wantRes = n >= 2 ? Math.max(512, QBASE.shadowRes >> 1) : QBASE.shadowRes;
    /* ⧗ The smear joins the ladder at the same rung as the shadow map. Placed by ARGUMENT, not by
     * measurement, and said so: it is one blit plus one fetch, so it is far from the biggest cost
     * here, but it is the most purely decorative thing in the stack and a machine two rungs down
     * wants frames more than it wants a garnish. Freeing it also hands back a full-res target. */
    const wantSmear = QBASE.smear && n < 2;
    if (QCFG.smear !== wantSmear) { QCFG.smear = wantSmear; if (!wantSmear) freeSmear(); }
    const wantLive = n >= 3 ? Math.max(2, QBASE.omniLive >> 1) : QBASE.omniLive;
    const wantCasc = n >= 4 ? Math.max(1, QBASE.cascades - 1) : QBASE.cascades;
    try {
      if (frame && (frame.ssao.type !== pc.SSAOTYPE_NONE) !== wantSsao) {
        frame.ssao.type = wantSsao ? pc.SSAOTYPE_LIGHTING : pc.SSAOTYPE_NONE;
        frame.update();
      }
    } catch (e) {}
    try { if (sun.light.shadowResolution !== wantRes) sun.light.shadowResolution = wantRes; } catch (e) {}
    try { if (sun.light.numCascades !== wantCasc) sun.light.numCascades = wantCasc; } catch (e) {}
    if (QCFG.omniLive !== wantLive) { QCFG.omniLive = wantLive; cullPracticals(true); }
    // resolution is the LAST thing spent, 8% per step past 4
    const res = n <= 4 ? 1 : Math.max(ADAPT.min, 1 - (n - 4) * 0.08);
    if (Math.abs(res - ADAPT.scale) > 0.001) {
      ADAPT.scale = res;
      const dpr = Math.max(1, Math.min(DPR_BASE, DPR_BASE * res));
      app.graphicsDevice.maxPixelRatio = dpr;
      // whatever the dpr floor could not absorb comes out of the scene target, not the HUD
      const rest = Math.min(1, res * DPR_BASE / Math.max(0.001, dpr));
      try { if (frame) { frame.rendering.renderTargetScale = Math.max(0.5, QCFG.rtScale * rest); frame.update(); } } catch (e) {}
    }
  }
  function adapt(ms, nowT) {
    if (!ADAPT.on) return;
    if (!ADAPT.win.length) ADAPT.t0 = nowT;
    ADAPT.win.push(ms); if (ADAPT.win.length > 180) ADAPT.win.shift();
    // at least 20 frames AND at least 1.2 s — so a slow machine reacts sooner, not later
    if (ADAPT.win.length < 20 || nowT - ADAPT.t0 < 1200 || nowT < ADAPT.cool) return;
    const s = ADAPT.win.slice().sort((a, b) => a - b), med = s[s.length >> 1];
    let next = ADAPT.step;
    if (med > ADAPT.hi) next = Math.min(ADAPT.maxStep, ADAPT.step + 1);
    else if (med < ADAPT.lo) next = Math.max(0, ADAPT.step - 1);
    ADAPT.win.length = 0;
    if (next === ADAPT.step) return;
    ADAPT.step = next; ADAPT.changes++;
    applyStep(next);
    ADAPT.cool = nowT + 1500;              // let it settle before judging again
  }
  const ovCtx = ov.getContext('2d');
  let OW = 0, OH = 0, ODPR = 1;
  function fit() {
    app.resizeCanvas();
    const r = ov.getBoundingClientRect();
    ODPR = Math.min(window.devicePixelRatio || 1, DPRCAP);
    OW = Math.max(2, Math.round(r.width)); OH = Math.max(2, Math.round(r.height));
    ov.width = Math.round(OW * ODPR); ov.height = Math.round(OH * ODPR);
    ovCtx.setTransform(ODPR, 0, 0, ODPR, 0, 0);
  }
  addEventListener('resize', fit); fit();

  // ── environment ─────────────────────────────────────────────────────────────────────────────
  /* Two cubemaps, not one, and this is the load-bearing bit of the interior look. The visible sky
   * must stay dark — CLAUDE.md records that a wedge of bright sky at floor level inside a concrete
   * pit reads as a rendering fault. But the IBL probe IS the ambient fill, and our own renderer
   * raises ambient INDOORS (0.33 → 0.45) precisely because inside a box the fill is bounce off six
   * close surfaces. Deriving the fill from the visible sky would give an interior no fill at all.
   * So: one cubemap you look at, one (brighter) you are lit by. */
  /* ── TIME OF DAY — outdoor arenas are DAYLIGHT by default ──────────────────────────────────
   * ⚑ THIS REVERSES A CALL MADE ABOVE IN `CLEAN`. That comment argued we take the reference's
   * clarity but keep our own palette ("neon on near-black"), and for an INTERIOR that is still
   * right — a neon sign only reads against dark, so SKY_IN is untouched. Outdoors it was wrong
   * twice over:
   *   (a) the direction kept being asked for, in bright daylight, repeatedly. Palette was not
   *       incidental to the reference; it is most of why those frames read clearly. High-key
   *       daylight puts every silhouette DARK against a bright field, which is the single
   *       biggest legibility win available and costs nothing to render.
   *   (b) it was internally inconsistent. `preller_drive` — the CC0 capture that has been doing
   *       the actual outdoor lighting since the HDRI landed — is a SUNNY street, peak luminance
   *       ~11,000. So the IBL was lighting the scene like noon while the directional sun was
   *       tinted dusk-orange (1.00, 0.86, 0.60) and the fog was an orange haze. The two were
   *       modelling different times of day in the same frame.
   * So: one `TOD` switch, daylight sun/sky/haze that agree with the capture, and `?tod=dusk`
   * keeps the old set intact for comparison rather than deleting it. */
  const TOD = Q.get('tod') === 'dusk' ? 'dusk' : 'day';
  const DAY = TOD === 'day';
  const SKY_DUSK = { top: [0.13, 0.07, 0.11], mid: [0.62, 0.29, 0.15], hor: [0.86, 0.57, 0.33], grd: [0.16, 0.12, 0.10] };
  /* Horizon nearly white, zenith a saturated blue, ground a light neutral bounce. The big flat
   * value gradient top-to-bottom is what a distant roofline gets read against. */
  const SKY_DAY = { top: [0.17, 0.36, 0.82], mid: [0.40, 0.62, 0.94], hor: [0.80, 0.89, 0.98], grd: [0.44, 0.45, 0.44] };
  const SKY_OUT = DAY ? SKY_DAY : SKY_DUSK;
  const SKY_IN = { top: [0.05, 0.05, 0.08], mid: [0.10, 0.10, 0.14], hor: [0.17, 0.17, 0.21], grd: [0.09, 0.09, 0.11] };
  /* A high sun (57° vs dusk's 41°) — long raking shadows are lovely and they also lie across the
   * floor in bands that a player has to read past. Near the top, shadows sit UNDER things. */
  const SUN = (() => { const v = DAY ? [-0.40, 0.84, -0.28] : [-0.5, 0.66, -0.34], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
  const SUN_TINT = DAY ? [1.0, 0.97, 0.90] : [1.0, 0.86, 0.62];

  function skyColour(S, OPEN, dx, dy, dz) {
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    let c;
    if (dy >= 0) { const t = Math.pow(Math.min(1, dy), 0.55);
      c = t < 0.5 ? S.hor.map((h, i) => h + (S.mid[i] - h) * (t / 0.5))
                  : S.mid.map((m, i) => m + (S.top[i] - m) * ((t - 0.5) / 0.5)); }
    else { const t = Math.min(1, -dy * 2.2); c = S.hor.map((h, i) => h + (S.grd[i] - h) * t); }
    const d = dx * SUN[0] + dy * SUN[1] + dz * SUN[2];
    if (d > 0) { const glow = Math.pow(d, 24) * (OPEN ? 3.4 : 1.1) + Math.pow(d, 3) * (OPEN ? 0.22 : 0.10);
      c = c.map((v, i) => v + glow * SUN_TINT[i]); }
    return c;
  }
  const CUBE_DIRS = [(s, t) => [1, -t, -s], (s, t) => [-1, -t, s], (s, t) => [s, 1, t], (s, t) => [s, -1, -t], (s, t) => [s, -t, 1], (s, t) => [-s, -t, -1]];
  function skyCubemap(N, S, OPEN, boost) {
    const faces = []; boost = boost || 1;
    for (let f = 0; f < 6; f++) {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const s = 2 * (x + 0.5) / N - 1, t = 2 * (y + 0.5) / N - 1;
        const v = CUBE_DIRS[f](s, t), col = skyColour(S, OPEN, v[0], v[1], v[2]);
        const o = (y * N + x) * 4;
        for (let k = 0; k < 3; k++) d[o + k] = Math.min(255, Math.pow(Math.max(0, col[k] * boost), 1 / 2.2) * 255);
        d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0); faces.push(c);
    }
    const tex = new pc.Texture(app.graphicsDevice, { name: 's9pc-sky', cubemap: true, width: N, height: N,
      format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
    tex.setSource(faces); return tex;
  }

  const ENVCACHE = {};
  let envOk = false, envName = 'procedural';
  function setEnvironment(open) {
    const key = (open ? 'out' : 'in') + QCFG.envSize;
    try {
      let E = ENVCACHE[key];
      if (!E) {
        const S = open ? SKY_OUT : SKY_IN;
        const cube = skyCubemap(Math.max(64, QCFG.envSize / 2), S, open, 1);
        const iblBoost = open ? 1.3 : 5.2;                       // indoors the fill is bounce, not sky
        const iblCube = skyCubemap(64, S, open, iblBoost);
        const src = pc.EnvLighting.generateLightingSource(iblCube, { size: QCFG.envSize });
        E = ENVCACHE[key] = { cube, atlas: pc.EnvLighting.generateAtlas(src, { size: QCFG.atlas }) };
      }
      app.scene.envAtlas = E.atlas;
      app.scene.skybox = E.cube;
      app.scene.skyboxMip = 0;
      app.scene.skyboxIntensity = open ? 1.0 : 0.85;
      envOk = true;
    } catch (e) { envOk = false; say('env probe failed: ' + e.message); }
    /* clean: sky-coloured ambient and a lifted floor. The reference has almost no black in it —
     * shadows are soft, coloured and light, and the depth cue is aerial perspective (distance
     * going lighter and cooler) rather than anything getting darker. */
    app.scene.ambientLight = !CLEAN ? new pc.Color(0.05, 0.05, 0.06)     // envAtlas supplies the real fill
      : (open && DAY) ? new pc.Color(0.30, 0.37, 0.48)                   // open sky IS the fill, and it is blue
                      : new pc.Color(0.26, 0.31, 0.40);
    /* ⚑ EXPOSURE IS PER-ARENA, and up indoors. Outdoors you are standing in the sun; inside, the
     * only light is six ceiling practicals and bounce, and a camera in that room opens up. It is
     * the same correction CLAUDE.md records for our own renderer ("ambient goes UP indoors, not
     * down, 0.33 → 0.45"), expressed where it belongs. Measured on ARCADE PIT: exposure 1.0 gives
     * mean luma 73.3 / RMS 25.5, 1.3 gives 86.8 / 28.1, 1.6 gives 98.6 / 29.9, and clipping stays at exactly 0
     * throughout — the tonemapper absorbs it, which is the whole point of having one. 1.25 is
     * where an interior lands beside the shipping build's arcade frame (mean luma ~112) without
     * spending the headroom that keeps clipping near zero. */
    /* ⚑ DAYLIGHT EXPOSURE IS 0.55, AND IT GOES DOWN, NOT UP — swept on DUST BOWL at the daylight
     * sun + painted albedo (luma / rms / sat / clipped%):
     *   0.55 → 156.2 · 45.9 · 33.0 · 0        0.65 → 165.6 · 47.5 · 30.6 · 0.004
     *   0.75 → 172.4 · 46.9 · 29.0 · 0.004    0.85 → 178.8 · 46.7 · 27.3 · 0.004
     *   1.00 → 186.6 · 46.0 · 25.1 · 0.005
     * Saturation falls monotonically as exposure rises, for the reason the palette note records:
     * ACES desaturates on the way to white, so every stop of extra exposure is paid for in colour.
     * Contrast is flat across the whole range, so there is nothing to buy with the brightness
     * either. The dusk arenas kept 1.0 because their sun is four times dimmer — this is not a
     * global "darker looks better", it is the same scene lit properly and metered once. */
    app.scene.exposure = num('exp', open ? (DAY ? 0.55 : 1.0) : 1.25);
  }

  /* Vendored HDRI. `models/env/<name>.png` is an equirectangular RGBM encoding of a CC0 Poly Haven
   * capture (see scripts/build-pcenv.mjs and models/env/<name>.json for provenance). RGBM keeps
   * real dynamic range in an 8-bit PNG, which is what lets a sun be thousands of times brighter
   * than the sky instead of clipping to white — the same argument scripts/build-ibl.mjs makes for
   * not baking from a JPEG. Optional, and every failure falls back to the generated sky. */
  function loadHdri(name) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        try {
          const t = new pc.Texture(app.graphicsDevice, { name: 'hdri-' + name, width: img.width, height: img.height,
            format: pc.PIXELFORMAT_RGBA8, type: pc.TEXTURETYPE_RGBM, projection: pc.TEXTUREPROJECTION_EQUIRECT,
            mipmaps: false, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
            minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR });
          t.setSource(img);
          const src = pc.EnvLighting.generateLightingSource(t, { size: Math.max(128, QCFG.envSize) });
          const atlas = pc.EnvLighting.generateAtlas(src, { size: Math.max(256, QCFG.atlas) });
          const sky = pc.EnvLighting.generateSkyboxCubemap(t, 256);
          res({ atlas, sky });
        } catch (e) { rej(e); }
      };
      img.onerror = () => rej(new Error('hdri ' + name));
      img.src = 'models/env/' + name + '.png';
    });
  }

  // ── key light ───────────────────────────────────────────────────────────────────────────────
  const sun = new pc.Entity('sun');
  sun.addComponent('light', {
    type: 'directional', color: new pc.Color(1, 1, 1), intensity: 2.4,
    castShadows: QCFG.shadows, shadowType: pc.SHADOW_PCF3,
    numCascades: QCFG.cascades, cascadeDistribution: 0.4, shadowDistance: 90, shadowResolution: QCFG.shadowRes,
    /* ⚑ Bias was MEASURED, not guessed. At the defaults a 90 m cascade over a 1024 map gives
     * ~0.09 m texels, and with a low sun that self-shadows the floor in long lines radiating from
     * the vanishing point — which looks exactly like a mipmap/anisotropy failure and sent the
     * evaluation hunting the wrong bug twice. Normal-offset is what actually fixes it; raising the
     * depth bias alone just peels the contact shadows off their objects. */
    shadowBias: num('sbias', 0.012), normalOffsetBias: num('nbias', 0.28), shadowIntensity: num('sint', 0.82),
  });
  sun.setPosition(SUN[0] * 100, SUN[1] * 100, SUN[2] * 100); sun.lookAt(0, 0, 0);
  /* ── THE MIRROR ROOT — this is the fix for "mouse inverted / strafe backwards / aim off" ──
   * Section 9's world is (x right, y up, z FORWARD), which is a LEFT-handed basis. A PlayCanvas
   * camera's is (x right, y up, −z forward), which is RIGHT-handed. The old code reconciled them
   * with a +180° yaw offset: that makes FORWARD agree and cannot make RIGHT agree, because a
   * rotation preserves handedness. Measured at two headings, forward matched exactly and right
   * came out negated both times — so the entire scene was drawn as its own mirror image. Turning
   * right swung the view left, strafe read backwards, and the reticle (drawn dead-centre on the
   * 2D overlay, which does not mirror) stopped pointing where the raycast went. One cause, three
   * bug reports.
   *
   * A handedness flip is not a rotation, so it has to be a SCALE. Everything that lives in game
   * coordinates — level, bodies, FX, level lights — hangs under this one node at scale
   * (−1, 1, 1), and the camera stays OUTSIDE it with the matching conversion in applyCamera().
   * One node instead of negating x at forty call sites, which is what makes it verifiable: the
   * scene is either mirrored or it is not, and nothing can be half-converted.
   *
   * ⚠ Negative scale reverses triangle winding. PlayCanvas derives face flipping from the world
   *   transform's determinant, so this is handled by the engine rather than by us — but it is
   *   the first thing to check if the arena ever renders inside-out. */
  const world = new pc.Entity('worldMirror');
  world.setLocalScale(-1, 1, 1);
  app.root.addChild(world);
  /* the other modules parent into this instead of app.root; one lookup, no import cycle */
  app.__worldMirror = world;
  world.addChild(sun);

  // ── camera ──────────────────────────────────────────────────────────────────────────────────
  /* fov 0.97 rad vertical and near 0.06 are section9-gl.js's own numbers, so the two builds frame
   * the same amount of room. Anything else and a side-by-side is a lie. */
  const FOV = 0.97;
  const cam = new pc.Entity('cam');
  cam.addComponent('camera', { fov: FOV * 180 / Math.PI, nearClip: 0.06, farClip: 140,
    clearColor: new pc.Color(0.02, 0.02, 0.03), toneMapping: POST.tone });
  app.root.addChild(cam);

  // ── the engine post stack, with GfxPost's calibration in it ──────────────────────────────────
  let frame = null, ditherOn = false;
  function buildPost() {
    if (!WANT_POST) return;
    try {
      frame = new pc.CameraFrame(app, cam.camera);
      frame.rendering.samples = 1;                    // TAA/MSAA off; both cost more than they buy here
      /* ⚑ The biggest single mobile lever, and it is one number. `GfxPost.dprCap()` already caps
       * the BACKING STORE; this scales the SCENE target inside it, so the 3D render and every
       * fullscreen post pass get cheaper while the HUD, the reticle and the nameplates stay at
       * full resolution on the 2D overlay above. That split is the point — text going soft is
       * what makes a resolution drop feel like a broken build rather than a quality setting. */
      frame.rendering.renderTargetScale = QCFG.rtScale;
      frame.rendering.toneMapping = POST.tone;        // ← the highlight rolloff. See the note above.
      frame.rendering.sharpness = POST.sharpness;
      frame.bloom.intensity = QCFG.bloom ? POST.bloom : 0;
      frame.bloom.blurLevel = 12;
      frame.ssao.type = QCFG.ssao ? pc.SSAOTYPE_LIGHTING : pc.SSAOTYPE_NONE;
      frame.ssao.intensity = POST.ssao.intensity; frame.ssao.radius = POST.ssao.radius;
      frame.ssao.samples = QCFG.ssaoSamples; frame.ssao.power = POST.ssao.power;
      frame.ssao.minAngle = POST.ssao.minAngle; frame.ssao.blurEnabled = true;
      frame.vignette.inner = POST.vignette.inner; frame.vignette.outer = POST.vignette.outer;
      frame.vignette.curvature = POST.vignette.curvature; frame.vignette.intensity = POST.vignette.intensity;
      frame.grading.enabled = true;
      frame.grading.saturation = POST.saturation; frame.grading.contrast = POST.contrast; frame.grading.brightness = 1.0;
      frame.fringing.intensity = QCFG.fringing ? POST.fringing : 0;
      frame.update();
    } catch (e) { frame = null; say('post stack failed: ' + e.message); }
    installComposeChunk();
  }
  /* ⚑ DITHER + GRAIN, injected. PlayCanvas's compose pass has neither, and GfxPost's 8×8 Bayer at
   * 0.0045 (≈1.1/255) is not decoration: it is what kills the banding an 8-bit write leaves in a
   * dark gradient, which is most of Section 9's corridors. `composeMainEndPS` is the engine's own
   * hook, and it runs after the vignette and BEFORE gammaCorrectOutput — so the value there is
   * still linear, and dithering it directly would put the noise in the wrong space. Round-tripping
   * through an approximate display curve costs two pow() in one fullscreen pass and puts the
   * ±½ LSB where the banding actually is. */
  /* ⧗ …AND THE MOTION SMEAR RIDES IN THE SAME CHUNK. GfxPost's composite does dither, then grain,
   * then the feedback mix LAST — so that is the order here, inside the one pow() round-trip the
   * dither already pays for. One texture fetch behind a branch that is not taken at rest.
   * `s9PrevLin` is 1 only if the copy came back in an sRGB-format texture, which samples LINEAR;
   * on this container's RGB8 backbuffer it is 0 and the sample is already display-encoded. */
  const DITHER_CHUNK = [
    'float s9_h(vec2 p){ return fract(sin(dot(p, vec2(41.0, 289.0))) * 43758.5453); }',
    'float s9_bayer(vec2 p){ vec2 t = floor(mod(p, 8.0)); float b = 0.0, s = 1.0;',
    '  for (int i = 0; i < 3; i++) { vec2 f = floor(mod(t, 2.0)); b += s * (f.x + 2.0 * mod(f.x + f.y, 2.0)); s *= 4.0; t = floor(t * 0.5); }',
    '  return b / 64.0; }',
    'uniform float s9Dither; uniform float s9Grain; uniform float s9GrainT;',
    'uniform float s9Smear; uniform float s9PrevLin; uniform sampler2D s9Prev;',
  ].join('\n');
  const DITHER_MAIN = [
    '{ vec3 s9d = pow(max(result, vec3(0.0)), vec3(1.0 / 2.2));',
    '  s9d += (s9_bayer(gl_FragCoord.xy) - 0.5) * s9Dither;',
    '  s9d += (s9_h(uv * vec2(1023.0, 791.0) + s9GrainT) - 0.5) * s9Grain;',
    '  if (s9Smear > 0.001) { vec3 s9p = texture2D(s9Prev, uv).rgb;',
    '    if (s9PrevLin > 0.5) s9p = pow(max(s9p, vec3(0.0)), vec3(1.0 / 2.2));',
    '    s9d = mix(s9d, s9p, s9Smear); }',
    '  result = pow(max(s9d, vec3(0.0)), vec3(2.2)); }',
  ].join('\n');
  /* ⚠ ONE INSTALLER, BOTH FEATURES. It used to bail on `!QCFG.dither`, which at `low` would have
   * taken the smear down with it for an unrelated reason — and worse, silently. Every uniform
   * defaults to 0, so a feature that is off contributes exactly nothing. */
  function installComposeChunk() {
    const wantDither = QCFG.dither && (POST.dither > 0 || POST.grain > 0);
    if (!wantDither && !QCFG.smear) return;
    try {
      const chunks = pc.ShaderChunks.get(app.graphicsDevice, pc.SHADERLANGUAGE_GLSL);
      chunks.set('composeDeclarationsPS', DITHER_CHUNK);
      chunks.set('composeMainEndPS', DITHER_MAIN);
      const sc = app.graphicsDevice.scope;
      sc.resolve('s9Dither').setValue(wantDither ? POST.dither : 0);
      sc.resolve('s9Grain').setValue(wantDither ? POST.grain : 0);
      sc.resolve('s9GrainT').setValue(0);
      sc.resolve('s9PrevLin').setValue(0);
      smearOff();                       // s9Smear = 0 and a valid 1×1 sampler from the first frame
      ditherOn = wantDither;
    } catch (e) { ditherOn = false; SMEAR.on = false;
      console.warn('[s9pc] compose chunk not installed:', e && e.message); }
  }

  /* ── ⧗ the smear's own plumbing ────────────────────────────────────────────────────────────
   * The whole thing is two operations: sample last frame in the compose (above), and copy this
   * frame out of the backbuffer when it is done (below). `device.copyRenderTarget(null, rt, …)`
   * is a framebuffer BLIT — GPU-side, no readback, no extra fullscreen shader — and the target
   * is allocated in the backbuffer's own format so the blit is format-identical and cannot
   * silently convert. Every step fails open: a throw, a false return or a GL error switches the
   * pass off for good and the frame is then byte-identical to the build without it. */
  const SRGB_FORMATS = [pc.PIXELFORMAT_SRGBA8, pc.PIXELFORMAT_SRGB8].filter(f => f != null);
  /* ⚠ A 1×1 BLACK STAND-IN, and it is not decoration. `s9Prev` is a sampler the compose shader
   * DECLARES, so the engine binds whatever the scope holds every time it runs — including on the
   * frames where `s9Smear` is 0 and the branch is never taken. Leaving a destroyed texture there
   * after the adaptive ladder frees the pass is a dangling GL object bound once per frame. */
  let smearNull = null;
  function smearOff() {
    try {
      if (!smearNull) { smearNull = new pc.Texture(app.graphicsDevice, { name: 's9SmearNull', width: 1, height: 1,
        format: pc.PIXELFORMAT_RGBA8, mipmaps: false });
        smearNull.lock().set([0, 0, 0, 255]); smearNull.unlock(); }
      app.graphicsDevice.scope.resolve('s9Prev').setValue(smearNull);
      app.graphicsDevice.scope.resolve('s9Smear').setValue(0);
    } catch (e) {}
  }
  function ensureSmear() {
    if (!QCFG.smear || !frame) return false;
    const d = app.graphicsDevice, w = d.width | 0, h = d.height | 0;
    if (w < 4 || h < 4) return false;
    if (SMEAR.tex && SMEAR.w === w && SMEAR.h === h) return true;
    freeSmear();
    try {
      SMEAR.tex = new pc.Texture(d, { name: 's9SmearPrev', width: w, height: h, format: d.backBufferFormat,
        mipmaps: false, minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
      SMEAR.rt = new pc.RenderTarget({ name: 's9SmearPrevRT', colorBuffer: SMEAR.tex, depth: false, samples: 1 });
      SMEAR.w = w; SMEAR.h = h;
      /* ⚑ THE WARM-UP GUARD, GfxPost's. The "previous" target has never been written, so the
       * first frame after an allocation or a resize would mix in whatever the driver left there. */
      SMEAR.warm = false; SMEAR.on = true;
      const sc = d.scope;
      sc.resolve('s9Prev').setValue(SMEAR.tex);
      sc.resolve('s9PrevLin').setValue(SRGB_FORMATS.indexOf(d.backBufferFormat) >= 0 ? 1 : 0);
      return true;
    } catch (e) { console.warn('[s9pc] motion smear unavailable:', e && e.message); freeSmear(); QCFG.smear = false; return false; }
  }
  function freeSmear() {
    try { if (SMEAR.rt) SMEAR.rt.destroy(); } catch (e) {}
    try { if (SMEAR.tex) SMEAR.tex.destroy(); } catch (e) {}
    SMEAR.rt = null; SMEAR.tex = null; SMEAR.w = 0; SMEAR.h = 0; SMEAR.warm = false; SMEAR.on = false;
    SMEAR.motion = 0; SMEAR.amt = 0;
    smearOff();
  }
  /* Called once per rendered frame, AFTER the compose has landed. `postrender` is the engine's own
   * "the composition is drawn" event, and copyRenderTarget binds its own read/draw framebuffers
   * and restores the previous one, so it does not care what was bound when it ran. */
  app.on('postrender', () => {
    if (!SMEAR.on || !SMEAR.rt) return;
    try {
      const ok = app.graphicsDevice.copyRenderTarget(null, SMEAR.rt, true, false);
      if (!ok) { console.warn('[s9pc] motion smear: backbuffer copy refused'); freeSmear(); QCFG.smear = false; return; }
      SMEAR.warm = true;
    } catch (e) { console.warn('[s9pc] motion smear copy failed:', e && e.message); freeSmear(); QCFG.smear = false; }
  });
  /* motion 0..1 from what ACTUALLY happened to the camera between frames — rotation first,
   * travel second. Both from DELTAS, never from intent, so a turn stopped by the pitch clamp or a
   * run into a wall smears nothing, because nothing moved.
   *
   * ⚑ MEASURED PER FRAME, NOT PER SECOND, and that correction came out of the measurement rather
   *   than out of the theory. The first cut divided by dt to get rad/s — and `game.step` is fed
   *   `min(0.05, dt)`, so under software GL at 3 fps the smear was reading an EIGHTFOLD
   *   overstated turn rate off a clamped clock. The fix is not a better dt: it is that dt does not
   *   belong here at all. THE EXPOSURE IS THE FRAME. What smears an image is how far it moved
   *   while the shutter was open, and the shutter is open for exactly one frame — so the physical
   *   quantity is displacement per frame, and there is nothing to divide by.
   * ⚠ The honest consequence, stated rather than hidden: at a lower frame rate the same real turn
   *   smears MORE, because the exposure really is longer. That is what a camera does — and it is
   *   why the reference values below are written as rates ÷ 60: the derivation is in rad/s and
   *   m/s, the use is per frame.
   * ⚑ AND IT IS BOUNDED, by a number that was already here. `ADAPT.hi` is 21 ms, so a machine
   *   whose median frame sits above that climbs the quality ladder, and step 2 FREES THIS PASS
   *   ENTIRELY. The smear therefore only ever runs on machines holding better than ~48 fps, i.e.
   *   within 1.26× of the 60 Hz the references are written in. The frame-rate dependence cannot
   *   run away, because the thing it would run away on has already given the feature up.
   * ⚠ WHICH IS ALSO WHY THE TRAVEL TERM CANNOT BE MEASURED IN THIS CONTAINER. `game.step` is fed
   *   `min(0.05, dt)`, and under software GL every frame hits that clamp — so the player advances
   *   0.05 s of sim per frame, 3× a 60 Hz step, and walking alone saturates `vel`. The rotation
   *   term measures correctly (it is driven from the camera, not the clock) and lands on the
   *   derivation to three figures; the travel term is stated analytically at 60 Hz instead:
   *       walk 4.3 m/s → 0.0717 m/frame → vel 0.00 → mix 0.000
   *       sprint 7.0   → 0.1167         → vel 0.51 → mix 0.154
   *       boots 9.6    → 0.1600         → vel 1.00 → mix 0.303 */
  const REF_HZ = 60;                                  // the frame rate the derivation above is in
  function smearMotion() {
    const G = game.G, c = game.cam, me = G.me;
    if (!me || G.mode !== 'play') { SMEAR.seeded = false; return 0; }
    if (!SMEAR.seeded) { SMEAR.seeded = true; SMEAR.yaw = c.yaw; SMEAR.pitch = c.pitch; SMEAR.px = me.x; SMEAR.py = me.y; SMEAR.pz = me.z; return 0; }
    let dy = (c.yaw - SMEAR.yaw) % (Math.PI * 2);
    if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
    const dp = c.pitch - SMEAR.pitch;
    SMEAR.yaw = c.yaw; SMEAR.pitch = c.pitch;
    const dAng = Math.hypot(dy, dp);                                                  // rad this frame
    const dPos = Math.hypot(me.x - SMEAR.px, me.y - SMEAR.py, me.z - SMEAR.pz);       // m this frame
    SMEAR.px = me.x; SMEAR.py = me.y; SMEAR.pz = me.z;
    const rot = clamp(dAng / (SMEAR.wRef / REF_HZ), 0, 1);
    const vel = clamp((dPos - SMEAR.vLo / REF_HZ) / ((SMEAR.vHi - SMEAR.vLo) / REF_HZ), 0, 1);
    return clamp(rot * SMEAR.wRot + vel * SMEAR.wVel, 0, 1);
  }
  buildPost();

  /* ── CLUSTER GRID: TRIED, MEASURED, NOT TAKEN ─────────────────────────────────────────────
   * ⛔ A finer clustered-lighting grid looked like the obvious companion to the light budget and
   *   it MEASURED NEGATIVE, so it is recorded here rather than shipped. The reasoning that made
   *   it look right: PlayCanvas defaults to `cells 10 × 3 × 10` stretched over the bounds of every
   *   enabled light, which in a 48 × 38 m arena is a cell of about 4.8 × 2.7 × 3.8 m, so a 9.5 m
   *   practical lands in a large share of the 300 cells and nearly every fragment iterates nearly
   *   every light.
   * ⚑ The flaw in that reasoning is that clustering only tightens the loop when a light is SMALL
   *   relative to a cell. Halving the cell size does not halve the light's VOLUME, so the same
   *   fraction of the arena still has that light in its cell — the per-fragment loop barely moves
   *   — while the CPU cost of inserting each light rises with the number of cells it touches.
   *   Measured on ARCADE PIT at high, planted camera: 16 × 4 × 16 / maxLightsPerCell 24 came out
   *   6% SLOWER than the engine defaults (1902 ms vs 1782 ms), against a noise floor of ±8% from
   *   two no-op control samples in the same round. Not a win, and possibly a loss.
   * So the defaults stand. The lever that DID work on the same frame is the light budget itself
   * (`omniLive`, see cullPracticals) and the shadow-map size — both above. */

  app.scene.fog.type = pc.FOG_LINEAR;

  // ── the game core ───────────────────────────────────────────────────────────────────────────
  const ui = S9PCUI.create();
  const game = S9Game.create({
    sfx: ui.sfx, powMsg: ui.powMsg, sfxOn: ui.sfxOn, myHandle: ui.myHandle,
    vault: ui.vault, saveVault: ui.saveVault, ownedSlugs: ui.ownedSlugs,
    wager: ui.wager, onEnd: () => { locked = false; ui.result(); },
  });
  window.__s9game = game;
  ui.attach(game);
  ui.paintQualityChips(TIER, AUTO_TIER);
  ui.onQuality = q => { try { localStorage.setItem('s9pc_q', q); } catch (e) {} location.reload(); };

  /* Baked Blender levels join the arena list once they arrive. Deliberately additive and
   * deliberately async, exactly as the shipping game does it: a slow or failed fetch costs one
   * chip that never appears, not a lobby that will not open. */
  if (window.S9World) {
    S9World.load(S9Game.PAL).then(list => { if (!list.length) return;
      ui.setMaps(game.addMaps(list)); }).catch(e => console.warn('[s9pc] baked levels unavailable:', e));
  }

  // ── scene per match ─────────────────────────────────────────────────────────────────────────
  let levelRoot = null, levelLights = [], levelStats = null, fx = null;
  let levelGlows = [], levelFixtures = [];           // the two culled sets — see cullPracticals()
  function clearLevel() {
    if (levelRoot) { try { levelRoot.destroy(); } catch (e) {} levelRoot = null; }
    levelLights.forEach(l => { try { l.destroy(); } catch (e) {} }); levelLights = [];
    levelGlows = []; levelFixtures = [];
  }
  function buildLevel(MAP) {
    clearLevel();
    const OPEN = !!MAP.open;
    setEnvironment(OPEN);
    /* ⚑ OUTDOORS GETS THE REAL CAPTURE. `models/env/preller_drive.png` is 350 KB of CC0 Poly Haven
     * sky (provenance in the sidecar .json), and against a procedural gradient it is not a subtle
     * difference: a captured sky has direction and colour VARIATION in it, so a wall facing one
     * way picks up warm haze and a wall facing the other picks up cool zenith, which is most of
     * why a reference render reads as real. Interiors keep the generated probe — inside a concrete
     * box the fill is bounce off six close surfaces, not sky, and the tuned two-cubemap trick is a
     * better model of that than any capture of an outdoor scene. Low tier skips it for the bytes.
     * `?hdri=proc` opts out; `?hdri=<slug>` picks another. Every failure falls back silently. */
    const wantHdri = Q.has('hdri') ? (Q.get('hdri') === 'proc' ? null : Q.get('hdri'))
                                   : ((OPEN && TIER !== 'low') ? 'preller_drive' : null);
    if (wantHdri) {
      loadHdri(wantHdri).then(E => { app.scene.envAtlas = E.atlas; app.scene.skybox = E.sky; envName = wantHdri; })
        .catch(e => console.warn('[s9pc] hdri:', e && e.message));
    }
    /* ⚑ THE HAZE IS THE DEPTH CUE, and in daylight it goes LIGHTER with distance, not darker.
     * Dusk fogged toward orange (0.77, 0.59, 0.41), which is darker than the pale surfaces in
     * front of it — so distance CLOSED DOWN and far geometry lost its silhouette into a muddy
     * band. A near-white sky-coloured haze does the opposite: everything far is washed toward
     * the sky, everything near keeps its contrast, and the eye reads the difference as range.
     * That is aerial perspective, and it is the whole reason the reference stays legible at
     * the far end of a long sightline. */
    sun.light.color = OPEN ? (DAY ? new pc.Color(1.00, 0.97, 0.91) : new pc.Color(1.00, 0.86, 0.60))
                           : new pc.Color(0.84, 0.90, 1.00);
    sun.light.intensity = OPEN ? (DAY ? 3.1 : 2.6) : 2.4;
    app.scene.fog.color = OPEN ? (DAY ? new pc.Color(0.76, 0.85, 0.93) : new pc.Color(0.77, 0.59, 0.41))
                               : new pc.Color(0.40, 0.39, 0.45);

    const built = S9PCWorld.buildFor(app, MAP);
    levelRoot = built.root; levelStats = built.stats;

    const span = Math.max(MAP.x1 - MAP.x0, MAP.z1 - MAP.z0);
    const far = Math.max(60, Math.min(190, span * 0.95)) * 1.15;
    cam.camera.farClip = far;
    /* ⚠ DAYLIGHT HAZE IS ALMOST NOTHING, AND THE FIRST VERSION OF THIS WAS THE WORST BUG IN THE
     * WHOLE DAYLIGHT PASS. I set start 0.40·far with a near-white fog colour on the theory that
     * "aerial perspective is the depth cue" — which is true outdoors at KILOMETRE scale and
     * nonsense in a 52 m yard. At 0.40 the far wall of the arena sat at ~90% fog, so it and the
     * floor in front of it both resolved to sky colour and the frame became a white void with a
     * gun in it: measured rms 11 where the same arena reads 39–49 from a spot with something
     * unfogged in front of the camera. The reference frames have CRISP distant buildings with a
     * touch of tint — the depth cue there is value and overlap, not haze.
     * So daylight haze is a whisper on the last quarter, and it only exists to stop the arena
     * edge cutting hard against the sky. Dusk keeps its heavy band; at dusk it is real. */
    app.scene.fog.start = far * (OPEN && DAY ? 0.78 : 0.30);
    app.scene.fog.end = far * (OPEN && DAY ? 1.00 : 0.86);
    sun.light.shadowDistance = Math.min(120, far * 0.8);

    /* Ceiling fixtures — SHADOW-CASTING spots on a grid under the roof. Indoors the sun barely
     * reaches the floor (correctly: there is a roof), so without practicals the interior is one
     * flat ambient wash. This is the thing our own renderer cannot do at all: it has exactly one
     * directional key and no local shadows, which is why section9-gl.js has to raise ambient
     * indoors instead of lighting the room. Skipped outdoors — you are standing in the sun. */
    /* ⚑ `spotShadow` IS A COUNT NOW, NOT A BOOLEAN — see the tier table. As a boolean it made all
     * six fixtures shadow casters, i.e. six more full-scene shadow renders per frame on top of the
     * sun's three, every frame, on both baked interiors. A shadow map is a whole extra rasterisa-
     * tion of the level; six of them from six ceiling lights 8 m apart produce overlapping soft
     * shadows nobody can attribute to a particular fixture anyway. `fixtures` is kept so the cull
     * can pick which ones cast by distance rather than by grid order. */
    const fixtures = [];
    if (!OPEN && QCFG.spot > 0) {
      const gx = QCFG.spot, gz = Math.max(1, QCFG.spot - 1), y = (MAP.ceilY || 6) - 1.2;
      for (let i = 0; i < gx; i++) for (let j = 0; j < gz; j++) {
        const x = MAP.x0 + (MAP.x1 - MAP.x0) * (i + 0.5) / gx;
        const z = MAP.z0 + (MAP.z1 - MAP.z0) * (j + 0.5) / gz;
        const e = new pc.Entity('fixture' + i + j);
        e.addComponent('light', { type: 'spot', color: new pc.Color(1.0, 0.95, 0.86), intensity: num('spot', 14),
          range: Math.max(24, span * 0.9), innerConeAngle: 22, outerConeAngle: 56,
          castShadows: false, shadowResolution: 1024, shadowBias: 0.02,
          normalOffsetBias: 0.06, shadowIntensity: 0.9, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED });
        e.setPosition(x, y, z); e.setEulerAngles(-90, 0, 0);
        world.addChild(e); levelLights.push(e); fixtures.push(e);
      }
    }
    levelFixtures = fixtures;
    /* Coloured practicals: every arcade cabinet, shelf run, crate stack or prize booth becomes a
     * small source. This is the "many small lights" case a forward renderer cannot afford and a
     * clustered one can — and it is what makes a corridor read as a place rather than a corridor. */
    const HUES = [[1.0, 0.35, 0.72], [0.30, 0.95, 1.0], [0.45, 1.0, 0.55], [1.0, 0.82, 0.28], [0.72, 0.45, 1.0]];
    const LIT = /^(cab|skee|claw|prize|rcrate|inlay|rostrum|dish)/i;
    let lit = 0;
    const cands = MAP.solids.filter(b => (b.name ? LIT.test(String(b.name)) : (b.kind === 'ammo' || b.kind === 'crate' || b.kind === 'cover' || b.kind === 'shelf')));
    const stride = Math.max(1, Math.floor(cands.length / Math.max(1, QCFG.omni)));
    const glows = [];
    for (let i = 0; i < cands.length && lit < QCFG.omni; i += stride) {
      const b = cands[i], c = HUES[lit % HUES.length];
      const e = new pc.Entity('glow' + lit);
      e.addComponent('light', { type: 'omni', color: new pc.Color(c[0], c[1], c[2]), intensity: num('omni', 4.2),
        range: 9.5, castShadows: false, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED });
      e.setPosition((b.x0 + b.x1) / 2, b.y1 + 0.5, (b.z0 + b.z1) / 2);
      world.addChild(e); levelLights.push(e); glows.push(e); lit++;
    }
    levelGlows = glows;
    levelStats.omni = lit; levelStats.spot = (!OPEN && QCFG.spot > 0) ? QCFG.spot * Math.max(1, QCFG.spot - 1) : 0;
    if (!fx) fx = S9PCFx.create(app);
    cullPracticals(true);
    return built;
  }

  /* ── THE PRACTICALS ARE CULLED BY DISTANCE ────────────────────────────────────────────────
   * The engine already frustum-culls clustered lights (`cullLights` tests each light's bounding
   * sphere against the camera frustum), so what is left after that is lights that genuinely CAN
   * touch a visible pixel — and in a 48 × 38 m arena at a 55° vertical FOV that is most of them.
   * The cost is per fragment: a fragment iterates every light in its cluster cell, and PlayCanvas's
   * default grid is 10 × 3 × 10 cells stretched over the bounds of ALL lights, so a 9.5 m light in
   * an arena that size lands in a large share of the grid and nearly every pixel pays for nearly
   * every light.
   *
   * ⚑ So the budget is enforced where the eye cannot see it being enforced: keep the `omniLive`
   *   NEAREST practicals lit and switch off the rest. A practical is a 9.5 m inverse-squared pool
   *   round a crate; at 25 m it contributes a value the tonemapper cannot express. This is what
   *   makes the cost of an arena independent of how many crates are in it — ARCADE PIT's 46 built
   *   lights and KOWLOON BLOCK's 8 now cost the same to draw.
   *
   * ⚠ Re-evaluated on a TIMER, not per frame: a 20-light sort is nothing, but flipping
   *   `light.enabled` marks the clustered light set dirty, and doing that every frame would hand
   *   back what the cull just bought. 0.2 s is far quicker than a player can cross a 9.5 m pool.
   * ⚑ THE FADE IS WHAT MAKES THE BUDGET EXACT. The first version guarded the boundary with
   *   distance hysteresis (a lit light had to fall 15% past the cut before being dropped) and that
   *   quietly broke the budget: in three dimensions a 15% radius slack is 1.15³ ≈ 1.5× the COUNT,
   *   and it measured 16 lights against a budget of 12. With the fade below there is nothing left
   *   to flicker — a light at the cut is already at zero intensity — so the rank test is hard and
   *   `omniLive` means exactly what it says.
   * ⚑ IT FADES OUT BEFORE IT SWITCHES OFF, which is what makes the budget invisible rather
   *   than merely cheap. A hard cut on RANK pops: walk backwards through an arcade and the
   *   twelfth-nearest cabinet's glow vanishes in one frame, which reads as the level failing to
   *   load rather than as a quality setting. So a light's intensity is windowed on its own
   *   distance against the cut — full inside 78% of it, easing to zero AT it — and by the time
   *   the rank test drops the light it is already contributing nothing. Costs one multiply per
   *   light per 0.2 s; intensity does not dirty the clustered light SET the way `enabled` does. */
  let cullT = 0, cullN = 0;
  const OMNI_I = num('omni', 4.2);                   // the authored intensity the fade scales
  function cullPracticals(force) {
    const live = Math.max(0, QCFG.omniLive | 0);
    if (!levelGlows.length && !levelFixtures.length) return;
    const p = cam.getPosition();
    /* the camera lives OUTSIDE the world mirror, so compare in the mirror's own space — see
     * applyCamera(). Getting this wrong reflects the arena and lights the wrong half of it. */
    const cx = -p.x, cy = p.y, cz = p.z;
    const d2 = e => { const q = e.getLocalPosition(); const dx = q.x - cx, dy = q.y - cy, dz = q.z - cz; return dx * dx + dy * dy + dz * dz; };
    if (levelGlows.length > live) {
      const rank = levelGlows.map(e => ({ e, d: d2(e) })).sort((a, b) => a.d - b.d);
      const cut = rank[Math.max(0, live - 1)].d;
      const cutD = Math.sqrt(cut) || 1;
      for (let i = 0; i < rank.length; i++) {
        const o = rank[i];
        const want = i < live;
        if (o.e.enabled !== want) o.e.enabled = want;
        if (want) {
          const k = Math.max(0, Math.min(1, (cutD - Math.sqrt(o.d)) / (cutD * 0.22)));
          const I = OMNI_I * k;
          if (Math.abs(o.e.light.intensity - I) > 0.01) o.e.light.intensity = I;
        }
      }
      cullN = Math.min(live, rank.length);
    } else {
      /* Every practical fits in the budget: no cut, no fade, exactly what the arena authored.
       * ⚠ This branch MUST re-enable, not just leave things alone. The budget can grow again —
       *   the adaptive ladder halves `omniLive` under load and restores it when the frame recovers
       *   — and a branch that only skipped the cull would leave those lights dark forever, so the
       *   arena would quietly lose half its colour after one slow patch and never get it back. */
      for (const e of levelGlows) {
        if (!e.enabled) e.enabled = true;
        if (e.light.intensity !== OMNI_I) e.light.intensity = OMNI_I;
      }
      cullN = levelGlows.length;
    }
    // the nearest `spotShadow` ceiling fixtures cast; the rest are fill
    const casters = Math.max(0, QCFG.spotShadow | 0);
    if (levelFixtures.length) {
      const rank = levelFixtures.map(e => ({ e, d: d2(e) })).sort((a, b) => a.d - b.d);
      rank.forEach((o, i) => { const want = i < casters; if (o.e.light.castShadows !== want) o.e.light.castShadows = want; });
    }
    if (force) cullT = 0;
  }

  // ── bodies ──────────────────────────────────────────────────────────────────────────────────
  const bodies = new Map();                        // game entity → skin handle
  let bodyPending = new Set();
  function ensureBody(e) {
    if (bodies.has(e) || bodyPending.has(e) || !WANT_BODIES) return;
    const arch = e.skin || (window.S9Skin ? S9Skin.archFor(0) : null);
    if (!arch || !window.S9PCSkin) return;
    bodyPending.add(e);
    const p = S9PCSkin.spawn(app, arch, { tint: e.tint });
    p.then(h => { bodies.set(e, h); bodyPending.delete(e); if (weaponAsset) giveWeapon(h, gunKeyOf(e)); })
      .catch(() => { bodyPending.delete(e);
        /* Fails open, the way the shipping game does: no .skn, a 404, a weak device ⇒ the operative
         * keeps an articulated rig instead of disappearing. Same 11 bones, same poser — only the
         * geometry hanging off them is boxes. */
        try { const h = S9PCSkin.spawnBox(app, e.tint); bodies.set(e, h); if (weaponAsset) giveWeapon(h, gunKeyOf(e)); } catch (err) {}
      });
  }
  function syncBodies(G) {
    for (const e of G.ents) {
      if (e.isMe) continue;
      ensureBody(e);
      const h = bodies.get(e); if (!h) continue;
      if (!e.alive) { h.entity.enabled = false; continue; }
      h.entity.enabled = true;
      // spawn-protection flicker, same read as the shipping game's
      const flick = (e.spawnT > 0 || e.iframe > 0) ? (Math.sin(G.t * 30) > 0) : true;
      if (h.entity.enabled !== flick) h.entity.enabled = flick;
      if (weaponAsset) giveWeapon(h, gunKeyOf(e));   // a weapon swap must change the picture
      h.setPose(e);
      if (h.placeGun) h.placeGun();
    }
  }

  // ── the weapon: a real GLB with a real texture ───────────────────────────────────────────────
  /* This is the single clearest thing the engine buys over our own renderer. `models/weapons/
   * m4a1.glb` carries TEXCOORD_0 and `m4a1_tex.jpg` goes on it as an albedo map under a metalness
   * workflow. Our renderer has no texture path for loaded geometry at all. */
  let weaponAsset = null, gunMat = null, GUNFIT = null, viewmodel = null;
  function loadTexture(url, srgb) {
    return new Promise((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const t = new pc.Texture(app.graphicsDevice, { name: url, width: img.width, height: img.height,
          format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8, mipmaps: true,
          addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT,
          minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, anisotropy: QCFG.aniso });
        t.setSource(img); res(t); };
      img.onerror = () => rej(new Error('image ' + url)); img.src = url;
    });
  }
  /* ⛔ FOUR WEAPONS, ONE MODEL — the artist's "all the guns look like the same gun", and it was
   *    literal: this loaded `m4a1.glb` once and `giveWeapon` handed that same carbine to every
   *    operative, so the pistol, the shotgun and the bolt rifle were all drawn as an M4. The
   *    NAMES then described weapons that were not on screen, which is the second half of the
   *    report ("the guns are misnamed").
   * ⚑ ONE GLB, FOUR NAMED PARTS — `models/weapons/s9-guns.glb` from scripts/blender/build-guns.py,
   *    the same contract models/dogfight.glb uses. One fetch, 1,092 triangles for all four.
   * ⚠ The M4 asset is deliberately still in the repo and still loadable: `?gun=m4a1` restores it,
   *    because it is the A/B for anything that changes how a weapon is fitted or held. */
  const GUN_KEYS = ['pistol', 'smg', 'shotgun', 'sniper'];
  /* ⛔ REAL MODELS FIRST. Two of these were already in the repo, converted and cleared, and the
   *    first cut of this shipped procedural stand-ins beside them — which is the same mistake as
   *    the four-names-one-mesh bug wearing better clothes.
   *      magnum460.glb  CC0 1.0, github.com/TheGoodFella/magnum460Blend, brought in by our own
   *                     fbx2glb and credited in CREDITS.md. 2,120 tris.
   *      m4a1.glb       artist-supplied and artist-cleared (models/weapons/README.md), 1,642 tris,
   *                     and the ONLY one carrying a UV set + base-colour map.
   *    Only SCATTER has no source — nothing in the dropped repos is a shotgun, and the two that
   *    do carry shotguns (DAM001/blenderWeaponCreator, DanielKlas/3D-Models) have NO LICENCE FILE,
   *    so under this repo's standing rule their geometry cannot be committed. That one is built.
   * ⚠ `sniper_stand.glb` is deliberately NOT wired to COLD CALL: its silhouette is mirror-
   *   symmetric top-to-bottom over 268 triangles, i.e. it is the BIPOD out of the KSR28 blend,
   *   not the rifle. Mapping it by filename would have put a tripod in an operative's hands. */
  const GUN_SRC = {
    pistol: { url: 'models/weapons/magnum460.glb' },
    smg: { url: 'models/weapons/m4a1.glb', tex: 'models/weapons/m4a1_tex.jpg' },
    shotgun: { url: 'models/weapons/s9-guns.glb', part: 'gun_shotgun' },
    sniper: { url: 'models/weapons/s9-guns.glb', part: 'gun_sniper' },
  };
  const GUN_ASSET = {};                      // key -> loaded container asset
  const GUN_MAT = {};                        // key -> material (the M4 gets its own, textured)
  const GUN_PART = {};                       // key -> the named node to pull out, when there is one
  /* ⚠ NOT all normalised to one length. `fitWeapon` used to scale every weapon to 0.86 m, which
   *   is correct when there is one model and ACTIVELY WRONG now: it would stretch the pistol to
   *   the length of the bolt rifle and undo the silhouette difference this file exists to create.
   *   These are the drawn lengths, in metres, and they are the read at range. */
  const GUN_LEN = { pistol: 0.42, smg: 0.82, shotgun: 0.78, sniper: 1.02 };
  function loadWeapon() {
    if (!WANT_WEAPON) return Promise.resolve(null);
    /* One container per distinct FILE, not per weapon — s9-guns.glb serves two keys and must not
     * be fetched twice. `?gun=m4a1` still forces the old everything-is-a-carbine behaviour. */
    const legacy = (Q.get('gun') === 'm4a1');
    gunMat = new pc.StandardMaterial();
    gunMat.name = 'gun';
    /* ⚠ DARK. js/s9pc-world.js keeps arena walls at 0.60–0.70 albedo precisely so a dark
     *   silhouette reads against them; a bright weapon becomes the most salient thing on screen,
     *   brighter than the person carrying it. Same band as the bodies. */
    gunMat.diffuse = new pc.Color(0.20, 0.20, 0.22);
    gunMat.useMetalness = true; gunMat.metalness = 0.62; gunMat.gloss = 0.42;
    gunMat.update();

    const files = {};
    GUN_KEYS.forEach(k => {
      const src = legacy ? { url: 'models/weapons/m4a1.glb', tex: 'models/weapons/m4a1_tex.jpg' } : GUN_SRC[k];
      if (!src) return;
      (files[src.url] = files[src.url] || { keys: [], tex: src.tex }).keys.push(k);
      if (src.part) GUN_PART[k] = src.part;
      if (legacy) delete GUN_PART[k];
    });

    const jobs = Object.keys(files).map(url => {
      const f = files[url];
      const texP = f.tex ? loadTexture(f.tex, true).catch(() => null) : Promise.resolve(null);
      return Promise.all([
        new Promise((res, rej) => app.assets.loadFromUrl(url, 'container', (err, a) => err ? rej(new Error(url + ': ' + err)) : res(a))),
        texP,
      ]).then(([asset, tex]) => {
        let mat = gunMat;
        if (tex) {
          /* The M4 is the only weapon with a UV set and a base-colour map, so it is the only one
           * that gets a textured material. Everything else takes the shared dark one. */
          mat = new pc.StandardMaterial();
          mat.name = 'gun-tex'; mat.diffuseMap = tex; mat.diffuse = new pc.Color(1, 1, 1);
          mat.diffuseMapTint = false; mat.useMetalness = true; mat.metalness = 0.62; mat.gloss = 0.50;
          mat.update();
        }
        f.keys.forEach(k => { GUN_ASSET[k] = asset; GUN_MAT[k] = mat; });
        if (!weaponAsset) weaponAsset = asset;      // "something loaded" for the existing guards
      }).catch(e => {
        /* ⚑ FAILS OPEN TO THE BUILT SET. s9-guns.glb still carries all four parts, so a 404 or a
         * bad decode on one of the real models leaves that weapon with a plain built stand-in
         * rather than an empty hand. Only the source is lost, never the silhouette. */
        console.warn('[s9pc] weapon:', e && e.message);
        f.keys.forEach(k => { if (!GUN_PART[k]) GUN_PART[k] = 'gun_' + k; });
      });
    });

    return Promise.all(jobs).then(() => {
      /* Any key still without an asset falls back to the built container, whichever file that is. */
      const built = GUN_ASSET.shotgun || GUN_ASSET.sniper || weaponAsset;
      GUN_KEYS.forEach(k => { if (!GUN_ASSET[k] && built) { GUN_ASSET[k] = built; GUN_MAT[k] = gunMat; GUN_PART[k] = GUN_PART[k] || ('gun_' + k); } });
      bodies.forEach((h, e) => giveWeapon(h, gunKeyOf(e)));
      makeViewmodel(game && game.G && game.G.me ? gunKeyOf(game.G.me) : 'smg');
      return weaponAsset;
    });
  }
  function gunKeyOf(e) {
    try { const w = S9Game.WEAPONS[(e && e.weapon) | 0]; return (w && w.key) || 'smg'; } catch (x) { return 'smg'; }
  }
  /* Measure the GLB rather than assume it: longest axis = the barrel line, second = up. The rifle
   * then fits whatever the converter emitted without a hand-tuned magic transform — the same rule
   * dogfight.html uses for its craft. */
  function fitWeapon(ent, want) {
    const aabb = new pc.BoundingBox(); let first = true;
    ent.findComponents('render').forEach(r => r.meshInstances.forEach(mi => { if (first) { aabb.copy(mi.aabb); first = false; } else aabb.add(mi.aabb); }));
    if (first) return null;
    const he = aabb.halfExtents, ctr = aabb.center;
    const size = [he.x * 2, he.y * 2, he.z * 2];
    const order = [0, 1, 2].sort((a, b) => size[b] - size[a]);
    return { LONG: order[0], UP: order[1], k: (want || 0.86) / (size[order[0]] || 1), ctr: [ctr.x, ctr.y, ctr.z], size };
  }
  const GUNFITS = {};
  function weaponEntity(key) {
    const asset = GUN_ASSET[key] || weaponAsset;
    if (!asset) return new pc.Entity('gun-none');
    const whole = asset.resource.instantiateRenderEntity();
    let ent = whole;
    const part = GUN_PART[key];
    if (part) {
      /* Pull the one part out of the container and drop the rest. Instantiating four separate
       * containers would be four copies of every mesh in the file for one gun. */
      const found = whole.findByName(part);
      if (found) { found.reparent(null); whole.destroy(); ent = found; }
    }
    const mat = GUN_MAT[key] || gunMat;
    ent.findComponents('render').forEach(r => { r.castShadows = true; r.receiveShadows = true;
      r.meshInstances.forEach(mi => { mi.material = mat; mi.castShadow = true; }); });
    if (!GUNFITS[key]) GUNFITS[key] = fitWeapon(ent, GUN_LEN[key]);
    const F = GUNFITS[key]; if (!F) return ent;
    const holder = new pc.Entity('gun-' + key), pivot = new pc.Entity('gun-' + key + '-pivot');
    ent.setLocalPosition(-F.ctr[0], -F.ctr[1], -F.ctr[2]);
    pivot.addChild(ent);
    const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const zAxis = AX[F.LONG].slice(), yAxis = AX[F.UP].slice();
    const xAxis = [yAxis[1] * zAxis[2] - yAxis[2] * zAxis[1], yAxis[2] * zAxis[0] - yAxis[0] * zAxis[2], yAxis[0] * zAxis[1] - yAxis[1] * zAxis[0]];
    const m = new pc.Mat4();
    m.data.set([xAxis[0], yAxis[0], zAxis[0], 0, xAxis[1], yAxis[1], zAxis[1], 0, xAxis[2], yAxis[2], zAxis[2], 0, 0, 0, 0, 1]);
    pivot.setLocalRotation(new pc.Quat().setFromMat4(m));
    pivot.setLocalScale(F.k, F.k, F.k);
    holder.addChild(pivot);
    return holder;
  }
  /* ⚠ KEYED ON THE WEAPON, not "once per body". The old guard was `if (h.__gun) return`, which
   *   was right when there was one model and would now freeze an operative holding whatever they
   *   spawned with — switching weapons would change the damage and the sound and not the picture. */
  function giveWeapon(h, key) {
    if (!h || !(GUN_ASSET[key] || weaponAsset)) return;
    if (!GUN_PART[key] && Object.keys(GUN_PART).length) key = GUN_PART.smg ? 'smg' : Object.keys(GUN_PART)[0];
    if (h.__gunKey === key && h.__gun) return;
    if (h.__gun) { try { h.__gun.destroy(); } catch (e) {} h.__gun = null; }
    const g = weaponEntity(key);
    h.entity.addChild(g); h.__gun = g; h.__gunKey = key;
    h.placeGun = () => {
      const P2 = h.pose; if (!P2) return;
      const gp = P2.grip, mz = P2.muzzle;
      g.setLocalPosition(gp[0], gp[1], gp[2]);
      const d = [mz[0] - gp[0], mz[1] - gp[1], mz[2] - gp[2]];
      const l = Math.hypot(d[0], d[1], d[2]) || 1;
      // the body root is scaled px→metres (h/150) and the fit normalises the GLB to 0.86 m at
      // scale 1, so undoing the root scale keeps the rifle 0.86 m however tall the operative is
      const s = S9Skin.H / ((h.state && h.state.h) || 1.72);   // px→m undo; length is GUN_LEN[key]
      g.setLocalScale(s, s, s);
      const wp = h.entity.getWorldTransform().transformPoint(new pc.Vec3(gp[0] + d[0] / l * 40, gp[1] + d[1] / l * 40, gp[2] + d[2] / l * 40));
      g.lookAt(wp);                                  // aims −z at the target, and −z is the muzzle
    };
    h.placeGun();
  }
  /* ── VIEWMODEL ARMS ────────────────────────────────────────────────────────────────────────
   * ⚑ THE GUN WAS FLOATING WITH NO HANDS. There was never a viewmodel rig — `makeViewmodel()`
   * parented the bare weapon GLB to the camera and stopped, so the first-person view was a rifle
   * hovering unsupported in the lower right. The third-person bodies never had this problem
   * because `giveWeapon()` hangs their gun off a posed skeleton that already has hands.
   *
   * These are built from primitives rather than modelled, on purpose: a viewmodel is on screen
   * every frame of the game, it is never seen from any angle but this one, and it must never cost
   * a texture fetch that could fail. Ten boxes is the right amount of geometry for something the
   * player reads as "my hands" and never inspects.
   *
   * ⚑ PLACEMENT IS DERIVED, NOT MAGIC. `fitWeapon()` normalises any weapon GLB to L = 0.86 m along
   * its long axis with the muzzle at −z, so the grip and the handguard sit at fixed FRACTIONS of
   * that length whatever model is loaded. Hard-coding metres here would put the hands through the
   * cylinder of the next weapon that gets wired up (the CC0 magnum is already in the repo).
   *
   * ⚠ The arms run BACKWARD toward the camera (+z in holder space). The holder sits at camera-z
   * −0.62 and the elbows end ~0.42 ahead of it, i.e. camera-z −0.20 — clear of the 0.06 near clip.
   * Push them further back and they will be sliced open by the near plane, which reads as a hole
   * in the screen rather than as a clipping bug.
   *
   * ⚑ THE ELBOWS EXIT THE BOTTOM OF THE FRAME, they do not reach toward the lens. First draft
   * angled the forearms back at the camera: measured, the arms spanned 0.313 × 0.269 × 0.68 next
   * to a rifle only 0.074 wide, and the near end sat at camera-z −0.17, where perspective makes a
   * 0.08 m cuff enormous. Two boxes the size of the gun, floating beside it. Real first-person
   * arms are mostly OFF SCREEN — the forearm leaves through the bottom edge and only the glove and
   * a little sleeve are ever in frame. So the elbow rotation is steeply downward (−58°/−46° about
   * x) and the check is geometric: the far end must fall below the visible half-height at its own
   * depth, or it is on screen and it will read as a slab.
   * ⚠ And the cuff was a saturated green, which put the brightest, most saturated object in the
   * game in the corner of every single frame. Viewmodel colour is nearly all of a shooter's
   * screen-time; it belongs at the dark end so the ARENA is what the eye goes to. */
  const HAND = { glove: [0.10, 0.11, 0.13], cuff: [0.13, 0.28, 0.23], sleeve: [0.17, 0.19, 0.22] };
  function makeHands(holder) {
    const L = 0.86;                                   // fitWeapon's normalised weapon length
    const mat = (rgb, gloss) => { const m = new pc.StandardMaterial();
      m.diffuse = new pc.Color(rgb[0], rgb[1], rgb[2]);
      m.useMetalness = true; m.metalness = 0.05; m.gloss = gloss == null ? 0.34 : gloss;
      m.update(); return m; };
    const gloveMat = mat(HAND.glove), cuffMat = mat(HAND.cuff, 0.5), sleeveMat = mat(HAND.sleeve);
    const part = (parent, m, pos, rot, scale) => {
      const e = new pc.Entity();
      e.addComponent('render', { type: 'box', material: m, castShadows: false, receiveShadows: false });
      e.setLocalPosition(pos[0], pos[1], pos[2]);
      if (rot) e.setLocalEulerAngles(rot[0], rot[1], rot[2]);
      e.setLocalScale(scale[0], scale[1], scale[2]);
      parent.addChild(e); return e;
    };
    /* One arm, mirrored by `side`. `grip` is where the hand sits along the weapon as a fraction of
     * L: the trigger hand is behind centre, the support hand well forward on the handguard. */
    /* ⚑ THE FOREARM IS BUILT FROM THE WRIST OUTWARD, not placed by hand. First version set each
     * box's CENTRE and its ROTATION as two independent guesses, so the cuff and the forearm did
     * not meet the hand or each other — projected to screen they were three separate chunks with
     * gaps, which reads as debris floating near the gun rather than as an arm. Deriving the
     * position from the direction makes the joint exact by construction: the near end of the
     * forearm IS the wrist, whatever angle it is swung to, and the assertion below checks it. */
    const dirOf = (pitchDeg, yawDeg, side) => {
      const p = pitchDeg * Math.PI / 180, y = yawDeg * Math.PI / 180;
      return new pc.Vec3(side * Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(p) * Math.cos(y)).normalize();
    };
    /* Point a box's local +z (its length axis, since only z is scaled long) along `dir`. */
    const _m = new pc.Mat4();
    const orient = (e, dir) => {
      const up = Math.abs(dir.y) > 0.95 ? new pc.Vec3(0, 0, 1) : new pc.Vec3(0, 1, 0);
      const xa = new pc.Vec3().cross(up, dir).normalize();
      const ya = new pc.Vec3().cross(dir, xa).normalize();
      _m.data.set([xa.x, xa.y, xa.z, 0, ya.x, ya.y, ya.z, 0, dir.x, dir.y, dir.z, 0, 0, 0, 0, 1]);
      e.setLocalRotation(new pc.Quat().setFromMat4(_m));
    };
    const arm = (side, grip, pitch, yaw) => {
      const root = new pc.Entity('arm' + (side > 0 ? 'R' : 'L'));
      const z = grip * L, x = side * 0.010;
      part(root, gloveMat, [x, -0.058, z], null, [0.070, 0.052, 0.092]);             // palm, under the receiver
      part(root, gloveMat, [x, -0.024, z - 0.030], [8, 0, 0], [0.064, 0.042, 0.048]); // fingers curling over
      part(root, gloveMat, [x - side * 0.032, -0.038, z + 0.012], [0, 0, side * 12], [0.024, 0.028, 0.052]); // thumb
      // wrist = back edge of the palm; everything below hangs off it along one direction
      const w = [x, -0.062, z + 0.046], d = dirOf(pitch, yaw, side), FL = 0.34;
      /* Two segments, not one — a forearm TAPERS, and a single untapered box reads as a slab of
       * cardboard however well it is jointed. Thin at the wrist, thicker toward the elbow; it is
       * one extra draw and it is the difference between "an arm" and "a rectangle". */
      const seg = (from, len, w0) => {
        const e = part(root, sleeveMat, [w[0] + d.x * (from + len / 2), w[1] + d.y * (from + len / 2),
                                         w[2] + d.z * (from + len / 2)], null, [w0, w0, len]);
        orient(e, d); return e;
      };
      const cuff = part(root, cuffMat, [w[0] + d.x * 0.024, w[1] + d.y * 0.024, w[2] + d.z * 0.024],
                        null, [0.074, 0.074, 0.048]);
      orient(cuff, d);
      const WRIST_IN = 0.046;                       // the first segment starts inside the palm
      const near = seg(WRIST_IN, FL * 0.42, 0.062); // wrist end, narrow
      seg(WRIST_IN + FL * 0.42, FL * 0.58, 0.082);  // toward the elbow, thicker
      root.__near = { ent: near, from: WRIST_IN, len: FL * 0.42 };   // for the headless joint check
      root.__wrist = w; root.__dir = [d.x, d.y, d.z]; root.__fl = FL;   // for the headless joint check
      holder.addChild(root); return root;
    };
    arm(+1, 0.10, 58, 9);       // trigger hand, behind centre, forearm steeply down and out right
    arm(-1, -0.20, 47, 20);     // support hand, forward on the handguard, forearm down and out left
  }

  /* ── VIEWMODEL FRAMING ─────────────────────────────────────────────────────────────────────
   * ⚑ THE GUN WAS EATING THE SCREEN AND AIMING WAS BAD BECAUSE OF IT. `fitWeapon()` normalises
   * every weapon to a TRUE 0.86 m, and 0.86 m of rifle held 0.62 m from the eye at a 0.97 rad
   * vertical FOV is, correctly, most of the lower half of the frame. That is what a real rifle
   * looks like from behind and it is not what a playable first-person game does — shooters cheat
   * the viewmodel smaller, because the weapon is scenery and the ARENA is the thing you have to
   * read. `scale` is that cheat, applied to the holder so the hands scale with it.
   *
   * ⚑ ADS NOW MOVES THE WEAPON ONTO THE SIGHTLINE AND ZOOMS. The old code snapped between two
   * positions with a hard 0/1 and pulled the gun CLOSER on aim (z −0.62 → −0.52), i.e. it made
   * the obstruction bigger at the exact moment the player needs to see. Now: eased, moved to
   * x = 0 so the sights sit on the reticle's vertical, held at distance rather than pulled in,
   * and given a modest FOV zoom. Iron sights that do not magnify at all read as broken to anyone
   * who has played a shooter.
   * ⚠ The ADS zoom is skipped for a weapon with a real optic — `G.scopeZoom` already handles
   * those and the viewmodel is hidden behind the scope, so stacking the two would double-zoom. */
  const VM = {
    hip:    [0.225, -0.200, -0.62],
    ads:    [0.000, -0.078, -0.62],   // x=0 puts the sights on the reticle; z unchanged, never nearer
    scale:  0.76,
    /* ⚑ 1.22× WAS TOO LITTLE TO READ AS AIMING. Compared side by side against the reference the
     * complaint was exact — "still not a good zoom into the iron sights". 1.55× takes the vertical
     * FOV 55.6° → 35.9°, which is the range a real aperture sight subtends and enough that the
     * target visibly grows rather than the gun merely sliding to the middle. */
    fovMul: 1.55,
    ease:   16,                       // per second, so ADS is a movement rather than a snap
  };
  let adsT = 0, vmLast = 0, SIGHTS = null;
  const _vmP = new pc.Vec3(), _vmQ = new pc.Quat(), _vmI = new pc.Quat(), _vmID = new pc.Quat();

  /* ── TRUE IRON SIGHTS ──────────────────────────────────────────────────────────────────────
   * ⚑ THE ADS OFFSET WAS A GUESSED NUMBER AND THAT IS WHY IT NEVER LOOKED RIGHT. Hand-tuning
   * "move the gun up a bit and left a bit" can put the sight NEAR the reticle, which is what the
   * old version did — but aiming down irons is not a weapon POSITION, it is a LINE: the rear
   * notch, the front post and your eye have to be collinear, and the barrel points where that
   * line points. Get it approximately right and the player sees a rifle slab with a dark blob
   * roughly near the crosshair, which is exactly the complaint.
   *
   * So find the sights in the actual mesh instead of guessing. In holder space the weapon is
   * normalised to 0.86 m with the muzzle at −z, so the front post is the highest vertex near the
   * centreline in the front half and the rear notch is the highest near the centreline in the
   * back half. From those two points the alignment is fully determined:
   *     rotation  Q : rotates (front − rear) onto the camera's own −z
   *     position  P : (0, 0, −EYE) − Q·rear      → puts the rear notch dead centre, EYE in front
   * Both sights then project to screen centre by construction, and `?sights=1` prints their
   * measured screen positions so that claim is checkable rather than asserted.
   *
   * Falls back to the old hand-tuned offset if the mesh cannot be read or the two points come out
   * degenerate — a weapon with no iron sights modelled (or a future GLB with a scope rail) must
   * not end up aiming at the floor. */
  const EYE = 0.185;                                 // rear notch this far in front of the eye
  function findSights(holder) {
    try {
      const inv = holder.getWorldTransform().clone().invert();
      const v = new pc.Vec3();
      let R = null, F = null;
      holder.findComponents('render').forEach(r => r.meshInstances.forEach(mi => {
        for (let n = mi.node; n; n = n.parent) if (/^arm/.test(n.name || '')) return;  // gun only
        const pos = [];
        if (!mi.mesh || !mi.mesh.getPositions(pos) || !pos.length) return;
        const wt = mi.node.getWorldTransform();
        for (let i = 0; i < pos.length; i += 3) {
          v.set(pos[i], pos[i + 1], pos[i + 2]);
          wt.transformPoint(v, v); inv.transformPoint(v, v);
          if (Math.abs(v.x) > 0.022) continue;                 // stay on the centreline
          if (v.z > 0.02 && v.z < 0.32) { if (!R || v.y > R.y) R = v.clone(); }
          else if (v.z < -0.06 && v.z > -0.40) { if (!F || v.y > F.y) F = v.clone(); }
        }
      }));
      if (!R || !F) return null;
      const d = new pc.Vec3().sub2(F, R);
      if (d.length() < 0.05) return null;                      // degenerate: sights on top of each other
      d.normalize();
      const target = new pc.Vec3(0, 0, -1);
      const axis = new pc.Vec3().cross(d, target);
      const q = new pc.Quat();
      if (axis.length() < 1e-6) q.set(0, 0, 0, 1);
      else q.setFromAxisAngle(axis.normalize(), Math.acos(Math.max(-1, Math.min(1, d.dot(target)))) * 180 / Math.PI);
      /* ⚠ SCALE. R and F are measured in HOLDER-LOCAL space, which is unscaled — but the holder
       * itself carries VM.scale, and `pos` is expressed in the PARENT's (the camera's) space. So
       * the rotated rear-sight offset has to be scaled before it is cancelled out. Leaving it out
       * put both sights below the reticle by exactly the scale shortfall: measured 125 px low at
       * the rear and 53 px at the front, a 2.4× ratio that matches the two depths (0.185 m vs
       * 0.50 m) and is therefore a pure TRANSLATION error — a rotation error would not scale with
       * distance like that. That ratio is what identified it; the horizontal was already correct
       * to 4 px, which ruled out the rotation entirely. */
      const rr = R.clone(); q.transformVector(rr, rr); rr.mulScalar(VM.scale);
      return { pos: new pc.Vec3(-rr.x, -rr.y, -EYE - rr.z), rot: q, rear: R.clone(), front: F.clone() };
    } catch (e) { console.warn('[s9pc] sights:', e && e.message); return null; }
  }

  /* ⚑ THE VIEWMODEL SWAPS TOO. Third-person bodies were not the only place the one-model bug
   *   showed: the player's own hands held whatever was built at load, so switching weapons changed
   *   the damage, the spread and the sound while the picture in front of you stayed put. */
  let VM_KEY = null;
  function makeViewmodel(key) {
    key = key || 'smg';
    if (viewmodel) { try { viewmodel.destroy(); } catch (e) {} viewmodel = null; }
    VM_KEY = key;
    viewmodel = weaponEntity(key);
    makeHands(viewmodel);
    viewmodel.setLocalScale(VM.scale, VM.scale, VM.scale);
    cam.addChild(viewmodel);
    SIGHTS = findSights(viewmodel);
    window.__s9sights = SIGHTS;                      // ?sights=1 / headless alignment check
    if (!SIGHTS) console.warn('[s9pc] no iron sights found — falling back to the hand-tuned ADS offset');
    /* ⚠ PlayCanvas cameras look down their own −z, so a viewmodel at +z is BEHIND you — and a
     * 0.86 m rifle parked behind the near plane fills two thirds of the frame with one grey
     * polygon. Same family of mistake as the dogfight camera's missing +π/2.
     * ⚑ The MUZZLE is the model's −z end and the camera also looks down −z, so the viewmodel needs
     * NO yaw at all; the obvious 180° "because the camera looks backwards" aims it at the player. */
    viewmodel.setLocalPosition(0.20, -0.19, -0.62);
    viewmodel.setLocalEulerAngles(0, 0, 0);
    viewmodel.findComponents('render').forEach(r => r.meshInstances.forEach(mi => { mi.castShadow = false; }));
  }
  loadWeapon();

  /* ── ⧗ FIELD PRIZES — the five mobility tokens, as objects ───────────────────────────────────
   *
   * ⛔ WHAT THIS REPLACES. Every drop on the field was TWO CAMERA-FACING BILLBOARD QUADS in
   *    js/s9pc-fx.js — a bobbing coloured core and a halo — so all that distinguished RUSH from
   *    SLIP from a medkit was an RGB triple. Colour is the first thing the bloom pass eats, the
   *    first thing a colour-blind player loses, and it carries nothing at all in a silhouette.
   *    And `sin(t*3)` on the height with `0.72 + 0.28*sin(t*4)` on the size is exactly the "pulse,
   *    breathe or drift for their own sake — a loop the eye can learn is a screensaver" that
   *    docs/DESIGN-SYSTEM.md §4 rules out by name.
   *
   * The meshes and the whole brief are in scripts/blender/build-pickups.py; every triangle is
   * generated there, so nothing here needs licence clearing. The design contract, restated:
   *
   * ⚑ THE PART NAME IS THE MOB KEY. `models/pickups.glb` carries `pu_base` plus one part per
   *   entry in S9Game's MOBS table — pu_rush · pu_hover · pu_flight · pu_spring · pu_slip — so
   *   the lookup below is `'pu_' + pw.type` and there is NO translation table to drift out of
   *   date (ROADMAP §5.4). A sixth verb is a part in the .py file and zero lines here.
   *
   * ⚑ EVERY IDLE MOTION IS THE ITEM'S OWN VERB, PERFORMED ON ITSELF, which is §4's actual
   *   question and the half that got two hero wordmarks rejected. Nothing here is a sine on a
   *   scale: the top's spin DECAYS and topples, the saucer drifts off station and CORRECTS, the
   *   rotor weathervanes into a draught, the boot loads and FIRES with overshoot, and the glass
   *   runs at a quarter of everything else's rate — it is not depicting slow motion, it IS slow
   *   in a frame where nothing else is. You can name a token before you can read its HUD line.
   *
   * ⚠ FAILS OPEN AT EVERY STEP. A 404, a bad decode, a missing part or an unknown type leaves the
   *   fx billboard drawing on its own and the match completely unaffected; nothing in the game
   *   reads anything this block writes. `?pu=0` opts out, `?pu=demo` stands one of each in a row
   *   in front of the player (ROADMAP §5.3 — built ≠ reachable, so there is a way to see them
   *   without waiting on the drop table). */
  const PU_ON = Q.get('pu') !== '0';
  const PU_DEMO = Q.get('pu') === 'demo';
  const PU_URL = 'models/pickups.glb';
  let puAsset = null, puBayMat = null;
  const puMat = {};                                   // type -> its own tinted material
  const puLive = new Map();                           // pw (or demo key) -> { root, prize, st }

  function puMakeMat(col, bay) {
    const m = new pc.StandardMaterial();
    m.name = bay ? 'pu-bay' : 'pu-prize';
    const c = new pc.Color(col[0] / 255, col[1] / 255, col[2] / 255);
    if (bay) {
      /* The bay is the CORPORATE half (docs/DELTRON-3030.md §2): machined, cold, gold-accented,
       * and it never moves. Same value band as everything else the arena built. */
      m.diffuse = new pc.Color(0.24, 0.22, 0.18);
      m.useMetalness = true; m.metalness = 0.80; m.gloss = 0.55;
      m.emissive = new pc.Color(1.00, 0.82, 0.23); m.emissiveIntensity = 0.16;
    } else {
      /* ⚠ DARK BODY, LIT EDGE — and the dark half is not a style choice. js/s9pc-world.js holds
       *   arena walls at 0.60–0.70 albedo precisely so a dark silhouette reads against them,
       *   which is why the guns sit at 0.20. A bright prize in a bright room does not pop; a dark
       *   prize with a hot edge does, and a hot edge is what the artist's own cards are made of
       *   — a heavy keyline carrying the form with flat fills inside it, inverted for a game
       *   where the ground is dark, so the keyline has to be the light one.
       * ⚑ THE EDGE IS A SCHLICK FRESNEL ON A TINTED SPECULAR, i.e. the rim brightens at grazing
       *   angles — which is what a keyline IS, because an outline is view-dependent and therefore
       *   cannot be baked into geometry. It follows the silhouette exactly, from every bearing,
       *   for free, and the .py file's chamfer bands are there to give it a surface to sit on
       *   rather than a zero-width edge.
       * ⛔ A TRUE EMISSIVE FRESNEL WOULD NEED A `chunks.emissivePS` OVERRIDE AND IS DELIBERATELY
       *   NOT TAKEN. This engine is PlayCanvas 2.0, whose chunk contract goes through
       *   `_addMapDefines` and is not the 1.x one most references describe; a chunk that fails to
       *   compile does not degrade, it makes the object vanish or takes the material down with
       *   it. Fail-open is the standing principle here and it outranks a better rim. */
      /* ⚠ EMISSIVE 0.26, NOT 0.42, and the first driven screenshot is why: at 0.42 the emissive
       *   term buried a 0.21 diffuse, so every prize rendered as a FLAT UNSHADED PATCH OF COLOUR
       *   — technically the "flat saturated ink" the brief asks for, and it threw away every
       *   chamfer, flare and die-cut band the mesh was built to carry. The silhouette still read;
       *   the object stopped being an object. Low enough to keep the form, high enough to reach
       *   the bright pass on a dark interior wall. */
      m.diffuse = new pc.Color(0.21, 0.20, 0.22);
      m.useMetalness = true; m.metalness = 0.30; m.gloss = 0.88;
      m.specular = c; m.specularityFactor = 1.0;
      m.useFresnel = true; m.fresnelModel = pc.FRESNEL_SCHLICK;
      m.emissive = c; m.emissiveIntensity = 0.26;
    }
    m.update();
    return m;
  }

  function loadPickups() {
    if (!PU_ON) return Promise.resolve(null);
    puBayMat = puMakeMat([255, 210, 59], true);
    return new Promise(res => app.assets.loadFromUrl(PU_URL, 'container', (err, a) => {
      if (err) { console.warn('[s9pc] pickups:', err); return res(null); }
      puAsset = a; res(a);
    })).catch(e => { console.warn('[s9pc] pickups:', e && e.message); return null; });
  }
  loadPickups();

  /* The three field drops are not in MOBS — that table is mobility only — so their colours come
     from S9Game's POWS/AMPPOW, mirrored here. Same values, one lookup, no translation table. */
  const PU_FIELD_COL = { med: [70, 230, 110], armor: [90, 180, 255], ammo: [230, 200, 90], amp: [255, 214, 90] };
  function puColOf(type) {
    try { const D = game.MOBS && game.MOBS[type]; if (D && D.col) return D.col; } catch (e) {}
    if (PU_FIELD_COL[type]) return PU_FIELD_COL[type];
    return [140, 220, 255];
  }

  /* One instantiation gives the whole 6-part container; keep the bay and the one prize, drop the
   * rest. Instantiating a container per part would be five copies of every mesh for one drop —
   * the same reason weaponEntity() pulls a single part out of s9-guns.glb. */
  /* ⛔ MED, ARMOR AND AMMO WERE INVISIBLE — and they are the commonest drops on the field.
   *   `models/pickups.glb` carries `pu_base` plus one part per MOBS entry (the five mobility
   *   tokens) and nothing else, so `findByName('pu_med')` returned null, `puEntity` bailed, and
   *   syncPickups additionally skipped anything with `!pw.mob`. Driven proof: drop one of every
   *   type and read both sides — 8 in `G.pows`, 5 rendered. By drop weight (med 3 · armor 2 ·
   *   ammo 3 against 8.7 of mobility) that is ~48% OF EVERY DROP WITH NO VISUAL AT ALL. They were
   *   fully live in the simulation the whole time: walk over one and you were healed by nothing.
   * ⚑ Built from primitives rather than added to the GLB on purpose. The .glb is written by
   *   `scripts/blender/build-pickups.py` behind a silhouette-distinctness BUILD GATE; these three
   *   are read at a glance from colour and a simple form and do not need to enter that contest,
   *   and adding them there would mean a Blender round-trip to fix a renderer omission. */
  function puFieldPrize(type) {
    const g = new pc.Entity('pu_' + type);
    const add = (w, h, d, x, y, z) => { const e = new pc.Entity();
      e.addComponent('render', { type: 'box' }); e.setLocalScale(w, h, d); e.setLocalPosition(x, y, z);
      g.addChild(e); return e; };
    if (type === 'med') {                       // an upright cross — the one universally read shape
      add(0.46, 0.15, 0.15, 0, 0.30, 0); add(0.15, 0.46, 0.15, 0, 0.30, 0);
    } else if (type === 'armor') {              // a plate, leaning as if propped against the bay
      const p = add(0.40, 0.46, 0.10, 0, 0.30, 0); p.setLocalEulerAngles(0, 0, 9);
    } else if (type === 'amp') {                // a tall spike: the rare one, and it stands out
      add(0.13, 0.62, 0.13, 0, 0.36, 0); add(0.30, 0.10, 0.30, 0, 0.10, 0);
    } else {                                    // ammo — a squat crate, deliberately the dullest
      add(0.42, 0.28, 0.30, 0, 0.20, 0);
    }
    return g;
  }

  function puEntity(type) {
    if (!puAsset) return null;
    const whole = puAsset.resource.instantiateRenderEntity();
    const bay = whole.findByName('pu_base');
    const prize = whole.findByName('pu_' + type) || puFieldPrize(type);
    if (!prize) { try { whole.destroy(); } catch (e) {} return null; }
    const root = new pc.Entity('pu-' + type);
    const pivot = new pc.Entity('pu-' + type + '-pivot');   // everything that moves hangs here
    prize.reparent(pivot); pivot.addChild(prize); root.addChild(pivot);
    if (bay) { bay.reparent(root); root.addChild(bay); }
    try { whole.destroy(); } catch (e) {}
    if (!puMat[type]) puMat[type] = puMakeMat(puColOf(type), false);
    prize.findComponents('render').forEach(r => { r.castShadows = true; r.receiveShadows = true;
      r.meshInstances.forEach(mi => { mi.material = puMat[type]; mi.castShadow = true; }); });
    if (bay) bay.findComponents('render').forEach(r => { r.castShadows = false; r.receiveShadows = true;
      r.meshInstances.forEach(mi => { mi.material = puBayMat; mi.castShadow = false; }); });
    return { root, prize: pivot };
  }

  /* A seeded, fixed per-instance offset. Two boots in one arena must never be in phase — a
   * synchronised pair is a loop the eye learns in one glance, which is the failure §4 names. */
  const puSeed = o => { let h = 2166136261;
    const s = String((o && o.x) | 0) + ',' + String((o && o.z) | 0) + ',' + String((o && o.type) || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return (h % 10000) / 10000; };

  function puNew(pw, x, y, z) {
    const built = puEntity(pw.type); if (!built) return null;
    built.root.setLocalPosition(x, y, z);
    world.addChild(built.root);
    const sd = puSeed(pw);
    return { root: built.root, prize: built.prize, sd,
      /* rush */ w: 7.2 + sd * 2.4, spin: sd * 360, lean: 0,
      /* hover */ px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, tz: 0, rt: 0,
      /* flight */ air: sd * 6.283, yaw: sd * 360, yv: 0,
      /* spring */ c: 0, cv: 0, load: 0, next: 0.8 + sd * 1.4,
      /* slip */ ang: (sd - 0.5) * 22, av: 8.0 + sd * 4 };
  }

  /* ⧗ THE IDLE MOTION. Every branch below is a force, a fluid or a spring with a state variable —
   * never a function of absolute time — which is exactly why none of them can be a screensaver
   * loop and why every one of them can be genuinely at rest. */
  function puStep(type, st, dt, near) {
    const P = st.prize;
    if (type === 'rush') {
      // angular momentum, decaying. Someone flicked it; friction is taking it back.
      if (near) st.w = Math.max(st.w, 8.4);              // a body walks past: the arena re-flicks it
      st.w = Math.max(0, st.w - (0.55 + st.w * 0.16) * dt);
      st.spin = (st.spin + st.w * 190 * dt) % 360;
      // a slowing top LEANS, and it leans further the slower it gets. The barbs are genuinely
      // off-axis in the mesh, so the wobble it draws is the mesh's own crookedness, not a fake.
      const want = st.w > 0.25 ? Math.min(13, 1.6 + (8.4 - Math.min(8.4, st.w)) * 1.5) : 20;
      st.lean += (want - st.lean) * Math.min(1, dt * 2.2);
      const pr = st.spin * Math.PI / 180;
      P.setLocalEulerAngles(st.lean * Math.cos(pr), st.spin, st.lean * Math.sin(pr));
    } else if (type === 'hover') {
      // station-keeping: it drifts off its mark and corrects. Not a sine — a sine is a thing being
      // animated, a drift-and-correct is a thing holding position badly.
      /* ⚑ MOSTLY VERTICAL, because that is the axis a hovering thing actually fights. A machine
       * holding altitude on thrust is always slightly losing and regaining it; lateral drift is
       * the smaller part. ⛔ Still not a bob: the target is a random walk, not a phase, so it has
       * no period to learn and it can sit still. */
      st.rt -= dt;
      if (st.rt <= 0) { st.rt = 0.55 + st.sd * 0.7;
        st.tx = (Math.random() - 0.5) * 0.10; st.tz = (Math.random() - 0.5) * 0.10;
        st.ty = (Math.random() - 0.5) * 0.13; }
      const K = 22, C = 5.0;
      st.vx += ((st.tx - st.px) * K - st.vx * C) * dt; st.px += st.vx * dt;
      st.vy += ((st.ty - st.py) * K - st.vy * C) * dt; st.py += st.vy * dt;
      st.vz += ((st.tz - st.pz) * K - st.vz * C) * dt; st.pz += st.vz * dt;
      P.setLocalPosition(st.px, st.py, st.pz);
      P.setLocalEulerAngles(st.vz * 9.0, 0, -st.vx * 9.0);   // it banks into its own correction
    } else if (type === 'flight') {
      // weathervaning. A light lifting surface on a thin stem turns to face the room's draught.
      st.air += dt * 0.21;
      /* ⚠ ±68°, NOT ±210°. Drafted wide it swung through more than a full turn, which reads as a
       *   spinning top — the item next to it in the set — rather than as a vane finding the air.
       *   A draught in a room does not reverse through 210°. */
      const want = Math.sin(st.air) * 46 + Math.sin(st.air * 0.37 + st.sd * 6) * 22;
      const err = want - st.yaw;
      st.yv += (err * 1.5 - st.yv * 5.2) * dt;               // lagging, so it always trails the air
      st.yaw += st.yv * dt;
      P.setLocalEulerAngles(st.yv * 0.10, st.yaw, -st.yv * 0.17);
    } else if (type === 'spring') {
      // LOAD AND FIRE — the pull and the snap-back, which is the studio's whole subject.
      st.next -= dt;
      if (st.next <= 0 && st.load <= 0 && Math.abs(st.c) < 0.02) { st.load = 1; }
      if (st.load > 0) {                                    // the slow squat
        st.c = Math.min(0.30, st.c + dt * 0.42);
        if (st.c >= 0.30) { st.load = 0; st.cv = -3.1; }     // release
      } else {                                              // the ring-out, with overshoot
        st.cv += (-st.c * 190 - st.cv * 7.0) * dt;
        st.c += st.cv * dt;
        if (Math.abs(st.c) < 0.004 && Math.abs(st.cv) < 0.05) { st.c = 0; st.cv = 0;
          if (st.next <= 0) st.next = 2.0 + st.sd * 1.8 + Math.random() * 1.4; }
      }
      P.setLocalScale(1 + st.c * 0.16, 1 - st.c, 1 + st.c * 0.16);
      P.setLocalPosition(0, Math.max(0, -st.c) * 0.5, 0);    // the overshoot lifts it off the floor
    } else if (type === 'slip') {
      // ⚑ THE WRONG TIME-BASE. A pendulum with far more inertia than an object this size should
      // have: period ~4.2 s against the boot's ~0.45 s, i.e. about a quarter rate. It is not
      // depicting slow motion, it IS slow, in a frame where nothing else is.
      st.av += (-st.ang * 2.24 - st.av * 0.10) * dt;      // ω 1.50 rad/s ⇒ period 4.19 s
      st.ang += st.av * dt;
      /* ⚠ IT MUST NOT DAMP TO NOTHING AND STOP. Drafted with damping 0.30 and a 6°/s nudge it
       *   measured 0.24° of travel in 1.4 s — technically alive, visually dead, which is the
       *   worst of both: it pays for the motion and collects none of the read. A heavy glass
       *   barely loses energy, so the damping is a tenth and it is topped back up to ±11° at the
       *   bottom of the swing rather than being re-kicked at random. */
      if (Math.abs(st.ang) < 2.0 && Math.abs(st.av) > 0.2)
        st.av = Math.sign(st.av) * 16.5;
      P.setLocalEulerAngles(st.ang, 0, 0);
    }
  }

  /* ── THE SKY DROP AND ITS PORTAL ──────────────────────────────────────────────────────────
   * Artist directive: supply "shoots down from the sky in a sparkle portal so players can try and
   * find them." The FALL itself is the sim's (js/s9pc-game.js `stepPow`), because every operative
   * and bot has to agree on where the drop is and when it lands. What lives here is only what it
   * LOOKS like: the entity riding `pw.y` down, the portal it came through, and the slam.
   * ⚑ THE PORTAL IS A DOOR, NOT A SPARKLE FIELD. It irises open at the release height, stays for
   *   the length of the fall, and shuts behind. Scattering loose glitter would be DESIGN-SYSTEM
   *   §4's screensaver — motion with nothing behind it — where a ring that opens because
   *   something came through it is motion that has a cause.
   * ⚠ Fails open twice: no `portalMat` (a shader that would not compile) and no `pw.restY` (an
   *   older save, a hand-placed drop) both degrade to a drop that is simply on the floor. */
  let puPortalMat = null;
  function puPortal() {
    if (!puPortalMat) {
      puPortalMat = new pc.StandardMaterial();
      puPortalMat.diffuse = new pc.Color(0, 0, 0);
      puPortalMat.emissive = new pc.Color(1, 0.86, 0.42);
      puPortalMat.emissiveIntensity = 1.0;
      puPortalMat.blendType = pc.BLEND_ADDITIVE;
      puPortalMat.depthWrite = false;
      puPortalMat.cull = pc.CULLFACE_NONE;
      puPortalMat.update();
    }
    const e = new pc.Entity('pu-portal');
    e.addComponent('render', { type: 'cylinder', castShadows: false, receiveShadows: false });
    e.render.meshInstances.forEach(mi => { mi.material = puPortalMat; mi.castShadow = false; });
    return e;
  }

  function puFall(pw, st, dt) {
    if (pw.restY == null) return;                       // nothing to animate: it was never in the air
    const drop = st.groundY != null ? st.groundY : (pw.restY - 0.5);
    const air = Math.max(0, pw.y - pw.restY);           // metres still to fall
    st.root.setLocalPosition(pw.x, drop + air, pw.z);

    if (pw.portal > 0.001) {
      if (!st.portal) { st.portal = puPortal(); world.addChild(st.portal); }
      /* The mouth sits at the RELEASE height and never moves — a door does not follow what came
         through it. Its radius is the iris; it shrinks to nothing as `pw.portal` decays. */
      const r = 0.15 + pw.portal * 1.05;
      st.portal.setLocalPosition(pw.x, drop + (pw.dropH || 18), pw.z);
      st.portal.setLocalScale(r, 0.03, r);
      st.portal.setLocalEulerAngles(0, (st.sd * 360 + (pw.t || 0) * 40) % 360, 0);
    } else if (st.portal) { try { st.portal.destroy(); } catch (e) {} st.portal = null; }

    /* The landing. One squash on the prize, released by a spring — the drop hit the floor, so the
       floor pushed back. `slam` is set by the sim on the frame it lands, and consumed here. */
    if (pw.slam) { st.slam = 1; pw.slam = 0; }
    if (st.slam > 0) {
      st.slam = Math.max(0, st.slam - dt * 3.4);
      const k = st.slam * st.slam;
      st.prize.setLocalScale(1 + k * 0.34, 1 - k * 0.42, 1 + k * 0.34);
    } else if (st.prizeScaled) { st.prize.setLocalScale(1, 1, 1); st.prizeScaled = 0; }
    if (st.slam > 0) st.prizeScaled = 1;
  }

  function puClear() {
    puLive.forEach(st => { try { st.root.destroy(); } catch (e) {} try { if (st.portal) st.portal.destroy(); } catch (e) {} });
    puLive.clear();
  }

  function syncPickups(G, dt) {
    if (!puAsset) return;
    const seen = new Set();
    const list = G.pows || [];
    for (const pw of list) {
      if (pw.got) continue;              // ⚑ was `|| !pw.mob` — that hid med/armor/ammo entirely
      seen.add(pw);
      let st = puLive.get(pw);
      if (!st) {
        /* ⚠ THE FLOOR IS ASKED FOR, NOT ASSUMED. spawnPow puts `pw.y` half a metre above the
         *   spawn, and a baked level's floor is not y=0 (the rooftop deck is at 11.79), so
         *   `pw.y - 0.5` would be a magic number that is wrong on three arenas. supportY is the
         *   game's own collision answering the same question the operatives ask. */
        /* ⚠ ASK ABOUT THE RESTING PLACE, NOT THE CURRENT ONE. A drop now falls from 18 m, so
           `pw.y` at spawn is up in the sky and supportY from there answers about a rooftop, not
           the floor it is heading for. `restY` is the landing point the sim already computed. */
        const groundY = pw.restY != null ? pw.restY : pw.y;
        let fy = groundY - 0.5;
        try { fy = game.supportY({ x: pw.x, z: pw.z, y: groundY, r: 0.20 }); } catch (e) {}
        if (!isFinite(fy)) fy = groundY - 0.5;
        st = puNew(pw, pw.x, fy, pw.z);
        if (!st) continue;
        st.groundY = fy;
        puLive.set(pw, st);
      }
      const me = G.me;
      const near = !!(me && me.alive && Math.hypot(me.x - pw.x, me.z - pw.z) < 6.5);
      puFall(pw, st, dt);
      /* ⚑ THE IDLE MOTION IS SUSPENDED WHILE IT IS FALLING. Spinning a rush token through its
         descent would say "this is an object playing its animation near a drop", not "this is
         the object arriving". It picks its idle up on landing, which is also when the slam
         happens, so the two read as one event. */
      if (!pw.fall) puStep(pw.type, st, dt, near);
    }
    if (PU_DEMO) {
      /* ROADMAP §5.3 — built ≠ reachable. One of each, on the floor by the player's spawn, so the
       * set can be seen and shot without waiting for a weighted drop table to roll five times. */
      const me = G.me; if (me) {
        ['rush', 'hover', 'flight', 'spring', 'slip'].forEach((t, i) => {
          const key = 'demo:' + t; seen.add(key);
          let st = puLive.get(key);
          if (!st) {
            const x = me.x + (i - 2) * 0.9, z = me.z + 4.0;
            let fy = 0; try { fy = game.supportY({ x, z, y: me.y + 0.5, r: 0.20 }); } catch (e) {}
            st = puNew({ x, z, type: t }, x, fy, z);
            if (!st) return;
            puLive.set(key, st);
          }
          puStep(t, st, dt, false);
        });
      }
    }
    puLive.forEach((st, k) => { if (!seen.has(k)) { try { st.root.destroy(); } catch (e) {}
      try { if (st.portal) st.portal.destroy(); } catch (e) {}      // or the door outlives the drop
      puLive.delete(k); } });
  }
  window.__s9pu = { live: puLive, get asset() { return puAsset; }, clear: puClear, step: puStep };

  /* ⚑ THE MUZZLE FLASH IS A LIGHT. Our own renderer paints a bright blob on the 2D overlay and
   * adds a centre-weighted tint on heavy shots — a picture of a flash. Here it is an omni light
   * on the camera, so firing in a dark corridor actually throws the wall, the crate and the
   * operative you are shooting at into a frame of hard light. Clustered lighting is what makes
   * that affordable, and it is the single most legible thing the engine buys in combat. */
  const muzzleLight = new pc.Entity('muzzle');
  muzzleLight.addComponent('light', { type: 'omni', color: new pc.Color(1.0, 0.86, 0.62), intensity: 0,
    range: 12, castShadows: false, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED });
  muzzleLight.setLocalPosition(0.21, -0.17, -1.06);   // measured off the rendered barrel, not guessed
  cam.addChild(muzzleLight);
  muzzleLight.enabled = false;

  /* ⧗ THE BOOTS ARE A LIGHT TOO, and for the same reason: a jet is a fire, and a fire in a dark
   * arena throws a moving pool on whatever you are over. Without it the plume is a sticker of a
   * flame — the §1/§7 failure this studio has already been caught by once. ONE omni, only alive
   * while burning, so it costs nothing at rest. It hangs under the CAMERA rather than in the
   * mirrored world node because the camera is where the player's feet are, and the camera lives
   * outside `worldMirror` on purpose (see applyCamera). Bots get the plume but not their own
   * light: N moving shadowless omnis is exactly the per-fragment loop the tier work went to
   * bound, and their jet is legible from its exhaust and its noise. */
  const bootLight = new pc.Entity('boots');
  bootLight.addComponent('light', { type: 'omni', color: new pc.Color(0.55, 0.92, 1.0), intensity: 0,
    range: 7.5, castShadows: false, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED });
  /* ⚠ NOT a child of the camera, and that is the whole trap. `muzzleLight` hangs off `cam`
   * because a muzzle really is bolted to where you are looking — it must pitch with the gun.
   * Boots are bolted to your FEET, so a camera-local offset would swing the flame out in front
   * of you the moment you looked down. It goes on the root and is placed in engine coordinates
   * every frame, mirrored on x exactly as the camera is (see applyCamera). */
  app.root.addChild(bootLight);
  bootLight.enabled = false;

  // ── input ───────────────────────────────────────────────────────────────────────────────────
  const K = game.keys, M = game.mouse, T = game.touch;
  let locked = false, wasLocked = false;
  let isTouch = matchMedia('(hover:none)').matches || ('ontouchstart' in window);
  if (isTouch) { try { document.body.classList.add('touchmode'); } catch (e) {} }
  const touchUpgrade = () => { if (!isTouch) { isTouch = true; document.body.classList.add('touchmode'); } };
  /* ── LOOK SETTINGS ────────────────────────────────────────────────────────────────────────
   * Invert is a per-hand preference, not a bug with a correct answer. Both this build and the
   * classic one compute the identical forward vector — derived both ways, they agree exactly:
   * (cos p · sin yaw, sin p, cos p · cos yaw) — so neither is "the inverted one". Some people
   * fly, some people aim, and a shooter without the toggle is just picking a side.
   * Persisted, so you set it once. `?invy=1` / `?invx=1` / `?sens=140` override for testing. */
  /* ⚑ BOTH DEFAULT OFF, now that the mirror is actually fixed. invX was briefly defaulted ON as
   * a mitigation while the scene was still rendering mirrored — leaving it on after fixing the
   * cause would invert the mouse in the other direction, which is the classic way a workaround
   * outlives its bug and becomes one. */
  const LOOK = {
    invY: pref('s9_invy', Q.get('invy')),
    invX: pref('s9_invx', Q.get('invx')),
    sens: (() => { const q = parseFloat(Q.get('sens'));
      if (isFinite(q) && q > 0) return q / 100;
      try { const v = parseFloat(localStorage.getItem('s9_sens')); if (isFinite(v) && v > 0) return v / 100; } catch (e) {}
      return 1; })(),
  };
  function pref(key, q) {
    if (q != null) return q === '1' || q === 'true';
    try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
  }
  function saveLook() {
    try {
      localStorage.setItem('s9_invy', LOOK.invY ? '1' : '0');
      localStorage.setItem('s9_invx', LOOK.invX ? '1' : '0');
      localStorage.setItem('s9_sens', String(Math.round(LOOK.sens * 100)));
    } catch (e) {}
  }
  const SENS = 0.0022;
  // signed multipliers, so every look path (mouse AND touch) reads one definition
  const sx = () => SENS * LOOK.sens * (LOOK.invX ? -1 : 1);
  const sy = () => SENS * LOOK.sens * (LOOK.invY ? -1 : 1);
  function tryLock() { if (game.G.mode === 'play' && !isTouch) { try { canvas.requestPointerLock && canvas.requestPointerLock(); } catch (e) {} } }
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); K[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
    if (game.G.mode === 'play') {
      if (k >= '1' && k <= '4') game.switchWeapon(+k - 1);
      if (k === 'r') game.startReload(game.G.me);
      if (k === 'm') ui.toggleSfx();
      if (k === 'p') togglePause();
    }
  });
  addEventListener('keyup', e => { K[e.key.toLowerCase()] = false; });
  document.addEventListener('pointerlockchange', () => { locked = (document.pointerLockElement === canvas);
    if (locked) wasLocked = true; else if (wasLocked && game.G.mode === 'play') { wasLocked = false; togglePause(true); } });
  canvas.addEventListener('mousedown', e => {
    if (game.G.mode === 'pause') { resume(); return; }
    if (game.G.mode !== 'play') return;
    if (!locked) { tryLock(); return; }
    if (e.button === 0) M.left = true;
    else if (e.button === 2) M.right = true;
    else if (e.button === 1) { e.preventDefault(); game.startReload(game.G.me); }
  });
  addEventListener('mouseup', e => { if (e.button === 0) M.left = false; if (e.button === 2) M.right = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => { if (!locked || !game.G.me || game.G.mode !== 'play') return;
    const z = game.G.scopeZoom || 1;
    game.G.me.yaw += e.movementX * (sx() / z);
    game.G.me.pitch = clamp(game.G.me.pitch - e.movementY * (sy() / z), -1.45, 1.45); });
  canvas.addEventListener('wheel', e => { if (game.G.mode !== 'play') return; e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    game.switchWeapon((game.G.me.weapon + dir + S9Game.WEAPONS.length) % S9Game.WEAPONS.length); }, { passive: false });

  // touch: floating move stick (left half) · look-drag (right half, 2 fingers = ADS) · pads
  const touchMove = { active: false, id: -1, cx: 0, cy: 0 }, touchLook = { active: false, id: -1, lx: 0, ly: 0 };
  const rightTouch = new Set();
  const tsBase = $('tsBase'), tsNub = $('tsNub');
  const T_RAD = 56, T_DEAD = 10, LOOK_X = 0.0065, LOOK_Y = 0.0055;     // shared Ripmaster touch language
  function stickShow(x, y) { tsBase.style.display = 'block'; tsNub.style.display = 'block';
    tsBase.style.transform = 'translate(' + x + 'px,' + y + 'px)'; tsNub.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }
  function stickHide() { tsBase.style.display = 'none'; tsNub.style.display = 'none';
    touchMove.active = false; touchMove.id = -1; T.move.active = false; T.move.x = 0; T.move.y = 0; T.sprint = false; }
  function stickMove(px, py) { let dx = px - touchMove.cx, dy = py - touchMove.cy; const d = Math.hypot(dx, dy);
    if (d > T_RAD) { const k = T_RAD / d; dx *= k; dy *= k; }
    tsNub.style.transform = 'translate(' + (touchMove.cx + dx) + 'px,' + (touchMove.cy + dy) + 'px)';
    if (d < T_DEAD) { T.move.x = 0; T.move.y = 0; T.sprint = false; return; }
    T.move.x = dx / T_RAD; T.move.y = dy / T_RAD;                       // y<0 = forward
    T.sprint = d >= T_RAD * 0.85 && T.move.y < -0.35; }
  canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return;
    touchUpgrade(); e.preventDefault();
    if (game.G.mode === 'pause') { resume(); return; }
    if (game.G.mode !== 'play') return;
    const r = canvas.getBoundingClientRect();
    if (e.clientX < r.left + r.width / 2) {
      if (!touchMove.active) { touchMove.active = true; T.move.active = true; touchMove.id = e.pointerId;
        touchMove.cx = e.clientX; touchMove.cy = e.clientY; T.move.x = 0; T.move.y = 0;
        stickShow(e.clientX, e.clientY); try { canvas.setPointerCapture(e.pointerId); } catch (er) {} }
    } else {
      rightTouch.add(e.pointerId); if (rightTouch.size >= 2) T.scope = true;
      if (!touchLook.active) { touchLook.active = true; touchLook.id = e.pointerId; touchLook.lx = e.clientX; touchLook.ly = e.clientY; }
      try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
    }
  });
  canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') return;
    if (touchMove.active && e.pointerId === touchMove.id) { e.preventDefault(); stickMove(e.clientX, e.clientY); }
    else if (touchLook.active && e.pointerId === touchLook.id && game.G.mode === 'play' && game.G.me) { e.preventDefault();
      const dx = e.clientX - touchLook.lx, dy = e.clientY - touchLook.ly; touchLook.lx = e.clientX; touchLook.ly = e.clientY;
      const z = game.G.scopeZoom || 1;
      const ix = LOOK.invX ? -1 : 1, iy = LOOK.invY ? -1 : 1;
      game.G.me.yaw += dx * LOOK_X * LOOK.sens * ix / z;
      game.G.me.pitch = clamp(game.G.me.pitch - dy * LOOK_Y * LOOK.sens * iy / z, -1.45, 1.45); }
  });
  function touchEnd(e) { if (e.pointerType !== 'touch') return;
    if (e.pointerId === touchMove.id) stickHide();
    if (rightTouch.delete(e.pointerId) && rightTouch.size < 2) T.scope = false;
    if (e.pointerId === touchLook.id) { touchLook.active = false; touchLook.id = -1; } }
  canvas.addEventListener('pointerup', touchEnd); canvas.addEventListener('pointercancel', touchEnd);
  function bindPad(el, dn, up) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); if (e.pointerType === 'touch') touchUpgrade();
      el.classList.add('dn'); try { el.setPointerCapture(e.pointerId); } catch (er) {} dn(); });
    const u = () => { el.classList.remove('dn'); if (up) up(); };
    el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u); el.addEventListener('pointerleave', u);
  }
  let _fireTapT = 0;
  bindPad($('padFire'), () => { T.fire = true; const n = performance.now();
    if (n - _fireTapT < 300 && game.G.mode === 'play') game.startReload(game.G.me); _fireTapT = n; }, () => { T.fire = false; });
  /* ⧗ TAP TO JUMP, HOLD TO BURN — the same two verbs the space bar has. `jump` is the one-shot
   * the launch consumes; `jumpHold` is the pad still down, which is the only thing a touch device
   * can offer in place of a held key. The release handler is now load-bearing: without it the
   * boots would fire until the tank ran dry every time someone tapped. */
  bindPad($('padJump'), () => { T.jump = true; T.jumpHold = true; }, () => { T.jumpHold = false; });
  bindPad($('padCrouch'), () => { T.crouch = true; }, () => { T.crouch = false; });

  function togglePause(force) {
    if (game.G.mode === 'play') { game.G.mode = 'pause'; ui.music.pause();
      $('pauseSub').textContent = isTouch ? 'Deployment on hold. Tap resume to drop back in.' : 'Pointer released. Click to lock the mouse and drop back in.';
      $('ovPause').classList.add('show'); $('tgPause').textContent = '▶ resume'; }
    else if (game.G.mode === 'pause' && !force) resume();
  }
  function resume() { if (game.G.mode !== 'pause') return; game.G.mode = 'play';
    $('ovPause').classList.remove('show'); $('tgPause').textContent = '⏸ pause'; tryLock(); }
  $('tgPause').onclick = () => togglePause();
  $('btnResume').onclick = resume;

  /* Bind the look settings. They live on the pause panel because "the mouse is inverted" is
   * something you find out mid-fight, not in the briefing — so the fix has to be reachable from
   * where you noticed it, without abandoning the match. */
  (function bindLook() {
    const iy = $('optInvY'), ix = $('optInvX'), sn = $('optSens'), sv = $('optSensV');
    if (!iy || !ix || !sn) return;
    iy.checked = LOOK.invY; ix.checked = LOOK.invX;
    sn.value = Math.round(LOOK.sens * 100); if (sv) sv.textContent = sn.value;
    iy.onchange = () => { LOOK.invY = iy.checked; saveLook(); };
    ix.onchange = () => { LOOK.invX = ix.checked; saveLook(); };
    sn.oninput = () => { LOOK.sens = Math.max(0.05, (+sn.value || 100) / 100);
      if (sv) sv.textContent = sn.value; saveLook(); };
  })();

  // ── match start ─────────────────────────────────────────────────────────────────────────────
  /* ── PREWARM: THIS IS THE STUTTER ─────────────────────────────────────────────────────────
   * `ensureBody` was reached from `syncBodies`, which runs EVERY FRAME, and the first time each
   * bot came into view it fetched a ~0.8 MB `.skn`, parsed it, built vertex buffers, uploaded
   * them and compiled a skinned shader variant — all inside one frame, mid-fight. Four bots is
   * four stalls, arriving exactly when the game starts getting interesting, and it reads as
   * stuttering rather than as loading because nothing on screen says anything is loading.
   *
   * The work has to happen; it just must not happen DURING PLAY. So every body is built while
   * the briefing is still up, and one frame of representative combat FX is pushed through the
   * renderer at the same time — a tracer, a flash, a spark and a decal — because those materials
   * compile their own variants on first draw and would otherwise hitch on the first shot fired.
   *
   * ⚠ Bounded, and it fails open. A missing `.skn`, a 404 or a slow disk must never hold the
   *   match hostage: after PREWARM_MS the game starts regardless and anything still in flight
   *   lands late, exactly as it did before. A prewarm that can hang is worse than the stutter. */
  const PREWARM_MS = 4000;
  function prewarm(G) {
    G.ents.forEach(e => { if (!e.isMe) ensureBody(e); });
    const started = performance.now();
    return new Promise(res => {
      (function wait() {
        const done = bodyPending.size === 0;
        if (done || performance.now() - started > PREWARM_MS) return res(done);
        setTimeout(wait, 60);
      })();
    });
  }
  /* One frame of FX, drawn and immediately cleared. The point is the SHADER COMPILE, not the
   * picture — the additive and alpha FX materials build their variants the first time they are
   * actually drawn, and that first draw should be here rather than on your first trigger pull. */
  function prewarmFx(G) {
    const me = G.me; if (!me || !fx) return;
    const d = game.lookDir(me.yaw, me.pitch);
    const ox = me.x + d.x * 0.5, oy = me.y + me.eye, oz = me.z + d.z * 0.5;
    G.tracers.push({ x0: ox, y0: oy, z0: oz, dx: d.x, dy: d.y, dz: d.z, len: 8, p: 4, sp: 340, tail: 3.4, me: true, t: 0.1 });
    G.flashes.push({ x: ox, y: oy, z: oz, t: 0.05, max: 0.06, big: false });
    G.sparks.push({ x: ox + d.x * 6, y: oy, z: oz + d.z * 6, vx: 0, vy: 0, vz: 0, t: 0.2, col: [230, 210, 160] });
    G.decals.push({ x: ox + d.x * 6, y: oy, z: oz + d.z * 6, n: [0, 1, 0], type: 'bullet', r: 0.1, life: 0.2, max: 10 });
    try { fx.update(G, cam, performance.now()); app.render(); } catch (e) {}
    G.tracers.length = 0; G.flashes.length = 0; G.sparks.length = 0; G.decals.length = 0;
  }

  ui.onStart = (real, arenaPick, roster, deck) => {
    const MAP = game.startMatch(real, arenaPick, roster, deck);
    bodies.forEach(h => { try { h.entity.destroy(); } catch (e) {} }); bodies.clear(); bodyPending = new Set();
    buildLevel(MAP);
    puClear();                       // drops do not survive a match; their entities must not either
    ui.powMsg('◈ ' + MAP.name, '#59e0ff');
    /* Hold the sim on the start line while the bodies build. Without this the clock is already
     * running and bots are already shooting while the frame budget is being spent on uploads —
     * which is the worst of both: you lose time AND it stutters. */
    /* ⚠ tryLock() STAYS IN THE CLICK'S OWN TASK. Pointer lock is gesture-gated: request it after
     * an await and the browser has already forgotten the click that justified it, and you get a
     * match you cannot aim in. Ask for the lock now; do the loading behind it. */
    applyCamera();
    tryLock();
    const wasMode = game.G.mode; game.G.mode = 'lobby';
    say('deploying…');
    prewarm(game.G).then(ok => {
      game.G.mode = wasMode;
      syncBodies(game.G);
      applyCamera();
      prewarmFx(game.G);
      say('');
      try { marks.prewarm = { complete: ok, bodies: bodies.size }; } catch (e) {}
    });
  };
  ui.onAbort = () => { clearLevel(); bodies.forEach(h => { try { h.entity.destroy(); } catch (e) {} }); bodies.clear(); };

  // ── camera + overlay ────────────────────────────────────────────────────────────────────────
  const _qy = new pc.Quat(), _qx = new pc.Quat(), _qr = new pc.Quat();
  function applyCamera() {
    const G = game.G, c = game.cam;
    /* Section 9's yaw convention is forward = (sin yaw, 0, cos yaw); a PlayCanvas camera looks
     * down its own −z. Hence the +180°: without it the whole world sits behind you, which is
     * exactly the class of bug the dogfight renderer shipped once (see CLAUDE.md).
     *
     * ✅ FIXED — THE SCENE WAS MIRRORED, AND IT WAS ONE CAUSE BEHIND THREE BUG REPORTS
     * ("mouse inverted", "strafe backwards", "aim off"). The +180° makes FORWARD correct and
     * cannot make RIGHT correct, because it is a rotation and a rotation preserves handedness.
     * Checked numerically at two headings:
     *     yaw 0°  : forward game (0,0,1)  camera (0,0,1)   MATCH
     *               right   game (1,0,0)  camera (-1,0,0)  MIRRORED
     *     yaw 90° : forward game (1,0,0)  camera (1,0,0)   MATCH
     *               right   game (0,0,-1) camera (0,0,1)   MIRRORED
     * The game's basis (x right, y up, z forward) is LEFT-handed; a PlayCanvas camera's
     * (x right, y up, −z forward) is RIGHT-handed. The classic renderer gets away with it
     * because `viewMat` in js/section9-gl.js is hand-written and is not a pure rotation, so it
     * encodes the flip. A quaternion cannot.
     *
     * THE REAL FIX, derived and verified on paper, is to mirror on x at the conversion boundary:
     *     every position handed to the engine:  pcX = −gameX   (and reverse triangle winding,
     *                                            or set cull to FRONT, or the world renders
     *                                            inside out)
     *     camera yaw:                           θ = π − gameYaw
     * With those two together both vectors match: forward → (−sin y, sin p, cos y) and
     * right → (−cos y, 0, −sin y), which is exactly the mirror of the game's own pair.
     * ⚑ AND THAT IS WHAT SHIPPED. Everything in game coordinates hangs under ONE `worldMirror`
     * node at scale (−1, 1, 1) (see its construction above); the camera stays OUTSIDE it at
     * (−x, y, z) with yaw π − gameYaw, which is the `-(c.x + jx)` below. One node instead of
     * negating x at forty call sites — which is what makes it verifiable, because the scene is
     * either mirrored or it is not and nothing can be half-converted.
     * ⚠ A workaround must die with its bug: `LOOK.invX` was defaulted ON while the mirror was
     * live, and leaving it on afterwards would have inverted the mouse the other way. */
    _qy.setFromAxisAngle(pc.Vec3.UP, 180 - c.yaw * 180 / Math.PI);
    _qx.setFromAxisAngle(pc.Vec3.RIGHT, c.pitch * 180 / Math.PI);
    _qr.copy(_qy).mul(_qx);
    cam.setRotation(_qr);
    // screen shake jitters the CAMERA only; the viewmodel is parented to it so it rides along,
    // and the reticle lives on the overlay, which never moves — same split as the shipping game
    let jx = 0, jy = 0, jz = 0;
    const sh = Math.min(G.shake, 14) * 0.008;
    if (sh > 0.0001) { jx = (Math.random() * 2 - 1) * sh; jy = (Math.random() * 2 - 1) * sh * 0.8; jz = (Math.random() * 2 - 1) * sh * 0.4; }
    cam.setPosition(-(c.x + jx), c.y + jy, c.z + jz);      // the camera lives outside the mirror
    /* ⧗ The jet, placed at the player's own soles in engine coordinates — mirrored on x like the
     * camera, and 0.12 BELOW the feet so the pool is thrown by a source under you rather than one
     * inside your shins. Flickers, because a jet flickers; two incommensurate sines rather than
     * one, so the eye cannot learn the loop — which is the §4 rule ("a loop the eye can learn is
     * a screensaver") applied to a light instead of to a movement. */
    {
      const meB = G.me, burn = !!(meB && meB.burning && meB.alive);
      bootLight.enabled = burn;
      if (burn) {
        bootLight.setPosition(-meB.x, meB.y - 0.12, meB.z);
        /* `burnT` is why the sim tracks it: a jet takes a moment to come up to pressure, so the
         * light ramps in over 0.12 s. A light that snaps to full is a switch, not a flame. */
        const up = Math.min(1, (meB.burnT || 0) / 0.12);
        bootLight.light.intensity = up * (5.0 + 1.6 * Math.sin(G.t * 47) * Math.sin(G.t * 31));
      }
    }
    {
      const me0 = G.me;
      const now = performance.now();
      const dt = vmLast ? Math.min(0.1, (now - vmLast) / 1000) : 0.016; vmLast = now;
      const want = me0 && me0.ads && me0.alive ? 1 : 0;
      adsT += (want - adsT) * Math.min(1, dt * VM.ease);
      const optic = me0 && me0.scoped && S9Game.WEAPONS[me0.weapon].zoom > 1;
      const iron = optic ? 1 : 1 + (VM.fovMul - 1) * adsT;
      cam.camera.fov = (FOV / ((G.scopeZoom || 1) * iron)) * 180 / Math.PI;
    }
    if (viewmodel) {
      const me = G.me;
      // hide the model behind a true optical scope, and pull it toward the sightline when aiming
      const scoped = me && me.scoped && S9Game.WEAPONS[me.weapon].zoom > 1;
      if (me && weaponAsset) { const k = gunKeyOf(me); if (k !== VM_KEY) makeViewmodel(k); }
      viewmodel.enabled = !!(me && me.alive && !scoped);
      const mk = me ? Math.max(0, Math.min(1, me.muzzle / 0.05)) : 0;
      muzzleLight.enabled = mk > 0.02;
      if (muzzleLight.enabled) {
        const w = S9Game.WEAPONS[me.weapon], heavy = (w.key === 'shotgun' || w.key === 'sniper');
        muzzleLight.light.intensity = mk * (heavy ? 11 : 5.5);
        muzzleLight.light.color = w.key === 'sniper' ? new pc.Color(0.84, 0.92, 1.0) : new pc.Color(1.0, 0.86, 0.62);
        if (fx) { const wp = muzzleLight.getPosition(); fx.setViewFlash(wp.x, wp.y, wp.z, mk, heavy); }
      } else if (fx) fx.setViewFlash(0, 0, 0, 0, false);
      if (me && viewmodel.enabled) {
        const bob = me.moving && me.onGround ? Math.sin(me.bob) : 0;
        const t = adsT, s = 1 - t;                    // bob and sway fade out as the sights come up
        const kick = me.recoil * 0.06;
        const P = VM.hip;
        /* Interpolate toward the MEASURED sight pose when we have one, so at t = 1 the rear notch
         * and front post are both on the camera's −z axis and the player is looking THROUGH the
         * irons rather than past them. Rotation has to come along: the sight line is not parallel
         * to the model's own axis, so position alone leaves the gun canted. */
        const A = SIGHTS ? SIGHTS.pos : { x: VM.ads[0], y: VM.ads[1], z: VM.ads[2] };
        _vmP.set(
          P[0] + (A.x - P[0]) * t + bob * 0.006 * s,
          P[1] + (A.y - P[1]) * t + Math.abs(bob) * 0.004 * s - kick * 0.35,
          P[2] + (A.z - P[2]) * t + kick);
        viewmodel.setLocalPosition(_vmP);
        _vmI.setFromEulerAngles(-me.recoil * 5.0, 0, 0);   // recoil, applied on top of either pose
        if (SIGHTS) { _vmQ.slerp(_vmID, SIGHTS.rot, t).mul(_vmI); viewmodel.setLocalRotation(_vmQ); }
        else viewmodel.setLocalRotation(_vmI);
      }
    }
  }

  const _sp = new pc.Vec3(), _wp = new pc.Vec3();
  function drawOverlay() {
    const G = game.G, me = G.me; if (!me) return;
    const W = OW, H = OH, HW = W / 2, HH = H / 2;
    ovCtx.clearRect(0, 0, W, H);
    // nameplates + health bars, occluded by the same line-of-sight test the sim uses
    ovCtx.textAlign = 'center';
    for (const e of G.ents) {
      if (!e.alive || e.isMe) continue;
      const dd = Math.hypot(e.x - game.cam.x, e.z - game.cam.z); if (dd > 44) continue;
      if (!game.losClear(game.cam.x, game.cam.y, game.cam.z, e.x, e.y + e.h * 0.6, e.z)) continue;
      _wp.set(e.x, e.y + e.h + 0.22, e.z);
      cam.camera.worldToScreen(_wp, _sp);
      if (_sp.z <= 0) continue;
      const sc = clamp(26 / Math.max(1, dd), 0.35, 1.4);
      ovCtx.font = '900 ' + clamp(13 * sc, 8, 13).toFixed(1) + 'px Arial';
      ovCtx.fillStyle = '#e7f4fa'; ovCtx.shadowColor = '#000'; ovCtx.shadowBlur = 4;
      ovCtx.fillText((e.verified ? '⚜ ' : '') + S9Game.shortName(e.name), _sp.x, _sp.y - 6);
      ovCtx.shadowBlur = 0;
      const bw = clamp(60 * sc, 22, 64), hpf = clamp(e.hp / e.maxHp, 0, 1);
      ovCtx.fillStyle = 'rgba(0,0,0,.55)'; ovCtx.fillRect(_sp.x - bw / 2, _sp.y, bw, 4);
      ovCtx.fillStyle = hpf > 0.5 ? '#2bff80' : hpf > 0.25 ? '#ffd23b' : '#ff5a3c';
      ovCtx.fillRect(_sp.x - bw / 2, _sp.y, bw * hpf, 4);
    }
    // reticle / scope
    const w = S9Game.WEAPONS[me.weapon];
    if (me.scoped && w.zoom > 1) {
      const Rr = Math.min(W, H) * 0.42;
      ovCtx.fillStyle = 'rgba(3,6,9,0.96)';
      ovCtx.beginPath(); ovCtx.rect(0, 0, W, H); ovCtx.arc(HW, HH, Rr, 0, Math.PI * 2, true); ovCtx.fill('evenodd');
      ovCtx.strokeStyle = 'rgba(10,14,18,1)'; ovCtx.lineWidth = 6; ovCtx.beginPath(); ovCtx.arc(HW, HH, Rr, 0, Math.PI * 2); ovCtx.stroke();
      ovCtx.strokeStyle = 'rgba(120,255,200,0.85)'; ovCtx.lineWidth = 1.4;
      ovCtx.beginPath(); ovCtx.moveTo(HW - Rr, HH); ovCtx.lineTo(HW + Rr, HH); ovCtx.moveTo(HW, HH - Rr); ovCtx.lineTo(HW, HH + Rr); ovCtx.stroke();
      ovCtx.strokeStyle = 'rgba(255,80,80,0.9)'; ovCtx.lineWidth = 2;
      ovCtx.beginPath(); ovCtx.moveTo(HW - 14, HH); ovCtx.lineTo(HW - 4, HH); ovCtx.moveTo(HW + 4, HH); ovCtx.lineTo(HW + 14, HH);
      ovCtx.moveTo(HW, HH - 14); ovCtx.lineTo(HW, HH - 4); ovCtx.moveTo(HW, HH + 4); ovCtx.lineTo(HW, HH + 14); ovCtx.stroke();
      ovCtx.fillStyle = 'rgba(255,80,80,0.9)'; ovCtx.fillRect(HW - 1.5, HH - 1.5, 3, 3);
    } else {
      const spread = 8 + (me.alive ? (w.spread * 260) + me.recoil * 18 + (me.sprinting ? 10 : 0) : 0);
      ovCtx.strokeStyle = 'rgba(120,255,200,0.9)'; ovCtx.lineWidth = 2; ovCtx.shadowColor = '#2bff80'; ovCtx.shadowBlur = 4;
      const g = 6; ovCtx.beginPath();
      ovCtx.moveTo(HW - spread - g, HH); ovCtx.lineTo(HW - g, HH); ovCtx.moveTo(HW + g, HH); ovCtx.lineTo(HW + spread + g, HH);
      ovCtx.moveTo(HW, HH - spread - g); ovCtx.lineTo(HW, HH - g); ovCtx.moveTo(HW, HH + g); ovCtx.lineTo(HW, HH + spread + g);
      ovCtx.stroke(); ovCtx.shadowBlur = 0;
      ovCtx.fillStyle = 'rgba(120,255,200,0.9)'; ovCtx.fillRect(HW - 1, HH - 1, 2, 2);
    }
    if (G.hitmark > 0) {
      ovCtx.strokeStyle = 'rgba(255,240,120,' + clamp(G.hitmark * 7, 0, 1).toFixed(2) + ')'; ovCtx.lineWidth = 2.5;
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sy]) => { ovCtx.beginPath(); ovCtx.moveTo(HW + sx * 6, HH + sy * 6); ovCtx.lineTo(HW + sx * 13, HH + sy * 13); ovCtx.stroke(); });
    }
    // OVERCHARGE surge — a warm pulse at the edges while the market-heat surge is live
    if (me.surgeT > 0) {
      const pul = 0.5 + 0.5 * Math.sin(G.t * 10);
      const rg = ovCtx.createRadialGradient(HW, HH, Math.min(W, H) * 0.28, HW, HH, Math.max(W, H) * 0.62);
      rg.addColorStop(0, 'rgba(255,200,80,0)'); rg.addColorStop(1, 'rgba(255,190,70,' + (0.07 + 0.06 * pul).toFixed(3) + ')');
      ovCtx.fillStyle = rg; ovCtx.fillRect(0, 0, W, H);
    }
  }

  // ── frame ───────────────────────────────────────────────────────────────────────────────────
  const times = []; let frames = 0, tPrev = 0, grainT = 0;
  const marks = { boot: +(performance.now() - T0).toFixed(1), firstFrame: 0 };
  app.on('update', dt => {
    if (!frames) marks.firstFrame = +(performance.now() - T0).toFixed(1);
    frames++;
    const nowT = performance.now();
    if (tPrev) { const ms = nowT - tPrev; times.push(ms); if (times.length > 240) times.shift();
      if (game.G.mode === 'play') adapt(ms, nowT); }
    tPrev = nowT;
    if (ditherOn) { grainT = (grainT + 0.017) % 1000; app.graphicsDevice.scope.resolve('s9GrainT').setValue(grainT); }
    const G = game.G;
    if (G.mode === 'play' && !HOLD) game.step(Math.min(0.05, dt));
    /* ⧗ MOTION SMEAR, once per frame and before anything draws. The order matters: measure what
     * the camera did over the step that just ran, then hand the shader the mix it should use for
     * the frame about to be composed. `motion × ceiling`, GfxPost's own scaling, capped at 0.85,
     * and held at exactly 0 until the accumulation target has been written once. */
    /* Allocated on the first PLAY frame, never in the lobby — a menu is not what this is for and
     * a full-res target should not exist until a match does. */
    if ((G.mode === 'play' || SMEAR.on) && ensureSmear()) {
      SMEAR.motion = SMEAR.force >= 0 ? SMEAR.force : smearMotion();
      SMEAR.amt = SMEAR.warm ? clamp(SMEAR.motion * SMEAR.ceiling, 0, SMEAR.cap) : 0;
      app.graphicsDevice.scope.resolve('s9Smear').setValue(SMEAR.amt);
    }
    if (G.mode === 'play' || G.mode === 'pause' || G.mode === 'result') {
      if (G.me) {
        syncBodies(G);
        applyCamera();
        // on a timer, not per frame — flipping light.enabled dirties the clustered light set
        if (nowT >= cullT) { cullT = nowT + 200; cullPracticals(false); }
        if (fx) fx.update(G, cam, nowT);
        syncPickups(G, Math.min(0.05, dt));
        drawOverlay();
        if (frames % 4 === 0) ui.hud();
      }
    }
    if (frames % 20 === 0) engReadout();
  });

  function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }
  function engReadout() {
    const el = $('eng'); if (!el || !document.body.classList.contains('showeng')) return;
    const s = levelStats;
    /* ⚑ p95 AND WORST, not just the median. Stutter is the TAIL — a game can hold a 12 ms median
     * and still feel broken if one frame in twenty takes 90 ms, and a median-only readout says
     * everything is fine while you are watching it hitch. This is the number to report. */
    const sorted = times.slice().sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    const worst = sorted.length ? sorted[sorted.length - 1] : 0;
    const med = median(times);
    const fps = med > 0 ? (1000 / med) : 0;
    el.innerHTML = 'PlayCanvas ' + pc.version + ' · tier ' + TIER + ' · dpr ' + app.graphicsDevice.maxPixelRatio.toFixed(2) +
      (ADAPT.on ? ' · adapt step ' + ADAPT.step + ' ×' + ADAPT.scale.toFixed(2) + (ADAPT.changes ? ' (' + ADAPT.changes + ')' : '') : ' · adapt off') + '<br>' +
      /* ⚑ "omni" is now BUILT vs LIT. The whole frame-rate fix is that those two numbers differ,
       * so a readout that showed only one of them would hide the thing worth watching. */
      (s ? (s.tris.toLocaleString() + ' tris · ' + s.parts + ' PBR mats · ' + cullN + '/' + (s.omni || 0) + ' omni lit · ' +
        (s.spot || 0) + ' spot (' + Math.min(levelFixtures.length, QCFG.spotShadow | 0) + ' cast) · ' +
        (QCFG.ssao ? 'ssao' : 'no ssao') + ' · sm ' + sun.light.shadowResolution + '×' + sun.light.numCascades + '<br>') : '') +
      bodies.size + ' bodies · ' + (weaponAsset ? 'GLB weapon' : 'no weapon') + ' · ' + (frame ? 'post' : 'no post') + (ditherOn ? '+dither' : '') +
      (SMEAR.on ? '+smear ' + SMEAR.amt.toFixed(2) : '') + (envOk ? ' · IBL' : '') + '<br>' +
      '<b>' + med.toFixed(1) + ' ms</b> median (' + fps.toFixed(0) + ' fps) · p95 ' + p95.toFixed(1) + ' · worst ' + worst.toFixed(1) + ' ms';
  }
  if (Q.has('eng')) document.body.classList.add('showeng');
  /* F8 toggles it live. `?eng` means deciding to look BEFORE the match; stutter is something you
   * notice mid-fight, and having to reload to see the numbers loses the moment you wanted. */
  addEventListener('keydown', e => {
    if (e.key === 'F8') { e.preventDefault(); document.body.classList.toggle('showeng'); }
  });

  say('');
  app.start();

  /* Stage one representative frame of combat FX and hold it. A tracer crosses a 40 m arena in
   * ~120 ms; under software GL a headless run renders about one frame in that time, so photo-
   * graphing live gunfire is a coin flip. This stuffs the same state the simulation would have
   * produced, mid-flight, and nothing else about the render path changes. Re-stuffed every frame
   * while `fxDemo` is set, so a slow frame cannot decay the capture out from under itself. */
  function stuffFx() {
    const G = game.G, me = G.me; if (!me) return false;
    const d = game.lookDir(me.yaw, me.pitch);
    const ox = me.x + d.x * 0.4, oy = me.y + me.eye - 0.08 + d.y * 0.4, oz = me.z + d.z * 0.4;
    G.tracers.length = 0; G.flashes.length = 0; G.sparks.length = 0; G.decals.length = 0;
    for (let i = 0; i < 6; i++) {
      const a = me.yaw + (i - 2.5) * 0.055, p = me.pitch + (i % 2 ? 0.02 : -0.015);
      const dd = game.lookDir(a, p);
      const hit = game.raycast(ox, oy, oz, dd.x, dd.y, dd.z, 56, me);
      const len = Math.max(2, Math.hypot(hit.x - ox, hit.y - oy, hit.z - oz));
      G.tracers.push({ x0: ox, y0: oy, z0: oz, dx: dd.x, dy: dd.y, dz: dd.z, len,
        p: len * (0.25 + 0.12 * i), sp: 340, tail: 3.4, me: i < 3, t: 0.1 });
      G.sparks.push({ x: hit.x, y: hit.y, z: hit.z, vx: 0, vy: 0, vz: 0, t: 0.3, col: [230, 210, 160] });
      G.decals.push({ x: hit.x, y: hit.y, z: hit.z, n: [0, 1, 0], type: 'bullet', r: 0.1, life: 8, max: 10 });
    }
    // INCOMING. Your own rounds run down the view axis and project to a dot — correct, and
    // useless as evidence. Rounds coming the other way are what a tracer is for.
    G.ents.forEach((e, i) => { if (e.isMe || !e.alive) return;
      const sx = e.x, sy = e.y + e.eye, sz = e.z;
      const tx = me.x + (i % 2 ? 1.4 : -1.1), ty = me.y + me.eye + 0.3, tz = me.z + (i % 3 ? 0.9 : -1.3);
      let dx = tx - sx, dy = ty - sy, dz = tz - sz; const L = Math.hypot(dx, dy, dz) || 1;
      dx /= L; dy /= L; dz /= L;
      G.tracers.push({ x0: sx, y0: sy, z0: sz, dx, dy, dz, len: L + 12, p: L * (0.55 + 0.12 * i), sp: 340, tail: 3.4, me: false, t: 0.1 });
      G.flashes.push({ x: sx + dx * 0.4, y: sy + dy * 0.4, z: sz + dz * 0.4, t: 0.06, max: 0.06, big: false });
    });
    G.flashes.push({ x: ox, y: oy, z: oz, t: 0.06, max: 0.06, big: false });
    me.muzzle = 1e6; me.recoil = 0.5;
    return true;
  }

  // ── dev / headless peephole ─────────────────────────────────────────────────────────────────
  window.__s9pc = {
    app, game, ui, cam, sun,
    /* ⚑ ISOLATE BEFORE TUNING. The post stack, the key light and the level's own lights are
     * exposed by NAME so a headless run can switch ONE of them off at a time on a single loaded
     * scene, instead of reloading with a different tier and comparing two different frames.
     * Same reason `Card3D.build` returns its parts and stashes the controller on `window`. */
    get frame() { return frame; },
    get lights() { return levelLights; },
    get glows() { return levelGlows; },
    get fixtures() { return levelFixtures; },
    get q() { return QCFG; },
    adapt: ADAPT,
    _step(n) { ADAPT.step = Math.max(0, Math.min(ADAPT.maxStep, n | 0)); applyStep(ADAPT.step); return ADAPT.step; },
    _cull(live) { if (live != null) QCFG.omniLive = live | 0; cullPracticals(true); return cullN; },
    get s() { const G = game.G; return {
      engine: pc.version, tier: TIER, autoTier: AUTO_TIER, dpr: app.graphicsDevice.maxPixelRatio,
      omniLive: QCFG.omniLive, omniLit: cullN, ssao: QCFG.ssao, sm: sun.light.shadowResolution + 'x' + sun.light.numCascades,
      rtScale: frame ? frame.rendering.renderTargetScale : null, adaptStep: ADAPT.step,
      mode: G.mode, map: game.MAP && game.MAP.name, mapIdx: G.mapIdx, frames,
      me: G.me ? { hp: +G.me.hp.toFixed(1), armor: +G.me.armor.toFixed(1), mag: G.me.mag, weapon: G.me.weapon, kills: G.me.kills,
        alive: G.me.alive, x: +G.me.x.toFixed(2), y: +G.me.y.toFixed(2), z: +G.me.z.toFixed(2),
        yaw: +G.me.yaw.toFixed(3), pitch: +G.me.pitch.toFixed(3) } : null,
      ents: G.ents.length, bodies: bodies.size, weapon: !!weaponAsset, post: !!frame, dither: ditherOn, env: envOk, envName,
      smear: { on: SMEAR.on, warm: SMEAR.warm, ceiling: SMEAR.ceiling, motion: +SMEAR.motion.toFixed(3), amt: +SMEAR.amt.toFixed(3) },
      boots: G.me ? { burning: !!G.me.burning, boost: +G.me.boost.toFixed(3), vy: +G.me.vy.toFixed(2), onGround: !!G.me.onGround } : null,
      level: levelStats, fx: fx ? fx.counts : null,
      medianMs: +median(times).toFixed(2), p95Ms: +(times.slice().sort((a, b) => a - b)[Math.floor(times.length * 0.95)] || 0).toFixed(2),
      marks,
    }; },
    _start(real) { ui.begin(!!real); },
    _pick(i) { try { localStorage.setItem('s9pc_map', i); } catch (e) {} },
    _maps() { return game.MAPS.map((m, i) => ({ i, name: m.name, wld: m.wld || null, solids: m.solids.length, spawns: m.spawns.length })); },
    _place(x, z, y) { const me = game.G.me; if (!me) return false; me.x = x; me.z = z; me.y = (y != null ? y : game.supportY(me)); me.vy = 0;
      game.cam.x = me.x; game.cam.y = me.y + me.eye; game.cam.z = me.z; applyCamera(); return true; },
    _look(yaw, pitch) { const me = game.G.me; if (!me) return false; me.yaw = yaw; if (pitch != null) me.pitch = pitch;
      game.cam.yaw = yaw; if (pitch != null) game.cam.pitch = pitch; applyCamera(); return true; },
    _hold(v) { game.G.__hold = !!v; return !!game.G.__hold; },
    /* ⧗ SMEAR PEEPHOLE. `_smear(x)` pins `motion` to x so the feedback can be measured against a
     * known input instead of against whatever the camera happened to be doing; `_smear(-1)` hands
     * it back to the camera. `_smear()` just reports. Same reason the post stack exposes its parts
     * by name: measure ONE thing at a time on ONE loaded scene. */
    _smear(force) { if (force != null) SMEAR.force = force < 0 ? -1 : clamp(force, 0, 1);
      return { on: SMEAR.on, warm: SMEAR.warm, ceiling: SMEAR.ceiling, force: SMEAR.force,
        motion: +SMEAR.motion.toFixed(4), amt: +SMEAR.amt.toFixed(4), w: SMEAR.w, h: SMEAR.h,
        fmt: app.graphicsDevice.backBufferFormat, tier: QCFG.smear }; },
    /* Free / restore the whole pass WITHOUT moving the quality ladder, so the cost of the blit can
     * be measured against itself on one loaded scene instead of against a different tier. */
    _smearPass(v) { QCFG.smear = !!v && QBASE.smear; if (!QCFG.smear) freeSmear(); return QCFG.smear; },
    /* ⧗ BOOTS PEEPHOLE — hold the jet key for real, through the same flags a keyboard sets, so a
     * headless run drives the mechanic rather than a private test path. */
    _jet(v) { game.keys[' '] = !!v; return { held: !!v, boots: (game.G.me ? { burning: !!game.G.me.burning,
      boost: +game.G.me.boost.toFixed(3), y: +game.G.me.y.toFixed(2), vy: +game.G.me.vy.toFixed(2) } : null) }; },
    _god() { const me = game.G.me; if (me) { me.iframe = 1e9; me.hp = me.maxHp; } },
    _hideui(v) { ['hudTL', 'hudTR', 'hudBL', 'hudBR', 'killfeed', 'comms', 'toggles', 'controls', 'eng'].forEach(id => { const e = $(id); if (e) e.style.visibility = v ? 'hidden' : ''; }); },
    _fwd() { const v = cam.forward; return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; },
    /* Stage one representative frame of combat FX and FREEZE it. A tracer crosses a 40 m arena in
     * ~120 ms; under software GL a headless run renders about one frame in that time, so photo-
     * graphing live gunfire is a coin flip. This stuffs the same state the simulation would have
     * produced, mid-flight, and nothing else about the render path changes. */
    _fxdemo(stick) { fxDemo = stick !== false; return stuffFx(); },
    _post(o) { if (!frame) return null; Object.assign(POST, o || {});
      if (o && o.exposure != null) app.scene.exposure = o.exposure;
      if (o && o.sunI != null) sun.light.intensity = o.sunI;
      frame.bloom.intensity = POST.bloom; frame.rendering.sharpness = POST.sharpness;
      frame.fringing.intensity = POST.fringing; frame.grading.saturation = POST.saturation;
      frame.vignette.intensity = POST.vignette.intensity; frame.rendering.toneMapping = POST.tone;
      frame.grading.contrast = POST.contrast;
      frame.update(); return POST; },
    /* CLIPPED-PIXEL COUNT — the measurement the 0.94 knee was derived from, in the engine's terms.
     * Reads the real backing store (needs ?grab=1) and reports the fraction of pixels where a
     * channel has hit 255, plus mean luma and RMS contrast, so a tonemapper/bloom change can be
     * judged the way GfxPost's was: does it remove clipping, and what does it cost. */
    _clip() {
      const gl = app.graphicsDevice.gl;
      const w = app.graphicsDevice.width, h = app.graphicsDevice.height;
      const px = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let clipped = 0, sum = 0, sum2 = 0, n = w * h;
      for (let i = 0; i < n; i++) {
        const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
        if (r >= 255 || g >= 255 || b >= 255) clipped++;
        const l = 0.299 * r + 0.587 * g + 0.114 * b; sum += l; sum2 += l * l;
      }
      const mean = sum / n;
      return { w, h, pixels: n, clipped, clippedPct: +(clipped / n * 100).toFixed(4),
        meanLuma: +mean.toFixed(2), rms: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(2) };
    },
    /* Local contrast, for the one number that could NOT be ported analytically: GfxPost's unsharp
     * and PlayCanvas's CAS are different functions, so `sharpness` is matched by measuring the
     * result rather than by copying the value across. Mean |Laplacian| over the frame. */
    _sharpMetric() {
      const gl = app.graphicsDevice.gl;
      const w = app.graphicsDevice.width, h = app.graphicsDevice.height;
      const px = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const L = i => 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      let s = 0, n = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        s += Math.abs(4 * L(i) - L(i - 1) - L(i + 1) - L(i - w) - L(i + w)); n++;
      }
      return +(s / Math.max(1, n)).toFixed(3);
    },
  };
})();

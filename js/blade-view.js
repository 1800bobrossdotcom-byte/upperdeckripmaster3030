/* THE LIGHT — the picture (BladeView). PlayCanvas over the shoulder; geometry from Blender.
 *
 * Pairs with js/blade-game.js, which owns every RULE and knows nothing about a screen. This file
 * owns every PIXEL and decides nothing. The split is cr-streak.js's and pull-game.js's, and it is
 * what lets `npm run test:blade` drive thousands of exchanges under node with no browser at all.
 *
 * ⛔ THE ONE IDEA: THE LIGHT BLADE IS THE LIGHT. Ambient is near zero and there is no sun. What
 *    illuminates this scene is the sword in your hand — an omni parented to the blade — so the
 *    room is lit by the thing you are swinging, and the dark blades are only ever visible as the
 *    edge that catches it. ⚑ That answers DESIGN-SYSTEM §4 ("what moves and WHY it physically
 *    moved") with a MECHANISM rather than a light vector: the highlight travels because your hand
 *    travelled. Three rejected objects in this studio's record were beautiful and dead because
 *    that question was answered with "the pointer swings the key light"; here the key light IS
 *    the player.
 *
 * ⛔ AND THE TELEGRAPH IS MADE OF MATERIAL, NOT OF A HUD. An oncoming blade heats from cold violet
 *    to white as it approaches its landing instant, so the player reads the ANGLE from the line
 *    and the TIMING from the brightness — both from the same object, at a phone's arm's length,
 *    with no number to look away at. A timer bar would put the two halves of one read in two
 *    places on the screen.
 *
 * ── THE SCREEN-ANGLE CONVENTION, derived once and asserted in test:blade, because getting it 90°
 *    wrong renders perfectly and makes every correct answer fail:
 *      the blade mesh runs along its own local +y, grip at the origin (build-blade.py's contract)
 *      a node given the CAMERA's rotation has local x = screen right, y = screen up, z = out of
 *        the screen (a pc camera looks down its own −z)
 *      rotating that node about local +z by φ sends (0,1,0) to (−sin φ, cos φ)
 *      a finger line at screen angle `a` (atan2 with y DOWN, which is what a pointer event gives)
 *        points along (cos a, −sin a) in screen (right, up)
 *      ⇒ −sin φ = cos a and cos φ = −sin a  ⇒  φ = −a − π/2
 *    One number turns a drawn line into a drawn blade. Authoring the mesh along any other axis
 *    would need a second rotation here, and a second rotation is a second thing that can be 90°
 *    out without erroring.
 *
 * FAILS OPEN, with one deliberate exception stated out loud: no pc / no WebGL2 ⇒ mount() returns
 * null and the page shows its own "needs WebGL 2" panel. Every arcade cabinet here is a PlayCanvas
 * build now, so there is nowhere honest to send that visitor inside the arcade — the panel must
 * not promise one (CLAUDE.md records shipping exactly that lie once). A MISSING GLB PART is the
 * softer failure and is handled the other way: a primitive stands in, so the duel is playable with
 * a box for a sword rather than not playable at all.
 */
(function (root) {
  'use strict';

  const ART = 'models/blade.glb';

  /* screen line angle → node roll about the camera's forward axis. See the header derivation. */
  const rollFor = a => -a - Math.PI / 2;

  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function mount(opts) {
    const o = opts || {};
    const cv = o.canvas, game = o.game;
    const pc = root.pc;
    if (!cv || !game || !pc) return null;
    /* ⛔ NEVER TAKE A CONTEXT ON THE CANVAS YOU ARE ABOUT TO HAND TO THE ENGINE. A canvas has
     * exactly one context for its lifetime: the first `getContext` creates it, and every later
     * call — including PlayCanvas's own, with its own attributes — gets that first one back and
     * the attributes are silently ignored. Probing `cv` directly rendered a completely black
     * frame, and A CONSTANT RED CLEAR COLOUR WAS STILL BLACK, which is what proved it was the
     * context and not the scene, the materials or the camera. ⚑ THE CITY records the identical
     * signature one layer up (a constant-red shader that still drew black, from a viewport one
     * pixel across): when two failures look identical, delete one of them.
     * ⚠ The capability question is about the BROWSER, not about this element, so ask a throwaway. */
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return null;
    } catch (e) { return null; }

    let app;
    try {
      app = new pc.Application(cv, { graphicsDeviceOptions: { antialias: true, alpha: false } });
    } catch (e) { return null; }
    if (!app.graphicsDevice || !app.graphicsDevice.isWebGL2) { try { app.destroy(); } catch (e) {} return null; }

    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    const dprCap = (root.GfxPost && root.GfxPost.dprCap) ? root.GfxPost.dprCap() : 2;
    app.graphicsDevice.maxPixelRatio = Math.max(1, Math.min(root.devicePixelRatio || 1, dprCap));

    const G = game.state;
    const TELE = (root.BladeGame && root.BladeGame.TELEGRAPH) || 0.62;

    // ── materials ───────────────────────────────────────────────────────────────────────────────
    function mat(diffuse, emissive, gloss) {
      const m = new pc.StandardMaterial();
      m.diffuse.set(diffuse[0], diffuse[1], diffuse[2]);
      m.emissive.set(emissive[0], emissive[1], emissive[2]);
      m.specular.set(0.55, 0.58, 0.62);
      m.gloss = gloss == null ? 0.86 : gloss;
      m.useMetalness = false;
      m.update();
      return m;
    }
    function glow(colour, opacity) {
      const m = new pc.StandardMaterial();
      m.diffuse.set(0, 0, 0);
      m.emissive.set(colour[0], colour[1], colour[2]);
      m.blendType = pc.BLEND_ADDITIVE;
      m.depthWrite = false;
      m.opacity = opacity == null ? 1 : opacity;
      m.cull = pc.CULLFACE_NONE;
      m.update();
      return m;
    }
    /* ⚠ The FOIL is the light blade's whole material argument (build-blade.py's brief): a die-cut
     * strip that CATCHES light along a ground edge, not a glowing stick. So it keeps a real
     * specular and a real diffuse and merely runs its emissive hot — kill the specular and it
     * flattens into a neon tube, which is the "sticker of foil" failure DESIGN-SYSTEM §1 names. */
    /* ⚠ ALBEDO IS LOW BUT NOT NEAR-ZERO, AND THE FIRST PASS HAD IT AT ~0.05 EVERYWHERE. A dark
     * material under a dark ambient is not "moody", it is invisible — and the brief asks for the
     * dark blades to read as SILHOUETTES WITH A HOT EDGE, which needs enough albedo for the key to
     * find an edge at all. The darkness comes from the ambient and the light's falloff; the
     * surfaces themselves have to be able to answer a light. */
    const M = {
      light: mat([0.66, 0.80, 0.92], [0.55, 0.85, 1.00], 0.95),
      hilt: mat([0.16, 0.16, 0.19], [0.01, 0.02, 0.03], 0.7),
      foe: mat([0.085, 0.080, 0.115], [0.006, 0.004, 0.014], 0.35),
      ground: mat([0.14, 0.145, 0.16], [0.003, 0.004, 0.006], 0.42),
    };

    // ── scene ───────────────────────────────────────────────────────────────────────────────────
    app.scene.ambientLight = new pc.Color(0.030, 0.032, 0.042);
    if (app.scene.clusteredLightingEnabled != null) app.scene.clusteredLightingEnabled = false;

    const cam = new pc.Entity('cam');
    cam.addComponent('camera', {
      clearColor: new pc.Color(0.008, 0.008, 0.012), fov: 62, nearClip: 0.06, farClip: 90,
    });
    /* over the shoulder: high, behind, and off to the sword side so the player's own silhouette
     * sits low-left and the blade enters from low-right. */
    cam.setPosition(0.26, 1.46, -1.35);
    cam.lookAt(0.02, 1.38, 4.5);
    app.root.addChild(cam);

    /* a weak cold fill so a foe at the back of the queue is a SHAPE rather than nothing. It is not
     * a key — measured against the blade's own omni it contributes a few percent — and its only
     * job is to stop the far end of the corridor reading as a dead screen. */
    const fill = new pc.Entity('fill');
    fill.addComponent('light', { type: 'directional', color: new pc.Color(0.42, 0.52, 0.78), intensity: 0.30 });
    fill.setEulerAngles(58, 168, 0);
    app.root.addChild(fill);

    // ── art: the GLB, or primitives ─────────────────────────────────────────────────────────────
    const MESH = {};
    let artState = 'loading';

    function prim(kind, m, sx, sy, sz) {
      const e = new pc.Entity(kind);
      e.addComponent('render', { type: kind, material: m });
      e.setLocalScale(sx, sy, sz);
      return e;
    }
    /* Build one drawable for a named part. `MESH[name]` is set once the container lands; until
     * then (and forever, if the file 404s) a primitive stands in — the duel stays playable and the
     * page says which it got, because "it shipped with boxes for swords" must be legible. */
    function part(name, m, fallback) {
      const e = new pc.Entity(name);
      if (MESH[name]) {
        e.addComponent('render', { meshInstances: [new pc.MeshInstance(MESH[name], m)] });
      } else {
        const f = fallback || { type: 'box', s: [1, 1, 1], p: [0, 0, 0] };
        const inner = prim(f.type, m, f.s[0], f.s[1], f.s[2]);
        inner.setLocalPosition(f.p[0], f.p[1], f.p[2]);
        e.addChild(inner);
      }
      return e;
    }
    /* ⚠ The fallbacks are authored to the SAME contract as the meshes — a blade 1.0 long with its
     * grip at the origin — so a missing part changes what you see and never where anything is.
     * A stand-in with a different pivot would move the fight. */
    const FALLBACK = {
      blade_light: { type: 'box', s: [0.06, 1.0, 0.026], p: [0, 0.5, 0] },
      blade_dark: { type: 'box', s: [0.06, 1.0, 0.026], p: [0, 0.5, 0] },
      hilt: { type: 'box', s: [0.20, 0.05, 0.05], p: [0, -0.02, 0] },
      foe: { type: 'capsule', s: [0.5, 0.62, 0.5], p: [0, 0.60, 0] },
      ground: { type: 'cylinder', s: [14, 0.04, 14], p: [0, -0.02, 0] },
    };
    const build = (name, m) => part(name, m, FALLBACK[name]);

    // ── the floor ───────────────────────────────────────────────────────────────────────────────
    let ground = build('ground', M.ground);
    app.root.addChild(ground);

    /* ⛔ THERE IS NO PLAYER BODY, AND THAT IS A DECISION RATHER THAN AN OMISSION. The first pass
     * put the same figure the foes use just in front of the camera, "seen from behind", because
     * that is what "over the shoulder" makes you reach for. Measured at 390×844 it sat 0.44 m from
     * the lens and OWNED THE MIDDLE OF THE FRAME — a pale mannequin between the player and the one
     * thing this game asks them to read, which is an angle. ⚑ DESIGN-SYSTEM §1: the default is
     * only right when it is also the truth. Over-the-shoulder is a CAMERA (behind, above, offset
     * to the sword side) plus a blade entering from the lower right; it is not a back in the lens.
     * ⚠ AND NOTHING IS LEFT BEHIND FOR IT — no `self3 = null`, no unused `M.self`. This repo has
     *   already paid for dead data kept "for completeness": a spare key on MODES was what let a
     *   guard match the wrong table entry and report a broken build as green. If a shoulder is ever
     *   wanted it must be authored to sit in the CORNER, and that is a new object, not a revived
     *   one. */

    // ── the player's blade: a VIEWMODEL, a child of the camera ──────────────────────────────────
    /* ⚠ Section 9's recorded lesson: a viewmodel's position is decided by the PROJECTION, not by
     * the fiction. Held where a real arm would hold it, most of it is behind the near plane. It
     * hangs off the camera so it is always framed, and nearClip is set for it above. */
    const hand = new pc.Entity('hand');
    hand.setLocalPosition(0.14, -0.28, -0.76);
    cam.addChild(hand);

    let myBlade = build('blade_light', M.light);
    let myHilt = build('hilt', M.hilt);
    hand.addChild(myBlade);
    hand.addChild(myHilt);

    /* THE KEY LIGHT, and it lives on the blade. Range is short so the corridor falls away into
     * black behind whatever you are actually fighting. */
    const keyLight = new pc.Entity('key');
    keyLight.addComponent('light', {
      /* ⚠ SHORT RANGE ON PURPOSE. At 7.5 it reached the foes and floodlit them CYAN — the dark
       * figures came out as the brightest thing on screen and the whole light-against-dark reading
       * inverted. The player's blade lights the PLAYER and the ground under them; what lights a
       * foe is the foe's own blade. */
      type: 'omni', color: new pc.Color(0.70, 0.92, 1.0), intensity: 2.4, range: 2.6,
    });
    keyLight.setLocalPosition(0, 0.55, 0);
    hand.addChild(keyLight);

    // ── FX: the streak, the clash, the guard ────────────────────────────────────────────────────
    const streakMat = glow([0.75, 0.95, 1.0], 0);
    const streak = prim('plane', streakMat, 1, 1, 1);
    streak.setLocalPosition(0.05, -0.10, -0.85);
    cam.addChild(streak);
    let streakT = 0, streakA = 0;

    const guardMat = glow([0.60, 0.85, 1.0], 0);
    const guard = prim('plane', guardMat, 1, 1, 1);
    guard.setLocalPosition(0.05, -0.10, -0.95);
    cam.addChild(guard);
    let guardT = 0;

    const clashMat = glow([1.0, 0.92, 0.72], 0);
    const clash = prim('plane', clashMat, 1, 1, 1);
    app.root.addChild(clash);
    let clashT = 0;

    /* a plane's own +y is its normal in pc, so it has to be stood up to face the camera. Doing it
     * once here rather than per frame keeps the per-frame job to a roll and a scale. */
    for (const e of [streak, guard, clash]) e.setLocalEulerAngles(90, 0, 0);
    /* ⛔ AN ADDITIVE MATERIAL AT OPACITY 0 IS NOT INVISIBLE — IT IS FULLY VISIBLE. Additive
     * blending is `src*1 + dst*1`; the alpha channel is simply not in that equation, so `opacity`
     * does nothing to it. All three flash planes therefore sat on the scene at full brightness
     * from the first frame, and the whole game rendered as a white-out with a figure dissolving
     * in the middle of it. ⚑ Every number in the suite passed through this — the geometry, the
     * camera, the convention, the gestures, the score — because none of them is a picture. Only
     * looking found it.
     * ⚠ So the gate is `enabled`, and the fade is carried on the EMISSIVE (which additive DOES
     *   read), never on opacity. */
    const fxOff = e => { e.enabled = false; };
    [streak, guard, clash].forEach(fxOff);

    // ── foes ────────────────────────────────────────────────────────────────────────────────────
    /* one entity set per live foe, keyed by the rules' own id. ⚠ Each needs its OWN blade material
     * because the emissive IS the telegraph and a shared material would heat every blade at once —
     * which would read as "they all attack together", i.e. the exact pacing bug the rules module
     * had to be fixed for. */
    const rigs = new Map();
    function rigFor(f) {
      let r = rigs.get(f.id);
      if (r) return r;
      const root3 = new pc.Entity('foe-' + f.id);
      const body = build('foe', M.foe);
      root3.addChild(body);
      const hn = new pc.Entity('hand-' + f.id);           // billboarded to the camera, then rolled
      root3.addChild(hn);
      const bm = mat([0.05, 0.03, 0.07], [0.30, 0.06, 0.45], 0.9);
      const bl = build('blade_dark', bm);
      const hl = build('hilt', M.hilt);
      hn.addChild(bl); hn.addChild(hl);
      /* ⛔ THE FOE IS LIT BY ITS OWN BLADE, AND THAT IS THE BRIEF ANSWERED WITH A MECHANISM. The
       * dark figure is a silhouette until the blade it carries heats up — so the telegraph does
       * not merely change one object's colour, it BRINGS THE FIGURE OUT OF THE DARK as the moment
       * approaches, and drops it back when you answer. One value drives the emissive and this
       * light together, so the picture and the clock can never disagree. */
      const glowLight = new pc.Entity('foelight-' + f.id);
      glowLight.addComponent('light', {
        type: 'omni', color: new pc.Color(0.62, 0.22, 0.95), intensity: 0.5, range: 3.4 });
      glowLight.setLocalPosition(0, 0.45, 0);
      hn.addChild(glowLight);
      app.root.addChild(root3);
      r = { root: root3, body, hn, bm, bl, light: glowLight, dead: 0, flash: 0 };
      rigs.set(f.id, r);
      return r;
    }
    function dropRig(id) {
      const r = rigs.get(id);
      if (!r) return;
      try { r.root.destroy(); } catch (e) {}
      rigs.delete(id);
    }

    // ── load the art, then swap every stand-in for the real mesh ────────────────────────────────
    const swapTargets = [];   // [entity, partName, material]
    function remember(e, name, m) { swapTargets.push([e, name, m]); return e; }
    remember(ground, 'ground', M.ground);
      remember(myBlade, 'blade_light', M.light);
    remember(myHilt, 'hilt', M.hilt);

    function rebuildAll() {
      for (const [e, name, m] of swapTargets) {
        if (!MESH[name] || !e.parent) continue;
        const p = e.parent, pos = e.getLocalPosition().clone(),
          rot = e.getLocalRotation().clone(), sc = e.getLocalScale().clone();
        const n = build(name, m);
        n.setLocalPosition(pos); n.setLocalRotation(rot); n.setLocalScale(sc);
        p.addChild(n); e.destroy();
        if (e === ground) ground = n;
        else if (e === myBlade) myBlade = n; else if (e === myHilt) myHilt = n;
      }
      swapTargets.length = 0;
      for (const id of [...rigs.keys()]) dropRig(id);   // rebuilt next frame from the rules
    }

    try {
      app.assets.loadFromUrl(o.art || ART, 'container', (err, asset) => {
        if (err || !asset) { artState = 'primitives (' + (err || 'no asset') + ')'; return; }
        try {
          const inst = asset.resource.instantiateRenderEntity();
          inst.forEach(e => {
            if (e.render && e.render.meshInstances.length) MESH[e.name] = e.render.meshInstances[0].mesh;
          });
          inst.destroy();
          const missing = ['blade_light', 'blade_dark', 'hilt', 'foe', 'ground'].filter(n => !MESH[n]);
          artState = missing.length ? 'partial (missing ' + missing.join(', ') + ')' : 'authored';
          rebuildAll();
        } catch (e2) { artState = 'primitives (' + e2 + ')'; }
      });
    } catch (e) { artState = 'primitives (' + e + ')'; }

    // ── per-frame state driven by the page ──────────────────────────────────────────────────────
    let aim = -Math.PI / 2;          // the line the finger last drew; default straight up
    let swing = 0, swingFrom = 0, swingTo = 0;
    let shake = 0, lurch = 0, hurtFlash = 0;
    const _q = new pc.Quat(), _c = new pc.Color();

    /* ⚑ WHERE THE TWO BLADES MEET, so the clash spark lands on the crossing rather than at some
     * fixed point on the screen. A player has to be able to see WHICH line they answered. */
    function clashAt(r) {
      const p = r.hn.getPosition();
      return [p.x, p.y, p.z];
    }

    /* ── ONE GESTURE. The page hands over the verb and the line; the rules decide, the picture
     * reacts. Returning the rules' own result unchanged is deliberate: the page prints it, and a
     * view that paraphrased it could disagree with what actually happened. */
    function act(kind, a) {
      if (a != null) aim = a;
      const before = G.hp;
      const res = game.act(kind, aim == null ? 0 : aim);
      if (kind === 'slash') {
        swingFrom = aim - 0.55; swingTo = aim + 0.55; swing = 0;
        streakT = 1; streakA = aim;
      }
      if (kind === 'parry') guardT = 1;
      if (kind === 'step') lurch = res && res.ok ? 1 : 0;
      if (res && res.ok && (res.deflected || res.opened || res.killed)) {
        const id = res.deflected || res.killed || res.foe;
        const r = id && rigs.get(id);
        if (r) {
          r.flash = 1;
          if (res.killed) r.dead = 1;
          const p = clashAt(r);
          clash.setPosition(p[0], p[1], p[2]);
        }
        clashT = 1;
        shake = Math.min(1, shake + (res.killed ? 0.55 : 0.32));
      }
      if (G.hp < before) hurtFlash = 1;
      return res;
    }

    function step(dt) {
      const hp0 = G.hp;
      game.step(dt);
      if (G.hp < hp0) { hurtFlash = 1; shake = Math.min(1, shake + 0.7); }

      // decay
      swing = Math.min(1, swing + dt / 0.16);
      streakT = Math.max(0, streakT - dt / 0.20);
      guardT = Math.max(0, guardT - dt / 0.22);
      clashT = Math.max(0, clashT - dt / 0.26);
      shake = Math.max(0, shake - dt / 0.34);
      lurch = Math.max(0, lurch - dt / 0.26);
      hurtFlash = Math.max(0, hurtFlash - dt / 0.45);

      // ── the player's blade: roll to the drawn line, sweeping through it on a slash ────────────
      const held = swing >= 1 ? aim : lerp(swingFrom, swingTo, swing < 0 ? 0 : swing);
      const roll = rollFor(held);
      hand.setLocalEulerAngles(0, 0, roll * 180 / Math.PI);
      /* the blade THRUSTS on the swing and settles back — a cut has a reach, and without it the
       * sword only ever rotates, which reads as a windscreen wiper. */
      const push = Math.sin(clamp(swing, 0, 1) * Math.PI) * 0.16;
      hand.setLocalPosition(0.14, -0.28, -0.76 - push);
      keyLight.light.intensity = 4.4 + 2.6 * Math.sin(clamp(swing, 0, 1) * Math.PI) + clashT * 3.0;

      // ── the foes ─────────────────────────────────────────────────────────────────────────────
      const seen = new Set();
      for (const f of G.foes) {
        if (f.dead && !rigs.has(f.id)) continue;
        seen.add(f.id);
        const r = rigFor(f);
        const left = f.at - G.t;
        /* distance is TIME, so the queue is legible as depth: the blade you must answer next is
         * simply the closest one. No marker, no arrow — the geometry says it. */
        /* ⚠ CLOSER AND SHALLOWER THAN THE FIRST PASS. At `2.0 + left*2.2` the armed blade sat
         * ~4 m out and occupied the bottom third of a 390×844 frame with half the screen empty
         * above it — legible on a desktop, small on the device this was made for. */
        const d = clamp(1.75 + left * 1.55, 1.6, 11);
        const x = f.lane * 1.15;
        r.root.setPosition(x, 0, d);
        r.root.lookAt(0, 0, -2);
        r.dead = f.dead ? Math.min(1, r.dead + dt / 0.35) : 0;
        r.flash = Math.max(0, r.flash - dt / 0.3);

        const opened = f.open > G.t;
        const s = f.dead ? Math.max(0.001, 1 - r.dead) : 1;
        r.root.setLocalScale(s, s, s);
        r.body.enabled = !f.dead || r.dead < 1;

        /* ── THE TELEGRAPH IS THE MATERIAL. Cold violet while it is queued, white-hot at the
         * instant it lands. ⚠ `heat` is clamped at BOTH ends: an un-clamped value goes negative
         * for a queued foe (a blade darker than black, i.e. no change and no tell) and past 1 for
         * one that has already landed (a blade that keeps getting brighter after it hit you,
         * which reads as the game blaming you for the wrong beat). */
        const heat = clamp(1 - left / TELE, 0, 1);
        const armed = left <= TELE * 1.6;
        if (opened) {
          _c.set(0.10, 0.55, 0.75);                        // answered: it goes cold and drops
        } else {
          _c.set(lerp(0.30, 1.25, heat), lerp(0.06, 0.92, heat * heat), lerp(0.45, 0.80, heat));
        }
        const fl = r.flash;
        r.bm.emissive.set(_c.r + fl, _c.g + fl, _c.b + fl);
        r.bm.update();
        /* the same value, as a light — see the note where it is built */
        r.light.light.color.set(Math.min(1, _c.r), Math.min(1, _c.g), Math.min(1, _c.b));
        r.light.light.intensity = (opened ? 0.4 : 0.45 + 3.2 * heat * heat) + fl * 2;

        /* raised to its LINE once it is armed; carried low before that. The snap to the arc is
         * the tell that this is the one to answer next. */
        r.hn.setPosition(x + (f.lane > 0 ? -0.24 : 0.24), 1.05, d - 0.20);
        r.hn.setRotation(cam.getRotation());
        const shown = opened ? f.arc + 1.15 : (armed ? f.arc : f.arc * 0.15 + 1.35);
        r.hn.rotateLocal(0, 0, rollFor(shown) * 180 / Math.PI);
        const bs = armed && !opened ? 1 : 0.92;
        r.hn.setLocalScale(bs, bs, bs);
      }
      for (const id of [...rigs.keys()]) if (!seen.has(id)) dropRig(id);
      // the rules keep dead foes in the list; drop a rig only once its fade has finished
      for (const [id, r] of rigs) {
        const f = G.foes.find(x => x.id === id);
        if (f && f.dead && r.dead >= 1) dropRig(id);
      }

      // ── FX. Present only while they are firing; brightness rides the EMISSIVE. ──────────────
      streak.enabled = streakT > 0.001;
      if (streak.enabled) {
        const k = streakT * streakT;
        streakMat.emissive.set(0.62 * k, 0.86 * k, 1.0 * k); streakMat.update();
        streak.setLocalEulerAngles(90, 0, rollFor(streakA) * 180 / Math.PI + 90);
        streak.setLocalScale(1.5 * (0.55 + 0.45 * streakT), 1, 0.02 + 0.05 * streakT);
      }
      guard.enabled = guardT > 0.001;
      if (guard.enabled) {
        const k = guardT * guardT;
        guardMat.emissive.set(0.42 * k, 0.66 * k, 0.9 * k); guardMat.update();
        const gs = 0.22 + 0.30 * (1 - guardT);
        guard.setLocalScale(gs, 1, gs);
      }
      clash.enabled = clashT > 0.001;
      if (clash.enabled) {
        const k = clashT * clashT;
        clashMat.emissive.set(1.0 * k, 0.88 * k, 0.66 * k); clashMat.update();
        const cs = 0.12 + 0.55 * (1 - clashT);
        clash.setLocalScale(cs, 1, cs);
        clash.setRotation(cam.getRotation());
        clash.rotateLocal(90, 0, 0);
      }

      // ── camera ───────────────────────────────────────────────────────────────────────────────
      const sh = shake * shake;
      cam.setPosition(
        0.26 + Math.sin(G.t * 47) * 0.05 * sh + lurch * 0.22,
        1.46 + Math.cos(G.t * 41) * 0.04 * sh,
        -1.35 - lurch * 0.10);
      cam.lookAt(0.02 + lurch * 0.10, 1.38, 4.5);
    }

    function resize() {
      const b = cv.getBoundingClientRect();
      app.resizeCanvas(Math.max(2, b.width | 0), Math.max(2, b.height | 0));
    }
    resize();
    root.addEventListener('resize', resize);
    app.start();
    /* ⚠ the page owns the clock. app.start() would otherwise run its own update loop as well, and
     * two clocks stepping one simulation is how a game ends up running at double speed on a fast
     * device and half on a slow one. */
    app.autoRender = true;
    app.on('update', () => {});

    function destroy() {
      root.removeEventListener('resize', resize);
      try { app.destroy(); } catch (e) {}
    }

    return {
      app, cam, hand, step, act, resize, destroy,
      get aim() { return aim; }, set aim(v) { aim = v; },
      get art() { return artState; },
      get rigs() { return rigs; },
      /* exposed for test:blade — the screen-angle convention is the one thing here that can be 90°
       * wrong while rendering perfectly, so it has to be askable rather than inferable. */
      rollFor,
      hurt() { return hurtFlash; },
    };
  }

  root.BladeView = { mount, rollFor, ART };
})(typeof window !== 'undefined' ? window : globalThis);

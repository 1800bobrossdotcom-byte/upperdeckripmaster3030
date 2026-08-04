/* ripmaster3030studios — A HERO CARD AS A PRINT THAT WENT WRONG.  `HeroCard`
 *
 *   HeroCard.build(opts) -> Promise<ctrl | null>      never rejects, never throws
 *   ctrl.pointer(x, y, down)                          -1..1 in card space
 *   ctrl.setView(yaw, pitch)                          drive the turn directly (probes, tests)
 *   ctrl.setState({burn, price, depth})               the market, 0..1 dials
 *   ctrl.advance(dtMs)  ctrl.render()  ctrl.loop(on)  explicit clock — see DETERMINISM
 *   ctrl.probe()                                      numbers for the acceptance harness
 *
 * Brief: `docs/HERO-33-BRIEF.md`. This is step §7.1 — ONE card end to end — and the brief says
 * out loud that it is DISPOSABLE. The recorded failure mode on this project is agreeing a
 * direction off a mood board; the point of a prototype is to be something specific to reject.
 *
 * ══ WHY THIS IS NOT `js/card3d.js` ═════════════════════════════════════════════════════════
 * That file is THE ONE dynamic 3D card and it stays that way. It shows a card that was PAINTED:
 * a picture (or a stack of authored plates) on a lit, tilting slab, with a colour pipeline that
 * was measured and must not be re-derived. This is a different object — the artwork itself is
 * generated, out of the deck, at fetch time. There is no picture to hang. Two renderers is
 * normally the bug this repo warns about; the test is whether they would ever share a fix, and
 * they would not: card3d's fixes are about faithfully reproducing someone's art, and every line
 * below is about damaging it on purpose. When the 33 are approved, the honest composition is
 * that this draws the ARTWORK and card3d frames it.
 *
 * ══ THE ONE IDEA ═══════════════════════════════════════════════════════════════════════════
 * The card is not "a 3D model with effects on it". It is a sheet of card stock that went through
 * a press, and every artefact is something that can happen to PAPER:
 *
 *   · the artwork is composed from the deck itself — the 100 are the pigment (artist's ask)
 *   · that artwork is SEPARATED into four process inks, and each ink is laid down at its OWN
 *     registration. ⚑ THE MIS-REGISTRATION IS NOT A FILTER — it falls out of printing the same
 *     picture four times with the plates in slightly the wrong place, which is the actual
 *     failure. That is also why it is uniform across the frame by construction (acceptance 4)
 *     and why every sampled source resolves to a deck card by construction (acceptance 7).
 *   · each ink is SCREENED at its own angle, so the moiré between plates is real moiré
 *   · the roller bands, starves, and the dots coarsen — the halftone gives up
 *   · the die edge is foil, so it diffracts (acceptance 1)
 *
 * ⛔ NOTHING HERE IS EMISSIVE. No scanlines, no RGB-split-with-a-glow, no CRT bloom — those make
 *   it a SCREEN, and this is a CARD. Ink is applied SUBTRACTIVELY (the paper's reflectance is
 *   multiplied by each ink's transmittance), which is the single line that keeps the whole thing
 *   on the paper side of the fence. The foil's contribution is specular, not additive glow: it
 *   is light bouncing off metal, which is a thing that happens to a card in a room.
 *
 * ══ ⛔ REGISTRATION IS FROZEN, PARALLAX IS NOT — and conflating them was the trap ═══════════
 * Both move a plate sideways, and they are opposite in kind:
 *   REGISTRATION  a press failure. Frozen at the moment of the impression, uniform across the
 *                 whole sheet, identical from every viewing angle. YOUR card is one bad pull.
 *   PARALLAX      depth. Per ELEMENT (ground / mid / figure / type), and it is a function of
 *                 where you are looking from, so it only ever moves when you do.
 * Keeping them separate is what makes acceptance 4 measurable at all: hold the view still, step
 * the registration, and the displacement field must be one constant vector per plate. A radial
 * field is chromatic aberration wearing a print costume — a LENS artefact — and `js/city-ink.js`
 * already recorded that exact confusion once.
 *
 * ══ ⛔ AND THE BRIEF CONTRADICTED ITSELF ABOUT THE PRESS. STILLNESS WON ════════════════════
 * §3 wants three motions: you handle it, the press runs, the token degrades it. But §3 also says
 * "zero displacement, zero drift, nothing breathing", and acceptance 2 measures max displacement
 * over ten seconds with no input and demands EXACTLY 0. A press cycle on a wall-clock timer
 * fails that, and it should: an ambient loop is the screensaver §3 rejects, and it destroys the
 * one thing that makes a glitch land — contrast with stillness.
 * ⚑ SO THE PRESS IS DRIVEN BY HANDLING. Work you put into the card accumulates, and when enough
 *   has gone in the sheet ADVANCES: a new impression, new registration, new ink film. It is the
 *   same input as motion 1 at a different timescale, it is physical (a press runs when someone
 *   runs it), and a card nobody is touching is a card sitting on a table. At rest every spring
 *   sits at exactly 0 with exactly 0 velocity and there is no noise term anywhere, so "still"
 *   is a property of the arithmetic rather than a small number nobody notices.
 *
 * ══ DETERMINISM (acceptance 5) ═════════════════════════════════════════════════════════════
 * `Math.random` appears nowhere. Every seeded quantity comes from `mulberry32`, every animated
 * quantity is integrated from `advance(dt)` with a dt the CALLER supplies, and `render()` reads
 * no clock at all. `loop(true)` is a convenience that feeds rAF deltas in; a harness feeds fixed
 * ones. Same seed + same dt sequence + same pointer history ⇒ byte-identical frame.
 *
 * ══ FAILS OPEN ═════════════════════════════════════════════════════════════════════════════
 * No WebGL2, a texture that never decodes, a shader that will not link, a blocked request ⇒
 * `build` resolves to **null** and the calling page keeps whatever it was already showing. A
 * collector never sees a broken frame. This runs in SuperRare's media slot: a sandboxed iframe
 * at an opaque origin, so no storage, no parent, no wallet, and nothing third-party is fetched.
 */
(function (global) {
  'use strict';

  const VERSION = 1;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TAU = Math.PI * 2;

  /* ── the seed ────────────────────────────────────────────────────────────────────────────
   * mulberry32. Small, fast, and — the only property that matters here — it is a pure function
   * of its state, so a card rebuilt from the same seed on another machine is the same card. */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── THE PIGMENT ─────────────────────────────────────────────────────────────────────────
   * *"use the 100 cards as source material to paint these cards."* The deck IS the palette, so
   * three of them are chosen by seed and every pixel of ground, mid and figure comes out of one
   * of the three. Acceptance 7 ("every sampled source resolves to one of the 100") is then a
   * property of the code rather than a promise — there is no other image in the shader. */
  function pickPigment(seed, pool) {
    const r = rng(seed ^ 0x9E3779B9), out = [], used = {};
    while (out.length < 3 && out.length < pool.length) {
      const i = Math.floor(r() * pool.length);
      if (used[i]) continue;
      used[i] = 1; out.push(pool[i]);
    }
    while (out.length < 3) out.push(pool[0]);
    return out;
  }

  /* ⛔ ONE definition of the art window, because two of them disagreed and the disagreement was
   * invisible. `ctx.rect(x, y, w, h)` takes a HEIGHT, and the first cut passed it the window's
   * BOTTOM EDGE — so the window ran 31px past where the name was set, and PLATE PROOF came out
   * straddling the lip: half on raw stock, half on dark artwork, illegible and looking exactly
   * like a colour choice. The trim and the name are laid out from the same numbers now. */
  function WINDOW(W, H, m) {
    const top = m * 0.98, bottom = H - m * 2.9;
    return { x: m, y: top, w: W - 2 * m, h: bottom - top, bottom: bottom };
  }

  /* ── THE COMPOSITION PLATE ───────────────────────────────────────────────────────────────
   * One RGBA texture, drawn once from the seed, carrying the four masks that say WHERE things
   * are. It is generated in a 2D canvas rather than in the shader because a torn edge is a
   * PATH — irregular, closed, with a fibre fringe — and a path is a thing canvas draws exactly
   * and a fragment shader only ever approximates with noise.
   *
   *   R  the strip mask   — where the mid card shows through the ground, in TORN bands
   *   G  the figure window — the pulled subject
   *   B  the frame        — rules, corner marks, the printed border
   *   A  UNUSED, and it must stay at 255 — see the note under this function.
   */
  function buildComp(seed, N) {
    const c = document.createElement('canvas');
    c.width = N; c.height = Math.round(N * 1.5);
    const g = c.getContext('2d', { willReadFrequently: false });
    const W = c.width, H = c.height, r = rng(seed ^ 0x51ED270B);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

    /* A torn edge, left to right. ⚠ Not a wobbly line: paper tears in FIBRES, so the deviation
     * is one slow term (where the tear is going) plus one fast one (the fibre it is following),
     * and dropping the fast term is what makes a generated tear read as a cut. */
    const tornPath = (y0, amp) => {
      g.beginPath(); g.moveTo(-4, y0);
      const ph = r() * TAU, ph2 = r() * TAU, k = 2 + r() * 3;
      for (let x = 0; x <= W + 4; x += 3) {
        const u = x / W;
        const y = y0 + Math.sin(u * k + ph) * amp + Math.sin(u * 37 + ph2) * amp * 0.22
          + Math.sin(u * 113 + ph) * amp * 0.09;
        g.lineTo(x, y);
      }
      return g;
    };

    // ── R · torn strips of the mid card laid over the ground ──────────────────────────────
    const strips = 2 + Math.floor(r() * 2);
    g.globalCompositeOperation = 'lighter';
    for (let s = 0; s < strips; s++) {
      const top = (0.10 + r() * 0.72) * H, hgt = (0.07 + r() * 0.20) * H;
      const amp = 3 + r() * 9;
      tornPath(top, amp);
      for (let x = W + 4; x >= -4; x -= 3) {
        const u = x / W;
        g.lineTo(x, top + hgt + Math.sin(u * 4.1 + s) * amp + Math.sin(u * 61 + s) * amp * 0.3);
      }
      g.closePath();
      g.fillStyle = 'rgb(255,0,0)'; g.fill();
    }

    // ── G · the figure window ─────────────────────────────────────────────────────────────
    // Soft-edged on purpose: a pulled subject is a piece of another card, and its edge is where
    // the scanner lost it, not a marquee selection.
    {
      const cx = (0.32 + r() * 0.36) * W, cy = (0.26 + r() * 0.26) * H;
      const rx = (0.24 + r() * 0.12) * W, ry = rx * (1.15 + r() * 0.5);
      const gr = g.createRadialGradient(cx, cy, rx * 0.20, cx, cy, rx);
      gr.addColorStop(0, 'rgb(0,255,0)'); gr.addColorStop(0.72, 'rgb(0,235,0)');
      gr.addColorStop(1, 'rgb(0,0,0)');
      g.fillStyle = gr;
      g.save(); g.translate(cx, cy); g.scale(1, ry / rx); g.translate(-cx, -cy);
      g.beginPath(); g.arc(cx, cy, rx, 0, TAU); g.fill(); g.restore();
    }

    /* ── B · THE TRIM ────────────────────────────────────────────────────────────────────
     * ⛔ NOT a drawn border — the RAW STOCK, left unprinted. A trading card's border is where
     *   the ink stops, so this channel says "no artwork here" and the paper does the rest. The
     *   first cut drew a dark rule instead and it was invisible on a dark card, which is the
     *   same mistake as painting a highlight instead of lighting one.
     * ⚑ And it is what makes the picture read at all: the artwork becomes a WINDOW. Bleeding
     *   the composition to all four edges is what turned the first proof into wallpaper. */
    g.globalCompositeOperation = 'lighter';
    const m = Math.round(W * 0.062), win = WINDOW(W, H, m);
    g.fillStyle = 'rgb(0,0,255)';
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(win.x, win.y, win.w, win.h);
    g.fill('evenodd');

    return c;
  }

  /* ⛔ AND THE ALPHA CHANNEL IS NOT A DATA CHANNEL. The crease height used to live in this
   * texture's alpha, written with getImageData/putImageData — and a 2D canvas stores its pixels
   * PREMULTIPLIED, so writing alpha 0 multiplies that pixel's colour by zero and it comes back
   * black. Every mask in this texture — strips, figure window, trim — was silently wiped
   * wherever there was no crease, which is almost everywhere.
   * ⚑ The card still rendered. It rendered the GROUND card alone, edge to edge, which looks
   *   exactly like a composition that has not been finished rather than a texture that has been
   *   destroyed. Nothing errored, nothing was missing, and the plausible picture is the one that
   *   costs you an afternoon. **Alpha stays at 255 in every generated texture here**, and a
   *   fourth channel of data gets a fourth channel of some other texture. */

  /* ── THE RELIEF ──────────────────────────────────────────────────────────────────────────
   * Creases, in the type plate's spare BLUE. A crease happened to the STOCK, so it survives
   * under every plate and it belongs to the sheet — which is why it is re-rolled on each pull:
   * a new impression is a new piece of card, and a new piece of card is folded differently.
   * ⚑ Drawn as a gradient-stroked PATH rather than a per-pixel loop. Same shape, no 393k-pixel
   *   pass on every pull, and no round trip through getImageData at all. */
  function drawCreases(g, W, H, r) {
    /* ⚠ A CREASE IS WIDE AND SHALLOW. The first pass drew them 0.6-1.8% of the card wide and
     * fed the normal a gain of 26, which put a hard-edged black line across the artwork: at that
     * width the height field changes by half its range in a single texel, the perturbed normal
     * swings past the terminator, and a FOLD comes out as a SCRATCH. A fold in card stock is a
     * couple of millimetres of gentle curvature — one side catches the key, the other loses it. */
    const n = Math.floor(r() * 3);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const cx = r() * W, cy = r() * H, a = r() * TAU, w = W * (0.020 + r() * 0.030);
      const s = 0.45 + r() * 0.55, L = Math.hypot(W, H);
      const nx = -Math.sin(a), ny = Math.cos(a);
      const gr = g.createLinearGradient(cx - nx * w, cy - ny * w, cx + nx * w, cy + ny * w);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.5, 'rgb(0,0,' + Math.round(s * 210) + ')');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.strokeStyle = gr; g.lineWidth = w * 2;
      g.beginPath();
      g.moveTo(cx - Math.cos(a) * L, cy - Math.sin(a) * L);
      g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L);
      g.stroke();
    }
  }

  /* ── THE TYPE PLATE ──────────────────────────────────────────────────────────────────────
   * ⛔ NO FONT. Artist's call, 2026-08-04. The contours come from `cards/type/<name>.json`,
   * built by `scripts/build-card-type.py`, and this rasterises those coordinates. Nothing is
   * named in CSS and nothing is downloaded, so the card renders identically on a machine with no
   * fonts installed at all (acceptance 8) — which matters because the permanent artwork of a 1/1
   * must not depend on what the collector happens to have.
   *
   * ⚑ AND THE LETTERS ARE SET INDIVIDUALLY, which is the whole reason the type had to become
   *   geometry. A press does not move a word; it moves the SHAPES on the plate, so each letter
   *   takes its own kick and its own rotation. A CSS font cannot be pulled apart like this.
   * ⚠ 'evenodd', or every counter fills in and PLATE PROOF comes out as blobs.
   *
   *   R  the name, set across the band of raw stock under the art window
   *   G  the printer's own marks in the trim — registration targets and a colour bar. ⚑ They
   *      are not decoration: a registration target is the thing a press operator looks at to
   *      find out how badly the plates have slipped, and on this card it has slipped, so the
   *      target reports on the artwork it is sitting next to. The joke tells itself.
   *   B  the crease relief — see drawCreases. It is here because it is per-SHEET, like the name.
   */
  function buildType(spec, seed, N, sheet) {
    const c = document.createElement('canvas');
    c.width = N; c.height = Math.round(N * 1.5);
    const g = c.getContext('2d');
    const W = c.width, H = c.height, m = Math.round(W * 0.062), win = WINDOW(W, H, m);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const rc = rng((seed ^ 0x27D4EB2F) + sheet * 104729);
    drawCreases(g, W, H, rc);                                // B

    // ── G · the trim marks ────────────────────────────────────────────────────────────────
    g.strokeStyle = 'rgb(0,255,0)'; g.fillStyle = 'rgb(0,255,0)';
    g.lineWidth = Math.max(1, W * 0.0035);
    for (const [tx, ty] of [[m * 0.48, m * 0.48], [W - m * 0.48, m * 0.48],
      [m * 0.48, H - m * 0.48], [W - m * 0.48, H - m * 0.48]]) {
      const rr = m * 0.26;
      g.beginPath(); g.arc(tx, ty, rr, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(tx - rr * 1.8, ty); g.lineTo(tx + rr * 1.8, ty);
      g.moveTo(tx, ty - rr * 1.8); g.lineTo(tx, ty + rr * 1.8); g.stroke();
    }
    // the colour bar, down the right-hand trim: four solids in plate order
    for (let i = 0; i < 4; i++) {
      g.fillRect(W - m * 0.72, H * 0.34 + i * m * 0.62, m * 0.44, m * 0.44);
    }
    g.lineWidth = Math.max(1, W * 0.0028);
    g.strokeRect(win.x, win.y, win.w, win.h);                // the window's own hairline

    // ── R · the name ──────────────────────────────────────────────────────────────────────
    if (!spec || !spec.letters || !spec.letters.length) return c;
    const r = rng((seed ^ 0x2545F491) + sheet * 7919);
    const bb = spec.bbox, wEm = Math.max(1e-3, bb[2] - bb[0]), hEm = Math.max(1e-3, bb[3] - bb[1]);
    /* Set on the band of raw stock BELOW the art window — where a card puts its name, and the
     * only place on a dark composition where heavy black type is legible at all. The size is
     * derived from the band so the name can never grow out of it: cap height is 62% of the band,
     * and the width caps it for a long name. */
    const bandH = H - m - win.bottom;
    const capW = (W - m * 2.6) / wEm, capH = (bandH * 0.62) / hEm;
    const sc = Math.min(capW, capH), boxW = wEm * sc, boxX = (W - boxW) / 2;
    const boxY = win.bottom + (bandH + hEm * sc) / 2;

    g.fillStyle = 'rgb(255,0,0)';
    for (const L of spec.letters) {
      // one impression's worth of slop per letter — small, and it is the difference between
      // "set in a typeface" and "pulled off a plate"
      const kx = (r() - 0.5) * boxW * 0.012, ky = (r() - 0.5) * boxW * 0.008;
      const rot = (r() - 0.5) * 0.030;
      g.save();
      g.translate(boxX + kx, boxY + ky);
      g.rotate(rot);
      g.beginPath();
      for (const cont of L.contours) {
        for (let i = 0; i < cont.length; i++) {
          const x = (cont[i][0] - bb[0]) * sc, y = (bb[3] - cont[i][1]) * sc - hEm * sc;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath();
      }
      g.fill('evenodd');
      g.restore();
    }
    return c;
  }

  // ── shaders ───────────────────────────────────────────────────────────────────────────────

  const VS = `#version 300 es
precision highp float;
in vec2 aP;                 // -1..1 x, -1.5..1.5 y — the card's own face
uniform mat3 uRot;          // card orientation, object -> world
uniform vec3 uEye;
uniform float uFlex[5];     // the five bending modes
uniform vec2 uProj;         // focal / aspect, focal — see the note in main()
out vec2 vUv;
out vec3 vN;
out vec3 vW;
out vec2 vFace;

/* The five modes are the shapes a piece of card stock ACTUALLY takes when a thumb presses it:
 * a dish, two tilts, a saddle (the corner curl), and one higher-order ripple. Displacement and
 * its two derivatives are analytic, so the normal is exact rather than differenced — a differenced
 * normal on a 32x48 grid quantises the highlight into facets and reads as low-poly, which is the
 * default look this whole project exists to avoid. */
void flexAt(vec2 p, out float z, out float dzdx, out float dzdy) {
  float x = p.x, y = p.y / 1.5;
  float ax = 1.0 - x*x, ay = 1.0 - y*y;
  float w0 = ax*ay,          d0x = -2.0*x*ay,        d0y = -2.0*y*ax;
  float w1 = x*ay,           d1x = ay,               d1y = -2.0*y*x;
  float w2 = y*ax,           d2x = -2.0*x*y,         d2y = ax;
  float w3 = x*y,            d3x = y,                d3y = x;
  float w4 = (2.0*x*x-1.0)*ay, d4x = 4.0*x*ay,       d4y = -2.0*y*(2.0*x*x-1.0);
  z    = uFlex[0]*w0  + uFlex[1]*w1  + uFlex[2]*w2  + uFlex[3]*w3  + uFlex[4]*w4;
  dzdx = uFlex[0]*d0x + uFlex[1]*d1x + uFlex[2]*d2x + uFlex[3]*d3x + uFlex[4]*d4x;
  dzdy =(uFlex[0]*d0y + uFlex[1]*d1y + uFlex[2]*d2y + uFlex[3]*d3y + uFlex[4]*d4y) / 1.5;
}

void main(void) {
  float z, dzdx, dzdy;
  flexAt(aP, z, dzdx, dzdy);
  vec3 P = vec3(aP, z);
  vec3 N = normalize(vec3(-dzdx, -dzdy, 1.0));
  vFace = aP;
  vUv = vec2((aP.x + 1.0) * 0.5, 1.0 - (aP.y + 1.5) / 3.0);
  vN = N;
  vW = uRot * P;
  /* A LONG LENS. The eye sits well back and uProj carries focal/aspect, so the card is nearly
   * orthographic — which is what a card held at arm's length actually is, and a wide FOV on a
   * 2:3 object is most of what makes a render of a card look like a render.
   * ⚠ The first cut multiplied x and y by ONE scale and divided by a hand-rolled w. NDC is
   *   square whatever the canvas is, so a 2:3 card came out 1.5x overscanned vertically: the
   *   trim, the printer's marks and the whole name were off-frame, and because the middle of a
   *   card still looks like a card it read as a composition problem rather than a projection
   *   one. The aspect belongs in the projection, once. */
  float d = max(uEye.z - vW.z, 0.05);
  gl_Position = vec4(vW.x * uProj.x, vW.y * uProj.y, (d - 3.0) * 0.1 * d, d);
}`;

  const FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vN;
in vec3 vW;
in vec2 vFace;
out vec4 frag;

uniform sampler2D uPigA, uPigB, uPigC, uComp, uType;
uniform mat3 uRot;
uniform vec3 uEye;
uniform vec2 uReg[4];        // registration, uv — FROZEN per impression, uniform per plate
uniform vec3 uInk[4];        // ink transmittance
uniform vec4 uAng;           // screen angle per plate, radians
uniform vec4 uFilm;          // ink film per plate
uniform vec4 uPress;         // x screen freq · y roller bands · z roller phase · w starve
uniform vec4 uDmg;           // x burn · y tear · z dot gain · w edge wear
uniform vec4 uFoilP;         // x grating cycles · y thin film · z sheen · w patch cycles
uniform vec3 uKeyDir, uKeyCol, uAmb;
uniform vec2 uPar;           // x parallax gain · y type depth
uniform float uSeed;
uniform float uRegGain;      // 0 kills registration entirely — the acceptance-4 control
/* ⛔ THE CONTROL FOR ACCEPTANCE 4, AND IT EXISTS SO THE MEASUREMENT CAN PROVE IT DISCRIMINATES.
 * At 1.0 the plate offsets become RADIAL — growing with distance from centre — which is
 * chromatic aberration, a lens artefact, i.e. the exact failure the test is looking for. The
 * harness runs the same block-match over both and requires the radial build to FAIL it. An A/B
 * whose halves are indistinguishable reads as a null result, which is the most expensive kind of
 * wrong measurement; js/city-ink.js paid for that lesson once already. Off in every real path. */
uniform float uRegRadial;

const vec3 STOCK = vec3(0.905, 0.874, 0.796);      // the site's own card stock
const vec3 LUMA  = vec3(0.2126, 0.7152, 0.0722);

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

/* One cyclic palette, so the diffracted hue can walk forever and never hit a seam. Cosine form:
 * every channel is periodic in t by construction, which a gradient texture only is if somebody
 * remembered to make the ends meet. */
vec3 pal(float t) {
  return clamp(vec3(0.55, 0.47, 0.52) + vec3(0.45, 0.44, 0.48)
    * cos(6.28318530718 * (t + vec3(0.00, 0.33, 0.67))), 0.0, 1.0);
}

/* ── THE ARTWORK ─────────────────────────────────────────────────────────────────────────────
 * Composed live out of three deck cards. par is the PARALLAX offset for this view; each
 * element takes it scaled by its own depth through the card, which is what gives the picture
 * thickness. Registration is NOT applied here — it belongs to the plate, not to the picture. */
vec3 artAt(vec2 u, vec2 par) {
  vec2 uG = u + par * 0.00;
  vec2 uM = u + par * 0.30;
  vec2 uF = u + par * 0.70;
  vec2 uT = u + par * uPar.y;

  /* ⛔ THE THREE SOURCES ARE SAMPLED AT THREE DIFFERENT SCALES, and that is not a look — it is
   * the difference between a composition and a filter. The first cut took all three at roughly
   * 1:1 and the card read as ONE deck card lightly damaged: three pictures of the same kind of
   * thing at the same size average into one picture. So the ground is zoomed hard until it is a
   * FIELD rather than a picture, the mid strips arrive at a different scale and mirrored, and
   * only the figure is near card-size — cropped above the source's own name, because otherwise
   * the hero wears somebody else's title across its chest. */
  vec3 c = texture(uPigA, uG * vec2(0.30, 0.20) + vec2(0.20, 0.34)).rgb;
  vec3 mid = texture(uPigB, uM * vec2(-1.90, 1.25) + vec2(1.42, -0.16)).rgb;
  c = mix(c, mid, texture(uComp, uM).r);

  vec3 fig = texture(uPigC, (uF - vec2(0.50, 0.40)) * vec2(1.02, 0.76) + vec2(0.50, 0.34)).rgb;
  c = mix(c, fig, texture(uComp, uF).g);

  /* The trim and the marks are on the STOCK, so they take no depth — they are not floating
   * above the picture, they are the picture stopping. Only the name is carried up the stack. */
  vec4 m = texture(uComp, u);
  c = mix(c, vec3(0.930, 0.902, 0.836), clamp(m.b, 0.0, 1.0));       // raw stock: the trim
  c = mix(c, vec3(0.055, 0.048, 0.062), texture(uType, uT).r);       // the name
  c = mix(c, vec3(0.120, 0.108, 0.128), texture(uType, u).g);        // the printer's marks
  return c;
}

/* Grey-component replacement — a real four-colour separation, not a channel split. Pulling K out
 * first is why the shadows go NEUTRAL instead of muddy purple when the plates slip. */
vec4 sep(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  float k = 1.0 - max(max(c.r, c.g), c.b);
  float ik = max(1.0 - k, 1e-3);
  return vec4((1.0 - c.r - k) / ik, (1.0 - c.g - k) / ik, (1.0 - c.b - k) / ik, k);
}

/* An AM halftone: rotate into the plate's own screen angle, and a dot whose RADIUS is
 * sqrt(density) so its AREA is the density. ⚠ The moiré this produces between plates is not an
 * artefact to suppress — it is the reason real separations use 15/75/0/45 degrees, and it is
 * most of what the eye reads as "printed". */
float screenDot(vec2 u, float ang, float freq, float d) {
  float s = sin(ang), co = cos(ang);
  vec2 r = vec2(u.x * co - u.y * s, u.x * s + u.y * co) * freq;
  vec2 f = fract(r) - 0.5;
  float dist = length(f) * 2.0;
  float rad = sqrt(clamp(d, 0.0, 1.0)) * 1.128;
  float aa = max(fwidth(dist), 0.02);
  return smoothstep(rad + aa, rad - aa, dist);
}

void main(void) {
  vec3 Ng = normalize(vN);
  vec3 V = normalize((uEye - vW) * uRot);            // world -> object, see hero3d.js
  vec2 par = -V.xy / max(abs(V.z), 0.30) * uPar.x;

  /* ⚠ relief is uType.b, NOT uComp.a — the alpha channel of a generated canvas is not a data
   * channel; see the note above buildComp's return. */
  float relief = texture(uType, vUv).b;
  // Paper tooth. ⚠ Frequency, not amount: at 900 cells the grain was finer than the render's
  // own pixels and came back as a moiré screen door over the whole card — an aliasing artefact
  // that reads exactly like a bad texture.
  float tooth = h21(floor(vUv * 380.0)) * 0.055;

  /* ── the press ────────────────────────────────────────────────────────────────────────────
   * Four impressions of the same picture, each at its own registration, each screened at its own
   * angle, multiplied one after another into the paper. Subtractive: transmit only ever goes
   * DOWN, so no ink can add light and the card cannot glow. */
  float freq = uPress.x * mix(1.0, 0.42, uDmg.x);    // burn coarsens the screen until it gives up
  vec3 transmit = vec3(1.0);
  for (int p = 0; p < 4; p++) {
    vec2 u = vUv + mix(uReg[p], (vUv - 0.5) * length(uReg[p]) * 5.0, uRegRadial) * uRegGain;
    vec4 s = sep(artAt(u, par));
    float d = s[p] * uFilm[p];
    // the roller: bands ACROSS the sheet, because that is the axis the roller turns on
    float band = 1.0 + uPress.w * sin(u.y * uPress.y + uPress.z + float(p) * 0.7);
    d = clamp(d * band + uDmg.z * 0.10, 0.0, 1.0);
    float cov = screenDot(u * vec2(1.0, 1.5), uAng[p], freq, d);
    transmit *= mix(vec3(1.0), uInk[p], cov);
  }

  vec3 paper = STOCK * (1.0 - tooth);
  vec3 col = paper * transmit;

  /* ── the stock, lit ──────────────────────────────────────────────────────────────────────
   * ONE low raking key. Raking, so the relief reads: the crease, the ink sitting proud, the die
   * edge. a wrap rather than a clamped N.L because paper is not a sphere and terminates soft. */
  vec3 N = normalize(Ng + vec3(dFdx(relief), dFdy(relief), 0.0) * 4.5);
  float ndl = dot(N, normalize(uKeyDir));
  col *= uAmb + uKeyCol * clamp((ndl + 0.22) / 1.22, 0.0, 1.0);

  /* ── the tear ────────────────────────────────────────────────────────────────────────────
   * At full burn the stock is opened: the ink stops and the raw board shows, darker at the lip
   * where the fibre lifts. It is the one place the ARTWORK is absent rather than damaged. */
  float tear = smoothstep(0.60, 0.86, relief) * uDmg.y;
  col = mix(col, paper * (0.62 + 0.38 * (1.0 - tear)), tear);

  /* ── the die edge is FOIL ────────────────────────────────────────────────────────────────
   * The physics is js/hero3d.js's, deliberately: this studio has one foil, and its grating
   * phase is (L+V) projected onto the surface axes, plus a thin-film term that goes as 1/cos so
   * the hue keeps moving even when the light does not. ⛔ A rainbow gradient painted on a
   * surface is a STICKER OF foil and fails acceptance 1 — the hue has to walk with the angle. */
  /* ⚠ THE DIE EDGE IS AN EDGE. At 0.86 the foil band covered the whole trim and the card wore a
   * rainbow border — a decal, which is the exact thing acceptance 1 exists to catch. A die-cut
   * edge is the last millimetre of the card, where the knife broke through the foil layer. */
  vec2 e = abs(vFace) / vec2(1.0, 1.5);
  float edge = smoothstep(0.952, 0.982, max(e.x, e.y));
  float foilM = clamp(edge + texture(uType, vUv).r * 0.55, 0.0, 1.0) * (1.0 - uDmg.w * 0.55);
  if (foilM > 0.002) {
    vec3 T0 = normalize(vec3(1.0, 0.0, 0.0) - Ng * Ng.x);
    vec3 B0 = cross(Ng, T0);
    float ndv = clamp(dot(Ng, V), 0.0, 1.0);
    float film = uFoilP.y / max(ndv, 0.22);
    float axV = dot(T0, V) + 0.62 * dot(B0, V);
    float base = 0.35 * (1.0 - vUv.y) + uFoilP.w * relief + film + uFoilP.x * axV + uSeed;

    vec3 L = normalize(uKeyDir);
    vec3 H = normalize(L + V);
    float an = exp(-3.4 * (1.0 - dot(N, H)) / 0.30);
    float axL = dot(T0, L) + 0.62 * dot(B0, L);
    // specular off metal — NOT an additive glow. It is bounded by the sheen and by the mask.
    col += pal(base + uFoilP.x * axL) * uKeyCol * (an * uFoilP.z * foilM);
    col = mix(col, pal(base) * max(dot(col, LUMA), 0.10) / max(dot(pal(base), LUMA), 0.05),
              foilM * 0.55);
  }

  frag = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  // ── plate constants ────────────────────────────────────────────────────────────────────────
  // Process inks as TRANSMITTANCES, and the classic screen angles. 15/75/0/45 is not decoration:
  // those four are the angles that keep the rosette from collapsing into a visible pattern, and
  // yellow gets 0 because the eye is least sensitive to its moiré.
  const INK = [
    [0.06, 0.66, 0.90],   // C
    [0.90, 0.10, 0.52],   // M
    [0.98, 0.84, 0.10],   // Y
    [0.10, 0.09, 0.11],   // K
  ];
  const ANG = [15, 75, 0, 45].map(d => (d * Math.PI) / 180);

  function loadImage(url) {
    return new Promise(res => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = url;
    });
  }

  /* ⛔ THE UNIT IS AN ARGUMENT, NOT A DEFAULT — this cost a whole diagnosis. `createTexture`
   * binds nothing, but the `bindTexture` that follows it lands on WHATEVER UNIT IS CURRENTLY
   * ACTIVE. The type plate is rebuilt on every pull, long after setup, so it was binding itself
   * over unit 3 — the composition plate's slot. `uComp` then sampled the TYPE texture, and
   * because that texture also has three meaningful channels the card went on rendering: the
   * strips masked to the letterforms, the figure window to the printer's marks, and the trim to
   * the crease relief, which is exactly why two black diagonals ran across the card and the trim
   * was missing. ⚑ Nothing errored and nothing was blank — a wrong sampler binding quietly
   * paints with the wrong data, and the picture it produces is plausible enough to argue about.
   * Every texture here now names its unit, once, where it is created. */
  function texFrom(gl, src, unit, wrap) {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap || gl.CLAMP_TO_EDGE);
    return t;
  }

  function compile(gl, type, src, log) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      log.push(gl.getShaderInfoLog(s) || 'shader failed');
      return null;
    }
    return s;
  }

  /* ── build ───────────────────────────────────────────────────────────────────────────────*/
  function build(opts) {
    const o = opts || {};
    const canvas = o.canvas;
    if (!canvas) return Promise.resolve(null);

    let gl = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: false, antialias: true, depth: true,
        // ⚠ Needed to read the frame back at all. CLAUDE.md: without it `readPixels` returns a
        // cleared buffer, which looks exactly like a renderer that draws nothing.
        preserveDrawingBuffer: true,
      });
    } catch (e) { gl = null; }
    if (!gl) return Promise.resolve(null);

    const seed = (o.seed >>> 0) || 3030;
    const pool = o.pigment && o.pigment.length ? o.pigment : [];
    if (pool.length < 1) return Promise.resolve(null);
    const pig = pickPigment(seed, pool);

    return Promise.all(pig.map(loadImage)).then(imgs => {
      if (imgs.some(i => !i)) return null;                 // fails open — a card, not a hole

      const errs = [];
      const vs = compile(gl, gl.VERTEX_SHADER, VS, errs);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FS, errs);
      if (!vs || !fs) return null;
      const prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      gl.useProgram(prog);

      // ── the sheet ────────────────────────────────────────────────────────────────────────
      // 32 x 48 quads. Enough that a dish reads as a curve rather than a crease, and the normal
      // is analytic so nothing here is fighting facets.
      const NX = 32, NY = 48, verts = [], idx = [];
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
        verts.push((i / NX) * 2 - 1, (j / NY) * 3 - 1.5);
      }
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
      const aP = gl.getAttribLocation(prog, 'aP');
      gl.enableVertexAttribArray(aP);
      gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);

      // ── textures ─────────────────────────────────────────────────────────────────────────
      const UNIT = { uPigA: 0, uPigB: 1, uPigC: 2, uComp: 3, uType: 4 };
      const texA = texFrom(gl, imgs[0], UNIT.uPigA, gl.REPEAT);
      const texB = texFrom(gl, imgs[1], UNIT.uPigB, gl.REPEAT);
      const texC = texFrom(gl, imgs[2], UNIT.uPigC);
      const texComp = texFrom(gl, buildComp(seed, 512), UNIT.uComp);
      let texType = texFrom(gl, buildType(o.type, seed, 512, 0), UNIT.uType);

      const U = n => gl.getUniformLocation(prog, n);
      const u = {
        rot: U('uRot'), eye: U('uEye'), flex: U('uFlex[0]'), proj: U('uProj'),
        reg: U('uReg[0]'), ink: U('uInk[0]'), ang: U('uAng'), film: U('uFilm'),
        press: U('uPress'), dmg: U('uDmg'), foilP: U('uFoilP'),
        keyDir: U('uKeyDir'), keyCol: U('uKeyCol'), amb: U('uAmb'),
        par: U('uPar'), seed: U('uSeed'), regGain: U('uRegGain'), regRad: U('uRegRadial'),
      };
      [['uPigA', texA], ['uPigB', texB], ['uPigC', texC], ['uComp', texComp],
       ['uType', texType]].forEach(([n, t]) => {
        gl.uniform1i(U(n), UNIT[n]);
        gl.activeTexture(gl.TEXTURE0 + UNIT[n]); gl.bindTexture(gl.TEXTURE_2D, t);
      });
      gl.uniform3fv(u.ink, new Float32Array([].concat.apply([], INK)));
      gl.uniform4f(u.ang, ANG[0], ANG[1], ANG[2], ANG[3]);

      /* ── THE IMPRESSION ──────────────────────────────────────────────────────────────────
       * Everything a single pull off the press decides. Re-rolled only when the sheet advances,
       * never on a clock — see the header on why stillness won.
       * ⚑ Registration is stored ONCE, as one vector per plate, and the shader adds exactly that
       *   vector to every fragment of that plate. Acceptance 4 ("uniform per plate, not radial")
       *   is therefore structural: there is nowhere for a radius to enter. */
      const sheetState = { n: 0, reg: [], film: [1, 1, 1, 1], band: 9, phase: 0, starve: 0.05 };
      function pull(n) {
        const r = rng((seed ^ 0x85EBCA6B) + n * 2654435761);
        sheetState.n = n;
        sheetState.reg = [];
        // ⚠ Anisotropic on purpose: a sheet slips ALONG the direction it is fed, so the vertical
        // error is bigger than the horizontal one. Equal in both axes reads as a blur.
        for (let p = 0; p < 4; p++) {
          sheetState.reg.push((r() - 0.5) * 0.020, (r() - 0.5) * 0.032);
        }
        sheetState.film = [0.86 + r() * 0.30, 0.86 + r() * 0.30, 0.70 + r() * 0.34, 0.94 + r() * 0.22];
        sheetState.band = 5 + r() * 9;
        sheetState.phase = r() * TAU;
        sheetState.starve = 0.03 + r() * 0.14;
        gl.deleteTexture(texType);
        texType = texFrom(gl, buildType(o.type, seed, 512, n), UNIT.uType);
      }
      pull(0);

      // ── state ────────────────────────────────────────────────────────────────────────────
      const S = {
        flex: [0, 0, 0, 0, 0], flexV: [0, 0, 0, 0, 0],
        yaw: 0, yawV: 0, yawT: 0, pitch: 0, pitchV: 0, pitchT: 0,
        px: 0, py: 0, down: false, work: 0, lastX: 0, lastY: 0,
        burn: 0, price: 0.5, depth: 0.5, regGain: 1, regRad: 0, view: null,
      };
      // Springs. K/C chosen so release OVERSHOOTS — zeta ~0.30, which is what acceptance 3
      // measures. A critically damped spring passes "did it move" and fails "is it stock".
      const FK = 150, FC = 9.0, RK = 46, RC = 8.4;

      function pointer(x, y, down) {
        const nx = clamp(x, -1, 1), ny = clamp(y, -1, 1);
        if (down) S.work += Math.abs(nx - S.lastX) + Math.abs(ny - S.lastY);
        S.lastX = nx; S.lastY = ny;
        S.px = nx; S.py = ny; S.down = !!down;
      }

      function advance(dtMs) {
        const dt = clamp((dtMs || 0) / 1000, 0, 0.05);
        if (dt <= 0) return;

        // the thumb: a press dishes the stock under the contact and tilts it away from it
        const press = S.down ? 0.055 : 0;
        const tgt = [
          -press * (1.1 - 0.4 * Math.abs(S.px)),
          -press * S.px * 1.5,
          -press * (S.py / 1.5) * 1.5,
          press * S.px * (S.py / 1.5) * 1.2,
          press * 0.30,
        ];
        for (let i = 0; i < 5; i++) {
          const a = -FK * (S.flex[i] - tgt[i]) - FC * S.flexV[i];
          S.flexV[i] += a * dt; S.flex[i] += S.flexV[i] * dt;
        }
        // the turn follows the pointer, on its own softer spring
        S.yawT = S.px * 0.42; S.pitchT = -S.py * 0.30;
        let a = -RK * (S.yaw - S.yawT) - RC * S.yawV;
        S.yawV += a * dt; S.yaw += S.yawV * dt;
        a = -RK * (S.pitch - S.pitchT) - RC * S.pitchV;
        S.pitchV += a * dt; S.pitch += S.pitchV * dt;

        /* THE PRESS RUNS BECAUSE YOU RAN IT. Work goes in as handling; at one sheet's worth the
         * impression advances and everything about the pull is re-rolled. No wall clock is read
         * here or anywhere, which is exactly why a card nobody touches never moves. */
        if (S.work >= 6.0) { S.work = 0; pull(sheetState.n + 1); }
      }

      function render() {
        const w = canvas.width | 0, h = canvas.height | 0;
        gl.viewport(0, 0, w, h);
        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(0.043, 0.035, 0.055, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(prog);

        const yaw = S.view ? S.view[0] : S.yaw, pitch = S.view ? S.view[1] : S.pitch;
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        // column-major, Ry * Rx
        gl.uniformMatrix3fv(u.rot, false, new Float32Array([
          cy, 0, -sy,
          sy * sp, cp, cy * sp,
          sy * cp, -sp, cy * cp,
        ]));
        const D = 9.0;
        gl.uniform3f(u.eye, 0, 0, D);
        gl.uniform1fv(u.flex, new Float32Array(S.flex));
        /* Fit the 2:3 card into whatever box it was handed, on whichever axis is actually the
         * constraint. One focal, and the ASPECT is what differs between the two axes — anything
         * else is a squash wearing a projection's clothes. */
        const asp = w / h;
        const focal = (asp > 2 / 3) ? (0.96 * D / 1.5) : (0.96 * D * asp);
        gl.uniform2f(u.proj, focal / asp, focal);
        gl.uniform2fv(u.reg, new Float32Array(sheetState.reg));
        gl.uniform4f(u.film, sheetState.film[0], sheetState.film[1], sheetState.film[2], sheetState.film[3]);
        /* ⚠ THE SCREEN RULING IS THE WHOLE LEGIBILITY OF THE CARD, and the first cut had it an
         * octave too coarse: at ~118 cells across the dots WERE the picture and the artwork
         * underneath could not be read at all. A card is printed at a ruling you have to lean in
         * to see. ⚠ And 240 was an octave too FINE for the buffer — under ~3 device pixels per
         * dot the screen aliases into a moiré grid, which is a rendering failure dressed as a
         * print one. 170 is the compromise: a visible screen at 500px, a real one at 900. */
        gl.uniform4f(u.press, 170 * (1 - 0.10 * S.burn), sheetState.band, sheetState.phase, sheetState.starve + 0.20 * S.burn);
        gl.uniform4f(u.dmg, S.burn, S.burn * 0.9, S.burn * 0.5, S.burn);
        gl.uniform4f(u.foilP, 1.55, 0.30, 0.62 + 0.5 * S.price, 0.34);
        gl.uniform3f(u.keyDir, -0.62, 0.52, 0.58);
        gl.uniform3f(u.keyCol, 1.16, 1.09, 0.98);
        gl.uniform3f(u.amb, 0.30, 0.30, 0.34);
        gl.uniform2f(u.par, 0.030 + 0.020 * S.depth, 1.0);
        gl.uniform1f(u.seed, (seed % 997) / 997);
        gl.uniform1f(u.regGain, S.regGain);
        gl.uniform1f(u.regRad, S.regRad);
        gl.activeTexture(gl.TEXTURE0 + UNIT.uType); gl.bindTexture(gl.TEXTURE_2D, texType);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      }

      // ── the rAF driver, which is a CONVENIENCE and never the source of truth ─────────────
      let raf = 0, last = 0;
      function loop(on) {
        if (!on) { if (raf) cancelAnimationFrame(raf); raf = 0; return; }
        if (raf) return;
        last = 0;
        const tick = t => {
          raf = requestAnimationFrame(tick);
          if (last) advance(t - last);
          last = t;
          render();
        };
        raf = requestAnimationFrame(tick);
      }

      function pixels() {
        const w = canvas.width | 0, h = canvas.height | 0;
        // ⚠ Bind the DEFAULT framebuffer first. CLAUDE.md records an unqualified readPixels
        // returning 100% black because a render target was still bound — which reads exactly
        // like a broken renderer and is not.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return { w: w, h: h, data: px };
      }

      const ctrl = {
        version: VERSION,
        pigment: pig,
        pointer: pointer,
        advance: advance,
        render: render,
        loop: loop,
        pixels: pixels,
        setView: (yaw, pitch) => { S.view = (yaw === null) ? null : [yaw, pitch]; },
        setState: st => {
          if (!st) return;
          if (typeof st.burn === 'number') S.burn = clamp(st.burn, 0, 1);
          if (typeof st.price === 'number') S.price = clamp(st.price, 0, 1);
          if (typeof st.depth === 'number') S.depth = clamp(st.depth, 0, 1);
        },
        // acceptance-4's control: 0 prints the card in perfect register.
        // `radial` is the deliberately-WRONG build the harness must be able to reject.
        setRegistration: (g, radial) => {
          S.regGain = clamp(g, 0, 3);
          S.regRad = clamp(radial || 0, 0, 1);
        },
        pull: () => pull(sheetState.n + 1),
        probe: () => ({
          sheet: sheetState.n,
          reg: sheetState.reg.slice(),
          film: sheetState.film.slice(),
          flex: S.flex.slice(),
          flexV: S.flexV.slice(),
          maxFlex: S.flex.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
          yaw: S.yaw, pitch: S.pitch, work: S.work,
          burn: S.burn, price: S.price, depth: S.depth,
          regGain: S.regGain, regRad: S.regRad,
          pigment: pig.slice(),
        }),
        destroy: () => { loop(false); },
      };
      return ctrl;
    }).catch(() => null);
  }

  global.HeroCard = { build: build, VERSION: VERSION, INK: INK, ANG: ANG };
})(window);

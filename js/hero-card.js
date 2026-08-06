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
  /* ⚠ SIX NOW, AND EXTENDING THIS LOOP IS SAFE WHERE EXTENDING THE IMPRESSION'S WAS NOT. The
   * first three draws consume this seed's random stream in exactly the order they always did and
   * nothing else reads it afterwards, so every existing card keeps the same ground, mid and
   * figure and merely gains three more sources it can choose to print. */
  const NPIG = 6;
  function pickPigment(seed, pool) {
    const r = rng(seed ^ 0x9E3779B9), out = [], used = {};
    let guard = 0;
    while (out.length < NPIG && out.length < pool.length && guard++ < 4000) {
      const i = Math.floor(r() * pool.length);
      if (used[i]) continue;
      used[i] = 1; out.push(pool[i]);
    }
    while (out.length < NPIG) out.push(pool[out.length % Math.max(1, pool.length)] || pool[0]);
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
  /* ⛔ ROUGH AND ROTO'D, NOT FEATHERED — artist, 2026-08-05: *"remove the shitty feathered edges
   * for separation - keep it rough and roto'd."* Every mask boundary here was a radial or linear
   * GRADIENT, which is a soft alpha ramp: the layer fades out instead of ending. That is why the
   * layers read as flat pieces floating rather than as plates that were CUT — a feathered edge
   * has no cut in it, so there is nothing for depth to be a property of.
   * ⚑ A roto is traced by hand around a subject: a HARD edge that wanders. The wander is the
   *   evidence of the hand, and the hardness is what makes it a separate piece of material. Two
   *   noise terms, same reason a torn edge needs them — one slow (where the hand is going) and
   *   one fast (the tremor). Dropping the fast term gives a smooth lasso; dropping the slow one
   *   gives a vibrating circle. */
  function rotoPath(g, cx, cy, rx, ry, r, rough) {
    const N = 96, ph1 = r() * TAU, ph2 = r() * TAU, ph3 = r() * TAU;
    const k1 = 2 + Math.floor(r() * 3), k2 = 7 + Math.floor(r() * 6), k3 = 17 + Math.floor(r() * 11);
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * TAU;
      const w = 1
        + Math.sin(t * k1 + ph1) * 0.16 * rough
        + Math.sin(t * k2 + ph2) * 0.075 * rough
        + Math.sin(t * k3 + ph3) * 0.035 * rough;
      const x = cx + Math.cos(t) * rx * w, y = cy + Math.sin(t) * ry * w;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);   // straight segments: a traced cut
    }
    g.closePath();
  }

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
      g.fillStyle = 'rgb(0,255,0)';
      rotoPath(g, cx, cy, rx, ry, r, 1.0);
      g.fill();
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

  /* ── THE SECOND MASK PLATE — where the three extra sources land ──────────────────────────
   * R wash · G strip · B inset. A separate texture rather than uComp's alpha, for the reason
   * spelled out immediately below this function: a 2D canvas premultiplies, so alpha is not a
   * data channel here and never will be.
   * ⚑ SEEDED OFF A DIFFERENT CONSTANT so the extra masks do not land exactly where the first
   *   three do. Sharing uComp's stream would put the strip mask on top of the figure window on
   *   every card in the deck — six sources arranged in three places, which is the "it averages
   *   into one card" failure wearing a bigger number.
   * ⚠ Alpha stays 255. */
  function buildComp2(seed, N) {
    const c = document.createElement('canvas');
    c.width = N; c.height = Math.round(N * 1.5);
    const g = c.getContext('2d', { willReadFrequently: false });
    const W = c.width, H = c.height, r = rng(seed ^ 0x2545F491);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';

    /* R · the WASH — one soft sweep, low and wide. It is a colour field, so its mask is a
     * gradient rather than a shape: a hard-edged wash is a panel. */
    {
      const a = r() * TAU, cx = (0.2 + r() * 0.6) * W, cy = (0.2 + r() * 0.6) * H;
      /* ⚠ the wash is the widest layer, so its cut has to be the loosest — a tight roto on a
       *   field reads as a second figure. Big radii, low roughness. */
      g.fillStyle = 'rgb(210,0,0)';
      rotoPath(g, cx, cy, W * (0.62 + r() * 0.30), H * (0.55 + r() * 0.30), r, 0.55);
      g.fill();
    }

    /* G · the STRIPS — a few small torn scraps, not a band across the card. ⚠ Deliberately
     * SMALL and FEW: this channel is the one most able to bury the figure, and a scrap that
     * covers a third of the card is a second ground rather than a collage element. */
    {
      const n = 2 + Math.floor(r() * 3);
      for (let s = 0; s < n; s++) {
        const w = (0.10 + r() * 0.16) * W, h = (0.05 + r() * 0.13) * H;
        const x = r() * (W - w), y = r() * (H - h);
        g.save();
        g.translate(x + w / 2, y + h / 2); g.rotate((r() - 0.5) * 0.7);
        g.fillStyle = 'rgb(0,' + (150 + Math.floor(r() * 90)) + ',0)';
        g.fillRect(-w / 2, -h / 2, w, h);
        g.restore();
      }
    }

    /* B · the INSET — one small soft pocket, held away from the middle so it reads as a second
     * element beside the figure rather than a smear over it. */
    {
      const cx = (0.18 + r() * 0.30 + (r() < 0.5 ? 0 : 0.34)) * W;
      const cy = (0.52 + r() * 0.30) * H;
      const rad = (0.13 + r() * 0.09) * W;
      g.fillStyle = 'rgb(0,0,235)';
      rotoPath(g, cx, cy, rad, rad * (0.82 + r() * 0.5), r, 1.25);
      g.fill();
    }
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
  /* Compose a line from the alphabet: advance widths accumulated, contours offset. Returns a
   * spec in exactly the shape a baked word has, so nothing downstream knows which route it came. */
  function setLine(spec, name) {
    if (!spec || !spec.glyphs) return spec;                 // already a baked word (or nothing)
    const txt = String(name || '').toUpperCase();
    const letters = [];
    let pen = 0;
    for (const ch of txt) {
      const g = spec.glyphs[ch] || spec.glyphs[' '];
      if (!g) continue;
      if (g.contours.length) {
        letters.push({
          ch: ch, adv: g.adv, x: pen,
          contours: g.contours.map(c => c.map(pt => [pt[0] + pen, pt[1]])),
        });
      }
      pen += g.adv;
    }
    if (!letters.length) return null;
    const xs = [], ys = [];
    for (const L of letters) for (const c of L.contours) for (const pt of c) { xs.push(pt[0]); ys.push(pt[1]); }
    return { letters: letters, advance: pen,
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  }

  /* ── THE FRAME IS SET FROM TYPE ───────────────────────────────────────────────────────────
   * Artist, 2026-08-04: *"lets do cool different frames for each card with ascii patterns etc"*
   * and *"separate frames by card rarity type."*
   *
   * ⚑ THIS IS NOT A DECORATION BOLTED ON — it is how borders were actually made. A printer sets a
   *   rule from repeated pieces of TYPE: border sorts, printers' flowers, a run of the same sort
   *   locked in the chase. So the frame comes out of the SAME FOUNT as the name, drawn from the
   *   same committed outlines, which is why it belongs to this card rather than sitting on it.
   *   It is also, straightforwardly, ASCII art — the two traditions are the same idea a century
   *   apart, and this project's whole register lives in that overlap.
   * ⛔ RARITY PICKS THE FAMILY, THE SEED PICKS THE FRAME. A collector reads the tier off the edge
   *   without being told, and no two cards share a border. Quiet rules at the bottom, dense
   *   compound sorts at the top. */
  const SORTS = {
    common:    [['-'], ['.'], [':'], ['. '], ['-.']],
    uncommon:  [['+'], ['='], ['|'], ['+-'], ['=.']],
    rare:      [['/', '\\'], ['<', '>'], ['^'], ['/', '.'], ['~']],
    epic:      [['#'], ['*'], ['%'], ['#.'], ['*+']],
    legendary: [['@'], ['&'], ['$'], ['@.'], ['&+']],
    mythic:    [['#', '@'], ['%', '@'], ['@', '#', '%'], ['$', '@'], ['#', '%', '#']],
  };
  /* ⛔ AND "GLOW" IS FOIL, NOT LIGHT. The brief bans an emissive glitch outright — a glow makes it
   * a SCREEN and this is a card. What a rare card actually does is carry more FOIL: the border
   * stops being ink and becomes metal, so it is dark until you turn it and then it flares. That is
   * a glow you can hold, it escalates cleanly, and it costs nothing but a mask. */
  const FOIL_BY_RARITY = { common: 0.0, uncommon: 0.10, rare: 0.30, epic: 0.55, legendary: 0.80,
    mythic: 1.0, prizm: 1.0, marquee: 1.0 };

  /* ── THE EIGHT MOTIONS ───────────────────────────────────────────────────────────────────
   * Each is a pure function of phase (0..1) returning the drivers, and each is a named press
   * phenomenon rather than an effect. ⛔ EVERY ONE MUST BE PERIODIC IN PHASE WITH PERIOD 1, and
   * built from cos/sin of TAU*phase so the derivative matches at the wrap too — a loop that is
   * merely equal at its ends still flinches once a revolution, and `npm run test:hero` measures
   * the step ACROSS the seam against an identical step mid-cycle to catch exactly that.
   *
   * `lead` staggers the four elements through the card's thickness. ⚠ Lockstep is a global zoom,
   * which passes "did it move" and is not depth — that is asserted separately.
   */
  const c1 = p => (1 - Math.cos(TAU * p)) * 0.5;        // 0 at the wrap, 1 at half — smooth both ends
  /* ⛔ EACH MOTION OWNS A DIFFERENT AXIS — artist, 2026-08-05: *"the motion needs to be more
   * distinct for each one."* He is right and the table said why: `roller`, `flutter` and
   * `dry-down` were all THE SAME CHANNEL, an ink multiplier oscillating, differing only in range
   * and rate — 0.82..1.16, 0.85..1.05, 0.74..1.14. Three of eight named press failures rendered
   * as "the card gets a bit lighter, a bit faster or a bit slower", which is one motion with
   * three names. And `slur`, the only one that moved the sheet SIDEWAYS, did it by 1.1% of the
   * card, i.e. under a millimetre at card size.
   * ⚑ THERE ARE FIVE VISIBLE AXES HERE AND THEY WERE NOT BEING SPENT: ink density (x), lateral
   *   slip (y), the ghost strike (z), the write-on front (w), and the z-ripple amplitude that
   *   `amp` drives through the stack. Every motion now leads on a DIFFERENT one and is pushed far
   *   enough to read, and the ones that share an axis differ in SHAPE — a spike is not a swell.
   * ⚠ Amplitude is not the whole of it: `sharp` and `dwell` below make two motions on the same
   *   channel read differently even at the same range, which is what stops this becoming eight
   *   sine waves again. */
  const sharp = p => Math.pow(c1(p), 3.2);              // a snap: flat, then a sudden landing
  const dwell = p => Math.pow(c1(p), 0.42);             // a swell that sits at the top
  const MOTIONS = [
    /* THE BEAT — everything snaps flat once a cycle. Leads on the STACK (amp), with a hard ink
     * spike exactly at the landing, so the whole card resolves in one frame and drifts apart. */
    { key: 'impression',
      lead: [0.00, 0.62, 0.28, 0.45], amp: 1.75,
      mot: p => [0.90 + 0.28 * sharp(p), 0, 0, 1] },
    /* THE ROLLER — ink density, swung hard and held. Over-inks to solid, then runs dry. */
    { key: 'roller',
      lead: [0.00, 0.35, 0.70, 0.15], amp: 0.30,
      mot: p => [0.52 + 0.86 * dwell(p), 0, 0, 1] },
    /* THE SLUR — the sheet moves under the blanket. Leads on LATERAL SLIP, and at 1.1% nobody
     * could see it; 4.4% is a smear you can read across the card. */
    { key: 'slur',
      lead: [0.00, 0.20, 0.55, 0.80], amp: 0.25,
      mot: p => [1, 0.044 * Math.sin(TAU * p), 0, 1] },
    /* THE BOUNCE — the cylinder strikes twice. Leads on the GHOST, and the ghost gets its own
     * small counter-slip so the second impression is visibly beside the first, not on top. */
    { key: 'doubling',
      lead: [0.00, 0.50, 0.25, 0.75], amp: 0.22,
      mot: p => [1, -0.012 * sharp(p), 0.35 + 0.65 * dwell(p), 1] },
    /* THE FLUTTER — web tension. Leads on the STACK at DOUBLE RATE with the ink held still, so
     * it is unmistakably a ripple through the card rather than a change of inking. */
    { key: 'flutter',
      lead: [0.00, 0.12, 0.24, 0.36], amp: 2.20,
      mot: p => [1, 0.008 * Math.sin(TAU * 3 * p), 0, 1] },
    /* THE DRY-DOWN — the film sinks into the stock. Same channel as the roller and deliberately
     * the opposite SHAPE: a slow deep sink that lingers at the bottom instead of the top. */
    { key: 'dry-down',
      lead: [0.00, 0.44, 0.88, 0.22], amp: 0.12,
      mot: p => [1.18 - 0.66 * dwell(p), 0, 0, 1] },
    /* THE MAKEREADY — everything wrong at once. The only motion that spends FOUR axes together,
     * which is what makes "the operator is still getting it right" legible as a state. */
    { key: 'makeready',
      lead: [0.00, 0.66, 0.33, 0.90], amp: 1.05,
      mot: p => [0.72 + 0.46 * c1(p), 0.026 * Math.sin(TAU * 2 * p), 0.55 * sharp(p), 1] },
    /* ⛔ THE ONE THAT WRITES ITSELF ON, and it is the only motion whose loop is a REPRINT: the
     * sheet feeds through, the impression lands top to bottom, the card sits finished for most of
     * the cycle, and then the next sheet starts. So `w` rests at 1 and dips — a card you catch
     * mid-print is the exception, not the state. */
    { key: 'feed',
      lead: [0.00, 0.30, 0.60, 0.90], amp: 0.65,
      mot: p => [1, 0, 0, Math.min(1, 0.12 + 1.35 * Math.pow(c1(p), 0.55))] },
  ];
  /* Which motion a card has is part of the card, like its pigment and its border: derived from the
   * seed, never stored, so a card cannot drift away from its own animation. */
  const motionFor = seed => MOTIONS[Math.floor(rng(seed ^ 0x5F356495)() * MOTIONS.length)];
  /* ⚠ AND IT CAN BE NAMED. `{motion:'impression'}` forces one — for a harness that needs to
   * measure a specific claim (the z-signature belongs to the impression; a SLUR is a sideways
   * smear and correctly has none), and for looking at the family without hunting for a seed that
   * happens to have the one you want. Unset is the honest default: the card decides. */
  const byKey = k => MOTIONS.filter(m => m.key === k)[0];

  function fillGlyph(g, contours, x, y, sc) {
    if (!contours || !contours.length) return;
    g.beginPath();
    for (const c of contours) {
      for (let i = 0; i < c.length; i++) {
        const px = x + c[i][0] * sc, py = y - c[i][1] * sc;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
    }
    g.fill('evenodd');
  }

  /* Run one motif all the way round the trim. ⚠ The count is derived from the SIDE LENGTH and
   * rounded, then the cell is recomputed from it — set the cell first and the last sort on each
   * side lands short of the corner, which is the one thing a border must never do. */
  function drawBorder(g, alpha, r, W, H, m, rarity) {
    if (!alpha || !alpha.glyphs) return;
    const fam = SORTS[rarity] || SORTS.common;
    const motif = fam[Math.floor(r() * fam.length)];
    /* ⚠ THE BORDER HAS TO FIT IN THE TRIM, and the first cut did not: a sort at 21 px with a
     * second pass 18 px inside it ran to 45 px on a 32 px band, so the frame climbed over the
     * window and ate the artwork. Every number below is a fraction of the trim width `m`, and the
     * inner pass is placed so its far edge still lands short of it. */
    const cell = m * (0.26 + r() * 0.10);
    const inset = m * (0.30 + r() * 0.06);
    const sc = cell * (1.15 + r() * 0.25);
    const dbl = r() < 0.34;                    // some cards get a second, inner run

    const run = (x0, y0, dx, dy, len, rot) => {
      const k = Math.max(2, Math.round(len / cell));
      const step = len / k;
      for (let i = 0; i < k; i++) {
        const ch = motif[i % motif.length];
        const gl = alpha.glyphs[ch];
        if (!gl || !gl.contours.length) continue;
        const x = x0 + dx * (i + 0.5) * step, y = y0 + dy * (i + 0.5) * step;
        g.save();
        g.translate(x, y);
        if (rot) g.rotate(rot);
        fillGlyph(g, gl.contours, -gl.adv * sc * 0.5, sc * 0.22, sc);
        g.restore();
      }
    };
    for (let pass = 0; pass < (dbl ? 2 : 1); pass++) {
      const o = inset + pass * cell * 1.15;
      run(o, o, 1, 0, W - 2 * o, 0);                       // top
      run(o, H - o, 1, 0, W - 2 * o, 0);                   // bottom
      run(o, o, 0, 1, H - 2 * o, Math.PI / 2);             // left
      run(W - o, o, 0, 1, H - 2 * o, Math.PI / 2);         // right
    }
  }

  function buildType(spec, seed, N, sheet, name, rarity, sub, marks) {
    const c = document.createElement('canvas');
    c.width = N; c.height = Math.round(N * 1.5);
    const g = c.getContext('2d');
    const W = c.width, H = c.height, m = Math.round(W * 0.062), win = WINDOW(W, H, m);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const rc = rng((seed ^ 0x27D4EB2F) + sheet * 104729);
    drawCreases(g, W, H, rc);                                // B

    /* ── G · the trim marks ──────────────────────────────────────────────────────────────
     * ⛔ OFF BY DEFAULT — artist, 2026-08-05: *"why do all the cards have this registration
     * marking over them diminishing their quality? I turn them to zero and they are still
     * there."* They are still there because they are NOT the registration dial: that dial offsets
     * the ink plates, while these are printed MARKS — four crop targets and a colour bar struck
     * into the trim. Two different things a page called "registration" in two places, and only
     * one of them had a control.
     * ⚑ They belong to a PLATE PROOF, which is a sheet a printer pulls to check a job — not to a
     *   finished card. On the hundred they are furniture from the wrong stage of the process, so
     *   the default is off and wanting them is the thing you say.
     * ⚠ The window hairline and the border sorts are NOT marks and are never gated: those are the
     *   card's frame, and the rarity tier is read off them. */
    if (marks) {
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
    }
    g.strokeStyle = 'rgb(0,255,0)'; g.fillStyle = 'rgb(0,255,0)';
    g.lineWidth = Math.max(1, W * 0.0028);
    g.strokeRect(win.x, win.y, win.w, win.h);                // the window's own hairline
    drawBorder(g, spec, rng(seed ^ 0x1B873593), W, H, m, rarity);

    // ── R · the name ──────────────────────────────────────────────────────────────────────
    /* Two ways in, and the second is the one that matters. A BAKED spec is one word, built by
     * `build-card-type.py "SOME NAME"`. An ALPHABET plus a string is 53 glyphs and their advance
     * widths, set here — so renaming a card is a string edit with no rebuild and still no font.
     * ⚠ 67 field cards would otherwise mean 67 baked words, and a placeholder name that costs a
     *   build step to change is a placeholder that becomes permanent by friction. */
    /* ⚑ THE FOUNT IS KEPT, and this is not tidiness — it is the bug. `setLine` CONSUMES an
     * alphabet into a laid line: hand it a line and it returns that line back unchanged, because
     * a laid line has no `.glyphs`. When there was only ever one line, `spec = setLine(spec,…)`
     * was harmless. The moment a SECOND line exists, setting it from the overwritten `spec`
     * returns the FIRST line again — so the card would print its name twice, at two sizes, and
     * nothing would error. Two names is a plausible-looking card, which is the expensive kind. */
    const fount = spec;
    const nameL = setLine(fount, name);
    const subL = sub ? setLine(fount, sub) : null;
    if (!nameL || !nameL.letters || !nameL.letters.length) return c;
    const r = rng((seed ^ 0x2545F491) + sheet * 7919);
    /* Set on the band of raw stock BELOW the art window — where a card puts its name, and the
     * only place on a dark composition where heavy black type is legible at all. Sizes are
     * derived from the band so type can never grow out of it, and the width caps a long name. */
    const bandH = H - m - win.bottom;

    /* One impression's worth of slop PER LETTER — small, and it is the difference between "set in
     * a typeface" and "pulled off a plate". Both lines go through it, so they came off the same
     * pull rather than looking like two separate print jobs. */
    function impress(line, capFrac, midY) {
      const bb = line.bbox;
      const wEm = Math.max(1e-3, bb[2] - bb[0]), hEm = Math.max(1e-3, bb[3] - bb[1]);
      const sc = Math.min((W - m * 2.6) / wEm, (bandH * capFrac) / hEm);
      const boxW = wEm * sc, boxX = (W - boxW) / 2, boxY = midY + hEm * sc / 2;
      for (const L of line.letters) {
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
    }

    g.fillStyle = 'rgb(255,0,0)';
    /* ⛔ A SECOND LINE IS SUBORDINATE BY CONSTRUCTION. Two lines at the same size are not "two
     * lines", they are a different card — the eye has nowhere to land first. The name keeps the
     * lion's share of the band and the second line is set at roughly a third of it, which is
     * where a subtitle sits on a real card.
     * ⚠ The no-subtitle path is byte-for-byte the old one — same cap fraction, same centre, and
     *   the same rng draws in the same order — so every card already pulled still prints
     *   identically. A text feature that quietly re-rolls the existing deck is not a feature. */
    if (subL) {
      impress(nameL, 0.44, win.bottom + bandH * 0.34);
      impress(subL, 0.20, win.bottom + bandH * 0.73);
    } else {
      impress(nameL, 0.62, win.bottom + bandH * 0.5);
    }
    return c;
  }

  /* ── THE STOCK ITSELF ────────────────────────────────────────────────────────────────────
   * A tiling PBR texture for the card board: RG = the fibre normal, B = a roughness jitter.
   *
   * ⚑ IT IS FIBRES, NOT NOISE, AND THAT IS THE WHOLE POINT. A hash gives you grain with no
   *   DIRECTION, and paper's tooth is directional — pulp fibres lie down in the machine
   *   direction and catch a raking light as short streaks, which is why a hash reads as digital
   *   noise however carefully it is tuned and why a scanned paper texture always looks better
   *   than a procedural one. Short strokes at a biased angle cost the same and read as paper.
   * ⚠ It has to TILE, so every stroke is drawn nine times, wrapped. A seam on card stock is the
   *   one artefact nobody would forgive, because it is a straight line on a surface that has none.
   * ⚠ Alpha stays 255 — see the note under buildComp. This function writes through
   *   getImageData/putImageData and would wipe its own colour channels otherwise. */
  /* ── ⛔ THE BACK OF THE CARD ────────────────────────────────────────────────────────────────
   * Artist, 2026-08-05: *"each card should have a back too."*
   *
   * ⚑ A CARD IS TWO-SIDED OR IT IS A PICTURE. That is this project's own first principle about the
   *   form — *"a size before it is anything else… two sides: a front that shows, a back that
   *   tells"* — and the press has been rendering one side of it. Turned round, the card showed its
   *   own front mirrored, which is the tell that there was no object there at all.
   *
   * ⛔ THE BACK IS PRINTED ON THE SAME SHEET, NOT PASTED ON. It is the same stock, the same fibre,
   *   the same die-cut foil edge and the same light — only the plate differs. That is why it is a
   *   generated plate sampled by the same shader rather than a second texture composited by a
   *   second path: a back that came from somewhere else would not weather, crease or catch the
   *   light the way the front does, and the two sides would read as different materials.
   * ⚠ ONE INK. A real card back is a single plate — one colour on stock — which is why it does
   *   NOT go through the four-ink separation. Running it through would give the back a moiré and
   *   a misregistration it never had, and misregistration is a property of a four-colour pull.
   *
   * ⚑ WHAT IT SAYS: the studio, the card's number out of the hundred, its title, the tier it was
   *   struck in, and a rule of border sorts from the same fount as the front. The number is the
   *   point — a back is where a card tells you what it is inside a set.
   */
  function buildBack(seed, N, name, number, rarity, sub) {
    const c = document.createElement('canvas');
    c.width = N; c.height = Math.round(N * 1.5);
    const g = c.getContext('2d');
    const W = c.width, H = c.height, m = Math.round(W * 0.062);
    const r = rng(seed ^ 0x3C6EF372);

    /* ⛔ BLACK IS "NO INK", NOT "BLACK INK". The shader multiplies this plate INTO the paper, so
     *   the channel is COVERAGE: 0 leaves bare stock, 1 lays the ink down full. Filling this
     *   canvas with white would print a solid slab and hide the card. */
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgb(255,255,255)'; g.strokeStyle = 'rgb(255,255,255)';

    // the field — a flat tint over the whole back, the way a card back is one colour on stock
    g.globalAlpha = 0.30; g.fillRect(m * 0.55, m * 0.55, W - m * 1.1, H - m * 1.1);
    g.globalAlpha = 1;

    // a double rule inside the trim
    g.lineWidth = Math.max(1, W * 0.010);
    g.strokeRect(m * 0.92, m * 0.92, W - m * 1.84, H - m * 1.84);
    g.lineWidth = Math.max(1, W * 0.004);
    g.strokeRect(m * 1.28, m * 1.28, W - m * 2.56, H - m * 2.56);

    /* the roundel — concentric rules and a ring of ticks. Drawn rather than fetched: an <img>
     * here would make the plate wait on a network the rest of the press never touches. */
    const cx = W / 2, cy = H * 0.40, R = W * 0.26;
    g.lineWidth = Math.max(1, W * 0.008);
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.lineWidth = Math.max(1, W * 0.003);
    g.beginPath(); g.arc(cx, cy, R * 0.82, 0, TAU); g.stroke();
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * TAU, i0 = R * 0.86, i1 = R * (i % 3 === 0 ? 0.96 : 0.92);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * i0, cy + Math.sin(a) * i0);
      g.lineTo(cx + Math.cos(a) * i1, cy + Math.sin(a) * i1);
      g.stroke();
    }
    /* ⛔ NO TYPE ON THE STAND-IN, AND `npm run test:name` IS RIGHT TO INSIST.
     *   This renderer names NO FONT — the front's words are set from 68 committed outlines, so a
     *   card renders identically on a machine with none installed. I set the number and the
     *   studio here with `Arial Black`, which does not exist on Linux or Android: every one of
     *   those machines would have silently substituted something else, and the stand-in back
     *   would look different per platform while the front stayed exact.
     * ⚑ So the stand-in carries NO WORDS AT ALL — stock, rules, and the roundel's geometry. That
     *   is honest rather than a compromise: this back only appears on a card that has no designed
     *   back yet, and an unprinted reverse is a real thing. The moment `js/card-back.js` finds the
     *   card's page, the DESIGNED back replaces this outright.
     * ⚠ If words are ever wanted here, they go through the outline fount `buildType` already
     *   uses. They do not come back as canvas text. */
    // a target ring where the number will be struck, so the plate reads as unfinished, not empty
    g.lineWidth = Math.max(1, W * 0.006);
    g.beginPath(); g.arc(cx, cy, R * 0.44, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(cx - R * 0.20, cy); g.lineTo(cx + R * 0.20, cy);
    g.moveTo(cx, cy - R * 0.20); g.lineTo(cx, cy + R * 0.20); g.stroke();

    // three ruled lines where the studio, the title and the tier are set on a finished back
    g.lineWidth = Math.max(1, W * 0.004);
    [0.665, 0.735, 0.788].forEach(function (y, i) {
      const half = W * (i === 0 ? 0.30 : i === 1 ? 0.24 : 0.17);
      g.beginPath(); g.moveTo(cx - half, H * y); g.lineTo(cx + half, H * y); g.stroke();
    });

    // a rule of border sorts along the foot, out of the same fount as the front
    drawBorder(g, null, rng(seed ^ 0x1B873593), W, H, m, rarity);

    g.globalCompositeOperation = 'source-over';
    return c;
  }

  function buildStock(seed, N) {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const r = rng(seed ^ 0x7F4A7C15);
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, N, N);
    g.lineCap = 'round';
    const strokes = Math.round(N * 5.2);
    for (let i = 0; i < strokes; i++) {
      // biased toward the machine direction, but never all the way — pulp is not combed
      const a = (r() < 0.72 ? 0 : Math.PI / 2) + (r() - 0.5) * 1.5;
      const len = N * (0.006 + r() * 0.030), w = N * (0.0018 + r() * 0.0055);
      const v = r() < 0.5 ? 128 - Math.round(r() * 52) : 128 + Math.round(r() * 52);
      const x = r() * N, y = r() * N;
      g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.5)';
      g.lineWidth = w;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        g.beginPath();
        g.moveTo(x + ox * N - Math.cos(a) * len, y + oy * N - Math.sin(a) * len);
        g.lineTo(x + ox * N + Math.cos(a) * len, y + oy * N + Math.sin(a) * len);
        g.stroke();
      }
    }
    // height -> normal. Sobel, wrapped, so the normal tiles as cleanly as the height did.
    const img = g.getImageData(0, 0, N, N), d = img.data;
    const h = new Float32Array(N * N);
    for (let i = 0, k = 0; i < d.length; i += 4, k++) h[k] = d[i] / 255;
    const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
    const out = g.createImageData(N, N), o = out.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const k = (y * N + x) * 4;
      o[k]     = Math.round(clamp(-gx * 0.5 + 0.5, 0, 1) * 255);
      o[k + 1] = Math.round(clamp(-gy * 0.5 + 0.5, 0, 1) * 255);
      o[k + 2] = Math.round(clamp(at(x, y), 0, 1) * 255);   // roughness jitter, from height
      o[k + 3] = 255;                                        // ⛔ never 0. See buildComp.
    }
    g.putImageData(out, 0, 0);
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

uniform sampler2D uPigA, uPigB, uPigC, uComp, uType, uStock;
/* the second three sources and their own mask plate — only sampled when uNPig is 6 */
uniform sampler2D uPigD, uPigE, uPigF, uComp2;
/* ── the hand-drawn loops. One sheet, cells laid out in a grid; uSprite carries where we are. */
uniform sampler2D uSpriteTex;
uniform vec4 uSprite;        // x cols · y rows · z frame index · w how many are struck (0 = none)
uniform vec4 uSpriteP[4];    // per sprite: xy centre (uv) · z scale · w rotation
uniform int uNPig;           // 3 = ground/mid/figure · 6 = + wash, strip, inset
uniform float uFrame;        // 1 = trim + border sorts · 0 = FRAMELESS, artwork to the die edge
uniform float uScreen;       // 1 = halftone dots · 0 = continuous tone, no stipple
uniform mat3 uRot;
uniform vec3 uEye;
/* ⛔ SIX PLATES, NOT FOUR — artist, 2026-08-05: *"i need my plate separator to have up to 6
 * plates … a toggle that just creates the card with 6 plates as before."* C M Y K, plus ORANGE
 * and GREEN on their own screens at their own registrations. uNInk is 4 or 6 and nothing else.
 * ⚠ NO BACKTICKS IN HERE. This is inside a JS template literal, so one backtick ends the shader
 *   source, CardHero never defines and the page falls open with no card and no error. Recorded
 *   four times in CLAUDE.md before this comment was written, and it still caught this edit. */
uniform vec2 uReg[6];        // registration, uv — FROZEN per impression, uniform per plate
uniform vec3 uInk[6];        // ink transmittance
uniform float uAng[6];       // screen angle per plate, radians
uniform float uFilm[6];      // ink film per plate
uniform int uNInk;           // 4 = process, 6 = process + two spot inks
uniform float uSplit;        // how much load the spot inks take off the process inks
uniform vec4 uPress;         // x screen freq · y roller bands · z roller phase · w starve
uniform vec4 uDmg;           // x burn · y tear · z dot gain · w edge wear
uniform vec4 uFoilP;         // x grating cycles · y thin film · z sheen · w patch cycles
uniform vec2 uPar;           // x parallax gain · y how hard lifted layers shade below
/* ⛔ THE LOOP LIVES IN Z — artist, 2026-08-04: "have the animations live in z space and be
 * looping." Four depths through the card's thickness, one per element of the composition, and the
 * press cycle drives them. THIS SUPERSEDES the stillness decision recorded in §3 of the brief: I
 * argued an ambient cycle is a screensaver and the artist has decided otherwise — but WHERE he put
 * it is what saves the argument. Nothing slides across the picture plane. The stack travels
 * THROUGH the card and once per revolution it lands flat and the print resolves, which is a beat
 * rather than a drift, and it is what a press actually does.
 * ⚑ Z IS A SCALE, NOT AN OFFSET. Moving something along the view axis at zero eccentricity does
 *   not move it sideways — it makes it BIGGER. So depth here is a magnification about the frame
 *   centre, which is also why its displacement field GROWS WITH RADIUS: the exact mirror image of
 *   registration, which must be uniform and radius-free. The same block matcher measures both and
 *   the two answers are opposite. */
/* ⛔ SEVEN DEPTHS, ONE PER LAYER — artist, 2026-08-05, pointing at cards/lens3d.html?hero=42:
 * *"like this … we successfully separated 6 cards or so before, just import that back in there."*
 * That page is the LAYERED card (js/card-layers.js): every plate authored separately, each at its
 * own z, sliding against the others as it turns. This press had only FOUR element depths —
 * ground, mid, figure, type — so at six sources three of them shared a plane with the first three
 * and could not separate from them however far LAYERS was pushed. Six pictures, three planes.
 * ⚑ Now every source owns a plane, which is what "layered" has meant on this project all along. */
uniform float uElemZ[7];     // ground · mid · figure · wash · strip · inset · type
uniform sampler2D uBack;     // the reverse
uniform float uBackRGB;      // 1 = a DESIGNED back (full colour) · 0 = the generated stand-in
uniform float uFrameFoil;    // how much of the border is METAL rather than ink — rarity
/* ⛔ ONE MOTION IS NOT A SET — artist, 2026-08-05: "that is one out of many different animations
 * we can have… every card can have animation, but they should be different each one, with details
 * that are particular to the card and the border too."
 * ⚑ EVERY MOTION IS A REAL THING THAT HAPPENS ON A PRESS, which is the constraint that stops eight
 *   animations becoming eight effects. The card is not being animated; it is being PRINTED, badly,
 *   in eight different ways. And all of them still live in Z and still close exactly — those two
 *   properties belong to the CARD, not to the motion, so they are measured once and hold for all.
 *     x  ink gain    the roller carrying too much, or running dry
 *     y  sheet slip  the paper moving under the blanket while the ink is wet — SLUR
 *     z  ghost       the plate striking twice, a hair apart — DOUBLING
 *     w  write-on    how much of the impression has landed; 1 is a finished sheet */
uniform vec4 uMot;
uniform float uSeed;
uniform float uRegGain;      // 0 kills registration entirely — the acceptance-4 control
/* ⛔ THE CONTROL FOR ACCEPTANCE 4, AND IT EXISTS SO THE MEASUREMENT CAN PROVE IT DISCRIMINATES.
 * At 1.0 the plate offsets become RADIAL — growing with distance from centre — which is
 * chromatic aberration, a lens artefact, i.e. the exact failure the test is looking for. The
 * harness runs the same block-match over both and requires the radial build to FAIL it. An A/B
 * whose halves are indistinguishable reads as a null result, which is the most expensive kind of
 * wrong measurement; js/city-ink.js paid for that lesson once already. Off in every real path. */
uniform float uRegRadial;

/* ── THE MATERIAL ────────────────────────────────────────────────────────────────────────────
 * ⛔ LIGHTS AND THE ENVIRONMENT ARE IN WORLD SPACE. They used to be handed straight to an
 *   object-space normal, which means the key light TURNED WITH THE CARD — so the highlight sat
 *   in the same place however you moved it, and the surface read as printed-on shading rather
 *   than as a lit object. Everything below converts a world direction into object space with
 *   (d * uRot), which is uRot's transpose applied to d, i.e. world -> object for free. */
uniform vec3 uKeyDir, uKeyCol;
uniform vec3 uFillDir, uFillCol;
uniform vec3 uRimDir, uRimCol;
uniform vec4 uRough;         // x stock · y ink film · z foil · w varnish (how coated the window is)
uniform vec4 uRelief;        // x paper fibre · y ink height · z crease · w halftone dome
uniform vec2 uTile;          // stock-texture tiling
/* ⛔ THE ENVIRONMENT SWITCH, AND IT GUARDS THIS REPO'S MOST EXPENSIVE RECORDED MISTAKE. Giving a
 * card an environment map is right for METAL and wrong for ARTWORK: a standard material samples
 * the environment for ambient specular too, and on the art plate that lands as a broad milky
 * sheen — measured in js/card3d.js as lifted blacks and lost saturation, and in the CSS .glare
 * before that. Here the environment is reachable ONLY through the metallic term, so the ink can
 * never pick it up. npm run test:hero asserts exactly that: switch this off and the artwork must
 * come back BYTE-IDENTICAL while the foil changes. */
uniform float uEnvOn;

const vec3 STOCK = vec3(0.905, 0.874, 0.796);      // the site's own card stock
const vec3 LUMA  = vec3(0.2126, 0.7152, 0.0722);
const float PI = 3.14159265359;

/* One cyclic palette, so the diffracted hue can walk forever and never hit a seam. Cosine form:
 * every channel is periodic in t by construction, which a gradient texture only is if somebody
 * remembered to make the ends meet. */
vec3 pal(float t) {
  return clamp(vec3(0.55, 0.47, 0.52) + vec3(0.45, 0.44, 0.48)
    * cos(6.28318530718 * (t + vec3(0.00, 0.33, 0.67))), 0.0, 1.0);
}

/* ── THE ROOM, ANALYTICALLY ──────────────────────────────────────────────────────────────────
 * No cubemap, no HDRI, no second request — a card in the media slot has to load cold from one
 * origin, and an equirect costs more than the whole renderer. A studio is not complicated: a
 * cool wash overhead, a warm bounce off the table, one big softbox up-left where the key is, and
 * a cooler window to the right. rough widens both sources, which is the only part of an IBL
 * that matters on a surface this glossy — a mirror sees the softbox as a hard rectangle, a
 * brushed foil sees it as a smear, and that difference IS the material. */
vec3 envAt(vec3 d, float rough) {
  float up = d.y * 0.5 + 0.5;
  vec3 room = mix(vec3(0.105, 0.088, 0.076), vec3(0.30, 0.315, 0.365), smoothstep(0.12, 0.95, up));
  float r2 = clamp(rough * rough, 0.002, 1.0);
  vec3 box = uKeyCol * 0.80 * pow(max(dot(d, normalize(uKeyDir)), 0.0), mix(700.0, 2.2, r2));
  vec3 win = vec3(0.40, 0.48, 0.66) * pow(max(dot(d, normalize(vec3(0.86, 0.16, 0.48))), 0.0),
                                          mix(180.0, 2.0, r2));
  return room + box + win;
}

// ── Cook-Torrance, the standard parts, named so they can be checked against a reference ──────
float D_GGX(float ndh, float tdh, float bdh, float ax, float ay) {
  float d = tdh * tdh / (ax * ax) + bdh * bdh / (ay * ay) + ndh * ndh;
  return 1.0 / (PI * ax * ay * d * d + 1e-7);
}
float V_Smith(float ndv, float ndl, float a) {       // height-correlated, Heitz
  float a2 = a * a;
  float gv = ndl * sqrt(ndv * ndv * (1.0 - a2) + a2);
  float gl = ndv * sqrt(ndl * ndl * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
vec3 F_Schlick(vec3 f0, float u) { return f0 + (1.0 - f0) * pow(1.0 - u, 5.0); }

/* ── THE ARTWORK ─────────────────────────────────────────────────────────────────────────────
 * Composed live out of three deck cards. par is the PARALLAX offset for this view; each
 * element takes it scaled by its own depth through the card, which is what gives the picture
 * thickness. Registration is NOT applied here — it belongs to the plate, not to the picture. */
vec2 zuv(vec2 u, float z) { return (u - 0.5) / (1.0 + z) + 0.5; }
/* how much of an element's depth is spent on magnification rather than travel. ⚠ FILE SCOPE on
 * purpose: the name's INK and the name's RELIEF are sampled in two different functions, and the
 * two must use the same number or the emboss separates from the letter it belongs to. */
/* ⚑ MORE DEPTH — artist, 2026-08-06. 0.18 kept the perspective term almost invisible, which was
 * right while the separation was a constant offset and wrong now that it is parallax: perspective
 * is how you tell WHICH layer is nearer, and without it the stack reads as pieces at one height. */
const float ZS = 0.34;

/* ── ⛔ A LAYER THAT STANDS PROUD CASTS A SHADOW ─────────────────────────────────────────────
 * Artist, 2026-08-06: *"more z depth - drop shadows on z depth would be cool."* It is the single
 * strongest depth cue there is, and it is the honest one: a piece of card lifted off the sheet
 * throws the key light's shadow onto whatever is under it. Parallax only tells you about depth
 * when you MOVE; a shadow tells you while the card is dead still, which is most of the time.
 * ⚑ THE GEOMETRY IS NOT A STYLE CHOICE. Displacement = height x tan(incidence), so the shadow
 *   slides AWAY FROM THE KEY at a distance set by how high the layer sits — the same uKeyDir the
 *   foil and the paper tooth already answer, so moving the light moves the shadows with it. A
 *   shadow with a hardcoded offset is a drop-shadow filter; this is a cast shadow.
 * ⚠ AND THE PENUMBRA GROWS WITH HEIGHT. A contact shadow is sharp and a lifted one is soft —
 *   that softening is most of what the eye reads as "how far above". Three taps rather than one,
 *   spread along the light's own axis, which is where a real penumbra spreads.
 * ⚠ It darkens by MULTIPLYING, never by mixing toward a colour: this sheet is ink on paper and a
 *   shadow removes light, it does not add grey. Same rule as the ink itself. */
float castShadow(sampler2D m, vec2 uv, int ch, vec2 dir, float z) {
  float soft = 0.010 + 0.055 * z;
  float a = 0.0;
  for (int k = 0; k < 5; k++) {
    vec2 o = uv - dir * z - dir * soft * float(k);
    vec4 t = texture(m, o);
    float v = ch == 0 ? t.r : (ch == 1 ? t.g : t.b);
    a += v;
  }
  return clamp(a / 5.0, 0.0, 1.0);
}

vec3 artAt(vec2 u, vec2 par) {
  /* ── ⛔ "THESE ARE NOT SEPARATED LAYERS IT IS JUST ZOOMING IN" ───────────────────────────
   * Artist, 2026-08-05, on the BUILD pane. He is right, and this file said so itself: the note on
   * uElemZ reads *"Z IS A SCALE, NOT AN OFFSET — depth here is a magnification about the frame
   * centre."* That is true physics and it is the wrong ANSWER, because a magnification about the
   * centre is what a zoom is. Seen face-on, a stack that only scales cannot look separated — the
   * layers slide apart only when the card is tilted, and a control you have to tilt the card to
   * observe is a control that reads as broken.
   * ⚑ SO EACH ELEMENT ALSO SLIDES, along its own fixed bearing, by an amount proportional to how
   *   deep it sits. That is the exploded view of a stack of transparencies, which is the thing
   *   "layered card" actually names. Ground has ZBASE 0 and therefore never moves — it is the
   *   sheet the others are stacked ON, and a reference that drifts is not a reference.
   * ⚑ THE OFFSET IS UNIFORM AND THE ZOOM IS RADIAL, so the two are separable BY MEASUREMENT: the
   *   same block matcher acceptance 4 uses reports cos ~= 1 for a pure magnification and ~= 0 for
   *   a lateral slide. That is how "it separates" is asserted instead of asserted-by-adjective.
   * ⚠ At stack 0 every uElemZ is 0, so every offset is exactly 0 and the base card is untouched.
   * ⚠ These are applied INSIDE artAt, identically for every ink plate, so the difference BETWEEN
   *   plates is still only the registration vector and acceptance 4 is unaffected. */
  /* ⛔ THE SLIDE HAS TO BEAT THE ZOOM, AND FIRST TIME ROUND IT DID NOT — artist, twice: *"these
   * are not separated layers it is just zooming in"*, then *"the layer separation is still not
   * working (just still zooming in)."* Adding a lateral offset was the right move and the
   * MAGNITUDES made it pointless. Measured at LAYERS 2.5: the figure was magnified 1.61x while
   * sliding 6% of the card — the zoom was roughly TEN TIMES the slide, so the slide was a
   * rounding error on a zoom and the control read exactly as it had before.
   * ⚑ SO DEPTH KEEPS ONLY A HINT OF ITS MAGNIFICATION (ZS below) and spends the rest as travel.
   *   The figure now magnifies ~1.11x and slides ~17% of the card: still unmistakably deeper —
   *   perspective is what tells you which layer is on top — but what you SEE is the layers coming
   *   apart, which is the thing the control is named after.
   * ⚠ Ground stays at ZBASE 0 and therefore never moves at all: it is the sheet the rest are
   *   stacked on, and a reference that drifts is not a reference. */
  /* ⛔ DEPTH IS WHAT THE VIEW DOES TO A LAYER, NOT WHERE THE LAYER WAS GLUED. Artist: *"there is
   * no z space separation … they are just chopped up and flat floating."* Exactly right, and the
   * numbers said so: the parallax gain was 0.030 and multiplied by the view vector, so face-on it
   * was ~0, while the fixed per-layer bearings I had added were 0.25–0.33 — TEN TIMES LARGER and
   * completely view-independent. So the layers were displaced by a constant. A constant offset is
   * a collage that was pasted down crooked; it is not depth, and no amount of it ever becomes
   * depth, because depth is defined by RESPONDING TO THE EYE.
   * ⚑ THE SHIFT IS NOW OVERWHELMINGLY PARALLAX: one direction, set by where you are looking, and
   *   a MAGNITUDE PER LAYER set by how deep it sits. That is the whole definition. Turn the card
   *   and the near layers sweep across the far ones; hold it still and they sit where the stack
   *   puts them. The small residual bearing is the collage's own registration — real pieces are
   *   laid down slightly off — and it is a quarter of what it was so it cannot masquerade as
   *   depth on its own.
   * ⚠ PAR IS SCALED BY THE STACK at the uniform, so at LAYERS 0 both terms are exactly 0 and the
   *   base card is untouched. */
  vec2 uG = zuv(u, uElemZ[0] * ZS) + par * uElemZ[0] + vec2(-0.064, -0.038) * uElemZ[0];
  vec2 uM = zuv(u, uElemZ[1] * ZS) + par * uElemZ[1] + vec2( 0.055, -0.069) * uElemZ[1];
  vec2 uF = zuv(u, uElemZ[2] * ZS) + par * uElemZ[2] + vec2( 0.073,  0.046) * uElemZ[2];
  vec2 uW = zuv(u, uElemZ[3] * ZS) + par * uElemZ[3] + vec2(-0.045,  0.075) * uElemZ[3];
  vec2 uS = zuv(u, uElemZ[4] * ZS) + par * uElemZ[4] + vec2( 0.083, -0.026) * uElemZ[4];
  vec2 uI = zuv(u, uElemZ[5] * ZS) + par * uElemZ[5] + vec2(-0.078, -0.059) * uElemZ[5];
  /* ⛔ THE NAME DOES NOT TRAVEL AT ALL, AND MAKING IT TRAVEL PRINTED IT TWICE. Its INK is laid
   * here; its RELIEF is read further down from the same texture at the undisplaced UV, because
   * the crease and the marks sharing that texture belong to the SHEET. The two agreed only while
   * the type's displacement was zero. Give it any — a slide OR the magnification — and the
   * letter's ink goes one way while its emboss stays: a second, embossed copy of the name, on
   * every card on the site rather than only in the forge.
   * ⚑ AND THE FIX IS NOT TO DISPLACE THE RELIEF TOO. STRUCK TYPE IS NOT A COLLAGE LAYER. "Layers"
   *   names the pictures the card is composed FROM; the name is stamped on the stock, which is
   *   exactly why the trim and the marks beside it never move either — this file says so three
   *   lines further down. A card whose title drifts off its own trim is not a deeper card, it is
   *   a misprint. The artwork separates; the type stays where it was struck. */
  vec2 uT = u;

  /* ⛔ THE THREE SOURCES ARE SAMPLED AT THREE DIFFERENT SCALES, and that is not a look — it is
   * the difference between a composition and a filter. The first cut took all three at roughly
   * 1:1 and the card read as ONE deck card lightly damaged: three pictures of the same kind of
   * thing at the same size average into one picture. So the ground is zoomed hard until it is a
   * FIELD rather than a picture, the mid strips arrive at a different scale and mirrored, and
   * only the figure is near card-size — cropped above the source's own name, because otherwise
   * the hero wears somebody else's title across its chest. */
  /* ⛔ ONE CARD IS THE BASE — artist, 2026-08-05: *"base means reset to base as in 1 card, not
   * three cards."* He is right and the panel was lying: it read "no changes applied" over a
   * composition of THREE deck cards. A collage is a treatment. It has to be something you ADD,
   * or "base" means nothing and the first thing the tool tells you is untrue.
   * ⚑ AT ONE PLATE THE SOURCE IS FRAMED AS THE FIGURE, NOT AS THE GROUND, and that is the whole
   *   difference between "one card" and "one card destroyed". The ground role is zoomed to
   *   0.30 x 0.20 — deliberately past legibility, because its job is to be a FIELD behind the
   *   other two. Showing that alone would answer "one card" with an abstract smear and read as a
   *   broken base. The figure's framing is the card at card size, clamped, cropped above the
   *   source's own name. ⚠ It must CLAMP: uPigA and uPigB repeat, and a card-size sample through
   *   a REPEAT wrap tiles a grid of little faces the moment it leaves 0..1. */
  vec2 uFig = (uF - vec2(0.50, 0.40)) * vec2(1.02, 0.76) + vec2(0.50, 0.34);
  vec3 c;
  if (uNPig <= 1) {
    /* ── ⛔ ONE CARD, CUT INTO LAYERS — artist, 2026-08-06: *"for a single card the layers are
     * creating 3 sources when there is only one source selected. The layers should be created
     * from THAT ONE SOURCE. STILL no z space separation and depth."*
     * ⚑ THIS IS THE THING I HAD BACKWARDS ALL DAY. LAYERS was reaching for more SOURCE CARDS —
     *   it even pulled two in automatically — when what it has to do is take the single card you
     *   chose and SEPARATE IT: cut it into regions and stand those regions at different depths.
     *   That is what cards/lens3d.html does with an authored sidecar, and it is what "layered
     *   card" has always meant here. More pictures is a collage; one picture in slices is depth.
     * ⚑ THE CUTS ARE THE ROTO MASKS, which is why they had to stop being feathered first: a
     *   region with a soft edge cannot sit at a depth, because half of it is at two depths. Four
     *   regions — the ground behind everything, then the three roto'd cuts — each sampling THE
     *   SAME TEXTURE at its own parallax offset, so they slide across each other as the card
     *   turns. Nearest is drawn last, so it occludes.
     * ⚠ At LAYERS 0 every uElemZ is 0, all four offsets collapse to one and the card is the flat
     *   print it always was — byte-identical, which is what keeps the base honest. */
    vec4 cut = texture(uComp2, u);
    c = texture(uPigC, uFig).rgb;                       // the sheet the cuts are lifted off
    /* ⚑ MORE TRAVEL. These were 0.05 and read as a nudge; at 0.11 a lifted piece clearly stands
     * somewhere else from the sheet it came off. */
    vec2 fB = uFig + (par + vec2(-0.112, -0.065)) * uElemZ[1];
    vec2 fM = uFig + (par + vec2( 0.130,  0.082)) * uElemZ[3];
    vec2 fN = uFig + (par + vec2(-0.095,  0.142)) * uElemZ[5];
    vec2 ldir = normalize(vec2(cos(uKeyDir.x), sin(uKeyDir.x))) * 0.20;
    /* Back to front. Each layer SHADOWS what is already down, then is laid on top — so a shadow
     * can never fall on the piece casting it, and a near layer shades the far ones as it must. */
    c *= mix(1.0, 1.0 - (1.0 - 0.30) * uPar.y, castShadow(uComp2, u, 0, ldir, uElemZ[1]) * (1.0 - step(0.5, cut.r)));
    c = mix(c, texture(uPigC, fB).rgb, step(0.5, cut.r));
    c *= mix(1.0, 1.0 - (1.0 - 0.30) * uPar.y, castShadow(uComp2, u, 1, ldir, uElemZ[3]) * (1.0 - step(0.5, cut.g)));
    c = mix(c, texture(uPigC, fM).rgb, step(0.5, cut.g));
    c *= mix(1.0, 1.0 - (1.0 - 0.30) * uPar.y, castShadow(uComp2, u, 2, ldir, uElemZ[5]) * (1.0 - step(0.5, cut.b)));
    c = mix(c, texture(uPigC, fN).rgb, step(0.5, cut.b));
  } else {
    c = texture(uPigA, uG * vec2(0.30, 0.20) + vec2(0.20, 0.34)).rgb;
    vec3 mid = texture(uPigB, uM * vec2(-1.90, 1.25) + vec2(1.42, -0.16)).rgb;
    c = mix(c, mid, texture(uComp, uM).r);
    c *= mix(1.0, 1.0 - (1.0 - 0.30) * uPar.y, castShadow(uComp, u, 1, normalize(vec2(cos(uKeyDir.x), sin(uKeyDir.x))) * 0.20,
                                   uElemZ[2]) * (1.0 - texture(uComp, uF).g));
    c = mix(c, texture(uPigC, uFig).rgb, texture(uComp, uF).g);
  }

  /* ── ⛔ THREE MORE SOURCES, AND EACH ONE HAD TO EARN A DIFFERENT SCALE ────────────────────
   * Artist, 2026-08-05: the plate separator goes to six, and so does the collage.
   * ⚠ THE RECORDED FAILURE IS THE ONE TO AVOID HERE: "all three pigment cards at 1:1 average
   *   into ONE card. Three pictures of the same kind of thing at the same size is a FILTER, not
   *   a composition." Doubling the sources doubles that risk rather than halving it — six cards
   *   laid on top of each other at similar scales is mud, and it would read as "6 plates looks
   *   worse" when the fault was the roles, not the count. So the three new ones take the scales
   *   the first three do not: WASH is zoomed past ground until it is pure colour field, STRIP is
   *   tiled small and turned against the sheet's own axis, and INSET is a tight crop held in one
   *   region of the card rather than spread across it.
   * ⚑ AND THEY ARE MASKED FROM A SECOND TEXTURE, NOT FROM uComp's ALPHA. uComp is a generated
   *   2D canvas and a 2D canvas stores pixels PREMULTIPLIED — writing a mask into alpha there
   *   multiplies that pixel's colour by zero and wipes the other three masks wherever the new one
   *   is dark. That is a recorded, expensive bug in this exact file. A fourth channel of data
   *   gets a fourth channel of ANOTHER texture. */
  if (uNPig > 3) {
    vec2 ldir2 = normalize(vec2(cos(uKeyDir.x), sin(uKeyDir.x))) * 0.20;
    vec3 wash = texture(uPigD, uW * vec2(0.11, 0.075) + vec2(0.62, 0.11)).rgb;
    c *= mix(1.0, 1.0 - (1.0 - 0.42) * uPar.y, castShadow(uComp2, u, 0, ldir2, uElemZ[3]));
    c = mix(c, wash, texture(uComp2, uW).r * 0.72);
    /* turned against the sheet: a strip laid square to the trim reads as a panel, not a scrap */
    vec2 uSr = mat2(0.87, -0.49, 0.49, 0.87) * (uS * vec2(3.40, 2.15)) + vec2(0.13, 0.71);
    vec3 strip = texture(uPigE, uSr).rgb;
    c = mix(c, strip, texture(uComp2, uS).g);
    vec3 inset = texture(uPigF, (uI - vec2(0.52, 0.63)) * vec2(2.55, 1.90) + vec2(0.50, 0.46)).rgb;
    c *= mix(1.0, 1.0 - (1.0 - 0.30) * uPar.y, castShadow(uComp2, u, 2, ldir2, uElemZ[5]) * (1.0 - texture(uComp2, uI).b));
    c = mix(c, inset, texture(uComp2, uI).b);
  }

  /* ── ⛔ THE LOOPS ARE STRUCK IN INK, NOT LAID OVER THE TOP ─────────────────────────────
   * Artist, 2026-08-05: *"small gif sprites and loops that look handddrawn … infinite abstract,
   * ascii art, generative and cool."* They are drawn by js/card-sprites.js and they arrive HERE,
   * inside artAt — which means they go through the four (or six) plate separation, take the
   * halftone screen, take the registration error and take the press's damage, exactly like every
   * other mark on the sheet. ⚑ That is the whole difference between a sprite that is ON the card
   *   and a sprite that is IN the print. Compositing them after the separation would have made
   *   them a sticker — the decal failure this renderer's first acceptance test exists to catch.
   * ⚠ They ride the FIGURE's plane, so they sit in the stack and parallax with it rather than
   *   floating at zero depth in front of a card that has depth. */
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uSprite.w) break;
    vec4 SP = uSpriteP[i];
    vec2 d = (uF - SP.xy) / max(SP.z, 0.001);
    float ca = cos(SP.w), sa = sin(SP.w);
    vec2 q = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca) + 0.5;
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) continue;
    /* into the sheet's own cell */
    float col = mod(uSprite.z, uSprite.x);
    float row = floor(uSprite.z / uSprite.x);
    vec2 cellUv = (vec2(col, row) + q) / vec2(uSprite.x, uSprite.y);
    float cov = texture(uSpriteTex, cellUv).r;
    c = mix(c, vec3(0.055, 0.048, 0.062), clamp(cov, 0.0, 1.0));
  }

  /* The trim and the marks are on the STOCK, so they take no depth — they are not floating
   * above the picture, they are the picture stopping. Only the name is carried up the stack. */
  // ⚠ the trim and the marks are the SHEET. They never travel — if the paper moved in z there
  // would be nothing for the stack to be inside, and the whole depth would read as a zoom.
  /* ── ⛔ FRAMELESS — artist, 2026-08-06 ────────────────────────────────────────────────────
   * The trim is the RAW STOCK left unprinted: a trading card's border is where the ink stops, and
   * this channel says "no artwork here" so the paper does the rest. Frameless takes it away and
   * the composition runs to the die edge — a FULL BLEED, which is a real thing a press does and a
   * different kind of card, not a card with a missing part.
   * ⚠ AND IT COSTS SOMETHING THIS FILE ALREADY RECORDED: *"bleeding the composition to all four
   *   edges is what turned the first proof into wallpaper."* The trim is what makes the artwork
   *   read as a WINDOW. That was a finding about the default, not a prohibition — but it is why
   *   this is an option rather than the new normal, and why the panel says so out loud.
   * ⚑ It takes the border sorts with it. Sorts are set INTO the trim, so a frame-less card with a
   *   ruled border still on it is a border round nothing — the one arrangement that would look
   *   like a bug rather than a choice. The NAME stays: it is the card's title, not its frame. */
  vec4 m = texture(uComp, u);
  c = mix(c, vec3(0.930, 0.902, 0.836), clamp(m.b, 0.0, 1.0) * uFrame);   // raw stock: the trim
  /* The name and the border sorts are struck by the same cylinder as everything else, so they
   * arrive WITH the sheet — the type writes itself on rather than fading up. */
  float frontT = 1.2 - 1.4 * uMot.w;
  float ink = smoothstep(frontT, frontT + 0.18, 1.0 - u.y);
  c = mix(c, vec3(0.055, 0.048, 0.062), texture(uType, uT).r * ink);   // the name
  c = mix(c, vec3(0.120, 0.108, 0.128), texture(uType, u).g * ink * uFrame);  // sorts + marks
  return c;
}

/* Grey-component replacement — a real four-colour separation, not a channel split. Pulling K out
 * first is why the shadows go NEUTRAL instead of muddy purple when the plates slip. */
/* ⛔ AND THE TWO EXTRA PLATES ARE AN INK SPLIT, NOT TWO MORE LAYERS ON TOP. This is the whole
 * difference between a six-colour press and "CMYK with some orange painted over it": a real
 * extended-gamut separation gives orange the part of the picture MAGENTA AND YELLOW were already
 * carrying between them, and green the part shared by CYAN and YELLOW — then takes that load OFF
 * the process inks. Total ink stays where it was; what changes is that two hues are now laid by a
 * plate that can actually reach them, on their own screens, at their own registration.
 * ⚑ SO THE CARD DOES NOT GET DARKER WHEN YOU TURN IT ON, and that is a property to check rather
 *   than hope for: adding rather than splitting would have piled two more inks onto a subtractive
 *   stack and driven the whole card toward black, which reads as "6 plates looks worse".
 * ⚠ AT FOUR INKS IT MUST BE THE OLD FUNCTION EXACTLY. uNInk == 4 leaves o and g at zero and
 *   never touches c/m/y, so the four-colour card is byte-identical to the one this renderer has
 *   always printed — the same discipline as the room switch, and asserted the same way. */
void sep6(vec3 c, out float s[6]) {
  c = clamp(c, 0.0, 1.0);
  float k = 1.0 - max(max(c.r, c.g), c.b);
  float ik = max(1.0 - k, 1e-3);
  float cy = (1.0 - c.r - k) / ik;
  float mg = (1.0 - c.g - k) / ik;
  float yl = (1.0 - c.b - k) / ik;
  float o = 0.0, g = 0.0;
  if (uNInk > 4) {
    o = min(mg, yl) * uSplit;          // orange is what magenta and yellow were both carrying
    mg -= o; yl -= o;
    g  = min(cy, yl) * uSplit;         // green likewise out of cyan and yellow
    cy -= g; yl -= g;
  }
  s[0] = cy; s[1] = mg; s[2] = yl; s[3] = k; s[4] = o; s[5] = g;
}

/* An AM halftone: rotate into the plate's own screen angle, and a dot whose RADIUS is
 * sqrt(density) so its AREA is the density. ⚠ The moiré this produces between plates is not an
 * artefact to suppress — it is the reason real separations use 15/75/0/45 degrees, and it is
 * most of what the eye reads as "printed".
 *
 * ⚑ IT ALSO RETURNS THE DOT'S OWN SLOPE, because a halftone dot is not a stain — it is a bead of
 *   ink standing proud of the stock, and under a raking light the dots are the FIRST thing you
 *   see on a real card. dn is the analytic gradient of a spherical cap of radius rad, rotated
 *   back out of the screen frame. Analytic rather than differenced: at three device pixels per
 *   cell a differenced normal is pure noise.
 * ⚠ And it fades out when the cell gets smaller than about three pixels, or the relief aliases
 *   into exactly the moiré grid the ruling was retuned to avoid.
 *
 *
 * ⛔ AND DO NOT "FIX" A SMALL RENDER HERE — THE ANSWER IS TO SAMPLE IT PROPERLY, NOT TO SOFTEN
 *   THE PRINT. The ruling is fixed at 170 cells across the card, a property of the PRINT, while
 *   how many dots a buffer can carry is a property of the BUFFER. A 270-px render puts a cell at
 *   ~1.6 device pixels and speckles; measured against the same card rendered at 900 and
 *   downsampled — the optically correct answer — it carried up to 1.38x the high-frequency
 *   energy. Not detail, moiré.
 * ⚠ I TRIED FADING COVERAGE TOWARD FLAT DENSITY HERE AND REVERTED IT, because the measurement
 *   refused it twice over: it took the 270 render to 0.75-0.77 of the correct HF (softer than
 *   the truth — mush, which is worse than mild aliasing), AND it moved the 900-px reference by
 *   ~3.5%, so the claim that it was bounded to small canvases was simply false. The knee is
 *   fwidth, which varies with angle and perspective, so "it only engages below N pixels" is not
 *   a thing you can assert about a shader without measuring the big case too.
 * ⚑ js/card-view.js supersamples instead: it floors the card's backing store above the display's
 *   own ratio, which reproduces the reference condition (ratio 0.98-1.01) and costs 4x the fill
 *   on one small canvas. Fix the sampling, leave the print alone.
 * ⚠ NO BACKTICKS ANYWHERE IN THIS COMMENT. It lives inside a template literal, so one ends the
 *   shader string, HeroCard is never defined, and every press on the site silently does not
 *   exist. Tenth sighting of that trap in this repo, and this note is where I hit it. */
float screenDot(vec2 u, float ang, float freq, float d, out vec2 dn) {
  float s = sin(ang), co = cos(ang);
  vec2 r = vec2(u.x * co - u.y * s, u.x * s + u.y * co) * freq;
  vec2 f = fract(r) - 0.5;
  float dist = length(f) * 2.0;
  float rad = sqrt(clamp(d, 0.0, 1.0)) * 1.128;
  float px = max(fwidth(dist), 1e-4);
  float cov = smoothstep(rad + px, rad - px, dist);
  float hh = sqrt(max(rad * rad - dist * dist, 0.0));
  vec2 dir = dist > 1e-4 ? f / max(length(f), 1e-5) : vec2(0.0);
  vec2 g = dir * (dist / max(hh, 0.06)) * cov * smoothstep(0.72, 0.30, px);
  dn = vec2(g.x * co + g.y * s, -g.x * s + g.y * co);
  return cov;
}

void main(void) {
  vec3 Ng = normalize(vN);
  vec3 V = normalize((uEye - vW) * uRot);            // world -> object, see hero3d.js
  vec2 par = -V.xy / max(abs(V.z), 0.30) * uPar.x;

  /* ══ ⛔ THE REVERSE ═══════════════════════════════════════════════════════════════════════
   * V is the view vector in OBJECT space, so V.z < 0 means the card has been turned past
   * edge-on and we are looking at its back. Without this the quad rendered its own FRONT
   * mirrored — which is exactly what a card that is a picture rather than an object looks like.
   * ⚑ SAME STOCK, SAME LIGHT, SAME DIE EDGE — only the plate differs. The back is printed on
   *   this sheet, not pasted onto it, so it is shaded by the code below rather than by a second
   *   path that would weather differently from the front.
   * ⚠ U IS MIRRORED, because you are seeing the sheet from behind. Forgetting that prints the
   *   back's own type in reverse, which reads as a rendering bug rather than as a card.
   * ⚠ ONE INK, deliberately: a card back is a single plate, so it does NOT go through the
   *   four-colour separation. Running it through would give the back a moiré and a
   *   misregistration that only a four-colour pull can have.
   * ⚠ NO BACKTICKS IN THIS COMMENT. It lives inside a JS template literal, where one ends
   *   the string and the whole module stops parsing. Ninth sighting in this repo.
   */
  if (V.z < 0.0) {
    vec2 bUv = vec2(1.0 - vUv.x, vUv.y);
    vec3 bp = texture(uBack, bUv).rgb;
    float cover = clamp(bp.r, 0.0, 1.0);
    /* the paper first, then one ink multiplied into it — the same subtractive rule as the front,
     * which is what keeps both sides the same material. */
    vec3 stockN = texture(uStock, bUv * uTile).rgb;
    float tooth = (stockN.b - 0.5) * 2.0;
    vec3 paper = uInk[3] * 0.0 + vec3(0.960, 0.945, 0.905) * (1.0 + tooth * 0.055);
    /* burn opens the stock on the back too — a card that has been through something has been
     * through it on both sides. */
    paper *= 1.0 - uDmg.w * 0.28;
    /* ⛔ A DESIGNED BACK IS ALREADY A PICTURE — SHOW ITS COLOUR, DO NOT RE-INK IT.
     *   The generated stand-in is a single plate, so its red channel is COVERAGE and one ink gets
     *   multiplied into the paper. The designed back (cards/cardback.css) is finished full-colour
     *   artwork: manila stock, a gold name band, the card's own frame colour. Running that
     *   through the one-ink path threw away two of its three channels and printed it as a grey
     *   ghost of itself — which reads as a broken texture and is a wrong assumption about what
     *   the plate contains.
     * ⚑ Either way it is still LIT as paper below, so both kinds of back answer the same light
     *   and belong to the same object. */
    vec3 ink = vec3(0.140, 0.118, 0.128);
    vec3 oneInk = mix(paper, paper * ink, cover * (0.94 - uDmg.y * 0.22));
    vec3 designed = bp * (0.90 + tooth * 0.05) * (1.0 - uDmg.w * 0.22);
    vec3 col = mix(oneInk, designed, uBackRGB);

    /* the die edge is the SAME foil, so the two sides agree about the object's rim */
    /* ⚠ AN EDGE, NOT A BORDER. At 0.030 this came out as a rainbow band framing the whole back
     *   — which is the decal failure the front's acceptance test exists to catch, reproduced on
     *   the reverse. A die edge is the CUT: a few thousandths of the card, where the blade went
     *   through the foil layer. Anything wider is a sticker of foil. */
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float die = smoothstep(0.0075, 0.0015, edge);
    if (die > 0.001) {
      vec3 Nb = normalize(vec3(-stockN.r * 0.35, -stockN.g * 0.35, 1.0));
      vec3 Lb = normalize(vec3(cos(uKeyDir.x), sin(uKeyDir.x), 0.85));
      vec3 Hb = normalize(Lb + vec3(V.x, V.y, -V.z));
      float g = pow(max(dot(Nb, Hb), 0.0), 42.0);
      col = mix(col, pal(fract(dot(Hb.xy, vec2(11.0, 7.0)) * 3.0)) * (0.35 + g * 2.2), die);
    }
    /* the same LDR knee the front uses, or metal specular clips to flat white */
    col = col / (1.0 + col * 0.18);
    frag = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
    return;
  }

  /* ⚠ relief is uType.b, NOT uComp.a — the alpha channel of a generated canvas is not a data
   * channel; see the note above buildComp's return. */
  /* ⚑ ONE SAMPLE, UNDISPLACED — and it is correct again only because the name no longer
   * travels. See the note on uT: ink and relief come from the same texture and any displacement
   * applied to one and not the other prints the name twice. */
  vec3 plate = texture(uType, vUv).rgb;              // r name · g marks · b crease
  float relief = plate.b;

  /* ── the press ────────────────────────────────────────────────────────────────────────────
   * Four impressions of the same picture, each at its own registration, each screened at its own
   * angle, multiplied one after another into the paper. Subtractive: transmit only ever goes
   * DOWN, so no ink can add light and the card cannot glow. */
  float freq = uPress.x * mix(1.0, 0.42, uDmg.x);    // burn coarsens the screen until it gives up
  vec3 transmit = vec3(1.0);
  float inkD = 0.0;
  vec2 dotN = vec2(0.0);
  /* ⚑ THE SHEET SLIPS ALONG ITS OWN FEED AXIS — one direction, not a blur. A blur is what you draw
   * when you do not know why something moved; a slur has a direction because the paper does. */
  vec2 slip = vec2(uMot.y * 0.55, uMot.y);
  for (int p = 0; p < uNInk; p++) {
    vec2 u = vUv + mix(uReg[p], (vUv - 0.5) * length(uReg[p]) * 3.0, uRegRadial) * uRegGain
           + slip * (float(p) * 0.33 + 0.2);
    float s[6]; sep6(artAt(u, par), s);
    float d = s[p] * uFilm[p] * uMot.x;
    /* DOUBLING: the cylinder bounces and strikes again a hair off. ⚠ max(), never add — a second
     * impression cannot make ink darker than solid, it makes it WIDER, which is exactly why
     * doubling is a legible fault rather than a general darkening. */
    if (uMot.z > 0.001) {
      float s2[6]; sep6(artAt(u + vec2(0.0055, 0.0092) * uMot.z, par), s2);
      d = max(d, s2[p] * uFilm[p] * uMot.x * 0.58);
    }
    // the roller: bands ACROSS the sheet, because that is the axis the roller turns on
    float band = 1.0 + uPress.w * sin(u.y * uPress.y + uPress.z + float(p) * 0.7);
    d = clamp(d * band + uDmg.z * 0.10, 0.0, 1.0);
    vec2 dn;
    /* ⛔ THE STIPPLE COMES OFF — artist, 2026-08-06: *"I do not want the stipling on the cards
     * anymore, it diminished the art."* That is the AM halftone: each plate broken into dots on
     * its own screen angle. It is most of what made the card read as PRINTED, and it is also a
     * screen laid over somebody's artwork — at card size the dots are a texture the picture has
     * to be seen through, and he is right that it costs the art more than it buys the press.
     * ⚑ AT 0 THE INK IS LAID IN CONTINUOUS TONE: the density goes down as coverage directly,
     *   which is what a photographic or a digital press does. Everything else survives — the four
     *   or six plates, their registrations, the film weights, the roller band, the trapping — so
     *   it is still a separation and still a print, just not a SCREENED one.
     * ⚠ The dot relief goes with it. Beads of ink standing proud are the stipple in three
     *   dimensions; keeping them over continuous tone would emboss dots that are not there. */
    float cov = mix(d, screenDot(u * vec2(1.0, 1.5), uAng[p], freq, d, dn), uScreen);
    dn *= uScreen;
    transmit *= mix(vec3(1.0), uInk[p], cov);
    inkD += d;
    if (p == 3) dotN = dn;                           // K only — four relief grids is noise
  }
  float inkCov = clamp(inkD * 0.55, 0.0, 1.0);

  /* ⛔ THE WRITE-ON IS THE SHEET FEEDING THROUGH — artist: "add in write on effects." Not a wipe
   * laid over the top: ink ARRIVES, down the sheet, in the order the cylinder touches it, and the
   * leading edge is soft because a nip is a line of contact rather than a knife. Ahead of the line
   * there is nothing yet — RAW STOCK, not a faded picture, because a half-printed sheet is not a
   * translucent one. That distinction is the whole difference between a press and a fade-in. */
  /* ⚠ THE SENSE OF THIS WAS INVERTED AND EVERY TEST AGREED WITH IT. Written as
   * smoothstep(w*1.3 - 0.18, w*1.3, y) it makes w=0 a FINISHED sheet and w=1 a blank one —
   * exactly backwards from the comment above and from the arrival ramp, which ramps 0→1 as the card
   * appears. The card came up fully printed and then erased itself. It was caught by the
   * registration block-match reporting ZERO blocks with any detail in them, i.e. by a measurement
   * that had nothing to do with the write-on: landed is a THRESHOLD THAT FALLS, so it is
   * written that way. */
  float front = 1.2 - 1.4 * uMot.w;                  // the line of contact, sweeping down the sheet
  float landed = smoothstep(front, front + 0.18, 1.0 - vUv.y);
  transmit = mix(vec3(1.0), transmit, landed);

  /* ── THE SURFACE ─────────────────────────────────────────────────────────────────────────
   * Four separate things happened to this piece of card and each one has its own physics:
   *   FIBRE   the stock's own tooth. A real texture, not a hash — paper is fibres lying down
   *           in directions, and a hash has no direction, which is why hash tooth reads as
   *           digital noise however well it is tuned.
   *   INK     laid down wet and dried proud. Its HEIGHT follows the picture and its dots stand
   *           up individually, and where it is thick the surface gets SMOOTHER, because the
   *           film flows out flatter than the paper it is sitting on.
   *   CREASE  a fold in the board, under everything.
   *   EMBOSS  the name, struck into the stock by the same plate that inked it. */
  vec3 fib = texture(uStock, vUv * uTile).rgb;
  /* ⚑ A VARNISH FILLS THE TOOTH. It is not only a roughness change — a coating floods the paper's
   * fibre and levels it, which is exactly why coated stock feels and photographs smoother. So the
   * same mask that drops the roughness drops the fibre relief, and the trim keeps its grain. */
  float coat = 1.0 - 0.72 * uRough.w * (1.0 - clamp(texture(uComp, vUv).b, 0.0, 1.0));
  vec2 nT = (fib.xy * 2.0 - 1.0) * (uRelief.x * coat)
          + vec2(dFdx(inkCov), dFdy(inkCov)) * uRelief.y
          + vec2(dFdx(relief), dFdy(relief)) * uRelief.z
          + dotN * uRelief.w
          + vec2(dFdx(plate.r), dFdy(plate.r)) * -1.6;
  vec3 N = normalize(Ng + vec3(nT, 0.0));

  /* ⚑ SPOT VARNISH. The art window is coated and the trim is bare stock — a real finish on a real
   * card, and the cheapest way to make one surface read as two materials. It is a ROUGHNESS
   * boundary and nothing else: no colour changes across it, which is exactly why it is worth
   * having, because it can only be seen by how the light behaves. */
  float win = 1.0 - clamp(texture(uComp, vUv).b, 0.0, 1.0);
  float rough = mix(uRough.x, uRough.y, inkCov) + (fib.z - 0.5) * 0.16;
  rough = mix(rough, rough * (1.0 - 0.62 * uRough.w), win);
  rough = clamp(rough + uDmg.x * 0.14, 0.045, 1.0);   // burn scuffs the coating

  /* ── THE FOIL IS A METAL, and the grating is its SPECTRAL REFLECTANCE ────────────────────
   * ⛔ This is the difference between v1 and this pass. Before, the diffracted hue was MIXED over
   *   the finished pixel, which is a tint — a decal with extra steps. A foil stamp is a thin
   *   METAL layer: it has no diffuse at all, its specular is tinted by the metal, and a grating
   *   ruled into it makes that tint a function of the half-angle. So pal() feeds F0 and the
   *   Fresnel term carries it, which means the colour now arrives THROUGH the lighting rather
   *   than on top of it — and it goes where the light goes.
   * The phase is js/hero3d.js's: (L+V) projected onto the surface axes plus a thin-film term
   * going as 1/cos, so the hue keeps moving even when nothing but your head does. */
  vec2 ee = abs(vFace) / vec2(1.0, 1.5);
  /* ⚠ THE DIE EDGE IS AN EDGE. At 0.86 the foil band covered the whole trim and the card wore a
   * rainbow border — a decal, which is the exact thing acceptance 1 exists to catch. */
  float edge = smoothstep(0.952, 0.982, max(ee.x, ee.y));
  /* ⛔ THE RARITY'S "GLOW" IS THIS ONE TERM. plate.g is the printer's marks AND the border sorts,
   * so raising uFrameFoil turns the frame from ink into metal: dark head-on, flaring when the card
   * turns, hue walking with the grating. No emission anywhere — see the header. */
  float metal = clamp(edge + plate.r * 0.62 + plate.g * uFrameFoil, 0.0, 1.0)
              * (1.0 - uDmg.w * 0.55);

  vec3 T0 = normalize(vec3(1.0, 0.0, 0.0) - Ng * Ng.x);
  vec3 B0 = cross(Ng, T0);
  float ndvG = clamp(dot(Ng, V), 0.0, 1.0);
  float film = uFoilP.y / max(ndvG, 0.22);
  float axV = dot(T0, V) + 0.62 * dot(B0, V);
  float base = 0.35 * (1.0 - vUv.y) + uFoilP.w * relief + film + uFoilP.x * axV + uSeed;
  vec3 foilTint = pal(base);

  rough = mix(rough, uRough.z, metal);
  vec3 albedo = STOCK * transmit * (1.0 - metal);    // ⛔ metal has no diffuse. Ever.
  vec3 f0 = mix(vec3(0.045), foilTint, metal);

  /* ⚑ THE DIE STAMP HAS A DIRECTION, so the foil is ANISOTROPIC — the highlight smears ALONG the
   * edge instead of sitting on it as a bead. On a vertical edge the knife ran down the card, on a
   * horizontal one it ran across, and the type was struck left to right. */
  vec3 Tf = (ee.x > ee.y && edge > 0.5) ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(Tf - N * dot(N, Tf));
  vec3 B = cross(N, T);
  float a = max(rough * rough, 1e-3);
  float aniso = mix(1.0, 3.1, metal);
  float ax = clamp(a * aniso, 1e-3, 1.0), ay = clamp(a / aniso, 1e-3, 1.0);

  float ndv = clamp(dot(N, V), 1e-4, 1.0);

  /* One light, done properly, three times. Lw arrives in WORLD space and is rotated into the
   * card's frame, so turning the card sweeps the highlight across it — which is the entire
   * reason to have a material at all. */
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec3 Lw = i == 0 ? uKeyDir : (i == 1 ? uFillDir : uRimDir);
    vec3 lc = i == 0 ? uKeyCol : (i == 1 ? uFillCol : uRimCol);
    vec3 L = normalize(Lw * uRot);
    float ndl = dot(N, L);
    // wrapped diffuse: paper is not a sphere, it terminates soft because light gets in and out
    float wrap = clamp((ndl + 0.20) / 1.20, 0.0, 1.0);
    col += albedo * lc * wrap / PI;
    if (ndl <= 0.0) continue;
    vec3 H = normalize(L + V);
    float ndh = clamp(dot(N, H), 0.0, 1.0), vdh = clamp(dot(V, H), 0.0, 1.0);
    /* The grating's path difference splits into a light half and a view half; the view half is
     * already in base, so only the light half is added here. Without it the hue would walk with
     * the camera and stand still under a moving light, which is half a foil. */
    float axL = dot(T0, L) + 0.62 * dot(B0, L);
    vec3 F = F_Schlick(mix(vec3(0.045), pal(base + uFoilP.x * axL), metal), vdh);
    float spec = D_GGX(ndh, dot(T, H), dot(B, H), ax, ay) * V_Smith(ndv, ndl, a) * ndl;
    col += lc * F * spec * uFoilP.z;
  }

  /* ── THE ENVIRONMENT, AND ONLY THE METAL MAY SEE IT ──────────────────────────────────────
   * The reflection is taken to WORLD space, so the room stays put while the card turns. */
  vec3 R = uRot * reflect(-V, N);
  vec3 Fenv = F_Schlick(f0, ndv);
  col += envAt(R, rough) * Fenv * metal * uEnvOn;
  // ⛔ …and the artwork gets DIFFUSE bounce only. No ambient specular on ink — see uEnvOn.
  vec3 Nw = uRot * N;
  float ao = 1.0 - 0.42 * clamp(length(vec2(dFdx(relief), dFdy(relief))) * 9.0, 0.0, 1.0);
  col += albedo * mix(vec3(0.070, 0.062, 0.062), vec3(0.235, 0.246, 0.285), Nw.y * 0.5 + 0.5) * ao;

  /* ── the tear ────────────────────────────────────────────────────────────────────────────
   * At full burn the stock is opened: the ink stops and the raw board shows, darker at the lip
   * where the fibre lifts. It is the one place the ARTWORK is absent rather than damaged. */
  float tear = smoothstep(0.60, 0.86, relief) * uDmg.y;
  col = mix(col, STOCK * (0.36 + 0.30 * (1.0 - tear)), tear);

  /* ⚠ ONE HIGHLIGHT ROLLOFF, and it is the GfxPost lesson brought over rather than re-learned:
   * this is an LDR target and a metal specular goes well past 1.0, where the GPU clips it to flat
   * white and the foil loses its colour exactly where it is brightest. The knee compresses the
   * top instead of clamping it. */
  col = mix(col, 1.0 - exp(-col), smoothstep(0.86, 1.10, dot(col, LUMA)));
  frag = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  // ── plate constants ────────────────────────────────────────────────────────────────────────
  // Process inks as TRANSMITTANCES, and the classic screen angles. 15/75/0/45 is not decoration:
  // those four are the angles that keep the rosette from collapsing into a visible pattern, and
  // yellow gets 0 because the eye is least sensitive to its moiré.
  /* ⚠ SIX INKS, AND THE FIRST FOUR ARE UNTOUCHED. A four-colour card must keep printing exactly
   * as it always has — the two spot inks are only ever reached when `uNInk` is 6. */
  const INK = [
    [0.06, 0.66, 0.90],   // C
    [0.90, 0.10, 0.52],   // M
    [0.98, 0.84, 0.10],   // Y
    [0.10, 0.09, 0.11],   // K
    [0.96, 0.42, 0.08],   // O — orange: passes red, holds green, kills blue
    [0.12, 0.72, 0.34],   // G — green
  ];
  /* ⚑ THE SPOT ANGLES SIT 7.5° OFF THEIR NEIGHBOURS, which is what an extended-gamut press
   * actually does — with six screens you cannot keep every pair 30° apart, so the trade is a
   * tighter rosette and more beat between plates. Here that is the point rather than the cost:
   * this shader's own note says the moiré between screens "is not an artefact to suppress — it is
   * most of what the eye reads as printed". Six plates beat harder than four. */
  const ANG = [15, 75, 0, 45, 52.5, 22.5].map(d => (d * Math.PI) / 180);
  const NINK = { process: 4, extended: 6 };

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
  function texFrom(gl, src, unit, wrap, mips) {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    /* ⚠ A TILING TEXTURE NEEDS MIPMAPS OR IT IS NOISE. The stock's fibre normal is laid down at
     * roughly three texels per device pixel, and minifying a NORMAL map without mips samples one
     * arbitrary fibre per pixel — which came back as salt-and-pepper specular over the whole
     * card and reads exactly like a bad material rather than like undersampling. Mipping a normal
     * map also shrinks its variance with distance, which is the correct behaviour anyway: paper
     * tooth you cannot resolve should flatten, not sparkle. */
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
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

    let seed = (o.seed >>> 0) || 3030;
    const pool = o.pigment && o.pigment.length ? o.pigment : [];
    if (pool.length < 1) return Promise.resolve(null);
    /* ⛔ THE FORGE NEEDS ROLES, AND HANDING `pigment` EXACTLY THREE DOES NOT GIVE THEM.
     * `pickPigment` draws three from the pool WITHOUT REPLACEMENT but in a seeded ORDER, so a
     * three-element pool comes back as a random PERMUTATION of itself. That is right for a card
     * the press pulls by itself and wrong for one somebody composed: the card you chose as the
     * figure can come out as the ground, and nothing errors — you just get a composition you did
     * not ask for and cannot tell from a bad seed. `pigmentExact` is the composed path: three
     * URLs in role order (ground, mid, figure), used verbatim. */
    /* ⚠ `pigmentExact` may carry THREE or SIX now — a card composed before the collage went to
     *   six names only its first three, and must keep printing. Anything short is padded from
     *   this seed's own pick, so the extra plates are the ones the card would have chosen. */
    const px = (o.pigmentExact || []).filter(Boolean);
    const exact = px.length === 3 || px.length === NPIG;
    const seededPig = pickPigment(seed, pool);
    const pig = exact ? px.slice() : seededPig.slice();
    while (pig.length < NPIG) pig.push(seededPig[pig.length] || pig[0]);

    return Promise.all(pig.map(loadImage)).then(imgs => {
      /* ⛔ ONLY THE FIRST THREE ARE LOAD-BEARING. Requiring all six would mean one 404 on a
       * source the card is not even printing takes the whole card down — and the deck is being
       * clean-slated, so a missing image is a WHEN, not an if. The three extra roles fall back to
       * the three that must exist; the card composes differently rather than not at all. */
      if (imgs[0] && imgs[1] && imgs[2]) {
        for (let i = 3; i < NPIG; i++) if (!imgs[i]) { imgs[i] = imgs[i - 3]; pig[i] = pig[i - 3]; }
      }
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
      let MOTION = (o.motion && byKey(o.motion)) || motionFor(seed);
      /* ── WHAT THE CARD SAYS ───────────────────────────────────────────────────────────────
       * Artist, 2026-08-05: *"need to be able to add text"*. Held as state rather than read out
       * of `o` at every bake, because `setText` has to survive a PULL — the type plate is rebuilt
       * on every impression (it carries the crease relief, which is per-sheet), and a rebake that
       * went back to `o.name` would silently revert the collector's own words the first time they
       * advanced the press. The same class of bug as the seed that re-rolls: nothing errors, the
       * card simply stops saying what you typed. */
      const TEXT = { name: o.name, sub: o.sub || '', number: (o.number | 0) || 0 };
      /* ── ⚑ AND RARITY IS STATE FOR THE SAME REASON, ONE STEP FURTHER ──────────────────────
       * It was read out of `o` at all five sites, which made it a BUILD ARGUMENT — so the forge's
       * rarity chips could only change the frame by reloading the whole page, and the one control
       * that reloads is the one an artist stops touching. It never needed to be: rarity reaches
       * the card through exactly two doors, `buildType`'s border sorts and the `uFrameFoil`
       * uniform, and BOTH are re-derivable in place. The type plate is already re-baked by
       * `setText` and on every pull; the foil is read fresh every frame at `render()`. Holding it
       * here rather than in `o` is the whole of what makes `setRarity` possible.
       * ⚠ It must survive a PULL and a RESEED for the same reason the words do — a rebake that
       *   went back to `o.rarity` would silently revert the chosen frame the first time the press
       *   advanced, which is the bug this comment's neighbour was written about. */
      let RAR = o.rarity;
      /* the fount the card is set in, kept so the ASCII loops draw from the SAME committed
       * outlines the name does — no font ships, and no second fetch to get one */
      const SPRITE_TYPE = o.type;
      /* ⛔ THE PRINTER'S MARKS, OFF UNLESS ASKED FOR. Held beside RAR and for the identical
       * reason: `pull(0)` and the first type bake both run ABOVE the `const S` block, so
       * reading this off S would throw in the temporal dead zone and take the whole card down
       * before anything existed to report it. Fourth sighting of that trap in this repo. */
      let MARKS = !!o.marks;

      /* ── ⚑ TEMPERAMENT — the same market, worn differently ──────────────────────────────
       * Studied off RELICS (docs/RELICS-STUDY.md): the market falls for all of them at once,
       * and yet "a fragile Sacred Shard darkens toward collapse while a Buried Monolith merely
       * dims." The shared reading is shared; how a given object WEARS it comes out of its own
       * identity.
       * ⛔ WITHOUT THIS THE DECK IS ONE METER IN A HUNDRED COPIES, and the giveaway was one
       *   line: `uDmg` was `(burn, burn*0.9, burn*0.5, burn)` — fixed ratios, identical on every
       *   card, so all 100 cards degraded in exactly the same proportion at exactly the same
       *   rate. A collector could never learn a card's temperament because it did not have one.
       * ⚑ IT IS A MATERIAL PROPERTY, NOT A RANDOM NUMBER — which is what keeps it inside
       *   DESIGN-SYSTEM §1 instead of being noise. This sheet's stock is more absorbent, its
       *   cyan film thinner, its blanket more worn. Those are things a real sheet differs in,
       *   and they are exactly the things that decide how a press failure lands on it.
       * ⚠ MEAN 1.0 ON EVERY AXIS, DELIBERATELY. This REDISTRIBUTES the response across the deck;
       *   it does not make the deck as a whole darker or lighter. A temperament whose mean drifts
       *   is a global grade wearing a per-card costume, and it would quietly invalidate every
       *   burn figure already measured against this renderer. */
      const makeTemper = (s) => {
        const r = rng(s ^ 0x6C8E9CF5);
        const about1 = (spread) => 1 - spread + r() * spread * 2;
        return {
          plate: [about1(0.45), about1(0.45), about1(0.55), about1(0.40)],
          screen: about1(0.55),          // how far the ruling coarsens as the press starves
          starve: about1(0.60),          // how fast the roller runs dry
          foil: about1(0.40),            // how hard price drives the die edge
        };
      };
      let TEMPER = makeTemper(seed);
      /* ⚠ uBack IS 6 AND THE SIX-PLATE UNITS START AT 7. Both branches added textures and both
       * reached for the next free slot, so the wash plate and the card's BACK both landed on unit
       * 6 — and a duplicated unit does not error, it silently paints one with the other. This
       * file's own note two screens up records exactly that failure. */
      const UNIT = { uPigA: 0, uPigB: 1, uPigC: 2, uComp: 3, uType: 4, uStock: 5, uBack: 6,
                     uPigD: 7, uPigE: 8, uPigF: 9, uComp2: 10, uSpriteTex: 11 };
      /* ⚠ MIPPED, and finding this took an isolation pass. The card came back covered in fine
       * chroma speckle and the obvious suspect was the new material — but switching every relief
       * term to zero changed nothing, which ruled the normals out in one shot and pointed at the
       * ALBEDO. The mid plate is sampled at 1.9x MINIFICATION and the figure a little under 1:1,
       * so without mips each pixel takes one arbitrary texel out of a 683x1024 scan. It is the
       * same undersampling as the stock texture, one layer up, and it was there before any of
       * this material work — the PBR pass only made it legible by sharpening the surface. */
      let texA = texFrom(gl, imgs[0], UNIT.uPigA, gl.REPEAT, true);
      let texB = texFrom(gl, imgs[1], UNIT.uPigB, gl.REPEAT, true);
      let texC = texFrom(gl, imgs[2], UNIT.uPigC, gl.CLAMP_TO_EDGE, true);
      /* ⚑ WRAP MODE IS PER ROLE, NOT PER SLOT-NUMBER. Ground and mid are sampled well outside
       * 0..1 (one is zoomed to a field, the other mirrored at another scale), so they REPEAT;
       * the figure is cropped near card size and must CLAMP or it tiles a face. A plate swap has
       * to carry the role's wrap with it — reuploading all three as REPEAT puts a grid of tiny
       * faces where the figure should be, which reads as a composition bug rather than a
       * sampler one. */
      /* wash and strip are sampled far outside 0..1 (a field and a tiled scrap), the inset is a
       * tight crop and must CLAMP for the same reason the figure does. */
      const PIG_WRAP = [gl.REPEAT, gl.REPEAT, gl.CLAMP_TO_EDGE,
                        gl.REPEAT, gl.REPEAT, gl.CLAMP_TO_EDGE];
      let texD = texFrom(gl, imgs[3], UNIT.uPigD, PIG_WRAP[3], true);
      let texE = texFrom(gl, imgs[4], UNIT.uPigE, PIG_WRAP[4], true);
      let texF = texFrom(gl, imgs[5], UNIT.uPigF, PIG_WRAP[5], true);
      let compCanvas = buildComp(seed, 512);
      let texComp = texFrom(gl, compCanvas, UNIT.uComp);
      let comp2Canvas = buildComp2(seed, 512);
      let texComp2 = texFrom(gl, comp2Canvas, UNIT.uComp2);
      /* ⚠ ALWAYS BOUND, even with no sprites and no module. An unbound sampler2D is not a no-op
       * on SwiftShader — recorded in this repo — so a card with the loops switched off still
       * needs a texture there. A 1x1 black pixel is "no ink anywhere", which is exactly right. */
      const blankSheet = (() => {
        const b = document.createElement('canvas'); b.width = b.height = 1;
        const bg = b.getContext('2d'); bg.fillStyle = '#000'; bg.fillRect(0, 0, 1, 1); return b;
      })();
      let SPRITE = null;                       // {canvas, frames, cols, rows, kind}
      /* ⚑ WHERE THEY LAND IS THE SEED'S, NOT THE UI'S. Four slots of (cx, cy, scale, rotation),
       * re-derived whenever the seed changes so a card's loops belong to that card the way its
       * pigment and its border do. ⚠ Kept OFF the figure's centre — a loop over the subject's
       * face is a defacement, not an ornament. */
      let SPRITE_PLACE = new Float32Array(16);
      function placeSprites() {
        const r = rng(seed ^ 0x1D2C6FE3);
        for (let i = 0; i < 4; i++) {
          const edge = r();
          const cx = edge < 0.5 ? 0.16 + r() * 0.20 : 0.64 + r() * 0.20;
          const cy = 0.16 + r() * 0.66;
          SPRITE_PLACE[i * 4 + 0] = cx;
          SPRITE_PLACE[i * 4 + 1] = cy;
          SPRITE_PLACE[i * 4 + 2] = 0.14 + r() * 0.13;      // scale, in uv
          SPRITE_PLACE[i * 4 + 3] = (r() - 0.5) * 0.9;      // rotation, radians
        }
      }
      placeSprites();
      let texSprite = texFrom(gl, blankSheet, UNIT.uSpriteTex);
      let texType = texFrom(gl, buildType(o.type, seed, 512, 0, TEXT.name, RAR, TEXT.sub, MARKS), UNIT.uType);
      let stockCanvas = buildStock(seed, 256);
      let texStock = texFrom(gl, stockCanvas, UNIT.uStock, gl.REPEAT, true);
      /* the reverse. Rebuilt whenever the words, the number or the seed change — it carries
       * all three, so a card whose back disagreed with its front would be a different card. */
      let backCanvas = buildBack(seed, 512, TEXT.name, TEXT.number, o.rarity, TEXT.sub);
      let texBack = texFrom(gl, backCanvas, UNIT.uBack);
      let backIsDesigned = false;   // true once a caller supplies the real designed back

      const U = n => gl.getUniformLocation(prog, n);
      const u = {
        rot: U('uRot'), eye: U('uEye'), flex: U('uFlex[0]'), proj: U('uProj'),
        reg: U('uReg[0]'), ink: U('uInk[0]'), ang: U('uAng[0]'), film: U('uFilm[0]'),
        nInk: U('uNInk'), split: U('uSplit'), nPig: U('uNPig'),
        sprite: U('uSprite'), spriteP: U('uSpriteP[0]'), frame: U('uFrame'),
        screen: U('uScreen'),
        press: U('uPress'), dmg: U('uDmg'), foilP: U('uFoilP'),
        keyDir: U('uKeyDir'), keyCol: U('uKeyCol'),
        fillDir: U('uFillDir'), fillCol: U('uFillCol'),
        rimDir: U('uRimDir'), rimCol: U('uRimCol'),
        rough: U('uRough'), relief: U('uRelief'), tile: U('uTile'), envOn: U('uEnvOn'),
        par: U('uPar'), seed: U('uSeed'), regGain: U('uRegGain'), regRad: U('uRegRadial'),
        elemZ: U('uElemZ[0]'), frameFoil: U('uFrameFoil'), mot: U('uMot'), backRGB: U('uBackRGB'),
      };
      [['uPigA', texA], ['uPigB', texB], ['uPigC', texC], ['uComp', texComp],
       ['uType', texType], ['uStock', texStock], ['uBack', texBack],
       ['uPigD', texD], ['uPigE', texE], ['uPigF', texF], ['uComp2', texComp2],
       ['uSpriteTex', texSprite]].forEach(([n, t]) => {
        gl.uniform1i(U(n), UNIT[n]);
        gl.activeTexture(gl.TEXTURE0 + UNIT[n]); gl.bindTexture(gl.TEXTURE_2D, t);
      });
      gl.uniform3fv(u.ink, new Float32Array([].concat.apply([], INK)));
      gl.uniform1fv(u.ang, new Float32Array(ANG));

      /* ── THE IMPRESSION ──────────────────────────────────────────────────────────────────
       * Everything a single pull off the press decides. Re-rolled only when the sheet advances,
       * never on a clock — see the header on why stillness won.
       * ⚑ Registration is stored ONCE, as one vector per plate, and the shader adds exactly that
       *   vector to every fragment of that plate. Acceptance 4 ("uniform per plate, not radial")
       *   is therefore structural: there is nowhere for a radius to enter. */
      const sheetState = { n: 0, reg: [], film: [1, 1, 1, 1, 1, 1], band: 9, phase: 0, starve: 0.05 };
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
        /* ⛔ THE TWO SPOT PLATES ARE DRAWN LAST, AND THE ORDER IS LOAD-BEARING. Widening the loop
         * above from 4 to 6 would have consumed four more numbers out of this impression's random
         * sequence BEFORE the film weights, the roller band, the phase and the starve — so every
         * one of those would land on a different value and EVERY CARD ALREADY SAVED would reprint
         * as a different card. Nothing would error; a hundred records would simply stop being
         * what they say they are. Drawing the extra plates after everything else leaves the four
         * process plates the exact sequence they have always had. */
        for (let p = 4; p < 6; p++) {
          sheetState.reg.push((r() - 0.5) * 0.020, (r() - 0.5) * 0.032);
        }
        sheetState.film.push(0.78 + r() * 0.30, 0.78 + r() * 0.30);
        gl.deleteTexture(texType);
        texType = texFrom(gl, buildType(o.type, seed, 512, n, TEXT.name, RAR, TEXT.sub, MARKS), UNIT.uType);
      }
      pull(0);

      // ── state ────────────────────────────────────────────────────────────────────────────
      const S = {
        flex: [0, 0, 0, 0, 0], flexV: [0, 0, 0, 0, 0],
        yaw: 0, yawV: 0, yawT: 0, pitch: 0, pitchV: 0, pitchT: 0,
        px: 0, py: 0, down: false, work: 0, lastX: 0, lastY: 0,
        burn: 0, price: 0.5, depth: 0.5, regGain: 1, regRad: 0, view: null,
        lightA: 2.36, envOn: 1, phase: 0, period: 8.0, spin: 1, arrive: 0, arriveRate: 0.62,
        stack: 1,        // how far the four elements separate through the card's thickness
        inks: 4,         // 4 = C M Y K · 6 = + orange and green, each on its own screen
        /* ⛔ THREE, AND THIS IS THE RENDERER'S DEFAULT — NOT THE FORGE'S BASE. They are different
         * questions and conflating them was caught by `test:hero` acceptance 4 within one run.
         * The artist's *"base means 1 card"* is about what the EDITOR opens at; this constant is
         * what EVERY OTHER SURFACE gets — `js/card-press.js` (and through it the binder, lens3d,
         * the deck tiles and `js/card-view.js`) and `cards/field.html` all build with the default.
         * Setting it to 1 turned every card on the site into a single deck card at card size, and
         * nothing would have said so. The forge pushes its own base through `applyAll`. */
        pigs: 3,         // 1 = one card · 3 = + ground/mid · 6 = + wash, strip, inset
        /* ⛔ ONE, AND THIS IS THE RENDERER'S DEFAULT — NOT THE FORGE'S BASE. Same distinction as
         * `pigs`, and I got it wrong the same way: the artist's "raw" is what the EDITOR opens
         * at, while this constant is what every other surface gets. Shipping 0 here took the
         * press character off every card on the site at once — even film, no roller band, no
         * starve, on the binder, the deck, lens3d and the field cards. The forge pushes its own
         * base through applyAll; the site keeps the card as it prints. */
        press: 1,        // the impression's own character: 0 = a clean pull, 1 = as it printed
        shadow: 1,       // how hard the lifted layers shade what is under them
        frame: 1,        // 1 = trim and border sorts · 0 = frameless, full bleed
        screen: 0,       // 0 = continuous tone (the artist's call) · 1 = the halftone stipple
        sprites: 0,      // how many hand-drawn loops are struck on the sheet (0..4)
        spriteRate: 1,   // loops per press revolution
        /* ⛔ WHICH WAY UP IT IS SITTING IS A PERSISTENT HALF-TURN, NOT A BOOLEAN AND NOT AN
         *   IMPULSE. `flip()` used to do `S.yawT += PI` and set a separate `faceUp` flag — and
         *   `advance()` overwrites `S.yawT` from the pointer on EVERY frame, so the half-turn
         *   survived exactly one tick. The card twitched and sprang straight back to its face
         *   while the flag said it had turned over. **The button worked, the label changed, and
         *   the card never flipped** — two representations of one fact, disagreeing, with
         *   nothing thrown. It only ever appeared to work in a still, where nothing advances.
         * ⚑ So there is ONE representation now: the pointer target is `pointer + faceTurn`, and
         *   `faceUp` is DERIVED from it rather than stored beside it. The shader was never at
         *   fault — it picks the back off `V.z < 0.0`, i.e. off the geometry, which is the one
         *   thing that cannot drift from where the card is actually pointing. */
        faceTurn: 0,     // 0 or PI
        motionKey: null, // an explicit choice overrides the seed's pick; null = the seed's
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

        /* The press runs. `phase` is the only quantity here that advances without you, and it
         * wraps rather than growing — an accumulating float would drift out of precision after a
         * few hours in a media slot and the loop would stop closing. */
        if (S.spin) { S.phase += dt / S.period; if (S.phase >= 1) S.phase -= Math.floor(S.phase); }
        // the first impression, once, on the way in
        if (S.arrive < 1) S.arrive = Math.min(1, S.arrive + dt * S.arriveRate);

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
        S.yawT = S.px * 0.42 + S.faceTurn; S.pitchT = -S.py * 0.30;
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
        /* ── ⛔ RAW MEANS RAW — artist, 2026-08-05: *"cards need to be raw on editor."* ────────
         * Registration and burn were already at zero and the card was STILL not raw, because
         * three of the press's characteristics were gated by nothing at all: the per-plate ink
         * FILM (measured at base: 0.947 / 1.053 / 0.975 / 1.03 — uneven inking), the roller BAND,
         * and the roller STARVE. All three are drawn fresh on every impression and were applied
         * unconditionally, so "no changes applied" still printed a sheet with uneven ink, a band
         * across it and a dry patch.
         * ⚑ THE TELL WAS THAT THE DIALS READ ZERO AND THE CARD DID NOT LOOK IT. A control panel
         *   showing base while the press prints character is the same divergence that hid the
         *   live-chain bug — the panel was honest about everything it knew about, and these three
         *   were not on it.
         * ⚠ SO THE IMPRESSION'S CHARACTER IS A DIAL NOW, not a constant. At 0 the sheet takes an
         *   even film, no band and no starve — a clean pull. At 1 it prints with the character
         *   this impression actually drew. The numbers are unchanged; what changed is that
         *   reaching them is a decision. */
        const pw = S.press;
        gl.uniform1fv(u.film, new Float32Array(
          sheetState.film.map(f => 1 + (f - 1) * pw)));
        gl.uniform1i(u.nInk, S.inks);
        /* ⚠ the split is what the spot plates TAKE, so it only has meaning at six. Held below 1
         * because an ink that took the whole overlap would leave magenta and yellow with nothing
         * in their shared hues and the rosette would come apart. */
        gl.uniform1f(u.split, S.inks > 4 ? 0.62 : 0.0);
        gl.uniform1i(u.nPig, S.pigs);
        gl.uniform1f(u.frame, S.frame);
        gl.uniform1f(u.screen, S.screen);
        /* ⚑ THE LOOP RUNS ON THE PRESS'S OWN CLOCK. A sprite with its own timer would be the one
         * thing on this card moving to a rhythm nothing else shares — and the brief's acceptance 2
         * is that the card is dead still until you touch it. Stopped press, stopped loop. */
        if (SPRITE && S.sprites > 0) {
          const fr = Math.floor(S.phase * SPRITE.frames * S.spriteRate) % SPRITE.frames;
          gl.uniform4f(u.sprite, SPRITE.cols, SPRITE.rows, fr, Math.min(S.sprites, 4));
          gl.uniform4fv(u.spriteP, new Float32Array(SPRITE_PLACE));
        } else {
          gl.uniform4f(u.sprite, 1, 1, 0, 0);
        }
        /* ⚠ THE SCREEN RULING IS THE WHOLE LEGIBILITY OF THE CARD, and the first cut had it an
         * octave too coarse: at ~118 cells across the dots WERE the picture and the artwork
         * underneath could not be read at all. A card is printed at a ruling you have to lean in
         * to see. ⚠ And 240 was an octave too FINE for the buffer — under ~3 device pixels per
         * dot the screen aliases into a moiré grid, which is a rendering failure dressed as a
         * print one. 170 is the compromise: a visible screen at 500px, a real one at 900. */
        /* ⚑ EVERY MARKET DIAL GOES THROUGH THE TEMPERAMENT. Same burn in, a different picture
         * out, per card — and the ratios between the four plates are now this card's rather than
         * the renderer's, so one sheet loses its cyan first and another its key. */
        const bT = S.burn;
        /* ⚠ the BAND is a frequency and the STARVE is an amplitude — scaling the frequency
         *   would just make the banding finer, so it is the starve (which multiplies it in the
         *   shader) that has to go to zero for a clean pull. Burn's own contribution is left
         *   alone: that is damage the collector asked for, not the sheet's character. */
        gl.uniform4f(u.press, 170 * (1 - 0.10 * bT * TEMPER.screen), sheetState.band,
                     sheetState.phase, sheetState.starve * pw + 0.20 * bT * TEMPER.starve);
        gl.uniform4f(u.dmg, clamp(bT * TEMPER.plate[0], 0, 1), clamp(bT * 0.9 * TEMPER.plate[1], 0, 1),
                            clamp(bT * 0.5 * TEMPER.plate[2], 0, 1), clamp(bT * TEMPER.plate[3], 0, 1));
        gl.uniform4f(u.foilP, 1.55, 0.30, 1.0 + 0.55 * S.price * TEMPER.foil, 0.34);
        /* ── THE THREE LIGHTS, IN WORLD SPACE ────────────────────────────────────────────
         * Key up-left and low, because a raking key is what makes relief read; a cool fill from
         * the right so the shadow side is not dead; a dim rim behind to find the die edge. The
         * key azimuth is a dial on the proof page, since the fastest way to see whether a
         * material is real is to move the light rather than the object. */
        /* ⛔ THE KEY ORBITS THE FACE, IT DOES NOT ORBIT THE CARD. The first rig swung the light
         * through a full circle in the xz plane, which put it BEHIND an opaque sheet for half the
         * sweep: N.L went negative, the diffuse term vanished and the card came out near black at
         * the default angle. A card is lit from the side you are looking at. z stays positive and
         * the azimuth walks the light around the face. */
        const ka = S.lightA;
        gl.uniform3f(u.keyDir, Math.cos(ka) * 0.74, Math.sin(ka) * 0.74, 0.58);
        /* ⚠ THESE ARE IRRADIANCES, NOT "brightness". The diffuse term is albedo/PI, which is the
         * correct Lambert BRDF and is also 3.14x dimmer than the ad-hoc `albedo * light` it
         * replaced — so the first PBR pass came out nearly black and read as a broken shader. If
         * you divide by PI you have to put the PI back in the light. */
        gl.uniform3f(u.keyCol, 4.05, 3.82, 3.42);
        gl.uniform3f(u.fillDir, 0.78, 0.10, 0.62);
        gl.uniform3f(u.fillCol, 0.86, 1.00, 1.30);
        gl.uniform3f(u.rimDir, -0.52, -0.40, 0.40);       // bounce off the table, low and behind
        gl.uniform3f(u.rimCol, 0.62, 0.58, 0.70);
        /* stock · ink film · foil · varnish. ⚑ The ink is SMOOTHER than the paper — a wet film
         * flows out flatter than the fibre it dried on, which is why a heavily-inked area on a
         * real card is the glossy part and why this cannot be one roughness. */
        gl.uniform4f(u.rough, 0.86, 0.52, 0.19, 0.90);
        gl.uniform4f(u.relief, 0.18, 0.90, 2.20, 0.10);
        gl.uniform2f(u.tile, 2.4, 3.6);
        gl.uniform1f(u.envOn, S.envOn);
        /* ── THE PRESS CYCLE, IN Z ────────────────────────────────────────────────────────
         * ⛔ THE LOOP MUST CLOSE EXACTLY. cos is periodic in phase with period 1 AND its
         *   derivative is 0 at both ends, so the wrap is C-1 continuous — no jump, and no visible
         *   flinch at the seam either, which is the failure a "looks fine" review never catches.
         *   `npm run test:hero` requires the frame at phase 0 and at phase 1 to be BYTE-identical.
         * ⚑ EACH ELEMENT LEADS OR LAGS. Driven together they are one zoom, which passes "did it
         *   move" and is not depth — the same weak question the wordmark rig had to answer. The
         *   offsets are what make the stack travel THROUGH itself. */
        /* ⛔ SEVEN PLANES, EVENLY SPACED THROUGH THE CARD. Ground rests against the backing at 0
         * and the type sits at the glass at 1; the five between are the layers that can actually
         * separate. ⚠ Even spacing is deliberate — bunching them would make two sources share a
         * plane again, which is exactly the defect this replaces. */
        const ZBASE = [0.00, 0.17, 0.34, 0.51, 0.68, 0.85, 1.00];
        /* ⚠ A MOTION CARRIES FOUR LEAD PHASES AND THERE ARE SEVEN ELEMENTS. Repeating the four
         *   would give elements 0 and 4 the same phase, i.e. two planes moving in lockstep — the
         *   lockstep this whole change exists to break. The fourth lead belongs to the TYPE, which
         *   is always last, and the five middle planes are spread across the first three. */
        const ML = MOTION.lead;
        const ZLEAD = [ML[0], ML[1], ML[2], (ML[0] + ML[1]) * 0.5 + 0.11,
                       (ML[1] + ML[2]) * 0.5 + 0.23, (ML[2] + ML[0]) * 0.5 + 0.37, ML[3]];
        /* ⚑ `S.stack` SCALES THE WHOLE STACK, rest positions and travel together, because those
         * are the two halves of one property: how far apart the four elements sit through the
         * card's thickness. Scaling only the travel would give a card whose layers separate when
         * it moves and lie flat when it stops — depth as an animation rather than as a build.
         * At 0 every element is coplanar (a flat print); at 1 it is the tuned default. */
        const zAmp = (0.085 + 0.055 * S.depth) * MOTION.amp * S.stack;
        const zc = i => ZBASE[i] * S.stack * (0.35 + 0.65 * (1 - Math.cos(TAU * (S.phase + ZLEAD[i]))) * 0.5)
                      + zAmp * (1 - Math.cos(TAU * (S.phase + ZLEAD[i]))) * 0.5;
        elemZ = [zc(0), zc(1), zc(2), zc(3), zc(4), zc(5), zc(6)];
        gl.uniform1fv(u.elemZ, new Float32Array(elemZ));
        /* ⚑ THE WRITE-ON IS ALSO AN ARRIVAL. `S.arrive` runs 0→1 once when the card is first
         * handled or opened, and it MULTIPLIES INTO the motion's own write-on — so every card
         * prints itself on the way in, and the one motion that reprints keeps doing it forever.
         * Two different events, one mechanism, and neither has to know about the other. */
        /* ⛔ AND THE MOTION IS LERPED TO ITS OWN NO-OP, because whether a stopped press was
         *   neutral DEPENDED ON WHICH FAILURE THE SEED DREW. `slur` at phase 0 is [1,0,0,1] and
         *   harmless; `roller` and `dry-down` open at 0.82 and 0.74 on the ink multiplier, so
         *   the same "base" card printed lighter or heavier purely by seed. A base that is not
         *   the same base on every card is not a base. [1,0,0,·] is the identity here: full ink,
         *   no slur, no doubling. */
        const mvRaw = MOTION.mot(S.phase);
        const mv = [1 + (mvRaw[0] - 1) * pw, mvRaw[1] * pw, mvRaw[2] * pw, mvRaw[3]];
        gl.uniform4f(u.mot, mv[0], mv[1], mv[2], Math.min(mv[3], S.arrive));
        /* ⚑ AND IT BREATHES WITH THE PRESS. The higher the tier the more the frame answers the
         * cycle — at the impression the foil is flat to the sheet, away from it the border lifts
         * and catches. Same clock as the stack, so nothing has its own tempo. */
        const rf = FOIL_BY_RARITY[RAR] !== undefined ? FOIL_BY_RARITY[RAR] : 0;
        gl.uniform1f(u.frameFoil, rf * (0.72 + 0.28 * (1 - Math.cos(TAU * S.phase)) * 0.5));
        /* ⛔ THE PARALLAX GAIN IS THE DEPTH, so it rides the stack. At 0.030 a layer moved 3% of
         * the card between dead-on and a hard tilt, which is below the threshold of "that one is
         * further away" — it read as nothing, and the constant bearings read as everything. Scaled
         * by the stack it reaches ~0.29 at LAYERS 2.5, i.e. a near layer sweeps a third of the
         * card across a far one as you turn it. ⚠ At LAYERS 0 this is the old value times zero:
         * the base card has no depth and no parallax, which is what a flat print is. */
        gl.uniform2f(u.par, (0.030 + 0.020 * S.depth) * (1.0 + 6.2 * S.stack), S.shadow);
        gl.uniform1f(u.seed, (seed % 997) / 997);
        gl.uniform1f(u.backRGB, backIsDesigned ? 1.0 : 0.0);
        gl.uniform1f(u.regGain, S.regGain);
        gl.uniform1f(u.regRad, S.regRad);
        gl.activeTexture(gl.TEXTURE0 + UNIT.uType); gl.bindTexture(gl.TEXTURE_2D, texType);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      }

      // ── the rAF driver, which is a CONVENIENCE and never the source of truth ─────────────
      let elemZ = [0, 0, 0, 0, 0, 0, 0];     // last frame's stack depths, for the harness
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

        /* ⚠ THE BACK CARRIES THE WORDS AND THE NUMBER, so it is re-struck whenever either
         *   moves. A front that says one thing and a back that says another is two cards. */
        const rebake = () => {
          /* ⚠ NEVER OVER-STRIKE A DESIGNED BACK. Re-generating on a reseed or a setText would
           *   silently swap the artist's back for the stand-in — which looks like the design
           *   reverting itself, and is the worst kind of wrong because nothing errors. */
          if (backIsDesigned) return;
          gl.deleteTexture(texBack);
          backCanvas = buildBack(seed, 512, TEXT.name, TEXT.number, o.rarity, TEXT.sub);
          texBack = texFrom(gl, backCanvas, UNIT.uBack);
        };
      const ctrl = {
        version: VERSION,
        canvas: canvas,             // js/card-export.js needs it for toBlob
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
        // the key light's azimuth, radians. Moving the LIGHT is the fastest way to find out
        // whether a surface is a material or a picture of one.
        setLight: a => { S.lightA = a; },
        /* ── ⚑ THE FORGE'S REMAINING KNOBS — artist, 2026-08-05 ────────────────────────────
         * *"the press needs more creation options (layered card) animated card / collaged card
         * / registration etc — these should all be settings so I can create the final 100."*
         * Everything else the forge needs was already a setter; these two were not, and they are
         * the two the artist named first.
         * ⚠ THEY ARE STATE, NOT ARGUMENTS. A card is only reproducible if every knob round-trips
         *   through `probe()` and back — a setting that exists but cannot be read back cannot be
         *   saved, and a card that cannot be saved is not a card in a hundred-card deck. */

        /* LAYERED — how far the four elements separate through the card's thickness.
         * 0 = coplanar, a flat print. 1 = the tuned default. Above 1 the stack exaggerates. */
        setStack: k => { S.stack = clamp(k, 0, 3); },

        /* ── ⛔ THE PLATE SEPARATOR: FOUR PLATES OR SIX ────────────────────────────────────
         * `setInks(6)`. Artist, 2026-08-05: *"i need my plate separator to have up to 6 plates …
         * that is a toggle that just creates the card with 6 plates as before."*
         * ⚑ IT IS A TOGGLE, NOT A DIAL, because there is no such thing as four and a half plates
         *   — a press either has a unit for an ink or it does not. Anything not 6 is 4.
         * ⚠ NO REBAKE AND NO PULL. The two extra plates already have their registration and their
         *   film weight in this impression (drawn at the end of `pull`, see the note there), so
         *   flipping the separator prints the SAME SHEET with two more units inked — which is
         *   what it would mean on a press. Re-rolling the impression here would make the toggle
         *   silently change the card's identity as well as its separation. */
        setInks: n => { S.inks = (n | 0) === 6 ? 6 : 4; return S.inks; },

        /* ── THE COLLAGE: THREE SOURCES OR SIX ────────────────────────────────────────────
         * The other half of the artist's "6 plates". All six textures are always resident and
         * always current — this only decides how many the composition READS, so the toggle is a
         * uniform and nothing is loaded, baked or re-rolled when it flips. That is what lets it
         * be a toggle you flick back and forth while looking at the card, which is the whole
         * point of it being a toggle rather than a rebuild. */
        /* ⚠ 1, 3 or 6 and nothing between — each is a different COMPOSITION, not a strength.
         *   Anything else snaps down to the nearest real one rather than being rejected, so a
         *   stale link cannot land the press on a count the shader has no branch for. */
        setPigs: n => { n = n | 0; S.pigs = n >= 6 ? 6 : (n >= 3 ? 3 : 1); return S.pigs; },

        /* ── ⛔ THE HAND-DRAWN LOOPS ───────────────────────────────────────────────────────
         * `setSprites({kind, count, frames, rate})`. Builds a sheet with js/card-sprites.js and
         * strikes up to four of them into the print. `count: 0` takes them off.
         * ⚑ FAILS OPEN AT EVERY STEP, like everything else here: no module, a generator that
         *   throws, a canvas that will not allocate ⇒ the sheet is null, the count goes to zero
         *   and the card is exactly the card it was. A decoration must never be able to cost you
         *   the card it decorates.
         * ⚠ Rebuilding the sheet is a texture upload, so it happens on a SETTING change and never
         *   per frame — the frame index is a uniform, which is the whole reason it is one sheet
         *   with cells rather than a texture per frame. */
        /* how hard a lifted layer shades what is beneath it. 0 removes the shadows entirely,
         * which is also the control the acceptance measurement uses. */
        setShadow: v => { S.shadow = clamp(v, 0, 1.6); },
        /* ⚑ A UNIFORM, NOT A REBAKE. The trim and the sorts are already in the composition and
         * type plates; frameless simply stops PRINTING them, which is what a press would do. So
         * the toggle is instant and the card's identity — its seed, its impression, its words —
         * is untouched. Re-baking would have re-rolled nothing and cost a texture upload. */
        setFrame: on => { S.frame = on ? 1 : 0; render(); return !!S.frame; },
        /* the halftone. 0 lays the ink in continuous tone; 1 is the screened print. */
        setScreen: v => { S.screen = clamp(v, 0, 1); render(); },
        setSprites: o => {
          o = o || {};
          const n = Math.max(0, Math.min(4, o.count === undefined ? S.sprites : (o.count | 0)));
          if (typeof o.rate === 'number') S.spriteRate = clamp(o.rate, 0.25, 8);
          if (n === 0) { S.sprites = 0; render(); return { count: 0, kind: SPRITE && SPRITE.kind }; }
          const want = o.kind || (SPRITE && SPRITE.kind) || null;
          const need = !SPRITE || (want && SPRITE.kind !== want)
                       || (o.frames && SPRITE.frames !== (o.frames | 0));
          if (need && global.CardSprites) {
            const made = global.CardSprites.sheet({
              seed: seed, kind: want, type: o.type || o.alphabet || (o.spec || SPRITE_TYPE),
              frames: o.frames || 12, cell: 128 });
            if (made && made.canvas) {
              gl.deleteTexture(texSprite);
              texSprite = texFrom(gl, made.canvas, UNIT.uSpriteTex);
              SPRITE = made;
            }
          }
          S.sprites = SPRITE ? n : 0;            // no sheet, no sprites — never a broken card
          render();
          return { count: S.sprites, kind: SPRITE && SPRITE.kind,
                   frames: SPRITE && SPRITE.frames };
        },
        spriteKinds: () => (global.CardSprites ? global.CardSprites.kinds() : []),

        /* ── HOW HARD THE PRESS RAN ───────────────────────────────────────────────────────
         * 0 is a clean pull: even film across every plate, no roller band, no starve, and the
         * motion sitting at its own identity. 1 is the impression as this sheet actually drew it.
         * ⚠ It does NOT touch registration or burn — those have their own dials and always did.
         *   This is the character that used to arrive whether or not anybody asked for it. */
        setPress: v => { S.press = clamp(v, 0, 1); },

        /* ── THE PLATE-PROOF FURNITURE ────────────────────────────────────────────────────
         * `setMarks(true)` puts the crop targets and the colour bar back. Off is the default:
         * they are what a printer strikes on a CHECK sheet, and on a finished card they read as
         * damage. Rebakes the type plate at the current sheet, exactly like setText and setRarity
         * — same sheet in, same sheet out, so the impression is untouched. */
        setMarks: on => {
          const want = !!on;
          if (want === MARKS) return false;
          MARKS = want;
          gl.deleteTexture(texType);
          texType = texFrom(gl, buildType(o.type, seed, 512, sheetState.n, TEXT.name, RAR, TEXT.sub, MARKS), UNIT.uType);
          render();
          return true;
        },

        /* ANIMATED — which press failure this card performs. Eight named presets, and the list
         * is READ from the module rather than typed into the UI, so adding a ninth does not need
         * an edit in two places. `null` hands it back to the seed. */
        setMotion: k => {
          S.motionKey = k || null;
          MOTION = (S.motionKey && byKey(S.motionKey)) || (o.motion && byKey(o.motion)) || motionFor(seed);
          return MOTION.key;
        },
        // the press cycle: 0..1 round one revolution. `spin` stops it dead for a still frame.
        setPhase: p => { S.phase = ((p % 1) + 1) % 1; },
        // print it on again from nothing — and 1 skips straight to a finished sheet
        writeOn: (v) => { S.arrive = v === undefined ? 0 : clamp(v, 0, 1); },
        setSpin: on => { S.spin = on ? 1 : 0; },
        setPeriod: sec => { S.period = Math.max(0.5, sec); },
        /* ⛔ THE ENVIRONMENT SWITCH IS THE ANTI-WASH ASSERTION'S CONTROL. Off, the metal loses its
         * reflection and the ARTWORK must not change by a single byte. */
        setEnv: on => { S.envOn = on ? 1 : 0; },
        setRegistration: (g, radial) => {
          S.regGain = clamp(g, 0, 3);
          S.regRad = clamp(radial || 0, 0, 1);
        },
        pull: () => pull(sheetState.n + 1),
        /* ── SET THE CARD'S OWN WORDS ─────────────────────────────────────────────────────
         * `setText({name, sub})`. Re-bakes the type plate at the CURRENT sheet, so the words
         * change without advancing the press — typing your name should not re-roll the
         * registration, the film weights or the crease pattern, which is what calling `pull`
         * would have done. Same sheet in, same sheet out; only the words differ.
         * ⚠ Unknown characters are DROPPED by `setLine`, not substituted and never thrown on:
         *   the alphabet is 68 committed outlines and an emoji is simply not in the fount. A
         *   card that refuses to print because of one character is worse than one that sets the
         *   rest, and `build-card-type.py` is where a missing glyph is supposed to fail loudly. */
        setText: t => {
          if (!t) return;
          if (typeof t.name === 'string') TEXT.name = t.name;
          if (typeof t.sub === 'string') TEXT.sub = t.sub;
          if (typeof t.number === 'number') TEXT.number = t.number | 0;
          rebake();
          gl.deleteTexture(texType);
          texType = texFrom(gl, buildType(o.type, seed, 512, sheetState.n, TEXT.name, RAR, TEXT.sub, MARKS), UNIT.uType);
          render();
        },
        text: () => ({ name: TEXT.name, sub: TEXT.sub, number: TEXT.number }),
        /* ── ⛔ THE FRAME FAMILY, LIVE — and it is the control that had to stop reloading ─────
         * `setRarity('epic')`. Rarity picks the border SORTS family and the foil weight; the seed
         * picks which frame out of that family. Both doors are re-derivable in place, so this is
         * `setText` with one more thing rebaked — the type plate carries the border, and the foil
         * uniform is read fresh every frame.
         * ⚑ WHY IT MATTERS MORE THAN IT LOOKS: this was the last control in the forge that could
         *   only act by reloading the page, and a reload costs the card's whole arrival — the
         *   press prints on from nothing, the scroll position resets, and the artist is looking
         *   at a fresh page instead of at the change they just made. A comparison you cannot
         *   make side by side is one nobody makes, so the ladder went unlooked-at.
         * ⚠ Same sheet in, same sheet out. Changing the frame must not re-roll the registration,
         *   the film weights or the crease pattern — those belong to the impression, not to the
         *   tier, and `pull` is the only thing allowed to touch them. */
        setRarity: r => {
          if (typeof r !== 'string' || !r || r === RAR) return false;
          RAR = r;
          gl.deleteTexture(texType);
          texType = texFrom(gl, buildType(o.type, seed, 512, sheetState.n, TEXT.name, RAR, TEXT.sub, MARKS), UNIT.uType);
          render();
          return true;
        },
        rarity: () => RAR,
        /* ── ⛔ THE DESIGNED BACK GOES HERE. THE GENERATED ONE IS ONLY A STAND-IN ─────────────
         * Artist, 2026-08-05: *"the backs are already designed."* They are — the vintage
         * sports-card back in `cards/cardback.css`, on all 196 card pages: manila stock, the
         * torn-paper punch-through, the roundel, the gold name band, the trivia with its answer
         * printed upside down, the vitals, the statistics table, the trait tags.
         * ⛔ I BUILT A NEW ONE INSTEAD OF LOOKING FOR THE ONE THAT EXISTED. That is the mistake
         *   this repo warns about in its own words — *"when unsure what something should look
         *   like, the answer is look at the artist's own work"* — and it cost a round.
         * ⚑ `js/card-back.js` rasterises the REAL markup through an SVG foreignObject, so what
         *   lands on the reverse is the designed back itself with that card's own content, not a
         *   redraw of it that would drift the first time the design changed.
         * ⚠ `buildBack` stays as the fallback for a caller that has no designed back to hand (a
         *   forge proof, a card with no page yet). A stand-in is fine; a stand-in that silently
         *   replaces the real thing is not, which is why this setter exists at all. */
        setBack: src => {
          if (!src) return false;
          try {
            gl.deleteTexture(texBack);
            texBack = texFrom(gl, src, UNIT.uBack);
            backIsDesigned = true;
            render();
            return true;
          } catch (e) { return false; }
        },
        backIsDesigned: () => backIsDesigned,
        /* ⚑ TURN IT OVER. The press already renders the reverse whenever the card is past
         *   edge-on; this is the deliberate version of that for a viewer's flip button. */
        flip: () => { S.faceTurn = S.faceTurn ? 0 : Math.PI; return !S.faceTurn; },
        faceUp: () => !S.faceTurn,
        /* ── ⚑ PRINT A DIFFERENT CARD ON THE SAME PRESS ──────────────────────────────────
         * `reseed(seed) -> bool`. Everything the seed decides — the composition masks, the
         * paper stock, the temperament, the press motion, the impression — re-derived in place.
         *
         * ⛔ THIS IS THE SAME RULE AS `setPigment`, ONE LEVEL UP, AND IT IS WHY THE PRESS CAN
         *   BE THE SITE'S CARD RENDERER AT ALL. `canvas.getContext('webgl2')` hands back the
         *   SAME context on a second call and `build()` never releases, so "show the next card"
         *   cannot mean "build again" — a binder you page through would leak a program, a vertex
         *   buffer and six textures per card, and nothing would throw. A card is a set of
         *   textures on one press; changing cards changes the textures.
         * ⛔ AND WITHOUT IT EVERY CARD ON THE SITE WOULD WEAR ONE TEMPERAMENT. `TEMPER`, the
         *   composition, the crease pattern and the registration are all functions of the seed
         *   and were all frozen at build. Reusing one press across a deck without re-deriving
         *   them is precisely the "one meter in a hundred copies" failure that TEMPER was added
         *   to end (docs/RELICS-STUDY.md §2) — arriving by the back door, through reuse.
         * ⚠ The sheet returns to impression 0 and the write-on restarts, because this is a
         *   different card and not a further pull of the one you were holding. */
        reseed: s => {
          const next = (s >>> 0) || 3030;
          if (next === seed) return false;
          seed = next;
          TEMPER = makeTemper(seed);
          /* ⚠ an EXPLICIT choice survives a reseed. Without this, choosing a motion and then
           *   re-rolling the seed silently reverts to the seed's pick — the same class of
           *   bug as setText being lost on a pull. */
          MOTION = (S.motionKey && byKey(S.motionKey)) || (o.motion && byKey(o.motion)) || motionFor(seed);
          gl.deleteTexture(texComp);
          compCanvas = buildComp(seed, 512);
          texComp = texFrom(gl, compCanvas, UNIT.uComp);
          /* ⚠ the second mask plate is a function of the seed too. Leaving it behind would put
           * the new card's extra sources exactly where the old card's were — a reseed that only
           * half re-derives the composition. */
          gl.deleteTexture(texComp2);
          comp2Canvas = buildComp2(seed, 512);
          texComp2 = texFrom(gl, comp2Canvas, UNIT.uComp2);
          gl.deleteTexture(texStock);
          stockCanvas = buildStock(seed, 256);
          texStock = texFrom(gl, stockCanvas, UNIT.uStock, gl.REPEAT, true);
          placeSprites();          // the loops belong to the card, so they move with the seed
          pull(0);                 // a fresh impression — and it rebakes the type at the new seed
          rebake();                // …and the reverse, which is seeded too
          S.arrive = 0;            // the sheet prints on again, so a card SWAP is a press event
          render();
          return true;
        },
        seed: () => seed,
        /* ── ⚑ THE FORGE: PUT A DIFFERENT PLATE ON THE PRESS ──────────────────────────────
         * `setPigment([ground, mid, figure]) -> Promise<bool>`. Three deck cards, in ROLE
         * order, swapped into the live card.
         * ⛔ IT MUST NOT BE A REBUILD, and this is the hazard that decides the whole design.
         *   `canvas.getContext('webgl2')` returns the SAME context on a second call, and
         *   `build()` never releases the first card's program, buffers or six textures — so
         *   calling it twice on one canvas leaks everything and leaves two cards fighting over
         *   the same uniforms. Nothing throws. Swapping three textures in place is not an
         *   optimisation, it is the only correct move.
         * ⚑ AND IT ANSWERS §4, WHICH A PICKER ON ITS OWN DOES NOT. Choosing a plate is a
         *   PHYSICAL act — the press takes the new plate and the sheet prints again — so the
         *   write-on is re-run rather than the card cutting to the new image. The forge's
         *   feedback and the write-on are the same mechanism, not two features.
         * ⚠ Fails open and ATOMICALLY: if any of the three images will not load, nothing is
         *   swapped and the card keeps the plates it had. A half-applied composition (new
         *   ground, old figure) is a card nobody chose. */
        /* ⚠ THREE OR SIX. Handing it three swaps the first three roles and leaves wash, strip and
         *   inset exactly as they were — which is what the panel does while the collage is set to
         *   three, and it means turning the collage up does not silently discard a composition. */
        setPigment: urls => {
          const n = urls && urls.length;
          if (!urls || (n !== 3 && n !== NPIG) || !urls.every(Boolean)) return Promise.resolve(false);
          const SLOT = ['uPigA', 'uPigB', 'uPigC', 'uPigD', 'uPigE', 'uPigF'];
          return Promise.all(urls.map(loadImage)).then(next => {
            if (next.some(i => !i)) return false;            // atomic: all of them, or none
            const live = [texA, texB, texC, texD, texE, texF];
            const old = live.slice(0, n);
            const made = next.map((im, i) => texFrom(gl, im, UNIT[SLOT[i]], PIG_WRAP[i], true));
            if (n > 0) texA = made[0];
            if (n > 1) texB = made[1];
            if (n > 2) texC = made[2];
            if (n > 3) { texD = made[3]; texE = made[4]; texF = made[5]; }
            old.forEach(t => gl.deleteTexture(t));
            for (let i = 0; i < n; i++) pig[i] = urls[i];    // so probe() reports what is ON it
            S.arrive = 0;                                    // the sheet prints again
            render();
            return true;
          }).catch(() => false);
        },
        /* The material maps themselves, so they can be LOOKED AT and measured rather than
         * inferred from the lit result. `stock` is RG = the fibre normal, B = a roughness jitter;
         * `comp` is R strips / G figure window / B trim. Both are generated, both tile or clamp
         * as the shader expects, and a harness that can read them can assert a property of the
         * TEXTURE instead of guessing at it through three lights and an environment. */
        maps: () => ({ stock: stockCanvas, comp: compCanvas }),
        probe: () => ({
          sheet: sheetState.n,
          reg: sheetState.reg.slice(),
          film: sheetState.film.slice(),
          flex: S.flex.slice(),
          flexV: S.flexV.slice(),
          maxFlex: S.flex.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
          yaw: S.yaw, pitch: S.pitch, work: S.work,
          burn: S.burn, price: S.price, depth: S.depth,
          /* exposed so a harness can assert the SPREAD across seeds rather than eyeball it */
          temper: { plate: TEMPER.plate.slice(), screen: TEMPER.screen,
                    starve: TEMPER.starve, foil: TEMPER.foil },
          regGain: S.regGain, regRad: S.regRad, lightA: S.lightA, envOn: S.envOn,
          phase: S.phase, period: S.period, spin: S.spin,
          motion: MOTION.key, motionKey: S.motionKey, stack: S.stack, arrive: S.arrive,
          inks: S.inks, pigs: S.pigs, press: S.press, marks: MARKS,
          shadow: S.shadow, frame: !!S.frame, screen: S.screen,
          sprites: S.sprites, spriteKind: SPRITE && SPRITE.kind,
          spriteFrames: SPRITE && SPRITE.frames, spriteRate: S.spriteRate,
          faceUp: !S.faceTurn, faceTurn: S.faceTurn,
          number: TEXT.number, backIsDesigned: backIsDesigned,
          seed: seed,
          rarity: RAR || null, frameFoil: FOIL_BY_RARITY[RAR] || 0,
          elemZ: elemZ.slice(),
          pigment: pig.slice(),
        }),
        /* ⛔ AND IT RELEASES THE CONTEXT, WHICH IS NOT TIDINESS. A browser caps live WebGL
         *   contexts at around sixteen and silently drops the OLDEST when a new one is asked
         *   for. Every surface that builds a press on a fresh canvas — the pack reveal rebuilds
         *   its card on every pull, the folder on every deep link — leaks one per visit, so the
         *   seventeenth rip does not fail: it blanks a card somebody opened ten minutes ago,
         *   with nothing thrown and nothing logged. `WEBGL_lose_context` is the only way to hand
         *   one back; stopping the loop merely stops drawing into it.
         * ⚠ Best-effort by design — the extension is optional, and a browser without it is no
         *   worse off than before this line existed. */
        destroy: () => {
          loop(false);
          try {
            const ext = gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
          } catch (e) {}
        },
      };
      return ctrl;
    }).catch(() => null);
  }

  /* the motion names, so a UI never hard-codes a list this file owns */
  const motionKeys = () => MOTIONS.map(m => m.key);
  global.HeroCard = { build: build, VERSION: VERSION, INK: INK, ANG: ANG, motionKeys: motionKeys,
    MOTIONS: MOTIONS.map(m => m.key) };
})(window);

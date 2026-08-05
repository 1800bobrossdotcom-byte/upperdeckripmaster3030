/* ripmaster3030studios — EVERY CARD IS A PRINT NOW.   `CardPress`
 *
 *   CardPress.pool(base)              -> Promise<[{art,title,key}]>   the deck, both manifests
 *   CardPress.seedFor(card)           -> uint32        stable DNA — the same card always prints
 *                                                      the same way, on any machine, forever
 *   CardPress.platesFor(card, pool)   -> [ground, mid, figure]
 *   CardPress.live({canvas, base})    -> Promise<ctrl|null>    ONE press, reused
 *       ctrl.show(card)               -> Promise<bool>         put this card on it
 *       ctrl.source()                 -> HTMLCanvasElement     what Card3D textures from
 *       ctrl.press                    -> the HeroCard controller
 *   CardPress.bake(card, {base,w,h})  -> Promise<canvas|null>  one still, for a grid
 *
 * Artist, 2026-08-05: *"WE NEED TO COMBINE THIS PROCESS [cards/lens3d.html] LAYERED WITH THIS
 * PROCESS AND FX [cards/proof.html] … I WANT THE SECOND AS THE MAIN WAY ALL CARDS ARE DISPLAYED,
 * SO THERE, BINDER, BINDER POPUP, CARD DECK POPUPS, THE DECK BROWSER, ETC."*
 *
 * ══ WHAT THE COMBINATION ACTUALLY IS ═══════════════════════════════════════════════════════
 * It is the composition `js/hero-card.js`'s own header already named and left for later:
 * **the press draws the ARTWORK and card3d frames it.** Two renderers, one card:
 *
 *   js/hero-card.js  generates the FACE   — four-colour separation, its own registration per
 *                                           plate, screens at four angles, paper fibre, ink that
 *                                           multiplies the stock, a metal foil die edge
 *   js/card3d.js     supplies the OBJECT  — thickness, bevel, the travelling holo sweep, the
 *                                           parallax rig, and a colour pipeline that was measured
 *
 * Neither renderer changes. This file is the seam, and it is a seam rather than a merge because
 * the two files fix different bugs: card3d's fixes are about reproducing someone's drawing
 * faithfully, and every line of hero-card is about damaging a print on purpose. Merging them
 * would put those two intents in one place and the honest one would lose.
 *
 * ══ ⛔ THE DRAWING IS THE FIGURE. IT IS NOT WALLPAPER ═══════════════════════════════════════
 * The press composes from three plates — ground (zoomed to a field), mid (mirrored, another
 * scale), figure (near card size). For a card that already EXISTS, the figure is **that card's
 * own art**, and only ground and mid are drawn from the deck by seed.
 * ⚑ That is the whole difference between "displayed through the press" and "replaced by the
 *   press". docs/RELICS-STUDY.md §4 states the risk out loud — *"the risk for us is burying a
 *   drawing under a simulation"* — and this is where it would happen. SCRAM JETS printed as a
 *   four-colour proof is still SCRAM JETS; SCRAM JETS used as one of three random pigments is a
 *   texture that used to be a card.
 * ⚠ The press still CROPS and SCREENS the figure, so this is not a faithful reproduction and
 *   must not be described as one. Every surface that uses it keeps the flat plate one control
 *   away (`?flat=1`), because a collector must always be able to see the drawing as drawn.
 *
 * ══ ⛔ ONE PRESS. NOT ONE PER CARD ═════════════════════════════════════════════════════════
 * `canvas.getContext('webgl2')` returns the SAME context on a second call and `HeroCard.build`
 * never releases its program, buffers or six textures. So a binder you page through, or a deck
 * browser, cannot build a press per card — it would leak everything, silently, and end with two
 * cards fighting over one set of uniforms. `live()` memoises per canvas and `show()` goes
 * through `reseed` + `setPigment` + `setText`. Changing cards changes TEXTURES.
 *
 * ⚑ AND THAT IS ALSO WHY GRIDS BAKE. A deck browser wants ninety faces at once; ninety live
 *   WebGL contexts is not a thing a browser will give you. `bake()` runs the ONE shared press
 *   through a queue and takes a still of each — which is the correct object for a grid anyway,
 *   because a thumbnail nobody is touching is a card sitting on a table (hero-card's §3: the
 *   press is driven by HANDLING, and nobody is handling a thumbnail).
 *
 * FAILS OPEN AT EVERY STEP. No WebGL2, no HeroCard, a manifest that 404s, an image that will not
 * decode ⇒ `null`, and every caller keeps the flat card it was already showing. A collector
 * never sees a broken frame.
 */
(function (global) {
  'use strict';

  /* ── the deck, fetched once ───────────────────────────────────────────────────────────────
   * ⚑ FETCHED, NEVER LISTED. Same reason cards/proof.html fetches it: the clean-slate (task #71)
   *   swaps the whole pigment set without touching a line of this file, and a card can never
   *   advertise a source that has left the set. */
  var _pool = null;
  function pool(base) {
    if (_pool) return _pool;
    var B = base || '';
    var one = function (u) {
      return fetch(B + u).then(function (r) { return r.ok ? r.json() : null; }).then(function (raw) {
        var rows = !raw ? [] : (Array.isArray(raw) ? raw : (raw.cards || []));
        return rows.map(function (c) {
          if (!c || !c.art) return null;
          return {
            art: /^(https?:|\/|\.)/.test(c.art) ? c.art : B + c.art,
            title: String(c.title || c.slug || c.art).slice(0, 42),
            key: String(c.art).replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, ''),
          };
        }).filter(Boolean);
      }).catch(function () { return []; });
    };
    _pool = Promise.all([one('manifest.json'), one('hero-manifest.json')])
      .then(function (r) { return r[0].concat(r[1]); })
      .catch(function () { return []; });
    return _pool;
  }

  var _type = null;
  function typeSpec(base) {
    if (_type) return _type;
    _type = fetch((base || '') + 'type/alphabet.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    return _type;
  }

  /* ── DNA ──────────────────────────────────────────────────────────────────────────────────
   * ⛔ THE SEED MUST BE A FUNCTION OF THE CARD AND OF NOTHING ELSE. Not its index in a manifest
   *   (the clean-slate reorders those and every card would silently reprint as a different one),
   *   not the time, not a counter. FNV-1a over the card's own art path: stable across machines,
   *   across sessions, across a rebuild of the deck. This is the "immutable DNA" term in
   *   docs/RELICS-STUDY.md, and the reason a collector can learn their own cards at all. */
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }
  /* ⛔ THE ID IS THE FILENAME STEM, NOT THE PATH, AND THAT IS NOT TIDINESS. The same card is
   *   referenced as `art/hero/42.webp` from /cards/, as `cards/art/hero/42.webp` from /, and as
   *   an absolute URL once a page has resolved it — three different strings for one card. Hash
   *   the path and card 42 prints as three DIFFERENT cards depending on which page you opened
   *   it from, with nothing anywhere reporting a problem. The stem is what survives the trip. */
  function stemOf(s) {
    return String(s || '').split(/[?#]/)[0].replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
  }
  function idOf(card) {
    if (!card) return '';
    if (card.art) return stemOf(card.art);
    return String(card.slug || card.id || card.title || '');
  }
  function seedFor(card) { return hash(idOf(card)) || 3030; }

  /* Ground and mid are drawn from the deck by the card's own seed; the FIGURE is the card.
   * ⚠ The two drawn plates must not BE the card — a print whose ground, mid and figure are the
   *   same picture is a blur of one image, and it is the likeliest accident here because the
   *   card is itself in the pool. Filtered by art path, and the fallback keeps the roles
   *   distinct rather than failing. */
  function platesFor(card, list) {
    var me = idOf(card), art = (card && card.art) || '';
    var others = (list || []).filter(function (c) { return idOf(c) !== me; });
    if (!others.length) return [art, art, art];
    var s = seedFor(card), a = (s ^ 0x9E3779B9) >>> 0;
    var rnd = function () { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    var g = others[Math.floor(rnd() * others.length)];
    var pick2 = others.filter(function (c) { return c.art !== g.art; });
    var m = (pick2.length ? pick2 : others)[Math.floor(rnd() * (pick2.length || others.length))];
    /* ⚠ The FIGURE is the card's own art path as the CALLER gave it — resolved for that page.
     *   Only the identity is stem-based; the URL the loader fetches has to stay real. */
    return [g.art, m.art, art || g.art];
  }

  /* ── the one live press ───────────────────────────────────────────────────────────────────
   * Memoised on the canvas element itself, because the constraint being defended is a property
   * of that canvas's GL context and of nothing else. */
  function live(o) {
    o = o || {};
    var canvas = o.canvas;
    if (!canvas || !global.HeroCard) return Promise.resolve(null);
    if (canvas.__press) return canvas.__press;
    var base = o.base || '';

    canvas.__press = Promise.all([pool(base), typeSpec(base)]).then(function (r) {
      var list = r[0], spec = r[1];
      var first = o.card || list[0];
      if (!first) return null;
      var plates = platesFor(first, list);
      return global.HeroCard.build({
        canvas: canvas, seed: seedFor(first), type: spec,
        rarity: (first && first.rarity) || 'common',
        pigment: list.map(function (c) { return c.art; }),
        pigmentExact: plates,
        name: (first && (first.title || first.name)) || '', sub: (first && first.sub) || '',
      }).then(function (press) {
        if (!press) return null;
        var current = first;
        /* ⚠ ORDER MATTERS AND IT IS NOT ARBITRARY. `reseed` re-bakes the type plate from the
         *   seed, so the words have to be set AFTER it or the new card prints the old card's
         *   name for one frame — and one frame is all a screenshot or a texture upload needs. */
        function show(card) {
          if (!card) return Promise.resolve(false);
          current = card;
          try { press.reseed(seedFor(card)); } catch (e) {}
          try { press.setText({ name: card.title || card.name || '', sub: card.sub || '' }); } catch (e) {}
          return press.setPigment(platesFor(card, list)).catch(function () { return false; });
        }
        return {
          press: press,
          source: function () { return canvas; },
          card: function () { return current; },
          show: show,
          pool: function () { return list; },
          destroy: function () { try { press.destroy(); } catch (e) {} },
        };
      });
    }).catch(function () { return null; });
    return canvas.__press;
  }

  /* ── stills, for grids ────────────────────────────────────────────────────────────────────
   * ⛔ SERIALISED, AND THE QUEUE IS THE POINT. One press, one canvas, one set of uniforms: two
   *   bakes in flight would interleave `reseed` with the other card's `setPigment` and both
   *   would come out wrong — a plausible-looking wrong, which is the expensive kind. The queue
   *   is a promise chain rather than a lock because there is nothing to contend for once the
   *   calls are ordered.
   * ⚠ `preserveDrawingBuffer:true` is what makes the copy legal at all (hero-card sets it). A
   *   WebGL canvas without it reads back EMPTY outside its own frame — recorded in CLAUDE.md as
   *   the reason `readPixels` on a live canvas returns zeros. */
  var _bakeCanvas = null, _queue = Promise.resolve();
  function bake(card, opts) {
    var o = opts || {};
    var W = o.w || 512, H = o.h || Math.round(W * 1.5);
    var run = function () {
      if (!_bakeCanvas) {
        _bakeCanvas = document.createElement('canvas');
        _bakeCanvas.width = W; _bakeCanvas.height = H;
        /* off-screen but IN the document: a detached canvas is fine for GL, and keeping it out
         * of the layout means it can never affect a page's height or its overflow check. */
        _bakeCanvas.style.cssText = 'position:absolute;left:-99999px;top:0;width:1px;height:1px';
        document.body.appendChild(_bakeCanvas);
      }
      if (_bakeCanvas.width !== W || _bakeCanvas.height !== H) {
        _bakeCanvas.width = W; _bakeCanvas.height = H;
      }
      return live({ canvas: _bakeCanvas, base: o.base, card: card }).then(function (ctrl) {
        if (!ctrl) return null;
        return ctrl.show(card).then(function () {
          /* ⚑ A STILL IS A FINISHED SHEET. The write-on is a handling animation; a thumbnail is
           *   not being handled, so it starts printed rather than mid-arrival. Without this a
           *   grid bakes ninety half-printed cards, which reads as a broken renderer. */
          try { ctrl.press.writeOn(1); } catch (e) {}
          try { ctrl.press.setView(0, 0); } catch (e) {}
          try { ctrl.press.render(); } catch (e) {}
          var out = document.createElement('canvas');
          out.width = W; out.height = H;
          out.getContext('2d').drawImage(_bakeCanvas, 0, 0, W, H);
          return out;
        });
      }).catch(function () { return null; });
    };
    _queue = _queue.then(run, run);
    return _queue;
  }

  /* ── ⚑ THE COMBINATION, IN ONE FUNCTION ──────────────────────────────────────────────────
   * `frame({cardCtrl, card, base, tilt}) -> Promise<ctrl|null>` — hang a live press on a Card3D
   * controller. The press prints the face into a hidden canvas; Card3D uses that canvas as its
   * art plate and supplies the body, the bevel, the foil sweep and the parallax.
   *
   * ⛔ IT IS ONE FUNCTION BECAUSE FIVE SURFACES WANT IT AND FIVE COPIES IS THE BUG THIS REPO
   *   KEEPS RECORDING. `js/card3d.js` exists at all because the moment a second page wanted the
   *   same card there were two copies of the colour-management fix. The pointer forwarding, the
   *   single rAF, the visibility pause and the one-shot relief stamp below are exactly the kind
   *   of detail that gets fixed in one copy and not the other.
   *
   * ⚑ HANDLING THE OBJECT HANDLES THE PRINT, and that is the layering rather than a stack. The
   *   same pointer that tilts the slab is fed to the press as handling, so work accumulates and
   *   the sheet ADVANCES — a new impression, new registration, new ink — while the card turns in
   *   your hand. Two renderers, one gesture. Feeding the press a clock instead would put an
   *   ambient loop back on a card that hero-card §3 deliberately made still.
   *
   * ⛔ ONE rAF, NOT TWO. `press.loop(true)` starts the press's own frame loop; this needs a hook
   *   BEFORE each press frame to forward the pointer, so it drives `pointer → advance → render`
   *   itself. Running both would double the press's cost and step it at two different dts, which
   *   is the "rig running at half speed" defect from the wordmark, in another file.
   * ⚠ AND IT PAUSES WITH THE TAB. A press rendering at 512x768 behind a hidden tab is a phone
   *   battery spent on nothing. */
  function frame(o) {
    o = o || {};
    var cardCtrl = o.cardCtrl;
    if (!cardCtrl || !cardCtrl.setArtSource || !global.HeroCard) return Promise.resolve(null);
    var W = o.w || 512, H = o.h || Math.round((o.w || 512) * 1.5);
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.setAttribute('aria-hidden', 'true');
    /* Off-layout on purpose: 1x1 at -99999px can never affect a page's height, its overflow
     * check or its tab order, and the GL surface is `width`/`height`, not the CSS box. */
    cv.style.cssText = 'position:absolute;left:-99999px;top:0;width:1px;height:1px;pointer-events:none';
    (o.mount || document.body).appendChild(cv);

    return live({ canvas: cv, base: o.base, card: o.card }).then(function (P) {
      if (!P) { try { cv.remove(); } catch (e) {} return null; }
      var press = P.press;
      if (!cardCtrl.setArtSource(cv, { relief: false })) {
        try { cv.remove(); } catch (e) {}
        return null;
      }

      var tilt = o.tilt || function () { return { x: 0, y: 0 }; };
      var down = o.down || function () { return false; };
      var last = 0, raf = 0, stopped = false, stamped = false;

      function tick(now) {
        if (stopped) return;
        raf = requestAnimationFrame(tick);
        if (document.hidden) { last = now; return; }
        var dt = last ? Math.min(64, now - last) : 16;
        last = now;
        var t = tilt() || { x: 0, y: 0 };
        try { press.pointer(t.x, t.y, !!down()); } catch (e) {}
        try { press.advance(dt); press.render(); } catch (e) {}
        /* ⚠ THE RELIEF IS TAKEN ONCE THE SHEET HAS FINISHED PRINTING, NOT BEFORE. A Sobel of a
         *   half-arrived write-on stamps the card with the relief of a partial impression, and
         *   it is a full-resolution CPU pass, so it must not run per frame either. */
        if (!stamped) {
          var a = 0;
          try { a = press.probe().arrive; } catch (e) { a = 0; }
          if (a >= 0.999) { stamped = true; try { cardCtrl.restamp(); } catch (e) {} }
        }
      }
      raf = requestAnimationFrame(tick);

      return {
        press: press, canvas: cv, pressCtrl: P,
        card: P.card,
        show: function (card) {
          stamped = false;                    // a new card earns a new relief
          return P.show(card);
        },
        destroy: function () {
          stopped = true;
          if (raf) cancelAnimationFrame(raf);
          try { P.destroy(); } catch (e) {}
          try { cv.remove(); } catch (e) {}
        },
      };
    }).catch(function () { try { cv.remove(); } catch (e) {} return null; });
  }

  global.CardPress = {
    pool: pool, typeSpec: typeSpec, seedFor: seedFor, platesFor: platesFor, stemOf: stemOf,
    live: live, frame: frame, bake: bake, hash: hash,
  };
})(window);

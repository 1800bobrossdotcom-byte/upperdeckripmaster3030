/* ripmaster3030studios — ONE CARD VIEWER, EVERYWHERE.   `CardView`
 *
 *   CardView.mount({box, card, base, flat}) -> Promise<ctrl|null>   never rejects
 *       ctrl.show(card)   -> Promise<bool>    put a different card in the same viewer
 *       ctrl.flip()       -> bool            turn it over; true = face up
 *       ctrl.press        -> the HeroCard controller
 *       ctrl.destroy()
 *
 * Artist, 2026-08-05: *"we need the same cardviewer used in the proof.html with the environments,
 * in as every viewer."*
 *
 * ══ ⛔ WHAT WAS WRONG, AND WHY IT WAS INVISIBLE ═════════════════════════════════════════════
 * There were TWO viewers. `cards/proof.html` drove the press DIRECTLY — its own room, its own
 * raking key light, its own PBR foil, and a pointer that presses the stock and turns the card.
 * Everywhere else (lens3d, the folder's starfield) took the press's canvas as a TEXTURE and hung
 * it on `js/card3d.js`'s slab. Both rendered a card, so nothing looked broken — but they were
 * different objects: one lit by the press's own material system, one lit by a second renderer's
 * lights, and only one of them answered a light the way the material was designed to.
 * ⚑ THE ROOM IS THE POINT. A metal foil edge with nothing to reflect is a grey edge; the press's
 *   environment is what makes the die edge walk its hue and the varnish flash. Framing the press
 *   as a flat texture on another card threw that away and then re-lit the result, which is the
 *   "wash" this repo has now recorded three times from three different directions.
 *
 * ⚑ SO THIS FILE IS proof.html's VIEWER, LIFTED WHOLE. The pointer mapping, the dpr cap, the
 *   sizing and the loop are the same code, not a reimplementation — because "the same viewer" is
 *   the requirement, and two viewers that merely agree today are two viewers that will not agree
 *   after the next fix. `cards/proof.html` keeps its own copy for now only because it also owns
 *   the forge's controls; when that lands here too it becomes a caller like the rest.
 *
 * ⚠ ONE PRESS PER CANVAS, ALWAYS. `getContext('webgl2')` hands back the SAME context on a second
 *   call and `HeroCard.build` never releases — so a viewer that showed a second card by building
 *   again would leak a program, buffers and seven textures per card, silently. `show()` swaps
 *   plates on the press that is already there.
 *
 * ══ ⛔ AND IT RESOLVES ONLY ONCE THERE IS INK ON THE SHEET ═════════════════════════════════
 * `js/card-press.js` records the fail-open violation the artist reported — *"the cards are not
 * displaying in the viewer, the binder, the binder viewer, or into the deck"* — and guards its own
 * two paths with a pixel measurement. **This was a THIRD path and it did not have that guard.**
 * A press that builds and then draws nothing is a canvas of paper-white laid over whatever the
 * caller was already showing, and callers destroy their fallback when this resolves. Nothing
 * throws, nothing 404s, and the card is gone — which is precisely the failure that got reported.
 * ⚑ So the canvas is mounted at `opacity:0` and this promise does not resolve until
 *   `CardPress.__hasInk` says a real sheet has printed. It never does ⇒ `null`, the canvas is
 *   removed, and the caller keeps its flat card. **The fallback outlives the press, always.**
 * ⚠ It has to be a WINDOW of frames, not one check: the three plates are fetched images, so the
 *   first sheet is legitimately empty. Same 240-frame budget `CardPress.frame` gives it.
 *
 * FAILS OPEN: no WebGL2, no HeroCard, a manifest that will not load, a press that prints nothing
 * ⇒ `null`, and the caller keeps whatever it was already showing.
 */
(function (global) {
  'use strict';

  function dprCap() {
    try { return (global.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2; } catch (e) { return 2; }
  }

  /* ── ⛔ THE CARD IS SUPERSAMPLED, AND THIS IS THE ONLY DEFINITION OF BY HOW MUCH ───────────
   * The press screens the artwork at a fixed 170 halftone cells across the card, because that is
   * a property of the PRINT. How many of those dots a buffer can carry is a property of the
   * BUFFER, and the two are unrelated. On a 1x display a 270-px card puts a cell at ~1.6 device
   * pixels, and the screen samples itself into speckle — it reads as a washed, noisy card rather
   * than a printed one.
   * ⚑ MEASURED: against the same card rendered at 900 and downsampled to the display size — the
   *   optically correct answer, i.e. what stepping back from a real card does — a native 270 bake
   *   carried up to 1.38x the high-frequency energy. Rendering above 1:1 and letting the browser
   *   downsample reproduces that reference to within 1-2%.
   * ⚠ Softening the halftone instead was tried and REVERTED: it overshot to 0.75 of the correct
   *   HF (mush) and moved the full-size render too. See `screenDot` in js/hero-card.js.
   * ⛔ THE FLOOR COMES FROM `deviceTier()`, NOT `dprCap()`, AND THIS REPO HAS ALREADY PAID FOR
   *   THAT DISTINCTION ONCE. `dprCap()` ends in `min(devicePixelRatio, cap)`, so an ordinary 1x
   *   desktop with a strong GPU scores 1 — gfx-post's own comment records Section 9 deriving a
   *   quality tier from it and silently switching every character model off on exactly that
   *   machine. Pixel density is not machine power. A literal floor of 2 would be the same mistake
   *   with the sign flipped: it would push a save-data phone that `dprCap` deliberately held at 1
   *   straight back up to 2.
   * ⚠ EXPORTED because `cards/proof.html` — the forge the hundred cards get judged on — has its
   *   own `size()`, and it was the surface most exposed to this: it capped at `min(dpr, 2)`, so
   *   on a 1x monitor the artist was grading prints at the one ratio that aliases. Two copies of
   *   a rule is two chances to fix one of them, which is this file's whole subject. */
  var SS = { low: 1, mid: 1.5, high: 2 };
  function backingScale() {
    var want = 1.5;
    try { want = SS[GfxPost.deviceTier()] || 1.5; } catch (e) {}
    return Math.max(want, Math.min(global.devicePixelRatio || 1, dprCap()));
  }

  function mount(o) {
    o = o || {};
    var box = o.box;
    if (!box || o.flat || !global.HeroCard || !global.CardPress) return Promise.resolve(null);
    if (box.__cardview) return box.__cardview;

    var cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;'
      + 'touch-action:pan-y;'           // ⚠ pan-y, or a card in a scrolling page traps the thumb
      + 'opacity:0;transition:opacity .2s ease-out';   // revealed only once it has printed
    box.appendChild(cv);

    /* ⚠ SIZE IT WHEN IT HAS A SIZE. A box that is still laying out measures 0x0, and a canvas
     *   sized once against that renders into nothing forever. Retry on frames, then watch it. */
    /* ⛔ THE CARD IS SUPERSAMPLED, AND THE FLOOR OF 2 IS THE POINT — NOT THE CAP.
     * The press screens the artwork at a fixed 170 halftone cells across the card, because that
     * is a property of the PRINT. How many of those dots a buffer can carry is a property of the
     * BUFFER, and the two are unrelated. On a 1x desktop the pack reveal is a 270-px box, which
     * puts a cell at ~1.6 device pixels — the screen then samples itself into speckle, and it
     * reads as a washed, noisy card rather than a printed one.
     * ⚑ MEASURED: against the same card rendered at 900 and downsampled to the display size — the
     *   optically correct answer, i.e. what stepping back from a real card does — a native 270
     *   bake carried up to 1.38x the high-frequency energy. Rendering at 2x and letting the
     *   browser downsample reproduces the reference to within 1-2%.
     * ⚠ Softening the halftone instead was tried and REVERTED: it overshot to 0.75 of the correct
     *   HF (mush) and moved the full-size render too. See `screenDot` in js/hero-card.js.
     * ⛔ AND THE FLOOR COMES FROM `deviceTier()`, NOT `dprCap()`, WHICH IS A DISTINCTION THIS
     *   REPO HAS ALREADY PAID FOR ONCE. `dprCap()` ends in `min(devicePixelRatio, cap)`, so an
     *   ordinary 1x desktop with a strong GPU scores **1** — its own comment records that Section
     *   9 derived a quality tier from it and silently switched every character model off on
     *   exactly that machine. **Pixel density is not machine power.** Flooring at a literal 2
     *   would have been the same mistake with the sign flipped: it would push a save-data phone
     *   that `dprCap` had deliberately held at 1 straight back up to 2.
     * ⚠ Affordable only because a card is small. At the reveal's 270x398 this is 540x796 — about
     *   0.43 MP, well under a single 1080p game frame. */
    function size() {
      var r = box.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var dpr = backingScale();
      cv.width = Math.max(64, Math.round(r.width * dpr));
      cv.height = Math.max(96, Math.round(r.height * dpr));
      return true;
    }

    box.__cardview = CardPress.live({ canvas: cv, base: o.base, card: o.card }).then(function (P) {
      if (!P) { try { cv.remove(); } catch (e) {} box.__cardview = null; return null; }
      var press = P.press;

      if (!size()) {
        var tries = 0;
        (function retry() {
          if (tries++ > 120) return;
          if (!size()) requestAnimationFrame(retry); else press.render();
        })();
      }
      var ro = null;
      if (global.ResizeObserver) {
        try { ro = new ResizeObserver(function () { if (size()) press.render(); }); ro.observe(box); }
        catch (e) { ro = null; }
      }
      var onWin = function () { if (size()) press.render(); };
      addEventListener('resize', onWin, { passive: true });

      /* ── the pointer, exactly as cards/proof.html drives it ────────────────────────────────
       * Press and drag: the stock dishes under your thumb and rings when you let go, the plates
       * part as it turns, and the work accumulates until the sheet advances. */
      function at(e) {
        var r = box.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2];
      }
      var onDown = function (e) {
        try { box.setPointerCapture(e.pointerId); } catch (e2) {}
        var p = at(e); press.pointer(p[0], p[1], true);
      };
      var onMove = function (e) {
        var p = at(e); press.pointer(p[0], p[1], e.buttons > 0 || e.pressure > 0);
      };
      var onUp = function () { press.pointer(0, 0, false); };
      box.addEventListener('pointerdown', onDown);
      box.addEventListener('pointermove', onMove, { passive: true });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (k) {
        box.addEventListener(k, onUp);
      });

      press.loop(true);

      /* ── ⛔ the gate: nothing is handed back until a real sheet has printed ────────────────
       * ⚠ `press.loop(true)` is already stepping and rendering, so this only WATCHES. Rendering
       *   here as well would advance the press at two different dts — the "rig running at half
       *   speed" defect, in a third file. */
      var proved = new Promise(function (resolve) {
        var frames = 0;
        var ink = function () {
          try { return CardPress.__hasInk(cv); } catch (e) { return false; }
        };
        /* ⚠ every 6th frame, not every frame: reading a WebGL canvas back through `drawImage`
         *   forces a GPU sync, and doing that 240 times to answer a question that changes once
         *   would cost more than the press it is watching. */
        (function watch() {
          if (frames % 6 === 0 && cv.width && cv.height && ink()) {
            cv.style.opacity = '1'; return resolve(true);
          }
          if (++frames > 240) return resolve(false);
          requestAnimationFrame(watch);
        })();
      });

      var ctrl = {
        press: press, canvas: cv, pressCtrl: P,
        card: P.card,
        show: function (card) { return P.show(card); },
        flip: function () { return press.flip(); },
        resize: size,
        destroy: function () {
          removeEventListener('resize', onWin);
          if (ro) { try { ro.disconnect(); } catch (e) {} }
          box.removeEventListener('pointerdown', onDown);
          box.removeEventListener('pointermove', onMove);
          ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (k) {
            box.removeEventListener(k, onUp);
          });
          try { P.destroy(); } catch (e) {}
          try { cv.remove(); } catch (e) {}
          box.__cardview = null;
        },
      };

      return proved.then(function (ok) {
        if (ok) return ctrl;
        try { ctrl.destroy(); } catch (e) {}
        return null;                      // the caller keeps the flat card it already had
      });
    }).catch(function () { try { cv.remove(); } catch (e) {} box.__cardview = null; return null; });

    return box.__cardview;
  }

  global.CardView = { mount: mount, backingScale: backingScale };
})(window);

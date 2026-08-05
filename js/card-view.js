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
 * FAILS OPEN: no WebGL2, no HeroCard, a manifest that will not load ⇒ `null`, and the caller
 * keeps whatever it was already showing. It never removes the fallback it was given.
 */
(function (global) {
  'use strict';

  function dprCap() {
    try { return (global.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2; } catch (e) { return 2; }
  }

  function mount(o) {
    o = o || {};
    var box = o.box;
    if (!box || o.flat || !global.HeroCard || !global.CardPress) return Promise.resolve(null);
    if (box.__cardview) return box.__cardview;

    var cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;'
      + 'touch-action:pan-y';           // ⚠ pan-y, or a card in a scrolling page traps the thumb
    box.appendChild(cv);

    /* ⚠ SIZE IT WHEN IT HAS A SIZE. A box that is still laying out measures 0x0, and a canvas
     *   sized once against that renders into nothing forever. Retry on frames, then watch it. */
    function size() {
      var r = box.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var dpr = Math.min(global.devicePixelRatio || 1, dprCap());
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

      return {
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
    }).catch(function () { try { cv.remove(); } catch (e) {} box.__cardview = null; return null; });

    return box.__cardview;
  }

  global.CardView = { mount: mount };
})(window);

/* ripmaster3030studios — TURN IT OVER, ANYWHERE.   `RipFlip`
 *
 *   RipFlip.attach({box, card, base, press, mount, label}) -> Promise<ctrl|null>
 *       ctrl.flip()      -> bool   true = face up
 *       ctrl.faceUp()    -> bool
 *       ctrl.show(card)  -> Promise   put a different card in the same holder
 *       ctrl.button      -> the chip, so a caller can place it itself
 *       ctrl.destroy()
 *
 * Artist, 2026-08-05: *"backs of cards need to be present in every viewer."*
 *
 * ══ ⛔ THEY WERE NOT IN ANY OF THEM, AND THE REASON WAS ONE LINE ═══════════════════════════
 * `js/card-back.js` has been rasterising the real designed back off each card's own page for a
 * while, and `CardPress.live` hands it to the press through `setBack` on every card change. All
 * of that worked. What did not was `press.flip()`: it bumped the yaw TARGET by π, and the press's
 * `advance()` opens by assigning that target from the pointer, every frame. The card never turned
 * — measured at yaw 0.000 a full 2.5 s after the call — while `faceUp` dutifully reported false.
 * ⚑ So the back existed, was correct, was uploaded to the GPU, and was unreachable. Fixed in
 *   `js/hero-card.js` (which-way-up is a STATE the target is built from, not an impulse), and
 *   this file is what puts a door on it.
 *
 * ══ ⚑ AND IT MUST NOT NEED WebGL2, BECAUSE THE BACK IS INFORMATION ═════════════════════════
 * The front is a picture and degrades to a flat picture. The back is the card's dossier — its
 * trivia, its vitals, its statistics, its lore. A visitor with no WebGL2 losing the *material* is
 * this project's standing trade; a visitor with no WebGL2 losing the *text* is a different and
 * worse thing. So there are two paths and the caller does not choose between them:
 *   · a press is present  ⇒ the real object turns, lit by its own key (hero-card's V.z < 0 branch)
 *   · no press            ⇒ a plain CSS half-turn to the rasterised designed back
 * ⚠ AND IF NEITHER CAN PRODUCE A BACK, NO CHIP APPEARS. A flip button that does nothing is worse
 *   than no flip button: it reads as a broken page rather than as a page without that feature.
 *   `attach` resolves to null and the caller is unchanged — fail-open, as everything here is.
 */
(function (global) {
  'use strict';

  var SELF = (document.currentScript && document.currentScript.src) || '';
  var ROOT = SELF ? SELF.replace(/js\/card-flip\.js.*$/, '') : '';

  function chip(label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rip-flip';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<span>' + (label || 'tap to flip') + '</span><span class="rip-turn">&#8635;</span>';
    return b;
  }

  /* ── the no-press path ────────────────────────────────────────────────────────────────────
   * ⚠ THE HOLDER IS BUILT AROUND WHAT IS ALREADY THERE, NOT INSTEAD OF IT. Everything inside the
   *   box at attach time becomes the FRONT face, so a viewer keeps whatever it was showing — a
   *   flat <img>, a canvas, a stack of layers — and gains a reverse. Replacing the contents would
   *   be the press's own recorded fail-open violation, in another file. */
  function domBack(box, card, base) {
    if (!global.CardBack) return Promise.resolve(null);
    var w = Math.max(240, Math.round(box.getBoundingClientRect().width || 460));
    return CardBack.forCard(card, { base: base, w: 520, h: 780 }).then(function (cv) {
      if (!cv) return null;
      var front = document.createElement('div');
      front.className = 'rip-face';
      while (box.firstChild) front.appendChild(box.firstChild);
      var rev = document.createElement('div');
      rev.className = 'rip-face rip-rev';
      var im = new Image();
      im.alt = '';
      im.setAttribute('aria-hidden', 'true');
      try { im.src = cv.toDataURL('image/webp', 0.9); } catch (e) { return null; }
      /* a failed encode comes back as a stub like "data:," — the deck browser's own lesson */
      if (!im.src || im.src.length < 512) return null;
      rev.appendChild(im);
      /* ⛔ THE TURN GETS ITS OWN ELEMENT, AND IT IS NOT TIDINESS. `overflow` other than visible
       *   FORCES transform-style back to flat — it is a grouping property — so putting the half
       *   turn on the caller's own box worked everywhere except the boxes that clip, and every
       *   box that holds a card clips. Flattened, `backface-visibility:hidden` has no 3D left to
       *   test against: the deck browser's tiles turned over and showed their own FRONT, MIRRORED,
       *   with the real back sitting behind it. It reads as a broken image and is a stacking rule.
       * ⚑ So the caller's box stays the clipper and a turner is nested inside it. The box only
       *   gains `perspective` (and `position` if it had none) — both inert on their own. */
      var turn = document.createElement('div');
      turn.className = 'rip-turnable';
      turn.appendChild(front); turn.appendChild(rev);
      box.appendChild(turn);
      box.classList.add('rip-holder');
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      return { front: front, rev: rev, turn: turn, img: im, w: w };
    }).catch(function () { return null; });
  }

  function attach(o) {
    o = o || {};
    var box = o.box;
    if (!box) return Promise.resolve(null);
    if (box.__ripflip) return Promise.resolve(box.__ripflip);
    var base = (o.base === undefined) ? ROOT + 'cards/' : o.base;
    var getPress = typeof o.press === 'function' ? o.press : function () { return o.press || null; };

    /* A press that exists turns the real object, and its designed back is already on the GPU.
     * Only when there is none do we pay for a rasterisation. */
    var ready = getPress() ? Promise.resolve('press') : domBack(box, o.card, base).then(function (d) {
      return d ? d : null;
    });

    return Promise.resolve(ready).then(function (dom) {
      if (!dom) return null;
      var faceUp = true;
      var btn = chip(o.label);

      function apply() {
        btn.setAttribute('aria-pressed', String(!faceUp));
        btn.firstChild.textContent = faceUp ? (o.label || 'tap to flip') : (o.labelBack || 'back to the front');
      }
      function flip() {
        var P = getPress();
        if (P && P.flip) {
          /* ⚠ ASK THE PRESS WHICH WAY IT ENDED UP rather than assuming the toggle took — it owns
           *   the state, and a viewer that disagreed with it would put the wrong word on the
           *   chip the first time anything else turned the card. */
          try { faceUp = !!P.flip(); } catch (e) { faceUp = !faceUp; }
        } else {
          faceUp = !faceUp;
          if (dom && dom.turn) dom.turn.classList.toggle('rip-turned', !faceUp);
        }
        apply();
        return faceUp;
      }

      btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); flip(); });
      /* ⚠ A CLICK ON THE CARD FLIPS IT, A DRAG DOES NOT. Every one of these viewers uses the
       *   pointer to tilt or press the card, so firing on any pointerup turns the card over every
       *   time somebody looks at it from another angle — which reads as the card flapping. The
       *   card pages already solved this with an 8px slop and this is the same number. */
      if (o.tapCard !== false) {
        var moved = 0, downOn = false;
        box.addEventListener('pointerdown', function () { downOn = true; moved = 0; });
        box.addEventListener('pointermove', function (e) {
          if (downOn) moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
        }, { passive: true });
        addEventListener('pointerup', function () {
          if (downOn && moved < 8) flip();
          downOn = false;
        });
      }
      if (o.mount !== null) (o.mount || box.parentNode || document.body).appendChild(btn);
      apply();

      var ctrl = {
        button: btn,
        flip: flip,
        faceUp: function () { return faceUp; },
        /* a viewer that walks a deck needs the new card's OWN back, and needs to be face up
         * again — you do not hand somebody the next card reverse-first. */
        show: function (card) {
          var P = getPress();
          if (!faceUp) {
            faceUp = true;
            if (dom && dom.turn) dom.turn.classList.remove('rip-turned');
            if (P && P.showFace) { try { P.showFace(true); } catch (e) {} }
            apply();
          }
          if (P || !dom || dom === 'press' || !global.CardBack) return Promise.resolve(true);
          return CardBack.forCard(card, { base: base, w: 520, h: 780 }).then(function (cv) {
            if (!cv) return false;
            try {
              var url = cv.toDataURL('image/webp', 0.9);
              if (url && url.length > 512) dom.img.src = url;
            } catch (e) { return false; }
            return true;
          }).catch(function () { return false; });
        },
        destroy: function () {
          try { btn.remove(); } catch (e) {}
          box.classList.remove('rip-holder');
          if (dom && dom.turn) dom.turn.classList.remove('rip-turned');
          box.__ripflip = null;
        },
      };
      box.__ripflip = ctrl;
      return ctrl;
    }).catch(function () { return null; });
  }

  global.RipFlip = { attach: attach };
})(window);

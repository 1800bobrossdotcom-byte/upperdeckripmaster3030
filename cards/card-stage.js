/* ripmaster3030studios — THE CARD PAGE IS A CARD.  `cards/card-stage.js`
 *
 * Artist, 2026-08-06, pointing at a card page reached from a pull and at a card page opened
 * directly: *"this is the wrong viewer for the card — should be like the way we see the plate
 * proof cards with lighting and card texture / 3d fx. that is done correct in the binder /
 * folder viewer."* He was right, and it was the last flat surface on the site: the 196 card
 * pages draw a CSS-transformed `<img>` inside a `.card` div, with none of the press, none of
 * the material, none of the room. The binder already mounts `CardView` — the same viewer
 * `cards/proof.html` grades the hundred with — and this puts it on the card pages too.
 *
 * ⛔ IT REPLACES NOTHING UNTIL IT HAS PROVED IT PRINTED. `CardView.mount` resolves `null` unless
 * `CardPress.__hasInk` says a real sheet came off the press, so the flat card is hidden ONLY on
 * the success branch. That ordering is not a nicety: this repo's one fail-open violation was
 * `card-press.js` swapping a working card for the press's output BEFORE knowing the press had
 * produced anything, and the symptom — a blank rectangle where a card used to be — is invisible
 * to every check, because nothing throws and nothing 404s.
 *
 * ⚠ THE FLAT CARD IS HIDDEN, NEVER REMOVED. `visibility:hidden` keeps its box, which is what the
 * stage is sized from, and keeps the whole card BACK in the document — `cardnav.js` and the
 * chain readers write into `#b-live`, `#b-wl`, `#b-burn` and a dozen more ids that live in there.
 * Removing the element would take the page's data plumbing with it, silently.
 *
 * ⚠ `?flat` opts out, same as the binder. The press CROPS and SCREENS the artwork, so it is a
 * treatment and not a reproduction, and the drawings have to stay reachable as drawn.
 *
 * FAILS OPEN at every step: no WebGL2, no CardView, a blocked module, a press that prints
 * nothing ⇒ the page is exactly the page it was, flip and all. */
(function (global) {
  'use strict';
  if (global.self !== global.top) return;        // card pages also render inside the lens iframe
  if (global.__cardStage) return; global.__cardStage = true;

  function boot() {
    if (/[?&]flat\b/.test(location.search)) return;
    var card = document.getElementById('card');
    var scene = document.getElementById('scene');
    if (!card || !scene || !global.CardView) return;

    var img = card.querySelector('.face.front img');
    if (!img) return;

    /* The record the press prints from. ⚑ Same shape and same seed source as the binder and the
     * pack use — the press seeds from the artwork's filename stem, so a card prints identically
     * here, in the folder, and in the token's media slot. Same card wherever you meet it. */
    function rec() {
      var rarity = (String(card.className).match(/\bt-([a-z]+)\b/) || [])[1] || 'common';
      var t = document.getElementById('b-title');
      return {
        art: new URL(img.getAttribute('src'), location.href).href,
        title: ((t && t.textContent) || img.getAttribute('alt') || '').toUpperCase(),
        rarity: rarity
      };
    }

    var stage = document.createElement('div');
    stage.id = 'cvStage';
    stage.setAttribute('aria-hidden', 'true');
    /* ⚠ NOT a child of `#card`. That element carries the page's own `rotateY/rotateX` flip and
     * `preserve-3d`; a canvas inside it would be turned by the CSS as well as by the viewer,
     * i.e. two things rotating one card. The stage is a sibling laid over the card's box. */
    /* ⚠ INERT UNTIL PROVEN. It starts `pointer-events:none` and only takes the pointer once a
     * card has actually printed — so even if this element is still on the page for any reason,
     * it cannot swallow a tap meant for the card underneath. "It removes itself" is a weaker
     * property than "it cannot do harm", and only the second one is worth relying on. */
    stage.style.cssText = 'position:absolute;z-index:6;pointer-events:none;opacity:0;' +
      'transition:opacity .25s ease-out';
    if (getComputedStyle(scene).position === 'static') scene.style.position = 'relative';
    scene.appendChild(stage);

    /* Keep the stage on the card's box. The card is sized in vw/vh and by its aspect ratio, so
     * this has to follow a resize rather than be measured once. */
    function fit() {
      stage.style.left = card.offsetLeft + 'px';
      stage.style.top = card.offsetTop + 'px';
      stage.style.width = card.offsetWidth + 'px';
      stage.style.height = card.offsetHeight + 'px';
    }
    fit();
    if (!card.offsetWidth || !card.offsetHeight) { stage.remove(); return; }

    /* ⛔ THE SECOND GUARD, AND IT IS THE ONE THAT BITES. `CardView.mount` resolving a controller
     * is NOT sufficient evidence that a card was printed: driven against a press whose render
     * clears to nothing, mount still handed back a controller and this module happily hid a
     * perfectly good flat card behind an empty canvas — the exact fail-open violation
     * `js/card-press.js` was fixed for, reappearing in a new file. So the pixels are checked
     * here, by this module, before anything is taken away.
     * ⚠ "NOT BLANK" IS NOT "ALPHA > 0": the press stock is near-white, so a canvas cleared to
     * paper is fully opaque and completely empty. A card is a picture and a picture has TONAL
     * RANGE — a flat fill of any colour has none, which is why the test is variance. */
    function printed(cv) {
      try {
        var t = document.createElement('canvas'); t.width = 48; t.height = 72;
        var x = t.getContext('2d'); x.drawImage(cv, 0, 0, 48, 72);
        var d = x.getImageData(0, 0, 48, 72).data, n = 0, sum = 0, sq = 0;
        for (var i = 0; i < d.length; i += 4) {
          var l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          n++; sum += l; sq += l * l;
        }
        var m = sum / n;
        return Math.sqrt(Math.max(0, sq / n - m * m)) > 6;
      } catch (e) { return false; }              // tainted or unreadable ⇒ do not take the card
    }

    CardView.mount({ box: stage, base: '', card: rec() }).then(function (v) {
      if (!v) { stage.remove(); return; }        // the press never printed — the flat card stands

      var cv = stage.querySelector('canvas');
      if (!cv || !printed(cv)) {
        try { v.destroy(); } catch (e) {}
        stage.remove();                          // an empty press must cost the page nothing
        return;
      }

      fit();
      stage.style.opacity = '1';
      stage.style.pointerEvents = 'auto';       // it is the card now, so it takes the pointer
      /* ⚠ visibility, not display: the stage is measured FROM this element's box every resize,
       * and `display:none` would collapse it to zero and take the stage with it. */
      card.style.visibility = 'hidden';
      global.__cardStageView = v;                // handle for driven checks

      /* THE FLIP IS THE VIEWER'S NOW. The page's own flip is a CSS class on a card nobody can
       * see any more; leaving the old handler wired would give the hint a button that turns an
       * invisible element. Every existing way to ask for a flip is routed to the real card. */
      var flip = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        try { v.flip(); } catch (err) {}
      };
      var hint = document.querySelector('.flip-hint');
      if (hint) {
        hint.style.cursor = 'pointer';
        hint.addEventListener('click', flip);
      }
      stage.addEventListener('dblclick', flip);
      addEventListener('keydown', function (e) {
        if (e.key === 'f' || e.key === 'F') flip();
      });

      var ro = global.ResizeObserver ? new ResizeObserver(fit) : null;
      if (ro) { ro.observe(scene); ro.observe(document.body); }
      addEventListener('resize', fit);
      addEventListener('orientationchange', fit);
    }).catch(function () { stage.remove(); });
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);

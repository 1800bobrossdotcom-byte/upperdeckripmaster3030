/* ripmaster3030studios — THE DESIGNED BACK, AS A TEXTURE.   `CardBack`
 *
 *   CardBack.fromElement(el, {w,h})   -> Promise<canvas|null>   rasterise a live `.face.back`
 *   CardBack.forCard(card, {base})    -> Promise<canvas|null>   fetch a card's page and use its back
 *
 * Artist, 2026-08-05: *"each card should have a back too"* — then, when I generated one:
 * *"the backs are already designed."*
 *
 * ⛔ THEY ARE, AND THAT IS THE WHOLE POINT OF THIS FILE. The vintage sports-card back in
 *   `cards/cardback.css` is on all 196 card pages: manila stock, the torn-paper punch-through,
 *   the roundel, the gold name band, the trivia with its answer printed upside down, the vitals,
 *   the statistics table, the trait tags, the marquee watermark. It is finished work with real
 *   per-card content in it.
 * ⛔ SO THE BACK IS RASTERISED, NOT REDRAWN. A redraw is a SECOND copy of a design — it looks
 *   close, it drifts the first time the real one is edited, and the copy that rots is always the
 *   one nobody opens. This takes the actual DOM and the actual stylesheet and turns them into
 *   pixels, so the reverse of the 3D card IS the designed back rather than an impression of it.
 *
 * ⚑ HOW, WITH NO LIBRARY: an SVG `<foreignObject>` will lay out real HTML, and an `<img>` will
 *   rasterise that SVG into a canvas. Two native features, no dependency, no build step — which
 *   is the same constraint every other renderer here works under.
 * ⚠ THE SVG IS A SEALED BOX. Nothing inside it may reach the network: no stylesheet link, no
 *   `<img src>` pointing at a file. So every rule is inlined from `document.styleSheets` and
 *   every image is refetched and embedded as a data URI first. An image left as a URL does not
 *   error — it simply does not appear, and the back comes out missing its roundel.
 * ⚠ AND IT IS SAME-ORIGIN ONLY. A cross-origin image would taint the canvas and `toDataURL`
 *   would throw; everything here is served from this origin, and anything that fails to fetch is
 *   DROPPED rather than left to poison the result.
 *
 * FAILS OPEN: any step that does not work resolves to `null`, and the caller keeps the generated
 * stand-in back. A card with a plain back is a card; a card with a broken one is not.
 */
(function (global) {
  'use strict';

  var SELF = (document.currentScript && document.currentScript.src) || '';
  var BASE = SELF ? SELF.replace(/js\/card-back\.js.*$/, '') : '';

  /* Every rule the page has, as text. ⚠ A stylesheet from another origin throws on `cssRules`
   * and must be skipped rather than allowed to abort the whole collection. */
  function allCss(doc) {
    var out = '';
    var sheets = (doc || document).styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      try {
        var rules = sheets[i].cssRules;
        for (var j = 0; j < rules.length; j++) out += rules[j].cssText + '\n';
      } catch (e) { /* cross-origin sheet — skip it, do not abort */ }
    }
    return out;
  }

  function toDataUri(url) {
    return fetch(url).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
      if (!b) return null;
      return new Promise(function (res) {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = function () { res(null); };
        fr.readAsDataURL(b);
      });
    }).catch(function () { return null; });
  }

  /* Rasterise a live element. `el` is not modified — a clone is measured, inlined and drawn. */
  function fromElement(el, opts) {
    var o = opts || {};
    if (!el) return Promise.resolve(null);
    var W = o.w || 520, H = o.h || Math.round((o.w || 520) * 1.5);
    /* ⛔ THE CSS MUST COME FROM THE PAGE THAT DEFINES THE BACK, NOT FROM THE HOST PAGE.
     *   `cards/cardback.css` is loaded by the 196 card pages and by nothing else — so
     *   rasterising a card's back from the BINDER collected the binder's stylesheets, which
     *   contain no `.back` rules at all. Every `cqw` unit then resolved to ZERO, the whole
     *   layout collapsed, and the only thing left with a size was the watermark at 134% —
     *   which rendered as a giant wordmark and looked like a texture bug rather than a
     *   missing stylesheet. `opts.css` is how the caller supplies the right rules. */
    /* ⛔ THE LIVE KEY LIGHT DOES NOT GO INTO THE TEXTURE. `cards/cardback.css` gives the back a
     *   moving specular lobe (`.back::before/::after`) so a card page's reverse answers the
     *   pointer. Baking it here would print ONE frozen highlight into the paper and then hand
     *   that paper to a renderer that lights it again — the same double-lighting that
     *   `js/card3d.js` recorded as "the wash", arriving through the back door and looking like a
     *   dirty scan rather than like a bug. The press lights its own reverse; this is only the
     *   plate. ⚠ It must be a CSS override rather than a DOM removal: they are pseudo-elements,
     *   so there is no node to strip — they arrive with the inlined stylesheet.
     * ⚠ AND IT IS INSURANCE RATHER THAN THE THING THAT SAVES US TODAY — measured, because a
     *   comment claiming a fix that does nothing is worse than no comment. Rasterising the same
     *   back with and without this rule produces a BYTE-IDENTICAL plate in Chromium: an SVG
     *   foreignObject rendered through an <img> does not composite `mix-blend-mode` at all, so
     *   neither layer arrives either way. That is a rendering detail of one engine, not a
     *   guarantee — the rule costs one string and holds if any browser starts honouring it.
     *   `npm run test:back` §3 asserts the PROPERTY (no light reaches the plate) rather than the
     *   presence of this rule, so it keeps meaning something if the engine changes. */
    var css = (o.css || allCss(el.ownerDocument))
      + '\n.back::before,.back::after,.face.back::before,.face.back::after'
      + '{ display:none !important; background:none !important; }';
    var clone = el.cloneNode(true);

    var srcs = [].slice.call(el.querySelectorAll('img'));
    var dsts = [].slice.call(clone.querySelectorAll('img'));
    return Promise.all(srcs.map(function (im) { return toDataUri(im.src); })).then(function (uris) {
      for (var i = 0; i < dsts.length; i++) {
        if (uris[i]) dsts[i].setAttribute('src', uris[i]);
        else if (dsts[i].parentNode) dsts[i].parentNode.removeChild(dsts[i]);
      }
      /* ⚠ THE CLONE HAS TO BE MADE VISIBLE AND FLAT. On a card page the back is the far side of a
       *   3D flip: rotated, `backface-visibility:hidden`, and often `position:absolute`. Serialised
       *   as-is it rasterises to nothing — a blank texture that looks exactly like a failed
       *   rasteriser rather than like a hidden element. */
      clone.style.cssText += ';position:static;display:block;transform:none;'
        + 'backface-visibility:visible;-webkit-backface-visibility:visible;opacity:1;'
        + 'width:' + W + 'px;height:' + H + 'px;margin:0;';
      var ser = new XMLSerializer().serializeToString(clone);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">'
        + '<foreignObject width="100%" height="100%">'
        + '<div xmlns="http://www.w3.org/1999/xhtml">'
        + '<style>' + css.replace(/</g, '&lt;') + '</style>' + ser
        + '</div></foreignObject></svg>';
      var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      return new Promise(function (res) {
        var im = new Image();
        im.onload = function () {
          try {
            var cv = document.createElement('canvas');
            cv.width = W; cv.height = H;
            cv.getContext('2d').drawImage(im, 0, 0, W, H);
            res(cv);
          } catch (e) { res(null); }
        };
        im.onerror = function () { res(null); };
        im.src = url;
      });
    }).catch(function () { return null; });
  }

  /* ── a card's own designed back, from its own page ────────────────────────────────────────
   * ⚑ FETCHED FROM THE CARD'S PAGE, because that is where the per-card content lives — its
   *   trivia, its vitals, its trait tags. Building the markup here from a manifest would give
   *   every card the same back with a different name on it, which is not the designed back, it
   *   is a template wearing its clothes.
   * ⚠ Cached per slug: a binder paging through 100 cards must not refetch and re-rasterise one
   *   it has already drawn. */
  var _cache = {};
  function forCard(card, opts) {
    var o = opts || {};
    var slug = card && (card.slug || String(card.art || '').replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, ''));
    if (!slug) return Promise.resolve(null);
    if (_cache[slug]) return _cache[slug];
    var base = (o.base === undefined) ? BASE + 'cards/' : o.base;
    _cache[slug] = fetch(base + slug + '.html')
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (html) {
        if (!html) return null;
        /* Parse it in a detached document, then adopt the back into THIS one so it inherits the
         * live stylesheet. ⚠ A detached document has no layout, and foreignObject needs one. */
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var back = doc.querySelector('.face.back');
        if (!back) return null;
        /* the card page's OWN rules: its inline <style> blocks, plus every stylesheet it
         * links — which is where cardback.css lives. Fetched as text, because a <link> inside a
         * foreignObject would be a network request the sealed SVG is not allowed to make. */
        var inline = [].slice.call(doc.querySelectorAll('style')).map(function (s) { return s.textContent; });
        var links = [].slice.call(doc.querySelectorAll('link[rel="stylesheet"]')).map(function (l) {
          var href = l.getAttribute('href') || '';
          return /^(https?:|\/)/.test(href) ? href : base + href;
        });
        var host = document.createElement('div');
        host.setAttribute('aria-hidden', 'true');
        host.style.cssText = 'position:absolute;left:-99999px;top:0;width:520px;height:780px;'
          + 'pointer-events:none;';
        var live = document.importNode(back, true);
        /* resolve the page's relative image paths against the CARD directory, not this page */
        [].slice.call(live.querySelectorAll('img')).forEach(function (im) {
          var s = im.getAttribute('src') || '';
          if (!/^(https?:|data:|\/)/.test(s)) im.setAttribute('src', new URL(base + s, location.href).href);
        });
        host.appendChild(live);
        document.body.appendChild(host);
        return Promise.all(links.map(function (u) {
          return fetch(u).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; });
        })).then(function (sheets) {
          var css = sheets.join('\n') + '\n' + inline.join('\n');
          return fromElement(live, { w: o.w || 520, h: o.h || 780, css: css });
        }).then(function (cv) {
          try { host.remove(); } catch (e) {}
          return cv;
        });
      }).catch(function () { return null; });
    return _cache[slug];
  }

  global.CardBack = { fromElement: fromElement, forCard: forCard };
})(window);

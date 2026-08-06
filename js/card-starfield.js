/* ripmaster3030studios — THE STARFIELD CARD VIEWER, EVERYWHERE.   `CardStarfield`
 *
 *   CardStarfield.open({items, index, base})  -> ctrl        never throws
 *   CardStarfield.close()
 *       item = { card:{art,title,rarity,sub}, … }   a PICTURE  — the folder, a pack pull, the 196
 *       item = { recipe:"seed=…&g=…", … }           a RECIPE   — one of the hundred
 *       item.title / item.meta / item.href          what the caption says, and where ↗ goes
 *
 * Artist, 2026-08-06: *"the right viewer when clicked is the viewer used in the folder viewer"*
 * and *"pack rip should use that one too - the one with the starfield."*
 *
 * ══ ⛔ WHY THIS IS A MODULE AND NOT A THIRD COPY ════════════════════════════════════════════
 * The folder had this viewer inline. The pack had most of it inline, smaller. `cards/deck.html`
 * had none and sent every one of the hundred to `cards/proof.html` — the forge — which is what
 * the artist reported as *"the wrong viewer"*, and which is now not even deployed.
 * ⚑ Three near-copies of one viewer is three chances to fix one of them, and this repo has paid
 *   that bill repeatedly — the colour-management fix that existed twice, `moveBody` lifted out of
 *   `stepGround` because "two copies drift and the one that drifts is the one nobody is looking
 *   at", `drawWeapon` lifted out of `drawFighter`. The requirement is not "a viewer that looks
 *   like the folder's"; it is the SAME viewer. So it is one file, and the folder is a caller.
 *
 * ══ ⚑ WHAT IT IS ═══════════════════════════════════════════════════════════════════════════
 * A full-screen warp — the landing page's own pack-rip starfield, unchanged on purpose, because
 * opening a card from the folder, from the deck and out of a pack should be the same event — with
 * the live press in the middle of it (`js/card-view.js`), prev/next through whatever set you came
 * from, and ⇄ to turn the card over onto its designed back.
 *
 * ══ ⚠ FAILS OPEN, AND THAT MEANS SOMETHING SPECIFIC HERE ═══════════════════════════════════
 * `CardView.mount` resolves `null` unless a real sheet has printed — the guard `js/card-press.js`
 * records as this repo's one fail-open violation. So the flat card underneath is REAL markup that
 * is shown first and never removed, and the press fades in over it only once it has ink. No
 * WebGL2, no manifest, a plate that 404s ⇒ a handsome flat card in a starfield, which is a
 * perfectly good thing to be.
 */
(function (global) {
  'use strict';

  var CSS = [
    '.sfv{position:fixed;inset:0;z-index:1000;display:none;background:rgba(1,8,4,.94);perspective:1200px}',
    '.sfv.show{display:block}',
    '.sfv-warp{position:absolute;inset:0;z-index:0;width:100%;height:100%;pointer-events:none}',
    '.sfv-stage{position:absolute;inset:0;z-index:1;display:flex;align-items:center;',
      'justify-content:center;gap:clamp(6px,2.2vw,22px);padding:16px 16px 96px}',
    '.sfv-nav{flex:none;width:48px;height:48px;border-radius:50%;border:1px solid rgba(43,255,128,.45);',
      'display:grid;place-items:center;background:rgba(2,16,9,.86);color:#2bff80;font-size:15px;',
      'cursor:pointer;box-shadow:0 0 14px rgba(43,255,128,.28)}',
    '.sfv-nav:disabled{opacity:.25;cursor:default}',
    '.sfv-x{position:absolute;top:max(14px,env(safe-area-inset-top));right:14px;z-index:4;',
      'width:44px;height:44px;border-radius:50%;display:grid;place-items:center;',
      'border:1px solid rgba(43,255,128,.45);background:rgba(2,16,9,.9);color:#2bff80;font-size:15px;',
      'cursor:pointer;box-shadow:0 0 14px rgba(43,255,128,.3)}',
    '.sfv-card{position:relative;flex:none;aspect-ratio:2/3;height:min(70vh,640px);width:auto;',
      'max-width:min(84vw,430px);opacity:0;transition:opacity .22s ease}',
    '@media (max-aspect-ratio:2/3){.sfv-card{width:min(84vw,430px);height:auto;max-height:70vh}}',
    '.sfv-card.ready{opacity:1}',
    '.sfv-card canvas{position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:3.4%}',
    '.sfv-flat{position:absolute;inset:0;border-radius:3.4%;overflow:hidden;background:#0b0b12;',
      'box-shadow:0 24px 60px rgba(0,0,0,.75),0 0 0 1px rgba(255,255,255,.09) inset}',
    '.sfv-flat img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}',
    '.sfv-meta{position:absolute;left:0;right:0;bottom:max(14px,env(safe-area-inset-bottom));z-index:3;',
      'text-align:center;padding:0 12px}',
    '.sfv-ttl{font-family:var(--fat,"Arial Black",sans-serif);font-size:clamp(13px,2.3vw,19px);',
      'letter-spacing:.05em;text-transform:uppercase;color:#2bff80;text-shadow:0 0 16px rgba(43,255,128,.5)}',
    '.sfv-sub{margin-top:6px;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#27f7e4}',
    '.sfv-acts{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:6px}',
    '.sfv-acts a,.sfv-acts button{display:inline-flex;align-items:center;justify-content:center;',
      'min-height:44px;padding:0 14px;font-family:inherit;font-size:9px;letter-spacing:.12em;',
      'text-transform:uppercase;text-decoration:none;cursor:pointer;border-radius:7px;',
      'background:rgba(2,16,9,.8);border:1px solid rgba(255,210,59,.4);color:#ffd23b}',
    /* ⚠ `display:inline-flex` beats the user agent's `[hidden]{display:none}` — the folder shipped
       exactly this bug, offering "open the card page" for cards that have no page. Any rule that
       sets display has to also say what hidden means, or hidden stops meaning anything. */
    '.sfv-acts [hidden]{display:none}',
    '@media (prefers-reduced-motion:reduce){.sfv-card{transition:none}}',
  ].join('');

  var root = null, els = null, view = null, items = [], cur = 0, base = '', warp = null;

  function build() {
    if (root) return root;
    var st = document.createElement('style');
    st.id = 'sfv-css'; st.textContent = CSS;
    document.head.appendChild(st);

    root = document.createElement('div');
    root.className = 'sfv';
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'card viewer');
    root.innerHTML =
      '<canvas class="sfv-warp" aria-hidden="true"></canvas>' +
      '<button class="sfv-x" type="button" aria-label="close">✕</button>' +
      '<div class="sfv-stage">' +
        '<button class="sfv-nav" type="button" data-d="-1" aria-label="previous card">◀</button>' +
        '<div class="sfv-card"><div class="sfv-flat"><img alt=""></div></div>' +
        '<button class="sfv-nav" type="button" data-d="1" aria-label="next card">▶</button>' +
      '</div>' +
      '<div class="sfv-meta">' +
        '<div class="sfv-ttl"></div><div class="sfv-sub"></div>' +
        '<div class="sfv-acts">' +
          '<button type="button" class="sfv-flip" hidden>⇄ back</button>' +
          '<a class="sfv-open" href="#" hidden>open the card page →</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    els = {
      warp: root.querySelector('.sfv-warp'), card: root.querySelector('.sfv-card'),
      flat: root.querySelector('.sfv-flat'), img: root.querySelector('.sfv-flat img'),
      ttl: root.querySelector('.sfv-ttl'), sub: root.querySelector('.sfv-sub'),
      flip: root.querySelector('.sfv-flip'), open: root.querySelector('.sfv-open'),
      prev: root.querySelector('[data-d="-1"]'), next: root.querySelector('[data-d="1"]'),
    };

    root.querySelector('.sfv-x').onclick = close;
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    els.prev.onclick = function () { step(-1); };
    els.next.onclick = function () { step(1); };
    els.flip.onclick = function () { if (view) { try { view.flip(); } catch (e) {} } };
    addEventListener('keydown', function (e) {
      if (!root.classList.contains('show')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    });
    warp = makeWarp(els.warp);
    return root;
  }

  /* ── the warp ────────────────────────────────────────────────────────────────────────────
   * The landing page's pack-rip starfield, unchanged. It runs only while the viewer is open.
   * ⚑ NO GPU PASS, and that is a deliberate downgrade from the landing page's copy. There it is
   *   the only thing on screen; here it shares the page with the card's own WebGL context, and
   *   putting a full-screen canvas through a second context's bloom chain every frame is the
   *   most expensive thing in the viewer by a wide margin — spent on decoration behind the
   *   subject. The streaks carry their own trail; they do not need bloom to read.
   * ⚠ Backing store capped at 1.25: this is motion-blurred line work on a full-screen surface,
   *   where fill rate is the cost that scales with every pixel. */
  function makeWarp(cv) {
    var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
    if (!ctx) return { start: function () {}, stop: function () {} };
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dpr = Math.min(global.devicePixelRatio || 1, 1.25,
      (global.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2);
    var N = matchMedia('(max-width:760px)').matches ? 170 : 300;
    var SPEED = reduce ? 3.1 : 6.2;      // it keeps flying under reduce-motion, just calmer
    var stars = [], raf = 0, w = 0, h = 0, cx = 0, cy = 0;
    function size() {
      w = innerWidth; h = innerHeight; cx = w / 2; cy = h / 2;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function spawn() {
      return { x: (Math.random() * 2 - 1) * w, y: (Math.random() * 2 - 1) * h,
               z: Math.random() * w || 1 };
    }
    function frame() {
      ctx.fillStyle = 'rgba(1,8,4,0.34)'; ctx.fillRect(0, 0, w, h);        // motion trails
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i], pz = s.z;
        s.z -= SPEED;
        if (s.z <= 1) { var f = spawn(); s.x = f.x; s.y = f.y; s.z = w; continue; }
        var k = 130 / s.z, pk = 130 / pz, a = Math.min(1, (1 - s.z / w) * 1.4);
        ctx.strokeStyle = 'rgba(' + (205 + Math.floor(a * 50)) + ',255,225,' + a.toFixed(2) + ')';
        ctx.lineWidth = Math.max(0.4, (1 - s.z / w) * 2.6);
        ctx.beginPath();
        ctx.moveTo(cx + s.x * pk, cy + s.y * pk);
        ctx.lineTo(cx + s.x * k, cy + s.y * k);
        ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    }
    var api = {
      start: function () { size(); stars = []; for (var i = 0; i < N; i++) stars.push(spawn());
                           cancelAnimationFrame(raf); frame(); },
      stop: function () { cancelAnimationFrame(raf); raf = 0; },
    };
    addEventListener('resize', function () { if (raf) size(); }, { passive: true });
    /* ⚠ A hidden tab still fires rAF in some browsers and never in others; either way a warp
     *   nobody can see is pure cost. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) api.stop();
      else if (root && root.classList.contains('show')) api.start();
    });
    return api;
  }

  function itemOf(i) { return items[i] || null; }

  /* The caption and the flat fallback. ⚠ Written on EVERY step, including the ones the press
   * serves from its existing context — a viewer that swaps the picture and keeps the previous
   * card's name is the "two representations of one fact, disagreeing" defect the folder's own
   * flip() shipped. */
  function paint() {
    var it = itemOf(cur);
    if (!it) return;
    var art = (it.card && it.card.art) || it.art || '';
    /* ⚠ `src = ''` IS NOT "NO IMAGE" — an empty src resolves against the document and re-requests
     *   the PAGE, which then fails to decode. One of the hundred has no flat art at all (it is a
     *   recipe; the press is the only picture), so this path is the normal one there, not an
     *   edge case. Remove the attribute instead. */
    if (art) els.img.src = art; else els.img.removeAttribute('src');
    els.img.alt = it.title || (it.card && it.card.title) || '';
    els.flat.style.display = art ? '' : 'none';
    els.ttl.textContent = String(it.title || (it.card && it.card.title) || '').toUpperCase();
    els.sub.textContent = it.meta || '';
    els.open.hidden = !it.href;
    if (it.href) els.open.href = it.href;
    els.prev.disabled = cur <= 0;
    els.next.disabled = cur >= items.length - 1;
  }

  function mount() {
    var it = itemOf(cur);
    if (!it || !global.CardView) return;
    if (view) {
      /* ⚑ ONE PRESS FOR THE WHOLE SET. `getContext('webgl2')` returns the SAME context on a
       * second call and HeroCard never releases, so walking a deck by re-mounting would leak a
       * program, buffers and seven textures per card — and browsers silently drop the OLDEST
       * context, which surfaces as some card blanking minutes later somewhere else. */
      try { view.show(it.recipe || it.card); } catch (e) {}
      return;
    }
    var opts = { box: els.card, base: base };
    if (it.recipe) opts.recipe = it.recipe; else opts.card = it.card;
    CardView.mount(opts).then(function (v) {
      if (!v) return;                       // never printed — the flat card underneath stands
      view = v;
      els.card.classList.add('ready');
      els.flip.hidden = false;
      /* the set may have been stepped while the press was building */
      var now = itemOf(cur);
      if (now) { try { v.show(now.recipe || now.card); } catch (e) {} }
    }).catch(function () {});
  }

  function step(d) {
    var n = cur + d;
    if (n < 0 || n >= items.length) return;
    cur = n; paint(); mount();
  }

  function open(o) {
    o = o || {};
    build();
    items = (o.items || []).filter(Boolean);
    if (!items.length) return null;
    cur = Math.max(0, Math.min(o.index || 0, items.length - 1));
    base = o.base || '';
    /* ⛔ THE READY CLASS COMES OFF ON EVERY OPEN. It is what reveals the press; left on from a
     *   previous open, a set whose press has not printed yet shows an empty box over the flat
     *   card for as long as the build takes. */
    if (!view) els.card.classList.remove('ready');
    els.flip.hidden = !view;
    root.classList.add('show');
    root.setAttribute('aria-hidden', 'false');
    if (warp) warp.start();
    paint(); mount();
    return { close: close, step: step, index: function () { return cur; } };
  }

  function close() {
    if (!root) return;
    root.classList.remove('show');
    root.setAttribute('aria-hidden', 'true');
    if (warp) warp.stop();
    /* ⚠ THE PRESS IS KEPT, NOT DESTROYED. Closing and reopening is the commonest thing anyone
     *   does here, and a rebuild costs a shader compile, a manifest read and seven texture
     *   uploads — while the context it would replace is the same one the browser hands back
     *   anyway. `js/card-view.js` memoises on the box, which is this same element. */
  }

  global.CardStarfield = {
    open: open, close: close,
    /* exposed so a driven harness can assert on the real thing rather than infer it from a
     * screenshot — the rule `hero-card.maps()` and `CardPress.__hasInk` already follow. */
    __state: function () {
      return { open: !!(root && root.classList.contains('show')), index: cur,
               count: items.length, live: !!view };
    },
  };
})(window);

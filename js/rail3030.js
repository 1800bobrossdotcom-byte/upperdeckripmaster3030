/* ripmaster3030studios — 3030 · THE RAIL. ONE SET OF DOORS, IN ONE PLACE, ON EVERY SURFACE.
 *
 * Artist, 2026-08-09: *"these pages still feel disparate separate and unusable."* He was right,
 * and the measurement is unambiguous. Driven at 1180×900 across the seven surfaces:
 *
 *     page                      first link at    links on the page
 *     check.html                       299px             12
 *     poolcheck.html                   315px              8
 *     toll.html                        572px              6
 *     3030.html                      1,225px              7
 *     sheet.html                     1,507px              3
 *     substrate.html                 5,511px              2
 *
 * ⛔ THERE WAS NO SHARED NAVIGATION AT ALL. Every page carried its own exits, in its own place, in
 *   its own quantity — and on `substrate.html` the first link of any kind sat **six screens down**,
 *   so the reading was a dead end you had to scroll the length of to escape. Seven tools that each
 *   end differently are seven tools. **The doors are what make it one product**, and they have to be
 *   in the same place or a visitor has to re-learn the page every time they arrive.
 *
 * ⚑ ONE MODULE, NOT SEVEN COPIES, for the reason this repo keeps paying for: a nav pasted into
 *   seven files is seven places to add the eighth surface, and the one that gets missed is the one
 *   nobody opens. `js/challenge-ui.js` is the same argument about a game picker; `cards/index.html`
 *   is the recorded case where a generator and its output drifted.
 *
 * ⚠ ROOT-ABSOLUTE HREFS. These pages are served from two hosts — `www.ripmaster3030studios.com`
 *   and `3030.ripmaster3030studios.com`, which serve the same files — so a relative href would be
 *   correct on both only by accident, and `cards/` sits at another depth. Absolute paths resolve
 *   against whichever host the visitor is on, which is what "the same tool" means here.
 *
 * ⚠ FAIL OPEN, AND FOR A NAV THAT MEANS LEAVE THE PAGE ALONE. If anything here throws, the page is
 *   exactly the page it was — every surface keeps its own footer links, so nothing is orphaned by
 *   this module failing. It never removes anything.
 *
 * ⚠ CLASSIC SCRIPT — `npm run test:reach` §0 compiles every shipped browser script with
 *   `new Function`, where `export` is a SyntaxError. Same rule as `js/check3030.js`.
 */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc) return;
  /* ⚠ never inside an embedded frame: `cards/lens3d.html` and the hero lenses render in sandboxed
   *   iframes, and a nav bar inside a token's media slot is chrome nobody asked for. */
  try { if (root.self !== root.top) return; } catch (e) { return; }

  /* ⛔ THE DOORS ARE ONE LIST AND THE CURRENT PAGE IS DERIVED FROM IT, never passed in. A page that
   *   has to declare "I am the substrate" is a page that can declare it wrong — and the wrong one
   *   marked current is worse than none marked, because it tells the visitor they are somewhere
   *   they are not. */
  var DOORS = [
    { file: 'check.html',      label: 'CHECK',     sub: 'know before you sign' },
    { file: 'worldcomputerhyperterminal.html', label: 'TERMINAL', sub: 'what a market costs now' },
    { file: 'toll.html',       label: 'TOLL',      sub: 'the game' },
    { file: 'substrate.html',  label: 'SUBSTRATE', sub: 'eth + base as one surface' }
  ];
  /* ⛔ PLATE IS RETIRED (2026-08-10). `sheet.html` was a composing frame: you typed 256 bytes into
   *   8 lines of 32 cells and it could not press them, because the press contract does not exist.
   *   Its own header said it existed to settle ONE question — "does the plate read as a page or as
   *   a chart?" — and SUBSTRATE now answers it by setting a real Ethereum block on the same 32-byte
   *   measure, every cell a real byte. The experiment concluded; the answer shipped into the door
   *   next to it. ⚑ Every other door here answers a question a visitor actually has; this one asked
   *   them to compose bytes they could never send, which is the "menu, not a tool" failure CHECK's
   *   own copy is about. The URL still resolves — it redirects to SUBSTRATE — because a shared link
   *   should keep working. */
  /* ⚠ `3030.html` and `poolcheck.html` are ANSWERS, not doors — CHECK routes to them once it knows
   *   what you pasted. They are marked as belonging to CHECK rather than given a slot of their own,
   *   because a menu listing every internal destination is the "menu, not a tool" failure CHECK's
   *   own copy is about. */
  var ANSWER_OF = { '3030.html': 'check.html', 'poolcheck.html': 'check.html', 'drain.html': 'check.html' };

  function here() {
    var p = (root.location && root.location.pathname) || '';
    var f = p.replace(/^.*\//, '') || 'index.html';
    return ANSWER_OF[f] || f;
  }

  function build() {
    if (doc.getElementById('r3030')) return;                 // idempotent: two loads must not stack
    var cur = here();
    /* only mount on a surface the rail knows — this module is for the 3030 tool, not for the
     * arcade, the deck or the document pages, which have their own navigation. */
    var known = DOORS.some(function (d) { return d.file === cur; });
    if (!known) return;

    var css = doc.createElement('style');
    css.id = 'r3030-css';
    /* ⚠ The palette is READ from the page's own custom properties with a fallback, so the rail
     *   inherits whatever the surface declares instead of introducing an eighth colour scheme —
     *   which is the defect this module exists to fix, and it would be absurd to add one. */
    css.textContent = [
      '#r3030{position:sticky;top:0;z-index:2147482000;display:flex;align-items:stretch;gap:0;',
        'background:var(--bg,#07090c);border-bottom:1px solid var(--line,#1c2620);',
        'font-family:var(--mono,ui-monospace,Menlo,Consolas,monospace);overflow-x:auto;',
        '-webkit-overflow-scrolling:touch;scrollbar-width:none}',
      '#r3030::-webkit-scrollbar{display:none}',
      '#r3030 a{flex:0 0 auto;display:flex;align-items:center;min-height:44px;padding:0 14px;',
        'text-decoration:none;color:var(--dim,#8ea08c);font-size:13px;letter-spacing:.14em;',
        'white-space:nowrap;border-right:1px solid var(--line,#1c2620)}',
      '#r3030 a:hover,#r3030 a:focus{color:var(--ink,#e8ede6);background:rgba(255,255,255,.03)}',
      /* ⛔ THE CURRENT PAGE IS MARKED BY A BAR, NOT BY COLOUR ALONE. A colour-only "you are here"
         is invisible to anyone who cannot separate those two hues, and this palette's dim and hot
         are both greenish. */
      '#r3030 a[aria-current]{color:var(--hot,#e0ff4f);box-shadow:inset 0 -2px 0 var(--hot,#e0ff4f)}',
      '#r3030 .r-home{color:var(--ink,#e8ede6);font-weight:600}',
      '#r3030 .r-sub{display:none}',
      '@media(min-width:860px){#r3030 .r-sub{display:inline;color:var(--dim,#8ea08c);',
        'opacity:.65;margin-left:9px;letter-spacing:.02em;font-size:12px}}'
    ].join('');
    doc.head.appendChild(css);

    var nav = doc.createElement('nav');
    nav.id = 'r3030';
    nav.setAttribute('aria-label', '3030 tools');
    var html = '<a class="r-home" href="/index.html" title="ripmaster3030studios">◈</a>';
    for (var i = 0; i < DOORS.length; i++) {
      var d = DOORS[i], on = d.file === cur;
      html += '<a href="/' + d.file + '"' + (on ? ' aria-current="page"' : '') + '>' + d.label
            + '<span class="r-sub">' + d.sub + '</span></a>';
    }
    nav.innerHTML = html;
    /* first child of body, so it is the first thing in the tab order as well as on screen */
    if (doc.body.firstChild) doc.body.insertBefore(nav, doc.body.firstChild);
    else doc.body.appendChild(nav);
  }

  try {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', build);
    else build();
  } catch (e) { /* fail open: the page is the page it was */ }

  root.Rail3030 = { DOORS: DOORS, here: here };
})(typeof window !== 'undefined' ? window : this);

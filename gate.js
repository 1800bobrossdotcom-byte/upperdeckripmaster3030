/* ripmaster3030studios — pre-launch ADMIN GATE (client-side veil).  ⛔ THE VEIL IS OFF.
 *
 * Artist, 2026-08-05: *"lets take off the password protection now"*. `LIVE = true` and this
 * file returns before it draws anything. The site is PUBLIC.
 *
 * ⚑ ONE FLAG, NOT A SIXTY-NINE-FILE SWEEP, and that is deliberate. 69 shipped pages carry
 *   `<script src="/gate.js">` and `scripts/build-pages.mjs` writes it into every page it
 *   generates. Stripping the tag from the OUTPUT would leave the generator armed to put it
 *   back — this repo's recorded `restyle-backs.mjs` failure, where generator and output
 *   disagreed and re-running silently undid the fix — and a sweep that misses one page leaves
 *   a surface veiled that nobody will open until a collector does. Turning the veil off at its
 *   source cannot miss a page and cannot be undone by a regenerate.
 * ⚑ Reversible in one character: set LIVE to false.
 *
 * ⚠ THE PASSWORD BELOW IS BURNED and must not be reused. It has been in a public repository,
 *   in page source, on every one of those 69 pages, for the whole pre-launch period — that is
 *   what a client-side veil IS. It is kept here only so flipping LIVE back gives a working
 *   gate; if the veil ever goes back up for something that matters, change it first. For
 *   protection that is actually protection, use the platform's own Deployment Protection,
 *   which runs server-side and never ships a secret to the client at all.
 *
 * ⚠ Nothing else changes when the veil lifts: `robots.txt` already reads `Allow: /` and no
 *   page carries `noindex`, so the site becomes indexable the moment crawlers next call.
 */
(function () {
  var LIVE = true;                      // ← ⛔ the site is public. false puts the veil back.
  if (LIVE) return;

  /* ⛔ A VEIL MAY NEVER COVER AN EMBED, AND THIS IS NOT ABOUT TODAY. The flag above is off, so
   * nothing below runs right now — but it is documented as "reversible in one character", and
   * the day it flips back every card whose `animation_url` frames a page carrying this script
   * would render a PASSWORD PROMPT in a marketplace media slot. A token is permanent and a veil
   * is temporary; the permanent thing must not be able to be broken by the temporary one.
   * ⚑ Cards 34…100 point their animation_url at `cards/field.html?n=NN`, which carries this
   *   script — so this is the guard that lets a browsable studio page double as a media target.
   *   Same argument as the LIVE flag itself: fix it at the source, where it cannot miss a page
   *   and cannot be undone by a regenerate.
   * ⚠ It loses nothing. This has always been a curtain rather than a lock — the check is
   *   client-side and the password has been in a public repo on 69 pages — so anyone who wanted
   *   past it never needed an iframe. Real protection is the platform's Deployment Protection,
   *   which runs server-side and is unaffected by any of this. */
  try { if (window.top !== window.self) return; } catch (e) { return; }   // cross-origin ⇒ framed

  var ADMIN = '1800bobrossdotcom@gmail.com';
  var PASS = 'ripmaster3030';           // ← BURNED, see the header. Change before any reuse.
  var KEY = 'urm_admin_ok';

  try { if (localStorage.getItem(KEY) === '1') return; } catch (e) { /* gate anyway */ }

  // hide everything until authed (also covers the no-JS case: this style just stays)
  var hide = document.createElement('style');
  hide.id = 'urm-hide';
  hide.textContent = 'body>*{visibility:hidden!important}#urm-gate,#urm-gate *{visibility:visible!important}html,body{overflow:hidden!important}';
  (document.head || document.documentElement).appendChild(hide);

  var css = document.createElement('style');
  css.id = 'urm-css';
  css.textContent = [
    '#urm-gate{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:min(4.5vh,26px);padding:24px 20px;overflow:auto;',
      'font-family:"Courier New",ui-monospace,monospace;color:#b8ffd6;',
      'background:radial-gradient(130% 90% at 50% -12%,#06180d 0%,#04110a 52%,#020604 100%);}',
    '#urm-gate .u-scan{position:fixed;inset:0;pointer-events:none;z-index:1;opacity:.5;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px);}',
    '#urm-gate .u-fire{position:fixed;left:0;right:0;bottom:0;height:46%;pointer-events:none;z-index:0;background:radial-gradient(120% 100% at 50% 132%,rgba(255,120,40,.22),rgba(255,42,60,.08) 42%,transparent 68%);}',
    '@keyframes u-flick{0%,100%{opacity:.9}45%{opacity:.62}70%{opacity:1}}',
    '@media (prefers-reduced-motion:no-preference){#urm-gate .u-fire{animation:u-flick 3.2s ease-in-out infinite}}',
    '.u-sign{position:relative;z-index:2;display:flex;align-items:center;justify-content:center;gap:clamp(6px,3vw,26px);width:100%;}',
    '.u-torch{flex:none;height:clamp(58px,12vw,124px);width:auto;filter:drop-shadow(0 0 18px rgba(255,150,40,.5));}',
    /* ⚠ 74vw/500px WAS SIZED FOR A ~2:1 BANNER. The mark is SQUARE now, and `height:auto` means a
     *   width cap is also a height cap — 500px tall on a phone pushed the login form off-screen.
     *   Squares need their own number; a banner's width does not transfer. */
    '.u-logo{width:min(52vw,300px);height:auto;display:block;filter:drop-shadow(0 0 26px rgba(43,255,128,.28));}',
    '.u-kick{position:relative;z-index:2;font-family:"Arial Black",Arial,sans-serif;letter-spacing:.26em;font-size:12px;color:#ffd23b;text-align:center;text-shadow:0 0 14px rgba(255,210,59,.35);}',
    '.u-card{position:relative;z-index:2;width:min(92vw,380px);text-align:center;border:1px solid #0f5c33;border-radius:16px;padding:22px 24px 18px;',
      'background:rgba(1,10,5,.86);box-shadow:0 0 60px rgba(43,255,128,.14),inset 0 0 30px rgba(1,10,5,.5);backdrop-filter:blur(3px);}',
    '.u-card .u-h{font-family:"Arial Black",Arial,sans-serif;font-size:11px;letter-spacing:.2em;color:#5fcf8f;margin-bottom:16px;text-transform:uppercase;}',
    '.u-card input{width:100%;box-sizing:border-box;margin:0 0 11px;padding:12px 14px;border:1px solid #0f5c33;border-radius:9px;background:#02120a;color:#d9ffe8;font-family:inherit;font-size:14px;outline:none;}',
    '.u-card input::placeholder{color:#3f8f63;}',
    '.u-card input:focus{border-color:#2bff80;box-shadow:0 0 0 2px rgba(43,255,128,.2);}',
    '.u-card button{width:100%;margin-top:3px;padding:13px;border:2px solid #01130a;border-radius:10px;cursor:pointer;',
      'background:linear-gradient(180deg,#8bffbb,#2bff80 55%,#0fae56);color:#02120a;font-family:"Arial Black",Arial,sans-serif;text-transform:uppercase;letter-spacing:.12em;font-size:13px;',
      'box-shadow:inset 0 2px 0 rgba(255,255,255,.45),0 5px 0 #01130a,0 0 20px rgba(43,255,128,.3);}',
    '.u-card button:active{transform:translateY(2px);box-shadow:inset 0 2px 0 rgba(255,255,255,.45),0 3px 0 #01130a;}',
    '.u-err{height:16px;margin-top:11px;font-size:11px;color:#ff4b3a;letter-spacing:.06em;}',
    '@keyframes urmShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}',
    '@media (max-width:520px){.u-torch{height:clamp(44px,13vw,74px)}}',
  ].join('');
  (document.head || document.documentElement).appendChild(css);

  function build() {
    if (document.getElementById('urm-gate')) return;
    var g = document.createElement('div');
    g.id = 'urm-gate';
    g.innerHTML =
      '<div class="u-scan"></div><div class="u-fire"></div>' +
      '<div class="u-sign">' +
        '<img class="u-torch" src="/torch.gif" alt="" aria-hidden="true">' +
        /* ⛔ WAS `/upperdeckripmaster3030_01_marquee.png` — the retired name, baked into a bitmap,
         *    with an alt attribute already reading `ripmaster3030studios`. That mismatch is the
         *    whole bug in one line: the text was renamed, the PICTURE was not, and this is the
         *    veil every visitor hits before anything else, so it was the first thing anyone saw.
         *    `media/site/mark-1024.png` is cut from the live foil wordmark by `npm run mark`. */
        /* ⚠ 512, NOT 1024. The veil is injected into every page's <head> and is fail-closed, so
         *    this image is on the FIRST-PAINT path of the whole site. mark-1024 is 1.27 MB —
         *    holographic foil is high-entropy noise and barely deflates — against 446 KB at 512,
         *    which is still ~1.7x the 300px box it renders in. There is no cwebp/pngquant in this
         *    container, so picking the right size IS the optimisation. */
        '<img class="u-logo" src="/media/site/mark-512.png" alt="ripmaster3030studios" ' +
          'width="512" height="512" decoding="async">' +
        '<img class="u-torch" src="/torch.gif" alt="" aria-hidden="true">' +
      '</div>' +
      '<div class="u-kick">◈ PRIVATE · PRE-LAUNCH ◈</div>' +
      '<form class="u-card" id="urm-gform">' +
        '<div class="u-h">Admin access only</div>' +
        '<input id="urm-email" type="email" placeholder="admin email" autocomplete="username">' +
        '<input id="urm-pass" type="password" placeholder="password" autocomplete="current-password">' +
        '<button type="submit">Enter the drop</button>' +
        '<div class="u-err" id="urm-err"></div>' +
      '</form>';
    document.body.appendChild(g);
    var form = document.getElementById('urm-gform');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = (document.getElementById('urm-email').value || '').trim().toLowerCase();
      var pw = document.getElementById('urm-pass').value || '';
      if (em === ADMIN && pw === PASS) {
        try { localStorage.setItem(KEY, '1'); } catch (e2) {}
        var h = document.getElementById('urm-hide'); if (h) h.remove();
        g.remove();
      } else {
        document.getElementById('urm-err').textContent = '✗ not recognized';
        form.style.animation = 'none'; void form.offsetWidth; form.style.animation = 'urmShake .3s';
      }
    });
    var e0 = document.getElementById('urm-email'); if (e0) e0.focus();
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();

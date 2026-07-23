/* upperdeckripmaster3030 — pre-launch ADMIN GATE (client-side veil).
 *
 * Hides the whole site behind an admin login until launch. Fail-closed: with JS
 * off, or before you log in, nothing is visible. Access is remembered per-device
 * (localStorage), so you log in once. Styled to match the landing page (torches,
 * marquee logo, acid-terminal palette).
 *
 * ⚠ Soft veil — the password ships in the page source, so it stops search engines
 * and casual visitors but not a determined one. For HARD protection also enable
 * Vercel → Settings → Deployment Protection → Password (server-side).
 *
 * Change the password: edit PASS below.  Admin email: ADMIN below.
 */
(function () {
  var ADMIN = '1800bobrossdotcom@gmail.com';
  var PASS = 'ripmaster3030';           // ← change me
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
    '.u-logo{width:min(74vw,500px);height:auto;display:block;filter:drop-shadow(0 0 26px rgba(43,255,128,.28));}',
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
        '<img class="u-logo" src="/upperdeckripmaster3030_01_marquee.png" alt="upperdeckripmaster3030">' +
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

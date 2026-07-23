/* upperdeckripmaster3030 — pre-launch ADMIN GATE (client-side veil).
 *
 * Hides the whole site behind an admin login until launch. Fail-closed: with JS
 * off, or before you log in, nothing is visible. Access is remembered per-device
 * (localStorage), so you log in once.
 *
 * ⚠ This is a SOFT veil — because the site is static and deployed from git, the
 * password below ships in the page source and a determined visitor can read it.
 * It stops search engines and every casual visitor, which is the point pre-launch.
 * For HARD protection, also turn on Vercel → Settings → Deployment Protection →
 * Password (server-side; the HTML never leaves Vercel without the password).
 *
 * To change the password: edit PASS below.  Admin email: ADMIN below.
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

  var kf = document.createElement('style');
  kf.textContent = '@keyframes urmShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}';
  (document.head || document.documentElement).appendChild(kf);

  function build() {
    if (document.getElementById('urm-gate')) return;
    var g = document.createElement('div');
    g.id = 'urm-gate';
    g.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 100% at 50% 0%,#06180d,#010704 70%);font-family:\'Courier New\',monospace;color:#b8ffd6');
    g.innerHTML =
      '<form id="urm-gform" style="width:min(90vw,380px);text-align:center;border:1px solid #0f5c33;border-radius:16px;padding:30px 26px;background:rgba(1,10,5,.82);box-shadow:0 0 50px rgba(43,255,128,.12)">' +
        '<div style="font-family:\'Arial Black\',Arial;letter-spacing:.22em;font-size:12px;color:#ffd23b;margin-bottom:6px">◈ PRIVATE · PRE-LAUNCH ◈</div>' +
        '<div style="font-family:\'Arial Black\',Arial;font-size:20px;color:#eafff2;letter-spacing:-.01em;margin-bottom:4px">UPPERDECK RIPMASTER 3030</div>' +
        '<div style="font-size:11px;color:#5fcf8f;letter-spacing:.14em;margin-bottom:20px">ADMIN ACCESS ONLY</div>' +
        '<input id="urm-email" type="email" placeholder="admin email" autocomplete="username" style="width:100%;box-sizing:border-box;margin:0 0 10px;padding:11px 13px;border:1px solid #0f5c33;border-radius:9px;background:#02120a;color:#d9ffe8;font-family:inherit;font-size:14px">' +
        '<input id="urm-pass" type="password" placeholder="password" autocomplete="current-password" style="width:100%;box-sizing:border-box;margin:0 0 14px;padding:11px 13px;border:1px solid #0f5c33;border-radius:9px;background:#02120a;color:#d9ffe8;font-family:inherit;font-size:14px">' +
        '<button type="submit" style="width:100%;padding:12px;border:2px solid #01130a;border-radius:10px;background:linear-gradient(180deg,#8bffbb,#2bff80 55%,#0fae56);color:#02120a;font-family:\'Arial Black\',Arial;text-transform:uppercase;letter-spacing:.08em;font-size:13px;cursor:pointer">Enter</button>' +
        '<div id="urm-err" style="height:16px;margin-top:10px;font-size:11px;color:#ff4b3a;letter-spacing:.06em"></div>' +
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

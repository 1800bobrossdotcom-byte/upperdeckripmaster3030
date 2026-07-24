/* upperdeckripmaster3030 — the freshness ticker (persistent, site-wide).
 *
 * We ship paint daily in the run-up to launch, and browsers love to serve a
 * stale cache. This slim strip tells visitors how to hard-refresh — with the
 * right hotkey for their machine — or to just be patient. The ✕ tucks it away
 * for the current page view only; it rides back in on the next page. one love.
 */
(function () {
  function build() {
    if (document.getElementById('urm-fresh')) return;
    var isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
    var combo = isMac ? '⌘ + Shift + R' : 'Ctrl + Shift + R';
    var alt = isMac ? '' : ' (or Ctrl + F5)';

    var css = document.createElement('style');
    css.id = 'urm-fresh-css';
    css.textContent = [
      '#urm-fresh{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;gap:8px;',
        'padding:6px 34px 6px 12px;font-family:"Courier New",ui-monospace,monospace;font-size:10.5px;line-height:1.45;letter-spacing:.04em;',
        'color:#9fd8b8;text-align:center;background:rgba(1,10,5,.93);border-top:1px solid #0f5c33;',
        'box-shadow:0 -6px 18px rgba(0,0,0,.35);backdrop-filter:blur(2px);}',
      '#urm-fresh b{color:#2bff80;font-weight:bold;}',
      '#urm-fresh .uf-flame{color:#ffd23b;text-shadow:0 0 8px rgba(255,150,40,.6);}',
      '#urm-fresh .uf-love{color:#ff2ad9;}',
      '#urm-fresh button{position:absolute;right:6px;top:50%;transform:translateY(-50%);cursor:pointer;border:1px solid #0f5c33;',
        'background:transparent;color:#5fcf8f;font-family:inherit;font-size:10px;line-height:1;padding:4px 7px;border-radius:7px;}',
      '#urm-fresh button:hover{color:#2bff80;border-color:#2bff80;}',
      '@media (max-width:560px){#urm-fresh{font-size:9.5px;padding-right:30px;}}',
    ].join('');
    (document.head || document.documentElement).appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'urm-fresh';
    bar.setAttribute('role', 'note');
    bar.innerHTML =
      '<span><span class="uf-flame">◈</span> fresh paint ships daily — if the site looks stale, hard refresh: ' +
      '<b>' + combo + '</b>' + alt + ' — or just be patient <span class="uf-love">✦ one love</span></span>' +
      '<button type="button" aria-label="tuck the banner away for this page">✕</button>';
    document.body.appendChild(bar);
    bar.querySelector('button').onclick = function () { bar.remove(); };
  }
  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();

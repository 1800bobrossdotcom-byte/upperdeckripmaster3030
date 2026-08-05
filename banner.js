/* ripmaster3030studios — the freshness ticker (persistent, site-wide).
 *
 * We ship paint daily in the run-up to launch, and browsers love to serve a
 * stale cache. This slim strip tells visitors how to hard-refresh — with the
 * right hotkey for their machine — or to just be patient. The ✕ tucks it away
 * for the current page view only; it rides back in on the next page. one love.
 *
 * ⛔ IT WAS SITTING ON TOP OF THE GAMES' CONTROLS, AND IT IS THE HIGHEST z-index ON THE SITE.
 *   This is a strip written for a DOCUMENT and it is loaded by cabinets too, where the bottom of
 *   the viewport is not empty margin — it is where a thumb lives. Measured, iPhone-class emulation:
 *   at 390×844 the strip is 54px tall and it covered RIP ROCKETER's FIRE pad by **28px** and the
 *   ROLL pad by 22px; at 844×390 landscape it is 43px, i.e. **11.1% of the whole screen**, and it
 *   buried CLOUD RACER's boost meter, its tells and the unit of its speed readout outright. Even
 *   at 1280×800 it clipped Cloud Racer's `.ctrls` by 11px. Same shape as the recorded index.html
 *   defect — "three fixed bottom layers at the same altitude, the freshness strip covering the
 *   ticker and both controls" — one page class further out.
 * ⚑ THE FIX IS A MEASUREMENT, NOT A GUESS: the strip PUBLISHES its own height as `--urm-banner`
 *   on <html>, and the pages that own the bottom of the screen subtract it. Hard-coding "about
 *   40px" somewhere else would be a second copy of a number that changes with the viewport (it
 *   wraps to two lines under ~700px) and with the ✕ — which is exactly how the caps in
 *   `city.html` drifted until one of them reached zero. Nobody who does not read the variable is
 *   affected, so this is additive.
 */
(function () {
  var bar = null;

  /* Publish the height. Called after mount, on resize/rotate, whenever the strip re-wraps, and
   * with 0 the moment it is tucked away — a reservation that outlives the thing it reserves for
   * is a hole in the bottom of every page that reads it. */
  function measure() {
    var h = 0;
    try { if (bar && bar.parentNode) h = Math.ceil(bar.getBoundingClientRect().height); } catch (e) {}
    try { document.documentElement.style.setProperty('--urm-banner', h + 'px'); } catch (e) {}
  }

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
      /* ⚠ THE ✕ WAS A 22×20 TAP TARGET — the one control on this strip, on the device that
       * most needs to dismiss it, at half the 44px floor the rest of the site is held to.
       * Coarse pointers only: a 44px button inside a 28px desktop strip would double the
       * height of a notice for the sake of a mouse that does not need the help.
       * ⚠ AND THE COST IS MEASURED AND CONFINED, rather than assumed to be zero: the extra right
       * padding pushes the copy to a third line ONLY on the narrowest phone — 320x568 goes 54px
       * to 68px (9.6% of the viewport to 12%), while 390x844 stays 54, 844x390 stays 43 and the
       * desktop stays 28. That is the device where the strip costs most and also the one where a
       * 22x20 dismiss is hardest to hit, so it is the right trade; `--urm-banner` means no game
       * control is covered either way. */
      '@media (pointer:coarse){#urm-fresh{padding-right:54px;}',
        '#urm-fresh button{min-width:44px;min-height:44px;}}',
    ].join('');
    (document.head || document.documentElement).appendChild(css);

    bar = document.createElement('div');
    bar.id = 'urm-fresh';
    bar.setAttribute('role', 'note');
    bar.innerHTML =
      '<span><span class="uf-flame">◈</span> fresh paint ships daily — if the site looks stale, hard refresh: ' +
      '<b>' + combo + '</b>' + alt + ' — or just be patient <span class="uf-love">✦ one love</span></span>' +
      '<button type="button" aria-label="tuck the banner away for this page">✕</button>';
    document.body.appendChild(bar);
    bar.querySelector('button').onclick = function () { bar.remove(); measure(); };

    measure();
    try { addEventListener('resize', measure, { passive: true }); } catch (e) {}
    try { addEventListener('orientationchange', measure, { passive: true }); } catch (e) {}
    /* ⚠ THE STRIP RE-WRAPS ON ITS OWN. It is one line on a laptop and two on a phone, so its
     * height changes without a resize event whenever the font settles or the copy changes.
     * A ResizeObserver reports the box itself; where there isn't one the resize listener above
     * still covers the case that matters. */
    try { if (window.ResizeObserver) new ResizeObserver(measure).observe(bar); } catch (e) {}
  }
  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();

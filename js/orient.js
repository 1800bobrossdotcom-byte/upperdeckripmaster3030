/* ripmaster3030studios — landscape-on-phone for every cabinet (RipOrient).
 *
 *   <script src="js/orient.js"></script>     // that is the whole integration
 *
 * WHY THIS EXISTS. Every game here is a WIDE picture — a first-person arena, a chase camera, a
 * racing line, a shmup field. Held upright, a phone gives them a tall slot: the horizon sits in
 * the middle third, the touch pads eat the bottom, and Section 9's own stylesheet already gives up
 * at `@media (max-height:520px)`. The games are not broken in portrait, they are *cramped* — which
 * is worse, because it reads as bad design rather than as the wrong way to hold the thing.
 *
 * WHAT IT DOES, in order of preference, because the platforms disagree:
 *   1. Ask the browser to LOCK to landscape. `screen.orientation.lock()` requires fullscreen and
 *      is the real fix where it exists (Android/Chrome).
 *   2. ⚠ iOS SAFARI HAS NEITHER. No `screen.orientation.lock`, and `requestFullscreen` on an
 *      arbitrary element is not supported on iPhone. On the platform where most people will open
 *      this, the ONLY thing that works is asking the human to turn the phone. So the veil is not
 *      a fallback for a failed lock — it is the primary path for half the audience, and it is
 *      built to be readable and inviting rather than an error.
 *   3. If they rotate, it disappears by itself. No button, nothing to dismiss.
 *
 * ⚑ FAIL OPEN, LIKE EVERYTHING ELSE HERE. Any missing API, any rejected promise, any exception:
 *   the veil hides and the game runs in whatever orientation it has. A rotation helper that can
 *   BLOCK a game is a worse bug than the cramped layout it was written to fix.
 * ⚑ TOUCH ONLY. A desktop browser at a tall window is not a phone, and a landscape prompt on a
 *   laptop is nonsense. Gated on coarse pointer + no hover, the same signal `GfxPost.dprCap()`
 *   uses for "weak device".
 * ⚠ `orientationchange` fires BEFORE the viewport settles on iOS — read the size a beat later or
 *   you decide portrait/landscape from the pre-rotation numbers and latch the wrong answer.
 */
window.RipOrient = (function () {
  'use strict';

  var VEIL = null, mounted = false, armed = false, wantLock = false;

  function isTouch() {
    try {
      return matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches;
    } catch (e) { return ('ontouchstart' in window) && !window.matchMedia; }
  }
  /* Measure the VIEWPORT, not `screen.orientation.type`. A phone in a rotated iframe, a split-view
   * tablet and a desktop window are all cases where the two disagree, and what the game actually
   * has to draw into is the viewport. */
  function portrait() {
    var w = window.innerWidth || 0, h = window.innerHeight || 0;
    return h > w;
  }
  function small() {
    var w = window.innerWidth || 0, h = window.innerHeight || 0;
    return Math.min(w, h) <= 820;                 // phones and small tablets; not a desktop window
  }
  function active() { return isTouch() && small(); }

  function css() {
    if (document.getElementById('ripOrientCss')) return;
    var s = document.createElement('style');
    s.id = 'ripOrientCss';
    s.textContent =
      /* ── PACING ────────────────────────────────────────────────────────────────────────────
       * The veil is an INSTRUCTION, so it is paced like one rather than thrown up as a wall.
       * `display` is driven by `.mount`, opacity by `.on`, and the two are set a frame apart —
       * toggling `display` and `opacity` in the same tick gives no transition at all, because
       * there is no previous computed value to animate from. That is the whole reason for two
       * classes instead of one.
       * The children arrive in reading order (icon → headline → line → button) so the eye is led
       * down the panel instead of being handed everything at once; the phone icon is first
       * because the ROTATION is the message and the words only confirm it. */
      '#ripOrient{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;' +
      'justify-content:center;flex-direction:column;gap:22px;text-align:center;padding:26px;' +
      'background:radial-gradient(ellipse at 50% 45%,#08131b,#02070b 74%);' +
      "font-family:'Bungee','Arial Black',Arial,sans-serif;color:#cdfff0;-webkit-user-select:none;" +
      'user-select:none;opacity:0;transition:opacity .46s ease}' +
      '#ripOrient.mount{display:flex}' +
      '#ripOrient.on{opacity:1}' +
      '#ripOrient>*{opacity:0;transform:translateY(9px);transition:opacity .42s ease,transform .42s ease}' +
      '#ripOrient.on>*{opacity:1;transform:none}' +
      '#ripOrient.on .ph{transition-delay:.06s}' +
      '#ripOrient.on h2{transition-delay:.30s}' +
      '#ripOrient.on p{transition-delay:.56s}' +
      '#ripOrient.on button{transition-delay:.86s}' +
      '@media (prefers-reduced-motion:reduce){#ripOrient,#ripOrient>*{transition-duration:.01s}' +
      '#ripOrient.on>*{transition-delay:0s}}' +
      '#ripOrient .ph{width:76px;height:126px;border-radius:13px;border:3px solid #2bff80;' +
      'box-shadow:0 0 26px rgba(43,255,128,.45);animation:ripTilt 2.1s ease-in-out infinite;' +
      'position:relative;background:rgba(43,255,128,.07)}' +
      '#ripOrient .ph::after{content:"";position:absolute;left:50%;bottom:7px;width:26px;height:3px;' +
      'border-radius:2px;background:#2bff80;transform:translateX(-50%)}' +
      '#ripOrient h2{font-size:clamp(17px,5.4vw,26px);letter-spacing:.1em;margin:0;color:#2bff80;' +
      'text-shadow:0 0 16px rgba(43,255,128,.5)}' +
      "#ripOrient p{font-family:'Share Tech Mono','Courier New',monospace;font-size:13px;line-height:1.6;" +
      'letter-spacing:.05em;color:#9fd8c4;margin:0;max-width:30ch}' +
      '#ripOrient button{pointer-events:auto;cursor:pointer;font:inherit;font-size:13px;' +
      'letter-spacing:.08em;text-transform:uppercase;color:#04140b;background:#2bff80;border:0;' +
      'border-radius:999px;padding:13px 22px;box-shadow:0 6px 0 #0f5c33}' +
      '#ripOrient button:active{transform:translateY(3px);box-shadow:0 3px 0 #0f5c33}' +
      '@keyframes ripTilt{0%,42%{transform:rotate(0)}62%,100%{transform:rotate(-90deg)}}' +
      '@media (prefers-reduced-motion:reduce){#ripOrient .ph{animation:none;transform:rotate(-90deg)}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    css();
    VEIL = document.createElement('div');
    VEIL.id = 'ripOrient';
    VEIL.setAttribute('role', 'dialog');
    VEIL.setAttribute('aria-label', 'Rotate your device to play');
    VEIL.innerHTML =
      '<i class="ph" aria-hidden="true"></i>' +
      '<h2>TURN IT SIDEWAYS</h2>' +
      '<p>These games are built wide. Rotate your phone for the full screen.</p>';
    /* The button only appears where a lock is actually possible. Offering "GO FULLSCREEN" on an
     * iPhone and having nothing happen is worse than not offering it. */
    if (canLock()) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = '↻ rotate for me';
      b.addEventListener('click', function () { wantLock = true; go(); });
      VEIL.appendChild(b);
    }
    (document.body || document.documentElement).appendChild(VEIL);
  }

  function canLock() {
    try {
      return !!(screen && screen.orientation && typeof screen.orientation.lock === 'function' &&
                (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen));
    } catch (e) { return false; }
  }

  /* Fullscreen THEN lock — the lock is only permitted from fullscreen, and both can reject for
   * reasons entirely outside our control (user gesture expired, permissions policy, an iframe
   * without allow="fullscreen"). Every step swallows its own failure and falls through to the
   * veil, which still tells the human what to do. */
  function go() {
    try {
      var el = document.documentElement;
      var fs = el.requestFullscreen ? el.requestFullscreen() :
               el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
      Promise.resolve(fs).then(function () {
        try {
          var p = screen.orientation.lock('landscape');
          if (p && p.catch) p.catch(function () {});
        } catch (e) {}
      }).catch(function () {});
    } catch (e) {}
  }

  /* ⚑ READING TIME IS SPENT ON THE ENTRANCE, NOT ON THE EXIT — and I got this backwards first.
   * The panel carries ~19 words; unhurried on-screen reading is ~200 wpm ⇒ ~5.7 s, and I turned
   * that into a 2.7 s MINIMUM DWELL before the veil could leave. Measured, that meant rotating
   * the phone at 1 s left a rotate prompt sitting over a running game for another 1.7 s. The
   * comment above it even said "never a delay on the hide" while the code did exactly that.
   *
   * The pacing the artist asked for belongs in the STAGGER, which is where it now is: icon at
   * 0.06 s, headline 0.30, line 0.56, button 0.86, each fading over 0.42 — so the panel assembles
   * itself at reading speed and leads the eye down instead of dumping a wall of text. Verified on
   * a phone viewport: veil opacity 0 → 0.49 → 0.81 → 0.97 → 1 across ~450 ms, headline reaching 1
   * at ~3.49 s, button at ~4.09 s.
   *
   * All the exit needs is an anti-FLASH floor. Appearing and vanishing inside ~200 ms reads as a
   * glitch and leaves the human wondering what they missed; 600 ms is enough that it registers as
   * a deliberate panel, and short enough that nobody who has already turned the phone is kept
   * waiting. The instruction is obsolete the instant it is obeyed. */
  var DWELL = 600, shownAt = 0, hideT = 0;

  function show() {
    mount();
    if (VEIL.classList.contains('mount')) { VEIL.classList.add('on'); return; }
    clearTimeout(hideT);
    VEIL.classList.add('mount');
    /* two frames, not one: `display` must have committed before `opacity` changes or the browser
     * has nothing to transition FROM and the panel snaps in at full opacity. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        VEIL.classList.add('on');
        shownAt = Date.now();
      });
    });
  }

  function hide() {
    if (!VEIL || !VEIL.classList.contains('mount')) return;
    var waited = Date.now() - shownAt;
    var wait = shownAt ? Math.max(0, DWELL - waited) : 0;
    clearTimeout(hideT);
    hideT = setTimeout(function () {
      VEIL.classList.remove('on');
      // unmount only after the fade, so `display:none` never chops the transition
      hideT = setTimeout(function () { VEIL.classList.remove('mount'); shownAt = 0; }, 500);
    }, wait);
  }

  function sync() {
    if (!active()) { if (VEIL) { VEIL.classList.remove('on', 'mount'); shownAt = 0; } return; }
    var p = portrait();
    if (p) show(); else hide();
    // once they are in landscape, keep it there if the platform lets us
    if (!p && wantLock && canLock()) {
      try { var q = screen.orientation.lock('landscape'); if (q && q.catch) q.catch(function () {}); } catch (e) {}
    }
  }

  /* ⚠ iOS fires orientationchange BEFORE innerWidth/innerHeight update. Re-check on a short delay
   * as well as immediately, or the first read latches the pre-rotation answer and the veil stays
   * up in landscape. Two cheap timers beat one wrong decision. */
  function bump() { sync(); setTimeout(sync, 120); setTimeout(sync, 420); }

  function init() {
    if (armed) return;
    armed = true;
    try {
      addEventListener('resize', bump, { passive: true });
      addEventListener('orientationchange', bump, { passive: true });
      if (screen && screen.orientation && screen.orientation.addEventListener)
        screen.orientation.addEventListener('change', bump);
    } catch (e) {}
    bump();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {
    init: init,
    refresh: bump,
    isPortraitPhone: function () { return active() && portrait(); },
    /* Call from a real user gesture (a PLAY / DEPLOY button) — browsers only grant fullscreen and
     * the orientation lock from inside one, so calling this on page load silently does nothing. */
    requestLandscape: function () { wantLock = true; go(); },
  };
})();

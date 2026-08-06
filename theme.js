/* ripmaster3030studios — site music. The set is **"GO-TEAM!" by BASIX**, streamed from
 * SoundCloud: https://soundcloud.com/basix265/sets/go-team
 *
 * ⛔ NOTHING IS DOWNLOADED OR RE-HOSTED. SoundCloud publishes no direct stream URL, so the
 * only legitimate way to play someone's set on another site is their own embedded player.
 * That is what this file drives: an off-screen widget iframe on w.soundcloud.com, controlled
 * through SoundCloud's official Widget API. The audio is served by SoundCloud, plays under
 * SoundCloud's terms, and the artist gets the play count. Copying the audio into this repo
 * would be faster, smaller and seamless across pages — and would be taking the record.
 *
 * ⚠ THE COST, STATED PLAINLY: this is NOT as continuous as the mp3 it replaces. The site is
 * many separate HTML pages, and a cross-origin iframe cannot survive a navigation — it is
 * torn down and rebuilt with the document. So the position is persisted (track index in
 * 'urm_sound_n', seconds into that track in 'urm_sound_t') and the next page seeks back to
 * it, which recovers the PLACE but not the continuity: there is an audible gap while the
 * widget reboots. There is no way around that short of re-hosting the audio, which is the
 * one thing that is not ours to do. A single-page shell would fix it and is a much larger
 * change than a music swap.
 *
 * ⚑ FAIL OPEN, AND HERE THAT MEANS THE BUTTON HAS TO BE ABLE TO DIE. Every other module in
 * this repo fails open by leaving the page as it found it; a music button cannot, because a
 * button that does nothing is worse than no button — the visitor presses it, gets silence,
 * and concludes the site is broken. So: the widget is not booted until the music is actually
 * wanted (no third-party weight for anyone who never turns it on), and if it does not report
 * itself ready inside BOOT_MS the button REMOVES ITSELF. Nothing else on the page moves.
 *
 * Autoplay: browsers refuse audio without a gesture, so a resume that is refused arms the very
 * next tap/keypress anywhere on the page. The widget API has no promise to reject — a blocked
 * play simply never fires PLAY — so the refusal is detected as a TIMEOUT, not as an error. */
(function () {
  'use strict';
  if (window.self !== window.top) return;   // embedded card iframes must not each start the set
  if (window.__urmTheme) return;

  var KEY  = 'urm_sound';     // 'on' | 'off'   — unchanged, so an existing preference carries over
  var TKEY = 'urm_sound_t';   // seconds into the current track
  var NKEY = 'urm_sound_n';   // index of the current track within the set

  /* The numeric playlist URL is what SoundCloud's own oEmbed returns for the set permalink.
   * Prefer it over the slug: a permalink can be renamed, the id cannot. */
  var SET    = 'https://api.soundcloud.com/playlists/2273003258';
  var CREDIT = 'GO-TEAM! — BASIX · soundcloud.com/basix265';
  var API    = 'https://w.soundcloud.com/player/api.js';
  var PLAYER = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(SET) +
    '&auto_play=false&visual=false&show_artwork=false&sharing=false&buying=false' +
    '&download=false&show_comments=false&hide_related=true';

  var BOOT_MS = 9000;   // api.js + widget READY. Past this the button is a lie and is removed.
  var GEST_MS = 1400;   // no PLAY event by now ⇒ the browser refused us; arm the next gesture.

  var btn = null, frame = null, widget = null;
  var ready = false, dead = false, booting = false, playing = false;
  var count = 0, seekTo = 0, lastSave = 0, title = '';

  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var wantOn    = function () { return get(KEY) === 'on'; };
  var savedTime = function () { return parseFloat(get(TKEY)) || 0; };
  var savedIdx  = function () { return parseInt(get(NKEY), 10) || 0; };
  var flush     = function () { set(TKEY, String(pos)); set(NKEY, String(idx)); };

  /* ⚠ SEEDED FROM STORAGE, NOT FROM ZERO. These are only advanced by PLAY_PROGRESS, and `flush()`
   * runs on every pagehide whether anything played or not — so starting them at 0 meant that
   * merely OPENING a page and leaving it wrote 0/0 over the saved place. Every quick click through
   * the card browser would have sent the set back to the top of track one, which reads as "the
   * resume is broken" and is actually the exit handler helpfully saving nothing at all. */
  var pos = savedTime(), idx = savedIdx();

  // ── the control ───────────────────────────────────────────────────────────────────────
  /* ⛔ IN A CABINET IT IS NOT A FLOATING PILL, AND THAT IS A MEASUREMENT, NOT A PREFERENCE.
   * Driven at 844×390, the bottom-right pill sat ON TOP OF DOGFIGHT's FIRE pad and THE CITY's
   * flap and mode buttons — it won the hit test, so the controls under it were dead. That is
   * `banner.js`'s recorded failure exactly: a document widget at the highest z-index, loaded by
   * a game, covering the one control the player uses continuously.
   * ⚑ Every cabinet already HAS a home for an audio control — the `.toggles` row, which is where
   * each game's own `♪ music` button lived until this commit, and which `js/game-toggles.js`
   * collapses behind a cog. Appending a `.tg` there inherits the game's own styling AND the
   * collapse for free (the collapsed state is a CSS rule keyed on the row, so a button added
   * later is hidden by it too). One control, two homes, chosen by what the page is. */
  var inRow = false, bar = null, prevBtn = null, nextBtn = null;

  function render() {
    if (!btn) return;
    if (inRow) {
      btn.textContent = '♪ music';
      btn.classList.toggle('off', !playing);   // the cabinets' own convention for a control that is off
    } else {
      btn.textContent = playing ? (title ? '♪ ' + title : '♪ sound: on')
                      : booting ? '♪ …'
                      : '♪ sound: off';
    }
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    btn.title = CREDIT;
    btn.setAttribute('aria-label', (playing ? 'pause' : 'play') + ' site music — ' + CREDIT);
  }

  /* ── the transport ──────────────────────────────────────────────────────────────────────
   * Artist: *"have the ability to skip tracks or go back through tracks along with pause/play."*
   * ⚑ A SET IS NOT A SONG, and that is the whole argument for these two buttons: the mp3 this
   * replaced was ONE loop, where a skip would have meant nothing. This is somebody's album, so
   * "not this one" is a thing a listener now wants to say, and without it their only option is
   * to turn the music off — which is the same silence with worse feelings about it.
   * ⚠ Skipping while PAUSED has to start playing. `widget.next()` on a paused player moves the
   * needle and leaves it parked, so the press would look broken; and a skip is an explicit
   * request for the next track, not for a silent seek. */
  function step(dir) {
    if (dead) return;
    if (!ready) return boot(function () { step(dir); });
    seekTo = 0;                       // a deliberate skip must not be dragged back to the old position
    try { dir > 0 ? widget.next() : widget.prev(); } catch (e) { return; }
    if (!playing) { try { widget.play(); } catch (e) {} }
    setTimeout(function () { if (!playing && !dead) armGesture(); }, GEST_MS);
  }

  /* The one place the button goes away. Called when the widget cannot be brought up, so the
   * page is left exactly as it would have been had this file never loaded. */
  function bury(why) {
    dead = true; booting = false; playing = false;
    set(KEY, 'off');
    /* ⚠ EVERY control goes, not just the play button. The transport was added after this
     * function was written, and burying one of three would leave a skip button that skips
     * nothing — which is precisely the failure this whole path exists to prevent. */
    [prevBtn, btn, nextBtn, bar].forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    btn = prevBtn = nextBtn = bar = null;
    if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    frame = null; widget = null; ready = false;
    if (window.console && console.info) console.info('[theme] site music unavailable (' + why + ')');
  }

  // ── the widget ────────────────────────────────────────────────────────────────────────
  function loadApi(done) {
    if (window.SC && window.SC.Widget) return done(true);
    if (!document.querySelector('script[data-sc-api]')) {
      var s = document.createElement('script');
      s.src = API; s.async = true; s.setAttribute('data-sc-api', '1');
      (document.head || document.documentElement).appendChild(s);
    }
    /* Poll rather than listen for 'load': the tag may already have loaded on a previous call,
     * in which case its load event has been and gone and a listener would wait forever. */
    var t0 = Date.now();
    (function wait() {
      if (window.SC && window.SC.Widget) return done(true);
      if (Date.now() - t0 > BOOT_MS) return done(false);
      setTimeout(wait, 120);
    })();
  }

  function boot(then) {
    if (dead) return;
    if (ready) return then && then();
    if (booting) return;
    booting = true; render();

    loadApi(function (ok) {
      if (dead) return;
      if (!ok) return bury('widget api did not load');

      frame = document.createElement('iframe');
      frame.src = PLAYER;
      frame.allow = 'autoplay; encrypted-media';
      frame.title = 'site music — ' + CREDIT;
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('tabindex', '-1');
      frame.setAttribute('frameborder', 'no');
      frame.setAttribute('scrolling', 'no');
      /* Off-screen at 1×1 rather than display:none — a player in a box with no layout is not
       * reliably kept alive, and this one has to keep running while you read the page. */
      frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;' +
        'opacity:0;pointer-events:none;border:0';
      document.body.appendChild(frame);

      var settled = false;
      var giveUp = setTimeout(function () { if (!settled) bury('widget never reported ready'); }, BOOT_MS);

      try { widget = window.SC.Widget(frame); }
      catch (e) { clearTimeout(giveUp); return bury('widget could not be created'); }

      var E = window.SC.Widget.Events;
      widget.bind(E.READY, function () {
        if (dead) return;
        settled = true; clearTimeout(giveUp);
        ready = true; booting = false;
        try { widget.setVolume(70); } catch (e) {}
        try { widget.getSounds(function (list) { count = (list && list.length) || 0; }); } catch (e) {}
        render();
        if (then) then();
      });

      widget.bind(E.PLAY, function () {
        playing = true; booting = false; set(KEY, 'on');
        if (seekTo > 0) { var s = seekTo; seekTo = 0; try { widget.seekTo(s * 1000); } catch (e) {} }
        try {
          widget.getCurrentSoundIndex(function (i) { idx = i || 0; });
          widget.getCurrentSound(function (snd) { title = (snd && snd.title) || ''; render(); });
        } catch (e) {}
        render();
      });

      widget.bind(E.PAUSE, function () { playing = false; flush(); render(); });

      widget.bind(E.PLAY_PROGRESS, function (d) {
        pos = (d && d.currentPosition ? d.currentPosition : 0) / 1000;
        if (Math.abs(pos - lastSave) > 1.5) { lastSave = pos; flush(); }
      });

      /* Loop the set. The widget advances between tracks on its own; only the END of the last
       * one needs help, or the music simply stops and looks like a bug. */
      widget.bind(E.FINISH, function () {
        pos = 0;
        try {
          widget.getCurrentSoundIndex(function (i) {
            idx = i || 0;
            if (count && idx >= count - 1) { idx = 0; flush(); try { widget.skip(0); } catch (e) {} }
            else flush();
          });
        } catch (e) {}
      });
    });
  }

  // ── play / pause ──────────────────────────────────────────────────────────────────────
  function start() {
    if (dead) return;
    if (!ready) return boot(start);
    seekTo = savedTime();
    var n = savedIdx();
    try {
      if (n > 0 && (!count || n < count)) widget.skip(n);   // skip() begins playback of that track
      else widget.play();
    } catch (e) { return bury('widget refused a play command'); }
    /* No promise to reject here, so a blocked play is a SILENCE, not an error: if PLAY has not
     * fired by now the browser turned us down and the next gesture is our way back in. */
    setTimeout(function () { if (!playing && !dead) armGesture(); }, GEST_MS);
  }

  function stop() {
    if (!ready || dead) return;
    try { widget.pause(); } catch (e) {}
    playing = false; set(KEY, 'off'); flush(); render();
  }

  var armed = false;
  function armGesture() {
    if (armed || dead) return; armed = true;
    var evs = ['pointerdown', 'keydown', 'touchstart'];
    var off = function () { armed = false; evs.forEach(function (e) { removeEventListener(e, kick, true); }); };
    var kick = function () { if (playing || dead) return off(); start(); if (playing) off(); };
    evs.forEach(function (e) { addEventListener(e, kick, true); });
  }

  // ── mount ─────────────────────────────────────────────────────────────────────────────
  function mkBtn(id, label, onPress) {
    var b = document.createElement('button');
    b.id = id; b.type = 'button'; b.textContent = label;
    b.onclick = onPress;
    /* A cabinet canvas swallows pointer events for aim or a fly stick, and every one of these
     * sits above it, so a press must not also reach the game underneath. Same reason as the cog's. */
    ['pointerdown', 'pointerup', 'touchstart'].forEach(function (k) {
      b.addEventListener(k, function (e) { e.stopPropagation(); }, { passive: true });
    });
    return b;
  }

  function mount() {
    var toggle = function () { if (playing) stop(); else start(); };
    prevBtn = mkBtn('soundPrev', '◀◀', function () { step(-1); });
    btn     = mkBtn('soundToggle', '', toggle);
    nextBtn = mkBtn('soundNext', '▶▶', function () { step(1); });
    prevBtn.setAttribute('aria-label', 'previous track');
    nextBtn.setAttribute('aria-label', 'next track');
    prevBtn.title = 'previous track';
    nextBtn.title = 'next track';

    var row = document.querySelector('.toggles');
    if (row) {
      inRow = true;
      // the game's own button style — three controls that look like they belong to the cabinet
      prevBtn.className = btn.className = nextBtn.className = 'tg';
      render();
      row.appendChild(prevBtn); row.appendChild(btn); row.appendChild(nextBtn);
      if (wantOn()) start();
      return;
    }

    /* ⚑ ONE FIXED BAR, NOT THREE FIXED BUTTONS. Three separately-positioned fixed elements is
     * three numbers to keep in step, and this repo has already paid for that twice (index's
     * "three fixed bottom layers at the same altitude", city's caps drifting until one reached
     * zero). The bar owns the position; the buttons just sit in it.
     * ⚠ `--rip-fab-bottom` (mobile.css) lifts it clear of the fixed freshness strip; the 42px
     * fallback is the historical position for pages without that sheet. The width cap matters
     * more than it used to — the label carries a TRACK TITLE, somebody else's string of any
     * length, and an uncapped fixed bar would run off a phone. */
    bar = document.createElement('div');
    bar.id = 'soundBar';
    bar.style.cssText = 'position:fixed;right:12px;bottom:var(--rip-fab-bottom,42px);z-index:60;' +
      'display:inline-flex;align-items:center;gap:6px;max-width:min(80vw,380px)';
    var skin = "font-family:'Courier New',monospace;font-size:13px;letter-spacing:.1em;" +
      'text-transform:uppercase;display:inline-flex;align-items:center;justify-content:center;' +
      'min-height:44px;border-radius:99px;border:1px solid #0f5c33;color:#2bff80;' +
      'background:rgba(2,16,9,.9);box-shadow:0 0 14px rgba(43,255,128,.3);cursor:pointer;';
    // 44px minimum on the skips too — the mobile pass took taps under 44px to zero and a new
    // control under the floor walks that back.
    prevBtn.style.cssText = skin + 'min-width:44px;padding:0 8px;flex:0 0 auto';
    nextBtn.style.cssText = skin + 'min-width:44px;padding:0 8px;flex:0 0 auto';
    btn.style.cssText = skin + 'padding:0 14px;flex:0 1 auto;overflow:hidden;' +
      'white-space:nowrap;text-overflow:ellipsis;display:inline-block;line-height:44px';
    render();
    bar.appendChild(prevBtn); bar.appendChild(btn); bar.appendChild(nextBtn);
    document.body.appendChild(bar);

    // if the set was playing when we left the last page, pick it back up here
    if (wantOn()) start();
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount);
  else mount();

  // flush position on the way out so the next page resumes in the right place
  addEventListener('pagehide', flush);
  addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });

  /* Driven checks reach the module here — including the two paths that matter and cannot be
   * reached over the network from a test container: a widget that becomes ready, and one that
   * never does. Stub window.SC before this file loads to drive either. */
  window.__urmTheme = {
    get ready()   { return ready; },
    get dead()    { return dead; },
    get playing() { return playing; },
    get button()  { return btn; },
    get frame()   { return frame; },
    set: SET, credit: CREDIT, api: API, player: PLAYER, bootMs: BOOT_MS,
    start: start, stop: stop, boot: boot, step: step
  };
})();

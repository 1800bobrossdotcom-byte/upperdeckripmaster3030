/* Upperdeck Ripmaster 3030 — site song + persistent audio toggle.
 *
 * Plays smilingman.mp3 (looping) behind a ♪ toggle. Because the site is many
 * separate HTML pages, the song is made to feel CONTINUOUS across navigation:
 * the play state ('urm_sound') and the current playback position
 * ('urm_sound_t') are written to localStorage as it plays, and every page that
 * loads with the state 'on' resumes from where the last page left off. Browsers
 * block autoplay without a gesture, so if a resume is refused we arm the very
 * next tap/keypress anywhere on the page to pick the song back up — so once you
 * turn it on, it keeps going as you move room to room.
 *
 * "Cloud audio": point SRC at any hosted URL (CDN / storage bucket) and the same
 * persistence logic streams it; the file living next to this script is just the
 * default. */
(() => {
  const KEY = 'urm_sound';       // 'on' | 'off'
  const TKEY = 'urm_sound_t';    // last known playback position (seconds)
  const SRC = new URL('smilingman.mp3', document.currentScript.src).href;

  let audio, lastSave = 0;
  const wantOn = () => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } };
  const savedTime = () => { try { return parseFloat(localStorage.getItem(TKEY)) || 0; } catch { return 0; } };
  const saveTime = () => { if (!audio) return; try { localStorage.setItem(TKEY, String(audio.currentTime || 0)); } catch {} };

  const ensure = () => {
    if (audio) return audio;
    audio = new Audio(SRC);
    audio.loop = true; audio.preload = 'auto'; audio.volume = 0.7;
    // resume position once the file knows how long it is
    audio.addEventListener('loadedmetadata', () => {
      const t = savedTime();
      if (t > 0 && t < (audio.duration || Infinity)) { try { audio.currentTime = t; } catch {} }
    });
    // keep the saved position fresh (throttled) so the next page picks up here
    audio.addEventListener('timeupdate', () => {
      const now = audio.currentTime;
      if (Math.abs(now - lastSave) > 1.5) { lastSave = now; saveTime(); }
    });
    audio.addEventListener('play', render);
    audio.addEventListener('pause', () => { saveTime(); render(); });
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'smilingman', artist: 'lovebeing & sean',
          album: 'Upperdeck Ripmaster 3030'
        });
      } catch {}
    }
    return audio;
  };

  let btn;
  const render = () => {
    if (!btn) return;
    const on = audio && !audio.paused;
    btn.textContent = on ? '♪ sound: on' : '♪ sound: off';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  };

  // try to (re)start playback; if the browser refuses, arm the next gesture
  let armed = false;
  const tryResume = async () => {
    const a = ensure();
    try { await a.play(); localStorage.setItem(KEY, 'on'); render(); }
    catch { armGesture(); }
  };
  const armGesture = () => {
    if (armed) return; armed = true;
    const kick = async () => {
      const a = ensure();
      try { await a.play(); localStorage.setItem(KEY, 'on'); render(); off(); } catch {}
    };
    const off = () => { armed = false; ['pointerdown','keydown','touchstart'].forEach(e => removeEventListener(e, kick, true)); };
    ['pointerdown','keydown','touchstart'].forEach(e => addEventListener(e, kick, true));
  };

  addEventListener('DOMContentLoaded', () => {
    btn = document.createElement('button');
    btn.id = 'soundToggle';
    btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:60;font-family:' +
      "'Courier New',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;" +
      'padding:10px 14px;border-radius:99px;border:1px solid #0f5c33;color:#2bff80;' +
      'background:rgba(2,16,9,.9);box-shadow:0 0 14px rgba(43,255,128,.3);cursor:pointer';
    render();
    btn.onclick = async () => {
      const a = ensure();
      if (a.paused) { try { await a.play(); localStorage.setItem(KEY, 'on'); } catch {} }
      else { a.pause(); localStorage.setItem(KEY, 'off'); saveTime(); }
      render();
    };
    document.body.appendChild(btn);

    // if the song was playing when we left the last page, keep it going here
    if (wantOn()) tryResume();
  });

  // flush position on the way out so the next page resumes seamlessly
  addEventListener('pagehide', saveTime);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveTime(); });
})();

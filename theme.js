/* Upperdeck Ripmaster 3030 — site song + audio toggle.
 * Plays smilingman.mp3 (looping) behind a ♪ toggle button. Browsers block autoplay,
 * so it only starts on the first tap. Mute state is remembered per device. The audio
 * file sits next to this script at the site root, so the path resolves correctly from
 * both the homepage and the /cards/ pages. */
(() => {
  const KEY = 'urm_sound';
  const SRC = new URL('smilingman.mp3', document.currentScript.src).href;
  let audio;
  const ensure = () => {
    if (audio) return audio;
    audio = new Audio(SRC);
    audio.loop = true; audio.preload = 'none'; audio.volume = 0.7;
    return audio;
  };
  addEventListener('DOMContentLoaded', () => {
    const btn = document.createElement('button');
    btn.id = 'soundToggle';
    btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:60;font-family:' +
      "'Courier New',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;" +
      'padding:10px 14px;border-radius:99px;border:1px solid #0f5c33;color:#2bff80;' +
      'background:rgba(2,16,9,.9);box-shadow:0 0 14px rgba(43,255,128,.3);cursor:pointer';
    const render = () => {
      const on = audio && !audio.paused;
      btn.textContent = on ? '♪ sound: on' : '♪ sound: off';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    render();
    btn.onclick = async () => {
      const a = ensure();
      if (a.paused) { try { await a.play(); localStorage.setItem(KEY, 'on'); } catch {} }
      else { a.pause(); localStorage.setItem(KEY, 'off'); }
      render();
    };
    document.body.appendChild(btn);
  });
})();

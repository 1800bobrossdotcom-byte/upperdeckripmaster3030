/* Upperdeck Ripmaster 3030 — site "song" + audio toggle.
 * An ORIGINAL uptempo slapstick chase-romp synthesized live with the Web Audio API
 * (oom-pah bass + squeaky staccato lead + the odd slide-whistle swoop). It is not a
 * recording and not a transcription of any existing tune — just the manic, breathless
 * energy of a Benny-Hill-style chase, composed from scratch in code. No audio files,
 * nothing to download, works offline. Browsers block autoplay, so it only starts when
 * the visitor taps the ♪ button. Mute state is remembered per device.
 */
(() => {
  const KEY = 'urm_sound';
  let ctx, master, timer, playing = false, step = 0;

  // --- an original bouncy loop (my own notes), semitone offsets from C ---
  // lead: a cheeky up-and-over run; bass: oom-pah roots/fifths. 16 eighth-notes.
  const N = f => 261.63 * Math.pow(2, f / 12);
  const LEAD = [12,16,19,16, 21,19,16,12, 14,17,14,11, 12,19,12,-100]; // -100 = rest
  const BASS = [0,7,0,7, -3,4,-3,4, -5,2,-5,2, 0,7,0,7];
  const TEMPO = 168, EIGHTH = 60 / TEMPO / 2;

  function beep(freq, t, dur, type, gain, glideTo) {
    if (freq <= 0) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  function schedule() {
    const now = ctx.currentTime;
    for (let i = 0; i < 4; i++) {          // schedule 4 eighths ahead each tick
      const s = (step + i) % 16;
      const t = now + i * EIGHTH;
      beep(N(BASS[s]) / 2, t, EIGHTH * 0.9, 'triangle', 0.16);        // oom-pah bass
      if (LEAD[s] > -50) beep(N(LEAD[s]), t, EIGHTH * 0.7, 'square', 0.09);  // squeaky lead
      if (s === 15) beep(N(24), t, EIGHTH * 1.6, 'sawtooth', 0.06, N(6));    // slide-whistle swoop
    }
    step = (step + 4) % 16;
  }

  function start() {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    step = 0; schedule();
    timer = setInterval(schedule, EIGHTH * 4 * 1000);
    playing = true;
  }
  function stop() { clearInterval(timer); if (master) master.disconnect(); playing = false; }

  function render(btn) { btn.textContent = playing ? '♪ sound: on' : '♪ sound: off';
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false'); }

  addEventListener('DOMContentLoaded', () => {
    const btn = document.createElement('button');
    btn.id = 'soundToggle';
    btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:50;font-family:' +
      "'Courier New',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;" +
      'padding:10px 12px;border-radius:99px;border:1px solid #05f2ff;color:#05f2ff;' +
      'background:rgba(6,2,20,.85);box-shadow:0 0 14px rgba(5,242,255,.4);cursor:pointer;backdrop-filter:blur(3px)';
    render(btn);
    btn.onclick = () => {
      if (playing) { stop(); localStorage.setItem(KEY, 'off'); }
      else { start(); localStorage.setItem(KEY, 'on'); }
      render(btn);
    };
    document.body.appendChild(btn);
  });
})();

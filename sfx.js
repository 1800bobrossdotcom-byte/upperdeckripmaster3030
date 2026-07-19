/* sfx.js — site-wide FUNNY sound effects, 100% synthesized (Web Audio, zero assets).
 * Cartoon boings, coins, sad-trombone womps, sizzle-burns, kazoo blaats. Separate
 * AudioContext from the music (theme.js / urm_sound), its own mute (urm_sfx), and a
 * floating 🔊 toggle. No-ops inside iframes so embedded cards don't double up.
 * Auto-binds to clicks/hovers by selector; override on any element with data-sfx="name". */
(function () {
  if (window.self !== window.top) return;          // don't run inside embedded card iframes
  if (window.__urmSFX) return; window.__urmSFX = true;

  const KEY = 'urm_sfx';                            // 'off' = muted
  let muted = localStorage.getItem(KEY) === 'off';
  let ac = null;
  function ctx() {
    if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; try { ac = new AC(); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  const T = () => ac.currentTime;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ── primitives ──
  function tone(freq, dur, type, vol, t0, glideTo, glideDur) {
    const c = ctx(); if (!c) return; t0 = t0 ?? T();
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + (glideDur || dur));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, filter, f0, f1, t0) {
    const c = ctx(); if (!c) return; t0 = t0 ?? T();
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const bq = c.createBiquadFilter(); bq.type = filter || 'lowpass';
    bq.frequency.setValueAtTime(f0, t0); if (f1) bq.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bq).connect(g).connect(c.destination); src.start(t0); src.stop(t0 + dur + 0.02);
  }
  const seq = (notes, dur, type, vol, step) => notes.forEach((f, i) => tone(f, dur, type, vol, T() + i * step));

  // ── the funny library ──
  const LIB = {
    blip:  () => tone(rnd(600, 720), 0.06, 'square', 0.16),
    click: () => { const t = T(); tone(rnd(300, 360), 0.11, 'sine', 0.26, t, 120); },   // bonk
    pop:   () => tone(rnd(420, 520), 0.05, 'sine', 0.24, T(), 1100, 0.05),
    boing: () => { const t = T(); tone(200, 0.28, 'sine', 0.28, t, 620, 0.09); tone(620, 0.2, 'sine', 0.16, t + 0.09, 260, 0.11); },
    coin:  () => { const t = T(); tone(988, 0.07, 'square', 0.18, t); tone(1319, 0.16, 'square', 0.18, t + 0.07); },
    up:    () => seq([523, 659, 784, 1047], 0.09, 'square', 0.15, 0.06),               // collect / vote up
    sparkle: () => seq([1319, 1568, 2093, 2637, 3136], 0.1, 'triangle', 0.1, 0.04),    // rare reveal
    down:  () => seq([784, 659, 523, 392], 0.1, 'sawtooth', 0.15, 0.07),
    womp:  () => {                                                                      // sad trombone
      const s = [311, 293, 277, 233]; s.forEach((f, i) => tone(f, 0.26, 'sawtooth', 0.2, T() + i * 0.2, f * 0.93, 0.26));
    },
    rip:   () => { noise(0.32, 0.35, 'bandpass', 500, 3500); const t = T(); tone(180, 0.3, 'sawtooth', 0.14, t, 520, 0.28); },
    burn:  () => { noise(0.6, 0.32, 'lowpass', 3600, 180); seq([392, 330, 262], 0.18, 'sawtooth', 0.1, 0.12); },
    whoosh: () => noise(0.26, 0.24, 'bandpass', 260, 3200),
    zap:   () => { const t = T(); tone(1400, 0.12, 'sawtooth', 0.18, t, 130, 0.12); },
    ding:  () => { tone(1568, 0.5, 'sine', 0.2); tone(2093, 0.4, 'sine', 0.08); },
    fart:  () => { const t = T(); tone(rnd(120, 150), 0.3, 'sawtooth', 0.3, t, 70, 0.3); },   // the funny one
    scratch: () => { const t = T(); for (let i = 0; i < 6; i++) tone(rnd(180, 900), 0.05, 'sawtooth', 0.14, t + i * 0.045); },
  };

  function play(name) {
    if (muted) return;
    const f = LIB[name] || LIB.blip;
    try { f(); } catch (e) {}
  }
  window.SFX = { play, isMuted: () => muted, toggle: setMute };

  // ── which sound for a clicked element ──
  function soundFor(el) {
    if (el.dataset && el.dataset.sfx) return el.dataset.sfx;
    const id = el.id || '', cls = el.className && el.className.baseVal !== undefined ? el.className.baseVal : (el.className || '');
    const has = s => (' ' + cls + ' ').indexOf(s) >= 0;
    if (id === 'packOpen' || has('rip')) return 'rip';
    if (/v-?up|\bup\b|voteUp/i.test(id) || has('up')) return 'up';
    if (/v-?dn|down|voteDn/i.test(id) || has('dn') || has('down')) return 'womp';
    if (has('hodl') || id === 'v-hodl') return 'ding';
    if (has('wp-link') || has('coin') || has('topnav') || has('built')) return 'coin';
    if (has('zoom-back') || has('back') || has('pgnav') || has('tab')) return 'whoosh';
    if (has('fcard') || has('pk') || has('tile') || has('flip')) return 'pop';
    if (has('btn') || has('mode') || el.tagName === 'BUTTON') return 'click';
    if (el.tagName === 'A') return 'coin';
    return 'blip';
  }

  // delegated clicks (additive — never preventDefault)
  document.addEventListener('click', e => {
    const el = e.target.closest('a,button,[role="button"],.btn,.tab,.fcard,.pk,.tile,.mode,.pv-card,[data-sfx]');
    if (el) play(soundFor(el));
  }, true);

  // subtle throttled hover ticks on the big interactive things (desktop pointers only)
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let last = 0;
    document.addEventListener('pointerover', e => {
      const el = e.target.closest('.btn,.tile,.fcard,.tab,.pk,.wp-link,.topnav a,.ad');
      if (!el) return; const t = performance.now(); if (t - last < 70) return; last = t;
      if (!muted) tone(rnd(1500, 1900), 0.02, 'square', 0.04);
    }, true);
  }

  // ── mute toggle button ──
  function setMute(m) {
    muted = (m === undefined) ? !muted : !!m;
    try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch (e) {}
    if (btn) { btn.textContent = muted ? '🔇' : '🔊'; btn.setAttribute('aria-pressed', String(!muted)); btn.title = muted ? 'SFX off — click for funny noises' : 'SFX on'; }
    if (!muted) play('pop');
  }
  let btn;
  function mountBtn() {
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'sfxToggle';
    btn.textContent = muted ? '🔇' : '🔊';
    btn.title = muted ? 'SFX off — click for funny noises' : 'SFX on';
    btn.setAttribute('aria-label', 'toggle sound effects');
    btn.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:130;width:40px;height:40px;border-radius:50%;' +
      'border:1px solid #0f5c33;background:rgba(1,10,5,.82);color:#2bff80;font-size:17px;cursor:pointer;' +
      'backdrop-filter:blur(4px);box-shadow:0 0 14px rgba(43,255,128,.25);line-height:1;padding:0';
    btn.onclick = () => setMute();
    (document.body || document.documentElement).appendChild(btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBtn);
  else mountBtn();
})();

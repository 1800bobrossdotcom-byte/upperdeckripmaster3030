/* upperdeckripmaster3030 — GameHelp: a visual "how to play" card (window.GameHelp).
 *
 * Shown before a PRACTICE run so players learn the controls before they step in.
 * Each control renders an ANIMATED gesture glyph (a finger-dot that drags / holds /
 * double-taps / sticks) plus the touch instruction and the keyboard key, so the same
 * card teaches both phone and desktop. Big tap targets, self-injects CSS.
 *
 *   GameHelp.show({
 *     title, kicker,
 *     controls: [ { type:'drag'|'hold'|'dtap'|'tap'|'stick'|'aim', act, touch, key } ],
 *     startLabel, onStart
 *   })
 *   GameHelp.isTouch   // true on finger devices
 */
window.GameHelp = (function () {
  const isTouch = matchMedia('(hover:none)').matches || ('ontouchstart' in window);
  let styled = false;
  function css() {
    if (styled) return; styled = true;
    const s = document.createElement('style'); s.id = 'game-help-css';
    s.textContent = [
      '.gh-ov{position:fixed;inset:0;z-index:400;display:grid;place-items:center;padding:18px;overflow-y:auto;',
        'background:radial-gradient(120% 100% at 50% -10%,rgba(20,24,74,.86),rgba(5,6,26,.94));backdrop-filter:blur(6px);',
        "font-family:'Courier New',ui-monospace,monospace;color:#dff2ff;animation:ghIn .2s ease;}",
      '@keyframes ghIn{from{opacity:0}}',
      '.gh-card{width:min(440px,94vw);border:1px solid rgba(61,240,255,.4);border-radius:18px;padding:22px 20px 18px;',
        'background:rgba(6,10,32,.92);box-shadow:0 30px 90px -20px #000,inset 0 0 40px rgba(61,240,255,.06);text-align:center;}',
      '.gh-kick{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#3df0ff;}',
      ".gh-title{font-family:'Arial Black',Arial,sans-serif;font-size:30px;line-height:1;margin:4px 0 2px;",
        'background:linear-gradient(180deg,#fff,#8bd8ff 55%,#3df0ff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}',
      '.gh-h{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9fc;margin:12px 0 6px;}',
      '.gh-row{display:flex;align-items:center;gap:14px;padding:9px 6px;border-bottom:1px dashed rgba(61,240,255,.16);text-align:left;}',
      '.gh-g{flex:none;width:54px;height:54px;border-radius:13px;position:relative;overflow:hidden;',
        'background:rgba(61,240,255,.08);border:1px solid rgba(61,240,255,.3);}',
      '.gh-dot{position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px;border-radius:50%;',
        'background:radial-gradient(circle at 40% 35%,#fff,#3df0ff);box-shadow:0 0 10px rgba(61,240,255,.8);}',
      '.gh-ring{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px;border-radius:50%;border:2px solid rgba(61,240,255,.5);opacity:0;}',
      '.g-drag .gh-dot{animation:ghDrag 1.6s ease-in-out infinite;}',
      '@keyframes ghDrag{0%,100%{transform:translateX(-13px)}50%{transform:translateX(13px)}}',
      '.g-hold .gh-dot{animation:ghHold 1.4s ease-in-out infinite;} .g-hold .gh-ring{animation:ghHoldR 1.4s ease-out infinite;}',
      '@keyframes ghHold{0%,100%{transform:scale(.8)}55%{transform:scale(1.15)}}',
      '@keyframes ghHoldR{0%{transform:scale(.5);opacity:.8}80%{transform:scale(1.5);opacity:0}100%{opacity:0}}',
      '.g-dtap .gh-dot{animation:ghDtap 1.4s ease-in-out infinite;}',
      '@keyframes ghDtap{0%,40%,100%{transform:scale(1);opacity:.35}10%,30%{transform:scale(1.3);opacity:1}20%{transform:scale(1);opacity:.4}}',
      '.g-tap .gh-dot{animation:ghTap 1.3s ease-in-out infinite;}',
      '@keyframes ghTap{0%,100%{transform:scale(.9);opacity:.4}12%{transform:scale(1.3);opacity:1}30%{opacity:.4}}',
      '.g-stick .gh-dot{animation:ghStick 1.8s linear infinite;}',
      '@keyframes ghStick{0%{transform:translate(11px,0)}25%{transform:translate(0,11px)}50%{transform:translate(-11px,0)}75%{transform:translate(0,-11px)}100%{transform:translate(11px,0)}}',
      '.g-aim .gh-dot{width:22px;height:22px;margin:-11px;background:none;border:2px solid #3df0ff;box-shadow:none;animation:ghAim 1.6s ease-in-out infinite;}',
      '.g-aim .gh-dot::after{content:"";position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%;background:#ff5a6a;}',
      '@keyframes ghAim{0%,100%{transform:translate(-10px,4px)}50%{transform:translate(10px,-4px)}}',
      '.gh-act{font-family:"Arial Black",Arial,sans-serif;font-size:15px;color:#fff;}',
      '.gh-hint{font-size:11px;color:#9fbfd6;margin-top:2px;}',
      '.gh-hint b{color:#3df0ff;}',
      '.gh-key{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:5px;border:1px solid rgba(255,255,255,.2);font-size:10px;color:#cfe;}',
      '.gh-start{display:block;width:100%;margin-top:16px;cursor:pointer;font-family:"Arial Black",Arial,sans-serif;font-size:15px;',
        'text-transform:uppercase;letter-spacing:.06em;padding:15px;border-radius:12px;border:2px solid #061;color:#04140b;',
        'background:linear-gradient(180deg,#8bffbb,#2bff80 55%,#0fae56);box-shadow:0 4px 0 #061;}',
      '.gh-start:active{transform:translateY(2px);box-shadow:none;}',
      '.gh-skip{margin-top:10px;font-size:10.5px;color:#7f9;cursor:pointer;}',
      '.gh-skip:hover{color:#2bff80;}',
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function show(cfg) {
    css();
    const old = document.getElementById('gh-ov'); if (old) old.remove();
    const ov = document.createElement('div'); ov.className = 'gh-ov'; ov.id = 'gh-ov';
    const rows = (cfg.controls || []).map(c => {
      const primary = isTouch ? (c.touch || '') : (c.key || '');
      const secondary = isTouch ? (c.key ? `<span class="gh-key">${c.key}</span>` : '') : (c.touch ? `<span class="gh-key">${c.touch}</span>` : '');
      return `<div class="gh-row"><div class="gh-g g-${c.type}"><span class="gh-ring"></span><span class="gh-dot"></span></div>` +
        `<div><div class="gh-act">${c.act}</div><div class="gh-hint"><b>${primary}</b> ${secondary}</div></div></div>`;
    }).join('');
    ov.innerHTML =
      `<div class="gh-card">` +
        `<div class="gh-kick">${cfg.kicker || 'how to play'}</div>` +
        `<div class="gh-title">${cfg.title || ''}</div>` +
        `<div class="gh-h">${isTouch ? '◈ touch controls ◈' : '◈ controls ◈'}</div>` +
        rows +
        `<button class="gh-start" id="gh-start">${cfg.startLabel || '▶ Start practice'}</button>` +
        `<div class="gh-skip" id="gh-skip">skip &amp; jump straight in →</div>` +
      `</div>`;
    document.body.appendChild(ov);
    const go = () => { ov.remove(); if (typeof cfg.onStart === 'function') cfg.onStart(); };
    ov.querySelector('#gh-start').onclick = go;
    ov.querySelector('#gh-skip').onclick = go;
  }

  return { show, isTouch };
})();

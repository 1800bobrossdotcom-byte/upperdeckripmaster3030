/* upperdeckripmaster3030 — the Arena Lobby (window.ArenaLobby).
 *
 * One compelling presence roster shared by every battle game (battle, dogfight,
 * section 9). Renders the live RipNet roster as animated ripper cards — avatar
 * orb, pulsing status light, handle + verified seal, $UR3030 purse, card count,
 * win/loss — with a live header (online / seeking) and per-row actions.
 *
 *   const lobby = ArenaLobby.mount(container, {
 *     mode: 'challenge' | 'table',     // challenge = 1v1 (battle); table = a shared pot
 *     header: true,                    // show the "N online · M seeking" strip
 *     onChallenge: id => {...},        // challenge-mode click handler
 *   });
 *   lobby.update(players);             // feed it RipNet.onLobby rosters
 *
 * Self-injects its CSS once. No dependencies (RipIcons is used if present).
 */
window.ArenaLobby = (function () {
  let styled = false;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hueOf = s => { s = String(s || '?'); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
  const initials = s => { s = String(s || '?').trim(); const p = s.split(/[\s_·.\-]+/).filter(Boolean); return ((p[0] && p[0][0] || s[0] || '?') + (p[1] && p[1][0] || '')).toUpperCase(); };

  function css() {
    if (styled) return; styled = true;
    const s = document.createElement('style'); s.id = 'arena-lobby-css';
    s.textContent = [
      ".arena-lobby{font-family:'Courier New',ui-monospace,monospace;color:#cfe9d8;text-align:left;}",
      ".al-head{display:flex;align-items:center;gap:7px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#9fe6c8;margin:2px 2px 8px;}",
      ".al-head b{font-family:'Arial Black',Arial,sans-serif;color:#2bff80;font-size:12px;}",
      ".al-hdot{width:8px;height:8px;border-radius:50%;background:#2bff80;box-shadow:0 0 8px #2bff80;animation:alPulse 1.8s ease-in-out infinite;}",
      ".al-seek{color:#ffd23b;} .al-seek::before{content:'';}",
      "@keyframes alPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.72)}}",
      ".al-list{display:flex;flex-direction:column;gap:6px;max-height:290px;overflow-y:auto;padding:2px;}",
      ".al-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;position:relative;",
        "border:1px solid rgba(120,150,135,.16);background:linear-gradient(100deg,rgba(10,26,18,.72),rgba(3,12,8,.72));",
        "transition:transform .13s ease,border-color .13s ease,box-shadow .13s ease;animation:alIn .28s cubic-bezier(.4,1.2,.5,1) both;}",
      "@keyframes alIn{from{opacity:0;transform:translateX(-8px)}}",
      "@media(hover:hover){.al-row:hover{transform:translateX(2px);border-color:rgba(43,255,128,.4);box-shadow:0 6px 18px -8px #000;}}",
      ".al-row.me{border-color:rgba(255,210,59,.5);background:linear-gradient(100deg,rgba(40,32,6,.6),rgba(12,10,3,.7));}",
      ".al-row.signed{border-color:rgba(43,255,128,.4);box-shadow:inset 0 0 16px rgba(43,255,128,.06);}",
      ".al-row.seeking{border-color:rgba(255,210,59,.55);box-shadow:0 0 16px rgba(255,170,40,.16);}",
      ".al-row.battling{opacity:.6;}",
      ".al-orb{flex:none;width:9px;height:9px;border-radius:50%;background:#5b7;box-shadow:0 0 7px #5b7;}",
      ".al-orb.seeking{background:#ffd23b;box-shadow:0 0 10px #ffd23b;animation:alPulse 1.1s ease-in-out infinite;}",
      ".al-orb.battling{background:#ff4b5c;box-shadow:0 0 10px #ff4b5c;animation:alPulse .7s ease-in-out infinite;}",
      ".al-av{flex:none;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-family:'Arial Black',Arial,sans-serif;font-size:13px;",
        "color:#04140b;background:linear-gradient(150deg,hsl(var(--h),85%,66%),hsl(calc(var(--h) + 40),80%,44%));",
        "box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 2px 6px rgba(0,0,0,.4);text-shadow:0 1px 0 rgba(255,255,255,.25);}",
      ".al-body{min-width:0;flex:1;}",
      ".al-nm{font-family:'Arial Black',Arial,sans-serif;font-size:12.5px;color:#eafff6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.01em;}",
      ".al-seal{color:#ffd23b;font-size:11px;margin-left:3px;text-shadow:0 0 8px rgba(255,210,59,.6);}",
      ".al-meta{font-size:10px;color:#8fb8a2;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}",
      ".al-meta b{color:#ffd23b;font-family:'Courier New',monospace;}",
      ".al-live{color:#27f7e4;} .al-wl{color:#9fe6c8;}",
      ".al-act{flex:none;cursor:pointer;font-family:'Arial Black',Arial,sans-serif;font-size:10px;letter-spacing:.06em;text-transform:uppercase;",
        "padding:8px 12px;border-radius:8px;border:2px solid #3a0a2f;color:#12040f;white-space:nowrap;",
        "background:linear-gradient(180deg,#ff9cf0,#ff2ad9 60%,#a10c86);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 3px 0 #3a0a2f;}",
      ".al-act:active{transform:translateY(2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 0 #3a0a2f;}",
      ".al-act.seek{background:linear-gradient(180deg,#8bffbb,#2bff80 60%,#0fae56);border-color:#01130a;color:#02120a;box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 3px 0 #01130a;animation:alGlow 1.2s ease-in-out infinite;}",
      "@keyframes alGlow{0%,100%{filter:brightness(1)}50%{filter:brightness(1.22)}}",
      ".al-act:disabled{filter:grayscale(.7) brightness(.65);cursor:not-allowed;}",
      ".al-pill{flex:none;font-family:'Arial Black',Arial,sans-serif;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:5px 9px;border-radius:20px;border:1px solid;}",
      ".al-pill.idle{color:#7fae95;border-color:rgba(120,150,135,.4);}",
      ".al-pill.seeking{color:#04140b;background:#2bff80;border-color:#2bff80;box-shadow:0 0 12px rgba(43,255,128,.5);}",
      ".al-pill.battling{color:#ff8a94;border-color:rgba(255,75,92,.5);}",
      ".al-you{flex:none;font-family:'Arial Black',Arial,sans-serif;font-size:10px;letter-spacing:.08em;color:#ffd23b;}",
      ".al-empty{font-size:11px;color:#6f9a83;line-height:1.6;padding:14px 8px;text-align:center;}",
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function rowHtml(p, mode) {
    const st = p.status || 'idle';
    const seal = p.verified ? '<span class="al-seal" title="signed the ledger — stakes real $UR3030">⚜</span>' : '';
    const wl = p.wl ? ' · <span class="al-wl">' + esc(p.wl) + '</span>' : '';
    const live = p.bot ? '' : (p.verified ? '' : ' · <span class="al-live">live</span>');
    const av = '<span class="al-av" style="--h:' + hueOf(p.id || p.handle) + '">' + esc(initials(p.handle)) + '</span>';
    let action;
    if (p.me) action = '<span class="al-you">◈ YOU</span>';
    else if (mode === 'challenge') action = '<button class="al-act' + (st === 'seeking' ? ' seek' : '') + '" data-id="' + esc(p.id) + '"' +
      (st === 'battling' ? ' disabled' : '') + '><span class="ic" data-ic="swords"></span> ' + (st === 'seeking' ? 'answer' : 'challenge') + '</button>';
    else action = '<span class="al-pill ' + st + '">' + (st === 'battling' ? 'fighting' : st === 'seeking' ? 'ready' : 'idle') + '</span>';
    return '<div class="al-row ' + st + (p.me ? ' me' : '') + (p.verified ? ' signed' : '') + '">' +
      '<span class="al-orb ' + st + '" title="' + st + '"></span>' + av +
      '<div class="al-body"><div class="al-nm">' + esc(p.handle) + seal + '</div>' +
      '<div class="al-meta"><b>' + ((p.balance || 0).toLocaleString('en-US')) + '</b> $UR · ' + (p.cards || 0) + ' cards' + wl + live + '</div></div>' +
      action + '</div>';
  }

  function mount(container, opts) {
    css();
    opts = opts || {};
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return { update() {}, el: null };
    el.classList.add('arena-lobby');
    const mode = opts.mode || 'challenge';
    const showHead = opts.header !== false;
    function update(players) {
      const list = players || [];
      const rank = p => (p.me ? 0 : p.status === 'seeking' ? 1 : p.status === 'battling' ? 3 : p.bot ? 4 : 2);
      const sorted = list.slice().sort((a, b) => rank(a) - rank(b));
      const online = list.length, seeking = list.filter(p => !p.me && p.status === 'seeking').length;
      const head = showHead
        ? '<div class="al-head"><span class="al-hdot"></span><b>' + online + '</b> ripper' + (online === 1 ? '' : 's') + ' online' +
          (seeking ? ' · <span class="al-seek">' + seeking + ' seeking</span>' : '') + '</div>'
        : '';
      const rows = sorted.length ? sorted.map(p => rowHtml(p, mode)).join('')
        : '<div class="al-empty">warming up the room — open a second tab, or seek and wait for a challenger</div>';
      el.innerHTML = head + '<div class="al-list">' + rows + '</div>';
      if (mode === 'challenge' && typeof opts.onChallenge === 'function') {
        el.querySelectorAll('.al-act').forEach(b => b.onclick = () => opts.onChallenge(b.dataset.id));
      }
      if (window.RipIcons) RipIcons.hydrate(el);
    }
    update(opts.players || []);
    return { update, el };
  }

  return { mount };
})();

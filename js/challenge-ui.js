/* ripmaster3030studios — CHALLENGE ANYONE, INTO ANYTHING, FROM ANYWHERE (RipChallengeUI).
 *
 * Artist, 2026-08-07: "we need challenge buttons for any player to any game at any time."
 *
 * ⛔ WHAT WAS THERE. `cards/battle.html` could challenge a named person — into the arena, and
 *   only the arena. Every other cabinet mounted `ArenaLobby` in `table` mode, which draws a
 *   status pill and no button at all, so the only route to a human dogfight was BOTH people
 *   pressing SEEK in the same window and hoping. You could see somebody and had no way to ask
 *   them anything. ⚑ The transport was already general (api/presence.js's per-recipient inbox);
 *   what was missing was a DESTINATION on the envelope and one control that every page can draw.
 *
 * ⚑ ONE MODULE, NOT SIX. The claim wording, the accept/decline toast, the game picker and the
 *   navigation are identical everywhere, and this repo's most frequently paid bill is three
 *   copies of one rule drifting apart. Cabinets differ in what they DO with a match, not in how
 *   an invitation looks.
 *
 *   RipChallengeUI.pick(id, handle)   open the game picker for a player, then send
 *   RipChallengeUI.send(id, game)     send directly
 *   (incoming challenges mount themselves on any page that loads this file)
 *
 * ⚠ ACCEPTING NAVIGATES. A challenge to DOGFIGHT from the front page has to move you, and the
 *   `?vs=` the arena already understands is the general form: the destination page opens with the
 *   opponent named. The CHALLENGER is moved by the accept coming back, so both land in the same
 *   room off one exchange rather than two people agreeing to click the same link.
 */
window.RipChallengeUI = (function () {
  'use strict';
  if (window.self !== window.top) return { pick() {}, send() {} };   // never inside a card iframe

  /* ⚠ MIRRORS `GAMES` IN api/presence.js — the server refuses any name not on its list, so the
   * two must agree or a challenge is silently dropped by validation. Kept as one table here with
   * the label and the href beside the key so a new cabinet is one row, not three edits. */
  var GAMES = [
    { key: 'arena', label: 'THE ARENA', sub: 'cards · 1v1', href: 'cards/battle.html' },
    { key: 'dogfight', label: 'DOGFIGHT', sub: 'jets', href: 'dogfight.html' },
    { key: 'section9', label: 'SECTION 9', sub: 'tactical', href: 'section9.html' },
    { key: 'city', label: 'THE CITY', sub: 'open world', href: 'city.html' },
    { key: 'cloudracer', label: 'CLOUD RACER', sub: 'racing', href: 'cloudracer.html' },
    { key: 'riprocketer', label: 'RIP ROCKETER', sub: 'shmup', href: 'riprocketer.html' }
  ];
  var byKey = {}; GAMES.forEach(function (g) { byKey[g.key] = g; });

  /* ⚠ Pages live at two depths (`/index.html` and `/cards/battle.html`), so a bare href would
   *   resolve differently depending on who drew the button. Root-absolute, always. */
  function url(key, vs, cid) {
    var g = byKey[key] || byKey.arena;
    return '/' + g.href + '?vs=' + encodeURIComponent(vs) + (cid ? '&cid=' + encodeURIComponent(cid) : '');
  }
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var net = function () { return window.RipNet || null; };
  var here = function () {
    var p = location.pathname;
    for (var i = 0; i < GAMES.length; i++) if (p.indexOf(GAMES[i].href) >= 0) return GAMES[i].key;
    return null;
  };

  function css() {
    if (document.getElementById('rcu-css')) return;
    var s = document.createElement('style'); s.id = 'rcu-css';
    s.textContent = [
      '.rcu-veil{position:fixed;inset:0;z-index:2147483200;display:grid;place-items:center;',
      '  background:rgba(2,8,4,.82);font:13px/1.5 "Courier New",monospace;padding:16px}',
      '.rcu-box{max-width:460px;width:100%;border:1px solid #1c7a48;border-radius:12px;',
      '  background:linear-gradient(180deg,#04180e,#020d07);color:#d9ffe9;padding:16px;',
      '  box-shadow:0 18px 60px -20px #000}',
      '.rcu-hd{font-family:"Arial Black",Arial,sans-serif;font-size:13px;letter-spacing:.06em;',
      '  color:#2bff80;margin-bottom:4px}',
      '.rcu-sub{color:#8fb8a2;font-size:11.5px;margin-bottom:12px}',
      '.rcu-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:8px}',
      '.rcu-g{display:flex;flex-direction:column;gap:2px;align-items:flex-start;min-height:56px;',
      '  padding:9px 11px;border:1px solid #16663c;border-radius:9px;background:#03150c;',
      '  color:#d9ffe9;font:inherit;text-align:left;cursor:pointer}',
      '.rcu-g:hover,.rcu-g:focus{border-color:#2bff80;color:#2bff80;outline:none}',
      '.rcu-g b{font-family:"Arial Black",Arial,sans-serif;font-size:11.5px;letter-spacing:.04em}',
      '.rcu-g span{font-size:10.5px;color:#8fb8a2}',
      '.rcu-row{display:flex;gap:8px;margin-top:13px;flex-wrap:wrap}',
      '.rcu-b{flex:1;min-width:120px;min-height:44px;border-radius:9px;border:1px solid #1c7a48;',
      '  background:#0a2a18;color:#2bff80;font:inherit;cursor:pointer;font-weight:bold}',
      '.rcu-b.no{border-color:#5a2340;background:#1a0812;color:#ff9cc8}',
      '.rcu-b:hover{filter:brightness(1.2)}',
      /* the incoming toast — bottom on a phone, out of the way of a game's controls */
      '.rcu-toast{position:fixed;left:12px;right:12px;bottom:calc(14px + var(--urm-banner,0px));',
      '  z-index:2147483210;max-width:460px;margin:0 auto;border:1px solid #ffd23b;border-radius:11px;',
      '  background:linear-gradient(180deg,#1a1405,#0b0a02);color:#ffeaa7;padding:12px 14px;',
      '  font:13px/1.45 "Courier New",monospace;box-shadow:0 14px 44px -14px #000;',
      '  transform:translateY(140%);transition:transform .22s cubic-bezier(.4,1.3,.5,1)}',
      '.rcu-toast.show{transform:translateY(0)}',
      '@media (prefers-reduced-motion:reduce){.rcu-toast{transition:none}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function close(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  /* ── outgoing: choose a game, then send ─────────────────────────────────────────────────── */
  function pick(id, handle) {
    if (!net() || !id) return;
    css();
    var veil = document.createElement('div'); veil.className = 'rcu-veil';
    veil.innerHTML = '<div class="rcu-box" role="dialog" aria-label="challenge a ripper">' +
      '<div class="rcu-hd">⚔ CHALLENGE ' + esc(handle || 'a ripper') + '</div>' +
      '<div class="rcu-sub">Pick the game. They get it wherever they are, and you both land in the same room.</div>' +
      '<div class="rcu-grid">' + GAMES.map(function (g) {
        return '<button class="rcu-g" data-g="' + g.key + '"><b>' + esc(g.label) + '</b><span>' + esc(g.sub) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="rcu-row"><button class="rcu-b no" data-x>never mind</button></div></div>';
    veil.addEventListener('click', function (e) { if (e.target === veil) close(veil); });
    veil.querySelector('[data-x]').onclick = function () { close(veil); };
    veil.querySelectorAll('.rcu-g').forEach(function (b) {
      b.onclick = function () { close(veil); send(id, b.dataset.g, handle); };
    });
    document.body.appendChild(veil);
  }

  function send(id, game, handle) {
    if (!id) return;
    /* ⛔ FROM THE FRONT DOOR THIS IS A NAVIGATION, NOT A SEND — see inGame(). The destination
     *   cabinet issues the challenge on arrival (callOut), so the roster on index.html stays
     *   read-only and pressing ⚔ is what turns a reader into a player. */
    if (!inGame()) { location.href = url(game || 'arena', id, ''); return; }
    if (!net()) return;
    var cid = null;
    try { cid = net().challenge(id, game || 'arena'); } catch (e) {}
    /* ⚠ SAY WHAT HAPPENED. `challenge()` returns undefined for an id no longer in the roster —
     *   somebody who left between the roster arriving and the button being pressed — and that is
     *   the exact case where silence reads as a broken button. */
    if (!cid) return toast('⚠ ' + (handle || 'that ripper') + ' just left the room.', 3200);
    var g = byKey[game || 'arena'] || byKey.arena;
    toast('⚔ called out ' + (handle || 'a ripper') + ' — ' + g.label + '. waiting for an answer…', 4200);
  }

  var tEl = null, tT = 0;
  function toast(msg, ms) {
    css();
    if (!tEl) { tEl = document.createElement('div'); tEl.className = 'rcu-toast'; tEl.setAttribute('role', 'status');
      document.body.appendChild(tEl); }
    tEl.innerHTML = esc(msg); tEl.classList.add('show');
    clearTimeout(tT); tT = setTimeout(function () { tEl && tEl.classList.remove('show'); }, ms || 3600);
  }

  /* ── incoming: the toast a human answers ────────────────────────────────────────────────── */
  var live = null, liveT = 0;
  function incoming(ch) {
    if (!ch || !ch.from) return;
    /* ⛔ DO NOT DOUBLE-TOAST. `cards/battle.html` has its own incoming-challenge toast, and
     *   accepting there opens the PvP stake modal rather than navigating — so a page that already
     *   handles ITS OWN game says so with `RIPCHAL_OWN` and this module stays out of the way for
     *   that one case only. A challenge to a DIFFERENT game arriving while you are in the arena
     *   is still ours, because the arena has nothing to say about a dogfight. */
    if (window.RIPCHAL_OWN && (ch.game || 'arena') === here()) return;
    css();
    var g = byKey[ch.game || 'arena'] || byKey.arena;
    var mine = here();
    live = ch;
    var el = document.createElement('div'); el.className = 'rcu-toast'; el.setAttribute('role', 'alert');
    el.innerHTML = '<div><b style="color:#fff">' + esc(ch.from.handle || 'a ripper') + '</b> wants to play you — ' +
      '<b style="color:#2bff80">' + esc(g.label) + '</b>' +
      (mine === g.key ? '' : ' <span style="opacity:.75">(takes you there)</span>') + '</div>' +
      '<div class="rcu-row"><button class="rcu-b" data-yes>⚔ accept</button>' +
      '<button class="rcu-b no" data-no>pass</button></div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    var done = function () { close(el); live = null; clearTimeout(liveT); };
    el.querySelector('[data-no]').onclick = function () { try { net().decline(ch); } catch (e) {} done(); };
    el.querySelector('[data-yes]').onclick = function () {
      try { net().accept(ch); } catch (e) {}
      done();
      /* already in the right cabinet? the page's own onMatch takes it from here. */
      if (here() !== g.key) location.href = url(g.key, ch.from.id, ch.id);
    };
    /* ⚠ AN UNANSWERED CHALLENGE MUST EXPIRE, and it must DECLINE rather than just vanish — the
     *   challenger is standing in a lobby, and "no answer" and "they said no" have to be the same
     *   observable event or the person waiting learns nothing. Matches the server's mailbox TTL. */
    clearTimeout(liveT);
    liveT = setTimeout(function () { if (live === ch) { try { net().decline(ch); } catch (e) {} done(); } }, 30000);
  }

  /* ⛔ A READER IS NOT A PLAYER, AND THAT PROPERTY IS TESTED. `js/online-now.js` is read-only by
   *   design — the front page never heartbeats, or the count it publishes becomes a lie and the
   *   first real challenger is sent to somebody reading a whitepaper. So OUTSIDE a cabinet this
   *   module registers nothing and listens for nothing: the ⚔ there opens the picker and
   *   NAVIGATES, which is the moment you stop lurking. */
  function inGame() { return here() !== null; }

  /* ⚑ `?vs=` GENERALISED TO EVERY CABINET. cards/battle.html already understood it; arriving at
   *   dogfight.html?vs=p_xxx now issues the challenge the same way, so one picker works for all
   *   six games without six copies of the arrival code. */
  function callOut() {
    var vs = '', q;
    try { q = new URLSearchParams(location.search); vs = q.get('vs') || ''; } catch (e) {}
    if (!/^p_[a-z0-9]{4,20}$/.test(vs)) return;
    var g = here(); if (!g) return;
    if (window.RIPCHAL_OWN && g === 'arena') return;        // the arena sends its own
    try { if (net().me().id === vs) return; } catch (e) { return; }
    var t0 = Date.now();
    var look = setInterval(function () {
      var seen = false;
      try { seen = net().roster().some(function (p) { return p.id === vs && !p.me; }); } catch (e) {}
      if (seen) { clearInterval(look); send(vs, g); return; }
      if (Date.now() - t0 > 9000) { clearInterval(look); toast('⚠ that ripper has left the room.', 3200); }
    }, 400);
  }

  function boot() {
    if (!net()) return;
    if (!inGame()) return;                 // front door: picker + navigation only, never a record
    try {
      net().onChallenge(incoming);
      /* the challenger is moved by the ANSWER, so both sides land in one room off one exchange */
      net().onMatch(function (m) {
        if (!m || !m.opponent) return;
        var g = byKey[m.game || 'arena'] || byKey.arena;
        if (here() !== g.key) location.href = url(g.key, m.opponent.id, '');
      });
      net().onReply(function (r) {
        if (r && r.kind === 'decline') toast('✕ ' + ((r.from && r.from.handle) || 'they') + ' passed.', 3200);
      });
      net().join({});                       // publish a record so a challenge can reach us
      callOut();
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { pick: pick, send: send, GAMES: GAMES, url: url, _incoming: incoming };
})();

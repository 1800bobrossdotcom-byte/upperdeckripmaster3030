/* ripmaster3030studios — WHO IS ONLINE, on the pages you arrive at.
 *
 *   <div id="onlineNow"></div>   →  "3 rippers online · 1 seeking a fight"  + who, and where
 *
 * ⛔ THE PLUMBING WAS ALREADY LIVE AND NOBODY COULD SEE IT. /api/presence is configured and
 *   answering, every cabinet heartbeats into it, and the roster renders — but ONLY inside a
 *   cabinet. So the one way to learn that somebody is online was to already be in a game with
 *   them. Artist: "make it easier for people to see each other online and challenge each other."
 *   That is a discovery problem, not a networking one: you cannot join what you cannot see.
 *
 * ⛔ READ-ONLY, AND THAT IS THE WHOLE DESIGN. This GETs the roster and NEVER heartbeats. A
 *   visitor reading the front page is not a player, and registering them as one would inflate
 *   the count with people who are not there — turning the single number this exists to publish
 *   into a lie, and sending the first real challenger to somebody who is reading a whitepaper.
 *   A lurker is invisible here on purpose.
 *
 * ⚠ NO NEW FLOATING FURNITURE. It renders into a container the page already lays out, and does
 *   nothing at all if that container is absent. This repo has twice paid for a fixed element
 *   fighting for a corner — banner.js covering the games' controls, the music pill winning the
 *   hit test over THE CITY's flap button — and a "who's online" pill would be the third.
 *
 * FAILS SILENT: 503 (no KV), offline, a blocked fetch, a malformed body ⇒ the strip stays empty
 * and the page is exactly the page it was. An empty room renders nothing rather than "0 online",
 * because a zero is a reason not to come back and an absence is not.
 */
(function (global) {
  'use strict';
  if (global.self !== global.top) return;           // never inside a card iframe or a media slot

  var EL = null, timer = 0, GEN = 0;
  var EVERY = 15000;                                 // presence TTL is 20s — poll inside it

  /* Where a player is, in the words the site uses on its own doors. ⚠ Keys are the `game` field
   * the cabinets already send; an unknown one falls back to its own name rather than to
   * "somewhere", so a new cabinet appears here the day it ships without an edit. */
  var WHERE = {
    arena: { label: 'THE ARENA', href: 'cards/battle.html' },
    city: { label: 'THE CITY', href: 'city.html' },
    dogfight: { label: 'DOGFIGHT', href: 'dogfight.html' },
    section9: { label: 'SECTION 9', href: 'section9.html' },
    cloudracer: { label: 'CLOUD RACER', href: 'cloudracer.html' },
    riprocketer: { label: 'RIP ROCKETER', href: 'riprocketer.html' },
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function css() {
    if (document.getElementById('on-now-css')) return;
    var s = document.createElement('style');
    s.id = 'on-now-css';
    s.textContent = [
      '.on-now{display:none;margin:14px 0 0;font:12px/1.6 "Courier New",monospace;color:#7fd8a8}',
      '.on-now.live{display:block}',
      '.on-now .on-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap;letter-spacing:.08em;',
      '  text-transform:uppercase;font-size:11px}',
      '.on-now .on-dot{width:7px;height:7px;border-radius:50%;background:#2bff80;flex:none;',
      '  box-shadow:0 0 0 0 rgba(43,255,128,.7);animation:onPulse 2.4s ease-out infinite}',
      '@media (prefers-reduced-motion:reduce){.on-now .on-dot{animation:none}}',
      '@keyframes onPulse{70%{box-shadow:0 0 0 7px rgba(43,255,128,0)}100%{box-shadow:0 0 0 0 rgba(43,255,128,0)}}',
      '.on-now b{color:#2bff80}',
      '.on-now .on-seek{color:#ffd23b}',
      '.on-now .on-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
      /* ⚠ 44px floor — these are the primary way in for anybody who sees a name they want to
         play, and a tap target under the floor on a phone is the whole feature not working. */
      '.on-now a.on-p{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:6px 12px;',
      '  border:1px solid #16663c;border-radius:999px;background:#04180e;color:#d9ffe9;',
      '  text-decoration:none;font-size:11.5px}',
      '.on-now a.on-p:hover,.on-now a.on-p:focus{border-color:#2bff80;color:#2bff80;outline:none}',
      '.on-now a.on-p.seek{border-color:#ffd23b;color:#ffd23b}',
      '.on-now a.on-p small{opacity:.6;letter-spacing:.06em}',
    ].join('');
    document.head.appendChild(s);
  }

  function render(players) {
    var list = (players || []).filter(function (p) { return p && p.handle; });
    /* ⛔ AN EMPTY ROOM RENDERS NOTHING. "0 online" is a worse thing to publish than silence — it
     *   is a reason not to come back, and it is the state a launch spends its quiet hours in. */
    if (!list.length) { EL.className = 'on-now'; EL.innerHTML = ''; return; }

    var seeking = list.filter(function (p) { return p.status === 'seeking'; });
    /* seeking first — they are the ones who want to be found */
    list.sort(function (a, b) {
      var r = function (p) { return p.status === 'seeking' ? 0 : p.status === 'battling' ? 2 : 1; };
      return r(a) - r(b);
    });

    var head = '<div class="on-head"><span class="on-dot"></span><b>' + list.length + '</b>&nbsp;ripper' +
      (list.length === 1 ? '' : 's') + ' online' +
      (seeking.length ? ' · <span class="on-seek">' + seeking.length + ' seeking a fight</span>' : '') + '</div>';

    var rows = list.slice(0, 12).map(function (p) {
      var w = WHERE[p.game] || { label: String(p.game || 'the arcade').toUpperCase(), href: 'arcade.html' };
      var seek = p.status === 'seeking';
      return '<a class="on-p' + (seek ? ' seek' : '') + '" href="' + esc(w.href) + '">' +
        (seek ? '⚔ ' : '') + esc(p.handle) + ' <small>' + esc(w.label) + '</small></a>';
    }).join('');

    EL.className = 'on-now live';
    EL.innerHTML = head + '<div class="on-row">' + rows + '</div>';
  }

  function poll() {
    var mine = ++GEN;
    /* ⚠ `cache: no-store` AND a fresh generation counter. A cached roster is worse than none —
     *   it shows a player who left, and the first thing a new visitor does with this feature is
     *   click one of these names. */
    fetch('/api/presence', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (mine === GEN && j && j.ok) render(j.players); })
      .catch(function () { /* offline, blocked, 503 — the strip simply stays empty */ });
  }

  function start() {
    if (timer) return;
    poll();
    timer = setInterval(poll, EVERY);
  }
  function stop() { clearInterval(timer); timer = 0; }

  function boot() {
    EL = document.getElementById('onlineNow');
    if (!EL) return;                                 // the page did not ask for it
    css();
    EL.className = 'on-now';
    EL.setAttribute('role', 'status');
    /* ⚠ A HIDDEN TAB SHOULD NOT BE POLLING. Someone leaves this page open all day; that is a
     *   request every 15 seconds forever, against a serverless function, for a strip nobody is
     *   looking at. Same rule the starfield follows. */
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    if (!document.hidden) start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.OnlineNow = { poll: poll, render: render };   // for driven checks
})(window);

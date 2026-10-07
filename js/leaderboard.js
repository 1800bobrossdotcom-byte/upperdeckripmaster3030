/* ripmaster3030studios — TOP RIPPERS, one board, every cabinet (RipBoard).
 *
 * Artist, 2026-08-07: "top rippers for each game need to be shown" and "show the address as the
 * player". His own 3,975,083 was sitting on a board that read "RIPPER".
 *
 *   RipBoard.mount(el, 'riprocketer')     draw the live top ten into a container
 *   RipBoard.post('riprocketer', score)   record a run, then redraw every mounted board
 *   RipBoard.panel(el)                    all six boards behind a chip row (the arcade menu)
 *   RipBoard.label()                      who you are, as the board will show you
 *
 * ⛔ THE BOARD WAS localStorage AND IT LIVED IN ONE GAME. `js/rrpc-app.js` kept `urm_rr_scores` in
 *   the player's own browser — so "TOP RIPPERS" listed exactly one person, you — and the other
 *   five cabinets had no board at all. A high score nobody else can see is a diary entry.
 * ⚑ THE ADDRESS IS THE NAME WHEN THERE IS ONE. A handle is per-browser and anybody can type
 *   yours; a connected wallet is the only durable identity this site has. Shown shortened
 *   (0x432D…66c9) because a 42-character string in a 1fr column pushes the score off a phone.
 *   ⚠ Nothing is asked of the wallet to do this — it is read, never prompted. A board is not
 *   worth a signature request.
 * ⚠ AND IT IS NOT AN ORACLE. Every score is computed in the player's own browser, so the board is
 *   exactly as trustworthy as the client. That is fine for a wall of names and is why nothing of
 *   value keys on it: the earned 1/1s need a human-signed voucher, and a board row is a claim,
 *   not evidence. Same rule js/title-ledger.js states about itself.
 *
 * FAILS OPEN: no /api/scores, a 503 (no KV), offline ⇒ the board falls back to the LOCAL list the
 * game already kept, so a cabinet never shows an empty panel because a service is down.
 */
window.RipBoard = (function () {
  'use strict';
  var API = '/api/scores';
  var mounts = [];                 // {el, game}
  var LOCAL = 'urm_board_';        // per-game local fallback, and the offline record

  /* ⛔ A BARE NUMBER ON A SCOREBOARD IS NOT A FACT, IT IS A RIDDLE. "12" beside a name on
   *   DOGFIGHT's board could be kills, matches, points or minutes, and the reader has no way to
   *   find out — the first three boards shipped exactly that. Each game therefore names what it
   *   counts, ONCE, here, so the header and the number can never disagree.
   * ⚑ AND EVERY ONE OF THESE IS A NUMBER THE GAME ALREADY RANKS ITSELF BY — kills in the two
   *   shooters, points in RIP ROCKETER, the streak CLOUD RACER's own earned title is made of, the
   *   metres THE CITY's DEAD AIR detector already measures. Inventing a score formula so a board
   *   could exist would be inventing a fact; picking the number already on screen is not. */
  var UNITS = { riprocketer: 'points', dogfight: 'kills', section9: 'kills',
    cloudracer: 'wins in a row', arena: 'wins in a row', city: 'metres, one glide',
    pull: 'best run', blade: 'points' };
  var TITLES = { riprocketer: 'RIP ROCKETER', dogfight: 'DOGFIGHT', section9: 'SECTION 9',
    cloudracer: 'CLOUD RACER', arena: 'THE ARENA', city: 'THE CITY', pull: 'THE PULL', blade: 'THE LIGHT' };
  var ALL = ['riprocketer', 'cloudracer', 'city', 'dogfight', 'section9', 'arena', 'pull', 'blade'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  var short = function (a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; };

  /* who you are. ⚠ Reads a connected wallet if one happens to be there; never prompts for one. */
  function addr() {
    try {
      if (window.RipWallet && RipWallet.isConnected && RipWallet.isConnected() && RipWallet.account())
        return String(RipWallet.account());
    } catch (e) {}
    try { var a = localStorage.getItem('urm_wallet_addr'); if (/^0x[0-9a-fA-F]{40}$/.test(a || '')) return a; } catch (e) {}
    return '';
  }
  function handle() {
    try { if (window.RipNet && RipNet.handle) return RipNet.handle(); } catch (e) {}
    try { return localStorage.getItem('urm_net_handle') || ''; } catch (e) { return ''; }
  }
  /* the string the board shows for YOU — address first, per the artist */
  function label() { var a = addr(); return a ? short(a) : (handle() || 'a ripper'); }

  function lget(game) { try { return JSON.parse(localStorage.getItem(LOCAL + game) || '[]'); } catch (e) { return []; } }
  function lput(game, rows) { try { localStorage.setItem(LOCAL + game, JSON.stringify(rows.slice(0, 25))); } catch (e) {} }

  function rowsHtml(rows, mineKey) {
    if (!rows.length) return '<div class="lb-row"><span class="lb-rank">—</span>' +
      '<span class="lb-nm">be the first to sign</span><span class="lb-sc"></span></div>';
    return rows.slice(0, 10).map(function (e, i) {
      var shown = e.addr ? short(e.addr) : (e.name || 'a ripper');
      var me = mineKey && ((e.addr && e.addr.toLowerCase() === mineKey) || (!e.addr && e.name === mineKey));
      return '<div class="lb-row' + (me ? ' me' : '') + '"><span class="lb-rank">' + (i + 1) + '</span>' +
        '<span class="lb-nm"' + (e.addr ? ' title="' + esc(e.addr) + '"' : '') + '>' + esc(shown) + '</span>' +
        '<span class="lb-sc">' + (e.score || 0).toLocaleString('en-US') + '</span></div>';
    }).join('');
  }

  function draw(m, rows) {
    if (!m.el) return;
    var a = addr(), mine = a ? a.toLowerCase() : handle();
    var unit = UNITS[m.game] ? ' · ' + UNITS[m.game] : '';
    /* ⚠ Reuses the cabinets' own `.lb-*` classes so each board keeps that game's styling rather
     *   than importing a seventh look into a page that already has one. */
    m.el.innerHTML = '<div class="lb-hd">top rippers' + esc(unit) + '</div>' +
      (m.chips || '') + rowsHtml(rows || [], mine);
    if (m.chips) wireChips(m);
  }

  function refresh(game) {
    var live = mounts.filter(function (m) { return !game || m.game === game; });
    if (!live.length) return Promise.resolve();
    var games = {};
    live.forEach(function (m) { games[m.game] = 1; });
    return Promise.all(Object.keys(games).map(function (g) {
      return fetch(API + '?game=' + encodeURIComponent(g) + '&n=10', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          /* ⛔ FALL BACK TO THE LOCAL LIST, DO NOT BLANK. A cabinet showing an empty board because
           *   a serverless function is cold reads as "nobody has ever played this", which is the
           *   worst thing a scoreboard can say. */
          var rows = (j && j.ok && j.top) ? j.top : lget(g);
          if (j && j.ok && j.top) lput(g, j.top);
          mounts.forEach(function (m) { if (m.game === g) draw(m, rows); });
        })
        .catch(function () { mounts.forEach(function (m) { if (m.game === g) draw(m, lget(g)); }); });
    }));
  }

  /* ⚠ the cabinets style `.lb-*` themselves; only riprocketer.html happened to define them, so a
   *   minimal fallback ships here for the five that did not — scoped to #topRippers so it can
   *   never override a game's own board.
   * ⚠ THE CHIPS CARRY THE 44px FLOOR ON BOTH AXES. They are buttons on a phone, and this repo has
   *   already shipped a 44-tall / 35-wide target once by asking about one dimension only. */
  function css() {
    if (document.getElementById('rb-css')) return;
    var st = document.createElement('style'); st.id = 'rb-css';
    st.textContent = '#topRippers .lb-hd{text-align:center;font-family:"Arial Black",Arial,sans-serif;' +
      'font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#ffd23b;margin-bottom:6px}' +
      '#topRippers .lb-row{display:grid;grid-template-columns:22px 1fr auto;gap:8px;padding:4px 8px;' +
      'border-radius:6px;align-items:baseline;font-size:12.5px;font-family:"Courier New",monospace}' +
      '#topRippers .lb-row.me{background:rgba(255,210,59,.16);border:1px solid rgba(255,210,59,.45)}' +
      '#topRippers .lb-rank{color:#6fdca0;font-family:"Arial Black",Arial,sans-serif}' +
      '#topRippers .lb-nm{color:#d9ffe9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#topRippers .lb-sc{color:#2bff80;font-family:"Courier New",monospace}' +
      '#topRippers .lb-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:0 0 10px}' +
      '#topRippers .lb-chip{min-height:44px;min-width:44px;padding:6px 12px;border-radius:999px;' +
      'border:1px solid #16663c;background:#04180e;color:#7fd8a8;font:11px/1.2 "Courier New",monospace;' +
      'letter-spacing:.08em;text-transform:uppercase;cursor:pointer}' +
      '#topRippers .lb-chip.on{border-color:#ffd23b;color:#ffd23b;background:#1b1405}' +
      '#topRippers .lb-chip:hover,#topRippers .lb-chip:focus-visible{color:#2bff80;outline:none}';
    (document.head || document.documentElement).appendChild(st);
  }

  function mount(el, game) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el || !game) return { refresh: function () {} };
    css();
    var m = { el: el, game: game };
    mounts.push(m);
    draw(m, lget(game));            // paint the known board immediately, then correct it
    refresh(game);
    return { refresh: function () { return refresh(game); } };
  }

  /* ⛔ THE CITY HAS NO LOBBY TO HANG A BOARD ON, AND THAT IS NOT A REASON FOR IT NOT TO HAVE ONE.
   *   Five cabinets have a roster or a game-over screen; THE CITY drops you straight into 3.8 km
   *   of world and never stops, so a board there would have to become in-game furniture — and
   *   this repo has twice paid for a fixed element fighting for a corner (banner.js over the
   *   games' controls, the music pill winning the hit test over the flap button).
   * ⚑ SO ALL SIX BOARDS LIVE ON THE MENU AS WELL, WHICH IS WHERE YOU LOOK BEFORE YOU CHOOSE. One
   *   panel with a chip per game, not six stacked boards: the arcade page is a scrolling column
   *   the funnel pass fought to SHORTEN, and six boards would put ~500px back into it.
   * ⚠ The chosen chip is remembered, because the game you want the board for is the game you play. */
  var PICK = 'urm_board_pick';
  function chipsHtml(games, cur) {
    return '<div class="lb-chips">' + games.map(function (g) {
      return '<button type="button" class="lb-chip' + (g === cur ? ' on' : '') + '" data-g="' + esc(g) +
        '"' + (g === cur ? ' aria-current="true"' : '') + '>' + esc(TITLES[g] || g) + '</button>';
    }).join('') + '</div>';
  }
  function wireChips(m) {
    m.el.querySelectorAll('.lb-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        m.game = b.dataset.g;
        try { localStorage.setItem(PICK, m.game); } catch (e) {}
        m.chips = chipsHtml(m.games, m.game);
        draw(m, lget(m.game));          // the known board immediately, then correct it
        refresh(m.game);
      });
    });
  }
  function panel(el, games) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return { refresh: function () {} };
    css();
    games = (games && games.length) ? games : ALL;
    var cur = '';
    try { cur = localStorage.getItem(PICK) || ''; } catch (e) {}
    if (games.indexOf(cur) < 0) cur = games[0];
    var m = { el: el, game: cur, games: games, chips: chipsHtml(games, cur) };
    mounts.push(m);
    draw(m, lget(cur));
    refresh(cur);
    return { refresh: function () { return refresh(m.game); } };
  }

  function post(game, score) {
    score = Math.round(+score || 0);
    if (!game || !score) return Promise.resolve();
    var a = addr(), h = handle();
    /* record it locally FIRST, so a run counts even with no network and the board a player sees
     * is never behind what they just did */
    var rows = lget(game), key = a ? a.toLowerCase() : h;
    var at = -1;
    rows.forEach(function (r, i) { var k = r.addr ? r.addr.toLowerCase() : r.name; if (k === key) at = i; });
    if (at >= 0) { if (score > (rows[at].score || 0)) rows[at].score = score; }
    else rows.push({ name: h, addr: a, score: score });
    rows.sort(function (x, y) { return (y.score || 0) - (x.score || 0); });
    lput(game, rows);
    mounts.forEach(function (m) { if (m.game === game) draw(m, rows); });

    return fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: game, score: score, name: h, addr: a }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.ok && j.top) { lput(game, j.top);
        mounts.forEach(function (m) { if (m.game === game) draw(m, j.top); }); } })
      .catch(function () {});
  }

  /* ⛔ AUTO-MOUNT, BECAUSE ONLY ONE CABINET EVER HAD A BOARD. Wiring six pages by hand is six
   *   chances to forget one — which is precisely how RIP ROCKETER ended up the only game with a
   *   TOP RIPPERS panel. A page that already has `#topRippers` gets it there; otherwise the panel
   *   is inserted after the lobby roster, which is where a player is already looking for names.
   * ⚠ Does nothing at all on a page with neither, so a document or a card page is untouched. */
  var GAMES = { 'dogfight.html': 'dogfight', 'section9.html': 'section9', 'city.html': 'city',
    'cloudracer.html': 'cloudracer', 'riprocketer.html': 'riprocketer', 'battle.html': 'arena',
    'pull.html': 'pull', 'blade.html': 'blade' };
  /* ⚠ A PAGE MISSING FROM THIS MAP DOES NOT GET *NO* BOARD — `gameHere()` returns null and the
   *   panel falls back to the first game in ALL, so THE LIGHT's result screen showed RIP
   *   ROCKETER's leaderboard. Nothing errored and the panel looked completely normal; it was
   *   simply somebody else's board. Caught by `test:blade` noticing the page fetch
   *   `/api/scores?game=riprocketer`. A default that is a real, plausible value is worse than an
   *   empty one — there is nothing on screen to look wrong. */
  function gameHere() {
    var p = location.pathname;
    for (var k in GAMES) if (p.indexOf(k) >= 0) return GAMES[k];
    return null;
  }
  function autoMount() {
    var g = gameHere();
    var el = document.getElementById('topRippers');
    /* ⚑ A PAGE THAT IS NOT A CABINET BUT ASKS FOR A BOARD GETS ALL SIX — that is arcade.html, and
     *   it is the only home THE CITY has. Opting in is one empty div, so a new surface needs no
     *   edit here. */
    if (!g) { if (el) { css(); panel(el, ALL); } return; }
    if (!el) {
      var host = document.getElementById('arenaLobby') || document.getElementById('lobList');
      if (!host) return;                       // nothing to hang it on — leave the page alone
      el = document.createElement('div');
      el.id = 'topRippers';
      el.style.cssText = 'margin-top:12px';
      host.parentNode.insertBefore(el, host.nextSibling);
    }
    css();
    mount(el, g);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
  else autoMount();

  return { mount: mount, panel: panel, post: post, refresh: refresh, label: label,
    game: gameHere, units: UNITS, games: ALL, _addr: addr };
})();

/* CLOUD RACER — lobby, HUD, result and the wager (CRUI).
 *
 * Knows the DOM and the pot; knows neither the rules nor the engine. `crpc-game.js` hands it a
 * state object once a frame and it paints numbers; `crpc-app.js` calls it. The wager, vault,
 * RipNet lobby and WagerPayout wiring are carried over from the previous build unchanged — the
 * rehaul is the racing and the look, and there was nothing wrong with the pot.
 *
 * ⚑ THE HUD HAD TO CHANGE WITH THE GAME. The old one showed speed, lap, place and a boost bar,
 *   which is the right HUD for a game whose only input is "hold boost". Once the boost bar is a
 *   BUDGET you earn and corners have apex speeds, the player needs to see two more things or the
 *   new mechanics are invisible: how the meter is being earned, and whether the corner ahead is
 *   inside the grip limit. Hence the CORNER LAMP and the launch rev bar. A mechanic the player
 *   cannot see is a mechanic that does not exist.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TAU = Math.PI * 2;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const RC = { common: '--common', uncommon: '--uncommon', rare: '--rare', mythic: '--mythic', prizm: '--prizm' };
  const HANDLES = ['SmugFrog', 'DoomerX', 'FeelsBad', 'GreenPill', 'Wojak77', 'RareByte', 'KermitK', 'ApuAtorde', 'GigaBid', 'NPCsees', 'CopePod', 'Seethe9'];

  let DECK = [], bySlug = new Map();
  const vault = () => { try { return JSON.parse(localStorage.getItem('urm_vault') || '[]'); } catch (e) { return []; } };
  const saveVault = v => { try { localStorage.setItem('urm_vault', JSON.stringify(v.slice(-200))); } catch (e) {} };
  const ownedSlugs = () => vault().map(e => e && e.slug).filter(s => bySlug.has(s));
  const liveToken = () => { try { return window.RipWallet && RipWallet.isLive(); } catch (e) { return false; } };
  const myHandle = () => { try { return (window.RipNet && RipNet.me && RipNet.me().handle) || localStorage.getItem('urm_net_handle') || 'you'; } catch (e) { return 'you'; } };
  function loadDeck() {
    return fetch('cards/manifest.json').then(r => r.json())
      .then(m => { DECK = m.cards || []; bySlug = new Map(DECK.map(c => [c.slug, c])); }).catch(() => {});
  }

  // ── the meme pilots. Portraits only now: the pod itself carries a flat livery, because a
  //    128px portrait mapped onto a body 40 units away was never legible and cost a draw call each.
  function pilotCanvas(kind, seed) {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    if (kind === 'pepe') {
      const skins = [['#5fa544', '#4a8535'], ['#8fd35a', '#6ea63f'], ['#d9b23a', '#b0872a'], ['#4aa0c8', '#3a7fa0'], ['#c85a5a', '#a03f3f']];
      const sk = skins[(seed | 0) % skins.length];
      x.fillStyle = sk[0]; x.beginPath(); x.ellipse(S * 0.5, S * 0.56, S * 0.42, S * 0.40, 0, 0, TAU); x.fill();
      x.fillStyle = sk[1]; x.beginPath(); x.ellipse(S * 0.5, S * 0.72, S * 0.40, S * 0.24, 0, 0, TAU); x.fill();
      const ey = S * 0.36, ex = S * 0.20, er = S * 0.15;
      [-1, 1].forEach(d => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(S * 0.5 + d * ex, ey, er, er * 1.05, 0, 0, TAU); x.fill();
        x.strokeStyle = sk[1]; x.lineWidth = 3; x.stroke();
        x.fillStyle = '#111'; x.beginPath(); x.arc(S * 0.5 + d * ex + er * 0.35, ey + er * 0.15, er * 0.42, 0, TAU); x.fill(); });
      x.fillStyle = sk[0]; x.beginPath(); x.moveTo(S * 0.5 - ex - er, ey - er * 0.4);
      x.quadraticCurveTo(S * 0.5, ey - er * 1.2, S * 0.5 + ex + er, ey - er * 0.4);
      x.lineTo(S * 0.5 + ex + er, ey - er * 1.6); x.lineTo(S * 0.5 - ex - er, ey - er * 1.6); x.fill();
      x.strokeStyle = '#6b3b3b'; x.lineWidth = 4; x.beginPath(); x.moveTo(S * 0.22, S * 0.70);
      x.quadraticCurveTo(S * 0.5, S * 0.80, S * 0.80, S * 0.66); x.stroke();
    } else {
      const pale = [['#f0d9c4', '#caa588'], ['#f7c9cf', '#d99aa4'], ['#e9d3b8', '#c2a279']];
      const sk = pale[(seed | 0) % pale.length];
      x.fillStyle = sk[0]; x.beginPath(); x.ellipse(S * 0.5, S * 0.52, S * 0.34, S * 0.42, 0, 0, TAU); x.fill();
      x.strokeStyle = '#3a2a22'; x.lineWidth = 3; x.stroke();
      [-1, 1].forEach(d => { x.strokeStyle = '#2a2018'; x.lineWidth = 2.6;
        x.beginPath(); x.ellipse(S * 0.5 + d * S * 0.14, S * 0.46, S * 0.07, S * 0.05, 0, 0, TAU); x.stroke();
        x.fillStyle = '#2a2018'; x.beginPath(); x.arc(S * 0.5 + d * S * 0.14, S * 0.47, 2.6, 0, TAU); x.fill();
        x.beginPath(); x.moveTo(S * 0.5 + d * S * 0.22, S * 0.37); x.lineTo(S * 0.5 + d * S * 0.07, S * 0.40); x.stroke(); });
      x.strokeStyle = '#3a2a22'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(S * 0.5, S * 0.48); x.lineTo(S * 0.47, S * 0.60); x.lineTo(S * 0.52, S * 0.60); x.stroke();
      x.beginPath(); x.moveTo(S * 0.40, S * 0.70); x.quadraticCurveTo(S * 0.46, S * 0.67, S * 0.5, S * 0.70);
      x.quadraticCurveTo(S * 0.55, S * 0.73, S * 0.60, S * 0.69); x.stroke();
    }
    return c;
  }
  let pilots = [];
  function makePilots(n) {
    pilots = [];
    for (let i = 0; i < n; i++) {
      const kind = (i % 2 === 0) ? 'pepe' : 'wojak';
      const cv = pilotCanvas(kind, i * 7 + 1);
      pilots.push({ name: HANDLES[i % HANDLES.length], kind, url: cv.toDataURL(), num: i + 1 });
    }
    return pilots;
  }

  // ══ WAGER / LOBBY ══════════════════════════════════════════════════════════════════════════
  const wager = { ante: 50, cards: 2, players: 6, laps: 3, picked: [] };
  let alobby = null, cardEdge = 1;

  function initNet() {
    if (!window.RipNet) return;
    try {
      RipNet.join({ handle: myHandle(), cards: vault().length, balance: 0 });
      alobby = window.ArenaLobby ? ArenaLobby.mount('#arenaLobby', { mode: 'table', header: true }) : null;
      RipNet.setStatus('seeking');
      RipNet.onLobby(ps => { if (alobby) alobby.update(ps || []); refreshPot(); });
    } catch (e) {}
  }
  function buildGrid() {
    const own = ownedSlugs(), groups = new Map();
    own.forEach(sl => groups.set(sl, (groups.get(sl) || 0) + 1));
    const g = $('cardGrid'); if (!g) return;
    if (!groups.size) { g.innerHTML = ''; $('cardsInfo').innerHTML = '<a href="index.html" style="color:var(--lime)">no cards yet — rip a pack</a>'; refreshPot(); return; }
    g.innerHTML = [...groups.entries()].map(([sl, n]) => {
      const c = bySlug.get(sl); if (!c) return '';
      const on = wager.picked.filter(s => s === sl).length;
      return `<div class="tile${on ? ' sel' : ''}" data-slug="${sl}" style="--rc:var(${RC[c.rarity] || '--common'})"><span class="rr">${c.rarity}</span>${n > 1 ? `<span class="mult">×${n}</span>` : ''}<img src="cards/${c.art}" loading="lazy" onerror="this.style.opacity=.15"><div class="stk">${on ? '✓' + (on > 1 ? on : '') : ''}</div></div>`;
    }).join('');
    g.querySelectorAll('.tile').forEach(el => el.onclick = () => {
      const sl = el.dataset.slug;
      const have = own.filter(s => s === sl).length, on = wager.picked.filter(s => s === sl).length;
      if (on >= have || wager.picked.length >= wager.cards) wager.picked = wager.picked.filter(s => s !== sl);
      else wager.picked.push(sl);
      while (wager.picked.length > wager.cards) wager.picked.shift();
      buildGrid(); refreshPot();
    });
    if (window.CardHover) CardHover.bind(g, el => { const c = bySlug.get(el.dataset.slug); if (!c) return null;
      return { art: 'cards/' + c.art, title: c.title, rarity: c.rarity, atk: c.atk, def: c.def, trigger: c.trigger, color: `var(${RC[c.rarity] || '--common'})` }; });
    $('cardsInfo').textContent = `${own.length} owned · ${groups.size} kinds · ${wager.picked.length}/${wager.cards} in the pot`;
    refreshPot();
  }
  function refreshPot() {
    if (!$('anteVal')) return;
    $('anteVal').textContent = wager.ante; $('cardsVal').textContent = wager.cards; $('pickN').textContent = wager.cards;
    const tokPot = wager.ante * wager.players, cardPot = wager.cards * wager.players;
    const potBurn = Math.round(tokPot * WagerPayout.BURN_PCT), potNet = tokPot - potBurn;
    $('potLine').innerHTML = `POT · <b>${potNet.toLocaleString('en-US')}</b> $3030 + <span class="c">${cardPot}</span> cards <span style="opacity:.66;font-size:.85em">· 🔥${potBurn} burned · podium 50/30/20</span>`;
    const Wt = window.RipWallet, canReal = liveToken() && Wt && Wt.hasWallet(), enough = wager.picked.length === wager.cards;
    $('btnAnte').disabled = !(canReal && enough);
    const note = $('lobNote');
    if (!liveToken()) note.innerHTML = '$3030 isn’t live on this network yet — the race runs as a <b>practice</b> heat.';
    else if (!(Wt && Wt.hasWallet())) note.innerHTML = 'Connect a wallet (sign the ledger) to ante real $3030 and race the podium for keeps.';
    else if (!enough) note.innerHTML = `Pick <b>${wager.cards}</b> card${wager.cards > 1 ? 's' : ''} for the pot to ante for keeps.`;
    else note.innerHTML = 'Ante <b>' + wager.ante + ' $3030</b> — <b>🔥' + WagerPayout.rake(wager.ante) + '</b> burns now, the rest joins the pot · <b>podium 1st/2nd/3rd</b> splits it.';
  }

  // ══ HUD ═════════════════════════════════════════════════════════════════════════════════════
  let lastLap = -1;
  function toast(msg, ms) { const t = $('toast'); if (!t) return; t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 1300); }

  function hud(G) {
    const me = G.me, CR = window.CRGame, T = G.T;
    // countdown + launch band
    const cd = $('cd');
    if (G.countdown > 0) {
      cd.classList.remove('hidden');
      const c = Math.ceil(G.countdown - 0.2);
      $('cdB').textContent = c > 0 ? c : 'GO';
      $('revWrap').classList.remove('hidden');
      const q = clamp(me.rev / 1.6, 0, 1);
      $('revBar').style.width = (q * 100) + '%';
      // the green band is 0.55–1.0 of rev, i.e. 34%–63% of the bar; drawn, not described
      $('revBar').style.background = (me.rev >= 0.55 && me.rev <= 1.0) ? 'linear-gradient(90deg,#0fae56,#7dffb0)' : 'linear-gradient(90deg,#b05a1a,#ffb03b)';
    } else {
      if (!cd.classList.contains('hidden')) setTimeout(() => cd.classList.add('hidden'), 420);
      $('revWrap').classList.add('hidden');
    }
    $('spdN').textContent = Math.round(me.v * 4.6);              // u/s → a plausible km/h, one honest scale
    $('boostBar').style.width = (me.boostE * 100) + '%';
    $('boostBar').classList.toggle('spending', !!me.boosting);
    $('lapN').textContent = Math.min(G.laps, me.lap + 1);
    $('lapT').textContent = G.laps;
    $('placeN').textContent = me.place || 1;
    $('placeOf').textContent = '/ ' + G.racers.length;
    $('bestT').textContent = me.best ? me.best.toFixed(2) : '—';
    /* ── THE CORNER LAMP. Look ahead by the distance it takes to shed speed at the airbrake rate
     * and compare what is carried against the apex the racing line can hold. Amber = lift, red =
     * brake. This is exactly the calculation the bots run, shown to the player — which is the only
     * fair way to ship an AI that brakes on lookahead. */
    const look = 12 + (me.v * me.v) / (2 * CR.PACE.BRAKE);
    let limit = 999;
    for (let d = 4; d < look; d += 6) limit = Math.min(limit, CR.vmaxAt(T, me.s + d));
    const lamp = $('lamp');
    if (me.v > limit * 1.10) { lamp.className = 'lamp red'; lamp.textContent = 'BRAKE'; }
    else if (me.v > limit * 0.98) { lamp.className = 'lamp amb'; lamp.textContent = 'LIFT'; }
    else { lamp.className = 'lamp'; lamp.textContent = ''; }
    // slipstream + slide tells
    $('tellDraft').classList.toggle('on', me.draft > 0.15);
    $('tellSlide').classList.toggle('on', (me.slip || 0) > 0.08);
    if (G.order) $('posList').innerHTML = G.order.slice(0, 8).map((r, i) =>
      `<div class="r${r.isMe ? ' me' : ''}">${i + 1}. ${esc((pilots[r.i] || {}).name || ('P' + (r.i + 1)))}${r.done ? ' ✓' : ''}</div>`).join('');
    // events → toasts
    while (G.events.length) {
      const e = G.events.shift();
      if (e.kind === 'lap' && e.lap < G.laps) toast('LAP ' + (e.lap + 1) + ' · ' + e.time.toFixed(2) + 's', 1100);
      else if (e.kind === 'pad') toast('⚡ BOOST', 500);
      else if (e.kind === 'finish') toast('FINISH!', 1600);
    }
  }

  // ══ RESULT ══════════════════════════════════════════════════════════════════════════════════
  let done = false;
  function finish(G, real) {
    if (done) return; done = true;
    if (window.RipNet) { try { RipNet.setStatus('idle'); } catch (e) {} }
    const myRank = G.order.findIndex(r => r.isMe);
    const P = WagerPayout.compute(wager.ante, wager.players, wager.cards, myRank);
    const onPodium = P.myPlace >= 0;
    let wonSlugs = [];
    if (real && onPodium && P.myCards > 0) {
      let v = vault();
      const pool = wager.picked.concat([]).filter(sl => bySlug.has(sl));
      wonSlugs = pool.slice(0, P.myCards);
      while (wonSlugs.length < P.myCards) { const all = [...bySlug.keys()]; if (!all.length) break; wonSlugs.push(all[Math.floor(Math.random() * all.length)]); }
      wonSlugs.forEach(sl => { if (bySlug.has(sl)) v.push({ slug: sl }); });
      saveVault(v);
    }
    $('hud').classList.add('hidden');
    const first = onPodium && P.myPlace === 0;
    $('resTitle').textContent = first ? 'WINNER' : (onPodium ? 'PODIUM' : 'FINISH');
    $('resTag').textContent = onPodium ? (WagerPayout.ordinal(P.myPlace) + ' of ' + wager.players + ' pilots')
      : ('off the podium · ' + WagerPayout.ordinal(myRank) + ' of ' + wager.players);
    $('prizeBig').textContent = !real
      ? (onPodium ? ('★ ' + WagerPayout.ordinal(P.myPlace) + (first ? ' — TOP OF THE PODIUM' : ' — ON THE PODIUM')) : 'BETTER LUCK NEXT LAP')
      : (onPodium ? (WagerPayout.ordinal(P.myPlace) + ' · +' + P.myTok.toLocaleString('en-US') + ' $3030 · +' + wonSlugs.length + ' cards')
                  : ('off the podium · 🔥' + P.anteBurn + ' rake burned'));
    $('prizeSub').textContent = (G.me.best ? 'best lap ' + G.me.best.toFixed(2) + 's · ' : '') + (onPodium ? 'you took ' + WagerPayout.ordinal(P.myPlace) + ' place' : 'the pot went to the podium');
    $('board').innerHTML = G.order.map((r, i) =>
      `<div class="r${r.isMe ? ' me' : ''}"><span>${i + 1}. ${esc((pilots[r.i] || {}).name || ('P' + (r.i + 1)))}</span><span class="k">${r.done ? (r.finishT).toFixed(2) + 's' : (r.lap + 1) + '/' + G.laps}</span></div>`).join('');
    const wc = $('wonCards');
    wc.innerHTML = (onPodium && real && wonSlugs.length) ? wonSlugs.slice(0, 12).map(sl => {
      const c = bySlug.get(sl); if (!c) return '';
      return `<div class="tile" style="--rc:var(${RC[c.rarity] || '--common'})"><span class="rr">${c.rarity}</span><img src="cards/${c.art}" onerror="this.style.opacity=.15"></div>`;
    }).join('') : '';
    $('scaNote').innerHTML = real
      ? 'Your <b>🔥' + P.anteBurn + ' $3030</b> rake burned on-chain — permanent, deflationary. The rest of the pot + staked cards pay the <b>podium 1st/2nd/3rd (50/30/20)</b>; card winnings move for keeps in your vault. Real on-chain token-pot escrow ships with the <b>721 lens</b> — Phase-2.'
      : 'Practice race — no tokens burned, no cards moved. Ante up with a signed wallet to race the podium for keeps.';
    $('ovResult').classList.add('show');
    buildGrid();
  }

  function raceStarted(G, cfg) {
    done = false; lastLap = -1;
    makePilots(cfg.players);
    $('ovLobby').classList.remove('show'); $('ovResult').classList.remove('show'); $('hud').classList.remove('hidden');
    const img = $('pilotImg'); if (img) img.src = pilots[0].url;
    if (window.RipNet) { try { RipNet.setStatus('battling'); } catch (e) {} }
    if (window.GameHelp && GameHelp.isTouch) setTimeout(() => toast('◀ drag to steer · hold right to boost ▶', 2200), 700);
  }

  // ══ START ══════════════════════════════════════════════════════════════════════════════════
  function go(real) {
    cardEdge = 1;
    try {
      if (window.RipPowers && wager.picked.length) {
        const L = RipPowers.loadout(wager.picked.map(sl => bySlug.get(sl)).filter(Boolean), RipPowers.getMarket());
        cardEdge = 1 + Math.min(0.09, (L.mult || 1) - 1) * 0.4;
      }
    } catch (e) {}
    window.CRPC.startRace({ players: wager.players, laps: wager.laps, real, cardEdge });
  }
  async function ante(rematch) {
    const Wt = window.RipWallet;
    if (!(liveToken() && Wt && Wt.hasWallet())) { go(false); return; }
    if (wager.picked.length !== wager.cards) { toast('Pick ' + wager.cards + ' cards first'); return; }
    const btn = rematch ? $('btnRematch') : $('btnAnte'); const label = btn.innerHTML;
    btn.innerHTML = 'confirm burn…'; btn.disabled = true;
    const r = await Wt.payRake(WagerPayout.rake(wager.ante));
    btn.innerHTML = label; btn.disabled = false;
    if (!r.ok) { toast(Wt.explain ? Wt.explain(r.reason) : 'Burn failed'); return; }
    go(true);
  }
  const CONTROLS = [
    { type: 'drag', act: 'Steer', touch: 'Drag left / right', key: 'A D · ◀ ▶' },
    { type: 'hold', act: 'Boost', touch: 'Hold (right side)', key: 'W · ⇧' },
    { type: 'hold', act: 'Airbrake', touch: 'Hold (left of boost)', key: 'S · SPACE' },
  ];
  function practice() {
    if (window.GameHelp) GameHelp.show({ title: 'CLOUD RACER', kicker: 'take the inside line · earn your boost',
      controls: CONTROLS, startLabel: '▶ Start practice', onStart: () => go(false) });
    else go(false);
  }

  function mount() {
    if (!$('pChips')) return;
    $('pChips').innerHTML = [4, 6, 8].map(n => `<span class="pchip${n === wager.players ? ' on' : ''}" data-p="${n}">${n}</span>`).join('');
    $('lChips').innerHTML = [2, 3, 5].map(n => `<span class="lchip${n === wager.laps ? ' on' : ''}" data-l="${n}">${n}</span>`).join('');
    document.querySelectorAll('[data-ante]').forEach(b => b.onclick = () => { wager.ante = clamp(wager.ante + (+b.dataset.ante) * 25, 0, 500); refreshPot(); });
    document.querySelectorAll('[data-cards]').forEach(b => b.onclick = () => { wager.cards = clamp(wager.cards + (+b.dataset.cards), 1, 5); wager.picked = wager.picked.slice(0, wager.cards); buildGrid(); });
    $('pChips').querySelectorAll('.pchip').forEach(c => c.onclick = () => { wager.players = +c.dataset.p; $('pChips').querySelectorAll('.pchip').forEach(x => x.classList.toggle('on', x === c)); refreshPot(); });
    $('lChips').querySelectorAll('.lchip').forEach(c => c.onclick = () => { wager.laps = +c.dataset.l; $('lChips').querySelectorAll('.lchip').forEach(x => x.classList.toggle('on', x === c)); });
    $('btnPractice').onclick = practice;
    $('btnAnte').onclick = () => ante(false);
    $('btnRematch').onclick = () => { $('ovResult').classList.remove('show'); ante(true); };
    $('btnLobby').onclick = () => { $('ovResult').classList.remove('show'); $('ovLobby').classList.add('show'); if (window.RipNet) { try { RipNet.setStatus('seeking'); } catch (e) {} } };

    /* ── TOUCH: no buttons. Left thumb drags to steer, right thumb holds to boost, and the
     * airbrake is a second finger down on the left of the boost zone. Carried over because it
     * tested well, with one change: the airbrake used to be a double-tap, and the brake is now a
     * held control that matters in every corner — a double-tap cannot express "hold". */
    if (window.GameHelp && GameHelp.isTouch) {
      const t = window.CRPC.touch, cv = $('pcv');
      let steerId = null, steerX0 = 0;
      cv.addEventListener('touchstart', e => {
        for (const p of e.changedTouches) {
          if (p.clientX < innerWidth * 0.5) { if (steerId == null) { steerId = p.identifier; steerX0 = p.clientX; } }
          else if (p.clientX < innerWidth * 0.72) t.brake = true;
          else t.boost = true;
        }
      }, { passive: true });
      cv.addEventListener('touchmove', e => {
        for (const p of e.changedTouches) if (p.identifier === steerId) t.steer = clamp((p.clientX - steerX0) / 68, -1, 1);
      }, { passive: true });
      const end = e => { for (const p of e.changedTouches) {
        if (p.identifier === steerId) { steerId = null; t.steer = 0; }
        else if (p.clientX >= innerWidth * 0.72) t.boost = false;
        else if (p.clientX >= innerWidth * 0.5) t.brake = false; } };
      cv.addEventListener('touchend', end); cv.addEventListener('touchcancel', end);
    }
    loadDeck().then(() => { buildGrid(); initNet(); });
    if (window.RipWallet) { try { RipWallet.on(() => refreshPot()); } catch (e) {} }
  }

  window.CRUI = { mount, hud, finish, raceStarted, ready: mount, toast, wager, go };
  if (document.readyState !== 'loading') setTimeout(mount, 0); else addEventListener('DOMContentLoaded', mount);
})();

/* upperdeckripmaster3030 — Section 9 / PlayCanvas: lobby, HUD, audio, result (S9PCUI).
 *
 * Everything that is DOM or WebAudio rather than geometry. Ported from `section9.html` because
 * that file keeps its rules, its UI and its software renderer in one inline script and only two
 * of the three are wanted here — but the UI is the same UI on purpose: the wager, the seat doors,
 * the card grid and the podium payout are the parts a player is actually staking something on,
 * and an engine build that quietly used a different pot would be a different game.
 *
 *   const ui = S9PCUI.create();      // wires the lobby, loads the deck, owns the wager
 *   ui.attach(game);                 // hand it the S9Game instance once it exists
 *   ui.onStart = (real) => …         // DEPLOY / PRACTICE pressed
 *
 * Reused verbatim from the site: RipWallet · RipSession (the three seat doors) · WagerPayout ·
 * RipPowers (card→power) · RipSfx (recorded foley) · ArenaLobby · CardHover · GameHelp · RipNet.
 */
window.S9PCUI = (function () {
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rgb = c => 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  const rint = n => Math.floor(Math.random() * n);
  const shortName = n => { n = String(n || ''); return n.length > 13 ? n.slice(0, 12) + '…' : n; };

  function create() {
    const RC = { common: '--common', uncommon: '--uncommon', rare: '--rare', mythic: '--mythic', prizm: '--prizm' };
    const CFG = window.RIPMASTER_CHAIN || {};
    const liveToken = () => { try { const a = ((CFG.contracts || {}).liquidEdition) || ''; return /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0+$/.test(a); } catch (e) { return false; } };

    let DECK = [], bySlug = new Map();
    const vault = () => { try { return JSON.parse(localStorage.getItem('urm_vault') || '[]'); } catch (e) { return []; } };
    const saveVault = v => { try { localStorage.setItem('urm_vault', JSON.stringify(v.slice(-400))); } catch (e) {} };
    const ownedSlugs = () => vault().map(e => e && e.slug).filter(s => s && bySlug.has(s));

    // ── audio: the same oscillator kit (guns, hits, feedback) + RipSfx for the recorded foley ──
    let AC = null, sfxOn = true, musicOn = true;
    const ac = () => AC || (AC = new (window.AudioContext || window.webkitAudioContext)());
    function tone(f0, f1, dur, type, vol) { if (!sfxOn) return; type = type || 'square'; vol = vol == null ? 0.14 : vol;
      try { const a = ac(), o = a.createOscillator(), g = a.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, a.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(28, f1), a.currentTime + dur);
        g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
        o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur); } catch (e) {} }
    function noise(dur, vol, lp) { if (!sfxOn) return; vol = vol == null ? 0.3 : vol;
      try { const a = ac(), n = a.createBufferSource(), b = a.createBuffer(1, Math.max(1, a.sampleRate * dur), a.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        n.buffer = b; const g = a.createGain(); g.gain.value = vol;
        let node = n; if (lp) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); node = f; }
        node.connect(g).connect(a.destination); n.start(); } catch (e) {} }
    const SFX = {
      pistol() { noise(0.06, 0.16, 2600); tone(430, 150, 0.09, 'square', 0.10); },
      smg() { noise(0.04, 0.11, 3000); tone(360, 180, 0.05, 'square', 0.07); },
      shotgun() { noise(0.16, 0.34, 1400); tone(180, 60, 0.18, 'sawtooth', 0.16); },
      sniper() { noise(0.10, 0.30, 1800); tone(760, 120, 0.22, 'sawtooth', 0.16); tone(1400, 300, 0.10, 'square', 0.08); },
      empty() { tone(180, 140, 0.05, 'square', 0.05); },
      reload() { tone(300, 300, 0.04, 'square', 0.08); setTimeout(() => tone(520, 520, 0.04, 'square', 0.08), 120); setTimeout(() => noise(0.05, 0.1, 2000), 240); },
      hit() { tone(1500, 900, 0.05, 'square', 0.12); },
      headshot() { tone(2000, 1200, 0.06, 'square', 0.14); setTimeout(() => tone(1200, 700, 0.05, 'square', 0.1), 40); },
      hurt() { noise(0.12, 0.18, 900); tone(200, 80, 0.14, 'sawtooth', 0.1); },
      /* Supersonic crack — the sound a round makes going PAST you, not the sound of the gun.
       * Closer misses are louder and sharper; that is the only cue that says "that nearly had you". */
      crack(d) { const n = clamp(1 - (d || 0) / 2.2, 0.1, 1);
        noise(0.02 + 0.02 * n, 0.10 * n + 0.04, 5200 - 1400 * (1 - n));
        tone(1900 + 900 * n, 300, 0.05, 'square', 0.05 * n); },
      frag() { [660, 880, 1180].forEach((f, i) => setTimeout(() => tone(f, f, 0.11, 'triangle', 0.12), i * 70)); },
      down() { noise(0.4, 0.34, 700); tone(160, 40, 0.5, 'sawtooth', 0.16); },
      spawn() { tone(300, 900, 0.16, 'sine', 0.1); },
      step() { if (Math.random() < 0.5) noise(0.03, 0.05, 700); },
      win() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, f, 0.16, 'triangle', 0.13), i * 130)); },
      pickup() { tone(600, 1200, 0.1, 'square', 0.1); },
      jump() { noise(0.05, 0.07, 1400); tone(320, 540, 0.09, 'sine', 0.05); },
      land() { noise(0.13, 0.26, 650); tone(150, 55, 0.15, 'sine', 0.13); },
      impact() { noise(0.05, 0.14, 2200); tone(240, 120, 0.05, 'square', 0.05); },
      ricochet() { tone(2500, 900, 0.15, 'sawtooth', 0.06); setTimeout(() => tone(1700, 650, 0.1, 'square', 0.04), 30); },
    };
    const music = $('s9Music');
    function playMusic() { if (!musicOn) return; try { music.volume = 0.45; const p = music.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    function powMsg(t, col) { const el = $('powMsg'); if (!el) return; el.textContent = t; el.style.color = col || '';
      el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }

    // ── net roster + seats ──────────────────────────────────────────────────────────────────
    let roster = [];
    const myHandle = () => { try { return (window.RipNet && RipNet.me && RipNet.me().handle) || localStorage.getItem('urm_net_handle') || 'you'; } catch (e) { return 'you'; } };
    if (window.RipNet) { try {
      RipNet.join({ handle: (localStorage.getItem('urm_net_handle') || 'you'), cards: vault().length, balance: 0 });
      const alobby = window.ArenaLobby ? ArenaLobby.mount('#arenaLobby', { mode: 'table', header: true }) : null;
      // Seats: holder / collector / visitor all land in this one lobby (js/session.js). Practice
      // stays open to everyone — a seat is what lets you be matched against PEOPLE.
      if (window.RipSession) RipSession.mountBadge('seatBox');
      RipNet.setStatus('seeking');
      RipNet.onLobby(ps => { roster = (ps || []).filter(p => !p.me); if (alobby) alobby.update(ps || []); refreshPot(); });
    } catch (e) {} }

    // ── wager state ─────────────────────────────────────────────────────────────────────────
    const W_ANTE = { min: 0, max: 500, step: 25 }, W_CARDS = { min: 1, max: 5 };
    /* ⚠ DERIVED, not typed. This was `['pistol', 'ak', 'shotgun', 'sniper']` — a second, private
     * copy of the weapon table, which is exactly why the lobby still offered an "AK" after the
     * weapons had been renamed everywhere else. One list, one source: S9Game.WEAPONS. */
    const LOADOUTS = (window.S9Game && S9Game.WEAPONS)
      ? S9Game.WEAPONS.map(w => w.name)
      : ['pistol', 'smg', 'shotgun', 'sniper'];
    const wager = { ante: 50, cards: 2, players: 4, picked: [], loadout: 1 };
    let arenaPick = -1, MAPS = [], quality = null;
    const API = { wager, onStart: null, onAbort: null, onQuality: null };

    $('pChips').innerHTML = [2, 3, 4, 5, 6, 7, 8].map(n => `<span class="pchip${n === wager.players ? ' on' : ''}" data-p="${n}">${n}</span>`).join('');
    $('lChips').innerHTML = LOADOUTS.map((w, i) => `<span class="lchip${i === wager.loadout ? ' on' : ''}" data-l="${i}">${w}</span>`).join('');

    function buildGrid() {
      const own = ownedSlugs(); const groups = new Map();
      own.forEach(sl => groups.set(sl, (groups.get(sl) || 0) + 1));
      const g = $('cardGrid');
      if (!groups.size) { g.innerHTML = ''; $('cardsInfo').innerHTML = '<a href="index.html" style="color:var(--lime)">no cards yet — rip a pack</a>'; refreshPot(); return; }
      g.innerHTML = [...groups.entries()].map(([sl, n]) => { const c = bySlug.get(sl); if (!c) return '';
        const on = wager.picked.filter(s => s === sl).length;
        return `<div class="tile${on ? ' sel' : ''}" data-slug="${sl}" style="--rc:var(${RC[c.rarity] || '--common'})">
          <span class="rr">${c.rarity}</span>${n > 1 ? `<span class="mult">×${n}</span>` : ''}
          <img src="cards/${c.art}" alt="${esc(c.title)}" loading="lazy" onerror="this.style.opacity=.15">
          <div class="stk">✓${on > 1 ? on : ''}</div></div>`; }).join('');
      g.querySelectorAll('.tile').forEach(el => el.onclick = () => { const sl = el.dataset.slug;
        const have = own.filter(s => s === sl).length, on = wager.picked.filter(s => s === sl).length;
        if (on >= have || wager.picked.length >= wager.cards) wager.picked = wager.picked.filter(s => s !== sl);
        else wager.picked.push(sl);
        while (wager.picked.length > wager.cards) wager.picked.shift();
        buildGrid(); refreshPot(); });
      if (window.CardHover) CardHover.bind(g, el => { const c = bySlug.get(el.dataset.slug); if (!c) return null;
        return { art: 'cards/' + c.art, title: c.title, rarity: c.rarity, atk: c.atk, def: c.def, trigger: c.trigger, color: `var(${RC[c.rarity] || '--common'})` }; });
      let info = `${own.length} owned · ${groups.size} kinds · ${wager.picked.length}/${wager.cards} in the pot`;
      try { if (window.RipPowers && wager.picked.length) {
        const L = RipPowers.loadout(wager.picked.map(sl => bySlug.get(sl)).filter(Boolean), RipPowers.getMarket()); info += ' · ' + L.summary; } } catch (e) {}
      $('cardsInfo').textContent = info;
      refreshPot();
    }
    function refreshPot() {
      $('anteVal').textContent = wager.ante; $('cardsVal').textContent = wager.cards; $('pickN').textContent = wager.cards;
      const tokPot = wager.ante * wager.players, cardPot = wager.cards * wager.players;
      const potBurn = Math.round(tokPot * WagerPayout.BURN_PCT), potNet = tokPot - potBurn;
      $('potLine').innerHTML = `POT · <b>${potNet.toLocaleString('en-US')}</b> $3030 + <span class="c">${cardPot}</span> cards <span style="opacity:.66;font-size:.85em">· 🔥${potBurn} burned · podium 50/30/20</span>`;
      const others = othersFor(wager.players);
      $('roster').innerHTML = 'in the match: <span class="v">◈ ' + esc(myHandle()) + '</span> · ' + others.map(o => (o.v ? '⚜ ' : '') + esc(o.h)).join(' · ');
      const Wt = window.RipWallet, canReal = liveToken() && Wt && Wt.hasWallet();
      const enough = wager.picked.length === wager.cards;
      $('btnAnte').disabled = !(canReal && enough);
      const note = $('lobNote');
      if (!liveToken()) note.innerHTML = '$3030 isn’t live on this network yet — the wager runs as a <b>practice</b> deployment.';
      else if (!(Wt && Wt.hasWallet())) note.innerHTML = 'Connect a wallet (sign the ledger) to ante real $3030 and stake cards for keeps.';
      else if (!enough) note.innerHTML = `Pick <b>${wager.cards}</b> card${wager.cards > 1 ? 's' : ''} for the pot to ante for keeps.`;
      else note.innerHTML = 'Ante <b>' + wager.ante + ' $3030</b> — <b>🔥' + WagerPayout.rake(wager.ante) + '</b> burns now, the rest joins the pot · your <b>' + wager.cards + '</b> cards stake in · <b>podium 1st/2nd/3rd</b> splits it.';
    }
    function othersFor(n) {
      const others = [], seen = new Set([myHandle()]);
      (roster || []).forEach(p => { if (others.length < n - 1 && !seen.has(p.handle)) { seen.add(p.handle); others.push({ h: p.handle, v: !!p.verified }); } });
      let hi = 0; const H = S9Game.HANDLES;
      while (others.length < n - 1) { let h; do { h = H[(hi++) % H.length]; } while (seen.has(h) && seen.size < H.length); seen.add(h); others.push({ h, v: false }); }
      return others;
    }
    $('pChips').querySelectorAll('.pchip').forEach(el => el.onclick = () => { wager.players = +el.dataset.p;
      $('pChips').querySelectorAll('.pchip').forEach(c => c.classList.toggle('on', c === el)); refreshPot(); });
    $('lChips').querySelectorAll('.lchip').forEach(el => el.onclick = () => { wager.loadout = +el.dataset.l;
      $('lChips').querySelectorAll('.lchip').forEach(c => c.classList.toggle('on', c === el)); });
    document.querySelectorAll('[data-ante]').forEach(b => b.onclick = () => { wager.ante = clamp(wager.ante + (+b.dataset.ante) * W_ANTE.step, W_ANTE.min, W_ANTE.max); refreshPot(); });
    document.querySelectorAll('[data-cards]').forEach(b => b.onclick = () => { wager.cards = clamp(wager.cards + (+b.dataset.cards), W_CARDS.min, W_CARDS.max);
      while (wager.picked.length > wager.cards) wager.picked.pop(); buildGrid(); });

    // ── arena + quality chips ───────────────────────────────────────────────────────────────
    try { const s = localStorage.getItem('s9pc_map'); if (s != null) arenaPick = +s; } catch (e) {}
    try { const q = new URLSearchParams(location.search).get('map'); if (q != null) arenaPick = +q; } catch (e) {}
    function paintArenaChips() {
      const el = $('mChips'); if (!el) return;
      el.innerHTML = [{ i: -1, n: 'rotate' }].concat(MAPS.map((m, i) => ({ i, n: m.name })))
        .map(o => `<span class="lchip${o.i === arenaPick ? ' on' : ''}" data-m="${o.i}">${o.n}</span>`).join('');
      el.querySelectorAll('.lchip').forEach(c => c.onclick = () => { arenaPick = +c.dataset.m;
        try { if (arenaPick < 0) localStorage.removeItem('s9pc_map'); else localStorage.setItem('s9pc_map', arenaPick); } catch (e) {}
        paintArenaChips(); });
    }
    function paintQualityChips(cur, auto) {
      const el = $('qChips'); if (!el) return; quality = cur;
      const opts = [['low', 'low'], ['mid', 'mid'], ['high', 'high']];
      el.innerHTML = opts.map(([k, n]) => `<span class="lchip${k === cur ? ' on' : ''}" data-q="${k}">${n}${k === auto ? ' ·auto' : ''}</span>`).join('');
      el.querySelectorAll('.lchip').forEach(c => c.onclick = () => { const q = c.dataset.q;
        try { localStorage.setItem('s9pc_q', q); } catch (e) {}
        if (API.onQuality) API.onQuality(q); paintQualityChips(q, auto); });
    }
    const S9PC_BUILD = '2026-07-31a';
    function paintBuildNote(extra) {
      const el = $('buildNote'); if (el) el.textContent = `pc ${S9PC_BUILD} · ${MAPS.length} arenas` + (extra ? ' · ' + extra : '');
    }

    // ── HUD ─────────────────────────────────────────────────────────────────────────────────
    let game = null;
    function attach(g) { game = g; MAPS = g.MAPS; paintArenaChips(); paintBuildNote(); }
    function setMaps(list) { MAPS = list; paintArenaChips(); paintBuildNote(); }
    function buildWeapSlots() {
      const W = S9Game.WEAPONS;
      /* ⚠ was `w.key === 'smg' ? 'ak' : w.key` — a display-time substitution that renamed the
       * weapon to a real-world designation in the HUD only, so the slot said one thing and the
       * name plate said another. The KEY is the honest label here: it is the category. */
      $('weapSlots').innerHTML = W.map((w, i) => `<span class="wslot" data-w="${i}">${i + 1}·${w.key}</span>`).join('');
      $('weapSlots').querySelectorAll('.wslot').forEach(el => { el.onclick = () => game && game.switchWeapon(+el.dataset.w);
        el.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { e.preventDefault(); game && game.switchWeapon(+el.dataset.w); } }); });
    }
    /* ── the staked card, pinned to the frame ────────────────────────────────────────────────
     * `G.myCards` are the card objects that armed this operative. The image and title are
     * written ONCE per match (tracked by slug, because an <img src> reassigned every frame
     * re-decodes and flickers); the power line is rewritten only when its text actually
     * changes, which it does whenever the market moves under RipPowers.pollMarket.
     * Fails quiet: no cards, no manifest, a missing element ⇒ the stamp simply stays hidden. */
    let hcSlug = null, hcPw = '', hcHot = false;
    function paintHudCard() {
      const box = $('hudCard'); if (!box) return;
      const G = game && game.G, cards = (G && G.myCards) || [];
      const c = cards[0];
      if (!c) { box.hidden = true; hcSlug = null; return; }
      box.hidden = false;
      if (c.slug !== hcSlug) {
        hcSlug = c.slug;
        box.style.setProperty('--rc', `var(${RC[c.rarity] || '--common'})`);
        $('hudCardArt').src = 'cards/' + c.art;
        $('hudCardTitle').textContent = c.title || c.slug;
        const n = $('hudCardN'); n.textContent = cards.length > 1 ? '×' + cards.length : '';
        n.style.display = cards.length > 1 ? '' : 'none';
      }
      const L = G.loadout;
      const txt = L ? '<b>' + esc(L.summary.replace(/^◈\s*/, '')) + '</b>' : 'unarmed';
      if (txt !== hcPw) { hcPw = txt; $('hudCardPw').innerHTML = txt; }
      const hot = !!(G.me && G.me.surgeT > 0);
      if (hot !== hcHot) { hcHot = hot; box.classList.toggle('hot', hot); }
    }

    function hud() {
      if (!game) return; const G = game.G, e = G.me; if (!e) return;
      paintHudCard();
      const W = S9Game.WEAPONS;
      $('hpNum').textContent = Math.max(0, Math.ceil(e.hp)); $('hpFill').style.width = clamp(e.hp / e.maxHp * 100, 0, 100) + '%';
      $('arNum').textContent = Math.max(0, Math.ceil(e.armor)); $('arFill').style.width = clamp(e.armor / e.maxArmor * 100, 0, 100) + '%';
      $('boFill').style.width = clamp(e.boost * 100, 0, 100) + '%';
      const amp = game.mktAmp(), mk = $('hMkt');
      if (mk) { mk.textContent = (e.surgeT > 0 ? '★ OVERCHARGE ' + e.surgeT.toFixed(1) + 's' : '◈ market ×' + amp.toFixed(2) + (amp > 1.25 ? ' · HOT' : amp < 0.95 ? ' · cold' : ''));
        mk.style.color = e.surgeT > 0 ? '#ffd23b' : (amp > 1.25 ? '#ff2ad9' : '#59e0ff'); }
      const w = W[e.weapon]; $('magNum').textContent = e.reloading ? '…' : e.mag; $('resNum').textContent = '/ ∞'; $('weapName').textContent = w.name;
      $('weapSlots').querySelectorAll('.wslot').forEach(el => { const on = +el.dataset.w === e.weapon; el.classList.toggle('on', on); el.classList.toggle('rl', on && e.reloading); });
      $('fMe').textContent = e.kills;
      let lead = G.ents[0]; for (const o of G.ents) if (o.kills > lead.kills) lead = o;
      $('leadName').textContent = lead.isMe ? 'YOU' : shortName(lead.name); $('leadNum').textContent = lead.kills;
      $('aliveN').textContent = G.ents.filter(o => o.alive).length;
      const tl = Math.max(0, G.timeLeft); $('hTimer').textContent = Math.floor(tl / 60) + ':' + String(Math.floor(tl % 60)).padStart(2, '0');
      $('hTimer').style.color = tl < 20 ? '#ff6b57' : '';
      $('killfeed').innerHTML = G.kills.map(k => `<div class="kf${k.me ? ' me' : ''}">${k.k ? ('<b>' + esc(shortName(k.k)) + '</b>') : '<span style="color:#8fa">☠</span>'} ${k.head ? '<span class="hs">◎</span>' : '▸'} <span class="v">${esc(shortName(k.v))}</span></div>`).join('');
      const cm = $('comms');
      if (cm) cm.innerHTML = (G.comms || []).map(c => `<div class="cm" style="opacity:${(0.3 + 0.5 * clamp(c.t / 3.4, 0, 1)).toFixed(2)}"><b style="color:${rgb(c.tint)}">${esc(c.n)}</b> · ${esc(c.s)}</div>`).join('');
      $('dmgVig').style.opacity = (G.dmgFlash * 0.8).toFixed(3);
    }
    function showMatchChrome(on) {
      ['hudTL', 'hudTR', 'hudBL', 'hudBR'].forEach(id => $(id).style.display = on ? 'block' : 'none');
      $('killfeed').style.display = on ? 'flex' : 'none'; $('comms').style.display = on ? 'flex' : 'none';
      /* #controls is NOT touched here any more — the legend lives inside the loading screen and
       * appears and disappears with it. A permanent key legend across the bottom of a shooter is
       * an obstruction, not a help. */
      $('toggles').style.display = on ? 'flex' : 'none';
      if (!on) { $('dmgVig').style.opacity = 0; const hc = $('hudCard'); if (hc) hc.hidden = true; hcSlug = null; }
    }

    // ── result / payout ─────────────────────────────────────────────────────────────────────
    function result() {
      const G = game.G;
      try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
      music.pause();
      if (window.RipNet) { try { RipNet.setStatus('idle'); } catch (e) {} }
      const ranked = G.ents.slice().sort((a, b) => (b.kills - a.kills) || (a.deaths - b.deaths));
      const winner = ranked[0], iWon = winner && winner.isMe;
      const myRank = ranked.findIndex(e => e.isMe);
      const P = WagerPayout.compute(wager.ante, wager.players, wager.cards, myRank);
      const onPodium = P.myPlace >= 0;
      let wonSlugs = [];
      if (G.real && onPodium && P.myCards > 0) { const v = vault();
        const pool = G.myStake.concat([].concat(...G.oppStakes)).filter(sl => bySlug.has(sl));
        wonSlugs = pool.slice(0, P.myCards);
        while (wonSlugs.length < P.myCards) { const all = [...bySlug.keys()]; if (!all.length) break; wonSlugs.push(all[rint(all.length)]); }
        wonSlugs.forEach(sl => { if (bySlug.has(sl)) v.push({ slug: sl }); }); saveVault(v); }
      showMatchChrome(false);
      const box = $('prizeBox'); box.classList.toggle('lose', !onPodium);
      $('resTitle').textContent = iWon ? 'VICTORY' : (onPodium ? 'PODIUM' : 'DOWNED');
      $('resTitle').style.background = onPodium ? '' : 'linear-gradient(180deg,#fff,#ff6b57 55%,#c22)';
      $('resTitle').style.webkitBackgroundClip = 'text'; $('resTitle').style.backgroundClip = 'text';
      $('resTag').textContent = onPodium ? (WagerPayout.ordinal(P.myPlace) + ' place · ' + (G.me ? G.me.kills : 0) + ' frags')
        : ('off the podium · out-fragged by ' + shortName((winner && winner.name) || 'the field'));
      if (!G.real) $('prizeBig').textContent = iWon ? '★ TOP OF THE PODIUM' : (onPodium ? ('★ ' + WagerPayout.ordinal(P.myPlace) + ' — ON THE PODIUM') : 'BETTER LUCK NEXT DROP');
      else $('prizeBig').textContent = onPodium ? (WagerPayout.ordinal(P.myPlace) + ' · +' + P.myTok.toLocaleString('en-US') + ' $3030 · +' + wonSlugs.length + ' cards')
        : ('off the podium · 🔥' + P.anteBurn + ' rake burned');
      $('prizeSub').textContent = onPodium ? ('you placed ' + WagerPayout.ordinal(P.myPlace) + ' of ' + wager.players + ' · ' + (G.me ? G.me.kills : 0) + ' frags / ' + (G.me ? G.me.deaths : 0) + ' downs')
        : ('winner: ' + shortName((winner && winner.name) || '—') + ' · you: ' + (G.me ? G.me.kills : 0) + ' frags');
      $('scoreboard').innerHTML = ranked.slice(0, 8).map((e, i) => `<div class="r${e.isMe ? ' me' : ''}"><span>${i + 1}. ${(e.verified ? '⚜ ' : '')}${esc(e.isMe ? 'YOU' : shortName(e.name))}</span><span><span class="k">${e.kills}</span> frags · ${e.deaths} downs</span></div>`).join('');
      $('scaNote').innerHTML = G.real
        ? 'Your <b>🔥' + P.anteBurn + ' $3030</b> rake burned on-chain — permanent, deflationary. The rest of the pot + staked cards pay the <b>podium 1st/2nd/3rd (50/30/20)</b>; card winnings move for keeps in your local vault. Trustless on-chain token-pot escrow (real podium payout) ships with the <b>721 lens</b> — Phase-2.'
        : 'Practice deployment — no tokens burned, no cards moved. Ante up with a signed wallet to play the podium for keeps.';
      if (iWon) SFX.win(); else SFX.down();
      $('ovResult').classList.add('show'); buildGrid();
    }

    // ── buttons ─────────────────────────────────────────────────────────────────────────────
    function toast(msg) { let t = $('s9Toast'); if (!t) { t = document.createElement('div'); t.id = 's9Toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:30;background:rgba(3,10,14,.95);border:1px solid #0f5c33;border-radius:10px;padding:10px 16px;font-size:12px;color:#d9ffe9;max-width:80vw;text-align:center'; document.body.appendChild(t); }
      t.textContent = msg; t.style.opacity = '1'; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.opacity = '0', 3000); }

    function begin(real) {
      $('ovLobby').classList.remove('show'); $('ovResult').classList.remove('show'); $('ovPause').classList.remove('show');
      showMatchChrome(true); buildWeapSlots();
      if (window.RipNet) { try { RipNet.setStatus('battling'); } catch (e) {} }
      playMusic(); SFX.spawn();
      if (API.onStart) API.onStart(real, arenaPick, roster, { list: DECK, bySlug });
    }
    $('btnPractice').onclick = () => {
      if (window.GameHelp) GameHelp.show({ title: 'SECTION 9 · ENGINE BUILD', kicker: 'tactical deathmatch', onStart: () => begin(false), controls: [
        { type: 'stick', act: 'Move', touch: 'Left stick · full tilt = run', key: 'W A S D · ⇧ run' },
        { type: 'aim', act: 'Look', touch: 'Right ½ · drag', key: 'Mouse' },
        { type: 'hold', act: 'Fire', touch: 'Hold FIRE', key: 'LMB' },
        { type: 'aim', act: 'Aim (ADS)', touch: '2 fingers · right', key: 'RMB' },
        { type: 'dtap', act: 'Reload', touch: 'Auto · or dbl-tap FIRE', key: 'R' },
        { type: 'tap', act: 'Jump', touch: 'JUMP button', key: 'SPACE' },
        { type: 'hold', act: 'Crouch', touch: 'CROUCH button', key: 'CTRL · C' }] });
      else begin(false);
    };
    $('btnAnte').onclick = async () => {
      const Wt = window.RipWallet;
      if (!(liveToken() && Wt && Wt.hasWallet())) { begin(false); return; }
      if (wager.picked.length !== wager.cards) { toast('Pick ' + wager.cards + ' cards for the pot first.'); return; }
      const btn = $('btnAnte'), label = btn.innerHTML; btn.innerHTML = 'confirm burn…'; btn.disabled = true;
      const r = await Wt.payRake(WagerPayout.rake(wager.ante));   // the rake leaves the pot in one atomic call: half burns, half funds the studio (PackSink)
      btn.innerHTML = label; btn.disabled = false;
      if (!r.ok) { toast(Wt.explain ? Wt.explain(r.reason) : 'Burn failed.'); return; }
      begin(true);
    };
    $('btnLobby').onclick = () => { $('ovResult').classList.remove('show'); $('ovLobby').classList.add('show');
      if (game) game.G.mode = 'lobby'; if (window.RipNet) { try { RipNet.setStatus('seeking'); } catch (e) {} } };
    $('btnAbort').onclick = () => { if (game) { game.G.mode = 'lobby'; game.G.over = true; }
      $('ovPause').classList.remove('show'); showMatchChrome(false); $('ovLobby').classList.add('show'); music.pause();
      if (window.RipNet) { try { RipNet.setStatus('seeking'); } catch (e) {} }
      if (API.onAbort) API.onAbort(); };

    function toggleSfx() { sfxOn = !sfxOn; $('tgSfx').classList.toggle('off', !sfxOn); $('tgSfx').textContent = sfxOn ? '🔊 sfx' : '🔇 sfx'; }
    function toggleMusic() { musicOn = !musicOn; $('tgMusic').classList.toggle('off', !musicOn); if (musicOn && game && game.G.mode === 'play') playMusic(); else music.pause(); }
    $('tgSfx').onclick = toggleSfx; $('tgMusic').onclick = toggleMusic;

    // ── deck ────────────────────────────────────────────────────────────────────────────────
    function loadDeck() {
      return fetch('cards/manifest.json').then(r => r.json()).then(m => { DECK = (m.cards || []); bySlug = new Map(DECK.map(c => [c.slug, c])); buildGrid(); })
        .catch(() => { $('cardsInfo').textContent = 'deck manifest missing — rip a pack first'; });
    }
    loadDeck().then(refreshPot);
    if (window.RipPowers) { RipPowers.pollMarket().then(() => { if (!game || game.G.mode === 'lobby') buildGrid(); });
      setInterval(() => { RipPowers.pollMarket().then(() => { if (!game || game.G.mode === 'lobby') buildGrid(); }); }, 45000); }
    if (window.RipTavern) { try { RipTavern.mount('#tavern'); } catch (e) {} }
    if (window.RipWallet) window.RipWallet.on(() => refreshPot());

    Object.assign(API, {
      sfx: SFX, powMsg, sfxOn: () => sfxOn, music, playMusic, toggleSfx, toggleMusic,
      myHandle, vault, saveVault, ownedSlugs, toast,
      begin, attach, setMaps, paintArenaChips, paintBuildNote, paintQualityChips, hud, result, showMatchChrome, buildGrid, refreshPot,
      get deck() { return { list: DECK, bySlug }; },
      get arenaPick() { return arenaPick; },
      get roster() { return roster; },
      BUILD: S9PC_BUILD,
    });
    return API;
  }

  return { create };
})();

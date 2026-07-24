/* CLOUD RACER — game logic. Anti-grav meme pod racer through clouds.
   Track + physics + AI + procedural pepe/wojak pilots + wager (rake burn + podium). */
(() => {
  const $ = id => document.getElementById(id);
  const TAU = Math.PI * 2, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const mul = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)];
  function rotAxis(v, ax, ang) { const c = Math.cos(ang), s = Math.sin(ang), d = ax[0]*v[0]+ax[1]*v[1]+ax[2]*v[2];
    const cr = cross(ax, v); return [v[0]*c+cr[0]*s+ax[0]*d*(1-c), v[1]*c+cr[1]*s+ax[1]*d*(1-c), v[2]*c+cr[2]*s+ax[2]*d*(1-c)]; }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const RC = { common:'--common', uncommon:'--uncommon', rare:'--rare', mythic:'--mythic', prizm:'--prizm' };
  const HANDLES = ['SmugFrog','DoomerX','FeelsBad','GreenPill','Wojak77','RareByte','KermitK','ApuAtorde','GigaBid','NPCsees','CopePod','Seethe9','HighHopes','BogPilot','ClownWrld','ChadThrust'];

  // ── deck / vault ──
  let DECK = [], bySlug = new Map();
  const vault = () => { try { return JSON.parse(localStorage.getItem('urm_vault') || '[]'); } catch { return []; } };
  const saveVault = v => { try { localStorage.setItem('urm_vault', JSON.stringify(v.slice(-200))); } catch {} };
  const ownedSlugs = () => vault().map(e => e && e.slug).filter(s => bySlug.has(s));
  const liveToken = () => { try { return window.RipWallet && RipWallet.isLive(); } catch { return false; } };
  const myHandle = () => { try { return (window.RipNet && RipNet.me && RipNet.me().handle) || localStorage.getItem('urm_net_handle') || 'you'; } catch { return 'you'; } };
  function loadDeck() {
    return fetch('cards/manifest.json').then(r => r.json()).then(m => { DECK = m.cards || []; bySlug = new Map(DECK.map(c => [c.slug, c])); }).catch(() => {});
  }

  // ═════════ PROCEDURAL MEME PILOTS (pepe / wojak) ═════════
  function pilotCanvas(kind, seed) {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    const R = (a, b) => a + ((Math.sin(seed * 12.9898 + a * 78.233) * 43758.5453) % 1 + 1) % 1 * (b - a);
    if (kind === 'pepe') {
      const skins = [['#5fa544','#4a8535'], ['#8fd35a','#6ea63f'], ['#d9b23a','#b0872a'], ['#4aa0c8','#3a7fa0'], ['#c85a5a','#a03f3f']];
      const sk = skins[(seed | 0) % skins.length];
      // head
      x.fillStyle = sk[0]; x.beginPath(); x.ellipse(S*0.5, S*0.56, S*0.42, S*0.40, 0, 0, TAU); x.fill();
      x.fillStyle = sk[1]; x.beginPath(); x.ellipse(S*0.5, S*0.72, S*0.40, S*0.24, 0, 0, TAU); x.fill();     // chin/jaw
      // eyes (big, top, smug side-glance)
      const ey = S*0.36, ex = S*0.20, er = S*0.15;
      [[-1,'#fff'],[1,'#fff']].forEach(([d]) => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(S*0.5+d*ex, ey, er, er*1.05, 0, 0, TAU); x.fill();
        x.strokeStyle = sk[1]; x.lineWidth = 3; x.stroke();
        x.fillStyle = '#111'; x.beginPath(); x.arc(S*0.5+d*ex+er*0.35, ey+er*0.15, er*0.42, 0, TAU); x.fill(); });
      // smug eyelids
      x.fillStyle = sk[0]; x.beginPath(); x.moveTo(S*0.5-ex-er, ey-er*0.4); x.quadraticCurveTo(S*0.5, ey-er*1.2, S*0.5+ex+er, ey-er*0.4); x.lineTo(S*0.5+ex+er, ey-er*1.6); x.lineTo(S*0.5-ex-er, ey-er*1.6); x.fill();
      // wide frog mouth (smug smirk)
      x.strokeStyle = '#6b3b3b'; x.lineWidth = 4; x.beginPath(); x.moveTo(S*0.22, S*0.70); x.quadraticCurveTo(S*0.5, S*0.80, S*0.80, S*0.66); x.stroke();
      x.fillStyle = '#b56b6b'; x.beginPath(); x.moveTo(S*0.24, S*0.71); x.quadraticCurveTo(S*0.5, S*0.79, S*0.78, S*0.67); x.quadraticCurveTo(S*0.5, S*0.75, S*0.24, S*0.71); x.fill();
      // nostrils
      x.fillStyle = sk[1]; x.beginPath(); x.arc(S*0.44, S*0.585, 2.4, 0, TAU); x.arc(S*0.56, S*0.585, 2.4, 0, TAU); x.fill();
    } else {
      const pale = [['#f0d9c4','#caa588'], ['#f7c9cf','#d99aa4'], ['#e9d3b8','#c2a279']];
      const sk = pale[(seed | 0) % pale.length];
      x.fillStyle = sk[0]; x.beginPath(); x.ellipse(S*0.5, S*0.52, S*0.34, S*0.42, 0, 0, TAU); x.fill();
      x.strokeStyle = '#3a2a22'; x.lineWidth = 3; x.stroke();
      // eyes (worried)
      [[-1],[1]].forEach(([d]) => { x.strokeStyle = '#2a2018'; x.lineWidth = 2.6;
        x.beginPath(); x.ellipse(S*0.5+d*S*0.14, S*0.46, S*0.07, S*0.05, 0, 0, TAU); x.stroke();
        x.fillStyle = '#2a2018'; x.beginPath(); x.arc(S*0.5+d*S*0.14, S*0.47, 2.6, 0, TAU); x.fill();
        x.beginPath(); x.moveTo(S*0.5+d*S*0.22, S*0.37); x.lineTo(S*0.5+d*S*0.07, S*0.40); x.stroke(); });   // brows
      // nose
      x.strokeStyle = '#3a2a22'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(S*0.5, S*0.48); x.lineTo(S*0.47, S*0.60); x.lineTo(S*0.52, S*0.60); x.stroke();
      // wavy neutral mouth
      x.beginPath(); x.moveTo(S*0.40, S*0.70); x.quadraticCurveTo(S*0.46, S*0.67, S*0.5, S*0.70); x.quadraticCurveTo(S*0.55, S*0.73, S*0.60, S*0.69); x.stroke();
      // variant: crying doomer
      if ((seed | 0) % 3 === 2) { x.fillStyle = 'rgba(90,170,240,0.8)'; [[-1],[1]].forEach(([d]) => { x.beginPath(); x.ellipse(S*0.5+d*S*0.14, S*0.56, 3, 6, 0, 0, TAU); x.fill(); }); }
    }
    return c;
  }
  const PILOT_TINTS = [[1,0.35,0.55],[0.35,1,0.6],[0.4,0.75,1],[1,0.82,0.25],[0.75,0.5,1],[1,0.55,0.3],[0.4,1,0.9],[0.9,0.4,0.9]];
  function makePilots(n) {
    const out = [];
    for (let i = 0; i < n; i++) { const kind = (i % 2 === 0) ? 'pepe' : 'wojak';
      const cv = pilotCanvas(kind, i * 7 + 1); const tint = PILOT_TINTS[i % PILOT_TINTS.length];
      out.push({ name: HANDLES[i % HANDLES.length], kind, canvas: cv, tex: (window.CRGL ? CRGL.pilotTex(cv) : null),
        livery: (window.CRGL ? CRGL.liveryTex(i + 1, tint) : null), num: i + 1, tint, url: cv.toDataURL() });
    }
    return out;
  }

  // ═════════ TRACK ═════════
  const N = 260, HALFW = 8;
  let TRACK = null;
  function generateTrack() {
    const raw = [];
    for (let i = 0; i < N; i++) { const th = i / N * TAU;
      const Rr = 165 + 44 * Math.sin(th * 2) + 24 * Math.sin(th * 3 + 1);
      raw.push([Math.cos(th) * Rr, 22 * Math.sin(th * 3) + 11 * Math.sin(th * 5 + 2), Math.sin(th) * Rr]); }
    const pts = [];
    for (let i = 0; i < N; i++) { const a = raw[(i-1+N)%N], b = raw[i], c = raw[(i+1)%N];
      const fwd = norm(sub(c, a));
      const f0 = norm(sub(b, a)), f1 = norm(sub(c, b));
      const turnY = f0[0]*f1[2] - f0[2]*f1[0];               // signed horizontal turn
      const bank = clamp(turnY * 9, -0.62, 0.62);
      let up = rotAxis([0,1,0], fwd, bank);
      let right = norm(cross(fwd, up)); up = norm(cross(right, fwd));
      pts.push({ p: b, fwd, up, right, boost: (i % 46) < 4 && i > 6 });
    }
    return pts;
  }
  function frameAt(s) { s = ((s % N) + N) % N; const i = Math.floor(s), t = s - i, a = TRACK[i], b = TRACK[(i+1)%N];
    return { p: lerpV(a.p, b.p, t), fwd: norm(lerpV(a.fwd, b.fwd, t)), up: norm(lerpV(a.up, b.up, t)), right: norm(lerpV(a.right, b.right, t)),
      boost: a.boost || b.boost }; }

  // ═════════ CLOUDS ═════════
  let CLOUDS = [];
  function buildClouds() {
    CLOUDS = [];
    for (let i = 0; i < 150; i++) { const th = Math.random() * TAU, r = rnd(60, 320);
      CLOUDS.push([Math.cos(th) * r, rnd(-70, 30) + 15 * Math.sin(th * 3), Math.sin(th) * r, rnd(22, 64), rnd(16, 40), Math.random()]); }
    for (let i = 0; i < 70; i++) { const th = Math.random() * TAU, r = rnd(0, 380);   // low floor layer
      CLOUDS.push([Math.cos(th) * r, rnd(-140, -80), Math.sin(th) * r, rnd(50, 130), rnd(30, 70), Math.random()]); }
  }
  const ENV = {
    skyTop: [0.36, 0.42, 0.72], skyMid: [0.62, 0.68, 0.92], skyHorizon: [1.0, 0.82, 0.72],
    sunDir: norm([0.5, 0.12, -0.85]), sunCol: [1.0, 0.72, 0.5],
    fog: [0.85, 0.83, 0.92], fogNear: 130, fogFar: 620, lightDir: norm([0.5, 0.7, -0.4]),
    cloudA: [1.0, 0.95, 0.92, 1], cloudB: [0.86, 0.9, 1.0, 1],
  };

  // ═════════ RACE STATE ═════════
  const wager = { ante: 50, cards: 2, players: 6, laps: 3, picked: [] };
  let G = null, cv = $('gl'), glOk = false, pilots = [];
  const keys = {}, touch = { steer: 0, boost: false, brake: false };
  const CRUISE = 8.6, MAXBOOST = 1.52, BRAKE = 0.7, STEER = 30;

  function resize() { const d = Math.min(devicePixelRatio || 1, 2); cv.width = innerWidth * d; cv.height = innerHeight * d; }
  addEventListener('resize', resize); resize();

  function newRacer(i, isMe, pilot) {
    return { i, isMe, pilot, s: -(i * 2.2), lx: (i - wager.players/2) * 2.4, speed: 0, boost: false, boostE: 1, lap: 0, bob: Math.random()*6,
      lean: 0, aiWig: Math.random()*TAU, done: false, finishT: 0 };
  }

  function startRace(real) {
    $('ovLobby').classList.remove('show'); $('ovResult').classList.remove('show'); $('hud').classList.remove('hidden');
    TRACK = generateTrack(); buildClouds();
    if (glOk) CRGL.buildTrack(TRACK, HALFW);
    pilots = makePilots(wager.players);
    const racers = [];
    // you are racer 0 with pilot 0 (a pepe); bots get the rest
    for (let i = 0; i < wager.players; i++) racers.push(newRacer(i, i === 0, pilots[i]));
    // arm bonus from staked cards (subtle handling/top-speed edge)
    let cardEdge = 1;
    try { if (window.RipPowers && wager.picked.length) { const L = RipPowers.loadout(wager.picked.map(sl => bySlug.get(sl)).filter(Boolean), RipPowers.getMarket()); cardEdge = 1 + Math.min(0.09, (L.mult || 1) - 1) * 0.4; } } catch {}
    G = { real: !!real, racers, me: racers[0], t: 0, over: false, countdown: 3.2, started: false, cardEdge,
      myStake: wager.picked.slice(), oppStakes: [] };
    $('pilotImg').src = pilots[0].url;
    $('lapT').textContent = wager.laps;
    // arm opponent stakes (from the pot) for the podium card payout
    for (let i = 1; i < wager.players; i++) { const st = []; for (let k = 0; k < wager.cards; k++) { const all = [...bySlug.keys()]; if (all.length) st.push(all[Math.floor(Math.random()*all.length)]); } G.oppStakes.push(st); }
    if (window.RipNet) { try { RipNet.setStatus('battling'); } catch {} }
    last = performance.now(); requestAnimationFrame(loop);
  }

  // ── per-frame sim ──
  let last = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (!G) return;
    G.t += dt;
    if (G.countdown > 0) { G.countdown -= dt; const c = Math.ceil(G.countdown - 0.2);
      $('cd').classList.remove('hidden'); $('cdB').textContent = c > 0 ? c : 'GO';
      if (G.countdown <= 0) { setTimeout(() => $('cd').classList.add('hidden'), 500); G.started = true; }
    }
    if (!G.over) step(dt);
    render();
    if (!G.over) requestAnimationFrame(loop);
  }

  function step(dt) {
    const go = G.started;
    for (const r of G.racers) {
      if (r.done) { // coast after finishing
        r.speed = lerp(r.speed, 0, dt * 0.8); r.s += r.speed * dt; r.bob += dt * 4; continue;
      }
      // steering input
      let steer = 0, boostOn = false, brakeOn = false;
      if (r.isMe && go) {
        steer = (keys['arrowleft'] || keys['a'] ? -1 : 0) + (keys['arrowright'] || keys['d'] ? 1 : 0) + touch.steer;
        boostOn = (keys['w'] || keys['arrowup'] || keys['shift'] || touch.boost) && r.boostE > 0.05;
        brakeOn = (keys[' '] || touch.brake);
      } else if (go) {
        // AI: hold the racing line with a little wander, boost on straights, rubber-band
        r.aiWig += dt * rnd(0.6, 1.4);
        const wantLx = Math.sin(r.aiWig) * 3.2;
        steer = clamp((wantLx - r.lx) * 0.5, -1, 1);
        boostOn = r.boostE > 0.3 && Math.sin(r.aiWig * 0.7) > 0.1;
      }
      // speed
      const fr = frameAt(r.s);
      let target = CRUISE * G.cardEdge * (r.isMe ? 1 : 0.985);
      if (boostOn) target *= MAXBOOST;
      if (brakeOn) target *= BRAKE;
      if (fr.boost) target = Math.max(target, CRUISE * 1.7);       // light-strip surge
      if (!r.isMe && go) { // rubber-band bots toward the pack
        const lead = leader(); const gap = (lead.lap * N + lead.s) - (r.lap * N + r.s);
        target *= 1 + clamp(gap * 0.0016, -0.05, 0.12);
      }
      if (!go) target = 0;
      r.speed = lerp(r.speed, target, Math.min(1, dt * (boostOn ? 3 : 2)));
      // boost energy
      r.boostE = clamp(r.boostE + (boostOn ? -dt * 0.34 : dt * 0.22), 0, 1);
      r.boost = boostOn;
      // advance
      r.s += r.speed * dt;
      if (r.s >= N) { r.s -= N; r.lap++;
        if (r.lap >= wager.laps && !r.done) { r.done = true; r.finishT = G.t; if (r.isMe) finish(); } }
      // steer → lateral, with lean
      r.lx += steer * STEER * dt * (0.55 + Math.min(1, r.speed / CRUISE) * 0.5);
      if (Math.abs(r.lx) > HALFW) { r.lx = clamp(r.lx, -HALFW, HALFW); r.speed *= 0.86; }   // wall scrape
      r.lean = lerp(r.lean, -steer * 0.45, dt * 6);
      r.bob += dt * 7;
    }
    updatePositions();
    // fail-safe end: everyone done, or you finished + short grace
    if (G.racers.every(r => r.done)) endRace();
  }

  function leader() { let best = G.racers[0], bp = -1e9; for (const r of G.racers) { const p = r.lap * N + r.s; if (p > bp) { bp = p; best = r; } } return best; }
  function updatePositions() {
    const sorted = G.racers.slice().sort((a, b) => (b.lap * N + b.s) - (a.lap * N + a.s));
    sorted.forEach((r, i) => r.place = i + 1);
    G.order = sorted;
  }

  // ── camera + render ──
  function render() {
    if (!glOk || !G) return;
    const me = G.me, fr = frameAt(me.s);
    const hover = 1.6 + Math.sin(me.bob) * 0.16;
    // pod frames for all racers
    for (const r of G.racers) { const f = frameAt(r.s); const hv = 1.6 + Math.sin(r.bob) * 0.16;
      r.pos = add(add(f.p, mul(f.right, r.lx)), mul(f.up, hv));
      // lean: roll the up/right around fwd by lean
      const up = rotAxis(f.up, f.fwd, r.lean), right = norm(cross(f.fwd, up));
      r.fwd = f.fwd; r.up = up; r.right = right; r.tint = r.pilot.tint;
      r.pilotTex = r.pilot.tex; r.livery = r.pilot.livery; r.self = r.isMe;   // CRGL reads these for pilot billboards + livery number decals
    }
    const spd = me.speed / CRUISE;
    const camUp = G.me.up;
    const back = mul(me.fwd, -7 - spd * 0.8), lift = mul(camUp, 2.7);
    const shake = G.me.speed > CRUISE * 1.3 ? (Math.sin(G.t * 60) * 0.05 * spd) : 0;
    const camPos = add(add(me.pos, back), add(lift, mul(me.right, shake)));
    const tgt = add(add(me.pos, mul(me.fwd, 11)), mul(camUp, 0.8));
    const fov = 1.12 + clamp((spd - 1) * 0.4, 0, 0.42);
    // sort clouds back-to-front
    const cam = camPos;
    const cl = CLOUDS.map(c => { const dx = c[0]-cam[0], dy = c[1]-cam[1], dz = c[2]-cam[2]; return { c: [c[0],c[1],c[2]], sx: c[3], sy: c[4], tint: c[5], a: 0.92, d: dx*dx+dy*dy+dz*dz }; })
      .sort((a, b) => b.d - a.d);
    CRGL.frame({
      cam: { pos: camPos, tgt, up: camUp, fov }, env: ENV, t: G.t,
      clouds: cl, racers: G.racers, streak: clamp((spd - 0.85) * 1.4, 0, 1) * (me.boost ? 1.3 : 1), cockpit: false,
    });
    // HUD
    $('spdN').textContent = Math.round(me.speed * 34);
    $('boostBar').style.width = (me.boostE * 100) + '%';
    $('lapN').textContent = Math.min(wager.laps, me.lap + 1);
    $('placeN').textContent = me.place || 1; $('placeOf').textContent = '/ ' + wager.players;
    if (G.order) $('posList').innerHTML = G.order.slice(0, 8).map((r, i) => `<div class="r${r.isMe ? ' me' : ''}">${i+1}. ${esc(r.pilot.name)}${r.done ? ' ✓' : ''}</div>`).join('');
  }

  // ── finish / result ──
  let finished = false;
  function finish() { finished = true; toast('FINISH!'); }
  function endRace() {
    if (G.over) return; G.over = true;
    if (window.RipNet) { try { RipNet.setStatus('idle'); } catch {} }
    updatePositions();
    const myRank = G.order.findIndex(r => r.isMe);
    const P = WagerPayout.compute(wager.ante, wager.players, wager.cards, myRank);
    const onPodium = P.myPlace >= 0;
    let wonSlugs = [];
    if (G.real && onPodium && P.myCards > 0) { let v = vault();
      const pool = G.myStake.concat([].concat(...G.oppStakes)).filter(sl => bySlug.has(sl));
      wonSlugs = pool.slice(0, P.myCards);
      while (wonSlugs.length < P.myCards) { const all = [...bySlug.keys()]; wonSlugs.push(all[Math.floor(Math.random()*all.length)]); }
      wonSlugs.forEach(sl => { if (bySlug.has(sl)) v.push({ slug: sl }); }); saveVault(v); }
    $('hud').classList.add('hidden');
    const first = onPodium && P.myPlace === 0;
    $('resTitle').textContent = first ? 'WINNER' : (onPodium ? 'PODIUM' : 'FINISH');
    $('resTag').textContent = onPodium ? (WagerPayout.ordinal(P.myPlace) + ' of ' + wager.players + ' pilots') : ('off the podium · ' + WagerPayout.ordinal(myRank) + ' of ' + wager.players);
    if (!G.real) $('prizeBig').textContent = onPodium ? ('★ ' + WagerPayout.ordinal(P.myPlace) + (first ? ' — TOP OF THE PODIUM' : ' — ON THE PODIUM')) : 'BETTER LUCK NEXT LAP';
    else $('prizeBig').textContent = onPodium ? (WagerPayout.ordinal(P.myPlace) + ' · +' + P.myTok.toLocaleString('en-US') + ' $UR3030 · +' + wonSlugs.length + ' cards') : ('off the podium · 🔥' + P.anteBurn + ' rake burned');
    $('prizeSub').textContent = onPodium ? ('you took ' + WagerPayout.ordinal(P.myPlace) + ' place') : 'the pot went to the podium';
    $('board').innerHTML = G.order.map((r, i) => `<div class="r${r.isMe ? ' me' : ''}"><span>${i+1}. ${esc(r.pilot.name)}</span><span class="k">${r.done ? 'FIN' : (r.lap+1)+'/'+wager.laps}</span></div>`).join('');
    const wc = $('wonCards');
    wc.innerHTML = (onPodium && G.real && wonSlugs.length) ? wonSlugs.slice(0,12).map(sl => { const c = bySlug.get(sl); if (!c) return '';
      return `<div class="tile" style="--rc:var(${RC[c.rarity]||'--common'})"><span class="rr">${c.rarity}</span><img src="cards/${c.art}" onerror="this.style.opacity=.15"></div>`; }).join('') : '';
    $('scaNote').innerHTML = G.real
      ? 'Your <b>🔥' + P.anteBurn + ' $UR3030</b> rake burned on-chain — permanent, deflationary. The rest of the pot + staked cards pay the <b>podium 1st/2nd/3rd (50/30/20)</b>; card winnings move for keeps in your vault. Real on-chain token-pot escrow ships with the <b>721 lens</b> — Phase-2.'
      : 'Practice race — no tokens burned, no cards moved. Ante up with a signed wallet to race the podium for keeps.';
    $('ovResult').classList.add('show');
    G = null; buildGrid();
  }

  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1600); }

  // ═════════ LOBBY / WAGER ═════════
  $('pChips').innerHTML = [4,6,8].map(n => `<span class="pchip${n===wager.players?' on':''}" data-p="${n}">${n}</span>`).join('');
  $('lChips').innerHTML = [2,3,5].map(n => `<span class="lchip${n===wager.laps?' on':''}" data-l="${n}">${n}</span>`).join('');
  let alobby = null;
  function initNet() {
    if (!window.RipNet) return;
    try { RipNet.join({ handle: myHandle(), cards: vault().length, balance: 0 });
      alobby = window.ArenaLobby ? ArenaLobby.mount('#arenaLobby', { mode: 'table', header: true }) : null;
      RipNet.setStatus('seeking'); RipNet.onLobby(ps => { if (alobby) alobby.update(ps || []); refreshPot(); });
    } catch {}
  }
  function buildGrid() {
    const own = ownedSlugs(); const groups = new Map(); own.forEach(sl => groups.set(sl, (groups.get(sl)||0)+1));
    const g = $('cardGrid');
    if (!groups.size) { g.innerHTML = ''; $('cardsInfo').innerHTML = '<a href="index.html" style="color:var(--lime)">no cards yet — rip a pack</a>'; refreshPot(); return; }
    g.innerHTML = [...groups.entries()].map(([sl, n]) => { const c = bySlug.get(sl); if (!c) return '';
      const on = wager.picked.filter(s => s === sl).length;
      return `<div class="tile${on?' sel':''}" data-slug="${sl}" style="--rc:var(${RC[c.rarity]||'--common'})"><span class="rr">${c.rarity}</span>${n>1?`<span class="mult">×${n}</span>`:''}<img src="cards/${c.art}" loading="lazy" onerror="this.style.opacity=.15"><div class="stk">${on?'✓'+(on>1?on:''):''}</div></div>`; }).join('');
    g.querySelectorAll('.tile').forEach(el => el.onclick = () => { const sl = el.dataset.slug;
      const have = own.filter(s => s === sl).length, on = wager.picked.filter(s => s === sl).length;
      if (on >= have || wager.picked.length >= wager.cards) wager.picked = wager.picked.filter(s => s !== sl);
      else wager.picked.push(sl);
      while (wager.picked.length > wager.cards) wager.picked.shift();
      buildGrid(); refreshPot(); });
    if (window.CardHover) CardHover.bind(g, el => { const c = bySlug.get(el.dataset.slug); if (!c) return null; return { art: 'cards/'+c.art, title: c.title, rarity: c.rarity, atk: c.atk, def: c.def, trigger: c.trigger, color: `var(${RC[c.rarity]||'--common'})` }; });
    $('cardsInfo').textContent = `${own.length} owned · ${groups.size} kinds · ${wager.picked.length}/${wager.cards} in the pot`;
    refreshPot();
  }
  function refreshPot() {
    $('anteVal').textContent = wager.ante; $('cardsVal').textContent = wager.cards; $('pickN').textContent = wager.cards;
    const tokPot = wager.ante * wager.players, cardPot = wager.cards * wager.players;
    const potBurn = Math.round(tokPot * WagerPayout.BURN_PCT), potNet = tokPot - potBurn;
    $('potLine').innerHTML = `POT · <b>${potNet.toLocaleString('en-US')}</b> $UR3030 + <span class="c">${cardPot}</span> cards <span style="opacity:.66;font-size:.85em">· 🔥${potBurn} burned · podium 50/30/20</span>`;
    const Wt = window.RipWallet, canReal = liveToken() && Wt && Wt.hasWallet(), enough = wager.picked.length === wager.cards;
    $('btnAnte').disabled = !(canReal && enough);
    const note = $('lobNote');
    if (!liveToken()) note.innerHTML = '$UR3030 isn’t live on this network yet — the race runs as a <b>practice</b> heat.';
    else if (!(Wt && Wt.hasWallet())) note.innerHTML = 'Connect a wallet (sign the ledger) to ante real $UR3030 and race the podium for keeps.';
    else if (!enough) note.innerHTML = `Pick <b>${wager.cards}</b> card${wager.cards>1?'s':''} for the pot to ante for keeps.`;
    else note.innerHTML = 'Ante <b>'+wager.ante+' $UR3030</b> — <b>🔥'+WagerPayout.rake(wager.ante)+'</b> burns now, the rest joins the pot · <b>podium 1st/2nd/3rd</b> splits it.';
  }
  document.querySelectorAll('[data-ante]').forEach(b => b.onclick = () => { wager.ante = clamp(wager.ante + (+b.dataset.ante)*25, 0, 500); refreshPot(); });
  document.querySelectorAll('[data-cards]').forEach(b => b.onclick = () => { wager.cards = clamp(wager.cards + (+b.dataset.cards), 1, 5); wager.picked = wager.picked.slice(0, wager.cards); buildGrid(); });
  $('pChips').querySelectorAll('.pchip').forEach(c => c.onclick = () => { wager.players = +c.dataset.p; $('pChips').querySelectorAll('.pchip').forEach(x => x.classList.toggle('on', x === c)); refreshPot(); });
  $('lChips').querySelectorAll('.lchip').forEach(c => c.onclick = () => { wager.laps = +c.dataset.l; $('lChips').querySelectorAll('.lchip').forEach(x => x.classList.toggle('on', x === c)); });

  async function ante(rematch) { const Wt = window.RipWallet;
    if (!(liveToken() && Wt && Wt.hasWallet())) { startRace(false); return; }
    if (wager.picked.length !== wager.cards) { toast('Pick ' + wager.cards + ' cards first'); return; }
    const btn = rematch ? $('btnRematch') : $('btnAnte'); const label = btn.innerHTML; btn.innerHTML = 'confirm burn…'; btn.disabled = true;
    const r = await Wt.burn(WagerPayout.rake(wager.ante)); btn.innerHTML = label; btn.disabled = false;
    if (!r.ok) { toast(Wt.explain ? Wt.explain(r.reason) : 'Burn failed'); return; }
    startRace(true);
  }
  $('btnPractice').onclick = () => startRace(false);
  $('btnAnte').onclick = () => ante(false);
  $('btnRematch').onclick = () => { $('ovResult').classList.remove('show'); ante(true); };
  $('btnLobby').onclick = () => { $('ovResult').classList.remove('show'); $('ovLobby').classList.add('show'); if (window.RipNet) { try { RipNet.setStatus('seeking'); } catch {} } };

  // ═════════ INPUT ═════════
  addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault(); });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  function padBind(el, on, off) { if (!el) return; const d = e => { e.preventDefault(); on(); }, u = e => { e.preventDefault(); off(); };
    el.addEventListener('touchstart', d, { passive: false }); el.addEventListener('touchend', u); el.addEventListener('mousedown', d); el.addEventListener('mouseup', u); el.addEventListener('mouseleave', u); }
  padBind($('padL'), () => touch.steer = -1, () => touch.steer = 0);
  padBind($('padR'), () => touch.steer = 1, () => touch.steer = 0);
  padBind($('padBoost'), () => touch.boost = true, () => touch.boost = false);
  padBind($('padBrake'), () => touch.brake = true, () => touch.brake = false);

  // ═════════ BOOT ═════════
  try { glOk = window.CRGL && CRGL.init(cv); } catch (e) { glOk = false; }
  window.__cr = { get s() { return G ? { t: G.t, over: G.over, place: G.me && G.me.place, spd: G.me && Math.round(G.me.speed*34), gl: glOk } : { lobby: true, gl: glOk }; } };
  loadDeck().then(() => { buildGrid(); initNet(); });
  if (window.RipWallet) { try { RipWallet.on(() => refreshPot()); } catch {} }
})();

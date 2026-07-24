/* upperdeckripmaster3030 — CARD FIGHT.
 *
 * The wager face-off used to snap from VS straight to the verdict. This turns the
 * middle into an actual brawl: each staked card fires its SIGNATURE ability across
 * the arena — the same trigger→weapon map the cabinets use (GAS STORM = rapid bolts,
 * MOON CANDLE = laser, RUG WIND = bomb, WHALE SONG = homing, …) — HP bars drain, and
 * a Street-Fighter "K.O." lands on the side that already lost the tale of the tape.
 *
 * The outcome is PRE-DECIDED by power() in battle.html; this is choreography, not a
 * simulation — the HP curve is scripted to the known result so the animation can never
 * disagree with the settle. Weather-matched cards (trigger === gas, or forged `live`)
 * throw a brighter SURGE and are called out by name, so you can read which card did what.
 *
 *   CardFight.play(arenaEl, { you, house, outcome, gas, youTotal, houseTotal, reduce })
 *     → Promise that resolves when the K.O. (or DRAW) has landed.
 *
 * outcome is from YOU's view: 'win' | 'lose' | 'tie'. Self-injects CSS, cleans up its
 * canvas on resolve, degrades to an instant result under reduced-motion. No libs.
 */
window.CardFight = (function () {
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const RSCALE = { common: 0.82, uncommon: 0.96, rare: 1.15, mythic: 1.42, prizm: 1.78 };
  // trigger → ability (mirrors RipPowers.TRIGGER_GUN, but with a look for the arena)
  const ABIL = {
    'GAS STORM':   { key: 'rapid',  col: '#ffe93b' },
    'STILL AIR':   { key: 'twin',   col: '#5df2ff' },
    'BURN WAVE':   { key: 'spread', col: '#ff8a2a' },
    'MOON CANDLE': { key: 'laser',  col: '#ff5ad9' },
    'RUG WIND':    { key: 'bomb',   col: '#ff5a3c' },
    'DEEP WATER':  { key: 'shield', col: '#39a0ff' },
    'BLOCK OMEN':  { key: 'pierce', col: '#b47bff' },
    'WHALE SONG':  { key: 'homing', col: '#2bff80' },
  };
  const ability = c => { const t = String(c.trigger || '').toUpperCase(); return ABIL[t] ? { name: t, ...ABIL[t] } : { name: t || 'STRIKE', key: 'strike', col: '#dfe7ff' }; };

  let styled = false;
  function css() {
    if (styled) return; styled = true;
    const s = document.createElement('style'); s.id = 'card-fight-css';
    s.textContent = [
      '.cf-cv{position:absolute;inset:0;z-index:12;pointer-events:none;}',
      '.cf-hp{position:absolute;top:6px;z-index:14;width:38%;height:15px;border:1.5px solid rgba(255,255,255,.5);border-radius:8px;',
        'background:rgba(0,0,0,.55);overflow:hidden;box-shadow:0 2px 8px #000,inset 0 0 8px rgba(0,0,0,.6);}',
      '.cf-hp.you{left:3%;} .cf-hp.house{right:3%;}',
      '.cf-hp i{position:absolute;top:0;bottom:0;width:100%;transition:width .12s linear;',
        'background:linear-gradient(180deg,#8bffbb,#2bff80 55%,#0fae56);} ',
      '.cf-hp.house i{right:0;left:auto;background:linear-gradient(180deg,#ff9a6b,#ff5a3c 55%,#c0281a);}',
      '.cf-hp b{position:absolute;top:50%;transform:translateY(-50%);font-family:"Arial Black",Arial,sans-serif;font-size:9px;',
        'letter-spacing:.1em;color:#fff;text-shadow:0 1px 2px #000;z-index:2;}',
      '.cf-hp.you b{left:6px;} .cf-hp.house b{right:6px;}',
      '.cf-call{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);z-index:8;pointer-events:none;',
        'font-family:"Arial Black",Arial,sans-serif;font-style:italic;letter-spacing:-.02em;text-transform:uppercase;',
        'font-size:clamp(30px,11vw,74px);color:#fff;opacity:0;white-space:nowrap;',
        'text-shadow:0 0 10px #000,0 4px 0 #7a0018,0 0 30px rgba(255,42,109,.7);}',
      '.cf-call.go{animation:cfCall .62s cubic-bezier(.2,1.7,.4,1) both;}',
      '@keyframes cfCall{0%{opacity:0;transform:translate(-50%,-50%) scale(2.4) rotate(-6deg)}30%{opacity:1}70%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(-3deg)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.05) rotate(-3deg)}}',
      '.cf-side-hit{animation:cfHit .18s ease;}',
      '@keyframes cfHit{25%{transform:translateX(var(--kx,4px)) scale(.98)}60%{transform:translateX(calc(var(--kx,4px)*-.5))}}',
      '.cf-skip{position:absolute;left:50%;bottom:7px;transform:translateX(-50%);z-index:15;pointer-events:none;',
        'font-family:"Courier New",monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8fb;opacity:.6;',
        'animation:cfSkip 1.6s ease-in-out infinite;}',
      '@keyframes cfSkip{50%{opacity:.95;}}',
      '@media (prefers-reduced-motion:reduce){.cf-call.go{animation-duration:.3s;}.cf-skip{animation:none;}}',
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // ── tiny WebAudio kit (blips only; the slam click already unlocked the context) ──
  let AC = null;
  function ac() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch { AC = null; } return AC; }
  function beep(f0, f1, dur, type, gain) {
    const c = ac(); if (!c) return;
    try { const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain || 0.05, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch {} }
  function noise(dur, gain) {
    const c = ac(); if (!c) return;
    try { const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf;
      g.gain.setValueAtTime(gain || 0.14, c.currentTime); src.connect(g).connect(c.destination); src.start();
    } catch {} }

  function play(arena, cfg) {
    css();
    cfg = cfg || {};
    const reduce = !!cfg.reduce;
    const you = (cfg.you || []).slice(), house = (cfg.house || []).slice();
    const outcome = cfg.outcome || 'tie';
    const gas = String(cfg.gas || '').toUpperCase();
    const youWins = outcome === 'win', tie = outcome === 'tie';
    const margin = Math.abs((+cfg.youTotal || 0) - (+cfg.houseTotal || 0));

    // HP endpoints — scripted so the animation matches the settled result
    const winRes = clamp(30 + margin * 0.7, 22, 70);
    const youEnd = tie ? 9 : (youWins ? winRes : 0);
    const houseEnd = tie ? 9 : (youWins ? 0 : winRes);

    if (getComputedStyle(arena).position === 'static') arena.style.position = 'relative';
    const youSide = arena.querySelector('.fo-side.you'), houseSide = arena.querySelector('.fo-side.house');
    const cv = document.createElement('canvas'); cv.className = 'cf-cv'; arena.appendChild(cv);
    const hpYou = mkHp('you'), hpHouse = mkHp('house'); arena.appendChild(hpYou.el); arena.appendChild(hpHouse.el);
    const call = document.createElement('div'); call.className = 'cf-call'; arena.appendChild(call);
    // tap anywhere to skip to the finish — the fight is a flourish, not a toll on repeat plays
    let skipReq = false;
    const skipHint = document.createElement('div'); skipHint.className = 'cf-skip'; skipHint.textContent = 'tap to skip ⏭';
    const onSkip = () => { skipReq = true; };
    if (!reduce) { arena.appendChild(skipHint); arena.addEventListener('pointerdown', onSkip); }
    function mkHp(side) { const el = document.createElement('div'); el.className = 'cf-hp ' + side;
      el.innerHTML = '<i></i><b>' + (side === 'you' ? 'YOU' : 'RIVAL') + '</b>'; return { el, bar: el.querySelector('i') }; }

    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
    function resize() { const r = arena.getBoundingClientRect(); W = Math.max(240, r.width); H = Math.max(160, r.height);
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    resize(); const onR = () => resize(); window.addEventListener('resize', onR);

    // fighters — one per staked card, alternating fire on a rarity-driven cadence
    const anchor = side => ({ x: side === 'you' ? W * 0.20 : W * 0.80, y: H * 0.52 });
    function mkFighters(cards, side) { return cards.map((c, i) => { const a = ability(c);
      const rk = RSCALE[c.rarity] || 0.9; const matched = !!(c.live || (gas && (String(c.trigger).toUpperCase() === gas || (c.amp2 && String(c.amp2).toUpperCase() === gas))));
      return { side, ab: a, rk, matched, atk: +c.atk || 0, def: +c.def || 0,
        cd: (620 + i * 140) / clamp(rk, 0.7, 2), t: 240 + i * 160, shown: false }; }); }
    const fighters = mkFighters(you, 'you').concat(mkFighters(house, 'house'));
    const seen = { you: new Set(), house: new Set() };   // first time each ability fires → name callout

    const shots = [], fx = [], labels = [];
    let shake = 0, flash = 0, flashCol = '255,255,255';

    function fire(f) {
      const from = anchor(f.side); const dir = f.side === 'you' ? 1 : -1;
      const to = anchor(f.side === 'you' ? 'house' : 'you');
      const col = f.ab.col; const big = f.matched;
      const scale = f.rk * (big ? 1.5 : 1) * (1 + f.atk * 0.03);
      const spawn = (dx, dy, vx, vy, kind, r, life, homing) => shots.push({
        x: from.x + dir * 26, y: from.y + dy, vx: vx * dir, vy, kind, r: r * scale, col, side: f.side, life: life || 1.4, homing: homing || 0, tgt: to });
      const k = f.ab.key, base = 520;
      if (k === 'rapid') { for (let i = 0; i < 3; i++) setTimeout(() => spawn(0, (i - 1) * 4, base * 1.5, 0, 'bolt', 3.2, 1.1), i * 70); beep(880, 620, 0.05, 'square', big ? 0.06 : 0.04); }
      else if (k === 'twin') { spawn(0, -9, base * 1.3, 0, 'bolt', 3.4); spawn(0, 9, base * 1.3, 0, 'bolt', 3.4); beep(560, 460, 0.07, 'sawtooth', 0.045); }
      else if (k === 'spread') { for (let i = -2; i <= 2; i++) spawn(0, 0, base, i * 34, 'bolt', 3, 1.2); beep(700, 300, 0.09, 'sawtooth', 0.05); }
      else if (k === 'laser') { fx.push({ kind: 'beam', side: f.side, y: from.y, col, t: 0, life: big ? 0.5 : 0.36, r: 7 * scale }); flash = 0.5; flashCol = '255,90,217'; shake = Math.max(shake, 7); beep(300, 1400, 0.28, 'sine', 0.06); }
      else if (k === 'bomb') { spawn(0, -18, base * 0.7, -260, 'bomb', 6, 1.6); beep(220, 120, 0.16, 'triangle', 0.06); }
      else if (k === 'shield') { fx.push({ kind: 'shield', x: from.x, y: from.y, col, t: 0, life: 0.7, r: 46 * f.rk }); beep(300, 520, 0.2, 'sine', 0.04); }
      else if (k === 'pierce') { spawn(0, 0, base * 0.85, 0, 'slug', 5.2, 1.7); beep(180, 90, 0.2, 'square', 0.055); }
      else if (k === 'homing') { spawn(0, (Math.random() * 2 - 1) * 20, base * 0.7, (Math.random() * 2 - 1) * 120, 'missile', 4.2, 2.2, 1); beep(760, 900, 0.14, 'sine', 0.045); }
      else { spawn(0, 0, base * 1.1, 0, 'bolt', 3.2); beep(520, 380, 0.06, 'square', 0.04); }
      if (big) { flash = Math.max(flash, 0.4); shake = Math.max(shake, 6); noise(0.12, 0.06); }
      // name the ability the first time each side throws it (and always for a surge)
      if (big || !seen[f.side].has(f.ab.key)) { seen[f.side].add(f.ab.key);
        labels.push({ x: from.x, y: from.y - 44, txt: f.ab.name + (big ? ' ⚡' : ''), col, t: 0, life: 1.1, side: f.side }); }
    }

    function impact(x, y, col, side, power) {
      for (let i = 0; i < (6 + power * 4 | 0); i++) { const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 160 * power;
        fx.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, col, t: 0, life: 0.4 + Math.random() * 0.3, r: 1.5 + Math.random() * 2.5 }); }
      shake = Math.max(shake, 3 + power * 3);
      const side2 = side === 'you' ? 'house' : 'you'; const el = side2 === 'you' ? youSide : houseSide;
      if (el) { el.style.setProperty('--kx', (side === 'you' ? 6 : -6) + 'px'); el.classList.remove('cf-side-hit'); void el.offsetWidth; el.classList.add('cf-side-hit'); }
      noise(0.05, 0.05 + power * 0.05);
    }

    // ── run ──
    const INTRO = reduce ? 120 : 720, FIGHT = reduce ? 220 : 3400, KO = reduce ? 160 : 950;
    const TOTAL = INTRO + FIGHT + KO;
    let hpYouV = 100, hpHouseV = 100, done = false, raf = 0;
    function setHp() { hpYou.bar.style.width = hpYouV.toFixed(1) + '%'; hpHouse.bar.style.width = hpHouseV.toFixed(1) + '%'; }
    setHp();

    return new Promise(resolve => {
      const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); clearTimeout(safety);
        window.removeEventListener('resize', onR); arena.removeEventListener('pointerdown', onSkip); skipHint.remove();
        // fade + drop the projectile canvas; leave the drained HP bars as the result read
        cv.animate ? cv.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).finished.then(() => cv.remove(), () => cv.remove()) : cv.remove();
        resolve(); };
      const safety = setTimeout(finish, TOTAL + 900);   // never hang, even if rAF is throttled

      let last = performance.now(), koFired = false;
      const ease = p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

      function callOut(txt, col) { call.textContent = txt; if (col) call.style.color = col; call.classList.remove('go'); void call.offsetWidth; call.classList.add('go'); }
      if (!reduce) { callOut('FIGHT!'); beep(180, 900, 0.3, 'sawtooth', 0.06); }

      function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        // a tap fast-forwards through the posturing + trade straight to the K.O. flourish
        if (skipReq && !koFired && (now - startT) < INTRO + FIGHT) { startT = now - (INTRO + FIGHT) - 1; skipHint.remove(); }
        const elapsed = now - startT; const t = clamp(elapsed, 0, TOTAL);
        // phase HP drive — a scripted curve to the pre-decided endpoints (theater, not a sim)
        if (t <= INTRO) { /* posturing */ }
        else if (t <= INTRO + FIGHT) { const p = ease((t - INTRO) / FIGHT);
          hpYouV = 100 + (youEnd - 100) * p; hpHouseV = 100 + (houseEnd - 100) * p;
        } else { hpYouV = youEnd; hpHouseV = houseEnd;
          if (!koFired) { koFired = true;
            if (tie) { callOut('DRAW', '#ffd23b'); }
            else { callOut('K.O.', '#fff'); const loseAnchor = anchor(youWins ? 'house' : 'you');
              flash = 1; flashCol = youWins ? '43,255,128' : '255,90,60'; shake = 16; impact(loseAnchor.x, loseAnchor.y, youWins ? '#2bff80' : '#ff5a3c', youWins ? 'you' : 'house', 3); }
            noise(0.4, 0.16); beep(400, 60, 0.5, 'square', 0.08); }
        }
        setHp();

        // fighters fire during the FIGHT phase
        if (t > INTRO && t < INTRO + FIGHT) fighters.forEach(f => { f.t -= dt * 1000; if (f.t <= 0) { f.t = f.cd * (0.85 + Math.random() * 0.4); fire(f); } });

        // integrate projectiles
        ctx.clearRect(0, 0, W, H);
        for (let i = shots.length - 1; i >= 0; i--) { const s = shots[i]; s.life -= dt;
          if (s.homing && s.tgt) { const dx = s.tgt.x - s.x, dy = s.tgt.y - s.y, d = Math.hypot(dx, dy) || 1; s.vx += (dx / d) * 900 * dt; s.vy += (dy / d) * 900 * dt; const sp = Math.hypot(s.vx, s.vy); const mx = 620; if (sp > mx) { s.vx *= mx / sp; s.vy *= mx / sp; } }
          if (s.kind === 'bomb') s.vy += 520 * dt;
          s.x += s.vx * dt; s.y += s.vy * dt;
          const tgtX = s.tgt ? s.tgt.x : (s.side === 'you' ? W : 0);
          const arrived = s.side === 'you' ? s.x >= tgtX - 24 : s.x <= tgtX + 24;
          drawShot(ctx, s);
          if (arrived || s.life <= 0) { if (arrived) { impact(s.x, s.y, s.col, s.side, s.kind === 'bomb' || s.kind === 'slug' ? 2 : 1);
              if (s.kind === 'bomb') fx.push({ kind: 'boom', x: s.x, y: s.y, col: s.col, t: 0, life: 0.4, r: 8 }); }
            shots.splice(i, 1); } }

        // fx
        for (let i = fx.length - 1; i >= 0; i--) { const e = fx[i]; e.t += dt;
          if (e.kind === 'spark') { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 260 * dt; }
          drawFx(ctx, e, W, H); if (e.t >= e.life) fx.splice(i, 1); }

        // ability name labels
        for (let i = labels.length - 1; i >= 0; i--) { const L = labels[i]; L.t += dt; L.y -= dt * 22;
          const a = L.t < 0.15 ? L.t / 0.15 : clamp(1 - (L.t - 0.15) / (L.life - 0.15), 0, 1);
          ctx.save(); ctx.globalAlpha = a; ctx.font = '900 12px "Arial Black",Arial,sans-serif'; ctx.textAlign = 'center';
          ctx.fillStyle = L.col; ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.fillText(L.txt, clamp(L.x, 40, W - 40), L.y); ctx.restore();
          if (L.t >= L.life) labels.splice(i, 1); }

        // screen flash + shake (applied to the whole arena)
        if (flash > 0) { ctx.save(); ctx.fillStyle = 'rgba(' + flashCol + ',' + (flash * 0.5).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); ctx.restore(); flash = Math.max(0, flash - dt * 3); }
        if (shake > 0) { const s = shake; arena.style.transform = 'translate(' + ((Math.random() * 2 - 1) * s).toFixed(1) + 'px,' + ((Math.random() * 2 - 1) * s * 0.5).toFixed(1) + 'px)'; shake = Math.max(0, shake - dt * 40); if (shake <= 0) arena.style.transform = ''; }

        if (t >= TOTAL) { arena.style.transform = ''; finish(); return; }
        raf = requestAnimationFrame(frame);
      }
      let startT = performance.now();
      if (reduce) { // instant: settle bars, drop a KO/DRAW, resolve
        hpYouV = youEnd; hpHouseV = houseEnd; setHp();
        callOut(tie ? 'DRAW' : 'K.O.', tie ? '#ffd23b' : '#fff');
        setTimeout(finish, 320);
      } else { raf = requestAnimationFrame(frame); }
    });
  }

  function drawShot(ctx, s) {
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.shadowColor = s.col; ctx.shadowBlur = 12; ctx.fillStyle = s.col; ctx.strokeStyle = s.col;
    if (s.kind === 'bolt') { const ang = Math.atan2(s.vy, s.vx); ctx.rotate(ang); ctx.beginPath(); ctx.ellipse(0, 0, s.r * 2.2, s.r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (s.kind === 'bomb') { ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-s.r * 0.3, -s.r * 0.3, s.r * 0.35, 0, Math.PI * 2); ctx.fill(); }
    else if (s.kind === 'slug') { const ang = Math.atan2(s.vy, s.vx); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(s.r * 2, 0); ctx.lineTo(-s.r, -s.r); ctx.lineTo(-s.r, s.r); ctx.closePath(); ctx.fill(); ctx.globalAlpha = .5; ctx.fillRect(-s.r * 4, -s.r * 0.4, s.r * 3, s.r * 0.8); }
    else if (s.kind === 'missile') { const ang = Math.atan2(s.vy, s.vx); ctx.rotate(ang); ctx.beginPath(); ctx.ellipse(0, 0, s.r * 1.8, s.r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .45; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-s.r * 2.4, 0, s.r * 1.6, s.r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function drawFx(ctx, e, W, H) {
    const p = e.t / e.life;
    ctx.save();
    if (e.kind === 'spark') { ctx.globalAlpha = 1 - p; ctx.fillStyle = e.col; ctx.shadowColor = e.col; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1 - p * 0.5), 0, Math.PI * 2); ctx.fill(); }
    else if (e.kind === 'boom') { ctx.globalAlpha = 1 - p; ctx.strokeStyle = e.col; ctx.lineWidth = 3 * (1 - p); ctx.shadowColor = e.col; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + p * 46, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(255,240,200,' + ((1 - p) * 0.4).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + p * 30, 0, Math.PI * 2); ctx.fill(); }
    else if (e.kind === 'beam') { const dir = e.side === 'you' ? 1 : -1; const x0 = e.side === 'you' ? W * 0.22 : W * 0.78; const x1 = e.side === 'you' ? W * 0.8 : W * 0.2; const a = Math.sin(Math.min(1, p) * Math.PI); ctx.globalAlpha = a; ctx.strokeStyle = e.col; ctx.lineWidth = e.r * (1 + a); ctx.shadowColor = e.col; ctx.shadowBlur = 24; ctx.beginPath(); ctx.moveTo(x0, e.y); ctx.lineTo(x1, e.y); ctx.stroke(); ctx.globalAlpha = a * 0.8; ctx.strokeStyle = '#fff'; ctx.lineWidth = e.r * 0.4; ctx.beginPath(); ctx.moveTo(x0, e.y); ctx.lineTo(x1, e.y); ctx.stroke(); }
    else if (e.kind === 'shield') { const a = Math.sin(Math.min(1, p) * Math.PI); ctx.globalAlpha = a * 0.8; ctx.strokeStyle = e.col; ctx.lineWidth = 3; ctx.shadowColor = e.col; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = a * 0.15; ctx.fillStyle = e.col; ctx.fill(); }
    ctx.restore();
  }

  return { play, ability };
})();

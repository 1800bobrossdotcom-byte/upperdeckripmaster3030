/* Upperdeck Ripmaster 3030 — arena net layer.
 *
 * Presence + challenges for the multiplayer lobby, behind a swappable adapter so the
 * exact same UI runs on a local demo today and a real backend tomorrow:
 *
 *   window.RipNet.use(adapter)      pick the transport (LocalNet by default)
 *   RipNet.join(profile)            announce yourself (handle, $UR balance, card count)
 *   RipNet.setStatus('seeking')     idle | seeking | battling
 *   RipNet.onLobby(cb)              cb(players[])  — the live roster, on every change
 *   RipNet.challenge(id)            call someone out
 *   RipNet.onChallenge(cb)          cb({id, from})  — someone called YOU out
 *   RipNet.accept(id) / decline(id)
 *   RipNet.onMatch(cb)              cb({opponent, oppStack})  — go! launch the face-off
 *
 * LocalNet is fully live: BroadcastChannel gives you REAL presence across browser tabs
 * on this device, and a pack of bot rippers keep the room warm (some seeking, some who
 * will call you out). Swap in KVNet (see docs/MULTIPLAYER.md) to go internet-wide with
 * zero UI changes.
 */
(() => {
  const HANDLES = ['Raoul Duke', 'Chuck Meltdown', 'Baron Von Blazed', 'Denim Reaper', 'Cogito Ribbit',
    'Slim Bridger', 'Duck Loathing', 'Reservoir Frog', 'Deltoid Zeus', 'Bail Denied', 'Full Court Glaucoma',
    'Technicolor Yawn', 'Public Domain', 'Kitchen Bandido', 'The Consigliere', 'Aggressively Pleased',
    'Bon Appe-teeth', 'Rug-Pull Rick', 'Too Weird To Live', 'Godzilla’s Accountant'];
  const RARE = ['common', 'uncommon', 'rare', 'mythic', 'prizm'];
  const rnd = n => Math.floor(Math.random() * n);
  const pick = a => a[rnd(a.length)];
  const uid = () => 'p_' + Math.random().toString(36).slice(2, 9);   // Math.random is fine client-side

  // ── the current player's local identity ──
  //   The id must be UNIQUE PER TAB, not per browser — two tabs of one browser share
  //   localStorage, so a localStorage id would make each tab treat the other as "self"
  //   and the cross-tab lobby would show nobody. sessionStorage is per-tab, so each tab
  //   is its own player. The handle a user sets persists (localStorage); a never-set tab
  //   gets its own random gonzo handle (sessionStorage) so two fresh tabs read distinctly.
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const ses = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
  const myId = ses.get('urm_net_sid') || (() => { const v = uid(); ses.set('urm_net_sid', v); return v; })();
  const myHandle = store.get('urm_net_handle') || ses.get('urm_net_shandle')
    || (() => { const v = pick(HANDLES); ses.set('urm_net_shandle', v); return v; })();
  let me = { id: myId, handle: myHandle, balance: 0, cards: 0, status: 'idle', bot: false, me: true };

  const listeners = { lobby: [], challenge: [], match: [] };
  const emit = (ev, arg) => listeners[ev].forEach(f => { try { f(arg); } catch {} });

  // ── LocalNet: BroadcastChannel presence across tabs + a bot population ──
  function LocalNet() {
    const players = new Map();               // id -> profile
    players.set(me.id, me);
    let bc = null; try { bc = new BroadcastChannel('urm-arena'); } catch {}

    // bots keep the room alive
    const bots = [];
    const nBots = 5 + rnd(4);
    const usedH = new Set([me.handle]);
    for (let i = 0; i < nBots; i++) {
      let h; do { h = pick(HANDLES); } while (usedH.has(h) && usedH.size < HANDLES.length); usedH.add(h);
      const b = { id: uid(), handle: h, balance: 200 + rnd(9) * 350, cards: 3 + rnd(40),
        status: Math.random() < .45 ? 'seeking' : 'idle', bot: true, wl: rnd(9) + '-' + rnd(6) };
      bots.push(b); players.set(b.id, b);
    }

    const roster = () => [...players.values()].sort((a, b) => (a.me ? -1 : b.me ? 1 : 0) || b.balance - a.balance);
    const pushLobby = () => emit('lobby', roster());

    // presence heartbeat + receive
    const announce = () => bc && bc.postMessage({ t: 'hi', p: { id: me.id, handle: me.handle, balance: me.balance, cards: me.cards, status: me.status, verified: me.verified, address: me.address } });
    if (bc) bc.onmessage = e => {
      const m = e.data || {};
      if (m.t === 'hi' && m.p && m.p.id !== me.id) { players.set(m.p.id, { ...m.p, lastSeen: Date.now() }); announce(); pushLobby(); }
      else if (m.t === 'bye' && m.p) { players.delete(m.p); pushLobby(); }
      else if (m.t === 'challenge' && m.to === me.id) { emit('challenge', { id: m.cid, from: players.get(m.from) || { handle: m.fromHandle, id: m.from } }); }
      else if (m.t === 'accept' && m.to === me.id) { startMatch(players.get(m.from), m.oppStack); }
      else if (m.t === 'decline' && m.to === me.id) { emit('lobby', roster()); }
    };
    addEventListener('beforeunload', () => bc && bc.postMessage({ t: 'bye', p: me.id }));

    // prune stale tabs; cycle bot statuses; occasional bot callout (a nudge!)
    const tick = setInterval(() => {
      const now = Date.now(); let changed = false;
      players.forEach((p, id) => { if (!p.me && !p.bot && p.lastSeen && now - p.lastSeen > 12000) { players.delete(id); changed = true; } });
      bots.forEach(b => { if (Math.random() < .18) { b.status = Math.random() < .5 ? 'seeking' : 'idle'; changed = true; } });
      // a seeking bot occasionally calls YOU out
      if (me.status !== 'battling' && Math.random() < .10) {
        const s = bots.filter(b => b.status === 'seeking'); if (s.length) emit('challenge', { id: 'c_' + uid(), from: pick(s), bot: true });
      }
      if (changed) pushLobby();
    }, 4000);

    // a card stack for a bot opponent
    const botStack = n => Array.from({ length: n }, () => ({ rarity: pick(RARE) }));   // resolved to real cards by the arena
    let pending = null;                        // an outbound challenge awaiting accept

    function startMatch(opponent, oppStack) { me.status = 'battling'; emit('match', { opponent, oppStack: oppStack || null }); }

    return {
      join(profile) { me = { ...me, ...(profile || {}), id: myId, me: true }; players.set(me.id, me); announce(); pushLobby(); },
      setStatus(s) { me.status = s; players.set(me.id, me); announce(); pushLobby(); },
      setHandle(h) { me.handle = (h == null ? '' : String(h)).trim().slice(0, 24) || me.handle;
        store.set('urm_net_handle', me.handle); ses.set('urm_net_shandle', me.handle); players.set(me.id, me); announce(); pushLobby(); },
      me: () => me,
      challenge(id) {
        const target = players.get(id); if (!target) return;
        const cid = 'c_' + uid(); pending = { cid, id };
        if (target.bot) {                      // bots decide fast
          setTimeout(() => { if (Math.random() < .8) startMatch(target, botStack(3)); else emit('lobby', roster()); }, 700 + rnd(900));
        } else if (bc) { bc.postMessage({ t: 'challenge', to: id, from: me.id, fromHandle: me.handle, cid }); }
        return cid;
      },
      accept(ch) {
        if (ch.bot || (ch.from && ch.from.bot)) { const opp = ch.from; startMatch(opp, botStack(3)); return; }
        if (bc) bc.postMessage({ t: 'accept', to: ch.from.id, from: me.id, oppStack: null });
        startMatch(ch.from, null);
      },
      decline(ch) { if (!ch.bot && bc && ch.from) bc.postMessage({ t: 'decline', to: ch.from.id, from: me.id }); },
      onLobby: cb => { listeners.lobby.push(cb); cb(roster()); },
      onChallenge: cb => listeners.challenge.push(cb),
      onMatch: cb => listeners.match.push(cb),
      dispose() { clearInterval(tick); bc && bc.postMessage({ t: 'bye', p: me.id }); },
    };
  }

  let adapter = null;
  const RipNet = {
    LocalNet,
    use(a) { if (adapter && adapter.dispose) adapter.dispose(); adapter = a; return RipNet; },
    _a() { return adapter || (adapter = LocalNet()); },
    join(p) { return this._a().join(p); },
    setStatus(s) { return this._a().setStatus(s); },
    setHandle(h) { return this._a().setHandle(h); },
    me() { return this._a().me(); },
    challenge(id) { return this._a().challenge(id); },
    accept(ch) { return this._a().accept(ch); },
    decline(ch) { return this._a().decline(ch); },
    onLobby(cb) { return this._a().onLobby(cb); },
    onChallenge(cb) { return this._a().onChallenge(cb); },
    onMatch(cb) { return this._a().onMatch(cb); },
  };
  window.RipNet = RipNet;
})();

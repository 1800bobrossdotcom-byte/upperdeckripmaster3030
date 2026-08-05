/* ripmaster3030studios — arena net layer.
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
 * ⛔ THE ROOM IS REAL PEOPLE ONLY. Artist, 2026-08-05: "remove bot examples for online lobby
 *   and only those really logged in."
 *   Presence has two sources and BOTH are real: BroadcastChannel across this device's tabs, and
 *   `/api/presence` (Vercel + Upstash KV) across the internet. The bot population that used to
 *   "keep the room warm" is GONE — no synthetic handles, no synthetic challenges, no synthetic
 *   opponents.
 * ⚑ AND AN EMPTY ROOM IS THE POINT, NOT A REGRESSION. A lobby padded with five invented rippers
 *   reads as a busy game and is a lie the visitor cannot detect — the exact reassuring-wrong-
 *   answer shape this project keeps recording. "Nobody is here yet" is TRUE, it is actionable
 *   (bring someone), and it makes the difference between one player and two visible instead of
 *   hidden under fake company. It also means the room's population is now a real measurement:
 *   if it says 3, three people are actually here.
 * ⚠ The bot CHALLENGE path went with them. Nothing can call you out that is not a person.
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

  // ── LocalNet: BroadcastChannel across this device's tabs, merged with /api/presence ──
  function LocalNet() {
    const players = new Map();               // id -> profile
    players.set(me.id, me);
    let bc = null; try { bc = new BroadcastChannel('urm-arena'); } catch {}

    /* ⛔ NO BOT POPULATION. Removed 2026-08-05 on the artist's call. `bots` stays as an empty
     * array rather than being deleted outright because three loops below still name it, and an
     * empty array makes every one of them a no-op that reads correctly — a `bots` that does not
     * exist would throw, and a throw in the lobby tick is how a room stops updating at all. */
    const bots = [];

    const roster = () => [...players.values()].sort((a, b) =>
      (a.me ? -1 : b.me ? 1 : 0) || b.balance - a.balance);          // you, then everyone else
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

    // ── internet-wide presence: heartbeat /api/presence (Vercel + Upstash KV) and
    //    merge the live roster in. Auto-detects: where the API isn't deployed or the
    //    KV isn't configured it goes quiet after one probe and cross-tab presence carries on.
    let kvLive = null;                         // null = unprobed, false = unavailable
    async function kvBeat() {
      if (kvLive === false) return;
      try {
        const r = await fetch('/api/presence', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: me.id, handle: me.handle, balance: me.balance, cards: me.cards,
            status: me.status, verified: me.verified, address: me.address, seek: !!me.seek,
            game: /dogfight/.test(location.pathname) ? 'dogfight' : /section9/.test(location.pathname) ? 'section9' : 'arena' }) });
        if (r.status === 503 || r.status === 404) { kvLive = false; return; }
        const j = await r.json().catch(() => null);
        if (!j || !j.ok) { if (kvLive === null) kvLive = false; return; }
        kvLive = true; let changed = false;
        for (const p of (j.players || [])) {
          if (!p || p.id === me.id) continue;
          players.set(p.id, { ...p, remote: true, lastSeen: Date.now() }); changed = true;
        }
        if (changed) pushLobby();
      } catch { if (kvLive === null) kvLive = false; }
    }
    kvBeat(); const kvTick = setInterval(kvBeat, 5000);

    /* Prune whoever has stopped heartbeating. ⚠ THE STALE WINDOW HAS TO EXCEED THE SLOWEST
     * HEARTBEAT OR REAL PEOPLE FLICKER OUT AND BACK: tabs announce on change, KV beats every
     * 5 s, and the server holds a record for TTL 20 s. 12 s was safe when the room was mostly
     * bots that never expired; with only real players left it is the whole roster, so it is 24 s
     * — one server TTL plus a beat of slack. A lobby that drops people who are still there is
     * indistinguishable from a lobby nobody is in. */
    const tick = setInterval(() => {
      const now = Date.now(); let changed = false;
      players.forEach((p, id) => {
        if (!p.me && p.lastSeen && now - p.lastSeen > 24000) { players.delete(id); changed = true; }
      });
      if (changed) pushLobby();
    }, 4000);

    let pending = null;                        // an outbound challenge awaiting accept

    function startMatch(opponent, oppStack) { me.status = 'battling'; emit('match', { opponent, oppStack: oppStack || null }); }

    return {
      join(profile) { me = { ...me, ...(profile || {}), id: myId, me: true }; players.set(me.id, me); announce(); pushLobby(); },
      setStatus(s) { me.status = s; players.set(me.id, me); announce(); pushLobby(); },
      setSeek(v) { me.seek = !!v; },           // pvp matchmaking flag, carried by the KV heartbeat
      setHandle(h) { me.handle = (h == null ? '' : String(h)).trim().slice(0, 24) || me.handle;
        store.set('urm_net_handle', me.handle); ses.set('urm_net_shandle', me.handle); players.set(me.id, me); announce(); pushLobby(); },
      me: () => me,
      /* ⛔ EVERY CHALLENGE IS NOW A REAL ONE. The `target.bot` branches are gone with the
       * population — a dead branch that silently auto-accepts is worse than none, because the
       * day a real player's record arrives with a stray flag it would start a match against
       * nobody and look like a working game. */
      challenge(id) {
        const target = players.get(id); if (!target) return;
        const cid = 'c_' + uid(); pending = { cid, id };
        if (bc) bc.postMessage({ t: 'challenge', to: id, from: me.id, fromHandle: me.handle, cid });
        return cid;
      },
      accept(ch) {
        if (!ch || !ch.from) return;
        if (bc) bc.postMessage({ t: 'accept', to: ch.from.id, from: me.id, oppStack: null });
        startMatch(ch.from, null);
      },
      decline(ch) { if (bc && ch && ch.from) bc.postMessage({ t: 'decline', to: ch.from.id, from: me.id }); },
      onLobby: cb => { listeners.lobby.push(cb); cb(roster()); },
      onChallenge: cb => listeners.challenge.push(cb),
      onMatch: cb => listeners.match.push(cb),
      dispose() { clearInterval(tick); clearInterval(kvTick); bc && bc.postMessage({ t: 'bye', p: me.id }); },
    };
  }

  let adapter = null;
  const RipNet = {
    LocalNet,
    use(a) { if (adapter && adapter.dispose) adapter.dispose(); adapter = a; return RipNet; },
    _a() { return adapter || (adapter = LocalNet()); },
    join(p) { return this._a().join(p); },
    setStatus(s) { return this._a().setStatus(s); },
    setSeek(v) { return this._a().setSeek(v); },
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

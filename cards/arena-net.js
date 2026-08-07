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
 *   RipNet.onReply(cb)              cb({kind, from})  — YOUR challenge was answered
 *   RipNet.onMatch(cb)              cb({opponent, oppStack})  — go! launch the face-off
 *
 * ⛔ EVERY CHALLENGE USED TO STOP AT THE EDGE OF THE DEVICE, AND THE BUTTON REPORTED SUCCESS.
 *   `challenge()` did one thing — `bc.postMessage(...)` — and a BroadcastChannel is same-browser,
 *   same-machine. Presence, meanwhile, has been internet-wide since /api/presence shipped. So the
 *   lobby correctly showed a real stranger, ArenaLobby correctly drew them a CHALLENGE button,
 *   the click handler correctly ran, and the invitation went nowhere at all: no error, no reject,
 *   no timeout, nothing on either screen. ⚑ THE HALF YOU COULD SEE WAS THE GLOBAL HALF, which is
 *   why this survived — the roster is the visible evidence that "multiplayer works".
 * ⚑ Challenges now ride the SAME heartbeat as the roster (api/presence.js's per-recipient inbox).
 *   BroadcastChannel is kept for the same-device case because it is instant and free, so every
 *   message goes out both ways and arrivals are de-duplicated by (cid, kind).
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

  /* ⛔ ONE-TIME REPAIR: EVICT A POISONED HANDLE. `dogfight.html` and `js/s9pc-ui.js` joined with
   *   `localStorage.getItem('urm_net_handle') || 'you'`, and `setHandle` used to persist 'you'
   *   when the box was cleared — so browsers are carrying `urm_net_handle = "you"` right now, and
   *   localStorage is SHARED BY EVERY TAB. Guarding the writers stops it happening again and does
   *   nothing for a key that is already wrong: the artist's own lobby showed THREE rippers, all
   *   called "you", which is the one thing a roster exists not to do.
   * ⚠ It clears rather than renames. The line below then falls through to the per-tab gonzo
   *   handle, so each tab gets a distinct name immediately and anyone who deliberately chose a
   *   real name keeps it — only the reserved word is evicted. */
  (() => { const h = (store.get('urm_net_handle') || '').trim();
    if (h && /^you$/i.test(h)) { try { localStorage.removeItem('urm_net_handle'); } catch (e) {} }
    const sh = (ses.get('urm_net_shandle') || '').trim();
    if (sh && /^you$/i.test(sh)) { try { sessionStorage.removeItem('urm_net_shandle'); } catch (e) {} } })();

  /* ⛔ TWENTY NAMES IS NOT AN IDENTITY SPACE. An auto-assigned handle is drawn from HANDLES, and
   *   with 20 of them a six-player room collides better than half the time (birthday problem) —
   *   two people rendered identically, which is the exact complaint the poisoned "you" produced
   *   and would have kept producing after it was fixed. Measured: two fresh tabs came up as
   *   "Godzilla's Accountant" twice on the first run of the repair.
   * ⚠ The suffix is the TAB's own id, so it is stable for that tab and unique by construction —
   *   and it is only added to a name nobody chose. A handle you type is used exactly as typed. */
  const myHandle = store.get('urm_net_handle') || ses.get('urm_net_shandle')
    || (() => { const v = pick(HANDLES) + ' ' + myId.slice(-3); ses.set('urm_net_shandle', v); return v; })();
  let me = { id: myId, handle: myHandle, balance: 0, cards: 0, status: 'idle', bot: false, me: true };

  const listeners = { lobby: [], challenge: [], match: [], reply: [] };
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
      /* ⚠ SAME (cid, kind) DEDUP AS THE WIRE. Two tabs of one browser are on BOTH transports, so
       * without this every same-device challenge raises the toast twice. */
      else if (m.t === 'challenge' && m.to === me.id && fresh(m.cid + ':call')) {
        emit('challenge', { id: m.cid, from: players.get(m.from) || { handle: m.fromHandle, id: m.from } }); }
      else if (m.t === 'accept' && m.to === me.id && fresh((m.cid || m.from) + ':accept')) {
        pending = null; startMatch(players.get(m.from), m.oppStack); }
      else if (m.t === 'decline' && m.to === me.id && fresh((m.cid || m.from) + ':decline')) {
        pending = null; emit('reply', { kind: 'decline', from: players.get(m.from) || { id: m.from, handle: m.fromHandle || 'a ripper' } }); }
    };
    addEventListener('beforeunload', () => bc && bc.postMessage({ t: 'bye', p: me.id }));

    // ── internet-wide presence: heartbeat /api/presence (Vercel + Upstash KV) and
    //    merge the live roster in. Auto-detects: where the API isn't deployed or the
    //    KV isn't configured it goes quiet after one probe and cross-tab presence carries on.
    let kvLive = null;                         // null = unprobed, false = unavailable
    let pending = null;                        // an outbound challenge awaiting an answer
    let outbox = [];                           // envelopes waiting for the next beat
    /* ⚠ De-duplicate on (cid, kind), not on cid. Every message goes out over BOTH transports, so
     * a same-device peer receives each one twice — and a challenge and its answer share a cid by
     * design, so keying on cid alone would swallow the accept as a repeat of the call. */
    const seen = new Set();
    const fresh = k => { if (seen.has(k)) return false; seen.add(k);
      if (seen.size > 200) seen.delete(seen.values().next().value); return true; };
    const whoIs = m => players.get(m.from) || { id: m.from, handle: m.fromHandle || 'a ripper' };
    /* ⛔ ONLY A PAGE THAT CAN SHOW A CHALLENGE ASKS FOR ONE. Every cabinet heartbeats here; a
     * cabinet with no listener draining its own mailbox would eat an invitation and render
     * nothing, which is strictly worse than leaving it to wait out its 90 s server TTL. */
    const wantInbox = () => listeners.challenge.length > 0 || listeners.reply.length > 0;

    function takeInbox(list) {
      for (const raw of (list || [])) {
        let m = raw; if (typeof m === 'string') { try { m = JSON.parse(m); } catch { continue; } }
        if (!m || !m.cid || !m.kind || !fresh(m.cid + ':' + m.kind)) continue;
        if (m.kind === 'call') emit('challenge', { id: m.cid, from: whoIs(m), remote: true });
        else if (!pending || pending.cid !== m.cid) continue;   // an answer to a call we did not make
        else if (m.kind === 'accept') { const who = whoIs(m); pending = null; startMatch(who, null); }
        else { const who = whoIs(m); pending = null; emit('reply', { kind: 'decline', from: who }); }
      }
    }

    async function kvBeat() {
      if (kvLive === false) return;
      const ch = outbox; outbox = [];          // ⚠ take it BEFORE the await, or a challenge issued
      try {                                    //   mid-flight is cleared without ever being sent
        const r = await fetch('/api/presence', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: me.id, handle: me.handle, balance: me.balance, cards: me.cards,
            status: me.status, verified: me.verified, address: me.address, seek: !!me.seek,
            game: /dogfight/.test(location.pathname) ? 'dogfight' : /section9/.test(location.pathname) ? 'section9' : 'arena',
            ...(ch.length ? { ch } : {}), ...(wantInbox() ? { inbox: 1 } : {}) }) });
        if (r.status === 503 || r.status === 404) { kvLive = false; return; }
        const j = await r.json().catch(() => null);
        if (!j || !j.ok) { if (kvLive === null) kvLive = false; return; }
        kvLive = true; let changed = false;
        for (const p of (j.players || [])) {
          if (!p || p.id === me.id) continue;
          players.set(p.id, { ...p, remote: true, lastSeen: Date.now() }); changed = true;
        }
        if (changed) pushLobby();
        takeInbox(j.inbox);
      } catch {
        if (kvLive === null) kvLive = false;
        /* ⚠ PUT AN UNSENT CHALLENGE BACK. A dropped fetch is the one moment a person is actively
         * waiting on this, and losing it here is indistinguishable from the bug this file was
         * rewritten to fix — the button pressed, nothing happening, nothing said. */
        if (ch.length && kvLive !== false) outbox = ch.concat(outbox).slice(0, 4);
      }
    }
    /* ⚑ A CHALLENGE DOES NOT WAIT FOR THE NEXT TICK. Up to 5 s of nothing after pressing a button
     * reads as a broken control, and the person on the other end is standing in a lobby. */
    const wire = env => { outbox.push(env); if (outbox.length > 4) outbox.shift(); kvBeat(); };
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

    function startMatch(opponent, oppStack) { me.status = 'battling'; emit('match', { opponent, oppStack: oppStack || null }); }

    return {
      /* ⛔ A CALLER MUST NOT BE ABLE TO CLOBBER THE HANDLE WITH NOTHING. Every tab is born with a
       * real name (localStorage → sessionStorage → a random gonzo handle), and `dogfight.html`
       * and `js/s9pc-ui.js` both joined with `localStorage.getItem('urm_net_handle') || 'you'` —
       * which is EMPTY for anyone who has never set one, so they published the literal string
       * "you" over the wire. Every player looked like "you" to every other player, on the one
       * screen whose entire job is telling people apart.
       * ⚑ `'you'` IS A UI LABEL FOR YOUR OWN ROW, NEVER A NAME. Rejecting it here is the single
       * chokepoint: six pages read a handle and any one of them can be written carelessly again,
       * but they all arrive through this function. */
      join(profile) {
        const p = Object.assign({}, profile || {});
        if (!p.handle || !String(p.handle).trim() || /^you$/i.test(String(p.handle).trim())) delete p.handle;
        me = { ...me, ...p, id: myId, me: true }; players.set(me.id, me); announce(); pushLobby(); },
      setStatus(s) { me.status = s; players.set(me.id, me); announce(); pushLobby(); },
      setSeek(v) { me.seek = !!v; },           // pvp matchmaking flag, carried by the KV heartbeat
      /* ⚠ AND CLEARING THE BOX MUST NOT PERSIST "you" EITHER. `battle.html` defaulted an empty
       * field to 'you' and then wrote it to localStorage — which is SHARED BY EVERY TAB, so one
       * careless keystroke renamed the whole browser to "you", permanently, on every page. An
       * empty or reserved name keeps the name you already had. */
      setHandle(h) {
        const t = (h == null ? '' : String(h)).trim().slice(0, 24);
        me.handle = (!t || /^you$/i.test(t)) ? me.handle : t;
        store.set('urm_net_handle', me.handle); ses.set('urm_net_shandle', me.handle); players.set(me.id, me); announce(); pushLobby(); },
      me: () => me,
      /* ⛔ EVERY CHALLENGE IS NOW A REAL ONE. The `target.bot` branches are gone with the
       * population — a dead branch that silently auto-accepts is worse than none, because the
       * day a real player's record arrives with a stray flag it would start a match against
       * nobody and look like a working game. */
      /* ⚑ BOTH TRANSPORTS, EVERY TIME. BroadcastChannel is instant and free but stops at this
       * machine; the wire reaches anyone. Sending over both and de-duplicating on arrival is one
       * line cheaper than deciding per-recipient which one to use — and a decision like that is
       * exactly what was wrong here, because `remote` is a flag that can simply be missing. */
      challenge(id) {
        const target = players.get(id); if (!target) return;
        const cid = 'c_' + uid(); pending = { cid, id };
        if (bc) bc.postMessage({ t: 'challenge', to: id, from: me.id, fromHandle: me.handle, cid });
        wire({ cid, to: id, kind: 'call', fromHandle: me.handle });
        return cid;
      },
      accept(ch) {
        if (!ch || !ch.from) return;
        if (bc) bc.postMessage({ t: 'accept', to: ch.from.id, from: me.id, cid: ch.id, oppStack: null });
        if (ch.id) wire({ cid: ch.id, to: ch.from.id, kind: 'accept', fromHandle: me.handle });
        startMatch(ch.from, null);
      },
      decline(ch) {
        if (!ch || !ch.from) return;
        if (bc) bc.postMessage({ t: 'decline', to: ch.from.id, from: me.id, cid: ch.id });
        if (ch.id) wire({ cid: ch.id, to: ch.from.id, kind: 'decline', fromHandle: me.handle });
      },
      /* ⚠ THE CHALLENGER USED TO GET NOTHING BACK, EVER — a decline re-emitted the lobby and the
       * person who pressed the button was left watching a roster. An unanswered invitation and a
       * refused one look identical from the outside, so refusal has to be said out loud. */
      pending: () => pending,
      roster: () => roster(),                  // a read, for driven checks — never leaks a listener
      onLobby: cb => { listeners.lobby.push(cb); cb(roster()); },
      onChallenge: cb => listeners.challenge.push(cb),
      onReply: cb => listeners.reply.push(cb),
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
    /* the one place a page should ask "what am I called" — never `localStorage || 'you'` */
    handle() { try { return this._a().me().handle || 'a ripper'; } catch (e) { return 'a ripper'; } },
    challenge(id) { return this._a().challenge(id); },
    accept(ch) { return this._a().accept(ch); },
    decline(ch) { return this._a().decline(ch); },
    pending() { const a = this._a(); return a.pending ? a.pending() : null; },
    roster() { const a = this._a(); return a.roster ? a.roster() : []; },
    onLobby(cb) { return this._a().onLobby(cb); },
    onChallenge(cb) { return this._a().onChallenge(cb); },
    onReply(cb) { const a = this._a(); return a.onReply ? a.onReply(cb) : undefined; },
    onMatch(cb) { return this._a().onMatch(cb); },
  };
  window.RipNet = RipNet;
})();

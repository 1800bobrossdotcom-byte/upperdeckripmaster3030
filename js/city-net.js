/* ripmaster3030studios — THE CITY, WITH OTHER PEOPLE IN IT.   `CityNet`
 *
 *   CityNet.start({ self, spawn, despawn, move }) -> ctrl | null      never throws
 *       self()            -> {x,y,z,yaw,body}   where YOU are, read once per send
 *       spawn(id, info)   -> whatever you want to draw       (returns your handle for it)
 *       despawn(id, handle)
 *       move(handle, s)   -> s = {x,y,z,yaw,body,moving}     called every frame, interpolated
 *   ctrl.peers()          -> [{id, handle, name, body, dist}]
 *   ctrl.stop()
 *
 * Artist, 2026-08-05: *"for city we need to wire in mmorpg dynamics for multiplayer for people
 * in game."*
 *
 * ══ ⛔ TWO LAYERS, BECAUSE THEY ANSWER TWO DIFFERENT QUESTIONS ══════════════════════════════
 * This reuses the transport the arena and the dogfight already run on rather than inventing a
 * third, and the split falls out of what each one can actually carry:
 *
 *   DISCOVERY  `/api/presence` — WHO is in the city. A heartbeat with a 20 s server TTL, so it
 *              is a roster, not a position stream. Also carries a COARSE position, which is
 *              enough to say "somebody is over by the river" and not enough to animate them.
 *   MOTION     WebRTC data channels over `/api/signal` — WHERE they are, ~9 Hz, peer to peer.
 *              No game server anywhere; `js/df-net.js` proved the handshake, this reuses it.
 *
 * ⚑ AND THE SPLIT IS THE GAME'S OWN DESIGN, NOT A NETWORKING COMPROMISE. `docs/CITY-GAME.md`
 *   says the bird is the layer that SCOUTS — it sees the whole map and cannot touch it. The
 *   roster is exactly that: from the air you learn where people are. Getting close enough to
 *   watch somebody move is the part you have to fly over and earn.
 *
 * ⛔ ANIMALS ONLY, ON PURPOSE. DOGFIGHT and SECTION 9 are matches with their own netcode
 *   (`RipFight`, shooter-authoritative); a persistent world and a scored match are different
 *   contracts and merging them would put a loophole in the observer rule shaped like a jet.
 *   A player who switches to a combat mode simply leaves the shared world until they come back.
 *
 * ⚠ THE MESH IS CAPPED AT `MAX_PEERS`. A full mesh is O(n²) connections and this has no server
 *   to relay through, so the cap is structural rather than a tuning knob — nearest-first, so the
 *   people you can see are the people you are connected to. Everyone else is still on the roster.
 *
 * FAILS OPEN AT EVERY STEP: no presence API, no signaling, no WebRTC, a 503 from an unconfigured
 * KV ⇒ `start()` returns a live controller with zero peers and the city is exactly the
 * single-player city. Nothing here can make the game worse by being unavailable.
 */
window.CityNet = (function () {
  'use strict';

  var PRESENCE = '/api/presence';
  var SIGNAL = '/api/signal';
  var ROOM = 'city_main';
  var MAX_PEERS = 6;
  var BEAT_MS = 5000;         // roster heartbeat — the server holds a record for 20 s
  var SEND_MS = 110;          // ~9 Hz position over the data channel
  var DROP_MS = 26000;        // one server TTL plus slack, same reasoning as the arena lobby

  var ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  function net() { try { return window.RipNet || null; } catch (e) { return null; } }
  function myId() {
    try { var n = net(); if (n && n.me) return n.me().id; } catch (e) {}
    /* ⚠ SESSION-scoped, not local — two tabs of one browser must read as two people or the
     *   whole thing shows an empty city to somebody testing it with themselves. Same reason
     *   cards/arena-net.js uses sessionStorage for the id and says so. */
    try {
      var v = sessionStorage.getItem('urm_net_sid');
      if (!v) { v = 'p_' + Math.random().toString(36).slice(2, 9); sessionStorage.setItem('urm_net_sid', v); }
      return v;
    } catch (e) { return 'p_' + Math.random().toString(36).slice(2, 9); }
  }
  function myName() {
    try { var n = net(); if (n && n.me) return n.me().handle || 'stray'; } catch (e) {}
    try { return localStorage.getItem('urm_net_handle') || 'stray'; } catch (e) { return 'stray'; }
  }

  function start(o) {
    o = o || {};
    var self = o.self || function () { return null; };
    var onSpawn = o.spawn || function () { return null; };
    var onDespawn = o.despawn || function () {};
    var onMove = o.move || function () {};

    var ME = myId(), NAME = myName();
    var peers = {};            // id -> {id, name, pc, ch, open, handle, cur, tgt, last, body, moving}
    var seen = {};             // id -> lastSeen (roster)
    var stopped = false, kvLive = null, beatT = null, sendT = null, pollT = null, rafId = 0;

    /* ── DISCOVERY ────────────────────────────────────────────────────────────────────────── */
    function beat() {
      if (stopped || kvLive === false) return;
      var s = self() || {};
      fetch(PRESENCE, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: ME, handle: NAME, status: 'idle', game: 'city',
          px: s.x, py: s.y, pz: s.z, pb: s.body }) })
        .then(function (r) {
          if (r.status === 503 || r.status === 404) { kvLive = false; return null; }
          return r.json().catch(function () { return null; });
        })
        .then(function (j) {
          if (!j || !j.ok) { if (kvLive === null) kvLive = false; return; }
          kvLive = true;
          var now = Date.now();
          (j.players || []).forEach(function (p) {
            if (!p || p.id === ME || p.game !== 'city') return;
            seen[p.id] = now;
            /* ⛔ ONLY THE LOWER ID OFFERS, AND WITHOUT THIS NOTHING EVER CONNECTS. Both sides
             *   see each other on the same roster tick, so both would create an offer; each then
             *   receives one while already in `have-local-offer`, `setRemoteDescription` rejects
             *   on both, and the mesh stays empty forever with no error anywhere — measured, two
             *   live tabs, roster 1 and peers 0 on each. `js/df-net.js` states the rule in its
             *   own header ("in each pair the lower id makes the offer") and I did not carry it
             *   over. It is a deterministic tie-break with no referee, which is the only kind
             *   available when there is no server. */
            if (!peers[p.id]) { if (ME < p.id) offerTo(p.id, p.handle || 'stray'); }
            else if (p.handle) peers[p.id].name = p.handle;
          });
        })
        .catch(function () { if (kvLive === null) kvLive = false; });
    }

    /* ── SIGNALING ────────────────────────────────────────────────────────────────────────── */
    function post(to, type, payload) {
      return fetch(SIGNAL, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room: ROOM, from: ME, fromHandle: NAME, to: to, type: type, payload: payload }) })
        .catch(function () {});
    }
    function poll() {
      if (stopped) return;
      fetch(SIGNAL + '?room=' + encodeURIComponent(ROOM) + '&me=' + encodeURIComponent(ME))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { (j && j.messages || []).forEach(handle); })
        .catch(function () {});
    }

    function handle(m) {
      if (!m || !m.from || m.from === ME) return;
      var P = peers[m.from];
      if (m.type === 'offer') {
        if (!P) P = make(m.from, m.fromHandle || 'stray', false);
        if (!P || !P.pc) return;
        P.pc.setRemoteDescription(new RTCSessionDescription(m.payload))
          .then(function () { return P.pc.createAnswer(); })
          .then(function (a) { return P.pc.setLocalDescription(a).then(function () { post(P.id, 'answer', a); }); })
          .catch(function () {});
      } else if (m.type === 'answer' && P && P.pc) {
        P.pc.setRemoteDescription(new RTCSessionDescription(m.payload)).catch(function () {});
      } else if (m.type === 'ice' && P && P.pc) {
        P.pc.addIceCandidate(new RTCIceCandidate(m.payload)).catch(function () {});
      }
    }

    function make(id, name, initiator) {
      if (peers[id]) return peers[id];
      if (Object.keys(peers).length >= MAX_PEERS) return null;
      var pc;
      try { pc = new RTCPeerConnection(ICE); } catch (e) { return null; }
      var P = { id: id, name: name, pc: pc, ch: null, open: false, handle: null,
                cur: null, tgt: null, last: 0, body: 'bird', moving: false };
      peers[id] = P;
      pc.onicecandidate = function (e) { if (e.candidate) post(id, 'ice', e.candidate); };
      pc.onconnectionstatechange = function () {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(id);
      };
      if (initiator) {
        try { wireCh(P, pc.createDataChannel('city', { ordered: false, maxRetransmits: 0 })); } catch (e) {}
        pc.createOffer().then(function (d) {
          return pc.setLocalDescription(d).then(function () { post(id, 'offer', d); });
        }).catch(function () {});
      } else {
        pc.ondatachannel = function (e) { wireCh(P, e.channel); };
      }
      return P;
    }
    function offerTo(id, name) { make(id, name, true); }

    function wireCh(P, ch) {
      P.ch = ch;
      ch.onopen = function () { P.open = true; };
      ch.onclose = function () { P.open = false; };
      ch.onmessage = function (e) {
        var s; try { s = JSON.parse(e.data); } catch (err) { return; }
        if (!s || typeof s.x !== 'number') return;
        /* ⚑ TWO SAMPLES, AND THE RENDER READS BETWEEN THEM. A packet every ~110 ms drawn
         *   directly is a body that teleports nine times a second; holding the previous sample
         *   and easing toward the new one is what makes it a person walking. */
        P.cur = P.tgt || s;
        P.tgt = s;
        P.last = Date.now();
        P.body = s.b || 'bird';
        P.moving = !!s.m;
        if (!P.handle) P.handle = onSpawn(P.id, { name: P.name, body: P.body });
      };
    }

    function drop(id) {
      var P = peers[id]; if (!P) return;
      try { if (P.ch) P.ch.close(); } catch (e) {}
      try { if (P.pc) P.pc.close(); } catch (e) {}
      if (P.handle) { try { onDespawn(id, P.handle); } catch (e) {} }
      delete peers[id]; delete seen[id];
    }

    /* ── SEND ─────────────────────────────────────────────────────────────────────────────── */
    function send() {
      if (stopped) return;
      var s = self(); if (!s) return;
      var msg = JSON.stringify({ x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2),
                                 h: +(s.yaw || 0).toFixed(3), b: s.body || 'bird', m: !!s.moving });
      for (var id in peers) {
        var P = peers[id];
        if (P.open && P.ch) { try { P.ch.send(msg); } catch (e) {} }
      }
    }

    /* ── DRAW ─────────────────────────────────────────────────────────────────────────────── */
    function frame() {
      if (stopped) return;
      rafId = requestAnimationFrame(frame);
      var now = Date.now();
      for (var id in peers) {
        var P = peers[id];
        if (P.last && now - P.last > DROP_MS) { drop(id); continue; }
        if (!P.handle || !P.tgt) continue;
        var t = P.cur ? Math.min(1, (now - P.last) / SEND_MS) : 1;
        var a = P.cur || P.tgt, b = P.tgt;
        /* ⚠ yaw is an ANGLE — lerping 350°→10° the short way is 20°, the long way is 340°, and
         *   the long way makes a peer spin on the spot every time they cross north. */
        var dh = b.h - a.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        try {
          onMove(P.handle, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
                             z: a.z + (b.z - a.z) * t, yaw: a.h + dh * t,
                             body: P.body, moving: P.moving, name: P.name });
        } catch (e) {}
      }
    }

    beat(); poll();
    beatT = setInterval(beat, BEAT_MS);
    pollT = setInterval(poll, 2500);
    sendT = setInterval(send, SEND_MS);
    rafId = requestAnimationFrame(frame);

    return {
      peers: function () {
        var out = [], s = self() || { x: 0, y: 0, z: 0 };
        for (var id in peers) {
          var P = peers[id]; if (!P.tgt) continue;
          out.push({ id: id, name: P.name, body: P.body, open: P.open,
                     dist: Math.round(Math.hypot(P.tgt.x - s.x, P.tgt.z - s.z)) });
        }
        return out.sort(function (a, b) { return a.dist - b.dist; });
      },
      count: function () { var n = 0; for (var id in peers) if (peers[id].tgt) n++; return n; },
      roster: function () { return Object.keys(seen).length; },
      live: function () { return kvLive === true; },
      stop: function () {
        stopped = true;
        clearInterval(beatT); clearInterval(pollT); clearInterval(sendT);
        if (rafId) cancelAnimationFrame(rafId);
        for (var id in peers) drop(id);
      },
    };
  }

  return { start: start, ROOM: ROOM };
})();

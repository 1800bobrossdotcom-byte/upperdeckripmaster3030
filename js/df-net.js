/* upperdeckripmaster3030 — RipFight (window.RipFight): dogfight PvP netcode.
 *
 * Real pilots, real craft, one arena. Matchmaking rides the presence roster
 * (/api/presence, seek flag), the WebRTC handshake is carried by the
 * /api/signal mailbox, and then EVERYTHING in-match flows peer-to-peer over
 * RTCDataChannels — position/heading state at ~11Hz, fire events, and
 * shooter-authoritative hit messages. No game server anywhere.
 *
 *   RipFight.seek(cb)        start hunting; cb(nFound) as seekers appear
 *   RipFight.cancel()        stop hunting
 *   RipFight.onMatch(cb)     cb([{id,handle}...]) once channels are open
 *   RipFight.send(obj)       broadcast to every open peer
 *   RipFight.sendTo(id,obj)  one peer
 *   RipFight.onMsg(cb)       cb(peerId, obj)
 *
 * Pairing is deterministic with no referee: seekers sort by id, the first four
 * form the room (named after the lowest id), and in each pair the lower id
 * makes the offer.
 */
(() => {
  const SIG = '/api/signal';
  const N = () => window.RipNet || null;
  const myId = () => { try { return N() && N().me().id; } catch { return null; } };
  const myHandle = () => { try { return (N() && N().me().handle) || 'pilot'; } catch { return 'pilot'; } };

  let seeking = false, seekCb = null, matched = false, userMatch = null, msgCb = null;
  let seekT = null, pollT = null, room = null;
  const peers = new Map();          // id -> {id, handle, pc, ch, open, q, haveRemote}

  async function post(to, type, payload) {
    try { await fetch(SIG, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room, from: myId(), fromHandle: myHandle(), to, type, payload }) }); } catch {}
  }

  function fireMatch() {
    if (matched) return; matched = true;
    seeking = false; clearInterval(seekT); seekT = null;
    try { N() && N().setSeek && N().setSeek(false); } catch {}
    setTimeout(() => {                                     // grace so simultaneous peers finish opening
      const list = [...peers.values()].filter(p => p.open).map(p => ({ id: p.id, handle: p.handle }));
      if (list.length && userMatch) userMatch(list);
      if (pollT) { clearInterval(pollT); pollT = null; }   // signaling done; combat is pure P2P now
    }, 900);
  }

  function wire(P, ch) {
    ch.onopen = () => { P.open = true; fireMatch(); };
    ch.onmessage = e => { try { msgCb && msgCb(P.id, JSON.parse(e.data)); } catch {} };
    ch.onclose = () => { P.open = false; };
    return ch;
  }

  function mkPeer(id, handle, offerer) {
    if (peers.has(id)) return peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const P = { id, handle: handle || 'pilot', pc, ch: null, open: false, q: [], haveRemote: false };
    peers.set(id, P);
    pc.onicecandidate = e => { if (e.candidate) post(id, 'ice', e.candidate); };
    if (offerer) {
      P.ch = wire(P, pc.createDataChannel('df', { ordered: true }));
      pc.createOffer().then(o => pc.setLocalDescription(o).then(() => post(id, 'offer', o))).catch(() => {});
    } else pc.ondatachannel = e => { P.ch = wire(P, e.channel); };
    return P;
  }

  async function onSig(m) {
    const P = peers.get(m.from) || mkPeer(m.from, m.fromHandle, false);
    try {
      if (m.type === 'offer') {
        await P.pc.setRemoteDescription(m.payload); P.haveRemote = true;
        P.q.splice(0).forEach(c => P.pc.addIceCandidate(c).catch(() => {}));
        const a = await P.pc.createAnswer(); await P.pc.setLocalDescription(a); post(m.from, 'answer', a);
      } else if (m.type === 'answer') {
        await P.pc.setRemoteDescription(m.payload); P.haveRemote = true;
        P.q.splice(0).forEach(c => P.pc.addIceCandidate(c).catch(() => {}));
      } else if (m.type === 'ice') {
        if (P.haveRemote) P.pc.addIceCandidate(m.payload).catch(() => {});
        else P.q.push(m.payload);
      }
    } catch {}
  }

  async function poll() {
    if (!room) return;
    try {
      const r = await fetch(SIG + '?room=' + encodeURIComponent(room) + '&me=' + encodeURIComponent(myId()));
      const j = await r.json(); (j && j.msgs || []).forEach(onSig);
    } catch {}
  }

  async function seekLoop() {
    if (!seeking || matched) return;
    try {
      try { N() && N().setSeek && N().setSeek(true); } catch {}
      const r = await fetch('/api/presence'); const j = await r.json();
      const cands = ((j && j.players) || []).filter(p => p && p.seek && p.game === 'dogfight' && p.id !== myId());
      seekCb && seekCb(cands.length);
      if (!cands.length) return;
      const group = [{ id: myId(), handle: myHandle() }, ...cands]
        .sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, 4);
      if (!group.some(g => g.id === myId())) return;        // room full without me — keep seeking
      room = 'df_' + group[0].id.replace(/[^A-Za-z0-9_]/g, '');
      for (const g of group) if (g.id !== myId() && !peers.has(g.id) && myId() < g.id) mkPeer(g.id, g.handle, true);
      if (!pollT) { pollT = setInterval(poll, 1200); poll(); }
    } catch {}
  }

  window.RipFight = {
    id: () => myId(),
    seeking: () => seeking,
    peersOpen: () => [...peers.values()].filter(p => p.open).length,
    seek(cb) { seekCb = cb || null; if (seeking) return; seeking = true; matched = false;
      seekT = setInterval(seekLoop, 1800); seekLoop(); },
    cancel() { seeking = false; clearInterval(seekT); seekT = null;
      if (pollT && !matched) { clearInterval(pollT); pollT = null; }
      try { N() && N().setSeek && N().setSeek(false); } catch {} },
    onMatch(cb) { userMatch = cb; },
    onMsg(cb) { msgCb = cb; },
    send(o) { const s = JSON.stringify(o); peers.forEach(p => { if (p.open) { try { p.ch.send(s); } catch {} } }); },
    sendTo(id, o) { const p = peers.get(id); if (p && p.open) { try { p.ch.send(JSON.stringify(o)); } catch {} } },
  };
})();

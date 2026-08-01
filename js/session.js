/* upperdeckripmaster3030 — SEATS (window.RipSession).
 *
 * One question, three ways to answer it: "may this wallet play other people?"
 *
 *   DOOR A · HOLDER     holds >= holderMin $3030            (mainnet read)
 *   DOOR B · COLLECTOR  holds >= 1 card/lens                  (mainnet 721 read)
 *   DOOR C · VISITOR    paid the Base arcade fee              (Base receipt read)
 *
 * All three mint the same thing — a SEAT — and matchmaking never asks which door you
 * came through. That is the whole point: holders, collectors and paying visitors land
 * in one lobby and play each other.
 *
 * ── The split this module is built on ────────────────────────────────────────────
 * ENTRY is a read-only problem; STAKES are a custody problem. Proving you hold
 * something is three `eth_call`s and needs no contract, no escrow and no audit, and it
 * works across chains because each door reads its OWN chain over a public RPC rather
 * than whatever chain the wallet happens to be on. Holding a pot is a different job
 * and lives in the Phase-2 escrow contract. This file deliberately only does entry.
 *
 * ⚠ CLIENT-SIDE ONLY — READ THIS BEFORE TRUSTING A SEAT FOR ANYTHING THAT COSTS MONEY.
 * There is no backend here, so a seat is *advisory*. The SIWE signature is produced and
 * kept, but nothing verifies it server-side, and every door's result is computed in a
 * browser the player controls. Good enough to open a lobby and shape the UI; NOT good
 * enough to settle a wager. `seat.siwe` carries the message + signature + nonce
 * precisely so a server can verify them later — that is the next slice, and until it
 * exists no real value should depend on `seat.ok`.
 *
 *   RipSession.signIn()      connect -> SIWE sign -> check doors -> seat
 *   RipSession.refresh()     re-check the doors for the current address
 *   RipSession.signOut()     drop the local session
 *   RipSession.get()         current seat, synchronous, never null
 *   RipSession.on(cb)        seat changes
 *   RipSession.mountBadge(el) drop-in lobby UI
 */
window.RipSession = (function () {
  const CFG = () => window.RIPMASTER_CHAIN || {};
  const W = () => window.RipWallet || null;
  const LSK = 'urm_seat_v1';
  const TTL = 12 * 60 * 60e3;                       // a seat lasts half a day, then re-sign
  const ZERO = /^0x0+$/;
  const isAddr = a => /^0x[0-9a-fA-F]{40}$/.test(a || '') && !ZERO.test(a);

  const listeners = [];
  const emit = () => listeners.forEach(f => { try { f(seat); } catch (e) {} });

  const EMPTY = () => ({
    ok: false, address: null, door: null, chainId: null, siwe: null, checkedAt: 0,
    doors: {
      holder:    { open: false, configured: false, balance: 0, need: 0 },
      collector: { open: false, configured: false, count: 0, verified: false },
      visitor:   { open: false, configured: false, plays: 0, verified: false },
    },
  });
  let seat = EMPTY();

  // ── raw JSON-RPC. Each door reads its own chain directly, so a wallet sitting on Base
  //    can still prove a mainnet $3030 balance without being asked to switch networks.
  async function rpc(urls, method, params) {
    for (const url of (urls || [])) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
        if (!r.ok) continue;
        const j = await r.json();
        if (j && j.result !== undefined) return j.result;
      } catch (e) { /* try the next endpoint */ }
    }
    return null;
  }
  const tokenRpcs = () => (CFG().rpcs || []).slice();
  const baseRpcs = () => (CFG().baseRpcs || ['https://mainnet.base.org']).slice();
  const call = (urls, to, data) => rpc(urls, 'eth_call', [{ to, data }, 'latest']);
  const balanceOfData = a => '0x70a08231' + '000000000000000000000000' + String(a).slice(2).toLowerCase();
  const big = hex => { try { return BigInt(hex || '0x0'); } catch (e) { return 0n; } };

  // ── DOOR A · holder ──────────────────────────────────────────────────────────────
  async function checkHolder(addr) {
    const token = (CFG().contracts || {}).liquidEdition, need = Math.max(0, +(CFG().holderMin || 0));
    const d = { open: false, configured: isAddr(token), balance: 0, need };
    if (!d.configured) return d;
    const wei = big(await call(tokenRpcs(), token, balanceOfData(addr)));
    d.balance = Number(wei / (10n ** 18n));
    d.open = d.balance >= need;
    return d;
  }

  // ── DOOR B · collector ───────────────────────────────────────────────────────────
  // The lens 721 is Phase-2 and not deployed yet. Until its address is configured this
  // falls back to the local vault, flagged verified:false so nothing downstream mistakes
  // a localStorage array for proof of ownership.
  async function checkCollector(addr) {
    const lens = (CFG().contracts || {}).lens721;
    const d = { open: false, configured: isAddr(lens), count: 0, verified: false };
    if (d.configured) {
      d.count = Number(big(await call(tokenRpcs(), lens, balanceOfData(addr))));
      d.verified = true;
    } else {
      try { d.count = (JSON.parse(localStorage.getItem('urm_vault') || '[]') || []).length; } catch (e) { d.count = 0; }
    }
    d.open = d.count >= 1;
    return d;
  }

  // ── DOOR C · visitor ─────────────────────────────────────────────────────────────
  // RipEth banks arcade credits in localStorage against the tx hashes that paid for them.
  // The credit count is forgeable; the receipts are not — so re-read each hash on Base and
  // only count a play as real when the transaction actually landed in the coin box.
  async function checkVisitor(addr) {
    const R = window.RipEth || null;
    const d = { open: false, configured: !!R, plays: 0, verified: false };
    if (!R) return d;
    try { d.plays = R.plays ? R.plays() | 0 : 0; } catch (e) { d.plays = 0; }
    const hashes = (R.receipts ? (R.receipts() || []) : []).map(t => t && t.h).filter(Boolean).slice(-4);
    for (const h of hashes) {
      const rc = await rpc(baseRpcs(), 'eth_getTransactionReceipt', [h]);
      if (!rc || big(rc.status) !== 1n) continue;                      // pending or reverted
      const to = String(rc.to || '').toLowerCase();
      if (R.payTo && to === String(R.payTo()).toLowerCase()) { d.verified = true; break; }
    }
    // The receipt is the seat, not the credit count — editing localStorage to 99 plays buys
    // nothing. A just-sent payment reads as unverified for the few seconds before it lands.
    d.open = d.plays > 0 && d.verified;
    return d;
  }

  // ── SIWE (EIP-4361) ──────────────────────────────────────────────────────────────
  function nonce() {
    const b = new Uint8Array(12);
    (self.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => b[i] = (Math.random() * 256) | 0);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }
  function siweMessage(addr, n, chainId) {
    const now = new Date(), exp = new Date(Date.now() + TTL);
    return [
      `${location.host} wants you to sign in with your Ethereum account:`,
      addr, '',
      'Take a seat in the upperdeckripmaster3030 arena. This is a signature, not a transaction — it moves no funds and costs no gas.',
      '',
      `URI: ${location.origin}`,
      'Version: 1',
      `Chain ID: ${chainId}`,
      `Nonce: ${n}`,
      `Issued At: ${now.toISOString()}`,
      `Expiration Time: ${exp.toISOString()}`,
    ].join('\n');
  }
  const toHex = s => '0x' + Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, '0')).join('');

  // ── persistence ──────────────────────────────────────────────────────────────────
  function save() { try { localStorage.setItem(LSK, JSON.stringify({ address: seat.address, siwe: seat.siwe })); } catch (e) {} }
  function restore() {
    try {
      const j = JSON.parse(localStorage.getItem(LSK) || 'null');
      if (!j || !j.siwe || !j.address) return null;
      if (!j.siwe.expiresAt || Date.parse(j.siwe.expiresAt) < Date.now()) return null;   // expired -> re-sign
      return j;
    } catch (e) { return null; }
  }

  async function checkDoors(addr) {
    const [holder, collector, visitor] = await Promise.all([checkHolder(addr), checkCollector(addr), checkVisitor(addr)]);
    seat.doors = { holder, collector, visitor };
    seat.door = holder.open ? 'holder' : collector.open ? 'collector' : visitor.open ? 'visitor' : null;
    seat.ok = !!seat.door && !!seat.siwe;
    seat.checkedAt = Date.now();
    return seat;
  }

  async function refresh() {
    if (!seat.address) return seat;
    await checkDoors(seat.address);
    emit(); return seat;
  }

  async function signIn() {
    const R = W();
    if (!R) return { ok: false, reason: 'no-provider' };
    let addr = R.account();
    if (!addr) { const c = await R.connect(); if (!c.ok) return c; addr = R.account(); }
    if (!addr) return { ok: false, reason: 'no-account' };

    // reuse a live signature rather than nagging for one on every page
    const prev = restore();
    if (prev && String(prev.address).toLowerCase() === String(addr).toLowerCase()) {
      seat.address = prev.address; seat.siwe = prev.siwe;
    } else {
      let chainId = Number(CFG().chainId || 1);
      try { chainId = parseInt(await R.request('eth_chainId'), 16) || chainId; } catch (e) {}
      const n = nonce(), msg = siweMessage(addr, n, chainId);
      let sig;
      try { sig = await R.request('personal_sign', [toHex(msg), addr]); }
      catch (e) { return { ok: false, reason: (e && e.code === 4001) ? 'user-rejected' : 'sign-failed' }; }
      seat.address = addr; seat.chainId = chainId;
      seat.siwe = { message: msg, signature: sig, nonce: n, address: addr, chainId,
                    issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + TTL).toISOString() };
      save();
    }
    await checkDoors(seat.address);
    emit();
    return { ok: true, seat };
  }

  function signOut() { try { localStorage.removeItem(LSK); } catch (e) {} seat = EMPTY(); emit(); return { ok: true }; }

  // pick the session back up on load, and re-check when the wallet changes underneath us
  (async () => {
    const prev = restore(); if (!prev) return;
    seat.address = prev.address; seat.siwe = prev.siwe;
    try { await checkDoors(seat.address); } catch (e) {}
    emit();
  })();
  try { if (W() && W().on) W().on(() => { const a = W().account();
    if (!a || (seat.address && String(a).toLowerCase() !== String(seat.address).toLowerCase())) signOut(); }); } catch (e) {}

  // ── lobby badge ──────────────────────────────────────────────────────────────────
  const DOORS = {
    holder:    { icon: '◈', label: 'holder',    blurb: 'holds $3030' },
    collector: { icon: '◆', label: 'collector', blurb: 'holds a card' },
    visitor:   { icon: '▣', label: 'visitor',   blurb: 'paid on Base' },
  };
  let styled = false;
  function css() {
    if (styled) return; styled = true;
    const s = document.createElement('style'); s.id = 'rip-seat-css';
    s.textContent = [
      ".rip-seat{font-family:'Courier New',ui-monospace,monospace;color:#cfe9d8;text-align:left;border:1px solid rgba(120,180,200,.3);",
      "  border-radius:11px;padding:10px 12px;background:rgba(2,10,14,.6);}",
      ".rip-seat h4{margin:0 0 7px;font-family:'Arial Black',Arial,sans-serif;font-size:11px;letter-spacing:.14em;",
      "  text-transform:uppercase;color:#8fcfe0;font-weight:400;}",
      ".rip-doors{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;}",
      ".rip-door{font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;border:1px solid rgba(120,180,200,.28);",
      "  border-radius:8px;padding:5px 8px;color:#7f9fae;background:rgba(2,10,14,.5);}",
      ".rip-door.on{color:#05121a;background:linear-gradient(180deg,#8bffbb,#2bff80 60%,#0fae56);border-color:#063;}",
      ".rip-seat .rs-note{font-size:10.5px;line-height:1.5;color:#8fb8c8;}",
      ".rip-seat button{font-family:'Arial Black',Arial,sans-serif;font-size:12px;letter-spacing:.05em;text-transform:uppercase;",
      "  cursor:pointer;border-radius:9px;padding:9px 12px;width:100%;color:#05121a;border:1px solid #063;",
      "  background:linear-gradient(180deg,#bfffd8,#2bff80 60%,#0fae56);}",
      ".rip-seat button.ghost{background:transparent;color:#7fd8a8;border-color:#0f5c33;}",
    ].join('');
    document.head.appendChild(s);
  }
  function mountBadge(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return { update: () => {} };
    css(); el.classList.add('rip-seat');
    function render() {
      const s = seat, chips = Object.keys(DOORS).map(k => {
        const d = s.doors[k], D = DOORS[k];
        const detail = k === 'holder' ? (d.open ? `${d.balance}` : `${d.need} needed`)
          : k === 'collector' ? (d.count ? `${d.count} card${d.count === 1 ? '' : 's'}` : 'none')
          : (d.open ? `${d.plays} credit${d.plays === 1 ? '' : 's'}`
             : d.plays ? 'payment confirming…' : 'unpaid');
        return `<span class="rip-door${d.open ? ' on' : ''}">${D.icon} ${D.label} · ${detail}</span>`;
      }).join('');
      const unproven = s.ok && s.door === 'collector' && !s.doors.collector.verified;
      el.innerHTML =
        '<h4>your seat</h4><div class="rip-doors">' + chips + '</div>' +
        (s.ok
          ? `<div class="rs-note">Seated as <b>${DOORS[s.door].label}</b> — you can be matched against anyone in the lobby, whichever door they came through.` +
            (unproven ? ' Card count is local only until the lens contract is live.' : '') +
            '</div><div style="margin-top:8px"><button class="ghost" data-a="out">sign out</button></div>'
          : (s.address
            ? '<div class="rs-note">No open door yet. Hold $3030, hold a card, or drop a coin on Base — any one of them seats you.</div>'
            : '<div class="rs-note">Sign in with your wallet to take a seat. It’s a signature, not a transaction — no gas, no funds moved.</div>' +
              '<div style="margin-top:8px"><button data-a="in">◈ take a seat</button></div>'));
      const b = el.querySelector('[data-a]');
      if (b) b.onclick = async () => {
        if (b.dataset.a === 'out') return signOut();
        b.disabled = true; b.textContent = 'check your wallet…';
        const r = await signIn(); b.disabled = false;
        if (!r.ok) { render(); const n = el.querySelector('.rs-note');
          if (n && W()) n.textContent = W().explain(r.reason); }
      };
    }
    listeners.push(render); render();
    return { update: render };
  }

  return { signIn, signOut, refresh, get: () => seat, on: cb => { listeners.push(cb); return () => {
    const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; }, mountBadge, DOORS };
})();

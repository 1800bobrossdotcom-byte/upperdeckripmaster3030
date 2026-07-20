/* Upperdeck Ripmaster 3030 — the Tavern Ledger (window.RipTavern).
 *
 * A snazzy old-tavern wallet control that wraps window.RipWallet:
 *   • disconnected → a wax-sealed wooden shingle, "Sign the Ledger" (connect)
 *   • connected    → a wood-&-brass chip with a green wax seal + your coin purse
 *   • click the chip → the Ledger opens (a parchment page): your name, wallet mark,
 *                      the house (network), coin purse, buy more, and a red wax
 *                      "Leave the tavern" stamp to DISCONNECT.
 *
 * Mount anywhere:  RipTavern.mount('#tavern')   (selector or element)
 * Refresh purses:  RipTavern.refresh()          (after a burn, etc.)
 */
(() => {
  const W = () => window.RipWallet || null;
  const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const handleOf = a => { try { return localStorage.getItem('urm_net_handle') || sessionStorage.getItem('urm_net_shandle') || short(a); } catch { return short(a); } };
  const mounts = new Set();

  if (!document.getElementById('rip-tavern-css')) {
    const style = document.createElement('style'); style.id = 'rip-tavern-css';
    style.textContent = `
      .tav{ display:inline-flex; vertical-align:middle; }
      .tav-sign,.tav-chip{ font-family:Georgia,'Times New Roman',serif; cursor:pointer; color:#f3e6c8;
        border:2px solid #6b4e1e; background:linear-gradient(180deg,#2c1e0d,#180f06);
        box-shadow:inset 0 1px 0 rgba(255,220,140,.16), 0 5px 0 #100a04, 0 10px 22px -10px #000;
        -webkit-tap-highlight-color:transparent; }
      .tav-sign{ position:relative; display:inline-flex; align-items:center; gap:10px; padding:10px 18px 10px 12px; border-radius:9px;
        font-size:13px; letter-spacing:.09em; text-transform:uppercase; text-shadow:0 1px 0 #000; transition:transform .1s, filter .2s; }
      .tav-sign:hover{ filter:brightness(1.13) saturate(1.05); } .tav-sign:active{ transform:translateY(4px); box-shadow:inset 0 1px 0 rgba(255,220,140,.16), 0 1px 0 #100a04; }
      .tav-wax{ display:grid; place-items:center; width:30px; height:30px; font-family:'Arial Black',sans-serif; font-size:13px;
        border-radius:47% 53% 51% 49%/49% 47% 53% 51%; transform:rotate(-7deg); box-shadow:0 2px 4px rgba(0,0,0,.55), inset 0 2px 3px rgba(255,255,255,.4); }
      .tav-wax.unsigned{ background:radial-gradient(circle at 38% 32%, #ff9cf0, #ff2ad9 55%, #8f0c78); color:#3a0030; }
      .tav-wax.signed{ background:radial-gradient(circle at 38% 32%, #9bffc7, #2bff80 55%, #0d8340); color:#053417; animation:tavSeal 3.2s ease-in-out infinite; }
      @keyframes tavSeal{ 50%{ box-shadow:0 2px 4px rgba(0,0,0,.55), inset 0 2px 3px rgba(255,255,255,.4), 0 0 14px rgba(43,255,128,.6); } }
      .tav-chip{ display:inline-flex; align-items:center; gap:9px; padding:6px 13px 6px 7px; border-radius:9px; }
      .tav-chip:active{ transform:translateY(2px); }
      .tav-chip-body{ display:flex; flex-direction:column; align-items:flex-start; line-height:1.18; }
      .tav-chip-nm{ font-size:12.5px; letter-spacing:.03em; max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .tav-chip-bal{ font-size:10px; letter-spacing:.02em; color:#ffd23b; font-family:'Courier New',monospace; }
      /* the Ledger page */
      .tav-ov{ position:fixed; inset:0; z-index:100000; display:grid; place-items:center; padding:18px;
        background:rgba(6,3,1,.74); backdrop-filter:blur(4px); animation:tavIn .2s ease; }
      @keyframes tavIn{ from{ opacity:0; } }
      .tav-ledger{ position:relative; width:min(384px,94vw); color:#2a1e0c; padding:22px 22px 18px;
        background:linear-gradient(158deg,#efe2c2 0%,#e2d0a6 55%,#d3bd8c 100%); border:1px solid #b49a63; border-radius:5px;
        box-shadow:0 34px 90px -22px #000, inset 0 0 70px rgba(120,90,40,.28); font-family:Georgia,'Times New Roman',serif;
        animation:tavPop .28s cubic-bezier(.3,1.3,.5,1) both; }
      @keyframes tavPop{ from{ transform:translateY(14px) scale(.96); opacity:0; } }
      .tav-ledger::before{ content:""; position:absolute; inset:6px; border:1px solid rgba(90,66,26,.45); border-radius:3px; pointer-events:none; }
      .tav-x{ position:absolute; top:8px; left:11px; cursor:pointer; border:none; background:none; font-size:17px; color:#8a6a2e; line-height:1; }
      .tav-hd{ text-align:center; font-variant:small-caps; letter-spacing:.16em; font-size:13px; color:#6b4e1e; }
      .tav-name{ text-align:center; font-size:23px; font-weight:bold; margin:3px 0 1px; color:#241804; word-break:break-word; }
      .tav-sub{ text-align:center; font-size:9.5px; letter-spacing:.22em; text-transform:uppercase; color:#8a6a2e; margin-bottom:14px; }
      .tav-stamp{ position:absolute; top:14px; right:14px; width:58px; height:58px; border-radius:50%; display:grid; place-items:center;
        transform:rotate(10deg); background:radial-gradient(circle at 40% 34%, #9bffc7, #2bff80 55%, #0d8340); color:#053417;
        font-family:'Arial Black',sans-serif; font-size:8.5px; text-align:center; line-height:1.05; letter-spacing:.02em;
        box-shadow:0 3px 7px rgba(0,0,0,.45), inset 0 2px 4px rgba(255,255,255,.45); }
      .tav-row{ display:flex; justify-content:space-between; gap:12px; align-items:baseline; padding:7px 2px; border-bottom:1px dotted rgba(90,66,26,.45); }
      .tav-row .k{ color:#7a5c26; letter-spacing:.07em; text-transform:uppercase; font-size:9.5px; }
      .tav-row .v{ font-family:'Courier New',monospace; color:#241804; font-size:12px; }
      .tav-row.copy .v{ cursor:pointer; text-decoration:underline dotted rgba(60,44,12,.5); }
      .tav-purse .v{ font-size:15px; color:#7a3e00; font-weight:bold; }
      .tav-buy{ display:block; text-align:center; margin:14px 0 6px; font-size:11px; letter-spacing:.07em; text-transform:uppercase;
        color:#33240a; text-decoration:none; padding:9px; border-radius:6px; border:1px solid #a4823a; background:linear-gradient(180deg,#f4d97a,#d9a92a);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.5); }
      .tav-leave{ display:block; width:100%; margin-top:8px; cursor:pointer; font-family:Georgia,serif; font-variant:small-caps; letter-spacing:.09em;
        font-size:12.5px; color:#5a0f16; padding:10px; border-radius:6px; border:1px solid #7a1f28;
        background:linear-gradient(180deg,#e8b9bf,#c88a92); box-shadow:inset 0 1px 0 rgba(255,255,255,.4); }
      .tav-leave:active{ transform:translateY(1px); }
      .tav-toast{ position:fixed; left:50%; bottom:22px; transform:translateX(-50%) translateY(12px); z-index:100001; opacity:0; pointer-events:none;
        transition:opacity .2s,transform .2s; font-family:Georgia,serif; font-size:12px; color:#f3e6c8; max-width:90vw; text-align:center;
        background:linear-gradient(180deg,#2c1e0d,#180f06); border:1px solid #6b4e1e; border-radius:8px; padding:9px 15px; box-shadow:0 10px 26px -8px #000; }
      .tav-toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
      @media (prefers-reduced-motion:reduce){ .tav-ov,.tav-ledger,.tav-wax.signed{ animation:none; } }`;
    (document.head || document.documentElement).appendChild(style);
  }

  function toast(msg) {
    let t = document.getElementById('tav-toast');
    if (!t) { t = document.createElement('div'); t.id = 'tav-toast'; t.className = 'tav-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800);
  }

  async function refreshBal(el) {
    const w = W(); const bal = el.querySelector('[data-bal]'); if (!bal || !w) return;
    if (!w.isLive()) { bal.textContent = 'practice'; return; }
    try { const b = await w.balance(); bal.textContent = '◈ ' + b.tokens.toLocaleString('en-US') + ' $UR'; } catch { bal.textContent = '◈ —'; }
  }

  function render(el) {
    const w = W();
    if (!w || !w.isConnected()) {
      el.innerHTML = '<button type="button" class="tav-sign" aria-label="Connect wallet — sign the ledger">' +
        '<span class="tav-wax unsigned">◈</span><span class="tav-sign-txt">Sign the Ledger</span></button>';
      el.querySelector('.tav-sign').onclick = () => connect(el);
    } else {
      const acct = w.account();
      el.innerHTML = '<button type="button" class="tav-chip" aria-label="Open your tavern ledger">' +
        '<span class="tav-wax signed">✓</span><span class="tav-chip-body">' +
        '<span class="tav-chip-nm">' + esc(handleOf(acct)) + '</span>' +
        '<span class="tav-chip-bal" data-bal>◈ —</span></span></button>';
      el.querySelector('.tav-chip').onclick = () => openLedger();
      refreshBal(el);
    }
  }

  async function connect(el) {
    const w = W(); if (!w) return;
    if (!w.hasWallet()) { toast('No wallet found — install MetaMask, or add a WalletConnect id for mobile.'); return; }
    const r = await w.connect();                       // shows the chooser if both injected + WC
    if (!r.ok) { if (r.reason !== 'cancelled') toast(w.explain(r.reason)); return; }
    if (w.isLive()) { const g = await w.ensureChain(); if (!g.ok) toast(w.explain(g.reason)); }
    // W.on(change) re-renders every mount
  }

  async function openLedger() {
    const w = W(); if (!w || !w.isConnected()) return;
    const acct = w.account();
    const live = w.isLive();
    const ov = document.createElement('div'); ov.className = 'tav-ov';
    ov.innerHTML =
      '<div class="tav-ledger" role="dialog" aria-modal="true" aria-label="Your tavern ledger">' +
        '<button class="tav-x" aria-label="close">✕</button>' +
        '<div class="tav-stamp">' + (live ? 'SEALED<br>ON-CHAIN' : 'SIGNED') + '</div>' +
        '<div class="tav-hd">The Ledger of the Ripmaster</div>' +
        '<div class="tav-name">' + esc(handleOf(acct)) + '</div>' +
        '<div class="tav-sub">duly signed &amp; sealed</div>' +
        '<div class="tav-row copy" data-copy="' + esc(acct) + '"><span class="k">Your mark</span><span class="v">' + esc(short(acct)) + '</span></div>' +
        '<div class="tav-row"><span class="k">The house</span><span class="v">' + esc(w.chainName()) + (w.kind() === 'walletconnect' ? ' · WC' : '') + '</span></div>' +
        '<div class="tav-row tav-purse"><span class="k">Coin purse</span><span class="v" data-purse>' + (live ? 'counting…' : 'practice chips') + '</span></div>' +
        '<a class="tav-buy" href="' + w.buyUrl() + '" target="_blank" rel="noopener noreferrer">⚜ Buy more $UR3030 ↗</a>' +
        '<button type="button" class="tav-leave">✕ Leave the tavern (disconnect)</button>' +
      '</div>';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector('.tav-x').onclick = close;
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('.tav-row.copy').onclick = e => {
      const a = e.currentTarget.dataset.copy;
      try { navigator.clipboard.writeText(a); toast('mark copied'); } catch {}
    };
    ov.querySelector('.tav-leave').onclick = async () => { close(); await w.disconnect(); toast('you left the tavern'); };
    if (live) { try { const b = await w.balance(); const p = ov.querySelector('[data-purse]'); if (p) p.textContent = b.tokens.toLocaleString('en-US') + ' $UR3030'; } catch {} }
  }

  const refreshAll = () => mounts.forEach(el => { if (document.body.contains(el)) render(el); else mounts.delete(el); });

  window.RipTavern = {
    mount(target) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return null;
      el.classList.add('tav'); mounts.add(el); render(el); return el;
    },
    refresh: refreshAll,
  };
  if (W()) W().on(refreshAll);
  else addEventListener('load', () => { if (W()) W().on(refreshAll); });
})();

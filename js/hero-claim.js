/* THE CARD YOU WON, ON SCREEN, WITH A MINT BUTTON (RipHeroClaim).
 *
 * Artist, 2026-08-07: "you need to have the card pop up for them to mint when winning one too."
 *
 * ⛔ WHAT WAS MISSING, AND IT IS THE LAST STEP OF THE WHOLE EARNED TIER. `js/title-ledger.js` tells
 *    a player they cleared a title and prints a claim slip — a piece of PAPER. Everything after
 *    that happened off the site: post a capture, wait, receive a voucher somehow, find a console.
 *    So the one moment the project is built around — the reveal, a card that is YOURS — never
 *    happened for the one tier that is hardest to reach. The slip is the CLAIM; this is the CARD.
 *
 * ⚑ THE SPLIT THAT MAKES IT SAFE IS ALREADY IN THE CONTRACT. `claimHero(to, id, kind, deadline,
 *   sig)` mints only against an EIP-712 voucher the studio signed, and the RECIPIENT IS INSIDE THE
 *   DIGEST. So a voucher is not a secret and is published like any other static file: anyone can
 *   broadcast it, the card still lands in the winner's wallet, and the only thing a stranger gains
 *   is the privilege of paying the gas. `claimHero` being permissionless is what makes that true.
 *
 * ⛔ THE BROWSER STILL AWARDS NOTHING. This shows a card the STUDIO already signed for; it cannot
 *    create a voucher, and a player who edits their localStorage score sees exactly what they saw
 *    before — nothing. HERO-UNLOCKS §1 is unchanged: a human verifies the run, then signs.
 *
 * FAILS OPEN: no wallet, no vouchers file, a 404, a stale entry, an already-minted id ⇒ nothing is
 * inserted and the page is exactly the page it was. It NEVER prompts for a connection on its own —
 * it reads a wallet that is already connected, because a site that asks for your wallet the moment
 * you finish a game is the reflex phishing needs.
 */
(function (root) {
  'use strict';
  if (!root || !root.document) return;
  try { if (root.self !== root.top) return; } catch (e) { return; }   // never inside a card lens

  var VOUCHERS = '/data/hero-vouchers.json';
  var SEL = { ownerOf: '0x6352211e', claimHero: '0xb93d3385' };
  var SEEN = 'urm_hero_shown';                 // ids already popped, so it is a reveal and not a nag

  var cfg = root.RIPMASTER_CHAIN || {};
  var LENS = (cfg.contracts && cfg.contracts.lens721) || '';
  var RPCS = cfg.rpcs || [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function seen() { try { return JSON.parse(localStorage.getItem(SEEN) || '[]'); } catch (e) { return []; } }
  function markSeen(id) { try { var s = seen(); if (s.indexOf(id) < 0) { s.push(id); localStorage.setItem(SEEN, JSON.stringify(s)); } } catch (e) {} }

  /* the connected wallet, READ not requested — same rule js/leaderboard.js follows */
  function account() {
    try {
      if (root.RipWallet && RipWallet.isConnected && RipWallet.isConnected() && RipWallet.account())
        return String(RipWallet.account()).toLowerCase();
    } catch (e) {}
    try { var a = localStorage.getItem('urm_wallet_addr');
      if (/^0x[0-9a-fA-F]{40}$/.test(a || '')) return a.toLowerCase(); } catch (e) {}
    return '';
  }

  function rpc(method, params) {
    var i = 0;
    function next() {
      if (i >= RPCS.length) return Promise.resolve(null);
      var url = RPCS[i++];
      return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }) })
        .then(function (r) { return r.json(); })
        .then(function (j) { return (j && j.result !== undefined) ? j.result : next(); })
        .catch(next);
    }
    return next();
  }
  var pad = function (n) { return BigInt(n).toString(16).padStart(64, '0'); };

  /* ⛔ ASK THE CHAIN WHETHER IT IS ALREADY MINTED, EVERY TIME. `claimHero` reverts AlreadyMinted, so
   *   a stale idea of what exists costs a collector a failed transaction and its gas — and after a
   *   reload the page's own memory is the least trustworthy source available. Same rule
   *   mint-heroes.html states for the studio's side. */
  function mintedBy(id) {
    if (!LENS) return Promise.resolve(null);
    return rpc('eth_call', [{ to: LENS, data: SEL.ownerOf + pad(id) }, 'latest'])
      .then(function (r) { return (r && r !== '0x' && BigInt(r) !== 0n) ? ('0x' + r.slice(-40)) : null; })
      .catch(function () { return null; });
  }

  // ── the card ─────────────────────────────────────────────────────────────────────────────────
  var styled = false;
  function css() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.textContent = [
      '.hc-ov{position:fixed;inset:0;z-index:2147483020;background:rgba(4,8,12,.88);display:flex;',
      ' align-items:center;justify-content:center;padding:16px;overflow:auto}',
      '.hc-ov[hidden]{display:none}',
      '.hc-p{width:min(420px,94vw);text-align:center;font:14px/1.55 ui-sans-serif,system-ui,sans-serif;color:#e9f6ef}',
      '.hc-k{font:bold 10px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:#ffd23b}',
      '.hc-h{font:bold 22px/1.15 ui-monospace,Menlo,monospace;letter-spacing:.05em;margin:6px 0 2px;color:#fff}',
      '.hc-g{font:bold 10px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#7fd8a8;margin-bottom:12px}',
      '.hc-card{position:relative;margin:0 auto 14px;width:min(300px,72vw);aspect-ratio:2/3;border-radius:12px;',
      ' overflow:hidden;background:#06110b;box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 40px rgba(255,210,59,.16)}',
      '.hc-card img,.hc-card canvas{width:100%;height:100%;object-fit:cover;display:block}',
      '.hc-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}',
      /* 44px on BOTH axes — this is a button somebody presses once, on a phone, to receive a 1/1 */
      '.hc-row button,.hc-row a{min-height:44px;min-width:44px;padding:0 16px;display:inline-flex;',
      ' align-items:center;justify-content:center;border-radius:10px;border:1.5px solid #ffd23b;',
      ' background:#ffd23b;color:#160f00;font:bold 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;',
      ' cursor:pointer;text-decoration:none}',
      '.hc-row .alt{background:transparent;color:#e9f6ef;border-color:#3a5a49}',
      '.hc-n{font-size:12px;color:#9fc9b3;margin-top:12px}',
      '.hc-err{color:#ff9b9b;font:12px/1.5 ui-monospace,Menlo,monospace;margin-top:10px;word-break:break-word}',
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  var ov = null;
  function close() { if (ov) ov.hidden = true; }

  function show(v, titleName) {
    css();
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'hc-ov';
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      document.body.appendChild(ov);
    }
    var art = '/cards/art/' + v.id + '.webp';
    ov.innerHTML = '<div class="hc-p">' +
      '<div class="hc-k">◆ EARNED · 1 OF 1 ◆</div>' +
      '<div class="hc-h">' + esc(titleName || 'HERO ' + v.id) + '</div>' +
      '<div class="hc-g">CARD ' + esc(v.id) + ' · YOURS TO MINT</div>' +
      '<div class="hc-card"><img src="' + esc(art) + '" alt="hero card ' + esc(v.id) + '" ' +
        'onerror="this.style.opacity=.15"></div>' +
      '<div class="hc-row">' +
        '<button type="button" data-hc="mint">MINT IT</button>' +
        '<button type="button" class="alt" data-hc="later">LATER</button>' +
      '</div>' +
      /* ⚠ SAY WHO PAYS AND WHERE IT LANDS, BEFORE THE PROMPT. An unexplained wallet prompt reads as
       *   a scam — the same reason RipWallet names each of its two prompts. */
      '<div class="hc-n">The studio signed this to <b>your</b> wallet — the address is inside the ' +
      'signature, so it cannot go anywhere else. You send the transaction and pay the gas.</div>' +
      '<div class="hc-err" id="hcErr"></div>' +
      '</div>';
    ov.hidden = false;
    ov.querySelector('[data-hc="later"]').onclick = close;
    ov.querySelector('[data-hc="mint"]').onclick = function () { mint(v, this); };
    markSeen(v.id);
    return ov;
  }

  function mint(v, btn) {
    var err = document.getElementById('hcErr');
    var eth = root.ethereum;
    if (!eth || !eth.request) { err.textContent = 'No wallet in this browser. Open the site in your wallet app, or use a desktop browser with an extension.'; return; }
    if (!LENS) { err.textContent = 'The lens contract is not configured on this build.'; return; }
    btn.disabled = true; btn.textContent = 'CONFIRM IN WALLET…';
    /* claimHero(address to, uint256 id, uint8 kind, uint256 deadline, bytes sig) — the bytes arg is
     * a dynamic tail: head is the offset, then length, then the 65 bytes padded to a word. */
    var sig = String(v.sig || '').replace(/^0x/, '');
    var data = SEL.claimHero + pad(BigInt(v.to)) + pad(v.id) + pad(v.kind || 2) +
      pad(v.deadline) + pad(5 * 32) + pad(sig.length / 2) + sig.padEnd(128, '0');
    eth.request({ method: 'eth_sendTransaction', params: [{ from: v.to, to: LENS, data: data }] })
      .then(function (tx) {
        btn.textContent = 'MINTED ✓'; err.style.color = '#8ef0b4';
        err.innerHTML = 'sent — <a href="https://etherscan.io/tx/' + esc(tx) + '" target="_blank" rel="noopener" style="color:#8ef0b4">' + esc(tx.slice(0, 14)) + '…</a>';
      })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = 'MINT IT';
        err.textContent = (e && (e.message || e.reason)) || 'the wallet refused it';
      });
  }

  // ── find out whether anything is waiting ─────────────────────────────────────────────────────
  function check(force) {
    var me = account();
    if (!me) return Promise.resolve(null);
    return fetch(VOUCHERS, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var mine = (j && j.vouchers && j.vouchers[me]) || [];
        if (!mine.length) return null;
        var s = seen();
        var next = mine.filter(function (v) { return force || s.indexOf(v.id) < 0; })[0] || (force ? mine[0] : null);
        if (!next) return null;
        next.to = next.to || me;
        /* the chain is the authority on whether it still needs minting */
        return mintedBy(next.id).then(function (owner) {
          if (owner) return null;                       // already theirs — nothing to press
          var nm = '';
          try { if (root.RipTitles && next.title && RipTitles.byId[next.title]) nm = RipTitles.byId[next.title].name; } catch (e) {}
          show(next, nm);
          return next;
        });
      })
      .catch(function () { return null; });
  }

  root.RipHeroClaim = { check: check, show: show, close: close, VOUCHERS: VOUCHERS };

  /* On load, and again whenever a title is cleared — the two moments a card can become yours. */
  function boot() { try { check(false); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  root.addEventListener('urm:title-cleared', function () { setTimeout(function () { check(false); }, 1200); });
})(typeof window !== 'undefined' ? window : globalThis);

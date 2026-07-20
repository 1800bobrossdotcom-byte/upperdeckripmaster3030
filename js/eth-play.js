/* Upperdeck Ripmaster 3030 — ETH PLAY (window.RipEth). The arcade coin slot.
 *
 *   $1.00 of ETH = 4 flights (25¢ a game), paid on BASE L2 straight to the
 *   hangar wallet — a plain value transfer: no contracts, no custody, no
 *   approvals. ETH side-pots (≤ $3 each) are PLEDGES between the players at
 *   the table until the Phase-2 escrow contract lands; the site never holds
 *   funds. Rides window.RipWallet's connection (injected or WalletConnect).
 *
 *   RipEth.price()        refresh ETH/USD spot (cached 5 min)
 *   RipEth.usd()          last known ETH/USD (0 = unknown → buying disabled)
 *   RipEth.eth(usd)       convert USD → ETH at spot
 *   RipEth.plays()        flight credits banked for the connected wallet
 *   RipEth.insertCoin()   connect → switch to Base → send $1.00 → +4 flights
 *   RipEth.spendPlay()    consume one flight credit (match start)
 *   RipEth.on(cb)         ledger/receipt change notifications
 */
(() => {
  const BASE = { id: 8453, hex: '0x2105', name: 'Base', rpcs: ['https://mainnet.base.org'], explorer: 'https://basescan.org' };
  const HANGAR = '0x432D71bA14D2602B566dD9e3e098E24859d166c9';   // creator wallet — the coin box
  const PLAY_USD = 1.00, PLAYS_PER = 4, WAGER_MAX_USD = 3.00, WAGER_STEP_USD = 0.25;
  const W = () => window.RipWallet || null;
  const LSK = 'urm_eth_plays_v1', LSP = 'urm_ethusd_v1';
  const listeners = [];
  const emit = () => listeners.forEach(f => { try { f(); } catch {} });

  // ── ETH/USD spot: Coinbase → CoinGecko → stale cache (never a made-up number) ──
  let usd = 0;
  const cache = v => { try { localStorage.setItem(LSP, JSON.stringify({ v, t: Date.now() })); } catch {} };
  const cached = maxAge => { try { const j = JSON.parse(localStorage.getItem(LSP) || 'null');
    if (j && j.v > 0 && (Date.now() - j.t) < maxAge) return j.v; } catch {} return 0; };
  async function price(force) {
    if (!force) { const c = cached(5 * 60e3); if (c) return (usd = c); }
    const tryFetch = async (url, pick) => { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
      try { const r = await fetch(url, { signal: ctl.signal }); const v = pick(await r.json()); return v > 0 ? v : 0; }
      catch { return 0; } finally { clearTimeout(t); } };
    let v = await tryFetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', j => parseFloat(j && j.data && j.data.amount));
    if (!v) v = await tryFetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', j => j && j.ethereum && j.ethereum.usd);
    if (v) { usd = v; cache(v); } else usd = cached(24 * 60 * 60e3);   // stale-but-real beats invented
    return usd;
  }
  const eth = u => usd > 0 ? u / usd : 0;
  const fmtEth = e => e > 0 ? (e < 0.001 ? e.toFixed(6) : e.toFixed(5)) : '—';

  // ── flight-credit ledger (client-side, per wallet address) ──
  const ledger = () => { try { return JSON.parse(localStorage.getItem(LSK) || '{}') || {}; } catch { return {}; } };
  const saveLedger = l => { try { localStorage.setItem(LSK, JSON.stringify(l)); } catch {} };
  const acct = () => (W() && W().account()) || null;
  function plays() { const a = acct(); if (!a) return 0; const l = ledger()[a.toLowerCase()]; return (l && l.plays) | 0; }
  function addPlays(n, tx, ethAmt) { const a = acct(); if (!a) return; const l = ledger(), k = a.toLowerCase();
    l[k] = l[k] || { plays: 0, txs: [] }; l[k].plays = (l[k].plays | 0) + n;
    l[k].txs.push({ h: tx, eth: +ethAmt.toFixed(6), t: Date.now() }); saveLedger(l); emit(); }
  function spendPlay() { const a = acct(); if (!a) return false; const l = ledger(), k = a.toLowerCase();
    if (!l[k] || (l[k].plays | 0) < 1) return false; l[k].plays--; saveLedger(l); emit(); return true; }

  // ── Base plumbing on the wallet's ACTIVE provider ──
  async function ensureBase() {
    const R = W(); if (!R || !R.request) return { ok: false, reason: 'no-provider' };
    try { if (parseInt(await R.request('eth_chainId'), 16) === BASE.id) return { ok: true }; } catch {}
    try { await R.request('wallet_switchEthereumChain', [{ chainId: BASE.hex }]); return { ok: true }; }
    catch (e) {
      const code = e && (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902));
      if (code) { try {
        await R.request('wallet_addEthereumChain', [{ chainId: BASE.hex, chainName: BASE.name,
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: BASE.rpcs, blockExplorerUrls: [BASE.explorer] }]);
        return { ok: true };
      } catch { return { ok: false, reason: 'add-chain-declined' }; } }
      return { ok: false, reason: (e && e.code === 4001) ? 'switch-declined' : 'switch-failed' };
    }
  }

  // best-effort receipt watch: if the coin drop reverts, claw the credits back
  function watch(tx) { let n = 0; const iv = setInterval(async () => {
    if (++n > 40) { clearInterval(iv); return; }
    try { const r = await W().request('eth_getTransactionReceipt', [tx]); if (!r) return; clearInterval(iv);
      if (r.status === '0x0') { const a = acct(); if (a) { const l = ledger(), k = a.toLowerCase();
        if (l[k]) { l[k].plays = Math.max(0, (l[k].plays | 0) - PLAYS_PER); saveLedger(l); } } }
      emit();
    } catch {} }, 4500); }

  // ── the coin slot: $1.00 → 4 flights, straight to the hangar on Base ──
  async function insertCoin() {
    const R = W(); if (!R) return { ok: false, reason: 'no-provider' };
    if (!R.isConnected()) { const c = await R.connect(); if (!c.ok) return c; }
    await price(); if (!(usd > 0)) return { ok: false, reason: 'no-price' };
    const g = await ensureBase(); if (!g.ok) return g;
    const amt = eth(PLAY_USD);
    const wei = BigInt(Math.round(amt * 1e6)) * (10n ** 12n);   // 6-dp precision
    try {
      const tx = await R.request('eth_sendTransaction', [{ from: R.account(), to: HANGAR, value: '0x' + wei.toString(16) }]);
      addPlays(PLAYS_PER, tx, amt); watch(tx);
      return { ok: true, tx, eth: amt, plays: plays() };
    } catch (e) { return { ok: false, reason: (e && e.code === 4001) ? 'user-rejected' : 'tx-failed', error: e && (e.message || '') }; }
  }

  window.RipEth = {
    price, usd: () => usd, eth, fmtEth,
    plays, insertCoin, spendPlay, ensureBase,
    PLAY_USD, PLAYS_PER, WAGER_MAX_USD, WAGER_STEP_USD, HANGAR, BASE,
    txUrl: h => BASE.explorer + '/tx/' + h,
    on: cb => { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; },
  };
})();

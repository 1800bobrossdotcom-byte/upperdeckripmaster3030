/* Upperdeck Ripmaster 3030 — the wallet layer (window.RipWallet).
 *
 * The site does NOT rebuild the exchange: buying/selling $UR3030 happens on
 * SuperRare's Collect page and on DEXes. What the site owns is BURNING — the
 * "rip" and the arena battle ante — so this layer only needs: connect, make sure
 * you're on the right chain, read your $UR3030 balance, and send a burn().
 *
 * Provider-agnostic: works with an injected browser wallet (MetaMask) OR with
 * WalletConnect (mobile wallets via QR). Both expose the same EIP-1193 request()
 * interface, so burn/balance/guard code is identical either way.
 *
 * WalletConnect needs a free project id from https://cloud.reown.com — drop it into
 * js/chain-config.js as `walletConnectProjectId`. Until then the WC option is hidden
 * and injected still works.
 *
 *   RipWallet.connect(kind?)       kind: 'injected' | 'walletconnect' | undefined(=chooser)
 *   RipWallet.ensureChain()        switches the wallet to the token's chain
 *   RipWallet.balance(account?)    -> { wei, tokens }
 *   RipWallet.burn(tokens)         -> { ok, tx } | { ok:false, reason }  (connect+guard+send)
 *   RipWallet.on('change', cb)     account/chain changes
 *   RipWallet.buyUrl()             SuperRare Collect deep-link
 */
(() => {
  const CFG = () => window.RIPMASTER_CHAIN || {};
  const ZERO = '0x0000000000000000000000000000000000000000';
  const injected = () => window.ethereum || null;
  const wcProjectId = () => String((CFG().walletConnectProjectId || window.RIPMASTER_WC_PROJECT_ID || '')).trim();

  const CHAINS = {
    1:        { name: 'Ethereum', explorer: 'https://etherscan.io', symbol: 'ETH' },
    11155111: { name: 'Sepolia',  explorer: 'https://sepolia.etherscan.io', symbol: 'SepoliaETH' },
    8453:     { name: 'Base',     explorer: 'https://basescan.org', symbol: 'ETH' },
    84532:    { name: 'Base Sepolia', explorer: 'https://sepolia.basescan.org', symbol: 'ETH' },
  };
  const toHexChain = id => '0x' + Number(id).toString(16);
  const token = () => (CFG().contracts || {}).liquidEdition || ZERO;
  const isLive = () => /^0x[0-9a-fA-F]{40}$/.test(token()) && !/^0x0+$/.test(token());
  const wantChainId = () => Number(CFG().chainId || 1);

  let provider = null;   // active EIP-1193 provider (injected or WalletConnect)
  let kind = null;       // 'injected' | 'walletconnect'
  let account = null;
  const listeners = [];
  const emit = () => listeners.forEach(f => { try { f({ account, kind }); } catch {} });

  async function req(method, params) {
    const pr = provider || injected();
    if (!pr) throw Object.assign(new Error('no-provider'), { code: 'no-provider' });
    return pr.request({ method, params });
  }
  async function currentChain() { try { return parseInt(await req('eth_chainId'), 16); } catch { return null; } }

  let bound = new WeakSet();
  function bindEvents(pr) {
    if (!pr || !pr.on || bound.has(pr)) return; bound.add(pr);
    pr.on('accountsChanged', a => { account = (a && a[0]) || null; emit(); });
    pr.on('chainChanged', () => emit());
    pr.on('disconnect', () => { account = null; provider = null; kind = null; emit(); });
  }

  async function connectInjected() {
    if (!injected()) return { ok: false, reason: 'no-wallet' };
    try {
      const a = await injected().request({ method: 'eth_requestAccounts', params: [] });
      account = (a && a[0]) || null;
      if (!account) return { ok: false, reason: 'no-account' };
      provider = injected(); kind = 'injected'; bindEvents(provider); emit();
      return { ok: true, account };
    } catch (e) { return { ok: false, reason: (e && e.code === 4001) ? 'user-rejected' : 'connect-failed' }; }
  }

  let wcMod = null;
  async function connectWalletConnect() {
    const pid = wcProjectId();
    if (!pid) return { ok: false, reason: 'wc-not-configured' };
    try {
      if (!wcMod) wcMod = await import('https://esm.sh/@walletconnect/ethereum-provider@2.17.0');
      const EP = wcMod.EthereumProvider || (wcMod.default && wcMod.default.EthereumProvider) || wcMod.default;
      const want = wantChainId();
      const wc = await EP.init({
        projectId: pid,
        chains: [want],
        optionalChains: [1, 11155111, 8453, 84532],
        showQrModal: true,
        rpcMap: { [want]: (CFG().rpcs || [])[0] || '' },
        metadata: {
          name: 'Upperdeck Ripmaster 3030',
          description: 'A liquid trading-card game on SuperRare Liquid Editions.',
          url: 'https://upperdeckripmaster3030.com',
          icons: ['https://upperdeckripmaster3030.com/favicon.svg'],
        },
      });
      await wc.enable();                       // opens the QR modal
      account = (wc.accounts && wc.accounts[0]) || null;
      provider = wc; kind = 'walletconnect'; bindEvents(wc); emit();
      if (!account) return { ok: false, reason: 'no-account' };
      return { ok: true, account };
    } catch (e) {
      const msg = (e && e.message) || '';
      return { ok: false, reason: /reject|closed|cancel/i.test(msg) ? 'user-rejected' : 'wc-failed', error: msg };
    }
  }

  // a tiny self-contained chooser (only shown when BOTH injected + WalletConnect are available)
  function chooser() {
    return new Promise(resolve => {
      const hasInj = !!injected(), hasWC = !!wcProjectId();
      if (hasInj && !hasWC) return resolve('injected');
      if (!hasInj && hasWC) return resolve('walletconnect');
      if (!hasInj && !hasWC) return resolve('injected');   // -> surfaces the 'no-wallet' reason
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:18px;background:rgba(1,6,3,.82);backdrop-filter:blur(5px);font-family:Arial,sans-serif';
      ov.innerHTML =
        '<div style="width:min(360px,94vw);background:#02140b;border:1px solid #0f5c33;border-radius:14px;padding:18px;box-shadow:0 30px 80px -20px #000">' +
        '<div style="font-family:\'Arial Black\',Arial;text-transform:uppercase;letter-spacing:.06em;font-size:14px;color:#2bff80;margin-bottom:12px">Connect a wallet</div>' +
        '<button data-k="injected" style="width:100%;text-align:left;font-size:13px;padding:13px 14px;margin-bottom:8px;border-radius:10px;cursor:pointer;border:1px solid #0f5c33;background:rgba(43,255,128,.08);color:#d9ffe9">🦊 &nbsp;Browser wallet <span style="color:#7fd8a8">(MetaMask)</span></button>' +
        '<button data-k="walletconnect" style="width:100%;text-align:left;font-size:13px;padding:13px 14px;margin-bottom:8px;border-radius:10px;cursor:pointer;border:1px solid #0f5c33;background:rgba(43,255,128,.08);color:#d9ffe9">📱 &nbsp;WalletConnect <span style="color:#7fd8a8">(mobile)</span></button>' +
        '<button data-k="" style="width:100%;font-size:12px;padding:9px;border-radius:10px;cursor:pointer;border:1px solid #0f5c33;background:transparent;color:#7fd8a8">cancel</button>' +
        '</div>';
      document.body.appendChild(ov);
      const done = k => { ov.remove(); resolve(k || null); };
      ov.querySelectorAll('button').forEach(b => b.onclick = () => done(b.dataset.k));
      ov.addEventListener('click', e => { if (e.target === ov) done(null); });
    });
  }

  async function connect(kindArg) {
    const k = kindArg || await chooser();
    if (!k) return { ok: false, reason: 'cancelled' };
    return k === 'walletconnect' ? connectWalletConnect() : connectInjected();
  }

  async function ensureChain() {
    const want = wantChainId();
    if ((await currentChain()) === want) return { ok: true };
    const hex = toHexChain(want);
    try { await req('wallet_switchEthereumChain', [{ chainId: hex }]); return { ok: true }; }
    catch (e) {
      if (e && (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902))) {
        const meta = CHAINS[want] || { name: 'Network', explorer: '', symbol: 'ETH' };
        try {
          await req('wallet_addEthereumChain', [{
            chainId: hex, chainName: meta.name,
            nativeCurrency: { name: meta.symbol, symbol: meta.symbol, decimals: 18 },
            rpcUrls: (CFG().rpcs || []).slice(0, 3),
            blockExplorerUrls: meta.explorer ? [meta.explorer] : [],
          }]);
          return { ok: true };
        } catch { return { ok: false, reason: 'add-chain-declined' }; }
      }
      return { ok: false, reason: (e && e.code === 4001) ? 'switch-declined' : 'switch-failed' };
    }
  }

  async function balance(who) {
    const acct = who || account;
    if (!acct || !isLive()) return { wei: 0n, tokens: 0 };
    try {
      const data = '0x70a08231' + '000000000000000000000000' + acct.slice(2);
      const res = await req('eth_call', [{ to: token(), data }, 'latest']);
      const wei = BigInt(res || '0x0');
      return { wei, tokens: Number(wei / (10n ** 18n)) };
    } catch { return { wei: 0n, tokens: 0 }; }
  }

  // the site's one real transaction: burn $UR3030 (a rip, or an arena ante)
  async function burn(tokens) {
    const amt = Math.max(0, Math.floor(Number(tokens) || 0));
    if (amt <= 0) return { ok: false, reason: 'zero' };
    if (!isLive()) return { ok: false, reason: 'not-live' };
    if (!account) { const c = await connect(); if (!c.ok) return c; }
    const g = await ensureChain(); if (!g.ok) return g;
    try {
      const wei = BigInt(amt) * (10n ** 18n);
      const data = '0x42966c68' + wei.toString(16).padStart(64, '0');  // burn(uint256)
      const tx = await req('eth_sendTransaction', [{ from: account, to: token(), data }]);
      return { ok: true, tx };
    } catch (e) {
      return { ok: false, reason: (e && e.code === 4001) ? 'user-rejected' : 'tx-failed', error: e && (e.message || '') };
    }
  }

  async function disconnect() {
    try {
      if (kind === 'walletconnect' && provider && provider.disconnect) { await provider.disconnect(); }
      else if (kind === 'injected' && injected() && injected().request) {
        // best-effort: revoke the site's account permission (newer MetaMask) so a
        // reconnect re-prompts. Older wallets ignore this; we still clear app state.
        try { await injected().request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }); } catch {}
      }
    } catch {}
    account = null; provider = null; kind = null; emit();
    return { ok: true };
  }

  const buyUrl = () => isLive()
    ? `https://superrare.com/liquid-editions/${wantChainId()}/${token()}`
    : 'https://superrare.com';
  const explorerAddr = a => `${(CHAINS[wantChainId()] || {}).explorer || 'https://etherscan.io'}/address/${a}`;
  const explorerTx = h => `${(CHAINS[wantChainId()] || {}).explorer || 'https://etherscan.io'}/tx/${h}`;

  // eager: if an injected wallet is already authorized, pick up the account silently
  (async () => {
    if (!injected()) return;
    try { const a = await injected().request({ method: 'eth_accounts', params: [] }); if (a && a[0]) { account = a[0]; provider = injected(); kind = 'injected'; bindEvents(provider); emit(); } } catch {}
  })();

  window.RipWallet = {
    connect, disconnect, ensureChain, balance, burn,
    request: req,               // raw EIP-1193 passthrough on the ACTIVE provider (js/eth-play.js pays on Base with it)
    account: () => account,
    kind: () => kind,
    isConnected: () => !!account,
    hasWallet: () => !!injected() || !!wcProjectId(),
    hasInjected: () => !!injected(),
    hasWalletConnect: () => !!wcProjectId(),
    isLive, buyUrl, explorerAddr, explorerTx,
    chainName: () => (CHAINS[wantChainId()] || {}).name || ('chain ' + wantChainId()),
    on: cb => { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; },
    explain: reason => ({
      'no-wallet': 'No wallet found. Install MetaMask, or use WalletConnect on mobile.',
      'no-provider': 'No wallet connected.',
      'cancelled': 'Connection cancelled.',
      'user-rejected': 'You rejected the request in your wallet.',
      'connect-failed': 'Could not connect to your wallet.',
      'wc-not-configured': 'WalletConnect isn’t set up yet (needs a project id).',
      'wc-failed': 'WalletConnect couldn’t connect.',
      'switch-declined': 'Switch to the right network to continue.',
      'add-chain-declined': 'The network wasn’t added, so it can’t go through.',
      'switch-failed': 'Could not switch networks.',
      'not-live': 'The $UR3030 token isn’t deployed on this network yet.',
      'tx-failed': 'The transaction failed or was dropped.',
      'zero': 'Nothing to burn.',
    }[reason] || ('Something went wrong (' + reason + ').')),
  };
})();

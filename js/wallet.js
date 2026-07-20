/* Upperdeck Ripmaster 3030 — the wallet layer (window.RipWallet).
 *
 * The site does NOT rebuild the exchange: buying/selling $UR3030 happens on
 * SuperRare's Collect page and on DEXes. What the site owns is BURNING — the
 * "rip" and the arena battle ante — so this layer only needs: connect, make sure
 * you're on the right chain, read your $UR3030 balance, and send a burn().
 *
 * Injected (MetaMask / browser wallet) today. It's structured so a WalletConnect
 * adapter (mobile wallets) drops in for mainnet launch without touching callers.
 *
 *   RipWallet.connect()            -> { ok, account } | { ok:false, reason }
 *   RipWallet.ensureChain()        -> { ok } | { ok:false, reason }   (switches/apes the network)
 *   RipWallet.account()            -> '0x..' | null
 *   RipWallet.balance(account?)    -> { wei, tokens }   ($UR3030 held)
 *   RipWallet.burn(tokens)         -> { ok, tx } | { ok:false, reason }  (connect+guard+send)
 *   RipWallet.on('change', cb)     -> account/chain changes
 *   RipWallet.buyUrl()             -> SuperRare Collect deep-link for the token
 *   RipWallet.isLive()             -> is a real token address configured?
 */
(() => {
  const CFG = () => window.RIPMASTER_CHAIN || {};
  const ZERO = '0x0000000000000000000000000000000000000000';
  const eth = () => window.ethereum || null;

  // known-chain metadata for the network guard's "add chain" fallback
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

  let account = null;
  const listeners = [];
  const emit = () => listeners.forEach(f => { try { f({ account, chainId: wantChainId() }); } catch {} });

  async function req(method, params) { return eth().request({ method, params }); }

  async function currentChain() { try { return parseInt(await req('eth_chainId'), 16); } catch { return null; } }

  async function connect() {
    if (!eth()) return { ok: false, reason: 'no-wallet' };
    try {
      const accts = await req('eth_requestAccounts', []);
      account = (accts && accts[0]) || null;
      if (!account) return { ok: false, reason: 'no-account' };
      bindEvents();
      emit();
      return { ok: true, account };
    } catch (e) {
      return { ok: false, reason: (e && e.code === 4001) ? 'user-rejected' : 'connect-failed' };
    }
  }

  // make sure the wallet is on the chain the token actually lives on
  async function ensureChain() {
    if (!eth()) return { ok: false, reason: 'no-wallet' };
    const want = wantChainId();
    if ((await currentChain()) === want) return { ok: true };
    const hex = toHexChain(want);
    try {
      await req('wallet_switchEthereumChain', [{ chainId: hex }]);
      return { ok: true };
    } catch (e) {
      // 4902 = chain unknown to the wallet → offer to add it
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
    if (!eth() || !acct || !isLive()) return { wei: 0n, tokens: 0 };
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
    if (!eth()) return { ok: false, reason: 'no-wallet' };
    const c = await connect(); if (!c.ok) return c;
    const g = await ensureChain(); if (!g.ok) return g;
    try {
      const wei = BigInt(amt) * (10n ** 18n);
      // ERC20Burnable burn(uint256) — selector 0x42966c68
      const data = '0x42966c68' + wei.toString(16).padStart(64, '0');
      const tx = await req('eth_sendTransaction', [{ from: account, to: token(), data }]);
      return { ok: true, tx };
    } catch (e) {
      return { ok: false, reason: (e && e.code === 4001) ? 'user-rejected' : 'tx-failed', error: e && (e.message || '') };
    }
  }

  let bound = false;
  function bindEvents() {
    if (bound || !eth() || !eth().on) return; bound = true;
    eth().on('accountsChanged', a => { account = (a && a[0]) || null; emit(); });
    eth().on('chainChanged', () => emit());
  }

  const buyUrl = () => isLive()
    ? `https://superrare.com/liquid-editions/${wantChainId()}/${token()}`
    : 'https://superrare.com';
  const explorerAddr = a => `${(CHAINS[wantChainId()] || {}).explorer || 'https://etherscan.io'}/address/${a}`;
  const explorerTx = h => `${(CHAINS[wantChainId()] || {}).explorer || 'https://etherscan.io'}/tx/${h}`;

  // eager: if the wallet is already authorized, pick up the account silently
  (async () => {
    if (!eth()) return;
    try { const a = await req('eth_accounts', []); if (a && a[0]) { account = a[0]; bindEvents(); emit(); } } catch {}
  })();

  window.RipWallet = {
    connect, ensureChain, balance, burn,
    account: () => account,
    isConnected: () => !!account,
    hasWallet: () => !!eth(),
    isLive, buyUrl, explorerAddr, explorerTx,
    chainName: () => (CHAINS[wantChainId()] || {}).name || ('chain ' + wantChainId()),
    on: cb => { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; },
    // reasons → friendly copy for UI
    explain: reason => ({
      'no-wallet': 'No wallet found. Install MetaMask (or a browser wallet) to burn on-chain.',
      'user-rejected': 'You rejected the request in your wallet.',
      'connect-failed': 'Could not connect to your wallet.',
      'switch-declined': 'You need to switch to the right network to burn.',
      'add-chain-declined': 'The network wasn’t added, so the burn can’t go through.',
      'switch-failed': 'Could not switch networks.',
      'not-live': 'The $UR3030 token isn’t deployed on this network yet.',
      'tx-failed': 'The burn transaction failed or was dropped.',
    }[reason] || ('Something went wrong (' + reason + ').')),
  };
})();

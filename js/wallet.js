/* ripmaster3030studios — the wallet layer (window.RipWallet).
 *
 * The site does NOT rebuild the exchange: buying/selling $3030 happens on
 * SuperRare's Collect page and on DEXes. What the site owns is BURNING — the
 * "rip" and the arena battle ante — so this layer only needs: connect, make sure
 * you're on the right chain, read your $3030 balance, and send a burn().
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
 *   RipWallet.payPack(tokens, onStep)  -> pack payment: half burns, half to the studio treasury
 *   RipWallet.payRake(tokens, onStep)  -> game rake, same 50/50 split
 *      Both go through contracts/PackSink.sol in ONE atomic call, and both FALL BACK to a plain
 *      100% burn while `contracts.packSink` is empty. `result.split` says which path ran.
 *   RipWallet.payTreasury(tokens)  -> 100% to the studio wallet. A plain ERC-20 transfer: one
 *      destination is one operation, so unlike the split it needs no contract at all.
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
  const isAddr = a => /^0x[0-9a-fA-F]{40}$/.test(a || '') && !/^0x0+$/.test(a);
  const token = () => (CFG().contracts || {}).liquidEdition || ZERO;
  const isLive = () => isAddr(token());
  const wantChainId = () => Number(CFG().chainId || 1);
  // PackSink — the atomic 50/50 splitter (contracts/PackSink.sol). Empty until deployed, which
  // is what makes every split path below degrade to the plain burn instead of breaking.
  const sink = () => ((CFG().contracts || {}).packSink || '').trim();
  const hasSink = () => isAddr(sink());

  /* ⛔ THE ORIGIN A WALLET IS TOLD WE ARE MUST BE THE ORIGIN THE COLLECTOR IS STANDING ON.
   *   This was written down as the apex while the platform serves `www` as Production and 308s
   *   the apex to it. Both resolve, so nothing looked broken — but `metadata.url` is not a link,
   *   it is the IDENTITY shown in the approval sheet, and WalletConnect's domain verification
   *   compares it against the origin the session proposal came from. A disagreement surfaces in
   *   the wallet as "cannot verify", on a phone, at the exact moment we are asking to be trusted.
   *   Same class as the retired-name mismatch recorded at the metadata block below, one host
   *   string deep — and the apex icon really does 308, so a wallet that will not follow a
   *   redirect on an image shows the sheet with no icon at all.
   * ⚑ DERIVED, NOT WRITTEN DOWN, and that is the point: the recorded plan is to make the apex
   *   Production and let `www` redirect the other way, and that flip must not need an edit here.
   * ⚑ A SHAPE, NOT A HAND-PICKED LIST OF HOSTS — this repo has paid three times for a list that
   *   stopped covering the thing it described. Any host under the studio's own registrable
   *   domain passes; anything else (a preview build, a clone, a sandboxed frame where hostname
   *   is empty) falls back to the canonical rather than naming itself inside somebody's wallet.
   * ⛔ AND THE RETIRED DOMAIN IS DELIBERATELY *NOT* IN IT — `npm run test:name` caught me putting
   *   it there. Letting it derive would print the retired studio name inside a wallet approval
   *   sheet, which is the precise surface the name law was written for. It costs nothing: the old
   *   domain forwards, so nobody is standing on it when they connect, and if they somehow are,
   *   naming the LIVE studio is the honest answer rather than the stale one.
   * ⚠ Always emitted as https — the site is https-only, and http in an approval sheet reads
   *   wrong even where it would technically be where you are. */
  const SITE_HOST = /(^|\.)ripmaster3030studios\.com$/;
  function siteOrigin() {
    try {
      const h = String(location.hostname || '');
      if (SITE_HOST.test(h)) return 'https://' + h;
    } catch {}
    return 'https://ripmaster3030studios.com';
  }

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
      // REQUIRE mainnet only — every wallet satisfies it. Everything else is optional:
      // a REQUIRED testnet (e.g. Sepolia) makes MetaMask mobile & friends silently
      // reject the session proposal ("connecting…" forever, nothing in connected sites).
      const wc = await EP.init({
        projectId: pid,
        chains: [1],
        optionalChains: [8453, 84532, 11155111],
        showQrModal: true,
        rpcMap: {
          1: 'https://ethereum-rpc.publicnode.com',
          8453: 'https://mainnet.base.org',
          84532: 'https://sepolia.base.org',
          11155111: (CFG().rpcs || [])[0] || 'https://ethereum-sepolia-rpc.publicnode.com',
        },
        /* ⛔ THIS BLOCK IS RENDERED INSIDE THE USER'S WALLET, not on our page — it is the dApp
         *   name, URL and icon in the WalletConnect approval sheet. It still said
         *   `upperdeckripmaster3030` at `upperdeckripmaster3030.com`, so a collector standing on
         *   ripmaster3030studios.com was asked to approve a connection from a DIFFERENT name at a
         *   DIFFERENT domain. That is precisely the mismatch people are told to treat as a phish,
         *   and we were teaching them to click through it.
         * ⚠ Presentation only — no selector, offset or decimal is touched here. `npm run test:split`
         *   re-run after this edit. */
        metadata: {
          name: 'ripmaster3030studios',
          description: 'A liquid trading-card game on SuperRare Liquid Editions.',
          url: siteOrigin(),                                   // ⚑ the host you are ON — see above
          icons: [siteOrigin() + '/media/site/mark-512.png'],
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

  // ── mobile with no injected provider: one-tap "open in your wallet" deep links.
  //    Each opens THIS page inside the wallet's in-app browser, where the provider
  //    injects and connect/pay flows work with zero extra setup.
  // ⚠ These two panels are the ONLY part of this file a phone user reads, and they are
  //    inline-styled, so /mobile.css cannot reach them. Sizes are set here to the same floors:
  //    16px for the explanatory line, 14px labels, and a 44px minimum on every button and link
  //    (the cancel button measured 322x34). PRESENTATION ONLY — no selector, offset, decimal or
  //    address in this file is touched, and `npm run test:split` still asserts all of it.
  const isMobileUA = () => matchMedia('(hover:none)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  function deepLinkPanel() {
    return new Promise(resolve => {
      const here = location.href, host = location.host + location.pathname + location.search;
      const links = [
        ['🦊', 'MetaMask', 'https://metamask.app.link/dapp/' + host],
        ['🔵', 'Coinbase Wallet', 'https://go.cb-w.com/dapp?cb_url=' + encodeURIComponent(here)],
        ['🛡', 'Trust Wallet', 'https://link.trustwallet.com/open_url?coin_id=60&url=' + encodeURIComponent(here)],
      ];
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:18px;background:rgba(1,6,3,.82);backdrop-filter:blur(5px);font-family:Arial,sans-serif';
      ov.innerHTML =
        '<div style="width:min(360px,94vw);background:#02140b;border:1px solid #0f5c33;border-radius:14px;padding:18px;box-shadow:0 30px 80px -20px #000">' +
        '<div style="font-family:\'Arial Black\',Arial;text-transform:uppercase;letter-spacing:.06em;font-size:14px;color:#2bff80;margin-bottom:6px">Open in your wallet</div>' +
        '<div style="font-size:16px;line-height:1.55;color:#9fd8b8;margin-bottom:14px">This page reopens inside your wallet’s built-in browser — it connects automatically and Base payments work.</div>' +
        links.map(([ic, nm, href]) =>
          '<a href="' + href + '" rel="noopener" style="display:flex;align-items:center;text-decoration:none;font-size:14px;min-height:52px;padding:0 14px;margin-bottom:9px;border-radius:10px;border:1px solid #0f5c33;background:rgba(43,255,128,.08);color:#d9ffe9">' + ic + ' &nbsp;' + nm + '</a>').join('') +
        '<button data-x="1" style="width:100%;font-size:14px;min-height:44px;padding:0 9px;border-radius:10px;cursor:pointer;border:1px solid #0f5c33;background:transparent;color:#7fd8a8">cancel</button>' +
        '</div>';
      document.body.appendChild(ov);
      const done = () => { ov.remove(); resolve(null); };
      ov.querySelector('[data-x]').onclick = done;
      ov.addEventListener('click', e => { if (e.target === ov) done(); });
    });
  }

  // a tiny self-contained chooser (only shown when BOTH injected + WalletConnect are available)
  function chooser() {
    return new Promise(resolve => {
      const hasInj = !!injected(), hasWC = !!wcProjectId();
      if (hasInj && !hasWC) return resolve('injected');
      if (!hasInj && hasWC) return resolve('walletconnect');
      if (!hasInj && !hasWC) {
        if (isMobileUA()) return deepLinkPanel().then(() => resolve(null));   // phones: hand off to the wallet app
        return resolve('injected');                                          // desktop -> surfaces the 'no-wallet' reason
      }
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:18px;background:rgba(1,6,3,.82);backdrop-filter:blur(5px);font-family:Arial,sans-serif';
      ov.innerHTML =
        '<div style="width:min(360px,94vw);background:#02140b;border:1px solid #0f5c33;border-radius:14px;padding:18px;box-shadow:0 30px 80px -20px #000">' +
        '<div style="font-family:\'Arial Black\',Arial;text-transform:uppercase;letter-spacing:.06em;font-size:14px;color:#2bff80;margin-bottom:12px">Connect a wallet</div>' +
        '<button data-k="injected" style="width:100%;text-align:left;font-size:14px;min-height:52px;padding:0 14px;margin-bottom:9px;border-radius:10px;cursor:pointer;border:1px solid #0f5c33;background:rgba(43,255,128,.08);color:#d9ffe9">🦊 &nbsp;Browser wallet <span style="color:#7fd8a8">(MetaMask)</span></button>' +
        '<button data-k="walletconnect" style="width:100%;text-align:left;font-size:14px;min-height:52px;padding:0 14px;margin-bottom:9px;border-radius:10px;cursor:pointer;border:1px solid #0f5c33;background:rgba(43,255,128,.08);color:#d9ffe9">📱 &nbsp;WalletConnect <span style="color:#7fd8a8">(mobile)</span></button>' +
        '<button data-k="" style="width:100%;font-size:14px;min-height:44px;padding:0 9px;border-radius:10px;cursor:pointer;border:1px solid #0f5c33;background:transparent;color:#7fd8a8">cancel</button>' +
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
    const r = k === 'walletconnect' ? await connectWalletConnect() : await connectInjected();
    // WC hiccuped on a phone with no injected wallet → offer the in-wallet deep links instead of a dead end
    if (!r.ok && k === 'walletconnect' && r.reason !== 'user-rejected' && r.reason !== 'cancelled'
        && isMobileUA() && !injected()) { await deepLinkPanel(); return { ok: false, reason: 'cancelled' }; }
    return r;
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

  /* ⛔ A BALANCE THAT CANNOT BE READ IS NOT A BALANCE OF ZERO, AND CONFLATING THEM COST THE
   *   ARTIST A LAUNCH-NIGHT PANIC. `eth_call` is routed through the CONNECTED WALLET, so if the
   *   wallet sits on a different chain than the token, it queries an address with no code there,
   *   the node answers `0x`, `BigInt('0x')` THROWS, the catch swallows it and the purse prints a
   *   confident `0`. Measured: the mainnet edition queried on Sepolia returns exactly `0x`.
   * ⚑ He held 355.49 $3030 and the site said 0 — the reassuring wrong answer, which is this
   *   project's most-repeated failure shape. `ok` now distinguishes "you have none" from "I could
   *   not see", and every caller is expected to render them differently.
   * ⚠ AND THE MATH TRUNCATED. `wei / 10n**18n` is INTEGER division, so 355.49 displayed as 355 —
   *   a purse that quietly rounds a holder's balance down. Scaled before dividing. */
  async function balance(who) {
    const acct = who || account;
    if (!acct || !isLive()) return { wei: 0n, tokens: 0, ok: false, reason: 'not-live' };
    try {
      const data = '0x70a08231' + '000000000000000000000000' + acct.slice(2);
      const res = await req('eth_call', [{ to: token(), data }, 'latest']);
      if (!res || res === '0x') {
        /* No code at that address on whatever chain the wallet is on. */
        const on = await currentChain();
        return { wei: 0n, tokens: 0, ok: false,
                 reason: on && on !== wantChainId() ? 'wrong-chain' : 'no-token', chain: on };
      }
      const wei = BigInt(res);
      return { wei, tokens: Number((wei * 10000n) / (10n ** 18n)) / 10000, ok: true };
    } catch (e) {
      return { wei: 0n, tokens: 0, ok: false, reason: 'read-failed' };
    }
  }

  // the site's one real transaction: burn $3030 (a rip, or an arena ante)
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

  /* ── THE 50/50 SPLIT: half burns, half funds the studio ────────────────────────────────────
   * docs/TREASURY.md. This CANNOT be two client-side transactions — a wallet can sign the burn
   * and reject the transfer, which destroys a collector's tokens and pays the studio nothing.
   * The split therefore happens inside contracts/PackSink.sol, in ONE call that either wholly
   * succeeds or wholly reverts, and the browser's job is just: approve, then call it.
   *
   * ⚑ FALLS BACK TO THE PLAIN BURN when `contracts.packSink` is unset — same degradation as
   *   `lens721:""`. So this ships dark: behaviour is byte-for-byte what it is today until the
   *   sink is deployed and its address pasted in. The `split` flag in the result says which
   *   path ran, so callers can tell the truth in their copy rather than assuming.
   */
  const MAXU = (2n ** 256n) - 1n;
  const wei = n => BigInt(Math.max(0, Math.floor(Number(n) || 0))) * (10n ** 18n);
  const u256 = v => v.toString(16).padStart(64, '0');
  const argAddr = a => '000000000000000000000000' + a.slice(2);

  async function allowance(owner, spender) {
    try {
      const data = '0xdd62ed3e' + argAddr(owner) + argAddr(spender);       // allowance(address,address)
      return BigInt((await req('eth_call', [{ to: token(), data }, 'latest'])) || '0x0');
    } catch { return 0n; }
  }

  /* Poll for a receipt. Needed because `approve` and the split call are two transactions and the
   * second one's gas estimate fails while the allowance is still pending — the wallet shows a
   * "this will probably fail" warning even though nonce ordering would have made it fine. */
  async function waitTx(hash, ms = 180000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        const r = await req('eth_getTransactionReceipt', [hash]);
        if (r && r.blockNumber) return { ok: BigInt(r.status || '0x1') === 1n, receipt: r };
      } catch {}
      await new Promise(r => setTimeout(r, 3000));
    }
    return { ok: false, reason: 'tx-timeout' };
  }

  async function send(to, data) { return req('eth_sendTransaction', [{ from: account, to, data }]); }

  /* Approve the sink for `need`, topping up in batches so a player isn't signing an approval
   * before every single rip.
   *
   * ⚠ DELIBERATELY NOT AN UNLIMITED APPROVAL. It would in fact be safe here — PackSink's only
   *   `transferFrom` takes from `msg.sender`, so an allowance you grant it can only ever be
   *   spent by a transaction you sent yourself; nobody else can touch it. But "approve
   *   unlimited, it's fine" is the exact reflex that gets drained elsewhere, and a bounded
   *   number is legible in the wallet prompt. The habit is worth more than the gas.
   */
  async function ensureAllowance(need) {
    const have = await allowance(account, sink());
    if (have >= need) return { ok: true, approved: false };
    const batch = Math.max(1, Number(CFG().approveBatch) || 12);
    const want = need * BigInt(batch) > MAXU ? need : need * BigInt(batch);
    try {
      const tx = await send(token(), '0x095ea7b3' + argAddr(sink()) + u256(want));  // approve(address,uint256)
      const r = await waitTx(tx);
      if (!r.ok) return { ok: false, reason: r.reason || 'approve-failed' };
      return { ok: true, approved: true, tx };
    } catch (e) {
      return { ok: false, reason: (e && e.code === 4001) ? 'user-rejected' : 'approve-failed' };
    }
  }

  // shared by payPack/payRake — `selector` is buyPack(uint256) or payRake(uint256)
  async function splitPay(tokens, selector, onStep) {
    const amt = Math.max(0, Math.floor(Number(tokens) || 0));
    if (amt <= 0) return { ok: false, reason: 'zero' };
    if (!isLive()) return { ok: false, reason: 'not-live' };
    if (!hasSink()) return Object.assign(await burn(amt), { split: false });   // ← ships dark until deployed
    if (!account) { const c = await connect(); if (!c.ok) return c; }
    const g = await ensureChain(); if (!g.ok) return g;

    const need = wei(amt);
    if (onStep) onStep('approve');
    const a = await ensureAllowance(need); if (!a.ok) return a;
    if (onStep) onStep('pay');
    try {
      const tx = await send(sink(), selector + u256(need));
      return { ok: true, tx, split: true, burned: Math.floor(amt / 2), treasury: amt - Math.floor(amt / 2) };
    } catch (e) {
      return { ok: false, reason: (e && e.code === 4001) ? 'user-rejected' : 'tx-failed', error: e && (e.message || '') };
    }
  }

  /* ⚠ SELECTORS ARE PINNED BY `npm run test:pack`, which recomputes them from the compiled ABI
   *   and reads this file back. They are not guessable — my first pass at writing these from
   *   memory got BOTH wrong, and a wrong selector does not throw: it hits the fallback and
   *   reverts, or worse, calls something else. There is no plausible reason to edit them by
   *   hand, and if the contract's signatures ever change the test fails here. */
  const payPack = (tokens, onStep) => splitPay(tokens, '0xdc45bfb3', onStep);   // buyPack(uint256)
  const payRake = (tokens, onStep) => splitPay(tokens, '0x85cf61ef', onStep);   // payRake(uint256)

  /* 100% to the studio — Rip Rocketer's flat launch fee (artist directive, 2026-08-01).
   *
   * ⚑ THIS NEEDS NO CONTRACT, AND THAT IS THE WHOLE POINT. PackSink exists because a SPLIT is
   *   two operations that must not half-execute. Paying one address is ONE operation: a plain
   *   ERC-20 `transfer`, atomic by definition. Routing it through the sink would have added a
   *   contract call, an approval and a second wallet prompt to buy exactly nothing. Reach for
   *   the contract when there is something to make atomic, not by habit.
   *
   * ⚠ FAILS CLOSED with no treasury configured. There is no sensible fallback: burning instead
   *   would perform a DIFFERENT economic action than the one asked for, and the zero address is
   *   how you destroy tokens by accident. Better a player gets a practice run than a silent
   *   substitution.
   */
  async function payTreasury(tokens) {
    const amt = Math.max(0, Math.floor(Number(tokens) || 0));
    if (amt <= 0) return { ok: false, reason: 'zero' };
    if (!isLive()) return { ok: false, reason: 'not-live' };
    const to = String(CFG().treasury || '').trim();
    if (!isAddr(to)) return { ok: false, reason: 'no-treasury' };
    if (!account) { const c = await connect(); if (!c.ok) return c; }
    const g = await ensureChain(); if (!g.ok) return g;
    try {
      const tx = await send(token(), '0xa9059cbb' + argAddr(to) + u256(wei(amt)));   // transfer(address,uint256)
      return { ok: true, tx, treasury: amt, burned: 0 };
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

  // Testnet editions only resolve on SuperRare's dev environment — the prod
  // collect page 404s for Sepolia/Base-Sepolia tokens (verified 2026-07-24).
  const srHost = () => (wantChainId() === 11155111 || wantChainId() === 84532)
    ? 'https://dev.superrare.co' : 'https://superrare.com';
  const buyUrl = () => isLive()
    ? `${srHost()}/liquid-editions/${wantChainId()}/${token()}`
    : 'https://superrare.com';
  /* ⛔ THE POOL IS NOT AN ADDRESS, SO IT DOES NOT GO THROUGH explorerAddr(). A Uniswap v4 pool is
   *   a 32-byte id into the singleton PoolManager, not a contract — `/address/0x7943…ab6` is a
   *   dead page. This builds the market link from the ONE declaration in chain-config, so the
   *   66-character hex exists in the repo exactly once.
   * ⚠ Returns '' when no pool is configured, and every caller must treat '' as "no market yet"
   *   and show nothing. A chart button that goes to a blank DexScreener search is worse than no
   *   chart button — `theme.js` records the rule: a control that goes nowhere is the one failure
   *   worse than absence. */
  const chartUrl = () => {
    const m = (CFG().market || {});
    const id = String(m.poolId || '').trim();
    return /^0x[0-9a-fA-F]{64}$/.test(id) ? (m.chartHost || '') + id : '';
  };
  const explorerAddr = a => `${(CHAINS[wantChainId()] || {}).explorer || 'https://etherscan.io'}/address/${a}`;
  const explorerTx = h => `${(CHAINS[wantChainId()] || {}).explorer || 'https://etherscan.io'}/tx/${h}`;

  // eager: if an injected wallet is already authorized, pick up the account silently
  (async () => {
    if (!injected()) return;
    try { const a = await injected().request({ method: 'eth_accounts', params: [] }); if (a && a[0]) { account = a[0]; provider = injected(); kind = 'injected'; bindEvents(provider); emit(); } } catch {}
  })();

  window.RipWallet = {
    connect, disconnect, ensureChain, balance, burn,
    payPack, payRake, payTreasury, allowance, waitTx,
    treasury: () => String(CFG().treasury || '').trim(),
    hasSink,                    // false ⇒ payPack/payRake fall back to a 100% burn
    sink: () => sink(),
    splitPct: () => (CFG().packSplit || { burn: 0.5, treasury: 0.5 }),
    request: req,               // raw EIP-1193 passthrough on the ACTIVE provider (js/eth-play.js pays on Base with it)
    account: () => account,
    kind: () => kind,
    isConnected: () => !!account,
    hasWallet: () => !!injected() || !!wcProjectId(),
    hasInjected: () => !!injected(),
    hasWalletConnect: () => !!wcProjectId(),
    isLive, buyUrl, chartUrl, explorerAddr, explorerTx,
    chainName: () => (CHAINS[wantChainId()] || {}).name || ('chain ' + wantChainId()),
    /* ⛔ WHERE THE WALLET ACTUALLY IS, WHICH IS NOT WHAT chainName() ANSWERS. chainName() reports
     *   the CONFIGURED chain, and the ledger printed it under the heading "The house" — i.e. it
     *   told a collector standing on Sepolia that they were on Ethereum, then showed them a zero
     *   balance. Two facts, one label. These are separate calls now. */
    walletChain: currentChain,
    walletChainName: async () => {
      const id = await currentChain();
      return id ? ((CHAINS[id] || {}).name || ('chain ' + id)) : null;
    },
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
      'not-live': 'The $3030 token isn’t deployed on this network yet.',
      'tx-failed': 'The transaction failed or was dropped.',
      'approve-failed': 'The spending approval didn’t go through, so nothing was charged.',
      'no-treasury': 'The studio wallet isn’t configured on this network, so the fee can’t be paid.',
      'tx-timeout': 'The network didn’t confirm in time. Check your wallet before trying again.',
      'zero': 'Nothing to burn.',
    }[reason] || ('Something went wrong (' + reason + ').')),
  };
})();

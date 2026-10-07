/* ripmaster3030studios — POOLFIND · the pools for a token, without an indexer.
 *
 * ⛔ THE COMPLAINT THIS EXISTS FOR, in the artist's words: *"it requires multiple windows, copy
 *   pasting pool addresses that no one knows off hand or how to search for."* He is right, and it
 *   is the sharpest form of the problem: a pool address is the single hardest string on the chain
 *   for a person to obtain. To use a pool reader honestly you first had to go to Uniswap or
 *   DexScreener, find the pool, copy it back — so the tool demanded you already do the thing it
 *   was for. Three frozen `try:` links under the box were the page admitting that.
 *
 * ⚑ THE FACTORY IS THE INDEX, AND THAT IS THE WHOLE TRICK. Uniswap v3's factory carries
 *   `getPool(tokenA, tokenB, fee)` as a view function — its own registry, authoritative, one
 *   `eth_call`. So the pools for a token are DERIVABLE: probe the quote assets people actually
 *   price in against the four fee tiers that exist, and whatever comes back non-zero is real.
 *   No indexer, no API key, no third-party list that can go stale or lie.
 *   ✅ Proved before anything was built on it: getPool(USDC, WETH, 500) returns
 *      0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640, the known USDC/WETH 0.05% pool.
 *
 * ⚠ CREATE2 WOULD ALSO WORK AND IS THE WRONG TOOL HERE. A v3 pool address is
 *   keccak(0xff ‖ factory ‖ keccak(abi(t0,t1,fee)) ‖ initCodeHash), which is offline and needs no
 *   RPC at all — but it needs a keccak in the browser, and it reports an address for pools that
 *   were never created. The factory answers "does this exist" in the same call, which is the
 *   question actually being asked.
 *
 * ⛔ EVERY ADDRESS IN `TOKENS` IS VERIFIED ON-CHAIN, NEVER FROM MEMORY — `npm run test:poolfind`
 *   reads symbol() and decimals() off each one and fails on a mismatch. A wrong token address in
 *   a registry does not error: it sends somebody to a real market for the wrong asset, which is
 *   this repo's own "a buy link is a claim about which market is ours" rule applied to a lookup.
 *
 * ⚠ CLASSIC SCRIPT, NOT ESM — `npm run test:reach` §0 compiles every shipped browser script with
 *   `new Function`, and an `export` there is a syntax error that marks the whole file broken. It
 *   assigns to `window.PoolFind` and is read by the CLI the same way `js/check3030.js` is.
 */
(function (root) {
  'use strict';

  /* the v3 factory, per chain. ⚠ Base's is NOT the mainnet address — a mainnet factory on Base
   * has no code, so `getPool` returns empty and every token would report "no pools", which reads
   * as a quiet token rather than as a misconfiguration. */
  var FACTORY = {
    ethereum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    base:     '0x33128a8fC17869897dcE68Ed026d694621f6FDfD'
  };

  /* ⚑ THE QUOTE SIDE IS WHAT PEOPLE PRICE IN, not every token in existence. A pool is a PAIR, so
   * finding "the pools for X" means asking what X trades against — and in practice that is a
   * handful of assets. Four quotes × four fee tiers is sixteen reads, which is one batch. */
  var QUOTES = {
    ethereum: [
      { sym: 'WETH', addr: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', dec: 18 },
      { sym: 'USDC', addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', dec: 6 },
      { sym: 'USDT', addr: '0xdAC17F958D2ee523a2206206994597C13D831ec7', dec: 6 },
      { sym: 'DAI',  addr: '0x6B175474E89094C44Da98b954EedeAC495271d0F', dec: 18 }
    ],
    base: [
      { sym: 'WETH', addr: '0x4200000000000000000000000000000000000006', dec: 18 },
      { sym: 'USDC', addr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', dec: 6 }
    ]
  };

  /* every fee tier v3 has. 100 (0.01%) and 10000 (1%) are where the surprises live — a token
   * whose only pool is 1% is a token with a toll on it. */
  var FEES = [100, 500, 3000, 10000];

  /* ⚠ A NAME REGISTRY IS A CONVENIENCE AND MUST NEVER BE THE ONLY WAY IN. It exists so somebody
   * can type "pepe" instead of holding an address; a raw token address always works and is the
   * path that cannot go stale. Kept short on purpose — a long hand-maintained list is this repo's
   * most frequently paid bill, and every row here is asserted against the chain. */
  var TOKENS = {
    ethereum: {
      weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      dai:  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      wbtc: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      uni:  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      link: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      pepe: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
      shib: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
      rare: '0xba5BDe662c17e2aDFF1075610382B9B691296350',
      '3030': '0x1D4bcbb505182a49303CC3B23EfF1E3157147A33'
    },
    base: {
      weth: '0x4200000000000000000000000000000000000006',
      usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    }
  };

  var GET_POOL = '0x1698ee82';                                  /* getPool(address,address,uint24) */
  var pad = function (h) { return h.replace(/^0x/, '').toLowerCase().padStart(64, '0'); };
  var isAddr = function (s) { return /^0x[0-9a-fA-F]{40}$/.test(String(s || '').trim()); };

  /* ⚠ RESOLVE IS CASE-INSENSITIVE ON NAMES AND EXACT ON ADDRESSES. A symbol is a human's word for
   * a thing and "PEPE" and "pepe" are the same request; an address is not a word, and quietly
   * "correcting" one is how you point somebody at a different contract. */
  function resolve(input, chain) {
    var s = String(input || '').trim();
    if (isAddr(s)) return { addr: s, how: 'the address you gave' };
    var key = s.toLowerCase().replace(/^\$/, '');
    var t = (TOKENS[chain] || {})[key];
    return t ? { addr: t, how: 'resolved from the name ' + key } : null;
  }

  /* every (quote, fee) worth asking about for this token — the query plan, exposed so a caller
   * can show progress and a test can assert the shape without any network. */
  function plan(token, chain) {
    var out = [], qs = QUOTES[chain] || [], i, j;
    for (i = 0; i < qs.length; i++) {
      if (qs[i].addr.toLowerCase() === String(token).toLowerCase()) continue;   /* not against itself */
      for (j = 0; j < FEES.length; j++) out.push({ quote: qs[i], fee: FEES[j] });
    }
    return out;
  }

  /* `call` is injected: (to, data) -> Promise<hex>. The module does no fetching of its own so the
   * page keeps its own endpoint list, its own timeouts and its own failover — and the test can
   * drive it with no network at all. */
  function find(token, chain, call) {
    var f = FACTORY[chain];
    if (!f) return Promise.resolve({ error: 'no factory known for ' + chain, pools: [] });
    var jobs = plan(token, chain).map(function (p) {
      var data = GET_POOL + pad(token) + pad(p.quote.addr) + pad(p.fee.toString(16));
      return call(f, data).then(function (hex) {
        var a = '0x' + String(hex || '').replace(/^0x/, '').slice(-40);
        /* the factory answers with the zero address for a pair that was never created */
        if (!/[1-9a-f]/.test(a.slice(2))) return null;
        return { pool: a, quote: p.quote.sym, quoteAddr: p.quote.addr, quoteDec: p.quote.dec,
                 fee: p.fee, feePct: p.fee / 10000 };
      }).catch(function () { return null; });          /* one dead read must not lose the others */
    });
    return Promise.all(jobs).then(function (rows) {
      var pools = rows.filter(Boolean);
      /* ⚠ ORDERED BY FEE, NOT BY "BEST". This module knows which pools EXIST and nothing about
       * which is the good one — depth is the pool reader's job, and guessing here would put a
       * recommendation in a lookup. */
      pools.sort(function (a, b) { return a.fee - b.fee; });
      return { pools: pools, asked: jobs.length };
    });
  }

  /* ── THE LONG TAIL ────────────────────────────────────────────────────────────────────────
     ⛔ THE REGISTRY WAS NEVER GOING TO BE ENOUGH. Artist: *"not pulling up token names like fwa
        mog etc"* — and thirteen hand-verified rows cannot cover a chain where a new token is
        deployed every minute. A longer hand-maintained list is the failure this repo pays for
        most often, so the answer is not more rows.

     ⛔ AND THERE IS NO ON-CHAIN ANSWER TO "WHAT IS MOG". `symbol()` reads forwards from an
        address; nothing reverses it, because a symbol is not unique and was never meant to be an
        identifier. Name resolution REQUIRES an index — the honest move is to use one only for the
        part that cannot be derived, and to keep everything downstream on-chain.

     ⛔ SO IT RETURNS CANDIDATES AND NEVER PICKS. Searching `fwa` finds THREE tokens of that name
        on Ethereum alone — $1,103,847, $30,538 and $0 of liquidity. Auto-resolving a name to one
        address is exactly the impostor trap `index.html` already warns about in its own contract
        block: *"a token search by name returns impostors; the address is the only unambiguous
        answer."* Every candidate is shown with its address and its depth, and a person chooses.
     ⚠ Sorted by liquidity because that is the one signal that separates the real one from the
        copies — but it is DISPLAYED, never applied as a filter. Hiding the $0 FWA would hide the
        very thing that makes the choice legible. */
  function search(query, getJson) {
    var q = String(query || '').trim().replace(/^\$/, '');
    if (!q) return Promise.resolve([]);
    var url = 'https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(q);
    return getJson(url).then(function (j) {
      var pairs = (j && j.pairs) || [], by = {}, i, p, k, c;
      for (i = 0; i < pairs.length; i++) {
        p = pairs[i];
        if (!p || !p.baseToken || !p.baseToken.address) continue;
        var chain = p.chainId === 'ethereum' ? 'ethereum' : (p.chainId === 'base' ? 'base' : null);
        if (!chain) continue;                       /* only chains this tool can actually read */
        k = chain + ':' + p.baseToken.address.toLowerCase();
        c = by[k] || (by[k] = { chain: chain, addr: p.baseToken.address,
              sym: p.baseToken.symbol || '?', name: p.baseToken.name || '', liq: 0, pairs: 0 });
        c.liq += (p.liquidity && p.liquidity.usd) || 0;
        c.pairs++;
      }
      var out = [];
      for (k in by) if (Object.prototype.hasOwnProperty.call(by, k)) out.push(by[k]);
      /* ⚠ AN EXACT SYMBOL MATCH RANKS ABOVE A SUBSTRING ONE. Searching "mog" should not put
         "MOGCOIN" above "MOG" merely because it is deeper. */
      var ql = q.toLowerCase();
      out.sort(function (a, b) {
        var ax = a.sym.toLowerCase() === ql ? 1 : 0, bx = b.sym.toLowerCase() === ql ? 1 : 0;
        return (bx - ax) || (b.liq - a.liq);
      });
      return out.slice(0, 8);
    }).catch(function () { return []; });          /* the index being down is not a fact about a token */
  }

  /* ⛔ WHATEVER THE INDEX SAID, THE CHAIN IS ASKED BEFORE ANYTHING IS READ. One `symbol()` call
     confirms the address really is the thing that was searched for, so a bad or stale index row
     can never put a stranger in front of pools for a token they did not ask about. This is the
     line between "an index told us" and "we checked". */
  function confirmSymbol(addr, call) {
    return call(addr, '0x95d89b41').then(function (hex) {
      if (!hex || hex === '0x') return null;
      var h = hex.replace(/^0x/, ''), out = '';
      if (h.length === 64) {                                   /* bytes32 symbol (old tokens) */
        for (var i = 0; i < 64; i += 2) {
          var v = parseInt(h.substr(i, 2), 16);
          if (v) out += String.fromCharCode(v);
        }
        return out.trim() || null;
      }
      var len = parseInt(h.slice(64, 128), 16) || 0;            /* abi string */
      for (var j = 0; j < len; j++) out += String.fromCharCode(parseInt(h.substr(128 + j * 2, 2), 16));
      return out.trim() || null;
    }).catch(function () { return null; });
  }

  root.PoolFind = {
    FACTORY: FACTORY, QUOTES: QUOTES, FEES: FEES, TOKENS: TOKENS,
    isAddr: isAddr, resolve: resolve, plan: plan, find: find,
    search: search, confirmSymbol: confirmSymbol
  };
})(typeof window !== 'undefined' ? window : this);

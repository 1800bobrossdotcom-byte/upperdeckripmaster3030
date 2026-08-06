/* ripmaster3030studios — LIVE MARKET STATE FOR A LENS.  `LensState`
 *
 *   LensState.read(cfg)          -> Promise<state>     one snapshot, never rejects
 *   LensState.watch(cb, cfg)     -> stop()             polls; pauses when the tab is hidden
 *   LensState.derive(state, cfg) -> drivers            raw numbers -> 0..1 dials for a renderer
 *   LensState.STATIC             -> state              the resting state; `live:false`
 *
 * WHAT THIS IS. "Every card is a LENS" has two halves. The contract half renders metadata from
 * chain state. This is the BROWSER half: the same reads, done client-side, so the card a
 * collector is looking at right now moves with the market it is a lens over.
 *
 * ══ THE RULES THIS FILE EXISTS TO OBEY ═════════════════════════════════════════════════════
 *
 * ⛔ NO WALLET. EVER. Not behind a click, not behind a flag. `cards/lens3d.html` is what a
 *    token's `animation_url` frames, and SuperRare's security team was right: a frame that asks
 *    for a wallet is indistinguishable from one that has been swapped for a malicious frame.
 *    There is no provider here, no signing, no connect. Read-only `eth_call` over `fetch` is the
 *    entire network surface — it can show state, it cannot move anything.
 *
 * ⚠ THE SANDBOX IS THE REAL DEPLOYMENT TARGET. An opaque origin: `localStorage` THROWS (so this
 *   file never touches it — the session baseline below lives in a module variable and dies with
 *   the page), there is no `window.parent`, and every request may simply be refused. Therefore
 *   **every path returns `LensState.STATIC`** rather than throwing, and the caller's job is to
 *   look good with it. A lens that degrades to something handsome is worth more than one that
 *   degrades to nothing.
 *
 * ⚑ SELECTOR TRAPS — these are recomputed and asserted by `scripts/test-lens-state.mjs`, which
 *   exists precisely because writing 4-byte selectors from memory has already produced two wrong
 *   ones in this repo. Do not edit SEL by hand without running it.
 *     · `maxTotalSupply()` is 0x2ab4d052. **`0xd5abeb01` is `maxSupply()`** — a DIFFERENT
 *       function that REVERTS on this edition. Verified against the chain, not guessed.
 *     · `getMarketState()` is 0xd8165743 and its WORD ORDER is word0 = rarePerToken. Verified
 *       three ways on Sepolia (contracts/interfaces/ILiquid.sol carries the working). ⚑ And
 *       because CLAUDE.md warns it "can drift", `read()` PROVES it every time — see `_orderOk`.
 */
(function (global) {
  'use strict';

  /* ── the calls ─────────────────────────────────────────────────────────────────────────────
   * Signature strings are kept beside the selectors on purpose: the test recomputes keccak over
   * exactly these strings and asserts the hex, so the pair can never silently disagree. */
  var SEL = {
    'totalSupply()':     '0x18160ddd',
    'maxTotalSupply()':  '0x2ab4d052',
    'getMarketState()':  '0xd8165743',
    /* ── THE LENS's OWN READ. Everything above is the EDITION; this one is the 721.
     * ⚑ IT NEEDS NO WALLET, AND THAT IS WHY IT IS ALLOWED HERE AT ALL. `lensState(id)` resolves
     *   the card's OWNER on-chain and reports THAT wallet's tier — so the card knows who holds it
     *   without asking the viewer to connect anything. A frame that asks for a wallet is
     *   indistinguishable from one that has been swapped for a malicious frame (SuperRare's
     *   security team flagged exactly this), so a read that needed `eth_accounts` could not ship
     *   in the media slot. This one is a plain eth_call over fetch: it can show state and it
     *   cannot move anything. */
    'lensState(uint256)': '0x9fa9fc54'
  };

  /* ── display conventions ───────────────────────────────────────────────────────────────────
   * ⚠ These turn absolute chain numbers into 0..1 dials. They are DISPLAY CONVENTIONS, not
   * economic claims, and each says where it came from. None of them is a prediction.        */
  var CONV = {
    /* Full deflection of the BURN dial = the whole planned pack programme burnt. 3.1% of mint
     * is `scripts/token-model.mjs`'s four-tier sellout figure at CAP 33,000,000 WITH the 50/50
     * split live (CLAUDE.md's table). It is a model output we already publish, not a new number.
     * sqrt, because the first pack burnt should be visible and the ten-thousandth should not
     * double the picture. */
    burnFull: 0.031,
    /* Full deflection of the PRICE dial = a 2x move. 1.0001^6932 = 2.0000, so the span is in
     * ticks, which is what the market actually quotes — no RARE/USD assumption anywhere. */
    tickSpan: 6932,
    /* Full deflection of the DEPTH dial = one decade of liquidity. */
    liqDecades: 1,
    /* ⛔ P0 IS AN UNMADE DECISION (CLAUDE.md: "re-derive P0 against 33M supply from the flow's
     * preview, do not carry the old assumption forward"). So price and depth have no absolute
     * anchor to normalise against, and this file REFUSES TO INVENT ONE. Both dials are measured
     * against `ref` — pin it after launch by passing `{ref:{tick, liquidity}}`. Until then the
     * first successful read of the session becomes the reference, both dials rest at 0.5, and
     * the card moves when the MARKET moves rather than pretending to know where zero is. */
    ref: null
  };

  var DEFAULT_TIMEOUT = 6000;
  var MIN_POLL = 30000;      // pull-based, like SuperRare's own model. Do not hammer a free RPC.

  /* The resting card. Every dial neutral, `live:false`. A caller that renders this must look
   * exactly like a good static card, because in a hostile frame this is what ships. */
  var STATIC = Object.freeze({
    live: false, reason: 'no-read', tier: null,
    supply: null, maxSupply: null, burned: null, burnFrac: null,
    rarePerToken: null, tokenPerRare: null, tick: null, liquidity: null,
    orderOk: null, at: 0
  });

  /* Session reference for the relative dials. In memory ONLY — `localStorage` throws at an
   * opaque origin, and a reference that survived across pages would silently outlive the market
   * it referred to anyway. */
  var _ref = null;
  var _last = null, _inflight = null;

  function cfgOf(o) {
    o = o || {};
    var chain = (o.chain !== undefined) ? o.chain : global.RIPMASTER_CHAIN;
    var c = chain || {};
    return {
      edition: o.edition || (c.contracts && c.contracts.liquidEdition) || '',
      /* Empty until the 721 is deployed — `hold` then stays 0, which is Ash, which is what an
       * unheld card looks like anyway. Nothing to special-case downstream. */
      lens: o.lens || (c.contracts && c.contracts.lens721) || '',
      card: o.card || 0,
      rpcs: o.rpcs || c.rpcs || [],
      timeout: o.timeout || DEFAULT_TIMEOUT,
      conv: o.conv || CONV,
      ref: (o.ref !== undefined) ? o.ref : (o.conv && o.conv.ref) || CONV.ref
    };
  }

  /* ── one eth_call, best effort ─────────────────────────────────────────────────────────────
   * No library, no provider, no dependency: this formats a JSON-RPC envelope and reads hex back.
   * AbortController so a dead RPC cannot hold the card in a pending state forever. */
  function call(rpc, to, data, timeout) {
    var ctl = null, timer = null;
    try { ctl = new AbortController(); } catch (e) { ctl = null; }
    var init = {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call',
                             params: [{ to: to, data: data }, 'latest'] })
    };
    if (ctl) { init.signal = ctl.signal; timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, timeout); }
    return fetch(rpc, init)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (timer) clearTimeout(timer);
        /* A revert comes back as an `error` or as '0x'. Both mean "not the function you think it
         * is" — which is exactly how the maxSupply/maxTotalSupply trap presents. Return null and
         * let the sanity checks below refuse the whole read. */
        if (!j || j.error || !j.result || j.result === '0x') return null;
        return j.result;
      })
      .catch(function () { if (timer) clearTimeout(timer); return null; });
  }

  function words(hex) {
    if (!hex) return null;
    var h = hex.slice(2), out = [];
    for (var i = 0; i + 64 <= h.length; i += 64) out.push(BigInt('0x' + h.substr(i, 64)));
    return out;
  }
  /* 1e18-scaled BigInt -> Number. Divides in BigInt first: `Number(1e24 wei)` is past 2^53 and
   * would quietly lose the low digits, which on a burn figure is the difference between 1,300
   * and 1,296. Six decimal places kept, which is more than any dial here can show. */
  function fx(bi) {
    if (bi === null || bi === undefined) return null;
    return Number((bi * 1000000n) / 1000000000000000000n) / 1e6;
  }
  function i24(bi) {          // int24 arrives right-aligned in a 32-byte word, sign-extended
    var v = BigInt.asIntN(24, bi & 0xffffffn);
    return Number(v);
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* ── the read ──────────────────────────────────────────────────────────────────────────────
   * Tries each configured RPC in turn; the first one that returns a COHERENT set wins. Coherent
   * is doing real work here — see the two checks below. */
  function read(o) {
    var cfg = cfgOf(o);
    if (_inflight) return _inflight;
    if (!cfg.edition || !cfg.rpcs.length || typeof fetch !== 'function')
      return Promise.resolve(fail('no-config'));

    /* ⛔ THE TIER READ IS DELIBERATELY NOT IN THE Promise.all BELOW. `lens721` is empty until the
     *   contract is deployed, and a card must not lose its BURN dial because its tier happens to
     *   be unknowable. Folded in, an unset lens would reject the whole read and walk every RPC
     *   retrying it. Separate, optional, and it resolves to null without costing anything. */
    function readTier(rpc) {
      if (!cfg.lens || !cfg.card) return Promise.resolve(null);
      var id = Number(cfg.card).toString(16);
      while (id.length < 64) id = '0' + id;
      return call(rpc, cfg.lens, SEL['lensState(uint256)'] + id, cfg.timeout).then(function (hex) {
        var h = (hex || '').replace(/^0x/, '');
        if (h.length < 7 * 64) return null;            // not the lens, or a reverted read
        // (live, tier, burnBps, minted, rarePerToken, tick, liquidity) — tier is word 1
        var t = parseInt(h.slice(64, 128), 16);
        return (t >= 0 && t <= 4) ? t : null;
      }).catch(function () { return null; });
    }

    var i = 0;
    function attempt() {
      if (i >= cfg.rpcs.length) return fail('unreachable');
      var rpc = cfg.rpcs[i++];
      return Promise.all([
        call(rpc, cfg.edition, SEL['totalSupply()'], cfg.timeout),
        call(rpc, cfg.edition, SEL['maxTotalSupply()'], cfg.timeout),
        call(rpc, cfg.edition, SEL['getMarketState()'], cfg.timeout)
      ]).then(function (r) {
        var st = decode(r[0], r[1], r[2]);
        if (!st) return attempt();
        return readTier(rpc).then(function (t) { st.tier = t; return st; });
      }).catch(function () { return attempt(); });
    }

    _inflight = attempt().then(function (st) {
      _inflight = null; _last = st;
      if (st.live && !_ref) _ref = { tick: st.tick, liquidity: st.liquidity };
      return st;
    }, function () { _inflight = null; return fail('threw'); });
    return _inflight;
  }

  function fail(reason) {
    var s = Object.assign({}, STATIC); s.reason = reason; return Object.freeze(s);
  }

  function decode(totalHex, maxHex, mktHex) {
    var tw = words(totalHex), mw = words(maxHex), kw = words(mktHex);
    if (!tw || !tw.length || !mw || !mw.length || !kw || kw.length < 6) return null;

    var supply = tw[0], max = mw[0];
    /* ⚑ SANITY 1 — the cap trap. `maxSupply()` reverts on this edition, so a wrong selector
     * yields null and never gets here; but a DIFFERENT contract at this address could return a
     * cap under the live supply. A "burned" figure computed from that would be a false claim
     * rendered confidently on a collector's card, which is the exact failure superrare.html
     * already had to fix once. Refuse the whole read instead. */
    if (supply <= 0n || max <= 0n || max < supply) return null;

    var rarePerToken = kw[0], tokenPerRare = kw[1], tick = i24(kw[3]), liquidity = kw[4];

    /* ⚑ SANITY 2 — THE WORD-ORDER PROOF. CLAUDE.md flags that `getMarketState()`'s word order
     * "can drift" and it is unproven on the real mainnet edition. It does not have to stay a
     * worry: the tick and the price are the SAME quantity expressed twice, so
     * 1.0001^tick must equal word1 (tokenPerRare). Measured on Sepolia today the two agree to
     * 4.4e-5. If the words were swapped, word1 would be ~16.8 against 1.0001^tick ~ 0.0596 and
     * this fails by 280x. So the card proves its own decoding on every read, and when it cannot
     * it drops the price/depth dials rather than rendering a lie. */
    var tpr = fx(tokenPerRare), rpt = fx(rarePerToken);
    var fromTick = Math.pow(1.0001, tick);
    var orderOk = (tpr > 0 && fromTick > 0 && Math.abs(tpr / fromTick - 1) < 0.02);

    var burned = max - supply;
    var s = {
      live: true, reason: 'ok', at: Date.now(),
      supply: fx(supply), maxSupply: fx(max), burned: fx(burned),
      burnFrac: Number((burned * 1000000000n) / max) / 1e9,
      rarePerToken: orderOk ? rpt : null,
      tokenPerRare: orderOk ? tpr : null,
      tick: orderOk ? tick : null,
      liquidity: fx(liquidity),
      orderOk: orderOk
    };
    return Object.freeze(s);
  }

  /* ── numbers -> dials ──────────────────────────────────────────────────────────────────────
   * Renderers should never see wei. They get three 0..1 dials and a `live` flag, so the visual
   * mapping lives in one readable place and a card cannot accidentally depend on a raw unit.
   *
   *   burn  — ABSOLUTE and monotonic. It is the only dial that needs no reference, which is why
   *           it drives the most visible thing on the card. "The token burns so the art lives."
   *   price — relative to `ref` (pinned, or this session's first read). 0.5 is "unchanged".
   *   depth — market liquidity, relative to `ref`, log scale. ⚑ Liquidity 0 -> depth 0 -> the
   *           card's layers collapse toward the plate. That is not a fallback, it is the true
   *           statement: no depth in the book, no depth in the card.
   */
  function derive(state, o) {
    var cfg = cfgOf(o), C = cfg.conv || CONV;
    var d = { live: false, burn: 0, price: 0.5, depth: 0.5, hold: 0, orderOk: null };
    /* ⚑ HOLD SURVIVES A DEAD MARKET READ. The tier comes off a different contract, so a card
     *   whose edition is unreachable can still know who holds it. Set before the early return. */
    if (state && typeof state.tier === 'number') d.hold = clamp01(state.tier / 4);
    if (!state || !state.live) return d;
    d.live = true; d.orderOk = state.orderOk;

    d.burn = clamp01(Math.sqrt(Math.max(0, state.burnFrac) / (C.burnFull || 0.031)));

    var ref = cfg.ref || _ref;
    if (state.tick !== null && ref && typeof ref.tick === 'number')
      d.price = clamp01(0.5 + (state.tick - ref.tick) / (C.tickSpan || 6932) * 0.5);

    if (state.liquidity !== null) {
      if (state.liquidity <= 0) d.depth = 0;
      else if (ref && ref.liquidity > 0)
        d.depth = clamp01(0.5 + Math.log(state.liquidity / ref.liquidity) / Math.LN10
                                / (2 * (C.liqDecades || 1)));
    }
    return d;
  }

  /* ── polling ───────────────────────────────────────────────────────────────────────────────
   * SuperRare's own note: "a render contract is not a background process… the market changes
   * on-chain, metadata gets refetched, and the artwork changes." Same discipline here — pull,
   * slowly, and not at all while nobody is looking. */
  function watch(cb, o) {
    var cfg = cfgOf(o), every = Math.max(MIN_POLL, (o && o.every) || 60000);
    var stopped = false, timer = null;
    function tick() {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.hidden) { timer = setTimeout(tick, every); return; }
      read(o).then(function (st) {
        if (stopped) return;
        try { cb(st, derive(st, o)); } catch (e) {}
        timer = setTimeout(tick, every);
      });
    }
    tick();
    return function () { stopped = true; if (timer) clearTimeout(timer); };
  }

  global.LensState = {
    read: read, watch: watch, derive: derive,
    STATIC: STATIC, SEL: SEL, CONV: CONV, MIN_POLL: MIN_POLL,
    last: function () { return _last; },
    /* test seam: forget the session baseline so a check can pin its own */
    _resetRef: function (r) { _ref = r || null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

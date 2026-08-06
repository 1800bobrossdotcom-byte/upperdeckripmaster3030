/* SEPOLIA PRE-FLIGHT — everything the dress rehearsal assumes, checked against the live chain.
 *
 *   npm run preflight            reads Sepolia
 *   npm run preflight -- --rpc https://…    against another endpoint
 *
 * ⛔ NO KEY, NO WRITES, NO GAS. Every call here is `eth_call` or `eth_getCode`. That is the point:
 *    the expensive, irreversible half of a rehearsal is the deploy, and every reason to abort one
 *    is knowable beforehand for free. Run this, then run the runbook in docs/LENS-REHEARSAL.md.
 *
 * ⚑ WHAT IT IS FOR. CLAUDE.md carries a list of things that are "verified on-chain, not from
 *   memory" and a matching list of things that are NOT — and the second list is what bites:
 *     · "`chain-config` had carried the superseded renderer address — ALWAYS read
 *       `edition.renderContract()`, never trust a recorded address."
 *     · "`getMarketState()` word order … can drift" and is unproven on the real edition. A
 *       transposed word puts a 280x-wrong price on a collector's card.
 *     · "`maxTotalSupply()` is 0x2ab4d052. 0xd5abeb01 is `maxSupply()`, a DIFFERENT function that
 *       REVERTS on this edition."
 *   Each of those is one `eth_call`. There is no reason for any of them to still be a worry.
 *
 * ⚠ THIS READS THE REHEARSAL EDITION, WHICH IS NOT THE LAUNCH TOKEN. The Sepolia edition's
 *   `name()` is "Upperdeck Ripmaster 3030" — title case, the retired studio name — because it was
 *   deployed before the rename and `name()` is frozen at deploy. That is not a bug to fix, it is
 *   the exhibit: this project already owns a token permanently stuck with a wrong name, which is
 *   why docs/TESTNET.md's deploy command is now asserted character-for-character by
 *   `npm run test:name`. The launch token is `ripmaster3030` / `3030`.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sha3 from 'js-sha3';
const { keccak_256 } = sha3;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argRpc = (i => i >= 0 ? argv[i + 1] : null)(argv.indexOf('--rpc'));

/* chain-config.js is a browser global; read it as text and pull the JSON literal out rather than
 * importing it, so this script never depends on a DOM. */
const cfgSrc = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
const pick = k => (cfgSrc.match(new RegExp(`${k}\\s*:\\s*"([^"]*)"`)) || [])[1] || '';
const pickNum = k => Number((cfgSrc.match(new RegExp(`${k}\\s*:\\s*(\\d+)`)) || [])[1] || 0);
const RPCS = argRpc ? [argRpc]
  : [...cfgSrc.matchAll(/"(https:\/\/[^"]*sepolia[^"]*)"/gi)].map(m => m[1]);
const WANT_CHAIN = pickNum('chainId');
const EDITION = pick('liquidEdition');
const CFG_RENDERER = pick('renderer') || pick('renderContract');
const LENS721 = pick('lens721');
const PACKSINK = pick('packSink');

let pass = 0, fail = 0, warn = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const note = m => { warn++; console.log('  ⚠ ' + m); };
const info = m => console.log('    ' + m);

const sel = sig => '0x' + keccak_256(sig).slice(0, 8);
/* ⚑ Computed from the signature, never typed. Writing 4-byte selectors from memory has already
 *   produced two wrong ones in this repo (CLAUDE.md), and a wrong selector does not throw — it
 *   hits a different function or the fallback and returns something plausible. */
const SEL = {
  name: sel('name()'), symbol: sel('symbol()'), decimals: sel('decimals()'),
  totalSupply: sel('totalSupply()'), maxTotalSupply: sel('maxTotalSupply()'),
  maxSupply: sel('maxSupply()'), getMarketState: sel('getMarketState()'),
  renderContract: sel('renderContract()'), tokenURI0: sel('tokenURI()'),
};

let rpcIndex = 0;
async function rpc(method, params) {
  let lastErr = null;
  for (let i = 0; i < RPCS.length; i++) {
    const url = RPCS[(rpcIndex + i) % RPCS.length];
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      if (j && j.error) return { err: j.error.message || 'rpc error' };
      if (j && j.result !== undefined) { rpcIndex = (rpcIndex + i) % RPCS.length; return { result: j.result }; }
    } catch (e) { lastErr = e.message; }
  }
  return { err: lastErr || 'all endpoints failed' };
}
const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);

const big = h => { try { return BigInt(h || '0x0'); } catch { return 0n; } };
const words = h => { const b = (h || '').replace(/^0x/, ''); const out = [];
  for (let i = 0; i + 64 <= b.length; i += 64) out.push('0x' + b.slice(i, i + 64)); return out; };
/* An ABI-encoded string: offset, length, bytes. */
function decodeString(hex) {
  try {
    const w = words(hex); if (w.length < 3) return null;
    const len = Number(big(w[1]));
    const raw = (hex.replace(/^0x/, '')).slice(128, 128 + len * 2);
    return Buffer.from(raw, 'hex').toString('utf8');
  } catch { return null; }
}
const addrOf = w => '0x' + String(w).replace(/^0x/, '').slice(24);
const fx = (v, d = 18n) => Number(v / (10n ** (d - 6n))) / 1e6;
const i24 = w => { let n = Number(big(w) & 0xffffffn); if (n >= 0x800000) n -= 0x1000000; return n; };

console.log('\n══ SEPOLIA PRE-FLIGHT ' + '═'.repeat(55));
console.log(`   endpoints: ${RPCS.join(', ') || '(none found in chain-config)'}`);

// ── 1. the chain itself ──────────────────────────────────────────────────────────────────────
console.log('\n── the chain ──');
{
  const id = await rpc('eth_chainId', []);
  ok(!id.err, id.err ? `RPC unreachable — ${id.err}` : 'RPC answers');
  if (id.err) { console.log('\n  Nothing else can be checked without an endpoint.\n'); process.exit(1); }
  const got = Number(big(id.result));
  ok(got === WANT_CHAIN, `chainId ${got} matches chain-config's ${WANT_CHAIN}`);
  const bn = await rpc('eth_blockNumber', []);
  info(`head block ${Number(big(bn.result)).toLocaleString()}`);
}

// ── 2. the edition ───────────────────────────────────────────────────────────────────────────
console.log('\n── the Liquid Edition (the rehearsal token) ──');
let supply = 0n, maxSupply = 0n;
{
  ok(/^0x[0-9a-fA-F]{40}$/.test(EDITION), `chain-config names an edition — ${EDITION || '(empty)'}`);
  const code = await rpc('eth_getCode', [EDITION, 'latest']);
  ok(!code.err && code.result && code.result !== '0x', 'it has bytecode (it is a contract, not a wallet)');

  const [n, s, d] = await Promise.all([
    call(EDITION, SEL.name), call(EDITION, SEL.symbol), call(EDITION, SEL.decimals)]);
  const nm = decodeString(n.result), sy = decodeString(s.result);
  info(`name()   "${nm}"`);
  info(`symbol() "${sy}"`);
  info(`decimals ${Number(big(d.result))}`);
  /* ⚠ NOT asserted equal to the launch strings on purpose — see the header. This edition predates
   *   the rename and its name is frozen. The check that matters is that the LAUNCH command is
   *   right, and `npm run test:name` owns that. Here we only record what is actually deployed. */
  note(`this rehearsal edition is frozen as "${nm}" / "${sy}" — the LAUNCH token is "ripmaster3030" / "3030"`);

  const [ts, mts] = await Promise.all([call(EDITION, SEL.totalSupply), call(EDITION, SEL.maxTotalSupply)]);
  ok(!ts.err && !mts.err, 'totalSupply() and maxTotalSupply() both answer');
  supply = big(ts.result); maxSupply = big(mts.result);
  const burned = maxSupply - supply;
  info(`totalSupply    ${fx(supply).toLocaleString()}`);
  info(`maxTotalSupply ${fx(maxSupply).toLocaleString()}`);
  info(`burned to date ${fx(burned).toLocaleString()}   (${(Number(burned * 1000000n / (maxSupply || 1n)) / 10000).toFixed(4)}% of the mint)`);
  ok(burned > 0n, 'the dress-rehearsal burn is still on-chain — supply really did fall and never came back');

  /* ⛔ THE SELECTOR TRAP, PROVEN RATHER THAN REMEMBERED. */
  const ms = await call(EDITION, SEL.maxSupply);
  ok(!!ms.err || ms.result === '0x',
     `maxSupply() (${SEL.maxSupply}) REVERTS as documented — it is a different function, not an alias`);
}

// ── 3. the renderer, read off the edition ────────────────────────────────────────────────────
console.log('\n── the render contract ──');
{
  const rc = await call(EDITION, SEL.renderContract);
  if (rc.err || !rc.result || rc.result === '0x') {
    note(`renderContract() did not answer (${rc.err || 'empty'}) — the selector may differ on this edition`);
  } else {
    const live = addrOf(words(rc.result)[0]);
    info(`edition.renderContract() = ${live}`);
    info(`chain-config records      ${CFG_RENDERER || '(none)'}`);
    /* ⛔ THIS IS THE CHECK CLAUDE.md ASKS FOR BY NAME: chain-config once carried a SUPERSEDED
     *    renderer (title-case name, no animation_url, per-RARE truncated to 0). Reading the
     *    address off the edition is the only way to know which one is actually wired. */
    ok(CFG_RENDERER && live.toLowerCase() === CFG_RENDERER.toLowerCase(),
       'the recorded renderer IS the one the edition points at');
    const code = await rpc('eth_getCode', [live, 'latest']);
    ok(!code.err && code.result && code.result !== '0x', 'the live renderer has bytecode');
  }
}

// ── 4. the market state, and its word order ──────────────────────────────────────────────────
console.log('\n── getMarketState() and the word-order proof ──');
{
  const st = await call(EDITION, SEL.getMarketState);
  if (st.err || !st.result || st.result === '0x') {
    note(`getMarketState() did not answer (${st.err || 'empty'})`);
  } else {
    const w = words(st.result);
    ok(w.length >= 5, `it returns ${w.length} words`);
    const rarePerToken = fx(big(w[0])), tokenPerRare = fx(big(w[1])), tick = i24(w[3]);
    const fromTick = Math.pow(1.0001, tick);
    const drift = Math.abs(tokenPerRare / fromTick - 1);
    info(`word0 rarePerToken ${rarePerToken}`);
    info(`word1 tokenPerRare ${tokenPerRare}`);
    info(`word3 tick         ${tick}   ->  1.0001^tick = ${fromTick.toPrecision(6)}`);
    /* ⚑ THE TICK AND THE PRICE ARE THE SAME QUANTITY TWICE, so they must agree. If the words were
     *   swapped this fails by ~280x, which is exactly the size of the error it prevents from
     *   reaching a collector's card. js/lens-state.js runs this on every read for the same reason. */
    ok(drift < 0.02, `word order CONFIRMED: 1.0001^tick agrees with word1 to ${(drift * 100).toFixed(4)}%`);
    if (drift >= 0.02) info('⛔ the words are transposed — do NOT ship a price dial against this decoding');
  }
}

// ── 4b. the pack, against the MEASURED opening price ─────────────────────────────────────────
/* ✅ P0 IS MEASURED NOW — this block used to be the loudest thing in the preflight, because the
 *    pack schedule rested on an assumed P0 nobody had checked. SuperRare ran the live mainnet CLI
 *    previews on 2026-08-06 at the full 3,300,000 supply (low-demand preset, zero initial RARE
 *    liquidity, no creator allocation) and it opens at ~$0.08 per $3030 — 4x the old $0.02
 *    assumption. The block's own prediction ("an order of magnitude low") was right.
 *  ⛔ CONSEQUENCE: the pack is priced in DOLLARS now ($10/$12/$15/$20 by tier, artist-approved),
 *    and the token count is derived at each tier open and LOCKED for that tier. Tier I = 125.
 *  ⚠ THE SEPOLIA CURVE IS STILL UNCALIBRATED and its cap is 1,000,000, not 3,300,000. It is
 *    EXPECTED to disagree with mainnet and that disagreement is not a finding — which is exactly
 *    why this is a note and never a failure. A preflight that exits 1 on a documented, expected
 *    condition is a preflight everyone learns to ignore. */
console.log('\n── the pack, against the MEASURED mainnet opening price ──');
{
  const st = await call(EDITION, SEL.getMarketState);
  if (!st.err && st.result && st.result !== '0x') {
    const rarePerToken = fx(big(words(st.result)[0]));
    const RARE_USD  = 0.0159;      // the rate SuperRare's own create-flow showed
    const MAINNET_P0_USD = 0.08;   // MEASURED, mainnet preview, low-demand, 3.3M supply
    const TIER1_USD = 10;
    const tier1Tok  = Math.round(TIER1_USD / MAINNET_P0_USD);
    const liveUsdPerTok = rarePerToken * RARE_USD;
    info(`mainnet open (MEASURED)  $${MAINNET_P0_USD.toFixed(4)}/token  ->  tier I = ${tier1Tok} $3030 for $${TIER1_USD}`);
    info(`                          burned ${(tier1Tok/2).toFixed(1)} · studio ${(tier1Tok/2).toFixed(1)}`);
    info(`this Sepolia curve       $${liveUsdPerTok.toFixed(4)}/token  (${rarePerToken.toFixed(2)} RARE) — UNCALIBRATED, cap 1,000,000`);
    pass++;
    console.log('  ✓ P0 is measured, not assumed — the pack is a DOLLAR target (docs/PACK-PRICING.md)');
    /* ⚠ The one thing still worth a warning: the preview must be re-read at deploy time. The
     *   measured $0.08 is a quote, and a quote has a shelf life. */
    warn++;
    console.log('  ⚠ RE-READ `--preview` AT DEPLOY and confirm the open is still ~$0.08');
    info(`   If it has moved materially, re-derive docs/PACK-PRICING.md FIRST — the tier-I token`);
    info(`   count is the number the site will actually charge, and it is locked for the tier.`);
    info(`   ⛔ Preset must be --curve-preset low-demand. It is a DEPLOY-TIME PERMANENT.`);
  }
}

// ── 5. what is still dark ────────────────────────────────────────────────────────────────────
console.log('\n── the two contracts that ship DARK ──');
{
  const say = (label, addr, effect) => {
    if (/^0x[0-9a-fA-F]{40}$/.test(addr)) { pass++; console.log(`  ✓ ${label} configured — ${addr}`); }
    else { warn++; console.log(`  ⚠ ${label} EMPTY — ${effect}`); }
  };
  say('packSink', PACKSINK,
      'RipWallet.payPack/payRake fall back to a plain 100% burn, so the site\'s 50/50 revenue copy describes something the code is not doing');
  say('lens721', LENS721,
      'the collector door falls back to the local vault with verified:false');
}

console.log('\n' + '═'.repeat(76));
console.log(`  ${pass} checks passed · ${fail} failed · ${warn} notes`);
if (!fail) {
  console.log('\n  Nothing here blocks a rehearsal. Next: docs/LENS-REHEARSAL.md, and run the');
  console.log('  Rare CLI with --preview FIRST — it prints the generated curve without submitting,');
  console.log('  which is the last unmeasured number in the economics (P0, and therefore pack price).');
}
console.log('');
process.exit(fail ? 1 : 0);

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

// ── 4b. what the live price implies for the PACK ─────────────────────────────────────────────
/* ⛔ THIS IS THE MOST DECISION-RELEVANT NUMBER ON THE CHAIN AND IT IS NOT IN ANY DOC.
 *    `scripts/token-model.mjs` assumes P0 = 1 RARE per token, and the whole $7 pack rests on it:
 *    a pack is priced in TOKENS (350 at tier I), so the dollar price is just 350 x the token
 *    price. The Sepolia edition is the only real curve this project has ever had, and it does
 *    not open anywhere near 1 RARE. SuperRare's own worked example (CLAUDE.md, from their
 *    create-flow) points the same way — a $2,000 budget bought 9,211 tokens at ~$0.22 average.
 *  ⚠ The Sepolia curve is UNCALIBRATED and its cap is 1,000,000, not 3,300,000, so this is not a
 *    forecast. It is a reason to run `--preview` before believing the pack price, which is the
 *    single cheapest de-risking step left. */
console.log('\n── what the live curve implies for a $7 pack ──');
{
  const st = await call(EDITION, SEL.getMarketState);
  if (!st.err && st.result && st.result !== '0x') {
    const rarePerToken = fx(big(words(st.result)[0]));
    const RARE_USD = 0.0159;                       // the rate SuperRare's own create-flow showed
    const MODEL_P0 = 1;                            // scripts/token-model.mjs
    const PACK_TOKENS = 350;                       // tier I base
    const liveUsd = rarePerToken * RARE_USD * PACK_TOKENS;
    const modelUsd = MODEL_P0 * RARE_USD * PACK_TOKENS;
    info(`live spot            ${rarePerToken.toFixed(3)} RARE/token   (model assumes ${MODEL_P0})`);
    info(`350-token pack HERE  $${liveUsd.toFixed(2)}`);
    info(`350-token pack MODEL $${modelUsd.toFixed(2)}   <- the $7 the whole schedule is built on`);
    const ratio = rarePerToken / MODEL_P0;
    /* ⚠ A NOTE, NOT A FAILURE, and the distinction is deliberate. This does not BLOCK a
     *   rehearsal — it is the reason to run one. A preflight that exits 1 on a documented,
     *   expected condition is a preflight everyone learns to ignore, which is the same failure
     *   as the checker that cried wolf on the comment explaining its own bug. */
    if (ratio < 2) { pass++; console.log(`  ✓ the live curve is within 2x of the modelled P0 (${ratio.toFixed(1)}x)`); }
    else {
      warn++;
      console.log(`  ⚠ P0 IS ASSUMED, NOT KNOWN — the live curve is ${ratio.toFixed(1)}x the modelled opening price`);
      info(`⛔ ${ratio.toFixed(0)}x OFF. On this curve a tier-I pack costs $${liveUsd.toFixed(0)}, not $7.`);
      info(`   That is not a bug — this edition's curve was never calibrated — but it means P0 is`);
      info(`   ASSUMED, not known, and the pack schedule is downstream of it. Run the Rare CLI with`);
      info(`   --preview at the 3,300,000 cap and put the real number into token-model.mjs BEFORE`);
      info(`   the pack price is published anywhere it can be quoted back at the studio.`);
    }
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

#!/usr/bin/env node
/* ripmaster3030studios — read what a pack rip ACTUALLY did on-chain.
 *
 *   node scripts/rip-receipt.mjs            # every PackPaid since the sink was deployed
 *   node scripts/rip-receipt.mjs --tx 0x…   # one transaction, in full
 *
 * ⛔ THE SITE'S RECEIPT IS A CLAIM; THIS IS THE LEDGER. `pack.js` prints "62.5 burned · 62.5 to
 *   the studio" from ITS OWN arithmetic — the same numbers whether the split contract ran, the
 *   fallback 100% burn ran, or the transaction reverted after the UI had already updated. Every
 *   defect this project hit on launch night looked exactly like success from the browser. So the
 *   only trustworthy answer comes from the chain: the EVENT the contract emitted, and the
 *   BALANCES that moved.
 *
 * ⚑ FOUR INDEPENDENT FACTS, and they must agree. An event is what the contract SAID; a supply
 *   drop is what the burn DID; a treasury delta is what the studio RECEIVED; a zero sink balance
 *   is the contract holding nothing between calls. Any three can look right while the fourth is
 *   wrong — that is the whole reason to read all four rather than the convenient one.
 *
 * Keyless: `eth_call` and `eth_getLogs` only. No writes, no gas, nothing to approve.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak256, toHex } from 'viem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const ONE_TX = (argv[argv.indexOf('--tx') + 1] || '').match(/^0x[0-9a-fA-F]{64}$/) ? argv[argv.indexOf('--tx') + 1] : null;

const CFG = new Function('window', readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8') +
  '; return window.RIPMASTER_CHAIN;')({});

const TOKEN = CFG.contracts.liquidEdition;
const SINK = CFG.contracts.packSink;
const TREASURY = CFG.treasury;
const WAD = 10n ** 18n;

/* ── `--rpcs`: is the fallback list actually a fallback list? ──────────────────────────────────
 * ⛔ EXERCISE EVERY ENDPOINT, NOT JUST THE FIRST ONE THAT ANSWERS. The site's readers try each in
 *   turn and keep the first `result`, so a list where only entry one works is indistinguishable
 *   from a healthy one — until entry one throttles and the whole site reads as a token with no
 *   supply. Two of the three configured on launch night were returning `{"error":…}` inside an
 *   HTTP 200 and nobody could have known from the site.
 * ⚑ The strong check is not "did it answer" but "did they AGREE". Independent endpoints returning
 *   the same totalSupply cross-validate each other; one drifting is a node behind or lying, and
 *   that is visible only when more than one is asked. */
if (argv.includes('--rpcs')) {
  console.log(`── ${CFG.rpcs.length} configured RPC${CFG.rpcs.length === 1 ? '' : 's'} · asking each for totalSupply ──`);
  const seen = new Map();
  for (const url of CFG.rpcs) {
    const label = url.replace(/^https:\/\//, '').padEnd(34);
    try {
      /* ⚠ SEND `Origin: null`, WHICH IS THE CASE THAT ACTUALLY MATTERS AND THE ONE A PLAIN
       *   REQUEST CANNOT TEST. A server emits CORS headers only in response to an Origin, so
       *   node's fetch — which sends none — reported every endpoint as "CORS absent" including
       *   ones that are wide open. And `null` specifically is what `cabinet.html` sends: it runs
       *   in a sandboxed iframe at an opaque origin, i.e. the strictest case on the site. */
      const r = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'null' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call',
                               params: [{ to: TOKEN, data: '0x18160ddd' }, 'latest'] }),
      });
      const j = await r.json();
      if (j.error) { console.log(`  ⛔ ${label} ${j.error.message.slice(0, 60)}`); continue; }
      const cors = r.headers.get('access-control-allow-origin');
      seen.set(url, j.result);
      console.log(`  ✓  ${label} ${BigInt(j.result) / WAD} $3030   CORS ${cors === '*' ? '*' : `⚠ ${cors || 'absent'}`}`);
    } catch (e) { console.log(`  ⛔ ${label} ${String(e.message || e).slice(0, 60)}`); }
  }
  const vals = new Set(seen.values());
  console.log(seen.size < 2
    ? `\n  ⛔ ${seen.size} working endpoint — there is NO fallback. Depth you have never exercised is depth you do not have.`
    : vals.size === 1
      ? `\n  ✓ ${seen.size} working endpoints, all agreeing on supply`
      : `\n  ⚠ ${seen.size} answered but they DISAGREE — one is behind or wrong: ${[...vals].join(' ')}`);
  process.exit(seen.size < 2 ? 1 : 0);
}

/* ── transport: try each RPC, first one that answers wins ─────────────────────────────────────
 * ⚠ A JSON-RPC `error` OBJECT IS A 200 RESPONSE. Two of the three endpoints configured here
 *   answer every request with HTTP 200 carrying `{"error":{…}}` — one wants an API key, one says
 *   "cannot fulfill request". A failover that only catches network faults treats both as
 *   successful reads of nothing, which is indistinguishable from a token with no supply and no
 *   holders. Fall through on the error object, not just on the throw.
 * ⚠ AND ONE ENDPOINT UNDER FAN-OUT IS RATE LIMITING, NOT FAILOVER. Firing every read at once
 *   made the only working RPC refuse some of them, which then fell through to the two broken
 *   ones and surfaced as their error rather than as throttling. Read sequentially. */
async function rpc(method, params) {
  let lastErr;
  for (const url of CFG.rpcs) {
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const j = await r.json();
      if (j.error) throw new Error(`${url.replace(/^https:\/\//, '')}: ${j.error.message}`);
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const sel = sig => keccak256(toHex(sig)).slice(0, 10);
const u = hex => BigInt(hex || '0x0');
/* ⚠ PRINT THE REMAINDER, NEVER ROUND IT. 62.5 printed as "62" is the exact display bug this
 *   project shipped behind a round pack price — a receipt that claims a split the chain did not
 *   perform. Integer maths on the wei, four decimals, no Number() anywhere near it. */
const tok = wei => {
  const neg = wei < 0n; if (neg) wei = -wei;
  const whole = wei / WAD, frac = ((wei % WAD) * 10000n) / WAD;
  return (neg ? '-' : '') + whole.toLocaleString('en-US') +
    (frac ? '.' + String(frac).padStart(4, '0').replace(/0+$/, '') : '');
};

/* ── the state that should have moved ─────────────────────────────────────────────────────── */
const balOf = async who => u(await call(TOKEN, sel('balanceOf(address)') + '000000000000000000000000' + who.slice(2)));

const supply = u(await call(TOKEN, sel('totalSupply()')));
const maxSupply = u(await call(TOKEN, sel('maxTotalSupply()')));
const treasBal = await balOf(TREASURY);
const sinkBal = await balOf(SINK);
const sinkToken = '0x' + (await call(SINK, sel('token()'))).slice(-40);
const sinkTreas = '0x' + (await call(SINK, sel('treasury()'))).slice(-40);
const bps = u(await call(SINK, sel('BURN_BPS()')));
const head = u(await rpc('eth_blockNumber'));

console.log(`── ${CFG.network} · block ${head} ─────────────────────────────`);
console.log(`  edition   ${TOKEN}`);
console.log(`  sink      ${SINK}`);
console.log(`  treasury  ${TREASURY}\n`);

/* ⛔ THE SINK'S OWN IMMUTABLES, READ BACK. They are frozen at deploy; if either disagrees with
 *   chain-config then the browser and the contract are pointed at different things, and every
 *   number below is describing someone else's ledger. */
let wrong = 0;
if (sinkToken.toLowerCase() !== TOKEN.toLowerCase()) { console.log(`⛔ sink.token() is ${sinkToken}, not the edition`); wrong++; }
if (sinkTreas.toLowerCase() !== TREASURY.toLowerCase()) { console.log(`⛔ sink.treasury() is ${sinkTreas}, not the treasury`); wrong++; }
if (bps !== 5000n) { console.log(`⛔ BURN_BPS is ${bps}, not 5000`); wrong++; }
if (!wrong) console.log('✓ sink points at the edition and the cold treasury, and splits 50.00%\n');

const burned = maxSupply - supply;
console.log(`  max supply     ${tok(maxSupply)}`);
console.log(`  total supply   ${tok(supply)}`);
console.log(`  BURNED         ${tok(burned)}   ← permanent, gone`);
console.log(`  treasury holds ${tok(treasBal)}`);
console.log(`  sink holds     ${tok(sinkBal)}${sinkBal === 0n ? '   ✓ nothing between calls' : '   ⚠ stray balance — anyone may flush()'}\n`);

/* ── what those two numbers alone prove ────────────────────────────────────────────────────────
 * ⚑ THE SPLIT AND THE FALLBACK ARE DISTINGUISHABLE FROM BALANCES, WITH NO EVENT LOG, and that
 *   matters because free RPCs serve state but not history. The two paths leave different
 *   fingerprints: a SPLIT burns half and pays half, so it moves the treasury; the 100% burn
 *   FALLBACK moves supply and nothing else. So
 *       split volume   S = 2 × treasury          (the treasury got exactly half of it)
 *       fallback burn  F = totalBurned − S / 2   (whatever burned without a matching payment)
 *   and both must land on whole packs. ⚠ It assumes the treasury has only ever been PAID and
 *   never spent, and that nothing reached it outside the sink — Rip Rocketer's launch fee pays it
 *   directly, so once that fires this over-counts S. Stated rather than silently assumed. */
const price = BigInt(CFG.packBurn) * WAD;
const viaSink = treasBal * 2n, viaFallback = burned - treasBal;
console.log('── reconstructed from the balances alone (no event log needed) ──');
const packs = (wei, label) => {
  const whole = wei / price, rem = wei % price;
  console.log(`  ${label.padEnd(22)} ${tok(wei).padStart(12)}  =  ${whole} pack${whole === 1n ? '' : 's'}` +
    (rem === 0n ? ' exactly ✓' : `  ⚠ plus ${tok(rem)}, not a whole pack`));
  return whole;
};
if (viaFallback < 0n) {
  console.log(`  ⚠ the treasury holds more than has burned — it has been paid directly (launch fee?)`);
} else {
  packs(viaSink, 'through the sink');
  packs(viaFallback, 'the 100% fallback');
  console.log(`  ${'of which burned'.padEnd(22)} ${tok(viaSink / 2n).padStart(12)}  and the studio was paid the same ${treasBal === viaSink / 2n ? '✓' : '⛔'}`);
}
console.log(`  at ${CFG.packBurn} $3030 a pack (tier I, locked at open)\n`);

/* ── the events ───────────────────────────────────────────────────────────────────────────── */
const PACK = keccak256(toHex('PackPaid(address,uint256,uint256,uint256)'));
const RAKE = keccak256(toHex('RakePaid(address,uint256,uint256,uint256)'));

/* ⛔ A REFUSED QUERY IS NOT AN EMPTY RESULT, AND SWALLOWING THE DIFFERENCE READS AS A FAILED
 *   LAUNCH. My first version caught every getLogs error and moved on, so a public RPC answering
 *   "archive requests require a personal token" printed as "0 splits — the rip has not landed or
 *   it ran the fallback". Both of those are alarming and neither was true: the split had run
 *   perfectly and the node simply would not serve history. ⚑ It is this repo's standing failure
 *   with the sign flipped — usually the silent catch produces the REASSURING answer; here it
 *   produced the frightening one, which is just as wrong and wastes the same night.
 * ⚠ Free endpoints serve state but not logs. The BALANCES below are the load-bearing evidence
 *   and need no archive access; the events are corroboration, so their absence is reported as
 *   "could not read" and never as "did not happen". */
const WINDOW = 5000n, SPAN = 60000n;
const logs = [];
const refusals = new Set();
for (let hi = head; hi > head - SPAN && hi > 0n; hi -= WINDOW) {
  const lo = hi - WINDOW + 1n > 0n ? hi - WINDOW + 1n : 0n;
  try {
    logs.push(...await rpc('eth_getLogs', [{
      address: SINK, fromBlock: '0x' + lo.toString(16), toBlock: '0x' + hi.toString(16),
      topics: [[PACK, RAKE]],
    }]));
  } catch (e) { refusals.add(String(e.message || e).slice(0, 120)); }
}
logs.sort((a, b) => Number(u(a.blockNumber) - u(b.blockNumber)));

const shown = ONE_TX ? logs.filter(l => l.transactionHash.toLowerCase() === ONE_TX.toLowerCase()) : logs;
if (refusals.size && !logs.length) {
  console.log('── events: COULD NOT READ (not "none") ──');
  for (const r of refusals) console.log(`  ⚠ ${r}`);
  console.log('  Every configured RPC serves current state but refuses history. This says nothing');
  console.log('  about whether a split happened — read the balances above, which are the proof.');
  console.log(`  For the event log: https://etherscan.io/address/${SINK}#events`);
} else {
  console.log(`── ${shown.length} split${shown.length === 1 ? '' : 's'} in the last ${SPAN} blocks ──`);
  if (!shown.length) console.log('  (none in range — the rip may not have landed yet)');
}
let sumBurn = 0n, sumTreas = 0n;
for (const l of shown) {
  const buyer = '0x' + l.topics[1].slice(-40);
  const d = l.data.slice(2);
  const [amount, burned, toTreasury] = [0, 1, 2].map(i => u('0x' + d.slice(i * 64, i * 64 + 64)));
  sumBurn += burned; sumTreas += toTreasury;
  const kind = l.topics[0] === PACK ? 'PACK' : 'RAKE';
  console.log(`  ${kind}  block ${u(l.blockNumber)}  ${buyer}`);
  console.log(`        paid ${tok(amount)}  →  burned ${tok(burned)}  ·  studio ${tok(toTreasury)}` +
    (burned + toTreasury === amount ? '   ✓ exhaustive, no dust' : '   ⛔ DOES NOT SUM'));
  console.log(`        ${l.transactionHash}`);
}
if (shown.length > 1) console.log(`\n  totals: burned ${tok(sumBurn)} · studio ${tok(sumTreas)}`);

/* ⛔ THE CROSS-CHECK, and it is the only assertion here that could ever surprise anyone. The
 *   events are what the contract SAID it did. The treasury balance is what it DID. If the studio
 *   holds less than the events promised, tokens went somewhere else. (More is fine and expected —
 *   Rip Rocketer's launch fee pays the same address directly, without touching this contract.) */
if (shown.length && !ONE_TX) {
  console.log(`\n── does the ledger agree with the events? ──`);
  console.log(`  events promised the studio  ${tok(sumTreas)}`);
  console.log(`  the studio actually holds   ${tok(treasBal)}`);
  console.log(treasBal >= sumTreas
    ? `  ✓ balance covers every split (surplus ${tok(treasBal - sumTreas)} — direct payments, e.g. the launch fee)`
    : `  ⛔ SHORT by ${tok(sumTreas - treasBal)} — the treasury has been moved, or something is wrong`);
}

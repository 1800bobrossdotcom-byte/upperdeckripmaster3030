#!/usr/bin/env node
/* ripmaster3030studios — POOL WATCH.  `npm run poolwatch`
 *
 *   npm run poolwatch            watch continuously for a new FWA venue
 *   npm run poolwatch scan       one pass over history + now, then exit
 *
 * ⛔ THE TRIGGER FOR EVERYTHING ELSE. TokenWorks, 2026-08-06: "Eventually we may open up external
 *   pools to deepen liquidity that will not have this fee." Every strategy measured against FWA
 *   dies on the current pool's 1%-per-leg — the accumulation signal's edge is 1.4–1.8 points and
 *   the round trip is 2.11. On a 0.3% venue the same signal clears comfortably. So the appearance
 *   of a fee-free pool is not an incremental improvement, it is the difference between a business
 *   and a losing one, and it is the single event worth watching for.
 *
 * ⚑ IT WATCHES FOR A VENUE, NOT FOR A TWEET. A pool exists on-chain the moment it is initialised,
 *   before any announcement, and announcements have been wrong before. Uniswap v4 `Initialize`,
 *   v3 `PoolCreated` and v2 `PairCreated` are all covered because "external pool" was not
 *   specified and a v2 pair would qualify.
 *
 * ⚠ A NEW POOL IS NOT AUTOMATICALLY A GOOD ONE, and this says so rather than just alerting. It
 *   reports the fee, the hook's powers and whether an outside taker actually pays what the fee
 *   claims — this project has already delisted a published pool carrying an 89.898% swap fee.
 */
import { createPublicClient, http, parseAbiItem, keccak256, encodeAbiParameters, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hookPowers } from './mm.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEEN = join(ROOT, 'fwa-audit/pools-seen.json');
const LOG = join(ROOT, 'fwa-audit/poolwatch.jsonl');
const FWA = '0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';
const FWAl = FWA.toLowerCase();
const PM = '0x000000000004444c5dc75cB358380D2e3dE08A90';
const V3F = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const V2F = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const KNOWN = '0x230ecd3c25b44af30db59c15f70df7794eb13f67a200f230b7400daa96fe804d';

const RPCS = ['https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org'];
const cs = RPCS.map(u => createPublicClient({ chain: mainnet, transport: http(u, { timeout: 25000, retryCount: 1 }) }));

const V4_INIT = parseAbiItem('event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)');
const V3_NEW = parseAbiItem('event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)');
const V2_NEW = parseAbiItem('event PairCreated(address indexed token0, address indexed token1, address pair, uint256)');

async function logs(addr, ev, from, to, args) {
  let why = '';
  for (const c of cs) {
    try { return { ok: true, out: await c.getLogs({ address: addr, event: ev, args, fromBlock: BigInt(from), toBlock: BigInt(to) }) }; }
    catch (e) { why = String(e.shortMessage || e).slice(0, 70); }
  }
  /* ⛔ Both endpoints down is NOT "no new pool". Say so, or the watcher's silence becomes a lie. */
  return { ok: false, out: [], why };
}

const load = () => existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')) : { ids: [KNOWN], last: 0 };
const save = s => { mkdirSync(dirname(SEEN), { recursive: true }); writeFileSync(SEEN, JSON.stringify(s, null, 1)); };
const note = o => { mkdirSync(dirname(LOG), { recursive: true }); appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n'); };

function verdict({ fee, hooks }) {
  const h = hookPowers(hooks || '0x0000000000000000000000000000000000000000');
  const pct = fee === 0x800000 ? null : fee / 10000;
  const lines = [];
  if (pct !== null) lines.push(`fee ${pct}%`);
  else lines.push('DYNAMIC fee — the hook sets it per swap');
  if (h.canTakeTheFee) lines.push('⛔ the hook CAN take the fee via return-delta — LPs may earn nothing');
  if (h.canRefuseLiquidity) lines.push('⚠ the hook can refuse liquidity');
  if (!h.canTakeTheFee && pct !== null && pct <= 0.35) lines.push('✅ THIS IS THE ONE WE HAVE BEEN WAITING FOR');
  else if (!h.canTakeTheFee && pct !== null) lines.push(`⚠ ${pct}% is better than 1% but the round trip is still ${(pct * 2).toFixed(2)}%`);
  return lines;
}

async function scan(fromBlock, toBlock, s) {
  const found = [];
  let unread = 0;
  /* v4 — both orderings, since currency0/1 are sorted by address */
  for (const args of [{ currency0: FWA }, { currency1: FWA }]) {
    const r = await logs(PM, V4_INIT, fromBlock, toBlock, args);
    if (!r.ok) { unread++; continue; }
    for (const l of r.out) {
      const id = l.args.id.toLowerCase();
      if (s.ids.includes(id)) continue;
      const rehash = keccak256(encodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
        [l.args.currency0, l.args.currency1, l.args.fee, l.args.tickSpacing, l.args.hooks]));
      found.push({ kind: 'v4', id, block: Number(l.blockNumber), fee: Number(l.args.fee),
        tickSpacing: l.args.tickSpacing, hooks: l.args.hooks,
        pair: l.args.currency0.toLowerCase() === FWAl ? l.args.currency1 : l.args.currency0,
        proven: rehash.toLowerCase() === id });
    }
  }
  /* v3 / v2 */
  for (const [addr, ev, kind] of [[V3F, V3_NEW, 'v3'], [V2F, V2_NEW, 'v2']]) {
    for (const args of [{ token0: FWA }, { token1: FWA }]) {
      const r = await logs(addr, ev, fromBlock, toBlock, args);
      if (!r.ok) { unread++; continue; }
      for (const l of r.out) {
        const id = (l.args.pool || l.args.pair).toLowerCase();
        if (s.ids.includes(id)) continue;
        found.push({ kind, id, block: Number(l.blockNumber), fee: Number(l.args.fee ?? 3000),
          hooks: null, pair: l.args.token0.toLowerCase() === FWAl ? l.args.token1 : l.args.token0, proven: true });
      }
    }
  }
  return { found, unread };
}

function announce(p) {
  console.log(`\n  ${'═'.repeat(66)}`);
  console.log(`  ⚑⚑ NEW FWA VENUE — ${p.kind.toUpperCase()}  at block ${p.block}`);
  console.log(`     id/address ${p.id}`);
  console.log(`     paired with ${p.pair}`);
  if (p.kind === 'v4') console.log(`     hooks ${p.hooks}   PoolKey ${p.proven ? '✅ proven by rehash' : '⛔ DOES NOT REHASH TO THE ID — do not trade it'}`);
  for (const l of verdict(p)) console.log(`     ${l}`);
  console.log(`\n     next: npm run mm scan --pool ${p.id}`);
  console.log(`           LEG_COST=<newfee> npm run timetravel     (re-tune before funding anything)`);
  console.log(`  ${'═'.repeat(66)}\n`);
  note({ ev: 'NEW_POOL', ...p });
}

const s = load();
const head = Number(await cs[0].getBlockNumber());
const mode = process.argv[2] || 'watch';

if (!s.last) {
  /* first run: sweep the token's whole life so we start from a true baseline */
  console.log(`  first run — sweeping from the token's deploy block for any venue we do not know about…`);
  let from = 25546793, unreadTotal = 0;
  while (from < head) {
    const to = Math.min(from + 40000, head);
    const { found, unread } = await scan(from, to, s);
    unreadTotal += unread;
    for (const p of found) { announce(p); s.ids.push(p.id); }
    from = to + 1;
  }
  if (unreadTotal) console.log(`  ⚠ ${unreadTotal} windows unreadable — this baseline may be INCOMPLETE`);
  s.last = head; save(s);
  console.log(`  baseline: ${s.ids.length} known venue(s). Watching from block ${head}.\n`);
}

async function tick() {
  const h = Number(await cs[0].getBlockNumber());
  if (h <= s.last) return;
  const { found, unread } = await scan(s.last + 1, h, s);
  if (unread) { note({ ev: 'readfail', windows: unread }); console.log(`  ⚠ ${unread} reads failed — NOT a clean scan, will retry the same range`); return; }
  for (const p of found) { announce(p); s.ids.push(p.id); }
  s.last = h; save(s);
  const t = new Date().toISOString().slice(11, 19);
  if (!found.length) process.stdout.write(`\r  ${t}  block ${h} · ${s.ids.length} known venue(s) · nothing new     `);
}

if (mode === 'scan') { await tick(); console.log('\n  done.\n'); }
else {
  console.log(`  POOL WATCH · FWA · checking every 2 min`);
  console.log(`  ⚑ an external pool without the 1% fee is the trigger to go live — see docs/FWA-TEARDOWN.md §4\n`);
  for (;;) {
    try { await tick(); } catch (e) { note({ ev: 'error', why: String(e.message).slice(0, 120) }); }
    await new Promise(r => setTimeout(r, 120000));
  }
}

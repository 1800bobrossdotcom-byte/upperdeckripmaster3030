#!/usr/bin/env node
/* ripmaster3030studios — /api/terminal, the pool screen for a machine.  `npm run test:apiterm`
 *
 * ⛔ THE ASSERTIONS THAT MEAN ANYTHING ARE THE ARITHMETIC AND THE REFUSALS, not "it returns JSON".
 *   The endpoint exists because the PAGE got the toll wrong for months by publishing the fee half
 *   and the gas half in two different places and never adding them — so the one thing this must be
 *   is right about that sum, at sizes where each half dominates.
 * ⚑ It imports the shipped handler and its two exported functions rather than reimplementing them.
 *   A harness that recomputes the thing it is testing proves the harness, and this repo has paid
 *   that bill four times.
 */
import handler, { toll, board } from '../api/terminal.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = JSON.parse(readFileSync(join(ROOT, 'data/terminal.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? (pass++, console.log('  ok   ' + m + (d ? '  — ' + d : '')))
                            : (fail++, console.log('  FAIL ' + m + (d ? '  — ' + d : ''))); };
const tally = (why) => console.log(`\n${fail || why ? '✕' : '✓'} api/terminal: ${pass} passed, ${fail} failed`
  + (why ? `  ⛔ THE HARNESS DIED: ${why}` : ''));
for (const ev of ['uncaughtException', 'unhandledRejection'])
  process.on(ev, (e) => { tally(String(e && e.message || e).slice(0, 90)); process.exit(1); });

/* the handler fetches its data over its own origin; point that at the local file instead */
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => String(u).includes('/data/terminal.json')
  ? { ok: true, json: async () => SNAP } : realFetch(u);

const call = (q) => new Promise((r) => {
  handler({ method: 'GET', query: q, headers: { host: 'x' } }, {
    setHeader() {}, status(c) { this._c = c; return this; },
    send(b) { let v = b; if (typeof b === 'string') { try { v = JSON.parse(b); } catch {} }
      r({ code: this._c, body: v }); } });
});

console.log('\n── the board ──');
let h = await call({});
ok(h.code === 200 && h.body.ok, '200 and ok');
ok(h.body.count > 0, `${h.body.count} pools`, h.body.rows.slice(0, 2).map((r) => r.name).join(' · '));
ok(h.body.ageSeconds != null, `it states its own age: ${h.body.ageSeconds}s — a bot cannot ask a JSON file how stale it is`);
ok(/no directional signal survived/.test(h.body.finding || ''),
  '⛔ THE FINDING THAT KILLS THE IDEA IS IN THE PAYLOAD, not left for the caller to already know');
ok(/NOT that trading it makes money/.test(h.body.finding || ''),
  '…and `tradeable` is defined in the same breath, so the boolean is not an opinion wearing a type');

/* ── ⛔ THE ARITHMETIC. This is the whole reason the endpoint exists. ───────────────────────── */
console.log('\n── the toll, at sizes where each half dominates ──');
const row = SNAP.board.find((r) => !r.err && r.roundTripPct > 0);
const gasUsd = 2 * SNAP.chains[row.chain || 'ethereum'].swapUsd;
{
  const t = toll(row, SNAP.chains, 1000);
  const wantFee = 1000 * row.roundTripPct / 100;
  ok(Math.abs(t.feeUsd - wantFee) < 1e-6, `fee on $1,000 is size x roundTripPct`, `$${t.feeUsd}`);
  ok(Math.abs(t.gasUsd - gasUsd) < 1e-9, 'gas is TWO swaps, not one — a round trip', `$${t.gasUsd}`);
  ok(Math.abs(t.totalUsd - (wantFee + gasUsd)) < 1e-6,
    '⛔ AND THE TWO HALVES ARE ADDED — the exact thing the page published separately and never summed',
    `$${t.totalUsd} = $${t.feeUsd} + $${t.gasUsd}`);
}
{
  /* ⚑ THE CROSSOVER, CHECKED BY CROSSING IT. At a size below it the gas must be the larger half
   *   and above it the smaller — asserting the formula against itself would prove nothing. */
  const c = toll(row, SNAP.chains, 0).gasDominatesBelowUsd;
  const lo = toll(row, SNAP.chains, c * 0.5), hi = toll(row, SNAP.chains, c * 2);
  ok(lo.gasIsMoreThanFee === true && hi.gasIsMoreThanFee === false,
    `⛔ the crossover holds when crossed: at $${(c * 0.5).toFixed(2)} gas leads, at $${(c * 2).toFixed(2)} the fee does`,
    `crossover $${c}`);
  ok(lo.totalPct > hi.totalPct * 1.5,
    'and the toll as a PERCENTAGE falls hard with size — the number the fee column cannot show',
    `${lo.totalPct}% at $${(c * 0.5).toFixed(2)} vs ${hi.totalPct}% at $${(c * 2).toFixed(2)}`);
}
{
  /* a zero size must yield no total at all rather than a divide-by-zero or a fake 0% */
  const t = toll(row, SNAP.chains, 0);
  ok(t.totalUsd === undefined && t.gasDominatesBelowUsd != null,
    'with no size there is no total — it does not invent one', JSON.stringify(t).slice(0, 70));
}

console.log('\n── sorting and filters ──');
{
  const s = await call({ size: '1000' });
  const tot = s.body.rows.map((r) => r.toll.totalUsd);
  ok(tot.every((v, i) => i === 0 || v >= tot[i - 1]), 'with a size, cheapest first', tot.slice(0, 3).join(' ≤ '));
  const plain = await call({});
  ok(plain.body.rows[0].toll.totalUsd === undefined,
    '…and with no size the measured order is kept, because there is nothing to sort on');
}
{
  const t = await call({ tradeable: '1' });
  ok(t.body.rows.every((r) => r.tradeable === true), `tradeable=1 filters — ${t.body.count} of ${h.body.count}`);
  const b = await call({ chain: 'base' });
  ok(b.body.rows.every((r) => r.chain === 'base'), `chain=base filters — ${b.body.count} rows`);
}

console.log('\n── refusals ──');
{
  const bad = await call({ size: 'lots' });
  ok(bad.code === 400 && /positive number/.test(bad.body.error || ''),
    'a non-numeric size is refused, named — not silently treated as zero', bad.body.error);
  const neg = await call({ size: '-5' });
  ok(neg.code === 400, 'a negative size is refused too');
  const nd = await call({ format: 'ndjson' });
  const lines = String(nd.body).trim().split('\n');
  ok(lines.length === h.body.count, `ndjson is one row per pool (${lines.length})`);
  ok(!!JSON.parse(lines[0]).toll, '…and each line carries its own toll');
}
{
  /* ⛔ AN UNREADABLE SNAPSHOT MUST 503, NOT 200 WITH AN EMPTY BOARD. A bot reading `rows: []` as
   *   "nothing is tradeable" has been told a lie by a success code. */
  const save = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  const mod = await import('../api/terminal.js?bust=' + Date.now());
  const r = await new Promise((res) => mod.default({ method: 'GET', query: {}, headers: { host: 'x' } },
    { setHeader() {}, status(c) { this._c = c; return this; },
      send(b) { res({ code: this._c, body: typeof b === 'string' ? JSON.parse(b) : b }); } }));
  globalThis.fetch = save;
  ok(r.code === 503 && /not readable/.test(r.body.error || ''),
    '⛔ a missing snapshot is a 503 that says so, never a 200 with an empty board', r.code + ' ' + (r.body.error || ''));
}

globalThis.fetch = realFetch;
tally();
process.exit(fail ? 1 : 0);

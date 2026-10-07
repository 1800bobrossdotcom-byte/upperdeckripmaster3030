#!/usr/bin/env node
/* npm run test:rewards — the fractional drip.
 *
 * ⚑ IT IMPORTS THE SHIPPED HANDLER AND REPLACES ONLY `fetch`. A harness that reimplements the
 *   thing it tests proves the harness — this repo has paid for that four times (test:citynet's
 *   `messages`/`msgs`, the scores suite's ignored `EX`). So `api/rewards.js` runs for real
 *   against a fake Redis that honours the handful of commands it uses.
 * ⛔ THE ASSERTIONS THAT MATTER ARE THE CAPS, because the ledger is untrusted by design. Nobody
 *   can drain the pool, one player cannot take a meaningful slice in a day, and a refused grant
 *   must give its reservation BACK — a cap that leaks is a cap that eventually is not one.
 */
const P = 'urmr:';
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok    ' + m + (d ? '  — ' + d : '')); } else { fail++; console.log('  FAIL  ' + m + (d ? '  — ' + d : '')); } };
const sect = s => console.log(`\n── ${s} ──`);

/* ── a Redis that honours exactly what the handler uses, and nothing it does not ───────── */
let DB = {};
const reset = () => { DB = {}; };
function exec(cmd) {
  const [op, key, ...a] = cmd;
  switch (String(op).toUpperCase()) {
    case 'GET':    return DB[key] ?? null;
    case 'INCRBY': return (DB[key] = (Number(DB[key]) || 0) + Number(a[0]));
    case 'DECRBY': return (DB[key] = (Number(DB[key]) || 0) - Number(a[0]));
    case 'EXPIRE': return 1;
    case 'HGET':   return (DB[key] || {})[a[0]] ?? null;
    case 'HSET':   { DB[key] = DB[key] || {}; DB[key][a[0]] = a[1]; return 1; }
    case 'HINCRBY': { DB[key] = DB[key] || {}; DB[key][a[0]] = (Number(DB[key][a[0]]) || 0) + Number(a[1]); return DB[key][a[0]]; }
    case 'HGETALL': { const o = DB[key] || {}; return Object.entries(o).flat(); }
    default: throw new Error('fake redis got an op it does not know: ' + op);
  }
}
process.env.KV_REST_API_URL = 'http://fake';
process.env.KV_REST_API_TOKEN = 'x';
globalThis.fetch = async (_u, o) => ({ ok: true, json: async () => ({ result: exec(JSON.parse(o.body)) }) });

const { default: handler } = await import('../api/rewards.js');
const call = async (method, { body, query } = {}) => {
  let code = 0, json = null;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await handler({ method, body, query: query || {} }, res);
  return { code, ...(json || {}) };
};

/* ── §A the unit ───────────────────────────────────────────────────────────────────────── */
sect('A · the unit is 0.25 TOKENS, and it is not dollars');
reset();
{
  const r = await call('POST', { body: { id: 'p1', game: 'cloudracer', n: 4 } });
  ok(r.ok && r.granted === 4, 'four rewards granted', `granted ${r.granted}`);
  ok(r.unit === 0.25, 'the unit is 0.25');
  ok(r.tokens === 1, '4 × 0.25 = 1.00 $3030', `${r.tokens} tokens`);
  /* ⚑ The whole point of a token-denominated reward: the same 0.25 is 2.4c today and 25c at the
   *   artist's $1 target, with no re-pricing anywhere. Asserted as arithmetic, not as a comment. */
  ok(+(r.quarters * 0.25 * 1.00).toFixed(2) === 1, 'at $1/token that balance is $1.00 — it auto-scales');
}

/* ── §B the pool cannot be exceeded ────────────────────────────────────────────────────── */
sect('B · the 1,000-token pool is a hard ceiling');
reset();
{
  let got = 0;
  for (let i = 0; i < 700; i++) {
    const r = await call('POST', { body: { id: 'p' + (i % 50), game: 'city', n: 8 } });
    got += r.granted || 0;
  }
  ok(got <= 4000, 'never issues more than 4,000 quarters however hard it is hammered', `${got} issued`);
  const g = await call('GET', { query: {} });
  ok(g.pool.issued <= g.pool.cap, 'the recorded pool never exceeds its cap', `${g.pool.issued}/${g.pool.cap}`);
  ok(g.pool.left === 4000 - g.pool.issued, 'and `left` is consistent with `issued`');
  const last = await call('POST', { body: { id: 'zz', game: 'city', n: 8 } });
  if (g.pool.left === 0) ok(last.granted === 0 && last.reason === 'pool-empty', 'once empty it refuses and says why', last.reason);
  else ok(true, 'pool not yet empty in this run — ceiling still holds', `${g.pool.left} left`);
}

/* ── §C the daily cap, and the refund that keeps it honest ─────────────────────────────── */
sect('C · one player cannot take a meaningful slice in a day');
reset();
{
  let got = 0;
  for (let i = 0; i < 60; i++) { const r = await call('POST', { body: { id: 'greedy', game: 'arena', n: 8 } }); got += r.granted || 0; }
  ok(got === 240, 'a single player is capped at 240 quarters (60 $3030) a day', `${got}`);
  const bal = await call('GET', { query: { id: 'greedy' } });
  ok(bal.quarters === 240, 'and the balance matches what was granted', `${bal.quarters}`);
  /* ⛔ THE REFUND IS THE ASSERTION THAT ACTUALLY BITES. The pool is reserved BEFORE the daily cap
   *   is checked, so every refused grant must hand its reservation back. Without that, a capped
   *   player silently burns the pool down for everyone else while receiving nothing. */
  ok(bal.pool.issued === 240,
    'refused grants RETURN their pool reservation — the cap does not leak', `pool issued ${bal.pool.issued}, not 480`);
}

/* ── §D input it must refuse ───────────────────────────────────────────────────────────── */
sect('D · what it refuses');
reset();
for (const [body, why] of [
  [{ game: 'city', n: 4 }, 'no id'],
  [{ id: 'p', game: 'poker', n: 4 }, 'a game that does not exist'],
  [{ id: 'p', game: 'city', n: 0 }, 'zero'],
  [{ id: 'p', game: 'city', n: -50 }, 'a negative grant'],
]) {
  const r = await call('POST', { body });
  ok(r.ok === false, `refuses ${why}`, r.reason);
}
{
  const r = await call('POST', { body: { id: 'p', game: 'city', n: 99999 } });
  ok(r.granted === 8, 'clamps an absurd single request to the per-call cap', `granted ${r.granted}`);
}

/* ── §E the ledger the artist signs from ───────────────────────────────────────────────── */
sect('E · the payout list is fully readable, because reading it IS the trust model');
reset();
{
  await call('POST', { body: { id: 'alice', game: 'city', n: 8, addr: '0x432D71bA14D2602B566dD9e3e098E24859d166c9' } });
  await call('POST', { body: { id: 'bob', game: 'dogfight', n: 4 } });
  const L = await call('GET', { query: { ledger: '1' } });
  ok(L.rows.length === 2, 'every unpaid player is listed, not a top-N', `${L.rows.length} rows`);
  ok(L.rows[0].id === 'alice' && L.rows[0].tokens === 2, 'sorted by size, tokens computed', JSON.stringify(L.rows[0]));
  ok(L.totalTokens === 3, 'and it totals what is owed', `${L.totalTokens} $3030`);
  /* ⚠ An address is optional on purpose — a player can accrue before they have a wallet, which
   *   is the entire on-ramp story. It is only needed to be PAID. */
  const noAddr = await call('POST', { body: { id: 'carol', game: 'section9', n: 1 } });
  ok(noAddr.ok && noAddr.granted === 1, 'a player with no wallet can still accrue');
}

/* ── §F no KV ⇒ 503, never a silent zero ───────────────────────────────────────────────── */
sect('F · with no KV it says so');
{
  const u = process.env.KV_REST_API_URL; process.env.KV_REST_API_URL = '';
  const r = await call('GET', { query: {} });
  ok(r.code === 503 && r.ok === false, 'no KV ⇒ 503 and ok:false, not an empty balance', r.reason);
  process.env.KV_REST_API_URL = u;
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);

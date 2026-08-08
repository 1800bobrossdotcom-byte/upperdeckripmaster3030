/* ripmaster3030studios — THE DRIP. Fractional $3030 accrued for playing, on the KV that already
 * runs presence and the boards.
 *
 * Artist, 2026-08-08: *"take 1,000 $3030 and split them fractionally .25 of a coin, then insert
 * them as in-game rewards … in some countries this can buy groceries"*, and, on being told 0.25
 * is 2.4 cents today: *"when 1 token = 1 Dollar you will see logic there — that is the goal"*,
 * *"this is small slow and steady"*, *"I am living month to month and not some vc"*.
 *
 *   POST /api/rewards {game, id, addr, n}  → accrue n×0.25 for this player, returns their balance
 *   GET  /api/rewards?id=…                 → { ok, quarters, tokens, pool:{issued,cap,left} }
 *   GET  /api/rewards?ledger=1             → the whole unpaid list, for the artist to sign a batch
 *
 * ⚑ DENOMINATED IN TOKENS, NEVER IN DOLLARS, AND THAT IS THE DESIGN RATHER THAN AN OVERSIGHT.
 *   0.25 is 2.4c today and 25c at the artist's $1 target — a fixed token reward AUTO-SCALES with
 *   the price and never needs re-pricing. The packs are the opposite: a dollar target whose token
 *   count has to be re-derived at every tier boundary. Build it at 2.4c so it is already proven
 *   when it is worth 25c.
 *
 * ⛔ THIS AWARDS NOTHING. It is a LEDGER, and it is exactly as trustworthy as the browser that
 *   posted to it — every score in this project is computed client-side, so a player with devtools
 *   can claim a run. That is survivable here and fatal for a hero 1/1, which is why the two are
 *   built differently: a hero mints only against a human-signed EIP-712 voucher, and this drip
 *   pays only when the artist signs a batch he has looked at. Same rule `js/title-ledger.js`
 *   states about itself — *nothing here awards anything.*
 * ⚑ SO ABUSE IS BOUNDED RATHER THAN PREVENTED, WHICH IS THE HONEST GOAL AT THIS SIZE. Three caps
 *   do the work: a hard POOL ceiling nobody can exceed, a PER-PLAYER-PER-DAY ceiling so one
 *   cheater cannot take a meaningful slice, and a per-request cap so a single call cannot jump
 *   the queue. Worst case a determined cheat earns a few cents a day and the pool still cannot
 *   be drained.
 *
 * ⚠ NO GAS IS SPENT HERE AND NONE IS OWED. Accrual is free; the player claims on-chain when THEY
 *   decide it is worth ~1c, paying it themselves. The studio's cash cost is zero at any token
 *   price, which is the only shape that works for someone funding this month to month.
 */
const env = () => ({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  tok: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

const P = 'urmr:';                 // urmr:bal → HASH id→quarters · urmr:pool → issued · urmr:d:<id>:<day>
const UNIT = 0.25;                 // ⚑ the artist's unit. Tokens, not dollars. Never re-price it.
const POOL_QUARTERS = 4000;        // 1,000 $3030 ÷ 0.25 — the whole budget, hard-capped
const DAY_CAP = 240;               // 60 $3030/day/player max. A cheat earns cents, not the pool.
const REQ_CAP = 8;                 // one call can grant at most 2 $3030
const GAMES = ['city', 'cloudracer', 'riprocketer', 'dogfight', 'section9', 'arena'];

async function kv(cmd) {
  const { url, tok } = env();
  if (!url || !tok) return { err: 'no-kv' };
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    if (!r.ok) return { err: 'kv-' + r.status };
    return await r.json();
  } catch { return { err: 'kv-unreachable' }; }
}

const clean = s => String(s || '').trim().slice(0, 64).replace(/[^\w.:-]/g, '');
const isAddr = a => /^0x[0-9a-fA-F]{40}$/.test(String(a || '').trim());
const today = () => new Date().toISOString().slice(0, 10);

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!env().url) { res.status(503).json({ ok: false, reason: 'no-kv' }); return; }

  /* ── READ ───────────────────────────────────────────────────────────────────────────── */
  if (req.method === 'GET') {
    const q = req.query || {};
    const pool = Number((await kv(['GET', P + 'pool'])).result || 0);
    const left = Math.max(0, POOL_QUARTERS - pool);

    if (q.ledger) {
      /* The unpaid list, so the artist can read it before signing anything. ⚠ Deliberately the
       * whole thing rather than a top-N: a payout list you cannot see all of is one you cannot
       * check, and checking it is the entire trust model. */
      const all = (await kv(['HGETALL', P + 'bal'])).result || [];
      const rows = [];
      for (let i = 0; i < all.length; i += 2) {
        const qty = Number(all[i + 1]) || 0;
        if (qty > 0) rows.push({ id: all[i], quarters: qty, tokens: +(qty * UNIT).toFixed(2) });
      }
      rows.sort((a, b) => b.quarters - a.quarters);
      res.status(200).json({ ok: true, unit: UNIT, rows,
        totalTokens: +(rows.reduce((s, r) => s + r.quarters, 0) * UNIT).toFixed(2),
        pool: { issued: pool, cap: POOL_QUARTERS, left } });
      return;
    }
    const id = clean(q.id);
    const qty = id ? Number((await kv(['HGET', P + 'bal', id])).result || 0) : 0;
    res.status(200).json({ ok: true, unit: UNIT, quarters: qty, tokens: +(qty * UNIT).toFixed(2),
      pool: { issued: pool, cap: POOL_QUARTERS, left } });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

  /* ── ACCRUE ─────────────────────────────────────────────────────────────────────────── */
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const id = clean(b.id), game = clean(b.game).toLowerCase();
  const addr = isAddr(b.addr) ? String(b.addr).trim() : '';
  let n = Math.floor(Number(b.n) || 0);

  if (!id) { res.status(400).json({ ok: false, reason: 'no-id' }); return; }
  if (!GAMES.includes(game)) { res.status(400).json({ ok: false, reason: 'unknown-game' }); return; }
  if (!(n > 0)) { res.status(400).json({ ok: false, reason: 'zero' }); return; }
  n = Math.min(n, REQ_CAP);

  /* ⛔ THE POOL CEILING IS CHECKED AND INCREMENTED IN ONE OPERATION. Read-then-write would let two
   *   concurrent calls both see room and both take it, which is how a capped faucet quietly issues
   *   more than its cap. INCRBY returns the new total, so the overshoot is visible and refundable
   *   in the same breath. */
  const after = Number((await kv(['INCRBY', P + 'pool', n])).result || 0);
  if (after > POOL_QUARTERS) {
    const over = Math.min(n, after - POOL_QUARTERS);
    await kv(['DECRBY', P + 'pool', over]);
    n -= over;
    if (n <= 0) { res.status(200).json({ ok: true, granted: 0, reason: 'pool-empty', pool: { issued: POOL_QUARTERS, cap: POOL_QUARTERS, left: 0 } }); return; }
  }

  /* Per-player daily ceiling, same atomic shape, with a TTL so it rolls over by itself. */
  const dk = `${P}d:${id}:${today()}`;
  const dayAfter = Number((await kv(['INCRBY', dk, n])).result || 0);
  await kv(['EXPIRE', dk, 172800]);
  if (dayAfter > DAY_CAP) {
    const over = Math.min(n, dayAfter - DAY_CAP);
    await kv(['DECRBY', dk, over]);
    await kv(['DECRBY', P + 'pool', over]);      // ⚠ give it back to the pool, or the cap leaks
    n -= over;
    if (n <= 0) { res.status(200).json({ ok: true, granted: 0, reason: 'daily-cap' }); return; }
  }

  const qty = Number((await kv(['HINCRBY', P + 'bal', id, n])).result || 0);
  if (addr) await kv(['HSET', P + 'addr', id, addr]);

  res.status(200).json({ ok: true, granted: n, unit: UNIT,
    quarters: qty, tokens: +(qty * UNIT).toFixed(2),
    pool: { issued: Math.min(after, POOL_QUARTERS), cap: POOL_QUARTERS, left: Math.max(0, POOL_QUARTERS - after) } });
}

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

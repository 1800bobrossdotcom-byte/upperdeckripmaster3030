/* ripmaster3030studios — /api/terminal · THE POOL SCREEN, FOR A MACHINE.
 *
 *   GET /api/terminal                    the board as measured, plus the bar it was judged against
 *   GET /api/terminal?size=1000          …with the round-trip toll computed on YOUR size
 *   GET /api/terminal?chain=base         one chain
 *   GET /api/terminal?tradeable=1        only rows that cleared the bar
 *   GET /api/terminal?format=ndjson      one row per line
 *
 * ══ ⛔ WHY THIS EXISTS, AND WHY IT IS NOT THE PAGE ═══════════════════════════════════════════
 *
 * Artist, 2026-08-09: *"terminal is too busy to make any coherent sense and was built for our
 * trading bots which I still want to create."* Both halves are right, and the second explains the
 * first: `worldcomputerhyperterminal.html` is 1,035 words of prose, tables and captions built for
 * a reader, and its actual audience is a program. **A bot does not need a page.** Scraping one is
 * how a bot ends up depending on a `<td>` order that a design pass will move.
 *
 * ⛔ SO THE TOLL IS COMPUTED HERE AND NOT LEFT TO THE CALLER, because that is the arithmetic the
 *   whole screen exists for and the page got it wrong for months by not doing it. `roundTripPct`
 *   is 2 × fee and scales with size; gas is a FIXED dollar amount per swap and does not. They were
 *   published in two different places and never added, so the printed percentage read as the whole
 *   toll when on a small trade it is less than half of it. A caller given two numbers and left to
 *   combine them is a caller who will combine them wrong, exactly as this project's own page did.
 *
 * ⛔ AND IT SHIPS THE VERDICT WITH THE NUMBERS, INCLUDING THE ONE NOBODY WANTS. Across every pool
 *   on both chains, measured over ten days, **no directional signal survived the round trip** — a
 *   perfect forecaster at $10.96 of working capital made $1.11–1.72 a week and a 60%-accurate one
 *   lost money at every horizon. `bar` and `finding` carry that, so a bot author reads it in the
 *   payload rather than having to already know. **A screen that only reports the promising half is
 *   how a bot gets written against a market that is not there.**
 *
 * ⚠ IT IS A SNAPSHOT AND SAYS SO. `data/terminal.json` is written hourly by
 *   `.github/workflows/terminal-refresh.yml`. Every response states `measuredAt` and `ageSeconds`
 *   so a caller can refuse it — a bot trading on a stale book is the failure this field exists to
 *   let it avoid, and it cannot ask a JSON file how old it is.
 * ⚠ READ-ONLY. Nothing here signs, quotes or routes anything. It reports what was measured.
 */
import { createHash } from 'node:crypto';

/* ⛔ FETCH THE DERIVATION, DO NOT BUNDLE IT — the same three-attempt lesson `api/3030.js` records:
 *   Vercel bundles by TRACING IMPORTS, so a runtime-assembled `readFileSync` path is never packed,
 *   and `import … with { type: 'json' }` is a Node-version gamble that fails as a cold-start crash.
 *   The file is already served as a public static asset, so the function reads it over its own
 *   origin and the data can refresh without redeploying the function. */
let CACHE = null, CACHE_AT = 0;
async function load(req) {
  if (CACHE && Date.now() - CACHE_AT < 30000) return CACHE;
  const host = (req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host))
    || process.env.VERCEL_URL || 'www.ripmaster3030studios.com';
  const r = await fetch('https://' + host + '/data/terminal.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('snapshot fetch ' + r.status);
  CACHE = await r.json(); CACHE_AT = Date.now();
  return CACHE;
}

const send = (res, code, body) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  res.setHeader('cache-control', code === 200 ? 'public, max-age=30, stale-while-revalidate=300' : 'no-store');
  res.setHeader('content-type', typeof body === 'string' ? 'application/x-ndjson' : 'application/json');
  res.status(code).send(typeof body === 'string' ? body : JSON.stringify(body));
};

/* ⛔ ONE FUNCTION, EXPORTED, SO THE TEST DRIVES THE ARITHMETIC AND NOT A COPY OF IT. This repo has
 *   paid four times for a harness that reimplemented the thing it was testing and therefore only
 *   proved the harness. */
export function toll(row, chains, sizeUsd) {
  const ch = (chains || {})[row.chain || 'ethereum'] || (chains || {}).ethereum || {};
  const gasUsd = 2 * Number(ch.swapUsd || 0);              /* a round trip is two swaps */
  const feePct = Number(row.roundTripPct || 0);
  const out = {
    feePct,
    gasUsd: +gasUsd.toFixed(6),
    /* ⚑ THE CROSSOVER IS THE NUMBER A BOT ACTUALLY NEEDS: below it the network takes more than the
     *   pool does, so size is the dominant term in your cost and not the fee you shopped for. */
    gasDominatesBelowUsd: feePct > 0 ? +(gasUsd / (feePct / 100)).toFixed(2) : null,
  };
  if (!(sizeUsd > 0)) return out;
  const feeUsd = sizeUsd * (feePct / 100);
  const totalUsd = feeUsd + gasUsd;
  return { ...out, sizeUsd,
    feeUsd: +feeUsd.toFixed(6), totalUsd: +totalUsd.toFixed(6),
    totalPct: +(100 * totalUsd / sizeUsd).toFixed(4),
    gasIsMoreThanFee: gasUsd > feeUsd };
}

export function board(snap, { size = 0, chain = null, tradeableOnly = false } = {}) {
  return (snap.board || [])
    .filter((r) => !r.err)
    .filter((r) => !chain || (r.chain || 'ethereum') === chain)
    .filter((r) => !tradeableOnly || r.tradeable === true)
    .map((r) => {
      /* the best horizon by trimmed spread — the same pick the page makes, so the two agree */
      const hs = (r.horizons || []).filter((h) => !h.thin && h.spread != null);
      const best = hs.slice().sort((x, y) => (y.trim5 ?? -9) - (x.trim5 ?? -9))[0] || null;
      return {
        name: r.name, pool: r.pool, chain: r.chain || 'ethereum', kind: r.kind,
        symbol: r.sym, feeBps: r.feeBps,
        toll: toll(r, snap.chains, size),
        /* ⚠ `tradeable` is the SNAPSHOT'S verdict against its own bar, restated with the bar beside
         *   it. A boolean with no stated criterion is an opinion wearing a type. */
        tradeable: r.tradeable === true,
        signal: best ? { horizonMin: best.min, samples: best.n, corr: best.corr,
                         spreadPp: best.spread, trimmed5Pp: best.trim5 } : null,
      };
    })
    /* cheapest first when a size was given — that is the ordering a caller asked a cost question
       wants; without a size there is no total to sort on, so the measured order is kept. */
    .sort((a, b) => (size > 0 ? (a.toll.totalUsd - b.toll.totalUsd) : 0));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'GET only' });

  let snap;
  try { snap = await load(req); }
  catch (e) {
    /* ⛔ a missing snapshot is a failure to LOOK and says so; it is not an empty board. A bot that
     *   reads `rows: []` as "nothing is tradeable" has been told a lie by a 200. */
    return send(res, 503, { ok: false, error: 'the snapshot is not readable on this deployment',
      detail: String(e && e.message || e) + ' — data/terminal.json could not be read. This says '
            + 'nothing about the pools themselves.' });
  }

  const q = req.query || {};
  const size = Number(q.size || 0);
  if (q.size != null && !(size > 0)) {
    return send(res, 400, { ok: false, error: 'size must be a positive number of US dollars',
      got: String(q.size) });
  }
  const chain = q.chain ? String(q.chain) : null;
  const rows = board(snap, { size, chain, tradeableOnly: q.tradeable != null });
  const ageSec = snap.measuredAt
    ? Math.round((Date.now() - new Date(snap.measuredAt).getTime()) / 1000) : null;

  if (q.format === 'ndjson') return send(res, 200, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  return send(res, 200, {
    ok: true,
    measuredAt: snap.measuredAt || null,
    /* ⚠ stated, not implied: a caller cannot ask a JSON file how old it is, and a bot trading on a
     *   stale book is precisely what this field is for. */
    ageSeconds: ageSec,
    block: snap.block || null,
    days: snap.days || null,
    chains: snap.chains || null,
    size: size > 0 ? size : null,
    count: rows.length,
    rows,
    bar: snap.method || null,
    /* ⛔ THE RESULT OF THE SCREEN, IN THE PAYLOAD, INCLUDING THE PART THAT KILLS THE IDEA. */
    finding: 'Measured over ' + (snap.days || '?') + ' days across both chains, no directional '
      + 'signal survived the round trip: a PERFECT forecaster at $10.96 of working capital returned '
      + '$1.11-1.72 a week, and a 60%-accurate one lost money at every horizon tested. `tradeable` '
      + 'means a pool cleared the spread bar, NOT that trading it makes money.',
    warning: 'Read-only, and a snapshot. Nothing here signs, quotes or routes. Check ageSeconds '
      + 'before acting on it.',
    endpoints: {
      board: '/api/terminal',
      sized: '/api/terminal?size=1000   — adds the round-trip toll on that size, cheapest first',
      chain: '/api/terminal?chain=base',
      cleared: '/api/terminal?tradeable=1',
      stream: '/api/terminal?format=ndjson',
    },
  });
}

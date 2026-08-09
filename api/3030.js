/* ripmaster3030studios — 3030 · THE SUBSTRATE API (Vercel serverless, no store, no key).
 *
 *   GET /api/3030                    the head — protocol, genesis, height, head hash, the census
 *   GET /api/3030?height=N           one block, WITH the inputs that produce its hash
 *   GET /api/3030?verify=1           re-derive every link from genesis and report the first break
 *   GET /api/3030?format=ndjson      the whole chain, one block per line
 *
 * ══ ⛔ WHY THIS API IS DIFFERENT FROM EVERY OTHER DATA API ═══════════════════════════════════
 *
 * 3030 has no validators, because a block is a PURE FUNCTION of blocks Ethereum and Base have
 * already finalised. That is the protocol's whole claim, and it has a consequence most data APIs
 * cannot offer: **you do not have to trust this server.**
 *
 * ⛔ SO IT SHIPS THE RECIPE, NOT JUST THE ANSWER. Every block response carries the exact inputs —
 *   the parent hash, the Ethereum block hash, the Base block hashes under it, and the census —
 *   plus the CANONICAL STRING those were framed into. A client can sha256 that string themselves
 *   and get the hash back. An API that says "trust me, the height is 6" is a database; one that
 *   hands you the arithmetic is a protocol.
 * ⚑ `verify=1` does that walk server-side and reports the FIRST BREAK rather than a boolean —
 *   "valid: false" tells a caller nothing they can act on. It is also the one endpoint that can
 *   accuse this server of being wrong, which is why it exists.
 *
 * ⛔ AND IT IMPORTS `deriveHash` FROM THE DERIVER RATHER THAN REIMPLEMENTING IT. Two hash
 *   functions is two chains, and the one that drifts is the one nobody is looking at — the same
 *   rule that makes `js/check3030.js` shared between the browser and `scripts/drain.mjs`.
 *
 * ⚠ IT SERVES A DERIVATION, NOT A LIVE CHAIN. `data/substrate.json` is written by
 *   `npm run substrate`. Every response states `derivedAt` and its age in seconds, so a caller can
 *   decide for itself whether that is fresh enough — this project's rule that a stale number must
 *   say how stale rather than be quietly served as current.
 * ⚠ CORS is open because a public census that a browser cannot read is not public.
 */
import { createHash } from 'node:crypto';
/* ⛔ THREE WAYS TO GET THE DERIVATION INTO A LAMBDA AND I TRIED THE WRONG TWO FIRST.
 *   1. `readFileSync(process.cwd()+'/data/…')` — Vercel bundles by TRACING IMPORTS, so a path
 *      assembled at runtime is invisible and the file is never packed.
 *   2. `import … with { type: 'json' }` — import attributes are Node-version dependent, and a
 *      syntax the runtime does not know is a cold-start crash, not a graceful failure.
 *   3. ✅ FETCH IT. `data/substrate.json` is already served as a public static asset (verified
 *      200), so the function reads it over its own origin. Nothing to bundle, no syntax to gamble
 *      on, and the data can refresh without redeploying the function. */
let CACHE = null, CACHE_AT = 0;
async function load(req) {
  if (CACHE && Date.now() - CACHE_AT < 30000) return CACHE;
  const host = (req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host))
    || process.env.VERCEL_URL || 'www.ripmaster3030studios.com';
  const r = await fetch('https://' + host + '/data/substrate.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('derivation fetch ' + r.status);
  CACHE = await r.json(); CACHE_AT = Date.now();
  return CACHE;
}
import { deriveHash, frame, GENESIS, PROTOCOL, SEP } from '../scripts/substrate.mjs';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');



const send = (res, code, body) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  /* a derivation changes only when the deriver runs; let a CDN hold it briefly and revalidate. */
  res.setHeader('cache-control', code === 200 ? 'public, max-age=30, stale-while-revalidate=300' : 'no-store');
  res.setHeader('content-type', typeof body === 'string' ? 'application/x-ndjson' : 'application/json');
  res.status(code).send(typeof body === 'string' ? body : JSON.stringify(body));
};

/* ⛔ I CLAIMED IN THIS FILE'S HEADER THAT IT IMPORTS `deriveHash` RATHER THAN REIMPLEMENTING THE
 *   HASH, AND THEN DID NOT USE IT — the first version asserted `sha256(canonical)` and shipped
 *   that as the recipe. It is wrong: a block's `canonical` is only the CENSUS string, while the
 *   real preimage is frame([prev, ethHash, ...baseHashes, canonical]).
 * ⚑ THE TEST CAUGHT IT IN THE WORST-LOOKING WAY, WHICH IS THE USEFUL WAY: the tamper-detection
 *   test PASSED. It "caught" the sabotage only because the broken check fails on every block —
 *   a verifier that rejects a healthy chain is not detecting anything, and it would have shipped
 *   looking like a working guard. That is why the clean-chain assertion has to sit beside the
 *   sabotage one; either alone is satisfiable by a check that always says the same thing. */
function preimage(b) {
  return frame([b.prev, b.sheet.hash, ...(b.impressions || []).map((i) => i.hash), b.canonical]);
}
/* Everything a caller needs to reproduce the hash WITHOUT this server. */
function recipe(b) {
  return {
    height: b.height,
    hash: b.hash,
    prev: b.prev,
    sheet: b.sheet,
    census: b.census,
    censusCanonical: b.canonical,
    /* ⚑ THE PREIMAGE IS SHIPPED VERBATIM. sha256 of this string IS `hash` — one command, no
     *   reconstruction, nothing to get subtly wrong. A description of a serialisation is not a
     *   serialisation, and the framing rule is exactly the kind of detail a reader reimplements
     *   slightly differently and then blames the server for. */
    preimage: preimage(b),
    verify: {
      algorithm: 'sha256(preimage)',
      preimageRule: 'frame([prev, ethBlockHash, ...baseBlockHashes, censusCanonical]) where frame joins `${s.length}:${s}` with a 0x00 byte',
      reproduce: 'printf %s "<preimage>" | sha256sum   — must equal hash',
    },
  };
}

/* ⛔ REPORT THE FIRST BREAK, NOT A BOOLEAN. "valid: false" over a six-block chain tells a caller
 *   nothing they can act on; the height and the two hashes tell them exactly where to look. */
export function walk(c) {
  const blocks = c.blocks || [];
  let prev = c.genesis || GENESIS, checked = 0;
  for (const b of blocks) {
    if (b.prev !== prev) {
      return { ok: false, checked, break: { height: b.height, reason: 'parent mismatch',
        expectedPrev: prev, gotPrev: b.prev } };
    }
    /* the SHARED deriver, so this cannot drift from what wrote the chain */
    const want = deriveHash(b.prev, b.sheet.hash, (b.impressions || []).map((i) => i.hash), b.census);
    if (want !== b.hash) {
      return { ok: false, checked, break: { height: b.height, reason: 'hash does not match its own canonical string',
        expected: want, got: b.hash } };
    }
    prev = b.hash; checked++;
  }
  return { ok: true, checked, head: prev };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'GET only' });

  let c;
  try { c = await load(req); }
  catch (e) {
    /* ⛔ a missing derivation is a failure to LOOK, and it says so — it is not an empty chain. */
    return send(res, 503, { ok: false, error: 'the derivation is not readable on this deployment',
      detail: String(e && e.message || e) + ' — data/substrate.json could not be read. This says nothing about the source chains.' });
  }

  const q = req.query || {};
  const blocks = c.blocks || [];
  const head = blocks[blocks.length - 1] || null;
  const ageSec = c.derivedAt ? Math.round((Date.now() - new Date(c.derivedAt).getTime()) / 1000) : null;
  const base = {
    ok: true,
    protocol: c.protocol || PROTOCOL, version: c.version, layer: '00',
    genesis: c.genesis || GENESIS,
    height: blocks.length,
    head: head ? head.hash : null,
    /* ⚠ state the age in the payload. A caller cannot ask a JSON file how old it is. */
    derivedAt: c.derivedAt || null, ageSeconds: ageSec,
    sources: c.sources || null,
  };

  if (q.verify != null) {
    const v = walk(c);
    return send(res, 200, { ...base, verification: v,
      note: v.ok
        ? 'every link re-derived from the canonical strings in this payload. You can repeat this without us — see /api/3030?height=N.'
        : 'a link did not reproduce. The break is named; do not trust the head above it.' });
  }

  if (q.height != null) {
    const n = Number(q.height);
    const b = blocks.find((x) => Number(x.height) === n);
    if (!b) return send(res, 404, { ok: false, error: 'no block at that height',
      height: n, available: blocks.length ? { from: blocks[0].height, to: head.height } : null });
    return send(res, 200, { ...base, block: recipe(b),
      impressions: b.impressions, runs: b.runs, runsTotal: b.runsTotal });
  }

  if (q.format === 'ndjson') {
    return send(res, 200, blocks.map((b) => JSON.stringify(recipe(b))).join('\n') + '\n');
  }

  return send(res, 200, { ...base,
    totals: c.totals || null, gas: c.gas || null,
    blocks: blocks.map((b) => ({ height: b.height, hash: b.hash, prev: b.prev, sheet: b.sheet, census: b.census })),
    endpoints: {
      head: '/api/3030',
      block: '/api/3030?height=N   — includes the canonical string, so you can check the hash yourself',
      verify: '/api/3030?verify=1  — re-derives every link and names the first break',
      stream: '/api/3030?format=ndjson',
    },
    claim: 'A 3030 block is a pure function of Ethereum and Base blocks that are already final. There are no validators, because verification replaces consensus — and this API hands you the arithmetic rather than asking to be believed.',
  });
}

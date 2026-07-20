/* Upperdeck Ripmaster 3030 — live presence (Vercel serverless + Upstash Redis).
 *
 * The internet-wide half of cards/arena-net.js: every open lobby heartbeats its
 * player record here (POST) and gets the live roster back; records expire after
 * TTL seconds so ghosts vanish on their own. GET returns the roster alone.
 *
 * Zero npm dependencies — talks to Upstash over its REST API using the env vars
 * the Vercel/Upstash integration injects (either naming scheme works):
 *   KV_REST_API_URL / KV_REST_API_TOKEN            (Vercel KV)
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (Upstash marketplace)
 * With neither present it answers 503 and the site quietly stays on LocalNet.
 *
 * Addresses are CLAIMED by the sender's client (it reads its own connected
 * wallet). The record carries an optional sig field so server-side signature
 * enforcement can be added later without changing this protocol.
 */
const env = () => ({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  tok: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});
const TTL = 20;           // seconds a heartbeat stays alive
const PREFIX = 'urmp:';

async function kv(cmd) {
  const { url, tok } = env();
  const r = await fetch(url, { method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
    body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('kv ' + r.status);
  return r.json();
}

const S = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const cleanRec = b => {
  const id = S(b.id, 24), handle = S(b.handle, 32).trim();
  if (!/^p_[a-z0-9]{4,20}$/.test(id) || !handle) return null;
  const addr = /^0x[0-9a-fA-F]{40}$/.test(b.address || '') ? b.address : undefined;
  const status = ['idle', 'seeking', 'battling'].includes(b.status) ? b.status : 'idle';
  return { id, handle, status,
    game: S(b.game, 16) || 'arena',
    balance: Math.max(0, Math.min(1e9, +b.balance || 0)),
    cards: Math.max(0, Math.min(9999, +b.cards | 0)),
    verified: !!b.verified,
    ...(b.seek ? { seek: true } : {}),          // hunting a human dogfight
    ...(addr ? { address: addr } : {}),
    ...(b.sig ? { sig: S(b.sig, 200) } : {}),
    t: Date.now() };
};

async function roster() {
  let cursor = '0', keys = [], hops = 0;
  do {
    const s = await kv(['SCAN', cursor, 'MATCH', PREFIX + '*', 'COUNT', '200']);
    cursor = (s.result && s.result[0]) || '0';
    keys = keys.concat((s.result && s.result[1]) || []);
  } while (cursor !== '0' && ++hops < 5 && keys.length < 400);
  if (!keys.length) return [];
  const mg = await kv(['MGET', ...keys]);
  return ((mg.result || []).filter(Boolean).map(s => { try { return JSON.parse(s); } catch { return null; } })
    .filter(Boolean)).slice(0, 200);
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const { url, tok } = env();
  if (!url || !tok) return res.status(503).json({ ok: false, reason: 'kv-not-configured',
    envSeen: Object.keys(process.env).filter(k => /KV|UPSTASH|REDIS|STORAGE/i.test(k)).sort() });   // names only — helps wire the integration
  try {
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
      const rec = b && cleanRec(b);
      if (!rec) return res.status(400).json({ ok: false, reason: 'bad-record' });
      await kv(['SETEX', PREFIX + rec.id, String(TTL), JSON.stringify(rec)]);
    } else if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, reason: 'method' });
    }
    return res.status(200).json({ ok: true, players: await roster() });
  } catch (e) {
    return res.status(502).json({ ok: false, reason: 'kv-error' });
  }
}

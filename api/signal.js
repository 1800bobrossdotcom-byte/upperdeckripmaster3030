/* Upperdeck Ripmaster 3030 — WebRTC signaling mailbox (Vercel + Upstash KV).
 *
 * Carries the dogfight PvP handshake (offers/answers/ICE) between pilots.
 * POST {room, from, to, type, payload}  → appended to the recipient's inbox
 * GET  ?room=…&me=…                     → drains and returns my inbox
 * Inboxes expire after 90s — signaling is only used while a match forms; the
 * combat itself flows peer-to-peer over WebRTC data channels, never through here.
 * Zero npm dependencies; same env-var pairs as api/presence.js; 503 without KV.
 */
const env = () => ({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  tok: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});
async function kv(cmd) {
  const { url, tok } = env();
  const r = await fetch(url, { method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
    body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('kv ' + r.status);
  return r.json();
}
const S = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const ROOM = /^df_[A-Za-z0-9_]{3,30}$/, PID = /^p_[a-z0-9]{4,20}$/;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const { url, tok } = env();
  if (!url || !tok) return res.status(503).json({ ok: false, reason: 'kv-not-configured' });
  try {
    if (req.method === 'POST') {
      let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
      const room = S(b && b.room, 40), from = S(b && b.from, 24), to = S(b && b.to, 24), type = S(b && b.type, 12);
      if (!ROOM.test(room) || !PID.test(from) || !PID.test(to) || !['offer', 'answer', 'ice'].includes(type))
        return res.status(400).json({ ok: false, reason: 'bad-msg' });
      const msg = JSON.stringify({ room, from, fromHandle: S(b.fromHandle, 32) || undefined, to, type, payload: b.payload });
      if (msg.length > 9000) return res.status(400).json({ ok: false, reason: 'too-big' });
      const key = 'urms:' + room + ':' + to;
      await kv(['RPUSH', key, msg]); await kv(['EXPIRE', key, '90']);
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'GET') return res.status(405).json({ ok: false, reason: 'method' });
    const q = req.query || {}; const room = S(q.room, 40), me = S(q.me, 24);
    if (!ROOM.test(room) || !PID.test(me)) return res.status(400).json({ ok: false, reason: 'bad-query' });
    const key = 'urms:' + room + ':' + me;
    const lr = await kv(['LRANGE', key, '0', '-1']); await kv(['DEL', key]);
    const msgs = ((lr.result) || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    return res.status(200).json({ ok: true, msgs });
  } catch (e) { return res.status(502).json({ ok: false, reason: 'kv-error' }); }
}

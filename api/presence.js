/* ripmaster3030studios — live presence (Vercel serverless + Upstash Redis).
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
 *
 * ⛔ CHALLENGES USED TO STOP AT THE EDGE OF THE DEVICE. The roster has been internet-wide since
 *   this file shipped, but cards/arena-net.js sent every challenge over BroadcastChannel alone —
 *   same browser, same machine. So two real people on opposite sides of the world could SEE each
 *   other in the lobby, press CHALLENGE, and nothing happened to either of them. The button
 *   rendered, the click handler ran, no error was thrown anywhere. Discovery was global and
 *   invitation was local, and only the half you can see was global.
 * ⚑ THE INBOX RIDES THE HEARTBEAT THAT ALREADY EXISTS. A challenge is `RPUSH`ed onto the
 *   RECIPIENT's own key and drained by their next beat, so the common case costs no extra round
 *   trip and there is no second transport to keep alive. Envelope kinds: call / accept / decline.
 * ⛔ A CHALLENGE MAY ONLY BE SENT ALONGSIDE A VALID RECORD FOR THE SENDER. That is structural,
 *   not politeness: it means you cannot issue an invitation you are not reachable to receive the
 *   answer to. A sender with no record is a challenge that can only ever time out.
 */
const env = () => ({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  tok: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});
const TTL = 20;           // seconds a heartbeat stays alive
const PREFIX = 'urmp:';
const CH_PREFIX = 'urmc:';   // urmc:<recipient id> → a LIST of challenge envelopes
/* ⚠ A MAILBOX HAS TO EXPIRE ON ITS OWN. The recipient may never come back to drain it, and a
 * challenge nobody answered is worthless a minute later — you are standing in a lobby waiting.
 * 90 s is long enough to survive a page navigation from the front door into the arena and short
 * enough that nothing stale is ever delivered as if it were live. */
const CH_TTL = 90;
const CH_MAX = 8;            // a mailbox is capped, so one spammer cannot grow it without bound

async function kv(cmd) {
  const { url, tok } = env();
  const r = await fetch(url, { method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
    body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('kv ' + r.status);
  return r.json();
}

const S = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const NUM = (v, lim) => Math.max(-lim, Math.min(lim, Math.round((+v || 0) * 10) / 10));
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
    /* ⚑ A COARSE POSITION, for THE CITY. The roster is a heartbeat with a 20 s TTL, so this can
     * say "somebody is over by the river" and can never animate them — the smooth half rides the
     * peer-to-peer channels (js/city-net.js). Clamped to the world's own bounds so a bad client
     * cannot write a body outside the map or a NaN into everybody's roster. */
    ...(Number.isFinite(+b.px) ? { px: NUM(b.px, 2000), py: NUM(b.py, 4000), pz: NUM(b.pz, 2000),
                                   pb: S(b.pb, 12) || 'bird' } : {}),
    ...(addr ? { address: addr } : {}),
    ...(b.sig ? { sig: S(b.sig, 200) } : {}),
    t: Date.now() };
};

/* ── the challenge inbox ───────────────────────────────────────────────────────────────────
 * An envelope is tiny and self-describing: who, to whom, which conversation (cid), and what
 * kind of move it is. `cid` threads a call to its answer, so a client can tell "they accepted
 * MY challenge" from "they accepted somebody else's" without holding any server-side session. */
const ID = /^p_[a-z0-9]{4,20}$/;
const cleanCh = (c, fromId) => {
  if (!c || typeof c !== 'object') return null;
  const cid = S(c.cid, 40), to = S(c.to, 24), kind = S(c.kind, 8);
  if (!/^c_[a-z0-9_]{4,32}$/.test(cid)) return null;
  if (!ID.test(to) || !['call', 'accept', 'decline'].includes(kind)) return null;
  /* ⛔ THE SENDER IS THE RECORD, NOT THE ENVELOPE. Taking `from` off the envelope would let any
   * client post a challenge signed with somebody else's id — the roster would show a face-off
   * nobody asked for, addressed to a stranger, and the named "challenger" would never know. */
  if (to === fromId) return null;                    // challenging yourself is a loop, not a move
  return { cid, to, kind, from: fromId, fromHandle: S(c.fromHandle, 32).trim(), t: Date.now() };
};

async function post(ch) {
  const key = CH_PREFIX + ch.to;
  await kv(['RPUSH', key, JSON.stringify(ch)]);
  await kv(['LTRIM', key, String(-CH_MAX), '-1']);
  await kv(['EXPIRE', key, String(CH_TTL)]);
}

/* ⚠ `LPOP key count` IS ONE OPERATION AND HAS NO LOST-MESSAGE RACE. LRANGE-then-DEL drops any
 * challenge that lands between the two calls — which is exactly the moment two people press the
 * button at once — so it is the FALLBACK for a server too old for the count argument, never the
 * default. Both paths are here because failing closed to "you have no challenges", forever and
 * silently, is the worst possible way for this to break. */
async function drain(id) {
  const key = CH_PREFIX + id;
  try {
    const p = await kv(['LPOP', key, String(CH_MAX)]);
    if (Array.isArray(p.result)) return p.result;
    if (p.result === null) return [];                // key absent — an empty mailbox, not an error
  } catch { /* fall through */ }
  try {
    const r = await kv(['LRANGE', key, '0', String(CH_MAX - 1)]);
    const out = r.result || [];
    if (out.length) await kv(['DEL', key]);
    return out;
  } catch { return []; }
}

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
    let inbox = [], sent = 0;
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
      const rec = b && cleanRec(b);
      if (!rec) return res.status(400).json({ ok: false, reason: 'bad-record' });
      await kv(['SETEX', PREFIX + rec.id, String(TTL), JSON.stringify(rec)]);
      /* `ch` accepts one envelope or a few. ⚠ A LIST rather than a single slot because a client
       * that queues a challenge and an accept in the same tick would otherwise silently drop one
       * of them — and the one it drops is an answer somebody is waiting on. */
      const out = (Array.isArray(b.ch) ? b.ch : b.ch ? [b.ch] : []).slice(0, 4)
        .map(c => cleanCh(c, rec.id)).filter(Boolean);
      for (const c of out) { await post(c); sent++; }
      /* ⛔ DRAIN ONLY WHEN ASKED. Every cabinet heartbeats here, but only a page that can SHOW a
       * challenge asks for one — otherwise a player in DOGFIGHT would empty their own mailbox
       * into a page with nothing to render it, and the challenge would be eaten in silence
       * rather than waiting the 90 s for them to open the arena. */
      if (b.inbox) inbox = await drain(rec.id);
    } else if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, reason: 'method' });
    }
    return res.status(200).json({ ok: true, players: await roster(), inbox, sent });
  } catch (e) {
    return res.status(502).json({ ok: false, reason: 'kv-error' });
  }
}

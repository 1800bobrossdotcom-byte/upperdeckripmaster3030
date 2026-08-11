/* ripmaster3030studios — TOP RIPPERS, per game (Vercel serverless + Upstash Redis).
 *
 * Artist, 2026-08-07: "top rippers for each game need to be shown" and "show the address as the
 * player".
 *
 * ⛔ THE BOARD WAS localStorage AND IT EXISTED IN ONE GAME. `js/rrpc-app.js` kept `urm_rr_scores`
 *   in the player's own browser, so "TOP RIPPERS" was a list of one person — yourself — and the
 *   other five cabinets had no board at all. A high score nobody else can see is a diary entry.
 * ⚑ ONE SORTED SET PER GAME on the KV that already runs presence, so there is no new service and
 *   no new failure mode: no KV ⇒ 503 ⇒ every board falls back to the local list it always had.
 *
 *   GET  /api/scores?game=riprocketer&n=10   → { ok, top:[{name,score,addr}] }
 *   POST /api/scores  {game,name,score,addr} → records it, returns the new top
 *
 * ⚠ THIS IS A SCOREBOARD, NOT AN ORACLE, AND IT SAYS SO OUT LOUD. Every score here is computed in
 *   the player's own browser and posted by it, so it is exactly as trustworthy as the client —
 *   which is to say not at all. That is fine for a wall of names and is why NOTHING OF VALUE MAY
 *   EVER KEY ON IT: the earned 1/1s hang off a human-signed EIP-712 voucher (docs/HERO-UNLOCKS.md),
 *   and a board entry is not evidence, it is a claim. Same rule the title ledger states about
 *   itself.
 * ⚠ Rate-limited per identity per game, and scores are capped, so one client cannot fill the set
 *   or park an absurd number at the top forever. Neither makes it trustworthy; both keep it tidy.
 */
const env = () => ({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  tok: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});
const PREFIX = 'urms:';          // urms:<game> → ZSET member=identity, score=points
const KEEP = 25;                 // how many the set holds; the page asks for ~10
const MAX = 1e12;                // an upper bound so one client cannot park Infinity at the top
/* mirrors GAMES in api/presence.js and js/challenge-ui.js — an unknown game is refused rather
 * than silently creating a key nobody will ever read. */
const GAMES = ['arena', 'dogfight', 'section9', 'city', 'cloudracer', 'riprocketer', 'pull'];

async function kv(cmd) {
  const { url, tok } = env();
  const r = await fetch(url, { method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
    body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('kv ' + r.status);
  return r.json();
}

const S = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

/* ⚑ THE MEMBER IS THE IDENTITY, WHICH IS WHAT MAKES A BOARD A BOARD. ZADD on the same member
 * REPLACES the score rather than appending, so a player has ONE row that improves — not forty
 * rows from forty runs. A connected wallet is the identity when there is one (the artist's
 * "show the address as the player"), because it is the only durable name a person has here; a
 * handle is per-browser and anyone can type yours. */
function ident(b) {
  const raw = /^0x[0-9a-fA-F]{40}$/.test(b.addr || '') ? String(b.addr) : '';
  const name = S(b.name, 24).trim();
  /* ⚠ KEY ON LOWERCASE, DISPLAY THE ORIGINAL. An address is one identity however it is cased, so
   *   the ZSET member must be case-folded or the same wallet takes two rows; but a checksummed
   *   address is the one people recognise, so that is what the board shows. */
  if (raw) return { key: raw.toLowerCase(), name: name, addr: raw };
  if (!name) return null;
  /* ⚠ a handle-only entry is namespaced so it can never collide with an address, and so somebody
   * typing "0xabc…" as a handle cannot impersonate a wallet row. */
  return { key: 'h:' + name.toLowerCase(), name: name, addr: '' };
}

/* ⛔ THE MEMBER MUST BE THE KEY, NOT THE DISPLAY BLOB. Writing `{name, addr}` as the ZSET member
 * makes the IDENTITY include the name — so changing your handle, or posting the same address with
 * different casing, mints a SECOND row and a player appears twice with two scores. The member is
 * the case-folded key; a small hash beside it holds what to draw. */
const NAMES = 'urmsn:';          // urmsn:<game> → HASH key → {n,a}

async function top(game, n) {
  const r = await kv(['ZREVRANGE', PREFIX + game, '0', String(Math.max(0, n - 1)), 'WITHSCORES']);
  const flat = r.result || [];
  if (!flat.length) return [];
  const keys = [], scores = [];
  for (let i = 0; i < flat.length; i += 2) { keys.push(String(flat[i])); scores.push(Math.round(+flat[i + 1] || 0)); }
  let disp = [];
  try { const h = await kv(['HMGET', NAMES + game].concat(keys)); disp = h.result || []; } catch (e) {}
  return keys.map((k, i) => {
    let m = {};
    try { m = JSON.parse(disp[i] || '{}') || {}; } catch (e) {}
    /* ⚠ a row whose display record is missing still renders — derive it from the key rather than
     *   showing a blank name, which would read as a corrupt board. */
    const addr = m.a || (/^0x[0-9a-f]{40}$/.test(k) ? k : '');
    const name = m.n || (k.indexOf('h:') === 0 ? k.slice(2) : '');
    return { name: name, addr: addr, score: scores[i] };
  });
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, tok } = env();
  if (!url || !tok) return res.status(503).json({ ok: false, reason: 'no-kv' });

  try {
    const q = req.query || {};
    let game = S(q.game, 16);
    const n = Math.max(1, Math.min(KEEP, +q.n || 10));

    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
      if (!b) return res.status(400).json({ ok: false, reason: 'bad-body' });
      game = S(b.game, 16) || game;
      if (!GAMES.includes(game)) return res.status(400).json({ ok: false, reason: 'bad-game' });
      const who = ident(b);
      if (!who) return res.status(400).json({ ok: false, reason: 'no-identity' });
      const score = Math.max(0, Math.min(MAX, Math.round(+b.score || 0)));
      if (!score) return res.status(400).json({ ok: false, reason: 'no-score' });

      /* ⚠ ONE POST PER IDENTITY PER GAME PER 5s. A game that ends in a loop, or a page that
       * re-submits on every render, would otherwise hammer the KV for no benefit. */
      const gate = 'urmsg:' + game + ':' + who.key;
      const g = await kv(['SET', gate, '1', 'NX', 'EX', '5']);
      if (g.result !== 'OK') return res.status(200).json({ ok: true, throttled: true, top: await top(game, n) });

      /* GT keeps a player's BEST rather than their LAST — a board that a bad run can knock you
       * off is a board that punishes playing again. */
      await kv(['ZADD', PREFIX + game, 'GT', String(score), who.key]);
      await kv(['HSET', NAMES + game, who.key, JSON.stringify({ n: who.name, a: who.addr })]);
      await kv(['ZREMRANGEBYRANK', PREFIX + game, '0', String(-KEEP - 1)]);
      return res.status(200).json({ ok: true, top: await top(game, n) });
    }

    if (req.method !== 'GET') return res.status(405).json({ ok: false, reason: 'method' });
    if (!GAMES.includes(game)) return res.status(400).json({ ok: false, reason: 'bad-game' });
    return res.status(200).json({ ok: true, top: await top(game, n) });
  } catch (e) {
    return res.status(503).json({ ok: false, reason: 'kv-error' });
  }
}

// Vercel serverless function — pin the 33 hero images to IPFS using the PINATA_JWT set in the
// Vercel project env.
//
//   GET  /api/pin                  -> { ready, total, env }        cheap; changes nothing
//   POST /api/pin?from=0&count=3   -> pins that slice, returns { next }
//
// ⛔ THE KEY NEVER LEAVES THE SERVER AND NEVER ENTERS A REPO. That is the whole reason this
//    exists rather than a CLI flag: scripts/pin-heroes.mjs --pin is the right tool when you are
//    at your own machine, and this is the right tool when you are not. Nothing here echoes the
//    JWT, and the only thing it can be pointed at is the list in cards/hero/cids.json.
//
// ⚑ WHAT BOUNDS THE ABUSE IS THE FIXED, IDEMPOTENT ACTION SET, NOT A SECRET. This endpoint takes
//    no file, no URL and no id from the caller — only a slice of a list it reads out of its own
//    deployment, pinning files off its own origin. Pinata deduplicates by content, so pinning the
//    same bytes twice stores nothing new. The worst an abuser achieves is making the studio's own
//    art more available. An upload proxy accepting arbitrary bytes would be a completely
//    different object and would need a secret.
//
// ⛔ IT IS CHUNKED BECAUSE A SERVERLESS FUNCTION HAS A WALL CLOCK AND 33 UPLOADS DO NOT FIT IN IT.
//    The first version did all 33 in one request, plus a gateway check per card — minutes of work
//    inside a ~10 s budget. Measured against the live deployment it did not return at all, which
//    is the worst possible failure here: the caller cannot tell a timeout from a broken key from a
//    dead endpoint, and re-pressing the button starts the whole thing again. The client drives the
//    loop now and sees progress after every slice.
//
// ⚠ AND VERIFICATION DELIBERATELY DOES NOT LIVE HERE. Whether an independent gateway serves those
//    exact bytes is the question that actually matters, and it is slow — so it runs in the BROWSER
//    (step ① of deploy-cards.html), which has no timeout and is also where the honest answer is:
//    a check performed by the uploader's own infrastructure is the weakest place to perform it.

const PINATA = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

const site = req => `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`;

async function get(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const JWT = process.env.PINATA_JWT || '';
  const base = site(req);

  const man = await get(`${base}/cards/hero/cids.json`, 8000);
  if (!man) return res.status(500).json({ error: 'cards/hero/cids.json not reachable from this deploy' });
  const MAN = JSON.parse(man.toString());
  const ids = Object.keys(MAN.cids).map(Number).sort((a, b) => a - b);

  /* ── GET: cheap status. No uploads, no gateway round-trips. ────────────────────────────────
   * ⚠ Names only, never a value — enough to tell "the variable is missing" from "the key is
   *   wrong", which are different problems with different fixes. */
  if (req.method !== 'POST') {
    return res.status(200).json({
      ready: !!JWT, total: ids.length, ids,
      env: Object.keys(process.env).filter(k => /PINATA/i.test(k)).sort(),
      note: 'POST ?from=&count= to pin a slice; verify in the browser, not here',
    });
  }

  if (!JWT) return res.status(500).json({ error: 'PINATA_JWT is not set on this deployment', env: [] });

  const from = Math.max(0, parseInt(req.query.from, 10) || 0);
  /* ⚠ A CEILING, NOT A SUGGESTION. A caller asking for all 33 in one slice would reproduce
   *   exactly the timeout this file exists to avoid, so the ceiling is enforced here rather than
   *   trusted to the page — the page is not the only thing that can call this. */
  const count = Math.min(4, Math.max(1, parseInt(req.query.count, 10) || 3));
  const slice = ids.slice(from, from + count);

  const done = [], failed = [];
  for (const id of slice) {
    const cid = MAN.cids[String(id)], file = MAN.files[String(id)];
    const bytes = await get(`${base}/${file}`, 8000);
    if (!bytes) { failed.push({ id, why: `art not served at /${file}` }); continue; }

    const fd = new FormData();
    fd.append('file', new Blob([bytes]), file.split('/').pop());
    fd.append('pinataMetadata', JSON.stringify({ name: `ripmaster3030studios hero ${id}` }));
    /* ⚠ ASK FOR CIDv0 EXPLICITLY. Newer Pinata accounts default to CIDv1, which is a different
     *   STRING for the same bytes — an unpinned default would look like a mismatch and send
     *   somebody re-deriving a manifest that was already correct. v1 is accepted below anyway. */
    fd.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));

    try {
      const r = await fetch(PINATA, { method: 'POST', headers: { authorization: `Bearer ${JWT}` }, body: fd });
      const j = await r.json();
      if (!r.ok || !j.IpfsHash) { failed.push({ id, why: `${r.status} ${JSON.stringify(j).slice(0, 140)}` }); continue; }
      /* ⛔ THE SERVICE'S ANSWER MUST MATCH WHAT WE COMPUTED FROM THE FILE. If it does not it
       *   chunked the bytes differently, and reporting its value would quietly replace a CID
       *   derived from the artwork with one that can only be taken on trust — which is the entire
       *   property worth having here. Fail loudly instead of adopting it. */
      if (j.IpfsHash !== cid && j.IpfsHash !== MAN.cidv1[String(id)]) {
        failed.push({ id, why: `returned ${j.IpfsHash}, expected ${cid}` });
        continue;
      }
      done.push({ id, cid: j.IpfsHash, size: j.PinSize });
    } catch (e) { failed.push({ id, why: String(e.message || e).slice(0, 140) }); }
  }

  const next = from + slice.length;
  return res.status(failed.length ? 207 : 200).json({
    from, pinned: done.map(d => d.id), failed,
    next: next < ids.length ? next : null, total: ids.length,
  });
}

// Vercel serverless function — pin the 33 hero images to IPFS using the PINATA_JWT set in the
// Vercel project env.
//
//   GET  /api/pin            -> { ready, pinned, cids }        does nothing, reports state
//   POST /api/pin            -> pins every hero whose CID is not already retrievable
//
// ⛔ THE KEY NEVER LEAVES THE SERVER AND NEVER ENTERS A REPO. That is the whole reason this
//    exists rather than a CLI flag: scripts/pin-heroes.mjs --pin is the right tool when you are
//    at your own machine, and this is the right tool when you are not. Nothing here echoes the
//    JWT, and the only thing it can be pointed at is the fixed list below.
//
// ⚑ WHAT BOUNDS THE ABUSE IS THE FIXED, IDEMPOTENT ACTION SET, NOT A SECRET. This endpoint takes
//    no file, no URL and no id from the caller: it reads cards/hero/cids.json out of the deployed
//    bundle and pins exactly those files off this same origin. Pinata deduplicates by content, so
//    pinning the same bytes twice stores nothing new and costs nothing. So the worst an abuser
//    achieves is making the studio's own art slightly more available. An upload proxy that
//    accepted arbitrary bytes would be a completely different object and would need a secret.
//
// ⚠ AND IT REFUSES TO REPORT A CID IT DID NOT VERIFY. A successful upload is not a successful
//    pin — the value that matters is whether an INDEPENDENT gateway serves those exact bytes, so
//    that is what `pinned` means here. `setCards` writes these strings into the lens permanently
//    enough that a marketplace will cache a miss.

const GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/'];

const site = req => `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`;

const bytesAt = async (url, ms = 20000) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; } finally { clearTimeout(t); }
};

/* Is this CID served, byte-identical, by a gateway that is not the pinning service's own?
 * ⚠ Compare BYTES, not status. Gateways 200 with an HTML error page often enough that "it
 *   responded" proves nothing, and a CID resolving to the wrong content survives every cheaper
 *   check. */
async function retrievable(cid, want) {
  for (const g of GATEWAYS) {
    const got = await bytesAt(g + cid, 15000);
    if (got && want && got.equals(want)) return g;
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  const JWT = process.env.PINATA_JWT || '';
  const base = site(req);

  const man = await bytesAt(`${base}/cards/hero/cids.json`);
  if (!man) return res.status(500).json({ error: 'cards/hero/cids.json not reachable from this deploy' });
  const MAN = JSON.parse(man.toString());
  const ids = Object.keys(MAN.cids).map(Number).sort((a, b) => a - b);

  /* ── GET: report, change nothing ─────────────────────────────────────────────────────────── */
  if (req.method !== 'POST') {
    const out = [];
    for (const id of ids) {
      const want = await bytesAt(`${base}/${MAN.files[String(id)]}`);
      out.push({ id, cid: MAN.cids[String(id)], live: !!(await retrievable(MAN.cids[String(id)], want)) });
    }
    return res.status(200).json({
      ready: !!JWT, total: ids.length,
      pinned: out.filter(o => o.live).length,
      cards: out,
      /* ⚠ Names only, never a value — enough to tell "the env var is missing" from "the key is
       *   wrong", which are different problems with different fixes. */
      env: Object.keys(process.env).filter(k => /PINATA/i.test(k)).sort(),
    });
  }

  if (!JWT) return res.status(500).json({ error: 'PINATA_JWT is not set on this deployment', env: [] });

  /* ── POST: pin whatever is not already retrievable ───────────────────────────────────────── */
  const done = [], failed = [], skipped = [];
  for (const id of ids) {
    const cid = MAN.cids[String(id)], file = MAN.files[String(id)];
    const want = await bytesAt(`${base}/${file}`);
    if (!want) { failed.push({ id, why: `art not served at /${file}` }); continue; }

    /* Already there — do not re-upload. Idempotent either way, but this keeps a re-run cheap and
     * makes the response say what actually happened rather than what was attempted. */
    if (await retrievable(cid, want)) { skipped.push(id); continue; }

    const fd = new FormData();
    fd.append('file', new Blob([want]), file.split('/').pop());
    fd.append('pinataMetadata', JSON.stringify({ name: `ripmaster3030studios hero ${id}` }));
    /* ⚠ ASK FOR CIDv0 EXPLICITLY. Newer Pinata accounts default to CIDv1, which is a different
     *   STRING for the same bytes — an unpinned default would look like a mismatch and send
     *   somebody re-deriving a manifest that was already correct. v1 is accepted below anyway. */
    fd.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));

    let j;
    try {
      const r = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST', headers: { authorization: `Bearer ${JWT}` }, body: fd });
      j = await r.json();
      if (!r.ok || !j.IpfsHash) { failed.push({ id, why: `${r.status} ${JSON.stringify(j).slice(0, 160)}` }); continue; }
    } catch (e) { failed.push({ id, why: String(e.message || e).slice(0, 160) }); continue; }

    /* ⛔ THE SERVICE'S ANSWER MUST MATCH WHAT WE COMPUTED FROM THE FILE. If it does not, it
     *   chunked the bytes differently — reporting its value would quietly replace a CID derived
     *   from the artwork with one that can only be taken on trust, which is the entire property
     *   worth having here. Fail loudly instead. */
    if (j.IpfsHash !== cid && j.IpfsHash !== MAN.cidv1[String(id)]) {
      failed.push({ id, why: `returned ${j.IpfsHash}, expected ${cid}` });
      continue;
    }
    done.push({ id, cid: j.IpfsHash, size: j.PinSize });
  }

  return res.status(failed.length ? 207 : 200).json({
    pinned: done.length, alreadyLive: skipped.length, failed,
    note: 'a successful upload is not a successful pin — GET this endpoint, or run ① on ' +
          '/deploy-cards.html, to confirm an independent gateway serves the exact bytes',
  });
}

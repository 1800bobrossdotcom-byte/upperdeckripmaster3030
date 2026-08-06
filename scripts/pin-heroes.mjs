#!/usr/bin/env node
/* ripmaster3030studios — pin the 33 hero images, and prove they are retrievable at the CIDs we
 * are about to write on-chain.
 *
 *   PINATA_JWT=… node scripts/pin-heroes.mjs --pin        # upload all 33
 *   node scripts/pin-heroes.mjs --verify                  # fetch each CID back and compare bytes
 *   node scripts/pin-heroes.mjs --verify --id 7           # one card
 *
 * ⛔ RUN THIS WHERE THE KEY LIVES. The token was deployed from the artist's own machine for the
 *   same reason: an ephemeral container is the wrong home for a credential, even one that can only
 *   write to a pinning account. Nothing here needs a key except `--pin`, and `--pin` is the half
 *   that can be re-run.
 *
 * ⚑ THE TWO HALVES ARE SEPARABLE AND ONLY ONE OF THEM CAN FAIL LATER. scripts/hero-cids.mjs
 *   already computed WHAT each CID is, from the file, offline — a CID is a hash of the content,
 *   not a receipt from a service. So `--pin` is not "find out the CIDs", it is "make these bytes
 *   retrievable". And `--verify` is what actually matters: it asks a gateway that has never seen
 *   our upload for the hash we computed, and requires the ORIGINAL BYTES back.
 *
 * ⛔ VERIFY BEFORE ANY ON-CHAIN WRITE. `setCards(ids, cids, titles)` freezes these strings into
 *   the lens's metadata; marketplaces then cache them hard. A CID that resolves to nothing is a
 *   card that shows nothing, on somebody's collectible, for as long as their cache lives. The
 *   arithmetic being right is not the same as the art being there.
 *
 * ⚠ IF A SERVICE RETURNS A DIFFERENT CID, IT CHUNKED THE FILE DIFFERENTLY — do not "fix" it by
 *   trusting the service. Both encodings are printed so either convention matches; a third answer
 *   means the bytes or the chunking differ and the manifest must be re-derived, not overwritten.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const arg = f => argv[argv.indexOf(f) + 1];

const MAN = JSON.parse(readFileSync(join(ROOT, 'cards/hero/cids.json'), 'utf8'));
const IDS = Object.keys(MAN.cids).map(Number).sort((a, b) => a - b)
  .filter(id => !arg('--id') || Number(arg('--id')) === id);

/* Gateways to ask. ⚠ MORE THAN ONE, AND NONE OF THEM PINATA'S. A dedicated gateway will serve
 * content it is itself pinning even when nothing else on the network can reach it, so asking only
 * the uploader's own gateway tests the upload and not the pin. Independent gateways are the
 * question a collector's wallet will ask. */
const GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

const bytesOf = id => {
  const p = join(ROOT, MAN.files[String(id)]);
  if (!existsSync(p)) { console.error(`⛔ ${id}: missing ${MAN.files[String(id)]}`); process.exit(1); }
  return readFileSync(p);
};

/* ⛔ A BROKEN FETCHER AND AN UNPINNED FILE REPORT THE SAME THING, so the fetcher has to prove
 *   itself before it is allowed to say "not pinned". This asks for a CID that has been on IPFS
 *   since the beginning and requires the known bytes back; if that fails, the gateways or this
 *   network are the problem and every verdict below is worthless.
 * ⚑ Same instrument scripts/hero-cids.mjs uses to check its own arithmetic — a control that is
 *   KNOWN-GOOD, so a failure on the real subject is attributable. Without it, "0/33 retrievable"
 *   on a night with flaky egress reads as a catastrophic pinning failure and sends somebody
 *   re-uploading art that was fine. */
const CONTROL = { cid: 'QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o', bytes: Buffer.from('hello world\n') };
async function gatewaysWork() {
  for (const g of GATEWAYS) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(g + CONTROL.cid, { signal: ctl.signal });
      clearTimeout(t);
      if (r.ok && Buffer.from(await r.arrayBuffer()).equals(CONTROL.bytes)) return g.split('/')[2];
    } catch { /* next */ }
  }
  return null;
}

/* ── --verify: is the art actually there, at the hash we will write on-chain? ──────────────── */
async function verify() {
  const control = await gatewaysWork();
  if (!control) {
    console.error('⛔ CANNOT TELL. No gateway returned the known control CID, so this machine');
    console.error('   cannot reach IPFS at all. That says nothing about whether the art is pinned —');
    console.error('   re-run from a network that can reach ipfs.io before believing any verdict.');
    process.exit(2);
  }
  console.log(`  control CID resolves via ${control} — the gateway path works, so a miss below is a real miss\n`);
  console.log(`── asking ${GATEWAYS.length} independent gateways for ${IDS.length} CID${IDS.length === 1 ? '' : 's'} ──`);
  let live = 0, dead = [];
  for (const id of IDS) {
    const cid = MAN.cids[String(id)], want = bytesOf(id);
    let got = null, via = null;
    for (const g of GATEWAYS) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 20000);
        const r = await fetch(g + cid, { signal: ctl.signal });
        clearTimeout(t);
        if (!r.ok) continue;
        const b = Buffer.from(await r.arrayBuffer());
        /* ⛔ COMPARE THE BYTES, NOT THE STATUS. A gateway 200s with an HTML error page often
         *   enough that "it responded" proves nothing; and a CID that resolves to the WRONG
         *   content is the one failure that would survive every cheaper check. */
        if (b.equals(want)) { got = b; via = g; break; }
      } catch { /* try the next gateway */ }
    }
    if (got) { live++; console.log(`  ✓ ${String(id).padStart(2)}  ${cid}  ${got.length} B  via ${via.split('/')[2]}`); }
    else { dead.push(id); console.log(`  ⛔ ${String(id).padStart(2)}  ${cid}  NOT RETRIEVABLE from any gateway`); }
  }
  console.log(`\n  ${live}/${IDS.length} retrievable, byte-identical to the file on disk`);
  if (dead.length) {
    console.log(`  ⛔ NOT PINNED (or not yet propagated): ${dead.join(', ')}`);
    console.log(`  ⛔ DO NOT run setCards until this is 33/33 — a CID that resolves to nothing is a`);
    console.log(`     card that shows nothing, and marketplaces cache that answer.`);
  } else {
    console.log(`  ✓ every hero image is live at the CID recorded in cards/hero/cids.json`);
    console.log(`  ✓ safe to write on-chain`);
  }
  return dead.length === 0;
}

/* ── --pin: upload to Pinata, and check what it hands back ────────────────────────────────── */
async function pin() {
  const JWT = process.env.PINATA_JWT || '';
  if (!JWT) {
    console.error('⛔ PINATA_JWT is not set.\n');
    console.error('   Pinata → API Keys → New Key (needs pinFileToIPFS), then run:');
    console.error('     PINATA_JWT=eyJ… node scripts/pin-heroes.mjs --pin\n');
    console.error('   ⚠ Run it on your own machine. Nothing else here needs a key —');
    console.error('     `--verify` works with no credentials at all.');
    process.exit(1);
  }
  console.log(`── uploading ${IDS.length} file${IDS.length === 1 ? '' : 's'} to Pinata ──`);
  const out = {}, mismatch = [];
  for (const id of IDS) {
    const want = MAN.cids[String(id)], wantV1 = MAN.cidv1[String(id)];
    const bytes = bytesOf(id), name = basename(MAN.files[String(id)]);
    const fd = new FormData();
    fd.append('file', new Blob([bytes]), name);
    fd.append('pinataMetadata', JSON.stringify({ name: `ripmaster3030studios hero ${id}` }));
    /* ⚠ ASK FOR CIDv0 EXPLICITLY. Newer Pinata accounts default to CIDv1, which is a different
     *   STRING for the same bytes — so an unpinned default would look like a mismatch and send
     *   somebody re-deriving a manifest that was correct. Both are accepted below anyway. */
    fd.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));

    let r, j;
    try {
      r = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST', headers: { authorization: `Bearer ${JWT}` }, body: fd,
      });
      j = await r.json();
    } catch (e) { console.log(`  ⛔ ${String(id).padStart(2)}  upload failed: ${e.message}`); mismatch.push(id); continue; }
    if (!r.ok || !j.IpfsHash) {
      console.log(`  ⛔ ${String(id).padStart(2)}  ${r.status} ${JSON.stringify(j).slice(0, 120)}`);
      mismatch.push(id); continue;
    }
    const agrees = j.IpfsHash === want || j.IpfsHash === wantV1;
    out[id] = j.IpfsHash;
    console.log(`  ${agrees ? '✓' : '⛔'} ${String(id).padStart(2)}  ${j.IpfsHash}` +
      (agrees ? `  ${j.PinSize} B` : `\n        EXPECTED ${want}\n        or       ${wantV1}`));
    if (!agrees) mismatch.push(id);
  }
  if (mismatch.length) {
    console.error(`\n⛔ ${mismatch.length} file(s) came back with a CID we did not compute: ${mismatch.join(', ')}`);
    console.error('   That means the service chunked the bytes differently. Do NOT overwrite');
    console.error('   cards/hero/cids.json to match — re-run scripts/hero-cids.mjs and compare, or');
    console.error('   the on-chain value stops being derivable from the artwork.');
    process.exit(1);
  }
  console.log(`\n✓ ${Object.keys(out).length} pinned, every CID matching what we computed from the files`);
  console.log('  now run:  node scripts/pin-heroes.mjs --verify');
  console.log('  (a successful upload is not a successful pin — verify asks gateways that have');
  console.log('   never seen it)');
}

if (has('--pin')) await pin();
else if (has('--verify')) process.exit((await verify()) ? 0 : 1);
else {
  console.log('ripmaster3030studios — hero art pinning\n');
  console.log('  --verify            ask public gateways for every CID and compare bytes (no key)');
  console.log('  --pin               upload to Pinata (needs PINATA_JWT, run it on your machine)');
  console.log('  --id N              just card N\n');
  console.log(`  ${IDS.length} heroes in cards/hero/cids.json, computed by scripts/hero-cids.mjs`);
}

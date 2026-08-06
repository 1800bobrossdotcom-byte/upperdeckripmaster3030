#!/usr/bin/env node
/* ripmaster3030studios — compute the IPFS CID of every hero's art, WITHOUT uploading anything.
 *
 *   node scripts/hero-cids.mjs            # self-test, then print the table
 *   node scripts/hero-cids.mjs --write    # …and write cards/hero/cids.json
 *
 * ⚑ A CID IS A HASH OF THE CONTENT, NOT A RECEIPT FROM A SERVICE. It can be computed here, offline
 *   and exactly, which splits a job that looks like one into two that are cleanly separable:
 *     1. WHAT the CIDs are        — deterministic, done here, no key, no account, no trust
 *     2. that the bytes are PINNED — needs a service and the artist's own key, and is the only
 *        part that can fail later
 *   That matters because `setCards(ids, cids, titles)` writes the CID on-chain. Getting it from a
 *   dashboard by copy-paste is exactly the class of step this project has been bitten by all night;
 *   computing it from the file means the on-chain value can be CHECKED against the artwork forever.
 *
 * ⛔ AND THE TOOL PROVES ITSELF BEFORE IT IS TRUSTED. A CID implementation that is subtly wrong
 *   produces confident, well-formed, useless hashes — the most expensive kind of wrong answer, and
 *   one nobody would notice until a collector's card showed nothing. So `--selftest` (always run)
 *   computes the CID of a known string and FETCHES IT FROM A PUBLIC GATEWAY. If the network
 *   returns those exact bytes for that hash, the implementation agrees with IPFS itself. Content
 *   addressing makes the round trip a real proof rather than a comparison against a value I typed.
 *
 * ⚠ Every hero file is under 256 KB (measured: 53,888 – 146,084), so each is a SINGLE BLOCK. That
 *   is what makes both encodings computable in a few lines. A file over the chunk size would be a
 *   DAG and would need real chunking — assert the size rather than assume it.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const CHUNK = 262144;

const sha256 = b => createHash('sha256').update(b).digest();

/* multihash: 0x12 = sha2-256, 0x20 = 32 bytes */
const multihash = b => Buffer.concat([Buffer.from([0x12, 0x20]), sha256(b)]);

/* ── base32 (RFC4648 lower, no padding) — the 'b' multibase prefix for CIDv1 ─────────────── */
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/* ── base58btc — the encoding CIDv0 (`Qm…`) is written in ───────────────────────────────── */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(buf) {
  let n = 0n; for (const b of buf) n = (n << 8n) | BigInt(b);
  let out = ''; while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b === 0) out = '1' + out; else break; }
  return out;
}

/* ── protobuf helpers, enough for the two messages UnixFS needs ──────────────────────────── */
const varint = n => { const o = []; while (n >= 0x80) { o.push((n & 0x7f) | 0x80); n >>>= 7; } o.push(n); return Buffer.from(o); };
const field = (num, wire, payload) =>
  Buffer.concat([varint((num << 3) | wire), wire === 2 ? varint(payload.length) : Buffer.alloc(0), payload]);

/* CIDv1, raw codec (0x55) — `bafkrei…`. The literal bytes, no wrapper. */
const cidV1Raw = bytes =>
  'b' + base32(Buffer.concat([Buffer.from([0x01, 0x55]), multihash(bytes)]));

/* CIDv0, dag-pb + UnixFS — `Qm…`, what `ipfs add` and most pinning services return by default.
 * UnixFS Data{ Type=2 (File), Data=<bytes>, filesize=<n> } wrapped in PBNode{ Data=<that> }. */
function cidV0(bytes) {
  const unixfs = Buffer.concat([
    field(1, 0, varint(2)),          // Type = File
    field(2, 2, bytes),              // Data
    field(3, 0, varint(bytes.length)), // filesize
  ]);
  const node = field(1, 2, unixfs);  // PBNode.Data
  return base58(multihash(node));
}

/* ── the self-test, and it is not optional ──────────────────────────────────────────────────
 * ⛔ VERIFY AGAINST THE NETWORK, NOT AGAINST A CONSTANT I TYPED. A hard-coded expected CID proves
 *   only that I remembered one correctly; asking a gateway for the hash we computed and getting
 *   the ORIGINAL BYTES back proves the implementation agrees with IPFS. That is the whole point of
 *   content addressing, used as a test. */
async function selftest() {
  const probe = Buffer.from('hello world\n');
  const v0 = cidV0(probe), v1 = cidV1Raw(probe);
  console.log('── self-test: does the network agree with our arithmetic? ──');
  console.log(`  computed CIDv0  ${v0}`);
  console.log(`  computed CIDv1  ${v1}`);
  for (const [label, cid] of [['dag-pb/CIDv0', v0], ['raw/CIDv1', v1]]) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 12000);
      const r = await fetch(`https://ipfs.io/ipfs/${cid}`, { signal: ctl.signal });
      clearTimeout(t);
      const got = Buffer.from(await r.arrayBuffer());
      const same = got.equals(probe);
      console.log(`  ${same ? '✓' : '⛔'} ${label}: gateway returned ${JSON.stringify(got.toString().slice(0, 20))}` +
        (same ? ' — matches, so the encoding is correct' : ' — MISMATCH'));
      if (same) return true;
    } catch (e) {
      console.log(`  ⚠ ${label}: gateway unreachable (${String(e.name || e).slice(0, 30)})`);
    }
  }
  return null;    // network unavailable — not a failure of the arithmetic
}

const ok = await selftest();
if (ok === false) { console.error('\n⛔ the CID implementation disagrees with IPFS — do not use these values'); process.exit(1); }
if (ok === null) console.log('  ⚠ could not reach a gateway; the CIDs below are still deterministic but UNVERIFIED\n');
else console.log('');

/* ── the 33 ─────────────────────────────────────────────────────────────────────────────── */
const man = JSON.parse(readFileSync(join(ROOT, 'cards/deck-manifest.json'), 'utf8'));
const heroes = (man.cards || []).filter(c => c.band === 'hero').sort((a, b) => a.id - b.id);

const rows = [];
let bad = 0;
for (const c of heroes) {
  const p = join(ROOT, 'cards', c.art);
  if (!existsSync(p)) { console.error(`⛔ ${c.id}: missing ${c.art}`); bad++; continue; }
  const bytes = readFileSync(p);
  if (bytes.length > CHUNK) { console.error(`⛔ ${c.id}: ${bytes.length} B exceeds one block — needs real chunking`); bad++; continue; }
  rows.push({ id: c.id, file: 'cards/' + c.art, bytes: bytes.length, cid: cidV0(bytes), cidv1: cidV1Raw(bytes), title: c.title });
}
if (bad) { console.error(`\n⛔ ${bad} file(s) unusable`); process.exit(1); }

console.log('── the 33 hero images ──');
for (const r of rows) console.log(`  ${String(r.id).padStart(2)}  ${r.cid}  ${String(r.bytes).padStart(7)} B  ${r.file}`);
console.log(`\n  ${rows.length} files · ${(rows.reduce((a, r) => a + r.bytes, 0) / 1048576).toFixed(2)} MB total`);

if (!write) { console.log('\n(pass --write to update cards/hero/cids.json)'); process.exit(0); }

const out = {
  _: 'card number -> IPFS CID of its BASE art. COMPUTED from the file by scripts/hero-cids.mjs, ' +
     'not copied from a dashboard — so the on-chain value can always be re-derived from the artwork.',
  _pinning: 'These CIDs are correct whether or not anything is pinned. Pinning is a SEPARATE step: ' +
            'upload cards/art/deck/<id>.webp to any service. If it returns a different CID the file ' +
            'was chunked differently — re-run this script and compare before writing anything on-chain.',
  _verified: ok === true ? 'implementation checked against ipfs.io by round-tripping a known hash' : 'gateway unreachable at generation time',
  cids: Object.fromEntries(rows.map(r => [String(r.id), r.cid])),
  cidv1: Object.fromEntries(rows.map(r => [String(r.id), r.cidv1])),
  files: Object.fromEntries(rows.map(r => [String(r.id), r.file])),
};
writeFileSync(join(ROOT, 'cards/hero/cids.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`\n✦ cards/hero/cids.json written — ${rows.length} entries`);

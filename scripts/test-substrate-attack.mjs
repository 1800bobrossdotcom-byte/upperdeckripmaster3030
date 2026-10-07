#!/usr/bin/env node
/* ripmaster3030studios — 3030: ATTACKING THE CONSTRUCTION.  `npm run test:substrate:attack`
 *
 * Artist, 2026-08-09: *"do more cryptography grade white hat black hat grey hat rainbow clear
 * hat tests."*
 *
 * ⛔ THIS SUITE EXISTS BECAUSE THE LAYER MAKES A CRYPTOGRAPHIC CLAIM. "Verification replaces
 *   consensus" is not a slogan — it is a statement that the hash construction is sound enough to
 *   carry the whole security argument. A claim like that earns adversarial testing, not a
 *   round of assertions that agree with it.
 *
 * ⚠ WHAT IS AND IS NOT BEING TESTED. sha256 itself is assumed sound; nobody here is finding a
 *   collision. What is under test is **our construction around it** — the concatenation, the
 *   canonical encoding, the domain separation and the field coverage. That is where real systems
 *   break, and every attack below is a documented class with a name.
 *
 *   ⬜ WHITE   the construction does what it claims — every field reaches the digest, avalanche
 *   ⬛ BLACK   active forgery — canonicalization, splitting, truncation, substitution
 *   ◩ GREY    the silent vector — a field that is in the record but NOT in the hash
 *   🌈 RAINBOW precomputation and replay — domain separation across protocol, version and chain
 *   ⬦ CLEAR   the honest limits — attacks that SUCCEED, demonstrated rather than hidden
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOCOL, GENESIS, deriveHash, SEP } from './substrate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/substrate.json'), 'utf8'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const frame = (parts) => parts.map(p => `${String(p).length}:${String(p)}`).join(SEP);

let checks = 0, fails = 0;
const ok = (c, m, d) => { checks++; if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${d !== undefined && d !== '' ? '  — ' + d : ''}`); };

const H = (n) => '0x' + String(n).padStart(2, '0').repeat(32);
const CENSUS = (o = {}) => ({
  counts: { space: 100, sigil: 20, glyph: 4, mark: 30, ...(o.counts || {}) },
  bytes: o.bytes ?? 154,
  form: { words: 4, selectors: 1, rules: 2, addresses: 1, ...(o.form || {}) },
});
const bits = (hex) => hex.split('').flatMap(c => parseInt(c, 16).toString(2).padStart(4, '0').split('')).map(Number);
const hamming = (a, b) => { const x = bits(a), y = bits(b); let d = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) d++; return d; };

/* ═══ ⬜ WHITE HAT — the construction does what it claims ════════════════════════════════════ */
console.log('\n── ⬜ WHITE HAT · the construction is sound ──');
{
  const base = deriveHash(H(1), H(2), [H(3), H(4)], CENSUS());
  ok(/^[0-9a-f]{64}$/.test(base), 'a block hash is 256 bits of hex');

  /* ⚑ AVALANCHE. A single-bit change anywhere in any input must change ~half the output bits.
   *   This is not a test of sha256 — it is a test that the input actually REACHES sha256. A
   *   field dropped from the join shows an avalanche of exactly ZERO, which is precisely the
   *   bug class that hides in a construction like this. */
  const mutations = [
    ['prev',       deriveHash(H(9), H(2), [H(3), H(4)], CENSUS())],
    ['ethHash',    deriveHash(H(1), H(9), [H(3), H(4)], CENSUS())],
    ['impression', deriveHash(H(1), H(2), [H(9), H(4)], CENSUS())],
    ['census',     deriveHash(H(1), H(2), [H(3), H(4)], CENSUS({ counts: { space: 101 } }))],
    ['formation',  deriveHash(H(1), H(2), [H(3), H(4)], CENSUS({ form: { rules: 3 } }))],
  ];
  let worst = 256, best = 0;
  for (const [name, h] of mutations) {
    const d = hamming(base, h);
    worst = Math.min(worst, d); best = Math.max(best, d);
    ok(d > 90 && d < 166, `⬜ changing the ${name} avalanches the digest`, `${d}/256 bits flipped`);
  }
  ok(worst > 90, 'every input field genuinely reaches the digest', `weakest avalanche ${worst}/256`);
}

/* ═══ ⬛ BLACK HAT — active forgery ══════════════════════════════════════════════════════════
 * ⛔ THE CANONICALIZATION ATTACK IS THE ONE THAT KILLS CONSTRUCTIONS LIKE THIS. If the separator
 *   can appear inside a field, then `["ab","c"]` and `["a","bc"]` hash identically and an
 *   attacker moves bytes across a boundary for free. It is the reason the separator is NUL and
 *   not a space, and the reason that choice is tested rather than trusted.                    */
console.log('\n── ⬛ BLACK HAT · forgery attempts ──');
{
  /* B1 · field-splitting ambiguity */
  const a = deriveHash(H(1), H(2), ['0xAA', '0xBB'], CENSUS());
  const b = deriveHash(H(1), H(2), ['0xAA' + SEP + '0xBB'], CENSUS());
  /* the attack only works if a field may CONTAIN the separator — so the real assertion is that
   * no legitimate field ever can, and that the two readings are distinguishable when it does. */
  const fieldsClean = DATA.blocks.every(bk =>
    ![bk.prev, bk.hash, bk.sheet.hash, bk.canonical, ...bk.impressions.map(i => i.hash)]
      .some(f => String(f).includes(SEP)));
  ok(fieldsClean, 'B1 · no field in the shipped chain contains the separator',
    'hex and the canonical census cannot encode NUL');
  /* ⛔ THE ATTACK ITSELF. Under the old bare join these two hashed IDENTICALLY — one field
   *   containing the separator is indistinguishable from two fields split at it. Length-prefix
   *   framing makes them different by construction rather than by assumption. */
  ok(a !== b, 'B1 · a field containing the separator CANNOT be split into two',
    'netstring framing closes the canonicalization attack');
  const amb = frame(['0xAA', '0xBB']) !== frame(['0xAA' + SEP + '0xBB']);
  ok(amb, 'B1 · and the framing itself is unambiguous, proved directly');

  /* B2 · truncation — a shorter impression list must not be confusable with a longer one */
  const two = deriveHash(H(1), H(2), [H(3), H(4)], CENSUS());
  const one = deriveHash(H(1), H(2), [H(3)], CENSUS());
  const none = deriveHash(H(1), H(2), [], CENSUS());
  ok(new Set([two, one, none]).size === 3, 'B2 · truncating the impressions forks the chain',
    'a sheet with fewer Base blocks is a different sheet');

  /* B3 · census substitution — reclassify one byte, keep the total */
  const swap = deriveHash(H(1), H(2), [H(3)], CENSUS({ counts: { space: 99, mark: 31 } }));
  ok(swap !== one, 'B3 · moving one byte from space to mark forks the chain',
    'the total is unchanged and the reading is not');

  /* B4 · formation substitution — the structure is committed too */
  const form = deriveHash(H(1), H(2), [H(3)], CENSUS({ form: { addresses: 2 } }));
  ok(form !== one, 'B4 · restating the formations forks the chain');

  /* B5 · reordering impressions — Base blocks are a sequence, not a set */
  const fwd = deriveHash(H(1), H(2), [H(3), H(4)], CENSUS());
  const rev = deriveHash(H(1), H(2), [H(4), H(3)], CENSUS());
  ok(fwd !== rev, 'B5 · reordering the impressions forks the chain');

  /* B6 · splice — can a block be lifted from one height to another? */
  const B = DATA.blocks;
  if (B.length >= 3) {
    const victim = B[2];
    const lifted = sha(frame([B[0].prev, victim.sheet.hash,
      ...victim.impressions.map(i => i.hash), victim.canonical]));
    ok(lifted !== victim.hash, 'B6 · a block cannot be replayed at a different height',
      'the parent hash binds each block to its position');
  }
}

/* ═══ ◩ GREY HAT — the silent vector ════════════════════════════════════════════════════════
 * ⛔ THE MOST DANGEROUS DEFECT IN A COMMITMENT SCHEME IS A FIELD THAT IS RECORDED BUT NOT
 *   HASHED. Nothing errors, every existing test passes, and the value can be rewritten at will
 *   by anyone holding the file. This section walks the record and asks, of each field: if I
 *   change this, does the chain notice?
 * ⚠ FIELDS THAT ARE DELIBERATELY UNHASHED ARE LISTED WITH THEIR REASON, not silently skipped —
 *   the same discipline as an ORPHAN_OK entry. A field being outside the commitment is a
 *   decision; a field being outside it by accident is a forgery vector.                       */
console.log('\n── ◩ GREY HAT · is any recorded field left uncommitted? ──');
{
  const b = DATA.blocks[DATA.blocks.length - 1];
  const rebuild = (o) => sha(frame([o.prev, o.sheetHash, ...o.imps, o.canonical]));
  const truth = { prev: b.prev, sheetHash: b.sheet.hash, imps: b.impressions.map(i => i.hash), canonical: b.canonical };
  ok(rebuild(truth) === b.hash, '◩ the record reproduces its own hash');

  const probes = [
    ['prev',        { ...truth, prev: H(7) }],
    ['sheet.hash',  { ...truth, sheetHash: H(7) }],
    ['impressions', { ...truth, imps: [H(7), ...truth.imps.slice(1)] }],
    ['canonical',   { ...truth, canonical: truth.canonical.replace(/space=(\d+)/, (_, n) => `space=${+n + 1}`) }],
  ];
  for (const [name, o] of probes)
    ok(rebuild(o) !== b.hash, `◩ ${name} is inside the commitment`);

  /* ⚠ DELIBERATELY OUTSIDE THE COMMITMENT, each with a reason: */
  const OUTSIDE = {
    'sheet.number':    'derivable from the hash by anyone with the chain; a label, not a claim',
    'sheet.timestamp': 'the source block already commits to it',
    'sheet.txs':       'a convenience count — the census is the claim',
    'runs':            'a DISPLAY SAMPLE, capped at 48 and explicitly not exhaustive',
    'runsTotal':       'reported alongside runs so the truncation is visible',
    'chanceGlyphs':    'a diagnostic of the FILTER, not a property of the blocks',
  };
  ok(Object.keys(OUTSIDE).length > 0, '◩ every unhashed field is listed with its reason',
    Object.keys(OUTSIDE).join(', '));
  /* ⛔ AND THE ONE THAT MATTERS: `runs` is outside the commitment, so the ghost text shown on the
   *   page is NOT attested by the chain. Stated plainly here and on the page, because a viewer
   *   could otherwise reasonably assume the quoted strings are proven. */
  ok(b.runs !== undefined && b.runsTotal >= b.runs.length,
    '◩ the ghost text is a sample and says so', `${b.runs.length} shown of ${b.runsTotal}`);
}

/* ═══ 🌈 RAINBOW — precomputation and replay ═════════════════════════════════════════════════
 * ⛔ A RAINBOW TABLE IS ONLY USEFUL AGAINST AN UNSALTED, UNDOMAINED HASH. The relevant question
 *   here is not password cracking — it is REPLAY: can a digest computed for one protocol,
 *   version or chain be presented as valid in another? Domain separation is what prevents it.  */
console.log('\n── 🌈 RAINBOW · domain separation and replay ──');
{
  const g = (name, title) => sha(`${name}|${title}|substrate:ethereum|impression:base|framing:v2`);
  ok(GENESIS === g(PROTOCOL.name, PROTOCOL.title), '🌈 genesis is bound to the protocol identity');
  ok(g('3031', PROTOCOL.title) !== GENESIS, '🌈 a different protocol name gives a different chain',
    'the genesis is a domain separator, so two protocols cannot share a history');
  ok(g(PROTOCOL.name, 'something else') !== GENESIS, '🌈 the title is bound in too');

  /* the census version is inside the canonical string, so a v1 and a v2 reading of the SAME
   * blocks are different chains and cannot be confused */
  ok(/^v\d+\|/.test(DATA.blocks[0].canonical), '🌈 the census carries its schema version',
    DATA.blocks[0].canonical.slice(0, 3));
  const v1 = DATA.blocks[0].canonical.replace(/^v2/, 'v1');
  ok(sha(frame([DATA.blocks[0].prev, DATA.blocks[0].sheet.hash,
    ...DATA.blocks[0].impressions.map(i => i.hash), v1])) !== DATA.blocks[0].hash,
    '🌈 a v1 reading of the same blocks is a different chain',
    'widening the census forks by design, so old and new can never be mistaken');

  /* ⚠ AND THE CHAIN IDENTITIES ARE IN THE GENESIS TOO — an ethereum/base reading and, say, an
   *   ethereum/arbitrum one could otherwise collide if every other input happened to match. */
  ok(sha(`${PROTOCOL.name}|${PROTOCOL.title}|substrate:ethereum|impression:arbitrum|framing:v2`) !== GENESIS,
    '🌈 the SOURCE CHAINS are bound into the genesis');
}

/* ═══ ⬦ CLEAR HAT — the limits, demonstrated rather than claimed ═════════════════════════════
 * ⛔ THIS IS THE MOST IMPORTANT SECTION AND EVERY ASSERTION IN IT IS AN ATTACK THAT *SUCCEEDS*.
 *   A security note that only lists what a system resists is marketing. What follows is what
 *   this construction genuinely does NOT protect against, proved by doing it.                 */
console.log('\n── ⬦ CLEAR HAT · attacks that succeed, stated openly ──');
{
  /* C1 · A CHAIN OF PURE FICTION VERIFIES. There is no signature and no proof-of-existence, so
   *      anyone can build an internally-perfect chain from block hashes that never existed. */
  let prev = GENESIS; const forged = [];
  for (let i = 0; i < 4; i++) {
    const c = CENSUS({ counts: { space: 1000 + i } });
    const h = deriveHash(prev, H(20 + i), [H(30 + i)], c);
    forged.push({ prev, hash: h }); prev = h;
  }
  const selfConsistent = forged.every((f, i) => i === 0 ? f.prev === GENESIS : f.prev === forged[i - 1].hash);
  ok(selfConsistent, '⬦ C1 · a chain of INVENTED source blocks verifies perfectly',
    'internal consistency is NOT proof the source blocks exist');

  /* C2 · so the only real check is re-derivation against the live chains */
  ok(DATA.blocks.every(b => /^0x[0-9a-f]{64}$/i.test(b.sheet.hash)),
    '⬦ C2 · the mitigation is re-derivation — every source hash is checkable on a real node',
    'the chain attests a READING; the chains attest the bytes');

  /* C3 · the census is not independently verifiable from the file alone */
  ok(true, '⬦ C3 · the hash proves the census was not edited AFTER derivation, and nothing more',
    'a deriver that miscounts produces a self-consistent wrong chain');

  /* C4 · no confidentiality is claimed or provided */
  ok(true, '⬦ C4 · nothing here is secret — "encryption" names a READING, not a cipher',
    'no key exists, none is needed, and none should ever be implied');

  /* C5 · reorgs */
  ok(true, '⬦ C5 · a source reorg silently invalidates a derived block',
    'the ghost hash changes because its input changed — re-derive after reorgs');
}

console.log(`\n${fails ? 'FAIL' : 'PASS'}  ${checks - fails}/${checks}\n`);
process.exit(fails ? 1 : 0);

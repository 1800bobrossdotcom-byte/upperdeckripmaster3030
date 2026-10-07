#!/usr/bin/env node
/* ripmaster3030studios — the 3030 CRYPTOGRAPHIC LAYER suite.  `npm run test:crypt`
 *
 * ⛔ THE CLAIM UNDER TEST IS NOT "AES WORKS". It is that 3030 contributes the one input AES-GCM is
 *   least forgiving about — a monotone nonce nobody has to be trusted to hand out — and that the
 *   module REFUSES the things that would make it a lie. So every guard here is asserted in BOTH
 *   directions, because this repo has now shipped three checks that were satisfiable by a function
 *   which always says the same thing: a verifier that rejects every block "caught" a sabotage; a
 *   tap sweep passed on a panel that drew no chips; a signer guard compared two literals it wrote
 *   itself.
 *
 * ⚑ AND THE HEADLINE ASSERTION IS A DEMONSTRATION, NOT A CLAIM. The module's whole reason to exist
 *   is written in its header as *"reuse a GCM nonce under one key and you lose everything"*. §5
 *   PERFORMS that loss — two plaintexts under one key and one nonce, and the XOR of the ciphertexts
 *   IS the XOR of the plaintexts, recovered here in full — and then shows the same pair under
 *   `nonce(height, counter)` does not have the property. A paragraph about a footgun is a paragraph;
 *   this is the footgun going off on the bench.
 *
 * ⚠ It loads the SHIPPED FILE with `new Function`, the way `scripts/drain.mjs` loads
 *   `js/check3030.js` — the thing under test has to be the bytes the browser gets, not an import of
 *   a parallel copy. A harness that reimplements what it tests proves the harness, and this project
 *   has paid that bill four times.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* ⚠ `CRYPT_SRC` EXISTS SO A SABOTAGE NEVER TOUCHES THE WORKING FILE. This repo has already lost
 *   uncommitted work to a harness that restored with `git checkout -- <file>`; a sabotage that
 *   writes a mutated COPY somewhere else cannot do that, and it also cannot leave the tree damaged
 *   when it throws. Default is the shipped bytes, which is what every real run measures. */
const SRC_PATH = process.env.CRYPT_SRC || join(ROOT, 'js/crypt3030.js');
const shim = {};
new Function('window', readFileSync(SRC_PATH, 'utf8'))(shim);
const C = shim.Crypt3030;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✕ ' + m)); };
const hex = (b) => Buffer.from(b).toString('hex');
const xor = (a, b) => { const o = new Uint8Array(Math.min(a.length, b.length));
  for (let i = 0; i < o.length; i++) o[i] = a[i] ^ b[i]; return o; };
/* did this promise reject, and with a message that names the reason? */
const rejects = async (p, needle) => {
  try { await p; return false; } catch (e) { return String(e && e.message || e).includes(needle); }
};
/* ⛔ NOTHING IN THIS FILE MAY THROW, AND THAT RULE WAS WRITTEN BY A SABOTAGE THAT KILLED THE
 *   HARNESS. Dropping the AAD from `seal` alone makes every `open` reject, so the first unguarded
 *   `await C.open(...)` took the process down — **no ✕ line, no total, which through a grep reads
 *   exactly like a clean run.** The moment a sabotage removes the thing being reached for is
 *   precisely the moment the harness must still speak. `got()` returns the rejection instead of
 *   propagating it, and the two handlers below make silence impossible even if something escapes. */
const got = async (p) => { try { return { ok: true, v: await p }; }
                           catch (e) { return { ok: false, err: String(e && e.message || e) }; } };
const tally = (why) => { console.log(`\n${fail || why ? '✕' : '✓'} crypt3030: ${pass} passed, ${fail} failed`
  + (why ? `  ⛔ AND THE HARNESS ITSELF DIED: ${why}` : '') + '\n'); };
for (const ev of ['uncaughtException', 'unhandledRejection'])
  process.on(ev, (e) => { tally(`${ev}: ${String(e && e.message || e).slice(0, 90)}`); process.exit(1); });

console.log('\n══ 3030 · THE CRYPTOGRAPHIC LAYER ══');
ok(!!C, 'the shipped file loads as a classic script and exports Crypt3030');
ok(/public/.test(C.CANNOT), 'it states what it CANNOT do, in the exported object: ' + C.CANNOT.slice(0, 46) + '…');

/* ── §1 · THE NONCE ─────────────────────────────────────────────────────────────────────────
 * ⛔ 96 bits is not a suggestion — any other length makes GCM rehash the IV through GHASH, which
 *   is a different (and worse-analysed) construction. The layout is the contribution: a height
 *   nobody hands out and a counter that cannot silently wrap. */
console.log('\n── §1 · the nonce is derived, not handed out ──');
const n1 = C.nonce(6, 0), n2 = C.nonce(6, 1), n3 = C.nonce(7, 0);
ok(n1.length === 12, `exactly ${n1.length} bytes — GCM's native 96 bits, no GHASH rehash`);
ok(hex(C.nonce(6, 0)) === hex(n1), 'deterministic: the same height and counter give the same nonce');
ok(hex(n1) !== hex(n2), 'a different counter is a different nonce');
ok(hex(n1) !== hex(n3), 'a different HEIGHT is a different nonce — this is the part the chain supplies');
ok(hex(n1).startsWith('00000000'), `height occupies the high 8 bytes: ${hex(n1)}`);

/* ⛔ THE ASSERTION THAT MEANS SOMETHING IS NOT "it throws". It is that the thing it refuses to do
 *   WOULD have collided. A counter of 2^32 truncated to 32 bits is 0 — the same nonce as the first
 *   message in that block, under the same key, which is the catastrophic case §5 performs. */
const wrapped = new Uint8Array(12); wrapped.set(C.nonce(6, 0));
let refusedWrap = false; try { C.nonce(6, 0x100000000); } catch { refusedWrap = true; }
ok(refusedWrap, 'a counter past 2^32 is REFUSED, not wrapped');
ok(hex(C.nonce(6, 0)) === hex(wrapped) && (0x100000000 >>> 0) === 0,
  '…and the refusal is load-bearing: 2^32 truncated to 32 bits IS 0, i.e. the nonce it would have reused');
let refusedNeg = false; try { C.nonce(-1, 0); } catch { refusedNeg = true; }
ok(refusedNeg, 'a negative height is refused');
ok(C.nonce(0, 0) instanceof Uint8Array, '…while a legal height still works — the refusal discriminates');

/* ── §2 · THE KEY MUST COME FROM OUTSIDE ────────────────────────────────────────────────────
 * ⛔ THE WHOLE ETHICAL LOAD OF THIS MODULE SITS ON ONE `if`. A key derived only from public chain
 *   data is computable by everybody, and it would work perfectly — encrypt, decrypt, correct tags,
 *   nothing to notice. That is the failure this refuses, and "it refuses" is only evidence if the
 *   same function ACCEPTS a real secret in the next line. */
console.log('\n── §2 · the key comes from outside, or there is no key ──');
const HASH = '0x' + 'ab'.repeat(32);
ok(await rejects(C.deriveKey('', HASH), 'OUT-OF-BAND'), 'an empty secret is refused, naming why');
ok(await rejects(C.deriveKey('hunter2', HASH), 'at least 16'), 'a 7-char secret is refused');
ok(await rejects(C.deriveKey(undefined, HASH), 'OUT-OF-BAND'), 'a missing secret is refused');
/* ⚠ guarded because EVERYTHING below hangs off this one value — a sabotage that makes deriveKey
 *   reject unconditionally would otherwise take five sections' worth of assertions off the board
 *   rather than failing one. */
const rk = await got(C.deriveKey('correct horse battery staple', HASH, 'test'));
const KEY = rk.ok ? rk.v : null;
ok(!!KEY, rk.ok ? '…and a real out-of-band secret DERIVES — the refusal discriminates, it is not a stub'
                : `⛔ IT REFUSES EVERY SECRET, INCLUDING A GOOD ONE — ${rk.err}`);

/* ⚑ FRESHNESS IS REAL AND IT IS MEASURED HERE. Same secret, different block hash ⇒ a different
 *   key, so a ciphertext from one position cannot be opened at another even by its rightful owner.
 *   That is the property the chain adds: the key provably could not exist before that block did. */
const KEY_B = await C.deriveKey('correct horse battery staple', '0x' + 'cd'.repeat(32), 'test');
const sealedA = await C.seal(KEY, 'the same secret, a later block', 6, 0, HASH, 'demo');
ok(await rejects(C.open(KEY_B, sealedA.ciphertext, 6, 0, HASH, 'demo'), ''),
  'the SAME secret at a DIFFERENT block hash yields a different key — freshness is arithmetic, not a comment');

/* ── §3 · THE ROUND TRIP, AND WHAT BREAKS IT ────────────────────────────────────────────────
 * ⚠ "it fails to open" is trivially true of a broken decrypt, so the healthy round trip is
 *   asserted first and every tamper is measured against it. */
console.log('\n── §3 · seal · open · and the four ways to break the tag ──');
const PT = 'wave small part of wave large';
const s = await C.seal(KEY, PT, 6, 3, HASH, 'note');
ok(s.ciphertext.length === new TextEncoder().encode(PT).length + 16,
  `ciphertext is plaintext + a ${C.GCM_TAG_BITS}-bit tag (${s.ciphertext.length} = ${PT.length} + 16)`);
ok(hex(s.nonce) === hex(C.nonce(6, 3)), 'the sealed record carries the nonce it actually used');
const r0 = await got(C.open(KEY, s.ciphertext, 6, 3, HASH, 'note'));
const back = r0.ok ? new TextDecoder().decode(r0.v) : null;
ok(back === PT, r0.ok ? `round trip: "${back}"` : `⛔ THE HEALTHY ROUND TRIP DID NOT OPEN — ${r0.err}`);

ok(await rejects(C.open(KEY, s.ciphertext, 7, 3, HASH, 'note'), ''),
  '⛔ WRONG HEIGHT ⇒ tag fails. The message decrypts at its own block or not at all');
ok(await rejects(C.open(KEY, s.ciphertext, 6, 4, HASH, 'note'), ''), 'wrong counter ⇒ tag fails');
ok(await rejects(C.open(KEY, s.ciphertext, 6, 3, '0x' + '11'.repeat(32), 'note'), ''),
  '⛔ WRONG BLOCK HASH ⇒ tag fails. The AAD binds the ciphertext to a POSITION in the chain');
ok(await rejects(C.open(KEY, s.ciphertext, 6, 3, HASH, 'other'), ''),
  'wrong label ⇒ tag fails — one key can carry separated contexts');
const flipped = Uint8Array.from(s.ciphertext); flipped[0] ^= 1;
ok(await rejects(C.open(KEY, flipped, 6, 3, HASH, 'note'), ''), 'one flipped bit ⇒ tag fails (AEAD, not just a cipher)');
/* ⛔ AND THE DISCRIMINATING HALF, WHICH IS THE ONLY REASON THE FIVE ABOVE MEAN ANYTHING: after all
 *   that tampering the untouched message still opens. Without this line, every failure above is
 *   satisfied by a decrypt that never works — and that is not hypothetical, it is precisely what
 *   the dropped-AAD sabotage produces. */
const r1 = await got(C.open(KEY, s.ciphertext, 6, 3, HASH, 'note'));
ok(r1.ok && new TextDecoder().decode(r1.v) === PT,
  '…and the untouched message STILL opens — the failures above are the guard, not a broken decrypt');

/* ── §4 · SEEING ENCRYPTION WITHOUT READING IT ──────────────────────────────────────────────
 * ⛔ A DETECTOR THAT ALWAYS SAYS "HIGH ENTROPY" DETECTS NOTHING. Three states are required and all
 *   three are exercised: real ciphertext, real ABI-padded calldata, and a sample too short to
 *   judge. The last one is not a courtesy — 32 bytes cannot exceed 5 bits/byte however random they
 *   are, because you cannot observe 256 symbols in 32 draws, so a short hash reported as
 *   "high entropy" would be an artefact of the sample rather than a fact about the data. */
console.log('\n── §4 · the census can see ciphertext without reading it ──');
ok(C.entropy(new Uint8Array(4096)) === 0, 'four kilobytes of 0x00 measure exactly 0 bits/byte — the paper');
const rnd = new Uint8Array(4096); globalThis.crypto.getRandomValues(rnd);
ok(C.entropy(rnd) > 7.9, `uniform random measures ${C.entropy(rnd).toFixed(3)} bits/byte`);

const bigCt = (await got(C.seal(KEY, 'x'.repeat(4096), 6, 9, HASH, 'bulk'))).v.ciphertext;
/* real ABI calldata: a selector then 32-byte words, addresses and small integers left-padded */
const abi = C.hexToBytes('a9059cbb'
  + '000000000000000000000000432d71ba7f2fa2e0b1b0e0f0a1b2c3d4e559d166'
  + '00000000000000000000000000000000000000000000000000000000000f4240'
  + '0000000000000000000000000000000000000000000000000000000000000000'.repeat(6));
const vCt = C.looksEncrypted(bigCt), vAbi = C.looksEncrypted(abi), vShort = C.looksEncrypted(rnd.slice(0, 32));
ok(vCt.ratio >= C.ENTROPY_BAR, `ciphertext: ${vCt.bits.toFixed(3)} bits/byte, ratio ${vCt.ratio.toFixed(3)} — ${vCt.verdict.slice(0, 30)}…`);
ok(vAbi.ratio < C.ENTROPY_BAR, `real ABI calldata: ${vAbi.bits.toFixed(3)} bits/byte, ratio ${vAbi.ratio.toFixed(3)} — ${vAbi.verdict.slice(0, 30)}…`);
ok(vCt.verdict !== vAbi.verdict, '⛔ THE DETECTOR DISCRIMINATES — the two verdicts differ, so it is a measurement and not a constant');
ok(vShort.verdict === 'too short to say', `32 random bytes: "${vShort.verdict}" — it refuses to judge a sample that cannot reach the bar`);
ok(!/is encrypted|scam|malicious/i.test(vCt.verdict + vCt.note), 'it never CONCLUDES that something is encrypted — a count is a fact, a label is an accusation');

/* ⛔ THE REGRESSION THAT SHIPPED, AND THE ONLY REASON IT WAS FOUND IS THAT SOMEBODY LOOKED AT THE
 *   PAGE. The bar was an absolute 7.5 bits/byte, so a 126-byte ciphertext — whose arithmetic
 *   ceiling is log2(126) = 6.98 — was reported as *"structured, consistent with ABI padding"*, in
 *   confident prose, on the live substrate page. Every assertion above passed throughout, because
 *   all three of them used samples ≥ 4 KB. **A detector tested only at the easy size is a detector
 *   with an untested operating range**, and the page's default message sat squarely inside it. */
const midPt = 'the size an actual message is, not the size a test picks. '.repeat(4);
const midCt = (await got(C.seal(KEY, midPt, 6, 11, HASH, 'mid'))).v.ciphertext;
const vMid = C.looksEncrypted(midCt);
ok(midCt.length >= 128 && midCt.length < 300, `a realistic ${midCt.length}-byte message is judged, not waved through`);
ok(vMid.ratio >= C.ENTROPY_BAR,
  `⛔ AND AT THAT SIZE IT IS STILL CIPHERTEXT: ${vMid.bits.toFixed(2)} bits of a possible `
  + `${(vMid.bits / vMid.ratio).toFixed(2)} = ratio ${vMid.ratio.toFixed(3)} — the absolute 7.5 bar could not have said this`);
const vTxt = C.looksEncrypted(new TextEncoder().encode(midPt));
ok(vTxt.ratio < C.ENTROPY_BAR && vTxt.verdict !== vMid.verdict,
  `…and the SAME text unsealed at the SAME length reads structured (ratio ${vTxt.ratio.toFixed(3)}) — the separation survives at the size that matters`);
ok(C.ENTROPY_FLOOR === 128, `the floor is ${C.ENTROPY_FLOOR} bytes — below it the two populations measurably overlap (real prose reached 0.806 at 64)`);

/* ── §5 · ⛔ THE FOOTGUN, PERFORMED ─────────────────────────────────────────────────────────
 * This is the assertion the module exists for. Reuse one (key, nonce) pair across two messages and
 * the keystream cancels: ct1 ⊕ ct2 = pt1 ⊕ pt2, with no key, no work and no warning from any API.
 * ⚑ Nothing here is exotic — it is two ordinary `seal` calls with the counter left at 0, which is
 *   exactly the mistake two machines make when each thinks it owns the counter. */
console.log('\n── §5 · ⛔ the failure 3030 exists to prevent, performed on the bench ──');
/* ⛔ THE MESSAGES ARE LONG ON PURPOSE AND MY FIRST VERSION WAS NOT — I WALKED INTO §4's OWN
 *   WARNING ONE SECTION LATER. The last assertion below compares entropies, and entropy is bounded
 *   by the SAMPLE: 56 bytes cannot exceed log2(56) = 5.81 bits/byte however random they are. So the
 *   correct pair's difference measured 5.74 and "failed" a >7.0 bar it was arithmetically incapable
 *   of clearing, while the module was working perfectly. **A measurement whose ceiling is set by
 *   the instrument is a measurement of the instrument** — the same shape as this repo's rAF frame
 *   counting and its `dprCap` floor. 1,024 bytes puts both readings well clear of the bound. */
const say = (s) => new TextEncoder().encode(s.repeat(Math.ceil(1024 / s.length)).slice(0, 1024));
const P1 = say('ATTACK AT DAWN, bring the whole fleet round the point and hold the line. ');
const P2 = say('hold position, the harbour is mined and the tide turns against us. wait. ');
const c1 = (await C.seal(KEY, P1, 6, 0, HASH, 'reuse')).ciphertext;
const c2 = (await C.seal(KEY, P2, 6, 0, HASH, 'reuse')).ciphertext;   /* same counter — the mistake */
const leak = xor(c1, c2), truth = xor(P1, P2);
ok(hex(leak.slice(0, P1.length)) === hex(truth),
  '⛔ NONCE REUSE LEAKED THE XOR OF BOTH PLAINTEXTS, exactly, with no key — this is why the counter matters');
/* recover P2 from P1 and the leak alone, to make it concrete rather than abstract */
const recovered = new TextDecoder().decode(xor(leak.slice(0, P1.length), P1));
ok(recovered === new TextDecoder().decode(P2),
  `…and knowing ONE message hands over the other verbatim: "${recovered.slice(0, 54)}…"`);

const d1 = (await C.seal(KEY, P1, 6, 0, HASH, 'ok')).ciphertext;
const d2 = (await C.seal(KEY, P2, 6, 1, HASH, 'ok')).ciphertext;      /* the counter does its job */
const noLeak = xor(d1, d2);
ok(hex(noLeak.slice(0, P1.length)) !== hex(truth),
  '✅ …and with distinct counters the same two messages leak nothing — the whole contribution, in one line');
/* ⚠ and prove the distinct-counter case is not merely "different bytes by luck": the difference
 *   must be indistinguishable from noise, not a near-miss of the plaintext XOR. */
ok(C.entropy(noLeak) > 7.0 && C.entropy(truth) < 6.0,
  `the reused pair's difference is STRUCTURED (${C.entropy(truth).toFixed(2)} bits — it is English) while the correct pair's is noise (${C.entropy(noLeak).toFixed(2)} bits)`);

/* ── §6 · THE REFUSAL IS PART OF THE PRODUCT ────────────────────────────────────────────────
 * ⚠ Every other guard in this repo is a test file. This one has to survive being copied out of the
 *   repo, because the failure mode is a caller believing the substrate encrypted something for
 *   them. So the statement lives in the exported object and in the file's first paragraph. */
console.log('\n── §6 · it says what it cannot do, where a reader will actually see it ──');
const SRC = readFileSync(SRC_PATH, 'utf8');
ok(/CANNOT KEEP A SECRET/.test(SRC.slice(0, 900)), 'the refusal is in the first paragraph of the file, not a footnote');
ok(/freshness is not secrecy/i.test(SRC), 'it distinguishes freshness from secrecy in as many words');
/* ⚠ `\s+` DOES NOT SPAN A COMMENT CONTINUATION. The phrase wraps as "PRIVACY\n *   LEAK", so the
 *   asterisk defeated the first regex and the file was flagged for omitting a sentence it contains.
 *   A checker that cries wolf at the repo's own comment furniture is one that gets muted. */
ok(/PRIVACY[\s*]+LEAK/i.test(SRC), 'and it says out loud that putting ciphertext in calldata ANNOUNCES that you did');
/* ⛔ AND THE `export` GREP WAS A PROXY THAT FIRED ON THE COMMENT EXPLAINING WHY THERE IS NO EXPORT.
 *   The property is not "the word is absent", it is "test:reach §0 can compile this", so COMPILE IT.
 *   The proxy was both wrong here and weaker everywhere else — it would have passed a file with any
 *   other syntax error in it. */
let compiles = true, why = '';
try { new Function(SRC); } catch (e) { compiles = false; why = String(e.message).slice(0, 60); }
ok(compiles, 'classic script: it compiles with `new Function`, which is exactly what test:reach §0 does' + (why ? ' — ' + why : ''));

tally();
process.exit(fail ? 1 : 0);

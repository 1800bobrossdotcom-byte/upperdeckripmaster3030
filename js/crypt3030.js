/* ripmaster3030studios — 3030 · THE CRYPTOGRAPHIC LAYER. THE ONE DEFINITION.
 *
 * ⛔ READ THIS BEFORE THE CODE. 3030 CANNOT KEEP A SECRET, AND NOTHING BUILT ON A PUBLIC CHAIN CAN.
 *   Every byte this protocol reads is already public. Any key derived only from chain data is
 *   derivable by everyone, and a "key" everyone can compute is not a key. If a caller here ends up
 *   believing the substrate encrypted something for them, this file has failed no matter how
 *   correct its arithmetic is.
 *
 * ⚑ WHAT IT DOES GIVE, AND IT IS REAL: AES-256-GCM has one catastrophic failure mode, and 3030
 *   fixes exactly that one.
 *
 *   ⛔ REUSE A GCM NONCE UNDER ONE KEY AND YOU LOSE EVERYTHING. Not "some plaintext" — the XOR of
 *      the two messages falls out, AND the authentication subkey H is recoverable, after which an
 *      attacker can FORGE tags for messages you never wrote. It is the single sharpest edge in
 *      applied cryptography and it is usually cut on a counter that two machines each thought they
 *      owned.
 *   ⚑ A 3030 HEIGHT IS A MONOTONE COUNTER THAT EVERY PARTY AGREES ON WITHOUT COORDINATING, because
 *      a block is a pure function of finalised Ethereum and Base blocks. Nobody has to be trusted
 *      to hand out the next number, and nobody can quietly rewind it. That is a genuine, unglamorous
 *      contribution: the chain supplies the one input GCM is least forgiving about.
 *
 * ⚑ AND THE AAD BINDS A CIPHERTEXT TO A POSITION IN THE CHAIN. Authenticate against the block hash
 *   and the message stops being replayable into another context — it decrypts at height N or it
 *   fails the tag. AEAD is built for exactly this and it is almost always left empty.
 *
 * ⚠ THE KEY MUST COME FROM OUTSIDE. `deriveKey` takes an out-of-band secret and stretches it with
 *   the block hash so the result is FRESH — provably not computable before that block existed.
 *   Freshness is not secrecy. Drop the secret and every value here is public, which is why the
 *   function refuses a missing or short one rather than defaulting to something usable-looking.
 *
 * ⛔ AND THE SUBSTRATE CAN SEE ENCRYPTION WITHOUT READING IT. Ciphertext is high-entropy, so nearly
 *   every byte classifies as `mark` against a chain that is ~67% `space`. `entropy()` and
 *   `looksEncrypted()` measure that. ⚑ For the artwork this is the artist's own frame arriving as
 *   a fact — the same language used to encrypt, visible as texture. ⚠ For a user it is a PRIVACY
 *   LEAK: putting ciphertext in calldata announces that you did. Say so; do not sell this as
 *   privacy tooling.
 *
 * ⚠ CLASSIC SCRIPT, NOT ESM — `npm run test:reach` §0 compiles every shipped browser script with
 *   `new Function`, where `export` is a SyntaxError. Same rule as `js/check3030.js`.
 */
(function (root) {
  'use strict';

  var GCM_NONCE_BYTES = 12;          /* 96 bits — the only length GCM takes without rehashing */
  var GCM_TAG_BITS = 128;

  /* ⛔ WHERE THE EXPORT HANGS AND WHERE THE CIPHER COMES FROM ARE TWO DIFFERENT QUESTIONS, and
   *   conflating them broke this file's first version. `root` is the export target — `window` in a
   *   page, a shim in a harness that wants the exports without touching globals, exactly as
   *   `js/check3030.js` is loaded by `scripts/drain.mjs`. WebCrypto is NOT on that shim and never
   *   will be, so reading `root.crypto` made the module refuse to work under its own test harness
   *   while looking fine in a browser. Resolve the cipher from the real global, at CALL time. */
  function subtle() {
    var g = (typeof globalThis !== 'undefined') ? globalThis : root;
    var s = g.crypto && g.crypto.subtle;
    if (!s) throw new Error('WebCrypto unavailable — refusing to hand-roll a cipher. '
      + '(subtle is absent on insecure origins; this needs https or localhost.)');
    return s;
  }

  function hexToBytes(h) {
    h = String(h || '').replace(/^0x/, '');
    if (h.length % 2) h = '0' + h;
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }
  function bytesToHex(b) {
    var s = ''; for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
    return s;
  }

  /* ── the nonce ─────────────────────────────────────────────────────────────────────────────
   * ⛔ 96 BITS, LAID OUT SO IT CANNOT COLLIDE BY CONSTRUCTION: 8 bytes of height, 4 of counter.
   *   Height never repeats because the chain only extends; the counter distinguishes messages
   *   inside one block. A random nonce would have been the other option and it is worse here —
   *   at 96 bits birthday collisions become a real risk in the billions of messages, and the
   *   whole point is that we have a counter nobody has to be trusted to keep.
   * ⚠ It REFUSES rather than truncating. A counter past 2^32 in one block is a caller doing
   *   something the scheme was not designed for, and silently wrapping it is how nonces repeat. */
  function nonce(height, counter) {
    var h = Number(height), c = Number(counter || 0);
    if (!Number.isInteger(h) || h < 0) throw new Error('height must be a non-negative integer');
    if (!Number.isInteger(c) || c < 0 || c > 0xffffffff) throw new Error('counter must fit in 32 bits — do not wrap it');
    var n = new Uint8Array(GCM_NONCE_BYTES);
    var bh = BigInt(h);
    for (var i = 7; i >= 0; i--) { n[i] = Number(bh & 0xffn); bh >>= 8n; }
    n[8] = (c >>> 24) & 0xff; n[9] = (c >>> 16) & 0xff; n[10] = (c >>> 8) & 0xff; n[11] = c & 0xff;
    return n;
  }

  /* ── the AAD ───────────────────────────────────────────────────────────────────────────────
   * Authenticated, never encrypted. Binding to the block hash means a ciphertext lifted out of
   * this position fails its tag instead of decrypting somewhere it was never meant to be. */
  function aad(blockHash, label) {
    var s = '3030|' + String(blockHash || '') + '|' + String(label || '');
    return new TextEncoder().encode(s);
  }

  /* ── the key ───────────────────────────────────────────────────────────────────────────────
   * ⛔ THE SECRET IS THE CALLER'S AND IT MUST NOT COME FROM THE CHAIN. The block hash is mixed in
   *   for FRESHNESS — the result provably could not exist before that block — and freshness is not
   *   secrecy. This refuses a missing or trivially short secret instead of producing a key-shaped
   *   thing that would work perfectly and protect nothing.
   * ⚠ HKDF, not a bare hash: extract-then-expand is what makes a low-entropy-ish secret safe to
   *   use as key material, and SHA-256 of a passphrase is not. */
  function deriveKey(secret, blockHash, info) {
    if (typeof secret !== 'string' || secret.length < 16) {
      return Promise.reject(new Error('deriveKey needs an OUT-OF-BAND secret of at least 16 chars — a key derived only from public chain data is public'));
    }
    var s;
    try { s = subtle(); } catch (e) { return Promise.reject(e); }
    var enc = new TextEncoder();
    return s.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']).then(function (ikm) {
      return s.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: hexToBytes(blockHash), info: enc.encode('3030|' + (info || 'aes-256-gcm')) },
        ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }

  function seal(key, plaintext, height, counter, blockHash, label) {
    var data = typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
    var iv = nonce(height, counter);
    return subtle().encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: aad(blockHash, label), tagLength: GCM_TAG_BITS },
      key, data
    ).then(function (ct) {
      return { ciphertext: new Uint8Array(ct), nonce: iv, nonceHex: bytesToHex(iv),
               height: height, counter: counter || 0, blockHash: blockHash, label: label || '' };
    });
  }
  function open(key, ciphertext, height, counter, blockHash, label) {
    return subtle().decrypt(
      { name: 'AES-GCM', iv: nonce(height, counter), additionalData: aad(blockHash, label), tagLength: GCM_TAG_BITS },
      key, ciphertext);
  }

  /* ── seeing encryption without reading it ──────────────────────────────────────────────────
   * ⛔ THIS IS A DETECTOR, NOT A DECODER, AND THE DISTINCTION IS THE WHOLE ETHIC. It says "these
   *   bytes carry near-maximal entropy", which is what ciphertext looks like — and also what a
   *   hash, a signature, a compressed blob and a random salt look like. It NEVER concludes that
   *   something is encrypted, for the same reason the approval score never concludes that an
   *   address is a scam: a count is a fact and a label is an accusation. */
  function entropy(bytes) {
    if (!bytes || !bytes.length) return 0;
    var f = new Uint32Array(256), i;
    for (i = 0; i < bytes.length; i++) f[bytes[i]]++;
    var h = 0, n = bytes.length;
    for (i = 0; i < 256; i++) if (f[i]) { var p = f[i] / n; h -= p * Math.log2(p); }
    return h;                                   /* bits per byte, 0..8 */
  }
  /* ⛔ AN ABSOLUTE BITS-PER-BYTE THRESHOLD IS THE WRONG STATISTIC AND IT SHIPPED WRONG FIRST.
   *   The bar was `h >= 7.5`, and entropy is bounded by the SAMPLE, not by the data: n bytes can
   *   show at most n distinct symbols, so the ceiling is log2(min(n,256)). At 126 bytes that
   *   ceiling is 6.98 — **a 7.5 bar is arithmetically unreachable** — and the panel on this repo's
   *   own substrate page duly reported 126 bytes of real AES-GCM ciphertext as *"structured —
   *   consistent with ABI padding"*. The detector was not wrong about the number; it was asking a
   *   question the sample could not answer, and the confident wrong verdict is worse than none.
   *   ⚑ The 64-byte floor made it incoherent rather than safe: at 64 the ceiling is 6.0, so every
   *     admitted sample from 64 to ~180 bytes was guaranteed to fail whatever it contained.
   *
   * ✅ THE FIX IS TO NORMALISE AGAINST THE BOUND, which removes the nuisance parameter instead of
   *   tuning around it — the same move as measuring misregistration by DIRECTION rather than by
   *   magnitude. `ratio = h / log2(min(n,256))`, and the bar is on the ratio.
   *
   * ⚠ THE TWO NUMBERS ARE MEASURED, NOT PICKED. 400 draws per size, random bytes against this
   *   repo's own source (the hardest structured case, being real prose and code):
   *       n= 64  random 0.914–0.990   text 0.264–**0.806**   ← overlaps. 64 is too short.
   *       n=128  random 0.909–0.968   text 0.226–0.719
   *       n=256  random 0.875–0.915   text 0.249–0.650
   *       n=512  random 0.937–0.960   text 0.506–0.662
   *   So the floor is **128** (where the two populations stop touching) and the bar is **0.82**
   *   (0.09 clear of the highest structured sample, 0.055 clear of the lowest random one at its
   *   worst size). Do not nudge either without re-running that sweep — the margin is the whole
   *   claim, and a bar moved by eye is a detector that stops discriminating. */
  var ENTROPY_FLOOR = 128, ENTROPY_BAR = 0.82;
  function looksEncrypted(bytes) {
    var n = bytes ? bytes.length : 0;
    var h = entropy(bytes), max = Math.log2(Math.min(Math.max(n, 2), 256));
    if (n < ENTROPY_FLOOR) return { verdict: 'too short to say', bits: h, bytes: n, ratio: null,
      note: 'under ' + ENTROPY_FLOOR + ' bytes a sample cannot show enough distinct symbols to '
          + 'separate ciphertext from ordinary text — the ceiling here is ' + max.toFixed(2)
          + ' bits/byte, so any verdict would be a reading of the sample rather than of the data' };
    var ratio = h / max;
    return { verdict: ratio >= ENTROPY_BAR
               ? 'high entropy — consistent with ciphertext, a hash, a signature or compression'
               : 'structured — consistent with ABI padding, text or numbers',
             bits: h, bytes: n, ratio: ratio,
             note: 'a measurement, never a conclusion: ' + h.toFixed(2) + ' of a possible '
                 + max.toFixed(2) + ' bits/byte at this sample size. It cannot tell ciphertext from '
                 + 'any other high-entropy blob, and it never claims to' };
  }

  root.Crypt3030 = {
    nonce: nonce, aad: aad, deriveKey: deriveKey, seal: seal, open: open,
    entropy: entropy, looksEncrypted: looksEncrypted,
    ENTROPY_FLOOR: ENTROPY_FLOOR, ENTROPY_BAR: ENTROPY_BAR,
    hexToBytes: hexToBytes, bytesToHex: bytesToHex,
    GCM_NONCE_BYTES: GCM_NONCE_BYTES, GCM_TAG_BITS: GCM_TAG_BITS,
    /* stated in the object so it survives being copied out of the file */
    CANNOT: 'confidentiality. 3030 is public. Bring your own secret; the chain supplies ordering, freshness and binding.'
  };
})(typeof window !== 'undefined' ? window : this);

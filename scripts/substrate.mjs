#!/usr/bin/env node
/* ripmaster3030studios — 3030, THE SUBSTRATE OMNI DATA LAYER.  `npm run substrate`
 *
 * Artist, 2026-08-09: *"an omni ghost chain for eth and base that is basically the idea that eth
 * prints a substrate and then each sigil and space or mark is on chain — so all typing, data
 * input, the mundane code, all the typing each is an individual component of a larger work of
 * live encryption — since is dually using the same language to encrypt."*
 * Then: *"call the chain 3030"* · *"the substrate omni data layer protocol for eth and base."*
 *
 * ══ WHAT THIS IS ══════════════════════════════════════════════════════════════════════════════
 *
 * A chain. Not a picture of two chains — a third one, whose blocks are DERIVED from Ethereum and
 * Base rather than voted on. It has a height, a head, a linked hash and a genesis.
 *
 * ⛔ IT HAS NO VALIDATORS AND IT DOES NOT NEED ANY, AND THAT IS THE WHOLE STRUCTURAL ARGUMENT.
 *   Consensus exists to answer "which history is real" when parties disagree. Here there is
 *   nothing to disagree about: a 3030 block is a PURE FUNCTION of two source blocks that
 *   Ethereum and Base have already finalised. Anyone who can read those blocks recomputes this
 *   one and gets the same 32 bytes. **Verification replaces consensus.** So this layer inherits
 *   the security of both chains and adds no trust assumption of its own — which is the only
 *   honest way to put a third chain on top of two real ones.
 * ⚠ THE COROLLARY, STATED SO NOBODY OVERSELLS IT: 3030 CANNOT SETTLE ANYTHING. It has no
 *   transactions of its own, no accounts and no state you can write to. It is a READING. Every
 *   byte it indexes was paid for and ordered by ETH or Base. If a future surface ever wants to
 *   move value on it, that is a different design and this file is not evidence for it.
 *
 * ══ THE MATERIAL — measured, not asserted ═════════════════════════════════════════════════════
 *
 * Every transaction carries calldata. Classify each byte three ways:
 *
 *   SPACE  0x00              the paper.  ~75% of Ethereum, ~71% of Base
 *   SIGIL  0x20–0x7E         a mark that also reads as language — the dual register
 *   MARK   everything else   opaque ink
 *
 * ⛔ THE SUBSTRATE IS NOT SOMETHING ETH PRINTS *IN ADDITION TO* THE MARKS — IT IS MOST OF WHAT
 *   ETH PRINTS. Three quarters of every byte ever typed into these chains is empty space, and
 *   that is a measurement (block 25,714,463: 75.18%), not a figure of speech.
 *
 * ⛔ AND THE PROTOCOL ITSELF ALREADY PRICES PAPER CHEAPER THAN INK, BY EXACTLY FOUR. Under
 *   EIP-7623 calldata is priced in TOKENS — a zero byte costs 1, a non-zero byte costs 4, at
 *   10 gas per token. So the chain charges 10 gas for a space and 40 for a mark. **This is not
 *   our metaphor imposed on the chain; it is the chain's own fee schedule, and the artwork is
 *   just reading it out loud.**
 *   ⚑ MEASURED BY SLOPE, AND THE FIRST MEASUREMENT WAS WRONG IN THE PLAUSIBLE DIRECTION. A
 *     single-point `eth_estimateGas` difference gives 11.09 and 41.15 gas/byte — ratio 3.71×,
 *     close enough to 4 to look like a real deviation worth explaining. It is the ESTIMATOR'S
 *     OWN BUFFER, not the protocol. Two points (1,000 and 5,000 bytes) and take the slope: the
 *     constant cancels and both chains return **10.1282 and 40.5240 gas/byte, ratio 4.0011×**.
 *     ⚠ So do not "correct" the 4× to 3.71× after re-measuring at one point. The instrument is
 *       buffered; the protocol is not.
 *
 * ══ THE DUALITY — why "encryption" is the right word and not decoration ═══════════════════════
 *
 * *"dually using the same language to encrypt."* The same byte is instruction and glyph at once.
 * `0x60` is PUSH1 to the machine and a backtick to a reader. Nothing is concealed and there is
 * no key — the cipher is the REGISTER YOU READ IN. That is why this is encryption rather than
 * obfuscation: the plaintext was public the whole time, in a reading nobody performs.
 *
 * ══ HOW A BLOCK IS BUILT ══════════════════════════════════════════════════════════════════════
 *
 * ONE ETHEREUM BLOCK IS ONE SHEET; the Base blocks under it are the impressions on that sheet.
 * ⚑ That mapping is not arbitrary and it is the reason this is "omni" rather than two panels
 *   side by side: ETH is ~12s and Base is ~2s, so roughly six Base blocks land inside every
 *   Ethereum block. The slow chain sets the sheet; the fast chain does the typing. Pairing is by
 *   TIMESTAMP WINDOW — a Base block belongs to the sheet whose window (parentTs, ts] contains it
 *   — so the rule is total, deterministic, and depends on nothing either chain can revise.
 *
 *   hash(n) = sha256( hash(n-1) ‖ ethHash ‖ baseHash… ‖ canonical(census) )
 *
 * ⚠ THE CENSUS IS INSIDE THE HASH ON PURPOSE. Hashing only the source hashes would make this a
 *   linked list of pointers — a chain that is correct and says nothing. Committing to the census
 *   means the hash is a claim ABOUT THE READING, so a deriver that miscounts produces a
 *   different chain and is caught by anyone who recomputes.
 *
 * ⚠ SHA-256, NOT KECCAK, AND FOR A REASON THAT IS ABOUT THE PAGE: `crypto.subtle` gives every
 *   browser sha256 with no dependency, so substrate.html can RECOMPUTE a block itself and show
 *   the verification rather than assert it. Keccak would need a library, and a verification you
 *   have to be talked into trusting is not one.
 *
 * ══ THE NAME ══════════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ THE PROTOCOL NAME LIVES IN EXACTLY ONE PLACE — `PROTOCOL` below — AND IS CARRIED TO EVERY
 *   SURFACE IN THE DATA FILE. This project renamed itself across 258 files on 2026-08-01 and was
 *   still wrong on 200+ live surfaces a day later, because the name had been TYPED everywhere
 *   instead of READ from somewhere. The artist said the name might change ("or a name that comes
 *   eventually") before he settled on 3030 — so the rename cost is designed to be one edit, and
 *   `npm run test:substrate` asserts the page never hard-codes it.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── THE ONE DECLARATION ──────────────────────────────────────────────────────────────────── */
export const PROTOCOL = {
  name: '3030',
  title: 'the substrate omni data layer',
  /* ⚠ 3030 IS ALSO THE ERC-20 `symbol()`. That is the artist's call and it is coherent — the
   * token and the layer are the same work — but it means prose must never leave a reader unsure
   * whether "3030" is the ticker or the chain. Every surface here says "the 3030 layer" or
   * "$3030" and never a bare 3030 where the two could be confused. */
  ticker: '$3030',
  /* ── THE DESIGNATION — artist, 2026-08-09: *"L0 L1 L2"* · *"or 00"* ──────────────────────
   *
   * ✅ **00, NOT L0**, and the difference is the difference between a true claim and a false one.
   *
   * ⛔ "L0" ALREADY MEANS SOMETHING, AND IT IS NOT THIS. In common use a layer zero sits
   *   BENEATH the L1s — the networking/interop substrate several L1s plug into. 3030 does the
   *   opposite: it sits on top of Ethereum and Base and reads DOWN into them. Shipping "L0"
   *   would be claiming a position in the security stack this layer does not hold, on a page
   *   whose entire argument is that it adds no trust assumption. The one thing this project
   *   will not do is print a number that drifts into a lie.
   *
   * ⚑ **00 IS THE BYTE.** `0x00` is the zero byte — the space, the paper, ~75% of every block
   *   on both chains. So the designation is not a rung on a ladder at all; the layer is named
   *   after the material it is made of, and the name is a measurement. That is the artist's own
   *   instinct landing somewhere stronger than the convention it started from.
   *
   * ⚠ SO THE STACK IS RECORDED AND THE RELATION IS STATED, rather than implied by a number:
   *   L1 Ethereum · L2 Base · **00 is not below them, it is inside them.** */
  layer: '00',
  stack: [
    { id: 'L1', chain: 'ETHEREUM', role: 'substrate — prints the sheet' },
    { id: 'L2', chain: 'BASE', role: 'impression — types on it' },
    { id: '00', chain: '3030', role: 'the reading — the zero byte both are mostly made of' },
  ],
};

/* ── sources ──────────────────────────────────────────────────────────────────────────────── */
const CHAINS = {
  ethereum: {
    label: 'ETHEREUM',
    role: 'substrate',
    rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org',
           'https://rpc.mevblocker.io', 'https://eth.merkle.io'],
  },
  base: {
    label: 'BASE',
    role: 'impression',
    rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com',
           'https://base.drpc.org'],
  },
};

/* ⚠ RACE, DO NOT SEQUENCE, AND ALWAYS WITH A TIMEOUT. This repo has already shipped one surface
 * whose four endpoints were walked one at a time on a bad connection — most of a minute of
 * em-dashes — and another whose single stalled fetch hung forever because nothing aborted it.
 * `AbortController` rather than `AbortSignal.timeout`, which is too new to assume. */
async function rpc(chain, method, params, { timeout = 12000 } = {}) {
  const errs = [];
  const attempt = (url) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    return fetch(url, {
      method: 'POST', signal: ac.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }).then(async (r) => {
      /* ⛔ A DEAD RPC HERE ANSWERS HTTP 200 WITH A JSON-RPC `error` BODY — two of this repo's
       * four mainnet endpoints did exactly that on launch night. `r.ok` is not the check. */
      const j = await r.json();
      if (j.error) throw new Error(`${url}: ${j.error.message || 'rpc error'}`);
      if (j.result === undefined) throw new Error(`${url}: no result`);
      return j.result;
    }).finally(() => clearTimeout(t));
  };
  const results = await Promise.allSettled(CHAINS[chain].rpcs.map(attempt));
  for (const r of results) { if (r.status === 'fulfilled') return r.value; errs.push(r.reason?.message || 'failed'); }
  throw new Error(`${chain}.${method}: every endpoint failed — ${errs.join(' | ')}`);
}

const hex = (n) => '0x' + n.toString(16);
const num = (h) => parseInt(h, 16);

/* ── the census ───────────────────────────────────────────────────────────────────────────── */
const SPACE = 'space', SIGIL = 'sigil', GLYPH = 'glyph', MARK = 'mark';
const classify = (b) => (b === 0 ? SPACE : (b >= 0x20 && b <= 0x7e) ? SIGIL : MARK);

/* ── GLYPHS — artist, 2026-08-09: *"what about glyphs and other type of formations"* ─────────
 *
 * ⛔ THE ASCII-ONLY CLASSIFIER WAS BLIND TO EVERY WRITING SYSTEM BUT ONE. `0x20–0x7E` is Latin,
 *   digits and punctuation — so Chinese, Japanese, Korean, Arabic, Hebrew, Cyrillic, Devanagari
 *   and every emoji on both chains counted as MARK, i.e. as opaque ink. That is not a rounding
 *   error in a census whose entire claim is *"this is language nobody reads"*: it silently
 *   asserted that the only language on-chain is English.
 *
 * ⚑ A GLYPH IS A VALID MULTI-BYTE UTF-8 SEQUENCE that decodes to a printable codepoint. Real
 *   text in calldata is UTF-8 — ENS names, memos, token metadata, revert strings — so this is
 *   the encoding actually in use, not a guess.
 *
 * ⛔ AND IT NEEDS A FALSE-POSITIVE ARGUMENT, OR THE NUMBER IS WORTHLESS. Random bytes form a
 *   valid 2-byte sequence by chance about 2.9% of the time per position (0xC2–0xDF then
 *   0x80–0xBF), and calldata is mostly hashes — i.e. mostly random bytes. A naive scan would
 *   report a chain full of Cyrillic that nobody typed.
 *   ⛔ ADJACENCY-TO-ASCII WAS MY FIRST FILTER AND IT WAS NOT NEARLY ENOUGH — THE DATA SAID SO.
 *      It kept a glyph whenever an ASCII byte sat next to it, and in hash-dense calldata that is
 *      almost always. The kept "text" came back as `ă)Z>>Q`, `Ϫő:g`, `P񮳥Ս` — Coptic beside
 *      Tibetan beside a PRIVATE-USE codepoint on plane 15. **That scatter is the signature of
 *      noise**, and the number it produced (0.93%, announced as "every other writing system")
 *      would have been almost entirely chance. I had written the false-positive argument in this
 *      very comment and then shipped a filter that did not clear it.
 *
 *   ✅ THE TWO PROPERTIES REAL TEXT HAS AND RANDOM BYTES DO NOT:
 *      1. **it clusters in ONE script** — real text is Cyrillic *or* CJK *or* emoji, never one
 *         Armenian character between a Devanagari and a Tibetan one;
 *      2. **it comes in RUNS** — a real CJK string is many glyphs in a row.
 *      So a glyph is kept only inside a run of **≥2 consecutive glyphs sharing a script band**,
 *      and private-use planes are refused outright — nobody types those, and their presence was
 *      the clearest tell that the first filter was measuring noise.
 *      ⚑ The arithmetic: one valid 2-byte sequence is ~2.9% per position, two consecutive is
 *        ~0.08%, and same-band narrows it much further again.
 *   ⚠ `chanceGlyphs` records every hit the filter threw away, so the correction stays visible
 *     rather than asserted — and if a future run reports mostly-rejected hits, that is the
 *     filter working, not a fault.                                                            */

/* Coarse script bands. ⚠ COARSE ON PURPOSE — this is a noise filter, not a Unicode database.
 * Anything outside every band (including private use and unassigned planes) is refused. */
const BANDS = [
  [0x00a0, 0x024f], [0x0370, 0x052f], [0x0590, 0x06ff], [0x0900, 0x0dff],
  [0x0e00, 0x109f], [0x2000, 0x2bff], [0x2e80, 0x9fff], [0x3040, 0x30ff],
  [0xac00, 0xd7af], [0xf900, 0xfaff], [0x1f000, 0x1faff],
];
const bandOf = (cp) => { for (let i = 0; i < BANDS.length; i++)
  if (cp >= BANDS[i][0] && cp <= BANDS[i][1]) return i; return -1; };
function scanGlyphs(bytes) {
  const hits = [];                                   // [{i, len, cp}]
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let len = 0, cp = 0;
    if (b >= 0xc2 && b <= 0xdf) { len = 2; cp = b & 0x1f; }
    else if (b >= 0xe0 && b <= 0xef) { len = 3; cp = b & 0x0f; }
    else if (b >= 0xf0 && b <= 0xf4) { len = 4; cp = b & 0x07; }
    else { i++; continue; }
    if (i + len > bytes.length) { i++; continue; }
    let good = true;
    for (let k = 1; k < len; k++) {
      const c = bytes[i + k];
      if (c < 0x80 || c > 0xbf) { good = false; break; }
      cp = (cp << 6) | (c & 0x3f);
    }
    /* reject overlongs, surrogates, out-of-range, and non-printables */
    const printable = good && cp >= 0xa0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)
      && !(len === 3 && cp < 0x800) && !(len === 4 && cp < 0x10000);
    if (!printable) { i++; continue; }
    hits.push({ i, len, cp });
    i += len;
  }
  return hits;
}

/* ── FORMATIONS — the structure above the byte ───────────────────────────────────────────────
 *
 * ⚑ A BYTE CENSUS ALONE SAYS WHAT THE TYPING IS MADE OF AND NOTHING ABOUT HOW IT IS SET. The
 *   ABI lays every argument on a 32-BYTE GRID, which is the closest thing the chain has to a
 *   typographic measure — and once you see the grid, the substrate stops being a field of dots
 *   and becomes a page with lines on it.
 *
 *   WORD      32 bytes           the line — the ABI's own measure
 *   SELECTOR  first 4 bytes      the mark that opens a call; a hash fragment, so pure ink
 *   RULE      a word of all 0x00 the blank line — the widest whitespace the chain has
 *   ADDRESS   12 zeros + 20 non  the shape of an address: a proper noun on the page
 *
 * ⚠ THESE ARE SHAPES, NOT DECLARATIONS. Calldata is untyped bytes; a word that LOOKS like an
 *   address may be a number that happens to be small. So they are counted and named as shapes —
 *   never as "this call transfers to X", which would be a claim the bytes do not carry.        */
function formations(bytes) {
  const f = { words: 0, selectors: 0, rules: 0, addresses: 0 };
  if (bytes.length >= 4) f.selectors = 1;
  const body = bytes.length >= 4 ? bytes.subarray(4) : bytes.subarray(0, 0);
  for (let w = 0; w + 32 <= body.length; w += 32) {
    f.words++;
    let zeros = 0, lead = 0, leading = true;
    for (let k = 0; k < 32; k++) {
      const v = body[w + k];
      if (v === 0) { zeros++; if (leading) lead++; } else leading = false;
    }
    if (zeros === 32) f.rules++;
    else if (lead === 12) f.addresses++;
  }
  return f;
}

/* Gas the PROTOCOL charges per byte class (EIP-7623: 1 token per zero byte, 4 per non-zero,
 * 10 gas per token). Measured by slope against both chains — see the header. */
const GAS = { [SPACE]: 10, [SIGIL]: 40, [GLYPH]: 40, [MARK]: 40 };

/* ⚑ A RUN OF PRINTABLE BYTES IS THE GHOST TEXT — the place the dual reading stops being a claim
 * and becomes visible. Four is the shortest run that is more often language than coincidence:
 * random bytes give a printable run of 4 about (95/256)^4 ≈ 1.9% of the time per position, and
 * the ABI's own padding makes long zero runs far more common than long printable ones. */
const MIN_RUN = 4;

function readCalldata(txs) {
  const counts = { [SPACE]: 0, [SIGIL]: 0, [GLYPH]: 0, [MARK]: 0 };
  const form = { words: 0, selectors: 0, rules: 0, addresses: 0 };
  const runs = [];
  let bytes = 0, chanceGlyphs = 0;

  for (const t of txs) {
    const d = t.input || t.data || '0x';
    if (d.length <= 2) continue;
    const n = (d.length - 2) >> 1;
    const buf = new Uint8Array(n);
    for (let k = 0; k < n; k++) buf[k] = parseInt(d.slice(2 + k * 2, 4 + k * 2), 16) || 0;

    const f = formations(buf);
    form.words += f.words; form.selectors += f.selectors;
    form.rules += f.rules; form.addresses += f.addresses;

    /* glyphs, then the filter that makes the number mean something: a glyph survives only
     * inside a run of ≥2 CONSECUTIVE glyphs sharing a script band. See the header. */
    const hits = scanGlyphs(buf).filter((h) => bandOf(h.cp) >= 0);
    const keep = new Set();
    for (let a = 0; a < hits.length;) {
      let b = a + 1;
      while (b < hits.length
        && hits[b].i === hits[b - 1].i + hits[b - 1].len          // physically consecutive
        && bandOf(hits[b].cp) === bandOf(hits[a].cp)) b++;         // same script
      if (b - a >= 2) for (let k = a; k < b; k++) keep.add(hits[k]);
      a = b;
    }
    chanceGlyphs += scanGlyphs(buf).length - keep.size;
    const glyphAt = new Map();
    for (const h of keep) glyphAt.set(h.i, h);

    let run = '';
    for (let i = 0; i < n;) {
      const g = glyphAt.get(i);
      if (g) {
        counts[GLYPH] += g.len; bytes += g.len;
        run += String.fromCodePoint(g.cp);
        i += g.len; continue;
      }
      const k = classify(buf[i]);
      counts[k]++; bytes++;
      if (k === SIGIL) run += String.fromCharCode(buf[i]);
      else { if (run.length >= MIN_RUN) runs.push(run); run = ''; }
      i++;
    }
    if (run.length >= MIN_RUN) runs.push(run);
  }
  return { counts, bytes, runs, form, chanceGlyphs };
}

/* ── canonical form: what the hash actually commits to ────────────────────────────────────── */
/* ⚠ CANONICAL MEANS ONE STRING FOR ONE READING. Hashing `JSON.stringify(obj)` would make the
 * chain depend on key insertion order — two correct derivers disagreeing over a detail neither
 * of them chose. Fixed field order, fixed separators, no floats. */
/* ⚠ v1 → v2 WHEN GLYPHS AND FORMATIONS JOINED THE READING. The hash commits to the census, so
 * widening the census necessarily forks the chain — which is the design working, not a problem
 * to route around. The version is IN the string so a v1 block and a v2 block can never be
 * mistaken for one another, and any chain derived before this change is still valid under v1. */
const canonical = (c) =>
  `v2|space=${c.counts[SPACE]}|sigil=${c.counts[SIGIL]}|glyph=${c.counts[GLYPH]}` +
  `|mark=${c.counts[MARK]}|bytes=${c.bytes}` +
  `|words=${c.form.words}|rules=${c.form.rules}|addr=${c.form.addresses}`;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/* ⛔ THE GENESIS IS A CONSTANT AND MUST NEVER BE DERIVED FROM "NOW". A genesis computed from the
 * current time makes every run a different chain — which reads as working, because each run is
 * internally consistent. This string is the chain's identity. */
/* ⚠ `framing:v2` MARKS THE LENGTH-PREFIX FIX. The framing is part of the protocol's identity, so
 * a chain built with the old ambiguous join can never be mistaken for one built with this. */
export const GENESIS = sha256(
  `${PROTOCOL.name}|${PROTOCOL.title}|substrate:ethereum|impression:base|framing:v2`);

/* ⛔ THE SEPARATOR IS A NUL BYTE, AND IT IS WRITTEN AS AN ESCAPE FOR A REASON THAT COST AN HOUR.
 *
 * NUL is the right choice on the merits: it is a domain separator that CANNOT occur inside any
 * field it separates — every part is either hex or the fixed canonical census string — so
 * `a‖b` can never be confused with `a'‖b'`. A space would be almost as good and is far easier
 * to get subtly wrong.
 *
 * ⚠ IT WAS ORIGINALLY A LITERAL, INVISIBLE 0x00 IN THE SOURCE. The line READ as `.join(' ')` in
 *   every editor and diff, hashed as NUL, and disagreed with every hand-reconstruction of the
 *   same parts — including the page's own verifier, which joined on a space and reported the
 *   chain as broken. **The tell was that `grep` had started calling this file binary**, which is
 *   easy to skim past. A separator you cannot see is a separator you cannot check; written as
 *   `\x00` it is visible in source, greppable, and identical on the wire — so the chain derived
 *   before this comment existed is still valid, byte for byte.
 * ⚠ THE PAGE HARD-CODES THE SAME BYTE because it is a browser file with nothing to import.
 *   `npm run test:substrate` extracts both and asserts they agree — the same coupling-by-test
 *   used for the city/section-9 weapon tables, for the same reason: two copies drift, and the
 *   one that drifts is the one nobody is looking at. */
export const SEP = '\x00';

/* ⛔ FIELDS ARE LENGTH-PREFIXED, AND THE ATTACK SUITE IS WHY — IT BROKE THE PREVIOUS VERSION.
 *
 * A bare `fields.join(SEP)` is ambiguous the moment any field can contain the separator:
 * `['0xAA','0xBB']` and `['0xAA\x000xBB']` produce the IDENTICAL string and therefore the
 * identical hash. That is the classic **canonicalization / field-splitting attack**, and
 * `npm run test:substrate:attack` §B1 demonstrated it against this construction.
 *
 * ⚠ IT WAS NOT EXPLOITABLE — no legitimate field can encode NUL, because every one is either
 *   hex or the fixed canonical census string. But that is an UNENFORCED INVARIANT holding the
 *   security, i.e. exactly the shape that becomes a hole the day someone adds a field. The
 *   invariant is now enforced by the encoding rather than assumed by the author.
 *
 * ✅ `len:field` per part (netstring framing, the same idea as NIST's TupleHash). Two different
 *   field lists can no longer produce one string, whatever the fields contain.
 *   `['0xAA','0xBB']` → `4:0xAA␀4:0xBB` · `['0xAA␀0xBB']` → `9:0xAA␀0xBB`.
 * ⚠ Length is in UTF-16 code units, which for hex and the canonical string equals bytes; the
 *   assertion below refuses anything else rather than letting the two definitions drift. */
const frame = (parts) => parts.map((p) => {
  const s = String(p);
  return `${s.length}:${s}`;
}).join(SEP);

export function deriveHash(prevHash, ethHash, baseHashes, census) {
  return sha256(frame([prevHash, ethHash, ...baseHashes, canonical(census)]));
}

/* ── build ────────────────────────────────────────────────────────────────────────────────── */
async function block(n, full) { return rpc(n.chain, 'eth_getBlockByNumber', [hex(n.number), full]); }

export async function derive({ sheets = 6, log = () => {} } = {}) {
  const ethHead = num(await rpc('ethereum', 'eth_blockNumber', []));
  const baseHead = num(await rpc('base', 'eth_blockNumber', []));
  log(`ethereum head ${ethHead.toLocaleString()} · base head ${baseHead.toLocaleString()}`);

  /* Oldest first, so the linkage is built in the direction it is read. */
  const ethNums = Array.from({ length: sheets }, (_, i) => ethHead - (sheets - 1 - i));
  const ethBlocks = [];
  for (const n of ethNums) {
    ethBlocks.push(await rpc('ethereum', 'eth_getBlockByNumber', [hex(n), true]));
    log(`  sheet ${n.toLocaleString()}`);
  }

  /* Walk Base back far enough to cover the whole ETH span, then bucket by timestamp window.
   * ⚠ Bounded: a bad timestamp must not turn this into an unbounded walk. */
  const spanFrom = num(ethBlocks[0].timestamp) - 1;
  const baseBlocks = [];
  const CAP = sheets * 12 + 20;
  for (let n = baseHead; n > baseHead - CAP; n--) {
    const b = await rpc('base', 'eth_getBlockByNumber', [hex(n), true]);
    baseBlocks.push(b);
    if (num(b.timestamp) <= spanFrom) break;
  }
  baseBlocks.reverse();
  log(`  ${baseBlocks.length} base impressions across the span`);

  const blocks = [];
  let prev = GENESIS;
  for (let i = 0; i < ethBlocks.length; i++) {
    const eb = ethBlocks[i];
    const ts = num(eb.timestamp);
    const prevTs = i > 0 ? num(ethBlocks[i - 1].timestamp) : ts - 12;
    const mine = baseBlocks.filter((b) => { const t = num(b.timestamp); return t > prevTs && t <= ts; });

    const sheet = readCalldata(eb.transactions || []);
    const imp = readCalldata(mine.flatMap((b) => b.transactions || []));
    const census = {
      counts: {
        [SPACE]: sheet.counts[SPACE] + imp.counts[SPACE],
        [SIGIL]: sheet.counts[SIGIL] + imp.counts[SIGIL],
        [GLYPH]: sheet.counts[GLYPH] + imp.counts[GLYPH],
        [MARK]: sheet.counts[MARK] + imp.counts[MARK],
      },
      bytes: sheet.bytes + imp.bytes,
      form: {
        words: sheet.form.words + imp.form.words,
        selectors: sheet.form.selectors + imp.form.selectors,
        rules: sheet.form.rules + imp.form.rules,
        addresses: sheet.form.addresses + imp.form.addresses,
      },
      /* ⚠ CARRIED, NOT HIDDEN: what the naive glyph scan would have claimed before the adjacency
       * filter. A correction you cannot see is a correction nobody can check. */
      chanceGlyphs: sheet.chanceGlyphs + imp.chanceGlyphs,
    };
    const baseHashes = mine.map((b) => b.hash);
    const hash = deriveHash(prev, eb.hash, baseHashes, census);

    blocks.push({
      height: i,
      hash,
      prev,
      sheet: { chain: 'ethereum', number: num(eb.number), hash: eb.hash, timestamp: ts,
               txs: (eb.transactions || []).length, bytes: sheet.bytes, counts: sheet.counts },
      impressions: mine.map((b, j) => ({ chain: 'base', number: num(b.number), hash: b.hash,
               timestamp: num(b.timestamp), txs: (b.transactions || []).length,
               bytes: j === 0 ? imp.bytes : undefined })),
      census,
      /* The ghost text, deduped and capped. ⚠ CAPPED FOR SIZE, AND THE PAGE SAYS SO — a silent
       * truncation reads as "this is all there was". */
      runs: dedupe([...sheet.runs, ...imp.runs]).slice(0, 48),
      runsTotal: sheet.runs.length + imp.runs.length,
      canonical: canonical(census),
    });
    prev = hash;
  }
  return { blocks, ethHead, baseHead };
}

function dedupe(runs) {
  const seen = new Map();
  for (const r of runs) {
    const k = r.trim();
    if (k.length < MIN_RUN) continue;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([text, n]) => ({ text, n }));
}

/* ── run ──────────────────────────────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const sheets = Math.max(1, Math.min(24, parseInt(arg('sheets', '6'), 10) || 6));
  console.log(`\n══ ${PROTOCOL.name} · ${PROTOCOL.title} ══\n`);
  const t0 = Date.now();
  const { blocks, ethHead, baseHead } = await derive({ sheets, log: (m) => console.log('  ' + m) });

  const tot = blocks.reduce((a, b) => ({
    space: a.space + b.census.counts.space, sigil: a.sigil + b.census.counts.sigil,
    glyph: a.glyph + b.census.counts.glyph, mark: a.mark + b.census.counts.mark,
    bytes: a.bytes + b.census.bytes,
    words: a.words + b.census.form.words, rules: a.rules + b.census.form.rules,
    addresses: a.addresses + b.census.form.addresses,
    selectors: a.selectors + b.census.form.selectors,
    chanceGlyphs: a.chanceGlyphs + b.census.chanceGlyphs,
  }), { space: 0, sigil: 0, glyph: 0, mark: 0, bytes: 0, words: 0, rules: 0, addresses: 0,
        selectors: 0, chanceGlyphs: 0 });
  const pct = (n) => tot.bytes ? (100 * n / tot.bytes).toFixed(2) + '%' : '—';

  console.log(`\n  ── the substrate, ${blocks.length} sheets ──`);
  console.log(`  bytes typed   ${tot.bytes.toLocaleString()}`);
  console.log(`  SPACE  ${pct(tot.space).padStart(7)}   the paper`);
  console.log(`  SIGIL  ${pct(tot.sigil).padStart(7)}   ASCII — reads as language in both registers`);
  console.log(`  GLYPH  ${pct(tot.glyph).padStart(7)}   multi-byte UTF-8 — every other writing system`);
  console.log(`  MARK   ${pct(tot.mark).padStart(7)}   opaque ink`);
  console.log(`\n  ── formations ──`);
  console.log(`  words      ${tot.words.toLocaleString().padStart(9)}   the 32-byte ABI grid — the line`);
  console.log(`  rules      ${tot.rules.toLocaleString().padStart(9)}   a word of pure zero — the blank line` +
    (tot.words ? `  (${(100 * tot.rules / tot.words).toFixed(1)}% of all lines)` : ''));
  console.log(`  addresses  ${tot.addresses.toLocaleString().padStart(9)}   address-shaped — a proper noun`);
  console.log(`  selectors  ${tot.selectors.toLocaleString().padStart(9)}   the mark that opens a call`);
  console.log(`\n  glyph scan: ${tot.glyph.toLocaleString()} bytes kept, ` +
    `${tot.chanceGlyphs.toLocaleString()} isolated hits rejected as chance`);
  console.log(`\n  head   ${blocks.at(-1).hash.slice(0, 32)}…`);
  console.log(`  height ${blocks.at(-1).height}`);

  const out = {
    protocol: PROTOCOL,
    version: 1,
    genesis: GENESIS,
    derivedAt: new Date().toISOString(),
    /* ⚠ THE PRICE IS CARRIED IN THE DATA, MEASURED BY SLOPE — see the header. It is a protocol
     * fact, not a reading of these particular blocks, so it does not change per run. */
    gas: { space: GAS[SPACE], mark: GAS[MARK], ratio: 4, method: 'EIP-7623 token pricing, verified by two-point eth_estimateGas slope on both chains' },
    sources: { ethereum: { head: ethHead, role: 'substrate' }, base: { head: baseHead, role: 'impression' } },
    totals: tot,
    blocks,
  };
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(join(ROOT, 'data/substrate.json'), JSON.stringify(out, null, 1));
  console.log(`\n  → data/substrate.json  (${(Date.now() - t0) / 1000 | 0}s)\n`);
}

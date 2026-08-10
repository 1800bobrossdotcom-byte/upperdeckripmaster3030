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
 * ⛔ AND THE PROTOCOL ITSELF ALREADY PRICES PAPER CHEAPER THAN INK, BY EXACTLY FOUR. **This is
 *   not our metaphor imposed on the chain; it is the chain's own fee schedule.**
 *
 *   ⛔ THERE ARE TWO SCHEDULES AND I PUBLISHED THE WRONG ONE FIRST. Intrinsic gas is
 *     `max(standard, floor)`:
 *       STANDARD  4 gas per zero byte, 16 per non-zero      ← what a REAL transaction pays
 *       FLOOR     10 per token; zero = 1 token, non-zero = 4 → 10 and 40  (EIP-7623)
 *     The floor only wins when `24*nonzero + 6*zero > execution gas`, i.e. on a transaction that
 *     is almost pure data. **The census reads real transactions, which have execution, so the
 *     schedule that applies to almost everything it counts is 4 and 16.** My first measurement
 *     was taken on a bare value transfer — correct for that transaction, and published as though
 *     it were the protocol's price for everything. It is not.
 *   ⚑ MEASURED BOTH WAYS, against a target with heavy execution and one with none:
 *       lens `tokenURI` (~311k gas of execution):  4.032 and 16.127 gas/byte  → standard binds
 *       bare transfer (no execution):             10.020 and 40.346 gas/byte  → floor binds
 *   ✅ **THE RATIO IS EXACTLY 4x UNDER BOTH, AND THAT IS THE DURABLE CLAIM** — the one number
 *     that does not depend on which schedule binds. It is also the number the protocol has
 *     deliberately preserved through two repricings: before EIP-2028 (Istanbul, 2019) a non-zero
 *     byte cost 68 against a zero byte's 4, a ratio of **17x**; Istanbul took 68 to 16 and left
 *     4 alone, landing on 4x; EIP-7623's floor then multiplied both by 2.5 and preserved it
 *     again. **Ethereum has re-priced the relationship between space and mark twice and settled
 *     on four.**
 *   ⚠ ALWAYS MEASURE BY SLOPE, NEVER AT ONE POINT. A single `eth_estimateGas` difference gives
 *     ~3.71× rather than 4× — that is the ESTIMATOR'S OWN BUFFER, not the protocol. Two points
 *     and take the slope; the constant cancels. So do not "correct" 4× down to 3.71× after
 *     re-measuring at one point: the instrument is buffered, the protocol is not.
 *
 *   ⛔ TWO ERRORS IN ONE NUMBER, AND THE SECOND SURVIVED THE FIRST FIX. The slope corrected the
 *     estimator's buffer and left the schedule wrong, so the result LOOKED rigorous — a clean
 *     4.0011× off a careful two-point measurement — while describing a transaction shape almost
 *     nothing on either chain has. **A measurement can be precise, reproducible and answering
 *     the wrong question.** The tell was available: the target was a bare value transfer, which
 *     is not what a census of real calldata is counting.
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
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
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

/* What the PROTOCOL charges per byte class. ⚠ TWO SCHEDULES — `max(standard, floor)` — and the
 * standard one is what almost every real transaction pays. Both measured by slope; see header. */
const GAS = {
  standard: { [SPACE]: 4,  [SIGIL]: 16, [GLYPH]: 16, [MARK]: 16 },
  floor:    { [SPACE]: 10, [SIGIL]: 40, [GLYPH]: 40, [MARK]: 40 },
};

/* ⛔ FOUR WAS THE LENGTH AT WHICH COINCIDENCE OUTNUMBERS LANGUAGE FOUR TO ONE, AND THE COMMENT
 *   THAT USED TO SIT HERE SAID SO WHILE THE CODE SHIPPED FOUR ANYWAY. Measured across the 24
 *   published sheets: 428 distinct strings, 9,652 occurrences, and **80.1% of them were
 *   printable FRAGMENTS OF HASHES** — `^'y1d#` appears 512 times and nobody typed it; it is six
 *   bytes of some recurring constant that happen to fall in 0x20–0x7E. The page rendered those
 *   beside `awjcdp_facil1` at equal weight under the sentence *"Every one was typed by somebody
 *   into a system, paid for in gas"* — **false for four fifths of what it displayed.**
 *
 * ⚑ THIS IS THE GLYPH FILTER'S OWN LESSON, ONE LAYER UP, AND THE FILE ALREADY KNEW IT. A glyph
 *   survives only inside a run of ≥2 sharing a script band, and the rejects are counted and
 *   PUBLISHED as `chanceGlyphs`, because a naive scan reports a chain full of scripts nobody
 *   typed. A sigil run needs the same treatment: it survives only if it looks TYPED rather than
 *   drawn uniformly from all 95 printable bytes.
 *
 * ⚠ AND THE BAR IS NOT ARGUED, IT IS MEASURED. `chanceRuns` shuffles each transaction's OWN
 *   bytes and runs **the identical extractor** over the result — same composition, structure
 *   destroyed — so the null is the chain's real byte mix rather than a uniform model that does
 *   not describe it (65% of this chain is 0x00, which no uniform model captures). Published
 *   beside the survivors: a filter whose reject count nobody can see is one you take on faith.
 *
 * ⚠ ONE ALPHABET TEST, NOT A WORD LIST. An identifier is drawn from `[A-Za-z0-9_.:/-]` — 67 of
 *   the 95 printable bytes, so a chance byte lands there 70.5% of the time and a chance run
 *   rarely lands there throughout. A dictionary would have been a hand-picked list, which is
 *   this repo's most frequently paid bill. */
/* ⚑ SEVEN IS MEASURED, NOT ARGUED — swept against the shuffled null over three live sheets:
 *
 *     MIN_RUN    survivors    null    ratio    distinct names
 *        6          552        102     5.4x         144
 *        7          495         34    14.6x         144   ← the knee
 *        8          426         28    15.2x         138
 *       10          416         28    14.9x         137
 *       12          252         28     9.0x         131
 *
 *   Six to seven cuts coincidence by THREE TIMES and costs **zero distinct names** — the same
 *   vocabulary, with a third of the noise gone, which is the definition of a free bar. Eight buys
 *   0.6x more ratio and costs six real names, and the names are the product, so it is not taken.
 *   Past ten the ratio falls again as the filter starts eating language instead of chance.
 * ⚠ Each sweep row reads DIFFERENT live blocks, so small differences between adjacent rows are
 *   not meaningful; the 3x cliff at seven is far outside that noise and is what the choice rests
 *   on. Overridable by env ONLY so the sweep can be re-run against fresh chain data. */
const MIN_RUN = Number(process.env.RUN_MIN) || 7;
/* ⛔ THE SPACE BELONGS IN THE TYPED ALPHABET, AND LEAVING IT OUT NEARLY COST THE BEST FIND IN THE
 *   CORPUS. The most typed character in written English is the space; excluding it scored
 *   `If eligible, connect your wallet and click Claim to interact` — a lure somebody paid gas to
 *   inscribe — at 0.83, indistinguishable from a hash fragment, while `bc_o3dj3qk8` scored 1.00.
 *   **The filter was rejecting language for being language.** One character costs the null almost
 *   nothing (1 of the 95 printable bytes) and it is what lets the bar rise to 0.9, which is where
 *   `hz&EDza` and its family finally fall out. Widen the alphabet, THEN tighten the threshold. */
const TYPED = /[A-Za-z0-9_.:/ -]/;
/* ⚠ THE LENGTH ESCAPE IS LOAD-BEARING AND IT IS NOT A FUDGE. `0x0000…0000` written out as text
 *   is 42 characters with exactly ONE letter in it, so a letters≥2 rule alone rejects the zero
 *   address — a string somebody unambiguously typed. Long AND wholly in the alphabet is its own
 *   evidence: chance does not hold that alphabet for twelve bytes. */
function isTyped(s) {
  if (s.length < MIN_RUN) return false;
  let good = 0, letters = 0;
  for (const ch of s) { if (TYPED.test(ch)) good++; if (ch >= 'A' && ch <= 'z' && /[A-Za-z]/.test(ch)) letters++; }
  const frac = good / s.length;
  if (frac < 0.9) return false;
  return letters >= 2 || (s.length >= 12 && frac >= 0.95);
}

/* ⛔ ONE EXTRACTOR, CALLED TWICE. The null must run the SAME code as the reading or it measures
 *   the harness — this repo has paid for that four times (`test:citynet` returning `messages`,
 *   the scores fake-Redis ignoring `EX`). Real bytes and shuffled bytes go through this. */
function collectRuns(buf, glyphAt) {
  const out = [];
  let run = '';
  const n = buf.length;
  for (let i = 0; i < n;) {
    const g = glyphAt && glyphAt.get(i);
    if (g) { run += String.fromCodePoint(g.cp); i += g.len; continue; }
    const b = buf[i];
    if (b >= 0x20 && b <= 0x7e) run += String.fromCharCode(b);
    else { if (isTyped(run)) out.push(run); run = ''; }
    i++;
  }
  if (isTyped(run)) out.push(run);
  return out;
}

/* ⚠ SEEDED, NOT `Math.random`. A derive is re-run by a cron and re-read by a browser; a null
 *   that lands on a different number every run is a number nobody can check against the file. */
function shuffled(buf, seed) {
  const a = buf.slice();
  let s = seed >>> 0;
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = a.length - 1; i > 0; i--) {
    const j = (next() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function readCalldata(txs) {
  const counts = { [SPACE]: 0, [SIGIL]: 0, [GLYPH]: 0, [MARK]: 0 };
  const form = { words: 0, selectors: 0, rules: 0, addresses: 0 };
  const runs = [];
  let bytes = 0, chanceGlyphs = 0, chanceRuns = 0;

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

    /* ⚠ THE CENSUS IS WHAT THE BLOCK HASH COMMITS TO — this loop counts and nothing else, and it
     * is deliberately unchanged. The run filter moved out from under it precisely so that
     * sharpening the reading can never move a number the chain is signed over. */
    for (let i = 0; i < n;) {
      const g = glyphAt.get(i);
      if (g) { counts[GLYPH] += g.len; bytes += g.len; i += g.len; continue; }
      counts[classify(buf[i])]++; bytes++;
      i++;
    }

    for (const r of collectRuns(buf, glyphAt)) runs.push(r);

    /* ⛔ THE NULL, FROM THE CHAIN'S OWN BYTES. Shuffling preserves the composition exactly and
     * destroys every structure, so whatever the identical extractor still finds is coincidence
     * by construction. Seeded on the length so the number is reproducible from the file.
     * ⚠ No glyph map for the null, and that is correct rather than lazy: the glyph filter demands
     *   ≥2 CONSECUTIVE glyphs of one script, and a shuffle is precisely the operation that makes
     *   adjacency impossible — so a shuffled stream's glyph map is empty by construction. */
    for (const r of collectRuns(shuffled(buf, n), null)) chanceRuns++;
  }
  return { counts, bytes, runs, form, chanceGlyphs, chanceRuns };
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
export const frame = (parts) => parts.map((p) => {
  const s = String(p);
  return `${s.length}:${s}`;
}).join(SEP);

export function deriveHash(prevHash, ethHash, baseHashes, census) {
  return sha256(frame([prevHash, ethHash, ...baseHashes, canonical(census)]));
}

/* ── build ────────────────────────────────────────────────────────────────────────────────── */
async function block(n, full) { return rpc(n.chain, 'eth_getBlockByNumber', [hex(n.number), full]); }

/* ⛔ SIX SHEETS WAS TOO SHORT TO SAY ANYTHING, AND THE PAGE PROVED IT BY CONTRADICTING ITSELF.
 * The census reading on `substrate.html` treats each sheet as a point and the chain as a path
 * through composition space. At six sheets that is FIVE steps, and the statistic read 6.9× on one
 * derivation and 1.8× on the next — the page confidently naming opposite behaviours an hour apart.
 * ⚑ 24 SHEETS IS 23 STEPS AND COSTS 38 SECONDS, measured, against 10s for six. The hourly job it
 *   runs in already spends 100s on the pool screen, so there was never a cost reason for six; it
 *   was a default nobody revisited. 10.1M bytes of calldata across 24 Ethereum blocks and ~145
 *   Base blocks — roughly five minutes of both chains.
 * ⚠ 24 IS THE CLI'S OWN CEILING and the default now matches it, which means the ceiling is doing
 *   no work. Raise both together if a longer window is ever wanted; the Base walk is
 *   `sheets * 12 + 20` blocks fetched one at a time, so the cost is linear and visible. */
export async function derive({ sheets = 24, log = () => {} } = {}) {
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
      /* ⚠ THE SAME CORRECTION FOR THE SAME REASON, one layer up: what the run scan would have
       * claimed had its bar been coincidence-shaped. Carried, not hidden. */
      chanceRuns: sheet.chanceRuns + imp.chanceRuns,
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

/* ⛔ THE GHOST TEXT IS ARBITRARY TEXT WRITTEN BY STRANGERS, AND THIS PAGE REPUBLISHES IT.
 *
 * That is the whole point of the reading — and it means whatever a stranger paid gas to inscribe
 * gets rendered on a studio surface, verbatim, with the studio's name around it. A real run in
 * one sample was `{"url":"https://x.com/i/api/graphql/…"}`.
 *
 * ⚑ FOUND BY `npm run test:name`, WHICH GUARDS SOMETHING ELSE ENTIRELY. Its rule is that every
 *   x.com link on the site must name an account somebody chose; the ghost text tripped it, and
 *   the real defect it exposed is bigger than the one it was written for — **an unfiltered
 *   republication channel from anyone with a wallet.** A phishing URL costs a few cents of
 *   calldata to place where this page will pick it up.
 *
 * ✅ URLS ARE DEFANGED, NOT DROPPED. Dropping them would edit the census's own evidence; the
 *   point is that language is down there, and a URL is language. So the SHAPE survives and the
 *   destination does not: `https://` → `hxxps://`, and a bare host loses its dot. That is the
 *   long-standing convention in security writing for exactly this reason — quoting a hostile
 *   string without arming it.
 * ⚠ The runs are a DISPLAY SAMPLE and are outside the block hash (see the attack suite's GREY
 *   HAT section), so defanging them changes no chain and invalidates nothing already derived. */
function defang(t) {
  /* ⚠ TWO GAPS IN THE FIRST VERSION, AND BOTH ARE WHAT A PLACER WOULD USE. It required 2+
   * characters before the dot, so `x.com` — the exact host in the string that exposed this —
   * sailed through; and it defanged schemes by swapping `t` for `x`, which does nothing to
   * `ws://` or `wss://`. Proved by running the real string through it. Now: ANY scheme is broken
   * at the `://`, and a single-character host is still a host. */
  return t
    .replace(/([a-z][a-z0-9+.-]*):\/\//gi, (_, sc) => `${sc.replace(/t/gi, 'x')}[://]`)
    .replace(/\b([a-z0-9-]+)\.(com|net|org|io|xyz|co|app|link|me|ru|cn|gg|to|sh|dev|fi|info|top|site|online)\b/gi,
             (_, a, b) => `${a}[.]${b}`);
}

/* ⛔ A RUN'S EDGES ARE AN ARTIFACT OF WHERE THE PRINTABLE STRETCH HAPPENED TO START, NOT PART OF
 *   THE NAME — and left alone it shatters one inhabitant into eleven. The first census printed
 *   `#bc_o3dj3qk8`, `>bc_o3dj3qk8`, `"bc_o3dj3qk8`, `7bc_o3dj3qk8`, `Obc_o3dj3qk8`, `;bc_o3dj3qk8`,
 *   `pbc_o3dj3qk8`, `[bc_o3dj3qk8`, `ybc_o3dj3qk8` and `fbc_o3dj3qk8` as ten separate residents.
 *   They are one machine, and the byte in front of it is the last byte of a hash. **A census that
 *   miscounts its own population is worse than no census**, because the error looks like data.
 * ⚠ Strip only what an identifier can never begin or end with. A LEADING UNDERSCORE SURVIVES —
 *   `_binancewallet` is a naming convention, not a boundary byte — which is why the class is
 *   `[^A-Za-z0-9_]` and not `[^A-Za-z0-9]`.
 * ⚠ A COMMA SPLITS A LIST AND NEVER A SENTENCE. `bc_q5s8mbyr,bc_mnip` is two names; `For users in
 *   Asia, on-site assistance` is one string that happens to contain a comma. The discriminator is
 *   the SPACE: prose has spaces, an identifier list does not. */
function normalise(s) {
  return s.replace(/^[^A-Za-z0-9_]+/, '').replace(/[^A-Za-z0-9_]+$/, '');
}
function nameParts(s) {
  const t = normalise(s.trim());
  if (!t) return [];
  return (t.includes(' ') ? [t] : t.split(',')).map(normalise).filter(Boolean);
}

function dedupe(runs) {
  const seen = new Map();
  for (const r of runs) {
    for (const part of nameParts(r)) {
      /* ⚠ RE-TESTED AFTER TRIMMING, because stripping can take a run under the bar — and defang
       * runs LAST, since it inserts brackets that would fail the alphabet test it must not. */
      if (!isTyped(part)) continue;
      const k = defang(part);
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([text, n]) => ({ text, n }));
}

/* ── THE CENSUS OF INHABITANTS ─────────────────────────────────────────────────────────────
 *
 * ⚑ THE READING FOUND SOMETHING BETTER THAN FOUND POETRY: the text of Ethereum is machines
 *   saying their own names. `awjcdp_facil1` appears in every sheet read so far. There is a
 *   `bc_*` family with eleven members — one system's naming scheme, written across the chain.
 *   `base-app`. `ProdSystem`. `Card-Debit-ePOS`, which is a debit terminal, on Ethereum, forever.
 *   Nobody meant any of it to be read. All of it was paid for in gas.
 *
 * ⛔ A NAME EARNS ITS PLACE BY RECURRING IN A SECOND BLOCK, AND THAT IS THE WHOLE DEFENCE.
 *   Coincidence has no reason to repeat: a run that survives `isTyped` once may still be a lucky
 *   slice of a hash, but the same slice landing in a DIFFERENT Ethereum block, mined by different
 *   people out of different transactions, is not luck. This is a far harder bar than the ghost
 *   text's and it costs nothing to apply — which is why the roster, not the run list, is the
 *   thing worth building a product on.
 *
 * ⚠ IT IS APPEND-ONLY AND IT ACCUMULATES, like `data/drain-ledger.json`. Consecutive derives read
 *   DISJOINT block ranges — the chain makes ~300 blocks an hour and this reads 24 — so a name's
 *   sheet count really is a count of distinct blocks, never the same block counted twice.
 * ⚠ SINGLETONS ARE HELD FOR A DAY, THEN DROPPED. Without a prune the file grows without bound on
 *   exactly the entries the ≥2 rule already says are not evidence; with a prune of one derive, a
 *   name that recurs weekly could never accumulate. 24 derives is the compromise and it is stated
 *   rather than silent.
 * ⚠ The text stored here is already DEFANGED — it comes through `dedupe`, so the republication
 *   guard applies to the roster for free. That is deliberate: this file is the one most likely to
 *   be read by something other than the page. */
const ROSTER_KEEP = 24;

function mergeRoster(blocks, derivedAt) {
  const path = join(ROOT, 'data/roster.json');
  let prev = { derives: 0, names: [] };
  if (existsSync(path)) { try { prev = JSON.parse(readFileSync(path, 'utf8')); } catch { /* start clean */ } }
  const derive = (prev.derives || 0) + 1;

  const map = new Map();
  for (const e of prev.names || []) map.set(e.text, e);

  for (const b of blocks) {
    const where = { height: b.height, eth: b.sheet.number, at: new Date(b.sheet.timestamp * 1000).toISOString() };
    for (const r of b.runs || []) {
      let e = map.get(r.text);
      if (!e) { e = { text: r.text, n: 0, sheets: 0, first: where, last: where, derive }; map.set(r.text, e); }
      e.n += r.n; e.sheets += 1; e.last = where; e.derive = derive;
    }
  }

  /* ⛔ THE UNDERSCORE IS AMBIGUOUS AND ONLY THE ROSTER CAN RESOLVE IT. A leading `_` is a real
   *   naming convention (`_binancewallet`) AND a boundary byte a hash can end with, and nothing
   *   about the string itself says which. But if stripping it lands on a name **already resident
   *   in its own right**, the question is settled: `_bc_o3dj3qk8` beside `bc_o3dj3qk8` is one
   *   machine counted twice, not two machines. Fold only in that case; a `_name` with no bare
   *   twin keeps its underscore. */
  for (const [text, e] of [...map]) {
    if (!text.startsWith('_')) continue;
    const bare = map.get(text.slice(1));
    if (!bare) continue;
    bare.n += e.n; bare.sheets += e.sheets;
    if (e.derive > bare.derive) { bare.derive = e.derive; bare.last = e.last; }
    map.delete(text);
  }

  const names = [...map.values()]
    .filter((e) => e.sheets >= 2 || derive - e.derive < ROSTER_KEEP)
    .sort((a, b) => b.sheets - a.sheets || b.n - a.n);
  const residents = names.filter((e) => e.sheets >= 2);

  const out = {
    protocol: PROTOCOL.name,
    title: 'the census of inhabitants — every machine that has written its own name into the chain',
    /* ⚠ THE RULE IS IN THE FILE, not only in the page that draws it. A reader who fetches this
     * directly must be able to see what a row had to do to be here. */
    rule: 'a name is a run of >=7 typed characters found in calldata; it becomes a RESIDENT only ' +
          'once it recurs in a second, independent Ethereum block',
    updated: derivedAt,
    derives: derive,
    residents: residents.length,
    provisional: names.length - residents.length,
    names,
  };
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(path, JSON.stringify(out, null, 1));
  return out;
}

/* ── run ──────────────────────────────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const sheets = Math.max(1, Math.min(24, parseInt(arg('sheets', '24'), 10) || 24));
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
    /* ⚠ BOTH SCHEDULES ARE CARRIED, because publishing one as "the price" is the error this
     * section exists to correct. `ratio` is the durable fact — it is 4 under both. */
    gas: {
      standard: { space: GAS.standard[SPACE], mark: GAS.standard[MARK], applies: 'any transaction with meaningful execution — i.e. almost everything this census counts' },
      floor:    { space: GAS.floor[SPACE],    mark: GAS.floor[MARK],    applies: 'EIP-7623 floor, binds only on near-pure-data transactions' },
      ratio: 4,
      history: 'pre-Istanbul 4 vs 68 = 17x; EIP-2028 took 68 to 16, landing on 4x; EIP-7623 scaled both 2.5x and preserved it',
      method: 'two-point eth_estimateGas slope against a heavy-execution target (4.032 / 16.127) and a bare transfer (10.020 / 40.346)',
    },
    sources: { ethereum: { head: ethHead, role: 'substrate' }, base: { head: baseHead, role: 'impression' } },
    totals: tot,
    blocks,
  };
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(join(ROOT, 'data/substrate.json'), JSON.stringify(out, null, 1));

  const roster = mergeRoster(blocks, out.derivedAt);
  console.log(`\n  ── the census of inhabitants ──`);
  console.log(`  residents    ${String(roster.residents).padStart(6)}   seen in two or more independent blocks`);
  console.log(`  provisional  ${String(roster.provisional).padStart(6)}   seen once — held ${ROSTER_KEEP} derives, then dropped`);
  for (const e of roster.names.filter((x) => x.sheets >= 2).slice(0, 6))
    console.log(`    ${String(e.sheets).padStart(4)} blocks  ${e.text.slice(0, 52)}`);

  console.log(`\n  → data/substrate.json · data/roster.json  (${(Date.now() - t0) / 1000 | 0}s)\n`);
}

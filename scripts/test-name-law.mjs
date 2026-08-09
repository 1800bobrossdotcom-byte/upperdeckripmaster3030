/* THE NAME LAW, AS A TEST.   npm run test:name
 *
 * ⛔ WHY THIS EXISTS. The studio renamed to `ripmaster3030studios` on 2026-08-01 and the sweep
 *    touched 258 files. On 2026-08-02 the retired name was still live on nine surfaces, including
 *    every one of these:
 *
 *      · the PRE-LAUNCH GATE's logo — `/upperdeckripmaster3030_01_marquee.png`, with an alt
 *        attribute that already read `ripmaster3030studios`. The first thing every visitor saw.
 *      · index.html's `og:image` and `twitter:image` — the same bitmap. Every share, every chat
 *        unfurl, every preview card.
 *      · whitepaper / tokenomics / audit / artist `og:image` — `marquee-header.webp`, whose
 *        PIXELS read "UPPERDECK RIPMASTER 3030". Grep finds nothing wrong with that filename.
 *      · js/wallet.js's WalletConnect `metadata` — the dApp name and URL shown INSIDE the user's
 *        wallet. A collector on ripmaster3030studios.com was asked to approve a connection from a
 *        different name at a different domain, which is the exact shape of a phish.
 *      · js/session.js's SIWE statement — the sentence a user reads in their wallet before signing.
 *      · api/lore.js's system prompt — so generated card lore could name the retired studio.
 *
 * ⚑ THE PATTERN, AND WHY A TEST AND NOT A CHECKLIST. Every one of those is a surface nobody LOOKS
 *   at while working: a meta tag, a wallet sheet, a system prompt, a bitmap's interior. The rename
 *   was applied everywhere it was visible and missed everywhere it was not — docs/ROADMAP.md §5.
 *   A checklist has the same blind spot as the person writing it. A test does not.
 *
 * ⚑ TWO CHECKS, BECAUSE THERE ARE TWO WAYS TO CARRY A NAME:
 *     1. THE STRING, in anything a visitor can reach — markup, attributes, JS string literals.
 *        Comments are exempt: the history of this bug is worth recording next to the fix, and
 *        rewriting the record to match the present would make it false (same reason CLAUDE.md
 *        keeps the Sepolia rehearsal logs saying UR3030 — that edition's symbol really was that).
 *     2. THE PICTURE. `marquee-header.webp` is 178 KB of type that spells the dead name and its
 *        filename is innocent. No string search will ever find it, so the assets whose PIXELS
 *        carry the retired name are listed by hand and any reference to one is a failure.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEAD = 'upperdeckripmaster3030';

/* EIP-55: hex digits are upper-cased where the corresponding nibble of keccak256(lowercase addr)
 * is >= 8. Implemented against viem's keccak so the test has no hand-rolled hash in it. */
import { keccak256, toHex } from 'viem';
const checksum = (addr) => {
  const lower = addr.toLowerCase().replace(/^0x/, '');
  const h = keccak256(toHex(lower)).replace(/^0x/, '');
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(h[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  return out;
};

const LIVE = 'ripmaster3030studios';

/* ⛔ THE CAP HAS ONE DECLARATION AND EVERY DEPLOY COMMAND IS CHECKED AGAINST IT.
 *   `maxTotalSupply` is frozen the instant the transaction lands, and this repo has already been
 *   bitten twice on it: once by `--total-supply` being ABSENT from every runbook (the CLI silently
 *   defaults to 1,000,000, which is why the Sepolia edition reads 1,000,000 — nobody chose that),
 *   and once by the number itself moving. Read from `scripts/token-model.mjs`, the file
 *   `npm run model` runs, so a doc and the model cannot disagree about a permanent. */
const MODEL_CAP = (() => {
  const m = /^const CAP\s*=\s*([0-9_]+)/m.exec(readFileSync(join(ROOT, 'scripts/token-model.mjs'), 'utf8'));
  if (!m) { console.log('  FAIL cannot read CAP from scripts/token-model.mjs'); process.exit(1); }
  return Number(m[1].replace(/_/g, ''));
})();

/* Mirrors .vercelignore — if it does not ship, it is not a surface. `docs/` in particular holds
 * the rehearsal records, which are HISTORY and must keep saying what actually happened. */
const SKIP_DIR = new Set(['node_modules', '.git', 'docs', 'scripts', 'contracts', 'build', '.claude',
                          'tmp_naming', 'out', 'cache', 'lib']);
const SCAN_EXT = new Set(['.html', '.js', '.mjs', '.json', '.css', '.svg', '.webmanifest']);
/* SVG is markup, not script: its comments are <!-- -->. Running it down the JS path treated the
 * whole one-line file as code and flagged an aria-label that was a genuine hit anyway - but it
 * would have missed a real <!-- --> exemption, so the classification is fixed rather than lucky. */
const MARKUP = new Set(['.html', '.svg']);

/* ⛔ ASSETS WHOSE PIXELS SPELL THE RETIRED NAME. Referencing one from a shipped page puts the dead
 *   name on screen no matter how clean the surrounding code reads. Both are kept on disk on
 *   purpose — they are the studio's own history — they simply may not be POINTED AT. */
const DEAD_ART = [
  'upperdeckripmaster3030_01_marquee.png',   // the old masthead bitmap
  'marquee-header.webp',                     // reads "UPPERDECK RIPMASTER 3030" in full
];

/* The npm package name and the lockfile that mirrors it. This is the repo/directory identifier,
 * not a surface anyone renders; renaming it churns the lockfile and every path in it to change
 * nothing a visitor sees. Recorded here so "why is it still there" has an answer.
 *
 * ⚑ AND `vercel.json`, WHICH IS THE ONE PLACE THE DEAD NAME MUST SURVIVE. The redirect that
 *   RETIRES the old domain has to name the old domain — you cannot forward a host you are not
 *   allowed to mention. It is the law's own instrument, not a leak past it, and it is the only
 *   file where the string appears in service of removing itself.
 * ⚠ Scoped deliberately: the whole file is exempt from the STRING sweep, and the redirect's shape
 *   is asserted separately at the bottom of this suite (host-scoped so it cannot loop,
 *   path-preserving, permanent, destination on the live domain). An exemption without a
 *   replacement check is just a blind spot with a comment on it. */
/* ⛔ `test-results.json` IS THE TEST HARNESS'S OWN OUTPUT AND IT FAILS THIS TEST. `test-all.mjs`
 *   writes it as it goes, and a suite that dies on a missing dependency records the error verbatim
 *   — including the ABSOLUTE PATH it was imported from, which begins `/home/user/upperdeckripmaster3030/`.
 *   The repo directory is still named for the retired studio, so the sweep reads a genuine hit in a
 *   file that ships nowhere. It is gitignored; the sweep walks the FILESYSTEM, not git, which is
 *   correct (an unignored stray must still be caught) and is exactly why this one needs naming.
 *   ⚑ The symptom is the worst kind: `npm run test:all` passes (name runs first, before the file
 *   exists) and the very next standalone `npm run test:name` fails with six errors that have nothing
 *   to do with the working tree. A checker that cries wolf at its own scratch paper gets muted —
 *   this file's own recorded lesson, from the CSS comment that explained the bug it flagged. */
const ALLOW = new Set(['package.json', 'package-lock.json', 'vercel.json', 'test-results.json']);

let fails = 0, checks = 0, files = 0;
const ok = (c, m) => { checks++; if (c) { console.log('  ok    ' + m); } else { fails++; console.log('  FAIL  ' + m); } };
const bad = m => { checks++; fails++; console.log('  FAIL  ' + m); };

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP_DIR.has(n) || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (SCAN_EXT.has(extname(p))) out.push(p);
  }
  return out;
}

/* Blank out comments, leaving everything else at its original offsets so line numbers survive.
 * String-aware, because `https://` inside a quoted URL is not the start of a comment — getting
 * that wrong would exempt half the file and the test would pass by being blind. */
function stripComments(src, isHTML) {
  const out = src.split('');
  const blank = (a, b) => { for (let i = a; i < b && i < out.length; i++) if (out[i] !== '\n') out[i] = ' '; };
  if (isHTML) {
    /* HTML holds JS in <script> AND CSS in <style>, so block comments appear inside both. Do the
     * markup comments here and recurse into each embedded body for the block ones.
     * WARN <style> IS NOT OPTIONAL - leaving it out reported index.html:118 as a violation, and
     *   that line is prose inside a CSS comment explaining this very bug. A checker that cries
     *   wolf on the note describing the fix gets muted, and then it is not a checker. */
    for (let i = 0; i < src.length; i++) {
      if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); blank(i, e < 0 ? src.length : e + 3); i = e < 0 ? src.length : e + 2; }
    }
    const cleaned = out.join('');
    let res = cleaned;
    const re = /<(?:script|style)\b[^>]*>([\s\S]*?)<\/(?:script|style)>/gi;
    let m;
    while ((m = re.exec(cleaned))) {
      const at = m.index + m[0].indexOf(m[1]);
      const inner = stripComments(m[1], false);
      res = res.slice(0, at) + inner + res.slice(at + inner.length);
    }
    return res;
  }
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {                 // a string: skip it whole
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); blank(i, e < 0 ? src.length : e); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); blank(i, e < 0 ? src.length : e + 2); i = e < 0 ? src.length : e + 2; continue; }
    i++;
  }
  return out.join('');
}

console.log('\n── the retired name may not appear outside a comment ──');
const all = walk(ROOT);
const hits = [];
for (const p of all) {
  const rel = relative(ROOT, p);
  if (ALLOW.has(rel)) continue;
  files++;
  const src = readFileSync(p, 'utf8');
  if (!src.includes(DEAD)) continue;
  const code = stripComments(src, MARKUP.has(extname(p)));
  code.split('\n').forEach((line, n) => {
    if (line.includes(DEAD)) hits.push(`${rel}:${n + 1}  ${line.trim().slice(0, 90)}`);
  });
}
if (hits.length) hits.forEach(h => bad(h));
else ok(true, `${files} shipped files carry the retired name only in comments`);

/* ── FORM THREE: THE NAME WRITTEN AS SEPARATE WORDS ───────────────────────────────────────────
 * ⛔ THE SWEEP ABOVE PASSED ON 2026-08-02 WHILE THE RETIRED NAME WAS LIVE ON ~200 PAGES. It looks
 *   for the joined string `upperdeckripmaster3030`, and none of these are that string:
 *     · `Upperdeck ★ Ripmaster 3030`  — printed on 197 card backs
 *     · `UPPERDECK ★ RIPMASTER`       — the ring type inside ripmaster-roundel.svg, embedded by
 *                                       198 pages; its own aria-label already said the LIVE name,
 *                                       so the mismatch sat inside one file, exactly like gate.js
 *     · `UPPERDECK · RIPMASTER · 3030`— the side watermark on all four generated public pages
 *     · `UPPERDECK<br>RIPMASTER 3030` — the whitepaper PDF's COVER HEADLINE
 * ⚑ The recorded lesson was "a name travels TWO ways: as a string, and as pixels". That was one
 *   short. A name also travels as ITS OWN WORDS with anything at all between them — a separator,
 *   a star, a tag. Matching only the joined form is matching one spelling of many.
 * ⚠ The anchor is `UPPERDECK`, not `RIPMASTER`. `RIPMASTER 3030 STUDIOS` and `◂ Ripmaster 3030`
 *   are the LIVE mark and must keep passing; it is the retired first word that may never lead. */
console.log('\n── the retired name written as SEPARATE WORDS (any separator) ──');
const SPLIT_RE = /upperdeck[^a-z0-9]{0,8}ripmaster/gi;
{
  const splitHits = [];
  for (const p of all) {
    const rel = relative(ROOT, p);
    if (ALLOW.has(rel)) continue;
    const src = readFileSync(p, 'utf8');
    if (!SPLIT_RE.test(src)) { SPLIT_RE.lastIndex = 0; continue; }
    SPLIT_RE.lastIndex = 0;
    const code = stripComments(src, MARKUP.has(extname(p)));
    code.split('\n').forEach((line, n) => {
      const m = line.match(/upperdeck[^a-z0-9]{0,8}ripmaster/i);
      /* The joined form is already reported by the sweep above — do not double-count it. */
      if (m && !m[0].toLowerCase().startsWith(DEAD.slice(0, 21))) {
        splitHits.push(`${rel}:${n + 1}  ${line.trim().slice(0, 90)}`);
      }
    });
  }
  if (splitHits.length) splitHits.forEach(h => bad(h));
  else ok(true, 'no shipped file spells the retired name as separate words');
}
/* Regression pins for the three surfaces that were actually carrying it, because a sweep that
 * finds nothing is indistinguishable from a sweep that is looking in the wrong place. */
{
  /* ⚠ STRIPPED, not raw. The SVG carries a comment explaining what its ring type used to say, and
   *   reading the file raw fails on that note — comments are exempt everywhere else in this test
   *   for exactly the reason they must be exempt here. */
  const roundel = stripComments(readFileSync(join(ROOT, 'ripmaster-roundel.svg'), 'utf8'), true);
  ok(!/UPPERDECK/i.test(roundel), 'ripmaster-roundel.svg — the ring type carries no retired name');
  ok(roundel.includes('RIPMASTER ★ STUDIOS'), 'ripmaster-roundel.svg — the ring names the live studio');
  ok(!/SEASON/i.test(roundel), 'ripmaster-roundel.svg — and says nothing about seasons');

  const backs = readdirSync(join(ROOT, 'cards')).filter(f => f.endsWith('.html'));
  const stale = backs.filter(f => /Upperdeck[^a-zA-Z0-9]{0,4}Ripmaster/i
    .test(readFileSync(join(ROOT, 'cards', f), 'utf8')));
  ok(stale.length === 0, `card backs — ${stale.length ? stale.length + ' still print the retired team line' : `all ${backs.length} print the live studio`}`);
}

console.log('\n── art that SPELLS the retired name may not be referenced ──');
for (const art of DEAD_ART) {
  const refs = [];
  for (const p of all) {
    const rel = relative(ROOT, p);
    if (ALLOW.has(rel)) continue;
    const src = readFileSync(p, 'utf8');
    if (!src.includes(art)) continue;
    const code = stripComments(src, MARKUP.has(extname(p)));
    code.split('\n').forEach((line, n) => {
      if (line.includes(art)) refs.push(`${rel}:${n + 1}`);
    });
  }
  ok(refs.length === 0, `${art} — ${refs.length ? 'STILL REFERENCED by ' + refs.join(', ') : 'not referenced by any shipped file'}`);
}

console.log('\n── the surfaces that were actually wrong, named one by one ──');
/* Regression pins. Each of these was live on 2026-08-02 and each is invisible during normal work,
 * so each gets its own assertion rather than relying on the sweep above to notice. */
const pin = (file, want, why) => {
  const src = readFileSync(join(ROOT, file), 'utf8');
  ok(src.includes(want), `${file} — ${why}`);
};
pin('gate.js', "src=\"/media/site/mark-512.png\"", 'the pre-launch veil shows the generated mark');
pin('index.html', 'og:image" content="https://ripmaster3030studios.com/media/site/og-1200x630.png',
    'the share card is the generated mark');
pin('index.html', 'twitter:image" content="https://ripmaster3030studios.com/media/site/og-1200x630.png',
    'and so is the Twitter card');
pin('scripts/build-pages.mjs', 'media/site/og-1200x630.png',
    'the four generated pages inherit it from the shell, not from a hand-edit');
pin('js/wallet.js', "name: 'ripmaster3030studios'", 'the WalletConnect sheet names the live studio');
/* ⚠ WAS `url: 'https://ripmaster3030studios.com'` — a hard-coded APEX while the platform serves
 *   `www` as Production. The sheet is now derived from the host the collector is actually on
 *   (js/wallet.js `siteOrigin()`), so what this pins is the FALLBACK: an origin the site does not
 *   recognise must land on the live domain, never on whatever host served the page. The
 *   derivation itself is driven at a real studio host in `npm run test:wc` §3b. */
pin('js/wallet.js', "return 'https://ripmaster3030studios.com';",
    'and falls back to the live domain when the origin is unrecognised');
pin('js/session.js', 'Take a seat in the ripmaster3030studios arena', 'the SIWE statement matches the site');
pin('api/lore.js', `lore-keeper for "${LIVE}"`, 'generated lore names the live studio');
/* ⚠ Pinned to the PREFIX, not a filename. The assertion is "it shows the generated mark", and
 *   right-sizing a raster for its box is a routine call that should not break a name test. */
pin('superrare.html', 'media/site/mark-', 'the SuperRare embed shows the generated mark');
pin('cabinet.html', 'media/site/mark-', 'the cabinet embed shows it too');

/* The four generated pages are OUTPUT. If they have drifted from the shell that builds them, the
 * fix above is real in the source and absent from what ships — which is its own version of this
 * whole bug, so it is checked rather than assumed. */
/* ── THE TWO STRINGS THAT ARE BAKED IN AT DEPLOY AND CAN NEVER BE FIXED ───────────────────────
 * ⛔ `name()` and `symbol()` are POSITIONAL ARGUMENTS the artist types into the Rare CLI. They
 *    are frozen the moment the transaction lands, and this project already owns a token
 *    permanently stuck with a wrong name for exactly this class of slip (the Sepolia edition
 *    reads "Upperdeck Ripmaster 3030", title case). Task #70 exists because the deploy command
 *    is COPY-PASTED out of these docs — so the docs are the thing that has to be right, and a
 *    stale one is a live trap rather than a stale note.
 * ⚠ THE TOKEN AND THE STUDIO HAVE DIFFERENT NAMES ON PURPOSE (settled 2026-08-02):
 *      studio / domain / wordmark  = ripmaster3030studios
 *      ERC-20 name()               = ripmaster3030      <- shorter, no "studios"
 *      ERC-20 symbol()             = 3030
 *    So this must be an EXACT-STRING check. A substring test would pass on the studio name,
 *    which is the single most likely way the wrong string reaches the CLI. */
console.log('\n── the deploy command, which becomes name() forever ──');
const TOKEN_NAME = 'ripmaster3030', TOKEN_SYMBOL = '3030';
const DEPLOY_RE = /deploy multicurve "([^"]*)" "([^"]*)"/g;
/* ⚠ PLACEHOLDERS ARE NOT COMMANDS. Prose that says `deploy multicurve "…" "…"` while explaining a
 *   past correction, and MECHANICS.md's `"<NAME>" "<SYMBOL>"` template, both match the shape and
 *   neither is a string anyone pastes into a terminal. Failing on them would train the reader to
 *   ignore this section, which is worse than not having it. */
const PLACEHOLDER = a => a === '' || /^[…<]/.test(a);
/* ⛔ THE FILE LIST WAS HAND-PICKED AND MISSED THE LAUNCH RUNBOOK. It read TESTNET.md,
 *   TOKEN-MATH.md and CLAUDE.md — while SIX files carry a `deploy multicurve` line, and the three
 *   it skipped included **docs/LAUNCH-CHECKLIST.md**, i.e. the document actually open on launch
 *   night, on the one step that cannot be undone. ⚑ This is the recorded hand-picked-list failure
 *   verbatim ("a hand-picked list of pairs stops covering the layout the moment the layout
 *   moves" — the cabinet overlap check that omitted the one pair that collides). A list of files
 *   that must be right is exactly the kind of list that must be DERIVED. */
const DEPLOY_DOCS = [
  ...readdirSync(join(ROOT, 'docs')).filter(f => f.endsWith('.md')).map(f => 'docs/' + f),
  ...readdirSync(ROOT).filter(f => f.endsWith('.md')),
].filter(f => /deploy multicurve/.test(readFileSync(join(ROOT, f), 'utf8')));
/* ⛔ AND A DEAD FILE MAY NOT CARRY A LIVE WEAPON. TOKEN-MATH.md is banner-marked stale, and it was
 *   still holding a runnable deploy command whose name, symbol and preset had all been fixed
 *   while `--image` still pointed at `./cards/art/<hero>.png` — a path that resolves to nothing,
 *   in the placeholder deck task #71 deletes. A HALF-UPDATED command is more dangerous than a
 *   wholly stale one: the three things a reader spot-checks are all correct, so it reads as
 *   current. ⚑ And "marked dead" is not protection when the banner covers only NUMBERS and the
 *   hazard is a COMMAND — a reader obeying the banner exactly would still paste it. So the
 *   command was removed rather than corrected (the standing rule is that a doc silently edited
 *   to look current is worse than one plainly marked dead), and its ABSENCE is now the assertion. */
const DEAD_DOCS = { 'docs/TOKEN-MATH.md': 'banner-marked stale — must not carry a runnable deploy command' };
for (const [file, why] of Object.entries(DEAD_DOCS)) {
  ok(!DEPLOY_DOCS.includes(file), `${file} carries NO deploy command — ${why}`);
}
ok(DEPLOY_DOCS.length > 0, `deploy commands found to check  (${DEPLOY_DOCS.join(', ')})`);
ok(DEPLOY_DOCS.includes('docs/LAUNCH-CHECKLIST.md'),
  '…including the LAUNCH-CHECKLIST, the runbook open on the night');
for (const file of DEPLOY_DOCS) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const hits = [...src.matchAll(DEPLOY_RE)].filter(h => !PLACEHOLDER(h[1]) && !PLACEHOLDER(h[2]));
  if (!hits.length) continue;                  // template-only (MECHANICS.md's "<NAME>" "<SYMBOL>")
  for (const h of hits) {
    ok(h[1] === TOKEN_NAME, `${file} — name() is exactly "${TOKEN_NAME}"  (found "${h[1]}")`);
    ok(h[2] === TOKEN_SYMBOL, `${file} — symbol() is exactly "${TOKEN_SYMBOL}"  (found "${h[2]}")`);
  }
  /* ⛔ AND THE CURVE PRESET, WHICH IS A DEPLOY-TIME PERMANENT NOBODY HAD PINNED.
   * The preset decides the opening price and the whole liquidity shape, and it is frozen the
   * moment the transaction lands — exactly like name() and symbol() two lines up. It was
   * `medium-demand` in NINE files, including two copy-pasteable deploy commands, when SuperRare's
   * live mainnet preview recommends **low-demand** (zero initial RARE liquidity, no creator
   * allocation, opens ≈$0.08). ⚑ This is the copy-paste trap that already caught name and symbol
   * once, on a THIRD argument nobody had thought to check — which is the argument for pinning
   * every positional the artist types, not the ones we happen to have been burned by. */
  /* ⚠ FENCED BLOCKS ONLY, and I walked into the exact trap this file warns about before adding
   *   it: the first version matched anywhere, so it fired on the CLAUDE.md sentence RECORDING the
   *   fix — "Every one said `--curve-preset medium-demand`". A checker that cries wolf on the note
   *   describing its own bug gets muted, and then it is not a checker. Prose quoting the retired
   *   value is history and must stay; a string someone can PASTE INTO A TERMINAL lives in a fence. */
  const fenced = (src.match(/```[\s\S]*?```/g) || []).join('\n');
  const badPreset = fenced.match(/--curve-preset\s+(?!low-demand)(\S+)/);
  ok(!badPreset, `${file} — every pasteable deploy command uses --curve-preset low-demand`,
    badPreset ? 'found ' + badPreset[1] : 'low-demand');

  /* ⛔⛔ EVERY PIN ABOVE CHECKS AN ARGUMENT THAT IS PRESENT. NONE OF THEM COULD ASK WHETHER A
   *    REQUIRED ONE WAS MISSING — and on 2026-08-06, running the documented command for real,
   *    the preview came back:
   *
   *        Max total supply: 1000000        <- the settled cap is 3,300,000
   *
   *    `--total-supply` appears in NO deploy command anywhere in this repo, and the CLI silently
   *    defaults to 1,000,000. `maxTotalSupply` is frozen at deploy. Every runbook here would have
   *    minted a token with a THIRD of the intended supply, permanently, and the pins would all
   *    have been green — because they were watching the arguments we had already been burned by.
   *    ⚑ It is also why the Sepolia rehearsal edition reads 1,000,000: nobody chose that number,
   *    it was the default, and it looked deliberate for months.
   *    ⚑ THE GENERALISATION: a copy-paste guard that only validates what is written cannot see an
   *    OMISSION, and an omitted argument on a CLI with defaults is indistinguishable from a
   *    deliberate choice. Assert the argument is THERE before asserting it is right.
   * ⚠ Only fenced blocks that actually deploy — `--preview`-less prose and the `--help` output
   *   are not commands anyone pastes to mint something. */
  for (const cmd of fenced.match(/rare liquid-edition deploy multicurve[^\n`]*/g) || []) {
    if (/<NAME>|<SYMBOL>|…/.test(cmd)) continue;          // templates, not pasteable commands
    const supply = cmd.match(/--total-supply\s+(\S+)/);
    ok(!!supply, `${file} — the deploy command SETS --total-supply (the CLI defaults to 1,000,000)`,
      supply ? supply[1] : 'MISSING — would mint 1,000,000');
    /* ⚑ THE CAP IS READ FROM token-model.mjs, NOT RESTATED HERE. It moved 3,300,000 → 3,030,000
     *   on launch day (artist: "mainnet plan should be 3,030,000 tokens $3030" — the supply and
     *   the ticker are the same number, which is the version of this decision that explains
     *   itself). A literal in this test would have been a SECOND source of truth for a
     *   deploy-time permanent, and the failure mode is the worst available: the guard keeps
     *   passing while pinning the superseded number, exactly like the 30.7% pins that had to be
     *   inverted. One declaration, in the file `npm run model` runs. */
    ok(supply && supply[1] === String(MODEL_CAP),
      `${file} — …and it is the settled cap from token-model.mjs, ${MODEL_CAP}`,
      supply ? supply[1] : 'none');
    /* The chain is not permanent, but deploying the launch token to the wrong one wastes the
     * name and the moment — and the CLI defaults to whatever `rare configure` last set. */
    const chain = cmd.match(/--chain\s+(\S+)/);
    ok(!!chain, `${file} — …and names its --chain explicitly`, chain ? chain[1] : 'MISSING');
  }
}
/* ── ⛔ THE TREASURY IS A DEPLOY-TIME PERMANENT TOO ───────────────────────────────────────────
 * `chain-config.treasury` becomes PackSink's `treasury` constructor argument, which is
 * `immutable`: half of every pack and half of every game rake go there forever, and a wrong
 * value is a redeploy rather than a setting.
 * ⚠ IT WAS THE SEPOLIA DEPLOYER UNTIL 2026-08-06 — on mainnet that would have paid studio
 *   revenue to a testnet-era wallet, while js/eth-play.js was already paying the arcade fee to
 *   the SuperRare wallet. Two destinations for one studio's money, and nothing was checking.
 * ⚑ Pinned by ADDRESS, not by "is it non-empty": an empty check passes on any wrong address,
 *   which is the whole failure mode. Same argument as name(), symbol() and the curve preset. */
{
  const STUDIO_WALLET  = '0x8455cF296e1265b494605207e97884813De21950';   // COLD Ledger — receives, never signs
  const DEPLOY_WALLET  = '0x432D71bA14D2602B566dD9e3e098E24859d166c9';   // SuperRare account — HOT, deploys
  const SEPOLIA_WALLET = '0x5C3bc6dD6d5b9913d267527275dD95ceB235d89F';   // testnet deployer
  const cfg = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
  const m = cfg.match(/treasury:\s*'(0x[0-9a-fA-F]{40})'/);
  ok(!!m, 'chain-config declares a treasury address');
  ok(m && m[1] === STUDIO_WALLET,
    'chain-config.treasury is the studio wallet (PackSink immutable arg)', m ? m[1] : 'none');
  ok(m && m[1] !== SEPOLIA_WALLET,
    '…and is NOT the Sepolia deployer', m && m[1] === SEPOLIA_WALLET ? 'STILL SEPOLIA' : 'ok');
  /* ⛔ AND NOT THE DEPLOY WALLET — that is the whole point of a cold treasury. The deploy wallet
   *   must be hot (it signs the edition, it connects to SuperRare, it owns the lens); a balance
   *   that only ever grows must not sit behind it. Asserting "not empty" or even "is the studio
   *   wallet" would both pass on the hot one, so the separation gets its own assertion. */
  ok(m && m[1] !== DEPLOY_WALLET,
    '…and is NOT the hot deploy wallet — the treasury is COLD',
    m && m[1] === DEPLOY_WALLET ? 'TREASURY IS THE DEPLOY KEY' : 'separate');
  /* One destination for studio money: the Base arcade fee must agree with the treasury. */
  /* ⛔ THE CLAIM SIGNER IS A FOURTH WALLET AND MUST NOT BE THE OWNER. It is a HOT key that signs
   *   hero vouchers all season; the owner can repoint every card in the deck. If the signer leaks
   *   and it is also the owner, the whole collection goes with it. `lens-cli verify` warns when
   *   they match, but a warning printed after the fact is not a guard — the runbook is pinned here
   *   so the wrong pair cannot reach the constructor in the first place.
   * ⚠ Fixable via setClaimSigner (unlike the treasury), so this is a quality gate, not a
   *   catastrophe gate — which is exactly why it is worth automating rather than remembering. */
  /* ⛔ AND THE FIRST VERSION OF THIS CHECK WAS A TAUTOLOGY. It declared `const SIGNER = '0x42A6…'`
   *   and then asserted `SIGNER !== DEPLOY_WALLET` — two literals this file writes itself, so the
   *   only edit that could ever fail it is an edit to this file. Every doc could name the wrong
   *   address and it would print three green ticks. Same shape as the redirect outage's test,
   *   which asserted that a host scope EXISTED rather than running it against the live hosts.
   * ⚑ SO THE ADDRESS IS READ OUT OF EACH POSITION THE ARTIST ACTUALLY TYPES FROM, and every one
   *   has to agree. The failure this guards is not "someone forgets the signer" — it is the
   *   copy-paste trap that has already bitten this project twice (the deploy command carrying the
   *   old name and symbol; `--image` pointing at the retired wordmark): one of four surfaces gets
   *   updated and the other three keep the old value, and the one nobody reread is the one open
   *   at 11 PM. Four positions, four extractions, one assertion each. */
  {
    const SIGNER = '0x42A6baD4Ba3e6A3Ac5E14935F55Ee1ACfBCeb049';
    const rb = readFileSync(join(ROOT, 'docs/DEPLOY-LENS.md'), 'utf8');
    const lc = readFileSync(join(ROOT, 'docs/LAUNCH-CHECKLIST.md'), 'utf8');
    const ADDR = /0x[0-9a-fA-F]{40}/;
    /* Each entry: the line that carries the signer, and how the artist meets it. */
    const seats = [
      ['DEPLOY-LENS `--signer` flag (Route B, the string typed at the CLI)',
        (rb.match(/--signer\s+(0x[0-9a-fA-F]{40})/) || [])[1]],
      ['DEPLOY-LENS constructor arg 4 (Route A, pasted into Remix)',
        ((rb.split('\n').find(l => /claimSigner_/.test(l)) || '').match(ADDR) || [])[0]],
      ['DEPLOY-LENS wallet table, claim-signer row',
        ((rb.split('\n').find(l => /^\|.*claim signer/i.test(l)) || '').match(ADDR) || [])[0]],
      ['LAUNCH-CHECKLIST address table, claim-signer row',
        ((lc.split('\n').find(l => /^\|.*claim signer/i.test(l)) || '').match(ADDR) || [])[0]],
    ];
    for (const [where, got] of seats) {
      ok(got === SIGNER, `claim signer — ${where}`, got || 'NOT FOUND');
    }
    /* ⛔ AND THE SEPARATION IS ASSERTED AGAINST WHAT THE DOCS SAY, not against my own constants.
     *   The signer is a HOT key that signs vouchers all season; the owner can repoint every card
     *   in the deck. If they are the same address and it leaks, the whole collection goes with
     *   it. `lens-cli verify` warns when they match — but a warning printed after the deploy is
     *   not a guard. ⚠ Fixable later via setClaimSigner (unlike the treasury's immutable args),
     *   so this is a quality gate rather than a catastrophe gate; it is automated precisely
     *   because "we'll remember to use a different wallet" is the kind of thing nobody does at
     *   11 PM with a countdown running. */
    const typed = seats.map(s => s[1]).filter(Boolean);
    ok(typed.length > 0 && typed.every(a => a.toLowerCase() !== DEPLOY_WALLET.toLowerCase()),
      '…and no signer position carries the owner/deploy wallet',
      typed.find(a => a.toLowerCase() === DEPLOY_WALLET.toLowerCase()) || 'separate');
    ok(typed.length > 0 && typed.every(a => a.toLowerCase() !== STUDIO_WALLET.toLowerCase()),
      '…nor the cold treasury — a signer has to sign, so it cannot be cold',
      typed.find(a => a.toLowerCase() === STUDIO_WALLET.toLowerCase()) || 'separate');
  }

  const ep = readFileSync(join(ROOT, 'js/eth-play.js'), 'utf8');
  const h = ep.match(/const HANGAR = '(0x[0-9a-fA-F]{40})'/);
  ok(h && h[1] === STUDIO_WALLET,
    'js/eth-play.js pays the arcade fee to the SAME cold wallet', h ? h[1] : 'none');
  /* ⚠ Checksummed, because a lowercase or mixed-case variant is the same account on-chain but a
   *   different STRING here, and this file's whole job is string drift. */
  ok(m && /[A-F]/.test(m[1]) && /[a-f]/.test(m[1]),
    '…and is EIP-55 checksummed, not lowercased');
}

{
  const meta = JSON.parse(readFileSync(join(ROOT, 'token-metadata.json'), 'utf8'));
  ok(meta.name === TOKEN_NAME, `token-metadata.json name  — "${meta.name}"`);
  ok(meta.symbol === TOKEN_SYMBOL, `token-metadata.json symbol  — "${meta.symbol}"`);
}

/* ── DEPLOY-TIME PERMANENTS OUTSIDE THE SHIPPED TREE ──────────────────────────────────────────
 * ⛔ THE SWEEP ABOVE CANNOT SEE THESE AND THAT IS BY DESIGN — it mirrors .vercelignore, so
 *    `scripts/` and `contracts/` are skipped because they do not ship to the CDN. But "does not
 *    ship" is not the same as "cannot hurt you": both of the strings below get written into a
 *    DEPLOYED CONTRACT and read by collectors.
 *      · scripts/lens-cli.mjs passed the RETIRED DOMAIN as the lens's externalUrl and
 *        lensBaseUrl, so every token minted would have been born with external_url and
 *        animation_url on upperdeckripmaster3030.com. Recoverable via setUrls(), but
 *        marketplaces cache metadata hard.
 *      · Ripmaster3030Lens721.sol generates the animation_url HTML ON-CHAIN, and its byline read
 *        `upperdeckripmaster3030`. There is NO SETTER for that one — the string is compiled into
 *        the bytecode, so fixing it after a deploy means deploying a new contract.
 *    Both were live on 2026-08-02, four days before launch, and neither was reachable by any
 *    check that existed. Hence these three explicit pins. */
console.log('\n── deploy-time permanents (scripts/ and contracts/ are skipped by the sweep) ──');
{
  const cli = readFileSync(join(ROOT, 'scripts/lens-cli.mjs'), 'utf8');
  const cliCode = stripComments(cli, false);
  ok(!cliCode.includes(DEAD), 'lens-cli.mjs constructor args carry no retired domain');
  ok(cliCode.includes("'https://ripmaster3030studios.com'"), 'the lens externalUrl is the live domain');
  ok(cliCode.includes("'https://ripmaster3030studios.com/cards/hero/'"), 'and so is lensBaseUrl');

  const sol = readFileSync(join(ROOT, 'contracts/Ripmaster3030Lens721.sol'), 'utf8');
  const solCode = stripComments(sol, false);
  ok(!solCode.includes(DEAD),
     'the on-chain animation_url HTML has no retired name in it (there is no setter for this one)');
  ok(solCode.includes("'<div class=b>ripmaster3030studios &#183;"), 'the generated byline names the live studio');
  /* ⚠ The EIP-712 domain is the third permanent and the most dangerous to touch: it is part of
   *   every voucher digest, so changing it after one real voucher is signed invalidates them all.
   *   Pinned so it can never be "tidied" to match something else. */
  ok(solCode.includes('EIP712("ripmaster3030studios", "1")'),
     'the EIP-712 domain is ripmaster3030studios — DO NOT CHANGE after a voucher is signed');

  /* ⛔ AND THE RUNBOOK, WHICH IS THE ROUTE THE ARTIST IS ACTUALLY SENT DOWN.
   *   The three pins above cover scripts/lens-cli.mjs — Route B. docs/DEPLOY-LENS.md recommends
   *   Route A (Remix), where the artist TYPES these six constructor values by hand, and its table
   *   carried `upperdeckripmaster3030 lens` plus the retired domain twice until 2026-08-05.
   *   `name_` HAS NO SETTER: a wrong one is a redeploy, not a correction. So the tested route was
   *   the one nobody uses and the recommended route was unchecked — the LAUNCH-CHECKLIST failure
   *   again, one document over. A runbook is a deploy surface. */
  const runbook = readFileSync(join(ROOT, 'docs/DEPLOY-LENS.md'), 'utf8');
  const ctor = runbook.slice(runbook.indexOf('| # | field | value |'), runbook.indexOf('⛔ **THIS TABLE'));
  ok(ctor.length > 0 && !ctor.includes(DEAD),
     'DEPLOY-LENS.md constructor table carries no retired name or domain');
  ok(ctor.includes('`ripmaster3030studios lens`'),
     'the runbook names the lens ripmaster3030studios lens — frozen at deploy, NO SETTER');
  ok(ctor.includes('`3030L`'), 'the runbook carries the lens symbol 3030L');
  ok(ctor.includes('`https://ripmaster3030studios.com`')
     && ctor.includes('`https://ripmaster3030studios.com/cards/hero/`'),
     'the runbook carries the live externalUrl and lensBaseUrl');
  /* ⚠ Route A and Route B must not drift apart — they deploy the SAME contract, so a value that
   *   differs between them means one of the two is wrong and only one of them is tested. */
  for (const s of ['ripmaster3030studios lens', '3030L',
                   'https://ripmaster3030studios.com', 'https://ripmaster3030studios.com/cards/hero/']) {
    ok(cliCode.includes(`'${s}'`) && ctor.includes(`\`${s}\``),
       `Route A and Route B agree on "${s}"`);
  }
}

/* ── THE GENERATORS THAT WRITE THE SHIPPED TREE ───────────────────────────────────────────────
 * ⛔ THE 2026-08-01 RENAME PATCHED OUTPUT AND LEFT EVERY GENERATOR ARMED. `scripts/` is skipped by
 *   the sweep because it does not ship to the CDN — but these files WRITE the files that do, and
 *   several are run routinely (CLAUDE.md itself says of the public pages: "edit the source +
 *   regenerate, don't edit the HTML directly"). Found stale on 2026-08-02, four days out:
 *     · build-pages.mjs      the side watermark on all four generated public pages
 *     · build-whitepaper.mjs the PDF's cover HEADLINE, its watermark, and its hero BITMAP
 *     · build-hero-lens.mjs  the <title>, the visible card-back team line, the RETIRED DOMAIN in
 *                            `animation_url`/`external_url`, and the token description
 *     · restyle-backs.mjs    the team line + the dead-name bitmap on 197 card backs
 *     · ingest-batch.mjs · md-to-docs.mjs · generate-lore.mjs · fbx2glb.mjs · bake-fighter.mjs
 *       · morph-mesh.mjs     titles, kickers, an AI system prompt, and asset headers
 * ⚑ restyle-backs.mjs is the sharpest case: the shipped backs had ALREADY been repointed at the
 *   mark by hand, so generator and output disagreed and re-running it would have silently undone
 *   the fix. A generator is not "a script" — it is the source of a surface.
 * ⚠ Comments stay exempt here for the same reason as everywhere else: the record of the failure
 *   belongs next to the fix. This checks EMITTED strings only. */
console.log('\n── generators may not write the retired name into what they emit ──');
{
  const genHits = [];
  let scanned = 0;
  for (const f of readdirSync(join(ROOT, 'scripts')).filter(f => f.endsWith('.mjs'))) {
    /* ⚠ A HARNESS THAT FORBIDS THE NAME HAS TO BE ABLE TO SAY IT. This sweep's subject is what
     *   generators EMIT — a test script emits nothing, and `test-wc.mjs` names the retired studio
     *   inside the very assertion that keeps it out of the wallet approval sheet. Flagging that is
     *   the checker firing on its own fix, which is how a checker gets muted, and this file
     *   already carried the same exemption for itself. Scoped to `test-*.mjs` deliberately: no
     *   test harness here writes a shipped artifact (the one that writes anything at all puts
     *   .pgm masks into a gitignored build/ directory), so nothing they contain can reach a
     *   surface. ⛔ If a test ever starts GENERATING output, it stops qualifying and this
     *   exemption has to be narrowed. */
    if (/^test-.*\.mjs$/.test(f)) continue;
    scanned++;
    const src = readFileSync(join(ROOT, 'scripts', f), 'utf8');
    if (!/upperdeck/i.test(src)) continue;
    const code = stripComments(src, false);
    code.split('\n').forEach((line, n) => {
      if (!/upperdeck/i.test(line)) return;
      /* ⚠ ROOT/scratchpad path constants are real filesystem paths — the repo directory is still
       *   named for the old project (package.json is allow-listed for the same reason). They are
       *   not emitted into any artifact, so they are not violations. Matching on the quoted path
       *   prefix rather than on a variable name, because the variable is called different things
       *   in different scripts. */
      if (/['"`]\/(home|tmp)\//.test(line)) return;
      genHits.push(`scripts/${f}:${n + 1}  ${line.trim().slice(0, 88)}`);
    });
  }
  if (genHits.length) genHits.forEach(h => bad(h));
  else ok(true, `${scanned} generators emit nothing carrying the retired name`);
}
/* The two deploy-path pins that no string sweep could have found, because one is a FLAG pointing
 * at a picture and the other is a sentence in a runbook nobody opens until the night. */
{
  /* ⚠ READ THE COMMAND, NOT THE PAGE. A first cut grepped the whole of TESTNET.md for
   *   `--image .* marquee-header.webp` and failed on the BLOCKQUOTE that explains why that
   *   argument was wrong — a checker that fires on the note describing its own fix gets muted,
   *   and then it is not a checker (the same lesson the <style> stripper above records). So the
   *   fenced code blocks are pulled out first and only those are asserted on. */
  /* ⛔ AND IT CHECKED ONE DOC OUT OF THREE. This pin read only TESTNET.md, while the same
   *   `--image` flag appears in LAUNCH-CHECKLIST.md — the document actually open on launch night —
   *   and in TOKEN-MATH.md, which carried a THIRD answer: `./cards/art/<hero>.png`. That path
   *   resolves to nothing (`<hero>` is a literal placeholder) and points into the PLACEHOLDER
   *   deck being clean-slated by task #71. ⚑ Checking one of three is how the other two rot back
   *   in — this file's own recorded lesson, from the `#nogl` panels and the four cabinet names.
   *   So every doc is swept for fenced deploy commands and each one is held to the same bar. */
  const docFiles = readdirSync(join(ROOT, 'docs')).filter(f => f.endsWith('.md'))
    .map(f => ['docs/' + f, readFileSync(join(ROOT, 'docs', f), 'utf8')]);
  const imageArgs = [];                       // [file, path]
  for (const [file, src] of docFiles) {
    const fenced = [...src.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(m => m[1]).join('\n');
    for (const m of fenced.matchAll(/--image\s+(\S+)/g)) imageArgs.push([file, m[1]]);
  }
  ok(imageArgs.length > 0,
    `a deploy command carries an --image to check  (${imageArgs.map(a => a[1]).join(', ') || 'NONE'})`);
  for (const art of DEAD_ART) {
    const hit = imageArgs.find(a => a[1].includes(art));
    ok(!hit, `no --image hands the CLI ${art} as the token's permanent fallback art`,
      hit ? `${hit[0]} → ${hit[1]}` : 'clear');
  }
  ok(imageArgs.every(a => a[1].includes('media/site/mark-')),
    'EVERY --image in every doc hands the CLI the generated mark',
    imageArgs.map(a => a[1]).join(', '));
  /* ⛔ AND THE PATH HAS TO RESOLVE. `--image` is what SuperRare's flow calls "the initial fallback
   *   metadata" — the token's PERMANENT art, frozen at deploy. A path that does not exist is not
   *   caught by any name check, because there is no name in it to be wrong: the CLI simply fails
   *   at 11 PM, or worse, uploads whatever a shell glob happened to match. The file is on disk or
   *   the assertion fails. This is the cheapest possible check and nothing was doing it. */
  for (const [file, p] of imageArgs) {
    const rel = p.replace(/^\.\//, '');
    ok(existsSync(join(ROOT, rel)), `…and ${p} exists on disk  (${file})`);
  }

  /* ⛔ THE RUNBOOK NAMED THE TOKEN `upperdeckripmaster3030` UNTIL 2026-08-02 — on the one step
   *   that is irreversible, in the document read once, at 11 PM, under pressure. */
  const runbook = readFileSync(join(ROOT, 'docs/LAUNCH-CHECKLIST.md'), 'utf8');
  const nameClaim = runbook.match(/`name\(\)` must read `([^`]+)`/);
  ok(nameClaim && nameClaim[1] === TOKEN_NAME,
     `LAUNCH-CHECKLIST names the token "${nameClaim ? nameClaim[1] : 'NOT STATED'}" — must be "${TOKEN_NAME}"`);
  ok(/`symbol\(\)` must read `3030`/.test(runbook), 'LAUNCH-CHECKLIST states the symbol too');
  /* ⚠ Same trap as `--image`: the runbook QUOTES the retracted claim in order to correct it, so a
   *   bare search for the sentence fails on the correction itself. The assertion that survives
   *   rewording is the positive one — the runbook must show the CLI command the artist types,
   *   because "you type this yourself" is the fact the old text got wrong. */
  ok(/rare liquid-edition deploy multicurve "ripmaster3030" "3030"/.test(runbook),
     'LAUNCH-CHECKLIST shows the deploy command the artist types — the name is not handed over');
  ok(/--preview/.test(runbook), 'and tells them to --preview before --yes');
}

console.log('\n── the supply cap, stated in one place and spent everywhere ──');
/* ⚠ THE CAP HAS MOVED THREE TIMES — 3,030,000 → 33,000,000 → 3,300,000 → 3,030,000 — and each
 *   time the headline number got edited while something derived from it did not. The burn is
 *   denominated in tokens per pack, so the cap changes only the PERCENTAGES, which is precisely
 *   the class of edit that gets half-applied.
 * ⛔ SO THE MODEL IS THE ONLY DECLARATION AND EVERY PAGE IS CHECKED AGAINST IT — and there is
 *   deliberately NO assertion that the model's cap equals some number written here. That check
 *   would compare a literal in this file against a value READ FROM the model, i.e. two things
 *   this test controls, which is the tautology the claim-signer guard was caught being earlier
 *   today: three green ticks that no edit outside the test could ever fail. The claim worth
 *   making is "the pages agree with the model", and it needs exactly one source. */
{
  const capComma = MODEL_CAP.toLocaleString('en-US');           // 3,030,000
  for (const page of ['tokenomics.html', 'whitepaper.html']) {
    const src = readFileSync(join(ROOT, page), 'utf8');
    ok(!/33,000,000|>33M</.test(src), `${page} — no 33,000,000 left`);
    ok(src.includes(capComma), `${page} — states the cap the model declares (${capComma})`);
    /* ⚠ BOTH DIRECTIONS. "states the new cap" is satisfied by a page that states BOTH, which is
     *   what a find-and-replace that misses one table cell actually produces. */
    ok(!src.includes('3,300,000'), `${page} — and the superseded 3,300,000 is gone`);
  }
  /* ⚠ COMMENTS STRIPPED, for the same reason they are everywhere else in this file: the page's own
   *   mobile-table note QUOTES the retired cell ("30.7% of the 3,300,000 cap") as the example of what
   *   a cell used to look like. A checker that fires on the note explaining the fix gets muted, and
   *   then it is not a checker. */
  const tk = stripComments(readFileSync(join(ROOT, 'tokenomics.html'), 'utf8'), true);
  /* ⛔ THESE THREE PINS USED TO ASSERT 30.7% / 1.44x / 44.4% AND NOW ASSERT THEIR ABSENCE. That
   * inversion is the point, so it is written down rather than quietly swapped.
   *
   * SuperRare ran the live mainnet CLI previews on 2026-08-06 and measured the opening price at
   * ~$0.08 per $3030 — 4x the $0.02 the whole pack schedule assumed. Their conclusion:
   *   "we should not promise a fixed 30.7% burn. That model requires roughly 570 tokens per pack
   *    on average, already about $46 per pack at the opening price ... Better to publish live
   *    burn and studio totals."
   * Confirmed from our own numbers, from the other direction: 1,014,375 / 3,560 packs / 0.50 =
   * 570.0 gross tokens per pack, x $0.08 = $45.60.
   *
   * ⚑ SO A PERCENTAGE ON A PAGE IS NOW A PROMISE ABOUT A PRICE NOBODY CONTROLS — and it drifts in
   * the counter-intuitive direction: the pack is priced in DOLLARS, so a RISING token buys FEWER
   * tokens and burns LESS. A pinned number would go stale with nobody editing anything, which is
   * this file's own subject. The test therefore guards the ABSENCE of a forecast and the PRESENCE
   * of the live reading. Full record: docs/PACK-PRICING.md. */
  ok(!/30\.7\s*%/.test(tk), 'tokenomics.html — the 30.7% burn forecast is GONE (it assumed a $0.02 token)');
  ok(!/44\.4\s*%/.test(tk), 'tokenomics.html — and so is the 44.4% studio-slug forecast');
  ok(!/\$\s*7(\.00)?(?![\d,.])/.test(tk),
    'tokenomics.html — no $7 pack (350 tokens is $28 at the measured open)');
  /* ⚠ BOTH DIRECTIONS. "No percentage" is trivially satisfied by a page that says nothing about
   *   the burn at all, which would be worse than a wrong number — it would be silence about the
   *   mechanism the whole token rests on. So the live-reading language has to be there too. */
  ok(/live|on-chain|read from the chain/i.test(tk),
    'tokenomics.html — …and it says the burn is READ LIVE instead');

  /* ⛔ AND IT GUARDS EVERY PUBLIC PAGE, NOT JUST THIS ONE — which is this file's whole subject.
   * The first version of these pins checked `tokenomics.html` alone, so whitepaper.html,
   * audit.html, artist.html and the front page were free to keep publishing a $7 pack and a
   * 30.7% burn with the suite green. A surface nobody looks at rots; a surface nobody TESTS
   * rots while the build says it is fine. Checking one of five is how the other four rot back in. */
  for (const page of ['index.html', 'whitepaper.html', 'audit.html', 'artist.html', 'tokenomics.html']) {
    const src = stripComments(readFileSync(join(ROOT, page), 'utf8'), true);
    ok(!/30\.7\s*%/.test(src), `${page} — no 30.7% burn forecast`);
    ok(!/44\.4\s*%/.test(src), `${page} — no 44.4% studio-slug forecast`);
    ok(!/1\.44\s*×|1\.44x/i.test(src), `${page} — no 1.44x contraction forecast`);
    /* ⛔ BOTH OF THESE PINS WERE DEFEATED BY PUNCTUATION, AND audit.html WALKED THROUGH THE GAP.
     *   It carried "the pack is a ~350-token bundle ≈ $7." — the exact two figures this loop
     *   exists to forbid — and scored green on both, twice over:
     *     · `\b350\s*tokens?` cannot match `350-token`, because a HYPHEN is not whitespace;
     *     · `\$\s*7(?![\d,.])` cannot match `$7.` at the end of a sentence, because the lookahead
     *       that stops `$7` matching inside `$70` or `$7.50` also stops it matching a FULL STOP.
     *   ⚑ Each regex was written against the one phrasing that was on the page the day it was
     *   written. A pin tuned to a spelling is a pin that only guards that spelling — the same
     *   shape as the hand-picked file list this loop was itself built to replace, and as the
     *   `cost`/`need` variable-name match that missed pack.js's third flooring site. Match the
     *   SHAPE: any separator between the number and its unit, and no lookahead beyond digits. */
    ok(!/\$\s*7(\.00)?(?!\d|[.,]\d)/.test(src), `${page} — no $7 pack`);
    ok(!/\b350[\s\-–—]*(\$3030|tokens?)\b/i.test(src), `${page} — no 350-token pack`);
  }
}

/* ═══ THE GAME'S NAME ═════════════════════════════════════════════════════════════════════════
 * ✅ **THE CITY** — artist, 2026-08-03: *"the city is what we can call it."* The candidates
 * (STRAYS / FOUND / THE LOT / PERCH) are dead.
 *
 * ⚑ IT IS PINNED HERE THE MOMENT IT EXISTS, which is this repo's standing rule for a name, and the
 *   rule was written from two expensive lessons: the launch token's `name()` is frozen at deploy,
 *   and the 258-file studio rename was STILL WRONG on ~200 live surfaces a day after it "finished"
 *   — because a surface nobody opens rots. A name is not settled when it is decided. It is settled
 *   when something opens the surfaces that carry it.
 * ⚠ The check is deliberately about the SHIPPED SURFACES a visitor reads — the tab, the on-screen
 *   title, the arcade cabinet — not about the source comments. Comments are history and are exempt
 *   for the same reason the Sepolia rehearsal logs still say `UR3030`. */
console.log('\n── THE CITY: the game is named, and the name is on its surfaces ──');
{
  const GAME = 'THE CITY';
  const city = readFileSync(join(ROOT, 'city.html'), 'utf8');
  const arcade = readFileSync(join(ROOT, 'arcade.html'), 'utf8');

  const title = city.match(/<title>([^<]*)<\/title>/);
  ok(!!title && title[1].includes(GAME),
     `city.html <title> carries "${GAME}" — got ${title ? JSON.stringify(title[1]) : 'NO TITLE'}`);
  ok(new RegExp('id="hudTL"[^>]*>[\\s\\S]{0,40}' + GAME).test(city),
     'city.html — the on-screen title reads THE CITY');

  /* ⛔ THE DEAD CANDIDATES MUST NOT SURVIVE ANYWHERE A VISITOR LOOKS. Four names were floated and
   *   any of them left on a live surface reads as a game that has not decided what it is. Comments
   *   are stripped first, exactly as the studio-name sweep does — the note recording the decision
   *   necessarily mentions the names it rejected, and a checker that fires on its own explanation
   *   gets muted, and then it is not a checker. */
  const visible = stripComments(city, true) + "\n" + stripComments(arcade, true);
  for (const dead of ['STRAYS', 'THE LOT', 'PERCH']) {
    ok(!new RegExp('\\b' + dead + '\\b').test(visible),
       `no retired candidate "${dead}" on a live surface`);
  }
  ok(!/working title/i.test(visible), 'and "working title" is gone — the name is settled');

  // the arcade is where a visitor meets it, so that is the one that must not drift
  ok(/<a class="cab" id="ronin" href="city\.html">[\s\S]{0,400}<div class="nm">THE CITY<\/div>/.test(arcade),
     'arcade.html — the cabinet that links city.html is titled THE CITY');
  ok(!/NEON RONIN/.test(stripComments(arcade, true)), 'arcade.html — NEON RONIN is off the visible grid');
}

/* ═══ THE TICKER, ON THE SURFACES THAT PRINT IT ══════════════════════════════════════════════
 * ⛔ `$UR` WAS STILL BEING PRINTED TO PLAYERS ON 2026-08-05 — four days after `$UR3030` → `$3030`
 *   swept 258 files. Not in a doc: in `js/wallet-ui.js`'s BALANCE CHIP ("◈ 2,000 $UR"), which
 *   every page carrying the wallet header shows; in `js/arena-lobby.js`'s roster row, i.e. every
 *   ripper in three lobbies; and four times in THE ARENA's own copy — the pot, the ante, the
 *   opponent card and the tie message.
 * ⚑ WHY THE EXISTING SWEEP COULD NOT SEE IT: it anchors on `upperdeckripmaster3030`, on `UR3030`,
 *   and on the retired name written as separate words. `$UR` is a TRUNCATION — none of those
 *   patterns matches it, and it reads as a plausible abbreviation rather than as a leftover, which
 *   is exactly why it survived a 258-file pass and four days of people looking at it.
 *   **A name also travels as a piece of itself**, which is the same lesson as "a name travels as
 *   its own words with anything between them", one cut further in.
 * ⚠ Comments are exempt, as everywhere here — `cards/arena-net.js`'s header documents the old
 *   field name and that is history. What must not survive is a string a player reads. */
console.log('\n── the ticker a player reads is $3030, not a truncation of a dead one ──');
{
  const TICKER_SURFACES = ['js/wallet-ui.js', 'js/arena-lobby.js', 'cards/battle.html',
                           'cards/market.html', 'cards/binder.html', 'index.html'];
  for (const f of TICKER_SURFACES) {
    let src;
    try { src = readFileSync(join(ROOT, f), 'utf8'); } catch (e) { continue; }
    const visible = stripComments(src, f.endsWith('.html'));
    ok(!/\$UR\b/.test(visible), `${f} — no "$UR" on a surface a player reads`);
  }
}

console.log('\n── generated pages match their generator ──');
for (const page of ['whitepaper.html', 'tokenomics.html', 'audit.html', 'artist.html']) {
  const src = readFileSync(join(ROOT, page), 'utf8');
  ok(src.includes('media/site/og-1200x630.png') && !src.includes('marquee-header.webp'),
     `${page} — regenerated with the new share card`);
}

// ═══ THE DOMAIN, AND THE ONE THING A REDIRECT CANNOT FIX ═══════════════════════════════════════
/* Artist, 2026-08-05: "we should also set up ripmaster3030studios.com and our redirect stuff now."
 * ⚑ THE GIT REPO STAYS. A repository name is not a hostname — `upperdeckripmaster3030` is the npm
 *   and repo identifier, already allow-listed above with a reason, and Vercel serves any domain
 *   from any project. Renaming it would break clone URLs to buy nothing. */
{
  const vj = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  const red = vj.redirects || [];
  const hosts = red.flatMap(r => (r.has || []).map(h => h.value)).join(' ');
  ok(
    red.some(r => /upperdeckripmaster3030/.test(JSON.stringify(r.has || [])) &&
                  /ripmaster3030studios\.com/.test(r.destination) && r.permanent === true),
    'the old domain redirects to the new one');
  /* ⛔ HOST-SCOPED, OR IT IS AN INFINITE LOOP. A Vercel redirect with no `has` host condition
   * applies to EVERY domain the project serves — including the destination — so a bare
   * `/:path*` -> the new host would bounce the new host to itself forever. The scope is the
   * whole safety of this rule and it is invisible until the day the domain is attached. */
  /* ⚠ THE RULE IS ABOUT CROSS-HOST REDIRECTS, NOT ALL REDIRECTS, and the original wording
   *   conflated them. A redirect whose destination is an ABSOLUTE URL moves the visitor to
   *   another host and MUST be scoped, or it applies to every domain the project serves —
   *   including the destination — and bounces forever. A same-origin PATH redirect
   *   (/cards/7 -> /cards/hero/7.html) cannot do that: it never changes host, so a host scope
   *   would buy nothing and there is nothing to loop against as long as the destination does
   *   not match another source, which is asserted separately below.
   * ⛔ Narrowed deliberately and only this far. The outage was caused by an absolute redirect
   *   aimed at the live host; that case is still covered by BOTH assertions here. */
  /* ⛔ AN INVALID `source` DOES NOT DEGRADE — IT FAILS THE WHOLE DEPLOYMENT. Vercel parses these
   *   with path-to-regexp, which REJECTS capturing groups inside a `:param(...)` pattern. I wrote
   *   `/cards/:id(([1-9]|...))` and the build stopped dead: the site kept serving the previous
   *   commit, so every push afterwards silently did nothing and the only symptom was a 404 on the
   *   new files. ⚑ That is far worse than a broken redirect — a bad rule breaks one path, a bad
   *   SOURCE breaks every deploy after it, and nothing on the site changes to tell you.
   * ⚠ Checked without adding a dependency: the rule is exactly "no capturing group inside a
   *   param pattern", i.e. every `(` after the first must open `(?:`. */
  const badSrc = red.filter(r => {
    const m = /:[A-Za-z][A-Za-z0-9_]*\((.*)\)$/.exec(r.source);
    return m && /\((?!\?[:=!])/.test(m[1]);
  });
  ok(badSrc.length === 0,
    'every redirect `source` parses — no capturing group inside a :param() pattern — '
    + (badSrc.length ? '⛔ INVALID, THE WHOLE DEPLOY WILL FAIL: ' + badSrc.map(r => r.source).join(', ') : 'clear'));

  const crossHost = red.filter(r => /^https?:\/\//.test(r.destination));
  const samePath = red.filter(r => !/^https?:\/\//.test(r.destination));
  ok(crossHost.length > 0 && crossHost.every(r => (r.has || []).some(h => h.type === 'host')),
    '…and every CROSS-HOST redirect is scoped to a host, so it cannot loop — '+(hosts || 'NO HOST CONDITION'));
  /* ⛔ A SAME-ORIGIN REDIRECT LOOPS IF ITS DESTINATION MATCHES ANY SOURCE. Run the sources
   *   against the destinations rather than eyeballing them — the whole lesson of the outage was
   *   that asserting a rule EXISTS is not the same as running it. */
  const srcRe = s => new RegExp('^' + s
      .replace(/\/:[a-zA-Z]+\(\(?([^)]*)\)?\)/g, (_m, g) => '/(?:' + g.replace(/\)$/, '') + ')')
      .replace(/\/:[a-zA-Z]+\*/g, '/.*')
      .replace(/\/:[a-zA-Z]+/g, '/[^/]+') + '$');
  const selfLoop = samePath.filter(r => samePath.some(o => {
    try { return srcRe(o.source).test(r.destination.replace(/:([a-zA-Z]+)/g, '1')); } catch { return false; }
  }));
  ok(selfLoop.length === 0,
    '…and no same-origin redirect lands on another redirect\'s source — '
    + (selfLoop.length ? '⛔ LOOP: ' + selfLoop.map(r => r.source + ' -> ' + r.destination).join(', ') : 'clear'));

  /* ⛔ AND HOST-SCOPED IS NOT ENOUGH — THIS IS THE ONE THAT TOOK THE SITE DOWN, 2026-08-05.
   * A `www -> apex` rule lived here and was perfectly host-scoped. It still looped, because the
   * PLATFORM already owns apex<->www: the dashboard serves `www` as Production and 308s the apex
   * to it, so the app's rule bounced Production back to a host that bounced it straight back.
   * curl gave up at 50 hops; the artist got a dark site.
   * ⚑ THE RULE: apex<->www BELONGS TO THE PLATFORM AND NOWHERE ELSE. Whichever of the two is
   *   Production, a redirect here that matches EITHER of them is aimed at the host serving the
   *   site. So the test is not "is it scoped" but "what does the scope actually MATCH" — the
   *   regex is run against the live hosts rather than eyeballed. */
  /* ⚠ THE SUBDOMAIN IS A LIVE HOST TOO, from the day it resolves — listed so a future CROSS-HOST
   * redirect aimed at it fails the same way an apex/www one does.
   * ⛔ AND THE COMMENT HERE USED TO SAY IT "serves the reading at its own root via a REWRITE",
   * WHICH WAS NEVER TRUE. `vercel.json` rewrites are evaluated AFTER the filesystem check, and `/`
   * matches `index.html`, so that rule could not fire on the one path it named. The subdomain
   * quietly served the studio home page for its whole life while a rule in the config described
   * the behaviour somebody intended. **A note describing a mechanism that was never built is worse
   * than no note**, because it stops the next person looking. The rewrite is deleted; the root is
   * a same-host redirect to `/check.html` now, and it is CHECK rather than `3030.html` because
   * CHECK is the tool and `3030.html` is one of its answers.
   * ⛔ WHICH REQUIRED NARROWING THE GUARD BELOW, AND THE NARROWING IS THE POINT, NOT A CONCESSION.
   * The 2026-08-05 outage was a `www -> apex` rule fighting the platform's own `apex -> www`: two
   * HOSTS bouncing a visitor between them, fifty hops, a dark site. A same-host, path-only
   * redirect cannot do that — the visitor never leaves the host, and whether its destination is
   * itself a source is a question `selfLoop` above already runs for real. So this check now applies
   * to CROSS-HOST redirects only, which is exactly the class that caused the outage, and stays
   * absolute for them. ⚠ Widening it back to all redirects would forbid the only mechanism that
   * can serve a subdomain root at all. */
  /* ⛔ vercel.json HAS A STRICT SCHEMA AND AN UNKNOWN TOP-LEVEL KEY FAILS THE BUILD — SILENTLY,
   * AS FAR AS GIT IS CONCERNED. A `_comment_rewrites` key was added to explain a rewrite (JSON
   * has no comments, so one was invented) and it errored **six consecutive deploys**. Every push
   * succeeded, every commit looked clean, `git log` was perfect, and production went on serving a
   * commit from before the first of them. The pages 404'd and nothing in this repo said why.
   * ⚑ THIS IS THIS FILE'S OWN RECORDED RULE, PAID FOR AGAIN: *a deploy is not "pushed", it is
   *   "served".* The tell was one click away in the dashboard — six red rows against green ones
   *   for every scheduled snapshot commit.
   * ⚠ THE EXPLANATION NOW LIVES IN docs/DNS-AND-DOMAIN.md, where prose belongs. A config file
   *   with a schema is not a place to write to the reader. */
  {
    const OK_KEYS = new Set(['version', 'name', 'alias', 'scope', 'env', 'build', 'builds',
      'routes', 'cleanUrls', 'rewrites', 'redirects', 'headers', 'trailingSlash', 'regions',
      'functions', 'github', 'public', 'crons', 'images', 'framework', 'installCommand',
      'buildCommand', 'devCommand', 'outputDirectory', 'ignoreCommand', 'git', 'cron']);
    const bad = Object.keys(vj).filter(k => !OK_KEYS.has(k));
    ok(bad.length === 0,
      'vercel.json carries no unknown top-level key — one is a FAILED BUILD, not a warning',
      bad.length ? '⛔ ' + bad.join(', ') + ' — the deploy will error and the site will serve the previous commit' : Object.keys(vj).join(', '));
  }

  const LIVE_HOSTS = ['ripmaster3030studios.com', 'www.ripmaster3030studios.com',
                      '3030.ripmaster3030studios.com'];
  const aimedAtLive = red.filter(r => /^https?:\/\//i.test(String(r.destination || ''))).flatMap(r => (r.has || [])
    .filter(h => h.type === 'host')
    .flatMap(h => LIVE_HOSTS.filter(host => { try { return new RegExp('^(?:' + h.value + ')$').test(host); } catch { return false; } })));
  ok(aimedAtLive.length === 0,
    '…and no CROSS-HOST redirect matches a live host, so none can fight the platform\'s own apex/www rule — '
    + (aimedAtLive.length ? '⛔ REDIRECT LOOP: this config redirects ' + aimedAtLive.join(' + ')
       + ', which the platform is already redirecting. That is a dark site.' : 'clear'));
  /* Path-preserving, because CLAUDE.md's decision is that old URLs keep resolving: this is an
   * identity change, not a link-breaking one. It also protects any `animation_url` already
   * pointing at the old host. */
  ok(crossHost.every(r => /:path\*/.test(r.destination)),
    '…and every cross-host redirect preserves the path');

  /* ══ ⛔ THE CACHE RULE THAT MADE THE WHOLE CARD SURFACE A WEEK STALE — 2026-08-05 ═══════════
   * Artist: *"the cards are not updated on site."* They were not. The deploy was correct, every
   * file was on the origin, and `curl` returned the new bytes — and a returning visitor's browser
   * had been told to keep the OLD ones for SEVEN DAYS.
   *
   * ⛔ THE CAUSE IS RULE ORDER, AND BOTH RULES WERE INDIVIDUALLY RIGHT. `/(.*).html` and
   *   `/(.*).js` set must-revalidate; `/cards/(.*)` sets max-age=604800 to cache the ARTWORK,
   *   which is correct and desirable. But in Vercel LATER RULES WIN, and `/cards/(.*)` came
   *   last — so it silently overrode the document rules for every page, script and manifest
   *   under /cards/. Measured on the live host: cards/index.html, cards/cardnav.js,
   *   cards/binder.html, cards/lens3d.html, cards/manifest.json and all 196 card pages were all
   *   `max-age=604800`, while /index.html and /js/*.js were correctly must-revalidate.
   * ⚑ SO THE SYMPTOM IS UNBOUNDED, NOT SPECIFIC TO ONE CHANGE. Any edit to the deck browser, the
   *   folder, the token's own lens page or the card manifest was invisible to anyone who had
   *   visited in the past week. The deck clean-slate (task #71) would have shipped to nobody.
   * ⚑ AND EVERY SIGNAL POINTED AWAY FROM IT, in the reassuring direction: the commit was pushed,
   *   the deployment was live, the files 200'd with the right content, and the modules the pages
   *   needed were themselves fresh (they live at /js/, outside the rule). The one thing nobody
   *   had read was a response HEADER.
   *
   * The test resolves Cache-Control the way the platform does — every matching rule applies and
   * the LAST one wins — and asserts the outcome per path, rather than that some rule exists.
   * ⚠ It asserts BOTH directions on purpose. "No document is long-cached" is trivially satisfied
   *   by deleting the asset rules, which would throw away the artwork caching this site actually
   *   wants; so the artwork is asserted to STAY long-cached in the same breath. */
  {
    const rx = (src) => new RegExp('^' + src
      .split('(.*)').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.*)') + '$');
    const cacheFor = (p) => {
      let v = null;
      for (const rule of (vj.headers || [])) {
        if (!rx(rule.source).test(p)) continue;
        for (const h of (rule.headers || [])) {
          if (String(h.key).toLowerCase() === 'cache-control') v = h.value;
        }
      }
      return v;
    };
    const maxAge = (v) => { const m = /max-age=(\d+)/.exec(v || ''); return m ? +m[1] : null; };

    /* Everything a visitor must get the newest copy of. Each one is a real path on this site,
     * and /cards/ is over-represented deliberately — that is where the rule bit. */
    const DOCS = ['/index.html', '/arcade.html', '/cards/index.html', '/cards/binder.html',
                  '/cards/lens3d.html', '/cards/proof.html', '/cards/alley-trio.html',
                  '/cards/cardnav.js', '/js/card-press.js', '/js/hero-card.js', '/pack.js',
                  '/cards/manifest.json', '/cards/hero-manifest.json', '/cards/type/alphabet.json',
                  '/cardback.css'];
    const stale = DOCS.filter(p => (maxAge(cacheFor(p)) || 0) > 60);
    ok(stale.length === 0,
      'no page, script, stylesheet or manifest is cached in the browser for more than a minute — '
      + (stale.length ? '⛔ STALE SITE: ' + stale.map(p => p + ' ' + cacheFor(p)).join(', ')
         : DOCS.length + ' paths, all revalidating'));

    /* …and the artwork keeps its long cache, or the "fix" is just a slower site. */
    const ART = ['/cards/art/alley-trio.webp', '/cards/art/hero/42.webp',
                 '/models/env/satara_night.png'];
    const uncached = ART.filter(p => (maxAge(cacheFor(p)) || 0) < 3600);
    ok(uncached.length === 0,
      '…while card artwork and models stay long-cached — '
      + (uncached.length ? '⛔ ' + uncached.join(', ') + ' lost its cache'
         : ART.length + ' asset paths at ' + maxAge(cacheFor(ART[0])) + 's'));
  }


  /* ⛔ AND HERE IS THE PART A REDIRECT CANNOT FIX. A WalletConnect/Reown project id is
   * ALLOW-LISTED BY DOMAIN in their dashboard. Serving the site from a host that is not on that
   * list does not degrade — mobile wallet connect simply fails, at the exact moment a collector
   * is trying to rip a pack. It is not a code change and no test can repair it; what a test CAN
   * do is refuse to let it be forgotten, which is what this is. */
  const cc = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
  const wc = /walletConnectProjectId:\s*"([^"]*)"/.exec(cc);
  const stale = !/allow-list must include ripmaster3030studios\.com/.test(cc);
  ok(!wc || !wc[1] || !stale,
    '⚠ the WalletConnect id is allow-listed for the LIVE domain — '+(stale ? 'ACTION FOR THE ARTIST: add ripmaster3030studios.com to the Reown project\'s allowed ' +
            'domains, then update the note in js/chain-config.js. Until then mobile wallet ' +
            'connect fails on the new host.' : 'note is current'));
}

/* ── THE PACK PRICE: THE DOCS SAID 125 AND THE CODE CHARGED 350 ──────────────────────────────
 * ⛔ The pricing change the artist approved on 2026-08-06 was written into docs/PACK-PRICING.md
 *   and NEVER into js/chain-config.js. The site would have taken 350 $3030 a pack — about $28 at
 *   the measured $0.08 open, against an approved tier-I price of $10. ⚑ A decision recorded only
 *   in prose is not implemented, and the docs are not what runs. Nothing was checking the number
 *   a collector actually pays.
 * ⚑ THE EXPECTED COUNT IS DERIVED FROM THE PRICING DOC, NOT RESTATED HERE. Restating it would
 *   make this a third copy of the same fact and give it its own way to go stale — which is the
 *   exact defect being guarded. The doc's tier table is the source; this reads tier I out of it
 *   and requires the config to match.
 * ⚠ Tier I only. Tiers II–IV are re-derived from the live price on the day each opens and then
 *   locked, so their token counts are SCENARIO in the doc and must not be asserted as facts. */
console.log('\n── the pack price, which is the number a collector actually pays ──');
{
  const pricing = readFileSync(join(ROOT, 'docs/PACK-PRICING.md'), 'utf8');
  /* The tier-I row: | **I** | 1,600 | **$10** | **125** | 62.5 | 62.5 | */
  const row = pricing.split('\n').find(l => /^\|\s*\*\*I\*\*\s*\|/.test(l));
  ok(!!row, 'PACK-PRICING.md carries a tier-I row to read the pack price out of');
  const cells = (row || '').split('|').map(c => c.replace(/\*/g, '').trim());
  const tier1 = cells.map(c => c.replace(/,/g, '')).find(c => /^\d+$/.test(c) && +c > 100 && +c < 1000);
  ok(!!tier1, `…and a token count in it  (${tier1 || 'NONE'})`);

  const cfgSrc = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
  const pb = /^\s*packBurn:\s*(\d+)/m.exec(stripComments(cfgSrc, false));
  ok(!!pb, 'chain-config declares packBurn');
  ok(pb && tier1 && pb[1] === tier1,
    `chain-config.packBurn is the tier-I count from PACK-PRICING.md  (config ${pb ? pb[1] : '?'} vs doc ${tier1})`);

  /* ⛔ AND THE FALLBACKS ARE A SECOND SOURCE OF TRUTH. `pack.js` and `cabinet.html` each carry
   *   `CFG.packBurn || N` — they are separate shipped files with nothing to import, so the
   *   literal is unavoidable. What is avoidable is it DISAGREEING: all three said 350 while the
   *   config was being changed, and the copies nobody opens are the ones that ship a wrong price.
   *   Same instrument as the city-ops/s9pc weapon tables — coupled by a test, not a require. */
  for (const f of ['pack.js', 'cabinet.html']) {
    const src = stripComments(readFileSync(join(ROOT, f), 'utf8'), /\.html$/.test(f));
    const fb = [...src.matchAll(/packBurn\s*\)?\s*\|\|\s*(\d+)/g)].map(m => m[1]);
    ok(fb.length > 0, `${f} — has a packBurn fallback to check  (${fb.join(', ') || 'NONE'})`);
    ok(fb.every(v => v === tier1),
      `…and every one equals the config  (${fb.join(', ')} vs ${tier1})`);
  }

  /* ⛔ THE RECEIPT MUST NOT ROUND THE SPLIT. PackSink computes burned = amount*5000/10000 and
   *   toTreasury = amount - burned, so the halves are EXACT in wei for any input. `Math.floor`
   *   printed "62 · 63" for a 125-token pack — a receipt claiming a split the chain never did.
   *   It was invisible at 350 because an even number halves cleanly, so the bug shipped hidden
   *   behind a round price and only an odd tier price could ever have exposed it. */
  /* ⚠ AND THE FIRST VERSION OF THIS ASSERTION NAMED THE VARIABLES — `cost` and `packBurn()` —
   *   so it MISSED a third flooring site that called the same quantity `need`, in the approve
   *   prompt. The fix passed its own test while still printing "62 burns, 63 funds the studio"
   *   on the busiest screen in the flow. ⚑ Matching a SHAPE covers the site you forgot; matching
   *   a NAME covers only the sites you already had in mind, which is the hand-picked-list failure
   *   this file records twice over — committed here a third time, in a test written to prevent it. */
  for (const f of ['pack.js', 'cabinet.html']) {
    const src = stripComments(readFileSync(join(ROOT, f), 'utf8'), /\.html$/.test(f));
    const floors = [...src.matchAll(/Math\.floor\s*\([^)]*\/\s*2\s*\)/g)].map(m => m[0]);
    ok(floors.length === 0,
      `${f} — the pack receipt does not floor the exact 50/50 split`, floors.join(' · ') || 'none');
  }
}

/* ── THE MAINNET FLIP IS NINE FIELDS, AND A PARTIAL FLIP IS THE FAILURE ──────────────────────
 * Task #72 is written as "flip network to mainnet", which reads like one edit and is nine:
 * network, chainId, label, the RPC list, the liquid factory, RARE, the edition address, the
 * render contract — each correct in isolation and only meaningful together.
 * ⛔ A HALF-FLIPPED CONFIG DOES NOT ERROR, IT MISBEHAVES QUIETLY, and every symptom points
 *   somewhere else. `chainId` alone drives `wantChainId()` in js/wallet.js, which decides the
 *   network the collector's wallet is FORCED onto, which SuperRare host `buyUrl()` points at
 *   (testnet ids go to dev.superrare.co), and every explorer link on the site. So
 *   `network:"mainnet"` with the Sepolia chainId left behind gives you a mainnet-branded site
 *   that herds people onto a testnet and links them to a testnet explorer — with nothing thrown.
 * ⚑ This is the redirect outage's shape exactly: two settings each defensible on their own,
 *   wrong in composition. The instrument is the same one that fixed it — derive the expectation
 *   from what the config CLAIMS to be, then check every other field against that claim.
 * ⚠ It is written now, while the answer is still "sepolia", precisely so it is already in place
 *   on the night — a guard added after the flip guards nothing. */
console.log('\n── the mainnet flip: every chain-scoped field must agree with `network` ──');
{
  /* Evaluate the config rather than regex it — it is a plain object literal assigned to a global,
   * so the file itself is the most faithful parser available and cannot drift from what ships. */
  const src = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
  let CFG = null;
  try { CFG = new Function('window', src + '; return window.RIPMASTER_CHAIN;')({}); } catch {}
  ok(!!CFG, 'js/chain-config.js evaluates to a config object');

  if (CFG) {
    const net = String(CFG.network || '');
    ok(net === 'sepolia' || net === 'mainnet', `network is a known chain  ("${net}")`);
    const isMain = net === 'mainnet';

    ok(Number(CFG.chainId) === (isMain ? 1 : 11155111),
      `chainId matches network=${net} — drives wantChainId(), the forced wallet chain, buyUrl() and every explorer link`,
      String(CFG.chainId));

    /* A visible string: "sepolia block" shipped on a mainnet site is a label a collector reads. */
    ok(isMain ? !/sepolia|testnet/i.test(String(CFG.label || ''))
              : /sepolia/i.test(String(CFG.label || '')),
      `label matches network=${net}`, String(CFG.label));

    const rpcs = CFG.rpcs || [];
    ok(rpcs.length > 0, 'there are RPCs to check');
    const testnetRpc = rpcs.filter(u => /sepolia|testnet|goerli/i.test(u));
    ok(isMain ? testnetRpc.length === 0 : testnetRpc.length === rpcs.length,
      `every RPC matches network=${net}`, testnetRpc.join(', ') || rpcs.join(', '));

    /* The protocol addresses are per-chain FACTS, recorded in docs/RESEARCH-NOTES.md. */
    const FACTORY = { sepolia: '0xb1777091C953fa2aC1fD67f2b3e2f61343F5Ce5e',
                      mainnet: '0x25f993C222fE5e891128a782A5168f1C78629540' };
    const p = CFG.protocol || {};
    ok(String(p.liquidFactory || '').toLowerCase() === FACTORY[net].toLowerCase(),
      `protocol.liquidFactory is the ${net} Liquid Factory`, String(p.liquidFactory));

    /* ⚠ MAINNET RARE IS ONLY RECORDED TRUNCATED (`0xba5BDe66…6350`, docs/TOKEN-MATH.md), so the
     *   full value CANNOT be asserted and must NOT be guessed — a wrong reserve token is not a
     *   typo, it is the pool pointing at the wrong asset. What is checkable is that it stopped
     *   being the Sepolia one, plus a named action item so the gap is impossible to walk past. */
    const SEPOLIA_RARE = '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB';
    if (isMain) {
      ok(String(p.rare || '').toLowerCase() !== SEPOLIA_RARE.toLowerCase(),
        '⛔ ACTION: protocol.rare must be MAINNET RARE — the repo records it only as 0xba5BDe66…6350; get the full address from SuperRare, do not guess it',
        String(p.rare));
    } else {
      ok(String(p.rare || '').toLowerCase() === SEPOLIA_RARE.toLowerCase(),
        'protocol.rare is Sepolia RARE', String(p.rare));
    }

    /* ⛔ AND THE CONTRACTS. The Sepolia edition and renderer are recorded addresses; on mainnet
     *   they are DIFFERENT contracts, and leaving either behind points the site at an address
     *   with no code on the chain it is now talking to. `isLive()` only tests the SHAPE of an
     *   address, so a stale one passes it and every read silently returns nothing. */
    const SEPOLIA_EDITION  = '0xdc47e98b35Da73956fa7cCD450f8feEA746Ec83C';
    const SEPOLIA_RENDERER = '0x948E633054c516253D21d313aC789B37935de903';
    const c = CFG.contracts || {};
    for (const [key, sep] of [['liquidEdition', SEPOLIA_EDITION], ['renderContract', SEPOLIA_RENDERER]]) {
      const got = String(c[key] || '');
      ok(isMain ? got.toLowerCase() !== sep.toLowerCase() : got.toLowerCase() === sep.toLowerCase(),
        isMain ? `contracts.${key} is NOT the Sepolia address any more`
               : `contracts.${key} is the recorded Sepolia address`, got);
    }
    /* ⚠ And the standing rule for the renderer, which no test can enforce: READ IT OFF THE
     *   EDITION (`edition.renderContract()`), never from a note. chain-config once carried a
     *   superseded renderer that looked perfectly plausible. */

    /* ⛔ ON MAINNET, SHIPPING PackSink DARK MAKES THE SITE'S OWN COPY UNTRUE.
     *   With `packSink` empty, RipWallet.payPack falls back to a plain 100% burn — deliberate,
     *   because nothing may half-execute. But three public pages state the split as FACT:
     *     index.html      "half burns and half funds the studio"
     *     tokenomics.html "A pack and a game rake split 50/50"
     *     whitepaper.html "half burns, half funds the studio"
     *   ⚑ THE DEGRADATION IS HONEST EVERYWHERE IT IS REPORTED AT RUNTIME — pack.js's receipt and
     *   WagerPayout.splitLive() both read hasSink() and say what actually happened. What cannot
     *   adapt is STATIC PROSE. `lens721` empty is a different case and is fine: that door falls
     *   back to the local vault and MARKS ITSELF `verified:false`, i.e. it tells the truth about
     *   itself.
     *   ⚠ Sepolia is exempt on purpose — rehearsing the fallback is the whole point of shipping
     *   dark. Going live on MAINNET with the copy ahead of the code is the problem, and it is a
     *   LAUNCH GATE rather than a code defect: deploy the sink and paste the address, or change
     *   the copy. Either resolves it. Shipping resolves neither. */
    if (isMain) {
      const sink = String((CFG.contracts || {}).packSink || '').trim();
      ok(/^0x[0-9a-fA-F]{40}$/.test(sink) && !/^0x0+$/.test(sink),
        '⛔ LAUNCH GATE: on mainnet contracts.packSink must be DEPLOYED — empty means every pack burns 100% while index/tokenomics/whitepaper state a 50/50 split as fact (task #89)',
        sink || 'EMPTY');
    }
  }
}

/* ── THE RENDERER'S COMPILED BYTES ────────────────────────────────────────────────────────────
 * ⛔ THIS IS THE SURFACE THE NAME LAW NEVER CHECKED, AND IT NEARLY SHIPPED THE RETIRED NAME
 *   PERMANENTLY. `contracts/` is skipped by the sweep because it does not go to the CDN — but a
 *   render contract DRAWS. On 2026-08-06, hours after the token deployed, the renderer source
 *   still wrote `upperdeckripmaster3030` into the on-chain SVG's own <text> and into the
 *   animation_url HTML byline, and `deploy-render.html` shipped a pre-compiled blob carrying
 *   those strings plus `UR3030 per RARE` and the Sepolia edition address.
 * ⚑ NONE OF IT HAS A SETTER. `setMeta`/`setAnimationUrl` change the constructor strings; the SVG
 *   text and the byline are compiled into the bytecode. Deploy is the last moment they are free.
 * ⚑ AND THE CHECK IS ON THE COMPILED BYTES, NOT THE .sol. Reading the source is not the same as
 *   reading what deploys — that gap is exactly how the stale blob survived a rename that touched
 *   258 files. Decode the blob the page will actually send. */
{
  console.log('\n── the renderer contract, and the bytes deploy-render.html will send ──');
  const sol = readFileSync(join(ROOT, 'contracts/Ripmaster3030Renderer.sol'), 'utf8');
  const solCode = sol.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok(!/upperdeckripmaster3030/.test(solCode),
    'Ripmaster3030Renderer.sol draws no retired name (comments exempt)');

  const page = readFileSync(join(ROOT, 'deploy-render.html'), 'utf8');
  const m = /const BLOB = '0x([0-9a-f]+)'/.exec(page);
  ok(!!m, 'deploy-render.html carries a deployment blob');
  if (m) {
    const bytes = Buffer.from(m[1], 'hex').toString('latin1');
    ok(!bytes.includes('upperdeckripmaster3030'), 'the blob contains no retired studio name');
    ok(!bytes.includes('UR3030'), 'the blob contains no retired ticker');
    ok(bytes.includes(LIVE), `the blob names the live studio (${LIVE})`);
    /* ⛔ THE ONE THAT MATTERS MOST FOR SUPERRARE. index.html loads pack.js and js/wallet.js, so
     *   an animation_url pointing at the site ROOT puts wallet code inside a marketplace iframe —
     *   the exact thing their security team flagged, and why the wallet-free superrare.html
     *   exists. The Sepolia renderer was set to the root and it went unnoticed for three weeks. */
    ok(bytes.includes('/superrare.html'),
      'the animation_url frames the WALLET-FREE embed, not the site root');
    ok(!/ripmaster3030studios\.com\/"/.test(bytes) && !bytes.includes('upperdeckripmaster3030.com'),
      '…and not the retired domain');
    /* The edition the renderer is bolted to is a constructor arg and cannot be changed after. */
    ok(bytes.toLowerCase().includes('\x1dK\xcb\xb5'.toLowerCase()) || /1d4bcbb505182a49303cc3b23eff1e3157147a33/i.test(m[1]),
      'the blob is bolted to the MAINNET edition 0x1D4bcbb5…47A33');
  }
  ok(/const TOKEN = '0x1D4bcbb505182a49303CC3B23EfF1E3157147A33'/.test(page),
    'deploy-render.html points at the mainnet edition');
}

/* ── EVERY ADDRESS IN chain-config IS EIP-55 CHECKSUMMED ──────────────────────────────────────
 * ⛔ TWO OF THEM WERE NOT, AND BOTH WERE THE ONES I TYPED THE CASING OF RATHER THAN COPYING —
 *   renderContract and packSink, added on launch night. RPCs ignore case, so nothing broke and
 *   nothing ever would have; that is precisely why it needs a test. A mixed-case address whose
 *   checksum does NOT validate is the signal that a human retyped it, which is the one operation
 *   that can silently transpose a character. Some tooling (viem among it) rejects them outright.
 * ⚑ The treasury already had a bespoke checksum assertion. Generalised to the whole file, because
 *   a hand-picked list of addresses to check is this repo's most-repeated failure. */
{
  console.log('\n── every address in chain-config is EIP-55 checksummed ──');
  const src = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
  /* Only MIXED-case addresses carry a checksum; an all-lower or all-upper one is unchecksummed
   * by convention rather than wrong, so requiring mixed case is the actual claim. */
  const found = [...src.matchAll(/(\w+)\s*:\s*"(0x[0-9a-fA-F]{40})"/g)];
  ok(found.length >= 5, `chain-config carries addresses to check`, String(found.length));
  for (const [, key, addr] of found) {
    const mixed = /[a-f]/.test(addr.slice(2)) && /[A-F]/.test(addr.slice(2));
    ok(mixed && checksum(addr) === addr,
      `chain-config.${key} is a valid EIP-55 checksummed address`, addr);
  }
}

/* ── THE GACHA RATE ───────────────────────────────────────────────────────────────────────────
 * ⛔ THE PACK USED TO PULL UNIFORMLY FROM ALL 100 CARDS, so 33 of which are 1/1 heroes. The
 *   artist's first real mainnet rip returned THREE heroes; simulated over a full four-tier run
 *   the old draw hands out ~8,224 of the eleven that exist. Nothing was minted (no lens yet) and
 *   hero claims require a human-signed voucher, which is the only reason this was embarrassing
 *   rather than expensive.
 * ⚑ THE TEST RUNS THE REAL FUNCTION, IT DOES NOT READ IT. `pull` is extracted from the shipped
 *   pack.js and executed against a synthetic 33/67 deck, because a text match on a constant would
 *   pass on any code that computed the right number and then ignored it — which is exactly the
 *   shape of the bug it is guarding. */
{
  console.log('\n── the pack hands out 1/1 heroes at the rate eleven of them can support ──');
  const src = readFileSync(join(ROOT, 'pack.js'), 'utf8');
  const m = /(const GACHA_IDS = \[[^\]]*\];[\s\S]*?)(const pull = [\s\S]*?\n  \};)/.exec(src);
  ok(!!m, 'pack.js exposes an extractable gacha rate + pull');
  if (m) {
    const DECK = [];
    for (let i = 1; i <= 33; i++) DECK.push({ id: i, band: 'hero' });
    for (let i = 34; i <= 100; i++) DECK.push({ id: i, band: 'field' });
    const fn = new Function('DECK', 'rnd', `${m[1]}\n${m[2]}\nreturn { pull, GACHA_IDS };`);
    const { pull, GACHA_IDS } = fn(DECK, n => Math.floor(Math.random() * n));
    /* ⛔ ELEVEN, AND ONLY THOSE ELEVEN. Artist: "there are only 11 heros in gacha 11 in game 11
     *   auction." The first fix got the RATE right and still drew from all 33, so a pull could
     *   land on a card promised to an auction or a game title — the same 1/1 offered twice. */
    ok(GACHA_IDS.length === 11, 'the gacha pool is exactly eleven cards', String(GACHA_IDS.length));

    const PACKS = 3560, SIZE = 7;
    let heroes = 0, twoPlus = 0, wrongSize = 0, outsidePool = 0;
    for (let i = 0; i < PACKS; i++) {
      const p = pull(SIZE);
      if (p.length !== SIZE) wrongSize++;
      const hs = p.filter(c => c.band === 'hero');
      for (const c of hs) if (!GACHA_IDS.includes(Number(c.id))) outsidePool++;
      heroes += hs.length; if (hs.length > 1) twoPlus++;
    }
    /* ⚠ A WIDE BAND ON PURPOSE. Eleven events over 3,560 trials is Poisson: the 99.9% interval is
     *   roughly 2–24, so a tight bar would flake nightly and get muted. The bug being caught was
     *   off by a factor of ~750, and any band that catches THAT is doing its job. */
    ok(heroes >= 1 && heroes <= 40,
      `a full four-tier run hands out single-digit-ish heroes, not thousands`,
      `${heroes} over ${PACKS} packs (eleven exist)`);
    ok(twoPlus === 0, 'no pack ever contains two heroes — each is a 1/1', `${twoPlus} packs did`);
    ok(wrongSize === 0, 'the hero substitutes for a field card, it does not lengthen the pack',
      `${wrongSize} packs came out the wrong size`);
    ok(outsidePool === 0, 'the pack never offers a hero reserved for an auction or a game title',
      `${outsidePool} pulls came from outside the gacha eleven`);

    /* ⛔ THE ASSERTION ABOVE COUNTS BY `band`, AND THAT IS EXACTLY HOW THE LEAK HID. A manifest
     *   served without `band` makes nothing a hero — so `hs` is empty, `outsidePool` stays 0, and
     *   a pack cheerfully offering all eleven auction cards scores green. Simulated and confirmed
     *   before this was written: 22 reserved ids handed out, zero assertions fired.
     * ⚑ COUNT BY ID, AND DRIVE THE SHAPES NOBODY PLANS FOR. Ids 1–33 are the heroes — verified
     *   against the manifest, and the key the LENS CONTRACT itself uses (HERO_MAX = 33). A card's
     *   id cannot go missing; a band can.
     * ⚠ The empty-pack case is a PASS, not a failure: handed a deck with nothing legal in it the
     *   pack must refuse rather than reach for something reserved. */
    const RESERVED = new Set([...Array(11)].map((_, i) => i + 1)
                       .concat([...Array(11)].map((_, i) => i + 23)));
    const SHAPES = [
      ['the live deck',      DECK],
      ['no bands at all',    DECK.map(c => Object.assign({}, c, { band: undefined }))],
      ['every band wrong',   DECK.map(c => Object.assign({}, c, { band: 'field' }))],
      ['heroes only',        DECK.filter(c => Number(c.id) <= 33)],
      ['auction ids only',   DECK.filter(c => Number(c.id) <= 11)],
      ['ids as strings',     DECK.map(c => Object.assign({}, c, { id: String(c.id) }))],
    ];
    for (const [label, deck] of SHAPES) {
      const p2 = fn(deck, n => Math.floor(Math.random() * n)).pull;
      const leaked = new Set();
      for (let i = 0; i < 3000; i++)
        for (const c of p2(SIZE)) if (RESERVED.has(Number(c.id))) leaked.add(Number(c.id));
      ok(leaked.size === 0, `no reserved id is offered — ${label}`,
        leaked.size ? '⛔ handed out ' + [...leaked].sort((a, b) => a - b).join(',') : 'clean');
    }
  }
}

/* ── THE GAMES CANNOT AWARD A 1/1 ────────────────────────────────────────────────────────────
 * ⚑ A PACK IS NOT THE ONLY WAY A CARD REACHES SOMEBODY. Every cabinet wagers cards into a pot and
 *   pays them out, and they all read `cards/manifest.json` — the 196 PLACEHOLDERS — while the
 *   hero 1/1s live in `cards/deck-manifest.json`. That separation is what makes a game unable to
 *   hand out an auction card, and it is currently true by ACCIDENT of which file each reads.
 *   Asserted here so merging the two pools has to be a decision rather than a slip. */
{
  const ph = JSON.parse(readFileSync(join(ROOT, 'cards/manifest.json'), 'utf8')).cards || [];
  const deck = JSON.parse(readFileSync(join(ROOT, 'cards/deck-manifest.json'), 'utf8')).cards || [];
  const heroSlugs = new Set(deck.filter(c => Number(c.id) <= 33).map(c => String(c.slug)));
  ok(!ph.some(c => c.band === 'hero'), 'the games\' card pool contains no hero band',
    String(ph.filter(c => c.band === 'hero').length) + ' found');
  ok(!ph.some(c => Number(c.id) >= 1 && Number(c.id) <= 33),
    '…and no entry carrying a hero id (1–33)',
    String(ph.filter(c => Number(c.id) >= 1 && Number(c.id) <= 33).length) + ' found');
  const clash = ph.filter(c => heroSlugs.has(String(c.slug)));
  ok(clash.length === 0, '…and no slug collides with one of the 33',
    clash.length ? '⛔ ' + clash.slice(0, 4).map(c => c.slug).join(', ') : 'clean');
}

/* ═══ THE LIVE MARKET ══════════════════════════════════════════════════════════════════════════
 * ⛔ A CHART LINK IS A CLAIM ABOUT WHICH MARKET IS OURS. Point it at the wrong pool and the site
 *   sends its own collectors to somebody else's token, from the front page, with the studio's
 *   name above it. That is the `protocol.rare` lesson — "a wrong reserve token is not a typo" —
 *   applied to the one surface a visitor actually clicks.
 * ⚑ THE POOL ID IS 32 BYTES, NOT 20. A Uniswap v4 pool is a hash of its key into the singleton
 *   PoolManager, not a contract, so this repo's usual `^0x[0-9a-fA-F]{40}$` address check would
 *   REJECT a perfectly correct value — and an address pasted here would PASS one. The length is
 *   the discriminator and it is asserted in both directions.
 * ⚠ What cannot be checked offline is that the pool's baseToken is our edition. It was verified
 *   against DexScreener's API when it was added (baseToken 0x1D4bcbb5…47A33 = contracts
 *   .liquidEdition, quoteToken = protocol.rare, symbol `3030`), and that is a one-time proof, not
 *   a standing guard — so the assertion here is the SHAPE plus the single-declaration rule. */
console.log('\n── the markets: every pool declared once, and the swap keyed on the token ──');
{
  /* ⚠ EVALUATED, NOT REGEXED — the same way this file reads the config everywhere else, so the
   *   parser here cannot drift from what actually ships to a browser. */
  const cfgSrc = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
  let CHAIN = null;
  try { CHAIN = new Function('window', cfgSrc + '; return window.RIPMASTER_CHAIN;')({}); } catch {}
  const m = ((CHAIN || {}).market || {});
  const pools = m.pools || [];
  ok(pools.length >= 1, 'chain-config declares at least one market', pools.length + ' pools');
  for (const p of pools) {
    const id = String((p || {}).id || '').trim();
    ok(/^0x[0-9a-fA-F]{64}$/.test(id),
      `${p.quote} pool is a 32-byte Uniswap v4 pool id`, id.slice(0, 12) + '…' || 'EMPTY');
    ok(!/^0x[0-9a-fA-F]{40}$/.test(id),
      `…and NOT a 20-byte contract address pasted into a ${p.quote} pool field`);
    /* ⛔ ONE COPY EACH. The links are BUILT from the ids, so a 66-character hex must appear in the
     *   config exactly once — a second literal is a second thing to get wrong and nothing on
     *   screen would look different. */
    const copies = (cfgSrc.match(new RegExp(id, 'gi')) || []).length;
    ok(copies === 1, `the ${p.quote} pool id is declared exactly once`, copies + ' copies');
  }
  /* ⛔ AND THE TWO POOLS MUST NOT BE THE SAME MARKET WEARING TWO LABELS. Two ids that differ by a
   *   character is a paste error the eye cannot see in 66 hex digits, and it would make the site
   *   offer a choice between one pool and itself. */
  const ids = pools.map(p => String((p || {}).id || '').toLowerCase());
  ok(new Set(ids).size === ids.length, 'every declared pool is a DIFFERENT pool');
  const quotes = pools.map(p => String((p || {}).quote || '').toUpperCase());
  ok(new Set(quotes).size === quotes.length && quotes.every(Boolean),
    '…and each names its own quote asset', quotes.join(' · '));
  ok(!/dexscreener\.com\/[a-z]+\/0x[0-9a-fA-F]{64}/.test(cfgSrc),
    'no full chart URL is hard-coded beside an id');
  /* ⛔ THE SWAP LINK IS BUILT FROM THE TOKEN, NOT FROM A POOL, and that is a SAFETY property, not
   *   a style one: Uniswap's router picks the venue, so a token-keyed link cannot fill from a pool
   *   with nothing in it. A pool id reaching the swap host would aim collectors at one specific
   *   market — which, on the day the ETH pool was created, held $5 of volume. */
  ok(!new RegExp(String(m.swapHost || 'app\\.uniswap\\.org/swap').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '[^"\']*0x[0-9a-fA-F]{64}').test(cfgSrc),
    'no pool id is pasted into the swap host');
  const w = readFileSync(join(ROOT, 'js/wallet.js'), 'utf8');
  ok(/chartUrl/.test(w) && /\{64\}/.test(w),
    'js/wallet.js builds the chart link and validates the id length');
  ok(/swapUrl/.test(w) && /outputCurrency/.test(w) && /\{40\}/.test(w),
    '…and builds the swap link from the TOKEN, validated as a 20-byte address');
  /* ⛔ AND IT NAMES BOTH SIDES. `outputCurrency` alone says what you are buying and nothing about
   *   what you are paying with, so Uniswap opened on whatever input it chose and routed itself —
   *   which is not the ETH pair the studio opened, and the artist said so: "swap on uniswap
   *   doesn't take you to the eth pool". A swap link missing its input is a link to a different
   *   errand. */
  ok(/inputCurrency/.test(w), '…and names the INPUT side too, or it is not the ETH pair');
  ok(/poolUrl/.test(w), 'js/wallet.js can link a pool DIRECTLY, for the pool itself as destination');
  /* ⚑ BOTH DIRECTIONS. "No hard-coded pool in the swap link" is trivially satisfied by a page with
   *   no swap route at all, which is the state this replaced. */
  const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
  ok(/id="swapLink"/.test(idx) && /RipWallet\.swapUrl/.test(idx),
    'index.html carries a swap route and fills it from the wallet');
  ok(/id="mktDepth"/.test(idx) && /marketDepth\(\)/.test(idx),
    '…and reads which pool has depth rather than printing an answer');

  /* ⛔ THE CONTRACT ADDRESS IS PUBLISHED, AND IT IS PUBLISHED EXACTLY ONCE. Pasting a contract
   *   into a DEX is how most people buy — a token search returns impostors — so a site that does
   *   not print its own address is asking collectors to trust a search result. It is also the one
   *   string on the page where being wrong costs a visitor money, so the markup ships EMPTY and
   *   is filled from `chain-config`: a second copy is a second chance to send somebody to a
   *   different asset, and nothing on screen would look different.
   * ⚑ BOTH DIRECTIONS. "No literal" is trivially satisfied by not publishing the address at all,
   *   which is the state this replaced. */
  const tok = String((((CHAIN || {}).contracts) || {}).liquidEdition || '').trim();
  ok(/^0x[0-9a-fA-F]{40}$/.test(tok), 'the edition address is configured', tok || 'EMPTY');
  ok(tok === checksum(tok), '…and is EIP-55 checksummed, since it is printed for people to copy');
  ok(/id="caAddr"/.test(idx) && /RipWallet\.token\(\)/.test(idx),
    'index.html publishes the contract address, filled from the config');
  ok(!new RegExp(tok, 'i').test(idx),
    '…and never as a literal in the page — one declaration, no second copy');
  /* a control that reports success having copied nothing would have somebody paste whatever was
   * already on their clipboard into a swap — the failure this whole strip exists to prevent */
  ok(/id="caCopy"/.test(idx) && /clipboard/.test(idx) && /selectNodeContents/.test(idx),
    '…with a COPY that falls open to selecting rather than claiming success');
  const w2 = readFileSync(join(ROOT, 'js/wallet.js'), 'utf8');
  ok(/token:\s*\(\)\s*=>/.test(w2), 'js/wallet.js exposes the address for display');
}

/* ── THE STUDIO'S X ACCOUNT ───────────────────────────────────────────────────────────────────
 * ⛔ THE HANDLE IS NOT THE NAME, and that is the whole reason this block exists. The studio, the
 *    domain and the wordmark are `ripmaster3030studios` — a string this repo put in 258 files and
 *    then spent two days chasing. The account is `@RipMaster3030`. So the one string a hand
 *    reaches for is the WRONG one here, and it fails in the worst available way: `x.com/<anything>`
 *    is a valid URL that renders as a working link and lands on somebody else's page or a 404.
 *    Nothing errors, nothing 404s in our own logs, and the surface it is on is a footer.
 *    ⚑ Same shape as the token's own `name()` vs `symbol()` split, one level out.
 * ⚑ THERE IS NO SHARED INCLUDE. index.html and superrare.html are hand-authored and the four
 *   public pages come from a generator, so the literal is unavoidable in at least three places —
 *   exactly `packBurn`'s `|| 350` fallbacks. What is avoidable is it DISAGREEING. */
console.log('\n── the X account is one handle, and it is not the studio name ──');
{
  const HANDLE = 'RipMaster3030';
  /* Every OTHER x.com account this site is allowed to link: the artist's own, and the three
   * credited in the artist page's colophon. Anything not on this list is a typo or an account
   * nobody decided to link — both are failures, and both are invisible by inspection. */
  const KNOWN = new Set(['_lovebeing_', 'creamydreamy', 'takenstheorem', 'tyaagnliu']);

  const gen = readFileSync(join(ROOT, 'scripts/build-pages.mjs'), 'utf8');
  const decl = /^const X_HANDLE\s*=\s*'([^']*)'/m.exec(stripComments(gen, false));
  ok(!!decl && decl[1] === HANDLE,
    `scripts/build-pages.mjs declares the handle once — ${decl ? decl[1] : 'ABSENT'}`);

  /* ⛔ THE ROUTING CHECK, and it is the one that bites: does every x.com link on the site point at
   *   an account somebody actually chose? Matched case-INSENSITIVELY because X routes that way, so
   *   `x.com/ripmaster3030` really is the same account — the failure mode is a different SEQUENCE
   *   of characters (`ripmaster3030studios`, `RipMaster3030Studios`), not a different case. */
  const strays = [];
  const spelling = [];
  const carriers = new Set();
  for (const p of walk(ROOT)) {
    const rel = relative(ROOT, p);
    const src = readFileSync(p, 'utf8');
    if (!/x\.com\/|twitter\.com\//i.test(src)) continue;
    const code = stripComments(src, MARKUP.has(extname(p)));
    for (const m of code.matchAll(/(?:https?:\/\/)?(?:www\.)?(x|twitter)\.com\/([A-Za-z0-9_]+)/gi)) {
      const [, host, who] = m;
      if (who.toLowerCase() === HANDLE.toLowerCase()) {
        carriers.add(rel);
        if (who !== HANDLE) spelling.push(`${rel} — ${who}`);
        if (host.toLowerCase() === 'twitter') spelling.push(`${rel} — twitter.com/${who}`);
        continue;
      }
      if (!KNOWN.has(who.toLowerCase())) strays.push(`${rel} — ${host}.com/${who}`);
    }
  }
  ok(strays.length === 0,
    `every x.com link on the site names a chosen account${strays.length ? ' — ' + strays.slice(0, 6).join(' · ') : ''}`);
  /* Presentation, not routing: one spelling, one host, so the handle reads the same everywhere. */
  ok(spelling.length === 0,
    `…and the studio handle is spelled @${HANDLE} on x.com everywhere${spelling.length ? ' — ' + spelling.slice(0, 6).join(' · ') : ''}`);

  /* ⚑ BOTH DIRECTIONS. "No wrong handle" is trivially satisfied by a site that links no account at
   *   all, which is the state this was added to leave. These are the surfaces that must carry it:
   *   the front page, the four generated pages (via their shared footer) and the token-page embed,
   *   which is a collector's only route off superrare.com. */
  for (const page of ['index.html', 'updates.html', 'whitepaper.html', 'tokenomics.html', 'audit.html',
                      'artist.html', 'superrare.html']) {
    ok(carriers.has(page), `${page} links the studio account`);
  }
  /* ⛔ AND THE GENERATOR IS CHECKED WITH THE OUTPUT. Patching only the four HTML files leaves
   *   build-pages.mjs armed to put the old state back on the next run — restyle-backs.mjs's
   *   failure, which this file already records happening four times.
   * ⚠ THE FIRST VERSION OF THIS WAS A TAUTOLOGY AND PASSED ON A SABOTAGED BUILD. It asked whether
   *   `x.com/${X_HANDLE}` appears anywhere in the file — and `X_URL`'s own DECLARATION contains
   *   that exact text, so hard-coding every use site still matched the declaration and scored
   *   green. Same shape as the claim-signer guard this file already records: a check that reads
   *   the thing it is checking against. The declaration lines are removed first now, so what is
   *   left is use sites only. */
  const genUses = stripComments(gen, false)
    .replace(/^const X_HANDLE\s*=.*$/m, '').replace(/^const X_URL\s*=.*$/m, '');
  ok(!new RegExp(`x\\.com/${HANDLE}|@${HANDLE}`, 'i').test(genUses),
    '…and no use site in the generator re-types the handle as a literal');
  ok(/\$\{X_URL\}/.test(genUses) && /@\$\{X_HANDLE\}/.test(genUses),
    '…and it does emit both the footer link and the twitter:site tag from the declaration');

  /* THE FUNCTIONAL HALF. Without `twitter:site` every share of every page on this domain is
   * attributed to nobody — the reason a site declares a handle in the first place, and a meta tag
   * is this file's canonical example of a surface nobody looks at. */
  const metaPages = ['index.html', 'updates.html', 'whitepaper.html', 'tokenomics.html', 'audit.html', 'artist.html'];
  const missing = metaPages.filter(f => !new RegExp(
    `<meta name="twitter:site" content="@${HANDLE}">`).test(readFileSync(join(ROOT, f), 'utf8')));
  ok(missing.length === 0,
    `twitter:site is @${HANDLE} on all ${metaPages.length} share surfaces${missing.length ? ' — missing on ' + missing.join(', ') : ''}`);
}

console.log(`\n${checks - fails} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);

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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEAD = 'upperdeckripmaster3030';
const LIVE = 'ripmaster3030studios';

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
const ALLOW = new Set(['package.json', 'package-lock.json', 'vercel.json']);

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
pin('js/wallet.js', "url: 'https://ripmaster3030studios.com'", 'and points at the live domain');
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
for (const file of ['docs/TESTNET.md', 'docs/TOKEN-MATH.md', 'CLAUDE.md']) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const hits = [...src.matchAll(DEPLOY_RE)].filter(h => !PLACEHOLDER(h[1]) && !PLACEHOLDER(h[2]));
  ok(hits.length > 0, `${file} — carries a real deploy command to check`);
  for (const h of hits) {
    ok(h[1] === TOKEN_NAME, `${file} — name() is exactly "${TOKEN_NAME}"  (found "${h[1]}")`);
    ok(h[2] === TOKEN_SYMBOL, `${file} — symbol() is exactly "${TOKEN_SYMBOL}"  (found "${h[2]}")`);
  }
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
    if (f === 'test-name-law.mjs') continue;      // this file quotes every bad form on purpose
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
  const testnet = readFileSync(join(ROOT, 'docs/TESTNET.md'), 'utf8');
  const fenced = [...testnet.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(m => m[1]).join('\n');
  const imageArgs = [...fenced.matchAll(/--image\s+(\S+)/g)].map(m => m[1]);
  ok(imageArgs.length > 0, `the deploy command carries an --image to check  (${imageArgs.join(', ') || 'NONE'})`);
  for (const art of DEAD_ART) {
    ok(!imageArgs.some(a => a.includes(art)),
       `--image does not hand the CLI ${art} as the token's permanent fallback art`);
  }
  ok(imageArgs.some(a => a.includes('media/site/mark-')),
     'the deploy command hands the CLI the generated mark');

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
/* ⚠ 3,300,000 was settled after 33,000,000 was already written into the generators and the PDF.
 *   The burn is denominated in tokens per pack, so the cap changes only the PERCENTAGES — which
 *   is exactly the kind of edit that gets applied to the headline number and missed on the four
 *   derived ones. Check the derived figures, not the cap. */
{
  const model = readFileSync(join(ROOT, 'scripts/token-model.mjs'), 'utf8');
  ok(/const CAP\s*=\s*3_300_000;/.test(model), 'token-model.mjs CAP is 3_300_000');
  for (const page of ['tokenomics.html', 'whitepaper.html']) {
    const src = readFileSync(join(ROOT, page), 'utf8');
    ok(!/33,000,000|>33M</.test(src), `${page} — no 33,000,000 left`);
    ok(src.includes('3,300,000') || src.includes('3.3M'), `${page} — states the 3.3M cap`);
  }
  const tk = readFileSync(join(ROOT, 'tokenomics.html'), 'utf8');
  ok(tk.includes('30.7%'), 'tokenomics.html — burn is 30.7% of mint');
  ok(tk.includes('1.44'), 'tokenomics.html — contraction is 1.44x');
  ok(tk.includes('44.4%'), 'tokenomics.html — and the studio slug is stated alongside it');
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
  ok(red.length > 0 && red.every(r => (r.has || []).some(h => h.type === 'host')),
    '…and every redirect is scoped to a host, so it cannot loop — '+(hosts || 'NO HOST CONDITION'));
  /* Path-preserving, because CLAUDE.md's decision is that old URLs keep resolving: this is an
   * identity change, not a link-breaking one. It also protects any `animation_url` already
   * pointing at the old host. */
  ok(red.every(r => /:path\*/.test(r.destination)), '…and it preserves the path');

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

console.log(`\n${checks - fails} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);

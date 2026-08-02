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
 * nothing a visitor sees. Recorded here so "why is it still there" has an answer. */
const ALLOW = new Set(['package.json', 'package-lock.json']);

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
pin('superrare.html', 'media/site/mark-1024.png', 'the SuperRare embed shows the generated mark');

/* The four generated pages are OUTPUT. If they have drifted from the shell that builds them, the
 * fix above is real in the source and absent from what ships — which is its own version of this
 * whole bug, so it is checked rather than assumed. */
console.log('\n── generated pages match their generator ──');
for (const page of ['whitepaper.html', 'tokenomics.html', 'audit.html', 'artist.html']) {
  const src = readFileSync(join(ROOT, page), 'utf8');
  ok(src.includes('media/site/og-1200x630.png') && !src.includes('marquee-header.webp'),
     `${page} — regenerated with the new share card`);
}

console.log(`\n${checks - fails} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);

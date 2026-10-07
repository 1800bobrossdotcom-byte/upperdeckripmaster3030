#!/usr/bin/env node
/* upperdeckripmaster3030 — guard the SuperRare embed against wallet code.
 *
 *   npm run test:embed
 *
 * `superrare.html` is what a Liquid Edition's `animation_url` points at, which means it is
 * rendered inside a marketplace frame. It must never ask for a wallet.
 *
 * This is a TEST rather than a comment because a comment does not survive a hurried edit. The
 * failure mode is not "the page breaks" — it is that the page keeps working while quietly
 * teaching collectors that framed artwork asking for a wallet is normal, which is the exact
 * reflex phishing relies on. SuperRare's security team flagged that on `/cabinet.html`, which
 * loads js/wallet.js and performs WalletConnect burns. They were right. cabinet.html is not for
 * embedding; superrare.html is, and it stays clean.
 *
 * Read-only `eth_call` over fetch is explicitly allowed: it can show state, it cannot move
 * anything, and the page is written to degrade to static copy when the request is blocked.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EMBED = join(ROOT, 'superrare.html');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

if (!existsSync(EMBED)) {
  console.log('FAIL superrare.html is missing — the embed page must exist');
  process.exit(1);
}
const html = readFileSync(EMBED, 'utf8');
// strip comments: the file EXPLAINS what it must not contain, and that prose is not a violation
const code = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

console.log('\n── superrare.html must carry no wallet surface ──');

const BANNED = [
  ['window.ethereum',      /window\s*\.\s*ethereum/i],
  ['ethereum provider',    /\bethereum\s*\.\s*(request|enable|send)/i],
  ['eth_requestAccounts',  /eth_requestAccounts/i],
  ['eth_sendTransaction',  /eth_sendTransaction/i],
  ['personal_sign',        /personal_sign|eth_sign|signTypedData/i],
  ['WalletConnect',        /walletconnect|@walletconnect|wc:/i],
  ['wallet script',        /src=["'][^"']*wallet[^"']*["']/i],
  ['RipWallet',            /RipWallet/],
  ['RipEth',               /RipEth/],
  ['connect button',       /\bconnect\s*wallet\b/i],
  ['web3 lib',             /\bweb3\b|ethers\.js|viem/i],
];
for (const [label, re] of BANNED) {
  const m = code.match(re);
  ok(`no ${label}`, !m, m ? `found "${String(m[0]).slice(0, 40)}"` : '');
}

console.log('\n── and no external scripts at all (an inlined page cannot be swapped) ──');
const srcs = [...code.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)].map(m => m[1]);
ok('zero <script src=> tags', srcs.length === 0, srcs.join(', '));

console.log('\n── sandbox-hostile assumptions ──');
// localStorage THROWS at an opaque origin; window.parent is unreachable in a sandboxed frame
ok('no localStorage', !/localStorage/.test(code));
ok('no window.parent / top', !/window\s*\.\s*(parent|top)\b/.test(code));

console.log('\n── it must still send people somewhere, and be true about it ──');
ok('links to the studio site', /ripmaster3030studios\.com/.test(html));
ok('carries the NFA disclaimer', /\bNFA\b/.test(html));
/* ⛔ THE "THIS PAGE WILL NEVER ASK FOR YOUR WALLET" ASSERTION IS GONE, AND ON PURPOSE.
 *   Artist, 2026-08-06: the sentence "is not needed and especially confusing when someone then
 *   goes into the site and immediately gets asked for their wallet off superrare." It was true of
 *   the EMBED and read as a promise about the STUDIO, so a line written to build trust spent it
 *   at the first click.
 * ⚑ IT WAS ALSO THE WEAKEST ASSERTION IN THIS FILE, and that is the part worth keeping in mind:
 *   it checked that the page CLAIMED to be safe. Every other check above proves the page IS —
 *   no wallet identifier, no <script src>, no localStorage, no window.parent. A guarantee is
 *   structural; a claim is a string. Deleting the string removes nothing the security depends on. */

/* ⚠ AND THE GAME COUNT IS DERIVED, NOT TRUSTED. The embed said "Five games" while arcade.html
 *   links SIX cabinets — a number nobody had recounted after the compression shuffled SECTION 9
 *   and DOGFIGHT off the grid and back. A hand-written count on a page inside somebody else's
 *   marketplace is exactly the surface nobody reopens, so it is read off the arcade instead. */
const arcade = readFileSync(join(ROOT, 'arcade.html'), 'utf8');
/* ⛔ THIS SAID "DERIVED, NOT TRUSTED" AND WAS NEITHER — IT NAMED THE SIX PAGES.
 *   The old matcher was `href="((?:city|riprocketer|cloudracer|section9|dogfight|cards\/battle)
 *   \.html)"`, i.e. a hand-picked list of exactly the cabinets that existed when it was written.
 *   THE LIGHT joined the shelf on 2026-08-11 and the count stayed at 6, so the check reported the
 *   CORRECTED embed as wrong and would have reported a stale one as right the moment a game was
 *   added and the embed left alone — the precise failure it exists to catch, inverted.
 * ⚑ Match the SHAPE, not the NAMES. `<a class="cab" href="…">` is what a cabinet IS on that page,
 *   it is what test:reach compares its roster against, and it cannot go stale when the roster
 *   moves. CLAUDE.md records this same lesson from the pack-price fix — "a shape covers the site
 *   you forgot, a name covers only the sites you already had in mind" — and from the two `$7`
 *   pins defeated by a hyphen and a full stop. Fourth recorded instance, and like the third it was
 *   committed inside a test written to prevent exactly it.
 * ⚠ Comments stripped first, for the reason two lines down: this file's own note names the
 *   retired cabinets, and an unstripped scan would count them. */
const cabinets = new Set(
  [...arcade.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<a\s[^>]*class="cab"[^>]*href="([^"]+)"/g)]
    .map(m => m[1]));
const WORD = { 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine' };
/* ⚠ COMMENTS STRIPPED, AND I WALKED INTO THIS WRITING IT. The note above records that the page
 *   USED to say "Five games" — so the first version of this check matched its own explanation and
 *   reported the corrected page as still wrong. Fourth sighting of that trap in this repo and the
 *   second one I have committed today. A checker must read what SHIPS, never the prose about it. */
const shipped = html.replace(/<!--[\s\S]*?-->/g, '');
const claimed = (shipped.match(/\b(three|four|five|six|seven|\d+)\s+games\b/i) || [])[1];
ok(`the embed's game count matches the arcade (${cabinets.size} cabinets)`,
  !!claimed && String(claimed).toLowerCase() === WORD[cabinets.size],
  `embed says "${claimed || 'nothing'}", arcade links ${cabinets.size}`);


/* ⛔ THE EMBED'S CHAIN VALUES ARE A SECOND SOURCE OF TRUTH AND MUST MATCH THE FIRST.
 *   This page carries no <script src> — the property that keeps it wallet-free in a marketplace
 *   frame — so it cannot import js/chain-config.js and inlines the RPC and the edition instead.
 *   On launch night the nine-field mainnet flip moved the whole site and left THIS page reporting
 *   Sepolia's supply, on the one surface SuperRare itself renders. Nothing errored; the numbers
 *   were simply another chain's.
 * ⚑ The security property costs exactly this, so the test pays it back: the values are pinned
 *   against chain-config, which is the only place either is decided. */
console.log('\n── the embed reads the SAME chain the rest of the site does ──');
{
  const cfgSrc = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
  const CFG = new Function('window', cfgSrc + '; return window.RIPMASTER_CHAIN;')({});
  const ed = (html.match(/var EDITION = '(0x[0-9a-fA-F]{40})'/) || [])[1];
  const rpcBlock = (html.match(/var RPCS = \[([\s\S]*?)\]/) || [])[1] || '';
  const rpcs = [...rpcBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
  ok('the embed names an edition', !!ed, ed || 'none');
  ok('…and it is the one chain-config names',
    !!ed && ed.toLowerCase() === String((CFG.contracts || {}).liquidEdition).toLowerCase(),
    `embed ${ed} vs config ${(CFG.contracts || {}).liquidEdition}`);

  /* ⛔ MORE THAN ONE ENDPOINT, BECAUSE ONE WAS A SINGLE POINT OF FAILURE ON THE ONE SURFACE
   *   SUPERRARE RENDERS. Artist, 2026-08-06, from a phone: "token balance not showing on mobile"
   *   — both live cells were em-dashes while the two hardcoded ones rendered fine. Driven at four
   *   viewports and inside a sandboxed frame the code is correct everywhere, and the em-dash
   *   state reproduces ONLY on request failure: there was simply nothing behind the one URL.
   * ⚑ AND THIS TEST IS WHY IT SURVIVED. It pinned the endpoint's NETWORK and had no opinion about
   *   how many there were, so a single point of failure was invisible to a guard written to watch
   *   this exact value. `js/chain-config.js` had already carried four since two of three were
   *   found dead; the embed cannot import it (no <script src>) and inlined the ADDRESS but not
   *   the LIST. A count is now part of the contract. */
  ok('the embed carries MORE THAN ONE rpc — no single point of failure',
    rpcs.length >= 3, rpcs.length + ' endpoint(s)');
  /* ⚠ Checked for the right NETWORK, not for string equality: the embed deliberately uses
   *   CORS-open public nodes (a sandboxed frame is at an opaque origin) and need not use the same
   *   providers the site does. What none of them may ever do is read a different chain. */
  const wantsTestnet = CFG.network !== 'mainnet';
  const wrong = rpcs.filter(r => /sepolia/i.test(r) !== wantsTestnet);
  ok('…and every one of them points at the same network as chain-config',
    rpcs.length > 0 && wrong.length === 0,
    wrong.length ? `${wrong.join(', ')} while chain-config says ${CFG.network}` : rpcs.length + ' ok');
  ok('…and none is duplicated (a repeated url is a fallback that is not one)',
    new Set(rpcs).size === rpcs.length, rpcs.join(', '));

  /* ⛔ A LIST IS NOT A FALLBACK UNLESS SOMETHING WALKS IT, and this repo has shipped exactly that
   *   mistake before — `built ≠ reachable`, one layer in. Four urls read by code that only ever
   *   uses [0] passes every assertion above and fails in production identically. */
  ok('…and the reader actually tries all of them',
    /RPCS\s*\.\s*forEach/.test(html) && !/RPCS\s*\[\s*0\s*\]/.test(html));
  /* ⛔ AND IT SAYS SO WHEN IT CANNOT REACH ANY. An em-dash under a label reading "live supply ·
   *   read from the contract" is a promise with nothing behind it, indistinguishable from a
   *   supply of zero or a dead contract — the failure the artist had to report by hand because
   *   the page would not report it itself. */
  ok('…and it retries rather than giving up on one attempt', /setTimeout\(function \(\) \{ attempt\(/.test(html));
  ok('…and it states the failure instead of leaving a mystery dash',
    /unreachable from here/.test(html));
}

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : ''}\n`);
process.exit(fail ? 1 : 0);

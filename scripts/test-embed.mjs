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

console.log('\n── it must still send people somewhere, and say it is safe ──');
ok('links to the studio site', /ripmaster3030studios\.com/.test(html));
ok('states it will never ask for a wallet', /never ask for your wallet/i.test(html));
ok('carries the NFA disclaimer', /\bNFA\b/.test(html));

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : ''}\n`);
process.exit(fail ? 1 : 0);

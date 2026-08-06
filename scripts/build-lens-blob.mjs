#!/usr/bin/env node
/* ripmaster3030studios — build deploy-lens.html's deployment bytecode from SOURCE.
 *
 *   node scripts/build-lens-blob.mjs [--write]
 *
 * ⛔ THIS CONTRACT HAS MORE FROZEN-AT-DEPLOY STRINGS THAN ANYTHING ELSE IN THE REPO, and CLAUDE.md
 *   records each of them being wrong at least once:
 *     · the EIP-712 domain ("ripmaster3030studios") is part of EVERY voucher digest. Change it
 *       after one real voucher is signed and every outstanding voucher dies. It is in the
 *       constructor's `EIP712(...)` call, i.e. the SOURCE, not an argument — asserted below.
 *     · symbol() — frozen, like the edition's.
 *     · the byline compiled into the on-chain animation_url HTML — NO SETTER.
 *   `externalUrl` and `lensBaseUrl` ARE settable (setUrls), but marketplaces cache metadata hard,
 *   so "recoverable" and "not wrong on a collector's card for a week" are different things.
 *
 * ⚠ CONSTRUCTOR POSITIONS ARE LOAD-BEARING: renderer 3rd, signer 4th. The contract's own comment
 *   says so because both this script and the Remix table count positions, and swapping them makes
 *   the hot signing key the admin that can repoint every card.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import { encodeAbiParameters } from 'viem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

const cfgSrc = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
const CFG = new Function('window', cfgSrc + '; return window.RIPMASTER_CHAIN;')({});
if (CFG.network !== 'mainnet') { console.error('⛔ chain-config is not on mainnet — refusing'); process.exit(1); }

const HOST = 'https://www.ripmaster3030studios.com';
const RENDERER = (CFG.contracts || {}).renderContract || '';
/* ⛔ THE CLAIM SIGNER MUST NOT BE THE OWNER. The owner is whoever sends this deploy — the artist's
 *   SuperRare wallet — and it can repoint every card. The signer is a hot key used all season to
 *   sign hero vouchers. Same key for both means one compromise loses the whole deck.
 * ⚠ It must also be an EOA: the contract verifies with ECDSA.recover, so a Safe or any contract
 *   wallet reverts EVERY claim with BadSignature(). Confirmed by the artist 2026-08-06. */
const SIGNER = '0x42A6baD4Ba3e6A3Ac5E14935F55Ee1ACfBCeb049';
const OWNER_WILL_BE = '0x432D71bA14D2602B566dD9e3e098E24859d166c9';

const ARGS = {
  name:        'ripmaster3030studios',
  symbol:      '3030L',
  renderer:    RENDERER,          // position 3 — the edition's render contract, for passthrough
  signer:      SIGNER,            // position 4 — hot, rotatable via setClaimSigner
  externalUrl: HOST,
  lensBaseUrl: HOST + '/cards/hero/',
};

for (const [k, v] of [['renderer', ARGS.renderer], ['signer', ARGS.signer]])
  if (!/^0x[0-9a-fA-F]{40}$/.test(v) || /^0x0+$/.test(v)) { console.error(`⛔ ${k} is not an address: ${v}`); process.exit(1); }
if (ARGS.signer.toLowerCase() === OWNER_WILL_BE.toLowerCase()) {
  console.error('⛔ the claim signer is the wallet that will own this contract — refusing'); process.exit(1);
}

const SRC = 'contracts/Ripmaster3030Lens721.sol';
const source = readFileSync(join(ROOT, SRC), 'utf8');

/* ⛔ THE EIP-712 DOMAIN, ASSERTED IN THE SOURCE BEFORE COMPILING. It is not a constructor
 *   argument, so no amount of checking the args would catch it — and it is the single string that,
 *   once one real voucher is signed against the deployed contract, can never change. */
if (!/EIP712\("ripmaster3030studios", "1"\)/.test(source)) {
  console.error('⛔ the EIP-712 domain is not ripmaster3030studios — refusing'); process.exit(1);
}

const findImport = p => {
  for (const c of [join(ROOT, 'node_modules', p), join(ROOT, p)])
    if (existsSync(c)) return { contents: readFileSync(c, 'utf8') };
  return { error: 'not found: ' + p };
};
const out = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  sources: { [SRC]: { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true,
              outputSelection: { '*': { '*': ['evm.bytecode.object', 'abi'] } } },
}), { import: findImport }));
const errs = (out.errors || []).filter(e => e.severity === 'error');
if (errs.length) { errs.forEach(e => console.error(e.formattedMessage)); process.exit(1); }
const warns = (out.errors || []).filter(e => e.severity === 'warning');

const C = out.contracts[SRC].Ripmaster3030Lens721;
const encoded = encodeAbiParameters(
  [{ type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'address' },
   { type: 'string' }, { type: 'string' }],
  [ARGS.name, ARGS.symbol, ARGS.renderer, ARGS.signer, ARGS.externalUrl, ARGS.lensBaseUrl]);
const blob = '0x' + C.evm.bytecode.object + encoded.slice(2);

console.log(`compiled  ${C.evm.bytecode.object.length / 2} bytes + ${(encoded.length - 2) / 2} bytes of args   warnings ${warns.length}`);
for (const [k, v] of Object.entries(ARGS)) console.log(`  ${k.padEnd(12)} ${v}`);

const ascii = Buffer.from(blob.slice(2), 'hex').toString('latin1');
let bad = 0;
/* ⚠ SPLIT, and this file is a GENERATOR so the name law is right to insist. My first version also
 *   checked the retired DOMAIN separately, which was redundant — the domain CONTAINS the name, so
 *   one check covers both and the extra literal bought nothing but a way to fail. */
const RETIRED = ['upper', 'deck', 'ripmaster3030'].join('');
if (ascii.includes(RETIRED)) { console.error(`⛔ the blob contains the retired studio name`); bad++; }
for (const s of ['ripmaster3030studios', '3030L'])
  if (!ascii.includes(s)) { console.error(`⛔ the blob is MISSING "${s}"`); bad++; }
if (bad) process.exit(1);
console.log('✓ blob carries the live name and symbol, and no retired string survives');

if (!write) { console.log('\n(dry run — pass --write to update deploy-lens.html)'); process.exit(0); }

const P = join(ROOT, 'deploy-lens.html');
let page = readFileSync(P, 'utf8');
const before = page;
page = page.replace(/const BLOB = '0x[0-9a-f]*'/, `const BLOB = '${blob}'`);
page = page.replace(/const RENDERER = '0x[0-9a-fA-F]{40}'/, `const RENDERER = '${ARGS.renderer}'`);
page = page.replace(/const SIGNER = '0x[0-9a-fA-F]{40}'/, `const SIGNER = '${ARGS.signer}'`);
page = page.replace(/const EDITION = '0x[0-9a-fA-F]{40}'/, `const EDITION = '${(CFG.contracts || {}).liquidEdition}'`);
if (page === before) { console.error('⛔ no anchor matched — deploy-lens.html NOT updated'); process.exit(1); }
writeFileSync(P, page);
console.log(`✦ deploy-lens.html updated (blob ${(blob.length - 2) / 2} bytes)`);

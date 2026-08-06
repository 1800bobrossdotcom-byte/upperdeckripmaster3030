#!/usr/bin/env node
/* ripmaster3030studios — build deploy-sink.html's deployment bytecode from SOURCE.
 *
 *   node scripts/build-sink-blob.mjs [--write]
 *
 * ⛔ BOTH CONSTRUCTOR ARGUMENTS ARE `immutable`. A wrong token bricks every pack payment
 *   (`_split` calls token.burn, so buyPack reverts forever); a wrong treasury sends half of every
 *   pack and half of every game rake to an address nobody controls, permanently. Neither is a
 *   setting to change later — both are a redeploy. So they are derived here, asserted against the
 *   compiled bytes, and re-read off-chain after deploy by the page's own verify step.
 *
 * ⚑ Modelled on build-render-blob.mjs for the reason that one exists: deploy-render.html shipped a
 *   hand-pasted blob built in July and never rebuilt, which silently aged into carrying the
 *   Sepolia edition and the retired studio name. A pasted artifact is a generator's output with
 *   no generator. There is a generator now.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import { encodeAbiParameters } from 'viem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

/* Read both addresses out of chain-config — the file the SITE reads — so the deployed contract
 * and the browser that will call it cannot disagree about the token or the treasury.
 * ⚑ Unlike the renderer, this is safe to read from the config: chain-config is now flipped to
 *   mainnet and carries the live edition, so there is no window where it points elsewhere. */
const cfgSrc = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
const CFG = new Function('window', cfgSrc + '; return window.RIPMASTER_CHAIN;')({});

const TOKEN = (CFG.contracts || {}).liquidEdition || '';
const TREASURY = CFG.treasury || '';

if (CFG.network !== 'mainnet') { console.error('⛔ chain-config is not on mainnet — refusing'); process.exit(1); }
for (const [k, v] of [['token', TOKEN], ['treasury', TREASURY]])
  if (!/^0x[0-9a-fA-F]{40}$/.test(v) || /^0x0+$/.test(v)) { console.error(`⛔ ${k} is not an address: ${v}`); process.exit(1); }

/* ⛔ THE TREASURY MUST NOT BE THE DEPLOY WALLET OR THE SEPOLIA BURNER. `test:name` pins this with
 *   four assertions and each was proved to bite; re-checked here because that protection lives in
 *   a test that nobody runs at 11pm, and this is the last moment the value is free. */
const HOT = '0x432D71bA14D2602B566dD9e3e098E24859d166c9';
const SEPOLIA = '0x5C3bc6dD6d5b9913d267527275dD95ceB235d89F';
for (const [why, bad] of [['the hot deploy wallet', HOT], ['the Sepolia burner', SEPOLIA]])
  if (TREASURY.toLowerCase() === bad.toLowerCase()) { console.error(`⛔ treasury is ${why} — refusing`); process.exit(1); }

const SRC = 'contracts/PackSink.sol';
const findImport = p => {
  for (const c of [join(ROOT, 'node_modules', p), join(ROOT, p)])
    if (existsSync(c)) return { contents: readFileSync(c, 'utf8') };
  return { error: 'not found: ' + p };
};
/* Same settings lens-cli.mjs compiles every contract in this repo with, so the bytecode this
 * page sends is byte-identical to what `lens-cli deploy-sink` would send. */
const out = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  sources: { [SRC]: { content: readFileSync(join(ROOT, SRC), 'utf8') } },
  settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true,
              outputSelection: { '*': { '*': ['evm.bytecode.object', 'abi'] } } },
}), { import: findImport }));
const errs = (out.errors || []).filter(e => e.severity === 'error');
if (errs.length) { errs.forEach(e => console.error(e.formattedMessage)); process.exit(1); }
const warns = (out.errors || []).filter(e => e.severity === 'warning');

const C = out.contracts[SRC].PackSink;
const encoded = encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [TOKEN, TREASURY]);
const blob = '0x' + C.evm.bytecode.object + encoded.slice(2);

console.log(`compiled  ${C.evm.bytecode.object.length / 2} bytes + 64 bytes of args   warnings ${warns.length}`);
console.log(`  token     ${TOKEN}     (the $3030 edition — burns half of every pack)`);
console.log(`  treasury  ${TREASURY}     (COLD, receives the studio half)`);

/* ⚑ ASSERT THE ARGUMENTS SURVIVED INTO THE BYTES. Reading the variables back proves the script's
 *   own arithmetic; reading the BLOB proves what the wallet will actually broadcast. */
const tail = encoded.slice(2).toLowerCase();
let bad = 0;
if (!tail.includes(TOKEN.slice(2).toLowerCase())) { console.error('⛔ token missing from the encoded args'); bad++; }
if (!tail.includes(TREASURY.slice(2).toLowerCase())) { console.error('⛔ treasury missing from the encoded args'); bad++; }
if (bad) process.exit(1);
console.log('✓ both immutable arguments are present in the bytes to be sent');

if (!write) { console.log('\n(dry run — pass --write to update deploy-sink.html)'); process.exit(0); }

const P = join(ROOT, 'deploy-sink.html');
let page = readFileSync(P, 'utf8');
const before = page;
page = page.replace(/const BLOB = '0x[0-9a-f]*'/, `const BLOB = '${blob}'`);
page = page.replace(/const TOKEN = '0x[0-9a-fA-F]{40}'/, `const TOKEN = '${TOKEN}'`);
page = page.replace(/const TREASURY = '0x[0-9a-fA-F]{40}'/, `const TREASURY = '${TREASURY}'`);
if (page === before) { console.error('⛔ no anchor matched — deploy-sink.html NOT updated'); process.exit(1); }
writeFileSync(P, page);
console.log(`✦ deploy-sink.html updated (blob ${(blob.length - 2) / 2} bytes)`);

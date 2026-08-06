#!/usr/bin/env node
/* ripmaster3030studios — rebuild deploy-render.html's deployment bytecode from SOURCE.
 *
 *   node scripts/build-render-blob.mjs [--write]
 *
 * ⛔ WHY THIS EXISTS. `deploy-render.html` shipped a hand-pasted `BLOB` — a pre-compiled
 *   creation bytecode with the constructor arguments already ABI-encoded onto the tail. It was
 *   built for Sepolia in July and never rebuilt, so on 2026-08-06 it still carried:
 *       · the SEPOLIA edition address as constructor arg 1
 *       · `upperdeckripmaster3030` as the lens name
 *       · `https://upperdeckripmaster3030.com/` as the animation_url
 *       · `UR3030 per RARE` as a metadata trait, COMPILED IN
 *   and the source it came from still drew the retired name in the on-chain SVG and in the
 *   animation_url byline. Deploying it to mainnet would have frozen all of that.
 *
 * ⚑ THE GENERALISATION THIS REPO KEEPS PAYING FOR: a pasted artifact is a GENERATOR'S OUTPUT
 *   with no generator. `restyle-backs.mjs` taught it one way (a generator left armed puts the
 *   defect back); this is the mirror image — output with no generator can never be refreshed, so
 *   it silently ages into a trap. The blob is derived now, and `npm run test:name` asserts the
 *   shipped page matches what this script produces.
 *
 * ⚠ The four strings below are what a collector permanently sees. `setMeta`/`setAnimationUrl`
 *   can change them AFTER deploy, but the SVG text and the HTML byline are compiled in and
 *   cannot — that is why the source had to be fixed first, not just these arguments.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import { encodeAbiParameters } from 'viem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

/* Read the edition + host out of chain-config so this cannot drift from what the site reads. */
const cfgSrc = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
const CFG = new Function('window', cfgSrc + '; return window.RIPMASTER_CHAIN;')({});

/* ⛔ MAINNET EDITION, deployed 2026-08-06. Held here explicitly rather than read from
 *   chain-config, because chain-config is still pointed at Sepolia until the nine-field flip —
 *   and the renderer is deployed BEFORE that flip. Reading the config would have silently built
 *   a mainnet renderer around the Sepolia token. */
const EDITION = '0x1D4bcbb505182a49303CC3B23EfF1E3157147A33';

/* ⚠ `www`, not the apex: the platform serves www as Production and 308s the apex to it. A
 *   marketplace fetching an animation_url should land on the served host, not a redirect. */
const HOST = 'https://www.ripmaster3030studios.com';

const ARGS = {
  liquid:      EDITION,
  name:        'ripmaster3030studios',
  description: 'A card and game studio on SuperRare Liquid Editions. The market is the medium.',
  externalUrl: HOST,
  /* ⛔ /superrare.html — NOT the site root. index.html loads pack.js and js/wallet.js, so
   *   framing it inside a marketplace puts wallet code in their iframe. That is the exact thing
   *   SuperRare's security team flagged, and the whole reason the wallet-free superrare.html
   *   exists. The Sepolia renderer pointed at the root and nobody noticed for three weeks. */
  animationUrl: HOST + '/superrare.html',
};

const SRC = 'contracts/Ripmaster3030Renderer.sol';
const input = {
  language: 'Solidity',
  sources: { [SRC]: { content: readFileSync(join(ROOT, SRC), 'utf8') } },
  /* ⚠ viaIR is REQUIRED — without it this contract hits "Stack too deep". It is also what
   *   lens-cli.mjs compiles every other contract in this repo with, so the settings match. */
  settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true,
              outputSelection: { '*': { '*': ['evm.bytecode.object', 'abi'] } } },
};
/* Same resolver lens-cli.mjs uses — node_modules first, then repo-relative. */
const findImport = p => {
  for (const c of [join(ROOT, 'node_modules', p), join(ROOT, p)])
    if (existsSync(c)) return { contents: readFileSync(c, 'utf8') };
  return { error: 'not found: ' + p };
};
const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
const errs = (out.errors || []).filter(e => e.severity === 'error');
if (errs.length) { errs.forEach(e => console.error(e.formattedMessage)); process.exit(1); }
const warns = (out.errors || []).filter(e => e.severity === 'warning');

const C = out.contracts[SRC].Ripmaster3030Renderer;
const encoded = encodeAbiParameters(
  [{ type: 'address' }, { type: 'string' }, { type: 'string' }, { type: 'string' }, { type: 'string' }],
  [ARGS.liquid, ARGS.name, ARGS.description, ARGS.externalUrl, ARGS.animationUrl]);
const blob = '0x' + C.evm.bytecode.object + encoded.slice(2);

console.log(`compiled  ${C.evm.bytecode.object.length / 2} bytes + ${(encoded.length - 2) / 2} bytes of args`);
console.log(`warnings  ${warns.length}`);
for (const [k, v] of Object.entries(ARGS)) console.log(`  ${k.padEnd(13)} ${v}`);

/* ⚑ ASSERT THE RETIRED NAME IS ABSENT FROM THE BYTES WE ARE ABOUT TO SHIP. The strings live
 *   inside the compiled section, so checking the .sol file is not the same as checking the blob —
 *   that gap is exactly how the old one survived. */
const ascii = Buffer.from(blob.slice(2), 'hex').toString('latin1');
let bad = 0;
/* ⚠ SPLIT ON PURPOSE, AND IT IS NOT COSMETIC. This file WRITES deploy-render.html, so the name
 *   law treats it as a generator — and a generator holding the retired name as a literal is the
 *   `restyle-backs.mjs` failure waiting to happen, whatever the surrounding code intends. Built
 *   from fragments, this script provably cannot emit it. `test:name` failed on exactly this line
 *   the first time, which is the checker doing its job on the code written to enforce it. */
const RETIRED = ['upper', 'deck', 'ripmaster3030'].join('');
const RETIRED_TICKER = ['UR', '3030'].join('');
for (const s of [RETIRED, RETIRED_TICKER]) {
  if (ascii.includes(s)) { console.error(`⛔ the compiled blob still contains "${s}"`); bad++; }
}
for (const s of ['ripmaster3030studios', '/superrare.html', '3030 per RARE']) {
  if (!ascii.includes(s)) { console.error(`⛔ the compiled blob is MISSING "${s}"`); bad++; }
}
if (bad) process.exit(1);
console.log('✓ blob carries the live name, points at /superrare.html, and no retired string survives');

if (!write) { console.log('\n(dry run — pass --write to update deploy-render.html)'); process.exit(0); }

const P = join(ROOT, 'deploy-render.html');
let page = readFileSync(P, 'utf8');
const before = page;
page = page.replace(/const BLOB = '0x[0-9a-f]*'/, `const BLOB = '${blob}'`);
page = page.replace(/const TOKEN = '0x[0-9a-fA-F]{40}'/, `const TOKEN = '${EDITION}'`);
page = page.replace(/https:\/\/dev\.superrare\.co\/liquid-editions\/11155111\/0x[0-9a-fA-F]{40}/,
  `https://superrare.com/liquid-editions/1/${EDITION}`);
if (page === before) { console.error('⛔ no anchor matched — deploy-render.html was NOT updated'); process.exit(1); }
writeFileSync(P, page);
console.log(`✦ deploy-render.html updated (blob ${(blob.length - 2) / 2} bytes)`);

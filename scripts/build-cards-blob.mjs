#!/usr/bin/env node
/* ripmaster3030studios — build the `setCards` calldata for deploy-cards.html.
 *
 *   node scripts/build-cards-blob.mjs [--write]
 *
 * ⛔ THIS IS THE ONLY THING STANDING BETWEEN THE 33 AND THEIR ART. Read live off the deployed
 *   lens: every wiring field is already correct — owner, claimSigner (a different key, as
 *   intended), editionRenderer, edition (so the staking tiers read), name, symbol, all three
 *   base URLs. `_cards` is empty and nothing else is. The consequence is exact and visible in
 *   `tokenURI(1)` today: there is **no `image` key at all** (the contract only emits one when
 *   `c.cid` is non-empty) and the name falls back to "Card 1" instead of the artist's title.
 *
 * ⚑ THE CIDs ARE NOT COPIED FROM A DASHBOARD. scripts/hero-cids.mjs computed each one from the
 *   file itself, so the value written on-chain stays re-derivable from the artwork forever. That
 *   is the whole property: anyone can hash the image and check the token.
 *
 * ⚠ setCards is NOT immutable — a wrong entry is one more owner transaction, not a redeploy. But
 *   marketplaces cache metadata hard, so "correctable" and "not wrong on a collector's card for a
 *   week" are different things. Everything below is asserted before the calldata is emitted, and
 *   the PAGE additionally refuses to send until every CID actually resolves.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeFunctionData, keccak256, toHex } from 'viem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

const CFG = new Function('window', readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8') +
  '; return window.RIPMASTER_CHAIN;')({});
if (CFG.network !== 'mainnet') { console.error('⛔ chain-config is not on mainnet — refusing'); process.exit(1); }
const LENS = (CFG.contracts || {}).lens721 || '';
if (!/^0x[0-9a-fA-F]{40}$/.test(LENS) || /^0x0+$/.test(LENS)) { console.error(`⛔ lens721 is not an address: ${LENS}`); process.exit(1); }

const MAN = JSON.parse(readFileSync(join(ROOT, 'cards/hero/cids.json'), 'utf8'));
const DECK = JSON.parse(readFileSync(join(ROOT, 'cards/deck-manifest.json'), 'utf8'));
const heroes = (DECK.cards || []).filter(c => c.band === 'hero').sort((a, b) => a.id - b.id);

/* ⛔ THE TITLES ARE THE ARTIST'S, VERBATIM, AND SEVERAL OF THEM LOOK LIKE PLACEHOLDERS ON PURPOSE.
 *   "______", "'''''''", ",.,.,.,.,." are titles — confirmed by the artist ("some of the names be
 *   like that — ______ untitled type shit"). Nothing here may "tidy" them, and no check may treat
 *   an unusual title as missing data: a validator that rejects a punctuation title would silently
 *   drop a third of the deck's names on the one transaction that publishes them. Only a genuinely
 *   EMPTY string is an error, because that is the value the contract already has. */
let bad = 0;
const ids = [], cids = [], titles = [];
for (const c of heroes) {
  const id = Number(c.id);
  const cid = MAN.cids[String(id)] || '';
  const title = String(c.title ?? '');
  if (id < 1 || id > 33) { console.error(`⛔ ${id}: not a hero id (1–33)`); bad++; continue; }
  if (!cid) { console.error(`⛔ ${id}: no CID in cards/hero/cids.json`); bad++; continue; }
  if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafk[a-z2-7]+)$/.test(cid)) { console.error(`⛔ ${id}: "${cid}" is not a CID`); bad++; continue; }
  if (!title) { console.error(`⛔ ${id}: empty title — that is what the contract already stores`); bad++; continue; }
  ids.push(id); cids.push(cid); titles.push(title);
}
if (ids.length !== 33) { console.error(`⛔ ${ids.length} cards, expected 33`); bad++; }
if (new Set(cids).size !== cids.length) { console.error('⛔ two cards share a CID — the same art is on both'); bad++; }
if (bad) process.exit(1);

const CALLDATA = encodeFunctionData({
  abi: [{ name: 'setCards', type: 'function', stateMutability: 'nonpayable', inputs: [
    { name: 'ids', type: 'uint256[]' }, { name: 'cids', type: 'string[]' }, { name: 'titles', type: 'string[]' }] }],
  functionName: 'setCards',
  args: [ids.map(BigInt), cids, titles],
});

console.log(`lens      ${LENS}`);
console.log(`cards     ${ids.length}  (ids ${ids[0]}–${ids[ids.length - 1]})`);
console.log(`calldata  ${(CALLDATA.length - 2) / 2} bytes`);
for (let i = 0; i < ids.length; i++)
  console.log(`  ${String(ids[i]).padStart(2)}  ${cids[i]}  ${JSON.stringify(titles[i])}`);

/* ⚠ A rough floor, not a quote. Each card stores a ~46-byte CID (3 slots) and a short title
 *   (1 slot) into empty storage at 20,000 gas a slot, plus 16 gas per non-zero calldata byte.
 *   Printed so a wallet showing something in this neighbourhood is expected rather than alarming;
 *   the PAGE estimates against the live chain, which is the number that counts. */
const gas = ids.length * 4 * 20000 + (CALLDATA.length - 2) / 2 * 16 + 21000;
console.log(`\n~${(gas / 1e6).toFixed(2)}M gas expected (storage-dominated; the page estimates live)`);

if (!write) { console.log('\n(dry run — pass --write to update deploy-cards.html)'); process.exit(0); }

const P = join(ROOT, 'deploy-cards.html');
let page = readFileSync(P, 'utf8');
const before = page;
page = page.replace(/const CALLDATA = '0x[0-9a-fA-F]*'/, `const CALLDATA = '${CALLDATA}'`);
page = page.replace(/const LENS = '0x[0-9a-fA-F]{40}'/, `const LENS = '${LENS}'`);
/* ⛔ THE READ SELECTORS ARE COMPUTED HERE, NOT TYPED INTO THE PAGE. I wrote `card(uint256)` from
 *   memory as 0x81f906cd; it is 0xbfcfd9b9. This repo has paid for that exact mistake before —
 *   "writing the two selectors from memory got BOTH wrong" — and a wrong read selector does not
 *   throw, it hits the fallback or returns nothing, so step ③ would have reported a perfectly
 *   published deck as unset and sent somebody re-sending a 2.8M-gas transaction. */
const SEL = Object.fromEntries(['card(uint256)', 'tokenURI(uint256)', 'owner()']
  .map(s => [s.replace(/\(.*/, ''), keccak256(toHex(s)).slice(0, 10)]));
page = page.replace(/const SEL = \{[^}]*\}/,
  `const SEL = { card: '${SEL.card}', tokenURI: '${SEL.tokenURI}', owner: '${SEL.owner}' }`);
console.log(`selectors  card ${SEL.card} · tokenURI ${SEL.tokenURI} · owner ${SEL.owner}`);
page = page.replace(/const CARDS = \[[\s\S]*?\];\s*\/\*END-CARDS\*\//,
  `const CARDS = [\n${ids.map((id, i) =>
    `    { id: ${id}, cid: ${JSON.stringify(cids[i])}, title: ${JSON.stringify(titles[i])}, art: ${JSON.stringify('/' + MAN.files[String(id)])} },`
  ).join('\n')}\n  ];  /*END-CARDS*/`);
if (page === before) { console.error('⛔ no anchor matched — deploy-cards.html NOT updated'); process.exit(1); }
writeFileSync(P, page);
console.log(`\n✦ deploy-cards.html updated — ${ids.length} cards, ${(CALLDATA.length - 2) / 2} bytes of calldata`);

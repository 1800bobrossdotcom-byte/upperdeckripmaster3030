#!/usr/bin/env node
// Print the CardVault.registerCards calldata batches from cards/manifest.json —
// one batch per season, ids = deck numbers, tiers = the manifest's rarity mapped
// to the vault's enum (common 0 / uncommon 1 / rare 2 / mythic 3 / prizm 4).
// Paste each line into `cast send <VAULT> "registerCards(uint256[],uint32,uint8[])" …`
// (docs/CARD-ECONOMY-SPEC.md §7). The marquee is not registered — it is minted
// 1/1 by the constructor and never enters the playable pool.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { cards } = JSON.parse(readFileSync(join(root, 'cards', 'manifest.json'), 'utf8'));
const TIER = { common: 0, uncommon: 1, rare: 2, mythic: 3, prizm: 4 };

const seasons = [...new Set(cards.map(c => c.season))].sort((a, b) => a - b);
for (const s of seasons) {
  const list = cards.filter(c => c.season === s).sort((a, b) => a.number - b.number);
  // vault ids must be globally unique: season * 200 + number keeps seasons apart
  const ids = list.map(c => s * 200 + c.number);
  const tiers = list.map(c => TIER[c.rarity] ?? 0);
  console.log(`# season ${s} — ${list.length} cards`);
  console.log(`"[${ids.join(',')}]" ${s} "[${tiers.join(',')}]"`);
  console.log(`# slugs: ${list.map((c, i) => `${ids[i]}=${c.slug}`).join(' ')}\n`);
}
console.log('# note: vault id = season*200 + №  (e.g. S1 №01 = 201, S2 №18 = 418)');

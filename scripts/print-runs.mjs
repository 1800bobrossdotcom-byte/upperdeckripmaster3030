// print-runs.mjs — per-card ERC-1155 LENS supply (the "denominations") for $UR3030.
//
// Each card in the field is a LENS: an ERC-1155 render token (reads the Liquid
// Edition's market + burn state). A pack rips 7 lens copies; a card's print run is
// its 1155 supply cap. Rarer tier → smaller print run. Sized so the field's total
// prints ≈ the pull budget (packs × 7) across the four-season life, and so the
// abundant tiers (which also retire first in the burn-down) flood then turn to ash,
// while the scarce tiers (which survive) stay genuinely rare.
//
//   node scripts/print-runs.mjs

import { readFileSync } from 'node:fs';

const CARDS_PER_PACK = 7;
const PACKS = { 'I · Summer': 1600, 'II · Fall': 1100, 'III · Winter': 600, 'IV · Spring': 260 };
const totalPacks = Object.values(PACKS).reduce((a, b) => a + b, 0);
const pullBudget = totalPacks * CARDS_PER_PACK;

// per-tier print run (1155 supply cap per card of that rarity). Tunable knobs.
const RUN = { common: 200, uncommon: 105, rare: 62, mythic: 45, prizm: 22 };
const MARQUEE = 1;                                   // the sealed 1/1 marquee lens (Lovebeing)

const manifest = JSON.parse(readFileSync(new URL('../cards/manifest.json', import.meta.url)));
const cards = manifest.cards || manifest;

const byTier = {};
for (const c of cards) (byTier[c.rarity] ||= []).push(c);

const fmt = n => n.toLocaleString('en-US');
const order = ['common', 'uncommon', 'rare', 'mythic', 'prizm'];

console.log('LENS PRINT RUNS · $UR3030 field (ERC-1155 companion lenses)\n');
console.log(`field ${cards.length} cards · ${totalPacks} packs × ${CARDS_PER_PACK} cards = ${fmt(pullBudget)} lens pulls over the field's life\n`);
console.log('tier      cards  run/card   tier supply   share');

let grand = 0;
const tierSupply = {};
for (const tier of order) {
  const list = byTier[tier] || [];
  const run = RUN[tier] || 0;
  const supply = list.length * run;
  tierSupply[tier] = supply; grand += supply;
  console.log(
    tier.padEnd(9),
    String(list.length).padStart(4),
    String(run).padStart(9),
    fmt(supply).padStart(13),
  );
}
console.log('marquee '.padEnd(9), String(1).padStart(4), String('1/1').padStart(9), fmt(MARQUEE).padStart(13));
grand += MARQUEE;

for (const tier of order) {
  const pct = (tierSupply[tier] / grand * 100).toFixed(1);
  process.stdout.write('');
  // annotate share on a second pass so the % column lines up with the grand total
}
console.log('─'.repeat(52));
console.log('TOTAL LENS SUPPLY'.padEnd(24), fmt(grand).padStart(13));
console.log(`\npull budget (packs×7): ${fmt(pullBudget)}   ·   total print supply: ${fmt(grand)}   ·   ${grand >= pullBudget ? 'supply ≥ pulls ✓ (field can sell through, some prints spare)' : 'supply < pulls — some cards sell out before the field does'}`);

console.log('\nrarity mix of pulls (share of total supply):');
for (const tier of order) console.log('  ' + tier.padEnd(9), (tierSupply[tier] / grand * 100).toFixed(1) + '%');

console.log(`\nnote: print run (ownable copies) and burn-down retirement (field status) are SEPARATE axes.`);
console.log(`  · commons: biggest print runs AND retire first → they flood the packs, then their lenses render as ASH (trophies).`);
console.log(`  · prizm: tiniest print runs AND survive → genuinely scarce lenses that endure into the 77-card deck.`);
console.log(`  · a card "sells out" when its 1155 supply cap is hit (no more pulls); it "retires" when cumulative $UR3030`);
console.log(`    burn crosses its milestone (render flips to ash). The two can happen in either order.`);

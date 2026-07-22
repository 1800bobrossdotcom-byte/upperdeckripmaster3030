// print-runs.mjs — SITE-LAYER copy supply for the 67 FIELD CARDS ($UR3030 model v2.2).
//
// Model v2.2: every card is a LENS (a render keyed by id in one renderer+721 contract).
//   · 33 HERO lenses are 1/1 — minted now (11 gacha + 22 earned). No print run.
//   · 67 FIELD cards are RENDER-ONLY lenses (unminted, chain-readable) that you collect
//     as SITE-LAYER copies pulled from packs. A field card's "print run" is its site-layer
//     copy cap — how many copies circulate — which powers COMPRESSION (own every copy →
//     compress to a 1/1) and scarcity. These are NOT on-chain mints.
//
// Rarity is set by community vote (Rarity Court); the tier mix below is ILLUSTRATIVE and
// the caps are curator knobs. Sized so total field copies ≈ the pack pull budget.
//
//   node scripts/print-runs.mjs

const DECK        = 100;
const HERO_LENSES = 33;                    // 1/1 ERC-721 lenses minted now
const HERO_GACHA  = 11;                     // pulled from packs → mint
const HERO_EARNED = 22;                     // won as game titles → mint (12 season + 6 first-blood + 4 grand)
const FIELD       = DECK - HERO_LENSES;     // 67 render-only field cards (site-layer copies)

const CARDS_PER_PACK = 7;
const PACKS = { 'I · Summer': 1600, 'II · Fall': 1100, 'III · Winter': 600, 'IV · Spring': 260 };
const totalPacks = Object.values(PACKS).reduce((a, b) => a + b, 0);
const pullBudget = totalPacks * CARDS_PER_PACK - HERO_GACHA;   // field-card copies pulled over the field's life

// Illustrative tier mix of the 67 field cards + per-tier site-layer copy cap (tunable).
const FIELD_TIERS = [
  { tier: 'common',   cards: 26, run: 620 },
  { tier: 'uncommon', cards: 20, run: 320 },
  { tier: 'rare',     cards: 13, run: 160 },
  { tier: 'mythic',   cards:  6, run:  80 },
  { tier: 'prizm',    cards:  2, run:  40 },
];

const fmt = n => n.toLocaleString('en-US');
const fieldCardCount = FIELD_TIERS.reduce((a, t) => a + t.cards, 0);

console.log('FIELD-CARD COPY SUPPLY · $UR3030 model v2.2 (site-layer, NOT on-chain mints)\n');
console.log(`deck ${DECK} = ${HERO_LENSES} hero lenses (${HERO_GACHA} gacha + ${HERO_EARNED} earned, each 1/1) + ${FIELD} field cards + Lovebeing (holder lens)`);
console.log(`packs ${fmt(totalPacks)} × ${CARDS_PER_PACK} − ${HERO_GACHA} gacha claims = ${fmt(pullBudget)} field-card copies pulled over the field's life\n`);

if (fieldCardCount !== FIELD)
  console.log(`⚠ tier mix sums to ${fieldCardCount}, expected ${FIELD} field cards — adjust FIELD_TIERS.\n`);

console.log('tier       cards   cap/card   tier copies');
let grand = 0;
for (const t of FIELD_TIERS) {
  const copies = t.cards * t.run;
  grand += copies;
  console.log(t.tier.padEnd(10), String(t.cards).padStart(5), String(t.run).padStart(10), fmt(copies).padStart(14));
}
console.log('─'.repeat(46));
console.log('TOTAL FIELD COPIES'.padEnd(26), fmt(grand).padStart(14));
console.log(`\npull budget: ${fmt(pullBudget)}   ·   total field copies: ${fmt(grand)}   ·   ${grand >= pullBudget ? 'copies ≥ pulls ✓ (field can sell through, some spare)' : 'copies < pulls — some field cards sell out before the field does'}`);

console.log('\nnotes (v2.2):');
console.log('  · The 33 hero lenses are 1/1 (minted); they have NO print run — you own the one, or you don\'t.');
console.log('  · Field-card copies are SITE-LAYER (render-only lenses, 0 mints). Own every copy of one → COMPRESS to a 1/1.');
console.log('  · Nothing here is destroyed by the burn — cards SURVIVE. The token contracts; the deck endures.');
console.log('  · Rarity is community-voted (Rarity Court); tiers/caps above are illustrative curator knobs.');

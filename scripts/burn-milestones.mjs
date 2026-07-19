#!/usr/bin/env node
// The burn-milestone schedule — the launch-architecture heart of the game.
//
// One ERC-20 (the Liquid Edition). No card contracts. The 196-card deck is the
// ARTWORK of the edition, and the community burns it down: every time cumulative
// witnessed burn crosses the next milestone, the next card in the published
// retirement queue is retired — forever — until 77 survivors remain.
//
//   node scripts/burn-milestones.mjs          # prints the schedule, writes the JSON
//
// Order: weakest first. Cards are queued by rarity tier (common → prizm) and,
// within a tier, by ascending trait-score (the same headless-canvas traits that
// derived the tiers). The queue is PUBLISHED at season open — everyone can see
// exactly which card dies at which milestone, and watch the fire approach it.
//
// Spacing: an arithmetic escalator. Retirement k costs (BASE + STEP·k) more
// cumulative burn than retirement k-1 — early commons fall to a few packs of
// burn, the last cuts before the survivors cost whole crowds. Tuned so a
// SOLD-OUT season of packs (~10,000 rips ≈ 4.37M burned) retires all 119:
// the deck only reaches 77 if the season truly burns.
//
// The render reads the protocol's canonical burn measure (verify the exact
// getter in the liquid-editions-starter-kit; fallback: a checkpoint ratchet in
// the render contract) and needs NO game contract. See docs/LAUNCH-ARCHITECTURE.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SURVIVORS = 77;
const BASE = 15_000;    // tokens of burn for the first increment
const STEP = 360;       // each retirement costs this much more than the last

const manifest = JSON.parse(readFileSync(join(ROOT, 'cards/manifest.json'), 'utf8'));
const cards = manifest.cards || manifest;
const traits = JSON.parse(readFileSync(join(ROOT, 'cards/data/_traits.json'), 'utf8'));

// composite trait score (z-sum across dimensions — same spirit as derive-rarity)
const DIMS = ['colorfulness', 'neon', 'sat', 'gold', 'sparkle', 'paletteDiv', 'bgVar', 'bright', 'contrast'];
const stats = {};
for (const d of DIMS) {
  const vals = traits.map(t => +t[d] || 0);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
  stats[d] = { mean, sd };
}
const score = {};
for (const t of traits)
  score[t.slug] = DIMS.reduce((a, d) => a + ((+t[d] || 0) - stats[d].mean) / stats[d].sd, 0);

const TIER_ORDER = { common: 0, uncommon: 1, rare: 2, mythic: 3, prizm: 4 };
const queue = [...cards]
  .filter(c => c.slug !== 'lovebeing')                    // the 1/1 marquee is indestructible
  .sort((a, b) =>
    (TIER_ORDER[a.rarity] ?? 0) - (TIER_ORDER[b.rarity] ?? 0) ||
    (score[a.slug] ?? 0) - (score[b.slug] ?? 0) ||
    a.slug.localeCompare(b.slug));                        // deterministic tie-break

const nRetire = queue.length - SURVIVORS;
const retire = queue.slice(0, nRetire);
const survivors = queue.slice(nRetire).map(c => c.slug);

let cum = 0;
const milestones = retire.map((c, i) => {
  cum += BASE + STEP * (i + 1);
  return { k: i + 1, slug: c.slug, title: c.title, tier: c.rarity, cumulativeBurn: cum };
});

const out = {
  season: 1,
  note: 'Published retirement queue — weakest first. Card k retires when cumulative witnessed burn crosses cumulativeBurn. Survivors are never listed. The 1/1 marquee is indestructible.',
  base: BASE, step: STEP,
  totalToClear: cum,
  survivorsCount: survivors.length,
  milestones,
  survivors,
};
writeFileSync(join(ROOT, 'cards/data/_milestones.json'), JSON.stringify(out, null, 1));

// ── report ──
const fmt = n => n.toLocaleString('en-US');
console.log(`burn-milestone schedule · season 1`);
console.log(`field ${cards.length - 1} (+1 indestructible marquee) → retire ${nRetire} → survive ${survivors.length}`);
console.log(`escalator: increment k = ${fmt(BASE)} + ${STEP}·k  ·  full clear at ${fmt(cum)} burned`);
console.log(`(a sold-out season of packs ≈ 10,000 rips ≈ 4,375,000 burned — the deck only reaches ${SURVIVORS} if the season truly burns)`);
console.log(`\nfirst 5 to fall:`);
for (const m of milestones.slice(0, 5))
  console.log(`  #${String(m.k).padStart(3)} ${m.title.padEnd(18)} ${m.tier.padEnd(9)} at ${fmt(m.cumulativeBurn).padStart(10)} burned`);
console.log(`last 5 before the deck locks:`);
for (const m of milestones.slice(-5))
  console.log(`  #${String(m.k).padStart(3)} ${m.title.padEnd(18)} ${m.tier.padEnd(9)} at ${fmt(m.cumulativeBurn).padStart(10)} burned`);
const byTier = {};
for (const m of milestones) byTier[m.tier] = (byTier[m.tier] || 0) + 1;
const surTier = {};
for (const s of survivors) { const c = cards.find(x => x.slug === s); surTier[c.rarity] = (surTier[c.rarity] || 0) + 1; }
console.log(`\nretired by tier: ${JSON.stringify(byTier)}`);
console.log(`survivors by tier: ${JSON.stringify(surTier)}`);
console.log(`\n✦ wrote cards/data/_milestones.json`);

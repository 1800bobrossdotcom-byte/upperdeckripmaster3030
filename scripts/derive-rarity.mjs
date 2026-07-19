#!/usr/bin/env node
// Trait-based rarity. Rarity is not assigned by hand anymore — it is DERIVED from
// what the card art actually is. Two trait sources feed one score:
//
//   1. Visual traits (cards/data/_traits.json) — measured off the pixels of every
//      card (foil sparkle, gold leaf, colorfulness, palette breadth, neon, edge
//      variance/full-bleed, contrast). Produced by scripts/extract-traits (a
//      headless-canvas pass over cards/art/*).
//   2. Semantic traits (cards/data/_archetypes.json) — archetype + subject-count,
//      read from the art by vision. Rarer archetypes and busier scenes score up.
//
// The scarcer a card's traits are across the deck, the higher its score. Cards are
// then ranked and bucketed into the five tiers by fixed counts (a rarity pyramid),
// so "rare" means genuinely uncommon traits, not a coin flip. The script rewrites
// each dossier's `rarity` + a `traits` block, and swaps the foil-treatment class on
// each cards/<slug>.html to match. Re-run build-manifest + the gallery after.
//
//   node scripts/derive-rarity.mjs           # apply
//   node scripts/derive-rarity.mjs --dry      # print the table, write nothing

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { rootDir } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data');
const dry = process.argv.includes('--dry');

const traits = JSON.parse(readFileSync(join(dataDir, '_traits.json'), 'utf8')).filter(t => !t.err);
const arch = JSON.parse(readFileSync(join(dataDir, '_archetypes.json'), 'utf8'));   // { slug: {archetype, subjects} }

// ── stats helpers ──
const col = k => traits.map(t => +t[k] || 0);
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) || 1; };
const zof = k => { const a = col(k), m = mean(a), s = std(a); return v => (v - m) / s; };
const pct = (k, p) => { const a = [...col(k)].sort((x, y) => x - y); return a[Math.floor(p * a.length)]; };
const Z = {}; for (const k of ['sparkle', 'gold', 'colorfulness', 'paletteDiv', 'neon', 'contrast', 'bgVar']) Z[k] = zof(k);

// ── archetype scarcity ──
const archCount = {};
for (const t of traits) { const a = (arch[t.slug] || {}).archetype || 'unknown'; archCount[a] = (archCount[a] || 0) + 1; }
const total = traits.length;
const rareArch = a => -Math.log(((archCount[a] || 1)) / total);           // scarcer archetype → bigger
const raArr = traits.map(t => rareArch((arch[t.slug] || {}).archetype || 'unknown'));
const raMean = mean(raArr), raStd = std(raArr);
const subjBonus = s => (s === 'group' ? 0.6 : s === 'duo' ? 0.35 : 0);

// ── the score ──
const p80s = pct('sparkle', .8), p85g = pct('gold', .85), p85c = pct('colorfulness', .85), p70b = pct('bgVar', .7), p80p = pct('paletteDiv', .8);
const scored = traits.map(t => {
  const a = (arch[t.slug] || {}).archetype || 'unknown', subj = (arch[t.slug] || {}).subjects || 'solo';
  const score =
      1.8 * Z.sparkle(t.sparkle) + 1.5 * Z.gold(t.gold) + 1.1 * Z.colorfulness(t.colorfulness)
    + 0.9 * Z.paletteDiv(t.paletteDiv) + 0.6 * Z.neon(t.neon) + 0.4 * Z.contrast(t.contrast)
    + 0.5 * Z.bgVar(t.bgVar) + 0.8 * ((rareArch(a) - raMean) / raStd) + subjBonus(subj);
  const tags = [];
  if (t.sparkle >= p80s) tags.push('holo');
  if (t.gold >= p85g) tags.push('gold-leaf');
  if (t.colorfulness >= p85c) tags.push('hyper-color');
  if (t.paletteDiv >= p80p) tags.push('full-spectrum');
  tags.push(t.bgVar >= p70b ? 'full-bleed' : 'framed');
  tags.push(a); if (subj !== 'solo') tags.push(subj);
  return { slug: t.slug, score, tags, archetype: a, subjects: subj, t };
});

// ── bucket by fixed counts (the pyramid) ──
const COUNTS = { prizm: 5, mythic: 17, rare: 40, uncommon: 60, common: 74 };  // = 196
scored.sort((a, b) => b.score - a.score);
let i = 0; const order = ['prizm', 'mythic', 'rare', 'uncommon', 'common'];
for (const tier of order) { for (let k = 0; k < COUNTS[tier] && i < scored.length; k++, i++) scored[i].tier = tier; }
for (; i < scored.length; i++) scored[i].tier = 'common';

// ── apply ──
const TIERS = ['common', 'uncommon', 'rare', 'mythic', 'prizm'];
const bySlug = new Map(scored.map(s => [s.slug, s]));
let changed = 0, dist = { common: 0, uncommon: 0, rare: 0, mythic: 0, prizm: 0 };
for (const s of scored) {
  dist[s.tier]++;
  const dossier = join(dataDir, `${s.slug}.json`);
  if (!existsSync(dossier)) continue;
  const d = JSON.parse(readFileSync(dossier, 'utf8'));
  const was = d.rarity;
  d.rarity = s.tier;
  d.traits = {
    archetype: s.archetype, subjects: s.subjects, tags: s.tags,
    rarityScore: +s.score.toFixed(3),
    visual: { sparkle: s.t.sparkle, gold: s.t.gold, colorfulness: s.t.colorfulness, paletteDiv: s.t.paletteDiv, neon: s.t.neon, bgVar: s.t.bgVar, contrast: s.t.contrast },
    derivedBy: 'trait-based (pixel traits + vision archetype)',
  };
  if (was !== s.tier) changed++;
  if (!dry) writeFileSync(dossier, JSON.stringify(d, null, 2));
  // swap the foil-treatment class on the card page
  const page = join(cardsDir, `${s.slug}.html`);
  if (!dry && existsSync(page)) {
    const html = readFileSync(page, 'utf8').replace(/class="card t-(?:common|uncommon|rare|mythic|prizm)"/, `class="card t-${s.tier}"`);
    writeFileSync(page, html);
  }
}

console.log(`trait-based rarity over ${scored.length} cards${dry ? ' (DRY)' : ''}`);
console.log('distribution:', TIERS.map(t => `${t} ${dist[t]}`).join(' · '));
console.log('archetypes:', Object.entries(archCount).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(' · '));
console.log(`rarity changed on ${changed}/${scored.length} cards`);
console.log('\ntop 12 (rarest):');
for (const s of scored.slice(0, 12)) console.log(`  ${s.tier.padEnd(9)} ${s.slug.padEnd(16)} ${s.score.toFixed(2).padStart(6)}  [${s.tags.join(', ')}]`);

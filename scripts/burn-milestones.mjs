#!/usr/bin/env node
// ⚠ DEPRECATED (model v2.2, 2026-07) — CARD RETIREMENT IS CUT. ─────────────────────
// v2.2 removed forced card retirement / ash entirely: the 100-card deck SURVIVES; the
// burn is TOKEN DEFLATION only (3,030,000 → ~1,010,000 float, ⅔ contraction — see
// scripts/token-model.mjs §5 and docs/ECONOMIC-FLOW.md §6). Scarcity now comes from
// dwindling pack allotments + community rarity votes + voluntary compression, NOT from
// destroying cards. This script and cards/data/_milestones.json describe the OLD
// weakest-first card-retirement queue and are retained only until any UI that reads
// _milestones.json is migrated off it, then both will be deleted. Do not treat the
// output below as current model. ────────────────────────────────────────────────────
//
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
// burn, the last cuts before the survivors cost whole crowds.
//
// MINT-ONCE INVARIANT (per SuperRare audit 2026-07): a Liquid Edition mints its
// whole supply into the pool ONCE at launch and burned tokens DO NOT re-mint —
// every burn is permanent. So the retirement schedule cannot burn more than the
// supply. We size the WHOLE 119-card retirement (a multi-season arc, not one
// season) to a fixed LIFETIME_BURN_BUDGET set to a fraction of the cap, leaving a
// deliberate live float. The escalator's BASE is DERIVED from that budget, so the
// full clear lands on the budget by construction — never above the cap.
// The exact curve/supply/pack sizing is co-designed with SuperRare (see the audit
// reply); the fraction below is our provisional target.
//
// The render reads the protocol's canonical burn measure — burn progress is
// derived as maxTotalSupply − totalSupply() (there is no burn getter; see
// docs/RESEARCH-NOTES.md) — and needs NO game contract. See docs/LAUNCH-ARCHITECTURE.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SURVIVORS = 77;
const CAP = 3_030_000;                                 // maxTotalSupply — minted once, burns are permanent
const BURN_FRACTION = 2 / 3;                            // provisional: retire the field by burning ⅔ of the mint…
const LIFETIME_BURN_BUDGET = Math.round(CAP * BURN_FRACTION / 1000) * 1000;  // …≈ 2,020,000, rounded to a clean 1k
const STEP = 150;       // escalation steepness — each retirement costs this much more than the last
// BASE is DERIVED below so the full clear lands exactly on LIFETIME_BURN_BUDGET.

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

// Derive BASE so Σ(k=1..n)(BASE + STEP·k) == LIFETIME_BURN_BUDGET.
//   Σ = n·BASE + STEP·n(n+1)/2   ⇒   BASE = (BUDGET − STEP·n(n+1)/2) / n
const triangular = nRetire * (nRetire + 1) / 2;
const BASE = Math.round((LIFETIME_BURN_BUDGET - STEP * triangular) / nRetire);

let cum = 0;
const milestones = retire.map((c, i) => {
  cum += BASE + STEP * (i + 1);
  return { k: i + 1, slug: c.slug, title: c.title, tier: c.rarity, cumulativeBurn: cum };
});
const FLOOR = CAP - cum;   // permanent live float that survives the full retirement

const out = {
  season: 1,
  note: 'Published retirement queue — weakest first. Card k retires when cumulative witnessed burn crosses cumulativeBurn. Survivors are never listed. The 1/1 marquee is indestructible. Burns are PERMANENT (mint-once): the full clear is sized under the cap by design.',
  cap: CAP, base: BASE, step: STEP,
  totalToClear: cum,               // total tokens permanently burned to retire the whole field
  floorSupply: FLOOR,              // live tokens remaining after the field fully retires
  burnFraction: +(cum / CAP).toFixed(4),
  survivorsCount: survivors.length,
  milestones,
  survivors,
};
writeFileSync(join(ROOT, 'cards/data/_milestones.json'), JSON.stringify(out, null, 1));

// ── report ──
const fmt = n => n.toLocaleString('en-US');
console.log(`burn-milestone schedule · mint-once (burns permanent)`);
console.log(`field ${cards.length - 1} (+1 indestructible marquee) → retire ${nRetire} → survive ${survivors.length}`);
console.log(`escalator: increment k = ${fmt(BASE)} + ${STEP}·k  ·  full clear burns ${fmt(cum)} (${(cum/CAP*100).toFixed(1)}% of the ${fmt(CAP)} mint)`);
console.log(`floor: ${fmt(FLOOR)} $UR3030 survive the full retirement as permanent live float  ·  fits under cap ✓ (${cum < CAP ? 'OK' : 'OVER CAP!'})`);
console.log(`(the field retires over its LIFE, across seasons — not one season; the deck only reaches ${SURVIVORS} if the community truly burns)`);
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

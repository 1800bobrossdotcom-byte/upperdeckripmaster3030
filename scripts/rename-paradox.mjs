#!/usr/bin/env node
// Rename every field card to a UNIQUE paradox, assigned from the card's OCR/trait
// fingerprint, and set its "did you know" factoid to explain that paradox.
//
//   node scripts/rename-paradox.mjs            # apply
//   node scripts/rename-paradox.mjs --dry      # report only, write nothing
//
// Source of paradoxes: cards/data/_paradoxes.json  (array of {name, blurb}).
// Assignment: field cards (all but the 1/1 marquee) are ordered by rarity, then by
// a weighted sum of their 9 numeric image traits (_traits.json) — so each card's
// paradox is deterministically driven by its own art, and every one is unique.
// Patches: per-slug dossier (title+factoid), card HTML (<h1 id=b-title> + <title>),
// manifest.json, _factoids.json, _milestones.json titles, and the gallery tiles.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const P = p => join(ROOT, p);
const rd = p => JSON.parse(readFileSync(P(p), 'utf8'));
const wr = (p, o) => { if (!DRY) writeFileSync(P(p), JSON.stringify(o, null, 1)); };

const EXCLUDE = new Set(['lovebeing']);              // the artist's 1/1 marquee keeps its name
const RANK = { prizm: 4, mythic: 3, rare: 2, uncommon: 1, common: 0 };

const pool = rd('cards/data/_paradoxes.json');
const manifest = rd('cards/manifest.json');
const cards = manifest.cards;
const traits = rd('cards/data/_traits.json');
const traitBy = Object.fromEntries(traits.map(t => [t.slug, t]));
const factoids = existsSync(P('cards/data/_factoids.json')) ? rd('cards/data/_factoids.json') : {};
const milestones = existsSync(P('cards/data/_milestones.json')) ? rd('cards/data/_milestones.json') : null;

// weighted image-trait fingerprint (normalized per dimension so no trait dominates)
const DIMS = ['colorfulness', 'neon', 'sat', 'gold', 'sparkle', 'paletteDiv', 'bgVar', 'bright', 'contrast'];
const stat = {};
for (const d of DIMS) {
  const v = traits.map(t => +t[d] || 0), mn = Math.min(...v), mx = Math.max(...v);
  stat[d] = { mn, span: (mx - mn) || 1 };
}
const finger = slug => {
  const t = traitBy[slug] || {};
  // deterministic weighted mix; weights are just distinct primes so the ordering is stable + spread
  const W = [1.0, 1.7, 1.3, 2.3, 1.9, 1.1, 0.7, 1.5, 2.1];
  return DIMS.reduce((a, d, i) => a + W[i] * (((+t[d] || 0) - stat[d].mn) / stat[d].span), 0);
};

const field = cards.filter(c => !EXCLUDE.has(c.slug));
if (pool.length < field.length) { console.error(`pool ${pool.length} < needed ${field.length}`); process.exit(1); }

// order: rarity high→low, then fingerprint low→high. iconic paradoxes (pool head) land on the rarest cards.
field.sort((a, b) => (RANK[b.rarity] ?? 0) - (RANK[a.rarity] ?? 0) || finger(a.slug) - finger(b.slug) || a.slug.localeCompare(b.slug));
const assign = new Map();                            // slug -> {name, blurb, old}
field.forEach((c, i) => assign.set(c.slug, { name: pool[i].name, blurb: pool[i].blurb, old: c.title }));

// ── apply ──
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let htmlPatched = 0, dossPatched = 0, galleryHits = 0;

// 1) per-slug dossiers + card HTML
for (const [slug, a] of assign) {
  const dpath = `cards/data/${slug}.json`;
  if (existsSync(P(dpath))) {
    const d = rd(dpath); d.title = a.name; d.factoid = a.blurb; wr(dpath, d); dossPatched++;
  }
  const hpath = `cards/${slug}.html`;
  if (existsSync(P(hpath))) {
    let h = readFileSync(P(hpath), 'utf8'); const before = h;
    h = h.replace(new RegExp(`(<h1 id="b-title">)${esc(a.old)}(</h1>)`), `$1${a.name}$2`);
    h = h.replace(new RegExp(`(<title>)${esc(a.old)}( · )`), `$1${a.name}$2`);
    if (h !== before) { if (!DRY) writeFileSync(P(hpath), h); htmlPatched++; }
  }
  factoids[slug] = a.blurb;
}

// 2) manifest titles
for (const c of cards) { const a = assign.get(c.slug); if (a) c.title = a.name; }
wr('cards/manifest.json', manifest);

// 3) factoids
wr('cards/data/_factoids.json', factoids);

// 4) milestones titles
if (milestones && milestones.milestones) {
  for (const m of milestones.milestones) { const a = assign.get(m.slug); if (a) m.title = a.name; }
  wr('cards/data/_milestones.json', milestones);
}

// 5) gallery tiles (cards/index.html): aria-label + visible tile-name, keyed by data-href
const gpath = 'cards/index.html';
if (existsSync(P(gpath))) {
  let g = readFileSync(P(gpath), 'utf8');
  for (const [slug, a] of assign) {
    const b = g;
    g = g.replace(new RegExp(`(data-href="${esc(slug)}\\.html"[^>]*aria-label=")${esc(a.old)}(")`), `$1${a.name}$2`);
    g = g.replace(new RegExp(`(<span class="tile-name">)${esc(a.old)}(</span>)`), `$1${a.name}$2`);
    if (g !== b) galleryHits++;
  }
  if (!DRY) writeFileSync(P(gpath), g);
}

// ── report ──
console.log(`${DRY ? 'DRY-RUN · ' : ''}assigned ${assign.size} paradoxes (excluded ${[...EXCLUDE]})`);
console.log(`dossiers ${dossPatched} · card-html ${htmlPatched} · gallery ${galleryHits} · pool used ${field.length}/${pool.length}`);
const sample = field.slice(0, 6).concat(field.slice(-3));
for (const c of sample) { const a = assign.get(c.slug); console.log(`  ${c.rarity.padEnd(8)} ${c.slug.padEnd(16)} ${a.old.padEnd(16)} → ${a.name}`); }
if (!DRY) {
  const map = Object.fromEntries([...assign].map(([s, a]) => [s, { name: a.name, was: a.old }]));
  writeFileSync(P('cards/data/_paradox-map.json'), JSON.stringify(map, null, 1));
  console.log('✦ wrote cards/data/_paradox-map.json');
}

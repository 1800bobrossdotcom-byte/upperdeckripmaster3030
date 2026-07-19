#!/usr/bin/env node
// Second pass after rename-paradox.mjs: patch the OLD title where it still lingers,
// but ONLY in title-scoped spots (never in free-form lore, where "Eruption" is a word).
// Scoped targets:
//   cards/<slug>.html : the header comment `name:  OLD` and the art <img alt="OLD">
//   cards/index.html  : per-tile art alt + the HODL / demote vote-button aria-labels
// Keyed off cards/data/_paradox-map.json ({slug:{name,was}}) written by the rename.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const P = p => join(ROOT, p);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const map = JSON.parse(readFileSync(P('cards/data/_paradox-map.json'), 'utf8'));
let htmlHits = 0, galleryHits = 0;

// 1) each card's own file — comment header + art alt (both title-scoped, safe)
for (const [slug, { name, was }] of Object.entries(map)) {
  const hp = `cards/${slug}.html`;
  if (!existsSync(P(hp))) continue;
  let h = readFileSync(P(hp), 'utf8'); const before = h;
  h = h.replace(new RegExp(`(\\n\\s*name:\\s*)${esc(was)}(\\s*\\n)`), `$1${name}$2`);
  h = h.replace(new RegExp(`(<img src="art/${esc(slug)}\\.webp" alt=")${esc(was)}(")`), `$1${name}$2`);
  if (h !== before) { if (!DRY) writeFileSync(P(hp), h); htmlHits++; }
}

// 2) gallery tiles — art alt + vote-button aria-labels, each scoped by slug
const gp = 'cards/index.html';
if (existsSync(P(gp))) {
  let g = readFileSync(P(gp), 'utf8');
  for (const [slug, { name, was }] of Object.entries(map)) {
    const b = g;
    g = g.replace(new RegExp(`(<img src="art/${esc(slug)}\\.webp" alt=")${esc(was)}(")`), `$1${name}$2`);
    g = g.replace(new RegExp(`(data-slug="${esc(slug)}" aria-label="burn to HODL )${esc(was)}( —)`), `$1${name}$2`);
    g = g.replace(new RegExp(`(data-slug="${esc(slug)}" aria-label="burn to demote )${esc(was)}(")`), `$1${name}$2`);
    if (g !== b) galleryHits++;
  }
  if (!DRY) writeFileSync(P(gp), g);
}

console.log(`${DRY ? 'DRY · ' : ''}card-html alt/comment patched: ${htmlHits} · gallery tiles patched: ${galleryHits}`);

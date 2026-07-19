#!/usr/bin/env node
// Build cards/manifest.json — a flat index of every card the arena (and any other
// client page) can fetch at runtime on a static host. Pulls stats/lore from the
// committed dossiers and season/number from each card page's <title>.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { rootDir } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data');

const cards = [];
for (const f of readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  const d = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
  const html = existsSync(join(cardsDir, `${d.slug}.html`)) ? readFileSync(join(cardsDir, `${d.slug}.html`), 'utf8') : '';
  const m = html.match(/<title>[^<]*·\s*S(\d+)\s*№(\d+)<\/title>/i);
  cards.push({
    slug: d.slug, title: d.title, rarity: d.rarity || 'common',
    atk: d.atk, def: d.def, trigger: d.trigger,
    omen: d.omen || '', lore: d.lore || '',
    season: m ? +m[1] : 1, number: m ? +m[2] : 0,
    art: `art/${d.slug}.webp`,
  });
}
cards.sort((a, b) => a.season - b.season || a.number - b.number);
writeFileSync(join(cardsDir, 'manifest.json'), JSON.stringify({ count: cards.length, cards }, null, 0));
console.log(`✦ manifest: ${cards.length} cards → cards/manifest.json`);

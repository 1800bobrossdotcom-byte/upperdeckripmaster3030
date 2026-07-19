#!/usr/bin/env node
// Apply cards/data/_names.json (slug -> {name, blurb}) over whatever the cards are
// currently titled (read from manifest.json — the authoritative current title). Rewrites:
//   dossier cards/data/<slug>.json  (title + factoid)
//   card HTML cards/<slug>.html      (<h1 id=b-title>, <title>, `name:` comment, art alt)
//   manifest.json titles · _factoids.json · _milestones.json titles
//   gallery cards/index.html         (tile aria-label + tile-name + art alt + vote labels)
//   node scripts/apply-names.mjs [--dry]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const P = p => join(ROOT, p);
const rd = p => JSON.parse(readFileSync(P(p), 'utf8'));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');        // regex-escape (for matching CURRENT title)
const attr = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const names = rd('cards/data/_names.json');
const manifest = rd('cards/manifest.json');
const factoids = existsSync(P('cards/data/_factoids.json')) ? rd('cards/data/_factoids.json') : {};
const milestones = existsSync(P('cards/data/_milestones.json')) ? rd('cards/data/_milestones.json') : null;

const cur = Object.fromEntries(manifest.cards.map(c => [c.slug, c.title]));   // current title per slug
let doss = 0, html = 0, gallery = 0;

for (const [slug, { name, blurb }] of Object.entries(names)) {
  const was = cur[slug];
  if (!was) { console.warn(`no current title for ${slug}`); continue; }

  // dossier
  const dp = `cards/data/${slug}.json`;
  if (existsSync(P(dp))) { const d = rd(dp); d.title = name; d.factoid = blurb; if (!DRY) writeFileSync(P(dp), JSON.stringify(d, null, 1)); doss++; }

  // card HTML (scoped, current-title-keyed)
  const hp = `cards/${slug}.html`;
  if (existsSync(P(hp))) {
    let h = readFileSync(P(hp), 'utf8'); const b0 = h;
    h = h.replace(new RegExp(`(<h1 id="b-title">)${esc(was)}(</h1>)`), (_, a, z) => a + text(name) + z);
    h = h.replace(new RegExp(`(<title>)${esc(was)}( · )`), (_, a, z) => a + text(name) + z);
    h = h.replace(new RegExp(`(\\n\\s*name:\\s*)${esc(was)}(\\s*\\n)`), (_, a, z) => a + name + z);
    h = h.replace(new RegExp(`(<img src="art/${esc(slug)}\\.webp" alt=")${esc(was)}(")`), (_, a, z) => a + attr(name) + z);
    if (h !== b0) { if (!DRY) writeFileSync(P(hp), h); html++; }
  }

  factoids[slug] = blurb;
}

// manifest titles
for (const c of manifest.cards) { if (names[c.slug]) c.title = names[c.slug].name; }
if (!DRY) writeFileSync(P('cards/manifest.json'), JSON.stringify(manifest, null, 1));
if (!DRY) writeFileSync(P('cards/data/_factoids.json'), JSON.stringify(factoids, null, 1));

// milestones
if (milestones && milestones.milestones) {
  for (const m of milestones.milestones) { if (names[m.slug]) m.title = names[m.slug].name; }
  if (!DRY) writeFileSync(P('cards/data/_milestones.json'), JSON.stringify(milestones, null, 1));
}

// gallery
const gp = 'cards/index.html';
if (existsSync(P(gp))) {
  let g = readFileSync(P(gp), 'utf8');
  for (const [slug, { name }] of Object.entries(names)) {
    const was = cur[slug]; if (!was) continue; const b0 = g;
    g = g.replace(new RegExp(`(data-href="${esc(slug)}\\.html"[^>]*aria-label=")${esc(was)}(")`), (_, a, z) => a + attr(name) + z);
    g = g.replace(new RegExp(`(<span class="tile-name">)${esc(was)}(</span>)`), (_, a, z) => a + text(name) + z);
    g = g.replace(new RegExp(`(<img src="art/${esc(slug)}\\.webp" alt=")${esc(was)}(")`), (_, a, z) => a + attr(name) + z);
    g = g.replace(new RegExp(`(data-slug="${esc(slug)}" aria-label="burn to HODL )${esc(was)}( —)`), (_, a, z) => a + attr(name) + z);
    g = g.replace(new RegExp(`(data-slug="${esc(slug)}" aria-label="burn to demote )${esc(was)}(")`), (_, a, z) => a + attr(name) + z);
    if (g !== b0) gallery++;
  }
  if (!DRY) writeFileSync(P(gp), g);
}

console.log(`${DRY ? 'DRY · ' : ''}dossiers ${doss} · card-html ${html} · gallery ${gallery} / ${Object.keys(names).length}`);
if (!DRY) writeFileSync(P('cards/data/_paradox-map.json'), JSON.stringify(
  Object.fromEntries(Object.entries(names).map(([s, v]) => [s, { name: v.name, was: cur[s] }])), null, 1));

#!/usr/bin/env node
// Merge the 14 vision batches (tmp_naming/presult_*.json) into one unique
// slug -> {name, blurb} map. Each card proposed a primary historic name + an
// `alt` backup; on a cross-batch collision we fall back to the alt, then to a
// small reserve of unused historic mononyms. Rarer cards pick first.
//   node scripts/merge-names.mjs            # write cards/data/_names.json + report
//   node scripts/merge-names.mjs --report   # report only

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = p => join(ROOT, p);
const REPORT = process.argv.includes('--report');

const manifest = JSON.parse(readFileSync(P('cards/manifest.json'), 'utf8'));
const RANK = { prizm: 4, mythic: 3, rare: 2, uncommon: 1, common: 0 };
const rankBy = Object.fromEntries(manifest.cards.map(c => [c.slug, RANK[c.rarity] ?? 0]));

// gather
const rows = [];
for (let b = 0; b < 14; b++) {
  const f = `tmp_naming/presult_${b}.json`;
  if (!existsSync(P(f))) { console.error(`MISSING ${f}`); continue; }
  const arr = JSON.parse(readFileSync(P(f), 'utf8'));
  for (const r of arr) rows.push(r);
}
const bySlug = new Map(rows.map(r => [r.slug, r]));
console.log(`gathered ${rows.length} rows · ${bySlug.size} unique slugs`);

// reserve historic mononyms for the unlucky double-collisions (art-neutral but on-theme)
const RESERVE = ['Thermopylae','Gallipoli','Verdun','Ypres','Somme','Agincourt','Hastings','Cannae','Zama',
  'Actium','Rubicon','Alamo','Gettysburg','Bastille','Sarajevo','Guernica','Dunkirk','Stalingrad','Nagasaki',
  'Hiroshima','Vinland','Timbuktu','Petra','Palmyra','Nineveh','Uruk','Knossos','Mycenae','Troy','Ithaca',
  'Delos','Thebes','Memphis','Nubia','Kush','Axum','Zanzibar','Samarkand','Bukhara','Angkor','Nalanda',
  'Lascaux','Altamira','Stonehenge','Avalon','Tintagel','Lyonesse','Ys','Shangri','Eldorado','Cibola',
  'Zembla','Kitezh','Numenor','Atlantis','Mu','Lemuria','Thule','Hyperborea','Aztlan','Cathay','Ophir',
  'Sheba','Colchis','Tartessos','Meroe','Ctesiphon','Persepolis','Nimrud','Ur','Lagash','Sumer','Elam'];

const order = [...bySlug.keys()].sort((a, b) => (rankBy[b] - rankBy[a]) || a.localeCompare(b));
const taken = new Map();          // name(lower) -> slug
const final = {};                 // slug -> {name, blurb, src}
const reservePick = () => { for (const r of RESERVE) if (!taken.has(r.toLowerCase())) return r; return null; };

let usedAlt = 0, usedReserve = 0;
const unresolved = [];
for (const slug of order) {
  const r = bySlug.get(slug);
  const name = (r.name || '').trim(), alt = (r.alt || '').trim();
  let pick = null, src = 'name';
  if (name && !taken.has(name.toLowerCase())) { pick = name; src = 'name'; }
  else if (alt && !taken.has(alt.toLowerCase())) { pick = alt; src = 'alt'; usedAlt++; }
  else { pick = reservePick(); src = 'reserve'; usedReserve++; if (!pick) { unresolved.push(slug); continue; } }
  taken.set(pick.toLowerCase(), slug);
  final[slug] = { name: pick, blurb: (r.blurb || '').trim(), src, primary: name, alt };
}

// report
console.log(`resolved: ${Object.keys(final).length} · primary ${Object.values(final).filter(x=>x.src==='name').length} · alt ${usedAlt} · reserve ${usedReserve}`);
if (unresolved.length) console.log('UNRESOLVED (no free name):', unresolved.join(', '));
const collided = Object.entries(final).filter(([,v]) => v.src !== 'name');
console.log('── fell back off primary (collision) ──');
for (const [slug, v] of collided) console.log(`  ${slug.padEnd(16)} ${v.primary.padEnd(14)} → ${v.name} (${v.src})`);

// dup safety check
const names = Object.values(final).map(v => v.name.toLowerCase());
const dupe = names.filter((n,i) => names.indexOf(n) !== i);
console.log(dupe.length ? `!! DUPLICATES: ${[...new Set(dupe)].join(', ')}` : '✓ all names unique');

if (!REPORT) {
  const out = Object.fromEntries(Object.entries(final).map(([s, v]) => [s, { name: v.name, blurb: v.blurb }]));
  writeFileSync(P('cards/data/_names.json'), JSON.stringify(out, null, 1));
  console.log(`✦ wrote cards/data/_names.json (${Object.keys(out).length} cards)`);

  // re-check bundle: the art-neutral reserve picks need a proper art-matched name.
  const anchors = existsSync(P('scratchpad_anchors.json'))
    ? JSON.parse(readFileSync(P('scratchpad_anchors.json'), 'utf8')) : [];
  const anchorBy = Object.fromEntries(anchors.map(a => [a.slug, a]));
  const reserveSlugs = Object.entries(final).filter(([, v]) => v.src === 'reserve').map(([s]) => s);
  const avoid = Object.values(final).filter(v => v.src !== 'reserve').map(v => v.name);  // keep good names locked
  const bundle = {
    avoid,
    cards: reserveSlugs.map(s => ({ ...(anchorBy[s] || { slug: s }), placeholder: final[s].name })),
  };
  writeFileSync(P('tmp_naming/_recheck.json'), JSON.stringify(bundle, null, 1));
  console.log(`✦ wrote tmp_naming/_recheck.json (${reserveSlugs.length} cards to re-name, ${avoid.length} names locked)`);
}

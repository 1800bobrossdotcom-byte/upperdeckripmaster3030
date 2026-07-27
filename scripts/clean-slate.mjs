#!/usr/bin/env node
/* Clean-slate the deck — take the 196 PLACEHOLDER cards out so the real handmade
 * Season-I deck can go in.
 *
 * The placeholders were always scaffolding: procedurally-named, vision-rated stand-ins
 * that let the site, the games and the economy be built before the art existed. They must
 * not be on screen at launch.
 *
 *   node scripts/clean-slate.mjs                 # DRY RUN — prints what would move
 *   node scripts/clean-slate.mjs --apply         # archive the placeholder deck
 *   node scripts/clean-slate.mjs --apply --keep alley-trio,blue-boar
 *   node scripts/clean-slate.mjs --restore       # put an archived deck back
 *
 * ARCHIVES, never deletes. Everything lands in cards/_archive-placeholder/ so a wrong call
 * is one --restore away. Shared data files (_archetypes/_factoids/_milestones) stay put —
 * they're deck-independent and the real cards will want them.
 *
 * After this runs the site is in its EMPTY DECK state. That is a supported state, not a
 * broken one: the gallery, the binder and the pack-rip are expected to say "Season I
 * incoming" rather than throw. Verify with an empty deck before shipping.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const cardsDir = join(rootDir, 'cards');
const dataDir = join(cardsDir, 'data');
const artDir = join(cardsDir, 'art');
const arcDir = join(cardsDir, '_archive-placeholder');

const argv = process.argv.slice(2);
const has = f => argv.includes('--' + f);
const val = f => { const i = argv.indexOf('--' + f); return i >= 0 ? argv[i + 1] : null; };
const APPLY = has('apply'), RESTORE = has('restore');
const keep = new Set((val('keep') || '').split(',').map(s => s.trim()).filter(Boolean));

const move = (from, to) => { mkdirSync(dirname(to), { recursive: true }); renameSync(from, to); };

if (RESTORE) {
  if (!existsSync(arcDir)) { console.error('nothing archived at cards/_archive-placeholder/'); process.exit(1); }
  let n = 0;
  for (const [sub, dest] of [['data', dataDir], ['art', artDir], ['pages', cardsDir]]) {
    const d = join(arcDir, sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) { move(join(d, f), join(dest, f)); n++; }
  }
  rmSync(arcDir, { recursive: true, force: true });
  console.log(`✦ restored ${n} files — now run: node scripts/build-manifest.mjs`);
  process.exit(0);
}

// A placeholder is any card dossier that isn't a shared "_" data file and isn't explicitly kept.
const dossiers = readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
const doomed = dossiers.map(f => f.replace(/\.json$/, '')).filter(slug => !keep.has(slug));

console.log(`deck: ${dossiers.length} card dossiers · keeping ${keep.size} · archiving ${doomed.length}`);
if (!APPLY) {
  console.log('\nDRY RUN — nothing moved. Sample of what would go:');
  for (const slug of doomed.slice(0, 8)) {
    const d = JSON.parse(readFileSync(join(dataDir, slug + '.json'), 'utf8'));
    console.log(`  ${slug.padEnd(22)} "${d.title}"`);
  }
  if (doomed.length > 8) console.log(`  … and ${doomed.length - 8} more`);
  console.log('\nre-run with --apply to archive them.');
  process.exit(0);
}

let moved = 0;
for (const slug of doomed) {
  const dossier = join(dataDir, slug + '.json');
  if (existsSync(dossier)) { move(dossier, join(arcDir, 'data', slug + '.json')); moved++; }
  const page = join(cardsDir, slug + '.html');
  if (existsSync(page)) { move(page, join(arcDir, 'pages', slug + '.html')); moved++; }
  for (const ext of ['.webp', '.png', '.jpg', '.jpeg', '.gif']) {
    const art = join(artDir, slug + ext);
    if (existsSync(art)) { move(art, join(arcDir, 'art', slug + ext)); moved++; break; }
  }
}

// leave a well-formed EMPTY manifest rather than a stale one pointing at archived cards
writeFileSync(join(cardsDir, 'manifest.json'), JSON.stringify({ count: 0, cards: [] }, null, 0));

console.log(`✦ archived ${moved} files for ${doomed.length} cards → cards/_archive-placeholder/`);
console.log('✦ cards/manifest.json is now EMPTY (count: 0)');
console.log('\nnext: ingest the real deck, then  node scripts/build-manifest.mjs');
console.log('undo:  node scripts/clean-slate.mjs --restore');

#!/usr/bin/env node
/* Ingest the artist's handmade Season-I deck.
 *
 * The artist's files are named  "NN - TITLE.png"  — the number is the card's place in the
 * 100-card deck and the title is the card's real name. Both come from the artist and both
 * are authoritative here.
 *
 *   node scripts/ingest-deck.mjs                     # DRY RUN over the repo root
 *   node scripts/ingest-deck.mjs --dir art/inbox     # look somewhere else
 *   node scripts/ingest-deck.mjs --apply             # write dossiers + copy art
 *
 * ⚑ TITLES ARE COPIED VERBATIM. "FRENCH PRONCE DE BEL AIRE", "ASTRAL KAREOKE",
 *   "WAT HAPPEN TO JOE ROBERTS" — the spelling is the artist's voice, not a typo to
 *   correct. Nothing in this script "fixes" a title, and nothing downstream should either.
 *
 * What it deliberately does NOT do: invent lore, omens, rarity or stats. The placeholder
 * deck had those generated because there was no artist behind them. These cards carry
 * their own text and their own meaning, so the dossier is written with `needsRating: true`
 * and those fields left empty for a deliberate second pass.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data'), artDir = join(cardsDir, 'art');

const argv = process.argv.slice(2);
const has = f => argv.includes('--' + f);
const val = f => { const i = argv.indexOf('--' + f); return i >= 0 ? argv[i + 1] : null; };
const APPLY = has('apply');
const dir = join(rootDir, val('dir') || '.');

// "34 - NO TEST NOTICE.png", "39  - NELSON LOVE YOU.png", en/em dashes, any spacing
const FILE_RE = /^\s*(\d{1,3})\s*[-–—]\s*(.+?)\s*\.(png|jpe?g|webp|gif)$/i;

const slugify = t => t.toLowerCase()
  .replace(/['’]/g, '')            // Y'ALL -> yall
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60);

const files = readdirSync(dir).filter(f => FILE_RE.test(f));
const ignored = readdirSync(dir).filter(f => !FILE_RE.test(f) && /\.(png|jpe?g|webp|gif)$/i.test(f));

if (!files.length) {
  console.error(`no "NN - TITLE.ext" files in ${dir}`);
  if (ignored.length) console.error(`(${ignored.length} other images there were skipped)`);
  process.exit(1);
}

const seen = new Map(), rows = [];
let bytes = 0;
for (const f of files.sort()) {
  const m = f.match(FILE_RE);
  const number = +m[1], title = m[2].trim(), slug = slugify(title);
  const size = statSync(join(dir, f)).size; bytes += size;
  const clash = seen.get(slug);
  if (clash) rows.push({ f, number, title, slug, size, err: `slug collides with #${clash}` });
  else { seen.set(slug, number); rows.push({ f, number, title, slug, size }); }
}
rows.sort((a, b) => a.number - b.number);

const MB = b => (b / 1048576).toFixed(1) + ' MB';
console.log(`found ${rows.length} cards · ${MB(bytes)} total · avg ${MB(bytes / rows.length)}`);
if (ignored.length) console.log(`skipped ${ignored.length} non-card images (${ignored.slice(0, 3).join(', ')}${ignored.length > 3 ? ', …' : ''})`);
console.log('');
for (const r of rows) console.log(`  ${String(r.number).padStart(3)}  ${r.slug.padEnd(34)} "${r.title}"${r.err ? '  ⚠ ' + r.err : ''}`);

// numbering gaps, so a partial drop is obvious rather than silently incomplete
const nums = rows.map(r => r.number), lo = Math.min(...nums), hi = Math.max(...nums);
const missing = []; for (let i = lo; i <= hi; i++) if (!nums.includes(i)) missing.push(i);
console.log(`\nnumbers ${lo}–${hi}${missing.length ? ` · GAPS: ${missing.join(', ')}` : ' · contiguous'}`);
const outstanding = []; for (let i = 1; i <= 100; i++) if (!nums.includes(i)) outstanding.push(i);
console.log(`deck coverage: ${rows.length}/100 · still to come: ${outstanding.length}`);

const bad = rows.filter(r => r.err);
if (bad.length) { console.error(`\n${bad.length} name collision(s) — resolve before --apply.`); process.exit(1); }

if (bytes / rows.length > 1.5 * 1048576) {
  console.log(`\n⚠ avg ${MB(bytes / rows.length)} per card. At 100 cards that is ~${MB(bytes / rows.length * 100)} of art.`);
  console.log('  These need web-optimised derivatives before launch or the gallery is unusable on a phone.');
}

if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); process.exit(0); }

mkdirSync(dataDir, { recursive: true }); mkdirSync(artDir, { recursive: true });
let n = 0;
for (const r of rows) {
  const ext = extname(r.f).toLowerCase();
  copyFileSync(join(dir, r.f), join(artDir, r.slug + ext));
  const dossier = join(dataDir, r.slug + '.json');
  const prev = existsSync(dossier) ? JSON.parse(readFileSync(dossier, 'utf8')) : {};
  writeFileSync(dossier, JSON.stringify({
    ...prev,
    slug: r.slug,
    title: r.title,                 // verbatim, artist's spelling
    number: r.number,
    season: 1,
    handmade: true,
    sourceFile: r.f,
    art: `art/${r.slug}${ext}`,
    rarity: prev.rarity || '',
    atk: prev.atk ?? null, def: prev.def ?? null, trigger: prev.trigger || '',
    omen: prev.omen || '', lore: prev.lore || '',
    needsRating: !(prev.rarity && prev.atk != null),
  }, null, 1));
  n++;
}
console.log(`\n✦ ingested ${n} cards → cards/data/ + cards/art/`);
console.log('next: rate/stat them, then  node scripts/build-manifest.mjs');

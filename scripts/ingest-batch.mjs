#!/usr/bin/env node
// Bulk-ingest a directory of curated renders into live foil card pages, then
// rebuild the deck gallery (cards/index.html). Zero dependencies.
//
//   node scripts/ingest-batch.mjs --dir art/inbox
//   node scripts/ingest-batch.mjs --dir ../ripmaster-art-vault/season-01 --manifest ../ripmaster-art-vault/manifest.json
//   node scripts/ingest-batch.mjs --gallery-only
//
// Filenames must follow  s{season}-c{card}-{slug}[-v{take}].{png|jpg|jpeg|webp|gif}
// e.g. s01-c04-the-egg-v2.png. When several takes of the same card exist, the
// highest -v wins. A manifest.json can add per-card metadata, keyed by filename
// or by slug:
//   { "s01-c04-the-egg-v2.png": { "name": "The Egg", "flavor": "hatched from the
//     cosmic soup", "prompt": "...", "seed": "1234 / sref …", "of": 16 },
//     "the-vine": { "flavor": "..." } }

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { mintCard, rootDir, SEASON_TITLES } from './make-card.mjs';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const key = argv[i].slice(2);
    const val = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    args[key] = val;
  }
}

const cardsDir = join(rootDir, 'cards');
const FILE_RE = /^s(\d+)-c(\d+)-([a-z0-9-]+?)(?:-v(\d+))?\.(png|jpe?g|webp|gif)$/i;
const titleCase = slug => 'The ' + slug.replace(/^the-/, '').split('-')
  .map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

function ingest(dir, manifestPath) {
  const manifest = manifestPath ? JSON.parse(readFileSync(resolve(manifestPath), 'utf8')) : {};
  const files = readdirSync(resolve(dir)).filter(f => FILE_RE.test(f));
  const skipped = readdirSync(resolve(dir)).filter(f => !FILE_RE.test(f) && /\.(png|jpe?g|webp|gif)$/i.test(f));

  // group by season+card, keep the highest -v take
  const best = new Map();
  for (const f of files) {
    const [, season, number, slug, v] = f.match(FILE_RE);
    const key = `s${season}-c${number}-${slug}`;
    const take = +(v || 1);
    if (!best.has(key) || best.get(key).take < take)
      best.set(key, { file: f, season: +season, number: +number, slug, take });
  }

  let minted = 0;
  for (const { file, season, number, slug } of [...best.values()].sort((a, b) => a.season - b.season || a.number - b.number)) {
    const meta = manifest[file] || manifest[slug] || {};
    const out = mintCard({
      name: meta.name || titleCase(slug),
      season, number,
      of: meta.of, flavor: meta.flavor, seasonTitle: meta.seasonTitle,
      prompt: meta.prompt, seed: meta.seed,
      img: join(resolve(dir), file),
    });
    minted++;
    console.log(`✦ ${basename(out)}  ←  ${file}`);
  }
  if (skipped.length) {
    console.log(`\n⚠ ${skipped.length} image(s) skipped (name doesn't match s{S}-c{N}-{slug}[-vN].ext):`);
    for (const f of skipped.slice(0, 20)) console.log('  ', f);
    if (skipped.length > 20) console.log(`   … and ${skipped.length - 20} more`);
  }
  return minted;
}

function buildGallery() {
  const pages = readdirSync(cardsDir)
    .filter(f => f.endsWith('.html') && f !== '_template.html' && f !== 'index.html');
  const entries = [];
  for (const f of pages) {
    const html = readFileSync(join(cardsDir, f), 'utf8');
    const t = html.match(/<title>(.+?) · S(\d+) №(\d+)<\/title>/);
    if (!t) continue;
    const img = html.match(/<img src="(art\/[^"]+)"/);
    entries.push({ file: f, name: t[1], season: +t[2], number: +t[3], thumb: img ? img[1] : null });
  }
  entries.sort((a, b) => a.season - b.season || a.number - b.number);

  const seasons = [...new Set(entries.map(e => e.season))];
  const sections = seasons.map(s => {
    const tiles = entries.filter(e => e.season === s).map(e => `
      <a class="tile" href="${e.file}">
        ${e.thumb
          ? `<img src="${e.thumb}" alt="${e.name}" loading="lazy">`
          : '<div class="tile-blank">✦</div>'}
        <span class="tile-name">${e.name}</span>
        <span class="tile-num">№${String(e.number).padStart(2, '0')}</span>
      </a>`).join('');
    return `
    <h2><span>Season ${s} · ${SEASON_TITLES[s] || ''}</span></h2>
    <div class="grid">${tiles}</div>`;
  }).join('');

  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>The Deck · Upperdeck Ripmaster 3030</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0b0710;color:#e9ddff;font-family:Georgia,'Times New Roman',serif;
    background-image:radial-gradient(80% 50% at 50% -10%,#2a1450 0%,transparent 60%)}
  header{text-align:center;padding:40px 16px 10px}
  h1{font-variant:small-caps;letter-spacing:.2em;text-indent:.2em;font-size:clamp(24px,6vw,40px);
    color:transparent;background:linear-gradient(100deg,#ff5fd0,#f6e27a,#a6ff4d,#5fd0ff,#ff5fd0);
    background-size:300% 100%;-webkit-background-clip:text;background-clip:text;
    animation:hue 9s linear infinite}
  @keyframes hue{to{background-position:300% 0}}
  .back{display:block;text-align:center;margin:8px 0 0;font-size:11px;letter-spacing:.35em;
    text-indent:.35em;text-transform:uppercase;color:#a6ff4d;text-decoration:none}
  main{max-width:1100px;margin:0 auto;padding:10px 16px 60px}
  h2{margin:34px 0 14px;text-align:center;font-size:12px;letter-spacing:.5em;text-indent:.5em;
    text-transform:uppercase;color:#f6e27a}
  .grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
  .tile{position:relative;display:block;aspect-ratio:5/7;border-radius:10px;overflow:hidden;
    border:1px solid rgba(246,226,122,.35);text-decoration:none;color:#e9ddff;
    background:linear-gradient(160deg,#1c0f33,#35176b);transition:transform .18s}
  .tile:hover{transform:translateY(-4px) rotate(-1deg)}
  .tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .tile-blank{position:absolute;inset:0;display:grid;place-items:center;font-size:34px;color:#f6e27a}
  .tile-name,.tile-num{position:absolute;left:0;right:0;text-align:center;font-size:10px;
    letter-spacing:.22em;text-indent:.22em;text-transform:uppercase;
    text-shadow:0 1px 4px #000, 0 0 10px #000}
  .tile-name{bottom:16px}
  .tile-num{bottom:4px;opacity:.6;font-size:8px}
  @media(prefers-reduced-motion:reduce){h1{animation:none}}
</style>
</head>
<body>
  <header>
    <h1>The Deck</h1>
    <a class="back" href="../">← back to the shrine</a>
  </header>
  <main>${sections}
  </main>
</body>
</html>
`;
  writeFileSync(join(cardsDir, 'index.html'), page);
  console.log(`✦ gallery rebuilt with ${entries.length} card(s) → cards/index.html`);
}

if (!args['gallery-only']) {
  if (!args.dir) { console.error('usage: ingest-batch.mjs --dir <folder> [--manifest m.json] | --gallery-only'); process.exit(1); }
  if (args.manifest && !existsSync(resolve(args.manifest))) { console.error(`manifest not found: ${args.manifest}`); process.exit(1); }
  const n = ingest(args.dir, args.manifest);
  console.log(`\n✦ minted/updated ${n} card page(s)`);
}
buildGallery();

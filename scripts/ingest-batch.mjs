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
import { mintCard, rootDir, SEASON_TITLES, frameFor } from './make-card.mjs';

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
      frame: meta.frame, atk: meta.atk, def: meta.def, trigger: meta.trigger,
      fullArt: args['full-art'] || meta.fullArt,
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
      <a class="tile" href="${e.file}" style="--f:${frameFor(e.file.replace(/\.html$/, ''))}">
        <span class="tile-art">${e.thumb
          ? `<img src="${e.thumb}" alt="${e.name}" loading="lazy">`
          : '<i>✦</i>'}</span>
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
  body{font-family:Georgia,'Times New Roman',serif;padding:18px 10px 40px;
    background:#7b2ff7 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='1350'%3E%3Cfilter id='t'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.007 0.01' numOctaves='3' seed='7'/%3E%3CfeDisplacementMap in='SourceGraphic' scale='170'/%3E%3C/filter%3E%3Cg filter='url(%23t)'%3E%3Crect width='900' height='1350' fill='%237b2ff7'/%3E%3Ccircle cx='450' cy='675' r='640' fill='%232a6cff'/%3E%3Ccircle cx='450' cy='675' r='540' fill='%2337d34a'/%3E%3Ccircle cx='450' cy='675' r='440' fill='%23ffe93b'/%3E%3Ccircle cx='450' cy='675' r='340' fill='%23ff9a3b'/%3E%3Ccircle cx='450' cy='675' r='250' fill='%23ff4b4b'/%3E%3Ccircle cx='450' cy='675' r='165' fill='%23ff5fd0'/%3E%3Ccircle cx='450' cy='675' r='85' fill='%23ffe93b'/%3E%3C/g%3E%3C/svg%3E") center/cover no-repeat fixed}
  .board{max-width:1100px;margin:0 auto;background:#ffd93b;border:3px solid #000;border-radius:16px;
    box-shadow:0 0 0 10px #ff6b57,0 0 0 13px #000,0 24px 50px rgba(0,0,0,.5);
    padding:clamp(12px,3vw,26px)}
  header{text-align:center}
  .plate{display:block;background:#f6ecc9;border:3px solid #000;border-radius:10px;
    box-shadow:inset 0 0 0 2px rgba(255,255,255,.6);padding:10px 14px}
  h1{font-family:'Arial Black',Arial,sans-serif;font-size:clamp(20px,5.5vw,34px);
    letter-spacing:.03em;color:#111;text-transform:uppercase}
  .back{display:inline-block;margin:12px auto 4px;background:#63b3ff;border:3px solid #000;
    border-radius:999px;padding:8px 18px;font-family:'Arial Black',Arial,sans-serif;
    font-size:10px;letter-spacing:.22em;text-indent:.22em;text-transform:uppercase;
    color:#111;text-decoration:none}
  h2{margin:26px 0 12px;text-align:center}
  h2 span{display:inline-block;background:#ff6b57;border:3px solid #000;border-radius:999px;
    padding:6px 18px;font-family:'Arial Black',Arial,sans-serif;font-size:11px;
    letter-spacing:.24em;text-indent:.24em;text-transform:uppercase;color:#111}
  .grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
  .tile{display:flex;flex-direction:column;aspect-ratio:5/7;border-radius:10px;overflow:hidden;
    background:var(--f);border:3px solid #000;text-decoration:none;color:#111;
    padding:5%;transition:transform .18s;box-shadow:inset 0 0 0 2px rgba(255,255,255,.5)}
  .tile:hover{transform:translateY(-4px) rotate(-1.5deg)}
  .tile-art{position:relative;flex:1;border:2px solid #000;border-radius:5px;overflow:hidden;
    background:#160d22;display:grid;place-items:center}
  .tile-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .tile-art i{font-style:normal;font-size:30px;color:#ffe93b}
  .tile-name{margin-top:5%;background:#f6ecc9;border:2px solid #000;border-radius:5px;
    text-align:center;padding:3px 4px;font-family:'Arial Black',Arial,sans-serif;
    font-size:9px;letter-spacing:.06em;text-transform:uppercase;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tile-num{margin-top:3%;text-align:center;font-family:'Arial Black',Arial,sans-serif;
    font-size:8px;letter-spacing:.24em;text-indent:.24em;color:rgba(0,0,0,.55)}
</style>
</head>
<body>
  <div class="board">
    <header>
      <span class="plate"><h1>✦ The Deck ✦</h1></span>
      <a class="back" href="../">← back to the pack</a>
    </header>
    <main>${sections}
    </main>
  </div>
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

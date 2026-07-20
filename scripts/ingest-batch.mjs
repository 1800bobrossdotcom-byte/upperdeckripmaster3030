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
  const dataDir = join(cardsDir, 'data');
  const pages = readdirSync(cardsDir)
    .filter(f => f.endsWith('.html') && !f.startsWith('_') && f !== 'index.html' && f !== 'battle.html');
  const RANK = { marquee: -1, prizm: 0, mythic: 1, rare: 2, uncommon: 3, common: 4 };
  const LABEL = { marquee: 'Marquee · 1 of 1', prizm: 'Prizm', mythic: 'Mythic', rare: 'Rare', uncommon: 'Uncommon', common: 'Common' };
  const entries = [];
  for (const f of pages) {
    const html = readFileSync(join(cardsDir, f), 'utf8');
    const slug = f.replace(/\.html$/, '');
    let data = {};
    const dj = join(dataDir, `${slug}.json`);
    if (existsSync(dj)) { try { data = JSON.parse(readFileSync(dj, 'utf8')); } catch {} }
    const rarity = data.rarity || 'common';
    const t = html.match(/<title>(.+?) · S(\d+) №(\d+)<\/title>/);
    const img = html.match(/<img src="(art\/[^"]+)"/);
    let name, season, number;
    if (t) { name = t[1]; season = +t[2]; number = +t[3]; }
    else if (rarity === 'marquee') { name = data.title || slug; season = 99; number = 1; }
    else continue;
    entries.push({ file: f, slug, name, season, number, thumb: img ? img[1] : null, rarity, marquee: rarity === 'marquee' });
  }

  // sort by rarity (rarest → most common), then by season/number within a tier
  const tiers = Object.keys(RANK).filter(r => entries.some(e => e.rarity === r));
  const sections = tiers.map(r => {
    const list = entries.filter(e => e.rarity === r).sort((a, b) => a.season - b.season || a.number - b.number);
    const tiles = list.map(e => `
      <div class="tile r-${e.rarity}${e.marquee ? ' marquee' : ''}" data-href="${e.file}" tabindex="0" role="link" aria-label="${e.name}" style="--f:${frameFor(e.slug)}">
        <span class="tile-art">${e.thumb
          ? `<img src="${e.thumb}" alt="${e.name}" loading="lazy">`
          : '<i>✦</i>'}<span class="sheen"></span><span class="rr">${e.marquee ? '1/1' : e.rarity}</span>${e.marquee ? '<span class="locktag">🔒 later</span>' : ''}</span>
        <span class="tile-name">${e.name}</span>
        <span class="tile-num">${e.marquee ? '1 of 1 · marquee' : 'S' + e.season + ' · №' + String(e.number).padStart(2, '0')}</span>
        ${e.marquee ? '<span class="vote exempt">the court has no jurisdiction</span>' : `
        <span class="vote">
          ${e.rarity === 'prizm' ? '' : `<button type="button" class="vbtn vup" data-slug="${e.slug}" aria-label="burn to promote ${e.name}">▲</button>`}
          <b class="vnet" data-net="${e.slug}">0</b>
          <button type="button" class="vbtn vhodl" data-slug="${e.slug}" aria-label="burn to HODL ${e.name} — buffers downvotes" title="HODL: buffers downvotes">⛨</button>
          <button type="button" class="vbtn vdn" data-slug="${e.slug}" aria-label="burn to demote ${e.name}">▼</button>
        </span>`}
      </div>`).join('');
    return `
    <h2 class="tier t-${r}"><span>${LABEL[r]} · ${list.length}</span></h2>
    <div class="grid">${tiles}</div>`;
  }).join('');

  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>The Deck · upperdeckripmaster3030</title>
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
  h2.tier{margin:30px 0 12px;text-align:center}
  h2.tier span{display:inline-block;border:3px solid #000;border-radius:999px;
    padding:6px 20px;font-family:'Arial Black',Arial,sans-serif;font-size:11px;
    letter-spacing:.24em;text-indent:.24em;text-transform:uppercase;color:#111}
  .t-common span{background:#cbd5c0} .t-uncommon span{background:#9be34f}
  .t-rare span{background:#63b3ff} .t-mythic span{background:#ff5fd0;color:#fff}
  .t-prizm span{background:linear-gradient(90deg,#ff5fd0,#ffe93b,#63b3ff,#9be34f);color:#111}
  .t-marquee span{background:linear-gradient(90deg,#fff,#c7d0ff,#8aa0ff);color:#1a0636;box-shadow:0 0 18px rgba(199,208,255,.7)}
  .grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));perspective:900px}
  .tile{position:relative;display:flex;flex-direction:column;aspect-ratio:5/7;border-radius:10px;overflow:hidden;
    background:var(--f);border:3px solid #000;text-decoration:none;color:#111;
    padding:5%;box-shadow:inset 0 0 0 2px rgba(255,255,255,.5);
    transform-style:preserve-3d;transition:transform .12s ease,box-shadow .12s ease;will-change:transform}
  .tile.lit{transform:rotateX(var(--ry,0deg)) rotateY(var(--rx,0deg)) scale(1.05);
    box-shadow:0 16px 34px rgba(0,0,0,.55);z-index:3}
  .tile-art{position:relative;flex:1;border:2px solid #000;border-radius:5px;overflow:hidden;
    background:#160d22;display:grid;place-items:center}
  .tile-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .tile-art i{font-style:normal;font-size:30px;color:#ffe93b}
  /* cursor-follow holographic sheen (intensity scales with rarity) */
  .sheen{position:absolute;inset:0;pointer-events:none;opacity:0;mix-blend-mode:color-dodge;
    transition:opacity .16s;z-index:2;
    background:
      radial-gradient(circle at var(--mx,50%) var(--my,50%), rgba(255,255,255,.6), transparent 42%),
      repeating-linear-gradient(115deg, hsl(283 80% 60%) 0%, hsl(2 80% 60%) 12%, hsl(53 95% 60%) 24%,
        hsl(120 75% 55%) 36%, hsl(200 80% 60%) 48%, hsl(283 80% 60%) 60%);
    background-size:auto,300% 300%;background-position:0 0,var(--fx,50%) var(--fy,50%)}
  .tile.lit .sheen{opacity:var(--so,.3)}
  .r-common{--so:.12} .r-uncommon{--so:.24} .r-rare{--so:.4} .r-mythic{--so:.58} .r-prizm{--so:.8} .r-marquee{--so:.9}
  .tile.marquee{border-color:#c7d0ff;box-shadow:0 0 0 2px #c7d0ff,0 0 26px rgba(199,208,255,.6)}
  .rr{position:absolute;top:4px;right:4px;z-index:4;font-family:'Arial Black',Arial,sans-serif;
    font-size:7px;text-transform:uppercase;letter-spacing:.05em;padding:1px 5px;border-radius:99px;
    background:rgba(0,0,0,.62);color:#fff}
  .r-prizm .rr{background:linear-gradient(90deg,#ff5fd0,#63b3ff);color:#fff}
  .marquee .rr{background:linear-gradient(90deg,#fff,#c7d0ff);color:#1a0636}
  .locktag{position:absolute;bottom:4px;left:4px;z-index:4;font-family:'Arial Black',Arial,sans-serif;
    font-size:7px;text-transform:uppercase;letter-spacing:.05em;padding:1px 5px;border-radius:99px;
    background:rgba(6,2,20,.72);color:#9be34f}
  .tile-name{position:relative;z-index:3;margin-top:5%;background:#f6ecc9;border:2px solid #000;border-radius:5px;
    text-align:center;padding:3px 4px;font-family:'Arial Black',Arial,sans-serif;
    font-size:9px;letter-spacing:.06em;text-transform:uppercase;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tile-num{position:relative;z-index:3;margin-top:3%;text-align:center;font-family:'Arial Black',Arial,sans-serif;
    font-size:8px;letter-spacing:.2em;text-indent:.2em;color:rgba(0,0,0,.55)}
  @media (prefers-reduced-motion:reduce){ .tile.lit{transform:scale(1.03)} }
  /* ── the rarity court: burn-to-vote on every tile ── */
  .tile{cursor:pointer}
  .court-note{margin:14px auto 0;max-width:640px;text-align:center;background:#f6ecc9;
    border:3px solid #000;border-radius:10px;padding:10px 14px;font-size:12px;line-height:1.55;
    font-style:italic}
  .court-note b{font-style:normal;font-family:'Arial Black',Arial,sans-serif;font-size:11px}
  .vote{position:relative;z-index:3;display:flex;align-items:center;justify-content:center;gap:8px;
    margin-top:4%;}
  .vbtn{width:30px;height:24px;border-radius:6px;border:2px solid #000;cursor:pointer;
    font-size:11px;line-height:1;font-family:'Arial Black',Arial,sans-serif;
    box-shadow:0 2px 0 #000;transition:transform .06s}
  .vbtn:active{transform:translateY(2px);box-shadow:none}
  .vup{background:#9be34f}.vdn{background:#ff6b57}.vhodl{background:#63b3ff}
  .vnet{min-width:34px;text-align:center;font-family:'Arial Black',Arial,sans-serif;font-size:11px;
    background:#f6ecc9;border:2px solid #000;border-radius:6px;padding:2px 6px}
  .vnet.pos{background:#c9f3a1}.vnet.neg{background:#ffc2b5}
  .vote.exempt{font-size:8px;font-style:italic;color:rgba(0,0,0,.55);border:0;justify-content:center}
  .toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;
    background:#111;color:#ffe93b;border:3px solid #000;border-radius:999px;padding:10px 18px;
    font-family:'Arial Black',Arial,sans-serif;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
    opacity:0;pointer-events:none;transition:opacity .25s}
  .toast.show{opacity:1}
  /* laughing-man tiled watermark over the backdrop */
  .lm{position:fixed;inset:0;z-index:0;pointer-events:none;
    background:url("../Laughing_man.svg") repeat;background-size:min(46vw,340px);
    filter:grayscale(1) brightness(2.8);opacity:.12}
  .board{position:relative;z-index:1}
</style>
</head>
<body>
  <div class="lm" aria-hidden="true"></div>
  <div class="board">
    <header>
      <span class="plate"><h1>✦ The Deck ✦</h1></span>
      <a class="back" href="../">← back to the pack</a>
      <div class="court-note"><b>▲⛨▼ THE RARITY COURT</b> — burn $UR3030 to vote any card up or
      down the ladder. Enough conviction moves its rarity; enough scorn votes it off the
      island. <b>⛨ HODL votes</b> anchor a card where it is — downvotes must burn through
      the HODL buffer first. At prizm there's nowhere left to climb, so ▲ becomes ⛨.
      No cards needed to vote — only tokens to burn.
      <b>(preview — burns go on-chain with the vault)</b></div>
    </header>
    <main>${sections}
    </main>
  </div>
<script>
(function(){
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // navigate on tile click/Enter (vote buttons excluded)
  document.querySelectorAll('.tile[data-href]').forEach(function(t){
    t.addEventListener('click', function(ev){
      if (ev.target.closest('.vote')) return;
      location.href = t.dataset.href;
    });
    t.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter' && !ev.target.closest('.vote')) location.href = t.dataset.href;
    });
  });
  // the rarity court (preview): each ▲/▼ simulates a 1 $UR3030 burn, kept on this
  // device until the vault contract goes live and votes become real burns.
  var toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast);
  var toastTimer;
  function say(msg){ toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){ toast.classList.remove('show'); }, 2200); }
  function votes(){
    var raw; try { raw = JSON.parse(localStorage.getItem('urm_court')||'{}'); } catch { raw = {}; }
    Object.keys(raw).forEach(function(k){ if (typeof raw[k] === 'number') raw[k] = { net: raw[k], hodl: 0 }; });
    return raw;
  }
  function renderNet(slug){
    var e = votes()[slug] || { net:0, hodl:0 };
    document.querySelectorAll('[data-net="'+slug+'"]').forEach(function(el){
      el.textContent = (e.net>0?'+':'')+e.net + (e.hodl>0 ? ' ⛨'+e.hodl : '');
      el.classList.toggle('pos', e.net>0); el.classList.toggle('neg', e.net<0);
    });
  }
  Object.keys(votes()).forEach(renderNet);
  document.querySelectorAll('.vbtn').forEach(function(b){
    b.addEventListener('click', function(){
      var slug = b.dataset.slug;
      var v = votes(); var e = v[slug] || { net:0, hodl:0 };
      if (b.classList.contains('vup')) {
        e.net += 1; say('▲ 1 $UR3030 burned to promote — on-chain at vault launch');
      } else if (b.classList.contains('vhodl')) {
        e.hodl += 1; say('⛨ 1 $UR3030 burned to HODL — buffers downvotes');
      } else {
        if (e.hodl > 0) { e.hodl -= 1; say('▼ demote absorbed by the HODL buffer — burn still counts'); }
        else { e.net -= 1; say('▼ 1 $UR3030 burned to demote — on-chain at vault launch'); }
      }
      v[slug] = e;
      try { localStorage.setItem('urm_court', JSON.stringify(v)); } catch {}
      renderNet(slug);
    });
  });
  document.querySelectorAll('.tile').forEach(function(t){
    t.addEventListener('pointermove', function(e){
      var r = t.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      // cursor tilt is a direct response to the mouse — always on
      t.style.setProperty('--rx', ((px - 0.5) * 16).toFixed(2) + 'deg');
      t.style.setProperty('--ry', ((0.5 - py) * 16).toFixed(2) + 'deg');
      t.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      t.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      t.style.setProperty('--fx', (px * 100).toFixed(1) + '%');
      t.style.setProperty('--fy', (py * 100).toFixed(1) + '%');
      t.classList.add('lit');
    });
    t.addEventListener('pointerleave', function(){
      t.classList.remove('lit');
      t.style.removeProperty('--rx'); t.style.removeProperty('--ry');
    });
  });
})();
</script>
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

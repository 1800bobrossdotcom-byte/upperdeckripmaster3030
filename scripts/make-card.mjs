#!/usr/bin/env node
// Wrap a curated Midjourney render into a live foil card page. Zero dependencies.
//
//   node scripts/make-card.mjs --img art/inbox/s01-c01-the-vine.png \
//     --name "The Vine" --season 1 --number 1 --of 16 \
//     --flavor "hatched from the cosmic soup" --season-title "Bloom" \
//     --prompt "the exact Midjourney prompt" --seed "1234 / sref v1"
//
//   node scripts/make-card.mjs --placeholder --name "The Egg" ...   (procedural art, no image)
//
// For bulk ingestion of a whole drop, use scripts/ingest-batch.mjs instead.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const rootDir = resolve(here, '..');
const cardsDir = join(rootDir, 'cards');

export const SEASON_TITLES = { 1: 'Bloom', 2: 'Melt', 3: 'Fractal', 4: 'Void' };
// flat frame colors sampled from the reference cards
export const PALETTE = ['#ff6b57', '#ffd93b', '#63b3ff', '#ff5fd0', '#2ad4c8', '#9b5cff', '#ff9a3b', '#9be34f'];
export const frameFor = slug =>
  PALETTE[[...slug].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
// battle triggers: powers that read the same live chain state the renderers read
export const TRIGGERS = ['GAS STORM', 'STILL AIR', 'BURN WAVE', 'MOON CANDLE',
  'RUG WIND', 'DEEP WATER', 'BLOCK OMEN', 'WHALE SONG'];
export const statsFor = slug => {
  const h = [...slug].reduce((a, c) => a + c.charCodeAt(0), 0);
  return { atk: 1 + (h * 7) % 9, def: 1 + (h * 13) % 9, trigger: TRIGGERS[(h * 31) % TRIGGERS.length] };
};
export const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const roman = n => ['0','I','II','III','IV','V','VI','VII','VIII','IX','X'][+n] || n;


// procedural placeholder: sunburst + cosmic egg, until real art lands in the slot
function placeholderArt() {
  let rays = '';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const x = 250 + Math.cos(a) * 620, y = 360 + Math.sin(a) * 620;
    rays += `<path d="M250 360 L${x.toFixed(0)} ${y.toFixed(0)}" stroke="${i % 2 ? '#ff5fd0' : '#7b2ff7'}" stroke-width="26" stroke-linecap="round" opacity=".55"/>`;
  }
  let stars = '';
  const pts = [[80,110],[420,90],[60,540],[440,500],[130,640],[380,660],[250,60]];
  for (const [x, y] of pts)
    stars += `<path d="M${x} ${y - 14} L${x + 4} ${y - 4} L${x + 14} ${y} L${x + 4} ${y + 4} L${x} ${y + 14} L${x - 4} ${y + 4} L${x - 14} ${y} L${x - 4} ${y - 4} Z" fill="#ffe95f" stroke="#120a1e" stroke-width="3"/>`;
  return `<svg viewBox="0 0 500 700" preserveAspectRatio="xMidYMid slice" aria-label="placeholder art">
  <rect width="500" height="700" fill="#1c0f33"/>
  <g>${rays}</g>
  <circle cx="250" cy="360" r="185" fill="#35176b" opacity=".85"/>
  <ellipse cx="250" cy="380" rx="128" ry="165" fill="#fdf4d9" stroke="#120a1e" stroke-width="9"/>
  <path d="M155 340 l38 26 30-34 34 38 30-30 34 30 26-24" fill="none" stroke="#120a1e" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <ellipse cx="250" cy="430" rx="34" ry="44" fill="#120a1e"/>
  <ellipse cx="262" cy="416" rx="11" ry="15" fill="#fdf4d9"/>
  <ellipse cx="250" cy="185" rx="95" ry="24" fill="none" stroke="#ffe95f" stroke-width="8"/>
  ${stars}
</svg>`;
}

// Wrap one card. opts: { name, season, number, of, flavor, seasonTitle, prompt, seed,
//   frame (css color, default from PALETTE by slug), atk/def (1-9), trigger (name),
//   img (path) | placeholder (true) }. Stats default deterministically from the slug —
// the onchain version derives them from the mint block hash instead (docs/BATTLE.md).
// Returns the written page path.
export function mintCard(opts) {
  const { name } = opts;
  const season = String(opts.season);
  const number = String(opts.number).padStart(2, '0');
  const slug = slugify(name);

  let art;
  if (opts.placeholder) {
    art = placeholderArt();
  } else {
    const src = resolve(opts.img);
    mkdirSync(join(cardsDir, 'art'), { recursive: true });
    const dest = `art/${slug}${extname(src) || '.png'}`;
    copyFileSync(src, join(cardsDir, dest));
    art = `<img src="${dest}" alt="${name}">`;
  }

  // full-art mode: the image already carries its own printed frame, so use the
  // frameless flip template (front art + foil, back living dossier).
  const template = opts.fullArt ? '_full.html' : '_template.html';
  const html = readFileSync(join(cardsDir, template), 'utf8')
    .replaceAll('{{SLUG}}', slug)
    .replaceAll('{{NAME}}', name)
    .replaceAll('{{SEASON}}', roman(season))
    .replaceAll('{{SEASON_NUM}}', season)
    .replaceAll('{{SEASON_TITLE}}', opts.seasonTitle || SEASON_TITLES[+opts.season] || 'Bloom')
    .replaceAll('{{NUMBER}}', number)
    .replaceAll('{{OF}}', String(opts.of || 16))
    .replaceAll('{{FLAVOR}}', opts.flavor || '')
    .replaceAll('{{PROMPT}}', opts.prompt || '(unrecorded)')
    .replaceAll('{{SEED}}', opts.seed || '(unrecorded)')
    .replaceAll('{{FRAME}}', opts.frame || frameFor(slug))
    .replaceAll('{{STARS}}', '<b>✦</b>'.repeat(Math.max(1, Math.min(8, +season || 1))))
    .replaceAll('{{ATK}}', String(opts.atk ?? statsFor(slug).atk))
    .replaceAll('{{DEF}}', String(opts.def ?? statsFor(slug).def))
    .replaceAll('{{TRIGGER}}', opts.trigger || statsFor(slug).trigger)
    .replaceAll('{{TOTAL}}', String((+(opts.atk ?? statsFor(slug).atk)) + (+(opts.def ?? statsFor(slug).def))))
    .replaceAll('{{TREATMENT}}', opts.treatment || `t-${(opts.rarity || 'rare')}`)
    .replaceAll('{{ART}}', art);

  const out = join(cardsDir, `${slug}.html`);
  writeFileSync(out, html);
  return out;
}

// ─── CLI ───
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      args[key] = val;
    }
  }
  const need = k => { if (!args[k]) { console.error(`missing --${k}`); process.exit(1); } return args[k]; };
  const name = need('name');
  need('season'); need('number');
  if (!args.img && !args.placeholder) { console.error('need --img <png> or --placeholder'); process.exit(1); }
  const out = mintCard({
    name, season: args.season, number: args.number, of: args.of,
    flavor: args.flavor, seasonTitle: args['season-title'], frame: args.frame,
    atk: args.atk, def: args.def, trigger: args.trigger, fullArt: !!args['full-art'],
    prompt: args.prompt, seed: args.seed,
    img: args.img, placeholder: !!args.placeholder,
  });
  console.log(`✦ minted ${out.replace(rootDir + '/', '')}`);
}

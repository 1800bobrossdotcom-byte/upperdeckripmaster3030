#!/usr/bin/env node
// Wrap a curated Midjourney render into a live foil card page. Zero dependencies.
//
//   node scripts/make-card.mjs --img art/inbox/s01-c01-the-serpent.png \
//     --name "The Serpent" --season 1 --number 1 --of 16 \
//     --scripture "Genesis 3" --season-title "Origins" \
//     --prompt "proto-Betty Boop as the serpent..." --seed "1234 / sref v1"
//
//   node scripts/make-card.mjs --placeholder --name "The Egg" ...   (procedural art, no image)

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '..');
const cardsDir = join(rootDir, 'cards');

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
const season = String(need('season'));
const number = String(need('number')).padStart(2, '0');
if (!args.img && !args.placeholder) { console.error('need --img <png> or --placeholder'); process.exit(1); }

const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const roman = n => ['0','I','II','III','IV','V','VI','VII','VIII','IX','X'][+n] || n;

const CORNER_SVG = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
  <path d="M6 94 C6 46 46 6 94 6"/>
  <path d="M6 70 C6 34 34 6 70 6"/>
  <path d="M14 50 C20 28 28 20 50 14"/>
  <path d="M50 14 c8 -2 12 4 8 9 c-3 4 -9 2 -8 -3"/>
  <path d="M14 50 c-2 8 4 12 9 8 c4 -3 2 -9 -3 -8"/>
  <circle cx="11" cy="11" r="3.5" fill="currentColor" stroke="none"/>
</svg>`;

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

let art;
if (args.placeholder) {
  art = placeholderArt();
} else {
  const src = resolve(args.img);
  const artDir = join(cardsDir, 'art');
  mkdirSync(artDir, { recursive: true });
  const dest = `art/${slug}${extname(src) || '.png'}`;
  copyFileSync(src, join(cardsDir, dest));
  art = `<img src="${dest}" alt="${name}">`;
}

const html = readFileSync(join(cardsDir, '_template.html'), 'utf8')
  .replaceAll('{{NAME}}', name)
  .replaceAll('{{SEASON}}', roman(season))
  .replaceAll('{{SEASON_NUM}}', season)
  .replaceAll('{{SEASON_TITLE}}', args['season-title'] || 'Origins')
  .replaceAll('{{NUMBER}}', number)
  .replaceAll('{{OF}}', String(args.of || 16))
  .replaceAll('{{SCRIPTURE}}', args.scripture || '')
  .replaceAll('{{PROMPT}}', args.prompt || '(unrecorded)')
  .replaceAll('{{SEED}}', args.seed || '(unrecorded)')
  .replaceAll('{{CORNER_SVG}}', CORNER_SVG)
  .replaceAll('{{ART}}', art);

const out = join(cardsDir, `${slug}.html`);
writeFileSync(out, html);
console.log(`✦ minted ${out.replace(rootDir + '/', '')}`);

#!/usr/bin/env node
// Vision/OCR naming pass: every card gets a creative 1-2 word name read from what
// its art actually depicts, in the deck's psychedelic vein (generic/original names,
// never the trademarked characters shown). Re-mints off the fixed _full.html
// template (keeps per-rarity foil treatments), moves art, rewrites the dossier,
// removes old files. Keyed by the current slug.
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mintCard, rootDir, slugify, statsFor } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data'), artDir = join(cardsDir, 'art');

const RENAME = {
  'oscar-acosta':'Blue Boar', 'doctor-gonzo':'Cosmic Yawn', 'dennis-mckenna':'Red Rustler',
  'sonny-barger':'Pick Boss', 'kat-harrison':'Ghost Chef', 'walter-sisulu':'Beast Hug',
  'bill-cardoso':'Meltdown', 'maharaji':'Bone Pop', 'oliver-tambo':'Bone Bard', 'lao-tzu':'Mad Grin',
  'chief-luthuli':'Caped Hound', 'vanessa':'Sly Chef', 'paul-kemp':'Big Grin', 'govan-mbeki':'Chef Fang',
  'scottie-pippen':'Blade Prince', 'steve-kerr':'Streetwise', 'marshall-mcluhan':'Drip Dog',
  'chuang-tzu':'Neon Sage', 'bhagavan-das':'Fond Beast', 'alfred-whitehead':'Rainbow Maw',
  'neem-karoli':'Gold Sage', 'krishna-das':'Cracked Heart', 'ralph-steadman':'Solar Jester',
  'bodhidharma':'Shadow Pair', 'teilhard-chardin':'Blue Bones', 'robert-sobukwe':'Red Wraith',
  'ahmed-kathrada':'Twin Hounds', 'ev':'Alley Trio', 'frank-mankiewicz':'Fuzz Trio', 'chris-hani':'Fuzz Totem',
  'dennis-rodman':'Blue Beak', 'nagarjuna':'Feather Mage', 'phil-jackson':'Blue Phoenix',
  'd-t-suzuki':'Joy Blast', 'rinzai':'Pajama Bear', 'richard-nixon':'Moon Rat', 'muhammad-ali':'Noodle Arms',
  'george-mcgovern':'Guffaw', 'joshu':'Blue Gulp', 'yeamon':'Masked Hare', 'toni-kukoc':'Red Hound',
  'steve-biko':'Barn Rooster', 'isiah-thomas':'Sly Imp', 'chief-jongintaba':'Ink Cat',
  'horace-grant':'Neon Court', 'bram-fischer':'Count Fuzz', 'clyde-drexler':'Moon Cat',
  'chenault':'Purple Fang', 'moburg':'Three Minds', 'denis-goldberg':'Drool Ghost', 'confucius':'Coin Baron',
  'ma-tsu':'Blaze Grin', 'sala':'Smoke Imp', 'krishnamurti':'Spun Grin', 'han-shan':'Green Drifter',
  'lono':'Eruption', 'lama-govinda':'Mirror Twins', 'magic-johnson':'Neon Crown', 'hari-dass':'Glow Pair',
  'gautama':'Last Light', 'yun-men':'Melt Waltz', 'seng-tsan':'Filament', 'timothy-leary':'Neon Garden',
  'jimmy-carter':'Riddle Cat', 'layman-pang':'Unfinished', 'john-paxson':'Card Sharp',
  'hubert-humphrey':'Scarlet Mage', 'andrew-mlangeni':'Sugar Rooster', 'richard-alpert':'Soaked Grin',
  'charles-barkley':'Kindled Rat', 'winnie-mandela':'Ruby Idol', 'yusuf-dadoo':'Mad King',
  'nan-chuan':'Third Eye', 'kumarajiva':'Portal Sage', 'tokusan':'Lunar Fowl', 'raymond-mhlaba':'Fuzz Tower',
  'elias-motsoaledi':'Pink Nomad', 'hyakujo':'Cosmic Shrug', 'chao-chou':'Fractal Grin',
  'lucy':'Coin Alchemist', 'reggie-miller':'Reach Wolf', 'karl-malone':'Tux Brain', 'wei-lang':'Sourpuss',
  'john-stockton':'Shade Rise', 'terry-the-tramp':'Bog Beast', 'tozan':'Sonder', 'fatima-meer':'Citrus Haze',
  'basho':'Rug Cowboy', 'mumon':'White Robe', 'ryokan':'Neon Motel', 'ummon':'Faded Frog',
  'hakuin':'Pink Tango', 'ron-harper':'Bow Frog', 'albertina-sisulu':'Pink Tabby', 'huang-po':'Tux Frog',
  'bj-armstrong':'Green Geezer', 'mac-maharaj':'Elder Ace', 'dogen':'Red Tropic', 'sengai':'Vapor Wave',
  'bill-cartwright':'Red Bloom', 'helen-suzman':'Desert Robe', 'raoul-duke':'Bat Country',
  'gary-payton':'Checker Frog', 'ruth-first':'Red Hood', 'luc-longley':'Paisley', 'dean-smith':'Scrapbook',
  'zindzi-mandela':'Ink Sketch', 'desmond-tutu':'Stray Loteria', 'ikkyu':'Purple Haze',
  'craig-ehlo':'Pastel Ten', 'bryon-russell':'Fedora', 'lazlo':'Red Eyes', 'jerry-krause':'Gold Chain',
  'kobe-bryant':'Silver Fox', 'tex-winter':'Glitch', 'joe-slovo':'Free', 'makgatho':'The Crowd',
  'evelyn-mase':'Velvet Lounge', 'bankei':'Reefer', 'doug-collins':'Bow Cat', 'patrick-ewing':'Spawn',
  'larry-bird':'Cloud Cat',
};

const entries = [];
for (const [cur, name] of Object.entries(RENAME)) {
  const html = existsSync(join(cardsDir, `${cur}.html`)) ? readFileSync(join(cardsDir, `${cur}.html`), 'utf8') : '';
  const m = html.match(/·\s*S(\d+)\s*№(\d+)/);
  entries.push({ cur, name, season: m ? +m[1] : 1, number: m ? +m[2] : 0 });
}
const ofBySeason = entries.reduce((a, e) => (a[e.season] = (a[e.season] || 0) + 1, a), {});
const newSlugs = new Set(entries.map(e => slugify(e.name)));
if (newSlugs.size !== entries.length) {
  const seen = new Set(), dups = [];
  for (const e of entries) { const s = slugify(e.name); if (seen.has(s)) dups.push(e.name); seen.add(s); }
  console.error('! duplicate slugs:', dups); process.exit(1);
}

let done = 0, featured = null;
for (const { cur, name, season, number } of entries) {
  const art = join(artDir, `${cur}.webp`);
  if (!existsSync(art)) { console.log(`  ! missing art for ${cur}`); continue; }
  const d = existsSync(join(dataDir, `${cur}.json`)) ? JSON.parse(readFileSync(join(dataDir, `${cur}.json`), 'utf8')) : {};
  const slug = slugify(name), st = statsFor(slug);
  mintCard({ name, season, number, of: ofBySeason[season], fullArt: true, img: art,
    atk: st.atk, def: st.def, trigger: st.trigger, rarity: d.rarity || 'common' });
  writeFileSync(join(dataDir, `${slug}.json`), JSON.stringify({
    slug, title: name, lore: d.lore || '', omen: d.omen || '', rarity: d.rarity || 'common',
    atk: st.atk, def: st.def, trigger: st.trigger,
    generatedBy: 'vision-named (art-read, curated psychedelic 1-2 word)',
    provenance: d.provenance || { minted: null, mintPrice: null, lastSale: null, floor: null, battlesWon: 0, battlesLost: 0, timesWagered: 0, burnsSurvived: 0, owners: [] },
  }, null, 2));
  if (cur === 'raoul-duke') featured = slug;
  done++;
}
for (const { cur } of entries) {
  if (newSlugs.has(cur)) continue;
  for (const p of [join(cardsDir, `${cur}.html`), join(artDir, `${cur}.webp`), join(dataDir, `${cur}.json`)])
    if (existsSync(p)) rmSync(p);
}
console.log(`\n✦ OCR/vision pass: re-minted ${done} cards; hero -> ${featured}`);

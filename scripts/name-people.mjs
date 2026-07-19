#!/usr/bin/env node
// People-naming pass for the whole deck (122 cards). Every card is named after a
// person — real or fictional — who appears in the writings of the six figures the
// deck draws on: Hunter S. Thompson, Ram Dass, Terence McKenna, Michael Jordan,
// Alan Watts and Nelson Mandela. Names only (no text from their work); each card
// keeps its lore/omen/rarity, stats re-derive from the new slug.
//
// Re-mints off the fixed _full.html template, moves art to the new slug, rewrites
// the dossier, and removes the old files. Keyed by the current (two-word) slug.
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mintCard, rootDir, slugify, statsFor } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data'), artDir = join(cardsDir, 'art');

// currentSlug -> person from the six writers' work
const RENAME = {
  // ── Season 1 ──
  'savage-momentum':'Oscar Acosta', 'ether-dream':'Doctor Gonzo', 'desert-logos':'Dennis McKenna',
  'brutal-descent':'Sonny Barger', 'patience-alchemy':'Kat Harrison', 'twisted-unity':'Walter Sisulu',
  'decadent-dissolve':'Bill Cardoso', 'doom-curriculum':'Maharaji', 'doomed-dignity':'Oliver Tambo',
  'ecstatic-void':'Lao Tzu', 'fierce-reckoning':'Chief Luthuli', 'jungle-alchemy':'Vanessa',
  'decadent-momentum':'Paul Kemp', 'midnight-dawn':'Govan Mbeki', 'clutch-instinct':'Scottie Pippen',
  'clutch-awareness':'Steve Kerr', 'chaos-novelty':'Marshall McLuhan', 'effortless-ascension':'Chuang Tzu',
  'fierce-compassion':'Bhagavan Das', 'cosmic-novelty':'Alfred Whitehead', 'archaic-presence':'Neem Karoli',
  'fierce-heart':'Krishna Das', 'desert-ecstasy':'Ralph Steadman', 'mirror-maya':'Bodhidharma',
  'archaic-descent':'Teilhard Chardin', 'savage-reckoning':'Robert Sobukwe', 'fierce-ubuntu':'Ahmed Kathrada',
  'boundary-dissolve':'Ev', 'atavistic-revival':'Frank Mankiewicz', 'atavistic-unity':'Chris Hani',
  'savage-flight':'Dennis Rodman', 'chaos-attractor':'Nagarjuna', 'ascension-flight':'Phil Jackson',
  'cosmic-ecstasy':'D.T. Suzuki', 'effortless-descent':'Rinzai', 'midnight-greed':'Richard Nixon',
  'twisted-logos':'Muhammad Ali', 'brutal-ecstasy':'George McGovern', 'void-maya':'Joshu',
  'desert-instinct':'Yeamon', 'fierce-drive':'Toni Kukoc', 'decadent-dawn':'Steve Biko',
  'vicious-crossover':'Isiah Thomas', 'long-passage':'Chief Jongintaba', 'twisted-ascension':'Horace Grant',
  'loving-valor':'Bram Fischer', 'bat-crossover':'Clyde Drexler', 'savage-grace':'Chenault',
  'archaic-swine':'Moburg', 'playful-reckoning':'Denis Goldberg', 'patient-logos':'Confucius',
  'effortless-doom':'Ma Tsu', 'decadent-chaos':'Sala', 'cosmic-wiggle':'Krishnamurti',
  'effortless-wander':'Han Shan', 'savage-eschaton':'Lono', 'ether-mirror':'Lama Govinda',
  'cosmic-ascension':'Magic Johnson', 'edge-presence':'Hari Dass', 'archaic-suchness':'Gautama',
  'effortless-dissolve':'Yun Men', 'cosmic-logos':'Seng Tsan', 'jungle-presence':'Timothy Leary',
  'ether-boundary':'Jimmy Carter', 'void-boundary':'Layman Pang', 'doom-clutch':'John Paxson',
  'vicious-alchemy':'Hubert Humphrey', 'ecstatic-dawn':'Andrew Mlangeni', 'effortless-surrender':'Richard Alpert',
  'savage-instinct':'Charles Barkley', 'loving-presence':'Winnie Mandela', 'savage-liberation':'Yusuf Dadoo',
  'cosmic-gnosis':'Nan Chuan', 'hyperspace-passage':'Kumarajiva', 'midnight-maya':'Tokusan',
  'playful-unity':'Raymond Mhlaba', 'long-grace':'Elias Motsoaledi', 'effortless-void':'Hyakujo',
  'timewave-boundary':'Chao Chou', 'savage-alchemy':'Lucy', 'savage-drive':'Reggie Miller',
  'prime-gnosis':'Karl Malone', 'doomed-suchness':'Wei Lang', 'cosmic-flight':'John Stockton',
  // ── Season 2 ──
  'atavistic-descent':'Terry the Tramp', 'cosmic-witness':'Tozan', 'ether-dawn':'Fatima Meer',
  'decadent-flow':'Basho', 'grace-illusion':'Mumon', 'midnight-ecstasy':'Ryokan',
  'archaic-maya':'Ummon', 'twisted-flow':'Hakuin', 'decadent-flight':'Ron Harper',
  'archaic-grace':'Albertina Sisulu', 'doomed-void':'Huang Po', 'decadent-instinct':'BJ Armstrong',
  'archaic-reckoning':'Mac Maharaj', 'savage-maya':'Dogen', 'effortless-maya':'Sengai',
  'fierce-instinct':'Bill Cartwright', 'desert-surrender':'Helen Suzman', 'savage-journey':'Raoul Duke',
  'brutal-crossover':'Gary Payton', 'brutal-reckoning':'Ruth First', 'cosmic-maya':'Luc Longley',
  'archaic-logos':'Dean Smith', 'boundary-presence':'Zindzi Mandela', 'playful-ubuntu':'Desmond Tutu',
  'floating-void':'Ikkyu', 'playful-novelty':'Craig Ehlo', 'vicious-instinct':'Bryon Russell',
  'ether-momentum':'Lazlo', 'decadent-greed':'Jerry Krause', 'effortless-prime':'Kobe Bryant',
  'chaos-boundary':'Tex Winter', 'effortless-freedom':'Joe Slovo', 'cosmic-unity':'Makgatho',
  'decadent-grace':'Evelyn Mase', 'effortless-ecstasy':'Bankei', 'playful-grace':'Doug Collins',
  'fierce-novelty':'Patrick Ewing', 'floating-ascension':'Larry Bird',
};

const entries = [];
for (const [cur, name] of Object.entries(RENAME)) {
  const html = existsSync(join(cardsDir, `${cur}.html`)) ? readFileSync(join(cardsDir, `${cur}.html`), 'utf8') : '';
  const m = html.match(/·\s*S(\d+)\s*№(\d+)/);
  entries.push({ cur, name, season: m ? +m[1] : 1, number: m ? +m[2] : 0 });
}
const ofBySeason = entries.reduce((a, e) => (a[e.season] = (a[e.season] || 0) + 1, a), {});
const newSlugs = new Set(entries.map(e => slugify(e.name)));

// guard: unique names & slugs
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
    generatedBy: 'named for people in the writings of HST · Ram Dass · McKenna · Jordan · Watts · Mandela',
    provenance: d.provenance || { minted: null, mintPrice: null, lastSale: null, floor: null, battlesWon: 0, battlesLost: 0, timesWagered: 0, burnsSurvived: 0, owners: [] },
  }, null, 2));
  if (cur === 'savage-journey') featured = slug;
  done++;
}

for (const { cur } of entries) {
  if (newSlugs.has(cur)) continue;
  for (const p of [join(cardsDir, `${cur}.html`), join(artDir, `${cur}.webp`), join(dataDir, `${cur}.json`)])
    if (existsSync(p)) rmSync(p);
}
console.log(`\n✦ people pass: re-minted ${done} cards; hero (savage-journey) -> ${featured}`);

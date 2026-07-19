#!/usr/bin/env node
// Two-word naming pass for the whole deck (122 cards). Each name is an ORIGINAL
// pairing of two evocative words drawn from the vocabularies of Hunter S. Thompson,
// Ram Dass, Terence McKenna, Michael Jordan, Alan Watts and Nelson Mandela — single
// words recombined into new names, never quotes or phrases from their writing.
//
// Re-mints every card off the (fixed) _full.html template so the flip + holographic
// tilt fix propagates, moves the art to the new slug, rewrites the dossier, and
// removes the old files. Keeps each card's lore/omen/rarity; stats re-derive from
// the new slug. Also retires the old "adrenochrome" name entirely.
import { readFileSync, writeFileSync, existsSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { mintCard, rootDir, slugify, statsFor } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data'), artDir = join(cardsDir, 'art');

// currentSlug -> new two-word name
const RENAME = {
  // ── Season 1 ──
  adrenochrome:'Savage Momentum', ether:'Ether Dream', barstow:'Desert Logos', doom:'Brutal Descent',
  simmer:'Patience Alchemy', freaks:'Twisted Unity', meltdown:'Decadent Dissolve', baron:'Doom Curriculum',
  dignity:'Doomed Dignity', grin:'Ecstatic Void', vig:'Fierce Reckoning', stew:'Jungle Alchemy',
  feast:'Decadent Momentum', breakfast:'Midnight Dawn', quickdraw:'Clutch Instinct', odds:'Clutch Awareness',
  static:'Chaos Novelty', upward:'Effortless Ascension', monster:'Fierce Compassion', rainbow:'Cosmic Novelty',
  bullion:'Archaic Presence', wound:'Fierce Heart', noon:'Desert Ecstasy', shades:'Mirror Maya',
  shovel:'Archaic Descent', fear:'Savage Reckoning', loyalty:'Fierce Ubuntu', unrendered:'Boundary Dissolve',
  chorus:'Atavistic Revival', totem:'Atavistic Unity', scorch:'Savage Flight', bender:'Chaos Attractor',
  phoenix:'Ascension Flight', joy:'Cosmic Ecstasy', comedown:'Effortless Descent', vermin:'Midnight Greed',
  prophet:'Twisted Logos', guffaw:'Brutal Ecstasy', gulper:'Void Maya', hare:'Desert Instinct',
  crimson:'Fierce Drive', barnyard:'Decadent Dawn', fingers:'Vicious Crossover', highway:'Long Passage',
  king:'Twisted Ascension', brute:'Loving Valor', crossing:'Bat Crossover', cuddly:'Savage Grace',
  swine:'Archaic Swine', spook:'Playful Reckoning', counsel:'Patient Logos', approval:'Effortless Doom',
  trouble:'Decadent Chaos', spun:'Cosmic Wiggle', drifter:'Effortless Wander', eruption:'Savage Eschaton',
  mirrors:'Ether Mirror', coronation:'Cosmic Ascension', glow:'Edge Presence', elders:'Archaic Suchness',
  waltz:'Effortless Dissolve', filament:'Cosmic Logos', garden:'Jungle Presence', riddle:'Ether Boundary',
  unfinished:'Void Boundary', sharp:'Doom Clutch', scarlet:'Vicious Alchemy', crow:'Ecstatic Dawn',
  wrung:'Effortless Surrender', spark:'Savage Instinct', ruby:'Loving Presence', bouquet:'Savage Liberation',
  seer:'Cosmic Gnosis', portal:'Hyperspace Passage', lunar:'Midnight Maya', fuzz:'Playful Unity',
  pilgrim:'Long Grace', shrug:'Effortless Void', fractal:'Timewave Boundary', alchemist:'Savage Alchemy',
  reacher:'Savage Drive', overqualified:'Prime Gnosis', sourpuss:'Doomed Suchness', ascendant:'Cosmic Flight',
  // ── Season 2 ──
  bog:'Atavistic Descent', sonder:'Cosmic Witness', grapefruit:'Ether Dawn', rug:'Decadent Flow',
  linen:'Grace Illusion', neon:'Midnight Ecstasy', sepia:'Archaic Maya', tango:'Twisted Flow',
  panther:'Decadent Flight', tabby:'Archaic Grace', tux:'Doomed Void', tropic:'Decadent Instinct',
  geezer:'Archaic Reckoning', vermillion:'Savage Maya', vapor:'Effortless Maya', beard:'Fierce Instinct',
  robe:'Desert Surrender', duke:'Savage Journey', checker:'Brutal Crossover', ember:'Brutal Reckoning',
  paisley:'Cosmic Maya', collage:'Archaic Logos', sketch:'Boundary Presence', whiskers:'Playful Ubuntu',
  haze:'Floating Void', ten:'Playful Novelty', fedora:'Vicious Instinct', redeye:'Ether Momentum',
  chain:'Decadent Greed', silver:'Effortless Prime', glitch:'Chaos Boundary', free:'Effortless Freedom',
  crowd:'Cosmic Unity', velvet:'Decadent Grace', reefer:'Effortless Ecstasy', bowtie:'Playful Grace',
  spawn:'Fierce Novelty', cloud:'Floating Ascension',
};

// gather each card's season/number from its current page title
const entries = [];
for (const [cur, name] of Object.entries(RENAME)) {
  const html = existsSync(join(cardsDir, `${cur}.html`)) ? readFileSync(join(cardsDir, `${cur}.html`), 'utf8') : '';
  const m = html.match(/·\s*S(\d+)\s*№(\d+)/);
  const season = m ? +m[1] : 1, number = m ? +m[2] : 0;
  entries.push({ cur, name, season, number });
}
const ofBySeason = entries.reduce((a, e) => (a[e.season] = (a[e.season] || 0) + 1, a), {});
const newSlugs = new Set(entries.map(e => slugify(e.name)));

let done = 0, featured = null;
for (const { cur, name, season, number } of entries) {
  const art = join(artDir, `${cur}.webp`);
  if (!existsSync(art)) { console.log(`  ! missing art for ${cur}`); continue; }
  const d = existsSync(join(dataDir, `${cur}.json`)) ? JSON.parse(readFileSync(join(dataDir, `${cur}.json`), 'utf8')) : {};
  const slug = slugify(name), st = statsFor(slug);
  // mint from the fixed template; copies art/<cur>.webp -> art/<slug>.webp
  mintCard({ name, season, number, of: ofBySeason[season], fullArt: true, img: art,
    atk: st.atk, def: st.def, trigger: st.trigger });
  writeFileSync(join(dataDir, `${slug}.json`), JSON.stringify({
    slug, title: name, lore: d.lore || '', omen: d.omen || '', rarity: d.rarity || 'common',
    atk: st.atk, def: st.def, trigger: st.trigger,
    generatedBy: 'two-word (HST · Ram Dass · McKenna · Jordan · Watts · Mandela vocab)',
    provenance: d.provenance || { minted: null, mintPrice: null, lastSale: null, floor: null, battlesWon: 0, battlesLost: 0, timesWagered: 0, burnsSurvived: 0, owners: [] },
  }, null, 2));
  if (cur === 'duke') featured = slug;   // the hero card on the homepage
  done++;
}

// remove every retired slug's files
for (const { cur } of entries) {
  if (newSlugs.has(cur)) continue;
  for (const p of [join(cardsDir, `${cur}.html`), join(artDir, `${cur}.webp`), join(dataDir, `${cur}.json`)])
    if (existsSync(p)) rmSync(p);
}
console.log(`\n✦ two-word pass: re-minted ${done} cards; hero (duke) -> ${featured}`);

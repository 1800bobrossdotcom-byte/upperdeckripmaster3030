#!/usr/bin/env node
// Season 2 "Melt" — third drop (12 cards, S2 №101-112), then re-mint the whole
// season at №/112 so the set numbering stays coherent.
import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mintCard, rootDir, slugify, statsFor } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data');
const webpDir = join(rootDir, 'scratch_new', 'webp3');
const OF = 112;

const pngs = readdirSync(rootDir).filter(f => f.startsWith('u9854915844_') && f.endsWith('.png')).sort();

// [sheetNum, name, rarity, lore, omen]
const DECK = [
  [1,"Drip Claus","rare","Gold chains, aviators, and a sack full of unregistered joy. He delivers whether you were solvent or not.","He knows if you've been holding."],
  [2,"Silver Press","uncommon","Struck in silver foil with a cartoon witness in the margin. The press only ran once before they seized it.","One pressing. No reprints."],
  [3,"Number Six","uncommon","Sixth in the numbered series, flanked by two unimpressed cats. The beard does the negotiating.","Six of a kind never loses."],
  [4,"Pixel Madiba","prizm","The elder rendered in the old 8-bit dignity, colors of home behind him. Low resolution, highest fidelity.","Every pixel did its time."],
  [5,"White Turban","rare","Wrapped, shaded orange, and surrounded by his small committee of animals. He answers questions with better silence.","The committee has decided: hold."],
  [6,"Court Cackle","mythic","Courtside in the red jersey, laughing at a game only he can see the end of. The rays off him are worth the ticket.","The last laugh is a full-court shot."],
  [7,"Holo Blank","uncommon","An empty rainbow frame waiting for whoever earns it. The rarest art is the space for it.","Unwritten beats overwritten."],
  [8,"Two Legends","mythic","Two of the greatest to ever do it, pressed into one impossible foil. The card hums if you hold it to your ear.","Greatness recognizes greatness."],
  [9,"Prism Prayer","mythic","Hands folded, light splitting straight off the third eye. Whatever he's asking for, the spectrum already said yes.","Pray in color."],
  [10,"Silver Stroll","common","An elder and his cartoon entourage out for a silver-plate walk. Nothing to prove, nowhere to be.","Walk like the foil is watching."],
  [11,"Gold Kid","rare","A small golden figure with arms wide against the dark. The simplest card in the deck and somehow the loudest.","Arms open. Odds open."],
  [12,"Motllociater","rare","The word came printed and nobody knows what it means, which is exactly why it stays. Two legends preside over the mystery.","Say it three times at the close block."],
];

mkdirSync(dataDir, { recursive: true });
let done = 0;
DECK.forEach(([sheet, name, rarity, lore, omen]) => {
  const png = pngs[sheet - 1];
  if (!png) { console.log(`  ! no png at sheet #${sheet}`); return; }
  const src = join(webpDir, png.replace(/\.png$/i, '.webp'));
  if (!existsSync(src)) { console.log(`  ! missing webp for #${sheet}`); return; }
  const number = 100 + sheet, slug = slugify(name), st = statsFor(slug);
  mintCard({ name, season: 2, number, of: OF, fullArt: true, img: src, rarity,
    atk: st.atk, def: st.def, trigger: st.trigger });
  writeFileSync(join(dataDir, `${slug}.json`), JSON.stringify({
    slug, title: name, lore, omen, rarity,
    atk: st.atk, def: st.def, trigger: st.trigger,
    generatedBy: 'vision-named (art-read, curated)',
    provenance: { minted: null, mintPrice: null, lastSale: null, floor: null, battlesWon: 0, battlesLost: 0, timesWagered: 0, burnsSurvived: 0, owners: [] },
  }, null, 2));
  done++;
});

// keep the season coherent: re-mint №1-100 at №/112
const manifest = JSON.parse(readFileSync(join(cardsDir, 'manifest.json'), 'utf8'));
const tmp = join(rootDir, 'scratch_new', 'tmp-art'); mkdirSync(tmp, { recursive: true });
let renum = 0;
for (const c of manifest.cards.filter(c => c.season === 2 && c.number <= 100)) {
  const src = join(cardsDir, 'art', `${c.slug}.webp`);
  if (!existsSync(src)) continue;
  const t = join(tmp, `${c.slug}.webp`); copyFileSync(src, t);
  mintCard({ name: c.title, season: 2, number: c.number, of: OF, fullArt: true, img: t,
    rarity: c.rarity, atk: c.atk, def: c.def, trigger: c.trigger });
  renum++;
}

for (const png of pngs) { const p = join(rootDir, png); if (existsSync(p)) rmSync(p); }
console.log(`\n✦ drop 3: minted ${done} (№101-112); re-numbered ${renum} at /112; raw uploads removed`);

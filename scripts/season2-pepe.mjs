#!/usr/bin/env node
// Season 2 "Melt" — the gonzo frog degenerates. Ingests the uploaded meme-card
// drop: reads the pre-sized webp in scratch_new/webp/, mints full-art flip cards
// with single-word HST names + living dossiers, then removes the root PNGs.
//
// Sheet numbers below match scratch_new/contact.png (the labeled contact sheet).
// #4 (a blank/incomplete render) is intentionally dropped as a duplicate-of-nothing.
import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mintCard, rootDir, slugify, statsFor } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data');
const webpDir = join(rootDir, 'scratch_new', 'webp');

// sorted list of the uploaded PNGs — index (1-based) == sheet number on contact.png
const pngs = readdirSync(rootDir).filter(f => f.toLowerCase().endsWith('.png')).sort();

// [sheetNum, name (ONE WORD), lore, omen, rarity]
const DECK = [
  [1,"Bog","Dragged up from the swamp gas at the bottom of the market and chained in a gold frame so he can't crawl back down. One eye stays open, always, watching the floor.","The bottom is a place. I live there.","rare"],
  [2,"Sonder","He looked out at the whole degenerate crowd and understood, all at once, that every last one had a weekend as ruined as his. Then he put the shades back on and ordered another.","Everyone here is the main character.","uncommon"],
  [3,"Grapefruit","Breakfast was two grapefruits, a fistful of uppers, and the sports page. He has not come down since and has no travel plans.","Citrus and speed — the only clean meal.","rare"],
  [5,"Rug","He stands on the finest rug in the room precisely because he knows they'll pull it. Might as well admire the pattern on the way to the floor.","They always pull it. Stand anyway.","uncommon"],
  [6,"Linen","Dressed all in white like a man with nothing left to confess, which is its own kind of lie. The dog knows. The dog always knows.","Clean robe, filthy ledger.","uncommon"],
  [7,"Neon","Lit from outside by a sign that says nothing and means less, he smokes and waits for the frame to buzz out. Motel light, 4 AM, forever.","The vacancy sign never lies.","rare"],
  [8,"Sepia","Photographed brown and cracked like he's already a memory somebody's trying to fence. The dog came free with the frame.","Nostalgia is just old fear.","common"],
  [9,"Tango","Two partners, one bad idea, spinning across the felt while the music runs out. Neither will admit who's leading this catastrophe.","It takes two to lose this badly.","uncommon"],
  [10,"Panther","He runs with borrowed cartoons because his own reflection got repossessed. Cool, pink, and completely unaccounted for.","Steal the cool. Return nothing.","rare"],
  [11,"Tabby","A stray out of a set that never finished printing, holding a pose nobody asked for. She sits in the frame like she paid for it.","Half-drawn and twice as proud.","common"],
  [12,"Tux","Dressed for a funeral that might be his own, holding number twenty-two like a losing raffle ticket. The house always dresses well.","Black tie. Blacker odds.","rare"],
  [13,"Tropic","He wore the loudest shirt in the hemisphere to a very quiet crime. The flowers are the decoy; the cigarette is the tell.","Dress tropical, think criminal.","uncommon"],
  [14,"Geezer","Aged forty years in one long weekend and wears every hour of it on his face. He's seen this number come up before and it never once paid.","I got old waiting for the turn.","rare"],
  [15,"Vermillion","Bathed in a red that isn't paint and isn't blood but splits the difference. He smokes like the color owes him money.","Everything's redder after midnight.","uncommon"],
  [16,"Vapor","Retired to a beach that only exists at 8-bit sunset, pension paid in dead pixels. He earned this. He thinks.","The sun sets in low resolution.","rare"],
  [17,"Beard","He grew the beard to hide the tell and the tell just moved to his hands. Now he smokes and dares you to read him.","Everything's hidden but the hands.","uncommon"],
  [18,"Robe","Walked out of the casino in a bathrobe at noon and kept right on walking into the desert. The dog followed. Bat country does that.","Checkout was hours ago. Keep walking.","rare"],
  [19,"Duke","The full costume — bucket hat, savage goggles, a cigarette holder clenched like a weapon. He is the Fear, and he brought his own.","We can't stop here. This is bat country.","mythic"],
  [20,"Checker","He conducts his business on a checkerboard floor because everything he does is one move from lost. Black square, white square, no square safe.","Your move. It was always your move.","uncommon"],
  [21,"Ember","Red hood, white beard, and a list of who's been holding and who's been dumping. He brings the burn whether you were good or not.","Naughty, nice — all combustible.","rare"],
  [22,"Paisley","Upholstered in a pattern that moves when you aren't looking, which is most of the time. The cats are just accessories to the swirl.","Stare at the paisley. It stares back.","rare"],
  [23,"Collage","A whole ransacked scrapbook of a man, taped back together from the good years and the felonies. The cat reads the evidence aloud.","I'm a collage of unpaid tabs.","uncommon"],
  [24,"Sketch","Caught as pure line before the color and the crimes set in, innocent as a first draft. Hold him and you inherit whatever he becomes.","Still just an outline of trouble.","prizm"],
  [25,"Whiskers","Three strays on one blue tin ticket, none of them related and all of them wanted. Loteria for degenerates.","Draw the cat. Pay the frog.","common"],
  [26,"Haze","The smoke got so thick the whole card went purple and the little ones stopped asking questions. Breathe shallow.","You can't see the odds through this.","uncommon"],
  [27,"Ten","Numbered ten in a set that never agreed on nine, pastel and proud of it. Soft colors, hard habit.","Ten of something. Nobody's sure what.","common"],
  [28,"Fedora","Hat pulled low, shades on at night, a face the deck can't place and won't insure. He came in from an older, meaner set.","No name. Just the hat.","rare"],
  [29,"Redeye","Three days awake and the eyes went to stoplights. In a silver suit he still looks like the last thing left at the party.","Red light means go, apparently.","rare"],
  [30,"Chain","He wears the whole floor's gold around his neck and calls it insurance. The goggles keep the glare of his own success out of his eyes.","Heavy hangs the chain that flexes.","uncommon"],
  [31,"Silver","Silvered at the temples and unbothered by any of it, he's outlasted four seasons and every man who bet against them. Old money, older habits.","I was rich before you were printed.","rare"],
  [32,"Glitch","Something went wrong in the press and he came out flickering — half here, half last frame. The error is load-bearing now.","I'm a mistake they can't reprint.","mythic"],
  [33,"Free","Marked FREE because nobody would pay and everybody wanted him anyway. The most expensive word in the whole deck.","Nothing costs more than free.","rare"],
  [34,"Crowd","Somewhere in this mob of identical degenerates is the real one, and he isn't telling. Wager him and you wager all of them.","We're all him. Good luck.","mythic"],
  [35,"Velvet","Posed against velvet like a lounge act that never got the light, bow tie crooked with contempt. He'll perform for a burn.","Draw the curtain. Same act.","uncommon"],
  [36,"Reefer","Dressed head to toe in the merchandise, which is either confidence or a confession. Slow to the duel and slower to care.","Relax. It's medicinal. Mostly.","common"],
  [37,"Bowtie","Dressed up for a game he doesn't understand and winning it anyway, bow tie and all. The pink isn't a choice, it's a fate.","Overdressed. Underconcerned.","common"],
  [38,"Spawn","Three of them where there should be one, blinking up from the purple with twenty little hearts between them. The deck multiplies when you aren't watching.","One card, three problems.","uncommon"],
  [39,"Cloud","Ascended on a pink cloud with a walking cane and no forwarding address, too pleased with himself to explain. Own him and the whole weekend floats off.","Up here the floor can't reach me.","rare"],
];

mkdirSync(dataDir, { recursive: true });
let done = 0, firstSlug = null;
DECK.forEach(([sheet, name, lore, omen, rarity], i) => {
  const png = pngs[sheet - 1];
  if (!png) { console.log(`  ! no png at sheet #${sheet}`); return; }
  const stem = png.replace(/\.png$/i, '');
  const src = join(webpDir, `${stem}.webp`);
  if (!existsSync(src)) { console.log(`  ! missing webp for #${sheet} (${stem.slice(0,30)})`); return; }
  const number = i + 1;                         // S2 running number 1..38
  const slug = slugify(name);
  mintCard({ name, season: 2, number, of: DECK.length, fullArt: true, img: src });
  const st = statsFor(slug);
  writeFileSync(join(dataDir, `${slug}.json`), JSON.stringify({
    slug, title: name, lore, omen, rarity,
    atk: st.atk, def: st.def, trigger: st.trigger,
    generatedBy: 'gonzo (HST voice, curated)',
    provenance: { minted: null, mintPrice: null, lastSale: null, floor: null, battlesWon: 0, battlesLost: 0, timesWagered: 0, burnsSurvived: 0, owners: [] },
  }, null, 2));
  if (number === 1) firstSlug = slug;
  done++;
});

// clean up: remove the raw root PNG uploads now that they're minted
for (const png of pngs) { const p = join(rootDir, png); if (existsSync(p)) rmSync(p); }

console.log(`\n✦ Season 2 (Melt): minted ${done} frog degenerates; featured S2 slug = ${firstSlug}`);

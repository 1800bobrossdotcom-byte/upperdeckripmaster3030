#!/usr/bin/env node
// Naming pass for cards 61-84 (Claude vision read each). Same as name-the-deck.mjs.
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mintCard, rootDir, slugify, statsFor } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data'), artDir = join(cardsDir, 'art');

const DECK = [
  [61,"The Molten Waltz","a melting black cat-creature in gloves, tongue out, in tie-dye fire","He dances even as he drips, one glove up, tongue out, unbothered by dissolving. The foil runs off him and pools into the next card.","I'll be a puddle by the chorus.","rare"],
  [62,"The Filament Sage","a grinning bearded elder drawn in glowing gold wire","Unspooled into pure line, he grins from inside the wireframe of the world. Pull one thread and a whole season unravels.","I am the diagram of a laugh.","mythic"],
  [63,"The Petal Sprite","a blue-eared cartoon sprite in red, lost in neon flowers","He tends the garden that grows between seasons, where the rare cards bloom. Pick nothing without asking the flowers first.","The garden keeps its own ledger.","uncommon"],
  [64,"The Riddle Cat","a rubber-hose black cat framed by question-mark medallions","Every answer he gives is another question in a nicer hat. Solve him and he simply asks you something worse.","The answer is a better riddle.","rare"],
  [65,"The Unfinished","a faint wireframe figure, barely rendered","A card the printer never colored in, still waiting at the edge of the set. Hold him and you owe the deck a face.","Finish me, or forget me.","uncommon"],
  [66,"The Card Conjurer","a grinning black cat in a wizard hat over playing cards","He shuffles fate for a living and always deals himself the top of the pack. Cut the deck; he'll cut it back.","Pick a card. I already know it.","mythic"],
  [67,"The Scarlet Mage","a white-bearded wizard in a red robe, in profile","Patient, exacting, and one incantation ahead of everyone. He lights a single spark and calls it a plan.","Magic is only patience, lit.","rare"],
  [68,"The Sugar Rooster","a red rooster drowning happily in a field of candy","Loud at dawn and sweeter than he has any right to be, he crows the pack awake. Every jellybean he stands on is a season he outlasted.","Rise and shine and sugar.","uncommon"],
  [69,"The Soaked Grin","a grinning porous square creature, tongue out","Wrung out and grinning anyway, he absorbs whatever the season pours on him. Squeeze him and last week's luck runs out.","I hold more than I look like.","common"],
  [70,"The Kindled Rat","a black startled creature lit by orange flame","Caught mid-spark, forever surprised to be on fire. His panic is the fastest thing in the pack.","Wait — is that ME burning?","uncommon"],
  [71,"The Ruby Idol","a beaming mouse-beast built entirely of rubies and hearts","Pressed from a thousand tiny hearts, he is the deck's most literal treasure. Adore him and he multiplies; ignore him and he dims.","Made of love and worth a fortune.","mythic"],
  [72,"The Blossom Outlaw","a crowned figure in black cradling a flower-wound rifle","He robs the season blind and pays it back in petals. Wanted in four quarters, forgiven in all of them.","Hands up. Here's a bouquet.","mythic"],
  [73,"The Third-Eye Seer","a bearded seer opening a third eye over a rainbow","He sees the next season before the last one locks and won't stop mentioning it. His gold rings are worth exactly one true prophecy each.","I've read the ending. It's fine.","rare"],
  [74,"The Portal Chemist","a blue-haired sage with a sword and a strange coin","He cuts holes between packs and steps through with the good cards. The coin at his throat opens whatever it touches.","Every door is a wound in the deck.","mythic"],
  [75,"The Lunar Fowl","a black duck-cat under a golden moon-tarot frame","Half fowl, half shadow, he answers only to the moon phase. On a full moon his floor doubles and his temper triples.","The moon says draw. So draw.","rare"],
  [76,"The Fuzz Totem","three fuzzy monsters stacked into one grinning pillar","Green holds orange holds blue, and all three deny doing any holding. Wager the top and the whole tower wobbles.","We are definitely not connected.","uncommon"],
  [77,"The Shaggy Pilgrim","a blue-headed pink shaggy creature leaning on a staff","He has walked in from a set that no longer prints, staff worn smooth. Whatever pack he joins gains a little dust and a little grace.","I've been walking since the first edition.","uncommon"],
  [78,"The Cosmic Shrug","a black duck shrugging in a starfield tarot","Offered the secrets of the universe, he shrugs and asks what's for lunch. His indifference is weirdly load-bearing.","Eh. It's all just cards anyway.","rare"],
  [79,"The Fractal Grin","a black clay figure with rainbow eyes, grinning, in a recursive frame","His grin repeats inside itself forever, smaller and smaller and never done. Stare too long and you're a card inside his teeth.","Smile within a smile within a—","mythic"],
  [80,"The Coin Alchemist","a spiral-eyed skull-sage smoking, clutching a crypto bill","He turns burns into fortunes and fortunes into smoke. The bill in his hands is worth exactly what the chain says today.","Money is just slow fire.","rare"],
  [81,"The Reaching Wolf","a black wolf-creature with enormous pink hands, reaching out","Always grabbing for the card just out of frame. Whatever he can touch, he counts as his.","One more. Just one more.","uncommon"],
  [82,"The Tuxedo Brain","a bespectacled blue-haired nerd in a tuxedo","Overdressed and overqualified, he calculates the odds nobody asked for. In a fight he simply tells you why you've already lost.","Statistically, you're in trouble.","uncommon"],
  [83,"The Purple Grump","a purple fuzzy monster scowling with sticks","Perpetually unimpressed, he drags his mood into every pack he touches. Win him and he sulks; lose him and he sulks harder.","Fine. Whatever. Draw the card.","common"],
  [84,"The Shaded Ascendant","a grey sunglasses monster rising over a psychedelic sky","Too cool to explain where he's floating off to. Owning him means the season is about to lift.","Up and out. Don't wait up.","rare"],
];

mkdirSync(dataDir, { recursive: true });
let done = 0;
for (const [num, name, character, lore, omen, rarity] of DECK) {
  const src = join(artDir, `the-card-${String(num).padStart(2, '0')}.png`);
  if (!existsSync(src)) { console.log(`  ! missing art for card ${num}`); continue; }
  const slug = slugify(name);
  mintCard({ name, season: 1, number: num, of: 84, fullArt: true, img: src });
  const st = statsFor(slug);
  writeFileSync(join(dataDir, `${slug}.json`), JSON.stringify({
    slug, title: name, character, lore, omen, rarity,
    atk: st.atk, def: st.def, trigger: st.trigger,
    generatedBy: 'claude-vision (curated)',
    provenance: { minted: null, mintPrice: null, lastSale: null, floor: null, battlesWon: 0, battlesLost: 0, timesWagered: 0, burnsSurvived: 0, owners: [] },
  }, null, 2));
  done++;
}
for (let i = 61; i <= 84; i++) {
  const n = String(i).padStart(2, '0');
  for (const p of [join(cardsDir, `the-card-${n}.html`), join(artDir, `the-card-${n}.png`)]) if (existsSync(p)) rmSync(p);
}
console.log(`\n✦ named + re-minted ${done} cards (61-84); removed placeholders`);

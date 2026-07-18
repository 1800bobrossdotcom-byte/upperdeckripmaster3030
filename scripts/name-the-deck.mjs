#!/usr/bin/env node
// One-time: Claude (me, via vision) read all 60 card images and named them.
// This renames each the-card-NN into a real slug, re-mints the flip card, and
// writes its living-dossier JSON (title/lore/omen/rarity + provenance seed).
// Titles are original/generic — no trademarked character names (see PROMPT-KIT §3).

import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mintCard, rootDir, slugify, statsFor } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards');
const dataDir = join(cardsDir, 'data');
const artDir = join(cardsDir, 'art');

// [number, name, character, lore, omen, rarity]
const DECK = [
  [1,"The Bellow","a blue-faced mustachioed brute, fists raised","Born bellowing, he shakes the foil loose from the pack. Collectors say his roar is what wakes each new season.","Rise, and rattle the seams of the world.","uncommon"],
  [2,"The Slouch","a spiky-haired kid in shades, half-asleep","He has seen every hand the deck will ever deal and found them all a little boring. His yawn bends probability toward whatever bores him least.","Wake me when the odds change.","common"],
  [3,"The Ember Rustler","a pepper-red creature in a cowboy hat, on a field of stars","He rides the glitter belt herding sparks that fell off dying comets. Every ember he brands becomes a season's first spark.","Brand the sky before it cools.","rare"],
  [4,"The Pit Boss","a heavyset plumber hoisting a pickaxe barbell","He mines the underlayers of the pack where the rarest cards are still ore. Nothing surfaces from below until he lifts it.","Everything valuable is buried first.","uncommon"],
  [5,"The Midnight Cook","a white-bearded cook under a tall hat at dusk","He simmers the season's flavor in a pot no one is allowed to see. When the broth is ready, the pack is ready.","Taste is patience wearing a hat.","rare"],
  [6,"The Odd Couple","two mismatched cartoon spirits lounging together","One is fire and one is fog, and neither remembers which. Together they are worth more than either alone — the deck's first proof that pairs matter.","Two wrongs make a wager.","uncommon"],
  [7,"The Molten One","a melting glossy rodent-shape with burning eyes","He was pressed too hot and never fully set, so he drips a little more each block. Hold him too long and he pools into something new.","I am still cooling. Do not touch.","mythic"],
  [8,"The Bone Baron","a top-hatted skull over crossed bones","He collects the cards that lose their battles and files them under his brim. Every burn adds a bone to his estate.","The house of the dead is always hiring.","rare"],
  [9,"The Skull Squire","a bearded skull hitching up its britches","Half funeral, half comedy, he suits up for a duel he has already lost eternally. He fights anyway, and that is the point.","Dignity is a clean pair of pants.","uncommon"],
  [10,"The Dripping Grin","a melting white-gloved grin","Nothing but a smile and a pair of gloves, dissolving pleasantly. He is the last thing a burned card sees.","Everything ends grinning.","rare"],
  [11,"The Velvet Fang","a fanged gentleman in a purple coat","He deals in favors paid back in centuries. Sign nothing you cannot re-collect.","The contract is in the smile.","mythic"],
  [12,"The Sly Cook","a grinning white-bearded cook in a red-and-purple hat","He knows what is in the stew and finds your suspicion delicious. Ask no questions and eat well.","Trust the chef. Question the meat.","rare"],
  [13,"The Feastmaster","a beaming bearded cook mid-service","He never stops plating, because a stopped feast is a dead season. His grin is a promise there is always more.","No one leaves the table empty.","uncommon"],
  [14,"The Dawn Cook","a bearded cook grinning into the sunrise","He works the graveyard shift into the morning shift without noticing the difference. Breakfast, to him, is just supper that survived.","The sun is only a slower oven.","uncommon"],
  [15,"The Orange Duelist","an orange-suited kid mid-standoff in a chrome frame","Quick to the draw and quicker to the quip, he settles ties with a coin flip only he can see. The chrome remembers every duel he has won.","Draw. I already have.","rare"],
  [16,"The Streetwise","a cool kid in a leather jacket, arms crossed","He knows which cards are bluffing and never says how. His silence is the most valuable thing in the pack.","I know. I always know.","uncommon"],
  [17,"The Candy Hound","a glittering plush dog on a mosaic","Stitched from sugar and static, he begs for burns instead of treats. Feed him and he glows for a season.","Good boy. Now feed the fire.","rare"],
  [18,"The Freckled Fool","a bald orange-clad boy, grinning dim","He fails upward through every season by refusing to understand the rules. Somehow he is always in the winning pack.","Losing is just winning I don't get yet.","common"],
  [19,"The Beast Embrace","a small keeper hugging a huge furry beast","Proof that the monsters in the deck can be held. Whoever holds him gathers the gentle ones.","The biggest ones just want holding.","uncommon"],
  [20,"The Rainbow Maw","an enormous grinning mouth ringed in prismatic teeth","All grin, no face, chewing color out of the dark. He eats the season's dullest cards and burps rainbows.","Open wide. The light tastes fine.","mythic"],
  [21,"The Gilded Sage","a golden bearded elder cast in metal","Frozen mid-thought forever, he is the deck's oldest asset and its steadiest floor. Gold does not burn; it only changes hands.","I was here before the first pack.","rare"],
  [22,"The Pierced Heart","a skull guarding a dagger-struck heart shield","He keeps the wound that started the game and will not let it close. As long as it bleeds, the season is alive.","Some hearts are load-bearing.","rare"],
  [23,"The Solar Jester","a sun-and-moon clown face over a small familiar","Day laughs, night grins, and between them the season turns. He juggles the light no one else can hold.","I am the punchline of the sky.","mythic"],
  [24,"The Twin Shades","two silhouettes, one blue, one pink","Nobody has seen their faces and nobody has needed to. They are worth double only when wagered together.","We are the parts you cannot see.","uncommon"],
  [25,"The Bonedigger","a skeleton with crossed shovels in gold filigree","He exhumes the cards the deck tried to forget. Every burn buries one and he digs up two.","What is buried is only resting.","rare"],
  [26,"The Red-Eyed Wraith","a spectral figure with a single burning eye","He haunts the losing side of the ledger, feeding on forfeited cards. Meet his eye and you have already wagered.","Blink first. Everyone does.","mythic"],
  [27,"The Hound Twins","two teal hounds nuzzling under paired hearts","Loyalty doubled and split down the middle. They refuse to be separated in trade and sulk if you try.","Wager one, wager both.","uncommon"],
  [28,"The Shadow Kin","two blue silhouette creatures, side by side","The unrendered draft of two spirits still waiting for color. Hold them and you decide what they become.","We are the sketch before the ink.","common"],
  [29,"The Croak Chorus","three froggy silhouettes mid-song","They only appear in threes and only sing when the gas runs high. A full chorus is a rare and noisy omen.","When we croak, the season turns.","uncommon"],
  [30,"The Beast Totem","stacked blue creature-silhouettes","A pillar of spirits balancing one atop another, each holding up the next. Pull the bottom card and the whole stack answers.","The top is only borrowed from the bottom.","rare"],
  [31,"The Blazing Beak","a fast bird in shades against a wall of fire","Too quick to catch, too cool to care, he outruns his own flames. Collectors chase him and collect the scorch marks.","Catch me and you'll only get the smoke.","rare"],
  [32,"The Feathered Wizard","a blue owl-mage raising a staff in fire","He casts the odds themselves, bending a bad draw into a good one. His spells cost a burn and pay in luck.","The dice were never yours to roll.","mythic"],
  [33,"The Firebird","a white-plumed bird descending in flame","Every season he burns down and rises from the ashes of the last pack. Owning him means owning an ending and a beginning.","I am the pack's last page and its first.","mythic"],
  [34,"The Joyshout","a round yellow kid mid-cheer in tie-dye","Pure delight rendered as a small explosion. His joy raises the foil temperature of every card near him.","Scream if you're glad to be a card.","uncommon"],
  [35,"The Pajama Bear","a pink bear in buttoned pajamas, halftone","He collects the sleepy hours between seasons and hoards them under his pillow. Wake him and a new season starts early.","Five more blocks. Please.","common"],
  [36,"The Moon Vermin","a long pink furred creature under a red moon","He gnaws the edges of the pack where the rare cards fray. Whatever the moon shows him, he steals before dawn.","The moon owes me. It knows.","rare"],
  [37,"The Noodle Prophet","a purple noodle-limbed spirit pointing skyward","His arms bend in impossible directions, and so do his prophecies. Follow the finger, not the face.","The way out is the way it points.","uncommon"],
  [38,"The Great Guffaw","a plaid-gowned child laughing to the sky","One laugh so large it warps the tie-dye around it. When he laughs, the whole deck feels it and shuffles.","HA — and the pack reshuffles.","rare"],
  [39,"The Blue Gobbler","a blue duck-thing, tongue lolling","He swallows small cards whole and grins about it. A messy eater with an excellent floor price.","Everything fits if you don't chew.","common"],
  [40,"The Masked Hare","a grey hare with dark masked eyes","Cool under any wager, he keeps the punchline in his back pocket. Bet against him and become the joke.","Eh. What's the wager, doc?","rare"],
  [41,"The Crimson Hound","a shaggy red dog grinning enormously","A tower of red fur and pure enthusiasm. He fetches the cards you didn't know you'd lost.","I found it! I found all of it!","uncommon"],
  [42,"The Barnyard Bravo","a black rooster with a red crest and bandana","Loudest voice in the yard, quickest to a duel, first to crow the season open. All swagger, all heart.","I say — I say the pack is OPEN.","uncommon"],
  [43,"The Striped Rogue","a striped-shirt rascal in an ornate frame, red boots","One of a gang that lifts cards off the unwary. Watch your pack when he's in the pull.","You won't miss it. Trust me.","rare"],
  [44,"The Blue Wanderer","a blue pilgrim in red shoes, marbled in red and blue","He walks the long numbered path between seasons, twenty-one steps at a time. Each step is a psalm he half-remembers.","Step twenty-one, and start again.","mythic"],
  [45,"The Boy King","a bearded crowned child on a throne of black-light rays","Crowned too young and grinning too wide, he rules the season from a rainbow arch. His court is small and his reign is loud.","Long may I — eh, whatever.","mythic"],
  [46,"The Heart Beast","a blue furry monster clutching a heart, in a kaleidoscope","Big, blue, and dangerously sincere, he wears his heart where it can be wagered. Win it and it beats for you.","Take it. It only works when given.","uncommon"],
  [47,"The Shadow Cat","a black cat silhouette against a solar halo, occult frame","He crosses the space between two seasons and dares you to follow. Luck sours or sweetens the moment he passes.","Cross me and find out which way.","mythic"],
  [48,"The Purple Gremlin","a fanged purple furball, cute and menacing","Adorable until the foil dims, then all teeth. Feed after the burn window at your own risk.","Pet me. Go on. Pet me.","rare"],
  [49,"The Bearded Trinity","a three-headed bearded elder in red, meditating","Past, present, and pack, seated as one and disagreeing softly. He votes three times and burns once.","We are of three minds about this.","mythic"],
  [50,"The Grinning Spook","a shades-wearing ghost dog, tongue out, in red flame","Death took him and he took it as a joke. He haunts the winners' side, grinning at the loot.","Boo. Also, nice hand.","rare"],
  [51,"The Gentleman Toad","a top-hatted monocled toad reading in a red chair","He reads the rulebook so no one else has to, then quietly rewrites a clause. Refined, patient, and always one edition ahead.","The fine print is where I live.","rare"],
  [52,"The Blaze Grin","a grinning yellow face with two thumbs up, on fire","Approval, on fire. His thumbs-up is worth a small fortune and a large risk.","Looks good to me. It's always on fire.","uncommon"],
  [53,"The Smoking Imp","a black hare-imp with red eyes, mid-smoke","Trouble in a trim suit, blowing rings that become new cards. Deal with him and count your pack twice.","One puff, one card, no refunds.","rare"],
  [54,"The Dizzy Grin","an X-eyed grinning face with white gloves","Spun once too often and stuck grinning ever since. He makes the whole board a little woozier just by existing.","Round and round and rare and rare.","uncommon"],
  [55,"The Green Drifter","a dread-locked green reptile in a night forest","He wanders in from the edge of the set with no season and no hurry. Whatever pack he drifts into gets stranger.","No pack. No season. Just vibes.","uncommon"],
  [56,"The Eruption","two spirits merging into a lava-rainbow volcano","A season ending and beginning in the same molten breath. Hold him during a lock and feel the ground move.","Everything old is lava now.","mythic"],
  [57,"The Mirror Twins","two glowing outline figures on a checkered floor","Rendered only in light, they exist to be doubled and reflected. A prizm pair — proof the foil can be pure line.","We are the same light, twice.","prizm"],
  [58,"The Neon Coronation","crowned neon outline figures under radiant lines","A coronation drawn entirely in glowing wire, crown and all. The rarest way the deck says: this one rules.","Crowned in light, weightless as luck.","prizm"],
  [59,"The Glowing Pair","two neon outline duck-shapes","Line-art spirits that only fully appear when the foil runs hot. Catch them lit and you've caught a prizm.","Bright together or not at all.","prizm"],
  [60,"The Radiant Elders","neon outline elders beneath a glowing dome","The oldest spirits redrawn as pure radiance, presiding over the set's edge. A prizm chase and the deck's quiet finale.","Last light of the first pack.","prizm"],
];

mkdirSync(dataDir, { recursive: true });
const seen = new Set();
let done = 0;
for (const [num, name, character, lore, omen, rarity] of DECK) {
  const src = join(artDir, `the-card-${String(num).padStart(2, '0')}.png`);
  if (!existsSync(src)) { console.log(`  ! missing art for card ${num}`); continue; }
  const slug = slugify(name);
  if (seen.has(slug)) { console.log(`  ! duplicate slug ${slug}`); continue; }
  seen.add(slug);

  // re-mint the flip card under the real name (copies art → cards/art/<slug>.png)
  mintCard({ name, season: 1, number: num, of: DECK.length, fullArt: true, img: src });

  // write the living dossier the card back reads
  const st = statsFor(slug);
  writeFileSync(join(dataDir, `${slug}.json`), JSON.stringify({
    slug, title: name, character, lore, omen, rarity,
    atk: st.atk, def: st.def, trigger: st.trigger,
    generatedBy: 'claude-vision (curated)',
    provenance: { minted: null, mintPrice: null, lastSale: null, floor: null,
      battlesWon: 0, battlesLost: 0, timesWagered: 0, burnsSurvived: 0, owners: [] },
  }, null, 2));
  done++;
}

// remove the old placeholder-named pages + art
for (let i = 1; i <= 60; i++) {
  const n = String(i).padStart(2, '0');
  for (const p of [join(cardsDir, `the-card-${n}.html`), join(artDir, `the-card-${n}.png`)]) {
    if (existsSync(p)) rmSync(p);
  }
}
console.log(`\n✦ named + re-minted ${done} cards; removed the-card-NN placeholders`);

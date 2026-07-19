#!/usr/bin/env node
// Rewrite all 84 cards in Hunter S. Thompson's gonzo voice — single-word names + new lore.
// Renames from the current slug to the new one-word gonzo slug, re-mints the flip card
// off the existing .webp art, rewrites the dossier JSON, removes the old files.
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mintCard, rootDir, slugify, statsFor } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data'), artDir = join(cardsDir, 'art');

// [num, oldName, newName (ONE WORD), lore, omen, rarity]
const DECK = [
  [1,"The Bellow","Adrenochrome","Somewhere past the third drink he stopped being a man and became pure bad craziness with fists. Don't make eye contact — he can smell fear, and he is very, very thirsty.","The swine are running. Follow them.","uncommon"],
  [2,"The Slouch","Ether","He took the whole bag before noon and now the odds bend around his yawn like heat off the highway. Wake him and you will answer for it.","Wake me when the acid wears off.","common"],
  [3,"The Ember Rustler","Barstow","We were somewhere around the county line when the pepper started talking, and it has not shut up since. He herds sparks the way lesser men herd regrets.","Buy the ticket, brand the sky.","rare"],
  [4,"The Pit Boss","Doom","Two hundred pounds of grievance and a pickaxe he calls the American Dream. He digs down because down is where they buried the good stuff.","Everything worth having is buried.","uncommon"],
  [5,"The Midnight Cook","Simmer","He has been simmering the same pot since the Fear set in and swears it is almost ready. Nobody is allowed to look under the lid. Nobody wants to.","Patience, in a tall white hat.","rare"],
  [6,"The Odd Couple","Freaks","One runs hot, one runs foul, and neither remembers whose idea this was. Together they are worth the whole degenerate weekend.","Two wrongs and a rental car.","uncommon"],
  [7,"The Molten One","Meltdown","They pressed him too hot and he never set right; he drips a little more each block, grinning through the runoff. Hold him too long and you will be scraping him off the felt.","I'm still cooling. Don't touch.","mythic"],
  [8,"The Bone Baron","Baron","He files every card that dies in battle under the brim of his hat, and business is booming. Every burn is a new tenant in the house of the doomed.","The house of the dead is hiring.","rare"],
  [9,"The Skull Squire","Dignity","Half a funeral and half a punchline, hitching up his pants for a duel he lost before the ether wore off. He fights anyway. That's the whole gag.","At least die with clean pants.","uncommon"],
  [10,"The Dripping Grin","Grin","Nothing left but a smile and a pair of gloves, dissolving pleasant as ether. He is the last thing a burned card sees before the lights go savage.","Everything ends grinning.","rare"],
  [11,"The Velvet Fang","Vig","He loans favors and collects in centuries, smiling the whole brutal way down. Sign nothing you can't out-run.","The contract's in the teeth.","mythic"],
  [12,"The Sly Cook","Stew","He knows exactly what's in the pot and finds your paranoia delicious. Ask no questions, eat fast, tip well.","Trust the chef. Fear the meat.","rare"],
  [13,"The Feastmaster","Feast","He can't stop plating, because a stopped feast is a dead weekend and this one is not dying on his watch. His grin is a promise there's always another course of bad decisions.","Nobody leaves the table sober.","uncommon"],
  [14,"The Dawn Cook","Breakfast","He worked the graveyard shift straight into morning and never noticed the sun come up screaming. Breakfast, to him, is just last night that survived.","The sun is a slower oven.","uncommon"],
  [15,"The Orange Duelist","Quickdraw","Quicker to the pistol than the punchline, he settles every tie with a coin only he can see land. The chrome remembers every duel; the kid remembers none.","Draw. I already did.","rare"],
  [16,"The Streetwise","Odds","He can smell a bluff across a smoke-filled room and he will never tell you how. His silence is the most expensive thing in the deck.","I know. I always know.","uncommon"],
  [17,"The Candy Hound","Static","Stitched from candy and bad reception, he begs for burns instead of biscuits. Feed him and he glows like a motel sign at 3 AM.","Good boy. Now feed the fire.","rare"],
  [18,"The Freckled Fool","Upward","Too dumb to lose and too lucky to notice, he stumbles through every season and lands in the winning pack. God protects fools, and this one specifically.","Losing is just slow winning.","common"],
  [19,"The Beast Embrace","Monster","Proof that even the big ugly ones just want holding at the end of a long weekend. Whoever holds him gathers all the gentle freaks.","The biggest ones only want holding.","uncommon"],
  [20,"The Rainbow Maw","Rainbow","All grin and no face, chewing the color right out of the dark. He eats the dull cards and belches something you'll see for days.","Open wide. The light tastes fine.","mythic"],
  [21,"The Gilded Sage","Bullion","Frozen mid-thought since before the first bad idea, he's the deck's steadiest floor. Gold doesn't burn; it just changes hands in the dark.","I was here before the Fear.","rare"],
  [22,"The Pierced Heart","Wound","He guards the knife-stuck heart that started this whole degenerate game and won't let it scab over. As long as it bleeds, the weekend's still alive.","Some wounds are load-bearing.","rare"],
  [23,"The Solar Jester","Noon","Day laughs, night grins, and the poor bastard in between juggles a light nobody else can hold. He is the punchline the sky's been building to.","I'm the joke the desert tells.","mythic"],
  [24,"The Twin Shades","Shades","Nobody's seen their faces and nobody's survived asking. Worth double, but only if you're fool enough to wager both.","We're the part you can't quite see.","uncommon"],
  [25,"The Bonedigger","Shovel","He digs up the cards the deck tried to bury, and the deck keeps burying more. One down, two up, all night, every night.","Nothing's buried. It's just resting.","rare"],
  [26,"The Red-Eyed Wraith","Fear","He works the losing side of the ledger, feeding on everything forfeited to the dark. Meet his eye and the bet is already placed.","Blink first. Everyone does.","mythic"],
  [27,"The Hound Twins","Loyalty","Two mutts split down the middle and welded back by pure devotion. Try to trade one and they'll both sulk you into the ground.","Wager one, wager both.","uncommon"],
  [28,"The Shadow Kin","Unrendered","Two spirits still waiting on their color, sketched at the edge of a bad trip. Hold them and you decide what crawls out.","We're the sketch before the ink.","common"],
  [29,"The Croak Chorus","Chorus","They only turn up in threes and only sing when the gas runs high and the Fear runs higher. A full chorus means the weekend's about to turn savage.","When we croak, it turns.","uncommon"],
  [30,"The Beast Totem","Totem","A pillar of degenerates, each holding up the one above and denying they're touching. Pull the bottom and the whole tower answers at once.","The top is borrowed from the bottom.","rare"],
  [31,"The Blazing Beak","Scorch","Too quick to catch and far too cool to care, he outruns his own flames down the highway. Chase him and you'll collect nothing but scorch marks and regret.","Catch me and you'll get the smoke.","rare"],
  [32,"The Feathered Wizard","Bender","He casts the odds themselves, bending a doomed hand into a winning one for the price of a burn. The dice were never yours to roll, friend.","The dice were never yours.","mythic"],
  [33,"The Firebird","Phoenix","Every season he burns to the felt and claws back out of the ashes of the last pack. Own him and you own an ending, plus the ugly morning after.","I'm the last page and the first.","mythic"],
  [34,"The Joyshout","Joy","Delight so violent it registers as a small explosion in the parking lot. His good mood raises the temperature of every card near enough to catch it.","Scream if you're glad you're a card.","uncommon"],
  [35,"The Pajama Bear","Comedown","He hoards the dead hours between weekends under his pillow like contraband. Wake him and the next season starts early and mean.","Five more blocks. Please.","common"],
  [36,"The Moon Vermin","Vermin","He gnaws the frayed edges of the pack where the rare ones come loose. Whatever that filthy moon shows him, he lifts before dawn.","The moon owes me. It knows.","rare"],
  [37,"The Noodle Prophet","Prophet","His limbs bend in directions nobody approved, and so do his predictions. Follow the finger, never the face.","The way out is the way it points.","uncommon"],
  [38,"The Great Guffaw","Guffaw","One howl so enormous it warps the wallpaper and the odds with it. When he laughs, the whole deck feels the shove and reshuffles.","HA — and the pack turns over.","rare"],
  [39,"The Blue Gobbler","Gulper","He swallows the little cards whole and grins with the evidence still showing. A sloppy eater with a suspiciously solid floor.","It all fits if you don't chew.","common"],
  [40,"The Masked Hare","Hare","Cool under any wager and sitting on the punchline like a loaded gun. Bet against him and you become the joke, doc.","Eh. What's the wager?","rare"],
  [41,"The Crimson Hound","Crimson","A tower of red fur and pure uncut enthusiasm, fetching the cards you didn't know you'd lost. He means well. That's the terrifying part.","I found it! I found all of it!","uncommon"],
  [42,"The Barnyard Bravo","Barnyard","Loudest mouth in the yard, first to a duel, first to crow the weekend open. All swagger, all bandana, no brakes.","I say — the pack is OPEN.","uncommon"],
  [43,"The Striped Rogue","Fingers","One of a gang that lifts cards clean off the unwary between drinks. Watch your pack when he's in the pull.","You won't miss it. Trust me.","rare"],
  [44,"The Blue Wanderer","Highway","He walks the long numbered road between weekends, muttering a count he half-remembers. Each step is a prayer and a bad decision.","Twenty-one steps, then start again.","mythic"],
  [45,"The Boy King","King","Crowned too young, grinning too wide, ruling the whole weekend from a throne of black-light and static. His court is small and loud and doomed.","Long may I — eh, whatever.","mythic"],
  [46,"The Heart Beast","Brute","Big, blue, and dangerously honest, wearing his heart right where you can wager it. Win it and the fool thing beats for you.","Take it. It only works if given.","uncommon"],
  [47,"The Shadow Cat","Crossing","He walks the black gap between two weekends and dares you to follow into bat country. Luck turns the instant he passes — you just won't know which way.","Cross me and find out.","mythic"],
  [48,"The Purple Gremlin","Cuddly","Adorable right up until the foil dims, then it's all teeth and bad craziness. Feed after the burn window at your own funeral.","Pet me. Go on. Pet me.","rare"],
  [49,"The Bearded Trinity","Swine","Past, present, and pack, seated as one and disagreeing softly through the ether. He votes three times and burns exactly once.","We're of three minds about this.","mythic"],
  [50,"The Grinning Spook","Spook","Death came for him and he laughed and kept the shades. Now he haunts the winners' side, grinning at the loot.","Boo. Also, nice hand.","rare"],
  [51,"The Gentleman Toad","Counsel","He reads the rulebook so no one else has to, then quietly rewrites a clause in his favor. Refined, patient, and always one edition ahead of the law.","The fine print is where I live.","rare"],
  [52,"The Blaze Grin","Approval","Approval, fully engulfed. His thumbs-up is worth a small fortune and a large hospital bill.","Looks good to me. It's always on fire.","uncommon"],
  [53,"The Smoking Imp","Trouble","He blows rings that come back as new cards and trouble that comes back as more trouble. Deal with him and count your pack twice, then again.","One puff, one card, no refunds.","rare"],
  [54,"The Dizzy Grin","Spun","Whirled around one time too many and stuck grinning with the room still moving. He makes the whole board a little woozier just by breathing.","Round and round and rare.","uncommon"],
  [55,"The Green Drifter","Drifter","He wandered in from the ragged edge of the set with no season, no hurry, and no fixed address. Whatever pack he drifts into gets weird and stays weird.","No pack. No season. Just the road.","uncommon"],
  [56,"The Eruption","Eruption","A season ending and beginning in the same molten breath, straight up from the earth's bad conscience. Hold him at the lock and feel the ground go savage.","Everything old is lava now.","mythic"],
  [57,"The Mirror Twins","Mirrors","Drawn in nothing but light and doubled on a checkered floor at the end of the trip. A prizm pair — proof the foil can be pure, weightless line.","The same light, twice.","prizm"],
  [58,"The Neon Coronation","Coronation","A crowning drawn entirely in glowing wire, crown and all, radiating out of the dark. The rarest way this degenerate deck says: this one rules.","Crowned in light, light as luck.","prizm"],
  [59,"The Glowing Pair","Glow","Line-art ghosts that only fully arrive when the foil runs hot and the hour runs late. Catch them lit and you've caught a prizm.","Bright together or not at all.","prizm"],
  [60,"The Radiant Elders","Elders","The oldest spirits redrawn as pure radiance, presiding over the frayed edge of the set. A prizm chase and the deck's quiet, doomed finale.","Last light. Then the dark.","prizm"],
  [61,"The Molten Waltz","Waltz","He keeps dancing even as he drips, one glove up, tongue out, unbothered by his own dissolution. The runoff pools into whatever comes next.","I'll be a puddle by the chorus.","rare"],
  [62,"The Filament Sage","Filament","Unspooled into pure gold line, grinning from inside the wireframe of the whole rotten world. Pull one thread and a season unravels in your hands.","I'm the diagram of a laugh.","mythic"],
  [63,"The Petal Sprite","Garden","He tends the flowers that grow between weekends, where the rare cards bloom like bad ideas. Pick nothing without asking the garden first.","The garden keeps its own book.","uncommon"],
  [64,"The Riddle Cat","Riddle","Every answer he gives is a worse question wearing a nicer hat. Solve him and he just asks you something with teeth.","The answer's a better riddle.","rare"],
  [65,"The Unfinished","Unfinished","A card the printer never colored in, still waiting at the edge of a comedown. Hold him and you owe the deck a face.","Finish me, or forget me.","uncommon"],
  [66,"The Card Conjurer","Sharp","He shuffles fate for a living and always deals himself the top of the pack. Cut the deck — he'll cut it right back.","Pick a card. I already know it.","mythic"],
  [67,"The Scarlet Mage","Scarlet","Patient, exacting, and one incantation ahead of every other bastard in the room. He lights one spark and calls it a plan.","Magic is just patience, lit.","rare"],
  [68,"The Sugar Rooster","Crow","Loud as sin and drowning happily in a field of candy, crowing the pack awake. Every jellybean he stands on is a weekend he outlasted.","Rise and shine and sugar.","uncommon"],
  [69,"The Soaked Grin","Wrung","Squeezed dry and smiling anyway, he soaks up whatever the season pours on him. Wring him out and last week's luck runs down the drain.","I hold more than I look like.","common"],
  [70,"The Kindled Rat","Spark","Forever surprised to find himself on fire, and getting faster about it. His panic is the quickest thing in the whole pack.","Wait — is that ME burning?","uncommon"],
  [71,"The Ruby Idol","Ruby","Pressed from a thousand tiny hearts into the deck's most literal treasure. Adore him and he multiplies; ignore him and he goes dark and mean.","Made of love, worth a fortune.","mythic"],
  [72,"The Blossom Outlaw","Bouquet","He robs the season blind and pays it back in petals, wanted in all four quarters and forgiven in each. Hands up — here's a flower.","Hands up. Here's a bouquet.","mythic"],
  [73,"The Third-Eye Seer","Seer","He opened the third eye somewhere past the last bridge and now he won't stop narrating the ending. Each gold ring is worth exactly one true, terrible prophecy.","I've read the ending. It's fine.","rare"],
  [74,"The Portal Chemist","Portal","He cuts holes between packs and steps through with the good cards and a bad attitude. The coin at his throat opens whatever it touches, whether you wanted it open or not.","Every door's a wound in the deck.","mythic"],
  [75,"The Lunar Fowl","Lunar","Half fowl, half shadow, answering only to the moon and never to reason. A full moon doubles his floor and triples his temper.","The moon says draw. So draw.","rare"],
  [76,"The Fuzz Totem","Fuzz","Green holds orange holds blue, and all three swear on their lives they aren't touching. Wager the top and the whole tower wobbles into the Fear.","We're definitely not connected.","uncommon"],
  [77,"The Shaggy Pilgrim","Pilgrim","He walked in from a set that stopped printing, staff worn smooth by the highway. Whatever pack he joins gains a little dust and a little grace.","Walking since the first edition.","uncommon"],
  [78,"The Cosmic Shrug","Shrug","Offered the secrets of the universe, he shrugs and asks what's for lunch. His indifference is, somehow, load-bearing.","Eh. It's all just cards.","rare"],
  [79,"The Fractal Grin","Fractal","His grin repeats inside itself forever, smaller and smaller and never finished. Stare too long and you're a card wedged in his teeth.","A smile within a smile within—","mythic"],
  [80,"The Coin Alchemist","Alchemist","He turns burns into fortunes and fortunes into smoke without breaking eye contact. The bill in his hands is worth exactly what the chain swears today and nothing tomorrow.","Money's just slow fire.","rare"],
  [81,"The Reaching Wolf","Reacher","Always grabbing for the card just outside the frame with hands too big to trust. Whatever he can touch, he counts as his.","One more. Just one more.","uncommon"],
  [82,"The Tuxedo Brain","Overqualified","Overdressed, overqualified, and calculating odds nobody asked for. In a fight he just explains, precisely, why you've already lost.","Statistically, you're in trouble.","uncommon"],
  [83,"The Purple Grump","Sourpuss","Perpetually unimpressed and dragging his mood into every pack he touches. Win him and he sulks; lose him and he sulks harder.","Fine. Whatever. Draw.","common"],
  [84,"The Shaded Ascendant","Ascendant","Too cool to explain where he's floating off to above the wreckage. Own him and the whole season's about to lift off.","Up and out. Don't wait up.","rare"],
];

mkdirSync(dataDir, { recursive: true });
const newSlugs = new Set(DECK.map(d => slugify(d[2])));
let done = 0, firstNewSlug = null;
for (const [num, oldName, newName, lore, omen, rarity] of DECK) {
  const oldSlug = slugify(oldName), newSlug = slugify(newName);
  const src = join(artDir, `${oldSlug}.webp`);
  if (!existsSync(src)) { console.log(`  ! missing art for ${oldSlug}`); continue; }
  mintCard({ name: newName, season: 1, number: num, of: DECK.length, fullArt: true, img: src });
  const st = statsFor(newSlug);
  writeFileSync(join(dataDir, `${newSlug}.json`), JSON.stringify({
    slug: newSlug, title: newName, lore, omen, rarity,
    atk: st.atk, def: st.def, trigger: st.trigger,
    generatedBy: 'gonzo (HST voice, curated)',
    provenance: { minted: null, mintPrice: null, lastSale: null, floor: null, battlesWon: 0, battlesLost: 0, timesWagered: 0, burnsSurvived: 0, owners: [] },
  }, null, 2));
  if (num === 1) firstNewSlug = newSlug;
  done++;
}
// remove old files whose slug is no longer used
for (const [, oldName] of DECK) {
  const oldSlug = slugify(oldName);
  if (newSlugs.has(oldSlug)) continue;
  for (const p of [join(cardsDir, `${oldSlug}.html`), join(artDir, `${oldSlug}.webp`), join(dataDir, `${oldSlug}.json`)]) {
    if (existsSync(p)) rmSync(p);
  }
}
console.log(`\n✦ gonzo pass: renamed + re-loremed ${done} cards; featured card slug = ${firstNewSlug}`);

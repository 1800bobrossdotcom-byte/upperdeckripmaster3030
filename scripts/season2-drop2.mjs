#!/usr/bin/env node
// Season 2 "Melt" — second drop (62 cards, S2 №39-100). Reads the pre-sized webp
// in scratch_new/webp2/, mints full-art flip cards with 1-2 word names + gonzo
// dossiers, per-rarity treatments, then removes the raw root PNGs.
// Mandela-tribute standouts land in PRIZM per the variety directive; the elder
// cards honor the man without lifting anything from anyone's writing.
import { readdirSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mintCard, rootDir, slugify, statsFor } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data');
const webpDir = join(rootDir, 'scratch_new', 'webp2');

// sorted list of the uploaded PNGs — index (1-based) == sheet number on newdrop.png
const pngs = readdirSync(rootDir).filter(f => f.startsWith('u9854915844_') && f.endsWith('.png')).sort();

// [sheetNum, name, rarity, lore, omen]
const DECK = [
  [1,"Rainbow Elder","mythic","He walked out of the long dark with a rainbow at his back and a frog on his ticket. The whole deck stands a little straighter when he's drawn.","The long walk ends in color.","" ],
  [2,"Old Friends","mythic","Two old souls laughing at everything the market ever did to them. Nothing beats a pair that has already survived the worst.","Laughter is the oldest hedge.",""],
  [3,"Swole Toad","uncommon","He lifted through four bear markets and never once read the chart. The gains are real; the plan never was.","Heavy is the way. Lift anyway.",""],
  [4,"Kinchui","rare","Imported from a printing the customs men still deny exists. The red carton crossed three borders and lost nothing but its instructions.","Read the label. It reads you back.",""],
  [5,"Small Counsel","uncommon","The little green advisor on his shoulder has never once been wrong, which is exactly why nobody listens. Genius travels pocket-size.","The small voice knows the number.",""],
  [6,"Candidate","rare","Red tie, firm jaw, no platform whatsoever. He is polling at a hundred percent among the doomed.","Vote early. Burn often.",""],
  [7,"Purple Scarf","rare","All feedback and velvet, he plays the market like a left-handed anthem. The scarf is load-bearing.","Turn it up past the ledger.",""],
  [8,"Greenback","rare","Engraved like legal tender and exactly as trustworthy. Fold him twice and he appreciates.","In nothing we trust. Print anyway.",""],
  [9,"Plaid Elder","common","He wore the same plaid through every crash and calls it his system. The pink pup agrees because the pup is paid to.","The pattern is the plan.",""],
  [10,"Pipe Dream","uncommon","Somewhere between the shades and the warp pipe he lost the thread and kept the smile. Every exit is an entrance somewhere worse.","Down the pipe is still forward.",""],
  [11,"Lotus Elder","uncommon","Cross-legged above the wreckage, beard to the wind, utterly unbothered. He folded before folding was a position.","Sit still. Let the market pace.",""],
  [12,"Rain Rider","uncommon","Three wheels, one storm, zero hesitation. He delivers through weather the chain itself won't touch.","Wet roads still lead home.",""],
  [13,"Free Throw","prizm","Number twenty-three at the line with the whole long game on his shoulders, calm as sunrise. He already knows it drops.","The shot was free. The freedom wasn't.",""],
  [14,"Red Fez","rare","Goggles down, fez tight, opinions holstered. He watches the smoke curl like it owes him a translation.","The smoke spells tomorrow.",""],
  [15,"Pastel Duo","common","A gentleman and his goggle-eyed familiar, dressed for an easter that never quite arrives. Soft colors, softer alibi.","Two soft hats, one hard plan.",""],
  [16,"Gold Crooner","rare","Gold jacket, gilt frame, a voice like a slow rug pull. He holds the note until the floor gives.","The last note is the exit.",""],
  [17,"Turquoise","rare","Strung with desert stones and small green passengers, he trades only at golden hour. Every ring is a season survived.","Stones remember the water.",""],
  [18,"Space Pink","uncommon","Shot into the pink somewhere past the ozone with his best pup riding shotgun. Mission control stopped asking questions.","Up is just another direction.",""],
  [19,"Mug Shots","common","Six repeat offenders, one sheet, no remorse anywhere. The precinct keeps the negatives for trading.","Everyone's guilty of holding.",""],
  [20,"Glitter Grin","uncommon","Pressed from glitter and menace in equal parts. In the right light he's the whole disco; in the wrong light, the whole bill.","Shine first. Explain never.",""],
  [21,"Red Guard","rare","Robed, armed, and serene about both. He guards a border nobody can find on any map.","Halt. Declare your bags of hope.",""],
  [22,"Laughing Elder","prizm","He laughs with the little green puppet like the whole struggle was worth it for this one joke. Maybe it was.","Joy, held up to the light.",""],
  [23,"Green Velvet","rare","A face upholstered in moss and patience, eyes like coat buttons. He has outlasted every fabric in the deck.","Soft to the touch. Hard to shake.",""],
  [24,"Nap Stack","uncommon","A whole pile of them, out cold, stacked like soft ammunition. Wake one and you wake the lot — don't.","Let sleeping stacks lie.",""],
  [25,"Pink Room","common","One small frog in one pink room on one checkered floor, thinking it over. The room has no door. He's fine with it.","The room is the whole world.",""],
  [26,"Number Nine","rare","Crystalled to the collar and holding the ninth of something nobody counts anymore. The number remembers even if he doesn't.","Nine lives, one ledger.",""],
  [27,"Cloud Collage","common","Half of him is weather now, torn and pasted back against a pink sky. He drifts, therefore he is.","Cut from clouds, glued to luck.",""],
  [28,"Mad Goggles","rare","Hair like a lightning claim, goggles like double moons. Whatever he saw through them, he bought all of it.","Look twice. Leap once.",""],
  [29,"Red Cackle","uncommon","Mid-laugh in a red suit with smoke for punctuation. The joke is the market. The market never gets it.","HA — and the candle turns.",""],
  [30,"Orange Wrap","rare","Wound head to toe in citrus bandage, curing into something rarer. Do not unwrap before the lock block.","Peel nothing before its time.",""],
  [31,"Long Carry","uncommon","He has carried the little pink one across three deserts and two crashes without complaint. Loyalty is a load-bearing habit.","Carry what carries you.",""],
  [32,"Number Five","uncommon","An orange monk holding the fifth of seven small green truths. The other two got away and he's at peace with it.","Five is enough to start.",""],
  [33,"Rainbow Gate","uncommon","A grey man and his white pup at the foot of a rainbow with a castle in it. Neither will say who built what.","The gate was always open.",""],
  [34,"Pure Joy","mythic","Head back, laughing from a place the ledger can't reach, small friends riding along. This is what winning actually looks like.","Count laughter, then coins.",""],
  [35,"Blue Idol","mythic","Carved from lapis patience and enshrined in his own arcana. Pilgrims leave burns at his feet and call it worship.","Old stone, older grin.",""],
  [36,"Parlor Scene","common","A quiet windowsill arrangement: two figures, several frogs, and an unspoken agreement. Nothing here is for sale, which makes all of it priceless.","Some rooms hold their price.",""],
  [37,"Banquet","rare","The whole renaissance crowd at one endless table, toasting nothing in particular. The bill has been outstanding for centuries.","Eat first. Reckon later.",""],
  [38,"Chrome Blank","uncommon","A card that never got its printing, all mirror and possibility. Whatever you see in it, that's yours to explain.","The blank reflects the holder.",""],
  [39,"Bronze Think","rare","Cast mid-thought and never released from it. He has been about to decide for nine hundred years.","Thinking is also a position.",""],
  [40,"Laser Stare","rare","He looked at the sky funny once and it never recovered. Now the stare is priced into everything.","Don't meet his eyes. Or do.",""],
  [41,"Royal Purple","mythic","A velvet portrait of pure regal difficulty, framed in gold and unbothered by any of it. The frame kneels; the deck follows.","Majesty needs no utility.",""],
  [42,"Orange Monk","uncommon","Robed in citrus, bearded in cloud, carrying one small green dependent. His vow of silence excludes market commentary.","Quiet outside, loud inside.",""],
  [43,"Night Elder","rare","He moves through the dark parts of the collage where the party thins out. Whoever he blesses gets one good season.","The dark keeps its favorites.",""],
  [44,"Citrus Pool","uncommon","Face-down in a pool of orange slices wearing his best shades. This is either rock bottom or the good life, and he refuses to clarify.","Float where the flavor is.",""],
  [45,"Madiba","prizm","The elder statesman of the whole deck, serene in gold, sure of the long game. Twenty-seven winters taught him what no chart can.","The long game forgives everything.",""],
  [46,"Cactus Walk","common","Out past the saguaros with two small companions and no water to speak of. The walk is the destination; the blisters are dividends.","Walk it off. All of it.",""],
  [47,"White Tux","uncommon","Pressed, spotless, and reflected twice in gold. He and the pup are dressed for a ceremony nobody scheduled.","Overdressed is on time.",""],
  [48,"Red Sparkle","rare","Caught in a rain of light in a red suit that answers back. Every sequin is a receipt.","Shine is a form of proof.",""],
  [49,"The Touch","mythic","Two hands reaching across the whole painted ceiling of the deck, one spark apart. Every mint reenacts the gap.","Almost touching is the art.",""],
  [50,"Black Tie","uncommon","Formal to the gills with a face the invitation didn't anticipate. He came for the canapés and stayed for the collapse.","RSVP yes to everything.",""],
  [51,"Crimson Robe","rare","Bearded, robed, and red as a margin call. He officiates every liquidation with terrible dignity.","The robe absorbs the losses.",""],
  [52,"Low Rider","rare","Paisley suit, red interior, three miles an hour past the wreckage. Arriving slow is still arriving.","Slow is smooth. Smooth is rare.",""],
  [53,"Peace Sign","prizm","Two fingers up in violet and orange, the oldest signal in the book thrown by the man who earned it. The pop-art frame just makes it louder.","Peace prints louder than fear.",""],
  [54,"Big Laugh","uncommon","A laugh so wide the rainbow got involved. Medically inadvisable, spiritually mandatory.","Open wide. Let the year out.",""],
  [55,"Rogue Sheet","common","Another precinct sheet of soft criminals nobody can hold. Collect all six and you owe someone an apology.","The lineup is a family photo.",""],
  [56,"Pink Prophet","uncommon","Robed in rose static, transmitting on a frequency only the doomed receive. His forecast: weird, with a chance of weirder.","The signal is pink today.",""],
  [57,"Soft Ghost","common","Barely developed, mostly suggestion, entirely gone if you blink. The gentlest thing in the whole savage deck.","Blink and I'm a rumor.",""],
  [58,"Blacklight Kid","rare","Spiked hair, bad intentions, colors that only exist after midnight. He is every poster your mother took down.","Glow now. Apologize never.",""],
  [59,"White Garden","rare","An overexposed paradise where pale creatures graze on static. One card printed straight from the other side.","Too bright to be a warning.",""],
  [60,"The Scholar","rare","Robed and haloed by pure attention, reading the one book the deck never printed. He looks up only for the close block.","The footnotes hold the doors.",""],
  [61,"Green Fuzz","common","A soft green interruption with eyes, recently woken, deeply unimpressed. He is the deck's snooze button.","Five more blocks.",""],
  [62,"Disco Wire","rare","A wireframe suit, a vapor grid, and moves rendered a decade before their time. He dances the pack open.","The grid was made for this.",""],
];

mkdirSync(dataDir, { recursive: true });
let done = 0;
DECK.forEach(([sheet, name, rarity, lore, omen]) => {
  const png = pngs[sheet - 1];
  if (!png) { console.log(`  ! no png at sheet #${sheet}`); return; }
  const src = join(webpDir, png.replace(/\.png$/i, '.webp'));
  if (!existsSync(src)) { console.log(`  ! missing webp for #${sheet}`); return; }
  const number = 38 + sheet;                       // S2 continues at №39
  const slug = slugify(name), st = statsFor(slug);
  mintCard({ name, season: 2, number, of: 100, fullArt: true, img: src, rarity,
    atk: st.atk, def: st.def, trigger: st.trigger });
  writeFileSync(join(dataDir, `${slug}.json`), JSON.stringify({
    slug, title: name, lore, omen, rarity,
    atk: st.atk, def: st.def, trigger: st.trigger,
    generatedBy: 'vision-named (art-read, curated)',
    provenance: { minted: null, mintPrice: null, lastSale: null, floor: null, battlesWon: 0, battlesLost: 0, timesWagered: 0, burnsSurvived: 0, owners: [] },
  }, null, 2));
  done++;
});

for (const png of pngs) { const p = join(rootDir, png); if (existsSync(p)) rmSync(p); }
console.log(`\n✦ Season 2 drop 2: minted ${done} cards (S2 №39-100); removed raw uploads`);

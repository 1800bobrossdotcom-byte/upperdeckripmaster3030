#!/usr/bin/env node
/* ripmaster3030studios — CARDS 34–100, THE FIELD.   npm run field
 *
 *     node scripts/build-field-deck.mjs            # dry run, prints the set
 *     node scripts/build-field-deck.mjs --apply    # writes cards/field-deck.json
 *
 * Artist, 2026-08-04: *"lets create cards 34-100."* Model v2.2's deck is 100: **33 hero 1/1s**
 * (minted) + **67 render-only field lenses** + Lovebeing. This builds the 67.
 *
 * ⚑ A CARD IS A SEED, NOT A FILE. `js/hero-card.js` turns a seed into a specific, permanent card —
 *   its three pigment sources, its composition, its impression, its creases. So the whole field is
 *   67 numbers and 67 names, and there is nothing to re-render when the deck's pigment changes
 *   under it (task #71). ⚠ The seed is derived from the CARD NUMBER and must never be re-derived a
 *   different way: card 47 is a particular card, and changing the formula silently replaces the
 *   artwork of a card that may already have been shown to somebody.
 *
 * ⛔ THE NAMES ARE PLACEHOLDERS AND SAY SO IN THE FILE. `docs/HERO-33-BRIEF.md` §6 is explicit that
 *   naming is authorship, not generation, and that applies here as much as to the 33. What is
 *   generated is a SYSTEM: every name below is a real term from the printing trade — a press
 *   fault, a typesetter's furniture, a bindery operation. That way the set reads as one object and
 *   is obviously provisional at the same time, which a batch of invented meme names would not be.
 * ⚑ AND A RENAME IS A STRING EDIT. The type is composed in the browser from `cards/type/
 *   alphabet.json`, so changing a name here needs no rebuild, no font and no new asset — which is
 *   the difference between a placeholder and a placeholder that becomes permanent by friction.
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const OUT = join(ROOT, 'cards', 'field-deck.json');

const FIRST = 34, LAST = 100;                       // 1–33 are the hero 1/1s; 34–100 are the field

/* The press's own vocabulary — 67 terms, every one real. A HICKEY is the doughnut a speck of dirt
 * leaves in a solid; SLUR is the smear from the sheet moving under the blanket; a QUOIN is the
 * wedge that locks a forme; PIED type is type that has been dropped. Nothing here is invented and
 * nothing here is a claim on the artist's names. */
const NAMES = [
  'HICKEY', 'SLUR', 'DOUBLING', 'GHOSTING', 'SET-OFF', 'PICKING', 'MOTTLE', 'SCUMMING',
  'TRAPPING', 'FEATHERING', 'CHOKE', 'SPREAD', 'MOIRE', 'BANDING', 'STARVATION', 'DOT GAIN',
  'CREEP', 'GRIPPER', 'KISS IMPRESSION', 'MAKEREADY', 'OVERPRINT', 'KNOCKOUT', 'OUT OF REGISTER',
  'TRIM MARK', 'FULL BLEED', 'SIGNATURE', 'GUTTER', 'IMPOSITION', 'SLUG', 'QUAD', 'KERN',
  'LIGATURE', 'WRONG FOUNT', 'PIED TYPE', 'FURNITURE', 'CHASE', 'QUOIN', 'GALLEY', 'EM DASH',
  'WIDOW', 'ORPHAN', 'RIVER', 'BEARD', 'SHOULDER', 'COUNTER', 'SERIF', 'ASCENDER', 'DESCENDER',
  'BASELINE', 'LEADING', 'PLATEN', 'TYMPAN', 'FRISKET', 'ROLLER TRAIN', 'FOUNTAIN', 'DUCTOR',
  'BLANKET', 'DAMPENER', 'DELIVERY', 'FEEDER', 'PERFECTOR', 'WEB BREAK', 'FOLIO', 'DECKLE',
  'GRAIN LONG', 'COCKLE', 'SHORT SHEET',
];

/* ⛔ RARITY DRIVES THE FRAME — artist, 2026-08-04: "separate frames by card rarity type - have
 * frame also change / glow etc." A printer's border is set from repeated pieces of TYPE (border
 * sorts, printers' flowers), so the rarity picks the FAMILY of sorts and the seed picks the
 * specific frame inside it: every card has its own border, and a collector can read the tier off
 * the edge without being told. The ladder is the deck's own, unchanged.
 * ⚠ THE PYRAMID IS DELIBERATE and it is the only economics in this file: 67 field cards are
 *   render-only lenses, so rarity here is a LOOK, not a supply claim. */
const LADDER = [
  ['common', 24], ['uncommon', 16], ['rare', 12], ['epic', 8], ['legendary', 5], ['mythic', 2],
];
const RARITY = LADDER.flatMap(([r, k]) => Array(k).fill(r));

const N = LAST - FIRST + 1;
if (RARITY.length !== N) {
  console.error(`⛔ the rarity pyramid totals ${RARITY.length}, not ${N}.`);
  process.exit(1);
}
if (NAMES.length !== N) {
  console.error(`⛔ ${NAMES.length} names for ${N} cards (${FIRST}–${LAST}) — the two must agree.`);
  process.exit(1);
}
if (new Set(NAMES).size !== NAMES.length) {
  console.error('⛔ duplicate name — every card is its own card.');
  process.exit(1);
}

/* ⚠ THE SEED FORMULA IS PART OF THE ARTWORK. Card n renders whatever this returns, permanently.
 * A large odd multiplier keeps neighbouring cards far apart in the generator's state so 34 and 35
 * are not near-identical pictures — which a small stride would produce and which would read as a
 * broken generator rather than as a set. */
const seedFor = n => ((n * 2654435761) ^ 0x33033030) >>> 0;

const deck = {
  v: 1,
  range: [FIRST, LAST],
  count: N,
  namesArePlaceholders: true,
  note: 'Cards 34–100, the render-only field lenses of model v2.2. A card is a SEED — see ' +
        'scripts/build-field-deck.mjs. ⛔ THE NAMES ARE PLACEHOLDERS drawn from the printing ' +
        'trade (press faults, typesetting furniture, bindery terms); naming is the artist’s, ' +
        'per docs/HERO-33-BRIEF.md §6. Editing a name here is the whole change — the type is ' +
        'composed in the browser from cards/type/alphabet.json, so there is nothing to rebuild.',
  ladder: LADDER.map(([r, k]) => ({ rarity: r, count: k })),
  cards: Array.from({ length: N }, (_, i) => ({
    n: FIRST + i,
    name: NAMES[i],
    /* ⚠ INTERLEAVED, not blocked. Walking 34→100 through a solid run of 24 commons and then a
     * solid run of 16 uncommons reads as a spreadsheet; dealing them out means the field looks
     * like a field. Deterministic — the stride is coprime with 67, so it is a permutation. */
    rarity: RARITY[(i * 29) % N],
    seed: seedFor(FIRST + i),
  })),
};

const json = JSON.stringify(deck, null, 1) + '\n';
if (APPLY) {
  writeFileSync(OUT, json);
  console.log(`  ok   cards/field-deck.json — ${N} cards, ${FIRST}–${LAST}`);
} else {
  const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === json;
  console.log(`  DRY RUN — ${N} cards, ${FIRST}–${LAST}` + (same ? ' (on disk and identical)' : ''));
  for (const c of deck.cards.slice(0, 6)) console.log(`       ${c.n}  ${c.name.padEnd(18)} seed ${c.seed}`);
  console.log(`       …  ${deck.cards.at(-1).n}  ${deck.cards.at(-1).name}`);
  console.log('       pass --apply to write it');
}

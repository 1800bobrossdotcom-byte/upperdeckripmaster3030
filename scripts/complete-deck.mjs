#!/usr/bin/env node
/* ripmaster3030studios — FINISH THE HUNDRED.  `npm run deck:complete`
 *
 * The artist forged 73 of the 100 in `cards/proof.html` and asked for the remainder
 * (2026-08-06: *"here is the current deck — i need you to create the remainder as I don't have
 * time, then deck will be complete"*). This fills the 27 empty slots: heroes 23–25 and 30–33,
 * field 61–73 and 94–100.
 *
 * ⛔ IT ONLY EVER ADDS. A number already in the input is copied through byte-identical and is
 *   asserted to be unchanged on the way out. This is the `restyle-backs.mjs` rule — a generator
 *   left armed is the source of a surface, and the one failure mode that would actually cost
 *   something here is silently reprinting a card the artist already finished.
 *
 * ⚑ THE ARTIST WORKS IN SEEDED RUNS, AND THAT IS THE WHOLE DESIGN OF THIS SCRIPT. Reading his 73:
 *   seed 57916 carries 22 cards, 52053 / 55980 / 80609 carry 11 each. Inside a run the DIALS ARE
 *   HELD and only the plates, the name and the rarity move — cards 59 and 60 are the same dial
 *   block twice with different pictures on it. So each new card INHERITS a real anchor card's
 *   dials rather than drawing 12 numbers out of a range, which is the difference between a set
 *   and a batch. Every new card also reuses a seed already in his deck, so the press failure
 *   (which is seeded) has the same character as its neighbours.
 *
 * ⚑ PLATES FAVOUR WHAT HE HAS NOT USED. The 73 touch 169 of the 211 sources; 42 are untouched.
 *   Picking from the cold end first means the finished hundred covers more of the deck it is
 *   remixing, instead of the new cards landing on the same pictures as the old ones.
 *
 * ⚠ NAMES ARE THE ARTIST'S. These are written in his own register — typographic marks, lowercase
 *   interjections, all-caps declaratives — because a deck with 27 blanks is not "complete". They
 *   are the first thing he should overrule. ⛔ NO REAL PEOPLE: he names cards after artists he
 *   admires (two of the 73 are real names) and that is a call only he can make.
 *
 * Deterministic: no Math.random, no Date. Same input -> byte-identical output.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IN  = process.argv[2] || join(ROOT, 'cards/deck.json');
const OUT = process.argv[3] || IN;

/* ── the pigment pool, read the way cards/proof.html reads it ──────────────────────────────── */
const manifest = (f) => {
  const p = join(ROOT, 'cards', f);
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  const rows = Array.isArray(raw) ? raw : (raw.cards || []);
  return rows.filter(c => c && c.art).map(c => ({
    key: String(c.art).replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, ''),
  }));
};
const POOL = manifest('manifest.json').concat(manifest('hero-manifest.json'));
const KEYS = new Set(POOL.map(p => p.key));
if (!POOL.length) { console.error('✗ no pigment pool — manifests missing'); process.exit(1); }

/* ── the input deck ───────────────────────────────────────────────────────────────────────── */
const deck = JSON.parse(readFileSync(IN, 'utf8'));
const cards = deck.cards || {};
const before = JSON.stringify(cards);

/* Plate usage across what he already made — cold plates get picked first. */
const usage = new Map(POOL.map(p => [p.key, 0]));
for (const c of Object.values(cards)) {
  const q = new URLSearchParams(c.q);
  for (const k of ['g', 'm', 'f', 'w', 's', 'i']) {
    const v = q.get(k);
    if (usage.has(v)) usage.set(v, usage.get(v) + 1);
  }
}
/* Coldest first, ties broken by pool order so the result is stable. */
const order = POOL.map((p, i) => ({ key: p.key, n: usage.get(p.key), i }))
  .sort((a, b) => a.n - b.n || a.i - b.i).map(p => p.key);
let cold = 0;
const sixPlates = () => {
  const out = [];
  while (out.length < 6) {
    const k = order[cold++ % order.length];
    if (!out.includes(k)) out.push(k);
  }
  return out;
};

/* ── the runs ─────────────────────────────────────────────────────────────────────────────────
 * Each block inherits the dial set of a real card of his (`from`), keeps that card's seed, and
 * walks the numbers it is responsible for. `tweak` is the small per-card variation he applies
 * inside a run — never a redraw, just one or two dials moved. */
const RUNS = [
  { from: '22', nums: [23, 24, 25] },                       // heroes, after his 22
  { from: '29', nums: [30, 31] },                           // heroes, continuing 27–29
  { from: '26', nums: [32, 33] },                           // heroes, continuing 26
  { from: '60', nums: [61, 62, 63, 64, 65, 66] },           // field, continuing 59–60
  { from: '58', nums: [67, 68, 69, 70, 71, 72, 73] },       // field, continuing 58
  { from: '93', nums: [94, 95, 96, 97, 98, 99, 100] },      // field, continuing 90–93
];

/* ⚠ HIS REGISTER, NOT MINE. Typographic marks, lowercase asides, all-caps declaratives — the
 *   three families his 73 actually use. No real people, no places tied to a person. */
const NAME = {
  23: 'SOFT OPENING',  24: 'NO TAKEBACKS', 25: '>>>>>>',
  30: 'MERCY RULE',    31: 'WHOLE THING',  32: ';;;;;;;;',      33: 'LAST ONE OUT',
  61: 'spare parts',   62: '~~~~~~',       63: 'HOT GLUE',      64: 'same',
  65: '((((o))))',     66: 'NIGHT SHIFT',
  67: 'ok fine',       68: '^^^^^^',       69: 'PAPER CUT',     70: 'weather',
  71: '!!?!!?!!',      72: 'SLOW CLAP',    73: 'bit much',
  94: 'CLOSING TIME',  95: '. . . . . .',  96: 'hush',          97: 'TALL BOY',
  98: '[[[   ]]]',     99: 'almost',      100: 'THE HUNDRED',
};

/* Rarity, matching the mix of the 73 (mostly mythic/legendary, a thin tail for texture). */
const RARITY = {
  23: 'mythic', 24: 'legendary', 25: 'mythic', 30: 'legendary', 31: 'mythic',
  32: 'legendary', 33: 'mythic',
  61: 'mythic', 62: 'legendary', 63: 'uncommon', 64: 'legendary', 65: 'mythic',
  66: 'legendary', 67: 'legendary', 68: 'mythic', 69: 'epic', 70: 'legendary',
  71: 'mythic', 72: 'legendary', 73: 'common',
  94: 'legendary', 95: 'mythic', 96: 'uncommon', 97: 'legendary', 98: 'mythic',
  99: 'epic', 100: 'mythic',
};

/* The one or two dials that move inside a run — his own habit (44 lifts `stack` off 43's value,
 * 45 lifts `reg`). Keyed by card so the output is reproducible and reviewable. */
const TWEAK = {
  24: { stack: '1.15' }, 25: { reg: '2.42' },
  31: { per: '13' },     33: { stack: '1.72' },
  62: { reg: '0.84' },   64: { stack: '0.55' }, 66: { per: '13.5' },
  69: { stack: '0' },    71: { reg: '1.43' },   73: { press: '0.38' },
  95: { stack: '2.5' },  97: { reg: '0.84' },  100: { stack: '1.12', per: '2' },
};

/* ── build ────────────────────────────────────────────────────────────────────────────────── */
const added = [];
for (const run of RUNS) {
  const anchor = cards[run.from];
  if (!anchor) { console.error(`✗ anchor ${run.from} missing from the input deck`); process.exit(1); }
  for (const n of run.nums) {
    if (cards[String(n)]) continue;                 // never overwrite the artist's work
    const q = new URLSearchParams(anchor.q);
    const plates = sixPlates();
    ['g', 'm', 'f', 'w', 's', 'i'].forEach((k, idx) => q.set(k, plates[idx]));
    q.set('name', NAME[n]);
    q.delete('sub');                                // the anchor's subtitle is its own card's
    q.set('rarity', RARITY[n]);
    for (const [k, v] of Object.entries(TWEAK[n] || {})) q.set(k, v);
    q.set('n', String(n));

    /* Rebuild in the artist's own key order so a diff against his records reads cleanly. */
    const ORDER = ['seed', 'g', 'm', 'f', 'w', 's', 'i', 'name', 'sub', 'rarity', 'burn', 'price',
      'dep', 'reg', 'rad', 'stack', 'press', 'scr', 'spr', 'srate', 'per', 'light', 'spin', 'env',
      'frame', 'marks', 'inks', 'loop', 'pigs', 'mot', 'n'];
    const parts = [];
    for (const k of ORDER) if (q.has(k)) parts.push(k + '=' + encodeURIComponent(q.get(k)).replace(/%20/g, '+'));
    for (const [k] of q) if (!ORDER.includes(k)) parts.push(k + '=' + encodeURIComponent(q.get(k)).replace(/%20/g, '+'));

    cards[String(n)] = {
      q: parts.join('&'),
      name: NAME[n],
      rarity: RARITY[n],
      band: n <= 33 ? 'hero' : 'field',
      seed: anchor.seed,
    };
    added.push(n);
  }
}

/* ── assertions, before anything is written ───────────────────────────────────────────────── */
let bad = 0;
const fail = (m) => { console.error('  ✗ ' + m); bad++; };

/* 1 · nothing the artist made was touched */
const kept = JSON.parse(before);
for (const [n, c] of Object.entries(kept)) {
  if (JSON.stringify(cards[n]) !== JSON.stringify(c)) fail(`card ${n} was MODIFIED — this script may only add`);
}
/* 2 · the deck is complete and has no strays */
for (let i = 1; i <= 100; i++) if (!cards[String(i)]) fail(`card ${i} still missing`);
for (const n of Object.keys(cards)) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > 100) fail(`stray slot ${n}`);
}
/* 3 · every new card's plates exist in the pool, and are six distinct pictures */
for (const n of added) {
  const q = new URLSearchParams(cards[String(n)].q);
  const p = ['g', 'm', 'f', 'w', 's', 'i'].map(k => q.get(k));
  if (p.some(v => !KEYS.has(v))) fail(`card ${n} names a plate that is not in the pool: ${p.join(',')}`);
  if (new Set(p).size !== 6) fail(`card ${n} repeats a plate`);
  if (q.get('n') !== String(n)) fail(`card ${n} carries n=${q.get('n')}`);
  if (!q.get('name')) fail(`card ${n} has no name`);
  const band = cards[String(n)].band;
  if (band !== (n <= 33 ? 'hero' : 'field')) fail(`card ${n} band is ${band}`);
}
/* 4 · vocabularies — a value the press does not know is a dial that silently does nothing */
const LOOPS = ['boil', 'ascii', 'aperture', 'swarm', 'ripple', 'rain'];
const MOTS = ['impression', 'roller', 'slur', 'doubling', 'flutter', 'dry-down', 'makeready', 'feed'];
const RARS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
for (const n of added) {
  const q = new URLSearchParams(cards[String(n)].q);
  if (q.has('loop') && !LOOPS.includes(q.get('loop'))) fail(`card ${n} loop=${q.get('loop')}`);
  if (q.has('mot') && !MOTS.includes(q.get('mot'))) fail(`card ${n} mot=${q.get('mot')}`);
  if (!RARS.includes(q.get('rarity'))) fail(`card ${n} rarity=${q.get('rarity')}`);
  if (q.has('pigs') && !['1', '3', '6'].includes(q.get('pigs'))) fail(`card ${n} pigs=${q.get('pigs')}`);
}
/* 5 · names are unique across the whole hundred — two cards with one name is a deck you
 *     cannot talk about. (Blank/underscore placeholders of his are exempt; they are his.) */
const seen = new Map();
for (const [n, c] of Object.entries(cards)) {
  const nm = String(c.name || '');
  if (!nm || /^[_\s]*$/.test(nm)) continue;
  if (seen.has(nm) && added.includes(Number(n))) fail(`card ${n} reuses the name "${nm}" (card ${seen.get(nm)})`);
  if (!seen.has(nm)) seen.set(nm, n);
}

if (bad) { console.error(`\n✗ ${bad} problem(s) — nothing written`); process.exit(1); }

deck.count = Object.keys(cards).length;
deck.cards = cards;
writeFileSync(OUT, JSON.stringify(deck, null, 2) + '\n');

const heroes = Object.values(cards).filter(c => c.band === 'hero').length;
console.log(`✦ added ${added.length}: ${added.join(', ')}`);
console.log(`  ${deck.count} of 100 · ${heroes}/33 heroes · ${deck.count - heroes}/67 field`);
console.log(`  plates now covering ${new Set([...Object.values(cards)].flatMap(c => {
  const q = new URLSearchParams(c.q);
  return ['g', 'm', 'f', 'w', 's', 'i'].map(k => q.get(k)).filter(Boolean);
})).size} of ${POOL.length} sources`);
console.log(`→ ${OUT}`);

/* ripmaster3030studios — THE VITALS OF ONE OF THE HUNDRED.   `CardStats`
 *
 *   CardStats.of({id, seed, rarity, title, band}) -> {atk, def, sum, trigger, edition, debut, why}
 *
 * Artist, 2026-08-06: *"make sure all cards named have backs of cards with stats - not seeing
 * those."* The back is the side that TELLS — this project's own first principle about the form is
 * *"a front that shows, a back that tells"* — and it had nothing to tell, because the hundred
 * carry no vitals at all: `cards/deck.json` is {q, name, rarity, band, seed} and
 * `cards/deck-manifest.json` is {id, slug, art, title, rarity, band}. No ATK, no DEF, no
 * amplifier. The 196 placeholders have all of it hand-written; the hundred were generated and
 * nobody ever wrote theirs.
 *
 * ⛔ SO THEY ARE DERIVED FROM THE SEED, NOT INVENTED PER CALL, AND THAT DISTINCTION IS THE WHOLE
 *   FILE. `js/card-press.js` states the rule the deck already lives by: *"the seed must be a
 *   function of the card and of nothing else"* — not its index in a manifest, not the time, not a
 *   counter. A card's vitals are part of what it IS, so they have to come back identical on every
 *   machine, in every viewer, after every rebuild. `Math.random` appears nowhere here, which is
 *   what makes a card's ATK the same number for a collector as it is for the artist.
 * ⚠ THEY ARE PLACEHOLDER VITALS AND THE BACK SAYS SO. The names on 67 of the hundred are openly
 *   provisional (`cards/field-deck.json` carries `namesArePlaceholders: true`) and these numbers
 *   are the same kind of thing: real, stable, and the artist's to overwrite. The moment a card
 *   gets authored vitals, they win — `of()` returns anything already on the card untouched.
 *
 * ⚑ RARITY IS THE ONLY INPUT THAT IS NOT THE SEED, and it is authored. A mythic should not roll
 *   the same spread as a common, or the rarity on the front is decoration. It moves the BUDGET,
 *   and the seed decides how that budget is split between attack and defence — so two mythics
 *   differ from each other while both outclass a common.
 */
(function (global) {
  'use strict';

  /* mulberry32 — the same shape of small deterministic PRNG the press uses, so a seed behaves
   * here the way it behaves everywhere else in the deck. */
  function rng(seed) {
    var a = (seed >>> 0) || 3030;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* The budget a card of each tier gets to spend across ATK and DEF. Ordered, and it is the
   * ORDER that carries the meaning — the exact numbers are a first pass and are the artist's. */
  var BUDGET = {
    common:    [6, 9],
    uncommon:  [8, 12],
    rare:      [10, 14],
    epic:      [12, 17],
    legendary: [15, 20],
    mythic:    [18, 24],
    prizm:     [20, 26],
  };

  /* ⚠ THE AMPLIFIER IS A NAME, NOT A NUMBER, so it must not read as one of the 196's. These are
   * printing-trade and press terms, the same register `cards/field-deck.json` names the field
   * cards in, so the set reads as one object. */
  var TRIGGERS = [
    'DOUBLE STRIKE', 'DEAD PULL', 'HICKEY', 'SLUR', 'OVERPRINT', 'TRAP', 'CHOKE', 'SPREAD',
    'MOIRÉ', 'GHOSTING', 'SET-OFF', 'PICKING', 'FOUNTAIN SOLUTION', 'MAKEREADY', 'REGISTER',
    'KNOCKOUT', 'BLEED', 'CREEP', 'DOT GAIN', 'SCUMMING',
  ];

  function of(card) {
    card = card || {};
    var seed = Number(card.seed);
    if (!isFinite(seed)) seed = 3030;
    /* ⛔ THE DECK'S SEEDS ARE NOT UNIQUE, SO THE SEED ALONE CANNOT IDENTIFY A CARD. Measured on
     *   `cards/deck.json`: **14 distinct seeds across the hundred**, and cards 1–7 all carry
     *   `seed=57916`. Keying the vitals on the seed by itself therefore handed seven different
     *   cards the SAME ATK, the SAME DEF and the SAME trigger — which was already live on their
     *   backs. It is the failure this file's own note is trying to prevent one level up ("two
     *   mythics" are supposed to differ); the guard was written against the rarity budget and the
     *   collision came from the input.
     * ⚑ THE ID IS MIXED IN, NOT SUBSTITUTED FOR THE SEED, and that ordering is the whole fix. The
     *   seed still decides the character of the roll, so a card whose recipe changes still gets
     *   new vitals; the id only guarantees that two cards can never BE the same roll. `id` is
     *   authored, stable and unique by construction — it is the card's number in the set.
     * ⚠ NOT THE SLUG AND NOT THE INDEX. The slug is a string the artist may rename, and an index
     *   into a manifest moves the moment the deck is re-sorted — either would make a card's
     *   vitals change without the card changing, which is the property this file exists to hold.
     * ⚠ Deterministic as before: no clock, no entropy, same numbers on every machine. This is a
     *   one-time reshuffle of PLACEHOLDER vitals (the file says so below), not a live balance
     *   change — and authored atk/def still win outright. */
    var id = Number(card.id);
    if (!isFinite(id)) id = 0;
    var r = rng((((seed ^ 0x5BD1E995) >>> 0) + id * 0x9E3779B1) >>> 0);
    var tier = String(card.rarity || 'common').toLowerCase();
    var b = BUDGET[tier] || BUDGET.common;
    var total = b[0] + Math.floor(r() * (b[1] - b[0] + 1));
    /* ⚠ SPLIT, NEVER TWO INDEPENDENT ROLLS. Rolling ATK and DEF separately lets a common land
     *   above a mythic on both, which makes the tier meaningless in exactly the case anyone
     *   would notice. The split is bounded so nothing comes out as 0 — a card with 0 ATK reads
     *   as broken data rather than as a defensive card. */
    var lo = Math.max(1, Math.round(total * 0.25));
    var atk = lo + Math.floor(r() * Math.max(1, (total - lo * 2) + 1));
    var def = Math.max(1, total - atk);

    return {
      /* anything AUTHORED on the card wins outright — the day these are written by hand, this
       * file stops deciding and starts deferring */
      atk: card.atk != null ? card.atk : atk,
      def: card.def != null ? card.def : def,
      sum: (card.atk != null ? card.atk : atk) + (card.def != null ? card.def : def),
      trigger: card.trigger || TRIGGERS[Math.floor(r() * TRIGGERS.length)],
      rarity: tier,
      /* ⛔ "№ n / 100", NOT the 196's "№1 / 84". The hundred ARE the set; the edition line is the
       *   one place a back says what a card is INSIDE a set, so a wrong denominator there is a
       *   factual claim about the deck's size. */
      edition: (card.id != null ? '№ ' + card.id : '—') + ' / 100',
      /* ⛔ NO SEASON. `Debut: Summer · S1` is on all 196 backs and seasons are DEAD — the schedule
       *   is TIERED (artist, 2026-08-01), and a tier opens when the one before it sells out. A
       *   back that says "Summer" makes a promise about time that nothing else in the project
       *   makes any more. The genesis set is what the 33 are; the field is the field. */
      debut: card.band === 'hero' ? 'Genesis · hero 1/1' : 'Genesis · field lens',
      why: card.band === 'hero'
        ? 'Minted 1/1 — auction, pack or earned.'
        : 'Render-only — the contract draws this one without any mint.',
      placeholder: card.atk == null,
    };
  }

  global.CardStats = { of: of, BUDGET: BUDGET, TRIGGERS: TRIGGERS };
})(window);

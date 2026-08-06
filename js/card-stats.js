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
    var r = rng(seed ^ 0x5BD1E995);
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

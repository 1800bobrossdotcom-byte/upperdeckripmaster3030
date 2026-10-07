/* ripmaster3030studios — ONE PLACE THAT LOADS THE HUNDRED.   `RipDeck`
 *
 *   RipDeck.load(base)  -> Promise<card[]>   never rejects; [] on any failure
 *   RipDeck.legacy(base)-> Promise<card[]>   the retired 196, for resolving old saves ONLY
 *
 * ══ ⛔ WHY THIS EXISTS: THE DECK IS THREE FILES AND EVERY CONSUMER WAS JOINING TWO OF THEM ═══
 * The artist, on the live site: *"these are all old cards?"* They were. `cards/market.html`
 * fetched `cards/manifest.json`, and `cards/deck.html`'s own header states the rule outright:
 *
 *     cards/deck.json           the hundred, as press recipes (the master) — carries the SEED
 *     cards/deck-manifest.json  the hundred, as baked sheets — carries art/title/rarity/band
 *     cards/manifest.json       the ink. Not cards. Do not present it as cards.
 *
 * ⛔ AND A CARD IS NOT COMPLETE FROM EITHER FILE ALONE. The manifest has no vitals; the recipe
 *   has no art path. `js/card-stats.js` derives ATK/DEF/trigger — but **from the card's SEED**,
 *   and `of()` falls back to 3030 when the seed is missing, which does not error and does not
 *   look wrong: it hands back the SAME numbers for every card in a rarity tier. A deck where
 *   every mythic has identical stats is the exact shape of bug this repo keeps paying for —
 *   plausible, silent, and only visible if you compare two cards. So the seed is joined here,
 *   once, rather than in each of the four places that need a card.
 *
 * ⚑ THE ALTERNATIVE WAS FOUR COPIES OF A THREE-SOURCE JOIN. This file's own history is the
 *   argument: `market.html`, `battle.html` and `cabinet.html` each hand-rolled a one-source load
 *   and all three drifted onto the wrong source. One loader cannot half-drift.
 *
 * ⚠ FAILS OPEN AT EVERY STEP, and the caller must treat [] as "no deck", never as "no cards".
 *   A missing deck.json costs the VITALS and nothing else — the cards still come back with art,
 *   title, rarity and band, because a bench that shows your cards without stats beats a bench
 *   that shows nothing. A missing deck-manifest returns [].
 * ⚠ `href` FROM THE MANIFEST IS DELIBERATELY NOT PASSED THROUGH. It says `card.html?n=N` and
 *   THAT PAGE DOES NOT EXIST — `deck.html` opens one of the hundred in an in-page viewer, so it
 *   never needed a per-card URL and nothing ever read the field. Following it puts a 404 behind
 *   a "view card" link. Dead data in a shipped JSON is a stale comment that survived review.
 */
(function (global) {
  'use strict';

  var _hundred = null, _legacy = null;          // memoised promises, not results

  function j(base, file) {
    return fetch((base || '') + file)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* The recipe query strings are `seed=57916&g=…`. CardRecipe.parse() is the real parser and it
   * is what the press uses — but it is not loaded on every page that wants a card's stats, and
   * pulling a whole press module in to read one integer would be the wrong dependency. The seed
   * is the one field needed here, so it is read directly and the parser stays the press's. */
  function seedOf(rec) {
    if (!rec) return null;
    var q = typeof rec === 'string' ? rec : rec.q;
    if (!q) return null;
    var m = /(?:^|[?&])seed=(\d+)/.exec(String(q));
    return m ? Number(m[1]) : null;
  }

  /* ⚠ `base` IS RELATIVE TO THE CALLING PAGE, AND THAT BIT EVERY CABINET AT ONCE. `cards/*.html`
   *   pass '' because the manifests sit beside them; a page at the ROOT (dogfight, section9,
   *   cloudracer, riprocketer, ronin) must pass 'cards/' or the fetch 404s into the catch below
   *   and the deck comes back EMPTY — which surfaces as "deck manifest missing" or "no cards yet"
   *   on a player who has a full folder. Copying battle.html's call verbatim to a root page is
   *   exactly how that happened. */
  function load(base) {
    if (_hundred) return _hundred;
    _hundred = Promise.all([j(base, 'deck-manifest.json'), j(base, 'deck.json')])
      .then(function (r) {
        var m = r[0], recipes = r[1];
        var cards = (m && (m.cards || m)) || [];
        if (!Array.isArray(cards) || !cards.length) return [];
        var byId = (recipes && (recipes.cards || recipes)) || null;
        return cards.map(function (c) {
          var seed = byId ? seedOf(byId[String(c.id)]) : null;
          /* ⚠ The seed is spread onto the card BEFORE CardStats sees it, and `of()` defers to any
           *   authored atk/def/trigger — so the day the artist writes real vitals they win. */
          var card = { id: c.id, slug: c.slug, art: c.art, title: c.title,
                       rarity: c.rarity, band: c.band };
          if (seed != null) card.seed = seed;
          var s = global.CardStats ? global.CardStats.of(card) : null;
          if (s) { card.atk = s.atk; card.def = s.def; card.trigger = s.trigger;
                   card.edition = s.edition; card.debut = s.debut; }
          return card;
        });
      })
      .catch(function () { return []; });
    return _hundred;
  }

  /* ⛔ THE RETIRED 196, AND THIS IS THE ONLY LEGITIMATE USE FOR THEM. A vault entry saved before
   *   the deck changed carries a WORD slug (`blue-boar`); the hundred are numbered. Loading the
   *   old set purely to resolve those saves is what stops a collector's shelf emptying itself —
   *   the standing rule here is that the `urm_*` keys are never wiped. It must never be rendered
   *   as available stock, and no caller should present it as "the cards". */
  function legacy(base) {
    if (_legacy) return _legacy;
    _legacy = j(base, 'manifest.json').then(function (m) {
      return (m && (m.cards || m)) || [];
    }).catch(function () { return []; });
    return _legacy;
  }

  global.RipDeck = { load: load, legacy: legacy, _seedOf: seedOf };
})(typeof window !== 'undefined' ? window : this);

/* THE PULL — the rules, and nothing else (PullGame).
 *
 * A roguelike deckbuilder made out of this studio's own deck. Artist, 2026-08-07, after we walked
 * the most-played games ever: "lets try it."
 *
 * ⚑ WHY THIS GENRE AND NOT A BATTLE ROYALE. It is the only one where owning a hundred cards IS the
 *   game rather than a stat line — and it is the only cabinet here that works with nobody else
 *   online, offline, on a phone, in sixty seconds. The six existing games are all action games
 *   needing WebGL 2 and two thumbs.
 *
 * ⛔ THE ANTI-CASINO POSITION IS THE MECHANIC, NOT A DISCLAIMER. This is dressed as a table game —
 *    antes, a house, a payout counter — and it pays NOTHING. The prize is the number and the story
 *    about the ante where it went wrong. That is the artist's stated Dadaist turn ("sometimes the
 *    thing you win is the experience itself") expressed as a rule set rather than as copy.
 *
 * ⛔ AND IT MUST NEVER BE PAY-TO-WIN, WHICH IS A STRUCTURE AND NOT A DIAL. Your collection widens
 *    the DRAFT POOL — cards you own can be offered — and never raises a number. A bigger binder is
 *    more variety, not more power. `docs/HERO-UNLOCKS.md` rule 2 already forbids money reaching the
 *    earned tier; a deckbuilder whose starting deck scales with a wallet would walk straight into
 *    it, so the rule is enforced where it cannot be tuned away: chips come from RARITY, and rarity
 *    is a property of the card, not of how many you have.
 *
 * ⛔ NO HERO EVER ENTERS A RUN. Ids 1-33 are 1/1s — auctioned, gacha or earned — and `battle.html`
 *    has already paid for the version of this mistake where the house staked them. `stock()` is the
 *    67 field cards and there is one definition of it.
 *
 * ⚑ PURE AND SEEDED: no DOM, no engine, no clock. Same seed + same inputs = byte-identical run, so
 *   `npm run test:pull` can play thousands of games under node against the SHIPPING rules and
 *   measure whether the antes are actually beatable — the same thing `test:crstreak` does for the
 *   streak. A balance claim nobody measured is a balance claim that is wrong.
 */
(function (root) {
  'use strict';

  // ── the table ────────────────────────────────────────────────────────────────────────────────
  const HAND = 8;              // cards drawn to hand
  const PLAYS = 4;             // pulls per ante
  const TOSSES = 3;            // discards per ante
  const SET_MAX = 5;           // most cards in one pull
  const RULES_MAX = 5;         // house rules you can hold
  const DECK_SIZE = 24;        // the run deck you start with
  /* ⚑ THE LADDER IS MEASURED, AND IT HAS BEEN RE-MEASURED EVERY TIME THE RULES MOVED — THREE TIMES.
   * A bot plays the best available pull perfectly and drafts BLINDLY (first rule offered, so it has
   * no build skill at all), 400 runs per cell:
   *
   *   pass                                   this ladder   result
   *   1 · chips from rarity                  200..58000    16.3%   deaths peak ante 6
   *   2 · chips from ATK+DEF (3x stronger)   200..58000    49.5%   ← the SAME ladder, now trivial
   *   3 · only the matching subset scores    200..58000    22.8%   deaths peak 6-7, 91 reach 8 ✓
   *   3 · the raised ladder from pass 2      300..95000     9.8%   too hard once shovelling died
   *
   * ⛔ EVERY ONE OF THOSE ROWS IS THE SAME NUMBERS MEASURING A DIFFERENT GAME. A balance figure is a
   *    claim about a system and it EXPIRES the moment the system moves — pass 2 would have shipped a
   *    ladder tuned for scoring that no longer existed, and nothing would have said so.
   * ⚠ 22.8% is the FLOOR, not the expectation: the bot cannot draft, and drafting is the skill. */
  const ANTES = [200, 500, 1150, 2600, 5800, 12500, 27000, 58000];

  /* ⛔ CHIPS COME FROM THE CARD'S OWN VITALS, AND THE FIRST VERSION USED RARITY AND WAS WRONG.
   * Measured on the real field deck (67 cards): **mythic 32 · legendary 27 · uncommon 5 · epic 2 ·
   * common 1**. Rarity is 88% two buckets here, so a chip value keyed on it is nearly a constant —
   * and it also names two tiers this deck does not have (`rare`, `prizm` are the ARENA's
   * vocabulary), so half the deck scored the default. ⚑ `atk + def` from `js/card-stats.js` runs
   * **8 to 23, median 18** across the same 67 — real spread, already printed on the back of the
   * card, and derived from the card's seed so it is the same number on every machine. The number
   * on the back is what the card is worth. That is a sentence a collector can act on.
   * ⚠ Falls back to rarity when the vitals are absent (a bare manifest, a test fixture), because a
   *   missing stat must not make a card worth zero. */
  const CHIPS = { common: 10, uncommon: 14, epic: 22, legendary: 30, mythic: 40 };
  const chipsOf = c => {
    if (!c) return 10;
    const sum = (+c.atk || 0) + (+c.def || 0);
    if (sum > 0) return 4 * sum;                       // 32-92, median 72
    return CHIPS[c.rarity] || 10;
  };

  /* ── THE SETS. ⛔ MATCHING IS ON THE TRIGGER, NOT THE RARITY, AND THAT IS A MEASUREMENT NOT A
   * preference. Rarity in this deck is 32 mythic + 27 legendary out of 67 — a same-rarity FIVE
   * would fire almost every hand, which makes "play five mythics" the whole game and there is no
   * game after that. The TRIGGER runs **19 distinct values, at most 7 copies each**, so a pair is
   * a find and a plate of four is a story.
   * ⚑ AND IT IS THE DECK'S OWN LANGUAGE. The triggers are printing defects — DOUBLE STRIKE, MOIRÉ,
   *   GHOSTING, DOT GAIN, REGISTER, BLEED. This is a press. Matching misprints is what this studio
   *   would actually do, where matching rarity is what every other card game does.
   * ⚠ Ordered strongest-first: `setOf` takes the FIRST that matches, so a five-card run has to be
   *   tested before a four-card one or FULL SHEET could never be made. */
  const SETS = [
    { id: 'sheet',  name: 'FULL SHEET',  chips: 120, mult: 12,
      test: cs => cs.length === 5 && consecutive(cs) },
    { id: 'plate',  name: 'PLATE',       chips: 90,  mult: 10,
      test: cs => cs.length >= 4 && sameTrigger(cs) },
    { id: 'run',    name: 'RUN',         chips: 60,  mult: 7,
      test: cs => cs.length >= 4 && consecutive(cs) },
    { id: 'trio',   name: 'TRIO',        chips: 45,  mult: 6,
      test: cs => cs.length >= 3 && sameTrigger(cs) },
    { id: 'short',  name: 'SHORT RUN',   chips: 30,  mult: 4,
      test: cs => cs.length >= 3 && consecutive(cs) },
    { id: 'pair',   name: 'PAIR',        chips: 18,  mult: 3,
      test: cs => cs.length >= 2 && sameTrigger(cs) },
    { id: 'single', name: 'LOOSE CARD',  chips: 5,   mult: 1,
      test: cs => cs.length >= 1 },
  ];
  const trigOf = c => (c && c.trigger) || '';
  function sameTrigger(cs) { return !!trigOf(cs[0]) && cs.every(c => trigOf(c) === trigOf(cs[0])); }
  function sameRarity(cs) { return cs.every(c => c.rarity === cs[0].rarity); }
  function consecutive(cs) {
    const ns = cs.map(c => +c.id).sort((a, b) => a - b);
    for (let i = 1; i < ns.length; i++) if (ns[i] !== ns[i - 1] + 1) return false;
    return true;
  }

  /* ── HOUSE RULES. The Balatro-shaped half: a small permanent modifier that turns arithmetic into a
   * build. ⚠ Each is a PURE function of the pull, so the same hand always scores the same and the
   * test can prove it. `add` adds chips, `mult` adds multiplier, `x` multiplies it — and x-rules are
   * rare on purpose, because two of them is where the number stops being readable. */
  const RULES = [
    { id: 'foil',    name: 'FOIL PRESS',     text: '+30 chips on every pull.',
      chips: () => 30 },
    { id: 'heat',    name: 'RUNNING HOT',    text: '+4 mult on every pull.',
      mult: () => 4 },
    { id: 'mythics', name: 'MYTHIC EYE',     text: 'Each MYTHIC card in the pull: +9 mult.',
      mult: p => 9 * p.cards.filter(c => c.rarity === 'mythic').length },
    { id: 'ladder',  name: 'THE LADDER',     text: 'RUNs get +4 mult for every card in them.',
      mult: p => /run|short|sheet/.test(p.set.id) ? 4 * p.cards.length : 0 },
    { id: 'sleeved', name: 'SLEEVED',        text: 'Every card the same rarity: x1.4 mult.',
      x: p => sameRarity(p.cards) ? 1.4 : 1 },
    { id: 'thin',    name: 'THIN DECK',      text: '+8 mult for each card you have tossed this ante.',
      mult: p => 8 * p.tossed },
    { id: 'first',   name: 'FIRST IMPRESSION', text: 'Your first pull of an ante scores twice.',
      x: p => p.playsUsed === 0 ? 2 : 1 },
    { id: 'low',     name: 'LOW NUMBERS',    text: 'Cards numbered 34-59: +14 chips each.',
      chips: p => 14 * p.cards.filter(c => +c.id <= 59).length },
    { id: 'high',    name: 'HIGH NUMBERS',   text: 'Cards numbered 60-100: +14 chips each.',
      chips: p => 14 * p.cards.filter(c => +c.id >= 60).length },
    { id: 'pairup',  name: 'MISPRINT RUN',   text: 'Trigger matches (PAIR/TRIO/PLATE): +40 chips, +6 mult.',
      chips: p => /pair|trio|plate/.test(p.set.id) ? 40 : 0,
      mult: p => /pair|trio|plate/.test(p.set.id) ? 6 : 0 },
    { id: 'short',   name: 'SHORT STACK',    text: 'Pulls of 1 or 2 cards: +40 chips and +6 mult.',
      chips: p => p.cards.length <= 2 ? 40 : 0,
      mult: p => p.cards.length <= 2 ? 6 : 0 },
    { id: 'wide',    name: 'WIDE OPEN',      text: 'Pulls of 5 cards: x2 mult.',
      x: p => p.cards.length === 5 ? 2 : 1 },
    { id: 'mint',    name: 'MINT CONDITION', text: 'MYTHIC and LEGENDARY cards: +18 chips each.',
      chips: p => 18 * p.cards.filter(c => c.rarity === 'mythic' || c.rarity === 'legendary').length },
    { id: 'patience', name: 'PATIENCE',      text: '+50 chips for each PULL you have left.',
      chips: p => 50 * (PLAYS - p.playsUsed - 1) },
    { id: 'creases', name: 'CREASES',        text: 'Cards with ATK under 8: +11 mult each.',
      mult: p => 11 * p.cards.filter(c => (+c.atk || 99) < 8).length },
    { id: 'binder',  name: 'THE BINDER',     text: 'x1.25 mult for every 9 cards left in your deck.',
      x: p => 1 + 0.25 * Math.floor(p.deckLeft / 9) },
  ];
  const ruleById = {};
  for (const r of RULES) ruleById[r.id] = r;

  // ── seeded RNG. mulberry32: 32 bits of state, no dependencies, identical everywhere. ──────────
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* ⚠ PAGES MAY OVERLAP OR RUN OFF THE END OF THE BAND, so the deck is topped up from the pool to
   *   a fixed size — a short deck would quietly change how many cards an ante gets to see, which is
   *   a balance change disguised as a shuffle. */
  const PAGES = 4, PAGE = 6;
  function dealPages(pool, rnd) {
    const byNum = pool.slice().sort((a, b) => (+a.id) - (+b.id));
    const out = [], taken = new Set();
    for (let p = 0; p < PAGES; p++) {
      const start = Math.floor(rnd() * Math.max(1, byNum.length - PAGE));
      for (let i = start; i < start + PAGE && i < byNum.length; i++) {
        if (taken.has(byNum[i].id)) continue;
        taken.add(byNum[i].id); out.push(byNum[i]);
      }
    }
    for (const c of shuffle(byNum, rnd)) {
      if (out.length >= DECK_SIZE) break;
      if (!taken.has(c.id)) { taken.add(c.id); out.push(c); }
    }
    return out.slice(0, DECK_SIZE);
  }

  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ⛔ ONE DEFINITION OF WHAT MAY ENTER A RUN. Ids 1-33 are 1/1s. `cards/battle.html` shipped a house
   * that staked the whole hundred and gave away roughly one hero per game; that is the same mistake
   * with a different verb, so the filter lives at the door and nothing downstream may widen it. */
  const isHero = c => { const n = Number(c && c.id); return n >= 1 && n <= 33; };
  const stock = deck => (deck || []).filter(c => !isHero(c));

  // ── scoring ──────────────────────────────────────────────────────────────────────────────────
  function setOf(cards) { return SETS.find(s => s.test(cards)) || SETS[SETS.length - 1]; }

  /* ⛔ ONLY THE CARDS THAT FORM THE SET SCORE, AND LEAVING THAT OUT BROKE THE WHOLE GAME. Measured
   * over 200 driven runs of the first version: **LOOSE CARD was 51% of every pull played** — the
   * best move was routinely to dump five unmatched cards and collect five cards' worth of chips at
   * mult 1, which is not a decision, it is a shovel. Matching had no cost and no reward.
   * ⚑ THE RULE IS THE GENRE'S OWN AND IT DOES TWO JOBS AT ONCE: unmatched cards pay nothing, so a
   *   PAIR always beats a shovel — and because the non-scoring cards are still SPENT, playing five
   *   to score two is a real move, the one that clears junk out of a hand you are about to redraw.
   *   That single line is what turns "pick the biggest numbers" into "what am I building".
   * ⚠ 31 subsets of five is nothing to enumerate, so the best set in a pull is FOUND rather than
   *   guessed — a player should never be punished for the order they tapped cards in. */
  function bestSet(cards) {
    let best = null;
    const n = cards.length;
    for (let m = 1; m < (1 << n); m++) {
      const sub = [];
      for (let i = 0; i < n; i++) if (m & (1 << i)) sub.push(cards[i]);
      const st = SETS.find(x => x.id !== 'single' && x.test(sub));
      if (!st) continue;
      const v = st.chips + sub.reduce((a, c) => a + chipsOf(c), 0) * st.mult;
      if (!best || v > best.v) best = { set: st, scoring: sub, v: v };
    }
    if (best) return { set: best.set, scoring: best.scoring };
    /* nothing matches: the single best card carries it, and the rest are spent for nothing */
    const top = cards.slice().sort((a, b) => chipsOf(b) - chipsOf(a))[0];
    return { set: SETS[SETS.length - 1], scoring: top ? [top] : [] };
  }

  /* The whole of the arithmetic, in one place and pure. `ctx` carries what the house rules are
   * allowed to see: nothing from the DOM, nothing from a clock. */
  function score(cards, held, ctx) {
    const b = bestSet(cards || []);
    const set = b.set, scoring = b.scoring;
    /* ⚠ THE HOUSE RULES SEE `cards` = WHAT SCORED, not what was played. A rule that says "each
     *   MYTHIC in the pull" must mean the ones that counted, or a player could pad a pair with
     *   three mythics that pay nothing and collect the bonus anyway — a loophole that would make
     *   the scoring rule above pointless. `played` is there for the rules that genuinely care. */
    const p = { cards: scoring, played: cards, set, tossed: (ctx && ctx.tossed) || 0,
      playsUsed: (ctx && ctx.playsUsed) || 0, deckLeft: (ctx && ctx.deckLeft) || 0 };
    let chips = set.chips + scoring.reduce((n, c) => n + chipsOf(c), 0);
    let mult = set.mult;
    let x = 1;
    const fired = [];
    for (const id of (held || [])) {
      const r = ruleById[id]; if (!r) continue;
      const dc = r.chips ? r.chips(p) : 0;
      const dm = r.mult ? r.mult(p) : 0;
      const dx = r.x ? r.x(p) : 1;
      if (dc || dm || dx !== 1) fired.push({ id: r.id, name: r.name, chips: dc, mult: dm, x: dx });
      chips += dc; mult += dm; x *= dx;
    }
    /* ⚠ ROUNDED ONCE, AT THE END. Rounding each term makes the same hand score differently
     *   depending on the order rules were drafted in, which is a bug the player experiences as
     *   "the number is random". */
    const total = Math.round(chips * mult * x);
    return { set, chips, mult, x: +x.toFixed(4), total, fired, scoring,
      scoringIds: scoring.map(c => +c.id) };
  }

  // ── a run ────────────────────────────────────────────────────────────────────────────────────
  /* `deck` is the studio's card list; `owned` is the player's slugs, used ONLY to widen the shop. */
  function create(opts) {
    const o = opts || {};
    const seed = (o.seed >>> 0) || 1;
    const pool = stock(o.deck || []);
    if (!pool.length) return null;
    const owned = new Set(o.owned || []);
    const rnd = rng(seed);

    /* ⛔ THE RUN DECK IS DEALT AS BINDER PAGES, AND THE FIRST VERSION WAS A RANDOM 24 THAT BROKE THE
     * GAME. Driven through the real page: nearly every pull came back **LOOSE CARD (5)** — five
     * unmatched cards dumped for their chips at mult 1 — because with 19 triggers and random ids
     * across 67 cards a hand of eight almost never holds a pair OR a run. The scoring table was
     * fine; there was simply nothing in the hand to score with, so the whole game collapsed into
     * "play your five biggest". ⚠ NOTHING ERRORED AND NOTHING LOOKED WRONG — it took reading the
     * run log on the game-over screen to see that every line said the same three words.
     * ⚑ THE FIX IS THE STUDIO'S OWN OBJECT: a binder holds PAGES, and a page is consecutive. The
     *   deck is four pages of six consecutive card numbers, so a RUN is something you can actually
     *   assemble and a PLATE (four of one printing defect) stays the rare one. That also makes the
     *   deck legible — you can hold "I am collecting the low sixties" in your head, which is a
     *   thought a random 24 cannot produce. */
    const runDeck = dealPages(pool, rnd);

    const S = {
      seed, ante: 0, target: ANTES[0], scored: 0,
      plays: PLAYS, tosses: TOSSES, tossed: 0, playsUsed: 0,
      deck: [], hand: [], held: [], over: false, won: false, best: 0,
      log: [], offers: null, shopping: false,
    };

    function reshuffle() { S.deck = shuffle(runDeck, rng(seed + S.ante * 7919 + 13)); }
    /* ⛔ AN EMPTY HAND WITH PULLS LEFT IS A SOFT-LOCK, AND THE DECK DOES RUN DRY BY DESIGN. Four
     * pulls of five plus three tosses is up to 32 cards against a deck of 24, so running out is a
     * real pressure the player has to manage — but it must END the ante, not leave them staring at
     * a table with no cards and no legal move. Found by the simulator on the first run, which is
     * exactly what a simulator is for: no amount of reading finds a state you never reach by hand. */
    function draw() {
      while (S.hand.length < HAND && S.deck.length) S.hand.push(S.deck.pop());
      if (!S.hand.length && !S.shopping && S.scored < S.target) S.over = true;
    }
    const outOfCards = () => !S.hand.length && !S.deck.length;

    function beginAnte() {
      S.target = ANTES[Math.min(S.ante, ANTES.length - 1)] *
        /* past the printed ladder it keeps climbing rather than ending — an arcade game should not
         * have a last screen, it should have a point where you stop being able to. */
        (S.ante >= ANTES.length ? Math.pow(1.6, S.ante - ANTES.length + 1) : 1);
      S.target = Math.round(S.target);
      S.scored = 0; S.plays = PLAYS; S.tosses = TOSSES; S.tossed = 0; S.playsUsed = 0;
      S.hand = []; S.shopping = false; S.offers = null;
      reshuffle(); draw();
    }

    /* ⚠ INDICES, NOT CARDS. The hand can hold two copies of one card, so passing objects would make
     *   "play this one" ambiguous and silently play the wrong copy. */
    function pull(idxs) {
      if (S.over || S.shopping) return null;
      const pick = [...new Set(idxs)].filter(i => i >= 0 && i < S.hand.length).slice(0, SET_MAX);
      if (!pick.length || !S.plays) return null;
      const cards = pick.map(i => S.hand[i]);
      const r = score(cards, S.held, { tossed: S.tossed, playsUsed: S.playsUsed, deckLeft: S.deck.length });
      S.scored += r.total; S.best = Math.max(S.best, S.scored);
      S.plays--; S.playsUsed++;
      S.hand = S.hand.filter((_, i) => !pick.includes(i));
      draw();
      S.log.push({ ante: S.ante + 1, set: r.set.name, n: cards.length, total: r.total });
      if (S.scored >= S.target) openShop();
      else if (!S.plays) { S.over = true; }
      return r;
    }

    function toss(idxs) {
      if (S.over || S.shopping || !S.tosses) return false;
      const pick = [...new Set(idxs)].filter(i => i >= 0 && i < S.hand.length);
      if (!pick.length) return false;
      S.tosses--; S.tossed += pick.length;
      S.hand = S.hand.filter((_, i) => !pick.includes(i));
      draw();
      return true;
    }

    /* ⚑ THE SHOP IS WHERE YOUR COLLECTION SHOWS UP, and it is the only place it does. Owning a card
     * means it can be OFFERED to you; it never means a bigger number. */
    function openShop() {
      S.shopping = true;
      const r = rng(seed + S.ante * 104729 + 7);
      const have = new Set(S.held);
      const avail = RULES.filter(x => !have.has(x.id));
      S.offers = {
        rules: shuffle(avail, r).slice(0, 3).map(x => ({ id: x.id, name: x.name, text: x.text })),
        cards: shuffle(pool, r).slice(0, 24)
          .sort((a, b) => (owned.has(b.slug) ? 1 : 0) - (owned.has(a.slug) ? 1 : 0))
          .slice(0, 3)
          .map(c => ({ id: c.id, slug: c.slug, title: c.title, rarity: c.rarity, yours: owned.has(c.slug) })),
      };
    }

    function takeRule(id) {
      if (!S.shopping || !S.offers) return false;
      if (!S.offers.rules.some(x => x.id === id)) return false;
      if (S.held.length >= RULES_MAX) S.held.shift();      // oldest out, so the choice always lands
      S.held.push(id);
      S.offers.rules = [];
      return true;
    }
    function takeCard(id) {
      if (!S.shopping || !S.offers) return false;
      const pickIdx = S.offers.cards.findIndex(x => +x.id === +id);
      if (pickIdx < 0) return false;
      const c = pool.find(x => +x.id === +id);
      if (c) runDeck.push(c);
      S.offers.cards = [];
      return true;
    }
    function nextAnte() {
      if (!S.shopping) return false;
      S.ante++;
      if (S.ante >= ANTES.length) S.won = true;            // cleared the printed ladder; keeps going
      beginAnte();
      return true;
    }

    beginAnte();

    return {
      get state() { return S; },
      get deckSize() { return runDeck.length; },
      pull, toss, takeRule, takeCard, nextAnte, score,
      preview: idxs => score([...new Set(idxs)].filter(i => i >= 0 && i < S.hand.length).slice(0, SET_MAX).map(i => S.hand[i]),
        S.held, { tossed: S.tossed, playsUsed: S.playsUsed, deckLeft: S.deck.length }),
    };
  }

  const API = { create, score, setOf, stock, isHero, chipsOf, rng, shuffle,
    SETS, RULES, ruleById, ANTES, HAND, PLAYS, TOSSES, SET_MAX, RULES_MAX, DECK_SIZE, CHIPS };
  root.PullGame = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

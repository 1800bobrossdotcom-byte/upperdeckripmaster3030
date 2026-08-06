/* ripmaster3030studios — A CARD OF THE HUNDRED, FROM ITS RECIPE.   `CardRecipe`
 *
 *   CardRecipe.build({canvas, q, base}) -> Promise<HeroCard ctrl|null>   never rejects
 *   CardRecipe.parse(q)                 -> {seed, name, sub, rarity, slugs, vals, motion}
 *   CardRecipe.apply(ctrl, parsed)      -> pushes every dial onto a live press
 *   CardRecipe.KEYS                     -> the key→setter table (see the coupling note)
 *
 * ══ ⛔ WHY THIS EXISTS: A DECK CARD CANNOT BE PRESSED FROM ITS PICTURE ══════════════════════
 * `js/card-press.js` prints a card FROM a source picture: the seed is a hash of the art's
 * filename stem and the ground/mid plates are drawn out of the pigment pool by that seed. That
 * is exactly right for the folder, the pack and the 196 — there, the picture IS the card.
 *
 * ⛔ THE HUNDRED ARE NOT PICTURES. Each one is a RECIPE — `cards/deck.json` holds a query string
 *   per card: its seed, the six plate slugs the artist chose, the name, the rarity and every
 *   dial he set. `cards/art/deck/<n>.webp` is a photograph OF the result, baked by
 *   `npm run deck:bake` for the thumbnails. Feeding that bake back through `CardPress.live`
 *   would print a four-colour separation of a four-colour separation — a card of a card, at the
 *   wrong seed, with plates nobody chose. It would RENDER, and it would be a different card,
 *   which is this repo's most expensive failure shape.
 *
 * ⚑ SO THE RECIPE IS THE SOURCE OF TRUTH AND THE BAKE IS THE THUMBNAIL. Opening a card runs its
 *   press live from the same string the forge writes, which is what keeps `cards/deck.html`'s
 *   own promise — "the picture and the link can never drift apart".
 *
 * ══ ⛔ THE COUPLING, AND WHY IT IS A TEST RATHER THAN AN IMPORT ═════════════════════════════
 * `cards/proof.html` owns the same key→setter knowledge in its DIALS / TOGGLES / CHOICES tables,
 * because there each row also carries a label, a slider element, a URL key and a saved value —
 * four jobs this module does not have. Importing them would mean shipping the forge's UI to
 * every visitor; the forge is not even deployed any more (`.vercelignore`).
 * ⚑ So the two tables are coupled BY ASSERTION, which is the instrument this repo already uses
 *   for `js/city-ops.js` against `js/s9pc-game.js`'s weapon table: `npm run test:reach` requires
 *   every URL key here to exist there and vice versa. A dial added to the forge and not here
 *   would otherwise be a dial that saves into a recipe and is silently dropped on every card the
 *   public opens — a hundred cards quietly printing as slightly different cards, with nothing
 *   anywhere reporting it.
 * ⚠ Keep `d` (the no-effect base) in step with the forge's own `d` column. A recipe written
 *   before a dial existed omits its key, and the base is what a card printed before it existed.
 *
 * FAILS OPEN at every step: no HeroCard, no WebGL2, a manifest that will not load, a plate slug
 * that no longer resolves ⇒ `null` or the seeded pick, never a throw.
 */
(function (global) {
  'use strict';

  var RAD = Math.PI / 180;

  /* ── the table ────────────────────────────────────────────────────────────────────────────
   * `k` is the URL key, `d` the no-effect base, `put(ctrl, value, ctx)` the press call.
   * ⚠ REGISTRATION IS ONE CALL WITH TWO ARGUMENTS. Sending only the one that moved silently
   *   resets the other — the forge records this as "a dial that works until you touch its
   *   neighbour" — so both keys route through the same setter with both values. */
  var KEYS = {
    burn:  { d: 0,   put: function (c, v) { c.setState({ burn: v }); } },
    price: { d: 0,   put: function (c, v) { c.setState({ price: v }); } },
    dep:   { d: 0,   put: function (c, v) { c.setState({ depth: v }); } },
    reg:   { d: 0,   put: function (c, v, x) { c.setRegistration(x.reg, x.rad); } },
    rad:   { d: 0,   put: function (c, v, x) { c.setRegistration(x.reg, x.rad); } },
    stack: { d: 0,   put: function (c, v) { c.setStack(v); } },
    press: { d: 0,   put: function (c, v) { c.setPress(v); } },
    scr:   { d: 0,   put: function (c, v) { c.setScreen(v); } },
    /* ⚠ COUNT CARRIES THE KIND. `setSprites({count})` with no kind is a count of nothing in
     *   particular; the forge passes `loopKind()` in the same call for that reason. */
    spr:   { d: 0,   put: function (c, v, x) { c.setSprites({ count: v, kind: x.loop, type: x.type }); } },
    srate: { d: 1,   put: function (c, v) { c.setSprites({ rate: v }); } },
    per:   { d: 8,   put: function (c, v) { c.setPeriod(v); } },
    /* ⚠ DEGREES IN THE URL, RADIANS ON THE PRESS. The forge's slider is in degrees because that
     *   is what a person reads; passing 135 straight through would spin the key light 21 turns. */
    light: { d: 135, put: function (c, v) { c.setLight(v * RAD); } },

    spin:  { d: 0,   put: function (c, v) { c.setSpin(v); } },
    env:   { d: 1,   put: function (c, v) { c.setEnv(v); } },
    frame: { d: 1,   put: function (c, v) { c.setFrame(!!v); } },
    marks: { d: 0,   put: function (c, v) { c.setMarks(!!v); } },
    inks:  { d: 0,   put: function (c, v) { c.setInks(v ? 6 : 4); } },
    pigs:  { d: 1,   put: function (c, v) { c.setPigs(v); } },
    loop:  { d: 'boil', str: true,
             put: function (c, v, x) { c.setSprites({ kind: v, type: x.type }); } },
    mot:   { d: '',  str: true,
             put: function (c, v) { c.setMotion(v || null); } },
  };

  var SLOTS = ['g', 'm', 'f', 'w', 's', 'i'];

  function parse(q) {
    var Q = new URLSearchParams(String(q || '').replace(/^[?]/, ''));
    var vals = {}, slugs = {};
    Object.keys(KEYS).forEach(function (k) {
      var spec = KEYS[k];
      if (!Q.has(k)) { vals[k] = spec.d; return; }
      if (spec.str) { vals[k] = Q.get(k); return; }
      var n = parseFloat(Q.get(k));
      vals[k] = isFinite(n) ? n : spec.d;
    });
    SLOTS.forEach(function (k) { if (Q.get(k)) slugs[k] = Q.get(k); });
    var seed = parseInt(Q.get('seed'), 10);
    return {
      /* ⚠ A card with no seed is not a card — every plate pick, every press fault and the type
       *   itself come off it. 3030 is the house fallback, the same one card-press uses. */
      seed: isFinite(seed) ? seed : 3030,
      /* ⛔ `has`, NOT `||`, AND THE DEFAULT IS BLANK — NOT "PLATE PROOF". The forge falls back to
       *   its placeholder because a fresh forge has to say something; a card of the hundred that
       *   arrived here without a name must print NOTHING rather than stamp the console's
       *   placeholder onto a public card. Artist, 2026-08-06: *"I don't want plate proof writing
       *   on all of them, I can't remove it."* */
      name: Q.has('name') ? Q.get('name') : '',
      sub: Q.get('sub') || '',
      rarity: Q.get('rarity') || 'common',
      n: parseInt(Q.get('n'), 10) || null,
      slugs: slugs, vals: vals,
    };
  }

  /* ⛔ THE LEADING RUN, NOT `every()`. A card saved before the collage went to six names carries
   * only g/m/f, and demanding all six drops the three plates the artist DID choose and reprints
   * the seeded pick — the card still renders, as a different card. `js/hero-card.js` pads the
   * rest from the seed's own pick. Straight out of the forge, for the same reason. */
  function exactFor(parsed, list) {
    var chosen = SLOTS.map(function (k) {
      var want = parsed.slugs[k];
      if (!want) return null;
      var hit = list.filter(function (c) { return c.key === want; })[0];
      return hit ? hit.art : null;
    });
    var run = 0;
    while (run < chosen.length && chosen[run]) run++;
    return (run === 3 || run === 6) ? chosen.slice(0, run) : null;
  }

  function apply(ctrl, parsed, type) {
    if (!ctrl || !parsed) return ctrl;
    var v = parsed.vals;
    var ctx = { reg: v.reg, rad: v.rad, loop: v.loop, type: type || null };
    /* ⚠ ORDER MIRRORS THE FORGE'S `applyAll` — dials, then the binary states, then the kind, then
     *   the motion. Two orders for one set of setters is two cards for one recipe. */
    ['burn', 'price', 'dep', 'reg', 'rad', 'stack', 'press', 'scr', 'spr', 'srate', 'per', 'light',
     'spin', 'env', 'frame', 'marks', 'inks', 'pigs', 'loop', 'mot'].forEach(function (k) {
      try { KEYS[k].put(ctrl, v[k], ctx); } catch (e) { /* one dead dial must not cost the card */ }
    });
    return ctrl;
  }

  function build(o) {
    o = o || {};
    var canvas = o.canvas;
    if (!canvas || !global.HeroCard || !global.CardPress) return Promise.resolve(null);
    if (canvas.__recipe) return canvas.__recipe;
    var base = o.base || '';
    var parsed = parse(o.q);

    canvas.__recipe = Promise.all([CardPress.pool(base), CardPress.typeSpec(base)])
      .then(function (r) {
        var list = r[0], type = r[1];
        if (!list.length) return null;
        return global.HeroCard.build({
          canvas: canvas, seed: parsed.seed, type: type, rarity: parsed.rarity,
          pigment: list.map(function (c) { return c.art; }),
          pigmentExact: exactFor(parsed, list),
          name: parsed.name, sub: parsed.sub,
        }).then(function (press) {
          if (!press) return null;
          apply(press, parsed, type);
          /* ⚑ SHOW ANOTHER CARD ON THE PRESS THAT IS ALREADY THERE. `getContext('webgl2')` hands
           * back the SAME context on a second call and HeroCard never releases, so walking the
           * hundred by rebuilding would leak a program, buffers and seven textures per card —
           * silently, until a browser drops the oldest context and blanks a card somebody opened
           * ten minutes ago. Reseed and swap the plates instead. */
          press.__show = function (q) {
            var p = parse(q);
            try { press.reseed(p.seed); } catch (e) {}
            try { press.setRarity(p.rarity); } catch (e) {}
            /* ⚠ AFTER the reseed: `reseed` re-bakes the type plate, so words set before it print
             *   the previous card's name for a frame — and a frame is all a texture upload needs. */
            try { press.setText({ name: p.name, sub: p.sub }); } catch (e) {}
            apply(press, p, type);
            var exact = exactFor(p, list);
            return exact ? press.setPigment(exact).catch(function () { return false; })
                         : Promise.resolve(true);
          };
          return press;
        });
      }).catch(function () { return null; });
    return canvas.__recipe;
  }

  global.CardRecipe = { KEYS: KEYS, SLOTS: SLOTS, parse: parse, build: build, apply: apply };
})(window);

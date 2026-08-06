/* THE CITY's two earned titles — the detectors only (CityTitles).
 *
 * DEAD AIR   · 300 m in one unbroken glide, no wingbeat, never above 40 m.
 * BOTH ENDS  · plant a card from the air as the bird, take that same card back as the squirrel.
 *
 * `js/title-ledger.js` owns the ledger and the redeem panel; this file owns only "did it happen",
 * takes a plain state object once a frame and returns events. No DOM, no engine, no PlayCanvas —
 * so `npm run test:titles` drives it under node against the same numbers the game feeds it.
 *
 * ⛔ DEAD AIR's CEILING IS `alt`, NOT `y`, AND THAT IS THE WHOLE CONDITION. `me.alt` is height above
 *    the ground BENEATH you, which the city already computes every frame from the collider. Using
 *    world y would make the rule mean "stay below sea level plus 40" — free over the river and
 *    impossible over a hill — i.e. a different rule in every district, which is not a rule.
 *
 * ⚑ THE NUMBERS ARE MEASURED, NOT CHOSEN. Driven on the shipping build: the glide ratio is a flat
 *   8.2 : 1 at every altitude (210 m of ceiling → 1,712 m of glide, 8.17; 50 m → 404 m, 8.24), so a
 *   40 m cap buys **328 m and not a metre more**. 300 m therefore spends 91% of the physical
 *   maximum and cannot be reached by climbing out of trouble — there is no trouble to climb out of,
 *   only the line you picked. And the line matters: from five random city points a straight glide
 *   under that cap ran 327 · 327 · 327 · 311 · 190, i.e. **two of five hit a building.**
 *   ⚑ So it is won by READING THE CITY BEFORE COMMITTING, which is precisely what the bird is for
 *   (`docs/CITY-GAME.md`: the bird SCOUTS — "a card seen from the air is a PLAN"). The title makes
 *   the animal's own advantage the thing being tested, rather than adding a stopwatch to it.
 *
 * ⛔ THE GLIDE WINDOW IS VOIDED, NOT PAUSED, BY BREAKING THE CEILING. A pause would let you climb
 *    over the tower, come back down and carry on counting, which is the same "retry the bad bit"
 *    hole the Cloud Racer streak had to close at the green light. One beat, one touchdown, or one
 *    metre over 40 and the distance goes back to zero.
 *
 * ⚑ BOTH ENDS MATCHES THE CARD BY OBJECT IDENTITY, not by kind or position. Kinds repeat and a
 *   rival can drop an identical card a metre away; the title says "that same card", so it compares
 *   the reference `drops.drop()` returned. ⚠ That also gives "in one unbroken visit" for free and
 *   honestly: the references live in memory, so a reload loses them and the run starts again. No
 *   persistence to forge, and nothing to explain.
 */
(function (root) {
  'use strict';

  const DEAD_AIR_M = 300;      // measured: 328 is the physical maximum under the cap
  const DEAD_AIR_ALT = 40;     // metres above the ground beneath you

  function create(opts) {
    const o = opts || {};
    const award = o.award || function () {};
    // the live glide window
    let gx = 0, gz = 0, dist = 0, live = false, lastFlaps = -1;
    let best = 0;
    const planted = new Set();
    let planting = 0;

    function reset(x, z) { gx = x; gz = z; dist = 0; }

    /* One frame. `s` is a plain snapshot — x, z, alt, onGround, flaps, creature, mode, carried. */
    function step(s) {
      if (!s) return null;
      let ev = null;

      // ── DEAD AIR ────────────────────────────────────────────────────────────────────────────
      const isBird = s.creature === 'bird' && s.mode === 'animal';
      const flapped = lastFlaps >= 0 && s.flaps > lastFlaps;
      lastFlaps = s.flaps;
      const breaks = !isBird || s.onGround || flapped || s.alt > DEAD_AIR_ALT;
      if (breaks) {
        live = isBird && !s.onGround && s.alt <= DEAD_AIR_ALT;
        reset(s.x, s.z);
      } else {
        if (!live) { live = true; reset(s.x, s.z); }
        else {
          dist = Math.hypot(s.x - gx, s.z - gz);
          if (dist > best) best = dist;
          if (dist >= DEAD_AIR_M) {
            ev = { id: 'deadair', evidence: { metres: Math.round(dist), maxAlt: Math.round(s.alt), wingbeats: 0 } };
            award(ev.id, ev.evidence);
            reset(s.x, s.z);                       // banked; do not re-fire every frame
          }
        }
      }

      // ── BOTH ENDS ───────────────────────────────────────────────────────────────────────────
      if (!ev && s.creature === 'squirrel' && s.carried && planted.has(s.carried)) {
        planted.delete(s.carried);
        ev = { id: 'bothends', evidence: { planted: planting, recoveredAs: 'squirrel' } };
        award(ev.id, ev.evidence);
      }
      return ev;
    }

    /* Called when the bird actually releases a card. Only the bird plants — a squirrel putting a
     * card down is `dropCarried`, which is the other half of the game and not this title. */
    function plant(dropRef, creature) {
      if (!dropRef || creature !== 'bird') return false;
      planted.add(dropRef); planting++;
      return true;
    }

    return { step, plant,
      get glide() { return { live, dist: +dist.toFixed(1), best: +best.toFixed(1) }; },
      get plantedCount() { return planted.size; },
      DEAD_AIR_M, DEAD_AIR_ALT };
  }

  const API = { create, DEAD_AIR_M, DEAD_AIR_ALT };
  root.CityTitles = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

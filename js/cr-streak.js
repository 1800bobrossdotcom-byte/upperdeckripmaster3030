/* CLOUD RACER — THE STREAK (CRStreak). The ledger behind the earned title, and nothing else.
 *
 * `docs/HERO-UNLOCKS.md` #7: win 33 races in a row. This file counts them. It owns no DOM, no
 * engine and no racing rules — `js/crpc-ui.js` calls five functions and paints whatever comes
 * back — so it runs unmodified under node and `npm run test:crstreak` drives the shipping code
 * rather than a model of it. Same split `crpc-game.js` already uses, for the same reason.
 *
 * ⛔ THE ONE PROPERTY THAT MAKES "IN A ROW" MEAN ANYTHING: A RACE IS ARMED AT THE GREEN LIGHT AND
 *    ONLY A FINISH DISARMS IT. Count at the flag alone and the title silently collapses into "win
 *    33 races, retrying whenever one goes badly" — watch the first corner, and if the 0.99 bot
 *    gets you, reload. That is a treadmill bought with time, which is precisely what HERO-UNLOCKS
 *    rule 1 forbids ("a feat, not a grind"), and it would be INVISIBLE: nothing in a browser
 *    reports a tab that went away. So `arm()` writes a LIVE marker before the outcome exists and
 *    `settle()` clears it; a marker still present at the next load is an abandoned race and
 *    breaks the streak. Reloading to dodge a loss and taking the loss become the same event,
 *    which is the entire point.
 *
 * ⚠ THE COUNTDOWN IS DELIBERATELY OUTSIDE THE ARMED WINDOW. `arm()` is called on the `go` event,
 *   not when the race is built. During the count nothing has happened, so leaving cannot be
 *   dodging anything, and breaking a streak for a mis-click before the lights is a rule the
 *   player experiences as a bug. The window opens exactly when the race becomes losable.
 *
 * ⛔ THE LOBBY IS PINNED, AND THE PIN IS MEASURED. Field size and lap count are player-chosen, so
 *    without a floor the title is farmed at whatever setting is softest. Driven on this game's own
 *    code (40 races per cell, the shipping `botInput` at skill 1.0 as the pilot, discrete barrier
 *    clips injected as mistakes):
 *
 *      lobby            race     mistakes the race absorbs before the win rate drops
 *      4 pilots · 2 lap  28.5 s   3        ← the short lobby is the FORGIVING one, and it is also
 *      6 pilots · 3 lap  39.8 s   2          15.6 min of clock against the default's 21.9
 *      8 pilots · 5 lap  60.5 s   3
 *
 *    So the floor is 6 · 3 — the tightest cell — and it is a FLOOR rather than an equality: a
 *    longer race is more clock and more chances to err, so 8 · 5 counts too. Choosing the short
 *    lobby is the only thing ruled out, because that is the only choice that buys anything.
 *
 * ⚑ PRACTICE COUNTS, AND THAT IS A RULE-2 REQUIREMENT RATHER THAN A KINDNESS. Requiring the ante
 *   would put 33 rakes between a player and the title, i.e. a criterion satisfied by spending
 *   $3030 — the one thing HERO-UNLOCKS rule 2 forbids outright ("nothing that money can reach").
 *   A card loadout does carry up to a +3.6% edge into either kind of race; it is left alone and
 *   recorded rather than gated, because at a win rate already measured at 100% for a pilot who
 *   drives the line it decides nothing, and an unasked-for gate is worse than a noted one.
 *
 * ⚠ THIS COUNTER IS NOT THE AUTHORITY AND EVERY SURFACE THAT SHOWS IT SAYS SO. It is localStorage,
 *   editable in about four seconds, exactly like every other score in this project. HERO-UNLOCKS
 *   §1/§3 already settle what that means: the studio is the judge, the evidence is an unbroken
 *   capture of the whole run, and the chain enforces a human's decision through a `kind 2`
 *   voucher. The number on screen exists so a player can AIM at the title — rule 3, "legible
 *   before you start" — not so a machine can award it.
 *
 * ⚠ TWO TABS ON THIS GAME WILL BREAK A LIVE STREAK, deliberately. The second tab loads, finds a
 *   live marker and reads it as an abandoned race. There is no way to tell that case apart from
 *   the one this file exists to catch, and the alternative — trusting the marker less — is the
 *   farmable version. Documented rather than smoothed over.
 */
(function (root) {
  'use strict';

  const TARGET = 33;          // the artist's number, and the studio's
  const SEATS = 3;            // how many collectors can hold this title. Not 1: artist, 2026-08-06
  const PIN = { players: 6, laps: 3 };

  const K = { n: 'urm_cr_streak', best: 'urm_cr_best', live: 'urm_cr_live' };

  /* Every store touch is guarded. localStorage THROWS at an opaque origin — the card lenses render
   * in exactly such a frame — and a racing game must not lose a frame, let alone a race, because a
   * counter could not be written. A dead store degrades to a streak that never counts, and the
   * game is otherwise untouched. */
  let MEM = null;             // test seam: CRStreak._mem() swaps in a plain object
  function store() {
    if (MEM) return MEM;
    try { return root.localStorage || null; } catch (e) { return null; }
  }
  function get(k) { const s = store(); if (!s) return null; try { return s.getItem(k); } catch (e) { return null; } }
  function set(k, v) { const s = store(); if (!s) return; try { s.setItem(k, String(v)); } catch (e) {} }
  function del(k) { const s = store(); if (!s) return; try { s.removeItem(k); } catch (e) {} }
  const num = k => { const v = parseInt(get(k), 10); return isFinite(v) && v > 0 ? v : 0; };

  function qualifies(cfg) {
    if (!cfg) return false;
    return (+cfg.players || 0) >= PIN.players && (+cfg.laps || 0) >= PIN.laps;
  }

  function read() {
    return { n: num(K.n), best: num(K.best), live: !!get(K.live), target: TARGET, seats: SEATS };
  }

  /* Called on the green light. Returns whether this race is ON the streak, so the HUD can say
   * "this one does not count" rather than leave the player to discover it at the flag. */
  function arm(cfg) {
    if (!qualifies(cfg)) return { counting: false, n: num(K.n) };
    set(K.live, '1');
    return { counting: true, n: num(K.n) };
  }

  /* Called once at the flag. A non-qualifying race settles to nothing at all: it cannot advance a
   * streak and it must not break one either, because there is no advantage to be had from racing
   * a short lobby and punishing it would only be a trap. */
  function settle(won, cfg) {
    if (cfg !== undefined && !qualifies(cfg)) { del(K.live); return { counting: false, n: num(K.n), best: num(K.best) }; }
    if (!get(K.live)) return { counting: false, n: num(K.n), best: num(K.best) };
    del(K.live);
    const was = num(K.n);
    if (!won) { set(K.n, 0); return { counting: true, n: 0, was, best: num(K.best), broke: was > 0, hit: false }; }
    const n = was + 1;
    set(K.n, n);
    const best = Math.max(num(K.best), n);
    set(K.best, best);
    return { counting: true, n, was, best, broke: false, hit: n === TARGET, over: n > TARGET };
  }

  /* Called once at page load, BEFORE anything can arm. A live marker here means a race was started
   * and never finished — the abandonment case the whole design turns on. */
  function recover() {
    if (!get(K.live)) return { broke: false, n: num(K.n) };
    del(K.live);
    const was = num(K.n);
    set(K.n, 0);
    return { broke: was > 0, was, n: 0, best: num(K.best) };
  }

  function reset() { set(K.n, 0); del(K.live); return read(); }

  const API = { TARGET, SEATS, PIN, KEYS: K, qualifies, read, arm, settle, recover, reset,
    _mem: o => { MEM = o; } };
  root.CRStreak = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

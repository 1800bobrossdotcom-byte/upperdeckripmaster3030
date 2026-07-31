/* upperdeckripmaster3030 — RipSfx: the artist's recorded SFX libraries, one picker for every game.
 *
 *   RipSfx.play('gearup')                     random variant, default volume
 *   RipSfx.play('attachSmall', 0.4)           quieter
 *   RipSfx.play('nvg', 0.6, 2)                a specific variant when repetition IS the point
 *
 * The libraries live in sfx/ as uploaded (Gear_Up_01…23, Attachments_*, Night_Vision_*).
 * Random-variant playback is the whole reason these are families: the same gear-up clunk
 * twice in a row reads as a sound EFFECT, 23 shuffled takes read as a soldier actually
 * handling equipment. Play through cloneNode so overlapping calls don't cut each other off.
 *
 * Every call is fire-and-forget and swallow-on-failure: sfx must never break a game, and
 * autoplay policy can reject play() before the first user gesture — that rejection is fine,
 * every game here starts from a click anyway.
 */
window.RipSfx = (function () {
  const FAM = {
    gearup:        { base: 'sfx/gearup/Gear_Up_',             n: 23, vol: 0.55 },
    chute:         { base: 'sfx/gearup/Gear_Up_Parachute_',   n: 1,  vol: 0.60 },
    attach:        { base: 'sfx/attach/Attachments_',         n: 10, vol: 0.50 },
    attachMachine: { base: 'sfx/attach/Attachments_Machine_', n: 8,  vol: 0.50 },
    attachSmall:   { base: 'sfx/attach/Attachments_Small_',   n: 10, vol: 0.45 },
    nvg:           { base: 'sfx/nvg/Night_Vision_',           n: 4,  vol: 0.60 },
  };
  const cache = {};
  let on = true;
  let last = {};                                  // per family: avoid the same take twice running

  function url(f, i) { return f.base + String(i).padStart(2, '0') + '.mp3'; }

  function play(name, vol, idx) {
    if (!on) return;
    const f = FAM[name]; if (!f) return;
    let i = idx;
    if (i == null) {
      do { i = 1 + Math.floor(Math.random() * f.n); } while (f.n > 1 && i === last[name]);
      last[name] = i;
    }
    try {
      const u = url(f, i);
      if (!cache[u]) { cache[u] = new Audio(u); cache[u].preload = 'auto'; }
      const a = cache[u].cloneNode();             // clone: overlaps mix instead of restarting
      a.volume = vol != null ? vol : f.vol;
      const p = a.play(); if (p && p.catch) p.catch(() => {});
    } catch (e) { /* sfx never breaks a game */ }
  }

  return { play, FAM, enable: v => { on = v !== false; }, enabled: () => on };
})();

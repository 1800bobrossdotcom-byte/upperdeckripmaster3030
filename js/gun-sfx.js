/* ripmaster3030studios — GUNSHOTS, synthesised.  `GunSfx`
 *
 *   const guns = GunSfx.create(() => audioContext);
 *   guns.fire('smg');            // key is the WEAPONS[].key: pistol | smg | shotgun | sniper
 *   guns.fire('sniper', 0.4);    // quieter — a bot firing across the arena
 *
 * ⛔ WHAT WAS THERE, AND WHY IT DID NOT SOUND LIKE A GUN. Each weapon was one noise burst plus
 *    one falling square tone:
 *
 *      smg() { noise(0.04, 0.11, 3000); tone(360, 180, 0.05, 'square', 0.07); }
 *
 *    Four things wrong with that, three of them structural rather than a matter of taste:
 *
 *    1 NO LAYERS. A gunshot is not a sound, it is three events that arrive together — the muzzle
 *      blast, the low punch behind it, and the room answering. One noise burst is the first of
 *      those with the other two missing, which is why it read as a click rather than a shot.
 *    2 NO VARIATION, and this is the big one. Every smg() call produced a byte-identical waveform,
 *      fired on a fixed 105 ms timer. That is a 9.5 Hz loop of one sample, and the ear locks onto
 *      a repeating identical spectrum instantly — it stops hearing gunfire and starts hearing an
 *      oscillator. Real repeated shots never match; the variation IS the realism.
 *    3 A NEW AudioBuffer PER SHOT. `noise()` allocated `sampleRate * dur` floats and filled them
 *      with Math.random() on every trigger — about ten allocations a second on automatic fire,
 *      on the audio path. One shared buffer, read from a random offset, gives more variety for
 *      none of the cost.
 *    4 A LINEAR DECAY, baked into the buffer as `(1 - i/len)`. Impulsive sounds decay
 *      exponentially; a linear ramp sounds like a fade, which is exactly what a gunshot is not.
 *
 * ── THE DESIGN (docs/DESIGN-SYSTEM.md §8, read for sound) ────────────────────────────────────
 *
 * WHAT IT IS MADE OF — four layers, because four things physically happen:
 *
 *   CRACK   the muzzle blast leaving the barrel. 4–10 ms, broadband, highpassed, near-instant
 *           attack. This is the snap, and it is what tells you a gun went off rather than a
 *           speaker popped.
 *   BODY    the low punch. A short pitch-down through the bottom two octaves. This is the part
 *           you feel rather than hear, and its absence is why the old kit sounded weightless.
 *   TAIL    the space answering. Lowpassed noise decaying well past the crack, quiet. Length is
 *           the difference between a corridor and a courtyard.
 *   MECH    the action cycling — a tiny click 25–60 ms late. Only on the weapons where you would
 *           actually hear it over the blast.
 *
 * HOW IT IS LIT — n/a; the analogue is the room, and that is the TAIL.
 *
 * WHAT MOVES, AND WHY — the per-shot jitter. Barrel harmonics, the round, the air and where you
 * are standing all differ shot to shot, so crack brightness, body pitch and level all move a
 * little on every trigger. ⚑ This is the layer that does the most work and it is the one a
 * synthesised kit always forgets.
 *
 * WHAT IT SITS ON — the game's own AudioContext, passed in. This module never creates one: an
 * AudioContext made before a user gesture is born suspended, and every browser is strict about it.
 *
 * ACCEPTANCE — `npm run test:gunsfx`: every weapon must schedule a crack AND a body AND a tail;
 * two consecutive shots of the same weapon must NOT be identical; and the four must differ from
 * each other in duration and spectrum. A single-layer kit fails the first, the old kit fails the
 * second, and four copies of one preset fail the third.
 *
 * FAILS OPEN. Any exception anywhere is swallowed and the shot is simply not heard — audio must
 * never take a frame down, and a game that throws because a gain node failed is worse than a
 * quiet one.
 */
window.GunSfx = (function () {
  /* Per-weapon voicing. Times in seconds, frequencies in Hz, gains linear.
   * ⚠ These are RELATIVE to each other by design — the shotgun must feel heavier than the pistol
   *   in the same mix, so the numbers are only meaningful as a set. */
  const SPEC = {
    /* SIDE BET — tight and bright. Least body of the four: it is the small one, and it should
     * sound like the weapon you reach for when you have nothing better. */
    pistol: { crack: { hp: 1500, dur: 0.055, g: 0.30 }, body: { f0: 240, f1: 62, dur: 0.085, g: 0.22 },
      tail: { lp: 2200, dur: 0.20, g: 0.055 }, mech: { at: 0.055, g: 0.035 }, jit: 0.10 },
    /* FULL TILT — DRIEST of the four, deliberately. It fires every 105 ms, so a long tail would
     * smear consecutive shots into a wash; the individual shots have to stay countable. The
     * jitter is the highest here for the same reason: this is the one that would otherwise
     * become a 9.5 Hz drone. */
    smg: { crack: { hp: 1900, dur: 0.038, g: 0.24 }, body: { f0: 200, f1: 70, dur: 0.055, g: 0.15 },
      tail: { lp: 2600, dur: 0.10, g: 0.030 }, mech: { at: 0.030, g: 0.022 }, jit: 0.18 },
    /* SCATTER — the heaviest. Lowest crack, biggest body, long low tail, and the pump is audible
     * because a pump gun's action is half its character. */
    shotgun: { crack: { hp: 700, dur: 0.10, g: 0.38 }, body: { f0: 165, f1: 38, dur: 0.22, g: 0.34 },
      tail: { lp: 1100, dur: 0.46, g: 0.10 }, mech: { at: 0.135, g: 0.055 }, jit: 0.09 },
    /* COLD CALL — the hardest crack and, uniquely, a SLAP: a second quiet tail arriving ~95 ms
     * later, the far wall answering. That delayed return is what makes a rifle read as powerful
     * and far-carrying rather than merely loud, and no amount of gain substitutes for it. */
    sniper: { crack: { hp: 2400, dur: 0.075, g: 0.42 }, body: { f0: 300, f1: 44, dur: 0.20, g: 0.30 },
      tail: { lp: 1500, dur: 0.60, g: 0.085 }, slap: { at: 0.095, lp: 900, dur: 0.34, g: 0.045 },
      mech: { at: 0.30, g: 0.030 }, jit: 0.07 },
  };

  function create(getCtx, opts) {
    const O = opts || {};
    let buf = null, bufCtx = null;

    /* ONE noise buffer, two seconds of it, built once. Every layer of every shot reads a random
     * window out of this, which is both cheaper than allocating per shot and MORE varied — two
     * shots never start at the same sample. */
    function noiseBuf(ac) {
      if (buf && bufCtx === ac) return buf;
      const n = Math.max(1, Math.floor(ac.sampleRate * 2));
      const b = ac.createBuffer(1, n, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      buf = b; bufCtx = ac; return b;
    }

    /* A noise layer: shared buffer, random offset, one filter, exponential decay.
     * ⚠ setTargetAtTime, not linearRamp — impulsive sounds decay exponentially, and a linear ramp
     *   is audibly a fade rather than a decay. */
    function burst(ac, t0, dur, gain, filt, freq, q) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuf(ac);
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = filt; f.frequency.value = freq; if (q) f.Q.value = q;
      const g = ac.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.setTargetAtTime(0.0001, t0, dur * 0.32);
      src.connect(f).connect(g).connect(ac.destination);
      const off = Math.random() * 1.5;
      src.start(t0, off);
      src.stop(t0 + dur + 0.02);
      return 3;
    }

    function thump(ac, t0, f0, f1, dur, gain) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(24, f1), t0 + dur);
      g.gain.setValueAtTime(gain, t0);
      g.gain.setTargetAtTime(0.0001, t0, dur * 0.30);
      o.connect(g).connect(ac.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
      return 2;
    }

    function fire(key, vol) {
      let nodes = 0;
      try {
        const ac = getCtx && getCtx();
        if (!ac || (O.enabled && !O.enabled())) return 0;
        const S = SPEC[key] || SPEC.smg;
        const v = (vol == null ? 1 : vol) * (O.gain == null ? 1 : O.gain);
        if (!(v > 0)) return 0;
        const t0 = ac.currentTime;
        /* ⚑ THE JITTER. One draw per shot, applied to brightness, pitch and level together, so a
         * shot is a little duller AND a little softer rather than three uncorrelated wobbles —
         * which is how a real one varies. */
        const j = (Math.random() * 2 - 1) * S.jit;
        const lvl = v * (1 + j * 0.45);

        nodes += burst(ac, t0, S.crack.dur, S.crack.g * lvl, 'highpass', S.crack.hp * (1 + j * 0.55));
        nodes += thump(ac, t0, S.body.f0 * (1 + j * 0.30), S.body.f1, S.body.dur, S.body.g * lvl);
        nodes += burst(ac, t0 + 0.004, S.tail.dur, S.tail.g * lvl, 'lowpass', S.tail.lp * (1 + j * 0.25));
        if (S.slap) nodes += burst(ac, t0 + S.slap.at, S.slap.dur, S.slap.g * lvl, 'lowpass', S.slap.lp);
        if (S.mech) {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = 'square'; o.frequency.setValueAtTime(1700 * (1 + j * 0.4), t0 + S.mech.at);
          g.gain.setValueAtTime(S.mech.g * lvl, t0 + S.mech.at);
          g.gain.setTargetAtTime(0.0001, t0 + S.mech.at, 0.012);
          o.connect(g).connect(ac.destination);
          o.start(t0 + S.mech.at); o.stop(t0 + S.mech.at + 0.05);
          nodes += 2;
        }
      } catch (e) { /* audio never takes a frame down */ }
      return nodes;
    }

    return { fire, SPEC };
  }

  return { create, SPEC };
})();

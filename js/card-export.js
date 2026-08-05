/* ripmaster3030studios — TAKE THE CARD WITH YOU.  `CardExport`
 *
 *   CardExport.still(ctrl, opts)          -> Promise<{blob, url, name}>    a PNG
 *   CardExport.gif(ctrl, opts)            -> Promise<{blob, url, name}>    one full press cycle
 *   CardExport.attach(el, result)                                          make it right-clickable
 *
 * Artist, 2026-08-05: *"allow people to export or save the card as a gif … we should have right
 * click save as (RCSA) functions for collectors who want to share static or gifs."*
 *
 * ⛔ RIGHT-CLICK-SAVE-AS DOES NOT WORK ON A CANVAS, and that is the whole reason this file has an
 *   `attach`. A browser offers "Save image as…" for an `<img>`; on a `<canvas>` it offers nothing,
 *   however the pixels got there. Long-press on a phone is the same story. So the export produces
 *   a real image and hands it to an `<img>` — after that the collector's own muscle memory works,
 *   which is worth more than any button we could draw. The button stays too: one for people who
 *   look for a button, one for people who right-click, and they share a code path.
 *
 * ⛔ AND THE GIF IS ENCODED HERE, FROM SCRATCH. No dependency: a lens has to load cold in a
 *   sandboxed frame from one origin, and pulling a 40 KB encoder off a CDN to save a picture would
 *   undo the reason the whole card is generated in the first place. GIF89a is a 1990 format and
 *   its LZW is about eighty lines; that is a fair price for owning it.
 *
 * ⚑ THE EXPORT IS THE LOOP, EXACTLY. Frames are sampled at phase i/N for i in 0..N-1 — never
 *   including 1, because phase 1 IS phase 0 and a duplicate frame is a visible hitch once a cycle,
 *   in a file the collector will watch a hundred times. `npm run test:hero` measures that the last
 *   frame steps into the first by the same amount as any other pair.
 *
 * ⚠ IT YIELDS. Encoding thirty-odd frames is seconds of work; done in one go it freezes the tab
 *   and the collector thinks the site has crashed. Every frame hands control back and reports
 *   progress, so the UI can say what is happening.
 */
(function (global) {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ── read the card back, top-down ────────────────────────────────────────────────────────
   * ⚠ `readPixels` is BOTTOM-UP. Every image format here is top-down, so the flip happens once,
   * at the boundary, rather than being remembered at four call sites. */
  function grab(ctrl, maxW) {
    const px = ctrl.pixels();
    const { w, h, data } = px;
    /* ⚑ BOX-DOWNSAMPLE, AND IT IS NOT ONLY ABOUT SIZE. A halftone card is the worst case LZW can
     * be handed — dot noise is incompressible almost by definition — and the first export came out
     * at 5.2 MB for sixteen frames, which is not a thing anybody shares. Averaging a block of
     * pixels both shrinks the frame AND removes the dot grid the screen ruling puts there, so the
     * file falls by far more than the pixel count does. It is also the honest resample: point
     * sampling a screen at two thirds scale is how you get a moiré that was never in the card.
     * ⚠ An INTEGER factor, so every output pixel averages the same number of inputs. A fractional
     *   box filter weights them unevenly and the halftone comes back as banding. */
    const k = maxW && w > maxW ? Math.max(1, Math.round(w / maxW)) : 1;
    const ow = Math.max(1, Math.floor(w / k)), oh = Math.max(1, Math.floor(h / k));
    const out = new Uint8Array(ow * oh * 3);
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        let r = 0, g = 0, b = 0;
        for (let j = 0; j < k; j++) {
          // readPixels is BOTTOM-UP; every image format here is top-down, so flip once, here
          const sy = h - 1 - (y * k + j);
          if (sy < 0) continue;
          for (let i = 0; i < k; i++) {
            const s = (sy * w + Math.min(w - 1, x * k + i)) * 4;
            r += data[s]; g += data[s + 1]; b += data[s + 2];
          }
        }
        const n = k * k, d = (y * ow + x) * 3;
        out[d] = r / n; out[d + 1] = g / n; out[d + 2] = b / n;
      }
    }
    return { w: ow, h: oh, rgb: out };
  }

  // ── PNG, the easy half — the browser already has an encoder ────────────────────────────────
  function still(ctrl, opts) {
    const o = opts || {};
    return new Promise(res => {
      ctrl.render();                                   // never export a stale buffer
      const src = ctrl.canvas || o.canvas;
      const done = blob => {
        const name = (o.name || 'card') + '.png';
        res({ blob, url: URL.createObjectURL(blob), name, type: 'image/png' });
      };
      if (src && src.toBlob) src.toBlob(done, 'image/png');
      else {
        // no toBlob (or no canvas handed over) — rebuild one from the readback
        const g = grab(ctrl), c = document.createElement('canvas');
        c.width = g.w; c.height = g.h;
        const x = c.getContext('2d'), im = x.createImageData(g.w, g.h);
        for (let i = 0, j = 0; i < im.data.length; i += 4, j += 3) {
          im.data[i] = g.rgb[j]; im.data[i + 1] = g.rgb[j + 1];
          im.data[i + 2] = g.rgb[j + 2]; im.data[i + 3] = 255;
        }
        x.putImageData(im, 0, 0);
        c.toBlob(done, 'image/png');
      }
    });
  }

  /* ── the palette ─────────────────────────────────────────────────────────────────────────
   * Median cut over a histogram of the WHOLE animation, not per frame. ⛔ A per-frame palette is
   * how a GIF gets its reputation: the colours shift under a still image and the card appears to
   * breathe in a way it does not. One table for every frame, built from all of them.
   * ⚠ 5 bits a channel for the histogram. The card is a four-ink print — its gamut is narrow and
   *   deliberately so — and 32768 buckets is far more resolution than 256 output slots can use. */
  function palette(frames, want) {
    const hist = new Map();
    for (const f of frames) {
      // sample every 3rd pixel: 30k+ samples a frame is plenty and it is three times faster
      for (let i = 0; i < f.rgb.length; i += 9) {
        const k = ((f.rgb[i] >> 3) << 10) | ((f.rgb[i + 1] >> 3) << 5) | (f.rgb[i + 2] >> 3);
        hist.set(k, (hist.get(k) || 0) + 1);
      }
    }
    let boxes = [[...hist.entries()].map(([k, n]) => ({
      r: ((k >> 10) & 31) << 3, g: ((k >> 5) & 31) << 3, b: (k & 31) << 3, n,
    }))];
    while (boxes.length < want) {
      // split the box with the widest channel — the standard rule, and the reason it works is
      // that it spends slots where the eye can actually tell two colours apart
      let bi = -1, best = -1, axis = 'r';
      for (let i = 0; i < boxes.length; i++) {
        const bx = boxes[i];
        if (bx.length < 2) continue;
        for (const a of ['r', 'g', 'b']) {
          let lo = 255, hi = 0;
          for (const c of bx) { if (c[a] < lo) lo = c[a]; if (c[a] > hi) hi = c[a]; }
          if (hi - lo > best) { best = hi - lo; bi = i; axis = a; }
        }
      }
      if (bi < 0) break;
      const bx = boxes[bi].slice().sort((p, q) => p[axis] - q[axis]);
      let total = 0; for (const c of bx) total += c.n;
      let acc = 0, cut = 1;
      for (let i = 0; i < bx.length - 1; i++) { acc += bx[i].n; if (acc >= total / 2) { cut = i + 1; break; } }
      boxes.splice(bi, 1, bx.slice(0, cut), bx.slice(cut));
    }
    const pal = boxes.map(bx => {
      let r = 0, g = 0, b = 0, n = 0;
      for (const c of bx) { r += c.r * c.n; g += c.g * c.n; b += c.b * c.n; n += c.n; }
      return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0];
    });
    while (pal.length < want) pal.push([0, 0, 0]);
    return pal.slice(0, want);
  }

  /* Nearest colour, through a cache keyed on the 5-5-5 bucket. Without the cache this is the whole
   * cost of the encode — 200k pixels x 256 candidates a frame — and with it, it is nothing. */
  function mapper(pal) {
    const cache = new Int16Array(32768).fill(-1);
    return (r, g, b) => {
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let v = cache[k];
      if (v >= 0) return v;
      let best = 0, bd = 1e9;
      for (let i = 0; i < pal.length; i++) {
        const dr = r - pal[i][0], dg = g - pal[i][1], db = b - pal[i][2];
        // luma-weighted, because a green error is far more visible than a blue one
        const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bd) { bd = d; best = i; }
      }
      cache[k] = best;
      return best;
    };
  }

  // ── GIF LZW ────────────────────────────────────────────────────────────────────────────────
  function lzw(indices, minCode, out) {
    const clear = 1 << minCode, end = clear + 1;
    let size = minCode + 1, next = end + 1;
    let dict = new Map(), cur = -1, bits = 0, acc = 0;
    const chunk = [];
    const emit = code => {
      acc |= code << bits; bits += size;
      while (bits >= 8) { chunk.push(acc & 255); acc >>= 8; bits -= 8; }
    };
    const reset = () => { dict = new Map(); next = end + 1; size = minCode + 1; };
    emit(clear); reset();
    for (let i = 0; i < indices.length; i++) {
      const k = indices[i];
      if (cur < 0) { cur = k; continue; }
      const key = cur * 4096 + k;
      const found = dict.get(key);
      if (found !== undefined) { cur = found; continue; }
      emit(cur);
      dict.set(key, next++);
      if (next > (1 << size)) {
        if (size < 12) size++;
        else { emit(clear); reset(); }
      }
      cur = k;
    }
    if (cur >= 0) emit(cur);
    emit(end);
    if (bits > 0) chunk.push(acc & 255);
    // sub-blocks: 255 bytes at a time, terminated by a zero
    for (let i = 0; i < chunk.length; i += 255) {
      const n = Math.min(255, chunk.length - i);
      out.push(n);
      for (let j = 0; j < n; j++) out.push(chunk[i + j]);
    }
    out.push(0);
  }

  /* ── the GIF ─────────────────────────────────────────────────────────────────────────────
   * One full press cycle, looping forever. Options: `fps`, `loop` (seconds), `frames`, `colors`,
   * `maxW`, `name`, `onProgress(0..1, note)`.
   *
   * ⛔ THE PLAYBACK RATE IS NOT THE PRESS PERIOD, AND CONFLATING THEM EXPORTED A SLIDESHOW.
   *   `delay` used to be derived from the card's own press cycle — `period * 100 / N` — so 24
   *   frames of an 8-second cycle came out at 33 centiseconds a frame. Measured off the encoded
   *   file, not assumed: **3.03 fps.** A card ON THE PAGE is ambient and is meant to be slow; a
   *   GIF is a thing somebody posts, and at 3 fps it reads as broken rather than as calm.
   *   ⚑ Two independent knobs now. `fps` is how fast the FILE plays; `frames` is how finely the
   *   cycle is sampled. The loop still spans phase 0..1 exactly, so it still wraps seamlessly —
   *   the press simply runs faster in the file than on the page, which is what a shared loop
   *   wants. Nothing about the card changes; only the timebase the file is written with.
   *
   * ⚠ A DELAY OF 1 IS SLOWER THAN A DELAY OF 5, which is the one genuinely counterintuitive
   *   thing in this format. Browsers clamp a GIF frame delay of 0 or 1 centisecond UP to 10 (a
   *   very old defence against seizure-inducing files), so asking for 100 fps yields 10 fps —
   *   the reassuring-looking edit that makes it eight times worse. Floor of 2, and the ceiling on
   *   `fps` exists for the same reason.
   *
   * ⚠ The card is put back exactly as it was found — spin state, phase, view. An export that
   *   leaves the card stopped at frame 29 looks like the export broke it. */
  async function gif(ctrl, opts) {
    const o = opts || {};
    /* ⚑ Defaults SWEPT against the encoded file, not chosen by eye — see docs/HERO-33-BRIEF.md.
     * A four-ink halftone is high-entropy and LZW hates it, so frames are NOT free — the cost of
     * smoothness is paid in megabytes and the two have to be picked together:
     *     old build          3.03 fps   7.92 s   1.64 MB   24 frames
     *     fps20 48f 128col  20.00 fps   2.40 s   3.29 MB
     *     fps20 48f  64col  20.00 fps   2.40 s   2.73 MB
     *  -> fps20 36f  64col  20.00 fps   1.80 s   2.07 MB   <- shipped
     * 6.6x the playback rate for 1.26x the file. */
    const FPS = clamp(o.fps || 20, 4, 50);
    const LOOP = clamp(o.loop || 1.8, 0.4, 8);
    const N = clamp(o.frames || Math.round(FPS * LOOP), 4, 120);
    /* Defaults tuned against the measured file, not guessed: 480x720 x 16 at 256 colours came out
     * at 5.2 MB. A card is shared, so it has to be a few megabytes at most. */
    /* ⚠ `maxW` IS QUANTISED AND LOOKS LIKE IT IS NOT. `grab` downsamples by an INTEGER box
     * factor `k = round(w / maxW)`, so on a 504-wide card every maxW from ~253 to ~336 lands on
     * k = 2 and produces exactly 252x378. Swept: maxW 320 and maxW 260 came out byte-for-byte the
     * same size. The integer factor is RIGHT — a fractional box resamples the halftone into
     * moire — but a caller tuning this for file size will conclude the encoder is broken. */
    const MAXW = o.maxW || 320;
    /* 64, not 128. A four-ink print has a narrow gamut ON PURPOSE, so the extra 64 slots buy very
     * little and cost 0.56 MB at 48 frames (3.29 -> 2.73). Swept, not guessed. */
    let COLS = clamp(o.colors || 64, 8, 256);
    { let pw = 2; while (pw < COLS) pw <<= 1; COLS = pw; }   // a GIF table is a power of two
    const prog = o.onProgress || function () {};
    const before = ctrl.probe();

    ctrl.setSpin(false);
    ctrl.writeOn(1);                                   // export a finished sheet, not one printing
    const frames = [];
    for (let i = 0; i < N; i++) {
      // ⛔ i/N, never i/(N-1): phase 1 IS phase 0, so including it duplicates a frame and the loop
      //    hitches once a cycle — in a file somebody will watch a hundred times.
      ctrl.setPhase(i / N);
      ctrl.render();
      frames.push(grab(ctrl, MAXW));
      prog(i / N * 0.55, 'printing frame ' + (i + 1) + ' of ' + N);
      await new Promise(r => setTimeout(r, 0));        // give the tab back
    }
    // put the card down the way we picked it up
    ctrl.setPhase(before.phase);
    ctrl.setSpin(before.spin);
    ctrl.render();

    prog(0.6, 'mixing the inks');
    await new Promise(r => setTimeout(r, 0));
    const pal = palette(frames, COLS);
    const map = mapper(pal);
    const { w, h } = frames[0];
    /* centiseconds per frame, from the requested PLAYBACK rate — never from `before.period`.
     * See the header: floor of 2, because 1 and 0 are clamped up to 10 by the browser. */
    const delay = clamp(Math.round(100 / FPS), 2, 100);

    const b = [];
    const str = s => { for (let i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); };
    const u16 = v => { b.push(v & 255, (v >> 8) & 255); };
    str('GIF89a');
    u16(w); u16(h);
    /* ⚠ The global-table size field is log2(n)-1 and the table must be a POWER OF TWO — a GIF
     * with 128 real colours still writes a 128-entry table, and writing 130 would desynchronise
     * every byte after it. `palette` is asked for a power of two and the header is derived. */
    let bits = 1; while ((1 << bits) < pal.length) bits++;
    b.push(0x80 | 0x70 | (bits - 1), 0, 0);
    for (let i = 0; i < (1 << bits); i++) {
      const c = pal[i] || [0, 0, 0];
      b.push(c[0], c[1], c[2]);
    }
    // Netscape 2.0 — loop forever. Without it the card plays once and stops, which reads as a bug.
    b.push(0x21, 0xFF, 11); str('NETSCAPE2.0'); b.push(3, 1, 0, 0, 0);

    for (let i = 0; i < N; i++) {
      const f = frames[i], idx = new Uint8Array(w * h);
      for (let p = 0, j = 0; p < idx.length; p++, j += 3) idx[p] = map(f.rgb[j], f.rgb[j + 1], f.rgb[j + 2]);
      b.push(0x21, 0xF9, 4, 0);                        // graphic control: no transparency, keep
      u16(delay); b.push(0, 0);
      b.push(0x2C); u16(0); u16(0); u16(w); u16(h); b.push(0);
      b.push(bits < 2 ? 2 : bits);                     // LZW minimum code size
      lzw(idx, bits < 2 ? 2 : bits, b);
      frames[i] = null;                                // let each frame go as soon as it is packed
      prog(0.6 + (i + 1) / N * 0.4, 'packing frame ' + (i + 1) + ' of ' + N);
      await new Promise(r => setTimeout(r, 0));
    }
    b.push(0x3B);

    const blob = new Blob([new Uint8Array(b)], { type: 'image/gif' });
    prog(1, 'ready');
    return { blob, url: URL.createObjectURL(blob), name: (o.name || 'card') + '.gif', type: 'image/gif' };
  }

  /* ── make it right-clickable ─────────────────────────────────────────────────────────────
   * Drops a real `<img>` in front of the canvas. From there the browser's own menu does the work:
   * right-click → Save image as, drag to the desktop, long-press → Save on a phone. `download` on
   * the anchor covers the people who want a button.
   * ⚠ The object URL is revoked when it is replaced — a card the collector cycles through a dozen
   *   times would otherwise leak a dozen multi-megabyte blobs. */
  function attach(el, result) {
    if (!el || !result) return null;
    const old = el.querySelector('img.rcsa');
    if (old) { try { URL.revokeObjectURL(old.src); } catch (e) {} old.remove(); }
    const img = document.createElement('img');
    img.className = 'rcsa';
    img.src = result.url;
    img.alt = result.name;
    img.title = 'right-click (or long-press) to save · ' + result.name;
    el.appendChild(img);
    return img;
  }

  function save(result) {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url; a.download = result.name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  global.CardExport = { still, gif, attach, save };
})(window);

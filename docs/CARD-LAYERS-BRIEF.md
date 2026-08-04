# Painting the 100 cards so they have DEPTH

*For Gianni. One page of what to do, then the reasoning if you want it.*
*Companion to `docs/DESIGN-SYSTEM.md`. The schema this feeds is `js/card-layers.js`.*

---

## The ask, in four lines

When you finish a card, **don't flatten it.** Export each group as its own full-canvas PNG with
transparency, named `00-bg`, `01-…`, `02-…` upward, and drop the folder in. That's it. The card
then has real depth: the plates sit at different distances, they slide against each other as the
pointer moves, and the light rakes the front ones first.

**Nothing changes about how you paint.** This is an export habit, not a technique.

---

## What to hand over

```
models/cards/<card-number>/layers/
    00-bg.png          the world behind everything      ← must be COMPLETE
    01-mid.png         whatever sits between
    02-subject.png     the figure / the thing
    03-frame.png       border, rules, ornament          (optional)
    04-text.png        the type                         (optional)
```

- **PNG, transparency on, same canvas size for every plate.** 1024 × 1536 is the working size.
- **3 to 7 plates.** Two is not depth. More than seven is invisible and costs a megabyte.
- **Number them back to front.** The numbers are the stacking order — that's all they mean.
- Then somebody runs `npm run cardlayers` and it appears in the folder.

---

## The one rule that matters

### ⛔ THE BACKGROUND PLATE MUST BE WHOLE

Paint the background **as if the figure were not there** — all the way behind it, no hole.

This is the whole ballgame. When the card tilts, the subject slides across the background and
*uncovers* what's behind it. If the background has a subject-shaped gap, you see straight through
the card. It's the difference between depth and a sticker with a hole punched in it.

If it's already painted with a hole in it, painting in the missing patch takes a minute and is the
single highest-value minute in this process.

The same goes, less strictly, for any middle plate that something else overlaps.

---

## Four things that quietly kill it

1. **Subject and background on one layer.** Nothing to separate. This is the most common one and
   it can't be fixed downstream — see the honest note at the bottom about what happens when we try.
2. **A plate covering ~the whole card.** If your "subject" plate is 95% of the frame, that isn't a
   separation, it's the card with a rim lifted off it. It reads as flat and costs a megabyte.
3. **Effects flattened onto the wrong plate.** A glow or shadow belongs on the plate that *casts*
   it, or on its own. Baked into the background it detaches and floats.
4. **Slicing into horizontal bands.** Cutting a card into strips is a real look and one of yours
   uses it — but it's a *creative* cut, an art decision, not a separation. If you want it, say so;
   it shouldn't be inferred.

---

## What you get for it

- **Parallax.** The plates move against each other as the card tilts, so it has thickness.
- **A raked key light** that hits the front plates before the back ones.
- **Optional relief.** Drop a `00-bg.n.png` beside a plate (a normal map) and that plate takes
  light like it has surface — ink sitting on stock, embossing, foil.
- It's the same page a token's `animation_url` frames, so this *is* what a collector sees.

---

## Where it stands today

**Six cards have real stacks — 36, 42, 44, 45, 47, 49.** They're in the folder under **◈ DEPTH**
(`cards/binder.html`), or straight to one: `cards/lens3d.html?hero=42`. Go and move the pointer
over 42; that's seven plates and it's the honest version of what this is for.

**And here is the part worth knowing.** Those six were not chosen — they're what *survived*. We ran
a separator over all fifteen existing hero cards and **kept six**. The other nine produced layer
files that load, parse and render, and are fakes:

- **34, 38, 41, 43, 48** — the art has no separable background, so the tool fell back to splitting
  it on colour. That's inventing depth that was never painted, and it looks like it.
- **35, 40, 46** — the "subject" came out at 95–98% of the frame. Not a separation. 46's text plate
  came out empty.
- **37** — passed every numeric check, and the render shows **the face sheared in half** along a
  skin-tone boundary with a slab of forehead floating on its own plane.

That's a 40% hit rate, with per-card hand-tuning and a human looking at every result. **It does not
scale to 100, and it shouldn't have to** — every one of those failures is a machine guessing at
depth you already knew when you painted it. Ten seconds of export beats an afternoon of inference,
and the result is yours instead of a segmenter's.

---

## Cost, so it's not a surprise

About **1.3 MB per card** of plates at current settings, so 100 cards is ~130 MB. That's too much
to ship as-is and it's our problem, not yours — we'll compress and size-tier it. **Export at full
quality; don't pre-optimise.** Just know that a card with seven plates costs seven times a card
with one, which is the real reason for the 3-to-7 guidance.

---

## If you only remember one thing

**Finish the background behind the figure, and send the layers unflattened.**

Everything else on this page is detail.

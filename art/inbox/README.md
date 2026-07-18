# art/inbox — drop zone

Curated Midjourney exports land here before ingestion.

**Naming:** `s{season}-c{card}-{slug}-v{take}.png` → `s01-c04-the-egg-v2.png`

**Ingest:**

```bash
node scripts/make-card.mjs \
  --img art/inbox/s01-c04-the-egg-v2.png \
  --name "The Egg" --season 1 --number 4 --of 16 \
  --scripture "the cosmic egg" --season-title "Origins" \
  --prompt "<the exact Midjourney prompt>" \
  --seed "<seed> / <sref set>"
```

The script copies the image to `cards/art/`, wraps it in the live foil template, and
writes `cards/the-egg.html`. Prompt + seed are preserved in the card's provenance
comment so every card's DNA is reproducible. Commit both files; the site updates.

Export at 2× upscale (≥1600px on the short edge) — the art window crops to 5:7 via
`object-fit: cover`, so keep the subject centered.

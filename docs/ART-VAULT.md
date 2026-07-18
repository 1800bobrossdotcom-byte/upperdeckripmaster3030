# The Art Vault — uploading thousands of curated cards

You're curating a large collection by hand. Here's the shape that keeps it fast to
upload, cheap to host, and one command to ingest.

## TL;DR

1. Make a **separate repo** for the collection (the "vault"), e.g. `ripmaster-art-vault`.
   This site repo stays small — it only ever holds the cards actually published.
2. In the vault, use **one folder per season** and the naming convention below.
3. Add a `manifest.json` for card names/flavor (optional but worth it).
4. Tell Claude to add the vault repo to the session, and batches ingest with:
   `node scripts/ingest-batch.mjs --dir ../ripmaster-art-vault/season-01 --manifest ../ripmaster-art-vault/manifest.json`

For small batches right now (dozens, not thousands), skip the vault and just drop files
into `art/inbox/` in this repo — same naming, same command.

## Naming convention (the ingest script parses this)

```
s{season}-c{card}-{slug}[-v{take}].{png|jpg|webp|gif}

s01-c04-the-egg.png          season 1, card 4
s01-c04-the-egg-v2.png       a later take — highest -v wins automatically
```

Vault layout:

```
ripmaster-art-vault/
  manifest.json
  season-01/  s01-c01-the-vine-v1.png …
  season-02/  s02-c01-the-drip-v1.png …
  masters/    (optional: full-res originals, see size notes)
```

## manifest.json (optional, keyed by filename or slug)

```json
{
  "the-vine":              { "flavor": "tangled in neon", "prompt": "…", "seed": "777 / sref-bloom-v1" },
  "s01-c04-the-egg-v2.png": { "name": "The Egg", "flavor": "hatched from the cosmic soup", "of": 16 }
}
```

Anything missing is derived: name from the slug ("the-cosmic-frog" → "The Cosmic Frog"),
season title from the season number (Bloom/Melt/Fractal/Void). Prompt/seed go into the
card page's provenance comment — worth recording while you still remember them.

## Size math (matters at thousands of files)

GitHub's practical limits: **100MB hard cap per file**, ~25MB per file through the
browser upload UI (use `git push` from a computer for more), and repos are comfortable
up to ~1–2GB, warning territory ~5GB.

- 2K PNG exports run ~2–6MB each → 3,000 cards ≈ **10–20GB**. That will not fit well in
  any single GitHub repo.
- Same images as **WebP quality ~90** run ~300–600KB → 3,000 cards ≈ **1–2GB**. Fits.

Recommendation: keep your full-res PNG masters wherever you like (local drive, cloud
storage — and eventually Arweave/IPFS for whatever gets minted, which needs permanent
hosting anyway), and put **web-optimized WebP copies** in the vault repo. The foil card
pages display beautifully from a 1200–1600px WebP. Batch conversion:

```bash
# ImageMagick
magick mogrify -format webp -quality 90 -resize 1600x2240 *.png
```

Avoid Git LFS for this: it has storage/bandwidth quotas, and GitHub Pages doesn't serve
LFS files (cards published to the site would 404).

## The flow, end to end

1. You curate → export → name per convention → push to the vault repo.
2. Say the word and Claude pulls the vault into the session, runs the batch ingest, and
   every image becomes a live foil card page + a tile in the deck gallery (`cards/`).
3. Curation stays manual: only the candidates you pick get copied into a season's
   ballot; the vault can hold everything else indefinitely.

## One rule for what goes in

The vault can privately hold anything. But anything **published to the site or minted**
must pass the IP filter in `prompts/PROMPT-KIT.md` §3 — public-domain-era character
designs only (pre-1931 versions), no protected characters (Bart, Bugs, modern Mickey…),
character names never in card titles or branding.

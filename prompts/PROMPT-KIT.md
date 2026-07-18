# Midjourney Prompt Kit — v1

The system for generating card art. Goal: every render looks like it fell out of the same
blessed foil pack — vintage occult trading card × rubber-hose cartoon × blacklight
psychedelia — with **zero text in the art** (the HTML frame supplies all typography, so
names/numbers stay crisp, editable, and localizable).

## 1. The base style block

Append to every card prompt:

```
vintage occult tarot trading card art, 1920s rubber-hose cartoon character, pie-cut eyes,
noodle limbs, white gloves, psychedelic blacklight poster palette, holographic foil
texture, prismatic light leak, ornate engraved art-nouveau frame, halftone print grain,
aged card stock, centered single figure, full body, flat background rays
--ar 5:7 --stylize 400 --chaos 10
--no text, letters, words, numbers, typography, caption, watermark, signature, border text
```

Notes:

- `--ar 5:7` = trading card. For **pog variants** use `--ar 1:1` and add
  `circular composition, mandala symmetry` (the site crops to a circle).
- `--no ... text ...` is the reliable way to suppress lettering; also avoid words like
  "poster" alone (invites titles). If a render sneaks glyphs in, vary or outpaint them away.
- Keep `--chaos` low-ish (5–15): the deck must feel like one printing press.

## 2. Locking the aesthetic with style references

Consistency across dozens of cards is the hard part. Use Midjourney's style reference
(verified against the July 2026 docs — flagship model is **V8.1**, default since June 10, 2026):

1. Pick 3–5 of the strongest existing example cards (the ones that define the vibe).
2. Upload them and pass as `--sref <url1> <url2> ...` with `--sw` (style weight,
   0–1000, default 100) ~200–400. Numeric sref *codes* also work (`--sv 6` algorithm).
3. Once a generated card nails it, **freeze that render's URL as the canonical sref set**
   for the whole season — every season can have its own sref "printing plate."
4. **Pin the model version too** (`--v 8.1`): sref behavior is not guaranteed stable
   across model versions (the docs explicitly warn old codes drifted between V6 → V7).
5. Record the exact `--sref` set + `--seed` + model version in the card's front-matter
   when ingesting (see `scripts/make-card.mjs`) so any card can be re-run later.

For recurring characters, `--oref` (omni reference) exists but is **V7-only** as of
July 2026 (using it silently falls back to V7, 2× GPU cost) — prefer describing the
character's era design in words + sref, and save oref for stubborn cases.

## 3. The character roster (IP tiers)

The example cards lean on famous characters — some are now free to use, some are lawsuits.
**Tier A is the deck.** It happens to be *exactly* the rubber-hose era the aesthetic wants.

**Tier A — US public domain (early versions only; verified July 2026, sources in
`docs/RESEARCH-NOTES.md`):**

| Character | US-PD since | Use the… |
|---|---|---|
| Mickey / Minnie (Steamboat Willie era) | 2024–26 | 1928–30 B&W pie-eyed design (white gloves are PD via the 1929 shorts); never color, pupils, or red-shorts branding |
| Oswald the Lucky Rabbit | 2023 | 1927 shorts design |
| Felix the Cat | silent era | pre-1931 Felix only — name/likeness are live NBCU trademarks, 1950s TV Felix still protected |
| Koko the Clown (+ Fitz the dog) | 1918–29 | Fleischer inkwell look — one of the safest picks available |
| Popeye (E.C. Segar strip) | 2025 | 1929 Thimble Theatre design; **no spinach imagery** (unverified), no Bluto (1932) |
| Betty Boop (Dizzy Dishes) | 2026 | the 1930 **poodle-eared dog-form proto-Betty** ONLY — the iconic human Betty is 1931–32 and still claimed |
| "Rover" (proto-Pluto) | 2026 | the 1930 bloodhound design — the *name* Pluto is 1931, not PD until 2027 |
| Bimbo | 2026 | the 1930 all-white form (the black-dog design is ~1931 → 2027) |
| Flip the Frog | 2026 | Ub Iwerks' 1930 *Fiddlesticks* design |
| The Skeleton Dance skeletons | 2025 | 1929 Silly Symphony — perfect for the deck |

The 2026 rule of thumb: **US works published through 1930 are PD**, and only the design
*as it appeared then*. Each January 1 unlocks another year (1931's designs — named Pluto,
black-dog Bimbo — arrive in 2027).

Dropped from the roster after verification: **Tintin** (US-PD but EU-protected until
2054 with a litigious rightsholder — NFTs sell globally) and **Bosko** (PD, but the
character is a racial caricature — reputational poison for the project).

**Tier B — NOT public domain:** Bart Simpson (~2083), Bugs Bunny (2036), Woody
Woodpecker (2036), Daffy (2033), Tom & Jerry (2036), Donald (2030), modern Mickey.
Parody defenses for *selling* character merchandise are historically weak — *Disney v.
Air Pirates* (9th Cir. 1978) lost on almost exactly this fact pattern (psychedelic
counterculture Mickey comics), and *Hermès v. Rothschild* (MetaBirkins, 2023) is the
controlling NFT precedent. Keep Tier B out of minted cards. If the style whispers an
homage, make it generic ("a yellow spiky-haired imp", "a wisecracking grey hare") —
the era look, never the protected character.

**Trademark trap:** copyright expiry doesn't kill trademarks (Disney's Steamboat Willie
marks, Fleischer's BETTY BOOP marks, NBCU's Felix marks, King Features' POPEYE marks).
Rules: character names never appear in the project's branding, collection title, or card
titles (our card names are "The Serpent", not "Felix card"); characters live *inside*
the expressive art only; ship a "not affiliated with or endorsed by…" disclaimer on the
site and in collection metadata. An IP attorney should see the final card set before a
mainnet mint — this file is research, not legal advice.

## 4. Season 1 — "Origins" candidate list

Sixteen candidates; 8 survive the burn. Format: **subject line + base style block**.

1. **The Serpent** — `1930 poodle-eared proto-Betty Boop as the serpent of Eden coiled around a glowing forbidden fruit tree, hypnotic spiral eyes, garden of neon flowers`
2. **The Light** — `Koko the Clown pouring liquid light out of an inkwell splitting darkness in half, rays of first dawn`
3. **The Waters Divided** — `Steamboat Willie era mouse captain steering a paddle-wheel boat between two towering walls of sea, moon overhead`
4. **The Egg** — `Felix the Cat meditating atop an enormous cracked cosmic egg, galaxies leaking out, lotus position`
5. **The Gardener** — `Oswald the Lucky Rabbit planting stars in black soil like seeds, watering can pouring the milky way`
6. **The Naming** — `Bimbo the dog surrounded by a spiral parade of rubber-hose animals awaiting names, procession mandala`
7. **The Tower** — `Flip the Frog stacking a spiraling ziggurat of gramophones and player pianos toward a wrathful sun`
8. **The Rib** — `two mirrored rubber-hose figures emerging from one glowing ribcage flower, symmetrical`
9. **The Flood Seed** — `Popeye the sailor hammering one golden nail into an ark hull under a bruised violet storm sky`
10. **The First Fire** — `Felix the Cat juggling stolen embers, feather-serpent watching from a pyramid, Popol Vuh jungle`
11. **The Churning Sea** — `rubber-hose monkey spirit churning an ocean of milk with a mountain, nectar droplets rising` *(Samudra Manthana)*
12. **The Dreaming** — `Koko the Clown asleep on a crescent moon dreaming a river of animals into being, songline dots`
13. **The Clay** — `the Skeleton Dance skeletons as potters spinning a little glowing golem on a wheel, breath of life spiral`
14. **The Word** — `Oswald the Lucky Rabbit blowing a trumpet whose sound-waves are visible as blooming geometry` *(no glyphs — pure waveform)*
15. **The Apple Core** — `a single enormous bitten fruit revealing a tiny paradise inside, rubber-hose birds circling`
16. **The Seventh Day** — `Steamboat Willie era mouse asleep in a hammock strung between two planets, tools downed, halo`

## 5. Chain-imagined candidates (the "CLI dreams" lane)

Weekly, let Ethereum propose a card (artist always curates the result):

```
seed   = latest block hash
pick   scripture  = SCRIPTURES[seed % len]        (table below)
pick   character  = TIER_A[seed >> 8 % len]
pick   palette    = PALETTES[seed >> 16 % len]
pick   chaos      = 5 + (seed >> 24 % 10)
```

- `SCRIPTURES`: Genesis · Exodus · Psalms · Revelation · Tao Te Ching · Dhammapada ·
  Bhagavad Gita · Popol Vuh · Book of the Dead · Eddas · Gilgamesh · Analects
- `PALETTES`: blacklight pink/purple · acid green/gold · teal/rust hyperfoil ·
  candy mosaic · sepia + one neon · negative holo (dark foil)

The block hash goes in the card's provenance line — every "imagined" card is a receipt
of the moment the chain dreamed it.

## 6. Batch workflow (until Midjourney has a sanctioned API)

Verified July 2026: Midjourney has **no public API** (only an application-gated
Enterprise API survey from July 2025), and the current ToS (effective May 27, 2026) says
outright: *"You may not use automated tools to access, interact with, or generate Assets
through the Services."* Third-party "Midjourney API" wrappers and Discord bots automate a
real account and get accounts banned. So: **manual ritual, automated everything-else** —
and the manual part is less manual than it sounds:

- **Permutation prompts**: `{The Serpent…, The Egg…, The Tower…}` fans one submission out
  into one job per option — nestable, works on parameters too (`--ar {5:7, 1:1}`).
- **`--repeat N`** re-runs a prompt N times for variety mining.
- Plan limits: 4 jobs/submission on Basic, 10 Standard, **40 Pro/Mega**; both features
  are Fast/Turbo-mode only. A whole season's candidate pool is 2–3 submissions.
- **Run batch as HD** (web) re-renders a seed-locked batch at native 2K.

The loop:

1. Claude drafts/refines the season's prompt batch (this file) → one permutation block.
2. Paste into the Midjourney web app with the season's pinned `--sref` + `--v 8.1`.
3. Reroll/vary taste, run keepers as HD, export PNG ≥2048px, name `s01-c07-the-tower-v2.png`.
4. Drop into `art/inbox/` → `scripts/make-card.mjs` → live foil card page in `cards/`
   → commit → the site updates.

Log every keeper's prompt + seed + sref + model version in the card page's front-matter
comment so the deck's DNA is reproducible. If the Enterprise API ever opens, the ingest
pipeline is already API-shaped — only step 2 changes.

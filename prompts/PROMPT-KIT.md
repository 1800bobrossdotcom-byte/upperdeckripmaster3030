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

Consistency across dozens of cards is the hard part. Use Midjourney's style reference:

1. Pick 3–5 of the strongest existing example cards (the ones that define the vibe).
2. Upload them and pass as `--sref <url1> <url2> ...` with `--sw` (style weight) ~200–400.
3. Once a generated card nails it, **freeze that render's URL as the canonical sref set**
   for the whole season — every season can have its own sref "printing plate."
4. Record the exact `--sref` set + `--seed` in the card's front-matter when ingesting
   (see `scripts/make-card.mjs`) so any card can be re-run or varianted later.

## 3. The character roster (IP tiers)

The example cards lean on famous characters — some are now free to use, some are lawsuits.
**Tier A is the deck.** It happens to be *exactly* the rubber-hose era the aesthetic wants.

**Tier A — US public domain (early versions only):**

| Character | PD since | Use the… |
|---|---|---|
| Mickey (Steamboat Willie / Plane Crazy) | 2024 | 1928 design: no red shorts branding, no modern face |
| Oswald the Lucky Rabbit | 2023* | 1927 shorts design |
| Felix the Cat | early films PD | classic silent-era Felix |
| Koko the Clown | silent era | Fleischer inkwell look |
| Popeye (E.C. Segar comic) | 2025 | 1929 Thimble Theatre design |
| Betty Boop (Dizzy Dishes) | 2026 | 1930 proto-Betty (dog-eared bob!) — a gift for this deck |
| Bimbo | 1930 era | Fleischer design |
| Bosko | 1929–30 | earliest shorts |
| Buck Rogers / Tintin (1929) | US-PD nuance | caution: Tintin still protected in EU |

\* verify each before a card ships — see `docs/` research notes; the rule of thumb in 2026
is **works published through 1930 are US-PD**, and only the *design as it appeared then*.

**Tier B — NOT public domain (Bart, Bugs, Woody Woodpecker, Daffy, modern Mickey, etc.):**
parody defenses for *selling* character merchandise are historically weak (Disney v. Air
Pirates; Hermès v. Rothschild for NFTs specifically). Recommendation: keep Tier B out of
minted cards. If the style whispers an homage, make it generic ("a yellow spiky-haired
imp", "a wisecracking grey hare") — the era look, never the protected character.

**Trademark trap:** even PD Mickey is still a Disney *trademark* for many goods — don't
use him as the project's logo/branding; inside card art as expressive work is the safer lane.

## 4. Season 1 — "Origins" candidate list

Sixteen candidates; 8 survive the burn. Format: **subject line + base style block**.

1. **The Serpent** — `proto-Betty Boop as the serpent of Eden coiled around a glowing forbidden fruit tree, hypnotic spiral eyes, garden of neon flowers`
2. **The Light** — `Koko the Clown pouring liquid light out of an inkwell splitting darkness in half, rays of first dawn`
3. **The Waters Divided** — `Steamboat Willie era mouse captain steering a paddle-wheel boat between two towering walls of sea, moon overhead`
4. **The Egg** — `Felix the Cat meditating atop an enormous cracked cosmic egg, galaxies leaking out, lotus position`
5. **The Gardener** — `Oswald the Lucky Rabbit planting stars in black soil like seeds, watering can pouring the milky way`
6. **The Naming** — `Bimbo the dog surrounded by a spiral parade of rubber-hose animals awaiting names, procession mandala`
7. **The Tower** — `Bosko stacking a spiraling ziggurat of gramophones and player pianos toward a wrathful sun`
8. **The Rib** — `two mirrored rubber-hose figures emerging from one glowing ribcage flower, symmetrical`
9. **The Flood Seed** — `Popeye the sailor hammering one golden nail into an ark hull under a bruised violet storm sky`
10. **The First Fire** — `Felix the Cat juggling stolen embers, feather-serpent watching from a pyramid, Popol Vuh jungle`
11. **The Churning Sea** — `rubber-hose monkey spirit churning an ocean of milk with a mountain, nectar droplets rising` *(Samudra Manthana)*
12. **The Dreaming** — `Koko the Clown asleep on a crescent moon dreaming a river of animals into being, songline dots`
13. **The Clay** — `proto-Betty Boop as a potter spinning a little glowing golem on a wheel, breath of life spiral`
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

Automating Midjourney's Discord/web with bots risks the account — treat generation as a
**manual ritual with automated everything-else**:

1. Claude drafts/refines the season's prompt batch (this file).
2. You paste prompts into Midjourney (web app; use the same sref set), 4-up, reroll taste.
3. Upscale keepers, export PNG, name `s01-c07-the-tower-v2.png`.
4. Drop into `art/inbox/` → run `scripts/make-card.mjs` → live foil card page appears in
   `cards/` → commit → the site updates.

Log every keeper's prompt + seed + sref in the card page's front-matter comment so the
deck's DNA is reproducible.

# 3030 — the album this studio is named after, as art direction

> Artist directive: *"research the album deltron 3030 and lets creatively use all the lyrics as
> art direction inspiration in all we do — incorporate in game design, site design, card design."*

**The `3030` in `ripmaster3030studios` is Deltron 3030.** That has been the unstated lineage all
along; this file makes it operative — a source to design *from*, the way `docs/CC0-SOURCES.md` is a
source to model from.

---

## ⛔ The line, drawn exactly where this repo already draws it

`docs/CC0-SOURCES.md` and `js/section9-skin.js`'s CAST already establish the studio's rule for
working from a source: **a thing may be INFORMED by a source and may never be NAMED after one.**
Every CC0-derived body carries a ripmaster3030studios name, never its source's. The same rule
binds here, and one more besides:

- ⛔ **NO LYRICS. Not a line, not a phrase, not "just a couple of words."** Lyrics are copyrighted
  and this repo is a public, deployed, commercial project with a token attached. Nothing quoted
  goes into copy, card text, card names, asset filenames, code comments, commit messages or the
  whitepaper. The artist's brief says "use all the lyrics as inspiration" — **inspiration is what
  we take; the words stay where they are.** What follows is the album's WORLD and STRUCTURE, which
  are ideas, and ideas are free.
- ⛔ **No artist names, no album art, no track titles on public surfaces**, and nothing implying
  endorsement or affiliation. Influence is not a collaboration.
- ✅ **`3030` as a numeral is fine and is already the homage.** It is a number in a studio name,
  which is what it has always been.
- ⚠ If a surface ever *needs* to acknowledge the debt, it goes in `CREDITS.md` as plain influence
  — the same place the CC0 sources are named — and nowhere else.

---

## What the album actually is

A 2000 rap opera set in the year 3030. **Deltron Zero** — a disillusioned mech soldier and
interplanetary computer prodigy — rebels against a 31st-century New World Order in which corporate
oligarchs have suppressed both human rights and hip-hop. He fights his way up through a series of
**rap battles** to become Galactic Rhyme Federation Champion. He goes home to celebrate, is
ambushed, and **has his memory wiped** — and the world falls back into darkness.

Twenty-one tracks: **ten songs and eleven short interludes**, most under a minute — fake newscasts,
fake ads, fake film reviews. Dense, eerie production; orchestral samples against electronics;
turntablism as a live physical hand on the machine. Afrofuturist lineage, Sun Ra and Clinton.

⚑ **Read that paragraph next to this project's own `CLAUDE.md` ethos section.** The anti-casino.
The parody of crypto/KOL/meme-coin culture "as art, safely — generic archetypes, clearly satire,
never deceptive." Battles where the prize is a title rather than a payout. A token that **burns so
the art can live.** The album is not a new direction for this studio; it is the thing the studio
was already doing, with a map.

---

## The five ideas worth stealing (and they are ideas, not words)

### 1 · THE INTERLUDE IS NOT FILLER — it is how the world gets built
Eleven of twenty-one tracks are under a minute, and they are fake news bulletins, fake commercials,
fake criticism. The songs carry the plot; **the interstitials carry the world.**

⚑ This studio is full of interstitial surfaces that are currently doing nothing: the loading moment
before a match, the between-round screen, the wave-clear banner, the pack-rip pause, the card back,
the 404. Every one of them is a place a fake broadcast from 3030 could live. **Treat dead time as
inventory.**

### 2 · CORPORATE VOICE AS THE ENEMY, AND AS THE TYPOGRAPHY
The album's dystopia is *branded*. Its interludes are sponsored. The oppressor has a marketing
department.

Direction: the studio's UI chrome should read as **the corporation's**, and the art should read as
**the resistance's**. That is a legible split we already half-have — machine-precise grids and
tickers (`js/s9pc-ui.js`, the market ticker, the HUD) against hand-drawn saturated ink (the Fake
Rares lineage in `DESIGN-SYSTEM.md` §6). ⚑ **Make the split deliberate: anything the system says to
you is corporate; anything a person made is hand-drawn.** Never mix them in one element.

### 3 · THE BATTLE IS A PERFORMANCE, NOT A KILL
Deltron ascends by *out-performing* opponents in front of an audience. The prize is a **title**.

⚑ This is already the studio's stated design ("the win in the cabinets is a title/lens/moment, not
a payout") and it should be made louder: NEON RONIN and Section 9 should feel **watched**. Crowd
presence, a title card on victory, a name that gets recorded. The 22 earned Season-1 game titles in
model v2.2 are exactly this mechanic and they are currently invisible.

### 4 · UPGRADE, VIRUS, TURBULENCE — the vocabulary of a body under load
The album's recurring register is *systems degrading and being patched*: upgrades, viruses,
turbulence, slippage. Not clean chrome futurism — **a future that is worn, patched and glitching.**

Direction: our materials should show **wear and intervention**, not polish. `DESIGN-SYSTEM.md` §7
already rejects "smooth premium CG" in favour of "printed, stamped, slightly misregistered." This
is the same instruction from a different direction, and it applies to the games too: the arenas
should look repaired, the HUD should look like it has been running for thirty years.

### 5 · THE ENDING IS MEMORY LOSS, AND THAT IS THE BURN
He wins, and it is taken. The record does not survive.

⚑ **This is the token mechanic, exactly.** `$3030` burns permanently; the burn is the one
irreversible thing in the whole system. The album ends on erasure; our economy is *built* on it.
⚠ And the counterweight is already written into model v2.2: **cards never retire, never ash.** The
token forgets; the cards remember. That tension is the studio's story and it should be said out
loud on the tokenomics page rather than left as an accident of the design.

---

## Concrete, per surface

### Card design
- **The back is a broadcast.** Card backs already carry trait tags and factoids
  (`DESIGN-SYSTEM.md` lineage, task #33). Give them a **transmission frame** — a dateline from
  3030, a subsidiary-of imprint, a signal-quality mark. Every card becomes a page out of the
  world's own media.
- **Rarity as signal integrity**, not as a gem colour. Common = clean scan; higher tiers = the
  scan degrades or is *corrected* — a stamp, an overprint, a redaction. Wear that means something.
- ⚠ The genesis 33 are 1/1 heroes and should read as **the resistance** (hand-drawn, ink); the 67
  field cards can read as **catalogue stock** (registered, printed, systematic). That is the §2
  split expressed as a deck.

### Site design
- The **marquee already is a broadcast** — torches, a scrolling strip, a countdown. Lean in: the
  ticker becomes a wire service, the "fresh paint ships daily" strip becomes station identification.
- **`whitepaper` / `tokenomics` / `audit` are the corporate voice by nature.** Set them properly
  as corporate documents rather than fighting it — that is the joke, and it is a safe one because
  the pages are factually honest underneath. ⚠ NFA disclaimers stay plain and legible; the parody
  never touches the parts a person relies on to make a decision.
- The **404 and the gate** are the two most under-used surfaces on the site.

### Game design
- **Section 9's arenas are corporate property.** Sponsor plates, subsidiary marks, safety notices
  in a house typeface — all generated, all fictional, none referencing a real company. The graffiti
  system (already generated, seeded per map) is the resistance's half of the same wall.
- **NEON RONIN is the title fight.** It has a roster, unlock rules and archetypes; what it lacks is
  the sense of an audience and a championship. That is idea 3, and it is mostly UI.
- **Rip Rocketer's tiers are levels of an ascent** — which is the album's arc. The artist has
  asked for a vertical scroll through bases and turrets; that maps to climbing out of a corporate
  facility, and gives the tiers a reason to look different from each other.
- ⚠ **Dogfight and Cloud Racer are the "interplanetary" register** — the parts of the world with
  air and distance in them. They should feel like travel between the other games' locations, not
  like separate products.

---

## ⚠ How to use this file

It is a **source**, in the same sense as `docs/CC0-SOURCES.md`: something to design *from*, never
something to copy *from*. A brief that cites this file still owes `DESIGN-SYSTEM.md` §8 — what it
is made of, how it is lit, what moves and why, what it sits on, and the acceptance measurement.
"It is Deltron-inspired" is a mood, and a mood is what produced the two rejected hero wordmarks.

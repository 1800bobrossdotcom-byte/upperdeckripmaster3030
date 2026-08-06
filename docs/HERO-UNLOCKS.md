# The 33 heroes — how each one is obtained

*Artist directive, 2026-08-01: **11 on SuperRare auction · 11 gacha · 11 earned**, replacing the
old 11 gacha + 22 earned. He asked what the earned ones actually require, and said: **"they need
to be hard enough."** This document answers that. §4 is the part he needs to strike or approve.*

---

## 1 · The load-bearing constraint nobody had written down

**Every score in this project lives in `localStorage` and is therefore forgeable.** The whole
persistence layer is four keys — `urm_rr_best`, `urm_rr_scores`, `urm_vault`, `urm_court` — and a
player with devtools open can set any of them to anything in about four seconds. There is no
backend. `docs/SEATS.md` already says the same thing about seats: *"a seat is advisory… no real
value may depend on `seat.ok` until a backend does."*

A hero 1/1 **is** real value. So:

> ⛔ **The earned tier cannot be self-serve.** Any design where the browser reports "I did it" and a
> contract mints on that report is a design where eleven 1/1s are claimed by whoever reads the
> source first.

⚑ **The architecture that solves this is already built.** `Ripmaster3030Lens721.claimHero()` mints
**only** against an EIP-712 voucher signed by the claim signer — `kind 1` gacha pack-claim,
`kind 2` earned game title. So a human decides, and the chain enforces that decision. That inverts
the problem in a useful way: **because a person verifies before signing, the criteria can be as
hard and as specific as we like.** They do not have to be machine-checkable. They have to be
*legible* — you must be able to read one and know whether you just did it.

This also means the criteria below need **no contract change**. `kind 2` already covers all eleven.
(An auction hero needs no voucher at all — the artist mints and lists it on SuperRare.)

## 2 · What makes a title hard in the right way

Four rules the eleven are built on. They come out of the artist's own ethos — *the anti-casino: the
tangible prize is the having-done-it* — not out of game-design convention.

1. **A feat, not a grind.** No "play 500 matches". A treadmill is bought with time, not skill, and
   the person who wins it is the person with the least else to do. It is also the exact shape of
   the slot machine this studio exists to parody.
2. **Nothing that money can reach.** No criterion may be satisfied by holding more, buying more, or
   burning more $3030. ⚑ This is not only ethics — it closes the flash-loan hole in one line.
   CLAUDE.md: *"Balance is instantaneous, so it is borrowable for a snapshot… **not** fine if it
   ever gates real value."* A hero 1/1 is real value. So balance gates nothing here.
3. **Legible before you start.** You should be able to read the condition, attempt it deliberately,
   and know at the end whether you got it. A title nobody can aim at is a lottery with extra steps.
4. **First claimant takes it, and then it is gone.** These are 1/1s; the scarcity has to be real.
   The bar is objective, but the prize is not repeatable — the first player to submit verified
   evidence of clearing it mints it, and the title closes.

⚠ **Rule 4 is the one to argue about.** It makes the early weeks genuinely competitive and it makes
a late arrival's effort worthless. The alternative — a fixed bar, unlimited winners — cannot work
for a 1/1. A middle path exists (leave 2–3 titles uncontested and award them on a stated date to
the best submission) and is noted per-title below where it fits.

## 3 · How a claim is made

1. Player clears a condition and records it — **an unbroken screen capture of the whole attempt**,
   not a photo of a final score. The run is the evidence; the number is just the claim.
2. They submit it publicly, so the bar and every attempt at it are visible.
3. The studio verifies, signs a `kind 2` voucher for that hero id to that address, and the player
   mints it themselves. **The player pays the gas and holds the key** — the studio never custodies
   the card.
4. The title is marked taken, on the site, with the run that took it.

⚠ **Nothing about this is trustless, and the site must say so.** The studio is the judge. That is
an honest position for a card-and-game studio handing out its own titles; it would be a dishonest
one if it were dressed up as an oracle. State it plainly on the page.

## 4 · THE ELEVEN — *for the artist to strike, rename or re-rank*

⚠ Names are in the studio's voice and are the easiest thing to change. The **conditions** are the
part that took the thought; the **numbers** are the part to argue about.

| # | Title | Game | The condition | Why it is hard |
|---|---|---|---|---|
| 1 | **THE WIRE** | DOGFIGHT | Pass **every boost gate on the map** in a single match without taking a hit. | The gates are placed apart on purpose and high gates (alt ≥ 5) are left in deliberately. Flying the whole route means never straightening up, and the energy model taxes every climb — you are spending the speed you need to dodge with. |
| 2 | **TWO MILLION FEET** | RIP ROCKETER | Post a run of **2,000,000 points**. | ⚑ Measured off the shipping `KIND` table and `waveSpec`, not guessed. A full clear of the whole facility — TIER I to TIER IV, all sixteen waves — scores about **688,876** at strong play. Two million is **wave 38**: you beat the building and then survived twenty-two waves of what comes after it. |
| 3 | **ABOVE THE WEATHER** | RIP ROCKETER | Post a run of **5,000,000 points**. | **Wave 75** at strong play, **wave 43** if you play the perfect ceiling (every kill on a diver, ×6 chain, 100% accuracy). Past TIER IV the wave table stops escalating and simply keeps coming — 40 craft a wave, forever. This is the one that stops being about the fight and starts being about attention. |
| 4 | **GHOST WALK** | SECTION 9 | Take a round on **any baked level** (ARCADE PIT · THE VAULT · ROOFTOP) **without ever being the first to fire**. | The bots bake cover from `MAP.solids` and score positions by whether line-of-sight to your eye is blocked. Letting them shoot first means winning every fight from behind their own plan. |
| 5 | **ESCAPE VELOCITY** | RIP ROCKETER | Post a run of **10,000,000 points**. | **Wave 121** at strong play, **wave 76** at the ceiling. ⚠ Stated plainly because it should be: this is hours in a single sitting and it may go unclaimed for a long time. It is the set's **uncontested variant** — if nobody takes it, the studio states a date and awards it to the highest verified run rather than leaving a card dead forever. |
| 6 | **NEVER STILL** | RIP ROCKETER | Clear **one whole TIER — four waves — without the FLOW chain ever lapsing**, and without dying. | FLOW decays `FLOW_WIN` 1.15 s after the last dash or roll, and a dash comes off cooldown every 0.47 s, so holding it means a movement input at least every second for **23–30 seconds** (measured tier length) while a wave dives at you. ⛔ **Dying breaks the chain** — the decay only runs while you are alive, so without that rule a bot died three times and still 'held' it. Measured: a tireless flow-chaser holds it indefinitely while alive, and the first death is what ends the attempt. |
| 7 | **CLEAN SWEEP** | CLOUD RACER | Win a race having taken **every light-strip on the circuit** — all nine, every lap. | ⚑ This one is measured, not guessed. `js/crpc-game.js` ran a 6-pilot × 3-lap × 5-seed battery adding one verb at a time: taking the strips is worth **0.96 s, the single biggest verb on the track**, ahead of the racing line (0.71) and braking (0.29). Nine strips × three laps with no misses, while still finishing first, is that skill executed perfectly. |
| 8 | **THREE CUTS** | NEON RONIN | Win a duel where **every landed hit was part of a combo** (TEMPEST, CREST WAVE or DRAGON KICK). | The combos are recent-attack strings — slash·slash·slash, punch·kick·slash, punch·kick. Landing only combo hits means never throwing the panic button, against an opponent whose blocks reset your sequence. |
| 9 | **COLD BARREL** | RIP ROCKETER | Clear **one whole TIER having fired only while OVERDRIVE was lit.** | ⚑ OVERDRIVE runs 4.2 s on a 10.2 s cycle — a hard **41.2% ceiling**, measured live at 41.9% — so this gives up nearly six-tenths of your firing window while the formation keeps diving. Cost, measured: firing only in overdrive reached **wave 6 against wave 13** for the same bot firing freely, and scored 21,525 against 111,095. ⚠ It keys on the SHOT, not the kill: a ram or a rip kills something outside the window, which measured out at 99% and would have made a 'every kill' version defeated by an accident the player never chose. A silent gun is also the thing a judge can actually see on a capture. |
| 10 | **HOUSE MONEY** | THE ARENA | Take **first place on the podium three times running** without folding once. | 1st/2nd/3rd pays 50/30/20 and folding is always available. Three in a row without taking the exit is a run where you were never allowed to be careful. |
| 11 | **THE LONG COUNT** | *cross-game* | Hold a **first-place finish in five different cabinets** — five of the eight, your choice which. | The only title that cannot be won by being excellent at one thing. It is the studio's own shape: a card and game studio, not a game studio with cards. **Best candidate for the uncontested variant** — state a date, award it to the broadest verified run. |

**Coverage:** DOGFIGHT ×1 · SECTION 9 ×1 · **RIP ROCKETER ×5** · CLOUD RACER ×1 · NEON RONIN ×1 ·
THE ARENA ×1 · cross-game ×1. Every cabinet still owns at least one.

⚠ **THE CONCENTRATION IS A CONSEQUENCE, NOT A PREFERENCE, AND IT IS THE ARTIST'S TO OVERRULE.**
Five of the eleven now sit in one cabinet because both directives point there: a points ladder in
the millions only means anything in the cabinet that HAS a cumulative score, and the combo titles
were placed in RIP ROCKETER on request. The three titles that made room — DEAD STICK, ONE MAG and
NO SWORD — were chosen because each was the *second* title in its cabinet and each was the
"refuse a tool" shape, which the set already says twice. **OPEN AIR and THE FACILITY IS CLOSED
were retired to make room and are worth keeping in a drawer**; they are good conditions, they were
simply the two RIP ROCKETER slots the new five needed.

⚑ **THREE MORE CONDITIONS WERE WRITTEN, MEASURED AND THROWN AWAY IN THIS PASS — the rule below
is not decoration, it caught all three.**
- *"Hold OVERDRIVE for a whole wave."* **Impossible by construction.** `odCd` is `OD_T + OD_CD`,
  i.e. a 10.2 s cycle with 4.2 s lit, so overdrive cannot be sustained past 4.2 s by any input.
  A title nobody can ever satisfy is worse than an easy one — it is a lie on a public page.
- *"Clear a WAVE with every kill in overdrive."* **Free.** A bot that merely holds the trigger and
  dashes banks a 100% wave by accident — measured on waves 1, 3 and 10, at 24, 28 and 40 kills, so
  a minimum-kill floor does not save it. Only the TIER scope survives: the same undisciplined bot
  peaks at 67% over a tier and falls to 38%.
- *"Every KILL in overdrive"* (as opposed to every shot). **Unclaimable.** A disciplined bot
  measured 99%, not 100 — one incidental ram/rip kill lands outside the window. The condition now
  keys on the shot, which is the only part the player controls.
⚠ Also corrected here: project memory recorded overdrive at *"114 of 180 seconds — 66% uptime"*,
which today's constants make arithmetically impossible (4.2/10.2 = 41.2%). Live measurement: 41.9%.

⚑ **One title was written, measured, and thrown away when this file was first drafted.** #7 was first drafted as
*"win a race without braking"*, which sounds like a handicap and is nearly free: `crpc-game.js`'s
own battery puts the airbrake last of the four verbs at **0.29 s out of a 38 s race**, and at the
grip the circuit shipped with, most of the lap is flat anyway. It would have been the easiest of
the eleven while reading like one of the hardest. **A condition that merely sounds hard is worse
than no condition** — it hands out a 1/1 for nothing and teaches players the bar is decoration.
Every number in this table should be checked against the game the way that one was.

⛔ **Deliberately NOT here, and why:**
- **Nothing tied to the Rarity Court.** Court votes are burns, so a court-based title would be
  purchasable — rule 2.
- **Nothing tied to vault size or pack count.** Same reason: that is a receipt, not a feat.
- **Nothing tied to holding $3030.** Rule 2 again, and the flash-borrow hole.
- **No "be first to X" landrush titles** beyond the first-claimant rule itself. A bot wins those.

## 5 · What is still the artist's call

1. **Which 11 of the 33 go to auction**, which 11 are gacha, which 11 are earned. This document
   assumes the split exists; it does not assign card ids. Art-led decision.
2. **The difficulty dial.** Every number in §4 (three in a row, five cabinets, one life to Tier IV)
   is a starting position, chosen to be reachable by a good player in an evening and not by a
   casual one at all. Move them.
3. **Rule 4** — first-claimant-takes-it, versus holding a few titles open to a stated date.
4. **The names.** Written in the studio's voice; easiest thing in here to replace.

## 6 · What the site says today, and what has to change

Copy currently reads **"11 pulled from packs, 22 earned in the games"** in five places:
`index.html` (rite §4), `scripts/build-pages.mjs` (whitepaper body, tokenomics, the hero panel),
`scripts/build-whitepaper.mjs` (PDF deck), `scripts/token-model.mjs` (§ output). All of them are
generated from the two build scripts except index.html.

⚠ **The number changes are safe; the economics do not move.** All 33 heroes mint as 1/1s either
way, so no burn, float, treasury or curve figure is affected. This is a distribution change, not a
supply change.

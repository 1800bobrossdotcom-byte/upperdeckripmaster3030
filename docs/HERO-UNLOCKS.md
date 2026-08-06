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
   ⚑ **AMENDED 2026-08-06 (artist): a title may have more than one SEAT, and #7 has three.** Each
   seat is still its own 1/1 card and still closes when it is taken; what changes is that the
   second and third pilots to clear THE STREAK are not racing for nothing. The rule is now "the
   first *n* claimants take it", with *n* stated per title and *n* = 1 everywhere except #7.
   ⚠ This does not soften the bar — it widens the door. A title with three seats is still a title
   nobody can buy, and the condition is identical for all three.

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
| 7 | **THE STREAK** ⚑×3 | CLOUD RACER | **Win 33 races in a row.** 6 pilots · 3 laps or longer, practice or for keeps. Finish anywhere but first — or leave a race once the lights have gone green — and the count returns to zero. **Three seats**, so the first three pilots to do it each take a 1/1. | Artist's rule, 2026-08-06. ⚠ It is a test of **concentration**, not of pace, and §4½ below measures exactly how much of each. Live in the game: `js/cr-streak.js`, `npm run test:crstreak` (47). |
| 8 | **THREE CUTS** | NEON RONIN | Win a duel where **every landed hit was part of a combo** (TEMPEST, CREST WAVE or DRAGON KICK). | The combos are recent-attack strings — slash·slash·slash, punch·kick·slash, punch·kick. Landing only combo hits means never throwing the panic button, against an opponent whose blocks reset your sequence. |
| 9 | **COLD BARREL** | RIP ROCKETER | Clear **one whole TIER having fired only while OVERDRIVE was lit.** | ⚑ OVERDRIVE runs 4.2 s on a 10.2 s cycle — a hard **41.2% ceiling**, measured live at 41.9% — so this gives up nearly six-tenths of your firing window while the formation keeps diving. Cost, measured: firing only in overdrive reached **wave 6 against wave 13** for the same bot firing freely, and scored 21,525 against 111,095. ⚠ It keys on the SHOT, not the kill: a ram or a rip kills something outside the window, which measured out at 99% and would have made a 'every kill' version defeated by an accident the player never chose. A silent gun is also the thing a judge can actually see on a capture. |
| 10 | **HOUSE MONEY** | THE ARENA | Take **first place on the podium three times running** without folding once. | 1st/2nd/3rd pays 50/30/20 and folding is always available. Three in a row without taking the exit is a run where you were never allowed to be careful. |
| 11 | **THE LONG COUNT** | *cross-game* | Hold a **first-place finish in five different cabinets** — five of the eight, your choice which. | The only title that cannot be won by being excellent at one thing. It is the studio's own shape: a card and game studio, not a game studio with cards. **Best candidate for the uncontested variant** — state a date, award it to the broadest verified run. |

**Coverage:** DOGFIGHT ×1 · SECTION 9 ×1 · **RIP ROCKETER ×5** · CLOUD RACER ×1 · NEON RONIN ×1 ·
THE ARENA ×1 · cross-game ×1. Every cabinet still owns at least one.
⚠ Eleven **titles**, thirteen **cards** — see §4¾, which is unresolved.

## 4½ · THE STREAK, measured — and it is not the shape it looks like

*The rule that replaced #7 is the artist's. This section is what the game says about it, run the
way CLAUDE.md demands before any condition is published: **check the number before publishing the
rule.** `js/crpc-game.js` runs unmodified under node, and the pilot is the game's own `botInput` at
skill 1.0 — that is policy E of the file's own battery (racing line + strips + weather + brake +
boost economy), i.e. the shipping code driving itself, not a re-implementation of a good player.*

**⛔ FINDING 1 — A GOOD PILOT WINS EVERY RACE. There is no per-race difficulty here at all.**

| pilot skill | win rate | mean place | what 33 in a row costs |
| --- | --- | --- | --- |
| **1.00** (drives to the grip limit) | **100%** | 1.00 | 1 attempt — it is guaranteed |
| 0.99 (the fastest bot) | 95% | 1.05 | ≈5 attempts |
| 0.98 | 47.5% | 1.52 | ≈4.7 × 10¹⁰ attempts |
| 0.97 | 5% | 1.98 | ≈8.6 × 10⁴² attempts |
| 0.96 and below | **0%** | 2.30+ | never |

40 races per row, 6 pilots · 3 laps, player on pole (grid slot 0 is always the player's).
⚑ **Read the cliff, not the top row.** Between 1.00 and 0.97 the win rate goes 100 → 5. The title
is therefore **free or impossible**, decided by a sliver of skill space, with almost nothing in
between. That is a different object from a hard condition: a hard condition has a band you can
train into, and this has a threshold you are on one side of.

**⚑ FINDING 2 — A HUMAN IS NOT A SKILL DIAL, AND THIS IS THE NUMBER THAT MATTERS.** A pilot at
0.97 is slightly wrong on *every* corner; a person is mostly at the limit and occasionally makes
one discrete, visible mistake. So the honest question is how many mistakes one race absorbs:

| mistake, injected at random | 0 | 1 | 2 | 3 | 4 | 6 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **clip the barrier** (0.5 s of lock into the wall) | 100% | 100% | 100% | 97.5% | 95% | 75% | 57.5% |
| **miss a brake point** (0.8 s late, boost lit) | 100% | 100% | 100% | 100% | 100% | 100% | **100%** |
| **lift for nothing** (0.7 s of brake off-corner) | 100% | **80%** | 60% | 32.5% | 17.5% | 0% | 0% |

⚑ **The race forgives the two mistakes a player would recognise as mistakes and punishes the one
they would not.** Missing a brake point is entirely free — eight of them and you still win, which
is the same fact the game's own battery already recorded (the airbrake is worth 0.29 s of a 38 s
race, last of the four verbs). Braking when you did not need to is the expensive error, and **one
of them costs a fifth of your wins.** So the skill THE STREAK actually tests is *not lifting*:
trusting the grip, 33 times running, for about 22 minutes.

**⛔ FINDING 3 — SO THE HONEST DESCRIPTION IS A CONCENTRATION TEST, AND IT BRUSHES RULE 1.** For a
pilot who can already win, 33 in a row is **33 × 39.8 s ≈ 22 minutes** of not losing focus, plus
menu time. Rule 1 says *a feat, not a grind* — no treadmills — and a 22-minute run of races you
win 100% of is closer to a treadmill than to a feat. It is **not** the braking-title failure again
(that one *sounded* hard and was free); this one is genuinely demanding of attention and genuinely
undemanding of skill. **Both halves should be said out loud rather than let the word "33" imply a
difficulty it does not carry.**

**✅ WHAT THE PIN FIXES, AND WHY IT IS 6 · 3.** Field size and laps are player-chosen in the lobby,
so without a floor the title is farmed at whatever setting is softest — and the soft setting is
also the *fast* one:

| lobby | race length | barrier clips absorbed | 33 in a row |
| --- | --- | --- | --- |
| 4 pilots · 2 laps | 28.5 s | 3 | **15.6 min** ← both quicker and more forgiving |
| **6 pilots · 3 laps ← the floor** | 39.8 s | 2 | 21.9 min |
| 8 pilots · 5 laps | 60.5 s | 3 | 33.3 min |

It is a **floor, not an equality**: a longer race is more clock and more chances to err, so 8 · 5
counts. Only the short lobby is ruled out, because it is the only choice that buys anything.

**⛔ AND THE PROPERTY THE WHOLE RULE RESTS ON: LEAVING A RACE MUST COST THE STREAK.** Count only at
the flag and "33 in a row" silently becomes *"win 33 races, retrying whenever one goes badly"* —
watch the first corner and reload if the fast bot gets you. That is the treadmill rule 1 forbids,
and **nothing reports it**: a tab that goes away is silent. So the ledger arms at the green light
and only a finish disarms it; a live marker at the next load is an abandoned race. Reloading to
dodge a loss and taking the loss are the same event. ⚠ The countdown is deliberately outside that
window — nothing has happened yet, so leaving cannot be dodging anything.

⚠ **Practice races count, and that is required rather than generous.** Requiring the ante would
put 33 rakes between a player and the title — a criterion satisfied by spending $3030, which is
exactly what rule 2 forbids.

⚠ **Still open on this title, and the artist's:** whether 22 minutes of concentration is the feat
he wants (a per-race rider — *every one of the 33 also clean, no barrier contact* — would make it
a skill test, at the cost of no longer being only his rule); and whether a card loadout's ≤3.6%
speed edge should be allowed in a streak race. It decides nothing at a 100% win rate, so it is
recorded rather than gated.

⚑ **#7 HAS NOW BEEN WRITTEN THREE TIMES, AND EACH REWRITE CAME FROM A MEASUREMENT.** Draft 1 was
*"win a race without braking"* — thrown away below. Draft 2 was the light-strips sweep. Draft 3 is
the artist's streak, and §4½ measures it the same way: it is a **concentration** test worth about
22 minutes, not a pace test, because a pilot who drives the line wins **100%** of races. The
pattern is worth naming: **every time this title was written from how it sounded, the number
disagreed.** Check it, then publish it.

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

## 4¾ · ⛔ UNRESOLVED: THREE SEATS ON #7 MAKES 35 HEROES, NOT 33

**The ×3 collides with a settled number and something has to give. This is the artist's call and
nothing has been published either way.**

Eleven titles at one card each is eleven earned heroes, and `11 auction + 11 gacha + 11 earned`
is the 2026-08-01 directive that makes the genesis set **33**. Give #7 three seats and the earned
tier is **13 cards**, so the set is **35** — and 33 is not a slogan, it is the deck: `tokenURI`
ids 1–33 are the heroes, 34–100 the render-only field cards.

Three ways out, in the order they cost least:

| | split | what it costs |
| --- | --- | --- |
| **A** | 11 auction · 11 gacha · **11 earned (9 titles, one ×3)** | Strike **two** titles. Nothing else moves, 33 holds. THE LONG COUNT (#11) is already flagged in §4 as the softest, and #7 replaced CLEAN SWEEP. **Which two go is authorship.** |
| **B** | 11 auction · **9 gacha** · **13 earned (11 titles, one ×3)** | Keep every title. Changes the gacha count, which he settled and did not ask to reopen. |
| **C** | leave 33, drop the ×3 | Discards half the directive. Recorded only for completeness. |

⛔ **What has NOT been done, deliberately.** No public page states the ×3 and no aggregate count
has been touched — `index.html`, `whitepaper.html`, `tokenomics.html`, the PDF, the one-pager and
the SuperRare brief all still read **"11 earned"**, which is true under A and false under B. The
condition change *is* published, because it stands on its own and the old one was superseded. A
page that says "eleven earned" beside "one of them is available three times" is publishing a
contradiction, and that is worse than publishing late.

⚠ The game itself already says **three**, on the Cloud Racer result screen only. That surface
states no split, so it cannot be wrong about one.

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
   ⚑ Partly answered: #7 now has three seats. Whether any other title should is open.
4. **The names.** Written in the studio's voice; easiest thing in here to replace.
5. ⛔ **§4¾ — where the two extra earned cards come from.** Blocking for any public page that
   states the split. Nothing has been published either way.
6. ⚠ **§4½ — whether THE STREAK should carry a per-race rider.** As stated it is 22 minutes of
   concentration at a 100% win rate. *Every one of the 33 also clean — no barrier contact* would
   make it a skill test; it would also no longer be only his rule.

## 6 · What the site says today, and what has to change

Copy currently reads **"11 pulled from packs, 22 earned in the games"** in five places:
`index.html` (rite §4), `scripts/build-pages.mjs` (whitepaper body, tokenomics, the hero panel),
`scripts/build-whitepaper.mjs` (PDF deck), `scripts/token-model.mjs` (§ output). All of them are
generated from the two build scripts except index.html.

⚠ **The number changes are safe; the economics do not move.** All 33 heroes mint as 1/1s either
way, so no burn, float, treasury or curve figure is affected. This is a distribution change, not a
supply change.

### 6b · 2026-08-06 — what THE STREAK changed on the site, and what it deliberately did not

✅ **Changed.** The Cloud Racer entry in the public titles list (`scripts/build-pages.mjs` §titles
and the generated `whitepaper.html#titles`) now reads THE STREAK rather than CLEAN SWEEP. The old
condition was superseded by the artist, so leaving it up was publishing a rule nobody can win.

⛔ **NOT changed, and this is §4¾'s doing, not an oversight.** The **×3** is not on any public page
and no aggregate count has been touched. Every "11 earned" on the site — `index.html` rite §4,
`build-pages.mjs` (whitepaper body, tokenomics, hero panel), `build-whitepaper.mjs` (PDF),
`build-onepager.mjs`, `build-sr-brief.mjs`, `token-model.mjs` — is **true under option A and false
under option B**, and until that is called, printing "eleven earned titles" next to "one of them
has three seats" would be shipping a contradiction on the page the token's buyers read.
⚑ The number to change, when it is called, is `SEATS` in `js/cr-streak.js` (already 3) plus the
titles list and whichever aggregate the chosen option moves. The game's result screen is the only
shipped surface that currently says "three", and it states no split, so it cannot be wrong.

✅ **Swept.** `CLEAN SWEEP` survived in exactly two places — `scripts/build-pages.mjs` and the
`whitepaper.html` it generates — and both are done. **The generator was edited and the page
regenerated from it**, never the other way round: patching output and leaving the generator armed
is `restyle-backs.mjs`'s recorded failure, and it is the fifth time this project has had to say so.

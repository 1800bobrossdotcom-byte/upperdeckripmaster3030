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

## 4 · THE NINE TITLES / ELEVEN CARDS — *for the artist to strike, rename or re-rank*

⚠ Names are in the studio's voice and are the easiest thing to change. The **conditions** are the
part that took the thought; the **numbers** are the part to argue about.

| # | Title | Game | The condition | Why it is hard |
|---|---|---|---|---|
| 1 | **THE WIRE** | DOGFIGHT | Pass **every boost gate on the map** in a single match without taking a hit. | The gates are placed apart on purpose and high gates (alt ≥ 5) are left in deliberately. Flying the whole route means never straightening up, and the energy model taxes every climb — you are spending the speed you need to dodge with. |
| 2 | **DEAD STICK** | DOGFIGHT | Win a match having **never pressed boost**. | Boost is the escape button; equilibria are 5.6 climbing / 9 cruise / 12.4 diving / 19.9 boosting. Giving it up means every disengage is bought with altitude, against bots that dive to convert height when they close. |
| 3 | **ONE MAG** | SECTION 9 | Win a round with **more kills than reloads**. | TTK is ~1.3 s at 150 HP + 60 armour by design, so a body-shot duel costs most of a magazine. The only way past it is headshots — ×2.1, and armour soaks 15% instead of 45%. It is an accuracy title wearing an ammo title's clothes. |
| 4 | **GHOST WALK** | SECTION 9 | Take a round on **any baked level** (ARCADE PIT · THE VAULT · ROOFTOP) **without ever being the first to fire**. | The bots bake cover from `MAP.solids` and score positions by whether line-of-sight to your eye is blocked. Letting them shoot first means winning every fight from behind their own plan. |
| 5 | **OPEN AIR** | RIP ROCKETER | Reach **TIER IV** on one life. | Four floors, four waves each, sixteen waves without dying. Plate density falls 146 → 25 as you climb, so the last floor is the loneliest and the easiest place to get careless. |
| 6 | **THE FACILITY IS CLOSED** | RIP ROCKETER | Clear **every emplacement** in a single tier — all guns on all sites, none left behind. | The turrets track, stop, then fire where they stopped, and a player bolt only reaches the wall through a gap in the diver formation. You have to fight two things at once, on purpose, for a whole floor. |
| 7 | **THE STREAK** ⚑×3 | CLOUD RACER | **Win 33 races in a row.** 6 pilots · 3 laps or longer, practice or for keeps. Finish anywhere but first — or leave a race once the lights have gone green — and the count returns to zero. **Three seats**, so the first three pilots to do it each take a 1/1. | Artist's rule, 2026-08-06. ⚠ It is a test of **concentration**, not of pace, and §4½ below measures exactly how much of each. Live in the game: `js/cr-streak.js`, `npm run test:crstreak` (47). |
| 8 | **DEAD AIR** | THE CITY | As the bird, cover **300 m in one unbroken glide** — not a single wingbeat — and **never more than 40 m above the ground beneath you**. | ⚑ Measured on the shipping build. The glide ratio is a flat **8.2 : 1** at every altitude, so 40 m of height is **328 m** of glide and no more: 300 m spends 91% of the physical maximum. You cannot climb out of trouble and you cannot go over anything — and **2 of 5 straight lines from random city points hit a building** (190 m and 311 m against 327 m in the clear). So it is won by READING THE CITY before you commit, which is the one thing the bird is for. |
| 9 | **BOTH ENDS** | THE CITY | In one unbroken visit: **plant a card from the air as the bird, then take that same card back as the squirrel.** | ⚑ The only title that makes you play two animals. `docs/CITY-GAME.md`'s claim is that the animals are **layers, not skins** — the bird sees everything and cannot place precisely, the squirrel owns the vertical and cannot cover ground. This is that claim as a condition: you drop it where you can only guess, then you have to go and physically get it, on foot, up whatever it landed on. ⚠ Rival squirrels take loose cards, so the clock is somebody else's. |

**Coverage — 9 titles, 11 cards, and the arithmetic closes:** DOGFIGHT ×2 · SECTION 9 ×2 ·
RIP ROCKETER ×2 · THE CITY ×2 · CLOUD RACER ×1 **with three seats** = **11 earned heroes**, so
`11 auction + 11 gacha + 11 earned` = **33** is untouched. §4¾ records how it got here.

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

⚑ **One title was written, measured, and thrown away — worth recording.** #7 was first drafted as
*"win a race without braking"*, which sounds like a handicap and is nearly free: `crpc-game.js`'s
own battery puts the airbrake last of the four verbs at **0.29 s out of a 38 s race**, and at the
grip the circuit shipped with, most of the lap is flat anyway. It would have been the easiest of
the eleven while reading like one of the hardest. **A condition that merely sounds hard is worse
than no condition** — it hands out a 1/1 for nothing and teaches players the bar is decoration.
Every number in this table should be checked against the game the way that one was.

## 4¾ · ✅ RESOLVED — option A, and the artist's redistribution is what paid for it

*Artist, 2026-08-06: **"push the updates for the extra cards … disperse the remaining cards that
are not in cloud race or riprocketer — and create ways for the players to redeem them in dog
fight, section 9, or the city."** That settles both halves at once.*

Three seats on #7 makes the earned tier **13 cards** against a settled **11**, and 33 is not a
slogan — it is the deck (`tokenURI` ids 1–33 are the heroes, 34–100 the render-only field cards).
The instruction above resolves it by naming exactly three homes for everything that is not CLOUD
RACER's or RIP ROCKETER's, and **six cards is precisely what fits**:

| game | titles | cards |
| --- | --- | --- |
| CLOUD RACER | THE STREAK | **3** (three seats) |
| RIP ROCKETER | OPEN AIR · THE FACILITY IS CLOSED | 2 |
| DOGFIGHT | THE WIRE · DEAD STICK | 2 |
| SECTION 9 | ONE MAG · GHOST WALK | 2 |
| THE CITY | DEAD AIR · BOTH ENDS | 2 |
| | **9 titles** | **11 cards** ✅ |

⚑ **So no aggregate on any public page changes.** "11 earned" was true before and is true now;
what changed is that eleven cards are awarded across nine titles instead of eleven. That is the
whole reason option A was worth holding out for — option B would have moved the gacha count on
six generated surfaces and in the token model.

⛔ **FOUR TITLES WERE STRUCK, AND ONLY TWO OF THOSE WERE A JUDGEMENT CALL.**
- **THREE CUTS** and **NO SWORD** were NEON RONIN's, and ⚑ **NEON RONIN HAS NOT EXISTED SINCE
  2026-08-03** — the artist retired it and THE CITY replaced that cabinet. Two of the eleven
  titles had been pointing at a game that is not in the arcade, in a document nobody had reopened
  since. **That is this project's own "a surface nobody looks at rots", on the page that tells
  players how to win a 1/1.** Removing them executes a decision already made; the two CITY titles
  are their replacements, in the cabinet that replaced their cabinet.
- **HOUSE MONEY** (THE ARENA) and **THE LONG COUNT** (cross-game) are the judgement call, and they
  went because the instruction named three destinations and neither is one of them.
  ⚠ **THE ARENA NOW HAS NO TITLE — flagging it, because it is a live cabinet** and the old
  coverage rule was "every cabinet with a scoreboard owns at least one". Say the word and
  HOUSE MONEY comes back; it would need a card from somewhere, and the honest source is one of
  THE CITY's two.

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
5. ✅ **§4¾ — settled 2026-08-06.** Nine titles, eleven cards, 33 intact. ⚠ The live question
   left inside it: **THE ARENA now carries no title.** It is a shipping cabinet with a scoreboard,
   and the old coverage rule said every such cabinet owns one.
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

### 6b · 2026-08-06 — the titles list is now nine, and the ×3 is public

✅ **Published.** `scripts/build-pages.mjs` §titles and the generated `whitepaper.html#titles` now
carry the nine titles, with THE STREAK marked as holding **three seats**. THE ARENA and the
cross-game title are gone from the list; NEON RONIN's two are gone with the cabinet.

✅ **No aggregate moved, and that is the point of option A.** Every "11 earned" on the site —
`index.html` rite §4, `build-pages.mjs` (whitepaper body, tokenomics, hero panel),
`build-whitepaper.mjs` (PDF), `build-onepager.mjs`, `build-sr-brief.mjs`, `token-model.mjs` — was
true before and is true now. Eleven cards, awarded across nine titles.

⚠ **The one sentence that had to change is the counting noun.** "The eleven earned titles" is now
false as a *title* count and true as a *card* count, and the page must not blur the two: it reads
**eleven cards across nine titles** and says which one has three seats. A page that says
"eleven titles" while listing nine is the kind of small untruth that gets quoted back.

✅ **Swept.** `CLEAN SWEEP` survived in exactly two places — `scripts/build-pages.mjs` and the
`whitepaper.html` it generates — and both are done. **The generator was edited and the page
regenerated from it**, never the other way round: patching output and leaving the generator armed
is `restyle-backs.mjs`'s recorded failure, and it is the fifth time this project has had to say so.

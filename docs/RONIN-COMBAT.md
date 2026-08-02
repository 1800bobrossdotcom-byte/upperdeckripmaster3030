# NEON RONIN — the combat system

> **This table is not documentation of the game. It IS the game.**
> Every number below lives in exactly one place — `MOVES` in `js/ronin.js` — and is published
> here, rendered into the lobby's move list, and driven by `npm run test:ronin`, which parses
> *this file*, reads the live object out of the page, reads the rendered DOM table, and fails
> if a single cell differs. Two copies of a fact will diverge (ROADMAP §5.4); these three are
> asserted to agree, and then the advantages are **re-measured in a driven match** rather than
> read back.

---

## 1 · The load-bearing number

Section 9's is TTK: *at 100 HP and 26 damage an AK duel was 0.63 s, and at that speed cover and
suppression cannot exist — nobody lives long enough to use them.* NEON RONIN's equivalent is:

> ## ⛔ The JAB at **i10** — 167 ms.
> Everything else is measured against it. **10 frames is just under a human's reaction floor**
> (~15 f / 250 ms), so a jab cannot be blocked on reaction, only anticipated. That is what makes
> it the smallest legal punish, and therefore what sets the entire ladder: a move at **−10** loses
> to a jab, **−15** to a roundhouse, **−16** to a cut, **−18** to a launcher — and a launcher
> means a juggle worth about a third of the bar.

Every rung lands **exactly** on some move's startup. That is designed, not luck, and
`npm run test:ronin` asserts it.

### What this replaced, and why the old game had no depth

The old table was written in **seconds**, and the three attacks started up in `.02 / .035 / .05 s`
= **1.2 / 2.1 / 3.0 frames**. Consequences, all of them structural rather than matters of taste:

| | old | now |
| --- | --- | --- |
| fastest startup | **1.2 f** (20 ms) | 10 f |
| slowest startup | 3.0 f | 24 f |
| **blockstun** | **none. zero. did not exist** | 10–24 f |
| advantage on block | an accident of recovery, ≈ −5 f **for every move in the game** | −3 … −23, nine distinct values |
| punish | not a concept — nothing was reactable and nothing was plus | a ladder with exact rungs |
| juggle | a launcher that put you in the air for 0.49 s — less than one katana swing, so no follow-up could physically exist | 1.74 s, scaled, capped, floor-terminated |
| the third axis | a `z` window every move shared | **linear vs homing**, per move |
| throws | none | i12, unblockable, 20-frame break |
| counter-hit | none | ×1.3, +8 f hitstun, and the roundhouse launches |

Nothing was reactable, nothing could be spaced, and **a blocked move left the defender free
instantly** — so "block" was a stance you held, not a decision you made. `npm run test:ronin`
asserts `punch.st === 10` and `bs > 0` for every move: both are unsatisfiable by the old build.

### Why HP moved: 100 → **×1.8** (the ronin's bar is 180)

A round has to hold enough openings that learning a punish **pays**. At 100 HP a launch-punish
juggle (~55) was **55% of the bar** — one read ended the round, so nobody would ever experiment,
and a punish ladder you cannot afford to practise is decoration. At 180 the same juggle measures **28%**:
three and a half openings to a round, which is the shape Tekken actually has. **No damage number changed.
Only the denominator.** The test prints the resulting round length from an undriven 60 s match.

---

## 2 · The frame table

Frames at 60 fps. `i` = startup, `act` = active, `rec` = recovery, `blk` = blockstun,
`hit` = hitstun.

**`on blk` and `on hit` are DERIVED, never typed:**

```
onBlock = blockstun − (active − 1) − recovery
onHit   = hitstun   − (active − 1) − recovery      (— when the move puts them on the floor)
```

| id | move | input | i | act | rec | dmg | blk | hit | on blk | on hit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `punch` | JAB | `J · MMB` | i10 | 2 | 12 | 6 | 10 | 18 | −3 | +5 |
| `kick` | ROUNDHOUSE | `K · RMB` | i15 | 3 | 20 | 13 | 16 | 26 | −6 | +4 |
| `slash` | OVERHEAD CUT | `L · LMB` | i16 | 3 | 25 | 17 | 17 | 30 | −10 | +3 |
| `rising` | RISING KICK | `S+K` | i18 | 3 | 36 | 14 | 18 | — | −20 | LAUNCH |
| `grab` | NECK THROW | `G` | i12 | 2 | 30 | 24 | — | — | — | THROW |
| `dragon` | DRAGON KICK | `P · K` | i18 | 3 | 34 | 20 | 18 | — | −18 | LAUNCH |
| `crest` | CREST WAVE | `P · K · S` | i20 | 4 | 33 | 26 | 20 | — | −16 | KND |
| `tempest` | TEMPEST | `S · S · S` | i24 | 6 | 40 | 30 | 22 | — | −23 | KND |
| `special` | BLADE NOVA | `SPACE` | i8 | 10 | 30 | 26 | 24 | — | −15 | KND |

**Properties**

| move | homing? | notes |
| --- | --- | --- |
| JAB | homing | the yardstick. Tracks a sidestep, so it is the answer to a stepping opponent. |
| ROUNDHOUSE | **linear** | a sidestep eats it. **LAUNCHES on counter-hit** — a read, not a button. |
| OVERHEAD CUT | **linear** | your damage. −10 means a blocked cut is a free jab for them. |
| RISING KICK | **linear** | *the* launcher. −20: whiff it or get it blocked and you eat a juggle. |
| NECK THROW | homing | beats a held guard. Loses to a sidestep. 20-frame break window. |
| DRAGON KICK | **linear** | the string launcher (`P · K`) — same −18 price as the button one. |
| CREST WAVE | homing | the **BOUND**: slams a juggled opponent into the floor, once per combo. |
| TEMPEST | homing | the most committal move in the game. −23, so it is *launch*-punishable. |
| BLADE NOVA | homing | costs the whole meter · invulnerable frames 1–14 · still −15. |

---

## 3 · The punish ladder

Derived by one rule and nothing else: **a punisher lands iff its startup fits inside the deficit.**
`BLADE NOVA` is excluded from the published answers — it costs a full meter, so naming it as
"the punish" would be advice a player usually cannot take.

| blocked move | on blk | punished by |
| --- | --- | --- |
| JAB | −3 | — safe |
| ROUNDHOUSE | −6 | — safe |
| OVERHEAD CUT | **−10** | JAB |
| BLADE NOVA | −15 | JAB, ROUNDHOUSE |
| CREST WAVE | −16 | JAB, ROUNDHOUSE, OVERHEAD CUT |
| DRAGON KICK | **−18** | + RISING KICK, DRAGON KICK → **a juggle** |
| RISING KICK | −20 | + CREST WAVE |
| TEMPEST | **−23** | everything below i24 → **a juggle** |

⛔ **The negative control is the real assertion.** "The punish landed" is a weak question — a game
where every move is punishable by everything passes it. So the test also drives the move **one
rung too slow** against each blocked move and requires it to **whiff**, with the attacker guarding
the instant they recover. That is what makes the ladder a ladder.

### The convention, written down

A fighting game is one long off-by-one, so:

- a move's **frame 1** is the frame it was input on;
- **i10** means it *hits on frame 10* — frames 1–9 are startup;
- after contact the attacker still owes `(act − 1)` active frames plus `rec` recovery frames, so
  they are actionable on frame `st + act + rec − 1`;
- the defender is locked for exactly `blk` frames from contact, actionable on frame `st + blk`;
- subtract → `blk − (act − 1) − rec`.

It falls out of this that **an i-N move punishes a deficit of exactly −N and not −(N−1)**. Move any
of those three constants by a frame and the negative control fails, which is what it is for.

**An input buffer of 4 frames** is part of the design, not a courtesy: a punish is a move you must
land on the first frame you are free, and asking a human to hit that frame with no buffer is asking
them not to punish. Four frames is short enough that it cannot produce a move you did not mean.

---

## 4 · Counter hit

Landing inside the opponent's own animation — **startup, active or recovery**, Tekken's rule
verbatim — is a counter hit:

- **×1.3 damage**
- **+8 frames of hitstun**
- **`chLaunch` moves launch on counter-hit only.** Exactly one move has it: the **ROUNDHOUSE**.
  A normal roundhouse leaves them standing; a counter-hit one starts a juggle. That is a read
  being rewarded, not a button being pressed.

---

## 5 · Juggles

| | |
| --- | --- |
| launchers | RISING KICK · DRAGON KICK · a counter-hit ROUNDHOUSE |
| launch velocity | 540 px/s, and **horizontally only 60** — a launch goes UP, not away |
| **juggle gravity** | **620** px/s² — a third of the 1750 a jump uses. Hang ≈ 1.74 s, apex ≈ 235 px |
| air friction while juggled | **0.94/frame**, against 0.99 for an ordinary jump |
| damage scaling | `1 · 0.80 · 0.68 · 0.58 · 0.50 · 0.42 · 0.35 · 0.30 · 0.25` by hit index |
| re-float | `max(50, 280 − 55n)` — each hit lifts them less |
| **hard cap** | **5 juggle hits.** Past it a hit no longer floats — it spikes them down at 620 |
| **bound** | CREST WAVE, **once per combo**: slams down at 900, bounces at 250 |
| terminator | landing → `down` 22 f → `getup` 16 f, **invulnerable throughout** |

Measured (`npm run test:ronin`, greedy route, every legal follow-up on every frame it is allowed):

```
punch → slash → crest(BOUND) → punch → punch → punch
14 + 6 + 13.6 + 17.68 + 3.48 + 3 + 2.52  =  60.3 damage over 3.6 s   ≈ 28% of the bar
```

### Three things the measurement found that reading the code did not

1. ⛔ **The launcher knocked them out of juggle range and no follow-up had ever connected.** With
   ordinary knockback applied, a launched opponent drifted ~100 px downrange during the launcher's
   *own* 36 frames of recovery — so by the time the attacker could act, the target was past JAB
   range. The juggle existed in the code and happened zero times.
2. ⛔ **Air friction is 0.99/frame, i.e. practically none**, so the small push each juggle hit adds
   never bled off: ~200 px of drift over a 2 s juggle, out of range by the third hit. The combo
   "ended" for a reason that had nothing to do with scaling, decay or the floor.
3. ⛔ **Damage decay does NOT terminate a juggle, and it looks like it does.** Re-float adds upward
   velocity *from wherever the body already is* — it does not reset the height — so a target
   pumped up near the apex keeps enough hang time for a 22-frame jab cycle to reconnect on the way
   down. Driven greedily that ran **sixteen jabs over 8.6 s**. It read as bounded because the
   *damage* was bounded (1.5 a hit by the end). Scaling limits what a combo is worth; only a hard
   cap limits how long you have to watch it.

⚑ **Juggle gravity is the load-bearing constant of this section.** The launcher's own recovery is
36 frames and the fastest follow-up is i10, so the first juggle hit cannot land sooner than
**47 frames** after the launch — meaning any hang time under ~50 frames makes a "launcher" that no
move in the game can follow up. At jump gravity the hang is 29 frames. That is not a tuning
preference; it is an arithmetic constraint the frame table imposes on the physics.

⛔ **Four separate things bound a combo, and the test drives the greediest input a human could
manage against all four**: scaling makes a long one not worth having, float decay makes it
physically hard, the hard cap makes it impossible, and the floor is invulnerable so it cannot loop
back into a new launcher. It then throws launchers at the downed body across all 38 down/getup
frames and requires **zero** damage.

**Grounded hits are deliberately out of scope.** In Tekken you can hit a downed opponent and they
can roll; here the floor is a hard terminator instead. That is a simplification, stated rather than
hidden: it is what guarantees termination without a wake-up-option system.

---

## 6 · Movement as defence — the third axis

`z` (depth strafe, `Q`/`E`) already existed and meant almost nothing, because every move shared
one z-window. Now:

- **LINEAR** moves need the target on the fight line. **HOMING** moves do not care.
- **SIDESTEP** is a committed move with its own frame data — **3 startup / 12 evade / 7 recovery**,
  22 frames, displacing z by 78 px. During its 12 evade frames a linear move **passes through you**.
- Holding `Q`/`E` still strafes for spacing. Tapping starts the sidestep.
- A sidestep is **not** a free out: it has recovery, so whiffing one is punishable, and a throw
  homes.

⛔ **The assertion that bites is the pair, not the dodge.** "It dodged" is passed by a lucky whiff.
The test drives the *same* sidestep on the *same* frame against a linear move and a homing one and
requires **whiffed** and **hit** respectively.

---

## 7 · Throws

`i12`, active 2, recovery 30. **Ignores guard entirely** — that is the whole reason it exists,
and nothing else in the game beats a player who never stops blocking.

Its price is that it is the only move that can be **refused after it lands**:

| | |
| --- | --- |
| hold | 30 frames before it resolves |
| **break window** | **20 frames** (333 ms) — press punch or kick |
| broken | 0 damage, both pushed apart, the thrower ends at **−2** |
| not broken | 24 damage and a knockdown |

The test breaks at frame 5 (inside), at frame 18 (the edge), at frame 24 (outside) and never, and
requires the first two to cost nothing and the last two to cost the full 24.

---

## 8 · The bots play the same game

> *"A fighter with frame data and an opponent that ignores it is a training dummy."*

The rival reads the **same table the player does**, through the same two public questions the
system already answers — `framesUntilFree(o)` and `punishersFor(id)`. It gets no private oracle
and no cheat; everything it uses is information a human watching the screen also has.

Priority order in `stepAI`:

1. **break** a throw it is caught in (probabilistic — a rival that always broke would make the
   throw useless, one that never broke would make it a free 24);
2. **juggle** a launched opponent, taking the BOUND when it is available;
3. **punish** — if the opponent is in *recovery*, pick the **biggest** move whose startup fits
   inside `framesUntilFree`;
4. **react** — only to moves whose startup is **≥ 15 frames**;
5. **throw** an opponent who is holding guard;
6. **guard** when its own last move was blocked at −10 or worse;
7. otherwise attack, weighted by **safety**, not by damage.

⚑ **The reaction floor is the design, not the difficulty dial.** `react: 15` means the rival will
never block a jab on reaction, *because no human can*. That single number is what stops a
frame-data-reading AI from becoming an unbeatable wall. The probabilities are the difficulty knob;
the floor is not, and should not be tuned away.

⚑ **Nothing here keys on holdings.** The rival plays the same game whatever you own — anti-casino:
depth rewards a player who *learns*, never one who pays.

The test measures this rather than asserting it: the player throws its most punishable move
(TEMPEST, −23) from block range thirty times and the rival's punish rate is compared against the
same drive with a **safe** jab (−3). A rival attacking at random would score the same on both.

---

## 9 · Interface — what the art director owns

`js/ronin.js` drives the rig; `js/ronin-fighters.js` (2D) and `js/ronin3d.js` (3D) draw it. This
pass added six `f.state` values and a few flags. **Both art paths fail open** — they fall through
to the neutral stance for a state they do not name — and `npm run test:ronin` pushes all sixteen
states through `RoninArt.skel` + a real 2D draw and fails on a throw or a non-finite joint.

| new `f.state` | when | what it wants to look like |
| --- | --- | --- |
| `throw` / `grab` | the NECK THROW, i12 then a 30-frame hold | both arms drive forward and clamp |
| `thrown` | the victim, during the break window | held up off the ground, kicking to break |
| `down` | 22 f after a knockdown, invulnerable | flat on the deck |
| `getup` | 16 f standing up, invulnerable | rising out of `down` |
| `sidestep` | the 22-frame committed step | shoulders turn off the line |

Existing states are unchanged (`idle · walk · block · punch · kick · slash · special · hurt · air ·
ko`). New per-fighter flags a renderer may want: `f.move` (the move id, so `kick` can be told apart
from `rising`), `f.ch > 0` (a counter hit just landed — worth a flash), `f.bstun > 0` (in
blockstun, i.e. *held* in guard rather than choosing it), `f.juggle` (`{hits, bound}`), `f.step`.

**Two things would help, both one-liners in files this pass did not touch:**

1. `js/ronin-fighters.js` → `legFeet()` returns `null` (angle-driven legs) for `f.air || f.ragdoll
   || st === 'ko'`. Adding `|| st === 'down' || st === 'getup'` would let a downed fighter actually
   lie down instead of standing in a strong body rotation.
2. `js/ronin3d.js` → `drawFace()` keys expression on `f.state`. `thrown` and `down` currently read
   as neutral; a strained face on `thrown` and a dazed one on `down` would sell the throw break.

Neither is required. Both paths render today.

---

## 10 · Reachability

> *Built ≠ reachable is this project's single most common defect (ROADMAP §5.3).*

Every verb this pass added has a surface a player can find:

| verb | keyboard | touch | taught in |
| --- | --- | --- | --- |
| RISING KICK | `S` + `K` | hold the stick down + **KICK** pad | help screen · move list · control strip |
| NECK THROW | `G` (or `F`) | **THROW** pad | help screen · move list · control strip |
| SIDESTEP | tap `Q` / `E` | **STEP** pad | help screen · move list · control strip |
| throw break | punch or kick | PUNCH or KICK pad | an on-screen prompt fires the instant you are grabbed |
| the frame data itself | — | — | **the lobby move list**, and a live readout in the fight |

⛔ **The in-fight readout is the part that makes any of this a game rather than a spreadsheet.**
Every block and every hit the player is part of prints the move, its advantage, and *what punishes
it* — pulled from `punishersFor()`, i.e. from the same table the simulation runs on, so the advice
cannot be wrong. Frame data nobody can see is trivia.

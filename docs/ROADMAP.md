# The list — what is left, in the order it should be done

> Written 2026-08-02. This is the durable version of the task list; the live one is in the
> session's task tracker. When they disagree, this file is the one a stranger can read.

---

## ⛔ 0 · The only things that MUST ship finished

CLAUDE.md's standing directive: *work like we don't have a deadline — the ONLY things that must
ship finished are the contract, the lenses and the token functionality. Everything creative is
**open studio, work in progress**, agreed with SuperRare.* Launch is **2026-08-06, 11:11 PM ET**.

| # | | why it blocks |
| --- | --- | --- |
| 89 | **Deploy PackSink + Ripmaster3030Lens721 to Sepolia, paste the addresses** | Both are written, tested and wired, and both SHIP DARK. With `chain-config.contracts.packSink` empty, `RipWallet.payPack/payRake` fall back to a plain 100% burn — so the site's 50/50 revenue copy describes something the code is not doing. With `lens721` empty the collector door falls back to the local vault with `verified:false`. |
| 70 | **Hand SuperRare the token name in writing, then re-read `name()` before broadcast** | `name()` and `symbol()` are baked in at deploy and unfixable. The strings are `ripmaster3030studios` and `3030`. This project already owns a token permanently stuck with a wrong name for exactly this class of slip. |
| 72 | **Mainnet flip** — chain-config, wrong-network guard, end-to-end smoke test | |
| 74 | **Launch night** — lift the gate, rotate creds, final copy + NFA pass | |
| 99 | **Hero economics: 11 auction / 11 gacha / 11 earned, and the unlock criteria** | ⚠ BLOCKED ON THE ARTIST, and it is content not code. Site copy currently says 11 gacha + 22 earned. The artist proposes 11 on SuperRare auction + 11 gacha + 11 earned and asks what the earned ones actually require — *"they need to be hard enough"*. Touches index.html, the whitepaper, tokenomics, and possibly the lens voucher kinds (today: kind 1 gacha / 2 game title; a third may be needed). **Do not guess the criteria.** |

---

## 1 · The games — the artist's open list

| # | game | the ask |
| --- | --- | --- |
| 94 | **Rip Rocketer** | vertical scroll through levels, Metal Slug bases and turrets, ship variety. ⚑ Flight model is explicitly praised — do not retune it. |
| 92 | **Cloud Racer** | the wash (luma 193, blacks 0.9%), more 3D depth, glowing engine jets |
| 93 | **Dogfight** | real cities below — skyscrapers, cars, canyons to fly through |
| 95 | **Section 9** | speed, jump/flight boots, motion blur |
| 91 | **all three** | motion blur + physics dynamics for the screens. GfxPost's smear path is BUILT and measured; it is `blur: 0` on every preset except `tactical`. Wiring and tuning, not new machinery. |
| 98 | **NEON RONIN** | a roster picker — the 7 generated bodies rotate per match so a specific one cannot be chosen, which is why "I don't see SMOWLz" persists even though `cc0-cel` IS SMOWLz |
| 82 | **Section 9** | textured arenas + graffiti (partially shipped), and the graffiti still reads as colour bands at range |
| 60 | **Section 9** | stage 3 maps |

---

## 2 · Cards and the lens

| # | |
| --- | --- |
| 97 | More layered cards. `npm run cardlayers` links 3 of 211. ⛔ The rule stands: **no faking depth by segmenting flat art.** Only cards whose art genuinely separates. |
| 97 | Verify the VS face-off fires. The markup and CSS exist in `cards/battle.html`; nobody has proven the trigger runs. |
| 71 | Clean-slate the deck — 196 placeholders out, the real 100 in |
| — | Card backs as **broadcasts** (DELTRON-3030.md, card design): a dateline from 3030, a subsidiary-of imprint, a signal-quality mark |
| — | **Rarity as signal integrity** rather than a gem colour — common reads as a clean scan, higher tiers degrade or are corrected |

---

## 3 · The site

| # | |
| --- | --- |
| 96 | Mobile: **172 text elements under 12px, 13 tap targets under 40px**, measured at 390×844. The hero is already fixed (270×31 → a square 289×289). |
| — | The square mark now exists — cut the **favicon, app icon, OG card and token image** from it. That was half the argument for making it square. |
| 47 | Coming-soon gate: frosted-glass veil + torch reveal |
| 73 | ⚠ **Verify on a real phone.** Every mobile number in this repo is SwiftShader in a container and is RELATIVE ONLY. |
| — | The **interstitials** (DELTRON-3030.md idea 1): loading screens, wave-clear banners, the 404 and the gate are dead inventory. Eleven of that album's twenty-one tracks are sub-minute fake broadcasts, and that is where its world gets built. |

---

## 4 · Characters

| # | |
| --- | --- |
| 98 | **Derage and Grifters** are not in `docs/CC0-SOURCES.md` at all — no licence grading, no body. They need the same VERIFIED/ATTESTED treatment every other source got BEFORE anything is modelled. |
| — | `DAM001/blenderWeaponCreator` and `DanielKlas/3D-Models` both have **no licence file** (404), so their geometry cannot be committed. Unblocked the moment either the author adds one or the artist confirms permission — both are a friendly ask, not a technical problem. |
| — | NEON RONIN fields the seven generated bodies now; the roster's stats/weapons/unlocks are the artist's call |

---

## ⚑ 5 · The scaling list — how this project gets better, not just bigger

These are the patterns worth repeating, all earned this session:

1. **Ship the measurement with the feature.** Every fix that stuck came with a number: hue travel
   for foil, IoU for gun silhouettes, blacks-percent for the washes, per-letter displacement for
   the rig. "It looks better" cannot be defended a week later; 261° median hue travel can.
2. **Write the assertion that FAILS on the old behaviour.** "It moved" and "there are four meshes"
   are weak questions — a global transform and four copies of one carbine both pass them. The
   assertions that bite are the ones the previous version cannot satisfy.
3. **⛔ Built ≠ reachable, and this is the project's single most common defect.** Every one of these
   was complete code that nobody could get to: the CC0 bodies behind a quality tier keyed to pixel
   density; XCOPY and Darkfarms sitting at cast indices a 3-bot match never read; `setRoster`
   written but not exported; the layered cards generated into a directory no file references;
   PackSink and the lens shipping dark. **When something "isn't there", check reachability before
   building it again.**
4. **Two copies of a fact will diverge.** The lobby's weapon list, the HUD's `smg → 'ak'`
   substitution, the material table that went stale against CAST twice, `RUNS` versus `.sm`. Derive
   it or assert the copies agree.
5. **Brief the MOTION, not just the material.** DESIGN-SYSTEM.md §8 asks five questions and §4 —
   what moves and why it physically moved — is the one that gets skipped, because a renderer has
   features for material and light and none for motion. Two hero wordmarks were rejected for this.
6. **Measure in play, never in the menu.** Three frame measurements in this project were taken in
   a lobby and had to be declared void. The debug sweep now drives each game past its menu.
7. **A workaround must die with its bug.** `invX` was defaulted on while the mirror was still live.
8. **Fail open, and prove it.** Every renderer here degrades rather than blanks, and the tests
   break the build on purpose to check.

### Tooling that makes the above cheap

`npm run debug` (all games: errors, 4xx, WebGL, pixel stats) · `npm test` (9 suites, 322 assertions)
· `npm run herotype` · `npm run cardlayers` · `npm run stretch` · `npm run cc0` · `npm run guns`

⚠ And the standing caveat on all of it: **this container is SwiftShader and its screenshot path
rotates hue on canvas content.** Judge colour from a readback, layout from screenshots, and treat
every frame time as relative-only.

# REACHABILITY — the ledger

> Swept 2026-08-02 against `claude/superrare-trading-cards-71ajcx`. Every claim below has a proof
> you can re-run: a grep whose output is quoted, or a driven page whose readback is quoted.
> "Looks unused" is not in here.

**Why this file exists.** `docs/ROADMAP.md` §5.3:

> ⛔ **Built ≠ reachable, and this is the project's single most common defect.** Every one of these
> was complete code that nobody could get to … **When something "isn't there", check reachability
> before building it again.**

**The guard is `npm run test:reach`** (`scripts/test-reach.mjs`, 56 assertions, in `npm test`).
Every assertion in it FAILS on the state that shipped this morning — verified by reverting each
fix one at a time and re-running (5 failures, listed under each finding below).

---

## The ranking

Ranked by **what a visitor loses**, not by how hard it was to find.

| # | finding | what a visitor loses | state |
| --- | --- | --- | --- |
| **R1** | `ronin.html` in **no href anywhere** | an entire game | ✅ **FIXED** |
| **R2** | layered 3D cards reachable only through an unlinked page | the feature the artist asked after | ⛔ **DESIGN — recommendation below** |
| **R3** | Section 9's **VISITOR door** had no input module | 1 of the 3 seats in `docs/SEATS.md` | ✅ **FIXED** |
| **R4** | quality tier keyed to pixel density in **3 games** | `mid` + `high` on every 1× monitor | ✅ **FIXED** |
| **R5** | NEON RONIN fetched **9.1 MB** the draw path cannot reach | 25 404s + 9.1 MB per load | ✅ **FIXED** |
| **R6** | `S9Skin.nameFor()` computed, never displayed | the bodies' names — ROADMAP #98 verbatim | ⛔ **DESIGN — flagged** |
| **R7** | `studio.html` — a whole draft home page, unlinked | nothing today; it is a draft | ⛔ **DESIGN — flagged** |
| **R8** | `lens721` / `packSink` ship empty | the 50/50 split and verified collector seat | ✅ **DELIBERATE — not a defect** |
| **R9** | `sitemap.xml` missing 4 live pages | crawler reach | ✅ **FIXED** |
| **R10** | assorted dead assets (~2.5 MB) | nothing | ⛔ **flagged, not deleted** |

---

## R1 · ⛔ AN ENTIRE GAME WAS UNREACHABLE — `ronin.html`

**What was built.** NEON RONIN: `ronin.html` (22 KB) + `js/ronin.js` (1560 lines) + `ronin3d.js`
(the true-3D WebGL renderer) + `ronin-fighters.js` + `ronin-glb.js` + `ronin-morph.js` +
`ronin-world.js` + 13 fighters with card-unlock rules + three baked arenas. Working: driven, it
reports `__rn` live, **13 roster chips**, **4 arena chips**, **zero page errors**.

**What made it unreachable.** Nothing linked to it. Not the arcade, not the landing page, not the
sitemap.

**The proof.** Over every shipped file:

```
$ grep -rn "ronin\.html" --include=*.html --include=*.js --include=*.json --include=*.xml \
    . --exclude-dir=node_modules --exclude-dir=build --exclude-dir=scratch_new
   (no output)
```

Driven, `arcade.html` before the fix returned exactly five cabinets:

```
cabs: ["section9.html","riprocketer.html","dogfight.html","cloudracer.html","cards/battle.html"]
```

⚑ **And the near-miss is the interesting part.** `studio.html:234` links
`<a href="arcade.html#ronin">Neon Ronin</a>` — so somebody *did* intend the cabinet to exist. There
was no `id="ronin"` in `arcade.html`, and **a missing anchor does not error**: the browser silently
lands on the top of the page. The link looked fine and went nowhere. CLAUDE.md has said "Reached
via `arcade.html`" the whole time; this is a documented intent that was never wired.

**The fix.** A NEON RONIN cabinet in `arcade.html` carrying `id="ronin"`, plus a `sitemap.xml`
entry. Cost: 12 lines of markup, no JS.

**Proof it took.** Driven after: `cabs` has six entries including `ronin.html`, `roninAnchor: true`.
**Assertion that bites:** `arcade.html links ronin.html` + `the #ronin anchor studio.html
deep-links to exists` — both FAIL when the cabinet is removed.

---

## R2 · ⛔ THE LAYERED 3D CARDS — THE ARTIST'S LIVE COMPLAINT

**This is two chained defects, and the second is the one that actually hides the feature.**

### R2a · the 196 card pages have no 3D at all

`cards/<slug>.html` × 196 contain **zero** references to `Card3D` or `CardLayers`. Driven,
`cards/blue-beak.html`:

```
hasCard3D: false,  hasCardLayers: false,  canvases: 0,
scripts: ["../sfx.js", "cardnav.js"]
```

Two scripts. No canvas. The card is CSS: a flip card with a gradient foil overlay. Only
`battle.html`, `binder.html`, `lens3d.html` and `studio.html` reference `Card3D` anywhere.

### R2b · ⛔ THE PAGE THAT *CAN* RENDER THEM IS ITSELF UNLINKED

Only **one** shipped page loads `js/card-layers.js` as a real page: `cards/lens3d.html`.
(`cards/hero/_template.html` also does, but it is an authoring template, not a route.)

And there is exactly **one** hyperlink to it in the entire repo:

```
$ grep -rn "lens3d\.html" --include=*.html --include=*.js --include=*.json --include=*.xml . \
    --exclude-dir=node_modules --exclude-dir=build --exclude-dir=scratch_new \
    --exclude-dir=scripts --exclude-dir=docs | grep -E "href=|src=|location|open\("
./studio.html:256:      <a class="btn c" href="cards/lens3d.html?hero=45">◈ See a lens</a>
```

**and `studio.html` has zero inbound links of its own** (R7). So the chain is:

```
models/cards/*/layers/*.png  (34 plates, 7.9 MB)
  ← cards/art/hero/{36,42,44,45,47,49}.layers.json
    ← CardLayers.load()
      ← cards/lens3d.html          ← the ONLY page that loads js/card-layers.js
        ← studio.html              ← the ONLY page that links it
          ← nothing
```

⚠ **`cards/binder.html` — the folder, the one place a visitor opens a card into the live 3D
viewer — loads `js/card3d.js` but NOT `js/card-layers.js`.** Driven at
`cards/binder.html#hero-44`:

```
hasCard3D: true,   hasCardLayers: false,   layerReqs: 0
```

So even the folder renders card 44 **flat**. The plates are never requested.

**And the feature works.** Driven at `cards/lens3d.html?hero=44`:

```
hasCardLayers: true, hasCard3D: true, plates: 4, errors: []
layerReqs: 44/layers/00-bg.png, 01-ground.png, 02-subject.png, 03-text.png
```

Control, `?hero=35` (no sidecar): `layerReqs: 0`, one 404 on the sidecar probe — which is the
documented NORMAL null case, not a failure.

`npm run test:reach` §6 re-checks the data every run: **34 plates across 6 cards, every declared
`src` resolves to a real image**, and it prints
`layer-capable pages reachable from a linked page: 0`.

### ⛔ THE RECOMMENDATION — and the honest answer on the 196 pages

**Do NOT put the layered renderer on the 196 placeholder card pages.** Reasons, in order:

1. **None of them has layers, and none ever will.** The sidecars are all on HERO cards (34–49) —
   the artist's own scans. The 196 are a different deck. `CardLayers.load()` on a placeholder
   returns `null` by design, so the work would render exactly what renders today plus a wasted
   `card3d.js` + engine fetch on 196 pages.
2. **They are being clean-slated (task #71).** Touching 196 files that are scheduled for deletion
   is the definition of gold-plating.
3. ⛔ **`js/card-layers.js`'s own header forbids the shortcut** that would make them layered:
   *"We do not fake layers by segmenting flat art."* Anything that made those 196 pages look
   layered would have to break that rule.

**Do this instead — three steps, cheapest first:**

| | do | cost | what it buys |
| --- | --- | --- | --- |
| **1** | Add `<script src="../js/card-layers.js">` to `cards/binder.html` and pass the spec into its `Card3D.build` | **one script tag + ~3 lines** | The folder is the one place a visitor already opens a hero into the 3D viewer. This alone makes all six layered cards reachable from a linked page. |
| **2** | Link `cards/lens3d.html?hero=NN` from the binder's viewer as "open the lens" | ~1 line | The full-page lens — the same thing a token's `animation_url` frames — becomes shareable. |
| **3** | Give the **hero deck** (34–49) real card pages, generated from `hero-manifest.json` the way `cards/index.html` builds its tiles | a generator run | The heroes have no per-card page at all today, only `binder.html#hero-NN`. This is where a "card page with a 3D layered card" actually belongs. |

⛔ **Step 1 is not done here because it changes what `cards/binder.html` renders**, and that is a
look decision on the artist's own artwork. It is a two-line change the moment he says yes.

⚠ **R2b is fixed for free by whatever answers R7** — the moment `studio.html` is linked (or its
"See a lens" button is moved onto a page that already is), the layered cards become reachable.

---

## R3 · ⛔ SECTION 9'S VISITOR DOOR COULD NEVER OPEN

**What was built.** `docs/SEATS.md`: three doors into one lobby. **A** holder (`$3030` balance),
**B** collector (lens721 balance), **C** visitor (a Base arcade-fee receipt). `js/session.js`
implements all three.

**What made it unreachable.** `checkVisitor()` opens on one input:

```js
// js/session.js:109
const R = window.RipEth || null;
const d = { open: false, configured: !!R, plays: 0, verified: false };
if (!R) return d;
```

`window.RipEth` comes from `js/eth-play.js`. `section9-classic.html` loads it (line 354) directly
above `js/session.js`. **`section9.html` — the build the arcade actually links — did not.**

**The proof.** Driven, both builds, same harness:

| page | `!!window.RipEth` |
| --- | --- |
| `section9.html` (shipping) | **false** |
| `section9-classic.html` (rollback) | true |

So on the shipping build door C returned `{configured:false, open:false}` unconditionally. Not a
decision — an omission during the PlayCanvas port, and the exact shape ROADMAP §5.3 describes.

**The fix.** One `<script src="js/eth-play.js">` in `section9.html`, in the same position the
classic build has it. **Proof it took:** `hasRipEth: true` after.
**Assertion that bites:** `section9.html loads js/eth-play.js alongside js/session.js`.

---

## R4 · ⛔ THE QUALITY TIER WAS THE PIXEL RATIO — IN THREE GAMES

**This is a KNOWN bug that was fixed once and left standing everywhere else.**
`scripts/test-s9cast.mjs`'s own header, failure #1:

> `AUTO_TIER` was derived from `GfxPost.dprCap()`, which ends in `min(dpr, cap)` — so an ordinary
> 1x desktop monitor scored 1 and landed on the `low` tier…  **Pixel density is not GPU capability.**

That was fixed in `js/s9pc-app.js` for Section 9. **`js/crpc-app.js` (Cloud Racer),
`js/rrpc-app.js` (Rip Rocketer) and `js/dfpc-app.js` (Dogfight) still carried the identical line:**

```js
const DPRCAP = (window.GfxPost && GfxPost.dprCap) ? GfxPost.dprCap() : 2;
const AUTO_TIER = DPRCAP >= 2 ? 'high' : (DPRCAP >= 1.5 ? 'mid' : 'low');
```

**Why it can never be true.** `dprCap()` ends in `return Math.max(1, Math.min(dpr, cap));`. On a
1× display — every ordinary desktop monitor — that is **exactly 1**, whatever the machine is.
`1 >= 1.5` is false. So `low`, always. `mid` and `high` were unreachable without a `?q=` in the URL
that no page ever writes.

**The proof.** Driven on an emulated 1× / 8-core / 8 GB desktop, evaluating both formulas in the
live page:

| page | `dpr` | cores | the dprCap formula | `GfxPost.deviceTier()` |
| --- | --- | --- | --- | --- |
| cloudracer.html | 1 | 8 | **low** | **high** |
| riprocketer.html | 1 | 8 | **low** | **high** |
| dogfight.html | 1 | 8 | **low** | **high** |

Two rungs apart, on the strongest machine the ladder is meant to serve. Every tier table in those
three files — shadows, SSAO, live lights, star counts, jet lights, bloom — was tuned for rungs
nobody was getting.

**The fix.** `GfxPost.deviceTier()` in all three, exactly as `js/s9pc-app.js` already does. It
reads the same device signals *without* the dpr term. ⚑ `DPRCAP` **stays** in all three — it is
still the right answer for the **backing store**, which is what it was written for, and the test
asserts it is still used there.

**Proof it took.** Live tier readback after the change, same emulated desktop:

| page | live `TIER` before | after |
| --- | --- | --- |
| riprocketer.html (`__rrpc.TIER`) | low | **high** |
| dogfight.html (`DFPC.tier()`) | low | **high** |
| cloudracer.html (`__crpc.TIER`) | — *(no read-back existed)* | **exposed, then high** |

⚠ Cloud Racer had no way to read its own tier from outside, so the fix could not be asserted.
`TIER` is now on `window.__crpc` the way `js/rrpc-app.js` already exposes it. That is itself an
instance of the pattern: a decision the page makes about the device, with no surface to check it on.

**Assertions that bite:** for each of the four apps, `derives its tier from deviceTier(), not
dprCap()` **and** `still uses dprCap() for the BACKING STORE`.

---

## R5 · ⛔ NEON RONIN FETCHED 9.1 MB THAT THE DRAW PATH CANNOT REACH

The mirror image of every other finding here: not built-and-unreachable, but
**fetched, parsed, registered — and unreachable at draw time.**

**The proof, two independent ways.**

1. `js/ronin3d.js:791-792` — the skin wins before the model is consulted:

```js
if (skins[f.arch]) { drawSkinned(f, mirror, K, fm); return; }   // real skinned deformation
if (models[f.arch]) { drawModelFighter(f, mirror, K, fm); return; }
```

2. **All 13 `ARCH_KEYS` have a `models/<key>.skn` on disk** — asserted by the test, 13/13.

So the second, unconditional `ARCH_KEYS.forEach` pass — 13 × `<arch>.glb` then 13 × `<arch>.obj` —
could never produce a mesh that gets drawn. Driven, before:

```
25 × 4xx   models/{ronin,kappa,doomer,oni,kunoichi,prizm,rip-mascot,cc0-*}.{glb,obj}
200        models/ronin.obj   6,774,220 bytes
200        models/oni.obj     2,592,604 bytes     → 9.1 MB downloaded, parsed, never drawn
```

ROADMAP already listed the 25 404s as "known, measured, not yet fixed" and noted they *hide a real
error* in the sweep's error column. It did not note the 9.1 MB, because nobody had asked whether
the successful half was drawable.

**The fix.** Chain the rigid load onto the **skin fetch failing** instead of running it for every
archetype. ⚑ The drop-in hook is preserved exactly — an archetype with no `.skn` still falls
through to `<arch>.glb` → `<arch>.obj` and still replaces the procedural body. Nothing that could
be drawn before stops being drawn; only fetches whose result was undrawable are dropped.

**Proof it took.** Driven `ronin.html` after: **13 requests, all `200 /models/*.skn`, zero 4xx,
zero `.obj`.** Roster still 13, `__rn` live, no page errors.

⚑ This mattered *because* of R1: linking a game from the arcade that hands every desktop visitor
9.1 MB of dead weight would have been a regression introduced by the fix.

---

## R6 · ⛔ THE BODIES HAVE NAMES NOBODY IS EVER SHOWN — flagged, not fixed

ROADMAP §1 task #98, in the artist's words:

> "I don't see SMOWLz" persists even though `cc0-cel` IS SMOWLz

`js/section9-skin.js` has the answer and never says it out loud:

```js
function nameFor(arch) { const c = CAST.find(x => x.arch === arch); return (c && c.name) || arch; }
// exported: return { CAST, PLAY, BONES, BIND, H, archFor, need, bytesFor, matFor, nameFor, setRoster, … }
```

LONG ODDS · HOUSE EDGE · BAD BEAT · PRIZE MASCOT · BAD SIGNAL · HEAVY LINE · GRIDLOCK.

**The proof — `nameFor` has zero call sites in the entire repo:**

```
$ grep -rn "nameFor" --include=*.html --include=*.js --include=*.mjs . \
    --exclude-dir=node_modules --exclude-dir=build --exclude-dir=scratch_new
./js/section9-skin.js:16: *   S9Skin.nameFor(arch)  the studio's name for a body (never the source's — see CAST)
./js/section9-skin.js:85:  function nameFor(arch) { … }
./js/section9-skin.js:358:  return { CAST, PLAY, …, nameFor, setRoster,
```

Three hits, all inside the file that defines it. Bots are labelled from `HANDLES`
(`js/s9pc-game.js:330` — 'Raoul Duke', 'Chuck Meltdown', …), a **player-handle** list. The body's
identity is computed on every match and thrown away.

⛔ **Not fixed here: what a killfeed or scoreboard says is UI copy, i.e. a design decision.**
The cheapest version is one interpolation in `js/s9pc-ui.js:340`'s scoreboard row — the handle,
then the body name in the mono face beside it — which would answer #98 without a roster picker.
That is the artist's call, and `S9Skin.nameFor()` is already sitting there waiting for it.

⚠ Same family, same file: `S9Skin.PLAY` and `S9Skin.bytesFor` are also exported with no external
caller. They are read-backs for a harness, which is legitimate; `nameFor` is not — it exists to be
displayed.

---

## R7 · ⛔ `studio.html` — A WHOLE DRAFT HOME PAGE, UNLINKED — flagged, not fixed

**Zero inbound links.** It is a complete alternative landing page ("THE SHELL" in its own header),
it links the folder, the arcade, the whitepaper, four cabinets and — uniquely — the lens.

⛔ **Not fixed: promoting a draft shell over `index.html` is an identity decision**, and this is
four days from launch. It is allow-listed in `test-reach.mjs` **with that reason written into the
allow-list**, so it cannot be quietly forgotten.

⚠ **But it is load-bearing for R2.** `studio.html` is the only page in the repo that links
`cards/lens3d.html`. Whatever is decided about the shell decides whether the layered cards are
reachable, so the two questions should be answered together.

⚠ Its Neon Ronin link (`arcade.html#ronin`) now resolves — see R1.

---

## R8 · ✅ DELIBERATELY DARK — not defects

Recorded so a future sweep does not "fix" them.

| | why it is not a defect |
| --- | --- |
| `chain-config.contracts.lens721: ""` | Documented in the config, ROADMAP task #89. The collector door falls back to the local vault with `verified:false` rather than pretending a localStorage array is proof. |
| `chain-config.contracts.packSink: ""` | Same. `RipWallet.payPack/payRake` fall back to a plain 100% burn, byte-identical to the rehearsed call, and `hasSink()` makes the UI say which ran. **Deploy + paste is the only step.** |
| `models/world/street.wld` (6.2 MB) not in `S9World.LEVELS` | Excluded in a comment, with the reason: no spawns, NaNs in its vertex buffer. It is still reachable as NEON RONIN's world fallback. |
| `js/ronin.js` `WORLD_ON` / `urm_world` | The free-roam city is **shelved on purpose** and says so. The arena picker sets the flag, so the levels are reachable from the lobby. |
| `cards/deck3d.html` | A redirect kept alive because that URL was already shared. |
| `superrare.html`, `cabinet.html`, `deploy-render.html` | Reached from the chain or by an operator, not from the site. `superrare.html` being wallet-free is enforced by `npm run test:embed`. |

---

## R9 · ✅ `sitemap.xml` — four live pages missing

It listed 11 URLs and omitted `section9.html`, `cloudracer.html`, `ronin.html` and
`cards/market.html` — all of them linked from pages that *are* listed. Added.
**Assertion that bites:** `sitemap.xml lists <each cabinet>`.

---

## R10 · dead assets — flagged, not deleted

Nothing here costs a visitor anything (an unrequested file is not downloaded); it is repo and
deploy weight. Deleting an artist's source material is not a sweep's call.

| asset | size | proof it is unreached |
| --- | --- | --- |
| `sfx/nvg/*.mp3` (4) + `sfx/gearup/Gear_Up_Parachute_01.mp3` | **1.2 MB** | `RipSfx.FAM` declares families `nvg` and `chute`; `grep -rn "'nvg'\|chute"` outside `js/sfx-lib.js` returns **nothing**. Every other family (`gearup`, `attach`, `attachMachine`, `attachSmall`, `bass`) has call sites. ⚑ **The counts are all exactly right** — 23/1/10/8/10/4/11 declared, 23/1/10/8/10/4/11 on disk — so this is a missing *caller*, not a bad index. |
| `models/cc0/cc0-props.glb` | 159 KB | Referenced only by `scripts/blender/build-cc0-props.py` and `build-cc0-preview.py`. No shipped file fetches it. |
| `media/lens/demo/*` (9) | 944 KB | Reachable only at `cards/lens3d.html?demo` — a query flag nothing links, on a page nothing links. A dev fixture. |
| `models/oni.obj` + `models/ronin.obj` | 9.1 MB | **No longer fetched** after R5. They remain the bake sources for `oni.skn` / `ronin.skn` (`models/README.md`), so they stay in git. |
| `js/icons.js`: `back`, `clock`, `joystick`, `play`, `trophy` | ~0 | 16 icons declared, 11 used via `data-ic`. A library having spares is normal. Listed for completeness only. |

**Checked and clean** (so nobody re-checks them): `textures/*` — all 27 driven by
`textures/manifest.json`, all 9 classes in `ORDER`. `media/site/*` — the six PBR maps are built as
`'media/site/' + s.map + '-albedo.webp'` in `js/site3d-prop.js`; templated, not orphaned.
`cards/art/*.webp` — **197 files, 0 unreferenced.** `models/world/*.cols.json` — fetched by
`RoninWorld.load()` deriving them from the `.wld` path. `models/cards/*/preview/`, `*.glb`,
card 44's source maps — build output, `.vercelignore`d with the reason written in.
`GfxPost.PRESET` — all three used. `RipPowers.TRIGGER_GUN` — all 8 manifest triggers covered.

---

## Loose ends worth someone's eye

- ⚠ **`section9-classic.html` throws on load**: `ReferenceError: Cannot access 'WEAPONS' before
  initialization`, seen in the driven run. Pre-existing, in the *rollback* build — which is where a
  browser with no WebGL 2 gets sent, so it is the fail-open route that is broken. Not a
  reachability defect; not touched here.
- ⚠ **`walletConnectProjectId` is domain-allowlisted to `upperdeckripmaster3030.com`**
  (`js/chain-config.js`, in its own comment). A WalletConnect project rejects origins that are not
  on its list, so on `ripmaster3030studios.com` the mobile-wallet path may reach nothing. That is a
  gate whose input cannot reach the required value — the same class as R4 — but it lives in a
  dashboard, not in code. **Check it before launch night.**
- ⚠ `js/session.js` (SEATS) is loaded by **Section 9 only**. That is the documented reference
  integration, not a defect — but seven other cabinets take wagers with no seat.
- ⚑ `GfxPost.timeScaleAll` calls `RipSfx.rate()`, which `js/sfx-lib.js` does not export. **Not a
  defect** — it is a duck-typed offer, guarded by `typeof … === 'function'`, and the three lines
  RipSfx would need are written out in the comment. The pitch cue starts working the day it lands.

---

## What changed

| file | change |
| --- | --- |
| `arcade.html` | +NEON RONIN cabinet, `id="ronin"` |
| `section9.html` | +`<script src="js/eth-play.js">` |
| `js/crpc-app.js` | tier ← `deviceTier()`; `TIER` exposed on `__crpc` |
| `js/rrpc-app.js` | tier ← `deviceTier()` |
| `js/dfpc-app.js` | tier ← `deviceTier()` |
| `js/ronin.js` | rigid-part load chained onto the skin fetch failing |
| `sitemap.xml` | +4 URLs |
| `scripts/test-reach.mjs` | **new** — 56 assertions |
| `package.json` | +`test:reach`, appended to `npm test` |

`npm test` stays green. Nothing else in the tree was touched.

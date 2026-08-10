#!/usr/bin/env node
/* ripmaster3030studios — REACHABILITY GUARD.
 *
 *     node scripts/test-reach.mjs            (npm run test:reach)
 *
 * ⛔ THIS EXISTS BECAUSE "BUILT ≠ REACHABLE" IS THIS PROJECT'S SINGLE MOST COMMON DEFECT —
 *   docs/ROADMAP.md §5.3, and docs/REACHABILITY.md is the full ledger. The failures it catalogues
 *   all share one shape: complete, tested, working code that no visitor could get to. The CC0
 *   bodies behind a quality tier keyed to pixel density. XCOPY and Darkfarms at cast indices a
 *   3-bot match never read. `setRoster` written but not exported. The layered cards generated into
 *   a directory no file references. An entire game — NEON RONIN — that appeared in ZERO shipped
 *   files while CLAUDE.md said "reached via arcade.html".
 *
 * ⚑ EVERY ASSERTION BELOW FAILS ON THE STATE THAT SHIPPED ON 2026-08-02 (ROADMAP §5.2 — write the
 *   assertion the previous version cannot satisfy). Each one is annotated with what it was.
 *
 * Static: parses the sources and the filesystem. No browser, so it is fast enough for `npm test`
 * and it catches the regression at the moment it is written rather than in a screenshot later.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = f => readFileSync(join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}` + (detail ? `  — ${detail}` : '')); }
  else { fail++; console.log(`  FAIL ${name}` + (detail ? `  — ${detail}` : '')); }
};
const head = s => console.log('\n' + s);

/* Every file a browser can load — the corpus a "is this reachable" question is asked against.
 * scripts/, docs/ and contracts/ are excluded on purpose: they mirror .vercelignore, and a
 * reference from a build script is not a route a visitor can walk. */
const SHIPPED = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || ['node_modules', 'build', 'scratch_new', 'tmp_naming', 'docs',
      'scripts', 'contracts', 'prompts', 'models', 'media', 'sfx', 'textures', 'fonts', 'vendor',
      'art'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (/cards[/\\](art|data)$/.test(p)) continue; walk(p); }
    else if (/\.(html|js|json|xml)$/.test(e.name)) SHIPPED.push(p);
  }
})(ROOT);
const TEXT = new Map(SHIPPED.map(f => [f.slice(ROOT.length + 1).replace(/\\/g, '/'), readFileSync(f, 'utf8')]));

/** Files that NAVIGATE to `page` — an href/src/location/data-href, not a mention in a comment.
 * ⚠ A LINK IS RESOLVED, NOT STRING-MATCHED. `cards/index.html` reaches `cards/blue-beak.html`
 *   by writing `data-href="blue-beak.html"`; matching the full repo path would miss every one of
 *   the 196 card pages and report the deck as orphaned. So the target is matched against what the
 *   REFERRER would have to write to get there — a path relative to the referrer's own directory. */
function navigatorsOf(page) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...TEXT].filter(([f, s]) => {
    if (f === page) return false;
    const fromDir = dirname(f) === '.' ? '' : dirname(f) + '/';
    const rel = page.startsWith(fromDir) ? page.slice(fromDir.length) : page;
    const forms = new Set([page, rel, '/' + page, '../' + page]);
    /* ⛔ A SERVER SERVES A DIRECTORY'S index.html, AND THIS WAS BLIND TO IT. `index.html` links the
     * deck as href="cards/" and every card page backs out with href="./" — neither of which is a
     * .html string, so the sweep saw the deck as unlinked. It was then EXEMPTED as a "root", which
     * is the worst possible resolution: a root with no inbound link is just an orphan with a
     * special name, and the exemption meant nothing ever checked that a visitor could reach the
     * 197 cards at all. Resolve the directory form and the exemption is not needed. */
    if (page === 'index.html' || page.endsWith('/index.html')) {
      const dir = page.slice(0, -'index.html'.length);            // '' or 'cards/'
      const relDir = dir.startsWith(fromDir) ? dir.slice(fromDir.length) : dir;
      for (const d of [dir, relDir, '/' + dir, '../' + dir]) forms.add(d === '' ? './' : d);
      if (dir === fromDir) { forms.add('./'); forms.add(''); }
    }
    const alt = [...forms].map(esc).join('|');
    return new RegExp('(?:href|src|action)\\s*=\\s*["\'](?:' + alt + ')(?:[#?][^"\']*)?["\']' +
                      '|location(?:\\.href)?\\s*=\\s*["\'](?:' + alt + ')' +
                      '|<loc>[^<]*/(?:' + alt + ')<', 'i').test(s);
  }).map(([f]) => f);
}

// ═══ 1 · EVERY GAME IS REACHABLE FROM THE ARCADE ═══════════════════════════════════════════════
/* ⛔ THE ONE THAT COST A WHOLE GAME. `ronin.html` — NEON RONIN, 13 fighters, three arenas, its own
 *   renderer — was in no href, no sitemap entry and no nav anywhere in the repo. `studio.html`
 *   linked `arcade.html#ronin`, an anchor that did not exist, and studio.html is itself unlinked.
 *   Proof of the old state: `grep -rn "ronin\.html"` over every shipped file returned NOTHING. */
/* ⛔ A FILE THAT DOES NOT PARSE IS NOT REACHABLE EITHER, AND THIS SUITE HAPPILY PASSED ONE. Every
 * check here is a text match, so a `SyntaxError` in a shipped script is invisible to all of them —
 * a broken comment delimiter in `city-app.js` scored 121/121 while the page could not run at all.
 * That is this file's own subject in its purest form: the page is served, the script 404s nothing,
 * and the game is simply absent. `new Function` compiles without executing, which is exactly the
 * question being asked — does this parse — and costs nothing. */
/* ⚠ BROWSER SCRIPTS ONLY. `api/*.js` are Vercel serverless handlers — real ES modules with
 * `import`/`export default`, which `new Function` cannot parse BY DEFINITION and which no page
 * loads with a <script src>. Flagging them was the check being wrong, not the files; scoping it
 * here rather than widening the parser keeps the assertion meaning one thing. `vendor/` is
 * third-party and not ours to fix. */
head('0 · every shipped browser script actually parses');
{
  const js = [...TEXT.keys()].filter(f => f.endsWith('.js') &&
    !f.startsWith('vendor/') && !f.startsWith('api/'));
  t('there are shipped scripts to check', js.length > 10, js.length + ' files');
  let bad = 0;
  for (const f of js) {
    try { new Function(TEXT.get(f)); }
    catch (e) { bad++; t(`${f} parses`, false, String(e.message).slice(0, 90)); }
  }
  t('every shipped browser script parses', bad === 0, bad ? bad + ' failed to parse' : js.length + ' files');

  /* ── ⛔ 0b · AND SOMETHING HAS TO ACTUALLY LOAD IT ────────────────────────────────────────
   * §0 proves every module PARSES. It says nothing about whether any page reaches it, and that
   * gap has now cost real work twice in one day:
   *   · the artist reported *"not seeing the gun fire"*; I put the muzzle flash in
   *     `js/dogfight-gl.js`, which is the RETIRED renderer. `dogfight.html` loads
   *     `js/dfpc-app.js`. Correct, committed, described as done, and unreachable.
   *   · then, arguing that CLOUD RACER already scales fov with speed, I cited
   *     `js/cloudracer-gl.js` — also retired. The claim happened to be true of the live build
   *     too, which is worse: **a dead file gave a right answer for the wrong reason.**
   * ⚑ A retired renderer is not inert. It is a plausible, well-commented, wrong place to work,
   *   and it reads exactly like the live one. This is `built ≠ reachable` pointed at MODULES
   *   rather than at pages, and it is the same sweep §2 already runs on HTML.
   * ⚠ THE DETECTION HAS TO IGNORE COMMENTS AND HAS TO READ HTML'S DYNAMIC LOADERS. My first cut
   *   did neither: `js/dfpc-fx.js` mentions `js/dogfight-gl.js` in the very comment explaining
   *   that it is dead, which made the dead file look live; and `cards/lens3d.html` loads four
   *   modules from an array inside an inline `<script>`, which a `<script src>` scan cannot see.
   *   Both failures were in the REASSURING direction. */
  const bare = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
                     .replace(/<!--[\s\S]*?-->/g, ' ');
  const loaded = new Set();
  for (const [f, body] of TEXT) {
    if (!/\.(html|js)$/.test(f)) continue;
    const src = bare(body);
    for (const m of src.matchAll(/<script[^>]+src=["']([^"']+)["']/g))
      loaded.add(m[1].split('?')[0].replace(/^.*\//, ''));
    for (const m of src.matchAll(/["'`]([\w./-]*js\/[\w.-]+\.js)["'`]/g))
      loaded.add(m[1].replace(/^.*\//, ''));
  }
  const DEAD_OK = {
    /* nothing yet — a module that no page loads should be deleted, not listed. This exists so a
     * genuine exception (a module fetched by a name this scan cannot see) can be recorded WITH
     * ITS REASON rather than silently exempted, which is how §2's `ORPHAN_OK` works. */
  };
  const unloaded = js.filter(f => !loaded.has(f.replace(/^.*\//, '')) && !DEAD_OK[f]);
  t('every shipped browser module is loaded by some page — a module nothing reaches is a '
    + 'plausible, well-commented, WRONG place to fix a bug',
    unloaded.length === 0, unloaded.length ? unloaded.join(', ') : js.length + ' modules, all reached');
  /* ⛔ AND THE SAME TRAP HAS NOW COST SIX ROUNDS, so it gets an assertion that NAMES it. A BACKTICK
   * inside a comment inside a shader template literal ENDS THE STRING. §0 above does catch it —
   * the file stops parsing — but it reports `SyntaxError: Unexpected identifier 'smoothstep'`,
   * which sends you looking at GLSL rather than at a quote mark thirty lines up. The failure
   * message is the whole value here: a check that fires for the right reason and explains the
   * wrong one is only half a check. */
  {
    const bt = [];
    for (const [f, src] of TEXT) {
      if (!f.endsWith('.js') || f.startsWith('vendor/') || f.startsWith('api/')) continue;
      // every ES template literal whose body looks like GLSL
      for (const m of src.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
        if (!/#version|precision |void main|gl_Position|uniform /.test(m[1])) continue;
        // a shader body cannot contain a backtick — if one did, this regex would have stopped early
        const after = src.slice(m.index + m[0].length, m.index + m[0].length + 40);
        if (/^\s*[A-Za-z_]/.test(after) && !/^\s*(;|\)|,|\.)/.test(after)) bt.push(f);
      }
    }
    t('no shader literal is cut short by a backtick in a comment', bt.length === 0,
      bt.length ? 'CHECK THE COMMENTS IN: ' + [...new Set(bt)].join(', ') : 'shader literals close cleanly');
  }
}

head('1 · every cabinet is reachable from the arcade');
const arcade = R('arcade.html');
/* ⚠ `ronin.html` WAS THIS LIST'S SIXTH ENTRY AND IS NOW `city.html`. NEON RONIN was retired on
 * 2026-08-03 (artist: "neon ronin honestly sucks as a game") and THE CITY took its cabinet. The
 * entry is REPLACED, not deleted — a guard that is dropped when the thing it guards is replaced
 * simply stops guarding, and the new game is exactly as capable of shipping unreachable as the old
 * one was. `ronin.html` is deliberately NOT asserted any more: it is history, it still resolves for
 * anyone holding the URL, and nothing is required to link it. */
/* ⛔ SIX → FOUR → SIX. They left the grid on 2026-08-03 ("compress our games to 4 games total")
 * and came back on 2026-08-05 ("lets restore dogfight and section 9 task force as games").
 * ⚑ THE COUNT WAS NEVER THE INVARIANT — the note left here when they went said so in as many
 *   words: A CABINET IS NOT REMOVED UNTIL ITS REPLACEMENT WORKS, and "when the modes ship, these
 *   two assertions are what should fail." The modes did not ship. THE CITY carries SECTION 9's
 *   COMBAT but not its GAME (no match clock, arena picker, loadout, card powers or powerups) and
 *   JET COMBAT WAS NEVER BUILT — no bolts, no lock, no bots. So the honest assertion is not "how
 *   many tiles are there" but "is every game a visitor can play on the shelf where they look for
 *   games", which is this file's own subject: reachable-from-somewhere is not
 *   findable-from-where-you-are. A fixed count asserted the inventory NUMBER and would have had
 *   to be edited either way — it could never have caught the thing that was actually wrong. */
const CABINETS = ['city.html', 'riprocketer.html', 'cloudracer.html', 'cards/battle.html',
                  'dogfight.html', 'section9.html'];
/* ⚠ STILL ASSERTED FROM THE CITY TOO, and that is not a duplicate. The mode bar is the SEAM — the
 * city is where these two share a world — and the route existed there the whole time they were off
 * the shelf. Deleting it now to tidy a number is the same mistake with the sign flipped. */
const FOLDING = ['dogfight.html', 'section9.html'];
for (const c of CABINETS) {
  t(`arcade.html links ${c}`, new RegExp('href="' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(arcade));
}
/* studio.html's deep link. An anchor that does not exist does not error — it silently lands on
 * the top of the page, which is exactly why nobody noticed. */
t('the #ronin anchor studio.html deep-links to exists', /id="ronin"/.test(arcade));
{
  const city = R('city.html');
  for (const f of FOLDING) {
    t(`${f} is still reachable from THE CITY while its mode is unfinished`,
      new RegExp('href="' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(city));
  }
  /* ⚑ EVERY TILE IS A REAL GAME AND EVERY REAL GAME HAS A TILE — a set comparison, not a count.
   * A number would pass a grid containing six tiles pointing at the wrong six pages, and would
   * fail for the honest reason of the roster changing. This bites on both sides: a cabinet added
   * for a page that is not in CABINETS fails, and a game dropped off the shelf fails. */
  const tiles = [...arcade.matchAll(/<a class="cab"[^>]*href="([^"]+)"/g)].map(m => m[1]).sort();
  const want = CABINETS.slice().sort();
  t('the arcade shelf is exactly the roster',
    JSON.stringify(tiles) === JSON.stringify(want),
    tiles.length + ' tiles: ' + tiles.join(' · '));
}

/* ═══ 1b · A GAME IS NOT REACHABLE IF YOU CANNOT PLAY IT ══════════════════════════════════════
 * ⛔ ARTIST, 2026-08-03: "still can't fly bird on mobile." THE CITY had NO touch input at all —
 *   every control was a `keydown`, so on a phone the world loaded, streamed, rendered and did
 *   nothing. That is this file's own subject one level deeper than it had been looking: the page
 *   was reachable, the GAME was not, on the device most people open it on. Nothing errored.
 * ⚑ So reachability now includes the input path. These assertions fail on the build that shipped
 *   before them, which is the standing rule for every assertion in this file. */
head('1b · the city can actually be played by a thumb');
{
  const app = R('js/city-app.js'), page = R('city.html');
  t('city-app registers pointer handlers, not only keys', /addEventListener\('pointerdown'/.test(app));
  t('…and reads a drag as steering', /pointermove/.test(app) && /touch\.dx/.test(app));
  t('…and a tap as a wingbeat', /tapFlap/.test(app));
  t('touch controls are injected on a coarse pointer', /pointer: coarse/.test(app) && /touchUI/.test(app));
  /* ⚠ TAB does not exist on a phone, so without an on-screen swap the jet is unreachable there —
   * the same defect one level down, which is how it would have been missed. */
  t('the mode swap has an on-screen control, not only TAB', /tMode/.test(app) && /tMode/.test(page));
  t('one input reader serves both devices', /function readInput\(/.test(app));
  /* ⛔ THREE MODES (artist, 2026-08-03) — and each one has to be REACHABLE, which is a different
   * claim from "the code for it exists". A mode you cannot select is a game you cannot play, and
   * that is the exact defect this whole file was written for. The animal picker is its own axis:
   * folding "which game" and "which animal" into one cycle would bury a four-animal roster three
   * presses deep, and a control nobody can find is a control nobody has. */
  for (const m of ['animal', 'jet', 'operative'])
    t(`mode "${m}" is in the cycle`, new RegExp("'" + m + "'").test(app));
  t('TAB cycles the modes rather than toggling two', /cycleMode\(/.test(app));
  /* ⛔ AND THE WAY IN IS VISIBLE — artist, 2026-08-04: "we need to make the controls more clear to
   * toggle between players." A keyboard hint in 11px grey is not a control anyone finds; three
   * named chips are. Each mode must have one, they must be wired to `setMode`, and exactly one
   * must be lit from the SAME `syncHud` everything else uses — a selector showing a state it does
   * not set is worse than the hint it replaced. */
  for (const m of ['animal', 'jet', 'operative'])
    t(`the mode bar carries a chip for "${m}"`, new RegExp('class="mchip" data-mode="' + m + '"').test(page));
  t('…the chips call setMode', /querySelectorAll\('\.mchip'\)[\s\S]{0,120}setMode\(el\.dataset\.mode\)/.test(app));
  t('…and syncHud lights exactly the live one', /mchip[\s\S]{0,140}dataset\.on = el\.dataset\.mode === MODE/.test(app));
  t('…and there is an on-screen cycle for a phone', /tMode.*cycleMode|cycleMode\(1\)/s.test(app));
  t('the squirrel is selectable, on both a keyboard and a thumb',
    /setCreature\(/.test(app) && /tCreature/.test(app) && /tCreature/.test(page));
  /* ⛔ THE DROPS ARE THE FIRST TIME THE ANIMAL LAYERS TOUCH EACH OTHER (artist, 2026-08-03:
   * "have the birds poop out and place power ups and squirrels and carry power ups and steal
   * them"). Until this, "the animals are LAYERS not skins" was a claim about what each one could
   * SEE. A bird that plants and a squirrel that takes makes it a claim about what each can DO to
   * the other — and a mechanic with no control bound to it is the same as one that does not
   * exist, which is what this file is for. */
  {
    const dr = R('js/city-drops.js');
    t('city.html loads the drops module', /js\/city-drops\.js/.test(page));
    t('the bird can drop, on a key AND on a thumb',
      /doAction\(/.test(app) && /'f'/.test(app) && /tAct/.test(app) && /tAct/.test(page));
    t('a drop FALLS rather than being placed', /GRAV/.test(dr) && /d\.vy -= GRAV/.test(dr));
    t('the squirrel carries, and only one', /carried = d/.test(dr) && /if \(!carried\)/.test(dr));
    t('there is somebody to steal FROM', /addRival|rivals\.push/.test(dr));
    t('…and stealing is its own act with its own reach', /STEAL_R/.test(dr) && /log\.stolen\+\+/.test(dr));
  }
  t('the animals are observers and the other two are not',
    /animal:\s*\{[^}]*mortal:\s*false/.test(app) && /operative:\s*\{[^}]*mortal:\s*true/.test(app));

  /* ⛔ CARS — artist, 2026-08-04: "lets make some land vehicles we can hop in and drive." */
  {
    const rd = R('js/city-rides.js');
    t('city.html loads the rides module', /js\/city-rides\.js/.test(page));
    t('one key gets you in AND out', /rides\.driving[\s\S]{0,120}rides\.exit\(/.test(app) &&
      /rides\.enter\(/.test(app));
    t('…and there is a prompt that only shows when a car is in reach',
      /id="ride"/.test(page) && /function syncRideHud/.test(app));
    /* ⛔ THE ONE PROPERTY THAT SEPARATES A CAR FROM A CHARACTER CONTROLLER: steering needs road
     * speed, so a parked car cannot pivot. Driven: spunWhileParked 0.000 rad over 2 s of full
     * lock at rest. */
    t('steering is a rate that needs speed', /steerRef/.test(rd) && /auth = Math\.min\(sp \/ CAR\.steerRef/.test(rd));
    t('grip is finite, so it can slide', /driftGrip/.test(rd) && /hand \? CAR\.driftGrip : CAR\.grip/.test(rd));
    t('a car does not park on the river', /inRiver/.test(rd));
    /* ⛔ AND THE OBSERVER RULE SURVIVES A CAR DOOR. Driving is not a fourth MODE — it replaces the
     * body's step, not its mode — so an animal at the wheel is still an animal. Driven: a squirrel
     * drove and stayed absent from every target list. */
    t('driving replaces the step, not the mode', /rides\.driving\) \{ stepDrive/.test(app));
    t('…and the bird and the jet are refused rather than half-supported',
      /function canDrive/.test(rd) && /mode !== 'jet' && player\.mode !== 'bird'/.test(rd));
    t('the weapon goes away at the wheel', /!player\.driving/.test(R('js/city-ops.js')));
  }

  /* ⛔ SECTION 9'S CONTROLS, NOT A SUBSET — artist, 2026-08-04: "port over the guns and controls
   * from other game." The weapon TABLE was already asserted identical; the SCHEME was not, and it
   * was missing the two bindings that change how the weapon behaves rather than how it looks:
   * RMB aim and CTRL crouch. section9.html's own legend is the reference. */
  {
    const ops = R('js/city-ops.js');
    t('right mouse aims, and the context menu is suppressed',
      /e\.button === 2/.test(app) && /contextmenu/.test(app));
    t('…on a thumb too', /tAds/.test(app) && /tAds/.test(page));
    /* ⛔ AIMING TIGHTENS THE CONE. Without this the button is a zoom lens, not a weapon state —
     * one value drives the pose, the fov and the accuracy so they cannot disagree. Driven: COLD
     * CALL pulls fov 62 -> 23, which is 62/2.7 to the decimal, and returns on release. */
    t('aiming tightens the cone as well as the view', /tight = w\.key === 'shotgun' \? 1/.test(ops));
    t('…and the zoom comes from the WEAPON', /Math\.max\(1, w\.zoom\)/.test(ops));
    t('…and collapses when you cannot aim', /const canAds = armed && me\.alive && !me\.reloading/.test(ops));
    /* CTRL crouch: a real state — lower eye, slower walk — not a camera offset. Driven: eye drops
     * 0.55 m and creeping covers 5.4 m where walking covers 12.2. */
    t('CTRL crouches', /crouch: !!keys\['control'\]/.test(app) && /me\.crouchT/.test(app));
    t('…and it actually slows you down', /crouch \? \(B\.run \|\| 6\) \* 0\.45/.test(app));
    t('the legend names the ported bindings',
      /RMB<\/span> aim/.test(page) && /CTRL<\/span> crouch/.test(page));
  }

  /* ⛔ EVERY KEY THE STEP FUNCTIONS READ OFF `MODES` MUST EXIST IN IT — DOGFIGHT RENDERED AN EMPTY
   * SKY FOR TWO COMMITS BECAUSE TWO DID NOT. `e19fa30` defined `camBack`/`camUp` on the jet entry;
   * `c17d1f7` rewrote the table into the mortal/targetable/armed one and dropped them, while
   * `stepJet` went on reading `M.camBack`. `x - hx * undefined` is NaN, NaN reaches
   * `cam.setPosition`, and a camera at NaN draws NOTHING — the frame is the clear colour with the
   * whole city still behind it.
   * ⚑ IT SURVIVED BECAUSE THE PHYSICS WAS FINE. Every driven measurement of the jet (cruise
   *   168 m/s, 360° in 8.9 s, the world-edge excursions) reads `__city.s`, which never looked at
   *   the camera — so the numbers all passed while the game showed nothing. This check is static
   *   and cheap: pull the property names out of the reads and require each to be a key. */
  /* ⛔ AND IT IS CHECKED PER ENTRY, NOT ACROSS THE WHOLE TABLE. The first version of this guard
   * collected every key name anywhere in `MODES` and asked whether the read appeared among them —
   * so with `camBack` present on the ANIMAL entry it passed while the JET entry was missing it,
   * i.e. it passed on the exact build it was written to catch. Proved by reverting the fix and
   * watching it stay green. `stepJet` binds `const M = MODES.jet`, so the JET entry is the one
   * that has to carry them. */
  {
    const table = (app.match(/const MODES = \{[\s\S]*?\n  \};/) || [''])[0];
    const bound = [...app.matchAll(/const M = MODES\.(\w+)/g)].map(m => m[1]);
    const reads = new Set([...app.matchAll(/\bM\.(\w+)/g)].map(m => m[1]));
    t('the MODES table was found', table.length > 100, table.length + ' chars');
    t('something binds an entry and reads it', bound.length > 0 && reads.size > 0,
      bound.join(', ') + ' → ' + [...reads].join(', '));
    for (const name of new Set(bound)) {
      const entry = (table.match(new RegExp(name + ':\\s*\\{[\\s\\S]*?\\},')) || [''])[0];
      t(`the "${name}" entry was found in MODES`, entry.length > 20);
      for (const r of reads)
        t(`MODES.${name} defines "${r}", which stepJet reads off it`,
          new RegExp('\\b' + r + '\\s*:').test(entry));
    }
    /* and the camera must never be rescued from a non-finite position — the runtime counterpart,
     * asserted by the driven probe via `__city.s.camBad`. */
    t('a non-finite camera is caught rather than drawn',
      /isFinite\(camPos\.x\)/.test(app) && /camBad\+\+/.test(app) && /camBad,/.test(app));
  }

  /* ⛔ SECTION 9 ON THE GROUND (artist, 2026-08-03: "you should be able to play as Section 9 on
   * the ground in the city as well"). Before this the operative mode was TRAVERSAL — you could
   * walk, look and jump, and there was nothing to shoot and nothing shooting back. That state is
   * precisely how "built ≠ reachable" turns into "built ≠ true": the mode existed, was selectable,
   * and was not the game it was named after. These assertions fail against that build. */
  {
    const ops = R('js/city-ops.js');
    t('city.html loads the combat module', /js\/city-ops\.js/.test(page));
    t('…and the bodies Section 9 already has',
      /js\/section9-skin\.js/.test(page) && /js\/s9pc-skin\.js/.test(page));
    t('the operative has a trigger, on a mouse AND on a thumb',
      /mousedown/.test(app) && /tFire/.test(app) && /tFire/.test(page));
    t('…and a reticle and a health readout that only exist while armed',
      /id="reticle"/.test(page) && /id="combat"/.test(page) &&
      /reticle.*isOp\(\)|isOp\(\).*reticle/s.test(app));
    /* ⚠ ANCHORED ON THE MEANING, NOT ON THE NEXT LINE. The first version matched `stepOps(dt);`
     * followed within 80 characters by `if (IN.act)`, and adding the drive branch between them
     * broke it while the property it checks was still perfectly true. What actually matters is
     * that `stepOps` runs ABOVE every early return in `step()` — otherwise a bot freezes
     * mid-reload the moment you become a bird or get into a car. */
    {
      const body = (app.match(/function step\(dt\) \{[\s\S]*?\n  \}/) || [''])[0];
      /* ⚠ …against the MODE BRANCHES, not against any `return`. The first attempt compared with
       * the first `return;` in the function, which is the `if (!ready)` guard on line one — so it
       * failed on a build where the property was true. Twice now in this file: an assertion is
       * only as good as the thing it actually points at. */
      const atOps = body.indexOf('stepOps(dt)');
      const atJet = body.indexOf('if (isJet())');
      t('the firefight advances in EVERY mode, above the per-mode early returns',
        atOps >= 0 && atJet >= 0 && atOps < atJet, 'stepOps@' + atOps + ' modeBranches@' + atJet);
    }
    t('bots exist, take cover, and are drawn as real bodies',
      /S9PCSkin\.spawn/.test(ops) && /pickCover/.test(ops) && /spawnBox/.test(ops));
    t('a shot is a ray against the same boxes the city is built from',
      /collide\.rayHit/.test(ops) && /rayHit\(/.test(app));
    t('a dead operative drops a card into the binder', /onKill/.test(ops) && /drops\.drop/.test(app));

    /* ⛔ THE OBSERVER RULE, AS A STRUCTURE RATHER THAN A PROMISE. There must be exactly ONE place
     * a target list is built, it must read `targetable`, and bot acquisition must go through it —
     * `hostilesFor` may only NARROW that list. Driven end-to-end this holds (a squirrel sat on an
     * operative's boots for fifteen seconds and drew zero rounds); this is what stops a later edit
     * from quietly adding a second path. */
    t('there is one target list and it reads `targetable`',
      /function candidates\(player\)/.test(ops) && /player\.targetable/.test(ops));
    t('…and bot acquisition narrows it rather than rebuilding it',
      /function hostilesFor\([^)]*\)\s*\{\s*const all = candidates\(/.test(ops));
    t('…and it is exposed so a driver can assert it', /targets\(player\)/.test(ops) && /_targets\(/.test(app));

    /* ⛔ THE NUMBERS MUST NOT DRIFT FROM SECTION 9's. They were tuned together — 150 HP / 60
     * armour with AK 17 / pistol 22 / buckshot 9 / rifle 88 is a ~1.3 s TTK, and at the old
     * 0.63 s neither cover nor suppression nor disengaging can exist. Importing `S9Game.WEAPONS`
     * at runtime would cost 104 KB of maps, HUD and match clock to read one array, so the
     * coupling is asserted here instead — the same arrangement that keeps `build-hero-type.mjs`'s
     * Python RUNS and the CSS type scale moving together. */
    const s9 = R('js/s9pc-game.js');
    const table = src => {
      const out = {};
      const re = /\{ name: '([^']+)', key: '([^']+)', dmg: ([\d.]+), spread: ([\d.]+), rate: (\d+), mag: (\d+), reload: (\d+)/g;
      let m; while ((m = re.exec(src))) out[m[2]] = m.slice(1).join('|');
      return out;
    };
    const A = table(s9), B = table(ops);
    const keys = Object.keys(A);
    t('Section 9 still declares four weapons', keys.length === 4, keys.length + ' found');
    for (const k of keys)
      t(`weapon "${k}" is identical in the city and in the arena`, A[k] === B[k],
        'arena ' + A[k] + '  ·  city ' + B[k]);
    for (const [what, re] of [['150 HP', /hp:\s*150/], ['60 armour', /armor:\s*60/],
                              ['a x2.1 headshot', /headMul:\s*2\.1/],
                              ['armour soaking 15% of a headshot', /headSoak:\s*0\.15/],
                              ['…and 45% of a body hit', /bodySoak:\s*0\.45/],
                              ['regen to 62% after 4.5 s', /regenAfter:\s*4\.5/],
                              ['tracers travelling at 340 m/s', /tracerSpeed:\s*340/]])
      t('the city keeps ' + what, re.test(ops));

    /* ⚠ And the operative's CAPSULE has to be one number too, or a bullet misses a body you could
     * not have walked through. `city-app` falls back to a literal when the module is absent. */
    /* ⚠ Checked per NUMBER, not as one string. city-ops declares the capsule once in `TUNE` and
     * re-uses it in `BODY`; city-app's fallback is a flat literal. A regex written against one
     * file's LAYOUT passes there and fails on the other for a reason that has nothing to do with
     * the numbers agreeing — which is what it did on the first run. */
    for (const [what, re] of [['radius 0.42', /r:\s*0\.42/], ['height 1.72', /h:\s*1\.72/],
                              ['step 0.62', /step:\s*0\.62/], ['eye 1.58', /eye:\s*1\.58/]])
      t(`the operative capsule keeps ${what} in both files`, re.test(ops) && re.test(app));
    t('…and city-app prefers the module over its own fallback',
      /const OP = \(window\.CityOps && CityOps\.BODY\)/.test(app));
    /* ⛔ ONE COLLISION RESOLVE. A bot that sinks through a kerb the player steps over is the
     * "two copies drift" bug with an audience — `stepGround`'s own comment says so. */
    t('bots and the player share one collision resolve',
      /function moveBody\(b, dt, B, climbing\)/.test(app) && /moveBody\(b, dt, BODY, false\)/.test(ops));
  }
  /* The touch button styling has to exist in the PAGE or the controls render as bare buttons. */
  t('city.html styles the touch controls', /#touchUI/.test(page));
  t('…and hides the keyboard legend where there is no keyboard',
    /#hudBL \.key, #hudBL \.kw\{ display:none/.test(page));
}

// ═══ 2 · NO SHIPPED PAGE IS AN ORPHAN ══════════════════════════════════════════════════════════
/* A page nothing navigates to is a page no visitor sees. Three are orphans BY DESIGN and are
 * listed with their reason — an allow-list rather than a blanket exemption, so a NEW orphan
 * still fails. See docs/REACHABILITY.md for why each of these three is deliberate. */
head('2 · no shipped page is an orphan (deliberate ones are allow-listed with a reason)');
const ORPHAN_OK = {
  /* ⚑ STEALTH BETA, and unlinked ON PURPOSE rather than by oversight. It is a playable game whose
   *   whole deck is live measurement, shipped to be pressure-tested by people handed the URL
   *   before it goes near the funnel. It carries `noindex`, it is absent from the sitemap, and it
   *   asks for no wallet and holds no stake — so an early visitor can lose nothing but time.
   * ⛔ IT GETS LINKED OR IT GETS DELETED. A "beta" with no stated end is just an orphan wearing a
   *   badge; when the artist says it is ready it joins arcade.html, and if he says it is not, it
   *   goes. Written down because that is this file's own distinction between a decision and drift. */
  /* ⚑ THE READING, unlinked pending ONE artist decision — whether it belongs in the funnel at
   *   all. It is wallet-free, read-only and holds no stake, so an early visitor can lose nothing
   *   but time; and it is not a game, so it does not belong on arcade.html by default.
   * ⛔ IT GETS LINKED OR IT GETS DELETED — and toll.html, which used to be the example held
   * here, is the case that proves those are the real terms: it was deleted (artist, 2026-08-09). An
   *   exception with no stated end is just an orphan wearing a badge. See docs/SUBSTRATE-3030.md
   *   §"Open, and the artist's" item 4. */
  'substrate.html': 'THE READING — unlinked until the artist decides whether it enters the funnel',
  /* ⚑ THE PRODUCT PAGE for the drain screen. Its reader is an exchange, a wallet or a compliance
   *   desk — not a collector — so it does not belong in the studio's play/cards/pack funnel, and
   *   putting it there would dilute the three doors that pass fought to establish.
   * ⛔ SAME TERMS AS substrate.html: it gets linked from wherever it is actually
   *   sold from, or it gets deleted. A product page nobody can reach sells nothing, so this
   *   exemption is a decision with an end, not a place to leave it. */
  /* ⛔ ONE PRODUCT NOW. `3030.html` is the whole thing — the lookup, the hourly feed and the
   *   ledger — and it is what 3030.ripmaster3030studios.com serves. Its reader is a person with a
   *   transaction in front of them or a desk with a duty of care, not a collector, so it stays out
   *   of the play/cards/pack funnel that pass fought to keep to three doors.
   * ⚠ drain.html is a 302 to it in vercel.json rather than a deletion: that link was already
   *   shared, and a URL that resolved once should keep resolving. */
  '3030.html': 'THE PRODUCT — lookup + feed + ledger; served at 3030.ripmaster3030studios.com',
  'drain.html': 'SUPERSEDED by 3030.html — kept as a redirect because the link was shared',
  /* ⚑ THE COMPOSING FRAME. It composes a plate and deliberately cannot press one — the contract
   *   does not exist, because the decision it turns on (page or chart?) is not settleable on a
   *   screen. Linking it now would put a door on a room with no floor.
   * ⛔ SAME TERMS: it gets linked when there is something to press, or it goes with the idea. */
  'superrare.html': 'the token animation_url target — reached from the chain, not from the site',
  'cabinet.html': 'the sandbox-safe embed fallback, reached from superrare.html only',
  'deploy-render.html': 'an operator tool — unlinked AND .vercelignore\u0027d after the deploys landed',
  /* ⚑ Same class as deploy-render.html: an operator tool the artist opens by URL on launch night.
   *   Deliberately NOT linked from the site — it sends a contract deployment from the studio's own
   *   wallet, and a button for that sitting in public navigation is an invitation to a collector
   *   to press something that will only ever fail for them. Allow-listed WITH THE REASON, which is
   *   this file's own distinction between a decision and an oversight. */
  'deploy-sink.html': 'an operator tool — unlinked AND .vercelignore\u0027d after the deploys landed',
  'deploy-lens.html': 'an operator tool — unlinked AND .vercelignore\u0027d after the deploys landed',
  /* ⚠ THE ONE OPERATOR TOOL THAT IS CURRENTLY SHIPPING, and it ships on purpose: the artist
   *   drives it from the DEPLOYED site, because that is where /api/pin and its PINATA_JWT live.
   *   .vercelignore'ing it would take the button away from the only person who can press it.
   * ⚑ Unlike the other three it carries no bytecode — `setCards` is `onlyOwner`, so a stranger
   *   pressing Publish gets a revert and nothing else. The counterfeit-lens exposure that put
   *   deploy-lens.html behind .vercelignore has no analogue here.
   * ⛔ IT JOINS THEM IN .vercelignore THE MOMENT THE 33 ARE PUBLISHED. Written down because a
   *   temporary exception with no stated end is just an exception. */
  'deploy-cards.html': 'an operator tool — unlinked; ships only until setCards lands, then .vercelignore\u0027d',
  /* ⚠ Ships alongside deploy-cards.html and for the same reason — the artist drives it from the
   *   live site — and leaves the same way once the 33 are minted. It sends no bytecode and grants
   *   nothing: claimHero verifies an EIP-712 signature from claimSigner, so a stranger opening
   *   this page can produce vouchers only the contract will reject. */
  'mint-heroes.html': 'an operator tool — unlinked; ships until the heroes are minted, then .vercelignore\u0027d',
  /* ⚠ Ships until the two wiring transactions land, same as the other operator consoles, and
   *   leaves the same way. It sends no bytecode and grants nothing: both calls are onlyOwner and
   *   both were verified to revert for a stranger before this shipped. */
  'wire-lens.html': 'an operator tool — unlinked; ships until the lens is registered, then .vercelignore\u0027d',
  'cards/deck3d.html': 'a redirect kept alive because that URL was already shared',
  /* ⚠ RETIRED, NOT DELETED. NEON RONIN lost its cabinet to THE CITY on 2026-08-03 (artist's call).
   * The page and its 13 fighters are left on disk and still resolve, because a URL that has been
   * shared should keep working — but nothing is required to link it any more, so the orphan sweep
   * would otherwise fail forever on a page that is orphaned ON PURPOSE. Listing it here with the
   * reason is the difference between a decision and an oversight; that distinction is the entire
   * value of this allowlist. */
  'ronin.html': 'RETIRED — replaced in the arcade by city.html (THE CITY). Kept so the URL resolves.',
  /* ⚠ UNLINKED ON THE ARTIST'S CALL, 2026-08-06 — index.html carries the roadmap section where
   * the link used to be. The page is untouched and still says "proposal · not final art" on its
   * own face; only the door from the home page is gone. Recorded here because the difference
   * between a decision and an oversight is the entire value of this allowlist. */
  'studio3d.html': 'THE UNCUT SHEET — a proposal the artist unlinked from the home page.',
  /* ⛔ THE FORGE — artist, 2026-08-06: *"no one should have access to the plate proof console
   * except me."* It is the plate-proof editor the hundred are authored on, and it is in
   * `.vercelignore`, so it is not served at all. Listed here so the orphan sweep stops asking
   * for a door, and §6b asserts the STRONGER thing: that nothing links it and that it stays out
   * of the deploy. A reason, not an oversight — which is this allowlist's entire value. */
  'cards/proof.html': 'THE FORGE — the artist\'s console. Unlinked AND undeployed, on his call.',
  /* ⚠ REACHED FROM OUTSIDE THE SITE, WHICH NO WALK FROM index.html CAN SEE. Cards 34–100 put
   * `cards/field.html?n=NN` in their `animation_url`, so a collector arrives here from a
   * marketplace media slot — it MUST keep resolving, and it is not a page the site navigates to.
   * The folder advertised it until 2026-08-06, when the artist took all three studio strips off
   * that header; the hundred are browsable at cards/deck.html instead. */
  'cards/field.html': 'THE FIELD — a token animation_url target, not a browsable page. Must resolve.',
  'cards/lens3d.html': 'THE LENS — the other animation_url target, same reason as field.html.',
  'cards/_template.html': 'the card generator template, not a page',
  'cards/_full.html': 'a generator template, not a page',
  'cards/_back-preview.html': 'a generator template, not a page',
  'cards/hero/_template.html': 'the hero-lens authoring template, not a page',
  'studio.html': 'DRAFT SHELL — an unreleased replacement home page (docs/REACHABILITY.md R2). ' +
                 'Deliberately dark, but it is the ONLY page that links cards/lens3d.html, ' +
                 'which is why the layered cards are unreachable. Do not promote without a decision.',
};
/* The 196 placeholder card pages are asserted as ONE group, not 196 lines: they are reached the
 * same way, from the same index, and a per-page roll-call would drown every other finding here.
 * ⚠ The deck is being clean-slated (task #71) — this checks the ROUTE, not the contents. */
/* ⚠ "A card page" is DEFINED BY cards/manifest.json, not by living in cards/ with a lowercase
 *   name — binder / battle / market / lens3d / deck3d all match that shape and are not cards.
 *   Deriving the list from the manifest is the same rule the deck index itself uses. */
const DECK = (() => { const m = JSON.parse(R('cards/manifest.json')); return m.cards || m; })();
const CARD_PAGES = DECK.map(c => 'cards/' + c.slug + '.html').filter(f => TEXT.has(f));
const cardOrphans = CARD_PAGES.filter(f => navigatorsOf(f).length === 0);
t(`all ${CARD_PAGES.length} card pages are reachable from the deck index`, cardOrphans.length === 0,
  cardOrphans.slice(0, 4).join(', ') || 'via cards/index.html data-href');

for (const [f] of TEXT) {
  if (!f.endsWith('.html')) continue;
  if (f === 'index.html') continue;      // the domain itself is the only real root
  /* ⛔ THE HERO LENSES ARE REACHED FROM THE CHAIN, NOT FROM THE SITE — same class as
   *   superrare.html, which is allow-listed for exactly this reason. Each token's on-chain
   *   `animation_url` is https://www.…/cards/hero/<id>.html, so the inbound link lives in
   *   contract storage where no crawler of ours can see it. Requiring a site link would push
   *   toward adding a decorative one to satisfy a test, which is worse than the exemption.
   * ⚠ NOT a blanket pass for the directory: only the 33 numbered lens pages are exempt, so a
   *   stray file dropped in cards/hero/ is still an orphan and still fails.
   * ⚑ They are NOT unreachable in practice — /cards/<1–33> redirects here, which is what makes
   *   `external_url` resolve too. That routing is asserted in test:name, not by pretending a
   *   link exists. */
  if (/^cards\/hero\/([1-9]|[12][0-9]|3[0-3])\.html$/.test(f)) continue;
  if (ORPHAN_OK[f] || CARD_PAGES.includes(f)) continue;
  const nav = navigatorsOf(f);
  t(`${f} is navigated to by something`, nav.length > 0, nav.slice(0, 3).join(', ') || 'NO INBOUND LINK');
}

// ═══ 3 · THE QUALITY TIER IS NOT THE PIXEL RATIO ═══════════════════════════════════════════════
/* ⛔ `GfxPost.dprCap()` ends in `Math.max(1, Math.min(dpr, cap))`, so on ANY 1× display it is
 *   exactly 1 however strong the machine is. `DPRCAP >= 1.5 ? 'mid' : 'low'` therefore selected
 *   `low` on every ordinary desktop monitor, and `mid`/`high` were unreachable without `?q=`.
 *   Driven proof of the old state, emulated 1×/8-core/8 GB desktop: that formula → 'low',
 *   `GfxPost.deviceTier()` → 'high'. Two rungs apart.
 *   scripts/test-s9cast.mjs caught this for js/s9pc-app.js in July; the other three apps kept it. */
head('3 · the auto quality tier comes from the device, not from devicePixelRatio');
t('GfxPost.deviceTier() exists and does not read devicePixelRatio', (() => {
  const g = R('js/gfx-post.js');
  const fn = /function deviceTier\(\)[\s\S]*?\n  \}/.exec(g);
  return !!fn && !/devicePixelRatio/.test(fn[0]);
})());
for (const f of ['js/s9pc-app.js', 'js/crpc-app.js', 'js/rrpc-app.js', 'js/dfpc-app.js']) {
  const s = R(f);
  /* Comments are stripped first: the fix in each file QUOTES the broken line in its own note so
   * the record stays next to the repair, and a checker that fires on the description of a bug is
   * a checker that gets muted (CLAUDE.md, the name-law stripper). */
  const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  t(`${f} derives its tier from deviceTier(), not dprCap()`,
    /AUTO(_TIER)?\s*=\s*\(window\.GfxPost && GfxPost\.deviceTier\)/.test(code) &&
    !/AUTO(_TIER)?\s*=\s*DPRCAP\s*>=/.test(code));
  t(`${f} still uses dprCap() for the BACKING STORE (the thing it is right for)`,
    /DPRCAP/.test(code) && /devicePixelRatio[^;]*DPRCAP|DPRCAP[^;]*devicePixelRatio/.test(code));
}
/* The tier a headless check reads back. Without this the assertion above is about source text
 * only, and the live value is what a player gets. */
for (const [f, hook] of [['js/rrpc-app.js', '__rrpc'], ['js/crpc-app.js', '__crpc']]) {
  t(`${f} exposes its live TIER on window.${hook}`, new RegExp('window\\.' + hook + '\\s*=\\s*\\{[\\s\\S]{0,600}\\bTIER\\b').test(R(f)));
}

// ═══ 4 · A DOOR NEEDS ITS INPUT ════════════════════════════════════════════════════════════════
/* ⛔ `section9.html` — the build the arcade links — loaded js/session.js WITHOUT js/eth-play.js.
 *   `checkVisitor()` opens on `window.RipEth`, so DOOR C could never open there, while
 *   section9-classic.html loaded both. Driven proof of the old state: `!!window.RipEth` was
 *   false on section9.html and true on section9-classic.html. One of the three doors in
 *   docs/SEATS.md, dark by omission rather than by decision. */
/* ═══ 3d · A REMOVED FEATURE MUST NOT LEAVE ITS VARIABLE BEHIND ══════════════════════════════
 * ⛔ THE MUSIC PASS DELETED THE CABINETS' SOUNDTRACKS AND LEFT FIVE CALLS ON THE BINDING IT HAD
 *   JUST REMOVED, and two of them were fatal on the busiest line in the game:
 *     dogfight.html   endMatch()   → `music.pause()` threw before the ranking, the payout, the
 *                                    card winnings and the whole result overlay. EVERY MATCH.
 *     s9pc-ui.js      result()     → the same, in SECTION 9.
 *     s9pc-app.js     togglePause()→ `ui.music` is undefined, so pausing threw.
 *     s9pc-ui.js      btnAbort     → threw past RipNet and onAbort.
 *     rrpc-app.js                  → inside a try/catch, so merely dead.
 * ⚑ NOTHING COULD SEE IT. §0 compiles every script with `new Function`, which does not EXECUTE —
 *   a ReferenceError on a line that only runs at the final whistle is invisible to every static
 *   check here, and the games look perfect until the clock hits zero. It was found by a title
 *   test driving the real `endMatch()`, i.e. by running the line.
 * ⚑ THE RULE IS NARROW ON PURPOSE: site music belongs to `theme.js` and persists across pages by
 *   design, so NO cabinet has any business holding a music handle. That makes "zero references"
 *   the correct assertion rather than a heuristic about undefined variables. */
head('3d · the deleted per-game soundtracks left no callers');
{
  const SURFACES = ['dogfight.html', 'section9.html', 'riprocketer.html', 'cloudracer.html',
    'city.html', 'js/s9pc-ui.js', 'js/s9pc-app.js', 'js/rrpc-app.js', 'js/crpc-ui.js',
    'js/crpc-app.js', 'js/dfpc-app.js', 'js/city-app.js'];
  const bad = [];
  for (const f of SURFACES) {
    /* Comments stripped, same reason as everywhere else here: this file's own note QUOTES the
     * five broken calls, and a checker that fires on the description of the bug gets muted. */
    const code = (R(f) || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const m = code.match(/\b(?:ui\.)?(?:music|dfMusic|rrMusic|s9Music|tgMusic)\s*\.\s*(?:play|pause|load)\s*\(/g);
    if (m) bad.push(f + ' ×' + m.length);
  }
  t('no cabinet calls a per-game music handle — theme.js owns the sound and games must not pause it',
    bad.length === 0, bad.join(', ') || (SURFACES.length + ' surfaces clean'));
}

head('4 · every seat door has the module it reads');
t('js/session.js checkVisitor reads window.RipEth', /const R = window\.RipEth/.test(R('js/session.js')));
/* ⚠ This used to loop over section9.html AND section9-classic.html. The classic build was removed
 * on 2026-08-02 (artist's call); the rule is unchanged, it just has one surface to check now. */
for (const p of ['section9.html']) {
  const s = R(p);
  if (!/js\/session\.js/.test(s)) continue;
  t(`${p} loads js/eth-play.js alongside js/session.js`, /js\/eth-play\.js/.test(s));
}

// ═══ 4b · THE NO-WEBGL2 ROUTE MUST NOT BE A DEAD LINK ═════════════════════════════════════════
/* ⛔ HISTORY, because the lesson outlived the file. `section9-classic.html` threw at load and was
 *   completely unplayable — `const LOADOUTS = WEAPONS.map(...)` ran ~620 lines above
 *   `const WEAPONS = [...]`, and `const` hoists into the temporal dead zone, so it died at the
 *   TOP LEVEL and every line after it stopped running. Driven: lChips, pChips and weapSlots all
 *   EMPTY, 0 arena chips, no start control. That page was the fail-open route for a browser with
 *   no WebGL 2 — **fail-open that fails closed is worse than no fallback, because nothing reports
 *   it.** It was fixed, and then REMOVED entirely on 2026-08-02 (artist's call).
 * ⚑ SO THE ROUTE IS NOW AN HONEST REFUSAL, and that is what gets checked. PlayCanvas has no
 *   software path; `#nogl` has to say so and hand the visitor somewhere that actually works. A
 *   panel still linking the deleted build would be the worst of both — it looks like a fallback
 *   and 404s. */
head('4b · the no-WebGL2 route is honest, not a dead link and not a false promise');
{
  const s9 = R('section9.html');
  /* ⚠ THE DETECTION IS IN THE MODULE, NOT THE PAGE. First cut asserted `getContext('webgl2')`
     against section9.html and failed — that call lives in js/s9pc-app.js, which is where the
     decision is made and where it belongs. Asserting on the wrong file is a test that reports
     the code is missing when it is merely somewhere else. */
  t('the shipping build still detects a missing WebGL 2 context',
    /getContext\('webgl2'\)/.test(R('js/s9pc-app.js')));
  t('it shows the #nogl panel rather than a black rectangle', /id="nogl"/.test(s9));
  t('it sends the visitor to the arcade, which still has 2D-capable games',
    /<a href="arcade\.html"/.test(s9));
  /* ⚠ ALL FOUR, not just Section 9's. The artist removed the rest on 2026-08-02 ("we don't need
     the classic versions for any games"), so every arcade cabinet is a PlayCanvas build and there
     is no game left that runs without WebGL 2. Checking one of the four would let the other three
     rot back in. */
  for (const f of ['section9-classic.html', 'riprocketer-classic.html',
                   'dogfight-classic.html', 'cloudracer-classic.html'])
    t(`${f} is gone from the tree`, !existsSync(join(ROOT, f)));
  /* ⚠ LINKS, NOT MENTIONS. A first cut grepped every shipped file for the STRING and failed on
     eight of them — all comments, including the note in section9.html explaining the removal and
     the sibling classic pages describing the arrangement they share. Comments are exempt across
     this whole repo for the same reason (see test-name-law.mjs): the record of a change belongs
     next to it. What must not survive is a live href, and `navigatorsOf` already resolves those
     — it is the function this file uses to answer exactly this question everywhere else. */
  for (const f of ['section9-classic.html', 'riprocketer-classic.html',
                   'dogfight-classic.html', 'cloudracer-classic.html']) {
    const stale = navigatorsOf(f);
    t(`⛔ nothing NAVIGATES to ${f} (a dead link is worse than no link)`,
      stale.length === 0, stale.join(', ') || 'no inbound links');
  }
  /* ⛔ AND NO PANEL MAY PROMISE A GAME THAT ALSO NEEDS WEBGL 2. section9.html's #nogl told the
     visitor "DOGFIGHT and RIP ROCKETER both degrade to a 2D renderer and will run here" — written
     on 2026-08-02 and WRONG THE MOMENT IT WAS WRITTEN, because both had already been ported and
     dogfight.html's own comment says it "cannot fall back to a 2D renderer". A claim about
     another page has to be checked against that page. */
  for (const f of ['section9.html', 'riprocketer.html', 'dogfight.html', 'cloudracer.html']) {
    const src = R(f);
    t(`${f}'s no-WebGL2 panel does not send the visitor to another WebGL-2-only game`,
      !/(degrade|degrades|fall back|falls open)[^<]{0,80}(will run here|runs? (essentially )?anywhere)/i.test(src));
  }
}

// ═══ 5 · NOTHING IS FETCHED THAT THE DRAW PATH CANNOT REACH ════════════════════════════════════
/* ⛔ js/ronin3d.js draws `skins[arch]` BEFORE `models[arch]` and returns, so a registered skin
 *   always wins. All 13 ARCH_KEYS have a .skn on disk, and the old code still ran an
 *   unconditional second pass: 13 `.glb` (all 404) then 13 `.obj`, of which ronin.obj (6.6 MB)
 *   and oni.obj (2.5 MB) SUCCEED — 9.1 MB downloaded, parsed, registered and never drawn.
 *   Driven proof: 25 4xx on every ronin.html load before, 0 after; 13 .skn, all 200. */
head('5 · the rigid-part loader runs only where a skin did not');
{
  const s = R('js/ronin.js');
  const r3 = R('js/ronin3d.js');
  t('ronin3d draws a registered skin before it looks at a model',
    /if \(skins\[f\.arch\]\)[\s\S]{0,120}return;[\s\S]{0,200}if \(models\[f\.arch\]\)/.test(r3));
  t('js/ronin.js chains the rigid load onto the skin fetch FAILING, not onto every arch',
    /\.catch\(\(\) => rigid\(k\)\)/.test(s));
  t('the rigid drop-in hook is preserved (glb then obj)',
    /RoninGLB\.load\('models\/' \+ k \+ '\.glb'\)/.test(s) && /RoninOBJ\.load\('models\/' \+ k \+ '\.obj'\)/.test(s));
  /* If an ARCH_KEY ever loses its .skn this stops being free — the rigid path fires for it, which
   * is correct, but it should be a decision rather than a surprise. */
  const archBlock = /const ARCH = \{([\s\S]*?)\n  \};/.exec(s);
  const keys = [...(archBlock ? archBlock[1] : '').matchAll(/^\s*'?([\w-]+)'?:\s*\{\s*name:/gm)].map(m => m[1]);
  t('the ARCH roster is populated', keys.length >= 13, keys.length + ' fighters');
  const noSkin = keys.filter(k => !existsSync(join(ROOT, 'models/' + k + '.skn')));
  t('every fielded fighter has a body on disk', noSkin.length === 0, noSkin.join(', ') || keys.length + '/' + keys.length);
}

// ═══ 6 · THE LAYERED CARDS ═════════════════════════════════════════════════════════════════════
/* ⚠ THE ARTIST'S LIVE COMPLAINT, and the assertion is deliberately WEAK because the fix is a
 *   DESIGN decision this file must not pre-empt (docs/REACHABILITY.md R2). What it pins is the
 *   part that is not a decision: the sidecars exist, they point at plates that exist, and exactly
 *   one page can render them. If that page count ever drops to zero the feature is gone; if it
 *   rises, the recommendation landed. Either way the number is on screen instead of assumed. */
head('6 · the layered cards resolve, and the page that can show them is named');
{
  const hero = join(ROOT, 'cards/art/hero');
  const cars = readdirSync(hero).filter(f => f.endsWith('.layers.json'));
  t('layer sidecars are on disk', cars.length >= 6, cars.join(', '));
  let plates = 0, missing = [];
  for (const f of cars) {
    const spec = JSON.parse(readFileSync(join(hero, f), 'utf8'));
    for (const L of spec.layers || []) {
      plates++;
      const p = join(hero, L.src);
      if (!existsSync(p) || statSync(p).size < 512) missing.push(f + ' → ' + L.src);
    }
  }
  t('every declared plate resolves to a real image', missing.length === 0,
    missing.slice(0, 3).join(' · ') || plates + ' plates across ' + cars.length + ' cards');
  const renders = [...TEXT].filter(([f, s]) => f.endsWith('.html') && /js\/card-layers\.js/.test(s)).map(([f]) => f);
  t('at least one shipped page loads js/card-layers.js', renders.length > 0, renders.join(', '));
  const reachable = renders.filter(p => navigatorsOf(p).some(n => !ORPHAN_OK[n]));
  /* ⛔ THIS WAS A NOTE AND IS AN ASSERTION NOW — artist, 2026-08-04: "fix reachability for the six
   *   so I may at least see ideas." It printed `0` for as long as it existed: `cards/lens3d.html`
   *   was linked ONLY from `studio.html`, which is itself an allow-listed orphan, so the single
   *   route into the flagship feature started from a page nothing links. Six generated, linked and
   *   tested layer stacks that no visitor could reach — this file's own subject, on the one
   *   feature it was least affordable on.
   * ⚑ `cards/binder.html` carries the DEPTH strip now, and the binder is reached from battle,
   *   market and deck3d. Printing the count was the honest thing while promoting a draft shell was
   *   the artist's call to make; he has made it, so it fails the build from here. */
  /* ⛔ THIS ASSERTION IS RELAXED TO A REPORT, AND IT REVERSES AN EARLIER ARTIST DIRECTIVE — which
   *   is why it is written out rather than quietly deleted. On 2026-08-04 he asked to "fix
   *   reachability for the six so I may at least see ideas", and the folder's ◈ DEPTH strip was
   *   the answer. On 2026-08-06 he took all three studio strips off that header — *"these links
   *   are not needed"* — and the depth strip went with them. So the six layered cards are once
   *   again reachable only from `studio.html`, itself an allow-listed orphan.
   * ⚠ THE LATER INSTRUCTION WINS, AND THE COST IS REAL: nothing a visitor can click shows a
   *   separated layer stack. It is printed on every run instead of failing the build, because a
   *   red build would be this suite disagreeing with the artist rather than protecting him. If
   *   the six should have a door again, that is a decision, and it belongs on a page he chooses
   *   — not smuggled back in by a test. */
  console.log(`     · layer-capable pages reachable from a non-orphan: ${reachable.length}` +
              (reachable.length ? ` (${reachable.join(', ')})` : ' — none, by the 2026-08-06 call'));
  /* …and the menu into them must be DERIVED, not a hand-typed row of numbers that silently stops
   * matching the sidecars the moment the set changes. */
  const idxF = join(hero, 'layered.json');
  t('the depth index is generated beside the sidecars', existsSync(idxF));
  if (existsSync(idxF)) {
    const idx = JSON.parse(readFileSync(idxF, 'utf8'));
    const have = cars.map(f => basename(f, '.layers.json')).sort();
    t('…and it lists exactly the cards that have a stack',
      JSON.stringify((idx.cards || []).slice().sort()) === JSON.stringify(have),
      (idx.cards || []).join(', '));
    t('…and the binder reads it rather than hardcoding the list',
      /layered\.json/.test(TEXT.get('cards/binder.html') || ''));
  }
}

// ═══ 6b · THE FIRST OF THE 33 IS REACHABLE, AND ITS TYPE IS NOT A FONT ═════════════════════════
/* `npm run test:hero` measures what the card DOES. This measures what nobody would notice was
 * missing: that a visitor can get to it at all, and that two structural promises are still true in
 * the source rather than only in the header comment. */
head('6b · the first of the 33 is reachable, and the type is still geometry');
{
  const proof = TEXT.get('cards/proof.html') || '';
  t('cards/proof.html exists and loads the renderer', /js\/hero-card\.js/.test(proof));

  /* ⛔ THE ASSERTION HERE USED TO BE THE EXACT OPPOSITE, AND INVERTING IT IS THE POINT.
   * It required that something non-orphan LINK the forge — written when the worry was that the
   * first of the 33 was built, tested and unreachable. Artist, 2026-08-06: *"these links are not
   * needed - no one should have access to the plate proof console except me."* So the guard is
   * turned around rather than deleted: the failure mode changed direction, and a guard that is
   * simply removed leaves the next well-meaning pass free to re-add a friendly door to the
   * artist's authoring console.
   * ⚑ TWO ASSERTIONS, BECAUSE THERE ARE TWO WAYS IN AND ONLY ONE OF THEM IS A LINK. Unlinking is
   *   obscurity — the veil has been off since 2026-08-05 and the URL is in a public repo — so
   *   the file must ALSO be out of the deploy. Checking only the links would pass on a site that
   *   still serves the whole console to anyone who types the path. */
  const doors = navigatorsOf('cards/proof.html');
  t('NOTHING links the forge — it is the artist\'s console, not a public page',
    doors.length === 0, doors.join(', ') || 'no inbound link, as intended');
  const vign = R('.vercelignore');
  t('…and it is not deployed at all, which is the half that is a lock',
    /^cards\/proof\.html\s*$/m.test(vign));
  t('the committed type outlines exist', existsSync(join(ROOT, 'cards/type/alphabet.json')));

  /* ══ ⛔ THE FORGE WRITES RECIPES AND THE PUBLIC VIEWER READS THEM ═══════════════════════════
   * `cards/deck.json` is 100 query strings the forge serialised; `js/card-recipe.js` is what
   * turns one back into a card for `cards/deck.html`, the folder and the pack. They are two
   * tables of the same key→setter knowledge, in two files, because the forge's rows also carry a
   * label, a slider element and a saved value — jobs the viewer does not have — and importing
   * them would ship the console's UI to every visitor.
   * ⛔ SO THEY ARE COUPLED BY ASSERTION, the instrument `js/city-ops.js` and `js/s9pc-game.js`
   *   already use for their weapon tables. A dial added to the forge and not to the reader is a
   *   dial that SAVES into a recipe and is silently dropped on every card the public opens —
   *   a hundred cards printing as slightly different cards, with nothing anywhere reporting it,
   *   which is this repo's signature failure shape.
   * ⚠ Read out of the SOURCE rather than by running it: both files are browser globals with no
   *   module boundary, and a regex over the literal keys cannot be fooled by a table that is
   *   built correctly and then never consulted. */
  {
    const recipe = R('js/card-recipe.js');
    const body = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    const readerKeys = new Set(
      [...body(recipe).matchAll(/^\s{4}([a-z]+):\s*\{\s*d:/gm)].map(m => m[1]));
    /* every `k: 'x'` in the forge's DIALS / TOGGLES / CHOICES rows.
     * ⚠ MINUS THE SIX PLATE SLOTS. `g m f w s i` are rows in the forge's slot table and they
     *   carry a `k:` too, but they are not dials — they name a PICTURE, and the reader resolves
     *   them through the pigment pool (`CardRecipe.SLOTS`) rather than through a setter. The
     *   first version of this assertion did not know that and failed on all six, which is the
     *   check being wrong rather than the code. */
    const SLOTS = new Set((R('js/card-recipe.js').match(/SLOTS\s*=\s*\[([^\]]+)\]/) || [, ''])[1]
      .match(/'([a-z])'/g)?.map(s => s.replace(/'/g, '')) || []);
    const forgeKeys = new Set(
      [...body(proof).matchAll(/\bk:\s*'([a-z]+)'/g)].map(m => m[1]).filter(k => !SLOTS.has(k)));
    t('the recipe reader knows every dial the forge can save',
      [...forgeKeys].every(k => readerKeys.has(k)),
      [...forgeKeys].filter(k => !readerKeys.has(k)).join(', ') || 'all ' + forgeKeys.size + ' keys');
    t('…and invents none the forge cannot write',
      [...readerKeys].every(k => forgeKeys.has(k) || k === 'mot'),
      [...readerKeys].filter(k => !forgeKeys.has(k) && k !== 'mot').join(', ') || 'none');
    t('…and the public viewer never falls back to the forge\'s PLATE PROOF placeholder',
      !/PLATE PROOF/.test(recipe.replace(/\/\*[\s\S]*?\*\//g, ' ')));
  }
  /* ⚠ The proof used to load a BAKED word (`plate-proof.json`) and now composes from the
   * alphabet, because 67 field cards would otherwise be 67 baked words — and a name that costs a
   * build step to change is a name that becomes permanent by friction. Either route is still no
   * font; what must never appear is a font NAMED in CSS, because that hands the collector's
   * machine a vote over the permanent artwork. */
  t('…and the page reads them rather than naming a font',
    /type\/(alphabet|plate-proof)\.json/.test(proof) && !/font-family:[^;]*Arial Black/.test(proof));

  /* ⚠ COMMENTS STRIPPED FIRST, and this bit immediately: the renderer's own header explains that
   * Math.random appears nowhere in it, so the first version of this check failed on the sentence
   * describing the property it was verifying. That is `test:name`'s recorded lesson in a new
   * place — a checker that cries wolf on its own explanation gets muted, and then it is not a
   * checker. The record of a rule belongs next to the code that keeps it. */
  const hc = (TEXT.get('js/hero-card.js') || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  /* ⛔ Determinism is STRUCTURAL, not a promise: acceptance 5 is only true because there is no
   * entropy in the render path at all. One random call or one clock read would end it, and the
   * failure would surface as a flaky byte-comparison in a different test entirely. */
  t('the renderer draws on no entropy', !/Math\s*\.\s*random/.test(hc));
  t('…and reads no clock', !/Date\s*\.\s*now|performance\s*\.\s*now|new\s+Date/.test(hc));
  /* ⛔ And the pigment must come from the deck manifest. A hardcoded list of card files is how
   * "made out of the 100" quietly becomes "made out of three files somebody typed in 2026". */
  t('the pigment pool comes from the deck manifest',
    /hero-manifest\.json/.test(proof) && /pigment/.test(proof));
}

// ═══ 2c · CAN A VISITOR ACTUALLY WALK THERE FROM THE FRONT DOOR? ═══════════════════════════════
/* ⛔ THE ORPHAN SWEEP ABOVE CANNOT ANSWER THIS, AND FINDING THAT OUT IS THE POINT. It asks "does
 * anything link this page", which a CLOSED CYCLE satisfies trivially: the deck links its 196 card
 * pages and every card page links `./` straight back, so the whole card surface would keep passing
 * §2 with the single door on the home page removed — measured, by removing it. A set of pages that
 * only point at each other is unreachable and perfectly non-orphaned.
 * ⚑ So this one WALKS. Breadth-first from index.html, resolving hrefs the way a server does, and
 *   asks how many clicks each surface actually is. That is the question the artist asked
 *   ("where are the cards"), and it is a different question from the one §2 was answering. */
head('2c · the surfaces a visitor comes for are a short walk from the front door');
{
  const norm = p2 => {
    const out = [];
    for (const seg of p2.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') out.pop(); else out.push(seg);
    }
    return out.join('/');
  };
  const resolve = (from, h) => {
    if (/^(https?:|mailto:|tel:|#|javascript:|data:)/i.test(h)) return null;
    let t2 = h.split('#')[0].split('?')[0];
    if (t2 === '') t2 = './';
    let abs = t2.startsWith('/') ? t2.slice(1)
      : norm((dirname(from) === '.' ? '' : dirname(from) + '/') + t2);
    if (abs === '' || t2.endsWith('/')) abs = norm(abs + '/index.html');
    if (!/\.[a-z0-9]+$/i.test(abs)) abs = norm(abs + '/index.html');
    return TEXT.has(abs) ? abs : null;
  };
  const dist = { 'index.html': 0 }, via = {};
  for (const q = ['index.html']; q.length;) {
    const f = q.shift();
    const src = TEXT.get(f) || '';
    for (const m of src.matchAll(/(?:href|data-href)\s*=\s*["']([^"']+)/g)) {
      const t2 = resolve(f, m[1]);
      if (!t2 || !t2.endsWith('.html') || dist[t2] !== undefined) continue;
      dist[t2] = dist[f] + 1; via[t2] = f; q.push(t2);
    }
  }
  /* ⚠ The bar is CLICKS, not existence. Three is generous — it is "home, a hub, the thing" — and
   * anything past it is a page the artist will not find, which is the failure being guarded. */
  for (const [page, why] of [
    /* ⛔ `cards/index.html` CAME OFF THIS LIST — artist, 2026-08-06, hours before launch: *"only
     *   the 100 cards need to be shown."* That page is a grid of the 196 PLACEHOLDER pictures,
     *   and it sat one click from home labelled "▚ Into the deck". It is the PIGMENT index — the
     *   ink the press prints from — and `cards/deck.html` says so in as many words. The page and
     *   all 196 card pages still RESOLVE (shared URLs keep working, and the press still fetches
     *   the manifest); nothing routes a visitor to them any more.
     * ⚠ It is still `navigatorsOf`-reachable, because the 196 card pages each link back to it —
     *   a closed cycle, which §2c exists to see through. That is why this is a WALK entry being
     *   removed and not an ORPHAN_OK entry being added. */
    ['cards/binder.html', 'the folder'],
    /* ⛔ `cards/proof.html` IS DELIBERATELY NOT WALKABLE — artist, 2026-08-06. It was listed here
     *   as "the 33"; the 33 are public at cards/deck.html now, and the forge is not a visitor
     *   surface at all. §6b asserts the opposite of this for it. */
    ['cards/deck.html', 'the hundred — both bands'],
    /* ⚠ `cards/field.html` came OFF this list with the folder's ◈ THE FIELD strip. It is a token
     *   media target now, not a page the site walks to — see its ORPHAN_OK entry. The 67 are
     *   browsable at cards/deck.html, which IS on this list. */
    ['cards/market.html', 'the market bench'],
    ['arcade.html', 'the arcade'],
    ['city.html', 'THE CITY'],
  ]) {
    t(`${why} is reachable from the home page`, dist[page] !== undefined && dist[page] <= 3,
      dist[page] === undefined ? 'NO WALK EXISTS' : `${dist[page]} click(s), via ${via[page]}`);
  }
  /* ⛔ IT MUST STILL NEVER LOOK LIKE THE DECISION HAS BEEN MADE. The artist took the link down on
   * 2026-08-06 (the home page carries the roadmap section in its place), so the sheet is an
   * allow-listed orphan now rather than a linked proposal — but the page itself is unchanged and
   * has NOT been promoted, so the word on its face and the routes home still have to hold. */
  const s3 = TEXT.get('studio3d.html') || '';
  t('the proposed landing surface says on its own face that it is a proposal',
    /proposal/i.test(s3) && /not final art/i.test(s3));
  t('…and it links back to the page it proposes to replace',
    (s3.match(/href="index\.html"/g) || []).length >= 2,
    `${(s3.match(/href="index\.html"/g) || []).length} routes home`);
}

// ═══ 6c · THE DECK IS NOT A DEAD END ═══════════════════════════════════════════════════════════
/* Artist, 2026-08-04, looking at a card page: *"where are the cards, I'm not seeing them in the
 * folder or the deck or anywhere."* Both pages rendered and both were one click from home — and he
 * was still right. `cards/index.html` carried exactly ONE link, back to the pack, so a visitor who
 * arrived at the 197 cards found no sign that the folder, his own cards or the generated heroes
 * existed. ⚑ REACHABLE-FROM-SOMEWHERE IS NOT FINDABLE-FROM-WHERE-YOU-ARE, and that gap is this
 * file's whole subject one level further in than it had been looking. */
head('6c · the deck offers a way onward, and the generator that writes it agrees');
{
  const deck = TEXT.get('cards/index.html') || '';
  t('the deck links THE FOLDER', /href="binder\.html"/.test(deck));
  /* ⛔ WAS `href="proof.html"` — "the deck links THE 33". The 33 were only ever reachable through
   * the FORGE, which is the artist's console and is neither linked nor deployed from 2026-08-06.
   * The onward door is `cards/deck.html`, which carries both bands and opens every card in the
   * starfield viewer — so the row still answers the question this section exists for ("is there a
   * way onward from here"), it just no longer answers it with an authoring tool. */
  t('the deck links THE HUNDRED', /href="deck\.html"/.test(deck));
  /* ⛔ AND THE GENERATOR MUST CARRY IT. `cards/index.html` is written by
   * `scripts/ingest-batch.mjs`; patching only the output leaves the generator armed to put the
   * dead end back on the next ingest, which is exactly the failure `test:name` §4 was built for
   * (`restyle-backs.mjs` emitting the dead-name bitmap over hand-fixed output). */
  const gen = readFileSync(join(ROOT, 'scripts/ingest-batch.mjs'), 'utf8');
  t('…and the generator emits the same nav', /class="decknav"/.test(gen) &&
    /href="binder\.html"/.test(gen) && /href="deck\.html"/.test(gen));
  /* ⚠ BOTH SIDES, BECAUSE "IT IS GONE FROM THE OUTPUT" IS THE HALF THAT ROTS BACK. The generator
   *   is what re-writes this page on the next ingest. */
  t('…and neither the page nor its generator re-opens a forge door',
    !/href="proof\.html"/.test(deck) && !/href="proof\.html"/.test(gen));
  t('…and so does the shipped page', /class="decknav"/.test(deck));
}

// ═══ 6d · THE FIELD — CARDS 34–100 ═════════════════════════════════════════════════════════════
/* Artist, 2026-08-04: *"lets create cards 34-100"*, *"different frames for each card with ascii
 * patterns"*, *"separate frames by card rarity type"* and *"these are all live lenses so the more
 * connectivity we have the better."* `npm run test:hero` measures what a card DOES; this checks
 * that the set exists, is complete, and reaches a visitor without a wallet in sight. */
head('6d · the field is complete, framed by rarity, and live without a wallet');
{
  const deck = JSON.parse(R('cards/field-deck.json'));
  t('the field is 67 cards, 34–100', deck.count === 67 && deck.range[0] === 34 && deck.range[1] === 100,
    `${deck.count} cards`);
  t('…every number in the range is present exactly once',
    new Set(deck.cards.map(c => c.n)).size === 67 &&
    deck.cards.every(c => c.n >= 34 && c.n <= 100));
  t('…every card has its own name and its own seed',
    new Set(deck.cards.map(c => c.name)).size === 67 &&
    new Set(deck.cards.map(c => c.seed)).size === 67);
  /* ⚠ The names are placeholders and the FILE has to keep saying so — a provisional name that
   * stops announcing itself is how a placeholder becomes canon by silence. */
  t('…and the manifest still says the names are placeholders', deck.namesArePlaceholders === true);
  const byR = {};
  for (const c of deck.cards) byR[c.rarity] = (byR[c.rarity] || 0) + 1;
  t('…and the rarity pyramid is intact', Object.keys(byR).length === 6 && byR.common === 24 &&
    byR.mythic === 2, Object.entries(byR).map(([k, v]) => k + ' ' + v).join(' · '));

  const field = TEXT.get('cards/field.html') || '';
  /* ⛔ THE RARITY HAS TO TRAVEL WITH THE CARD. It picks the border's family of sorts and how much
   * of the frame is foil; leaving it off the build call gives every card a common frame, which
   * looks like a working feature and is the feature not arriving. It did, once. */
  t('the viewer passes rarity to the renderer', /rarity:\s*card\.rarity/.test(field));
  t('…and composes the name from the alphabet, not a baked word',
    /type\/alphabet\.json/.test(field) && /name:\s*card\.name/.test(field));
  t('the alphabet of outlines ships', existsSync(join(ROOT, 'cards/type/alphabet.json')));

  /* Artist: "we should have right click save as (RCSA) functions for collectors." ⛔ RCSA does not
   * work on a canvas — the browser offers "Save image as…" for an <img> and nothing at all for a
   * <canvas>. So the export has to produce a real image and put it in front of the card, and the
   * assertion is about the <img>, not about the button. */
  for (const f of ['cards/field.html', 'cards/proof.html']) {
    const src = TEXT.get(f) || '';
    t(`${f} can export a still and a GIF`, /CardExport\.still/.test(src) && /CardExport\.gif/.test(src));
    t('…and hands it to an <img> so right-click / long-press works',
      /CardExport\.attach/.test(src) && /\.rcsa/.test(src));
  }
  /* ⚠ …and the overlay must not eat the card while it is EMPTY, or handling silently stops
   * working — a layout bug that reads as a broken renderer. */
  t('the export overlay is inert until something lands',
    ['cards/field.html', 'cards/proof.html'].every(f =>
      /#save\{[^}]*pointer-events:none/.test(TEXT.get(f) || '')));
  t('the exporter ships and pulls in no dependency',
    existsSync(join(ROOT, 'js/card-export.js')) &&
    !/require\(|import .* from |cdn\.|unpkg|jsdelivr/.test(R('js/card-export.js')));

  /* ⛔ LIVE, AND NEVER A WALLET. SuperRare's security team flagged this once and they were right:
   * a frame that asks for a wallet is indistinguishable from one that has been swapped. Read-only
   * eth_call over fetch is the whole network surface. */
  for (const f of ['cards/field.html', 'cards/proof.html']) {
    const src = (TEXT.get(f) || '').replace(/<!--[\s\S]*?-->/g, ' ');
    t(`${f} reads the chain`, /lens-state\.js/.test(src) && /LensState/.test(src));
    t(`…and asks for no wallet`, !/window\.ethereum|WalletConnect|eth_requestAccounts|personal_sign/.test(src));
  }
}

// ═══ 7 · THE SITEMAP LISTS THE CABINETS IT HAS ═════════════════════════════════════════════════
head('7 · the sitemap lists every cabinet');
{
  const sm = R('sitemap.xml');
  for (const c of CABINETS.concat(['arcade.html'])) t(`sitemap.xml lists ${c}`, sm.includes('/' + c + '<'));
}

/* ── §7  RipDeck.load()'s base must match the CALLING PAGE's depth ───────────────────────────
 * ⛔ EVERY CABINET BROKE AT ONCE ON THIS. `RipDeck.load(base)` fetches `base + 'deck-manifest.json'`
 *   RELATIVE TO THE PAGE. `cards/battle.html` passes '' because the manifests sit beside it;
 *   copying that call verbatim into dogfight/section9/cloudracer/riprocketer/ronin — all at the
 *   ROOT — made it fetch `/deck-manifest.json`, a 404 swallowed by the loader's own catch. The
 *   deck came back EMPTY and the pickers told players holding a full folder "deck manifest
 *   missing" and "no cards yet". Nothing threw; the failure was a silent [].
 * ⚑ Guards the VALUE, not the symptom: a root-depth caller must pass 'cards/', a caller under
 *   /cards/ must pass ''. */
head('§7  the deck loader is called with the right base for the page');
{
  const callers = [];
  for (const [rel, src] of TEXT) {
    if (!/\.(js|html)$/.test(rel)) continue;
    const m = [...src.matchAll(/RipDeck\.load\(\s*'([^']*)'\s*\)/g)];
    if (m.length) callers.push({ rel, bases: m.map(x => x[1]) });
  }
  t('§7 something calls RipDeck.load', callers.length > 0, callers.length + ' file(s)');
  for (const c of callers) {
    /* `js/*.js` modules are loaded BY root pages, so they are root-depth too; only files under
       cards/ sit beside the manifests. */
    const want = c.rel.startsWith('cards/') ? '' : 'cards/';
    t(`§7 ${c.rel} passes ${JSON.stringify(want)}`,
      c.bases.every(b => b === want), 'found ' + JSON.stringify(c.bases));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

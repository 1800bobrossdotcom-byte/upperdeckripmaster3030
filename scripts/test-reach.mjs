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
}

head('1 · every cabinet is reachable from the arcade');
const arcade = R('arcade.html');
/* ⚠ `ronin.html` WAS THIS LIST'S SIXTH ENTRY AND IS NOW `city.html`. NEON RONIN was retired on
 * 2026-08-03 (artist: "neon ronin honestly sucks as a game") and THE CITY took its cabinet. The
 * entry is REPLACED, not deleted — a guard that is dropped when the thing it guards is replaced
 * simply stops guarding, and the new game is exactly as capable of shipping unreachable as the old
 * one was. `ronin.html` is deliberately NOT asserted any more: it is history, it still resolves for
 * anyone holding the URL, and nothing is required to link it. */
const CABINETS = ['city.html', 'riprocketer.html', 'cloudracer.html', 'cards/battle.html'];
/* ⛔ SIX → FOUR (artist, 2026-08-03). `section9.html` and `dogfight.html` left the GRID because
 * they fold into THE CITY as modes — but they are NOT orphaned and must not be: their modes are
 * unfinished, so THE CITY's mode bar carries the route until they land. That is asserted below
 * rather than allow-listed, because "it is linked from somewhere" is exactly the kind of claim
 * that quietly stops being true. When the modes ship, these two assertions are what should fail. */
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
  t('arcade.html is down to four cabinets',
    (arcade.match(/<a class="cab"/g) || []).length === 4,
    (arcade.match(/<a class="cab"/g) || []).length + ' found');
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
  'superrare.html': 'the token animation_url target — reached from the chain, not from the site',
  'cabinet.html': 'the sandbox-safe embed fallback, reached from superrare.html only',
  'deploy-render.html': 'an operator tool, deliberately unlinked',
  'cards/deck3d.html': 'a redirect kept alive because that URL was already shared',
  /* ⚠ RETIRED, NOT DELETED. NEON RONIN lost its cabinet to THE CITY on 2026-08-03 (artist's call).
   * The page and its 13 fighters are left on disk and still resolve, because a URL that has been
   * shared should keep working — but nothing is required to link it any more, so the orphan sweep
   * would otherwise fail forever on a page that is orphaned ON PURPOSE. Listing it here with the
   * reason is the difference between a decision and an oversight; that distinction is the entire
   * value of this allowlist. */
  'ronin.html': 'RETIRED — replaced in the arcade by city.html (THE CITY). Kept so the URL resolves.',
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
  if (f === 'index.html' || f === 'cards/index.html') continue;      // roots
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
  /* ⚠ THIS IS THE OPEN FINDING, NOT A PASSING STATE. `cards/lens3d.html` is linked ONLY from
   *   studio.html, which nothing links — so today `reachable` is empty and this prints the fact
   *   rather than failing the build, because promoting a draft shell is the artist's call. */
  console.log(`  note layer-capable pages reachable from a linked page: ${reachable.length}` +
              (reachable.length ? ' (' + reachable.join(', ') + ')' : ' — see docs/REACHABILITY.md R2'));
}

// ═══ 7 · THE SITEMAP LISTS THE CABINETS IT HAS ═════════════════════════════════════════════════
head('7 · the sitemap lists every cabinet');
{
  const sm = R('sitemap.xml');
  for (const c of CABINETS.concat(['arcade.html'])) t(`sitemap.xml lists ${c}`, sm.includes('/' + c + '<'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

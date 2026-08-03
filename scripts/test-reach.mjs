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
head('1 · every cabinet is reachable from the arcade');
const arcade = R('arcade.html');
const CABINETS = ['section9.html', 'riprocketer.html', 'dogfight.html', 'cloudracer.html',
                  'ronin.html', 'cards/battle.html'];
for (const c of CABINETS) {
  t(`arcade.html links ${c}`, new RegExp('href="' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(arcade));
}
/* studio.html's deep link. An anchor that does not exist does not error — it silently lands on
 * the top of the page, which is exactly why nobody noticed. */
t('the #ronin anchor studio.html deep-links to exists', /id="ronin"/.test(arcade));

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
head('4b · the no-WebGL2 route is honest, not a dead link');
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
  t('section9-classic.html is gone from the tree', !existsSync(join(ROOT, 'section9-classic.html')));
  /* ⚠ LINKS, NOT MENTIONS. A first cut grepped every shipped file for the STRING and failed on
     eight of them — all comments, including the note in section9.html explaining the removal and
     the sibling classic pages describing the arrangement they share. Comments are exempt across
     this whole repo for the same reason (see test-name-law.mjs): the record of a change belongs
     next to it. What must not survive is a live href, and `navigatorsOf` already resolves those
     — it is the function this file uses to answer exactly this question everywhere else. */
  const stale = navigatorsOf('section9-classic.html');
  t('⛔ nothing NAVIGATES to the removed build (a dead link is worse than no link)',
    stale.length === 0, stale.join(', ') || 'no inbound links');
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

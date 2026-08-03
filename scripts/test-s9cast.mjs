/* Section 9's CAST must be reachable, complete and on disk.
 *
 * ⛔ THREE SEPARATE SILENT FAILURES PUT THE CHARACTERS OUT OF THE GAME, and none of them threw:
 *
 *  1 `AUTO_TIER` was derived from `GfxPost.dprCap()`, which ends in `min(dpr, cap)` — so an
 *    ordinary 1x desktop monitor scored 1 and landed on the `low` tier, and `low` carried
 *    `skin: false`. Every operative fell back to the 11-box rig and no .skn was ever requested.
 *    Pixel density is not GPU capability.
 *  2 `archFor(i)` was `CAST[i % CAST.length]` and a match defaults to 3 bots, so it drew indices
 *    0/1/2 every match forever. rip-mascot, cc0-mosh (the XCOPY study), cc0-cel (the Darkfarms
 *    study) and cc0-grid sat at 3–6 and were unreachable in a shipped game.
 *  3 `setRoster` was written but not EXPORTED, and `startMatch` guards with
 *    `S9Skin.setRoster && ...` — so the rotation was a silent no-op that left the roster frozen
 *    exactly where it had been.
 *
 * Plus the PlayCanvas material table went stale against CAST TWICE — its own comment documents
 * the first time. This file is the thing that notices instead of a person.
 *
 * Static: parses the sources and checks the filesystem. No browser, so it is fast enough to sit
 * in `npm test` and catch the regression at the moment it is written.
 *
 * Usage: node scripts/test-s9cast.mjs        (npm run test:s9cast)
 */
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}` + (detail ? `  — ${detail}` : '')); }
  else { fail++; console.log(`  FAIL ${name}` + (detail ? `  — ${detail}` : '')); }
};

const skin = readFileSync(join(ROOT, 'js/section9-skin.js'), 'utf8');
const pcSkin = readFileSync(join(ROOT, 'js/s9pc-skin.js'), 'utf8');
const pcApp = readFileSync(join(ROOT, 'js/s9pc-app.js'), 'utf8');
const pcGame = readFileSync(join(ROOT, 'js/s9pc-game.js'), 'utf8');
/* ⚠ `section9-classic.html` WAS REMOVED on 2026-08-02 (artist's call), so every assertion
 * that used to check BOTH builds now checks the one that ships. The checks are kept rather
 * than deleted — the rule each states is still the rule; it simply has one surface now. */
const gfx = readFileSync(join(ROOT, 'js/gfx-post.js'), 'utf8');

// ── the cast ─────────────────────────────────────────────────────────────────────────────────
const castBlock = /const CAST = \[([\s\S]*?)\n  \];/.exec(skin);
t('js/section9-skin.js declares a CAST', !!castBlock);
const cast = [...(castBlock ? castBlock[1] : '').matchAll(/\{\s*arch:\s*'([^']+)'/g)].map(m => m[1]);
t('the cast is populated', cast.length >= 7, cast.length + ' bodies');

/* PLAY is the LIVE roster — the generated bodies. oni/kappa/prizm stay in CAST for their names
 * and materials but are 0.71–0.98 MB each against ~0.16–0.22, so they are out of rotation. */
const play = cast.filter(a => a.indexOf('cc0-') === 0 || a === 'rip-mascot');
t('the live roster is the generated bodies only', play.length === 7, play.join(', '));

/* The two the artist asked after by name. Named explicitly so a future edit that quietly drops
 * them fails here rather than being noticed months later in a screenshot. */
for (const [arch, who] of [['cc0-mosh', 'the XCOPY study'], ['cc0-cel', 'the Darkfarms study'],
  ['cc0-grid', 'the Nouns study'], ['rip-mascot', "the artist's own lineage"]]) {
  t(`${arch} (${who}) is in the live roster`, play.indexOf(arch) >= 0);
}

// ── every body actually exists on disk ───────────────────────────────────────────────────────
for (const arch of play) {
  let sz = 0;
  try { sz = statSync(join(ROOT, 'models/' + arch + '.skn')).size; } catch {}
  t(`models/${arch}.skn is on disk`, sz > 1000, sz ? (sz / 1024).toFixed(0) + ' KB' : 'MISSING');
}

// ── reachability ─────────────────────────────────────────────────────────────────────────────
/* ⚑ The one that matters. A match defaults to `players: 4` = 3 bots, so if the roster does not
 * rotate then only three bodies are ever drawn and the rest are dead weight in the repo. */
t('section9-skin.js exports setRoster (an unexported one is a silent no-op)',
  /return \{[^}]*\bsetRoster\b/.test(skin));
t('archFor picks from the rotating live roster, not the head of CAST',
  /function archFor\(i\) \{ return playFor\(i\)\.arch; \}/.test(skin));
t('the engine build rotates the cast at match start',
  /S9Skin\.setRoster/.test(pcGame), 'js/s9pc-game.js');

// ── the material table must cover every playable body ────────────────────────────────────────
/* It has gone stale twice. Missing entries do not throw — they fall through to one generic dark
 * fallback, so N distinct characters render as one anonymous shape and nothing reports it. */
const K = /const K = \{([\s\S]*?)\}\[arch\]/.exec(pcSkin);
t('s9pc-skin.js has a per-archetype material table', !!K);
const mats = new Set([...(K ? K[1] : '').matchAll(/'?([\w-]+)'?\s*:\s*\{\s*d:/g)].map(m => m[1]));
const missing = play.filter(a => !mats.has(a));
t('every playable body has its OWN material (no silent fallback)',
  missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : mats.size + ' entries');

// ── the tier must not be able to delete the cast ─────────────────────────────────────────────
t('`skin` is no longer a quality-tier flag (the characters are not an effect)',
  !/skin:\s*(true|false)\s*,/.test(pcApp), 'js/s9pc-app.js TIERS');
t('bodies are spawned unconditionally, not gated on the tier',
  !/QCFG\.skin\s*\?/.test(pcApp));
/* Density is not capability: dprCap() ends in min(dpr, cap), so it reports 1 on any ordinary
 * desktop monitor no matter how strong the machine behind it is. */
t('GfxPost exports a deviceTier() that does not read devicePixelRatio',
  /function deviceTier\(\)/.test(gfx) && !/function deviceTier\(\)[\s\S]{0,600}?devicePixelRatio/.test(gfx));
t('the tier comes from the device, not from the pixel ratio',
  /AUTO_TIER = \(window\.GfxPost && GfxPost\.deviceTier\)/.test(pcApp));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

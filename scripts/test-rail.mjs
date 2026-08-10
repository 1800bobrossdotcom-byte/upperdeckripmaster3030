#!/usr/bin/env node
/* ripmaster3030studios — THE RAIL + ONE PALETTE.  `npm run test:rail`
 *
 * Artist, 2026-08-09: *"these pages still feel disparate separate and unusable."*
 *
 * ⛔ THE MEASUREMENT THAT MADE THAT CONCRETE, taken before anything was changed, at 1180×900:
 *       check.html       first link 299px    12 links
 *       poolcheck.html              315px     8
 *       toll.html                   572px     6
 *       3030.html                 1,225px     7
 *       sheet.html                1,507px     3
 *       substrate.html            5,511px     2      ← six screens before ANY way out
 *   Seven surfaces, seven different sets of exits, in seven different places. **The doors are what
 *   make it one product**, and a visitor who has to re-learn where they are on every page is using
 *   seven tools. Plus TWO PALETTES that differed by a few counts — `#08090b` against `#07090c`,
 *   `#d8ff45` against `#e0ff4f` — near enough to be invisible and far enough that the ground
 *   shifted underfoot. This repo's own rule: two backgrounds that nearly match is worse than one.
 *
 * ⚑ WHAT THIS SUITE GUARDS IS SAMENESS, which is the one property a shared rail has and seven
 *   hand-written navs cannot: the same doors, the same order, in the same place, on every surface.
 *   Asserting "there is a nav" would pass on the build that prompted the complaint.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { chromium } = require_('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? (pass++, console.log('  ok   ' + m + (d ? '  — ' + d : '')))
                            : (fail++, console.log('  FAIL ' + m + (d ? '  — ' + d : ''))); };
const tally = (why) => console.log(`\n${fail || why ? '✕' : '✓'} rail: ${pass} passed, ${fail} failed`
  + (why ? `  ⛔ THE HARNESS DIED: ${why}` : ''));
for (const ev of ['uncaughtException', 'unhandledRejection'])
  process.on(ev, (e) => { tally(String(e && e.message || e).slice(0, 90)); process.exit(1); });

/* the surfaces, read from the MODULE rather than restated — a second list is a second thing to
 * forget, which is the defect the rail itself exists to fix. */
const RAIL_SRC = readFileSync(join(ROOT, 'js/rail3030.js'), 'utf8');
const DOORS = [...RAIL_SRC.matchAll(/\{ file: '([^']+)',\s*label: '([^']+)'/g)].map(m => ({ file: m[1], label: m[2] }));
const ANSWERS = [...(RAIL_SRC.match(/var ANSWER_OF = \{([^}]*)\}/) || [,''])[1]
  .matchAll(/'([^']+)':\s*'([^']+)'/g)].map(m => ({ file: m[1], owner: m[2] }));
const SURFACES = [...DOORS.map(d => d.file), ...ANSWERS.map(a => a.file)];

console.log('\n── A · the module is the list ──');
/* ⚠ FOUR SINCE PLATE WAS RETIRED (2026-08-10). The floor is a guard against the rail silently
 *   emptying, not a target — it was 5 and is 4 because `sheet.html` was removed on purpose, not
 *   lost. Every remaining door answers a question a visitor actually has; PLATE asked them to
 *   compose 256 bytes it could not press. ⛔ Do not raise this back to 5 to "fix" a red bar —
 *   that is how a retired surface gets resurrected by a test nobody re-read. */
ok(DOORS.length >= 4, `the rail declares ${DOORS.length} doors`, DOORS.map(d => d.label).join(' · '));
ok(ANSWERS.length >= 2, `and ${ANSWERS.length} answers that belong to a door`,
  ANSWERS.map(a => a.file + '→' + a.owner).join(' · '));

console.log('\n── B · ONE PALETTE, not two that nearly match ──');
{
  const KEYS = ['--bg', '--ink', '--hot', '--dim', '--line'];
  const seen = new Map();
  for (const f of SURFACES) {
    const h = readFileSync(join(ROOT, f), 'utf8');
    const m = h.match(/:root\{([^}]*)\}/);
    if (!m) { ok(false, `${f} declares a :root palette`); continue; }
    const v = {};
    for (const p of m[1].split(';')) { const i = p.indexOf(':');
      if (i > 0 && p.slice(0, i).trim().startsWith('--')) v[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
    seen.set(f, KEYS.map(k => (v[k] || '?').toLowerCase()).join(' '));
  }
  const distinct = [...new Set(seen.values())];
  ok(distinct.length === 1,
    '⛔ every surface declares the SAME five core colours — two palettes that nearly match is worse '
    + 'than one, because the shift is felt and not seen',
    distinct.length === 1 ? distinct[0]
      : distinct.length + ' DIFFERENT: ' + [...seen].map(([f, v]) => f + ' → ' + v).join(' | '));
}

console.log('\n── C · every surface loads it ──');
{
  const bare = (h) => h.replace(/<!--[\s\S]*?-->/g, ' ');
  /* ⚠ a <script src>, not a mention — a comment naming the file is not a load, and this repo has
   *   now been bitten by exactly that twice, once by me an hour ago. */
  const missing = SURFACES.filter(f => !/<script[^>]+src=["'][^"']*rail3030\.js["']/
    .test(bare(readFileSync(join(ROOT, f), 'utf8'))));
  ok(missing.length === 0, 'every surface loads /js/rail3030.js',
    missing.length ? '⛔ WITHOUT IT: ' + missing.join(', ') : SURFACES.length + ' surfaces');
}

/* ── D · driven: the same doors, the same place, on every one ─────────────────────────────── */
const srv = createServer((q, s) => {
  const p = join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!existsSync(p) || statSync(p).isDirectory()) { s.writeHead(404); return s.end('no'); }
  s.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  s.end(readFileSync(p));
});
await new Promise(r => srv.listen(8944, r));
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'] });

async function read(file, w = 1180, h = 900) {
  const pg = await br.newPage({ viewport: { width: w, height: h }, hasTouch: w < 700 });
  await pg.addInitScript(() => { try { localStorage.setItem('urm_gate', '1'); } catch (e) {} });
  try {
    await pg.goto(`http://127.0.0.1:8944/${file}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await pg.waitForTimeout(600);
    return await pg.evaluate(() => {
      const r = document.getElementById('r3030');
      if (!r) return { rail: false };
      const as = [...r.querySelectorAll('a')];
      const b = r.getBoundingClientRect();
      const cur = as.filter(a => a.hasAttribute('aria-current'));
      return { rail: true, y: Math.round(b.top + scrollY),
        labels: as.slice(1).map(a => (a.firstChild && a.firstChild.textContent || '').trim()),
        hrefs: as.map(a => a.getAttribute('href')),
        minTap: Math.min(...as.map(a => Math.round(a.getBoundingClientRect().height))),
        curCount: cur.length, cur: cur.length ? cur[0].getAttribute('href') : null,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
  } catch (e) { return { rail: false, err: String(e.message).slice(0, 60) }; }
  finally { await pg.close(); }
}

console.log('\n── D · driven: identical doors, identical place ──');
const reads = [];
for (const f of SURFACES) reads.push([f, await read(f)]);
const dead = reads.filter(([, r]) => !r.rail).map(([f, r]) => f + (r.err ? ' (' + r.err + ')' : ''));
ok(dead.length === 0, 'the rail mounts on every surface', dead.length ? '⛔ ABSENT: ' + dead.join(', ') : SURFACES.length);
const live = reads.filter(([, r]) => r.rail);
if (live.length) {
  const sets = [...new Set(live.map(([, r]) => r.labels.join('|')))];
  ok(sets.length === 1, '⛔ THE SAME DOORS IN THE SAME ORDER EVERYWHERE — this is the whole property; '
    + '"there is a nav" was already true of the build that prompted the complaint',
    sets.length === 1 ? sets[0].replace(/\|/g, ' · ') : sets.length + ' DIFFERENT SETS');
  const notTop = live.filter(([, r]) => r.y !== 0).map(([f, r]) => f + '@' + r.y);
  ok(notTop.length === 0, '…and at the very top of every one, so a visitor never hunts for it',
    notTop.length ? '⛔ ' + notTop.join(', ') : 'y=0 on all ' + live.length);
  const small = live.filter(([, r]) => r.minTap < 44).map(([f, r]) => f + ' ' + r.minTap + 'px');
  ok(small.length === 0, '…and every door clears the 44px tap floor',
    small.length ? '⛔ ' + small.join(', ') : 'min 44px');
  /* ⛔ EXACTLY ONE marked, and it must be the RIGHT one. Two marked is a lie about where you are,
   *   and zero is a rail that does not know. An answer page marks the door that owns it. */
  const owner = Object.fromEntries(ANSWERS.map(a => [a.file, a.owner]));
  const wrong = live.filter(([f, r]) => r.curCount !== 1 || r.cur !== '/' + (owner[f] || f))
    .map(([f, r]) => f + ' → ' + (r.curCount === 1 ? r.cur : r.curCount + ' marked'));
  ok(wrong.length === 0, '…and marks exactly one door — the page you are on, or the door that owns it',
    wrong.length ? '⛔ ' + wrong.join(', ') : live.map(([f, r]) => r.cur.replace('/', '')).join(' · '));
  /* ⚠ root-absolute, or the same rail resolves differently on the two hosts that serve these files */
  const rel = live.flatMap(([f, r]) => r.hrefs.filter(h => !h.startsWith('/')).map(h => f + ':' + h));
  ok(rel.length === 0, '…and every href is root-absolute, so it means the same thing on both hosts',
    rel.length ? '⛔ ' + rel.join(', ') : 'all absolute');
}

console.log('\n── E · a phone, where a fixed rail usually breaks something ──');
{
  const r = await read('substrate.html', 390, 600);
  ok(r.rail && r.overflow === 0,
    'at 390px the rail scrolls itself and does NOT push the document sideways',
    r.rail ? 'body overflow ' + r.overflow + 'px' : 'no rail');
  ok(r.rail && r.minTap >= 44, '…and the doors are still 44px', r.rail ? r.minTap + 'px' : '—');
}

/* ── F · ⛔ SABOTAGE — a guard that never engages guards nothing ───────────────────────────── */
console.log('\n── F · sabotage ──');
{
  const target = join(ROOT, 'toll.html');
  const orig = readFileSync(target, 'utf8');
  try {
    writeFileSync(target, orig.replace(/\s*<script[^>]+src=["'][^"']*rail3030\.js["']><\/script>/, ''));
    const r = await read('toll.html');
    ok(!r.rail, 'removing the tag from one surface leaves it with no rail — the check has something to see',
      r.rail ? '⛔ still mounted, so §C/§D cannot be measuring what they claim' : 'toll.html went dark');
  } finally {
    /* restore from the BYTES READ, never from git — this repo has lost uncommitted work to a
     * harness that restored with `git checkout --`. */
    writeFileSync(target, orig);
    ok(readFileSync(target, 'utf8') === orig, '…and the file is restored byte-identical');
  }
}

await br.close(); srv.close();
tally();
process.exit(fail ? 1 : 0);

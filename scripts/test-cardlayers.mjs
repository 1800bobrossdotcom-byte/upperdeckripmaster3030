#!/usr/bin/env node
/* ripmaster3030studios — guard for the LAYERED CARDS and the ARENA'S VS STRIKE.
 *
 *     node scripts/test-cardlayers.mjs            (npm run test:cardlayers)
 *
 * Two features, one script, because both are things that REPORT SUCCESS WHILE LOOKING WRONG —
 * which is the only kind of defect worth a headless browser.
 *
 * ══ 1 · THE LAYER SIDECARS ══════════════════════════════════════════════════════════════════
 *
 * ⚑ THE FAILURE THIS EXISTS FOR: a sidecar that loads, parses, resolves seven plates, passes
 *   every check — and renders a FLAT CARD. `scripts/png23d.mjs` writes `z` as a fraction of the
 *   card's HEIGHT; `js/card-layers.js` reads `z` as 0..1 through the card's THICKNESS. Passing
 *   the generator's numbers straight through put all seven plates inside 14% of the backing, i.e.
 *   visually co-planar. Nothing errored. `scripts/link-card-layers.mjs` rescales, and §1.3 below
 *   is what stops that rescale being quietly removed.
 *
 * ⚑ AND IT PINS THE ANTI-FAKE RULE. `js/card-layers.js`'s header is absolute: layers are not
 *   invented by segmenting flat art, and `load()` resolving to null is the NORMAL answer. §1.6
 *   asserts the shape that rule produces — a plate covering >90% of the frame is not a cut-out,
 *   it is the card, and a stack made of those is a stack that only pretends to separate. Measured
 *   on the four hero cards that were REJECTED for exactly this: 35 → 95.8%, 40 → 95.0%,
 *   46 → 98.3% (with an EMPTY 2 KB text plate), against 44 → 41.3% and 47 → 23.3%.
 *
 * ══ 2 · THE VS STRIKE ═══════════════════════════════════════════════════════════════════════
 *
 * The artist: "the vs animation is non existent in the arena". The trigger was never broken —
 * `.faceoff.show` was applied every time, the mark was on screen at 105×82 dead centre. What was
 * missing was the ANIMATION: `foVs` was a 1.1 s infinite `scale(1.09)` breathe, so the box
 * oscillated 105↔114 px and did nothing else, ever, in response to nothing. DESIGN-SYSTEM §9's
 * signature failure.
 *
 * ⚑ "DID IT MOVE" IS THE WEAK QUESTION — a fade-in passes it, and so does the breathe. The
 *   assertions that bite are the ones a lerp cannot fake: the mark starts ≥ 2× its settled size,
 *   and it OVERSHOOTS — dips BELOW settled and comes back up. An ease-out to the target never
 *   goes below it.
 *
 * ⚠ TIMING IS DRIVEN, NOT WAITED FOR. rAF in this container stalls for seconds at a time (nine
 *   frames in fifty-five seconds, measured while diagnosing this), so sampling on a clock
 *   measures the container. The strike is sampled by PAUSING its Animation and stepping
 *   `currentTime`, which is exact and frame-rate independent.
 * ⚠ Layout from screenshots is trustworthy here; colour is not (SwiftShader). Nothing below
 *   judges a pixel.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8938;
const SHOT = path.join(ROOT, 'build/preview');   // gitignored — see .gitignore

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log(`  ok   ${m}${d ? '  — ' + d : ''}`); }
                          else { fail++; console.log(`  FAIL ${m}${d ? '  — ' + d : ''}`); } };
const head = s => console.log('\n' + s);

/* ══ 1 · the sidecars, on disk ═════════════════════════════════════════════════════════════ */

const globalWin = { location: { href: 'https://ripmaster3030studios.com/cards/lens3d.html' } };
globalWin.window = globalWin;
new Function('window', 'globalThis', 'document', 'fetch', fs.readFileSync(path.join(ROOT, 'js/card-layers.js'), 'utf8'))
  .call(globalWin, globalWin, globalWin, undefined, undefined);
const CardLayers = globalWin.CardLayers;

const HERO = path.join(ROOT, 'cards/art/hero');
const sidecars = fs.readdirSync(HERO).filter(f => f.endsWith('.layers.json')).sort();

head(`1. layer sidecars — ${sidecars.length} found in cards/art/hero/`);
ok(sidecars.length > 0, 'at least one card is layered');

for (const f of sidecars) {
  const file = path.join(HERO, f);
  const base = 'https://x/cards/art/hero/' + f;
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { ok(false, `${f} parses`, e.message); continue; }

  const spec = CardLayers.normalize(raw, base);
  ok(!!spec, `${f} normalises to a spec`);
  if (!spec) continue;

  // 1.1 every plate exists ON DISK, resolved the way the browser resolves it
  let missing = [];
  for (const L of raw.layers || []) {
    const p = path.resolve(path.dirname(file), L.src || '');
    if (!fs.existsSync(p)) missing.push(L.src);
  }
  ok(missing.length === 0, `${f} every plate exists on disk`, missing.length ? missing.join(', ') : `${raw.layers.length} plates`);

  // 1.2 the art the sidecar is named for must itself exist — a sidecar for a deleted card is a
  //     stack nothing can ever reach, and CardLayers would happily resolve it
  const art = file.replace(/\.layers\.json$/, '.webp');
  ok(fs.existsSync(art), `${f} the flat art it describes exists`, path.basename(art));

  // 1.3 ⛔ THE CO-PLANAR TRAP. z must SPAN the thickness, not cluster near the backing.
  const zs = spec.layers.map(l => l.z);
  const span = Math.max(...zs) - Math.min(...zs);
  ok(span >= 0.6, `${f} z spans the card's thickness`, `span ${span.toFixed(3)} over [${zs.map(z => z.toFixed(2)).join(' ')}]`);
  ok(Math.max(...zs) > 0.66 && Math.min(...zs) < 0.34,
     `${f} the stack reaches both the backing and the glass`, `min ${Math.min(...zs).toFixed(2)} max ${Math.max(...zs).toFixed(2)}`);
  // the exact signature of the unscaled bug: png23d's own z is a fraction of card HEIGHT and lands
  // in 0..0.15, so "every plate under 0.2" means the rescale in link-card-layers.mjs was skipped
  ok(!(zs.length > 1 && Math.max(...zs) < 0.2), `${f} z is not still in the generator's units`);
  ok(new Set(zs).size === zs.length, `${f} no two plates share a z`, `${zs.length} distinct`);

  // 1.4 exactly one edge-to-edge backing, and it is the rearmost
  const sorted = spec.layers.slice().sort((a, b) => a.z - b.z);
  ok(sorted[0].fit === 'full', `${f} the rearmost plate is edge-to-edge`, sorted[0].id);

  /* 1.5 ⛔ EVERY TRIMMED PLATE CARRIES ITS RECT. png23d crops each cut-out to its own ink; a
   *     rect-less plate is drawn across the whole face, so a 17%-wide badge becomes a banner and a
   *     face fills the card. It renders, it 200s, it passes every other check here. */
  const rects = spec.layers.filter(l => l.rect).length;
  const trimmed = (raw.layers || []).filter(l => Array.isArray(l.rect) &&
    !(l.rect[0] === 0 && l.rect[1] === 0 && l.rect[2] === 1 && l.rect[3] === 1)).length;
  ok(rects === (raw.layers || []).filter(l => Array.isArray(l.rect)).length,
     `${f} every rect survives normalize`, `${rects} placed, ${trimmed} of them trimmed`);
  ok(trimmed === 0 || rects > 0, `${f} trimmed plates are placed, not stretched`);

  // 1.6 ⛔ THE ANTI-FAKE SHAPE — read off the generator's own manifest, which records coverage.
  const gen = raw.note && /models\/cards\/([^/]+)\//.exec(raw.note);
  if (gen) {
    const gf = path.join(ROOT, 'models/cards', gen[1], 'layers.json');
    if (fs.existsSync(gf)) {
      const g = JSON.parse(fs.readFileSync(gf, 'utf8'));
      const front = (g.layers || []).filter(l => !l.opaque);
      const worst = front.reduce((m, l) => Math.max(m, l.coverage || 0), 0);
      ok(worst <= 0.90, `${f} no plate is really just the whole card`, `largest cut-out ${(worst * 100).toFixed(1)}% of frame`);
      ok(front.length >= 2, `${f} has at least two plates in front of the backing`, `${front.length}`);
      const empty = front.filter(l => (l.coverage || 0) < 0.002).map(l => l.name);
      ok(empty.length === 0, `${f} no empty plate`, empty.length ? empty.join(', ') : 'all carry ink');
      // ⚑ the settings that made a stack must ship WITH it — models/README.md records what it cost
      //   to lose the fighter bake flags to prose. Older stacks predate the field; they only have
      //   to name their technique.
      ok(!!(g.command || g.method), `${f} its stack records how it was made`, g.command || g.method);
    }
  }
}

/* ══ the server + browser ══════════════════════════════════════════════════════════════════ */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.avif': 'image/avif' };
const srv = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]); if (p === '/') p = '/index.html';
  let d; try { d = fs.readFileSync(path.join(ROOT, p)); } catch { rs.writeHead(404); rs.end('nf'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); rs.end(d);
});
await new Promise(r => srv.listen(PORT, r));

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* ══ 2 · every linked card, fetched by the real reader over HTTP ═══════════════════════════ */

head('2. the browser reaches every plate');
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  await page.goto(`http://localhost:${PORT}/cards/lens3d.html?nogl=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.CardLayers, null, { timeout: 20000 });

  for (const f of sidecars) {
    const n = f.replace('.layers.json', '');
    const r = await page.evaluate(async n => {
      const art = new URL('art/hero/' + n + '.webp', location.href).href;
      const spec = await window.CardLayers.load(art);
      if (!spec) return { spec: null };
      const codes = await Promise.all(spec.layers.map(L =>
        fetch(L.src, { method: 'GET' }).then(r => r.status).catch(() => 0)));
      return { z: spec.layers.map(l => l.z), ids: spec.layers.map(l => l.id), codes,
               rects: spec.layers.map(l => l.rect ? l.rect.map(v => +v.toFixed(3)) : null),
               sidecar: window.CardLayers.sidecarUrl(art) };
    }, n);
    ok(!!r.z, `card ${n}: CardLayers.load returns a spec`);
    if (!r.z) continue;
    ok(r.codes.every(c => c === 200), `card ${n}: every plate 200s`, r.codes.join(' '));
    const span = Math.max(...r.z) - Math.min(...r.z);
    // ⚑ read back OUT OF THE BROWSER, not off the file — a 200 on the sidecar proves nothing
    //   about what the reader ended up with.
    ok(span >= 0.6, `card ${n}: z read back from the reader spans the thickness`,
       `[${r.z.map(z => z.toFixed(3)).join(' ')}]`);
    // and the plate BOXES survive the round trip — a stack of correct images in the wrong boxes
    // is the same card, ruined
    ok(r.rects.every(x => x), `card ${n}: every plate keeps its rect through the reader`,
       r.rects.map(x => x ? `${x[2]}×${x[3]}` : 'none').join(' '));
    console.log(`       ${n}: ${r.ids.join(' · ')}`);
  }
  ok(errs.length === 0, 'no page errors on the lens', errs.join(' | '));
  await ctx.close();
}

/* ══ 3 · the arena's VS strike ═════════════════════════════════════════════════════════════ */

head('3. the VS face-off fires, and the VS is STRUCK');
{
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards/manifest.json'), 'utf8'));
  const slugs = man.cards.slice(0, 8).map(c => c.slug);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  // ⚠ the hand IS the vault — with nothing owned, SLAM is disabled and no face-off can ever open.
  await page.addInitScript(([slugs]) => { try {
    localStorage.setItem('urm_admin_ok', '1');
    localStorage.setItem('urm_vault', JSON.stringify(slugs.map(s => ({ slug: s }))));
  } catch {} }, [slugs]);
  await page.goto(`http://localhost:${PORT}/cards/battle.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('#handRow .tile').length >= 3, null, { timeout: 30000 });

  await page.evaluate(() => [...document.querySelectorAll('#handRow .tile')].slice(0, 3).forEach(t => t.click()));
  ok(await page.evaluate(() => !document.getElementById('slamBtn').disabled), 'SLAM enables once a stack is staked');

  /* ⚑ HOVER IS THE WARM, AND THAT IS THE POINT OF THE HOVER. Reaching the button starts the 2.26 MB
   * engine parse; on pointerdown the same parse landed inside the VS beat and the strike never got
   * a painted frame. Waiting for `window.pc` here is both the assertion that the hover path works
   * and the reason the click below goes through `evaluate` — Playwright's click waits for the
   * element to be "stable", and a blocked main thread is not stable. */
  const wants3D = await page.evaluate(() => !!(window.CBFight3D && window.CBFight3D.webgl2()));
  await page.hover('#slamBtn').catch(() => {});
  const warmed = await page.waitForFunction(() => !!window.pc, null, { timeout: 120000 }).then(() => true, () => false);
  if (wants3D) ok(warmed, 'hovering SLAM warms the fight engine before the click');
  else console.log('       (no WebGL 2 here — the warm is a no-op by design, skipping that check)');

  await page.evaluate(() => document.getElementById('slamBtn').click());

  await page.waitForSelector('.faceoff.show', { timeout: 90000 });
  ok(true, '.faceoff.show is applied');

  const geom = await page.evaluate(() => {
    const fo = document.querySelector('.faceoff'), vs = fo.querySelector('.fo-vs-mark');
    const r = vs.getBoundingClientRect(), fr = fo.getBoundingClientRect();
    return { w: r.width, h: r.height, cx: r.x + r.width / 2, foCx: fr.x + fr.width / 2,
             display: getComputedStyle(fo).display,
             stacks: fo.querySelectorAll('.fo-bigcard').length,
             slash: getComputedStyle(vs, '::before').animationName,
             ring: getComputedStyle(vs, '::after').animationName,
             kick: getComputedStyle(fo.querySelector('.fo-vs')).animationName,
             names: vs.getAnimations().map(a => (a.animationName || '')).join(',') };
  });
  ok(geom.display === 'flex', 'the overlay is displayed', geom.display);
  ok(geom.w > 40 && geom.h > 30, 'the VS mark has a real box', `${geom.w.toFixed(0)}×${geom.h.toFixed(0)}`);
  ok(Math.abs(geom.cx - geom.foCx) < 12, 'the VS mark sits between the two stacks', `Δ${(geom.cx - geom.foCx).toFixed(1)}px`);
  ok(geom.stacks === 6, 'both card stacks are on the table', `${geom.stacks} cards`);
  ok(geom.names.includes('foVsStrike'), 'the mark runs the STRIKE, not a breathe', geom.names || '(none)');
  ok(geom.slash === 'foSlash', 'the scorch wipes out from the impact', geom.slash);
  ok(geom.ring === 'foVsRing', 'the impact leaves a shock ring', geom.ring);
  ok(geom.kick === 'foVsKick', 'the middle column takes the recoil', geom.kick);

  /* ⚑ THE MEASUREMENT. Pause the strike and step its own clock; nothing here waits on rAF.
   *   A fade-in, a lerp and the old 9% breathe all fail at least two of the three. */
  const sweep = await page.evaluate(() => {
    const vs = document.querySelector('.fo-vs-mark');
    const a = vs.getAnimations().find(x => x.animationName === 'foVsStrike');
    if (!a) return null;
    a.pause();
    const at = t => { a.currentTime = t; return vs.getBoundingClientRect().width; };
    const settled = at(2000);                       // past the end: the resting size
    const ts = [], ws = [];
    for (let t = 160; t <= 900; t += 20) { ts.push(t); ws.push(at(t)); }
    const first = at(162), last = at(900);
    a.play();
    return { settled, ts, ws, first, last };
  });
  ok(!!sweep, 'the strike is a real Animation we can step');
  if (sweep) {
    const { settled, ts, ws, first, last } = sweep;
    const max = Math.max(...ws), min = Math.min(...ws);
    const iMax = ws.indexOf(max), iMin = ws.indexOf(min);
    ok(first >= settled * 2.0, 'it arrives from far away', `${first.toFixed(0)}px vs ${settled.toFixed(0)}px settled (${(first / settled).toFixed(2)}×)`);
    ok(min < settled * 0.98, 'it OVERSHOOTS past its own size', `min ${min.toFixed(0)}px vs ${settled.toFixed(0)}px settled`);
    ok(iMin > iMax, 'the overshoot comes after the arrival', `max @${ts[iMax]}ms, min @${ts[iMin]}ms`);
    ok(Math.abs(last - settled) <= settled * 0.02, 'and it settles', `${last.toFixed(1)} vs ${settled.toFixed(1)}`);
    const after = ws.slice(iMin);
    ok(Math.max(...after) > min * 1.03, 'it rings back up rather than creeping in', `${min.toFixed(0)} → ${Math.max(...after).toFixed(0)}`);
  }

  ok(errs.length === 0, 'no page errors in the arena', errs.join(' | '));
  await ctx.close();

  /* ── the shot ────────────────────────────────────────────────────────────────────────────
   * ⚠ Taken in its OWN pass with the engine bundle blocked, and that is not cheating — it is the
   *   only way to photograph this beat here. The 3D fight covers the whole overlay from ~1.3 s in,
   *   and this container stalls the main thread for seconds at a time while the bundle parses, so
   *   by the time a screenshot call gets scheduled the fight has already started and the VS is
   *   underneath it. Blocked, `make3D()` resolves null and the fight takes the 2D path, which
   *   leaves the DOM face-off exactly as it looks in a browser during the VS beat. The strike's
   *   own clock is then held at 300 ms so the frame is reproducible rather than whatever rAF
   *   happened to land. */
  fs.mkdirSync(SHOT, { recursive: true });
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  const p2 = await ctx2.newPage();
  await p2.route('**/vendor/playcanvas/**', r => r.abort());
  await p2.addInitScript(([slugs]) => { try {
    localStorage.setItem('urm_admin_ok', '1');
    localStorage.setItem('urm_vault', JSON.stringify(slugs.map(s => ({ slug: s }))));
  } catch {} }, [slugs]);
  await p2.goto(`http://localhost:${PORT}/cards/battle.html`, { waitUntil: 'load' });
  await p2.waitForFunction(() => document.querySelectorAll('#handRow .tile').length >= 3, null, { timeout: 30000 });
  await p2.evaluate(() => {
    [...document.querySelectorAll('#handRow .tile')].slice(0, 3).forEach(t => t.click());
    document.getElementById('slamBtn').click();
  });
  await p2.waitForSelector('.faceoff.show', { timeout: 60000 });
  const held = await p2.evaluate(() => {
    const fo = document.querySelector('.faceoff');
    let n = 0;
    for (const el of [fo.querySelector('.fo-vs-mark'), fo.querySelector('.fo-vs'), ...fo.querySelectorAll('.fo-side, .fo-bigcard')])
      for (const a of (el ? el.getAnimations() : [])) { a.pause(); a.currentTime = 300; n++; }
    return { n, fight: !!fo.querySelector('canvas') };
  });
  await p2.screenshot({ path: path.join(SHOT, 'vs-strike.png') });
  console.log(`       shot: build/preview/vs-strike.png  (${held.n} animations held at 300 ms${held.fight ? ', fight layer already up' : ''})`);
  await ctx2.close();
}

await browser.close();
srv.close();

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);

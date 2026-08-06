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
 * ⚠ Layout from screenshots is trustworthy here; colour is not (SwiftShader). §4 measures LUMA
 *   and CONTRAST from screenshots, never hue.
 *
 * ══ 3 · THE FACE-OFF IS WATCHABLE ═══════════════════════════════════════════════════════════
 *
 * ⛔ §2 PASSED THROUGH TWO ROUNDS OF THE ARTIST REPORTING THE FACE-OFF AS BROKEN, and that is
 *    the lesson worth keeping. §2 asks whether ONE ELEMENT is present, centred and struck at ONE
 *    INSTANT. All of it was true the whole time. The three defects were about the OTHER
 *    elements, about the WHOLE FRAME, and about TIME:
 *      · `js/card-fight.js` presented the projectile canvas through `Gfx2D`, which is opaque by
 *        design, so an opaque GL layer covered the entire arena — cards, VS and totals — from
 *        the moment the fight began. That is the "quick blip of a black screen", and the cards
 *        were in the DOM, laid out and non-transparent, the entire time it was on screen. No DOM
 *        assertion can see this. Only the picture can, which is why §3 decodes screenshots.
 *      · the beat padded the CLOCK, not the MOTION: 1,820 ms of animation inside a 2,530 ms
 *        window, with 467 ms of it a single unbroken gap, and the last "beat" a 2.8% scale.
 *        Measured pre-fix: `108→1048 ██ · 1291→1691 ██ · 2158→2638 ██` = 72% motion.
 *      · and the page read straight through the overlay — 30% of its contrast survived.
 * ⚑ "THE VS ANIMATES" IS THE WEAK QUESTION, one level up from §2's own warning about fade-ins.
 *   The assertions that bite here are: is there INK where the arena is while the fight runs, is
 *   the window SPENT MOVING rather than merely long, and is the verdict still off-screen.
 * ⚠ TWO CLOCKS, AND THE WRONG ONE COSTS AN HOUR. `document.timeline.currentTime` is snapped to
 *   the LAST FRAME, so at 5 fps it quantises every duration to 200 ms and reported the old
 *   build's 163 ms reduce path as 1,317 ms — comfortably past a threshold it should have failed.
 *   Everything timed below uses `performance.now()`. The container's own timer latency is
 *   measured in the same window and subtracted, so the numbers stay properties of the code.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* ⚑ EPHEMERAL PORT, NOT A FIXED ONE. Several harnesses in this repo bind a server, and when two
 * run at once the second dies with EADDRINUSE — which reads as "the test hangs" or "the build is
 * broken", not as "pick another port". It cost real time this session, and a killed process leaves
 * the port held afterwards, so the next clean run fails too. `listen(0)` asks the OS for a free
 * one; nothing outside this file ever needs to know the number. */
let PORT = 0;
const SHOT = path.join(ROOT, 'build/preview');   // gitignored — see .gitignore

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log(`  ok   ${m}${d ? '  — ' + d : ''}`); }
                          else { fail++; console.log(`  FAIL ${m}${d ? '  — ' + d : ''}`); } };
const head = s => console.log('\n' + s);

/* ── reading a screenshot back ─────────────────────────────────────────────────────────────
 * §4 needs to know whether there is INK where the arena is, and no DOM query can answer that:
 * the cards were present, laid out and non-transparent the whole time an opaque GL canvas was
 * painted over them. Only the picture knows. Enough PNG decoder for Chromium's own output
 * (8-bit, non-interlaced) — no dependency, and the repo already parses binary formats by hand.
 * ⚠ Judge LAYOUT and VALUE from these, never HUE — this container's screenshot path rotates hue
 *   on canvas content (CLAUDE.md). Nothing below looks at a colour. */
function readPNG(file) {
  const b = fs.readFileSync(file);
  let o = 8, w = 0, h = 0, bd = 0, ct = 0; const idat = [];
  while (o + 8 <= b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (bd !== 8) throw new Error('unexpected bit depth ' + bd);
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : ct === 4 ? 2 : 0;
  if (!ch) throw new Error('unexpected colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++], line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prv = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, bb = prv[x], c = x >= ch ? prv[x - ch] : 0, v = line[x];
      if (f === 0) cur[x] = v; else if (f === 1) cur[x] = v + a; else if (f === 2) cur[x] = v + bb;
      else if (f === 3) cur[x] = v + ((a + bb) >> 1);
      else { const pa = Math.abs(bb - c), pb = Math.abs(a - c), pc = Math.abs(a + bb - 2 * c);
             cur[x] = v + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c); }
    }
  }
  return { w, h, ch, data: out };
}
/* mean luma and RMS contrast of a rectangle. RMS is the load-bearing one: a veil can be dark on
 * average and still let a wordmark read straight through it, and that is exactly what happened. */
function rectStats(im, x0, y0, x1, y1) {
  let n = 0, s = 0, s2 = 0, max = 0, min = 255;
  for (let y = Math.max(0, y0 | 0); y < Math.min(im.h, y1 | 0); y++)
    for (let x = Math.max(0, x0 | 0); x < Math.min(im.w, x1 | 0); x++) {
      const i = (y * im.w + x) * im.ch;
      const l = 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2];
      n++; s += l; s2 += l * l; if (l > max) max = l; if (l < min) min = l;
    }
  const mean = n ? s / n : 0;
  return { mean, rms: n ? Math.sqrt(Math.max(0, s2 / n - mean * mean)) : 0, max, min, n };
}

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
await new Promise(r => srv.listen(0, r));
PORT = srv.address().port;

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
  /* ⛔ THIS SEEDED FROM `cards/manifest.json` — the retired 196 — AND THE ARENA NO LONGER DEALS
   *   THEM. `cards/deck.html`'s header states the rule: that file is THE INK, the source pictures
   *   the press prints from, "not cards, do not present it as cards". The arena resolves the old
   *   set so a save is never destroyed, but it builds a HAND from the hundred only (artist, on the
   *   live arena: "still showing old cards in battle"). Seeded from the ink, this waited 30s for a
   *   hand that can no longer exist and timed out.
   * ⚑ SEEDING FROM THE DECK THE PLAYER ACTUALLY HAS is also what makes this test mean something:
   *   a fixture built from a source the product has stopped using tests a path nobody walks. */
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards/deck-manifest.json'), 'utf8'));
  const slugs = (man.cards || man).slice(0, 8).map(c => String(c.slug));
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
  await ctx2.close();

  /* ── 3b · reduced motion ─────────────────────────────────────────────────────────────────
   * ⚠ THE PSEUDO-ELEMENTS ARE THE TRAP. Naming `.fo-vs-mark` in the reduce block silences the
   *   glyph and leaves `::before` still wiping the scorch and `::after` still firing the shock
   *   ring — the loudest half of the impact, running alone, under the setting that asked for none
   *   of it. `getAnimations()` on the element does not see them, so this asks the computed style
   *   of each pseudo directly. The mark must still be THERE, at its resting size: reduced motion
   *   removes the motion, never the picture. */
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p3 = await ctx3.newPage();
  await p3.route('**/vendor/playcanvas/**', r => r.abort());
  await p3.addInitScript(([slugs]) => { try {
    localStorage.setItem('urm_admin_ok', '1');
    localStorage.setItem('urm_vault', JSON.stringify(slugs.map(s => ({ slug: s }))));
  } catch {} }, [slugs]);
  await p3.goto(`http://localhost:${PORT}/cards/battle.html`, { waitUntil: 'load' });
  await p3.waitForFunction(() => document.querySelectorAll('#handRow .tile').length >= 3, null, { timeout: 30000 });
  await p3.evaluate(() => {
    [...document.querySelectorAll('#handRow .tile')].slice(0, 3).forEach(t => t.click());
    document.getElementById('slamBtn').click();
  });
  await p3.waitForSelector('.faceoff.show', { timeout: 60000 });
  await p3.waitForTimeout(1600);                       // past the ember timer, which must not fire
  const r3 = await p3.evaluate(() => {
    const fo = document.querySelector('.faceoff'), vs = fo.querySelector('.fo-vs-mark');
    const b = vs.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), op: getComputedStyle(vs).opacity,
             mark: vs.getAnimations().length, wrap: fo.querySelector('.fo-vs').getAnimations().length,
             before: getComputedStyle(vs, '::before').animationName,
             after: getComputedStyle(vs, '::after').animationName,
             embers: document.querySelectorAll('.ember').length };
  });
  ok(r3.mark === 0 && r3.wrap === 0, 'reduce: the strike and the recoil are off', `${r3.mark} + ${r3.wrap} animations`);
  ok(r3.before === 'none' && r3.after === 'none', 'reduce: the scorch and the ring are off too',
     `::before ${r3.before}, ::after ${r3.after}`);
  ok(r3.embers === 0, 'reduce: no embers are thrown', `${r3.embers}`);
  ok(r3.w > 40 && r3.h > 30 && +r3.op === 1, 'reduce: the VS is still fully there', `${r3.w}×${r3.h} @ ${r3.op}`);
  await ctx3.close();
  console.log(`       shot: build/preview/vs-strike.png  (${held.n} animations held at 300 ms${held.fight ? ', fight layer already up' : ''})`);
  await ctx2.close();
}

/* ══ 4 · the face-off is WATCHABLE ═════════════════════════════════════════════════════════
 *
 * ⛔ EVERYTHING IN §3 PASSED ALL THE WAY THROUGH TWO ROUNDS OF THE ARTIST REPORTING THE FACE-OFF
 *    AS BROKEN, and it is worth being precise about why, because the same shape will happen
 *    again. §3 asks whether the VS mark is present, centred, and running a strike with an
 *    overshoot. All of that was true the whole time. It is a question about ONE ELEMENT AT ONE
 *    INSTANT, and the three defects were about the OTHER ELEMENTS, and about DURATION:
 *      · an opaque GPU layer painted flat black over the whole arena — the VS included — the
 *        moment the fight started (the "quick blip of a black screen");
 *      · 1.06 s of the 2.4 s "beat" was literal stillness, so the animation was still the 0.94 s
 *        entrance it had always been (the "vs animation should be about 2-3 seconds long");
 *      · and the page read straight through the overlay.
 * ⚑ "THE VS ANIMATES" IS THE WEAK QUESTION. §3's own header already says that about a fade-in;
 *   this is the same lesson one level up. The questions below are about the WHOLE FRAME and about
 *   TIME: is there ink where the arena is, is something moving throughout, and is the result
 *   still off-screen while the drama is supposed to be running.
 */
head('4. the face-off is watchable — ink, motion, and a veil that veils');
{
  /* ⛔ SECOND SEED, SAME FIX — and I patched §3's and stopped, which is this repo's own recorded
   *   "checking one of five is how the other four rot back in" committed inside the very edit
   *   that was supposed to prevent it. §4 shadows the outer `man`/`slugs` with its own read, so
   *   fixing §3 left this one seeding the retired 196 and it timed out waiting for a hand that
   *   can no longer exist. A shadowed binding is invisible to a reader who has already seen the
   *   name defined correctly further up. */
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards/deck-manifest.json'), 'utf8'));
  const slugs = (man.cards || man).slice(0, 8).map(c => String(c.slug));

  /* ⚠ SMALL VIEWPORT, DECOR OFF, ENGINE BLOCKED. Not to flatter the numbers — to get a frame
   *   rate at all. This container is SwiftShader, and at 1100×820 with the page's two
   *   full-screen decorative layers up it services ~1.7 rAF callbacks a second, at which point
   *   the beat's own frame gate correctly stops advancing and every duration below measures the
   *   container instead of the build. `.lm` and `.crt` are fixed washes BEHIND the overlay and
   *   nothing in the face-off depends on them. Measured: 1.7 fps → ~10 fps, which is enough for
   *   the gate to be satisfied inside every floor. The fps is measured and printed, and the one
   *   timing-sensitive assertion is skipped below 5 fps rather than reported as a failure. */
  const openArena = async (opts = {}) => {
    const c = await browser.newContext({ viewport: opts.viewport || { width: 460, height: 560 },
      reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
    const p = await c.newPage();
    await p.addInitScript(([slugs]) => { try {
      localStorage.setItem('urm_admin_ok', '1');
      localStorage.setItem('urm_vault', JSON.stringify(slugs.map(s => ({ slug: s }))));
    } catch {} }, [slugs]);
    await p.route('**/vendor/playcanvas/**', r => r.abort());     // force the 2D fight — the path that went black
    await p.goto(`http://localhost:${PORT}/cards/battle.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => document.querySelectorAll('#handRow .tile').length >= 3, null, { timeout: 30000 });
    // ⚠ only the timing passes hide the decor. The veil pass must measure the REAL page behind it.
    if (!opts.keepDecor) await p.addStyleTag({ content: '.lm,.crt{display:none!important}' });
    return { c, p };
  };
  /* ⚑ THE CONTAINER'S OWN TIMER LATENCY, MEASURED IN THE SAME WINDOW AND SUBTRACTED.
   *   Four chained zero-delay timeouts, started when the overlay opens, so they queue against
   *   exactly the load the beat is running under. Without this the reduce assertion is
   *   unusable: the old build's reduce path is 160 ms of floors, and this container stretched
   *   it to 1,567 ms — enough to sail past any fixed threshold that a fast machine (where the
   *   fixed build takes 1,240 ms) would also have to satisfy. Subtracting the latency makes the
   *   number a property of the code again, which is the only thing worth asserting on. */
  const LAT_PROBE = () => { window.__lat = -1; const t = performance.now(); let i = 0;
    const step = () => { if (++i >= 4) window.__lat = performance.now() - t; else setTimeout(step, 0); };
    setTimeout(step, 0); };

  /* ── 4.1 · the beat records itself ──────────────────────────────────────────────────────
   * Every animation inside the overlay is logged with its start on the DOCUMENT TIMELINE plus
   * its delay and duration, so the map of what is moving when is exact and does not depend on
   * when this script happens to look. ⚠ `startTime` is null until the browser gives the
   * animation one on its first frame, so each record is re-read until it is filled in — taking
   * it on first sighting yields null every time on a starved thread. */
  const { c: c4, p: p4 } = await openArena();
  await p4.evaluate(() => {
    window.__A = []; window.__T0 = null; window.__play = null; window.__banner = null; window.__frames = 0;
    const seen = new Map();
    window.__scan = () => {
      const fo = document.querySelector('.faceoff'); if (!fo) return;
      for (const [a, r] of seen) if (r.start == null && a.startTime != null) r.start = +a.startTime;
      for (const el of [fo, ...fo.querySelectorAll('*')]) {
        let list; try { list = el.getAnimations({ subtree: false }); } catch { continue; }
        for (const a of list) {
          if (seen.has(a)) continue;
          let t = {}; try { t = a.effect.getComputedTiming(); } catch {}
          const r = { name: a.animationName || 'js', on: (el.className || '') + '',
                      start: a.startTime == null ? null : +a.startTime,
                      delay: t.delay || 0, dur: t.activeDuration || t.duration || 0 };
          seen.set(a, r); window.__A.push(r);
        }
      }
    };
    setInterval(window.__scan, 25);
    (function tick() { window.__frames++; requestAnimationFrame(tick); })();
    new MutationObserver(() => { const fo = document.querySelector('.faceoff');
      if (fo && !fo.__t) { fo.__t = 1; window.__T0 = performance.now(); window.__f0 = window.__frames;
        new MutationObserver(() => { const b = fo.querySelector('#foBanner');
          if (b && b.textContent.trim() && window.__banner == null) {
            window.__banner = performance.now();
            // ⚑ read the DOM at the instant the verdict lands, not afterwards
            window.__cardsAtBanner = fo.querySelectorAll('#foYou .fo-cw').length;
          } }).observe(fo, { childList: true, subtree: true, characterData: true }); } })
      .observe(document.body, { childList: true });
    // when does the fight take the stage? that is the end of the beat.
    if (window.CardFight && window.CardFight.play) {
      const orig = window.CardFight.play.bind(window.CardFight);
      window.CardFight.play = function (...a) { window.__play = performance.now();
        try { return orig(...a); } catch (e) { window.__threw = String(e).slice(0, 200); throw e; } };
    }
  });
  await p4.evaluate(() => { [...document.querySelectorAll('#handRow .tile')].slice(0, 3).forEach(t => t.click());
    document.getElementById('slamBtn').click(); });
  await p4.waitForSelector('.faceoff.show', { timeout: 60000 });

  // ⚑ the black rectangle is photographed WHILE THE FIGHT IS RUNNING — that is the only window
  //   in which it existed, and it is the window nothing had ever looked at.
  await p4.waitForFunction(() => !!document.querySelector('.cf-hp'), null, { timeout: 90000 }).catch(() => {});
  await p4.waitForTimeout(700);
  fs.mkdirSync(SHOT, { recursive: true });
  const fightShot = path.join(SHOT, 'vs-fight.png');
  await p4.screenshot({ path: fightShot });
  const layers = await p4.evaluate(() => {
    const fo = document.querySelector('.faceoff');
    const src = fo && fo.querySelector('canvas.cf-cv');
    const box = fo && fo.querySelector('.fo-arena').getBoundingClientRect();
    return { gfx2d: fo ? fo.querySelectorAll('canvas.gfx2d-layer').length : -1,
             srcOpacity: src ? getComputedStyle(src).opacity : 'none',
             cards: fo ? fo.querySelectorAll('.fo-bigcard').length : 0,
             arena: box ? [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)] : null };
  });

  /* ⛔ 4.2 — THE BLACK RECTANGLE. `js/card-fight.js` handed the projectile canvas to `Gfx2D`,
   *   which asks for its GL context with `{alpha:false}` and hides the source. That is right for
   *   every other caller, where the 2D canvas IS the picture; `.cf-cv` is a transparent sheet
   *   over the DOM card stacks, so it painted flat black over the entire arena. The cards stayed
   *   in the DOM throughout, which is why every structural check kept passing. */
  ok(layers.gfx2d === 0, 'the fight canvas is NOT presented through Gfx2D',
     layers.gfx2d === 0 ? 'no gfx2d-layer in the overlay' : `${layers.gfx2d} opaque GL layer(s) over the arena`);
  ok(layers.srcOpacity !== '0', 'the fight canvas has not been hidden by a presenter', `opacity ${layers.srcOpacity}`);
  ok(layers.cards === 6, 'both stacks are still in the DOM during the fight', `${layers.cards} cards`);

  // and the picture itself — a screenshot, because "the cards are in the DOM" was TRUE while the
  // artist was looking at a black screen. Measured pre-fix: mean 0.7, rms 2.5.
  if (layers.arena) {
    const im = readPNG(fightShot);
    const [ax, ay, aw, ah] = layers.arena;
    const r = rectStats(im, Math.max(0, ax + 4), Math.max(0, ay + 4),
                        Math.min(im.w, ax + aw - 4), Math.min(im.h, ay + ah - 4));
    ok(r.mean > 8 && r.rms > 12, 'the arena has INK while the fight is running — not a black rectangle',
       `mean luma ${r.mean.toFixed(1)}, rms ${r.rms.toFixed(1)} (a black rectangle measured 0.7 / 2.5)`);
  }

  await p4.waitForFunction(() => window.__banner != null, null, { timeout: 120000 }).catch(() => {});
  await p4.evaluate(() => window.__scan());
  const M = await p4.evaluate(() => ({ A: window.__A, T0: window.__T0, play: window.__play,
    banner: window.__banner, cardsAtBanner: window.__cardsAtBanner, threw: window.__threw || null,
    fps: (window.__frames - (window.__f0 || 0)) / Math.max(0.001, (performance.now() - window.__T0) / 1000) }));

  /* 4.3 — THE VERDICT MUST NOT ARRIVE DURING THE DRAMA. A guard rather than a repro: the beat
   *   was already ~2.4 s of clock before this change, so this would not have caught the original
   *   defect. It catches the next one — anything that makes `CardFight.play()` reject, or that
   *   trims a beat, lands the banner early and this says so. `play()` is called inside a bare
   *   `try{}catch{}` in battle.html, so a throw there is silent by construction. */
  ok(!M.threw, 'CardFight.play() does not throw', M.threw || 'no throw');
  const beatMs = (M.play != null && M.T0 != null) ? M.play - M.T0 : -1;
  ok(beatMs >= 2400, 'the fight does not start before 2.4 s of face-off', `${Math.round(beatMs)} ms`);
  const bannerMs = (M.banner != null && M.T0 != null) ? M.banner - M.T0 : -1;
  ok(bannerMs >= 2400, 'the RESULT BANNER is not on screen before 2.4 s', `${Math.round(bannerMs)} ms`);
  /* ⚠ the staked cards must still exist when the verdict lands — they are what FLIES to the
   *   winner next, and a stack that has already been emptied cannot be animated across. */
  ok(M.cardsAtBanner === 3, "the player's staked cards are still in the DOM when the banner appears",
     `${M.cardsAtBanner} of 3`);

  /* ⛔ 4.4 — IS ANYTHING ACTUALLY MOVING? This is the assertion the whole section exists for.
   *   The union of every animation in the overlay, over the beat window. Pre-fix that union was
   *      0 → 940 ██ · 940 → 1567 ░░ · 1567 → 1967 ██ · 1967 → 2400 ░░ · 2400 → 2880 ██
   *   — 1.06 s of stillness, and the last "beat" was a 2.8% scale, ~18 px over 480 ms. */
  const spans = [];
  for (const a of M.A) {
    if (a.start == null || !(a.dur > 0) || !isFinite(a.dur)) continue;
    if (/^(cf-|gfx2d)/.test(a.on)) continue;                    // CardFight's own layer, not the beat
    const s = a.start - M.T0 + (a.delay || 0);
    if (s > beatMs + 40) continue;                              // only the face-off's beat
    spans.push([Math.max(0, s), s + a.dur]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  /* ⚑ THE MERGE TOLERANCE IS TWO MEASURED FRAMES, NOT 1 ms — and this file already made the
   *   argument, three paragraphs down, before applying it to the wrong thing. A beat that
   *   resolves on a timer and a next move that starts on the following frame are ~2 frames apart
   *   NO MATTER HOW THE CHOREOGRAPHY IS WRITTEN. At 2.5 rAF fps that is 800 ms of pure callback
   *   latency counted as dead air. Splitting one continuous move into two spans because the
   *   container blinked is measuring the container. */
  const frameMs = 1000 / Math.max(0.5, M.fps);
  const joinMs = Math.max(1, 2 * frameMs);
  const merged = [];
  for (const [s, e] of spans) { const l = merged[merged.length - 1];
    if (l && s <= l[1] + joinMs) l[1] = Math.max(l[1], e); else merged.push([s, e]); }
  const motion = merged.reduce((a, [s, e]) => a + (e - s), 0);
  const span = merged.length ? merged[merged.length - 1][1] - merged[0][0] : 0;
  let worstGap = 0;
  for (let i = 1; i < merged.length; i++) worstGap = Math.max(worstGap, merged[i][0] - merged[i - 1][1]);

  console.log(`       motion map (${M.fps.toFixed(1)} rAF fps): ` +
    merged.map(([s, e]) => `${Math.round(s)}→${Math.round(e)}`).join(' · '));
  ok(span >= 2400, 'the face-off MOVES for 2.4 s or more, end to end',
     `${Math.round(span)} ms from first movement to last`);
  /* ⚑ THE RATIO IS THE ASSERTION THAT BITES, AND A WORST-GAP THRESHOLD IS NOT.
   *   A gap in ms conflates two completely different things: dead air the BUILD leaves, and
   *   callback latency the CONTAINER adds. At 5.6 rAF fps a frame is 178 ms, so a beat resolving
   *   on a timer and the next move starting on the following frame are ~2 frames apart no matter
   *   how the choreography is written — the first draft of this assertion failed at 310 ms on a
   *   build whose moves overlap by 60–80 ms BY CONSTRUCTION.
   *   The fraction of the window that is animation does not have that problem: latency inflates
   *   the denominator a little, dead air guts the numerator. Pre-fix the beat was 1,820 ms of
   *   animation inside a 2,880 ms window = 0.63, and that is a property of the code — `wait(760)`
   *   behind a 400 ms flash is 360 ms of stillness at ANY frame rate. This build measures 0.85
   *   in this container and ~0.98 where frames are real. */
  const ratio = span > 0 ? motion / span : 0;
  /* ⛔ THIS ASSERTION FAILED ON UNCHANGED CODE ROUGHLY HALF THE TIME, AND THE NUMBERS SAY WHY.
   *   Five runs of the SAME tree, clean main, nothing touched:
   *       fps 3.4 -> 80% ok    fps 3.2 -> 86% ok
   *       fps 2.6 -> 74% FAIL  fps 2.5 -> 71% FAIL  fps 1.5 -> 75% FAIL
   *   The ratio tracks the container's frame rate monotonically. ⚑ AND THE COLUMN THAT PROVES IT
   *   IS THE NUMERATOR: motion was 2820 / 2723 / 2820 / 2747 / 2820 ms — it does not move,
   *   because animation durations live on the document timeline and a stall cannot shorten them.
   *   Only the WINDOW stretched: 3527 -> 3877. So `motion` is a property of the BUILD and `span`
   *   is a property of the CONTAINER, and dividing one by the other measures the container.
   * ⚑ SO THE BAR DEPENDS ON WHETHER THE FRAMES ARE REAL, and this file already had that policy —
   *   it just never wired this assertion into it (see the fps gate above; all five runs were
   *   under its 5 fps floor). Where frames are real the RATIO is the assertion, because it is the
   *   one that catches dead air the build leaves. Where they are not, the ratio cannot separate
   *   build from container, so the bar moves to MOTION, which is frame-rate independent and still
   *   fails a build that stops animating.
   * ⚠ NEVER A SILENT SKIP. Both numbers print either way, and the line says which bar it used —
   *   a test that quietly stops asserting is worse than one that fails. */
  const realFrames = M.fps >= 5;
  if (realFrames) {
    ok(ratio >= 0.78, 'and that span is SPENT MOVING, not waiting',
       `${(ratio * 100).toFixed(0)}% of the ${Math.round(span)} ms window is animation ` +
       `(${Math.round(motion)} ms; worst gap ${Math.round(worstGap)} ms) — the old beat was 63%`);
  } else {
    ok(motion >= 2400, 'and that span is SPENT MOVING, not waiting (motion bar — frames are not real here)',
       `${Math.round(motion)} ms of animation at ${M.fps.toFixed(1)} rAF fps; the ratio reads ` +
       `${(ratio * 100).toFixed(0)}% of a ${Math.round(span)} ms window (worst gap ` +
       `${Math.round(worstGap)} ms) and is NOT the bar below 5 fps — the old beat moved for 1820 ms`);
  }
  await c4.close();

  /* ── 4.5 · THE VEIL ─────────────────────────────────────────────────────────────────────
   * The overlay's top stop was `rgba(58,10,94,.62)`, and the arena page's biggest, brightest
   * object — its foil wordmark — sits exactly where the overlay is thinnest. The measurement is
   * taken on the SETTLED overlay with every animation paused, so it cannot be a fade caught
   * mid-flight, and it samples a band that holds only page-behind and never face-off content. */
  /* ⚠ FULL VIEWPORT AND THE DECOR LEFT ON, unlike the timing passes above. This one takes no
   *   timings — everything is paused before the shot — so it costs nothing to measure the page
   *   the player actually has behind the overlay, at a size where there is page to see. At
   *   460×560 the arena fills the frame and the only band left to sample is a sliver, which is
   *   how the first draft of this rated the OLD backdrop at a passing 13%. */
  const { c: c5, p: p5 } = await openArena({ viewport: { width: 1100, height: 820 }, keepDecor: true });
  const nakedShot = path.join(SHOT, 'vs-veil-naked.png');
  await p5.screenshot({ path: nakedShot });
  await p5.evaluate(() => { [...document.querySelectorAll('#handRow .tile')].slice(0, 3).forEach(t => t.click());
    document.getElementById('slamBtn').click(); });
  await p5.waitForSelector('.faceoff.show', { timeout: 60000 });
  await p5.waitForTimeout(2500);
  await p5.evaluate(() => { for (const a of document.getAnimations()) { try { a.pause(); } catch {} } });
  const veilShot = path.join(SHOT, 'vs-veil.png');
  await p5.screenshot({ path: veilShot });
  // the band above the weather line: page only, in both shots, at every viewport this runs at
  const band = await p5.evaluate(() => { const w = document.querySelector('.fo-weather');
    const r = w ? w.getBoundingClientRect() : null; return r ? Math.max(4, Math.round(r.top) - 6) : 90; });
  {
    const a = readPNG(nakedShot), b = readPNG(veilShot);
    const x0 = Math.round(a.w * 0.12), x1 = Math.round(a.w * 0.88);
    const naked = rectStats(a, x0, 4, x1, band), veiled = rectStats(b, x0, 4, x1, band);
    const kept = naked.rms > 0 ? veiled.rms / naked.rms : 0;
    ok(kept <= 0.16, 'the page does not read through the face-off',
       `${(kept * 100).toFixed(1)}% of the page's contrast survives ` +
       `(rms ${veiled.rms.toFixed(1)} of ${naked.rms.toFixed(1)}; it was 23%)`);
    ok(veiled.max < 50, 'and nothing behind it is still bright', `peak luma ${veiled.max.toFixed(0)} (was 74)`);
  }
  await c5.close();

  /* ── 4.6 · REDUCED MOTION GETS A FACE-OFF, NOT A SKIPPED ONE ────────────────────────────
   * ⛔ It used to collapse to ~160 ms, and "fast" is not what that is: measured on the old build,
   *   the first thing that moved under this setting was CardFight's own "K.O." callout, so a
   *   player with the OS preference on never saw the two stacks or their Σ totals at all — and
   *   `animateCount` needs ~450 ms just to finish counting them. The setting asks for no MOTION.
   *   It does not ask for no TIME. §3b already proves nothing animates; this proves it is
   *   nonetheless a face-off. */
  const { c: c6, p: p6 } = await openArena({ reduce: true });
  await p6.evaluate(probe => {
    window.__T0 = null; window.__play = null;
    new MutationObserver(() => { const fo = document.querySelector('.faceoff');
      if (fo && !fo.__t) { fo.__t = 1; window.__T0 = performance.now();
        new Function('return (' + probe + ')')()(); } })          // start the latency probe WITH the beat
      .observe(document.body, { childList: true });
    if (window.CardFight && window.CardFight.play) { const orig = window.CardFight.play.bind(window.CardFight);
      window.CardFight.play = function (...a) { window.__play = performance.now();
        window.__sig = [...document.querySelectorAll('.fo-sigma')].map(e => e.textContent).join('/');
        return orig(...a); }; }
  }, LAT_PROBE.toString());
  await p6.evaluate(() => { [...document.querySelectorAll('#handRow .tile')].slice(0, 3).forEach(t => t.click());
    document.getElementById('slamBtn').click(); });
  await p6.waitForSelector('.faceoff.show', { timeout: 60000 });
  await p6.waitForFunction(() => window.__play != null, null, { timeout: 60000 }).catch(() => {});
  await p6.waitForFunction(() => window.__lat >= 0, null, { timeout: 60000 }).catch(() => {});
  const R = await p6.evaluate(() => ({ hold: (window.__play != null && window.__T0 != null) ? window.__play - window.__T0 : -1,
                                       lat: window.__lat, sig: window.__sig || '' }));
  const held = R.hold - Math.max(0, R.lat);      // the code's own hold, with the container taken out
  ok(held >= 900, 'reduce: the face-off is HELD long enough to be read, not skipped',
     `${Math.round(held)} ms of held frame (${Math.round(R.hold)} ms wall clock minus ` +
     `${Math.round(R.lat)} ms of container timer latency) — the old path held ~160 ms`);
  /* ⚠ RELATIVE, NOT ABSOLUTE. The reduce floors sum to 1.24 s against the motion path's 2.6 s,
   *   but a `setTimeout` in this container lands ~180 ms late and there are four of them, so an
   *   absolute ceiling here measures the machine. What the claim actually means is "shorter than
   *   the full path", and both numbers come from the same container in the same run. */
  ok(beatMs > 0 && R.hold < beatMs, 'reduce: and it is still the FASTER path',
     `${Math.round(R.hold)} ms still vs ${Math.round(beatMs)} ms of motion`);
  // ⚑ the point of the hold: `animateCount` runs on a 28 ms setInterval and needs ~450 ms, so a
  //   160 ms hold handed the fight a pair of totals that were still counting.
  ok(/^\d+\/\d+$/.test(R.sig) && !/(^|\/)0$/.test(R.sig),
     'reduce: both Σ totals have finished counting before the fight starts', R.sig || '(none)');
  await c6.close();
}

await browser.close();
srv.close();

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);

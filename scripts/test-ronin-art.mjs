/* NEON RONIN — the art direction's acceptance measurements.  `npm run test:roninart`
 *
 * docs/RONIN-ART.md states, for the FIGHTER, the STAGE and the IMPACT, what the thing is made of,
 * how it is lit, what moves and why it physically moved, what it sits on, and the acceptance
 * measurement. This file IS the acceptance measurement. Everything it prints is read off the
 * shipped renderer through `Ronin3D.probe`, which draws with the same `drawFighter`/`drawScene`
 * the game uses — a probe with its own copy of the draw path measures the copy, and the copy is
 * what drifts.
 *
 * ⚠ COLOUR COMES FROM readPixels, NEVER FROM A SCREENSHOT. This container rotates hue on canvas
 *   content (CLAUDE.md), so a hue measured off a PNG is meaningless here. `probe` renders into its
 *   own framebuffer and reads it back, which is the only trustworthy path for the foil claim.
 * ⚠ Frame timing is not measured here at all. It is SwiftShader; timings would be relative-only
 *   and this file makes absolute assertions.
 *
 * ⛔ THE ASSERTIONS ARE CHOSEN SO THAT THE OLD BEHAVIOUR FAILS THEM. "Did it move" is the weak
 *   question — a global transform passes it. The ones that bite are: foil hue travel AND ink hue
 *   stillness in the same scene (a test that only proves the foil moves cannot catch foil leaking
 *   onto the ink); soft-goods LAG and OVERSHOOT and PROPAGATION ORDER (a lerp passes "it moved"
 *   and fails all three); a ribbon whose segment points at the camera (the old x-y perpendicular
 *   is exactly zero there); and near:far parallax (a backdrop painted at one depth reports 1.00).
 */
import http from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build/ronin-art');
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
  '.skn': 'application/octet-stream', '.wld': 'application/octet-stream', '.obj': 'text/plain' };

// ⚑ Ephemeral port. Several harnesses in this repo bind a server and a fixed one dies with
//   EADDRINUSE when two run at once, which reads as "the test hangs".
const srv = http.createServer((rq, rs) => {
  const p = decodeURIComponent(rq.url.split('?')[0]);
  let d = null;
  try { d = readFileSync(join(ROOT, p)); } catch { rs.writeHead(404); rs.end('nf'); return; }
  rs.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); rs.end(d);
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let pass = 0, fail = 0;
const notes = [];
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}${detail ? '   ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? '   ' + detail : ''}`); }
}
const f2 = n => (Math.round(n * 100) / 100).toFixed(2);

// ── pixel helpers, run here rather than in the renderer: analysis does not belong in ship code ──
function rgb2hue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return null;                                   // achromatic: no meaningful hue
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}
const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// binary silhouette mask from a probe rendered on a black field
function maskOf(shot, thr = 22) {
  const { size, px } = shot, m = new Uint8Array(size * size);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) if (luma(px[i], px[i + 1], px[i + 2]) > thr) m[j] = 1;
  return { size, m };
}
function bbox(mask) {
  const { size, m } = mask; let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y * size + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, empty: x1 < 0 };
}
function area(mask) { let n = 0; for (const v of mask.m) n += v; return n; }
// resample a mask's bounding box into a fixed grid — SHAPE alone, with size and position removed
function normal(mask, G = 48) {
  const bb = bbox(mask); const out = new Uint8Array(G * G);
  if (bb.empty) return { size: G, m: out };
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const sx = bb.x0 + Math.floor((x + 0.5) / G * bb.w), sy = bb.y0 + Math.floor((y + 0.5) / G * bb.h);
    out[y * G + x] = mask.m[sy * mask.size + sx];
  }
  return { size: G, m: out };
}
function iou(a, b) {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.m.length; i++) { const p = a.m[i], q = b.m[i]; if (p && q) inter++; if (p || q) uni++; }
  return uni ? inter / uni : 1;
}
function centroidX(mask) {
  let s = 0, n = 0;
  for (let y = 0; y < mask.size; y++) for (let x = 0; x < mask.size; x++) if (mask.m[y * mask.size + x]) { s += x; n++; }
  return n ? s / n : null;
}
function writePGM(mask, name) {                                // an eyeballable artefact per archetype
  const { size, m } = mask, head = Buffer.from(`P5\n${size} ${size}\n255\n`);
  const body = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) body[y * size + x] = m[(size - 1 - y) * size + x] ? 255 : 0;
  writeFileSync(join(OUT, name + '.pgm'), Buffer.concat([head, body]));
}

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const pageErrs = [];
page.on('pageerror', e => pageErrs.push(String(e && e.message || e).slice(0, 160)));
await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
await page.goto(`http://localhost:${PORT}/ronin.html`, { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(6000);                               // let the .skn bodies land

console.log('\n══ NEON RONIN — ART DIRECTION ACCEPTANCE ' + '═'.repeat(38));
console.log('   docs/RONIN-ART.md · colour from readPixels, never a screenshot\n');

const live = await page.evaluate(() => !!(window.Ronin3D && Ronin3D.ok && Ronin3D.probe));
ok(live, 'renderer + probe are live');
if (!live) { console.log('\n  renderer did not come up — nothing further can be measured'); await browser.close(); srv.close(); process.exit(1); }

/* ── the cast, and a canonical pose ────────────────────────────────────────────────────────────
 * Every archetype is captured in the SAME pose from the SAME camera; the only difference between
 * two captures is the character. The pose is the ready stance, built here rather than taken from a
 * live match so the measurement cannot drift with combat tuning. */
const ROSTER = await page.evaluate(() => (window.__rn && window.__rn._rosterUnlocked) ? null : null)
  .then(() => ['ronin', 'kappa', 'doomer', 'oni', 'kunoichi', 'prizm',
               'rip-mascot', 'cc0-mosh', 'cc0-cel', 'cc0-grid', 'cc0-lank', 'cc0-squat', 'cc0-lump']);

const POSE = `(arch) => {
  const r = { lean:0.05, leanV:0, head:0, headV:0, aF:2.35, aFV:0, eF:0.35, eFV:0, aB:2.10, aBV:0, eB:0.45, eBV:0,
              hF:0.18, hFV:0, kF:0, kFV:0, hB:-0.18, hBV:0, kB:0, kBV:0, sw:2.70, swV:0, bob:0, bobV:0,
              bodyRot:0, bodyRotV:0 };
  const A = (window.__rn && window.__rn.ARCH) || null;
  return { id:'probe-'+arch, arch, a: (A && A[arch]) || {}, col:'#c9d2e6', tint:'#9fb0d0',
           weapon:'katana', state:'idle', stT:0, glow:0, x:0, z:0, yLift:0, air:false, dead:false,
           face:1, spin:0, rig:r };
}`;

// ── 1 · SILHOUETTE DISTINCTNESS ───────────────────────────────────────────────────────────────
const shots = {};
for (const arch of ROSTER) {
  const shot = await page.evaluate(([arch, poseSrc]) => {
    const mk = eval('(' + poseSrc + ')');
    return Ronin3D.probe({ f: mk(arch), size: 160, az: 0.20, dist: 4.6, hgt: 1.55, look: 1.45 });
  }, [arch, POSE]);
  shots[arch] = shot;
}
console.log('── 1 · SILHOUETTE, measured pairwise (RONIN-ART §1.5)');
const masks = {}, norms = {}, sizes = {};
let missing = [];
for (const a of ROSTER) {
  if (!shots[a]) { missing.push(a); continue; }
  masks[a] = maskOf(shots[a]); norms[a] = normal(masks[a]); sizes[a] = area(masks[a]);
  writePGM(masks[a], 'sil-' + a);
}
ok(missing.length === 0, 'every archetype rendered a silhouette', missing.length ? 'missing: ' + missing.join(',') : ROSTER.length + ' bodies');
const cast = ROSTER.filter(a => masks[a]);
const empty = cast.filter(a => sizes[a] < 60);
ok(empty.length === 0, 'no archetype renders empty', empty.length ? 'empty: ' + empty.join(',') : 'min coverage ' + Math.min(...cast.map(a => sizes[a])) + 'px');

const pairs = [];
for (let i = 0; i < cast.length; i++) for (let j = i + 1; j < cast.length; j++) {
  const a = cast[i], b = cast[j];
  pairs.push({ a, b, raw: iou(masks[a], masks[b]), norm: iou(norms[a], norms[b]) });
}
pairs.sort((x, y) => y.norm - x.norm);
const meanRaw = pairs.reduce((s, p) => s + p.raw, 0) / pairs.length;
const meanNorm = pairs.reduce((s, p) => s + p.norm, 0) / pairs.length;
console.log(`   ${cast.length} bodies · ${pairs.length} pairs · mean IoU raw ${f2(meanRaw)} · shape-only ${f2(meanNorm)}`);
console.log('   most confusable (shape-only IoU — 1.00 would be identical):');
for (const p of pairs.slice(0, 5)) console.log(`     ${p.norm.toFixed(3)}  ${p.a} / ${p.b}   (raw ${p.raw.toFixed(3)})`);
console.log('   most distinct:');
for (const p of pairs.slice(-3).reverse()) console.log(`     ${p.norm.toFixed(3)}  ${p.a} / ${p.b}   (raw ${p.raw.toFixed(3)})`);
ok(meanRaw < 0.72, 'mean raw silhouette IoU below 0.72', f2(meanRaw));
ok(pairs[0].norm < 0.94, 'no two bodies share a shape (worst shape-only IoU < 0.94)', `${f2(pairs[0].norm)} — ${pairs[0].a}/${pairs[0].b}`);
notes.push(`silhouette: mean raw IoU ${f2(meanRaw)}, shape-only ${f2(meanNorm)}; worst pair ${pairs[0].a}/${pairs[0].b} at ${f2(pairs[0].norm)}`);

// ── 2 · INK IS STEPPED ────────────────────────────────────────────────────────────────────────
console.log('\n── 2 · INK IS STEPPED, foil is not (RONIN-ART §1.1)');
{
  const shot = shots['cc0-lump'] || shots['ronin'];
  const { size, px } = shot;
  // interior only: strip the outer 3px of the mask so the die edge's own gradient is excluded
  const m = maskOf(shot).m, hist = new Map();
  let n = 0;
  for (let y = 3; y < size - 3; y++) for (let x = 3; x < size - 3; x++) {
    const j = y * size + x;
    if (!m[j] || !m[j - 1] || !m[j + 1] || !m[j - size] || !m[j + size]) continue;
    const i = j * 4, l = Math.round(luma(px[i], px[i + 1], px[i + 2]));
    hist.set(l, (hist.get(l) || 0) + 1); n++;
  }
  // count the levels that actually carry the surface: those holding ≥2% of interior pixels
  const levels = [...hist.entries()].filter(([, c]) => c >= n * 0.02).length;
  const spread = hist.size;
  console.log(`   interior pixels ${n} · distinct luma values ${spread} · levels carrying ≥2% each: ${levels}`);
  ok(n > 400, 'the ink sample has a real surface to measure', n + 'px');
  ok(levels <= 12, 'ink resolves into ≤12 value steps', levels + ' steps');
  notes.push(`ink: ${levels} value steps carry the surface (${spread} distinct luma values in ${n}px)`);
}

// ── 3 · FOIL TRAVELS, INK DOES NOT ────────────────────────────────────────────────────────────
console.log('\n── 3 · FOIL HUE TRAVEL vs INK STILLNESS (RONIN-ART §2.5)');
{
  const AZ = [-0.5, -0.25, 0, 0.25, 0.5];
  const stage = [];
  for (const az of AZ) {
    const s = await page.evaluate(az => Ronin3D.probe({ stage: true, size: 128, az, dist: 9, hgt: 2.6, look: 2.0 }), az);
    stage.push(s);
  }
  // sample the card: a horizontal strip below the horizon, away from the guilloche lines
  function cardHues(shot) {
    const { size, px } = shot, hs = [];
    for (let y = Math.floor(size * 0.10); y < Math.floor(size * 0.34); y += 2)
      for (let x = Math.floor(size * 0.12); x < Math.floor(size * 0.88); x += 2) {
        const i = (y * size + x) * 4, h = rgb2hue(px[i], px[i + 1], px[i + 2]);
        if (h != null && luma(px[i], px[i + 1], px[i + 2]) > 8) hs.push(h);
      }
    return hs;
  }
  const perAz = stage.map(cardHues);
  ok(perAz.every(h => h.length > 200), 'the card presents a measurable surface at every azimuth',
    perAz.map(h => h.length).join('/') + ' samples');
  // travel = the largest hue swing any single sample point makes across the sweep
  let travel = 0, n = Math.min(...perAz.map(h => h.length));
  for (let i = 0; i < n; i++) {
    let lo = 1e9, hi = -1e9;
    for (const h of perAz) { const v = h[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    let d = 0;
    for (const h of perAz) for (const g of perAz) d = Math.max(d, angDiff(h[i], g[i]));
    if (d > travel) travel = d;
  }
  const medTravel = (() => {
    const all = [];
    for (let i = 0; i < n; i++) { let d = 0; for (const h of perAz) for (const g of perAz) d = Math.max(d, angDiff(h[i], g[i])); all.push(d); }
    all.sort((a, b) => a - b); return all[Math.floor(all.length / 2)];
  })();
  console.log(`   foil floor · median hue travel ${f2(medTravel)}° · max ${f2(travel)}° across az ${AZ.join(', ')}`);
  ok(medTravel >= 60, 'foil hue travels ≥60° with the view (DESIGN-SYSTEM §1 acceptance)', f2(medTravel) + '°');
  notes.push(`foil: median hue travel ${f2(medTravel)}° across ±0.5 rad of azimuth (max ${f2(travel)}°)`);

  // ⛔ THE OTHER HALF: ink in the SAME scene must NOT travel. A test that only proves the foil
  //    moves cannot catch foil leaking onto the ink, which is the failure §1 names as harmful.
  const inkShots = [];
  for (const az of [-0.4, 0, 0.4]) {
    const s = await page.evaluate(([az, poseSrc]) => {
      const mk = eval('(' + poseSrc + ')');
      return Ronin3D.probe({ f: mk('cc0-lump'), size: 128, az, dist: 4.6, hgt: 1.55, look: 1.45 });
    }, [az, POSE]);
    inkShots.push(s);
  }
  // one fixed body point, tracked across the three views: the torso centre of the bbox
  function inkHue(shot) {
    const mk = maskOf(shot), bb = bbox(mk); if (bb.empty) return null;
    const hs = [];
    for (let y = bb.y0 + Math.floor(bb.h * 0.45); y < bb.y0 + Math.floor(bb.h * 0.62); y++)
      for (let x = bb.x0 + Math.floor(bb.w * 0.38); x < bb.x0 + Math.floor(bb.w * 0.62); x++) {
        const i = (y * shot.size + x) * 4;
        if (!mk.m[y * shot.size + x]) continue;
        const h = rgb2hue(shot.px[i], shot.px[i + 1], shot.px[i + 2]);
        if (h != null) hs.push(h);
      }
    if (!hs.length) return null;
    hs.sort((a, b) => a - b); return hs[Math.floor(hs.length / 2)];
  }
  const inkH = inkShots.map(inkHue).filter(h => h != null);
  let inkTravel = 0;
  for (const a of inkH) for (const b of inkH) inkTravel = Math.max(inkTravel, angDiff(a, b));
  console.log(`   ink torso · hue travel ${f2(inkTravel)}° across the same sweep (hues ${inkH.map(h => h.toFixed(1)).join(', ')})`);
  ok(inkH.length === 3, 'the ink sample resolved at every azimuth', inkH.length + '/3');
  ok(inkTravel <= 8, 'ink does NOT travel — foil has not leaked onto a flat face', f2(inkTravel) + '°');
  notes.push(`ink: hue travel ${f2(inkTravel)}° in the same sweep (foil ${f2(medTravel)}°) — the confinement holds`);

  /* The floor and the fighter run DIFFERENT foil branches (GND_FS and LIT_FS), so proving one
   * says nothing about the other. A bare swatch of the fighter's own foil material, same sweep. */
  const swatch = [];
  for (const az of [-0.6, -0.3, 0, 0.3, 0.6]) {
    const s = await page.evaluate(az => Ronin3D.probe({ foil: 2, size: 96, az, dist: 5.2, hgt: 1.45, look: 1.45 }), az);
    /* the CENTRE of the sphere — the same surface point, facing the camera, at every azimuth.
     * ⚠ R = 2, i.e. a 5×5 window. At R = 9 the window covered 37% of the sphere's radius, over
     * which the normal tilts ~22° and the grating phase sweeps most of a cycle — so the median
     * hue inside it sat near the middle of the colour wheel at EVERY azimuth and reported 17°
     * of travel for a surface measured, pixel by pixel, to swing 142°. A view-dependent effect
     * has to be sampled at a point, not over an area that averages the effect away. */
    const hs = [], n = s.size, c = n >> 1, R = 2;
    for (let y = c - R; y <= c + R; y++) for (let x = c - R; x <= c + R; x++) {
      const i = (y * n + x) * 4;
      if (luma(s.px[i], s.px[i + 1], s.px[i + 2]) < 14) continue;
      const h = rgb2hue(s.px[i], s.px[i + 1], s.px[i + 2]); if (h != null) hs.push(h);
    }
    hs.sort((a, b) => a - b); swatch.push(hs.length ? hs[Math.floor(hs.length / 2)] : null);
  }
  const sh = swatch.filter(h => h != null);
  let swTravel = 0; for (const a of sh) for (const b of sh) swTravel = Math.max(swTravel, angDiff(a, b));
  console.log(`   fighter foil (blade/tsuba/obi material) · hue travel ${f2(swTravel)}° over az ±0.6`);
  ok(sh.length === 5, 'the foil swatch resolved at every azimuth', sh.length + '/5');
  ok(swTravel >= 45, 'the FIGHTER foil walks too — a separate shader branch from the floor', f2(swTravel) + '°');
  notes.push(`fighter foil: hue travel ${f2(swTravel)}° (blade/tsuba/obi run LIT_FS, the floor runs GND_FS — both measured)`);
}

// ── 4 · NOTHING MOVES ON ITS OWN ──────────────────────────────────────────────────────────────
console.log('\n── 4 · NOTHING MOVES ON ITS OWN (RONIN-ART §0, DESIGN-SYSTEM §4)');
{
  const rest = await page.evaluate(poseSrc => {
    const mk = eval('(' + poseSrc + ')');
    const f = mk('kunoichi'), G = { fighters: [f] };
    for (let i = 0; i < 240; i++) Ronin3D.step(G, 0.016);      // four seconds of standing perfectly still
    const s = Ronin3D.soft(f);
    return { max: Math.max(...s.nodes.map(n => Math.max(Math.abs(n.x), Math.abs(n.y)))),
             maxV: Math.max(...s.nodes.map(n => Math.max(Math.abs(n.vx), Math.abs(n.vy)))) };
  }, POSE);
  console.log(`   after 4.0 s of a motionless fighter · max node offset ${rest.max.toExponential(2)} · max velocity ${rest.maxV.toExponential(2)}`);
  ok(rest.max === 0, 'every soft-goods node is EXACTLY 0 at rest', String(rest.max));
  ok(rest.maxV === 0, 'every soft-goods node velocity is EXACTLY 0 at rest', String(rest.maxV));
  notes.push(`rest: soft nodes hold at exactly 0.000 through 4 s of stillness (the scarf and the shards used to run on t3)`);
}

// ── 5 · SOFT GOODS LAG, OVERSHOOT AND PROPAGATE ───────────────────────────────────────────────
console.log('\n── 5 · THE CLOTH IS A RIG, NOT A LERP (RONIN-ART §1.5)');
{
  const r = await page.evaluate(poseSrc => {
    const mk = eval('(' + poseSrc + ')');
    const f = mk('kunoichi'), G = { fighters: [f] };
    Ronin3D.step(G, 0.016);                                    // seed the previous-position tracker
    const dt = 1 / 120, trace = [[], [], [], []];               // body + scarf nodes 3,4,5
    for (let i = 0; i < 240; i++) {
      // a dash: two frames of hard acceleration, then coast. The body's own motion is the ONLY input.
      f.x += 6.4;                                              // ONE Δv at t=0, then constant velocity
      Ronin3D.step(G, dt);
      const s = Ronin3D.soft(f), t = i * dt;
      trace[0].push({ t, v: Math.abs(s.vx - (i ? 768 : 0)) });   // the body's own Δv, for the lag comparison
      for (let k = 0; k < 3; k++) trace[k + 1].push({ t, v: s.nodes[3 + k].x, a: Math.abs(s.nodes[3 + k].x) });
    }
    const peak = arr => arr.reduce((b, p) => (p.a != null ? p.a : p.v) > ((b.a != null ? b.a : b.v)) ? p : b, arr[0]);
    const bp = peak(trace[0]);
    const n0 = peak(trace[1]), n1 = peak(trace[2]), n2 = peak(trace[3]);
    // overshoot: after the peak, does the node cross back past zero (a spring) or ease to it (a lerp)?
    const after = trace[1].filter(p => p.t > n0.t);
    const sgn = Math.sign(n0.v);
    const over = after.reduce((m, p) => Math.min(m, p.v * sgn), 0);
    return { bodyPeakT: bp.t, n0: n0.t, n1: n1.t, n2: n2.t, amp0: n0.v, overshoot: over };
  }, POSE);
  console.log(`   the body's velocity step lands at ${(r.bodyPeakT * 1000).toFixed(0)} ms`);
  console.log(`   scarf node peaks: n+0 ${(r.n0 * 1000).toFixed(0)} ms · n+1 ${(r.n1 * 1000).toFixed(0)} ms · n+2 ${(r.n2 * 1000).toFixed(0)} ms`);
  console.log(`   peak amplitude ${f2(r.amp0)} px · return overshoot ${f2(r.overshoot)} px past zero`);
  ok(Math.abs(r.amp0) > 0.5, 'the cloth actually moves when the body accelerates', f2(r.amp0) + 'px');
  ok(r.n0 > r.bodyPeakT, 'the cloth LAGS the body (a rigid attachment cannot)', `${(r.n0 * 1000).toFixed(0)} > ${(r.bodyPeakT * 1000).toFixed(0)} ms`);
  ok(r.n1 > r.n0 && r.n2 > r.n1, 'the shove PROPAGATES down the chain, n+2 later than n+1',
    [r.n0, r.n1, r.n2].map(t => (t * 1000).toFixed(0) + 'ms').join(' → '));
  ok(r.overshoot < -0.02, 'the return OVERSHOOTS past zero — a spring, not a lerp', f2(r.overshoot) + 'px');
  notes.push(`cloth: lag ${(r.n0 * 1000 - r.bodyPeakT * 1000).toFixed(0)} ms behind the body, propagation ${[r.n0, r.n1, r.n2].map(t => (t * 1000).toFixed(0)).join('→')} ms, overshoot ${f2(r.overshoot)} px`);
}

// ── 6 · HITSTOP HOLDS THE FRAME ───────────────────────────────────────────────────────────────
console.log('\n── 6 · HITSTOP HOLDS THE FRAME (RONIN-ART §1.3)');
{
  const r = await page.evaluate(poseSrc => {
    const mk = eval('(' + poseSrc + ')');
    const f = mk('ronin'), G = { fighters: [f] };
    Ronin3D.step(G, 0.016);
    for (let i = 0; i < 6; i++) { f.x += 7; Ronin3D.step(G, 1 / 120); }
    const before = Ronin3D.soft(f).nodes.map(n => [n.x, n.y]);
    // hitstop: the game freezes the sim, so the renderer is handed dt = 0
    for (let i = 0; i < 8; i++) { Ronin3D.step(G, 0); }
    const after = Ronin3D.soft(f).nodes.map(n => [n.x, n.y]);
    let d = 0;
    for (let i = 0; i < before.length; i++) d = Math.max(d, Math.abs(before[i][0] - after[i][0]), Math.abs(before[i][1] - after[i][1]));
    // and the moment it resumes, it must move again — a freeze that never thaws is a different bug
    Ronin3D.step(G, 1 / 120);
    const thawed = Ronin3D.soft(f).nodes.map(n => [n.x, n.y]);
    let t = 0;
    for (let i = 0; i < before.length; i++) t = Math.max(t, Math.abs(after[i][0] - thawed[i][0]), Math.abs(after[i][1] - thawed[i][1]));
    return { frozen: d, thaw: t };
  }, POSE);
  console.log(`   8 hitstop frames · max node movement ${r.frozen.toExponential(2)} · movement on the next live frame ${f2(r.thaw)}`);
  ok(r.frozen === 0, 'the cloth does NOT move through hitstop', String(r.frozen));
  ok(r.thaw > 0, 'and it resumes the frame hitstop ends', f2(r.thaw));
  notes.push('hitstop: the renderer clock stops with the simulation (it advanced on a hard-coded 0.016 before)');
}

// ── 7 · CAMERA SHAKE IS A BLOW, NOT NOISE ─────────────────────────────────────────────────────
console.log('\n── 7 · CAMERA SHAKE IS A DECAYING BLOW (RONIN-ART §3.5)');
{
  const r = await page.evaluate(() => {
    const G = { shake: 0 };
    Ronin3D.shake(G, 1 / 120, 1);
    G.shake = 12;                                              // a knockdown
    const tr = [];
    for (let i = 0; i < 90; i++) { const o = Ronin3D.shake(G, 1 / 120, 1); tr.push(o[1]); G.shake = Math.max(0, G.shake - 0.34); }
    return tr;
  });
  let cross = 0;
  for (let i = 1; i < r.length; i++) if (r[i - 1] !== 0 && r[i] !== 0 && Math.sign(r[i - 1]) !== Math.sign(r[i])) cross++;
  const env = i0 => Math.max(...r.slice(i0, i0 + 18).map(Math.abs));
  const e0 = env(0), e1 = env(30), e2 = env(60);
  console.log(`   sign changes ${cross} over 90 frames · envelope ${f2(e0)} → ${f2(e1)} → ${f2(e2)}`);
  ok(cross >= 2, 'the trace oscillates (white noise has no defined period, a ring does)', cross + ' crossings');
  ok(e1 < e0 && e2 < e1, 'the envelope decays monotonically', `${f2(e0)} > ${f2(e1)} > ${f2(e2)}`);
  notes.push(`shake: ${cross} sign changes, envelope ${f2(e0)}→${f2(e1)}→${f2(e2)} (it was per-axis white noise)`);
}

// ── 8 · RIBBONS FACE THE CAMERA ───────────────────────────────────────────────────────────────
console.log('\n── 8 · THE BLADE TRAIL FACES THE CAMERA (RONIN-ART §3.5)');
{
  // A trail running along the world Z axis is the decisive case: the OLD perpendicular was
  // (-dy, dx, 0), which for a segment with dx = dy = 0 is exactly (0,0,0) — zero width, invisible.
  // A spin attack sweeps the blade through exactly this orientation every revolution.
  const r = await page.evaluate(poseSrc => {
    const mk = eval('(' + poseSrc + ')');
    const f = mk('ronin');
    const out = {};
    for (const axis of ['z', 'y']) {
      f.trail3 = [];
      /* ⚠ y = 0.85, NOT eye level. A receding ribbon placed exactly at the camera's height is
       * edge-on and projects to nothing however wide it is — the first version of this test put
       * it at y = 1.5 with the eye at 1.55 and measured 0 px for a ribbon that was drawing
       * perfectly. The assertion is still decisive against the old code: for a segment along z
       * the old perpendicular (-dy, dx, 0) is exactly (0,0,0), i.e. zero width at any height. */
      for (let i = 0; i < 12; i++) f.trail3.push(axis === 'z' ? [0, 0.85, -0.20 * i] : [0, 0.85 + 0.20 * i, 0]);
      const s = Ronin3D.probe({ f, trail: true, size: 128, az: 0, dist: 4.6, hgt: 1.55, look: 1.45 });
      /* ⚠ AREA IS THE WRONG COMPARISON and it is worth saying why: a ribbon receding from the
       * camera is seen end-on, so it covers far less of the frame than a broadside one of the
       * same length however wide it is. The property under test is WIDTH — the thing the old
       * perpendicular set to zero — so measure the widest scanline, which is the ribbon's own
       * width in both cases and is therefore comparable. */
      let n = 0, wide = 0;
      for (let y = 0; y < s.size; y++) { let run = 0;
        for (let x = 0; x < s.size; x++) { const i = (y * s.size + x) * 4;
          if (s.px[i] + s.px[i + 1] + s.px[i + 2] > 24) { n++; run++; if (run > wide) wide = run; } else run = 0; } }
      out[axis] = { n, wide };
    }
    return out;
  }, POSE);
  console.log(`   trail along the VIEW axis · ${r.z.n}px lit, widest scanline ${r.z.wide}px`);
  console.log(`   trail across the view     · ${r.y.n}px lit, widest scanline ${r.y.wide}px   (the control)`);
  ok(r.y.n > 40, 'a trail across the view renders (the control)', r.y.n + 'px');
  ok(r.z.n > 40, 'a trail ALONG the view axis still renders — the old x-y perpendicular was exactly 0 here', r.z.n + 'px');
  ok(r.z.wide >= r.y.wide * 0.7, 'and it keeps its WIDTH, which is the property that was zero',
    `${r.z.wide} vs ${r.y.wide}px`);
  notes.push(`ribbon: a blade trail pointed at the camera renders ${r.z.n}px at ${r.z.wide}px wide (it was geometrically 0 before); broadside control ${r.y.n}px at ${r.y.wide}px`);
}

// ── 9 · THE REGISTRATION SLIP ─────────────────────────────────────────────────────────────────
console.log('\n── 9 · THE REGISTRATION SLIP FIRES ON A HIT ONLY (RONIN-ART §3.5)');
{
  /* ⚠ THE FIRST DISCRIMINATOR WAS WRONG AND IT MATTERED. Counting "cyan-ish" pixels anywhere in
   * the frame counted the BODY: cc0-lump's ink is #8a5cc8 under a phosphor-green key, which is
   * cyan-ish by any channel test, so the idle control reported 2613px of fringe. A plate slip is
   * defined by the plates lying OUTSIDE the body, so the measurement has to be too: mask the
   * un-slipped render, dilate it by the slip's own reach, and count only what falls beyond it. */
  const r = await page.evaluate(poseSrc => {
    const mk = eval('(' + poseSrc + ')');
    const CAM = { size: 160, az: 0.2, dist: 4.6, hgt: 1.55, look: 1.45 };
    function shotOf(state, stT, slip) {
      const f = mk('cc0-lump'); f.state = state; f.stT = stT;
      return Ronin3D.probe(Object.assign({ f, slip }, CAM));
    }
    function lit(px, i) { return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] > 20; }
    function outside(state, stT) {
      const base = shotOf(state, stT, false), s = shotOf(state, stT, true), n = CAM.size;
      const m = new Uint8Array(n * n);
      for (let j = 0; j < n * n; j++) if (lit(base.px, j * 4)) m[j] = 1;
      let d = new Uint8Array(m);                                // dilate 1px: hide anti-aliasing at the edge
      for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) { const j = y * n + x;
        if (m[j] || m[j - 1] || m[j + 1] || m[j - n] || m[j + n]) d[j] = 1; }
      let cy = 0, mg = 0;
      for (let j = 0; j < n * n; j++) { if (d[j]) continue; const i = j * 4;
        const R = s.px[i], Gg = s.px[i + 1], B = s.px[i + 2];
        if (!lit(s.px, i)) continue;
        if (Gg > R + 25 && B > R + 20) cy++; else if (R > Gg + 25) mg++; }
      return { cy, mg };
    }
    return { hit: outside('hurt', 0.0), late: outside('hurt', 0.30), calm: outside('idle', 0.5) };
  }, POSE);
  console.log(`   struck (t=0)      cyan ${r.hit.cy}px · magenta ${r.hit.mg}px   ← outside the body silhouette`);
  console.log(`   struck (t=0.30 s) cyan ${r.late.cy}px · magenta ${r.late.mg}px   ← past the 0.13 s life`);
  console.log(`   idle              cyan ${r.calm.cy}px · magenta ${r.calm.mg}px`);
  ok(r.hit.cy + r.hit.mg > 60, 'the plates separate on the frame a hit lands', (r.hit.cy + r.hit.mg) + 'px of fringe');
  ok(r.hit.cy > 10 && r.hit.mg > 10, 'BOTH plates separate, in opposite directions', `cyan ${r.hit.cy} / magenta ${r.hit.mg}`);
  ok(r.calm.cy + r.calm.mg === 0, 'and an unstruck body has EXACTLY no fringe', String(r.calm.cy + r.calm.mg));
  ok(r.late.cy + r.late.mg === 0, 'the slip closes after its life', String(r.late.cy + r.late.mg));
  notes.push(`plate slip: ${r.hit.cy + r.hit.mg}px of fringe outside the body on the struck frame, 0 on an unstruck body`);
}

// ── 10 · THE BACKDROP HAS REAL DEPTH ──────────────────────────────────────────────────────────
console.log('\n── 10 · PARALLAX — the backdrop is three depths, not a painted wall (RONIN-ART §2.5)');
{
  /* ⚠ CROSS-CORRELATION, NOT A CENTROID. The first version took each band's centroid and
   * reported the FAR band travelling furthest — geometrically impossible, and the reason is that
   * these bands are wider than the frame, so their centroid is set by where the frame clips them
   * rather than by where they moved. Matching the two images for the horizontal offset that
   * maximises overlap measures the translation itself.
   * ⚠ Threshold 2, not 10: the bands are near-black ON PURPOSE (they are silhouettes against a
   *   lit printed sky) and the near band measures 4/255. */
  /* ⚠ MATCH THE SKYLINE PROFILE, NOT THE FILLED MASK. A band is a regularly spaced row of boxes,
   * so an overlap score on the filled silhouette ALIASES on the spacing: the mid band reported a
   * 1 px shift because a one-pixel slide already lined the pattern up with itself. The heights and
   * jitters are seeded per box, so the TOP EDGE is a non-periodic signal and matching that has one
   * unambiguous minimum. */
  function skyline(mask) {
    const n = mask.size, prof = new Int16Array(n).fill(-1);
    for (let x = 0; x < n; x++) for (let y = n - 1; y >= 0; y--) if (mask.m[y * n + x]) { prof[x] = y; break; }
    return prof;
  }
  function bestShift(A, B) {
    const a = skyline(A), b = skyline(B), n = a.length;
    let best = 0, bestErr = Infinity;
    for (let dx = -70; dx <= 70; dx++) {
      let err = 0, cnt = 0;
      for (let x = 0; x < n; x++) { const sx = x + dx;
        if (sx < 0 || sx >= n || a[x] < 0 || b[sx] < 0) continue;
        const d = a[x] - b[sx]; err += d * d; cnt++; }
      if (cnt < n * 0.25) continue;                              // not enough overlap to judge
      const e = err / cnt;
      if (e < bestErr) { bestErr = e; best = dx; }
    }
    return { dx: Math.abs(best), err: bestErr };
  }
  /* ⚑ MEASURE THE TRUCK, NOT THE ORBIT — and the reason is worth writing down, because the first
   * version of this test asserted the wrong inequality and the renderer was right.
   * The fight camera does two different things. It TRUCKS sideways every frame, tracking the
   * fighters' midpoint; and it ORBITS occasionally, on `cineKick`. Under a truck you get classic
   * parallax: near moves more. Under an orbit that keeps LOOKING at the centre you get the
   * opposite — a distant object barely moves in the world while the view direction sweeps the
   * full angle, so the far band travels furthest in frame. Both are real, both separate the
   * bands; only the truck has the sign everyone means by "parallax", and the truck is the motion
   * this camera makes constantly. Measured on the orbit for the record: far 32 px, near 36 px. */
  const shift = [], orbit = [];
  for (let b = 0; b < 3; b++) {
    const a = await page.evaluate(b => Ronin3D.probe({ band: b, size: 160, pan: -2.6, dist: 9, hgt: 2.6, look: 2.0 }), b);
    const c = await page.evaluate(b => Ronin3D.probe({ band: b, size: 160, pan: 2.6, dist: 9, hgt: 2.6, look: 2.0 }), b);
    const ma = maskOf(a, 2), mc = maskOf(c, 2);
    shift.push((area(ma) > 200 && area(mc) > 200) ? bestShift(ma, mc).dx : null);
    const oa = await page.evaluate(b => Ronin3D.probe({ band: b, size: 160, az: -0.30, dist: 9, hgt: 2.6, look: 2.0 }), b);
    const oc = await page.evaluate(b => Ronin3D.probe({ band: b, size: 160, az: 0.30, dist: 9, hgt: 2.6, look: 2.0 }), b);
    const oma = maskOf(oa, 2), omc = maskOf(oc, 2);
    orbit.push((area(oma) > 200 && area(omc) > 200) ? bestShift(oma, omc).dx : null);
  }
  const [far, mid, near] = shift;
  console.log(`   camera TRUCK ±2.6 units · far ${far == null ? '—' : f2(far)}px · mid ${mid == null ? '—' : f2(mid)}px · near ${near == null ? '—' : f2(near)}px`);
  console.log(`   camera ORBIT ±0.30 rad · far ${orbit[0]}px · mid ${orbit[1]}px · near ${orbit[2]}px   (opposite sign — see the note)`);
  ok(shift.every(s => s != null), 'all three bands resolved');
  if (shift.every(s => s != null)) {
    const ratio = near / Math.max(0.01, far);
    console.log(`   near : far parallax ratio ${f2(ratio)}   (a wall painted at one depth reports 1.00)`);
    ok(near > mid && mid > far, 'the nearer a band, the further it travels under a truck', `${f2(near)} > ${f2(mid)} > ${f2(far)}`);
    ok(ratio > 1.6, 'near:far parallax ratio above 1.6', f2(ratio));
    notes.push(`parallax: near:far screen shift ratio ${f2(ratio)} (${f2(near)} / ${f2(far)} px across a ±2.6-unit camera truck)`);
  }
}

// ── 11 · THE STAGE IS A DARK FIELD WITH A LIT OBJECT ──────────────────────────────────────────
console.log('\n── 11 · THE FLOOR MUST NOT EAT THE BLACK POINT (DESIGN-SYSTEM §5)');
{
  const s = await page.evaluate(() => Ronin3D.probe({ stage: true, size: 160, az: 0.1, dist: 9, hgt: 2.6, look: 2.0 }));
  let sum = 0, n = 0, clip = 0, dark = 0;
  for (let i = 0; i < s.px.length; i += 4) {
    const l = luma(s.px[i], s.px[i + 1], s.px[i + 2]); sum += l; n++;
    if (s.px[i] === 255 || s.px[i + 1] === 255 || s.px[i + 2] === 255) clip++;
    if (l < 16) dark++;
  }
  const mean = sum / n;
  console.log(`   empty stage · mean luma ${f2(mean)} · clipped ${f2(100 * clip / n)}% · black ${f2(100 * dark / n)}%`);
  ok(mean < 46, 'the empty stage stays a dark field for the fighters to sit on', f2(mean));
  ok(100 * clip / n < 1.0, 'the stage clips under 1% of pixels', f2(100 * clip / n) + '%');
  notes.push(`stage: empty-frame mean luma ${f2(mean)}, ${f2(100 * clip / n)}% clipped, ${f2(100 * dark / n)}% black`);
}

// ── 12 · FAIL OPEN ────────────────────────────────────────────────────────────────────────────
console.log('\n── 12 · FAIL OPEN (a standing principle, and the tests break the build to check it)');
{
  const r = await page.evaluate(poseSrc => {
    const mk = eval('(' + poseSrc + ')');
    const out = {};
    // a fighter with no rig at all — the game should never hand us one, but a renderer that
    // throws takes the whole match down, and this path is reached from a loop with no try/catch
    try { const f = mk('ronin'); f.rig = null; out.norig = Ronin3D.probe({ f, size: 64 }) !== null || 'null'; }
    catch (e) { out.norig = 'THREW ' + e.message; }
    try { const f = mk('nonexistent-archetype'); out.noarch = !!Ronin3D.probe({ f, size: 64 }); }
    catch (e) { out.noarch = 'THREW ' + e.message; }
    try { out.emptyG = !!Ronin3D.render({ fighters: [] }); } catch (e) { out.emptyG = 'THREW ' + e.message; }
    try { Ronin3D.step({ fighters: [null, undefined] }, 0.016); out.nullF = true; } catch (e) { out.nullF = 'THREW ' + e.message; }
    return out;
  }, POSE);
  ok(String(r.norig).indexOf('THREW') < 0, 'a fighter with no rig does not throw', String(r.norig));
  ok(r.noarch === true, 'an unknown archetype still renders (falls back to the ronin wardrobe)', String(r.noarch));
  ok(r.emptyG === true, 'render() survives a game with no fighters', String(r.emptyG));
  ok(r.nullF === true, 'the soft rig survives null fighters in the list', String(r.nullF));
}

// ── page health ───────────────────────────────────────────────────────────────────────────────
console.log('\n── page errors');
const realErrs = pageErrs.filter(e => !/Failed to load resource/.test(e));
ok(realErrs.length === 0, 'no uncaught page errors', realErrs.length ? realErrs.slice(0, 3).join(' | ') : 'clean');

await browser.close();
srv.close();

console.log('\n' + '─'.repeat(78));
console.log('SUMMARY');
notes.forEach(n => console.log('  · ' + n));
console.log('─'.repeat(78));
console.log(`${pass} passed, ${fail} failed.   silhouette masks: build/ronin-art/sil-*.pgm`);
process.exit(fail ? 1 : 0);

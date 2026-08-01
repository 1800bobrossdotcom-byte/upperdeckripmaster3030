/* The hero wordmark's RIG — the half of the brief v2 skipped.
 *
 * v2 answered "what is it made of" and "how is it lit" beautifully and answered "what moves, and
 * why did it physically move" with *the viewer's pointer swings the key light*. The artist's reply
 * was "can't even interact with it · not rigged · not reactive", and all three were literally true
 * in the code: the canvas was pointer-events:none, the GLB was three meshes split by face normal
 * with every letter welded into each, and the only input drove a light direction.
 *
 * ⚑ These assertions exist because "did it move" is the WEAK question. A single global transform
 *   passes it. Every check below is chosen so that the v2 build, and any lazy re-implementation of
 *   it, FAILS:
 *     · different letters must move by different amounts   (rules out one transform on the word)
 *     · a release must OVERSHOOT                           (rules out a lerp/easing curve)
 *     · a shove must reach letter n+2 later than n+1       (rules out 20 independent springs)
 *     · at rest every letter must be exactly zero          (rules out an idle loop — §4)
 *
 * ⚠ Runs against SwiftShader in this container, so it asserts SHAPE and TIMING, never pixels or
 *   frame cost. Colour would be meaningless here (see CLAUDE.md on the hue rotation).
 *
 * Usage: node scripts/test-hero-rig.mjs        (npm run test:rig)
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8937;

let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}` + (detail ? `  — ${detail}` : '')); }
  else { fail++; console.log(`  FAIL ${name}` + (detail ? `  — ${detail}` : '')); }
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.avif': 'image/avif' };

const srv = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try {
    const d = readFileSync(join(ROOT, p));
    rs.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    rs.end(d);
  } catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(r => srv.listen(PORT, r));

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function session(reduced) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(8000);
  return { ctx, page, errs };
}

const dof = (row, i, k) => row[1 + i * 4 + k];      // held[0] is a placeholder, so state starts at 1
const maxAbs = row => { let m = 0; for (let j = 1; j < row.length; j++) m = Math.max(m, Math.abs(row[j])); return m; };

// ── 1 · the live page, normal motion ─────────────────────────────────────────────────────────
{
  const { ctx, page, errs } = await session(false);

  const base = await page.evaluate(() => {
    const c = document.querySelector('#heroType');
    const h = window.__heroType;
    return {
      canvas: !!c,
      pe: c ? getComputedStyle(c).pointerEvents : null,
      ta: c ? getComputedStyle(c).touchAction : null,
      ok: !!(h && h.rig && h.rig.ok),
      n: h && h.rig ? h.rig.n : 0,
      restMax: h && h.rig ? Math.max(...Array.from(h.rig.state).map(Math.abs)) : -1,
    };
  });

  t('the 3D layer exists and the rig came up', base.canvas && base.ok, `${base.n} letters`);
  /* ⛔ The literal v2 defect. A canvas the pointer passes through cannot be interacted with, no
   *   matter what is behind it. */
  t('the canvas TAKES THE POINTER (it was pointer-events:none)', base.pe && base.pe !== 'none', base.pe);
  /* ⚠ ...but not the whole gesture. The wordmark is a 9.7:1 band across the top of the landing
   *   page; a canvas that swallows vertical drags is one a phone cannot scroll past. */
  t('vertical scrolling still belongs to the page on touch', base.ta === 'pan-y', base.ta);
  t('all 20 letters are rigged', base.n === 20, String(base.n));
  /* §4 of the design system: no idle loop, no breathing, no drift. At rest it is a still object. */
  t('AT REST NOTHING MOVES BY ITSELF', base.restMax === 0, 'max |state| = ' + base.restMax);

  const box = await page.locator('#heroType').boundingBox();
  // press high on a letter about a third across, drag right, let go
  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height * 0.28);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(box.x + box.width * (0.32 + i * 0.028), box.y + box.height * 0.28);
    await page.waitForTimeout(22);
  }
  const held = await page.evaluate(() => {
    const r = window.__heroType.rig;
    return [0].concat(Array.from(r.state.subarray(0, r.n * 4)));
  });
  await page.mouse.up();

  /* ⚠ The ring is sampled by PUMPING rAF from inside the page, not by waiting on the clock.
   *   Headless rAF stalls between input events in this container — a quiet second can advance the
   *   physics by almost nothing — so a wall-clock wait measures the harness, not the springs. It
   *   cost this file one FAIL that looked exactly like a rig that would not settle. */
  const series = await page.evaluate(async () => {
    const r = window.__heroType.rig;
    const out = [];
    for (let f = 0; f < 150; f++) {
      await new Promise(rq => requestAnimationFrame(rq));
      let m = 0;
      for (let j = 0; j < r.n * 4; j++) m = Math.max(m, Math.abs(r.state[j]));
      out.push(m);
    }
    return out;
  });

  t('a drag actually displaces the type', maxAbs(held) > 0.02, 'peak |state| ' + maxAbs(held).toFixed(3));

  /* ⚑ THE ASSERTION THAT KILLS A GLOBAL TRANSFORM. Rocking the whole word would give every letter
   *   the same roll; a rig gives each its own. The spread across letters must be a large fraction
   *   of the peak, and the sign must actually flip — letters either side of a dent lean opposite
   *   ways, which one transform cannot express at all. */
  const rolls = [...Array(20)].map((_, i) => dof(held, i, 1));
  const spread = Math.max(...rolls) - Math.min(...rolls);
  t('LETTERS MOVE INDEPENDENTLY, not as one block',
    spread > 0.08 && Math.max(...rolls) > 0.02 && Math.min(...rolls) < -0.02,
    `roll ${Math.min(...rolls).toFixed(3)} .. ${Math.max(...rolls).toFixed(3)}`);
  t('... and the far end of the word is barely touched (a contact, not a global pose)',
    Math.abs(rolls[19]) < 0.02 && Math.abs(rolls[0]) < 0.02,
    `ends ${rolls[0].toFixed(4)} / ${rolls[19].toFixed(4)}`);

  /* ⚑ THE ASSERTION THAT KILLS A LERP. An eased return decays monotonically to rest. A spring
   *   crosses through it and comes back — so the whole-word energy must RISE again at least once
   *   after release before it finally settles. */
  let rises = 0, peak = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i] > series[i - 1] + 1e-4) { rises++; peak = Math.max(peak, series[i]); }
  }
  t('A RELEASE RINGS — it overshoots rest rather than easing to it',
    rises > 0, rises + ' rebound(s), peak after release ' + peak.toFixed(4));
  t('... and it does settle (no perpetual motion)',
    series.length > 4 && series[series.length - 1] < 0.02,
    'final ' + (series[series.length - 1] || 0).toFixed(4));

  t('no page errors during the interaction', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
  await ctx.close();
}

// ── 2 · propagation ──────────────────────────────────────────────────────────────────────────
/* ⚑ THE ASSERTION THAT KILLS TWENTY INDEPENDENT SPRINGS. The letters are set in one sheet, so a
 * shove has to travel. Driven from the hook rather than the pointer on purpose: a pointer press is
 * a wide Gaussian that touches several letters at once, which would hide exactly the thing being
 * measured. One letter, one impulse, and the neighbours must light up IN ORDER. */
{
  const { ctx, page } = await session(false);
  const prop = await page.evaluate(async () => {
    const r = window.__heroType.rig;
    if (!r || !r.ok) return null;
    r.state.fill(0); r.vel.fill(0); r.drive.fill(0);
    r.vel[6 * 4 + 1] = 6.0;                       // letter 6, roll
    const out = [];
    const t0 = performance.now();
    for (let f = 0; f < 60; f++) {
      await new Promise(rq => requestAnimationFrame(rq));
      out.push([performance.now() - t0,
        Math.abs(r.state[6 * 4 + 1]), Math.abs(r.state[7 * 4 + 1]), Math.abs(r.state[8 * 4 + 1])]);
    }
    return out;
  });
  const cross = (k, th) => { for (const p of prop || []) if (p[k] > th) return p[0]; return null; };
  const a = cross(1, 0.01), b = cross(2, 0.01), c = cross(3, 0.01);
  t('a shove REACHES its neighbours at all', a !== null && b !== null,
    `n ${a === null ? '-' : a.toFixed(0)}ms · n+1 ${b === null ? '-' : b.toFixed(0)}ms`);
  t('... IN ORDER, and later the further away (a wave, not 20 separate springs)',
    a !== null && b !== null && c !== null && b > a && c > b,
    `${a?.toFixed(0)} < ${b?.toFixed(0)} < ${c?.toFixed(0)} ms`);
  await ctx.close();
}

// ── 3 · prefers-reduced-motion ───────────────────────────────────────────────────────────────
/* The setting is about motion the PAGE starts by itself. A letter moving under the visitor's own
 * finger is the opposite of that, and freezing it makes the object feel broken rather than calm.
 * So the press must still answer — and must not ring afterwards. */
{
  const { ctx, page } = await session(true);
  const box = await page.locator('#heroType').boundingBox();
  await page.mouse.move(box.x + box.width * 0.40, box.y + box.height * 0.30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.30);
  const held = await page.evaluate(async () => {
    const r = window.__heroType.rig;
    if (!r || !r.ok) return null;
    for (let f = 0; f < 30; f++) await new Promise(rq => requestAnimationFrame(rq));
    let m = 0;
    for (let j = 0; j < r.n * 4; j++) m = Math.max(m, Math.abs(r.state[j]));
    return m;
  });
  await page.mouse.up();
  const series = await page.evaluate(async () => {
    const r = window.__heroType.rig;
    const out = [];
    for (let f = 0; f < 120; f++) {
      await new Promise(rq => requestAnimationFrame(rq));
      let m = 0;
      for (let j = 0; j < r.n * 4; j++) m = Math.max(m, Math.abs(r.state[j]));
      out.push(m);
    }
    return out;
  });
  t('reduced motion: the type STILL answers a press', held !== null && held > 0.005,
    'peak ' + (held === null ? 'no rig' : held.toFixed(4)));
  let rises = 0;
  for (let i = 1; i < series.length; i++) if (series[i] > series[i - 1] + 1e-4) rises++;
  t('reduced motion: ... and does NOT ring afterwards', rises === 0, rises + ' rebound(s)');
  await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

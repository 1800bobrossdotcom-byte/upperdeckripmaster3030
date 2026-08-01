#!/usr/bin/env node
/* ripmaster3030studios — build the hero wordmark's 3D type.   npm run herotype
 *
 * Drives scripts/blender/build-hero-type.py, then MEASURES what came back and what the browser
 * does with it. Following scripts/build-bg.mjs: the point of this file is that it ASSERTS rather
 * than eyeballs, because every one of the things that can be wrong here is invisible in a
 * thumbnail and obvious on the live site.
 *
 *   1. THE GLB LOSES A NAMED PART. js/hero3d.js looks up `wm_face` and `wm_rim` and fails OPEN,
 *      so a rename ships as a wordmark that quietly went back to being CSS. Nothing throws,
 *      nothing logs, and it looks exactly like "the update didn't deploy".
 *   2. THE WALLS PICK UP UVs. The whole two-object design exists because a planar UV is
 *      degenerate on the extrusion walls; if a future export starts writing TEXCOORD_0 on
 *      `wm_rim` the design's premise has silently changed, so it is asserted, not assumed.
 *   3. THE FOIL STOPS BEING THE SITE'S GRADIENT. The bake reproduces the CSS wordmark's own
 *      six-stop ramp; a shader edit that flattens or reorders it still produces a perfectly
 *      plausible-looking strip of colour. So the stops are checked at their own positions.
 *   4. THE LAST LETTER FALLS OFF THE END. index.html already records this exact failure for the
 *      CSS wordmark ("RIPMASTER3030STUDIO", S clipped). The 3D layer can reproduce it from a
 *      completely different cause — a turned word is wider than a square one — so the browser
 *      pass drives the type to its worst pose in both directions and measures the clearance.
 *   5. THE FALLBACK STOPS WORKING. The CSS wordmark is only hidden once a frame has drawn. That
 *      is one line and it is the whole accessibility and no-WebGL story, so it is tested by
 *      breaking the build on purpose (?no3d, and a run with the assets blocked) and checking
 *      the type is still there and still readable.
 *
 * The browser pass is SKIPPED, not failed, where there is no headless chromium: this is an asset
 * build and it should still work on a machine without playwright. It says so rather than going
 * quiet. HERO_SKIP_BROWSER=1 forces that.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, mkdirSync, unlinkSync, rmSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from './png23d.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'media/hero');
const TMP = join(ROOT, 'build/hero-type');
const WOFF = join(ROOT, 'fonts/anton.woff2');
const TTF = join(TMP, 'anton.ttf');

let fail = 0;
const t = (name, ok, extra = '') => {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? '  — ' + extra : ''));
  if (!ok) fail++;
};

/* ── stage 1: the font ────────────────────────────────────────────────────────────────────────
 * Blender reads TTF/OTF, not WOFF2, and the repo ships the subset WOFF2 because that is what the
 * BROWSER wants. Decompressing here (rather than committing a second copy of the same outlines)
 * keeps one file as the source of truth for both the CSS wordmark and its geometry — which is
 * the entire reason the 3D layer can line up with the type it covers. The .ttf is deleted below. */
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
try {
  execFileSync('python3', ['-c',
    'import sys;from fontTools.ttLib import TTFont;f=TTFont(sys.argv[1]);f.flavor=None;f.save(sys.argv[2])',
    WOFF, TTF], { cwd: ROOT, stdio: 'pipe' });
} catch (e) {
  console.error('could not decompress ' + WOFF + ' -> ttf.\n' +
    '  needs: pip install fonttools brotli   (the same pair fonts/README.md uses to subset)\n' +
    String((e.stderr || '') + (e.stdout || '')).trim());
  process.exit(1);
}

/* ── stage 2: Blender ─────────────────────────────────────────────────────────────────────── */
try { execFileSync('blender', ['--version'], { stdio: 'ignore' }); }
catch { console.error('blender not found on PATH.'); process.exit(1); }

console.log('cutting the type …');
const log = execFileSync('blender', ['--background', '--factory-startup', '-noaudio',
  '-P', 'scripts/blender/build-hero-type.py', '--', OUT, TTF],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
const okLine = log.split('\n').find(l => l.startsWith('HERO_OK'));
if (!okLine) {
  console.error(log.split('\n').filter(l => /Error|Traceback|line \d+/.test(l)).join('\n'));
  console.error('blender did not finish the wordmark');
  process.exit(1);
}
for (const l of log.split('\n').filter(l => l.startsWith('  PART'))) console.log(l);
console.log(okLine + '\n');
const blenderAspect = parseFloat(/aspect=([\d.]+)/.exec(okLine)[1]);

/* ── stage 3: the GLB ─────────────────────────────────────────────────────────────────────── */
function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  let o = 12, json = null;
  while (o + 8 <= buf.byteLength) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buf.subarray(o + 8, o + 8 + len)));
    o += 8 + len;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return json;
}

const glbPath = join(OUT, 'type.glb');
const glbBuf = readFileSync(glbPath);
const gltf = parseGlb(glbBuf);
const glbKb = glbBuf.length / 1024, glbGz = gzipSync(glbBuf, { level: 9 }).length / 1024;

const nodes = {};
for (const n of gltf.nodes || []) if (n.mesh !== undefined) nodes[n.name] = gltf.meshes[n.mesh];
const names = Object.keys(nodes);
console.log(`type.glb  ${glbKb.toFixed(0)} KB (${glbGz.toFixed(0)} KB gzipped)  parts: ${names.join(', ')}`);

/* These two names ARE the contract with js/hero3d.js, in the same way dogfight's GLB part names
 * are the contract with dfpc-app. The renderer fails open, so a rename ships as an absence. */
t('glb carries wm_face and wm_rim', !!(nodes.wm_face && nodes.wm_rim), names.join(','));

const prim = m => m && m.primitives && m.primitives[0];
const attrs = m => Object.keys((prim(m) || {}).attributes || {});
if (nodes.wm_face) {
  const a = attrs(nodes.wm_face);
  t('wm_face has POSITION + NORMAL + TEXCOORD_0',
    a.includes('POSITION') && a.includes('NORMAL') && a.includes('TEXCOORD_0'), a.join(','));
}
if (nodes.wm_rim) {
  const a = attrs(nodes.wm_rim);
  t('wm_rim has NO TEXCOORD_0 (its planar UV would be degenerate — see the .py header)',
    a.includes('POSITION') && a.includes('NORMAL') && !a.includes('TEXCOORD_0'), a.join(','));
}

let tris = 0;
for (const m of Object.values(nodes)) {
  const p = prim(m);
  if (p && p.indices !== undefined) tris += gltf.accessors[p.indices].count / 3;
}
/* Budget, not taste: this is above the fold on the landing page. 12k triangles is roughly two of
 * Section 9's bots, for a thing that never animates its vertices. */
t('under 12,000 triangles', tris < 12000, tris.toFixed(0));
t('glb under 400 KB raw', glbKb < 400, glbKb.toFixed(0) + ' KB');

let lo = null, hi = null;
for (const m of Object.values(nodes)) {
  const p = prim(m); if (!p) continue;
  const acc = gltf.accessors[p.attributes.POSITION];
  if (!acc || !acc.min) continue;
  if (!lo) { lo = acc.min.slice(); hi = acc.max.slice(); continue; }
  for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], acc.min[i]); hi[i] = Math.max(hi[i], acc.max[i]); }
}
const dim = lo ? [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] : [0, 0, 0];
const meshAspect = dim[1] ? dim[0] / dim[1] : 0;
console.log(`bounds ${dim.map(v => v.toFixed(4)).join(' x ')}  aspect ${meshAspect.toFixed(3)}`);
t('aspect matches what Blender reported', Math.abs(meshAspect - blenderAspect) < 0.02,
  `${meshAspect.toFixed(3)} vs ${blenderAspect.toFixed(3)}`);
/* ⚠ A flat mesh would render, light, and look almost right — "3D type" that is a picture of type
 *   is exactly the failure this whole build exists to avoid, and it is silent. */
t('the type is actually EXTRUDED (depth > 1% of width)', dim[2] > dim[0] * 0.01,
  (dim[2] / dim[0] * 100).toFixed(1) + '% of width');
/* glTF is Y-up: type authored in Blender's XY plane arrives lying on the floor unless the axis
 * swap in make_object() is right. Height >> depth is what proves it is standing up. */
t('the type is UPRIGHT (height > depth)', dim[1] > dim[2] * 2,
  `h ${dim[1].toFixed(3)} vs d ${dim[2].toFixed(3)}`);

/* ── stage 4: the baked plate ─────────────────────────────────────────────────────────────────
 * Quality on the LOSSLESS png, cost on the SHIPPED webp — the same split build-bg.mjs makes, for
 * the same reason: a failing colour check must not be blameable on WebP ringing. */
const load = f => { const p = join(OUT, f); const img = decodePNG(readFileSync(p)); img.kb = statSync(p).size / 1024; return img; };
const alb = load('type-albedo.png');
const nrm = load('type-normal.png');
const kb = f => statSync(join(OUT, f)).size / 1024;
const albKb = kb('type-albedo.webp'), nrmKb = kb('type-normal.webp');
console.log(`\nalbedo ${alb.w}x${alb.h}  webp ${albKb.toFixed(0)} KB (png ${alb.kb.toFixed(0)})`);
console.log(`normal ${nrm.w}x${nrm.h}  webp ${nrmKb.toFixed(0)} KB (png ${nrm.kb.toFixed(0)})\n`);

t('albedo and normal are the same size', alb.w === nrm.w && alb.h === nrm.h);
/* The plate is a planar projection of the type's own bounding box. If its aspect drifts from the
 * mesh's, every cell of the foil is stretched and the gradient stops landing on the right
 * letters — and it looks fine in isolation, which is why it needs a number. */
t('plate aspect matches the mesh', Math.abs(alb.w / alb.h - meshAspect) / meshAspect < 0.03,
  (alb.w / alb.h).toFixed(3) + ' vs ' + meshAspect.toFixed(3));

function stats(img) {
  const { w, h, data } = img;
  const lum = new Float64Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const L = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    lum[i] = L; sum += L;
  }
  const mean = sum / lum.length;
  let v = 0; for (const L of lum) v += (L - mean) ** 2;
  const s = Array.from(lum).sort((a, b) => a - b);
  const p = q => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { mean, sd: Math.sqrt(v / lum.length), p01: p(0.01), p50: p(0.5), p99: p(0.99) };
}

const A = stats(alb);
console.log(`  albedo luma: mean ${A.mean.toFixed(1)} · p01 ${A.p01.toFixed(1)} · median ${A.p50.toFixed(1)} · p99 ${A.p99.toFixed(1)} · sd ${A.sd.toFixed(1)}`);
/* ⚑ The BOUNDS RUN THE OPPOSITE WAY TO build-bg's, and that is the point of having them written
 *   down. That plate fails ABOVE mean 40 because paragraphs sit on it. Nothing sits on the
 *   wordmark: it is the brightest object above the fold, over a near-black page, and a dim foil
 *   does not read as restraint, it reads as a texture that failed to load. */
t('mean luma above 120 (it is the brightest thing on the page)', A.mean > 120, A.mean.toFixed(1));
t('p01 above 40 (no holes punched in the letterforms)', A.p01 > 40, A.p01.toFixed(1));
t('not flat — sd above 3 (there is foil, not a fill)', A.sd > 3, A.sd.toFixed(1));

/* ── the gradient is the SITE's gradient ───────────────────────────────────────────────────────
 * Transcribed from index.html's `.wordmark` background. A bake that lost, flattened or reversed
 * the ramp still produces a perfectly attractive strip of colour, so each stop is checked where
 * it is supposed to be. The tolerance is loose on purpose — the relief modulates every pixel and
 * the ramp is interpolated in LINEAR space where CSS interpolates in sRGB — but it is nowhere
 * near loose enough to pass a different palette. */
const STOPS = [[0.04, 0xea, 0xff, 0xf2], [0.24, 0x2b, 0xff, 0x80], [0.46, 0x27, 0xf7, 0xe4],
               [0.60, 0x7a, 0xa8, 0xff], [0.80, 0xff, 0x2a, 0xd9], [0.96, 0xff, 0xd2, 0x3b]];
function rowMean(img, y) {
  const { w, data } = img;
  let r = 0, g = 0, b = 0;
  for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  return [r / w, g / w, b / w];
}
let hit = 0;
for (const [pos, r, g, b] of STOPS) {
  const y = Math.min(alb.h - 1, Math.round(pos * alb.h));      // stop 0 is the TOP of the plate
  const m = rowMean(alb, y);
  const d = Math.hypot(m[0] - r, m[1] - g, m[2] - b);
  if (d < 78) hit++;
  console.log(`    stop ${(pos * 100).toFixed(0).padStart(3)}%  want ${[r, g, b].join(',')}  got ${m.map(v => Math.round(v)).join(',')}  Δ${d.toFixed(0)}`);
}
t('at least 5 of the 6 CSS gradient stops reproduce', hit >= 5, hit + '/6');
{
  const top = rowMean(alb, Math.round(alb.h * 0.06)), bot = rowMean(alb, Math.round(alb.h * 0.94));
  const d = Math.hypot(top[0] - bot[0], top[1] - bot[1], top[2] - bot[2]);
  // ⚠ proves the ramp runs DOWN the plate. A horizontal (or absent) ramp passes every check above.
  t('the ramp is vertical (top and bottom differ)', d > 90, 'Δ' + d.toFixed(0));
}

/* ── the normal map ──────────────────────────────────────────────────────────────────────────
 * A tangent-space normal that came back as flat 128,128,255 is a perfectly valid image and a
 * completely dead surface — the foil would never glint. */
{
  const { w, h, data } = nrm;
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < w * h; i++) { mr += data[i * 4]; mg += data[i * 4 + 1]; mb += data[i * 4 + 2]; }
  mr /= w * h; mg /= w * h; mb /= w * h;
  let vr = 0, vg = 0;
  for (let i = 0; i < w * h; i++) { vr += (data[i * 4] - mr) ** 2; vg += (data[i * 4 + 1] - mg) ** 2; }
  const sr = Math.sqrt(vr / (w * h)), sg = Math.sqrt(vg / (w * h));
  console.log(`  normal: mean ${mr.toFixed(1)},${mg.toFixed(1)},${mb.toFixed(1)}  sd x ${sr.toFixed(1)} y ${sg.toFixed(1)}`);
  t('normal points outward (blue mean above 200)', mb > 200, mb.toFixed(1));
  t('normal is unbiased (x,y means near 128)', Math.abs(mr - 128) < 8 && Math.abs(mg - 128) < 8);
  t('normal carries relief (x and y sd above 2)', sr > 2 && sg > 2, `${sr.toFixed(1)}/${sg.toFixed(1)}`);
}

/* payload: this loads above the fold on the landing page */
t('textures under 150 KB total', albKb + nrmKb < 150, (albKb + nrmKb).toFixed(0) + ' KB');

for (const f of ['type-albedo.png', 'type-normal.png']) { try { unlinkSync(join(OUT, f)); } catch {} }
try { rmSync(TMP, { recursive: true, force: true }); } catch {}

/* ── stage 5: what the browser actually does with it ────────────────────────────────────────── */
if (!process.env.HERO_SKIP_BROWSER) {
  try {
    await browserPass();
  } catch (e) {
    const msg = String((e && e.stack) || e);
    if (/Cannot find module|ENOENT|executablePath/.test(msg)) console.log('\n  --   browser pass skipped (no headless chromium here)');
    else { console.log(msg); t('browser pass ran', false); }
  }
}

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);

// ─────────────────────────────────────────────────────────────────────────────────────────────
async function browserPass() {
  const { createServer } = await import('node:http');
  const { extname } = await import('node:path');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
    '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.gif': 'image/gif', '.avif': 'image/avif' };
  const srv = createServer((q, s) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = join(ROOT, p);
    if (!existsSync(f) || !statSync(f).isFile()) { s.writeHead(404); return s.end('nf'); }
    s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    s.end(readFileSync(f));
  });
  await new Promise(r => srv.listen(8213, r));

  const pw = await import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
  const chromium = (pw.default || pw).chromium;
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  async function open(width, height, { query = '?grab=1', block = null, noGl = false } = {}) {
    const ctx = await br.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
    if (noGl) {
      /* ⚑ Simulate a browser with no WebGL2 rather than trust a flag. PlayCanvas 2.x has no
       *   software path, so this is not an exotic case — it is every pre-2021 browser and every
       *   machine with a blocklisted driver, and it must land on the CSS wordmark. */
      await ctx.addInitScript(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
          if (String(kind).indexOf('webgl') === 0) return null;
          return orig.call(this, kind, ...rest);
        };
      });
    }
    const pg = await ctx.newPage();
    if (block) await pg.route(block, r => r.abort());
    /* `domcontentloaded`, not `load`: the intro splash pulls a video this check has no interest
     * in, and waiting for it cost about a minute across five page opens. Deferred scripts have
     * already run by then, and hero3d waits on document.fonts.ready by itself. */
    await pg.goto('http://127.0.0.1:8213/index.html' + query, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pg.evaluate(() => { const s = document.getElementById('introSplash'); if (s) s.remove(); });
    /* ⚠ Headless rAF stalls between input events (CLAUDE.md) — a quiet second can advance the
     *   clock by exactly zero and then a keypress unblocks a burst. Pump it, don't wait on it. */
    for (let i = 0; i < 60; i++) { await pg.mouse.move(2 + (i % 3), 2 + (i % 2)); await pg.waitForTimeout(25); }
    return { ctx, pg };
  }

  console.log('\nbrowser:');
  for (const [W, H] of [[1280, 900], [390, 844]]) {
    const { ctx, pg } = await open(W, H);
    const r = await pg.evaluate(async () => {
      const H2 = window.RipHeroType;
      const el = document.querySelector('.marquee-art.wordmark');
      const cs = getComputedStyle(el);
      const out = {
        state: H2 ? H2.state() : null,
        limits: H2 && H2.limits ? H2.limits() : null,
        text: (el.textContent || '').replace(/\s+/g, ''),
        aria: el.getAttribute('aria-label'),
        inline: el.style.opacity,
        display: cs.display, visibility: cs.visibility,
        box: (b => ({ w: +b.width.toFixed(1), h: +b.height.toFixed(1) }))(el.getBoundingClientRect()),
        docW: document.documentElement.scrollWidth, vw: innerWidth,
      };
      const c = document.getElementById('heroType');
      if (!c || !H2 || !H2.pose) return out;
      const shoot = async (px, py) => {
        H2.pose(px, py);
        await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
        const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
        const x = g.getContext('2d'); x.drawImage(c, 0, 0);
        return { d: x.getImageData(0, 0, g.width, g.height).data, w: g.width, h: g.height };
      };
      const ink = f => {
        let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
        for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
          if (f.d[(y * f.w + x) * 4 + 3] > 18) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        return { left: x0, right: f.w - 1 - x1, top: y0, bottom: f.h - 1 - y1, w: f.w, h: f.h, any: x1 >= 0 };
      };
      const L = out.limits;
      out.poseA = ink(await shoot(L.pitch, -L.yaw));
      out.poseB = ink(await shoot(-L.pitch, L.yaw));
      // colour, read off the LIVE canvas — CLAUDE.md: screenshots rotate hue on canvas content
      const rest = await shoot(0, 0);
      const ri = ink(rest);
      out.bands = [];
      for (let k = 0; k < 6; k++) {
        const y = Math.round(ri.top + (rest.h - 1 - ri.bottom - ri.top) * (k + 0.5) / 6);
        let r2 = 0, g2 = 0, b2 = 0, n = 0;
        for (let x = 0; x < rest.w; x++) { const i = (y * rest.w + x) * 4; if (rest.d[i + 3] > 200) { r2 += rest.d[i]; g2 += rest.d[i + 1]; b2 += rest.d[i + 2]; n++; } }
        if (n) out.bands.push([Math.round(r2 / n), Math.round(g2 / n), Math.round(b2 / n)]);
      }
      H2.pose(null, null);
      return out;
    });
    const tag = W + 'px';
    t(`${tag}: 3D layer is live`, r.state && r.state.phase === 'live', r.state ? r.state.phase + ' ' + r.state.why : 'no module');
    t(`${tag}: both named parts bound`, r.state && r.state.parts === 'wm_face,wm_rim', r.state && r.state.parts);
    /* The accessibility contract, in one assertion. The wordmark may be faded; it may NEVER be
     * removed from the accessibility tree, and the string must still be the studio's name. */
    t(`${tag}: the real text is still in the DOM and in the a11y tree`,
      r.text.toLowerCase() === 'ripmaster3030studios' && r.display !== 'none' && r.visibility !== 'hidden',
      `"${r.text}" display:${r.display} visibility:${r.visibility}`);
    t(`${tag}: CSS wordmark faded only after a frame drew`, r.inline === '0', 'inline opacity ' + JSON.stringify(r.inline));
    if (r.poseA && r.poseB) {
      const m = Math.min(r.poseA.left, r.poseA.right, r.poseB.left, r.poseB.right);
      const pct = m / r.poseA.w * 100;
      console.log(`    ${tag} clearance at max yaw ±${r.limits.yaw}°: ${m}px of ${r.poseA.w} (${pct.toFixed(1)}%)`);
      /* THE "STUDIO" TEST — see the header. A turned wordmark is wider than a square one. */
      t(`${tag}: no letter clips at the worst pose`, r.poseA.any && r.poseB.any && m >= 4 && pct >= 1.5,
        m + 'px / ' + pct.toFixed(1) + '%');
      t(`${tag}: the type does not spill vertically`, Math.min(r.poseA.top, r.poseA.bottom) >= 2);
    }
    if (r.bands && r.bands.length === 6) {
      // the gradient survived all the way to the screen: consecutive bands must actually differ
      let moves = 0;
      for (let i = 1; i < r.bands.length; i++) {
        const a = r.bands[i - 1], b = r.bands[i];
        if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 40) moves++;
      }
      console.log('    bands ' + r.bands.map(b => b.join(',')).join('  |  '));
      t(`${tag}: the gradient reaches the screen (${moves}/5 band steps)`, moves >= 4, moves + '/5');
    }
    t(`${tag}: the page does not scroll sideways`, r.docW <= r.vw + 1, r.docW + ' vs ' + r.vw);
    await ctx.close();
  }

  /* ── fail-open, proven by breaking it ─────────────────────────────────────────────────────── */
  for (const [why, opts] of [['?no3d', { query: '?no3d' }],
                             ['no WebGL2', { noGl: true }],
                             ['assets blocked', { block: '**/media/hero/**' }]]) {
    const { ctx, pg } = await open(1280, 900, opts);
    const r = await pg.evaluate(() => {
      const el = document.querySelector('.marquee-art.wordmark');
      const cs = getComputedStyle(el);
      return { phase: window.RipHeroType ? RipHeroType.state().phase : 'none',
        why: window.RipHeroType ? RipHeroType.state().why : '',
        opacity: cs.opacity, w: +el.getBoundingClientRect().width.toFixed(1),
        canvas: !!document.getElementById('heroType') };
    });
    t(`fail-open (${why}): the CSS wordmark is fully visible`,
      r.phase === 'fallback' && +r.opacity === 1 && r.w > 100 && !r.canvas,
      `${r.phase}/${r.why} opacity ${r.opacity} w ${r.w} canvas ${r.canvas}`);
    await ctx.close();
  }

  /* ── the reveal must not run ahead of the render ──────────────────────────────────────────────
   * Regression test for a bug this build shipped once: PlayCanvas fires `frameend` on every TICK,
   * not on every rendered frame, so counting frameends faded the real wordmark out during the
   * whole window between app.start() and the mesh arriving — leaving a blank masthead. On a fast
   * connection that window is a few frames and invisible, which is exactly why it needs a test
   * that makes the window wide on purpose. */
  {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
    const pg = await ctx.newPage();
    await pg.route('**/type.glb', async r => { await new Promise(res => setTimeout(res, 4000)); await r.continue(); });
    await pg.goto('http://127.0.0.1:8213/index.html?grab=1', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pg.evaluate(() => { const s = document.getElementById('introSplash'); if (s) s.remove(); });
    for (let i = 0; i < 40; i++) { await pg.mouse.move(2 + (i % 3), 2 + (i % 2)); await pg.waitForTimeout(25); }
    const mid = await pg.evaluate(() => ({
      phase: RipHeroType.state().phase, frames: RipHeroType.state().frames,
      opacity: getComputedStyle(document.querySelector('.marquee-art.wordmark')).opacity }));
    t('slow mesh: the wordmark stays visible until a frame really drew',
      mid.phase !== 'live' && +mid.opacity === 1, `${mid.phase} frames ${mid.frames} opacity ${mid.opacity}`);
    for (let i = 0; i < 120; i++) { await pg.mouse.move(2 + (i % 3), 2 + (i % 2)); await pg.waitForTimeout(25); }
    const end = await pg.evaluate(() => ({
      phase: RipHeroType.state().phase,
      inline: document.querySelector('.marquee-art.wordmark').style.opacity }));
    t('slow mesh: it does take over once the mesh lands', end.phase === 'live' && end.inline === '0',
      `${end.phase} inline ${JSON.stringify(end.inline)}`);
    await ctx.close();
  }

  await br.close();
  srv.close();
}

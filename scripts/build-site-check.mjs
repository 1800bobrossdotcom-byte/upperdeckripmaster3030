/* ripmaster3030studios — hold the textured / 3D site pages to numbers.   npm run site:check
 *
 * The three non-game pages (cards/binder.html, cards/market.html, cards/index.html) grew baked
 * Blender surfaces and a PlayCanvas prop. Three things can go wrong with that and exactly one of
 * them is visible in a screenshot:
 *
 *   1. THE TEXTURE EATS THE TEXT. These pages carry paragraphs. `scripts/build-bg.mjs` learned
 *      this the expensive way — an albedo measured "safe" in isolation, then the composite under
 *      small dim print was not. So the measurement here is on the COMPOSITE, in the element boxes
 *      text actually sits in, and it is a REGRESSION test against the pre-texture page rather
 *      than an absolute bar: some of this site's own small print was already under 4.5:1 by
 *      design, and a bar it never met cannot tell me whether I made it worse.
 *   2. THE 3D DOESN'T FAIL OPEN. PlayCanvas has no software path, so WebGL2 is a hard
 *      requirement and every page must still be a whole page without it. Checked by actually
 *      blocking the context, not by reading the code.
 *   3. SOMETHING THROWS. Zero console errors, at 1280 and at 390, on every page, in both modes.
 *
 * ⚠ Judge LUMA and STRUCTURE here, never hue: this container's screenshot path rotates hue on
 *   canvas content (CLAUDE.md). Luminance survives that; colour does not.
 *
 *   node scripts/build-site-check.mjs             # assert against the recorded baseline
 *   node scripts/build-site-check.mjs --baseline  # print numbers to RECORD as a new baseline
 */
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { decodePNG } from './png23d.mjs';

const ROOT = '/home/user/upperdeckripmaster3030';
const TMP = '/tmp/claude-0/-home-user-upperdeckripmaster3030/21c774c7-333a-5b09-b4f7-1b86ae6fac6a/scratchpad';
const RECORD = process.argv.includes('--baseline');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.avif': 'image/avif' };

/* Each page names the boxes whose BACKGROUND has to stay a background, and the colour of the
 * type that sits in them. The text colour is what turns a luma into a contrast ratio, which is
 * the number a reader actually experiences.
 *
 * ⚠ EVERY ONE OF THESE IS A TEXT RUN, NOT A PANEL, and the first cut got that wrong. Measuring
 *   `.binder` or `.board` measures the whole panel — card artwork, 3px black borders and all —
 *   so the p99 pinned to 1.0 and the p1 to 0.0 and every page "failed" at a contrast of 1.05:1
 *   while being perfectly readable. A glyph does not sit on the panel; it sits on the few pixels
 *   directly behind it. Sample those, inset past the border, and the number means something. */
const PAGES = [
  { url: '/cards/binder.html', prop: 'binder', regions: [
      { sel: '.note',      ink: '#7fd8a8' },     // the paragraph, over the page background
      { sel: '.page-no',   ink: '#3f8f63' },     // small dim print INSIDE the textured binder
      { sel: '.flip span', ink: '#5fcf8f' } ] }, // the page counter, on the vinyl panel
  { url: '/cards/market.html', prop: 'bench', regions: [
      { sel: '.honesty-note', ink: '#5fcf8f' },
      { sel: '.page-no',      ink: '#3f8f63' },  // small dim print on a textured leaf
      { sel: '.nav .where',   ink: '#5fcf8f' } ] },
  { url: '/cards/index.html', prop: 'stack', regions: [
      { sel: '.court-note', ink: '#111111' },    // near-black ink on cream — inverted polarity
      { sel: '.plate',      ink: '#111111' },
      { sel: '.tile-name',  ink: '#111111' } ] },
];

/* ⚑ RECORDED FROM THE PAGES AS THEY SHIPPED BEFORE ANY OF THIS LANDED (SITE_BASE_REV=HEAD, same
 *   harness, same viewport, same SwiftShader — see the note on the server below). Worst-case
 *   contrast ratio of the ink against the p99 (for pale ink) or p1 (for dark ink) of its own box
 *   — i.e. against the least favourable pixel a glyph can land on, not the average one. A mean
 *   would happily pass a background you cannot read on; that is the lesson from build-bg.mjs.
 * ⚠ `.note` sits over the ANIMATED foil background, so it drifts ~0.5% between runs (7.35 /
 *   7.37 / 7.38 observed). That drift is two orders below the tolerance and is the reason the
 *   tolerance is a fraction rather than an equality. */
const BASELINE = {
  '/cards/binder.html': { '.note': 7.37, '.page-no': 5.03, '.flip span': 10.31 },
  '/cards/market.html': { '.honesty-note': 5.68, '.page-no': 4.77, '.nav .where': 7.45 },
  '/cards/index.html':  { '.court-note': 15.97, '.plate': 15.97, '.tile-name': 15.97 },
};
/* A texture may cost at most this share of the worst-case contrast ratio. 12% is not a taste
 * call: it is roughly the difference between 4.5:1 and 4.0:1, i.e. the smallest step that could
 * move a passing paragraph to a failing one. */
const TOLERANCE = 0.12;

/* ⚑ HOW THE BASELINE WAS TAKEN, and why it is not a `git stash`. Three other agents are working
 *   in this tree; stashing would have swept their files up with mine. Instead the server can be
 *   told to serve an EARLIER REVISION of the page HTML at the same URL:
 *       SITE_BASE_REV=HEAD node scripts/build-site-check.mjs --baseline
 *   Only the HTML differs between the two states — every asset this change adds is a new file
 *   the old HTML has no reference to — so the old page renders exactly as it shipped, through
 *   the identical harness, viewport and software GL. That is what makes the two columns
 *   comparable at all; a baseline measured on a different day on a different renderer is a
 *   number, not a control. */
const BASE_REV = process.env.SITE_BASE_REV || '';
const srv = createServer(async (rq, rs) => {
  try {
    const p = decodeURIComponent(rq.url.split('?')[0]);
    const f = join(ROOT, p === '/' ? '/index.html' : p);
    let b;
    if (BASE_REV && extname(f) === '.html') {
      b = execFileSync('git', ['show', `${BASE_REV}:${p.replace(/^\//, '')}`], { cwd: ROOT });
    } else {
      b = await readFile(f);
    }
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    rs.end(b);
  } catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(r => srv.listen(8211, r));

const pw = await import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const chromium = (pw.default || pw).chromium;
const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

let fail = 0;
const t = (name, ok, extra = '') => {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? '  — ' + extra : ''));
  if (!ok) fail++;
};

/* WCAG relative luminance + contrast ratio. The reason to go all the way to a ratio rather than
 * stopping at a luma is that the same luma delta means something different at the two ends of the
 * scale, and two of these pages have DARK ink on a LIGHT plate. */
const chan = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const relLum = (r, g, b) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const hexLum = h => relLum(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));

async function shoot(page, path) {
  await page.screenshot({ path });
  return decodePNG(readFileSync(path));
}

async function run(url, width, opts = {}) {
  const ctx = await br.newContext({ viewport: { width, height: 900 },
    deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
  if (opts.noWebGL) {
    /* Block the context the way a real machine without WebGL2 does — at getContext, so every
     * consumer on the page (the prop, the card renderer, the foil background, the warp) takes
     * the same road a user would. Patching a flag would only test the flag. */
    await ctx.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind) {
        if (/webgl/i.test(String(kind))) return null;
        return orig.apply(this, arguments);
      };
    });
  }
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => {
    const u = r.url();
    if (/\.(webp|png|json|js|svg|jpg)$/i.test(u)) errs.push('requestfailed: ' + u);
  });
  // a bare "Failed to load resource" tells you nothing; name the URL that 404'd
  page.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto('http://127.0.0.1:8211' + url, { waitUntil: 'load', timeout: 45000 });
  // the prop defers behind IntersectionObserver + requestIdleCallback, so give it room
  await page.waitForTimeout(opts.noWebGL ? 1800 : 4200);
  return { ctx, page, errs };
}

/* Measure the composite each region's text sits on, with every glyph made invisible. Backgrounds
 * are untouched by that, so this is the plate and nothing but the plate.
 *
 * ⚠ SCROLL TO EACH REGION AND SHOOT THE VIEWPORT — do not shoot fullPage. Two reasons, and the
 *   first one cost a whole pass: a viewport screenshot only contains the top 900px, so every
 *   region below the fold (which is most of them — the page counters, the leaf numbers) measured
 *   as "not found / zero size" and silently dropped out of the test. And `fullPage` is not the
 *   fix, because these pages carry FIXED layers (the foil background canvas), which Chromium
 *   paints once at the top of a stitched fullPage capture — so the plate under anything below
 *   the fold would be a fiction. Scrolling is what a reader does; measure what they see. */
async function plates(page, regions, shotPrefix) {
  const out = {};
  for (let i = 0; i < regions.length; i++) {
    const sel = regions[i].sel;
    /* ⚑ THE CONTENT BOX, NOT THE BORDER BOX. A glyph lives inside the padding, so the border and
     *   the padding must come off before sampling — and it has to come from getComputedStyle
     *   rather than a fixed inset, because these elements differ wildly (a 3px black rule plus
     *   10px padding on `.court-note`, nothing at all on `.page-no`). A flat inset left
     *   `.court-note`'s rounded corners — black border curving inward over a yellow board — in
     *   the sample, which dragged its p1 to 0.677 against a p50 of 0.845 and reported a 13:1
     *   contrast for a plate that is genuinely 15:1 under every letter on it. */
    const b = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const px = k => parseFloat(cs[k]) || 0;
      const l = px('borderLeftWidth') + px('paddingLeft'), rt = px('borderRightWidth') + px('paddingRight');
      const tp = px('borderTopWidth') + px('paddingTop'), bt = px('borderBottomWidth') + px('paddingBottom');
      return { x: Math.round(r.left + l), y: Math.round(r.top + tp),
               w: Math.round(r.width - l - rt), h: Math.round(r.height - tp - bt) };
    }, sel);
    if (!b || b.w < 8 || b.h < 6) { out[sel] = null; continue; }
    await page.waitForTimeout(120);
    const img = await shoot(page, `${shotPrefix}-${i}.png`);
    /* one more pixel off each edge, for the antialiased seam where the padding meets the border */
    const IN = 1;
    const x0 = Math.max(0, b.x + IN), y0 = Math.max(0, b.y + IN);
    const x1 = Math.min(img.w, b.x + b.w - IN), y1 = Math.min(img.h, b.y + b.h - IN);
    if (x1 - x0 < 4 || y1 - y0 < 4) { out[sel] = null; continue; }
    const lum = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = (y * img.w + x) * 4;
      lum.push(relLum(img.data[k], img.data[k + 1], img.data[k + 2]));
    }
    lum.sort((a, b2) => a - b2);
    out[sel] = { p1: lum[Math.floor(lum.length * 0.01)],
                 p50: lum[Math.floor(lum.length * 0.5)],
                 p99: lum[Math.floor(lum.length * 0.99)] };
  }
  return out;
}

const recorded = {};

for (const P of PAGES) {
  console.log(`\n── ${P.url} ────────────────────────────────────────────`);

  // ── 1280, WebGL on: errors, the prop, and the contrast the reader gets ──
  {
    const { ctx, page, errs } = await run(P.url, 1280);
    t(`1280: zero console errors`, errs.length === 0, errs.join(' | '));

    if (!BASE_REV) {
      const mounted = await page.evaluate(() =>
        (window.__site3d || []).map(c => ({ prop: c.prop, w: c.canvas.width, h: c.canvas.height })));
      t(`1280: the ${P.prop} prop mounted and has a backing store`,
        mounted.some(m => m.prop === P.prop && m.w > 0 && m.h > 0),
        JSON.stringify(mounted));
      t(`1280: the static fallback got hidden (is3d set)`,
        await page.evaluate(() => !!document.querySelector('.prop3d.is3d')));
    }

    // glyphs off, plate only
    await page.addStyleTag({ content:
      '*,*::before,*::after{color:transparent!important;text-shadow:none!important;' +
      '-webkit-text-fill-color:transparent!important}' });
    await page.waitForTimeout(350);
    const st = await plates(page, P.regions, `${TMP}/site-${P.prop}-1280`);

    recorded[P.url] = {};
    for (const r of P.regions) {
      const s = st[r.sel];
      if (!s) { t(`1280: region ${r.sel} exists`, false, 'not found / zero size'); continue; }
      const ink = hexLum(r.ink);
      // worst case: for PALE ink the brightest plate pixel, for DARK ink the darkest
      const worst = ink > 0.4 ? s.p99 : s.p1;
      const cr = ratio(ink, worst);
      recorded[P.url][r.sel] = +cr.toFixed(2);
      const base = (BASELINE[P.url] || {})[r.sel];
      console.log(`       ${r.sel.padEnd(15)} plate p1 ${s.p1.toFixed(4)} · p50 ${s.p50.toFixed(4)} · ` +
        `p99 ${s.p99.toFixed(4)} → worst-case contrast ${cr.toFixed(2)}:1` +
        (base ? `  (baseline ${base.toFixed(2)})` : ''));
      if (!RECORD && base) {
        t(`1280: ${r.sel} keeps its contrast (≥ ${(base * (1 - TOLERANCE)).toFixed(2)}:1)`,
          cr >= base * (1 - TOLERANCE), cr.toFixed(2) + ':1');
      }
    }
    await ctx.close();
  }

  // ── 390: a phone has to survive the same page ──
  {
    const { ctx, errs } = await run(P.url, 390);
    t(`390: zero console errors`, errs.length === 0, errs.slice(0, 4).join(' | '));
    await ctx.close();
  }

  // ── WebGL blocked: still a whole page ──
  {
    const { ctx, page, errs } = await run(P.url, 1280, { noWebGL: true });
    t(`no-webgl: zero console errors`, errs.length === 0, errs.slice(0, 4).join(' | '));
    const state = await page.evaluate(() => {
      const h = document.querySelector('[data-site3d]');
      return {
        props: (window.__site3d || []).length,
        is3d: h ? h.classList.contains('is3d') : null,
        canvasesInHost: h ? h.querySelectorAll('canvas').length : null,
        fallbackVisible: h ? getComputedStyle(h.querySelector('.flat')).opacity : null,
        // the page's own content must still be there
        bodyText: document.body.innerText.replace(/\s+/g, ' ').trim().length
      };
    });
    t(`no-webgl: no prop was mounted`, state.props === 0, JSON.stringify(state));
    if (!BASE_REV) {
      t(`no-webgl: the static fallback is still showing`,
        state.is3d === false && state.canvasesInHost === 0 && state.fallbackVisible === '1',
        JSON.stringify(state));
    }
    t(`no-webgl: the page still has its copy`, state.bodyText > 300, state.bodyText + ' chars');
    await ctx.close();
  }
}

await br.close();
srv.close();

if (RECORD) {
  console.log('\n── BASELINE (paste into BASELINE above) ──');
  console.log(JSON.stringify(recorded, null, 2));
  process.exit(0);
}
console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);

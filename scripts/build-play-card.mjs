#!/usr/bin/env node
/* THE SHARE CARD + a logo a phone can afford.                     node scripts/build-play-card.mjs
 *
 * `play.html` is delivered by a LINK CARD — that is the whole mechanism (see build-play.mjs), so
 * the card image is not decoration, it is the thing a reader decides on. It is shot from the LIVE
 * game for the same reason `npm run mark` screenshots the live wordmark: a redraw is a *picture
 * of* the game, which is DESIGN-SYSTEM §1's recorded failure.
 *
 * ⚠ COLOUR IS NOT VERIFIED HERE, and the caveat is this repo's own: SwiftShader rotates hue on
 *   CANVAS content in this container, while DOM text and CSS come out correct in the same shot.
 *   So the LAYOUT, the type and the framing below are trustworthy and the game frame's HUES are
 *   not. Re-run on a real GPU before this is posted. `npm run mark` carries the same warning.
 *
 * ⚑ AND THE 819 KB LOGO IS THE SINGLE BIGGEST WIN ON THE SHARE BUILD. `riprocketer.png` is already
 *   compressed, so it does not gzip — it is 819 KB on the wire, `fetchpriority="high"`, in front
 *   of a reader who arrived from a feed and has about two seconds. Re-encoded to WebP through the
 *   browser's own encoder (no PIL, no sharp, no cwebp in this container — Chromium is the tool we
 *   have), and `play.html` points at that instead.
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg' };
const PORT = 9211;
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// ── 1 · the logo, re-encoded ────────────────────────────────────────────────────────────────
{
  const ctx = await br.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/riprocketer.html?hold=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const out = await page.evaluate(async () => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = '/riprocketer.png'; });
    /* ⚠ capped at 1200 wide. The start screen draws it at min(600px, 90vw), so anything past
     * ~1200 device pixels is detail nobody can resolve, paid for on a phone. */
    const w = Math.min(1200, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    /* ⛔ THE LOGO IS BRIGHT INK ON AN OPAQUE BLACK PLATE, and every page that shows it leans on
     * `mix-blend-mode:screen` to hide that. A blend mode only composites within its own STACKING
     * CONTEXT, so the moment anything above it has a `filter`, a `z-index` or an `isolation`, the
     * black plate comes back as a hard box — which is exactly what the first two cards shipped.
     * ⚑ Bake the screen into the ALPHA instead: a = the brightest channel. Then the logo is
     * genuinely transparent and composites correctly over anything, in any stacking context,
     * with no blend mode to lose. WebP carries alpha, so it costs nothing. */
    const d = g.getImageData(0, 0, w, h);
    for (let i = 0; i < d.data.length; i += 4) {
      const a = Math.max(d.data[i], d.data[i + 1], d.data[i + 2]);
      d.data[i + 3] = a;
    }
    g.putImageData(d, 0, 0);
    return { data: c.toDataURL('image/webp', 0.92), w, h, ow: img.naturalWidth, oh: img.naturalHeight };
  });
  const buf = Buffer.from(out.data.split(',')[1], 'base64');
  await writeFile(join(ROOT, 'media/site/riprocketer.webp'), buf);
  const was = (await readFile(join(ROOT, 'riprocketer.png'))).length;
  console.log('✦ media/site/riprocketer.webp  ' + out.ow + '×' + out.oh + ' → ' + out.w + '×' + out.h
    + '  ' + (was / 1024).toFixed(0) + ' KB → ' + (buf.length / 1024).toFixed(0) + ' KB'
    + '  (' + (100 - buf.length / was * 100).toFixed(0) + '% off)');
  await ctx.close();
}

// ── 2 · the card: a real frame of the real game, with the type over it ──────────────────────
{
  const ctx = await br.newContext({ viewport: { width: 1200, height: 628 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/play.html?hold=1&q=high`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.__rrpc && window.__rrpc._cam, null, { timeout: 90000 });
  await page.evaluate(() => __rrpc.start(false));
  await page.waitForTimeout(900);
  /* step into the middle of a wave: a formation on screen, divers committed, the ship mid-dash.
   * An empty arena is what a card of this game must not be — the brief it was rebuilt against
   * was "it was not slow, it was EMPTY". */
  await page.evaluate(() => {
    const G = __rrpc.G, s = G.ship;
    for (let i = 0; i < 1500; i++) { __rrpc._step(2, 1 / 120); __rrpc._camStep(1, 1 / 60); }
    /* ⚠ NO DASH. The first pass forced one for drama and the exposure smear turned the right
     * half into vertical streaks — the half the card has to read the GAME in. Overdrive is lit
     * (the ship glows, the guns are hot) with the camera settled, which is the readable version
     * of the same moment. */
    s.alive = true; s.inv = 3; s.x = -1.2; s.od = 3; s.flow = 3; s.vx = 0;
    for (let i = 0; i < 26; i++) { __rrpc._step(2, 1 / 120); __rrpc._camStep(1, 1 / 60); }
  });
  await page.waitForTimeout(500);
  // the type, in the page's own fonts — DOM/CSS screenshots correctly here, canvas hue does not
  await page.evaluate(() => {
    /* ⚠ ALL the HUD, not just the right column. The first pass left `.hud-tl` up and the score
     * read straight through the studio line — a card with two type systems fighting in one
     * corner. */
    document.querySelectorAll('.ov,.controls,.pad,.toggles,#soundBar,.hud,.rr-crt').forEach(e => e.style.display = 'none');
    const d = document.createElement('div');
    d.id = 'cardType';
    d.innerHTML =
      '<div style="position:fixed;inset:0;z-index:9000;pointer-events:none;' +
      'background:linear-gradient(90deg,rgba(2,4,10,.97) 0%,rgba(2,4,10,.95) 40%,rgba(2,4,10,.55) 62%,transparent 80%)"></div>' +
      '<div style="position:fixed;left:54px;top:50%;transform:translateY(-50%);z-index:9001;max-width:560px">' +
      '<div style="font-family:\'Arial Black\',Arial,sans-serif;font-size:13px;letter-spacing:.30em;' +
      'color:#27f7e4;text-transform:uppercase;margin-bottom:14px">ripmaster3030studios</div>' +
      /* ⛔ THE BLEND AND THE FILTER CANNOT SHARE AN ELEMENT. `filter` opens a stacking context,
       * so `mix-blend-mode:screen` composites against that context instead of against the card
       * and the logo's own black background comes back as a hard box. The glow goes on a WRAPPER;
       * the blend stays on the image. The first pass shipped the box. */
      /* no blend mode: the webp carries its own alpha now, so the glow can sit on a wrapper
       * without a stacking context eating the composite. */
      '<div style="filter:drop-shadow(0 0 34px rgba(255,42,217,.45))">' +
      '<img src="/media/site/riprocketer.webp" style="width:100%;height:auto;display:block">' +
      '</div>' +
      '<div style="font-family:\'Courier New\',monospace;font-size:19px;line-height:1.5;color:#d9ffe9;' +
      'margin-top:20px;text-shadow:0 2px 6px #000">A formation of <b style="color:#ffd23b">trading cards</b>' +
      ' flies in, breaks out, and dives at you.</div>' +
      '<div style="font-family:\'Arial Black\',Arial,sans-serif;font-size:15px;letter-spacing:.08em;' +
      'color:#2bff80;margin-top:18px;text-transform:uppercase">▶ tap to fly · free · no sign-up</div>' +
      '</div>';
    document.body.appendChild(d);
  });
  await page.waitForTimeout(400);
  const png = await page.screenshot({ type: 'png' });
  await writeFile(join(ROOT, 'media/site/play-card.png'), png);
  console.log('✦ media/site/play-card.png     1200×628  ' + (png.length / 1024).toFixed(0) + ' KB');
  await ctx.close();
}
// ── 3 · SECTION 9's card: a real frame of a real firefight ─────────────────────────────────
/* ⚑ Same rule as the RIP ROCKETER card and as `npm run mark`: shot from the LIVE game, never
 *   composed. A picture OF a feature is a claim about it; a shot of the thing IS it.
 * ⛔ AND IT HAS TO BE A MATCH, NOT THE LOBBY. The lobby is a logo and a button — it says nothing
 *   about what the game is, and an empty arena is what a card of a shooter must not be. The path
 *   is the real one a player walks: Practice → the controls card → Start. */
{
  const ctx = await br.newContext({ viewport: { width: 1200, height: 628 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/s9feed.html`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('btnPractice'), null, { timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => document.getElementById('btnPractice').click());
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.getElementById('gh-start'); if (b) b.click(); });
  await page.waitForTimeout(12000);          // the world streams in; it is a heavy cabinet
  /* ⚠ face something. A shooter card framing an empty wall is the "it was not slow, it was
   * EMPTY" brief all over again — so turn until bodies are in frame, using the game's own state
   * rather than a guessed yaw. */
  const aimed = await page.evaluate(() => {
    const g = window.__s9game; if (!g || !g.G) return 'no game';
    const G = G0 => G0, S = g.G;
    const me = S.me || (S.ents && S.ents[0]);
    const foes = (S.ents || S.bots || []).filter(e => e && e !== me && e.alive !== false);
    if (!me || !foes.length) return 'no foes yet: ' + (S.ents ? S.ents.length : '?');
    let best = null, bd = 1e9;
    for (const f of foes) { const d = Math.hypot(f.x - me.x, f.z - me.z);
      if (d > 6 && d < bd) { bd = d; best = f; } }
    if (!best) return 'none in range';
    me.yaw = Math.atan2(best.x - me.x, best.z - me.z);
    me.pitch = 0;
    return 'facing a foe at ' + bd.toFixed(1) + 'm';
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    document.querySelectorAll('.toggles,#soundBar,.gh-ov').forEach(e => e.style.display = 'none');
    const d = document.createElement('div');
    d.innerHTML =
      '<div style="position:fixed;inset:0;z-index:9000;pointer-events:none;' +
      'background:linear-gradient(90deg,rgba(2,4,10,.96) 0%,rgba(2,4,10,.92) 38%,rgba(2,4,10,.45) 60%,transparent 78%)"></div>' +
      '<div style="position:fixed;left:54px;top:50%;transform:translateY(-50%);z-index:9001;max-width:540px">' +
      '<div style="font-family:\'Arial Black\',Arial,sans-serif;font-size:13px;letter-spacing:.30em;' +
      'color:#27f7e4;text-transform:uppercase;margin-bottom:16px">ripmaster3030studios</div>' +
      '<div style="font-family:\'Arial Black\',Arial,sans-serif;font-size:52px;line-height:.95;' +
      'color:#d9ffe9;text-shadow:0 0 30px rgba(39,247,228,.45)">SECTION&nbsp;9</div>' +
      '<div style="font-family:\'Arial Black\',Arial,sans-serif;font-size:19px;letter-spacing:.16em;' +
      'color:#7fd8a8;margin-top:8px;text-transform:uppercase">taskforce supergame</div>' +
      '<div style="font-family:\'Courier New\',monospace;font-size:19px;line-height:1.5;color:#d9ffe9;' +
      'margin-top:20px;text-shadow:0 2px 6px #000">Drop into a <b style="color:#ffd23b">walled arena</b>' +
      ' and rack up frags. Infinite respawns.</div>' +
      '<div style="font-family:\'Arial Black\',Arial,sans-serif;font-size:15px;letter-spacing:.08em;' +
      'color:#2bff80;margin-top:18px;text-transform:uppercase">▶ tap to drop in · free · no sign-up</div>' +
      '</div>';
    document.body.appendChild(d);
  });
  await page.waitForTimeout(500);
  const png = await page.screenshot({ type: 'png' });
  await writeFile(join(ROOT, 'media/site/s9-card.png'), png);
  console.log('✦ media/site/s9-card.png       1200×628  ' + (png.length / 1024).toFixed(0) + ' KB  (' + aimed + ')');
  await ctx.close();
}

await br.close(); srv.close();

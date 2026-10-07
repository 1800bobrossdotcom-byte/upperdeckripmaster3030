#!/usr/bin/env node
/* THE SHARE CABINET — driven.                                             npm run test:play
 *
 * `play.html` exists to be opened by a stranger who tapped a link card in a social feed, on a
 * phone held UPRIGHT, having never seen this studio. Everything it asserts is about that person.
 *
 * ⛔ WHY A TEXT MATCH CANNOT DO THIS JOB, which is this repo's most-repeated finding one level in:
 *   `test:reach` proves the page parses and is linked, `test:cab` proves pads lay out, and BOTH
 *   were green on a build where **68% of the playable field was off screen in portrait** — the
 *   ship flies to ±6.3 while a 390×844 camera showed ±2.02. Nothing errors. The ship simply is
 *   not in the picture, which reads as a dead game, and only projecting it through the LIVE
 *   camera can see it.
 *
 * ⚠ THE NO-REGRESSION HALF IS NOT OPTIONAL. The artist's verdict on the current build is "plays
 *   GREAT", so landscape and desktop must come back with the SAME numbers they had before the
 *   portrait work — fov 42, vertical framing. A fix that improves one viewport by moving another
 *   is not a fix.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
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
const PORT = 8967;

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok   ' + m + (d ? '  — ' + d : '')); }
  else { fail++; console.log('  FAIL ' + m + (d ? '  — ' + d : '')); } };

/* ⚑ `/__parent` frames the share build the way X frames a player card, and the child is served
 * from `localhost` while the parent is `127.0.0.1` — two different origin strings, so the frame
 * is GENUINELY cross-origin rather than cross-origin-shaped. `?sabotage=gate` serves a build with
 * the pre-launch veil put back, which is the one failure this whole generator exists to prevent. */
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const q = new URL(req.url, 'http://x').searchParams;
  if (p === '/__parent') {
    const sb = q.get('sandbox') === '1' ? ' sandbox="allow-scripts"' : '';
    const child = q.get('s9') ? '/s9feed.html'
      : q.get('sabotage') ? '/__sabotage?k=' + q.get('sabotage') : '/feed.html';
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<!doctype html><title>p</title><body style="margin:0;background:#111">'
      + `<iframe src="http://localhost:${PORT}${child}" width="480" height="480"`
      + ' style="border:0;display:block"' + sb + '></iframe>');
  }
  /* ⛔ THE SABOTAGE IS THE FRAMING, AND PICKING IT TOOK TWO FALSE STARTS WORTH RECORDING.
   *   `gate.js` CANNOT ENGAGE — it is off (`LIVE = true`) and returns outright when
   *   `window.top !== window.self`, so the pre-launch veil is structurally incapable of covering
   *   an embed. `orient.js` did not engage either at 480×480. **A sabotage that does not engage
   *   proves the OPPOSITE of the truth**, so neither proves the no-veil assertion — which is
   *   fine, because that assertion was never the one carrying weight.
   * ⚑ The one that is, is the FRAMING, and it is a defect this project actually SHIPPED: before
   *   the portrait work a 390×844 camera showed ±2.02 of a ±6.3 field. Deleting the horizontal
   *   branch reproduces exactly that at a square aspect — the game still runs, nothing errors,
   *   and two thirds of the playfield is simply not in the picture. */
  if (p === '/js/rrpc-app.js' && q.get('k') === 'noframe') {
    let s = await readFile(join(ROOT, 'js/rrpc-app.js'), 'utf8');
    const before = s;
    s = s.replace('if (hv * a >= F.X * WIDE) return { hw: hv * a, hh: hv, horiz: false, fov: CAM.fov, a: a };',
      'return { hw: hv * a, hh: hv, horiz: false, fov: CAM.fov, a: a };');
    if (s === before) { res.writeHead(500); return res.end('/* sabotage anchor missing */'); }
    res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(s);
  }
  if (p === '/__sabotage') {
    let s = await readFile(join(ROOT, 'feed.html'), 'utf8');
    const before = s;
    s = s.replace('<script src="js/rrpc-app.js"></script>',
      '<script src="/js/rrpc-app.js?k=' + q.get('k') + '"></script>');
    if (s === before) { res.writeHead(500); return res.end('sabotage anchor missing'); }
    res.writeHead(200, { 'content-type': 'text/html' }); return res.end(s);
  }
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));

const html = await readFile(join(ROOT, 'play.html'), 'utf8');
const feed = await readFile(join(ROOT, 'feed.html'), 'utf8');

console.log('\n── 1 · THE GENERATOR AND THE SHIPPED FILE AGREE ───────────────────────────────');
/* ⛔ `restyle-backs.mjs` is the recorded failure: a hand-patched OUTPUT and a generator left
 * armed to put the defect back, so the next run silently reverts the fix. `riprocketer.html` is
 * edited constantly and this page is derived from it, so the two drifting apart is a WHEN. */
{
  const { buildPlay, buildFeed } = await import('./build-play.mjs').catch(() => ({}));
  if (!buildPlay) { ok(false, 'build-play.mjs exports buildPlay()'); }
  else {
    const fresh = await buildPlay();
    ok(fresh === html, 'play.html IS what scripts/build-play.mjs produces right now',
      fresh === html ? 'byte-identical' : 'DRIFTED — run node scripts/build-play.mjs');
  }
  if (!buildFeed) { ok(false, 'build-play.mjs exports buildFeed()'); }
  else {
    const fresh = await buildFeed();
    ok(fresh === feed, 'feed.html IS what scripts/build-play.mjs produces right now',
      fresh === feed ? 'byte-identical' : 'DRIFTED — run node scripts/build-play.mjs');
  }
  /* ⛔ THE POSTED LINK MUST NOT MOVE. `play.html` is already shared; `feed.html` is the gamble on
   * an allowlist. The whole reason they are two files is that one of them is proven, so the two
   * card types are asserted to stay on their own pages. */
  ok(/content="summary_large_image"/.test(html) && !/content="player"/.test(html),
    'play.html is STILL the proven link card — the gamble did not leak into the posted URL');
}

console.log('\n── 2 · THE CARD IS THE DELIVERY MECHANISM ─────────────────────────────────────');
/* The viral Minecraft-on-X post was measured, off its own meta tags, as `summary_large_image` —
 * a link card, not an in-feed player. That is what this page is delivered by, so the card meta
 * is not polish: with none, a shared link renders as a bare URL and nobody taps it.
 * ⚠ `riprocketer.html` HAS none, which is why this page exists rather than the cabinet being
 *   shared directly. */
for (const [re, what] of [
  [/<meta name="twitter:card" content="summary_large_image">/, 'twitter:card = summary_large_image'],
  [/<meta name="twitter:title"/, 'twitter:title'],
  [/<meta name="twitter:description"/, 'twitter:description'],
  [/<meta name="twitter:image" content="https:\/\/[^"]+play-card\.png">/, 'twitter:image (absolute)'],
  [/<meta name="twitter:image:alt"/, 'twitter:image:alt'],
  [/<meta property="og:url" content="https:\/\//, 'og:url (absolute)'],
  [/<link rel="canonical"/, 'canonical'],
]) ok(re.test(html), 'the page carries ' + what);
/* ⚠ RELATIVE IS NOT ALLOWED HERE. A crawler fetching the card resolves these against nothing it
 * can be trusted to guess; every image and url must be absolute or the card renders blank. */
ok(!/<meta (name|property)="(twitter|og):(image|url)" content="(?!https:\/\/)/.test(html),
  'no card image or url is relative');
{
  const card = await stat(join(ROOT, 'media/site/play-card.png')).catch(() => null);
  ok(!!card, 'media/site/play-card.png exists', card ? (card.size / 1024).toFixed(0) + ' KB' : 'MISSING');
  /* X rejects over 5 MB. Under 10 KB means the build produced an empty frame. */
  ok(card && card.size > 40 * 1024 && card.size < 5 * 1024 * 1024,
    'the card is a real image and inside the platform limit');
}

console.log('\n── 3 · NOTHING STANDS BETWEEN THE TAP AND THE GAME ────────────────────────────');
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function drive(file, W, H) {
  const ctx = await br.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/${file}?hold=1`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.__rrpc && window.__rrpc._cam, null, { timeout: 90000 });
  const env = await page.evaluate(() => ({
    gate: !!document.getElementById('urm-gate'),
    orient: !!document.getElementById('ripOrient'),
    wallet: !!window.RipWallet,
  }));
  await page.evaluate(() => __rrpc.start(false));
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const s = __rrpc.G.ship, F = RRGame.F;
    __rrpc._camStep(40, 1 / 60);
    const at = x => { s.x = x; s.y = -3.05; s.alive = true; __rrpc._camStep(2, 1 / 60);
      const p = __rrpc.cam.camera.worldToScreen(new pc.Vec3(x, -3.05, 0), new pc.Vec3());
      return { x: Math.round(p.x), on: p.x >= 0 && p.x <= innerWidth && p.z > 0 }; };
    return { cam: __rrpc._cam(), L: at(-F.X), R: at(F.X), fieldX: F.X, w: innerWidth,
             mode: __rrpc.G.mode };
  });
  await ctx.close();
  return { env, m, errs };
}

const port = await drive('play.html', 390, 844);
ok(port.env.gate === false, 'PORTRAIT: no pre-launch veil — a stranger is not asked for a password');
ok(port.env.orient === false, '…and no "turn it sideways" veil on the orientation a feed hands you');
/* ⛔ THE SAME ARGUMENT SuperRare's security team MADE ABOUT THE EMBED, with more force: a game
 * arriving from a social post that asks for a wallet is indistinguishable from a phish. */
ok(port.env.wallet === false, '…and NO wallet module is loaded at all');
ok(port.m.mode === 'play', '…and it reaches play without any further interaction', port.m.mode);

console.log('\n── 4 · PORTRAIT FRAMES THE FIELD ──────────────────────────────────────────────');
/* The load-bearing one. Before this work a 390×844 camera showed ±2.02 of a ±6.3 field. */
ok(port.m.cam.hw >= port.m.fieldX,
  'the visible half-width covers the playable half-width',
  port.m.cam.hw + ' vs field ' + port.m.fieldX);
ok(port.m.cam.horiz === true, '…by framing HORIZONTALLY, so the surplus goes into height',
  'fov ' + port.m.cam.fov);
/* ⚑ The assertion that discriminates: "the camera is wide enough" is arithmetic, "the ship is on
 * screen at the edge of its own bounds" is the player's question. Projected through the LIVE
 * camera, not the nominal one. */
ok(port.m.L.on && port.m.R.on,
  'the ship is ON SCREEN at BOTH field edges — projected through the live camera',
  'left x=' + port.m.L.x + ' right x=' + port.m.R.x + ' of 0..' + port.m.w);

console.log('\n── 5 · AND THE BUILD THAT "PLAYS GREAT" DID NOT MOVE ──────────────────────────');
for (const [W, H, label] of [[844, 390, 'landscape phone'], [1280, 800, 'desktop']]) {
  const r = await drive('riprocketer.html', W, H);
  ok(r.m.cam.horiz === false && Math.abs(r.m.cam.fov - 42) < 0.01,
    label + ': still the vertical 42° frame, unchanged',
    'fov ' + r.m.cam.fov + ' horiz ' + r.m.cam.horiz);
  ok(r.m.L.on && r.m.R.on, label + ': ship still on screen at both field edges');
  ok(r.errs.length === 0, label + ': no page errors', r.errs.slice(0, 2).join(' | ') || 'clean');
}

console.log('\n── 6 · NOTHING THREW ──────────────────────────────────────────────────────────');
ok(port.errs.length === 0, 'the share cabinet boots clean in portrait',
  port.errs.slice(0, 2).join(' | ') || 'clean');

console.log('\n── 7 · feed.html DECLARES A PLAYER CARD, WITHOUT BURNING THE FALLBACK ─────────');
/* The literal in-feed ask. ⛔ Whether X RENDERS this is gated per domain and is not ours to
 * decide — so what is asserted here is only what we control: that the declaration is correct and
 * that an IGNORED player card still degrades to the large-image card play.html already ships. */
for (const [re, what] of [
  [/<meta name="twitter:card" content="player">/, 'twitter:card = player'],
  [new RegExp('<meta name="twitter:player" content="https://[^"]+/feed\\.html">'), 'twitter:player (absolute, https)'],
  [/<meta name="twitter:player:width" content="480">/, 'twitter:player:width'],
  [/<meta name="twitter:player:height" content="480">/, 'twitter:player:height'],
  [/<meta name="twitter:image" content="https:\/\//, 'twitter:image — X\'s documented fallback, kept'],
]) ok(re.test(feed), 'feed.html carries ' + what);
/* ⚠ A page that still points at the OTHER page would hand X a mixed declaration — the card would
 * frame one url and canonicalise another. ⛔ COMMENTS ARE EXEMT, same rule as `test:name`: the
 * note explaining WHY these are two files has to name the other file, and a checker that fires on
 * its own explanation gets muted. So this asks about URLs — href, src, content — not the string. */
{
  const bare = feed.replace(/<!--[\s\S]*?-->/g, '');
  ok(!/play\.html/.test(bare), 'no play.html URL survived into feed.html (comments exempt)',
    (bare.match(/.{0,40}play\.html.{0,20}/) || ['none'])[0]);
  /* ⚑ and the exemption is proved to DISCRIMINATE — otherwise "no url" is trivially true of a
   * checker that strips everything. The comment really does mention it; the markup must not. */
  ok(/play\.html/.test(feed) && !/play\.html/.test(bare),
    '…and the exemption is doing real work — the comment names it, the markup does not');
}
/* ⚑ The player must be HTTPS or X refuses it outright, and it is the one value here that cannot
 * be relative — a crawler resolves it against nothing it can be trusted to guess. */
ok(!/<meta name="twitter:player" content="(?!https:\/\/)/.test(feed), 'the player url is absolute https');

console.log('\n── 8 · AND THE GAME ACTUALLY SURVIVES THE FRAME ───────────────────────────────');
/* ⛔ THE LOAD-BEARING ONE, AND THE HALF NOBODY CHECKS. Declaring a player card is four meta tags;
 *   whether the game RUNS once X puts it in an iframe is a different question, and every answer
 *   this repo has to it is a recorded disaster: `localStorage` THROWS at an opaque origin, there
 *   is no injected wallet, no `window.parent`, and every same-origin fetch fails. The SANDBOXED
 *   case is the worst one available and is tested BECAUSE it is the worst, not because X is known
 *   to use it.
 * ⚑ "It booted" is the weak question — a frame can boot and show a game the player cannot reach.
 *   The assertions that discriminate are that the ship is ON SCREEN at both edges of its own
 *   field, projected through the LIVE camera, and that a real touch drag MOVES it. */
async function framed(sandbox, sabotage) {
  const ctx = await br.newContext({ viewport: { width: 600, height: 640 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const url = `http://127.0.0.1:${PORT}/__parent?sandbox=${sandbox ? 1 : 0}`
    + (sabotage ? '&sabotage=' + sabotage : '');
  /* ⛔ EVERY PROBE RETURNS {err} AND NEVER THROWS. A sabotage removes exactly the thing the
   * harness reaches for, so that is precisely the moment it must still speak — a crashed
   * harness prints no FAIL line and no total, which reads like a clean run. Recorded twice. */
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    let fr = null;
    for (let i = 0; i < 60 && !fr; i++) {
      fr = page.frames().find(f => f !== page.mainFrame() && /feed\.html|__sabotage/.test(f.url()));
      if (!fr) await page.waitForTimeout(250);
    }
    if (!fr) throw new Error('no child frame');
    await fr.waitForFunction(() => window.__rrpc && window.__rrpc._cam, null, { timeout: 60000 });
    const m = await fr.evaluate(async () => {
      const o = { ls: (() => { try { localStorage.setItem('__p', '1'); localStorage.removeItem('__p');
                                     return 'ok'; } catch (e) { return 'THROWS'; } })() };
      o.gate = !!document.getElementById('urm-gate');
      o.orient = !!document.getElementById('ripOrient');
      o.wallet = !!window.RipWallet;
      __rrpc.start(false);
      await new Promise(r => setTimeout(r, 800));
      o.mode = __rrpc.G.mode; o.cam = __rrpc._cam(); o.fieldX = RRGame.F.X; o.w = innerWidth;
      const s = __rrpc.G.ship;
      __rrpc._camStep(40, 1 / 60);
      const at = x => { s.x = x; s.y = -3.05; s.alive = true; __rrpc._camStep(2, 1 / 60);
        const p = __rrpc.cam.camera.worldToScreen(new pc.Vec3(x, -3.05, 0), new pc.Vec3());
        return p.x >= 0 && p.x <= innerWidth && p.z > 0; };
      o.L = at(-RRGame.F.X); o.R = at(RRGame.F.X);
      s.x = 0; s.vx = 0;
      return o;
    });
    // a real finger, dispatched at the PARENT's coordinates, over the iframe
    const box = await page.locator('iframe').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height * 0.72;
    const cdp = await page.context().newCDPSession(page);
    const pt = { x: cx, y: cy, radiusX: 8, radiusY: 8, force: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent',
        { type: 'touchMove', touchPoints: [{ ...pt, x: cx + i * 14 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(450);
    m.moved = await fr.evaluate(() => Math.abs(__rrpc.G.ship.x));
    await ctx.close();
    return { m, errs };
  } catch (e) { await ctx.close().catch(() => {}); return { err: String(e.message || e).slice(0, 140), errs }; }
}

/* SECTION 9 is a much heavier cabinet and its lobby needs two presses (Practice → the controls
 * card → Start), so it gets its own driver rather than bending the one above. */
async function framedS9() {
  const ctx = await br.newContext({ viewport: { width: 600, height: 640 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 150)));
  try {
    await page.goto(`http://127.0.0.1:${PORT}/__parent?s9=1`, { waitUntil: 'load', timeout: 120000 });
    let fr = null;
    for (let i = 0; i < 80 && !fr; i++) {
      fr = page.frames().find(f => f !== page.mainFrame() && /s9feed\.html/.test(f.url()));
      if (!fr) await page.waitForTimeout(250);
    }
    if (!fr) throw new Error('no child frame');
    await fr.waitForFunction(() => document.getElementById('btnPractice'), null, { timeout: 90000 });
    await page.waitForTimeout(5000);
    const m = await fr.evaluate(() => {
      const o = {};
      o.gate = !!document.getElementById('urm-gate');
      o.orient = !!document.getElementById('ripOrient');
      o.RipWallet = !!window.RipWallet; o.RipSession = !!window.RipSession;
      o.ethereum = !!window.ethereum;
      o.missingIds = ['btnAnte', 'anteVal', 'cardsVal', 'cardGrid', 'cardsInfo', 'potLine',
                      'roster', 'pickN', 'buildNote', 'lobNote'].filter(id => !document.getElementById(id));
      const vis = id => { const e = document.getElementById(id);
        return e ? getComputedStyle(e).display !== 'none' : null; };
      o.wagerHidden = vis('btnAnte') === false && vis('lobNote') === false;
      o.visibleText = (document.getElementById('ovLobby') || document.body).innerText || '';
      o.vpH = innerHeight;
      return o;
    });
    await fr.evaluate(() => document.getElementById('btnPractice').click());
    await page.waitForTimeout(2500);
    Object.assign(m, await fr.evaluate(() => {
      const b = document.getElementById('gh-start');
      if (!b) return { startPinned: false, startTop: null };
      const r = b.getBoundingClientRect();
      return { startPinned: r.top >= 0 && r.bottom <= innerHeight && r.width > 0,
               startTop: Math.round(r.top) };
    }));
    await fr.evaluate(() => { const b = document.getElementById('gh-start'); if (b) b.click(); });
    await page.waitForTimeout(11000);
    Object.assign(m, await fr.evaluate(() => ({
      lobbyAfter: !!document.querySelector('#ovLobby.show'),
      started: !!window.__s9game && !document.querySelector('#ovLobby.show'),
      hudVisible: [...document.querySelectorAll('.hud')]
        .filter(e => getComputedStyle(e).display !== 'none').length,
    })));
    await ctx.close();
    return { m, errs };
  } catch (e) { await ctx.close().catch(() => {}); return { err: String(e.message || e).slice(0, 150), errs }; }
}

for (const [sandbox, label] of [[false, 'CROSS-ORIGIN (what a player card does)'],
                                [true, 'SANDBOXED, OPAQUE ORIGIN (the worst case)']]) {
  const r = await framed(sandbox, null);
  if (r.err) { ok(false, label + ': the game runs in the frame', r.err); continue; }
  const m = r.m;
  ok(m.mode === 'play', label + ': reaches play inside the iframe, no further interaction', m.mode);
  ok(m.cam.hw >= m.fieldX, '…and frames the whole playable width at 480×480',
    (+m.cam.hw).toFixed(2) + ' vs field ' + m.fieldX);
  ok(m.L && m.R, '…with the ship ON SCREEN at both field edges, through the live camera');
  /* ⚑ The one that makes it a GAME rather than a picture. */
  ok(m.moved > 0.5, '…and a real touch drag MOVES the ship', 'Δx ' + m.moved.toFixed(2));
  ok(!m.gate && !m.orient && !m.wallet, '…no veil and no wallet reached the frame');
  ok(r.errs.length === 0, '…and nothing threw', r.errs.slice(0, 2).join(' | ') || 'clean');
  if (sandbox) ok(m.ls === 'THROWS',
    '…and this really WAS the hostile case — localStorage threw and the game did not care');
}
/* ⛔ PROVED TO BITE. "The frame shows the whole field" is the assertion with real weight here, and
 * "it booted" would be trivially true without it — so the horizontal-framing branch is deleted and
 * the suite is required to notice. This reproduces a defect the project SHIPPED: the game runs,
 * nothing errors, and two thirds of the playfield is off screen.
 * ⚠ The detail reports WHAT HAPPENED rather than what was hoped for — the first version of this
 * block printed "the veil rendered" on every run that did not error, which is a harness agreeing
 * with you. Two earlier sabotages (gate.js, orient.js) DID NOT ENGAGE at all and so proved
 * nothing; the comment at `/__sabotage` records why. */
{
  const r = await framed(false, 'noframe');
  const narrow = !!(r.m && r.m.cam && r.m.cam.hw < r.m.fieldX);
  const lost = !!(r.m && (!r.m.L || !r.m.R));
  const caught = !!r.err || narrow || lost;
  ok(caught, 'SABOTAGE: deleting the horizontal-framing branch is CAUGHT at 480×480',
    r.err ? 'the frame never reached play: ' + r.err
          : caught ? 'visible half-width fell to ' + (+r.m.cam.hw).toFixed(2) + ' of a '
                     + r.m.fieldX + ' field — ship on screen at edges: L=' + r.m.L + ' R=' + r.m.R
                   : 'DID NOT ENGAGE — hw ' + (+r.m.cam.hw).toFixed(2) + ' still covers the field, '
                     + 'so this sabotage proves nothing');
}

console.log('\n── 9 · THE CLAIM THIS PAGE MAKES IS THE CLAIM IT CAN KEEP ─────────────────────');
/* ⚠ The post that went out read "CLICK TO PLAY IN FEED" over a `summary_large_image`, which a link
 * card cannot keep — you tap it and X opens the game in its in-app browser. The page's own copy
 * must not repeat that: `play.html` may promise a tap, never an in-feed frame. */
ok(!/in[- ]feed/i.test(html), 'play.html never promises "in feed" — it is a link card and says so');

console.log('\n── 10 · SECTION 9 IN THE FRAME ────────────────────────────────────────────────');
/* The second cabinet. ⛔ The wallet is deliberately NOT in here — see build-play.mjs's block for
 * the measurement (`window.ethereum` is false in a third-party iframe, so injected wallets are
 * structurally unreachable) and for the reason this repo has refused wallet-in-embed twice. */
{
  const s9 = await readFile(join(ROOT, 's9feed.html'), 'utf8');
  const { buildS9Feed } = await import('./build-play.mjs').catch(() => ({}));
  ok(!!buildS9Feed && (await buildS9Feed()) === s9,
    's9feed.html IS what scripts/build-play.mjs produces right now');
  for (const [re, what] of [
    [/<meta name="twitter:card" content="player">/, 'the player card'],
    [new RegExp('<meta name="twitter:player" content="https://[^"]+/s9feed\\.html">'), 'twitter:player'],
    [/<meta name="twitter:image" content="https:\/\/[^"]+s9-card\.png">/, 'the image fallback'],
  ]) ok(re.test(s9), 's9feed.html carries ' + what);
  const card = await stat(join(ROOT, 'media/site/s9-card.png')).catch(() => null);
  ok(card && card.size > 40 * 1024 && card.size < 5 * 1024 * 1024,
    'media/site/s9-card.png exists and is a real image',
    card ? (card.size / 1024).toFixed(0) + ' KB' : 'MISSING — the card would render blank');
  /* ⛔ THE ONE FOUND BY LOOKING AT THE FRAME. js/s9pc-ui.js picks #lobNote off wallet state, so
   * with RipWallet dropped it falls into the "Connect a wallet (sign the ledger) to ante real
   * $3030" branch — a dead instruction, in a timeline, on the surface where asking for a wallet
   * is indistinguishable from a phish. And the lobby's own copy still sold an ante that is gone.
   * Both are asserted on the RENDERED frame below, not on the source, because the note is
   * written by JS at runtime and a text match on the file cannot see it. */
  for (const [src, why] of [['js/wallet.js', 'the wallet'], ['js/session.js', 'the SIWE seat'],
                            ['js/orient.js', 'the sideways veil'], ['gate.js', 'the pre-launch veil']])
    ok(!new RegExp('<script src="[^"]*' + src.replace(/[/.]/g, '\\$&') + '"').test(s9),
      's9feed.html drops ' + why);

  const r = await framedS9();
  if (r.err) { ok(false, 'SECTION 9 runs in a 480×480 frame', r.err); }
  else {
    ok(!r.m.gate && !r.m.orient, 'no veil reached the frame');
    ok(!r.m.RipWallet && !r.m.RipSession && !r.m.ethereum,
      'no wallet module and no injected provider in the frame',
      'ethereum=' + r.m.ethereum + ' (3p iframes never get one)');
    /* ⚑ HIDDEN, NOT REMOVED — the driver writes to every one of these and deleting them throws
     * inside the lobby, which would fail in the one way nobody sees from the arcade. */
    ok(r.m.missingIds.length === 0,
      'every id js/s9pc-ui.js writes to is STILL in the document',
      r.m.missingIds.length ? 'MISSING: ' + r.m.missingIds.join(',') : 'all present');
    ok(r.m.wagerHidden, '…and the ante / staking / pot / roster are hidden');
    /* ⛔ the dead instruction, asserted on what a reader actually SEES. */
    ok(!/connect a wallet/i.test(r.m.visibleText),
      '…and nothing in the frame tells a stranger to connect a wallet',
      (r.m.visibleText.match(/.{0,46}onnect a wallet.{0,30}/) || ['clean'])[0]);
    ok(!/antes/i.test(r.m.visibleText),
      '…and the copy no longer sells an ante this build does not offer');
    /* ⚠ NOT "the button exists" — it did, 2.3 screens down. The question is whether it is on
     * screen without scrolling, which is what a reader handed a game by a feed will do. */
    ok(r.m.startPinned, 'the START control is on screen at scroll 0, pinned over the controls',
      'top ' + r.m.startTop + ' of ' + r.m.vpH);
    ok(r.m.started, '…and pressing it actually starts the match', 'lobby gone: ' + !r.m.lobbyAfter);
    ok(r.m.hudVisible >= 1, '…with the HUD up', r.m.hudVisible + ' blocks');
    ok(r.errs.length === 0, '…and nothing threw', r.errs.slice(0, 2).join(' | ') || 'clean');
  }
}

await br.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* Site music — theme.js drives SoundCloud's widget, and must be able to fail.   npm run test:theme
 *
 * ⛔ THE ONLY ASSERTION HERE THAT MEANS ANYTHING IS THE SABOTAGE. "Does the music play" cannot be
 *   asked in this container at all — outbound TLS from headless Chromium is reset, so
 *   w.soundcloud.com is unreachable by construction and every network path answers "no". That is
 *   also exactly why the failure path is the one worth guarding: a visitor whose network, blocker
 *   or corporate proxy eats a third-party player sees the SAME thing this container sees, and the
 *   question is what the page does about it. The answer must be: removes the button and changes
 *   nothing else. A button that does nothing is worse than no button.
 *
 * ⚑ SO THE WIDGET IS STUBBED, NOT FETCHED. theme.js reads `window.SC.Widget`; an init script
 *   defines it before the page loads, so both paths — a widget that reports READY and one that
 *   never does — are drivable locally and neither depends on SoundCloud being up.
 *
 * ⚠ The healthy path is asserted TOO, because "the button went away" is trivially satisfied by a
 *   module that always buries itself. Both directions or neither.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.gif': 'image/gif' };
const PORT = 8971;

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ok   ' + msg + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + msg + (detail ? '  — ' + detail : '')); }
};
const head = t => console.log('\n' + t);

const THEME = await readFile(join(ROOT, 'theme.js'), 'utf8');

/* A bare page that loads theme.js and nothing else. Using index.html would drag in the veil, the
 * wordmark canvas and nine other modules, so a failure there could be any of them. */
const HOST = `<!doctype html><meta charset="utf-8"><title>t</title><body><script src="/theme.js"></script>`;

const srv = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/host.html') {
    res.writeHead(200, { 'content-type': 'text/html' }); return res.end(HOST);
  }
  try {
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => srv.listen(PORT, r));
const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

/* The stub. `mode:'ready'` fires READY on the next tick; `mode:'dead'` never fires it, which is
 * what a blocked or slow third-party player looks like from the page's side. */
const STUB = (mode) => {
  window.__scCalls = [];
  const binds = {};
  window.SC = {
    Widget: Object.assign(function (el) {
      window.__scFrame = el;
      const w = {
        bind(ev, fn) { (binds[ev] = binds[ev] || []).push(fn); },
        unbind(ev) { delete binds[ev]; },
        play() { window.__scCalls.push('play'); (binds.play || []).forEach(f => f()); },
        pause() { window.__scCalls.push('pause'); (binds.pause || []).forEach(f => f()); },
        skip(n) { window.__scCalls.push('skip:' + n); (binds.play || []).forEach(f => f()); },
        next() { window.__scCalls.push('next'); (binds.play || []).forEach(f => f()); },
        prev() { window.__scCalls.push('prev'); (binds.play || []).forEach(f => f()); },
        seekTo(ms) { window.__scCalls.push('seekTo:' + ms); },
        setVolume(v) { window.__scCalls.push('vol:' + v); },
        getSounds(cb) { cb([{ title: 'one' }, { title: 'two' }, { title: 'three' }]); },
        getCurrentSoundIndex(cb) { cb(1); },
        getCurrentSound(cb) { cb({ title: 'TWO', user: { username: 'BASIX' } }); },
      };
      if (mode === 'ready') setTimeout(() => (binds.ready || []).forEach(f => f()), 10);
      return w;
    }, {
      Events: { READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish',
        PLAY_PROGRESS: 'playProgress' },
    }),
  };
};

/* ⚠ TWO HARNESS FACTS, BOTH LEARNED BY A FALSE FAILURE.
 *   · The player iframe is appended during DOMContentLoaded, and a dynamically inserted iframe
 *     with a src DELAYS the window load event. Pointed at w.soundcloud.com — unreachable from
 *     this container — `waitUntil:'load'` therefore returned only after the connection gave up,
 *     which was PAST theme.js's own 9 s budget. The grace-period assertion read a button that had
 *     already been correctly buried and called it a bug. Wait for the document, not the network.
 *   · The third-party request is aborted outright so the timing is the module's, not the
 *     container's. The widget object itself is stubbed, so nothing under test needs that fetch. */
async function run(mode, prep) {
  const ctx = await br.newContext({ viewport: { width: 900, height: 700 } });
  await ctx.route('**w.soundcloud.com**', r => r.abort());
  await ctx.addInitScript(STUB, mode);
  if (prep) await ctx.addInitScript(prep);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(`http://127.0.0.1:${PORT}/host.html`,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__urmTheme, null, { timeout: 15000 });
  return { page, ctx, errs };
}

// ── 1 · the source itself ─────────────────────────────────────────────────────────────────
head('1 · the record is streamed, not taken');
ok(!/smilingman/.test(THEME), 'the retired song is gone from theme.js');
ok(/w\.soundcloud\.com\/player\/api\.js/.test(THEME), 'drives SoundCloud\'s own Widget API');
ok(/api\.soundcloud\.com\/playlists\/2273003258/.test(THEME), 'points at the GO-TEAM! set');
ok(!/\.mp3|\.m4a|\.ogg|\.wav/i.test(THEME), 'no audio file is referenced', 'nothing re-hosted');
ok(/window\.self\s*!==\s*window\.top/.test(THEME),
  'no-ops inside an iframe', 'or every embedded card starts its own copy of the album');

// ── 2 · the healthy path ──────────────────────────────────────────────────────────────────
head('2 · a widget that comes up plays, and says what it is playing');
{
  const { page, ctx, errs } = await run('ready');
  const b0 = await page.evaluate(() => !!document.getElementById('soundToggle'));
  ok(b0, 'the button mounts');

  await page.click('#soundToggle');
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({
    ready: window.__urmTheme.ready, dead: window.__urmTheme.dead,
    playing: window.__urmTheme.playing,
    label: (document.getElementById('soundToggle') || {}).textContent || '',
    frames: document.querySelectorAll('iframe').length,
    src: (window.__scFrame || {}).src || '',
    calls: window.__scCalls,
    stored: localStorage.getItem('urm_sound'),
  }));
  ok(s.ready && !s.dead, 'the widget reports ready and the module lives');
  ok(s.playing, 'pressing the button plays', 'calls: ' + s.calls.join(','));
  ok(s.frames === 1, 'exactly one player iframe', String(s.frames));
  ok(/w\.soundcloud\.com\/player\//.test(s.src), 'the iframe is SoundCloud\'s player');
  ok(/auto_play=false/.test(s.src), 'the player does not autoplay on its own');
  ok(s.calls.indexOf('vol:70') >= 0, 'volume is set, not left at the default');
  /* The pill carries the track title, so the record names itself on screen rather than only in a
   * tooltip nobody opens on a phone. */
  ok(/TWO/.test(s.label), 'the pill shows the current track', JSON.stringify(s.label));
  ok(s.stored === 'on', 'the preference is written');

  await page.click('#soundToggle');
  await page.waitForTimeout(250);
  const s2 = await page.evaluate(() => ({
    playing: window.__urmTheme.playing, stored: localStorage.getItem('urm_sound'),
    calls: window.__scCalls,
  }));
  ok(!s2.playing && s2.stored === 'off', 'pressing it again pauses and remembers');
  ok(s2.calls.indexOf('pause') >= 0, 'it pauses the widget rather than muting it');
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await ctx.close();
}

// ── 3 · resume ────────────────────────────────────────────────────────────────────────────
head('3 · the next page picks the set back up where it was left');
{
  const { page, ctx } = await run('ready', () => {
    try {
      localStorage.setItem('urm_sound', 'on');
      localStorage.setItem('urm_sound_t', '73.5');
      localStorage.setItem('urm_sound_n', '2');
    } catch {}
  });
  await page.waitForTimeout(600);
  const s = await page.evaluate(() => ({
    playing: window.__urmTheme.playing, calls: window.__scCalls,
  }));
  ok(s.playing, 'a page that loads with the music on resumes without a press');
  ok(s.calls.indexOf('skip:2') >= 0, 'it returns to the saved TRACK', s.calls.join(','));
  ok(s.calls.indexOf('seekTo:73500') >= 0, 'and to the saved position within it', s.calls.join(','));
  await ctx.close();
}

// ── 4 · ⛔ THE SABOTAGE ───────────────────────────────────────────────────────────────────
head('4 · a widget that never comes up takes the button with it');
{
  /* Shorten nothing and stub nothing further: this is theme.js's real BOOT_MS path, driven by a
   * widget that is constructed successfully and simply never reports READY — which is precisely
   * what a slow, blocked or proxy-eaten third-party player looks like. */
  const { page, ctx, errs } = await run('dead', () => {
    try { localStorage.setItem('urm_sound', 'on'); } catch {}
  });
  const before = await page.evaluate(() => !!document.getElementById('soundToggle'));
  ok(before, 'the button is there while the widget is still being given its chance');

  const budget = await page.evaluate(() => window.__urmTheme.bootMs);
  await page.waitForTimeout(budget + 1500);
  const s = await page.evaluate(() => ({
    dead: window.__urmTheme.dead,
    btn: !!document.getElementById('soundToggle'),
    frames: document.querySelectorAll('iframe').length,
    stored: localStorage.getItem('urm_sound'),
    body: document.body.textContent.trim(),
  }));
  ok(s.dead, 'the module buries itself');
  ok(!s.btn, '⛔ THE BUTTON IS GONE — no control that does nothing');
  ok(s.frames === 0, 'and the dead player iframe is removed too', String(s.frames));
  ok(s.stored === 'off', 'the stored preference does not keep retrying a player that cannot run');
  ok(s.body === '', 'nothing else on the page changed', JSON.stringify(s.body.slice(0, 40)));
  ok(errs.length === 0, 'it fails quietly, not by throwing', errs.join(' | '));
  await ctx.close();
}

// ── 5 · no API at all ─────────────────────────────────────────────────────────────────────
head('5 · and if SoundCloud\'s script never arrives at all');
{
  const ctx = await br.newContext({ viewport: { width: 900, height: 700 } });
  // no stub: window.SC is never defined, and the real api.js cannot be fetched from here
  await ctx.route('**w.soundcloud.com**', r => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('urm_sound', 'on'); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await page.goto(`http://127.0.0.1:${PORT}/host.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const budget = await page.evaluate(() => window.__urmTheme.bootMs);
  await page.waitForTimeout(budget + 1500);
  const s = await page.evaluate(() => ({
    dead: window.__urmTheme.dead, btn: !!document.getElementById('soundToggle'),
  }));
  ok(s.dead && !s.btn, 'a blocked api.js buries the button too');
  ok(errs.length === 0, 'still no page errors', errs.join(' | '));
  await ctx.close();
}

// ── 6 · ⛔ THE EXIT HANDLER MUST NOT SAVE NOTHING ─────────────────────────────────────────
head('6 · opening a page and leaving does not wipe the saved place');
{
  /* `flush()` runs on every pagehide whether anything played or not. Seeded from 0 instead of from
   * storage, merely OPENING a page wrote 0/0 over the saved place — so a quick click through the
   * card browser sent the set back to the top of track one on the FIRST navigation. That reads as
   * "the resume is broken" and is really the exit handler diligently saving nothing at all. */
  const { page, ctx } = await run('ready', () => {
    try {
      localStorage.setItem('urm_sound', 'off');        // music off: nothing will play here
      localStorage.setItem('urm_sound_t', '120.5');
      localStorage.setItem('urm_sound_n', '3');
    } catch {}
  });
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const s = await page.evaluate(() => ({
    t: localStorage.getItem('urm_sound_t'), n: localStorage.getItem('urm_sound_n'),
  }));
  ok(parseFloat(s.t) === 120.5, 'the saved position survives a page that never played', 't=' + s.t);
  ok(parseInt(s.n, 10) === 3, 'and so does the saved track', 'n=' + s.n);
  await ctx.close();
}

// ── 7 · ⛔ IN A CABINET IT LIVES IN THE TOGGLES ROW, AND IT MUST STILL BE REACHABLE ───────
head('7 · the cabinets: no floating pill over the playfield, and the cog still opens it');
{
  /* Driven at 844×390 the old bottom-right pill sat ON DOGFIGHT's FIRE pad and THE CITY's flap
   * and mode buttons, winning the hit test — banner.js's recorded failure, repeated. The control
   * belongs in the `.toggles` row instead. ⚠ But "it does not cover anything" is trivially
   * satisfied by a control that is never rendered, so the load-bearing half of this block is that
   * OPENING THE COG REVEALS IT and it still drives the music. */
  const CABS = ['/city.html', '/dogfight.html', '/riprocketer.html',
                '/cloudracer.html', '/ronin.html', '/section9.html'];
  for (const page_ of CABS) {
    const [w, h] = [844, 390];
    const ctx = await br.newContext({ viewport: { width: w, height: h }, hasTouch: true });
    await ctx.route('**w.soundcloud.com**', r => r.abort());
    await ctx.addInitScript(STUB, 'ready');
    await ctx.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message.slice(0, 110)));
    await p.goto(`http://127.0.0.1:${PORT}${page_}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await p.waitForTimeout(2500);

    const placed = await p.evaluate(() => {
      const b = document.getElementById('soundToggle');
      return { exists: !!b, inRow: !!(b && b.closest('.toggles')), pill: !!(b && b.style.position === 'fixed') };
    });
    ok(placed.exists, `${page_}: the music control is on the page`);
    ok(placed.inRow, `${page_}: it is IN the toggles row`, 'not floating over the playfield');
    ok(!placed.pill, `${page_}: it is not a fixed pill here`);

    /* ⚠ TWO HARNESS FACTS, BOTH OF WHICH READ AS PRODUCT BUGS FIRST.
     *   · DOGFIGHT's own CSS keeps `.toggles` at `display:none` until a match starts — correct,
     *     and nothing to do with this control. Measuring in the lobby reported a 0×0 button and
     *     looked exactly like a control that never renders. The row is forced visible here so the
     *     assertion is about OUR button's reachability, not about the game's show/hide.
     *   · 300 ms after the press was not enough under suite load — the same click measured
     *     `playing:true` every time when driven alone. A timing artifact, not a dead button. */
    await p.evaluate(() => {
      const row = document.querySelector('.toggles'); if (row) row.style.display = 'flex';
      const c = document.getElementById('tgCog'); if (c) c.click();
    });
    await p.waitForTimeout(300);
    const open = await p.evaluate(() => {
      const b = document.getElementById('soundToggle'); if (!b) return { no: true };
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      /* ⚠ A cabinet sitting in its LOBBY has a launch overlay above everything (z-index 10 vs the
       * toggles row's 6) — correct, and it owns the hit test until the match starts. That is not
       * this control being covered by a game control, which is what section 7 exists to catch, so
       * the question is only asked when no overlay is up. Asking it anyway reported DOGFIGHT's
       * lobby as a defect. */
      const veiled = !!document.querySelector('.ov.show, #ripOrient:not([hidden])');
      return { w: Math.round(r.width), h: Math.round(r.height), veiled,
        own: !!(hit && (hit === b || b.contains(hit))), label: b.textContent };
    });
    ok(open.w > 0 && open.h >= 44, `${page_}: opening the cog reveals a real 44px control`,
      open.w + 'x' + open.h);
    ok(open.veiled || open.own,
      `${page_}: and the press lands on it, not on a game control underneath`,
      open.veiled ? 'lobby overlay is up — correctly on top' : 'hit-tested clear');

    await p.evaluate(() => document.getElementById('soundToggle').click());
    await p.waitForTimeout(1200);
    const playing = await p.evaluate(() => window.__urmTheme.playing);
    ok(playing, `${page_}: pressing it actually starts the music`);
    ok(errs.length === 0, `${page_}: no page errors`, errs.join(' | '));
    await ctx.close();
  }
}

// ── 8 · the games' own music is gone ──────────────────────────────────────────────────────
head('8 · one soundtrack, not four');
{
  const files = ['dogfight.html', 'riprocketer.html', 'section9.html',
    'js/rrpc-app.js', 'js/s9pc-ui.js', 'js/s9pc-app.js'];
  let hits = [];
  for (const f of files) {
    const t = await readFile(join(ROOT, f), 'utf8');
    for (const pat of ['tgMusic', 'dfMusic', 'rrMusic', 's9Music', 'playMusic', 'toggleMusic'])
      if (t.includes(pat)) hits.push(f + ':' + pat);
  }
  ok(hits.length === 0, 'no cabinet still drives its own soundtrack', hits.join(', ') || 'clean');
  for (const f of ['city.html', 'cloudracer.html', 'dogfight.html', 'riprocketer.html',
                   'ronin.html', 'section9.html', 'arcade.html']) {
    const t = await readFile(join(ROOT, f), 'utf8');
    ok(/<script src="theme\.js"><\/script>/.test(t), f + ' carries the site music');
  }
}

// ── 9 · the transport ─────────────────────────────────────────────────────────────────────
head('9 · skip forward, skip back, and both work from a standing start');
{
  /* Artist: *"the ability to skip tracks or go back through tracks along with pause / play."*
   * ⚠ The load-bearing case is skipping while PAUSED. `next()` on a parked player moves the
   * needle and stays parked, so the press would look dead — a skip is a request for the next
   * TRACK, not a silent seek, so it has to start playing too. */
  const { page, ctx, errs } = await run('ready');
  const present = await page.evaluate(() => ({
    prev: !!document.getElementById('soundPrev'),
    play: !!document.getElementById('soundToggle'),
    next: !!document.getElementById('soundNext'),
    taps: ['soundPrev', 'soundToggle', 'soundNext'].map(id => {
      const r = document.getElementById(id).getBoundingClientRect();
      return Math.round(Math.min(r.width, r.height));
    }),
    offscreen: (() => { const r = document.getElementById('soundBar').getBoundingClientRect();
      return r.right > innerWidth + 1 || r.left < -1; })(),
  }));
  ok(present.prev && present.play && present.next, 'all three transport controls are there');
  ok(present.taps.every(v => v >= 44), 'every one clears the 44px tap floor', present.taps.join('/'));
  ok(!present.offscreen, 'the bar fits the viewport');

  // from a standing start (never played), NEXT must both skip and start
  await page.click('#soundNext');
  await page.waitForTimeout(900);
  let s = await page.evaluate(() => ({ playing: window.__urmTheme.playing, calls: window.__scCalls }));
  ok(s.calls.indexOf('next') >= 0, 'NEXT asks the widget for the next track', s.calls.join(','));
  ok(s.playing, '…and starts playing rather than skipping in silence');

  await page.click('#soundPrev');
  await page.waitForTimeout(500);
  s = await page.evaluate(() => window.__scCalls);
  ok(s.indexOf('prev') >= 0, 'PREV goes back through the set', s.join(','));
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await ctx.close();
}

// ── 10 · a dead widget takes the WHOLE transport with it ──────────────────────────────────
head('10 · burying removes every control, not just the play button');
{
  /* The transport was added after bury() was written. Burying one of three would leave skip
   * buttons that skip nothing — exactly the failure the burial exists to prevent. */
  const { page, ctx } = await run('dead', () => {
    try { localStorage.setItem('urm_sound', 'on'); } catch {}
  });
  const budget = await page.evaluate(() => window.__urmTheme.bootMs);
  await page.waitForTimeout(budget + 1500);
  const left = await page.evaluate(() => ['soundPrev', 'soundToggle', 'soundNext', 'soundBar']
    .filter(id => !!document.getElementById(id)));
  ok(left.length === 0, 'every control is gone, bar included', left.join(',') || 'clean');
  await ctx.close();
}

await br.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

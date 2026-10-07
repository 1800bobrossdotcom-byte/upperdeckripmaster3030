#!/usr/bin/env node
/* THE UPDATES LOG, DRIVEN.   npm run test:updates
 *
 * ⚑ WHY A SUITE AND NOT A LOOK. Every failure this page can have is silent. A shot whose file is
 *   missing is a broken-picture icon on the one page whose entire job is showing people things; a
 *   COPY button that reports success and puts nothing on the clipboard sends an empty post; a
 *   blurb that has quietly grown past 280 characters is refused by X at the moment somebody tries
 *   to use it. None of those throws, and none is visible in the first screen.
 * ⛔ AND THE CLIPBOARD PATH IS THE ONE WORTH GUARDING. `navigator.clipboard` is unavailable on an
 *   insecure origin and can be refused outright by a permission policy, so the interesting
 *   question is not "does copy work" but "what happens when it cannot" — theme.js's rule, that a
 *   control which reports nothing is worse than no control. Both paths are driven: granted, and
 *   a writeText that rejects.
 */
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${d ? '  — ' + d : ''}`); };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const missed = [];
const srv = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let p = join(ROOT, u);
  try { if (statSync(p).isDirectory()) p = join(p, 'index.html'); } catch {}
  let b = null; try { b = readFileSync(p); } catch {}
  if (b) { res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  else { missed.push(u); res.writeHead(404); res.end('no'); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

const data = JSON.parse(readFileSync(join(ROOT, 'updates.json'), 'utf8'));

console.log('\n── 1 · the record itself ──────────────────────────────────────────────────────');
ok(data.length > 0, 'updates.json carries entries', data.length + ' entries');
{
  const ids = data.map(e => e.id);
  ok(new Set(ids).size === ids.length, 'every id is unique — the id IS the screenshot filename');
  const badId = ids.filter(i => !/^[a-z0-9-]+$/.test(i));
  ok(badId.length === 0, '…and is a safe slug', badId.join(', ') || 'all clean');
  const badDate = data.filter(e => !/^\d{4}-\d{2}-\d{2}$/.test(e.date || ''));
  ok(badDate.length === 0, 'every entry is dated', badDate.map(e => e.id).join(', ') || 'all dated');
  /* ⛔ 280 IS A HARD CEILING, NOT A STYLE NOTE. Past it the post is refused at the moment somebody
   *   is trying to send it, and the natural reaction is to truncate — which ships a wrong post. */
  const over = data.filter(e => [...(e.blurb || '')].length > 280);
  ok(over.length === 0, 'every blurb fits a post',
    over.length ? over.map(e => `${e.id} ${[...e.blurb].length}`).join(', ')
                : 'longest ' + Math.max(...data.map(e => [...e.blurb].length)) + ' / 280');
  const noAlt = data.filter(e => !(e.alt || '').trim());
  ok(noAlt.length === 0, 'every shot has alt text', noAlt.map(e => e.id).join(', ') || 'all described');
  /* the shot is the deliverable; an entry claiming one that is not on disk is a broken image */
  const noFile = data.filter(e => !existsSync(join(ROOT, 'media/updates', e.id + '.webp')));
  ok(noFile.length === 0, 'every entry has its screenshot on disk',
    noFile.map(e => e.id).join(', ') || data.length + ' files');
  /* ⚠ newest first is the whole point of a log — an out-of-order entry reads as a stale page */
  const sorted = data.every((e, i) => i === 0 || data[i - 1].date >= e.date);
  ok(sorted, 'the log runs newest first');
}

console.log('\n── 2 · the page renders every entry, with its picture ─────────────────────────');
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'] });
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await page.goto(`http://127.0.0.1:${PORT}/updates.html`, { waitUntil: 'load' });
  /* ⚠ WALK THE PAGE, DO NOT JUMP TO THE BOTTOM. The shots are `loading="lazy"`, so a jump skips
   *   every image in the middle and reports them undecoded — a statement about the probe, not the
   *   page. A reader scrolls; so does this. */
  for (let y = 0; y < 12; y++) {
    await page.evaluate(n => scrollTo(0, n * innerHeight * 0.8), y);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const arts = [...document.querySelectorAll('.upd')];
    return {
      n: arts.length,
      shots: arts.length,
      loaded: arts.filter(a => { const i = a.querySelector('.upd-shot img'); return i && i.complete && i.naturalWidth > 2; }).length,
      posts: arts.filter(a => (a.querySelector('.upd-blurb')?.getAttribute('data-post') || '').length > 20).length,
      copies: document.querySelectorAll('.upd-copy').length,
    };
  });
  ok(r.n === data.length, `every entry is on the page`, `${r.n} of ${data.length}`);
  /* ⛔ THE ASSERTION THAT BITES IS naturalWidth, NOT "an <img> exists". A broken image IS an
   *   element with a src, and this page is nothing but pictures. */
  ok(r.loaded === r.n, '…and every screenshot actually decoded', `${r.loaded}/${r.n}`);
  ok(r.posts === r.n, '…and every one carries its post text', `${r.posts}/${r.n}`);
  ok(r.copies === r.n, '…and its own COPY button', `${r.copies}/${r.n}`);
  ok(errs.length === 0, 'no page errors', errs[0] || 'clean');
  ok(missed.filter(u => u.startsWith('/media/updates')).length === 0,
    'no shot 404s at the server', missed.filter(u => u.startsWith('/media/updates'))[0] || 'none');
  await ctx.close();
}

console.log('\n── 3 · COPY puts the blurb on the clipboard — the exact printed string ────────');
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/updates.html`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('.upd-copy');
  await page.waitForTimeout(700);
  const r = await page.evaluate(async () => ({
    clip: await navigator.clipboard.readText(),
    want: document.querySelector('.upd-blurb').getAttribute('data-post'),
    label: document.querySelector('.upd-copy').textContent.trim(),
  }));
  ok(r.clip.length > 20, 'something reached the clipboard', r.clip.length + ' chars');
  /* ⚑ EXACT, not "contains" — the promise this page makes is that what you read is what you send,
   *   so a copy that drops the trailing link or collapses the blank line is a different post. */
  ok(r.clip === r.want, '…and it is the blurb VERBATIM, newlines and all');
  ok(/COPIED/i.test(r.label), '…and the button says so', r.label);
  await ctx.close();
}

console.log('\n── 4 · …and when the clipboard is REFUSED it selects instead of lying ─────────');
/* ⛔ THIS IS THE ONLY ASSERTION HERE THAT MEANS ANYTHING, and it is the sabotage. An insecure
 *   origin or a permission policy makes writeText reject, which is a real state for real
 *   visitors — and the failure mode is a button that animates, says COPIED, and put nothing
 *   anywhere. Then the post goes out empty. */
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('refused')) },
      });
    } catch (e) {}
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await page.goto(`http://127.0.0.1:${PORT}/updates.html`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('.upd-copy');
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => ({
    label: document.querySelector('.upd-copy').textContent.trim(),
    sel: String(getSelection()),
    want: document.querySelector('.upd-blurb').textContent,
  }));
  ok(!/COPIED/i.test(r.label), 'it does NOT claim to have copied', r.label);
  ok(/SELECT/i.test(r.label), '…it says the text is selected instead', r.label);
  ok(r.sel.length > 20 && r.want.indexOf(r.sel.slice(0, 40)) >= 0,
    '…and the blurb really is selected, so ⌘C still works', r.sel.length + ' chars selected');
  ok(errs.length === 0, 'and a refused clipboard throws nothing', errs[0] || 'clean');
  await ctx.close();
}

console.log('\n── 5 · it is usable on a phone ────────────────────────────────────────────────');
for (const [w, h] of [[390, 844], [320, 568]]) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/updates.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.upd-copy, .upd-go')].map(el => {
      const q = el.getBoundingClientRect();
      return { t: (el.className || '') + '', h: Math.round(q.height) };
    });
    const el = document.querySelector('.upd-copy');
    el.scrollIntoView({ block: 'center' });
    const q = el.getBoundingClientRect();
    const mid = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    return { under: b.filter(x => x.h < 44), own: mid === el || el.contains(mid),
      got: mid ? (mid.id || mid.className || mid.tagName) + '' : 'none',
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  ok(r.under.length === 0, `${w}×${h} — every control clears the 44px floor`,
    r.under.map(x => x.t + ' ' + x.h).join(' · ') || 'all clear');
  ok(r.own, `${w}×${h} — COPY takes its own press`, String(r.got).slice(0, 30));
  ok(r.over <= 0, `${w}×${h} — the page does not scroll sideways`, r.over + 'px');
  await ctx.close();
}

await br.close();
srv.close();
console.log(`\n${fail ? '⛔' : '✅'}  the updates log — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

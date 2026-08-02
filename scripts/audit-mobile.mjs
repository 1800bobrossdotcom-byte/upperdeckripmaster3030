#!/usr/bin/env node
/* MOBILE AUDIT — `npm run mobile`
 *
 * The artist's note was "website needs to be hyper mobile friendly, smart animations, text, etc."
 * That is a feeling; this turns it into four numbers per page, re-runnable, so a change can be
 * swept instead of admired.
 *
 *   1. TEXT UNDER 12px      — split into PROSE (a sentence a person reads) and LABEL (a chip, a
 *                             stat caption, a legal micro-line). The target is 0 prose; a label
 *                             at 11px is a design decision, a paragraph at 9px is a bug.
 *   1b. PROSE UNDER 16px    — the separate, stricter bar. 12px is the floor for a LABEL; a
 *                             paragraph someone actually reads on a phone needs 16px, and a
 *                             13.5px paragraph passes the 12px check while still being the
 *                             thing that makes a page feel like a pamphlet.
 *   2. TAPS UNDER 44x44     — the platform guideline, measured on the element's real hit box.
 *   3. HORIZONTAL OVERFLOW  — documentElement.scrollWidth − clientWidth, plus the elements that
 *                             actually stick out, because "1px of overflow" is useless without
 *                             a name attached to it.
 *   4. PAGE ERRORS          — pageerror + console error. A page that throws on a phone is not
 *                             a layout problem, and it hides behind one.
 *
 * ⚠ MEASURED AT 390x844, deviceScaleFactor 3, isMobile+hasTouch — an iPhone-class viewport.
 *   Layout here is trustworthy (CLAUDE.md: judge LAYOUT from screenshots freely); colour is not,
 *   and this script deliberately measures no colour.
 *
 * ⚑ "Text element" means an element with its OWN text node, not an ancestor that merely contains
 *   text. Counting ancestors triple-counts every nested <b> and makes the number meaningless.
 *
 * Usage:  npm run mobile                 all pages
 *         npm run mobile -- index cards  substring filter
 *         npm run mobile -- --json       machine-readable (for diffing two runs)
 *         npm run mobile -- --shots      also write build/mobile/<page>.png
 */
import http from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build/mobile');
const PORT = 8957;
mkdirSync(OUT, { recursive: true });

/* The pages this audit owns. Games are audited by their own harnesses — they are full-screen
 * canvases with their own input model, and a 44px rule does not describe a joystick. */
const PAGES = [
  { name: 'index', url: 'index.html', settle: 7000 },
  { name: 'arcade', url: 'arcade.html', settle: 2500 },
  { name: 'whitepaper', url: 'whitepaper.html', settle: 2500 },
  { name: 'tokenomics', url: 'tokenomics.html', settle: 2500 },
  { name: 'audit', url: 'audit.html', settle: 2500 },
  { name: 'artist', url: 'artist.html', settle: 2500 },
  { name: 'studio', url: 'studio.html', settle: 2500 },
  { name: 'binder', url: 'cards/binder.html', settle: 4000 },
  { name: 'market', url: 'cards/market.html', settle: 4000 },
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.avif': 'image/avif', '.ttf': 'font/ttf', '.pdf': 'application/pdf' };

const srv = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p.endsWith('/')) p += 'index.html';
  try {
    const d = readFileSync(join(ROOT, p));
    rs.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    rs.end(d);
  } catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(r => srv.listen(PORT, r));

/* ── the probe. Runs inside the page. ───────────────────────────────────────────────────────── */
const probe = () => {
  const MINTEXT = 12, MINPROSE = 16, MINTAP = 44;
  const vis = el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  /* An element "owns" text only if it has a direct non-empty text node. Otherwise every wrapper
   * up to <body> is counted as text and the number says nothing. */
  const ownText = el => {
    let s = '';
    for (const n of el.childNodes) if (n.nodeType === 3) s += n.nodeValue;
    return s.replace(/\s+/g, ' ').trim();
  };
  /* PROSE vs LABEL. A sentence someone reads vs a chip/caption/stat. The split matters because
   * the fix differs: prose must reach 16px, a label only has to clear the 12px floor. */
  const PROSE_TAGS = new Set(['P', 'LI', 'TD', 'BLOCKQUOTE', 'DD', 'FIGCAPTION']);
  const isProse = (el, t) => {
    if (el.closest('code,pre,kbd')) return false;
    const cs = getComputedStyle(el);
    if (cs.textTransform === 'uppercase' && t.length < 40) return false;   // a shouty chip
    if (parseFloat(cs.letterSpacing) > 1.2) return false;                  // tracked-out label
    const words = t.split(' ').filter(Boolean).length;
    if (PROSE_TAGS.has(el.tagName) && words >= 4) return true;
    return words >= 9;                                                     // a real sentence
  };

  const tiny = [], small = [], taps = [], over = [];
  const all = document.body.querySelectorAll('*');
  for (const el of all) {
    if (el.closest('#urm-gate')) continue;                                 // the gate is not the page
    const t = ownText(el);
    if (!t || !vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const p = isProse(el, t);
    const rec = { tag: el.tagName, cls: (el.className || '').toString().slice(0, 34),
      fs: +fs.toFixed(1), prose: p, txt: t.slice(0, 46) };
    if (fs < MINTEXT) tiny.push(rec);
    if (p && fs < MINPROSE) small.push(rec);
  }

  const TAP = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[tabindex]:not([tabindex="-1"])';
  for (const el of document.body.querySelectorAll(TAP)) {
    if (el.closest('#urm-gate')) continue;
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    /* The real hit box: an inline <a> that wraps onto two lines has a union box taller than any
     * one client rect, and a padded chip's border box IS the hit box. Take the larger. */
    let w = r.width, h = r.height;
    for (const q of el.getClientRects()) { w = Math.max(w, q.width); h = Math.max(h, q.height); }
    if (w < MINTAP - 0.5 || h < MINTAP - 0.5)
      taps.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 34),
        w: +w.toFixed(0), h: +h.toFixed(0), txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) });
  }

  const de = document.documentElement;
  const ovf = Math.max(0, de.scrollWidth - de.clientWidth);
  /* ⚑ Naming the culprit is most of the value, and the naive "every box wider than the viewport"
   * list is mostly noise: a marquee inside overflow:hidden is 17,000px wide ON PURPOSE and
   * scrolls nothing. Walk up and drop anything already clipped, or inside a fixed layer (which
   * does not extend the document's scroll width either). */
  const escapes = el => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.position === 'fixed') return false;
      if (n !== el && (cs.overflowX === 'hidden' || cs.overflowX === 'auto' ||
                       cs.overflowX === 'scroll' || cs.overflowX === 'clip')) return false;
    }
    return true;
  };
  if (ovf > 0) {
    const vw = de.clientWidth;
    for (const el of all) {
      if (!vis(el) || !escapes(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 0.5 || r.left < -0.5)
        over.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 34),
          l: +r.left.toFixed(0), r: +r.right.toFixed(0),
          txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) });
    }
  }

  /* Hover-only affordances: a phone has no pointer, so a rule that only exists under :hover is
   * a feature the visitor never gets. Counted, not failed — some are pure garnish. */
  let hoverOnly = 0, hoverTotal = 0;
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules || []) {
      if (!rule.selectorText) continue;
      for (const sel of rule.selectorText.split(',')) {
        if (!/:hover/.test(sel)) continue;
        hoverTotal++;
        const twin = sel.replace(/:hover/g, ':focus-visible');
        const active = sel.replace(/:hover/g, ':active');
        const has = [...rules].some(r2 => r2.selectorText &&
          r2.selectorText.split(',').some(s2 => s2.trim() === twin.trim() || s2.trim() === active.trim()));
        if (!has) hoverOnly++;
      }
    }
  }

  return { tiny, small, taps, over, ovf, hoverOnly, hoverTotal,
    docH: Math.round(de.scrollHeight), vw: de.clientWidth };
};

/* ── run ────────────────────────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const wantShots = args.includes('--shots');
const filters = args.filter(a => !a.startsWith('--'));

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const rows = [];
for (const P of PAGES) {
  if (filters.length && !filters.some(f => P.name.includes(f))) continue;
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String((e && e.message) || e).slice(0, 150)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 130)); });
  await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });

  let r = null;
  try {
    await page.goto(`http://localhost:${PORT}/${P.url}`, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(P.settle);
    r = await page.evaluate(probe);
  } catch (e) { errs.push('NAV ' + String(e && e.message).slice(0, 120)); }

  if (wantShots) { try { await page.screenshot({ path: join(OUT, P.name + '.png'), fullPage: false }); } catch {} }
  rows.push({ name: P.name, url: P.url, errs, ...(r || { tiny: [], small: [], taps: [], over: [], ovf: -1 }) });
  await ctx.close();
}
await browser.close();
srv.close();

if (wantJson) {
  writeFileSync(join(OUT, 'audit.json'), JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows.map(r => ({ name: r.name, tiny: r.tiny.length,
    tinyProse: r.tiny.filter(t => t.prose).length, proseUnder16: r.small.length,
    taps: r.taps.length, ovf: r.ovf, errs: r.errs.length })), null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  console.log('\n══ MOBILE AUDIT · 390x844 · dsf 3 · isMobile ' + '═'.repeat(38));
  console.log('   ' + pad('page', 12) + lpad('<12px', 7) + lpad('prose', 7) + lpad('prose<16', 10) +
    lpad('<44px', 7) + lpad('h-ovf', 7) + lpad('errs', 6) + lpad('height', 8) + lpad('hover-only', 12));
  console.log('   ' + '─'.repeat(76));
  for (const r of rows)
    console.log('   ' + pad(r.name, 12) + lpad(r.tiny.length, 7) + lpad(r.tiny.filter(t => t.prose).length, 7) +
      lpad(r.small.length, 10) +
      lpad(r.taps.length, 7) + lpad(r.ovf + 'px', 7) + lpad(r.errs.length, 6) + lpad(r.docH + 'px', 8) +
      lpad(r.hoverOnly + '/' + r.hoverTotal, 12));
  console.log('');
  for (const r of rows) {
    const bad = r.tiny.length + r.small.length + r.taps.length + r.errs.length + Math.max(0, r.ovf);
    if (!bad) { console.log(`── ${r.name.toUpperCase()} — clean`); continue; }
    console.log(`── ${r.name.toUpperCase()}`);
    const byClass = new Map();
    for (const t of r.tiny) {
      const k = `${t.tag}.${t.cls.split(' ')[0] || ''} @${t.fs}px${t.prose ? ' PROSE' : ''}`;
      byClass.set(k, (byClass.get(k) || 0) + 1);
    }
    [...byClass].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .forEach(([k, n]) => console.log(`   text  ${lpad(n, 3)}x  ${k}`));
    const bySmall = new Map();
    for (const t of r.small) {
      const k = `${t.tag}.${t.cls.split(' ')[0] || ''} @${t.fs}px`;
      bySmall.set(k, (bySmall.get(k) || 0) + 1);
    }
    [...bySmall].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .forEach(([k, n]) => console.log(`   prose ${lpad(n, 3)}x  ${k}  (needs 16px)`));
    const byTap = new Map();
    for (const t of r.taps) {
      const k = `${t.tag}.${t.cls.split(' ')[0] || ''} ${t.w}x${t.h}`;
      byTap.set(k, (byTap.get(k) || 0) + 1);
    }
    [...byTap].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .forEach(([k, n]) => console.log(`   tap   ${lpad(n, 3)}x  ${k}`));
    r.over.slice(0, 6).forEach(o => console.log(`   OVF   ${o.tag}.${o.cls.split(' ')[0] || ''} ${o.l}..${o.r}  "${o.txt}"`));
    r.errs.slice(0, 5).forEach(e => console.log(`   ERR   ${e}`));
    console.log('');
  }
  console.log('   targets: <12px 0 · prose<16 0 · taps 0 · h-ovf 0 · errs 0');
  console.log('   detail:  npm run mobile -- --json   shots: npm run mobile -- --shots\n');
}

const fail = rows.some(r => r.errs.length || r.ovf > 0 || r.tiny.length || r.small.length);
process.exitCode = 0;   // a report, not a gate — never fails a build
void fail;

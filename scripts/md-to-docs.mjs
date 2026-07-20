#!/usr/bin/env node
// Render a Markdown doc to a branded, print-ready HTML, then a PDF (headless
// Chromium) and a DOCX (LibreOffice). Used to hand the artist intake + token
// math to humans as real documents.
//
//   node scripts/md-to-docs.mjs --in docs/TOKEN-MATH.md --out /abs/out/token-math \
//        --title "UR3030 — Token Math" [--subtitle "…"]
//
// Produces <out>.html, <out>.pdf, <out>.docx. Deps (dev-only, install with
// `npm i marked html-to-docx`): marked (md->html), html-to-docx (pure-JS docx),
// and playwright-core + a chromium at CHROMIUM_PATH (for the PDF). No LaTeX/soffice.

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, basename, join } from 'node:path';
import { marked } from 'marked';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const inPath = args.in, outBase = args.out, title = args.title || basename(inPath), subtitle = args.subtitle || '';
if (!inPath || !outBase) { console.error('need --in <md> --out <basepath>'); process.exit(1); }
const chromiumPath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

marked.setOptions({ gfm: true, breaks: false });
const body = marked.parse(readFileSync(inPath, 'utf8'));

const CSS = `
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font: 11.5pt/1.55 "Helvetica Neue", Arial, sans-serif; color: #14231c; margin: 0; }
  .head { border-bottom: 3px solid #0f7a43; padding-bottom: 10px; margin-bottom: 18px; }
  .head .kicker { font: 700 9pt/1 "Courier New", monospace; letter-spacing: .28em; text-transform: uppercase; color: #0f7a43; }
  .head h1 { font-size: 22pt; margin: 6px 0 2px; color: #0b1a12; letter-spacing: -.01em; }
  .head .sub { font-size: 10.5pt; color: #4a6157; }
  h1, h2, h3, h4 { color: #0b1a12; line-height: 1.25; page-break-after: avoid; }
  h1 { font-size: 17pt; border-bottom: 1px solid #cfe3d8; padding-bottom: 4px; margin: 22px 0 10px; }
  h2 { font-size: 14pt; margin: 20px 0 8px; color: #0f7a43; }
  h3 { font-size: 12pt; margin: 16px 0 6px; }
  p, li { font-size: 11.5pt; }
  a { color: #0f7a43; text-decoration: none; }
  strong { color: #0b1a12; }
  code { font: 10pt/1.4 "Courier New", monospace; background: #eef5f1; padding: 1px 4px; border-radius: 3px; }
  pre { background: #0b1a12; color: #d7ffe9; padding: 10px 12px; border-radius: 6px; overflow-x: auto; font-size: 9.5pt; }
  pre code { background: none; color: inherit; padding: 0; }
  blockquote { margin: 12px 0; padding: 8px 14px; border-left: 4px solid #0f7a43; background: #f2f8f5; color: #29453a; border-radius: 0 6px 6px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10pt; page-break-inside: avoid; }
  th, td { border: 1px solid #cfe3d8; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #0f7a43; color: #fff; font-weight: 700; }
  tr:nth-child(even) td { background: #f4faf7; }
  hr { border: none; border-top: 1px solid #cfe3d8; margin: 20px 0; }
  h1, h2 { page-break-after: avoid; } table, pre, blockquote { page-break-inside: avoid; }
`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head>
<body><div class="head"><div class="kicker">upperdeckripmaster3030 · $UR3030</div><h1>${title}</h1>${subtitle ? `<div class="sub">${subtitle}</div>` : ''}</div>
${body}</body></html>`;

const htmlPath = outBase + '.html';
writeFileSync(htmlPath, html);

// ── PDF via Chromium ──
const PW = process.env.PLAYWRIGHT_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js';
const pw = await import(PW);
const chromium = (pw.default || pw).chromium;
const browser = await chromium.launch({ executablePath: chromiumPath });
const page = await (await browser.newContext()).newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({ path: outBase + '.pdf', format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } });
await browser.close();

// ── DOCX via html-to-docx (pure JS, no native deps) ──
const HtmlDocx = (await import('html-to-docx')).default;
const docBuf = await HtmlDocx(html, null, {
  orientation: 'portrait',
  margins: { top: 1080, right: 1000, bottom: 1080, left: 1000 },
  table: { row: { cantSplit: true } },
  footer: false, pageNumber: false,
});
writeFileSync(outBase + '.docx', Buffer.from(docBuf));

console.log(`✦ ${basename(outBase)} → .html .pdf .docx`);

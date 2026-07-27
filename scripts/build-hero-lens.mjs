#!/usr/bin/env node
/* Build the HERO LENSES — cards 1–33, the 1/1s, as live HTML rather than flat art.
 *
 * A hero card is not a picture of a card. It is a card that runs. The lens page this
 * builds is what `tokenURI(id)`'s animation_url ultimately frames, so it has to survive
 * being loaded somewhere hostile:
 *
 *   • SuperRare's media slot is a SANDBOXED IFRAME at an OPAQUE ORIGIN. No admin gate,
 *     no localStorage dependence, no injected wallet, no parent-window access.
 *   • The on-chain wrapper hands it an https URL inside a data:text/html document, so the
 *     page must be reachable cold, with no referrer and no cookies.
 *   • It gets sized by whatever frames it — a phone, a desktop media slot, our gallery —
 *     so the card locks its own 2:3 geometry and scales to fit rather than assuming px.
 *
 * The artist authors a card BODY (plain HTML, or a GIF) and this wraps it into a
 * standalone lens page. Nothing external is loaded: no fonts, no CDN, no analytics.
 *
 *   node scripts/build-hero-lens.mjs                  # DRY RUN over the repo root
 *   node scripts/build-hero-lens.mjs --apply
 *   node scripts/build-hero-lens.mjs --apply --inline # embed GIFs as data: URIs
 *
 * Sources, same "NN - TITLE.ext" convention as the field cards:
 *   "07 - SOME TITLE.html"  → body is the artist's markup, injected as-is
 *   "07 - SOME TITLE.gif"   → body is the GIF, object-fit:contain inside the card
 *
 * --inline makes the page fully self-contained (survives re-hosting to IPFS/Arweave with
 * no companion files) at the cost of ~1.37× the GIF's bytes in base64. Without it the GIF
 * is a relative sibling, which keeps the page light — vercel.json already serves these
 * CORS-open so a sandboxed frame can pull them.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, extname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const heroDir = join(rootDir, 'cards', 'hero');

const argv = process.argv.slice(2);
const has = f => argv.includes('--' + f);
const val = f => { const i = argv.indexOf('--' + f); return i >= 0 ? argv[i + 1] : null; };
const APPLY = has('apply'), INLINE = has('inline');
const dirArg = val('dir') || '.';
const dir = isAbsolute(dirArg) ? dirArg : resolve(rootDir, dirArg);

const HERO_MAX = 33;                                   // 1–33 are the hero 1/1s; 34+ are field cards
const FILE_RE = /^\s*(\d{1,3})\s*[-–—]\s*(.+?)\s*\.(html?|gif)$/i;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MIME = { '.gif': 'image/gif' };

/* The lens shell. Deliberately boring CSS: no custom properties, no modern syntax that an
 * older in-app webview might choke on, and the card's geometry comes from aspect-ratio with
 * a flexbox fallback so it still locks 2:3 if aspect-ratio is unsupported. */
function shell({ number, title, body, extraCss }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>upperdeckripmaster3030 &#183; ${esc(title)} &#183; №${number}</title>
<meta name="robots" content="noindex">
<!-- HERO LENS ${number} — this page is framed by the token's animation_url. It must stand
     alone: no gate, no storage, no external requests, no parent-window assumptions. -->
<style>
  html,body{margin:0;height:100%;background:#000;overflow:hidden}
  body{display:flex;align-items:center;justify-content:center}
  /* Lock the card's 2:3 and fit it inside whatever frames us. Which side binds depends on
     the FRAME's aspect, so ask: setting height:100% + max-width:100% together is the trap —
     the clamp wins and aspect-ratio silently yields, stretching the card (measured 0.571
     instead of 0.667 in a 320x560 phone slot). */
  .card{position:relative;aspect-ratio:2/3;margin:auto;overflow:hidden;background:#000}
  @media (min-aspect-ratio:2/3){ .card{height:100%;width:auto} }   /* frame is wide  -> height binds */
  @media (max-aspect-ratio:2/3){ .card{width:100%;height:auto} }   /* frame is tall  -> width binds  */
  @supports not (aspect-ratio:2/3){ .card{height:100%;width:66.667vh;max-width:100%} }
  .card>img,.card>video,.card>canvas,.card>svg{width:100%;height:100%;object-fit:contain;display:block}
  .card>.body{position:absolute;inset:0;width:100%;height:100%}
  /* the mark: small, corner, never covers the art */
  .mk{position:absolute;left:0;right:0;bottom:0;padding:5px 7px;font:10px/1.2 ui-monospace,'Courier New',monospace;
      color:rgba(190,255,215,.62);letter-spacing:.06em;text-transform:lowercase;
      background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.62));
      display:flex;justify-content:space-between;gap:8px;pointer-events:none}
  @media (max-width:380px){ .mk{font-size:9px} }
${extraCss || ''}</style>
</head>
<body>
<div class="card">
${body}
<div class="mk"><span>upperdeckripmaster3030</span><span>&#8470;${number} &#183; ${esc(title)}</span></div>
</div>
</body>
</html>
`;
}

const files = readdirSync(dir).filter(f => FILE_RE.test(f));
const rows = [];
for (const f of files) {
  const m = f.match(FILE_RE);
  const number = +m[1], title = m[2].trim(), ext = extname(f).toLowerCase();
  if (number > HERO_MAX) continue;                     // field cards are handled by ingest-deck.mjs
  rows.push({ f, number, title, ext, size: statSync(join(dir, f)).size });
}
rows.sort((a, b) => a.number - b.number);

if (!rows.length) {
  console.log(`no hero sources (1–${HERO_MAX}, .html or .gif) in ${dir}`);
  console.log(`expected names like "07 - SOME TITLE.gif" — field cards 34+ go through ingest-deck.mjs`);
  process.exit(0);
}

const MB = b => (b / 1048576).toFixed(1) + ' MB';
console.log(`hero sources: ${rows.length}`);
for (const r of rows) console.log(`  ${String(r.number).padStart(2)}  ${r.ext.padEnd(5)} ${MB(r.size).padStart(8)}  "${r.title}"`);
const have = rows.map(r => r.number), missing = [];
for (let i = 1; i <= HERO_MAX; i++) if (!have.includes(i)) missing.push(i);
console.log(`\nhero coverage: ${rows.length}/${HERO_MAX}${missing.length ? ` · still to come: ${missing.join(', ')}` : ' · COMPLETE'}`);

if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); process.exit(0); }

mkdirSync(heroDir, { recursive: true });
for (const r of rows) {
  let body;
  if (r.ext === '.gif') {
    if (INLINE) {
      const b64 = readFileSync(join(dir, r.f)).toString('base64');
      body = `<img src="data:${MIME['.gif']};base64,${b64}" alt="${esc(r.title)}">`;
    } else {
      const asset = `${r.number}.gif`;
      copyFileSync(join(dir, r.f), join(heroDir, asset));
      body = `<img src="${asset}" alt="${esc(r.title)}">`;
    }
  } else {
    // the artist's markup, dropped in whole. Their card, their DOM — we only frame it.
    body = `<div class="body">\n${readFileSync(join(dir, r.f), 'utf8')}\n</div>`;
  }
  writeFileSync(join(heroDir, `${r.number}.html`), shell({ number: r.number, title: r.title, body }));
}
console.log(`\n✦ built ${rows.length} hero lenses → cards/hero/<n>.html`);
console.log('  animation_url per hero:  https://upperdeckripmaster3030.com/cards/hero/<n>.html');

#!/usr/bin/env node
/* Build START-HERE.pdf — ONE page, for someone meeting $3030 and THE CITY for the first time.
 *
 *   node scripts/build-onepager.mjs        (npm run onepager)
 *
 * ⚑ THE BRIEF IS THE CONSTRAINT: one page. So it answers four questions and refuses the rest —
 *   what the studio is, what the token is, what the cards are, and what it costs you to be wrong.
 *   The whitepaper deck is where the long version lives; this is the thing you hand someone.
 *
 * ⛔ EVERY NUMBER HERE COMES FROM `scripts/token-model.mjs`, WHICH IS THE ONLY SOURCE. They are
 *   restated as literals below because a PDF cannot import, so they are ASSERTED against the model
 *   at build time and the build FAILS if they have drifted. A one-pager that quietly disagrees
 *   with the model is worse than no one-pager: it is the document a stranger will believe.
 *
 * ⛔ THE "BEFORE YOU BUY" BLOCK IS NOT OPTIONAL AND NOT A FOOTNOTE. `docs/TREASURY.md` and
 *   token-model.mjs both refuse to state a burn figure without the studio slug beside it,
 *   because they are the SAME arithmetic — the 50/50 split sends an identical number of tokens to
 *   the fire and to the studio. A first-contact document that printed only the flattering half
 *   would be the single most misleading artifact this project could produce.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* ── the figures, and then the proof that they are still true ─────────────────────────────── */
const F = {
  cap: '3,030,000',
  packTok: '125',
  packUsd: '$10',
  tiers: '1,600 → 1,100 → 600 → 260',
  burnTok: 'read live',
  burnPct: 'not published',
  contraction: 'not published',
  slugPct: 'read live',
  float: '2,285,625',
  livePrice: '16.78',
};
{
  const out = execFileSync(process.execPath, [join(here, 'token-model.mjs')], { encoding: 'utf8' });
  const must = [F.cap, F.burnTok, F.burnPct, F.contraction, F.slugPct, F.float];
  const missing = must.filter(v => !out.includes(v));
  if (missing.length) {
    console.error('✗ one-pager figures no longer match token-model.mjs:', missing.join(', '));
    console.error('  The model is the source. Fix the literals in this file, do not fix the model.');
    process.exit(1);
  }
  console.log('✓ figures agree with token-model.mjs (' + must.length + ' checked)');
}

/* The mark is the SCREENSHOT of the live foil wordmark (`npm run mark`), never a redraw — a redraw
 * would be a picture OF the mark and could drift from what the site renders. */
const HERO = 'data:image/png;base64,' +
  readFileSync(join(ROOT, 'media/site/mark-1024.png')).toString('base64');

const C = { void: '#f7f3e8', ink: '#12100c', rule: '#c9bfa6', dim: '#5d564a',
            fire: '#d1442c', deep: '#0b3a2a', gold: '#a8791a' };

const html = `<!doctype html><html><head><meta charset="utf-8"><title>START HERE · $3030</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ width:210mm; height:297mm; background:${C.void}; color:${C.ink};
    font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; padding:11mm 12mm 8mm;
    display:flex; flex-direction:column; }
  .mono{ font-family:"SFMono-Regular",Menlo,Consolas,monospace; }
  header{ display:flex; align-items:center; gap:6mm; border-bottom:2.2px solid ${C.ink}; padding-bottom:3.5mm; }
  header img{ width:25mm; height:25mm; object-fit:contain; }
  h1{ font-size:19pt; letter-spacing:-0.4pt; line-height:1.02; }
  h1 small{ display:block; font-size:8.2pt; font-weight:400; letter-spacing:1.6pt;
    text-transform:uppercase; color:${C.dim}; margin-top:1.6mm; }
  .lede{ font-size:9.6pt; line-height:1.42; margin:3.5mm 0 4mm; max-width:172mm; }
  .lede b{ color:${C.fire}; }
  /* WARN flex:1 ON THE GRID STRETCHED ITS ROWS. The two rows grew to fill the sheet, so the page
     read as four blocks separated by two arbitrary gaps rather than as a column of related things.
     align-content:start packs the rows; the slack then goes to ONE place (above the warning box,
     via margin-top:auto), which is a decision instead of an accident.
     WARN AND NO BACKTICKS IN HERE. This stylesheet lives inside a JS template literal, so a
     backtick in a CSS comment ENDS THE STRING and the whole generator stops parsing. That is the
     FIFTH time in this repo, and the fifth was written minutes after documenting the fourth. If a
     comment inside a template literal wants to quote an identifier, do not. */
  .cols{ display:grid; grid-template-columns:1fr 1fr; gap:5mm 7mm; align-content:start; }
  section{ break-inside:avoid; }
  h2{ font-size:7.6pt; letter-spacing:1.5pt; text-transform:uppercase; color:${C.deep};
    border-bottom:1px solid ${C.rule}; padding-bottom:1mm; margin-bottom:2mm; }
  h2 span{ color:${C.rule}; }
  p, li{ font-size:8.4pt; line-height:1.4; }
  ul{ list-style:none; }
  li{ padding-left:3.6mm; position:relative; margin-bottom:1.2mm; }
  li::before{ content:"▸"; position:absolute; left:0; color:${C.rule}; }
  li b{ font-weight:700; }
  .k{ color:${C.fire}; font-weight:700; }
  .loop{ font-size:8pt; letter-spacing:.2pt; background:${C.ink}; color:${C.void};
    padding:2.2mm 3mm; margin-bottom:2mm; line-height:1.5; }
  .loop b{ color:#ffd23b; }
  .band{ margin-top:auto; display:flex; gap:6mm; align-items:stretch;
    border-top:1px solid ${C.rule}; border-bottom:1px solid ${C.rule}; padding:2.5mm 0; }
  .band div{ flex:1; }
  .band h3{ font-size:6.8pt; letter-spacing:1.4pt; text-transform:uppercase; color:${C.deep}; margin-bottom:1.2mm; }
  .band p{ font-size:8pt; line-height:1.38; }
  .when{ flex:0 0 52mm !important; border-right:1px solid ${C.rule}; padding-right:6mm; }
  .when p{ font-size:9.4pt; font-weight:700; line-height:1.25; }
  .warn{ border:2.2px solid ${C.fire}; padding:3mm 3.5mm; margin-top:3.5mm; }
  .warn h2{ color:${C.fire}; border-color:${C.fire}; }
  .warn li{ font-size:8.1pt; margin-bottom:1.4mm; }
  .warn li::before{ content:"■"; color:${C.fire}; font-size:6pt; top:.6mm; }
  footer{ margin-top:3.5mm; border-top:1px solid ${C.rule}; padding-top:2mm;
    display:flex; justify-content:space-between; font-size:6.8pt; color:${C.dim}; letter-spacing:.5pt; }
  .tag{ display:inline-block; border:1px solid ${C.rule}; padding:.4mm 1.4mm; font-size:6.6pt;
    letter-spacing:.8pt; text-transform:uppercase; color:${C.dim}; margin-left:1.5mm; }
</style></head><body>

<header>
  <img src="${HERO}" alt="">
  <h1>ripmaster3030studios<small>start here · the edition, the cards, the games</small></h1>
</header>

<p class="lede"><b>It is a card and game studio.</b> It makes trading cards, and it makes the games
those cards are played in. <b>$3030</b> is the token the cards are bought with and the studio is
funded by — it is not the product. The cards are the product. Everything below exists to serve
that one sentence.</p>

<div class="cols">

  <section>
    <h2>1 · The edition <span>— $3030</span></h2>
    <ul>
      <li>One ERC-20, issued once as a <b>SuperRare Liquid Edition</b>. Cap <span class="k">${F.cap}</span>. There is no second mint.</li>
      <li>You buy it with <b>RARE</b> on a bonding curve: the price rises as the curve fills, so early is cheaper and that is the whole mechanism.</li>
      <li><b>Burns are permanent.</b> Supply only ever falls.</li>
      <li>Ticker <span class="mono">$3030</span>. The studio is <span class="mono">ripmaster3030studios</span>; the token it issues is <span class="mono">ripmaster3030</span>. A company and its product may differ.</li>
    </ul>
  </section>

  <section>
    <h2>2 · Every card is a lens</h2>
    <ul>
      <li><b>100 cards</b>, all rendered by one contract, each keyed by its id. A card is not a picture in a folder — it is a render the chain performs on request.</li>
      <li><b>33 hero 1/1s:</b> 11 auctioned · 11 pulled from packs · <b>11 earned</b> by named feats in the games.</li>
      <li><b>67 field lenses</b> render whether or not anyone has minted them.</li>
      <li><b>Lovebeing</b> — one per wallet, non-transferable, non-burnable.</li>
      <li><b>Holding changes the art.</b> The lens reads your balance: <span class="mono">125 / 1,250 / 12,500 / 125,000</span> = Ash · Spark · Ember · Flame · Inferno — one pack, ten, a hundred, a thousand. <b>The art acknowledges you. It does not pay you.</b></li>
    </ul>
  </section>

  <section>
    <h2>3 · The loop</h2>
    <div class="loop mono">buy <b>$3030</b> &nbsp;→&nbsp; rip a pack &nbsp;→&nbsp; cards
      &nbsp;→&nbsp; hold (your tier rises) &nbsp;→&nbsp; play &nbsp;→&nbsp; earn a title
      &nbsp;→&nbsp; a hero 1/1</div>
    <ul>
      <li>A pack is <span class="k">${F.packTok} $3030</span> (~<b>${F.packUsd}</b> at the opening price) and rises with each tier.</li>
      <li><b>Four tiers, not seasons:</b> <span class="mono">${F.tiers}</span> packs. <b>A tier opens when the one before it sells out — not on a date.</b> A season would be a promise about time; a tier is a promise about supply.</li>
      <li>Of every pack, <b>half burns and half funds the studio</b> — one contract, so it cannot half-happen.</li>
      <li>The eleven titles cannot be bought. Nothing keys on holding or burning more; a balance can be borrowed for a block, a feat cannot.</li>
    </ul>
  </section>

  <section>
    <h2>4 · The arcade <span>— four games</span></h2>
    <ul>
      <li><b>THE CITY</b> — 3.84 km of city you can land on. Be a <b>bird</b>, which cannot be hurt, targeted or armed, or a <b>jet</b>, which can. <b>A photograph you take becomes a card.</b></li>
      <li><b>RIP ROCKETER</b> — on-rails shooter; a flat 25-token launch fee goes to the studio.</li>
      <li><b>CLOUD RACER</b> — anti-grav circuits, podium splits the pot.</li>
      <li><b>THE ARENA</b> — 1v1 card wagers settled in a face-off.</li>
      <li>Games wager $3030 <i>and</i> cards. A small rake splits the same way a pack does. <b>Cards change hands; they are never burned.</b></li>
    </ul>
  </section>

</div>

<div class="band">
  <div class="when">
    <h3>Launch</h3>
    <p>6 August 2026<br>11:11 PM ET</p>
  </div>
  <div>
    <h3>Where to start</h3>
    <p><b>Rip one pack.</b> It is the cheapest complete version of the whole thing: you spend
    $3030, half of it burns, and you hold cards whose art already knows what you hold. Everything
    else — the auctions, the titles, the games — is that same loop with more of it.</p>
  </div>
</div>

<div class="warn">
  <h2>Before you buy — the part most projects leave out</h2>
  <ul>
    <li><b>The burn is real and it is not a 3× scarcity engine.</b> A full four-tier sellout destroys <span class="k">${F.burnTok}</span> tokens — <b>${F.burnPct} of the mint</b>, a <b>${F.contraction}</b> contraction, leaving ~${F.float} alive.</li>
    <li><b>The same split hands the studio the same number of tokens</b> — <b>${F.slugPct} of the surviving float</b>. These two figures are one piece of arithmetic and should never be quoted apart. Concentration, not the burn, is the headline risk here.</li>
    <li><b>The opening price has not been measured.</b> The <b>${F.packUsd}</b> pack rests entirely on an assumed 1 RARE/token. The only live curve this project has ever run sat at <b>${F.livePrice} RARE</b>. Until the real curve is previewed, treat the pack price as an estimate.</li>
    <li><b>There is no external security audit.</b> A public testnet dress rehearsal and internal review are the substitute, and that is a deliberate trade, not an oversight.</li>
    <li><b>NFA.</b> An experimental art project. It can go to zero, and the cards are meant to be worth having anyway.</li>
  </ul>
</div>

<footer>
  <span class="mono">ripmaster3030studios.com</span>
  <span>artist: gianni arone · lovebeing<span class="tag">superrare liquid editions · cohort 01</span></span>
  <span class="mono">not financial advice</span>
</footer>

</body></html>`;

const browser = await chromium.launch({ executablePath: chromiumPath, args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
const outPath = join(ROOT, 'start-here.pdf');
await page.pdf({ path: outPath, format: 'A4', printBackground: true,
                 margin: { top: 0, right: 0, bottom: 0, left: 0 } });
/* ⚠ A PNG TOO, because a PDF cannot be looked at in a chat, an unfurl or a phone preview — and a
 * one-pager nobody opens is the same failure as a page nobody links. */
/* A4 at 96 dpi is 794 x 1123 CSS px. Shooting at the real page size means the PNG is a faithful
 * preview of the sheet; a wider viewport just pads it with background and flatters the layout. */
await page.setViewportSize({ width: 794, height: 1123 });
await page.screenshot({ path: join(ROOT, 'media/site/start-here.png') });
await browser.close();

const kb = (readFileSync(outPath).length / 1024).toFixed(0);
/* ⛔ A ONE-PAGER THAT IS TWO PAGES IS NOT A ONE-PAGER. The whole brief is the single sheet, and
 * overflow in a print layout is silent — it just starts page two where nobody looks. */
const pages = (readFileSync(outPath, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`✓ start-here.pdf — ${kb} KB, ${pages} page(s)`);
if (pages !== 1) { console.error('✗ IT MUST BE ONE PAGE. Trim the copy, do not shrink the type.'); process.exit(1); }
console.log('✓ media/site/start-here.png (so it can be looked at without a PDF reader)');

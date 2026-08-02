#!/usr/bin/env node
// Build the on-site transparency pages — whitepaper.html, tokenomics.html, audit.html,
// artist.html — in the ripmaster3030studios acid-terminal style, from one shared shell. Reproducible:
//
//   node scripts/build-pages.mjs
//
// Numbers mirror docs/ECONOMIC-FLOW.md + docs/TOKEN-MATH.md (reproduced by
// scripts/token-model.mjs). Model v2.2: 100-card deck, every card a LENS (render keyed by
// id), 33 minted hero 1/1s (11 gacha + 22 earned) + 67 render-only field cards + Lovebeing
// holder lens; packs burn the token (mint-once; burn is real but modest at 33M — see below);
// cards do NOT retire/ash.
// Strong NFA / "all memes are memes" throughout.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const NAV = [
  { slug: 'index.html', label: 'Home' },
  { slug: 'artist.html', label: 'Artist' },
  { slug: 'whitepaper.html', label: 'Whitepaper' },
  { slug: 'tokenomics.html', label: 'Tokenomics' },
  { slug: 'audit.html', label: 'Audit' },
];

const shell = ({ slug, title, kicker, subtitle, accent, body }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ripmaster3030studios</title>
<meta name="description" content="${subtitle}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="canonical" href="https://ripmaster3030studios.com/${slug}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ripmaster3030studios">
<meta property="og:title" content="${title} · ripmaster3030studios">
<meta property="og:description" content="${subtitle}">
<meta property="og:url" content="https://ripmaster3030studios.com/${slug}">
<meta property="og:image" content="https://ripmaster3030studios.com/marquee-header.webp">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/mobile.css">
<style>
  :root{
    --void:#020804; --panel:#04140b; --ink:#01130a;
    --phos:#2bff80; --phosdim:#0f5c33; --phosdeep:#0a3d22;
    --acid:#ff2ad9; --cyan:#27f7e4; --amber:#ffd23b; --red:#ff4b3a; --text:#b8ffd6;
    --mono:'Courier New',ui-monospace,monospace; --fat:'Arial Black','Arial Bold',Arial,sans-serif;
    --accent:${accent};
  }
  *{ box-sizing:border-box; }
  /* ⚑ EVERY SIZE BELOW IS SPENT FROM /mobile.css's SCALE, never written as a bare px. The
     var() fallbacks are the previous fixed values where they were sane, so a missing sheet
     degrades to the old page rather than to nothing. See mobile.css for why the scale is
     declared there and applied here. */
  /* ⚠ THE PAGE COLOUR LIVES ON html AND body STAYS TRANSPARENT — do not move it back.
     A negative-z fixed layer (js/bg-foil.js at z-index -4) paints in step 2 of the root
     stacking context, but an in-flow block's own background paints in step 3, i.e. AFTER it.
     So an opaque body background does not sit behind the Blender plate, it covers it, and the
     page just looks like it did before with an extra 500 KB downloaded. index.html has carried
     this same note for the rain/watermark layers since they were added; the generated shell
     did not, which is exactly how the plate came out invisible on tokenomics/audit/whitepaper
     while working on the landing page. The tints below are kept — they are just moved onto the
     transparent layer so they sit OVER the foil rather than instead of it. */
  html{ margin:0; padding:0; background:var(--void); }
  body{ margin:0; padding:0; font-family:var(--mono); color:var(--text); line-height:1.68;
    font-size:var(--t-body,15px);
    background:
      radial-gradient(120% 60% at 85% -5%, rgba(43,255,128,.10), transparent 55%),
      radial-gradient(90% 60% at 0% 100%, rgba(255,42,217,.07), transparent 55%);
    background-attachment:fixed; }
  body::before{ content:""; position:fixed; inset:0; pointer-events:none; z-index:1; opacity:.3;
    background:repeating-linear-gradient(180deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.25) 2px 3px); }
  /* ⚠ 112px of bottom padding, not 80: banner.js pins a fixed strip to the bottom of the
     viewport and it is three lines tall on a phone. Less than this and the last thing on a
     ~9,000px document is permanently under it. */
  .wrap{ position:relative; z-index:2; max-width:960px; margin:0 auto; padding:0 clamp(14px,4.4vw,20px) 112px; }
  a{ color:var(--cyan); }
  /* ⚠ .92em of a 12.7px caption is 11.7px, i.e. a relative size can walk a child under the
     floor even when the parent is legal. max() puts the floor back in the child's own rule. */
  code{ font-family:var(--mono); color:var(--cyan); background:rgba(39,247,228,.08);
    border:1px solid rgba(39,247,228,.22); border-radius:4px; padding:0 5px;
    font-size:max(var(--t-tag,12px), .94em); overflow-wrap:anywhere; }
  b,strong{ color:#d9ffe8; }
  /* anchors have to clear the sticky bar or #legal lands under it */
  [id]{ scroll-margin-top:104px; }

  /* ── top bar ──────────────────────────────────────────────────────────────────────────────
   * ⚑ IT WAS THREE ROWS AND 127px TALL ON A PHONE — 15% of the viewport, permanently, on every
   * page, and nothing measured it: five wrapping 32px chips are individually reasonable and
   * collectively a header you scroll past. It is now ONE 58px row: the nav as a horizontally
   * scrolling RAIL plus the NFA badge pinned right. Above 760px the original one-line flex bar
   * comes back untouched, brand and all.
   * ⚠ THE BRAND IS HIDDEN ON NARROW SCREENS BECAUSE IT IS A DUPLICATE, not to save space —
   * "◂ Ripmaster 3030" and the first chip "HOME" are the same link to the same page. Given a
   * choice between two ways to go home and a header half the height, take the header.
   * ⛔ The NFA badge STAYS. It is the one piece of chrome that is not decoration.
   * ⚠ The rail bleeds to the viewport edge (negative margin + matching padding) so a chip is
   * cut by the edge when there is more to the right — a rail that stops short of the edge reads
   * as a clipped row rather than a scrollable one, and that cut edge is the only affordance. */
  .topbar{ position:sticky; top:0; z-index:10; display:grid; grid-template-columns:minmax(0,1fr) auto;
    align-items:center; gap:6px 10px; padding:7px clamp(12px,4vw,20px);
    border-bottom:1px solid var(--phosdeep);
    background:rgba(1,10,5,.9); backdrop-filter:blur(6px); }
  .brand{ display:none; font-family:var(--fat); text-transform:uppercase; letter-spacing:.12em;
    font-size:var(--t-fine,12px); color:var(--phos); text-decoration:none;
    align-items:center; min-height:var(--tap,44px); }
  .nfa-badge{ grid-area:1/2; justify-self:end; font-family:var(--fat); font-size:var(--t-tag,10px);
    letter-spacing:.1em; color:var(--amber); border:1px solid #6b5a12; border-radius:8px; padding:7px 9px;
    background:rgba(255,210,59,.06); white-space:nowrap; }
  .topnav{ grid-area:1/1; min-width:0; display:flex; gap:8px; overflow-x:auto; overscroll-behavior-x:contain;
    scroll-snap-type:x proximity; scrollbar-width:none; -webkit-overflow-scrolling:touch;
    margin-left:calc(-1 * clamp(12px,4vw,20px)); padding-left:clamp(12px,4vw,20px); }
  .topnav::-webkit-scrollbar{ display:none; }
  .topnav a{ flex:none; scroll-snap-align:start; text-decoration:none; font-family:var(--fat);
    text-transform:uppercase; letter-spacing:.06em; font-size:var(--t-fine,11px); color:var(--text);
    display:inline-flex; align-items:center; min-height:var(--tap,44px); padding:0 14px;
    border:1px solid var(--phosdim); border-radius:11px; }
  .topnav a.on{ color:var(--void); background:var(--accent); border-color:var(--ink); }
  @media (min-width:760px){
    .topbar{ display:flex; flex-wrap:wrap; gap:10px 18px; justify-content:space-between; padding:10px 20px; }
    .brand{ display:inline-flex; }
    .topnav{ margin:0; padding:0; overflow:visible; flex-wrap:wrap; }
  }

  /* hero */
  header.hero{ padding:clamp(26px,6vw,46px) 0 24px; border-bottom:1px solid var(--phosdeep); margin-bottom:26px; }
  .hero .kick{ font-family:var(--fat); text-transform:uppercase; letter-spacing:.2em; font-size:var(--t-fine,12px);
    color:var(--accent); margin-bottom:12px; }
  .hero h1{ font-family:var(--fat); font-size:var(--t-h1,clamp(30px,6vw,52px)); line-height:1.02; margin:0 0 14px;
    color:#eafff2; letter-spacing:-.02em; text-shadow:0 0 26px rgba(43,255,128,.3);
    overflow-wrap:break-word; }
  .hero p.sub{ font-size:var(--t-lede,15px); color:var(--text); margin:0; max-width:62ch; }
  /* ⚠ ".cta" was only ever styled as ".hero .cta", so the four in-body button rows were laying
     out as inline-blocks separated by collapsed whitespace — which stops working the moment the
     buttons become flex boxes. One rule, both places. */
  .cta{ display:flex; gap:10px; flex-wrap:wrap; }
  .hero .cta{ margin-top:20px; }
  /* ⚠ inline-flex + min-height, not padding-and-hope: a 12px label in 11px of padding measured
     32px tall. The label did not have to grow to fix it, and did not. */
  .btn{ display:inline-flex; align-items:center; justify-content:center; text-decoration:none;
    font-family:var(--fat); text-transform:uppercase;
    letter-spacing:.06em; font-size:var(--t-ui,12px); color:var(--void); padding:0 18px;
    min-height:var(--tap,44px); border:2px solid var(--ink);
    border-radius:11px; background:linear-gradient(180deg,#8bffbb,var(--phos) 55%,#0fae56);
    box-shadow:inset 0 3px 0 rgba(255,255,255,.4), 0 5px 0 var(--ink), 0 0 18px rgba(43,255,128,.3);
    transition:transform .1s ease, box-shadow .1s ease; }
  .btn.cy{ background:linear-gradient(180deg,#6ff3ff,var(--cyan) 60%,#0fb9ab); }
  /* the press. On a phone there is no hover, so the only honest feedback is the button going
     down under the finger — and it is the same 5px the box-shadow already pretends is depth. */
  .btn:active{ transform:translateY(4px);
    box-shadow:inset 0 3px 0 rgba(255,255,255,.4), 0 1px 0 var(--ink), 0 0 18px rgba(43,255,128,.3); }

  h2{ font-family:var(--fat); font-size:var(--t-h2,22px); color:#eafff2; margin:38px 0 12px; letter-spacing:-.01em;
    padding-bottom:6px; border-bottom:1px solid var(--phosdeep); line-height:1.15; }
  h2 .n{ color:var(--accent); margin-right:8px; }
  h3{ font-family:var(--fat); font-size:var(--t-h3,15px); text-transform:uppercase; letter-spacing:.06em; color:var(--phos);
    margin:24px 0 6px; }
  p{ font-size:var(--t-body,14.5px); }
  ul{ padding-left:20px; } li{ font-size:var(--t-body,14.5px); margin-bottom:9px; }

  .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width:640px){ .grid2{ grid-template-columns:1fr; } .cols3{ grid-template-columns:1fr!important; } }
  .stat{ border:1px solid var(--phosdim); border-radius:10px; background:rgba(1,10,5,.6); padding:14px 15px; }
  .stat b{ display:block; font-family:var(--fat); font-size:clamp(22px,6vw,26px); color:var(--phos); line-height:1.05;
    text-shadow:0 0 14px rgba(43,255,128,.35); }
  .stat span{ font-size:var(--t-fine,11.5px); color:var(--text); }
  /* ⚠ SAME CLASS, TWO JOBS. In '.statgrid' the caption is a two-word label ("hard cap"); in the
     audit page's '.grid2' invariants it is a whole sentence you are meant to read. Only the
     second one is prose, so only the second one gets the prose size. */
  .grid2 .stat span{ font-size:var(--t-body,14.5px); line-height:1.6; display:block; margin-top:6px; }
  .statgrid{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  @media (max-width:640px){ .statgrid{ grid-template-columns:1fr 1fr; } }

  .card{ border:1px solid var(--phosdim); border-radius:12px; background:rgba(1,10,5,.55); padding:16px 18px; }
  .card.burn{ border-color:#7c2a20; } .card.creator{ border-color:#7c1668; } .card.house{ border-color:#0f5c33; }
  .cols3{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  /* ⚠ These paragraphs used to carry an INLINE font-size:13px, which no stylesheet can reach —
     a scale a page can opt out of by accident is not a scale. The inline sizes are gone from the
     body copy; only the margin remains there. */
  .card p{ font-size:var(--t-body,13px); }
  .card ul{ padding-left:19px; } .card li{ font-size:var(--t-body,14.5px); }
  .co-h{ font-family:var(--fat); text-transform:uppercase; letter-spacing:.08em; font-size:var(--t-ui,13px); margin-bottom:9px; }
  .burn .co-h{ color:var(--red); } .creator .co-h{ color:var(--acid); } .house .co-h{ color:var(--phos); }

  .callout{ border:1px solid var(--phosdim); border-left:4px solid var(--accent); border-radius:10px;
    background:rgba(4,20,11,.7); padding:15px 16px; margin:18px 0; }
  .callout.amber{ border-left-color:var(--amber); } .callout.red{ border-left-color:var(--red); }
  .callout.cy{ border-left-color:var(--cyan); }
  .callout .co-h{ color:#eafff2; }

  /* ── tables ───────────────────────────────────────────────────────────────────────────────
   * They are "display:block; overflow-x:auto" and every cell is nowrap, so on a phone a table
   * is a sideways scroller with NO SIGN that it scrolls — the right-hand column simply does not
   * exist as far as the reader knows. The four backgrounds below are the standard scroll-shadow
   * pair: two "local" covers that ride with the content and two "scroll" shadows pinned to the
   * box. ⚑ The shadow is only visible when there IS something off-screen and it fades as you
   * reach the end — motion because something physically moved, not decoration. */
  table{ width:100%; border-collapse:collapse; font-size:var(--t-fine,13px); margin:14px 0; display:block;
    overflow-x:auto; -webkit-overflow-scrolling:touch; overscroll-behavior-x:contain;
    background:
      linear-gradient(90deg, rgba(2,12,7,1), rgba(2,12,7,0)) 0 0 / 26px 100% no-repeat local,
      linear-gradient(270deg, rgba(2,12,7,1), rgba(2,12,7,0)) 100% 0 / 26px 100% no-repeat local,
      radial-gradient(farthest-side at 0 50%, rgba(43,255,128,.45), rgba(43,255,128,0)) 0 0 / 14px 100% no-repeat scroll,
      radial-gradient(farthest-side at 100% 50%, rgba(43,255,128,.45), rgba(43,255,128,0)) 100% 0 / 14px 100% no-repeat scroll; }
  th,td{ border:1px solid var(--phosdim); padding:10px 12px; text-align:left; white-space:nowrap; }
  th{ background:rgba(43,255,128,.09); color:#eafff2; font-family:var(--fat); text-transform:uppercase;
    letter-spacing:.05em; font-size:var(--t-tag,11px); }
  /* ⚑ 16px CELLS IN A SIDEWAYS-SCROLLING TABLE BEATS 13px CELLS YOU CANNOT READ. Several of
     these cells are whole sentences ("3.1% of the 33,000,000 cap (half of each pack)"), not
     figures. The table was already a horizontal scroller on a phone; what it was missing was
     any sign of that, which is what the scroll shadows above are for. */
  td{ background:rgba(1,10,5,.72); font-size:var(--t-body,13px); }
  .fire{ color:var(--red); } .to-c{ color:var(--acid); } .to-h{ color:var(--phos); }

  /* ⚠ The dim caption is the weakest thing on the page against the textured backdrop —
     small AND low-contrast by design. A tight dark shadow costs nothing and keeps it crisp
     over the foil relief; it is invisible on flat black. */
  /* ⚑ A FOOTNOTE IS STILL A PARAGRAPH SOMEONE READS, so it takes the prose size and gets its
     hierarchy from COLOUR instead of from being small. It was 12px in var(--phosdim) #0f5c33
     over a textured plate — the least legible text on the site, carrying the asterisks that
     qualify every price on the page. */
  .fine{ font-size:var(--t-body,12px); color:#5fbe85; text-shadow:0 1px 2px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.7); }
  .ribbon{ margin-top:32px; border:1px dashed var(--amber); border-radius:10px; padding:14px 16px;
    background:rgba(255,210,59,.05); font-size:var(--t-body,12.5px); color:#ffe9a8; }
  .ribbon b{ color:var(--amber); }

  footer.foot{ margin-top:46px; border-top:1px solid var(--phosdeep); padding-top:10px; font-size:var(--t-fine,12px);
    color:#5fbe85; display:flex; flex-wrap:wrap; gap:2px 16px; justify-content:space-between;
    align-items:center; }
  /* the footer's links sit inside a " · " sentence; they get the 44px box, the sentence keeps
     its shape. ".tap-row" in mobile.css is the same primitive used by the other pages. */
  footer.foot a{ display:inline-flex; align-items:center; justify-content:center;
    min-height:var(--tap,44px); min-width:var(--tap,44px); }
  /* ⚠ The vertical watermark is a decorative fixed strip at right:-40px. On a 390px viewport it
     is both unreadable and the one box that measured outside the frame; it is a desktop
     flourish and it is now only on desktop. */
  .wm{ position:fixed; right:-40px; top:40%; transform:rotate(90deg); transform-origin:right center; z-index:0;
    font-family:var(--fat); font-size:13px; letter-spacing:.5em; color:rgba(43,255,128,.10); white-space:nowrap; }
  @media (max-width:900px){ .wm{ display:none; } }

  /* ⚑ A READ-PROGRESS RULE, and it is the one animation added to these pages. The whitepaper is
     9,298px tall on a phone — three metres of scroll with no sense of where you are in it. The
     bar is driven by "animation-timeline: scroll()", so its only input is the document position
     the visitor put it in: motion because something physically moved (DESIGN-SYSTEM §4), with
     no loop, no idle state and no JS. Browsers without scroll timelines never start the
     animation and get a 0-width bar, which is exactly the rest state. */
  .topbar::after{ content:""; position:absolute; left:0; bottom:-1px; height:2px; width:100%;
    transform-origin:0 50%; transform:scaleX(0); background:var(--accent);
    box-shadow:0 0 10px var(--accent); }
  @supports (animation-timeline: scroll()){
    .topbar::after{ animation:readbar linear both; animation-timeline:scroll(root block); }
    @keyframes readbar{ from{ transform:scaleX(0); } to{ transform:scaleX(1); } }
  }
</style>
<script src="/gate.js"></script>
<script src="/banner.js" defer></script>
<script src="/js/bg-foil.js" defer></script></head>
<body>
  <div class="wm">UPPERDECK · RIPMASTER · 3030</div>
  <div class="topbar">
    <a class="brand" href="index.html">◂ Ripmaster 3030</a>
    <nav class="topnav">
      ${NAV.map(n => `<a href="${n.slug}"${n.slug === slug ? ' class="on"' : ''}>${n.label}</a>`).join('\n      ')}
    </nav>
    <span class="nfa-badge">$3030 · NFA</span>
  </div>
  <!-- ⚠ On a phone the nav is a scroll rail, so "you are here" can be off-screen to the right —
       and the one chip you most need to see is the one for the page you are on. Three lines,
       fully optional: no rail (desktop) and it is a no-op, no scrollIntoView and it is skipped.
       block:'nearest' keeps it from scrolling the DOCUMENT while centring the chip. -->
  <script>(function(){var n=document.querySelector('.topnav a.on');
    if(n&&n.scrollIntoView){try{n.scrollIntoView({inline:'center',block:'nearest'});}catch(e){}}})();</script>
  <div class="wrap">
    <header class="hero">
      <div class="kick">${kicker}</div>
      <h1>${title}</h1>
      <p class="sub">${subtitle}</p>
    </header>
    ${body}
    <div class="ribbon"><b>NFA · all memes are memes.</b> $3030 is an experimental, volatile
      collectible <b>game token</b> — not an investment, not a security, no promise of value, and it can go
      to zero. The cards are art, parody, and commentary. Nothing here is financial, legal, or tax advice.
      Do your own research. Full terms on the <a href="whitepaper.html#legal">whitepaper</a>.</div>
    <footer class="foot">
      <span>$3030 · a game token, not an investment</span>
      <span><a href="index.html">home</a> · <a href="whitepaper.pdf" target="_blank" rel="noopener">whitepaper pdf</a> · <a href="https://superrare.com" target="_blank" rel="noopener">superrare</a></span>
      <span>ripmaster3030studios.com</span>
    </footer>
  </div>
  <script src="sfx.js"></script>
</body></html>`;

// ─────────────────────────── WHITEPAPER ───────────────────────────
const whitepaper = `
  <div class="cta" style="margin:-8px 0 4px"><a class="btn" href="whitepaper.pdf" target="_blank" rel="noopener">📄 Download the PDF deck</a>
    <a class="btn cy" href="tokenomics.html">📈 Tokenomics</a>
    <a class="btn cy" href="audit.html">🛡 Our audit notes</a></div>

  <h2><span class="n">01</span>TL;DR</h2>
  <p>ripmaster3030studios is a <b>liquid trading-card game</b> that is, on-chain, one primitive:
  a SuperRare <b>Liquid Edition</b> — a single <b>ERC-20</b> token (<b>$3030</b>) priced by a bonding
  curve in <b>RARE</b> on Uniswap-v4. The <b>100-card deck</b> is the <b>artwork</b>, and <b>every card is a
  LENS</b> — a render that reads the live market + burn. <b>33 hero cards</b> mint as <b>1/1 lenses</b>
  (11 pulled from packs, 22 earned in the games); the other <b>67 field cards</b> are <b>render-only lenses</b>
  (live on-chain, <b>unminted</b>) that you collect and can mint later. Packs <b>burn</b> the token — supply
  <b>only falls</b> — every rip retires supply for good while the RARE reserve stays put, so
  <b>each surviving token is backed by more</b>. Ripping pays the holders. <i>The token burns
  so the art can live.</i> The studio takes a <b>stated</b> cut — half of every pack and half of the 10% game rake fund the studio; the rest burns. No team pre-mint, no hidden fees.</p>

  <h3>The stack — one edition, one lens contract</h3>
  <div class="cols3">
    <div class="card house"><div class="co-h">$3030 · ERC-20</div>
      <p style="margin:0">The <b>edition</b>. One token on a Uniswap-v4 + Doppler
      multicurve, reserve in RARE — chartable like any ERC-20. Buy it, sell it, <b>burn</b> it.
      <b>Minted once</b>; burns are <b>permanent</b>. In SuperRare's words: <i>"the token is not separate
      from the art."</i></p></div>
    <div class="card creator"><div class="co-h">The render — every card is a lens</div>
      <p style="margin:0">A <b>lens</b> is a render <b>keyed by card id</b> in one
      renderer+721 contract, reading price, supply, and <b>burn</b> live. A card is a live lens <b>before</b>
      any token exists for it — so field cards are lenses today, unminted.</p></div>
    <div class="card burn"><div class="co-h">Lenses · ERC-721</div>
      <p style="margin:0">The <b>owned</b> layer. <b>33 hero 1/1s</b> minted now, plus
      <b>Lovebeing</b>, the holder lens every $3030 wallet carries. The 67 field cards mint <b>later</b>,
      against the same render — so they stay lenses, never turning to static art.</p></div>
  </div>
  <p class="fine"><b>No ERC-1155, no per-copy editions, no flood of mints.</b> The on-chain footprint is
  deliberately tiny — 33 hero 1/1s now — while all 100 cards are live lenses. Your field-card collection is
  a site-layer collectible (chain-readable) until you choose to mint it.</p>

  <div class="callout cy"><div class="co-h">This is transparency, not a pitch.</div>
    <p>$3030 is a collectible game token, not an investment. It can go to zero. The cards are art,
    parody, and memes. Play for the fun of it — see <a href="#legal">Legal &amp; NFA</a>.</p></div>

  <h2><span class="n">02</span>The game</h2>
  <ul>
    <li><b>The field</b> — 100 cards, all live lenses, five tiers (Common → Prizm). <b>Rarity is set by
      community vote</b> (the Rarity Court), not decreed.</li>
    <li><b>Rip &amp; collect</b> — a pack is a guided <b>buy of ~350 $3030 — half burned, half to the studio</b>; you pull
      <b>field cards</b> and, rarely, a <b>gacha lens claim</b>. Your collection = your rip history + holdings.</li>
    <li><b>The 33 hero lenses</b> — a <b>genesis set</b> that persists across all four tiers — <b>11 gacha</b>
      (pull the claim from a pack → mint the 1/1) + <b>22 earned</b> (win a one-of-a-kind game title → mint). One owner each.</li>
    <li><b>Play &amp; wager</b> — the games ante $3030 (<b>wagers</b> that transfer to the winner, net-zero to
      supply) and let you stake your cards. Your staked cards arm real in-game power.</li>
    <li><b>The burn</b> — packs retire token supply permanently without touching the reserve, so backing
      per surviving token rises. <b>Nothing retires</b>. Scarcity comes from
      dwindling pack allotments, rarity votes, and <b>compression</b> (corner a field card's copies → 1/1).</li>
  </ul>

  <h2><span class="n">03</span>The token · $3030</h2>
  <div class="statgrid">
    <div class="stat"><b>33M</b><span>hard cap (mint-once)</span></div>
    <div class="stat"><b>~$0.02</b><span>opening / token</span></div>
    <div class="stat"><b>RARE</b><span>reserve currency</span></div>
    <div class="stat"><b>~$606k</b><span>full-curve FDV</span></div>
  </div>
  <p style="margin-top:14px">The token is a <b>cheap micro-token</b> on a <b>Uniswap-v4 pool</b> with liquidity placed as a
  <b>Doppler multicurve</b>. Supply is capped at <b>33,000,000</b> and <b>minted once</b> into the pool at
  launch — burns are <b>permanent</b> and never re-mint. Opening price ≈ 1 RARE/token keeps every pack a
  micro-move. Full-curve FDV ≈ $606k is an <b>artist-scale niche edition, by choice</b>.</p>

  <h2><span class="n">04</span>The economy · where every token goes</h2>
  <p>One direction: <b>the fire</b>. There is no toll wallet, no creator-cut contract, no house
  pool — the only on-chain spend is a burn of the one token.</p>
  <div class="cols3">
    <div class="card burn"><div class="co-h">🔥 Burns (on-chain, real)</div>
      <ul><li>every pack — <b>in full</b> (~350/rip)</li><li>voluntary conviction burns</li>
      <li><b>compression</b> costs</li><li>all irreversible, all public</li></ul></div>
    <div class="card creator"><div class="co-h">📈 The curve (on-chain, real)</div>
      <ul><li>buys deepen the RARE reserve</li><li>sells walk back down it</li>
      <li><b>mint-once</b> — burns never re-mint</li><li>read it live: <code>getMarketState()</code></li></ul></div>
    <div class="card house"><div class="co-h">🃏 Site-layer (signal, honest)</div>
      <ul><li>rarity votes, wagers, trades, binder</li><li>field-card pulls (render-only lenses)</li>
      <li>no tokens burned — <b>only packs burn</b></li></ul></div>
  </div>

  <h2><span class="n">05</span>Packs · a $7 premium, escalating</h2>
  <p>A pack is the one <b>premium</b> action, and it uses only native curve operations: the site walks
  you through <b>buying ~350 $3030 ≈ $7</b> and <b>burning it in full</b>. It is <b>not</b> a token reprice —
  FDV is unchanged — and every rip is a real buy-and-burn, the engine of steady pressure, not a pump. The
  schedule (site-enforced, auditable from the burn txs) escalates <b>within</b> a tier (base→ceil as
  the allotment sells) and <b>across</b> tiers (the allotment dwindles and the floor rises). The pack count
  is bounded by the <b>burn budget, not card supply</b>.</p>
  <table><tr><th>Tier</th><th>Pack allotment</th><th>Base ≈ $*</th></tr>
    <tr><td>Tier I</td><td>1,600 packs</td><td>$7.00</td></tr>
    <tr><td>Tier II</td><td>1,100 packs</td><td>$9.00</td></tr>
    <tr><td>Tier III</td><td>600 packs</td><td>$12.00</td></tr>
    <tr><td>Tier IV</td><td>260 packs</td><td>$16.00</td></tr></table>
  <p class="fine">*Floor at the launch spot ($0.02); token appreciation rides on top. ≈3,560 packs total. See <a href="tokenomics.html">Tokenomics</a>.</p>

  <h2><span class="n">06</span>Lenses, minting &amp; the Compression rite</h2>
  <p>Every card is a lens — a render keyed by id — so the deck exists as art from day one. What changes over
  time is <b>who owns a token</b>:</p>
  <div class="cols3">
    <div class="card house"><div class="co-h">33 hero lenses · minted now</div>
      <p style="margin:0"><b>11 gacha</b> (pull a claim from a pack → mint) + <b>22 earned</b>
      (win a game title → signed voucher → mint). Real <b>1/1 ERC-721</b> tokens, wallet-signed. One owner each.</p></div>
    <div class="card creator"><div class="co-h">67 field lenses · render-only</div>
      <p style="margin:0"><b>Live on-chain, unminted</b> (readable via the CLI). Collect their
      copies from packs; <b>compress</b> (own every copy) into a <b>1/1</b>. Mint them for real <b>later</b>,
      against the same render — they stay lenses, never static art.</p></div>
    <div class="card burn"><div class="co-h">Lovebeing · the holder lens</div>
      <p style="margin:0">The 1/1 marquee, <b>distributed to every $3030 holder</b> — one per
      wallet regardless of balance, <b>non-transferable</b>, <b>non-burnable</b>. Hold the token, you carry it.
      Never minted per-person.</p></div>
  </div>
  <p><b>Nothing turns to ash.</b> The deck <b>survives</b> — cards are never destroyed by the burn. Scarcity is
  emergent: dwindling pack allotments, community rarity votes, and voluntary compression.</p>

  <h2><span class="n">07</span>Steady, not a pump</h2>
  <ul>
    <li><b>Un-pullable liquidity</b> — the RARE reserve lives in the pool, not a yankable LP. Sells walk down the curve.</li>
    <li><b>No team pre-mint</b> — nothing minted at genesis to dump.</li>
    <li><b>Mint-once, buy-and-burn</b> — supply is minted once; RARE flows in on every buy, tokens vanish on
      every pack burn and never re-mint; a shrinking float on a deepening reserve.</li>
    <li><b>Adding liquidity</b> — seed real RARE at deploy and let every buy deepen the reserve organically; the curve itself is the standing liquidity.</li>
  </ul>
  <div class="callout amber"><div class="co-h">What this is NOT.</div>
    <p>Not a promise the price goes up. Net supply moves with <b>buys − burns</b> — the sign is not guaranteed.
    Deflationary <i>pressure</i> is a goal, not a floor. Read the real trajectory live from <code>totalSupply()</code>.</p></div>

  <h2><span class="n">08</span>Transparency</h2>
  <ul>
    <li><b>One contract surface</b> — the edition + a renderer+721 lens contract. A deliberately tiny mint
      footprint (33 hero 1/1s), nothing else to trust or exploit.</li>
    <li><b>Reproducible model</b> — <code>scripts/token-model.mjs</code> re-derives every number here.</li>
    <li><b>Legible actions</b> — packs and conviction burns are burn txs on the one token; hero-lens mints are
      wallet-signed. The chain is the receipt.</li>
    <li><b>Testnet first</b> — a full Sepolia dress rehearsal before any mainnet deploy.</li>
  </ul>

  <h2><span class="n">09</span>Risks</h2>
  <ul>
    <li><b>The token can go to zero.</b> Experimental and highly volatile — only spend what you can lose entirely.</li>
    <li><b>Smart-contract risk.</b> Code can have bugs. Assume unaudited unless a published audit says otherwise (<a href="audit.html">Audit</a>).</li>
    <li><b>Liquidity &amp; slippage.</b> A thin market moves price hard; you may not exit at the quoted price.</li>
    <li><b>Design risk.</b> Game economies can behave unexpectedly, even when tuned and modeled.</li>
    <li><b>Dependency risk.</b> The 721 lens mints run through SuperRare's assisted setup (or our own CLI-deployed
      lens contract) — scope and timing are not solely in our hands.</li>
    <li><b>Site-layer honesty.</b> Rarity votes, wagers, trades, and field-card pulls are community signal /
      render-only on the site, not on-chain settlement. Only packs burn; only hero-lens mints are owned tokens.</li>
    <li><b>Regulatory &amp; key risk.</b> Rules vary and change; a lost key is lost funds.</li>
  </ul>

  <h2 id="legal"><span class="n">10</span>Legal &amp; NFA</h2>
  <p><b>Not financial advice.</b> Nothing here or on ripmaster3030studios.com is financial, investment, legal,
  or tax advice, nor an offer or solicitation to buy or sell any asset. <b>$3030</b> is an experimental,
  volatile utility/collectible <b>game token</b> intended for play and collecting — <b>not an investment
  contract</b> and <b>not a security</b>. There is <b>no promise, guarantee, or expectation of profit, value,
  liquidity, or future development</b>. You may lose everything you put in.</p>
  <p><b>All memes are memes.</b> The cards, characters, names, and imagery are works of <b>art, parody, satire,
  and commentary</b> — transformative by intent. Any resemblance to real people, brands, or trademarks is used
  as cultural reference and critique, not endorsement or affiliation. The project will review and, where
  appropriate, retire content in response to good-faith legal requests.</p>
  <p><b>Do your own research.</b> Crypto assets and smart contracts carry risk, including total loss and bugs.
  Interact at your own risk, comply with the laws of your jurisdiction, and consult your own qualified
  professionals. By acquiring or using $3030 you accept these risks and that the artist, contributors, and
  SuperRare make <b>no warranties</b> of any kind.</p>
  <p class="fine">— Gianni Arone (lovebeing · @_lovebeing_) · SuperRare Liquid Editions, Cohort 1 · $3030</p>`;

// ─────────────────────────── TOKENOMICS ───────────────────────────
const tokenomics = `
  <div class="cta" style="margin:-8px 0 4px"><a class="btn cy" href="whitepaper.html">📄 Whitepaper</a>
    <a class="btn cy" href="audit.html">🛡 Audit notes</a></div>

  <h2><span class="n">01</span>At a glance</h2>
  <div class="statgrid">
    <div class="stat"><b>33M</b><span>supply cap (mint-once)</span></div>
    <div class="stat"><b>~1 RARE</b><span>opening price / token</span></div>
    <div class="stat"><b>M ≈ 10</b><span>demand multiple*</span></div>
    <div class="stat"><b>~$606k</b><span>full-curve FDV</span></div>
  </div>
  <p style="margin-top:14px" class="fine">*<code>medium-demand</code> preset, verified on-chain with <code>--preview</code> before mainnet.
  RARE≈$0.02 assumed for USD columns; re-peg on deploy day. Everything below is reproduced by
  <code>scripts/token-model.mjs</code> — run it to re-derive.</p>

  <h2><span class="n">02</span>What a Liquid Edition is</h2>
  <p>Not a single-formula bond. Each edition is a <b>Uniswap-v4 pool</b> whose liquidity is placed by
  <b>Doppler Multicurve</b> — concentrated positions approximating a log-normal shape, so it "sells a constant
  number of tokens per price bucket." That gives a clean law: price is <b>exponential in supply</b>, which is
  <b>exactly linear in RARE reserve</b>:</p>
  <div class="callout"><p style="margin:0"><code>P(f) = P0 · M^f</code> &nbsp;·&nbsp; <code>P = P0 + a·R</code>, &nbsp;<code>a = ln(M)/cap</code>
    &nbsp; (f = tokens sold ÷ cap). A buy of ΔR RARE raises price by exactly <code>a·ΔR</code>.</p></div>

  <h2><span class="n">03</span>Price schedule</h2>
  <p>The pack column holds the bundle fixed at 350 tokens and reprices it by the token's spot — isolating one
  of the two pack escalators (token appreciation). The designed escalation is in <a href="#packs">§6</a>.</p>
  <table><tr><th>f (sold)</th><th>spot (RARE)</th><th>spot ($)</th><th>pack of 350 ($)</th><th>FDV ($)</th><th>reserve (RARE)</th></tr>
    <tr><td>0.00 (launch)</td><td>1.000</td><td>$0.0200</td><td><b>$7.00</b></td><td>$60,600</td><td>0</td></tr>
    <tr><td>0.10</td><td>1.259</td><td>$0.0252</td><td>$8.81</td><td>$76,291</td><td>340,723</td></tr>
    <tr><td>0.25</td><td>1.778</td><td>$0.0356</td><td>$12.45</td><td>$107,764</td><td>1,024,147</td></tr>
    <tr><td>0.50</td><td>3.162</td><td>$0.0632</td><td>$22.14</td><td>$191,634</td><td>2,845,368</td></tr>
    <tr><td>0.75</td><td>5.623</td><td>$0.1125</td><td>$39.36</td><td>$340,779</td><td>6,084,006</td></tr>
    <tr><td>1.00 (full)</td><td>10.000</td><td>$0.2000</td><td>$70.00</td><td>$606,000</td><td>11,843,211</td></tr></table>
  <p class="fine">Walking the curve to full takes ~11.84M RARE (~$237k) of net buys; avg fill ~3.91 RARE/token.
  FDV is the <b>token</b> line — unchanged by the pack size.</p>

  <h2><span class="n">04</span>Demand-multiple sensitivity</h2>
  <table><tr><th>M</th><th>pack@0</th><th>pack@50%</th><th>pack@100%</th><th>FDV@100%</th><th>RARE to fill</th></tr>
    <tr><td>3 (flat)</td><td>$7.00</td><td>$12.12</td><td>$21.00</td><td>$181,800</td><td>5.52M</td></tr>
    <tr><td><b>10 (medium — rec.)</b></td><td>$7.00</td><td>$22.14</td><td>$70.00</td><td>$606,000</td><td>11.84M</td></tr>
    <tr><td>30 (steep)</td><td>$7.00</td><td>$38.34</td><td>$210.00</td><td>$1,818,000</td><td>25.84M</td></tr></table>

  <h2><span class="n">05</span>Slippage &amp; steady growth</h2>
  <p>Price-impact at launch is exact: <code>impact = a·ΔR / P0</code>.</p>
  <table><tr><th>buy</th><th>impact @ launch</th></tr>
    <tr><td>$20</td><td>0.08%</td></tr><tr><td>$200</td><td>0.76%</td></tr>
    <tr><td>$2,000</td><td>7.60%</td></tr><tr><td>$20,000</td><td>76%</td></tr></table>
  <p>Small plays barely move price; the reserve is <b>un-pullable</b> (it lives in the pool), there is <b>no team
  pre-mint</b>, and packs are a <b>buy-and-burn</b> that ratchets a shrinking float against a deepening reserve.
  Add liquidity by seeding real RARE at deploy and letting every buy deepen the pool organically — the curve
  itself is the standing liquidity.</p>

  <h2 id="packs"><span class="n">06</span>The pack allotment (dwindling + escalating)</h2>
  <p>⛔ <b>There are no seasons.</b> ripmaster3030studios is a game studio, not a drop calendar — the schedule is
  <b>tiered</b>. Each tier opens a fixed <b>allotment</b> of packs; within a tier the price walks a line from base → ceil
  as it sells, then that tier <b>closes</b> and the next opens (secondary market in between). A tier opens when the one
  before it <b>sells out</b>, not on a date. The allotment shrinks and the floor
  rises each tier. Allotments are sized so a full four-tier sellout burns the whole budget (§7) and no
  more. The schedule is <b>site-enforced</b> (packs are guided buy+burns of the one token — there is no pack
  contract) and fully auditable from the burn txs.</p>
  <table><tr><th>Tier</th><th>Pack allotment</th><th>base → ceil (tok)</th><th>base ≈ $*</th><th>ceil ≈ $*</th><th>tier 🔥 (tok)</th></tr>
    <tr><td>Tier I</td><td>1,600 packs</td><td>350 → 525</td><td>$7.00</td><td>$10.50</td><td>350,000</td></tr>
    <tr><td>Tier II</td><td>1,100 packs</td><td>450 → 675</td><td>$9.00</td><td>$13.50</td><td>309,375</td></tr>
    <tr><td>Tier III</td><td>600 packs</td><td>600 → 900</td><td>$12.00</td><td>$18.00</td><td>225,000</td></tr>
    <tr><td>Tier IV</td><td>260 packs</td><td>800 → 1,200</td><td>$16.00</td><td>$24.00</td><td>130,000</td></tr></table>
  <p class="fine">*Floor priced at the launch spot ($0.02); token appreciation rides on top. ≈3,560 packs total;
  full sellout 🔥 ≈ 1,014,375 burned + 1,014,375 to the studio. Curator-set at each tier open, recalibrated to the live token price.</p>

  <h2><span class="n">07</span>The burn schedule</h2>
  <p>The only on-chain spend is the one token. A pack and a game rake <b>split 50/50</b> — half
  <span class="fire">🔥 burns permanently</span>, half funds the studio, in a single atomic call that cannot
  half-execute. The studio's cut is stated on the tin; there is no hidden fee and no house pool players can
  win back. Hero-lens <b>mints</b> are wallet-signed 721 mints, not token payouts.</p>
  <table><tr><th>Action</th><th>Cost</th><th>→</th></tr>
    <tr><td>rip a pack (field cards + rare gacha claim)</td><td>~350 → escalates (§6)</td><td><span class="fire">🔥 half</span> · half studio</td></tr>
    <tr><td>conviction burn (voluntary)</td><td>any amount</td><td class="fire">🔥</td></tr>
    <tr><td><b>compression</b> (own every copy of a field card → 1/1)</td><td>compression cost</td><td class="fire">🔥</td></tr>
    <tr><td>game rake (10% of the pot)</td><td>10% of the wagered pot</td><td><span class="fire">🔥 5%</span> · 5% studio</td></tr>
    <tr><td>rarity votes · trades · binder · field-card pulls</td><td>site-side signal</td><td>no burn</td></tr></table>

  <h2><span class="n">08</span>Lifetime burn — what it does and does not do</h2>
  <p>Because the token is <b>minted once</b> and burns are <b>permanent</b>, lifetime burn is <b>bounded by the
  cap</b>. Packs burn the token down over the deck's four-tier life toward a permanent floor. <b>Cards do not
  retire or ash</b> — this is token deflation only.</p>
  <table><tr><th>metric</th><th>value</th><th>note</th></tr>
    <tr><td>Full four-tier sellout 🔥</td><td><b>1,014,375</b></td><td>3.1% of the 33,000,000 cap (half of each pack)</td></tr>
    <tr><td>To the studio, same period</td><td><b>1,014,375</b></td><td>the other half — revenue, not destroyed</td></tr>
    <tr><td>Settled live float</td><td><b>~31,985,625</b></td><td>survives as the permanent float</td></tr>
    <tr><td>Permanent contraction</td><td><b>≈ 1.03×</b></td><td>33M → ~31.99M. We do <b>not</b> claim deflation as the thesis</td></tr>
    <tr><td>Invariant (mint-once)</td><td>Σ 🔥 ≤ cap ✓</td><td>1.01M &lt; 33M</td></tr></table>
  <p>Pack burns are denominated in <b>tokens</b>, not in a share of supply, so a larger mint does not
  scale them. The burn is still real and permanent — it raises reserve-backing per surviving token —
  but at this supply it is <b>not</b> a scarcity engine, and we do not present it as one.</p>
  <p class="fine">A partial life (fewer rips) simply settles the token at a higher float. The deck reaches its
  fully-deflated float only if the community truly burns across the tiers. No burn ever re-mints.</p>
  <div class="callout"><p style="margin:0">Net supply change = <b>buys − burns</b> (sign indeterminate in the short
    run). Over the deck's life the <b>burns dominate</b>: ⅔ of the mint is retired permanently. Read the real
    trajectory from <code>totalSupply()</code> — burn progress is <code>maxTotalSupply − totalSupply</code>.</p></div>

  <h2><span class="n">09</span>Before mainnet — what we verify</h2>
  <ul>
    <li><b>Mint/burn semantics — settled.</b> Per SuperRare's audit, the edition is <b>minted once</b> and burns
      are <b>permanent</b> (no re-mint). The whole model is built on that.</li>
    <li><b>Effective M</b> — back the real end/start multiple out of the preset's curves via <code>--preview</code>. Pick the steadiest slope.</li>
    <li><b>Sell-fraction</b> — is the whole cap sold on the curve, or is some reserved? FDV / RARE-to-fill / slippage scale with it.</li>
    <li><b>Opening price</b> — calibrate the multicurve against the 33M supply with SuperRare (see <a href="audit.html">Audit</a>).</li>
    <li><b>RARE seed floor</b> — read <code>minRareLiquidityWei()</code>; confirm the seed with the cohort.</li>
    <li><b>Live RARE/USD</b> — the $ columns assume $0.02; re-peg P0 on deploy day.</li>
    <li><b>Chain</b> — deploy on an L2 (or batch actions) so micro-actions aren't gas-dominated.</li>
  </ul>`;

// ─────────────────────────── AUDIT ───────────────────────────
const audit = `
  <div class="cta" style="margin:-8px 0 4px"><a class="btn cy" href="whitepaper.html">📄 Whitepaper</a>
    <a class="btn cy" href="tokenomics.html">📈 Tokenomics</a></div>

  <div class="callout red"><div class="co-h">Status: self-reviewed, NOT yet third-party audited.</div>
    <p>This page is our <b>own</b> honest accounting of the review we've done and what we haven't. Everything
    here is <b>experimental and unaudited by an independent firm</b>. A formal external audit is <b>pending</b>
    before any mainnet deploy. Interact at your own risk. Not a security assurance, not financial advice.</p></div>

  <div class="callout amber"><div class="co-h">Architecture at launch: one Liquid Edition + one lens contract.</div>
    <p>The project ships as a <b>Liquid Edition</b> — one ERC-20 + a <b>renderer+721 lens contract</b> where
    every card is a render keyed by id. <b>33 hero 1/1s</b> mint at launch; the 67 field cards are render-only
    (unminted). There is <b>no ERC-1155</b> and no separate game contract at launch — wagers, votes, and
    field-card pulls run site-side, with real pack burns + hero-lens mints as the on-chain actions.
    Authoritative design: <code>docs/ECONOMIC-FLOW.md</code>.</p></div>

  <h2><span class="n">01</span>What we reviewed, and how</h2>
  <ul>
    <li><b>The launch surface is deliberately tiny.</b> One ERC-20 (deployed by SuperRare's audited factory
      via the Rare CLI — not our code) + one renderer+721 lens contract with a tiny mint footprint (33 hero 1/1s).
      The less we deploy, the less there is to get wrong.</li>
    <li><b>Reproducible economics.</b> Every tokenomics number is derived by <code>scripts/token-model.mjs</code>
      — run it and re-derive the price schedule, slippage, allotments, and lifetime burn yourself.</li>
    <li><b>Adversarial modeling pass.</b> The tokenomics were pressure-tested by an adversarial pass — multiple
      independent models, each checked by a skeptic — to catch hand-wavy claims and hidden assumptions.</li>
    <li><b>SuperRare Sepolia audit.</b> A testnet rehearsal drew a five-item review from SuperRare; our
      point-by-point reply is in <code>docs/AUDIT-REPLY.md</code>. Highlights below.</li>
  </ul>

  <h2><span class="n">02</span>Things we found and fixed (in the open)</h2>
  <ul>
    <li><b>The burn schedule overflowed the cap.</b> An early card-retirement schedule totalled 4.36M burn
      against a mint-once cap — impossible. <b>Fixed by removing the mechanic:</b> v2.2 cut forced card
      retirement / ash entirely. The burn is now pure <b>token deflation</b> (~1.01M at the 50% pack split), and the
      deck <b>survives</b>. The only rule left is the trivial Σ burns ≤ cap.</li>
    <li><b>Mint/burn assumption, corrected.</b> We'd assumed burns re-mint on the next buy. SuperRare confirmed
      the opposite — <b>minted once, burns permanent</b>. The whole model was rebuilt on that.</li>
    <li><b>The lens standard.</b> We'd sketched a custom ERC-1155. The cohort docs are clear: lenses are
      <b>ERC-721</b>. <b>Fixed:</b> every card is a render-by-id lens on one renderer+721 contract — 33 minted,
      67 render-only, Lovebeing a holder lens — a tiny mint footprint, no 1155.</li>
    <li><b>Renderer display bugs.</b> The render read 100% "circulating" and 0 per-RARE; <b>fixed</b> to read
      BURNED % (<code>max − total</code>) and a 2-dp per-RARE value in <code>contracts/Ripmaster3030Renderer.sol</code>
      (re-callable <code>setRenderContract</code>, no token redeploy).</li>
    <li><b>A ~100× pricing error in an early doc.</b> A stale peg implied a ~$0.001 pack. <b>Fixed:</b> the peg is
      ~1 RARE/token; the pack is a ~350-token bundle ≈ $7.</li>
    <li><b>Over-claimed "supply only goes down."</b> <b>Fixed:</b> the docs now state plainly that net supply =
      buys − burns (sign indeterminate short-term); deflation is <i>pressure</i>, and over the deck's life burns dominate.</li>
  </ul>

  <h2><span class="n">03</span>Invariants we designed for (launch)</h2>
  <div class="grid2">
    <div class="stat"><b>Mint-once</b><span>whole supply minted into the pool at launch; burns are permanent, never re-mint</span></div>
    <div class="stat"><b>Un-pullable reserve</b><span>RARE lives in the v4 pool, not a yankable LP; sells walk the curve</span></div>
    <div class="stat"><b>No fee wallet</b><span>every on-chain spend is a burn of the one token — nothing is routed anywhere</span></div>
    <div class="stat"><b>Tiny mint footprint</b><span>33 hero 1/1s at launch; the deck is lenses, not a flood of editions</span></div>
    <div class="stat"><b>Full-burn packs</b><span>a rip burns 100% — no slice to any pool or wallet</span></div>
    <div class="stat"><b>Cards survive</b><span>no forced retirement/ash; scarcity is votes + dwindling packs + compression</span></div>
  </div>

  <h2><span class="n">04</span>What is still pending before mainnet</h2>
  <ul>
    <li><b>Independent third-party security audit</b> of the renderer+721 lens contract — not yet performed.
      (The ERC-20 + curve come from SuperRare's protocol; the render/lens is ours.)</li>
    <li><b>Curve calibration</b> — set the opening price against the 33M supply (with SuperRare).</li>
    <li><b>Lens setup with SuperRare</b> — does the assisted 721 setup support render-by-id across 100 card-lenses
      (33 minted, 67 render-only), or do we deploy our own combined renderer+721 lens contract via the CLI?</li>
    <li><b>Mint mechanism</b> — a claim/voucher redeemer for the 11 gacha lenses (pack burn) and the 22 earned
      lenses (signed game vouchers).</li>
    <li><b>Full Sepolia dress rehearsal</b> — deploy, wire the render, run a mock tier: rips (buy+burn), a
      hero-lens mint, and watch the burn meter climb in the render.</li>
  </ul>

  <h2><span class="n">05</span>Verify us yourself</h2>
  <ul>
    <li><b>Run the model</b> — <code>node scripts/token-model.mjs</code> reproduces every number on the <a href="tokenomics.html">Tokenomics</a> page.</li>
    <li><b>Watch the chain</b> — packs and conviction are burn txs on the one token; hero-lens mints are wallet-signed; <code>getMarketState()</code> is live.</li>
    <li><b>Read the design</b> — <code>docs/ECONOMIC-FLOW.md</code> (canonical) + <code>docs/AUDIT-REPLY.md</code> (the SuperRare reply).</li>
    <li><b>Read the render fix</b> — <code>contracts/Ripmaster3030Renderer.sol</code> (BURNED %, per-RARE).</li>
  </ul>
  <div class="callout amber"><div class="co-h">The honest bottom line.</div>
    <p>We've been transparent about what we checked and what we didn't. Self-review and a clean compile are
    <b>not</b> a substitute for a professional audit. Treat $3030 as experimental software that can lose your
    money. NFA — see the <a href="whitepaper.html#legal">whitepaper</a>.</p></div>`;

// ─────────────────────────── ARTIST ───────────────────────────
const artist = `
  <div class="cta" style="margin:-8px 0 4px"><a class="btn" href="https://x.com/_lovebeing_" target="_blank" rel="noopener">𝕏 @_lovebeing_</a>
    <a class="btn cy" href="cards/lovebeing.html">✦ View the 1/1</a></div>

  <h2><span class="n">01</span>Who</h2>
  <p><b>Gianni Arone</b> works as <b>lovebeing</b> — a multidisciplinary artist out of <b>New York</b>
  whose catalog runs from 1982 to now, moving between <b>painting, silkscreen, zines, digital work,
  motion, sound, and code</b>. ripmaster3030studios is what happens when all of that gets pointed
  at a single lifelong obsession: <b>the trading card</b>.</p>

  <h2><span class="n">02</span>Why liquid — in his words</h2>
  <div class="callout"><p style="margin:0 0 10px">I'm a multidisciplinary artist working as lovebeing, out of New York.
  For years I've moved between painting, silkscreen, zines, motion, sound, and code, all of it chasing the same
  feeling I've had since I was a kid. I grew up on <b>trading cards, pogs, MAD magazine, and the backs of cereal
  boxes — the first memes</b>, if you'll let me call them that. That's where I learned a picture could be a joke,
  a trophy, and a currency all at once: something you'd trade at recess and still guard with your life.</p>
  <p style="margin:0">Static NFTs never caught that. Liquid Editions are the first format where the card is
  <b>alive</b> — priced by a curve, played by a crowd, a living lens over the market. Ripmaster is that recess
  table rebuilt on-chain: a full field of <b>100 living lenses</b>, a token that <b>only ever burns down</b> while the
  deck <b>survives</b>, and a handful of hero cards you <b>earn or pull</b> and mint as real 1/1s. The 1/1 at the
  top of the deck carries my name, <b>Lovebeing</b> — and every holder carries one.</p></div>

  <h2><span class="n">03</span>SuperRare Liquid Editions · Cohort 1</h2>
  <p>lovebeing is one of <b>four artists</b> in SuperRare's first <b>Liquid Editions</b> cohort — a program for
  artworks designed to <i>live, evolve, and circulate across networks</i> — alongside
  <a href="https://x.com/CreamyDreamy" target="_blank" rel="noopener">@CreamyDreamy</a>,
  <a href="https://x.com/takenstheorem" target="_blank" rel="noopener">@takenstheorem</a>, and
  <a href="https://x.com/tyaagnliu" target="_blank" rel="noopener">@tyaagnliu</a>.</p>

  <h2><span class="n">04</span>The namesake lens</h2>
  <p>The <b>1/1 marquee</b> at the top of the deck is <b>Lovebeing</b> — the artist's own name. It is a
  <b>holder-bound lens</b>: every $3030 holder carries one, one per wallet, and it <b>can't be burned</b> or
  duplicated. It never appears in a pack — hold the token and it's yours.</p>
  <p><a class="btn" href="cards/lovebeing.html">✦ View the 1/1 marquee →</a></p>

  <h2><span class="n">05</span>Elsewhere</h2>
  <div class="cta">
    <a class="btn cy" href="https://x.com/_lovebeing_" target="_blank" rel="noopener">𝕏 X · @_lovebeing_</a>
    <a class="btn cy" href="https://www.gianniaronestudio.com/" target="_blank" rel="noopener">◆ Studio</a>
    <a class="btn cy" href="https://www.lovebeing.world/" target="_blank" rel="noopener">▤ Archive</a>
    <a class="btn cy" href="https://www.instagram.com/gianniarone/" target="_blank" rel="noopener">◎ Instagram</a>
    <a class="btn cy" href="https://soundcloud.com/gianniarone" target="_blank" rel="noopener">♪ SoundCloud</a>
  </div>
  <p class="fine" style="margin-top:14px">The game's soundtrack was produced by <b>lovebeing &amp; sean</b>, an
  unhoused friend from the street. <span style="color:#4ea472">Links are the artist's own — verify before sharing.</span></p>`;

// ─────────────────────────── write ───────────────────────────
const pages = [
  { slug: 'artist.html', title: 'The Artist', kicker: 'Gianni Arone · lovebeing · @_lovebeing_',
    subtitle: 'The multidisciplinary artist behind ripmaster3030studios — and the 1/1 at the top of the deck.',
    accent: 'var(--acid)', body: artist },
  { slug: 'whitepaper.html', title: 'Transparent Whitepaper', kicker: 'ripmaster3030studios · $3030 · NFA',
    subtitle: 'What the game is, how the token works, where every $3030 goes, and the risks — in the open, for frens.',
    accent: 'var(--phos)', body: whitepaper },
  { slug: 'tokenomics.html', title: 'Tokenomics', kicker: '$3030 · supply · burns · pricing · liquidity',
    subtitle: 'Supply, the bonding curve, pack allotments, the burn schedule, and pre-mainnet verification — every number reproducible.',
    accent: 'var(--amber)', body: tokenomics },
  { slug: 'audit.html', title: 'Our Own Audit Notes', kicker: 'Self-review · what we checked · what is pending',
    subtitle: 'An honest accounting of the review we have done, the bugs we found and fixed, and what a third-party audit still needs to cover.',
    accent: 'var(--cyan)', body: audit },
];

for (const p of pages) {
  writeFileSync(join(ROOT, p.slug), shell(p));
  console.log(`✦ ${p.slug}`);
}

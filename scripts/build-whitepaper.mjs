#!/usr/bin/env node
// Build the UR3030 "Transparent Whitepaper" — a branded, 16:9 PDF deck for the site.
// Self-contained (marquee art embedded as a data URI), acid-terminal styling matched
// to index.html, strong NFA / "all memes are memes" legal cover. Reproducible:
//
//   node scripts/build-whitepaper.mjs
//
// Writes whitepaper.pdf to the repo root (served at /whitepaper.pdf on the site) and
// a copy + the source HTML into the scratchpad. Numbers mirror docs/TOKEN-MATH.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// ── embed the marquee hero as a data URI so the deck is fully self-contained ──
const heroB64 = readFileSync(join(ROOT, 'marquee-header.webp')).toString('base64');
const HERO = `data:image/webp;base64,${heroB64}`;

// ── brand tokens (from index.html :root) ──
const C = {
  void: '#020804', panel: '#04140b', ink: '#01130a',
  phos: '#2bff80', phosdim: '#0f5c33', phosdeep: '#0a3d22',
  acid: '#ff2ad9', cyan: '#27f7e4', amber: '#ffd23b', red: '#ff4b3a', text: '#b8ffd6',
};

// a reusable slide frame: kicker + number + the shared chrome (scanlines, watermark, NFA)
// N starts at 1 so the cover is page 01 and the content slides run 02…11 of 11.
let N = 1;
const TOTAL = 11;
const slide = (kicker, inner, accent = C.phos) => {
  N++;
  return `<section class="slide">
    <div class="scan"></div><div class="grid"></div>
    <div class="wm">UPPERDECK · RIPMASTER · 3030</div>
    <header class="shead">
      <span class="kick" style="color:${accent};border-color:${accent}">${kicker}</span>
      <span class="pg">${String(N).padStart(2, '0')} / ${TOTAL}</span>
    </header>
    <div class="body">${inner}</div>
    <footer class="sfoot">
      <span>$UR3030 · a game token, not an investment</span>
      <span class="nfa">NOT FINANCIAL ADVICE · ALL MEMES ARE MEMES · DYOR</span>
      <span>upperdeckripmaster3030.com</span>
    </footer>
  </section>`;
};

// ── slides ──
const S = [];

// 1 — COVER
S.push(`<section class="slide cover">
  <div class="scan"></div><div class="grid"></div>
  <div class="cover-glow"></div>
  <img class="hero" src="${HERO}" alt="Upperdeck Ripmaster 3030">
  <div class="cover-mid">
    <div class="eyebrow">TRANSPARENT WHITEPAPER · v1 · <span style="color:${C.amber}">NFA</span></div>
    <h1 class="big">UPPERDECK<br>RIPMASTER 3030</h1>
    <div class="tokline">$UR3030 · a liquid trading-card game on <b>SuperRare Liquid Editions</b></div>
    <div class="byline">by <b>Gianni Arone</b> (lovebeing · @_lovebeing_) &nbsp;·&nbsp; SuperRare Liquid Editions — Cohort 1</div>
  </div>
  <footer class="sfoot cover-foot">
    <span>For frens, for transparency.</span>
    <span class="nfa">EXPERIMENTAL · VOLATILE · NO PROMISE OF VALUE · NOT A SECURITY</span>
    <span>${String(TOTAL).padStart(2,'0')} pages</span>
  </footer>
</section>`);

// 2 — TL;DR / what this is
S.push(slide('TL;DR — read this first', `
  <h2>A card game whose losers actually leave the table.</h2>
  <div class="cols">
    <ul class="bullets">
      <li>Every card is a <b>live SuperRare Liquid Edition</b> priced by a bonding curve in <b>RARE</b>.</li>
      <li><b>$UR3030</b> is the in-game token you rip packs, vote, wager, and settle with.</li>
      <li>A full field of <b>~196</b> cards opens each season; the crowd <b>burns it down to a deck of 77</b>.</li>
      <li>Two clean flows go <b>to people</b> — a creator cut and a house bounty. Everything else <b>burns</b>.</li>
      <li><b>No treasury. No team pre-mint. No fee wallet.</b> The reserve can't be pulled.</li>
    </ul>
    <div class="callout">
      <div class="co-h">This document is transparency, not a pitch.</div>
      <p>$UR3030 is a <b>collectible game token</b>, not an investment. It can go to zero.
      The cards are <b>art, parody, and memes</b>. Play for the fun of it. Nothing here is
      financial, legal, or tax advice — see the last page.</p>
    </div>
  </div>`, C.cyan));

// 3 — the card game
S.push(slide('The game', `
  <h2>Open the field. Play it down to 77.</h2>
  <div class="cols">
    <ul class="bullets">
      <li><b>The field opens</b> — every registered card is in play, each its own liquid edition.</li>
      <li><b>Rip &amp; collect</b> — packs mint ERC-1155 copies across five tiers: Common → Uncommon → Rare → Mythic → Prizm.</li>
      <li><b>The Rarity Court</b> — holders burn to <b>promote</b>, <b>demote</b>, or <b>⛨ HODL</b> a card. Up pays the creator; down burns.</li>
      <li><b>The cull</b> — downvotes (on a <b>quorum</b>) retire cards; owning a whole edition lets you <b>destroy</b> it forever.</li>
      <li><b>Survivors</b> — the field resolves to a <b>standard deck of 77</b>. Hold one and you hold 1 of 77 that outlived the rest.</li>
    </ul>
    <div class="statwrap">
      <div class="stat"><b>196</b><span>cards open the field</span></div>
      <div class="stat"><b>77</b><span>survivors per deck</span></div>
      <div class="stat"><b>5</b><span>rarity tiers</span></div>
      <div class="stat"><b>∞</b><span>ash — retired is forever</span></div>
    </div>
  </div>`, C.phos));

// 4 — the token
S.push(slide('The token · $UR3030', `
  <h2>A cheap micro-token on a Uniswap-v4 + Doppler curve.</h2>
  <div class="cols">
    <ul class="bullets">
      <li><b>Supply cap: 3,030,000 $UR3030</b>, capped. Minted on <b>buy</b>; the cap is a live-supply ceiling, not a lifetime budget.</li>
      <li><b>Opening price ≈ 1 RARE / token (~$0.02)</b> — kept cheap so every toll and vote is a micro-move.</li>
      <li>Liquidity is a <b>Doppler multicurve</b> (log-normal) inside a <b>Uniswap-v4 pool</b>; reserve/quote is <b>RARE</b>.</li>
      <li><b>FDV at a full curve ≈ $606k</b> — an artist-scale niche edition, by choice. Verified with <code>--preview</code> pre-mainnet.</li>
    </ul>
    <div class="statwrap">
      <div class="stat"><b>3.03M</b><span>hard cap</span></div>
      <div class="stat"><b>~$0.02</b><span>opening / token</span></div>
      <div class="stat"><b>RARE</b><span>reserve currency</span></div>
      <div class="stat"><b>~$606k</b><span>full-curve FDV</span></div>
    </div>
  </div>
  <p class="fine">Two on-chain unknowns are confirmed with the Rare CLI before mainnet: the effective demand multiple <b>M</b> and the <b>sell-fraction</b>. The whole model is reproducible in <code>scripts/token-model.mjs</code>.</p>`, C.amber));

// 5 — the economy / money map
S.push(slide('The economy · where every token goes', `
  <h2>Nearly every move burns. Two flows go to people.</h2>
  <div class="moneymap">
    <div class="mm burn">
      <div class="mm-h">🔥 BURN (destroyed)</div>
      <ul>
        <li>send 1 · trade 1/side · wager 2/side · marquee 25</li>
        <li>downvotes (demote a card)</li>
        <li>most of every pack (~349 of ~350)</li>
        <li>destroyed editions + their toll</li>
      </ul>
    </div>
    <div class="mm creator">
      <div class="mm-h">🎨 CREATOR (direct transfer)</div>
      <ul>
        <li>upvotes / promotions</li>
        <li>HODL ⛨ votes</li>
        <li>a royalty stream, not a treasury — visible in <code>CreatorPaid</code></li>
      </ul>
    </div>
    <div class="mm house">
      <div class="mm-h">🏦 HOUSE BOUNTY (player pool)</div>
      <ul>
        <li>1 token from each pack seeds it</li>
        <li>pays whoever ends an edition (last-standing reward)</li>
        <li>a bounty, not an operator wallet — anyone can <code>fundReward</code></li>
      </ul>
    </div>
  </div>
  <p class="fine">There is no fee wallet and no treasury. The burn is destroyed; the creator cut and house bounty are direct, legible on-chain transfers. Curator-tunable, all in the open contract <code>CardVault.sol</code>.</p>`, C.red));

// 6 — packs
S.push(slide('Packs · a $7 premium, escalating', `
  <h2>The one premium action. Everything else is a micro-toll.</h2>
  <div class="cols">
    <ul class="bullets">
      <li>A pack is a <b>bundle of ~350 $UR3030 ≈ $7</b> (seven cards, ~$1 a card) — <b>not</b> a token reprice. FDV is unchanged.</li>
      <li>Each rip is a real <b>buy-and-burn of hundreds of tokens</b> — the engine of steady pressure, not a pump.</li>
      <li><b>Within a season:</b> price walks a line from base → ceil as the allotment sells (S1 350 → 525 tokens).</li>
      <li><b>Across seasons:</b> the field shrinks, so the <b>allotment (cards ÷ 7) dwindles</b> and the floor rises.</li>
      <li>Sell out the allotment and packs <b>close for the season</b> — cards trade secondary only.</li>
    </ul>
    <table class="tbl">
      <tr><th>Season</th><th>Pack allotment</th><th>Base ≈ $*</th></tr>
      <tr><td>I · Summer</td><td>10,000 packs</td><td>$7.00</td></tr>
      <tr><td>II · Fall</td><td>7,500 packs</td><td>$9.00</td></tr>
      <tr><td>III · Winter</td><td>5,000 packs</td><td>$12.00</td></tr>
      <tr><td>IV · Spring</td><td>2,500 packs</td><td>$16.00</td></tr>
    </table>
  </div>
  <p class="fine">*Floor priced at the launch spot ($0.02); token appreciation rides on top. Curator-set at <code>openSeason()</code>, recalibrated to the live token price.</p>`, C.acid));

// 7 — seasons
S.push(slide('Seasons · on the calendar', `
  <h2>Four a year. We launch in the season we're in.</h2>
  <div class="seasonrow">
    <div class="sea live"><em>Season I</em><b>SUMMER</b><span>live at launch</span></div>
    <div class="sea"><em>Season II</em><b>FALL</b><span>soon</span></div>
    <div class="sea"><em>Season III</em><b>WINTER</b><span>soon</span></div>
    <div class="sea"><em>Season IV</em><b>SPRING</b><span>soon</span></div>
  </div>
  <ul class="bullets wide">
    <li>Each season <b>opens a full field</b> and the crowd burns it down to <b>77 survivors</b>; the best non-survivors seed the next season's field — a rolling tournament, not a delete.</li>
    <li>Every retirement mints the last keeper a <b>soulbound Ash Trophy</b> + a token bounty from the house.</li>
    <li>The render reads <b>live market + game state</b>, so a card's art evolves with its price and how the crowd treats it.</li>
  </ul>`, C.cyan));

// 8 — steady not a pump
S.push(slide('Steady, not a pump', `
  <h2>Built to ratchet, not to spike — and to add liquidity.</h2>
  <div class="cols">
    <ul class="bullets">
      <li><b>Un-pullable liquidity</b> — the RARE reserve lives in the pool, not a yankable LP. Sells walk down the curve; they can't drain it to zero.</li>
      <li><b>No team pre-mint</b> — nothing is minted at genesis to dump on you.</li>
      <li><b>Buy-and-burn packs</b> — RARE flows in on every buy, tokens vanish on every burn, so fewer tokens sit on a deeper reserve.</li>
      <li><b>Adding liquidity</b> — seed real RARE at deploy, let buys deepen the reserve, and <b>recycle a share of the creator cut / house pool back into RARE reserve</b> on a schedule.</li>
    </ul>
    <div class="callout amber">
      <div class="co-h">What this is NOT.</div>
      <p>Not a promise the price goes up. Net supply moves with <b>buys − burns</b> — the sign is
      not guaranteed. Deflationary <i>pressure</i> is a design goal, not a floor. Read the real
      trajectory live from <code>totalSupply()</code>.</p>
    </div>
  </div>`, C.phos));

// 9 — transparency
S.push(slide('Transparency', `
  <h2>Everything that matters is on-chain and reproducible.</h2>
  <div class="cols">
    <ul class="bullets">
      <li><b>Open economy contract</b> — <code>CardVault.sol</code>: tolls, votes, packs, destruction, bounty. Curator setters are visible.</li>
      <li><b>Reproducible model</b> — <code>scripts/token-model.mjs</code> re-derives every number in this deck. Run it yourself.</li>
      <li><b>Legible flows</b> — <code>CreatorPaid</code>, burn, <code>AshTrophy</code>, <code>EditionDestroyed</code> events are the receipts.</li>
      <li><b>No hidden wallet</b> — no fee address, no treasury, no admin mint of the token supply.</li>
      <li><b>Testnet first</b> — a full Sepolia dress rehearsal before any mainnet deploy.</li>
    </ul>
    <div class="callout">
      <div class="co-h">You can check us.</div>
      <p>Read the contract. Run the model. Watch the events. Transparency here means you don't
      have to trust the copy on this page — the chain is the source of truth.</p>
    </div>
  </div>`, C.cyan));

// 10 — risks
S.push(slide('Risks · read honestly', `
  <h2>Ways this can lose you money or break.</h2>
  <div class="cols">
    <ul class="bullets risk">
      <li><b>The token can go to zero.</b> It is experimental and highly volatile. Only spend what you can lose entirely.</li>
      <li><b>Smart-contract risk.</b> Code can have bugs. Assume it is unaudited unless a published audit says otherwise.</li>
      <li><b>Liquidity &amp; slippage.</b> A thin market means large trades move price hard; you may not be able to exit at the quoted price.</li>
      <li><b>Design risk.</b> Curve/preset parameters, burn balance, and reward solvency are tuned and verified — but game economies can behave in unexpected ways.</li>
      <li><b>Regulatory &amp; key risk.</b> Rules vary by jurisdiction and can change; self-custody means a lost key is lost funds.</li>
    </ul>
    <div class="callout red">
      <div class="co-h">The honest bottom line.</div>
      <p>This is a <b>game and an art project</b>, not a yield product. There is <b>no expectation of
      profit</b>. If any part of this reads like a promise of returns, re-read it: it isn't one.</p>
    </div>
  </div>`, C.red));

// 11 — legal & NFA
S.push(slide('Legal &amp; NFA · the fine print', `
  <h2>All memes are memes. Not financial advice.</h2>
  <div class="legal">
    <p><b>Not financial advice.</b> Nothing in this document or on upperdeckripmaster3030.com is
    financial, investment, legal, or tax advice, nor an offer or solicitation to buy or sell any
    asset. <b>$UR3030</b> is an experimental, volatile utility/collectible <b>game token</b> intended
    for play and collecting — <b>not an investment contract</b> and <b>not a security</b>. There is
    <b>no promise, guarantee, or expectation of profit, value, liquidity, or future development</b>.
    You may lose everything you put in.</p>
    <p><b>All memes are memes.</b> The cards, characters, names, and imagery are works of
    <b>art, parody, satire, and commentary</b> — transformative by intent. Any resemblance to real
    people, brands, or trademarks is used as cultural reference and critique, not endorsement or
    affiliation. The project will review and, where appropriate, retire content in response to
    good-faith legal requests.</p>
    <p><b>Do your own research.</b> Crypto assets and smart contracts carry risk, including total
    loss and bugs. Interact at your own risk, comply with the laws of your jurisdiction, and consult
    your own qualified professionals. By acquiring or using $UR3030 you accept these risks and that
    the artist, contributors, and SuperRare make <b>no warranties</b> of any kind.</p>
    <p class="sig">— Gianni Arone (lovebeing · @_lovebeing_) · SuperRare Liquid Editions, Cohort 1 · <span style="color:${C.phos}">$UR3030</span></p>
  </div>`, C.amber));

// ── document ──
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Upperdeck Ripmaster 3030 — Transparent Whitepaper</title>
<style>
  @page { size: 13.333in 7.5in; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: ${C.void}; }
  body { font-family: 'Courier New', ui-monospace, monospace; color: ${C.text}; }
  code { font-family: 'Courier New', monospace; color: ${C.cyan}; background: rgba(39,247,228,.08);
    border: 1px solid rgba(39,247,228,.25); border-radius: 4px; padding: 0 4px; font-size: .92em; }
  b { color: #d9ffe8; }

  .slide { position: relative; width: 13.333in; height: 7.5in; overflow: hidden;
    background:
      radial-gradient(120% 90% at 82% 8%, rgba(43,255,128,.10), transparent 55%),
      radial-gradient(90% 80% at 10% 100%, rgba(255,42,217,.08), transparent 55%),
      ${C.void};
    page-break-after: always; padding: 0.62in 0.72in; display: flex; flex-direction: column; }
  .slide:last-child { page-break-after: auto; }
  .scan { position: absolute; inset: 0; pointer-events: none; opacity: .35;
    background: repeating-linear-gradient(180deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.28) 2px 3px); }
  .grid { position: absolute; inset: 0; pointer-events: none; opacity: .16;
    background:
      linear-gradient(rgba(43,255,128,.10) 1px, transparent 1px) 0 0/ 46px 46px,
      linear-gradient(90deg, rgba(43,255,128,.10) 1px, transparent 1px) 0 0/ 46px 46px;
    mask-image: radial-gradient(120% 100% at 50% 40%, #000 55%, transparent 92%); }
  .wm { position: absolute; right: -0.2in; bottom: 2.7in; transform: rotate(90deg); transform-origin: right bottom;
    font-family: 'Arial Black', Arial, sans-serif; font-size: 15px; letter-spacing: .5em;
    color: rgba(43,255,128,.14); white-space: nowrap; }

  .shead { position: relative; display: flex; justify-content: space-between; align-items: center; z-index: 2; }
  .kick { font-family: 'Arial Black', Arial, sans-serif; text-transform: uppercase; letter-spacing: .22em;
    font-size: 12px; padding: 5px 12px; border: 1px solid; border-radius: 6px; background: rgba(1,10,5,.6); }
  .pg { font-size: 12px; letter-spacing: .2em; color: ${C.phosdim}; }
  .body { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .sfoot { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center;
    font-size: 10.5px; letter-spacing: .06em; color: ${C.phosdim}; border-top: 1px solid ${C.phosdeep}; padding-top: 8px; }
  .sfoot .nfa { color: ${C.amber}; letter-spacing: .14em; font-family: 'Arial Black', Arial, sans-serif; font-size: 9.5px; }

  h2 { font-family: 'Arial Black', Arial, sans-serif; color: #eafff2; font-size: 27px; line-height: 1.14;
    margin: 0 0 18px; letter-spacing: -.01em; text-shadow: 0 0 18px rgba(43,255,128,.25); }
  .cols { display: grid; grid-template-columns: 1.15fr .85fr; gap: 26px; align-items: start; }
  ul.bullets { margin: 0; padding: 0; list-style: none; }
  ul.bullets.wide li { max-width: none; }
  ul.bullets li { position: relative; padding: 0 0 0 22px; margin: 0 0 12px; font-size: 14.5px; line-height: 1.5; }
  ul.bullets li::before { content: '▹'; position: absolute; left: 0; color: ${C.phos}; }
  ul.risk li::before { content: '⚠'; color: ${C.red}; }

  .callout { border: 1px solid ${C.phosdim}; border-left: 4px solid ${C.cyan}; border-radius: 10px;
    background: rgba(4,20,11,.8); padding: 16px 18px; }
  .callout.amber { border-left-color: ${C.amber}; } .callout.red { border-left-color: ${C.red}; }
  .co-h { font-family: 'Arial Black', Arial, sans-serif; text-transform: uppercase; letter-spacing: .1em;
    font-size: 13px; color: #eafff2; margin-bottom: 7px; }
  .callout p { margin: 0; font-size: 13.5px; line-height: 1.5; color: ${C.text}; }
  .fine { position: relative; z-index: 2; margin: 16px 0 0; font-size: 11.5px; color: ${C.phosdim}; line-height: 1.45; }

  .statwrap { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .stat { border: 1px solid ${C.phosdim}; border-radius: 10px; background: rgba(1,10,5,.7); padding: 12px 14px; }
  .stat b { display: block; font-family: 'Arial Black', Arial, sans-serif; font-size: 30px; color: ${C.phos};
    line-height: 1; text-shadow: 0 0 16px rgba(43,255,128,.4); }
  .stat span { font-size: 11px; color: ${C.text}; letter-spacing: .04em; }

  .moneymap { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
  .mm { border: 1px solid ${C.phosdim}; border-radius: 12px; background: rgba(1,10,5,.7); padding: 14px 16px; }
  .mm-h { font-family: 'Arial Black', Arial, sans-serif; text-transform: uppercase; letter-spacing: .08em;
    font-size: 13px; margin-bottom: 10px; }
  .mm.burn { border-color: #7c2a20; } .mm.burn .mm-h { color: ${C.red}; }
  .mm.creator { border-color: #7c1668; } .mm.creator .mm-h { color: ${C.acid}; }
  .mm.house { border-color: #0f5c33; } .mm.house .mm-h { color: ${C.phos}; }
  .mm ul { margin: 0; padding-left: 16px; } .mm li { font-size: 12.5px; line-height: 1.5; margin-bottom: 5px; }

  table.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.tbl th, table.tbl td { border: 1px solid ${C.phosdim}; padding: 8px 10px; text-align: left; }
  table.tbl th { background: rgba(43,255,128,.1); color: #eafff2; font-family: 'Arial Black', Arial, sans-serif;
    text-transform: uppercase; letter-spacing: .06em; font-size: 11px; }
  table.tbl td b, table.tbl td { color: ${C.text}; }

  .seasonrow { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 22px; }
  .sea { border: 1px solid ${C.phosdim}; border-radius: 12px; background: rgba(1,10,5,.7); padding: 16px; text-align: center; }
  .sea.live { border-color: ${C.phos}; box-shadow: 0 0 26px rgba(43,255,128,.25); background: rgba(43,255,128,.06); }
  .sea em { display: block; font-style: normal; font-size: 11px; letter-spacing: .2em; color: ${C.phosdim}; text-transform: uppercase; }
  .sea b { display: block; font-family: 'Arial Black', Arial, sans-serif; font-size: 24px; color: #eafff2; margin: 6px 0 4px; }
  .sea.live b { color: ${C.phos}; }
  .sea span { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: ${C.amber}; }
  .sea:not(.live) span { color: ${C.phosdim}; }

  .legal p { font-size: 13px; line-height: 1.55; margin: 0 0 12px; color: ${C.text}; }
  .legal .sig { font-family: 'Arial Black', Arial, sans-serif; font-size: 12.5px; color: #eafff2; letter-spacing: .04em; margin-top: 4px; }

  /* cover */
  .cover { padding: 0; justify-content: flex-end; }
  .cover .hero { position: absolute; top: 0; right: 0; width: 62%; height: 100%; object-fit: cover;
    object-position: center; opacity: .9;
    mask-image: linear-gradient(90deg, transparent, #000 42%); -webkit-mask-image: linear-gradient(90deg, transparent, #000 42%); }
  .cover-glow { position: absolute; inset: 0;
    background: radial-gradient(70% 90% at 20% 60%, rgba(2,8,4,.2), ${C.void} 70%); }
  .cover-mid { position: relative; z-index: 3; padding: 0 0.9in 1.5in; max-width: 8.2in; }
  .eyebrow { font-family: 'Arial Black', Arial, sans-serif; letter-spacing: .28em; font-size: 13px;
    color: ${C.phos}; text-transform: uppercase; margin-bottom: 14px; }
  h1.big { font-family: 'Arial Black', Arial, sans-serif; font-size: 74px; line-height: .95; margin: 0 0 16px;
    color: #eafff2; letter-spacing: -.02em; text-shadow: 0 0 30px rgba(43,255,128,.4), 0 4px 0 ${C.ink}; }
  .tokline { font-size: 16px; color: ${C.text}; margin-bottom: 10px; }
  .byline { font-size: 14px; color: ${C.phos}; letter-spacing: .02em; }
  .cover-foot { position: absolute; bottom: 0; left: 0; right: 0; padding: 14px 0.9in; z-index: 3;
    border-top: 1px solid ${C.phosdeep}; background: rgba(1,10,5,.6); }
</style></head>
<body>${[S[0], ...S.slice(1)].join('\n')}</body></html>`;

// ── write HTML + render PDF ──
const scratch = process.env.SCRATCH || join(ROOT, '..');
const htmlPath = join(ROOT, 'scripts', '.whitepaper.build.html');
writeFileSync(htmlPath, html);

const PW = process.env.PLAYWRIGHT_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js';
const pw = await import(PW);
const chromium = (pw.default || pw).chromium;
const browser = await chromium.launch({ executablePath: chromiumPath });
const page = await (await browser.newContext()).newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
const outPath = join(ROOT, 'whitepaper.pdf');
await page.pdf({ path: outPath, width: '13.333in', height: '7.5in', printBackground: true,
  pageRanges: '', margin: { top: '0', bottom: '0', left: '0', right: '0' } });
await browser.close();

console.log(`✦ whitepaper → ${outPath} (${TOTAL} slides)`);

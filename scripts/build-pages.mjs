#!/usr/bin/env node
// Build the on-site transparency pages — whitepaper.html, tokenomics.html, audit.html,
// artist.html — in the UR3030 acid-terminal style, from one shared shell. Reproducible:
//
//   node scripts/build-pages.mjs
//
// Numbers mirror docs/ECONOMIC-FLOW.md + docs/TOKEN-MATH.md (reproduced by
// scripts/token-model.mjs). Model v2.2: 100-card deck, every card a LENS (render keyed by
// id), 33 minted hero 1/1s (11 gacha + 22 earned) + 67 render-only field cards + Lovebeing
// holder lens; packs burn the token (mint-once, 3× contraction); cards do NOT retire/ash.
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
<title>${title} · upperdeckripmaster3030</title>
<meta name="description" content="${subtitle}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="canonical" href="https://upperdeckripmaster3030.com/${slug}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="upperdeckripmaster3030">
<meta property="og:title" content="${title} · upperdeckripmaster3030">
<meta property="og:description" content="${subtitle}">
<meta property="og:url" content="https://upperdeckripmaster3030.com/${slug}">
<meta property="og:image" content="https://upperdeckripmaster3030.com/marquee-header.webp">
<meta name="twitter:card" content="summary_large_image">
<style>
  :root{
    --void:#020804; --panel:#04140b; --ink:#01130a;
    --phos:#2bff80; --phosdim:#0f5c33; --phosdeep:#0a3d22;
    --acid:#ff2ad9; --cyan:#27f7e4; --amber:#ffd23b; --red:#ff4b3a; --text:#b8ffd6;
    --mono:'Courier New',ui-monospace,monospace; --fat:'Arial Black','Arial Bold',Arial,sans-serif;
    --accent:${accent};
  }
  *{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; background:var(--void); }
  body{ font-family:var(--mono); color:var(--text); line-height:1.6;
    background:
      radial-gradient(120% 60% at 85% -5%, rgba(43,255,128,.10), transparent 55%),
      radial-gradient(90% 60% at 0% 100%, rgba(255,42,217,.07), transparent 55%),
      var(--void);
    background-attachment:fixed; }
  body::before{ content:""; position:fixed; inset:0; pointer-events:none; z-index:1; opacity:.3;
    background:repeating-linear-gradient(180deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.25) 2px 3px); }
  .wrap{ position:relative; z-index:2; max-width:960px; margin:0 auto; padding:0 20px 80px; }
  a{ color:var(--cyan); }
  code{ font-family:var(--mono); color:var(--cyan); background:rgba(39,247,228,.08);
    border:1px solid rgba(39,247,228,.22); border-radius:4px; padding:0 5px; font-size:.92em; }
  b,strong{ color:#d9ffe8; }

  /* top bar */
  .topbar{ position:sticky; top:0; z-index:10; display:flex; flex-wrap:wrap; gap:10px 18px; align-items:center;
    justify-content:space-between; padding:12px 20px; border-bottom:1px solid var(--phosdeep);
    background:rgba(1,10,5,.86); backdrop-filter:blur(6px); }
  .brand{ font-family:var(--fat); text-transform:uppercase; letter-spacing:.14em; font-size:12px;
    color:var(--phos); text-decoration:none; }
  .topnav{ display:flex; gap:6px; flex-wrap:wrap; }
  .topnav a{ text-decoration:none; font-family:var(--fat); text-transform:uppercase; letter-spacing:.08em;
    font-size:11px; color:var(--text); padding:6px 10px; border:1px solid var(--phosdim); border-radius:7px; }
  .topnav a.on{ color:var(--void); background:var(--accent); border-color:var(--ink); }
  .nfa-badge{ font-family:var(--fat); font-size:10px; letter-spacing:.14em; color:var(--amber);
    border:1px solid #6b5a12; border-radius:6px; padding:5px 9px; background:rgba(255,210,59,.06); }

  /* hero */
  header.hero{ padding:46px 0 26px; border-bottom:1px solid var(--phosdeep); margin-bottom:26px; }
  .hero .kick{ font-family:var(--fat); text-transform:uppercase; letter-spacing:.24em; font-size:12px;
    color:var(--accent); margin-bottom:12px; }
  .hero h1{ font-family:var(--fat); font-size:clamp(30px,6vw,52px); line-height:1; margin:0 0 12px;
    color:#eafff2; letter-spacing:-.02em; text-shadow:0 0 26px rgba(43,255,128,.3); }
  .hero p.sub{ font-size:15px; color:var(--text); margin:0; max-width:62ch; }
  .hero .cta{ margin-top:18px; display:flex; gap:10px; flex-wrap:wrap; }
  .btn{ display:inline-block; text-decoration:none; font-family:var(--fat); text-transform:uppercase;
    letter-spacing:.06em; font-size:12px; color:var(--void); padding:11px 16px; border:2px solid var(--ink);
    border-radius:9px; background:linear-gradient(180deg,#8bffbb,var(--phos) 55%,#0fae56);
    box-shadow:inset 0 3px 0 rgba(255,255,255,.4), 0 5px 0 var(--ink), 0 0 18px rgba(43,255,128,.3); }
  .btn.cy{ background:linear-gradient(180deg,#6ff3ff,var(--cyan) 60%,#0fb9ab); }

  h2{ font-family:var(--fat); font-size:22px; color:#eafff2; margin:38px 0 12px; letter-spacing:-.01em;
    padding-bottom:6px; border-bottom:1px solid var(--phosdeep); }
  h2 .n{ color:var(--accent); margin-right:8px; }
  h3{ font-family:var(--fat); font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:var(--phos);
    margin:22px 0 6px; }
  p{ font-size:14.5px; }
  ul{ padding-left:20px; } li{ font-size:14.5px; margin-bottom:7px; }

  .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width:640px){ .grid2{ grid-template-columns:1fr; } .cols3{ grid-template-columns:1fr!important; } }
  .stat{ border:1px solid var(--phosdim); border-radius:10px; background:rgba(1,10,5,.6); padding:13px 15px; }
  .stat b{ display:block; font-family:var(--fat); font-size:26px; color:var(--phos); line-height:1;
    text-shadow:0 0 14px rgba(43,255,128,.35); }
  .stat span{ font-size:11.5px; color:var(--text); }
  .statgrid{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  @media (max-width:640px){ .statgrid{ grid-template-columns:1fr 1fr; } }

  .card{ border:1px solid var(--phosdim); border-radius:12px; background:rgba(1,10,5,.55); padding:16px 18px; }
  .card.burn{ border-color:#7c2a20; } .card.creator{ border-color:#7c1668; } .card.house{ border-color:#0f5c33; }
  .cols3{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  .co-h{ font-family:var(--fat); text-transform:uppercase; letter-spacing:.08em; font-size:13px; margin-bottom:8px; }
  .burn .co-h{ color:var(--red); } .creator .co-h{ color:var(--acid); } .house .co-h{ color:var(--phos); }

  .callout{ border:1px solid var(--phosdim); border-left:4px solid var(--accent); border-radius:10px;
    background:rgba(4,20,11,.7); padding:14px 16px; margin:16px 0; }
  .callout.amber{ border-left-color:var(--amber); } .callout.red{ border-left-color:var(--red); }
  .callout.cy{ border-left-color:var(--cyan); }
  .callout .co-h{ color:#eafff2; }

  table{ width:100%; border-collapse:collapse; font-size:13px; margin:10px 0; display:block; overflow-x:auto; }
  th,td{ border:1px solid var(--phosdim); padding:8px 10px; text-align:left; white-space:nowrap; }
  th{ background:rgba(43,255,128,.09); color:#eafff2; font-family:var(--fat); text-transform:uppercase;
    letter-spacing:.05em; font-size:11px; }
  .fire{ color:var(--red); } .to-c{ color:var(--acid); } .to-h{ color:var(--phos); }

  .fine{ font-size:12px; color:var(--phosdim); }
  .ribbon{ margin-top:30px; border:1px dashed var(--amber); border-radius:10px; padding:12px 16px;
    background:rgba(255,210,59,.05); font-size:12.5px; color:#ffe9a8; }
  .ribbon b{ color:var(--amber); }

  footer.foot{ margin-top:46px; border-top:1px solid var(--phosdeep); padding-top:16px; font-size:12px;
    color:var(--phosdim); display:flex; flex-wrap:wrap; gap:6px 14px; justify-content:space-between; }
  .wm{ position:fixed; right:-40px; top:40%; transform:rotate(90deg); transform-origin:right center; z-index:0;
    font-family:var(--fat); font-size:13px; letter-spacing:.5em; color:rgba(43,255,128,.10); white-space:nowrap; }
</style>
<script src="/gate.js"></script>
<script src="/banner.js" defer></script></head>
<body>
  <div class="wm">UPPERDECK · RIPMASTER · 3030</div>
  <div class="topbar">
    <a class="brand" href="index.html">◂ Ripmaster 3030</a>
    <nav class="topnav">
      ${NAV.map(n => `<a href="${n.slug}"${n.slug === slug ? ' class="on"' : ''}>${n.label}</a>`).join('\n      ')}
    </nav>
    <span class="nfa-badge">$UR3030 · NFA</span>
  </div>
  <div class="wrap">
    <header class="hero">
      <div class="kick">${kicker}</div>
      <h1>${title}</h1>
      <p class="sub">${subtitle}</p>
    </header>
    ${body}
    <div class="ribbon"><b>NFA · all memes are memes.</b> $UR3030 is an experimental, volatile
      collectible <b>game token</b> — not an investment, not a security, no promise of value, and it can go
      to zero. The cards are art, parody, and commentary. Nothing here is financial, legal, or tax advice.
      Do your own research. Full terms on the <a href="whitepaper.html#legal">whitepaper</a>.</div>
    <footer class="foot">
      <span>$UR3030 · a game token, not an investment</span>
      <span><a href="index.html">home</a> · <a href="whitepaper.pdf" target="_blank" rel="noopener">whitepaper pdf</a> · <a href="https://superrare.com" target="_blank" rel="noopener">superrare</a></span>
      <span>upperdeckripmaster3030.com</span>
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
  <p>upperdeckripmaster3030 is a <b>liquid trading-card game</b> that is, on-chain, one primitive:
  a SuperRare <b>Liquid Edition</b> — a single <b>ERC-20</b> token (<b>$UR3030</b>) priced by a bonding
  curve in <b>RARE</b> on Uniswap-v4. The <b>100-card deck</b> is the <b>artwork</b>, and <b>every card is a
  LENS</b> — a render that reads the live market + burn. <b>33 hero cards</b> mint as <b>1/1 lenses</b>
  (11 pulled from packs, 22 earned in the games); the other <b>67 field cards</b> are <b>render-only lenses</b>
  (live on-chain, <b>unminted</b>) that you collect and can mint later. Packs <b>burn</b> the token — supply
  <b>contracts ≈3×</b> over the deck's life (3.03M → ~1.01M) — but <b>the cards survive</b>. <i>The token burns
  so the art can live.</i> No treasury, no team pre-mint, no fee wallet.</p>

  <h3>The stack — one edition, one lens contract</h3>
  <div class="cols3">
    <div class="card house"><div class="co-h">$UR3030 · ERC-20</div>
      <p style="font-size:13px;margin:0">The <b>edition</b>. One token on a Uniswap-v4 + Doppler
      multicurve, reserve in RARE — chartable like any ERC-20. Buy it, sell it, <b>burn</b> it.
      <b>Minted once</b>; burns are <b>permanent</b>. In SuperRare's words: <i>"the token is not separate
      from the art."</i></p></div>
    <div class="card creator"><div class="co-h">The render — every card is a lens</div>
      <p style="font-size:13px;margin:0">A <b>lens</b> is a render <b>keyed by card id</b> in one
      renderer+721 contract, reading price, supply, and <b>burn</b> live. A card is a live lens <b>before</b>
      any token exists for it — so field cards are lenses today, unminted.</p></div>
    <div class="card burn"><div class="co-h">Lenses · ERC-721</div>
      <p style="font-size:13px;margin:0">The <b>owned</b> layer. <b>33 hero 1/1s</b> minted now, plus
      <b>Lovebeing</b>, the holder lens every $UR3030 wallet carries. The 67 field cards mint <b>later</b>,
      against the same render — so they stay lenses, never turning to static art.</p></div>
  </div>
  <p class="fine"><b>No ERC-1155, no per-copy editions, no flood of mints.</b> The on-chain footprint is
  deliberately tiny — 33 hero 1/1s now — while all 100 cards are live lenses. Your field-card collection is
  a site-layer collectible (chain-readable) until you choose to mint it.</p>

  <div class="callout cy"><div class="co-h">This is transparency, not a pitch.</div>
    <p>$UR3030 is a collectible game token, not an investment. It can go to zero. The cards are art,
    parody, and memes. Play for the fun of it — see <a href="#legal">Legal &amp; NFA</a>.</p></div>

  <h2><span class="n">02</span>The game</h2>
  <ul>
    <li><b>The field</b> — 100 cards, all live lenses, five tiers (Common → Prizm). <b>Rarity is set by
      community vote</b> (the Rarity Court), not decreed.</li>
    <li><b>Rip &amp; collect</b> — a pack is a guided <b>buy of ~350 $UR3030, burned in full</b>; you pull
      <b>field cards</b> and, rarely, a <b>gacha lens claim</b>. Your collection = your rip history + holdings.</li>
    <li><b>The 33 hero lenses</b> — a <b>Season-1 genesis set</b> that persists all four seasons — <b>11 gacha</b>
      (pull the claim from a pack → mint the 1/1) + <b>22 earned</b> (win a one-of-a-kind game title → mint). One owner each.</li>
    <li><b>Play &amp; wager</b> — the games ante $UR3030 (<b>wagers</b> that transfer to the winner, net-zero to
      supply) and let you stake your cards. Your staked cards arm real in-game power.</li>
    <li><b>The burn-down</b> — packs deflate the token ≈3×; <b>nothing retires</b>. Scarcity comes from
      dwindling pack allotments, rarity votes, and <b>compression</b> (corner a field card's copies → 1/1).</li>
  </ul>

  <h2><span class="n">03</span>The token · $UR3030</h2>
  <div class="statgrid">
    <div class="stat"><b>3.03M</b><span>hard cap (mint-once)</span></div>
    <div class="stat"><b>~$0.02</b><span>opening / token</span></div>
    <div class="stat"><b>RARE</b><span>reserve currency</span></div>
    <div class="stat"><b>~$606k</b><span>full-curve FDV</span></div>
  </div>
  <p style="margin-top:14px">The token is a <b>cheap micro-token</b> on a <b>Uniswap-v4 pool</b> with liquidity placed as a
  <b>Doppler multicurve</b>. Supply is capped at <b>3,030,000</b> and <b>minted once</b> into the pool at
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
  you through <b>buying ~350 $UR3030 ≈ $7</b> and <b>burning it in full</b>. It is <b>not</b> a token reprice —
  FDV is unchanged — and every rip is a real buy-and-burn, the engine of steady pressure, not a pump. The
  schedule (site-enforced, auditable from the burn txs) escalates <b>within</b> a season (base→ceil as
  the allotment sells) and <b>across</b> seasons (the allotment dwindles and the floor rises). The pack count
  is bounded by the <b>burn budget, not card supply</b>.</p>
  <table><tr><th>Season</th><th>Pack allotment</th><th>Base ≈ $*</th></tr>
    <tr><td>I · Summer</td><td>1,600 packs</td><td>$7.00</td></tr>
    <tr><td>II · Fall</td><td>1,100 packs</td><td>$9.00</td></tr>
    <tr><td>III · Winter</td><td>600 packs</td><td>$12.00</td></tr>
    <tr><td>IV · Spring</td><td>260 packs</td><td>$16.00</td></tr></table>
  <p class="fine">*Floor at the launch spot ($0.02); token appreciation rides on top. ≈3,560 packs total. See <a href="tokenomics.html">Tokenomics</a>.</p>

  <h2><span class="n">06</span>Lenses, minting &amp; the Compression rite</h2>
  <p>Every card is a lens — a render keyed by id — so the deck exists as art from day one. What changes over
  time is <b>who owns a token</b>:</p>
  <div class="cols3">
    <div class="card house"><div class="co-h">33 hero lenses · minted now</div>
      <p style="font-size:13px;margin:0"><b>11 gacha</b> (pull a claim from a pack → mint) + <b>22 earned</b>
      (win a game title → signed voucher → mint). Real <b>1/1 ERC-721</b> tokens, wallet-signed. One owner each.</p></div>
    <div class="card creator"><div class="co-h">67 field lenses · render-only</div>
      <p style="font-size:13px;margin:0"><b>Live on-chain, unminted</b> (readable via the CLI). Collect their
      copies from packs; <b>compress</b> (own every copy) into a <b>1/1</b>. Mint them for real <b>later</b>,
      against the same render — they stay lenses, never static art.</p></div>
    <div class="card burn"><div class="co-h">Lovebeing · the holder lens</div>
      <p style="font-size:13px;margin:0">The 1/1 marquee, <b>distributed to every $UR3030 holder</b> — one per
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
  <p><b>Not financial advice.</b> Nothing here or on upperdeckripmaster3030.com is financial, investment, legal,
  or tax advice, nor an offer or solicitation to buy or sell any asset. <b>$UR3030</b> is an experimental,
  volatile utility/collectible <b>game token</b> intended for play and collecting — <b>not an investment
  contract</b> and <b>not a security</b>. There is <b>no promise, guarantee, or expectation of profit, value,
  liquidity, or future development</b>. You may lose everything you put in.</p>
  <p><b>All memes are memes.</b> The cards, characters, names, and imagery are works of <b>art, parody, satire,
  and commentary</b> — transformative by intent. Any resemblance to real people, brands, or trademarks is used
  as cultural reference and critique, not endorsement or affiliation. The project will review and, where
  appropriate, retire content in response to good-faith legal requests.</p>
  <p><b>Do your own research.</b> Crypto assets and smart contracts carry risk, including total loss and bugs.
  Interact at your own risk, comply with the laws of your jurisdiction, and consult your own qualified
  professionals. By acquiring or using $UR3030 you accept these risks and that the artist, contributors, and
  SuperRare make <b>no warranties</b> of any kind.</p>
  <p class="fine">— Gianni Arone (lovebeing · @_lovebeing_) · SuperRare Liquid Editions, Cohort 1 · $UR3030</p>`;

// ─────────────────────────── TOKENOMICS ───────────────────────────
const tokenomics = `
  <div class="cta" style="margin:-8px 0 4px"><a class="btn cy" href="whitepaper.html">📄 Whitepaper</a>
    <a class="btn cy" href="audit.html">🛡 Audit notes</a></div>

  <h2><span class="n">01</span>At a glance</h2>
  <div class="statgrid">
    <div class="stat"><b>3.03M</b><span>supply cap (mint-once)</span></div>
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
  <p>Each season opens a fixed <b>allotment</b> of packs; within a season the price walks a line from base → ceil
  as it sells, then <b>packs close</b> for the season (secondary market only). The allotment shrinks and the floor
  rises each season. Allotments are sized so a full four-season sellout burns the whole ⅔-cap budget (§7) and no
  more. The schedule is <b>site-enforced</b> (packs are guided buy+burns of the one token — there is no pack
  contract) and fully auditable from the burn txs.</p>
  <table><tr><th>Season</th><th>Pack allotment</th><th>base → ceil (tok)</th><th>base ≈ $*</th><th>ceil ≈ $*</th><th>season 🔥 (tok)</th></tr>
    <tr><td>I · Summer</td><td>1,600 packs</td><td>350 → 525</td><td>$7.00</td><td>$10.50</td><td>700,000</td></tr>
    <tr><td>II · Fall</td><td>1,100 packs</td><td>450 → 675</td><td>$9.00</td><td>$13.50</td><td>618,750</td></tr>
    <tr><td>III · Winter</td><td>600 packs</td><td>600 → 900</td><td>$12.00</td><td>$18.00</td><td>450,000</td></tr>
    <tr><td>IV · Spring</td><td>260 packs</td><td>800 → 1,200</td><td>$16.00</td><td>$24.00</td><td>260,000</td></tr></table>
  <p class="fine">*Floor priced at the launch spot ($0.02); token appreciation rides on top. ≈3,560 packs total;
  full sellout ≈ 2,028,750 🔥 (⅔ of cap). Curator-set at <code>openSeason()</code>, recalibrated to the live token price.</p>

  <h2><span class="n">07</span>The burn schedule (everything burns in full)</h2>
  <p>The only on-chain spend is the <span class="fire">🔥 burn</span> of the one token. There are no tolls, no
  creator-cut contract, no house pool — nothing to route, nothing to skim. Hero-lens <b>mints</b> are wallet-signed
  721 mints, not token payouts.</p>
  <table><tr><th>Action</th><th>Cost</th><th>→</th></tr>
    <tr><td>rip a pack (field cards + rare gacha claim)</td><td>~350 → escalates (§6)</td><td class="fire">🔥 in full</td></tr>
    <tr><td>conviction burn (voluntary)</td><td>any amount</td><td class="fire">🔥</td></tr>
    <tr><td><b>compression</b> (own every copy of a field card → 1/1)</td><td>compression cost</td><td class="fire">🔥</td></tr>
    <tr><td>rarity votes · wagers · trades · binder · field-card pulls</td><td>site-side signal</td><td>no burn</td></tr></table>

  <h2><span class="n">08</span>Lifetime burn &amp; the 3× contraction</h2>
  <p>Because the token is <b>minted once</b> and burns are <b>permanent</b>, lifetime burn is <b>bounded by the
  cap</b>. Packs burn the token down over the deck's four-season life toward a permanent floor. <b>Cards do not
  retire or ash</b> — this is token deflation only.</p>
  <table><tr><th>metric</th><th>value</th><th>note</th></tr>
    <tr><td>Full four-season sellout 🔥</td><td><b>2,028,750</b></td><td>≈ ⅔ of the 3,030,000 cap</td></tr>
    <tr><td>Settled live float</td><td><b>~1,010,000</b></td><td>survives as the permanent float</td></tr>
    <tr><td>Permanent contraction</td><td><b>≈ 3×</b></td><td>3.03M → ~1.01M</td></tr>
    <tr><td>Invariant (mint-once)</td><td>Σ 🔥 ≤ cap ✓</td><td>2.03M &lt; 3.03M</td></tr></table>
  <p class="fine">A partial life (fewer rips) simply settles the token at a higher float. The deck reaches its
  fully-deflated float only if the community truly burns across the seasons. No burn ever re-mints.</p>
  <div class="callout"><p style="margin:0">Net supply change = <b>buys − burns</b> (sign indeterminate in the short
    run). Over the deck's life the <b>burns dominate</b>: ⅔ of the mint is retired permanently. Read the real
    trajectory from <code>totalSupply()</code> — burn progress is <code>maxTotalSupply − totalSupply</code>.</p></div>

  <h2><span class="n">09</span>Before mainnet — what we verify</h2>
  <ul>
    <li><b>Mint/burn semantics — settled.</b> Per SuperRare's audit, the edition is <b>minted once</b> and burns
      are <b>permanent</b> (no re-mint). The whole model is built on that.</li>
    <li><b>Effective M</b> — back the real end/start multiple out of the preset's curves via <code>--preview</code>. Pick the steadiest slope.</li>
    <li><b>Sell-fraction</b> — is the whole cap sold on the curve, or is some reserved? FDV / RARE-to-fill / slippage scale with it.</li>
    <li><b>Opening price</b> — calibrate the multicurve to open at ~1 RARE/token on the 3.03M supply (see <a href="audit.html">Audit</a>).</li>
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
      against a 3.03M mint-once cap — impossible. <b>Fixed by removing the mechanic:</b> v2.2 cut forced card
      retirement / ash entirely. The burn is now pure <b>token deflation</b> (⅔ of the cap, ~2.02M), and the
      deck <b>survives</b>. The only rule left is the trivial Σ burns ≤ cap.</li>
    <li><b>Mint/burn assumption, corrected.</b> We'd assumed burns re-mint on the next buy. SuperRare confirmed
      the opposite — <b>minted once, burns permanent</b>. The whole model was rebuilt on that (3× contraction).</li>
    <li><b>The lens standard.</b> We'd sketched a custom ERC-1155. The cohort docs are clear: lenses are
      <b>ERC-721</b>. <b>Fixed:</b> every card is a render-by-id lens on one renderer+721 contract — 33 minted,
      67 render-only, Lovebeing a holder lens — a tiny mint footprint, no 1155.</li>
    <li><b>Renderer display bugs.</b> The render read 100% "circulating" and 0 per-RARE; <b>fixed</b> to read
      BURNED % (<code>max − total</code>) and a 2-dp per-RARE value in <code>contracts/UR3030RenderPrototype.sol</code>
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
    <li><b>Curve calibration</b> — open at ~1 RARE/token on the 3.03M supply (with SuperRare).</li>
    <li><b>Lens setup with SuperRare</b> — does the assisted 721 setup support render-by-id across 100 card-lenses
      (33 minted, 67 render-only), or do we deploy our own combined renderer+721 lens contract via the CLI?</li>
    <li><b>Mint mechanism</b> — a claim/voucher redeemer for the 11 gacha lenses (pack burn) and the 22 earned
      lenses (signed game vouchers).</li>
    <li><b>Full Sepolia dress rehearsal</b> — deploy, wire the render, run a mock season: rips (buy+burn), a
      hero-lens mint, and watch the burn meter climb in the render.</li>
  </ul>

  <h2><span class="n">05</span>Verify us yourself</h2>
  <ul>
    <li><b>Run the model</b> — <code>node scripts/token-model.mjs</code> reproduces every number on the <a href="tokenomics.html">Tokenomics</a> page.</li>
    <li><b>Watch the chain</b> — packs and conviction are burn txs on the one token; hero-lens mints are wallet-signed; <code>getMarketState()</code> is live.</li>
    <li><b>Read the design</b> — <code>docs/ECONOMIC-FLOW.md</code> (canonical) + <code>docs/AUDIT-REPLY.md</code> (the SuperRare reply).</li>
    <li><b>Read the render fix</b> — <code>contracts/UR3030RenderPrototype.sol</code> (BURNED %, per-RARE).</li>
  </ul>
  <div class="callout amber"><div class="co-h">The honest bottom line.</div>
    <p>We've been transparent about what we checked and what we didn't. Self-review and a clean compile are
    <b>not</b> a substitute for a professional audit. Treat $UR3030 as experimental software that can lose your
    money. NFA — see the <a href="whitepaper.html#legal">whitepaper</a>.</p></div>`;

// ─────────────────────────── ARTIST ───────────────────────────
const artist = `
  <div class="cta" style="margin:-8px 0 4px"><a class="btn" href="https://x.com/_lovebeing_" target="_blank" rel="noopener">𝕏 @_lovebeing_</a>
    <a class="btn cy" href="cards/lovebeing.html">✦ View the 1/1</a></div>

  <h2><span class="n">01</span>Who</h2>
  <p><b>Gianni Arone</b> works as <b>lovebeing</b> — a multidisciplinary artist out of <b>New York</b>
  whose catalog runs from 1982 to now, moving between <b>painting, silkscreen, zines, digital work,
  motion, sound, and code</b>. upperdeckripmaster3030 is what happens when all of that gets pointed
  at a single lifelong obsession: <b>the trading card</b>.</p>

  <h2><span class="n">02</span>Why liquid — in his words</h2>
  <div class="callout"><p style="margin:0 0 10px">I'm a multidisciplinary artist working as lovebeing, out of New York.
  For years I've moved between painting, silkscreen, zines, motion, sound, and code, all of it chasing the same
  feeling I've had since I was a kid. I grew up on <b>trading cards, pogs, MAD magazine, and the backs of cereal
  boxes — the first memes</b>, if you'll let me call them that. That's where I learned a picture could be a joke,
  a trophy, and a currency all at once: something you'd trade at recess and still guard with your life.</p>
  <p style="margin:0">Static NFTs never caught that. Liquid Editions are the first format where the card is
  <b>alive</b> — priced by a curve, played by a crowd, a living lens over the market. Ripmaster is that recess
  table rebuilt on-chain: a full field of <b>100 living lenses</b>, a token that <b>burns down ≈3×</b> while the
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
  <b>holder-bound lens</b>: every $UR3030 holder carries one, one per wallet, and it <b>can't be burned</b> or
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
  unhoused friend from the street. <span style="color:var(--phosdim)">Links are the artist's own — verify before sharing.</span></p>`;

// ─────────────────────────── write ───────────────────────────
const pages = [
  { slug: 'artist.html', title: 'The Artist', kicker: 'Gianni Arone · lovebeing · @_lovebeing_',
    subtitle: 'The multidisciplinary artist behind upperdeckripmaster3030 — and the 1/1 at the top of the deck.',
    accent: 'var(--acid)', body: artist },
  { slug: 'whitepaper.html', title: 'Transparent Whitepaper', kicker: 'upperdeckripmaster3030 · $UR3030 · NFA',
    subtitle: 'What the game is, how the token works, where every $UR3030 goes, and the risks — in the open, for frens.',
    accent: 'var(--phos)', body: whitepaper },
  { slug: 'tokenomics.html', title: 'Tokenomics', kicker: '$UR3030 · supply · burns · pricing · liquidity',
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

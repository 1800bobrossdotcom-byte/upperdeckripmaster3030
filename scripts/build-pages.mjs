#!/usr/bin/env node
// Build the on-site transparency pages — whitepaper.html, tokenomics.html, audit.html —
// in the UR3030 acid-terminal style, from one shared shell. Reproducible:
//
//   node scripts/build-pages.mjs
//
// Numbers mirror docs/TOKEN-MATH.md (reproduced by scripts/token-model.mjs). These are
// site pages served at the repo root; they reference site assets (marquee, PDF) by
// relative URL. Strong NFA / "all memes are memes" throughout.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const NAV = [
  { slug: 'index.html', label: 'Home' },
  { slug: 'whitepaper.html', label: 'Whitepaper' },
  { slug: 'tokenomics.html', label: 'Tokenomics' },
  { slug: 'audit.html', label: 'Audit' },
];

const shell = ({ slug, title, kicker, subtitle, accent, body }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Upperdeck Ripmaster 3030</title>
<meta name="description" content="${subtitle}">
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
</style></head>
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
</body></html>`;

// ─────────────────────────── WHITEPAPER ───────────────────────────
const whitepaper = `
  <div class="cta" style="margin:-8px 0 4px"><a class="btn" href="whitepaper.pdf" target="_blank" rel="noopener">📄 Download the PDF deck</a>
    <a class="btn cy" href="tokenomics.html">📈 Tokenomics</a>
    <a class="btn cy" href="audit.html">🛡 Our audit notes</a></div>

  <h2><span class="n">01</span>TL;DR</h2>
  <p>Upperdeck Ripmaster 3030 is a <b>liquid trading-card game</b>. Every card is a live SuperRare
  Liquid Edition priced by a bonding curve in <b>RARE</b>; <b>$UR3030</b> is the token you rip packs,
  vote, wager, and settle with. A full field of ~196 cards opens each season and the community
  <b>burns it down to a deck of 77</b>. Two clean flows go to people — a creator cut and a house
  bounty — and <b>everything else burns</b>. No treasury, no team pre-mint, no fee wallet.</p>
  <div class="callout cy"><div class="co-h">This is transparency, not a pitch.</div>
    <p>$UR3030 is a collectible game token, not an investment. It can go to zero. The cards are art,
    parody, and memes. Play for the fun of it — see <a href="#legal">Legal &amp; NFA</a>.</p></div>

  <h2><span class="n">02</span>The game</h2>
  <ul>
    <li><b>The field opens</b> — every registered card is in play, each its own liquid edition.</li>
    <li><b>Rip &amp; collect</b> — packs mint ERC-1155 copies across five tiers: Common → Uncommon → Rare → Mythic → Prizm.</li>
    <li><b>The Rarity Court</b> — holders burn to promote, demote, or ⛨ HODL a card. Up pays the creator; down burns.</li>
    <li><b>The cull</b> — downvotes (on a quorum of 9) retire cards; owning a whole edition lets you destroy it forever.</li>
    <li><b>Survivors</b> — the field resolves to a standard <b>deck of 77</b>. Hold one and you hold 1 of 77 that outlived the rest.</li>
  </ul>

  <h2><span class="n">03</span>The token · $UR3030</h2>
  <div class="statgrid">
    <div class="stat"><b>3.03M</b><span>hard cap</span></div>
    <div class="stat"><b>~$0.02</b><span>opening / token</span></div>
    <div class="stat"><b>RARE</b><span>reserve currency</span></div>
    <div class="stat"><b>~$606k</b><span>full-curve FDV</span></div>
  </div>
  <p style="margin-top:14px">The token is a <b>cheap micro-token</b> on a <b>Uniswap-v4 pool</b> with liquidity placed as a
  <b>Doppler multicurve</b>. Supply is capped at <b>3,030,000</b> and minted on <i>buy</i> — the cap is a
  live-supply ceiling, not a lifetime budget. Opening price ≈ 1 RARE/token keeps every toll and vote a
  micro-move. Full-curve FDV ≈ $606k is an <b>artist-scale niche edition, by choice</b>.</p>

  <h2><span class="n">04</span>The economy · where every token goes</h2>
  <p>Nearly every move burns. Two flows go to people — visible on-chain, never to a wallet we control.</p>
  <div class="cols3">
    <div class="card burn"><div class="co-h">🔥 Burn</div>
      <ul><li>send 1 · trade 1/side · wager 2/side · marquee 25</li><li>downvotes</li>
      <li>most of every pack (~349 of ~350)</li><li>destroyed editions + toll</li></ul></div>
    <div class="card creator"><div class="co-h">🎨 Creator</div>
      <ul><li>upvotes / promotions</li><li>HODL ⛨ votes</li><li>a royalty stream — <code>CreatorPaid</code></li></ul></div>
    <div class="card house"><div class="co-h">🏦 House bounty</div>
      <ul><li>1 token / pack seeds it</li><li>pays whoever ends an edition</li><li>a player pool — anyone can <code>fundReward</code></li></ul></div>
  </div>

  <h2><span class="n">05</span>Packs · a $7 premium, escalating</h2>
  <p>A pack is the one <b>premium</b> action: a bundle of <b>~350 $UR3030 ≈ $7</b> (seven cards, ~$1 a card),
  <b>not</b> a token reprice — so FDV is unchanged. Each rip is a real <b>buy-and-burn of hundreds of tokens</b>,
  the engine of steady pressure, not a pump. Price escalates <b>within</b> a season (base→ceil as the allotment
  sells) and <b>across</b> seasons (the field shrinks, so the allotment dwindles and the floor rises).</p>
  <table><tr><th>Season</th><th>Pack allotment</th><th>Base ≈ $*</th></tr>
    <tr><td>I · Summer</td><td>10,000 packs</td><td>$7.00</td></tr>
    <tr><td>II · Fall</td><td>7,500 packs</td><td>$9.00</td></tr>
    <tr><td>III · Winter</td><td>5,000 packs</td><td>$12.00</td></tr>
    <tr><td>IV · Spring</td><td>2,500 packs</td><td>$16.00</td></tr></table>
  <p class="fine">*Floor at the launch spot ($0.02); token appreciation rides on top. See <a href="tokenomics.html">Tokenomics</a>.</p>

  <h2><span class="n">06</span>Seasons</h2>
  <p>Four a year, on the calendar — and we launch in the season we're in: <b>Summer</b> (live), then Fall,
  Winter, Spring. Each season opens a full field and the crowd burns it to 77; the best non-survivors seed
  the next season — a rolling tournament, not a delete. Every retirement mints the last keeper a soulbound
  <b>Ash Trophy</b> + a token bounty. The render reads live market + game state, so the art evolves with price.</p>

  <h2><span class="n">07</span>Steady, not a pump</h2>
  <ul>
    <li><b>Un-pullable liquidity</b> — the RARE reserve lives in the pool, not a yankable LP. Sells walk down the curve.</li>
    <li><b>No team pre-mint</b> — nothing minted at genesis to dump.</li>
    <li><b>Buy-and-burn packs</b> — RARE flows in on every buy, tokens vanish on every burn; fewer tokens on a deeper reserve.</li>
    <li><b>Adding liquidity</b> — seed RARE at deploy, let buys deepen the reserve, and recycle a share of the creator cut / house pool back into RARE reserve.</li>
  </ul>
  <div class="callout amber"><div class="co-h">What this is NOT.</div>
    <p>Not a promise the price goes up. Net supply moves with <b>buys − burns</b> — the sign is not guaranteed.
    Deflationary <i>pressure</i> is a goal, not a floor. Read the real trajectory live from <code>totalSupply()</code>.</p></div>

  <h2><span class="n">08</span>Transparency</h2>
  <ul>
    <li><b>Open economy contract</b> — <code>CardVault.sol</code>: tolls, votes, packs, destruction, bounty.</li>
    <li><b>Reproducible model</b> — <code>scripts/token-model.mjs</code> re-derives every number here.</li>
    <li><b>Legible flows</b> — <code>CreatorPaid</code>, burn, <code>AshTrophy</code>, <code>EditionDestroyed</code> events are the receipts.</li>
    <li><b>Our own audit notes</b> — what we reviewed and what's still pending: see the <a href="audit.html">Audit</a> page.</li>
    <li><b>Testnet first</b> — a full Sepolia dress rehearsal before any mainnet deploy.</li>
  </ul>

  <h2><span class="n">09</span>Risks</h2>
  <ul>
    <li><b>The token can go to zero.</b> Experimental and highly volatile — only spend what you can lose entirely.</li>
    <li><b>Smart-contract risk.</b> Code can have bugs. Assume unaudited unless a published audit says otherwise (<a href="audit.html">Audit</a>).</li>
    <li><b>Liquidity &amp; slippage.</b> A thin market moves price hard; you may not exit at the quoted price.</li>
    <li><b>Design risk.</b> Game economies can behave unexpectedly, even when tuned and modeled.</li>
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
    <div class="stat"><b>3.03M</b><span>supply cap (capped)</span></div>
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
  Add liquidity by seeding RARE at deploy, letting buys deepen the pool, and recycling a share of the creator
  cut / house pool back into RARE reserve.</p>

  <h2 id="packs"><span class="n">06</span>The pack allotment (dwindling + escalating)</h2>
  <p>Pack allotment for a season = <b>cards issued ÷ 7</b> (<code>CARDS_PER_PACK</code>). As the field burns down,
  fewer cards issue, so the allotment shrinks and the floor rises. Within a season, <code>packPrice()</code> walks
  a line from <code>packBase</code> → <code>packCeil</code> as the allotment sells. Sell out → packs close for the
  season (secondary market only).</p>
  <table><tr><th>Season</th><th>Cards issued</th><th>Pack allotment</th><th>base → ceil (tok)</th><th>base ≈ $*</th><th>ceil ≈ $*</th></tr>
    <tr><td>I · Summer</td><td>70,000</td><td>10,000 packs</td><td>350 → 525</td><td>$7.00</td><td>$10.50</td></tr>
    <tr><td>II · Fall</td><td>52,500</td><td>7,500 packs</td><td>450 → 675</td><td>$9.00</td><td>$13.50</td></tr>
    <tr><td>III · Winter</td><td>35,000</td><td>5,000 packs</td><td>600 → 900</td><td>$12.00</td><td>$18.00</td></tr>
    <tr><td>IV · Spring</td><td>17,500</td><td>2,500 packs</td><td>800 → 1,200</td><td>$16.00</td><td>$24.00</td></tr></table>
  <p class="fine">*Floor priced at the launch spot ($0.02); token appreciation rides on top. Curator-set at
  <code>openSeason()</code>, recalibrated to the live token price.</p>

  <h2><span class="n">07</span>The burn / spend schedule</h2>
  <p>"→" = destination: <span class="fire">🔥 burn</span> · <span class="to-c">🎨 creator</span> · <span class="to-h">🏦 house pool</span>. Curator-tunable.</p>
  <table><tr><th>Action</th><th>Toll</th><th>→</th></tr>
    <tr><td>sendCard</td><td>1</td><td class="fire">🔥</td></tr>
    <tr><td>trade</td><td>1 / side</td><td class="fire">🔥</td></tr>
    <tr><td>openMatch / joinMatch</td><td>2 / side</td><td class="fire">🔥</td></tr>
    <tr><td>ripPack (7 cards)</td><td><code>packPrice()</code> — ~350 → escalates</td><td>(all − 1) <span class="fire">🔥</span> + 1 <span class="to-h">🏦</span></td></tr>
    <tr><td>voteRarity up / voteHodl</td><td>amt</td><td class="to-c">🎨</td></tr>
    <tr><td>voteRarity down</td><td>amt</td><td class="fire">🔥</td></tr>
    <tr><td>destroyEdition (retired)</td><td>50 + all copies</td><td class="fire">🔥</td></tr>
    <tr><td>last-standing reward</td><td>50</td><td class="to-h">🏦 → keeper</td></tr>
    <tr><td>marquee transfer</td><td>25</td><td class="fire">🔥</td></tr></table>
  <p class="fine">Rarity-court step costs (one tier): C↔U 50, U↔R 150, R↔M 500, M↔P 2,000 (full climb 2,700).
  Retiring a card off the island also needs a <b>quorum of 9 distinct downvoters</b>.</p>

  <h2><span class="n">08</span>Burn pressure per season</h2>
  <p>Bounded by the S1 allotment (10,000 packs); scenarios are the fraction sold. A rip destroys ~437 tokens
  (~48× the old 9), so packs dominate. Illustrative, not a forecast.</p>
  <table><tr><th>scenario</th><th>packs sold</th><th>pack 🔥</th><th>play 🔥</th><th>cull 🔥</th><th>total 🔥/season</th></tr>
    <tr><td>QUIET (30%)</td><td>3,000</td><td>1,309,500</td><td>18,000</td><td>10,500</td><td><b>1,338,000</b> (0.44× cap)</td></tr>
    <tr><td>STEADY (70%)</td><td>7,000</td><td>3,055,500</td><td>42,000</td><td>26,250</td><td><b>3,123,750</b> (1.03× cap)</td></tr>
    <tr><td>SELLOUT (100%)</td><td>10,000</td><td>4,365,000</td><td>60,000</td><td>41,650</td><td><b>4,466,650</b> (1.47× cap)</td></tr></table>
  <div class="callout"><p style="margin:0">Net supply change = <b>buys − burns</b> (sign indeterminate). A sold-out season
    cycling ~1.4× the cap through burns is the proof that the cap <b>refills</b> — burns pull totalSupply below
    what was bought; the next buy re-mints into the gap. Read the real trajectory from <code>totalSupply()</code>.</p></div>

  <h2><span class="n">09</span>House reward pool</h2>
  <p><code>destroyEdition</code> pays <code>min(pool, 50)</code>; each pack seeds <code>1</code>. The invariant
  <b>lastStandingReward (50) = destroyToll (50)</b> makes culling <b>toll-neutral → non-farmable</b> — and
  destruction requires a <b>court-retired</b>, fully-cornered edition, so you can't manufacture the bounty. The
  model shows the pool solvent by season end in every scenario; the curator can <code>fundReward()</code> at
  season open to pre-fund the early window.</p>

  <h2><span class="n">10</span>Before mainnet — what we verify</h2>
  <ul>
    <li><b>★ Mint/burn semantics</b> — does a burn reopen mint headroom (re-mint on next buy)? The whole "3M is enough" verdict assumes yes.</li>
    <li><b>Effective M</b> — back the real end/start multiple out of the preset's curves via <code>--preview</code>. Pick the steadiest slope.</li>
    <li><b>Sell-fraction</b> — is the whole cap sold on the curve, or is some reserved? FDV / RARE-to-fill / slippage scale with it.</li>
    <li><b>RARE seed floor</b> — read <code>minRareLiquidityWei()</code>; confirm ~10k RARE with the cohort.</li>
    <li><b>Live RARE/USD</b> — the $ columns assume $0.02; re-peg P0 on deploy day.</li>
    <li><b>Chain</b> — micro-tolls are gas-dominated on L1; deploy on an L2 (or batch actions).</li>
  </ul>`;

// ─────────────────────────── AUDIT ───────────────────────────
const audit = `
  <div class="cta" style="margin:-8px 0 4px"><a class="btn cy" href="whitepaper.html">📄 Whitepaper</a>
    <a class="btn cy" href="tokenomics.html">📈 Tokenomics</a></div>

  <div class="callout red"><div class="co-h">Status: self-reviewed, NOT yet third-party audited.</div>
    <p>This page is our <b>own</b> honest accounting of the review we've done and what we haven't. The contracts
    are <b>experimental and unaudited by an independent firm</b>. A formal external audit is <b>pending</b> before
    any mainnet deploy. Interact at your own risk. This is not a security assurance and not financial advice.</p></div>

  <h2><span class="n">01</span>What we reviewed, and how</h2>
  <ul>
    <li><b>Clean compile.</b> <code>CardVault.sol</code> compiles with <b>solc 0.8.24</b> + <b>OpenZeppelin 5.0.2</b>,
      <b>0 warnings</b>; runtime bytecode ~20.3 KB, under the 24.576 KB EIP-170 limit.</li>
    <li><b>Reproducible economics.</b> Every tokenomics number is derived by <code>scripts/token-model.mjs</code> —
      you can run it and re-derive the price schedule, slippage, allotments, burn pressure, and pool solvency yourself.</li>
    <li><b>Adversarial modeling pass.</b> The tokenomics were pressure-tested by an adversarial pass — multiple
      independent models, each checked by a skeptic — to catch hand-wavy claims and hidden assumptions.</li>
    <li><b>Hand-review of the pack economy.</b> The escalating-allotment code (<code>packPrice()</code> bounds,
      the <code>ripPack</code> allotment gate, overflow on the interpolation) was checked by hand and cross-checked
      against the model.</li>
  </ul>

  <h2><span class="n">02</span>Things we found and fixed (in the open)</h2>
  <ul>
    <li><b>destroyEdition could kill a healthy card.</b> An earlier version let anyone who cornered an edition
      burn it to farm the bounty. <b>Fixed:</b> destruction now requires the card be <b>court-retired first</b>
      (a <code>NotRetired</code> guard) <i>and</i> fully cornered — and the reward equals the toll, so it's
      toll-neutral and non-farmable.</li>
    <li><b>A ~100× pricing error in an early doc.</b> A stale peg implied a ~$0.001 pack. <b>Fixed:</b> the peg is
      ~1 RARE/token; the pack is a ~350-token bundle ≈ $7.</li>
    <li><b>Over-claimed "supply only goes down."</b> <b>Fixed:</b> the docs now state plainly that net supply =
      buys − burns (sign indeterminate); deflation is <i>pressure</i>, not a guarantee.</li>
  </ul>

  <h2><span class="n">03</span>Invariants we designed for</h2>
  <div class="grid2">
    <div class="stat"><b>No pre-mint</b><span>supply is minted only on buy — nothing sits at genesis to dump</span></div>
    <div class="stat"><b>Un-pullable reserve</b><span>RARE lives in the v4 pool, not a yankable LP; sells walk the curve</span></div>
    <div class="stat"><b>Non-farmable cull</b><span>reward = destroyToll; needs a retired, fully-cornered edition</span></div>
    <div class="stat"><b>Quorum retire</b><span>9 distinct downvoters — no single-whale can condemn a card</span></div>
    <div class="stat"><b>No fee wallet</b><span>burns are destroyed; creator + house flows are direct, legible transfers</span></div>
    <div class="stat"><b>Pool solvency</b><span>reward pool modeled solvent across quiet → sellout seasons</span></div>
  </div>

  <h2><span class="n">04</span>What is still pending before mainnet</h2>
  <ul>
    <li><b>Independent third-party security audit</b> — not yet performed. Assume the code is unaudited until a
      published report says otherwise.</li>
    <li><b>On-chain parameter verification</b> via <code>--preview</code> / <code>getMarketState</code>: the effective
      demand multiple <b>M</b>, the <b>sell-fraction</b>, and the crucial <b>mint/burn semantics</b> (does a burn
      re-open mint headroom on the next buy?).</li>
    <li><b>Full Sepolia dress rehearsal</b> of the whole loop — approve → rip → play → vote → retire → destroy →
      reward — before any mainnet deploy.</li>
  </ul>

  <h2><span class="n">05</span>Verify us yourself</h2>
  <ul>
    <li><b>Read the contract</b> — <code>contracts/CardVault.sol</code> (tolls, votes, packs, destruction, bounty; curator setters are all visible).</li>
    <li><b>Run the model</b> — <code>node scripts/token-model.mjs</code> reproduces every number on the <a href="tokenomics.html">Tokenomics</a> page.</li>
    <li><b>Watch the events</b> — <code>CreatorPaid</code>, burns, <code>AshTrophy</code>, <code>EditionDestroyed</code> are the on-chain receipts.</li>
  </ul>
  <div class="callout amber"><div class="co-h">The honest bottom line.</div>
    <p>We've been transparent about what we checked and what we didn't. Self-review and a clean compile are
    <b>not</b> a substitute for a professional audit. Treat $UR3030 as experimental software that can lose your
    money. NFA — see the <a href="whitepaper.html#legal">whitepaper</a>.</p></div>`;

// ─────────────────────────── write ───────────────────────────
const pages = [
  { slug: 'whitepaper.html', title: 'Transparent Whitepaper', kicker: 'Upperdeck Ripmaster 3030 · $UR3030 · NFA',
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

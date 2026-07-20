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
  <script src="sfx.js"></script>
</body></html>`;

// ─────────────────────────── WHITEPAPER ───────────────────────────
const whitepaper = `
  <div class="cta" style="margin:-8px 0 4px"><a class="btn" href="whitepaper.pdf" target="_blank" rel="noopener">📄 Download the PDF deck</a>
    <a class="btn cy" href="tokenomics.html">📈 Tokenomics</a>
    <a class="btn cy" href="audit.html">🛡 Our audit notes</a></div>

  <h2><span class="n">01</span>TL;DR</h2>
  <p>upperdeckripmaster3030 is a <b>liquid trading-card game</b> that is, on-chain, exactly
  <b>one thing</b>: a SuperRare <b>Liquid Edition</b> — a single <b>ERC-20</b> token
  (<b>$UR3030</b>) priced by a bonding curve in <b>RARE</b> on Uniswap-v4. The 196-card deck is
  the <b>artwork of that one edition</b>, drawn by a render contract that reads the market live.
  The community <b>burns the field down to a deck of 77</b> by burning the token itself. At season end
  the 77 survivors mint as tradeable <b>collectible lenses</b> (ERC-721), and any card whose whole claim
  set one wallet <b>corners</b> can be <b>compressed into a 1/1</b>. Everything burns; nothing is skimmed. No treasury, no team
  pre-mint, no fee wallet — and no other contract for one to hide in.</p>

  <h3>The stack — one edition, three surfaces</h3>
  <div class="cols3">
    <div class="card house"><div class="co-h">$UR3030 · ERC-20</div>
      <p style="font-size:13px;margin:0">The <b>edition</b>. One token on a Uniswap-v4 + Doppler
      multicurve, reserve in RARE — chartable like any ERC-20. Buy it, sell it, <b>burn</b> it.
      In SuperRare's words: <i>"the token is not separate from the art."</i></p></div>
    <div class="card creator"><div class="co-h">The render</div>
      <p style="font-size:13px;margin:0">The <b>deck</b>. A read-only render contract draws all 196
      cards from live market state — price, supply, balances, and <b>burn progress</b>, which
      retires cards one by one down the published milestone queue.</p></div>
    <div class="card burn"><div class="co-h">Lenses · ERC-721</div>
      <p style="font-size:13px;margin:0">The <b>1/1s</b>. A Companion Lens Collection (assisted
      setup): the sealed marquee, season-end survivor 1/1s, compressed retirees, Ash-Trophy
      honors — each lens a different view over the same market.</p></div>
  </div>
  <p class="fine">There are <b>no per-card tokens</b> at launch — no ERC-1155, no 196 mini-tokens.
  Cards are states of the one artwork; your collection is your on-chain rip history + balance.
  A contract-based game layer exists as a reviewed <b>Phase 2 reference design</b> (see the
  <a href="audit.html">audit notes</a>) and ships only if the format ever permits it.</p>

  <div class="callout cy"><div class="co-h">This is transparency, not a pitch.</div>
    <p>$UR3030 is a collectible game token, not an investment. It can go to zero. The cards are art,
    parody, and memes. Play for the fun of it — see <a href="#legal">Legal &amp; NFA</a>.</p></div>

  <h2><span class="n">02</span>The game</h2>
  <ul>
    <li><b>The field opens</b> — all 196 cards alive in the render, five tiers: Common → Uncommon → Rare → Mythic → Prizm.</li>
    <li><b>Rip &amp; collect</b> — a pack is a guided <b>buy of ~350 $UR3030, burned in full</b>; your 7 pulls derive from your burn tx. Your collection = your rip history + holdings.</li>
    <li><b>The burn-down</b> — a <b>published retirement queue</b> (weakest first). Every time cumulative burn crosses the next milestone, the next card turns to ash — first at ~15k burned, all 119 at ~4.36M ≈ a sold-out season of packs.</li>
    <li><b>The court &amp; arena</b> — voting, wagers, and trades run <b>site-side</b> as community signal shaping next season's queue. <b>Burns are the consensus</b> — the only on-chain action, and the only one the render trusts.</li>
    <li><b>Season end</b> — the <b>77 survivors</b> mint as tradeable <b>deck-edition lenses</b> (your serial of the card); corner a card's whole claim set and <b>compress it into a 1/1</b> (§6); the uncornered dead stay ash with the final burner's name on the trophy.</li>
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
  <p>One direction: <b>the fire</b>. There is no toll wallet, no creator-cut contract, no house
  pool — because there is no other contract at all.</p>
  <div class="cols3">
    <div class="card burn"><div class="co-h">🔥 Burns (on-chain, real)</div>
      <ul><li>every pack — <b>in full</b> (~350/rip)</li><li>voluntary conviction burns</li>
      <li>season-end <b>compression</b> costs</li><li>all irreversible, all public</li></ul></div>
    <div class="card creator"><div class="co-h">📈 The curve (on-chain, real)</div>
      <ul><li>buys deepen the RARE reserve</li><li>sells walk back down it</li>
      <li>burned supply re-mints only on new buys</li><li>read it live: <code>getMarketState()</code></li></ul></div>
    <div class="card house"><div class="co-h">🃏 Site-layer (signal, honest)</div>
      <ul><li>court votes, wagers, trades, binder</li><li>shape next season's queue</li>
      <li>no tokens move — <b>burns are the consensus</b></li></ul></div>
  </div>

  <h2><span class="n">05</span>Packs · a $7 premium, escalating</h2>
  <p>A pack is the one <b>premium</b> action, and it uses only native curve operations: the site walks
  you through <b>buying ~350 $UR3030 ≈ $7</b> (seven cards, ~$1 a card) and <b>burning it in full</b>.
  Your pulls derive deterministically from your burn tx. It is <b>not</b> a token reprice — FDV is
  unchanged — and every rip is a real buy-and-burn, the engine of steady pressure, not a pump. The
  schedule (site-enforced, auditable from the burn txs) escalates <b>within</b> a season (base→ceil as
  the allotment sells) and <b>across</b> seasons (the field shrinks, so the allotment dwindles and the
  floor rises).</p>
  <table><tr><th>Season</th><th>Pack allotment</th><th>Base ≈ $*</th></tr>
    <tr><td>I · Summer</td><td>10,000 packs</td><td>$7.00</td></tr>
    <tr><td>II · Fall</td><td>7,500 packs</td><td>$9.00</td></tr>
    <tr><td>III · Winter</td><td>5,000 packs</td><td>$12.00</td></tr>
    <tr><td>IV · Spring</td><td>2,500 packs</td><td>$16.00</td></tr></table>
  <p class="fine">*Floor at the launch spot ($0.02); token appreciation rides on top. See <a href="tokenomics.html">Tokenomics</a>.</p>

  <h2><span class="n">06</span>Seasons, lenses &amp; the Compression rite</h2>
  <p>Four a year, on the calendar — we launch in the season we're in: <b>Summer</b> (live), then Fall,
  Winter, Spring. Each season burns the field to 77 on the milestone queue. At season end the Companion
  721 Lens Collection is where ownership becomes real — resolved on two axes: <b>survived?</b> and
  <b>cornered?</b> (does one wallet hold a card's <i>entire</i> claim set). A <b>1/1 means one owner</b>,
  so it is <i>always earned by cornering</i> — survival alone never mints a 1/1.</p>
  <div class="cols3">
    <div class="card house"><div class="co-h">Deck lenses · the 77</div>
      <p style="font-size:13px;margin:0">Each survivor mints as a <b>collectible lens edition sized to its
      holders</b> (own your serial — <i>Moon Cat #3/8</i>). This is the <b>playable deck</b>: buy, sell,
      trade it. A card two wallets held is a 2-edition; scarcity is <b>emergent</b>, not decreed.</p></div>
    <div class="card creator"><div class="co-h">1/1 lenses · Compression</div>
      <p style="font-size:13px;margin:0">Hold <b>100%</b> of a card — survivor <i>or</i> retired — and
      <b>compress</b>: burn to collapse every claim into a single <b>1/1</b>, pulled from circulation.
      Cornering a survivor is the apex flex; cornering a retiree rescues it from ash.</p></div>
    <div class="card burn"><div class="co-h">Ash · Trophies · 1/1 marquee</div>
      <p style="font-size:13px;margin:0">Retired cards nobody corners stay <b>ash</b>. Final-blow burners
      get a soulbound <b>Ash-Trophy</b> lens. The marquee <i>Lovebeing</i> is the always-sealed <b>1/1</b>.</p></div>
  </div>
  <p><b>Provenance compounds.</b> A card that survives into later seasons carries its record — seasons
  survived, burn withstood, holders — and its <b>ATK/DEF/trigger harden with age</b>: the deck is a
  <b>living pedigree</b>, and a card left alive keeps accruing it, while a compressed 1/1 freezes it forever.</p>
  <p class="fine">So they do <b>not</b> all become 1/1s: survivors are tradeable <b>deck editions</b>; a 1/1
  is the reward for owning the whole thing. "The entire 196 live on" is a reachable outcome — corner and
  compress enough of them — not an automatic one.</p>

  <h2><span class="n">07</span>Steady, not a pump</h2>
  <ul>
    <li><b>Un-pullable liquidity</b> — the RARE reserve lives in the pool, not a yankable LP. Sells walk down the curve.</li>
    <li><b>No team pre-mint</b> — nothing minted at genesis to dump.</li>
    <li><b>Buy-and-burn packs</b> — RARE flows in on every buy, tokens vanish on every burn; fewer tokens on a deeper reserve.</li>
    <li><b>Adding liquidity</b> — seed real RARE at deploy and let every buy deepen the reserve organically; the curve itself is the standing liquidity.</li>
  </ul>
  <div class="callout amber"><div class="co-h">What this is NOT.</div>
    <p>Not a promise the price goes up. Net supply moves with <b>buys − burns</b> — the sign is not guaranteed.
    Deflationary <i>pressure</i> is a goal, not a floor. Read the real trajectory live from <code>totalSupply()</code>.</p></div>

  <h2><span class="n">08</span>Transparency</h2>
  <ul>
    <li><b>One contract surface</b> — the edition + a read-only render. Nothing else to trust, nothing else to exploit.</li>
    <li><b>Published retirement queue</b> — <code>cards/data/_milestones.json</code>: every milestone, every card, fixed at season open. You can see the fire coming.</li>
    <li><b>Reproducible model</b> — <code>scripts/token-model.mjs</code> + <code>scripts/burn-milestones.mjs</code> re-derive every number here.</li>
    <li><b>Legible actions</b> — packs, conviction, and compression are all burn txs on the one token; the chain is the receipt.</li>
    <li><b>Phase 2 in the open</b> — the contract-based game design (<code>CardVault.sol</code>) is public, reviewed, and clearly labeled undeployed: see the <a href="audit.html">Audit</a> page.</li>
    <li><b>Testnet first</b> — a full Sepolia dress rehearsal before any mainnet deploy.</li>
  </ul>

  <h2><span class="n">09</span>Risks</h2>
  <ul>
    <li><b>The token can go to zero.</b> Experimental and highly volatile — only spend what you can lose entirely.</li>
    <li><b>Smart-contract risk.</b> Code can have bugs. Assume unaudited unless a published audit says otherwise (<a href="audit.html">Audit</a>).</li>
    <li><b>Liquidity &amp; slippage.</b> A thin market moves price hard; you may not exit at the quoted price.</li>
    <li><b>Design risk.</b> Game economies can behave unexpectedly, even when tuned and modeled.</li>
    <li><b>Dependency risk.</b> The 721 lens mints (survivors, compression, trophies) run through SuperRare's assisted setup — scope and timing are not solely in our hands.</li>
    <li><b>Site-layer honesty.</b> Court votes, wagers, and trades are community signal on the site, not on-chain settlement. Only burns are consensus.</li>
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
  Add liquidity by seeding real RARE at deploy and letting every buy deepen the pool organically — the curve
  itself is the standing liquidity.</p>

  <h2 id="packs"><span class="n">06</span>The pack allotment (dwindling + escalating)</h2>
  <p>Pack allotment for a season = <b>cards issued ÷ 7</b>. As the field burns down, fewer cards issue, so
  the allotment shrinks and the floor rises. Within a season the price walks a line from base → ceil as the
  allotment sells; sell out → packs close for the season. The schedule is <b>site-enforced</b> (packs are
  guided buy+burns of the one token — there is no pack contract) and fully auditable from the burn txs.</p>
  <table><tr><th>Season</th><th>Cards issued</th><th>Pack allotment</th><th>base → ceil (tok)</th><th>base ≈ $*</th><th>ceil ≈ $*</th></tr>
    <tr><td>I · Summer</td><td>70,000</td><td>10,000 packs</td><td>350 → 525</td><td>$7.00</td><td>$10.50</td></tr>
    <tr><td>II · Fall</td><td>52,500</td><td>7,500 packs</td><td>450 → 675</td><td>$9.00</td><td>$13.50</td></tr>
    <tr><td>III · Winter</td><td>35,000</td><td>5,000 packs</td><td>600 → 900</td><td>$12.00</td><td>$18.00</td></tr>
    <tr><td>IV · Spring</td><td>17,500</td><td>2,500 packs</td><td>800 → 1,200</td><td>$16.00</td><td>$24.00</td></tr></table>
  <p class="fine">*Floor priced at the launch spot ($0.02); token appreciation rides on top. Curator-set at
  <code>openSeason()</code>, recalibrated to the live token price.</p>

  <h2><span class="n">07</span>The burn schedule (launch — everything burns in full)</h2>
  <p>At launch the only on-chain spend is the <span class="fire">🔥 burn</span> of the one token. There
  are no tolls, no creator-cut contract, no house pool — nothing to route, nothing to skim.</p>
  <table><tr><th>Action</th><th>Cost</th><th>→</th></tr>
    <tr><td>rip a pack (7 cards, site-guided)</td><td>~350 → escalates (§6)</td><td class="fire">🔥 in full</td></tr>
    <tr><td>conviction burn (push the milestone)</td><td>any amount</td><td class="fire">🔥</td></tr>
    <tr><td>season-end <b>compression</b> (retired card → 1/1 lens)</td><td>compression cost (set at season end)</td><td class="fire">🔥</td></tr>
    <tr><td>court votes · wagers · trades · binder</td><td>site-side signal</td><td>no tokens move</td></tr></table>
  <p class="fine">The retirement itself is priced by the <b>milestone escalator</b> (§8a): the k-th card falls
  when cumulative burn crosses its published milestone — killing card k costs the crowd 15,000 + 360·k more
  than card k−1. The Phase-2 toll/court table lives in <code>docs/CARD-ECONOMY-SPEC.md</code>, clearly undeployed.</p>

  <h2><span class="n">08</span>Burn pressure per season</h2>
  <p>Bounded by the S1 allotment (10,000 packs); scenarios are the fraction sold. A rip burns ~437 tokens
  in full, so packs dominate. Illustrative, not a forecast.</p>
  <table><tr><th>scenario</th><th>packs sold</th><th>pack 🔥</th><th>other 🔥*</th><th>total 🔥/season</th></tr>
    <tr><td>QUIET (30%)</td><td>3,000</td><td>1,312,500</td><td>28,500</td><td><b>~1,341,000</b> (0.44× cap)</td></tr>
    <tr><td>STEADY (70%)</td><td>7,000</td><td>3,062,500</td><td>68,250</td><td><b>~3,130,750</b> (1.03× cap)</td></tr>
    <tr><td>SELLOUT (100%)</td><td>10,000</td><td>4,375,000</td><td>101,650</td><td><b>~4,476,650</b> (1.48× cap)</td></tr></table>
  <p class="fine">*conviction + compression burns, illustrative. A sold-out season (~4.37M pack burn) clears
  the full 119-milestone schedule (4,355,400) almost exactly — the deck only reaches 77 if the season truly burns.</p>
  <div class="callout"><p style="margin:0">Net supply change = <b>buys − burns</b> (sign indeterminate). A sold-out season
    cycling ~1.5× the cap through burns is the proof that the cap <b>refills</b> — burns pull totalSupply below
    what was bought; the next buy re-mints into the gap. Read the real trajectory from <code>totalSupply()</code>.</p></div>

  <h2 id="milestones"><span class="n">8a</span>The milestone escalator</h2>
  <p>The published queue (<code>cards/data/_milestones.json</code>, generated by
  <code>scripts/burn-milestones.mjs</code>): 119 retirements, weakest first (tier, then trait-score).
  Retirement k lands at cumulative burn <code>Σ (15,000 + 360·i)</code>:</p>
  <table><tr><th>milestone</th><th>falls at (cum. burn)</th><th>≈ packs of burn†</th></tr>
    <tr><td>#1 (first common)</td><td>15,360</td><td>~35</td></tr>
    <tr><td>#25</td><td>492,000</td><td>~1,125</td></tr>
    <tr><td>#60</td><td>1,558,800</td><td>~3,563</td></tr>
    <tr><td>#100</td><td>3,318,000</td><td>~7,584</td></tr>
    <tr><td>#119 (last cut — deck locks at 77)</td><td>4,355,400</td><td>~9,955</td></tr></table>
  <p class="fine">†at the S1 average pack (~437.5 tokens). Survivors: 15 uncommon · 40 rare · 17 mythic ·
  5 prizm = 77. The 1/1 marquee is indestructible and outside the queue. Every retired card can be
  <b>compressed into a 1/1 lens</b> at season end by whoever cornered its claim set — or stand as ash forever.</p>

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
    <p>This page is our <b>own</b> honest accounting of the review we've done and what we haven't. Everything
    here is <b>experimental and unaudited by an independent firm</b>. A formal external audit is <b>pending</b>
    before any mainnet deploy. Interact at your own risk. Not a security assurance, not financial advice.</p></div>

  <div class="callout amber"><div class="co-h">Architecture at launch: one Liquid Edition, no game contract.</div>
    <p>The project ships as a <b>pure Liquid Edition</b> — one ERC-20 + a read-only render + (via assisted
    setup) a Companion 721 Lens Collection. The ERC-1155 game contract reviewed below (<code>CardVault.sol</code>)
    is a <b>Phase 2 reference design and is NOT deployed</b>; its mechanics run site-side at launch, with real
    burns as the only on-chain action. Authoritative design: <code>docs/LAUNCH-ARCHITECTURE.md</code>.</p></div>

  <h2><span class="n">01</span>What we reviewed, and how</h2>
  <ul>
    <li><b>The launch surface is deliberately tiny.</b> One ERC-20 (deployed by SuperRare's audited factory
      via the Rare CLI — not our code) + a read-only render contract + a published milestone schedule.
      The less we deploy, the less there is to get wrong.</li>
    <li><b>Reproducible economics.</b> Every tokenomics number is derived by <code>scripts/token-model.mjs</code>
      and <code>scripts/burn-milestones.mjs</code> — run them and re-derive the price schedule, slippage,
      allotments, milestone escalator, and burn pressure yourself.</li>
    <li><b>Adversarial modeling pass.</b> The tokenomics were pressure-tested by an adversarial pass — multiple
      independent models, each checked by a skeptic — to catch hand-wavy claims and hidden assumptions.</li>
    <li><b>Phase 2 reference contract.</b> <code>CardVault.sol</code> (the undeployed ERC-1155 game design)
      compiles with <b>solc 0.8.24</b> + <b>OpenZeppelin 5.0.2</b>, <b>0 warnings</b>, ~20.3 KB — reviewed and
      kept in the open even though it does not ship.</li>
  </ul>

  <h2><span class="n">02</span>Things we found and fixed (in the open)</h2>
  <ul>
    <li><b>The architecture itself.</b> We initially designed a custom ERC-1155 game contract — then
      re-read the cohort docs: a Liquid Edition is <b>one ERC-20 + render + optional 721 lenses</b>, and we
      are not at liberty to deploy other contracts. <b>Fixed:</b> the whole game was remapped onto pure
      liquid-edition primitives (burn milestones, guided buy+burns, lens mints) — see
      <code>docs/LAUNCH-ARCHITECTURE.md</code>. The vault became Phase 2.</li>
    <li><b>destroyEdition could kill a healthy card</b> (Phase 2 design). <b>Fixed</b> with a court-retired
      guard + toll-neutral reward before we shelved it.</li>
    <li><b>A ~100× pricing error in an early doc.</b> A stale peg implied a ~$0.001 pack. <b>Fixed:</b> the peg is
      ~1 RARE/token; the pack is a ~350-token bundle ≈ $7.</li>
    <li><b>Over-claimed "supply only goes down."</b> <b>Fixed:</b> the docs now state plainly that net supply =
      buys − burns (sign indeterminate); deflation is <i>pressure</i>, not a guarantee.</li>
  </ul>

  <h2><span class="n">03</span>Invariants we designed for (launch)</h2>
  <div class="grid2">
    <div class="stat"><b>No pre-mint</b><span>supply is minted only on buy — nothing sits at genesis to dump</span></div>
    <div class="stat"><b>Un-pullable reserve</b><span>RARE lives in the v4 pool, not a yankable LP; sells walk the curve</span></div>
    <div class="stat"><b>No fee wallet</b><span>every on-chain spend is a burn of the one token — nothing is routed anywhere</span></div>
    <div class="stat"><b>Published queue</b><span>the retirement order + milestones are fixed and public at season open</span></div>
    <div class="stat"><b>Full-burn packs</b><span>a rip burns 100% — no slice to any pool or wallet</span></div>
    <div class="stat"><b>One trust surface</b><span>burns are the only consensus; site play is labeled signal, never settlement</span></div>
  </div>

  <h2><span class="n">04</span>What is still pending before mainnet</h2>
  <ul>
    <li><b>Independent third-party security audit</b> of the render contract — not yet performed. (The ERC-20
      + curve come from SuperRare's protocol; the render is ours.)</li>
    <li><b>★ The burn metric</b> — confirm the canonical cumulative-burn read in the
      liquid-editions-starter-kit that the render's milestone logic keys on.</li>
    <li><b>On-chain parameter verification</b> via <code>--preview</code> / <code>getMarketState</code>: effective
      demand multiple <b>M</b>, <b>sell-fraction</b>, and <b>mint/burn semantics</b> (does a burn re-open mint
      headroom on the next buy?).</li>
    <li><b>Lens scope with SuperRare</b> — assisted-setup coverage for survivor 1/1s, the Compression rite,
      Ash-Trophy honors, and the sealed marquee.</li>
    <li><b>Full Sepolia dress rehearsal</b> — deploy, wire the render, run a mock season: rips (buy+burn),
      milestone crossings, retirement renders, threshold states, a compression.</li>
  </ul>

  <h2><span class="n">05</span>Verify us yourself</h2>
  <ul>
    <li><b>Read the schedule</b> — <code>cards/data/_milestones.json</code>: every milestone and every card's fate, fixed in the open.</li>
    <li><b>Run the models</b> — <code>node scripts/token-model.mjs</code> · <code>node scripts/burn-milestones.mjs</code> reproduce every number on the <a href="tokenomics.html">Tokenomics</a> page.</li>
    <li><b>Watch the chain</b> — packs, conviction, and compression are all burn txs on the one token; <code>getMarketState()</code> is live.</li>
    <li><b>Read Phase 2</b> — <code>contracts/CardVault.sol</code> + <code>docs/CARD-ECONOMY-SPEC.md</code>, clearly labeled undeployed.</li>
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
  <b>alive</b> — priced by a curve, played by a crowd, and able to win and to actually die. Ripmaster is that
  recess table rebuilt on-chain: a full field opens, the crowd plays it down to 77, and the rest turn to ash you
  can hold. The 1/1 at the top of the deck carries my name, <b>Lovebeing</b>.</p></div>

  <h2><span class="n">03</span>SuperRare Liquid Editions · Cohort 1</h2>
  <p>lovebeing is one of <b>four artists</b> in SuperRare's first <b>Liquid Editions</b> cohort — a program for
  artworks designed to <i>live, evolve, and circulate across networks</i> — alongside
  <a href="https://x.com/CreamyDreamy" target="_blank" rel="noopener">@CreamyDreamy</a>,
  <a href="https://x.com/takenstheorem" target="_blank" rel="noopener">@takenstheorem</a>, and
  <a href="https://x.com/tyaagnliu" target="_blank" rel="noopener">@tyaagnliu</a>.</p>

  <h2><span class="n">04</span>The namesake card</h2>
  <p>The sealed <b>1/1 marquee</b> at the top of the deck is <b>Lovebeing</b> — the artist's own name. It never
  appears in a pack and can't be burned; it can only ever change hands, and it's released later in the run.</p>
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

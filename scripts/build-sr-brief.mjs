#!/usr/bin/env node
/* Build the SUPERRARE PRESS BRIEF — a short, quotable PDF a social team can work from.
 *
 *     node scripts/build-sr-brief.mjs      →  brief.pdf   (served at /brief.pdf)
 *
 * Artist, 2026-08-05: *"I need a brief for superrare in pdf so they can talk about the project on
 * social."*
 *
 * ⚑ THIS IS NOT THE WHITEPAPER, AND THE DIFFERENCE IS THE WHOLE BRIEF. `whitepaper.pdf` argues
 *   the economics to somebody deciding whether to hold. This is for somebody writing a post
 *   TODAY who needs the facts to be right and the phrasing to be safe. So: eight pages, every one
 *   liftable on its own, and it ends with the lines they can quote verbatim plus the ones they
 *   must not.
 *
 * ══ ⛔ WHAT IS DELIBERATELY NOT IN IT ═══════════════════════════════════════════════════════
 * ⛔ **NO FORECAST BURN, NO FDV, NO "3x DEFLATION".** The pack is a DOLLAR target ($10 at tier I)
 *   entirely on an ASSUMED opening price of 1 RARE/token, and two independent readings say that
 *   assumption is an order of magnitude out — the live Sepolia curve sits near 16.8 RARE/token,
 *   and SuperRare's own worked example opens far above it. A price in a SOCIAL brief is the most
 *   quotable line in the document and the hardest to retract: it gets screenshotted, and the
 *   studio owns it forever. `rare liquid-edition deploy multicurve … --preview` prints the real
 *   curve for free; the number goes in after that, not before.
 * ⛔ **THE TREASURY SHARE IS STATED IN THE SAME BREATH AS THE BURN.** At this cap they are the
 *   same arithmetic — the 50/50 split sends the same number of tokens to the fire and to the
 *   studio — so a brief that lets a partner publish only the flattering half has done them harm.
 * ⚠ Nothing is framed as a return. The burn is described by what it does to SUPPLY, never by what
 *   it does to a holder.
 *
 * ⚑ The mark is the screenshot of the LIVE foil wordmark (`npm run mark`), same source as the
 *   whitepaper — a flat redraw would be a picture OF the mark rather than the mark itself.
 * ⚠ Self-contained: the art is a data URI and no font is named that has to exist. A brief that
 *   needs the network to render is a brief that arrives broken exactly when it matters.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const heroB64 = readFileSync(join(ROOT, 'media/site/mark-1024.png')).toString('base64');
const HERO = `data:image/png;base64,${heroB64}`;

const C = {
  void: '#020804', phos: '#2bff80', phosdim: '#0f5c33', phosdeep: '#0a3d22',
  acid: '#ff2ad9', cyan: '#27f7e4', amber: '#ffd23b', red: '#ff4b3a', text: '#b8ffd6',
};

let N = 1;
const TOTAL = 11;
const slide = (kicker, inner, accent = C.phos) => {
  N++;
  return `<section class="slide">
    <div class="scan"></div><div class="grid"></div>
    <div class="wm">RIPMASTER · 3030 · STUDIOS</div>
    <header class="shead">
      <span class="kick" style="color:${accent};border-color:${accent}">${kicker}</span>
      <span class="pg">${String(N).padStart(2, '0')} / ${TOTAL}</span>
    </header>
    <div class="body">${inner}</div>
    <footer class="sfoot">
      <span>$3030 · a game token, not an investment</span>
      <span class="nfa">NOT FINANCIAL ADVICE · ALL MEMES ARE MEMES · DYOR</span>
      <span>ripmaster3030studios.com</span>
    </footer>
  </section>`;
};

const S = [];

/* 01 · cover */
S.push(`<section class="slide cover">
  <div class="scan"></div><div class="grid"></div>
  <div class="cwrap">
    <img class="chero" src="${HERO}" alt="ripmaster3030studios">
    <div class="ctitle">PRESS BRIEF</div>
    <div class="csub">a card and game studio — with a token that burns so the art can live</div>
    <div class="cmeta">
      <span>FOR · SUPERRARE</span>
      <span>LIQUID EDITIONS · COHORT 01</span>
      <span>ARTIST · GIANNI ARONE <b>(lovebeing)</b></span>
    </div>
    <div class="cnfa">NOT FINANCIAL ADVICE · NOTHING HERE IS AN OFFER · ALL MEMES ARE MEMES</div>
  </div>
</section>`);

/* 02 · what it is */
S.push(slide('WHAT IT IS', `
  <h1>A card studio that ships a token — <em>not</em> a token that ships cards.</h1>
  <div class="two">
    <div>
      <p class="lede"><b>ripmaster3030studios</b> is a trading-card and game studio by
      <b>Gianni Arone (lovebeing)</b>. Its edition, <b>$3030</b>, is a SuperRare Liquid Edition,
      and every card in the deck is a <b>Liquid Lens</b> — a render that reads the chain and
      changes with it.</p>
      <p>The deck is <b>100 cards</b>. There are <b>six arcade cabinets</b> you can play right
      now. And the token's only job is to be <b>spent</b>: you rip packs with it, you wager it,
      and a share of every rip is destroyed permanently.</p>
      <p class="small dim">The studio is <b>ripmaster3030studios</b>. The edition it issues is
      <b>$3030</b>. A company and its product may differ — both spellings are correct in their
      own place.</p>
    </div>
    <div class="callout">
      <div class="clabel">THE LINE</div>
      <p class="quote">“The token burns so the art can live.”</p>
      <p class="small">Packs are bought and burned. The supply only ever goes down. Nothing is
      staked for yield, nothing pays a return, and there is nothing to claim — the prize is the
      card, and the having-done-it.</p>
    </div>
  </div>`));

/* 03 · the artist */
S.push(slide('THE ARTIST', `
  <h1>Gianni Arone · <span class="dim">lovebeing</span> · <span class="dim">@_lovebeing_</span></h1>
  <div class="two">
    <div>
      <p>Came up as a <b>Fake Rares</b> artist, in the lineage <b>Rare Pepes on
      Bitcoin/Counterparty</b> began — the first people to treat a trading card as a native digital
      object. Found a love and a knack for making cards, and has been making them since.</p>
      <p>The throughline is <b>anticipation</b>. <b>MAD magazine and cereal boxes</b> — a picture
      that is a joke, a trophy and a currency at once. <b>The casino and the arcade</b> — the
      machine that promises you win something tangible. <b>The auction</b> — the promise of value
      received. The rip, the pull, the reveal, the bid.</p>
    </div>
    <div class="callout" style="border-color:${C.acid}">
      <div class="clabel" style="color:${C.acid}">THE DADAIST TURN</div>
      <p class="quote">Sometimes the thing you win is the experience itself.</p>
      <p class="small">Which makes this an <b>anti-casino</b>: all the same anticipation, but the
      tangible prize is a thing you made or did — never a payout. It parodies crypto / KOL /
      meme-coin culture <em>as art</em>, with generic archetypes, clearly as satire, and never
      deceptively.</p>
    </div>
  </div>`, C.acid));

/* 04 · the deck */
S.push(slide('THE DECK · 100 CARDS', `
  <h1>Every card is a lens. The artwork is generated at fetch time, from chain state.</h1>
  <div class="grid3">
    <div class="cell"><div class="num">33</div><div class="ct">HERO 1/1s · the genesis set</div>
      <p class="small">Split three ways on purpose — <b>11 at auction</b>, <b>11 pulled from
      packs</b>, and <b>11 EARNED</b>: named feats in the studio's own cabinets, first claimant
      takes it and it closes forever.</p></div>
    <div class="cell"><div class="num">67</div><div class="ct">FIELD LENSES</div>
      <p class="small">They render <b>without needing to be minted</b>. The deck is browsable and
      alive before a single one changes hands.</p></div>
    <div class="cell"><div class="num">1</div><div class="ct">LOVEBEING · holder-bound</div>
      <p class="small">One per wallet. Non-transferable and non-burnable. It is not for sale and
      never will be.</p></div>
  </div>
  <div class="callout wide">
    <div class="clabel">THE PART WORTH POSTING</div>
    <p><b>No title can be bought.</b> Not one of the eleven earned cards keys on holding more,
    ripping more or burning more — a balance can be borrowed for a single block, a feat cannot.
    The studio judges them and says so openly, because no machine can referee
    “did you actually do this.”</p>
  </div>`, C.cyan));

/* 05 · how a card is made */
S.push(slide('HOW A CARD IS MADE', `
  <h1>Not a picture with effects on it — a sheet of card stock that went through a press.</h1>
  <div class="two">
    <div>
      <p>Each card's artwork is <b>separated into four process inks</b>, and every ink is laid
      down at its <b>own registration</b> and screened at its <b>own angle</b>. The
      misregistration and the moiré are not filters applied to a picture: they <b>fall out of
      printing one picture four times with the plates slightly wrong</b>.</p>
      <p>Ink <b>multiplies</b> the paper and never adds — the one line that keeps the whole thing
      on the paper side of the fence instead of looking like a screen. The die edge is real foil:
      thin metal whose hue walks as you turn it, because it is reflectance rather than a rainbow
      painted on top.</p>
    </div>
    <div class="callout" style="border-color:${C.amber}">
      <div class="clabel" style="color:${C.amber}">AND IT MOVES WHEN YOU DO</div>
      <p class="small">Press the card and the stock dishes under your thumb, then rings when you
      let go. Keep handling it and <b>the sheet advances</b> — a new impression, new registration,
      a new ink film.</p>
      <p class="small"><b>Nothing runs on a clock.</b> Left alone, a card is a card sitting on a
      table. Every bit of motion is something <em>you</em> did to it.</p>
    </div>
  </div>`, C.amber));

/* 06 · the economy */
S.push(slide('THE ECONOMY', `
  <h1>One edition. Minted once. It only shrinks.</h1>
  <div class="grid4">
    <div class="cell"><div class="num sm">3,300,000</div><div class="ct">SUPPLY · mint-once</div></div>
    <div class="cell"><div class="num sm">4 TIERS</div><div class="ct">1,600 → 1,100 → 600 → 260 packs</div></div>
    <div class="cell"><div class="num sm">live</div><div class="ct">burn read on-chain — no percentage is forecast</div></div>
    <div class="cell"><div class="num sm">50 / 50</div><div class="ct">every pack — half burned, half funds the studio</div></div>
  </div>
  <div class="two" style="margin-top:.16in">
    <div class="callout" style="border-color:${C.red}">
      <div class="clabel" style="color:${C.red}">⛔ THESE TWO GO TOGETHER, ALWAYS</div>
      <p class="small">The split sends the <b>same number of tokens</b> to the fire and to the
      studio. So “the burn is meaningful” and “the treasury is large” are <b>the same
      arithmetic</b> — at this cap the studio ends up holding a substantial share of everything
      still alive. Quoting the burn without the treasury is the misleading half. The site states
      both in one breath and so should any post.</p>
    </div>
    <div>
      <p><b>A tier opens when the one before it SELLS OUT — not on a date.</b> That is deliberate.
      A season is a promise about <em>time</em>: miss one and it is a public failure at something
      nobody had to promise. A tier is a promise about <b>supply</b>, equally honest whether it
      takes three weeks or three years.</p>
      <p class="small dim">⚠ Pack and token pricing are announced at launch, once the live curve
      has actually been read. Please don't quote a figure before then — there isn't a verified one
      yet.</p>
    </div>
  </div>`, C.red));

/* 07 · playable */
S.push(slide('IT IS PLAYABLE TODAY', `
  <h1>Six cabinets. Your cards are the pieces.</h1>
  <div class="grid3 tight">
    <div class="cell"><div class="ct big">THE CITY <span class="tag">explore</span></div>
      <p class="small">A <b>3.84 km generated city</b> — 32×32 streamed chunks. Be a bird,
      squirrel, cat or dog; or fly a jet; or walk it as an operative. <b>The animals cannot be
      hurt or targeted</b>, so a firefight two streets over is weather: something to fly over,
      watch, and photograph.</p></div>
    <div class="cell"><div class="ct big">SECTION 9 <span class="tag">tactical</span></div>
      <p class="small">First-person, six arenas plus baked levels. Bots take cover, flank and
      suppress; ~1.3 s time-to-kill so cover is worth using.</p></div>
    <div class="cell"><div class="ct big">DOGFIGHT <span class="tag">air combat</span></div>
      <p class="small">Height and speed are <b>one currency</b> — climbing spends it, diving buys
      it back. Raymarched clouds with self-shadowing.</p></div>
    <div class="cell"><div class="ct big">RIP ROCKETER <span class="tag">on-rails</span></div>
      <p class="small">Vertical shooter — bases, turrets, ship variety.</p></div>
    <div class="cell"><div class="ct big">CLOUD RACER <span class="tag">anti-grav</span></div>
      <p class="small">Sky racing through a real cloudscape.</p></div>
    <div class="cell"><div class="ct big">THE ARENA <span class="tag">1v1</span></div>
      <p class="small">Wager cards and $3030 into a pot; the podium takes it, first place the most.
      A small rake burns.</p></div>
  </div>
  <div class="callout wide" style="border-color:${C.cyan}">
    <div class="clabel" style="color:${C.cyan}">THE HOOK</div>
    <p><b>A photograph you take in the city becomes a card.</b> A trading card is a <em>size</em>
    before it is anything else — and so is a photo. Explore, notice, frame, shoot, and it is in
    your binder. It is the rip and the reveal in another key, and the prize is a thing you
    <b>made</b> rather than a thing you won.</p>
  </div>`, C.cyan));

/* 09 · the contracts */
S.push(slide('TECHNICAL · THE CONTRACTS', `
  <h1>Two contracts of our own. Both small enough to read in one sitting.</h1>
  <div class="two">
    <div>
      <p><b>We write the contracts; SuperRare provides the platform.</b> The edition itself is a
      SuperRare Liquid Edition — <code>name()</code> <b>ripmaster3030</b>, <code>symbol()</code>
      <b>3030</b>, deployed by the artist from his own verified wallet via the Rare Protocol CLI.</p>
      <table class="tt">
        <tr><th>CONTRACT</th><th>WHAT IT IS</th><th>SIZE</th></tr>
        <tr><td><code>Ripmaster3030Lens721</code></td>
            <td>the deck — ERC-721 + on-chain renderer + voucher mint</td><td>16,155 B</td></tr>
        <tr><td><code>Ripmaster3030Renderer</code></td>
            <td>edition passthrough — reads <code>getMarketState()</code></td><td>—</td></tr>
        <tr><td><code>PackSink</code></td>
            <td>the 50/50 split, in one atomic call</td><td><b>1,773 B</b></td></tr>
      </table>
      <p class="small">solc 0.8.24, viaIR, <b>0 warnings</b>. <b>55/55 EVM tests</b> on the lens.</p>
    </div>
    <div class="callout">
      <div class="clabel">WHY PACKSINK EXISTS AT ALL</div>
      <p class="small">A pack burns half and pays half. <b>That cannot be two client-side
      transactions</b> — a wallet can sign the burn and reject the transfer, and the collector's
      tokens are destroyed, the studio is unpaid, and no pack is owed. There is no ordering that
      fixes it, because there is no atomicity between two signatures. So it is one contract call.</p>
      <p class="small"><b>No owner, no admin, no upgrade, no pause.</b> Both destination addresses
      are <code>immutable</code>. It holds nothing between calls, and <code>flush()</code> is
      permissionless <em>because</em> its destination cannot change — opening it to everyone grants
      no power, while an owner-gated sweep would have added the admin key the contract exists to
      not have.</p>
    </div>
  </div>`, C.cyan));

/* 10 · the lens */
S.push(slide('TECHNICAL · THE LENS', `
  <h1>A card is a function of chain state, evaluated when someone looks at it.</h1>
  <div class="two">
    <div>
      <p><code>tokenURI()</code> is the edition passthrough; <code>tokenURI(uint256 id)</code>
      renders a specific card. Ids <b>1–100 render whether or not they have been minted</b> — the
      67 field lenses are render-only, so OpenZeppelin's revert-on-nonexistent is wrong here and
      is deliberately not used.</p>
      <p>The renderer reads the edition's <code>getMarketState()</code> and derives burn from
      <code>maxTotalSupply − totalSupply</code>. SuperRare's own documentation names the available
      inputs: <b>price, supply, liquidity, burn progress and balances</b>.</p>
      <p><b>Holding is one of those inputs.</b> <code>tierOfHolder()</code> reads your $3030
      balance and the card renders it — <b>Ash · Spark · Ember · Flame · Inferno</b>, anchored on
      the pack rather than round numbers: one pack, ten, a hundred, a thousand.</p>
      <p class="small dim">No staking contract. No emissions. Nothing to drain, and nothing to
      claim — the art acknowledges you, it does not pay you.</p>
    </div>
    <div class="callout" style="border-color:${C.red}">
      <div class="clabel" style="color:${C.red}">THE ONE THAT MUST NEVER REVERT</div>
      <p class="small"><code>tierOfHolder</code> is called from <code>tokenURI</code>, so a revert
      would take the metadata of <b>all 100 cards</b> offline at once, on a marketplace, and
      permanently as far as any cache is concerned.</p>
      <p class="small">It has two guards, and <code>try/catch</code> alone is <b>not</b> enough:
      Solidity's contract-existence check fires <em>before</em> the call and is not catchable. So
      an explicit <code>code.length == 0</code> test is load-bearing — without it, pasting a wallet
      address where the token's belongs reverts the whole deck. <b>Found by a test, not by
      reasoning.</b></p>
    </div>
  </div>`, C.cyan));

/* 11 · how it is built */
S.push(slide('TECHNICAL · HOW IT IS BUILT', `
  <h1>No build step. No framework. Everything fails open.</h1>
  <div class="grid4">
    <div class="cell"><div class="ct">FRONT END</div><p class="small">Plain HTML, CSS and
      JavaScript. <b>No bundler, no framework, no build.</b> What is in the repo is what the
      browser runs.</p></div>
    <div class="cell"><div class="ct">3D</div><p class="small"><b>PlayCanvas</b> (MIT, UMD, no
      build step) for the cabinets and the card. Cards are rendered in <b>WebGL2</b>.</p></div>
    <div class="cell"><div class="ct">ART PIPELINE</div><p class="small">Blender → GLB, plus a
      dependency-free <b>FBX reader</b> that handles binary 6.x/7.x and ASCII — it reads files
      Blender refuses.</p></div>
    <div class="cell"><div class="ct">TESTS</div><p class="small"><b>21 suites, ~1,190
      assertions</b>, headless Chromium. Every one proved to bite by reverting its own fix.</p></div>
  </div>
  <div class="two" style="margin-top:.16in">
    <div class="callout">
      <div class="clabel">FAIL OPEN — THE ONE STANDING RULE</div>
      <p class="small">No WebGL2, a blocked script, a 404 on a manifest, a chain that will not
      answer: <b>the page is still the page it was.</b> Not a spinner, not a broken frame — the
      flat card, the readable document, the working link. Several test suites exist only to
      <em>break</em> the build and check that it degrades rather than dies.</p>
    </div>
    <div class="callout" style="border-color:${C.amber}">
      <div class="clabel" style="color:${C.amber}">DETERMINISM</div>
      <p class="small"><code>Math.random</code> appears <b>nowhere</b> in the card renderer. Every
      seeded quantity comes from one hash of the card's own identity, and every animated quantity
      is integrated from a caller-supplied clock. <b>The same card renders byte-identically on any
      machine, forever</b> — which is what makes a 1/1 a 1/1 rather than a lucky frame.</p>
    </div>
  </div>`, C.amber));

/* 08 · lines to lift */
S.push(slide('LINES YOU CAN LIFT', `
  <h1>Quotable, accurate, and safe to publish.</h1>
  <div class="two">
    <div>
      <ul class="lift">
        <li>“The token burns so the art can live.”</li>
        <li>“A card studio that ships a token — not a token that ships cards.”</li>
        <li>“Every card is a lens: it reads the chain and changes with it.”</li>
        <li>“Not a picture with effects on it — a sheet of card stock that went through a press.”</li>
        <li>“Eleven of the thirty-three heroes cannot be bought. Only earned.”</li>
        <li>“A tier opens when the last one sells out — not on a date.”</li>
        <li>“The anti-casino: the same anticipation, and the prize is the having-done-it.”</li>
      </ul>
    </div>
    <div class="callout" style="border-color:${C.red}">
      <div class="clabel" style="color:${C.red}">PLEASE DON'T POST</div>
      <p class="small">· <b>Any price</b> — pack, token, market cap or FDV. The opening price is
      set by the curve at deploy and has not been measured yet.</p>
      <p class="small">· <b>Any return, yield or upside framing.</b> Holding does nothing but
      change how your cards render. No staking contract, no emissions, nothing to claim.</p>
      <p class="small">· <b>“Deflationary” as a headline</b> without the treasury share beside it.</p>
      <p class="small">Everything is <b>NFA</b>, and the site says so on every page. It is an
      experimental art token and it can go to zero.</p>
    </div>
  </div>
  <div class="ends">
    <span><b>ripmaster3030studios.com</b></span>
    <span>artist · <b>@_lovebeing_</b></span>
    <span>edition · <b>$3030</b>, a SuperRare Liquid Edition</span>
  </div>`, C.amber));

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>ripmaster3030studios — Press Brief</title>
<style>
  @page { size: 13.333in 7.5in; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: ${C.void}; }
  body { font-family: 'Courier New', ui-monospace, monospace; color: ${C.text}; }
  b { color: #d9ffe8; } em { color: ${C.amber}; font-style: italic; }
  .dim { color: ${C.phosdim}; }

  .slide { position: relative; width: 13.333in; height: 7.5in; overflow: hidden;
    background:
      radial-gradient(120% 90% at 82% 8%, rgba(43,255,128,.10), transparent 55%),
      radial-gradient(90% 80% at 10% 100%, rgba(255,42,217,.08), transparent 55%),
      ${C.void};
    page-break-after: always; padding: 0.52in 0.62in; display: flex; flex-direction: column; }
  .slide:last-child { page-break-after: auto; }
  .scan { position: absolute; inset: 0; pointer-events: none; opacity: .35;
    background: repeating-linear-gradient(180deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.28) 2px 3px); }
  .grid { position: absolute; inset: 0; pointer-events: none; opacity: .16;
    background:
      linear-gradient(rgba(43,255,128,.10) 1px, transparent 1px) 0 0/ 46px 46px,
      linear-gradient(90deg, rgba(43,255,128,.10) 1px, transparent 1px) 0 0/ 46px 46px;
    mask-image: radial-gradient(120% 100% at 50% 40%, #000 55%, transparent 92%); }
  .wm { position: absolute; right: -0.2in; bottom: 2.7in; transform: rotate(90deg);
    transform-origin: right bottom; font-family: 'Arial Black', Arial, sans-serif;
    font-size: 14px; letter-spacing: .5em; color: rgba(43,255,128,.14); white-space: nowrap; }

  .shead { position: relative; display: flex; justify-content: space-between; align-items: center; z-index: 2; }
  .kick { font-family: 'Arial Black', Arial, sans-serif; text-transform: uppercase;
    letter-spacing: .2em; font-size: 12.5px; border: 2px solid; border-radius: 999px; padding: 5px 14px; }
  .pg { color: ${C.phosdim}; font-size: 12.5px; letter-spacing: .2em; }

  .body { position: relative; z-index: 2; flex: 1; padding-top: .20in; }
  h1 { font-family: 'Arial Black', Arial, sans-serif; font-size: 28px; line-height: 1.16;
    color: #eaffe8; margin: 0 0 .18in; letter-spacing: -.005em; }
  p { font-size: 15px; line-height: 1.58; margin: 0 0 .11in; }
  .lede { font-size: 16.5px; }
  .small { font-size: 13px; line-height: 1.52; }

  .two { display: grid; grid-template-columns: 1.08fr .92fr; gap: .30in; }
  .callout { background: rgba(4,20,11,.72); border: 2px solid ${C.phos}; border-radius: 10px;
    padding: .18in .20in; }
  .callout.wide { margin-top: .18in; }
  .clabel { font-family: 'Arial Black', Arial, sans-serif; font-size: 11px; letter-spacing: .2em;
    color: ${C.phos}; margin-bottom: .07in; }
  .quote { font-family: 'Arial Black', Arial, sans-serif; font-size: 18px; line-height: 1.3;
    color: #eaffe8; margin-bottom: .09in; }

  .grid3 { display: grid; grid-template-columns: repeat(3,1fr); gap: .20in; }
  .grid4 { display: grid; grid-template-columns: repeat(4,1fr); gap: .16in; }
  .cell { background: rgba(4,20,11,.6); border: 1px solid ${C.phosdeep}; border-radius: 8px;
    padding: .14in .15in; }
  .num { font-family: 'Arial Black', Arial, sans-serif; font-size: 38px; line-height: 1;
    color: ${C.phos}; }
  .num.sm { font-size: 23px; }
  .ct { font-family: 'Arial Black', Arial, sans-serif; font-size: 11px; letter-spacing: .13em;
    color: ${C.cyan}; margin: .05in 0 .06in; text-transform: uppercase; }
  .ct.big { font-size: 14.5px; color: ${C.amber}; }

  table.tt { width: 100%; border-collapse: collapse; margin: .10in 0; font-size: 12.5px; }
  table.tt th { text-align: left; color: ${C.cyan}; font-family: 'Arial Black', Arial, sans-serif;
    font-size: 10px; letter-spacing: .13em; padding: .04in .06in; border-bottom: 1px solid ${C.phosdeep}; }
  table.tt td { padding: .05in .06in; border-bottom: 1px solid rgba(10,61,34,.6); vertical-align: top; }
  code { font-family: 'Courier New', monospace; color: ${C.cyan}; font-size: .95em; }
  .grid3.tight .cell { padding: .12in .13in; }
  .tag { font-family: 'Courier New', monospace; font-size: 9.5px; letter-spacing: .1em;
    color: ${C.phosdim}; text-transform: lowercase; }
  ul.lift { margin: 0; padding: 0; list-style: none; }
  ul.lift li { font-size: 14.5px; line-height: 1.42; color: #eaffe8; margin-bottom: .11in;
    padding-left: .2in; border-left: 3px solid ${C.phos}; }

  .ends { position: relative; z-index: 2; display: flex; gap: .36in; margin-top: .16in;
    font-size: 12.5px; color: ${C.phosdim}; }

  .sfoot { position: relative; z-index: 2; display: flex; justify-content: space-between;
    align-items: center; font-size: 10px; color: ${C.phosdim}; letter-spacing: .1em;
    border-top: 1px solid ${C.phosdeep}; padding-top: .09in; }
  .nfa { color: ${C.red}; }

  .cover { align-items: center; justify-content: center; text-align: center; }
  .cwrap { position: relative; z-index: 2; }
  .chero { width: 3.0in; height: auto; display: block; margin: 0 auto .16in; }
  .ctitle { font-family: 'Arial Black', Arial, sans-serif; font-size: 58px; letter-spacing: .04em;
    color: #eaffe8; line-height: 1; }
  .csub { font-size: 16px; color: ${C.text}; margin-top: .13in; }
  .cmeta { display: flex; gap: .30in; justify-content: center; margin-top: .28in;
    font-size: 12px; letter-spacing: .13em; color: ${C.cyan}; }
  .cnfa { margin-top: .30in; font-size: 10.5px; letter-spacing: .16em; color: ${C.red}; }
</style></head><body>${S.join('')}</body></html>`;

writeFileSync(join(ROOT, 'scripts', '.sr-brief.build.html'), html);

const PW = process.env.PLAYWRIGHT_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js';
const pw = await import(PW);
const chromium = (pw.default || pw).chromium;
const browser = await chromium.launch({ executablePath: chromiumPath });
const page = await (await browser.newContext()).newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
const outPath = join(ROOT, 'brief.pdf');
await page.pdf({ path: outPath, width: '13.333in', height: '7.5in', printBackground: true,
  margin: { top: '0', bottom: '0', left: '0', right: '0' } });
await browser.close();

console.log(`✦ SuperRare press brief → ${outPath} (${TOTAL} pages)`);

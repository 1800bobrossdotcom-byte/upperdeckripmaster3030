#!/usr/bin/env node
/* Build the HERO LENSES — cards 1–33, the 1/1s.
 *
 * A hero is the SAME CARD as every other card — front and back, flip it over — whose front
 * happens to be able to move and react. The HTML is a display layer, not the artwork:
 *
 *     BASE      an IPFS-pinned .gif or .png. This is the artwork and the permanent record.
 *               It goes in the metadata as `image`, so if this site disappears entirely the
 *               NFT still resolves and still shows the card. THE CARDS PERSIST.
 *     LENS      this page, in `animation_url`. Draws the base inside the real card viewer
 *               and adds what only HTML can do. If it fails, marketplaces fall back to
 *               `image` on their own — the loss is the motion, never the card.
 *
 * So the lens is an enhancement over a durable base, never a replacement for it. Nothing
 * here is allowed to become the only copy of anything.
 *
 * It also has to survive being loaded somewhere hostile:
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
 *   node scripts/build-hero-lens.mjs --apply --inline # embed the base as a data: URI too
 *
 * Sources, same "NN - TITLE.ext" convention as the field cards. A hero may have BOTH:
 *   "07 - SOME TITLE.gif"   → the BASE layer (also .png)
 *   "07 - SOME TITLE.html"  → EXTRA layers, overlaid on the base inside the card front
 *
 * IPFS: cards/hero/cids.json maps card number → CID, e.g. { "7": "bafy…" }. When a CID is
 * known the base is loaded from a gateway with a multi-gateway onerror chain and the local
 * copy as the last resort, so one dead gateway is not a dead card. Cards with no CID yet
 * build fine and are reported as UNPINNED — they are not launch-ready until they are pinned.
 *
 * Emits cards/hero/<n>.json — the metadata the render-by-id contract will serve, carrying
 * image=ipfs://CID alongside the animation_url.
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

const GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://dweb.link/ipfs/',
];

/* The lens shell — the SAME card viewer the rest of the deck uses: a 2:3 card that tilts to
 * the pointer and flips to a stats back. Everything is inlined; the page makes no external
 * request except the IPFS base, and even that walks a gateway chain down to the local copy.
 * Deliberately boring CSS — an in-app webview inside a marketplace is not a modern browser. */
function shell({ number, title, baseSrc, fallbacks, overlay, meta }) {
  const m = meta || {};
  const chain = JSON.stringify(fallbacks || []);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ripmaster3030studios &#183; ${esc(title)} &#183; №${number}</title>
<meta name="robots" content="noindex">
<!-- HERO LENS ${number}. Framed by the token's animation_url. Stands alone: no gate, no
     storage, no parent-window assumptions. The BASE art is the IPFS-pinned asset that also
     sits in the metadata as image — this page is how it is displayed, not where it lives. -->
<style>
  html,body{margin:0;height:100%;background:#000;overflow:hidden;
    font-family:'Courier New',ui-monospace,monospace;-webkit-text-size-adjust:100%}
  body{display:flex;align-items:center;justify-content:center;perspective:1200px}
  /* Lock 2:3 and fit whatever frames us. Which side binds depends on the FRAME's aspect —
     height:100% together with max-width:100% is the trap: the clamp wins, aspect-ratio
     yields, and the card stretches (0.571 instead of 0.667 in a 320x560 slot). */
  .scene{position:relative;aspect-ratio:2/3;margin:auto}
  @media (min-aspect-ratio:2/3){ .scene{height:100%;width:auto} }
  @media (max-aspect-ratio:2/3){ .scene{width:100%;height:auto} }
  @supports not (aspect-ratio:2/3){ .scene{height:100%;width:66.667vh;max-width:100%} }
  .card{position:absolute;inset:0;transform-style:preserve-3d;cursor:pointer;
    transition:transform .6s cubic-bezier(.5,1.4,.4,1);
    transform:rotateY(calc(var(--px,0)*13deg + var(--flip,0deg))) rotateX(calc(var(--py,0)*-13deg))}
  .card.flipped{--flip:180deg}
  .face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;
    border-radius:14px;overflow:hidden;background:#000;box-shadow:0 18px 44px -12px #000}
  .back{transform:rotateY(180deg)}
  /* ---- front: base art, then the artist's extra layers on top ---- */
  .front>img.base{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
  .layers{position:absolute;inset:0}
  .foil{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:.5;
    background:linear-gradient(115deg,transparent 34%,rgba(120,255,200,.30) 46%,rgba(255,120,220,.26) 54%,transparent 66%);
    transform:translateX(calc(var(--px,0)*7%))}
  .glare{position:absolute;inset:0;pointer-events:none;mix-blend-mode:overlay;opacity:.4;
    background:radial-gradient(38% 26% at calc(50% + var(--px,0)*32%) calc(38% + var(--py,0)*30%),rgba(255,255,255,.6),transparent 70%)}
  /* offline / gateway-dead: never a blank card, always a legible one */
  .miss{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;
    padding:8%;color:#8fe6bd;font-size:3.4cqw;background:repeating-linear-gradient(45deg,#06140d,#06140d 8px,#04100a 8px,#04100a 16px)}
  .front.dead .miss{display:flex}
  /* ---- back: the stats plate, self-contained (no external images) ---- */
  .back{background:#e9dfc4;color:#221a08}
  .plate{position:absolute;inset:3.5%;border:2px solid #221a08;border-radius:7px;padding:4% 5%;
    display:flex;flex-direction:column;gap:2.4%;background:
      repeating-linear-gradient(0deg,rgba(0,0,0,.028) 0 2px,transparent 2px 4px),#f3ead2}
  .bt{font-family:'Arial Black',Arial,sans-serif;font-size:5.4cqw;line-height:1.05;text-transform:uppercase}
  .bteam{font-size:2.7cqw;letter-spacing:.18em;text-transform:uppercase;color:#6b5312}
  .brule{height:2px;background:#221a08;opacity:.75}
  .vit{display:grid;grid-template-columns:1fr 1fr;gap:1.5% 5%;font-size:3cqw}
  .vit div{display:flex;justify-content:space-between;border-bottom:1px dotted rgba(34,26,8,.4)}
  .vit .k{color:#6b5312;text-transform:uppercase;letter-spacing:.05em}
  .vit .v{font-weight:700}
  .lore{font-size:2.9cqw;line-height:1.45;flex:1 1 auto;overflow:hidden}
  .foot{font-size:2.4cqw;letter-spacing:.05em;color:#6b5312;display:flex;justify-content:space-between;gap:4%}
  .scene{container-type:size}
  @supports not (width:1cqw){
    .bt{font-size:5.4vw}.bteam{font-size:2.7vw}.vit{font-size:3vw}.lore{font-size:2.9vw}
    .foot{font-size:2.4vw}.miss{font-size:3.4vw} }
  .hint{position:absolute;left:0;right:0;bottom:1.5%;text-align:center;font-size:2.4cqw;
    color:rgba(190,255,215,.5);pointer-events:none}
  @supports not (width:1cqw){ .hint{font-size:2.4vw} }
  @media (prefers-reduced-motion:reduce){ .card{transition:none} }
</style>
</head>
<body>
<div class="scene" id="scene">
  <div class="card" id="card">
    <div class="face front" id="front">
      <img class="base" id="base" src="${esc(baseSrc)}" alt="${esc(title)}">
      <div class="miss">№${number}<br>${esc(title)}<br><small>base art offline</small></div>
      <div class="layers">${overlay || ''}</div>
      <div class="foil"></div><div class="glare"></div>
    </div>
    <div class="face back">
      <div class="plate">
        <div>
          <div class="bteam">ripmaster3030studios &#9733; genesis</div>
          <div class="bt">${esc(title)}</div>
        </div>
        <div class="brule"></div>
        <div class="vit">
          <div><span class="k">Card</span><span class="v">&#8470;${number}</span></div>
          <div><span class="k">Rarity</span><span class="v">${esc(m.rarity || 'hero 1/1')}</span></div>
          <div><span class="k">Base ATK</span><span class="v">${m.atk == null ? '—' : m.atk}</span></div>
          <div><span class="k">Base DEF</span><span class="v">${m.def == null ? '—' : m.def}</span></div>
          <div><span class="k">Amplifier</span><span class="v">${esc(m.trigger || '—')}</span></div>
          <div><span class="k">Edition</span><span class="v">1 of 1</span></div>
        </div>
        <div class="brule"></div>
        <div class="lore">${esc(m.lore || '')}</div>
        <div class="foot"><span>$3030 &#183; SuperRare Liquid Edition</span><span>NFA</span></div>
      </div>
    </div>
  </div>
  <div class="hint">tap to flip &#8634;</div>
</div>
<script>
(function(){
  // Every one of these can throw in a sandboxed frame. None of them may take the card down.
  try {
    var root=document.documentElement, scene=document.getElementById('scene'), card=document.getElementById('card');
    var drag=false, moved=0;
    scene.addEventListener('pointerdown',function(){drag=true;moved=0;});
    addEventListener('pointerup',function(){ if(drag&&moved<8) card.classList.toggle('flipped'); drag=false; });
    scene.addEventListener('pointermove',function(e){
      var r=scene.getBoundingClientRect();
      var nx=((e.clientX-r.left)/r.width)*2-1, ny=((e.clientY-r.top)/r.height)*2-1;
      moved+=Math.abs(nx)+Math.abs(ny);
      root.style.setProperty('--px',nx.toFixed(3)); root.style.setProperty('--py',ny.toFixed(3));
    },{passive:true});
    scene.addEventListener('pointerleave',function(){ root.style.setProperty('--px',0); root.style.setProperty('--py',0); });
  } catch(e){}
  // Gateway chain: one dead gateway is not a dead card. Last resort is a legible plate,
  // never a blank frame — and the marketplace still has the image field regardless.
  try {
    var img=document.getElementById('base'), alt=${chain}, i=0;
    img.addEventListener('error',function(){
      if(i<alt.length){ img.src=alt[i++]; }
      else { document.getElementById('front').classList.add('dead'); }
    });
  } catch(e){}
})();
</script>
</body>
</html>
`;
}

const FILE_RE2 = /^\s*(\d{1,3})\s*[-–—]\s*(.+?)\s*\.(html?|gif|png|webp)$/i;
const cidPath = join(heroDir, 'cids.json');
/* ⛔ THE GENERATOR AND THE FILE DISAGREED ABOUT THE SHAPE, AND THE COST WAS SILENT. This read
 *   `{ "7": "Qm…" }` — the shape written in this file's own header — while scripts/hero-cids.mjs
 *   emits `{ cids: {...}, cidv1: {...}, files: {...} }`. Every lookup returned undefined, so all
 *   33 reported UNPINNED and every lens page would have been built with NO gateway chain: local
 *   copy only, i.e. a card that dies with the website. That is the exact failure the ipfs base
 *   exists to prevent, arrived at by a key name.
 * ⚑ Nothing errors when two files disagree about a shape — one side just reads undefined
 *   forever. Accept both, and assert the count below rather than trusting either. */
const CIDRAW = existsSync(cidPath) ? JSON.parse(readFileSync(cidPath, 'utf8')) : {};
const CIDS = CIDRAW.cids || CIDRAW;

const byNum = new Map();
for (const f of readdirSync(dir)) {
  const m = f.match(FILE_RE2); if (!m) continue;
  const number = +m[1]; if (number > HERO_MAX) continue;   // 34+ are field cards (ingest-deck.mjs)
  const ext = extname(f).toLowerCase();
  const e = byNum.get(number) || { number, title: m[2].trim(), base: null, overlay: null, size: 0 };
  if (ext === '.gif' || ext === '.png' || ext === '.webp') { e.base = f; e.size = statSync(join(dir, f)).size; }
  else { e.overlay = f; }
  e.title = e.title || m[2].trim();
  byNum.set(number, e);
}
let rows = [...byNum.values()].sort((a, b) => a.number - b.number);

/* ⛔ WITHOUT THIS THE 33 HAD NO LENS PAGES AT ALL, AND EVERY MINTED HERO'S `animation_url`
 *   FRAMED A 404. The builder only ever looked for hand-authored "07 - TITLE.gif" files in the
 *   repo root; none were ever written, so it printed "no hero sources" and exited 0 — a clean
 *   run that produced nothing, which is why nobody caught it. Meanwhile setCards published the
 *   art and eleven heroes minted, all pointing at pages that did not exist.
 * ⚑ The base art and the titles were never missing — they were in cards/deck-manifest.json the
 *   whole time, which is the same source hero-cids.mjs and build-cards-blob.mjs already read.
 *   Deriving from it means one list, no filename convention to get wrong, and a hand-authored
 *   file still WINS: an artist who writes "07 - TITLE.html" overrides the generated card, which
 *   is the whole point of the hero tier.
 * ⚠ Only fills GAPS. It must never overwrite an authored source. */
const manPath = join(rootDir, 'cards', 'deck-manifest.json');
if (existsSync(manPath)) {
  const heroes = (JSON.parse(readFileSync(manPath, 'utf8')).cards || [])
    .filter(c => c.band === 'hero' && +c.id >= 1 && +c.id <= HERO_MAX);
  let filled = 0;
  for (const c of heroes) {
    const n = +c.id, e = byNum.get(n);
    if (e && e.base) continue;                         // authored art wins
    const art = join(rootDir, 'cards', c.art || '');
    if (!c.art || !existsSync(art)) continue;
    byNum.set(n, { number: n, title: c.title || String(n), base: art,
                   overlay: e ? e.overlay : null, size: statSync(art).size, fromManifest: true });
    filled++;
  }
  if (filled) console.log(`deck-manifest supplied base art for ${filled} hero(es)`);
  rows = [...byNum.values()].sort((a, b) => a.number - b.number);
}

const MB = b => (b / 1048576).toFixed(1) + ' MB';
if (!rows.length) {
  console.log(`no hero sources (1–${HERO_MAX}) in ${dir}`);
  console.log('expected "07 - SOME TITLE.gif" (base) and/or "07 - SOME TITLE.html" (extra layers)');
  process.exit(0);
}
console.log(`hero sources: ${rows.length}`);
for (const r of rows) {
  const cid = CIDS[r.number] || CIDS[String(r.number)];
  const parts = [r.base ? 'base' : '\u2014', r.overlay ? '+html' : '     '].join(' ');
  console.log(`  ${String(r.number).padStart(2)}  ${parts}  ${(r.size ? MB(r.size) : '').padStart(8)}  ` +
              `${cid ? 'ipfs \u2713' : 'UNPINNED'}  "${r.title}"`);
}
const have = rows.map(r => r.number), missing = [];
for (let i = 1; i <= HERO_MAX; i++) if (!have.includes(i)) missing.push(i);
console.log(`\nhero coverage: ${rows.length}/${HERO_MAX}${missing.length ? ` \u00b7 still to come: ${missing.join(', ')}` : ' \u00b7 COMPLETE'}`);

const noBase = rows.filter(r => !r.base);
if (noBase.length) console.log(`\n\u26a0 ${noBase.length} hero(es) have NO base art (${noBase.map(r => r.number).join(', ')}). ` +
  'The base is the permanent record — an HTML-only hero has nothing to fall back to.');
const unpinned = rows.filter(r => !(CIDS[r.number] || CIDS[String(r.number)]));
if (unpinned.length) console.log(`\u26a0 ${unpinned.length} hero(es) UNPINNED (${unpinned.map(r => r.number).join(', ')}). ` +
  'Pin the base to IPFS and add the CID to cards/hero/cids.json before launch, or the card ' +
  'does not survive the site going down.');

if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); process.exit(0); }

mkdirSync(heroDir, { recursive: true });
/* ⛔ THIS WAS THE RETIRED DOMAIN UNTIL 2026-08-02, and it is the SAME DEFECT that was found in
 *   scripts/lens-cli.mjs the same day — the twin was missed. SITE lands in the hero lens's
 *   `animation_url` AND `external_url`, i.e. in the metadata a collector's card resolves through.
 *   Recoverable via setUrls(), but marketplaces cache metadata hard, so "recoverable" and "not
 *   wrong on the card for a week" are different things. Neither file ships to the CDN, and both
 *   write strings that end up on-chain: `npm run test:name` skipping `scripts/` is exactly why
 *   this survived, which is why the test now sweeps generator OUTPUT as well. */
/* ⚠ www, NOT the apex. The platform serves `www` as Production and 308s the apex to it, and the
 *   on-chain lensBaseUrl is already https://www.… — so an apex string here is one hop off the
 *   truth on every card, for no reason. */
const SITE = 'https://www.ripmaster3030studios.com';
for (const r of rows) {
  const cid = CIDS[r.number] || CIDS[String(r.number)] || null;
  const ext = r.base ? extname(r.base).toLowerCase() : '.gif';
  let localName = null;
  const baseAbs = r.base ? (isAbsolute(r.base) ? r.base : join(dir, r.base)) : null;
  if (baseAbs) { localName = `${r.number}${ext}`; copyFileSync(baseAbs, join(heroDir, localName)); }

  // Preference order for the DISPLAY source, most durable first. The metadata `image` is
  // always the ipfs:// URI when we have one — that is the copy that must outlive us.
  const chain = [];
  if (cid) for (const g of GATEWAYS) chain.push(g + cid);
  if (localName) chain.push(localName);
  if (INLINE && r.base) {
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/gif';
    chain.push(`data:${mime};base64,` + readFileSync(baseAbs).toString('base64'));
  }
  const baseSrc = chain[0] || '';
  const overlay = r.overlay ? readFileSync(join(dir, r.overlay), 'utf8') : '';

  writeFileSync(join(heroDir, `${r.number}.html`),
    shell({ number: r.number, title: r.title, baseSrc, fallbacks: chain.slice(1), overlay, meta: {} }));

  // the metadata the render-by-id contract will serve for this id
  writeFileSync(join(heroDir, `${r.number}.json`), JSON.stringify({
    name: `${r.title} \u00b7 \u2116${r.number}`,
    description: 'ripmaster3030studios \u2014 genesis hero lens, 1 of 1. NFA.',
    image: cid ? `ipfs://${cid}` : null,
    animation_url: `${SITE}/cards/hero/${r.number}.html`,
    external_url: `${SITE}/cards/${r.number}`,
    attributes: [
      /* ⛔ THIS SAID 'Season I'. Seasons were killed on 2026-08-01 — the pack schedule is TIERED —
       *   and the CONTRACT's copy of this string was caught and changed to 'Genesis' before
       *   deploy. The GENERATOR was left armed, which is this repo's most-repeated defect:
       *   patching output and leaving the thing that writes it. */
      { trait_type: 'Deck', value: 'Genesis' },
      { trait_type: 'Class', value: 'Hero 1/1' },
      { trait_type: 'Card', value: r.number },
      { trait_type: 'Live Lens', value: r.overlay ? 'yes' : 'no' },
    ],
  }, null, 1));
}
console.log(`\n\u2726 built ${rows.length} hero lenses \u2192 cards/hero/<n>.html (+ <n>.json metadata)`);
console.log(`  animation_url: ${SITE}/cards/hero/<n>.html`);
console.log('  image:         ipfs://<cid>  \u2014 the fallback that makes the card persist');

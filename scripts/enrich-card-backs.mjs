#!/usr/bin/env node
// Card backs become info devices + voting booths. Two things:
//   1. Write each card's factoid (cards/data/_factoids.json) into its dossier so
//      the back can fetch and print a real "did you know" about the card's topic.
//   2. Inject into every already-minted cards/<slug>.html the same additions the
//      template (_full.html) now carries: a "Why rated" trait-tag row, a factoid
//      block, and the Rarity Court voting bar (▲/⛨/▼ burn-to-vote on this card).
//
// Idempotent — pages already carrying `id="b-why"` are skipped. Re-run any time.
//   node scripts/enrich-card-backs.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { rootDir } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards'), dataDir = join(cardsDir, 'data');
const factoids = JSON.parse(readFileSync(join(dataDir, '_factoids.json'), 'utf8'));
const skip = new Set(['_full', '_template', 'index', 'battle', 'binder', 'lovebeing']);

const WHY_ROW = `\n            <span class="k">Why rated</span><span class="v" id="b-why" style="font-size:.78em;text-align:right;max-width:62%">—</span>`;
const FACT_DIV = `<div class="factoid" id="b-fact" style="margin-top:5%;font-size:.78em;line-height:1.55;color:#5a3413"></div>\n          `;
const COURT = `
  <div id="court" style="display:flex;align-items:center;justify-content:center;gap:9px;margin-top:8px;font-family:'Arial Black',Arial,sans-serif">
    <button id="v-up" type="button" aria-label="burn to promote" style="width:36px;height:36px;border-radius:9px;border:2px solid #0a2a17;background:#9be34f;color:#0a2a17;font-size:15px;cursor:pointer">▲</button>
    <b id="v-net" style="min-width:46px;text-align:center;font-size:14px;color:#eafff2;text-shadow:0 1px 2px #000">0</b>
    <button id="v-hodl" type="button" aria-label="burn to HODL" style="width:36px;height:36px;border-radius:9px;border:2px solid #06131f;background:#63b3ff;color:#04121f;font-size:14px;cursor:pointer">⛨</button>
    <button id="v-dn" type="button" aria-label="burn to demote" style="width:36px;height:36px;border-radius:9px;border:2px solid #2a0a0a;background:#ff6b57;color:#2a0a0a;font-size:15px;cursor:pointer">▼</button>
  </div>
  <div id="v-toast" style="text-align:center;font:11px 'Courier New',monospace;letter-spacing:.06em;color:#b8ffd6;opacity:.7;transition:opacity .25s;margin-top:5px;min-height:14px">the rarity court · burn $UR3030 to vote</div>`;
const WHY_FACT_JS = `\n    const _tags = (d.traits && d.traits.tags) || []; if (_tags.length) $('b-why').textContent = _tags.join(' · ');\n    if (d.factoid) $('b-fact').innerHTML = '<b style="letter-spacing:.08em">◉ DID YOU KNOW</b><br>' + d.factoid;`;
const voteJS = slug => `\n\n  // ─── the rarity court: burn $UR3030 to vote on THIS card (urm_court, same as the gallery) ───
  const SLUG = ${JSON.stringify(slug)};
  const V = () => { let r; try { r = JSON.parse(localStorage.getItem('urm_court')||'{}'); } catch { r = {}; }
    Object.keys(r).forEach(k => { if (typeof r[k] === 'number') r[k] = { net:r[k], hodl:0 }; }); return r; };
  const N = () => { const e = V()[SLUG] || { net:0, hodl:0 }; const el = $('v-net');
    if (el){ el.textContent = (e.net>0?'+':'')+e.net + (e.hodl>0?' ⛨'+e.hodl:''); el.style.color = e.net>0?'#9be34f':e.net<0?'#ff6b57':'#eafff2'; } };
  let vtm; const vsay = m => { const t = $('v-toast'); if(!t) return; t.textContent = m; t.style.opacity = 1;
    clearTimeout(vtm); vtm = setTimeout(() => { t.style.opacity = .6; t.textContent = 'the rarity court · burn $UR3030 to vote'; }, 2300); };
  const vote = k => { const v = V(), e = v[SLUG] || { net:0, hodl:0 };
    if (k==='up'){ e.net += 1; vsay('▲ 1 $UR3030 burned to promote'); }
    else if (k==='hodl'){ e.hodl += 1; vsay('⛨ 1 $UR3030 to HODL — buffers downvotes'); }
    else { if (e.hodl>0){ e.hodl -= 1; vsay('▼ absorbed by the HODL buffer — burn still counts'); } else { e.net -= 1; vsay('▼ 1 $UR3030 burned to demote'); } }
    v[SLUG] = e; try { localStorage.setItem('urm_court', JSON.stringify(v)); } catch {} N(); };
  $('v-up') && ($('v-up').onclick = () => vote('up'));
  $('v-hodl') && ($('v-hodl').onclick = () => vote('hodl'));
  $('v-dn') && ($('v-dn').onclick = () => vote('dn'));
  N();`;

let dossierN = 0, pageN = 0, skipped = 0;
for (const f of readdirSync(cardsDir)) {
  if (!f.endsWith('.html')) continue;
  const slug = f.slice(0, -5);
  if (skip.has(slug)) continue;

  // 1. factoid → dossier
  const dossierPath = join(dataDir, `${slug}.json`);
  if (factoids[slug] && existsSync(dossierPath)) {
    const d = JSON.parse(readFileSync(dossierPath, 'utf8'));
    if (d.factoid !== factoids[slug]) { d.factoid = factoids[slug]; writeFileSync(dossierPath, JSON.stringify(d, null, 2)); dossierN++; }
  }

  // 2. inject into the page
  const page = join(cardsDir, f);
  let html = readFileSync(page, 'utf8');
  if (html.includes('id="b-why"')) { skipped++; continue; }        // already enriched
  const before = html;
  html = html.replace('<span class="k">Rarity</span><span class="v" id="b-rarity">—</span>',
                      '<span class="k">Rarity</span><span class="v" id="b-rarity">—</span>' + WHY_ROW);
  html = html.replace('<div class="trigger-live"', FACT_DIV + '<div class="trigger-live"');
  html = html.replace('<div class="flip-hint">tap to flip ⟲</div>',
                      '<div class="flip-hint">tap to flip ⟲</div>' + COURT);
  html = html.replace("set('b-rarity', d.rarity);", "set('b-rarity', d.rarity);" + WHY_FACT_JS);
  html = html.replace('breathe(); setInterval(breathe, 45000);',
                      'breathe(); setInterval(breathe, 45000);' + voteJS(slug));
  if (html !== before) { writeFileSync(page, html); pageN++; }
  else console.warn(`! no anchors matched: ${f}`);
}
console.log(`✦ factoids → ${dossierN} dossiers · injected why/fact/voting → ${pageN} pages · ${skipped} already enriched`);

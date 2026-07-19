#!/usr/bin/env node
// Restyle every card's BACK (the flip-side dossier) into the vintage sports-card design:
// manila stock, the Ripmaster roundel bursting through torn paper where the ball goes, a
// jersey number, an upside-down trivia answer, a SEASON/LIFE stat table, and the bio.
// Preserves EVERY id the existing inline populate-JS writes to (b-title, b-lore, b-fact,
// b-rarity, b-why, b-wl, b-wag, b-burn, b-floor, b-live, b-omen, chain, b-atk/def/trig),
// links cards/cardback.css, and teaches the populate-JS to fill the upside-down answer.
// Idempotent (skips pages already carrying class="vb"). Run any time:  node scripts/restyle-backs.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { rootDir, statsFor, SEASON_TITLES } from './make-card.mjs';

const cardsDir = join(rootDir, 'cards');
const manifest = JSON.parse(readFileSync(join(cardsDir, 'manifest.json'), 'utf8'));
const rarityBy = Object.fromEntries(manifest.cards.map(c => [c.slug, c.rarity]));
const skip = new Set(['_full', '_template', '_back-preview', 'index', 'battle', 'binder']);

const TORN = '70.0,8.0 80.4,21.1 94.4,15.2 100.6,27.9 116.8,27.8 112.4,45.5 128.0,51.1 122.7,64.5 133.6,76.7 118.5,85.8 121.1,99.5 110.1,106.1 106.4,120.2 89.5,113.9 82.5,128.7 70.0,122.0 56.9,131.6 49.7,115.7 34.1,119.4 30.6,105.5 16.3,101.0 23.4,85.1 10.3,76.3 16.3,64.4 10.1,50.5 25.8,44.5 26.2,30.5 39.4,27.9 45.2,14.3 59.6,21.1';
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function backHTML({ name, num, of, season, seasonTitle, atk, def, trig, rarity, factoid, lore }) {
  const total = atk + def, nm = esc(name);
  const factHTML = factoid ? `<b style="letter-spacing:.08em">◉ DID YOU KNOW</b><br>${esc(factoid)}` : '';
  const loreHTML = lore ? esc(lore) : '';
  return `
        <div class="vb">
          <img class="vb-wm" src="../marquee-header.webp" alt="" aria-hidden="true" loading="lazy">
          <div class="vb-hdr">
            <svg class="vb-torn" viewBox="0 0 140 140" aria-hidden="true"><polygon points="${TORN}"/></svg>
            <img class="vb-disc" src="../ripmaster-roundel.svg" alt="" loading="lazy">
            <div class="vb-band">
              <div class="vb-team">Upperdeck ★ Ripmaster 3030</div>
              <div class="vb-name" id="b-title">${nm}</div>
            </div>
          </div>
          <div class="vb-qrow">
            <div class="vb-num">${num}</div>
            <div class="vb-qa">
              <div class="vb-q"><b>Q:</b> Identify the suspect.</div>
              <div class="vb-a"><span class="vb-al">A:</span> <span class="vb-flip" id="b-title-a">${nm}</span></div>
            </div>
          </div>
          <div class="vb-vitals">
            <div class="vb-vit"><span class="k">Base ATK</span><span class="v" id="b-atk">${atk}</span></div>
            <div class="vb-vit"><span class="k">Amplifier</span><span class="v hot" id="b-trig">${trig} ⚡</span></div>
            <div class="vb-vit"><span class="k">Base DEF</span><span class="v" id="b-def">${def}</span></div>
            <div class="vb-vit"><span class="k">Rarity</span><span class="v" id="b-rarity">${rarity}</span></div>
            <div class="vb-vit"><span class="k">Edition</span><span class="v">№${num} / ${of}</span></div>
            <div class="vb-vit"><span class="k">Debut</span><span class="v">${seasonTitle} · S${season}</span></div>
          </div>
          <div class="vb-stitle">Card Statistics</div>
          <table class="vb-stats"><thead><tr><th></th><th>ATK</th><th>DEF</th><th>Σ</th><th>W–L</th><th>WAG</th><th>BURN</th></tr></thead>
            <tbody>
              <tr><th>S${season}</th><td>${atk}</td><td>${def}</td><td>${total}</td><td id="b-wl">0–0</td><td id="b-wag">0</td><td id="b-burn">0</td></tr>
              <tr><th>LIFE</th><td>${atk}</td><td>${def}</td><td>${total}</td><td>0–0</td><td>0</td><td>0</td></tr>
            </tbody></table>
          <div class="vb-why">▸ <span id="b-why">—</span></div>
          <div class="vb-bio"><span id="b-fact">${factHTML}</span><span class="vb-lore" id="b-lore">${loreHTML}</span></div>
          <div class="vb-foot"><span>$UR3030 · SuperRare Liquid Edition</span><span class="vb-live" id="b-live">reading chain…</span></div>
          <span class="vb-hide" id="b-omen"></span><span class="vb-hide" id="b-floor"></span><span class="vb-hide" id="chain"></span>
        </div>
      `;
}

let done = 0, skipped = 0, missed = 0;
for (const f of readdirSync(cardsDir)) {
  if (!f.endsWith('.html')) continue;
  const slug = f.slice(0, -5);
  if (skip.has(slug)) continue;
  const fp = join(cardsDir, f);
  let h = readFileSync(fp, 'utf8');
  const alreadyVb = h.includes('class="vb"');

  // name + season/number/of come from EITHER the original dossier back (h1 + .sub) or an
  // already-restyled vb back (vb-name + Edition/Debut vitals), so this is safely re-runnable.
  const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  let name, seasonTitle, season, num, of;
  const h1 = h.match(/<h1 id="b-title">([\s\S]*?)<\/h1>/);
  const sub = h.match(/<div class="sub">([^<·]*?) · Season ([IVX]+) · №(\d+) of (\d+)<\/div>/);
  if (h1 && sub) {
    name = h1[1].trim(); seasonTitle = sub[1].trim(); season = ROMAN[sub[2]] || 1; num = +sub[3]; of = +sub[4];
  } else {
    const vn = h.match(/<div class="vb-name" id="b-title">([\s\S]*?)<\/div>/);
    const ed = h.match(/№(\d+) \/ (\d+)<\/span>/);
    const db = h.match(/Debut<\/span><span class="v">([^<·]+?) · S(\d+)<\/span>/);
    if (vn && ed && db) { name = vn[1].trim(); num = +ed[1]; of = +ed[2]; seasonTitle = db[1].trim(); season = +db[2]; }
  }
  if (!name || num == null) { console.warn(`  ! could not parse ${f}`); missed++; continue; }
  // pull the printed stats straight from the page so the table always matches the card
  const atk = +((h.match(/id="b-atk">(\d+)/) || [])[1] || 0);
  const def = +((h.match(/id="b-def">(\d+)/) || [])[1] || 0);
  const trig = ((h.match(/id="b-trig">([A-Z ]+?)\s*⚡/) || [])[1] || statsFor(slug).trigger).trim();
  let factoid = '', lore = '';
  const dp = join(cardsDir, 'data', `${slug}.json`);
  if (existsSync(dp)) { try { const d = JSON.parse(readFileSync(dp, 'utf8')); factoid = d.factoid || ''; lore = d.lore || ''; } catch {} }
  const inner = backHTML({ name: name.trim(), num, of, season, seasonTitle,
    atk, def, trig, rarity: rarityBy[slug] || '—', factoid, lore });

  // swap the whole back face inner, keep the back/card/scene closing tags + flip-hint
  const re = /(<div class="face back">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>\s*<div class="flip-hint">)/;
  if (!re.test(h)) { console.warn(`  ! no back block in ${f}`); missed++; continue; }
  h = h.replace(re, (_m, open) => `${open}${inner}</div>\n    </div>\n  </div>\n  <div class="flip-hint">`);

  // link the shared stylesheet
  if (!h.includes('cardback.css')) h = h.replace('</head>', '  <link rel="stylesheet" href="cardback.css">\n</head>');
  // teach the populate-JS to also fill the upside-down answer
  if (!h.includes("set('b-title-a'"))
    h = h.replace("if (d.title) { set('b-title', d.title.toUpperCase()); }",
                  "if (d.title) { set('b-title', d.title.toUpperCase()); set('b-title-a', d.title.toUpperCase()); }");

  writeFileSync(fp, h); done++;
}
console.log(`restyled ${done} · skipped ${skipped} (already) · missed ${missed}`);

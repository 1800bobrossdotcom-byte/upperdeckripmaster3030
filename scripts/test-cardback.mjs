/* ripmaster3030studios — THE BACK OF THE CARD.   node scripts/test-cardback.mjs
 *
 * Artist, 2026-08-05, with a screenshot of a card page: *"we need to make sure the backs are
 * treated with keylight effects and also fit to full size (here it is not) — backs of cards need
 * to be present in every viewer. every viewer should look like this snazzy one"* — and, asked
 * which part of it: *"the background and navs I mean and buttons etc."*
 *
 * Four separate defects, and every one of them was invisible to every check that existed:
 *
 * ⛔ 1. THE FRAME ATE THE CARD. `cards/cardback.css` sized the back's own frame in `cqw` — and a
 *       container query unit resolves against the nearest ANCESTOR container, so an element that
 *       declares `container-type` cannot query ITSELF. It fell back to the viewport: 13px of frame
 *       at 390px wide, 65px at 1920, with the card capped at ~460 either way. The stock filled
 *       71.5% of the card on a desktop. Every OTHER cqw in that file is on a descendant and was
 *       always right, which is exactly why nobody looked at this one.
 * ⛔ 2. THE BACK WAS NOT LIT. The front carries four layers that answer the pointer; the reverse
 *       carried none. In the press, `js/hero-card.js`'s `V.z < 0` branch RETURNED thirty lines
 *       above the lights — under a comment claiming "same stock, same light".
 * ⛔ 3. NO VIEWER COULD REACH A BACK AT ALL. `press.flip()` bumped a yaw target that `advance()`
 *       reassigns from the pointer every frame, so the card never turned while `faceUp` reported
 *       that it had. The designed back was being rasterised, uploaded and never shown.
 * ⛔ 4. THE STUDIO HAD TWO LOOKS. The card pages and the deck browser are printed objects; the
 *       folder, the bench and the lens were an acid-green terminal.
 *
 * ⚑ EVERY ASSERTION HERE WAS PROVED TO BITE BY REVERTING ITS FIX, and the numbers in the
 *   comments are from those runs. The two that could most easily pass for free say so on the line.
 * ⚠ Judge STRUCTURE and RELATIVE luma, never hue: this container's screenshot path rotates hue on
 *   canvas content (CLAUDE.md). Every measurement below is a difference between two frames taken
 *   through the same path.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = '/home/user/upperdeckripmaster3030';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.avif': 'image/avif' };
const PORT = 8969;

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ok   ' + msg + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + msg + (detail ? '  — ' + detail : '')); }
};

const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const b = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => srv.listen(PORT, r));
const U = p => `http://127.0.0.1:${PORT}/${p}`;

const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* decode a PNG buffer inside the page and hand back a luma profile. Doing it in the browser
 * keeps this file dependency-free, which is the constraint every renderer here works under. */
async function profile(page, buf, bands = 10) {
  return page.evaluate(async ([d, n]) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode();
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    const cols = new Array(n).fill(0), cnt = new Array(n).fill(0);
    let tot = 0, all = 0, sw = 0, sx = 0;
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
      const i = (y * c.width + x) * 4;
      const l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      const k = Math.min(n - 1, Math.floor(x / c.width * n));
      cols[k] += l; cnt[k]++; tot += l; all++;
      const w = Math.pow(Math.max(0, l - 205), 2);       // only the specular end of the range
      sw += w; sx += w * (x / c.width);
    }
    return { cols: cols.map((v, i) => (cnt[i] ? v / cnt[i] : 0)),
             mean: tot / Math.max(1, all),
             cx: sw > 0 ? sx / sw : 0.5 };
  }, [buf.toString('base64'), bands]);
}
const LR = p => {
  const L = p.cols.slice(0, 4).reduce((a, b) => a + b) / 4;
  const R = p.cols.slice(-4).reduce((a, b) => a + b) / 4;
  return L - R;
};

/* ═════ 1. THE FIT ══════════════════════════════════════════════════════════════════════════
 * ⚑ FOUR WIDTHS, AND THAT IS THE WHOLE POINT. A single viewport cannot see this defect: at 390px
 *   the old code was 92.4% correct and looked fine. The bug is that the frame tracks the WINDOW,
 *   so it is only visible as a spread ACROSS widths. (test:cab's recorded lesson, in reverse: a
 *   viewport chosen for convenience hides a defect as easily as it prevents one.)
 * ⚠ Proved to bite by restoring `padding:3.4cqw`: 4 failures, the stock filling 92.4 / 88.6 /
 *   76.1 / 71.5% at the four widths, against the 90% bar. */
console.log('\n── 1. the stock fills the card, at every width ──');
{
  const fills = [];
  for (const W of [390, 760, 1280, 1920]) {
    const page = await br.newPage({ viewport: { width: W, height: 900 } });
    await page.goto(U('cards/big-grin.html'), { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.getElementById('card').classList.add('flipped'));
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const b = document.querySelector('.face.back').getBoundingClientRect();
      const v = document.querySelector('.back .vb').getBoundingClientRect();
      return { card: b.width, stock: v.width, pad: getComputedStyle(document.querySelector('.face.back')).paddingLeft };
    });
    const pct = (m.stock / m.card) * 100;
    fills.push(pct);
    ok(pct >= 90, `${String(W).padStart(4)}px — the stock fills the card`,
       `${pct.toFixed(1)}% of ${m.card.toFixed(0)}px, frame ${m.pad}`);
    await page.close();
  }
  /* ⛔ AND THE SPREAD IS THE REAL ASSERTION. Four passes at four widths could still be four
   *   different frames; the defect WAS a frame that changed with the window. A percentage that
   *   holds to within a point across a 5x range is a frame measured against the card. */
  const spread = Math.max(...fills) - Math.min(...fills);
  ok(spread < 1.5, 'the frame is a fraction of the CARD, not of the window',
     `fill varies ${spread.toFixed(2)}% across 390-1920px (was 20.9%)`);
}

/* ═════ 2. THE KEY LIGHT ON THE DOM BACK ════════════════════════════════════════════════════
 * ⚑ MEASURED ON THE THING THAT HAS IT. The back is lifted out of a card page and parked flat, and
 *   the attitude is driven ON THE RIG — the card page's own rAF loop rewrites the root variables
 *   every frame, so an external set survives about 16ms and a sweep would measure the page's idle
 *   drift instead of the sweep. That mistake produced a "the light does not move" result twice.
 * ⚠ AND IT CARRIES ITS OWN CONTROL. "The pixels changed" is trivially true of a card that is
 *   simply being redrawn; the same sweep with the two layers switched off must go FLAT. */
console.log('\n── 2. the key light travels across the reverse ──');
{
  const page = await br.newPage({ viewport: { width: 700, height: 900 } });
  await page.goto(U('cards/big-grin.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const back = document.querySelector('.face.back');
    const host = document.createElement('div');
    host.id = 'rig';
    host.style.cssText = 'position:fixed;left:60px;top:60px;width:460px;height:690px;z-index:9999;'
      + 'background:#111;border-radius:22px;overflow:hidden';
    back.style.cssText += ';position:absolute;inset:0;transform:none;backface-visibility:visible;opacity:1';
    host.appendChild(back); document.body.appendChild(host);
    document.getElementById('scene').style.display = 'none';
  });
  const box = { x: 60, y: 60, width: 460, height: 690 };
  const at = async (px, py) => {
    await page.evaluate(([a, b]) => {
      const r = document.getElementById('rig');
      r.style.setProperty('--px', String(a)); r.style.setProperty('--py', String(b));
    }, [px, py]);
    await page.waitForTimeout(90);
    return profile(page, await page.screenshot({ clip: box }));
  };
  const left = await at(-1, 0), mid = await at(0, 0), right = await at(1, 0);
  const travel = Math.abs(right.cx - left.cx);
  ok(travel > 0.35, 'the lit region travels as the card turns',
     `specular centroid ${left.cx.toFixed(3)} → ${mid.cx.toFixed(3)} → ${right.cx.toFixed(3)}`);
  ok(LR(left) > 8 && LR(right) < -8, 'and it changes SIDES — the near side is the bright one',
     `left-minus-right ${LR(left).toFixed(1)} → ${LR(right).toFixed(1)}`);
  const up = await at(0, -1), down = await at(0, 1);
  ok(Math.abs(down.mean - up.mean) > 6, 'tilting toward the lamp brightens the whole sheet',
     `mean luma ${up.mean.toFixed(1)} → ${down.mean.toFixed(1)}`);

  /* the control. ⚠ This is the assertion that makes the three above mean anything: without it
   * they are satisfied by any change at all, including one the page would have made anyway. */
  await page.addStyleTag({ content: '.back::before,.back::after{display:none !important}' });
  const offL = await at(-1, 0), offR = await at(1, 0);
  ok(Math.abs(offR.cx - offL.cx) < 0.05 && Math.abs(LR(offL) - LR(offR)) < 2,
     'with the light layers off, the same sweep is flat',
     `centroid moves ${Math.abs(offR.cx - offL.cx).toFixed(3)}, balance moves ${Math.abs(LR(offL) - LR(offR)).toFixed(1)}`);
  await page.close();
}

/* ═════ 3. THE BACK IS NOT BAKED INTO THE TEXTURE ══════════════════════════════════════════
 * ⛔ The press lights its own reverse. A rasterised back carrying a frozen highlight would be lit
 *   TWICE — the "wash" this repo has recorded from three directions, arriving through the back
 *   door.
 * ⚑ THE ASSERTION IS THE PROPERTY, NOT THE FIX. `js/card-back.js` appends a rule that kills the
 *   live light layers, and measuring it revealed that the rule changes nothing TODAY: an SVG
 *   foreignObject rendered through an <img> does not composite mix-blend-mode in Chromium, so the
 *   plate comes out byte-identical either way. Asserting "the rule is present" would therefore be
 *   asserting our own source text; asserting "the plate is the same with the layers forced ON"
 *   keeps being true for the right reason, and fails the day an engine starts baking them —
 *   which is the actual risk being defended against.
 * ⚠ This is a same-input A/B through the same path, which is the only kind of colour measurement
 *   this container's screenshot path allows. */
console.log('\n── 3. no light reaches the rasterised plate ──');
{
  const page = await br.newPage({ viewport: { width: 700, height: 900 } });
  await page.goto(U('cards/binder.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    if (!window.CardBack) return { err: 'no CardBack' };
    const html = await (await fetch('big-grin.html')).text();
    const back = new DOMParser().parseFromString(html, 'text/html').querySelector('.face.back');
    if (!back) return { err: 'no .face.back on the card page' };
    const css = await (await fetch('cardback.css')).text();
    const once = async forceLightOn => {
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-99999px;top:0;width:520px;height:780px';
      const live = document.importNode(back, true);
      host.appendChild(live); document.body.appendChild(host);
      const extra = forceLightOn
        ? '\n.back::before,.back::after{display:block !important}'
        : '\n.back::before,.back::after{display:none !important;background:none !important}';
      const cv = await CardBack.fromElement(live, { w: 520, h: 780, css: css + extra });
      host.remove();
      return cv ? cv.toDataURL('image/png') : null;
    };
    const off = await once(false), on = await once(true);
    return { got: !!off, same: !!off && off === on, bytes: off ? off.length : 0 };
  });
  ok(!r.err && r.got, 'the designed back rasterises off the card page',
     r.err || `${r.bytes} bytes of PNG`);
  ok(!r.err && r.same, 'and forcing the live light layers ON changes nothing in it',
     r.err ? '' : 'byte-identical plates');
  await page.close();
}

/* ═════ 4. THE PRESS TURNS OVER, AND ITS REVERSE ANSWERS THE LIGHT ═════════════════════════
 * ⛔ `flip()` used to set a flag and nothing else. The assertion that bites is the YAW, not the
 *   flag: `faceUp` was false on the broken build too. (Third time this repo has had to write
 *   "assert the thing you mean" — see the [hidden] countdown and the reticle's clip-path.) */
console.log('\n── 4. the press actually turns over ──');
{
  const page = await br.newPage({ viewport: { width: 700, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await page.goto(U('cards/proof.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6500);
  const built = await page.evaluate(() => !!window.__proof);
  ok(built, 'the press builds', errs.length ? errs[0] : '');
  if (built) {
    await page.evaluate(() => window.__proof.flip());
    await page.waitForTimeout(1800);
    const st = await page.evaluate(() => {
      const q = window.__proof.probe();
      return { faceUp: q.faceUp, yaw: q.yaw };
    });
    ok(st.faceUp === false, 'flip() reports the reverse', `faceUp ${st.faceUp}`);
    ok(Math.abs(Math.abs(st.yaw) - Math.PI) < 0.25,
       'AND THE CARD IS ACTUALLY TURNED — the yaw, not the flag',
       `yaw ${st.yaw.toFixed(3)} (was 0.000 on the broken build)`);

    /* the reverse is a lit surface: sweeping the view must change how much light reaches it */
    const cvBox = await page.evaluate(() => {
      const b = document.querySelector('canvas').getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
    });
    const shot = async v => {
      await page.evaluate(x => window.__proof.pointer(x, 0, false), v);
      await page.waitForTimeout(900);
      await page.evaluate(() => { window.__proof.writeOn(1); window.__proof.render(); });
      await page.waitForTimeout(60);
      return profile(page, await page.screenshot({ clip: cvBox }), 8);
    };
    const a = await shot(-1.1), b = await shot(0), c = await shot(1.1);
    const spread = Math.max(a.mean, b.mean, c.mean) - Math.min(a.mean, b.mean, c.mean);
    ok(spread > 8, 'the reverse answers the key as the card turns',
       `mean luma ${a.mean.toFixed(1)} / ${b.mean.toFixed(1)} / ${c.mean.toFixed(1)}`);
  }
  await page.close();
}

/* ═════ 5. A BACK IN EVERY VIEWER ═══════════════════════════════════════════════════════════
 * ⚑ THE ASSERTION IS THAT A BACK ARRIVES, NOT THAT A BUTTON EXISTS. test:cab's headline lesson
 *   one level in: a text match cannot see a number that only exists once the page has laid out,
 *   and a chip that flips nothing is exactly what this whole pass was fixing. */
console.log('\n── 5. every viewer reaches a back ──');
{
  /* the folder — press path: the card is turned by the press itself */
  const page = await br.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto(U('cards/binder.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('.chip')].find(x => /placeholder/i.test(x.textContent));
    if (c) c.click();
  });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { const b = document.querySelector('.pk button'); if (b) b.click(); });
  await page.waitForTimeout(8000);
  const chip = await page.evaluate(() => !!document.querySelector('#vturn .rip-flip'));
  ok(chip, 'the folder offers a flip');
  if (chip) {
    await page.evaluate(() => document.querySelector('#vturn .rip-flip').click());
    /* ⚠ POLLED, NOT SLEPT. The turn is a SPRING and the folder is also running a starfield warp,
     *   so under SwiftShader it settles in wall-clock time that varies by seconds — a fixed sleep
     *   reads a card mid-turn (measured at yaw 0.466) and calls a working flip a regression. Same
     *   family as test:ronin's recorded timing flake: wait for the state, not for the clock. */
    const st = await page.evaluate(async () => {
      const t0 = Date.now();
      let q = null;
      while (Date.now() - t0 < 12000) {
        const p = window.__press && window.__press.press;
        q = p ? p.probe() : null;
        if (q && Math.abs(Math.abs(q.yaw) - Math.PI) < 0.2 && q.backIsDesigned) break;
        await new Promise(r => setTimeout(r, 250));
      }
      return q ? { yaw: q.yaw, designed: q.backIsDesigned } : null;
    });
    ok(st && Math.abs(Math.abs(st.yaw) - Math.PI) < 0.35, 'and the card turns over in it',
       st ? `yaw ${st.yaw.toFixed(3)}` : 'no press');
    /* ⛔ THE DESIGNED BACK, NOT THE STAND-IN. The press draws a generated reverse when a card has
     *   no page; a placeholder card HAS one, so anything else here means the rasteriser is not
     *   reaching it and the collector is looking at furniture instead of their card's dossier. */
    ok(st && st.designed === true, 'and it is the card OWN designed back, not the stand-in',
       st ? `backIsDesigned ${st.designed}` : '');
  }
  await page.close();
}
{
  /* the deck browser — no press per tile; the DOM path must carry it */
  const page = await br.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto(U('cards/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const chips = await page.evaluate(() => document.querySelectorAll('.tile .tflip').length);
  ok(chips > 100, 'every tile in the deck offers a flip', `${chips} chips`);
  await page.evaluate(() => {
    const t = document.querySelector('.tile .tflip');
    t.scrollIntoView({ block: 'center' }); t.click();
  });
  await page.waitForTimeout(7000);
  const st = await page.evaluate(() => {
    const a = document.querySelector('.tile .tile-art');
    const t = a && a.querySelector('.rip-turnable');
    const im = a && a.querySelector('.rip-rev img');
    return { turned: !!(t && t.classList.contains('rip-turned')),
             back: !!(im && im.src && im.src.length > 2000),
             href: location.pathname };
  });
  ok(st.href.endsWith('index.html'), 'flipping a tile does not navigate away from the deck', st.href);
  ok(st.back, 'the tile has a real back image behind it');
  ok(st.turned, 'and the tile is turned over');
  await page.close();
}
{
  /* the market bench — a card you own, on a page with no press at all */
  const page = await br.newPage({ viewport: { width: 1100, height: 900 } });
  await page.addInitScript(v => { try { localStorage.setItem('urm_vault', v); } catch (e) {} },
    JSON.stringify([{ slug: 'blue-boar' }]));
  await page.goto(U('cards/market.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const k = document.querySelector('.pk[data-key]'); if (k) k.click(); });
  await page.waitForTimeout(6000);
  const chip = await page.evaluate(() => !!document.querySelector('.sheet .rip-flip'));
  ok(chip, 'the market bench offers a flip on a card you own');
  if (chip) {
    await page.evaluate(() => document.querySelector('.sheet .rip-flip').click());
    await page.waitForTimeout(900);
    ok(await page.evaluate(() => !!document.querySelector('.heroimg .rip-turnable.rip-turned')),
       'and it turns over with no WebGL2 anywhere in the path');
  }
  await page.close();
}
{
  /* the lens — the viewer a collector gets inside the token */
  const page = await br.newPage({ viewport: { width: 700, height: 900 } });
  await page.goto(U('cards/lens3d.html?card=big-grin'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  ok(await page.evaluate(() => !!document.querySelector('.rip-flip')), 'the lens offers a flip');
  /* ⛔ AND IT STAYS WALLET-FREE AND LINK-FREE. superrare.html's rule, one page over: a framed
   *   surface may show the card and turn the card, and must not grow navigation. */
  const clean = await page.evaluate(() => ({
    links: document.querySelectorAll('a[href]').length,
    wallet: /walletconnect|ethereum\.request|eth_requestAccounts/i.test(document.documentElement.innerHTML),
  }));
  ok(clean.links === 0 && !clean.wallet, 'and the framed lens still has no links and no wallet',
     `${clean.links} links`);
  await page.close();
}

/* ═════ 6. ONE SKIN ═════════════════════════════════════════════════════════════════════════
 * ⚠ ASSERTED ON THE COMPUTED STYLE, NOT ON THE MARKUP. "The page links viewer.css" is satisfied
 *   by a 404; what the artist asked for is what he can see. */
console.log('\n── 6. every viewer wears the same skin ──');
for (const [path, tag] of [['cards/index.html', 'the deck'], ['cards/binder.html', 'the folder'],
                           ['cards/market.html', 'the bench'], ['cards/lens3d.html', 'the lens']]) {
  const page = await br.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(U(path), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const s = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const html = getComputedStyle(document.documentElement).backgroundColor;
    const rgb = (html.match(/\d+/g) || []).map(Number);
    return { stock: /svg\+xml/.test(cs.backgroundImage),
             purple: rgb.length >= 3 && rgb[0] > 90 && rgb[2] > 180 && rgb[1] < 90,
             sheet: [...document.styleSheets].some(x => (x.href || '').includes('viewer.css')) };
  });
  ok(s.stock && s.sheet, `${tag} is printed on the studio's stock`,
     `stock ${s.stock ? 'yes' : 'NO'} · sheet ${s.sheet ? 'yes' : 'NO'}`);
  await page.close();
}
/* the buttons: the pill is one definition, and a page that re-drew its own would drift */
{
  const page = await br.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(U('cards/binder.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const b = await page.evaluate(() => {
    const el = document.querySelector('.rip-btn');
    if (!el) return null;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, h: r.height };
  });
  ok(b && parseFloat(b.border) >= 3 && parseFloat(b.radius) >= 99 && b.h >= 44,
     'the nav is the studio pill — 3px keyline, fully round, 44px tall',
     b ? `${b.border} / ${b.radius} / ${b.h.toFixed(0)}px` : 'no .rip-btn');
  await page.close();
}

/* ═════ 7. THE GENERATOR AND THE OUTPUT AGREE ══════════════════════════════════════════════
 * ⛔ `scripts/ingest-batch.mjs` WRITES cards/index.html. The recorded failure is restyle-backs:
 *   the 2026-08-01 pass fixed the output and left the generator armed to put the defect back.
 * ⛔ And this template had a second, older version of the same class of bug: `\b` inside a
 *   template literal is the BACKSPACE character, not a word boundary, so the generator was
 *   emitting a regex that matches nothing. The shipped file only had the right bytes because it
 *   was hand-patched. Both directions are asserted, on the file rather than through a browser. */
console.log('\n── 7. the generator carries what the deck carries ──');
{
  const gen = await readFile(join(ROOT, 'scripts/ingest-batch.mjs'), 'utf8');
  const out = await readFile(join(ROOT, 'cards/index.html'), 'utf8');
  for (const needle of ['viewer.css', 'tflip', 'card-flip.js', 'rip-turnable', 'ownControl']) {
    ok(gen.includes(needle) && out.includes(needle),
       `both the generator and the deck carry "${needle}"`,
       `generator ${gen.includes(needle) ? 'yes' : 'NO'} · output ${out.includes(needle) ? 'yes' : 'NO'}`);
  }
  const a = gen.indexOf('const page = `');
  const tpl = gen.slice(a + 14, gen.indexOf('`;\n  writeFileSync'));
  ok(!tpl.includes('`'), 'no stray backtick ends the page template early',
     `${(tpl.match(/`/g) || []).length} found`);
  ok(!/[^\\]\\b/.test(tpl), 'every \\b in the template is escaped, so it stays a word boundary');
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
await br.close();
srv.close();
process.exit(fail ? 1 : 0);

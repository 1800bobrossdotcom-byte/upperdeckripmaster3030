/* THE EARNED TITLES — one ledger, one redeem surface, every cabinet (RipTitles).
 *
 * `docs/HERO-UNLOCKS.md` §4: eleven hero 1/1s across nine titles. This file is where a cleared
 * title is RECORDED and where a player is told how to redeem it. It owns no game logic — each
 * cabinet detects its own feats and calls `award()` — and it runs unmodified under node, so
 * `npm run test:titles` drives the shipping code rather than a model of it.
 *
 * ⛔ WHY ONE FILE AND NOT THREE. Six titles landed across DOGFIGHT, SECTION 9 and THE CITY on the
 *    same day. Three copies of "have I cleared this, and what do I tell the player" is three
 *    copies of the claim wording, three storage schemas and three chances for the one that nobody
 *    reopens to drift — which is this project's most frequently paid bill (`restyle-backs.mjs`,
 *    the retired renderers, the weapon tables). The cabinets keep their DETECTORS, because a feat
 *    is game logic; they share the LEDGER, because a claim is not.
 *
 * ⛔ THIS IS NOT THE AUTHORITY AND THE PANEL SAYS SO IN AS MANY WORDS. It is localStorage, editable
 *    in seconds, exactly like every score in this project. HERO-UNLOCKS §1 settles what that means
 *    and it is not a defect to be fixed here: the earned tier CANNOT be self-serve, because a
 *    browser that reports "I did it" to a contract is a browser that mints eleven 1/1s for whoever
 *    reads the source first. So the chain mints only against an EIP-712 `kind 2` voucher a human
 *    signed. ⚑ That inverts the problem usefully — because a person verifies the recorded run, this
 *    ledger does not have to be trustworthy. It has to be LEGIBLE: it tells you what the bar is,
 *    that you just cleared it, and what to do next. Nothing here awards anything.
 *
 * ⚠ SO "REDEEM" MEANS: you cleared it → the game says so → you post the unbroken capture → the
 *   studio verifies and signs → you mint the card yourself and pay the gas. The panel prints a
 *   claim slip with the title, the evidence the game measured and the time, so the run and the
 *   submission carry the same numbers. It never asks for a wallet, a key or a signature.
 *
 * ⚠ FAIL OPEN, WITH THE MUSIC-BUTTON EXCEPTION IN MIND. Everything degrades to "no panel, no
 *   badge, the game is exactly the game" — a dead store, no DOM, a sandboxed iframe. The one thing
 *   it must NOT do is show a REDEEM control that leads nowhere, so the badge is only ever created
 *   after a real award has been written.
 */
(function (root) {
  'use strict';

  /* The nine, and the SEATS column is load-bearing: THE STREAK has three (artist, 2026-08-06), so
   * eleven cards are awarded across nine titles. Anything that prints a count must use `cards()`,
   * not `TITLES.length` — that confusion is exactly what the whitepaper heading got wrong. */
  const TITLES = [
    { id: 'wire',     name: 'THE WIRE',              game: 'DOGFIGHT',    seats: 1,
      cond: 'Pass every boost gate on the map in one match without taking a hit.' },
    { id: 'deadstick', name: 'DEAD STICK',           game: 'DOGFIGHT',    seats: 1,
      cond: 'Win a match having never pressed boost.' },
    { id: 'onemag',   name: 'ONE MAG',               game: 'SECTION 9',   seats: 1,
      cond: 'Win a round with more kills than reloads.' },
    { id: 'ghost',    name: 'GHOST WALK',            game: 'SECTION 9',   seats: 1,
      cond: 'Take a round on a baked level without ever being the first to fire.' },
    { id: 'openair',  name: 'OPEN AIR',              game: 'RIP ROCKETER', seats: 1,
      cond: 'Reach Tier IV on one life.' },
    { id: 'facility', name: 'THE FACILITY IS CLOSED', game: 'RIP ROCKETER', seats: 1,
      cond: 'Clear every emplacement in a single tier.' },
    { id: 'streak',   name: 'THE STREAK',            game: 'CLOUD RACER', seats: 3,
      cond: 'Win 33 races in a row — 6 pilots, 3 laps or longer.' },
    { id: 'deadair',  name: 'DEAD AIR',              game: 'THE CITY',    seats: 1,
      cond: 'As the bird: 300 m in one unbroken glide, no wingbeat, never above 40 m.' },
    { id: 'bothends', name: 'BOTH ENDS',             game: 'THE CITY',    seats: 1,
      cond: 'Plant a card from the air as the bird, then take that same card back as the squirrel.' },
  ];
  const byId = {};
  for (const t of TITLES) byId[t.id] = t;
  const cards = () => TITLES.reduce((n, t) => n + t.seats, 0);      // 11, not 9

  const KEY = 'urm_titles';
  let MEM = null;                                    // test seam
  function store() { if (MEM) return MEM; try { return root.localStorage || null; } catch (e) { return null; } }
  function readAll() {
    const s = store(); if (!s) return {};
    try { const v = JSON.parse(s.getItem(KEY) || '{}'); return (v && typeof v === 'object') ? v : {}; }
    catch (e) { return {}; }
  }
  function writeAll(o) { const s = store(); if (!s) return; try { s.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  const cleared = id => readAll()[id] || null;
  const all = () => TITLES.map(t => ({ ...t, record: cleared(t.id) }));

  /* Record a clear. IDEMPOTENT — the FIRST clear is the one that counts, because the claim is
   * about a run that happened and a second identical award would only move the timestamp away
   * from the recording the player actually kept. Returns the record, or null if the id is unknown
   * (a typo in a detector must not invent a title). */
  function award(id, evidence, when) {
    const t = byId[id]; if (!t) return null;
    const db = readAll();
    if (db[id]) return db[id];
    db[id] = { id, at: when || nowISO(), evidence: evidence || {} };
    writeAll(db);
    try { badge(); toast(t); } catch (e) {}
    return db[id];
  }
  function nowISO() { try { return new Date().toISOString(); } catch (e) { return ''; } }
  function reset(id) { const db = readAll(); if (id) delete db[id]; else { writeAll({}); return; } writeAll(db); }

  /* ── the claim slip. One string the player can copy into their submission, carrying the same
   *    numbers the game measured, so the post and the run agree. */
  function slip(id) {
    const t = byId[id], r = cleared(id); if (!t || !r) return '';
    const ev = Object.keys(r.evidence || {}).map(k => k + '=' + r.evidence[k]).join(' · ');
    return [
      'ripmaster3030studios — EARNED TITLE CLAIM',
      'title:   ' + t.name + (t.seats > 1 ? '  (' + t.seats + ' seats)' : ''),
      'game:    ' + t.game,
      'rule:    ' + t.cond,
      'cleared: ' + r.at,
      ev ? 'measured: ' + ev : '',
      '',
      'Attach the unbroken screen capture of the whole run. The studio verifies it and signs a',
      'kind-2 voucher; you mint the 1/1 to your own wallet and pay the gas.',
    ].filter(Boolean).join('\n');
  }

  // ══ UI ═══════════════════════════════════════════════════════════════════════════════════════
  const doc = () => (typeof document !== 'undefined' ? document : null);
  let styled = false;
  function css() {
    if (styled || !doc()) return; styled = true;
    const s = doc().createElement('style');
    /* Scoped to .rt-* and shipped with the module, because the six host pages have six separate
     * inline stylesheets and none of them loads a shared sheet. ⚠ Every rule that sets `display`
     * carries its own [hidden] companion — these pages have no global `[hidden]{display:none
     * !important}` (mobile.css is not loaded by the cabinets) and this repo has paid for that
     * three times. */
    s.textContent = `
.rt-badge{position:fixed;left:12px;top:12px;z-index:2147483000;font:bold 11px/1.2 ui-monospace,Menlo,monospace;
 letter-spacing:.1em;background:linear-gradient(90deg,#ff8a1a,#ff2ad9);color:#fff;border:0;border-radius:9px;
 padding:0 12px;min-height:44px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.rt-badge[hidden]{display:none}
.rt-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(6,10,16,.82);display:flex;align-items:center;
 justify-content:center;padding:16px;overflow:auto}
.rt-ov[hidden]{display:none}
.rt-p{background:#f7f3ea;color:#16202b;max-width:560px;width:100%;border-radius:14px;padding:18px;
 border:2px solid #b8007e;box-shadow:0 24px 60px rgba(0,0,0,.5);font:14px/1.55 ui-sans-serif,system-ui,sans-serif}
.rt-p h2{font:bold 20px/1.1 ui-monospace,Menlo,monospace;letter-spacing:.06em;margin:0 0 2px}
.rt-p .rt-g{font:bold 10px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#2b7fa8;margin-bottom:10px}
.rt-p .rt-c{background:#fff;border:1px solid rgba(13,34,51,.18);border-radius:9px;padding:9px 11px;margin:8px 0}
.rt-p pre{white-space:pre-wrap;word-break:break-word;font:11px/1.5 ui-monospace,Menlo,monospace;margin:0}
.rt-p .rt-n{font-size:12px;color:#4a6376;margin-top:10px}
.rt-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.rt-row button{min-height:44px;padding:0 14px;border-radius:9px;border:1.5px solid #16202b;background:#16202b;
 color:#fff;font:bold 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;cursor:pointer}
.rt-row button.alt{background:transparent;color:#16202b}
.rt-li{border-top:1px solid rgba(13,34,51,.14);padding:7px 0;font-size:12.5px}
.rt-li b{font-family:ui-monospace,Menlo,monospace;letter-spacing:.04em}
.rt-li .rt-s{float:right;font:bold 10px/1.6 ui-monospace,Menlo,monospace;letter-spacing:.1em}
.rt-li.on .rt-s{color:#0b6b38}.rt-li.off .rt-s{color:#8aa0b0}
.rt-toast{position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:2147483002;
 background:linear-gradient(90deg,#ff8a1a,#ff2ad9);color:#fff;padding:12px 18px;border-radius:11px;
 font:bold 13px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.08em;box-shadow:0 10px 30px rgba(0,0,0,.4);
 text-align:center;max-width:88vw}
.rt-toast[hidden]{display:none}`;
    (doc().head || doc().documentElement).appendChild(s);
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let ovEl = null, badgeEl = null;

  /* ⛔ THE BADGE ONLY EXISTS ONCE SOMETHING HAS BEEN CLEARED. A permanent REDEEM control on a page
   * where nothing has been earned is a button that leads nowhere, and `theme.js` already records
   * why that is the one failure mode worse than absence: the visitor presses it, gets nothing, and
   * concludes the site is broken. It is also one more fixed element competing for a corner, which
   * `banner.js` and the music pill have each cost this project a day over. */
  function badge() {
    if (!doc() || !doc().body) return;
    const any = TITLES.some(t => cleared(t.id));
    if (!any) { if (badgeEl) badgeEl.hidden = true; return; }
    css();
    if (!badgeEl) {
      badgeEl = doc().createElement('button');
      badgeEl.className = 'rt-badge'; badgeEl.type = 'button';
      badgeEl.setAttribute('aria-label', 'earned titles — how to redeem');
      badgeEl.onclick = () => open();
      doc().body.appendChild(badgeEl);
    }
    const n = TITLES.filter(t => cleared(t.id)).length;
    badgeEl.textContent = '◆ ' + n + ' TITLE' + (n === 1 ? '' : 'S') + ' — REDEEM';
    badgeEl.hidden = false;
  }

  function toast(t) {
    if (!doc() || !doc().body) return; css();
    const el = doc().createElement('div');
    el.className = 'rt-toast';
    el.innerHTML = '◆ ' + esc(t.name) + ' — CLEARED<br><span style="font-weight:normal;font-size:11px">' +
      esc(t.game) + ' · press REDEEM, top left, for how to claim it</span>';
    doc().body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 6000);
  }

  function open(focusId) {
    if (!doc() || !doc().body) return null; css();
    if (!ovEl) {
      ovEl = doc().createElement('div');
      ovEl.className = 'rt-ov';
      ovEl.addEventListener('click', e => { if (e.target === ovEl) close(); });
      doc().body.appendChild(ovEl);
    }
    const done = TITLES.filter(t => cleared(t.id));
    const focus = focusId && cleared(focusId) ? focusId : (done[0] && done[0].id);
    const t = focus ? byId[focus] : null;
    ovEl.innerHTML = '<div class="rt-p">' +
      (t ? '<h2>' + esc(t.name) + '</h2><div class="rt-g">' + esc(t.game) +
        (t.seats > 1 ? ' · ' + t.seats + ' SEATS' : ' · ONE OWNER') + '</div>' +
        '<div class="rt-c"><pre>' + esc(slip(t.id)) + '</pre></div>' +
        '<div class="rt-row"><button type="button" data-rt="copy">COPY CLAIM SLIP</button>' +
        '<button type="button" class="alt" data-rt="close">CLOSE</button></div>'
        : '<h2>EARNED TITLES</h2><div class="rt-g">NOTHING CLEARED YET</div>') +
      '<div class="rt-n"><b>Your browser cannot award this and does not pretend to.</b> Every score ' +
      'in these games lives in your own browser and can be edited in seconds, so the studio is the ' +
      'judge: post the unbroken capture of the run, we verify it and sign a voucher, and <b>you</b> ' +
      'mint the card to <b>your</b> wallet and pay the gas. Nine titles, ' + cards() + ' cards.</div>' +
      TITLES.map(x => { const c = cleared(x.id);
        return '<div class="rt-li ' + (c ? 'on' : 'off') + '"><span class="rt-s">' + (c ? 'CLEARED' : 'OPEN') +
          '</span><b>' + esc(x.name) + '</b> · ' + esc(x.game) + (x.seats > 1 ? ' · ' + x.seats + ' seats' : '') +
          '<br><span style="color:#4a6376">' + esc(x.cond) + '</span></div>'; }).join('') +
      '</div>';
    ovEl.hidden = false;
    const p = ovEl.querySelector('[data-rt="copy"]');
    if (p) p.onclick = () => { try { root.navigator.clipboard.writeText(slip(focus)); p.textContent = 'COPIED'; } catch (e) { p.textContent = 'SELECT & COPY ABOVE'; } };
    const c = ovEl.querySelector('[data-rt="close"]'); if (c) c.onclick = close;
    return ovEl;
  }
  function close() { if (ovEl) ovEl.hidden = true; }

  /* Called by each cabinet once, on load. Safe to call twice — `badge()` is idempotent and there
   * is no destructive read here, which is the `crpc-ui.mount()` lesson applied in advance. */
  function mount() {
    try {
      if (root.self !== root.top) return;    // card lenses render in sandboxed frames; not there
    } catch (e) { return; }
    try { badge(); } catch (e) {}
  }

  const API = { TITLES, byId, cards, award, cleared, all, slip, reset, open, close, mount, badge,
    KEY, _mem: o => { MEM = o; } };
  root.RipTitles = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (doc()) {
    if (doc().readyState !== 'loading') setTimeout(mount, 0);
    else doc().addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : globalThis);

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

  /* TEN TITLES, ELEVEN CARDS, and the SEATS column is what makes those different numbers. Anything
   * that prints a count must use `cards()`, not `TITLES.length` — that confusion is exactly what the
   * whitepaper heading got wrong.
   * ⚑ `cards` IS WHICH HERO IDS THE TITLE MINTS, and the earned band is 23-33 (HERO-UNLOCKS: 1-11
   *   auction, 12-22 gacha, 23-33 earned). Eleven seats, eleven ids, allocated in list order so the
   *   map is derivable rather than remembered — `npm run test:titles` asserts the band, that every
   *   id is distinct, and that the count equals `cards()`.
   * ⚠ WHICH ART GOES WITH WHICH FEAT IS THE ARTIST'S TO SWAP, and nothing is frozen until a voucher
   *   is SIGNED against an id — the id is inside the digest, so after that it cannot move. Swap
   *   before signing, never after. ⚠ Card 29 is titled after a real living artist; that pairing in
   *   particular is his call, not a default to inherit. */
  const TITLES = [
    { id: 'wire',     name: 'THE WIRE',              game: 'DOGFIGHT',    seats: 1, cards: [23],
      cond: 'Pass every boost gate on the map in one match without taking a hit.' },
    { id: 'deadstick', name: 'DEAD STICK',           game: 'DOGFIGHT',    seats: 1, cards: [24],
      cond: 'Win a match having never pressed boost.' },
    { id: 'onemag',   name: 'ONE MAG',               game: 'SECTION 9',   seats: 1, cards: [25],
      cond: 'Win a round with more kills than reloads.' },
    { id: 'ghost',    name: 'GHOST WALK',            game: 'SECTION 9',   seats: 1, cards: [26],
      cond: 'Take a round on a baked level without ever being the first to fire.' },
    /* ⛔ THESE TWO REPLACED OPEN AIR AND THE FACILITY IS CLOSED, AND THE REASON IS NOT TASTE.
     * Those two were listed here and `riprocketer.html` did not load this file at all, so nothing
     * could ever award them — listed and unclaimable on the surface that hands out 1/1s. The
     * artist's 2026-08-06 directive was to turn earned cards into points and combo unlocks, and
     * the budget is fixed at 11 cards, so the two slots that were already dead are the only ones
     * that can change without deleting a title that works. See docs/HERO-UNLOCKS.md §4.
     * ⚠ Both are MEASURED, not guessed — the conditions and their costs are in that doc. */
    { id: 'twomillion', name: 'TWO MILLION FEET',    game: 'RIP ROCKETER', seats: 1, cards: [27],
      cond: 'Post a run of 2,000,000 points — clearing the whole facility scores about 690,000.' },
    /* ⛔ ADDED 2026-08-07, AND IT IS THE ANSWER TO A REAL REPORT. Artist: "riprocketer I cleared 2
     * million earlier, so I earned a 1/1. now someone earned 7 million+ and then the same 2 million
     * award was given to them." TWO MILLION FEET is ONE seat and it is gone; a bigger run is not a
     * second copy of a smaller title, it is a bar of its own. The name is HERO-UNLOCKS §4's own
     * (drafted there at 5,000,000); the artist's number is 7,000,000, so that is the bar. */
    { id: 'abovetheweather', name: 'ABOVE THE WEATHER', game: 'RIP ROCKETER', seats: 1, cards: [28],
      cond: 'Post a run of 7,000,000 points — past the facility, past the wave table, on attention alone.' },
    { id: 'coldbarrel', name: 'COLD BARREL',         game: 'RIP ROCKETER', seats: 1, cards: [29],
      cond: 'Clear one whole tier having fired only while OVERDRIVE was lit.' },
    /* ⚠ THREE SEATS BECAME TWO, and that is what pays for ABOVE THE WEATHER. The tier's budget is a
     * fixed ELEVEN cards, so a tenth title has to be funded from somewhere — and HERO-UNLOCKS §4¾
     * already names this as the option that frees exactly one card. It removes no published title:
     * deleting one would be the studio taking a prize back, and nothing here had claimed a seat. */
    { id: 'streak',   name: 'THE STREAK',            game: 'CLOUD RACER', seats: 2, cards: [30, 31],
      cond: 'Win 33 races in a row — 6 pilots, 3 laps or longer.' },
    { id: 'deadair',  name: 'DEAD AIR',              game: 'THE CITY',    seats: 1, cards: [32],
      cond: 'As the bird: 300 m in one unbroken glide, no wingbeat, never above 40 m.' },
    { id: 'bothends', name: 'BOTH ENDS',             game: 'THE CITY',    seats: 1, cards: [33],
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

  /* ══ THE SEATS THAT ARE ALREADY GONE ═══════════════════════════════════════════════════════
   * ⛔ AN EARNED TITLE IS A 1/1 AND THIS FILE COULD HAND IT OUT TWICE. Artist, 2026-08-07: "the
   *    awards need to only be claimed once… I cleared 2 million earlier, so I earned a 1/1. now
   *    someone earned 7 million+ and then the same 2 million award was given to them." He is right,
   *    and the cause is structural rather than a bug in `award()`: the ledger is per-BROWSER, so
   *    every browser starts from zero and re-issues every title in the set. Idempotence within one
   *    browser is not scarcity across all of them.
   * ⚑ SO THE ROSTER OF TAKEN SEATS IS A COMMITTED FILE THE STUDIO WRITES, NOT AN ENDPOINT. There is
   *   nothing for a player to send: the claim is verified by a person off-site and the only write
   *   that ever happens is the studio's, at the moment it signs a kind-2 voucher. A committed file
   *   is a write it already knows how to make, it cannot be down, and — the load-bearing half —
   *   ⛔ A CLIENT CAN NEVER WRITE IT. If a browser could close a title, one visitor could lock
   *   everyone out of all eleven cards in an afternoon, which is a strictly worse failure than the
   *   one being fixed.
   * ⚠ IT LOADS ASYNC, SO `closed` IS DERIVED AND NEVER STORED. A run can finish before the roster
   *   arrives; baking "closed" into the record at award time would freeze whichever answer won the
   *   race, and this repo has paid for two representations of one fact before (`CardView.flip()`
   *   held a `faceUp` flag beside the angle and the flag lied). The record says the run happened;
   *   the roster says whether a seat is left; the panel asks both, every time it paints.
   * ⚠ FAILS OPEN AND SAYS SO. No fetch, a 404, offline ⇒ seats are treated as UNKNOWN, not as open:
   *   the panel prints "seat status unread" rather than promising a card that may be gone. */
  const ROSTER_URL = '/data/titles-claimed.json';
  let ROSTER = { loaded: false, taken: {} };
  function roster() { return ROSTER; }
  function setRoster(o) {                                   // test seam + the fetch's landing point
    const t = (o && o.taken && typeof o.taken === 'object') ? o.taken : {};
    const clean = {};
    for (const k in t) { const n = Math.max(0, Math.floor(+t[k] || 0)); if (byId[k] && n > 0) clean[k] = n; }
    ROSTER = { loaded: true, taken: clean, updated: (o && o.updated) || '' };
    try { badge(); if (ovEl && !ovEl.hidden) open(); } catch (e) {}
    return ROSTER;
  }
  function loadRoster() {
    if (typeof fetch !== 'function') return Promise.resolve(ROSTER);
    return fetch(ROSTER_URL, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => (j ? setRoster(j) : ROSTER))
      .catch(() => ROSTER);
  }
  const takenOf = id => (ROSTER.taken[id] || 0);
  const seatsOpen = id => { const t = byId[id]; if (!t) return 0; return Math.max(0, t.seats - takenOf(id)); };
  /* ⚠ UNKNOWN IS NOT OPEN AND IT IS NOT CLOSED. Three states, because collapsing them means either
   *   promising a card that is gone or refusing one that is not. */
  const seatState = id => (!ROSTER.loaded ? 'unread' : (seatsOpen(id) > 0 ? 'open' : 'closed'));

  const cleared = id => readAll()[id] || null;
  const all = () => TITLES.map(t => ({ ...t, record: cleared(t.id), open: seatsOpen(t.id),
    taken: takenOf(t.id), state: seatState(t.id) }));

  /* Record a clear. IDEMPOTENT — the FIRST clear is the one that counts, because the claim is
   * about a run that happened and a second identical award would only move the timestamp away
   * from the recording the player actually kept. Returns the record, or null if the id is unknown
   * (a typo in a detector must not invent a title). */
  /* ⛔ A CLOSED TITLE IS STILL RECORDED, AND THAT IS DELIBERATE. The run happened; pretending it
   *   did not would be the site lying about something the player just watched. What changes is what
   *   it is told: a seat that is gone gets "TAKEN", not a claim slip. ⚑ Handing out a slip for a
   *   closed title is `theme.js`'s worst failure mode with real value attached — a control that
   *   leads nowhere, except here "nowhere" is a collector posting a capture for a card that cannot
   *   be minted. The refusal has to be at the moment of the clear, not at the moment of the mint. */
  function award(id, evidence, when) {
    const t = byId[id]; if (!t) return null;
    const db = readAll();
    if (db[id]) return db[id];
    db[id] = { id, at: when || nowISO(), evidence: evidence || {} };
    writeAll(db);
    try { badge(); toast(t); } catch (e) {}
    /* ⚑ THE CARD IS THE POINT, AND THIS IS WHERE IT BECOMES ONE. `js/hero-claim.js` listens: if the
     * studio has already signed a voucher to this wallet, the card POPS UP with a MINT button
     * instead of the player being left with a piece of paper. Dispatched even when no listener is
     * loaded — an event nobody hears costs nothing, and wiring it into `award()` means every
     * cabinet gets the reveal without a sixth edit. */
    try { if (root.dispatchEvent && typeof CustomEvent === 'function')
      root.dispatchEvent(new CustomEvent('urm:title-cleared', { detail: { id: id, name: t.name } })); } catch (e) {}
    return db[id];
  }
  /* Everything a caller needs to know about one title in one read, so no surface has to combine
   * "cleared" and "is there a seat" itself and get the combination wrong. */
  function status(id) {
    const t = byId[id]; if (!t) return null;
    const st = seatState(id);
    return { id, name: t.name, game: t.game, seats: t.seats, taken: takenOf(id),
      open: seatsOpen(id), state: st, record: cleared(id),
      redeemable: !!cleared(id) && st !== 'closed' };
  }
  function nowISO() { try { return new Date().toISOString(); } catch (e) { return ''; } }
  function reset(id) { const db = readAll(); if (id) delete db[id]; else { writeAll({}); return; } writeAll(db); }

  /* ── the claim slip. One string the player can copy into their submission, carrying the same
   *    numbers the game measured, so the post and the run agree. */
  function slip(id) {
    const t = byId[id], r = cleared(id); if (!t || !r) return '';
    const ev = Object.keys(r.evidence || {}).map(k => k + '=' + r.evidence[k]).join(' · ');
    const st = seatState(id);
    /* ⛔ NO SLIP FOR A CLOSED TITLE. A claim slip is an instruction to go and post a capture; issuing
     *   one for a card that has already been minted sends a collector to do work for nothing, and
     *   they would rightly read the reply as the studio going back on it. Say it here instead. */
    if (st === 'closed') return [
      'ripmaster3030studios — THIS TITLE IS CLOSED',
      'title:   ' + t.name + '  (' + t.seats + ' seat' + (t.seats > 1 ? 's' : '') + ', all taken)',
      'game:    ' + t.game,
      'rule:    ' + t.cond,
      'you cleared it: ' + r.at,
      ev ? 'measured: ' + ev : '',
      '',
      'You did the thing. The card is gone — an earned title is a 1/1 and the first claimant',
      'takes it. There is nothing to submit for this one; the other open titles are listed below.',
    ].filter(Boolean).join('\n');
    return [
      'ripmaster3030studios — EARNED TITLE CLAIM',
      'title:   ' + t.name + (t.seats > 1 ? '  (' + t.seats + ' seats, ' + seatsOpen(id) + ' open)' : ''),
      'game:    ' + t.game,
      /* ⚑ THE CARD ID IS ON THE SLIP because it is what the voucher is SIGNED AGAINST — the id is
       * inside the EIP-712 digest, so the run, the slip and the signature all have to name the same
       * one, and the only way to guarantee that is for the player's copy to carry it too. */
      'card:    #' + t.cards.join(' / #') + '  (the earned band is 23-33)',
      'rule:    ' + t.cond,
      'cleared: ' + r.at,
      ev ? 'measured: ' + ev : '',
      st === 'unread' ? 'seats:   NOT READ — the roster did not load; a seat may already be gone' : '',
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
.rt-li.gone{opacity:.62}.rt-li.gone .rt-s{color:#a8202a}.rt-li.gone b{text-decoration:line-through}
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
    /* ⚠ THE BADGE COUNTS WHAT CAN ACTUALLY BE REDEEMED. Saying "1 TITLE — REDEEM" over a seat that
     *   is gone is the same broken promise one layer out; a cleared-but-closed title still opens
     *   the panel, it just says so on the button. */
    const live = TITLES.filter(t => cleared(t.id) && seatState(t.id) !== 'closed').length;
    const n = TITLES.filter(t => cleared(t.id)).length;
    badgeEl.textContent = live ? ('◆ ' + live + ' TITLE' + (live === 1 ? '' : 'S') + ' — REDEEM')
      : ('◆ ' + n + ' CLEARED — SEAT' + (n === 1 ? '' : 'S') + ' TAKEN');
    badgeEl.hidden = false;
  }

  function toast(t) {
    if (!doc() || !doc().body) return; css();
    const closed = seatState(t.id) === 'closed';
    const el = doc().createElement('div');
    el.className = 'rt-toast';
    el.innerHTML = closed
      ? '◆ ' + esc(t.name) + ' — CLEARED, BUT TAKEN<br><span style="font-weight:normal;font-size:11px">' +
        esc(t.game) + ' · this 1/1 has an owner. Nothing to submit — see REDEEM for what is open</span>'
      : '◆ ' + esc(t.name) + ' — CLEARED<br><span style="font-weight:normal;font-size:11px">' +
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
    /* ⚠ FOCUS A REDEEMABLE ONE FIRST. Opening on a closed title when an open one is also cleared
     *   buries the thing the player can act on under the thing they cannot. */
    const live = done.filter(t => seatState(t.id) !== 'closed');
    const focus = focusId && cleared(focusId) ? focusId
      : ((live[0] || done[0]) && (live[0] || done[0]).id);
    const t = focus ? byId[focus] : null;
    const st = t ? seatState(t.id) : '';
    const SEATLINE = x => {
      const s = seatState(x.id), o = seatsOpen(x.id);
      if (s === 'unread') return x.seats > 1 ? x.seats + ' seats' : 'one owner';
      if (s === 'closed') return x.seats > 1 ? 'all ' + x.seats + ' seats taken' : 'taken';
      return x.seats > 1 ? (o + ' of ' + x.seats + ' seats open') : 'one owner · open';
    };
    ovEl.innerHTML = '<div class="rt-p">' +
      (t ? '<h2>' + esc(t.name) + '</h2><div class="rt-g">' + esc(t.game) + ' · ' +
        esc(SEATLINE(t).toUpperCase()) + '</div>' +
        '<div class="rt-c"><pre>' + esc(slip(t.id)) + '</pre></div>' +
        '<div class="rt-row">' +
        (st === 'closed' ? '' : '<button type="button" data-rt="copy">COPY CLAIM SLIP</button>') +
        '<button type="button" class="alt" data-rt="close">CLOSE</button></div>'
        : '<h2>EARNED TITLES</h2><div class="rt-g">NOTHING CLEARED YET</div>') +
      '<div class="rt-n"><b>Your browser cannot award this and does not pretend to.</b> Every score ' +
      'in these games lives in your own browser and can be edited in seconds, so the studio is the ' +
      'judge: post the unbroken capture of the run, we verify it and sign a voucher, and <b>you</b> ' +
      'mint the card to <b>your</b> wallet and pay the gas. ' +
      /* ⛔ SAY THE SCARCITY RULE OUT LOUD, on the surface where somebody has just cleared something.
       *   A player who does not know a title can close reads "TAKEN" as the studio going back on it. */
      '<b>Each title is a 1/1: the first claimant takes it and it closes for good.</b> ' +
      TITLES.length + ' titles, ' + cards() + ' cards' +
      (ROSTER.loaded ? '' : ' — <b>seat roster unread</b>, so a seat below may already be gone') +
      '.</div>' +
      TITLES.map(x => { const c = cleared(x.id), s = seatState(x.id);
        const tag = s === 'closed' ? 'TAKEN' : (c ? 'CLEARED' : 'OPEN');
        return '<div class="rt-li ' + (s === 'closed' ? 'gone' : c ? 'on' : 'off') + '"><span class="rt-s">' +
          tag + '</span><b>' + esc(x.name) + '</b> · ' + esc(x.game) + ' · card #' + x.cards.join(' / #') +
          ' · ' + esc(SEATLINE(x)) +
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
    /* ⚠ READ THE ROSTER EARLY AND ONCE. A run takes minutes; the fetch takes milliseconds, so by
     *   the time anything can be cleared the seats are known. If it never lands, `seatState` stays
     *   'unread' and every surface says so rather than guessing. */
    try { loadRoster(); } catch (e) {}
  }

  const API = { TITLES, byId, cards, award, cleared, all, slip, reset, open, close, mount, badge,
    status, roster, setRoster, loadRoster, seatsOpen, seatState, ROSTER_URL,
    KEY, _mem: o => { MEM = o; } };
  root.RipTitles = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (doc()) {
    if (doc().readyState !== 'loading') setTimeout(mount, 0);
    else doc().addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : globalThis);

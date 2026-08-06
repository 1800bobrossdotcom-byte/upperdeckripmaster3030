/* ripmaster3030studios — rip a pack.
 * Opens a popup, plays the "rip popup loading.mp4" tear animation, then reveals a
 * 7-card pack pulled from cards/manifest.json — weighted by rarity so commons show
 * up often and prizms almost never. Rare+ pulls flip in with a glow. If the video is
 * missing it falls back to a CSS-spun pack, so the reveal always happens. */
(() => {
  const modal = document.getElementById('packModal');
  if (!modal) return;
  const vid = document.getElementById('packVid');
  const stage = document.getElementById('packStage');
  const reveal = document.getElementById('packReveal');
  const actions = document.getElementById('packActions');
  const title = document.getElementById('packTitle');
  const VIDEO = new URL('rip popup loading.mp4', document.baseURI).href;
  const WEIGHTS = { common: 48, uncommon: 30, rare: 15, mythic: 6, prizm: 1 };
  const PACK = 7;
  let DECK = [], busy = false;

  // ── on-chain rip: a rip BURNS $3030 (buy the ticket, take the ride). Buying the
  //    token happens on SuperRare / DEXes; this site owns the burn. Falls back to a
  //    practice pull when the token isn't live or there's no wallet. ──
  const W = () => window.RipWallet || null;
  const onchainRip = () => !!(W() && W().isLive() && W().hasWallet());
  const packBurn = () => Math.max(1, ((window.RIPMASTER_CHAIN || {}).packBurn) || 350);
  let lastTx = null, practice = false, lastSplit = false;   // lastSplit: went through PackSink

  /* ── ⛔ THE REVEAL IS THE ONE CARD THAT HAS TO BE AN OBJECT ────────────────────────────────
   * Artist, 2026-08-05: *"we need the same cardviewer used in the proof.html with the
   * environments, in as every viewer. each card should have a back too."*
   *
   * ⚑ AND THIS IS THE VIEWER THAT MATTERS MOST, because of what the pack IS. The artist's own
   *   frame for this project is anticipation — *the rip, the pull, the reveal* — and the reveal
   *   was the last place showing a flat still OF a print. Seven pressed cards fanned along the
   *   bottom and a photograph of one above them. The selected card is the press itself now, in
   *   its room and under its raking key: press the stock, turn it, flip it onto the designed back.
   *   The fan stays baked, deliberately — a card you are not holding is a card on the table.
   * ⚠ THE FLAT BACKGROUND STAYS UNDERNEATH AND IS NEVER CLEARED. `CardView` resolves `null`
   *   unless the press proves it printed, so on any failure the poster is simply still there.
   *   Clearing it on success would trade a guaranteed picture for a hoped-for one. */
  let viewer = null;
  const cardRec = (list, i) => {
    const c = (list || [])[i];
    if (!c) return null;
    return { art: 'cards/' + c.art, title: (c.title || '').toUpperCase(),
             rarity: c.rarity || 'common' };
  };
  /* ⛔ AND IT MUST BE TORN DOWN BEFORE THE REVEAL IS REBUILT. `showCards()` replaces the whole
   *   panel with `innerHTML`, which throws the canvas away without releasing its GL context —
   *   so ripping a second pack would build a second press and orphan the first. Browsers cap
   *   live contexts and drop the oldest silently, which surfaces as a card blanking somewhere
   *   else entirely, several pulls later. */
  const dropViewer = () => {
    if (!viewer) return;
    try { viewer.destroy(); } catch {}
    viewer = null;
  };
  const mountViewer = (list) => {
    const box = document.getElementById('pvCard');
    if (!box || !window.CardView || viewer) return;
    CardView.mount({ box, base: 'cards/', card: cardRec(list, cur) }).then(v => {
      if (!v) return;                        // the press never printed — the poster stands
      viewer = v;
      box.classList.add('live');
      v.show(cardRec(cards, cur));
    }).catch(() => {});
  };

  const pstyle = document.createElement('style');
  pstyle.textContent =
    '.pack-note{ text-align:center; font-size:13px; line-height:1.6; color:#cfe9ee; max-width:440px; margin:24px auto 6px; padding:0 12px; }' +
    '.pack-note b{ color:#ffd23b; }' +
    '.pack-cta{ display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin:14px auto 8px; }' +
    '.pack-cta .btn{ font-size:12px; padding:11px 16px; }' +
    '.pack-tx{ text-align:center; font-size:11px; letter-spacing:.04em; color:#ffb08a; margin:2px auto 10px; }' +
    '.pack-tx a{ color:#2bff80; }';
  document.head.appendChild(pstyle);

  fetch('cards/manifest.json').then(r => r.json()).then(m => { DECK = m.cards || []; }).catch(() => {});

  const rnd = n => Math.floor(Math.random() * n);
  const pickTier = () => {
    const tot = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    let x = rnd(tot);
    for (const [k, w] of Object.entries(WEIGHTS)) { if ((x -= w) < 0) return k; }
    return 'common';
  };
  const pull = n => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const tier = pickTier();
      const pool = DECK.filter(c => c.rarity === tier);
      out.push((pool.length ? pool : DECK)[rnd((pool.length ? pool : DECK).length)]);
    }
    return out.filter(Boolean);
  };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function open() { modal.classList.add('show'); modal.setAttribute('aria-hidden', 'false'); startRip(); }

  // decide: real on-chain rip (burn $3030) or a practice pull
  async function startRip() {
    lastTx = null; practice = true;
    if (onchainRip()) return onchainStart();
    rip();
  }
  async function onchainStart() {
    if (busy) return;
    const w = W();
    showBusy('checking your $3030…');
    if (!w.isConnected()) { const c = await w.connect(); if (!c.ok) return ripBlocked(w.explain(c.reason)); }
    const g = await w.ensureChain(); if (!g.ok) return ripBlocked(w.explain(g.reason));
    const need = packBurn(), bal = await w.balance();
    if (bal.tokens < need) return ripNeedTokens(bal.tokens, need);
    /* Half burns, half funds the studio — ONE atomic call (contracts/PackSink.sol). The split
     * needs an `approve` first, so this is two wallet prompts rather than one; `onStep` says
     * which one you are looking at, because an unexplained second prompt reads as a scam. */
    const split = w.hasSink && w.hasSink();
    showBusy(split ? 'approve ' + need + ' $3030 for the pack…'
                   : 'confirm the burn of ' + need + ' $3030 in your wallet…');
    const r = await w.payPack(need, step => showBusy(step === 'approve'
      ? 'approve ' + need + ' $3030 for the pack…'
      : 'confirm the pack — ' + Math.floor(need / 2) + ' burns, ' + (need - Math.floor(need / 2)) + ' funds the studio…'));
    if (!r.ok) return ripBlocked(w.explain(r.reason));
    lastTx = r.tx; practice = false; lastSplit = !!r.split;
    busy = false;                           // release the status latch so rip() can run
    rip();                                  // burned for real → play the tear + reveal
  }
  function showBusy(msg) { busy = true; if (title) title.textContent = msg; actions.hidden = true;
    stage.classList.add('hidden'); reveal.innerHTML = '<div class="pack-note">' + esc(msg) + '</div>'; }
  function ctaRow() {
    const buy = W() ? W().buyUrl() : 'https://superrare.com';
    return '<div class="pack-cta">' +
      '<a class="btn gold" href="' + buy + '" target="_blank" rel="noopener noreferrer">$ Buy $3030 ↗</a>' +
      '<button type="button" class="btn" id="ripRetry">↻ Try again</button>' +
      '<button type="button" class="btn alt" id="ripPractice">Practice pull</button></div>';
  }
  function wireCta() {
    const r = document.getElementById('ripRetry'); if (r) r.onclick = () => startRip();
    const p = document.getElementById('ripPractice'); if (p) p.onclick = () => { practice = true; lastTx = null; rip(); };
  }
  function ripBlocked(msg) { busy = false; if (title) title.textContent = 'hold up';
    reveal.innerHTML = '<div class="pack-note">' + esc(msg) + '</div>' + ctaRow(); wireCta(); }
  function ripNeedTokens(have, need) { busy = false; if (title) title.textContent = 'need more $3030';
    const costs = (W() && W().hasSink && W().hasSink())
      ? 'costs <b>' + need + ' $3030</b> — half burned, half to the studio'
      : 'burns <b>' + need + ' $3030</b>';
    reveal.innerHTML = '<div class="pack-note">A rip ' + costs + '. You hold <b>' +
      have.toLocaleString('en-US') + '</b>. Buy some on SuperRare, then rip.</div>' + ctaRow(); wireCta(); }
  function close() {
    dropViewer();                      // a press rendering behind a closed modal is a battery bill
    if (zoomEl) { zoomEl.remove(); zoomEl = null; modal.querySelector('.pack-inner').classList.remove('recede'); }
    modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); try { vid.pause(); } catch {}
  }

  function rip() {
    if (busy) return; busy = true;
    reveal.innerHTML = ''; actions.hidden = true;
    stage.classList.remove('hidden'); stage.classList.add('spin');
    if (title) title.textContent = 'ripping the pack…';
    let done = false;
    const finish = () => { if (done) return; done = true; showCards(); };
    try {
      vid.src = VIDEO; vid.currentTime = 0;
      vid.onended = finish;
      vid.onerror = () => { stage.classList.add('novideo'); };
      const p = vid.play(); if (p && p.catch) p.catch(() => {});
    } catch { stage.classList.add('novideo'); }
    setTimeout(finish, 4200); // hard cap so the reveal always lands
  }

  // ── the pull browser: seven splayed like a held hand, one big up front ──
  let cards = [], cur = 0;

  function showCards() {
    dropViewer();                      // the panel below is about to be replaced wholesale
    stage.classList.add('hidden'); stage.classList.remove('spin');
    if (title) title.textContent = 'your pull';
    cards = pull(PACK); cur = 0;
    // the pull is YOURS: pulls join the on-device collection the arena plays from
    try {
      const v = JSON.parse(localStorage.getItem('urm_vault') || '[]');
      cards.forEach(c => v.push({ slug: c.slug }));
      localStorage.setItem('urm_vault', JSON.stringify(v.slice(-200)));
    } catch {}
    if (title) title.textContent = practice ? 'practice pull · no on-chain burn' : 'your pull · $3030 burned on-chain · cards saved in-browser';
    /* ⚑ THE PULL IS A PRINT — artist, 2026-08-05. The cards you rip are the same object as the
     *   cards in the folder and on the token's own page: a four-colour proof of the artwork,
     *   screened, mis-registered, on paper (js/hero-card.js via js/card-press.js).
     * ⛔ INJECTED WHEN THE PACK OPENS, NEVER ON PAGE LOAD. This is the landing page; the press is
     *   a WebGL2 renderer plus a manifest fetch, and making the front door pay for it before
     *   anybody has clicked anything is a cost the front door must not pay.
     *   Nobody pays for the press until they rip a pack.
     * ⚠ The zoom view needs nothing: it already frames the card's own page in an iframe, and
     *   that page presses itself through cards/cardnav.js. One implementation, not two. */
    const pressFan = (list) => {
      if (/[?&]flat\b/.test(location.search)) return;
      const inject = src => new Promise(res => {
        if (src.indexOf('hero-card') > 0 && window.HeroCard) return res(true);
        if (src.indexOf('card-press') > 0 && window.CardPress) return res(true);
        const s = document.createElement('script');
        s.src = src; s.onload = () => res(true); s.onerror = () => res(false);
        document.head.appendChild(s);
      });
      inject('js/hero-card.js').then(() => inject('js/card-back.js'))
        .then(() => inject('js/card-press.js')).then(() => inject('js/card-view.js')).then(() => {
        if (!window.CardPress) return;
        CardPress.grid('.fcard img', img => {
          const b = img.closest('.fcard');
          const c = list[+(b && b.dataset.i)] || {};
          return { art: img.getAttribute('src'), title: (c.title || '').toUpperCase(),
                   rarity: c.rarity || 'common' };
        }, { base: 'cards/', onDone: repaintIfCurrent });
        mountViewer(list);
      }).catch(() => {});
    };

    const n = cards.length, mid = (n - 1) / 2;
    const fan = cards.map((c, i) => {
      const rot = ((i - mid) * 9).toFixed(1);
      const drop = (Math.abs(i - mid) * Math.abs(i - mid) * 5).toFixed(0);
      return '<button type="button" class="fcard r-' + esc(c.rarity) + '" data-i="' + i + '"' +
        ' style="--d:' + (i * 130) + 'ms;--rot:' + rot + 'deg;--drop:' + drop + 'px"' +
        ' aria-label="view ' + esc(c.title) + '">' +
        '<span class="fcard-inner"><span class="fback">✦</span>' +
        '<img src="cards/' + esc(c.art) + '" alt="" decoding="async"></span></button>';
    }).join('');
    reveal.innerHTML =
      '<div class="pv">' +
        '<button type="button" class="pv-nav" id="pvPrev" aria-label="previous card">◀</button>' +
        '<a class="pv-card" id="pvCard" href="#" aria-label="selected card">' +
          '<span class="pv-rr" id="pvRr"></span>' +
          '<span class="pv-open">open card ↗</span>' +
          /* ⚠ Shown only once a live press has mounted (`.pv-card.live`). Offering to turn over
           *   a background-image would be a button that does nothing, which is worse than no
           *   button — and the poster path is the one that runs when WebGL2 is missing. */
          '<button type="button" class="pv-flip" id="pvFlip" aria-label="turn the card over">' +
          '⇄ back</button>' +
        '</a>' +
        '<button type="button" class="pv-nav" id="pvNext" aria-label="next card">▶</button>' +
      '</div>' +
      '<div class="pv-meta"><span class="pv-nm" id="pvNm"></span><span class="pv-count" id="pvCount"></span></div>' +
      '<div class="fan" id="fan">' + fan + '</div>';
    if (!practice && lastTx && W()) {
      const banner = document.createElement('div'); banner.className = 'pack-tx';
      // ⚠ Say what actually happened, not what the economics doc says: with PackSink unwired the
      //   whole pack still burns, and claiming a studio split that didn't occur is a false receipt.
      const half = Math.floor(packBurn() / 2);
      banner.innerHTML = '<span class="ic" data-ic="flame"></span> ' + (lastSplit
        ? 'burned ' + half + ' $3030 · ' + (packBurn() - half) + ' to the studio'
        : 'burned ' + packBurn() + ' $3030') +
        ' · <a href="' + W().explorerTx(lastTx) + '" target="_blank" rel="noopener noreferrer">view tx ↗</a>';
      reveal.prepend(banner);
      window.RipIcons && RipIcons.hydrate(banner);
    }
    void reveal.offsetHeight; // force face-down layout so the flip transition triggers
    requestAnimationFrame(() => requestAnimationFrame(() =>
      reveal.querySelectorAll('.fcard').forEach(f => f.classList.add('flip'))));
    reveal.querySelectorAll('.fcard').forEach(f => f.addEventListener('click', () => view(+f.dataset.i)));
    pressFan(cards);
    document.getElementById('pvPrev').onclick = () => view((cur + n - 1) % n);
    document.getElementById('pvNext').onclick = () => view((cur + 1) % n);
    /* ⚠ A DRAG IS NOT A CLICK, and once the card is a live press this stops being pedantic:
     *   pressing the stock and turning the card both end in a `click` on the anchor, so without
     *   this every handling gesture threw the visitor into the zoom. Same distinction the phone
     *   flight controls had to make — a tap is a pointerup that did not drag. */
    const pv = document.getElementById('pvCard');
    let dragged = false, downAt = null;
    pv.addEventListener('pointerdown', e => { dragged = false; downAt = [e.clientX, e.clientY]; });
    pv.addEventListener('pointermove', e => {
      if (!downAt) return;
      if (Math.abs(e.clientX - downAt[0]) + Math.abs(e.clientY - downAt[1]) > 8) dragged = true;
    }, { passive: true });
    pv.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.button !== 0) return; // let open-in-new-tab through
      e.preventDefault();
      downAt = null;
      if (dragged) { dragged = false; return; }
      openZoom();
    });
    const flip = document.getElementById('pvFlip');
    flip.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();          // never the zoom
      if (!viewer) return;
      let up = true;
      try { up = viewer.flip(); } catch {}
      flip.textContent = up ? '⇄ back' : '⇄ front';
    });
    view(0);
    setTimeout(() => { actions.hidden = false; busy = false; }, n * 130 + 700);
  }

  // ── z-space shift: the viewed card flies forward into its full live page,
  //    the pull recedes behind it; "back to the pull" reverses the move ──
  let zoomEl = null;
  function openZoom() {
    const c = cards[cur]; if (!c || zoomEl) return;
    const zoom = document.createElement('div');
    zoom.className = 'zoom';
    // Poster the card art instantly (already cached from the reveal) so the panel is
    // never a blank black box; the live card page fades in on top once it loads.
    zoom.innerHTML =
      '<div class="zoom-panel">' +
        '<img class="zoom-poster" src="cards/' + esc(c.art || '') + '" alt="' + esc(c.title) + '" onerror="this.style.display=\'none\'">' +
        '<iframe src="cards/' + esc(c.slug) + '.html" title="' + esc(c.title) + ' — live card" loading="eager"' +
        ' allow="accelerometer; gyroscope; magnetometer"></iframe>' +
        '<span class="zoom-spin">summoning live card…</span>' +
      '</div>' +
      '<button type="button" class="zoom-back">◀ back to the pull</button>';
    document.body.appendChild(zoom);
    zoomEl = zoom;
    const panel = zoom.querySelector('.zoom-panel');
    const frame = panel.querySelector('iframe');
    // reveal the live page when it finishes; hard-cap so it never hangs on the poster
    const showFrame = () => frame.classList.add('ready');
    frame.addEventListener('load', showFrame);
    setTimeout(showFrame, 6000);
    const from = document.getElementById('pvCard').getBoundingClientRect();
    requestAnimationFrame(() => {
      const to = panel.getBoundingClientRect();
      const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
      const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
      const s = from.width / to.width;
      panel.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')';
      panel.style.opacity = '.35';
      void panel.offsetWidth;
      panel.classList.add('go');
      panel.style.transform = ''; panel.style.opacity = '';
    });
    modal.querySelector('.pack-inner').classList.add('recede');
    zoom.querySelector('.zoom-back').onclick = closeZoom;
    zoom.addEventListener('click', e => { if (e.target === zoom) closeZoom(); });
  }
  function closeZoom() {
    if (!zoomEl) return;
    const z = zoomEl; zoomEl = null;
    const panel = z.querySelector('.zoom-panel');
    const to = document.getElementById('pvCard') && document.getElementById('pvCard').getBoundingClientRect();
    if (to) {
      const now = panel.getBoundingClientRect();
      const dx = (to.left + to.width / 2) - (now.left + now.width / 2);
      const dy = (to.top + to.height / 2) - (now.top + now.height / 2);
      const s = to.width / now.width;
      panel.classList.add('go');
      panel.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')';
      panel.style.opacity = '.2';
    }
    z.classList.add('fade');
    modal.querySelector('.pack-inner').classList.remove('recede');
    setTimeout(() => z.remove(), 560);
  }

  function view(i) {
    const c = cards[i]; if (!c) return;
    cur = i;
    const card = document.getElementById('pvCard');
    card.href = 'cards/' + esc(c.slug) + '.html';
    card.className = 'pv-card r-' + esc(c.rarity);
    // paint the art as a CSS background (reliable on every mobile browser/WebView;
    // a JS-assigned <img>.src can fail to repaint on Samsung Internet et al.)
    card.style.backgroundImage = "url('" + faceOf(i) + "')";
    /* the live press, when there is one — the poster underneath stays as the fallback */
    if (viewer) { try { viewer.show(cardRec(cards, i)); } catch {} }
    card.setAttribute('aria-label', c.title);
    document.getElementById('pvRr').textContent = c.rarity;
    document.getElementById('pvNm').textContent = c.title;
    document.getElementById('pvCount').textContent = (i + 1) + ' / ' + cards.length;
    card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    reveal.querySelectorAll('.fcard').forEach((f, j) => f.classList.toggle('on', j === i));
  }

  /* ── ⚑ THE POPUP SHOWS THE SAME PRINT THE FAN DOES, AND REUSES ITS BAKE ──────────────────
   * The selected card paints a CSS background-image rather than an <img> (a JS-assigned .src can
   * fail to repaint on some mobile WebViews — see the note above), so CardPress.tile, which
   * swaps an image's src, cannot reach it. Baking a SECOND still for the same card would be the
   * obvious fix and the wrong one: it is a second trip through the one shared press for a
   * picture that already exists two elements away.
   * ⛔ WITHOUT THIS THE PACK CONTRADICTED ITSELF ON ONE SCREEN — seven pressed cards fanned along
   *   the bottom and the big flat scan of the selected one above them, which reads as the press
   *   having failed on the card you are actually looking at. Found by looking at the frame; every
   *   number said the fan was fine, and the fan WAS fine.
   * ⚠ Falls back to the flat art whenever the bake has not landed (or never will), so the popup
   *   is never empty and never waits. */
  const faceOf = i => {
    const f = reveal.querySelector('.fcard[data-i="' + i + '"] img');
    if (f && f.getAttribute('data-pressed')) return f.src;    // the print, already baked
    return 'cards/' + cards[i].art;
  };
  /* and when a bake lands on the card that is currently selected, repaint it — without this the
   * first card you look at stays flat until you click away and back. */
  const repaintIfCurrent = img => {
    const b = img.closest('.fcard');
    if (!b || +b.dataset.i !== cur) return;
    const card = document.getElementById('pvCard');
    if (card) card.style.backgroundImage = "url('" + img.src + "')";
  };

  document.getElementById('packOpen') && document.getElementById('packOpen').addEventListener('click', open);
  document.getElementById('packClose') && document.getElementById('packClose').addEventListener('click', close);
  document.getElementById('packDone') && document.getElementById('packDone').addEventListener('click', close);
  document.getElementById('packAgain') && document.getElementById('packAgain').addEventListener('click', startRip);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  addEventListener('keydown', e => {
    if (e.key === 'Escape') return zoomEl ? closeZoom() : close();
    if (!modal.classList.contains('show') || !cards.length || zoomEl) return;
    if (e.key === 'ArrowLeft') view((cur + cards.length - 1) % cards.length);
    if (e.key === 'ArrowRight') view((cur + 1) % cards.length);
  });
})();

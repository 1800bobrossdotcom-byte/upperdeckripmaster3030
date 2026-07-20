/* upperdeckripmaster3030 — rip a pack.
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

  // ── on-chain rip: a rip BURNS $UR3030 (buy the ticket, take the ride). Buying the
  //    token happens on SuperRare / DEXes; this site owns the burn. Falls back to a
  //    practice pull when the token isn't live or there's no wallet. ──
  const W = () => window.RipWallet || null;
  const onchainRip = () => !!(W() && W().isLive() && W().hasWallet());
  const packBurn = () => Math.max(1, ((window.RIPMASTER_CHAIN || {}).packBurn) || 350);
  let lastTx = null, practice = false;

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

  // decide: real on-chain rip (burn $UR3030) or a practice pull
  async function startRip() {
    lastTx = null; practice = true;
    if (onchainRip()) return onchainStart();
    rip();
  }
  async function onchainStart() {
    if (busy) return;
    const w = W();
    showBusy('checking your $UR3030…');
    if (!w.isConnected()) { const c = await w.connect(); if (!c.ok) return ripBlocked(w.explain(c.reason)); }
    const g = await w.ensureChain(); if (!g.ok) return ripBlocked(w.explain(g.reason));
    const need = packBurn(), bal = await w.balance();
    if (bal.tokens < need) return ripNeedTokens(bal.tokens, need);
    showBusy('confirm the burn of ' + need + ' $UR3030 in your wallet…');
    const r = await w.burn(need);
    if (!r.ok) return ripBlocked(w.explain(r.reason));
    lastTx = r.tx; practice = false;
    busy = false;                           // release the status latch so rip() can run
    rip();                                  // burned for real → play the tear + reveal
  }
  function showBusy(msg) { busy = true; if (title) title.textContent = msg; actions.hidden = true;
    stage.classList.add('hidden'); reveal.innerHTML = '<div class="pack-note">' + esc(msg) + '</div>'; }
  function ctaRow() {
    const buy = W() ? W().buyUrl() : 'https://superrare.com';
    return '<div class="pack-cta">' +
      '<a class="btn gold" href="' + buy + '" target="_blank" rel="noopener noreferrer">$ Buy $UR3030 ↗</a>' +
      '<button type="button" class="btn" id="ripRetry">↻ Try again</button>' +
      '<button type="button" class="btn alt" id="ripPractice">Practice pull</button></div>';
  }
  function wireCta() {
    const r = document.getElementById('ripRetry'); if (r) r.onclick = () => startRip();
    const p = document.getElementById('ripPractice'); if (p) p.onclick = () => { practice = true; lastTx = null; rip(); };
  }
  function ripBlocked(msg) { busy = false; if (title) title.textContent = 'hold up';
    reveal.innerHTML = '<div class="pack-note">' + esc(msg) + '</div>' + ctaRow(); wireCta(); }
  function ripNeedTokens(have, need) { busy = false; if (title) title.textContent = 'need more $UR3030';
    reveal.innerHTML = '<div class="pack-note">A rip burns <b>' + need + ' $UR3030</b>. You hold <b>' +
      have.toLocaleString('en-US') + '</b>. Buy some on SuperRare, then rip.</div>' + ctaRow(); wireCta(); }
  function close() {
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
    stage.classList.add('hidden'); stage.classList.remove('spin');
    if (title) title.textContent = 'your pull';
    cards = pull(PACK); cur = 0;
    // the pull is YOURS: pulls join the on-device collection the arena plays from
    try {
      const v = JSON.parse(localStorage.getItem('urm_vault') || '[]');
      cards.forEach(c => v.push({ slug: c.slug }));
      localStorage.setItem('urm_vault', JSON.stringify(v.slice(-200)));
    } catch {}
    if (title) title.textContent = practice ? 'practice pull · no on-chain burn' : 'your pull · $UR3030 burned on-chain · cards saved in-browser';
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
        '</a>' +
        '<button type="button" class="pv-nav" id="pvNext" aria-label="next card">▶</button>' +
      '</div>' +
      '<div class="pv-meta"><span class="pv-nm" id="pvNm"></span><span class="pv-count" id="pvCount"></span></div>' +
      '<div class="fan" id="fan">' + fan + '</div>';
    if (!practice && lastTx && W()) {
      const banner = document.createElement('div'); banner.className = 'pack-tx';
      banner.innerHTML = '<span class="ic" data-ic="flame"></span> burned ' + packBurn() + ' $UR3030 · <a href="' + W().explorerTx(lastTx) +
        '" target="_blank" rel="noopener noreferrer">view tx ↗</a>';
      reveal.prepend(banner);
      window.RipIcons && RipIcons.hydrate(banner);
    }
    void reveal.offsetHeight; // force face-down layout so the flip transition triggers
    requestAnimationFrame(() => requestAnimationFrame(() =>
      reveal.querySelectorAll('.fcard').forEach(f => f.classList.add('flip'))));
    reveal.querySelectorAll('.fcard').forEach(f => f.addEventListener('click', () => view(+f.dataset.i)));
    document.getElementById('pvPrev').onclick = () => view((cur + n - 1) % n);
    document.getElementById('pvNext').onclick = () => view((cur + 1) % n);
    document.getElementById('pvCard').addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.button !== 0) return; // let open-in-new-tab through
      e.preventDefault(); openZoom();
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
    card.style.backgroundImage = "url('cards/" + c.art + "')";
    card.setAttribute('aria-label', c.title);
    document.getElementById('pvRr').textContent = c.rarity;
    document.getElementById('pvNm').textContent = c.title;
    document.getElementById('pvCount').textContent = (i + 1) + ' / ' + cards.length;
    card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    reveal.querySelectorAll('.fcard').forEach((f, j) => f.classList.toggle('on', j === i));
  }

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

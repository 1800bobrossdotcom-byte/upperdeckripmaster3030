/* Upperdeck Ripmaster 3030 — rip a pack.
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

  function open() { modal.classList.add('show'); modal.setAttribute('aria-hidden', 'false'); rip(); }
  function close() { modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); try { vid.pause(); } catch {} }

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
        '<a class="pv-card" id="pvCard" href="#">' +
          '<img id="pvImg" alt="" decoding="async">' +
          '<span class="pv-rr" id="pvRr"></span>' +
          '<span class="pv-open">open card ↗</span>' +
        '</a>' +
        '<button type="button" class="pv-nav" id="pvNext" aria-label="next card">▶</button>' +
      '</div>' +
      '<div class="pv-meta"><span class="pv-nm" id="pvNm"></span><span class="pv-count" id="pvCount"></span></div>' +
      '<div class="fan" id="fan">' + fan + '</div>';
    void reveal.offsetHeight; // force face-down layout so the flip transition triggers
    requestAnimationFrame(() => requestAnimationFrame(() =>
      reveal.querySelectorAll('.fcard').forEach(f => f.classList.add('flip'))));
    reveal.querySelectorAll('.fcard').forEach(f => f.addEventListener('click', () => view(+f.dataset.i)));
    document.getElementById('pvPrev').onclick = () => view((cur + n - 1) % n);
    document.getElementById('pvNext').onclick = () => view((cur + 1) % n);
    view(0);
    setTimeout(() => { actions.hidden = false; busy = false; }, n * 130 + 700);
  }

  function view(i) {
    const c = cards[i]; if (!c) return;
    cur = i;
    const card = document.getElementById('pvCard');
    card.href = 'cards/' + esc(c.slug) + '.html';
    card.className = 'pv-card r-' + esc(c.rarity);
    document.getElementById('pvImg').src = 'cards/' + c.art;
    document.getElementById('pvImg').alt = c.title;
    document.getElementById('pvRr').textContent = c.rarity;
    document.getElementById('pvNm').textContent = c.title;
    document.getElementById('pvCount').textContent = (i + 1) + ' / ' + cards.length;
    card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    reveal.querySelectorAll('.fcard').forEach((f, j) => f.classList.toggle('on', j === i));
  }

  document.getElementById('packOpen') && document.getElementById('packOpen').addEventListener('click', open);
  document.getElementById('packClose') && document.getElementById('packClose').addEventListener('click', close);
  document.getElementById('packDone') && document.getElementById('packDone').addEventListener('click', close);
  document.getElementById('packAgain') && document.getElementById('packAgain').addEventListener('click', rip);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  addEventListener('keydown', e => {
    if (e.key === 'Escape') return close();
    if (!modal.classList.contains('show') || !cards.length) return;
    if (e.key === 'ArrowLeft') view((cur + cards.length - 1) % cards.length);
    if (e.key === 'ArrowRight') view((cur + 1) % cards.length);
  });
})();

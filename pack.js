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

  function showCards() {
    stage.classList.add('hidden'); stage.classList.remove('spin');
    if (title) title.textContent = 'your pull';
    const cards = pull(PACK);
    reveal.innerHTML = cards.map((c, i) =>
      '<div class="pull r-' + esc(c.rarity) + '" style="--d:' + (i * 150) + 'ms">' +
        '<div class="pull-inner">' +
          '<div class="pull-back"><span>✦</span></div>' +
          '<a class="pull-front" href="cards/' + esc(c.slug) + '.html">' +
            '<img src="cards/' + esc(c.art) + '" alt="' + esc(c.title) + '" decoding="async">' +
            '<span class="pull-rr">' + esc(c.rarity) + '</span>' +
            '<span class="pull-nm">' + esc(c.title) + '</span>' +
          '</a>' +
        '</div></div>').join('');
    void reveal.offsetHeight; // force initial (face-down) layout so the flip transition triggers
    requestAnimationFrame(() => requestAnimationFrame(() =>
      reveal.querySelectorAll('.pull').forEach(p => p.classList.add('flip'))));
    setTimeout(() => { actions.hidden = false; busy = false; }, PACK * 150 + 800);
  }

  document.getElementById('packOpen') && document.getElementById('packOpen').addEventListener('click', open);
  document.getElementById('packClose') && document.getElementById('packClose').addEventListener('click', close);
  document.getElementById('packDone') && document.getElementById('packDone').addEventListener('click', close);
  document.getElementById('packAgain') && document.getElementById('packAgain').addEventListener('click', rip);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();

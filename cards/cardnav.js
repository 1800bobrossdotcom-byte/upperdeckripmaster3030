/* Upperdeck Ripmaster 3030 — card-page deck navigation.
   Peeks the previous/next card staggered on each side and lets you flip through the whole
   deck: swipe on touch, ◀/▶ arrows on desktop, or tap a peek. Deck order = manifest order,
   wrapping around. No-ops inside an embedded lens iframe (read-only art). */
(() => {
  if (window.self !== window.top) return;                 // the framed lens stays a plain painting
  const slug = decodeURIComponent((location.pathname.split('/').pop() || '').replace(/\.html$/, ''));
  if (!slug) return;

  const style = document.createElement('style');
  style.textContent = `
    .cardpeek{ position:fixed; top:50%; z-index:2; width:clamp(56px,13vw,138px); cursor:pointer;
      opacity:.4; text-decoration:none; filter:drop-shadow(0 10px 24px rgba(0,0,0,.55));
      transition:opacity .25s ease, transform .25s ease; -webkit-tap-highlight-color:transparent; }
    .cardpeek img{ width:100%; display:block; border-radius:9px; border:2px solid rgba(255,255,255,.28); background:#0a0414; }
    .cardpeek .cp-x{ position:absolute; top:50%; transform:translateY(-50%); font-family:'Arial Black',Arial,sans-serif;
      font-size:clamp(16px,3.4vw,22px); color:#fff; text-shadow:0 0 8px #000,0 0 15px rgba(43,255,128,.75); }
    .cardpeek.left{ left:0; transform:translateY(-50%) translateX(-42%) rotate(-7deg) scale(.8); }
    .cardpeek.right{ right:0; transform:translateY(-50%) translateX(42%) rotate(7deg) scale(.8); }
    .cardpeek.left .cp-x{ right:9%; } .cardpeek.right .cp-x{ left:9%; }
    .cardpeek.left:hover,.cardpeek.left:focus-visible{ opacity:.95; transform:translateY(-50%) translateX(-22%) rotate(-5deg) scale(.87); outline:none; }
    .cardpeek.right:hover,.cardpeek.right:focus-visible{ opacity:.95; transform:translateY(-50%) translateX(22%) rotate(5deg) scale(.87); outline:none; }
    .cardpeek .cp-nm{ position:absolute; left:50%; bottom:-1.4em; transform:translateX(-50%); white-space:nowrap;
      font:9px 'Courier New',monospace; letter-spacing:.08em; color:#cfe9ee; text-shadow:0 1px 3px #000; opacity:0; transition:opacity .2s; }
    .cardpeek:hover .cp-nm,.cardpeek:focus-visible .cp-nm{ opacity:.9; }
    .cp-hint{ position:fixed; bottom:6px; left:50%; transform:translateX(-50%); z-index:2; pointer-events:none;
      font:10px 'Courier New',monospace; letter-spacing:.2em; color:#b8ffd6; opacity:.55; text-transform:uppercase; }
    @media (max-width:600px){ .cardpeek{ opacity:.6; } }
    body.cp-leaving{ opacity:.25; transition:opacity .18s ease; }`;
  document.head.appendChild(style);

  fetch('manifest.json').then(r => r.json()).then(m => {
    const cards = m.cards || [];
    const i = cards.findIndex(c => c.slug === slug);
    if (i < 0) return;
    const prev = cards[(i - 1 + cards.length) % cards.length];
    const next = cards[(i + 1) % cards.length];
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const mk = (c, side) => {
      const a = document.createElement('a');
      a.href = c.slug + '.html'; a.className = 'cardpeek ' + side;
      a.setAttribute('aria-label', (side === 'left' ? 'previous card: ' : 'next card: ') + c.title);
      a.innerHTML = '<img src="' + esc(c.art || 'art/' + c.slug + '.webp') + '" alt="" loading="lazy">' +
        '<span class="cp-x">' + (side === 'left' ? '◀' : '▶') + '</span>' +
        '<span class="cp-nm">' + esc(c.title) + '</span>';
      return a;
    };
    document.body.appendChild(mk(prev, 'left'));
    document.body.appendChild(mk(next, 'right'));

    const hint = document.createElement('div');
    hint.className = 'cp-hint';
    hint.textContent = ('ontouchstart' in window) ? '◀ swipe through the deck ▶' : '◀ arrow keys · tap edges ▶';
    document.body.appendChild(hint);
    setTimeout(() => { hint.style.transition = 'opacity .6s'; hint.style.opacity = '0'; }, 3800);

    const go = c => { document.body.classList.add('cp-leaving'); setTimeout(() => location.href = c.slug + '.html', 120); };
    let sx = 0, sy = 0, st = 0;
    addEventListener('touchstart', e => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    addEventListener('touchend', e => {
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Date.now() - st < 650 && Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? next : prev);
    }, { passive: true });
    addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') go(prev); else if (e.key === 'ArrowRight') go(next);
    });
  }).catch(() => {});
})();

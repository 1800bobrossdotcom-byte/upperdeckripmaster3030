/* upperdeckripmaster3030 — shared card hover-zoom preview (window.CardHover).
 *
 * Any grid of `.tile` cards can pop a big floating preview on hover, so players
 * see exactly what they're picking/wagering. Event-delegated, so it survives
 * innerHTML re-renders of the grid. Desktop only (skips touch pointers); the
 * on-screen selection UI carries mobile. Self-injects its CSS once.
 *
 *   CardHover.bind(containerEl, resolve)   resolve(tileEl) -> {art,title,rarity,atk?,def?,trigger?,color?} | null
 *   CardHover.hide()                       force-hide (e.g. on modal close)
 */
window.CardHover = (function () {
  let box = null, styled = false;

  function injectCss() {
    if (styled) return; styled = true;
    const s = document.createElement('style'); s.id = 'card-hover-css';
    s.textContent =
      ".card-hover{position:fixed;z-index:99990;width:210px;pointer-events:none;border-radius:12px;overflow:hidden;" +
        "border:2px solid #2bff80;background:#02140b;box-shadow:0 26px 64px -14px #000,0 0 32px rgba(0,0,0,.55);" +
        "opacity:0;transform:scale(.92);transition:opacity .12s ease,transform .12s ease;}" +
      ".card-hover img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:#061;}" +
      ".card-hover .ch-m{padding:8px 10px 10px;font-family:'Arial Black',Arial,sans-serif;}" +
      ".card-hover .ch-nm{font-size:13px;text-transform:uppercase;letter-spacing:.02em;color:#eafff6;line-height:1.14;}" +
      ".card-hover .ch-st{display:flex;gap:11px;font-size:12px;margin-top:6px;}" +
      ".card-hover .ch-tg{font-size:9.5px;color:#9fbfae;margin-top:5px;font-family:'Courier New',monospace;letter-spacing:.03em;}" +
      ".card-hover.on{opacity:1;transform:scale(1);}";
    (document.head || document.documentElement).appendChild(s);
  }

  function ensure() { if (box) return box; injectCss(); box = document.createElement('div'); box.className = 'card-hover'; document.body.appendChild(box); return box; }

  let lastCard = null, lastEl = null;
  function show(c, el) {
    lastCard = c; lastEl = el;
    const b = ensure();
    const hasStat = c.atk != null && c.def != null && (+c.atk || +c.def);
    const stat = hasStat
      ? '<div class="ch-st"><span style="color:#ff6b57">A ' + (+c.atk) + '</span><span style="color:#27f7e4">D ' + (+c.def) +
        '</span><span style="color:#ffd23b;font-family:\'Arial Black\',Arial">Σ' + ((+c.atk) + (+c.def)) + '</span></div>'
      : '';
    const tg = c.trigger ? '<div class="ch-tg">▸ ' + c.trigger + (c.rarity ? ' · ' + c.rarity : '') + '</div>'
             : (c.rarity ? '<div class="ch-tg">' + c.rarity + '</div>' : '');
    b.style.borderColor = c.color || '#2bff80';
    b.innerHTML = '<img src="' + c.art + '" alt="" onerror="this.style.opacity=0">' +
      '<div class="ch-m"><div class="ch-nm">' + (c.title || '') + '</div>' + stat + tg + '</div>';
    const r = el.getBoundingClientRect(), pw = 210, ph = 300, gap = 12;
    let left = r.right + gap; if (left + pw > innerWidth - 8) left = r.left - pw - gap; if (left < 8) left = 8;
    let top = r.top + r.height / 2 - ph / 2; top = Math.max(8, Math.min(top, innerHeight - ph - 8));
    b.style.left = left + 'px'; b.style.top = top + 'px'; b.classList.add('on');
  }
  function hide() { if (box) box.classList.remove('on'); }

  function bind(container, resolve) {
    if (!container || container.__cardHover) return; container.__cardHover = true;
    container.addEventListener('pointerover', e => {
      if (e.pointerType === 'touch') return;
      const t = e.target.closest && e.target.closest('.tile');
      if (!t || !container.contains(t)) return;
      let c = null; try { c = resolve(t); } catch (err) {}
      if (c) show(c, t);
    });
    container.addEventListener('pointerout', e => {
      const to = e.relatedTarget; if (!to || !to.closest || !to.closest('.tile')) hide();
    });
    container.addEventListener('click', hide);
    // on scroll, follow the hovered card rather than vanishing (only hide if it left the DOM/viewport)
    window.addEventListener('scroll', () => {
      if (!box || !box.classList.contains('on') || !lastEl) return;
      if (!document.contains(lastEl)) { hide(); return; }
      show(lastCard, lastEl);
    }, true);
  }

  return { bind, hide, show };
})();

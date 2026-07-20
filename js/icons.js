/* upperdeckripmaster3030 — shared inline-SVG icon set.
 *
 * Replaces emoji across the site with consistent line-icons that inherit the
 * surrounding text colour (currentColor). Self-contained: no external assets.
 *
 *   <span class="ic" data-ic="rocket"></span>              inline, 1em
 *   <span class="ic" data-ic="flame" data-ic-size="18"></span>
 *   RipIcons.svg('swords')          -> svg markup string
 *   RipIcons.hydrate(rootEl)        -> fill every [data-ic] under rootEl
 *
 * Auto-hydrates on DOMContentLoaded; call RipIcons.hydrate() again after you
 * inject markup dynamically.
 */
(() => {
  // 24x24 viewBox, stroke = currentColor. Keep paths simple + recognisable.
  const P = {
    rocket: '<path d="M12 2.5c2.7 2 4 5.2 4 8.2l-.8 4.6H8.8L8 10.7c0-3 1.3-6.2 4-8.2z"/><circle cx="12" cy="9.4" r="1.7"/><path d="M8.2 13.2 5.4 15.8l.5 3 2.8-1.7M15.8 13.2l2.8 2.6-.5 3-2.8-1.7"/><path d="M10.4 18.8c.4 1.4 1.6 2.7 1.6 2.7s1.2-1.3 1.6-2.7"/>',
    swords: '<path d="M14.5 3.5 21 3l-.5 6.5-8 8"/><path d="M9.5 3.5 3 3l.5 6.5 8 8"/><path d="M6.5 17.5 4 20M17.5 17.5 20 20M13 15l3 3M11 15l-3 3"/>',
    cards:  '<rect x="8.5" y="4" width="10" height="14" rx="2"/><path d="M5.5 7.5 4 9.2a2 2 0 0 0-.4 2.6l4.3 6.6"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    crosshair: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    arcade: '<rect x="4" y="9" width="16" height="10" rx="2.5"/><path d="M9 13.5h2M10 12.5v2"/><circle cx="15.5" cy="13" r="1.1" fill="currentColor" stroke="none"/><path d="M12 9V6a2 2 0 0 1 2-2h1"/>',
    flame:  '<path d="M12 2.5c.6 3-1.8 4.2-2.9 6.2-1.4 2.6-.6 5.4 1.2 6.7.5-1.4 1.4-2.1 1.4-2.1s.4 2 1.9 3c1.9-1 3-3.2 2.4-5.6-.3-1.2-1.1-2-1.1-2s0 1.3-.9 1.8c.4-2.6-.8-5.6-2-8z"/>',
    coin:   '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M14.2 9.3c-.6-.7-1.4-1-2.4-1-1.4 0-2.4.7-2.4 1.9 0 2.6 5 1.3 5 3.9 0 1.2-1.1 1.9-2.6 1.9-1 0-1.9-.4-2.5-1.1"/>',
    shield: '<path d="M12 3 5 6v5c0 4.3 3 7.5 7 9 4-1.5 7-4.7 7-9V6l-7-3z"/>',
    play:   '<path d="M8 5.5v13l11-6.5z"/>',
    sound:  '<path d="M5 9v6h3l5 4V5L8 9z"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"/>',
    bolt:   '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/>',
    trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3M9.5 13.5 9 18h6l-.5-4.5M8 21h8"/>',
    back:   '<path d="M15 5l-7 7 7 7"/>',
    clock:  '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    joystick: '<circle cx="12" cy="6" r="2.5"/><path d="M12 8.5v6"/><rect x="6" y="14.5" width="12" height="5" rx="2"/>',
  };
  const svg = (name, size) => {
    const body = P[name]; if (!body) return '';
    const s = size ? (String(size).match(/[a-z%]/i) ? size : size + 'px') : '1em';
    return `<svg class="ripic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  };
  const hydrate = root => { (root || document).querySelectorAll('[data-ic]').forEach(el => {
    if (el.dataset.icDone) return; el.innerHTML = svg(el.getAttribute('data-ic'), el.getAttribute('data-ic-size')); el.dataset.icDone = '1'; }); };
  // minimal alignment CSS (injected once)
  try { const st = document.createElement('style');
    st.textContent = '.ic{display:inline-flex;align-items:center;justify-content:center;vertical-align:-0.15em;line-height:0}.ripic{display:block}';
    document.head.appendChild(st); } catch {}
  window.RipIcons = { svg, hydrate, names: Object.keys(P) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrate());
  else hydrate();
})();

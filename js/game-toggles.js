/* ripmaster3030studios — THE CABINET TOGGLES COLLAPSE.   `GameToggles`
 *
 *   <script src="js/game-toggles.js" defer></script>   — that is the whole integration
 *
 * Artist, 2026-08-05: *"we need to make the menu for audio / sfx / etc collapsable as take too
 * much room (games across the board)."*
 *
 * ⛔ IT IS A ROW OF FULL-WIDTH BUTTONS ACROSS THE PLAYFIELD. Measured on DOGFIGHT at 844x390 —
 *   a landscape phone — `◉ CHASE · ♪ MUSIC · ◁ SFX · ⏸ PAUSE` spans the middle of the screen and
 *   paints straight over the radar and the lock reticle. It is four controls a player touches
 *   once a session sitting permanently on top of the one they use continuously.
 * ⚑ SO THE DEFAULT IS CLOSED, AND THE CHOICE IS REMEMBERED. Open it, it stays open; that is a
 *   preference, not a mode, so it belongs in storage rather than being re-decided every launch.
 *
 * ⛔ ONE MODULE, NOT ONE PER CABINET. `.toggles` is in dogfight.html, riprocketer.html and
 *   section9.html with three separate stylesheets around it — and this repo's own record is that
 *   three copies means the fix lands in one of them and the other two rot. It upgrades whatever
 *   `.toggles` row it finds and touches nothing else, so a cabinet opts in by loading it.
 *
 * ⚠ `display:none !important` on the collapsed buttons, deliberately. Every one of these pages
 *   sets `display` on `.tg` (flex or inline-block), and a rule that sets `display` beats the
 *   plain hiding this needs — the same specificity trap that kept the launch countdown ticking
 *   under "THE PACK IS OPEN". Three sightings before this one.
 * ⚠ 44px on the cog. It is a control on a phone, and the mobile pass took taps under 44px to
 *   zero; adding a new one under the floor walks that back.
 *
 * FAILS OPEN: no `.toggles` on the page, or storage refused ⇒ it does nothing at all and the
 * row stays exactly as it was. A cabinet is never left with its audio controls unreachable.
 */
(function (global) {
  'use strict';

  var KEY = 'urm_tg_open';
  var CSS = ''
    + '.tgwrap{display:contents}'
    + '.tgcog{min-width:44px;min-height:44px;cursor:pointer;font:inherit;line-height:1;'
    + 'display:inline-flex;align-items:center;justify-content:center;}'
    /* ⚠ the collapsed state hides the OTHER buttons, never the cog — a menu you cannot reopen
     *   is worse than one that is always open, which is the bug this file exists to fix. */
    + '.toggles[data-open="0"] .tg:not(.tgcog){display:none !important}'
    + '.tgcog[aria-expanded="true"]{filter:brightness(1.3)}';

  function inject() {
    if (document.getElementById('tgcss')) return;
    var s = document.createElement('style');
    s.id = 'tgcss';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function read() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {}
  }

  function wire(row) {
    if (!row || row.__tg) return null;
    row.__tg = true;
    inject();

    /* ⚑ THE COG BORROWS THE ROW'S OWN BUTTON CLASS. Every cabinet styles `.tg` itself — its own
     *   colour, border, font, phone sizing — so taking that class means the control looks like it
     *   belongs to the game rather than like a widget bolted on. A second, "neutral" style would
     *   be the one surface nobody keeps in step. */
    var cog = document.createElement('button');
    cog.type = 'button';
    cog.className = 'tg tgcog';
    cog.id = 'tgCog';
    cog.setAttribute('aria-controls', row.id || 'toggles');
    cog.textContent = '⚙';
    cog.title = 'audio and view controls';
    row.insertBefore(cog, row.firstChild);

    function apply(open) {
      row.dataset.open = open ? '1' : '0';
      cog.setAttribute('aria-expanded', open ? 'true' : 'false');
      cog.setAttribute('aria-label', open ? 'hide game controls' : 'show game controls');
    }
    apply(read());

    cog.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = row.dataset.open !== '1';
      apply(open);
      write(open);
    });
    /* ⚠ A cabinet canvas usually swallows pointer events for aim or a fly stick; the cog sits in
     *   the row, above it, so its press must not also reach the game underneath. */
    ['pointerdown', 'pointerup', 'touchstart'].forEach(function (k) {
      cog.addEventListener(k, function (e) { e.stopPropagation(); }, { passive: true });
    });
    return { row: row, cog: cog, get open() { return row.dataset.open === '1'; },
             set: function (v) { apply(!!v); write(!!v); } };
  }

  function start() {
    var rows = document.querySelectorAll('.toggles');
    var out = [];
    for (var i = 0; i < rows.length; i++) { var w = wire(rows[i]); if (w) out.push(w); }
    global.GameToggles = { rows: out, wire: wire };
    return out;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }
  global.GameToggles = global.GameToggles || { rows: [], wire: wire };
})(window);

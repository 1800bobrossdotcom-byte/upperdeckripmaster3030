/* ripmaster3030studios — THE VAULT REPAIR (RipVaultFix). Runs itself, once, on any page that
 * shows a collector their cards.
 *
 * ⛔ IT LIVED IN `pack.js`, AND ONLY `index.html` LOADS `pack.js`. So the repair had never run on
 *   `cards/battle.html`, `cards/binder.html`, `cards/market.html` or `cards/index.html` — every
 *   surface where a collector actually looks at, stakes or trades a card. A fix that only executes
 *   on the home page is a fix most of the site never receives, and nothing said so.
 * ⚠ AND ITS FETCH WAS RELATIVE (`cards/deck-manifest.json`), which resolves to
 *   `/cards/cards/deck-manifest.json` from any page under /cards/ — a 404 into a `.catch(){}`, so
 *   even loading pack.js there would have repaired nothing, silently. Root-absolute now.
 *
 * TWO REPAIRS, ONE PASS OVER THE VAULT:
 *   1. THE RETIRED 196 → the live hundred. The two sets share ZERO slugs, so every row saved
 *      before the clean-slate resolves to nothing the arena will deal. Artist, 2026-08-07: "no one
 *      can properly play / wager / ante right now." Migrated one-for-one, never deleted.
 *   2. Cards from the 33 that no pack or arena was ever entitled to hand out.
 *
 * ⚠ Nothing here is authoritative and none of it touches the chain: a hero exists only once the
 *   studio signs a voucher and someone redeems it. Earned TITLES live in `urm_titles` and are not
 *   card rows, so no repair can reach them.
 */
window.RipVaultFix = (function () {
  const GACHA_IDS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];   // the only 11 a pack may offer
  let DECK = [], ran = false;

/* ── ⛔ RETROACTIVE: A PACK ONCE OFFERED CARDS IT WAS NEVER ENTITLED TO OFFER ────────────────
 * Before the reservation was keyed on the card's ID, a rip could hand out an auction 1/1
 * (1–11) or an earned title (23–33). Those rows are sitting in collectors' vaults right now,
 * showing in the binder as cards they hold.
 *
 * ⚑ NOTHING IS WRONG ON-CHAIN, AND SAYING SO PRECISELY IS THE POINT. A rip burns tokens and
 *   writes a LOCAL row; a hero exists only once the studio signs a kind-1 voucher and someone
 *   redeems it. Verified against the chain: ids 12–33 have never been minted, and all eleven
 *   that exist are 1–11 in the studio's own wallet. So this is not a recovery — it is removing
 *   a promise the site should never have displayed.
 *
 * ⛔ AND THE SENTENCE THAT USED TO SIT HERE WAS TRUE WHILE ITS CONCLUSION WAS FALSE. It read:
 *   "THIS FILE IS THE ONLY WRITER OF `urm_vault` ROWS CARRYING `n`, which is what makes fixing
 *   it here sufficient rather than hopeful." Both halves check out — and `cards/battle.html`'s
 *   `collect()` wrote `{slug}` with NO `n` at all. So the arena, which drew the house's stack
 *   from the WHOLE deck and handed the winner everything it staked, produced rows this repair
 *   was STRUCTURALLY BLIND TO: `RESERVED_N(undefined)` is false, every time, silently.
 * ⚑ THE REPAIR KEYED ON A FIELD THE OTHER WRITER NEVER WROTE — which is this project's own
 *   recorded rule ("reserve by a key that cannot go missing") turned on the repair itself. It
 *   resolves the row's SLUG against the deck now, so a row's id is recovered whether or not
 *   anybody wrote it down.
 * ⚑ AND `src` IS WHAT KEEPS THE ARTIST'S REAL CARDS. A gacha hero (12-22) pulled from a PACK is
 *   legitimate and must survive; the same card handed over by the arena never was. Only the row
 *   itself can tell them apart, so the arena stamps `src:'arena'` and a row with no `n` at all
 *   is a legacy arena row by construction — pack rows have carried `n` since the day they were
 *   written. A pack-pulled 12-22 is left exactly where it is.
 * ⛔ EARNED TITLES ARE NOT TOUCHED AND CANNOT BE. A cleared title is a CLAIM SLIP in
 *   `urm_titles` (js/title-ledger.js), never a card row — its own header says "Nothing here
 *   awards anything." So a player who really did post a 2,000,000-point Rip Rocketer run keeps
 *   that claim whatever this function does to their vault. Verified before writing this, not
 *   assumed, because the one thing worse than the bug would be taking away a card somebody
 *   actually earned.
 *
 * ⚠ THE REPLACEMENT IS DETERMINISTIC, SEEDED BY THE ROW BEING REPLACED. A random swap would
 *   re-roll on every page load — a collector could refresh until they liked the card, which is
 *   a worse thing to build than the bug. Same bad row always yields the same field card.
 * ⚠ AND IT IS NOT SILENT. Quietly editing somebody's collection is the wrong shape even when
 *   the edit is correct; the swap leaves `swapped` on the row so the binder can say what
 *   happened, and it is announced once. */
const RESERVED_N = n => { const v = Number(n); return v >= 1 && v <= 33 && GACHA_IDS.indexOf(v) < 0; };
const HERO_N = n => { const v = Number(n); return v >= 1 && v <= 33; };
function healVault() {
  try {
    const raw = localStorage.getItem('urm_vault');
    if (!raw) return;
    const v = JSON.parse(raw);
    if (!Array.isArray(v) || !v.length) return;
    const field = DECK.filter(c => Number(c.id) > 33);
    if (!field.length) return;                 // nothing legitimate to offer — leave it alone
    /* recover an id from the slug, because the arena never wrote one */
    const idBySlug = new Map(DECK.map(c => [c.slug, Number(c.id)]));
    /* ⚑ ONE PREDICATE, THREE CASES, AND THE MIDDLE ONE IS THE ARTIST'S OWN CARDS:
     *   - id 1-11 or 23-33  → never obtainable by any means. Always swapped.
     *   - id 12-22 from a PACK (row carries `n`, no arena stamp) → legitimate. KEPT.
     *   - any hero id that came from the ARENA (`src:'arena'`, or no `n` at all, which is what
     *     every arena row written before today looks like) → swapped, all 33 of them, because
     *     the arena was never a legitimate source of a hero at any rate. */
    const bad = row => {
      if (!row) return false;
      const n = row.n != null ? Number(row.n) : idBySlug.get(row.slug);
      if (!HERO_N(n)) return false;
      if (RESERVED_N(n)) return true;                       // auction or earned — never legitimate
      return row.src === 'arena' || row.n == null;          // a gacha hero the arena handed over
    };
    /* ⛔ AND THE RETIRED 196 LEFT EVERY OLD FOLDER UNPLAYABLE. Artist, 2026-08-07: "no one can
     *   properly play / wager / ante right now." Measured: the hundred's slugs are "1".."100"
     *   and the retired set's are words ("blue-boar"), and the two share **ZERO** slugs — so a
     *   vault row saved before the clean-slate resolves to nothing the arena will deal. A
     *   collector with sixty cards had sixty rows and no hand.
     * ⚑ MIGRATED, NOT DELETED. The standing rule here is that `urm_*` keys are never wiped, and
     *   an empty shelf is a worse answer than a substituted one — so each dead row becomes a
     *   FIELD card, one for one, count and order preserved, and keeps `wasLegacy` so the binder
     *   can say what it used to be. Same deterministic hash as the hero swap: the same old card
     *   always yields the same new one, so nobody can refresh until they like the result. */
    const liveSlug = new Set(DECK.map(c => String(c.slug)));
    const stale = row => row && !row.forged && row.slug != null && !liveSlug.has(String(row.slug));

    let fixed = 0, moved = 0;
    const out = v.map(row => {
      if (stale(row)) {
        let h = 2166136261;
        for (const ch of 'legacy:' + String(row.slug)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
        const sub = field[Math.abs(h) % field.length];
        moved++;
        return Object.assign({}, row, { slug: sub.slug, n: sub.id, wasLegacy: String(row.slug) });
      }
      if (!bad(row)) return row;
      /* stable hash of the row we are replacing → the same substitute, every load, forever */
      const was = row.n != null ? Number(row.n) : idBySlug.get(row.slug);
      let h = 2166136261;
      for (const ch of String(row.slug) + ':' + was) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
      const sub = field[Math.abs(h) % field.length];
      fixed++;
      return Object.assign({}, row, { slug: sub.slug, n: sub.id, swapped: was });
    });
    if (!fixed && !moved) return;
    localStorage.setItem('urm_vault', JSON.stringify(out));
    const note = document.createElement('div');
    note.setAttribute('role', 'status');
    note.style.cssText = 'position:fixed;left:12px;right:12px;bottom:14px;z-index:2147483000;'
      + 'max-width:520px;margin:0 auto;padding:11px 14px;border:1px solid #1c7a48;border-radius:9px;'
      + 'background:#04180e;color:#d9ffe9;font:12.5px/1.5 \'Courier New\',monospace';
    /* ⚠ IT SAID "A PACK OFFERED" AND THE ARENA WAS THE BIGGER SOURCE BY FAR. A note that names
     *   the wrong cause is the same class of untruth as the bug — and this one has to survive
     *   being read by somebody who is annoyed, so it says what happened, what was NOT touched,
     *   and that the chain never moved. */
    const bits = [];
    if (moved) bits.push('<b style="color:#2bff80">' + moved + ' card' + (moved === 1 ? '' : 's') +
      '</b> from the retired set ' + (moved === 1 ? 'has' : 'have') +
      ' been brought over to the current deck, so ' + (moved === 1 ? 'it is' : 'they are') +
      ' playable again — same count, nothing lost.');
    if (fixed) bits.push('<b style="color:#ffd23b">' + fixed + ' card' + (fixed === 1 ? '' : 's') +
      '</b> reserved for the auctions and the earned titles ' + (fixed === 1 ? 'was' : 'were') +
      ' swapped out; the arena and the pack should never have offered ' +
      (fixed === 1 ? 'it' : 'them') + '. Nothing on-chain was affected — those 1/1s were never ' +
      'minted to anyone, and <b style="color:#2bff80">earned titles are untouched</b> ' +
      '(a cleared title is recorded separately and is not a card).');
    note.innerHTML = '<b>Your folder was updated.</b><br>' + bits.join('<br>') +
      ' <button style="margin-left:6px;min-height:32px;' +
      'background:#0a2a18;color:#2bff80;border:1px solid #1c7a48;border-radius:6px;' +
      'font:inherit;cursor:pointer;padding:3px 10px">ok</button>';
    note.querySelector('button').onclick = () => note.remove();
    document.body.appendChild(note);
    /* ⛔ AND IT HAS TO SAY IT CHANGED SOMETHING. The repair needs the manifest, so it is ASYNC —
     * the page has already drawn its hand from the un-migrated vault by the time this runs, and
     * rewriting localStorage under a rendered page changes nothing a player can see. Measured: 60
     * rows migrated correctly and the hand was still empty, i.e. the fix worked and the collector
     * still could not play. One event, and every surface that draws cards redraws. */
    try { window.dispatchEvent(new CustomEvent('urm:vault-fixed', { detail: { moved: moved, fixed: fixed } })); }
    catch (e) {}
  } catch (e) {}
}

  function boot() {
    if (ran) return; ran = true;
    /* ⚠ ROOT-ABSOLUTE: this module is loaded from pages at two different depths. */
    fetch('/cards/deck-manifest.json').then(r => r.json()).then(m => {
      DECK = (m && m.cards) || m || [];
      if (DECK.length) healVault();
    }).catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  return { heal: healVault, _boot: boot };
})();

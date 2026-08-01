/* upperdeckripmaster3030 — shared wager payout math (window.WagerPayout).
 *
 * The game economy for every battle game:
 *   • each player WAGERS $3030 (the ante) and stakes cards into one pot
 *   • a small RAKE burns from the pot — permanent, deflationary ("the token burns
 *     so the art lives"); the site burns each player's own rake on-chain at ante
 *   • the rest of the pot + the staked cards go into ESCROW and pay out to the
 *     PODIUM — 1st / 2nd / 3rd — with 1st taking the most
 *
 * Site/testnet layer: the rake burn is REAL (RipWallet.burn); the token-pot payout
 * is shown but settles for real only via the Phase-2 on-chain escrow contract.
 * Card payouts move in the local vault.
 *
 *   WagerPayout.rake(ante)                     -> whole $3030 each player burns
 *   WagerPayout.compute(ante, players, cards, myRank) -> full breakdown (below)
 */
window.WagerPayout = (function () {
  /* ── THE RAKE IS NOW SPLIT: HALF BURNS, HALF GOES TO THE TREASURY ──────────────────────────
   * Artist directive. The rake stays 10% of the pot; what changes is where it goes — 5% burns
   * permanently and 5% is paid to the studio treasury wallet.
   *
   * ⚑ WHY THIS EXISTS AT ALL. docs/ARTIST-REVENUE.md records that SuperRare has published
   * NOTHING about the creator revenue model on a Liquid Edition, so the artist currently has no
   * confirmed way to be paid by the edition itself. A treasury share of the game rake is income
   * this project controls outright and does not have to wait on an answer for.
   *
   * ⚠ AND IT CHANGES A PUBLIC PROMISE. Four surfaces said "no treasury, no fee wallet" and
   * "burned in full". That copy is now false and has been rewritten — a mechanic that quietly
   * contradicts the site is worse than one that is simply announced. See docs/TREASURY.md.
   *
   * ⚠ RAKE_PCT is kept as the single source of the 10% figure so BURN_PCT + TREASURY_PCT can
   * never silently drift apart from it; the assertion below is cheap and catches an edit that
   * changes one and forgets the other. */
  const RAKE_PCT = 0.10;            // total rake on the pot — unchanged
  const BURN_PCT = 0.05;            // ...of which this burns, permanently
  const TREASURY_PCT = 0.05;        // ...and this goes to the studio treasury
  const SPLIT = [0.50, 0.30, 0.20]; // 1st / 2nd / 3rd share of pot + cards
  if (Math.abs((BURN_PCT + TREASURY_PCT) - RAKE_PCT) > 1e-9)
    console.warn('[wager] rake split does not sum to RAKE_PCT — the pot maths is now wrong');

  /* What each player parts with at ante. `rake` stays the TOTAL (callers show it as one number
   * and it is what leaves the wallet); `rakeBurn`/`rakeTreasury` are its two halves.
   * ⚠ Split with floor+remainder, never two independent rounds: at ante 50 a naive
   * round(50*0.05) twice gives 3+3=6 against a rake of 5, i.e. the pot pays out more than it
   * took in. The remainder goes to the BURN, so rounding can only ever burn more, never pay the
   * treasury more than its share. */
  const rake = ante => Math.max(1, Math.round((+ante || 0) * RAKE_PCT));

  /* ⚑ THE SPLIT ONLY EXISTS IF THE SINK IS DEPLOYED, AND THE NUMBERS ON SCREEN MUST SAY SO.
   * `js/wallet.js` falls back to a plain 100% burn while `contracts.packSink` is empty, so with
   * it unset the chain burns the WHOLE rake while these figures would have claimed half of it
   * went to the studio. Asking the wallet here means all eight result screens tell the truth in
   * both states from ONE place, and they start reporting the split the moment the address is
   * pasted in — with no edit to any game. Defaults to "no split" when the wallet layer is absent
   * (practice mode, an embed, a page that doesn't load it), which is the honest assumption. */
  const splitLive = () => { try { return !!(window.RipWallet && window.RipWallet.hasSink && window.RipWallet.hasSink()); } catch { return false; } };
  const rakeTreasury = ante => splitLive() ? Math.floor(rake(ante) * (TREASURY_PCT / RAKE_PCT)) : 0;
  const rakeBurn = ante => rake(ante) - rakeTreasury(ante);

  // podium weights: 3+ players → 1st/2nd/3rd (50/30/20); heads-up (≤2) → winner takes all
  function podium(players) {
    return (players | 0) >= 3 ? SPLIT.slice() : [1];
  }
  // split an integer total across weights, remainder handed out top-down (1st first)
  function distribute(total, weights) {
    total = Math.max(0, Math.round(total));
    const out = weights.map(w => Math.floor(total * w));
    let rem = total - out.reduce((a, b) => a + b, 0);
    for (let i = 0; rem > 0 && out.length; i = (i + 1) % out.length) { out[i]++; rem--; }
    return out;
  }

  function compute(ante, players, cardsEach, myRank) {
    ante = +ante || 0; players = Math.max(1, players | 0); cardsEach = Math.max(0, cardsEach | 0);
    const grossPot = ante * players;
    const rakeTotal = Math.round(grossPot * RAKE_PCT);
    const treasury = splitLive() ? Math.floor(rakeTotal * (TREASURY_PCT / RAKE_PCT)) : 0;
    const burn = rakeTotal - treasury;         // remainder burns — see the note on rake()
    const netPot = grossPot - rakeTotal;
    const cardPot = players * cardsEach;
    const w = podium(players);
    const tokByPlace = distribute(netPot, w);
    const cardByPlace = distribute(cardPot, w);
    const place = (myRank != null && myRank >= 0 && myRank < w.length) ? myRank : -1;   // -1 = off the podium
    return {
      grossPot, rakeTotal, burn, treasury, netPot, cardPot,
      places: w.length, split: w,
      tokByPlace, cardByPlace,
      myPlace: place,                       // 0=1st, 1=2nd, 2=3rd, -1=none
      myTok: place >= 0 ? tokByPlace[place] : 0,
      myCards: place >= 0 ? cardByPlace[place] : 0,
      anteBurn: rakeBurn(ante),             // what each player BURNS on-chain at ante
      anteTreasury: rakeTreasury(ante),     // ...and what goes to the studio treasury
      anteRake: rake(ante),                 // the total that leaves the player's wallet
    };
  }

  const ordinal = i => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][i] || (i + 1) + 'th';

  return { compute, rake, rakeBurn, rakeTreasury, splitLive, ordinal,
           RAKE_PCT, BURN_PCT, TREASURY_PCT, SPLIT };
})();

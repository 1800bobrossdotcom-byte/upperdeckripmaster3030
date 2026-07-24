/* upperdeckripmaster3030 — shared wager payout math (window.WagerPayout).
 *
 * The game economy for every battle game:
 *   • each player WAGERS $UR3030 (the ante) and stakes cards into one pot
 *   • a small RAKE burns from the pot — permanent, deflationary ("the token burns
 *     so the art lives"); the site burns each player's own rake on-chain at ante
 *   • the rest of the pot + the staked cards go into ESCROW and pay out to the
 *     PODIUM — 1st / 2nd / 3rd — with 1st taking the most
 *
 * Site/testnet layer: the rake burn is REAL (RipWallet.burn); the token-pot payout
 * is shown but settles for real only via the Phase-2 on-chain escrow contract.
 * Card payouts move in the local vault.
 *
 *   WagerPayout.rake(ante)                     -> whole $UR3030 each player burns
 *   WagerPayout.compute(ante, players, cards, myRank) -> full breakdown (below)
 */
window.WagerPayout = (function () {
  const BURN_PCT = 0.10;            // small deflationary rake on the pot
  const SPLIT = [0.50, 0.30, 0.20]; // 1st / 2nd / 3rd share of pot + cards

  const rake = ante => Math.max(1, Math.round((+ante || 0) * BURN_PCT));

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
    const burn = Math.round(grossPot * BURN_PCT);
    const netPot = grossPot - burn;
    const cardPot = players * cardsEach;
    const w = podium(players);
    const tokByPlace = distribute(netPot, w);
    const cardByPlace = distribute(cardPot, w);
    const place = (myRank != null && myRank >= 0 && myRank < w.length) ? myRank : -1;   // -1 = off the podium
    return {
      grossPot, burn, netPot, cardPot,
      places: w.length, split: w,
      tokByPlace, cardByPlace,
      myPlace: place,                       // 0=1st, 1=2nd, 2=3rd, -1=none
      myTok: place >= 0 ? tokByPlace[place] : 0,
      myCards: place >= 0 ? cardByPlace[place] : 0,
      anteBurn: rake(ante),                 // what each player burns on-chain at ante
    };
  }

  const ordinal = i => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][i] || (i + 1) + 'th';

  return { compute, rake, ordinal, BURN_PCT, SPLIT };
})();

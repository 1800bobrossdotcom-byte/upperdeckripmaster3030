/* Upperdeck Ripmaster 3030 — CARD POWERS.
 *
 * Your cards are an ARMORY. Stake them into a game and they arm you: each card
 * amplifies your craft/operative (damage, fire-rate, shields, speed, score) and
 * can ACTIVATE specific guns and power-ups — and the whole thing flexes with LIVE
 * $UR3030 market activity read straight off the chain. Hotter chain = hotter cards.
 * You stake them, so you can lose them (they're the wager). ikyk.
 *
 * Shared by every cabinet (dogfight, riprocketer, section 9):
 *
 *   RipPowers.pollMarket()                 read the chain once → updates market (call on load + on an interval)
 *   RipPowers.getMarket()                  { heat, gasRatio, block, amp, ready }
 *   RipPowers.loadout(cards, market?)      cards = array of manifest card objects (slug,rarity,atk,def,trigger)
 *                                          → { dmg, rate, shield, speed, score, guns[], powerups[], amp, count, rank, summary }
 *   RipPowers.summary(loadout)             short HUD string
 *
 * Pure client-side; no writes. Degrades gracefully with no wallet / no chain.
 */
(() => {
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const RARITY = { common: 0, uncommon: 1, rare: 2, mythic: 3, prizm: 4 };
  const RARW   = [1, 1.35, 1.8, 2.4, 3.2];          // amplifier weight by rarity rank

  // gonzo card-trigger → the gun / power-up it can activate
  const TRIGGER_GUN = {
    'GAS STORM': 'rapid',   'STILL AIR': 'twin',    'BURN WAVE': 'spread',
    'MOON CANDLE': 'laser', 'RUG WIND': 'bomb',     'DEEP WATER': 'shield',
    'BLOCK OMEN': 'pierce', 'WHALE SONG': 'homing',
  };

  function cardSpec(card) {
    if (!card) return null;
    const rank = RARITY[card.rarity] != null ? RARITY[card.rarity] : 0;
    return { slug: card.slug, rarity: card.rarity, rank, w: RARW[rank],
      atk: +card.atk || 0, def: +card.def || 0, trigger: String(card.trigger || '').toUpperCase() };
  }

  // ── live market → a heat + an amplifier multiplier ──
  const market = { heat: 1, gasRatio: 0.5, block: 0, amp: 1, ready: false };
  function recompute() { market.amp = clamp(0.75 + (clamp(market.heat, 0.6, 2.6) - 0.7) * 0.5, 0.75, 1.7); return market.amp; }
  recompute();

  async function pollMarket() {
    const CFG = window.RIPMASTER_CHAIN || {}, rpcs = CFG.rpcs || ['https://ethereum-sepolia-rpc.publicnode.com'];
    for (const u of rpcs) {
      try {
        const c = new AbortController(), t = setTimeout(() => c.abort(), 4200);
        const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] }), signal: c.signal });
        clearTimeout(t); const j = await r.json(); const blk = j && j.result;
        if (blk && blk.number) {
          const gu = parseInt(blk.gasUsed || '0x0', 16), gl = parseInt(blk.gasLimit || '0x1', 16) || 1;
          market.gasRatio = clamp(gu / gl, 0.05, 1);
          market.heat = clamp(0.7 + market.gasRatio * 1.9, 0.7, 2.6);
          market.block = parseInt(blk.number, 16) || 0;
          market.ready = true; recompute(); return market;
        }
      } catch {}
    }
    return market;
  }
  const getMarket = () => market;

  // ── build the loadout your staked cards grant, scaled by the live market ──
  function loadout(cards, mkt) {
    mkt = mkt || market;
    const amp = (mkt && mkt.amp) || 1;
    const specs = (cards || []).map(cardSpec).filter(Boolean);
    let dmg = 1, rate = 1, shield = 0, speed = 1, score = 1, rank = 0;
    const guns = new Set(), powerups = new Set();
    for (const s of specs) {
      dmg   += s.atk * 0.028 + s.w * 0.05;      // attack + rarity → damage
      rate  += s.w * 0.03;                        // rarity → fire rate
      shield += s.def * 0.10 + s.rank * 0.35;     // defense + rarity → shields
      speed += s.w * 0.015;
      score += s.w * 0.06;
      rank = Math.max(rank, s.rank);
      if (s.rank >= 2) guns.add('spread');        // rare+ unlocks a spread
      if (s.rank >= 3) guns.add('laser');         // mythic+ unlocks the laser
      const g = TRIGGER_GUN[s.trigger]; if (g) guns.add(g);
      if (s.rank >= 4) powerups.add('overdrive'); // prizm → overdrive
      if (s.def >= 4) powerups.add('shield');
    }
    // the live chain amplifies everything (hotter market → hotter cards)
    dmg = 1 + (dmg - 1) * amp;
    rate = 1 + (rate - 1) * amp;
    score = 1 + (score - 1) * amp;
    speed = 1 + (speed - 1) * amp;
    shield = Math.round(shield * amp);
    const out = { dmg, rate, shield, speed, score, guns: [...guns], powerups: [...powerups], amp, count: specs.length, rank, ready: mkt.ready };
    out.summary = summary(out);
    return out;
  }

  function summary(L) {
    if (!L || !L.count) return 'no cards armed';
    const bits = [];
    if (L.dmg > 1.01) bits.push('+' + Math.round((L.dmg - 1) * 100) + '% dmg');
    if (L.shield > 0) bits.push('+' + L.shield + ' shield');
    if (L.rate > 1.01) bits.push('+' + Math.round((L.rate - 1) * 100) + '% rof');
    if (L.guns.length) bits.push(L.guns.join('/'));
    return '◈ ' + L.count + ' armed · mkt ×' + L.amp.toFixed(2) + (bits.length ? ' · ' + bits.join(' · ') : '');
  }

  window.RipPowers = { cardSpec, pollMarket, getMarket, loadout, summary, TRIGGER_GUN, RARITY };
})();

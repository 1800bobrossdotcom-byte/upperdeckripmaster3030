#!/usr/bin/env node
/* Fill-cost curve via CoW quotes. Quote only — nothing signed, nothing moves.
 * The question: what does it ACTUALLY cost to move $N through each venue, all-in
 * (CoW's feeAmount is gas + solver, so it is the honest all-in number for a signed order). */
const WALLET = '0xcFCFc8e42AEBFC58AB78093217C2C4bB186BAc86';
const T = {
  WETH: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18],
  FWA:  ['0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845', 18],
  T3030:['0x1D4bcbb505182a49303CC3B23EfF1E3157147A33', 18],
  RARE: ['0xba5BDe662c17e2aDFF1075610382B9B691296350', 18],
  USDC: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6],
};
const ETH_USD = 1919.63;
const units = (n, d) => BigInt(Math.round(n * 1e8)) * (10n ** BigInt(d)) / 100000000n;

async function q(sell, buy, amtHuman) {
  const [sa, sd] = T[sell], [ba, bd] = T[buy];
  const r = await fetch('https://api.cow.fi/mainnet/api/v1/quote', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sellToken: sa, buyToken: ba, from: WALLET, receiver: WALLET,
      sellAmountBeforeFee: units(amtHuman, sd).toString(),
      kind: 'sell', partiallyFillable: false, sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20', signingScheme: 'eip712', onchainOrder: false,
      priceQuality: 'optimal',
    }), signal: AbortSignal.timeout(25000),
  });
  const j = await r.json().catch(() => null);
  if (r.status !== 200) return { err: `${j?.errorType || r.status}` };
  return {
    out: Number(j.quote.buyAmount) / 10 ** bd,
    fee: Number(j.quote.feeAmount) / 10 ** sd,
    sell: Number(j.quote.sellAmount) / 10 ** sd,
  };
}

/* Marginal price at the smallest size = the reference. Bigger sizes reveal impact + fixed cost. */
async function curve(sell, buy, sizesHuman, usdOf) {
  console.log(`\n  ── ${sell} → ${buy} ────────────────────────────────────────────`);
  console.log('     notional   in           out              fee(sell)   fee%    px vs best');
  let best = null;
  const rows = [];
  for (const s of sizesHuman) {
    const r = await q(sell, buy, s);
    if (r.err) { console.log(`     ${('$' + usdOf(s).toFixed(0)).padEnd(10)} ⛔ ${r.err}`); continue; }
    const px = r.out / s;                 // gross px per unit sold BEFORE fee deduction
    if (best === null || px > best) best = px;
    rows.push({ s, r, px });
  }
  for (const { s, r, px } of rows) {
    const slip = (px / best - 1) * 100;
    console.log(`     ${('$' + usdOf(s).toFixed(0)).padEnd(10)} ${String(s).padEnd(12)} ${r.out.toFixed(6).padEnd(16)} ${r.fee.toFixed(6).padEnd(11)} ${(r.fee / s * 100).toFixed(2).padStart(5)}%  ${slip.toFixed(2).padStart(7)}%`);
  }
  return rows;
}

const which = process.argv[2] || 'all';
if (which === 'all' || which === 'rare') {
  // RARE is ~$0.01300 from the WETH->RARE quote: 3845.70 RARE per 0.026 ETH
  const RARE_USD = (0.026 * ETH_USD) / 3845.704497;
  console.log(`\n  RARE ≈ $${RARE_USD.toFixed(5)} (derived from the CoW WETH→RARE quote, not from a note)`);
  await curve('RARE', 'T3030', [100, 500, 1000, 2500, 5000, 10000, 20000], n => n * RARE_USD);
}
if (which === 'all' || which === 'fwa') {
  await curve('WETH', 'FWA', [0.005, 0.013, 0.026, 0.052, 0.104, 0.26], n => n * ETH_USD);
}
console.log('');

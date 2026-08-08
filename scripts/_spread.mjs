#!/usr/bin/env node
/* THE HURDLE, MEASURED WITHOUT SEQUENCING BIAS.
 *
 * The round-trip probe quoted buy then sell ~1s apart, and on a token doing +78%/24h that
 * gap is contaminated by real price movement — it printed +5% "profit" three times, which
 * is not free money, it is drift. Quoting BOTH SIDES SIMULTANEOUSLY removes it:
 *   ask = ETH you pay per token   ·   bid = ETH you receive per token
 *   round-trip cost = 1 - bid/ask   (the spread), and the fixed fee sits on top.
 *
 * Repeated N times so the answer comes with a spread of its own, not a single reading. */
const WALLET = '0xcFCFc8e42AEBFC58AB78093217C2C4bB186BAc86';
const T = {
  WETH: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18],
  FWA:  ['0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845', 18],
  T3030:['0x1D4bcbb505182a49303CC3B23EfF1E3157147A33', 18],
  RARE: ['0xba5BDe662c17e2aDFF1075610382B9B691296350', 18],
};
const u = (n, d) => BigInt(Math.round(n * 1e10)) * (10n ** BigInt(d)) / (10n ** 10n);

async function q(sell, buy, amtHuman) {
  const [sa, sd] = T[sell], [ba, bd] = T[buy];
  const r = await fetch('https://api.cow.fi/mainnet/api/v1/quote', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sellToken: sa, buyToken: ba, from: WALLET, receiver: WALLET,
      sellAmountBeforeFee: u(amtHuman, sd).toString(), kind: 'sell',
      partiallyFillable: false, sellTokenBalance: 'erc20', buyTokenBalance: 'erc20',
      signingScheme: 'eip712', onchainOrder: false, priceQuality: 'optimal',
    }), signal: AbortSignal.timeout(25000),
  });
  const j = await r.json().catch(() => null);
  if (r.status !== 200) return { err: j?.errorType || `HTTP ${r.status}` };
  return {
    gross: Number(j.quote.buyAmount) / 10 ** bd,
    fee: Number(j.quote.feeAmount) / 10 ** sd,
    net: Number(j.quote.sellAmount) / 10 ** sd,
  };
}

const ethUsd = parseFloat((await (await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')).json()).data.amount);
const N = Number(process.env.N || 5);
const ETH_SIZE = Number(process.env.SIZE || 0.026);   // ~$50, the realistic clip on an $80 book

console.log(`\n  BID / ASK AT ONE INSTANT — FWA, ${(ETH_SIZE * ethUsd).toFixed(0)} USD clips, ${N} samples`);
console.log(`  ETH $${ethUsd}   ${new Date().toISOString()}\n`);
console.log('     #   ask $/FWA     bid $/FWA     spread    fee(buy)$  fee(sell)$   all-in round trip');

const rows = [];
for (let i = 0; i < N; i++) {
  /* Both legs in flight together. The sell size is chosen to match the buy's notional. */
  const probe = await q('WETH', 'FWA', ETH_SIZE);
  if (probe.err) { console.log(`     ${i}   ⛔ ${probe.err}`); await new Promise(s => setTimeout(s, 2000)); continue; }
  const tokens = probe.gross;
  const [buy, sell] = await Promise.all([q('WETH', 'FWA', ETH_SIZE), q('FWA', 'WETH', tokens)]);
  if (buy.err || sell.err) { console.log(`     ${i}   ⛔ ${buy.err || sell.err}`); await new Promise(s => setTimeout(s, 2000)); continue; }

  const ask = (ETH_SIZE * ethUsd) / buy.gross;          // USD paid per FWA received
  const bid = (sell.gross * ethUsd) / tokens;           // USD received per FWA sold
  const spread = (1 - bid / ask) * 100;
  const feeBuyUsd = buy.fee * ethUsd;
  const feeSellUsd = sell.fee * ask;                     // fee is denominated in FWA on the sell
  const rt = (1 - (sell.gross / ETH_SIZE)) * 100;
  rows.push({ ask, bid, spread, rt });
  console.log(`     ${i}   ${ask.toFixed(6)}      ${bid.toFixed(6)}     ${spread.toFixed(2).padStart(6)}%   ${feeBuyUsd.toFixed(3).padStart(8)}   ${feeSellUsd.toFixed(3).padStart(9)}   ${rt.toFixed(2).padStart(7)}%`);
  await new Promise(s => setTimeout(s, 2500));
}

if (rows.length) {
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const sp = rows.map(r => r.spread), rt = rows.map(r => r.rt);
  console.log(`\n     spread      min ${Math.min(...sp).toFixed(2)}%  median ${med(sp).toFixed(2)}%  max ${Math.max(...sp).toFixed(2)}%`);
  console.log(`     round trip  min ${Math.min(...rt).toFixed(2)}%  median ${med(rt).toFixed(2)}%  max ${Math.max(...rt).toFixed(2)}%`);
  console.log(`\n  ⚑ The MEDIAN SPREAD is the hurdle: every strategy must beat it on every round trip,`);
  console.log(`     before it earns anything, whether the call was right or wrong.`);
}
console.log('');

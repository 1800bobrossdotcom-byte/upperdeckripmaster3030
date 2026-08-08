#!/usr/bin/env node
/* throwaway probe: does CoW Protocol have a route for these tokens on mainnet?
 * Quote only. Nothing is signed, nothing moves. */
const WALLET = '0xcFCFc8e42AEBFC58AB78093217C2C4bB186BAc86';
const T = {
  WETH: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18],
  FWA:  ['0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845', 18],
  T3030:['0x1D4bcbb505182a49303CC3B23EfF1E3157147A33', 18],
  USDC: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6],
  RARE: ['0xba5BDe662c17e2aDFF1075610382B9B691296350', 18],
};
const units = (n, d) => BigInt(Math.round(n * 1e6)) * (10n ** BigInt(d)) / 1000000n;

async function quote(sell, buy, amtHuman) {
  const [sa, sd] = T[sell], [ba, bd] = T[buy];
  const body = {
    sellToken: sa, buyToken: ba, from: WALLET, receiver: WALLET,
    sellAmountBeforeFee: units(amtHuman, sd).toString(),
    kind: 'sell', partiallyFillable: false,
    sellTokenBalance: 'erc20', buyTokenBalance: 'erc20',
    signingScheme: 'eip712', onchainOrder: false, priceQuality: 'optimal',
  };
  const r = await fetch('https://api.cow.fi/mainnet/api/v1/quote', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
  });
  const j = await r.json().catch(() => null);
  const tag = `${sell} -> ${buy}  (${amtHuman} ${sell})`;
  if (r.status !== 200) { console.log(`  ⛔ ${tag}\n     HTTP ${r.status}  ${j?.errorType}: ${j?.description}`); return null; }
  const q = j.quote;
  const out = Number(q.buyAmount) / 10 ** bd;
  const fee = Number(q.feeAmount) / 10 ** sd;
  console.log(`  ✅ ${tag}`);
  console.log(`     buyAmount  ${out.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${buy}`);
  console.log(`     feeAmount  ${fee} ${sell}   (= ${(fee / amtHuman * 100).toFixed(3)}% of the sell)`);
  console.log(`     validTo    ${new Date(q.validTo * 1000).toISOString()}   id ${j.id ?? '—'}`);
  return { out, fee };
}

const pairs = process.argv.slice(2);
console.log(`\n  CoW Protocol mainnet — quote probe (nothing signed)\n`);
for (const p of (pairs.length ? pairs : ['WETH:FWA:0.026', 'FWA:WETH:3240', 'WETH:USDC:0.026', 'WETH:RARE:0.026', 'RARE:T3030:100'])) {
  const [a, b, n] = p.split(':');
  try { await quote(a, b, Number(n)); } catch (e) { console.log(`  ⛔ ${p} threw: ${e.message}`); }
  console.log('');
}

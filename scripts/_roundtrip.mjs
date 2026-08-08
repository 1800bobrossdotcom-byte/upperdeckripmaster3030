#!/usr/bin/env node
/* THE ONLY ARITHMETIC THAT DECIDES WHETHER A TRADING BOT CAN WORK HERE.
 *
 * Buy X of a token, sell it straight back. How much of the stake comes home?
 * That gap is what every strategy must beat BEFORE it makes a cent — it is the
 * hurdle rate, and it is paid on every single round trip whether you are right or wrong.
 *
 * Quote-only. Nothing signed, nothing moves. */
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
  for (let attempt = 0; attempt < 3; attempt++) {
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
    if (r.status === 200) return { out: Number(j.quote.buyAmount) / 10 ** bd, fee: Number(j.quote.feeAmount) / 10 ** sd };
    /* ⚠ InsufficientLiquidity from CoW is INTERMITTENT — measured flipping at identical size.
     *   Retry before believing it, or a solver hiccup gets recorded as a fact about the pool. */
    if (attempt === 2) return { err: j?.errorType || `HTTP ${r.status}` };
    await new Promise(s => setTimeout(s, 1500));
  }
}

const ethUsd = parseFloat((await (await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')).json()).data.amount);
console.log(`\n  ROUND-TRIP HURDLE   ETH $${ethUsd}   ${new Date().toISOString()}`);
console.log(`  buy the token, sell it straight back, same instant. What comes home?\n`);

for (const [tok, sizesEth] of [['FWA', [0.005, 0.013, 0.026, 0.052, 0.104]]]) {
  console.log(`  ── ${tok} via CoW (signed order, solver pays gas out of feeAmount) ──`);
  console.log('     stake        buy fee     tokens out      sell back      ETH home      round trip');
  for (const e of sizesEth) {
    const buy = await q('WETH', tok, e);
    if (buy.err) { console.log(`     $${(e * ethUsd).toFixed(0).padEnd(11)} ⛔ ${buy.err}`); continue; }
    const back = await q(tok, 'WETH', buy.out);
    if (back.err) { console.log(`     $${(e * ethUsd).toFixed(0).padEnd(11)} bought ${buy.out.toFixed(2)} — sell back ⛔ ${back.err}`); continue; }
    const home = back.out;
    const rt = (home / e - 1) * 100;
    console.log(`     $${(e * ethUsd).toFixed(0).padEnd(11)} ${buy.fee.toFixed(6).padEnd(11)} ${buy.out.toFixed(2).padEnd(15)} ${back.fee.toFixed(2).padEnd(14)} ${home.toFixed(6).padEnd(13)} ${rt.toFixed(2).padStart(7)}%  (−$${((e - home) * ethUsd).toFixed(2)})`);
  }
  console.log('');
}

/* $3030 has no WETH route on CoW — do the RARE leg instead, and say so. */
console.log('  ── $3030: CoW has NO WETH→$3030 route (measured: NoLiquidity). RARE leg only ──');
for (const r of [2500, 10000]) {
  const buy = await q('RARE', 'T3030', r);
  if (buy.err) { console.log(`     ${r} RARE  ⛔ ${buy.err}`); continue; }
  const back = await q('T3030', 'RARE', buy.out);
  if (back.err) { console.log(`     ${r} RARE → ${buy.out.toFixed(2)} $3030 → sell back ⛔ ${back.err}`); continue; }
  console.log(`     ${String(r).padEnd(7)} RARE → ${buy.out.toFixed(2)} $3030 → ${back.out.toFixed(2)} RARE   round trip ${((back.out / r - 1) * 100).toFixed(2)}%`);
}
console.log('');

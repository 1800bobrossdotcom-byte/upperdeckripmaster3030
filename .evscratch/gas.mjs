import { createPublicClient, http, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync } from 'node:fs';
const src = readFileSync('js/chain-config.js','utf8'); const w={}; new Function('window',src)(w);
const CFG = w.RIPMASTER_CHAIN;
const out = [];
for (const url of CFG.rpcs) {
  try {
    const c = createPublicClient({ chain: mainnet, transport: http(url, {timeout:15000}) });
    const [bn, blk, gp] = await Promise.all([c.getBlockNumber(), c.getBlock(), c.getGasPrice()]);
    out.push({ url: url.replace('https://',''), bn: Number(bn),
      baseFeeGwei: Number(blk.baseFeePerGas)/1e9, gasPriceGwei: Number(gp)/1e9,
      gasUsedPct: (Number(blk.gasUsed)/Number(blk.gasLimit)*100).toFixed(1) });
  } catch(e){ out.push({url, err: String(e).slice(0,80)}); }
}
console.table(out);
// ETH/USD from two independent sources
const g = async (u,p)=>{try{const r=await fetch(u);return p(await r.json());}catch(e){return null;}};
const cb = await g('https://api.coinbase.com/v2/prices/ETH-USD/spot', j=>parseFloat(j?.data?.amount));
const kr = await g('https://api.kraken.com/0/public/Ticker?pair=ETHUSD', j=>parseFloat(j?.result?.XETHZUSD?.c?.[0]));
console.log('ETH/USD coinbase', cb, ' kraken', kr);
const base = out.filter(o=>o.baseFeeGwei).map(o=>o.baseFeeGwei);
const med = base.sort((a,b)=>a-b)[Math.floor(base.length/2)];
const eth = cb||kr;
console.log('median baseFee gwei', med);
for (const [label, gas] of [['v4 swap (no hook)',110000],['v4 swap (hooked)',160000],['approve',28000],['mint v4 LP position',260000],['ERC20 transfer',21000]]) {
  const tip = 0.001; // gwei priority — measured typical floor
  const cost = (med+tip)*1e-9*gas*eth;
  console.log(`${label.padEnd(22)} ${gas} gas -> $${cost.toFixed(5)}`);
}

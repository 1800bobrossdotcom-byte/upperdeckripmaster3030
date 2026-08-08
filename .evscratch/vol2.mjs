import { parseAbiItem } from 'viem';
import { anyRpc, logsRange } from './lib.mjs';
const PM='0x000000000004444c5dc75cB358380D2e3dE08A90';
const ID='0x230ecd3c25b44af30db59c15f70df7794eb13f67a200f230b7400daa96fe804d';
const ev=parseAbiItem('event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)');
const HEAD=await anyRpc(c=>c.getBlockNumber());
const FROM=HEAD-7200n;
const logs=await logsRange({address:PM,event:ev,args:{id:ID}}, FROM, HEAD, 800n);
console.log('FWA main pool, last 7200 blocks (~24h):', logs.length,'swaps');
const ETH=1919.55;
let ethRecv=0, ethPaid=0, buys=0, sells=0, feeVals=new Set();
const path=[];
for(const g of logs){ const a=g.args; feeVals.add(a.fee);
  // v4 Swap deltas are CALLER-perspective: amount0>0 = caller received ETH = SELL of FWA
  if(a.amount0>0n){ ethRecv+=Number(a.amount0)/1e18; sells++; } else { ethPaid+=-Number(a.amount0)/1e18; buys++; }
  path.push({b:Number(g.blockNumber),t:a.tick,L:a.liquidity}); }
console.log(`caller BUYS of FWA (ETH paid in): ${buys}  = $${(ethPaid*ETH).toFixed(0)}`);
console.log(`caller SELLS of FWA (ETH out)   : ${sells} = $${(ethRecv*ETH).toFixed(0)}`);
console.log(`one-way ETH-leg volume total    : $${((ethPaid+ethRecv)*ETH).toFixed(0)}`);
console.log(`swap 'fee' field values seen    : ${[...feeVals].join(', ')}`);
console.log(`in-range L now vs 24h ago       : ${path.at(-1)?.L} vs ${path[0]?.L}`);
// hourly tick series
const bucket=new Map(); for(const x of path) bucket.set(Math.floor((x.b-Number(FROM))/300), x.t);
const ks=[...bucket.keys()].sort((a,b)=>a-b); const s=ks.map(k=>bucket.get(k));
const r=[]; for(let i=1;i<s.length;i++) r.push((s[i]-s[i-1])*1e-4);
const m=r.reduce((a,b)=>a+b,0)/r.length, sd=Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/(r.length-1));
console.log(`\nhourly buckets n=${s.length}  sd=${(sd*100).toFixed(2)}%/hr  daily sigma ${(sd*Math.sqrt(24)*100).toFixed(1)}%  annualised ${(sd*Math.sqrt(24*365)*100).toFixed(0)}%`);
console.log(`24h tick span ${Math.min(...s)}..${Math.max(...s)} = ${((Math.pow(1.0001,Math.max(...s)-Math.min(...s))-1)*100).toFixed(1)}% high/low`);
console.log(`mean |hourly move| ${(r.reduce((a,b)=>a+Math.abs(b),0)/r.length*100).toFixed(2)}% ; hours moving >2.0%: ${r.filter(x=>Math.abs(x)>0.02).length}/${r.length}`);
// per-swap absolute tick moves: how big is a typical swap's footprint
const per=[]; for(let i=1;i<path.length;i++) per.push(Math.abs(path[i].t-path[i-1].t)*1e-4);
per.sort((a,b)=>a-b);
console.log(`per-swap |price move|: median ${(per[Math.floor(per.length/2)]*100).toFixed(3)}%  p90 ${(per[Math.floor(per.length*0.9)]*100).toFixed(2)}%`);

import { createPublicClient, http, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';
const c=createPublicClient({chain:mainnet,transport:http('https://eth.drpc.org',{timeout:60000})});
const PM='0x000000000004444c5dc75cB358380D2e3dE08A90';
const ID='0x230ecd3c25b44af30db59c15f70df7794eb13f67a200f230b7400daa96fe804d';
const ev=parseAbiItem('event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)');
const HEAD=await c.getBlockNumber(); const FROM=HEAD-7200n; // ~24h at 12.02s
const logs=[]; for(let f=FROM;f<=HEAD;f+=2000n){ const t=f+1999n>HEAD?HEAD:f+1999n;
  logs.push(...await c.getLogs({address:PM,event:ev,args:{id:ID},fromBlock:f,toBlock:t})); }
console.log('FWA main pool, last ~24h:', logs.length,'swaps over',Number(HEAD-FROM),'blocks');
let volEthIn=0, volEthOut=0, buys=0, sells=0;
const ticks=[];
for(const g of logs){ const a=g.args;
  if(a.amount0>0n){ volEthIn+=Number(a.amount0)/1e18; buys++; } else { volEthOut+=-Number(a.amount0)/1e18; sells++; }
  ticks.push({b:Number(g.blockNumber), t:a.tick, fee:a.fee}); }
const ETH=1919.55;
console.log(`buys(ETH in) ${buys}  sells ${sells}`);
console.log(`ETH volume in  $${(volEthIn*ETH).toFixed(0)}   out $${(volEthOut*ETH).toFixed(0)}   TOTAL one-way $${((volEthIn+volEthOut)*ETH).toFixed(0)}`);
console.log(`fee field on swaps: ${[...new Set(ticks.map(x=>x.fee))].join(',')}`);
// realized vol from the tick path, sampled per 300 blocks (~1h)
const byHr=new Map(); for(const x of ticks){ const k=Math.floor((x.b-Number(FROM))/300); byHr.set(k,x.t); }
const keys=[...byHr.keys()].sort((a,b)=>a-b); const series=keys.map(k=>byHr.get(k));
const rets=[]; for(let i=1;i<series.length;i++){ rets.push((series[i]-series[i-1])*1e-4); } // log-return ≈ Δtick*0.0001
const mean=rets.reduce((a,b)=>a+b,0)/rets.length;
const sd=Math.sqrt(rets.reduce((a,b)=>a+(b-mean)**2,0)/(rets.length-1));
console.log(`\nhourly log-returns: n=${rets.length}  sd=${(sd*100).toFixed(2)}%/hr  -> daily sigma ${(sd*Math.sqrt(24)*100).toFixed(1)}%  annualised ${(sd*Math.sqrt(24*365)*100).toFixed(0)}%`);
console.log(`tick range 24h: min ${Math.min(...series)} max ${Math.max(...series)} = ${((Math.pow(1.0001,Math.max(...series)-Math.min(...series))-1)*100).toFixed(1)}% price range`);
// how many hourly moves exceeded the 2.0% round-trip cost?
const big=rets.filter(r=>Math.abs(r)>0.02).length;
console.log(`hourly moves > 2.0% (the measured round-trip cost): ${big} of ${rets.length}`);
const mean_abs=rets.reduce((a,b)=>a+Math.abs(b),0)/rets.length;
console.log(`mean |hourly move| = ${(mean_abs*100).toFixed(2)}%`);

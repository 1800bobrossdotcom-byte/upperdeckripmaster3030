import { parseAbi, parseAbiItem, parseEther } from 'viem';
import { anyRpc, logsRange } from './lib.mjs';
const Q='0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203';
const T='0x1D4bcbb505182a49303CC3B23EfF1E3157147A33', RARE='0xba5BDe662c17e2aDFF1075610382B9B691296350';
const K={currency0:T,currency1:RARE,fee:0,tickSpacing:60,hooks:'0x8Ff5660951C974f4806F0bEF9A32bcf35d3aE0cC'};
const abi=parseAbi([
 'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
 'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
 'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)']);
const q=async(z,a)=>{try{const r=await anyRpc(c=>c.simulateContract({address:Q,abi,functionName:'quoteExactInputSingle',
  args:[{poolKey:K,zeroForOne:z,exactAmount:a,hookData:'0x'}]}));return r.result[0];}catch(e){return null;}};
console.log('=== $3030/RARE pool: hook fee + round trip (mid 7.3412 RARE/$3030) ===');
for(const n of [10,100,1000,5000]){
  const sell=await q(true, BigInt(n)*10n**18n);            // 3030 -> RARE
  if(!sell){console.log(n,'revert');continue;}
  const back=await q(false, sell);                          // RARE -> 3030
  const rt = back? 1-Number(back)/Number(BigInt(n)*10n**18n):null;
  console.log(` ${String(n).padStart(5)} $3030 -> ${(Number(sell)/1e18).toFixed(2)} RARE (eff ${(Number(sell)/1e18/n).toFixed(4)} vs mid 7.3412 = ${(((Number(sell)/1e18/n)/7.3412-1)*100).toFixed(2)}%)`
    + (rt!==null? `  | round trip back: ${(rt*100).toFixed(3)}% cost`:''));
}
console.log('\n=== RARE market depth (you must buy RARE before you can buy $3030) ===');
const r=await (await fetch('https://api.dexscreener.com/latest/dex/tokens/'+RARE)).json();
for(const p of (r.pairs||[]).slice(0,4)) console.log(` ${p.dexId} ${p.baseToken.symbol}/${p.quoteToken.symbol} $${p.priceUsd} liq $${Math.round(p.liquidity?.usd||0)} vol24 $${Math.round(p.volume?.h24||0)}`);

console.log('\n=== FWA transfer tax: compare pool delta vs ERC20 Transfer in the same tx ===');
const PM='0x000000000004444c5dc75cB358380D2e3dE08A90';
const FWA='0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';
const ID='0x230ecd3c25b44af30db59c15f70df7794eb13f67a200f230b7400daa96fe804d';
const sev=parseAbiItem('event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)');
const HEAD=await anyRpc(c=>c.getBlockNumber());
const sw=await logsRange({address:PM,event:sev,args:{id:ID}}, HEAD-200n, HEAD, 100n);
console.log('recent swaps sampled:', sw.length);
const tev=parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
let checked=0;
for(const g of sw.slice(-6)){
  const rc=await anyRpc(c=>c.getTransactionReceipt({hash:g.transactionHash}));
  const xfers=rc.logs.filter(l=>l.address.toLowerCase()===FWA.toLowerCase());
  const amt1=g.args.amount1<0n? -g.args.amount1 : g.args.amount1;
  // find the transfer touching the PoolManager
  const pmX=xfers.map(l=>{try{return BigInt(l.data);}catch{return 0n;}});
  const match=pmX.some(v=> v===amt1);
  console.log(` tx ${g.transactionHash.slice(0,12)} pool |amount1| ${amt1} | FWA Transfer values ${pmX.join(',')} | exact match: ${match}`);
  if(++checked>=4) break;
}

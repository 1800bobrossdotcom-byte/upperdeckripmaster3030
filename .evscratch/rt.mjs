import { createPublicClient, http, parseEther, parseAbi, toFunctionSelector } from 'viem';
import { mainnet } from 'viem/chains';
const c = createPublicClient({chain:mainnet, transport:http('https://eth.drpc.org',{timeout:30000})});
// decode the revert selector we saw
for(const sig of ['NotEnoughLiquidity(bytes32)','PriceLimitOutOfBounds(uint160)','PriceLimitAlreadyExceeded(uint160,uint160)','InvalidSqrtPrice(uint160)','SwapAmountCannotBeZero()','UnexpectedRevertBytes(bytes)','QuoteSwap(uint256)','NotPoolManager()','PoolNotInitialized()'])
  { const s=toFunctionSelector(sig); if(s==='0x6190b2b0') console.log('REVERT 0x6190b2b0 =', sig); }
const Q='0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203';
const FWA='0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845', Z='0x0000000000000000000000000000000000000000';
const KEYS={ main:{currency0:Z,currency1:FWA,fee:0,tickSpacing:60,hooks:'0x2C67ebA8A50AF0dB5Fba55F725247a75CbDA6444'},
             a08:{currency0:Z,currency1:FWA,fee:8550,tickSpacing:86,hooks:Z} };
const abi = parseAbi([
 'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
 'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
 'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)']);
const q = async (k,z,a)=>{ try{ const r=await c.simulateContract({address:Q,abi,functionName:'quoteExactInputSingle',
  args:[{poolKey:KEYS[k],zeroForOne:z,exactAmount:a,hookData:'0x'}]}); return r.result; }catch(e){return null;} };

console.log('\n=== ROUND TRIP IN ONE POOL (isolates fee, tiny size ⇒ ~no impact) ===');
for (const k of ['main','a08']) {
  for (const sz of ['0.005','0.05','0.5','2']) {
    const inw = parseEther(sz);
    const r1 = await q(k,true,inw); if(!r1) { console.log(k,sz,'revert'); continue; }
    const r2 = await q(k,false,r1[0]); if(!r2) { console.log(k,sz,'revert back'); continue; }
    const back = r2[0];
    const loss = 1 - Number(back)/Number(inw);
    console.log(`${k.padEnd(5)} ${sz.padStart(6)} ETH -> ${(Number(r1[0])/1e18).toFixed(0).padStart(9)} FWA -> ${(Number(back)/1e18).toFixed(6)} ETH | round-trip cost ${(loss*100).toFixed(3)}%  ($${(loss*Number(sz)*1919.55).toFixed(4)})  gas est ${r1[1]}/${r2[1]}`);
  }
}
console.log('\n=== CROSS-POOL ARB: buy main -> sell a08, and reverse ===');
for (const sz of ['0.01','0.1','1']) {
  const inw=parseEther(sz);
  const b=await q('main',true,inw); const s=b?await q('a08',false,b[0]):null;
  if(b&&s){ const pnl=Number(s[0])-Number(inw); console.log(`buy main / sell a08  ${sz} ETH -> ${(pnl/1e18).toFixed(7)} ETH  ($${(pnl/1e18*1919.55).toFixed(4)}) gross`); }
  const b2=await q('a08',true,inw); const s2=b2?await q('main',false,b2[0]):null;
  if(b2&&s2){ const pnl=Number(s2[0])-Number(inw); console.log(`buy a08  / sell main ${sz} ETH -> ${(pnl/1e18).toFixed(7)} ETH  ($${(pnl/1e18*1919.55).toFixed(4)}) gross`); }
}

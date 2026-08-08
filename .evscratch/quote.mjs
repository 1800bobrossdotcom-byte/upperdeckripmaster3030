import { createPublicClient, http, parseEther, formatEther, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
const c = createPublicClient({chain:mainnet, transport:http('https://eth.drpc.org',{timeout:30000})});
const A = {
  QUOTER:'0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203',
  STATEVIEW:'0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227',
  POSM:'0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e',
};
for(const [k,v] of Object.entries(A)){ const b=await c.getBytecode({address:v}); console.log(k, v, b? b.length/2-1+' bytes':'NO CODE'); }
const FWA='0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845', Z='0x0000000000000000000000000000000000000000';
const KEYS = {
  main:  {currency0:Z,currency1:FWA,fee:0,tickSpacing:60,hooks:'0x2C67ebA8A50AF0dB5Fba55F725247a75CbDA6444'},
  a05a:  {currency0:Z,currency1:FWA,fee:8600,tickSpacing:86,hooks:Z},
  a05b:  {currency0:Z,currency1:FWA,fee:8500,tickSpacing:85,hooks:Z},
  a08:   {currency0:Z,currency1:FWA,fee:8550,tickSpacing:86,hooks:Z},
};
const abi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
  'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
]);
async function q(key, zeroForOne, amt){
  try{
    const r = await c.simulateContract({address:A.QUOTER, abi, functionName:'quoteExactInputSingle',
      args:[{poolKey:KEYS[key], zeroForOne, exactAmount:amt, hookData:'0x'}]});
    return r.result[0];
  }catch(e){ return {err:String(e.shortMessage||e).slice(0,120)}; }
}
console.log('\n--- ETH -> FWA (buy), 0.1 ETH in ---');
const IN = parseEther('0.1');
const spot = 110882; // FWA per ETH, main pool tick
for(const k of Object.keys(KEYS)){
  const out = await q(k,true,IN);
  if(typeof out!=='bigint'){ console.log(k.padEnd(6), out.err); continue; }
  const fwa = Number(out)/1e18;
  console.log(k.padEnd(6), fwa.toFixed(0).padStart(9),'FWA  | eff price', (0.1/fwa*1919.55).toFixed(6),'USD/FWA',
    '| vs main-spot slippage+fee', (((0.1*spot)/fwa-1)*100).toFixed(2)+'%');
}
console.log('\n--- FWA -> ETH (sell), 10,000 FWA in ---');
const INF = 10000n*10n**18n;
for(const k of Object.keys(KEYS)){
  const out = await q(k,false,INF);
  if(typeof out!=='bigint'){ console.log(k.padEnd(6), out.err); continue; }
  const eth = Number(out)/1e18;
  console.log(k.padEnd(6), eth.toFixed(6).padStart(11),'ETH  | eff price',(eth/10000*1919.55).toFixed(6),'USD/FWA');
}

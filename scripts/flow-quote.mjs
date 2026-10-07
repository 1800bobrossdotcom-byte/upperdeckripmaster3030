/* Is the hook's 1% charged on BOTH legs, or only on buys?  Simulate both directions with the
 * v4 Quoter and compare the realised rate against the pool's mid. */
import { createPublicClient, http, parseAbi, parseEther, formatEther, parseUnits, formatUnits, keccak256, encodeAbiParameters } from 'viem';
import { mainnet } from 'viem/chains';
const c=createPublicClient({chain:mainnet,transport:http('https://gateway.tenderly.co/public/mainnet',{timeout:30000})});
const PM='0x000000000004444c5dc75cB358380D2e3dE08A90';
const FWA='0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';
const ZERO='0x0000000000000000000000000000000000000000';
const HOOK='0x2C67ebA8A50AF0dB5Fba55F725247a75CbDA6444';
const KEY={currency0:ZERO,currency1:FWA,fee:0,tickSpacing:60,hooks:HOOK};

/* find a live quoter */
const CANDS=['0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203','0x3972c00f7ed4885e145823eb7C655375D275A1c5',
             '0x0d5e0F971ED27FBfF6c2837bf31316121532048D','0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af'];
let Q=null;
for(const a of CANDS){ const code=await c.getBytecode({address:a}).catch(()=>null);
  if(code&&code!=='0x'){ console.log('candidate quoter',a,(code.length/2-1),'bytes'); if(!Q)Q=a; } }
if(!Q){ console.log('⛔ no quoter found at the known addresses'); process.exit(0); }

const ABI=parseAbi([
 'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
 'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
 'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
]);

/* mid price from slot0 */
const slot=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],
  [keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint24'},{type:'int24'},{type:'address'}],
    [KEY.currency0,KEY.currency1,KEY.fee,KEY.tickSpacing,KEY.hooks])), 6n]));
const w=BigInt(await c.readContract({address:PM,abi:parseAbi(['function extsload(bytes32) view returns (bytes32)']),functionName:'extsload',args:[slot]}));
const sq=Number(w&((1n<<160n)-1n))/2**96;
const mid=sq*sq;                    // FWA per ETH
console.log(`  mid: 1 ETH = ${mid.toFixed(0)} FWA   (1 FWA = ${(1/mid).toExponential(4)} ETH)`);

async function q(zeroForOne, amt){
  try{
    const {result}=await c.simulateContract({address:Q,abi:ABI,functionName:'quoteExactInputSingle',
      args:[{poolKey:KEY,zeroForOne,exactAmount:amt,hookData:'0x'}]});
    return result[0];
  }catch(e){ return {err:String(e.shortMessage||e.message).slice(0,110)}; }
}
console.log('\n  ── BUY: 0.05 ETH in, FWA out ──');
const buy=await q(true, parseEther('0.05'));
if(buy&&buy.err) console.log('   quote failed:',buy.err);
else { const got=Number(formatUnits(buy,18)); const ideal=0.05*mid;
  console.log(`   got ${got.toFixed(0)} FWA, mid would give ${ideal.toFixed(0)} → cost ${(100*(1-got/ideal)).toFixed(4)}%`); }

console.log('\n  ── SELL: the same FWA back, ETH out ──');
const amtF = buy && !buy.err ? buy : parseUnits('3000000',18);
const sell=await q(false, amtF);
if(sell&&sell.err) console.log('   quote failed:',sell.err);
else { const gotE=Number(formatEther(sell)); const idealE=Number(formatUnits(amtF,18))/mid;
  console.log(`   got ${gotE.toFixed(6)} ETH, mid would give ${idealE.toFixed(6)} → cost ${(100*(1-gotE/idealE)).toFixed(4)}%`);
  if(buy&&!buy.err) console.log(`\n   ⚑ FULL ROUND TRIP on 0.05 ETH: out with ${gotE.toFixed(6)} ETH = ${(100*(gotE/0.05-1)).toFixed(3)}%`); }

import { parseAbiItem, parseAbi, parseEther } from 'viem';
import { anyRpc, logsRange } from './lib.mjs';
const PM='0x000000000004444c5dc75cB358380D2e3dE08A90', POSM='0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e';
const ID='0x9a7e4306112ddeb2527bcc97b73c74624d5c65aca9fccfae4e389cf061192ca7';
const HIS='0xcFCFc8e42AEBFC58AB78093217C2C4bB186BAc86';
const ml=parseAbiItem('event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)');
const logs=await logsRange({address:PM,event:ml,args:{id:ID}}, 25697100n, await anyRpc(c=>c.getBlockNumber()), 800n);
const own=parseAbi(['function ownerOf(uint256) view returns (address)']);
console.log('=== $3030/ETH LP positions (fee 0.9%, NO hook — fees DO reach LPs) ===');
for(const g of logs){ const id=BigInt(g.args.salt); let o='(burned/none)';
  try{ o=await anyRpc(c=>c.readContract({address:POSM,abi:own,functionName:'ownerOf',args:[id]})); }catch(e){}
  console.log(` blk ${Number(g.blockNumber)} tokenId ${id} ΔL ${String(g.args.liquidityDelta).padStart(21)} owner ${o}${o.toLowerCase()===HIS.toLowerCase()?'  <<< FRESH WALLET':''}`);}

console.log('\n=== FWA transfer tax check (does 1 unit in = 1 unit out?) ===');
const FWA='0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';
const erc=parseAbi(['function balanceOf(address) view returns (uint256)','function transfer(address,uint256) returns (bool)','function symbol() view returns (string)','function decimals() view returns (uint8)']);
const whale=PM; // PoolManager holds the pool's FWA
const bal=await anyRpc(c=>c.readContract({address:FWA,abi:erc,functionName:'balanceOf',args:[whale]}));
console.log('PoolManager FWA balance', (Number(bal)/1e18).toFixed(0));
const to='0x000000000000000000000000000000000000dEaD';
const before=await anyRpc(c=>c.readContract({address:FWA,abi:erc,functionName:'balanceOf',args:[to]}));
try{
  const amt=1000n*10n**18n;
  const sim=await anyRpc(c=>c.simulateContract({address:FWA,abi:erc,functionName:'transfer',args:[to,amt],account:whale}));
  // state override not used; instead estimate by reading post-state is impossible. Use call trace via eth_call returning bool only.
  console.log('transfer() simulates OK (returns', sim.result,') — no revert/blacklist on a 1,000 FWA move');
}catch(e){ console.log('transfer sim reverted:', String(e.shortMessage||e).slice(0,140)); }

console.log('\n=== What does it cost to BUY $3030 with ETH today? ===');
const Q='0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203', Z='0x0000000000000000000000000000000000000000';
const T='0x1D4bcbb505182a49303CC3B23EfF1E3157147A33', RARE='0xba5BDe662c17e2aDFF1075610382B9B691296350';
const qabi=parseAbi([
 'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
 'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
 'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)']);
const K3030ETH={currency0:Z,currency1:T,fee:9000,tickSpacing:90,hooks:Z};
const K3030RARE={currency0:T,currency1:RARE,fee:0,tickSpacing:60,hooks:'0x8Ff5660951C974f4806F0bEF9A32bcf35d3aE0cC'};
for(const [nm,key,z] of [['3030/ETH pool  ETH->3030',K3030ETH,true]]) {
  for(const sz of ['0.005','0.02','0.05']){
    try{ const r=await anyRpc(c=>c.simulateContract({address:Q,abi:qabi,functionName:'quoteExactInputSingle',
      args:[{poolKey:key,zeroForOne:z,exactAmount:parseEther(sz),hookData:'0x'}]}));
      const tok=Number(r.result[0])/1e18, usdIn=Number(sz)*1919.55;
      console.log(` ${nm} ${sz} ETH ($${usdIn.toFixed(2)}) -> ${tok.toFixed(2)} $3030 @ $${(usdIn/tok).toFixed(5)}/tok  (mid $0.0963 ⇒ ${(((usdIn/tok)/0.0963-1)*100).toFixed(1)}% worse)`);
    }catch(e){ console.log(` ${nm} ${sz}`, String(e.shortMessage||e).slice(0,90)); }
  }
}
console.log('\n RARE pool sell test (3030->RARE, 100 tokens) to price the hook:');
try{ const r=await anyRpc(c=>c.simulateContract({address:Q,abi:qabi,functionName:'quoteExactInputSingle',
  args:[{poolKey:K3030RARE,zeroForOne:true,exactAmount:100n*10n**18n,hookData:'0x'}]}));
  console.log('  100 $3030 ->', (Number(r.result[0])/1e18).toFixed(4),'RARE');
}catch(e){ console.log('  reverted:', String(e.shortMessage||e).slice(0,120)); }

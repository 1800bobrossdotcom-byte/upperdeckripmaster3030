/* Every FWA venue the watcher found, ranked by whether it is TRADEABLE — fee, hook powers,
 * liquidity and real swaps. ⛔ A hookless low-fee pool with no depth is a trap, not an opening:
 * the swap succeeds, nothing errors, and the fill is eaten. This project has delisted a pool for
 * exactly that shape before. */
import { createPublicClient, http, parseAbi, parseAbiItem, keccak256, encodeAbiParameters, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync } from 'node:fs';
import { hookPowers } from './mm.mjs';
const c=createPublicClient({chain:mainnet,transport:http('https://gateway.tenderly.co/public/mainnet',{timeout:30000})});
const PM='0x000000000004444c5dc75cB358380D2e3dE08A90';
const EXT=parseAbi(['function extsload(bytes32) view returns (bytes32)']);
const SWAP=parseAbiItem('event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)');
const INIT=parseAbiItem('event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)');
const FWA='0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';
const seen=JSON.parse(readFileSync('fwa-audit/pools-seen.json','utf8'));
const head=Number(await c.getBlockNumber());
console.log(`\n  ${seen.ids.length} FWA venues · head ${head}\n`);
console.log(`  ${'fee'.padStart(8)} ${'hook'.padEnd(6)} ${'liquidity'.padStart(24)} ${'swaps/24h'.padStart(10)}  pool`);
const rows=[];
for(const id of seen.ids){
  if(!/^0x[0-9a-f]{64}$/.test(id)) continue;
  // find its Initialize to get fee+hooks
  let ev=null;
  for(const a of [{currency0:'0x0000000000000000000000000000000000000000'},{currency1:FWA}]){
    try{ const L=await c.getLogs({address:PM,event:INIT,args:{id},fromBlock:25546000n,toBlock:BigInt(head)}); if(L.length){ev=L[0];break} }catch(e){}
  }
  const slot=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[id,6n]));
  let liq=0n; try{ liq=BigInt(await c.readContract({address:PM,abi:EXT,functionName:'extsload',
    args:['0x'+(BigInt(slot)+3n).toString(16).padStart(64,'0')]})); }catch(e){}
  let sw=0; try{ const L=await c.getLogs({address:PM,event:SWAP,args:{id},fromBlock:BigInt(head-7200),toBlock:BigInt(head)}); sw=L.length; }catch(e){ sw=-1; }
  const fee=ev?Number(ev.args.fee):null, hooks=ev?ev.args.hooks:null;
  const hp=hooks?hookPowers(hooks):null;
  rows.push({id,fee,hooks,liq,sw,hp});
}
rows.sort((a,b)=> (b.liq>a.liq?1:b.liq<a.liq?-1:0));
for(const r of rows){
  const f=r.fee===null?'?':r.fee===0x800000?'DYN':(r.fee/10000).toFixed(3)+'%';
  const h=r.hp? (r.hp.canTakeTheFee?'SKIMS':(r.hp.bits===0n?'none':'yes')) : '?';
  console.log(`  ${f.padStart(8)} ${h.padEnd(6)} ${r.liq.toString().padStart(24)} ${String(r.sw<0?'unread':r.sw).padStart(10)}  ${r.id.slice(0,18)}…`);
}
console.log('\n  ⚑ THE ONE TO WAIT FOR: hook "none" AND a fee under ~0.35% AND real liquidity AND real swaps.');
const live=rows.filter(r=>r.hp&&!r.hp.canTakeTheFee&&r.fee!==null&&r.fee<3500&&r.liq>0n);
console.log(live.length?`  ✅ ${live.length} candidate(s) already meet it`:'  ⛔ none yet — every low-fee venue is empty, and an empty venue is not a venue.');

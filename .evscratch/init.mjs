import { createPublicClient, http, keccak256, encodeAbiParameters, parseAbiItem, decodeAbiParameters } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync } from 'node:fs';
const src = readFileSync('js/chain-config.js','utf8'); const w={}; new Function('window',src)(w);
const CFG=w.RIPMASTER_CHAIN;
const PM='0x000000000004444c5dc75cB358380D2e3dE08A90';
const c = createPublicClient({chain:mainnet, transport:http('https://eth.drpc.org',{timeout:30000})});
const now = await c.getBlock();
console.log('head', Number(now.number), new Date(Number(now.timestamp)*1000).toISOString());
async function blockAt(tsWant){ // binary search
  let lo=1n, hi=now.number;
  while(hi-lo>1n){ const mid=(lo+hi)/2n; const b=await c.getBlock({blockNumber:mid});
    if(Number(b.timestamp)<tsWant) lo=mid; else hi=mid; }
  return lo;
}
const ev = parseAbiItem('event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)');
const targets = {
  'FWA main  ': ['0x230ecd3c25b44af30db59c15f70df7794eb13f67a200f230b7400daa96fe804d', '2026-07-16T17:43:35Z'],
  'FWA aug05a': ['0x845a89092138fd314ecb527adbe673d0450b292fc6c550c68b1ac5727126c94e','2026-08-05T17:57:35Z'],
  'FWA aug05b': ['0x3259c8d18bac1bdc061d8709e81fb94fad60c7fb60183e6b838289b0672befc5','2026-08-05T12:41:35Z'],
  'FWA aug08 ': ['0xe008f37ad0b121d02391600ecb16dd97bb46df1bfd94d06e839a2208bcf65c90','2026-08-08T18:41:47Z'],
};
for (const [name,[id,iso]] of Object.entries(targets)) {
  const ts = Math.floor(Date.parse(iso)/1000);
  const b = await blockAt(ts);
  let logs=[];
  for (const [f,t] of [[b-20n,b+40n],[b-400n,b+400n]]) {
    logs = await c.getLogs({address:PM, event:ev, args:{id}, fromBlock:f, toBlock:t});
    if(logs.length) break;
  }
  if(!logs.length){ console.log(name,'no Initialize found near block',Number(b)); continue; }
  const a=logs[0].args;
  // prove: re-hash the PoolKey
  const rehash = keccak256(encodeAbiParameters(
    [{type:'address'},{type:'address'},{type:'uint24'},{type:'int24'},{type:'address'}],
    [a.currency0,a.currency1,a.fee,a.tickSpacing,a.hooks]));
  console.log(name, 'blk',Number(logs[0].blockNumber),
    '| c0',a.currency0,'| c1',a.currency1,
    '| fee',a.fee, (a.fee===0x800000?'(DYNAMIC)':''),
    '| spacing',a.tickSpacing,'| hooks',a.hooks,
    '| initTick',a.tick,
    '| KEY PROVEN:', rehash.toLowerCase()===id.toLowerCase());
}

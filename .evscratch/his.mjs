import { createPublicClient, http, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';
const c = createPublicClient({chain:mainnet, transport:http('https://eth.drpc.org',{timeout:60000})});
const PM='0x000000000004444c5dc75cB358380D2e3dE08A90';
const ID='0x9a7e4306112ddeb2527bcc97b73c74624d5c65aca9fccfae4e389cf061192ca7';
const swapEv=parseAbiItem('event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)');
const mlEv=parseAbiItem('event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)');
const START=25697100n, HEAD=await c.getBlockNumber();
console.log('scanning', Number(START),'->',Number(HEAD), '=', Number(HEAD-START),'blocks');
async function scan(ev){ const out=[]; const STEP=9000n;
  for(let f=START; f<=HEAD; f+=STEP){ const t=(f+STEP-1n)>HEAD?HEAD:(f+STEP-1n);
    out.push(...await c.getLogs({address:PM, event:ev, args:{id:ID}, fromBlock:f, toBlock:t})); }
  return out; }
const swaps=await scan(swapEv), mods=await scan(mlEv);
console.log('\n=== $3030/ETH pool, ENTIRE LIFETIME ===');
console.log('ModifyLiquidity events:', mods.length, '| Swap events:', swaps.length);
for(const m of mods){ const a=m.args;
  console.log(`  LP blk ${Number(m.blockNumber)} ticks [${a.tickLower}, ${a.tickUpper}] ΔL ${a.liquidityDelta} sender ${a.sender}`); }
let volEthIn=0n, volEthOut=0n, vol3030In=0n, vol3030Out=0n;
for(const s of swaps){ const a=s.args;
  console.log(`  SWAP blk ${Number(s.blockNumber)} amt0(ETH) ${a.amount0} amt1(3030) ${a.amount1} tick ${a.tick} fee ${a.fee} L ${a.liquidity}`);
  if(a.amount0>0n) volEthIn+=a.amount0; else volEthOut+=-a.amount0;
  if(a.amount1>0n) vol3030In+=a.amount1; else vol3030Out+=-a.amount1; }
const ETH=1919.55, T=0.09419;
console.log(`\n ETH in (buys of 3030): ${Number(volEthIn)/1e18} ETH  ($${(Number(volEthIn)/1e18*ETH).toFixed(2)})`);
console.log(` ETH out             : ${Number(volEthOut)/1e18} ETH  ($${(Number(volEthOut)/1e18*ETH).toFixed(2)})`);
console.log(` 3030 in (sells)     : ${Number(vol3030In)/1e18}  ($${(Number(vol3030In)/1e18*T).toFixed(2)})`);
console.log(` 3030 out            : ${Number(vol3030Out)/1e18}  ($${(Number(vol3030Out)/1e18*T).toFixed(2)})`);
const feesToken = Number(vol3030In)/1e18*0.009, feesEth=Number(volEthIn)/1e18*0.009;
console.log(`\n LIFETIME LP FEES at the pool's 0.9%: ${feesToken.toFixed(4)} $3030 ($${(feesToken*T).toFixed(4)}) + ${feesEth} ETH ($${(feesEth*ETH).toFixed(4)})`);
console.log(` TOTAL: $${(feesToken*T+feesEth*ETH).toFixed(4)}  — split across ALL LPs in range`);

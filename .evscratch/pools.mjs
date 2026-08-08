import { createPublicClient, http, keccak256, encodePacked, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync } from 'node:fs';
const src = readFileSync('js/chain-config.js','utf8'); const w={}; new Function('window',src)(w);
const CFG = w.RIPMASTER_CHAIN;
const PM = '0x000000000004444c5dc75cB358380D2e3dE08A90';
const c = createPublicClient({ chain: mainnet, transport: http(process.env.RPC_URL||CFG.rpcs[0],{timeout:20000}) });
const ext = (slot) => c.readContract({address:PM, abi:[parseAbiItem('function extsload(bytes32) view returns (bytes32)')], functionName:'extsload', args:[slot]});
const base = id => keccak256(encodePacked(['bytes32','uint256'],[id,6n]));
const add = (h,n) => '0x'+((BigInt(h)+BigInt(n)).toString(16).padStart(64,'0'));

async function state(id){
  const b = base(id);
  const [s0, fg0, fg1, liq] = await Promise.all([ext(b), ext(add(b,1)), ext(add(b,2)), ext(add(b,3))]);
  const word = BigInt(s0);
  let tick = Number((word>>160n)&0xffffffn); if(tick>=0x800000) tick-=0x1000000;
  return {
    sqrtPriceX96: word & ((1n<<160n)-1n),
    tick,
    protocolFee: Number((word>>184n)&0xffffffn),
    lpFee: Number((word>>208n)&0xffffffn),
    feeGrowth0: BigInt(fg0), feeGrowth1: BigInt(fg1),
    liquidity: BigInt(liq) & ((1n<<128n)-1n),
  };
}
const POOLS = {
  'FWA/ETH  main   ': '0x230ecd3c25b44af30db59c15f70df7794eb13f67a200f230b7400daa96fe804d',
  'FWA/ETH  aug05a ': '0x845a89092138fd314ecb527adbe673d0450b292fc6c550c68b1ac5727126c94e',
  'FWA/ETH  aug05b ': '0x3259c8d18bac1bdc061d8709e81fb94fad60c7fb60183e6b838289b0672befc5',
  'FWA/ETH  aug08  ': '0xe008f37ad0b121d02391600ecb16dd97bb46df1bfd94d06e839a2208bcf65c90',
  '3030/RARE       ': '0x7943d0d19a67d2185de840d8cf057b21f67b60bf442a4a727f66551ac1cd7ab6',
  '3030/ETH  (his) ': '0x9a7e4306112ddeb2527bcc97b73c74624d5c65aca9fccfae4e389cf061192ca7',
};
const ETH=1919.55;
for (const [name,id] of Object.entries(POOLS)) {
  const s = await state(id);
  // price of currency1 per currency0 (both 18dec except RARE/USDC)
  const raw = Math.pow(1.0001, s.tick);
  console.log(name, '| tick', String(s.tick).padStart(8),
    '| lpFee', String(s.lpFee).padStart(7),
    '| protoFee', s.protocolFee,
    '| L', s.liquidity.toString().padStart(26),
    '| fg0', s.feeGrowth0.toString(), '| fg1', s.feeGrowth1.toString());
  console.log('        raw c1/c0 =', raw.toExponential(6));
}

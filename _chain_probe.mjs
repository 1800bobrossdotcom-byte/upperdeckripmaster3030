import { createPublicClient, http, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
const RPCS=['https://ethereum-rpc.publicnode.com','https://eth.llamarpc.com','https://rpc.ankr.com/eth','https://cloudflare-eth.com'];
const TOKEN='0x1D4bcbb505182a49303CC3B23EfF1E3157147A33';
const LENS='0xe2d11bC2f0122Be198a6e102fD2567888878e138';
const SINK='0x384936Ee3Baf9B81715117d180Ca2aA4abe6018E';
const TREZ='0x8455cF296e1265b494605207e97884813De21950';
async function go(){
 for(const u of RPCS){
  try{
   const c=createPublicClient({chain:mainnet,transport:http(u,{timeout:12000})});
   const bn=await c.getBlockNumber();
   const call=(to,data)=>c.call({to,data}).then(r=>r.data);
   const ts=await call(TOKEN,'0x18160ddd');
   const mts=await call(TOKEN,'0x2ab4d052');
   const dec=await call(TOKEN,'0x313ce567');
   const bal=await call(TOKEN,'0x70a08231'+TREZ.slice(2).padStart(64,'0').toLowerCase());
   console.log('rpc',u,'block',bn);
   console.log('totalSupply   ',formatUnits(BigInt(ts),18));
   console.log('maxTotalSupply',formatUnits(BigInt(mts),18));
   console.log('decimals      ',BigInt(dec));
   console.log('treasury bal  ',formatUnits(BigInt(bal),18));
   // tierAt[0..3]
   for(let i=0;i<4;i++){
     const d='0xd7096b52'; // placeholder, will compute below
   }
   // tierAt(uint256) selector
   const {keccak256,toHex}=await import('viem');
   const sel=s=>keccak256(toHex(s)).slice(0,10);
   console.log('sel tierAt(uint256)',sel('tierAt(uint256)'),'setTiers',sel('setTiers(uint256[4])'),'owner',sel('owner()'));
   for(let i=0;i<4;i++){
     const r=await call(LENS,sel('tierAt(uint256)')+i.toString(16).padStart(64,'0'));
     console.log('tierAt['+i+'] =',formatUnits(BigInt(r),18),'$3030');
   }
   const own=await call(LENS,sel('owner()'));
   console.log('lens owner   ','0x'+own.slice(26));
   const sinkTok=await call(SINK,sel('token()'));
   const sinkTre=await call(SINK,sel('treasury()'));
   const bps=await call(SINK,sel('BURN_BPS()'));
   console.log('sink token   ','0x'+sinkTok.slice(26));
   console.log('sink treasury','0x'+sinkTre.slice(26));
   console.log('sink BURN_BPS',BigInt(bps));
   return;
  }catch(e){console.log('fail',u,String(e).slice(0,90));}
 }
}
go();

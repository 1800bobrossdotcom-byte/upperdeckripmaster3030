import { createPublicClient, http, parseAbiItem, parseAbi, keccak256, encodeAbiParameters } from 'viem';
import { mainnet } from 'viem/chains';
const c=createPublicClient({chain:mainnet,transport:http('https://eth.drpc.org',{timeout:60000})});
const PM='0x000000000004444c5dc75cB358380D2e3dE08A90', POSM='0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e';
const SV='0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227';
const ID='0x9a7e4306112ddeb2527bcc97b73c74624d5c65aca9fccfae4e389cf061192ca7';
const HIS='0xcFCFc8e42AEBFC58AB78093217C2C4bB186BAc86';
// re-prove the poolkey
const Z='0x0000000000000000000000000000000000000000', T='0x1D4bcbb505182a49303CC3B23EfF1E3157147A33';
console.log('3030/ETH key proven:', keccak256(encodeAbiParameters(
  [{type:'address'},{type:'address'},{type:'uint24'},{type:'int24'},{type:'address'}],
  [Z,T,9000,90,Z])).toLowerCase()===ID, '(fee 9000 = 0.9%, hooks = NONE ⇒ fees do reach LPs)');
// canonical fee growth getter
const sv=parseAbi(['function getFeeGrowthGlobals(bytes32 poolId) view returns (uint256,uint256)',
                   'function getLiquidity(bytes32 poolId) view returns (uint128)']);
const [f0,f1]=await c.readContract({address:SV,abi:sv,functionName:'getFeeGrowthGlobals',args:[ID]});
console.log('StateView feeGrowthGlobals: c0(ETH)=',f0.toString(),' c1(3030)=',f1.toString());
const L=await c.readContract({address:SV,abi:sv,functionName:'getLiquidity',args:[ID]});
console.log('current in-range L =',L.toString());
// value the whole pool (full range positions) at current tick 98984
const P=Math.pow(1.0001,98984), sq=Math.sqrt(P);
const eth=Number(L)/sq/1e18, tok=Number(L)*sq/1e18;
console.log(`whole-pool value now: ${eth.toFixed(6)} ETH ($${(eth*1919.55).toFixed(2)}) + ${tok.toFixed(1)} $3030 ($${(tok*0.09419).toFixed(2)}) = $${(eth*1919.55+tok*0.09419).toFixed(2)}`);
// who owns positions: salts on ModifyLiquidity are tokenIds
const ml=parseAbiItem('event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)');
const logs=[]; for(let f=25697100n;f<=25712712n;f+=9000n){logs.push(...await c.getLogs({address:PM,event:ml,args:{id:ID},fromBlock:f,toBlock:f+8999n>25712712n?25712712n:f+8999n}));}
const own=parseAbi(['function ownerOf(uint256) view returns (address)']);
for(const g of logs){ const id=BigInt(g.args.salt); let o='—';
  try{ o=await c.readContract({address:POSM,abi:own,functionName:'ownerOf',args:[id]}); }catch(e){o='(burned)';}
  console.log(` blk ${Number(g.blockNumber)} tokenId ${id} ΔL ${g.args.liquidityDelta} owner ${o}${o.toLowerCase()===HIS.toLowerCase()?'   <<< FRESH WALLET':''}`); }
// his wallet
console.log('\nfresh wallet', HIS, 'bal', Number(await c.getBalance({address:HIS}))/1e18,'ETH  nonce',await c.getTransactionCount({address:HIS}));

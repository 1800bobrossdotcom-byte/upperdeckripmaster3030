import { createPublicClient, http, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const PM='0x000000000004444c5dc75cB358380D2e3dE08A90';
const POOL='0x230ecd3c25b44af30db59c15f70df7794eb13f67a200f230b7400daa96fe804d';
const BIRTH=25546799, ETH=1919.63, LEG=0.01055;
const SWAP=parseAbiItem('event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)');
const cs=['https://gateway.tenderly.co/public/mainnet','https://eth.drpc.org']
  .map(u=>createPublicClient({chain:mainnet,transport:http(u,{timeout:30000,retryCount:1})}));
const head=Number(await cs[0].getBlockNumber());
const F='fwa-audit/swaps.json';
let rows=[], from=BIRTH;
if(existsSync(F)){const j=JSON.parse(readFileSync(F,'utf8'));if(j.pool===POOL){rows=j.rows;from=j.head+1;console.log('cache:',rows.length);}}
if(head>=from){
  const ch=[];for(let lo=from;lo<=head;lo+=400)ch.push([lo,Math.min(lo+399,head)]);
  let done=0,fails=0;
  async function win(c,a,b,d=0){try{const L=await c.getLogs({address:PM,event:SWAP,args:{id:POOL},fromBlock:BigInt(a),toBlock:BigInt(b)});
    for(const l of L)rows.push([Number(l.blockNumber),l.args.sqrtPriceX96.toString(),l.args.amount0.toString()]);return 0;}
    catch(e){if(b-a<2||d>10)return 1;const m=(a+b)>>1;return await win(c,a,m,d+1)+await win(c,m+1,b,d+1);}}
  const q=ch.slice();
  await Promise.all(cs.map(async c=>{for(;;){const j=q.shift();if(!j)return;fails+=await win(c,j[0],j[1]);done++;
    if(done%75===0)process.stdout.write(`\r  swaps ${done}/${ch.length}…  `);}}));
  console.log(`\r  swaps: ${rows.length} logs, ${fails} unrecoverable      `);
  rows.sort((a,b)=>a[0]-b[0]); writeFileSync(F,JSON.stringify({pool:POOL,head,rows}));
}
/* ⚑ REAL TIMESTAMPS, NOT 12.02s ASSUMED. Over 137k blocks a 0.02s error is 46 minutes of drift,
 *   which smears an hour-of-day bucket into the next one. Anchor every 5000th block and interpolate. */
const lo=rows[0][0], hi=rows[rows.length-1][0];
const anchors=[]; for(let b=lo;b<=hi;b+=5000) anchors.push(b); anchors.push(hi);
const ts=await Promise.all(anchors.map((b,i)=>cs[i%2].getBlock({blockNumber:BigInt(b)}).then(x=>Number(x.timestamp))));
const tOf=(b)=>{ let i=Math.min(anchors.length-2,Math.max(0,Math.floor((b-lo)/5000)));
  while(i<anchors.length-2 && anchors[i+1]<b) i++;
  const f=(b-anchors[i])/Math.max(1,anchors[i+1]-anchors[i]); return ts[i]+f*(ts[i+1]-ts[i]); };
console.log(`  span ${new Date(ts[0]*1000).toISOString()} → ${new Date(ts[ts.length-1]*1000).toISOString()}`);

const px=rows.map(r=>({b:r[0], p:1/Math.pow(Number(r[1])/2**96,2)*ETH, e:Math.abs(Number(r[2]))/1e18, t:tOf(r[0])}));
console.log(`  ${px.length} ticks · $${px[0].p.toFixed(6)} → $${px[px.length-1].p.toFixed(6)} (${(px[px.length-1].p/px[0].p).toFixed(0)}x)\n`);

function dipTop(s,dip,top,stop){let cash=1,tok=0,hiP=s[0].p,en=0,n=0,w=0;
  for(const {p} of s){ if(p>hiP)hiP=p;
    if(!tok){ if(p<=hiP*(1-dip)){tok=cash*(1-LEG)/p;cash=0;en=p;} }
    else { if(p>=en*(1+top)||(stop&&p<=en*(1-stop))){ if(p>en)w++; cash=tok*p*(1-LEG);tok=0;n++;hiP=p; } } }
  return {ret:((cash+tok*s[s.length-1].p*(1-LEG))-1)*100,n,w};}
const hold=s=>((s[s.length-1].p/s[0].p)*(1-LEG)**2-1)*100;
function table(s,label){ const h=hold(s);
  console.log(`── ${label}: buy&hold ${h.toFixed(0)}% over ${s.length} ticks`);
  console.log('   dip  top  stop | trades wins |   strategy |    vs hold');
  for(const [d,t,st] of [[.03,.05,0],[.05,.10,0],[.05,.15,0],[.10,.20,0],[.10,.30,0],[.15,.50,0],[.10,.25,.10],[.20,1,0]]){
    const r=dipTop(s,d,t,st);
    console.log(`   ${String(d*100).padStart(3)}  ${String(t*100).padStart(3)}  ${String(st?st*100:'—').padStart(4)} | ${String(r.n).padStart(6)} ${String(r.w).padStart(4)} | ${(r.ret.toFixed(0)+'%').padStart(10)} | ${(((r.ret-h)>0?'+':'')+(r.ret-h).toFixed(0)+'%').padStart(10)}`);}
  console.log('');}
table(px,'WHOLE SAMPLE');
const H=Math.floor(px.length/2);
table(px.slice(0,H),'FIRST HALF');
table(px.slice(H),'SECOND HALF (out of sample)');

/* ── the sessions ── */
console.log('── BY HOUR OF DAY (UTC) — is there a session effect? ──');
console.log('   UTC  session                     swaps   ETH vol   mean move   up-share');
const buck=Array.from({length:24},()=>({n:0,v:0,r:[],up:0}));
for(let i=1;i<px.length;i++){ const h=new Date(px[i].t*1000).getUTCHours();
  const r=(px[i].p-px[i-1].p)/px[i-1].p; const b=buck[h];
  b.n++; b.v+=px[i].e; b.r.push(r); if(r>0)b.up++; }
const SESS=h=>{ if(h>=0&&h<7)return 'Asia (CN/JP open)'; if(h>=3&&h<10)return 'India';
  if(h>=7&&h<11)return 'Europe open'; if(h>=11&&h<16)return 'Europe/US overlap';
  if(h>=13&&h<21)return 'US session'; return 'US close / Asia pre'; };
for(let h=0;h<24;h++){const b=buck[h]; if(!b.n)continue;
  const mean=b.r.reduce((a,c)=>a+c,0)/b.r.length*100;
  console.log(`   ${String(h).padStart(2)}h  ${SESS(h).padEnd(22)} ${String(b.n).padStart(8)} ${b.v.toFixed(1).padStart(9)} ${(mean>=0?'+':'')+mean.toFixed(4)+'%'} ${((b.up/b.n*100).toFixed(1)+'%').padStart(10)}`);}
const byVol=[...buck.map((b,h)=>({h,v:b.v,n:b.n}))].sort((a,b)=>b.v-a.v);
console.log(`\n   busiest hours by ETH volume: ${byVol.slice(0,4).map(x=>x.h+'h').join(', ')}`);
console.log(`   quietest:                    ${byVol.slice(-4).map(x=>x.h+'h').join(', ')}`);
const tot=byVol.reduce((a,c)=>a+c.v,0);
console.log(`   top 4 hours carry ${(byVol.slice(0,4).reduce((a,c)=>a+c.v,0)/tot*100).toFixed(1)}% of all volume (flat would be 16.7%)`);

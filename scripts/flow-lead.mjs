/* DOES HOLDER FLOW LEAD PRICE?  The only untested edge left.
 * Net tokens leaving the pool in window t  vs  price return in window t+1.
 * ⛔ Strictly forward-looking: the signal uses ONLY data from t, the return is measured after. */
import { createPublicClient, http, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const PM='0x000000000004444c5dc75cB358380D2e3dE08A90'.toLowerCase();
const FWA='0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';
const T=parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const cs=['https://gateway.tenderly.co/public/mainnet','https://eth.drpc.org']
  .map(u=>createPublicClient({chain:mainnet,transport:http(u,{timeout:30000,retryCount:1})}));
const sw=JSON.parse(readFileSync('fwa-audit/swaps.json','utf8'));
const lo=sw.rows[0][0], hi=sw.rows[sw.rows.length-1][0];
const F='fwa-audit/xfer.json';
let tr=[];
if(existsSync(F)){const j=JSON.parse(readFileSync(F,'utf8')); if(j.lo===lo&&j.hi>=hi-500){tr=j.tr;console.log('cache:',tr.length,'transfers');}}
if(!tr.length){
  const ch=[];for(let a=lo;a<=hi;a+=800)ch.push([a,Math.min(a+799,hi)]);
  let done=0,fails=0;
  async function win(c,a,b,d=0){try{const L=await c.getLogs({address:FWA,event:T,fromBlock:BigInt(a),toBlock:BigInt(b)});
    for(const l of L){const f=l.args.from.toLowerCase(),t=l.args.to.toLowerCase();
      if(f===PM||t===PM) tr.push([Number(l.blockNumber), f===PM?1:-1, Number(l.args.value/10n**12n)/1e6]);}
    return 0;}catch(e){if(b-a<2||d>10)return 1;const m=(a+b)>>1;return await win(c,a,m,d+1)+await win(c,m+1,b,d+1);}}
  const q=ch.slice();
  await Promise.all(cs.map(async c=>{for(;;){const j=q.shift();if(!j)return;fails+=await win(c,j[0],j[1]);done++;
    if(done%60===0)process.stdout.write(`\r  transfers ${done}/${ch.length}…  `);}}));
  console.log(`\r  pool-side transfers: ${tr.length}, ${fails} unrecoverable      `);
  tr.sort((a,b)=>a[0]-b[0]); writeFileSync(F,JSON.stringify({lo,hi,tr}));
}
const px=new Map(); for(const r of sw.rows) px.set(r[0], 1/Math.pow(Number(r[1])/2**96,2));
const blocks=[...px.keys()].sort((a,b)=>a-b);
const priceAt=b=>{let i=0,j=blocks.length-1,best=blocks[0];
  while(i<=j){const m=(i+j)>>1; if(blocks[m]<=b){best=blocks[m];i=m+1}else j=m-1;} return px.get(best);};

/* ⛔ THE PERIOD IS THE POINT NOW. corr +0.294 was measured over the WHOLE sample, most of which
 *   was the 15-day emission programme. Whether the signal still predicts is a different question
 *   from whether it ever did. */
const P0 = Number(process.env.FROM || 0);
function test(winBlocks,label){
  const rows=[];
  for(let b=Math.max(lo,P0);b+2*winBlocks<=hi;b+=winBlocks){
    let net=0;
    for(const [tb,dir,v] of tr){ if(tb<b)continue; if(tb>=b+winBlocks)break; net+=dir*v; }
    const p0=priceAt(b+winBlocks), p1=priceAt(b+2*winBlocks);
    if(!p0||!p1)continue;
    rows.push({net, fwd:(p1-p0)/p0});
  }
  if(rows.length<20) return console.log(`  ${label}: only ${rows.length} windows`);
  const mn=rows.reduce((a,c)=>a+c.net,0)/rows.length, mf=rows.reduce((a,c)=>a+c.fwd,0)/rows.length;
  let sxy=0,sxx=0,syy=0;
  for(const r of rows){const x=r.net-mn,y=r.fwd-mf; sxy+=x*y;sxx+=x*x;syy+=y*y;}
  const corr=sxy/Math.sqrt(sxx*syy||1);
  const sorted=rows.slice().sort((a,b)=>a.net-b.net), q=Math.floor(rows.length/5);
  const bot=sorted.slice(0,q), top=sorted.slice(-q);
  const avg=xs=>xs.reduce((a,c)=>a+c.fwd,0)/xs.length*100;
  const wr=xs=>xs.filter(x=>x.fwd>0).length/xs.length*100;
  console.log(`  ${label.padEnd(9)} n=${String(rows.length).padStart(4)}  corr ${corr>=0?'+':''}${corr.toFixed(3)}   ` +
    `heaviest-accumulation quintile → next-window ${avg(top)>=0?'+':''}${avg(top).toFixed(3)}% (${wr(top).toFixed(0)}% up)   ` +
    `heaviest-selling → ${avg(bot)>=0?'+':''}${avg(bot).toFixed(3)}% (${wr(bot).toFixed(0)}% up)`);
}
console.log('\n── does net accumulation in window t predict the return in window t+1? ──');
for(const [w,l] of [[25,'~5 min'],[75,'~15 min'],[150,'~30 min'],[300,'~1 h'],[900,'~3 h'],[1800,'~6 h']]) test(w,l);
console.log('\n  ⚑ corr near 0 = no lead. A tradeable signal needs the two quintiles to SEPARATE');
console.log('    by more than the 2.11% round-trip toll, not merely to differ in sign.');

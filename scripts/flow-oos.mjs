/* OUT OF SAMPLE. The frontier's winner was found on a 399x uptrend; run the same rules on the
 * second half, where the token did -32%, and on the last 5 days. A rule that only works in the
 * trend is the trend, not a rule. */
import { readFileSync } from 'node:fs';
const ETH=1919.63, LEG=0.01055;
const sw=JSON.parse(readFileSync('fwa-audit/swaps.json','utf8')).rows;
const tr=JSON.parse(readFileSync('fwa-audit/xfer.json','utf8')).tr;
const pxAll=sw.map(r=>({b:r[0], p:1/Math.pow(Number(r[1])/2**96,2)*ETH}));

function frame(from,to,label){
  const px=pxAll.filter(x=>x.b>=from&&x.b<=to); if(px.length<500) return console.log(`  ${label}: too few ticks`);
  const lo=px[0].b, hi=px[px.length-1].b, BUK=25, nb=Math.ceil((hi-lo)/BUK)+1;
  const net=new Float64Array(nb);
  for(const [b,dir,v] of tr){ if(b<lo||b>hi)continue; const i=Math.floor((b-lo)/BUK); if(i<nb) net[i]+=dir*v; }
  const blocks=px.map(x=>x.b);
  const pAt=b=>{let i=0,j=blocks.length-1,best=-1;while(i<=j){const m=(i+j)>>1;if(blocks[m]<=b){best=m;i=m+1}else j=m-1;}return best<0?null:px[best].p;};
  const hist=[],ent=[];
  for(let i=0;i<nb;i++){ if(hist.length>200){const s=hist.slice().sort((a,b)=>a-b);
      if(net[i]>s[Math.floor(s.length*0.8)]) ent.push(lo+i*BUK+BUK);} hist.push(net[i]); if(hist.length>2000)hist.shift(); }
  const hold=((px[px.length-1].p/px[0].p)*(1-LEG)**2-1)*100;
  console.log(`\n  ── ${label}: ${px.length} ticks, buy&hold ${hold.toFixed(1)}%, ${ent.length} signals ──`);
  console.log('   TP    SL   hold | trades  win%  exp/trade |   total');
  for(const [TP,SL,H] of [[0.20,0.50,1200],[0.20,0.20,1200],[0.20,0.02,1200],[0.20,0.02,300],[0.10,0,1200],[0.03,0,1200]]){
    let last=0,eq=1,rs=[];
    for(const e of ent){ if(e<last)continue; const p0=pAt(e); if(!p0)continue;
      let ex=null;
      for(let k=1;k<=H;k+=5){const p=pAt(e+k); if(!p)continue;
        if(p>=p0*(1+TP)){ex=p0*(1+TP);last=e+k;break} if(SL&&p<=p0*(1-SL)){ex=p0*(1-SL);last=e+k;break}}
      if(ex===null){const p=pAt(e+H); if(!p)continue; ex=p; last=e+H;}
      const r=(ex/p0)*(1-LEG)**2-1; rs.push(r); eq*=(1+r); }
    if(rs.length<5){console.log(`   ${(TP*100).toFixed(0).padStart(3)}%  ${(SL?(SL*100).toFixed(0)+'%':'none').padStart(4)} ${String(H==300?'1h':'4h').padStart(5)} |  only ${rs.length} trades`);continue}
    const exp=rs.reduce((a,c)=>a+c,0)/rs.length*100, win=rs.filter(x=>x>0).length/rs.length*100;
    console.log(`   ${(TP*100).toFixed(0).padStart(3)}%  ${(SL?(SL*100).toFixed(0)+'%':'none').padStart(4)} ${String(H==300?'1h':'4h').padStart(5)} | ${String(rs.length).padStart(6)}  ${win.toFixed(1).padStart(5)}  ${((exp>=0?'+':'')+exp.toFixed(3)+'%').padStart(9)} | ${((eq-1)*100>=0?'+':'')+((eq-1)*100).toFixed(0)+'%'}`);
  }
}
const lo=pxAll[0].b, hi=pxAll[pxAll.length-1].b, mid=Math.floor((lo+hi)/2);
frame(lo,mid,'FIRST HALF (where the winner was found)');
frame(mid,hi,'SECOND HALF — OUT OF SAMPLE');
frame(hi-36000,hi,'LAST ~5 DAYS');
frame(hi-14400,hi,'LAST ~48 HOURS');

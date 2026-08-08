#!/usr/bin/env node
/* ripmaster3030studios — THE WIN-RATE / EXPECTANCY FRONTIER.  `npm run flow:frontier`
 *
 * ⛔ A WIN RATE ON ITS OWN IS NOT A RESULT, AND IT IS THE EASIEST NUMBER IN FINANCE TO FAKE.
 *   Take profit at +1% with no stop and you will win ~92% of the time forever, because the 8% of
 *   trades that go wrong simply never close. The account still shrinks. So every row below prints
 *   win rate AND expectancy per trade AND total return, and any row where those disagree is the
 *   trap rather than the strategy.
 *
 * ⚑ ENTRIES ARE SIGNAL-FILTERED AND STRICTLY CAUSAL: enter only when net accumulation over the
 *   trailing window sits in the top quintile of everything seen SO FAR (never the whole sample —
 *   that would be lookahead, and it is the single most common way a backtest lies).
 */
import { readFileSync } from 'node:fs';
const ETH=1919.63, LEG=0.01055, PM='0x000000000004444c5dc75cb358380d2e3de08a90';
const sw=JSON.parse(readFileSync('fwa-audit/swaps.json','utf8')).rows;
const tr=JSON.parse(readFileSync('fwa-audit/xfer.json','utf8')).tr;
const px=sw.map(r=>({b:r[0], p:1/Math.pow(Number(r[1])/2**96,2)*ETH}));
const lo=px[0].b, hi=px[px.length-1].b;

/* net accumulation per 25-block (~5 min) bucket, from the pool-side transfers */
const BUK=25, nb=Math.ceil((hi-lo)/BUK)+1;
const net=new Float64Array(nb);
for(const [b,dir,v] of tr){ const i=Math.floor((b-lo)/BUK); if(i>=0&&i<nb) net[i]+=dir*v; }

/* price at a block, and the bucket index of a block */
const blocks=px.map(x=>x.b);
function pAt(b){let i=0,j=blocks.length-1,best=-1;
  while(i<=j){const m=(i+j)>>1; if(blocks[m]<=b){best=m;i=m+1}else j=m-1;} return best<0?null:px[best].p;}

/* causal quintile: is bucket i in the top 20% of every bucket seen so far? */
const hist=[]; const isTop=new Uint8Array(nb);
for(let i=0;i<nb;i++){
  if(hist.length>200){ const s=hist.slice().sort((a,b)=>a-b); const cut=s[Math.floor(s.length*0.8)];
    if(net[i]>cut) isTop[i]=1; }
  hist.push(net[i]); if(hist.length>2000) hist.shift();
}
const entries=[]; for(let i=0;i<nb;i++) if(isTop[i]) entries.push(lo+i*BUK+BUK);
console.log(`  ${px.length} ticks · ${tr.length} pool transfers · ${entries.length} signal entries (causal top quintile)\n`);

function run(TP,SL,maxBlocks){
  let w=0,l=0,to=0, eq=1, rs=[];
  let lastExit=0;
  for(const e of entries){
    if(e<lastExit) continue;                    // one position at a time
    const p0=pAt(e); if(!p0) continue;
    let out=null, exitP=p0;
    for(let k=1;k<=maxBlocks;k+=5){
      const p=pAt(e+k); if(!p) continue;
      if(p>=p0*(1+TP)){out='w';exitP=p0*(1+TP);lastExit=e+k;break}
      if(SL&&p<=p0*(1-SL)){out='l';exitP=p0*(1-SL);lastExit=e+k;break}
    }
    if(!out){ const p=pAt(e+maxBlocks); if(!p)continue; out='t'; exitP=p; lastExit=e+maxBlocks; }
    const r=(exitP/p0)*(1-LEG)*(1-LEG)-1;       // both legs of the toll, always
    rs.push(r); eq*=(1+r);
    if(r>0)w++; else if(out==='l')l++; else to++;
  }
  const n=rs.length||1;
  const exp=rs.reduce((a,c)=>a+c,0)/n;
  const wins=rs.filter(x=>x>0), losses=rs.filter(x=>x<=0);
  return { n:rs.length, win:rs.filter(x=>x>0).length/n*100, exp:exp*100,
    aw:wins.length?wins.reduce((a,c)=>a+c,0)/wins.length*100:0,
    al:losses.length?losses.reduce((a,c)=>a+c,0)/losses.length*100:0,
    tot:(eq-1)*100 };
}

console.log('  TP    SL     hold |  trades  win%  |  avg win  avg loss |  exp/trade |   total');
console.log('  ' + '─'.repeat(84));
const out=[];
for(const hold of [75,300,1200]){            // ~15 min, ~1 h, ~4 h
  for(const TP of [0.01,0.02,0.03,0.05,0.10,0.20]){
    for(const SL of [0.02,0.05,0.10,0.20,0.50,0]){
      const r=run(TP,SL,hold);
      if(r.n<15) continue;
      out.push({TP,SL,hold,...r});
      const flag = r.win>=90 ? (r.exp>0?'  ✅ 90%+ AND positive':'  ⛔ 90%+ but LOSES money') : '';
      console.log(`  ${(TP*100).toFixed(0).padStart(3)}%  ${(SL?(SL*100).toFixed(0)+'%':'none').padStart(4)}  ${String(hold==75?'15m':hold==300?'1h':'4h').padStart(4)} | ${String(r.n).padStart(6)}  ${r.win.toFixed(1).padStart(5)} | ${(r.aw.toFixed(2)+'%').padStart(8)} ${(r.al.toFixed(2)+'%').padStart(9)} | ${((r.exp>=0?'+':'')+r.exp.toFixed(3)+'%').padStart(10)} | ${((r.tot>=0?'+':'')+r.tot.toFixed(0)+'%').padStart(8)}${flag}`);
    }
  }
}
console.log('');
const hi90=out.filter(r=>r.win>=90);
const best=out.slice().sort((a,b)=>b.exp-a.exp)[0];
console.log(`  ── 90%+ win rate: ${hi90.length} configurations ──`);
for(const r of hi90.sort((a,b)=>b.exp-a.exp).slice(0,6))
  console.log(`     TP ${(r.TP*100).toFixed(0)}% / SL ${r.SL?(r.SL*100).toFixed(0)+'%':'none'} / ${r.hold==75?'15m':r.hold==300?'1h':'4h'}  →  ${r.win.toFixed(1)}% win, expectancy ${(r.exp>=0?'+':'')+r.exp.toFixed(3)}%/trade, total ${(r.tot>=0?'+':'')+r.tot.toFixed(0)}%`);
console.log(`\n  ── highest expectancy of all ${out.length} configurations ──`);
console.log(`     TP ${(best.TP*100).toFixed(0)}% / SL ${best.SL?(best.SL*100).toFixed(0)+'%':'none'} / ${best.hold==75?'15m':best.hold==300?'1h':'4h'}  →  ${best.win.toFixed(1)}% win, ${(best.exp>=0?'+':'')+best.exp.toFixed(3)}%/trade over ${best.n} trades, total ${(best.tot>=0?'+':'')+best.tot.toFixed(0)}%`);

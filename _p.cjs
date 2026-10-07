const { createServer } = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { join, extname } = require('node:path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const MIME={'.html':'text/html','.webp':'image/webp','.png':'image/png','.js':'text/javascript','.json':'application/json','.css':'text/css','.jpg':'image/jpeg','.gif':'image/gif'};
(async () => {
  const srv=createServer((q,s)=>{ const p=join(process.cwd(),decodeURIComponent(q.url.split('?')[0]));
    if(existsSync(p)&&!p.endsWith('/')){s.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'});s.end(readFileSync(p));}
    else {s.writeHead(404);s.end('x');}});
  await new Promise(r=>srv.listen(8203,r));
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const ctx=await b.newContext({viewport:{width:520,height:800}});
  await ctx.route('**ipfs**',r=>r.abort());        // gateways blocked, as in the real container
  const pg=await ctx.newPage();
  const errs=[],f404=[];
  pg.on('pageerror',e=>errs.push(String(e).slice(0,110)));
  pg.on('response',r=>{ if(r.status()>=400 && r.url().includes('8203')) f404.push(r.url().split('8203')[1]); });
  await pg.goto('http://localhost:8203/cards/hero/1.html',{waitUntil:'domcontentloaded'});
  /* ⚠ PUMP rAF FROM INSIDE THE PAGE. CardView proves ink over a 240-FRAME budget and this
     container delivers a handful of real frames per second — a wall-clock wait reports a viewer
     that never resolved, which reads exactly like a broken mount. */
  await pg.evaluate(() => new Promise(res => { let n=0; (function t(){ n++; n<300 ? requestAnimationFrame(t) : res(); })(); }));
  await pg.waitForTimeout(1200);
  const r = await pg.evaluate(() => {
    const stage=document.getElementById('cvStage'), cv=stage&&stage.querySelector('canvas');
    const card=document.getElementById('card'), warp=document.getElementById('warp');
    return { warpPainting: !!(warp&&warp.width>0),
             pressCanvas: !!cv, canvasSize: cv?cv.width+'x'+cv.height:null,
             stageVisible: stage?getComputedStyle(stage).opacity:null,
             flatHidden: card?getComputedStyle(card).visibility:null,
             view: !!window.__heroView,
             hint: (document.querySelector('.hint')||{}).textContent };
  });
  console.log('IPFS blocked · SwiftShader:');
  for (const [k,v] of Object.entries(r)) console.log('  '+k.padEnd(14), JSON.stringify(v));
  console.log('  pageErrors    ', errs.length, errs.slice(0,3).join(' | '));
  console.log('  404s          ', f404.length, [...new Set(f404)].slice(0,4).join(' '));
  await pg.screenshot({path:'hero-lens.png'});
  await b.close(); srv.close();
})();

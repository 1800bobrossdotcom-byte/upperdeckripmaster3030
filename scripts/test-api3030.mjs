#!/usr/bin/env node
/* ripmaster3030studios — the 3030 API suite.  `npm run test:api3030` (17)
 *
 * ⛔ THE ONLY ASSERTION HERE THAT MEANS ANYTHING IS THE PAIR: a clean chain must VERIFY and a
 *   tampered one must FAIL. Either alone is satisfied by a check that always says the same thing —
 *   and that is not hypothetical, it is what happened. The first version hashed the wrong preimage,
 *   so it rejected every block; the sabotage test PASSED, looking like a working guard, while the
 *   clean-chain test was the one that exposed it.
 * ⚑ And the re-derivation is done OUTSIDE the handler, with node's own crypto against the
 *   `preimage` string the API ships. That is the product claim under test — you do not have to
 *   trust this server — so proving it by calling the server's own hash function would prove
 *   nothing at all.
 * ⚠ The sabotage restores data/substrate.json from a copy in `finally`, because a harness that
 *   leaves the repo damaged when it throws is worse than no harness.
 */
import handler from '../api/3030.js';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
let pass=0,fail=0; const ok=(c,m)=>{c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✕ '+m));};
function call(q){ return new Promise(r=>{ let code=0,body=null;
  handler({method:'GET',query:q},{setHeader(){},status(c){code=c;return this;},send(b){/* the handler stringifies before send; parse when it is JSON, keep it when it is ndjson */
    let v=b; if(typeof b==='string'){ try{v=JSON.parse(b);}catch{} } r({code,body:v});}});});}

console.log('\n── the head ──');
let h=await call({});
ok(h.code===200,'200');
ok(h.body.protocol&&h.body.layer==='00',`protocol ${h.body.protocol} layer ${h.body.layer}`);
ok(typeof h.body.height==='number'&&h.body.height>0,`height ${h.body.height}`);
ok(/^[0-9a-f]{64}$/.test(h.body.genesis||''),'genesis is a sha256');
ok(/^[0-9a-f]{64}$/.test(h.body.head||''),'head is a sha256');
ok(h.body.ageSeconds!=null,`states its own age: ${h.body.ageSeconds}s — a caller cannot ask a JSON file how old it is`);

console.log('\n── one block ships the recipe ──');
const n=h.body.blocks[0].height;
let b=await call({height:String(n)});
ok(b.code===200&&b.body.block,`block ${n} served`);
ok(typeof b.body.block.preimage==='string'&&b.body.block.preimage.length>40,'preimage shipped verbatim');
ok(typeof b.body.block.censusCanonical==='string','census canonical shipped too');
/* ⛔ THE ASSERTION THAT MEANS ANYTHING: hash it MYSELF, outside the server, and get its hash back. */
const { createHash }=await import('node:crypto');
const mine=createHash('sha256').update(b.body.block.preimage).digest('hex');
ok(mine===b.body.block.hash,`⛔ I RE-DERIVED THE HASH WITHOUT THE SERVER: ${mine.slice(0,16)}… === ${b.body.block.hash.slice(0,16)}…`);
let m=await call({height:'999999'});
ok(m.code===404&&m.body.available,'a missing height 404s AND says what range exists');

console.log('\n── verification ──');
let v=await call({verify:'1'});
ok(v.body.verification&&v.body.verification.ok===true,`clean chain verifies — ${v.body.verification.checked} links`);

console.log('\n── ⛔ SABOTAGE · can verify catch a lie? ──');
copyFileSync('data/substrate.json','/tmp/sub.bak');
try{
  const j=JSON.parse(readFileSync('data/substrate.json','utf8'));
  // flip ONE character of one block's census — the sort of tamper a server would do silently
  j.blocks[1].census.counts.space += 1;   // a single tampered count, the silent kind
  writeFileSync('data/substrate.json',JSON.stringify(j));
  const mod=await import('../api/3030.js?bust='+Date.now());
  const r=await new Promise(res=>{let code=0;mod.default({method:'GET',query:{verify:'1'}},
    {setHeader(){},status(c){code=c;return this;},send(bd){let v=bd; if(typeof bd==='string'){try{v=JSON.parse(bd);}catch{}} res({code,body:v});}});});
  const vv=r.body.verification;
  ok(vv && vv.ok===false, 'a tampered canonical string is CAUGHT');
  ok(vv && vv.break && vv.break.height!=null, `…and it NAMES the break: height ${vv&&vv.break&&vv.break.height} · ${vv&&vv.break&&vv.break.reason}`);
  ok(vv && vv.break && vv.break.expected && vv.break.got, '…with both hashes, so a caller can look');
}finally{ copyFileSync('/tmp/sub.bak','data/substrate.json'); }

console.log('\n── stream ──');
let s=await call({format:'ndjson'});
const lines=String(s.body).trim().split('\n');
ok(lines.length===h.body.height,`ndjson is one block per line (${lines.length})`);
ok(JSON.parse(lines[0]).preimage,'…each line carries its own preimage');
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
import handler from '../api/3030.js';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
let pass=0,fail=0; const ok=(c,m)=>{c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✕ '+m));};
function call(q){ return new Promise(r=>{ let code=0,body=null;
  handler({method:'GET',query:q},{setHeader(){},status(c){code=c;return this;},send(b){/* the handler stringifies before send; parse when it is JSON, keep it when it is ndjson */
    let v=b; if(typeof b==='string'){ try{v=JSON.parse(b);}catch{} } r({code,body:v});}});});}

console.log('\n── the head ──');
let h=await call({});
ok(h.code===200,'200');
ok(h.body.protocol&&h.body.layer==='00',`protocol ${h.body.protocol} layer ${h.body.layer}`);
ok(typeof h.body.height==='number'&&h.body.height>0,`height ${h.body.height}`);
ok(/^[0-9a-f]{64}$/.test(h.body.genesis||''),'genesis is a sha256');
ok(/^[0-9a-f]{64}$/.test(h.body.head||''),'head is a sha256');
ok(h.body.ageSeconds!=null,`states its own age: ${h.body.ageSeconds}s — a caller cannot ask a JSON file how old it is`);

console.log('\n── one block ships the recipe ──');
const n=h.body.blocks[0].height;
let b=await call({height:String(n)});
ok(b.code===200&&b.body.block,`block ${n} served`);
ok(typeof b.body.block.preimage==='string'&&b.body.block.preimage.length>40,'preimage shipped verbatim');
ok(typeof b.body.block.censusCanonical==='string','census canonical shipped too');
/* ⛔ THE ASSERTION THAT MEANS ANYTHING: hash it MYSELF, outside the server, and get its hash back. */
const { createHash }=await import('node:crypto');
const mine=createHash('sha256').update(b.body.block.preimage).digest('hex');
ok(mine===b.body.block.hash,`⛔ I RE-DERIVED THE HASH WITHOUT THE SERVER: ${mine.slice(0,16)}… === ${b.body.block.hash.slice(0,16)}…`);
let m=await call({height:'999999'});
ok(m.code===404&&m.body.available,'a missing height 404s AND says what range exists');

console.log('\n── verification ──');
let v=await call({verify:'1'});
ok(v.body.verification&&v.body.verification.ok===true,`clean chain verifies — ${v.body.verification.checked} links`);

console.log('\n── ⛔ SABOTAGE · can verify catch a lie? ──');
copyFileSync('data/substrate.json','/tmp/sub.bak');
try{
  const j=JSON.parse(readFileSync('data/substrate.json','utf8'));
  // flip ONE character of one block's census — the sort of tamper a server would do silently
  j.blocks[1].census.counts.space += 1;   // a single tampered count, the silent kind
  writeFileSync('data/substrate.json',JSON.stringify(j));
  const mod=await import('../api/3030.js?bust='+Date.now());
  const r=await new Promise(res=>{let code=0;mod.default({method:'GET',query:{verify:'1'}},
    {setHeader(){},status(c){code=c;return this;},send(bd){let v=bd; if(typeof bd==='string'){try{v=JSON.parse(bd);}catch{}} res({code,body:v});}});});
  const vv=r.body.verification;
  ok(vv && vv.ok===false, 'a tampered canonical string is CAUGHT');
  ok(vv && vv.break && vv.break.height!=null, `…and it NAMES the break: height ${vv&&vv.break&&vv.break.height} · ${vv&&vv.break&&vv.break.reason}`);
  ok(vv && vv.break && vv.break.expected && vv.break.got, '…with both hashes, so a caller can look');
}finally{ copyFileSync('/tmp/sub.bak','data/substrate.json'); }

console.log('\n── stream ──');
let s=await call({format:'ndjson'});
const lines=String(s.body).trim().split('\n');
ok(lines.length===h.body.height,`ndjson is one block per line (${lines.length})`);
ok(JSON.parse(lines[0]).preimage,'…each line carries its own preimage');
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);

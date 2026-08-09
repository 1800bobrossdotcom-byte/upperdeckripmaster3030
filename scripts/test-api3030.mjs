#!/usr/bin/env node
/* ripmaster3030studios — the 3030 API suite.  `npm run test:api3030`
 *
 * ⛔ THE ONLY ASSERTION HERE THAT MEANS ANYTHING IS THE PAIR: a clean chain must VERIFY and a
 *   tampered one must FAIL. Either alone is satisfied by a check that always says the same thing —
 *   and that is not hypothetical, it is what happened. The first API hashed the wrong preimage, so
 *   it rejected every block; the SABOTAGE test PASSED, looking like a working guard, while the
 *   clean-chain test was the one that exposed it (0 links verified on a healthy chain).
 * ⚑ The re-derivation is done OUTSIDE the handler, with node's own crypto against the `preimage`
 *   string the API ships. The product claim under test is "you do not have to trust this server",
 *   so proving it by calling the server's own hash function would prove nothing.
 * ⚠ The sabotage restores data/substrate.json in `finally` — a harness that leaves the repo
 *   damaged when it throws is worse than no harness.
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
ok(typeof h.body.height==='number'&&h.body.height>=0,`height ${h.body.height}`);
/* ⛔ THE ASSERTION THAT WAS MISSING, AND THE MOST OBVIOUS CALL ANYBODY MAKES: read `height` off
 *   the head and ask for that block. It 404'd in production — `height` was `blocks.length` (6)
 *   while blocks number from 0, so the head was at 5 and the API contradicted itself in the same
 *   breath, answering with `available: {from:0, to:5}`. A COUNT AND AN INDEX ARE DIFFERENT
 *   NUMBERS, and every existing assertion passed throughout because each tested one field in
 *   isolation. The bug only exists in the RELATIONSHIP between two of them. */
{
  const round = await call({ height: String(h.body.height) });
  ok(round.code===200 && round.body.block && round.body.block.hash===h.body.head,
    `⛔ THE HEAD'S OWN height ROUND-TRIPS: GET ?height=${h.body.height} returns the head block`);
  ok(h.body.blockCount === h.body.height + 1,
    `a count and an index are different numbers, and both are served: ${h.body.blockCount} blocks, head at height ${h.body.height}`);
}
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
/* ⛔ THE FILE-MUTATION SABOTAGE STOPPED WORKING when the handler moved to a STATIC import — ESM
 *   caches JSON by specifier, so re-importing with a cache-buster on the parent still resolves the
 *   same child. A sabotage that cannot reach the code proves nothing, and this one would have gone
 *   on printing green. `walk` is exported and driven directly on a tampered in-memory chain, which
 *   is the detector itself rather than a filesystem trick. */
{
  const { walk } = await import('../api/3030.js');
  const clean = JSON.parse(JSON.stringify((await import('../data/substrate.json',{with:{type:'json'}})).default));
  ok(walk(clean).ok === true, `the untampered chain still verifies — ${walk(clean).checked} links`);
  const bad = JSON.parse(JSON.stringify(clean));
  bad.blocks[1].census.counts.space += 1;      // one incremented count, the silent kind
  const v = walk(bad);
  ok(v.ok === false, 'a single tampered byte-count is CAUGHT');
  ok(v.break && v.break.height != null, `…and it NAMES the break: height ${v.break && v.break.height} · ${v.break && v.break.reason}`);
  ok(v.break && v.break.expected && v.break.got, '…with both hashes, so a caller can look');
  const bad2 = JSON.parse(JSON.stringify(clean));
  bad2.blocks[2].prev = '0'.repeat(64);
  const v2 = walk(bad2);
  ok(v2.ok === false && v2.break.reason === 'parent mismatch', 'a re-parented block is caught as a PARENT break, not a hash break');
}

console.log('\n── stream ──');
let s=await call({format:'ndjson'});
const lines=String(s.body).trim().split('\n');
/* ⚠ THIS ASSERTION WAS PASSING BECAUSE OF THE BUG. It compared a line COUNT against `height`, and
 *   it only held while `height` was secretly the count. Wrong semantics do not stay in one place —
 *   they get read by the next thing written, which then looks like corroboration. */
ok(lines.length===h.body.blockCount,`ndjson is one block per line (${lines.length})`);
ok(JSON.parse(lines[0]).preimage,'…each line carries its own preimage');
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);

#!/usr/bin/env node
/* ripmaster3030studios — THE DRAIN SCREEN DISCRIMINATES.  `npm run test:drain`
 *
 * ⛔ "THE SCREEN FOUND NOTHING" IS TRIVIALLY TRUE OF A BROKEN SCREEN, and most windows genuinely
 *   contain nothing — so a quiet run is indistinguishable from a dead one unless something proves
 *   the ranking can still fire. That is what this file is. No network: it feeds the scorer
 *   fabricated candidates of known shape and requires the ranking to separate them.
 *
 * ⚑ THE HISTORY TERM IS THE ONE UNDER TEST. The first version of this screen put Uniswap's Base
 *   routers and LI.FI's bridge diamond on its front page — a feed whose first rows are
 *   infrastructure wastes an analyst's time and discredits everything below it. The obvious fix
 *   was a longer allowlist, and that is the WRONG fix: an address wrongly allowlisted is a real
 *   drainer made permanently invisible, which is the only error direction with a victim. The fix
 *   that shipped is COMPUTED — has this spender been taking approvals since before the window? —
 *   so it cannot be wrong about an address nobody thought to list.
 */
import { score } from './drain.mjs';

let checks = 0, fails = 0;
const ok = (c, m, d) => { checks++; if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${d ? '  — ' + d : ''}`); };

const mk = (o) => ({
  owners: new Set(Array.from({ length: o.v }, (_, i) => '0x' + i)),
  tokens: new Set(Array.from({ length: o.t }, (_, i) => 't' + i)),
  unlimited: o.unl || 0, forAll: o.fa || 0, n: o.n || o.v,
  firstBlock: o.fb ?? 1000, lastBlock: o.lb ?? 1010,
  isContract: o.c === undefined ? true : o.c, codeSize: o.cs || 900,
  priorHits: o.prior, priorChecked: o.prior !== null,
});

console.log('\n── the ranking separates a drainer from infrastructure ──');
const drainer = score(mk({ v: 30, t: 6, unl: 30, n: 30, fb: 1000, lb: 1020, cs: 400, prior: 0 }));
const nftDrain = score(mk({ v: 14, t: 4, fa: 14, n: 14, fb: 1000, lb: 1012, cs: 300, prior: 0 }));
const router   = score(mk({ v: 130, t: 75, unl: 20, n: 200, fb: 1000, lb: 1600, cs: 5176, prior: 360 }));
const newLegit = score(mk({ v: 40, t: 30, unl: 10, n: 50, fb: 1000, lb: 1500, cs: 12000, prior: 0 }));
const quiet    = score(mk({ v: 3, t: 2, unl: 1, n: 3, fb: 1000, lb: 1400, cs: 2000, prior: 12 }));

ok(drainer.score >= 60, 'an ERC-20 drainer shape reaches LOOK', `${drainer.score}`);
ok(nftDrain.score >= 60, 'a setApprovalForAll burst reaches LOOK', `${nftDrain.score}`);
ok(router.score < 35, 'a router with history and wide spread is noise', `${router.score}`);
ok(drainer.score - router.score >= 60, 'and the gap between them is decisive',
  `${drainer.score} vs ${router.score}`);

/* ⚠ THE MOST IMPORTANT ROW. A new legitimate protocol is the honest false positive, and the tool
 *   must damp it rather than pretend it does not exist. Wide token spread is what saves it. */
ok(newLegit.score < 60, 'a NEW protocol with router-like spread does not reach LOOK',
  `${newLegit.score} — the honest false positive, damped not denied`);
ok(quiet.score < 35, 'three approvals to an established spender is noise', `${quiet.score}`);

console.log('\n── each term is load-bearing (remove it and the separation collapses) ──');
/* history */
const drainerAged = score(mk({ v: 30, t: 6, unl: 30, n: 30, fb: 1000, lb: 1020, cs: 400, prior: 200 }));
ok(drainerAged.score < drainer.score - 40,
  'HISTORY: the identical burst with a year of history drops out of LOOK',
  `${drainer.score} → ${drainerAged.score}`);
/* spread */
const drainerWide = score(mk({ v: 30, t: 60, unl: 30, n: 30, fb: 1000, lb: 1020, cs: 400, prior: 0 }));
ok(drainerWide.score < drainer.score,
  'SPREAD: the identical burst across 60 tokens scores lower — that is router behaviour',
  `${drainer.score} → ${drainerWide.score}`);
/* burst */
const drainerSlow = score(mk({ v: 30, t: 6, unl: 30, n: 30, fb: 1000, lb: 5000, cs: 400, prior: 0 }));
ok(drainerSlow.score < drainer.score,
  'BURST: the same victims spread over 4,000 blocks scores lower',
  `${drainer.score} → ${drainerSlow.score}`);
/* unlimited */
const drainerCapped = score(mk({ v: 30, t: 6, unl: 0, n: 30, fb: 1000, lb: 1020, cs: 400, prior: 0 }));
ok(drainerCapped.score < drainer.score,
  'UNLIMITED: exact-amount approvals score lower than blanket ones',
  `${drainer.score} → ${drainerCapped.score}`);

console.log('\n── it never renders a verdict ──');
const words = JSON.stringify([drainer, nftDrain, router, newLegit, quiet]).toLowerCase();
/* ⛔ THE TOOL EMITS EVIDENCE, NEVER AN ACCUSATION. A feed that publishes "scam" against an
 *   address is defamatory when wrong, unfalsifiable to the person named, and cannot be retracted
 *   from the people who read it. Asserted, because a comment does not survive a hurried edit. */
for (const w of ['scam', 'drainer', 'malicious', 'thief', 'fraud', 'criminal', 'stolen'])
  ok(!words.includes(w), `no reason string calls anything "${w}"`);
ok(drainer.reasons.every(r => /\d/.test(r) || /^(spender|no approvals|history)/.test(r)),
  'every reason is a COUNT or a stated read, not a characterisation',
  drainer.reasons.length + ' reasons');

console.log(`\n${fails ? 'FAIL' : 'PASS'}  ${checks - fails}/${checks}\n`);
process.exit(fails ? 1 : 0);

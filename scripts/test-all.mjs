#!/usr/bin/env node
/* ripmaster3030studios — RUN EVERY SUITE, INDEPENDENTLY, AND REPORT ALL OF THEM.
 *
 * ⛔ `npm test` CHAINS 26 SUITES WITH `&&`, SO A FAILURE HALTS THE CHAIN. Everything after the
 *   first failure never runs, and the tail of the log shows whichever suite ran last — which
 *   looks exactly like a clean finish. This repo has already reported "green" twice off a chain
 *   that had actually stopped early. Reading npm's own exit code fixes the *reporting*; it does
 *   not fix the fact that ONE failure hides TWENTY-FIVE results.
 *
 * ⚑ SO THIS RUNS EACH SUITE ON ITS OWN AND NEVER SHORT-CIRCUITS. Before a launch you want the
 *   whole board, not the first red square: three small failures found together are one sitting,
 *   and found one at a time they are three.
 *
 * ⚠ IT ALSO WRITES A JSON RESULT FILE AS IT GOES, so a run that is killed part-way (a container
 *   timeout, an OOM) still reports everything it finished. The previous attempt at this was a
 *   backgrounded `npm test` whose exit code was written after the chain — it was killed, the
 *   file never appeared, and the run yielded nothing at all.
 *
 * ⚠ EXIT CODE IS THE NUMBER OF FAILED SUITES, so `node scripts/test-all.mjs; echo $?` is the
 *   single question worth asking. Do NOT pipe it — a pipe reports the pipe's exit code.
 *
 * Usage:  node scripts/test-all.mjs [--only a,b] [--skip c,d] [--timeout 600]
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The chain, in `npm test` order. Kept as a literal list rather than derived from package.json:
 * the order is deliberate (cheap text checks first, driven browser suites after), and a derived
 * list would silently pick up any future `test:something` that is not part of the gate. */
const SUITES = [
  'name', 'lens', 'embed', 'pack', 'split', 'lens-state', 'rig', 'hero', 'sheet',
  's9cast', 'guns', 'gunsfx', 'cardlayers', 'gfxfx', 'ronin', 'roninart', 'pickups', 'press',
  'theme', 'forge', 'reach', 'cab', 'rr', 'crstreak', 'titles', 'city', 'citynet',
  'challenge', 'arena', 'updates', 'board', 'mm', 'onramp', 'standalone', 'rewards', 'flow', 'bot',
  /* ⛔ FIVE SQUARES WERE MISSING FROM THE BOARD, ON A BOARD WHOSE OWN §0 COMMENT SAYS A MISSING
   * SQUARE READS AS COMPLETE. `substrate`, `substrate:attack`, `drain` and `api3030` were written
   * over the preceding days and never added to the `npm test` chain, so §0 — which compares this
   * list AGAINST that chain — agreed with itself and reported a full board. **A guard that checks
   * two lists against each other is blind to anything absent from both.** All five are hermetic
   * (no network, and `substrate`'s only https strings are a defanged URL fixture), so there is no
   * cost argument for leaving them off. */
  'substrate', 'substrate:attack', 'drain', 'check', 'poolfind', 'api3030', 'crypt', 'rail', 'apiterm',
  'pull', 'blade',
];
/* ⛔ §0 — THE LIST ABOVE AND `npm test` MUST NAME THE SAME SUITES, AND THE LIST STAYS LITERAL.
 * Keeping it literal is right (see the note above: the order is deliberate and a derived list
 * would sweep up any future `test:*` that is not part of the gate) — but "literal" means it is a
 * SECOND place the suites are named, and a second list falls behind. It already did: `crstreak`
 * was added to the chain and missed here, and this runner reported a board of **26 green squares
 * out of 27** with no indication a suite was absent. ⚑ A missing square on a board whose entire
 * job is "show me everything" is the exact reassuring-wrong-answer this file was written against,
 * so the two are reconciled as SETS here and the run refuses to start if they disagree. */
const CHAIN = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    /* ⚠ THE COLON IS IN THE CHARACTER CLASS BECAUSE A SUITE NAME CAN CONTAIN ONE, and without it
     * this guard could not see its own newest square: `npm run test:substrate:attack` parsed as
     * `substrate`, producing a duplicate the chain already had and never producing
     * `substrate:attack` at all — so the reconciliation reported the attack suite as "on the
     * board, not in the chain" while it was sitting in the chain being misread. **A parser that
     * cannot express the thing it parses reports the absence of what it cannot see.** */
    return [...String(pkg.scripts?.test || '').matchAll(/\btest:([a-z0-9:-]+)/g)].map((m) => m[1]);
  } catch { return null; }
})();
if (CHAIN && CHAIN.length) {
  const missing = CHAIN.filter((s) => !SUITES.includes(s));
  const extra = SUITES.filter((s) => !CHAIN.includes(s));
  if (missing.length || extra.length) {
    console.error('\n⛔ scripts/test-all.mjs is out of step with package.json\'s `test` chain.');
    if (missing.length) console.error('   in the chain, MISSING from this board: ' + missing.join(', '));
    if (extra.length) console.error('   on this board, NOT in the chain:        ' + extra.join(', '));
    console.error('   Fix SUITES above, or the chain — a board with a square missing reads as complete.\n');
    process.exit(1);
  }
}

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
};
const only = arg('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const skip = (arg('--skip')?.split(',').map((s) => s.trim()).filter(Boolean)) || [];
/* ⛔ 600 WAS A FALSE-RED WAITING TO HAPPEN, AND IT HAPPENED. `press` prints 38/38 and is then
 *   SIGKILLed at the ceiling — the board reports FAIL for a suite in which every assertion
 *   passed, which is the reassuring-wrong-answer this file exists to prevent, with the sign
 *   flipped. That suite waits 22s per sabotage visit by design (a dead press has to be given the
 *   whole budget it would have had) and was already sitting at 578s before anything was added to
 *   it. A ceiling one bad container-minute above the slowest suite is not a guard, it is a
 *   coin flip. 900 still catches a genuine hang; it does not catch a slow honest run. */
const TIMEOUT = Number(arg('--timeout') || 900) * 1000;
const OUT = arg('--out') || join(ROOT, 'test-results.json');

const list = SUITES.filter((s) => (!only || only.includes(s)) && !skip.includes(s));

const results = [];
const save = () => { try { writeFileSync(OUT, JSON.stringify(results, null, 2)); } catch {} };

/* Suites print their own "N passed, M failed." line. Pull it out so the summary can show the
 * assertion counts, not just pass/fail — a suite that silently drops from 60 assertions to 2 is
 * still "passing", and that is a real failure mode this repo has hit (a harness that crashes
 * instead of failing prints no total at all). */
/* ⚠ THERE ARE TWO SUMMARY FORMATS IN THIS REPO, and reading only one reported "—" for three
 *   suites — embed, pack and split, i.e. the PackSink and wallet-calldata suites, some of the
 *   most load-bearing here. A dash is indistinguishable from a suite that ran no assertions at
 *   all, which is a real failure mode: a harness that CRASHES instead of failing prints no total
 *   either, and this repo has already been fooled by exactly that. Both shapes are read now. */
const tally = (s) => {
  const a = [...s.matchAll(/(\d+)\s+passed,\s+(\d+)\s+failed/g)].pop();
  if (a) return { passed: +a[1], failed: +a[2] };
  const b = [...s.matchAll(/(\d+)\s*\/\s*(\d+)\s+passed/g)].pop();
  return b ? { passed: +b[1], failed: +b[2] - +b[1] } : null;
};

const run = (name) => new Promise((resolve) => {
  const started = Date.now();
  const p = spawn('npm', ['run', '--silent', `test:${name}`], {
    cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  const timer = setTimeout(() => { p.kill('SIGKILL'); }, TIMEOUT);
  p.on('close', (code, signal) => {
    clearTimeout(timer);
    resolve({
      suite: name,
      code: code === null ? -1 : code,
      signal: signal || null,
      ms: Date.now() - started,
      tally: tally(out),
      tail: out.split('\n').filter((l) => /FAIL|Error|error:/i.test(l)).slice(0, 12),
    });
  });
});

console.log(`▶ ${list.length} suites, independently, no short-circuit\n`);
for (const name of list) {
  const r = await run(name);
  results.push(r); save();
  const t = r.tally ? `${r.tally.passed}/${r.tally.passed + r.tally.failed}` : '—';
  const mark = r.code === 0 ? 'ok  ' : 'FAIL';
  console.log(`  ${mark} ${name.padEnd(12)} ${String(Math.round(r.ms / 1000) + 's').padStart(5)}  ${t}` +
    (r.signal ? `  killed:${r.signal}` : ''));
  for (const l of r.tail) console.log(`         ${l.trim().slice(0, 140)}`);
}

const bad = results.filter((r) => r.code !== 0);
const assertions = results.reduce((n, r) => n + (r.tally?.passed || 0), 0);
console.log(`\n${results.length - bad.length}/${results.length} suites green · ${assertions} assertions passed`);
if (bad.length) console.log(`FAILED: ${bad.map((r) => r.suite).join(', ')}`);
console.log(`→ ${OUT}`);
process.exit(bad.length);

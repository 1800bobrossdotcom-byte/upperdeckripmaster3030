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
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The chain, in `npm test` order. Kept as a literal list rather than derived from package.json:
 * the order is deliberate (cheap text checks first, driven browser suites after), and a derived
 * list would silently pick up any future `test:something` that is not part of the gate. */
const SUITES = [
  'name', 'launch', 'lens', 'embed', 'pack', 'split', 'lens-state', 'rig', 'hero', 'sheet',
  's9cast', 'guns', 'gunsfx', 'cardlayers', 'gfxfx', 'ronin', 'roninart', 'pickups', 'press',
  'theme', 'forge', 'reach', 'cab', 'rr', 'city', 'citynet',
];

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
};
const only = arg('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const skip = (arg('--skip')?.split(',').map((s) => s.trim()).filter(Boolean)) || [];
const TIMEOUT = Number(arg('--timeout') || 600) * 1000;
const OUT = arg('--out') || join(ROOT, 'test-results.json');

const list = SUITES.filter((s) => (!only || only.includes(s)) && !skip.includes(s));

const results = [];
const save = () => { try { writeFileSync(OUT, JSON.stringify(results, null, 2)); } catch {} };

/* Suites print their own "N passed, M failed." line. Pull it out so the summary can show the
 * assertion counts, not just pass/fail — a suite that silently drops from 60 assertions to 2 is
 * still "passing", and that is a real failure mode this repo has hit (a harness that crashes
 * instead of failing prints no total at all). */
const tally = (s) => {
  const m = [...s.matchAll(/(\d+)\s+passed,\s+(\d+)\s+failed/g)].pop();
  return m ? { passed: +m[1], failed: +m[2] } : null;
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

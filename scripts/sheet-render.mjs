#!/usr/bin/env node
/* ripmaster3030studios — SHEET: the bench plates.  `npm run sheet`
 *
 * ⛔ THE RENDERER LIVES IN `js/sheet.js` AND THIS FILE READS IT. It does not import a copy and it
 *   does not reimplement one: it loads the shipped browser file and evaluates it, so the plate
 *   written here and the plate composed in `sheet.html` are produced by the identical bytes.
 *   ⚑ That is stronger than importing a shared module would be, because the thing under test is
 *     THE FILE THAT SHIPS. This repo has paid twice for a harness that reimplemented the thing it
 *     was testing and therefore only proved the harness.
 * ⚠ `js/sheet.js` is a classic script rather than ESM because `npm run test:reach` §0 compiles
 *   every shipped browser script with `new Function`, where an `export` keyword is a SyntaxError.
 *
 * WHAT THIS IS FOR: printing plates at card size and looking at them on a bench. The decision
 * this design turns on — **does it read as a page or as a chart?** — is not settleable on a
 * screen, and three of the renderer's defects were found by rendering it and looking, none by
 * any test.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* load the SHIPPED renderer, not a copy of it */
const shim = {};
new Function('window', readFileSync(join(ROOT, 'js/sheet.js'), 'utf8'))(shim);
export const Sheet = shim.Sheet;
const { plate, CAP, W_WRITTEN, COLS } = Sheet;

const enc = new TextEncoder();
const pad = (s) => { const a = new Uint8Array(CAP); a.set(enc.encode(s).slice(0, CAP)); return a; };

/* ⚠ THE PLATES THAT DECIDE IT — the extremes of the composition, because the chart risk lives at
 * the ends. And one from REAL calldata, because a synthetic ramp is the single input that
 * flatters a value→height mapping, which is exactly how the first version's bar chart survived
 * its own test data. */
const PLATES = {
  'a-paper': pad('the space you did not pay for'),
  'b-mixed': pad(
    'everything is data\n' +
    'everything is connected\n\n' +
    'eth prints a substrate\n' +
    'each sigil and space\n' +
    'a mark on chain'),
  'c-ink': (() => {
    const a = new Uint8Array(CAP);
    for (let i = 0; i < CAP; i++) a[i] = 0x80 + (i * 7) % 0x7f;
    return a;
  })(),
  'd-chain': (() => {
    const a = new Uint8Array(CAP);
    try {
      const d = JSON.parse(readFileSync(join(ROOT, 'data/substrate.json'), 'utf8'));
      const seed = d.blocks[d.blocks.length - 1].hash;
      for (let i = 0; i < CAP; i++) a[i] = parseInt(seed.substr((i * 2) % 62, 2), 16) ^ (i * 31 & 0xff);
      /* leave real padding in it — the chain is mostly zero and the plate should show that */
      for (let i = 0; i < CAP; i++) if ((i % COLS) > 19) a[i] = 0;
    } catch { /* an empty plate is a legitimate plate */ }
    return a;
  })(),
};

mkdirSync(join(ROOT, 'build/sheet'), { recursive: true });
console.log('\n══ SHEET · plates for the bench ══\n');
for (const [name, bytes] of Object.entries(PLATES)) {
  const { svg, stats } = plate(bytes, { title: name });
  writeFileSync(join(ROOT, `build/sheet/${name}.svg`), svg);
  const pc = (n) => ((100 * n / CAP).toFixed(1) + '%').padStart(6);
  console.log(`  ${name.padEnd(9)} paper ${pc(stats.counts.space)} · type ${pc(stats.counts.type)} · slug ${pc(stats.counts.slug)}`);
  console.log(`  ${' '.repeat(9)} tokens ${String(stats.tokens).padStart(4)}/${CAP * W_WRITTEN}` +
    `  · lines ${stats.narrowest}–${stats.widest} of ${Sheet.BLOCK_W} units` +
    `  · rules ${stats.rules} · tint ${stats.tintBlocks} · paid blanks ${stats.paidBlanks}`);
  console.log(`  ${' '.repeat(9)} ${svg.length.toLocaleString()} bytes of SVG\n`);
}
console.log('  → build/sheet/*.svg\n');
console.log('  ⚠ THE DECISION IS NOT ON A SCREEN. Print these at card size (63×88mm) and look');
console.log('    at them on a bench. If it reads as a chart, the gesture changes.\n');

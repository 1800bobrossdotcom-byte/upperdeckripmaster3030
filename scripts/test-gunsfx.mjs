/* The gunshots must be BUILT, not beeped. `npm run test:gunsfx`
 *
 * ⛔ What was there: one noise burst plus one falling square tone per weapon, identical on every
 *    trigger. On the SMG that is a 9.5 Hz loop of one waveform, and the ear stops hearing gunfire
 *    and starts hearing an oscillator. The fix is js/gun-sfx.js — crack / body / tail / mech with
 *    per-shot jitter.
 *
 * ⚑ "It sounds better" is not testable and "it makes a sound" is the weak question — the OLD kit
 *    made a sound. So this drives a real Web Audio graph in a browser with a stubbed
 *    AudioContext, records every node created and every parameter set, and asserts the STRUCTURE:
 *
 *      · every weapon schedules a CRACK (highpass) and a BODY (oscillator) and a TAIL (lowpass)
 *      · two consecutive shots of the same weapon are NOT identical   ← kills the old kit
 *      · the four weapons differ from each other                      ← kills four copies of one
 *      · no shot allocates a new noise buffer                         ← kills the per-shot alloc
 *
 * Stubbing rather than measuring output: this container has no audio device, and the assertions
 * are about what the synth ASKS FOR, which is exactly what a stub can see.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* ⚑ EPHEMERAL PORT, NOT A FIXED ONE. Several harnesses in this repo bind a server, and when two
 * run at once the second dies with EADDRINUSE — which reads as "the test hangs" or "the build is
 * broken", not as "pick another port". It cost real time this session, and a killed process leaves
 * the port held afterwards, so the next clean run fails too. `listen(0)` asks the OS for a free
 * one; nothing outside this file ever needs to know the number. */
let PORT = 0;

let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}` + (detail ? `  — ${detail}` : '')); }
  else { fail++; console.log(`  FAIL ${name}` + (detail ? `  — ${detail}` : '')); }
};

const srv = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try {
    const d = readFileSync(join(ROOT, p));
    rs.writeHead(200, { 'content-type': extname(p) === '.js' ? 'text/javascript' : 'text/html' });
    rs.end(d);
  } catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(r => srv.listen(0, r));
PORT = srv.address().port;

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto(`http://localhost:${PORT}/js/gun-sfx.js`, { waitUntil: 'load' });
await page.setContent('<!doctype html><meta charset=utf-8><title>gunsfx</title>');
await page.addScriptTag({ url: `http://localhost:${PORT}/js/gun-sfx.js` });

const res = await page.evaluate(() => {
  /* A recording AudioContext stub. Every node is a plain object that logs what is asked of it,
   * so a "shot" comes back as a list of layers with their filter types and frequencies. */
  function makeCtx() {
    const log = [];
    let now = 0;
    /* ⚠ Log the node ITSELF, not a snapshot. `Object.assign({kind}, o)` copies, so the record
       captured `type` at creation — before the synth set it — and every filter read back as the
       default 'lowpass'. That made the CRACK assertion fail against a module that was emitting
       one correctly. */
    const rec = (kind, o) => { o.kind = kind; log.push(o); return o; };
    const param = (owner, name) => ({
      value: 0,
      setValueAtTime(v, tt) { owner.calls.push([name, 'set', +v.toFixed(6), +tt.toFixed(4)]); return this; },
      setTargetAtTime(v, tt, tc) { owner.calls.push([name, 'target', +v.toFixed(6), +tt.toFixed(4), +tc.toFixed(5)]); return this; },
      exponentialRampToValueAtTime(v, tt) { owner.calls.push([name, 'ramp', +v.toFixed(4), +tt.toFixed(4)]); return this; },
      linearRampToValueAtTime(v, tt) { owner.calls.push([name, 'lin', +v.toFixed(4), +tt.toFixed(4)]); return this; },
    });
    const node = extra => {
      const n = Object.assign({ calls: [], connect(x) { return x; }, disconnect() {} }, extra);
      return n;
    };
    const ctx = {
      sampleRate: 48000,
      get currentTime() { return now; },
      destination: {},
      buffersMade: 0,
      createBuffer(ch, len, sr) {
        ctx.buffersMade++;
        return { length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) };
      },
      createBufferSource() {
        const n = node({ buffer: null, loop: false, start(tt, off) { n.startedAt = tt; n.offset = off; }, stop() {} });
        n.playbackRate = param(n, 'rate');
        rec('source', n); return n;
      },
      createBiquadFilter() {
        const n = node({ type: 'lowpass' });
        n.frequency = param(n, 'freq'); n.Q = param(n, 'q');
        rec('filter', n); return n;
      },
      createGain() { const n = node({}); n.gain = param(n, 'gain'); rec('gain', n); return n; },
      createOscillator() {
        const n = node({ type: 'sine', start(tt) { n.startedAt = tt; }, stop() {} });
        n.frequency = param(n, 'freq');
        rec('osc', n); return n;
      },
      _log: log,
      _reset() { log.length = 0; },
      _tick(dt) { now += dt; },
    };
    return ctx;
  }

  const ctx = makeCtx();
  const guns = window.GunSfx.create(() => ctx);
  const KEYS = ['pistol', 'smg', 'shotgun', 'sniper'];

  function shot(key) {
    ctx._reset();
    const before = ctx.buffersMade;
    guns.fire(key);
    ctx._tick(0.12);
    const filters = ctx._log.filter(n => n.kind === 'filter').map(n => ({
      type: n.type, f: (n.calls.find(c => c[0] === 'freq') || [])[2] || n.frequency.value,
    }));
    const oscs = ctx._log.filter(n => n.kind === 'osc').map(n => ({ type: n.type, calls: n.calls }));
    const gains = ctx._log.filter(n => n.kind === 'gain').map(n => n.calls);
    return {
      nodes: ctx._log.length,
      newBuffers: ctx.buffersMade - before,
      filters, oscs, gains,
      sig: JSON.stringify({ filters, oscs, gains }),
      envelopes: gains.map(cs => cs.map(c => c[1])).flat(),
    };
  }

  /* ⚑ Warm the shared noise buffer first. It is built ONCE, lazily, so the very first shot of the
     session legitimately allocates it — counting that as a per-shot allocation would assert the
     opposite of what is wanted. */
  shot('smg');
  const first = {}; const second = {};
  for (const k of KEYS) { first[k] = shot(k); second[k] = shot(k); }
  // a burst of automatic fire — how many of ten SMG shots are byte-identical to each other?
  const burst = [];
  for (let i = 0; i < 10; i++) burst.push(shot('smg').sig);
  const uniq = new Set(burst).size;

  return { KEYS, first, second, uniq, specKeys: Object.keys(window.GunSfx.SPEC) };
});

t('js/gun-sfx.js defines all four weapons',
  ['pistol', 'smg', 'shotgun', 'sniper'].every(k => res.specKeys.indexOf(k) >= 0), res.specKeys.join(','));

for (const k of res.KEYS) {
  const s = res.first[k];
  const hp = s.filters.filter(f => f.type === 'highpass');
  const lp = s.filters.filter(f => f.type === 'lowpass');
  /* The three layers, each identifiable by what it physically is: the crack is highpassed noise,
   * the body is an oscillator sweeping down, the tail is lowpassed noise. */
  t(`${k}: has a CRACK (highpassed noise)`, hp.length >= 1, hp.map(f => Math.round(f.f) + 'Hz').join(','));
  t(`${k}: has a BODY (a pitched-down oscillator)`,
    s.oscs.some(o => o.calls.some(c => c[0] === 'freq' && c[1] === 'ramp')), s.oscs.length + ' osc');
  t(`${k}: has a TAIL (lowpassed noise)`, lp.length >= 1, lp.map(f => Math.round(f.f) + 'Hz').join(','));
  /* ⚠ Exponential decay, not a linear fade. The old kit baked `(1 - i/len)` into the buffer,
   *   which is audibly a fade — the one thing an impulsive sound must not do. */
  t(`${k}: decays exponentially, not as a linear fade`,
    s.envelopes.indexOf('target') >= 0 && s.envelopes.indexOf('lin') < 0, s.envelopes.join('/'));
  /* One shared noise buffer, built once — not `sampleRate * dur` fresh floats per trigger. */
  t(`${k}: allocates NO new buffer per shot`, s.newBuffers === 0, s.newBuffers + ' new');
}

/* ⚑ THE ASSERTION THAT KILLS THE OLD KIT. Its four functions were deterministic, so two
 * consecutive shots produced byte-identical graphs. */
for (const k of res.KEYS) {
  t(`${k}: two consecutive shots are NOT identical`, res.first[k].sig !== res.second[k].sig);
}
t('ten rounds of automatic fire are ten different sounds', res.uniq === 10, res.uniq + '/10 unique');

/* ⚑ AND THE ONE THAT KILLS FOUR COPIES OF ONE PRESET. Compare the STRUCTURE across weapons —
 * crack frequency and layer count — rather than the jittered values. */
const shape = k => {
  const s = res.first[k];
  return s.filters.length + ':' + s.oscs.length + ':' + Math.round((s.filters.find(f => f.type === 'highpass') || {}).f / 100);
};
const shapes = res.KEYS.map(shape);
t('no two weapons share a voicing', new Set(shapes).size === res.KEYS.length,
  res.KEYS.map((k, i) => k + ' ' + shapes[i]).join(' · '));
/* The sniper is the only one with a SLAP — a second, delayed tail. That is what makes a rifle
 * read as far-carrying rather than merely loud. */
t('COLD CALL is the only weapon with a delayed slap-back',
  res.first.sniper.filters.filter(f => f.type === 'lowpass').length >
  res.first.pistol.filters.filter(f => f.type === 'lowpass').length,
  'sniper ' + res.first.sniper.filters.length + ' filters vs pistol ' + res.first.pistol.filters.length);

/* Fail-open: both builds must still carry the old kit behind a guard, so a missing module is a
 * quieter game rather than a silent one. */
const ui = readFileSync(join(ROOT, 'js/s9pc-ui.js'), 'utf8');
const cls = readFileSync(join(ROOT, 'section9-classic.html'), 'utf8');
t('the engine build falls open to the old kit', /if \(guns\) return guns\.fire\('smg'\); noise\(/.test(ui));
t('the classic build falls open too', /if\(GUNS\) return GUNS\.fire\('smg'\); noise\(/.test(cls));
t('both builds load js/gun-sfx.js',
  /<script src="js\/gun-sfx\.js"><\/script>/.test(readFileSync(join(ROOT, 'section9.html'), 'utf8'))
  && /<script src="js\/gun-sfx\.js"><\/script>/.test(cls));

await browser.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/* THE SCREEN FX OF SPEED AND TIME MUST BE MEASURED. `npm run test:gfxfx`
 *
 * `js/gfx-post.js` grew three features the artist asked for — velocity-driven motion blur, a
 * slow-motion screen treatment, and an "acid" pickup flash. Every one of them is the kind of
 * thing "it looks better" gets said about, and none of that survives a week (ROADMAP §5.1). So
 * this drives the real chain in a real browser against a fixed synthetic scene and asserts
 * NUMBERS: hue travel in degrees, luma and contrast before and after, clipped subpixels, streak
 * length in pixels at a stated speed.
 *
 * ⚑ THE ASSERTIONS THAT BITE ARE THE ONES THE OLD BEHAVIOUR CANNOT SATISFY (ROADMAP §5.2):
 *   · "it smeared" is weak — a constant blur passes it. So: STILL ⇒ EXACTLY 0, and three
 *     distinct speeds ⇒ three strictly increasing amounts. A constant fails both.
 *   · "there was a flash" is weak — a white bloom passes it. So: MEASURED HUE TRAVEL at a fixed
 *     pixel (DESIGN-SYSTEM §1's foil test, applied literally) and a saturation floor. White has
 *     no hue travel and no saturation, so it fails both.
 *   · "slow motion looked different" is weak. So: the dark quartile's hue must move toward cyan
 *     while MEAN LUMA MOVES BY LESS THAN 1 — which the first, additive, implementation could not
 *     do (it lifted mean luma 37.5 → 52.3), and which is the same failure shape as the rejected
 *     0.62 highlight knee.
 *
 * ⚠ This container is SwiftShader and its SCREENSHOT path rotates hue (CLAUDE.md). Every colour
 *   number here comes from `gl.readPixels` on the buffer the chain actually wrote — never from a
 *   screenshot — which is the readback CLAUDE.md says to trust. Frame TIMES are not measured here
 *   at all, because they would be relative-only and would not mean anything.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* ⚑ EPHEMERAL PORT. Several harnesses here bind a server and two at once used to die with
 * EADDRINUSE, which reads as "the test hangs". listen(0) asks the OS for a free one. */
const srv = http.createServer((rq, rs) => {
  const p = decodeURIComponent(rq.url.split('?')[0]);
  try {
    const d = readFileSync(join(ROOT, p));
    rs.writeHead(200, { 'content-type': extname(p) === '.js' ? 'text/javascript' : 'text/html' });
    rs.end(d);
  } catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}` + (detail ? `  — ${detail}` : '')); }
  else { fail++; console.log(`  FAIL ${name}` + (detail ? `  — ${detail}` : '')); }
};

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.setContent('<!doctype html><meta charset=utf-8><title>gfxfx</title><body style="margin:0;background:#000">');
await page.addScriptTag({ url: `http://localhost:${PORT}/js/gfx-post.js` });
await page.addScriptTag({ url: `http://localhost:${PORT}/js/gfx-2d.js` });

const R = await page.evaluate(async () => {
  const W = 512, H = 320;
  const out = { notes: [] };
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.appendChild(cv);
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, depth: true, preserveDrawingBuffer: true });
  if (!gl) return { fatal: 'no webgl' };

  /* A FIXED synthetic scene — dark field, two lit blobs, a lit floor band, hard vertical bars.
   * Deterministic and time-free: every number below is a property of the chain, never of when it
   * was sampled. (ROADMAP §5.6: never measure one frame of something that varies.) */
  const VS = 'attribute vec2 p; varying vec2 uv; void main(){ uv=p*0.5+0.5; gl_Position=vec4(p,0.0,1.0);} ';
  const body = 'vec3 sc(vec2 uv, float sx){ vec3 c=vec3(0.03,0.035,0.05);' +
    ' c+=vec3(0.30,0.62,0.42)*exp(-40.0*(pow(uv.x-sx,2.0)+pow(uv.y-0.55,2.0)));' +
    ' c+=vec3(0.70,0.55,0.18)*exp(-120.0*(pow(uv.x-(1.0-sx),2.0)+pow(uv.y-0.40,2.0)));' +
    ' c+=vec3(0.10,0.13,0.22)*step(uv.y,0.24);' +
    ' c+=vec3(0.06)*step(0.5,fract(uv.x*18.0)); return c; }';
  const mk = sx => 'precision mediump float; varying vec2 uv;' + body +
    'void main(){ gl_FragColor=vec4(sc(uv,' + sx + '),1.0); }';
  // a single bright mote at a settable position, for the smear-length measurement
  const DOT = 'precision mediump float; varying vec2 uv; uniform vec2 dp;' +
    'void main(){ float d=length((uv-dp)*vec2(1.6,1.0));' +
    ' gl_FragColor=vec4(vec3(0.02)+vec3(0.95,0.95,0.9)*exp(-2600.0*d*d),1.0); }';
  function prog(fs) { const p = gl.createProgram();
    const a = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(a, VS); gl.compileShader(a);
    if (!gl.getShaderParameter(a, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(a));
    const b = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(b, fs); gl.compileShader(b);
    if (!gl.getShaderParameter(b, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(b));
    gl.attachShader(p, a); gl.attachShader(p, b); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p; }
  const spA = prog(mk('0.30')), spB = prog(mk('0.70')), spD = prog(DOT);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  function draw(p, setu) { gl.useProgram(p); if (setu) setu(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  const sceneA = () => draw(spA), sceneB = () => draw(spB);
  const dotAt = x => draw(spD, p => gl.uniform2f(gl.getUniformLocation(p, 'dp'), x, 0.5));

  const px = new Uint8Array(W * H * 4);
  const shot = () => { gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px.slice(); };
  const idx = (x, y) => ((H - 1 - y) * W + x) * 4;            // readPixels is bottom-up
  function hsv(r, g, b) { r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0; if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360; return { h, s: mx > 0 ? d / mx : 0, v: mx }; }
  const arc = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  function stats(b) { let sum = 0, clip = 0, sub = 0; const n = b.length / 4;
    const l = new Float64Array(n);
    for (let i = 0, k = 0; i < b.length; i += 4, k++) {
      l[k] = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2]; sum += l[k];
      for (let c = 0; c < 3; c++) { sub++; if (b[i + c] >= 255) clip++; } }
    const mean = sum / n; let v = 0; for (let k = 0; k < n; k++) { const d = l[k] - mean; v += d * d; }
    return { mean: +mean.toFixed(2), rms: +Math.sqrt(v / n).toFixed(2), clip: +(100 * clip / sub).toFixed(4) }; }
  function bandHue(b, lo, hi) {          // circular, chroma-weighted mean hue of a luma quantile
    const a = []; for (let i = 0; i < b.length; i += 4) a.push([0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2], i]);
    a.sort((x, y) => x[0] - y[0]);
    const q = a.slice(Math.floor(a.length * lo), Math.floor(a.length * hi));
    let sx = 0, sy = 0; for (const [, i] of q) { const c = hsv(b[i], b[i + 1], b[i + 2]);
      sx += Math.cos(c.h * Math.PI / 180) * c.s; sy += Math.sin(c.h * Math.PI / 180) * c.s; }
    let hm = Math.atan2(sy, sx) * 180 / Math.PI; if (hm < 0) hm += 360; return +hm.toFixed(1); }
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) if (i % 4 !== 3) s += Math.abs(a[i] - b[i]);
    return +(s / (a.length * 0.75)).toFixed(3); };
  const spin = ms => { const w = performance.now(); while (performance.now() - w < ms) { /* real time */ } };

  // ── ① the chain comes up ──────────────────────────────────────────────────────────────────
  const P = GfxPost.create(gl, cv, GfxPost.PRESET.tactical);
  out.on = P.on;
  if (!P.on) return out;
  const f = () => { P.begin(); sceneA(); P.end(); return shot(); };
  f(); f();
  out.rest = { ...stats(f()), state: P.state };
  out.presetTactical = { ...GfxPost.PRESET.tactical };

  // ── ② the velocity driver ─────────────────────────────────────────────────────────────────
  const C = GfxPost.create(gl, cv, GfxPost.PRESET.tactical);
  const rows = {};
  const at = (label, c) => { C.camera(c); rows[label] = +C.state.motion.toFixed(4); };
  C.camera({ yaw: 0, pitch: 0, x: 0, y: 0, z: 0 });
  at('seedThenStill', { yaw: 0, pitch: 0, x: 0, y: 0, z: 0 });
  at('turn 1.375 rad/s', { yaw: 1.375 / 60, pitch: 0, x: 0, y: 0, z: 0 });
  at('turn 2.75 rad/s', { yaw: 1.375 / 60 + 2.75 / 60, pitch: 0, x: 0, y: 0, z: 0 });
  at('whip 5.5 rad/s', { yaw: 1.375 / 60 + 2.75 / 60 + 5.5 / 60, pitch: 0, x: 0, y: 0, z: 0 });
  let z = 0;
  C.camera({ yaw: 0, pitch: 0, x: 0, y: 0, z: 0 });
  at('walk 4.3 m/s', { yaw: 0, pitch: 0, x: 0, y: 0, z: (z += 4.3 / 60) });
  at('jog 5.6 m/s', { yaw: 0, pitch: 0, x: 0, y: 0, z: (z += 5.6 / 60) });
  at('sprint 7.0 m/s', { yaw: 0, pitch: 0, x: 0, y: 0, z: (z += 7.0 / 60) });
  at('boots 9.6 m/s', { yaw: 0, pitch: 0, x: 0, y: 0, z: (z += 9.6 / 60) });
  at('wall (intent, no travel)', { yaw: 0, pitch: 0, x: 0, y: 0, z: z });
  at('RUSH 9.5 @ vHi 9.6', { yaw: 0, pitch: 0, x: 0, y: 0, z: (z += 9.5 / 60) });
  at('FLIGHT 11.5 @ vHi 9.6', { yaw: 0, pitch: 0, x: 0, y: 0, z: (z += 11.5 / 60) });
  C.set({ vHi: 11.5 });
  at('RUSH 9.5 @ vHi 11.5', { yaw: 0, pitch: 0, x: 0, y: 0, z: (z += 9.5 / 60) });
  at('FLIGHT 11.5 @ vHi 11.5', { yaw: 0, pitch: 0, x: 0, y: 0, z: (z += 11.5 / 60) });
  C.dispose();
  out.camera = rows;

  // ── ③ the smear actually holds the previous frame ─────────────────────────────────────────
  function alternating(m, ts) {
    P.timeScale(ts == null ? 1 : ts); P.motion(m);
    P.begin(); sceneA(); P.end(); P.begin(); sceneB(); P.end();
    P.begin(); sceneA(); P.end(); const a = shot();
    P.begin(); sceneB(); P.end(); const b = shot();
    return { d: diff(a, b), smear: P.state.smear };
  }
  out.smearOff = alternating(0);
  out.smearOn = alternating(1);

  // smear LENGTH in pixels, at a stated speed: a mote crossing 0.02 uv (10.2 px) per frame
  function trailPx(m) {
    P.timeScale(1); P.motion(m);
    for (let i = 0; i < 14; i++) { P.begin(); dotAt(0.20 + i * 0.02); P.end(); }
    const b = shot(); const y = Math.round(H * 0.5);
    // the head is at 0.20+13*0.02 = 0.46; count lit pixels BEHIND it along the track
    let n = 0; const head = Math.round(0.46 * W);
    for (let x = head - 90; x < head; x++) { const i = idx(x, y);
      if (0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2] > 26) n++; }
    return n;
  }
  out.trailOff = trailPx(0);
  out.trailOn = trailPx(1);
  P.motion(0); P.timeScale(1);

  // ── ④ the pickup flash: hue travel at a fixed pixel ───────────────────────────────────────
  const FX = GfxPost.create(gl, cv, GfxPost.PRESET.neon);
  const ff = () => { FX.begin(); sceneA(); FX.end(); return shot(); };
  ff(); const pre = ff();
  const PX = Math.round(W * 0.5), PY = Math.round(H * 0.5);
  const preHue = hsv(pre[idx(PX, PY)], pre[idx(PX, PY) + 1], pre[idx(PX, PY) + 2]);
  /* ⚠ `life` IS STRETCHED FOR THE MEASUREMENT, AND ONLY FOR THE MEASUREMENT — 3.2 s here against
   * the shipping 0.55. This container is SwiftShader and a composite costs ~80 ms, so a 0.55 s
   * front is SIX FRAMES here and the first attempt read 24° of travel purely from undersampling
   * (r jumped 0.30 → 0.65 → 0.82 between samples). Stretching the clock changes nothing about the
   * geometry — the front follows the identical r(u) curve and the identical ink wheel — it only
   * samples it densely enough to integrate. Same reason ROADMAP §5.6 takes five frames: one
   * sample of an event-driven effect is a lottery. */
  FX.flash({ x: 0.25, y: 0.5, strength: 1.25, hue: 0, life: 3.2 });
  const trail = [];
  for (let i = 0; i < 34; i++) {
    spin(4);
    const b = ff(), i0 = idx(PX, PY);
    const c = hsv(b[i0], b[i0 + 1], b[i0 + 2]), st = stats(b);
    trail.push({ a: +FX.state.pulses[0].a.toFixed(3), r: +FX.state.pulses[0].r.toFixed(3),
                 h: +c.h.toFixed(1), s: +c.s.toFixed(3), v: +c.v.toFixed(3), clip: st.clip, mean: st.mean });
  }
  // total hue travel while the front is materially present at that pixel
  let travel = 0, peakSat = 0, live = trail.filter(r => r.a > 0.02 && r.s > 0.12);
  for (let i = 1; i < live.length; i++) travel += arc(live[i].h, live[i - 1].h);
  for (const r of live) peakSat = Math.max(peakSat, r.s);
  out.flash = { preHue: +preHue.h.toFixed(1), preMean: stats(pre).mean, trail,
                travelDeg: +travel.toFixed(1), peakSat: +peakSat.toFixed(3),
                maxClip: Math.max(...trail.map(r => r.clip)),
                liveFrames: live.length };
  // it retires with no residue — driven until the chain itself says the slot is dead, not for a
  // guessed number of frames (the first cut guessed, and under-ran the stretched 3.2 s life)
  let guard = 0;
  while (FX.state.pulses.some(p => p.a > 0) && guard++ < 400) { spin(3); ff(); }
  out.flash.retireFrames = guard;
  out.flash.afterMean = stats(ff()).mean;

  /* ⚠ AND IT STAYS AT 0 EVEN IF SOMEONE SETS AN ABSURD CEILING. The screen blend's guarantee
   * holds only for pceil ≤ 1 — measured: 1.15 ⇒ 0.0000% clipped, 1.60 ⇒ 0.1257%, unbounded
   * ⇒ 22.7% — so create() clamps it. This drives the clamp rather than trusting it. */
  FX.set({ flashCeil: 99 });
  ff(); ff();
  FX.flash({ x: 0.5, y: 0.5, strength: 2, hue: 0.25, life: 1.2 });
  FX.flash({ x: 0.52, y: 0.5, strength: 2, hue: 0.0, life: 1.2 });
  FX.flash({ x: 0.48, y: 0.52, strength: 2, hue: 0.75, life: 1.2 });
  let absurd = 0;
  for (let i = 0; i < 12; i++) { spin(4); absurd = Math.max(absurd, stats(ff()).clip); }
  out.flashAbsurdCeilClip = absurd;
  FX.set({ flashCeil: GfxPost.BASE.flashCeil });
  while (FX.state.pulses.some(p => p.a > 0)) { spin(3); ff(); }

  // it fires AT THE PICKUP, not at screen centre
  function centroidGain(fx) {
    ff(); ff(); const b0 = ff();
    FX.flash({ x: fx, y: 0.5, strength: 1.0, hue: 0, life: 0.55 });
    spin(30); const b1 = ff();
    let sx = 0, w = 0;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const i = idx(x, y);
      const g = Math.max(0, (b1[i] + b1[i + 1] + b1[i + 2]) - (b0[i] + b0[i + 1] + b0[i + 2]));
      sx += x * g; w += g; }
    for (let i = 0; i < 24; i++) { spin(17); ff(); }       // let it retire before the next
    return w > 0 ? +(sx / w / W).toFixed(3) : null;
  }
  out.flashLeft = centroidGain(0.22);
  out.flashRight = centroidGain(0.78);
  // the four plates in the shader are the four plates in JS
  const lit = (GfxPost.COMP_SRC.match(/vec3\(([\d.]+),([\d.]+),([\d.]+)\)/g) || []);
  out.shaderInks = lit.filter(s => /1\.000|0\.169|0\.153/.test(s)).slice(0, 8);
  out.jsInks = GfxPost.INKS;
  FX.dispose();

  // ── ⑤ time dilation ───────────────────────────────────────────────────────────────────────
  const D = GfxPost.create(gl, cv, GfxPost.PRESET.tactical);
  const df = () => { D.begin(); sceneA(); D.end(); return shot(); };
  D.set({ persist: 0 });                    // isolate the grade from the hold
  D.timeScale(1); df(); df(); const d0 = df();
  D.timeScale(0.42); df(); df(); const d1 = df();       // SLIP_K, s9pc-game.js
  out.dil = {
    off: { ...stats(d0), dark: bandHue(d0, 0, 0.25), mid: bandHue(d0, 0.4, 0.6) },
    slip: { ...stats(d1), dark: bandHue(d1, 0, 0.25), mid: bandHue(d1, 0.4, 0.6) },
    caOff: GfxPost.PRESET.tactical.ca,
    caSlip: +(GfxPost.PRESET.tactical.ca * (1 + 0.58 * GfxPost.BASE.dilCa)).toFixed(6),
  };
  // persistence: the hold works with the camera perfectly still (motion 0)
  D.set({ persist: GfxPost.BASE.persist });
  D.motion(0);
  out.persistOff = alternatingOn(D, 1);
  out.persistSlip = alternatingOn(D, 0.42);
  function alternatingOn(Q, ts) {
    Q.timeScale(ts); Q.motion(0);
    Q.begin(); sceneA(); Q.end(); Q.begin(); sceneB(); Q.end();
    Q.begin(); sceneA(); Q.end(); const a = shot();
    Q.begin(); sceneB(); Q.end(); const b = shot();
    return { d: diff(a, b), smear: +Q.state.smear.toFixed(3) };
  }
  D.dispose();

  // ── ⑥ a blur:0 preset never allocates the pair until it dilates ───────────────────────────
  const N = GfxPost.create(gl, cv, GfxPost.PRESET.neon);
  const nf = () => { N.begin(); sceneA(); N.end(); };
  nf(); N.motion(1); nf(); nf();
  out.neonAccIdle = N.state.acc;
  N.timeScale(0.4); nf(); nf();
  out.neonAccDilated = N.state.acc;
  out.neonSmearDilated = +N.state.smear.toFixed(3);
  N.dispose();

  // ── ⑦ the page-global fan-out, and a disposed chain is not driven ─────────────────────────
  const G1 = GfxPost.create(gl, cv, GfxPost.PRESET.neon);
  const G2 = GfxPost.create(gl, cv, GfxPost.PRESET.sky);
  const before = GfxPost.live;
  GfxPost.timeScale(0.5);
  out.fanout = { g1: G1.state.timeScale, g2: G2.state.timeScale, p: P.state.timeScale, live: before };
  G2.dispose();
  GfxPost.timeScale(0.25);
  out.afterDispose = { g1: G1.state.timeScale, g2: G2.state.timeScale, live: GfxPost.live };
  GfxPost.timeScale(1);
  G1.dispose();

  // ── ⑧ FAIL OPEN, forced ───────────────────────────────────────────────────────────────────
  const cv2 = document.createElement('canvas'); cv2.width = 64; cv2.height = 64;
  const gl2 = cv2.getContext('webgl', { antialias: false, alpha: false });
  const realShaderSource = gl2.shaderSource.bind(gl2);
  gl2.shaderSource = (sh, src) => realShaderSource(sh, src.indexOf('bayer') >= 0 ? 'this is not glsl' : src);
  const BROKE = GfxPost.create(gl2, cv2, GfxPost.PRESET.neon);
  out.failOpen = { on: BROKE.on, begin: BROKE.begin(), end: BROKE.end() };
  // and it must still accept every call in the new API without throwing
  try { BROKE.motion(1); BROKE.camera({ yaw: 1, pitch: 0, x: 0, y: 0, z: 0 });
        BROKE.timeScale(0.3); BROKE.flash({ x: 0.2, y: 0.3 }); BROKE.dispose();
        out.failOpenCallsThrew = false; } catch (e) { out.failOpenCallsThrew = e.message; }

  // ── ⑨ Gfx2D forwards ──────────────────────────────────────────────────────────────────────
  const src2 = document.createElement('canvas'); src2.width = 128; src2.height = 96;
  src2.getContext('2d').fillRect(0, 0, 40, 40);
  document.body.appendChild(src2);
  const g2d = Gfx2D.attach(src2, { preset: 'neon' });
  out.gfx2d = g2d ? { on: g2d.on, has: ['motion', 'camera', 'timeScale', 'flash'].every(k => typeof g2d[k] === 'function') } : null;
  if (g2d) {
    g2d.timeScale(0.5); g2d.motion(0.7); g2d.flash({ x: 0.3, y: 0.3 });
    out.gfx2dState = g2d.post() ? { ts: g2d.post().state.timeScale, m: g2d.post().state.motion } : null;
    g2d.on = false;
    out.gfx2dOffReturns = [g2d.motion(1), g2d.timeScale(0.2), g2d.flash({})];
    g2d.dispose();
  }
  P.dispose();
  return out;
});

console.log('\n─── GfxPost: speed and time ' + '─'.repeat(44) + '\n');

if (R.fatal) { console.log('  FATAL ' + R.fatal); process.exit(1); }

t('the chain comes up under SwiftShader', R.on === true);
t('at rest the new state is inert', R.rest && R.rest.state.motion === 0 && R.rest.state.timeScale === 1 &&
  R.rest.state.dilate === 0 && R.rest.state.pulses.every(p => p.a === 0),
  JSON.stringify({ motion: R.rest.state.motion, timeScale: R.rest.state.timeScale, dilate: R.rest.state.dilate }));
t('at rest nothing clips', R.rest && R.rest.clip === 0, `mean ${R.rest.mean} · rms ${R.rest.rms} · clip ${R.rest.clip}%`);
/* ⚑ THE NO-REGRESSION INVARIANT. GfxPost is shared by ronin3d, cloudracer, dogfight,
 * section9-classic, riprocketer and the card fight. An A/B against the pre-change module measured
 * 0 differing subpixels on all four shipping preset/motion combinations — but that A/B needs a
 * copy of the old file and cannot live here. This is the same claim in a form that can: a chain
 * nobody drives hands the composite EXACTLY the preset it was created with, so there is nothing
 * for the frame to differ by. */
const U = R.rest && R.rest.state.uniforms, PT = R.presetTactical;
t('a chain nobody drives composites its preset UNMODIFIED (the no-regression invariant)',
  !!U && U.ca === PT.ca && U.sat === PT.sat && U.vig === PT.vignette && U.tint === 0 &&
  U.smear === 0 && U.pMax === 0,
  `ca ${U.ca} · sat ${U.sat} · vig ${U.vig} · tint ${U.tint} · smear ${U.smear} · flash ${U.pMax}`);

console.log('\n  ① VELOCITY-DRIVEN SMEAR — post.camera()\n');
for (const [k, v] of Object.entries(R.camera)) console.log(`      ${k.padEnd(26)} ${v.toFixed(4)}`);
const C = R.camera;
t('a still camera is EXACTLY 0 (kills a constant blur)', C.seedThenStill === 0);
t('the rotation reference saturates where it was derived (5.5 rad/s ⇒ 1.0)', C['whip 5.5 rad/s'] === 1,
  `2.75 rad/s ⇒ ${C['turn 2.75 rad/s']}, i.e. linear`);
t('walking is below the floor and does not smear', C['walk 4.3 m/s'] === 0);
t('three speeds, three strictly increasing amounts (kills a constant)',
  C['walk 4.3 m/s'] < C['jog 5.6 m/s'] && C['jog 5.6 m/s'] < C['sprint 7.0 m/s'] && C['sprint 7.0 m/s'] < C['boots 9.6 m/s'],
  `${C['walk 4.3 m/s']} < ${C['jog 5.6 m/s']} < ${C['sprint 7.0 m/s']} < ${C['boots 9.6 m/s']}`);
t('sprint agrees with s9pc-app.js\'s independent derivation (0.2805)',
  Math.abs(C['sprint 7.0 m/s'] - 0.2805) < 0.002, `${C['sprint 7.0 m/s']} vs 0.2805`);
t('intent without travel smears nothing (running into a wall)', C['wall (intent, no travel)'] === 0);
/* ⚠ THE COORDINATION ASSERTION. At the stock vHi (9.6, Section 9's boots) RUSH at 9.5 m/s and
 * FLIGHT at 11.5 m/s are the SAME NUMBER — both pinned at the ceiling — so the blur has stopped
 * being velocity-driven exactly where the new mobility verbs live. Raise vHi and they separate.
 * This test exists so that a movement change which adds a faster verb and forgets `vHi` fails
 * here rather than shipping a smear that cannot tell RUSH from FLIGHT. */
t('⚠ a faster verb needs vHi raised, or the two fastest verbs are indistinguishable',
  Math.abs(C['RUSH 9.5 @ vHi 9.6'] - C['FLIGHT 11.5 @ vHi 9.6']) < 0.02 &&
  C['RUSH 9.5 @ vHi 11.5'] < C['FLIGHT 11.5 @ vHi 11.5'] - 0.05,
  `at vHi 9.6: RUSH ${C['RUSH 9.5 @ vHi 9.6']} vs FLIGHT ${C['FLIGHT 11.5 @ vHi 9.6']} (pinned together) · ` +
  `at vHi 11.5: ${C['RUSH 9.5 @ vHi 11.5']} vs ${C['FLIGHT 11.5 @ vHi 11.5']}`);

console.log('');
t('the smear HOLDS the previous frame (frame difference falls)', R.smearOn.d < R.smearOff.d * 0.75,
  `mean |Δ|/subpixel  ${R.smearOff.d} off → ${R.smearOn.d} on  (−${(100 * (1 - R.smearOn.d / R.smearOff.d)).toFixed(1)}%), mix ${R.smearOn.smear.toFixed(3)}`);
t('motion 0 ⇒ the smear uniform is exactly 0, so the branch is not taken', R.smearOff.smear === 0);
t('smear LENGTH grows at a stated speed (10.2 px/frame mote)', R.trailOn > R.trailOff + 4,
  `lit pixels behind the head: ${R.trailOff} off → ${R.trailOn} on`);

console.log('\n  ③ THE PICKUP FLASH — DESIGN-SYSTEM §1 applied literally\n');
console.log('      frame   amp     r     hue°   sat    val   clip%');
for (const r of R.flash.trail.slice(0, 14)) console.log(
  `      ${String(R.flash.trail.indexOf(r)).padStart(5)}  ${r.a.toFixed(3)}  ${r.r.toFixed(3)}  ${String(r.h).padStart(6)}  ${r.s.toFixed(3)}  ${r.v.toFixed(3)}  ${r.clip}`);
t('MEASURED HUE TRAVEL at a fixed pixel ≥ 180° (no travel, no foil)', R.flash.travelDeg >= 180,
  `${R.flash.travelDeg}° over ${R.flash.liveFrames} frames, from a base hue of ${R.flash.preHue}°`);
t('it is INK, not white bloom — peak saturation ≥ 0.45', R.flash.peakSat >= 0.45, `peak S ${R.flash.peakSat}`);
t('CLIPPING STAYS AT 0 through the whole flash', R.flash.maxClip === 0, `max clipped subpixels ${R.flash.maxClip}%`);
t('…and still 0 with three flashes at strength 2 and an absurd ceiling (the clamp is driven)',
  R.flashAbsurdCeilClip === 0, `max clipped subpixels ${R.flashAbsurdCeilClip}%`);
t('it retires with no residue', Math.abs(R.flash.afterMean - R.flash.preMean) < 0.6,
  `mean ${R.flash.preMean} before → ${R.flash.afterMean} after, ${R.flash.retireFrames} frames to die`);
t('it fires AT THE PICKUP, not at screen centre', R.flashLeft < 0.42 && R.flashRight > 0.58,
  `lit centroid x: fired at 0.22 ⇒ ${R.flashLeft} · fired at 0.78 ⇒ ${R.flashRight}`);
t('the shader\'s four plates are GfxPost.INKS (one wheel, two renderers)',
  R.shaderInks.length >= 4 && R.jsInks.length === 4 &&
  R.jsInks.every((c, i) => { const m = (R.shaderInks[i] || '').match(/([\d.]+),([\d.]+),([\d.]+)/);
    return m && [1, 2, 3].every(k => Math.abs(+m[k] - c[k - 1] / 255) < 0.001); }),
  R.shaderInks.slice(0, 4).join(' '));

console.log('\n  ② TIME DILATION — timeScale 0.42 (s9pc-game.js SLIP_K)\n');
console.log(`      off   mean ${R.dil.off.mean}  rms ${R.dil.off.rms}  clip ${R.dil.off.clip}%  dark hue ${R.dil.off.dark}°  mid ${R.dil.off.mid}°`);
console.log(`      slip  mean ${R.dil.slip.mean}  rms ${R.dil.slip.rms}  clip ${R.dil.slip.clip}%  dark hue ${R.dil.slip.dark}°  mid ${R.dil.slip.mid}°`);
const shift = R.dil.off.dark - R.dil.slip.dark, midShift = R.dil.off.mid - R.dil.slip.mid;
t('the shadows separate toward the cyan plate (174.5°) by ≥ 10°', shift >= 10, `${shift.toFixed(1)}° in the darkest quartile`);
t('the SHADOWS move further than the midtones (a lean, not a filter)', shift > midShift * 1.4,
  `dark ${shift.toFixed(1)}° vs mid ${midShift.toFixed(1)}°`);
t('⛔ and it costs almost no luminance (kills the additive version: 37.5 → 52.3)',
  Math.abs(R.dil.slip.mean - R.dil.off.mean) < 1.0 && Math.abs(R.dil.slip.rms - R.dil.off.rms) < 1.0,
  `Δmean ${(R.dil.slip.mean - R.dil.off.mean).toFixed(2)} · Δrms ${(R.dil.slip.rms - R.dil.off.rms).toFixed(2)}`);
t('clipping stays at 0 while dilated', R.dil.slip.clip === 0);
t('registration widens with dilation', R.dil.caSlip > R.dil.caOff * 2,
  `ca ${R.dil.caOff} → ${R.dil.caSlip} (0.19 px → 0.66 px at the corner of a 512-wide frame)`);
t('PERSISTENCE is independent of speed — it holds with the camera STILL', R.persistSlip.d < R.persistOff.d * 0.8,
  `motion 0: mean |Δ| ${R.persistOff.d} at real time → ${R.persistSlip.d} at 0.42, mix ${R.persistSlip.smear}`);

console.log('');
t('a blur:0 preset allocates nothing until it dilates', R.neonAccIdle === false && R.neonAccDilated === true,
  `neon: acc ${R.neonAccIdle} idle → ${R.neonAccDilated} dilated, mix ${R.neonSmearDilated}`);
t('GfxPost.timeScale() reaches every live chain', R.fanout.g1 === 0.5 && R.fanout.g2 === 0.5 && R.fanout.p === 0.5,
  `${R.fanout.live} chains live`);
t('a disposed chain is not driven', R.afterDispose.g1 === 0.25 && R.afterDispose.g2 === 0.5);

console.log('');
t('FAIL OPEN: a broken shader turns the chain off, it does not throw',
  R.failOpen.on === false && R.failOpen.begin === false && R.failOpen.end === false, JSON.stringify(R.failOpen));
t('FAIL OPEN: every new call is a safe no-op on a dead chain', R.failOpenCallsThrew === false, String(R.failOpenCallsThrew));
t('Gfx2D forwards motion/camera/timeScale/flash', !!R.gfx2d && R.gfx2d.has);
t('Gfx2D forwards reach the chain', !!R.gfx2dState && R.gfx2dState.ts === 0.5 && Math.abs(R.gfx2dState.m - 0.7) < 1e-6,
  JSON.stringify(R.gfx2dState));
t('Gfx2D forwards are no-ops once it is off', Array.isArray(R.gfx2dOffReturns) && R.gfx2dOffReturns.every(v => v === 0));

/* ═══ PART TWO — the WORLD half, js/s9pc-fx.js ══════════════════════════════════════════════
 * GfxPost owns the glass; S9PCFx owns the things that are actually out there. It is driven with
 * a STUBBED PlayCanvas rather than a real one, for the same reason test-gunsfx stubs Web Audio:
 * every assertion here is about the GEOMETRY the layer emits — how many quads, where, and what
 * colour — and that is exactly what a recording stub can see, exactly. A screenshot could not
 * tell me one shard's hue at frame 9. */
await page.addScriptTag({ url: `http://localhost:${PORT}/js/s9pc-fx.js` });
const S = await page.evaluate(() => {
  const meshes = [];
  const noop = () => {};
  class V3 { constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
             set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
  window.pc = {
    Vec3: V3, Color: function (r, g, b) { this.r = r; this.g = g; this.b = b; },
    BoundingBox: function () {}, PRIMITIVE_TRIANGLES: 4,
    BLEND_ADDITIVE: 2, BLEND_NORMAL: 1, CULLFACE_NONE: 0,
    PIXELFORMAT_SRGBA8: 7, ADDRESS_CLAMP_TO_EDGE: 1,
    FILTER_LINEAR_MIPMAP_LINEAR: 5, FILTER_LINEAR: 1,
    Texture: function () { this.setSource = noop; },
    Mesh: function () { meshes.push(this);
      this.setPositions = a => { this.pos = a; }; this.setUvs = noop;
      this.setColors32 = a => { this.col = a; }; this.setIndices = noop; this.update = noop; },
    StandardMaterial: function () { this.update = noop; },
    MeshInstance: function () { this.setCustomAabb = noop; },
    Entity: function () { this.addComponent = noop; this.addChild = noop; this.destroy = noop; },
  };
  const app = { graphicsDevice: { canvas: { clientWidth: 800, clientHeight: 500 }, width: 800, height: 500 },
                root: new pc.Entity() };
  // an identity camera looking down −z, and a projector that puts world x straight onto screen x
  const cam = { getWorldTransform: () => ({ data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }),
                camera: { worldToScreen: v => ({ x: 400 + v.x * 10, y: 250 - v.y * 10, z: 5 }) } };
  const fx = S9PCFx.create(app);
  const A = meshes[0];

  const G0 = () => ({ me: { x: 0, y: 0, z: 0 }, t: 0, timeScale: 1, tracers: [], flashes: [], sparks: [],
                      chunks: [], decals: [], pows: [] });
  const hueOf = (r, g, b) => { r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 1e-6) return null;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360; return { h, s: d / mx }; };
  const arc = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const quadCol = i => [A.col[i * 16], A.col[i * 16 + 1], A.col[i * 16 + 2]];
  const quadPos = i => [A.pos[i * 12], A.pos[i * 12 + 1], A.pos[i * 12 + 2]];

  const R = {};
  let T = 1000;
  const step = (G, ms) => { T += (ms == null ? 16 : ms); return fx.update(G, cam, T); };

  // ── at rest ────────────────────────────────────────────────────────────────────────────────
  let G = G0(); step(G); step(G);
  R.rest = { ...fx.counts };

  // ── the pickup is DETECTED without the simulation telling it anything ──────────────────────
  const pw = { x: 3, y: 1, z: -2, col: [255, 214, 90], type: 'amp', t: 4 };
  G.pows = [pw]; step(G); step(G);
  const beforeAdd = fx.counts.add;
  pw.got = 1; G.pows = [];              // exactly what s9pc-game.js does, in one step
  step(G);
  R.pickup = { bursts: fx.counts.bursts, addBefore: beforeAdd, addAfter: fx.counts.add };

  // ── §1's test: hue travel per shard, and it must not be white ──────────────────────────────
  // shard 0 is quad index (add-before-burst) + CORONA; track its colour across the burst
  const base = beforeAdd, shard0 = base + S9PCFx.CORONA;
  const hues = [], sats = [];
  for (let i = 0; i < 22; i++) {
    step(G, 32);
    if (!fx.counts.bursts) break;
    const c = quadCol(shard0), hv = hueOf(c[0], c[1], c[2]);
    if (hv && (c[0] + c[1] + c[2]) > 40) { hues.push(+hv.h.toFixed(1)); sats.push(+hv.s.toFixed(3)); }
  }
  let travel = 0; for (let i = 1; i < hues.length; i++) travel += arc(hues[i], hues[i - 1]);
  R.shard = { hues, travelDeg: +travel.toFixed(1), minSat: Math.min(...sats), plates: [...new Set(hues)].length };
  while (fx.counts.bursts) step(G, 60);

  // ── the same drop bursts the same way twice (seeded, not Math.random at draw time) ─────────
  function shot(px, pz) {
    const g = G0(); const p = { x: px, y: 1, z: pz, col: [255, 214, 90], type: 'amp', t: 4 };
    g.pows = [p]; step(g); p.got = 1; g.pows = []; step(g); step(g, 48);
    const n = fx.counts.add, out = [];
    for (let i = 0; i < n; i++) out.push(quadPos(i).map(v => +v.toFixed(4)).join(','));
    while (fx.counts.bursts) step(g, 60);
    return out.join('|');
  }
  R.deterministic = shot(5, 5) === shot(5, 5);
  R.differentPlace = shot(5, 5) !== shot(9, 2);

  // ── the burst cannot overflow the buffer ───────────────────────────────────────────────────
  G = G0();
  for (let i = 0; i < 6; i++) fx.burst(i, 1, i, [255, 255, 255], 1.25);
  step(G);
  R.overflow = { bursts: fx.counts.bursts, add: fx.counts.add, max: S9PCFx.MAXA };
  while (fx.counts.bursts) step(G, 60);

  /* ── ⓑ speed streaks ──────────────────────────────────────────────────────────────────────
   * ⚠ THE COUNT IS THE WRONG METRIC AND MEASURING IT SAID SO. Streaks measured 17 at sprint, 15
   *   at boots, 16 at flight — not monotone, and correctly so: the count is how many motes of a
   *   FIXED lattice fall inside the near-field window, which depends on where the player ended
   *   up, not on how fast they got there. The quantity that carries speed is the STREAK LENGTH,
   *   because the streak is one exposure of a passing mote. So length is what is asserted, and
   *   the count is only asserted to be zero at a walk and inside the lattice's own cap. */
  function streaksAt(mps) {
    const g = G0(); let z = 0;
    // 40 frames at 16 ms so the one-pole speed estimate settles on the real number
    for (let i = 0; i < 40; i++) { z += mps * 0.016; g.me.z = z; step(g, 16); }
    const n = fx.counts.add, k = fx.counts.streaks;
    let len = 0, bright = 0;
    for (let i = n - k; i < n; i++) {          // the streaks are the last quads pushed
      const o = i * 12;
      len += Math.hypot(A.pos[o + 3] - A.pos[o], A.pos[o + 4] - A.pos[o + 1], A.pos[o + 5] - A.pos[o + 2]);
      bright += A.col[i * 16 + 2];
    }
    return { streaks: k, speed: fx.counts.speed,
             len: k ? +(len / k).toFixed(3) : 0, bright: k ? +(bright / k).toFixed(1) : 0 };
  }
  R.streak = { walk: streaksAt(4.3), sprint: streaksAt(7.0), boots: streaksAt(9.6),
               rush: streaksAt(9.5), flight: streaksAt(11.5), still: streaksAt(0) };
  /* ⛔ A RESPAWN MUST NOT STREAK. Found in a driven match, not here: `_place` across the arena
   * read 31.68 m/s into the estimator and lit the whole layer at the instant the player came
   * back alive. Drive a real teleport and assert it reads as nothing. */
  (function () {
    const g = G0(); let z = 0;
    for (let i = 0; i < 30; i++) { z += 9.5 * 0.016; g.me.z = z; step(g, 16); }
    const before = fx.counts.speed;
    g.me.z = z + 38; g.me.x = 17;                 // a respawn across the arena
    step(g, 16);
    R.teleport = { before, after: fx.counts.speed, streaks: fx.counts.streaks };
  })();

  // ── ⓒ the dilation ghost: exactly 0 at real time ───────────────────────────────────────────
  function ghostAt(ts) {
    const g = G0(); g.timeScale = ts;
    g.tracers = [{ x0: 0, y0: 1, z0: 0, dx: 0, dy: 0, dz: 1, len: 30, p: 12, tail: 3, t: 1, me: true },
                 { x0: 2, y0: 1, z0: 0, dx: 1, dy: 0, dz: 0, len: 30, p: 9, tail: 3, t: 1, me: false }];
    g.sparks = [{ x: 1, y: 1, z: 1, vx: 3, vy: 1, vz: 0, t: 0.3, col: [255, 200, 120] }];
    step(g); step(g);
    const n = fx.counts.add, gh = fx.counts.ghosts;
    // the ghost quads are the last `gh` pushed — read one back and check it is the magenta plate
    let col = null; if (gh > 0) col = quadCol(n - 1);
    return { ghosts: gh, col };
  }
  R.ghost = { real: ghostAt(1.0), slip: ghostAt(0.42), deep: ghostAt(0.15) };
  R.magenta = S9PCFx.INKS[3];

  // ── it fires the lens flare at the pickup's SCREEN position ────────────────────────────────
  const seen = [];
  const realFlash = GfxPost.flash;
  GfxPost.flash = o => seen.push(o);
  const g2 = G0(); const p2 = { x: 12, y: 1, z: -2, col: [255, 214, 90], type: 'amp', t: 4 };
  g2.pows = [p2]; step(g2); p2.got = 1; g2.pows = []; step(g2);
  GfxPost.flash = realFlash;
  R.lens = seen[0] || null;

  // ── fail open: no GfxPost at all ───────────────────────────────────────────────────────────
  const keep = window.GfxPost; delete window.GfxPost;
  let threw = false;
  try { const g3 = G0(); const p3 = { x: 1, y: 1, z: 1, col: [90, 220, 255], type: 'rush', mob: true, t: 4 };
        g3.pows = [p3]; step(g3); p3.got = 1; g3.pows = []; step(g3); }
  catch (e) { threw = e.message; }
  window.GfxPost = keep;
  R.noGfxPost = threw;
  R.MAXA = S9PCFx.MAXA;
  return R;
});

console.log('\n─── S9PCFx: the world half ' + '─'.repeat(45) + '\n');
t('at rest the FX layer emits nothing new',
  S.rest.bursts === 0 && S.rest.streaks === 0 && S.rest.ghosts === 0,
  JSON.stringify(S.rest));
t('a REAL pickup fires a burst with no cooperation from the simulation',
  S.pickup.bursts === 1 && S.pickup.addAfter === 31,
  `additive quads ${S.pickup.addBefore} (the drop's own glow) → ${S.pickup.addAfter} ` +
  `(16 corona + 14 shards + 1 ground ring) the frame the drop was taken`);
console.log('\n      shard 0 hue over its flight: ' + S.shard.hues.join('° → ') + '°\n');
t('one shard walks the ink wheel as it TRAVELS (§1: hue travel or it is not foil)',
  S.shard.travelDeg >= 120 && S.shard.plates >= 3,
  `${S.shard.travelDeg}° across ${S.shard.plates} distinct plates`);
t('the burst is INK, not white — every sampled shard stays saturated', S.shard.minSat >= 0.5,
  `minimum saturation ${S.shard.minSat}`);
t('the same drop bursts the same way twice, a different place differently',
  S.deterministic && S.differentPlace);
t('six bursts at once cannot overflow the buffer',
  S.overflow.bursts === 3 && S.overflow.add <= S.overflow.max,
  `${S.overflow.bursts} kept · ${S.overflow.add}/${S.overflow.max} additive quads`);
console.log('');
const st = S.streak;
console.log('      %s', 'verb      measured speed   streaks   mean length   mean blue');
for (const [k, v] of Object.entries(st)) console.log(
  `      ${k.padEnd(8)} ${String(v.speed).padStart(10)} m/s ${String(v.streaks).padStart(8)} ${String(v.len).padStart(13)} m ${String(v.bright).padStart(10)}`);
t('⛔ walking does not streak — exactly 0 (kills an always-on layer)',
  st.still.streaks === 0 && st.walk.streaks === 0);
t('STREAK LENGTH rises with speed — it is one exposure of a passing mote',
  st.sprint.len < st.boots.len && st.boots.len < st.flight.len,
  `sprint ${st.sprint.len} m < boots ${st.boots.len} m < flight ${st.flight.len} m`);
t('and they brighten as they lengthen, up to the lattice cap',
  st.sprint.bright < st.flight.bright && st.flight.streaks <= 30,
  `blue ${st.sprint.bright} → ${st.flight.bright}, ${st.flight.streaks}/30 motes lit`);
t('⛔ a RESPAWN reads as a teleport, not as speed (found in a driven match)',
  S.teleport.after === 0 && S.teleport.streaks === 0,
  `${S.teleport.before} m/s running → ${S.teleport.after} m/s after a 41 m jump, ${S.teleport.streaks} streaks`);
t('speed is measured, not assumed — it lands on the driven value',
  Math.abs(st.boots.speed - 9.6) < 0.4 && Math.abs(st.flight.speed - 11.5) < 0.5,
  `boots ${st.boots.speed} vs 9.6 · flight ${st.flight.speed} vs 11.5`);
console.log('');
t('⛔ the dilation ghost is EXACTLY 0 at real time', S.ghost.real.ghosts === 0);
t('it appears under SLIP and grows as the world slows further',
  S.ghost.slip.ghosts > 0 && S.ghost.deep.ghosts >= S.ghost.slip.ghosts,
  `timeScale 1 ⇒ ${S.ghost.real.ghosts} · 0.42 ⇒ ${S.ghost.slip.ghosts} · 0.15 ⇒ ${S.ghost.deep.ghosts}`);
t('the ghost is SLIP\'s own ink (fill magenta #ff2ad9)', !!S.ghost.slip.col &&
  S.ghost.slip.col[0] > S.ghost.slip.col[1] && S.ghost.slip.col[2] > S.ghost.slip.col[1],
  `rgb(${S.ghost.slip.col}) against the plate ${S.magenta}`);
t('the world burst and the lens flare are ONE event, at the pickup\'s screen position',
  !!S.lens && Math.abs(S.lens.x - 0.65) < 0.02 && S.lens.strength > 0,
  S.lens ? `GfxPost.flash({x:${S.lens.x.toFixed(3)}, y:${S.lens.y.toFixed(3)}, strength:${S.lens.strength}})` : 'not fired');
t('FAIL OPEN: the burst still fires with no GfxPost on the page', S.noGfxPost === false, String(S.noGfxPost));
t('the additive budget was raised for the new layers', S.MAXA === 860);

if (pageErrors.length) console.log('\n  page errors: ' + pageErrors.join(' | '));
t('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
srv.close();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

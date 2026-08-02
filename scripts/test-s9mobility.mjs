/* ⧗ SECTION 9 · MOBILITY TOKENS — the acceptance measurement (docs/DESIGN-SYSTEM.md §8.5).
 *
 * Five verbs were added to a shooter whose combat was tuned around a 1.3 s TTK. Two questions
 * decide whether that was allowed, and neither can be answered by reading the code:
 *
 *   1 ⛔ DID THE COMBAT SURVIVE? TTK is load-bearing (CLAUDE.md: 150 HP / 60 armour, headshot ×2.1
 *       with armour soaking 15% vs 45%). A speed power that makes a duel unwinnable breaks the
 *       thing the whole game was tuned for. So TTK is measured WITH EACH TOKEN LIVE and compared
 *       to TTK with none, through the real fireWeapon → raycast → applyDamage path.
 *   2 ⛔ IS IT REACHABLE? "Built ≠ reachable" is this project's single most common defect
 *       (ROADMAP §5.3), and a power-up nobody can pick up is its default failure. So every token
 *       is dropped onto the real floor and PICKED UP BY WALKING, driving the shipping pickup
 *       loop — never by calling a private setter.
 *
 * Everything else is a number rather than an adjective (ROADMAP §5.1): traversal over a measured
 * corridor, jump apex, hover and flight ceilings, the SLIP ratio, damage-on-target at 20 m, and
 * how many tokens a real 150 s match actually produces and who picks them up.
 *
 * ⚑ IT DRIVES `game.step(dt)` DIRECTLY, with `?hold=1` so the engine's own rAF does not also
 *   step. That is deliberate: headless rAF stalls between input events in this container
 *   (CLAUDE.md), and "I held the key and nothing moved" is an artifact of that, not a result.
 *   A fixed dt makes every number below reproducible.
 * ⚠ Frame timings are NOT measured here and would be meaningless if they were — SwiftShader.
 *   Distances, times and damage are simulation quantities and are exact.
 *
 * Usage: node scripts/test-s9mobility.mjs        (npm run test:mobility)
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}` + (detail ? `  — ${detail}` : '')); }
  else { fail++; console.log(`  FAIL ${name}` + (detail ? `  — ${detail}` : '')); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.skn': 'application/octet-stream', '.wld': 'application/octet-stream', '.mp4': 'video/mp4',
  '.avif': 'image/avif', '.ttf': 'font/ttf', '.obj': 'text/plain' };

/* Ephemeral port — several harnesses here bind a server and a fixed port makes two concurrent
 * runs look like a hang rather than like a collision (scripts/debug-games.mjs says the same). */
const srv = http.createServer((rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try { const d = readFileSync(join(ROOT, p));
    rs.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); rs.end(d); }
  catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

const { chromium } = require('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem('urm_admin_ok', '1'); } catch {} });
/* ⚠ A 404 IS NOT A JS ERROR, and lumping them together makes both useless. This page fetches
 * optional assets that fail open by design (a missing .wld simply omits an arena), so the two are
 * counted separately: page errors FAIL the run, 4xx are listed so a NEW one is visible. */
const pageErrs = [], notFound = [];
page.on('pageerror', e => pageErrs.push(String(e.message || e)));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pageErrs.push('console: ' + m.text()); });
page.on('response', r => { if (r.status() >= 400) notFound.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });

/* ?hold=1  the engine does not step the sim — this harness does, at a fixed dt
 * ?map=3    DUST BOWL: an open sand bowl, the one arena with a long clear straight line in it
 * ?bodies=0 ?post=0 ?shadows=0 ?ssao=0 ?q=low — nothing visual is being measured */
await page.goto(`http://127.0.0.1:${PORT}/section9.html?hold=1&map=3&bodies=0&post=0&shadows=0&ssao=0&q=low`,
  { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__s9pc && window.__s9pc.game, null, { timeout: 40000 });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The whole measurement runs INSIDE the page: one loaded scene, one game instance, one clock.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const R = await page.evaluate(async () => {
  const g = window.__s9pc.game, G = g.G;
  const MOBS = g.MOBS, KINDS = ['spring', 'rush', 'hover', 'flight', 'slip'];
  const out = { kinds: KINDS, mobs: {}, errors: [] };
  for (const k of KINDS) out.mobs[k] = { dur: MOBS[k].dur, wt: MOBS[k].wt, bloom: MOBS[k].bloom, heard: MOBS[k].heard };

  const DT = 1 / 120;
  const clearKeys = () => { for (const k in g.keys) g.keys[k] = false; g.mouse.left = false; g.mouse.right = false;
    g.touch.jump = false; g.touch.jumpHold = false; g.touch.fire = false; g.touch.sprint = false;
    g.touch.crouch = false; g.touch.move.active = false; };
  /* `powT = 1e9` stops the match's own drop cadence during the isolated measurements — a medkit
   * landing on the operative mid-TTK-run would silently change the number being measured. The
   * ECONOMY section below deliberately does NOT do this: there the cadence is the subject. */
  const fresh = () => { g.startMatch(false, 3, [], null); G.__hold = true; clearKeys(); G.pows.length = 0; G.powT = 1e9; };
  const me = () => G.me;
  // put the operative down at a known spot, on the floor, unarmed of any token
  function put(x, z, yaw) { const e = me(); e.mob = null; e.x = x; e.z = z; e.y = 0; e.y = g.supportY(e);
    e.vy = 0; e.onGround = true; e.flyBase = e.y; e.yaw = yaw == null ? 0 : yaw; e.pitch = 0;
    e.boost = 1; e.burning = false; e.hp = e.maxHp; e.armor = 60; e.iframe = 1e9; return e; }
  const step = n => { for (let i = 0; i < n; i++) g.step(DT); };

  // ── 0 · AT REST, EXACTLY ZERO ───────────────────────────────────────────────────────────────
  fresh(); put(9, 0);
  step(360);                                             // 3 s of standing still
  out.rest = { timeScale: G.timeScale, mob: me().mob, burning: !!me().burning,
    jumpV: g.jumpV(me()), JUMP: g.JUMP, anyMob: G.ents.some(e => !!e.mob),
    sparks: G.sparks.length };

  // ── 1 · TRAVERSAL over a measured corridor ──────────────────────────────────────────────────
  /* DUST BOWL's stands step inward to |x| ≈ 16.2 and the central plateau spans |x| ≤ 6, so the
   * line x = 9 from z = -19 to z = +19 is 38 m of clear sand. Measured, not assumed: every run
   * reports its own drift off that line and is rejected below if it wandered.
   *
   * ⚑ TWO MEASUREMENTS, BECAUSE THEY ANSWER DIFFERENT QUESTIONS, and running only the second one
   *   would have produced a WRONG number for RUSH. Sprint spends the boost meter (0.42/s), so a
   *   38 m sprint empties the tank a third of the way down and finishes at walking pace — a
   *   corridor time that is a mixture of two speeds. Reporting `rush ÷ sprint` off that mixture
   *   reads ×2.97, which is not the multiplier RUSH applies to anything.
   *     · RATE      — 1.5 s with the meter PINNED FULL. Isolates the speed the token grants.
   *                   (CLAUDE.md: isolate before tuning.)
   *     · TRAVERSAL — the whole 38 m with the real boost economy running. This is what a player
   *                   actually experiences, and it is FASTER than the rate multiplier because
   *                   RUSH gets you there before the meter runs dry. Both are true; they are
   *                   different claims and are printed as such. */
  const Z0 = -19, Z1 = 19, CORRIDOR = Z1 - Z0;
  function rate(opt) {
    opt = opt || {};
    fresh(); const e = put(9, Z0, 0);
    if (opt.token) g.giveMob(e, opt.token);
    clearKeys(); g.keys.w = true; if (opt.sprint) g.keys.shift = true; if (opt.jet) g.keys[' '] = true;
    let px = e.x, pz = e.z, dist = 0, burnD = 0, burnT = 0, drift = 0;
    const w0 = G.t, N = Math.round(1.5 * 120);
    for (let i = 0; i < N; i++) {
      e.boost = 1;                                       // the meter is not what is being measured
      g.step(DT);
      const d = Math.hypot(e.x - px, e.z - pz); dist += d;
      if (e.burning) { burnD += d; burnT += DT; }
      px = e.x; pz = e.z; drift = Math.max(drift, Math.abs(e.x - 9));
    }
    clearKeys();
    const realSec = N * DT, worldSec = G.t - w0;
    return { mps: +(dist / realSec).toFixed(3), worldMps: +(dist / worldSec).toFixed(3),
      burnMps: burnT > 0.2 ? +(burnD / burnT).toFixed(3) : null, drift: +drift.toFixed(2),
      dist: +dist.toFixed(2) };
  }
  function traverse(opt) {
    opt = opt || {};
    fresh(); const e = put(9, Z0, 0);
    if (opt.token) g.giveMob(e, opt.token);
    clearKeys(); g.keys.w = true; if (opt.sprint) g.keys.shift = true; if (opt.jet) g.keys[' '] = true;
    let n = 0, drift = 0;
    while (e.z < Z1 && n < 120 * 40) { g.step(DT); n++; drift = Math.max(drift, Math.abs(e.x - 9)); }
    clearKeys();
    return { ok: e.z >= Z1, sec: +(n * DT).toFixed(3), drift: +drift.toFixed(2), mps: +(CORRIDOR / (n * DT)).toFixed(3) };
  }
  out.rate = {
    walk:     rate({}),
    sprint:   rate({ sprint: true }),
    rush:     rate({ sprint: true, token: 'rush' }),
    rushWalk: rate({ token: 'rush' }),
    jet:      rate({ jet: true }),
    hover:    rate({ jet: true, token: 'hover' }),
    flight:   rate({ jet: true, token: 'flight' }),
    slip:     rate({ sprint: true, token: 'slip' }),
  };
  out.corridor = { metres: CORRIDOR,
    walk:   traverse({}),
    sprint: traverse({ sprint: true }),
    rush:   traverse({ sprint: true, token: 'rush' }),
    spring: traverse({ token: 'spring' }),
  };

  // ── 2 · JUMP APEX ───────────────────────────────────────────────────────────────────────────
  function apex(token) {
    fresh(); const e = put(9, 0);
    if (token) g.giveMob(e, token);
    clearKeys(); g.keys[' '] = true; g.step(DT); g.keys[' '] = false;   // a TAP, not a hold
    let hi = e.y, n = 0;
    while (n < 120 * 6 && (!e.onGround || n < 4)) { g.step(DT); hi = Math.max(hi, e.y); n++; }
    return { apex: +hi.toFixed(3), airborneSec: +(n * DT).toFixed(3), launchV: +g.jumpV(e).toFixed(3) };
  }
  out.jump = { none: apex(null), spring: apex('spring') };
  out.jump.predictNone = +(Math.pow(g.JUMP, 2) / (2 * g.GRAV)).toFixed(3);
  out.jump.predictSpring = +(Math.pow(g.JUMP * MOBS.spring.jump, 2) / (2 * g.GRAV)).toFixed(3);

  // ── 3 · SUSTAINED AIR: the jet, HOVER, FLIGHT ───────────────────────────────────────────────
  /* Same input for all three — hold the jump key — so the only difference measured is the machine
   * holding you up. `holdSec` is how long the token/tank kept the operative off the ground. */
  function air(token, secs) {
    fresh(); const e = put(9, 0);
    if (token) g.giveMob(e, token);
    clearKeys(); g.keys[' '] = true;
    let hi = 0, n = 0, airN = 0, kinds = new Set(); const N = Math.round(secs * 120);
    /* ⚠ `burnKind` is sampled WHILE BURNING, not at the end. Reading it after the run said "" for
     * the jet — correctly, because the jet's tank had been empty for four seconds by then. A
     * measurement taken at the wrong moment is a measurement of something else. */
    for (; n < N; n++) { g.step(DT); hi = Math.max(hi, e.y); if (!e.onGround) airN++;
      if (e.burning && e.burnKind) kinds.add(e.burnKind); }
    const yEnd = e.y, boost = e.boost, still = !!e.burning;
    clearKeys();
    return { ceiling: +hi.toFixed(3), yEnd: +yEnd.toFixed(3), holdSec: +(airN * DT).toFixed(2),
      boostLeft: +boost.toFixed(3), burningAtEnd: still, kind: [...kinds].join('+') || '' };
  }
  out.air = { jet: air(null, 6), hover: air('hover', 8), flight: air('flight', 5) };
  out.air.lid = +((g.MAP.ceilY || 6) - g.BOOTS.clear).toFixed(2);
  out.air.ceilY = g.MAP.ceilY;

  // ── 4 · SLIP is RELATIVE, and it composes ───────────────────────────────────────────────────
  {
    fresh(); const e = put(9, 0); g.giveMob(e, 'slip');
    const t0 = G.t; let real = 0; for (let i = 0; i < 120; i++) { g.step(DT); real += DT; }
    out.slip = { timeScale: +G.timeScale.toFixed(3), K: g.SLIP_K, rel: +g.SLIP_REL.toFixed(3),
      worldPerReal: +((G.t - t0) / real).toFixed(3) };
  }
  /* A BOT with a SLIP: the world does not slow, the bot speeds up by exactly the same ratio.
   * ⚑ Measured with Math.random pinned and with every other operative removed, so the bot is in
   *   plain patrol with no target — otherwise the number is AI noise, not a time ratio, and a
   *   ±35% tolerance around a claim about a constant would be meaningless. */
  function botPatrolMps(slip) {
    const realRandom = Math.random; Math.random = () => 0.5;
    try {
      fresh(); G.__hold = false;
      const b = G.ents.find(x => x.bot);
      for (const o of G.ents) if (o !== b) { o.alive = false; o.respawnT = 1e9; }   // nobody to fight
      b.x = 9; b.z = -14; b.y = 0; b.y = g.supportY(b); b.vy = 0; b.onGround = true;
      b.tgt = null; b.state = 'patrol'; b.wp = null; b.boost = 1;
      if (slip) g.giveMob(b, 'slip');
      let px = b.x, pz = b.z, d = 0; const w0 = G.t;
      for (let i = 0; i < 240; i++) { g.step(DT); d += Math.hypot(b.x - px, b.z - pz); px = b.x; pz = b.z;
        if (slip && (!b.mob || b.mob.t < 0.3)) g.giveMob(b, 'slip'); }
      const ws = G.timeScale; G.__hold = true;
      return { mps: d / (G.t - w0), worldScale: ws };
    } finally { Math.random = realRandom; }
  }
  {
    const base = botPatrolMps(false), sped = botPatrolMps(true);
    out.slipBot = { baseMps: +base.mps.toFixed(3), slipMps: +sped.mps.toFixed(3),
      ratio: +(sped.mps / Math.max(1e-6, base.mps)).toFixed(3),
      worldScaleWhileBotSlips: +sped.worldScale.toFixed(3) };
  }

  // ── 5 · TTK, through the real damage path, with each token live ─────────────────────────────
  /* ⚑ Math.random is pinned at 0.5 so `rnd(sp,-sp)` is exactly 0: every round is dead centre and
   *   TTK becomes a reproducible number rather than a distribution. That is the only way to make
   *   the claim "no token touches the damage model" a MEASUREMENT instead of an assertion about
   *   code. Restored immediately after. */
  function ttk(token) {
    const realRandom = Math.random;
    Math.random = () => 0.5;
    try {
      fresh();
      const e = put(9, 0, 0);                              // face +z, clear of the central plateau
      e.weapon = 1; e.mag = g.WEAPONS[1].mag; e.fireT = 0; e.reloading = false;
      if (token) g.giveMob(e, token);
      const foe = G.ents.find(x => x.bot);
      foe.x = 9; foe.z = 3; foe.y = 0; foe.y = g.supportY(foe); foe.vy = 0; foe.onGround = true;
      foe.alive = true; foe.hp = foe.maxHp; foe.armor = 55; foe.iframe = 0; foe.spawnT = 0;
      for (const o of G.ents) { if (o !== e && o !== foe) { o.alive = false; o.respawnT = 1e9; } }
      // aim at mid-chest: atan2(dy, dist)
      e.pitch = Math.atan2((foe.y + foe.h * 0.5) - (e.y + e.eye), 3);
      g.mouse.left = true;
      let n = 0, tFirst = -1, tDead = -1, shots0 = e.mag;
      while (n < 120 * 12 && foe.alive) {
        const magBefore = e.mag; const t0 = G.t;
        g.step(DT); n++;
        if (e.mag < magBefore && tFirst < 0) tFirst = t0;
        if (!foe.alive) tDead = G.t;
      }
      g.mouse.left = false;
      return { sec: tDead > 0 && tFirst >= 0 ? +(tDead - tFirst).toFixed(4) : null,
        rounds: shots0 - e.mag, killed: !foe.alive, hp: +foe.hp.toFixed(1) };
    } finally { Math.random = realRandom; }
  }
  out.ttk = { none: ttk(null) };
  for (const k of KINDS) out.ttk[k] = ttk(k);

  // ── 6 · THE MOBILITY TAX — damage actually put on a target at 20 m ───────────────────────────
  /* The one thing a token DOES cost. Real randomness here, 600 rounds, same aim point, same
   * range: `dmgPer100` is how much damage the operative lands per 100 rounds fired. */
  function onTarget(token, rounds, airborne) {
    fresh();
    const e = put(9, 0, 0);
    e.weapon = 1; e.mag = 1e9; e.fireT = 0; e.reloading = false;
    if (token) g.giveMob(e, token);
    const foe = G.ents.find(x => x.bot);
    foe.x = 9; foe.z = 20; foe.y = 0; foe.y = g.supportY(foe); foe.vy = 0; foe.onGround = true;
    foe.alive = true; foe.maxHp = 1e9; foe.hp = 1e9; foe.armor = 0; foe.iframe = 0; foe.spawnT = 0;
    for (const o of G.ents) { if (o !== e && o !== foe) { o.alive = false; o.respawnT = 1e9; } }
    e.pitch = Math.atan2((foe.y + foe.h * 0.45) - (e.y + e.eye), 20);
    const hp0 = foe.hp; let fired = 0, n = 0, airN = 0;
    g.mouse.left = true; if (airborne) g.keys[' '] = true;
    while (fired < rounds && n < 120 * 400) { const m0 = e.mag; g.step(DT); n++;
      if (e.mag < m0) { fired += (m0 - e.mag); if (!e.onGround) airN += (m0 - e.mag); }
      e.mag = 1e9; e.boost = 1;
      e.pitch = Math.atan2((foe.y + foe.h * 0.45) - (e.y + e.eye), 20);   // keep the aim honest as you rise
      if (token && !e.mob) g.giveMob(e, token); }
    g.mouse.left = false; g.keys[' '] = false;
    return { dmgPer100: +((hp0 - foe.hp) / Math.max(1, fired) * 100).toFixed(1), fired,
      airFrac: +(airN / Math.max(1, fired)).toFixed(2) };
  }
  /* ⚠ REAL randomness here, so this one has a noise floor — `none` is measured TWICE and the
   * spread between the two samples is printed, because a reader is entitled to know whether a 5%
   * difference means anything. (It does not; the differences that matter here are 19–44%.) */
  /* ⚠ 1200, NOT 600. At 600 the two identical baseline samples came back 13.9% apart — the hit is
   * a uniform spread over a 0.84 × 1.72 m silhouette AND a ~20% headshot fraction worth 2.1×, so
   * the per-round variance is large. A measurement whose noise floor is 14% cannot defend a 19%
   * claim. Doubling the rounds takes the 2-sample spread to ~5%, and the baseline used below is
   * the MEAN of the two, which halves it again. */
  const TAXN = 1200;
  out.tax = { none: onTarget(null, TAXN), none2: onTarget(null, TAXN) };
  for (const k of KINDS) out.tax[k] = onTarget(k, TAXN);
  /* ⚑ SPRING and HOVER carry NO ground tax on purpose — their bloom is 1.00 — because their cost
   * is that they put you IN THE AIR, where the boots' pre-existing ×1.9 already applies. Firing
   * from the ground would report "SPRING is free", which is true and misleading. So the same
   * measurement is taken again with the jump key held. */
  out.taxAir = { none: onTarget(null, 600, true), hover: onTarget('hover', 600, true) };

  // ── 7 · REACHABLE — dropped on the real floor, picked up by WALKING ──────────────────────────
  /* ⛔ The default failure of a power-up is that nobody can get to it. So this drives the shipping
   * pickup loop: a real drop, a real walk, a real `applyPow`. Nothing here calls giveMob. */
  function reach(kind) {
    fresh(); const e = put(9, 0, 0); e.mob = null;
    const pw = g.dropToken(kind, 9, 3.2, e.y);
    clearKeys(); g.keys.w = true;
    let n = 0; while (n < 120 * 6 && !(e.mob && e.mob.type === kind)) { g.step(DT); n++; }
    clearKeys();
    return { got: !!(e.mob && e.mob.type === kind), sec: +(n * DT).toFixed(2),
      left: e.mob ? +e.mob.t.toFixed(2) : 0, onField: G.pows.length, spawned: !!pw };
  }
  out.reach = {};
  for (const k of KINDS) out.reach[k] = reach(k);

  // ── 8 · ONE AT A TIME — a second token is refused and STAYS ON THE FLOOR ─────────────────────
  /* ⚠ The operative STANDS ON the drop for both halves. The first attempt walked forward for 3 s
   * and then asked whether the token was taken — 12 m past it. The refusal has to be observed
   * with the drop still underfoot, or "it was not taken" means "we left". */
  {
    fresh(); const e = put(9, 0, 0);
    g.giveMob(e, 'flight');
    const held = e.mob.type, tLeft = e.mob.t;
    g.dropToken('spring', 9, 0.2, e.y);
    clearKeys(); let n = 0; while (n < 120 * 2) { g.step(DT); n++; }
    out.oneAtATime = { stillHolding: e.mob ? e.mob.type : null, wasHolding: held,
      tokenStillOnField: G.pows.filter(p => p.type === 'spring' && !p.got).length,
      hadLeft: +tLeft.toFixed(1), stoodOnIt: G.pows.length > 0 };
    // and it IS taken the moment the live one is nearly spent — same drop, same spot, no walking
    if (e.mob) e.mob.t = 0.4;
    let m = 0; while (m < 120 * 2 && !(e.mob && e.mob.type === 'spring')) { g.step(DT); m++; }
    out.oneAtATime.takenWhenNearlySpent = !!(e.mob && e.mob.type === 'spring');
    out.oneAtATime.tookAfterSec = +(m * DT).toFixed(2);
  }

  // ── 9 · THE ECONOMY — a real 150 s match, drops counted, holders counted ──────────────────────
  /* Nothing is placed and nothing is given: the match's own drop cadence runs and the bots' own
   * AI competes for it. This is the answer to "how often is a power available per match" and to
   * "do the bots actually use them". */
  function economy(matches) {
    const drops = {}, taken = {}, byWho = { me: 0, bots: 0 };
    let botHeldSteps = 0, meHeldSteps = 0, steps = 0, botsEverHeld = new Set();
    for (let m = 0; m < matches; m++) {
      g.startMatch(false, 3, [], null); G.__hold = false; clearKeys();
      const seen = new Set(); const last = new Map();
      const N = Math.round(G.dur * 60);
      for (let i = 0; i < N; i++) {
        /* ⚑ THE PLAYER PLAYS. A standing operative would make "the bots take most of them" true
         * by default and prove nothing — the question is whether the field is CONTESTED. So the
         * player is driven the way a competent human plays a drop: run at the nearest one. */
        {
          const e = G.me;
          if (e && e.alive) {
            let best = null, bd = 1e9;
            for (const pw of G.pows) { if (pw.got) continue; const d = Math.hypot(pw.x - e.x, pw.z - e.z); if (d < bd) { bd = d; best = pw; } }
            const tx = best ? best.x : 0, tz = best ? best.z : 0;
            e.yaw = Math.atan2(tx - e.x, tz - e.z);
            g.keys.w = true; g.keys.shift = true;
          }
        }
        g.step(1 / 60); steps++;
        for (const pw of G.pows) if (!seen.has(pw)) { seen.add(pw); drops[pw.type] = (drops[pw.type] || 0) + 1; }
        for (const e of G.ents) {
          const cur = e.mob ? e.mob.type : null, prev = last.get(e) || null;
          if (cur && cur !== prev) { taken[cur] = (taken[cur] || 0) + 1;
            if (e.isMe) byWho.me++; else { byWho.bots++; botsEverHeld.add(e.name); } }
          last.set(e, cur);
          if (e.mob) { if (e.isMe) meHeldSteps++; else botHeldSteps++; }
        }
      }
    }
    G.__hold = true;
    return { matches, drops, taken, byWho, steps,
      botTokenSeconds: +(botHeldSteps / 60).toFixed(1), meTokenSeconds: +(meHeldSteps / 60).toFixed(1),
      distinctBotsHolding: botsEverHeld.size, bots: G.ents.length - 1 };
  }
  /* ⚠ SIX MATCHES, NOT THREE. At three, SLIP (weight 0.9 of a 16.7-point table, ≈ 0.8 drops a
   * match) came back ZERO once and the run failed on sampling noise rather than on anything being
   * wrong — a test that fails 9% of the time for no reason gets ignored, and then it is not a
   * test. Six puts the expected count near 5 and the chance of a zero under 1%. */
  out.economy = economy(6);

  // ── 10 · THE BOTS' OWN VERBS — can a bot SPEND an air token? ──────────────────────────────────
  /* Two situations, because they are two different rules and the first one measured ZERO on a flat
   * arena — three bots handed FLIGHT rose 1.84 m between them and never lit the jet once, because
   * the only launch reason was "something is above me". A token a bot cannot spend is a prize
   * nobody can reach, one layer down. */
  function botAir(mode) {
    g.startMatch(false, 3, [], null); G.__hold = false; clearKeys();
    const bots = G.ents.filter(e => e.bot), me0 = G.me;
    let base = {}, maxY = {}, kinds = new Set(), perches = 0;
    if (mode === 'perch') {                              // nobody to fight: the token buys HEIGHT
      me0.alive = false; me0.respawnT = 1e9;
    } else {                                             // CHASE: the player is up on the stands
      me0.x = -18.5; me0.z = 0; me0.y = 3.3; me0.vy = 0; me0.onGround = true; me0.iframe = 1e9;
      for (const b of bots) { b.x = -12 + (bots.indexOf(b) * 2); b.z = 0; b.y = 0; b.y = g.supportY(b); b.vy = 0; b.onGround = true; b.tgt = me0; }
    }
    for (const b of bots) { g.giveMob(b, 'flight'); base[b.name] = b.y; maxY[b.name] = b.y; }
    for (let i = 0; i < 60 * 14; i++) {
      if (mode !== 'perch') { me0.y = 3.3; me0.vy = 0; me0.onGround = true; me0.hp = me0.maxHp; }
      g.step(1 / 60);
      for (const b of bots) { maxY[b.name] = Math.max(maxY[b.name], b.y);
        if (b.burning && b.burnKind) kinds.add(b.burnKind);
        if (b.perchBox) perches++;
        if (!b.mob) g.giveMob(b, 'flight'); }
    }
    G.__hold = true;
    const rise = Object.keys(maxY).map(k => maxY[k] - base[k]);
    return { maxRise: +Math.max(...rise).toFixed(2), kinds: [...kinds], perchSteps: perches };
  }
  out.botAir = { perch: botAir('perch'), chase: botAir('chase') };

  return out;
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n⧗ SECTION 9 · MOBILITY TOKENS — measured in a driven match (DUST BOWL, ceilY '
  + R.air.ceilY + ', lid ' + R.air.lid + ' m)\n');

// ── at rest, zero ────────────────────────────────────────────────────────────────────────────
console.log('AT REST');
t('timeScale is exactly 1 with no token live', R.rest.timeScale === 1, 'timeScale ' + R.rest.timeScale);
t('nobody holds a token on a fresh drop', R.rest.anyMob === false && R.rest.mob === null);
t('jump velocity is the untouched constant', R.rest.jumpV === R.rest.JUMP, R.rest.jumpV + ' m/s');
t('standing still emits no trail', R.rest.sparks === 0, R.rest.sparks + ' sparks');

// ── traversal ────────────────────────────────────────────────────────────────────────────────
const RT = R.rate, C = R.corridor;
console.log('\nSPEED · rate over 1.5 s with the boost meter pinned full (isolating the token from the fuel)');
for (const [k, v] of Object.entries(RT))
  console.log(`  ${k.padEnd(9)} ${String(v.mps).padStart(6)} m/s`
    + (v.burnMps != null ? `  ·  while burning ${String(v.burnMps).padStart(6)} m/s` : '                            ')
    + `  ·  world ${String(v.worldMps).padStart(6)} m/s  ·  drift ${v.drift} m`);
const xSprint = RT.rush.mps / RT.sprint.mps, xWalk = RT.rushWalk.mps / RT.walk.mps;
t('every rate run stayed in the corridor', Object.values(RT).every(v => v.drift < 1.0));
t('the base speeds are the shipping ones (walk 4.3 / sprint 7.0)',
  near(RT.walk.mps, 4.3, 0.06) && near(RT.sprint.mps, 7.0, 0.08), `${RT.walk.mps} · ${RT.sprint.mps} m/s`);
t('RUSH multiplies GROUND speed by 2.2×', near(xSprint, 2.2, 0.05) && near(xWalk, 2.2, 0.05),
  `sprint ${RT.sprint.mps} → ${RT.rush.mps} (×${xSprint.toFixed(2)}) · walk ${RT.walk.mps} → ${RT.rushWalk.mps} (×${xWalk.toFixed(2)})`);
t('FLIGHT > jet > HOVER on sustained airborne lateral',
  RT.flight.burnMps > RT.jet.burnMps && RT.jet.burnMps > RT.hover.burnMps,
  `flight ${RT.flight.burnMps} > jet ${RT.jet.burnMps} > hover ${RT.hover.burnMps} m/s`);
t('SLIP moves you 2.38× further per WORLD second', near(RT.slip.worldMps / RT.sprint.worldMps, 2.381, 0.06),
  `${RT.sprint.worldMps} → ${RT.slip.worldMps} world-m/s (×${(RT.slip.worldMps / RT.sprint.worldMps).toFixed(2)})`);
t('…and not one metre per second faster in real time', near(RT.slip.mps, RT.sprint.mps, 0.15),
  `${RT.sprint.mps} vs ${RT.slip.mps} m/s — SLIP does not speed YOU up, it slows the world`);

console.log(`\nTRAVERSAL · the whole ${C.metres} m corridor with the real boost economy running`);
for (const [k, v] of Object.entries(C)) { if (k === 'metres') continue;
  console.log(`  ${k.padEnd(7)} ${String(v.sec).padStart(6)} s  (${v.mps} m/s average) ${v.ok ? '' : '  (DID NOT FINISH)'}`); }
t('every corridor run completed', Object.entries(C).every(([k, v]) => k === 'metres' || v.ok));
t('RUSH is worth MORE in practice than its multiplier — it beats the meter running dry',
  C.rush.sec < C.sprint.sec / 2.2,
  `sprint ${C.sprint.sec}s → rush ${C.rush.sec}s = ×${(C.sprint.sec / C.rush.sec).toFixed(2)} end-to-end, vs the ×2.2 rate`);

// ── jump ─────────────────────────────────────────────────────────────────────────────────────
console.log('\nJUMP APEX');
console.log(`  none    ${R.jump.none.apex} m  (v ${R.jump.none.launchV} m/s, predicted ${R.jump.predictNone}) · ${R.jump.none.airborneSec} s airborne`);
console.log(`  SPRING  ${R.jump.spring.apex} m  (v ${R.jump.spring.launchV} m/s, predicted ${R.jump.predictSpring}) · ${R.jump.spring.airborneSec} s airborne`);
t('the base jump is unchanged', near(R.jump.none.apex, R.jump.predictNone, 0.05));
t('SPRING clears the 3.2 m sniper ledge and the 3.85 m mezzanine from flat ground',
  R.jump.spring.apex > 3.85, R.jump.spring.apex + ' m');
t('SPRING is a bigger push, not a different physics', near(R.jump.spring.apex, R.jump.predictSpring, 0.06),
  `apex = v²/2g holds to ${Math.abs(R.jump.spring.apex - R.jump.predictSpring).toFixed(3)} m`);

// ── sustained air ────────────────────────────────────────────────────────────────────────────
console.log('\nSUSTAINED AIR (hold the same key; only the machine differs)');
for (const [k, v] of Object.entries(R.air)) {
  if (k === 'lid' || k === 'ceilY') continue;
  console.log(`  ${k.padEnd(7)} ceiling ${String(v.ceiling).padStart(6)} m · held off the ground ${v.holdSec}s · boost left ${v.boostLeft} · burnKind "${v.kind}"`);
}
t('the jet still runs out of BOOST, not of clock', R.air.jet.boostLeft <= 0.03 && R.air.jet.ceiling < 5.0,
  `ceiling ${R.air.jet.ceiling} m, tank empty (${R.air.jet.boostLeft})`);
t('HOVER is LOW: it holds ~2.4 m over the surface you left', near(R.air.hover.ceiling, 2.4, 0.35),
  R.air.hover.ceiling + ' m');
t('HOVER costs no boost — it carries its own tank', R.air.hover.boostLeft >= 0.99, 'boost ' + R.air.hover.boostLeft);
t('HOVER holds you up for its whole duration', R.air.hover.holdSec >= 7.5, R.air.hover.holdSec + ' s of 8 s driven');
t('FLIGHT reaches the arena lid', near(R.air.flight.ceiling, R.air.lid, 0.25),
  `${R.air.flight.ceiling} m vs lid ${R.air.lid} m`);
t('FLIGHT never crests the perimeter wall', R.air.flight.ceiling < R.air.ceilY,
  `${R.air.flight.ceiling} < ceilY ${R.air.ceilY}`);
t('the three machines are distinguishable in the state a renderer reads',
  R.air.jet.kind === 'jet' && R.air.hover.kind === 'hover' && R.air.flight.kind === 'flight');

// ── slip ─────────────────────────────────────────────────────────────────────────────────────
console.log('\nSLIP · relative time');
console.log(`  player holds it: world clock ×${R.slip.timeScale} (K ${R.slip.K}), world advanced ${R.slip.worldPerReal} s per real second`);
console.log(`  bot holds it:    world clock ×${R.slipBot.worldScaleWhileBotSlips} · bot ${R.slipBot.baseMps} → ${R.slipBot.slipMps} m/s (×${R.slipBot.ratio})`);
t('a player SLIP slows the world to 0.42', near(R.slip.timeScale, R.slip.K, 0.001) && near(R.slip.worldPerReal, R.slip.K, 0.01));
t('a BOT slip does not slow the world', R.slipBot.worldScaleWhileBotSlips === 1);
t('a bot gets the SAME relative advantage the player gets', near(R.slipBot.ratio, R.slip.rel, 0.06),
  `bot ×${R.slipBot.ratio} vs player ×${R.slip.rel} — same power, described from outside`);

// ── TTK ──────────────────────────────────────────────────────────────────────────────────────
console.log('\n⛔ TTK — the load-bearing number (FULL TILT, body hits, 150 HP + 55 armour, 3 m, spread pinned)');
for (const k of ['none', ...R.kinds]) {
  const v = R.ttk[k];
  console.log(`  ${k.padEnd(7)} ${v.sec == null ? '   —   ' : (v.sec.toFixed(3) + ' s')} · ${v.rounds} rounds · killed ${v.killed}`);
}
t('the baseline TTK is the shipping ~1.3 s', R.ttk.none.killed && near(R.ttk.none.sec, 1.30, 0.12),
  R.ttk.none.sec + ' s over ' + R.ttk.none.rounds + ' rounds');
/* ⚠ ROUNDS must be EXACT — that is the claim, and it is what makes "the damage model is
 * untouched" a measurement. The SECONDS are allowed one simulation step of slack for SLIP alone,
 * because SLIP moves the trigger onto a 0.42× clock and the shot boundaries therefore land on
 * different sub-steps: the measured drift is 2.8 ms on a 1.31 s duel, i.e. a third of one step. */
for (const k of R.kinds) {
  const v = R.ttk[k], d = v.sec == null ? Infinity : Math.abs(v.sec - R.ttk.none.sec);
  t(`TTK is IDENTICAL with ${k.toUpperCase()} live`,
    v.killed && v.rounds === R.ttk.none.rounds && d < 1 / 120,
    `${v.sec} s / ${v.rounds} rounds vs ${R.ttk.none.sec} s / ${R.ttk.none.rounds} — Δ ${(d * 1000).toFixed(1)} ms`);
}

// ── the tax ──────────────────────────────────────────────────────────────────────────────────
const BASE = (R.tax.none.dmgPer100 + R.tax.none2.dmgPer100) / 2;
const noise = Math.abs(R.tax.none.dmgPer100 - R.tax.none2.dmgPer100) / BASE * 100;
console.log('\nTHE MOBILITY TAX — damage put on a 20 m target per 100 rounds fired');
console.log(`  none    ${BASE.toFixed(1)}  (mean of two ${R.tax.none.fired}-round samples: `
  + `${R.tax.none.dmgPer100} / ${R.tax.none2.dmgPer100} — a ${noise.toFixed(1)}% noise floor)`);
for (const k of R.kinds) console.log(`  ${k.padEnd(7)} ${String(R.tax[k].dmgPer100).padStart(6)}  `
  + `(${(100 * R.tax[k].dmgPer100 / BASE - 100).toFixed(0)}%)   bloom ×${R.mobs[k].bloom.toFixed(2)}`);
const taxed = R.kinds.filter(k => R.mobs[k].bloom > 1.001);
t('the tax measurement is above its own noise floor', noise < 12, `±${noise.toFixed(1)}% between two identical runs`);
t('every token whose bloom > 1 actually costs damage-on-target',
  taxed.every(k => R.tax[k].dmgPer100 < BASE * 0.85),
  taxed.map(k => `${k} ${R.tax[k].dmgPer100} vs ${BASE.toFixed(0)} (−${(100 - 100 * R.tax[k].dmgPer100 / BASE).toFixed(0)}%)`).join(' · '));
t('the tax is a tax, not a disarm (all still land > 45% of baseline)',
  R.kinds.every(k => R.tax[k].dmgPer100 > BASE * 0.45));
console.log(`  AIRBORNE (SPRING and HOVER carry no GROUND tax; their cost is being off the floor,`
  + ` where the boots' pre-existing ×1.9 bites): none ${R.taxAir.none.dmgPer100} · hover ${R.taxAir.hover.dmgPer100}`
  + `  (${(100 * R.taxAir.hover.dmgPer100 / BASE).toFixed(0)}% of the grounded baseline,`
  + ` ${(100 * R.taxAir.hover.airFrac).toFixed(0)}% of rounds fired in the air)`);
t('firing from the air costs real damage — that IS the tax on SPRING and HOVER',
  R.taxAir.hover.dmgPer100 < BASE * 0.85,
  `${R.taxAir.hover.dmgPer100} vs ${BASE.toFixed(0)} on the ground`);

// ── reachable ────────────────────────────────────────────────────────────────────────────────
console.log('\n⛔ REACHABLE — every token dropped on the real floor and picked up by WALKING');
for (const k of R.kinds) { const v = R.reach[k];
  console.log(`  ${k.padEnd(7)} ${v.got ? 'PICKED UP' : 'NOT REACHED'} in ${v.sec}s · ${v.left}s left on the clock`); }
for (const k of R.kinds) t(`${k.toUpperCase()} is reachable in a driven match`, R.reach[k].got, R.reach[k].sec + ' s to walk onto it');

console.log('\nONE AT A TIME');
console.log(`  holding FLIGHT (${R.oneAtATime.hadLeft}s) and walking over a SPRING → still holding ${R.oneAtATime.stillHolding},`
  + ` SPRING still on the floor: ${R.oneAtATime.tokenStillOnField}`);
t('a live token refuses a second one', R.oneAtATime.stillHolding === 'flight');
t('…and the refused token is NOT eaten — it stays for someone else', R.oneAtATime.tokenStillOnField === 1);
t('…and is taken the instant the live one is nearly spent', R.oneAtATime.takenWhenNearlySpent,
  'taken ' + R.oneAtATime.tookAfterSec + ' s later, standing on the same spot');

// ── economy ──────────────────────────────────────────────────────────────────────────────────
const E = R.economy;
console.log(`\nTHE ECONOMY — ${E.matches} full 150 s matches, ${E.bots} bots, nothing placed and nothing given`);
const mobKinds = R.kinds;
const totalDrops = Object.values(E.drops).reduce((a, b) => a + b, 0);
console.log('  drops per match:  ' + Object.entries(E.drops).map(([k, n]) => `${k} ${(n / E.matches).toFixed(1)}`).join(' · ')
  + `  (total ${(totalDrops / E.matches).toFixed(1)})`);
console.log('  taken per match:  ' + Object.entries(E.taken).map(([k, n]) => `${k} ${(n / E.matches).toFixed(1)}`).join(' · '));
console.log(`  who took them:    you ${(E.byWho.me / E.matches).toFixed(1)} · bots ${(E.byWho.bots / E.matches).toFixed(1)} per match`
  + `  ·  token-seconds held: you ${(E.meTokenSeconds / E.matches).toFixed(1)}s, bots ${(E.botTokenSeconds / E.matches).toFixed(1)}s`);
console.log('  ⚠ the driven player here does NOTHING BUT COLLECT — it sprints at the nearest drop for the'
  + '\n    whole match and never fights. That is the worst case for the bots, who are also in a firefight,'
  + '\n    so this share is a floor rather than a typical split.');
const mobDropsPerMatch = mobKinds.reduce((a, k) => a + (E.drops[k] || 0), 0) / E.matches;
t('every one of the five actually drops in a real match',
  mobKinds.every(k => (E.drops[k] || 0) > 0), mobKinds.map(k => `${k} ${E.drops[k] || 0}`).join(' · '));
t('mobility tokens are a regular event, not a rarity (≥ 4 per match)', mobDropsPerMatch >= 4,
  mobDropsPerMatch.toFixed(1) + ' per match');
t('⚑ BOTS COPE — bots pick tokens up on their own', E.byWho.bots > 0,
  `${(E.byWho.bots / E.matches).toFixed(1)} bot pickups per match across ${E.distinctBotsHolding} distinct operatives`);
t('…and the field is CONTESTED, not farmed — bots take ≥ 20% even against a pure collector',
  E.byWho.bots >= (E.byWho.bots + E.byWho.me) * 0.20,
  `bots ${E.byWho.bots} / you ${E.byWho.me} = ${(100 * E.byWho.bots / (E.byWho.bots + E.byWho.me)).toFixed(0)}% to the bots`
  + ` · token-seconds ${(100 * E.botTokenSeconds / (E.botTokenSeconds + E.meTokenSeconds)).toFixed(0)}% bots`);
t('this is a MOVEMENT economy — nothing here touched health, ammo or armour rules',
  ['med', 'armor', 'ammo'].every(k => (E.drops[k] || 0) > 0), 'the old drop table still runs');

console.log('\n⚑ BOTS SPENDING AN AIR TOKEN — every bot handed FLIGHT, 14 s, two situations');
console.log(`  perch (a live free-for-all, so the token has to buy HEIGHT mid-fight): rose ${R.botAir.perch.maxRise} m`
  + ` · lit ${R.botAir.perch.kinds.join('+') || 'nothing'} · had a perch picked on ${R.botAir.perch.perchSteps} steps`);
console.log(`  chase (the player is on the 3.3 m stands):                             rose ${R.botAir.chase.maxRise} m`
  + ` · lit ${R.botAir.chase.kinds.join('+') || 'nothing'}`);
t('a bot with an air token takes the HIGH GROUND on its own', R.botAir.perch.maxRise > 1.4,
  R.botAir.perch.maxRise + ' m of climb');
t('…and it lights the FLIGHT jet doing it', R.botAir.perch.kinds.indexOf('flight') >= 0,
  R.botAir.perch.kinds.join('+') || 'nothing');
t('a bot chases a target that is above it', R.botAir.chase.maxRise > 1.4 && R.botAir.chase.kinds.indexOf('flight') >= 0,
  `${R.botAir.chase.maxRise} m · ${R.botAir.chase.kinds.join('+') || 'nothing'}`);

// ── page health ──────────────────────────────────────────────────────────────────────────────
console.log('');
if (notFound.length) console.log('  4xx (fail-open assets, listed so a NEW one is visible): '
  + [...new Set(notFound)].join(' · '));
t('no JS errors during the whole run', pageErrs.length === 0, pageErrs.slice(0, 3).join(' | ') || 'clean');

await browser.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
